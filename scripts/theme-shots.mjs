/**
 * 테마 시안 스크린샷. design/logo-theme 전용.
 *   node scripts/theme-shots.mjs [출력폴더]      (dev 서버가 3300 에 떠 있어야 한다)
 * Spotify 를 부르지 않는 화면만 찍는다(홈 · 아카이브 · 같이 소트하기 · theme-lab). 로컬은 SPOTIFY_CACHE_ONLY 기본 켜짐.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.NEXT_BASE || "http://localhost:3300";
const OUT = process.argv[2] || "theme-shots";
fs.mkdirSync(OUT, { recursive: true });

const THEMES = ["legacy", "toss-white", "sky-tint"];
const PAGES = [
  { name: "lab", path: "/dev/theme-lab", full: true },
  { name: "home", path: "/", full: false },
  { name: "archive", path: "/archive", full: false },
  { name: "together", path: "/together", full: false },
];

const browser = await chromium.launch();
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(`${BASE}${p.path}${p.path.includes("?") ? "&" : "?"}theme=${theme}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const file = `${OUT}/${p.name}-${theme}.png`;
    await page.screenshot({ path: file, fullPage: p.full });
    console.log("shot", file);
    if (p.name === "lab") {
      // 카드·턴테이블 시안만 따로. 이 섹션이 결정 4번의 재료다.
      const studies = `${OUT}/studies-${theme}.png`;
      await page.locator("#studies").screenshot({ path: studies });
      console.log("shot", studies);
    }
  }
  await ctx.close();
}
await browser.close();
