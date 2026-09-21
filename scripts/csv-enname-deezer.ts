// 사람이 적어 준 영문 활동명으로 Deezer 에서 아티스트를 찾는다. Spotify 호출 0회.
//
// 왜: 로마자 변환만으로는 외래어 이름을 못 맞춘다. 실리카겔은 "silrikagel" 로 변환되지만
//     실제 표기는 "Silica Gel" 이고, 혁오는 "hyeoko" 가 되지만 "HYUKOH" 다. 규칙으로는 못 만든다.
//     사용자가 328명의 공식 영문 활동명을 CSV 로 줬으니 그 표기로 다시 찾는다.
//
// 확인 방법: 이름이 같은 Deezer 아티스트를 찾고, 그쪽 앨범 제목이 우리 앨범 제목과
//            하나라도 겹쳐야 확정한다 (동명이인 방지). 우리 쪽 앨범이 아예 없으면 이름만으로 보류 등록.
//            확정되면 "아직 트랙을 못 받은 발매그룹" 중 몇 장을 Deezer 가 덮는지 세어 본다.
//
// 사용: npx tsx --env-file=.env.local scripts/csv-enname-deezer.ts [csv경로] [--go]
//       --go 없이 돌리면 무엇을 연결할지만 보여준다. 실제 앨범·트랙 수집은 deezer-catalog.ts albums 가 한다.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createAdminClient } from "../src/utils/supabase/admin";
import { searchNames } from "../src/utils/romanize";

const sb = createAdminClient();
const CSV = process.argv[2]?.startsWith("--")
  ? "C:/Users/User/Downloads/아티스트_트랙리스트_우선확보_328명_영문활동명추가_2026-09-21.csv"
  : (process.argv[2] ?? "C:/Users/User/Downloads/아티스트_트랙리스트_우선확보_328명_영문활동명추가_2026-09-21.csv");
const GO = process.argv.includes("--go");
const OUT = "C:/Users/User/sortify-exports/영문명_Deezer_검증.csv";

const GAP_MS = 260;                     // 초당 4회 이하
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const normAlbum = (s: string) => (s || "").normalize("NFKC").toLowerCase()
  .replace(/\s*[([][^)\]]*(deluxe|edition|remaster|remastered|version|ver\.|repackage|anniversary|expanded|bonus)[^)\]]*[)\]]/gi, "")
  .replace(/[^\p{L}\p{N}]/gu, "");

let calls = 0;
async function dz(path: string): Promise<any> {
  for (let i = 0; i < 6; i++) {
    await sleep(GAP_MS);
    calls++;
    let r: Response;
    try { r = await fetch("https://api.deezer.com" + path, { signal: AbortSignal.timeout(20000) }); }
    catch { await sleep(1000); continue; }
    if (!r.ok) { await sleep(1000); continue; }
    const j = await r.json();
    if (j?.error?.code === 4) { await sleep(5000); continue; }   // 한도
    if (j?.error) return null;
    return j;
  }
  return null;
}

