import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './toss.css';

/**
 * Phase 3.1 검증용 최소 화면.
 *
 * 확인하려는 것은 두 가지다.
 *  1. Tailwind v4 가 @source 로 실제 src/ 까지 스캔해 디자인 토큰이 살아있는지
 *     (bg-cream / text-navy / text-point / text-charcoal)
 *  2. 폰트 두 종이 로드되는지 (font-sans=Pretendard, font-serif=Playfair)
 *
 * Phase 3.3 에서 실제 src/app/page.tsx 로 대체된다.
 */
function Probe() {
  const [vh, setVh] = useState('');
  useEffect(() => {
    setVh(`${window.innerHeight}px (viewport)`);
  }, []);

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-screen bg-cream px-6 py-10 flex flex-col gap-6">
      <h1 className="font-serif text-5xl text-navy tracking-tight">Sortify</h1>
      <p className="font-sans text-base text-charcoal">
        Pretendard 본문 — 가나다라마바사 0123
      </p>
      <p className="typo-h2 text-navy">typo-h2 유틸리티</p>

      <div className="flex gap-3">
        {[
          ['bg-cream', 'border border-navy/20'],
          ['bg-navy', ''],
          ['bg-charcoal', ''],
          ['bg-point', ''],
        ].map(([cls, extra]) => (
          <div key={cls} className="flex flex-col items-center gap-1">
            <div className={`w-14 h-14 rounded-xl ${cls} ${extra}`} />
            <span className="font-sans text-[10px] text-charcoal/70">{cls}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto font-sans text-xs text-charcoal/60">
        <p>min-h-screen → 100dvh 로 덮어쓰기 적용됨</p>
        <p>뷰포트 높이: {vh}</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Probe />);
