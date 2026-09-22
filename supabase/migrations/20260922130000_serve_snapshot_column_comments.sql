-- artist_serve_snapshot 의 두 컬럼이 "확보량"으로 오해돼 왔다. 이름을 바꾸는 대신 주석을 단다.
--
-- 왜 이름을 안 바꾸는가:
--   albums_servable / tracks_servable 은 출처별 행 수의 단순 합이라 같은 앨범·같은 곡을
--   출처마다 중복으로 센다. 그래서 화면 판정에 쓰면 안 된다 — 이름을 album_rows_by_source 류로
--   바꾸자는 안이 나왔다. 의도는 옳지만 대가가 크다.
--
--   의존하는 것: 뷰 3개(artist_serve_coverage · artist_completeness · artist_genre_feed),
--   갱신 함수, 운영 서빙 코드 2곳(dbCatalog 의 searchDbArtists · getDbArtistsByGenre),
--   스크립트 5개.
--
--   컬럼 이름 변경은 운영 테이블 ALTER 이고, 마이그레이션과 배포 사이에 반드시 깨지는 창이 생긴다.
--     먼저 바꾸면  -> 돌고 있는 코드가 없는 컬럼을 찾는다 (장르 피드·검색 폴백이 빈다)
--     먼저 배포하면 -> 새 이름이 아직 없다 (같은 결과)
--   안전하게 하려면 새 컬럼 추가 -> 백필 -> 읽는 곳 전환 -> 나중에 제거로 배포를 세 번 나눠야 한다.
--   이름을 고치자고 치를 값이 아니다.
--
--   주석은 추가 전용이라 위험이 0이고, 목적(오용을 막는다)은 똑같이 달성한다.
--   psql \d+ 와 Supabase 스튜디오 컬럼 설명에 그대로 보인다.
--
-- "전곡 확보" 판정은 artist_coverage 뷰 하나만 쓴다 (정의 B, 2026-09-22).

COMMENT ON COLUMN public.artist_serve_snapshot.albums_servable IS
'수집 진척용. 출처별 앨범 행 수의 합(sp+mb+dz)이라 같은 앨범을 출처마다 중복으로 센다.
"몇 장을 낼 수 있나"가 아니다. 화면 판정에 쓰지 말 것 — artist_coverage.is_full 을 읽어라.';

COMMENT ON COLUMN public.artist_serve_snapshot.tracks_servable IS
'수집 진척용. 출처별 트랙 행 수의 합이라 중복 계수하고 songKey 중복 제거를 거치지 않는다.
화면에 뜨는 곡 수보다 크다. 화면 판정에 쓰지 말 것 — artist_coverage.distinct_tracks 를 읽어라.';

COMMENT ON COLUMN public.artist_serve_snapshot.sp_albums IS
'MusicBrainz 발매판 중 Spotify 앨범 ID 가 붙고 트랙까지 받은 것의 수. 수집 진척용.';

COMMENT ON COLUMN public.artist_serve_snapshot.mb_albums IS
'Spotify 앨범에 안 붙은 MusicBrainz 발매그룹 중 트랙까지 받은 것의 수. 수집 진척용.';

COMMENT ON COLUMN public.artist_serve_snapshot.dz_albums IS
'Deezer 앨범 중 이름+앨범으로 확인된 연결의 것. 수집 진척용.';

COMMENT ON TABLE public.artist_serve_snapshot IS
'수집이 얼마나 진행됐는지 보는 스냅샷. 출처별 행 수라 중복 계수한다.
이용자에게 보이는 "전곡 확보" 판정은 artist_coverage 뷰를 쓴다.';