async function fetchAll<T>(page: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await page(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** 따옴표를 지키는 최소 CSV 파서 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

interface Row { spotify_id: string; ko: string; en: string; show: string; grade: string; cat: string; gap: number }

function loadRows(): Row[] {
  const rows = parseCsv(readFileSync(CSV, "utf8").replace(/^\uFEFF/, ""));
  const head = rows.findIndex((r) => r.includes("Spotify ID"));
  if (head < 0) throw new Error("머리글 행(Spotify ID)을 못 찾았다");
  const col = (n: string) => rows[head].indexOf(n);
  const [cId, cKo, cEn, cShow, cGrade, cCat, cGap] =
    ["Spotify ID", "원본 아티스트명", "공식 영문 활동명", "추천 표시명", "팬수요 등급", "카테고리", "미수집 앨범"].map(col);
  return rows.slice(head + 1)
    .filter((r) => r[cId]?.trim())
    .map((r) => ({
      spotify_id: r[cId].trim(), ko: r[cKo]?.trim() ?? "", en: r[cEn]?.trim() ?? "",
      show: r[cShow]?.trim() ?? "", grade: r[cGrade]?.trim() ?? "", cat: r[cCat]?.trim() ?? "",
      gap: Number(r[cGap] ?? 0) || 0,
    }));
}

async function main() {
  const csv = loadRows();
  console.log(`CSV ${csv.length}명${GO ? "" : " — 확인만 한다 (--go 로 실제 등록)"}`);

  const ids = csv.map((r) => r.spotify_id);
  // spotify_id -> mbid
  const mbidOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from("mb_spotify_map").select("spotify_id, mbid, confidence")
      .eq("entity", "artist").in("spotify_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const m of data ?? []) mbidOf.set(m.spotify_id, m.mbid);
  }
  const mbids = [...new Set([...mbidOf.values()])];

  // 우리 쪽 발매그룹 제목과, 그중 아직 트랙을 못 받은 것
  const titlesOf = new Map<string, Map<string, string>>();   // mbid -> 정규화제목 -> rg_mbid
  const rgArtist = new Map<string, string>();                // rg_mbid -> artist_mbid
  for (let i = 0; i < mbids.length; i += 100) {
    const rows = await fetchAll<any>((f, t) => sb.from("mb_release_group")
      .select("mbid, artist_mbid, title").in("artist_mbid", mbids.slice(i, i + 100)).order("mbid").range(f, t));
    for (const r of rows) {
      const m = titlesOf.get(r.artist_mbid) ?? new Map<string, string>();
      m.set(normAlbum(r.title), r.mbid);
      titlesOf.set(r.artist_mbid, m);
      rgArtist.set(r.mbid, r.artist_mbid);
    }
  }
  const allRg = [...rgArtist.keys()];
  const filled = new Set<string>();
  for (let i = 0; i < allRg.length; i += 200) {
    const { data, error } = await sb.from("mb_rg_release").select("release_group_mbid, tracks_filled_at")
      .in("release_group_mbid", allRg.slice(i, i + 200)).not("tracks_filled_at", "is", null);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) filled.add(r.release_group_mbid);
  }

  // 이미 연결된 Deezer 아티스트
  const dzOf = new Map<string, any>();
  for (let i = 0; i < mbids.length; i += 200) {
    const { data } = await sb.from("deezer_artist").select("deezer_artist_id, mbid, name, matched_by")
      .in("mbid", mbids.slice(i, i + 200));
    for (const d of data ?? []) if (!dzOf.has(d.mbid)) dzOf.set(d.mbid, d);
  }

  const out: any[] = [];
  let newFound = 0, already = 0, noMbid = 0, notFound = 0, noCatalog = 0, coverSum = 0, pendSum = 0;

  for (const [i, r] of csv.entries()) {
    if (i % 20 === 0) console.log(`  ${i}/${csv.length} 신규 ${newFound} · 기존 ${already} · 카탈로그없음 ${noCatalog} · 못찾음 ${notFound} · 호출 ${calls} ${new Date().toLocaleTimeString()}`);
    const mbid = mbidOf.get(r.spotify_id);
    const base = { 카테고리: r.cat, 등급: r.grade, 아티스트: r.ko, 영문명: r.en, spotify_id: r.spotify_id };
    if (!mbid) { noMbid++; out.push({ ...base, 결과: "MusicBrainz 연결 없음", Deezer: "", 덮는앨범: 0, 남은앨범: r.gap }); continue; }

    const ours = titlesOf.get(mbid) ?? new Map<string, string>();
    const pending = [...ours].filter(([, rg]) => !filled.has(rg));
    pendSum += pending.length;

    let picked: any = dzOf.get(mbid) ?? null;
    let matchedBy = picked ? (picked.matched_by ?? "기존") : "";
    let dzId: number | null = picked ? Number(picked.deezer_artist_id) : null;
    const empties: string[] = [];         // 이름은 맞는데 Deezer 가 앨범을 안 주는 경우

    if (!dzId) {
      // 사람이 적어 준 영문 활동명을 맨 앞에 둔다. 그다음 표시명·한글명(+로마자)
      const queries = [...new Set([r.en, r.show, r.ko].filter(Boolean).flatMap((n) => searchNames(n)))];
      for (const q of queries) {
        // limit=5 로는 진짜가 안 걸린다. Deezer 검색은 팬 수로 정렬하지 않아서 TWICE 를 찾으면
        // 동명의 무명 아티스트가 먼저 나온다. 넉넉히 받아 팬 수가 많은 쪽부터 본다.
        const res = await dz(`/search/artist?q=${encodeURIComponent(q)}&limit=25`);
        const nq = norm(q);
        const cands = (res?.data ?? []).filter((d: any) => {
          const nd = norm(d.name);
          if (nd === nq) return true;
          const short = nd.length <= nq.length ? nd : nq;
          const long = nd.length <= nq.length ? nq : nd;
          return short.length >= 6 && long.startsWith(short);
        }).sort((a: any, b: any) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0)).slice(0, 4);
        for (const c of cands) {
          const alb = await dz(`/artist/${c.id}/albums?limit=100`);
          const theirs = new Set((alb?.data ?? []).map((x: any) => normAlbum(x.title)));
          if (theirs.size <= 1 && (c.nb_fan ?? 0) >= 10000) empties.push(`${c.name}: ${theirs.size}장`);
          const overlap = [...theirs].filter((t) => ours.has(t as string)).length;
          if (overlap >= 1) { picked = c; dzId = c.id; matchedBy = `name+album(${q})`; break; }
          if (!picked && ours.size === 0) { picked = c; dzId = c.id; matchedBy = `name(${q})`; }
        }
        if (matchedBy.startsWith("name+album")) break;
      }
    }

    if (!dzId) {
      // 이름은 찾았는데 앨범이 0~1장이면 "없음"이 아니라 "우리 지역에서 카탈로그를 안 준다"는 뜻이다.
      // Linkin Park(팬 1,222만)도 /artist/92/albums 가 빈 배열을 준다. 그건 우리가 못 고친다.
      const why = empties.length ? `Deezer 카탈로그 없음 (${empties.join(", ")})` : "Deezer 에 없음";
      if (empties.length) noCatalog++; else notFound++;
      out.push({ ...base, 결과: why, Deezer: "", 덮는앨범: 0, 남은앨범: pending.length });
      continue;
    }

    // Deezer 가 "아직 트랙을 못 받은 발매그룹" 중 몇 장을 덮는가
    const alb = await dz(`/artist/${dzId}/albums?limit=100`);
    const theirs = new Set((alb?.data ?? []).map((x: any) => normAlbum(x.title)));
    const cover = pending.filter(([t]) => theirs.has(t)).length;
    coverSum += cover;

    if (dzOf.has(mbid)) already++;
    else {
      newFound++;
      console.log(`  [신규] ${r.ko} → Deezer "${picked.name}" (${matchedBy}) · 빠진 ${pending.length}장 중 ${cover}장 덮음`);
      if (GO) {
        const { error } = await sb.from("deezer_artist").upsert({
          deezer_artist_id: dzId, mbid, name: picked.name,
          nb_album: picked.nb_album ?? null, nb_fan: picked.nb_fan ?? null,
          matched_by: matchedBy.startsWith("name+album") ? "name+album" : "name",
        }, { onConflict: "deezer_artist_id" });
        if (error) throw new Error(error.message);
      }
    }
    out.push({
      ...base, 결과: dzOf.has(mbid) ? "이미 연결됨" : "영문명으로 새로 찾음",
      Deezer: `${picked.name} (${dzId})`, 근거: matchedBy,
      "Deezer 앨범": theirs.size, 덮는앨범: cover, 남은앨범: pending.length - cover,
    });
  }

  const cols = ["카테고리", "등급", "아티스트", "영문명", "결과", "Deezer", "근거", "Deezer 앨범", "덮는앨범", "남은앨범", "spotify_id"];
  const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, "\uFEFF" + [cols.join(","), ...out.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"), "utf8");

  console.log(`\n완료 · 새로 찾음 ${newFound} · 이미 연결 ${already} · Deezer 없음 ${notFound} · MB 연결 없음 ${noMbid}`);
  console.log(`빠진 발매그룹 ${pendSum}장 중 Deezer 가 덮는 것 ${coverSum}장 (${pendSum ? Math.round(coverSum / pendSum * 100) : 0}%)`);
  console.log(`Deezer 호출 ${calls} · ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
