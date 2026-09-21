# 이용자 의견 수집 계획 — 어디서 받고, 어디서 확인할 것인가

작성 2026-09-21. 받을 것은 셋이다. **곡·아티스트 정보 오류**, **기능 아이디어**, **그 외 서비스 의견**.
이번에 만드는 진입점은 `/tracks`(트랙 디깅하기) 하나뿐이고, 나머지 진입점은 나중에 붙인다.

---

## 1. 자체 구현으로 간다 — 구글폼이 아닌 이유

결정타는 토스다. 비게임 출시 가이드 원문:

> "자사 사이트(토스 도메인 외부)로 이동하거나 그 콘텐츠를 렌더링할 수 없어요."
> "최종적으로 노출되는 콘텐츠는 반드시 토스 도메인 내에서 렌더링되어야 해요."

외부 링크는 "서비스 이용에 꼭 필요한" 것만 허용된다. `Device.openURL` 로 구글폼을 열 수는 있지만
검수 반려 리스크를 지는 선택이고, 그렇게 되면 웹·토스 채널을 따로 운영하게 된다.

나머지 두 이유:

- 데이터 오류 제보에 아티스트·곡 컨텍스트를 붙이려면 어차피 코드를 쓴다. 구글폼 prefill URL 조립도 코드다.
- 430px 고정 폭 디자인에서 폼으로 튕기면 이탈한다.

### 토스가 제공하는 리뷰 기능과는 별개다

토스 미니앱에는 이미 평점·리뷰가 있다. SDK `Review.request()`(Android/iOS 5.253.0+, 구 `requestReview` 는
deprecated), 또는 네비게이션 바의 '이용 후기 남기기'. 결과는 콘솔 → '평점 및 리뷰'에서 본다.

하지만 **별점 4점 이상일 때만 텍스트 리뷰 화면이 추가로 뜬다.** 즉 불만·버그·데이터 오류는 구조적으로
들어오지 않는다. 토스 리뷰는 평판 채널이지 개선 의견 채널이 아니다. 둘 다 필요하다.

`Review.request()` 는 만족 피크(`/taste` 취향표 완성 직후)에서 별도로 부른다. 제약:
같은 세션 반복 호출 금지, 리뷰 화면이 뜬다는 전제로 UX·보상 설계 금지(내부 피로도 정책으로 안 뜰 수 있다),
`isSupported()` 가드 필수. 이건 이 문서 범위 밖의 별도 작업이다.

---

## 2. 어디서 확인하나

**현재 상태.** 알림 경로가 없다. 어드민 대시보드(`src/app/manager-taste-control/page.tsx`)의
사이드바 배지 `count` 는 **활성 섹션일 때만 계산된다**(`page.tsx:390-391`). 지금도 미발매곡 요청이
쌓여도 페이지를 열어 섹션을 눌러봐야 안다.

세 단계로 붙인다. 위에서부터 순서대로.

| 단계 | 무엇 | 비용 |
|---|---|---|
| 1 | 어드민 대시보드에 `feedback` 섹션 추가 | `NavSection` 1줄 + `navItems` 1줄 + `sectionContent` 1개 |
| 2 | 홈의 어드민 버튼에 미처리 건수 배지 | count 쿼리 1회 |
| 3 | (그 전까지) Supabase 대시보드 Table Editor | 0줄 |

2번이 실질적인 알림이다. `src/app/page.tsx:495` 에 관리자에게만 보이는 "어드민 페이지로 이동" 버튼이
이미 있다. 여기에 `status='new'` 개수를 붙이면 **홈만 열어도 새 의견이 왔는지 보인다.**

**스킵.** 이메일·디스코드·슬랙 알림. `supabase/functions/mb-worker` 가 있어서 DB Webhook →
Edge Function 경로는 열려 있지만, 1인 운영에 하루 몇 건이면 배지로 충분하다.
**하루 10건을 넘고 반응 지연이 실제 문제가 되면 그때 붙인다.**

---

## 3. 스키마

