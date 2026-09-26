/**
 * 곡 그림 사다리 검사 — src/utils/trackArtwork.ts · trackSelection.ts · ranking.ts
 *
 *   node --experimental-strip-types toss/baseline/artwork-check.mjs
 *
 * 하츠투하츠에서 재킷이 깨진 채로 월드컵·취향표 1위·저장 이미지까지 갔다. 원인은 둘이었다.
 *
 *   - 앨범 화면에만 있던 2순위 재킷(image2)이 곡을 고르는 순간 사라졌다
 *   - 주소가 "있으면" 그대로 그렸다. CAA 주소는 계산해서 만들어 404 여도 주소는 있다
 *
 * 그래서 곡 한 줄이 재킷 후보·아티스트 사진을 들고 다니고, 그리는 쪽은
 * 재킷 → 다른 재킷 → 아티스트 → 대체 그림 순으로 **실제로 불러 보고** 넘어간다.
 */
import {
  albumCandidates, artworkChain, artworkKind, artworkPlaceholder, isCoverPlaceholder,
  resolveArtworkDataUrl, withArtistImages,
} from '../../src/utils/trackArtwork.ts';
import { coverPlaceholder } from '../../src/utils/coverPlaceholder.ts';
import {
  albumTrackMetas, canonicalSelection, resolveCanonicalTracks, selectAllTracks, trackMeta,
} from '../../src/utils/trackSelection.ts';
import { normalizeRanking, withSavedArtistImage } from '../../src/utils/ranking.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const CAA = 'https://coverartarchive.org/release-group/aaaa/front-500';
const DZ = 'https://api.deezer.com/album/1/image?size=big';
const ART = 'https://i.scdn.co/image/artist-640';
const H2H = { id: '1ZLU77nRzQIaP23mVSYpCQ', name: 'Hearts2Hearts', image: ART };

console.log('\n[1] 곡 한 줄이 재킷 후보·아티스트를 들고 간다 (trackMeta)');
{
  const m = trackMeta(H2H, { id: 'al1', title: 'FOCUS', image: CAA, image2: DZ }, { id: 't1', title: 'FOCUS' });
  check(m.albumImage === CAA, '1순위 재킷');
  check(m.albumImageFallbacks?.[0] === DZ, '2순위 재킷(image2)을 잃지 않는다', JSON.stringify(m.albumImageFallbacks));
  check(m.artistImage === ART && m.artistId === H2H.id, '아티스트 사진·id');

  const ph = trackMeta(H2H, { id: 'al2', title: 'X', image: coverPlaceholder('al2') }, { id: 't2', title: 'X' });
  check(ph.albumImage === '', '대체 그림(NO COVER)은 재킷으로 저장하지 않는다');

  const legacyCall = trackMeta('뉴진스', { id: 'al3', title: 'Y', image: CAA }, { id: 't3', title: 'Y' });
  check(legacyCall.artistName === '뉴진스' && !('artistImage' in legacyCall), '이름만 넘기던 호출도 그대로 된다');

  const metas = albumTrackMetas(H2H, { id: 'al1', title: 'FOCUS', image: CAA, image2: DZ, tracks: [{ id: 'a' }, { id: 'b' }].map((t) => ({ ...t, title: t.id })) });
  check(metas.every((x) => x.artistImage === ART && x.albumImageFallbacks?.[0] === DZ), '앨범 전체 선택도 같은 모양');

  const sel = selectAllTracks({ ids: new Set(), meta: {} }, H2H, [{ id: 'al1', title: 'FOCUS', image: CAA, image2: DZ, tracks: [{ id: 'a', title: 'a' }] }]);
  check(sel.meta.a?.artistImage === ART, '아티스트 전체 선택도 같은 모양');
}

console.log('\n[2] 사다리 순서');
{
  const t = { id: 't', title: 'FOCUS', albumImage: CAA, albumImageFallbacks: [DZ], artistImage: ART };
  const chain = artworkChain(t);
  check(chain[0] === CAA && chain[1] === DZ && chain[2] === ART && isCoverPlaceholder(chain[3]) && chain.length === 4,
    '재킷 → 다른 재킷 → 아티스트 → 대체 그림');
  check(artworkKind(t, ART) === 'artist' && artworkKind(t, DZ) === 'album' && artworkKind(t, chain[3]) === 'placeholder', '어느 칸인지 가른다');

  const dup = artworkChain({ id: 't', albumImage: CAA, albumImageFallbacks: [CAA, '', DZ] });
  check(dup.filter((u) => u === CAA).length === 1 && !dup.includes(''), '중복·빈 값 제거');

  const legacyPh = { id: 't', title: 'x', albumImage: coverPlaceholder('old'), artistImage: ART };
  const lc = artworkChain(legacyPh);
  check(lc[0] === ART, '예전 순위의 대체 그림은 아티스트 사진보다 뒤로 간다', lc[0].slice(0, 40));
  check(albumCandidates(legacyPh).length === 0, '예전 대체 그림은 재킷 후보가 아니다');

  const bare = artworkChain({ id: 'x', title: 'y', albumImage: '' });
  check(bare.length === 1 && bare[0] === artworkPlaceholder({ id: 'x' }), '아무것도 없으면 대체 그림 하나');
  check(artworkPlaceholder({ id: 'x' }) === artworkPlaceholder({ id: 'x', title: 'other' }), '대체 그림은 곡 id 로 정해진다');
}

