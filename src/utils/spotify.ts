"use server";
// src/utils/spotify.ts
import { createAdminClient } from "./supabase/admin";
import { ARTIST_TRANSLATION_MAP } from "./artistNames";

const DB_CACHE_TTL_DAYS = 21;

const getCacheExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + DB_CACHE_TTL_DAYS);
  return d.toISOString();
};



async function saveArtistsToDbCache(artists: any[]) {
  if (!artists || artists.length === 0) return;
  try {
    const supabase = createAdminClient();
    const expiresAt = getCacheExpiresAt();
    const lang = await getLocaleCookie();

    const rows = artists.map(artist => ({
      id: artist.id,
      locale: lang,
      name: artist.name,
      images: artist.images || [],
      genres: artist.genres || [],
      popularity: artist.popularity || 0,
      expires_at: expiresAt
    }));

    const { error } = await supabase
      .from('spotify_cache_artists')
      .upsert(rows, { onConflict: 'id,locale' });

    if (error) {
      console.error("[Spotify Cache DB] Error upserting artists:", error.message);
    }
  } catch (e) {
    console.error("[Spotify Cache DB] Failed to save artists to cache:", e);
  }
}

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
const RELATED_ARTISTS_TTL = CACHE_TTL; // 로컬 계산이라 짧게 잡을 이유가 없다 (A-4 이전에는 10분)
const searchCache = new Map<string, { data: any; timestamp: number }>();

let cachedInitialArtists: any[] | null = null;
let initialArtistsExpirationTime = 0;

// A-7: 원래 모듈 전역 변수였다. 서버리스 인스턴스를 공유하는 사용자끼리 상태가 섞여서
// A 사용자가 유발한 429 가 B 사용자 화면에 떴다. 전역 상태이므로 전역 저장소에 둔다.
let lastSpotifyError = "";

