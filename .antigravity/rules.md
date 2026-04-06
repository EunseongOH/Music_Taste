# 프로젝트 규칙: Music Taste

## 1. 브랜치 전략
- 모든 개발 작업은 `develop` 브랜치에서 진행한다.
- `main` 브랜치는 직접 수정하지 않는다.

## 2. 작업 완료 및 자동화 (핵심)
- 하나의 기능(예: UI 컴포넌트, 특정 페이지, API 연동)이 완료될 때마다 다음을 실행한다.
    1. 현재 변경 사항(`git diff`)을 분석하여 요약한다.
    2. 요약된 내용을 바탕으로 `[FEAT]`, `[FIX]`, `[STYLE]` 등의 접두어를 붙여 커밋 메시지를 작성한다.
    3. `develop` 브랜치에 커밋하고 즉시 `origin develop`으로 푸시한다.
- 푸시 후에는 채팅창에 "어떤 부분이 변경되어 develop 브랜치에 업데이트되었습니다"라고 보고한다.

## 3. 기술 스택 (Technology Stack)
- **Language**: TypeScript (엄격한 타입 체크 적용)
- **Framework**: Next.js (App Router 활용)
- **Styling**: Tailwind CSS
- **Icon Library**: Lucide React (AI가 UI 짤 때 쓰기 편함)
- **Backend/Auth**: Supabase (추천 - 음악 취향 데이터를 저장하고 로그인 기능을 넣기에 가장 빠름)
- **Future Goal**: 향후 Capacitor를 사용하여 이 웹 프로젝트를 iOS/Android 앱으로 패키징할 예정임. 따라서 모바일 터치 친화적인 UI/UX를 고려하여 설계할 것.