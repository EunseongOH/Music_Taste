"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, Music, Award, ArrowLeft, Disc, User, ChevronRight } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { getSafeLocale } from "@/utils/storage";

interface Track {
  id?: string;
  i?: string;
  title: string;
  t?: string;
  artistName: string;
  a?: string;
  albumImage: string;
  m?: string;
}

interface TournamentResult {
  id: string;
  user_id: string;
  title: string;
  winner_track_id: string;
  winner_track_title: string;
  winner_track_artist: string;
  winner_track_image: string;
  total_candidates: number;
  ranking: Track[];
  is_public: boolean;
  is_single_artist: boolean;
  artist_id?: string;
  artist_name?: string;
  user_nickname: string;
  user_profile_image: string;
  created_at: string;
}

const translations = {
  ko: {
    title: "공개 취향 리스트",
    byLabel: "닉네임",
    createdLabel: "작성일",
    firstChoice: "1위 최애곡",
    otherRanks: "전체 취향 순위",
    ctaCreate: "나도 나만의 취향표 소트하기 🎵",
    ctaArchive: "공개 아카이브 목록 가기",
    loading: "공개된 취향표를 불러오는 중...",
    errorNotFound: "취향표를 찾을 수 없거나 비공개 상태입니다.",
    nicknameDefault: "음악팬",
    singleDiscography: "최애 곡 줄 세우기",
    backBtn: "뒤로",
  },
  en: {
    title: "Shared Taste List",
    byLabel: "Creator",
    createdLabel: "Date",
    firstChoice: "1st Choice Track",
    otherRanks: "Complete Rankings",
    ctaCreate: "Sort My Own Music Taste 🎵",
    ctaArchive: "Back to Public Archive",
    loading: "Loading shared music taste card...",
    errorNotFound: "Taste card not found or it is set to private.",
    nicknameDefault: "Music Fan",
    singleDiscography: "Favorite Songs Lineup",
    backBtn: "Back",
  }
};

const formatNickname = (name: string, defaultName: string): string => {
  if (!name) return defaultName;
  if (name.includes("@")) {
    const [localPart] = name.split("@");
    if (localPart.length <= 3) {
      return `${localPart}***`;
    }
    return `${localPart.substring(0, 3)}***`;
  }
  return name;
};

