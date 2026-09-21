-- 수집 스크립트가 용량을 보고 스스로 멈출 수 있게 한다. 무료 한도는 500MB.
create or replace function public.db_size_mb()
returns int language sql stable security definer set search_path = public as $$
  select (pg_database_size(current_database()) / 1048576)::int;
$$;
