CREATE OR REPLACE FUNCTION public.replace_explore_genre_picks(picks JSONB)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE n INT;
BEGIN
    DELETE FROM public.explore_genre_picks WHERE TRUE;  -- pg_safeupdate 는 WHERE 없는 DELETE 를 막는다
    INSERT INTO public.explore_genre_picks (genre, spotify_id, rank, name)
    SELECT p->>'genre', p->>'spotify_id', (p->>'rank')::INT, p->>'name'
    FROM jsonb_array_elements(picks) p;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;
