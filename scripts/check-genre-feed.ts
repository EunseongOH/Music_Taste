// 장르 피드가 Spotify 없이 얼마나 깊게 내려가는지 본다.
//
// 사용: SPOTIFY_SEARCH_BUDGET=0 npx tsx --env-file=.env.local scripts/check-genre-feed.ts

import { searchArtistsByGenres } from "../src/utils/spotify";

async function main() {
  if (process.env.SPOTIFY_SEARCH_BUDGET !== "0") {
    throw new Error("SPOTIFY_SEARCH_BUDGET=0 으로 돌려야 한다 (안 그러면 Spotify 쿼터를 태운다)");
  }
  let worst = Infinity;
  for (const g of [["k-pop"], ["rock"], ["korean indie"], ["k-pop", "pop", "rock"]]) {
    const seen = new Set<string>();
    let pages = 0;
    for (let off = 0; off < 200; off += 20) {
      const { items } = await searchArtistsByGenres(g, 20, off);
      const fresh = items.filter((a: any) => !seen.has(a.id));
      fresh.forEach((a: any) => seen.add(a.id));
      if (!fresh.length) break;
      pages++;
    }
    console.log(`${g.join("+").padEnd(18)} ${pages}페이지 · 서로 다른 아티스트 ${seen.size}팀`);
    worst = Math.min(worst, seen.size);
  }
  if (worst < 20) throw new Error(`실패: 가장 얕은 장르가 ${worst}팀뿐이다 (한 페이지도 못 채운다)`);
  console.log("통과: Spotify 호출 0회로 피드가 채워진다");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
