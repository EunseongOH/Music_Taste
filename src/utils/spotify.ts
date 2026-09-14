"use server";
// src/utils/spotify.ts
import { createAdminClient } from "./supabase/admin";

const DB_CACHE_TTL_DAYS = 21;

const getCacheExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + DB_CACHE_TTL_DAYS);
  return d.toISOString();
};

const ARTIST_TRANSLATION_MAP: Record<string, string> = {
  "뉴진스": "NewJeans", "아이브": "IVE", "에스파": "aespa", "르세라핌": "LE SSERAFIM", "아일릿": "ILLIT",
  "베이비몬스터": "BABYMONSTER", "블랙핑크": "BLACKPINK", "트와이스": "TWICE", "레드벨벳": "Red Velvet", "스테이씨": "STAYC",
  "엔믹스": "NMIXX", "키스오브라이프": "KISS OF LIFE", "트리플에스": "tripleS", "피프티피프티": "FIFTY FIFTY", "여자아이들": "(G)I-DLE",
  "방탄소년단": "BTS", "세븐틴": "SEVENTEEN", "스트레이 키즈": "Stray Kids", "스트레이키즈": "Stray Kids", "엔시티 드림": "NCT DREAM",
  "엔시티드림": "NCT DREAM", "엔시티 127": "NCT 127", "엔시티127": "NCT 127", "라이즈": "RIIZE", "투어스": "TWS",
  "제로베이스원": "ZEROBASEONE", "엔하이픈": "ENHYPEN", "투모로우바이투게더": "TXT", "보이넥스트도어": "BOYNEXTDOOR", "플레이브": "PLAVE",
  "데이식스": "DAY6", "루시": "LUCY", "아이유": "IU", "태연": "Taeyeon", "정국": "Jungkook",
  "지민": "Jimin", "뷔": "V", "제니": "Jennie", "리사": "Lisa", "로제": "Rosé",
  "나연": "Nayeon", "지효": "Jihyo", "화사": "Hwasa", "선미": "Sunmi", "청하": "Chungha",
  "권은비": "Kwon Eun Bi", "이영지": "Lee Young Ji", "비비": "BIBI", "샤이니": "SHINee", "엑소": "EXO",
  "빅뱅": "BIGBANG", "소녀시대": "Girls' Generation", "악뮤": "AKMU", "넥스지": "NEXZ", "이븐": "EVNNE",
  "싸이커스": "xikers", "나니와단시": "Naniwa Danshi", "캣츠아이": "KATSEYE", "유니스": "UNIS", "리센느": "RESCENE",
  "배드빌런": "BADVILLAIN", "갓세븐": "GOT7", "몬스타엑스": "MONSTA X", "에이티즈": "ATEEZ", "더보이즈": "THE BOYZ",
  "트레저": "TREASURE", "위너": "WINNER", "아이콘": "iKON", "비투비": "BTOB", "하이라이트": "Highlight",
  "슈퍼주니어": "Super Junior", "동방신기": "TVXQ!", "투피엠": "2PM", "에프엑스": "f(x)", "에이핑크": "Apink",
  "마마무": "MAMAMOO", "여자친구": "GFRIEND", "오마이걸": "OH MY GIRL", "우주소녀": "WJSN", "이달의 소녀": "LOONA",
  "프로미스나인": "fromis_9", "케플러": "Kep1er", "비비지": "VIVIZ", "에버글로우": "Everglow", "드림캐쳐": "Dreamcatcher",
  "니쥬": "NiziU", "이무진": "Lee Mujin", "케이윌": "K.Will", "성시경": "Sung Si Kyung", "박효신": "Park Hyo Shin",
  "윤하": "Younha", "백예린": "Baek Yerin", "이하이": "Lee Hi", "백현": "Baekhyun", "디오": "D.O.",
  "수호": "Suho", "카이": "Kai", "태민": "Taemin", "키": "Key", "호시": "Hoshi",
  "아르테미스": "ARTMS", "루셈블": "Loossemble", "빌리": "Billlie", "퍼플키스": "PURPLE KISS", "하이키": "H1-KEY",
  "우아": "WOOAH", "영파씨": "YOUNG POSSE", "미야오": "MEOVV", "메이딘": "MADEIN", "원어스": "ONEUS",
  "크래비티": "CRAVITY", "이펙스": "EPEX", "피원하모니": "P1Harmony", "앰퍼샌드원": "AMPERS&ONE", "올아워즈": "ALL(H)OURS",
  "이세계아이돌": "ISEGYE IDOL", "스텔라이브": "STELLIVE", "인피니트": "INFINITE", "틴탑": "TEEN TOP", "블락비": "Block B",
  "비원에이포": "B1A4", "비에이피": "B.A.P", "빅스": "VIXX", "뉴이스트": "NU'EST", "엠블랙": "MBLAQ",
  "투에이엠": "2AM", "티아라": "T-ARA", "시크릿": "Secret", "포미닛": "4minute", "씨스타": "SISTAR",
  "미쓰에이": "Miss A", "걸스데이": "Girl's Day", "이엑스아이디": "EXID", "에이오에이": "AOA", "나인뮤지스": "Nine Muses",
  "브라운 아이드 걸스": "Brown Eyed Girls", "카라": "KARA", "원더걸스": "Wonder Girls", "투애니원": "2NE1", "지드래곤": "G-DRAGON",
  "태양": "TAEYANG", "비": "Rain",
  // 밴드 / 인디
  "십cm": "10CM", "잔나비": "Jannabi", "멜로망스": "Melomance", "어반자카파": "Urban Zakapa", "폴김": "Paul Kim",
  "적재": "Jukjae", "카더가든": "Car, the garden", "최유리": "Choi Yu Ree", "볼빨간사춘기": "Bolbbalgan4", "헤이즈": "Heize",
  "실리카겔": "Silica Gel", "더 볼런티어스": "The Volunteers", "새소년": "Se So Neon", "쏜애플": "Thornapple", "너드커넥션": "Nerd Connection",
  "웨이브투에스": "Wave to Earth", "설": "SURL", "스탠딩 에그": "Standing Egg", "치즈": "Cheeze", "스텔라장": "Stella Jang",
  "선우정아": "Sunwoojunga", "권진아": "Kwon Jin Ah", "샘김": "Sam Kim", "이진아": "Lee Jin Ah", "뎁트": "Dept",
  "라쿠나": "Lacuna", "까치산": "Kachisan", "김승주": "kimseungjoo", "우효": "OOHYO", "갤럭시 익스프레스": "Galaxy Express",
  "글렌체크": "Glen Check", "이디앗테이프": "Idiotape", "페퍼톤스": "Peppertones", "데이브레이크": "Daybreak", "소란": "Soran",
  "로맨틱펀치": "Romantic Punch", "크라잉넛": "Crying Nut", "노브레인": "No Brain", "딕펑스": "Dickpunks", "브로콜리너마저": "Broccoli, you too?",
  "가을방학": "Autumn Vacation", "에피톤 프로젝트": "Epitone Project", "센티멘탈 시너리": "Sentimental Scenery", "심규선": "Lucia", "타루": "Taru",
  "요조": "Yozoh", "한희정": "Han Hee Jung", "제이래빗": "J Rabbit", "옥상달빛": "OKDAL", "스웨덴세탁소": "Sweden Laundry",
  "바닐라 어쿠스틱": "Vanilla Acoustic", "어쿠스틱 콜라보": "Acoustic Collabo", "슈가볼": "Sugarbowl", "터치드": "Touched", "유다빈밴드": "Yudabin Band",
  "나인티오원": "9001", "시네마": "CNEMA", "카디": "KARDI", "답다": "Dabda", "코토바": "cotoba",
  "브로큰 발렌타인": "Broken Valentine", "해리빅버튼": "HarryBigButton", "롤링쿼츠": "Rolling Quartz", "워킹아프터유": "Walking After U", "도망칠 수 없는 현실에서": "Fleeing from Reality",
  "디에잇투": "D82", "더 픽스": "The Fix", "로렌": "LØREN", "한로로": "Hanroro", "김뜻돌": "Meaningful Stone",
  "아워": "OurR", "보수동쿨러": "Bosudong Cooler", "세이수미": "Say Sue Me", "기프트": "GIFT", "FT아일랜드": "FTISLAND",
  "씨엔블루": "CNBLUE", "프렙": "Prep", "소울맨": "Soulman", "정기고": "Junggigo", "죠지": "George",
  "따마": "THAMA", "다운": "Dvwn", "수민": "SUMIN",
  // 힙합
  "크러쉬": "Crush", "자이언티": "Zion.T", "딘": "DEAN", "디피알 이안": "DPR IAN", "디피알 라이브": "DPR LIVE",
  "우즈": "Woodz", "콜드": "Colde", "라드뮤지엄": "Rad Museum", "다이나믹 듀오": "Dynamicduo", "에픽하이": "Epik High",
  "박재범": "Jay Park", "로꼬": "Loco", "우원재": "Woo", "쿠기": "Coogie", "기리보이": "Giriboy",
  "창모": "Changmo", "애쉬 아일랜드": "ASH ISLAND", "비오": "BE'O", "릴러말즈": "Leellamarz", "빅나티": "BIG Naughty",
  "스키니브라운": "Skinny Brown", "매드클라운": "Mad Clown", "산이": "San E", "버벌진트": "Verbal Jint", "스윙스": "Swings",
  "블랙넛": "Black Nut", "바스코": "Vasco", "빌스택스": "Vasco", "저스디스": "Justhis", "키드밀리": "Kid Milli",
  "노엘": "NO:EL", "양홍원": "Yanghongwon", "나우아임영": "nowiamproud", "빈지노": "Beenzino", "지코": "ZICO",
  "이센스": "E-Sens", "사이먼 도미닉": "Simon Dominic", "더콰이엇": "The Quiett", "팔로알토": "Paloalto", "딥플로우": "Deepflow",
  "넉살": "Nucksal", "그레이": "Gray", "코드 쿤스트": "Code Kunst", "피에이치원": "pH-1", "식케이": "Sik-K",
  "김하온": "Haon", "수퍼비": "Superbee", "언에듀케이티드 키드": "Uneducated Kid", "호미들": "Homies", "씨잼": "C Jamm",
  "비와이": "BewhY", "태버": "Tabber", "미소": "Miso", "서사무엘": "Samuel Seo", "원슈타인": "Wonstein",
  "릴보이": "Lil Boi", "테이크원": "TakeOne", "쿵디판다": "Khundi Panda", "던말릭": "Don Malik", "폴블랑코": "Paul Blanco",
  "해쉬스완": "Hash Swan", "김효은": "Keem Hyo Eun", "이로한": "Rohann", "블라세": "Blase", "칠린홈미": "Chillin Homie",
  // 제이팝
  "요아소비": "YOASOBI", "요네즈 켄시": "Kenshi Yonezu", "이마세": "Imase", "후지이 카제": "Fujii Kaze", "킹누": "King Gnu",
  "오피셜히게단디즘": "Official HIGE DANdism", "미세스 그린 애플": "Mrs. GREEN APPLE", "바운디": "Vaundy", "아이뮨": "Aimyon", "래드벰프스": "RADWIMPS",
  "원오크록": "One Ok Rock", "아도": "Ado", "유우리": "Yuuri", "이브": "Eve",
  "시이나 링고": "Sheena Ringo", "우타다 히카루": "Utada Hikaru", "아무로 나미에": "Namie Amuro", "스파이에어": "SPYAIR", "백넘버": "back number",
  "세카이노 오와리": "SEKAI NO OWARI", "크리피너츠": "Creepy Nuts", "요루시카": "Yorushika", "투유": "Tuyu", "미나미": "Minami",
  "영기로 잘 부탁해": "ZUTOMAYO", "타니 유우키": "Tani Yuuki", "다이스": "Da-iCE", "아타라시 가코": "ATARASHII GAKKO!", "밀레이": "milet",
  "엑스지": "XG", "스노우맨": "Snow Man", "스톤즈": "SixTONES", "트래비스 재팬": "Travis Japan", "제이오원": "JO1",
  "아이앤아이": "INI", "미아이": "ME:I", "퍼퓸": "Perfume", "캬리 파뮤파뮤": "Kyary Pamyu Pamyu", "호시노 겐": "Gen Hoshino",
  "서치모스": "Suchmos", "널바리치": "Nulbarich", "키린지": "Kirinji", "램프": "Lamp", "수요일의 캄파넬라": "Wednesday Campanilla",
  "녹황색사회": "Ryokuoushoku Shakai", "노벨브라이트": "Novelbright", "아시안 쿵푸 제너레이션": "ASGARI", "라르크 앙 시엘": "L'Arc-en-Ciel", "엑스재팬": "X JAPAN",
  "카나리아": "Kanaria", "키쿠오": "Kikuo", "마레투": "MARETU", "데코니나": "DECO*27", "피노키오피": "PinocchioP",
  "슈도": "Syudou", "레올": "Reol", "마지코": "Majiko", "호시마치 스이세이": "Hoshimachi Suisei", "모리 칼리오페": "Mori Calliope",
  "결속밴드": "Kessoku Band", "미스앤로이드": "Myth & Roid", "레오나": "ReoNa", "플로우": "FLOW",
  "전자양": "Electron Sheep", "눔차": "numcha", "혁오": "HYUKOH"
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
