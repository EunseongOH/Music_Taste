/**
 * 홈의 모드 카드. 테마에 따라 모양이 갈린다 — 분기는 이 파일 한 곳.
 *
 *  - legacy(기본): 지금 운영 홈의 카드 그대로. 크림 면, 3px 남색 테두리, 가운데 정렬, 위쪽 주황 배지.
 *    `src/app/page.tsx` 의 카드 마크업·클래스를 한 글자도 바꾸지 않고 옮겼다.
 *  - 새 테마(toss-white · sky-tint): 시안 (c-1). 선 없이 흰 면, 로고 그라데이션을 흐리게 깐 빛,
 *    왼쪽 정렬, 배지는 brand 글자. docs/design-system/color.md 7-1장.
 *
 * 분기는 `newtone:` 변형(globals.css 의 @custom-variant)으로 한다. 조건문도, 테마를 읽는 훅도 없다 —
 * 서버에서 그려도 되고, 첫 페인트 전에 <html data-theme> 가 붙으므로 깜빡임이 없다.
 *
 * page.tsx 는 canonical 통합이 끝난 뒤 카드 <div> 를 이 컴포넌트로 갈아 끼운다(그 파일은 지금 수정 금지).
 */

/** 카드마다 빛의 색과 자리를 조금씩 달리한다. 전부 로고 안의 색이다. 과하지 않게 — 색상만 옮기고 세기는 같다. */
const GLOWS = [
  { bg: "linear-gradient(135deg, #A0F0FC 0%, #4C9EFE 45%, #4063FB 100%)", pos: "-top-16 -right-14" },
  { bg: "linear-gradient(135deg, #81F0F8 0%, #4C9EFE 60%, #6577FD 100%)", pos: "-top-20 -right-8" },
  { bg: "linear-gradient(135deg, #A0F0FC 0%, #6577FD 55%, #4063FB 100%)", pos: "-top-14 -right-20" },
  { bg: "linear-gradient(135deg, #4C9EFE 0%, #81F0F8 50%, #A0F0FC 100%)", pos: "-top-16 -right-12" },
] as const;

const DOT = "linear-gradient(135deg, #FDA84B 0%, #FE7045 100%)";

export default function ModeCard({
  badge,
  title,
  desc,
  tone = 0,
}: {
  badge: string;
  title: string;
  desc: string;
  /** 몇 번째 카드인지. 빛의 색만 달라진다. */
  tone?: number;
}) {
  const glow = GLOWS[tone % GLOWS.length];
  return (
    <div
      className={
        // legacy — page.tsx 의 카드와 같은 클래스
        "w-full bg-[#FAF7F2] border-[3px] border-navy rounded-[2.5rem] p-6 shadow-md hover:shadow-lg transition-shadow duration-300 relative flex flex-col items-center justify-between text-center min-h-[170px] select-none " +
        // 새 테마 — (c-1)
        "newtone:bg-white newtone:border-0 newtone:rounded-[1.75rem] newtone:items-start newtone:justify-end newtone:text-left newtone:overflow-hidden " +
        "newtone:shadow-[0_12px_36px_-14px_rgba(56,91,240,0.35)] newtone:hover:shadow-[0_16px_40px_-14px_rgba(56,91,240,0.45)]"
      }
    >
      {/* 빛과 주황 점은 새 테마에서만 */}
      <span aria-hidden className={`hidden newtone:block absolute ${glow.pos} w-52 h-52 rounded-full opacity-70 blur-2xl`} style={{ background: glow.bg }} />
      <span aria-hidden className="hidden newtone:block absolute top-7 right-8 w-7 h-7 rounded-full blur-[2px] opacity-90" style={{ background: DOT }} />

      {/* Mode Card Header Badge */}
      <div
        className={
          "absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center justify-center h-6 px-3.5 bg-point text-white text-[11px] font-sans font-bold rounded-full shadow-sm leading-none whitespace-nowrap " +
          "newtone:relative newtone:top-0 newtone:left-0 newtone:translate-x-0 newtone:h-auto newtone:px-0 newtone:bg-transparent newtone:shadow-none " +
          "newtone:text-brand newtone:text-[12px] newtone:leading-[18px] newtone:font-semibold"
        }
      >
        {badge}
      </div>

      <div className="mt-2 w-full flex-1 flex flex-col justify-center newtone:relative newtone:mt-1 newtone:flex-none">
        <h3 className="text-xl sm:text-2xl text-navy font-black tracking-tight newtone:text-[22px] newtone:sm:text-[22px] newtone:leading-[31px] newtone:font-bold">
          {title}
        </h3>
        <p className="font-sans text-xs text-charcoal/70 leading-relaxed mt-2 break-keep px-2 newtone:text-[13px] newtone:leading-[19.5px] newtone:text-navy/70 newtone:px-0 newtone:mt-1.5 newtone:max-w-[260px]">
          {desc}
        </p>
      </div>
    </div>
  );
}
