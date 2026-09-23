/**
 * 조사 고르기 — 앞말에 받침이 있느냐로 갈린다.
 *
 * 닉네임·곡 제목처럼 **이용자가 적은 값** 뒤에 조사를 붙이는 자리에 쓴다.
 * "다다과 나", "Harmony을" 같은 문장이 화면에 나가면 공들인 화면이 한 번에 싸구려가 된다.
 *
 *   `withJosa("다다", "와")` → "다다와"   ·   `withJosa("민준", "와")` → "민준과"
 */

const PAIRS = {
  "와": ["와", "과"],
  "이": ["가", "이"],
  "은": ["는", "은"],
  "을": ["를", "을"],
  "로": ["로", "으로"],
} as const;

export type JosaKind = keyof typeof PAIRS;

/**
 * 앞말의 마지막 글자에 받침이 있나.
 *
 * 한글이 아니면(영어 제목, 숫자, 이모지) 받침을 따질 수 없다. 영어는 소리대로
 * 읽어 판단해야 맞지만 규칙이 길고 틀리기도 쉬워서, 받침 없는 쪽으로 둔다 —
 * "Harmony와"는 자연스럽고 "Harmony과"는 바로 틀려 보인다.
 * 받침이 있는 소리로 끝나는 숫자(1·3·6·7·8·0)만 따로 본다.
 */
function hasFinalConsonant(word: string): boolean {
  const ch = word.trim().at(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (ch >= "0" && ch <= "9") return "1367890".includes(ch);
  return false;
}

/**
 * 앞말에 맞는 조사만 돌려준다.
 *
 * 앞말이 따옴표나 태그로 감싸여 조사를 따로 찍어야 할 때 쓴다 —
 * `비워 두면 '{이름}'{josaOf(이름, "로")} 보여요.`
 */
export function josaOf(word: string, kind: JosaKind): string {
  const [noBatchim, batchim] = PAIRS[kind];
  return hasFinalConsonant(word) ? batchim : noBatchim;
}

/** 앞말에 조사를 붙여 돌려준다. `kind` 는 받침 없을 때의 형태로 적는다(와·이·은·을·로). */
export function withJosa(word: string, kind: JosaKind): string {
  return `${word}${josaOf(word, kind)}`;
}
