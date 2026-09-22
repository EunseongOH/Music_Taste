-- Discogs 발매판 요약. 같은 앨범 판정에 쓴다.
-- MusicBrainz(mb_release_digest)·Deezer(deezer_album_digest) 와 같은 모양이다.
-- 없었던 탓에 Discogs 로만 아는 앨범이 중복 제거 비교에서 통째로 빠졌다
-- (Nirvana "In Utero" 가 "In Utero (Super Deluxe Edition)" 과 따로 나갔다).
-- 추가만 한다. 기존 테이블은 건드리지 않는다.
CREATE TABLE IF NOT EXISTS public.discogs_release_digest (
    release_id  BIGINT PRIMARY KEY,
    n_distinct  INTEGER NOT NULL DEFAULT 0,
    h_raw       TEXT[]  NOT NULL DEFAULT '{}',
    h_base      TEXT[]  NOT NULL DEFAULT '{}',
    h_pre       TEXT[]  NOT NULL DEFAULT '{}',
    durs        INTEGER[] NOT NULL DEFAULT '{}',
    built_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
