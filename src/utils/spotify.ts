"use server";
// src/utils/spotify.ts

const getLocaleCookie = async (): Promise<string> => {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return cookieStore.get("locale")?.value || "ko";
  } catch {
    return "ko";
  }
};

let cachedToken: string | null = null;
let tokenExpirationTime: number = 0;
let tokenPromise: Promise<string> | null = null;

// Helper function to pause execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cache storage to bypass Next.js buggy fetch-cache
const CACHE_TTL = 3600 * 1000; // 1 hour in ms
const albumsCache = new Map<string, { data: any; timestamp: number }>();
const tracksCache = new Map<string, { data: any; timestamp: number }>();
const relatedArtistsCache = new Map<string, { data: any; timestamp: number }>();
const RELATED_ARTISTS_TTL = 10 * 60 * 1000; // 10 minutes — shorter so new fallback logic is used sooner
const searchCache = new Map<string, { data: any; timestamp: number }>();

let cachedInitialArtists: any[] | null = null;
let initialArtistsExpirationTime = 0;

let lastSpotifyError = "";

export const getLastSpotifyError = async () => {
  return lastSpotifyError;
};

// Get the access token using the Client Credentials Flow
export const getSpotifyAccessToken = async (): Promise<string> => {
  // Return cached token if valid
  if (cachedToken && Date.now() < tokenExpirationTime) {
    return cachedToken;
  }

  // If already fetching, wait for that promise to resolve
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Spotify API credentials are not set in environment variables.');
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store' // Ensure we don't get a stale response from Next.js cache
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Spotify access token');
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Cache for 55 minutes (token expires in 1 hour usually)
    tokenExpirationTime = Date.now() + (data.expires_in - 300) * 1000;
    
    tokenPromise = null;
    return cachedToken as string;
  })();

  return tokenPromise;
};

// Robust fetch wrapper that handles:
// 1. Authorization header injection
// 2. 429 Too Many Requests (Rate Limiting) with Retry-After header
// 3. 401 Unauthorized (Token invalidation/refresh)
// 4. Retries up to a maximum limit
// 5. Bypasses Next.js file fetch cache to avoid caching HTTP error responses permanently
async function spotifyFetch(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  const token = await getSpotifyAccessToken();

  const lang = await getLocaleCookie();

  // Adjust URL to append localized market parameter (KR or US)
  let adjustedUrl = url;
  const marketVal = lang === "ko" ? "KR" : "US";
  if (url.includes("?")) {
    if (!url.includes("market=")) {
      adjustedUrl = `${url}&market=${marketVal}`;
    }
  } else {
    adjustedUrl = `${url}?market=${marketVal}`;
  }

  // Define language header priorities
  const acceptLangHeader = lang === "ko" 
    ? "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7" 
    : "en-US,en;q=0.9";

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    "Accept-Language": acceptLangHeader,
  };

  // We explicitly set cache: 'no-store' to avoid Next.js's buggy file cache
  const response = await fetch(adjustedUrl, { 
    ...options, 
    headers,
    cache: 'no-store' 
  });

  // Handle 429 Too Many Requests
  if (response.status === 429 && retries > 0) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
    
    // Add safety cap: if Spotify asks us to wait for more than 5 seconds, 
    // do not block the server thread. Return the 429 response so the caller handles it gracefully.
    if (retryAfterSeconds > 5) {
      console.warn(`[Spotify API] 429 Rate limited. Spotify requested ${retryAfterSeconds}s delay which exceeds safety cap. Returning error response.`);
      return response;
    }
    
    const retryAfterMs = retryAfterSeconds * 1000;
    
    console.warn(`[Spotify API] 429 Too Many Requests. Retrying in ${retryAfterMs}ms... (Retries left: ${retries})`);
    await delay(retryAfterMs);
    return spotifyFetch(url, options, retries - 1);
  }

  // Handle 401 Unauthorized (e.g. if the token was invalidated early)
  if (response.status === 401 && retries > 0) {
    console.warn('[Spotify API] 401 Unauthorized. Invalidating cached token and retrying...');
    cachedToken = null;
    tokenPromise = null;
    return spotifyFetch(url, options, retries - 1);
  }

  return response;
}

export interface SpotifyQuery {
  q: string;
  market?: string;
}

