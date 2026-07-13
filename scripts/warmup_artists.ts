import { getSpotifyAccessToken } from "../src/utils/spotify";
import { createAdminClient } from "../src/utils/supabase/admin";

// -------------------------------------------------------------------------
// 1. 아티스트 데이터 로드 및 중복 제거
// -------------------------------------------------------------------------

const KPOP_ARTISTS = [
  "NewJeans (뉴진스)", "IVE (아이브)", "AESPA (에스파)", "LE SSERAFIM (르세라핌)", "ILLIT (아일릿)",
  "BABYMONSTER (베이비몬스터)", "BLACKPINK (블랙핑크)", "TWICE (트와이스)", "Red Velvet (레드벨벳)", "STAYC (스테이씨)",
  "NMIXX (엔믹스)", "KISS OF LIFE (키스오브라이프)", "tripleS (트리플에스)", "FIFTY FIFTY (피프티피프티)", "(G)I-DLE ((여자)아이들)",
  "BTS (방탄소년단)", "SEVENTEEN (세븐틴)", "Stray Kids (스트레이 키즈)", "NCT DREAM (엔시티 드림)", "NCT 127 (엔시티 127)",
  "RIIZE (라이즈)", "TWS (투어스)", "ZEROBASEONE (제로베이스원)", "ENHYPEN (엔하이픈)", "TXT (투모로우바이투게더)",
  "BOYNEXTDOOR (보이넥스트도어)", "PLAVE (플레이브)", "DAY6 (데이식스)", "LUCY (루시)", "IU (아이유)",
  "Taeyeon (태연)", "Jungkook (정국)", "Jimin (지민)", "V (뷔)", "Jennie (제니)",
  "Lisa (리사)", "Rosé (로제)", "Nayeon (나연)", "Jihyo (지효)", "Hwasa (화사)",
  "Sunmi (선미)", "Chungha (청하)", "Kwon Eun Bi (권은비)", "Lee Young Ji (이영지)", "BIBI (비비)",
  "SHINee (샤이니)", "EXO (엑소)", "BIGBANG (빅뱅)", "Girls' Generation (소녀시대)", "AKMU (악뮤)",
  "NEXZ (넥스지)", "EVNNE (이븐)", "xikers (싸이커스)", "Naniwa Danshi (나니와단시)", "KATSEYE (캣츠아이)",
  "UNIS (유니스)", "RESCENE (리센느)", "BADVILLAIN (배드빌런)", "GOT7 (갓세븐)", "MONSTA X (몬스타엑스)",
  "ATEEZ (에이티즈)", "THE BOYZ (더보이즈)", "TREASURE (트레저)", "WINNER (위너)", "iKON (아이콘)",
  "BTOB (비투비)", "Highlight (하이라이트)", "Super Junior (슈퍼주니어)", "TVXQ! (동방신기)", "2PM (투피엠)",
  "f(x) (에프엑스)", "Apink (에이핑크)", "MAMAMOO (마마무)", "GFRIEND (여자친구)", "OH MY GIRL (오마이걸)",
  "WJSN (우주소녀)", "LOONA (이달의 소녀)", "fromis_9 (프로미스나인)", "Kep1er (케플러)", "VIVIZ (비비지)",
  "Everglow (에버글로우)", "Dreamcatcher (드림캐쳐)", "NiziU (니쥬)", "Lee Mujin (이무진)", "K.Will (케이윌)",
  "Sung Si Kyung (성시경)", "Park Hyo Shin (박효신)", "Younha (윤하)", "Baek Yerin (백예린)", "Lee Hi (이하이)",
  "Baekhyun (백현)", "D.O. (디오)", "Suho (수호)", "Kai (카이)", "Taemin (태민)",
  "Key (키)", "Hoshi (호시)", "ARTMS (아르테미스)", "Loossemble (루셈블)", "Billlie (빌리)",
  "PURPLE KISS (퍼플키스)", "H1-KEY (하이키)", "WOOAH (우아)", "YOUNG POSSE (영파씨)", "MEOVV (미야오)",
  "MADEIN (메이딘)", "ONEUS (원어스)", "CRAVITY (크래비티)", "EPEX (이펙스)", "P1Harmony (피원하모니)",
  "AMPERS&ONE (앰퍼샌드원)", "ALL(H)OURS (올아워즈)", "ISEGYE IDOL (이세계아이돌)", "STELLIVE (스텔라이브)", "INFINITE (인피니트)",
  "TEEN TOP (틴탑)", "Block B (블락비)", "B1A4 (비원에이포)", "B.A.P (비에이피)", "VIXX (빅스)",
  "NU'EST (뉴이스트)", "MBLAQ (엠블랙)", "2AM (투에이엠)", "T-ARA (티아라)", "Secret (시크릿)",
  "4minute (포미닛)", "SISTAR (씨스타)", "Miss A (미쓰에이)", "Girl's Day (걸스데이)", "EXID (이엑스아이디)",
  "AOA (에이오에이)", "Nine Muses (나인뮤지스)", "Brown Eyed Girls (브라운 아이드 걸스)", "KARA (카라)", "Wonder Girls (원더걸스)",
  "2NE1 (투애니원)", "G-DRAGON (지드래곤)", "TAEYANG (태양)", "Rain (비)", "FANTASY BOYS",
  "NOWADAYS", "POW"
];

