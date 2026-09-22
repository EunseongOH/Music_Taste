/**
 * 검사 스크립트가 "어느 서버를 보는지"를 한 곳에서 정한다.
 *
 * 이 폴더의 스크립트들이 저마다 다른 이름을 읽고 있었다 — `NEXT_BASE` 를 보는 것,
 * `BASE` 를 보는 것, 아무것도 안 보고 :3000 에 박힌 것. 그래서 한 번에 여러 개를
 * 돌리면 일부만 다른 서버를 찍었다. 실제로 세 세션이 여기 걸렸다:
 *  - `NEXT_BASE` 만 주고 `check:web` 을 돌려 share-check 가 :3000(다른 브랜치의 dev
 *    서버)을 찍고 타임아웃
 *  - 같은 이유로 기준 이미지 검사가 남의 화면과 비교
 *
 * 규칙: **`NEXT_BASE` 하나로 통일한다.** `BASE` 는 예전 호출을 위해 계속 읽는다.
 * 그리고 스크립트마다 첫 줄에 무엇을 보고 있는지 찍는다 — 잘못 찍고 있을 때
 * 결과를 해석하기 전에 눈에 들어와야 한다.
 */

/** Next(웹) 서버 주소. `--base <url>` > `NEXT_BASE` > `BASE` > :3000 */
export function nextBase(argv = process.argv) {
  const i = argv.indexOf('--base');
  const fromArg = i >= 0 ? argv[i + 1] : undefined;
  return fromArg ?? process.env.NEXT_BASE ?? process.env.BASE ?? 'http://localhost:3000';
}

/** 토스 빌드(Vite) 주소. `VITE_BASE` 로 바꾼다. */
export function vite() {
  return process.env.VITE_BASE ?? 'http://localhost:5173';
}

/** 무엇을 보고 있는지 첫 줄에 찍는다. */
export function announce(...pairs) {
  console.log(pairs.map(([label, url]) => `${label} ${url}`).join(' · '));
}
