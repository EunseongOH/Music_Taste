"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { useAuth } from "@/components/AuthProvider";
import { submitUnreleasedTrack } from "@/utils/unreleasedDb";
import { coverPlaceholder } from "@/utils/coverPlaceholder";

/*
 * 미발매곡 등록 팝업.
 *
 * 전곡 모드(/tracks)와 같이 소트하기 만들기(/together/new)가 같이 쓴다. 아직
 * 발매되지 않은 곡 — 공연에서만 부른 곡, 앨범에 안 실린 곡 — 은 Spotify 에
 * 없어서 우리 쪽에 직접 담아야 하는데, 그 길이 전곡 모드에만 있었다.
 *
 * 승인 전에도 바로 쓸 수 있다. 심사를 기다리게 하면 지금 소트하려던 사람이
 * 그냥 돌아간다. 승인은 나중에 다른 사람에게도 보일지를 정하는 일이다.
 */

const copy = {
  ko: {
    title: "미발매곡 추가",
    trackTitle: "곡 제목",
    trackTitlePlaceholder: "예: 미공개 자작곡 1번",
    videoUrl: "공연 영상 링크",
    videoUrlPlaceholder: "유튜브 링크 등",
    date: "공연 날짜",
    info1: "공연 영상을 등록하면 유튜브 썸네일이 앨범 커버로 자동 적용돼요.",
    info2: "공식 승인 전이라도 ",
    info3: "바로 넣을 수 있어요.",
    submit: "추가하기",
    savedDb: "미발매곡 등록을 요청했어요. 승인 대기 중이라도 바로 쓸 수 있어요!",
    savedTemp: "아쉽게도 저장 과정에 문제가 생겼지만, 지금 바로 사용할 수 있어요!",
    guest: "로그인하지 않은 상태예요. 임시로 추가되어 바로 쓸 수 있지만, 브라우저를 닫으면 사라질 수 있어요.",
  },
  en: {
    title: "Add Unreleased Track",
    trackTitle: "Track Title",
    trackTitlePlaceholder: "e.g., Unreleased Song #1",
    videoUrl: "Performance Video Link",
    videoUrlPlaceholder: "YouTube link, etc.",
    date: "Performance Date",
    info1: "Registering a video automatically uses the YouTube thumbnail as custom album art.",
    info2: "Even before official approval, you can ",
    info3: "use it right away.",
    submit: "Add",
    savedDb: "Track submission requested. You can use it right away!",
    savedTemp: "Failed to save to database, but it has been added temporarily for now!",
    guest: "Using guest mode. The track is added temporarily but may be lost when the browser closes.",
  },
};

export function getYouTubeVideoId(url: string) {
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
}

/** 등록된 곡. 화면마다 필요한 모양이 달라 여기서는 재료만 준다. */
export interface AddedUnreleasedTrack {
  id: string;
  title: string;
  artistName: string;
  /** 영상이 있으면 그 썸네일, 없으면 자리 채움 그림 */
  cover: string;
  /** 공연 날짜(YYYY-MM-DD). 비어 있을 수 있다 */
  date: string;
  /** 공연 연도. 날짜가 없으면 올해 */
  year: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  artistId: string | null;
  artistName: string;
  locale: "ko" | "en";
  /** 등록 직후. notice 는 그대로 띄울 안내 문장이다(로그인 상태에 따라 다르다) */
  onAdded: (track: AddedUnreleasedTrack, notice: string) => void;
}

export default function UnreleasedDialog({ open, onClose, artistId, artistName, locale, onAdded }: Props) {
  const { user } = useAuth();
  const t = copy[locale] ?? copy.ko;
  const [form, setForm] = useState({ title: "", videoUrl: "", date: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !artistId) return;

    const id = `t_unreleased_${Date.now()}`;
    const youtubeId = getYouTubeVideoId(form.videoUrl);
    const cover = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : coverPlaceholder(id);

    // 로그인해야 DB 에 남는다. 안 해도 이 자리에서는 쓸 수 있게 둔다.
    let saved = false;
    if (user) {
      try {
        await submitUnreleasedTrack({
          id,
          title: form.title,
          artistId,
          artistName,
          videoUrl: form.videoUrl || undefined,
          releaseDate: form.date || undefined,
        });
        saved = true;
      } catch (err) {
        console.error("미발매곡 저장 실패:", err);
      }
    }

    onClose();
    setForm({ title: "", videoUrl: "", date: "" });
    onAdded(
      {
        id,
        title: form.title,
        artistName,
        cover,
        date: form.date,
        year: form.date ? form.date.substring(0, 4) : new Date().getFullYear().toString(),
      },
      user ? (saved ? t.savedDb : t.savedTemp) : t.guest
    );
  };

  const field =
    "w-full px-4 py-3 rounded-xl bg-white/60 border border-navy/10 focus:border-point focus:outline-none font-sans text-sm text-navy placeholder:text-navy/30";
  const label = "font-sans text-xs font-bold text-navy/70 ml-1";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            className="bg-cream w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 overflow-hidden border border-navy/10 flex flex-col"
          >
            <div className="p-6 pb-4 border-b border-navy/5 flex items-center justify-between">
              <h3 className="text-xl text-navy">{t.title}</h3>
              <button
                onClick={onClose}
                aria-label={t.title}
                className="p-2 -mr-2 text-navy/50 hover:text-navy hover:bg-navy/5 rounded-full transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
              <div className="flex flex-col gap-1.5">
                <label className={label}>
                  {t.trackTitle} <span className="text-point">*</span>
                </label>
                <input
                  required
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  type="text"
                  placeholder={t.trackTitlePlaceholder}
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label}>
                  {t.videoUrl} <span className="text-point">*</span>
                </label>
                <input
                  required
                  value={form.videoUrl}
                  onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                  type="url"
                  placeholder={t.videoUrlPlaceholder}
                  className={field}
                />
                {form.videoUrl && getYouTubeVideoId(form.videoUrl) && (
                  <div className="mt-2 w-full rounded-xl overflow-hidden border border-navy/10 relative aspect-video bg-navy/5 flex items-center justify-center">
                    <SafeImage
                      src={`https://img.youtube.com/vi/${getYouTubeVideoId(form.videoUrl)}/hqdefault.jpg`}
                      alt=""
                      fill
                      fallbackType="track"
                      className="object-cover"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label}>{t.date}</label>
                <input
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  type="date"
                  className={field}
                />
              </div>
              <div className="flex items-start gap-2 bg-navy/5 p-3 rounded-xl mt-2">
                <Info size={16} className="text-navy/60 shrink-0 mt-0.5" />
                <p className="font-sans text-[11px] leading-relaxed text-charcoal/70">
                  {t.info1}
                  <br />
                  {t.info2}
                  <span className="font-bold text-point-ink">{t.info3}</span>
                </p>
              </div>
              <button
                type="submit"
                className="mt-2 w-full py-3.5 bg-brand text-cream font-sans font-medium rounded-xl shadow-md hover:bg-brand/90 active:scale-[0.98] transition-all cursor-pointer"
              >
                {t.submit}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
