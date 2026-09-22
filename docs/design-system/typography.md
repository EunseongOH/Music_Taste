# Sortify 타이포그래피 시스템

> 2026-09-15 제정 · 같은 날 개정(서체 역할 변경) · 토큰 정의: `src/app/globals.css`
> 새 화면·수정 화면은 이 문서의 토큰만 쓴다. `text-[10px]` 같은 임의 크기를 직접 쓰지 않는다.

## 1. 원칙

1. **역할로 고른다.** 크기를 고르지 않는다. "행 제목이니까 `type-body-strong`" 식으로 정한다.
2. **최소 12px.** 모바일 WebView(토스 미니앱 포함)에서 10px 이하는 읽기 어렵다.
3. **굵기는 4단계.** 400 · 600 · 700, 그리고 `type-display` 전용 800. 단계가 많으면 위계가 흐려진다(KRDS).
4. **행간은 약 1.5배.** KRDS 는 최소 150%, 토스 TDS 본문은 15/22.5 · 17/25.5 다.
5. **서체는 세 가지, 역할이 겹치지 않는다.**

| 서체 | 클래스 | 쓰는 곳 | 쓰지 않는 곳 |
|---|---|---|---|
| Pretendard | 기본(`font-sans`) | 모든 한글·영문 글자, 문장 속 숫자("1위 Harmony", "총 8매치 중 3번째") | — |
| 원티드산스 Std | `font-num` | **숫자만 혼자 강조되는 자리**: 순위 숫자(1, 2, 3…), 퍼센트(32.4%), 곡 수·날짜처럼 크게 떼어 쓰는 숫자 | 글자와 한 덩어리로 읽히는 숫자 |
| **Nunito ExtraBold** (새 톤) / Playfair Display (지금 톤) | `font-wordmark` | **홈 화면의 큰 "Sortify" 워드마크 한 곳** | 그 밖의 모든 곳 |

- Playfair 는 `latin` 서브셋만 로드한다. 한글에 쓰면 기기마다 다른 대체 글꼴로 보여서, 워드마크 외에는 쓰지 않는다.
- 원티드산스는 숫자·기호만 쓰므로 라틴 전용 **Std 가변 폰트**(약 82KB)를 번들에 넣었다. 라이선스는 SIL OFL 1.1이고, 원문은 `src/app/fonts/WantedSans-OFL.txt` 에 있다.
- 순위처럼 세로로 줄 세우는 숫자에는 `tabular-nums` 를 함께 붙여 자릿수 폭을 맞춘다.

6. **영문 대문자 라벨(eyebrow)은 쓰지 않는다.** 한글 화면에서는 장식에 가깝고 판독성이 떨어진다.

## 2. 크기 토큰

토큰은 크기·행간·굵기·자간만 정한다. 서체는 위 표의 클래스를 덧붙여 정한다.

| 토큰 | 크기 / 행간 | 굵기 | 자간 | 쓰는 곳 |
|---|---|---|---|---|
| `type-display` | 28 / 36 | 800 | -0.02em | 화면당 한 번 쓰는 큰 강조(히어로 숫자 등) |
| `type-title-1` | 22 / 31 | 700 | -0.02em | 화면 제목(상단 헤더 h1), 모달·하단 시트 제목 |
| `type-title-2` | 17 / 25.5 | 700 | -0.01em | 섹션 제목, 빈 상태 제목 |
| `type-body-strong` | 15 / 22.5 | 600 | 0 | 목록 행 제목, 탭, 버튼 |
| `type-body` | 15 / 22.5 | 400 | 0 | 설명 문단, 가사 |
| `type-sub` | 13 / 19.5 | 400 | 0 | 행의 두 번째 줄, 보조 설명, 입력 라벨 |
| `type-caption` | 12 / 18 | 400 | 0.01em | 날짜·닉네임·모드 같은 메타, 작은 표시("미발매") |

### 참고한 시스템과의 대응

