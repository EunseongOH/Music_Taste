"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";
import {
  fetchChallenge,
  fetchEntries,
  isMine,
  participantKey,
  rememberNickname,
  rememberedNickname,
  type ChallengeEntry,
  type SortChallenge,
} from "@/utils/togetherDb";
import { NICKNAME_ERROR_TEXT, validateNickname } from "@/utils/nickname";
import { Cover, SectionTitle, Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";
import BackButton from "@/components/BackButton";
import { SafeImage } from "@/components/SafeImage";
import * as platform from "@/utils/platform";

/**
 * 같이 소트하기 — 초대 화면(실험). 문서: docs/together-sort.md
 *
 * 한 화면을 둘이 쓴다.
 *  - **링크를 받은 사람**: 곡 세트를 보고 같은 곡으로 소트를 시작한다.
 *  - **링크를 만든 사람(방장)**: 여기서 할 일은 소트가 아니라 **링크를 보내는 것**이다.
 *    만든 직후에도, 나중에 자기 링크를 다시 열 때도 이 화면으로 온다.
 *
 * 방장에게 "OO님이 고른 12곡이에요"라고 자기 이름을 3인칭으로 보여 주던 것을 고쳤다.
 * 월드컵 화면을 그대로 쓰되 `?challenge=1` 로 열어, 진행 중인 이어하기를 건드리지 않는다.
 */
export default function TogetherInvitePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const code = params.code as string;

  const { toast, showToast } = useToast();
  const [challenge, setChallenge] = useState<SortChallenge | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[] | null>(null);
  // 렌더 중에 판정하지 않는다 — isMine 이 localStorage 를 읽어서 서버 렌더와 어긋난다.
  const [iAmCreator, setIAmCreator] = useState(false);
  /** 소트를 시작하기 전에 받는다 — 일치율 화면에서 누가 누구인지 알아야 한다. */
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");

  // 한자리에 모여 할 때 옆 사람이 끝나는 게 바로 보이도록 몇 초마다 다시 읽는다.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const found = await fetchChallenge(code);
      if (!alive) return;
      setChallenge(found);
      if (!found) {
        setEntries([]);
        return;
      }
      setIAmCreator(isMine(found, user?.id));
      // 로그인했으면 프로필 이름, 아니면 지난번에 쓴 이름. 여기서 프로필을 바꾸지는 않는다.
      setNickname((prev) => prev || user?.user_metadata?.nickname || rememberedNickname());
      setEntries(await fetchEntries(found.id));
      timer = setInterval(async () => {
        const list = await fetchEntries(found.id);
        if (alive) setEntries(list);
      }, 8000);
    })();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [code, user?.id]);

  const mine = entries?.find((e) => e.participant_key === participantKey(user?.id));

  /** 링크 보내기. 공유 창이 없으면 복사로 떨어진다(한자리에 모여 할 때는 코드를 부르는 쪽이 빠르다). */
  const sendLink = async () => {
    if (!challenge) return;
    const link = `${window.location.origin}/together/${challenge.code}`;
    try {
      const shared = await platform.share({
        title: "같이 소트하기",
        text: `${challenge.title} — 같은 곡으로 소트해 봐요`,
        url: link,
      });
      if (shared) return;
    } catch {
      /* 공유 창을 못 열면 복사로 간다 */
    }
    const how = await platform.copyText(link);
    showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
  };

  const start = () => {
    if (!challenge) return;
    const name = nickname.trim();
    const bad = validateNickname(name);
    if (bad) {
      setNicknameError(NICKNAME_ERROR_TEXT.ko[bad]);
      return;
    }
    rememberNickname(name);
    const tracks = JSON.stringify(challenge.tracks);
    // 월드컵 화면이 읽는 자리에 이 챌린지의 곡 세트를 심는다. 진행 중이던 기록은 비운다.
    safeSessionStorage.setItem("worldcup_tracks", tracks);
    safeLocalStorage.setItem("worldcup_tracks", tracks);
    safeSessionStorage.removeItem("worldcup_progress");
    safeLocalStorage.removeItem("worldcup_progress");
    safeSessionStorage.setItem("together_code", challenge.code);
    router.push("/worldcup?mode=single&challenge=1");
  };

  if (entries === null) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">
        <p className="type-sub text-navy/70">불러오고 있어요</p>
      </main>
    );
  }

  if (!challenge) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="type-title-2 text-navy">링크를 열 수 없어요</p>
        <p className="type-sub text-navy/70">지워졌거나 잘못된 링크예요.</p>
        <button onClick={() => router.push("/")} className={`${primaryButton} mt-6`}>
          홈으로 가기
        </button>
      </main>
    );
  }

  const creator = challenge.creator_nickname || "리스너";
  /*
   * 초대 화면 배경. 방을 만들 때 적어 둔 아티스트 사진을 쓰고, 없으면 첫 곡의 앨범 재킷.
   * 둘 다 없으면 배경 없이 간다 — 무관한 사진을 끌어오지 않는다.
   */
  const hero = challenge.artist_image || challenge.tracks[0]?.albumImage || "";
  const artist = challenge.artist_name;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col pb-32">
      {/*
        링크를 받은 사람에게만 보이는 인사. 사진이 위에 깔리고 아래로 갈수록 바탕색으로
        덮인다. 초대 문구는 **딤이 가장 짙어진 아래쪽**에 겹쳐 올린다 — 그 구간은 사실상
        크림 바탕이라 네이비 글자가 11.8:1 로 읽힌다(color.md). 사진이 밝든 어둡든 같다.
        방장 화면은 예전 그대로다.
      */}
      {!iAmCreator && hero ? (
        <div className="relative h-[320px]">
          <SafeImage src={hero} alt={artist ?? challenge.title} fill sizes="430px" fallbackType="artist" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--app-bg)]/5 via-[var(--app-bg)]/60 to-[var(--app-bg)]" />
          <div className="absolute left-4 top-4">
            <BackButton className="w-9 h-9" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
          </div>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4">
            <h1 className="type-title-1 text-navy break-keep">
              {artist ? `${artist} 소트에 초대받았어요!` : `'${challenge.title}' 소트에 초대받았어요!`}
            </h1>
            <p className="type-body text-navy/70 mt-1 break-keep">
              {artist
                ? `${artist} 곡 취향이 ${creator}님과 얼마나 비슷한지 확인해 보세요.`
                : `곡 취향이 ${creator}님과 얼마나 비슷한지 확인해 보세요.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <BackButton className="w-9 h-9" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
        </div>
      )}

      <div className="px-6 pt-4">
      {iAmCreator ? (
        <>
          <p className="type-caption text-navy/70">내가 만든 링크</p>
          <h1 className="type-title-1 text-navy mt-1 break-keep">{challenge.title}</h1>
          <p className="type-body text-navy/70 mt-2 break-keep">
            고른 {challenge.tracks.length}곡이에요.{"\n"}링크를 보내면 상대가 같은 곡으로 소트하고, 서로 얼마나 비슷한지 볼 수 있어요.
          </p>
        </>
      ) : !hero ? (
        <>
          <h1 className="type-title-1 text-navy break-keep">
            {artist ? `${artist} 소트에 초대받았어요!` : `'${challenge.title}' 소트에 초대받았어요!`}
          </h1>
          <p className="type-body text-navy/70 mt-2 break-keep">
            {artist
              ? `${artist} 곡 취향이 ${creator}님과 얼마나 비슷한지 확인해 보세요.`
              : `곡 취향이 ${creator}님과 얼마나 비슷한지 확인해 보세요.`}
          </p>
        </>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        <p className="type-caption text-navy/70">
          {iAmCreator && entries.length === 0
            ? "아직 아무도 소트하지 않았어요. 링크를 보내 보세요."
            : `지금까지 ${entries.length}명이 소트했어요${entries.length > 0 ? " · 몇 초마다 새로 확인해요" : ""}`}
        </p>
        {entries.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <li key={e.id} className="h-7 px-3 rounded-full bg-navy/5 type-caption text-navy flex items-center">
                {e.nickname || "익명 리스너"}
              </li>
            ))}
          </ul>
        )}
        <button onClick={sendLink} className="self-start type-caption text-point-ink font-semibold cursor-pointer">
          코드 {challenge.code} · 링크 보내기
        </button>
      </div>

      {!mine && (
        <label className="flex flex-col gap-1 mt-6">
          <span className="type-caption text-navy/70">소트에 쓸 이름</span>
          <input
            id="together-nickname"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setNicknameError("");
            }}
            maxLength={12}
            placeholder="리스너"
            className="h-12 px-4 rounded-2xl bg-white border border-navy/15 type-body text-navy"
          />
          <span className={`type-caption ${nicknameError ? "text-danger" : "text-navy/70"}`}>
            {nicknameError || "일치율 화면에서 서로를 이 이름으로 봐요."}
          </span>
        </label>
      )}

      <SectionTitle
        title={artist ? `소트 대상 ${artist} 곡` : "소트 대상 곡"}
        count={challenge.tracks.length}
        className="mt-8 mb-1"
      />
      <ul className="flex flex-col divide-y divide-navy/10">
        {challenge.tracks.map((track) => (
          <li key={track.id} className="flex items-center gap-3 py-2.5">
            <Cover src={track.albumImage} alt={track.title} size={40} />
            <span className="flex-1 min-w-0">
              <span className="block type-body-strong text-navy truncate">{track.title}</span>
              <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
            </span>
          </li>
        ))}
      </ul>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
        <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
          {iAmCreator ? (
            <>
              <button onClick={sendLink} className={`${primaryButton} w-full`}>
                링크 보내기
              </button>
              <button onClick={start} className={`${secondaryButton} w-full`}>
                {mine ? "다시 소트하기" : "나도 소트하기"}
              </button>
            </>
          ) : (
            <button onClick={start} className={`${primaryButton} w-full`}>
              {mine ? "다시 소트하기" : "같은 곡으로 소트하기"}
            </button>
          )}
          {mine && (
            <button onClick={() => router.push(`/together/${challenge.code}/result`)} className={`${secondaryButton} w-full`}>
              일치율 보기
            </button>
          )}
        </div>
      </div>
      <Toast toast={toast} />
    </main>
  );
}
