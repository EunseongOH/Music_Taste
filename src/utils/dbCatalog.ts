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
import { songTitleBase } from "./songKey";

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

/** 곡 제목용: 문장부호·공백만 정리한다 (버전 표기는 남긴다) */
const normTrack = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * 앨범끼리 비교할 때 쓰는 곡 키. 판 표기를 뗀다.
 * 라이브반과 원반, 한국어판과 중국어판이 같은 앨범인지 가리려면 "Tempo" 와 "Tempo (Live)" 를 같게 봐야 한다.
 */
const cmpTrack = (s: string) => normTrack(songTitleBase(s)) || normTrack(s);

/**
 * 앨범 재킷 URL. 저장하지 않고 ID 에서 계산한다.
 *   1순위 Cover Art Archive (CC0). 없는 앨범이 3분의 1쯤 되고, 그때는 404 가 온다.
 *   2순위 Deezer 커버 (앨범 ID 만 있으면 URL 이 정해진다. 이미지를 우리 쪽에 저장하지 않는다)
 * 화면(SafeImage)이 1순위가 실패하면 2순위로, 그것도 없으면 대체 이미지로 내려간다.
 */
const caaCover = (releaseGroupMbid: string) => `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-500`;
const deezerCover = (deezerAlbumId: number | string) => `https://api.deezer.com/album/${deezerAlbumId}/image?size=big`;

/** 두 글자 묶음 기준 유사도 (0~1). 오타나 표기 차이를 견딘다. "iremember" vs "iremeber" ≈ 0.94 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (x: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
    return m;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const [g, n] of ga) hit += Math.min(n, gb.get(g) ?? 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}

/**
 * 두 앨범이 같은 앨범인가. 출처마다 제목을 다르게 적기 때문에 제목만으로는 못 가린다.
 *   "I.O.I : LOOP" / "I.O.I 3rd MINI ALBUM [I.O.I : LOOP]"
 *   "소나기" / "DOWNPOUR"   (한글 제목과 영어 제목)
 *   "Whatta Man" / "Whatta Man (Good Man)"
 * 그래서 수록곡으로 가린다. 적은 쪽 곡의 6할 이상이 상대 앨범에도 있으면 같은 앨범으로 본다.
 */
type AlbumTracks = Map<string, string>;   // 곡 제목(그대로) -> 판 표기를 뗀 제목

/** 두 앨범이 얼마나 겹치나 (적은 쪽 기준 0~1). 표기가 달라도 같은 곡으로 본다. */
function overlap(a: AlbumTracks, b: AlbumTracks, fuzzy: boolean): number {
  const small = a.size <= b.size ? a : b;
  const big = a.size <= b.size ? b : a;
  if (!small.size) return 0;
  const bigRaw = new Set(big.keys());
  const bigBase = new Set(big.values());
  let hit = 0;
  for (const [raw, base] of small) {
    // 출처마다 "지킬 (Jekyll)" 로도 "지킬 Jekyll" 로도 적는다. 두 형태를 다 본다
    if (bigRaw.has(raw) || bigBase.has(base) || bigRaw.has(base) || bigBase.has(raw)) { hit++; continue; }
    if (!fuzzy) continue;
    for (const u of bigRaw) if (similarity(raw, u) >= 0.85) { hit++; break; }
  }
  return hit / small.size;
}

/**
 * 곡 수가 같고 자리별 재생시간이 맞으면 같은 앨범이다.
 * 한쪽은 한국어 제목, 다른 쪽은 로마자 제목이라 제목으로는 못 잡는 경우를 여기서 잡는다
 * (빅뱅 "Bigbang Vol.1" 2006 / "BIGBANG Vol.1" 2014 — "다음날" 과 "Next Day (SeungRi Solo)").
 */
function sameByDuration(a?: number[], b?: number[]): boolean {
  if (!a || !b || a.length < 4 || a.length !== b.length) return false;
  let hit = 0, seen = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i] || !b[i]) continue;
    seen++;
    if (Math.abs(a[i] - b[i]) <= 5000) hit++;
  }
  return seen >= 4 && hit / seen >= 0.8;
}

