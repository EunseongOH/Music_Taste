"use server";
// src/utils/spotify.ts
import { createAdminClient } from "./supabase/admin";
import { getDbArtistAlbums, getDbTracksByAlbum, searchDbArtists, getDbArtistsByGenre } from "./dbCatalog";

// 앨범·트랙 캐시. 신곡이 나오면 낡으므로 짧게 잡는다.
const DB_CACHE_TTL_DAYS = 21;

// 아티스트 캐시(이름·사진). 신곡과 달리 잘 안 바뀌어서 길게 잡는다.
//
// 약관에는 기간 숫자가 없다. 두 조항이 있을 뿐이다.
//   IV.3.1 "use reasonable efforts to ensure that any data you display to users is the most
//           up to date data available ... Do not store Spotify Content indefinitely."
//   IV.3.2 "limited to the temporary caching of: metadata and cover art"
// 앞 조항은 "낡았는지"를 묻는다. 아티스트 사진은 원본이 안 바뀌면 90일 된 사본도 최신이다.
// 뒤 조항은 "무기한"만 금한다. 만료·갱신이 실제로 도는 한 temporary 다.
// 그래서 트랙리스트는 21일로 두고 아티스트만 90일로 뗀다.
//
// 효과: 2,716팀을 계속 최신으로 두는 비용이 하루 130콜에서 30콜로 준다.
// (배치 엔드포인트 /v1/artists?ids= 는 2026-09-21 실측 403 이라 1명당 1콜이다)
const ARTIST_CACHE_TTL_DAYS = Number(process.env.SPOTIFY_ARTIST_TTL_DAYS ?? 90);

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const getCacheExpiresAt = () => daysFromNow(DB_CACHE_TTL_DAYS);
const getArtistCacheExpiresAt = () => daysFromNow(ARTIST_CACHE_TTL_DAYS);

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
    const expiresAt = getArtistCacheExpiresAt();
    const lang = await getLocaleCookie();

    // genres 는 일부러 안 쓴다. 이 칸에 든 건 Spotify 가 준 값이 아니라 우리가 고른 16종 라벨이고
    // (explore_genre_picks 308건), Spotify 원본으로 덮으면 장르 피드 1차 조회가 깨진다.
    // upsert 는 넘긴 칸만 바꾸므로 빼두면 기존 라벨이 그대로 남는다.
    // 장르 깊이는 이제 artist_genre_feed(Wikidata P136, CC0)가 맡는다.
    const rows = artists.map(artist => ({
      id: artist.id,
      locale: lang,
      name: artist.name,
      images: artist.images || [],
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
//
// 엔드포인트 가드 (2026-09-17). Spotify 개발 모드 쿼터는 엔드포인트 묶음별 일일 한도이고, 넘으면
// 429 QUOTA_EXCEEDED + Retry-After 약 24시간이 온다. 이 가드가 없으면 차단된 동안에도 이용자 요청마다
// Spotify 를 다시 부른다. 긴 Retry-After 를 받으면 그 엔드포인트를 전 인스턴스에서 막고, 호출 수를 센다.
// RPC 가 실패하면 그냥 통과시킨다 — 가드가 서비스를 죽여서는 안 된다.
function endpointKey(url: string): string {
  try {
    return new URL(url).pathname.replace(/[0-9A-Za-z]{22}/g, '{id}');
  } catch {
    return url.split('?')[0];
  }
}

async function passEndpointGate(endpoint: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('spotify_endpoint_gate', { ep: endpoint });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

async function record429(endpoint: string, secs: number, reason: string | undefined) {
  try {
    // 쿼터 초과는 Retry-After 그대로, 그 외 긴 429 는 최대 1시간만 막는다
    const block = reason === 'QUOTA_EXCEEDED' ? secs : Math.min(secs, 3600);
    await createAdminClient().rpc('spotify_record_429', { ep: endpoint, secs: block, why: reason ?? 'RATE_LIMIT' });
  } catch { /* 기록 실패가 요청을 죽이지 않는다 */ }
}

async function spotifyFetch(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  const endpoint = endpointKey(url);
  if (!(await passEndpointGate(endpoint))) {
    lastSpotifyError = "429";
    return new Response('{"error":{"status":429,"message":"endpoint blocked locally"}}', {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
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
      const reason = await response.clone().json().then((b) => b?.error?.reason).catch(() => undefined);
      console.warn(`[Spotify API] 429 ${reason ?? 'Rate limited'} on ${endpoint}. Retry-After ${retryAfterSeconds}s. Blocking endpoint.`);
      await record429(endpoint, retryAfterSeconds, reason);
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

  // 사람이 직접 친 검색이라 마지막까지 Spotify 를 쓴다 (예산 전액). 그래도 다 쓰면 DB 로 답한다.
  const canAsk = await searchBudgetLeft(1);

  for (let fetched = 0; canAsk && fetched < limit; fetched += maxLimitPerRequest) {
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

  // Spotify 가 못 답했다. curatedArtists 136명으로 떨어지기 전에 우리 DB(2,200팀 이상)를 먼저 본다.
  // 한글 이름으로도 찾는다 — Spotify 검색이 한글에 약해서 오히려 여기가 더 잘 맞는 경우가 있다.
  const dbItems = await searchDbArtists(trimmedQuery, limit, offset);
  if (dbItems.length > 0) {
    searchCache.set(cacheKey, { data: dbItems, timestamp: Date.now() });
    return dbItems;
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

// 앨범 목록 엔드포인트는 개발 모드 일일 쿼터가 낮다 (2026-09-17 실측: 80회 남짓에서 차단).
// DB 로 답할 수 있는 아티스트는 이 예산을 넘긴 뒤로는 Spotify 를 부르지 않는다.
const ALBUM_ENDPOINT_DAILY_BUDGET = 50;

// 수록곡 엔드포인트는 전곡 모드가 앨범마다 한 번씩 부르기 때문에 가장 많이 쓰인다
// (2026-09-21 실측: 이용자가 거의 없는 날에도 232회). 한도를 넘기면 24시간 차단이고,
// 한도는 개발자 계정 전체가 공유하므로 그날 모든 이용자가 같이 막힌다.
// 정확한 상한은 공개돼 있지 않다. 실측하며 조정할 수 있게 환경변수로 뺀다.
const TRACK_ENDPOINT_DAILY_BUDGET = Number(process.env.SPOTIFY_TRACK_BUDGET ?? 600);

async function endpointBudgetLeft(endpoint: string, budget: number): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from('spotify_endpoint_quota')
      .select('calls_today, day, blocked_until')
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (!data) return true;
    if (data.blocked_until && new Date(data.blocked_until) > new Date()) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (data.day !== today) return true;
    return (data.calls_today ?? 0) < budget;
  } catch {
    return true;   // 계측 실패가 서비스를 막지 않는다
  }
}

// 검색은 쓰는 곳이 셋인데 막혔을 때 손해가 다르다. 한 통의 예산을 쓰되 멈추는 선을 달리 둬서,
// 사람이 직접 친 검색이 가장 오래 살아남게 한다 (장르 피드는 우리 DB·curated 로 채울 수 있다).
const SEARCH_BUDGET = Number(process.env.SPOTIFY_SEARCH_BUDGET ?? 200);
const searchBudgetLeft = (share: number) =>
  endpointBudgetLeft('/v1/search', Math.round(SEARCH_BUDGET * share));

const albumBudgetLeft = () => endpointBudgetLeft('/v1/artists/{id}/albums', ALBUM_ENDPOINT_DAILY_BUDGET);
const trackBudgetLeft = () => endpointBudgetLeft('/v1/albums/{id}/tracks', TRACK_ENDPOINT_DAILY_BUDGET);

/** 같은 앨범이 두 번 보이지 않게 합친다: Spotify 앨범 ID 로 1차, 정규화한 제목+발매연도로 2차 */
const EDITION_SUFFIX = /\s*[([][^)\]]*(deluxe|edition|remaster|remastered|version|ver\.|repackage|anniversary|expanded|bonus)[^)\]]*[)\]]/gi;
const albumKey = (a: any) => {
  const name = String(a?.name ?? "").normalize("NFKC").toLowerCase()
    .replace(EDITION_SUFFIX, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return `${name}|${String(a?.release_date ?? "").slice(0, 4)}`;
};

const albumTitleKey = (a: any) => albumKey(a).split("|")[0];
const albumYear = (a: any) => Number(String(a?.release_date ?? "").slice(0, 4)) || 0;

const albumTracks = (a: any) => Number(a?.total_tracks ?? 0) || 0;

/**
 * Spotify 목록과 자체 DB 목록을 합쳐 중복을 없앤다.
 *
 * 같은 앨범인지 보는 기준은 "정규화한 제목이 같고 발매연도가 1년 안쪽" 이다.
 * 출처마다 발매일 표기가 하루~한 해씩 다르기 때문이다.
 *
 * 겹칠 때 무엇을 남기는가: 곡이 더 많은 쪽. 같은 제목의 싱글과 정규 앨범이 붙어 있는 경우
 * (Ariana Grande 의 "thank u, next" 싱글 2018 / 앨범 2019) 먼저 나온 싱글을 남기면
 * 정규 앨범 수록곡을 통째로 잃는다. 곡 수가 같으면 Spotify 쪽을 남긴다 (커버가 있다).
 */
function mergeAlbums(spotifyItems: any[], db: any[]) {
  const dbIds = new Set(db.map((a) => a?.id).filter(Boolean));
  // 자체 DB 가 아는 앨범 종류. 제목으로도, 연도+곡수로도 찾을 수 있게 둔다
  const dbType = new Map<string, string>();
  for (const a of db) {
    if (!a?.album_type) continue;
    const t = albumTitleKey(a);
    if (t && !dbType.has(t)) dbType.set(t, a.album_type);
    const k = `${albumYear(a)}|${albumTracks(a)}`;
    if (albumYear(a) && albumTracks(a) && !dbType.has(k)) dbType.set(k, a.album_type);
  }
  const best = new Map<string, any>();        // 제목 -> 남길 앨범
  const order: string[] = [];
  const seenId = new Set<string>();

  const keyFor = (title: string, year: number) => {
    // 이미 같은 제목이 1년 안쪽에 있으면 그 묶음에 넣는다
    for (const k of best.keys()) {
      if (!k.startsWith(`${title}|`)) continue;
      const y = Number(k.split("|")[1]) || 0;
      if (!y || !year || Math.abs(y - year) <= 1) return k;
    }
    return `${title}|${year}`;
  };

  for (const a of [...spotifyItems, ...db]) {
    if (!a?.id || seenId.has(a.id)) continue;
    seenId.add(a.id);
    const title = albumTitleKey(a);
    if (!title) { order.push(a.id); best.set(a.id, a); continue; }
    const k = keyFor(title, albumYear(a));
    const prev = best.get(k);
    if (!prev) { order.push(k); best.set(k, a); continue; }
    // 곡이 더 많은 쪽을 남긴다. 같으면 먼저 온 쪽(= Spotify) 을 둔다
    if (albumTracks(a) > albumTracks(prev)) best.set(k, a);
  }
  let kept = order.map((k) => best.get(k)).filter(Boolean);

  // 제목이 같고 곡 수도 같으면 발매연도가 몇 해 떨어져 있어도 같은 앨범이다 (재발매·재등록).
  // 아이오아이 "손에 손잡고" 2016 / 2018 이 그랬다.
  {
    const byTitleTracks = new Map<string, any>();
    const drop2 = new Set<string>();
    for (const a of kept) {
      const k = `${albumTitleKey(a)}|${albumTracks(a)}`;
      if (!albumTitleKey(a) || !albumTracks(a)) continue;
      const prev = byTitleTracks.get(k);
      if (!prev) { byTitleTracks.set(k, a); continue; }
      // 자체 DB 쪽을 남긴다 (트랙리스트가 있다). 둘 다 같은 쪽이면 먼저 온 것을 남긴다
      const keepA = dbIds.has(a.id) && !dbIds.has(prev.id);
      drop2.add(keepA ? prev.id : a.id);
      if (keepA) byTitleTracks.set(k, a);
    }
    if (drop2.size) kept = kept.filter((a) => !drop2.has(a.id));
  }

  // 글자만 살짝 다른 같은 제목 — 잔나비 "소곡집 ll" / "소곡집 II" (소문자 L 과 로마 숫자 I).
  // 같은 해에 제목이 9할 이상 닮았으면 같은 앨범으로 본다.
  {
    const bigrams = (x: string) => {
      const m = new Map<string, number>();
      for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
      return m;
    };
    const sim = (a: string, b: string) => {
      if (!a || !b || a.length < 4 || b.length < 4) return a === b ? 1 : 0;
      const ga = bigrams(a), gb = bigrams(b);
      let hit = 0;
      for (const [g, n] of ga) hit += Math.min(n, gb.get(g) ?? 0);
      return (2 * hit) / (a.length - 1 + b.length - 1);
    };
    const drop4 = new Set<string>();
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        const a = kept[i], b = kept[j];
        if (drop4.has(a.id) || drop4.has(b.id)) continue;
        if (albumYear(a) !== albumYear(b) || !albumYear(a)) continue;
        const ta = albumTitleKey(a), tb = albumTitleKey(b);
        if (!ta || !tb || ta === tb) continue;
        if (sim(ta, tb) < 0.9) continue;
        // 곡이 많은 쪽을 남기고, 같으면 자체 DB 쪽을 남긴다
        const loser = albumTracks(a) !== albumTracks(b)
          ? (albumTracks(a) > albumTracks(b) ? b : a)
          : (dbIds.has(a.id) && !dbIds.has(b.id) ? b : a);
        drop4.add(loser.id);
      }
    }
    if (drop4.size) kept = kept.filter((a) => !drop4.has(a.id));
  }

  // 한쪽 제목이 다른 쪽을 품고 있고 연도·곡 수가 같으면 같은 앨범이다.
  // 아이오아이 "Whatta Man" / "Whatta Man (Good Man)" 이 그랬다.
  {
    const drop3 = new Set<string>();
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        const a = kept[i], b = kept[j];
        if (drop3.has(a.id) || drop3.has(b.id)) continue;
        if (albumYear(a) !== albumYear(b) || albumTracks(a) !== albumTracks(b) || !albumTracks(a)) continue;
        const ta = albumTitleKey(a), tb = albumTitleKey(b);
        if (!ta || !tb || ta === tb) continue;
        if (!ta.includes(tb) && !tb.includes(ta)) continue;
        drop3.add(dbIds.has(a.id) && !dbIds.has(b.id) ? b.id : a.id);
      }
    }
    if (drop3.size) kept = kept.filter((a) => !drop3.has(a.id));
  }

  // 제목이 서로 다른 언어면 위 비교로는 못 잡는다.
  // 데카당: Spotify "링구 / 애추"(2019-01-30, 4곡) / 자체 DB "Lingu / Talus"(2019, 4곡).
  // 같은 해에 곡 수가 같은 앨범이 양쪽에 하나씩만 있고 글자 체계가 다르면 같은 앨범으로 본다.
  // 자체 DB 쪽을 남긴다 — 트랙리스트를 갖고 있어서 눌러도 Spotify 를 부르지 않는다.
  const cjk = (s: string) => /[가-힣぀-ヿ一-鿿]/.test(s || "");
  const groups = new Map<string, any[]>();
  for (const a of kept) {
    const y = albumYear(a), n = albumTracks(a);
    if (!y || !n) continue;
    const k = `${y}|${n}`;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const drop = new Set<string>();
  for (const list of groups.values()) {
    if (list.length !== 2) continue;                       // 셋 이상이면 어느 쪽이 짝인지 알 수 없다
    const [a, b] = list;
    if (albumTitleKey(a) === albumTitleKey(b)) continue;    // 제목이 같으면 위에서 이미 처리됐다
    if (cjk(a.name) === cjk(b.name)) continue;             // 글자 체계가 같으면 진짜 다른 앨범일 수 있다
    const fromDb = dbIds.has(a.id) ? a : dbIds.has(b.id) ? b : null;
    const fromSpotify = dbIds.has(a.id) ? b : dbIds.has(b.id) ? a : null;
    if (!fromDb || !fromSpotify || fromDb === fromSpotify) continue;
    drop.add(fromSpotify.id);
  }

  return kept.filter((a) => !drop.has(a.id))
    .map((a) => {
      // Spotify 는 네다섯 곡짜리도 single 로 준다. 우리 DB 가 같은 앨범을 갖고 있으면 그쪽 종류를 쓴다
      // (DB 쪽은 판 표기를 뺀 실제 곡 수로 정해 둔 값이라 더 정확하다).
      if (dbIds.has(a.id) || a?.album_type !== "single") return a;
      const byTitle = dbType.get(albumTitleKey(a));
      const byShape = dbType.get(`${albumYear(a)}|${albumTracks(a)}`);
      const known = byTitle ?? byShape;
      if (known) return known === "single" ? a : { ...a, album_type: known };
      const n = albumTracks(a);
      if (n >= 8) return { ...a, album_type: "album" };
      if (n >= 5) return { ...a, album_type: "ep" };
      return a;
    })
    .sort((x, y) => String(y.release_date ?? "").localeCompare(String(x.release_date ?? "")));
}

/** 아티스트를 연 횟수만 센다 (우리 이용 기록이다. Spotify 콘텐츠를 저장하는 것이 아니다). */
function recordArtistDemand(artistId: string) {
  try {
    createAdminClient().rpc("bump_artist_demand", { p_id: artistId }).then(
      () => {},
      () => {},
    );
  } catch {
    /* 기록 실패가 화면을 막지 않는다 */
  }
}

/** 이 아티스트에 대해 지금까지 캐시에 쌓인 Spotify 앨범 전부 (페이지 구분 없이 합친다). */
async function cachedSpotifyAlbums(artistId: string, lang: string): Promise<{ items: any[]; total: number }> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('spotify_cache_artist_albums')
      .select('items, total')
      .eq('artist_id', artistId)
      .eq('locale', lang)
      .gt('expires_at', new Date().toISOString());
    // 페이지 캐시가 겹칠 수 있다. 같은 앨범을 두 번 세면 "남은 수" 계산이 틀어진다
    const byId = new Map<string, any>();
    let total = 0;
    for (const row of data ?? []) {
      for (const it of (row.items ?? []) as any[]) if (it?.id && !byId.has(it.id)) byId.set(it.id, it);
      total = Math.max(total, row.total ?? 0);
    }
    return { items: [...byId.values()], total };
  } catch (e) {
    console.warn("[Spotify Cache DB] cachedSpotifyAlbums failed:", e);
    return { items: [], total: 0 };
  }
}

