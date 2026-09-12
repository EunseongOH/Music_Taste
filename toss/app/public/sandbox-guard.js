/*
 * layout.tsx 의 <head> 인라인 스크립트를 그대로 옮긴 것이다.
 *
 * 왜 공유하지 않고 복사했나: 이 가드는 어떤 모듈보다 먼저, 네트워크 없이
 * 동기 실행돼야 한다. 웹 쪽을 외부 스크립트로 바꾸면 <head> 에 블로킹
 * 요청이 하나 늘고, 그 요청이 실패하면 가드가 아예 돌지 않는다.
 * 운영 중인 웹의 부팅 경로를 그렇게 바꾸는 위험이 중복 비용보다 크다.
 *
 * 토스 WebView 에서 특히 중요한 부분:
 *  - navigator.locks 무력화 → Supabase auth 가 락 없는 큐로 폴백한다.
 *    이게 없으면 DB/Auth 질의가 SecurityError 로 죽는다.
 *  - document.cookie / Storage 접근 거부 시 메모리 폴백.
 *
 * ⚠️ src/app/layout.tsx 의 해당 script 가 바뀌면 이 파일도 같이 고쳐야 한다.
 *    scripts 없이 손으로 옮기지 말 것 — 추출 스크립트로 다시 뽑는다.
 */
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
