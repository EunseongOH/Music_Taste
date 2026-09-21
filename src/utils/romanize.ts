// 한글 이름을 로마자로 바꾼다 (국어의 로마자 표기법, 음운 변화는 적용하지 않는 단순형).
//
// 왜 필요한가: 국내 인디 아티스트는 Spotify 에 "산만한시선" 으로, Deezer 에는 "Sanmanhan" 으로
// 올라와 있는 식이다. 한글 이름으로만 찾으면 "없음" 이 나오지만 로마자로 찾으면 있다.
// 실측: 산보 -> Sanbo, 산만한시선 -> Sanmanhan 둘 다 Deezer 에 있다.

const CHO = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const JUNG = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const JONG = ["","k","k","k","n","n","n","t","l","k","m","l","l","l","p","l","m","p","p","t","t","ng","t","t","k","t","p","h"];

/** 한글 음절 하나를 로마자로 */
function syllable(code: number): string {
  const i = code - 0xac00;
  const cho = Math.floor(i / (21 * 28));
  const jung = Math.floor((i % (21 * 28)) / 28);
  const jong = i % 28;
  return CHO[cho] + JUNG[jung] + JONG[jong];
}

/** 한글이 섞인 문자열을 로마자로. 한글이 아닌 글자는 그대로 둔다. */
export function romanize(s: string): string {
  let out = "";
  for (const ch of (s || "").normalize("NFKC")) {
    const c = ch.codePointAt(0)!;
    out += c >= 0xac00 && c <= 0xd7a3 ? syllable(c) : ch;
  }
  return out;
}

export const hasHangul = (s: string) => /[가-힣]/.test(s || "");

/**
 * 다른 서비스에서 찾아볼 이름 후보들. 앞에 올수록 그럴듯한 표기다.
 *
 * 띄어쓰기 유무가 서비스마다 다르고, 이름을 줄여서 올리는 경우도 있다.
 * "산만한시선" 은 Deezer 에 "Sanmanhan"(앞 세 글자만) 으로 있다. 그래서 앞 3~4글자만 옮긴 것도 넣는다.
 */
export function searchNames(name: string): string[] {
  const out = [name];
  if (hasHangul(name)) {
    const r = romanize(name);
    out.push(r);
    const nospace = r.replace(/\s+/g, "");
    if (nospace !== r) out.push(nospace);
    // 앞 글자만 옮긴 표기 (이름을 줄여 올린 경우)
    const syl = [...name.replace(/\s+/g, "")].filter((c) => {
      const x = c.codePointAt(0)!;
      return x >= 0xac00 && x <= 0xd7a3;
    });
    for (const n of [4, 3]) {
      if (syl.length > n + 1) out.push(romanize(syl.slice(0, n).join("")));
    }
  }
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))];
}
