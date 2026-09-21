"use server";
// 자체 DB(카탈로그) 조회 — Spotify 호출 없이 앨범 목록과 트랙리스트를 돌려준다.
//
// 출처와 라이선스
//   - MusicBrainz core (CC0): 아티스트·발매그룹·발매판·트랙 (mb_* 테이블)
//   - Discogs 월간 덤프 (CC0): MusicBrainz 에 없는 앨범의 트랙리스트 (discogs_* 테이블)
//   - Deezer (deezer_* 테이블): Spotify 앨범 ID 가 없는 앨범도 낼 수 있다. 앨범 ID 는 "deezer:<번호>" 를 쓴다.
//     Deezer 약관은 비상업 이용을 전제한다 — 수익화 시 deezer_* 만 지우면 서비스에서 빠진다
//   - Spotify: 앨범·트랙 ID 와 커버 URL 만. 서술 정보는 저장하지 않는다 (약관 IV.3.1)
//
// 정확도 규칙 (부정확한 트랙리스트를 내보내지 않는다)
//   - Spotify 앨범 ↔ 발매판 연결은 MusicBrainz URL 링크, 사람 확인, 또는 제목·발매연도·곡 수가
//     모두 일치하고 Spotify 곡 제목과 대조까지 끝난(verified='ok') 것만 쓴다.
//   - 검증 대기(verified IS NULL) 연결은 쓰지 않는다.
//
// 중복 방지
//   - 앨범: Spotify 앨범 ID 로 1차, 정규화한 제목+발매연도+곡 수로 2차 중복 제거
//   - 트랙: 한 앨범 안에서 정규화한 제목 기준 중복 제거

import { createAdminClient } from "./supabase/admin";
import { buildDigest, cmpTrack, normTrack as normTrackFn, shortHash, type Digest } from "./trackDigest";

export interface DbAlbum {
  id: string;                 // Spotify 앨범 ID
  name: string;
  album_type: string;         // album | single | compilation
  release_date: string;
  total_tracks: number;
  images: { url: string }[];
  source: "db";
}

export interface DbTrack {
  id: string;                 // MusicBrainz 녹음 ID 또는 discogs:<발매판>:<순번>
  name: string;
  duration_ms: number;
  disc_number: number;
  track_number: number;
  preview_url: null;
  source: "db";
}

// 앨범 제목용: 에디션 표기를 떼고 비교한다 (같은 앨범의 디럭스·리마스터 판을 하나로 본다)
const normAlbum = (s: string) =>
  (s || "").normalize("NFKC").toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*(deluxe|edition|remaster|remastered|version|ver\.|repackage|anniversary|expanded|bonus)[^\)\]]*[\]\)]/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * 앨범 중복 판정은 두 가지 키를 같이 본다.
 *   normAlbum  "X X X (English version)" -> "xxx"            (괄호 안 판 표기를 뗀다)
 *   normTrack  "X X X - English Version" -> "xxxenglishversion"
 * 출처마다 같은 판을 괄호로도 대시로도 적는다. 한쪽만 떼면 서로 다른 앨범으로 보여 둘 다 나간다.
 * 실제로 L'Arc~en~Ciel "X X X" 와 GARNiDELiA "Desir" 가 그렇게 두 번 나왔다.
 */

/** 곡 제목용: 문장부호·공백만 정리한다 (버전 표기는 남긴다). 요약을 만들 때와 같은 함수를 쓴다 */
const normTrack = normTrackFn;

/**
 * 앨범 재킷 URL. 저장하지 않고 ID 에서 계산한다.
 *   1순위 Cover Art Archive (CC0). 없는 앨범이 3분의 1쯤 되고, 그때는 404 가 온다.
 *   2순위 Deezer 커버 (앨범 ID 만 있으면 URL 이 정해진다. 이미지를 우리 쪽에 저장하지 않는다)
 * 화면(SafeImage)이 1순위가 실패하면 2순위로, 그것도 없으면 대체 이미지로 내려간다.
 */
const caaCover = (releaseGroupMbid: string) => `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-500`;
const deezerCover = (deezerAlbumId: number | string) => `https://api.deezer.com/album/${deezerAlbumId}/image?size=big`;

/**
 * 두 앨범이 같은 앨범인가. 출처마다 제목을 다르게 적기 때문에 제목만으로는 못 가린다.
 *   "I.O.I : LOOP" / "I.O.I 3rd MINI ALBUM [I.O.I : LOOP]"
 *   "소나기" / "DOWNPOUR"   (한글 제목과 영어 제목)
 *   "Whatta Man" / "Whatta Man (Good Man)"
 * 그래서 수록곡으로 가린다. 적은 쪽 곡의 6할 이상이 상대 앨범에도 있으면 같은 앨범으로 본다.
 */
/** 앨범 비교용 곡 묶음. 요약(해시)만으로 겹침을 센다 */
interface AlbumTracks { raw: string[]; base: string[]; pre: string[] }
const toAlbumTracks = (d?: Digest): AlbumTracks =>
  ({ raw: d?.h_raw ?? [], base: d?.h_base ?? [], pre: d?.h_pre ?? [] });

/** 두 앨범이 얼마나 겹치나 (적은 쪽 기준 0~1). 표기가 달라도 같은 곡으로 본다 */
function overlap(a: AlbumTracks, b: AlbumTracks): number {
  const small = a.raw.length <= b.raw.length ? a : b;
  const big = a.raw.length <= b.raw.length ? b : a;
  if (!small.raw.length) return 0;
  const bigRaw = new Set(big.raw), bigBase = new Set(big.base), bigPre = new Set(big.pre);
  let hit = 0;
  for (let i = 0; i < small.raw.length; i++) {
    // 그대로 / 판 표기 뗀 것 / 앞부분 — 셋 중 하나만 맞아도 같은 곡으로 본다
    if (bigRaw.has(small.raw[i]) || bigBase.has(small.base[i]) || bigPre.has(small.pre[i])) hit++;
  }
  return hit / small.raw.length;
}

