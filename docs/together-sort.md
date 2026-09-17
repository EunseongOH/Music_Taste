# 같이 소트하기 (실험)

> 2026-09-18 · `develop` · **현재 서비스 플로우와 연결하지 않는다**(진입점 미정).
> 이 문서는 기능의 목적·구조·구현 범위를 적는다. 화면 코드는 `src/app/together/*` 안에만 둔다.

## 왜 만드나

- 아티스트 DB 확보에 시간이 걸린다. 이용자가 아티스트를 넓게 여는 것보다 **한 아티스트를 깊게** 쓰는 쪽이
  Spotify 호출·DB 확보 측면에서 유리하다([[spotify-limit-first]] 메모와 같은 방향).
- 그러면서도 **공유로 퍼지는** 고리가 필요하다. 결과를 보여주는 링크는 받는 사람이 구경만 하고 끝난다.
- 그래서 "같은 곡 세트로 너도 해 봐" → "우리 둘이 얼마나 비슷한지" 로 이어지는 링크를 만든다.
  같은 아티스트를 좋아하는 사람끼리 주고받으므로, 새 아티스트 데이터를 확보하지 않아도 참여가 늘어난다.

## 흐름

1. **만들기** — 이미 끝낸 내 취향표 하나를 고르고, 곡 목록에서 **뺄 곡을 끄고**(전곡 그대로도 가능) 챌린지를 만든다.
   Spotify 를 부르지 않는다 — 곡 정보는 이미 저장된 취향표(`tournament_results.ranking`)에서 가져온다.
2. **공유** — `/together/<code>` 링크가 나온다. 결과 공유 링크(`/taste/<id>`)와 별개다.
3. **참여** — 링크로 들어온 사람은 아티스트·곡 수·참여자 수를 보고 "같은 곡으로 해보기"를 누른다.
   기존 월드컵 화면이 **그 곡 세트 그대로** 열린다.
4. **일치율** — 소트가 끝나면 `/together/<code>/result` 에서 내 순위와, 같은 링크로 소트한 사람들과의 일치율을 본다.
   다시 공유할 수 있는 링크를 그 자리에서 준다.

## 일치율 계산

두 사람이 같은 곡 세트를 각자 줄 세웠을 때의 **순위 거리**로 잰다(스피어만 footrule).

```
공통 곡 n개, 내 순위 rᵢ, 상대 순위 sᵢ
distance = Σ |rᵢ − sᵢ|
maxDistance = floor(n² / 2)          // 완전히 뒤집힌 경우
일치율 = round((1 − distance / maxDistance) × 100)
```

- 곡을 "모르는 곡"으로 뺀 사람이 있으면 **두 사람 모두 순위를 매긴 곡**만 비교한다(그 수를 함께 표시).
- 보조 지표: 1위가 같은지, TOP 5 중 겹치는 곡 수.
- 사람이 여럿이면 일치율이 높은 순으로 보여주고, 평균 일치율도 함께 적는다.

## 데이터

`supabase/migrations/20260918000000_together_sort.sql` — **additive**(새 테이블 2개만, 기존 테이블 변경 없음).

| 테이블 | 열 |
|---|---|
| `sort_challenges` | `id`, `code`(공유 링크용 짧은 문자열, unique), `creator_id`(nullable), `creator_nickname`, `artist_name`, `title`, `tracks jsonb`(id·title·artistName·albumImage), `source_result_id`, `created_at` |
| `sort_challenge_entries` | `id`, `challenge_id`, `participant_key`(로그인 사용자는 uid, 아니면 기기별 uuid), `nickname`, `ranking jsonb`(곡 id 배열, 1위부터), `skipped_count`, `created_at`, `UNIQUE(challenge_id, participant_key)` |

RLS

- `sort_challenges`: 누구나 읽기, **로그인 사용자만** 만들기(본인 `creator_id`).
- `sort_challenge_entries`: 누구나 읽기(일치율을 보여줘야 한다), 누구나 쓰기(익명 참여 허용), 수정·삭제 없음.
  같은 사람이 다시 하면 같은 `participant_key` 로 덮어쓴다(upsert).

