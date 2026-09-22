import type { Metadata } from "next";
import localFont from "next/font/local";
import { Playfair_Display, Nunito } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { LayoutWrapper } from "@/components/LayoutWrapper";
import { cookies } from "next/headers";
import { GoogleAnalytics } from "@next/third-parties/google";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

// 홈 화면의 큰 "Sortify" 워드마크 전용(font-wordmark). 한글이 없어 본문에는 쓰지 않는다.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

// 새 톤의 워드마크 — Nunito ExtraBold (2026-09-22 확정). latin 서브셋, SIL OFL 1.1, 가변 woff2 약 39KB.
// legacy 테마에서는 Playfair 가 그대로라 둘 다 싣는다. 채택이 굳으면 Playfair 를 뺀다.
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", weight: ["800"] });

/**
 * 테마 부트. 첫 페인트 전에 <html data-theme> 를 붙인다.
 * ?theme= 가 오면 localStorage 에 저장하고, 없으면 저장된 값을 쓴다.
 * 값이 없으면 아무것도 붙이지 않는다 = 기본(sky-tint, 2026-09-23 채택). legacy 는 ?theme=legacy 로 붙여야 나온다.
 */
const THEME_BOOT = `(function(){try{var q=new URLSearchParams(location.search),d=document.documentElement,ok=["legacy","toss-white","sky-tint"];
var v=q.get("theme");if(v&&ok.indexOf(v)>=0)localStorage.setItem("sortify_theme",v);v=localStorage.getItem("sortify_theme");
if(v&&ok.indexOf(v)>=0)d.setAttribute("data-theme",v);}catch(e){}})();`;

