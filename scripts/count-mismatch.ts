// 머리말의 "N Tracks" 와 월드컵에 올라가는 곡 수가 얼마나 어긋나는지 잰다. Spotify 호출 0회.
//
// 머리말은 앨범이 말하는 곡 수(total_tracks)를 그냥 더했고,
// 월드컵은 같은 곡을 한 번만 세는 선택 결과(songKey)를 쓴다. 그 차이를 실제 데이터로 확인한다.
//
// 사용: npx tsx --env-file=.env.local scripts/count-mismatch.ts [아티스트수]

import { createClient } from "@supabase/supabase-js";
import { getDbArtistAlbums, getDbTracksByAlbum } from "../src/utils/dbCatalog";
import { songKey } from "../src/utils/songKey";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const N = Number(process.argv[2] ?? 40);
  // 뷰(artist_completeness)는 전체 계산이라 타임아웃이 난다. 스냅샷 테이블을 쓴다
  const { data, error } = await sb.from("artist_serve_snapshot")
    .select("spotify_id, name, name_ko, tracks_servable")
    .gt("tracks_servable", 0).order("tracks_servable", { ascending: false }).limit(N);
  if (error) throw new Error(error.message);

  let bad = 0, sumDecl = 0, sumReal = 0;
  for (const a of data ?? []) {
    const albums = await getDbArtistAlbums(a.spotify_id);
    if (!albums.length) continue;
    const tracks = await getDbTracksByAlbum(albums.map((x) => x.id));
    const name = a.name_ko || a.name || "";
    const declared = albums.reduce((n, x) => n + (x.total_tracks || tracks[x.id]?.length || 0), 0);
    const keys = new Set<string>();
    for (const x of albums) for (const t of tracks[x.id] ?? []) keys.add(songKey(name, t.name));
    sumDecl += declared; sumReal += keys.size;
    if (declared !== keys.size) {
      bad++;
      console.log(`${name.padEnd(18)} 머리말 ${String(declared).padStart(4)} → 실제 ${String(keys.size).padStart(4)}  (${keys.size - declared})`);
    }
  }
  console.log(`\n${data?.length ?? 0}팀 중 ${bad}팀이 어긋난다. 합계 ${sumDecl} → ${sumReal} (${sumReal - sumDecl})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
