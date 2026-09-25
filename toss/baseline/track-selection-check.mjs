/**
 * 곡 고르기 규칙 검사 — src/utils/trackSelection.ts
 *
 *   node --experimental-strip-types toss/baseline/track-selection-check.mjs
 *
 * 화면에 적는 곡 수와 월드컵에 실제로 올라가는 곡 수가 어긋나던 일이 두 번 있었다.
 *
 *   뉴진스   46곡이라 적고 28곡만 넘어갔다  — 규칙이 "전체 선택" 버튼 안에만 있었다
 *   볼빨간사춘기 84곡이라 적고 80곡만 넘어갔다 — 머리말은 **제목**으로 세고 선택은
 *              **트랙 id** 로 담았다. 같은 녹음이 앨범마다 다른 제목으로 들어오면
 *              머리말은 2곡, 선택은 1곡이 된다
 *
 * 그래서 규칙을 `resolveCanonicalTracks` 한 곳에 두고, 여기서 지킨다.
 */
import {
  albumPickedCount, canonicalSelection, canonicalUniverse, clearAllTracks,
  resolveCanonicalTracks, selectAllTracks, setAlbumSelected,
} from '../../src/utils/trackSelection.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const ARTIST = '뉴진스';
const album = (id, title, tracks, type = 'Album') => ({
  id, title, type, image: `img-${id}`,
  tracks: tracks.map((t, i) => ({ id: `${id}-t${i + 1}`, title: t, duration: 200 })),
});
/** 트랙 id 를 직접 주는 앨범. 같은 녹음이 여러 앨범에 같은 id 로 들어오는 경우를 만든다. */
const albumWithIds = (id, title, pairs) => ({
  id, title, type: 'Album', image: `img-${id}`,
  tracks: pairs.map(([tid, t]) => ({ id: tid, title: t, duration: 200 })),
});

const regular = album('a1', 'Get Up', ['Super Shy', 'ETA', 'Cool With You']);
const repack = album('a2', 'Get Up (Repackage)', ['Super Shy (Remix)', 'New Song']);
const other = album('a3', 'OMG', ['OMG', 'Ditto']);

const empty = { ids: new Set(), meta: {} };
const sel = (s) => [...s.ids].sort();

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
   * 단추가 "전체 선택" 에서 영영 안 바뀌면 안 된다. 리패키지의 한 곡은 다른 판으로
   * 이미 들어가 있으므로, 곡 키로도 세어 "다 골랐다" 를 알아야 한다.
   */
  check(albumPickedCount(next, ARTIST, repack) === 2, '리패키지도 다 고른 것으로 센다',
    `${albumPickedCount(next, ARTIST, repack)}/2`);
}

console.log('\n앨범 해제는 그 앨범만 건드린다');
{
  let s = setAlbumSelected(empty, ARTIST, regular, true);
  s = setAlbumSelected(s, ARTIST, other, true);
  const after = setAlbumSelected(s, ARTIST, regular, false);
  check(after.ids.size === 2, '다른 앨범의 곡은 남는다', `${after.ids.size}곡`);
  check(after.ids.has('a3-t1') && after.ids.has('a3-t2'), 'OMG 의 두 곡 그대로');
  check(!after.ids.has('a1-t1'), 'Get Up 의 곡은 빠짐');
  check(after.meta['a1-t1'] === undefined, '뺀 곡의 메타도 정리된다');
}

console.log('\n원래 목록을 바꾸지 않는다');
{
  const before = setAlbumSelected(empty, ARTIST, regular, true);
  const size = before.ids.size;
  setAlbumSelected(before, ARTIST, other, true);
  check(before.ids.size === size, '넘긴 Set 을 제자리에서 고치지 않는다', `${before.ids.size}`);
}

/* ── §31 A. 정규 + 싱글에 같은 곡 ─────────────────────────── */
console.log('\nA. 정규 + 싱글에 같은 곡');
{
  const a = album('A', 'Album', ['Song 1', 'Song 2']);
  const single = album('S', 'Song 1', ['Song 1'], 'Single');
  check(canonicalUniverse(ARTIST, [a, single]).length === 2, 'canonical total = 2',
    `${canonicalUniverse(ARTIST, [a, single]).length}`);
}

