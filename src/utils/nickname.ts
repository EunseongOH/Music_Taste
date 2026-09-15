import { createClient } from "./supabase/client";
import { safeLocalStorage, safeSessionStorage } from "./storage";

const positiveAdjectives = [
  "행복한", "빛나는", "신나는", "아늑한", "따뜻한", "맑은", "감성적인", "싱그러운",
  "활기찬", "평화로운", "낭만적인", "아름다운", "달콤한", "향기로운", "우아한", "특별한",
  "다정한", "은은한", "쾌활한", "설레는", "단아한", "신비로운", "눈부신", "조화로운"
];

const musicNouns = [
  "LP판", "레코드", "턴테이블", "멜로디", "비트", "선율", "음반", "뮤직", "사운드",
  "헤드폰", "스피커", "노래", "아코디언", "클래식", "재즈", "팝송", "레트로", "바이닐"
];

/**
 * 화면에 보여줄 닉네임. 비었으면 기본값, 이메일 형태면 앞 3자만 남기고 가린다.
 * (예전에 이메일이 닉네임으로 저장된 계정이 있다)
 */
export function displayNickname(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  if (name.includes("@")) return `${name.split("@")[0].slice(0, 3)}***`;
  return name;
}

/**
 * 닉네임 오류 코드. DB 의 public.nickname_error / set_my_nickname 과 같은 값이다.
 * 규정의 원본은 DB(supabase/migrations/20260915000001_nickname.sql)이고,
 * 아래 validateNickname 은 입력 중 즉시 피드백을 주기 위한 사본이다.
 */
export type NicknameError =
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "banned"
  | "taken"
  | "not_authenticated"
  | "unknown";

export const NICKNAME_ERROR_TEXT: Record<"ko" | "en", Record<NicknameError, string>> = {
  ko: {
    too_short: "닉네임은 2자 이상이어야 해요.",
    too_long: "닉네임은 12자 이하여야 해요.",
    invalid_chars: "한글, 영문, 숫자, _ . 만 쓸 수 있어요. (공백 불가)",
    banned: "사용할 수 없는 닉네임이에요.",
    taken: "이미 사용 중인 닉네임이에요.",
    not_authenticated: "로그인이 필요해요.",
    unknown: "닉네임을 저장하지 못했어요. 다시 시도해 주세요.",
  },
  en: {
    too_short: "Nickname must be at least 2 characters.",
    too_long: "Nickname must be 12 characters or fewer.",
    invalid_chars: "Use Korean, English letters, numbers, _ or . only (no spaces).",
    banned: "This nickname isn't allowed.",
    taken: "This nickname is already taken.",
    not_authenticated: "Please log in first.",
    unknown: "Couldn't save your nickname. Please try again.",
  },
};

/**
 * 규정의 클라이언트 사본. 금칙어는 DB 에서만 본다 — 목록을 두 곳에 두면 갈라진다.
 * 여기서 통과해도 저장 시 DB 가 banned/taken 을 돌려줄 수 있다.
 */
export function validateNickname(name: string): NicknameError | null {
  const n = name.trim();
  if (n.length < 2) return "too_short";
  if (n.length > 12) return "too_long";
  if (!/^[가-힣A-Za-z0-9_.]+$/.test(n)) return "invalid_chars";
  return null;
}

/** 가입 전에도 쓸 수 있는 사용 가능 여부(규정 + 중복). */
export async function isNicknameAvailable(name: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("nickname_available", { p: name.trim() });
  if (error) {
    console.error("[nickname] availability check failed:", error.message);
    return false;
  }
  return data === true;
}

/**
 * 닉네임을 바꾸는 유일한 길. profiles·결과 사본·user_metadata 를 서버에서 함께
 * 갱신하고, 새 메타데이터가 담긴 세션으로 교체한다.
 *
 * `confirm` 은 사용자가 직접 확인한 이름인지다. 자동 생성은 false 로 부른다 —
 * 첫 공유 때 이름 확인 칸을 한 번 보여줄지가 이 값으로 정해진다.
 */
export async function saveNickname(
  name: string,
  { confirm = true }: { confirm?: boolean } = {}
): Promise<"ok" | NicknameError> {
  const local = validateNickname(name);
  if (local) return local;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_my_nickname", {
    p_nickname: name.trim(),
    p_confirm: confirm,
  });
  if (error) {
    console.error("[nickname] set_my_nickname failed:", error.message);
    return "unknown";
  }
  if (data !== "ok") return (data as NicknameError) ?? "unknown";

  // 서버가 user_metadata 를 바꿨으므로 세션을 새로 받아야 useAuth 의 user 에 반영된다.
  await supabase.auth.refreshSession();
  safeSessionStorage.setItem("userNickname", name.trim());
  safeLocalStorage.setItem("userNickname", name.trim());
  return "ok";
}

export const generateUniqueNickname = async (): Promise<string> => {
  for (let attempts = 0; attempts < 10; attempts++) {
    const adj = positiveAdjectives[Math.floor(Math.random() * positiveAdjectives.length)];
    const noun = musicNouns[Math.floor(Math.random() * musicNouns.length)];
    const num = Math.floor(Math.random() * 900) + 100; // 100 ~ 999
    const nickname = `${adj}${noun}${num}`;
    // 지금 단어 목록으로는 최대 11자라 걸리지 않지만, 목록을 늘려도 규정을 넘지 않게.
    if (validateNickname(nickname)) continue;
    if (await isNicknameAvailable(nickname)) return nickname;
  }
  return `멜로디바이닐${Math.floor(Math.random() * 9000) + 1000}`;
};
