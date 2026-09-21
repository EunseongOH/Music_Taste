-- 이용자 의견 수집 (계획: docs/feedback-plan.md)
--
-- 받는 것은 셋이다: 곡·아티스트 정보 오류(data_error), 기능 아이디어(idea),
-- 그 외 서비스 의견(service). 진입점마다 테이블을 나누지 않고 kind 로 가른다.
--
-- additive-only. 기존 테이블·정책은 건드리지 않는다.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('data_error','idea','service')),

  -- 1000자 캡을 DB 에 둔다. 클라이언트만 믿으면 용량 방어가 안 된다.
  -- 1건 ≈ 1KB 라 1만 건이 10MB 다 (Supabase 무료 한도에 무해).
  message     text not null check (char_length(message) between 5 and 1000),

  -- 선택 입력. "반영됐을 때 알려주는 용도로만 쓰고 처리 후 지운다" 고 폼에
  -- 안내하므로, status 를 'done' 으로 바꿀 때 함께 null 로 비운다
  -- (src/utils/feedbackDb.ts 의 markFeedbackDone).
  -- 연락처를 자유 텍스트로 받지 않는 이유: 인스타 아이디·전화번호가 섞여 들어오면
  -- 수집 항목을 특정할 수 없다. 앱인토스 오픈 정책의 최소 수집 원칙에도 어긋난다.
  email       text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- 진입점이 자동으로 채운다. 사용자가 입력하지 않는다.
  -- { path, locale, platform, artist_id?, artist_name?, album_id?, album_title? }
  context     jsonb not null default '{}',

  -- 비로그인 제출을 허용하므로 null 이 될 수 있다.
  user_id     uuid references auth.users(id) on delete set null,

  -- 2단계만. 혼자 보는 큐라 in_progress·우선순위는 만들지 않는다.
  status      text not null default 'new' check (status in ('new','done')),
  admin_note  text,

  created_at  timestamptz not null default now()
);

-- 어드민 화면이 보는 유일한 순서다.
create index if not exists feedback_triage_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- 웹 사용자 상당수가 비로그인이다. 로그인을 요구하면 의견 자체가 들어오지 않는다.
-- 스팸 방어는 길이 check + 클라이언트 쿨다운으로 시작한다.
create policy "anyone can submit" on public.feedback
  for insert to anon, authenticated with check (true);

-- 읽기는 관리자만. 본인 제보 조회 화면을 만들지 않으므로 이메일이 다른
-- 사용자에게 노출될 경로가 없다. is_admin() 은 unreleased_tracks 가 쓰는 것과 같은 함수다.
create policy "admins read" on public.feedback
  for select to authenticated using (public.is_admin());

create policy "admins update" on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins delete" on public.feedback
  for delete to authenticated using (public.is_admin());
