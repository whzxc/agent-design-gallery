import { groupReview } from './review-groups.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

const safeImageSrc = value => typeof value === 'string' && value.startsWith('data:image/png;base64,') ? value : null;

const shortSha = value => typeof value === 'string' && value.length > 12 ? value.slice(0, 12) : value;

function formatSize(size) {
  if (!size) return null;
  return `${size.width}×${size.height} (${size.pixelWidth}×${size.pixelHeight}px)`;
}

function themeSummary(item) {
  const sizes = [formatSize(item.beforeSize), formatSize(item.afterSize)].filter(Boolean);
  const uniqueSizes = [...new Set(sizes)];
  const sizeLabel = uniqueSizes.join(' → ');
  const diffLabel = item.verdict === 'identical'
    ? 'identical'
    : item.verdict === 'structural'
      ? 'structural'
      : `${item.differentPixels.toLocaleString('en-US')} px changed`;
  return [sizeLabel, diffLabel].filter(Boolean).join(' · ');
}

export function buildReview(data, imagesById = new Map(), { label } = {}) {
  const grouped = new Map();
  for (const row of data.comparisons ?? []) {
    const key = JSON.stringify([row.source, row.frame]);
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        source: row.source,
        frame: row.frame,
        status: row.status,
        change: row.change,
        rows: new Map(),
      };
      grouped.set(key, entry);
    }
    const rawImages = imagesById.get(row.id) ?? {};
    entry.rows.set(row.theme, {
      theme: row.theme,
      verdict: row.verdict,
      reasons: row.reasons ?? [],
      beforeSize: row.beforeSize ?? null,
      afterSize: row.afterSize ?? null,
      differentPixels: row.pixels?.differentPixels ?? 0,
      images: {
        before: safeImageSrc(rawImages.before),
        after: safeImageSrc(rawImages.after),
        difference: safeImageSrc(rawImages.difference),
      },
    });
  }

  const sections = { added: [], removed: [], changed: [] };
  for (const entry of grouped.values()) {
    const orderedThemes = ['light', 'dark'].filter(theme => entry.rows.has(theme)).map(theme => entry.rows.get(theme));
    for (const [theme, value] of entry.rows) {
      if (!['light', 'dark'].includes(theme)) orderedThemes.push(value);
    }
    if (entry.status === 'added') {
      sections.added.push({ source: entry.source, frame: entry.frame, status: 'added', themes: orderedThemes });
    } else if (entry.status === 'removed') {
      sections.removed.push({ source: entry.source, frame: entry.frame, status: 'removed', themes: orderedThemes });
    } else if (orderedThemes.some(item => item.verdict === 'changed')) {
      sections.changed.push({ source: entry.source, frame: entry.frame, status: 'changed', change: entry.change, themes: orderedThemes });
    }
  }

  const fallbackLabel = data.project ? data.project.split(/[\\/]/).filter(Boolean).at(-1) : 'Design review';
  const review = {
    label: label || fallbackLabel || 'Design review',
    base: data.base ?? { rev: 'HEAD', sha: '' },
    current: data.current ?? { kind: 'working_tree', head: null },
    complete: !!data.complete,
    failures: data.failures ?? [],
    verdict: data.verdict ?? null,
    counts: {
      added: sections.added.length,
      removed: sections.removed.length,
      changed: sections.changed.length,
    },
    sections,
  };
  return { ...review, ...groupReview(review) };
}

function renderSide(side, label, src, absentLabel, alt, theme) {
  const diffClass = side === 'difference' ? ' review-stage-diff' : '';
  const body = src
    ? `<div class="review-stage${diffClass}" data-stage-theme="${escapeHtml(theme)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy"></div>`
    : `<div class="review-absent">${escapeHtml(absentLabel)}</div>`;
  return `<figure class="review-pane" data-side="${escapeHtml(side)}"><figcaption>${escapeHtml(label)}</figcaption>${body}</figure>`;
}

