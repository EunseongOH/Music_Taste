/**
 * 모드 노출 스위치. 계획·복원 절차: docs/mode-pivot.md
 *
 * 믹스 매치 월드컵(여러 아티스트)은 2026-09-21 사용자 진입점에서 내렸다.
 * **지운 게 아니라 가린 것이다** — 화면 코드(`src/app/genres/*`), 두 모드로 갈리는
 * 분기, DB 열(`is_single_artist`), 이미 만들어진 취향표 27건 전부 그대로 있다.
 *
 * 되살리려면 이 값을 true 로 바꾸고, 토스 라우트 표(`toss/app/src/App.tsx`)의
 * `/genres` 두 줄 주석을 풀고, 검사 커밋을 revert 한다(docs/mode-pivot.md §10).
 *
 * 이유는 셋이다.
 *  1. 믹스 매치가 태우는 Spotify 호출(related-artists·랜덤 오프셋 장르 검색)은
 *     캐시가 먹지 못해 이용자가 늘수록 선형으로 늘어난다.
 *  2. 같은 곡 세트를 주고받는 고리(`/together`)는 한 아티스트 모드에서만 성립한다.
 *  3. 최근 30일 결과 9건 중 8건이 한 아티스트 모드였다.
 */
export const MIX_MATCH = false;
