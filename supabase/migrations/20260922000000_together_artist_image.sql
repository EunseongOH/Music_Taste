-- 같이 소트하기 초대 화면 — 아티스트 사진 (추가 전용)
--
-- 링크를 받은 사람이 처음 보는 화면 위쪽에 아티스트 사진을 깔기 위한 칸이다.
-- 방을 만들 때 고른 아티스트의 id·사진 주소를 그대로 적어 둔다.
--
-- 둘 다 nullable 이다:
--  - 이 마이그레이션 전에 만들어진 방은 비어 있다 → 화면은 첫 곡의 앨범 재킷으로 대체한다.
--  - "지금 고른 곡"·"내 취향표"에서 만든 방은 아티스트를 고른 게 아니라 값이 없을 수 있다.
-- 무작위·무관한 사진은 쓰지 않는다(앨범 재킷 원칙: 없으면 없는 대로 둔다).

alter table public.sort_challenges
  add column if not exists artist_id text,
  add column if not exists artist_image text;

comment on column public.sort_challenges.artist_id is '방을 만들 때 고른 Spotify 아티스트 id. 없을 수 있다.';
comment on column public.sort_challenges.artist_image is '초대 화면 배경에 쓰는 아티스트 사진 주소. 없으면 첫 곡의 앨범 재킷을 쓴다.';