const POP_ARTISTS = [
  "Taylor Swift", "Billie Eilish", "Bruno Mars", "The Weeknd", "Sabrina Carpenter",
  "Olivia Rodrigo", "Ariana Grande", "Dua Lipa", "Post Malone", "Justin Bieber",
  "Ed Sheeran", "Drake", "Kendrick Lamar", "SZA", "Beyonce",
  "Rihanna", "Lady Gaga", "Katy Perry", "Coldplay", "Maroon 5",
  "Imagine Dragons", "One Direction", "Harry Styles", "Zayn", "Niall Horan",
  "Troye Sivan", "Charlie Puth", "Lauv", "LANY", "Benson Boone",
  "Chappell Roan", "Teddy Swims", "Gracie Abrams", "Tate McRae", "Shawn Mendes",
  "Camila Cabello", "Selena Gomez", "Doja Cat", "Nicki Minaj", "Eminem",
  "Travis Scott", "Kanye West", "Central Cee", "New West", "Pink Sweat$",
  "Honne", "Cigarettes After Sex", "Adele", "Sam Smith", "Khalid",
  "Conan Gray", "Jeremy Zucker", "Chelsea Cutler", "Alexander 23", "BoyWithUke",
  "Joji", "PinkPantheress", "Ice Spice", "GloRilla", "Megan Thee Stallion",
  "Cardi B", "Lizzo", "H.E.R.", "Kehlani", "Summer Walker",
  "Daniel Caesar", "Giveon", "Steve Lacy", "Frank Ocean", "Tyler, The Creator",
  "Childish Gambino", "Mac Miller", "Logic", "G-Eazy", "Machine Gun Kelly",
  "5 Seconds of Summer", "The 1975", "OneRepublic", "Twenty One Pilots", "Panic! At The Disco",
  "Fall Out Boy", "My Chemical Romance", "Green Day", "Linkin Park", "Gorillaz",
  "Daft Punk", "Calvin Harris", "Zedd", "Marshmello", "The Chainsmokers",
  "Alan Walker", "Kygo", "Avicii", "David Guetta", "Sia",
  "Lana Del Rey", "Lorde", "Tommy Richman", "Shaboozey", "Clairo",
  "Faye Webster", "Boygenius", "Phoebe Bridgers", "Mitski", "Men I Trust",
  "TV Girl", "The Marías", "Beabadoobee", "Laufey", "d4vd",
  "Raye", "Sexyy Red", "Tyla", "Ayra Starr", "Oasis (오아시스)",
  "Queen (퀸)", "The Beatles (비틀즈)", "Radiohead (라디오헤드)", "Blur (블러)", "Nirvana (너바나)",
  "Red Hot Chili Peppers", "U2", "Bon Jovi", "Guns N' Roses", "Pink Floyd",
  "Led Zeppelin", "ABBA"
];

