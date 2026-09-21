// 앨범 요약(digest) 을 만든다. Spotify 호출 0회.
//
// 앨범 목록을 만들 때 트랙 행을 통째로 읽지 않으려고 미리 계산해 둔다.
// 화면과 같은 함수(src/utils/trackDigest.ts)를 써서 판단이 어긋나지 않게 한다.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/build-digest.ts mb     [최대 발매판수]
//   npx tsx --env-file=.env.local scripts/build-digest.ts deezer [최대 앨범수]
//   npx tsx --env-file=.env.local scripts/build-digest.ts discogs [최대 발매판수]

import { createAdminClient } from "../src/utils/supabase/admin";
import { buildDigest } from "../src/utils/trackDigest";

const sb = createAdminClient();

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** MusicBrainz 발매판 요약 */
async function mb(limit: number) {
  const have = new Set((await fetchAll<any>((f, t) => sb.from("mb_release_digest")
    .select("release_mbid").order("release_mbid").range(f, t))).map((r) => r.release_mbid));
  // 트랙이 들어 있는 발매판만 대상
  const all = await fetchAll<any>((f, t) => sb.from("mb_album_release")
    .select("release_mbid").not("tracks_filled_at", "is", null).order("spotify_album_id").range(f, t));
  const all2 = await fetchAll<any>((f, t) => sb.from("mb_rg_release")
    .select("release_mbid").not("tracks_filled_at", "is", null).order("release_group_mbid").range(f, t));
  const todo = [...new Set([...all, ...all2].map((r) => r.release_mbid))].filter((r) => r && !have.has(r)).slice(0, limit);
  console.log(`MusicBrainz 발매판 ${todo.length}개 (이미 만든 것 ${have.size}개)`);

  let done = 0, rows: any[] = [];
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const tracks: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("mb_release_track")
        .select("release_mbid, disc, position, title, length_ms")
        .in("release_mbid", chunk).order("release_mbid").order("disc").order("position").range(from, from + 999);
      if (error) throw new Error(error.message);
      tracks.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const byRel = new Map<string, any[]>();
    for (const t of tracks) byRel.set(t.release_mbid, [...(byRel.get(t.release_mbid) ?? []), t]);
    for (const rel of chunk) {
      const list = (byRel.get(rel) ?? []).map((t) => ({ title: t.title, ms: t.length_ms ?? 0 }));
      rows.push({ release_mbid: rel, ...buildDigest(list) });
    }
    if (rows.length >= 200 || i + 40 >= todo.length) {
      const { error } = await sb.from("mb_release_digest").upsert(rows, { onConflict: "release_mbid" });
      if (error) throw new Error(error.message);
      done += rows.length; rows = [];
      console.log(`  ${done}/${todo.length} ${new Date().toLocaleTimeString()}`);
    }
  }
  console.log(`완료 · ${done}개`);
}

/** Deezer 앨범 요약 */
async function deezer(limit: number) {
  const have = new Set((await fetchAll<any>((f, t) => sb.from("deezer_album_digest")
    .select("deezer_album_id").order("deezer_album_id").range(f, t))).map((r) => Number(r.deezer_album_id)));
  const all = await fetchAll<any>((f, t) => sb.from("deezer_album")
    .select("deezer_album_id").order("deezer_album_id").range(f, t));
  const todo = all.map((r) => Number(r.deezer_album_id)).filter((id) => !have.has(id)).slice(0, limit);
  console.log(`Deezer 앨범 ${todo.length}개 (이미 만든 것 ${have.size}개)`);

  let done = 0, rows: any[] = [];
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const tracks: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("deezer_track")
        .select("deezer_album_id, idx, title, duration_s")
        .in("deezer_album_id", chunk).order("deezer_album_id").order("idx").range(from, from + 999);
      if (error) throw new Error(error.message);
      tracks.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const byAlbum = new Map<number, any[]>();
    for (const t of tracks) {
      const k = Number(t.deezer_album_id);
      byAlbum.set(k, [...(byAlbum.get(k) ?? []), t]);
    }
    for (const id of chunk) {
      const list = (byAlbum.get(id) ?? []).map((t) => ({ title: t.title, ms: (t.duration_s ?? 0) * 1000 }));
      rows.push({ deezer_album_id: id, ...buildDigest(list) });
    }
    if (rows.length >= 200 || i + 40 >= todo.length) {
      const { error } = await sb.from("deezer_album_digest").upsert(rows, { onConflict: "deezer_album_id" });
      if (error) throw new Error(error.message);
      done += rows.length; rows = [];
      console.log(`  ${done}/${todo.length} ${new Date().toLocaleTimeString()}`);
    }
  }
  console.log(`완료 · ${done}개`);
}

/** Discogs 는 재생시간을 "3:39" 처럼 적는다. 초로 바꾼다 (빈 값은 0) */
function durMs(s: string): number {
  const p = String(s || "").trim().split(":").map(Number);
  if (!p.length || p.some((x) => !Number.isFinite(x))) return 0;
  return p.reduce((a, b) => a * 60 + b, 0) * 1000;
}

/** Discogs 발매판 요약 */
async function discogs(limit: number) {
  const have = new Set((await fetchAll<any>((f, t) => sb.from("discogs_release_digest")
    .select("release_id").order("release_id").range(f, t))).map((r) => Number(r.release_id)));
  const all = await fetchAll<any>((f, t) => sb.from("discogs_release")
    .select("release_id").order("release_id").range(f, t));
  const todo = all.map((r) => Number(r.release_id)).filter((id) => !have.has(id)).slice(0, limit);
  console.log(`Discogs 발매판 ${todo.length}개 (이미 만든 것 ${have.size}개)`);

  let done = 0, rows: any[] = [];
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const tracks: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("discogs_track")
        .select("release_id, idx, title, duration")
        .in("release_id", chunk).order("release_id").order("idx").range(from, from + 999);
      if (error) throw new Error(error.message);
      tracks.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const byRel = new Map<number, any[]>();
    for (const t of tracks) { const k = Number(t.release_id); byRel.set(k, [...(byRel.get(k) ?? []), t]); }
    for (const id of chunk) {
      const list = (byRel.get(id) ?? []).map((t) => ({ title: t.title, ms: durMs(t.duration) }));
      rows.push({ release_id: id, ...buildDigest(list) });
    }
    if (rows.length >= 200 || i + 40 >= todo.length) {
      const { error } = await sb.from("discogs_release_digest").upsert(rows, { onConflict: "release_id" });
      if (error) throw new Error(error.message);
      done += rows.length; rows = [];
      console.log(`  ${done}/${todo.length} ${new Date().toLocaleTimeString()}`);
    }
  }
  console.log(`완료 · ${done}개`);
}

const cmd = process.argv[2];
const n = Number(process.argv[3] ?? 100000);
if (cmd === "mb") mb(n);
else if (cmd === "deezer") deezer(n);
else if (cmd === "discogs") discogs(n);
else { console.log("mb [최대 발매판수] | deezer [최대 앨범수] | discogs [최대 발매판수]"); process.exit(1); }
