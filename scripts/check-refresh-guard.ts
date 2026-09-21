// 야간 갱신이 쿼터 가드를 지키는지 확인한다. Spotify·DB 를 건드리지 않는다.
//
// 바깥과 닿는 부분(gate·block·fetchArtist·save)을 전부 가짜로 바꿔서 세 가지만 본다.
//   1. 차단 중이면 한 번도 안 부른다
//   2. 부를 때마다 장부에 적는다
//   3. 429 를 받으면 차단을 남기고 그 자리에서 멈춘다 (재시도·다음 ID 없음)
//
// 사용: npx tsx scripts/check-refresh-guard.ts

import { refreshArtists } from "./refresh-artist-cache";

const artists = [1, 2, 3, 4, 5].map((n) => ({ id: `id${n}`, name: `아티스트${n}` }));

async function main() {
  // 1. 차단 중 — 한 번도 부르면 안 된다
  {
    let fetched = 0, gated = 0;
    const r = await refreshArtists({
      artists, gapMs: 0,
      gate: async () => { gated++; return false; },
      block: async () => {},
      fetchArtist: async () => { fetched++; return { status: 200, body: {} }; },
      save: async () => {},
    });
    if (fetched !== 0) throw new Error(`실패: 차단 중인데 ${fetched}번 불렀다`);
    if (r.calls !== 0) throw new Error(`실패: 차단 중인데 호출 ${r.calls} 로 셌다`);
    if (gated !== 1) throw new Error(`실패: 차단이면 첫 판정에서 멈춰야 하는데 ${gated}번 물었다`);
    console.log(`[O] 차단 중 — Spotify 0콜, 첫 판정에서 종료 (${r.stopped})`);
  }

  // 2. 정상 — 부른 횟수만큼 장부에 적는다
  {
    let gated = 0;
    const r = await refreshArtists({
      artists, gapMs: 0,
      gate: async () => { gated++; return true; },
      block: async () => {},
      fetchArtist: async () => ({ status: 200, body: { id: "x", name: "x", images: [] } }),
      save: async () => {},
    });
    if (gated !== artists.length) throw new Error(`실패: ${artists.length}번 부르는데 장부 기록 ${gated}건`);
    if (r.calls !== artists.length) throw new Error(`실패: 호출 수가 ${r.calls}`);
    console.log(`[O] 정상 — 호출 ${r.calls}건마다 장부 기록 ${gated}건`);
  }

  // 3. 429 — 차단을 남기고 그 자리에서 멈춘다
  {
    let fetched = 0, blockedSecs: number | null = null;
    const r = await refreshArtists({
      artists, gapMs: 0,
      gate: async () => true,
      block: async (secs) => { blockedSecs = secs; },
      // 두 번째에서 429
      fetchArtist: async () => {
        fetched++;
        return fetched === 2 ? { status: 429, retryAfter: 120 } : { status: 200, body: { id: "x", name: "x" } };
      },
      save: async () => {},
    });
    if (blockedSecs !== 120) throw new Error(`실패: 차단을 안 남겼다 (${blockedSecs})`);
    if (fetched !== 2) throw new Error(`실패: 429 뒤에도 ${fetched - 2}번 더 불렀다`);
    if (r.ok !== 1) throw new Error(`실패: 429 전 성공이 ${r.ok}`);
    console.log(`[O] 429 — Retry-After ${blockedSecs}초 차단 기록, 즉시 중단 (${r.stopped})`);
  }

  console.log("통과: 야간 갱신이 화면 코드와 같은 장부·차단 규칙을 지킨다");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