const INDIE_ROCK_KBAND_ARTISTS = [
  "10CM (십cm)", "Jannabi (잔나비)", "Melomance (멜로망스)", "Urban Zakapa (어반자카파)", "Paul Kim (폴김)",
  "Jukjae (적재)", "Car, the garden (카더가든)", "Choi Yu Ree (최유리)", "Bolbbalgan4 (볼빨간사춘기)", "Heize (헤이즈)",
  "Silica Gel (실리카겔)", "The Volunteers (더 볼런티어스)", "Se So Neon (새소년)", "Thornapple (쏜애플)", "Nerd Connection (너드커넥션)",
  "Wave to Earth (웨이브투에스)", "SURL (설)", "Standing Egg (스탠딩 에그)", "Cheeze (치즈)", "Stella Jang (스텔라장)",
  "Sunwoojunga (선우정아)", "Kwon Jin Ah (권진아)", "Sam Kim (샘김)", "Lee Jin Ah (이진아)", "Dept (뎁트)",
  "Lacuna (라쿠나)", "Kachisan (까치산)", "Kim Seung-ju (김승주)", "92914", "OOHYO (우효)",
  "Galaxy Express (갤럭시 익스프레스)", "Glen Check (글렌체크)", "Idiotape (이디앗테이프)", "Peppertones (페퍼톤스)", "Daybreak (데이브레이크)",
  "Soran (소란)", "Romantic Punch (로맨틱펀치)", "Crying Nut (크라잉넛)", "No Brain (노브레인)", "Dickpunks (딕펑스)",
  "Broccoli, you too? (브로콜리너마저)", "Autumn Vacation (가을방학)", "Epitone Project (에피톤 프로젝트)", "Sentimental Scenery (센티멘탈 시너리)", "Lucia (심규선)",
  "Taru (타루)", "Yozoh (요조)", "Han Hee Jung (한희정)", "J Rabbit (제이래빗)", "OKDAL (옥상달빛)",
  "Sweden Laundry (스웨덴세탁소)", "Vanilla Acoustic (바닐라 어쿠스틱)", "Acoustic Collabo (어쿠스틱 콜라보)", "Sugarbowl (슈가볼)", "Touched (터치드)",
  "Yudabin Band (유다빈밴드)", "9001 (나인티오원)", "CNEMA (시네마)", "KARDI (카디)", "Dabda (답다)",
  "cotoba (코토바)", "Broken Valentine (브로큰 발렌타인)", "HarryBigButton (해리빅버튼)", "Rolling Quartz (롤링쿼츠)", "Walking After U (워킹아프터유)",
  "Fleeing from Reality (도망칠 수 없는 현실에서)", "D82 (디에잇투)", "The Fix (더 픽스)", "LØREN (로렌)", "Hanroro (한로로)",
  "Meaningful Stone (김뜻돌)", "OurR (아워)", "Bosudong Cooler (보수동쿨러)", "Say Sue Me (세이수미)", "Drinking Boys and Girls Choir",
  "GIFT (기프트)", "FTISLAND (FT아일랜드)", "CNBLUE (씨엔블루)", "Prep (프렙)", "Masego",
  "FKJ", "Tom Misch", "Westlife", "Earth, Wind & Fire", "AC/DC",
  "Metallica", "The Smiths", "The Strokes", "Arctic Monkeys", "Backstreet Boys",
  "Soulman (소울맨)", "Junggigo (정기고)", "George (죠지)", "THAMA (따마)", "Dvwn (다운)",
  "SUMIN (수민)"
];

const HIPHOP_RNB_ARTISTS = [
  "Crush (크러쉬)", "Zion.T (자이언티)", "DEAN (딘)", "DPR IAN (디피알 이안)", "DPR LIVE (디피알 라이브)",
  "Woodz (우즈)", "Colde (콜드)", "Rad Museum (라드뮤지엄)", "Dynamicduo (다이나믹 듀오)", "Epik High (에픽하이)",
  "Jay Park (박재범)", "Loco (로꼬)", "Woo (우원재)", "Coogie (쿠기)", "Giriboy (기리보이)",
  "Changmo (창모)", "ASH ISLAND (애쉬 아일랜드)", "BE'O (비오)", "Leellamarz (릴러말즈)", "BIG Naughty (빅나티)",
  "Skinny Brown (스키니브라운)", "Mad Clown (매드클라운)", "San E (산이)", "Verbal Jint (버벌진트)", "Swings (스윙스)",
  "Black Nut (블랙넛)", "Vasco (바스코 / 빌스택스)", "Justhis (저스디스)", "Kid Milli (키드밀리)", "NO:EL (노엘)",
  "Yanghongwon (양홍원)", "nowiamproud (나우아임영)", "Beenzino (빈지노)", "ZICO (지코)", "E-Sens (이센스)",
  "Simon Dominic (사이먼 도미닉)", "The Quiett (더콰이엇)", "Paloalto (팔로알토)", "Deepflow (딥플로우)", "Nucksal (넉살)",
  "Gray (그레이)", "Code Kunst (코드 쿤스트)", "pH-1 (피에이치원)", "Sik-K (식케이)", "Haon (김하온)",
  "Superbee (수퍼비)", "Uneducated Kid (언에듀케이티드 키드)", "Homies (호미들)", "C Jamm (씨잼)", "BewhY (비와이)",
  "Tabber (태버)", "Miso (미소)", "Samuel Seo (서사무엘)", "Wonstein (원슈타인)", "Lil Boi (릴보이)",
  "TakeOne (테이크원)", "Khundi Panda (쿵디판다)", "Don Malik (던말릭)", "Paul Blanco (폴블랑코)", "Hash Swan (해쉬스완)",
  "Keem Hyo Eun (김효은)", "Rohann (이로한)", "Blase (블라세)", "Chillin Homie (칠린홈미)", "INFINITE (인피니트)",
  "Block B (블락비)"
];

