/**
 * MusicBrainz lazy-fill 리졸버 워커 (Phase D)
 *
 * mb_resolve_queue 를 소비해 canonical 층(mb_artist / mb_release_group / mb_recording)을
 * 채우고 mb_spotify_map 에 Spotify ID <-> MBID 매핑을 남긴다.
 *
 * 왜 온디맨드인가: MusicBrainz 전체 덤프는 Postgres 수십 GB 라 Supabase 무료/Pro 티어에
 * 들어가지 않는다. 실제로 사용자가 만진 아티스트만 채우면 수십 MB 로 끝난다.
 * MB core data 는 CC0(퍼블릭 도메인)이므로 영구 저장·상업 이용에 제약이 없다.
 *
 * 주의: MB 의 tags/genres 는 CC-BY-NC-SA 라 광고 서비스에서 쓸 수 없다.
 *       inc=tags 를 절대 요청하지 않는다. 장르는 별도 소스로 채운다.
 *
 * 사용법:
 *   npm run mb:seed     ARTIST_TRANSLATION_MAP + curatedArtists + 기존 캐시를 큐에 투입
 *   npm run mb:resolve  큐를 소비 (기본 200 건)
 *   npm run mb:albums   확인된 아티스트의 앨범 매핑·발매판 다시 채우기
 *   npm run mb:tracks   발매판 트랙리스트 채우기 (트랙 키 = MB 레코딩 ID)
 */
import { createAdminClient } from "../src/utils/supabase/admin";
import { ARTIST_TRANSLATION_MAP } from "../src/utils/artistNames";
import { curatedArtists } from "../src/utils/curatedArtists";

// MusicBrainz 는 IP 당 평균 1 req/s 를 허용하고 User-Agent 를 필수로 요구한다.
const MB_UA = "Sortify/1.0 ( https://sortify.kr )";
const MB_DELAY_MS = 1200;
const BATCH = Number(process.env.MB_BATCH ?? 200);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let mbCalls = 0;

async function mb(path: string, tries = 4): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
      headers: { "User-Agent": MB_UA },
    });
    mbCalls++;
    if (res.ok) {
      await sleep(MB_DELAY_MS);
      return res.json();
    }
    if (res.status === 503 || res.status === 429) {
      // MB 의 throttle. 지수적으로 물러난다.
      await sleep(3000 * (i + 1));
      continue;
    }
    await sleep(MB_DELAY_MS);
    return { __status: res.status };
  }
  return { __throttled: true };
}

/**
 * Supabase(PostgREST)는 한 요청에 최대 1000 행만 돌려준다. .limit(5000) 을 줘도 조용히 잘린다.
 * 실제로 첫 시드가 캐시 아티스트 2587 명 중 1000 명만 큐에 넣었다. 전부 읽어야 하는 곳은 이걸 쓴다.
 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const hasHangul = (s: string) => /[가-힣]/.test(s || "");

/** 한글 -> 영문 맵을 뒤집어 영문 -> 한글도 찾을 수 있게 한다 */
const EN_TO_KO: Record<string, string> = {};
for (const [ko, en] of Object.entries(ARTIST_TRANSLATION_MAP)) {
  if (!EN_TO_KO[en.toLowerCase()]) EN_TO_KO[en.toLowerCase()] = ko;
}

/**
 * 매핑 1 단계: Spotify URL relationship.
 * 실측 정확도 100%, 인기 한국 아티스트 커버리지 80%.
 */
async function byUrlRelationship(spotifyId: string): Promise<string | null> {
  const url = `https://open.spotify.com/artist/${spotifyId}`;
  const data = await mb(`url?resource=${encodeURIComponent(url)}&inc=artist-rels&fmt=json`);
  if (data?.__throttled || data?.__status) return null;
  const rel = (data.relations || []).find((r: any) => r.artist?.id);
  return rel?.artist?.id ?? null;
}

/**
 * 매핑 2 단계: 한글/영문 양방향 이름 검색.
 * 실측 정확도 57% (빌스택스->Vasco Rossi, 그레이->David Gray 같은 오매칭)라
 * confidence='name' 으로 격리하고 자동 채택하지 않는다.
 */
