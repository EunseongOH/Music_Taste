// 예산 가드 확인: 예산 0 이면 Spotify 를 부르지 않고 빈 배열, DB 에 있는 앨범은 그대로 나온다.
import { getAlbumTracks } from "../src/utils/spotify";

// 사용: SPOTIFY_TRACK_BUDGET=0 npx tsx --env-file=.env.local scripts/check-track-budget.ts
// 예산을 0 으로 두고 돌린다. 그래야 Spotify 를 실제로 부르지 않는다.
async function main() {
  if (process.env.SPOTIFY_TRACK_BUDGET !== "0") {
    throw new Error("SPOTIFY_TRACK_BUDGET=0 으로 돌려야 한다 (안 그러면 Spotify 쿼터를 태운다)");
  }
  const dbBacked = "7wOOA7l306K8HfBKfPoafr";        // Nirvana In Utero (Discogs 로 DB 에 있음)
  const spotifyOnly = "1S7mumn7D4riEX2eVWfNIw";     // DB 에 없는 앨범
  const a = await getAlbumTracks(dbBacked);
  const b = await getAlbumTracks(spotifyOnly);
  console.log(`예산=${process.env.SPOTIFY_TRACK_BUDGET} · DB앨범 ${a.length}곡 · Spotify앨범 ${b.length}곡`);
  {
    if (a.length === 0) throw new Error("실패: DB 앨범은 예산과 무관하게 나와야 한다");
    if (b.length !== 0) throw new Error("실패: 예산 0 인데 Spotify 를 불렀다");
    console.log("통과: 예산 0 에서 DB 는 살고 Spotify 는 안 부른다");
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
