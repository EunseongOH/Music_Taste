/**
 * 취향 기록표 카드의 색 조합.
 *
 * **앱 테마가 아니라 카드 한 장의 무드다.** 화면의 네비게이션·헤더·목록은 그대로 두고,
 * 450×800 카드 안쪽만 바뀐다. 미리보기와 저장 이미지가 같은 컴포넌트를 쓰므로
 * (ResultScreen 의 renderCards 가 화면용·export 용 두 곳에 같이 들어간다)
 * 카드 뿌리에 변수만 주입하면 둘이 저절로 같아진다.
 *
 * 사용자가 색을 직접 고르지 않는다. **검증된 조합**만 고른다 —
 * 작은 글씨와 포인트색이 바탕과 충분히 대비되는지 아래 표에 적어 두었다.
 */

export interface CardPalette {
  id: string;
  /** 코드·문서에서 쓰는 이름. 화면에는 띄우지 않는다. */
  name: string;
  /** 카드 바탕 */
  cardBg: string;
  /** 제목·본문 글자 */
  cardInk: string;
  /** 보조 글자(날짜·아티스트명). cardBg 위에서 4.5:1 이상. */
  cardMuted: string;
  /** 포인트 글자(1·2·3위, 작은 레이블). cardBg 위에서 4.5:1 이상. */
  cardAccent: string;
  /** 구분선 */
  cardLine: string;
  /** 카드 둘레에 깔리는 옅은 빛. 미리보기에서만 보이고 저장 이미지에는 없다. */
  previewHalo: string;
}

/**
 * 대비는 배경 대 글자로 계산했다(WCAG 상대휘도). 아래 값은 전부 4.5:1 이상이다 —
 * cardPalette.test 로 확인한다. 보기 좋은 것보다 한 단계 진한 쪽을 골랐다.
 */
export const CARD_PALETTES: CardPalette[] = [
  {
    id: "classic",
    name: "Sortify Classic",
    cardBg: "#F5F2ED",
    cardInk: "#1A2A6C",
    cardMuted: "#5A6484",
    cardAccent: "#A65309",
    cardLine: "rgba(26,42,108,0.16)",
    previewHalo: "rgba(230,126,34,0.16)",
  },
  {
    id: "paper-blue",
    name: "Paper Blue",
    cardBg: "#EDF2F8",
    cardInk: "#16263D",
    cardMuted: "#4C5C72",
    cardAccent: "#1D5FA8",
    cardLine: "rgba(22,38,61,0.16)",
    previewHalo: "rgba(29,95,168,0.16)",
  },
  {
    id: "forest-gold",
    name: "Forest Gold",
    cardBg: "#F3EEE1",
    cardInk: "#23301F",
    cardMuted: "#4F5B48",
    cardAccent: "#8A5A13",
    cardLine: "rgba(35,48,31,0.18)",
    previewHalo: "rgba(138,90,19,0.18)",
  },
  {
    id: "plum-rose",
    name: "Plum Rose",
    cardBg: "#F6EEF1",
    cardInk: "#2E1A2B",
    cardMuted: "#5D4257",
    cardAccent: "#9B2B63",
    cardLine: "rgba(46,26,43,0.16)",
    previewHalo: "rgba(155,43,99,0.16)",
  },
  {
    id: "bubblegum",
    name: "Bubblegum Pop",
    cardBg: "#FFF0F6",
    cardInk: "#3A1230",
    cardMuted: "#6B3A5C",
    cardAccent: "#C2185B",
    cardLine: "rgba(58,18,48,0.16)",
    previewHalo: "rgba(194,24,91,0.18)",
  },
  {
    id: "neon-lime",
    name: "Neon Lime",
    cardBg: "#121410",
    cardInk: "#F2F5EC",
    cardMuted: "#A9B39C",
    cardAccent: "#B8F135",
    cardLine: "rgba(242,245,236,0.20)",
    previewHalo: "rgba(184,241,53,0.22)",
  },
  {
    id: "midnight-pop",
    name: "Midnight Pop",
    cardBg: "#12192E",
    cardInk: "#EEF2FB",
    cardMuted: "#9AA6C2",
    cardAccent: "#FF8A3D",
    cardLine: "rgba(238,242,251,0.20)",
    previewHalo: "rgba(255,138,61,0.22)",
  },
];

export const DEFAULT_PALETTE = CARD_PALETTES[0];

export const paletteById = (id: string): CardPalette =>
  CARD_PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;

/** 카드 뿌리에 얹을 CSS 변수. 템플릿은 이 이름만 읽는다. */
export function paletteVars(p: CardPalette): React.CSSProperties {
  return {
    "--card-bg": p.cardBg,
    "--card-ink": p.cardInk,
    "--card-muted": p.cardMuted,
    "--card-accent": p.cardAccent,
    "--card-line": p.cardLine,
  } as React.CSSProperties;
}