export const getLastSpotifyError = async () => {
  try {
    const { data } = await createAdminClient()
      .from('spotify_quota')
      .select('blocked_until')
      .eq('id', 1)
      .maybeSingle();
    if (data?.blocked_until && new Date(data.blocked_until) > new Date()) return "429";
    return "";
  } catch {
    return lastSpotifyError; // DB 조회 실패 시 프로세스 로컬 값으로 폴백
  }
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
// 전역 토큰버킷. 프로세스 메모리로는 서버리스 다중 인스턴스에서 아무것도 못 잡으므로
// Supabase 단일 행에 버킷을 두고 여기서만 통과시킨다.
// 거부 시 합성 429 를 돌려주면 기존 호출부의 429 처리 경로가 그대로 재사용된다.
// RPC 자체가 실패하면 fail-open — 가드가 서비스를 죽여서는 안 된다.
async function takeQuotaToken(): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('spotify_take_token');
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

async function tripQuotaBreaker(secs: number) {
  try {
    await createAdminClient().rpc('spotify_trip_breaker', { secs });
  } catch { /* 계측 실패가 요청을 죽이지 않는다 */ }
}

// ---------------------------------------------------------------------------
// canonical 층 (Phase C~E)
//
// 서술적 메타데이터의 출처를 MusicBrainz core(CC0)로 옮긴다. Spotify Developer Terms
// IV.3.1 은 Spotify Content 의 DB 구축·무기한 저장을 금지하지만 CC0 데이터에는
// 그런 제약이 없다. Spotify ID 는 링크·재생용으로만 남는다.
//
// canonical 에 행이 없으면 아래 기존 Spotify 경로가 그대로 흐른다 — 이 구조 자체가
// 킬스위치라서 별도 on/off 플래그를 만들지 않는다.
// ---------------------------------------------------------------------------

/** canonical 행을 Spotify artist 모양으로 바꾼다. id 는 계속 Spotify ID 다. */
const toArtist = (a: any) => ({
  id: a.spotify_id,
  name: a.name,
  images: a.images ?? [],
  genres: a.genres ?? [],
  popularity: a.popularity ?? 50,
});

/** canonical miss 를 리졸버 큐에 던진다. await 하지 않는다 — 요청 지연 0. */
function enqueueResolve(items: { id: string; name?: string }[]) {
  if (!items.length) return;
  const rows = items
    .filter(i => i?.id)
    .map(i => ({ spotify_id: i.id, entity: 'artist', hint: i.name ?? null }));
  if (!rows.length) return;
  createAdminClient()
    .from('mb_resolve_queue')
    .upsert(rows, { onConflict: 'spotify_id', ignoreDuplicates: true })
    .then(undefined, () => { /* 큐 적재 실패는 조용히 넘긴다 */ });
}

const RATE_LIMITED_RESPONSE = () =>
  new Response('{"error":{"status":429,"message":"local rate limit"}}', {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });

async function spotifyFetch(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  if (!(await takeQuotaToken())) {
    lastSpotifyError = "429";
    return RATE_LIMITED_RESPONSE();
  }

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

  if (response.ok) {
    lastSpotifyError = "";
  } else {
    lastSpotifyError = response.status === 429 ? "429" : String(response.status);
  }

  // Handle 429 Too Many Requests
  if (response.status === 429 && retries > 0) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
    
    // Add safety cap: if Spotify asks us to wait for more than 5 seconds, 
    // do not block the server thread. Return the 429 response so the caller handles it gracefully.
    if (retryAfterSeconds > 5) {
      console.warn(`[Spotify API] 429 Rate limited. Spotify requested ${retryAfterSeconds}s delay which exceeds safety cap. Tripping breaker.`);
      // 한 인스턴스가 맞은 429 를 전 인스턴스가 함께 존중한다.
      await tripQuotaBreaker(retryAfterSeconds);
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
  
  // 한국어 검색어에 대한 영문 이름 매핑 시도 및 부분 매치 추론
  let mappedEnglishName = ARTIST_TRANSLATION_MAP[trimmedQuery];
  if (!mappedEnglishName && trimmedQuery.length >= 2) {
    const matchedKey = Object.keys(ARTIST_TRANSLATION_MAP).find(key => 
      key.includes(trimmedQuery) || trimmedQuery.includes(key)
    );
    if (matchedKey) {
      mappedEnglishName = ARTIST_TRANSLATION_MAP[matchedKey];
    }
  }

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 300 * 1000) { // 5 minutes cache for search
    return cached.data;
  }

  // 0. canonical 우선. name / name_ko 를 함께 훑으므로 한글 검색이 기존보다 넓다.
  //    (기존 경로는 ARTIST_TRANSLATION_MAP 에 하드코딩된 356 쌍만 커버했다)
  try {
    const patterns = [trimmedQuery, mappedEnglishName].filter(Boolean).map(v => String(v));
    const orFilter = patterns
      .flatMap(p => [`name.ilike.%${p}%`, `name_ko.ilike.%${p}%`])
      .join(',');

    const { data: canon } = await createAdminClient()
      .from('canonical_artist')
      .select('spotify_id, name, name_ko, genres, images, popularity')
      .or(orFilter)
      .order('popularity', { ascending: false })
      .range(offset, offset + limit - 1);

    if (canon && canon.length > 0) {
      const formatted = canon.map(toArtist);
      searchCache.set(cacheKey, { data: formatted, timestamp: Date.now() });
      return formatted;
    }
  } catch (e) {
    console.warn("[canonical] artist search failed, falling through:", e);
  }

  // 1. Try DB Cache first
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    let queryBuilder = supabase
      .from('spotify_cache_artists')
      .select('*')
      .eq('locale', 'ko') // 캐시가 'ko'로만 우선 빌드되므로 'ko' 고정 조회하여 다국어 유실 방지
      .gt('expires_at', now)
      .order('popularity', { ascending: false }); // 인기순 정렬 추가

    if (mappedEnglishName) {
      // 한국어 검색어 혹은 매핑된 영문명 둘 중 하나라도 부분 일치하는 조건
      queryBuilder = queryBuilder.or(`name.ilike.%${trimmedQuery}%,name.ilike.%${mappedEnglishName}%`);
    } else {
      queryBuilder = queryBuilder.ilike('name', `%${trimmedQuery}%`);
    }

    const { data: dbArtists, error } = await queryBuilder.range(offset, offset + limit - 1);

    // limit 크기와 상관없이 검색 매칭된 결과가 있고 오류가 없으면 즉시 반환하여 캐시를 적극 활용
    if (!error && dbArtists && dbArtists.length > 0) {
      const formatted = dbArtists.map(a => ({
        id: a.id,
        name: a.name,
        images: a.images,
        genres: a.genres,
        popularity: a.popularity
      }));

      // 캐시 결과의 신뢰성 검증:
      // 캐시 결과 중 하나라도 이름에 검색어(한글 또는 영어 번역명)가 포함되어 있는지 확인
      const hasValidMatch = formatted.some(artist => {
        const artistNameLower = artist.name.toLowerCase();
        
        // 1. 영어 이름과 trimmedQuery 비교
        if (artistNameLower.includes(trimmedQuery)) return true;
        
        // 2. 번역된 영어 이름과 비교
        if (mappedEnglishName && artistNameLower.includes(mappedEnglishName.toLowerCase())) return true;
        
        // 3. 공백/하이픈 제거 비교 (예: "kimseungjoo" vs "kimseung-ju")
        const normalizedArtistName = artistNameLower.replace(/[\s-]/g, "");
        const normalizedQuery = trimmedQuery.replace(/[\s-]/g, "");
        if (normalizedArtistName.includes(normalizedQuery)) return true;
        if (mappedEnglishName && normalizedArtistName.includes(mappedEnglishName.toLowerCase().replace(/[\s-]/g, ""))) return true;

        return false;
      });

      if (hasValidMatch) {
        searchCache.set(cacheKey, { data: formatted, timestamp: Date.now() });
        return formatted;
      } else {
        console.warn(`[Spotify Cache DB] Stale or invalid cache matches found for "${query}". Forcing API search.`);
      }
    }
  } catch (e) {
    console.warn("[Spotify Cache DB] DB artist search failed, falling back to API:", e);
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
      const searchTarget = mappedEnglishName ? `${query} OR "${mappedEnglishName}"` : query;
      let url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchTarget)}&type=artist&limit=${chunkLimit}&offset=${chunkOffset}`;
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
        if (response.status === 429) {
          throw new Error("429");
        }
        break;
      }
    } catch (e: any) {
      console.error("[Spotify API] Search chunk failed with exception:", e);
      if (e.message === "429" || e.status === 429) {
        throw e;
      }
      break;
    }
    await delay(50);
  }

  if (succeeded && allItems.length > 0) {
    saveArtistsToDbCache(allItems);
    // canonical 에 없던 아티스트다. 워커가 나중에 채우면 다음부터는 Spotify 를 안 탄다.
    enqueueResolve(allItems);
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

  // canonical 이 커버하는 만큼은 거기서 가져온다. curated 136 명은 이제 폴백이자
  // 시드일 뿐이고, canonical 이 채워질수록 목록이 넓어진다.
  try {
    const { data: canon } = await createAdminClient()
      .from('canonical_artist')
      .select('spotify_id, name, name_ko, genres, images, popularity')
      .not('images', 'is', null)
      .order('popularity', { ascending: false })
      .limit(500);

    if (canon && canon.length >= uniqueArtists.length) {
      const results = canon.map(toArtist);
      for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [results[i], results[j]] = [results[j], results[i]];
      }
      cachedInitialArtists = results;
      initialArtistsExpirationTime = Date.now() + CACHE_TTL;
      return results;
    }
  } catch (e) {
    console.warn("[canonical] getInitialArtists failed, using curated:", e);
  }

  // DB 캐시에서 최신 아티스트 정보(특히 이미지 및 인기도)를 조회해서 결합
  let cachedMap = new Map<string, any>();
  try {
    const supabase = createAdminClient();
    const artistIds = uniqueArtists.map(a => a.id);
    const { data: dbArtists } = await supabase
      .from('spotify_cache_artists')
      .select('id, name, images, popularity')
      .in('id', artistIds)
      .eq('locale', 'ko');
      
    if (dbArtists) {
      dbArtists.forEach(dbA => {
        if (dbA.images && dbA.images.length > 0) {
          cachedMap.set(dbA.id, dbA);
        }
      });
    }
  } catch (e) {
    console.warn("[Spotify Cache DB] Failed to fetch curated cache info:", e);
  }

  // Format as Spotify Artist objects, combining curated values with fresh DB Cache if available
  const results = uniqueArtists.map(a => {
    const dbA = cachedMap.get(a.id);
    return {
      id: a.id,
      name: dbA?.name || a.name,
      images: dbA?.images || [{ url: a.image }],
      popularity: dbA?.popularity || 50
    };
  });

  // Shuffle the results
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }

  cachedInitialArtists = results;
  initialArtistsExpirationTime = Date.now() + CACHE_TTL;

  return results;
};

// Spotify 는 /artists/{id}/albums 와 /albums/{id}/tracks 에 limit=50 을 허용한다.
// 2026-02 개편의 limit 10 상한은 /v1/search 에만 적용된다.
// 만약 50 이 거부되면 10 으로 낮춘다 — 플래그 하나로 끝내고 env 설정을 만들지 않는다.
let albumPageSize = 50;

// Fetch artist's albums.
// Spotify 에는 항상 50 개 블록 단위로 요청하고 앱에서 잘라 돌려준다.
// UI 페이지(10개) 5 개가 Spotify 호출 1 회를 공유한다.
export const getArtistAlbums = async (artistId: string, offset = 0, limit = 10) => {
  if (!artistId) {
    console.warn('[Spotify API] getArtistAlbums called with empty or undefined artistId');
    return { items: [], total: 0 };
  }

  const cacheKey = `albums_${artistId}`;
  // items 는 절대 offset 으로 색인된 희소 배열이다.
  const cut = (items: any[], total: number) => ({
    items: items.slice(offset, offset + limit).filter(Boolean),
    total,
  });
  const isCovered = (items: any[], total: number) => {
    const end = Math.min(offset + limit, total);
    if (offset >= end) return offset < total ? false : true;
    for (let i = offset; i < end; i++) if (!items[i]) return false;
    return true;
  };

  // 1. Memory Cache
  const cached = albumsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL
      && isCovered(cached.data.items, cached.data.total)) {
    return cut(cached.data.items, cached.data.total);
  }

  // 2. DB Cache (v2 — artist_id 단독 PK)
  let items: any[] = cached?.data?.items ?? [];
  let total: number = cached?.data?.total ?? 0;
  try {
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from('spotify_album_cache_v2')
      .select('items, total')
      .eq('artist_id', artistId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (row && row.total > 0 && Array.isArray(row.items)) {
      items = row.items;
      total = row.total;
      albumsCache.set(cacheKey, { data: { items, total }, timestamp: Date.now() });
      if (isCovered(items, total)) return cut(items, total);
    }
  } catch (e) {
    console.warn("[Spotify Cache DB] DB getArtistAlbums failed, calling API:", e);
  }

  // 3. Spotify — 요청된 offset 을 포함하는 블록 하나만 받는다
  const blockStart = Math.floor(offset / albumPageSize) * albumPageSize;
  let response = await spotifyFetch(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,ep&limit=${albumPageSize}&offset=${blockStart}`
  );

  // limit=50 이 거부되면 한 번만 10 으로 낮춰 재시도하고, 이후로는 계속 10 을 쓴다
  if ((response.status === 400 || response.status === 403) && albumPageSize !== 10) {
    console.warn(`[Spotify API] limit=${albumPageSize} rejected (${response.status}). Falling back to 10.`);
    albumPageSize = 10;
    const retryStart = Math.floor(offset / 10) * 10;
    response = await spotifyFetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,ep&limit=10&offset=${retryStart}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Spotify API Error in getArtistAlbums (Status: ${response.status}):`, errorText);
    // 부분 캐시라도 있으면 그거라도 돌려준다
    return total > 0 ? cut(items, total) : { items: [], total: 0 };
  }

  const data = await response.json();
  const fetched: any[] = data.items || [];
  total = data.total || 0;

  const merged = [...items];
  const start = Math.floor(offset / albumPageSize) * albumPageSize;
  for (let i = 0; i < fetched.length; i++) merged[start + i] = fetched[i];
  items = merged;

  // 4. Save to DB Cache (빈 배열이 영구 캐싱되지 않도록 유효성 검사 후)
  if (total > 0 && fetched.length > 0) {
    try {
      await createAdminClient()
        .from('spotify_album_cache_v2')
        .upsert({
          artist_id: artistId,
          items,
          total,
          cached_at: new Date().toISOString(),
          expires_at: getCacheExpiresAt(),
        }, { onConflict: 'artist_id' });
    } catch (e) {
      console.error("[Spotify Cache DB] Failed to save albums to cache:", e);
    }
  }

  albumsCache.set(cacheKey, { data: { items, total }, timestamp: Date.now() });
  return cut(items, total);
};

// Phase E-2: 싱글 아티스트 모드의 "전곡 자동 선택"을 Spotify 호출 0 회로 되살린다.
//
// 이미 캐시에 앨범 목록 전체와 모든 앨범의 트랙이 들어 있는 아티스트(warm)에만 동작하고,
// 하나라도 비면 빈 결과를 돌려준다. 그러면 호출부는 페이지 단위 로드로 폴백한다.
//
// canonical(MusicBrainz)만으로 하지 않는 이유: 월드컵·취향표는 트랙을 Spotify 트랙 ID 로
// 저장하는데, MB 에는 트랙 단위 Spotify 링크가 거의 없다(레코딩의 2.4%, 실측 Ditto 0/1).
// 앨범 단위 링크는 MB 에서 받을 수 있지만 트랙 ID 는 Spotify 에서 한 번은 받아야 한다.
// 읽는 곳은 TTL 21일 임시 캐시라 약관 IV.3.2 "temporary caching" 범위 안이다.
export const getArtistDiscography = async (artistId: string) => {
  const empty = { albums: [] as any[], total: 0 };
  if (!artistId) return empty;

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: row } = await supabase
      .from('spotify_album_cache_v2')
      .select('items, total')
      .eq('artist_id', artistId)
      .gt('expires_at', now)
      .maybeSingle();

    const items: any[] = Array.isArray(row?.items) ? row!.items : [];
    const total = row?.total ?? 0;
    // 앨범 목록이 빈틈 없이 전부 있어야 한다
    if (total === 0 || items.length < total || items.slice(0, total).some(a => !a)) return empty;

    const albums = items.slice(0, total);
    const ids = albums.map(a => a.id);

    const { data: trackRows } = await supabase
      .from('spotify_cache_album_tracks')
      .select('album_id, items')
      .in('album_id', ids)
      .gt('expires_at', now);

    const tracksByAlbum = new Map<string, any[]>();
    for (const t of trackRows ?? []) {
      if (Array.isArray(t.items) && t.items.length > 0 && !tracksByAlbum.has(t.album_id)) {
        tracksByAlbum.set(t.album_id, t.items);
      }
    }
    // 앨범 하나라도 트랙이 비어 있으면 warm 이 아니다
    if (ids.some(id => !tracksByAlbum.has(id))) return empty;

    return {
      albums: albums.map(a => ({ ...a, tracks: tracksByAlbum.get(a.id) })),
      total,
    };
  } catch (e) {
    console.warn("[discography] cache read failed:", e);
    return empty;
  }
};

// Fetch album's tracks (Sequentially fetched in chunks of 10 to avoid 429 Rate Limits)
export const getAlbumTracks = async (albumId: string) => {
  if (!albumId) {
    console.warn('[Spotify API] getAlbumTracks called with empty or undefined albumId');
    return [];
  }

  const lang = await getLocaleCookie();
  const cacheKey = `${albumId}_${lang}`;

  // 1. Memory Cache check
  const cached = tracksCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // 2. DB Cache check
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data: dbTracks, error } = await supabase
      .from('spotify_cache_album_tracks')
      .select('*')
      .eq('album_id', albumId)
      .eq('locale', lang)
      .gt('expires_at', now)
      .single();

    // 오염된 빈 캐시가 아닌 유효한 트랙 데이터가 있을 때만 복원
    if (!error && dbTracks && dbTracks.items && dbTracks.items.length > 0) {
      tracksCache.set(cacheKey, { data: dbTracks.items, timestamp: Date.now() });
      return dbTracks.items;
    }
  } catch (e) {
    console.warn("[Spotify Cache DB] DB getAlbumTracks failed, calling API:", e);
  }

  // limit=50 한 번이면 안전캡(50트랙)까지 전부 받는다.
  // 기존에는 10 개씩 최대 5 회를 돌았다 — 순수하게 5 배 손해였다.
  let firstResponse = await spotifyFetch(
    `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${albumPageSize}&offset=0`
  );

  if ((firstResponse.status === 400 || firstResponse.status === 403) && albumPageSize !== 10) {
    console.warn(`[Spotify API] track limit=${albumPageSize} rejected (${firstResponse.status}). Falling back to 10.`);
    albumPageSize = 10;
    firstResponse = await spotifyFetch(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=10&offset=0`
    );
  }

  if (!firstResponse.ok) {
    const errorText = await firstResponse.text();
    console.error(`Spotify API Error in getAlbumTracks (Status: ${firstResponse.status}):`, errorText);
    return [];
  }

  const firstData = await firstResponse.json();
  let allTracks = firstData.items || [];
  const total = firstData.total || 0;

  // 폴백으로 10 이 된 경우에만 남은 페이지를 순차로 마저 받는다 (안전캡 50 트랙)
  if (allTracks.length < Math.min(total, 50)) {
    for (let offset = allTracks.length; offset < total && offset < 50; offset += albumPageSize) {
      try {
        const res = await spotifyFetch(
          `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${albumPageSize}&offset=${offset}`
        );
        if (!res.ok) break;
        const data = await res.json();
        const page = data.items || [];
        if (page.length === 0) break;
        allTracks = allTracks.concat(page);
        await delay(50);
      } catch (err) {
        console.error(`[Spotify API] Error fetching tracks at offset ${offset}:`, err);
        break;
      }
    }
  }

  // 3. Save to DB Cache (오염방지를 위해 유효한 트랙이 존재할 때만 저장)
  if (allTracks.length > 0) {
    try {
      const supabase = createAdminClient();
      const expiresAt = getCacheExpiresAt();
      await supabase
        .from('spotify_cache_album_tracks')
        .upsert({
          album_id: albumId,
          locale: lang,
          items: allTracks,
          expires_at: expiresAt
        }, { onConflict: 'album_id,locale' });
    } catch (e) {
      console.error("[Spotify Cache DB] Failed to save tracks to cache:", e);
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

  // Spotify 호출을 하지 않는다.
  //  - /v1/artists/{id}/related-artists 는 2024-11 에 폐기되어 이 앱에서 403 확정이다.
  //    아티스트를 고를 때마다 실패가 보장된 왕복을 1 회씩 태우고 있었다.
  //  - 그 뒤에 있던 장르 검색 폴백은 randomOffset 때문에 캐시 키가 매번 달라져
  //    DB·메모리 캐시가 구조적으로 안 먹었다. 요구되는 정확도("비슷한 아티스트 3명")에
  //    비해 비용이 터무니없어서 둘 다 제거한다.
  // 로컬 curated 목록만으로 충분하고, Phase E 에서 canonical 장르 매칭으로 품질을 올린다.
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

export interface GenreSearchResult {
  items: any[];
  isFallback: boolean;
  error?: string;
}

// Search artists in bulk for multiple selected genres with a single rate-limit safe query.
// Offset is automatically wrapped at 950 (Spotify API max) to enable endless pagination.
export const searchArtistsByGenres = async (genres: string[], limit = 20, offset = 0): Promise<GenreSearchResult> => {
  if (!genres || genres.length === 0) return { items: [], isFallback: false };

  // If there are too many genres (e.g. user selected all), sample only a subset (max 3) 
  // per request to prevent API Rate Limit (429) from sequential request bursts.
  let genresToFetch = genres;
  if (genres.length > 3) {
    // Deterministic shuffle based on offset to ensure we cycle through different genres across pagination scrolls,
    // rather than using pure Math.random() which could repeat the exact same genres.
    const shuffleSeed = offset * 13;
    const shuffled = [...genres];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.abs(shuffleSeed + i) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    genresToFetch = shuffled.slice(0, 3);
  }

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

  // Determine limit per genre based on the sampled subset size
  const limitPerGenre = Math.ceil(limit / genresToFetch.length);
  const allResultsMap = new Map<string, any>();
  const genresNeedingApi: string[] = [];
  const lang = await getLocaleCookie();

  // 1. Try DB Cache first for each sampled genre
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    for (const genreId of genresToFetch) {
      // locale은 'ko' 고정하여 다국어 캐시 누락 방지
      const { data: dbArtists, error } = await supabase
        .from('spotify_cache_artists')
        .select('*')
        .eq('locale', 'ko')
        .contains('genres', [genreId.toLowerCase()])
        .gt('expires_at', now)
        .range(offset, offset + limitPerGenre - 1);

      if (!error && dbArtists && dbArtists.length > 0) {
        dbArtists.forEach((item: any) => {
          allResultsMap.set(item.id, item);
        });
        if (dbArtists.length < limitPerGenre) {
          genresNeedingApi.push(genreId);
        }
      } else {
        genresNeedingApi.push(genreId);
      }
    }
  } catch (e) {
    console.warn("[Spotify Cache DB] DB genre search error, using API fallback:", e);
    genresNeedingApi.push(...genresToFetch);
  }

  // 2. Query Spotify API only for genres with insufficient cache
  let anySucceeded = false;
  let hitRateLimit = false;

  if (genresNeedingApi.length > 0) {
    for (let i = 0; i < genresNeedingApi.length; i++) {
      const genreId = genresNeedingApi[i];
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
          items.forEach((item: any) => {
            allResultsMap.set(item.id, item);
          });
          saveArtistsToDbCache(items);
          enqueueResolve(items);
        } else {
          const errText = await response.text();
          console.warn(`[Spotify API] Individual search for genre [${genreId}] failed with status ${response.status}: ${errText}`);
          
          if (response.status === 429) {
            hitRateLimit = true;
            break;
          }
        }
      } catch (err) {
        console.warn(`[Spotify API] Individual search for genre [${genreId}] failed with exception:`, err);
      }

      if (i < genresNeedingApi.length - 1) {
        await delay(50);
      }
    }
  } else {
    anySucceeded = true;
  }

  // API 호출량 제한(429) 도달 시 예외 처리 흐름 고도화
  if (hitRateLimit) {
    // 429 차단이 일어났어도 DB 캐시 데이터가 단 1건이라도 존재하면 화면에 덧붙이기 위해 반환
    if (allResultsMap.size > 0) {
      return { items: Array.from(allResultsMap.values()), isFallback: false };
    }
    // 캐시마저 바닥나 더 이상 돌려줄 데이터가 없으면 비로소 429 error 상태 리턴 (서버 예외 throw 방지)
    return { items: [], isFallback: false, error: "429" };
  }

  if (allResultsMap.size > 0) {
    return { items: Array.from(allResultsMap.values()), isFallback: false };
  }

  // DB 캐시 및 API 모두 무효한 경우 로컬 curatedArtists 장르 순회 폴백
  const localItems = searchArtistsByGenresLocal(genres, limit, offset);
  if (localItems.length > 0) {
    return { items: localItems, isFallback: true };
  }

  // 로컬 매칭마저 완전히 바닥났다면 (더 이상 로드할 게 없으면) 429 error 상태 리턴
  return { items: [], isFallback: false, error: "429" };
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
