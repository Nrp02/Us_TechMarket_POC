// Run against a production server: BASE=http://localhost:3402 npm run check:safari-motion
// Requires Safari Settings > Developer > Allow remote automation.

const BASE = process.env.BASE ?? "http://localhost:3402";
const DRIVER = "http://localhost:4444";
const WINDOW_MS = 2200;
const SKIP_MASK_UPLOAD = process.env.SKIP_MASK_UPLOAD === "1";
const DISABLE_SATURN = process.env.DISABLE_SATURN === "1";
const NO_ANIMATIONS = process.env.NO_ANIMATIONS === "1";
const NO_CLICK = process.env.NO_CLICK === "1";
const HIDE_MAIN = process.env.HIDE_MAIN === "1";
const HIDE_SKY = process.env.HIDE_SKY === "1";
const HIDE_NIGHT = process.env.HIDE_NIGHT === "1";
const HIDE_SATURN = process.env.HIDE_SATURN === "1";
// Every route to every other, ending where it starts.
const HOPS = [
  ["Market → Stocks", 'header a[href^="/todays-activity"]'],
  ["Stocks → News", 'header a[href="/news"]'],
  ["News → Stocks", 'header a[href^="/todays-activity"]'],
  ["Stocks → Market", 'header a[href="/"]'],
  ["Market → News", 'header a[href="/news"]'],
  ["News → Market", 'header a[href="/"]'],
] as const;

type Response<T> = { value: T | { error: string; message: string } };
async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${DRIVER}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as Response<T>;
  if (!response.ok || (data.value && typeof data.value === "object" && "error" in data.value)) {
    throw new Error(JSON.stringify(data.value));
  }
  return data.value as T;
}

