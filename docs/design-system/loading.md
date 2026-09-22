# 기다리는 화면

곡을 모으는 동안 보여 주는 화면. `src/components/LoadingScreen.tsx` 하나를
전곡 모드(`/tracks`)와 같이 소트하기 만들기(`/together/new`)가 같이 쓴다.

두 모드는 같은 일을 기다리게 한다 — 아티스트를 고르고, 그 아티스트의 곡이 다
올 때까지. 그런데 한쪽은 도는 LP 한 장을 화면 가득 띄우고 다른 쪽은 버튼 글자만
"곡을 불러오는 중"으로 바뀌었다. 같은 서비스의 같은 순간이 다르게 느껴졌고,
버튼만 바뀌는 쪽은 눌렀는데 아무 일도 안 일어난 것처럼 보였다.

## 지금 모습

```
      ◎        도는 LP (Disc 80px, strokeWidth 1, text-point, opacity-80)
              2초 한 바퀴, linear, 무한 반복

  {아티스트} 곡을 모으고 있어요     type-title-2 · text-navy · role="status"
```

| | |
|---|---|
| 바탕 | `bg-[var(--app-bg)]`, 화면 전체(`min-h-screen`), 가운데 정렬 |
| LP | `text-point opacity-80`, `w-20 h-20`, `aria-hidden` |
| 문구 | `type-title-2 text-navy`, 한 줄 |
| 간격 | `gap-6`, 좌우 `px-8` |

- 색은 전부 토큰이다. 하드코딩된 색이 없어야 디자인 톤이 바뀔 때 이 화면도 따라온다.
- 동작 줄이기(`prefers-reduced-motion`)를 켜면 LP 가 돌지 않고 멈춘 채로 보인다.
- 문구는 한 줄이다. `{아티스트} 곡을 모으고 있어요` / 아티스트를 모르면 `곡을 모으고 있어요`.
  영어는 `Gathering {artist}'s songs` / `Gathering songs`.
- LP 에 `aria-hidden`, 문구에 `role="status"` — 화면을 안 보는 사람에게는 이 한 줄이
  "바뀌었다"는 신호 전부다.

### 어디서 뜨는가
| 화면 | 언제 | 아티스트 이름 |
|---|---|---|
| `/tracks` | 고른 아티스트를 저장소에서 읽는 동안(`!isLoaded`) | 없음 — 아직 누구인지 모른다 |
| `/together/new` | 아티스트를 누르고 카탈로그를 받는 동안(`artistBusy`) | 있음 |

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
| 문구 | 두 줄 — `트랙 정리 중...` + `아티스트의 발매곡 정보를 받아오고 있어요` | 한 줄 — `{아티스트} 곡을 모으고 있어요` |
| 크기 | `text-2xl` + `text-sm` 직접 지정 | `type-title-2` 토큰 |
| 말투 | "트랙", "발매곡 정보" — 우리 쪽 말 | "곡" — 듣는 사람의 말 |
| 동작 줄이기 | 안 봄 | LP 가 멈춘다 |
| 스크린리더 | 알리지 않음 | `role="status"` |
| 같이 소트하기 | 버튼 글자만 바뀜 | 같은 화면 |

`트랙 정리 중...` 과 `Organizing Tracks...` 는 어느 검사 스크립트도 기다리지 않아서
같은 커밋에서 그냥 지웠다.
