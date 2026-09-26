/**
 * 고르기 단계 초안 줄이 **운영 DB 계약**을 지키는지 검사한다 (UX-009).
 *
 *   node --experimental-strip-types toss/baseline/draft-stage-contract-check.mjs
 *
 * a55eb2f 는 아티스트·곡 고르기 단계에서 `selected_tracks`·`phase` 에 null 을 보냈다.
 * 운영 `tournament_drafts` 는 두 칸이 NOT NULL 이라 INSERT 가 23502 로 실패했고,
 * 목킹한 e2e 는 그 계약을 몰라 통과했다. 여기서는 운영에서 조회한 스키마
 * (fixtures/tournament-drafts-schema.json)를 기준으로 줄 자체를 본다.
 *
 * 서버·비밀값 없이 돈다. 운영 DB 로 확인하는 것은 감사 쪽이 따로 한다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageRow } from '../../src/utils/draftStage.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(HERE, 'fixtures', 'tournament-drafts-schema.json'), 'utf8'));
const cols = schema.columns;

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const UID = '11111111-2222-4333-8444-555555555555';
const ARTISTS = [{ id: 'arB', name: '비밴드' }];
const TRACKS = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }];
const payloads = {
  'artist_selection': stageRow(UID, true, { status: 'artist_selection', selectedArtists: ARTISTS }),
  'track_selection': stageRow(UID, true, { status: 'track_selection', selectedArtists: ARTISTS, selectedTracks: TRACKS }),
};

/** 고르기 단계에서 월드컵 칸이 가져야 할 값 = 컬럼 기본값. */
const RESET = {
  phase: 'loading', current_round_name: null, current_match_index: 0, bye_count: 0,
  progress: null, saved_at: null, skipped_tracks: [],
  tracks: [], matches: [], winners: [], eliminated_tracks: [], selected_byes: [],
};

/** 진행 중이던 판 X 의 줄 — 이 위에 고르기 단계를 UPDATE 해도 흔적이 남으면 안 된다. */
const legacyX = {
  id: 'x-row', user_id: UID, is_single_artist: true, status: 'playing', title: '엑스 월드컵',
  selected_artists: [{ id: 'arX', name: '엑스가수' }], selected_tracks: [{ id: 'x1' }, { id: 'x2' }],
  phase: 'playing', current_round_name: '8강', current_match_index: 3, bye_count: 2,
  tracks: [{ id: 'x1' }], matches: [[{ id: 'x1' }, { id: 'x2' }]], winners: [{ id: 'x1' }],
  eliminated_tracks: [{ id: 'x2' }], selected_byes: [{ id: 'x3' }], skipped_tracks: [{ id: 'x4' }],
  progress: { v: 1, matches: [['x1', 'x2']], winners: ['x1'], eliminated: [], skipped: [], picks: [] },
  saved_at: '2026-09-26T00:00:00.000Z', created_at: '2026-09-25T00:00:00.000Z', updated_at: '2026-09-26T00:00:00.000Z',
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [stage, row] of Object.entries(payloads)) {
  console.log(`\n${stage}`);
  const nullInNotNull = Object.entries(row).filter(([k, v]) => cols[k] && !cols[k].nullable && v === null).map(([k]) => k);
  check(nullInNotNull.length === 0, 'NOT NULL 칸에 null 이 없다', nullInNotNull.join(',') || '없음');

  const unknown = Object.keys(row).filter((k) => !cols[k]);
  check(unknown.length === 0, '스키마에 없는 칸을 보내지 않는다', unknown.join(',') || '없음');

  // UPDATE 는 빠진 칸에 기본값을 넣어 주지 않는다 — id·created_at 말고는 전부 적어야 한다.
  const missing = Object.keys(cols).filter((k) => !['id', 'created_at'].includes(k) && !(k in row));
  check(missing.length === 0, 'UPDATE 로 써도 빠지는 칸이 없다', missing.join(',') || '없음');

  const wrong = Object.entries(RESET).filter(([k, v]) => !same(row[k], v)).map(([k]) => `${k}=${JSON.stringify(row[k])}`);
  check(wrong.length === 0, '월드컵 칸은 컬럼 기본값으로 비운다', wrong.join(', ') || '전부 기본값');

  check(same(row.selected_artists, ARTISTS) && row.status === stage, '지금 고른 아티스트·단계');
  check(same(row.selected_tracks, stage === 'track_selection' ? TRACKS : []),
    stage === 'track_selection' ? '고른 곡이 담긴다' : '아티스트 단계의 곡은 [] (null 아님)', JSON.stringify(row.selected_tracks));

  // 진행 중이던 줄 X 위에 UPDATE 한 결과
  const after = { ...legacyX, ...row };
  const leftovers = ['selected_tracks', 'tracks', 'matches', 'winners', 'eliminated_tracks', 'selected_byes', 'skipped_tracks', 'progress', 'current_round_name', 'saved_at']
    .filter((k) => JSON.stringify(after[k]).includes('x'));
  check(leftovers.length === 0, '진행 중이던 판 X 위에 써도 X 의 흔적이 남지 않는다', leftovers.join(',') || '없음');
  check(after.phase === 'loading' && after.current_match_index === 0 && after.bye_count === 0, 'X 의 phase·매치 위치·부전승 수도 되돌린다');

  // INSERT: 스키마 기본값을 채운 뒤에도 NOT NULL 을 지키는가
  const inserted = Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, k in row ? row[k] : c.default]));
  const bad = Object.entries(inserted).filter(([k, v]) => !cols[k].nullable && v === null && k !== 'id').map(([k]) => k);
  check(bad.length === 0, 'INSERT 로 넣어도 NOT NULL 위반이 없다', bad.join(',') || '없음');
}

console.log('\n예전 줄(a55eb2f)은 이 검사에서 걸린다');
{
  // 검사가 실제로 회귀를 잡는지: 그때 보내던 값을 넣어 본다.
  const old = { ...payloads.artist_selection, selected_tracks: null, phase: null };
  const nulls = Object.entries(old).filter(([k, v]) => cols[k] && !cols[k].nullable && v === null).map(([k]) => k);
  check(same(nulls.sort(), ['phase', 'selected_tracks']), 'selected_tracks·phase null 은 계약 위반으로 잡힌다', nulls.join(','));
}

console.log(failed === 0 ? '\n결과: 통과' : `\n결과: 실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
