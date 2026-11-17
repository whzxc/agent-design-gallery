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
  const added = [...review.sections.added].sort(compare);
  const direct = review.sections.changed.filter(entry => entry.change?.kind !== 'inherited').sort(compare);
  const removed = [...review.sections.removed].sort(compare);
  const representatives = grouped.groups.map(group => group.representative);
  const priority = new Map([...new Set([...representatives, ...added, ...direct,
    ...grouped.groups.flatMap(group => group.outliers)])].slice(0, 12).map((entry, index) => [entry, index]));
  const name = entry => `<code>${escapeHtml(entry.source)}#${escapeHtml(entry.frame)}</code>`;
  const card = (entry, label, group) => {
    if (!priority.has(entry)) return '';
    const row = entry.themes.find(row => row.theme === theme);
    const sides = entry.status === 'added' ? ['after'] : ['before', 'after'];
    const images = sides.map(side => {
      const src = row?.images[side];
      const sizeInfo = row?.[`${side}Size`];
      const width = sizeInfo && sizeInfo.width * Math.min(1, 480 / sizeInfo.height);
      const size = Number.isFinite(width) && width > 0 ? ` style="width:${width}px"` : '';
      const image = src?.startsWith('data:image/png;base64,')
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(`${entry.source}#${entry.frame} (${side})`)}"${size}>` : '<p>Capture unavailable</p>';
      return `<figure><figcaption>${side === 'before' ? 'Before' : 'After'}</figcaption>${image}</figure>`;
    }).join('');
    const others = group?.frames.filter(member => member !== entry) ?? [];
    const details = group ? `<div class="group-details"><p>${group.frames.length} frames · ${group.causes.map(cause => `<code>${escapeHtml(cause)}</code>`).join(', ')}</p>
      ${others.length ? `<ul>${others.slice(0, 8).map(member => `<li>${name(member)}</li>`).join('')}</ul>` : ''}
      ${others.length > 8 ? `<p>${others.length - 8} other members</p>` : ''}</div>` : '';
    return `<article data-source="${escapeHtml(entry.source)}" data-frame="${escapeHtml(entry.frame)}" data-priority="${priority.get(entry)}"><h2>${name(entry)}<span>${escapeHtml(label)}</span></h2><div class="images">${images}</div>${details}</article>`;
  };
  const cards = [
    ...added.map(entry => card(entry, 'Added')),
    ...direct.map(entry => card(entry, 'Direct')),
    ...grouped.groups.flatMap(group => [
      card(group.representative, 'Representative', group),
      ...group.outliers.filter(entry => entry !== group.representative).map(entry => card(entry, 'Outlier')),
    ]),
  ].join('');
  const removedList = removed.length ? `<section class="removed"><h2>Removed</h2><ul>${removed.map(entry =>
    `<li data-frame="${escapeHtml(entry.frame)}" data-removed>${name(entry)}</li>`).join('')}</ul></section>` : '';
  const total = added.length + review.sections.changed.length + removed.length;
  const more = total - priority.size - removed.length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(review.label)} review</title>
<style>
:root { color-scheme: light; --canvas:#ecece9; --surface:#fff; --text:#1c1c1a; --muted:#5b5b57; --border:#e2e2de; }
@media (prefers-color-scheme: dark) { :root { color-scheme:dark; --canvas:#121212; --surface:#1f1f1f; --text:#efefed; --muted:#a8a8a4; --border:#2d2d2d; } }
* { box-sizing:border-box; }
body { margin:0; padding:24px; width:1600px; max-width:100%; background:var(--canvas); color:var(--text); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
header { margin-bottom:16px; max-height:3800px; overflow:hidden; }
.review-failures { padding:16px; border:1px solid var(--border); border-radius:8px; margin-top:16px; overflow-wrap:anywhere; }
.review-failures h2 { font-size:18px; }
h1 { margin:0 0 8px; font-size:24px; }
p { margin:8px 0; }
code { font-family:ui-monospace,Menlo,Consolas,monospace; overflow-wrap:anywhere; }
.revisions, figcaption, h2 span { color:var(--muted); }
.cells { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-items:start; }
article { min-width:0; padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }
h2 { display:flex; justify-content:space-between; gap:12px; margin:0; font-size:14px; }
h2 span { font-weight:400; flex:none; }
.images { display:flex; align-items:flex-start; gap:12px; margin-top:8px; }
figure { flex:1; min-width:0; margin:0; }
figcaption { margin-bottom:4px; font-size:13px; }
img { display:block; max-width:100%; height:auto; max-height:480px; object-fit:contain; object-position:left top; }
.group-details, .removed { font-size:13px; overflow-wrap:anywhere; }
.group-details ul, .removed ul { margin:4px 0; padding-left:20px; }
.removed { margin-top:12px; }
footer { margin-top:12px; color:var(--muted); }
</style></head><body data-theme="${escapeHtml(theme)}">
<header><h1>${escapeHtml(review.label)}</h1>
<p class="revisions"><code>${escapeHtml(review.base.rev)} (${escapeHtml(review.base.sha)}) → working tree (${escapeHtml(review.current.head)})</code></p>
<p>${grouped.counts.added} added · ${grouped.counts.removed} removed · ${grouped.counts.changed} changed (direct ${grouped.counts.direct}, inherited ${grouped.counts.inherited}) · ${escapeHtml(theme)}</p>${renderReviewFailures(review.failures)}</header>
<div class="cells">${cards}</div>
${removedList}
${total ? '' : '<p>No added, removed, or changed frames.</p>'}
<footer data-more="${more}">${more} more frames in the review URL.</footer>
</body></html>`;
}

export async function renderReviewSheet(browser, review, theme, file, frameOrder) {
  const page = await browserTask(browser, () => browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' }));
  try {
    await browserTask(browser, async () => {
      await page.setContent(reviewSheetHtml(review, theme, frameOrder));
      await page.evaluate(readyResources);
      await page.evaluate(() => {
        const footer = document.querySelector('footer');
        const removed = document.querySelector('.removed');
        const removals = [...document.querySelectorAll('[data-removed]')].reverse();
        const cells = [...document.querySelectorAll('[data-priority]')]
          .sort((a, b) => Number(b.dataset.priority) - Number(a.dataset.priority));
        let more = Number(footer.dataset.more);
        for (const entry of [...removals, ...cells]) {
          if (document.body.getBoundingClientRect().height <= 4000) break;
          entry.remove();
          if (removed && !removed.querySelector('li')) removed.remove();
          footer.textContent = `${++more} more frames in the review URL.`;
        }
      });
      await page.locator('body').screenshot({ path: file, animations: 'disabled', caret: 'hide' });
    });
    return { path: file, theme };
  } finally { await page.close(); }
}
