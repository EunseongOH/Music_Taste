# 방향 전환 — 한 아티스트 소트 + 같이 소트하기 중심으로

> 2026-09-21 · `develop` · 대상 브랜치 worktree `C:\Users\User\Music_Taste-share`
> 결정: **믹스 매치 월드컵(여러 아티스트)을 현재 서비스에서 내린다. 코드는 언제든 되살릴 수 있게 남긴다.**

---

## 1. 결정 요약

| | 지금 | 이 계획 뒤 |
|---|---|---|
| 최애 곡 소트하기 (아티스트 한 명) | 모드 1 | **중심 모드** |
| 같이 소트하기 (`/together`) | 실험, 진입점 없음 | **두 번째 기둥, 홈에 진입점** |
| 믹스 매치 월드컵 (여러 아티스트) | 모드 2 | **진입점 차단**(코드·데이터 보존, 복원 절차 문서화) |
| 내 취향 스페이스 · 우리의 취향 아카이브 | 보조 | 그대로. **이미 만들어진 믹스 매치 취향표 27건도 그대로 보인다** |

접는 것은 **만드는 길**이지 **이미 만들어진 것**이 아니다. 기존 믹스 매치 취향표는 계속 열리고, 공유 링크도 살아 있고, 아카이브 뱃지("믹스 매치")도 남는다.

---

## 2. 왜 지금인가 — 근거

### 2.1 쿼터는 이미 두 번 터졌다 (실측)

`spotify_429_log` 전체:

| 날짜 | 엔드포인트 | 이유 | 차단 시간 | 그날 호출 수 |
|---|---|---|---|---|
| 2026-09-16 | `/v1/artists/{id}/albums` | QUOTA_EXCEEDED | 85,618초 (≈24h) | (기록 전) |
| 2026-09-17 | `/v1/artists/{id}/albums` | QUOTA_EXCEEDED | 40,283초 (≈11h) | **81** |

**하루 81콜에서 터졌다.** 그리고 게이트(`spotify_endpoint_gate`)는 **세는 것과 터진 뒤 막는 것**만 한다 — 사전 상한이 없어서, 한도가 어디든 우리는 매번 벽에 부딪히고 나서야 멈춘다.

> ⚠️ **이 계획의 가장 중요한 사실**: 터진 엔드포인트 `/v1/artists/{id}/albums` 는 **믹스 매치가 아니라 한 아티스트 전곡 모드**가 쓰는 것이다. 믹스 매치를 내리는 것만으로는 쿼터 문제가 풀리지 않는다. 그래서 이 문서는 **2부(§7 비용 대책)를 반드시 함께** 실행하는 것을 전제로 한다.

오늘(9/21) 집계: `/v1/albums/{id}/tracks` 197 · `/v1/search` 90 · `/v1/artists/{id}/albums` 59.

### 2.2 믹스 매치가 태우는 호출은 캐시가 먹지 못한다

| 호출 | 누가 | 캐시 |
|---|---|---|
| `/v1/artists/{id}/related-artists` | **믹스 매치 전용** (단일 모드는 `explore/page.tsx:613` 에서 먼저 빠져나간다) | 메모리 10분뿐, **DB 캐시 없음** |
| 위 호출 실패 시 폴백 장르 검색 | 믹스 매치 | **랜덤 오프셋 20~100** + 캐시 조회가 이름 ilike 라 **히트율 ≈ 0** |
| 장르 무한스크롤 `/v1/search` | 믹스 매치 기본 동선 (스크롤 1회당 최대 3콜) | 부분적 |
| `/v1/artists/{id}/albums`, `/v1/albums/{id}/tracks` | **한 아티스트 전곡 모드** | DB 캐시 21일 → **같은 아티스트 두 번째 사용자부터 Spotify 0콜** |

추정(코드 배수 기준, 실측 아님) — 아티스트 8명 한 판: 믹스 매치 약 89콜 중 **24~42콜이 재사용 불가**. 단일 모드 한 판 약 85콜은 **전부 캐시에 쌓여 다음 사람에게 0콜**이 된다.

