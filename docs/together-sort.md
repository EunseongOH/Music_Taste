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

한자리에 모여(공연 대기줄, 술자리) **동시에** 하는 상황을 상정한다. 소트를 먼저 끝낼 필요가 없다.

1. **만들기** — 곡 세트만 정하면 된다. 소트 기록이 없어도 된다. 세 가지에서 가져온다.
   - **아티스트에서 고르기** — "한 아티스트 전곡" 모드와 같은 모양(검색창 + 동그란 아티스트 목록).
     아티스트를 고르면 전곡이 들어온다. 전곡 그대로 하거나 뺄 곡을 끈다.
     곡 목록은 **DB 에 이미 담긴 Spotify 캐시**에서만 읽는다(`/api/together/catalog`) — Spotify 를 호출하지 않는다.
     **전곡이 확실한 아티스트가 먼저 온다** — `together_artist_catalog` 뷰의 `coverage`
     (곡까지 받아 둔 앨범 ÷ 스포티파이가 말한 앨범 수) 순. 다만 **확보 여부는 화면에 적지 않는다**
     (2026-09-21): 이용자는 전곡이 있다고 생각하고 들어오는데 "일부만 있어요"를 붙이면
     없는 쪽을 먼저 알리는 꼴이 된다. 순서로만 쓴다.
   - **지금 고른 곡** — 곡 고르기에서 담아 둔 곡(월드컵을 아직 안 했어도 된다)
   - **내 취향표** — 이미 끝낸 취향표의 곡
   목록에서 **뺄 곡을 끄고** 만든다. Spotify 를 부르지 않는다(이미 가지고 있는 곡 정보만 쓴다).
   **로그인하지 않아도 만들 수 있다**(만든 사람 이름만 적는다).
2. **건네기** — `/together/<code>` 링크와 **7자 코드**가 나온다. 옆 사람에게는 코드를 부르는 쪽이 빠르다
   (`/together` 에서 코드를 입력해 들어온다). 결과 공유 링크(`/taste/<id>`)와 별개다.
3. **참여** — 아티스트·곡 수·지금까지 소트한 사람을 보고 "같은 곡으로 소트하기"를 누른다.
   기존 월드컵 화면이 **그 곡 세트 그대로** 열린다. 만든 사람도 똑같이 참여한다.
4. **일치율** — 소트가 끝나면 `/together/<code>/result` 에서 내 순위와 사람별 일치율을 본다.
   초대·결과 화면은 **8초마다 다시 읽어**, 옆 사람이 끝나면 그 자리에서 일치율이 채워진다.

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
| `sort_challenge_entries` | `id`, `challenge_id`, `participant_key`, `user_id`(nullable), `claim_token_hash`(nullable), `nickname`, `ranking jsonb`(곡 id 배열, 1위부터), `skipped_count`, `imported`, `created_at`, `UNIQUE(challenge_id, participant_key)`, `UNIQUE(challenge_id, user_id) WHERE user_id IS NOT NULL` |

### 신원과 소유권은 다른 것이다

| | 무엇 | 로그인하면 |
|---|---|---|
| `participant_key` | **참여 신원 = 기기.** 관계도의 내 자리. | **바뀌지 않는다** |
| `user_id` | **계정 소유권.** 비로그인 참여는 `null`. | `auth.uid()` 가 붙는다 |
| claim token | 익명 기록이 내 것임을 보이는 증명. 원문은 브라우저에만, DB 에는 sha-256 만. | — |

**로그인은 새 참여자가 되는 일이 아니다.** 이미 만든 기록에 계정을 붙이는 일이다.
예전에는 `participantKey(userId)` 가 로그인하면 계정 uuid 를 돌려줘 신원이 갈렸고,
익명으로 소트한 뒤 로그인하면 자기 기록을 못 찾아 "아직 소트하지 않았어요" 가 떴다.
저장 effect 가 새 키로 한 번 더 돌아 참가자가 한 명 늘기까지 했다(2026-09-24 고침).

