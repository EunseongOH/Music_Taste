"use client";

import React, { useState, useEffect } from "react";
import Image, { ImageProps } from "next/image";
import { Music } from "lucide-react";

interface SafeImageProps extends Omit<ImageProps, "src"> {
  src: string | null | undefined;
  /** src 가 실패하면 여기로 한 번 더 시도한다 (Cover Art Archive 에 재킷이 없을 때 Deezer 커버) */
  fallbackSrc?: string | null;
  fallbackType?: "artist" | "track";
  alt: string;
}

// 튀지 않고 서비스 톤과 정갈하게 어우러지는 파스텔/네이비 톤 팔레트
const PALETTES = [
  { bg: "bg-navy/5", text: "text-navy/20", border: "border-navy/10" },
  { bg: "bg-point/5", text: "text-point/20", border: "border-point/10" },
  { bg: "bg-[#EBE2D7]/40 newtone:bg-navy/[0.06]", text: "text-navy/25", border: "border-navy/10" },
  { bg: "bg-charcoal/5", text: "text-charcoal/20", border: "border-navy/10" },
  { bg: "bg-[#E6DEC9]/40 newtone:bg-navy/[0.05]", text: "text-[#5C5441]/25 newtone:text-navy/25", border: "border-navy/10" },
];

export function SafeImage({ src, fallbackSrc, fallbackType = "artist", alt, className = "", ...props }: SafeImageProps) {
  const [step, setStep] = useState(0);   // 0: src, 1: fallbackSrc, 2 이상: 대체 이미지
  const [palette, setPalette] = useState(PALETTES[0]);

  // 앨범이 바뀌면 다시 1순위부터 시도한다
  useEffect(() => { setStep(0); }, [src, fallbackSrc]);

  useEffect(() => {
    if (alt) {
      let hash = 0;
      for (let i = 0; i < alt.length; i++) {
        hash = alt.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % PALETTES.length;
      setPalette(PALETTES[index]);
    }
  }, [alt]);

  const current = step === 0 ? src : step === 1 ? fallbackSrc : null;
  if (!current) {
    const isArtist = fallbackType === "artist";
    return (
      <div 
        className={`w-full h-full flex items-center justify-center border ${palette.border} ${isArtist ? "rounded-full" : "rounded-[1.2rem]"} ${palette.bg} ${className}`}
        title={alt}
      >
        <Music 
          size={isArtist ? "35%" : "25%"} 
          className={`${palette.text} opacity-80 animate-pulse`} 
          style={{ animationDuration: "3.5s" }}
        />
      </div>
    );
  }

  return (
    <Image
      src={current}
      alt={alt}
      className={className}
      onError={() => {
        setStep((n) => (n === 0 && fallbackSrc ? 1 : 2));
      }}
      {...props}
    />
  );
}