function renderFrameCard(item, { paired = false, label: statusLabel = item.status } = {}) {
  const label = `${item.source}#${item.frame}`;
  const themeBlocks = item.themes.map(themeItem => {
    const theme = themeItem.theme;
    const summary = themeSummary(themeItem);
    const sides = item.status === 'added' ? ['after'] : paired ? ['before', 'after'] : ['before', 'after', 'difference'];
    const absentLabels = { before: 'Absent at base', after: 'Removed in working tree', difference: 'No difference image' };
    const panes = sides.map(side => renderSide(
      side, side[0].toUpperCase() + side.slice(1), themeItem.images[side], absentLabels[side], `${label} (${theme} ${side})`, theme,
    )).join('');
    return `<div class="review-theme" data-theme-row="${escapeHtml(theme)}" data-verdict="${escapeHtml(themeItem.verdict)}">
      <div class="review-theme-head">
        <span class="review-theme-name">${escapeHtml(theme)}</span>
        <span class="review-theme-meta">${escapeHtml(summary)}</span>
      </div>
      <div class="review-columns" style="--review-columns:${sides.length}">
        ${panes}
      </div>
    </div>`;
  }).join('');
  return `<article class="review-frame" data-source="${escapeHtml(item.source)}" data-frame="${escapeHtml(item.frame)}" data-status="${escapeHtml(item.status)}">
    <header class="review-frame-head">
      <h3><code>${escapeHtml(label)}</code></h3>
      <span class="review-status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(statusLabel)}</span>
    </header>
    <div class="review-themes">${themeBlocks}</div>
  </article>`;
}

export function renderReviewFailures(failures = []) {
  if (!failures.length) return '';
  return `<section class="review-failures" role="alert"><h2>Some sources could not be built</h2><ul>${failures.map(failure =>
    `<li><code>${escapeHtml(failure.source)}</code> (${escapeHtml(failure.side)}) — ${escapeHtml(failure.message)}</li>`
  ).join('')}</ul></section>`;
}

function renderNames(entries) {
  return `<ul class="review-names">${entries.map(entry => `<li data-source="${escapeHtml(entry.source)}" data-frame="${escapeHtml(entry.frame)}" data-status="${escapeHtml(entry.status)}"><code>${escapeHtml(entry.source)}#${escapeHtml(entry.frame)}</code></li>`).join('')}</ul>`;
}

function sameFrame(left, right) {
  return left.source === right.source && left.frame === right.frame;
}

function renderGroup(group) {
  const others = group.frames.filter(entry => !sameFrame(entry, group.representative));
  const remaining = others.filter(entry => !group.outliers.some(outlier => sameFrame(entry, outlier)));
  const causes = group.causes.map(cause => `<code>${escapeHtml(cause)}</code>`).join(', ');
  return `<article class="review-group">
    <header class="review-group-head"><h3>${causes}</h3><span>${group.frames.length} frames</span></header>
    ${renderFrameCard(group.representative, { paired: true, label: 'Representative' })}
    ${others.length ? renderNames(others) : ''}
    ${group.outliers.map(entry => renderFrameCard(entry, { paired: true, label: 'Outlier' })).join('')}
    ${remaining.length ? `<details class="review-group-members"><summary role="button">Show all ${group.frames.length} frames</summary><div class="review-section-list">${remaining.map(entry => renderFrameCard(entry, { paired: true, label: 'Inherited' })).join('')}</div></details>` : ''}
  </article>`;
}

