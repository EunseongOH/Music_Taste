export interface RankedTrack {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
  /** 재킷이 없을 때의 다음 후보들·아티스트 사진. 예전 순위에는 없다(`trackArtwork.ts`). */
  albumImageFallbacks?: string[];
  artistImage?: string;
  artistId?: string;
}

/** DB 에 저장된 순위 한 줄. 예전 취향표는 용량을 줄이려고 {i,t,a,m} 으로 압축돼 있다. */
type StoredTrack = Partial<RankedTrack> & { i?: string; t?: string; a?: string; m?: string };

/** 저장된 순위(`tournament_results.ranking`)를 화면에서 쓰는 모양으로 맞춘다. 압축 형식도 받는다. */
export function normalizeRanking(raw: unknown): RankedTrack[] {
  if (!Array.isArray(raw)) return [];
  return (raw as StoredTrack[]).map((tr) => ({
    id: tr.id || tr.i || "",
    title: tr.title || tr.t || "",
    artistName: tr.artistName || tr.a || "",
    albumImage: tr.albumImage || (tr.m ? (tr.m.startsWith("http") ? tr.m : `https://i.scdn.co/image/${tr.m}`) : ""),
    // 그림 후보는 버리지 않는다 — 여기서 빼면 저장된 취향표를 다시 열 때 재킷 대체가 사라진다.
    ...(Array.isArray(tr.albumImageFallbacks) ? { albumImageFallbacks: tr.albumImageFallbacks } : {}),
    ...(tr.artistImage ? { artistImage: tr.artistImage } : {}),
    ...(tr.artistId ? { artistId: tr.artistId } : {}),
  }));
}

/**
 * 예전 한 아티스트 취향표에는 곡마다 아티스트 사진이 없다. 결과 행의 `artist_id` 가 **정확히**
 * 있을 때만 우리 DB(canonical_artist, 읽기 전용)에서 사진을 찾아 붙인다. 이름으로 추측하지 않고,
 * Spotify 를 새로 부르지 않는다. 없으면 그대로 — 그리는 쪽이 대체 그림으로 간다.
 */
export async function withSavedArtistImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 클라이언트의 좁은 모양만 쓴다
  supabase: { from: (t: string) => any },
  row: { is_single_artist?: boolean | null; artist_id?: string | null },
  ranking: RankedTrack[]
): Promise<RankedTrack[]> {
  if (!row.is_single_artist || !row.artist_id || ranking.every((t) => t.artistImage)) return ranking;
  try {
    const { data } = await supabase.from("canonical_artist").select("images").eq("spotify_id", row.artist_id).maybeSingle();
    const image: string | undefined = data?.images?.[0]?.url;
    if (!image) return ranking;
    return ranking.map((t) => (t.artistImage ? t : { ...t, artistImage: image, artistId: t.artistId || row.artist_id! }));
  } catch {
    return ranking;
  }
}