/**
 * 곡 수가 같고 자리별 재생시간이 맞으면 같은 앨범이다.
 * 한쪽은 한국어 제목, 다른 쪽은 로마자 제목이라 제목으로는 못 잡는 경우를 여기서 잡는다
 * (빅뱅 "Bigbang Vol.1" 2006 / "BIGBANG Vol.1" 2014).
 */
function sameByDuration(a?: number[], b?: number[]): boolean {
  if (!a || !b || a.length < 4 || a.length !== b.length) return false;
  let hit = 0, seen = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i] || !b[i]) continue;
    seen++;
    if (Math.abs(a[i] - b[i]) <= 5) hit++;       // 초 단위. 5초 안쪽이면 같은 곡으로 본다
  }
  return seen >= 4 && hit / seen >= 0.8;
}

function sameAlbum(a: AlbumTracks, b: AlbumTracks): boolean {
  return overlap(a, b) >= 0.6;
}

/**
 * 앨범 종류. MusicBrainz·Deezer 가 준 종류를 기본으로 하되, 실제 수록곡 수와 어긋나면 고친다.
 *
 * 한국 디지털 발매는 서너 곡이 들어 있어도 MusicBrainz 에 Single 로 올라와 있는 일이 흔하다.
 * 화면에 Single 이라고 적히면 이용자가 틀렸다고 느낀다. 곡 수를 세서 다시 정한다.
 * 이때 "곡"은 판 표기를 뗀 기준이라 같은 곡의 Inst. 판은 따로 세지 않는다
 * (타이틀곡 + 그 Inst. 두 트랙이면 여전히 싱글이다).
 */
function albumType(given: string, distinctSongs: number): string {
  const t = (given || "").toLowerCase();
  if (t === "album" || distinctSongs >= 7) return "album";
  if (distinctSongs >= 3) return "ep";
  if (t === "ep") return "ep";
  return "single";
}

/**
 * 앨범 요약을 읽는다. 트랙 행을 통째로 읽지 않으려고 미리 만들어 둔 것이다
 * (앨범이 수백 장인 아티스트에서 앨범 목록 한 번에 1.6MB 가 오가던 것을 줄인다).
 * 아직 요약이 없는 발매판만 예전처럼 트랙을 읽어 그 자리에서 만든다.
 */
async function loadMbDigests(supabase: ReturnType<typeof createAdminClient>, releases: string[]) {
  const out = new Map<string, Digest>();
  const ids = [...new Set(releases.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("mb_release_digest")
      .select("release_mbid, n_distinct, h_raw, h_base, h_pre, durs").in("release_mbid", ids.slice(i, i + 200));
    for (const d of data ?? []) out.set(d.release_mbid, d as Digest);
  }
  const missing = ids.filter((id) => !out.has(id));
  for (let i = 0; i < missing.length; i += 40) {
    const chunk = missing.slice(i, i + 40);
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("mb_release_track")
        .select("release_mbid, disc, position, title, length_ms")
        .in("release_mbid", chunk).order("release_mbid").order("disc").order("position").range(from, from + 999);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const byRel = new Map<string, any[]>();
    for (const t of rows) byRel.set(t.release_mbid, [...(byRel.get(t.release_mbid) ?? []), t]);
    for (const rel of chunk) {
      out.set(rel, buildDigest((byRel.get(rel) ?? []).map((t) => ({ title: t.title, ms: t.length_ms ?? 0 }))));
    }
  }
  return out;
}

/** Discogs 는 재생시간을 "3:39" 처럼 적는다 */
const dgDurMs = (s: string): number => {
  const p = String(s || "").trim().split(":").map(Number);
  if (!p.length || p.some((x) => !Number.isFinite(x))) return 0;
  return p.reduce((a, b) => a * 60 + b, 0) * 1000;
};

async function loadDgDigests(supabase: ReturnType<typeof createAdminClient>, releases: number[]) {
  const out = new Map<number, Digest>();
  const ids = [...new Set(releases.filter((x) => Number.isFinite(x)))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("discogs_release_digest")
      .select("release_id, n_distinct, h_raw, h_base, h_pre, durs").in("release_id", ids.slice(i, i + 200));
    for (const d of data ?? []) out.set(Number(d.release_id), d as Digest);
  }
  const missing = ids.filter((id) => !out.has(id));
  for (let i = 0; i < missing.length; i += 40) {
    const chunk = missing.slice(i, i + 40);
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("discogs_track")
        .select("release_id, idx, title, duration")
        .in("release_id", chunk).order("release_id").order("idx").range(from, from + 999);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const byRel = new Map<number, any[]>();
    for (const t of rows) { const k = Number(t.release_id); byRel.set(k, [...(byRel.get(k) ?? []), t]); }
    for (const id of chunk) {
      out.set(id, buildDigest((byRel.get(id) ?? []).map((t) => ({ title: t.title, ms: dgDurMs(t.duration) }))));
    }
  }
  return out;
}

async function loadDzDigests(supabase: ReturnType<typeof createAdminClient>, albums: number[]) {
  const out = new Map<number, Digest>();
  const ids = [...new Set(albums.filter((x) => Number.isFinite(x)))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("deezer_album_digest")
      .select("deezer_album_id, n_distinct, h_raw, h_base, h_pre, durs").in("deezer_album_id", ids.slice(i, i + 200));
    for (const d of data ?? []) out.set(Number(d.deezer_album_id), d as Digest);
  }
  const missing = ids.filter((id) => !out.has(id));
  for (let i = 0; i < missing.length; i += 40) {
    const chunk = missing.slice(i, i + 40);
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("deezer_track")
        .select("deezer_album_id, idx, title, duration_s")
        .in("deezer_album_id", chunk).order("deezer_album_id").order("idx").range(from, from + 999);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const byAlbum = new Map<number, any[]>();
    for (const t of rows) { const k = Number(t.deezer_album_id); byAlbum.set(k, [...(byAlbum.get(k) ?? []), t]); }
    for (const id of chunk) {
      out.set(id, buildDigest((byAlbum.get(id) ?? []).map((t) => ({ title: t.title, ms: (t.duration_s ?? 0) * 1000 }))));
    }
  }
  return out;
}

/** 검증되지 않은 제목 대조 연결은 제외한다. */
async function unverifiedAlbumIds(supabase: ReturnType<typeof createAdminClient>, ids: string[]) {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("mb_album_title_match")
      .select("spotify_album_id, verified")
      .in("spotify_album_id", ids.slice(i, i + 200));
    for (const r of data ?? []) if (r.verified !== "ok") out.add(r.spotify_album_id);
  }
  return out;
}

