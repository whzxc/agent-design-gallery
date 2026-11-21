import { motionCard, motionStyle } from './review-motion-card.mjs';
import { renderReviewFailures } from './diff-document.mjs';
import { browserTask, readyResources } from './browser.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

export function reviewSheetHtml(review, theme, frameOrder = [], designDirs = { before: 'design', after: 'design' }) {
  const order = new Map(frameOrder.map((row, index) => [JSON.stringify([row.source, row.frame]), index]));
  const compare = (a, b) => a.source.localeCompare(b.source, 'en') ||
    (order.get(JSON.stringify([a.source, a.frame])) ?? 0) - (order.get(JSON.stringify([b.source, b.frame])) ?? 0);
  const added = [...review.sections.added].sort(compare);
  const direct = review.sections.changed.filter(entry => entry.change?.kind !== 'inherited').sort(compare);
  const removed = [...review.sections.removed].sort(compare);
  const moved = [...review.movePairs].sort((a, b) => compare(a.after, b.after));
  const groups = review.groups.map(group => ({ ...group, outliers: group.outliers.filter(entry => entry !== group.representative) }));
  const representativeByFrame = new Map(groups.map(group => [group.representative, group]));
  const outliers = groups.flatMap(group => group.outliers);
  const inherited = groups.flatMap(group => [group.representative, ...group.outliers]);
  const [firstAdded, ...otherAdded] = added;
  const [firstDirect, ...otherDirect] = direct;
  const motion = review.motion?.cards ?? [];
  const priority = new Map([firstAdded, firstDirect, ...motion, ...representativeByFrame.keys(), ...otherAdded, ...otherDirect,
    ...outliers].filter(Boolean).slice(0, 12).map((entry, index) => [entry, index]));
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
    const group = representativeByFrame.get(entry);
    const role = group ? `Representative · ${group.frames.length} ${group.frames.length === 1 ? 'frame' : 'frames'}` :
      entry.change?.kind === 'inherited' ? 'Outlier' : '';
    return `<article data-priority="${priority.get(entry)}"><div class="label">${name(entry, designDirs.after)}${role ? `<span>${role}</span>` : ''}</div><div class="images">${images}</div></article>`;
  };
  const section = (kind, label, entries, render, list = 'div') => entries.length ?
    `<section class="${kind}"><h2>${label}</h2><${list} class="cells">${entries.map(render).join('')}</${list}></section>` : '';
  const total = added.length + review.sections.changed.length + removed.length + moved.length + motion.length;
  const more = added.length + review.sections.changed.length + motion.length - priority.size;
  const omittedMotion = motion.filter(entry => !priority.has(entry)).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(review.label)}</title>
<style>
:root { color-scheme:light; --canvas:#f5f5f3; --text:#20211f; --muted:#575953; --border:#d0d1cc; }
.added { --accent:#235c38; --edge:#95b89f; }
.changed { --accent:#76500f; --edge:#c5ad77; }
.removed { --accent:#923a3a; --edge:#c89595; }
.moved { --accent:#32567a; --edge:#91abc5; }
@media (prefers-color-scheme: dark) {
  :root { color-scheme:dark; --canvas:#121212; --text:#efefed; --muted:#b3b3ae; --border:#52534e; }
  .added { --accent:#a4d5ae; --edge:#557a60; }
  .changed { --accent:#edd097; --edge:#8d7547; }
  .removed { --accent:#e9aaaa; --edge:#925e5e; }
  .moved { --accent:#abccec; --edge:#58789a; }
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
.cells > * { min-width:0; padding:8px 12px; border:1px solid var(--edge); border-radius:8px; font-size:14px; }
.label { display:flex; flex-wrap:wrap; gap:4px 10px; align-items:baseline; font-weight:600; }
.label span { color:var(--muted); font-weight:400; }
.images { display:flex; align-items:center; gap:8px; margin-top:8px; }
.capture { flex:1; min-width:0; }
.changed .capture:first-child img { margin-inline-start:auto; }
.arrow { color:var(--muted); flex:none; font-size:20px; line-height:1; }
img { display:block; max-width:100%; height:auto; max-height:480px; object-fit:contain; object-position:left top; }
footer { margin-top:12px; color:var(--muted); }
${motion.length ? motionStyle : ''}</style></head><body data-theme="${escapeHtml(theme)}">
<header><h1>${escapeHtml(review.label)}</h1>${renderReviewFailures(review.failures)}</header>
${total || review.failures.length ? '' : '<p>No design changes.</p>'}
${section('added', 'Added', added.filter(entry => priority.has(entry)), card)}
${section('changed', 'Direct changes', direct.filter(entry => priority.has(entry)), card)}
${section('changed', 'Inherited changes', inherited.filter(entry => priority.has(entry)), card)}
${section('changed', 'Transition changes', motion.filter(e => priority.has(e)), e =>
  `<div data-priority="${priority.get(e)}">${motionCard(e, priority.get(e), review.motion.assets)}</div>`)}
${section('removed', 'Removed', removed, entry => `<li data-list-entry>${name(entry, designDirs.before)}</li>`, 'ul')}
${section('moved', 'Moved', moved, ({ before, after }) => `<li data-list-entry>${name(before, designDirs.before)} → ${name(after, designDirs.after)}</li>`, 'ul')}
<footer data-motion-more="${omittedMotion}" data-more="${more}"${more ? '' : ' hidden'}>${more ? `+${more} more in the full review${omittedMotion ? ' · ' + omittedMotion + ' transition cards omitted' : ''}` : ''}</footer>
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
        const listEntries = [...document.querySelectorAll('[data-list-entry]')].reverse();
        const cells = [...document.querySelectorAll('[data-priority]')]
          .sort((a, b) => Number(b.dataset.priority) - Number(a.dataset.priority));
        let more = Number(footer.dataset.more), omittedMotion = Number(footer.dataset.motionMore);
        for (const entry of [...listEntries, ...cells]) {
          if (document.body.getBoundingClientRect().height <= 4000) break;
          const grid = entry.parentElement;
          entry.remove();
          if (!grid.childElementCount) grid.closest('section').remove();
          more++;
          if (entry.querySelector('[data-motion]')) omittedMotion++;
          footer.textContent = `+${more} more in the full review` + (omittedMotion ? ` · ${omittedMotion} transition cards omitted` : '');
          footer.hidden = false;
        }
      });
      await page.locator('body').screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
    });
    return { path: file, theme };
  } finally { await page.close(); }
}