const JPOP_ARTISTS = [
  "YOASOBI (요아소비)", "Kenshi Yonezu (요네즈 켄시)", "Imase (이마세)", "Fujii Kaze (후지이 카제)", "King Gnu (킹누)",
  "Official HIGE DANdism (오피셜히게단디즘)", "Mrs. GREEN APPLE (미세스 그린 애플)", "Vaundy (바운디)", "Aimyon (아이뮨)", "RADWIMPS (래드벰프스)",
  "One Ok Rock (원오크록)", "Ado (아도)", "LiSA (리사)", "Yuuri (유우리)", "Eve (이브)",
  "Sheena Ringo (시이나 링고)", "Utada Hikaru (우타다 히카루)", "Namie Amuro (아무로 나미에)", "SPYAIR (스파이에어)", "back number (백넘버)",
  "SEKAI NO OWARI (세카이노 오와리)", "Creepy Nuts (크리피너츠)", "Yorushika (요루시카)", "Tuyu (투유)", "Minami (미나미)",
  "ZUTOMAYO (영기로 잘 부탁해)", "Tani Yuuki (타니 유우키)", "Da-iCE (다이스)", "ATARASHII GAKKO! (아타라시 가코)", "milet (밀레이)",
  "XG (엑스지)", "Snow Man (스노우맨)", "SixTONES (스톤즈)", "Travis Japan (트래비스 재팬)", "JO1 (제이오원)",
  "INI (아이앤아이)", "ME:I (미아이)", "Perfume (퍼퓸)", "Kyary Pamyu Pamyu (캬리 파뮤파뮤)", "Gen Hoshino (호시노 겐)",
  "Suchmos (서치모스)", "Nulbarich (널바리치)", "Kirinji (키린지)", "Lamp (램프)", "Wednesday Campanilla (수요일의 캄파넬라)",
  "Ryokuoushoku Shakai (녹황색사회)", "Novelbright (노벨브라이트)", "ASGARI (아시안 쿵푸 제너레이션)", "L'Arc-en-Ciel (라르크 앙 시엘)", "X JAPAN (엑스재팬)",
  "Kanaria (카나리아)", "Kikuo (키쿠오)", "MARETU (마레투)", "DECO*27 (데코니나)", "PinocchioP (피노키오피)",
  "Syudou (슈도)", "Reol (레올)", "Majiko (마지코)", "Hoshimachi Suisei (호시마치 스이세이)", "Mori Calliope (모리 칼리오페)",
  "Kessoku Band (결속밴드)", "Myth & Roid (미스앤로이드)", "TK from Ling Tosite Sigure", "ReoNa (레오나)", "FLOW (플로우)",
  "MAN WITH A MISSION", "Electron Sheep (전자양)", "numcha (눔차)", "Phum Viphurit", "sunset rollercoaster (낙일飛車)",
  "HYUKOH (혁오)"
];