export function renderReviewBody(review) {
  const grouped = { ...review, ...groupReview(review) };
  const { counts } = grouped;
  const baseLabel = review.base?.sha
    ? `${review.base.rev} (${shortSha(review.base.sha)})`
    : (review.base?.rev ?? 'base');
  const headLabel = review.current?.head ? `working tree (${shortSha(review.current.head)})` : 'working tree';
  const direct = (review.sections?.changed ?? []).filter(entry => entry.change?.kind !== 'inherited');
  const sectionSpecs = [
    ['added', 'Added', review.sections?.added ?? [], items => items.map(item => renderFrameCard(item)).join('')],
    ['direct', 'Direct changes', direct, items => items.map(item => renderFrameCard(item)).join('')],
    ['inherited', 'Inherited changes', grouped.groups ?? [], items => items.map(renderGroup).join('')],
    ['removed', 'Removed', review.sections?.removed ?? [], renderNames],
  ];
  const renderedSections = sectionSpecs
    .filter(([, , items]) => items.length > 0)
    .map(([kind, title, items, render]) => `<section class="review-section" data-section="${kind}">
      <h2 class="review-section-title">${escapeHtml(title)} <span class="review-section-count">${kind === 'inherited' ? counts.inherited : items.length}</span></h2>
      <div class="review-section-list">${render(items)}</div>
    </section>`)
    .join('');
  const empty = renderedSections
    ? ''
    : `<p class="review-empty" role="status">No added, removed, or changed frames against <code>${escapeHtml(review.base?.rev ?? 'base')}</code>.</p>`;

  return `<header class="review-header">
    <div class="review-heading">
      <h1 id="review-title">${escapeHtml(review.label)}</h1>
      <code class="review-revisions">base ${escapeHtml(baseLabel)} → ${escapeHtml(headLabel)}</code>
    </div>
    <div class="review-counts" data-review-counts>
      <span class="review-count" data-kind="added"><strong>${counts.added}</strong> added</span>
      <span class="review-count" data-kind="removed"><strong>${counts.removed}</strong> removed</span>
      <span class="review-count" data-kind="changed"><strong>${counts.changed}</strong> changed (direct ${counts.direct}, inherited ${counts.inherited})</span>
    </div>
  </header>
  <div class="review-scroll">${renderReviewFailures(review.failures)}${renderedSections}${empty}</div>`;
}

export function renderReview(container, review) {
  container.innerHTML = renderReviewBody(review);
}

