const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const short = revision => revision?.slice(0, 8) ?? 'Working';
const cssText = value => value.replace(/<\/style/gi, '<\\/style');
const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');

const icons = {
  expand: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4m0 8v4h-4m-8 0H4v-4"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>',
};

function summaryLine(counts, omitted) {
  const parts = [];
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.moved) parts.push(`${counts.moved} moved`);
  if (omitted) parts.push(`${omitted} more in full HTML`);
  return parts.join(' · ') || 'No changes';
}

function cardBadge(card) {
  if (card.proposed) return 'Proposed';
  if (card.status === 'added') return 'Added';
  return card.change?.kind === 'inherited' ? 'Inherited' : 'Direct';
}

function dimensionsLabel(card) {
  if (!card.after) return '';
  const w2 = Math.round(card.after.width), h2 = Math.round(card.after.height);
  if (card.before) {
    const w1 = Math.round(card.before.width), h1 = Math.round(card.before.height);
    if (w1 !== w2 || h1 !== h2) return `${w1}×${h1} → ${w2}×${h2}`;
  }
  return `${w2}×${h2}`;
}

function cardHeadHtml(card, index) {
  const badge = cardBadge(card);
  const origin = card.origin;
  const crumb = [origin.layer, origin.title].filter(Boolean).join(' / ');
  const title = origin.href
    ? `<a class="origin-frame" href="${escape(origin.href)}" target="_blank" rel="noopener" title="Open in ADG">${escape(origin.frame)}${icons.external}</a>`
    : `<span class="origin-frame">${escape(origin.frame)}</span>`;
  const dims = dimensionsLabel(card);
  const changed = card.status === 'changed';
  return `<header class="card-head">
    <div class="card-title">
      <span class="badge" data-badge="${escape(badge.toLowerCase())}">${escape(badge)}</span>
      ${crumb ? `<span class="origin-crumb">${escape(crumb)}</span>` : ''}
      ${title}
      ${card.proposed ? `<span class="meta-tag">${escape(card.proposed)}</span>` : ''}
      ${dims ? `<span class="meta-dim">${escape(dims)}</span>` : ''}
      ${card.differentPixels ? `<span class="meta-dim">${card.differentPixels.toLocaleString('en-US')} px</span>` : ''}
    </div>
    <div class="card-actions">
      ${changed ? `<div class="card-modes" role="group" aria-label="View mode for ${escape(origin.frame)}">
        <button type="button" class="mode-btn" data-card-mode="split" aria-pressed="true">Split</button>
        <button type="button" class="mode-btn" data-card-mode="slider" aria-pressed="false">Slider</button>
        <button type="button" class="mode-btn" data-card-mode="after" aria-pressed="false">After</button>
        <button type="button" class="mode-btn" data-card-mode="before" aria-pressed="false">Before</button>
      </div>` : ''}
      <button type="button" class="enlarge-btn" data-enlarge="default" aria-label="Enlarge ${escape(origin.frame)}">${icons.expand}<span>Enlarge</span></button>
    </div>
  </header>`;
}

function staticCardHtml(card, index) {
  const maxHeight = Math.ceil(Math.max(card.before?.height ?? 0, card.after?.height ?? 0));
  return `<article class="frame-card" id="embed-card-${index}" data-embed-card="${index}" data-status="${escape(card.status)}" style="--frame-h:${maxHeight}px">
    ${cardHeadHtml(card, index)}
    <div class="card-stage" data-stage-host></div>
    ${card.note ? `<div class="card-note">${escape(card.note)}</div>` : ''}
  </article>`;
}

