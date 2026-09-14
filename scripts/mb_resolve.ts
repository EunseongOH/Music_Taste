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

/** 제목 정규화: 소문자, 괄호/특수문자 제거, 리패키지 접미 제거 */
function normTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, " ")
    .replace(/\b(deluxe|repackage|special\s*edition|remaster(ed)?|expanded|anniversary)\b/g, " ")
    .replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]+/g, "")
    .trim();
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

/** 아티스트 1 명의 canonical 행 + 디스코그래피를 채운다. MB 호출 2~3 회. */
async function fillArtist(mbid: string) {
  // inc 에 tags 를 넣지 않는다 (CC-BY-NC-SA).
  const a = await mb(`artist/${mbid}?inc=aliases&fmt=json`);
  if (a?.__throttled || a?.__status) return { ok: false, releaseGroups: 0 };

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
    return { ok: false, releaseGroups: 0 };
  }

  // 릴리스그룹 일괄 수집. 실측 평균 32 개라 대부분 1 회로 끝난다.
  const rgs: any[] = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const page = await mb(`release-group?artist=${mbid}&limit=100&offset=${offset}&fmt=json`);
    if (page?.__throttled || page?.__status) break;
    const items = page["release-groups"] || [];
    rgs.push(...items);
    if (rgs.length >= (page["release-group-count"] ?? 0) || items.length === 0) break;
  }

  if (rgs.length > 0) {
    const rows = rgs.map((rg: any) => ({
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

  return { ok: true, releaseGroups: rgs.length };
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

  const filled = await fillArtist(mbid);
  if (!filled.ok) {
    await supabase.from("mb_resolve_queue").update({ attempts: row.attempts + 1 }).eq("spotify_id", spotify_id);
    return { status: "retry" as const };
  }

  await supabase.from("mb_spotify_map").upsert({
    spotify_id, entity: "artist", mbid, confidence,
  }, { onConflict: "spotify_id" });

  await supabase.from("mb_resolve_queue").delete().eq("spotify_id", spotify_id);
  return { status: "ok" as const, confidence, releaseGroups: filled.releaseGroups };
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
  const { data: cached } = await supabase
    .from("spotify_cache_artists")
    .select("id, name")
    .limit(5000);
  for (const a of cached ?? []) {
    if (a.id && !rows.has(a.id)) rows.set(a.id, { spotify_id: a.id, entity: "artist", hint: a.name });
  }

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
  const tally = { ok: 0, url_rel: 0, name: 0, retry: 0, gave_up: 0, rgs: 0 };

  for (const row of queue) {
    try {
      const r = await resolveOne(row as any);
      if (r.status === "ok") {
        tally.ok++; tally[r.confidence]++; tally.rgs += r.releaseGroups;
        console.log(`  O ${row.hint ?? row.spotify_id} [${r.confidence}] rg=${r.releaseGroups}`);
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
  console.log(`릴리스그룹 ${tally.rgs} 건 확보`);
}

main().catch(e => { console.error(e); process.exit(1); });