즉 두 모드의 콜 수는 비슷하지만 **성격이 정반대다.** 단일 모드의 비용은 *적립*이고 믹스 매치의 비용은 *소모*다. DB를 모으는 지금 단계에서 소모성 호출을 먼저 끄는 게 맞다.

### 2.3 Supabase 대역폭도 믹스 매치 쪽이 무겁다

- Spotify 콜 1회 = Supabase 요청 최소 1건(게이트 RPC), 캐시 미스면 3건. 콜이 줄면 그대로 줄어든다.
- `tournament_drafts.selected_tracks` 자동저장(1.5초 디바운스)이 **선택 곡 배열 전체**를 매번 올린다. 아티스트 8명분(수백 곡) → 1명분으로 줄면 판당 수백 KB → 수십 KB.
- (모드와 무관한 별건) `explore-taste`·`archive` 가 `tournament_results` 를 **`select("*")` + limit 없이** 읽는다. 공개 결과가 쌓일수록 진입마다 선형으로 커진다. §7.4 에 둔다.

### 2.4 사용 데이터가 이미 그렇게 움직였다

| | 전체 결과 | 최근 30일 | 평균 곡 수 |
|---|---|---|---|
| 한 아티스트 | 15 | **8** | 39 |
| 믹스 매치 | 27 | **1** | 16 |

진행 중 드래프트: 한 아티스트 9건(최근 4건) · 믹스 매치 6건 **전부 8월 9일 이전**. → **진입점을 닫아도 진행 중인 판을 끊지 않는다.**

### 2.5 목표에 맞다

초기 목표가 "소트라는 놀이를 알리는 것 + 같은 아티스트를 좋아하는 사람끼리 주고받게 하는 것"이라면, 같은 곡 세트를 공유하는 고리(`/together`)는 **한 아티스트 모드에서만 성립한다**. 믹스 매치 결과는 남에게 건네도 같이 할 수가 없다.

---

## 3. 복원 가능성 — 어떻게 보장하나

**방식: 기능 플래그 한 개 + 커밋 경계 + 태그.** 파일을 지우지 않는다.

```ts
// src/config/modes.ts
/**
 * 믹스 매치 월드컵(여러 아티스트) 모드.
 * 2026-09-21 비용·집중 이유로 내렸다. 되살리는 법: docs/mode-pivot.md §10.
 */
export const MIX_MATCH = false;
```

- 화면·링크·메타데이터는 이 상수로 가린다. 코드는 그대로 남는다 → `MIX_MATCH = true` 한 줄로 웹은 즉시 복원된다.
- 토스 빌드만 예외다. 라우트 표(`toss/app/src/App.tsx`)에서 빼야 **번들에서도 빠진다**(관리자 화면을 빼는 것과 같은 방식). 주석으로 한 줄 복원법을 남긴다.
- 검사 스크립트의 믹스 매치 케이스는 **한 커밋으로 묶어** 지운다 → `git revert <그 커밋>` 으로 되살린다.
- 작업 끝에 태그 `mix-match-off` 를 찍는다. 그 직전 커밋이 "믹스 매치가 살아 있던 마지막 상태"다.

**하지 않는 것**: 파일 삭제, DB 열 삭제, 기존 데이터 정리. (`tournament_drafts.is_single_artist` 는 upsert 유니크 키라 지우면 전부 깨진다.)

---

## 4. 무엇을 건드리나 — 전수 목록

### 4.1 믹스 매치 전용 파일 (플래그로 가리기만)

| 파일 | 처리 |
|---|---|
| `src/app/genres/page.tsx` (262줄) | 그대로 둔다. `next.config.ts` 리다이렉트로 도달 불가 |
| `src/app/genres/layout.tsx` | 그대로 |

`src/utils/curatedArtists.ts` 는 **공용이다** — 단일 모드도 장르 16개를 전부 주입해 같은 사전을 읽는다(`explore/page.tsx:248-266`). 건드리지 않는다.

