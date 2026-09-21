# 월드컵 나가기 확인 + 임시저장(24시간) + 취향 데이터 보관 계획 (v2)

작성일: 2026-09-21 · 대상 브랜치: `develop` · 관련 파일: `src/app/worldcup/page.tsx`, `src/utils/worldcupDb.ts`, `src/app/page.tsx`, `src/components/ProfileModal.tsx`, `src/app/tracks/page.tsx`, `src/app/explore/page.tsx`, `toss/app/src/*`

v1 대비 바뀐 결정: 자동저장 유지(버퍼) + 임시저장 버튼은 나가기 모달에만, 모드별 초안 1개씩, 플레이 단계만 24시간 만료(마지막 임시저장 시각 기준), "24시간이 새로 시작" 문구 삭제, 앱인토스 별도 설계, 완료 결과와 취향 데이터 보관 방안 추가.

---

## 0. 요약

| 주제 | 결정 |
|---|---|
| 나가기 확인 | 헤더 뒤로가기·브라우저 뒤로가기 → 모달. 헤더 저장 버튼은 두지 않는다 |
| 저장 방식 | **자동저장(버퍼)**: 곡 고를 때마다 1.5초 디바운스로 DB에 씀 (지금처럼, 다만 곡 ID만). **임시저장(확정)**: 모달의 "임시저장하고 나가기" → `saved_at` 기록 |
| 만료 | 확정 초안: `saved_at + 24h`. 미확정 버퍼: `updated_at + 1h` (예기치 않은 종료 복구용). 아티스트·곡 선택 초안은 만료 없음 |
| 모드별 초안 | 싱글 1개 + 멀티 1개. `user_id` 단독 유니크 인덱스 제거 |
| 이어하기 → 트랙 디깅으로 가는 버그 | 원인은 tracks·explore 페이지의 **배경 자동저장이 status를 강등**하는 것. 나가기 후 홈으로 보내고, 배경 저장은 선택이 실제로 바뀔 때만 |
| 진입점 | 홈 "이어하기" + 프로필 "내 취향 스페이스" 초안 카드. 둘 다 남은 시간 표시 |
| 앱인토스 | 자체 뒤로가기 버튼이 없음(심사 규정). 네비게이션 바 뒤로가기 → WebView history → 같은 가드로 모달. 홈 버튼(`homeEvent`)은 모달 불가 → 즉시 확정 저장 |
| 취향 데이터 | 완료 결과(`tournament_results`)는 그대로 두고 `picks`(매치별 선택, ID만) 컬럼 추가. 별도 테이블은 분석 시작 때 뷰로 풀어쓴다 |

---

## 1. 현재 상태와 원인 진단

### 1-1. 측정치 (2026-09-21 운영 DB)

| 항목 | 값 |
|---|---|
| DB 전체 | 205 MB / 무료 한도 500 MB. 상위는 `mb_release_track` 73 MB, `deezer_track` 27 MB, `mb_rg_release` 21 MB 등 canonical 테이블 |
| `tournament_drafts` | 16행, 504 KB (heap 88 KB, TOAST+인덱스 416 KB). update 2,695회 vs insert 86회 |
| `tournament_results` | 49행, 544 KB. 행 평균 4.9 KB, 최대 29 KB. 후보 평균 22곡, 최대 203곡. `ranking` 평균 2.3 KB |
| 곡 객체 하나 | ≈ 260 B (id, title, albumId, duration, albumImage, albumTitle, artistName) |

월드컵 관련 테이블은 DB의 0.5%다. 무료 용량을 잡아먹는 것은 canonical 테이블이지 월드컵이 아니다. 다만 초안은 지금 구조로 사용자가 늘면 행당 100 KB까지 커지므로 아래처럼 줄인다.

### 1-2. "이어하기가 트랙 디깅으로 간다"의 원인

1. 월드컵에서 뒤로가기 → `/tracks`로 돌아간다.
2. tracks 페이지의 배경 자동저장 `useEffect`(`src/app/tracks/page.tsx` L510~527)가 마운트 직후 실행되어 `status: 'track_selection'`으로 upsert 한다. `matches`/`winners`는 남지만 status가 바뀐다.
3. 홈 `handleRestore`는 status로 분기하므로 `/tracks`로 보낸다. 월드컵 페이지도 `status === 'playing'`일 때만 복원하므로 진행 데이터는 사실상 사라진다.

explore 페이지도 같은 패턴이다 (`src/app/explore/page.tsx` L411, `artist_selection`으로 강등). 두 페이지 모두 **선택이 실제로 바뀌었을 때만** 배경 저장하도록 고친다 (5장).

