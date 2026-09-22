/**
 * mb-worker — MusicBrainz 상시 워커 (Supabase Edge Function, pg_cron 이 매분 호출)
 *
 * 왜 이 구조인가:
 *   MusicBrainz 는 IP 당 초당 1회로 제한된다. 요청 경로(Next 서버리스 인스턴스 여러 개)에서
 *   MB 를 부르면 동시 이용자 수만큼 제한에 걸린다. 그래서 요청 경로는 "수요 큐"에 기록만 하고,
 *   이 워커 하나가 잠금(lease)을 잡고 순서대로 채운다. MB 부하는 이용자 수와 무관해진다.
 *
 * 한 번 실행(최대 BUDGET_MS)에서 하는 일:
 *   1. 수요 큐 — 사용자가 최근에 찾은 아티스트부터.
 *      아티스트 확인(Spotify URL 관계 -> 이름) -> 앨범·발매판 -> 그 아티스트의 트랙리스트까지.
 *      이미 확인된 아티스트는 확인을 건너뛰고, DB 가 REFRESH_DAYS 보다 오래됐으면 신규 발매를 다시 받는다.
 *      예산이 끝나면 큐에 남겨두고 다음 실행이 이어받는다.
 *   2. 큐가 비면 백로그 트랙리스트.
 *
 * 저장하는 데이터는 전부 MusicBrainz core(CC0)다. tags/genres/ratings(CC-BY-NC-SA)는 요청하지 않는다.
 * Spotify API 는 부르지 않는다.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const MB_UA = "Sortify/1.0 ( https://sortify.kr )";
// MB 제한은 "요청 시작 간격 평균 1초"다. 응답 뒤에 쉬면 왕복 시간(Supabase->MB 약 1초)만큼 두 번 기다려
// 처리량이 절반이 된다(실측: 50초에 23회). 요청 시작 시각 기준으로 간격을 맞춘다.
const MB_MIN_INTERVAL_MS = 1050;
const BUDGET_MS = 50_000;   // 매분 호출되므로 다음 실행과 겹치지 않게 한다 (무료 플랜 벽시계 150초 안)
const LEASE_SECS = 90;      // 워커가 죽으면 이 시간 뒤 다음 실행이 잠금을 가져간다
const REFRESH_DAYS = 14;    // 찾은 아티스트의 MB 데이터가 이보다 오래되면 신규 발매를 다시 받는다
// 신곡 감지: Spotify 앨범 목록(요청 경로가 받아 둔 캐시)에 최근 발매인데 DB 에 없는 앨범이 있으면
// 14일을 기다리지 않고 MB 를 다시 본다. MB 에 아직 없으면 이 간격으로만 재확인한다.
const NEW_RELEASE_WINDOW_DAYS = 60;
const RECHECK_DAYS = 3;
const MAX_ATTEMPTS = 3;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let deadline = 0;
const timeLeft = () => deadline - Date.now();
const stats = { mbCalls: 0, resolved: 0, refreshed: 0, newRelease: 0, redirected: 0, gaveUp: 0, releases: 0, tracks: 0, backlog: 0 };

let lastStart = 0;
async function mb(path: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const wait = MB_MIN_INTERVAL_MS - (Date.now() - lastStart);
    if (wait > 0) await sleep(wait);
    if (timeLeft() < 3000) return { __budget: true };
    lastStart = Date.now();
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { "User-Agent": MB_UA } });
    stats.mbCalls++;
    if (res.ok) return res.json();
    if (res.status === 503 || res.status === 429) {
      await res.body?.cancel();
      await sleep(Math.min(3000 * (i + 1), Math.max(0, timeLeft() - 2000)));
      continue;
    }
    await res.body?.cancel();
    return { __status: res.status };
  }
  return { __throttled: true };
}
const failed = (d: any) => !d || d.__budget || d.__throttled || d.__status;

function normalizeDate(d?: string | null): string | null {
  if (!d) return null;
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}
const hasHangul = (s: string) => /[가-힣]/.test(s || "");

// 조회 결과: 찾음 / 확실히 없음 / 일시적 실패(재시도 가치 있음) / 예산 소진
type Lookup = { mbid: string } | "absent" | "transient" | "budget";

/** 매핑 1단계: MB 편집자가 단 Spotify URL 관계. 실측 정확도 100%. MB 는 모르는 URL 이면 404 를 준다. */
async function byUrlRelationship(spotifyId: string): Promise<Lookup> {
  const d = await mb(`url?resource=${encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`)}&inc=artist-rels&fmt=json`);
  if (d?.__budget) return "budget";
  if (d?.__status === 404) return "absent";
  if (failed(d)) return "transient";
  const id = (d.relations || []).find((r: any) => r.artist?.id)?.artist?.id;
  return id ? { mbid: id } : "absent";
}

/** 매핑 2단계: 이름. hint 는 "영문|한글" 형태일 수 있다. 실측 정확도 57%라 신뢰하지 않는다. */
async function byName(hint: string): Promise<Lookup> {
  let transient = false;
  for (const q of hint.split("|").map((s) => s.trim()).filter(Boolean)) {
    const d = await mb(`artist/?query=${encodeURIComponent(`artist:"${q}"`)}&fmt=json&limit=5`);
    if (d?.__budget) return "budget";
    if (failed(d)) { transient = true; continue; }
    const hits = (d.artists || []).filter((a: any) => a.score >= 88);
    const pick = hits.find((a: any) => a.country === "KR" || a.country === "JP") ?? hits[0];
    if (pick) return { mbid: pick.id };
  }
  return transient ? "transient" : "absent";
}

/** 아티스트 행 + 발매그룹 + (신뢰 아티스트면) Spotify 앨범 -> 발매판 매핑. */
async function fillArtist(mbid: string, trusted: boolean): Promise<boolean> {
  const a = await mb(`artist/${mbid}?inc=aliases&fmt=json`);
  if (failed(a)) return false;

  const aliases = (a.aliases || []).map((x: any) => ({ name: x.name, locale: x.locale, type: x.type }));
  const nameKo = aliases.find((x: any) => x.locale === "ko")?.name
    ?? aliases.find((x: any) => hasHangul(x.name))?.name
    ?? (hasHangul(a.name) ? a.name : null);

  const { error } = await sb.from("mb_artist").upsert({
    mbid, name: a.name, sort_name: a["sort-name"] ?? null, country: a.country ?? null,
    aliases, updated_at: new Date().toISOString(),
    // name_ko 는 MB 에서 못 찾으면 덮어쓰지 않는다 (시드 때 자체 맵으로 채운 값을 보존)
    ...(nameKo ? { name_ko: nameKo } : {}),
  }, { onConflict: "mbid" });
  if (error) { console.error("mb_artist", error.message); return false; }

  // Spotify 앨범 URL 은 release-group 이 아니라 release 에 붙어 있어서 release 단위로 훑는다.
  const rgs = new Map<string, any>();
  const albums = new Map<string, { release: string; rg: string }>();
  for (let offset = 0; offset < 500; offset += 100) {
    const page = await mb(`release?artist=${mbid}&inc=url-rels+release-groups&limit=100&offset=${offset}&fmt=json`);
    if (failed(page)) { if (offset === 0) return false; break; }
    const releases = page.releases || [];
    for (const rel of releases) {
      const rg = rel["release-group"];
      if (!rg?.id) continue;
      rgs.set(rg.id, rg);
      const sp = (rel.relations || []).find((r: any) => String(r.url?.resource ?? "").includes("open.spotify.com/album/"));
      const albumId = sp && String(sp.url.resource).split("/album/")[1]?.split(/[?#/]/)[0];
      if (albumId && !albums.has(albumId)) albums.set(albumId, { release: rel.id, rg: rg.id });
    }
    if (!releases.length || offset + releases.length >= (page["release-count"] ?? 0)) break;
  }

  if (rgs.size) {
    await sb.from("mb_release_group").upsert([...rgs.values()].map((rg: any) => ({
      mbid: rg.id, artist_mbid: mbid, title: rg.title, primary_type: rg["primary-type"] ?? null,
      first_release_date: normalizeDate(rg["first-release-date"]), updated_at: new Date().toISOString(),
    })), { onConflict: "mbid" });
  }
  if (albums.size) {
    await sb.from("mb_spotify_map").upsert([...albums].map(([spotify_id, v]) => ({
      spotify_id, entity: "album", mbid: v.rg, confidence: "url_rel",
    })), { onConflict: "spotify_id" });
    if (trusted) {
      await sb.from("mb_album_release").upsert([...albums].map(([spotify_album_id, v]) => ({
        spotify_album_id, release_mbid: v.release, release_group_mbid: v.rg,
      })), { onConflict: "spotify_album_id", ignoreDuplicates: true });
    }
  }
  return true;
}

/** 발매판 1개의 트랙리스트. 같은 발매판을 가리키는 Spotify 앨범 행을 전부 채운 것으로 표시한다. */
async function fillRelease(releaseMbid: string): Promise<"ok" | "budget" | "fail"> {
  const d = await mb(`release/${releaseMbid}?inc=recordings&fmt=json`);
  if (d?.__budget) return "budget";
  const markFilled = () => sb.from("mb_album_release")
    .update({ tracks_filled_at: new Date().toISOString() }).eq("release_mbid", releaseMbid);
  if (failed(d)) {
    if (d?.__status === 404) { await markFilled(); }  // MB 에서 병합·삭제된 발매판. 재시도 무의미
    return "fail";
  }
  const rows = (d.media || []).flatMap((m: any) => (m.tracks || [])
    .filter((t: any) => t.recording?.id)
    .map((t: any) => ({
      release_mbid: releaseMbid, disc: m.position ?? 1, position: t.position ?? (Number(t.number) || 0),
      recording_mbid: t.recording.id, title: t.title ?? t.recording.title,
      length_ms: t.length ?? t.recording.length ?? null,
    })));
  if (rows.length) {
    const { error } = await sb.from("mb_release_track").upsert(rows, { onConflict: "release_mbid,disc,position" });
    if (error) { console.error("mb_release_track", error.message); return "fail"; }
  }
  await markFilled();
  stats.releases++; stats.tracks += rows.length;
  return "ok";
}

/** "2024-05-01" / "2024-05" / "2024" -> ms. 못 읽으면 NaN */
const releaseTime = (d?: string) =>
  !d ? NaN : Date.parse(/^\d{4}$/.test(d) ? `${d}-01-01` : /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : d);

/**
 * 이 아티스트의 Spotify 앨범 목록 캐시에 최근 발매인데 DB(발매판 매핑)에 없는 앨범이 있나.
 * Spotify 를 부르지 않고, 요청 경로가 사용자에게 보여주려고 받아 둔 캐시만 읽는다.
 */
async function hasUnmappedRecentRelease(spotifyArtistId: string): Promise<boolean> {
  const { data: row } = await sb.from("spotify_album_cache_v2").select("items").eq("artist_id", spotifyArtistId).maybeSingle();
  const cutoff = Date.now() - NEW_RELEASE_WINDOW_DAYS * 86_400_000;
  const recent = ((row?.items ?? []) as any[])
    .filter((a) => a?.id && releaseTime(a.release_date) >= cutoff)
    .map((a) => a.id as string);
  if (!recent.length) return false;
  const { data: mapped } = await sb.from("mb_album_release").select("spotify_album_id").in("spotify_album_id", recent);
  const have = new Set((mapped ?? []).map((m) => m.spotify_album_id));
  return recent.some((id) => !have.has(id));
}

/** MB 아티스트에 달린 Spotify 아티스트 링크들 (MB 1회) */
async function spotifyLinksOf(mbid: string): Promise<string[] | "budget" | "transient"> {
  const d = await mb(`artist/${mbid}?inc=url-rels&fmt=json`);
  if (d?.__budget) return "budget";
  if (failed(d)) return "transient";
  return (d.relations || [])
    .map((r: any) => String(r.url?.resource ?? ""))
    .filter((u: string) => u.includes("open.spotify.com/artist/"))
    .map((u: string) => u.split("/artist/")[1]?.split(/[?#/]/)[0])
    .filter(Boolean);
}

type QueueRow = { spotify_id: string; hint: string | null; attempts: number };

/** 수요 큐 1건. 끝까지 채우면 큐에서 지우고, 예산이 끝나면 남겨 둔다. */
async function processDemand(row: QueueRow): Promise<"done" | "budget"> {
  const drop = () => sb.from("mb_resolve_queue").delete().eq("spotify_id", row.spotify_id);
  const retry = async () => {
    if (row.attempts + 1 >= MAX_ATTEMPTS) { await drop(); stats.gaveUp++; }
    else await sb.from("mb_resolve_queue").update({ attempts: row.attempts + 1 }).eq("spotify_id", row.spotify_id);
    return "done" as const;
  };

  const { data: map } = await sb.from("mb_spotify_map")
    .select("mbid, confidence").eq("spotify_id", row.spotify_id).eq("entity", "artist").maybeSingle();

  let mbid: string;
  if (map) {
    // 이름 매칭으로만 잡힌 아티스트는 신뢰하지 않으니 더 채우지 않는다 (사람이 manual 로 올리면 다시 처리됨)
    if (map.confidence === "name") { await drop(); return "done"; }
    mbid = map.mbid;
    const { data: art } = await sb.from("mb_artist").select("updated_at").eq("mbid", mbid).maybeSingle();
    const ageDays = art ? (Date.now() - new Date(art.updated_at).getTime()) / 86_400_000 : Infinity;
    const newRelease = ageDays > RECHECK_DAYS && ageDays <= REFRESH_DAYS && await hasUnmappedRecentRelease(row.spotify_id);
    if (ageDays > REFRESH_DAYS || newRelease) {
      if (timeLeft() < 15_000) return "budget";
      if (!(await fillArtist(mbid, true))) return timeLeft() < 3000 ? "budget" : retry();
      if (newRelease) stats.newRelease++; else stats.refreshed++;
    }
  } else {
    if (timeLeft() < 20_000) return "budget";
    let confidence: "url_rel" | "name" = "url_rel";
    let look = await byUrlRelationship(row.spotify_id);
    if (look === "budget") return "budget";
    // URL 조회가 일시적으로 실패했으면 이름 검색으로 넘어가지 않는다. 넘어가서 이름으로 잡히면
    // 실제로는 URL 매칭(정확도 100%)이 있는 아티스트가 name(57%)으로 영구 저장되고,
    // name 매핑은 다시 확인하지 않으므로 그대로 굳는다.
    if (look === "transient") return retry();
    if (look === "absent" && row.hint) {
      confidence = "name";
      look = await byName(row.hint);
      if (look === "budget") return "budget";
      if (look === "transient") return retry();
    }
    if (typeof look !== "object") {
      // MB 에 확실히 없으면 바로 뺀다. 몇 분 뒤 재시도해도 결과가 같다(실측: 3분 연속 헛 재시도).
      // 사용자가 다시 찾으면 요청 경로가 6시간 간격으로 다시 넣으므로 자연스럽게 재시도된다.
      await drop(); stats.gaveUp++; return "done";
    }
    const found = look.mbid;

    // 이름으로 찾은 MB 아티스트가 자기 Spotify 링크를 따로 갖고 있으면, 큐에 들어온 Spotify 프로필은
    // 같은 이름의 다른 사람이다. (실제 사례: Spotify 동명이인 "이찬혁"이 AKMU 이찬혁 MB 아티스트에
    // 이름으로 붙었는데, 그 MB 아티스트에는 올바른 Spotify 링크가 이미 있었다.)
    // 이 프로필은 연결하지 않고, MB 가 가리키는 진짜 프로필을 대신 큐에 넣는다.
    if (confidence === "name") {
      const links = await spotifyLinksOf(found);
      if (links === "budget") return "budget";
      if (links === "transient") return retry();
      if (links.length && !links.includes(row.spotify_id)) {
        await sb.from("mb_resolve_queue").upsert(
          links.map((id) => ({ spotify_id: id, entity: "artist", hint: row.hint, created_at: new Date().toISOString() })),
          { onConflict: "spotify_id" },
        );
        await drop(); stats.redirected++; return "done";
      }
    }

    if (!(await fillArtist(found, confidence === "url_rel"))) return timeLeft() < 3000 ? "budget" : retry();
    await sb.from("mb_spotify_map").upsert({ spotify_id: row.spotify_id, entity: "artist", mbid: found, confidence },
      { onConflict: "spotify_id" });
    stats.resolved++;
    if (confidence === "name") { await drop(); return "done"; }
    mbid = found;
  }

  // 이 아티스트의 트랙리스트
  const { data: pending } = await sb.from("mb_album_release_artist")
    .select("release_mbid").eq("artist_mbid", mbid).is("tracks_filled_at", null).limit(500);
  for (const release of new Set((pending ?? []).map((p) => p.release_mbid))) {
    if ((await fillRelease(release)) === "budget") return "budget";
  }
  await drop();
  return "done";
}

Deno.serve(async (req) => {
  const { data: authorized } = await sb.rpc("mb_check_worker_token", { p_token: req.headers.get("x-worker-token") ?? "" });
  if (!authorized) return new Response("unauthorized", { status: 401 });

  const holder = crypto.randomUUID();
  const { data: gotLease } = await sb.rpc("mb_take_lease", { p_holder: holder, p_secs: LEASE_SECS });
  if (!gotLease) return Response.json({ skipped: "another run holds the lease" });

  deadline = Date.now() + BUDGET_MS;
  // 런타임이 인스턴스를 재사용하면 모듈 변수가 이전 실행 값을 들고 있다
  for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = 0;
  try {
    // 1) 수요 큐: 최근에 찾은 순. 같은 실행 안에서 한 번 본 건 다시 집지 않는다.
    const seen = new Set<string>();
    queue: while (timeLeft() > 5000) {
      const { data: rows } = await sb.from("mb_resolve_queue")
        .select("spotify_id, hint, attempts").lt("attempts", MAX_ATTEMPTS)
        .order("created_at", { ascending: false }).limit(20);
      const fresh = (rows ?? []).filter((r) => !seen.has(r.spotify_id));
      if (!fresh.length) break;
      for (const row of fresh) {
        seen.add(row.spotify_id);
        if ((await processDemand(row)) === "budget") break queue;
      }
    }

    // 2) 백로그 트랙리스트. 로컬 대량 실행(오름차순)과 가운데서 만나도록 내림차순으로 간다.
    while (timeLeft() > 5000) {
      const { data: rows } = await sb.from("mb_album_release")
        .select("release_mbid").is("tracks_filled_at", null)
        .order("spotify_album_id", { ascending: false }).limit(10);
      if (!rows?.length) break;
      let progressed = false;
      for (const r of rows) {
        const res = await fillRelease(r.release_mbid);
        if (res === "budget") break;
        if (res === "ok") { progressed = true; stats.backlog++; }
      }
      if (!progressed) break;  // 전부 실패(MB 장애 등)면 다음 실행에 맡긴다
    }
  } finally {
    await sb.rpc("mb_release_lease", { p_holder: holder });
  }

  console.log(JSON.stringify(stats));
  return Response.json(stats);
});