개인정보는 닉네임만 저장한다. 익명 참여자는 기기 localStorage 의 uuid 를 쓴다.

## 화면 (모두 `/together` 아래, 어디에서도 링크하지 않는다)

| 경로 | 내용 |
|---|---|
| `/together/new` | 내 취향표 목록 → 하나 고르기 → 곡 켜고 끄기 → 만들기 → 링크 복사 |
| `/together/[code]` | 아티스트·곡 수·참여자 수·곡 미리보기 → [같은 곡으로 해보기] / 이미 했으면 [결과 보기] |
| `/together/[code]/result` | 내 순위 요약 + 참여자별 일치율 + 링크 다시 공유 |

## 기존 코드에 닿는 부분 (최소·되돌리기 쉬움)

월드컵 엔진을 그대로 쓰기 위해 `src/app/worldcup/page.tsx` 에 **쿼리 플래그 `?challenge=1` 로만 켜지는 분기 3곳**을 둔다.
평소 흐름에서는 이 플래그가 없으므로 동작이 달라지지 않는다.

1. 진행 중인 드래프트 불러오기를 건너뛴다(챌린지 곡 세트가 덮이면 안 된다).
2. 진행 상황을 서버 드래프트에 저장하지 않는다(사용자의 원래 이어하기를 덮지 않는다).
3. 끝났을 때 `/taste` 대신 `/together/<code>/result` 로 보낸다(`sessionStorage.together_code`).

그 밖의 화면·문구·검사는 건드리지 않는다. 기능을 접으면 이 세 분기와 `src/app/together/*`, 테이블만 지우면 된다.

## 하지 않는 것 (지금은)

- 홈·결과 화면 등 **진입점 추가**(자리를 정한 뒤에).
- 토스 미니앱 라우트 추가(웹 실험 먼저).
- 새 아티스트 검색·Spotify 호출(기존 취향표의 곡만 쓴다).
- 알림·랭킹 보드·댓글.

## 진행 상황 (2026-09-18)

구현 완료. 진입점은 아직 없다 — 주소를 직접 열어야 한다(`/together/new`).

- 마이그레이션 `20260918000000_together_sort.sql` 운영 DB 적용 완료(새 테이블 2개, 기존 테이블 변경 없음).
- 화면 3개(`/together/new`, `/together/[code]`, `/together/[code]/result`)와 `utils/togetherMatch.ts`·`utils/togetherDb.ts`.
- 월드컵 화면에는 `?challenge=1` 로만 켜지는 분기 3곳.
- 로컬에서 8곡 챌린지로 참여자 2명 흐름 확인: 초대 → 소트 → 저장 → 평균 일치율 56%,
  사람별 비교(1위 다름 · TOP 5 중 4곡 겹침 · 가장 갈린 곡) 표시. 검사용 행은 지웠다.
- 기존 검사 통과: remove-check(웹·토스), saved-view-check, baseline:verify 7/7, together-check.

다음에 정할 것

- 진입점: 결과 화면 공유 시트 / 내 취향 스페이스 / 공개 취향표 화면 중 어디에 둘지.
- 토스 미니앱 라우트 추가 여부(지금은 웹 전용).
- 참여자가 많아질 때의 화면(상위 몇 명만 보여줄지), 닉네임 없는 참여자 표시.

## 확인

- `npx tsc --noEmit`, 변경 파일 lint 오류 0.
- 일치율 계산은 순수 함수로 두고 `node --experimental-strip-types toss/baseline/together-check.mjs` 로
  같은 순위·뒤집힌 순위·부분 참여 등을 검사한다.
- 로컬에서 만들기 → 참여 → 일치율까지 한 번 통과(실제 Supabase 에 실험 테이블 행이 생긴다).
- 기존 검사(`saved-view-check`, `deeplink-check`, `share-check`, `baseline:verify`)가 그대로 통과하는지 확인한다.
