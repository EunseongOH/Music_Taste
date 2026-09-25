import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient as createServerClient } from "@/utils/supabase/server";

/**
 * 회원 탈퇴.
 *
 * 계정 삭제는 브라우저에서 할 수 없다(service_role 이 필요하다). 그래서 서버에 둔다.
 * **누구를 지울지는 요청 본문이 아니라 쿠키의 세션에서 읽는다** — 본문으로 받으면
 * 남의 계정 id 를 적어 보내는 것으로 남을 지울 수 있다.
 *
 * 지우는 순서가 중요하다. 계정을 먼저 지우면 그 뒤의 정리를 할 수 없다.
 *   1) 같이 소트하기 참여 기록의 **닉네임만** 지운다
 *   2) 탈퇴 이유를 계정과 무관하게 남긴다
 *   3) 계정을 지운다 — 나머지는 테이블마다 정해진 대로 따라간다
 *        CASCADE  취향표 · 들어볼 곡 · 임시저장 · 가사 제안  (같이 지워진다)
 *        SET NULL 미발매곡 · 같이 소트하기 방 · 제보          (남고 연결만 끊긴다)
 *
 * 참여 기록을 지우지 않고 이름만 지우는 이유: 같이 소트한 사람들의 결과에서 내 줄이
 * 통째로 사라지면 그 사람들의 종합 일치율이 바뀐다. 남의 결과를 내가 탈퇴했다고
 * 바꾸는 것은 그 사람 것을 건드리는 일이다. 순위는 곡 id 배열이라 누구인지 알 수 없다.
 */
export async function POST(req: Request) {
  let reason = "";
  let detail = "";
  try {
    const body = (await req.json()) as { reason?: unknown; detail?: unknown };
    reason = typeof body.reason === "string" ? body.reason.slice(0, 80) : "";
    detail = typeof body.detail === "string" ? body.detail.slice(0, 500) : "";
  } catch {
    /* 이유를 못 읽어도 탈퇴 자체는 막지 않는다 */
  }

  const supabase = await createServerClient();
  const admin = createAdminClient();

  let { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // 토스 미니앱은 쿠키가 아니라 localStorage 에 세션을 두고, 다른 출처(sortify.kr)로
    // 부른다 — 쿠키가 실려 오지 않는다. 그래서 토큰을 헤더로 받는다.
    // **여전히 본문이 아니다**: 서명을 서버가 검증하므로 남의 id 를 적어 보낼 수 없다.
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) user = (await admin.auth.getUser(token)).data.user;
  }
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  /*
   * 1) 참여 기록은 남기고 이름만 지운다.
   *
   * 참여 키만 보면 안 된다 — 참여 키가 계정 uuid 였던 것은 신원과 소유권을 가르기 전의
   * 옛 기록뿐이다(20260924000000). 그 뒤로는 기기 키로 참여하고 계정은 `user_id` 에
   * 붙으므로, 계정으로 남긴 기록은 참여 키로 찾히지 않는다. 둘 다 보지 않으면
   * **탈퇴한 사람의 닉네임이 방에 남는다.**
   */
  const { error: anonErr } = await admin
    .from("sort_challenge_entries")
    .update({ nickname: null })
    .or(`user_id.eq.${user.id},participant_key.eq.${user.id}`);
  if (anonErr) {
    console.error("[account/delete] 참여 기록 익명화 실패:", anonErr.message);
    return NextResponse.json({ error: "지우는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  // 2) 이유는 계정과 연결하지 않는다. 실패해도 탈퇴를 막지 않는다.
  if (reason) {
    const { error } = await admin.from("account_deletion_reasons").insert({ reason, detail: detail || null });
    if (error) console.error("[account/delete] 이유 기록 실패:", error.message);
  }

  // 3) 계정 삭제. 여기서 실패하면 아무것도 지워지지 않은 것으로 봐야 한다.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("[account/delete] 계정 삭제 실패:", delErr.message);
    return NextResponse.json({ error: "계정을 지우지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  // 서버 쪽 세션 쿠키를 정리한다. 실패해도 계정은 이미 없다.
  try { await supabase.auth.signOut(); } catch { /* 이미 지워진 계정이라 실패할 수 있다 */ }

  return NextResponse.json({ ok: true });
}