/**
 * DB 가 가진 그 아티스트의 앨범 목록. Spotify 앨범 ID 가 붙어 있고 트랙리스트까지 있는 앨범만 돌려준다.
 * (트랙리스트 없는 앨범을 목록에 넣으면 눌렀을 때 Spotify 를 부르게 되므로 넣지 않는다)
 */
export const getDbArtistAlbums = async (spotifyArtistId: string): Promise<DbAlbum[]> => {
  if (!spotifyArtistId) return [];
  try {
    const supabase = createAdminClient();
    const { data: map } = await supabase
      .from("mb_spotify_map")
      .select("mbid, confidence")
      .eq("spotify_id", spotifyArtistId).eq("entity", "artist")
      // Wikidata(CC0) 는 한 항목에 Spotify ID 와 MusicBrainz ID 를 함께 갖고 있어 URL 링크와 같은 수준의 근거다
      .in("confidence", ["url_rel", "manual", "wikidata"])
      .maybeSingle();
    if (!map?.mbid) return [];

    // 1) MusicBrainz: 트랙리스트가 채워진 발매판
    const { data: rel } = await supabase
      .from("mb_album_release_artist")
      .select("spotify_album_id, release_mbid")
      .eq("artist_mbid", map.mbid)
      .not("tracks_filled_at", "is", null)
      .limit(1000);
    const byAlbum = new Map<string, { release: string | null; discogs: number | null }>();
    for (const r of rel ?? []) byAlbum.set(r.spotify_album_id, { release: r.release_mbid, discogs: null });

    // 2) Discogs: 같은 아티스트로 연결된 발매판
    const { data: dArtists } = await supabase.from("mb_artist_discogs").select("discogs_artist_id").eq("mbid", map.mbid);
    const dIds = (dArtists ?? []).map((d) => Number(d.discogs_artist_id));
    if (dIds.length) {
      const { data: dRel } = await supabase.from("discogs_release").select("release_id").in("discogs_artist_id", dIds).limit(1000);
      const relIds = (dRel ?? []).map((r) => Number(r.release_id));
      for (let i = 0; i < relIds.length; i += 200) {
        const { data: m } = await supabase.from("discogs_album_match").select("spotify_album_id, release_id").in("release_id", relIds.slice(i, i + 200));
        for (const r of m ?? []) if (!byAlbum.has(r.spotify_album_id)) byAlbum.set(r.spotify_album_id, { release: null, discogs: Number(r.release_id) });
      }
    }
    const ids = [...byAlbum.keys()];
    const skip = ids.length ? await unverifiedAlbumIds(supabase, ids) : new Set<string>();

    // 앨범 메타데이터: MusicBrainz 발매그룹 (제목·발매일·종류)
    const rgOf = new Map<string, string>();
    if (ids.length) {
      const { data: linkRows } = await supabase.from("mb_album_release").select("spotify_album_id, release_group_mbid").in("spotify_album_id", ids.slice(0, 1000));
      for (const r of linkRows ?? []) if (r.release_group_mbid) rgOf.set(r.spotify_album_id, r.release_group_mbid);
    }
    const rgIds = [...new Set([...rgOf.values()].filter(Boolean))] as string[];
    const rgInfo = new Map<string, any>();
    for (let i = 0; i < rgIds.length; i += 200) {
      const { data } = await supabase.from("mb_release_group").select("mbid, title, primary_type, first_release_date").in("mbid", rgIds.slice(i, i + 200));
      for (const g of data ?? []) rgInfo.set(g.mbid, g);
    }
    // Discogs 쪽 메타데이터
    const discogsIds = [...byAlbum.values()].map((v) => v.discogs).filter(Boolean) as number[];
    const dInfo = new Map<number, any>();
    for (let i = 0; i < discogsIds.length; i += 200) {
      const { data } = await supabase.from("discogs_release").select("release_id, title, released, track_count").in("release_id", discogsIds.slice(i, i + 200));
      for (const r of data ?? []) dInfo.set(Number(r.release_id), r);
    }
    // 곡 수: MusicBrainz 발매판 기준. 제목이 완전히 같은 곡(같은 곡의 다른 믹스가 같은 제목으로 들어간 경우)은
    // 화면에서 중복 제거되므로 여기서도 빼고 센다 — 목록의 곡 수와 실제 보이는 곡 수를 맞춘다.
    const releaseIds = [...byAlbum.values()].map((v) => v.release).filter(Boolean) as string[];
    const digestOf = await loadMbDigests(supabase, releaseIds);
    const dgDigestOf = await loadDgDigests(supabase, discogsIds);
    const trackCount = new Map<string, number>([...digestOf].map(([k, d]) => [k, d.n_distinct]));

    // 재킷 2순위용: 이 앨범에 연결된 Deezer 앨범 (Cover Art Archive 에 재킷이 없을 때 쓴다)
    const dzCoverOf = new Map<string, number>();
    for (let i = 0; ids.length && i < ids.length; i += 200) {
      const { data } = await supabase.from("deezer_album_match")
        .select("spotify_album_id, deezer_album_id").in("spotify_album_id", ids.slice(i, i + 200));
      for (const r of data ?? []) dzCoverOf.set(r.spotify_album_id, Number(r.deezer_album_id));
    }

    const out: DbAlbum[] = [];
    const songsOf = new Map<string, Set<string>>();   // 앨범 ID -> 녹음 ID (같은 곡 판정용)
    const titlesOfAlbum = new Map<string, AlbumTracks>();   // 앨범 ID -> 곡 제목 (같은 앨범 판정용)
    const durOfAlbum = new Map<string, number[]>();         // 앨범 ID -> 자리순 재생시간
    const seq = (rows?: { d: number; p: number; ms: number }[]) =>
      (rows ?? []).slice().sort((x, y) => x.d - y.d || x.p - y.p).map((x) => x.ms);
    const seen = new Set<string>();          // 제목(판 표기 제거)+연도+곡수
    const seenLoose = new Set<string>();     // 제목(판 표기 제거)+연도
    const seenRaw = new Set<string>();       // 제목(그대로)+연도 — 괄호/대시 표기 차이를 잡는다
    const dupe = (name: string, year: string, total: number) =>
      seen.has(`${normAlbum(name)}|${year}|${total}`) || seenLoose.has(`${normAlbum(name)}|${year}`) || seenRaw.has(`${normTrack(name)}|${year}`);
    const remember = (name: string, year: string, total: number) => {
      seen.add(`${normAlbum(name)}|${year}|${total}`);
      seenLoose.add(`${normAlbum(name)}|${year}`);
      seenRaw.add(`${normTrack(name)}|${year}`);
    };
    for (const [albumId, src] of byAlbum) {
      if (skip.has(albumId)) continue;
      const rg = rgOf.get(albumId) ? rgInfo.get(rgOf.get(albumId)!) : null;
      const d = src.discogs ? dInfo.get(src.discogs) : null;
      const name = rg?.title ?? d?.title;
      if (!name) continue;
      const release_date = String(rg?.first_release_date ?? d?.released ?? "").slice(0, 10) || "";
      const total = src.release ? (trackCount.get(src.release) ?? 0) : (d?.track_count ?? 0);
      if (!total) continue;
      if (dupe(name, release_date.slice(0, 4), total)) continue;   // 같은 앨범의 다른 판 중복 제거
      remember(name, release_date.slice(0, 4), total);
      const type = (rg?.primary_type ?? "").toLowerCase();
      out.push({
        id: albumId,
        name,
        album_type: albumType(type, total),
        release_date,
        total_tracks: total,
        images: [
          ...(rgOf.get(albumId) ? [{ url: caaCover(rgOf.get(albumId)!) }] : []),
          ...(dzCoverOf.has(albumId) ? [{ url: deezerCover(dzCoverOf.get(albumId)!) }] : []),
        ],
        source: "db",
      });
      // 같은 앨범 판정에 쓸 요약을 붙인다. Discogs 로만 아는 앨범도 붙여야 한다 —
      // 안 붙이면 비교 대상에서 통째로 빠져서, 같은 앨범이 두 번 나간다
      // (Nirvana "In Utero" 가 "In Utero (Super Deluxe Edition)" 과 따로 나갔다).
      const dg = src.release ? digestOf.get(src.release) : (src.discogs ? dgDigestOf.get(src.discogs) : undefined);
      if (dg) {
        songsOf.set(albumId, new Set(dg.h_raw ?? []));
        titlesOfAlbum.set(albumId, toAlbumTracks(dg));
        durOfAlbum.set(albumId, dg.durs ?? []);
      }
    }
    // 3) MusicBrainz 단독: Spotify 앨범 ID 가 없는 발매그룹도 낸다 (앨범 ID 는 "mb:<발매그룹>")
    //    같은 아티스트의 같은 발매판에서 온 트랙리스트라 출처 대조가 필요 없다. 재킷도 발매그룹 ID 로 정해진다.
    const servedRg = new Set([...rgOf.values()]);
    const { data: allRg } = await supabase.from("mb_release_group")
      .select("mbid, title, primary_type, first_release_date").eq("artist_mbid", map.mbid).limit(1000);
    const restRg = (allRg ?? []).filter((g) => !servedRg.has(g.mbid));
    if (restRg.length) {
      // 부트레그·회수·취소된 판은 내보내지 않는다. 그 아티스트가 낸 앨범이 아니거나 유통되지 않은 판이다.
      const BAD_STATUS = new Set(["Bootleg", "Withdrawn", "Cancelled", "Pseudo-Release", "Expunged"]);
      const rgRel = new Map<string, string>();
      for (let i = 0; i < restRg.length; i += 200) {
        const { data } = await supabase.from("mb_rg_release").select("release_group_mbid, release_mbid, status")
          .in("release_group_mbid", restRg.slice(i, i + 200).map((g) => g.mbid)).not("tracks_filled_at", "is", null);
        for (const r of data ?? []) {
          if (r.status && BAD_STATUS.has(r.status)) continue;
          rgRel.set(r.release_group_mbid, r.release_mbid);
        }
      }
      const relIds2 = [...new Set(rgRel.values())];
      const digest2 = await loadMbDigests(supabase, relIds2);

      for (const g of restRg) {
        const rel = rgRel.get(g.mbid);
        if (!rel) continue;
        const total = digest2.get(rel)?.n_distinct ?? 0;
        if (!total) continue;
        const release_date = String(g.first_release_date ?? "").slice(0, 10) || "";
        if (dupe(g.title, release_date.slice(0, 4), total)) continue;
        remember(g.title, release_date.slice(0, 4), total);
        const type = String(g.primary_type ?? "").toLowerCase();
        out.push({
          id: `mb:${g.mbid}`,
          name: g.title,
          album_type: albumType(type, total),
          release_date,
          total_tracks: total,
          images: [{ url: caaCover(g.mbid) }],
          source: "db",
        });
        const d2 = digest2.get(rel);
        songsOf.set(`mb:${g.mbid}`, new Set(d2?.h_raw ?? []));
        titlesOfAlbum.set(`mb:${g.mbid}`, toAlbumTracks(d2));
        durOfAlbum.set(`mb:${g.mbid}`, d2?.durs ?? []);
      }
    }

    // 4) Deezer: Spotify 앨범 ID 가 없는 앨범도 낸다 (앨범 ID 는 "deezer:<번호>")
    const { data: dz } = await supabase.from("deezer_artist").select("deezer_artist_id").eq("mbid", map.mbid).eq("matched_by", "name+album");
    for (const a of dz ?? []) {
      const { data: dzAlbums } = await supabase.from("deezer_album")
        .select("deezer_album_id, title, release_date, record_type, nb_tracks")
        .eq("deezer_artist_id", a.deezer_artist_id).limit(500);

      // 이 아티스트 Deezer 앨범의 요약 (곡 수·비교용 해시·재생시간)
      const dzDigest = await loadDzDigests(supabase, (dzAlbums ?? []).map((x) => Number(x.deezer_album_id)));

      for (const alb of dzAlbums ?? []) {
        if (!alb.nb_tracks) continue;
        const yr = String(alb.release_date ?? "").slice(0, 4);
        // 화면에서 같은 제목 곡을 걸러내므로 곡 수도 걸러낸 뒤 기준으로 센다
        const dd = dzDigest.get(Number(alb.deezer_album_id));
        const total = dd?.n_distinct ?? alb.nb_tracks;
        if (!total) continue;
        if (dupe(alb.title, yr, total)) continue;   // 위에서 이미 낸 앨범이면 건너뛴다
        remember(alb.title, yr, total);
        const type = String(alb.record_type ?? "").toLowerCase();
        out.push({
          id: `deezer:${alb.deezer_album_id}`,
          name: alb.title,
          album_type: albumType(type, total),
          release_date: String(alb.release_date ?? "").slice(0, 10),
          total_tracks: total,
          images: [{ url: deezerCover(alb.deezer_album_id) }],
          source: "db",
        });
        titlesOfAlbum.set(`deezer:${alb.deezer_album_id}`, toAlbumTracks(dd));
        durOfAlbum.set(`deezer:${alb.deezer_album_id}`, dd?.durs ?? []);
      }
    }

    // 5) 같은 앨범을 출처마다 다른 제목으로 적은 경우를 합친다.
    //    발매일이 같은 앨범끼리만 비교하므로 비교 횟수가 적다.
    const byDate = new Map<string, DbAlbum[]>();
    for (const a of out) {
      const d = a.release_date.slice(0, 10);
      if (!d) continue;
      byDate.set(d, [...(byDate.get(d) ?? []), a]);
    }
    const merged = new Set<string>();     // 합쳐져서 빠지는 앨범 ID
    for (const list of byDate.values()) {
      if (list.length < 2) continue;
      // 곡이 많은 쪽을 남긴다. 곡 수가 같으면 Spotify·MusicBrainz 쪽을 남긴다 (커버가 있고 출처가 안정적이다)
      const rank = (a: DbAlbum) => (a.id.startsWith("deezer:") ? 1 : 0);
      const sorted = [...list].sort((x, y) => y.total_tracks - x.total_tracks || rank(x) - rank(y));
      for (let i = 0; i < sorted.length; i++) {
        if (merged.has(sorted[i].id)) continue;
        for (let j = i + 1; j < sorted.length; j++) {
          if (merged.has(sorted[j].id)) continue;
          const ta = titlesOfAlbum.get(sorted[i].id);
          const tb = titlesOfAlbum.get(sorted[j].id);
          const sameByDur = sameByDuration(durOfAlbum.get(sorted[i].id), durOfAlbum.get(sorted[j].id));
          if (sameByDur || (ta && tb && sameAlbum(ta, tb))) merged.add(sorted[j].id);
        }
      }
    }
    // 5-b) 발매일이 달라도 수록곡이 거의 같으면 같은 앨범이다.
    //      디럭스·기념반·리패키지·재발매가 여기 걸린다 ("Pressure Machine" / "Pressure Machine (Deluxe)",
    //      엑소 "EXODUS" / "The 2nd Album Repackage ‘LOVE ME RIGHT’").
    //      곡이 적은 앨범은 우연히 겹칠 수 있어 4곡 이상만 본다.
    const BIG = 4;
    const cand = out.filter((a) => !merged.has(a.id) && (titlesOfAlbum.get(a.id)?.raw.length ?? 0) >= BIG);
    if (cand.length > 1) {
      const byTitle = new Map<string, string[]>();          // 곡 제목 -> 그 곡이 든 앨범 ID
      for (const a of cand) {
        const t = titlesOfAlbum.get(a.id)!;
        for (let i = 0; i < t.raw.length; i++) {
          for (const k of new Set([t.raw[i], t.base[i]])) byTitle.set(k, [...(byTitle.get(k) ?? []), a.id]);
        }
      }
      // 남길 순서: 라이브·모음집이 아닌 것 -> 먼저 나온 것 -> 곡 많은 것 -> Spotify·MusicBrainz 쪽
      //
      // "곡 많은 것"을 먼저 보면 원본이 사라진다. Nirvana 는 "In Utero (Super Deluxe Edition)"(25곡,
      // 2013) 만 남고 "In Utero"(12곡, 1993) 가 숨었고, Radiohead 는 "OK Computer" 대신
      // "OKNOTOK 1997 2017" 이 남았다. 이용자가 찾는 건 원본이다. 발매일을 먼저 본다.
      // (디럭스에만 있는 곡은 대개 데모·라이브판이라, 빠져도 중복이 줄지 손해가 아니다)
      const LIVE = /(live|box|collection|anthology|greatest|best of|complete|singles)/i;
      const rank2 = (a: DbAlbum) => (LIVE.test(a.name) ? 1 : 0);
      const day = (a: DbAlbum) => a.release_date?.slice(0, 10) || "9999";
      const order = [...cand].sort((x, y) =>
        rank2(x) - rank2(y) || day(x).localeCompare(day(y)) || y.total_tracks - x.total_tracks ||
        (x.id.startsWith("deezer:") ? 1 : 0) - (y.id.startsWith("deezer:") ? 1 : 0));
      const keep = new Set<string>();
      for (const a of order) {
        if (merged.has(a.id)) continue;
        keep.add(a.id);
        const mine = titlesOfAlbum.get(a.id)!;
        const hits = new Map<string, Set<string>>();
        for (let i = 0; i < mine.raw.length; i++) {
          for (const k of new Set([mine.raw[i], mine.base[i]])) for (const other of byTitle.get(k) ?? []) {
            if (other === a.id || merged.has(other) || keep.has(other)) continue;
            const set = hits.get(other) ?? new Set<string>();
            set.add(mine.raw[i]);               // 같은 곡이 두 형태로 잡혀도 한 번만 센다
            hits.set(other, set);
          }
        }
        const nameOf = new Map(cand.map((c) => [c.id, normAlbum(c.name)]));
        // 제목이 같은 계열인가 ("In Utero" / "In Utero (Super Deluxe Edition)",
        // "Kid A" / "KID A MNESIA", "OK Computer" / "OK Computer OKNOTOK 1997 2017").
        // 판 표기는 normAlbum 이 이미 뗐으므로, 남은 건 앞부분이 같은지만 보면 된다.
        const sameFamily = (x: string, y: string) => {
          const a2 = nameOf.get(x) ?? "", b2 = nameOf.get(y) ?? "";
          if (!a2 || !b2) return false;
          const short = a2.length <= b2.length ? a2 : b2;
          return short.length >= 4 && (a2 === b2 || (a2.length <= b2.length ? b2 : a2).startsWith(short));
        };
        for (const [other, matched] of hits) {
          const size = titlesOfAlbum.get(other)?.raw.length ?? 0;
          if (size < BIG) continue;
          // 상대 앨범이 내 안에 거의 다 들어 있다 -> 상대를 뺀다
          if (matched.size / size >= 0.8) { merged.add(other); continue; }
          // 반대로 내가 상대 안에 거의 다 들어 있다. 이때는 제목이 같은 계열일 때만 뺀다.
          // 제목까지 보지 않으면 먼저 나온 EP 때문에 뒤에 나온 정규 앨범이 통째로 숨는다.
          if (mine.raw.length >= BIG && matched.size / mine.raw.length >= 0.8 && sameFamily(a.id, other)) merged.add(other);
        }
        // 제목이 서로 다른 언어라 안 겹쳐도, 곡 수와 자리별 재생시간이 맞으면 같은 앨범이다
        for (const other of cand) {
          if (other.id === a.id || merged.has(other.id) || keep.has(other.id)) continue;
          if (sameByDuration(durOfAlbum.get(a.id), durOfAlbum.get(other.id))) merged.add(other.id);
        }
      }
    }

    // out 을 비우고 다시 채운다. merged 가 비면 filter 를 건너뛰는데, 그때 같은 배열을 가리키면
    // 비우는 순간 내용까지 사라진다. 반드시 복사본을 만든다.
    const deduped = merged.size ? out.filter((a) => !merged.has(a.id)) : [...out];
    out.length = 0;
    out.push(...deduped);

    // 6) 큰 앨범에 이미 다 들어 있는 싱글·EP 는 뺀다.
    //    같은 곡을 싱글로도 앨범으로도 내는 아티스트(요아소비 등)에서 같은 곡이 두세 번 뜨던 원인이다.
    //    곡이 같은지는 MusicBrainz 녹음 ID 로 가린다 — 제목이 일본어냐 로마자냐와 무관하게 같은 녹음이면 같다.
    const SMALL = 5;                               // 이 곡 수 이하만 뺀다 (정규 앨범은 절대 빼지 않는다)
    const bySize = [...out].sort((a, b) => b.total_tracks - a.total_tracks);
    const covered = new Set<string>();
    const drop = new Set<string>();
    for (const a of bySize) {
      const songs = songsOf.get(a.id);
      if (!songs?.size) continue;                  // 곡 식별자를 모르는 앨범은 건드리지 않는다
      if (a.total_tracks <= SMALL && [...songs].every((x) => covered.has(x))) { drop.add(a.id); continue; }
      for (const x of songs) covered.add(x);
    }
    const kept = drop.size ? out.filter((a) => !drop.has(a.id)) : out;

    kept.sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)));
    return kept;
  } catch (e) {
    console.warn("[dbCatalog] getDbArtistAlbums failed:", e);
    return [];
  }
};

