# 기다리는 화면

곡을 모으는 동안 보여 주는 화면. `src/components/LoadingScreen.tsx` 하나를
전곡 모드(`/tracks`)와 같이 소트하기 만들기(`/together/new`)가 같이 쓴다.

두 모드는 같은 일을 기다리게 한다 — 아티스트를 고르고, 그 아티스트의 곡이 다
올 때까지. 그런데 한쪽은 도는 LP 한 장을 화면 가득 띄우고 다른 쪽은 버튼 글자만
"곡을 불러오는 중"으로 바뀐 채 1단계에 머물렀다. 같은 서비스의 같은 순간이 다르게
느껴졌고, 버튼만 바뀌는 쪽은 눌렀는데 아무 일도 안 일어난 것처럼 보였다.

## 지금 모습

```
      ( )       로고 마크(public/logo-mark-sm.png)가 통통 튄다
                위아래 14px, 0.9초 왕복, 무한 반복

  {아티스트} 발매곡 정보를 불러오고 있어요      type-body-strong · text-navy · role="status"

  ▓▓▓▓▓░░░░░░░   진행률 바 (bg-navy/10 위에 bg-point)
```

| | |
|---|---|
| 바탕 | `bg-[var(--app-bg)]`, 화면 전체(`min-h-screen`) — `inline` 이면 `py-20` 만 |
| 로고 | `w-20 h-20 rounded-full`, `aria-hidden` |
| 문구 | `type-body-strong text-navy break-keep`, `role="status"` |
| 바 | `h-1.5 rounded-full bg-navy/10` / 채움 `bg-point`, 폭 `max-w-[240px]` |
| 간격 | `gap-6`, 좌우 `px-8` |

- 색은 전부 토큰이다. 하드코딩된 색이 없어야 디자인 톤이 바뀔 때 이 화면도 따라온다.
  로고만 테마와 무관하게 같은 파일이다.
- 로고는 **원으로 자른다**. 파일 바탕이 흰색이라 그냥 두면 크림 바탕에 흰 네모가
  얹힌다. 마크는 가운데 모여 있어 원 밖으로 잘리는 건 여백뿐이다.
- `logo-mark-sm.png` 는 `logo-mark.png`(600px · 294KB)를 160px 로 줄인 것(16KB)이다.
  기다리라고 띄우는 화면이 제 그림을 기다리게 하면 안 된다. 마크를 바꾸면 이것도
  다시 만들어야 한다(`toss/app/public/` 에도 같은 파일이 있다 — 미니앱은 public 이 따로다).
- 동작 줄이기(`prefers-reduced-motion`)를 켜면 로고가 멈추고 바도 흐르지 않는다.
- 문구: `{아티스트} 발매곡 정보를 불러오고 있어요` / 아티스트를 모르면 앞부분 없이.
  영어는 `Loading {artist}'s releases` / `Loading releases`.

### 진행률은 진짜다

가짜 애니메이션이 아니다. 서버가 `/api/together/catalog?stream=1` 로 진행 상황을
한 줄씩(NDJSON) 흘려보내고, 화면은 그걸 그대로 그린다.

일의 총량은 **앨범 수 × 2** 다 — 앨범 목록에 오르는 일과 그 앨범의 곡을 받는 일.
라우트의 두 루프가 모두 앨범 단위라 실제로 끝난 만큼만 센다.

| 구간 | 바 |
|---|---|
| 첫 페이지 — 전체 앨범 수를 아직 모름 | 불확정(조각이 흐른다) |
| 앨범 목록 받는 중 | 0 → 50% |
| 앨범별 곡 받는 중 | 50 → 100% |

캐시에 다 있으면 순식간에 100% 가 된다. 그건 거짓이 아니라 실제로 빨랐던 것이다.
스트림을 못 읽는 환경(오래된 WebView, 중간에서 모아 보내는 프록시)이면 본문을 통째로
받아 마지막 줄만 쓴다 — 진행률만 못 보고 결과는 같다.

### 어디서 뜨는가
| 화면 | 언제 | 아티스트 | 진행률 |
|---|---|---|---|
| `/tracks` | 고른 아티스트를 저장소에서 읽는 동안(`!isLoaded`) | 없음 — 아직 누구인지 모른다 | 불확정 |
| `/together/new` | 2단계로 넘어와 곡을 모으는 동안 | 있음 | 있음 |

같이 소트하기는 **먼저 넘어가고 그다음 받는다**. 전에는 다 받을 때까지 1단계에
머물며 버튼 글자만 바뀌어서, 눌렀는데 아무 일도 안 일어난 것처럼 보였다.
이제 화면이 바로 바뀌고 제목에 아티스트 이름이 먼저 뜬 뒤, 그 안에서 기다린다.

## 바뀌기 전 (2026-09-22, `50a4a6f` 이전)

되돌릴 일이 생기면 `git show 50a4a6f:src/app/tracks/page.tsx` 의 `if (!isLoaded)` 블록이
원본이다. 모습은 `docs/design-system/loading-before.png`.

```jsx
<main className="flex flex-col min-h-screen relative z-10 w-full items-center justify-center bg-[var(--app-bg)]">
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
    className="mb-8 relative w-20 h-20 flex items-center justify-center text-point opacity-80"
  >
    <Disc size={80} strokeWidth={1} />
  </motion.div>
  <h1 className="text-2xl text-navy font-bold tracking-tight">트랙 정리 중...</h1>
  <p className="font-sans text-sm text-charcoal/70 mt-2 font-medium">아티스트의 발매곡 정보를 받아오고 있어요</p>
</main>
```

무엇이 달라졌는지:

| | 전 | 후 |
|---|---|---|
| 문구 | 두 줄 — `트랙 정리 중...` + `아티스트의 발매곡 정보를 받아오고 있어요` | 한 줄 — `{아티스트} 발매곡 정보를 불러오고 있어요` |
| 크기 | `text-2xl` + `text-sm` 직접 지정 | `type-body-strong` 토큰 |
| 그림 | 도는 LP(lucide Disc) | 통통 튀는 로고 마크 |
| 동작 줄이기 | 안 봄 | 로고가 멈춘다 |
| 스크린리더 | 알리지 않음 | `role="status"` |
| 같이 소트하기 | 버튼 글자만 바뀌고 1단계에 머묾 | 바로 2단계로 넘어가 그 안에서 기다림 |
| 진행 상황 | 없음 | 실제 진행률 바 |

`트랙 정리 중...` 과 `Organizing Tracks...` 는 어느 검사 스크립트도 기다리지 않아서
같은 커밋에서 그냥 지웠다.
