"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { safeLocalStorage as localStorage, safeSessionStorage as sessionStorage } from "@/utils/storage";
import { flushPendingListenLater } from "@/utils/listenLater";

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
    /*
     * 적어 둔 "들어볼 곡" 은 지우지 않는다. 로그아웃은 "그 곡을 모른다는 말을
     * 취소한다" 는 뜻이 아니다. 다음에 로그인하면 그대로 옮겨진다.
     */
    await supabase.auth.signOut();
  };

  /*
   * 확정된 "모르는 곡" 을 계정으로 옮긴다.
   *
   * 로그인 방법마다(이메일·가입·구글·카카오·팝업 콜백·앱 시작 시 세션 복원) 각자
   * 옮기는 코드를 두지 않는다 — 어떤 길로 오든 **실제 세션이 서면 여기를 지난다.**
   * 그게 이 자리에 두는 이유다.
   *
   * 닉네임 자동 생성과 한 effect 에 섞지 않는다. 책임이 다르고, 저쪽이 실패해도
   * 이쪽은 돌아야 한다. 같은 로그인에서 `user` 가 여러 번 갱신되므로 이 effect 도
   * 여러 번 도는데, 옮기는 함수가 겹쳐 돌지 않게 스스로 묶는다.
   *
   * **누구로 옮길지는 여기서 정한다.** 옮기는 함수가 세션을 다시 추측하지 않도록, 이
   * 경계에서 확인한 `user.id` 를 넘긴다. 그 계정의 줄과 주인 없는(게스트) 줄만 간다.
   */
  useEffect(() => {
    if (isLoading || !user) return;
    void flushPendingListenLater(user.id).then((r) => {
      // 실패해도 적어 둔 것은 그대로다. 다음 기회에 다시 옮긴다.
      if (r.status === "failed") console.error("[listen_later] 옮기지 못했어요:", r.error);
    });
  }, [user, isLoading]);

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