export default function TasteSharedPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const id = params.id as string;

  const [result, setResult] = useState<TournamentResult | null>(null);
  const [normalizedRanking, setNormalizedRanking] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchSharedResult = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("tournament_results")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        
        // Enforce privacy check (only show if public)
        if (data && data.is_public) {
          setResult(data);
          
          // Normalize rankings (handles both full titles and legacy compact schema objects)
          const ranking = data.ranking || [];
          const normalized = ranking.map((t: any) => ({
            id: t.id || t.i,
            title: t.title || t.t,
            artistName: t.artistName || t.a,
            albumImage: t.albumImage || (t.m ? (t.m.startsWith("http") ? t.m : `https://i.scdn.co/image/${t.m}`) : "")
          }));
          setNormalizedRanking(normalized);
        } else {
          setResult(null);
        }
      } catch (err) {
        console.error("Error fetching shared result:", err);
        setResult(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSharedResult();
  }, [id, supabase]);

  const t = translations[locale];

  const handleBack = () => {
    // Check if browser history has archive or go to home
    if (document.referrer && document.referrer.includes("/archive")) {
      router.back();
    } else {
      router.push("/archive");
    }
  };

  if (isLoading) {
    return (
      <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)] justify-center items-center gap-3 py-24">
        <Disc className="animate-spin text-point/85" size={36} />
        <p className="font-sans text-xs text-navy/60 font-medium">{t.loading}</p>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
        <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center gap-3 shadow-sm mb-12">
          <button onClick={handleBack} className="flex items-center justify-center border-none bg-transparent hover:bg-navy/5 w-8 h-8 rounded-full">
            <ArrowLeft size={20} className="text-navy" />
          </button>
          <h1 className="font-serif text-2xl text-navy tracking-tight">{t.title}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12 px-6">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-navy/30 flex items-center justify-center bg-white/40">
            <Music className="text-navy/30 animate-pulse" size={28} />
          </div>
          <p className="font-sans text-sm text-navy/70 leading-relaxed font-semibold max-w-[280px] break-keep">
            {t.errorNotFound}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 px-6 py-3 bg-navy text-cream rounded-full hover:bg-navy/95 transition-all font-sans font-bold text-xs shadow-md active:scale-[0.98]"
          >
            {t.ctaCreate}
          </button>
        </div>
      </main>
    );
  }

  const formattedDate = new Date(result.created_at).toLocaleDateString(
    locale === "en" ? "en-US" : "ko-KR",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      {/* Top Header */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="flex items-center justify-center border-none bg-transparent hover:bg-navy/5 w-8 h-8 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-navy" />
          </button>
          <h1 className="font-serif text-2xl text-navy tracking-tight">{t.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pb-36 px-6 pt-6">
        {/* Shared List Container Card */}
        <div className="w-full bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-6 shadow-sm flex flex-col gap-6 relative">
          
          {/* Creator Profile Metadata */}
          <div className="flex justify-between items-start w-full border-b border-navy/10 pb-4">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-sans text-[10px] text-charcoal/50 flex items-center gap-1 shrink-0">
                  <Calendar size={11} />
                  {formattedDate}
                </span>
                {result.is_single_artist && (
                  <span className="px-1.5 py-0.5 rounded-md bg-point/10 text-point font-sans font-bold text-[8px] tracking-tight shrink-0">
                    {t.singleDiscography}
                  </span>
                )}
              </div>
              <h2 className="font-serif text-xl text-navy font-black mt-1 leading-tight tracking-tight break-keep">
                {result.title}
              </h2>
              <span className="font-sans text-[11px] text-charcoal/60 font-semibold flex items-center gap-1 mt-0.5">
                <User size={11} className="text-navy/50" />
                By {formatNickname(result.user_nickname, t.nicknameDefault)}
              </span>
            </div>

            {/* Creator avatar */}
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-navy/20 shadow-sm shrink-0 bg-white">
              <Image
                src={result.user_profile_image || "/default-profile.png"}
                alt={formatNickname(result.user_nickname, t.nicknameDefault)}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            </div>
          </div>

          {/* Rank 1 Vintage LP Spotlight */}
          <div className="flex flex-col items-center bg-white/70 rounded-3xl border border-navy/5 p-5 relative overflow-hidden shadow-inner select-none">
            {/* Tone Arm overlay decoration */}
            <div 
              className="absolute top-4 right-[22%] w-10 h-16 border-r border-t border-navy/10 rounded-tr-2xl z-30 pointer-events-none opacity-60" 
              style={{ transform: "rotate(12deg)", transformOrigin: "top right" }}
            >
              <div className="absolute bottom-0 right-0 w-2.5 h-4 bg-navy/30 border border-navy/40 rounded-sm" />
            </div>

            {/* Large Spinning LP disc */}
            <motion.div 
              className="relative w-40 h-40 rounded-full bg-[#1A1A1A] shadow-2xl flex items-center justify-center border-4 border-navy/5 overflow-hidden"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
            >
              {/* Grooves */}
              <div className="absolute inset-0 rounded-full border border-white/5 m-3" />
              <div className="absolute inset-0 rounded-full border border-white/5 m-6" />
              <div className="absolute inset-0 rounded-full border border-white/5 m-9" />
              <div className="absolute inset-0 rounded-full border border-white/5 m-12" />
              
              {/* Center Label (Album Art) */}
              <div 
                className="relative w-14 h-14 rounded-full overflow-hidden border border-navy/15"
                style={{
                  maskImage: "radial-gradient(circle, transparent 15%, black 15.5%)",
                  WebkitMaskImage: "radial-gradient(circle, transparent 15%, black 15.5%)"
                }}
              >
                {result.winner_track_image ? (
                  <Image 
                    src={result.winner_track_image} 
                    alt={result.winner_track_title} 
                    fill 
                    className="object-cover" 
                    sizes="56px"
                  />
                ) : (
                  <div className="w-full h-full bg-navy/5 flex items-center justify-center text-navy/30">
                    <Music size={14} />
                  </div>
                )}
              </div>
              
              {/* Center Spindle hole */}
              <div className="absolute inset-0 m-auto w-2.5 h-2.5 bg-[#FAF7F2] border border-navy/20 rounded-full z-20 shadow-inner" />
            </motion.div>

            {/* 1st Place badge and Info */}
            <div className="text-center mt-5 w-full px-2">
              <div className="inline-flex items-center gap-1 px-3 py-0.5 bg-[#E67E22] text-[#FAF7F2] font-serif text-[10px] font-black uppercase tracking-wider rounded-full shadow-sm mb-2.5">
                <Award size={11} /> 1st Choice
              </div>
              <h3 className="text-base font-black text-navy font-serif tracking-tight leading-tight line-clamp-1">
                {result.winner_track_title}
              </h3>
              <p className="text-xs text-navy/60 font-semibold mt-1">
                {result.winner_track_artist}
              </p>
            </div>
          </div>

          {/* Ranks 2-30 list */}
          {normalizedRanking.length > 1 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-serif text-sm font-bold text-navy border-b border-navy/10 pb-2 mb-1 flex items-center gap-1.5">
                <Music size={14} className="text-point" />
                {t.otherRanks}
              </h3>
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
                {normalizedRanking.slice(1).map((track, idx) => {
                  const rank = 2 + idx;
                  const isTop3 = rank <= 3;
                  return (
                    <div 
                      key={`${track.id || rank}-${rank}`}
                      className="flex items-center justify-between py-2 border-b border-navy/5 last:border-b-0 px-2 rounded-xl transition-colors hover:bg-navy/5 bg-white/40"
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        {/* Rank Badge */}
                        <span className={`font-serif text-xs font-black w-5 text-center select-none ${
                          isTop3 ? "text-[#E67E22] text-sm" : "text-navy/40"
                        }`}>
                          {rank}
                        </span>

                        {/* Round vinyl mini-cover jacket */}
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-navy/10 shadow-sm shrink-0 bg-navy/5">
                          {track.albumImage ? (
                            <Image 
                              src={track.albumImage} 
                              alt={track.title} 
                              fill 
                              className="object-cover"
                              sizes="32px"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-navy/30">
                              <Music size={12} />
                            </div>
                          )}
                          <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-[#FAF8F5] rounded-full border border-navy/10 z-10" />
                        </div>

                        {/* Track text details */}
                        <div className="flex flex-col min-w-0 text-left">
                          <span className="text-[11.5px] font-bold text-navy line-clamp-1 leading-tight">
                            {track.title}
                          </span>
                          <span className="text-[9.5px] text-navy/50 font-medium line-clamp-1 mt-0.5">
                            {track.artistName}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating CTA footer */}
      <div className="fixed bottom-0 left-0 right-0 p-6 flex flex-col items-center gap-3 z-50 bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)]/90 to-transparent pointer-events-none select-none">
        <button 
          onClick={() => router.push("/")}
          className="w-full max-w-[380px] pointer-events-auto py-4 bg-point hover:bg-point/95 text-white rounded-full transition-all active:scale-[0.98] shadow-lg font-sans font-bold text-sm flex items-center justify-center gap-2"
        >
          {t.ctaCreate}
          <ChevronRight size={16} />
        </button>
        <button 
          onClick={() => router.push("/archive")}
          className="w-full max-w-[380px] pointer-events-auto py-3.5 bg-white border-2 border-navy text-navy hover:bg-navy/5 rounded-full transition-all active:scale-[0.98] shadow-md font-sans font-bold text-xs"
        >
          {t.ctaArchive}
        </button>
      </div>
    </main>
  );
}
