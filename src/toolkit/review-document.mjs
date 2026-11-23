import { createHash } from 'node:crypto';
import { renderCaptureExemptions } from './capture-exemptions.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const label = ({ source, frame }) => `${source.replace(/^design\//, '').replace(/\.tsx$/, '')}#${frame}`;
const key = ({ source, frame }) => JSON.stringify([source, frame]);
const short = revision => revision?.slice(0, 10) ?? '—';
const countLabel = count => `${count} ${count === 1 ? 'frame' : 'frames'}`;
const icons = {
  expand: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4m0 8v4h-4m-8 0H4v-4"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>',
};

function originLabel(origin) {
  const parts = [origin.layer, origin.chapter, origin.title].filter(Boolean);
  return parts.map(part => `<span>${escape(part)}</span>`).join('<span class="crumb-separator" aria-hidden="true">/</span>');
}

function originHtml(origin) {
  const content = `<span class="breadcrumbs">${originLabel(origin)}</span><strong>${escape(origin.frame)}${origin.href ? icons.external : ''}</strong>`;
  return origin.href ? `<a class="origin" href="${escape(origin.href)}" target="_blank" rel="noopener" title="Open in ADG">${content}</a>` : `<span class="origin">${content}</span>`;
}

export function reviewDocument(report, { properties, styles, templates }) {
  const { title, theme, base, head, cards, counts, groups, removed, moved, failures } = report;
  const byKey = new Map(cards.map(card => [key(card), card]));
  const added = cards.filter(card => card.status === 'added');
  const direct = cards.filter(card => card.status === 'changed' && card.change?.kind !== 'inherited');
  const cssText = value => value.replace(/<\/style/gi, '<\\/style');
  const sections = [
    { id: 'added', title: 'Added', count: counts.added, html: () => added.map(card => cardHtml(card)).join('') },
    { id: 'direct', title: 'Direct changes', count: counts.direct, html: () => direct.map(card => cardHtml(card)).join('') },
    { id: 'inherited', title: 'Inherited changes', count: counts.inherited, html: () => groups.map((group, index) => inheritedHtml(group, index, byKey)).join('') },
    { id: 'removed', title: 'Removed', count: counts.removed, html: () => namesHtml(removed.map(frame => originHtml(frame.origin))) },
    { id: 'moved', title: 'Moved', count: counts.moved, html: () => namesHtml(moved.map(({ before, after }) =>
      `${originHtml(before)}<span aria-hidden="true">→</span>${originHtml(after)}`)) },
  ].filter(section => section.count > 0);
  const script = `(${mountPreviews.toString()})();`;
  const hash = createHash('sha256').update(script).digest('base64');
  const framed = cards.some(card => card.before?.framed || card.after?.framed);
  const framesPolicy = framed ? 'frame-src about:; ' : '';
  const metadata = JSON.stringify(cards.map(({ before, after, difference }) => ({ before, after, difference: Boolean(difference) })));
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; font-src data:; ${framesPolicy}base-uri 'none'; form-action 'none'">
  <title>${escape(title)} · Design review</title>
  <style>${cssText(properties.join('\n'))}${documentStyles}</style>
</head>
<body>
  <header id="top" class="masthead">
    <div class="shell masthead-inner">
      <h1 title="${escape(title)} · Design review">${escape(title)} <span>Review</span></h1>
      <div class="revisions" aria-label="Compared revisions">
        <code title="Base ${escape(base)}">${short(base)}</code><span class="revision-arrow" aria-hidden="true">→</span>
        <code title="Working tree ${escape(head)}">${short(head)}</code>
      </div>
      <span class="theme-label">${theme === 'dark' ? 'Dark' : 'Light'} theme</span>
    </div>
  </header>
  <div class="shell layout">
    <main>
      ${failures.length ? `<section class="failures" role="alert"><h2>Some sources could not be built</h2><ul>${failures.map(failure =>
        `<li><code>${escape(failure.source)}</code> (${escape(failure.side)}) · ${escape(failure.message)}</li>`).join('')}</ul></section>` : ''}
      ${sections.map(({ id, title, count, html }) => `<section id="${id}" data-section="${id}" aria-labelledby="heading-${id}">
        <header class="section-head"><h2 id="heading-${id}">${title}</h2><span>${countLabel(count)}</span></header>
        <div class="section-body">${html()}</div>
      </section>`).join('')}
      ${sections.length ? '' : '<p>No changed frames.</p>'}
      ${renderCaptureExemptions(report.captureExemptions)}
    </main>
  </div>
  <dialog id="frame-zoom" aria-labelledby="zoom-title">
    <header class="zoom-header">
      <div id="zoom-title"></div>
      <div class="zoom-actions" aria-label="Zoom controls">
        <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
        <output id="zoom-scale"></output>
        <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" data-zoom="fit">Fit</button>
        <button type="button" data-zoom="actual">100%</button>
        <button type="button" data-zoom="close" aria-label="Close enlarged frame">${icons.close}</button>
      </div>
    </header>
    <div class="zoom-modes" role="group" aria-label="Frame comparison" id="zoom-modes"></div>
    <div class="zoom-panes" id="zoom-panes"></div>
  </dialog>
  <script id="review-data" type="application/json">${metadata}</script>
  ${styles.map((style, index) => `<template id="style-${index}"><style>${cssText(style)}</style></template>`).join('\n')}
  ${templates.join('\n')}
  ${cards.filter(card => card.difference).map(card => `<template id="difference-${card.index}"><img src="${escape(card.difference)}" alt="Changed pixels in ${escape(label(card))}"></template>`).join('\n')}
  <script>${script}</script>
</body>
</html>`;
}

function namesHtml(items) {
  return `<ul class="names">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function cardHtml(card, role) {
  const id = `review-${card.index}`;
  const added = card.status === 'added';
  const panes = added ? ['after'] : ['before', 'after', ...(card.difference ? ['difference'] : [])];
  const size = (preview) => `${Math.round(preview.width)} × ${Math.round(preview.height)}`;
  const dimensions = card.after ? (card.before && size(card.before) !== size(card.after)
    ? `${size(card.before)} → ${size(card.after)}` : size(card.after)) : '';
  return `<article class="frame-card" id="${id}" data-card="${card.index}" data-status="${card.status}"
    data-source="${escape(card.source)}" data-frame="${escape(card.frame)}" ${role ? `data-role="${role.toLowerCase()}"` : ''} aria-labelledby="${id}-title">
    <header class="card-head">
      <h3 id="${id}-title">${originHtml(card.origin)}</h3>
      <div class="card-meta">${role ? `<span class="role-label">${role}</span>` : ''}${dimensions ? `<span class="dimensions" aria-label="Frame size in CSS pixels">${dimensions}</span>` : ''}
        <button type="button" class="enlarge" data-enlarge="${added ? 'after' : 'compare'}" aria-label="Enlarge ${escape(card.origin.frame)}">${icons.expand}<span>Enlarge</span></button>
      </div>
    </header>
    <div class="panes" style="--panes:${panes.length}">
      ${panes.map(side => `<figure data-side="${side}"><figcaption>
        <span>${side[0].toUpperCase() + side.slice(1)}</span>
        ${side === 'before' && card.previousOrigin ? `<small>${escape(card.previousOrigin.title)} · ${escape(card.previousOrigin.frame)}</small>` : ''}
        ${side === 'difference' && card.differentPixels ? `<small>${card.differentPixels.toLocaleString('en-US')} px changed</small>` : ''}
      </figcaption><div class="stage">${card[side] ? `<button type="button" class="pane-trigger" data-enlarge="${side}" aria-label="Enlarge ${side} · ${escape(card.origin.frame)}" title="Enlarge ${side}">${icons.expand}</button>` : '<span class="absent">Absent at base</span>'}</div></figure>`).join('')}
    </div>
  </article>`;
}

function inheritedHtml(group, index, byKey) {
  const representative = key(group.representative);
  const outliers = group.outliers.map(key).filter(value => value !== representative);
  const featured = new Set([representative, ...outliers]);
  const rest = group.frames.map(key).filter(value => !featured.has(value));
  return `<section class="inherited-group" data-group="${index}" aria-labelledby="group-${index}">
    <header class="group-head"><h3 id="group-${index}">${group.causes.length ? group.causes.map(cause => `<code>${escape(cause)}</code>`).join('') : 'Shared dependencies'}</h3><span>${countLabel(group.frames.length)}</span></header>
    <div class="group-body">
      ${cardHtml(byKey.get(representative), 'Representative')}
      ${outliers.map(value => cardHtml(byKey.get(value), 'Outlier')).join('')}
      ${rest.length ? `<details><summary>${countLabel(rest.length)} more</summary><div class="members">${rest.map(value => cardHtml(byKey.get(value))).join('')}</div></details>` : ''}
    </div>
  </section>`;
}

function mountPreviews() {
  const data = JSON.parse(document.getElementById('review-data').textContent);
  const cards = [...document.querySelectorAll('[data-card]')];
  const sheetCache = new Map();
  const frameReady = new WeakMap();
  const pending = new Set();
  const zoom = document.getElementById('frame-zoom');
  const modes = document.getElementById('zoom-modes');
  const zoomPanes = document.getElementById('zoom-panes');
  const zoomTitle = document.getElementById('zoom-title');
  const zoomScale = document.getElementById('zoom-scale');
  const zoomNames = { compare: 'Compare', before: 'Before', after: 'After', difference: 'Difference' };
  let activeZoom;
  const styleTemplate = index => document.getElementById('style-' + index);
  function framedSpecimen(host, preview, body) {
    // Font faces are document-scoped in Chromium. Give each revision its own
    // document so faces with the same family name keep their original bytes.
    for (const link of body.content.querySelectorAll('link[data-review-style]')) {
      const style = styleTemplate(link.dataset.reviewStyle).content.firstElementChild.cloneNode(true);
      if (link.hasAttribute('media')) style.media = link.media;
      link.replaceWith(style);
    }
    host.title = 'Frame preview';
    host.tabIndex = -1;
    host.setAttribute('sandbox', 'allow-same-origin');
    host.style.border = '0';
    host.style.pointerEvents = 'none';
    frameReady.set(host, new Promise(resolve => host.addEventListener('load', resolve, { once: true })).then(async () => {
      const doc = host.contentDocument;
      if (doc) await Promise.allSettled([doc.fonts.ready, ...[...doc.images].map(image => image.decode())]);
    }));
    const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'; base-uri 'none'; form-action 'none'";
    host.srcdoc = `<!doctype html><html data-theme="${document.documentElement.dataset.theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}">${styleTemplate(preview.style).innerHTML}</head><body>${body.innerHTML}</body></html>`;
  }
  function specimen(preview) {
    const host = document.createElement(preview.framed ? 'iframe' : 'div');
    host.className = 'specimen';
    const width = Math.ceil(preview.width), height = Math.ceil(preview.height);
    host.style.width = width + 'px';
    host.style.height = height + 'px';
    const body = document.getElementById('frame-' + preview.template);
    if (preview.framed) {
      framedSpecimen(host, preview, body.cloneNode(true));
      return host;
    }
    for (const [unit, value] of Object.entries({ vw: width, vh: height, vmin: Math.min(width, height), vmax: Math.max(width, height) })) {
      host.style.setProperty('--review-' + unit, value / 100 + 'px');
    }
    if (!sheetCache.has(preview.style)) {
      const sheet = new CSSStyleSheet();
      const css = styleTemplate(preview.style).content.firstElementChild.textContent;
      sheet.replaceSync('review-document,review-body{display:block}review-document{min-height:100%}' + css);
      sheetCache.set(preview.style, sheet);
    }
    const root = host.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheetCache.get(preview.style)];
    root.append(body.content.cloneNode(true));
    return host;
  }

  function makePlane(index, side) {
    const plane = document.createElement('div');
    plane.className = 'plane';
    if (side === 'difference') plane.append(document.getElementById('difference-' + index).content.cloneNode(true));
    else plane.append(specimen(data[index][side]));
    return plane;
  }

  function sizesFor(preview, side) {
    const pair = side === 'difference' || side === 'compare';
    const frames = pair ? [preview.before, preview.after].filter(Boolean) : [preview[side]];
    return { width: Math.ceil(Math.max(...frames.map(frame => frame.width))), height: Math.ceil(Math.max(...frames.map(frame => frame.height))) };
  }

  function fit(card) {
    const { before, after } = data[Number(card.dataset.card)];
    const stages = [...card.querySelectorAll('.stage')];
    const width = Math.ceil(Math.max(before?.width ?? 0, after?.width ?? 0));
    const height = Math.ceil(Math.max(before?.height ?? 0, after?.height ?? 0));
    const available = Math.min(...stages.map(stage => stage.clientWidth)) - 28;
    if (!width || !height || available <= 0) return;
    const scale = Math.min(1, available / width, 360 / height);
    card.style.setProperty('--preview-scale', scale);
    card.style.setProperty('--plane-width', Math.ceil(width * scale) + 'px');
    card.style.setProperty('--plane-height', Math.ceil(height * scale) + 'px');
  }

  function mount(card) {
    if (card.dataset.mounted || card.closest('details:not([open])')) return;
    card.dataset.mounted = 'true';
    const index = Number(card.dataset.card), preview = data[index];
    const decodes = [];
    for (const pane of card.querySelectorAll('[data-side]')) {
      const side = pane.dataset.side;
      if (!preview[side]) continue;
      const plane = makePlane(index, side);
      if (frameReady.has(plane.firstElementChild)) decodes.push(frameReady.get(plane.firstElementChild));
      const images = plane.firstElementChild.shadowRoot?.querySelectorAll('img') ?? plane.querySelectorAll('img');
      decodes.push(...[...images].map(image => image.decode()));
      pane.querySelector('.stage').prepend(plane);
    }
    fit(card);
    Promise.allSettled([document.fonts.ready, ...decodes]).then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => { card.dataset.ready = 'true'; }));
    });
  }

  let queued = false;
  const near = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) pending.add(entry.target);
      else pending.delete(entry.target);
    }
    if (!queued && pending.size) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        for (const card of pending) {
          mount(card);
          if (card.dataset.mounted) near.unobserve(card);
        }
        pending.clear();
      });
    }
  }, { rootMargin: '280px 0px' });
  const sizes = new ResizeObserver(entries => { for (const entry of entries) fit(entry.target); });
  for (const card of cards) { fit(card); sizes.observe(card); near.observe(card); }

  function fitZoom() {
    if (!zoom.open || !activeZoom) return;
    const preview = data[activeZoom.index];
    const { width, height } = sizesFor(preview, activeZoom.mode);
    const stages = [...zoomPanes.querySelectorAll('.zoom-stage')];
    const fit = Math.max(.02, Math.min(2, ...stages.flatMap(stage => [(stage.clientWidth - 18) / width, (stage.clientHeight - 18) / height])));
    const scale = activeZoom.scale ?? fit;
    activeZoom.shown = scale;
    zoomScale.value = Math.round(scale * 100) + '%';
    zoomPanes.style.setProperty('--preview-scale', scale);
    zoomPanes.style.setProperty('--plane-width', Math.ceil(width * scale) + 'px');
    zoomPanes.style.setProperty('--plane-height', Math.ceil(height * scale) + 'px');
  }

  function showMode(mode) {
    activeZoom.mode = mode;
    activeZoom.scale = null;
    for (const button of modes.children) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    const sides = mode === 'compare' ? activeZoom.sides : [mode];
    zoomPanes.style.setProperty('--zoom-panes', sides.length);
    zoomPanes.replaceChildren(...sides.map(side => {
      const pane = document.createElement('figure');
      pane.dataset.side = side;
      const caption = document.createElement('figcaption');
      caption.textContent = zoomNames[side];
      const stage = document.createElement('div'), surface = document.createElement('div');
      stage.className = 'zoom-stage';
      surface.className = 'zoom-surface';
      stage.setAttribute('tabindex', '0');
      stage.setAttribute('aria-label', zoomNames[side] + ' preview');
      surface.append(makePlane(activeZoom.index, side));
      stage.append(surface);
      pane.append(caption, stage);
      return pane;
    }));
    fitZoom();
  }

  function openZoom(card, control) {
    const index = Number(card.dataset.card);
    const sides = ['before', 'after', 'difference'].filter(side => data[index][side]);
    const allowed = sides.length > 1 ? ['compare', ...sides] : sides;
    activeZoom = { index, sides, control };
    zoomTitle.replaceChildren(card.querySelector('.origin').cloneNode(true));
    modes.replaceChildren(...allowed.map(mode => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mode = mode;
      button.textContent = zoomNames[mode];
      button.addEventListener('click', () => showMode(mode));
      return button;
    }));
    modes.hidden = allowed.length === 1;
    zoom.showModal();
    showMode(allowed.includes(control.dataset.enlarge) ? control.dataset.enlarge : allowed[0]);
    zoom.querySelector('[data-zoom="close"]').focus();
    document.documentElement.classList.add('zoom-open');
  }

  for (const card of cards) card.addEventListener('click', event => {
    const control = event.target.closest('[data-enlarge]');
    if (control) openZoom(card, control);
  });
  zoom.querySelector('.zoom-actions').addEventListener('click', event => {
    const control = event.target.closest('[data-zoom]');
    if (!control || !activeZoom) return;
    const { zoom: action } = control.dataset;
    if (action === 'close') { zoom.close(); return; }
    if (action === 'fit') activeZoom.scale = null;
    if (action === 'actual') activeZoom.scale = 1;
    if (action === 'in') activeZoom.scale = Math.min(4, activeZoom.shown * 1.25);
    if (action === 'out') activeZoom.scale = Math.max(.02, activeZoom.shown / 1.25);
    fitZoom();
  });
  zoom.addEventListener('close', () => {
    document.documentElement.classList.remove('zoom-open');
    zoomPanes.replaceChildren();
    activeZoom?.control.focus();
    activeZoom = null;
  });
  const zoomSizes = new ResizeObserver(fitZoom);
  zoomSizes.observe(zoomPanes);

  function revealAnchor() {
    const target = document.getElementById(location.hash.slice(1));
    const group = target?.closest('details');
    if (group && !group.open) {
      group.open = true;
      requestAnimationFrame(() => target.scrollIntoView());
    }
  }
  window.addEventListener('hashchange', revealAnchor);
  revealAnchor();
}

