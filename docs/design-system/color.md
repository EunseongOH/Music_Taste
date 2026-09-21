# Sortify 색 시스템

> 2026-09-21 제정 · 토큰 정의: `src/app/globals.css` `@theme` · 짝 문서: `typography.md`, `ux-writing.md`
> 새 화면·수정 화면은 이 문서의 토큰만 쓴다. `bg-red-500`, `text-[#…]` 같은 Tailwind 팔레트·임의 색을 직접 쓰지 않는다.

## 1. 원칙

1. **색은 다섯 개.** cream(바탕) · navy(글자·주 버튼) · point(강조 선·면) · point-ink(강조 글자) · danger(파괴적 행동). 그 밖의 색은 이 다섯의 투명도(`/5` `/10` `/40` `/70`)로 만든다.
2. **역할로 고른다.** "삭제니까 danger" 식으로 정한다. 색 이름으로 고르지 않는다.
3. **빨강은 파괴적 행동에만.** 오류 문구·삭제·저장하지 않고 나가기. 경고·안내에는 쓰지 않는다(navy/70 글자로 충분하다).
4. **장식 아이콘을 두지 않는다.** 확인 창의 그림(회전하는 LP, 트로피)은 정보가 없다. 아이콘은 행동이 있는 자리(닫기, 뒤로)에만 둔다.
5. **작은 글자는 4.5:1 이상.** cream 위 글자 색은 아래 표의 대비를 지킨다.

## 2. 토큰

| 토큰 | 값 | 역할 | cream 위 글자 대비 |
|---|---|---|---|
| `cream` | #F5F2ED | 화면·시트·카드 바탕 | — |
| `navy` | #1A2A6C | 기본 글자, 주 버튼 면, 구분선(`navy/10`), 옅은 면(`navy/5`) | 11.8:1 |
| `charcoal` | #2D3436 | 본문 대체 색(레거시). 새 화면은 navy 를 쓴다 | 11.2:1 |
| `point` | #E67E22 | 강조 선·면(탭 밑줄, 스위치, 진행 막대). **글자에는 쓰지 않는다** | 2.6:1 |
| `point-ink` | #A65309 | 강조 글자(순위 숫자, "공개") | 4.9:1 |
| `danger` | #9E3B2F | 파괴적 행동의 글자·면, 오류 토스트 면 | 6.0:1 (이 색 위 cream 글자 6.0:1) |

`danger` 를 벽돌빛으로 잡은 이유: Tailwind 의 red-500(#EF4444)·red-700(#B91C1C)은 채도가 높아 cream·navy·orange 조합에서 혼자 튄다. #9E3B2F 는 point(#E67E22)와 같은 따뜻한 계열이면서 명도가 낮아, 강조(orange)와 파괴(brick)가 헷갈리지 않는다. red-500 은 cream 위 글자 대비가 3.9:1 로 AA 미달이기도 하다.

## 3. 버튼

`src/components/space/SpaceUI.tsx` 의 클래스 문자열을 쓴다. 모양은 모두 높이 48 알약, 글자는 `type-body-strong`.

| 클래스 | 면 / 글자 | 쓰는 곳 |
|---|---|---|
| `primaryButton` | navy / cream | 화면의 주 행동 하나 |
| `secondaryButton` | navy/5 / navy | 취소, 되돌아가기 |
| `dangerButton` | danger/10 / danger | 되돌릴 수 없는 보조 행동(저장하지 않고 나가기, 이 취향표 삭제) |
| `ConfirmSheet danger` | danger / cream | 확인 창의 주 행동이 파괴적일 때(삭제 확정) |
| `textLink` | — / navy, 밑줄 | 세 번째 선택지("계속하기"), 보조 링크 |

파괴적 행동이 **주 행동**이면 면을 채우고(`bg-danger text-cream`), **보조 행동**이면 옅은 면(`bg-danger/10 text-danger`)을 쓴다. 한 창에 채운 빨강 버튼은 하나까지.

## 4. 확인 창

`Sheet`(하단 시트)를 쓴다. 가운데 뜨는 카드형 모달(둥근 테두리 4px, 그림자, LP 그림)은 새로 만들지 않는다.

- 제목 `type-title-1 text-navy`, 설명 `type-sub text-navy/70`(최대 2줄, `whitespace-pre-line`).
- 버튼은 세로로 쌓는다: 주 행동 → 파괴적 행동 → 글자 링크. 버튼 안에 작은 부연(11px)을 넣지 않는다 — 부연은 설명 문단에 쓴다.
- 문구 규칙은 `ux-writing.md` 6장 "확인 창".

## 5. 적용 현황과 옮길 곳

| 대상 | 상태 |
|---|---|
| `globals.css` `--color-danger`, `SpaceUI.dangerButton` | 적용 (2026-09-21) |
| 월드컵 나가기 시트 | 적용 |
| `ConfirmSheet`(삭제 확정), 오류 토스트, 프로필 창·취향 스페이스의 삭제 링크 | 적용 (`red-700` → `danger`) |
| 곡 선택 나가기 마법사 (`tracks/page.tsx` ~L2228) — LP 카드 모달, `red-100/red-500` | **옮길 것.** `Sheet` + `dangerButton` |
| 아티스트 선택 나가기 (`explore/page.tsx` ~L1197) — 같은 카드 모달 | **옮길 것** |
| 결과 화면 삭제 버튼 (`ResultScreen.tsx` ~L1068) `red-200/red-500` | **옮길 것.** `dangerButton` |
| 홈 새로 시작 확인 (`page.tsx` ~L552) — 트로피 아이콘 카드 모달 | **옮길 것.** `ConfirmSheet` |
| 로그인 창 오류 글자 `red-500` (`LoginModal.tsx`) | **옮길 것.** `text-danger` |
| 아티스트 칩 삭제 배지 `bg-red-500` (`explore/page.tsx` ~L1035, 1052) | **옮길 것.** `bg-danger` |
| 관리자 화면(`manager-taste-control`) | 내부 도구. 뒤로 미룬다 |
| 인스타그램 공유 버튼 그라데이션 (`ResultScreen.tsx` ~L1156) | 브랜드 색이라 예외 |

옮길 때는 한 화면씩, 문구도 `ux-writing.md` 에 맞춘다(예: "저장하지 않고 나가기"는 그대로, "정말 삭제하시겠습니까?" → "취향표를 삭제할까요?").