const { sessionId } = await request<{ sessionId: string }>("/session", {
  capabilities: { alwaysMatch: { browserName: "safari" } },
});
const command = <T,>(path: string, body: object) => request<T>(`/session/${sessionId}${path}`, body);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await command("/url", { url: `${BASE}/` });
  await wait(3000);
  // Warm each route so network/data loading is not mistaken for animation cost.
  for (const [, selector] of HOPS) {
    await command("/execute/sync", {
      script: "document.querySelector(arguments[0]).click()",
      args: [selector],
    });
    await wait(2500);
  }
  console.log("Performance entries:", await command("/execute/sync", {
    script: "return PerformanceObserver.supportedEntryTypes",
    args: [],
  }));
  if (DISABLE_SATURN) {
    await command("/execute/sync", {
      script: "document.querySelector('.saturn-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()",
      args: [],
    });
  }
  if (NO_ANIMATIONS) {
    await command("/execute/sync", {
      script: "const style = document.createElement('style'); style.textContent = '* { animation-duration: 0s !important; transition-duration: 0s !important }'; document.head.append(style)",
      args: [],
    });
  }
  if (HIDE_MAIN) {
    await command("/execute/sync", {
      script: "document.querySelector('main').style.display = 'none'",
      args: [],
    });
  }
  if (HIDE_SKY || HIDE_NIGHT || HIDE_SATURN) {
    await command("/execute/sync", {
      script: "const style = document.createElement('style'); style.textContent = arguments[0]; document.head.append(style)",
      args: [HIDE_SKY ? ".night-sky,.saturn-scene { display:none !important }" : HIDE_NIGHT ? ".night-sky { display:none !important }" : ".saturn-scene { display:none !important }"],
    });
  }

  let failed = false;
  for (const [name, selector] of HOPS) {
    const result = await command<{
      path: string;
      frames: number;
      over32: number;
      over50: number;
      longest: number;
      drawImages: number;
      drawMs: number;
      skippedUploads: number;
      calls: Record<string, { count: number; ms: number; max: number; slow: string[] }>;
      topGaps: string[];
      events: string[];
    }>("/execute/async", {
      script: `
        const selector = arguments[0], duration = arguments[1], skipMaskUpload = arguments[2], noClick = arguments[3], done = arguments[arguments.length - 1];
        const target = document.querySelector(selector);
        if (!target) return done({ error: 'missing link: ' + selector });
        const original = CanvasRenderingContext2D.prototype.drawImage;
        let drawImages = 0, drawMs = 0;
        let skippedUploads = 0;
        const calls = {};
        const restore = [];
        function watch(proto, name) {
          const fn = proto[name];
          const key = proto.constructor.name + '.' + name;
          calls[key] = { count: 0, ms: 0, max: 0, slow: [] };
          proto[name] = function(...args) {
            const source = args[args.length - 1];
            if (skipMaskUpload && name === 'texSubImage2D' && source instanceof HTMLCanvasElement && source.width === 200 && source.height === 300) {
              skippedUploads++;
              return;
            }
            const t = performance.now();
            try { return fn.apply(this, args); }
            finally {
              const d = performance.now() - t;
              calls[key].count++;
              calls[key].ms += d;
              calls[key].max = Math.max(calls[key].max, d);
              if (d > 20 && calls[key].slow.length < 8) {
                calls[key].slow.push(d.toFixed(0) + 'ms ' + (source?.constructor?.name ?? '?') + ' ' + (source?.width ?? '?') + 'x' + (source?.height ?? '?'));
              }
            }
          };
          restore.push(() => { proto[name] = fn; });
        }
        watch(Element.prototype, 'getBoundingClientRect');
        watch(Range.prototype, 'getClientRects');
        watch(Document.prototype, 'getAnimations');
        watch(CanvasRenderingContext2D.prototype, 'fillRect');
        for (const name of ['texImage2D', 'texSubImage2D', 'drawElements', 'drawArrays']) {
          watch(WebGL2RenderingContext.prototype, name);
        }
        CanvasRenderingContext2D.prototype.drawImage = function(...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally { drawImages++; drawMs += performance.now() - start; }
        };
        const gaps = [];
        const topGaps = [];
        const events = [];
        let start = performance.now(), previous = start;
        const observer = new MutationObserver(records => {
          if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches('.page-enter') || node.querySelector('.page-enter'))))) {
            events.push('page-enter at ' + (performance.now() - start).toFixed(0) + 'ms');
          }
        });
        observer.observe(document.querySelector('main'), { childList: true, subtree: true });
        function frame(now) {
          gaps.push(now - previous);
          if (now - previous > 32) topGaps.push((now - start).toFixed(0) + 'ms: ' + (now - previous).toFixed(0) + 'ms, path ' + location.pathname);
          previous = now;
          if (now - start < duration) return requestAnimationFrame(frame);
          observer.disconnect();
          CanvasRenderingContext2D.prototype.drawImage = original;
          for (const undo of restore) undo();
          done({ path: location.pathname, frames: gaps.length - 1,
            over32: gaps.slice(1).filter(x => x > 32).length,
            over50: gaps.slice(1).filter(x => x > 50).length,
            longest: Math.max(...gaps.slice(1)), drawImages, drawMs, skippedUploads, calls, topGaps, events });
        }
        requestAnimationFrame(frame);
        if (!noClick) target.click();
      `,
      args: [selector, WINDOW_MS, SKIP_MASK_UPLOAD, NO_CLICK],
    });
    if ("error" in result) throw new Error(String(result.error));
    const line = `${name}: ${result.over32}/${result.frames} frames >32ms, ${result.over50} >50ms, max ${result.longest.toFixed(1)}ms; drawImage ${result.drawImages} calls / ${result.drawMs.toFixed(1)}ms`;
    console.log(line);
    if (SKIP_MASK_UPLOAD) console.log(`skipped mask uploads: ${result.skippedUploads}`);
    console.log(Object.entries(result.calls).map(([key, stat]) => `${key} ${stat.count} / ${stat.ms.toFixed(1)}ms / max ${stat.max.toFixed(1)}ms${stat.slow.length ? ` [${stat.slow.join(", ")}]` : ""}`).join("; "));
    console.log(`gaps: ${result.topGaps.join("; ")}; events: ${result.events.join("; ")}`);
    if (result.over32 > 2 || result.over50 > 0) failed = true;
    await wait(300);
  }
  if (failed) process.exitCode = 1;
  console.log(failed ? "FAIL: visible route stutter" : "OK");
} finally {
  await fetch(`${DRIVER}/session/${sessionId}`, { method: "DELETE" });
}
