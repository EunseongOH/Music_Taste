// 자체 음악 DB 를 CSV 로 내려받는다. Spotify 호출 0회.
//
// 왜: Supabase 무료 한도(500MB)에 걸려 테이블을 지워야 하더라도 데이터는 남겨야 한다.
//     여기서 나온 CSV 는 헤더가 DB 컬럼명 그대로라 그대로 다시 넣을 수 있다 (엑셀용 BOM 을 붙이지 않는 이유).
//
// 사용: npx tsx --env-file=.env.local scripts/backup-catalog.ts [출력 폴더]
//   기본 출력: C:/Users/User/sortify-exports/db-backup-<날짜>/

import { mkdirSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/utils/supabase/admin";

const sb = createAdminClient();
const today = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `C:/Users/User/sortify-exports/db-backup-${today}`;

/** 테이블 -> 정렬 키 (페이지를 나눠 읽을 때 순서가 흔들리지 않게 한다) */
const TABLES: Record<string, string[]> = {
  // MusicBrainz (CC0)
  mb_artist: ["mbid"],
  mb_release_group: ["mbid"],
  mb_album_release: ["spotify_album_id"],
  mb_release_track: ["release_mbid", "disc", "position"],
  mb_album_title_match: ["spotify_album_id"],
  mb_spotify_map: ["spotify_id", "entity"],
  // Discogs 월간 덤프 (CC0)
  mb_artist_discogs: ["mbid", "discogs_artist_id"],
  discogs_release: ["release_id"],
  discogs_track: ["release_id", "idx"],
  discogs_album_match: ["spotify_album_id"],
  // Deezer (비상업 전제 — 수익화 시 지워야 하는 테이블. 백업도 따로 보관한다)
  deezer_artist: ["deezer_artist_id"],
  deezer_album: ["deezer_album_id"],
  deezer_track: ["deezer_album_id", "idx"],
  deezer_album_match: ["spotify_album_id"],
  // 운영
  explore_genre_picks: ["genre", "rank"],
  prelaunch_targets: ["spotify_id"],
};

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function dump(table: string, order: string[]) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select("*");
    for (const c of order) q = q.order(c);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  writeFileSync(`${OUT}/${table}.csv`, csv + "\r\n", "utf8");
  return rows.length;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const lines: string[] = [`자체 음악 DB 백업 · ${new Date().toLocaleString("ko-KR")}`, ""];
  let total = 0;
  for (const [table, order] of Object.entries(TABLES)) {
    try {
      const n = await dump(table, order);
      total += n;
      lines.push(`${table.padEnd(24)} ${String(n).padStart(8)} 행`);
      console.log(`${table} ${n}`);
    } catch (e) {
      lines.push(`${table.padEnd(24)} 실패 — ${(e as Error).message}`);
      console.warn(`${table} 실패:`, (e as Error).message);
    }
  }
  lines.push("", `합계 ${total} 행`, "",
    "되돌리는 법: 헤더가 DB 컬럼명 그대로다. Supabase 대시보드의 CSV 가져오기나 psql \\copy 로 그대로 넣는다.",
    "Deezer 표(deezer_*)는 비상업 전제 데이터다. 광고 등 수익화를 시작하면 서비스에서 빼야 한다.");
  writeFileSync(`${OUT}/0_요약.txt`, lines.join("\r\n"), "utf8");
  console.log(`\n${OUT} 에 저장했다. 합계 ${total} 행`);
}

main().catch((e) => { console.error(e); process.exit(1); });
