// 검색 예산 가드 확인. Spotify 호출 0회.
//
// 예산을 0 으로 막아 놓고, 아티스트 검색이 curatedArtists 136명이 아니라
// 우리 DB(2,200팀 이상)로 답하는지 본다. 한글 검색도 되는지 함께 본다.
//
// 사용: SPOTIFY_SEARCH_BUDGET=0 npx tsx --env-file=.env.local scripts/check-search-budget.ts

import { searchDbArtists } from "../src/utils/dbCatalog";
import { searchSpotifyArtists } from "../src/utils/spotify";

async function main() {
  if (process.env.SPOTIFY_SEARCH_BUDGET !== "0") {
    throw new Error("SPOTIFY_SEARCH_BUDGET=0 으로 돌려야 한다 (안 그러면 Spotify 쿼터를 태운다)");
  }
  for (const q of ["아이유", "잔나비", "Radiohead", "뉴진스"]) {
    const db = await searchDbArtists(q, 5, 0);
    const via = await searchSpotifyArtists(q, 5, 0);
    console.log(`"${q}" · DB ${db.length}팀 [${db.slice(0, 3).map((a) => a.name).join(", ")}] · 검색함수 ${via.length}팀`);
    if (!db.length) throw new Error(`실패: DB 에서 "${q}" 를 못 찾았다`);
    if (!via.length) throw new Error(`실패: 예산 0 인데 "${q}" 가 빈손이다 (DB 폴백이 안 걸렸다)`);
  }
  console.log("통과: 예산 0 에서도 DB 로 답한다 (한글 포함)");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
