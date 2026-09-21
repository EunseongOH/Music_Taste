/**
 * 월드컵 임시저장 압축/복원 자체 검사. 프레임워크 없음.
 *   npx tsx --test scripts/worldcup-draft-check.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  toCompact,
  hydrateDraft,
  draftExpiresAt,
  DRAFT_SAVED_TTL_MS,
  DRAFT_BUFFER_TTL_MS,
  type WorldcupState,
} from "../src/utils/worldcupDb";

const N = 128;
const tracks = Array.from({ length: N }, (_, i) => ({
  id: `spotify${String(i).padStart(15, "0")}`,
  title: `Track ${i}`,
  artistName: "Artist",
  albumTitle: "Album",
  albumImage: "https://i.scdn.co/image/ab67616d0000b273" + "0".repeat(32),
  albumId: "album" + i,
  duration: 200_000,
}));

// 64강까지 진행한 상태: 64곡 탈락, 2곡 뺌, 64강 대진 32매치 중 12번째
const eliminated = tracks.slice(0, 62);
const skipped = tracks.slice(62, 64);
const survivors = tracks.slice(64);
const matches = Array.from({ length: 32 }, (_, i) => [survivors[i * 2], survivors[i * 2 + 1]]);
const winners = matches.slice(0, 12).map((m) => m[0]);
const picks = [
  ...tracks.slice(0, 62).map((t, i) => [128, survivors[i % 64].id, t.id] as [number, string, string]),
  ...winners.map((w, i) => [64, w.id, matches[i][1].id] as [number, string, string]),
];

const state: WorldcupState = {
  tracks,
  phase: "playing",
  currentRoundName: "64강",
  currentMatchIndex: 12,
  matches,
  winners,
  eliminatedTracks: eliminated,
  skippedTracks: skipped,
  picks,
};

const row = (progress: unknown, selected = tracks) => ({
  status: "playing",
  progress,
  selected_tracks: selected,
  current_round_name: "64강",
  current_match_index: 12,
});

test("toCompact → hydrateDraft 왕복", () => {
  const h = hydrateDraft(row(toCompact(state)));
  assert.ok(h);
  assert.deepEqual(h.matches, matches);
  assert.deepEqual(h.winners, winners);
  assert.deepEqual(h.eliminatedTracks, eliminated);
  assert.deepEqual(h.skippedTracks, skipped);
  assert.deepEqual(h.picks, picks);
  assert.equal(h.currentRoundName, "64강");
  assert.equal(h.currentMatchIndex, 12);
  assert.equal(h.tracks.length, N);
});

test("곡 ID 가 하나라도 없으면 null", () => {
  assert.equal(hydrateDraft(row(toCompact(state), tracks.slice(1))), null);
});

test("progress 없음 / 옛 형식은 null", () => {
  assert.equal(hydrateDraft(row(null)), null);
  assert.equal(hydrateDraft(row({ v: 0 })), null);
});

test("128곡 progress 는 20 KB 미만", () => {
  const bytes = Buffer.byteLength(JSON.stringify(toCompact(state)));
  assert.ok(bytes < 20_000, `progress ${bytes} bytes`);
});

test("만료 시각", () => {
  const t0 = new Date("2026-09-21T00:00:00Z");
  const iso = t0.toISOString();
  assert.equal(draftExpiresAt({ status: "track_selection", updated_at: iso, saved_at: iso }), null);
  assert.equal(draftExpiresAt({ status: "playing", updated_at: iso, saved_at: null }), t0.getTime() + DRAFT_BUFFER_TTL_MS);
  const later = new Date(t0.getTime() + 3 * 3600_000).toISOString();
  assert.equal(draftExpiresAt({ status: "playing", updated_at: later, saved_at: iso }), t0.getTime() + DRAFT_SAVED_TTL_MS);
});
