"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { safeLocalStorage, safeSessionStorage } from "@/utils/storage";
import { normalizeRanking, type RankedTrack } from "@/utils/ranking";
import { createChallenge } from "@/utils/togetherDb";
import * as platform from "@/utils/platform";
import { Cover, EmptyState, SectionTitle, Toast, primaryButton, secondaryButton, useToast } from "@/components/space/SpaceUI";

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

interface Source {
  key: string;
  label: string;
  /** 링크 이름 기본값 */
  title: string;
  artistName: string | null;
  tracks: RankedTrack[];
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
  const [artistSource, setArtistSource] = useState<Source | null>(null);
  const [cards, setCards] = useState<SavedRow[] | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [madeCode, setMadeCode] = useState<string | null>(null);

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
        .order("created_at", { ascending: false })
        .limit(30);
      if (alive) setCards((data ?? []) as SavedRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // 처음 열 때 인기 아티스트 몇 명을 보여 준다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/together/catalog");
      const json = (await res.json()) as { artists?: CatalogArtist[] };
      if (alive) setArtists(json.artists ?? []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const searchArtists = async () => {
    setArtistBusy(true);
    const res = await fetch(`/api/together/catalog?q=${encodeURIComponent(artistQuery.trim())}`);
    const json = (await res.json()) as { artists?: CatalogArtist[] };
    setArtists(json.artists ?? []);
    setArtistBusy(false);
  };

  const pickArtist = async (artist: CatalogArtist) => {
    setArtistBusy(true);
    const res = await fetch(`/api/together/catalog?artistId=${encodeURIComponent(artist.id)}`);
    const json = (await res.json()) as { tracks?: RankedTrack[] };
    const tracks = json.tracks ?? [];
    setArtistBusy(false);
    if (tracks.length < 4) {
      showToast("이 아티스트는 아직 담긴 곡이 적어요. 다른 아티스트를 찾아 주세요.", "error");
      return;
    }
    const next: Source = { key: `artist:${artist.id}`, label: artist.name, title: artist.name, artistName: artist.name, tracks, resultId: null };
    setArtistSource(next);
    setSourceKey(next.key);
    setOff(new Set());
    setTitle(artist.name);
  };

  const sources: Source[] = useMemo(() => {
    const list: Source[] = [];
    if (artistSource) list.push(artistSource);
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
  }, [picked, cards, artistSource]);

  const source = sources.find((s) => s.key === sourceKey) ?? null;
  const chosen = useMemo(() => (source ? source.tracks.filter((t) => !off.has(t.id)) : []), [source, off]);

  const choose = (next: Source) => {
    setSourceKey(next.key);
    setOff(new Set());
    setTitle(next.title);
  };

  const make = async () => {
    if (!source || chosen.length < 4) return;
    setBusy(true);
    const made = await createChallenge({
      creatorId: user?.id ?? null,
      creatorNickname: user?.user_metadata?.nickname ?? (nickname.trim() || null),
      artistName: source.artistName,
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
          옆 사람에게 코드를 알려 주거나 링크를 보내세요.{"\n"}같은 곡으로 줄 세우면 서로의 일치율이 보여요.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2 py-6 rounded-3xl bg-navy/5">
          <span className="type-caption text-navy/70">코드</span>
          <span className="font-num text-[40px] leading-none font-extrabold tracking-[0.12em] text-navy">{madeCode}</span>
          <span className="type-caption text-navy/70">같이 소트하기 첫 화면에서 입력</span>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={async () => {
              const shared = await platform.share({ title: "같이 소트하기", text: `${title} — 같은 곡으로 줄 세워 봐요`, url: link });
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
            나도 줄 세우러 가기
          </button>
        </div>
        <Toast toast={toast} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] flex flex-col px-6 pt-10 pb-32">
      <h1 className="type-title-1 text-navy">같이 소트하기 만들기</h1>
      <p className="type-body text-navy/70 mt-2 break-keep">
        곡만 정하면 돼요. 소트를 끝내지 않아도 링크를 만들 수 있어요.
      </p>

      <SectionTitle title="아티스트에서 고르기" className="mt-8 mb-2" />
      <p className="type-caption text-navy/70 mb-3 break-keep">
        소트를 하지 않아도 돼요. 아티스트를 고르면 전곡이 들어오고, 빼고 싶은 곡만 끄면 링크가 나와요.
      </p>
      <div className="flex gap-2">
        <input
          id="together-artist"
          value={artistQuery}
          onChange={(e) => setArtistQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchArtists();
          }}
          placeholder="아티스트 이름"
          className="flex-1 h-11 px-3 rounded-xl bg-white border border-navy/15 type-body text-navy"
        />
        <button onClick={searchArtists} disabled={artistBusy} className={`${secondaryButton} px-5`}>
          찾기
        </button>
      </div>
      {artists !== null && (
        <ul className="flex flex-wrap gap-2 mt-3">
          {artists.length === 0 && <li className="type-caption text-navy/70">찾는 아티스트가 아직 준비되지 않았어요.</li>}
          {artists.map((artist) => (
            <li key={artist.id}>
              <button
                onClick={() => pickArtist(artist)}
                disabled={artistBusy}
                className={`h-9 pl-1 pr-3 rounded-full flex items-center gap-2 type-caption cursor-pointer ${
                  artistSource?.key === `artist:${artist.id}` ? "bg-navy text-cream" : "bg-navy/5 text-navy"
                }`}
              >
                <Cover src={artist.image} alt={artist.name} size={28} />
                {artist.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {sources.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="가져올 곡이 없어요"
            desc="곡 고르기에서 4곡 이상 담거나, 취향표를 저장하면 그 곡으로 만들 수 있어요."
            action={
              <button onClick={() => router.push("/")} className={primaryButton}>
                곡 고르러 가기
              </button>
            }
          />
        </div>
      ) : (
        <>
          <SectionTitle title="어떤 곡으로 할까요" className="mt-8 mb-2" />
          <ul className="flex flex-col divide-y divide-navy/10">
            {sources.map((item) => (
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

      {source && (
        <>
          <SectionTitle title="곡 고르기" count={chosen.length} className="mt-8 mb-3" />
          <label className="flex flex-col gap-1 mb-3">
            <span className="type-caption text-navy/70">링크에 보일 이름</span>
            <input
              id="together-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
              className="h-11 px-3 rounded-xl bg-white border border-navy/15 type-body text-navy"
            />
          </label>
          {!user && (
            <label className="flex flex-col gap-1 mb-4">
              <span className="type-caption text-navy/70">만든 사람 (안 써도 돼요)</span>
              <input
                id="together-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                placeholder="리스너"
                className="h-11 px-3 rounded-xl bg-white border border-navy/15 type-body text-navy"
              />
            </label>
          )}

          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setOff(new Set())} className="h-8 px-3 rounded-full bg-navy/5 text-navy type-caption cursor-pointer">
              전부 켜기
            </button>
            <button
              onClick={() => setOff(new Set(source.tracks.map((t) => t.id)))}
              className="h-8 px-3 rounded-full bg-navy/5 text-navy type-caption cursor-pointer"
            >
              전부 끄기
            </button>
            {chosen.length > 48 && <span className="type-caption text-point-ink">곡이 많으면 줄 세우는 데 오래 걸려요</span>}
          </div>

          <ul className="flex flex-col divide-y divide-navy/10">
            {source.tracks.map((track) => {
              const isOff = off.has(track.id);
              return (
                <li key={track.id} className="flex items-center gap-3 py-2.5">
                  <Cover src={track.albumImage} alt={track.title} size={36} />
                  <span className={`flex-1 min-w-0 ${isOff ? "opacity-40" : ""}`}>
                    <span className="block type-body-strong text-navy truncate">{track.title}</span>
                    <span className="block type-caption text-navy/70 truncate">{track.artistName}</span>
                  </span>
                  <button
                    onClick={() =>
                      setOff((prev) => {
                        const next = new Set(prev);
                        if (next.has(track.id)) next.delete(track.id);
                        else next.add(track.id);
                        return next;
                      })
                    }
                    className={`h-8 px-3 rounded-full type-caption cursor-pointer ${isOff ? "bg-navy/5 text-navy/70" : "bg-navy text-cream"}`}
                  >
                    {isOff ? "뺐어요" : "넣음"}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex justify-center bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pointer-events-none">
            <div className="w-full max-w-[382px] pointer-events-auto flex flex-col gap-2">
              {chosen.length < 4 && <p className="type-caption text-point-ink text-center">최소 4곡이 필요해요</p>}
              <button onClick={make} disabled={busy || chosen.length < 4} className={`${primaryButton} w-full`}>
                {busy ? "만드는 중" : `${chosen.length}곡으로 링크 만들기`}
              </button>
            </div>
          </div>
        </>
      )}
      <Toast toast={toast} />
    </main>
  );
}
