"use server";
// src/utils/spotify.ts

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
const searchCache = new Map<string, { data: any; timestamp: number }>();

let cachedInitialArtists: any[] | null = null;
let initialArtistsExpirationTime = 0;

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

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };

  // We explicitly set cache: 'no-store' to avoid Next.js's buggy file cache
  const response = await fetch(url, { 
    ...options, 
    headers,
    cache: 'no-store' 
  });

  // Handle 429 Too Many Requests
  if (response.status === 429 && retries > 0) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
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

// Search for artists
export const searchSpotifyArtists = async (query: string) => {
  if (!query) return [];

  const trimmedQuery = query.trim().toLowerCase();
  const cached = searchCache.get(trimmedQuery);
  if (cached && Date.now() - cached.timestamp < 300 * 1000) { // 5 minutes cache for search
    return cached.data;
  }
  
  const response = await spotifyFetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=5`);

  if (!response.ok) {
    const errText = await response.text();
    console.error("Spotify Search Error:", errText);
    throw new Error('Failed to search artists');
  }

  const data = await response.json();
  const items = data.artists.items;
  searchCache.set(trimmedQuery, { data: items, timestamp: Date.now() });
  return items; // Array of artist objects
};

// Fetch initial popular artists dynamically using Spotify Search API by genres
export const getInitialArtists = async () => {
  if (cachedInitialArtists && Date.now() < initialArtistsExpirationTime) {
    return cachedInitialArtists;
  }

  // Diverse genre and trending queries
  const queries = [
    'genre:k-pop', 'genre:pop', 'genre:hip-hop', 'genre:rock', 
    'genre:r-b', 'genre:indie', 'genre:electronic', 'genre:jazz', 
    'year:2024', 'year:2023-2024'
  ];
  
  // Pick 4 random distinct queries
  const selectedQueries = queries.sort(() => 0.5 - Math.random()).slice(0, 4);

  // Fetch 10 artists for each query (Spotify limits Client Credentials search limit to 10 for some queries)
  const results = await Promise.all(selectedQueries.map(async (query) => {
    try {
      const response = await spotifyFetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=10`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.artists?.items || [];
    } catch (e) {
      console.warn(`Search failed for ${query}`, e);
      return [];
    }
  }));

  // Flatten and filter duplicates
  const allArtists = results.flat();
  const uniqueArtists = Array.from(new Map(allArtists.map(a => [a.id, a])).values());

  // Shuffle the results
  for (let i = uniqueArtists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueArtists[i], uniqueArtists[j]] = [uniqueArtists[j], uniqueArtists[i]];
  }

  const sliced = uniqueArtists.slice(0, 24);
  cachedInitialArtists = sliced;
  initialArtistsExpirationTime = Date.now() + CACHE_TTL; // Cache for 1 hour

  return sliced;
};

// Fetch artist's albums
export const getArtistAlbums = async (artistId: string) => {
  if (!artistId) {
    console.warn('[Spotify API] getArtistAlbums called with empty or undefined artistId');
    return { items: [], total: 0 };
  }

  const cached = albumsCache.get(artistId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await spotifyFetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,ep&limit=10`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Spotify API Error in getArtistAlbums (Status: ${response.status}):`, errorText);
    throw new Error('Failed to fetch artist albums');
  }

  const data = await response.json();
  const result = {
    items: data.items,
    total: data.total
  };

  albumsCache.set(artistId, { data: result, timestamp: Date.now() });
  return result;
};

// Fetch album's tracks
export const getAlbumTracks = async (albumId: string) => {
  if (!albumId) {
    console.warn('[Spotify API] getAlbumTracks called with empty or undefined albumId');
    return [];
  }

  const cached = tracksCache.get(albumId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await spotifyFetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=10`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Spotify API Error in getAlbumTracks (Status: ${response.status}):`, errorText);
    throw new Error('Failed to fetch album tracks');
  }

  const data = await response.json();
  const result = data.items;

  tracksCache.set(albumId, { data: result, timestamp: Date.now() });
  return result; // Array of track objects
};

// Fetch related artists (Fallback to random trending/genre artists due to Spotify API 403 restrictions on Client Credentials)
export const getRelatedArtists = async (artistId: string) => {
  if (!artistId) {
    console.warn('[Spotify API] getRelatedArtists called with empty or undefined artistId');
    return [];
  }

  const cached = relatedArtistsCache.get(artistId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const queries = ['genre:k-pop', 'genre:pop', 'genre:hip-hop', 'genre:rock', 'genre:indie', 'genre:r-b', 'year:2024'];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];
  
  try {
    const response = await spotifyFetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(randomQuery)}&type=artist&limit=10`);
    
    if (!response.ok) return [];
    const data = await response.json();
    const items = data.artists?.items || [];
    
    // Filter out the clicked artist
    const filtered = items.filter((a: any) => a.id !== artistId);
    
    // Shuffle
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
    
    const result = filtered.slice(0, 3);
    relatedArtistsCache.set(artistId, { data: result, timestamp: Date.now() });
    return result;
  } catch (e) {
    console.error("Failed to fetch related artists fallback", e);
    return [];
  }
};
