import type { Metadata } from "next";
import localFont from "next/font/local";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Analog Record Shop",
  description: "당신의 음악적 온도를 확인해보세요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${pretendard.variable} ${playfair.variable} h-full antialiased`}>
      <head>
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
        <div className="w-full max-w-[430px] mx-auto min-h-screen bg-[var(--app-bg)] shadow-2xl relative flex flex-col px-6 overflow-x-hidden">
          <AuthProvider>
            {children}
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
