/**
 * 프로필의 "완료한 취향표" 한 목록 — src/utils/completedArchive.ts
 *
 *   node --experimental-strip-types toss/baseline/completed-archive-check.mjs
 *
 * 혼자 한 취향표와 같이 소트한 방은 저장되는 곳이 다르다. 좁은 모달에서 자리를 둘로
 * 나누면 둘 다 조금씩만 보여서, 한 목록으로 최신순으로 섞는다.
 *
 * 섞되 **종류를 지우지 않는다.** 방을 취향표처럼 꾸며 가짜 1위를 만들면 누르는 곳도
 * 보여 줄 것도 달라 결국 거짓이 된다. 그리고 **닮았다는 이유로 합치지 않는다** —
 * 제목·아티스트·날짜는 같은 활동이라는 증거가 아니다.
 *
 * 화면 글자를 뒤지지 않고 helper 가 내는 값으로 본다.
 */
import { buildCompletedArchiveItems } from '../../src/utils/completedArchive.ts';

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const result = (id, at, extra = {}) => ({
  id,
  created_at: at,
  winner_track_title: `곡 ${id}`,
  winner_track_artist: '카더가든',
  ...extra,
});
const room = (code, at, extra = {}) => ({
  code,
  title: `${code} 방`,
  artistName: 'RESCENE',
  artistImage: null,
  trackCount: 22,
  people: 3,
  sortedAt: at,
  iCreated: false,
  ...extra,
});

console.log('\n한 종류만 있어도 완료 목록이 선다');
{
  const onlyResult = buildCompletedArchiveItems([result('r1', '2026-09-25T10:00:00Z')], []);
  check(onlyResult.length === 1 && onlyResult[0].kind === 'result', '취향표 하나 -> 한 줄', onlyResult[0]?.kind);

  const onlyRoom = buildCompletedArchiveItems([], [room('abc', '2026-09-26T10:00:00Z')]);
  check(onlyRoom.length === 1 && onlyRoom[0].kind === 'together', '방 하나 -> 한 줄', onlyRoom[0]?.kind);
  /*
   * 방만 있는 계정이 빈 화면을 보면 안 된다. 개수는 합친 목록으로 세므로,
   * 길이가 1 이면 화면도 빈 상태가 아니다.
   */
  check(onlyRoom.length > 0, '방만 있어도 빈 상태가 아니다', `${onlyRoom.length}건`);
}

console.log('\n두 종류가 한 목록으로 최신순으로 섞인다');
{
  const items = buildCompletedArchiveItems(
    [result('r-0925', '2026-09-25T10:00:00Z'), result('r-0923', '2026-09-23T10:00:00Z')],
    [room('t-0926', '2026-09-26T10:00:00Z'), room('t-0924', '2026-09-24T10:00:00Z')]
  );
  const order = items.map((x) => (x.kind === 'result' ? x.result.id : x.room.code)).join(' ');
  check(order === 't-0926 r-0925 t-0924 r-0923', '종류별로 몰리지 않고 시간순', order);
  check(items.length === 4, '네 줄 모두 남는다', `${items.length}건`);
  const kinds = items.map((x) => x.kind).join(',');
  check(kinds === 'together,result,together,result', '각 줄이 제 종류를 지킨다', kinds);
}

console.log('\n닮았다는 이유로 합치지 않는다');
{
  /*
   * 같은 아티스트·같은 날·비슷한 제목이어도 **다른 활동일 수 있다.** 실제로 같은
   * 활동임을 보이는 값(DB 의 연결 컬럼)이 없으므로 여기서 지우지 않는다.
   * 지금은 같이 소트를 끝내면 방 기록과 개인 취향표가 둘 다 생긴다 — 그건 UI 가
   * 감출 일이 아니라 데이터에 연결을 만들어 풀 일이다.
   */
  const sameDay = buildCompletedArchiveItems(
    [result('r1', '2026-09-26T10:00:00Z', { winner_track_artist: 'RESCENE' })],
    [room('t1', '2026-09-26T10:00:30Z')]
  );
  check(sameDay.length === 2, '30초 차이·같은 아티스트여도 두 줄', `${sameDay.length}건`);
}

console.log('\n빈 입력·깨진 줄에도 터지지 않는다');
{
  check(buildCompletedArchiveItems(null, null).length === 0, 'null 이면 빈 목록');
  check(buildCompletedArchiveItems(undefined, []).length === 0, 'undefined 도 빈 목록');
  const broken = buildCompletedArchiveItems(
    [result('r1', '2026-09-25T10:00:00Z'), { created_at: 'x' }],
    [room('t1', '2026-09-26T10:00:00Z'), { sortedAt: 'x' }]
  );
  check(broken.length === 2, 'id·code 없는 줄은 버리고 나머지는 지킨다', `${broken.length}건`);

  // 읽을 수 없는 시각은 맨 뒤로. 순서를 흔들지 않는다.
  const badTime = buildCompletedArchiveItems(
    [result('r-bad', 'not-a-date'), result('r-good', '2026-09-25T10:00:00Z')],
    []
  );
  check(badTime.map((x) => x.result.id).join(' ') === 'r-good r-bad', '못 읽는 시각은 맨 뒤',
    badTime.map((x) => x.result.id).join(' '));
}

console.log('\n긴 이름이 와도 값을 잘라 버리지 않는다');
{
  const long = 'ㄱ'.repeat(120);
  const items = buildCompletedArchiveItems([], [room('t1', '2026-09-26T10:00:00Z', { artistName: long })]);
  check(items[0].kind === 'together' && items[0].room.artistName === long,
    '자르는 것은 화면이 할 일이다(데이터는 그대로)', `${items[0].room.artistName.length}자`);
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
