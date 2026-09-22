// 아티스트 캐시(이름·사진)를 ID 로 갱신한다. 검색은 쓰지 않는다.
//
// 왜: 기존 워밍(warmup_artists.ts)은 하드코딩된 이름 목록을 /v1/search 로 찾는다. 이미 DB 에
//     있는 아티스트를 이름으로 다시 찾는 셈이라 검색 쿼터만 태운다.
//     ID 를 아는 아티스트는 /v1/artists/{id} 로 바로 갱신하면 된다. 검색 예산을 안 건드린다.
//     배치(/v1/artists?ids=)는 2026-09-21 실측 403 이라 1명당 1콜이다.
//
// 쿼터: 화면 코드와 같은 장부(spotify_endpoint_quota)·같은 RPC 를 쓴다.
//       처음 만들 때 fetch 를 직접 불러서 이 호출들이 장부에 안 남았다 (2026-09-22 확인:
//       /v1/artists/{id} 의 마지막 기록이 9/17 인데 그 뒤로 실제 호출이 있었다).
//       계측을 비켜 가면 그 엔드포인트의 상한을 관찰할 수 없고, 429 를 맞아도 차단이 기록되지
//       않아 다음 날 그대로 또 때린다. 가드를 지나지 않는 Spotify 호출 경로를 남기지 않는다.
//
// TTL 이 90일이라 2,829팀을 계속 최신으로 두는 데 하루 32명이면 된다. 기본값을 40으로 둔다.
//
// 사용: npx tsx --env-file=.env.local scripts/refresh-artist-cache.ts [명수]
// 확인: npx tsx scripts/check-refresh-guard.ts   (Spotify·DB 를 건드리지 않는다)

import { createAdminClient } from "../src/utils/supabase/admin";
import { getSpotifyAccessToken } from "../src/utils/spotify";

export const ARTIST_ENDPOINT = "/v1/artists/{id}";
const TTL_DAYS = Number(process.env.SPOTIFY_ARTIST_TTL_DAYS ?? 90);
const GAP_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Deps {
  /** 부르기 직전에 장부에 적고 차단 여부를 받는다. false 면 부르면 안 된다 */
  gate: () => Promise<boolean>;
  /** 429 를 받았을 때 차단을 기록한다 */
  block: (secs: number) => Promise<void>;
  /** 아티스트 하나를 받아 온다 */
  fetchArtist: (id: string) => Promise<{ status: number; retryAfter?: number; body?: any }>;
  /** 갱신 대상 */
  artists: { id: string; name: string }[];
  /** 받아온 내용을 저장한다 */
  save: (a: any) => Promise<void>;
  /** 호출 간격. 확인할 때는 0 을 넣는다 */
  gapMs?: number;
}

export interface Result { ok: number; gone: number; failed: number; calls: number; stopped: string | null }

/**
 * 갱신 본체. 바깥과 닿는 부분을 전부 인자로 받는다 —
 * 그래야 Spotify 를 실제로 때리지 않고 차단·429 갈래를 확인할 수 있다.
 */
export async function refreshArtists(d: Deps): Promise<Result> {
  const r: Result = { ok: 0, gone: 0, failed: 0, calls: 0, stopped: null };
  for (const a of d.artists) {
    // 차단 중이면 한 번도 부르지 않고 끝낸다. 장부 기록도 gate 가 함께 한다
    if (!(await d.gate())) {
      r.stopped = "차단 중이라 부르지 않았다";
      break;
    }
    r.calls++;
    const res = await d.fetchArtist(a.id);
    if (res.status === 429) {
      // 그 자리에서 멈춘다. 재시도도 다음 ID 도 없다 — 이미 한도를 넘긴 상태다
      await d.block(res.retryAfter ?? 3600);
      r.stopped = `429 (Retry-After ${res.retryAfter ?? "?"}) — 차단을 기록하고 멈췄다`;
      break;
    }
    if (res.status === 404) { r.gone++; continue; }   // 지워진 아티스트. 캐시는 자연 만료에 맡긴다
    if (res.status !== 200 || !res.body) { r.failed++; continue; }
    await d.save(res.body);
    r.ok++;
    if (d.gapMs) await sleep(d.gapMs);
  }
  return r;
}

