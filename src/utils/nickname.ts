import { createClient } from "./supabase/client";

const positiveAdjectives = [
  "행복한", "빛나는", "신나는", "아늑한", "따뜻한", "맑은", "감성적인", "싱그러운", 
  "활기찬", "평화로운", "낭만적인", "아름다운", "달콤한", "향기로운", "우아한", "특별한",
  "다정한", "은은한", "쾌활한", "설레는", "단아한", "신비로운", "눈부신", "조화로운"
];

const musicNouns = [
  "LP판", "레코드", "턴테이블", "멜로디", "비트", "선율", "음반", "뮤직", "사운드", 
  "헤드폰", "스피커", "노래", "아코디언", "클래식", "재즈", "팝송", "레트로", "바이닐"
];

export const generateUniqueNickname = async (): Promise<string> => {
  const supabase = createClient();
  let unique = false;
  let nickname = "";
  let attempts = 0;

  while (!unique && attempts < 10) {
    attempts++;
    const adj = positiveAdjectives[Math.floor(Math.random() * positiveAdjectives.length)];
    const noun = musicNouns[Math.floor(Math.random() * musicNouns.length)];
    const num = Math.floor(Math.random() * 900) + 100; // 100 ~ 999
    nickname = `${adj}${noun}${num}`;

    // Check if duplicate exists in DB
    const { data, error } = await supabase
      .from("tournament_results")
      .select("id")
      .eq("user_nickname", nickname);

    if (!error && (!data || data.length === 0)) {
      unique = true;
    }
  }

  // Fallback if loop fails
  if (!unique) {
    nickname = `멜로디바이닐${Math.floor(Math.random() * 9000) + 1000}`;
  }

  return nickname;
};
