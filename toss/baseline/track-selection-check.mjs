/**
 * 앨범 단위 곡 고르기 검사 — src/utils/trackSelection.ts
 *
 *   node --experimental-strip-types toss/baseline/track-selection-check.mjs
 *
 * 화면에 적는 곡 수와 월드컵에 실제로 올라가는 곡 수가 어긋나던 적이 있다(뉴진스에서
 * 46곡이라 적고 28곡만 넘어갔다). 그 규칙이 "아티스트 전체 선택" 버튼 안에만 있었기
 * 때문이다. 앨범 단위 선택을 더하면서 규칙을 헬퍼로 빼냈으니, 여기서 지킨다.
 */
import { albumPickedCount, setAlbumSelected } from '../../src/utils/trackSelection.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const ARTIST = '뉴진스';
const album = (id, title, tracks) => ({
  id, title, image: `img-${id}`,
  tracks: tracks.map((t, i) => ({ id: `${id}-t${i + 1}`, title: t, duration: 200 })),
});

const regular = album('a1', 'Get Up', ['Super Shy', 'ETA', 'Cool With You']);
const repack = album('a2', 'Get Up (Repackage)', ['Super Shy (Remix)', 'New Song']);
const other = album('a3', 'OMG', ['OMG', 'Ditto']);

const empty = { ids: new Set(), meta: {} };

console.log('\n앨범 전체 선택');
{
  const next = setAlbumSelected(empty, ARTIST, regular, true);
  check(next.ids.size === 3, '세 곡이 모두 들어간다', `${next.ids.size}곡`);
  const m = next.meta['a1-t1'];
  check(
    !!m && m.title === 'Super Shy' && m.artistName === ARTIST &&
      m.albumTitle === 'Get Up' && m.albumImage === 'img-a1' && m.albumId === 'a1' && m.duration === 200,
    '메타가 빠짐없이 들어간다',
    m ? Object.keys(m).join(',') : '없음'
  );
  check(albumPickedCount(next, ARTIST, regular) === 3, '고른 수가 3으로 보인다');
}

console.log('\n다른 판의 같은 곡은 두 번 담기지 않는다');
{
  const first = setAlbumSelected(empty, ARTIST, regular, true);
  const next = setAlbumSelected(first, ARTIST, repack, true);
  check(next.ids.size === 4, '3 + 2 가 아니라 4곡', `${next.ids.size}곡`);
  check(next.ids.has('a1-t1'), '판 표기가 없는 "Super Shy" 가 남는다');
  check(!next.ids.has('a2-t1'), '"Super Shy (Remix)" 는 들어가지 않는다');
  check(next.ids.has('a2-t2'), '리패키지의 새 곡은 들어간다');
  /*
   * 버튼이 "전체 선택" 에서 영영 안 바뀌면 안 된다. 리패키지의 한 곡은 다른 판으로
   * 이미 들어가 있으므로, 곡 키로도 세어 "다 골랐다" 를 알아야 한다.
   */
  check(albumPickedCount(next, ARTIST, repack) === 2, '리패키지도 다 고른 것으로 센다',
    `${albumPickedCount(next, ARTIST, repack)}/2`);
}

console.log('\n앨범 해제는 그 앨범만 건드린다');
{
  let sel = setAlbumSelected(empty, ARTIST, regular, true);
  sel = setAlbumSelected(sel, ARTIST, other, true);
  const after = setAlbumSelected(sel, ARTIST, regular, false);
  check(after.ids.size === 2, '다른 앨범의 곡은 남는다', `${after.ids.size}곡`);
  check(after.ids.has('a3-t1') && after.ids.has('a3-t2'), 'OMG 의 두 곡 그대로');
  check(!after.ids.has('a1-t1'), 'Get Up 의 곡은 빠짐');
  check(after.meta['a1-t1'] === undefined, '뺀 곡의 메타도 정리된다');
}

console.log('\n미발매 앨범은 중복을 가리지 않는다');
{
  // 미발매곡은 제목이 겹쳐도 통째로 넣는다(기존 "전체 선택" 과 같은 규칙).
  const demo = album('u1', '미발매', ['Super Shy', 'Unknown Demo']);
  const first = setAlbumSelected(empty, ARTIST, regular, true);
  const next = setAlbumSelected(first, ARTIST, demo, true, { dedupe: false });
  check(next.ids.size === 5, '다섯 곡 모두 들어간다', `${next.ids.size}곡`);
  check(next.ids.has('u1-t1') && next.ids.has('a1-t1'), '같은 제목이어도 둘 다 남는다');
}

console.log('\n원래 목록을 바꾸지 않는다');
{
  const before = setAlbumSelected(empty, ARTIST, regular, true);
  const size = before.ids.size;
  setAlbumSelected(before, ARTIST, other, true);
  check(before.ids.size === size, '넘긴 Set 을 제자리에서 고치지 않는다', `${before.ids.size}`);
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
