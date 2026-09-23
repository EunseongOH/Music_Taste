/**
 * 스토어 5장(내 취향 스페이스) 목업용 픽스처를 만든다. **운영 DB 에는 아무것도 쓰지 않는다** —
 * capture-store.mjs 가 브라우저의 Supabase 요청을 가로채 이 JSON 으로 응답한다.
 *
 * 곡·커버는 우리 카탈로그(/api/together/catalog, DB 캐시 · Spotify 호출 없음)에서 가져온다.
 * 전부 단일 아티스트 모드(is_single_artist true). 서로 다른 아티스트 5명이라 "여러 번 하게 되는 앱"으로 읽힌다.
 *
 *   NEXT_BASE=http://localhost:3300 node toss/store/make-fixture-space.mjs
 * → toss/store/fixture-space.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.NEXT_BASE ?? 'http://localhost:3300';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixture-space.json');
const ME = process.env.ME_USER_ID ?? '3ae056af-019c-4790-855b-f6b10418f4c3';

/* 내 취향표 5장 — 아티스트·저장 날짜(최근순)·1위 곡 인덱스 */
const MINE = [
  { id: '6k4r73Wq8nhkCDoUsECL1e', name: '멜로망스', day: '2026-09-21', win: 0 },
  { id: '3ErHVJMsxTq2lLSmnONBm9', name: '김상우', day: '2026-09-18', win: 1 },
  { id: '5o615XColiSVMPDWlslKSk', name: '원슈타인', day: '2026-09-14', win: 0 },
  { id: '68ZtcdthScW8ISOvVNW9sV', name: '글렌체크', day: '2026-09-09', win: 2 },
  { id: '5q9adPv91NFr8q2ZcKmX0V', name: '유라', day: '2026-09-03', win: 0 },
];
/* 다른 리스너 — 취향 메이트 탭이 비지 않게. 첫 취향표(멜로망스)와 1위가 같거나 순위가 겹친다 */
const OTHERS = [
  { nick: '새벽라디오', artist: 0, win: 0, shuffle: 1, day: '2026-09-22' },
  { nick: '리스너_하루', artist: 0, win: 0, shuffle: 3, day: '2026-09-20' },
  { nick: '무드등', artist: 0, win: 3, shuffle: 2, day: '2026-09-19' },
  { nick: '창가자리', artist: 1, win: 1, shuffle: 1, day: '2026-09-17' },
];

async function tracksOf(artistId) {
  const res = await fetch(`${BASE}/api/together/catalog?artistId=${artistId}&stream=1`);
  const text = await res.text();
  let tracks = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.tracks) tracks = m.tracks; } catch {}
  }
  return tracks;
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rot = (arr, k) => arr.slice(k).concat(arr.slice(0, k));

const results = [];
const catalogs = {};
for (const a of MINE) catalogs[a.id] = (await tracksOf(a.id)).slice(0, 16);
MINE.forEach((a, i) => {
  const tracks = rot(catalogs[a.id], a.win);
  const w = tracks[0];
  results.push({
    id: uuid(100 + i), user_id: ME, title: `${a.name} sort_${a.day.slice(2).replace(/-/g, '')}`,
    winner_track_id: w.id, winner_track_title: w.title, winner_track_artist: a.name, winner_track_image: w.albumImage,
    user_nickname: '은은한레코드664', user_profile_image: null, created_at: `${a.day}T12:00:00+09:00`,
    is_public: i !== 2, is_single_artist: true, artist_name: a.name,
    ranking: tracks.map((t) => ({ id: t.id, title: t.title, artistName: a.name, albumImage: t.albumImage })),
  });
});
const others = OTHERS.map((o, i) => {
  const a = MINE[o.artist];
  const tracks = rot(catalogs[a.id], o.win).map((t, idx, arr) => (idx === 0 ? t : arr[(idx * o.shuffle) % arr.length]));
  const w = tracks[0];
  return {
    id: uuid(200 + i), user_id: uuid(900 + i), title: `${a.name} sort_${o.day.slice(2).replace(/-/g, '')}`,
    winner_track_id: w.id, winner_track_title: w.title, winner_track_artist: a.name, winner_track_image: w.albumImage,
    user_nickname: o.nick, user_profile_image: null, created_at: `${o.day}T12:00:00+09:00`,
    is_public: true, is_single_artist: true, artist_name: a.name,
    ranking: tracks.map((t) => ({ id: t.id, title: t.title, artistName: a.name, albumImage: t.albumImage })),
  };
});
writeFileSync(OUT, JSON.stringify({ me: ME, mine: results, others }, null, 1));
console.log(`내 취향표 ${results.length} · 다른 리스너 ${others.length} → ${OUT}`);
console.log(results.map((r) => `${r.title} — 1위 ${r.winner_track_title} (${r.ranking.length}곡)`).join('\n'));
