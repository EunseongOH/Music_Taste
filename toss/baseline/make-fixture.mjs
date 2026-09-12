/**
 * Phase 1.1 레퍼런스용 고정 트랙 픽스처 생성기.
 *
 * `/taste`는 스토리지의 `worldcup_ranking`만 읽어서 렌더하므로, 월드컵 플로우를
 * 클릭으로 재현하지 않고 실제 Spotify 데이터로 만든 랭킹을 직접 주입한다.
 * 결과를 fixture.json으로 얼려서 리팩터 전/후 비교가 항상 같은 입력을 쓰도록 한다.
 *
 * 한 번만 실행하면 되고, 이후에는 fixture.json을 그대로 재사용한다.
 *   node toss/baseline/make-fixture.mjs
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'fixture.json');
const API = 'http://localhost:3000/api/toss/spotify';

const IU = '7c1HgFDe8ogy5NOZ1ANCJQ';
const TARGET = 20; // 20곡 → pyramid 1장, list 2장(15/page), retro 2장(10/page)

async function call(fn, args = []) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fn, args }),
  });
  if (!res.ok) throw new Error(`${fn} → HTTP ${res.status}`);
  const { data } = await res.json();
  return data;
}

if (existsSync(OUT)) {
  console.log(`이미 존재함, 건너뜀: ${OUT}`);
  process.exit(0);
}

const albums = await call('getArtistAlbums', [IU, 0, 6]);
const items = albums.items ?? albums;
console.log(`앨범 ${items.length}장 조회`);

const tracks = [];
for (const album of items) {
  if (tracks.length >= TARGET) break;
  const albumImage = album.images?.[0]?.url ?? '';
  const got = await call('getAlbumTracks', [album.id]);
  for (const tr of got) {
    if (tracks.length >= TARGET) break;
    tracks.push({
      id: tr.id,
      title: tr.name,
      artistName: tr.artists?.[0]?.name ?? 'IU',
      albumImage,
    });
  }
}

if (tracks.length < TARGET) {
  throw new Error(`트랙이 ${tracks.length}개뿐 — ${TARGET}개 필요`);
}

writeFileSync(OUT, JSON.stringify(tracks, null, 2), 'utf8');
console.log(`${tracks.length}곡 저장 → ${OUT}`);
console.log(`1위: ${tracks[0].title} / ${tracks[0].artistName}`);