### 4.2 진입점 차단 (P1 커밋)

| 위치 | 지금 | 바꿀 것 |
|---|---|---|
| `src/app/page.tsx:41-48` | `modes[1]` = 믹스 매치 카드 | `MIX_MATCH` 면 포함, 아니면 **같이 소트하기 카드로 교체**(§6) |
| `src/app/page.tsx:84` | `?mode=multi` → 카드 인덱스 1 | 플래그 꺼짐이면 인덱스 0 |
| `src/app/page.tsx:116-119` | 카드 인덱스 ↔ `is_single_artist` 매핑 | 카드 id 기준으로 바꾼다(인덱스 하드코딩 제거) |
| `src/app/page.tsx:223-240` | 드래프트 이어하기 라우팅 | **믹스 매치 드래프트는 목록에서 제외**(6건 전부 8월 이전) |
| `src/app/page.tsx:325-336` | JSON-LD: 믹스 매치가 position 1, 단일 URL 이 `/genres?mode=single` (**이미 틀렸다**) | 믹스 매치 항목 제거 + 단일 URL 을 `/explore?mode=single` 로 정정 + 같이 소트하기 항목 추가 |
| `src/app/page.tsx:575-577` | 푸터 `/genres` 링크 | 제거(플래그) |
| `src/components/ProfileModal.tsx:54-74` | 드래프트 이어하기(홈과 중복 구현) | 홈과 같은 필터 |
| `src/app/sitemap.ts:14` | `/genres` | 플래그로 제외 |
| `next.config.ts` | — | `MIX_MATCH` 꺼짐이면 `/genres → /explore?mode=single` **301**. 404 보다 SEO·북마크에 낫다 |
| `toss/app/src/App.tsx:3,24` | `/genres` 라우트 | 주석 처리(+복원 한 줄 안내) |
| `src/app/worldcup/layout.tsx:4,7` | title "믹스매치 월드컵 - Sortify" | 모드 중립 문구로 |
| `src/app/taste/[id]/page.tsx:225-227` | CTA 가 `/?mode=multi` | 플래그 꺼짐이면 `/?mode=single` |

### 4.3 기본 모드 전환 (P1 같은 커밋)

`?mode` 가 없을 때 지금은 "믹스 매치"다. 플래그가 꺼지면 단일이 기본이 되어야 한다 — 세 곳, 각각 한 줄:

- `src/app/explore/page.tsx` — `isSingleArtistMode` 계산
- `src/app/tracks/page.tsx` — 같은 계산
- `src/app/worldcup/page.tsx:144` — 같은 계산

```ts
const isSingleArtistMode = !MIX_MATCH || params.get("mode") === "single";
```

이러면 `!isSingleArtistMode` 로 갈리는 분기(explore 하단 도크·유사 아티스트 주입·장르 뱃지, tracks 의 `else` 경로)는 **코드가 남은 채 실행만 되지 않는다.** 복원 시 자동으로 되살아난다.

### 4.4 건드리지 않는 것 (읽기 경로)

- `archive/page.tsx`, `explore-taste/page.tsx` 의 "믹스 매치" 뱃지 — 기존 27건이 그렇게 표시돼야 한다.
- `TasteTemplates.tsx` 의 `cardHeading`("{아티스트} 외 {n}명"), `WinnerReveal` 의 아티스트명 노출, `ResultScreen.buildShareText` 의 `믹스 매치 취향표 TOP 10` — 전부 **곡 데이터로 판단**하므로 저장된 믹스 결과에 계속 맞는다.
- DB 열 전부(`is_single_artist`, `selected_artists`).

---

