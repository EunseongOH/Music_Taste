-- 오타·표기 차이를 견디는 앞부분 해시. "iloveyouirememberyou" 와 "iloveyouiremeberyou" 처럼
-- 뒤쪽 글자만 다른 경우를 잡는다 (요약만 읽으면 문자열 유사도를 계산할 수 없기 때문이다).
alter table public.mb_release_digest   add column if not exists h_pre text[] not null default '{}';
alter table public.deezer_album_digest add column if not exists h_pre text[] not null default '{}';
-- 앞부분 해시가 없는 기존 행은 다시 만든다
truncate table public.mb_release_digest;
truncate table public.deezer_album_digest;
