-- 월드컵 임시저장 v2 — 2/2: 모드별 초안 + 만료 (docs/worldcup-draft-plan.md 5-1)
--
-- !! 새 코드 배포와 붙여서 적용한다 !!
--  - user_id 단독 유니크를 지우면 옛 코드의 upsert(onConflict: 'user_id')가 실패한다.
--  - 옛 코드는 saved_at 을 찍지 않으므로 cron 이 자동저장 초안을 1시간 뒤 지운다.
-- 되돌리기: select cron.unschedule('worldcup-draft-ttl');
--          create unique index unique_active_user_draft on public.tournament_drafts (user_id);

-- 모드별 초안 (싱글 1 + 멀티 1). (user_id, is_single_artist) 유니크는 이미 있다.
update public.tournament_drafts set is_single_artist = false where is_single_artist is null;
alter table public.tournament_drafts
  alter column is_single_artist set default false,
  alter column is_single_artist set not null;
alter table public.tournament_drafts drop constraint if exists unique_active_user_draft;
drop index if exists public.unique_active_user_draft;

-- 만료. 플레이 단계만. 아티스트·곡 선택 초안은 건드리지 않는다.
--  확정(saved_at 있음): 마지막 임시저장 시각 + 24시간
--  미확정(자동저장):     마지막 갱신 + 1시간
select cron.schedule('worldcup-draft-ttl', '17 * * * *', $$
  delete from public.tournament_drafts
   where status in ('playing', 'pre_tournament')
     and ( (saved_at is null     and updated_at < now() - interval '1 hour')
        or (saved_at is not null and saved_at   < now() - interval '24 hours') )
$$);