## 5. 검사 동기화 (P2 커밋 — 되돌리기 단위)

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `toss/baseline/flow-check.mjs:57` | `CASES` 에 `/genres` | 케이스 제거 |
| `toss/baseline/flow-check.mjs:62-70` | `/explore` 를 **믹스 매치 문구**(`어떤 아티스트를 좋아하시나요?`, `선택 장르`)로 단언 | 단일 모드 시드 + 단일 모드 문구로 |
| `toss/baseline/flow-check.mjs:236-263` | `startHref(multi) === '/genres'` | 믹스 매치 절 제거, 단일·같이 소트하기로 |
| `toss/baseline/router-check.mjs:70-84` | 푸터 `a[href="/genres"]` 로 클라이언트 라우팅 검증 | **`a[href="/explore?mode=single"]`** 로 교체(푸터에 이미 있다) |
| `toss/baseline/web-regression.mjs:55-60` | 장르 시드 `/explore` | 단일 모드 시드로(코드 경로는 공용이라 그대로 통과) |
| `toss/baseline/share-check.mjs:313-320` | 믹스 결과 공유 문구 | **유지**. 읽기 경로이고 픽스처 기반이라 계속 통과해야 한다 |
| `toss/store/capture-screenshots.mjs:45-50` | `2-genres`, `3-explore`(믹스 픽스처) | 단일 모드 · 같이 소트하기 화면으로 교체 후 **재촬영** |
| `toss/baseline/bundle-check.mjs` | 관리자 화면 미포함 검사 | **같은 방식으로 "장르 화면 문구 미포함" 1개 추가** — 번들에서 빠졌는지 자동 확인 |

`saved-view-check` · `deeplink-check` · `layout-check` · `together-check` · `remove-check` · `session-check` 는 `/genres` 를 쓰지 않는다 — 영향 없음.

---

## 6. 같이 소트하기 진입점 (드디어 정한다)

믹스 매치가 비운 자리에 넣는다. 홈 카드 수는 4장 그대로.

| 순서 | 카드 | 목적지 |
|---|---|---|
| 1 | 최애 곡 소트하기 | `/explore?mode=single` |
| 2 | **같이 소트하기** (새로) | `/together` |
| 3 | 내 취향 스페이스 | `/explore-taste` |
| 4 | 우리의 취향 아카이브 | `/archive` |

카드 문구(초안): 뱃지 "둘 이상" · 제목 "같이 소트하기" · 설명 "같은 곡을 각자 소트하고, 취향이 얼마나 닮았는지 확인해요." · 버튼 "시작하기"

추가 진입점 두 곳 (P3):

1. **결과 화면 공유 시트** — "이 곡들로 같이 소트하기" → `/together/new` (방금 만든 취향표가 곡 출처로 이미 잡힌다)
2. **공개 취향표 `/taste/[id]` 하단** — "나도 이 곡들로 소트하기". 같은 아티스트 팬에게 전달되는 자리라 전환이 가장 높을 자리다.

GA: `home_mode_click { mode_id: "together" }` 가 자동으로 잡힌다. 별도 이벤트는 만들지 않는다.

---

## 7. 비용 대책 — 남기는 모드 쪽 (이게 진짜 절반이다)

### 7.1 게이트에 **사전 상한**을 넣는다 (가장 중요)

지금 `spotify_endpoint_gate(ep)` 는 세기만 하고, Spotify 가 429 를 줘야 막는다. 엔드포인트별 일일 상한을 넣어 **터지기 전에** 멈춘다.

```sql
-- supabase/migrations/2026XXXXXXXXXX_spotify_soft_limit.sql (additive)
alter table spotify_endpoint_quota add column if not exists daily_limit int;  -- null = 무제한
-- gate 함수: calls_today >= daily_limit 이면 false 를 돌려준다(차단 기록 없이).
update spotify_endpoint_quota set daily_limit = 60  where endpoint = '/v1/artists/{id}/albums';  -- 81에서 터졌다
update spotify_endpoint_quota set daily_limit = 250 where endpoint = '/v1/albums/{id}/tracks';
update spotify_endpoint_quota set daily_limit = 120 where endpoint = '/v1/search';
```

**선행 확인**: `spotifyFetch` 가 게이트 false 를 받았을 때 어떻게 동작하는지 먼저 읽고, 그 동작이 "캐시에 있는 것만 보여주고 조용히 멈춘다"인지 확인한다. 아니면 그렇게 고친다. 화면에는 "지금은 이 아티스트의 일부만 준비돼 있어요"로 알린다.