// Map app genre ID to Spotify-optimized query and market
export const getSpotifyGenreQuery = async (genreId: string): Promise<SpotifyQuery> => {
  switch (genreId) {
    case "k-pop":
      return { q: "genre:k-pop", market: "KR" };
    case "pop":
      return { q: "genre:pop", market: "US" }; // Global Pop (US market to avoid Korean pop dominant results)
    case "korean hip hop":
      return { q: "korean hip hop", market: "KR" };
    case "hip hop":
      return { q: "hip hop", market: "US" }; // Global Hip Hop (raw text search yields better results)
    case "korean r&b":
      return { q: "korean r&b", market: "KR" };
    case "r&b":
      return { q: "genre:r-b", market: "US" }; // Global R&B
    case "korean rock":
      return { q: "korean rock", market: "KR" };
    case "rock":
      return { q: "genre:rock", market: "US" }; // Global Rock
    case "korean indie":
      return { q: "korean indie", market: "KR" };
    case "indie":
      return { q: "genre:indie", market: "US" }; // Global Indie
    case "electronic":
      return { q: "genre:electronic", market: "US" };
    case "jazz":
      return { q: "genre:jazz", market: "US" };
    case "ballad":
      return { q: "korean ballad", market: "KR" };
    case "trot":
      return { q: "korean trot", market: "KR" };
    case "j-pop":
      return { q: "genre:j-pop", market: "JP" };
    case "classical":
      return { q: "genre:classical", market: "US" };
    default:
      return { q: `genre:${genreId}` };
  }
};

// Search for artists
export const searchSpotifyArtists = async (query: string, limit = 10, offset = 0, market?: string) => {
  if (!query) return [];

  const trimmedQuery = query.trim().toLowerCase();
  const lang = await getLocaleCookie();
  const cacheKey = `${trimmedQuery}_${lang}_limit_${limit}_offset_${offset}_market_${market || "default"}`;
  
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 300 * 1000) { // 5 minutes cache for search
    return cached.data;
  }
  
  const performLocalSearch = () => {
    const lowercaseQuery = trimmedQuery;
    const matchedArtists = new Map<string, any>();

    // 1. Search in curatedArtists
    const allCurated = Object.values(curatedArtists).flat();
    for (const artist of allCurated) {
      if (artist.name.toLowerCase().includes(lowercaseQuery)) {
        matchedArtists.set(artist.id, {
          id: artist.id,
          name: artist.name,
          images: [{ url: artist.image }],
          popularity: 50
        });
      }
    }

    // 2. Search in temp_artists.json
    try {
      const tempArtists = require("../../temp_artists.json");
      for (const artist of tempArtists) {
        if (artist.name.toLowerCase().includes(lowercaseQuery)) {
          matchedArtists.set(artist.id, {
            id: artist.id,
            name: artist.name,
            images: artist.images,
            popularity: artist.popularity || 50
          });
        }
      }
    } catch (e) {}

    const results = Array.from(matchedArtists.values());
    return results.slice(offset, offset + limit);
  };

  const maxLimitPerRequest = 10;
  const allItems: any[] = [];
  let succeeded = false;

  for (let fetched = 0; fetched < limit; fetched += maxLimitPerRequest) {
    const chunkLimit = Math.min(limit - fetched, maxLimitPerRequest);
    const chunkOffset = offset + fetched;

    try {
      let url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=${chunkLimit}&offset=${chunkOffset}`;
      if (market) {
        url += `&market=${market}`;
      }
      const response = await spotifyFetch(url);

      if (response.ok) {
        succeeded = true;
        const data = await response.json();
        const items = data.artists?.items || [];
        allItems.push(...items);
        if (items.length < chunkLimit) {
          break;
        }
      } else {
        const errText = await response.text();
        console.warn(`[Spotify API] Search chunk failed with status ${response.status}: ${errText}.`);
        break;
      }
    } catch (e) {
      console.error("[Spotify API] Search chunk failed with exception:", e);
      break;
    }
    await delay(50);
  }

  if (succeeded && allItems.length > 0) {
    searchCache.set(cacheKey, { data: allItems, timestamp: Date.now() });
    return allItems;
  }

  // Fallback to local search if API failed or returned empty results
  const localItems = performLocalSearch();
  if (localItems.length > 0) {
    searchCache.set(cacheKey, { data: localItems, timestamp: Date.now() });
  }
  return localItems;
};

import { curatedArtists } from "./curatedArtists";

// Fetch initial popular artists dynamically using Spotify Search API by genres
// Fallback/Use curated database to avoid parallel API rate limiting and K-Pop dominance
export const getInitialArtists = async () => {
  if (cachedInitialArtists && cachedInitialArtists.length > 0 && Date.now() < initialArtistsExpirationTime) {
    return cachedInitialArtists;
  }

  // Combine all curated artists from our database
  const allCurated = Object.values(curatedArtists).flat();
  
  // Deduplicate by ID
  const uniqueArtists = Array.from(new Map(allCurated.map(a => [a.id, a])).values());

  // Format as Spotify Artist objects
  const results = uniqueArtists.map(a => ({
    id: a.id,
    name: a.name,
    images: [{ url: a.image }],
    popularity: 50
  }));

  // Shuffle the results
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }

  cachedInitialArtists = results;
  initialArtistsExpirationTime = Date.now() + CACHE_TTL;

  return results;
};

// Fetch artist's albums (Paged to prevent excessive rate limiting)
export const getArtistAlbums = async (artistId: string, offset = 0, limit = 10) => {
  if (!artistId) {
    console.warn('[Spotify API] getArtistAlbums called with empty or undefined artistId');
    return { items: [], total: 0 };
  }

  const lang = await getLocaleCookie();
  const cacheKey = `${artistId}_${lang}_offset_${offset}_limit_${limit}`;

  const cached = albumsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Fetch only the requested page to minimize requests
  const response = await spotifyFetch(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,ep&limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Spotify API Error in getArtistAlbums (Status: ${response.status}):`, errorText);
    return { items: [], total: 0 };
  }

  const data = await response.json();
  const result = {
    items: data.items || [],
    total: data.total || 0
  };

  albumsCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
};

