# 컴포넌트

Sortify 화면에서 되풀이되는 요소를 모아 둔 문서다. 색·타이포는 [color.md](color.md),
[typography.md](typography.md)가 맡고, 여기서는 **요소의 생김새와 상태**만 다룬다.

피그마로 옮길 때 이 문서의 표를 그대로 variant/property 로 쓰면 된다.

코드는 대부분 `src/components/space/SpaceUI.tsx` 한 파일에 있다. 문자열 상수
(`primaryButton` 등)와 컴포넌트가 섞여 있는데, 상수는 `<button className={primaryButton}>`
처럼 쓰는 옛 방식이고 새로 만드는 것은 컴포넌트로 둔다.

---

## Button

누르면 무슨 일이 일어나는 것. 위계를 색이 아니라 **면의 진하기**로 나눈다.

| variant | 쓰임 | 면 | 글자 | 테두리 |
|---|---|---|---|---|
| primary | 화면에서 하려던 그 일 (공유하기, 링크 만들기) | `bg-brand` | `text-cream` | 없음 |
| secondary | 같은 자리의 다른 선택 (저장하기, 돌아가기) | `bg-navy/5` 또는 `bg-cream` | `text-navy` | 없음 / `border-navy/15` |
| ghost · textLink | 목록을 펼치는 정도의 가벼운 일 (전체 12곡 보기) | 없음 | `text-navy` | 아래 밑줄 `border-navy/20` |
| destructive | 되돌릴 수 없는 일 (탈퇴하기, 삭제) | `bg-danger/10` | `text-danger` | 없음 |
| icon | 글자 없이 아이콘만 (닫기, 뒤로) | 없음 / `hover:bg-navy/5` | `text-navy` | 없음 |
| floating | 화면 아래 고정된 한 쌍 | 위 primary·secondary 와 같음 | | |

- **크기**: `md` 높이 48px · 좌우 24px · radius `rounded-full`(시트·목록) 또는 `rounded-2xl`(하단 고정). `sm` 36px 는 칩과 같은 높이.
- **상태**: default · hover(면 한 단계 진하게) · active(`scale-[0.98]`) · focus(`outline-2 outline-[var(--t-point-ink)]`) · disabled(`opacity-50`, 커서 금지) · loading(글자를 "…하는 중이에요"로 바꾸고 비활성).
- **anatomy**: 컨테이너 → (아이콘) → 글자.
- **하지 말 것**: 한 화면에 primary 를 둘 두지 않는다. 되돌릴 수 없는 일에 primary 면을 쓰지 않는다 — 실수로 눌리는 자리가 된다.
- **접근성**: 아이콘만 있는 버튼은 `aria-label` 필수. 최소 탭 영역 44×44.

쓰는 곳: 결과 화면 하단(저장·공유), 시트 액션, 초대 화면, 탈퇴 시트.

---

## Input

한 줄 입력칸. `SpaceUI.Input`.

| variant | 설명 |
|---|---|
| default | 테두리 `border-navy/15` |
| error | 테두리 `border-danger` + **helper 자리에 오류 문구** |
| disabled | `opacity-50` |
| with helper | 아래 한 줄 회색 설명 |

- **높이** 48px · radius `rounded-2xl` · 바탕 `bg-cream`.
- **오류는 글자로 말한다.** 테두리 색만 바꾸면 색을 가르기 어려운 사람에게 아무것도 전해지지 않는다. `role="alert"` 로 읽어 준다.
- helper 와 error 는 **같은 자리**를 쓴다. 오류가 있으면 helper 를 밀어낸다 — 둘이 함께 쌓이면 입력칸이 화면에서 뛴다.

쓰는 곳: 닉네임 확인, 같이 소트하기 방 이름, 탈퇴 확인, 공유 이름.
(아직 전 화면을 옮기지 않았다. 새로 만드는 화면부터 이걸 쓴다.)

---

## Chip

