"use client";

/* eslint-disable @next/next/no-img-element -- 슬리브·LP 라벨은 원형 크롭·회전이라 일반 img 로 그린다 */
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getSafeLocale } from "@/utils/storage";
import { normalizeRanking, type RankedTrack } from "@/utils/ranking";
import { MIX_MATCH } from "@/config/modes";
import { Avatar, RankList, primaryButton, secondaryButton } from "@/components/space/SpaceUI";
import { DISC_BACKGROUND } from "@/components/TasteTemplates";

interface TournamentResult {
  id: string;
  title: string;
  ranking: unknown;
  is_public: boolean;
  is_single_artist: boolean;
  user_nickname: string;
  user_profile_image: string;
  created_at: string;
}

const translations = {
  ko: {
    title: "공유된 취향표",
    loading: "취향표를 불러오고 있어요",
    missingTitle: "취향표를 열 수 없어요",
    missingDesc: "삭제됐거나 비공개로 바뀐 취향표예요.",
    single: "최애 곡 소트하기",
    multi: "믹스 매치 월드컵",
    winner: "1위",
    allRanks: "전체 순위",
    count: (n: number) => `${n}곡`,
    ctaCreate: "나도 취향표 만들기",
    ctaTogether: "이 곡들로 같이 소트하기",
    ctaArchive: "우리의 취향 아카이브 보기",
    nicknameDefault: "리스너",
    back: "뒤로 가기",
  },
  en: {
    title: "Shared taste card",
    loading: "Loading the taste card",
    missingTitle: "Can't open this taste card",
    missingDesc: "It was deleted or made private.",
    single: "My favorites",
    multi: "Mix match world cup",
    winner: "No. 1",
    allRanks: "Full ranking",
    count: (n: number) => `${n} songs`,
    ctaCreate: "Make my own taste card",
    ctaTogether: "Sort these songs together",
    ctaArchive: "Browse the taste archive",
    nicknameDefault: "Listener",
    back: "Go back",
  },
};

/** 이메일 형태로 남은 옛 닉네임은 앞부분만 보여준다. */
const formatNickname = (name: string, defaultName: string): string => {
  if (!name) return defaultName;
  if (name.includes("@")) {
    const [localPart] = name.split("@");
    return `${localPart.substring(0, 3)}***`;
  }
  return name;
};

/**
 * 링크로 받은 공개 취향표. 카드 박스 없이 글자 크기와 여백으로 위계를 만든다:
 * 날짜·모드 → 제목 → 만든 사람 → 1위(슬리브에서 반쯤 나온 LP) → 전체 순위.
 */