### 7.2 전곡 모드의 백그라운드 로더를 상한에 맡긴다

`tracks/page.tsx:584-684` 의 `loadRemainingPagesInBackground` 는 사용자가 아무것도 누르지 않아도 **앨범 목록 전 페이지 + 전 앨범 트랙**을 800ms 간격으로 끝까지 긁는다. 발매 60~80장 아티스트면 **한 명에 100콜 이상** — 9/17 에 81콜로 터진 것의 정체가 이것이다.

지금 단계의 처방은 **코드를 다시 쓰지 않고 §7.1 상한에 맡기는 것**이다. 이미 캐시된 아티스트는 Spotify 콜이 0이라 아무 제약을 받지 않고, 캐시가 없는 아티스트만 하루 상한까지만 적재된다. 그래도 부족하면 그때 "연 앨범 + 최신 N장 우선"으로 바꾼다.

### 7.3 캐시가 찬 아티스트를 먼저 보여준다 (재사용)

`/explore?mode=single` 의 기본 목록을 **`together_artist_catalog` 뷰**(이미 만들어 뒀다, `coverage` = 곡까지 받아 둔 앨범 ÷ Spotify 가 말한 앨범 수) 순으로 정렬한다. 같이 소트하기 만들기 화면에서 쓰는 것과 같은 방식·같은 API 를 쓴다.

효과가 두 겹이다 — 신규 적재가 줄고(비용), 고른 순간 바로 곡이 뜬다(체감 속도). 캐시에 없는 아티스트는 검색으로 계속 갈 수 있게 둔다(적재 경로를 막지는 않는다).

### 7.4 Supabase `select("*")` 정리 (모드와 무관, 같이 처리)

- `explore-taste/page.tsx:212-232` — `select("*")` 2회, **limit 없음**. 필요한 열만 + 페이지네이션.
- `archive/page.tsx:304-307` — 공개 결과 전건 `select("*")`, 탭 전환마다 재실행.
- `spotify.ts` 의 캐시 조회 4곳(`:399, :628, :710, :993`) — `select('*')` → 필요한 열만.

`ranking` jsonb 가 행마다 곡 전체(제목·아티스트·커버 URL)라 결과가 쌓일수록 선형으로 무거워진다. **지금 42건일 때 고치는 게 싸다.**

---

## 8. DB

**스키마 변경 없음.** 유일한 추가는 §7.1 의 `daily_limit` 열 하나(additive, 기본 NULL = 지금과 동일 동작).

- `tournament_drafts.is_single_artist` — not null default false, `(user_id, is_single_artist)` 유니크가 모든 upsert 의 onConflict 키다. **절대 건드리지 않는다.**
- 믹스 매치 드래프트 6건·결과 27건 — 그대로 둔다.

발견해 둔 기존 불일치(이번에 고치지 않고 기록만, 복원 시 함정):

1. `worldcupDb.ts:18,47,73` — 모드 인자 생략 시 `selectedArtists.length === 1` 로 모드를 추론한다. 믹스 매치에서 1명만 고른 드래프트가 단일로 저장될 수 있다.
2. `worldcupDb.ts:348` 은 `?? false`, `:428` 은 `?? true` — 기본 모드가 서로 반대다. 지금은 호출부가 항상 명시해서 드러나지 않는다.
3. `ResultScreen.tsx:148-150` — 모드 판정 기준이 두 가지(플래그 vs 실제 곡의 아티스트 수)로 갈려 있다. 공유 문구만 후자를 쓴다.

---

## 9. 순서와 게이트