// 숫자만 혼자 강조되는 자리(순위·%·큰 숫자) 전용(font-num).
// 숫자·기호만 쓰므로 라틴 전용 Std 가변 폰트(82KB)를 쓴다. OFL: ./fonts/WantedSans-OFL.txt
const wantedSans = localFont({
  src: "./fonts/WantedSansStdVariable.woff2",
  display: "swap",
  weight: "400 1000",
  variable: "--font-wanted",
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("locale")?.value || "ko";

  if (lang === "ko") {
    return {
      title: "Sortify | 최애곡 순위 매기기, 나만의 음악 취향표 소트(Sort)",
      description: "좋아하는 아티스트와 곡들을 직접 나열하고 소트(Sort)해 보세요! 월드컵 토너먼트를 거쳐 나만의 세밀한 음악 취향표와 전체 트랙 순위 리스트를 완성하고, 나와 비슷한 곡을 좋아하는 사람들이 또 어떤 곡들을 좋아하는지 함께 살펴볼 수 있습니다.",
      alternates: {
        canonical: "https://sortify.kr",
      },
      openGraph: {
        title: "Sortify | 최애곡 순위 매기기, 나만의 음악 취향표 소트(Sort)",
        description: "좋아하는 아티스트와 곡들을 직접 나열하고 소트(Sort)해 보세요! 월드컵 토너먼트를 거쳐 나만의 세밀한 음악 취향표와 전체 트랙 순위 리스트를 완성하고, 나와 비슷한 곡을 좋아하는 사람들이 또 어떤 곡들을 좋아하는지 함께 살펴볼 수 있습니다.",
        images: ["/og-image.png"],
        type: "website",
      }
    };
  } else {
    return {
      title: "Sortify | Rank Your Favorite Songs & Build Your Music Tier List",
      description: "Select your favorite artists and tracks to sort them into your ultimate music tier list. Complete your precise track rankings through song tournaments, and explore what other music fans with similar tastes love listening to.",
      alternates: {
        canonical: "https://sortify.kr",
      },
      openGraph: {
        title: "Sortify | Rank Your Favorite Songs & Build Your Music Tier List",
        description: "Select your favorite artists and tracks to sort them into your ultimate music tier list. Complete your precise track rankings through song tournaments, and explore what other music fans with similar tastes love listening to.",
        images: ["/og-image.png"],
        type: "website",
      }
    };
  }
}


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("locale")?.value || "ko";

  return (
    <html lang={lang} suppressHydrationWarning className={`${pretendard.variable} ${playfair.variable} ${wantedSans.variable} ${nunito.variable} h-full antialiased`}>

      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Sortify",
              "alternateName": "소티파이",
              "url": "https://sortify.kr",
              "description": "좋아하는 아티스트와 곡들을 직접 나열하고 소트(Sort)해 보세요! 월드컵 토너먼트를 거쳐 나만의 세밀한 음악 취향표와 전체 트랙 순위 리스트를 완성할 수 있습니다.",
              "inLanguage": ["ko", "en"]
            })
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Prevent SecurityError when evaluating non-standard globals in sandboxed environments
                try {
                  Object.defineProperty(window, 'Deno', {
                    get: function() { return undefined; },
                    configurable: true
                  });
                } catch (e) {
                  try {
                    window.Deno = undefined;
                  } catch (err) {}
                }

                // Unconditionally override navigator.locks to undefined in the sandbox.
                // This forces Supabase to fall back to a safe, lock-free auth queue,
                // preventing all "SecurityError: The request was denied" exceptions on DB and Auth queries.
                try {
                  Object.defineProperty(navigator, 'locks', {
                    get: function() { return undefined; },
                    configurable: true
                  });
                } catch (e) {
                  try {
                    Object.defineProperty(Navigator.prototype, 'locks', {
                      get: function() { return undefined; },
                      configurable: true
                    });
                  } catch (err2) {}
                }

                // Handle document.cookie SecurityError in restricted iframe sandboxes
                try {
                  var testCookie = document.cookie;
                } catch (e) {
                  console.warn('Cookie access is denied. Falling back to in-memory cookies.', e);
                  var cookieStore = {};
                  var cookieDescriptor = {
                    get: function() {
                      var parts = [];
                      for (var name in cookieStore) {
                        if (cookieStore.hasOwnProperty(name)) {
                          parts.push(name + '=' + cookieStore[name]);
                        }
                      }
                      return parts.join('; ');
                    },
                    set: function(val) {
                      if (typeof val !== 'string') return;
                      var parts = val.split(';');
                      var firstPart = parts[0];
                      if (!firstPart) return;
                      var eqIdx = firstPart.indexOf('=');
                      if (eqIdx === -1) return;
                      var name = firstPart.substring(0, eqIdx).trim();
                      var value = firstPart.substring(eqIdx + 1).trim();
                      if (name) {
                        var isDelete = false;
                        for (var i = 1; i < parts.length; i++) {
                          var part = parts[i].trim().toLowerCase();
                          if (part.indexOf('max-age=0') === 0) {
                            isDelete = true;
                          }
                        }
                        if (isDelete || value === '') {
                          delete cookieStore[name];
                        } else {
                          cookieStore[name] = value;
                        }
                      }
                    },
                    configurable: true,
                    enumerable: true
                  };
                  try {
                    Object.defineProperty(Document.prototype, 'cookie', cookieDescriptor);
                  } catch (err) {
                    try {
                      Object.defineProperty(document, 'cookie', cookieDescriptor);
                    } catch (err2) {}
                  }
                }

                function createDummyStorage() {
                  var store = {};
                  return {
                    getItem: function(key) { return store.hasOwnProperty(key) ? store[key] : null; },
                    setItem: function(key, value) { store[key] = String(value); },
                    removeItem: function(key) { delete store[key]; },
                    clear: function() { store = {}; },
                    key: function(index) { return Object.keys(store)[index] || null; },
                    get length() { return Object.keys(store).length; }
                  };
                }
                try {
                  var testLocal = window.localStorage;
                  var testSession = window.sessionStorage;
                  if (testLocal) {
                    testLocal.setItem('__storage_test__', '1');
                    testLocal.removeItem('__storage_test__');
                  }
                  if (testSession) {
                    testSession.setItem('__storage_test__', '1');
                    testSession.removeItem('__storage_test__');
                  }
                } catch (e) {
                  console.warn('Storage access is denied. Falling back to in-memory storage.', e);
                  var dummyLocal = createDummyStorage();
                  var dummySession = createDummyStorage();
                  
                  try {
                    Object.defineProperty(Window.prototype, 'localStorage', {
                      get: function() { return dummyLocal; },
                      configurable: true
                    });
                  } catch (err) {
                    try {
                      Object.defineProperty(window, 'localStorage', {
                        get: function() { return dummyLocal; },
                        configurable: true
                      });
                    } catch (err2) {
                      window.localStorage = dummyLocal;
                    }
                  }
                  
                  try {
                    Object.defineProperty(Window.prototype, 'sessionStorage', {
                      get: function() { return dummySession; },
                      configurable: true
                    });
                  } catch (err) {
                    try {
                      Object.defineProperty(window, 'sessionStorage', {
                        get: function() { return dummySession; },
                        configurable: true
                      });
                    } catch (err2) {
                      window.sessionStorage = dummySession;
                    }
                  }
                }
              })();
            `
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <div className="bg-grain" />
        <AuthProvider>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthProvider>
        <GoogleAnalytics gaId="G-DBXJYMJRFE" />
      </body>
    </html>
  );
}