// Fetch album's tracks (Sequentially fetched in chunks of 10 to avoid 429 Rate Limits)
export const getAlbumTracks = async (albumId: string) => {
  if (!albumId) {
    console.warn('[Spotify API] getAlbumTracks called with empty or undefined albumId');
    return [];
  }

  const lang = await getLocaleCookie();
  const cacheKey = `${albumId}_${lang}`;

  const cached = tracksCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // 1. Fetch the first page (limit = 10) to obtain the total count
  const firstResponse = await spotifyFetch(
    `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=10&offset=0`
  );

  if (!firstResponse.ok) {
    const errorText = await firstResponse.text();
    console.error(`Spotify API Error in getAlbumTracks (Status: ${firstResponse.status}):`, errorText);
    return [];
  }

  const firstData = await firstResponse.json();
  let allTracks = firstData.items || [];
  const total = firstData.total || 0;

  // 2. If there are more than 10 tracks, request the remaining chunks of 10 sequentially
  if (total > 10) {
    const maxTracksLimit = 50; // Safety cap: load up to 50 tracks (5 pages)
    
    for (let offset = 10; offset < total && offset < maxTracksLimit; offset += 10) {
      try {
        const res = await spotifyFetch(
          `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=10&offset=${offset}`
        );
        if (res.ok) {
          const data = await res.json();
          allTracks = allTracks.concat(data.items || []);
        }
        // Small 50ms delay to avoid tripping 429
        await delay(50);
      } catch (err) {
        console.error(`[Spotify API] Error fetching tracks at offset ${offset}:`, err);
      }
    }
  }

  tracksCache.set(cacheKey, { data: allTracks, timestamp: Date.now() });
  return allTracks; // Array of track objects
};

