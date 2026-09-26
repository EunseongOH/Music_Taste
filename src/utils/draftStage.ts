/**
 * 아티스트·곡 고르기 단계의 초안 줄 — **실제 DB 가 받는 모양 그대로, 한 곳에서** 만든다.
 *
 * a55eb2f 는 "이전 판의 진행을 비운다" 며 `selected_tracks`·`phase` 에 null 을 보냈다.
 * 운영 `tournament_drafts` 는 두 컬럼이 NOT NULL 이라 INSERT 가 23502 로 실패했다(UX-009).
 * 새 계정은 고르기 단계 초안이 한 번도 안 생겼고, 보호된 초안이 있을 때는 유니크 충돌
 * (23505 → "conflict") 에 닿기 전에 실패해 충돌 시트도 뜨지 않았다(UX-001).
 *
 * 그래서:
 *   - 비우는 값은 **컬럼 기본값과 같은 값**으로 쓴다(null 이 아니라 [] · 'loading' · 0)
 *   - INSERT·UPDATE·명시적 바꾸기가 **같은 줄**을 쓴다. INSERT 에서 칸을 빼면 기본값이
 *     들어가지만 UPDATE 는 그렇지 않다 — 빼면 이전 판의 칸이 남는다. 그래서 전부 적는다
 *   - 옛 월드컵 칸(tracks·matches·winners·eliminated_tracks·selected_byes·bye_count)도
 *     같이 비운다. 지금은 쓰지 않지만 남아 있으면 "아티스트 B + 옛 판 A" 가 된다
 *
 * 이 파일은 DB 클라이언트를 부르지 않는다(검사에서 그대로 불러 쓴다).
 * 계약의 출처: toss/baseline/fixtures/tournament-drafts-schema.json
 */

/** 초안에 담는 아티스트. 화면마다 모양이 조금씩 달라 이름만 요구한다. */
export type DraftArtist = { name?: string };

export type Stage =
  | { status: "artist_selection"; selectedArtists: DraftArtist[] }
  | { status: "track_selection"; selectedArtists: DraftArtist[]; selectedTracks: unknown[] };

const stageTitle = (selectedArtists: DraftArtist[]) =>
  selectedArtists.length > 0
    ? `${selectedArtists.map((a) => a.name).slice(0, 2).join(", ")} 외 월드컵 초안`
    : "내 음악 월드컵";

/**
 * 고르기 단계의 **온전한** 줄. 월드컵 진행에 쓰는 칸은 모두 컬럼 기본값으로 되돌린다.
 */
export function stageRow(userId: string, isSingle: boolean, stage: Stage, now = new Date()) {
  return {
    user_id: userId,
    is_single_artist: isSingle,
    status: stage.status,
    title: stageTitle(stage.selectedArtists),
    selected_artists: stage.selectedArtists,
    selected_tracks: stage.status === "track_selection" ? stage.selectedTracks : [],
    // ── 월드컵 진행 칸: 컬럼 기본값으로 ──
    phase: "loading",
    current_round_name: null,
    current_match_index: 0,
    bye_count: 0,
    progress: null,
    saved_at: null,
    skipped_tracks: [],
    // ── 옛 형식의 월드컵 칸: 지금은 쓰지 않지만 남기지 않는다 ──
    tracks: [],
    matches: [],
    winners: [],
    eliminated_tracks: [],
    selected_byes: [],
    updated_at: now.toISOString(),
  };
}
