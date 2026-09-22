-- 트랙리스트 층: 트랙 키 = MusicBrainz 레코딩 ID
--
-- 왜 Spotify 트랙 ID 가 아닌가:
--   Spotify Developer Terms IV.3.1 은 "Spotify Content 로 DB 를 만들거나 무기한 저장"을
--   금지하고(Content 정의에 API 로 제공되는 모든 데이터·메타데이터 포함), 컴플라이언스
--   가이드는 "API 로 그때그때 받을 수 있는 건 저장하지 말라"고 한다. 호출을 줄이려고
--   Spotify 트랙 ID 를 수만 곡 규모로 영구 매핑하는 건 그 위험 쪽이다.
--   여기 들어가는 데이터는 전부 MusicBrainz(CC0) 출처다.
--
-- mb_recording 은 (recording 1행 = release_group 1개, position 1개)로 설계했는데, 같은
-- 레코딩이 싱글·앨범 등 여러 발매판의 서로 다른 위치에 실린다는 걸 반영하지 못한다.
-- 발매판 x 위치 단위의 이 테이블로 대체한다. mb_recording 은 비어 있고 운영 코드가
-- 참조하지 않으며, additive-only 원칙에 따라 병합 후 정리한다.
--
-- additive-only: 신규 테이블 2 개. 기존 객체는 건드리지 않는다.

-- Spotify 앨범 -> 그 앨범에 해당하는 MB 발매판.
-- spotify_album_id 는 Spotify API 가 아니라 MB 편집자가 단 URL 관계(CC0)에서 온다.
CREATE TABLE IF NOT EXISTS public.mb_album_release (
    spotify_album_id   TEXT PRIMARY KEY,
    release_mbid       UUID NOT NULL,
    release_group_mbid UUID NOT NULL,
    tracks_filled_at   TIMESTAMPTZ,      -- NULL = 아직 트랙리스트를 안 받음 (워커 큐 역할)
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_album_release_unfilled
    ON public.mb_album_release (created_at) WHERE tracks_filled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mb_album_release_release ON public.mb_album_release (release_mbid);

-- 발매판의 트랙리스트. 실측: Spotify 앨범과 곡 수 12/12 일치, 곡 단위 제목 97% 일치.
CREATE TABLE IF NOT EXISTS public.mb_release_track (
    release_mbid   UUID NOT NULL,
    disc           INTEGER NOT NULL,
    position       INTEGER NOT NULL,
    recording_mbid UUID NOT NULL,
    title          TEXT NOT NULL,
    length_ms      INTEGER,
    PRIMARY KEY (release_mbid, disc, position)
);
CREATE INDEX IF NOT EXISTS idx_mb_release_track_recording ON public.mb_release_track (recording_mbid);

ALTER TABLE public.mb_album_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mb_release_track ENABLE ROW LEVEL SECURITY;
CREATE POLICY mb_album_release_read ON public.mb_album_release FOR SELECT USING (true);
CREATE POLICY mb_release_track_read ON public.mb_release_track FOR SELECT USING (true);
