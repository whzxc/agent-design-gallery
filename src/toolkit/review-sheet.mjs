import { browserTask, readyResources } from './browser.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

/** Match the model produced by a single-theme diff, including its counts. */
export function reviewForTheme(review, theme) {
  const sections = Object.fromEntries(Object.entries(review.sections).map(([kind, entries]) => [kind,
    entries.map(entry => ({ ...entry, themes: entry.themes.filter(row => row.theme === theme) }))
      .filter(entry => entry.themes.length && (kind !== 'changed' || entry.themes.some(row => row.verdict === 'changed'))),
  ]));
  return { ...review, sections, counts: Object.fromEntries(Object.entries(sections).map(([kind, entries]) => [kind, entries.length])) };
}

export function reviewSheetHtml(review, theme, frameOrder = []) {
  const order = new Map(frameOrder.map((row, index) => [JSON.stringify([row.source, row.frame]), index]));
  const entries = Object.values(review.sections).flat().sort((a, b) => {
    const sourceOrder = a.source.localeCompare(b.source, 'en');
    if (sourceOrder) return sourceOrder;
    return (order.get(JSON.stringify([a.source, a.frame])) ?? 0) - (order.get(JSON.stringify([b.source, b.frame])) ?? 0);
  });
  const shown = entries.slice(0, 24);
  const cards = shown.map(entry => {
    const row = entry.themes.find(row => row.theme === theme);
    const sides = entry.status === 'added' ? ['after'] : entry.status === 'removed' ? [] : ['before', 'after'];
    const images = sides.map(side => {
      const src = row?.images[side];
      const image = src?.startsWith('data:image/png;base64,')
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(side)}">` : '<p>Capture unavailable</p>';
      return `<figure><figcaption>${side === 'before' ? 'Before' : 'After'}</figcaption>${image}</figure>`;
    }).join('');
    return `<article data-source="${escapeHtml(entry.source)}" data-frame="${escapeHtml(entry.frame)}"><h2><code>${escapeHtml(entry.source)}#${escapeHtml(entry.frame)}</code><span>${escapeHtml(entry.status)}</span></h2>${images ? `<div class="images">${images}</div>` : ''}</article>`;
  }).join('');
  const more = entries.length - shown.length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(review.label)} review</title>
<style>
:root { color-scheme: light; --canvas:#ecece9; --surface:#fff; --text:#1c1c1a; --muted:#5b5b57; --border:#e2e2de; }
@media (prefers-color-scheme: dark) { :root { color-scheme:dark; --canvas:#121212; --surface:#1f1f1f; --text:#efefed; --muted:#a8a8a4; --border:#2d2d2d; } }
* { box-sizing:border-box; }
body { margin:0; padding:24px; width:1600px; max-width:100%; background:var(--canvas); color:var(--text); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
header { margin-bottom:24px; }
h1 { margin:0 0 8px; font-size:24px; }
p { margin:8px 0; }
code { font-family:ui-monospace,Menlo,Consolas,monospace; overflow-wrap:anywhere; }
.revisions, figcaption, h2 span { color:var(--muted); }
article { margin:0 0 16px; padding:16px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }
h2 { display:flex; justify-content:space-between; gap:16px; margin:0; font-size:16px; }
h2 span { font-weight:400; flex:none; }
.images { display:flex; align-items:flex-start; gap:16px; margin-top:12px; }
figure { flex:1; min-width:0; margin:0; }
figcaption { margin-bottom:8px; }
img { display:block; max-width:100%; height:auto; }
</style></head><body data-theme="${escapeHtml(theme)}">
<header><h1>${escapeHtml(review.label)}</h1>
<p class="revisions"><code>${escapeHtml(review.base.rev)} (${escapeHtml(review.base.sha)}) → working tree (${escapeHtml(review.current.head)})</code></p>
<p>${review.counts.added} added · ${review.counts.removed} removed · ${review.counts.changed} changed · ${escapeHtml(theme)}</p></header>
${cards || '<p>No added, removed, or changed frames.</p>'}
${more ? `<p>${more} more frames in the review URL.</p>` : ''}
</body></html>`;
}

export async function renderReviewSheet(browser, review, theme, file, frameOrder) {
  const page = await browserTask(browser, () => browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' }));
  try {
    await browserTask(browser, async () => {
      await page.setContent(reviewSheetHtml(review, theme, frameOrder));
      await page.evaluate(readyResources);
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
    });
    return { path: file, theme };
  } finally { await page.close(); }
}