function motionCardHtml(card, index) {
  const label = card.after?.edge.label ?? card.before?.edge.label ?? card.id;
  const sideHtml = (sideName, sideLabel) => {
    const side = card[sideName];
    if (!side) return '';
    return `<div class="motion-side">
      <div class="motion-head">${sideLabel} · ${side.error ? escape(side.error) : `${escape(side.edge?.gesture ?? side.edge?.trigger?.on ?? '')} · ${side.duration} ms`}</div>
      ${side.error || !side.samples?.length ? '' : `<div class="motion-strip">${side.samples.map(s => `<figure><img data-motion-image="${escape(s.image)}" alt="${sideLabel} at ${s.ms} ms"><figcaption>${s.state ? escape(s.state) + ' ' : ''}${s.ms} ms</figcaption></figure>`).join('')}</div>`}
    </div>`;
  };
  return `<article class="frame-card motion-card" data-motion-card="${index}">
    <header class="card-head">
      <div class="card-title">
        <span class="badge" data-badge="motion">Motion</span>
        <span class="origin-frame">${escape(label)}</span>
        <span class="meta-tag">${escape(card.kind)}</span>
      </div>
      <span class="meta-dim">${escape(card.reasons.join(' · '))}</span>
    </header>
    <div class="motion-wrap">${sideHtml('before', 'Before')}${sideHtml('after', 'After')}</div>
  </article>`;
}

