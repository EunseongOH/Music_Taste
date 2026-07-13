-- spotify_cache_artists 테이블에 검색 키워드 컬럼 추가
ALTER TABLE public.spotify_cache_artists 
ADD COLUMN IF NOT EXISTS search_keywords TEXT;

-- 기존 데이터가 있다면 name 값을 검색 키워드 기초값으로 채우기
UPDATE public.spotify_cache_artists 
SET search_keywords = name 
WHERE search_keywords IS NULL;

-- 검색용 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_spotify_cache_artists_keywords 
ON public.spotify_cache_artists (search_keywords);
