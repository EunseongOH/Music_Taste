"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage } from "@/utils/storage";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Initial fetch of session
    const initializeAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (error) {
        console.error("Error fetching session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes (login, logout, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: any, newSession: any) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    if (!isLoading && user) {
      // Self-heal: clear bloated archives array from user_metadata to fix HTTP 431 errors
      if (user.user_metadata?.archives) {
        supabase.auth.updateUser({
          data: {
            archives: null
          }
        }).catch((e: any) => console.error("Failed to self-heal archives metadata:", e));
      }

      const ensureValidNickname = async () => {
        const metaNickname = user.user_metadata?.nickname;
        const email = user.email;
        
        // If nickname is empty, contains '@' (email style), or is equal to email, generate a new safe nickname
        if (!metaNickname || metaNickname.includes("@") || metaNickname.trim() === "" || metaNickname === email) {
          try {
            const { generateUniqueNickname, saveNickname } = await import("@/utils/nickname");
            const uniqueNickname = await generateUniqueNickname();

            // profiles·결과 사본·user_metadata 를 서버에서 함께 갱신하고 세션을 새로 받는다.
            // 자동으로 붙인 이름이라 확인 전(confirm:false) — 첫 공유 때 이름 확인 칸이 뜬다.
            const result = await saveNickname(uniqueNickname, { confirm: false });
            if (result !== "ok") {
              console.error("Failed to save generated nickname:", result);
              return;
            }

            // refreshSession 이 onAuthStateChange 로 user 를 갱신하지만, 이벤트가
            // 늦을 수 있어 한 번 더 받아 둔다.
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
              setUser(data.user);
            }
          } catch (err) {
            console.error("Failed to automatically generate and save unique nickname:", err);
          }
        } else {
          // Sync valid nickname to storage
          sessionStorage.setItem("userNickname", metaNickname);
          localStorage.setItem("userNickname", metaNickname);
        }
      };
      
      ensureValidNickname();
    }
  }, [user, isLoading, supabase]);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