console.log('\n[3] 같은 곡으로 묶여도 재킷을 잃지 않는다 (resolveCanonicalTracks)');
{
  // A: 대표 제목이지만 재킷이 없다. B: 별칭이지만 재킷이 있다.
  const A = { id: 'A', title: 'FOCUS', artistName: 'Hearts2Hearts', albumTitle: 'FOCUS', albumImage: '', albumId: 'x', artistImage: ART };
  const B = { id: 'B', title: 'FOCUS (Remix)', artistName: 'Hearts2Hearts', albumTitle: 'FOCUS (Remixes)', albumImage: DZ, albumId: 'y' };
  for (const rows of [[A, B], [B, A]]) {
    const c = resolveCanonicalTracks(rows);
    check(c.length === 1 && c[0].title === 'FOCUS', '제목은 A 기준', `${c.length}곡 ${c[0]?.title}`);
    check(c[0].albumImage === DZ, 'B 의 재킷이 남는다 (들어온 순서와 무관)', c[0].albumImage);
    check(c[0].artistImage === ART, '아티스트 사진도 남는다');
  }
  const C = { ...A, id: 'C', title: 'Pretty Please', albumImage: CAA, albumImageFallbacks: [DZ] };
  const D = { ...A, id: 'C', title: 'Pretty Please', albumImage: 'https://x/other.jpg' };
  const cd = resolveCanonicalTracks([C, D])[0];
  check(cd.albumImage === CAA && cd.albumImageFallbacks?.includes(DZ) && cd.albumImageFallbacks?.includes('https://x/other.jpg'),
    '같은 id 의 여러 재킷을 순서대로 모은다', JSON.stringify([cd.albumImage, cd.albumImageFallbacks]));
  const many = resolveCanonicalTracks(Array.from({ length: 9 }, (_, i) => ({ ...A, albumImage: `https://x/${i}.jpg` })))[0];
  check(1 + (many.albumImageFallbacks?.length ?? 0) <= 4, '후보는 무한히 쌓지 않는다', `${1 + (many.albumImageFallbacks?.length ?? 0)}개`);

  const sel = canonicalSelection({ ids: new Set(['A', 'B']), meta: { A, B } });
  check(sel.length === 1, '곡 수는 그대로(한 곡)');
}

console.log('\n[4] 예전 곡·순위');
{
  const legacy = { id: 'l1', title: 'Old', artistName: 'Hearts2Hearts', albumImage: CAA };
  const chain = artworkChain(legacy);
  check(chain[0] === CAA && chain.length === 2, '재킷만 있어도 된다 (깨지면 대체 그림)');

  const filled = withArtistImages([legacy, { ...legacy, id: 'l2', artistName: 'Someone Else' }], [H2H]);
  check(filled[0].artistImage === ART && filled[0].artistId === H2H.id, '고른 아티스트와 이름이 정확히 같으면 사진을 채운다');
  check(!filled[1].artistImage, '이름이 다르면 채우지 않는다 (추측 금지)');
  check(!withArtistImages([{ ...legacy, artistName: 'Hearts2' }], [H2H])[0].artistImage, '비슷한 이름도 채우지 않는다');

  const saved = normalizeRanking([{ id: 'n1', title: 'N', artistName: 'a', albumImage: CAA, albumImageFallbacks: [DZ], artistImage: ART, artistId: 'z' }, { i: 'n2', t: 'M', a: 'b', m: 'abc' }]);
  check(saved[0].albumImageFallbacks?.[0] === DZ && saved[0].artistImage === ART && saved[0].artistId === 'z', '저장된 순위를 읽을 때 그림 후보를 버리지 않는다');
  check(saved[1].albumImage === 'https://i.scdn.co/image/abc' && !('artistImage' in saved[1]), '압축 형식도 그대로');

  const calls = [];
  const fakeDb = (images) => ({
    from: (t) => ({ select: () => ({ eq: (col, v) => { calls.push([t, col, v]); return { maybeSingle: async () => ({ data: images ? { images } : null }) }; } }) }),
  });
  const r1 = await withSavedArtistImage(fakeDb([{ url: ART }]), { is_single_artist: true, artist_id: H2H.id }, [legacy]);
  check(r1[0].artistImage === ART && calls[0]?.[0] === 'canonical_artist' && calls[0]?.[1] === 'spotify_id' && calls[0]?.[2] === H2H.id,
    '한 아티스트 취향표는 artist_id 로 정확히 찾는다', JSON.stringify(calls[0]));
  calls.length = 0;
  const r2 = await withSavedArtistImage(fakeDb([{ url: ART }]), { is_single_artist: true, artist_id: null }, [legacy]);
  check(!r2[0].artistImage && calls.length === 0, 'artist_id 가 없으면 찾지 않는다');
  const r3 = await withSavedArtistImage(fakeDb([{ url: ART }]), { is_single_artist: false, artist_id: H2H.id }, [legacy]);
  check(!r3[0].artistImage, '여러 아티스트 취향표에는 한 사람 사진을 붙이지 않는다');
  const r4 = await withSavedArtistImage(fakeDb(null), { is_single_artist: true, artist_id: H2H.id }, [legacy]);
  check(!r4[0].artistImage && isCoverPlaceholder(artworkChain(r4[0]).at(-1)), 'DB 에 없으면 대체 그림으로 간다');
}