`public.is_admin()` 이 이미 있다(`profiles.is_admin` 조회, SECURITY DEFINER). `unreleased_tracks`
정책이 쓰는 것과 같은 함수를 그대로 쓴다. 새로 만들지 않는다.

```sql
-- supabase/migrations/20260921000100_feedback.sql (additive-only)
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('data_error','idea','service')),
  message     text not null check (char_length(message) between 5 and 1000),
  email       text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  context     jsonb not null default '{}',
  user_id     uuid references auth.users(id) on delete set null,
  status      text not null default 'new' check (status in ('new','done')),
  admin_note  text,
  created_at  timestamptz not null default now()
);

create index feedback_triage_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- 비로그인도 낼 수 있어야 한다. 웹 사용자 상당수가 비로그인이다.
create policy "anyone can submit" on public.feedback
  for insert to anon, authenticated with check (true);

create policy "admins read"   on public.feedback for select to authenticated using (is_admin());
create policy "admins update" on public.feedback for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "admins delete" on public.feedback for delete to authenticated using (is_admin());
```

**용량.** 1000자 캡이라 1건 ≈ 1KB. 1만 건이 10MB다. 무료 한도에 무해하다.
캡을 DB check 로 두는 게 핵심 — 클라이언트만 믿지 않는다.

**`status` 는 `new`/`done` 2단계만.** `in_progress`·`wontfix`·우선순위는 만들지 않는다. 혼자 보는 큐다.

**본인 제보 조회 화면은 만들지 않는다.** select 를 admin 전용으로 막으면 "내 제보 현황" 화면이 필요 없고,
개인정보가 다른 사용자에게 노출될 경로가 0이 된다.

**연락처는 자유 텍스트가 아니라 이메일 한 종류만 받는다.** 자유 입력으로 두면 인스타 아이디·전화번호·
카톡 ID 가 섞여 들어와 수집 항목을 특정할 수 없다. 앱인토스 오픈 정책도 "서비스 제공에 직접 필요한
최소한의 정보만 수집"을 요구한다. 형식은 DB check 로 거른다.

---

## 4. 폼

**모달 1개. 입력 필드 3개가 상한이다.** 430px 모바일에서 필드가 늘수록 작성률이 떨어진다.
제목·심각도·재현 절차 같은 항목은 넣지 않는다.

### 사용자가 입력하는 것

| 필드 | UI | 필수 | 비고 |
|---|---|---|---|
| 종류 | 세그먼트 버튼 3개 | O | 곡·아티스트 정보 오류 / 이런 기능 있으면 좋겠어요 / 그 외 서비스 의견 |
| 내용 | textarea, 5–1000자, 글자수 카운터 | O | placeholder 에 예시 한 줄 |
| 이메일 | 한 줄 입력 | **X (선택)** | 아래 안내 문구 필수 |

### 이메일 안내 문구

입력란 바로 아래에 상시 노출한다. 체크박스 동의는 두지 않는다 — 선택 입력이고, 적는 행위 자체가 의사표시다.

> **(ko)** 선택 입력이에요. 적어주시면 의견이 반영됐을 때 알려드리는 용도로만 쓰고, 처리 후 지워요.
> 안 적으셔도 의견은 그대로 접수돼요.

> **(en)** Optional. We'll use it only to let you know when your feedback is reflected, and delete it afterward.
> You can leave it blank.

문구에 적은 대로 **처리 완료(`status='done'`) 시 `email` 을 `null` 로 지운다.** 어드민 페이지의
'처리 완료' 버튼이 같은 update 에서 함께 비운다. 적어놓고 안 지키면 그게 더 큰 문제다.

### 시스템이 자동으로 붙이는 것 (`context` jsonb)

```jsonc
{
  "path": "/tracks",           // window.location.pathname
  "locale": "ko",
  "platform": "web",           // 또는 "toss"
  "artist_id": "...",          // /tracks 진입점일 때만
  "artist_name": "...",        //  동일
  "album_id": "...",           // 앨범을 펼친 상태였다면
  "album_title": "..."
}
```