| 단계 | 내용 | 통과 기준 |
|---|---|---|
| P0 | `src/config/modes.ts` 플래그 + 이 문서 커밋, 태그 `mix-match-off` 직전 커밋 확인 | — |
| P1 | 진입점 차단 + 기본 모드 전환 (§4.2, §4.3) — **한 커밋** | 홈에 믹스 매치 카드 없음, `/genres` → `/explore?mode=single` 301, 토스 번들에 장르 화면 없음 |
| P2 | 검사 동기화 (§5) — **한 커밋**(되돌리기 단위) | `check:web`, `check:toss`, `remove-check`, `saved-view-check`, `baseline:verify` 전부 통과 |
| P3 | 같이 소트하기 진입점 3곳 (§6) | 홈 → `/together` → 코드 발급 → 참여까지 실제로 한 바퀴 |
| P4 | 비용 대책 (§7.1~7.3) | 상한에 걸렸을 때 화면이 깨지지 않고 캐시분만 보여줌 |
| P5 | 문구·메타데이터 정리 (§4.2 하단, `ux-writing.md` 용어표에 "믹스 매치 월드컵 — 현재 미노출" 표시) | — |
| P6 | 스토어 스크린샷 재촬영 · 실기기 확인 · **(허가 후) main** | 사용자 확인 |

P1~P2 는 같은 날 붙여서 한다(중간 상태로 두면 검사가 빨갛다). P4 는 독립적이라 언제든 먼저 해도 된다 — 오히려 **P4 를 먼저 하는 게 안전하다**(쿼터가 또 터지면 어느 모드든 못 쓴다).

---

## 10. 되살리는 법

1. `src/config/modes.ts` 의 `MIX_MATCH = true`
   → 홈 카드·푸터·JSON-LD·sitemap·`/genres` 리다이렉트·기본 모드가 한 번에 돌아온다.
2. `toss/app/src/App.tsx` 의 `/genres` 라우트 주석 해제(2줄).
3. 검사 복원: `git revert <P2 커밋>`.
4. 스토어 스크린샷 재촬영(`toss/store/capture-screenshots.mjs`).
5. `docs/design-system/ux-writing.md` 용어표의 "현재 미노출" 표시 제거.

완전 삭제로 가더라도 태그 `mix-match-off` 직전 커밋에 전체 코드가 남아 있다.

---

## 11. 위험과 대비

| 위험 | 대비 |
|---|---|
| **쿼터가 다시 터진다** — 믹스 매치를 내려도 원인 엔드포인트는 남는 모드 것이다 | §7.1 사전 상한을 **P4 로 미루지 말고 먼저** 하는 것을 권한다 |
| **다른 세션과 충돌** — 지금 `develop` 에서 UX 라이팅 커밋이, 메인 체크아웃에서 의견 수집 기능(`docs/feedback-plan.md`)이 동시에 진행 중이다. 둘 다 `src/app/page.tsx` 를 만진다 | P1 에서 `page.tsx` 를 건드리기 전에 통보하고, 작업 직전 `git pull --rebase` |
| **토스 심사본과 스크린샷 불일치** | P6 에서 재촬영. 제출 전 `bundle-check` 로 장르 화면 미포함 확인 |
| `/genres` 색인 손실 | 301 리다이렉트로 `/explore?mode=single` 에 신호를 넘긴다(404 아님) |
| **단일 모드 퍼널 지표 공백** — `funnel_artist_complete` 는 지금 믹스 매치 도크에서만 발화한다(`explore:1101`). 믹스를 내리면 이 이벤트가 0이 된다 | P1 에서 단일 모드 확정 시점(`pendingSingleArtist` 확인)에 같은 이벤트를 추가 |
| 되돌릴 일이 생김 | §10, 5분 작업 |

---

## 12. 열린 결정 (사용자 확인 필요)

1. **홈 카드 2번 자리를 같이 소트하기로 채울지**, 아니면 카드를 3장으로 줄이고 같이 소트하기는 결과 화면에서만 열지.
2. `/genres` 를 **301 리다이렉트**로 할지 404 로 할지 (권장: 301).
3. §7.1 의 일일 상한 숫자 (제안: albums 60 · album tracks 250 · search 120). 보수적으로 갈수록 "일부만 준비됨" 화면을 보는 사람이 늘어난다.
4. §7.4 의 `select("*")` 정리를 이번에 같이 할지, 별건으로 뺄지.