### 1-3. 그 밖의 문제

- `BackButton`은 게스트에게만 경고. 브라우저 뒤로가기는 처리 없음.
- `tracks` 컬럼은 항상 `[]` (`progressObj`에 `tracks`가 없음). 복원 시 `tracks` 상태가 비어 GA `total_rounds`가 틀림.
- `saveCompletedResult`/`overwriteCompletedResult`가 `deleteActiveDraft()`를 모드 없이 호출 → 두 모드 초안 모두 삭제.
- `unique_active_user_draft (user_id)` 때문에 사용자당 초안 1개. 싱글·멀티가 서로 덮어씀.

---

## 2. 완료 기준

1. 플레이 중 헤더 뒤로가기·브라우저 뒤로가기 → 모달. 즉시 이탈 없음.
2. 모달: 임시저장하고 나가기(24시간 안내 포함) / 저장하지 않고 나가기 / 계속하기.
3. 곡을 고를 때마다 DB 버퍼가 갱신되어, 탭이 죽어도 1시간 안에는 홈·취향 스페이스에서 이어진다.
4. 임시저장한 초안은 24시간 동안 홈·취향 스페이스에 "N시간 남음"으로 보이고 이어진다.
5. 싱글 모드 초안과 멀티 모드 초안이 서로 덮어쓰지 않는다.
6. 나간 뒤 이어하기가 **월드컵 화면의 같은 매치**로 돌아온다 (트랙 디깅으로 가지 않는다).
7. 초안 한 행 ≤ 50 KB, 자동저장 1회 페이로드 ≤ 16 KB (128곡 기준).
8. 완료 결과에 매치별 선택 기록(`picks`)이 남는다.
9. 앱인토스: 네비게이션 바 뒤로가기 → 모달, 홈 버튼 → 확정 저장.

---

## 3. 화면 흐름 (웹)

### 3-1. 나가기 모달

트리거: `<BackButton onClick={() => setExitModal(true)} />`, `popstate` 가드(3-3). `phase === "playing"`일 때만.

```
┌──────────────────────────────────┐
│  (LP 그래픽)                      │
│  월드컵을 그만둘까요?             │
│                                  │
│  128강 중 48강까지 진행했어요.    │
│  임시저장하면 24시간 동안 보관되고 │
│  홈이나 내 취향 스페이스에서       │
│  이어할 수 있어요.                │
│                                  │
│  [ 임시저장하고 나가기 ]  navy     │
│      24시간 동안 보관돼요          │
│  [ 저장하지 않고 나가기 ] red      │
│          계속하기                 │
└──────────────────────────────────┘
```

마크업은 tracks 페이지 `exitWizardStep` 카드(`src/app/tracks/page.tsx` L2014~)를 그대로 가져온다.

| 버튼 | 동작 |
|---|---|
| 임시저장하고 나가기 | 디바운스 타이머 취소 → `saveWorldcupDraft(state, { confirm: true })` (await) → `router.push("/")`. 게스트면 `LoginModal`을 연다. 로그인 성공 후 모달로 돌아오면 다시 누른다 |
| 저장하지 않고 나가기 | `deleteActiveDraft(mode)` + 로컬 `worldcup_progress` 삭제 (`worldcup_tracks`는 유지) → `router.push("/")`. 이전에 임시저장한 내역도 함께 지워진다. 본문에 그렇게 적는다 |
| 계속하기 | 닫기 |

**홈(`/`)으로 보내는 이유.** `/tracks`로 돌아가면 1-2의 강등이 일어난다. tracks 페이지의 나가기 마법사도 `router.push("/")`를 쓴다. 곡을 다시 고르고 싶으면 홈 → 이어하기(트랙 단계 초안이 아니므로) 대신 새로 시작을 고르게 된다. 초안이 살아 있는 상태에서 `/tracks`에 들어가더라도 5장의 가드로 강등되지 않는다.

문구 (ko/en):

| 키 | ko | en |
|---|---|---|
| exitTitle | 월드컵을 그만둘까요? | Leave the World Cup? |
| exitDesc | {total}강 중 {round}까지 진행했어요.\n임시저장하면 24시간 동안 보관되고, 홈이나 내 취향 스페이스에서 이어할 수 있어요. | You're at {round} of {total}.\nSave to keep it for 24 hours and resume from Home or My Taste Space. |
| saveAndExit | 임시저장하고 나가기 | Save and leave |
| saveAndExitSub | 24시간 동안 보관돼요 | Kept for 24 hours |
| discardAndExit | 저장하지 않고 나가기 | Leave without saving |
| discardSub | 임시저장한 내역도 함께 삭제돼요 | Saved progress is deleted too |
| continue | 계속하기 | Keep playing |
| loginToSave | 로그인하고 임시저장하기 | Log in to save |

