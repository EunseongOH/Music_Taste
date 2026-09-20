// Spotify 앨범 ID 가 없는 발매그룹의 트랙리스트를 MusicBrainz(CC0) 에서 직접 채운다.
//
// 왜: 우리 DB 의 발매그룹 10만 개 중 6만 개는 Spotify 앨범 링크가 없어서 화면에 못 냈다.
//     잔나비처럼 "앨범 몇 개만 뜨는" 아티스트가 여기서 생긴다. Spotify 도 Deezer 도 아닌
//     MusicBrainz 자체 데이터로 여는 것이 가장 정확하고(같은 아티스트의 같은 발매판) 제약도 없다.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/mb-rg-fill.ts map [아티스트수]   발매그룹마다 대표 발매판 정하기
//   npx tsx --env-file=.env.local scripts/mb-rg-fill.ts tracks [발매판수]  대표 발매판의 트랙리스트 받기
//   npx tsx --env-file=.env.local scripts/mb-rg-fill.ts demand [아티스트수] 많이 열린 아티스트를 대기열 맨 앞으로
//
// MusicBrainz 는 IP 당 초당 1회다. Spotify 는 부르지 않는다.

import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const UA = "Sortify/1.0 ( https://sortify.kr )";
// Supabase 무료 한도는 500MB. 여유를 두고 여기서 멈춘다 (환경변수 DB_LIMIT_MB 로 조정).
const DB_LIMIT_MB = Number(process.env.DB_LIMIT_MB ?? 420);
// 이용자가 열 아티스트(rank 0~2)까지만 채운다. 그 뒤 롱테일은 --all 을 줘야 받는다.
const RANK_CEILING = 2;
const MIN_GAP_MS = 1100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let calls = 0, lastStart = 0;
async function mb(path: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const wait = MIN_GAP_MS - (Date.now() - lastStart);
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    calls++;
    let res: Response;
    try { res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) }); }
    catch { await sleep(2000); continue; }
    if (res.ok) return res.json();
    if (res.status === 503 || res.status === 429) { await sleep(3000 * (i + 1)); continue; }
    return { __status: res.status };
  }
  return { __throttled: true };
}

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** 이용자가 실제로 열 아티스트부터. 홍보 대상 -> 한국 -> 나머지, 그 안에서 빠진 앨범이 많은 쪽부터. */
async function targetArtists(limit: number) {
  const rows = await fetchAll<any>((f, t) => sb.from("artist_deezer_target")
    .select("spotify_id, mbid, name, country, gap, release_groups")
    .in("confidence", ["url_rel", "manual", "wikidata"]).gt("release_groups", 0).order("spotify_id").range(f, t));
  const warm = new Set((await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id));
  const pri = (r: any) => (warm.has(r.spotify_id) ? 0 : r.country === "KR" ? 1 : r.country === "JP" ? 2 : 3);
  return rows.sort((a, b) => pri(a) - pri(b) || (b.gap ?? 0) - (a.gap ?? 0)).slice(0, limit);
}

