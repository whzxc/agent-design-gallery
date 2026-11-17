import { groupReview } from '../../public/review-groups.js';
import { renderReviewFailures } from '../../public/review.js';
import { browserTask, readyResources } from './browser.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

/** Project the captures to one theme while keeping the classification of each move. */
export function reviewForTheme(review, theme) {
  const sections = Object.fromEntries(Object.entries(review.sections).map(([kind, entries]) => [kind,
    entries.map(entry => ({ ...entry, themes: entry.themes.filter(row => row.theme === theme) }))
      .filter(entry => entry.themes.length && (kind !== 'changed' || entry.previousSource || entry.themes.some(row => row.verdict === 'changed'))),
  ]));
  const themed = { ...review, sections, counts: {
    ...review.counts, added: sections.added.length, removed: sections.removed.length, changed: sections.changed.length,
  } };
  return { ...themed, ...groupReview(themed) };
}

export function reviewSheetHtml(review, theme, frameOrder = [], designDirs = { before: 'design', after: 'design' }) {
  const order = new Map(frameOrder.map((row, index) => [JSON.stringify([row.source, row.frame]), index]));
  const compare = (a, b) => a.source.localeCompare(b.source, 'en') ||
    (order.get(JSON.stringify([a.source, a.frame])) ?? 0) - (order.get(JSON.stringify([b.source, b.frame])) ?? 0);
  const grouped = groupReview(review);
  const added = [...review.sections.added].sort(compare);
  const direct = review.sections.changed.filter(entry => entry.change?.kind !== 'inherited').sort(compare);
  const removed = [...review.sections.removed].sort(compare);
  const groups = grouped.groups.map(group => ({ ...group, outliers: group.outliers.filter(entry => entry !== group.representative) }));
  const representativeByFrame = new Map(groups.map(group => [group.representative, group]));
  const outliers = groups.flatMap(group => group.outliers);
  const changed = [...direct, ...groups.flatMap(group => [group.representative, ...group.outliers])];
  const [firstAdded, ...otherAdded] = added;
  const [firstDirect, ...otherDirect] = direct;
  const priority = new Map([firstAdded, firstDirect, ...representativeByFrame.keys(), ...otherAdded, ...otherDirect,
    ...outliers].filter(Boolean).slice(0, 12).map((entry, index) => [entry, index]));
  const frameCount = entry => {
    const group = representativeByFrame.get(entry);
    return group ? group.frames.length - group.outliers.length : 1;
  };
  const name = (entry, dir) => {
    const source = dir && entry.source.startsWith(`${dir}/`) ? entry.source.slice(dir.length + 1) : entry.source;
    return `<code>${escapeHtml(source.replace(/\.[^./]+$/, ''))}#${escapeHtml(entry.frame)}</code>`;
  };
  const card = entry => {
    const row = entry.themes.find(row => row.theme === theme);
    const capture = side => {
      const src = row?.images?.[side];
      const sizeInfo = row?.[`${side}Size`];
      const width = sizeInfo && sizeInfo.width * Math.min(1, 480 / sizeInfo.height);
      const size = Number.isFinite(width) && width > 0 ? ` style="width:${width}px"` : '';
      const image = src?.startsWith('data:image/png;base64,') ? `<img src="${escapeHtml(src)}" alt=""${size}>` : '';
      return `<div class="capture">${image}</div>`;
    };
    const images = entry.status === 'added' ? capture('after') :
      `${capture('before')}<span class="arrow" aria-hidden="true">→</span>${capture('after')}`;
    const others = (representativeByFrame.get(entry)?.frames.length ?? 1) - 1;
    return `<article data-source="${escapeHtml(entry.source)}" data-frame="${escapeHtml(entry.frame)}" data-priority="${priority.get(entry)}" data-frame-count="${frameCount(entry)}"><div class="label">${name(entry, designDirs.after)}${others ? `<span>+${others}</span>` : ''}</div><div class="images">${images}</div></article>`;
  };
  const section = (label, entries, render, list = 'div') => entries.length ?
    `<section class="${label.toLowerCase()}"><h2>${label}</h2><${list} class="cells">${entries.map(render).join('')}</${list}></section>` : '';
  const more = [...added, ...changed].filter(entry => !priority.has(entry)).reduce((sum, entry) => sum + frameCount(entry), 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(review.label)}</title>
<style>
:root { color-scheme:light; --canvas:#f5f5f3; --text:#20211f; --muted:#575953; --border:#d0d1cc; }
.added { --accent:#235c38; --edge:#95b89f; --tint:#edf5ee; }
.changed { --accent:#76500f; --edge:#c5ad77; --tint:#faf3e2; }
.removed { --accent:#923a3a; --edge:#c89595; --tint:#faeded; }
@media (prefers-color-scheme: dark) {
  :root { color-scheme:dark; --canvas:#121212; --text:#efefed; --muted:#b3b3ae; --border:#52534e; }
  .added { --accent:#a4d5ae; --edge:#557a60; --tint:#1a2820; }
  .changed { --accent:#edd097; --edge:#8d7547; --tint:#2c2519; }
  .removed { --accent:#e9aaaa; --edge:#925e5e; --tint:#302020; }
}
* { box-sizing:border-box; }
body { margin:0; padding:24px; width:1600px; max-width:100%; background:var(--canvas); color:var(--text); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
header { max-height:3800px; overflow:hidden; }
.review-failures { padding:16px; border:1px solid var(--border); border-radius:8px; margin-top:16px; overflow-wrap:anywhere; }
h1 { margin:0; font-size:26px; }
h2 { margin:0 0 8px; color:var(--accent); font-size:18px; }
body > section { margin-top:16px; }
code { font-family:ui-monospace,Menlo,Consolas,monospace; overflow-wrap:anywhere; }
.cells { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; align-items:start; margin:0; padding:0; list-style:none; }
.cells > * { min-width:0; padding:8px 12px; border:1px solid var(--edge); border-radius:8px; background:var(--tint); font-size:14px; }
.label { display:flex; gap:10px; align-items:baseline; font-weight:600; }
.label span { flex:none; color:var(--accent); }
.images { display:flex; align-items:center; gap:8px; margin-top:8px; }
.capture { flex:1; min-width:0; }
.changed .capture:first-child img { margin-inline-start:auto; }
.arrow { color:var(--accent); flex:none; font-size:20px; line-height:1; }
img { display:block; max-width:100%; height:auto; max-height:480px; object-fit:contain; object-position:left top; }
footer { margin-top:12px; color:var(--muted); }
</style></head><body data-theme="${escapeHtml(theme)}">
<header><h1>${escapeHtml(review.label)}</h1>${renderReviewFailures(review.failures)}</header>
${section('Added', added.filter(entry => priority.has(entry)), card)}
${section('Changed', changed.filter(entry => priority.has(entry)), card)}
${section('Removed', removed, entry => `<li data-frame="${escapeHtml(entry.frame)}" data-removed>${name(entry, designDirs.before)}</li>`, 'ul')}
<footer data-more="${more}"${more ? '' : ' hidden'}>${more ? `+${more} more in the review page` : ''}</footer>
</body></html>`;
}

export async function renderReviewSheet(browser, review, theme, file, frameOrder, designDirs) {
  const page = await browserTask(browser, () => browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' }));
  try {
    await browserTask(browser, async () => {
      await page.setContent(reviewSheetHtml(review, theme, frameOrder, designDirs));
      await page.evaluate(readyResources);
      await page.evaluate(() => {
        const footer = document.querySelector('footer');
        const removed = [...document.querySelectorAll('[data-removed]')].reverse();
        const cells = [...document.querySelectorAll('[data-priority]')]
          .sort((a, b) => Number(b.dataset.priority) - Number(a.dataset.priority));
        let more = Number(footer.dataset.more);
        for (const entry of [...removed, ...cells]) {
          if (document.body.getBoundingClientRect().height <= 4000) break;
          const grid = entry.parentElement;
          entry.remove();
          if (!grid.childElementCount) grid.closest('section').remove();
          more += Number(entry.dataset.frameCount ?? 1);
          footer.dataset.more = more;
          footer.textContent = `+${more} more in the review page`;
          footer.hidden = false;
        }
      });
      await page.locator('body').screenshot({ path: file, animations: 'disabled', caret: 'hide' });
    });
    return { path: file, theme };
  } finally { await page.close(); }
}