export const REVIEW_STYLES = `
.review-failures { padding:16px; border:1px solid var(--border); border-radius:8px; background:var(--surface-sunken); overflow-wrap:anywhere; }
.review-failures h2 { margin:0 0 8px; font-size:14px; }
.review-failures ul { margin:0; padding-left:20px; }
.review-failures li + li { margin-top:8px; }

.review-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px 20px; padding:16px 20px; border-bottom:1px solid var(--border); flex:none; }
.review-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px 12px; min-width:0; }
.review-heading h1 { font-size:var(--text-title); font-weight:650; line-height:20px; margin:0; }
.review-revisions { font:var(--text-meta)/1.4 var(--font-mono); color:var(--text-secondary); }
.review-counts { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.review-count { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; background:var(--surface-sunken); font-size:var(--text-meta); color:var(--text-secondary); }
.review-count strong { font-family:var(--font-mono); font-weight:650; color:var(--text); }
.review-scroll { min-height:0; flex:1; overflow:auto; padding:20px; display:flex; flex-direction:column; gap:28px; }
.review-section { display:flex; flex-direction:column; gap:14px; }
.review-section-title { display:flex; align-items:center; gap:8px; font-size:var(--text-section); font-weight:650; color:var(--text); margin:0; }
.review-section-count { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:20px; padding:0 6px; border-radius:999px; background:var(--surface-sunken); font:600 var(--text-caption)/1 var(--font-mono); color:var(--text-secondary); }
.review-section-list { display:flex; flex-direction:column; gap:16px; }
.review-frame { border:1px solid var(--border); border-radius:var(--radius-menu); background:var(--surface-section); overflow:hidden; }
.review-frame-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; border-bottom:1px solid var(--border); background:var(--surface); }
.review-frame-head h3 { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px; margin:0; font-size:var(--text-body); font-weight:600; color:var(--text); }
.review-frame-head code { font:var(--text-meta)/1.4 var(--font-mono); color:var(--text-secondary); }
.review-group { display:flex; flex-direction:column; gap:14px; padding:16px; border:1px solid var(--border); border-radius:var(--radius-menu); }
.review-group-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.review-group-head h3 { margin:0; font:var(--text-meta)/1.5 var(--font-mono); overflow-wrap:anywhere; }
.review-group-head span { flex:none; color:var(--text-secondary); }
.review-names { margin:0; padding-left:20px; font:var(--text-meta)/1.6 var(--font-mono); overflow-wrap:anywhere; }
.review-group-members summary { cursor:pointer; color:var(--text-secondary); }
.review-group-members[open] summary { margin-bottom:14px; }
.review-dot { color:var(--text-tertiary); }
.review-status-pill { flex:none; padding:2px 8px; border-radius:999px; background:var(--surface-sunken); font-size:var(--text-caption); font-weight:600; text-transform:capitalize; color:var(--text-secondary); }
.review-themes { display:flex; flex-direction:column; gap:1px; background:var(--border); }
.review-theme { background:var(--surface); padding:14px 16px 16px; display:flex; flex-direction:column; gap:10px; }
.review-theme-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.review-theme-name { font-size:var(--text-meta); font-weight:650; text-transform:capitalize; color:var(--text); }
.review-theme-meta { font:var(--text-caption)/1.4 var(--font-mono); color:var(--text-tertiary); }
.review-columns { display:grid; grid-template-columns:repeat(var(--review-columns, 3), minmax(0, 1fr)); gap:12px; align-items:start; }
@media (max-width:900px) { .review-columns { grid-template-columns:1fr; } }
.review-pane { margin:0; display:flex; flex-direction:column; gap:6px; min-width:0; }
.review-pane figcaption { font-size:var(--text-caption); font-weight:550; color:var(--text-secondary); }
.review-stage { border:1px solid var(--border); border-radius:var(--radius-row); padding:10px; display:flex; align-items:center; justify-content:center; min-height:96px; overflow:auto; background:#ecece9; }
.review-stage[data-stage-theme="dark"] { background:#121212; border-color:#2d2d2d; }
.review-stage-diff { background:repeating-conic-gradient(var(--surface-sunken) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px; }
.review-stage-diff[data-stage-theme="dark"] { background:repeating-conic-gradient(#1f1f1f 0% 25%, #161616 0% 50%) 50% / 14px 14px; }
.review-stage img { display:block; max-width:100%; height:auto; }
.review-absent { border:1px dashed var(--border); border-radius:var(--radius-row); min-height:96px; padding:12px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:var(--text-meta); color:var(--text-tertiary); background:var(--surface-sunken); }
.review-empty { margin:12px 0; color:var(--text-secondary); font-size:var(--text-body); }
.review-empty code { font:var(--text-meta)/1.4 var(--font-mono); }
`.trim();

export function reviewDocumentHtml(review) {
  const title = `${review.label} · Design review`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", Inter, sans-serif;
      --font-mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
      --text-title: 15px;
      --text-section: 14px;
      --text-body: 13px;
      --text-meta: 12px;
      --text-caption: 11px;
      --radius-panel: 14px;
      --radius-menu: 12px;
      --radius-row: 8px;
      --canvas: #ecece9;
      --surface: #ffffff;
      --surface-section: #f5f5f3;
      --surface-sunken: #f1f1ee;
      --border: #e2e2de;
      --text: #1c1c1a;
      --text-secondary: #5b5b57;
      --text-tertiary: #7c7c77;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --canvas: #121212;
        --surface: #1f1f1f;
        --surface-section: #191919;
        --surface-sunken: #2a2a2a;
        --border: #2d2d2d;
        --text: #efefed;
        --text-secondary: #a8a8a4;
        --text-tertiary: #85857f;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; font: var(--text-body)/1.35 var(--font-ui); color: var(--text); background: var(--canvas); }
    main#review-document { max-width: 1480px; margin: 16px auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-panel); overflow: hidden; }
    main#review-document .review-scroll { overflow: visible; }
    ${REVIEW_STYLES}
  </style>
</head>
<body>
  <main id="review-document" aria-labelledby="review-title">
    ${renderReviewBody(review)}
  </main>
</body>
</html>
`;
}
