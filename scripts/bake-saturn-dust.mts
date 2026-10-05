// Bakes the dust around the planet (`.saturn-view::before`) into
// `src/app/saturn-dust.webp`: `node --experimental-strip-types
// scripts/bake-saturn-dust.mts` (CHROME_PATH if Chrome is not in the default
// macOS location; needs `cwebp`).
//
// Why baked: the dust was two gradients cut by a feTurbulence mask-image.
// Safari rasterises a masked layer again when the route changes, and that one
// layer made each route change drop a 130-230ms frame (measured with
// `scripts/check-safari-motion.mts`; `mask-image: none` took it under 60ms).
// A plain background image costs nothing there. Rendered at the largest
// --saturn-size (1560px, so a 2652px box at inset -35%) and halved.
// Re-run after changing --saturn-ring or --saturn-glow.

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BOX = 2652;
const OUT = 1326;
const RING = "#ded7c8";
const GLOW = "#f0dfb4";
const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.006 0.012' numOctaves='4' seed='9' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 2.4 0 0 0 -0.55'/%3E%3C/filter%3E%3Crect width='700' height='700' filter='url(%23n)'/%3E%3C/svg%3E";

const png = join(mkdtempSync(join(tmpdir(), "dust-")), "dust.png");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: BOX, height: BOX, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    html, body { margin: 0; background: transparent }
    div {
      width: ${BOX}px; height: ${BOX}px;
      background:
        radial-gradient(ellipse 47% 7.5% at 50% 50%,
          color-mix(in srgb, ${RING} 22%, transparent),
          color-mix(in srgb, ${RING} 9%, transparent) 55%, transparent 100%),
        radial-gradient(ellipse 24% 24% at 45% 46%,
          color-mix(in srgb, ${GLOW} 14%, transparent),
          color-mix(in srgb, ${GLOW} 5%, transparent) 60%, transparent 100%);
      mask-image: url("${NOISE}");
      mask-size: 700px 700px;
    }
  </style><div></div>`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: png as `${string}.png`, omitBackground: true });
} finally {
  await browser.close();
}
execFileSync("cwebp", ["-quiet", "-q", "90", "-alpha_q", "100", "-resize", `${OUT}`, `${OUT}`, png, "-o", "src/app/saturn-dust.webp"]);
console.log("wrote src/app/saturn-dust.webp");