/** 발매그룹 -> 대표 발매판. 아티스트 1명당 MB 호출 1~5회로 그 아티스트의 발매그룹을 전부 덮는다. */
async function map(limit: number, given?: any[], forceRank?: number) {
  const todo = given ?? await targetArtists(limit);
  const warm = new Set([
    ...(await fetchAll<any>((f, t) => sb.from("prelaunch_targets").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
    ...(await fetchAll<any>((f, t) => sb.from("explore_genre_picks").select("spotify_id").order("spotify_id").range(f, t))).map((r) => r.spotify_id),
  ]);
  const typeRank = (t?: string | null) => (t === "Album" ? 0 : t === "EP" ? 1 : t === "Single" ? 2 : 3);
  // 이미 대표 발매판이 정해진 발매그룹은 건너뛴다
  const done = new Set((await fetchAll<any>((f, t) => sb.from("mb_rg_release").select("release_group_mbid").order("release_group_mbid").range(f, t))).map((r) => r.release_group_mbid));
  console.log(`대상 아티스트 ${todo.length}명 · 이미 정해진 발매그룹 ${done.size}`);

  let picked = 0, skipped = 0;
  for (const [i, a] of todo.entries()) {
    if (i % 20 === 0) console.log(`  ${i}/${todo.length} 대표발매판 ${picked} · 건너뜀 ${skipped} · 호출 ${calls} ${new Date().toLocaleTimeString()}`);
    // 우리가 아는 이 아티스트의 발매그룹
    const { data: rgRows } = await sb.from("mb_release_group").select("mbid, primary_type").eq("artist_mbid", a.mbid).limit(1000);
    const mine = new Set((rgRows ?? []).map((r: any) => r.mbid));
    const typeOf = new Map((rgRows ?? []).map((r: any) => [r.mbid, r.primary_type]));
    const artistRank = forceRank ?? (warm.has(a.spotify_id) ? 0 : a.country === "KR" ? 1 : a.country === "JP" ? 2 : 3) * 10;
    const need = new Set([...mine].filter((m) => !done.has(m)));
    if (!need.size) { skipped++; continue; }

    // 발매판 목록 (media 를 함께 받아 곡 수가 가장 많은 판을 대표로 고른다)
    const best = new Map<string, { release: string; tracks: number; status: string | null }>();
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await mb(`release?artist=${a.mbid}&inc=release-groups+media&limit=100&offset=${offset}&fmt=json`);
      if (page?.__status || page?.__throttled) break;
      const releases = page.releases ?? [];
      for (const rel of releases) {
        const rg = rel["release-group"]?.id;
        if (!rg || !need.has(rg)) continue;
        const tracks = (rel.media ?? []).reduce((s: number, m: any) => s + (m["track-count"] ?? 0), 0);
        if (!tracks) continue;
        const cur = best.get(rg);
        // 공식 발매를 먼저, 그 다음 곡 수가 많은 판 (보너스 트랙까지 들어간 판을 고른다)
        const score = (t: number, st: string | null) => t + (st === "Official" ? 1000 : 0);
        if (!cur || score(tracks, rel.status ?? null) > score(cur.tracks, cur.status)) {
          best.set(rg, { release: rel.id, tracks, status: rel.status ?? null });
        }
      }
      if (!releases.length || offset + releases.length >= (page["release-count"] ?? 0)) break;
    }
    if (!best.size) continue;
    const rows = [...best].map(([release_group_mbid, v]) => ({
      release_group_mbid, release_mbid: v.release, track_count: v.tracks, status: v.status,
      rank: artistRank + typeRank(typeOf.get(release_group_mbid)),
      checked_at: new Date().toISOString(),
    }));
    const { error } = await sb.from("mb_rg_release").upsert(rows, { onConflict: "release_group_mbid", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    for (const r of rows) done.add(r.release_group_mbid);
    picked += rows.length;
  }
  console.log(`완료 · 대표발매판 ${picked} · MB 호출 ${calls}`);
}

/** 대표 발매판의 트랙리스트를 받아 mb_release_track 에 넣는다. */
async function dbSizeMb(): Promise<number> {
  const { data } = await sb.rpc("db_size_mb");
  return Number(data ?? 0);
}

async function tracks(limit: number) {
  const all = process.argv.includes("--all");
  const size = await dbSizeMb();
  if (size >= DB_LIMIT_MB) {
    console.log(`DB ${size}MB 로 한도(${DB_LIMIT_MB}MB)에 닿았다. 더 받지 않는다.`);
    console.log("docs/canonical-db/storage-plan.md 의 정리 방법을 먼저 실행해라.");
    return;
  }
  console.log(`DB ${size}MB / ${DB_LIMIT_MB}MB${all ? " · 롱테일까지" : ` · rank ${RANK_CEILING} 까지`}`);
  const q = sb.from("mb_rg_release")
    .select("release_group_mbid, release_mbid, track_count, rank")
    .is("tracks_filled_at", null).lt("attempts", 3);
  const { data: todo } = await (all ? q : q.lte("rank", RANK_CEILING))
    .order("rank", { nullsFirst: false }).order("checked_at").limit(limit);   // rank: (아티스트 중요도 x 10) + 발매 종류
  console.log(`대상 발매판 ${todo?.length ?? 0}`);

  let ok = 0, fail = 0, rowsTotal = 0;
  for (const [i, r] of (todo ?? []).entries()) {
    if (i % 20 === 0) console.log(`  ${i}/${todo!.length} 성공 ${ok} · 실패 ${fail} · 곡 ${rowsTotal} · 호출 ${calls} ${new Date().toLocaleTimeString()}`);
    if (i % 200 === 199 && (await dbSizeMb()) >= DB_LIMIT_MB) { console.log("한도에 닿아 멈춘다."); break; }
    const d = await mb(`release/${r.release_mbid}?inc=recordings&fmt=json`);
    if (d?.__status === 404) {
      // MB 에서 병합·삭제된 발매판. 다시 시도해도 소용없다
      await sb.from("mb_rg_release").update({ attempts: 3, checked_at: new Date().toISOString() }).eq("release_group_mbid", r.release_group_mbid);
      fail++; continue;
    }
    if (d?.__status || d?.__throttled) {
      await sb.from("mb_rg_release").update({ attempts: (await attemptsOf(r.release_group_mbid)) + 1, checked_at: new Date().toISOString() }).eq("release_group_mbid", r.release_group_mbid);
      fail++; continue;
    }
    const rows = (d.media ?? []).flatMap((m: any) => (m.tracks ?? [])
      .filter((t: any) => t.recording?.id)
      .map((t: any) => ({
        release_mbid: r.release_mbid, disc: m.position ?? 1, position: t.position ?? (Number(t.number) || 0),
        recording_mbid: t.recording.id, title: t.title ?? t.recording.title,
        length_ms: t.length ?? t.recording.length ?? null,
      })));
    if (rows.length) {
      const { error } = await sb.from("mb_release_track").upsert(rows, { onConflict: "release_mbid,disc,position" });
      if (error) throw new Error(error.message);
    }
    await sb.from("mb_rg_release").update({
      tracks_filled_at: new Date().toISOString(), track_count: rows.length || r.track_count, checked_at: new Date().toISOString(),
    }).eq("release_group_mbid", r.release_group_mbid);
    ok++; rowsTotal += rows.length;
  }
  console.log(`완료 · 성공 ${ok} · 실패 ${fail} · 곡 ${rowsTotal} · MB 호출 ${calls}`);
}

async function attemptsOf(rg: string) {
  const { data } = await sb.from("mb_rg_release").select("attempts").eq("release_group_mbid", rg).maybeSingle();
  return data?.attempts ?? 0;
}

/**
 * 이용자가 실제로 많이 연 아티스트를 대기열 맨 앞으로 끌어온다.
 * "자주 쓰이는 아티스트는 끝까지 채워 영구 보관한다" 를 실행하는 명령이다.
 */
async function demand(limit: number) {
  const top = await fetchAll<any>((f, t) => sb.from("artist_completeness")
    .select("spotify_id, mbid, name, country, opens, release_groups, rg_pending, cc0_complete")
    .in("confidence", ["url_rel", "manual", "wikidata"])
    .gt("opens", 0).order("opens", { ascending: false }).range(f, t));
  const todo = top.filter((a) => !a.cc0_complete).slice(0, limit);
  console.log(`수요 있는 아티스트 ${top.length}명 · 아직 덜 채운 ${todo.length}명`);
  if (!todo.length) return;

  // 1) 대표 발매판이 없는 발매그룹부터 정한다 (rank -10: 어떤 것보다 먼저)
  await map(todo.length, todo, -10);

  // 2) 이미 정해진 것도 맨 앞으로 당긴다
  for (let i = 0; i < todo.length; i += 50) {
    const mbids = todo.slice(i, i + 50).map((a) => a.mbid);
    const rgs = await fetchAll<any>((f, t) => sb.from("mb_release_group").select("mbid").in("artist_mbid", mbids).order("mbid").range(f, t));
    for (let j = 0; j < rgs.length; j += 200) {
      const { error } = await sb.from("mb_rg_release").update({ rank: -10 })
        .in("release_group_mbid", rgs.slice(j, j + 200).map((r) => r.mbid)).is("tracks_filled_at", null);
      if (error) throw new Error(error.message);
    }
  }
  const left = todo.reduce((n, a) => n + (a.rg_pending ?? 0), 0);
  console.log(`완료 · 수요 상위 ${todo.length}명의 남은 발매그룹 ${left}건을 맨 앞으로 당겼다`);
}

/** 새로 들인 아티스트(discover-artists 로 추가)를 바로 처리한다. */
async function fresh(limit: number) {
  const { data: rows } = await sb.from("artist_candidate")
    .select("mbid, name, spotify_id, nb_fan").eq("status", "added")
    .order("nb_fan", { ascending: false }).limit(limit);
  const todo = (rows ?? []).map((r) => ({ ...r, country: "KR" }));
  console.log(`새로 들인 아티스트 ${todo.length}명`);
  if (!todo.length) return;
  await map(todo.length, todo, -5);            // 대표 발매판 정하기 (수요 아티스트 다음 순서)
  for (let i = 0; i < todo.length; i += 50) {
    const mbids = todo.slice(i, i + 50).map((a) => a.mbid);
    const rgs = await fetchAll<any>((f, t) => sb.from("mb_release_group").select("mbid").in("artist_mbid", mbids).order("mbid").range(f, t));
    for (let j = 0; j < rgs.length; j += 200) {
      const { error } = await sb.from("mb_rg_release").update({ rank: -5 })
        .in("release_group_mbid", rgs.slice(j, j + 200).map((r) => r.mbid)).is("tracks_filled_at", null);
      if (error) throw new Error(error.message);
    }
  }
  console.log("완료 · 새 아티스트의 발매그룹을 앞으로 당겼다");
}

const cmd = process.argv[2];
const n = Number(process.argv[3] ?? 200);
if (cmd === "map") map(n);
else if (cmd === "tracks") tracks(n);
else if (cmd === "demand") demand(n);
else if (cmd === "new") fresh(n);
else { console.log("map [아티스트수] | tracks [발매판수] | demand [아티스트수] | new [아티스트수]"); process.exit(1); }
