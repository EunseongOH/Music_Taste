// 앨범 재킷이 없을 때 쓰는 대체 이미지.
//
// 왜 무작위 사진(picsum)을 쓰면 안 되는가: 진짜 재킷처럼 보여서 이용자가 잘못된 재킷을 본 것으로 믿는다.
// 그래서 사진이 아니라 도형으로 그린다 — 서비스 톤(cream/navy)과 같은 색이라 목록에서 튀지 않고,
// LP 실루엣 + 대각선 결 + "NO COVER" 라벨이라 재킷이 아니라는 것도 바로 보인다.
//
// 결과는 data URI 라 네트워크 호출이 없다. next/image 는 data: 로 시작하는 src 를 그대로 내보낸다.

const TONES = [
  { bg: "#EFEAE1", ink: "#1A2A6C" },
  { bg: "#EAE6DE", ink: "#2D3436" },
  { bg: "#F0E7DA", ink: "#A65309" },
  { bg: "#E8E8E4", ink: "#1A2A6C" },
  { bg: "#F2ECE4", ink: "#5C5441" },
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  return Math.abs(h);
};

/** 재킷 없음 대체 이미지 (300x300 SVG data URI). 같은 seed 면 언제나 같은 그림이다. */
export function coverPlaceholder(seed = ""): string {
  const t = TONES[hash(seed || "sortify") % TONES.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    `<rect width="300" height="300" fill="${t.bg}"/>` +
    // 대각선 결 — 사진이 아니라 그려진 면이라는 신호
    `<g stroke="${t.ink}" stroke-opacity="0.07" stroke-width="10">` +
    `<path d="M-60 60L60 -60M-20 300L300 -20M60 300L300 60M180 300L300 180"/>` +
    `</g>` +
    // LP 실루엣
    `<g fill="none" stroke="${t.ink}" stroke-opacity="0.22">` +
    `<circle cx="150" cy="138" r="52" stroke-width="2"/>` +
    `<circle cx="150" cy="138" r="34" stroke-width="1.5"/>` +
    `<circle cx="150" cy="138" r="16" stroke-width="1.5"/>` +
    `</g>` +
    `<circle cx="150" cy="138" r="5" fill="${t.ink}" fill-opacity="0.3"/>` +
    // 라벨 — 대체 이미지라는 것을 글자로도 밝힌다
    `<text x="150" y="230" text-anchor="middle" fill="${t.ink}" fill-opacity="0.45"` +
    ` font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="15" font-weight="600"` +
    ` letter-spacing="3">NO COVER</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