`participant_key` 는 관계도 응답에 그대로 실린다. 그래서 **그 값만으로 소유권을 주장할 수
없게** 증명을 따로 둔다. 증명이 없는 옛 기록은 자동으로 붙이지 않는다 — 근거가 없다.
그 기록은 같은 기기에서는 계속 "내 결과" 로 보이지만, 다른 기기에서의 계정 조회는
보장하지 않는다.

RLS

- `sort_challenges`: 누구나 읽기. 만들기는 로그인 사용자(본인 `creator_id`)와 **비로그인(`creator_id` 없음)** 모두 가능
  — `20260918000001_together_anon_create.sql`. 모여서 쓰는 자리에서 로그인을 요구하지 않기 위해서다.
- `sort_challenge_entries`: 누구나 읽기(일치율을 보여줘야 한다), 누구나 쓰기(익명 참여 허용).
  **수정은 내 계정이 가진 행과 증명이 없는 옛 행만** — 그 전에는 이름만 "their own" 이고
  실제로는 `USING(true)` 라 아무나 아무 행이나 고칠 수 있었다(`20260924000001`).
- 새 저장·소유권 연결은 `SECURITY DEFINER` 함수를 지난다. `user_id` 는 인자로 받지 않고
  언제나 `auth.uid()` 에서 가져온다.
  - `save_sort_challenge_entry` — 고칠 자격 확인 + 저장. 같은 계정 기록이 그 방에 이미
    있으면 한 트랜잭션으로 합친다(참가자 수가 늘지 않는다).
  - `claim_sort_challenge_entry` — 익명 기록에 소유권을 붙인다. 증명이 맞을 때만.
  - `my_sort_challenge_entry` — 이 방에서 내 계정이 가진 기록의 id. 목록 조회에는
    `user_id` 를 싣지 않으므로 이걸로 따로 묻는다.

개인정보는 닉네임만 저장한다. 익명 참여자는 기기 localStorage 의 uuid 를 쓴다.
탈퇴하면 `user_id` 만 `null` 이 되고 순위는 남는다 — 다른 참가자의 일치율이 바뀌면 안 된다.

### 2026-09-25 — 기본 테이블을 잠갔다

앞 문단의 RLS 설명은 그때의 기록이다. 실제로는 **그것만으로 막히지 않았다.**

`anon`·`authenticated` 에게 이 테이블의 전 컬럼 SELECT·INSERT·UPDATE·DELETE 권한이
그대로 남아 있었다. RLS 만 보고 "수정은 내 것만" 이라고 적어 두었는데, UPDATE 정책의
둘째 갈래 `(user_id is null and claim_token_hash is null)` 은 **아무나** 통과한다.
`user_id` 를 자기 uuid 로 적으면 WITH CHECK 도 통과해서, 증명 없는 행은 누구나
가져갈 수 있었다. `save_sort_challenge_entry` 안에도 같은 문(`or claim_token_hash is
null`)이 있었고, 그 아래 `user_id = coalesce(v_uid, user_id)` 가 부르는 사람의 계정으로
덮어썼다. `participant_key` 는 목록 응답에 실려 있으니 추측할 필요조차 없었다.

운영 31건 중 **30건이 증명 없는 행**이었다. `20260925100000_together_lock_base_table.sql`
로 닫았다.

| | 전 | 후 |
|---|---|---|
| 테이블 SELECT | 전 컬럼 (`user_id`·`claim_token_hash` 포함) | 컬럼 단위 — 그 둘은 뺐다 |
| 테이블 INSERT·UPDATE·DELETE | 전 컬럼 | 없음. 쓰기는 RPC 만 |
| 쓰기 RLS 정책 | 허용만 하는 두 개 | 지웠다(권한이 없으니 뜻이 없다) |
| save RPC 의 수정 자격 | 증명 일치 · 내 계정 · **증명 없음** | 증명 일치 · 내 계정 |

규칙은 셋뿐이다.

| 행의 상태 | 누가 고칠 수 있나 | 운영 건수 |
|---|---|---|
| 증명이 있다 | 증명을 가진 사람 | 1 |
| 증명은 없고 `user_id` 가 있다 | 그 계정만 | 17 |
| 증명도 `user_id` 도 없다 | **아무도** (읽기 전용) | 13 |