function sameAlbum(a: AlbumTracks, b: AlbumTracks): boolean {
  return overlap(a, b, true) >= 0.6;
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
    const titlesOf = new Map<string, Set<string>>();
    const cmpOf = new Map<string, AlbumTracks>();      // 발매판 -> 곡 제목 (앨범 비교용)
    const durOf = new Map<string, { d: number; p: number; ms: number }[]>();   // 발매판 -> 자리별 재생시간
    const recsOf = new Map<string, Set<string>>();     // 발매판 -> 녹음 ID
    for (let i = 0; i < releaseIds.length; i += 50) {
      const { data } = await supabase.from("mb_release_track").select("release_mbid, title, recording_mbid, disc, position, length_ms").in("release_mbid", releaseIds.slice(i, i + 50)).limit(10000);
      for (const t of data ?? []) {
        const key = normTrack(t.title);
        if (!key) continue;                      // 제목이 기호뿐인 곡은 화면에서도 빠진다. 개수에도 넣지 않는다
        const set = titlesOf.get(t.release_mbid) ?? new Set<string>();
        set.add(key);
        titlesOf.set(t.release_mbid, set);
        const cset = cmpOf.get(t.release_mbid) ?? new Map<string, string>();
        cset.set(key, cmpTrack(t.title));
        cmpOf.set(t.release_mbid, cset);
        durOf.set(t.release_mbid, [...(durOf.get(t.release_mbid) ?? []), { d: t.disc ?? 1, p: t.position ?? 0, ms: t.length_ms ?? 0 }]);
        const rec = recsOf.get(t.release_mbid) ?? new Set<string>();
        if (t.recording_mbid) rec.add(t.recording_mbid);
        recsOf.set(t.release_mbid, rec);
      }
    }
    const trackCount = new Map<string, number>([...titlesOf].map(([k, v]) => [k, v.size]));

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
        album_type: type === "single" ? "single" : type === "ep" ? "ep" : "album",
        release_date,
        total_tracks: total,
        images: [
          ...(rgOf.get(albumId) ? [{ url: caaCover(rgOf.get(albumId)!) }] : []),
          ...(dzCoverOf.has(albumId) ? [{ url: deezerCover(dzCoverOf.get(albumId)!) }] : []),
        ],
        source: "db",
      });
      if (src.release) {
        songsOf.set(albumId, recsOf.get(src.release) ?? new Set());
        titlesOfAlbum.set(albumId, cmpOf.get(src.release) ?? new Map());
        durOfAlbum.set(albumId, seq(durOf.get(src.release)));
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
      const titles2 = new Map<string, Set<string>>();
      const cmp2 = new Map<string, AlbumTracks>();
      const recs2 = new Map<string, Set<string>>();
      for (let i = 0; i < relIds2.length; i += 50) {
        const { data } = await supabase.from("mb_release_track").select("release_mbid, title, recording_mbid, disc, position, length_ms").in("release_mbid", relIds2.slice(i, i + 50)).limit(10000);
        for (const t of data ?? []) {
          const key = normTrack(t.title);
          if (!key) continue;
          const set = titles2.get(t.release_mbid) ?? new Set<string>();
          set.add(key);
          titles2.set(t.release_mbid, set);
          const cset = cmp2.get(t.release_mbid) ?? new Map<string, string>();
          cset.set(key, cmpTrack(t.title));
          cmp2.set(t.release_mbid, cset);
          durOf.set(t.release_mbid, [...(durOf.get(t.release_mbid) ?? []), { d: t.disc ?? 1, p: t.position ?? 0, ms: t.length_ms ?? 0 }]);
          const rec = recs2.get(t.release_mbid) ?? new Set<string>();
          if (t.recording_mbid) rec.add(t.recording_mbid);
          recs2.set(t.release_mbid, rec);
        }
      }
      for (const g of restRg) {
        const rel = rgRel.get(g.mbid);
        if (!rel) continue;
        const total = titles2.get(rel)?.size ?? 0;
        if (!total) continue;
        const release_date = String(g.first_release_date ?? "").slice(0, 10) || "";
        if (dupe(g.title, release_date.slice(0, 4), total)) continue;
        remember(g.title, release_date.slice(0, 4), total);
        const type = String(g.primary_type ?? "").toLowerCase();
        out.push({
          id: `mb:${g.mbid}`,
          name: g.title,
          album_type: type === "single" ? "single" : type === "ep" ? "ep" : "album",
          release_date,
          total_tracks: total,
          images: [{ url: caaCover(g.mbid) }],
          source: "db",
        });
        songsOf.set(`mb:${g.mbid}`, recs2.get(rel) ?? new Set());
        titlesOfAlbum.set(`mb:${g.mbid}`, cmp2.get(rel) ?? new Map());
        durOfAlbum.set(`mb:${g.mbid}`, seq(durOf.get(rel)));
      }
    }

    // 4) Deezer: Spotify 앨범 ID 가 없는 앨범도 낸다 (앨범 ID 는 "deezer:<번호>")
    const { data: dz } = await supabase.from("deezer_artist").select("deezer_artist_id").eq("mbid", map.mbid).eq("matched_by", "name+album");
    for (const a of dz ?? []) {
      const { data: dzAlbums } = await supabase.from("deezer_album")
        .select("deezer_album_id, title, release_date, record_type, nb_tracks")
        .eq("deezer_artist_id", a.deezer_artist_id).limit(500);

      // 이 아티스트 Deezer 앨범의 실제 곡 수·곡 제목 (같은 제목 곡을 뺀 뒤)
      const dzTrackCount = new Map<number, number>();
      const dzTitles = new Map<number, Set<string>>();
      const dzCmp = new Map<number, AlbumTracks>();
      const dzIds = (dzAlbums ?? []).map((x) => x.deezer_album_id);
      for (let i = 0; i < dzIds.length; i += 40) {
        const titles = new Map<number, Set<string>>();
        for (let from = 0; ; from += 1000) {
          const { data } = await supabase.from("deezer_track").select("deezer_album_id, title, idx, duration_s")
            .in("deezer_album_id", dzIds.slice(i, i + 40)).range(from, from + 999);
          for (const t of data ?? []) {
            const key = normTrack(t.title);
            if (!key) continue;
            const set = titles.get(t.deezer_album_id) ?? new Set<string>();
            set.add(key);
            titles.set(t.deezer_album_id, set);
            const cset = dzCmp.get(t.deezer_album_id) ?? new Map<string, string>();
            cset.set(key, cmpTrack(t.title));
            dzCmp.set(t.deezer_album_id, cset);
            const dk = `deezer:${t.deezer_album_id}`;
            durOf.set(dk, [...(durOf.get(dk) ?? []), { d: 1, p: t.idx ?? 0, ms: (t.duration_s ?? 0) * 1000 }]);
          }
          if (!data || data.length < 1000) break;
        }
        for (const [k, v] of titles) { dzTrackCount.set(k, v.size); dzTitles.set(k, v); }
      }

      for (const alb of dzAlbums ?? []) {
        if (!alb.nb_tracks) continue;
        const yr = String(alb.release_date ?? "").slice(0, 4);
        // 화면에서 같은 제목 곡을 걸러내므로 곡 수도 걸러낸 뒤 기준으로 센다
        const total = dzTrackCount.get(alb.deezer_album_id) ?? alb.nb_tracks;
        if (!total) continue;
        if (dupe(alb.title, yr, total)) continue;   // 위에서 이미 낸 앨범이면 건너뛴다
        remember(alb.title, yr, total);
        const type = String(alb.record_type ?? "").toLowerCase();
        out.push({
          id: `deezer:${alb.deezer_album_id}`,
          name: alb.title,
          album_type: type === "single" ? "single" : type === "ep" ? "ep" : "album",
          release_date: String(alb.release_date ?? "").slice(0, 10),
          total_tracks: total,
          images: [{ url: deezerCover(alb.deezer_album_id) }],
          source: "db",
        });
        titlesOfAlbum.set(`deezer:${alb.deezer_album_id}`, dzCmp.get(alb.deezer_album_id) ?? new Map());
        durOfAlbum.set(`deezer:${alb.deezer_album_id}`, seq(durOf.get(`deezer:${alb.deezer_album_id}`)));
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
    const cand = out.filter((a) => !merged.has(a.id) && (titlesOfAlbum.get(a.id)?.size ?? 0) >= BIG);
    if (cand.length > 1) {
      const byTitle = new Map<string, string[]>();          // 곡 제목 -> 그 곡이 든 앨범 ID
      for (const a of cand) for (const [raw, base] of titlesOfAlbum.get(a.id)!) {
        for (const k of new Set([raw, base])) byTitle.set(k, [...(byTitle.get(k) ?? []), a.id]);
      }
      // 남길 순서: 라이브·모음집이 아닌 것 -> 곡 많은 것 -> Spotify·MusicBrainz 쪽
      const LIVE = /(live|box|collection|anthology|greatest|best of|complete|singles)/i;
      const rank2 = (a: DbAlbum) => (LIVE.test(a.name) ? 1 : 0);
      const order = [...cand].sort((x, y) =>
        rank2(x) - rank2(y) || y.total_tracks - x.total_tracks ||
        (x.id.startsWith("deezer:") ? 1 : 0) - (y.id.startsWith("deezer:") ? 1 : 0));
      const keep = new Set<string>();
      for (const a of order) {
        if (merged.has(a.id)) continue;
        keep.add(a.id);
        const mine = titlesOfAlbum.get(a.id)!;
        const hits = new Map<string, Set<string>>();
        for (const [raw, base] of mine) {
          for (const k of new Set([raw, base])) for (const other of byTitle.get(k) ?? []) {
            if (other === a.id || merged.has(other) || keep.has(other)) continue;
            const set = hits.get(other) ?? new Set<string>();
            set.add(raw);                       // 같은 곡이 두 형태로 잡혀도 한 번만 센다
            hits.set(other, set);
          }
        }
        for (const [other, matched] of hits) {
          const size = titlesOfAlbum.get(other)?.size ?? 0;
          if (size >= BIG && matched.size / size >= 0.8) merged.add(other);   // 상대 앨범이 내 안에 거의 다 들어 있다
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