/* ── §31 B. 리패키지 중복 ─────────────────────────────────── */
console.log('\nB. 리패키지 중복');
{
  const u = canonicalUniverse(ARTIST, [regular, repack]);
  check(u.length === 4, '3 + 2 가 아니라 4곡', `${u.length}`);
  check(u.some((t) => t.title === 'Super Shy'), '판 표기 없는 제목이 대표');
}

/* ── §31 C. Japanese Ver / Live / Remix ───────────────────── */
console.log('\nC. 판 표기는 같은 곡으로 묶인다 (songKey 정책 그대로)');
{
  const many = album('V', 'Versions', [
    'Ditto', 'Ditto (Japanese Ver.)', 'Ditto (Live)', 'Ditto - Remix', 'Ditto (Remastered)',
  ]);
  const u = canonicalUniverse(ARTIST, [many]);
  check(u.length === 1, '다섯 표기가 한 곡', `${u.length}곡`);
  check(u[0].title === 'Ditto', '대표는 판 표기가 없는 쪽', u[0].title);
  check(u[0].aliases.length === 4, '나머지 네 제목은 별칭으로 남는다', u[0].aliases.join(' / '));
}

/* ── §31 D. 전체 선택 완료: total === selected === final ──── */
console.log('\nD. 다 고르면 머리말 = 고른 수 = 월드컵 수');
{
  const albums = [regular, repack, other];
  const unreleased = [album('u1', '미발매', ['Unknown Demo'], 'Single')];
  const total = canonicalUniverse(ARTIST, albums, unreleased).length;
  const picked = selectAllTracks(empty, ARTIST, albums, unreleased);
  const selected = canonicalSelection(picked).length;
  const final = resolveCanonicalTracks([...picked.ids].map((id) => picked.meta[id])).length;
  check(total === selected && selected === final, `셋이 같다 — ${total} / ${selected} / ${final}`);
  check(picked.ids.size === total, '체크된 곡 수 자체도 같다 (안 올라갈 곡을 체크해 두지 않는다)',
    `${picked.ids.size} vs ${total}`);
}

/* ── §31 E. 일부 해제 ─────────────────────────────────────── */
console.log('\nE. 일부를 빼면 고른 수가 머리말보다 적다');
{
  const albums = [regular, repack, other];
  const total = canonicalUniverse(ARTIST, albums).length;
  const after = clearAllTracks(selectAllTracks(empty, ARTIST, albums), [other]);
  const selected = canonicalSelection(after).length;
  check(selected < total, `${selected} < ${total}`);
  check(selected === total - 2, 'OMG 두 곡만 빠졌다', `${selected}`);
}

/* ── §31 F. 수록곡을 못 받은 앨범 ─────────────────────────── */
console.log('\nF. 수록곡을 못 받은 앨범은 확정 수에 넣지 않는다');
{
  const pending = { id: 'p1', title: '아직', type: 'Single', image: '', tracks: [], totalTracks: 12 };
  const u = canonicalUniverse(ARTIST, [regular, pending, null, undefined]);
  check(u.length === 3, '12곡을 더하지 않는다', `${u.length}곡`);
}

/* ── §31 G. 나중에 들어온 앨범도 같은 규칙으로 담긴다 ─────── */
console.log('\nG. 나중에 들어온 앨범을 이어서 담아도 결과가 같다');
{
  const albums = [regular, repack, other];
  // 한 장씩 늦게 들어온 것처럼 이어서 담는다.
  let s = empty;
  for (const al of albums) s = selectAllTracks(s, ARTIST, [al]);
  const once = selectAllTracks(empty, ARTIST, albums);
  check(sel(s).join(',') === sel(once).join(','), '한꺼번에 고른 것과 같다',
    `${s.ids.size} vs ${once.ids.size}`);
}

/* ── §31 H. 미발매 중복 정책 ──────────────────────────────── */
console.log('\nH. 미발매곡도 같은 규칙으로 센다');
{
  /*
   * 예전에는 미발매곡만 중복을 가리지 않았다. 그러면 머리말은 5곡이라 적고 월드컵에는
   * 4곡만 올라간다 — 월드컵이 songKey 로 합치기 때문이다. 세는 쪽을 월드컵에 맞춘다.
   */
  const demo = album('u1', '미발매', ['Super Shy', 'Unknown Demo'], 'Single');
  const next = setAlbumSelected(setAlbumSelected(empty, ARTIST, regular, true), ARTIST, demo, true);
  check(next.ids.size === 4, '같은 제목은 하나로 합쳐진다', `${next.ids.size}곡`);
  check(canonicalSelection(next).length === 4, '월드컵에 올라가는 수와 같다');
  check(canonicalUniverse(ARTIST, [regular], [demo]).length === 4, '머리말도 4곡');
}