async function byName(name: string): Promise<{ mbid: string; matched: string } | null> {
  const candidates = [name];
  const alt = hasHangul(name)
    ? ARTIST_TRANSLATION_MAP[name]
    : EN_TO_KO[name.toLowerCase()];
  if (alt) candidates.push(alt);

  for (const q of candidates) {
    const data = await mb(`artist/?query=${encodeURIComponent(`artist:"${q}"`)}&fmt=json&limit=5`);
    if (data?.__throttled || data?.__status) continue;
    const hits = (data.artists || []).filter((a: any) => a.score >= 88);
    if (hits.length === 0) continue;
    // 동명이인 충돌이 실측 16% 다. 한/일 아티스트를 우선한다.
    const asian = hits.filter((a: any) => a.country === "KR" || a.country === "JP");
    const pick = asian[0] || hits[0];
    if (pick) return { mbid: pick.id, matched: pick.name };
  }
  return null;
}

/**
 * 아티스트 1 명의 canonical 행 + 디스코그래피를 채운다. MB 호출 2~3 회.
 * trusted(url_rel/manual 로 확인된 아티스트)일 때만 발매판 매핑을 남긴다 — 이름 매칭(정확도 57%)
 * 아티스트의 트랙리스트까지 받느라 MB 호출을 쓸 이유가 없다.
 */
