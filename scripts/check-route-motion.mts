// Route-change smoothness check: `npm run check:motion` against a running
// server (BASE, default http://localhost:3000; CHROME_PATH if Chrome is not in
// the default macOS location).
//
// What it guards: a route change runs the camera's move, the page's entrance
// and the chart drawing at once, and anything that reads the layout on every
// one of those frames makes the move stutter. The planet's shade mask and its
// light on the glass used to (one 1.3s and one 2s loop measuring every pane
// and line of text per frame). Both now measure only when the page changes
// and once it is at rest (`src/components/page-rest.ts`). This fails if
// per-frame reads come back, or if a frame takes longer than MAX_FRAME_MS.
//
// The planet reading its own canvas's position each drawn frame is not
// counted: it is one box, and measured A/B it costs nothing extra.

import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Frames in one route change that may read the layout: the skeleton and then
// the page each change <main>, and each change is measured once at once and
// once at rest, by the mask and by the light on their own frames (measured:
// 4 to 8). Reading on every frame, as before, is 80 to 130.
const MAX_READ_FRAMES = 10;
const MAX_FRAME_MS = 50;
const WINDOW_MS = 2200;

const VIEWPORTS = [
  { name: "laptop", width: 1470, height: 840, deviceScaleFactor: 2 },
  { name: "ipad landscape", width: 1180, height: 820, deviceScaleFactor: 2 },
];
const HOPS: [string, string][] = [
  ["Market → Stocks", 'header a[href^="/todays-activity"]'],
  ["Stocks → News", 'header a[href="/news"]'],
  ["News → Market", 'header a[href="/"]'],
];

declare global {
  interface Window {
    __reads: number;
    __frames: { gap: number; reads: number }[];
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const failures: string[] = [];

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument(() => {
      window.__reads = 0;
      const count = <T extends object>(proto: T, key: keyof T) => {
        const original = proto[key] as (...args: unknown[]) => unknown;
        Object.defineProperty(proto, key, {
          value: function (this: unknown, ...args: unknown[]) {
            if (!(this instanceof HTMLCanvasElement && this.classList.contains("saturn-canvas"))) window.__reads++;
            return original.apply(this, args);
          },
        });
      };
      count(Element.prototype, "getBoundingClientRect");
      count(Element.prototype, "getClientRects");
      count(Range.prototype, "getClientRects");
    });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    // Each route once first, so a dev server's on-demand compile is not
    // measured as a stutter.
    for (const [, selector] of HOPS) {
      await page.$eval(selector, (a) => (a as HTMLElement).click());
      await wait(3000);
    }

    for (const [name, selector] of HOPS) {
      await page.evaluate((windowMs) => {
        window.__frames = [];
        const start = performance.now();
        let previous = start;
        let reads = window.__reads;
        const frame = (now: number) => {
          window.__frames.push({ gap: now - previous, reads: window.__reads - reads });
          previous = now;
          reads = window.__reads;
          if (now - start < windowMs) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }, WINDOW_MS);
      // A script click, so no pointer move wakes the sky's pointer effects.
      await page.$eval(selector, (a) => (a as HTMLElement).click());
      await wait(WINDOW_MS + 400);
      const frames = (await page.evaluate(() => window.__frames)).slice(1);
      const readFrames = frames.filter((f) => f.reads > 0).length;
      const longest = Math.max(...frames.map((f) => f.gap));
      const line = `${viewport.name.padEnd(15)} ${name.padEnd(16)} frames reading layout ${readFrames}/${frames.length}, longest frame ${longest.toFixed(0)}ms`;
      console.log(line);
      if (readFrames > MAX_READ_FRAMES) failures.push(`${line} (reads allowed in ${MAX_READ_FRAMES} frames)`);
      if (longest > MAX_FRAME_MS) failures.push(`${line} (frame over ${MAX_FRAME_MS}ms)`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nFAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nOK");