| 역할 | Sortify | 토스 TDS Mobile | KRDS(범정부) 모바일 | Apple HIG(iOS) | Material 3 |
|---|---|---|---|---|---|
| 화면 제목 | title-1 22 | Typography 3 · 22/31 | Heading Medium 22 · 700 | Title 2 · 22 | Title Large 22/28 |
| 섹션 제목 | title-2 17 | Typography 5 · 17/25.5 | Heading XSmall 17 · 700 | Headline 17 | Title Medium 16/24 |
| 목록·본문 | body 15 | Typography 6 · 15/22.5 | Body Small 15 | Subheadline 15 | Body Medium 14/20 |
| 보조 | sub 13 | Typography 7 · 13/19.5 | Body XSmall 13 | Footnote 13 | Body Small 12/16 |
| 메타 | caption 12 | subTypography | Label XSmall 13 | Caption 1 · 12 | Label Small 11/16 |

본문을 KRDS 기본값(17)이 아니라 15로 둔 이유가 있다. 목록 위주 화면이라 한 화면에 보이는 정보량이 중요하고, 토스 TDS·iOS 목록 화면의 관행과도 같다(2026-09-15 결정).

## 3. 글자 색

바탕 cream(#F5F2ED) 기준 대비값이다. 작은 글자(18.66px bold / 24px 미만)의 WCAG AA 기준은 4.5:1 이다.

| 역할 | 클래스 | 대비 | 규칙 |
|---|---|---|---|
| 기본 | `text-navy` | 11.8:1 | 제목·행 제목·본문 |
| 보조 | `text-navy/70` | 5.0:1 | 두 번째 줄·메타·설명. **정보 텍스트의 가장 옅은 단계** |
| 비활성 | `text-navy/40` | 2.4:1 | placeholder, 비활성 상태에만. 정보를 담지 않는다 |
| 강조 글자 | `text-point-ink` (#A65309) | 4.9:1 | 1~3위 순위 숫자, "공개" 같은 강조 텍스트 |
| 강조 선·면 | `bg-point`, `border-point` (#E67E22) | 2.6:1 | 탭 밑줄, 스위치, 점. **글자에는 쓰지 않는다** |

## 4. 조합 예

```tsx
{/* 섹션 제목 + 개수 — 개수는 글자 옆이라 Pretendard */}
<h2 className="type-title-2 text-navy">같은 1위 곡 <span className="text-navy/70">3</span></h2>

{/* 목록 행 */}
<p className="type-body-strong text-navy">내 마음의 레드벨벳</p>
<p className="type-sub text-navy/70">1위 Feel My Rhythm · Red Velvet</p>
<p className="type-caption text-navy/70">2026.09.11 · 최애 곡 소트하기</p>

{/* 순위 숫자 — 숫자만 있어서 원티드산스, 세로 정렬이라 tabular-nums */}
<span className="type-title-2 font-num tabular-nums text-point-ink">1</span>

{/* 싱크 % — 숫자만 있어서 원티드산스 */}
<span className="type-title-2 font-num text-point-ink">72.4%</span>

{/* 홈 워드마크 — 이 한 곳만 */}
<h1 className="font-wordmark text-5xl">Sortify</h1>
```

## 5. 적용 현황

| 대상 | 상태 |
|---|---|
| 상단 헤더 h1 (월드컵·곡 선택·결과·공유·스페이스·아카이브) | 적용 |
| 내 취향 스페이스 · 우리의 취향 아카이브 · 프로필 창 | 적용 |
| 모든 화면의 `font-serif` 제거(워드마크 → `font-wordmark`, 숫자 → `font-num`) | 적용 |
| 결과 템플릿(`TasteTemplates`) | 적용. 9:16 카드는 고정 크기 이미지라 px 크기를 쓰되 최소 11px(저장 시 55px), 순위 숫자는 `font-num tabular-nums`. `--font-serif` 토큰 제거 |

## 6. 워드마크 서체 — **Nunito ExtraBold 확정** (2026-09-22, 브랜치 design/logo-theme)

사용자 결정: "일단 Nunito 로". 새 톤(`toss-white` · `sky-tint`)에서 `font-wordmark` = Nunito 800, latin 서브셋, SIL OFL 1.1, 가변 woff2 약 39 KB(굵기 800 하나만 받아 실제로는 약 16 KB). `next/font/google` 로 `layout.tsx` 에서 로드하고 `--font-nunito` 로 넘긴다. 지금 톤(legacy)은 Playfair 700 그대로 — 둘 다 실리며, 채택이 굳으면 Playfair 를 뺀다. 굵기는 `.font-wordmark` 가 `--t-wordmark-weight` 변수로 받으므로 호출부에서 `font-bold` 를 붙이지 않는다. 다른 후보(Quicksand · Outfit · Plus Jakarta Sans)는 번들에서 뺐다.

아래는 결정 전 비교 기록이다.

지금 워드마크는 Playfair Display(세리프, 굵기 대비가 큰 디돈 계열)다. 크림 바탕·남색 테두리와는 맞았지만, 새 로고는 **둥글고 부드러운 유리 질감 그라데이션**이라 날카로운 세리프와 결이 다르다. 후보를 `/dev/theme-lab` 에서 로고 옆에 나란히 볼 수 있다.

| 후보 | 인상 | 라이선스 | latin 가변 woff2 | 번들 증가 |
|---|---|---|---|---|
| Playfair Display (지금) | 세리프, 클래식 | SIL OFL 1.1 | 38.4 KB | 기준 |
| **Pretendard ExtraBold** | 본문과 같은 서체. 가장 담백 | SIL OFL 1.1 | 이미 번들 | **−38 KB** (Playfair 제거) |
| **Wanted Sans Std** | 숫자용으로 이미 번들. Pretendard 보다 글자 폭이 넓고 단단 | SIL OFL 1.1 | 이미 번들(82.6 KB) | **−38 KB** |
| Nunito | 획 끝이 둥글다. 로고의 하트·음표 곡선과 가장 닮음 | SIL OFL 1.1 | 39.1 KB | +0.7 KB |
| Quicksand | 둥근 기하. 가볍고 어린 인상 | SIL OFL 1.1 | 28.2 KB | −10 KB |
| Outfit | 기하 산세리프. 중립적이고 현대적 | SIL OFL 1.1 | 32.3 KB | −6 KB |
| Plus Jakarta Sans | 현대 산세리프. 핀테크 느낌 | SIL OFL 1.1 | 27.3 KB | −11 KB |

용량은 Google Fonts 의 latin 서브셋 가변 woff2 실측값이다(2026-09-22). 굵기 하나만 받으면 12~17 KB 로 준다. 전부 `next/font/google` 로 로드되고 `subsets: ["latin"]` 이다. 시안 브랜치에서는 비교를 위해 넷을 `preload: false` 로 함께 걸어 두었다 — **채택하면 하나만 남긴다.**

권고 순서
1. **Nunito ExtraBold** — 로고와 형태가 이어진다. 워드마크가 로고 옆에 놓였을 때 한 덩어리로 읽힌다.
2. **Pretendard ExtraBold** — 서체를 하나 줄인다. 다만 본문과 같아서 워드마크가 "제목 한 줄"처럼 보인다. 로고 심볼을 항상 같이 쓴다면 충분하다.
3. Outfit — 둥근 끝이 부담스러우면.

원칙은 그대로다: 워드마크 서체는 **홈의 "Sortify" 한 곳**에만 쓴다. 한글 글리프가 없는 서체이므로 다른 곳에 쓰면 기기마다 대체 글꼴로 보인다.

### 본문·크기 토큰

Pretendard 와 22 / 17 / 15 / 13 / 12 는 이미 TDS Typography 3 · 5 · 6 · 7 과 같은 값이라 바꾸지 않는다. 하나만 제안한다: 흰 바탕에서는 `type-title-1`(22 · 700)이 크림 위보다 가볍게 보인다. 채택 후 실제 화면을 보고 제목 굵기를 700 → 800 으로 올릴지 판단한다. 지금은 바꾸지 않았다.

## 출처
- 토스 TDS Mobile Typography — https://tossmini-docs.toss.im/tds-mobile/foundation/typography/
- KRDS 타이포그래피 — https://www.krds.go.kr/html/site/style/style_03.html
- Apple Human Interface Guidelines, Typography (iOS 기본 크기)
- Material Design 3, Type scale
- 원티드산스 — https://github.com/wanteddev/wanted-sans (SIL OFL 1.1)