// Fetch related artists (Fallback to random trending/genre artists due to Spotify API 403 restrictions on Client Credentials)
export const getRelatedArtists = async (artistId: string) => {
  if (!artistId) {
    console.warn('[Spotify API] getRelatedArtists called with empty or undefined artistId');
    return [];
  }

  const cached = relatedArtistsCache.get(artistId);
  if (cached && Date.now() - cached.timestamp < RELATED_ARTISTS_TTL) {
    return cached.data;
  }

  // 1. Try Spotify /related-artists endpoint (requires OAuth for some accounts, may 403)
  try {
    const response = await spotifyFetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`);
    
    if (response.ok) {
      const data = await response.json();
      const items = data.artists || [];
      
      if (items.length > 0) {
        const filtered = items.filter((a: any) => a.id !== artistId);
        for (let i = filtered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
        }
        const result = filtered.slice(0, 3);
        relatedArtistsCache.set(artistId, { data: result, timestamp: Date.now() });
        return result;
      }
    } else {
      console.warn(`[Spotify API] getRelatedArtists failed with status ${response.status}. Falling back to genre search.`);
    }
  } catch (e) {
    console.error("Failed to fetch related artists from Spotify API, using genre search fallback", e);
  }

  // 2. Find artist's genre from curated list
  let artistGenre: string | null = null;
  for (const [genre, artists] of Object.entries(curatedArtists)) {
    if (artists.some((a: any) => a.id === artistId)) {
      artistGenre = genre;
      break;
    }
  }

  // 3. Try Spotify genre search with a random offset to surface non-curated artists
  if (artistGenre) {
    try {
      const genreQuery = await getSpotifyGenreQuery(artistGenre);
      // Use a random offset between 20-100 to go beyond the first page of popular artists
      const randomOffset = Math.floor(Math.random() * 80) + 20;
      const results = await searchSpotifyArtists(genreQuery.q, 10, randomOffset, genreQuery.market);
      if (results.length > 0) {
        const filtered = results.filter((r: any) => r.id !== artistId);
        const shuffled = [...filtered].sort(() => Math.random() - 0.5);
        const count = Math.floor(Math.random() * 3) + 1;
        const result = shuffled.slice(0, count).map((r: any) => ({
          id: r.id,
          name: r.name,
          images: r.images || [],
          popularity: r.popularity || 0,
        }));
        relatedArtistsCache.set(artistId, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (e) {
      console.warn("[Spotify API] Genre search fallback failed for related artists:", e);
    }
  }

  // 4. Last resort: use curated list (may overlap with visible artists, but better than nothing)
  const allCurated = Object.entries(curatedArtists);
  let matchingArtists: any[] = [];
  for (const [_, artists] of allCurated) {
    if (artists.some((a: any) => a.id === artistId)) {
      matchingArtists = artists;
      break;
    }
  }
  if (matchingArtists.length === 0) {
    matchingArtists = Object.values(curatedArtists).flat();
  }
  const filtered = matchingArtists.filter((a: any) => a.id !== artistId);
  const shuffled = [...filtered];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const count = Math.floor(Math.random() * 3) + 1;
  const fallbackResult = shuffled.slice(0, count).map((a: any) => ({
    id: a.id,
    name: a.name,
    images: [{ url: a.image }],
    popularity: 50,
  }));
  relatedArtistsCache.set(artistId, { data: fallbackResult, timestamp: Date.now() });
  return fallbackResult;
};

// Local-only genre search: looks up artists directly from curatedArtists by genre keys.
// When offset exceeds total, cycles through with a reshuffled order so the list never stops.
const searchArtistsByGenresLocal = (genres: string[], limit: number, offset: number): any[] => {
  const genreKey: Record<string, string> = {
    "k-pop": "k-pop", "pop": "pop", "hip-hop": "hip hop", "r-b": "r&b",
    "rock": "rock", "indie": "indie", "electronic": "electronic",
    "jazz": "jazz", "ballad": "ballad", "trot": "trot", "j-pop": "j-pop",
    "classical": "classical",
  };
  const seen = new Set<string>();
  const all: any[] = [];
  for (const genreId of genres) {
    const key = genreKey[genreId] || genreId;
    const artists = (curatedArtists as any)[key] || [];
    for (const a of artists) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        all.push({ id: a.id, name: a.name, images: [{ url: a.image }], popularity: 50 });
      }
    }
  }

  if (all.length === 0) return [];

  // Cycle: wrap offset, then reshuffle each cycle pass so order feels fresh
  const cycle = Math.floor(offset / all.length);
  const wrappedOffset = offset % all.length;

  // Deterministic shuffle per cycle using cycle index as seed
  const shuffled = [...all];
  let seed = cycle * 31337;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(seed) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // If a page would span two cycles, concat the next cycle's start
  const slice = shuffled.slice(wrappedOffset, wrappedOffset + limit);
  if (slice.length < limit && wrappedOffset + limit > shuffled.length) {
    const nextCycleShuffled = [...all].reverse(); // simple variation
    slice.push(...nextCycleShuffled.slice(0, limit - slice.length));
  }
  return slice;
};

// Search artists in bulk for multiple selected genres with a single rate-limit safe query.
// Offset is automatically wrapped at 950 (Spotify API max) to enable endless pagination.
export const searchArtistsByGenres = async (genres: string[], limit = 20, offset = 0) => {
  if (!genres || genres.length === 0) return [];

  // Optimization query mapping for each genre ID (standard text queries to maximize results)
  const genreSearchQuery: Record<string, { query: string; market?: string }> = {
    "k-pop":         { query: 'k-pop', market: 'KR' },
    "pop":           { query: 'pop', market: 'US' },
    "korean hip hop":{ query: 'korean hip hop', market: 'KR' },
    "hip hop":       { query: 'hip hop', market: 'US' },
    "korean r&b":    { query: 'korean r&b', market: 'KR' },
    "r&b":           { query: 'r&b', market: 'US' },
    "korean rock":   { query: 'korean rock', market: 'KR' },
    "rock":          { query: 'rock', market: 'US' },
    "korean indie":  { query: 'korean indie', market: 'KR' },
    "indie":         { query: 'indie', market: 'US' },
    "electronic":    { query: 'electronic', market: 'US' },
    "jazz":          { query: 'jazz', market: 'US' },
    "ballad":        { query: 'korean ballad', market: 'KR' },
    "trot":          { query: 'trot OR 트로트', market: 'KR' },
    "j-pop":         { query: 'j-pop', market: 'JP' },
    "classical":     { query: 'classical', market: 'US' },
    // legacy IDs
    "hip-hop":       { query: 'hip hop', market: 'US' },
    "r-b":           { query: 'r&b', market: 'US' },
  };

  // Determine limit per genre
  const limitPerGenre = Math.ceil(limit / genres.length);
  const allResultsMap = new Map<string, any>();
  let anySucceeded = false;

  const fetchPromises = genres.map(async (genreId) => {
    const config = genreSearchQuery[genreId.toLowerCase()] || { query: genreId };
    const maxLimitPerRequest = 10;
    const chunkLimit = Math.min(limitPerGenre, maxLimitPerRequest);
    const safeOffset = offset % 950;

    try {
      let url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(config.query)}&type=artist&limit=${chunkLimit}&offset=${safeOffset}`;
      if (config.market) {
        url += `&market=${config.market}`;
      }
      const response = await spotifyFetch(url);
      if (response.ok) {
        anySucceeded = true;
        const data = await response.json();
        const items = data.artists?.items || [];
        return items;
      } else {
        const errText = await response.text();
        console.warn(`[Spotify API] Individual search for genre [${genreId}] failed with status ${response.status}: ${errText}`);
        return [];
      }
    } catch (err) {
      console.warn(`[Spotify API] Individual search for genre [${genreId}] failed with exception:`, err);
      return [];
    }
  });

  try {
    const genreResults = await Promise.all(fetchPromises);
    genreResults.forEach((items) => {
      items.forEach((item: any) => {
        allResultsMap.set(item.id, item);
      });
    });
  } catch (e) {
    console.error("[Spotify API] Promise.all failed in searchArtistsByGenres:", e);
  }

  if (anySucceeded && allResultsMap.size > 0) {
    return Array.from(allResultsMap.values());
  }

  // Fallback to local genre search cycle
  return searchArtistsByGenresLocal(genres, limit, offset);
};

// Search tracks by query string (returns raw Spotify track objects, up to 10 due to Feb 2026 updates)
// The caller is responsible for filtering by artist IDs.
export const searchTracksByQuery = async (query: string): Promise<any[]> => {
  if (!query.trim()) return [];

  const cacheKey = `tracks_${query.trim().toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  const response = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error('[Spotify] searchTracksByQuery error:', errText);
    return [];
  }

  const data = await response.json();
  const items = data.tracks?.items ?? [];

  searchCache.set(cacheKey, { data: items, timestamp: Date.now() });
  return items;
};
