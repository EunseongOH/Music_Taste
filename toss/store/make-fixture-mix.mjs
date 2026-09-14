/**
 * 콘솔 스크린샷용 다(多)아티스트 픽스처.
 *
 * 기준선용 `toss/baseline/fixture.json` 은 한 아티스트(카더가든) 곡만 담고
 * 있어서 앨범 커버가 단조롭다. 스토어 화면에는 앱의 "믹스매치 월드컵"
 * 그대로 여러 아티스트·장르가 섞인 모습이 나와야 한다.
 *
 * 기준선 픽스처는 건드리지 않는다 — 그건 바이트 비교의 고정 입력이라
 * 바뀌면 회귀 검사가 전부 깨진다.
 *
 * 아티스트마다 **서로 다른 앨범**에서 한 곡씩만 뽑아 커버가 겹치지 않게 한다.
 *
 * 사용: node toss/store/make-fixture-mix.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixture-mix.json');
const API = 'http://localhost:3000/api/toss/spotify';

/** 장르를 넓게 흩어 놓는다 — 커버 색감이 다양해야 화면이 살아난다. */
const ARTISTS = [
  // 앱의 아티스트 검색이 '아이유'/'IU' 로 엉뚱한 결과를 준다(기존 버그).
  // 스크린샷을 위해 여기서는 ID 를 직접 지정한다.
  { q: '아이유', id: '3HqSLMAZ3g3d5poNaI7GOU', name: '아이유', genre: 'K-POP' },
  { q: 'NewJeans', genre: 'K-POP' },
  { q: 'Zico', genre: '힙합' },
  { q: 'Beenzino', genre: '힙합' },
  { q: '잔나비', genre: '인디' },
  { q: '검정치마', genre: '인디' },
  { q: 'Billie Eilish', genre: '해외 팝' },
  { q: 'Dua Lipa', genre: '해외 팝' },
];
const PER_ARTIST = 2; // 8명 × 2곡 = 16곡

async function call(fn, args = []) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fn, args }),
  });
  if (!res.ok) throw new Error(`${fn} → HTTP ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return data;
}

const tracks = [];
const seenCovers = new Set();
const seenTitles = new Set();

/** "Ditto (250 Remix)" 와 "Ditto" 를 같은 곡으로 본다. */
const normalize = (t) =>
  t
    .toLowerCase()
    .replace(/\s*[([-].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

for (const a of ARTISTS) {
  let artist;
  if (a.id) {
    artist = { id: a.id, name: a.name };
  } else {
    const found = await call('searchSpotifyArtists', [a.q, 1]);
    artist = (found.items ?? found)?.[0];
  }
  if (!artist) {
    console.log(`  [건너뜀] ${a.q} — 검색 결과 없음`);
    continue;
  }

  const albums = await call('getArtistAlbums', [artist.id, 0, 8]);
  let picked = 0;

  for (const album of albums.items ?? albums) {
    if (picked >= PER_ARTIST) break;
    const cover = album.images?.[0]?.url ?? '';
    if (!cover || seenCovers.has(cover)) continue;

    const got = await call('getAlbumTracks', [album.id]);
    const tr = (got.items ?? got)?.find((x) => !seenTitles.has(normalize(x.name)));
    if (!tr) continue;

    seenCovers.add(cover);
    seenTitles.add(normalize(tr.name));
    tracks.push({
      id: tr.id,
      title: tr.name,
      artistName: tr.artists?.[0]?.name ?? artist.name,
      albumImage: cover,
    });
    picked++;
  }
  console.log(`  ${a.genre.padEnd(6)} ${artist.name} — ${picked}곡`);
}

if (tracks.length < 16) {
  throw new Error(`트랙이 ${tracks.length}개뿐 — 16개 이상 필요`);
}

writeFileSync(OUT, JSON.stringify(tracks, null, 2), 'utf8');
console.log(`\n${tracks.length}곡 / 커버 ${seenCovers.size}종 저장 → ${OUT}`);