const TROT_ARTISTS = [
  "임영웅 (Lim Young Woong)", "영탁 (Young Tak)", "이찬원 (Lee Chan Won)", "김호중 (Kim Ho Joong)", "정동원 (Jeong Dong Won)",
  "장민호 (Jang Min Ho)", "김희재 (Kim Hee Jae)", "박서진 (Park Seo Jin)", "안성훈 (An Sung Hoon)", "박지현 (Park Ji Hyun)",
  "손태진 (Son Tae Jin)", "신유 (Shin Yu)", "진해성 (Jin Hae Seong)", "송가인 (Song Ga In)", "양지은 (Yang Ji Eun)",
  "홍지윤 (Hong Ji Yun)", "김다현 (Kim Da Hyun)", "전유진 (Jeon Yu Jin)", "오유진 (Oh Yu Jin)", "장윤정 (Jang Yoon Jeong)",
  "홍진영 (Hong Jin Young)", "김연자 (Kim Yeon Ja)", "남진 (Nam Jin)", "나훈아 (Na Hoon A)", "심수봉 (Sim Soo Bong)",
  "주현미 (Zhou Xuan Mei / Ju Hyun Mi)", "설운도 (Sul Woon Do)", "태진아 (Tae Jin Ah)", "송대관 (Song Dae Kwan)", "진성 (Jin Sung)"
];

// 전체 아티스트 목록 (중복 제거)
const ALL_ARTISTS = Array.from(new Set([
  ...KPOP_ARTISTS,
  ...POP_ARTISTS,
  ...INDIE_ROCK_KBAND_ARTISTS,
  ...HIPHOP_RNB_ARTISTS,
  ...JPOP_ARTISTS,
  ...TROT_ARTISTS
]));

// -------------------------------------------------------------------------
// 2. 핵심 설정 상수
// -------------------------------------------------------------------------

const REQUEST_DELAY_MS = 900;       // 기본 호출 지연 시간 (800ms ~ 1000ms 권장)
const CHUNK_SIZE = 15;              // 청크 단위 개수 (10 ~ 20개 권장)
const CHUNK_DELAY_MS = 3500;        // 청크 간 추가 대기 시간
const DB_CACHE_TTL_DAYS = 21;       // 캐시 보존 기간 (21일)
const MIN_POPULARITY_LIMIT = 5;     // 1차 검색 인기도 하한선 (0~100)
const MAX_UPDATES_PER_RUN = 50;     // 1회 실행당 최대 신규/갱신 캐싱 제한 (스포티파이 API 429 회피용)

// Helper to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// -------------------------------------------------------------------------
// 3. 다국어 이름 분리 및 텍스트 매칭 유틸리티
// -------------------------------------------------------------------------

interface ParsedName {
  primary: string;
  secondary: string | null;
}