/* ── 볼빨간사춘기에서 실제로 난 것 ────────────────────────── */
console.log('\n같은 녹음이 앨범마다 다른 제목으로 들어와도 한 곡 (BOL4 84 vs 80)');
{
  const BOL4 = '볼빨간사춘기';
  // 같은 recording id 가 두 앨범에 들어가는데 제목 표기가 다르다.
  const red = albumWithIds('r1', 'RED PLANET', [['rec-1', '싸운날'], ['rec-2', '우주를 줄게']]);
  const full = albumWithIds('r2', 'Full Album RED PLANET', [['rec-1', 'Fight Day'], ['rec-2', 'Galaxy']]);
  const u = canonicalUniverse(BOL4, [red, full]);
  check(u.length === 2, '네 제목이 아니라 두 곡', `${u.length}곡`);
  const picked = selectAllTracks(empty, BOL4, [red, full]);
  check(canonicalSelection(picked).length === 2, '고른 수도 두 곡', `${canonicalSelection(picked).length}`);
  check(u.length === canonicalSelection(picked).length, '머리말과 고른 수가 같다');
  const one = u.find((t) => t.id === 'rec-1');
  check(one?.aliases.length === 1, '버린 제목은 별칭으로 남는다', one?.aliases.join(','));
}

/* ── 입력 순서에 좌우되지 않는다 ──────────────────────────── */
console.log('\n결과가 들어온 순서에 좌우되지 않는다');
{
  const metas = [
    { id: 'x', title: 'Hype Boy', artistName: ARTIST, albumTitle: 'A', albumImage: '', albumId: 'A' },
    { id: 'x', title: 'Hype Boy (Live)', artistName: ARTIST, albumTitle: 'B', albumImage: '', albumId: 'B' },
    { id: 'y', title: 'Hype Boy (Japanese Ver.)', artistName: ARTIST, albumTitle: 'C', albumImage: '', albumId: 'C' },
    { id: 'z', title: 'Attention', artistName: ARTIST, albumTitle: 'A', albumImage: '', albumId: 'A' },
    { id: 'w', title: 'Attention (Remix)', artistName: ARTIST, albumTitle: 'D', albumImage: '', albumId: 'D' },
    // 판 표기도 없고 길이도 같은 두 제목 — betterTitle 만으로는 승자가 안 갈린다.
    { id: 'p', title: 'Cookie', artistName: ARTIST, albumTitle: 'A', albumImage: '', albumId: 'A' },
    { id: 'q', title: 'cookie', artistName: ARTIST, albumTitle: 'E', albumImage: '', albumId: 'E' },
  ];
  /** 순서와 무관하게 비교할 모양. 대표 id·제목과 별칭만 본다. */
  const shape = (list) =>
    JSON.stringify(
      list.map((t) => ({ id: t.id, title: t.title, aliases: t.aliases })).sort((a, b) => (a.id < b.id ? -1 : 1))
    );

  const want = shape(resolveCanonicalTracks(metas));
  let same = true;
  let bad = '';
  // 돌릴 때마다 달라지지 않게 씨앗을 고정한다.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 200; i++) {
    const shuffled = [...metas];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rnd() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const got = shape(resolveCanonicalTracks(shuffled));
    if (got !== want) { same = false; bad = shuffled.map((t) => t.title).join(' | '); break; }
  }
  check(same, '섞어서 200번 넣어도 같은 결과', bad);
  const canon = resolveCanonicalTracks(metas);
  check(canon.length === 3, '세 곡으로 합쳐진다 (Hype Boy · Attention · Cookie)', `${canon.length}곡`);
  const hype = canon.find((t) => t.id === 'x');
  check(hype?.title === 'Hype Boy', '대표는 판 표기가 없는 쪽', hype?.title);
  check(hype?.aliases.join(',') === 'Hype Boy (Japanese Ver.),Hype Boy (Live)',
    '별칭은 사전순으로 전부 남는다', hype?.aliases.join(','));
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
