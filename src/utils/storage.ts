class MemoryStorage implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store.hasOwnProperty(key) ? this.store[key] : null;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

const createSafeStorage = (type: 'localStorage' | 'sessionStorage'): Storage => {
  if (typeof window === 'undefined') {
    return new MemoryStorage();
  }

  try {
    const storage = window[type];
    if (storage) {
      // Test write/read to ensure access is fully granted and doesn't throw
      storage.setItem('__storage_test__', '1');
      storage.removeItem('__storage_test__');
      return storage;
    }
  } catch (e) {
    console.warn(`[Storage] ${type} access is restricted. Using in-memory fallback.`, e);
  }

  return new MemoryStorage();
};

// Global scope shadowing for restricted browser sandboxes (specifically to prevent Supabase JS SDK SecurityErrors)
if (typeof window !== 'undefined') {
  try {
    if (!('Deno' in window)) {
      Object.defineProperty(window, 'Deno', {
        get: () => undefined,
        configurable: true
      });
    }
  } catch (e) {}

  const testStorage = (type: 'localStorage' | 'sessionStorage') => {
    try {
      const storage = window[type];
      if (!storage) return false;
      storage.setItem('__sandbox_test__', '1');
      storage.removeItem('__sandbox_test__');
      return true;
    } catch (e) {
      return false;
    }
  };

  if (!testStorage('localStorage')) {
    console.warn('[Storage] window.localStorage is restricted by browser sandbox. Overriding with safe MemoryStorage globally.');
    try {
      Object.defineProperty(window, 'localStorage', {
        value: new MemoryStorage(),
        configurable: true,
        enumerable: true,
        writable: true
      });
    } catch (err) {
      console.error('[Storage] Failed to override window.localStorage globally:', err);
    }
  }

  if (!testStorage('sessionStorage')) {
    console.warn('[Storage] window.sessionStorage is restricted by browser sandbox. Overriding with safe MemoryStorage globally.');
    try {
      Object.defineProperty(window, 'sessionStorage', {
        value: new MemoryStorage(),
        configurable: true,
        enumerable: true,
        writable: true
      });
    } catch (err) {
      console.error('[Storage] Failed to override window.sessionStorage globally:', err);
    }
  }
}

export const safeLocalStorage = createSafeStorage('localStorage');
export const safeSessionStorage = createSafeStorage('sessionStorage');

export const getSafeLocale = (): "ko" | "en" => {
  if (typeof window === "undefined") return "ko";
  try {
    // 1. Try reading cookie
    const cookieMatch = document.cookie
      .split("; ")
      .find((row) => row.startsWith("locale="))
      ?.split("=")[1];
    if (cookieMatch === "en" || cookieMatch === "ko") {
      return cookieMatch as "en" | "ko";
    }

    // 2. Try reading from safeLocalStorage
    const localVal = safeLocalStorage.getItem("locale");
    if (localVal === "en" || localVal === "ko") {
      return localVal as "en" | "ko";
    }

    // 3. Try reading from safeSessionStorage
    const sessionVal = safeSessionStorage.getItem("locale");
    if (sessionVal === "en" || sessionVal === "ko") {
      return sessionVal as "en" | "ko";
    }
  } catch (e) {
    console.warn("[Locale] Failed to read locale from cookies/storage:", e);
  }
  return "ko";
};

export const setSafeLocale = (lang: "ko" | "en"): void => {
  if (typeof window === "undefined") return;
  try {
    document.cookie = `locale=${lang}; path=/; max-age=31536000`;
  } catch (e) {
    console.warn("[Locale] Failed to set locale cookie:", e);
  }
  try {
    safeLocalStorage.setItem("locale", lang);
    safeSessionStorage.setItem("locale", lang);
  } catch (e) {
    console.warn("[Locale] Failed to set locale storage:", e);
  }
};
