"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";
import {
  fetchChallenge,
  fetchEntries,
  fetchResultDate,
  isMine,
  participantKey,
  type ChallengeEntry,
  type SortChallenge,
} from "@/utils/togetherDb";
import { personName } from "@/utils/togetherName";
import { DockSpacer, useDockClearance } from "@/components/space/BottomDock";
import NicknameDialog, { needsNickname } from "@/components/together/NicknameDialog";
import { inviteDesc, inviteTitle } from "@/utils/inviteCopy";
import { ConfirmSheet, Cover, RankList, SectionTitle, Toast, primaryButton, secondaryButton, textLink, useToast } from "@/components/space/SpaceUI";
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
  /** 소트를 시작하기 전에 이름을 묻는다 — 일치율 화면에서 누가 누구인지 알아야 한다. */
  const [askName, setAskName] = useState(false);
  /** 이미 소트한 사람이 [다시 소트하기] 를 눌렀을 때의 확인창 */
  const [askResort, setAskResort] = useState(false);
  /** 소트 대상 곡 목록을 다 펼쳤는가. 처음에는 3곡만 보여 준다. */
  const [showAllTracks, setShowAllTracks] = useState(false);
  /** 내 순위를 다 펼쳤는가. */
  const [showAllMine, setShowAllMine] = useState(false);
  /** 불러온 취향표를 원래 소트한 날("6월 3일"). 그 취향표를 지웠으면 null. */
  const [importedOn, setImportedOn] = useState<string | null>(null);

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
      const first = await fetchEntries(found.id);
      if (!alive) return;
      setEntries(first);
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

  /* 고정 바의 실제 높이만큼 본문 끝을 비운다 — 버튼이 1~3개로 바뀐다. */
  const dockRef = useDockClearance();

  const myKey = participantKey(user?.id);
  const mine = entries?.find((e) => e.participant_key === myKey);

  /* 이름이 아예 없으면 "익명 리스너님이" 라고 부르지 않는다 — 이름 없이 말한다. */
  const importedName = mine?.nickname?.trim() || challenge?.creator_nickname?.trim() || "";

  // 불러온 방에서만, 방장에게만 필요한 날짜다. 그 밖에는 한 번도 읽지 않는다.
  const sourceId = mine?.imported ? challenge?.source_result_id : null;
  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    fetchResultDate(sourceId).then((d) => {
      if (alive) setImportedOn(d);
    });
    return () => {
      alive = false;
    };
  }, [sourceId]);

  /** 링크 보내기. 공유 창이 없으면 복사로 떨어진다(한자리에 모여 할 때는 코드를 부르는 쪽이 빠르다). */
  const sendLink = async () => {
    if (!challenge) return;
    const link = `${window.location.origin}/together/${challenge.code}`;
    try {
      const shared = await platform.share({
        // 미리보기·초대 화면과 같은 말이어야 한다. 받는 사람이 보는 것은 셋 다 이 링크다.
        title: inviteTitle(challenge.artist_name, challenge.title),
        text: inviteDesc(challenge.artist_name, challenge.title, challenge.creator_nickname, challenge.tracks.length),
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
    /*
     * 이미 기록이 있는 사람이 다시 하면 **이전 순위가 지워진다**(같은 참여키로 덮어쓴다).
     * 되돌릴 수 없으니 한 번 묻는다. 방장이든 참여자든 결과는 같으므로 둘 다 묻는다 —
     * 같은 일을 하는 버튼이 누구에게는 경고 없이 동작하면 그게 더 이상하다.
     */
    if (mine) {
      setAskResort(true);
      return;
    }
    // 처음 참여하는 사람에게만 이름을 묻는다. 다시 소트하는 사람은 이미 이름이 있다.
    if (needsNickname(user)) {
      setAskName(true);
      return;
    }
    go();
  };

  const go = () => {
    if (!challenge) return;
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

  /*
   * 초대 화면 배경. 방을 만들 때 적어 둔 아티스트 사진을 쓰고, 없으면 첫 곡의 앨범 재킷.
   * 둘 다 없으면 배경 없이 간다 — 무관한 사진을 끌어오지 않는다.
   */
  /*
   * 내가 이 방에서 매긴 순위. 곡 id 배열이라 이 방의 곡 목록에서 찾아 온다.
   *
   * 이걸 보여 주는 이유는 하나다 — **다시 소트할지 정하려면 지금 순위를 봐야 한다.**
   * 불러온 순위든 직접 한 순위든 마찬가지라 둘을 가르지 않는다.
   */
  const myRanked = mine
    ? mine.ranking.map((id) => challenge.tracks.find((t) => t.id === id)).filter((t) => !!t)
    : [];

  const hero = challenge.artist_image || challenge.tracks[0]?.albumImage || "";
  const artist = challenge.artist_name;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col">
      {/*
        링크를 받은 사람에게만 보이는 인사. 사진이 위에 깔리고 아래로 갈수록 바탕색으로
        덮인다. 초대 문구는 **딤이 가장 짙어진 아래쪽**에 겹쳐 올린다 — 그 구간은 사실상
        크림 바탕이라 네이비 글자가 11.8:1 로 읽힌다(color.md). 사진이 밝든 어둡든 같다.
        방장 화면은 예전 그대로다.
      */}
      {!iAmCreator && hero ? (
        /*
         * 사진은 화면 폭을 꽉 채운다. 이 화면을 감싸는 레이아웃이 좌우 여백을 주므로
         * 그만큼 밖으로 빼낸다(-mx-6 + w-[calc(100%+3rem)]).
         *
         * 딤은 위에서부터 시작한다 — 초대 문구 둘째 줄(회색)이 사진이 비치는 자리에
         * 걸리면 첫 줄보다 읽기 어렵다. 글자가 놓이는 아래 절반은 바탕색에 거의 닿게 둬서
         * 밝은 사진에서도 4.5:1 을 넘긴다.
         */
        <div className="relative h-[320px] -mx-6 w-[calc(100%+3rem)]">
          <SafeImage src={hero} alt={artist ?? challenge.title} fill sizes="100vw" fallbackType="artist" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--app-bg)]/20 via-[var(--app-bg)]/85 to-[var(--app-bg)]" />
          <div className="absolute left-10 top-4">
            <BackButton className="w-9 h-9" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
          </div>
          <div className="absolute inset-x-0 bottom-0 px-12 pb-4">
            <h1 className="type-title-1 text-navy break-keep">{inviteTitle(artist, challenge.title)}</h1>
            <p className="type-body text-navy/70 mt-1 break-keep">
              {inviteDesc(artist, challenge.title, challenge.creator_nickname, challenge.tracks.length)}
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
            {/* 곡 수는 아래 목록이 이미 말한다. 여기서 또 세면 보낼 사람이 읽을 한 줄이 길어진다. */}
            링크를 보내면 상대가 같은 곡으로 소트하고, 서로 얼마나 비슷한지 볼 수 있어요.
          </p>
        </>
      ) : !hero ? (
        <>
          <h1 className="type-title-1 text-navy break-keep">{inviteTitle(artist, challenge.title)}</h1>
          <p className="type-body text-navy/70 mt-2 break-keep">
            {inviteDesc(artist, challenge.title, challenge.creator_nickname, challenge.tracks.length)}
          </p>
        </>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        {/*
          * 불러온 순위는 "끝냈어요" 가 아니다. 방장이 방금 소트를 한 적이 없는데
          * 끝냈다고 하면 누가 들어온 줄 알고 결과를 열어 보게 된다.
          *
          * 여기서만 내 이름을 그대로 쓴다. **서비스가 나에게 알려 주는 문장**이라
          * 그렇다 — 꺼내 온 쪽이 우리고, 그 기록이 누구 것인지 말해 주는 말이다.
          * "내가 불러왔어요" 로 적으면 내가 한 일이 된다.
          */}
        {iAmCreator && mine?.imported && (
          <p className="type-body-strong text-navy break-keep">
            {importedName ? `${importedName}님이 ` : ""}
            {importedOn ? `${importedOn}에 ` : "이전에 "}했던 소트 내역을 불러왔어요
          </p>
        )}
        {/* 누가 끝냈는지는 아래 이름표가 이미 말한다. 사람 수만 세어 준다. */}
        <p className="type-caption text-navy/70">
          {iAmCreator && entries.length === 0
            ? "아직 아무도 소트하지 않았어요. 링크를 보내 보세요."
            : `지금까지 ${entries.length}명이 소트했어요`}
        </p>
        {entries.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <li key={e.id} className="h-7 px-3 rounded-full bg-navy/5 type-caption text-navy flex items-center">
                {personName(e.nickname, e.participant_key === myKey)}
              </li>
            ))}
          </ul>
        )}
        <button onClick={sendLink} className="self-start type-caption text-point-ink font-semibold cursor-pointer">
          코드 {challenge.code} · 링크 보내기
        </button>
      </div>

      {/*
        내 순위를 곡 목록보다 먼저 둔다. 이 화면에서 정할 일은 "다시 소트할까"이고,
        그걸 정하려면 지금 순위를 봐야 한다. 곡 목록은 그다음이다.
      */}
      {myRanked.length > 0 && (
        <>
          <SectionTitle title="내가 매긴 순위" count={myRanked.length} className="mt-8 mb-1" />
          <RankList tracks={showAllMine ? myRanked : myRanked.slice(0, 3)} />
          {myRanked.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllMine((v) => !v)}
              className={`${textLink} mt-3`}
            >
              {showAllMine ? "접기" : `전체 ${myRanked.length}곡 보기`}
            </button>
          )}
        </>
      )}

      <SectionTitle
        title={artist ? `소트 대상 ${artist} 곡` : "소트 대상 곡"}
        count={challenge.tracks.length}
        className="mt-8 mb-1"
      />
      <ul className="flex flex-col divide-y divide-navy/10">
        {(showAllTracks ? challenge.tracks : challenge.tracks.slice(0, 3)).map((track) => (
          <li key={track.id} className="flex items-center gap-3 py-2.5">
            <Cover src={track.albumImage} alt={track.title} size={40} />
            <span className="flex-1 min-w-0">
              <span className="block type-body-strong text-navy truncate">{track.title}</span>
              <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
            </span>
          </li>
        ))}
      </ul>
      {challenge.tracks.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAllTracks((v) => !v)}
          className={`${textLink} mt-3`}
        >
          {showAllTracks ? "접기" : `전체 ${challenge.tracks.length}곡 보기`}
        </button>
      )}
      <DockSpacer />
      </div>

      <div ref={dockRef} className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
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
      {/* 참여자는 이름이 필수다 — 건너뛰기를 두지 않는다(익명 리스너로 남지 않게). */}
      <NicknameDialog
        open={askName}
        onClose={() => setAskName(false)}
        confirmLabel="이 이름으로 소트하기"
        title="일치율에 어떤 이름으로 보일까요?"
        /* 방장 이름을 불러 준다 — 이름을 적는 일이 절차가 아니라 상대와의 일이 된다. */
        desc={`${challenge.creator_nickname ? `${challenge.creator_nickname}님이` : "방을 만든 사람이"} 결과에서 당신을 이 이름으로 봐요.`}
        onDone={() => {
          setAskName(false);
          go();
        }}
      />

      {/*
        다시 소트하면 이전 순위가 사라진다. 되돌릴 수 없는 일이라 한 번 묻는다.
        특히 내 취향표로 방을 만든 사람은 이미 순위가 들어가 있는 줄 모를 수 있다.
      */}
      <ConfirmSheet
        open={askResort}
        title="다시 소트할까요?"
        desc="지금 남아 있는 순위는 지워지고, 새로 소트한 순위로 바뀌어요."
        confirmLabel="다시 소트하기"
        cancelLabel="그대로 둘게요"
        onConfirm={() => {
          setAskResort(false);
          go();
        }}
        onClose={() => setAskResort(false)}
      />

      <Toast toast={toast} />
    </main>
  );
}
