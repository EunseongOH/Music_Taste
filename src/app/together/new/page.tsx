"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, Plus, Search, X } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { AlbumCard, AlbumPager, useAlbumAccordion, useAlbumPaging } from "@/components/album/AlbumCard";
import UnreleasedDialog, { type AddedUnreleasedTrack } from "@/components/album/UnreleasedDialog";
import FeedbackModal from "@/components/FeedbackModal";
import LoadingScreen, { useSlowEnough } from "@/components/LoadingScreen";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";
import { normalizeRanking, type RankedTrack } from "@/utils/ranking";
import { createChallenge, saveEntry } from "@/utils/togetherDb";
import * as platform from "@/utils/platform";
import { VISIBLE_MODES } from "@/config/modes";
import { Cover, SectionTitle, Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";
import BackButton from "@/components/BackButton";
import SpotifyLink from "@/components/SpotifyLink";
import { rememberedNickname } from "@/utils/togetherDb";
import { josaOf } from "@/utils/josa";
import { DockSpacer, useDockClearance } from "@/components/space/BottomDock";
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

/** 카탈로그가 흘려보내는 진행 상황 한 줄. 라우트의 Progress 와 짝이다. */
type CatalogLine =
  | { t: "work"; done: number; total: number }
  | { t: "done"; tracks: CatalogTrack[]; notReady: boolean };

/**
 * 곡을 받으면서 진행률을 알려 준다.
 *
 * 세는 단위는 요청 한 번이다(라우트의 Progress 주석). 실제로 끝난 일만 세고,
 * 시간이 흐른다고 늘리지 않는다. 전체 장수를 모르는 첫 구간은 null(불확정)이다.
 *
 * 값은 뒤로 가지 않는다. 앨범 목록 구간에서 어림잡은 총량과 곡 구간에서 확정된
 * 총량이 조금 다를 수 있는데, 그 때문에 바가 되돌아가면 고장으로 보인다.
 *
 * 스트림을 못 읽는 환경(오래된 WebView, 중간에서 모아 보내는 프록시)이면 본문을
 * 통째로 받아 마지막 줄만 쓴다 — 진행률만 못 보고 결과는 같다.
 */
async function streamCatalog(
  artistId: string,
  onProgress: (value: number | null) => void
): Promise<{ tracks: CatalogTrack[]; notReady: boolean }> {
  const empty = { tracks: [] as CatalogTrack[], notReady: true };
  let result = empty;
  let highest = 0;

  const take = (line: string) => {
    if (!line.trim()) return;
    let msg: CatalogLine;
    try {
      msg = JSON.parse(line) as CatalogLine;
    } catch {
      return; // 잘린 줄. 다음 조각에서 이어 붙는다.
    }
    if (msg.t === "done") {
      result = { tracks: msg.tracks ?? [], notReady: !!msg.notReady };
      return;
    }
    if (!msg.total) return onProgress(null);
    highest = Math.max(highest, Math.min(1, msg.done / msg.total));
    onProgress(highest);
  };

  try {
    const res = await fetch(`/api/together/catalog?artistId=${encodeURIComponent(artistId)}&stream=1`);
    if (!res.body) {
      (await res.text()).split("\n").forEach(take);
      return result;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(take);
    }
    take(buffer);
  } catch (err) {
    console.error("[together] 곡을 받지 못했습니다:", err);
    return empty;
  }
  return result;
}

/*
 * 들어오자마자 기다리는 동안 번갈아 보여 줄 문구. 이 목록은 한 번만 만들어져야
 * 한다 — 렌더마다 새 배열이면 번갈이가 계속 처음으로 돌아간다.
 */
const ENTRY_LINES = [
  "함께 소트할 준비를 하고 있어요",
  "이번주 추천 아티스트를 불러오고 있어요",
] as const;

/** 한 번에 보여 줄 앨범 수. 2열 그리드라 5줄이다. */
const ALBUM_PAGE = 10;

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
  /**
   * **내가 직접 소트한 순위**인가. `이미 한 소트에서 가져오기` 목록(내 취향표)만 true 다.
   * 남의 공개 취향표에서 `?from=` 으로 온 것은 곡만 빌린 것이라 false — 그 순위를
   * 내 기록으로 저장하면 내가 정한 적 없는 순위가 내 것으로 남는다.
   */
  mine?: boolean;
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
  /** 곡을 모으는 진행률 0~1. 전체 앨범 수를 모르는 구간은 null 이다. */
  const [progress, setProgress] = useState<number | null>(null);
  /** 어떤 검색어로 받아 온 목록인지. 지금 입력과 다르면 아직 찾는 중이다. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  /** "다시 시도" 를 누르면 올린다. 검색어가 그대로여도 목록을 다시 받게 하는 열쇠다. */
  const [reload, setReload] = useState(0);
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
  /** 미발매곡 등록 팝업. 전곡 모드와 같은 것을 쓴다. */
  const [addingUnreleased, setAddingUnreleased] = useState(false);
  /** 곡 정보 오류 제보 창. 전곡 모드와 같은 것을 쓴다. */
  const [reporting, setReporting] = useState(false);

  /*
   * 등록한 곡을 이 방의 곡 목록에 바로 넣는다(고른 상태로).
   *
   * 승인 전이라 카탈로그(/api/together/catalog)는 아직 이 곡을 주지 않는다.
   * 그래도 방에는 곡 정보가 통째로 저장되므로(challenge.tracks) 초대받은
   * 사람도 같은 곡을 본다 — 승인은 "다른 방에도 보일지"를 정하는 일이다.
   */
  const addUnreleased = (track: AddedUnreleasedTrack, notice: string) => {
    setArtistSource((prev) =>
      prev
        ? {
            ...prev,
            tracks: [
              {
                id: track.id,
                title: track.title,
                artistName: track.artistName,
                albumImage: track.cover,
                albumName: track.title, // 곡명이랑 앨범명 완벽 매칭(전곡 모드와 같다)
                // 날짜를 안 적으면 올해로 둔다 — 앨범은 최신순이라 방금 넣은 곡이 맨 뒤로 가면 안 보인다
                releaseDate: track.date || `${track.year}-01-01`,
              },
              ...prev.tracks,
            ],
          }
        : prev
    );
    setOff((prev) => {
      const next = new Set(prev);
      next.delete(track.id);
      return next;
    });
    showToast(notice);
  };

  /*
   * 링크 이름. 고치는 칸을 두지 않는다 — 닉네임 입력으로 오해된다.
   * 아티스트로 만든 방은 아티스트명, 그 밖에는 출처의 제목을 그대로 쓴다.
   */
  const [title, setTitle] = useState("");
  /**
   * 직접 적은 방 이름. `title` 과 따로 둔다 — `title` 은 아티스트를 고르면 그 이름으로
   * 채워져서(로딩 화면·공유 문구가 쓴다) 입력칸에 그대로 물리면 "선택"이 아니게 된다.
   * 비워 두면 지금까지처럼 아티스트명이 방 이름이 된다.
   */
  const [roomName, setRoomName] = useState("");
  const [namingRoom, setNamingRoom] = useState(false);

  /**
   * 이 화면의 Spotify 링크백 주소 (Developer Policy II.4).
   *
   * 아티스트를 골라 들어왔으면 그 아티스트로. "지금 고른 곡"·"내 취향표"로 들어오면
   * 아티스트 ID 가 없으니 곡 하나로 건다 — 재킷과 곡 정보가 Spotify 것인 건 같다.
   * `mb:`·`deezer:` 만 있는 방은 Spotify 자료를 안 쓰므로 링크도 걸지 않는다.
   */
  const spotifyHref = useMemo(() => {
    const artistId = artistSource?.artistId ?? pendingArtist?.id;
    if (artistId) return `https://open.spotify.com/artist/${artistId}`;
    const track = (sharedSource ?? artistSource)?.tracks.find((t) => t.id && !t.id.includes(":"))
      ?? picked?.find((t) => t.id && !t.id.includes(":"));
    return track ? `https://open.spotify.com/track/${track.id}` : null;
  }, [artistSource, pendingArtist, sharedSource, picked]);
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
      /*
       * **곡 고르기 화면에서 시작한다.**
       *
       * 전에는 아티스트 검색 화면(step 1)이 먼저 떴다 — 남의 취향표에서 "이 곡들로
       * 같이 소트하기" 를 누르고 왔는데 아티스트를 다시 고르라는 말이 된다.
       * 받은 사람은 방장이 아니라 **자기 방을 새로 만드는 사람**이므로, 받은 곡을
       * 그대로 두고 바로 링크를 만들 수 있어야 한다.
       *
       * URL 은 `?from=` 그대로 둔다. 새로고침하면 이 효과가 다시 돌아 같은 자리로 온다.
       */
      setStep(2);
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
      let list: CatalogArtist[] = [];
      try {
        const res = await fetch(`/api/together/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        list = ((await res.json()) as { artists?: CatalogArtist[] }).artists ?? [];
      } catch (err) {
        // 빈 목록으로 끝낸다. null 로 두면 기다리는 화면에 영영 갇힌다.
        console.error("[together] 아티스트 목록을 받지 못했습니다:", err);
      }
      if (!alive) return;
      setArtists(list);
      setLoadedFor(q);
    }, q ? 400 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [artistQuery, reload]);

  /** 1단계: 누르면 고르기만 한다. 곡은 아직 받지 않는다. */
  const pickArtist = (artist: CatalogArtist) => {
    setPendingArtist(artist);
    setTitle(artist.name);
  };

  /**
   * 2단계로. **먼저 넘어가고 그다음 받는다.**
   *
   * 전에는 다 받을 때까지 1단계에 머물며 버튼 글자만 바뀌어서, 눌렀는데 아무 일도
   * 안 일어난 것처럼 보였다(그사이 다른 아티스트를 또 누를 수도 있었다).
   * 이제 화면이 바로 바뀌고, 그 안에서 진행 상황을 보여 준다.
   *
   * 진행률은 서버가 흘려보내 주는 실제 숫자다. 일의 총량을 "앨범 수 × 2"
   * (목록에 실린 앨범 + 곡까지 받은 앨범)로 잡고 끝난 만큼만 채운다. 전체 앨범
   * 수를 모르는 첫 구간만 불확정 바다.
   */
  const openTracks = async (artist: CatalogArtist) => {
    setArtistBusy(true);
    setProgress(null);
    setArtistSource(null);
    setSourceKey(`artist:${artist.id}`);
    setOpenAlbum(null);
    setTitle(artist.name);
    window.history.pushState({ togetherStep: 2 }, "", `${window.location.pathname}?artist=${artist.id}`);
    setStep(2);

    const done = await streamCatalog(artist.id, setProgress);
    setArtistBusy(false);

    /*
     * 빈손으로 왔다 = 아직 담기지 않았거나 그날 적재 예산이 끝났다는 뜻이다.
     * "곡이 없는 아티스트"로 읽히지 않게 말을 갈라 준다(라우트의 notReady).
     * 예산은 다음 날 풀리므로 "잠시 뒤"가 아니라 "내일"이라고 말한다.
     */
    const tracks = done.tracks;
    if (done.notReady || tracks.length === 0) {
      showToast("이 아티스트는 아직 준비 중이에요. 내일 다시 찾아 주세요.", "error");
      return backToArtists();
    }
    if (tracks.length < 4) {
      showToast("이 아티스트는 아직 담긴 곡이 적어요. 다른 아티스트를 찾아 주세요.", "error");
      return backToArtists();
    }

    setArtistSource({
      key: `artist:${artist.id}`,
      label: artist.name,
      title: artist.name,
      artistName: artist.name,
      artistId: artist.id,
      artistImage: artist.image || null,
      tracks,
      resultId: null,
    });
    /*
     * 아무것도 선택하지 않은 채로 시작한다 — 전곡 모드(/tracks)와 같다.
     * 전에는 전곡이 선택된 채로 열려서, 전곡으로 할 생각이 아니던 사람도
     * 빼는 일부터 해야 했다. `off` 는 "뺀 곡"이라 전부 넣어 두면 아무것도 안 고른 상태다.
     */
    setOff(new Set(tracks.map((track) => track.id)));
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
        mine: true,
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

  /*
   * 앨범 묶음. 한 화면에 ALBUM_PAGE 장씩 보여 주고 "더 보기"로 뒤에 붙인다 —
   * 앨범을 많이 낸 아티스트에서 목록 아래의 미발매곡 추가·제보까지 스크롤이
   * 너무 길었다. 아티스트가 바뀌면 처음 묶음으로 돌아간다.
   */
  const albums = useMemo(() => (source?.artistId ? groupByAlbum(source.tracks) : []), [source]);
  const paging = useAlbumPaging(albums.length, ALBUM_PAGE, source?.key ?? null);

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
    /*
     * `?source=` 로 적는다. `?from=` 은 **남의 공개 취향표**를 집어 오는 길의 이름이라
     * 여기에 쓰면 새로고침·뒤로가기에서 뜻이 달라진다(곡만 빌린 것으로 읽힌다).
     */
    window.history.pushState({ togetherStep: 2 }, "", `${window.location.pathname}?source=${next.key}`);
    setStep(2);
  };

  /*
   * 취향표 결과 화면에서 "이 곡들로 같이 소트하기" 로 넘어온 경우.
   *
   * 아티스트 검색 화면(step 1)이 먼저 뜨면, 방금 소트한 곡을 두고 아티스트를
   * 다시 고르라는 말이 된다. `?source=` 가 가리키는 것을 바로 고른 상태로 연다.
   *
   * 기존 `?from=` 과 섞지 않는다 — 그건 **남의 공개 취향표**를 집어 오는 길이라
   * 판정도 다르고(곡만 빌린 것, mine=false) 뜻도 다르다.
   * 여기서는 내 것(`prevSources`)만 본다.
   */
  /* 고정 바의 실제 높이만큼 본문 끝을 비운다(step 에 따라 버튼이 바뀐다). */
  const dockRef = useDockClearance();
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || sourceKey) return;
    const want = new URLSearchParams(window.location.search).get("source");
    if (!want) return;
    const found = prevSources.find((s) => s.key === want);
    // 취향표 목록은 나중에 도착한다. 올 때까지 이 효과가 다시 돈다.
    if (!found) return;
    autoPicked.current = true;
    /* 목록이 도착한 뒤에야 고를 수 있다 — 렌더 중에는 아직 아무것도 없다. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    choose(found);
  }, [prevSources, sourceKey]);

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
      title: roomName.trim() || title.trim() || source.title,
      tracks: chosen,
      sourceResultId: source.resultId,
    });
    setBusy(false);
    if (!made) {
      showToast("링크를 만들지 못했어요. 다시 시도해 주세요.", "error");
      return;
    }
    /*
     * 내 취향표로 만든 방이면 **그 순위를 내 참여 기록으로 바로 남긴다.**
     *
     * 이미 정해 둔 순위가 있는데 방을 만들자마자 "같은 곡으로 소트하기"가 뜨면,
     * 방장은 자기가 방금 고른 곡을 처음부터 다시 줄 세워야 했다. 이제 다른 사람이
     * 들어오는 즉시 비교가 되고, 다시 하고 싶으면 [다시 소트하기]로 덮어쓴다.
     *
     * 남의 공개 취향표에서 온 방(`?from=`)은 하지 않는다 — 곡만 빌린 것이라
     * 그 순위를 내 기록으로 남기면 내가 정한 적 없는 순위가 내 것이 된다.
     * "지금 고른 곡"·"아티스트에서 고르기"도 순위 자체가 없어 해당이 없다.
     *
     * 저장에 실패해도 방 만들기는 성공으로 둔다. 링크는 이미 나왔고, 방장은
     * [나도 소트하기]로 직접 하면 된다.
     */
    if (source.mine && chosen.length > 1) {
      await saveEntry({
        challengeId: made.id,
        nickname: user?.user_metadata?.nickname ?? name ?? rememberedNickname() ?? null,
        ranking: chosen.map((t) => t.id),
        // 불러온 취향표에는 "모르는 곡" 으로 뺀 행동이 없다. 없는 것을 지어내지 않는다.
        skippedTrackIds: [],
        // 직접 소트한 게 아니라 불러온 것이다. 초대 화면이 이걸 보고 다르게 말한다.
        imported: true,
      });
    }

    setMadeCode(made.code);
    // 다음에 할 일을 한 줄로 알려 준다 — 만들고 나면 화면에 코드와 버튼만 남는다.
    showToast("링크를 만들었어요. 보내면 바로 시작돼요.");
  };

  /*
   * 들어오자마자 기다리는 시간. 저장해 둔 곡·취향표를 읽고, 추천 아티스트 목록을
   * 받아 온다. 전에는 그동안 화면이 다 그려진 채 검색창 안에서 작은 스피너만
   * 돌아서, 목록이 늦게 나타나는 것이 고장처럼 보였다. 화면을 덮고 무엇을 하는지
   * 말한다.
   *
   * 곡 모으기 화면과 같은 규칙으로 짧으면 띄우지 않는다(useSlowEnough).
   */
  const booting = isLoading || picked === null || (user && cards === null) || artists === null;
  const showBoot = useSlowEnough(booting);
  // 곡을 모으는 동안도 같은 규칙.
  const showLoader = useSlowEnough(artistBusy && !artistSource);
  if (booting) {
    return showBoot ? <LoadingScreen lines={ENTRY_LINES} /> : <main className="min-h-screen bg-[var(--app-bg)]" />;
  }

  if (madeCode) {
    const link = `${window.location.origin}/together/${madeCode}`;
    return (
      <main className="min-h-screen bg-[var(--app-bg)] flex flex-col pt-10 pb-12">
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
    /* 양옆 여백은 LayoutWrapper 의 px-6(24px)에 맡긴다 — 여기서 또 주면 48px 이 된다 */
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col pt-10">
      <BackButton
        className="w-9 h-9"
        onClick={() => {
          if (step === 2) return backToArtists();
          if (window.history.length > 1) return router.back();
          router.push("/");
        }}
      />
      {/* 곡을 모으는 동안에도 누구의 화면인지는 이미 보여야 한다 — 곡보다 이름이 먼저 온다. */}
      <div className="flex items-start justify-between gap-3 mt-2">
        <h1 className="type-title-1 text-navy min-w-0">
          {step === 2 ? source?.label ?? pendingArtist?.name ?? "곡 고르기" : "같이 소트하기 만들기"}
        </h1>
        {/*
         * 이 화면에도 Spotify 링크백이 있어야 한다(Developer Policy II.4). 앨범 재킷과 곡 정보가
         * Spotify 에서 온 자리인데 전곡 모드에만 붙어 있었다. 카드마다가 아니라 묶음에 하나다.
         */}
        {step === 2 && spotifyHref && <SpotifyLink href={spotifyHref} />}
      </div>
      {/* 두 문장을 줄을 갈라 놓는다 — 한 줄로 이으면 첫 문장이 뒤에 묻힌다. */}
      <p className="type-body text-navy/70 mt-2 break-keep whitespace-pre-line">
        {step !== 2
          ? "아티스트만 정하면 돼요.\n소트를 끝내지 않아도 링크를 만들 수 있어요."
          : source
            ? "소트할 곡을 골라 주세요. 앨범을 눌러 펼치면 곡이 나와요."
            : "곡이 다 오면 앨범이 여기 펼쳐져요."}
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
        {/* 목록이 비어서 왔다. 기다리는 화면에 갇히지 않게 여기서 끝을 내고 길을 준다. */}
        {artists?.length === 0 && (
          <div className="mt-5 py-10 px-6 text-center border border-dashed border-navy/10 rounded-3xl flex flex-col items-center gap-3">
            <p className="type-caption text-navy/60 break-keep">추천 목록을 불러오지 못했어요.</p>
            <button
              onClick={() => {
                setArtists(null);
                setReload((n) => n + 1);
              }}
              className="h-9 px-4 rounded-full bg-navy/5 text-navy type-caption cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        )}
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

      {/* 고정 바가 있는 동안만 그만큼 비운다(바가 없으면 --dock-h 도 없다). */}
      {pendingArtist && <DockSpacer />}

      {/*
        고른 아티스트로 넘어가는 자리. 눌러야 곡 목록을 받는다.

        하단 고정 래퍼에는 z 를 준다 — 앨범 카드가 framer-motion layout 으로 움직이며
        쌓임 문맥을 만들고, 펼친 카드와 LP 에 z 가 붙어 있어 z 없는 고정 버튼을 넘어섰다.
        시트(999·1000)와 토스트(1100)보다는 낮게 둔다 — 그것들은 버튼 위에 떠야 한다.
      */}
      {pendingArtist && (
        <div
          ref={dockRef}
          className="fixed bottom-0 left-0 right-0 z-[900] px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
          <div className="w-full max-w-[382px] pointer-events-auto">
            <button
              onClick={() => openTracks(pendingArtist)}
              disabled={artistBusy}
              className={`${primaryButton} w-full`}
            >
              {`${pendingArtist.name} 곡 고르기`}
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/*
        * 2단계인데 곡이 아직 없다 = 지금 모으는 중이다. 화면은 이미 넘어와 있고
        * 제목에 아티스트 이름이 떠 있으므로, 여기서는 진행 상황만 보여 준다.
        */}
      {step === 2 && !source && artistBusy && showLoader && (
        <LoadingScreen inline artist={pendingArtist?.name ?? title} progress={progress} />
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
              className="h-8 px-3 shrink-0 whitespace-nowrap rounded-full bg-navy/5 text-navy type-caption cursor-pointer"
            >
              전체 해제
            </button>
            {/*
             * "곡이 많으면 오래 걸려요" 경고는 뺐다. 많이 고르는 건 잘못이 아니라 그냥 선택이고,
             * 고르자마자 경고가 뜨면 방금 한 일이 실수처럼 읽힌다. 게다가 이 줄에 글이 끼어들면
             * 옆 버튼이 두 줄로 접혔다 — 버튼은 shrink-0·whitespace-nowrap 으로 고정한다.
             */}
          </div>

          {source.artistId ? (
            /*
             * 앨범 그리드 — 전곡 모드(/tracks)와 같은 카드를 쓴다.
             * 모양·모션은 src/components/album/AlbumCard.tsx 에서만 정한다.
             */
            <ul className="grid grid-cols-2 gap-4">
              {albums.slice(paging.from, paging.to).map((album) => {
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
                          picked === ids.length ? "bg-brand text-cream" : "bg-navy/5 text-navy"
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
                                on ? "bg-brand text-cream" : "bg-navy/5 text-navy/70"
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
                        on ? "bg-brand text-cream" : "bg-navy/5 text-navy/70"
                      }`}
                    >
                      {on ? "선택" : "선택 안 함"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 이전·다음 막대. "더 보기"로 쌓으면 스크롤만 길어지고 어디까지 봤는지 알 수 없다. */}
          <AlbumPager page={paging.page} pages={paging.pages} onGo={paging.go} className="mt-6" />

          {source.artistId && (
            /* 발매되지 않은 곡 — 공연에서만 부른 곡 — 도 방에 넣을 수 있다. */
            <button
              onClick={() => setAddingUnreleased(true)}
              className="w-full mt-6 py-3 rounded-2xl border border-dashed border-navy/30 text-navy/70 type-caption flex items-center justify-center gap-2 hover:bg-navy/5 hover:text-navy transition-colors cursor-pointer"
            >
              <Plus size={16} />
              미발매곡 추가
            </button>
          )}

          {source.artistId && (
            /*
             * 곡 정보가 틀렸을 때 나갈 길. 여기가 곡을 들여다보는 유일한 화면이라
             * 틀린 걸 알아채는 것도 여기다 — 전곡 모드에만 두면 같이 소트하기로
             * 들어온 사람은 말할 데가 없다.
             */
            <button
              onClick={() => setReporting(true)}
              className="w-full mt-2 py-2.5 rounded-2xl text-navy/70 type-caption flex items-center justify-center gap-1.5 hover:text-navy hover:bg-navy/5 transition-colors cursor-pointer"
            >
              <AlertCircle size={13} />
              곡 정보가 잘못됐나요?
            </button>
          )}

          {/*
           * 방 이름은 선택이다. 대부분은 아티스트 이름 그대로 두면 되므로 입력칸을 늘 열어 두지
           * 않는다 — 빈 칸이 보이면 채워야 할 것 같아진다. 누른 사람에게만 연다.
           * 비워 두면 `title.trim() || source.title` 이 아티스트명을 그대로 쓴다.
           */}
          {namingRoom ? (
            <div className="mt-6">
              <label htmlFor="room-name" className="type-caption text-navy/70">
                방 이름 (선택)
              </label>
              <input
                id="room-name"
                autoFocus
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={40}
                placeholder={source.title}
                className="w-full mt-1.5 h-12 px-4 rounded-2xl bg-cream border border-navy/15 text-navy type-body placeholder:text-navy/50 focus:outline-2 focus:outline-offset-0 focus:outline-[var(--t-point-ink)]"
              />
              {/* 조사는 이름에 받침이 있느냐로 갈린다 — "'카더가든'로 보여요"가 나갔었다. */}
              <p className="type-caption text-navy/70 mt-1.5">
                비워 두면 &apos;{source.title}&apos;{josaOf(source.title, "로")} 보여요.
              </p>
            </div>
          ) : (
            <button
              onClick={() => setNamingRoom(true)}
              className="w-full mt-6 py-2.5 rounded-2xl text-navy/70 type-caption flex items-center justify-center gap-1.5 hover:text-navy hover:bg-navy/5 transition-colors cursor-pointer"
            >
              <Plus size={13} />
              방 이름 추가 (선택)
            </button>
          )}

          <DockSpacer />

          <div ref={dockRef} className="fixed bottom-0 left-0 right-0 z-[900] px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
            <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
              {chosen.length < 4 && <p className="type-caption text-point-ink text-center">최소 4곡이 필요해요</p>}
              <button onClick={make} disabled={busy || chosen.length < 4} className={`${primaryButton} w-full`}>
                {busy ? "만드는 중" : `${chosen.length}곡으로 링크 만들기`}
              </button>
            </div>
          </div>
        </>
      )}
      {/* 곡 정보 오류 제보. 어느 화면에서 왔는지 남겨 둬야 확인할 때 갈린다. */}
      <FeedbackModal
        isOpen={reporting}
        onClose={() => setReporting(false)}
        locale="ko"
        kind="data_error"
        contextLabel={artistSource?.artistName ?? undefined}
        context={
          artistSource
            ? { screen: "together", artist_id: artistSource.artistId, artist_name: artistSource.artistName }
            : undefined
        }
        onSubmitted={(msg) => showToast(msg)}
      />

      <UnreleasedDialog
        open={addingUnreleased}
        onClose={() => setAddingUnreleased(false)}
        artistId={artistSource?.artistId ?? null}
        artistName={artistSource?.artistName ?? ""}
        locale="ko"
        onAdded={addUnreleased}
      />

      {/* 이름을 묻는 창. 참여 화면과 같은 컴포넌트를 쓴다. */}
      <NicknameDialog
        open={askName}
        onClose={() => setAskName(false)}
        confirmLabel="이 이름으로 만들기"
        skipLabel="이름 없이 만들기"
        title="링크에 어떤 이름으로 보일까요?"
        desc="초대받은 사람이 이 이름을 봐요."
        onDone={async (name) => {
          setAskName(false);
          await create(name);
        }}
      />

      <Toast toast={toast} />
    </main>
  );
}