옛 행은 지우지 않았고, 닉네임·순위가 같다는 이유로 계정에 붙이지도 않았다.

**알려진 결과**: 읽기 전용이 된 13건은 같은 기기에서 그 방을 다시 소트해도 고칠 수
없다 — 증명이 없으니 주인임을 보일 방법이 없다. 모두 출시 전 시험 데이터다.

`fetchMyChallenges` 가 `user_id` 로 걸러 찾던 것은 `my_sort_challenge_rooms()` RPC 로
옮겼다. 프론트가 그 컬럼을 읽지 않아야 컬럼을 닫을 수 있다.

RPC 실행 권한 (2026-09-25 `has_function_privilege` 로 확인)

| 함수 | PUBLIC | anon | authenticated |
|---|---|---|---|
| `save_sort_challenge_entry` | ✗ | **○** | ○ |
| `claim_sort_challenge_entry` | ✗ | ✗ | ○ |
| `my_sort_challenge_entry` | ✗ | ✗ | ○ |
| `my_sort_challenge_rooms` | ✗ | ✗ | ○ |
| `together_hash` | ✗ | ✗ | ✗ |

`save` 의 anon 만 열려 있다 — 익명 참여가 같이 소트하기의 전제다. PUBLIC 은 함수를
만들 때 기본으로 붙는 것이라 걷었다(`20260925110000`). 지금 당장 누가 더 할 수 있는
일은 없지만, 적힌 것과 실제가 다르면 나중에 역할을 하나 더 만들 때 아무도 의도하지
않은 채 열린다.

검사: `npm run check:db` (`toss/baseline/together-db-security-check.mjs`).
적용 **전에 먼저 돌려 7건이 빨갛게 뜨는 것을 확인**했다 — 못 잡는 검사는 검사가 아니다.

### 아직 남은 것 — `participant_key` 는 여전히 공개다

`participant_key` 는 기기 신원인데 방마다 그대로 실린다. 방 A·B·C 에서 같은 값이
보이면 **같은 기기임을 이어 붙일 수 있다.** 그 값만으로 기록을 고칠 수는 없게 됐지만
(위 표), 방을 건너 사람을 잇는 것은 막지 못한다.

이번에 같이 바꾸지 않은 이유: 화면이 이 값에 깊이 기대고 있다.

- 자기 판별 — `personName(e.nickname, e.participant_key === myKey)`
- 관계도 노드 키·선택 상태 (`together/[code]/result/page.tsx`)
- 다시 찾아온 비로그인 참여자가 자기 기록을 찾는 길

옮길 방향: **화면에는 `entry.id`** (방 안에서만 뜻이 있는 값)를 쓰고, 기기 신원은
`participant_key` 그대로 두되 목록 응답에서 뺀다. 자기 판별은 `resolveSelfIdentity`
한 곳을 지나므로, 그 함수가 기기 키 대신 "내 기록의 id" 를 받게 바꾸면 된다.
비로그인 재방문은 RPC 하나(`my_entry_by_key(challenge_id, participant_key)`)로
자기 id 만 돌려받는 식이 될 것이다.

`src/app/api/account/delete/route.ts` 가 `participant_key == user.id` 를 가정하던 것은
이번에 고쳤다(`user_id` 도 함께 본다). 옛 로그인 기록만 그 모양이었다.

## 화면 (모두 `/together` 아래, 어디에서도 링크하지 않는다)

