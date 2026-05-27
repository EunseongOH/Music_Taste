import { NextRequest, NextResponse } from 'next/server';
import { searchTracksByQuery } from '@/utils/spotify';

// Simple in-process cache: (cacheKey → { data, expiresAt })
const cache = new Map<string, { data: SpotifySearchResult[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface SpotifySearchResult {
  trackId: string;
  title: string;
  duration: string;       // "3:42"
  artistId: string;
  artistName: string;
  albumId: string;
  albumTitle: string;
  albumImage: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const artistIdsParam = (searchParams.get('artistIds') ?? '').trim();
  const artistNamesParam = (searchParams.get('artistNames') ?? '').trim();

  if (!q || !artistIdsParam) {
    return NextResponse.json({ results: [] });
  }

  // Normalise the artistIds set for filtering
  const artistIds = new Set(artistIdsParam.split(',').filter(Boolean));
  const artistNames = artistNamesParam.split(',').filter(Boolean);

  // Sort for a stable cache key regardless of order
  const sortedIds = [...artistIds].sort().join(',');
  const cacheKey = `${q.toLowerCase()}|${sortedIds}|${artistNamesParam.toLowerCase()}`;

  // Return cached result if still fresh
  const hit = cache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json({ results: hit.data });
  }

  try {
    // Construct optimized search query to pre-filter by artist names
    let spotifySearchQuery = q;
    if (artistNames.length > 0) {
      // Escape names and combine as (artist:"Artist A" OR artist:"Artist B") query
      const artistQueryStr = artistNames
        .map(name => `artist:"${name.replace(/"/g, '')}"`)
        .join(' OR ');
      spotifySearchQuery = `(${artistQueryStr}) ${q}`;
    }

    let rawTracks = await searchTracksByQuery(spotifySearchQuery);

    // Filter to only the artists the user selected, then format
    let results: SpotifySearchResult[] = rawTracks
      .filter((t: any) =>
        t.artists?.some((a: any) => artistIds.has(a.id))
      )
      .map((t: any) => {
        // Pick the matching artist (prefer primary)
        const matchedArtist = t.artists.find((a: any) => artistIds.has(a.id));
        const totalSeconds = Math.floor((t.duration_ms ?? 0) / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = String(totalSeconds % 60).padStart(2, '0');

        return {
          trackId: t.id,
          title: t.name,
          duration: `${mins}:${secs}`,
          artistId: matchedArtist?.id ?? t.artists[0]?.id ?? '',
          artistName: matchedArtist?.name ?? t.artists[0]?.name ?? '',
          albumId: t.album?.id ?? '',
          albumTitle: t.album?.name ?? '',
          albumImage: t.album?.images?.[0]?.url ?? '',
        } satisfies SpotifySearchResult;
      });

    // Fallback: If pre-filtered search yielded no results, try a global search for q and post-filter by artist ID.
    // This handles cases where the strict artist:"..." search failed due to spelling, localization (e.g. 세븐틴 vs SEVENTEEN),
    // or Romanization mismatches, or parentheses parse issues in Spotify.
    if (results.length === 0 && artistIds.size > 0) {
      console.log(`[spotify-search] Primary query "${spotifySearchQuery}" returned 0 results. Trying global fallback for "${q}"...`);
      const fallbackTracks = await searchTracksByQuery(q);
      results = fallbackTracks
        .filter((t: any) =>
          t.artists?.some((a: any) => artistIds.has(a.id))
        )
        .map((t: any) => {
          const matchedArtist = t.artists.find((a: any) => artistIds.has(a.id));
          const totalSeconds = Math.floor((t.duration_ms ?? 0) / 1000);
          const mins = Math.floor(totalSeconds / 60);
          const secs = String(totalSeconds % 60).padStart(2, '0');

          return {
            trackId: t.id,
            title: t.name,
            duration: `${mins}:${secs}`,
            artistId: matchedArtist?.id ?? t.artists[0]?.id ?? '',
            artistName: matchedArtist?.name ?? t.artists[0]?.name ?? '',
            albumId: t.album?.id ?? '',
            albumTitle: t.album?.name ?? '',
            albumImage: t.album?.images?.[0]?.url ?? '',
          } satisfies SpotifySearchResult;
        });
    }

    // Deduplicate by trackId (same track can appear in multiple albums)
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (seen.has(r.trackId)) return false;
      seen.add(r.trackId);
      return true;
    });

    cache.set(cacheKey, { data: unique, expiresAt: Date.now() + CACHE_TTL_MS });

    // Evict old entries to keep memory bounded
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (v.expiresAt < now) cache.delete(k);
      }
    }

    return NextResponse.json({ results: unique });
  } catch (err) {
    console.error('[spotify-search] Error:', err);
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
  }
}
