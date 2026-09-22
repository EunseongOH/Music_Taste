"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, X } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { AlbumCard, useAlbumAccordion } from "@/components/album/AlbumCard";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";
import { normalizeRanking, type RankedTrack } from "@/utils/ranking";
import { createChallenge } from "@/utils/togetherDb";
import * as platform from "@/utils/platform";
import { VISIBLE_MODES } from "@/config/modes";
import { Cover, SectionTitle, Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";
import BackButton from "@/components/BackButton";
import { rememberedNickname } from "@/utils/togetherDb";
import NicknameDialog, { needsNickname } from "@/components/together/NicknameDialog";

/** tournament_results 에서 필요한 열만. 클라이언트에는 DB 타입이 없어 여기서 좁힌다. */
interface SavedRow {
  id: string;
  title: string;
  artist_name: string | null;
  is_single_artist: boolean;
  created_at: string;
  ranking: unknown;
}

interface CatalogArtist {
  id: string;
  name: string;
  image: string;
}

/*
 * 확보율은 목록 **순서**로만 쓴다(전곡이 있는 아티스트가 위로 온다).
 * 화면에는 적지 않는다 — 이용자는 당연히 전곡이 있다고 생각하고 들어오는데,
 * "전곡 있어요/일부만 있어요"를 붙이면 없는 쪽을 먼저 알리는 꼴이 된다.
 */

function ArtistAvatar({ src, name, size, on }: { src: string; name: string; size: number; on: boolean }) {
  return (
    <span
      className={`relative shrink-0 block rounded-full overflow-hidden border-2 ${on ? "border-point" : "border-navy/15"}`}
      style={{ width: size, height: size }}
    >
      <SafeImage src={src} alt={name} fill sizes={`${size}px`} fallbackType="artist" className="object-cover" />
    </span>
  );
}

/** 카탈로그가 주는 곡. RankedTrack 에 앨범 정보가 더 붙어 있다. */
type CatalogTrack = RankedTrack & { albumName?: string; releaseDate?: string };

/** 앨범 하나 — 화면에서 접었다 펴는 단위. */
interface AlbumGroup {
  name: string;
  year: string;
  cover: string;
  tracks: CatalogTrack[];
}

/**
 * 곡을 앨범으로 묶는다. 최신 앨범이 위로 온다.
 * 카탈로그가 이미 앨범명·발매일을 함께 주므로 새로 받아올 것이 없다(Spotify 호출 0).
 */
function groupByAlbum(tracks: CatalogTrack[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const name = track.albumName || "기타";
    const found = map.get(name);
    if (found) {
      found.tracks.push(track);
      if ((track.releaseDate ?? "") > (found.year ? `${found.year}-00` : "")) found.year = (track.releaseDate ?? "").slice(0, 4);
      continue;
    }
    map.set(name, {
      name,
      year: (track.releaseDate ?? "").slice(0, 4),
      cover: track.albumImage,
      tracks: [track],
    });
  }
  return [...map.values()].sort((a, b) => b.year.localeCompare(a.year));
}

interface Source {
  key: string;
  label: string;
  /** 아티스트를 골라 만든 경우에만 — 초대 화면 배경에 쓴다 */
  artistId?: string | null;
  artistImage?: string | null;
  /** 링크 이름 기본값 */
  title: string;
  artistName: string | null;
  tracks: CatalogTrack[];
  /** 저장된 취향표에서 온 경우 그 id */
  resultId: string | null;
}

/**
 * 같이 소트하기 — 만들기(실험). 문서: docs/together-sort.md
 *
 * 곡 세트만 정하면 링크가 나온다. 소트를 끝내지 않아도 된다.
 *  - "지금 고른 곡": 곡 고르기 화면에서 담아 둔 곡(월드컵을 아직 안 했어도 된다)
 *  - "내 취향표": 이미 끝낸 취향표의 곡
 * Spotify 를 부르지 않는다(이미 가지고 있는 곡 정보만 쓴다).
 */
export default function TogetherNewPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { toast, showToast } = useToast();

  const [picked, setPicked] = useState<RankedTrack[] | null>(null);
  // 아티스트에서 고르기(DB 에 담긴 Spotify 캐시만 읽는다 — /api/together/catalog)
  const [artistQuery, setArtistQuery] = useState("");
  const [artists, setArtists] = useState<CatalogArtist[] | null>(null);
  const [artistBusy, setArtistBusy] = useState(false);
  /** 어떤 검색어로 받아 온 목록인지. 지금 입력과 다르면 아직 찾는 중이다. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [artistSource, setArtistSource] = useState<Source | null>(null);
  /** 공개 취향표에서 "이 곡들로 같이 소트하기"로 넘어온 경우(?from=<취향표 id>) */
  const [sharedSource, setSharedSource] = useState<Source | null>(null);
  const [cards, setCards] = useState<SavedRow[] | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  /*
   * 두 단계로 나눈다. 1단계는 아티스트만 고르고, 2단계에서 앨범을 펼쳐 곡을 고른다
   * (전곡 모드와 같은 순서). 단계를 옮길 때 주소에 자국을 남겨 브라우저 뒤로가기가
   * 그대로 1단계로 돌아오게 한다 — 이 코드베이스는 useSearchParams 를 쓰지 않고
   * history 를 직접 다룬다(토스 빌드의 라우터 shim 도 같은 전제다).
   */
  const [step, setStep] = useState<1 | 2>(1);
  /** 1단계에서 눌러 둔 아티스트. 곡은 2단계로 넘어갈 때 받는다. */
  const [pendingArtist, setPendingArtist] = useState<CatalogArtist | null>(null);
  /*
   * 앨범 펼침(하나만 열림·자동 스크롤·동작 줄이기)은 전곡 모드와 공용이다.
   * src/components/album/AlbumCard.tsx
   */
  const { openId: openAlbum, setOpenId: setOpenAlbum, toggle: toggleAlbum, cardRef, reduceMotion } = useAlbumAccordion();

  /*
   * 링크 이름. 고치는 칸을 두지 않는다 — 닉네임 입력으로 오해된다.
   * 아티스트로 만든 방은 아티스트명, 그 밖에는 출처의 제목을 그대로 쓴다.
   */
  const [title, setTitle] = useState("");
  /*
   * 이름을 묻는 창은 **만들기를 누른 뒤**에 뜬다. 이름이 이미 있는 사람에게는 뜨지 않는다.
   * "이름이 없다" = 비로그인이거나, 로그인했지만 닉네임을 아직 확인하지 않은 경우
   * (자동 배정된 기본값을 쓰는 상태 — 결과 화면의 공유 이름 확인과 같은 판정이다).
   */
  const [askName, setAskName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [madeCode, setMadeCode] = useState<string | null>(null);

  // 뒤로가기로 2단계에서 나오면 1단계(고른 아티스트는 그대로)로 돌아온다.
  useEffect(() => {
    const onPop = () => setStep(1);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 곡 고르기 화면에서 담아 둔 곡(월드컵 시작 전 상태)
  useEffect(() => {
    // 첫 프레임 뒤에 읽는다(효과 안에서 바로 state 를 바꾸면 렌더가 한 번 더 돈다).
    const id = requestAnimationFrame(() => {
      try {
        const raw = safeSessionStorage.getItem("worldcup_tracks") || safeLocalStorage.getItem("worldcup_tracks");
        setPicked(raw ? normalizeRanking(JSON.parse(raw)) : []);
      } catch {
        setPicked([]);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // 내가 저장한 취향표
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await createClient()
        .from("tournament_results")
        .select("id,title,artist_name,is_single_artist,created_at,ranking")
        .eq("user_id", user.id)
        .in("is_single_artist", VISIBLE_MODES)
        .order("created_at", { ascending: false })
        .limit(30);
      if (alive) setCards((data ?? []) as SavedRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  /*
   * 남의 공개 취향표에서 넘어온 경우 그 곡들을 그대로 집어 온다.
   * 같은 아티스트를 좋아하는 사람끼리 주고받는 길이라, 링크를 열자마자 곡이 차 있어야 한다.
   */
  useEffect(() => {
    const fromId = new URLSearchParams(window.location.search).get("from");
    if (!fromId) return;
    let alive = true;
    (async () => {
      const { data } = await createClient()
        .from("tournament_results")
        .select("id,title,artist_name,is_public,ranking")
        .eq("id", fromId)
        .single();
      if (!alive || !data?.is_public) return;
      const tracks = normalizeRanking((data as { ranking: unknown }).ranking);
      if (tracks.length < 4) return;
      const row = data as { id: string; title: string; artist_name: string | null };
      const next: Source = {
        key: `shared:${row.id}`,
        label: row.title,
        title: row.artist_name || tracks[0]?.artistName || row.title,
        artistName: row.artist_name || tracks[0]?.artistName || null,
        tracks,
        resultId: row.id,
      };
      setSharedSource(next);
      setSourceKey(next.key);
      setOff(new Set());
      setTitle(next.title);
      // 누르고 온 곡이 화면 한참 아래에 있으면 안 보인다. 그 자리로 데려간다.
      requestAnimationFrame(() => {
        document.getElementById("together-tracks")?.scrollIntoView({ block: "start" });
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 검색어가 없으면 전곡이 확실한 아티스트부터 보여 준다. 입력하면 잠시 기다렸다 찾는다.
  useEffect(() => {
    const q = artistQuery.trim();
    let alive = true;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/together/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const json = (await res.json()) as { artists?: CatalogArtist[] };
      if (!alive) return;
      setArtists(json.artists ?? []);
      setLoadedFor(q);
    }, q ? 400 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [artistQuery]);

  /** 1단계: 누르면 고르기만 한다. 곡은 아직 받지 않는다. */
  const pickArtist = (artist: CatalogArtist) => {
    setPendingArtist(artist);
    setTitle(artist.name);
  };

  /** 2단계로. 여기서 곡을 받고 주소에 자국을 남긴다. */
  const openTracks = async (artist: CatalogArtist) => {
    setArtistBusy(true);
    const res = await fetch(`/api/together/catalog?artistId=${encodeURIComponent(artist.id)}`);
    const json = (await res.json()) as { tracks?: CatalogTrack[]; notReady?: boolean };
    const tracks = json.tracks ?? [];
    setArtistBusy(false);
    /*
     * 빈손으로 왔다 = 아직 담기지 않았거나 그날 적재 예산이 끝났다는 뜻이다.
     * "곡이 없는 아티스트"로 읽히지 않게 말을 갈라 준다(라우트의 notReady).
     */
    if (json.notReady || tracks.length === 0) {
      showToast("이 아티스트는 아직 준비 중이에요. 잠시 뒤에 다시 찾아 주세요.", "error");
      return;
    }
    if (tracks.length < 4) {
      showToast("이 아티스트는 아직 담긴 곡이 적어요. 다른 아티스트를 찾아 주세요.", "error");
      return;
    }
    const next: Source = {
      key: `artist:${artist.id}`,
      label: artist.name,
      title: artist.name,
      artistName: artist.name,
      artistId: artist.id,
      artistImage: artist.image || null,
      tracks,
      resultId: null,
    };
    setArtistSource(next);
    setSourceKey(next.key);
    /*
     * 아무것도 선택하지 않은 채로 시작한다 — 전곡 모드(/tracks)와 같다.
     * 전에는 전곡이 선택된 채로 열려서, 전곡으로 할 생각이 아니던 사람도
     * 빼는 일부터 해야 했다. `off` 는 "뺀 곡"이라 전부 넣어 두면 아무것도 안 고른 상태다.
     */
    setOff(new Set(tracks.map((track) => track.id)));
    setOpenAlbum(null);
    setTitle(artist.name);
    window.history.pushState({ togetherStep: 2 }, "", `${window.location.pathname}?artist=${artist.id}`);
    setStep(2);
  };

  /** 2단계 → 1단계. 주소 자국을 되돌려 브라우저 뒤로가기와 같은 길로 나간다. */
  const backToArtists = () => {
    if (window.history.state?.togetherStep === 2) window.history.back();
    else setStep(1);
  };

  /** 이미 해 둔 소트에서 곡을 가져오는 길 — 아티스트 목록 아래에 따로 둔다. */
  const prevSources: Source[] = useMemo(() => {
    const list: Source[] = [];
    if (picked && picked.length >= 4) {
      list.push({
        key: "picked",
        label: "지금 고른 곡",
        title: picked[0]?.artistName ?? "같이 소트하기",
        artistName: picked[0]?.artistName ?? null,
        tracks: picked,
        resultId: null,
      });
    }
    for (const row of cards ?? []) {
      const tracks = normalizeRanking(row.ranking);
      list.push({
        key: row.id,
        label: row.title,
        title: row.artist_name || tracks[0]?.artistName || row.title,
        artistName: row.artist_name || tracks[0]?.artistName || null,
        tracks,
        resultId: row.id,
      });
    }
    return list;
  }, [picked, cards]);

  const searching = loadedFor !== artistQuery.trim();
  const source =
    [artistSource, sharedSource].find((c) => c?.key === sourceKey) ??
    prevSources.find((s) => s.key === sourceKey) ??
    null;
  const chosen = useMemo(() => (source ? source.tracks.filter((t) => !off.has(t.id)) : []), [source, off]);

  /** 주어진 곡들을 한꺼번에 넣거나 뺀다(`off` 는 "뺀 곡" 목록이다). */
  const pickTracks = (ids: string[], on: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const choose = (next: Source) => {
    setSourceKey(next.key);
    setOff(new Set());
    setTitle(next.title);
    window.history.pushState({ togetherStep: 2 }, "", `${window.location.pathname}?from=${next.key}`);
    setStep(2);
  };

  const make = async () => {
    if (!source || chosen.length < 4) return;
    if (needsNickname(user)) {
      setAskName(true);
      return;
    }
    await create(user ? ((user.user_metadata?.nickname as string | undefined) ?? null) : rememberedNickname() || null);
  };

  const create = async (name: string | null) => {
    if (!source || chosen.length < 4) return;
    setBusy(true);
    const made = await createChallenge({
      creatorId: user?.id ?? null,
      creatorNickname: name,
      artistName: source.artistName,
      // 아티스트를 골라 만든 방이면 초대 화면 배경에 쓸 사진을 함께 남긴다.
      artistId: source.artistId ?? null,
      artistImage: source.artistImage ?? null,
      title: title.trim() || source.title,
      tracks: chosen,
      sourceResultId: source.resultId,
    });
    setBusy(false);
    if (!made) {
      showToast("링크를 만들지 못했어요. 다시 시도해 주세요.", "error");
      return;
    }
    setMadeCode(made.code);
  };

  if (isLoading || picked === null || (user && cards === null)) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">
        <p className="type-sub text-navy/70">불러오고 있어요</p>
      </main>
    );
  }

  if (madeCode) {
    const link = `${window.location.origin}/together/${madeCode}`;
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-12">
        <h1 className="type-title-1 text-navy">같이 할 준비가 됐어요</h1>
        <p className="type-body text-navy/70 mt-2 break-keep">
          옆 사람에게 코드를 알려 주거나 링크를 보내세요.{"\n"}같은 곡으로 소트하면 서로의 일치율이 보여요.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2 py-6 rounded-3xl bg-navy/5">
          <span className="type-caption text-navy/70">코드</span>
          <span className="font-num text-[40px] leading-none font-extrabold tracking-[0.12em] text-navy">{madeCode}</span>
          <span className="type-caption text-navy/70">같이 소트하기 첫 화면에서 입력</span>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={async () => {
              const shared = await platform.share({ title: "같이 소트하기", text: `${title} — 같은 곡으로 소트해 봐요`, url: link });
              if (!shared) {
                const how = await platform.copyText(link);
                showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
              }
            }}
            className={`${primaryButton} w-full`}
          >
            링크 보내기
          </button>
          <button
            onClick={async () => {
              const how = await platform.copyText(link);
              showToast(how === "sheet" ? "공유 창에서 '복사'를 눌러 주세요" : "링크를 복사했어요");
            }}
            className={`${secondaryButton} w-full`}
          >
            링크 복사하기
          </button>
          <button onClick={() => router.push(`/together/${madeCode}`)} className={`${secondaryButton} w-full`}>
            나도 소트하러 가기
          </button>
        </div>
        <Toast toast={toast} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-32">
      <BackButton
        className="w-9 h-9"
        onClick={() => {
          if (step === 2) return backToArtists();
          if (window.history.length > 1) return router.back();
          router.push("/");
        }}
      />
      <h1 className="type-title-1 text-navy mt-2">{step === 2 ? source?.label ?? "곡 고르기" : "같이 소트하기 만들기"}</h1>
      <p className="type-body text-navy/70 mt-2 break-keep">
        {step === 2
          ? "소트할 곡을 골라 주세요. 앨범을 눌러 펼치면 곡이 나와요."
          : "곡만 정하면 돼요. 소트를 끝내지 않아도 링크를 만들 수 있어요."}
      </p>

      {step === 1 && (
      <>
      {/* 1. 아티스트 고르기 — "한 아티스트 전곡" 모드와 같은 모양(검색창 + 동그란 목록). */}
      <div className="relative w-full mt-7">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {searching ? <Loader2 className="text-navy/50 animate-spin" size={18} /> : <Search className="text-navy/50" size={18} />}
        </div>
        <input
          id="together-artist"
          type="text"
          value={artistQuery}
          onChange={(e) => setArtistQuery(e.target.value)}
          placeholder="아티스트 검색 (예: 이승윤)..."
          className="w-full py-2.5 pl-11 pr-10 bg-white/50 border-2 border-navy/10 rounded-full focus:outline-none focus:border-point type-body text-navy placeholder:text-navy/40 transition-colors"
        />
        {artistQuery.length > 0 && (
          <button
            onClick={() => setArtistQuery("")}
            aria-label="검색어 지우기"
            className="absolute inset-y-0 right-4 flex items-center text-navy/40 hover:text-point transition-colors cursor-pointer"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {artistQuery.trim().length > 0 ? (
        <ul className="flex flex-col gap-2.5 mt-5">
          {artists?.length === 0 && !searching && (
            <li className="py-10 text-center type-caption text-navy/60 border border-dashed border-navy/10 rounded-3xl">
              아직 준비된 아티스트가 아니에요. 다른 이름으로 찾아볼까요?
            </li>
          )}
          {(artists ?? []).map((artist) => {
            const isOn = pendingArtist?.id === artist.id;
            return (
              <li key={artist.id}>
                <button
                  onClick={() => pickArtist(artist)}
                  disabled={artistBusy}
                  className={`w-full flex items-center gap-4 p-3 rounded-2xl text-left cursor-pointer transition-colors ${
                    isOn ? "bg-point/10 border-2 border-point" : "bg-white/50 border-2 border-navy/5 hover:border-navy/15"
                  }`}
                >
                  <ArtistAvatar src={artist.image} name={artist.name} size={56} on={isOn} />
                  <span className="flex-1 min-w-0">
                    <span className="block type-body-strong text-navy truncate">{artist.name}</span>
                    <span className="block type-caption text-navy/70">아티스트</span>
                  </span>
                  {isOn && <Check size={18} className="text-point mr-1" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
        {/* 검색 전 기본 목록. 무한스크롤이 아니라 고정 묶음이므로 "이번주"라고 이름을 붙인다
            — 다음에 와서 얼굴이 바뀌어 있는 게 의도된 것임을 알린다. 교체 규칙은
            /api/together/catalog 의 PICK_COVERAGE·PICK_SIZE·weekIndex 에 있다. */}
        <SectionTitle title="이번주 소트 추천 아티스트" className="mt-8 mb-1" />
        <p className="type-caption text-navy/60">전곡이 다 있는 아티스트 중에서 매주 바꿔 올려요.</p>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-6 mt-5">
          {(artists ?? []).map((artist) => {
            const isOn = pendingArtist?.id === artist.id;
            return (
              <li key={artist.id}>
                <button
                  onClick={() => pickArtist(artist)}
                  disabled={artistBusy}
                  className="w-full flex flex-col items-center gap-2 cursor-pointer"
                >
                  <ArtistAvatar src={artist.image} name={artist.name} size={96} on={isOn} />
                  <span className={`type-caption text-center line-clamp-1 w-full ${isOn ? "text-navy font-bold" : "text-navy/90"}`}>
                    {artist.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </>
      )}

      {/* 2. 이미 해 둔 소트에서 가져오기 */}
      {prevSources.length > 0 && (
        <>
          <SectionTitle title="이미 한 소트에서 가져오기" className="mt-10 mb-1" />
          <p className="type-caption text-navy/60 mb-2">그때 소트했던 곡 그대로 같이 해 볼 수 있어요.</p>
          <ul className="flex flex-col divide-y divide-navy/10">
            {prevSources.map((item) => (
              <li key={item.key}>
                <button onClick={() => choose(item)} className="w-full flex items-center gap-3 py-3 text-left cursor-pointer">
                  <Cover src={item.tracks[0]?.albumImage} alt={item.label} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="block type-body-strong text-navy truncate">{item.label}</span>
                    <span className="block type-caption text-navy/70">
                      {item.tracks.length}곡{item.resultId ? "" : " · 아직 소트하지 않은 곡"}
                    </span>
                  </span>
                  <span className={`type-caption ${sourceKey === item.key ? "text-point-ink font-semibold" : "text-navy/70"}`}>
                    {sourceKey === item.key ? "고름" : "고르기"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        고른 아티스트로 넘어가는 자리. 눌러야 곡 목록을 받는다.

        하단 고정 래퍼에는 z 를 준다 — 앨범 카드가 framer-motion layout 으로 움직이며
        쌓임 문맥을 만들고, 펼친 카드와 LP 에 z 가 붙어 있어 z 없는 고정 버튼을 넘어섰다.
        시트(999·1000)와 토스트(1100)보다는 낮게 둔다 — 그것들은 버튼 위에 떠야 한다.
      */}
      {pendingArtist && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[900] px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
          <div className="w-full max-w-[382px] pointer-events-auto">
            <button
              onClick={() => openTracks(pendingArtist)}
              disabled={artistBusy}
              className={`${primaryButton} w-full`}
            >
              {artistBusy ? "곡을 불러오는 중" : `${pendingArtist.name} 곡 고르기`}
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {step === 2 && source && (
        <>
          <div id="together-tracks" className="scroll-mt-4" />
          <SectionTitle title="고른 곡" count={chosen.length} className="mt-8 mb-3" />
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => pickTracks(source.tracks.map((track) => track.id), true)}
              className="h-8 px-3 rounded-full bg-navy/5 text-navy type-caption cursor-pointer"
            >
              전체 선택
            </button>
            <button
              onClick={() => pickTracks(source.tracks.map((track) => track.id), false)}
              className="h-8 px-3 rounded-full bg-navy/5 text-navy type-caption cursor-pointer"
            >
              전체 해제
            </button>
            {chosen.length > 48 && <span className="type-caption text-point-ink">곡이 많으면 소트하는 데 오래 걸려요</span>}
          </div>

          {source.artistId ? (
            /*
             * 앨범 그리드 — 전곡 모드(/tracks)와 같은 카드를 쓴다.
             * 모양·모션은 src/components/album/AlbumCard.tsx 에서만 정한다.
             */
            <ul className="grid grid-cols-2 gap-4">
              {groupByAlbum(source.tracks).map((album) => {
                const ids = album.tracks.map((track) => track.id);
                const picked = ids.filter((id) => !off.has(id)).length;
                return (
                  <AlbumCard
                    key={album.name}
                    id={album.name}
                    title={album.name}
                    cover={album.cover}
                    meta={`${album.year ? `${album.year} · ` : ""}${album.tracks.length}곡`}
                    open={openAlbum === album.name}
                    onToggle={() => toggleAlbum(album.name)}
                    badge={picked}
                    reduceMotion={reduceMotion}
                    cardRef={cardRef(album.name)}
                  >
                    {/* 앨범 단위 선택은 트랙리스트 바로 위에 — 펼쳐 본 다음에 쓰는 기능이다. */}
                    <div className="flex items-center justify-between pb-2 border-b border-navy/10">
                      <span className="type-caption text-navy/70">
                        {picked > 0 ? `${picked}곡 선택` : "곡을 골라 주세요"}
                      </span>
                      <button
                        onClick={() => pickTracks(ids, picked !== ids.length)}
                        className={`h-8 px-3 rounded-full type-caption cursor-pointer ${
                          picked === ids.length ? "bg-navy text-cream" : "bg-navy/5 text-navy"
                        }`}
                      >
                        {picked === ids.length ? "이 앨범 전체 해제" : "이 앨범 전체 선택"}
                      </button>
                    </div>
                    <ul className="flex flex-col divide-y divide-navy/10">
                      {album.tracks.map((track) => {
                        const on = !off.has(track.id);
                        return (
                          <li key={track.id} className="flex items-center gap-3 py-2.5">
                            <span className={`flex-1 min-w-0 ${on ? "" : "opacity-50"}`}>
                              <span className="block type-body-strong text-navy truncate">{track.title}</span>
                              <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
                            </span>
                            <button
                              onClick={() => pickTracks([track.id], !on)}
                              className={`h-8 px-3 rounded-full type-caption cursor-pointer shrink-0 ${
                                on ? "bg-navy text-cream" : "bg-navy/5 text-navy/70"
                              }`}
                            >
                              {on ? "선택" : "선택 안 함"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </AlbumCard>
                );
              })}
            </ul>
          ) : (
            <ul className="flex flex-col divide-y divide-navy/10">
              {source.tracks.map((track) => {
                const on = !off.has(track.id);
                return (
                  <li key={track.id} className="flex items-center gap-3 py-2.5">
                    <Cover src={track.albumImage} alt={track.title} size={36} />
                    <span className={`flex-1 min-w-0 ${on ? "" : "opacity-50"}`}>
                      <span className="block type-body-strong text-navy truncate">{track.title}</span>
                      <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
                    </span>
                    <button
                      onClick={() => pickTracks([track.id], !on)}
                      className={`h-8 px-3 rounded-full type-caption cursor-pointer ${
                        on ? "bg-navy text-cream" : "bg-navy/5 text-navy/70"
                      }`}
                    >
                      {on ? "선택" : "선택 안 함"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="fixed bottom-0 left-0 right-0 z-[900] px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
            <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
              {chosen.length < 4 && <p className="type-caption text-point-ink text-center">최소 4곡이 필요해요</p>}
              <button onClick={make} disabled={busy || chosen.length < 4} className={`${primaryButton} w-full`}>
                {busy ? "만드는 중" : `${chosen.length}곡으로 링크 만들기`}
              </button>
            </div>
          </div>
        </>
      )}
      {/* 이름을 묻는 창. 참여 화면과 같은 컴포넌트를 쓴다. */}
      <NicknameDialog
        open={askName}
        onClose={() => setAskName(false)}
        confirmLabel="이 이름으로 만들기"
        skipLabel="이름 없이 만들기"
        desc="초대 화면과 일치율 화면에 이 이름으로 나와요."
        onDone={async (name) => {
          setAskName(false);
          await create(name);
        }}
      />

      <Toast toast={toast} />
    </main>
  );
}