여러 개가 한 줄에 놓이고 **고른 상태가 남는** 알약. `SpaceUI.Chip`.

| state | 면 | 글자 |
|---|---|---|
| default | `bg-navy/5` | `text-navy/70` |
| selected | `bg-brand` | `text-cream` |
| hover | 같은 면 | `text-navy` |

- 높이 36px · 좌우 16px · `rounded-full`.
- 하나만 고르면 `role="radio"`, 여럿이면 `checkbox`.
- **PaletteChip** 은 다르다 → 아래 별도 항목.

쓰는 곳: 모자이크 모양 고르기, 탈퇴 이유.

---

## PaletteChip · PalettePicker

취향 기록표 카드의 색 조합을 고르는 것. `src/components/result/PalettePicker.tsx`.

**anatomy**

```
[트리거]  40px 원 · 바탕=cardBg · 가운데 점=cardAccent · border-navy/15 · shadow-md
   ↓ 누르면 위로
[펼침]    캡슐 · bg-cream · border-navy/15 · shadow-lg · 안에 36px 칩 8개 가로 한 줄
          (첫 칸 = 기본으로 되돌리기, 그다음 프리셋 7개)
```

| state | 표시 |
|---|---|
| default | 테두리 `border-navy/15` |
| selected | `ring-2 ring-navy ring-offset-2 ring-offset-cream` |

- 칩 하나에 **색 두 개**를 보여 준다 — 바탕(cardBg)과 포인트(cardAccent). 바탕만으로는 조합을 알 수 없다.
- **칩을 눌러도 닫지 않는다.** 여러 색을 빠르게 견주는 것이 이 기능의 전부다. 바깥을 누르거나 Esc 로 닫는다.
- 트리거는 저장하기 버튼 **위**, 왼쪽 끝. 아래로 펼치면 화면 끝에 잘린다.
- 이 컨트롤은 카드 **밖**에 있으므로 저장·공유 이미지에 들어가지 않는다.

---

## BottomSheet / ConfirmSheet

아래에서 올라오는 판. `SpaceUI.Sheet`, `SpaceUI.ConfirmSheet`.

**anatomy**: 딤 → 손잡이 → header(제목 + 보조 설명) → body(스크롤) → footer(액션 세로 쌓기).

- 액션은 **세로로** 쌓는다. 가로로 두면 좁은 화면에서 글자가 두 줄이 된다.
- 되돌릴 수 없는 일은 `ConfirmSheet` 를 쓰고, 확인 버튼을 destructive 로 둔다.
- 닫기: 오른쪽 위 ✕ + 딤 누르기 + Esc. 셋 다 있어야 한다.
- 시트가 다른 모달 위에 뜰 일이 있으면 **아래 모달이 비킨다**(z 로 겨루지 않는다). 프로필 모달 → 탈퇴 시트가 그 예다.

자세한 문구 규칙은 [dialogs.md](dialogs.md).

---

## UnderlineTabs

한 화면 안에서 보는 것을 바꾸는 탭. `SpaceUI.UnderlineTabs`.

| state | 표시 |
|---|---|
| default | `text-navy/70` |
| active | `text-navy` + 아래 2px 포인트색 밑줄 |

- 옆에 숫자를 붙일 수 있다(`count`). **정확하지 않은 수는 붙이지 않는다** — 페이지를 나눠 받는 목록은 지금까지 받은 수일 뿐이다.
- 탭이 넷을 넘으면 좁은 화면에서 부딪힌다. 넷째부터는 탭을 늘리기 전에 **목록 안으로 합칠 수 있는지** 먼저 본다(내 취향표 + 같이 소트한 방이 그렇게 합쳐졌다).
- `role="tablist"` / `role="tab"` / `aria-selected`.

쓰는 곳: 취향 기록표 템플릿, 내 취향 스페이스.

---

## Toast

한 번 지나가는 알림. `SpaceUI.useToast` + `SpaceUI.Toast`.