function parseArtistName(rawName: string): ParsedName {
  // 예: "임영웅 (Lim Young Woong)" -> primary: "임영웅", secondary: "Lim Young Woong"
  // 예: "YOASOBI (요아소비)" -> primary: "YOASOBI", secondary: "요아소비"
  const regex = /^([^\(]+)(?:\((.+)\))?/;
  const match = rawName.match(regex);
  if (!match) {
    return { primary: rawName.trim(), secondary: null };
  }
  
  const primary = match[1].trim();
  const secondary = match[2] ? match[2].trim() : null;
  return { primary, secondary };
}

function isMatchingArtist(artistName: string, parsed: ParsedName): boolean {
  const normArtist = artistName.replace(/\s+/g, '').toLowerCase();
  const normPrimary = parsed.primary.replace(/\s+/g, '').toLowerCase();
  const normSecondary = parsed.secondary ? parsed.secondary.replace(/\s+/g, '').toLowerCase() : null;

  return (
    normArtist.includes(normPrimary) || 
    normPrimary.includes(normArtist) || 
    (normSecondary !== null && (normArtist.includes(normSecondary) || normSecondary.includes(normArtist)))
  );
}

// -------------------------------------------------------------------------
// 4. Rate-Limit 회피용 Spotify API Fetcher
// -------------------------------------------------------------------------

async function fetchSpotify(url: string, retries = 3): Promise<any> {
  const token = await getSpotifyAccessToken();
  
  // 한국 마켓 및 한국어 타겟 로케일로 우선 Fetch
  let adjustedUrl = url;
  if (url.includes("?")) {
    if (!url.includes("market=")) adjustedUrl = `${url}&market=KR`;
  } else {
    adjustedUrl = `${url}?market=KR`;
  }

  const response = await fetch(adjustedUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    cache: 'no-store'
  });

  // 429 Too Many Requests 처리
  if (response.status === 429 && retries > 0) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
    const sleepMs = retryAfterSeconds * 1000 + 500; // 버퍼 500ms 추가

    console.warn(`[Spotify API] 429 Too Many Requests 감지. Retry-After: ${retryAfterSeconds}초. 대기 후 재시도합니다...`);
    await sleep(sleepMs);
    return fetchSpotify(url, retries - 1);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Spotify API Error [${response.status}]: ${errText}`);
  }

  return response.json();
}

// -------------------------------------------------------------------------
// 5. 검색 및 매칭 로직 (1차 & 2차 Fallback)
// -------------------------------------------------------------------------

async function searchArtistWithFallback(rawName: string): Promise<any | null> {
  const parsed = parseArtistName(rawName);
  
  // 1차 검색 쿼리 구성: secondary(괄호 내 영어나 한국어)가 있으면 그것을 우선 검색해보고, 없으면 primary 검색
  // 예: "임영웅 (Lim Young Woong)" -> "Lim Young Woong" 우선 검색
  // 예: "YOASOBI (요아소비)" -> "YOASOBI" 우선 검색
  const firstQuery = parsed.secondary || parsed.primary;
  
  console.log(`  -> [1차 검색 시도] 검색어: "${firstQuery}"`);
  let url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(firstQuery)}&type=artist&limit=5`;
  let data = await fetchSpotify(url);
  let items = data.artists?.items || [];

  let bestMatch = selectBestArtist(items, parsed);

  // 2차 검색 (Fallback) 조건 만족 시 실행:
  // - 1차 검색 결과가 전혀 없거나
  // - 매칭된 아티스트의 인기도가 임계치(5) 미만으로 동명이인이나 마이너 채널일 확률이 높은 경우
  if (!bestMatch || bestMatch.popularity < MIN_POPULARITY_LIMIT) {
    const secondQuery = parsed.secondary ? parsed.primary : null;
    
    if (secondQuery) {
      console.log(`  -> [2차 검색 Fallback 시도] 검색어: "${secondQuery}" (1차 결과 부족/불일치)`);
      url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(secondQuery)}&type=artist&limit=5`;
      data = await fetchSpotify(url);
      const secondItems = data.artists?.items || [];
      const secondMatch = selectBestArtist(secondItems, parsed);

      if (secondMatch) {
        // 2차 검색 결과가 더 높은 인기도를 가지고 매칭이 맞다면 대체
        if (!bestMatch || secondMatch.popularity > bestMatch.popularity) {
          bestMatch = secondMatch;
        }
      }
    }
  }

  return bestMatch;
}

function selectBestArtist(items: any[], parsed: ParsedName): any | null {
  if (items.length === 0) return null;

  // 1. 이름이 일치하는 아티스트들만 필터링
  const matchingItems = items.filter(item => isMatchingArtist(item.name, parsed));

  if (matchingItems.length === 0) {
    // 텍스트 매칭이 안되더라도 첫번째 결과의 인기도가 매우 높고(예: 60 이상) 부분 포함되면 살려줌
    const firstItem = items[0];
    if (firstItem.popularity >= 50 && (
      firstItem.name.toLowerCase().includes(parsed.primary.toLowerCase()) ||
      (parsed.secondary && firstItem.name.toLowerCase().includes(parsed.secondary.toLowerCase()))
    )) {
      return firstItem;
    }
    return null;
  }

  // 2. 매칭되는 아티스트 중 Popularity가 가장 높은 아티스트 선정
  return matchingItems.sort((a, b) => b.popularity - a.popularity)[0];
}

// -------------------------------------------------------------------------
// 6. DB 캐시 저장 (Supabase)
// -------------------------------------------------------------------------

async function saveToDb(artist: any) {
  const supabase = createAdminClient();
  
  // 만료일: 현재 시간 + 21일
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DB_CACHE_TTL_DAYS);
  const expiresAtStr = expiresAt.toISOString();

  // 'ko' 로케일 기준으로 우선 적재
  const { error } = await supabase
    .from('spotify_cache_artists')
    .upsert({
      id: artist.id,
      locale: 'ko',
      name: artist.name,
      images: artist.images || [],
      genres: artist.genres || [],
      popularity: artist.popularity || 0,
      expires_at: expiresAtStr
    }, { onConflict: 'id,locale' });

  if (error) {
    throw new Error(`DB Upsert Error: ${error.message}`);
  }
}

// -------------------------------------------------------------------------
// 7. 메인 실행 제어 엔진 (Warm-up Runner)
// -------------------------------------------------------------------------

async function main() {
  console.log(`================================================================`);
  console.log(`🎵 Spotify API Warm-up Runner 시작합니다.`);
  console.log(`📊 적재 대상 아티스트: 총 ${ALL_ARTISTS.length}명 (중복 제거 완료)`);
  console.log(`================================================================\n`);

  const supabase = createAdminClient();
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let isCapReached = false;

  // 전체 아티스트 목록을 청크 단위로 나누어 실행
  for (let i = 0; i < ALL_ARTISTS.length; i += CHUNK_SIZE) {
    if (isCapReached) break;
    
    const chunk = ALL_ARTISTS.slice(i, i + CHUNK_SIZE);
    console.log(`\n================================================================`);
    console.log(`📦 [청크 진행] ${Math.floor(i / CHUNK_SIZE) + 1}번째 청크 처리 시작 (${i + 1} ~ ${Math.min(i + CHUNK_SIZE, ALL_ARTISTS.length)}명)`);
    console.log(`================================================================`);

    for (const rawName of chunk) {
      // 1회 실행당 API 호출을 동반한 최대 캐싱/갱신 처리 수(성공 + 실패)가 제한 값에 도달하면 조기 종료
      if ((successCount + failCount) >= MAX_UPDATES_PER_RUN) {
        console.log(`\n🛑 [제한] 1회 최대 캐싱 제한(${MAX_UPDATES_PER_RUN}명)에 도달했습니다. 남은 항목은 내일 크론 런에서 이어서 적재합니다.`);
        isCapReached = true;
        break;
      }

      const globalIndex = ALL_ARTISTS.indexOf(rawName) + 1;
      console.log(`\n[${globalIndex}/${ALL_ARTISTS.length}] "${rawName}" 캐싱 처리 중...`);

      try {
        const parsed = parseArtistName(rawName);

        // 1. 이미 캐시된 데이터가 있고 유효 기간이 3일 이상 넉넉히 남아있는지 확인
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const threeDaysStr = threeDaysFromNow.toISOString();

        const { data: existing } = await supabase
          .from('spotify_cache_artists')
          .select('id, expires_at')
          .eq('locale', 'ko')
          .eq('name', parsed.primary)
          .gt('expires_at', threeDaysStr)
          .maybeSingle();

        if (existing) {
          console.log(`  -> [SKIP] 캐시 유효 기간이 3일 이상 충분히 남아있습니다. (만료일: ${existing.expires_at})`);
          skipCount++;
          continue;
        }

        // 2. 스포티파이 검색 & 매칭 (Retry-After 대응 fetch)
        const matchedArtist = await searchArtistWithFallback(rawName);

        if (!matchedArtist) {
          console.error(`  -> [FAIL] 매칭되는 아티스트를 찾지 못했습니다.`);
          failCount++;
          continue;
        }

        console.log(`  -> [MATCH] 스포티파이 매칭 성공: "${matchedArtist.name}" (ID: ${matchedArtist.id}, Popularity: ${matchedArtist.popularity})`);

        // 3. Supabase DB 캐시 적재
        await saveToDb(matchedArtist);
        console.log(`  -> [SUCCESS] DB 캐시 적재 완료! (Expires: 21일 뒤)`);
        successCount++;

      } catch (err: any) {
        console.error(`  -> [ERROR] 처리 중 예외 발생:`, err.message || err);
        failCount++;
      }

      // API Rate Limit 방어를 위한 요청 간 딜레이 대기
      await sleep(REQUEST_DELAY_MS);
    }

    // 청크 완료 후 추가 지연 대기 (마지막 청크이거나 조기 중단된 경우 대기 생략)
    if (!isCapReached && i + CHUNK_SIZE < ALL_ARTISTS.length) {
      console.log(`\n💤 청크 완료. API Rate Limit 방어를 위해 ${CHUNK_DELAY_MS / 1000}초간 대기합니다...`);
      await sleep(CHUNK_DELAY_MS);
    }
  }

  console.log(`\n================================================================`);
  console.log(`🎉 Spotify DB Warm-up 완료!`);
  console.log(`✅ 성공: ${successCount}명 | ⏩ 스킵 (캐시 유효): ${skipCount}명 | ❌ 실패: ${failCount}명`);
  console.log(`================================================================`);
}

// 스크립트 실행 트리거
if (require.main === module) {
  // 환경 변수 확인
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[Warm-up] Error: Required Supabase env variables are not set.");
    console.error("Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are loaded.");
    process.exit(1);
  }

  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export const warmupArtists = main;