export function reviewEmbedDocument(report, { properties, styles, templates }) {
  const { title, theme, base, head, cards, omitted = 0, counts, failures, motion } = report;
  const hasChanged = cards.some(card => card.status === 'changed');
  const hasItems = cards.length > 0 || (motion?.cards?.length ?? 0) > 0;
  const payload = {
    theme,
    counts,
    omitted,
    cards: cards.map(card => ({
      index: card.index,
      source: card.source,
      frame: card.frame,
      status: card.status,
      change: card.change ?? null,
      proposed: card.proposed ?? null,
      note: card.note ?? null,
      origin: card.origin,
      before: card.before,
      after: card.after,
      differentPixels: card.differentPixels ?? null,
    })),
    motionAssets: motion?.assets ?? null,
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} · Inline design review</title>
  <style>${cssText(properties.join('\n'))}${embedStyles}</style>
</head>
<body>
  <div id="embed-root" data-preview-theme="${escape(theme)}">
    <header class="topbar">
      <div class="topbar-left">
        <div class="segmented" role="group" aria-label="Preview theme">
          <button type="button" data-theme-toggle="light" aria-pressed="${theme === 'light'}">Light</button>
          <button type="button" data-theme-toggle="dark" aria-pressed="${theme === 'dark'}">Dark</button>
        </div>
        ${hasChanged ? `<div class="segmented" role="group" aria-label="Comparison view">
          <button type="button" data-global-mode="split" aria-pressed="true">Split</button>
          <button type="button" data-global-mode="slider" aria-pressed="false">Slider</button>
        </div>` : ''}
        <span class="summary">${escape(summaryLine(counts, omitted))}</span>
      </div>
      <div class="revisions" title="${escape(title)}">
        <code title="Base ${escape(base)}">${escape(short(base))}</code>
        <span aria-hidden="true">→</span>
        <code title="Working tree ${escape(head)}">${escape(!head || head === base ? 'Working' : short(head))}</code>
      </div>
    </header>
    ${failures.length ? `<section class="failures" role="alert"><strong>Some sources could not be built</strong><ul>${failures.map(f =>
      `<li><code>${escape(f.source)}</code> (${escape(f.side)}): ${escape(f.message)}</li>`).join('')}</ul></section>` : ''}
    ${hasItems ? `<div id="embed-cards" class="cards">${cards.map(staticCardHtml).join('')}${(motion?.cards ?? []).map(motionCardHtml).join('')}</div>` : `<div class="empty">No changed frames.</div>`}
  </div>
  <dialog id="embed-zoom" aria-labelledby="zoom-title">
    <header class="zoom-head">
      <div id="zoom-title" class="zoom-title"></div>
      <div class="zoom-controls">
        <div class="segmented" role="group" aria-label="Zoom preview theme">
          <button type="button" data-theme-toggle="light" aria-pressed="${theme === 'light'}">Light</button>
          <button type="button" data-theme-toggle="dark" aria-pressed="${theme === 'dark'}">Dark</button>
        </div>
        <div class="zoom-scale-group" aria-label="Zoom controls">
          <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
          <output id="zoom-scale">100%</output>
          <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" data-zoom="fit">Fit</button>
          <button type="button" data-zoom="actual">100%</button>
          <button type="button" data-zoom="close" aria-label="Close enlarged view">${icons.close}</button>
        </div>
      </div>
    </header>
    <div id="zoom-modes" class="zoom-modes" role="group" aria-label="Enlarged view mode"></div>
    <div id="zoom-panes" class="zoom-panes"></div>
  </dialog>
  <script id="embed-data" type="application/json">${safeJson(payload)}</script>
  ${styles.map((style, index) => `<template id="style-${index}"><style>${cssText(style)}</style></template>`).join('\n')}
  ${templates.join('\n')}
  <script>(${mountEmbed.toString()})();</script>
</body>
</html>`;
}

function mountEmbed() {
  const data = JSON.parse(document.getElementById('embed-data').textContent);
  const root = document.getElementById('embed-root');
  const themeButtons = [...document.querySelectorAll('[data-theme-toggle]')];
  const globalModeButtons = [...document.querySelectorAll('[data-global-mode]')];
  const zoom = document.getElementById('embed-zoom');
  const zoomTitle = document.getElementById('zoom-title');
  const zoomModes = document.getElementById('zoom-modes');
  const zoomPanes = document.getElementById('zoom-panes');
  const zoomScale = document.getElementById('zoom-scale');
  const expandSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4m0 8v4h-4m-8 0H4v-4"/></svg>';

  let currentTheme = data.theme === 'dark' ? 'dark' : 'light';
  let globalMode = 'split';
  const cardModes = new Map();
  const sheetCache = new Map();
  let activeZoom = null;
  let syncingScroll = false;

  if (data.motionAssets) {
    for (const img of document.querySelectorAll('[data-motion-image]')) {
      const src = data.motionAssets[img.dataset.motionImage];
      if (src) img.src = src;
    }
  }

  function setTheme(next) {
    currentTheme = next === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-preview-theme', currentTheme);
    zoom.setAttribute('data-preview-theme', currentTheme);
    for (const btn of themeButtons) btn.setAttribute('aria-pressed', String(btn.dataset.themeToggle === currentTheme));
    for (const spec of document.querySelectorAll('.specimen')) {
      const doc = spec.shadowRoot?.querySelector('.review-root');
      if (doc) doc.setAttribute('data-theme', currentTheme);
    }
  }

  for (const btn of themeButtons) {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeToggle));
  }

  const cardElements = [...document.querySelectorAll('[data-embed-card]')];
  if (!cardElements.length) return;

  function getSheet(styleIndex) {
    if (!sheetCache.has(styleIndex)) {
      const sheet = new CSSStyleSheet();
      const css = document.getElementById('style-' + styleIndex).content.firstElementChild.textContent;
      sheet.replaceSync('review-document,review-body{display:block}review-document{min-height:100%}' + css);
      sheetCache.set(styleIndex, sheet);
    }
    return sheetCache.get(styleIndex);
  }

  function createSpecimen(preview) {
    const host = document.createElement('div');
    host.className = 'specimen';
    const width = Math.ceil(preview.width), height = Math.ceil(preview.height);
    host.style.width = width + 'px';
    host.style.height = height + 'px';
    for (const [unit, value] of Object.entries({ vw: width, vh: height, vmin: Math.min(width, height), vmax: Math.max(width, height) })) {
      host.style.setProperty('--review-' + unit, value / 100 + 'px');
    }
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [getSheet(preview.style)];
    shadow.append(document.getElementById('frame-' + preview.template).content.cloneNode(true));
    const doc = shadow.querySelector('.review-root');
    if (doc) doc.setAttribute('data-theme', currentTheme);
    return host;
  }

  function createSliderStage(card) {
    const width = Math.ceil(Math.max(card.before?.width ?? 0, card.after?.width ?? 0));
    const height = Math.ceil(Math.max(card.before?.height ?? 0, card.after?.height ?? 0));
    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap';
    wrap.dataset.width = String(width);
    wrap.dataset.height = String(height);
    wrap.style.setProperty('--split', '50%');

    if (card.before) {
      const beforeLayer = document.createElement('div');
      beforeLayer.className = 'slider-layer';
      beforeLayer.dataset.side = 'before';
      beforeLayer.append(createSpecimen(card.before));
      wrap.append(beforeLayer);
    }
    if (card.after) {
      const afterLayer = document.createElement('div');
      afterLayer.className = 'slider-layer is-after';
      afterLayer.dataset.side = 'after';
      afterLayer.append(createSpecimen(card.after));
      wrap.append(afterLayer);
    }

    const divider = document.createElement('div');
    divider.className = 'slider-divider';
    divider.innerHTML = '<span class="slider-handle" aria-hidden="true">↔</span>';

    const labels = document.createElement('div');
    labels.className = 'slider-labels';
    labels.innerHTML = '<span class="slider-tag">Before</span><span class="slider-tag">After</span>';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = '50';
    range.className = 'slider-range';
    range.setAttribute('aria-label', 'Before and after split for ' + card.origin.frame);
    range.addEventListener('input', () => {
      wrap.style.setProperty('--split', range.value + '%');
    });
    range.addEventListener('click', event => event.stopPropagation());
    range.addEventListener('pointerdown', event => event.stopPropagation());

    wrap.append(divider, labels, range);
    return wrap;
  }

  function createPane(card, side, label) {
    const pane = document.createElement('figure');
    pane.className = 'stage-pane';
    pane.dataset.side = side;
    const cap = document.createElement('figcaption');
    cap.textContent = label;
    const well = document.createElement('div');
    well.className = 'stage-well';
    if (card[side]) {
      const preview = card[side];
      const plane = document.createElement('div');
      plane.className = 'plane';
      plane.dataset.width = String(Math.ceil(preview.width));
      plane.dataset.height = String(Math.ceil(preview.height));
      plane.append(createSpecimen(preview));
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'pane-trigger';
      trigger.dataset.enlarge = side;
      trigger.setAttribute('aria-label', 'Enlarge ' + side + ' for ' + card.origin.frame);
      trigger.innerHTML = expandSvg;
      well.append(plane, trigger);
    } else {
      const absent = document.createElement('span');
      absent.className = 'absent';
      absent.textContent = 'Absent at base';
      well.append(absent);
    }
    pane.append(cap, well);
    return pane;
  }

  function layoutCard(cardEl) {
    const host = cardEl.querySelector('[data-stage-host]');
    if (!host) return;
    for (const well of host.querySelectorAll('.stage-well')) {
      const target = well.querySelector('.plane, .slider-wrap');
      if (!target) continue;
      const width = Number(target.dataset.width), height = Number(target.dataset.height);
      const availW = Math.max(24, well.clientWidth - 16);
      const availH = Math.max(24, well.clientHeight - 16);
      if (!width || !height) continue;
      const scale = Math.min(1, availW / width, availH / height);
      target.style.width = Math.ceil(width * scale) + 'px';
      target.style.height = Math.ceil(height * scale) + 'px';
      target.style.setProperty('--preview-scale', String(scale));
    }
  }

  function renderCard(cardEl) {
    const index = Number(cardEl.dataset.embedCard);
    const card = data.cards[index];
    const changed = card.status === 'changed';
    const mode = changed ? (cardModes.get(index) ?? globalMode) : 'after';
    for (const btn of cardEl.querySelectorAll('[data-card-mode]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.cardMode === mode));
    }
    const host = cardEl.querySelector('[data-stage-host]');
    if (mode === 'slider') {
      const pane = document.createElement('figure');
      pane.className = 'stage-pane';
      pane.dataset.side = 'slider';
      const cap = document.createElement('figcaption');
      cap.textContent = 'Drag or use arrow keys to compare Before / After';
      const well = document.createElement('div');
      well.className = 'stage-well is-slider';
      well.append(createSliderStage(card));
      pane.append(cap, well);
      host.className = 'card-stage';
      host.replaceChildren(pane);
    } else {
      const panes = mode === 'split'
        ? [['Before', 'before'], ['After', 'after']]
        : [[mode[0].toUpperCase() + mode.slice(1), mode]];
      host.className = 'card-stage' + (panes.length === 2 ? ' is-split' : '');
      host.replaceChildren(...panes.map(([label, side]) => createPane(card, side, label)));
    }
    cardEl.dataset.mounted = 'true';
    requestAnimationFrame(() => layoutCard(cardEl));
  }

  function layoutZoom() {
    if (!zoom.open || !activeZoom) return;
    const targets = [...zoomPanes.querySelectorAll('.plane, .slider-wrap')];
    const stages = [...zoomPanes.querySelectorAll('.zoom-stage')];
    if (!targets.length || !stages.length) return;
    const maxW = Math.max(...targets.map(el => Number(el.dataset.width) || 1));
    const maxH = Math.max(...targets.map(el => Number(el.dataset.height) || 1));
    const fit = Math.max(0.05, Math.min(2, ...stages.flatMap(stage => [
      (stage.clientWidth - 24) / maxW,
      (stage.clientHeight - 24) / maxH,
    ])));
    const scale = activeZoom.scale ?? fit;
    activeZoom.shown = scale;
    zoomScale.value = Math.round(scale * 100) + '%';
    for (const target of targets) {
      const w = Number(target.dataset.width), h = Number(target.dataset.height);
      target.style.width = Math.ceil(w * scale) + 'px';
      target.style.height = Math.ceil(h * scale) + 'px';
      target.style.setProperty('--preview-scale', String(scale));
    }
  }

  function syncStageScroll(source) {
    if (syncingScroll) return;
    syncingScroll = true;
    const ratioX = source.scrollLeft;
    const ratioY = source.scrollTop;
    for (const other of zoomPanes.querySelectorAll('.zoom-stage')) {
      if (other === source) continue;
      other.scrollLeft = ratioX;
      other.scrollTop = ratioY;
    }
    syncingScroll = false;
  }

  function showZoomMode(mode) {
    activeZoom.mode = mode;
    activeZoom.scale = null;
    for (const btn of zoomModes.children) btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    const card = data.cards[activeZoom.index];
    if (mode === 'slider') {
      zoomPanes.style.setProperty('--zoom-panes', '1');
      const pane = document.createElement('figure');
      pane.className = 'zoom-pane';
      const cap = document.createElement('figcaption');
      cap.textContent = 'Before / After curtain';
      const stage = document.createElement('div');
      stage.className = 'zoom-stage';
      stage.tabIndex = 0;
      const surface = document.createElement('div');
      surface.className = 'zoom-surface';
      surface.append(createSliderStage(card));
      stage.append(surface);
      pane.append(cap, stage);
      zoomPanes.replaceChildren(pane);
    } else {
      const sides = mode === 'split' ? ['before', 'after'] : [mode];
      zoomPanes.style.setProperty('--zoom-panes', String(sides.length));
      zoomPanes.replaceChildren(...sides.map(side => {
        const pane = document.createElement('figure');
        pane.className = 'zoom-pane';
        pane.dataset.side = side;
        const cap = document.createElement('figcaption');
        cap.textContent = side[0].toUpperCase() + side.slice(1);
        const stage = document.createElement('div');
        stage.className = 'zoom-stage';
        stage.tabIndex = 0;
        const surface = document.createElement('div');
        surface.className = 'zoom-surface';
        if (card[side]) {
          const preview = card[side];
          const plane = document.createElement('div');
          plane.className = 'plane';
          plane.dataset.width = String(Math.ceil(preview.width));
          plane.dataset.height = String(Math.ceil(preview.height));
          plane.append(createSpecimen(preview));
          surface.append(plane);
        } else {
          const absent = document.createElement('span');
          absent.className = 'absent';
          absent.textContent = 'Absent at base';
          surface.append(absent);
        }
        stage.append(surface);
        if (sides.length === 2) stage.addEventListener('scroll', () => syncStageScroll(stage));
        pane.append(cap, stage);
        return pane;
      }));
    }
    requestAnimationFrame(layoutZoom);
  }

  function openZoom(index, requestedMode, triggerEl) {
    const card = data.cards[index];
    const changed = card.status === 'changed';
    const allowed = changed ? [['split', 'Split'], ['slider', 'Slider'], ['after', 'After'], ['before', 'Before']] : [['after', 'After']];
    const currentCardMode = changed ? (cardModes.get(index) ?? globalMode) : 'after';
    const initialMode = allowed.some(([m]) => m === requestedMode) ? requestedMode : currentCardMode;
    activeZoom = { index, mode: initialMode, scale: null, shown: 1, triggerEl };
    zoom.setAttribute('data-preview-theme', currentTheme);

    const crumb = [card.origin.layer, card.origin.title].filter(Boolean).join(' / ');
    zoomTitle.replaceChildren();
    if (crumb) {
      const span = document.createElement('span');
      span.className = 'origin-crumb';
      span.textContent = crumb;
      zoomTitle.append(span);
    }
    const name = document.createElement('strong');
    name.textContent = card.origin.frame;
    zoomTitle.append(name);

    zoomModes.replaceChildren(...allowed.map(([mode, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mode = mode;
      btn.textContent = label;
      btn.addEventListener('click', () => showZoomMode(mode));
      return btn;
    }));
    zoomModes.hidden = allowed.length === 1;

    root.classList.add('zoom-open');
    zoom.showModal();
    showZoomMode(initialMode);
    zoom.querySelector('[data-zoom="close"]').focus();
  }

  zoom.querySelector('.zoom-scale-group').addEventListener('click', event => {
    const btn = event.target.closest('[data-zoom]');
    if (!btn || !activeZoom) return;
    const action = btn.dataset.zoom;
    if (action === 'close') { zoom.close(); return; }
    if (action === 'fit') activeZoom.scale = null;
    if (action === 'actual') activeZoom.scale = 1;
    if (action === 'in') activeZoom.scale = Math.min(4, activeZoom.shown * 1.25);
    if (action === 'out') activeZoom.scale = Math.max(0.05, activeZoom.shown / 1.25);
    layoutZoom();
  });

  zoom.addEventListener('close', () => {
    root.classList.remove('zoom-open');
    zoomPanes.replaceChildren();
    activeZoom?.triggerEl?.focus();
    activeZoom = null;
  });

  for (const btn of globalModeButtons) {
    btn.addEventListener('click', () => {
      globalMode = btn.dataset.globalMode === 'slider' ? 'slider' : 'split';
      cardModes.clear();
      for (const b of globalModeButtons) b.setAttribute('aria-pressed', String(b.dataset.globalMode === globalMode));
      for (const el of cardElements) if (el.dataset.mounted) renderCard(el);
    });
  }

  for (const cardEl of cardElements) {
    cardEl.addEventListener('click', event => {
      const modeBtn = event.target.closest('[data-card-mode]');
      if (modeBtn) {
        const index = Number(cardEl.dataset.embedCard);
        cardModes.set(index, modeBtn.dataset.cardMode);
        renderCard(cardEl);
        return;
      }
      const enlargeBtn = event.target.closest('[data-enlarge]');
      if (enlargeBtn) {
        const index = Number(cardEl.dataset.embedCard);
        openZoom(index, enlargeBtn.dataset.enlarge, enlargeBtn);
      }
    });
  }

  const cardResize = new ResizeObserver(entries => {
    for (const entry of entries) layoutCard(entry.target);
  });
  const near = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (!entry.target.dataset.mounted) renderCard(entry.target);
      near.unobserve(entry.target);
    }
  }, { rootMargin: '320px 0px' });

  for (const [idx, cardEl] of cardElements.entries()) {
    cardResize.observe(cardEl);
    if (idx < 3) renderCard(cardEl);
    else near.observe(cardEl);
  }
  new ResizeObserver(layoutZoom).observe(zoomPanes);
  document.fonts.ready.then(() => {
    for (const el of cardElements) if (el.dataset.mounted) layoutCard(el);
    layoutZoom();
  });
}

const embedStyles = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:transparent}
  body{color:var(--foreground,#171d27);font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:13px;line-height:1.4;-webkit-font-smoothing:antialiased}
  button{font:inherit;color:inherit}
  #embed-root{display:grid;gap:8px;padding:4px 0;--max-well-h:172px}
  #embed-root.zoom-open{min-height:460px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px solid var(--card-border,#d8dde5)}
  .topbar-left{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
  .segmented{display:inline-flex;align-items:center;padding:2px;border-radius:7px;border:1px solid var(--card-border,#d8dde5);background:var(--card,#ffffff)}
  .segmented button{border:0;background:transparent;color:var(--muted-foreground,#596679);padding:3px 9px;border-radius:5px;font-size:12px;font-weight:500;cursor:pointer;line-height:1.3}
  .segmented button:hover{color:var(--foreground,#171d27)}
  .segmented button[aria-pressed="true"]{background:var(--primary,#2563eb);color:var(--primary-foreground,#ffffff)}
  .summary{font-size:12px;color:var(--muted-foreground,#596679);white-space:nowrap}
  .revisions{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--muted-foreground,#596679)}
  .revisions code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;color:var(--foreground,#171d27)}
  .failures{padding:8px 10px;border:1px solid var(--warning,#d97706);border-radius:8px;background:var(--card,#ffffff);font-size:12px}
  .failures strong{display:block;color:var(--warning,#d97706);font-weight:600}
  .failures ul{margin:4px 0 0;padding-left:16px}
  .cards{display:grid;gap:8px}
  .frame-card{border:1px solid var(--card-border,#d8dde5);border-radius:9px;background:var(--card,#ffffff);overflow:hidden;min-width:0}
  .card-head{display:flex;align-items:center;justify-content:space-between;gap:6px 10px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--card-border,#d8dde5);min-height:34px}
  .card-title{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap;font-size:12px}
  .badge{font-size:11px;font-weight:600;padding:1px 6px;border-radius:4px;border:1px solid var(--card-border,#d8dde5);color:var(--muted-foreground,#596679)}
  .badge[data-badge="added"],.badge[data-badge="proposed"]{color:var(--success,#16a34a);border-color:var(--success,#16a34a)}
  .badge[data-badge="direct"]{color:var(--primary,#2563eb);border-color:var(--primary,#2563eb)}
  .origin-crumb{color:var(--muted-foreground,#596679);white-space:nowrap}
  .origin-frame{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--foreground,#171d27);text-decoration:none;white-space:nowrap}
  a.origin-frame:hover{color:var(--primary,#2563eb);text-decoration:underline}
  .meta-tag{font-size:11px;padding:0 5px;border-radius:4px;border:1px solid var(--card-border,#d8dde5);color:var(--muted-foreground,#596679)}
  .meta-dim{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;color:var(--muted-foreground,#596679)}
  .card-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto}
  .card-modes{display:inline-flex;align-items:center;gap:2px}
  .mode-btn,.enlarge-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--card-border,#d8dde5);background:transparent;color:var(--muted-foreground,#596679);padding:2px 7px;border-radius:5px;font-size:12px;cursor:pointer;line-height:1.3;white-space:nowrap}
  .mode-btn:hover,.enlarge-btn:hover{color:var(--foreground,#171d27);border-color:var(--muted-foreground,#596679)}
  .mode-btn[aria-pressed="true"]{background:var(--primary,#2563eb);border-color:var(--primary,#2563eb);color:var(--primary-foreground,#ffffff)}
  .card-stage{padding:8px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
  .card-stage.is-split{grid-template-columns:repeat(2,minmax(0,1fr))}
  .stage-pane{margin:0;min-width:0;display:flex;flex-direction:column;gap:4px}
  .stage-pane figcaption{font-size:11px;font-weight:600;color:var(--muted-foreground,#596679);line-height:1.2}
  .stage-well{position:relative;height:min(var(--max-well-h),max(76px,calc(var(--frame-h,120px) + 20px)));border:1px solid var(--card-border,#d8dde5);border-radius:6px;display:grid;place-items:center;overflow:hidden;transition:background-color 150ms ease}
  .stage-well.is-slider{height:min(calc(var(--max-well-h) + 24px),max(84px,calc(var(--frame-h,120px) + 24px)))}
  [data-preview-theme="light"] .stage-well,[data-preview-theme="light"] .zoom-stage{background:#edf0f4;color:#171d27}
  [data-preview-theme="dark"] .stage-well,[data-preview-theme="dark"] .zoom-stage{background:#101319;color:#eff3f9}
  .pane-trigger{position:absolute;inset:0;border:0;background:transparent;cursor:zoom-in;padding:0}
  .pane-trigger svg{position:absolute;top:6px;right:6px;box-sizing:content-box;padding:4px;border-radius:5px;border:1px solid var(--card-border,#d8dde5);background:var(--card,#ffffff);color:var(--foreground,#171d27);opacity:0;transition:opacity 120ms ease}
  .pane-trigger:hover svg,.pane-trigger:focus-visible svg{opacity:1}
  .plane{position:relative;flex:none}
  .specimen{position:absolute;inset:0 auto auto 0;overflow:hidden;transform:scale(var(--preview-scale,1));transform-origin:top left;font:16px/normal "Times New Roman",serif;color:initial}
  .absent{font-size:12px;color:var(--muted-foreground,#596679)}
  .card-note{padding:6px 10px;border-top:1px solid var(--card-border,#d8dde5);font-size:12px;color:var(--muted-foreground,#596679)}
  .slider-wrap{position:relative;flex:none;overflow:hidden;border-radius:4px;user-select:none}
  .slider-layer{position:absolute;inset:0;overflow:hidden}
  .slider-layer.is-after{clip-path:inset(0 0 0 var(--split,50%))}
  .slider-divider{position:absolute;top:0;bottom:0;left:var(--split,50%);width:2px;background:var(--primary,#2563eb);transform:translateX(-1px);pointer-events:none;z-index:3}
  .slider-handle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:999px;background:var(--primary,#2563eb);color:var(--primary-foreground,#ffffff);font-size:11px;font-weight:700;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,0.3)}
  .slider-labels{position:absolute;inset:6px 6px auto 6px;display:flex;justify-content:space-between;pointer-events:none;z-index:3}
  .slider-tag{font-size:10px;font-weight:600;padding:1px 5px;border-radius:4px;background:rgba(15,23,42,0.68);color:#ffffff}
  .slider-range{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:ew-resize;z-index:4}
  .motion-wrap{padding:8px 10px;display:grid;gap:8px}
  .motion-head{font-size:12px;font-weight:600;color:var(--foreground,#171d27);margin-bottom:4px}
  .motion-strip{display:flex;gap:6px;overflow-x:auto}
  .motion-strip figure{margin:0;flex:none}
  .motion-strip img{height:76px;width:auto;display:block;border:1px solid var(--card-border,#d8dde5);border-radius:4px}
  .motion-strip figcaption{font-size:11px;color:var(--muted-foreground,#596679);text-align:center}
  .empty{padding:10px 12px;border:1px solid var(--card-border,#d8dde5);border-radius:8px;background:var(--card,#ffffff);font-size:12px;color:var(--muted-foreground,#596679)}
  #embed-zoom{padding:0;margin:auto;color:var(--foreground,#171d27);background:var(--card,#ffffff);border:1px solid var(--card-border,#d8dde5);border-radius:11px;width:min(1400px,calc(100% - 20px));height:calc(100% - 20px);max-width:none;max-height:none;overflow:hidden}
  #embed-zoom[open]{display:flex;flex-direction:column}
  #embed-zoom::backdrop{background:rgba(5,8,13,0.72)}
  .zoom-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--card-border,#d8dde5)}
  .zoom-title{display:flex;align-items:center;gap:6px;min-width:0;font-size:13px}
  .zoom-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .zoom-scale-group{display:inline-flex;align-items:center;gap:4px}
  .zoom-scale-group button,.zoom-modes button{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--card-border,#d8dde5);background:transparent;color:var(--foreground,#171d27);border-radius:5px;padding:3px 8px;font-size:12px;cursor:pointer;min-height:26px}
  .zoom-scale-group button:hover,.zoom-modes button:hover{border-color:var(--muted-foreground,#596679)}
  .zoom-modes button[aria-pressed="true"]{background:var(--primary,#2563eb);border-color:var(--primary,#2563eb);color:var(--primary-foreground,#ffffff)}
  #zoom-scale{min-width:40px;text-align:center;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px;color:var(--muted-foreground,#596679)}
  .zoom-modes{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:8px 12px 0}
  .zoom-modes[hidden]{display:none}
  .zoom-panes{flex:1;min-height:0;display:grid;grid-template-columns:repeat(var(--zoom-panes,1),minmax(0,1fr));gap:10px;padding:10px 12px 12px}
  .zoom-pane{margin:0;min-width:0;min-height:0;display:flex;flex-direction:column;gap:5px}
  .zoom-pane figcaption{font-size:11px;font-weight:600;color:var(--muted-foreground,#596679)}
  .zoom-stage{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;border:1px solid var(--card-border,#d8dde5);border-radius:7px}
  .zoom-surface{width:max-content;height:max-content;min-width:100%;min-height:100%;padding:12px;display:grid;place-items:center}
  @media(min-width:900px){#embed-root{max-width:1480px;margin-inline:auto;padding:14px 20px;gap:14px;--max-well-h:280px}.cards{gap:14px}}
  @media(max-width:540px){.card-stage.is-split,.zoom-panes{grid-template-columns:minmax(0,1fr)}}
`;
