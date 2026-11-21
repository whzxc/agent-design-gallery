import { writeFile } from 'node:fs/promises';
import { launch } from '../src/toolkit/browser.mjs';

export async function recentBenchmark(url, destination, { navigate = false } = {}) {
  if (!url || !destination) throw Error('Pass the project Recently updated URL and output JSON path.');
  const previous = new URL(url);
  previous.searchParams.set('view', 'playable');
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const results = [];
  try {
    for (const name of ['cold', 'warm']) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        const times = window.recentBenchmark = {};
        const clock = start => {
          times.start = start;
          const tick = () => {
            const board = document.querySelector('#view-board');
            if (!board || board.hidden) return requestAnimationFrame(tick);
            times.shellMs ??= performance.now() - start;
            const content = board.querySelector('#view-board-content');
            if (content?.dataset.historyReady === 'true') {
              times.firstContentMs ??= performance.now() - start;
              times.cards ??= content.querySelectorAll('.view-frame').length;
            }
            if (content?.querySelector('canvas[data-preview=ready]')) times.firstPreviewMs ??= performance.now() - start;
            if (times.firstPreviewMs === undefined) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };
        window.beginRecentBenchmark = () => {
          for (const key of Object.keys(times)) delete times[key];
          clock(performance.now());
        };
        if (new URLSearchParams(location.search).get('view') === 'recent') clock(0);
      });
      let payload;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (/\/api\/recent-(?:frames|updates)\?/.test(response.url()))
          payload = response.json();
      });
      const enter = async () => {
        await page.locator('#filter-toggle').click();
        await page.locator('[data-filter=recent]').evaluate(button => {
          performance.clearResourceTimings();
          window.beginRecentBenchmark();
          button.click();
        });
      };
      await page.goto(navigate ? url : previous.href, { waitUntil: 'domcontentloaded' });
      if (!navigate) {
        await page.getByRole('main', { name: 'Playable', exact: true }).waitFor();
        await enter();
      }
      const measure = async label => {
        await page.waitForFunction(() => window.recentBenchmark.firstContentMs !== undefined, null, { timeout: 180000 });
        if (await page.evaluate(() => window.recentBenchmark.cards))
          await page.waitForFunction(() => window.recentBenchmark.firstPreviewMs !== undefined, null, { timeout: 120000 });
        const timing = await page.evaluate(() => ({
          ...window.recentBenchmark,
          request: performance.getEntriesByType('resource').filter(e => /\/api\/recent-(?:frames|updates)\?/.test(e.name))
            .map(({startTime, responseEnd, duration}) => ({ startTime, responseEnd, duration })).at(-1)
        }));
        const data = label === 'warm-reopen' ? null : await payload;
        const breakdown = data?.timings ?? data?.periods?.map(p => ({ period: p.title, cached: p.cached, ...p.timings }));
        if (timing.request) {
          timing.request.startTime -= timing.start;
          timing.request.responseEnd -= timing.start;
        }
        delete timing.start;
        results.push({ name: label, ...timing,
          ...(timing.request ? { renderMs: Math.max(0, timing.firstContentMs - timing.request.responseEnd) } : {}),
          breakdown, head: data?.head, errors: [...errors] });
        await writeFile(destination, JSON.stringify({ url, entry: navigate ? 'navigation' : 'filter action', results }, null, 2) + '\n');
      };
      await measure(name);
      if (name === 'warm') {
        await page.keyboard.press('Escape');
        await enter();
        await measure('warm-reopen');
        await page.close();
        break;
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
