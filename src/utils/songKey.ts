// 같은 곡인지 가리는 기준.
//
// 왜: 아이돌은 같은 곡을 정규·리패키지·라이브·일본어판·리믹스로 여러 번 낸다. 앨범 목록은 사실대로
// 보여줘야 하지만, 최애 곡을 고르는 화면과 월드컵에서 같은 곡이 여러 번 나오면 게임이 망가진다.
// (실측: 샤이니 제목이 같은 곡 171건, 슈퍼주니어 152건, 엑소 143건)
//
// 앨범 화면에는 손대지 않는다. 고르는 순간과 월드컵에 넣는 순간에만 쓴다.

/** 괄호·대시 뒤에 붙는 판 표기. "(Part 2)" 같은 진짜 다른 곡은 남긴다. */
const VERSION_WORDS =
  "inst\\.?|instrumental|feat\\.?|featuring|with|ver\\.?|version|remaster(?:ed)?|live|acoustic|" +
  "edit|remix|mix|radio|extended|demo|bonus|reprise|orchestra|orchestral|piano|" +
  "korean|japanese|english|chinese|mandarin|spanish|kr|jp|en|" +
  "sped\\s*up|slowed|club|dance|original|single|album|short|tv|movie|drama|ost";

const BRACKET = new RegExp(`\\s*[（(\\[【][^）)\\]】]*(?:${VERSION_WORDS})[^）)\\]】]*[）)\\]】]`, "gi");
const DASH = new RegExp(`\\s*[-–—]\\s*[^-–—]*(?:${VERSION_WORDS})[^-–—]*$`, "i");

/** 곡 제목에서 판 표기를 뗀다. */
export function songTitleBase(title: string): string {
  let s = (title || "").normalize("NFKC");
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(BRACKET, "").replace(DASH, "");
    if (s === before) break;
  }
  return s.trim();
}

/** 같은 아티스트의 같은 곡이면 같은 키. 다른 아티스트의 같은 제목은 다른 키다. */
export function songKey(artistName: string, title: string): string {
  const norm = (x: string) => (x || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const base = norm(songTitleBase(title)) || norm(title);
  return `${norm(artistName)}|${base}`;
}

/** 같은 곡이 여러 개면 어느 것을 남길지. 판 표기가 없는 쪽, 그 다음 제목이 짧은 쪽. */
export function betterTitle(a: string, b: string): number {
  const marked = (t: string) => (songTitleBase(t) === (t || "").normalize("NFKC").trim() ? 0 : 1);
  return marked(a) - marked(b) || (a || "").length - (b || "").length;
}
