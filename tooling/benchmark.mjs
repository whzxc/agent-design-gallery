import { chromium } from "playwright";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import os from "node:os";
const [url, destination = "output/benchmark.json", fixtureRoot] =
  process.argv.slice(2);
if (!url) throw new Error("Usage: npm run benchmark -- <url> [output.json]");
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-precise-memory-info"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
await context.addInitScript(() => {
  window.__perf = { frames: [], longTasks: [], events: [], loading: {} };
  let last;
  function frame(now) {
    const loading = window.__perf.loading;
    if (!loading.catalogMs && document.querySelector('#modules')?.children.length && !document.querySelector('#sidebar').hidden) loading.catalogMs = now;
    if (!loading.layoutMs && window.__sdg?.assets) loading.layoutMs = now;
    if (!loading.drawnMs && window.__sdg?.ready) loading.drawnMs = now;
    if (last) window.__perf.frames.push(now - last);
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  new PerformanceObserver((list) =>
    window.__perf.longTasks.push(
      ...list
        .getEntries()
        .map((e) => ({ start: e.startTime, duration: e.duration })),
    ),
  ).observe({ type: "longtask", buffered: true });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
async function fit() {
  const zoomMenu = page.locator("#zoom-options");
  if (await zoomMenu.count()) {
    await zoomMenu.click();
    await page.locator("#zoom-fit-all").click();
  } else await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await settle();
  await page.waitForTimeout(120);
}
const begin = performance.now();
await page.goto(url);
await page.locator(".gallery-viewport").waitFor();
await page.waitForFunction(
  () =>
    window.__sdg?.ready ||
    (document.querySelectorAll(".gallery-drawing img").length &&
      [...document.querySelectorAll(".gallery-drawing img")].every(
        (x) => x.complete && x.naturalWidth,
      )),
);
const firstBrowseMs = performance.now() - begin;
const loading = await page.evaluate(() => ({
  ...window.__perf.loading,
  requests: performance.getEntriesByType('resource').filter(e => e.name.includes('/asset/')).map(e => ({path: new URL(e.name).pathname, startMs: e.startTime, durationMs: e.duration})),
}));
const reloadBegin = performance.now();
await page.reload();
await page.waitForFunction(() => window.__sdg?.ready ||
  (document.querySelectorAll('.gallery-drawing img').length && [...document.querySelectorAll('.gallery-drawing img')].every(x => x.complete && x.naturalWidth)));
const reloadBrowseMs = performance.now() - reloadBegin;
const reloadLoading = await page.evaluate(() => window.__perf.loading);
await fit();
const viewport = await page.locator(".gallery-viewport").boundingBox();
const px = viewport.x + viewport.width * 0.55,
  py = viewport.y + viewport.height * 0.5;
const phases = [];
const percentile = (list, p) =>
  list.length
    ? [...list].sort((a, b) => a - b)[
        Math.min(list.length - 1, Math.floor(list.length * p))
      ]
    : 0;
async function phase(name, action) {
  await page.evaluate(() => {
    window.__perf.frames = [];
    window.__perf.longTasks = [];
  });
  const before = (await cdp.send("Performance.getMetrics")).metrics;
  const start = performance.now();
  await action();
  const elapsed = performance.now() - start;
  const data = await page.evaluate(() => ({
    ...window.__perf,
    heap: performance.memory?.usedJSHeapSize,
    dom: document.getElementsByTagName("*").length,
  }));
  const after = (await cdp.send("Performance.getMetrics")).metrics;
  const metric = (n) =>
    after.find((m) => m.name === n)?.value -
    before.find((m) => m.name === n)?.value;
  phases.push({
    name,
    elapsedMs: elapsed,
    frames: data.frames.length,
    frameP50: percentile(data.frames, 0.5),
    frameP95: percentile(data.frames, 0.95),
    frameMax: Math.max(0, ...data.frames),
    framesOver33ms: data.frames.filter((x) => x > 33.4).length,
    longTasks: data.longTasks,
    taskMs: metric("TaskDuration") * 1000,
    layoutMs: metric("LayoutDuration") * 1000,
    scriptMs: metric("ScriptDuration") * 1000,
    heapBytes: after.find((m) => m.name === "JSHeapUsedSize")?.value,
    domNodes: data.dom,
  });
}
await page.mouse.move(px, py);
await phase("pan", async () => {
  await page.mouse.down();
  for (let i = 0; i < 120; i++) {
    await page.mouse.move(
      px + Math.sin(i / 20) * 200,
      py + Math.sin(i / 25) * 100,
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
});
await fit();
const cameraAtOverview = await page.evaluate(() => {
  if (window.__sdg) return window.__sdg.view;
  const m = new DOMMatrixReadOnly(
    getComputedStyle(document.querySelector(".gallery-world")).transform,
  );
  return { x: m.e, y: m.f, scale: m.a };
});
const zoomX = viewport.x + cameraAtOverview.x + 272 * cameraAtOverview.scale;
const zoomY = viewport.y + cameraAtOverview.y + 280 * cameraAtOverview.scale;
const isSDG = await page.evaluate(() => !!window.__sdg);
await page.mouse.move(zoomX, zoomY);
let peakZoom;
await phase("zoom", async () => {
  for (let i = 0; i < 90; i++) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: zoomX,
      y: zoomY,
      deltaX: 0,
      deltaY: (i < 45 ? -20 : 20) * (isSDG ? 1 : 4),
      modifiers: 2,
    });
    await page.waitForTimeout(8);
    if (i === 44) {
      await settle();
      peakZoom = await page.evaluate(
        () =>
          window.__sdg?.view.scale ||
          new DOMMatrixReadOnly(
            getComputedStyle(
              document.querySelector(".gallery-world"),
            ).transform,
          ).a,
      );
    }
  }
});
if (peakZoom < cameraAtOverview.scale * 10)
  throw new Error(
    `Zoom gesture did not reach asset detail: ${cameraAtOverview.scale} -> ${peakZoom}`,
  );
await fit();
await page.mouse.move(px, py);
await phase("trackpad-pan", async () => {
  for (let i = 0; i < 90; i++) {
    await page.mouse.wheel(Math.sin(i / 15) * 12, Math.cos(i / 15) * 12);
    await page.waitForTimeout(8);
  }
});
await fit();
await phase("theme", async () => {
  const display = page.locator("#display");
  if (await display.count()) await display.click();
  const theme = page.locator("#themes button[data-theme=light]")
    .or(page.getByRole("button", { name: "Light", exact: true }));
  if (await theme.count()) await theme.first().click();
  else await page.getByRole("radio", { name: "Light", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__sdg?.ready ||
      [...document.querySelectorAll(".gallery-drawing img")].every(
        (x) => x.complete && x.naturalWidth,
      ),
  );
  await page.waitForTimeout(200);
});
await fit();
await page.waitForTimeout(250);
let update;
if (fixtureRoot) {
  let file = fixtureRoot + "/components/button.tsx";
  try { await access(file); } catch { file = fixtureRoot + "/components/button.svg"; }
  const original = await readFile(file, "utf8"), sourcePath = file.slice(fixtureRoot.length + 1);
  const camera = () =>
    page.evaluate(
      () =>
        window.__sdg?.view ||
        document.querySelector(".gallery-world").style.transform,
    );
  const before = await camera();
  let requests = [];
  const record = (r) => {
    if (r.url().includes("/asset/")) requests.push(r.url());
  };
  page.on("request", record);
  const updatedManifest = page.waitForResponse((r) =>
    r.url().endsWith("/manifest"),
  );
  const image = page.waitForResponse(
    (r) =>
      r.url().includes("/asset/") &&
      decodeURIComponent(r.url()).includes(sourcePath),
  );
  const start = performance.now();
  try {
    await writeFile(file, original + (file.endsWith(".tsx") ? "\n// benchmark file save\n" : "\n<!-- benchmark file save -->\n"));
    const changed = await (await updatedManifest).json();
    await image;
    await page.waitForFunction(
      (revision) =>
        window.__sdg
          ? window.__sdg.ready && window.__sdg.revision === revision
          : [...document.querySelectorAll(".gallery-drawing img")].every(
              (x) => x.complete && x.naturalWidth,
            ),
      changed.revision,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    update = {
      latencyMs: performance.now() - start,
      assetRequests: requests.length,
      cameraBefore: before,
      cameraAfter: await camera(),
    };
  } finally {
    page.off("request", record);
    await writeFile(file, original);
  }
  await page.waitForTimeout(250);
}
await mkdir(destination.substring(0, destination.lastIndexOf("/")), {
  recursive: true,
});
await page.screenshot({ path: destination.replace(".json", ".png") });
const result = {
  time: new Date().toISOString(),
  environment: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    node: process.version,
    browser: browser.version(),
    viewport: { width: 1440, height: 900, dpr: 2 },
    headless: true,
  },
  url,
  firstBrowseMs,
  loading,
  reloadBrowseMs,
  reloadLoading,
  peakZoom,
  phases,
  update,
  errors,
};
await mkdir(destination.substring(0, destination.lastIndexOf("/")), {
  recursive: true,
});
await writeFile(destination, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    firstBrowseMs,
    reloadBrowseMs,
    loading: {...loading, requests: loading.requests.length},
    reloadLoading,
    phases: phases.map(({ name, frameP95, frameMax, taskMs, heapBytes }) => ({
      name,
      frameP95,
      frameMax,
      taskMs,
      heapBytes,
    })),
    update,
    errors,
  }),
);
await browser.close();