console.log('\n[5] 저장 이미지: 사다리를 실제로 받아 보고 data URL 로 굳힌다');
{
  // node 에는 FileReader 가 없다. 브라우저와 같은 모양으로 얇게 둔다.
  globalThis.FileReader = class {
    readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onload(); }); }
  };
  const ok = (type = 'image/png') => new Response(new Blob([new Uint8Array([1, 2, 3])], { type }), { status: 200 });
  const table = new Map([
    ['https://ok/primary', () => ok()],
    ['https://ok/secondary', () => ok('image/jpeg')],
    ['https://ok/artist', () => ok('image/webp')],
    ['https://404/primary', () => new Response('nf', { status: 404 })],
    ['https://500/primary', () => new Response('err', { status: 500 })],
    ['https://html/primary', () => ok('text/html')],
    ['https://cors/primary', () => { throw new TypeError('Failed to fetch'); }],
  ]);
  const seen = [];
  globalThis.fetch = async (url) => { seen.push(url); const f = table.get(url); if (!f) throw new TypeError('no route'); return f(); };

  const cases = [
    ['Case1 재킷 정상', { id: 'c1', albumImage: 'https://ok/primary', artistImage: 'https://ok/artist' }, 'data:image/png'],
    ['Case2 재킷 404 → 다른 재킷', { id: 'c2', albumImage: 'https://404/primary', albumImageFallbacks: ['https://ok/secondary'], artistImage: 'https://ok/artist' }, 'data:image/jpeg'],
    ['Case3 재킷 404, 다른 재킷 없음 → 아티스트', { id: 'c3', albumImage: 'https://500/primary', artistImage: 'https://ok/artist' }, 'data:image/webp'],
    ['Case4 재킷 후보 없음 → 아티스트', { id: 'c4', albumImage: '', artistImage: 'https://ok/artist' }, 'data:image/webp'],
    ['Case5 전부 실패 → 대체 그림', { id: 'c5', title: 'x', albumImage: 'https://cors/primary', albumImageFallbacks: ['https://html/primary'], artistImage: 'https://404/primary' }, 'data:image/svg+xml'],
    ['Case6 하츠투하츠 FOCUS 모양', { id: 'focus', title: 'FOCUS', albumImage: 'https://404/primary', artistImage: 'https://ok/artist' }, 'data:image/webp'],
    ['예전 순위(재킷이 대체 그림) + 아티스트', { id: 'old', albumImage: coverPlaceholder('x'), artistImage: 'https://ok/artist' }, 'data:image/webp'],
  ];
  for (const [label, t, prefix] of cases) {
    const out = await resolveArtworkDataUrl(t);
    check(out.startsWith(prefix) && !/^https?:/.test(out), label, out.slice(0, 32));
  }
  const c5 = await resolveArtworkDataUrl(cases[4][1]);
  check(c5 === artworkPlaceholder(cases[4][1]), 'Case5 대체 그림은 화면과 같은 그림(곡 id 기준)');
  const before = seen.length;
  await resolveArtworkDataUrl({ id: 'again', albumImage: 'https://ok/artist' });
  check(seen.length === before, '같은 주소는 한 번만 받는다');
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
