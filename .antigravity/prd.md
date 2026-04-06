[PRD] Music Taste: 아날로그 감성 LP 인터랙션 취향표 서비스
1. 제품 개요 (Product Overview)
비전: "취향을 기록하고, LP로 플레이하다." 단순한 선택을 넘어 아날로그의 물리적 경험을 디지털로 재현하여 나만의 세밀한 음악 취향표를 생성.

핵심 컨셉: Analog Record Shop. 따뜻한 종이 질감과 미니멀한 선화(Line-art)를 결합하여 감성적인 무드 제공.

주요 타겟: SNS 공유를 즐기며, 아날로그 감성과 모던한 디자인을 동시에 선호하는 음악 팬.

2. 디자인 시스템 (Design System - Option 2 반영)
Main Theme: Warm Cream & Navy (아날로그 종이 질감)

Color Palette:

Background: #F5F2ED (따뜻한 오프 화이트/크림색)

Text/Line-art: #2D3436 (깊은 차콜 그레이) 또는 #1A2A6C (딥 네이비)

Point Color: #E67E22 (레코드 라벨 포인트 오렌지)

Typography: 가독성 좋은 산세리프(San-serif) 계열 + 클래식한 세리프(Serif) 제목 혼용.

Vibe: 따뜻한, 클래식한, 모던한, 손맛이 느껴지는.

3. 상세 기능 요구사항 (Functional Requirements)
[FUNC-01] 온보딩 및 진입
01-1 랜딩: 웜 크림 배경에 세련된 LP 플레이어 애니메이션 노출. "당신의 음악적 온도를 확인해보세요" 문구.

01-2 로그인 분기: 데이터 저장을 위한 로그인 유도 팝업. (Supabase Auth)

01-3 게스트 모드: '가입 없이 시작' 버튼 제공.

[FUNC-02] 취향 탐색 (Spotify API)
02-1 아티스트 선택: 최소 3명 선택. 선택 시 유사 아티스트가 확장되며 리스트에 나타남.

02-2 곡 필터링: 선택한 아티스트의 전체 트랙 중 월드컵 후보곡 선택. 앨범 커버는 부드러운 그림자(Shadow) 효과 적용.

02-3 미발매곡 추가: 사용자가 직접 곡 정보 입력 시 앨범 재킷 사진도 직접 첨부하도록 하며, 미 첨부 시 텍스트 기반의 가상 앨범 아트 자동 생성.

[FUNC-03] 핵심: LP 월드컵 인터랙션
03-1 대진 화면: 중앙에 두 개의 앨범 커버. 하단에 딥 네이비 선화 스타일의 LP 플레이어 배치.

03-2 변환 (Long Press): 커버를 꾹 누르면 입체적인 LP 레코드로 변신. (중앙 라벨에 커버 이미지 포함)

03-3 드래그 & 드롭: LP를 하단 플레이어 턴테이블 위로 드래그.

03-4 플레이 애니메이션: 드롭 시 LP 회전 + 톤암 이동 효과 후 승리 곡 기록 및 다음 라운드 전환.

[FUNC-04] 결과 생성 및 이미지화
04-1 취향표 생성: 1~30위 곡을 트리 혹은 감각적인 리스트 형태로 배치. 배경에 미세한 종이 질감(Grain) 효과 추가.

04-2 이미지 저장: 9:16 비율의 인스타그램 스토리 최적화 이미지 생성 (html-to-image).

4. 기술 스택 (Technical Specs)
Frontend: Next.js (App Router), TypeScript

Styling: Tailwind CSS

Animation: Framer Motion, React Use Gesture

Backend: Supabase

API: Spotify Web API