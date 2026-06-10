import { createBrowserClient } from '@supabase/ssr'
import { safeLocalStorage } from '../storage'

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storage: safeLocalStorage,
          persistSession: true,
          flowType: 'implicit'
        },
        cookies: {
          getAll() {
            try {
              if (typeof document === 'undefined') return [];
              return document.cookie.split(';').map(c => {
                const [name, ...value] = c.trim().split('=');
                if (!name) return null;
                return { name, value: value.join('=') };
              }).filter(Boolean) as { name: string; value: string }[];
            } catch (e) {
              console.warn('Cookie access is blocked:', e);
              return [];
            }
          },
          setAll(cookiesToSet) {
            try {
              if (typeof document === 'undefined') return;
              cookiesToSet.forEach(({ name, value, options }) => {
                let cookieStr = `${name}=${value}`;
                if (options?.path) cookieStr += `; path=${options.path}`;
                if (options?.maxAge) cookieStr += `; max-age=${options.maxAge}`;
                if (options?.domain) cookieStr += `; domain=${options.domain}`;
                if (options?.secure) cookieStr += `; secure`;
                if (options?.sameSite) cookieStr += `; samesite=${options.sameSite}`;
                document.cookie = cookieStr;
              });
            } catch (e) {
              console.warn('Cookie setting is blocked:', e);
            }
          }
        }
      }
    );
  }

  return browserClient;
}
