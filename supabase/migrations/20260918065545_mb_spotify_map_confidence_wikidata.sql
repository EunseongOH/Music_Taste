-- 값만 넓힌다 (기존 값·행 그대로). Wikidata(CC0)는 한 항목에 Spotify ID(P1902)와
-- MusicBrainz ID(P434)를 함께 갖고 있어 url_rel 과 같은 수준의 근거다.
alter table public.mb_spotify_map drop constraint if exists mb_spotify_map_confidence_check;
alter table public.mb_spotify_map add constraint mb_spotify_map_confidence_check
  check (confidence = any (array['url_rel'::text, 'isrc'::text, 'name'::text, 'manual'::text, 'wikidata'::text]));