`{round}`는 `getLocalizedRoundName(currentRoundName)`, `{total}`은 `getInitialRoundSize(tracks.length)`.

### 3-2. 진입점 표시 (홈 이어하기 모달, 프로필 "내 취향 스페이스" 초안 카드)

`status === 'playing'`인 초안에 한 줄:

- 확정(`saved_at` 있음): `64강 진행 중 · 임시저장 23시간 남음`
- 버퍼(`saved_at` 없음): `64강 진행 중 · 자동저장 · 48분 후 삭제`

남은 시간은 `draftExpiresAt(draft)` 헬퍼 하나로 계산한다 (4-3). 두 화면의 이어하기 동작 자체는 5장 참고.

### 3-3. 브라우저 뒤로가기 가로채기

Next 16은 `window.history.pushState`를 라우터와 동기화한다 (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` "Native History API"). 토스 빌드의 라우터(`toss/app/src/router.tsx`)도 pushState + popstate 기반이라 같은 코드가 그대로 동작한다.

```ts
// worldcup/page.tsx
useEffect(() => {
  if (phase !== "playing") return;
  history.pushState(null, "", location.href);      // 가드용 항목
  const onPop = () => {
    if (leavingRef.current) return;
    history.pushState(null, "", location.href);    // 가드 복구
    setExitModal(true);
  };
  addEventListener("popstate", onPop);
  return () => removeEventListener("popstate", onPop);
}, [phase]);
```

나갈 때는 `leavingRef.current = true; router.push("/")`. 히스토리에 `/worldcup` 항목이 남지만, 홈에서 뒤로가면 월드컵 페이지가 초안을 다시 읽어(있으면 복원, 없으면 `/tracks`) 문제없다.

`beforeunload`는 넣지 않는다. 새로고침·탭 닫기는 로컬 `worldcup_progress`와 DB 버퍼가 복구한다. 브라우저 기본 다이얼로그는 문구를 바꿀 수 없어 이득이 없다.

---

## 4. 저장 모델

### 4-1. 두 단계

| | 자동저장 (버퍼) | 임시저장 (확정) |
|---|---|---|
| 언제 | 곡 고를 때마다, 1.5초 디바운스 (지금과 같음) | 나가기 모달 "임시저장하고 나가기" |
| 무엇을 | `progress`(ID만), `phase`, `current_round_name`, `current_match_index`, `updated_at`. `selected_tracks`는 **판이 시작될 때 한 번**만 | 버퍼와 같음 + `saved_at = now()` + `selected_tracks` 다시 씀 |
| 보관 | `updated_at + 1시간` | `saved_at + 24시간` |
| 이어하기에 보이나 | 예 (자동저장 표시) | 예 (남은 시간 표시) |

자동저장을 유지하는 이유: (1) 버튼을 눌렀을 때 보낼 것이 거의 없어 즉시 끝난다, (2) 앱인토스 홈 버튼·탭 강제 종료처럼 모달을 띄울 수 없는 이탈을 복구한다, (3) DB 행은 사용자·모드당 하나라 쓰기 횟수가 저장 용량을 늘리지 않는다.

확정 뒤에 계속 플레이하면 버퍼가 같은 행을 갱신한다. 만료는 `saved_at` 기준 그대로다 ("마지막 임시저장 시각"). 다시 임시저장하면 `saved_at`이 갱신된다 — 모달에는 이 문구를 넣지 않는다.

### 4-2. 모드별 초안

`unique_active_user_draft (user_id)`를 지우고 `(user_id, is_single_artist)` 유니크만 남긴다. 모든 upsert의 `onConflict`를 `'user_id,is_single_artist'`로, 모든 `loadActiveDraft`/`deleteActiveDraft` 호출에 모드를 넘긴다.

### 4-3. 만료 계산 (한 곳)

```ts
// worldcupDb.ts
export const draftExpiresAt = (d: { status: string; saved_at: string | null; updated_at: string }) =>
  d.status !== "playing" ? null
  : d.saved_at ? new Date(d.saved_at).getTime() + 24 * 3600_000
  : new Date(d.updated_at).getTime() + 3600_000;
```

`loadActiveDraft`에서 `draftExpiresAt(d) < Date.now()`이면 삭제 후 `null`. 홈·프로필 카드도 같은 함수로 남은 시간을 그린다. cron이 아직 안 돌았을 때의 이중 방어.

---

## 5. DB 설계

### 5-1. 마이그레이션 — 두 파일로 나눔

운영(sortify.kr)은 main 코드로 돈다. 아래 SQL 중 유니크 인덱스 제거와 cron 은 main 의 옛 코드를 깨뜨리므로(`onConflict: 'user_id'` 실패, `saved_at` 없는 자동저장 초안 1시간 뒤 삭제) **새 코드가 main 에 배포되는 시점에** 적용해야 한다. 그래서 둘로 나눴다.

| 파일 | 내용 | 상태 |
|---|---|---|
| `20260921100100_worldcup_draft_v2.sql` | `progress`, `saved_at`, `tournament_results.picks` 컬럼 추가. 옛 코드에 무해 | **운영 적용 완료 (2026-09-21)** |
| `20260921100200_worldcup_draft_mode_ttl.sql` | `is_single_artist` not null, `unique_active_user_draft` 제거, cron `worldcup-draft-ttl` | **미적용.** develop → main 병합·배포와 붙여서 적용 |

2번을 적용하기 전까지 develop 코드는: 같은 사용자가 싱글·멀티 두 모드의 초안을 동시에 만들려 하면 두 번째 upsert 가 `user_id` 유니크 위반으로 실패한다(콘솔 에러, 다른 동작은 정상). 만료는 클라이언트 가드(`isDraftExpired`)만 동작한다.

전체 SQL (참고용, 두 파일의 합):

```sql
-- 1. 진행 상태(곡 ID만) + 확정 시각
alter table public.tournament_drafts
  add column if not exists progress jsonb,
  add column if not exists saved_at timestamptz;

-- 2. 모드별 초안: user_id 단독 유니크 제거. (user_id, is_single_artist) 유니크는 이미 있다.
update public.tournament_drafts set is_single_artist = false where is_single_artist is null;
alter table public.tournament_drafts
  alter column is_single_artist set default false,
  alter column is_single_artist set not null;
alter table public.tournament_drafts drop constraint if exists unique_active_user_draft;
drop index if exists public.unique_active_user_draft;

-- 3. 완료 결과에 매치별 선택 기록
alter table public.tournament_results
  add column if not exists picks jsonb;

-- 4. 만료. 플레이 단계만. 아티스트·곡 선택 초안은 건드리지 않는다.
-- 끄기: select cron.unschedule('worldcup-draft-ttl');
select cron.schedule('worldcup-draft-ttl', '17 * * * *', $$
  delete from public.tournament_drafts
   where status in ('playing', 'pre_tournament')
     and ( (saved_at is null     and updated_at < now() - interval '1 hour')
        or (saved_at is not null and saved_at   < now() - interval '24 hours') )
$$);
```

- pg_cron 1.6.4 이미 활성 (`mb-worker`, `explore-genre-tags`).
- 유니크 인덱스 제거는 "추가만" 원칙의 예외다. 사용자가 모드별 초안을 결정했으므로 진행한다. 기존 행은 `(user_id)` 유니크였으니 `(user_id, is_single_artist)`도 자동으로 유니크라 충돌 없음.
- 부분 인덱스는 넣지 않는다. 행이 10만 개를 넘으면 `(status, updated_at)` 부분 인덱스 추가.
- `expires_at` 컬럼은 만들지 않는다. `saved_at`/`updated_at`으로 계산 가능.

### 5-2. `progress` 모양

```jsonc
{
  "v": 1,
  "matches":    [["idA","idB"], ...],        // 현재 라운드 대진
  "winners":    ["id", ...],                 // 현재 라운드 진출 확정 (부전승 포함)
  "eliminated": ["id", ...],                 // 탈락 순서 (최근 탈락이 앞)
  "picks":      [[128, "idW", "idL"], ...]   // 매치마다 [라운드 크기, 이긴 곡, 진 곡]
}
```

- `matches`/`winners`/`eliminated`는 지금 React 상태를 ID로 바꾼 것이라 복원이 단순하다. `picks`에서 유도할 수 있지만 부전승 처리가 끼어 코드가 늘어 넷 다 둔다.
- `picks`의 라운드 크기는 `getCurrentRoundNumber()` 값. 예선전은 다음 라운드 크기에 `-1`을 곱해 구분 (`64강 진출 예선전` → `-64`).
- 계속 쓰는 컬럼: `status`, `phase`, `current_round_name`, `current_match_index`, `selected_tracks`, `selected_artists`, `title`, `is_single_artist`, `updated_at`, `saved_at`, `progress`.
- 더 이상 쓰지 않는 컬럼: `tracks`, `matches`, `winners`, `eliminated_tracks`, `selected_byes`, `bye_count`, `skipped_tracks` (기본값 유지, 나중에 정리).
- `status='playing'`이고 `progress`가 `null`인 옛 행은 "진행 없음"으로 본다. 옛 형식 읽기 코드는 쓰지 않는다. 첫 cron이 지운다.

### 5-3. 용량 (128곡 한 판)

| | 현재 | 변경 후 |
|---|---|---|
| 곡 객체 | 4개 컬럼 중복 ≈ 110 KB | `selected_tracks` 1개 ≈ 33 KB, 판 시작 시 1회 + 확정 시 1회 |
| 진행 상태 | (위에 포함) | ≈ 16 KB (matches 3.2 + winners 1.6 + eliminated 3.2 + picks 7.6) |
| 행 최대 | ≈ 110 KB | ≈ 50 KB |
| 자동저장 1회 페이로드 | ≈ 80~110 KB | ≈ 16 KB (첫 회만 +33 KB) |
| 한 판 전송량 | ≈ 10 MB | ≈ 2 MB |
| 보관 | 무기한 | 1시간 / 24시간 |

초안 테이블 상한 = 동시 활성 초안 수 × 50 KB. 1,000명이 동시에 128곡 판을 저장해도 50 MB, 실제 후보 평균(22곡)으로는 10 MB 미만.

`selected_tracks`는 tracks 페이지가 써 둔 값과 실제 참가곡이 다를 수 있으므로(운영에 264곡 선택 / 100곡 참가 행 존재) 판 시작 시 `tracks` 상태로 덮어쓴다. 복원 시 ID → 곡 매핑이 항상 완전해진다.

### 5-4. 완료 결과와 취향 데이터 보관

**무료 용량 검토.** `tournament_results`는 행 평균 4.9 KB. 128곡 결과는 `ranking` ≈ 28 KB + `picks` ≈ 7.6 KB ≈ 36 KB.

| 완료 결과 수 | 평균 22곡 기준 | 전부 128곡 기준 |
|---|---|---|
| 1,000 | 6 MB | 36 MB |
| 10,000 | 60 MB | 360 MB |
| 100,000 | 600 MB | — |

1만 판까지는 무료 한도 안에서 문제없다. 그 전에 canonical 테이블(현재 170 MB)이 먼저 한도에 닿는다.

**지금 할 것.**
- `tournament_results.picks jsonb` 추가. 완료 시 `progress.picks`를 그대로 옮긴다 (`saveCompletedResult`, `overwriteCompletedResult`에 인자 하나). ID만이라 128곡 판에 7.6 KB.
- `ranking`은 그대로 둔다. 공유 취향표(`/taste/[id]`)가 제목·이미지를 여기서 읽는다.
- 별도 "취향 이벤트" 테이블은 **만들지 않는다.** 한 판이 127행이 되어 인덱스까지 치면 jsonb보다 크고, 지금 읽는 곳이 없다.

**분석을 시작할 때 (나중에).** `picks`를 그대로 SQL로 풀 수 있다.

```sql
-- 어떤 곡이 어떤 곡을 이겼는지 (사용자, 시각 포함)
create materialized view taste_pick as
select r.id as result_id, r.user_id, r.created_at, r.is_single_artist,
       (p->>0)::int as round_size, p->>1 as winner_id, p->>2 as loser_id
  from tournament_results r, jsonb_array_elements(r.picks) p;
-- 곡별 최종 순위
select r.user_id, e.ordinality as rank, e.value->>'id' as track_id
  from tournament_results r, jsonb_array_elements(r.ranking) with ordinality e;
```

**canonical DB가 운영에 올라간 뒤.** `ranking`을 ID만 남기고 제목·이미지는 canonical 테이블에서 조인하면 결과 행이 28 KB → 3 KB로 준다. 공유 페이지가 조인 결과를 읽도록 바꿔야 하므로 이 계획에는 넣지 않는다.

---

## 6. 앱인토스 별도 설계

토스 빌드는 `src/app/**` 페이지를 무수정으로 쓰고 alias 로 몇 파일만 치환한다 (`toss/app/vite.config.mts`). 환경 차이:

| 항목 | 웹 | 앱인토스 |
|---|---|---|
| 자체 뒤로가기 버튼 | `BackButton` | 없음. 심사 규정으로 빈 칸 shim (`toss/app/src/shims/BackButton.tsx`) |
| 뒤로가기 경로 | 브라우저 버튼·스와이프 → `popstate` | 네비게이션 바 뒤로가기 → WebView history → `popstate` (router.tsx 주석으로 확인). iOS 스와이프는 `allowsBackForwardNavigationGestures: false`로 꺼져 있음 |
| 홈 버튼 | 없음 | 네비게이션 바 홈 → 미니앱 종료. 모달을 띄울 수 없음 |
| SDK 이벤트 | — | `graniteEvent.addEventListener('backEvent' \| 'homeEvent', { onEvent })` (`@apps-in-toss/web-framework` 3.4) |

설계:

1. **뒤로가기 → 모달**: 3-3의 popstate 가드가 그대로 동작한다. 추가 코드 없음. 검증 항목 (8장 ⑤)에서 실기기로 확인하고, 안 되면 `backEvent`로 같은 `setExitModal(true)`를 부른다.
2. **홈 버튼 → 즉시 확정 저장**: 모달을 띄울 수 없으므로 `homeEvent`에서 `saveWorldcupDraft(state, { confirm: true })`를 부른다. 사용자에게 24시간 안내를 못 하지만, 데이터를 더 오래 보관하는 방향이라 해가 없다. 돌아오면 홈 이어하기에 "임시저장 23시간 남음"으로 보인다.
3. **구현 위치**: `src/utils/platform.ts`에 `onAppExit(cb: () => void): () => void` 추가. 웹 구현은 아무것도 안 하고 빈 해제 함수를 돌려준다. 토스 구현(`toss/app/src/platform.toss.ts`)은 `graniteEvent.addEventListener('homeEvent', { onEvent: cb })`. 월드컵 페이지는 `useEffect(() => onAppExit(flushAndConfirm), [phase])` 한 줄. 페이지 코드는 두 빌드에서 동일하게 유지된다 (platform 어댑터의 기존 원칙).
4. **나가기 버튼을 화면에 두지 않는다**: 자체 네비게이션과 겹쳐 심사 반려 소지가 있다. 뒤로가기(모달)와 홈(자동 확정)으로 모든 이탈 경로가 덮인다.

---

## 7. 코드 변경 목록

### `src/utils/worldcupDb.ts`

| 항목 | 변경 |
|---|---|
| `saveTournamentProgress` | 삭제 → `saveWorldcupDraft(state, opts: { confirm?: boolean; withTracks?: boolean }, selectedArtists, isSingle)`. 페이로드: `status:'playing'`, `phase`, `current_round_name`, `current_match_index`, `progress`, `updated_at`; `withTracks`면 `selected_tracks = state.tracks`; `confirm`이면 `saved_at = now()` (+ `withTracks`). 자동저장은 `saved_at`을 페이로드에서 빼서 upsert가 건드리지 않게 한다 |
| `toCompact(state)` / `hydrateDraft(draft)` | 순수 함수. hydrate는 `selected_tracks`로 `Map<id, Track>`을 만들어 복원. ID 하나라도 없으면 `null` |
| `draftExpiresAt(draft)` | 4-3 |
| `loadActiveDraft(isSingle)` | 모드 필수. 만료면 삭제 후 `null` |
| `deleteActiveDraft(isSingle)` | 모드 필수 |
| 모든 upsert | `onConflict: 'user_id,is_single_artist'` |
| `saveTrackSelectionDraft`, `downgradeDraftToArtistSelection` | 페이로드에 `progress: null, saved_at: null` |
| `saveCompletedResult`, `overwriteCompletedResult` | `picks` 인자 추가 → `tournament_results.picks`. `deleteActiveDraft(options.isSingleArtist)` |

### `src/app/worldcup/page.tsx`

- 상태 추가: `picks: [number, string, string][]`, `exitModal`, `leavingRef`, `tracksWrittenRef`.
- `handleDrop`: `setPicks(p => [...p, [roundNum, winner.id, loser.id]])`.
- 자동저장 `useEffect`: `progressObj`에 `picks` 포함(로컬). DB는 `saveWorldcupDraft(state, { withTracks: !tracksWrittenRef.current })` → 성공 시 `tracksWrittenRef.current = true`. `startRound`가 새 판(`tracks` 변경)으로 시작하면 ref 초기화.
- `loadState`: DB 초안은 `hydrateDraft()`로. `setTracks(hydrated.tracks)`, `setPicks(hydrated.picks)`. 로컬 폴백도 `picks` 읽기.
- 헤더: `<BackButton onClick={() => setExitModal(true)} />`.
- popstate 가드(3-3), `onAppExit(flushAndConfirm)`(6장).
- 모달 JSX(3-1). 게스트면 `LoginModal`.
- 완료 시(`phase === 'finished'`): `sessionStorage.setItem("worldcup_picks", JSON.stringify(picks))` — taste 페이지가 결과 저장 시 읽는다. 기존 `worldcup_ranking`과 같은 방식.

### `src/app/taste/page.tsx`

- `saveCompletedResult(..., { picks: JSON.parse(sessionStorage.getItem("worldcup_picks") || "[]") })`. 완료 후 `worldcup_picks` 삭제.

### `src/app/page.tsx` (홈), `src/components/ProfileModal.tsx`

- `handleRestore` / `handleResumeDraft`: `progressObj`를 만들어 로컬에 쓰는 블록("3. Set worldcup_progress")을 **삭제**하고 `worldcup_progress`를 `removeItem`. 로그인 사용자의 월드컵 페이지는 DB 초안을 먼저 읽는다. 옛 컬럼이 빈 배열이 된 뒤 이 블록이 남아 있으면 빈 대진이 로컬에 써져 화면이 빈다.
- status 분기는 그대로 (`playing` → `/worldcup?mode=`).
- 카드/모달에 3-2 한 줄. 만료된 초안은 목록에서 뺀다 (`draftExpiresAt`).
- 홈 `checkDrafts`, 프로필 `fetchArchives`는 모든 초안을 읽으므로 모드별 2개가 그대로 보인다. 변경 없음.

### `src/app/tracks/page.tsx`, `src/app/explore/page.tsx` — 강등 방지

배경 자동저장 `useEffect`(tracks L510, explore L411)에 `lastSavedRef`를 두고, 선택 집합의 직렬화(`[...selectedTrackIds].sort().join()`)가 마지막 저장값과 같으면 저장하지 않는다. 마운트 직후 복원된 선택은 저장값과 같으므로 강등이 일어나지 않는다. 사용자가 실제로 곡·아티스트를 바꾸면 그때 강등된다 (의도한 재선택). 명시적 저장 경로(`handleStartWorldCup`, 나가기 마법사, 아티스트 확정 버튼)는 그대로.

### 자체 검사

`scripts/worldcup-draft-check.ts` — `npx tsx --test`. 128곡 가짜 상태 → `toCompact` → `hydrateDraft` 왕복이 원본과 같은지, ID 하나 빠지면 `null`인지, `progress` 직렬화가 20 KB 미만인지, `draftExpiresAt`이 세 경우(확정/버퍼/비플레이)를 맞게 주는지 `assert`. 프레임워크 없음.

---

## 8. 영향 범위

| 흐름 | 영향 | 조치 |
|---|---|---|
| 홈 이어하기, 취향 스페이스 이어하기 | 초안 형식 변경 | 로컬 progress 안 씀. 월드컵 페이지가 hydrate |
| /tracks → 월드컵 시작 | `handleStartWorldCup`가 `worldcup_progress` 삭제 후 진입 | 변경 없음. 새 판이므로 `tracksWrittenRef` 초기화 |
| 월드컵 완료 → /taste 저장 | `picks` 추가, 모드별 삭제 | 7장 |
| 게스트 | DB 저장 없음 | 모달 임시저장 → 로그인 |
| 로그아웃 | 로컬 삭제 (기존) | 변경 없음 |
| 마이그레이션 순서 | `progress`/`saved_at` 없으면 저장 실패 | **마이그레이션 먼저 → 배포**. 반대 순서면 옛 코드가 새 컬럼을 무시하므로 무해 |
| 유니크 인덱스 제거 | 옛 코드의 `onConflict: 'user_id'`가 실패 | 위와 같이 마이그레이션 → 즉시 배포. 배포 전 창(수 분)에는 옛 코드의 초안 저장이 실패하고 콘솔 에러만 남는다. 새벽 시간대에 적용 |
| 토스 빌드 | 페이지 공유, `platform` 어댑터 확장 | `platform.toss.ts`에 `onAppExit` 구현. `npm run check:toss` 통과 |
| GA | `total_rounds` 정확해짐 | `tournament_exit`(save/discard/continue) 이벤트 한 줄 (선택) |

---

## 9. 검증 계획

1. `npx tsx --test scripts/worldcup-draft-check.ts` 통과.
2. **로컬 시나리오 (로그인)**
   - 128곡 시작 → 30매치 → 헤더 뒤로가기 → 모달 → 임시저장하고 나가기 → 홈에 "64강 진행 중 · 임시저장 23시간 남음" → 이어하기 → 31번째 매치, `picks` 30개.
   - 이어서 10매치(저장 안 함) → 탭 닫기 → 홈 → "자동저장 · 59분 후 삭제" → 이어하기 → 41번째 매치.
   - 브라우저 뒤로가기 → 모달 → 저장하지 않고 나가기 → 홈에 초안 없음, DB 행 없음.
   - 싱글 모드 초안 하나 + 멀티 모드 초안 하나 동시에 존재, 각각 이어하기.
   - 프로필 → 내 취향 스페이스 → 초안 카드 → 이어하기 → 월드컵 같은 매치.
   - 저장 후 `/tracks`에 직접 들어갔다 나와도 status가 `playing`으로 남는지 (강등 방지).
3. **DB**: `select pg_column_size(progress), saved_at, jsonb_array_length(selected_tracks) from tournament_drafts where user_id = …` → progress 20 KB 미만. 완료 후 `tournament_results.picks` 길이 = 매치 수.
4. **만료**: 테스트 행의 `saved_at`을 25시간 전으로 → 정각 17분 후 삭제. `saved_at null` + `updated_at` 2시간 전 → 삭제. 클라이언트 가드는 cron 끄고 홈에서 안 보이는지.
5. **앱인토스 실기기** (`npm run dev:toss`, 토스 샌드박스): 네비게이션 바 뒤로가기 → 모달이 뜨는지, 나가기 확정 후 홈 화면인지. 홈 버튼 → 다시 들어왔을 때 "임시저장 N시간 남음"인지. 안 되면 `backEvent` 구독으로 대체.
6. **웹 실기기**: iOS Safari 스와이프 뒤로가기, Android Chrome 하드웨어 뒤로가기.
7. **게스트**: 임시저장 → 로그인 모달 → 로그인 → 다시 임시저장 → 성공.

---

## 10. 남은 확인 항목

① 미확정 버퍼 보관 시간 **1시간**으로 잡았다. 탭이 죽은 뒤 1시간 안에 돌아오면 이어지고, 넘기면 사라진다. 더 길게(3시간) 원하면 cron 한 줄만 바꾼다.

② "저장하지 않고 나가기"는 **이전 임시저장 내역까지 삭제**한다. 임시저장 시점으로 되돌리려면 스냅샷 컬럼이 하나 더 필요해 넣지 않았다. 모달 본문에 명시한다.

③ 앱인토스 홈 버튼 시 **안내 없이 확정 저장**한다. 24시간 안내를 못 보지만 데이터를 잃지 않는 쪽이다.

---

## 11. 진행 상태 (2026-09-21, develop)

| 항목 | 상태 |
|---|---|
| 마이그레이션 1/2 (컬럼 추가) | 운영 적용 완료 |
| 마이그레이션 2/2 (모드별 인덱스 + cron) | 파일만 작성. main 배포 시 적용 |
| `worldcupDb.ts` — `toCompact`/`hydrateDraft`/`draftExpiresAt`/`formatDraftExpiry`/`saveWorldcupDraft`, 모드 필수화, `picks` | 완료 |
| `worldcup/page.tsx` — picks 누적, 자동저장(ID만·곡 객체 1회), 나가기 모달, popstate 가드, `onAppExit`, 게스트 로그인 유도 | 완료 |
| `platform.ts` / `platform.toss.ts` — `onAppExit` (토스: `graniteEvent homeEvent`) | 완료 |
| 홈·ProfileModal — progressObj 블록 삭제, 만료 초안 제외, 남은 시간 표시, 프로필 이어하기에 모드 쿼리 | 완료 |
| tracks·explore — 배경 저장 가드(선택 집합 변경 시에만) | 완료 |
| ResultScreen — `worldcup_picks` → `tournament_results.picks` | 완료 |
| 자체 검사 `scripts/worldcup-draft-check.ts` | 5/5 통과 |
| `tsc --noEmit` (웹) | 통과. 토스 tsconfig 의 `result-lab/notFound` 오류는 기존 것 |
| 9장 2·5·6·7 (실기기·브라우저 시나리오) | **미실행.** 배포 후 확인 필요 |

결과 저장에서 `picks` 는 "고른" 매치만 담는다. 빼기(모르는 곡)로 넘어간 매치는 선택이 아니므로 넣지 않는다.