export default function TasteSharedPage() {
  const params = useParams();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const id = params.id as string;

  const [result, setResult] = useState<TournamentResult | null>(null);
  const [ranking, setRanking] = useState<RankedTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await createClient().from("tournament_results").select("*").eq("id", id).single();
        if (error) throw error;
        if (!alive) return;
        // 공개된 취향표만 보여준다.
        if (data && data.is_public) {
          setResult(data);
          setRanking(normalizeRanking(data.ranking));
        } else {
          setResult(null);
        }
      } catch (err) {
        console.error("Error fetching shared result:", err);
        if (alive) setResult(null);
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const t = translations[locale];

  // 클라이언트 이동에서는 document.referrer 가 비어 있어, 기록이 있으면 뒤로·없으면 아카이브로 보낸다.
  const handleBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/archive");
  };

  const header = (
    <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center gap-3 shrink-0">
      <button
        onClick={handleBack}
        aria-label={t.back}
        className="flex items-center justify-center bg-transparent hover:bg-navy/5 w-8 h-8 rounded-full cursor-pointer"
      >
        <ArrowLeft size={20} className="text-navy" />
      </button>
      <h1 className="type-title-1 text-navy">{t.title}</h1>
    </div>
  );

  if (isLoading) {
    return (
      <main className="flex flex-col min-h-screen w-full bg-[var(--app-bg)]">
        {header}
        <div className="flex-1 flex items-center justify-center py-24">
          <p className="type-sub text-navy/70">{t.loading}</p>
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="flex flex-col min-h-screen w-full bg-[var(--app-bg)]">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
          <p className="type-title-2 text-navy">{t.missingTitle}</p>
          <p className="type-sub text-navy/70 mt-1.5">{t.missingDesc}</p>
          <button onClick={() => router.push("/")} className={`${primaryButton} mt-6`}>
            {t.ctaCreate}
          </button>
        </div>
      </main>
    );
  }

  const d = new Date(result.created_at);
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const nickname = formatNickname(result.user_nickname, t.nicknameDefault);
  const top = ranking[0];

  return (
    <main className="flex flex-col min-h-screen w-full bg-[var(--app-bg)]">
      {header}

      <div className="flex-1 w-full pt-6 pb-40">
        {/* 날짜·모드 → 제목 → 만든 사람 */}
        <p className="type-caption text-navy/70">
          {date} · {result.is_single_artist ? t.single : t.multi}
        </p>
        <h2 className="type-title-1 text-navy mt-1 break-keep">{result.title}</h2>
        <div className="flex items-center gap-2 mt-3">
          <Avatar src={result.user_profile_image} alt={nickname} size={24} />
          <span className="type-sub text-navy/70">{nickname}</span>
        </div>

        {/* 1위: 살짝 기울인 슬리브 뒤로 LP 가 반쯤 나와 천천히 돈다 */}
        {top && (
          <>
            <div className="relative h-[200px] mt-8 mb-5" aria-hidden>
              <motion.div
                className="absolute left-[92px] top-[18px] w-[164px] h-[164px] rounded-full"
                style={{ background: DISC_BACKGROUND }}
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={{ repeat: Infinity, duration: 14, ease: "linear" }}
              >
                <img src={top.albumImage} alt="" className="absolute inset-0 m-auto w-[56px] h-[56px] rounded-full object-cover" />
                <span className="absolute inset-0 m-auto w-[6px] h-[6px] rounded-full bg-cream" />
              </motion.div>
              <img
                src={top.albumImage}
                alt=""
                className="absolute left-0 top-[12px] w-[176px] h-[176px] object-cover -rotate-3 shadow-[0_10px_24px_-10px_rgba(26,42,108,0.45)]"
              />
            </div>
            <p className="type-caption font-semibold text-point-ink">{t.winner}</p>
            <h3 className="type-title-2 text-navy mt-0.5 break-keep">{top.title}</h3>
            <p className="type-sub text-navy/70">{top.artistName}</p>
          </>
        )}

        {/* 전체 순위 */}
        {ranking.length > 0 && (
          <section className="mt-10">
            <h3 className="type-title-2 text-navy">
              {t.allRanks} <span className="text-navy/70 font-semibold">{t.count(ranking.length)}</span>
            </h3>
            <div className="mt-2">
              <RankList tracks={ranking} />
            </div>
          </section>
        )}
      </div>

      {/* 하단 버튼: 두 버튼 모두 48px, 같은 너비 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
        <div className="w-full max-w-[382px] flex flex-col gap-2 pointer-events-auto">
          <button
            /*
             * 이 취향표를 만든 모드 그대로 시작하게 한다.
             * '최애 곡 소트하기' 결과를 보고 들어온 사람에게 '믹스 매치 월드컵'이 먼저 보이면 흐름이 끊긴다.
             */
            onClick={() => router.push(result.is_single_artist || !MIX_MATCH ? "/?mode=single" : "/?mode=multi")}
            className={`${primaryButton} w-full`}
          >
            {t.ctaCreate}
          </button>
          {/*
            * 같은 아티스트를 좋아하는 사람에게 건네진 링크다 — 여기서 "나도 같은 곡으로"가
            * 가장 자연스럽다. 곡 세트는 만들기 화면이 ?from= 으로 읽어 온다.
            */}
          <button
            onClick={() => router.push(`/together/new?from=${result.id}`)}
            className={`${secondaryButton} w-full`}
          >
            {t.ctaTogether}
          </button>
          <button onClick={() => router.push("/archive")} className={`${secondaryButton} w-full`}>
            {t.ctaArchive}
          </button>
        </div>
      </div>
    </main>
  );
}