async function main() {
  // 워크플로가 입력을 안 주면 빈 문자열이 올 수 있다. Number("") 는 0 이라 한 명도 안 돈다.
  const limit = Number(process.argv[2]) || 40;

  // 어떤 비밀값이 비었는지 이름만 먼저 찍는다 (값은 절대 찍지 않는다).
  // 실패해도 Actions 로그 첫 줄만 보면 원인을 안다 — 2026-09-22 에 3초 만에 죽은 원인을
  // 로그를 못 읽어 추정만 해야 했다.
  const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"];
  const missing = need.filter((k) => !process.env[k]);
  console.log("env 확인: " + need.map((k) => `${k} ${process.env[k] ? "ok" : "MISSING"}`).join(" · "));
  if (missing.length) {
    console.error(`비어 있는 값: ${missing.join(", ")}`);
    console.error("리포 Settings > Secrets and variables > Actions 에 등록해야 한다.");
    console.error("NEXT_PUBLIC_SUPABASE_URL 은 이름에 PUBLIC 이 붙어도 Actions 시크릿으로 따로 넣어야 한다 (Vercel 환경변수와 별개).");
    process.exit(1);
  }

  const sb = createAdminClient();

  // 만료가 가까운 순서로 집는다
  const { data: rows, error } = await sb.from("spotify_cache_artists")
    .select("id, name, expires_at").eq("locale", "ko")
    .order("expires_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  console.log(`갱신 대상 ${rows?.length ?? 0}명 (TTL ${TTL_DAYS}일)`);

  const token = await getSpotifyAccessToken();

  const r = await refreshArtists({
    artists: (rows ?? []).map((x) => ({ id: x.id, name: x.name })),
    gapMs: GAP_MS,
    // 화면 코드가 쓰는 것과 같은 RPC 다. 차단이면 false, 아니면 calls_today 를 1 올리고 true
    gate: async () => {
      const { data, error: e } = await sb.rpc("spotify_endpoint_gate", { ep: ARTIST_ENDPOINT });
      if (e) return true;          // 계측이 고장 났다고 작업을 막지는 않는다 (화면 코드와 같은 판단)
      return data !== false;
    },
    block: async (secs) => { await sb.rpc("spotify_block_endpoint", { ep: ARTIST_ENDPOINT, secs }); },
    fetchArtist: async (id) => {
      const res = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
      });
      const retryAfter = Number(res.headers.get("retry-after") ?? 0) || undefined;
      if (res.status !== 200) return { status: res.status, retryAfter };
      return { status: 200, retryAfter, body: await res.json() };
    },
    save: async (a: any) => {
      const exp = new Date();
      exp.setDate(exp.getDate() + TTL_DAYS);
      // genres 는 건드리지 않는다 — 우리가 고른 16종 라벨이 들어 있다.
      // cached_at 은 반드시 같이 쓴다. 기본값 now() 는 INSERT 때만 먹어서, 갱신만 하면
      // "마지막으로 받아 온 시각"이 첫 수집 때에 멈춰 있다. 2026-09-22 실행에서 실제로
      // expires_at 은 +90일로 갱신됐는데 cached_at 은 하루 전 그대로였다 — 그 값으로
      // "작업이 돌았나"를 확인하면 성공을 실패로 읽는다.
      const { error: e2 } = await sb.from("spotify_cache_artists").upsert({
        id: a.id, locale: "ko", name: a.name, images: a.images ?? [],
        popularity: a.popularity ?? 0,
        cached_at: new Date().toISOString(), expires_at: exp.toISOString(),
      }, { onConflict: "id,locale" });
      if (e2) throw new Error(e2.message);
    },
  });

  if (r.stopped) console.log(`  ${r.stopped}`);
  console.log(`완료 · 갱신 ${r.ok} · 사라진 아티스트 ${r.gone} · 실패 ${r.failed} · Spotify 호출 ${r.calls}`);
}

// 확인 스크립트가 import 할 때는 main 이 돌면 안 된다
if (/refresh-artist-cache\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
