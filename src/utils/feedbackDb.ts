import { createClient } from "@/utils/supabase/client";
import { platformName } from "@/utils/platform";
import { safeLocalStorage as localStorage, getSafeLocale } from "@/utils/storage";

/**
 * 이용자 의견 수집. 계획은 docs/feedback-plan.md.
 *
 * 비로그인도 낼 수 있다(RLS `anyone can submit`). 읽기·수정은 관리자만이라
 * 여기 조회 함수들은 어드민 화면에서만 부른다.
 */

export type FeedbackKind = "data_error" | "idea" | "service";
export type FeedbackStatus = "new" | "done";

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  message: string;
  email: string | null;
  context: Record<string, unknown>;
  user_id: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
}

/** DB check 와 같은 값. 폼의 글자수 카운터도 이걸 쓴다. */
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 1000;

const COOLDOWN_MS = 60_000;
const COOLDOWN_KEY = "feedback_last_sent";

/** 쿨다운에 걸렸을 때. 호출부가 안내 문구를 고르려고 타입으로 구분한다. */
export class FeedbackCooldownError extends Error {
  constructor(readonly secondsLeft: number) {
    super(`cooldown: ${secondsLeft}s left`);
  }
}

/**
 * 진입점이 주지 않아도 항상 붙는 컨텍스트.
 *
 * 사용자는 "앨범이 중복으로 떠요" 한 줄만 쓰면 되고, 어느 화면·어느 아티스트인지는
 * 시스템이 안다. 이게 없으면 자유 서술만 남아서 확인할 방법이 없다.
 */
const baseContext = (): Record<string, unknown> => ({
  path: typeof window !== "undefined" ? window.location.pathname : null,
  locale: getSafeLocale(),
  platform: platformName,
});

export const submitFeedback = async (input: {
  kind: FeedbackKind;
  message: string;
  email?: string | null;
  /** 진입점이 아는 것만 더한다. 예: artist_id, artist_name, album_id, album_title */
  context?: Record<string, unknown>;
}) => {
  const message = input.message.trim();
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    throw new Error("message length out of range");
  }

  // ponytail: 클라이언트 쿨다운만. 실제 스팸 유입 시 RLS 에 per-IP 카운터 추가
  const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
  const elapsed = Date.now() - last;
  if (last && elapsed < COOLDOWN_MS) {
    throw new FeedbackCooldownError(Math.ceil((COOLDOWN_MS - elapsed) / 1000));
  }

  const supabase = createClient();

  // getUser() 가 아니라 getSession() 을 쓴다 — 비로그인에서는 네트워크 호출 없이
  // 바로 null 이 나온다. 여기는 로그인하지 않은 사용자가 더 많은 경로다.
  const { data: { session } } = await supabase.auth.getSession();

  const email = input.email?.trim() || null;

  const { error } = await supabase.from("feedback").insert({
    kind: input.kind,
    message,
    email,
    context: { ...baseContext(), ...(input.context ?? {}) },
    user_id: session?.user?.id ?? null,
  });

  if (error) {
    console.error("[Supabase DB] Error submitting feedback:", error.message);
    throw error;
  }

  localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
};

/** 어드민 전용. 기본은 미처리 큐. */
export const fetchFeedback = async (status: FeedbackStatus = "new") => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase DB] Error fetching feedback:", error.message);
    throw error;
  }

  return (data ?? []) as FeedbackRow[];
};

/**
 * 처리 완료. 이메일을 같은 업데이트에서 비운다.
 *
 * 폼에 "처리 후 지워요" 라고 안내하므로 코드로 묶어 둔다 — 적어놓고 안 지키면
 * 그게 더 큰 문제다.
 */
export const markFeedbackDone = async (id: string) => {
  const supabase = createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status: "done", email: null })
    .eq("id", id);

  if (error) {
    console.error("[Supabase DB] Error marking feedback done:", error.message);
    throw error;
  }
};

/** 홈의 어드민 버튼 배지. 행은 가져오지 않고 개수만 센다. */
export const countNewFeedback = async () => {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error) {
    // 배지는 없어도 그만인 정보다. 홈을 깨뜨리지 않는다.
    console.error("[Supabase DB] Error counting new feedback:", error.message);
    return 0;
  }

  return count ?? 0;
};