**이게 이 설계의 핵심이다.** 사용자는 *"앨범이 중복으로 떠요"* 한 줄만 쓰면 되고,
어느 아티스트인지는 시스템이 안다. 구글폼이었으면 여기서 정보가 통째로 날아간다.

`platform` 값은 기존 빌드 치환 장치를 그대로 쓴다. `src/utils/platform.ts` 에
`export const platformName = "web"`, `toss/app/src/platform.toss.ts` 에 `"toss"` — 2줄이면 된다.
vite alias(`toss/app/vite.config.mts:44`)가 이미 이 파일을 통째로 갈아끼우고 있다.

### 스팸 방어

localStorage 에 마지막 전송 시각을 저장해 60초 쿨다운. 서버단 레이트리밋은 실제로 스팸이 왔을 때 붙인다.

```
// ponytail: 클라이언트 쿨다운만. 실제 스팸 유입 시 RLS 에 per-IP 카운터 추가
```

---

## 5. 진입점 — 이번엔 `/tracks` 하나

**위치.** 아티스트 섹션을 펼쳤을 때 "미발매곡 추가" 버튼 바로 아래(`src/app/tracks/page.tsx:1792`).
같은 dashed 스타일, 한 톤 약하게.

**라벨.** "곡 정보가 잘못됐나요?" — '제보'·'신고'보다 문턱이 낮다.

**동작.** 같은 `FeedbackModal` 을 `kind="data_error"` 고정 + 종류 선택 UI 숨김으로 연다.
`artist.id` / `artist.name` 이 그 스코프에 그대로 있어서 context 가 공짜로 채워진다.
종류 선택 3버튼은 나중에 범용 진입점(홈 하단 nav 등)을 붙일 때만 노출한다.

**토스 영향 0.** 새 라우트가 없으므로 `toss/app/src/App.tsx` 라우트 표 무수정,
`npm run check:toss` 의 라우터·딥링크 체크도 그대로 통과한다. Supabase insert 는 토스 빌드에서
익명 식별키 세션(`toss/app/src/tossSession.ts`)으로 이미 동작하고, Supabase 절대 URL 호출은
`apiBase.ts` 의 fetch 래핑을 타지 않는다.

### 나중에 붙일 진입점 (보류)

| 후보 | 위치 | 판단 |
|---|---|---|
| 홈 하단 nav | `src/app/page.tsx:585-620` | 유일한 footer. 비로그인 포함 전원 노출. 범용 의견용 1순위 |
| `/taste` 결과 화면 | 취향표 완성 직후 | 만족 피크. 토스에서는 `Review.request()` 와 같은 지점 |
| ProfileHeader → ProfileModal | `src/components/ProfileHeader.tsx:39` | **부적합.** 로그인 시에만 보인다(비로그인은 "로그인" 버튼으로 바뀐다) |

---

## 6. 건드릴 파일

1. `supabase/migrations/20260921000100_feedback.sql` — 3절 DDL
2. `src/utils/feedbackDb.ts` — `submitFeedback` / `fetchFeedback` / `markFeedbackDone`(이메일 삭제 포함) / `countNewFeedback`. `unreleasedDb.ts` 패턴을 따른다
3. `src/components/FeedbackModal.tsx` — 신규. ko/en `translations` 객체 패턴
4. `src/app/tracks/page.tsx` — 버튼 1개 + 모달 마운트
5. `src/app/manager-taste-control/page.tsx` — `feedback` 섹션 1개
6. `src/app/page.tsx` / `src/utils/platform.ts` / `toss/app/src/platform.toss.ts` — 배지, `platformName` 2줄

새 라우트 없음. 새 의존성 없음.

---

## 7. 참고 문서

- [리뷰 요청 가이드](https://developers-apps-in-toss.toss.im/documentation/common/growth/review.md)
- [Review.request](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/review/review.request.md)
- [외부 URL 열기](https://developers-apps-in-toss.toss.im/documentation/common/screen/open-url.md)
- [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame.md)
- [서비스 오픈 정책](https://developers-apps-in-toss.toss.im/intro/guide.md)