// Fetch artist's albums (Paged to prevent excessive rate limiting)
export const getArtistAlbums = async (artistId: string, offset = 0, limit = 10) => {
  if (!artistId) {
    console.warn('[Spotify API] getArtistAlbums called with empty or undefined artistId');
    return { items: [], total: 0 };
  }

  const lang = await getLocaleCookie();
  const cacheKey = `${artistId}_${lang}_offset_${offset}_limit_${limit}`;

  // 1. Memory Cache check
  const cached = albumsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // 1-a. 이 아티스트를 누가 열었다는 것만 기록한다. 자주 열리는 아티스트부터 트랙리스트를
  //      끝까지 채워 영구 보관하기 위한 신호다. 실패해도 화면에 영향이 없도록 기다리지 않는다.
  if (offset === 0) recordArtistDemand(artistId);

  // 1-b. 자체 DB(MusicBrainz·Discogs·Deezer) 앨범 목록.
  //      Spotify 앨범 목록 엔드포인트는 개발 모드 일일 쿼터가 낮아(실측 80회 수준) 여기서 최대한 아낀다.
  const dbAlbums = await getDbArtistAlbums(artistId);

  // 2. 지금까지 받아 둔 Spotify 페이지 전부 (페이지별로 따로 합치면 같은 앨범이 페이지마다
  //    다른 출처로 나와 중복으로 보인다. 그래서 항상 "아티스트 전체 목록"을 한 번에 합쳐서 자른다)
  const known = await cachedSpotifyAlbums(artistId, lang);
  let merged = mergeAlbums(known.items, dbAlbums);
  let spotifyTotal = known.total;

  /**
   * 총 개수는 추측하지 않는다. 받아 본 만큼만 말한다.
   *
   * 중복을 걸러 내면 합친 목록이 Spotify 가 말한 수보다 적어진다. 예전에는 Spotify 수를 그대로
   * 알려 줘서 UI 가 그만큼 쪽을 만들고 뒤쪽이 빈 채로 남았다 (The Libertines 가 3쪽까지 생기고
   * 2·3쪽이 비어 있었다). 그래서 "지금 낼 수 있는 항목 수" 를 그대로 총 개수로 쓴다.
   *
   * 대신 마지막 쪽에 다다르면 Spotify 에서 한두 쪽 더 받아 목록을 늘린 뒤에 답한다.
   * 그래야 "다음" 단추가 실제로 보여 줄 것이 있을 때만 생긴다.
   */
  const done = (items: any[], total: number) => {
    const result = { items, total };
    albumsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  };
  const slice = () => merged.slice(offset, offset + limit);

  const budgetLeft = await albumBudgetLeft();
  const moreOnSpotify = () => spotifyTotal === 0 || known.items.length < spotifyTotal;

  // 이 쪽과 다음 쪽까지 채워져 있으면 더 부르지 않는다
  if (merged.length > offset + limit || !budgetLeft || !moreOnSpotify()) {
    if (merged.length || !budgetLeft) return done(slice(), merged.length);
  }

  // 모자라면 Spotify 에서 이어서 받는다. 한 번에 두 쪽까지만 (쿼터를 아낀다).
  for (let i = 0; i < 2 && budgetLeft && moreOnSpotify(); i++) {
    if (merged.length > offset + limit) break;               // 다음 쪽까지 확보됐으면 그만
    const from = known.items.length;                          // Spotify 쪽 위치는 받아 둔 원본 수 기준이다
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,ep&limit=${limit}&offset=${from}`
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Spotify API Error in getArtistAlbums (Status: ${response.status}):`, errorText);
      break;
    }
    const data = await response.json();
    const fresh = (data.items || []).filter((x: any) => x?.id);
    spotifyTotal = Math.max(spotifyTotal, data.total || 0);
    if (!fresh.length) break;
    known.items.push(...fresh);
    merged = mergeAlbums(known.items, dbAlbums);

    // 받은 쪽은 캐시에 남긴다 (오류로 인한 빈 배열이 영구 캐싱되지 않도록 검사한다)
    if ((data.total || 0) > 0 && fresh.length) {
      try {
        const supabase = createAdminClient();
        await supabase
          .from('spotify_cache_artist_albums')
          .upsert({
            artist_id: artistId,
            locale: lang,
            offset: from,
            limit,
            items: data.items || [],
            total: data.total || 0,
            expires_at: getCacheExpiresAt(),
          }, { onConflict: 'artist_id,locale,offset,limit' });
      } catch (e) {
        console.error("[Spotify Cache DB] Failed to save albums to cache:", e);
      }
    }
  }
  const result = { items: slice(), total: merged.length };
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

  // 1. Memory Cache check
  const cached = tracksCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // 1-b. 자체 DB(MusicBrainz·Discogs) 트랙리스트. 있으면 Spotify 를 부르지 않는다.
  //      검증되지 않은 연결은 dbCatalog 에서 이미 걸러진다 (부정확한 트랙리스트를 내보내지 않는다).
  const fromDb = (await getDbTracksByAlbum([albumId]))[albumId];
  if (fromDb?.length) {
    tracksCache.set(cacheKey, { data: fromDb, timestamp: Date.now() });
    return fromDb;
  }
  // "mb:" / "deezer:" 앨범은 우리 DB 에만 있다. Spotify 에 물어볼 수 없다 (Spotify ID 에는 ":" 가 없다).
  if (albumId.includes(":")) return [];

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

  // 하루 예산을 다 쓰면 Spotify 를 부르지 않는다. 여기서 안 멈추면 한도를 넘겨 24시간 차단되고,
  // 그때부터는 이 앨범뿐 아니라 그날 모든 이용자의 모든 앨범이 빈 채로 나온다.
  // 빈 배열을 돌려주면 화면은 "수록곡은 아직 준비 중이에요" 를 띄운다 (tracks/page.tsx t.noTracks).
  if (!(await trackBudgetLeft())) {
    console.warn(`[Spotify] 수록곡 일일 예산(${TRACK_ENDPOINT_DAILY_BUDGET})을 다 썼다. ${albumId} 는 건너뛴다.`);
    return [];
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
        // genres 는 jsonb 라 배열을 넘기면 Postgres 배열 리터럴({k-pop})로 보내져 json 오류가 난다.
        // 오류가 나면 장르마다 Spotify 검색으로 넘어가 전곡 모드 화면마다 검색 3회를 불렀다 (2026-09-17 확인).
        .contains('genres', JSON.stringify([genreId.toLowerCase()]))
        .gt('expires_at', now)
        .range(offset, offset + limitPerGenre - 1);

      let got = 0;
      if (!error && dbArtists && dbArtists.length > 0) {
        dbArtists.forEach((item: any) => {
          allResultsMap.set(item.id, item);
        });
        got = dbArtists.length;
      }

      // 캐시의 genres 는 Spotify 가 준 값이라 우리 16종 체계와 잘 안 맞는다. 실제로 장르가 붙어 있는 건
      // 우리가 손으로 고른 308건뿐이라 장르당 22명에서 막힌다. 그 뒤는 우리 장르 라벨로 채운다
      // (Wikidata P136, CC0 — 아티스트 1,423명). 여기까지 오면 Spotify 를 안 불러도 된다.
      if (got < limitPerGenre) {
        const fromDb = await getDbArtistsByGenre(genreId, limitPerGenre - got, Math.max(0, offset - got));
        for (const a of fromDb) if (!allResultsMap.has(a.id)) { allResultsMap.set(a.id, a); got++; }
      }

      if (got < limitPerGenre) genresNeedingApi.push(genreId);
    }
  } catch (e) {
    console.warn("[Spotify Cache DB] DB genre search error, using API fallback:", e);
    genresNeedingApi.push(...genresToFetch);
  }

  // 2. Query Spotify API only for genres with insufficient cache
  let anySucceeded = false;
  let hitRateLimit = false;

  // 장르 피드는 우리 DB 캐시와 curatedArtists 로도 채울 수 있다. 그래서 검색 예산의 60% 선에서 멈춰
  // 나머지를 사람이 직접 친 검색 몫으로 남긴다. 여기서 안 멈추면 장르 무한스크롤이 예산을 다 태운다.
  if (genresNeedingApi.length > 0 && !(await searchBudgetLeft(0.6))) {
    console.warn(`[Spotify] 검색 예산의 60% 를 넘겼다. 장르 ${genresNeedingApi.join(",")} 는 DB·curated 로만 낸다.`);
    genresNeedingApi.length = 0;
  }

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

  // 곡 검색도 사람이 친 것이라 늦게 막지만, 아티스트 검색 몫은 남겨 둔다.
  // 막히면 빈 배열이다 — 화면은 "결과 없음" 이 되고, 앨범 목록에서 고르는 길은 그대로 있다.
  if (!(await searchBudgetLeft(0.9))) {
    console.warn(`[Spotify] 검색 예산의 90% 를 넘겼다. 곡 검색 "${query}" 는 건너뛴다.`);
    return [];
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
