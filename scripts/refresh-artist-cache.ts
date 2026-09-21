// 아티스트 캐시(이름·사진)를 ID 로 갱신한다. 검색은 쓰지 않는다.
//
// 왜: 기존 워밍(warmup_artists.ts)은 하드코딩된 이름 목록을 /v1/search 로 찾는다. 이미 DB 에
//     있는 아티스트를 이름으로 다시 찾는 셈이라 검색 쿼터만 태운다 (오늘 /v1/search 164콜).
//     ID 를 아는 아티스트는 /v1/artists/{id} 로 바로 갱신하면 된다. 검색 예산을 안 건드린다.
//     배치(/v1/artists?ids=)는 2026-09-21 실측 403 이라 1명당 1콜이다.
//
// TTL 이 90일이라 2,829팀을 계속 최신으로 두는 데 하루 32명이면 된다. 기본값을 40으로 둔다.
//
// 사용: npx tsx --env-file=.env.local scripts/refresh-artist-cache.ts [명수]

import { createAdminClient } from "../src/utils/supabase/admin";
import { getSpotifyAccessToken } from "../src/utils/spotify";

const sb = createAdminClient();
const TTL_DAYS = Number(process.env.SPOTIFY_ARTIST_TTL_DAYS ?? 90);
const GAP_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limit = Number(process.argv[2] ?? 40);
  // 만료가 가까운 순서로 집는다
  const { data: rows, error } = await sb.from("spotify_cache_artists")
    .select("id, name, expires_at").eq("locale", "ko")
    .order("expires_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  console.log(`갱신 대상 ${rows?.length ?? 0}명 (TTL ${TTL_DAYS}일)`);

  const token = await getSpotifyAccessToken();
  let ok = 0, gone = 0, stop = false;
  for (const r of rows ?? []) {
    if (stop) break;
    await sleep(GAP_MS);
    const res = await fetch(`https://api.spotify.com/v1/artists/${r.id}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429) {
      console.log(`  한도에 걸렸다 (Retry-After ${res.headers.get("retry-after") ?? "?"}). 남은 건 다음 실행에서 이어 한다.`);
      stop = true; break;
    }
    if (res.status === 404) { gone++; continue; }          // 지워진 아티스트. 캐시는 자연 만료에 맡긴다
    if (!res.ok) { console.warn(`  ${r.name} ${res.status}`); continue; }
    const a: any = await res.json();
    const exp = new Date();
    exp.setDate(exp.getDate() + TTL_DAYS);
    // genres 는 건드리지 않는다 — 우리가 고른 16종 라벨이 들어 있다
    const { error: e2 } = await sb.from("spotify_cache_artists").upsert({
      id: a.id, locale: "ko", name: a.name, images: a.images ?? [],
      popularity: a.popularity ?? 0, expires_at: exp.toISOString(),
    }, { onConflict: "id,locale" });
    if (e2) throw new Error(e2.message);
    ok++;
  }
  console.log(`완료 · 갱신 ${ok} · 사라진 아티스트 ${gone} · Spotify 호출 ${ok + gone}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