| 경로 | 내용 |
|---|---|
| `/together` | 코드 입력해 들어가기 · 새로 만들기 |
| `/together/new` | 아티스트 검색·목록(전곡 확보 순) → 아래 섹션에서 이미 한 소트 가져오기 → 곡 켜고 끄기 → 만들기 → 코드·링크 보내기 |
| `/api/together/catalog` | 아티스트 찾기(`?q=`, 없으면 전곡 확보 상위 18명)·아티스트 전곡(`?artistId=`). 서버에서 캐시·뷰만 읽는다 |
| `/together/[code]` | 아티스트·곡 수·소트한 사람 목록(8초마다 갱신)·곡 미리보기 → [같은 곡으로 소트하기] / 이미 했으면 [일치율 보기] |
| `/together/[code]/result` | 내 순위 + 사람별 일치율(8초마다 갱신) + 코드·링크 다시 보내기 |

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
- **Spotify 호출**(캐시에 없는 아티스트는 목록에 뜨지 않는다. 캐시가 쌓이는 만큼 늘어난다).
- 알림·랭킹 보드·댓글.

## 진행 상황 (2026-09-18)

구현 완료. 진입점은 아직 없다 — 주소를 직접 열어야 한다(`/together/new`).

- 마이그레이션 `20260918000000_together_sort.sql` 운영 DB 적용 완료(새 테이블 2개, 기존 테이블 변경 없음).
- 화면 3개(`/together/new`, `/together/[code]`, `/together/[code]/result`)와 `utils/togetherMatch.ts`·`utils/togetherDb.ts`.
- 월드컵 화면에는 `?challenge=1` 로만 켜지는 분기 3곳.
- 로컬 확인(검사용 행은 지웠다):
  - 로그인 없이 "지금 고른 곡"으로 만들기 → 코드 발급 → 다른 사람이 `/together` 에서 코드 입력해 참여.
  - 참여자 2명이 각각 소트 → 평균 일치율 50%, 사람별 비교(1위 같음 · TOP 5 중 3곡 겹침 · 가장 갈린 곡).
  - **A 가 결과 화면을 켜 둔 상태에서 B 가 끝내자 10초 안에 A 화면에 일치율이 저절로 나타났다.**
  - 초대 화면에 소트한 사람 수와 이름이 쌓인다.
  - **소트 기록도 로그인도 없는 상태**에서 아티스트(윤하)를 찾아 전곡 169곡을 불러오고,
    6곡만 남겨 링크를 만드는 것까지 확인. 캐시만 읽으므로 Spotify 호출 0.
- 기존 검사 통과: remove-check(웹·토스), saved-view-check, baseline:verify 7/7, together-check.

2026-09-20 추가

- `/together` 의 [새로 만들기]를 **링크**로 바꿨다 — 자바스크립트가 붙기 전에 누르면 아무 일도 없었다.
- 아티스트 고르기를 "한 아티스트 전곡" 모드와 같은 모양으로 바꿨다(검색창 + 3열 동그란 목록,
  검색하면 줄 목록). 검색은 400ms 기다렸다 보낸다.
- `20260920000000_together_artist_catalog.sql` — `together_artist_catalog` 뷰(additive, 뷰 하나).
  전곡 확보율 순으로 정렬해 **전곡이 확실한 아티스트를 먼저** 보여준다(기본 목록 18명, 현재 전곡 보유 20명).
- "이미 한 소트에서 가져오기"를 아래 섹션으로 내렸다.

다음에 정할 것

- 진입점: 결과 화면 공유 시트 / 곡 고르기 화면 / 내 취향 스페이스 / 공개 취향표 화면 중 어디에 둘지.
- QR 코드(모여서 쓸 때 편하다) — 라이브러리를 하나 더 넣을지 정해야 해서 지금은 코드 입력으로 뒀다.
- 토스 미니앱 라우트 추가 여부(지금은 웹 전용).
- 참여자가 많아질 때의 화면(상위 몇 명만 보여줄지), 닉네임 없는 참여자 표시.

## 확인

- `npx tsc --noEmit`, 변경 파일 lint 오류 0.
- 일치율 계산은 순수 함수로 두고 `node --experimental-strip-types toss/baseline/together-check.mjs` 로
  같은 순위·뒤집힌 순위·부분 참여 등을 검사한다.
- 로컬에서 만들기 → 참여 → 일치율까지 한 번 통과(실제 Supabase 에 실험 테이블 행이 생긴다).
- 기존 검사(`saved-view-check`, `deeplink-check`, `share-check`, `baseline:verify`)가 그대로 통과하는지 확인한다.
