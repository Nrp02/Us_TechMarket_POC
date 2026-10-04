import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Exercise the real server components without adding a JSX runtime to the app.
async function loadComponent(path: string) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { ComparisonBars, RankedBars, RangeBar } = await loadComponent("../components/story-charts.tsx") as
  typeof import("../components/story-charts");
const { IntradayChart } = await loadComponent("../components/intraday-chart.tsx") as
  typeof import("../components/intraday-chart");
const { Sparkline } = await loadComponent("../components/sparkline.tsx") as
  typeof import("../components/sparkline");

test("mixed-sign comparisons grow outward from zero without changing values", () => {
  const html = renderToStaticMarkup(ComparisonBars({ stock: 3, sector: -2, market: 1, peerAverage: null }));
  assert.equal((html.match(/bar-advancing/g) ?? []).length, 2);
  assert.equal((html.match(/bar-declining/g) ?? []).length, 1);
  assert.match(html, /bar-declining[^>]+right:50%;width:33\.333/);
  assert.match(html, /peer average not available/);
  assert.match(html, /\+3\.00%/);
});

test("same-direction negative bars grow from the magnitude baseline, not the right edge", () => {
  const html = renderToStaticMarkup(RankedBars({ rows: [
    { label: "One", value: -2 }, { label: "Two", value: -1 },
  ], ariaLabel: "Negative changes" }));
  assert.equal((html.match(/bar-advancing/g) ?? []).length, 2);
  assert.doesNotMatch(html, /bar-declining/);
  assert.match(html, /left:0;width:100%/);
  assert.match(html, /left:0;width:50%/);
});

test("ranked mixed-sign rows share the comparison animation directions", () => {
  const html = renderToStaticMarkup(RankedBars({ rows: [
    { label: "Up", value: 2 }, { label: "Down", value: -1 },
  ], ariaLabel: "Mixed changes" }));
  assert.match(html, /bar-advancing[^>]+left:50%/);
  assert.match(html, /bar-declining[^>]+right:50%/);
});

test("range marker fades at its real position rather than travelling through invented prices", () => {
  const html = renderToStaticMarkup(RangeBar({ min: 100, max: 200, current: 160 }));
  assert.match(html, /chart-point/);
  assert.match(html, /left:calc\(60% - 6px\)/);
  assert.match(html, /60% of the way/);
});

test("only volume data bars animate; tooltip hit columns remain stationary", () => {
  const html = renderToStaticMarkup(IntradayChart({ up: true, previousClose: 99, points: [
    { at: "2026-09-25T14:00:00Z", price: 100, volume: 200 },
    { at: "2026-09-25T14:15:00Z", price: 101, volume: 400 },
  ] }));
  assert.equal((html.match(/class="chart-volume"/g) ?? []).length, 2);
  assert.equal((html.match(/<rect/g) ?? []).length, 4);
  assert.match(html, /chart-line/);
});

test("a day up on the previous close but falling from the open is drawn and labelled as both", () => {
  // Opened at 105 over a previous close of 100, slid to 102: up 2% on the day.
  const intraday = renderToStaticMarkup(IntradayChart({ up: true, previousClose: 100, points: [
    { at: "2026-09-25T13:30:00Z", price: 105, volume: 200 },
    { at: "2026-09-25T20:00:00Z", price: 102, volume: 400 },
  ] }));
  assert.match(intraday, /Up on the previous close of \$100\.00; this session from \$105\.00/);
  assert.match(intraday, /stroke-dasharray="3 4"/);
  // The previous close sits on the plot's floor, below the session's low.
  assert.match(intraday, /y1="188" y2="188" stroke="var\(--color-muted\)"/);

  const spark = renderToStaticMarkup(Sparkline({ up: true, previousClose: 100, values: [105, 102] }));
  assert.match(spark, /Up on the previous close of 100\.00; this session from 105\.00 to 102\.00/);
  assert.match(spark, /stroke-dasharray="2 3"/);
});
