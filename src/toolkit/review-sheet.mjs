import { groupReview } from '../../public/review-groups.js';
import { renderReviewFailures } from '../../public/review.js';
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
  const themed = { ...review, sections, counts: Object.fromEntries(Object.entries(sections).map(([kind, entries]) => [kind, entries.length])) };
  return { ...themed, ...groupReview(themed) };
}

export function reviewSheetHtml(review, theme, frameOrder = []) {
  const order = new Map(frameOrder.map((row, index) => [JSON.stringify([row.source, row.frame]), index]));
  const compare = (a, b) => a.source.localeCompare(b.source, 'en') ||
    (order.get(JSON.stringify([a.source, a.frame])) ?? 0) - (order.get(JSON.stringify([b.source, b.frame])) ?? 0);
  const grouped = groupReview(review);
  let imageCount = 0;
  let budgetExhausted = false;
  const pictured = new Set();
  const identity = entry => JSON.stringify([entry.source, entry.frame]);
  const names = entries => `<ul class="frame-names">${entries.map(entry => `<li data-source="${escapeHtml(entry.source)}" data-frame="${escapeHtml(entry.frame)}" data-status="${escapeHtml(entry.status)}"><code>${escapeHtml(entry.source)}#${escapeHtml(entry.frame)}</code></li>`).join('')}</ul>`;
  const card = (entry, label = entry.status) => {
    const row = entry.themes.find(row => row.theme === theme);
    const sides = entry.status === 'added' ? ['after'] : ['before', 'after'];
    const cost = sides.filter(side => row?.images[side]?.startsWith('data:image/png;base64,')).length;
    if (budgetExhausted || imageCount + cost > 24) {
      budgetExhausted = true;
      return '';
    }
    imageCount += cost;
    pictured.add(identity(entry));
    const images = sides.map(side => {
      const src = row?.images[side];
      const image = src?.startsWith('data:image/png;base64,')
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(`${entry.source}#${entry.frame} (${side})`)}">` : '<p>Capture unavailable</p>';
      return `<figure><figcaption>${side === 'before' ? 'Before' : 'After'}</figcaption>${image}</figure>`;
    }).join('');
    return `<article data-source="${escapeHtml(entry.source)}" data-frame="${escapeHtml(entry.frame)}"><h2><code>${escapeHtml(entry.source)}#${escapeHtml(entry.frame)}</code><span>${escapeHtml(label)}</span></h2><div class="images">${images}</div></article>`;
  };
  const added = [...review.sections.added].sort(compare).map(entry => card(entry)).join('');
  const direct = review.sections.changed.filter(entry => entry.change?.kind !== 'inherited').sort(compare).map(entry => card(entry, 'Direct')).join('');
  const inherited = grouped.groups.map(group => {
    const representative = card(group.representative, 'Representative');
    const others = group.frames.filter(entry => identity(entry) !== identity(group.representative));
    const outliers = group.outliers.map(entry => card(entry, 'Outlier')).join('');
    return `<section class="inherited-group"><h2>${group.causes.map(cause => `<code>${escapeHtml(cause)}</code>`).join(', ')}<span>${group.frames.length} frames</span></h2>${representative}${others.length ? names(others) : ''}${outliers}</section>`;
  }).join('');
  const removed = review.sections.removed.length ? `<section class="removed"><h2>Removed</h2>${names([...review.sections.removed].sort(compare))}</section>` : '';
  const cards = added + direct + inherited + removed;
  const more = [...review.sections.added, ...review.sections.changed].filter(entry => !pictured.has(identity(entry))).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(review.label)} review</title>
<style>
:root { color-scheme: light; --canvas:#ecece9; --surface:#fff; --text:#1c1c1a; --muted:#5b5b57; --border:#e2e2de; }
@media (prefers-color-scheme: dark) { :root { color-scheme:dark; --canvas:#121212; --surface:#1f1f1f; --text:#efefed; --muted:#a8a8a4; --border:#2d2d2d; } }
* { box-sizing:border-box; }
body { margin:0; padding:24px; width:1600px; max-width:100%; background:var(--canvas); color:var(--text); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
header { margin-bottom:24px; }
.review-failures { padding:16px; border:1px solid var(--border); border-radius:8px; margin-top:16px; overflow-wrap:anywhere; }
.review-failures h2 { font-size:18px; }
h1 { margin:0 0 8px; font-size:24px; }
p { margin:8px 0; }
code { font-family:ui-monospace,Menlo,Consolas,monospace; overflow-wrap:anywhere; }
.revisions, figcaption, h2 span { color:var(--muted); }
.inherited-group { margin-bottom:16px; padding:16px; border:1px solid var(--border); border-radius:12px; }
.inherited-group > h2 { margin-bottom:12px; }
.frame-names { padding-left:20px; overflow-wrap:anywhere; }
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
<p>${grouped.counts.added} added · ${grouped.counts.removed} removed · ${grouped.counts.changed} changed (direct ${grouped.counts.direct}, inherited ${grouped.counts.inherited}) · ${escapeHtml(theme)}</p>${renderReviewFailures(review.failures)}</header>
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
