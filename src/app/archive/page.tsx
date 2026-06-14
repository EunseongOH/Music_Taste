"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, Music, Award, ArrowLeft, Disc, ChevronRight } from "lucide-react";
import Image from "next/image";
import BackButton from "@/components/BackButton";
import ProfileHeader from "@/components/ProfileHeader";
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
    title: "취향 아카이브",
    subtitle: "리스너들의 음악 취향표",
    desc: "공개된 아카이브 목록을 구경하고, 나와 취향이 꼭 닮은 리스너들의 취향표를 탐색해 보세요.",
    artistLabel: "아티스트",
    winnerLabel: "1위 곡 정보",
    createdLabel: "생성일",
    emptyTitle: "아직 공개된 취향표가 없어요",
    emptyDesc: "첫 번째로 취향표를 완성하여 웹에 공개해 보세요!",
    viewDetail: "전체 취향 순위 보기",
    allArtists: "모든 아티스트",
    nicknameDefault: "음악팬",
    singleDiscography: "최애 곡 줄 세우기",
    loading: "취향표 불러오는 중...",
  },
  en: {
    title: "Public Archive",
    subtitle: "Music Taste Cards",
    desc: "Explore public taste cards and discover what other music fans with similar tastes love listening to.",
    artistLabel: "Artist",
    winnerLabel: "1st Choice Track",
    createdLabel: "Created",
    emptyTitle: "No public taste cards yet",
    emptyDesc: "Be the first to complete a world cup and publish your taste card!",
    viewDetail: "View Complete Tastes",
    allArtists: "All Artists",
    nicknameDefault: "Music Fan",
    singleDiscography: "Favorite Songs Lineup",
    loading: "Loading taste cards...",
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

export default function ArchivePage() {
  const router = useRouter();
  const supabase = createClient();
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    setLocale(getSafeLocale());
  }, []);

  useEffect(() => {
    const fetchPublicData = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("tournament_results")
          .select("*")
          .eq("is_public", true)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setResults(data || []);
      } catch (err) {
        console.error("Error fetching public archives:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublicData();
  }, [supabase]);

  const t = translations[locale];

  return (
    <main className="flex flex-col min-h-screen relative w-full overflow-hidden bg-[var(--app-bg)]">
      {/* Header Panel */}
      <div className="relative z-40 bg-cream/95 backdrop-blur-md pt-6 pb-4 px-6 mx-[-1.5rem] w-[calc(100%+3rem)] border-b border-navy/10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton
            className="border-none bg-transparent hover:bg-navy/5 w-8 h-8 shadow-none m-0 p-0"
            onClick={() => router.push("/")}
          />
          <h1 className="font-serif text-2xl text-navy tracking-tight">{t.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ProfileHeader locale={locale} />
        </div>
      </div>

      <div className="flex-[1] overflow-y-auto w-full pb-32">
        {/* Banner Section */}
        <div className="p-6 text-center bg-gradient-to-b from-[#F5F2ED] via-[#F5F2ED]/70 to-transparent">
          <span className="inline-block px-3 py-1 bg-navy/5 text-navy font-bold font-sans text-[10px] uppercase tracking-wider rounded-full mb-2">
            Public Music Archive Space
          </span>
          <h2 className="font-serif text-3xl text-navy tracking-tight leading-tight">{t.subtitle}</h2>
          <p className="font-sans text-xs text-charcoal/70 mt-1.5 px-4 leading-relaxed break-keep">
            {t.desc}
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
            <Disc className="animate-spin text-point/85" size={32} />
            <p className="font-sans text-xs text-navy/60 font-medium">{t.loading}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && results.length === 0 && (
          <div className="mx-6 py-16 text-center border-2 border-dashed border-navy/20 rounded-[2rem] px-6 bg-white/30">
            <Music size={48} className="text-navy/20 mx-auto mb-4" />
            <h3 className="font-serif text-lg text-navy font-bold mb-1">{t.emptyTitle}</h3>
            <p className="font-sans text-xs text-navy/50 leading-relaxed px-4 break-keep">
              {t.emptyDesc}
            </p>
          </div>
        )}

        {/* Archive Cards Grid */}
        {!isLoading && results.length > 0 && (
          <div className="px-6 flex flex-col gap-6">
            {results.map((result) => {
              const formattedDate = new Date(result.created_at).toLocaleDateString(
                locale === "en" ? "en-US" : "ko-KR",
                {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit"
                }
              );

              return (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="w-full bg-[#FAF8F5] border-2 border-navy/15 rounded-3xl p-6 shadow-sm hover:border-point hover:shadow-md transition-all flex flex-col gap-4 relative overflow-hidden group"
                >
                  {/* Card Header metadata */}
                  <div className="flex justify-between items-start w-full">
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
                      <h3 className="font-serif text-lg text-navy font-bold mt-0.5 leading-tight truncate pr-2">
                        {result.title}
                      </h3>
                      <span className="font-sans text-[10.5px] text-charcoal/60 font-semibold">
                        By {formatNickname(result.user_nickname, t.nicknameDefault)}
                      </span>
                    </div>

                    {/* User profile image */}
                    <div className="relative w-9 h-9 rounded-full overflow-hidden border border-navy/20 shadow-sm shrink-0 bg-white">
                      <Image
                        src={result.user_profile_image || "/default-profile.png"}
                        alt={formatNickname(result.user_nickname, t.nicknameDefault)}
                        width={36}
                        height={36}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  </div>

                  {/* Prominent 1st Choice Section */}
                  <div className="flex flex-col items-center bg-white/70 rounded-3xl border border-navy/5 p-4 relative overflow-hidden mt-1 shadow-inner">
                    {/* Big album art with LP sleeve + vinyl disk layout */}
                    <div className="relative w-36 h-28 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 select-none">
                      {/* LP Record (peeking out, positioned underneath on the right) */}
                      <div className="absolute right-2 w-24 h-24 rounded-full border-2 border-navy bg-[#1a1a1a] flex items-center justify-center shadow-md z-10">
                        {/* Grooves */}
                        <div className="absolute w-[85%] h-[85%] rounded-full border border-white/10 pointer-events-none" />
                        <div className="absolute w-[70%] h-[70%] rounded-full border border-white/10 pointer-events-none" />
                        <div className="absolute w-[55%] h-[55%] rounded-full border border-white/10 pointer-events-none" />
                        {/* LP Label */}
                        <div className="w-[45%] h-[45%] rounded-full border border-navy/20 relative overflow-hidden bg-point z-20 flex items-center justify-center shadow-inner">
                          {result.winner_track_image ? (
                            <Image
                              src={result.winner_track_image}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover opacity-80"
                            />
                          ) : (
                            <div className="w-full h-full bg-navy/5 flex items-center justify-center text-navy/30">
                              <Music size={12} />
                            </div>
                          )}
                          <div className="w-[20%] h-[20%] rounded-full bg-cream border border-navy shadow-sm z-30 absolute" />
                        </div>
                      </div>

                      {/* Album Cover Sleeve (positioned on top on the left) */}
                      <div className="absolute left-2 w-24 h-24 rounded-xl border border-navy/20 bg-cream shadow-md overflow-hidden z-20">
                        {result.winner_track_image ? (
                          <Image
                            src={result.winner_track_image}
                            alt={result.winner_track_title}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-navy/30">
                            <Music size={24} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors" />
                      </div>
                    </div>

                    {/* 1st Place Badge overlay */}
                    <div className="mt-3.5 bg-point text-white text-[9.5px] font-sans font-bold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1 uppercase tracking-wider">
                      <Award size={11} /> 1st Choice
                    </div>

                    {/* Track info texts */}
                    <div className="text-center mt-2.5 w-full px-2">
                      <h4 className="font-sans font-bold text-sm text-navy truncate leading-tight">
                        {result.winner_track_title}
                      </h4>
                      <p className="font-sans text-[11px] text-navy/60 truncate mt-0.5 font-medium">
                        {result.winner_track_artist}
                      </p>
                    </div>
                  </div>

                  {/* Complete List Action Button */}
                  <button
                    onClick={() => router.push(`/taste/${result.id}`)}
                    className="w-full py-3.5 mt-1 bg-navy text-cream rounded-2xl hover:bg-navy/95 transition-all font-sans font-bold text-xs shadow-md active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 group-hover:border-point"
                  >
                    <span>{t.viewDetail}</span>
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