| tone | 쓰임 |
|---|---|
| info | 됐다는 알림 (링크를 복사했어요) |
| error | 못 했다는 알림 + 할 수 있는 일 |

- 화면 아래 가운데, 3초.
- **오류 토스트는 무엇을 하면 되는지 함께 말한다.** "실패했어요"로 끝내지 않는다.
- 되돌릴 수 없는 일의 확인은 토스트로 하지 않는다 → 시트.

---

## EmptyState

아직 아무것도 없는 자리. `SpaceUI.EmptyState`.

**anatomy**: (아이콘) → 제목 → 설명 → primary 액션 → (secondary 액션)

- 제목은 **사실**만 말한다("아직 완성한 취향표가 없어요").
- 설명은 **다음에 할 일**을 말한다.
- 여러 목록이 한 화면에 합쳐졌으면 **둘 다 비었을 때만** 띄운다. 하나만 비었는데 "없어요"라고 하면 거짓말이 된다.

---

## Cover · Avatar

`SpaceUI.Cover`(사각, 앨범 재킷), `SpaceUI.Avatar`(원형, 사람).

- 이미지가 없으면 **빈 면**으로 둔다. 무관한 사진을 끌어오지 않는다(album-cover-policy).
- `size` 는 px 숫자로 받는다. 목록 48 · 큰 목록 56 · 아바타 24.

---

## 카드 팔레트 토큰

취향 기록표 카드 **안쪽에서만** 쓰는 색이다. 앱 화면 색과 섞지 않는다.
정의: `src/components/result/cardPalette.ts`, 주입: `TasteTemplates.CardSurface`.

| 토큰 | 쓰임 |
|---|---|
| `--card-bg` | 카드 바탕 |
| `--card-ink` | 제목·본문 |
| `--card-muted` | 날짜·아티스트명 |
| `--card-accent` | 1·2·3위, 포스터 상단 레이블 |
| `--card-line` | 구분선 |
| `previewHalo` | 미리보기 카드 둘레의 옅은 빛 (저장 이미지에는 없다) |
| `--card-disc-a/b` | 레코드형 LP 원판의 두 색. 어두운 프리셋은 연한 회색으로 뒤집는다 |

**기본값은 프리셋이 아니라 앱 테마다.** 아무것도 고르지 않으면 `--card-*` 가 `var(--t-*)` 를
가리켜 예전과 똑같이 보이고, 앱 테마를 바꾸면 카드도 따라간다. 프리셋은 "바꿨을 때" 나오는 것이다.
그래서 피커 첫 칸은 **기본으로 되돌리기**다 — 없으면 한 번 고른 뒤 돌아갈 길이 없다.

프리셋 7개: Sortify Classic · Paper Blue · Forest Gold · Plum Rose · Bubblegum Pop ·
Neon Lime · Midnight Pop.

**모든 프리셋은 `cardInk`·`cardMuted`·`cardAccent` 가 `cardBg` 위에서 4.5:1 을 넘는다.**
`toss/baseline/palette-check.mjs` 가 계산해서 확인한다 — 색을 고칠 때 이 검사를 함께 돌린다.

템플릿 안에서 `text-navy`·`text-point-ink` 같은 앱 토큰을 쓰지 않는다. 카드 색은
위 여섯 개로만 말한다. 그래야 프리셋 하나를 더해도 템플릿을 고치지 않는다.

---

## 아직 정리하지 않은 것

- Search input(아티스트 검색)은 아이콘·지우기 버튼이 붙어 있어 `Input` 과 형태가 다르다. 따로 둔다.
- 기존 화면의 입력칸은 아직 각자 클래스를 쓴다. 새 화면부터 `Input` 을 쓰고, 손대는 김에 하나씩 옮긴다.
- Modal(전체 화면)은 `ProfileModal` 하나뿐이라 컴포넌트로 빼지 않았다.
