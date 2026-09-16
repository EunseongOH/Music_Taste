export interface RankedTrack {
  id: string;
  title: string;
  artistName: string;
  albumImage: string;
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
  }));
}
