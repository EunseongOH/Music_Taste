-- 제목·발매연도·곡 수 대조로 만든 Spotify 앨범 ↔ MB 발매판 연결의 출처 기록 (URL 링크 연결과 구분). additive-only.
-- 실제 사용은 mb_album_release 에 같은 행을 넣어 기존 조회·워커 경로를 그대로 쓴다. 적용일 2026-09-18.
CREATE TABLE IF NOT EXISTS public.mb_album_title_match (
    spotify_album_id   TEXT PRIMARY KEY,
    release_mbid       UUID NOT NULL,
    release_group_mbid UUID NOT NULL,
    spotify_tracks     INT,
    verified           TEXT,            -- null(미검증) | 'ok' | 'rejected'
    matched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.mb_album_title_match ENABLE ROW LEVEL SECURITY;