async function fillArtist(mbid: string, trusted: boolean) {
  // inc 에 tags 를 넣지 않는다 (CC-BY-NC-SA).
  const a = await mb(`artist/${mbid}?inc=aliases&fmt=json`);
  if (a?.__throttled || a?.__status) return { ok: false, releaseGroups: 0, albums: 0 };

  const aliases = (a.aliases || []).map((x: any) => ({ name: x.name, locale: x.locale, type: x.type }));
  const koAlias =
    aliases.find((x: any) => x.locale === "ko")?.name ??
    aliases.find((x: any) => hasHangul(x.name))?.name ??
    (hasHangul(a.name) ? a.name : EN_TO_KO[String(a.name).toLowerCase()]) ??
    null;

  const supabase = createAdminClient();
  const { error: artErr } = await supabase.from("mb_artist").upsert({
    mbid,
    name: a.name,
    sort_name: a["sort-name"] ?? null,
    country: a.country ?? null,
    aliases,
    name_ko: koAlias,
    updated_at: new Date().toISOString(),
  }, { onConflict: "mbid" });
  if (artErr) {
    console.error(`  ! mb_artist upsert 실패: ${artErr.message}`);
    return { ok: false, releaseGroups: 0, albums: 0 };
  }

  // release(발매판) 단위로 browse 한다. release-group 단위가 아닌 이유:
  //   MB 의 Spotify "앨범" URL 관계는 release-group 이 아니라 release 에 붙어 있다
  //   (실측: release-group browse + url-rels 는 NewJeans 0/25, release browse 는 18/26).
  //   release 에 embed 된 release-group 객체에 title/primary-type/first-release-date 가
  //   전부 들어 있어서, 이 호출 하나로 RG 행과 앨범 매핑을 동시에 얻는다.
  //   추가 Spotify 호출 0 회, 추가 MB 호출도 사실상 0 회다.
  const rgById = new Map<string, any>();
  const albumMap = new Map<string, string>();  // spotify album id -> rg mbid
  const albumRelease = new Map<string, { release: string; rg: string }>();  // spotify album id -> 발매판

  // 다작 아티스트는 release 가 수백 개다. 5 페이지(500 개)에서 자른다.
  // ponytail: 500 넘는 아티스트는 최근 발매분 일부가 빠질 수 있다. 실제로 문제되면 상한을 올린다.
  for (let offset = 0; offset < 500; offset += 100) {
    const page = await mb(`release?artist=${mbid}&inc=url-rels+release-groups&limit=100&offset=${offset}&fmt=json`);
    if (page?.__throttled || page?.__status) break;
    const releases = page.releases || [];

    for (const rel of releases) {
      const rg = rel["release-group"];
      if (!rg?.id) continue;
      if (!rgById.has(rg.id)) rgById.set(rg.id, rg);

      const sp = (rel.relations || []).find((r: any) =>
        String(r.url?.resource ?? "").includes("open.spotify.com/album/"));
      if (sp) {
        const albumId = String(sp.url.resource).split("/album/")[1]?.split(/[?#/]/)[0];
        // 한 RG 에 여러 판(리패키지 등)이 있어도 Spotify 앨범 ID 는 서로 다르다 — 전부 매핑한다
        if (albumId) {
          albumMap.set(albumId, rg.id);
          // 트랙리스트는 RG 가 아니라 이 발매판 기준이어야 Spotify 앨범과 곡 순서가 맞는다
          if (!albumRelease.has(albumId)) albumRelease.set(albumId, { release: rel.id, rg: rg.id });
        }
      }
    }

    if (releases.length === 0 || offset + releases.length >= (page["release-count"] ?? 0)) break;
  }

  if (rgById.size > 0) {
    const rows = [...rgById.values()].map((rg: any) => ({
      mbid: rg.id,
      artist_mbid: mbid,
      title: rg.title,
      primary_type: rg["primary-type"] ?? null,
      first_release_date: normalizeDate(rg["first-release-date"]),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("mb_release_group").upsert(rows, { onConflict: "mbid" });
    if (error) console.error(`  ! mb_release_group upsert 실패: ${error.message}`);
  }

  if (albumMap.size > 0) {
    // url_rel: MB 편집자가 직접 단 링크라 정확도 100%. 제목 매칭이 필요 없다.
    const rows = [...albumMap.entries()].map(([spotify_id, rgMbid]) => ({
      spotify_id, entity: "album", mbid: rgMbid, confidence: "url_rel",
    }));
    const { error } = await supabase.from("mb_spotify_map").upsert(rows, { onConflict: "spotify_id" });
    if (error) console.error(`  ! album map upsert 실패: ${error.message}`);
  }

  if (trusted && albumRelease.size > 0) {
    // ignoreDuplicates: 이미 트랙리스트를 채운 행의 tracks_filled_at 을 되돌리지 않는다
    const rows = [...albumRelease.entries()].map(([spotify_album_id, v]) => ({
      spotify_album_id, release_mbid: v.release, release_group_mbid: v.rg,
    }));
    const { error } = await supabase
      .from("mb_album_release")
      .upsert(rows, { onConflict: "spotify_album_id", ignoreDuplicates: true });
    if (error) console.error(`  ! album release upsert 실패: ${error.message}`);
  }

  return { ok: true, releaseGroups: rgById.size, albums: albumMap.size };
}

/** MB 는 "2024" / "2024-05" 같은 부분 날짜를 준다. Postgres DATE 로 넣으려면 채워야 한다. */
function normalizeDate(d?: string | null): string | null {
  if (!d) return null;
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

async function resolveOne(row: { spotify_id: string; entity: string; hint: string | null; attempts: number }) {
  const { spotify_id, hint } = row;
  const supabase = createAdminClient();

  let mbid = await byUrlRelationship(spotify_id);
  let confidence: "url_rel" | "name" = "url_rel";

  if (!mbid && hint) {
    const named = await byName(hint);
    if (named) {
      mbid = named.mbid;
      confidence = "name";
    }
  }

  if (!mbid) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await supabase.from("mb_resolve_queue").delete().eq("spotify_id", spotify_id);
      return { status: "gave_up" as const };
    }
    await supabase.from("mb_resolve_queue").update({ attempts }).eq("spotify_id", spotify_id);
    return { status: "retry" as const };
  }

  const filled = await fillArtist(mbid, confidence === "url_rel");
  if (!filled.ok) {
    await supabase.from("mb_resolve_queue").update({ attempts: row.attempts + 1 }).eq("spotify_id", spotify_id);
    return { status: "retry" as const };
  }

  await supabase.from("mb_spotify_map").upsert({
    spotify_id, entity: "artist", mbid, confidence,
  }, { onConflict: "spotify_id" });

  await supabase.from("mb_resolve_queue").delete().eq("spotify_id", spotify_id);
  return { status: "ok" as const, confidence, releaseGroups: filled.releaseGroups, albums: filled.albums };
}

/**
 * 백필: 이미 리졸브된 url_rel 아티스트를 다시 채운다 (앨범 매핑이 추가되기 전에 처리된 분).
 * updated_at 이 오래된 순서로 돌기 때문에 여러 번 나눠 돌려도 이어서 진행되고,
 * 한 바퀴 돈 뒤에는 그대로 주기적 갱신이 된다. 별도 진행 상태를 저장하지 않는다.
 */
async function backfillAlbums() {
  const supabase = createAdminClient();

  const maps = await fetchAll<{ mbid: string }>((f, t) => supabase
    .from("mb_spotify_map")
    .select("mbid")
    .eq("entity", "artist")
    .in("confidence", ["url_rel", "manual"])
    .order("spotify_id")
    .range(f, t));
  const trusted = new Set(maps.map(m => m.mbid));

  // 전부 가져와서 거른다. 오래된 순으로 일부만 가져오면 그 구간이 전부 이름 매칭(격리)
  // 아티스트일 때 대상이 0 명이 된다(실제로 겪음).
  // ponytail: 아티스트가 수만 명이 되면 신뢰 목록을 뷰로 조인해서 DB 에서 거른다.
  const artists = await fetchAll<{ mbid: string; name: string; updated_at: string }>((f, t) => supabase
    .from("mb_artist")
    .select("mbid, name, updated_at")
    .order("updated_at", { ascending: true })
    .range(f, t));

  const targets = artists.filter(a => trusted.has(a.mbid)).slice(0, BATCH);
  console.log(`앨범 백필 ${targets.length} 명 (신뢰 아티스트 ${trusted.size} 명 중)`);

  let rgs = 0, albums = 0, ok = 0;
  for (const a of targets) {
    const r = await fillArtist(a.mbid, true);
    if (r.ok) { ok++; rgs += r.releaseGroups; albums += r.albums; }
    console.log(`  ${r.ok ? "O" : "-"} ${a.name} rg=${r.releaseGroups} album=${r.albums}`);
  }
  console.log(`\n백필 완료 ${ok}/${targets.length} · 릴리스그룹 ${rgs} · Spotify 앨범 매핑 ${albums} · MB 호출 ${mbCalls}회`);
}

/**
 * 트랙리스트 채우기: mb_album_release 중 아직 안 채운 발매판의 곡 목록을 받는다. 발매판 1 개당 MB 1 회.
 * tracks_filled_at 이 곧 진행 상태라 여러 번 나눠 돌려도 이어서 진행된다.
 * 서로 다른 Spotify 앨범 ID 가 같은 발매판을 가리키면 MB 호출 없이 표시만 한다.
 */
async function fillTracklists() {
  const supabase = createAdminClient();
  const done = new Set<string>();
  let filled = 0, tracks = 0, failed = 0, seen = 0;
  // keyset 페이지네이션: 한 요청 1000 행 제한을 넘기고, 실패해서 NULL 로 남은 행을
  // 같은 실행 안에서 무한히 다시 집어오지 않게 한다.
  let after = "";

  while (seen < BATCH) {
    const { data: rows, error } = await supabase
      .from("mb_album_release")
      .select("spotify_album_id, release_mbid")
      .is("tracks_filled_at", null)
      .gt("spotify_album_id", after)
      .order("spotify_album_id", { ascending: true })
      .limit(Math.min(1000, BATCH - seen));
    if (error) { console.error("조회 실패:", error.message); process.exit(1); }
    if (!rows?.length) break;
    after = rows[rows.length - 1].spotify_album_id;
    seen += rows.length;
    if (seen === rows.length) console.log(`트랙리스트 처리 시작 (최대 ${BATCH} 건)`);

  for (const row of rows) {
    const markFilled = () => supabase
      .from("mb_album_release")
      .update({ tracks_filled_at: new Date().toISOString() })
      .eq("spotify_album_id", row.spotify_album_id);

    if (done.has(row.release_mbid)) { await markFilled(); continue; }

    const d = await mb(`release/${row.release_mbid}?inc=recordings&fmt=json`);
    if (d?.__throttled || d?.__status) {
      failed++;
      // 404 는 MB 에서 발매판이 병합·삭제된 경우다. 다시 시도해도 소용없으니 채운 것으로 표시한다.
      if (d?.__status === 404) await markFilled();
      continue;
    }

    const trackRows = (d.media || []).flatMap((m: any) =>
      (m.tracks || [])
        .filter((t: any) => t.recording?.id)
        .map((t: any) => ({
          release_mbid: row.release_mbid,
          disc: m.position ?? 1,
          position: t.position ?? (Number(t.number) || 0),
          recording_mbid: t.recording.id,
          title: t.title ?? t.recording.title,
          length_ms: t.length ?? t.recording.length ?? null,
        }))
    );

    if (trackRows.length > 0) {
      const { error: e } = await supabase
        .from("mb_release_track")
        .upsert(trackRows, { onConflict: "release_mbid,disc,position" });
      if (e) { console.error(`  ! ${row.release_mbid}: ${e.message}`); failed++; continue; }
    }

    await markFilled();
    done.add(row.release_mbid);
    filled++; tracks += trackRows.length;
    if (filled % 200 === 0) console.log(`  … ${filled} 발매판 / 곡 ${tracks}`);
  }
  }

  if (seen === 0) { console.log("채울 트랙리스트가 없다."); return; }
  console.log(`\n트랙리스트 완료 ${filled} 발매판 · 곡 ${tracks} · 실패 ${failed} · MB 호출 ${mbCalls}회`);
}

/** 초기 시드: 자체 자산을 전부 큐에 넣는다. */
async function seed() {
  const supabase = createAdminClient();
  const rows = new Map<string, { spotify_id: string; entity: string; hint: string }>();

  // 1) curatedArtists — Spotify ID 와 이름을 둘 다 갖고 있다
  for (const list of Object.values(curatedArtists) as any[]) {
    for (const a of list) {
      if (a?.id) rows.set(a.id, { spotify_id: a.id, entity: "artist", hint: a.name });
    }
  }

  // 2) 기존 Spotify 캐시에 쌓인 아티스트 (실사용 흔적이라 우선순위가 높다)
  const cached = await fetchAll<{ id: string; name: string }>((f, t) => supabase
    .from("spotify_cache_artists")
    .select("id, name")
    .order("id")
    .range(f, t));
  for (const a of cached) {
    if (a.id && !rows.has(a.id)) rows.set(a.id, { spotify_id: a.id, entity: "artist", hint: a.name });
  }

  // 이미 리졸브된 아티스트는 큐에서 빠진 상태라, 다시 넣으면 MB 호출을 또 쓴다. 제외한다.
  const mapped = await fetchAll<{ spotify_id: string }>((f, t) => supabase
    .from("mb_spotify_map")
    .select("spotify_id")
    .eq("entity", "artist")
    .order("spotify_id")
    .range(f, t));
  for (const m of mapped) rows.delete(m.spotify_id);

  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await supabase
      .from("mb_resolve_queue")
      .upsert(list.slice(i, i + 500), { onConflict: "spotify_id", ignoreDuplicates: true });
    if (error) console.error("시드 실패:", error.message);
  }

  // ARTIST_TRANSLATION_MAP 은 Spotify ID 가 없어서 큐에 못 넣는다.
  // 대신 byName() 의 양방향 검색 입력으로 쓰인다 (356 쌍).
  console.log(`큐 시드 완료: ${list.length} 건 (curated + 기존 캐시)`);
  console.log(`이름 매핑 사전: ${Object.keys(ARTIST_TRANSLATION_MAP).length} 쌍 (리졸버가 참조)`);
}

async function main() {
  const t0 = Date.now();
  if (process.argv.includes("--seed")) {
    await seed();
    return;
  }
  if (process.argv.includes("--albums")) {
    await backfillAlbums();
    return;
  }
  if (process.argv.includes("--tracks")) {
    await fillTracklists();
    return;
  }

  const supabase = createAdminClient();
  const { data: queue, error } = await supabase
    .from("mb_resolve_queue")
    .select("spotify_id, entity, hint, attempts")
    .lt("attempts", MAX_ATTEMPTS)
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) { console.error("큐 조회 실패:", error.message); process.exit(1); }
  if (!queue || queue.length === 0) { console.log("큐가 비어 있다."); return; }

  console.log(`큐 ${queue.length} 건 처리 시작 (MB ${MB_DELAY_MS}ms 간격)`);
  const tally = { ok: 0, url_rel: 0, name: 0, retry: 0, gave_up: 0, rgs: 0, albums: 0 };

  for (const row of queue) {
    try {
      const r = await resolveOne(row as any);
      if (r.status === "ok") {
        tally.ok++; tally[r.confidence]++; tally.rgs += r.releaseGroups; tally.albums += r.albums;
        console.log(`  O ${row.hint ?? row.spotify_id} [${r.confidence}] rg=${r.releaseGroups} album=${r.albums}`);
      } else {
        tally[r.status]++;
        console.log(`  ${r.status === "gave_up" ? "X" : "-"} ${row.hint ?? row.spotify_id}`);
      }
    } catch (e: any) {
      tally.retry++;
      console.error(`  ! ${row.spotify_id}: ${e?.message ?? e}`);
    }
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n완료 ${mins}분 / MB 호출 ${mbCalls}회`);
  console.log(`성공 ${tally.ok} (url_rel ${tally.url_rel} / name ${tally.name}) · 재시도 ${tally.retry} · 포기 ${tally.gave_up}`);
  console.log(`릴리스그룹 ${tally.rgs} 건 · Spotify 앨범 매핑 ${tally.albums} 건 확보`);
}

main().catch(e => { console.error(e); process.exit(1); });
