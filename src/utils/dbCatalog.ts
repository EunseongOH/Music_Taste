"use server";
// 자체 DB(카탈로그) 조회 — Spotify 호출 없이 앨범 목록과 트랙리스트를 돌려준다.
//
// 출처와 라이선스
//   - MusicBrainz core (CC0): 아티스트·발매그룹·발매판·트랙 (mb_* 테이블)
//   - Discogs 월간 덤프 (CC0): MusicBrainz 에 없는 앨범의 트랙리스트 (discogs_* 테이블)
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

/** 곡 제목용: 문장부호·공백만 정리한다 (버전 표기는 남긴다) */
const normTrack = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

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
      .in("confidence", ["url_rel", "manual"])
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
    if (!byAlbum.size) return [];

    const ids = [...byAlbum.keys()];
    const skip = await unverifiedAlbumIds(supabase, ids);

    // 앨범 메타데이터: MusicBrainz 발매그룹 (제목·발매일·종류)
    const { data: linkRows } = await supabase.from("mb_album_release").select("spotify_album_id, release_group_mbid").in("spotify_album_id", ids.slice(0, 1000));
    const rgOf = new Map((linkRows ?? []).map((r) => [r.spotify_album_id, r.release_group_mbid]));
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
    for (let i = 0; i < releaseIds.length; i += 50) {
      const { data } = await supabase.from("mb_release_track").select("release_mbid, title").in("release_mbid", releaseIds.slice(i, i + 50)).limit(10000);
      for (const t of data ?? []) {
        const set = titlesOf.get(t.release_mbid) ?? new Set<string>();
        set.add(normTrack(t.title));
        titlesOf.set(t.release_mbid, set);
      }
    }
    const trackCount = new Map<string, number>([...titlesOf].map(([k, v]) => [k, v.size]));

    const out: DbAlbum[] = [];
    const seen = new Set<string>();
    for (const [albumId, src] of byAlbum) {
      if (skip.has(albumId)) continue;
      const rg = rgOf.get(albumId) ? rgInfo.get(rgOf.get(albumId)!) : null;
      const d = src.discogs ? dInfo.get(src.discogs) : null;
      const name = rg?.title ?? d?.title;
      if (!name) continue;
      const release_date = String(rg?.first_release_date ?? d?.released ?? "").slice(0, 10) || "";
      const total = src.release ? (trackCount.get(src.release) ?? 0) : (d?.track_count ?? 0);
      if (!total) continue;
      const key = `${normAlbum(name)}|${release_date.slice(0, 4)}|${total}`;
      if (seen.has(key)) continue;   // 같은 앨범의 다른 판 중복 제거
      seen.add(key);
      const type = (rg?.primary_type ?? "").toLowerCase();
      out.push({
        id: albumId,
        name,
        album_type: type === "single" ? "single" : type === "ep" ? "ep" : "album",
        release_date,
        total_tracks: total,
        // 커버는 Cover Art Archive (mbid 로 URL 이 정해진다). 없으면 화면에서 대체 이미지가 뜬다
        images: rgOf.get(albumId) ? [{ url: `https://coverartarchive.org/release-group/${rgOf.get(albumId)}/front-500` }] : [],
        source: "db",
      });
    }
    out.sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)));
    return out;
  } catch (e) {
    console.warn("[dbCatalog] getDbArtistAlbums failed:", e);
    return [];
  }
};

/** Spotify 앨범 ID -> DB 트랙리스트. 없는 앨범은 결과에 없다. */
export const getDbTracksByAlbum = async (albumIds: string[]): Promise<Record<string, DbTrack[]>> => {
  const out: Record<string, DbTrack[]> = {};
  const ids = [...new Set((albumIds ?? []).filter(Boolean))];
  if (!ids.length) return out;
  try {
    const supabase = createAdminClient();
    const skip = await unverifiedAlbumIds(supabase, ids);
    const usable = ids.filter((id) => !skip.has(id));
    if (!usable.length) return out;

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

    // 한 앨범 안 중복 곡 제거. 곡은 "(English Ver.)" 같은 표기가 붙으면 다른 곡이므로
    // 에디션 표기를 떼지 않고, 완전히 같은 제목만 걸러낸다.
    for (const [album, list] of Object.entries(out)) {
      const seen = new Set<string>();
      out[album] = list.filter((t) => {
        const k = normTrack(t.name);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
  } catch (e) {
    console.warn("[dbCatalog] getDbTracksByAlbum failed:", e);
  }
  return out;
};