/**
 * 한 앨범 안 중복 곡 제거. 곡은 "(English Ver.)" 같은 표기가 붙으면 다른 곡이므로
 * 에디션 표기를 떼지 않고, 완전히 같은 제목만 걸러낸다.
 */
function dedupeTracks(map: Record<string, DbTrack[]>) {
  for (const [album, list] of Object.entries(map)) {
    const seen = new Set<string>();
    map[album] = list.filter((t) => {
      const k = normTrack(t.name);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
}

/** 앨범 ID -> DB 트랙리스트. Spotify 앨범 ID, "mb:<발매그룹>", "deezer:<번호>" 를 모두 받는다. */
export const getDbTracksByAlbum = async (albumIds: string[]): Promise<Record<string, DbTrack[]>> => {
  const out: Record<string, DbTrack[]> = {};
  const all = [...new Set((albumIds ?? []).filter(Boolean))];
  const ids = all.filter((id) => !id.includes(":"));
  const dzIds = all.filter((id) => id.startsWith("deezer:"));
  const mbIds = all.filter((id) => id.startsWith("mb:"));
  try {
    const supabase = createAdminClient();

    // MusicBrainz 단독 앨범 (발매그룹 -> 대표 발매판 -> 트랙)
    if (mbIds.length) {
      const relOf = new Map<string, string>();
      for (let i = 0; i < mbIds.length; i += 50) {
        const { data } = await supabase.from("mb_rg_release").select("release_group_mbid, release_mbid")
          .in("release_group_mbid", mbIds.slice(i, i + 50).map((id) => id.slice(3))).not("tracks_filled_at", "is", null);
        for (const r of data ?? []) relOf.set(r.release_group_mbid, r.release_mbid);
      }
      const rels = [...new Set(relOf.values())];
      const byRelease = new Map<string, DbTrack[]>();
      for (let i = 0; i < rels.length; i += 20) {
        const { data } = await supabase.from("mb_release_track")
          .select("release_mbid, disc, position, recording_mbid, title, length_ms")
          .in("release_mbid", rels.slice(i, i + 20)).order("release_mbid").order("disc").order("position").limit(2000);
        for (const t of data ?? []) {
          const list = byRelease.get(t.release_mbid) ?? [];
          list.push({ id: t.recording_mbid, name: t.title, duration_ms: t.length_ms ?? 0, disc_number: t.disc, track_number: t.position, preview_url: null, source: "db" });
          byRelease.set(t.release_mbid, list);
        }
      }
      for (const [rg, rel] of relOf) {
        const list = byRelease.get(rel);
        if (list?.length) out[`mb:${rg}`] = list;
      }
    }

    // Deezer 앨범 (우리 자체 ID)
    if (dzIds.length) {
      const nums = dzIds.map((id) => Number(id.slice(7))).filter((n) => Number.isFinite(n));
      for (let i = 0; i < nums.length; i += 20) {
        const { data } = await supabase.from("deezer_track")
          .select("deezer_album_id, idx, disk, position, title, duration_s")
          .in("deezer_album_id", nums.slice(i, i + 20)).order("deezer_album_id").order("idx").limit(2000);
        for (const t of data ?? []) {
          const key = `deezer:${t.deezer_album_id}`;
          const list = out[key] ?? [];
          list.push({
            id: `deezer:${t.deezer_album_id}:${t.idx}`,
            name: t.title,
            duration_ms: (t.duration_s ?? 0) * 1000,
            disc_number: t.disk ?? 1,
            track_number: t.position ?? t.idx + 1,
            preview_url: null,
            source: "db",
          });
          out[key] = list;
        }
      }
    }
    if (!ids.length) { dedupeTracks(out); return out; }
    const skip = await unverifiedAlbumIds(supabase, ids);
    const usable = ids.filter((id) => !skip.has(id));
    if (!usable.length) { dedupeTracks(out); return out; }

    // 1) MusicBrainz
    const releaseOf = new Map<string, string>();
    for (let i = 0; i < usable.length; i += 50) {
      const { data } = await supabase.from("mb_album_release").select("spotify_album_id, release_mbid")
        .in("spotify_album_id", usable.slice(i, i + 50)).not("tracks_filled_at", "is", null);
      for (const r of data ?? []) releaseOf.set(r.spotify_album_id, r.release_mbid);
    }
    const releases = [...new Set(releaseOf.values())];
    const mbTracks = new Map<string, DbTrack[]>();
    for (let i = 0; i < releases.length; i += 20) {
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("mb_release_track")
          .select("release_mbid, disc, position, recording_mbid, title, length_ms")
          .in("release_mbid", releases.slice(i, i + 20))
          .order("release_mbid").order("disc").order("position")
          .range(from, from + 999);
        for (const t of data ?? []) {
          const list = mbTracks.get(t.release_mbid) ?? [];
          list.push({ id: t.recording_mbid, name: t.title, duration_ms: t.length_ms ?? 0, disc_number: t.disc, track_number: t.position, preview_url: null, source: "db" });
          mbTracks.set(t.release_mbid, list);
        }
        if (!data || data.length < 1000) break;
      }
    }
    for (const [album, release] of releaseOf) {
      const list = mbTracks.get(release);
      if (list?.length) out[album] = list;
    }

    // 2) Discogs (MusicBrainz 에 없는 앨범만)
    const rest = usable.filter((id) => !out[id]);
    if (rest.length) {
      const relOf = new Map<string, number>();
      for (let i = 0; i < rest.length; i += 50) {
        const { data } = await supabase.from("discogs_album_match").select("spotify_album_id, release_id").in("spotify_album_id", rest.slice(i, i + 50));
        for (const r of data ?? []) relOf.set(r.spotify_album_id, Number(r.release_id));
      }
      const relIds = [...new Set(relOf.values())];
      const dTracks = new Map<number, DbTrack[]>();
      for (let i = 0; i < relIds.length; i += 20) {
        const { data } = await supabase.from("discogs_track").select("release_id, idx, position, title, duration")
          .in("release_id", relIds.slice(i, i + 20)).order("release_id").order("idx").limit(2000);
        for (const t of data ?? []) {
          const [m, s] = String(t.duration ?? "").split(":").map(Number);
          const pos = String(t.position ?? "").match(/^(?:CD)?(\d+)[-.](\d+)$/i);
          const list = dTracks.get(Number(t.release_id)) ?? [];
          const disc = pos ? Number(pos[1]) : 1;
          list.push({
            id: `discogs:${t.release_id}:${t.idx}`,
            name: t.title,
            duration_ms: Number.isFinite(m) && Number.isFinite(s) ? (m * 60 + s) * 1000 : 0,
            disc_number: disc,
            track_number: pos ? Number(pos[2]) : list.filter((x) => x.disc_number === disc).length + 1,
            preview_url: null,
            source: "db",
          });
          dTracks.set(Number(t.release_id), list);
        }
      }
      for (const [album, rel] of relOf) {
        const list = dTracks.get(rel);
        if (list?.length) out[album] = list;
      }
    }

    dedupeTracks(out);
  } catch (e) {
    console.warn("[dbCatalog] getDbTracksByAlbum failed:", e);
  }
  return out;
};

/**
 * 우리 DB 에서 아티스트를 찾는다. Spotify 호출 0회.
 *
 * Spotify 검색이 막히면 지금까지는 curatedArtists 136명으로 떨어졌다. 그런데 우리 DB 는
 * 2,200팀 넘게 알고 있다. 그걸 안 쓰고 136명만 보여 주는 건 손해다.
 * 한글로 찾아도 잡힌다 — name_ko 를 같이 본다 (Spotify 검색은 한글에 약하다).
 *
 * 이름은 CC0 층(MusicBrainz)에서, 사진은 Spotify 캐시에서 가져온다. 사진이 없으면 그냥 없이 낸다
 * (화면의 SafeImage 가 아티스트용 대체 이미지를 쓴다). 무작위 사진을 끼워 넣지 않는다.
 */
export const searchDbArtists = async (
  query: string,
  limit = 10,
  offset = 0,
): Promise<{ id: string; name: string; images: { url: string }[]; popularity: number }[]> => {
  const q = (query ?? "").trim();
  if (q.length < 1) return [];
  try {
    const supabase = createAdminClient();
    const like = `%${q.replace(/[%_]/g, (m) => `\${m}`)}%`;
    const { data, error } = await supabase
      .from("artist_serve_snapshot")
      .select("spotify_id, name, name_ko, tracks_servable")
      .in("confidence", ["url_rel", "manual", "wikidata"])   // 연결을 믿을 수 있는 것만
      .or(`name.ilike.${like},name_ko.ilike.${like}`)
      .order("tracks_servable", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error || !data?.length) return [];

    // 사진은 Spotify 캐시에서. 만료된 캐시는 쓰지 않는다 (약관상 임시 보관이다)
    const ids = data.map((r) => r.spotify_id);
    const img = new Map<string, { url: string }[]>();
    const pop = new Map<string, number>();
    const { data: cached } = await supabase
      .from("spotify_cache_artists")
      .select("id, images, popularity")
      .in("id", ids)
      .gt("expires_at", new Date().toISOString());
    for (const c of cached ?? []) {
      if (Array.isArray(c.images) && c.images.length) img.set(c.id, c.images);
      if (typeof c.popularity === "number") pop.set(c.id, c.popularity);
    }
    return data.map((r) => ({
      id: r.spotify_id,
      name: r.name || r.name_ko || "",
      images: img.get(r.spotify_id) ?? [],
      popularity: pop.get(r.spotify_id) ?? 50,
    }));
  } catch (e) {
    console.warn("[DB] searchDbArtists 실패:", e);
    return [];
  }
};

/**
 * 장르 피드를 우리 DB 로 채운다. Spotify 호출 0회.
 *
 * 왜: 탐색 화면의 무한스크롤이 장르마다 Spotify 검색을 부른다. 깊게 내릴수록 호출이 늘고,
 *     사람이 늘면 그만큼 또 는다. 반면 DB 로 내면 사람 수와 무관하게 0회다.
 *     장르 라벨은 Wikidata P136(CC0)에서 채웠다 (MusicBrainz tags 는 CC-BY-NC-SA 라 못 쓴다).
 *
 * 사진은 Spotify 캐시에서 가져오고, 없으면 없이 낸다.
 */
export const getDbArtistsByGenre = async (
  genre: string,
  limit: number,
  offset: number,
): Promise<{ id: string; name: string; images: { url: string }[]; genres: string[]; popularity: number }[]> => {
  const g = (genre ?? "").trim().toLowerCase();
  if (!g) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("artist_genre_feed")
      .select("spotify_id, name, name_ko, tracks_servable")
      .eq("genre", g)
      // 우리가 끝까지 낼 수 있는 아티스트를 앞에 둔다. 눌렀을 때 Spotify 를 안 부르게 된다
      .order("tracks_servable", { ascending: false })
      .order("spotify_id")
      .range(offset, offset + limit - 1);
    if (error || !data?.length) return [];

    const ids = data.map((r) => r.spotify_id);
    const img = new Map<string, { url: string }[]>();
    const pop = new Map<string, number>();
    const { data: cached } = await supabase
      .from("spotify_cache_artists")
      .select("id, images, popularity")
      .in("id", ids)
      .gt("expires_at", new Date().toISOString());
    for (const c of cached ?? []) {
      if (Array.isArray(c.images) && c.images.length) img.set(c.id, c.images);
      if (typeof c.popularity === "number") pop.set(c.id, c.popularity);
    }
    return data.map((r) => ({
      id: r.spotify_id,
      name: r.name || r.name_ko || "",
      images: img.get(r.spotify_id) ?? [],
      genres: [g],
      popularity: pop.get(r.spotify_id) ?? 50,
    }));
  } catch (e) {
    console.warn("[DB] getDbArtistsByGenre 실패:", e);
    return [];
  }
};
