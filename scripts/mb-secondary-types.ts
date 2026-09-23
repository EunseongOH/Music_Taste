/**
 * mb_release_group.secondary_types 백필.
 *
 * 왜 따로 두나: 보조 종류(Live, Compilation, Soundtrack, Remix, Spokenword ...)는
 * primary_type 만으로는 알 수 없다. 라이브 앨범도 베스트 앨범도 primary 는 그냥 'Album' 이다.
 * 라이브·베스트를 앨범 목록에서 빼려면 이 칸이 먼저 채워져야 한다.
 *
 * 왜 mb_resolve 를 다시 돌리지 않나: 그쪽은 아티스트마다 release 를 최대 500 개(5 쪽) 읽는다.
 * 여기서 필요한 건 발매그룹뿐이라 `release-group?artist=` 한 쪽이면 대부분 끝난다 —
 * 2,300 명이 약 40 분이고, mb_resolve 재실행이면 3 시간이 넘는다.
 *
 * 안전: 이 스크립트는 **secondary_types 만** 쓴다. 제목·종류·날짜는 건드리지 않는다.
 *       이미 채워진 아티스트는 건너뛰므로 중단했다 다시 돌려도 이어서 한다.
 *
 * 사용법:
 *   npx tsx --env-file=.env.local scripts/mb-secondary-types.ts
 *   LIMIT=50 ... 으로 일부만 (처음엔 적게 돌려 결과를 보고 늘린다)
 */
import { createAdminClient } from "../src/utils/supabase/admin";

const MB_UA = "Sortify/1.0 ( https://sortify.kr )";
const MB_DELAY_MS = 1200;              // MB 는 IP 당 평균 1 req/s 를 허용한다
const PAGE = 100;                      // release-group browse 한 쪽 최대치
const LIMIT = Number(process.env.LIMIT ?? 0);   // 0 = 전부

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mb(path: string, tries = 4): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { "User-Agent": MB_UA } });
    if (res.status === 503 || res.status === 429) {
      // 막히면 점점 더 기다린다. 무시하고 때리면 차단이 길어진다.
      await sleep(MB_DELAY_MS * (i + 2));
      continue;
    }
    await sleep(MB_DELAY_MS);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  }
  return null;
}

async function main() {
  const supabase = createAdminClient();

  /*
   * 아직 한 번도 안 채운 발매그룹이 있는 아티스트만 고른다(NULL = 안 받아옴, {} = 받아왔고 없음).
   * PostgREST 는 한 번에 1000 행까지만 준다 — `.limit(200000)` 을 써도 그렇다.
   * 처음에 그걸 놓쳐 2,300 명 중 43 명만 대상으로 잡혔다. range 로 끝까지 넘긴다.
   */
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("mb_release_group")
      .select("artist_mbid")
      .is("secondary_types", null)
      .order("artist_mbid")
      .range(from, from + 999);
    if (error) throw new Error(`대상 조회 실패: ${error.message}`);
    for (const r of data ?? []) if (r.artist_mbid) seen.add(r.artist_mbid as string);
    if (!data || data.length < 1000) break;
  }

  let artists = [...seen];
  const total = artists.length;
  if (LIMIT) artists = artists.slice(0, LIMIT);

  console.log(`채울 아티스트 ${artists.length}명 (전체 ${total}명) · 예상 ${Math.ceil(artists.length * 1.3 / 60)}분`);

  let done = 0, wrote = 0, missed = 0;
  for (const mbid of artists) {
    const rows: { mbid: string; secondary_types: string[] }[] = [];
    for (let offset = 0; offset < 1000; offset += PAGE) {
      const page = await mb(`release-group?artist=${mbid}&limit=${PAGE}&offset=${offset}&fmt=json`);
      if (!page) { missed++; break; }
      const groups = (page["release-groups"] ?? []) as Record<string, unknown>[];
      for (const g of groups) {
        if (!g.id) continue;
        rows.push({ mbid: String(g.id), secondary_types: (g["secondary-types"] as string[]) ?? [] });
      }
      const count = Number(page["release-group-count"] ?? 0);
      if (groups.length === 0 || offset + groups.length >= count) break;
    }

    if (rows.length) {
      /*
       * upsert 가 아니라 update 로 한 줄씩 쓴다. upsert 는 없는 칸을 NULL 로 덮어
       * 제목·종류·날짜를 날린다 — 이 스크립트는 secondary_types 만 만져야 한다.
       */
      for (let i = 0; i < rows.length; i += 200) {
        await Promise.all(rows.slice(i, i + 200).map((r) =>
          supabase.from("mb_release_group").update({ secondary_types: r.secondary_types }).eq("mbid", r.mbid)));
      }
      wrote += rows.length;
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${artists.length}명 · 발매그룹 ${wrote}건${missed ? ` · 실패 ${missed}` : ""}`);
  }

  console.log(`\n끝. 아티스트 ${done}명 · 발매그룹 ${wrote}건 채움${missed ? ` · 응답 실패 ${missed}건` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