const documentStyles = `
  :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light;
    --page:#f4f5f7;--top:#fff;--panel:#fff;--group:#eef0f3;--well:#edf0f4;--line:#d8dde5;--ink:#171d27;--muted:#596679;
    --accent:#284b9e;--nav-tint:#e7edf9;--positive:#266844;--warning:#8b4c18;}
  :root[data-theme="dark"]{color-scheme:dark;--page:#11141a;--top:#181c24;--panel:#1b2029;--group:#151a22;--well:#101319;
    --line:#313a49;--ink:#eff3f9;--muted:#a5b0c2;--accent:#afc4ff;--nav-tint:#232e47;--positive:#8ed2ab;--warning:#f0bb80;}
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;background:var(--page);color:var(--ink);font-size:14px;line-height:1.5}
  h1,h2,h3,p,ul,figure{margin:0} a{color:inherit;text-decoration:none}
  code,.dimensions,#zoom-scale{font:12px/1.5 ui-monospace,"SF Mono",Menlo,monospace}
  :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
  .shell{max-width:1680px;margin-inline:auto;padding-inline:clamp(16px,2.6vw,42px)}
  .masthead{background:var(--top);border-bottom:1px solid var(--line)}
  .masthead-inner{min-height:55px;padding-block:8px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:14px}
  h1{min-width:0;font-size:17px;letter-spacing:-.025em;line-height:1.3;font-weight:670;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  h1 span{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:7px}
  .revisions{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px;white-space:nowrap}
  .revisions code{color:var(--muted)}
  .revision-arrow{color:var(--accent)}
  .theme-label{line-height:1;white-space:nowrap;color:var(--muted);border-left:1px solid var(--line);padding-left:14px;font-size:11px}
  .layout{padding-block:21px 72px}
  main{min-width:0;display:grid;gap:42px}
  [data-section],.frame-card{scroll-margin-top:24px}
  .section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:13px;padding-bottom:10px;border-bottom:1px solid var(--line)}
  .section-head h2{font-size:22px;letter-spacing:-.025em;font-weight:650}
  #added .section-head h2{color:var(--positive)}
  .section-head>span,.group-head>span{color:var(--muted);font-size:12px;white-space:nowrap}
  .section-body,.members,.group-body{display:grid;gap:14px;min-width:0}
  #added .section-body{grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
  #added .frame-card,#added .panes figure{display:flex;flex-direction:column}
  #added .panes{flex:1;align-items:stretch}
  #added .stage{flex:1}
  .frame-card,.inherited-group{border:1px solid var(--line);border-radius:11px;min-width:0;overflow:hidden}
  .frame-card{background:var(--panel);--plane-height:0px}
  .frame-card:target{border-color:var(--accent)}
  .card-head{padding:11px 13px;min-height:60px;display:flex;justify-content:space-between;align-items:center;gap:8px 14px;border-bottom:1px solid var(--line)}
  .card-head h3{min-width:0}
  .origin{display:grid;gap:3px;min-width:0;overflow-wrap:anywhere}
  .origin strong{color:var(--ink);font-size:15px;font-weight:640;line-height:1.25}
  .origin strong svg{display:inline-block;vertical-align:-2px;margin-left:5px;color:var(--accent)}
  a.origin:hover strong{color:var(--accent)}
  .breadcrumbs{display:flex;align-items:baseline;flex-wrap:wrap;gap:1px 7px;color:var(--muted);font-size:11px;font-weight:500;line-height:1.3}
  .crumb-separator{color:var(--muted);opacity:.65}
  .card-meta{display:flex;gap:7px 10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;color:var(--muted);flex:none}
  .dimensions{font-size:11px;white-space:nowrap}
  .role-label{font-size:10px;color:var(--accent);border:1px solid var(--line);border-radius:999px;padding:0 6px}
  [data-role="outlier"] .role-label{color:var(--warning)}
  button{font:inherit;color:inherit}
  .enlarge,.zoom-actions button,.zoom-modes button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:4px 9px;
    border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);cursor:pointer;font-size:12px;white-space:nowrap}
  .enlarge:hover,.zoom-actions button:hover,.zoom-modes button:hover,.zoom-modes button[aria-pressed="true"]{background:var(--nav-tint);color:var(--accent)}
  .panes{display:grid;grid-template-columns:repeat(var(--panes),minmax(0,1fr));gap:10px;padding:11px 12px 12px;align-items:start}
  .panes figure{min-width:0}
  figcaption{display:flex;justify-content:space-between;align-items:baseline;gap:4px 8px;flex-wrap:wrap;font-size:11px;font-weight:630;color:var(--muted);padding:0 1px 6px}
  figcaption small{font-size:10px;font-weight:400;font-variant-numeric:tabular-nums}
  .stage{position:relative;display:grid;place-items:center;min-height:max(128px,calc(24px + var(--plane-height)));overflow:hidden;border:1px solid var(--line);border-radius:7px;background:var(--well)}
  .pane-trigger{display:block;position:absolute;inset:0;border:0;background:transparent;color:var(--ink);cursor:zoom-in}
  .pane-trigger svg{position:absolute;top:7px;right:7px;box-sizing:content-box;border:1px solid var(--line);border-radius:6px;padding:5px;background:var(--panel);opacity:0}
  .pane-trigger:hover svg,.pane-trigger:focus-visible svg{opacity:1}
  .pane-trigger:focus-visible{outline-offset:-3px}
  .plane{position:relative;width:var(--plane-width);height:var(--plane-height)}
  .plane>img{display:block;width:100%;height:100%;object-fit:contain;object-position:top left}
  .specimen{position:absolute;inset:0 auto auto 0;overflow:hidden;transform:scale(var(--preview-scale));transform-origin:top left;font:16px/normal "Times New Roman",serif;color:initial}
  .absent{color:var(--muted);font-size:12px}
  .inherited-group{background:var(--group)}
  .group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid var(--line)}
  .group-head h3{display:flex;flex-wrap:wrap;gap:5px 10px;min-width:0;font-size:13px}
  .group-head code{color:var(--accent);overflow-wrap:anywhere}
  .group-body{padding:12px}
  details{min-width:0}
  summary{cursor:pointer;color:var(--accent);font-size:12px;padding:6px 4px}
  .members{margin-top:7px}
  .names{list-style:none;padding:10px 13px;display:grid;gap:9px;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
  .names li{display:flex;gap:9px;flex-wrap:wrap;overflow-wrap:anywhere}
  .failures{padding:14px 17px;border:1px solid var(--warning);border-radius:9px}
  .failures h2{font-size:16px;color:var(--warning)}
  .zoom-open{overflow:hidden}
  #frame-zoom{padding:0;color:var(--ink);background:var(--top);border:1px solid var(--line);border-radius:12px;width:min(1640px,calc(100% - 34px));
    height:calc(100% - 34px);max-width:none;max-height:none;overflow:hidden}
  #frame-zoom[open]{display:flex;flex-direction:column}
  #frame-zoom::backdrop{background:rgb(5 8 13 / 78%)}
  .zoom-header{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 15px;border-bottom:1px solid var(--line)}
  #zoom-title{min-width:0}
  .zoom-actions{display:flex;align-items:center;gap:6px;flex:none}
  .zoom-actions button[data-zoom="close"]{margin-left:4px;min-width:32px}
  #zoom-scale{min-width:38px;text-align:center;color:var(--muted)}
  .zoom-modes{display:flex;gap:5px;flex-wrap:wrap;padding:9px 15px 0}
  .zoom-modes[hidden]{display:none}
  .zoom-modes button{min-height:28px}
  .zoom-panes{min-height:0;flex:1;display:grid;grid-template-columns:repeat(var(--zoom-panes,1),minmax(0,1fr));gap:10px;padding:12px 15px 15px}
  .zoom-panes figure{display:flex;flex-direction:column;min-width:0;min-height:0}
  .zoom-stage{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;background:var(--well);border:1px solid var(--line);border-radius:7px}
  .zoom-surface{width:max(100%,calc(var(--plane-width) + 16px));min-height:max(100%,calc(var(--plane-height) + 16px));display:grid;place-items:center}
  @media(max-width:1000px){.card-head{flex-wrap:wrap}.card-meta{justify-content:flex-start}}
  @media(max-width:760px){.layout{padding-top:14px}.panes{gap:7px}.section-head h2{font-size:20px}.zoom-header{flex-wrap:wrap}}
  @media(max-width:540px){.panes,#added .section-body{grid-template-columns:minmax(0,1fr)}.theme-label{display:none}.masthead-inner{grid-template-columns:minmax(0,1fr) auto;gap:8px}
    .revisions{gap:5px}.revisions code{font-size:9px}h1{font-size:15px}h1 span{font-size:11px}.card-meta{width:100%}.enlarge{margin-left:auto}
    .group-body{padding:9px}.section-head{margin-bottom:10px}.zoom-panes{grid-template-columns:1fr}.zoom-actions{flex-wrap:wrap}}
`;
