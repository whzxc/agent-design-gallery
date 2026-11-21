const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const short = revision => revision?.slice(0, 8) ?? 'Working';
const cssText = value => value.replace(/<\/style/gi, '<\\/style');
const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');

function summaryLine(counts, omitted) {
  const parts = [];
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.moved) parts.push(`${counts.moved} moved`);
  if (omitted) parts.push(`${omitted} more in full HTML`);
  return parts.join(' · ') || 'No changes';
}

function buildItems(cards, motion) {
  const frameCounts = new Map();
  for (const card of cards) {
    const name = card.origin?.frame ?? card.frame;
    frameCounts.set(name, (frameCounts.get(name) ?? 0) + 1);
  }
  const items = cards.map((card, index) => {
    const frameName = card.origin?.frame ?? card.frame;
    const duplicate = (frameCounts.get(frameName) ?? 0) > 1;
    const label = duplicate && card.origin?.title ? `${card.origin.title} · ${frameName}` : frameName;
    const badge = card.proposed ? 'Proposed'
      : card.status === 'added' ? 'Added'
      : card.change?.kind === 'inherited' ? 'Inherited' : 'Direct';
    return { kind: 'frame', cardIndex: index, label, badge, status: card.status };
  });
  for (const [motionIndex, edgeCard] of (motion?.cards ?? []).entries()) {
    const label = edgeCard.after?.edge.label ?? edgeCard.before?.edge.label ?? edgeCard.id;
    items.push({ kind: 'motion', motionIndex, label, badge: 'Motion', status: edgeCard.kind });
  }
  return items;
}

export function reviewEmbedDocument(report, { properties, styles, templates }) {
  const { title, theme, base, head, cards, counts, omitted = 0, failures, motion } = report;
  const items = buildItems(cards, motion);
  const payload = {
    theme,
    counts,
    omitted,
    items,
    cards: cards.map(card => ({
      index: card.index,
      source: card.source,
      frame: card.frame,
      status: card.status,
      change: card.change ?? null,
      proposed: card.proposed ?? null,
      note: card.note ?? null,
      origin: card.origin,
      previousOrigin: card.previousOrigin ?? null,
      before: card.before,
      after: card.after,
      hasDifference: Boolean(card.difference),
      differentPixels: card.differentPixels ?? null,
    })),
    motion: motion ? {
      cards: motion.cards.map(card => ({
        id: card.id,
        kind: card.kind,
        reasons: card.reasons,
        before: card.before ? {
          error: card.before.error ?? null,
          duration: card.before.duration ?? 0,
          edge: {
            label: card.before.edge?.label ?? null,
            duration: card.before.edge?.duration ?? null,
            gesture: card.before.edge?.gesture ?? card.before.edge?.trigger?.on ?? null,
            from: card.before.edge?.from ?? null,
            to: card.before.edge?.to ?? null,
          },
          samples: card.before.samples ?? [],
        } : null,
        after: card.after ? {
          error: card.after.error ?? null,
          duration: card.after.duration ?? 0,
          edge: {
            label: card.after.edge?.label ?? null,
            duration: card.after.edge?.duration ?? null,
            gesture: card.after.edge?.gesture ?? card.after.edge?.trigger?.on ?? null,
            from: card.after.edge?.from ?? null,
            to: card.after.edge?.to ?? null,
          },
          samples: card.after.samples ?? [],
        } : null,
      })),
      assets: motion.assets,
    } : null,
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
    ${items.length ? `<div class="tablist" role="tablist" aria-label="Review frames">${items.map((item, idx) =>
      `<button type="button" role="tab" id="tab-${idx}" data-tab="${idx}" aria-selected="${idx === 0}" tabindex="${idx === 0 ? '0' : '-1'}"><span class="badge" data-badge="${escape(item.badge.toLowerCase())}">${escape(item.badge)}</span><span class="tab-label">${escape(item.label)}</span></button>`).join('')}</div>
    <section id="stage-card" class="stage-card" role="tabpanel" aria-labelledby="tab-0">
      <header class="stage-head">
        <div id="stage-origin" class="stage-origin"></div>
        <div id="stage-controls" class="stage-controls"></div>
      </header>
      <div id="stage-body" class="stage-body"></div>
    </section>
    <footer class="foot">
      <div class="foot-left">
        <span class="dot" aria-hidden="true"></span>
        <span id="foot-summary" class="foot-summary"></span>
      </div>
      <span id="foot-index" class="foot-index"></span>
    </footer>` : `<div class="empty">No changed frames.</div>`}
  </div>
  <script id="embed-data" type="application/json">${safeJson(payload)}</script>
  ${styles.map((style, index) => `<template id="style-${index}"><style>${cssText(style)}</style></template>`).join('\n')}
  ${templates.join('\n')}
  ${cards.filter(card => card.difference).map(card => `<template id="difference-${card.index}"><img src="${escape(card.difference)}" alt="Changed pixels in ${escape(card.frame)}"></template>`).join('\n')}
  <script>(${mountEmbed.toString()})();</script>
</body>
</html>`;
}

function mountEmbed() {
  const data = JSON.parse(document.getElementById('embed-data').textContent);
  const root = document.getElementById('embed-root');
  const themeButtons = [...document.querySelectorAll('[data-theme-toggle]')];
  let currentTheme = data.theme === 'dark' ? 'dark' : 'light';

  if (!data.items.length) {
    for (const btn of themeButtons) {
      btn.addEventListener('click', () => {
        currentTheme = btn.dataset.themeToggle === 'dark' ? 'dark' : 'light';
        root.setAttribute('data-preview-theme', currentTheme);
        for (const item of themeButtons) item.setAttribute('aria-pressed', String(item.dataset.themeToggle === currentTheme));
      });
    }
    return;
  }

  const sheetCache = new Map();
  const tabButtons = [...document.querySelectorAll('[data-tab]')];
  const stageCard = document.getElementById('stage-card');
  const stageOrigin = document.getElementById('stage-origin');
  const stageControls = document.getElementById('stage-controls');
  const stageBody = document.getElementById('stage-body');
  const footSummary = document.getElementById('foot-summary');
  const footIndex = document.getElementById('foot-index');

  let activeIndex = 0;
  let activeMode = 'split';

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

  function layoutPlanes() {
    for (const slot of stageBody.querySelectorAll('.stage-well')) {
      const plane = slot.querySelector('.plane');
      if (!plane) continue;
      const width = Number(plane.dataset.width), height = Number(plane.dataset.height);
      const availW = Math.max(24, slot.clientWidth - 16);
      const availH = Math.max(24, slot.clientHeight - 16);
      if (!width || !height) continue;
      const scale = Math.min(1, availW / width, availH / height);
      plane.style.width = Math.ceil(width * scale) + 'px';
      plane.style.height = Math.ceil(height * scale) + 'px';
      plane.style.setProperty('--preview-scale', String(scale));
    }
  }

  function buildOrigin(origin, card) {
    stageOrigin.replaceChildren();
    const crumbText = [origin.layer, origin.title].filter(Boolean).join(' / ');
    if (crumbText) {
      const crumb = document.createElement('span');
      crumb.className = 'origin-crumb';
      crumb.textContent = crumbText;
      stageOrigin.append(crumb);
    }
    const titleEl = origin.href ? document.createElement('a') : document.createElement('span');
    titleEl.className = 'origin-frame';
    titleEl.textContent = origin.frame;
    if (origin.href) {
      titleEl.href = origin.href;
      titleEl.target = '_blank';
      titleEl.rel = 'noopener';
      titleEl.title = 'Open in ADG';
    }
    stageOrigin.append(titleEl);
    if (card.proposed) {
      const tag = document.createElement('span');
      tag.className = 'meta-tag';
      tag.textContent = 'Proposed: ' + card.proposed;
      stageOrigin.append(tag);
    }
    const size = card.after ? (card.before && (Math.round(card.before.width) !== Math.round(card.after.width) || Math.round(card.before.height) !== Math.round(card.after.height))
      ? `${Math.round(card.before.width)}×${Math.round(card.before.height)} → ${Math.round(card.after.width)}×${Math.round(card.after.height)}`
      : `${Math.round(card.after.width)}×${Math.round(card.after.height)}`) : '';
    if (size) {
      const dim = document.createElement('span');
      dim.className = 'meta-dim';
      dim.textContent = size;
      stageOrigin.append(dim);
    }
  }

  function renderPane(title, card, side) {
    const pane = document.createElement('figure');
    pane.className = 'stage-pane';
    pane.dataset.side = side;
    const cap = document.createElement('figcaption');
    cap.textContent = title;
    const well = document.createElement('div');
    well.className = 'stage-well';
    if (side === 'difference') {
      const width = Math.ceil(Math.max(card.before?.width ?? 0, card.after?.width ?? 0));
      const height = Math.ceil(Math.max(card.before?.height ?? 0, card.after?.height ?? 0));
      const plane = document.createElement('div');
      plane.className = 'plane';
      plane.dataset.width = String(width);
      plane.dataset.height = String(height);
      plane.append(document.getElementById('difference-' + card.index).content.cloneNode(true));
      well.append(plane);
    } else if (card[side]) {
      const preview = card[side];
      const plane = document.createElement('div');
      plane.className = 'plane';
      plane.dataset.width = String(Math.ceil(preview.width));
      plane.dataset.height = String(Math.ceil(preview.height));
      plane.append(createSpecimen(preview));
      well.append(plane);
    } else {
      const absent = document.createElement('span');
      absent.className = 'absent';
      absent.textContent = 'Absent at base';
      well.append(absent);
    }
    pane.append(cap, well);
    return pane;
  }

  function renderFrameCard(card) {
    buildOrigin(card.origin, card);
    const changed = card.status === 'changed';
    const modes = changed
      ? [['split', 'Split'], ['after', 'After'], ['before', 'Before'], ...(card.hasDifference ? [['difference', currentTheme === data.theme ? 'Diff' : `Diff (${data.theme})`]] : [])]
      : [['after', 'After']];
    if (!modes.some(([m]) => m === activeMode)) activeMode = modes[0][0];

    stageControls.replaceChildren(...modes.map(([mode, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn';
      btn.textContent = label;
      btn.setAttribute('aria-pressed', String(mode === activeMode));
      btn.addEventListener('click', () => {
        activeMode = mode;
        renderActive();
      });
      return btn;
    }));

    const panes = activeMode === 'split' ? [['Before', 'before'], ['After', 'after']]
      : [[activeMode === 'difference' ? (currentTheme === data.theme ? 'Difference' : `Difference (${data.theme} capture)`) : activeMode[0].toUpperCase() + activeMode.slice(1), activeMode]];
    stageBody.className = 'stage-body' + (panes.length === 2 ? ' is-split' : '');
    stageBody.replaceChildren(...panes.map(([label, side]) => renderPane(label, card, side)));

    const details = [];
    if (card.note) details.push(card.note);
    if (card.status === 'added') details.push(card.proposed ? `Proposed (${card.proposed})` : 'Added frame');
    else if (card.change?.kind === 'inherited') details.push('Inherited · ' + (card.change.causes.join(', ') || 'shared input'));
    else details.push('Direct change');
    if (card.differentPixels) details.push(`${card.differentPixels.toLocaleString('en-US')} px changed`);
    if (data.counts.removed || data.counts.moved) {
      const extra = [];
      if (data.counts.removed) extra.push(`${data.counts.removed} removed`);
      if (data.counts.moved) extra.push(`${data.counts.moved} moved`);
      details.push(extra.join(', '));
    }
    footSummary.textContent = details.join(' · ');
    requestAnimationFrame(layoutPlanes);
  }

  function renderMotionCard(motionCard) {
    stageOrigin.replaceChildren();
    const crumb = document.createElement('span');
    crumb.className = 'origin-crumb';
    crumb.textContent = 'Transition';
    const titleEl = document.createElement('span');
    titleEl.className = 'origin-frame';
    titleEl.textContent = motionCard.after?.edge.label ?? motionCard.before?.edge.label ?? motionCard.id;
    const tag = document.createElement('span');
    tag.className = 'meta-tag';
    tag.textContent = motionCard.kind;
    stageOrigin.append(crumb, titleEl, tag);
    stageControls.replaceChildren();

    const wrap = document.createElement('div');
    wrap.className = 'motion-wrap';
    for (const [sideName, label] of [['before', 'Before'], ['after', 'After']]) {
      const side = motionCard[sideName];
      if (!side) continue;
      const row = document.createElement('div');
      row.className = 'motion-side';
      const head = document.createElement('div');
      head.className = 'motion-head';
      head.textContent = side.error
        ? `${label} · ${side.error}`
        : `${label} · ${side.edge.gesture ?? ''} · ${side.duration} ms`;
      row.append(head);
      if (!side.error && side.samples.length) {
        const strip = document.createElement('div');
        strip.className = 'motion-strip';
        for (const s of side.samples) {
          const fig = document.createElement('figure');
          const img = document.createElement('img');
          img.src = data.motion.assets[s.image];
          img.alt = `${label} at ${s.ms} ms`;
          const cap = document.createElement('figcaption');
          cap.textContent = `${s.state ? s.state + ' ' : ''}${s.ms} ms`;
          fig.append(img, cap);
          strip.append(fig);
        }
        row.append(strip);
      }
      wrap.append(row);
    }
    stageBody.className = 'stage-body is-motion';
    stageBody.replaceChildren(wrap);
    footSummary.textContent = `${motionCard.id} · ${motionCard.reasons.join(' · ')}`;
  }

  function renderActive() {
    const item = data.items[activeIndex];
    for (const [idx, btn] of tabButtons.entries()) {
      const selected = idx === activeIndex;
      btn.setAttribute('aria-selected', String(selected));
      btn.setAttribute('tabindex', selected ? '0' : '-1');
    }
    stageCard.setAttribute('aria-labelledby', 'tab-' + activeIndex);
    footIndex.textContent = `${activeIndex + 1} / ${data.items.length}`;
    if (item.kind === 'motion') renderMotionCard(data.motion.cards[item.motionIndex]);
    else renderFrameCard(data.cards[item.cardIndex]);
  }

  function setTheme(next) {
    currentTheme = next === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-preview-theme', currentTheme);
    for (const btn of themeButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeToggle === currentTheme));
    }
    for (const spec of stageBody.querySelectorAll('.specimen')) {
      const doc = spec.shadowRoot?.querySelector('.review-root');
      if (doc) doc.setAttribute('data-theme', currentTheme);
    }
    if (data.items[activeIndex]?.kind === 'frame') {
      const card = data.cards[data.items[activeIndex].cardIndex];
      if (card.status === 'changed' && card.hasDifference) {
        const diffBtn = stageControls.querySelectorAll('.mode-btn')[3];
        if (diffBtn) diffBtn.textContent = currentTheme === data.theme ? 'Diff' : `Diff (${data.theme})`;
        if (activeMode === 'difference') {
          const cap = stageBody.querySelector('.stage-pane figcaption');
          if (cap) cap.textContent = currentTheme === data.theme ? 'Difference' : `Difference (${data.theme} capture)`;
        }
      }
    }
  }

  for (const btn of themeButtons) {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeToggle));
  }
  for (const [idx, btn] of tabButtons.entries()) {
    btn.addEventListener('click', () => {
      activeIndex = idx;
      activeMode = 'split';
      renderActive();
    });
    btn.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') activeIndex = 0;
      else if (event.key === 'End') activeIndex = tabButtons.length - 1;
      else activeIndex = (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
      activeMode = 'split';
      tabButtons[activeIndex].focus();
      tabButtons[activeIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      renderActive();
    });
  }

  new ResizeObserver(layoutPlanes).observe(stageBody);
  document.fonts.ready.then(layoutPlanes);
  renderActive();
}

const embedStyles = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:transparent}
  body{color:var(--foreground,#171d27);font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:13px;line-height:1.4;-webkit-font-smoothing:antialiased}
  button{font:inherit;color:inherit}
  #embed-root{display:grid;gap:8px;padding:4px 0}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px solid var(--card-border,#d8dde5)}
  .topbar-left{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
  .segmented{display:inline-flex;align-items:center;padding:2px;border-radius:7px;border:1px solid var(--card-border,#d8dde5);background:var(--card,#ffffff)}
  .segmented button{border:0;background:transparent;color:var(--muted-foreground,#596679);padding:3px 9px;border-radius:5px;font-size:12px;font-weight:500;cursor:pointer;line-height:1.3}
  .segmented button:hover{color:var(--foreground,#171d27)}
  .segmented button[aria-pressed="true"]{background:var(--primary,#2563eb);color:var(--primary-foreground,#ffffff)}
  .summary{font-size:12px;color:var(--muted-foreground,#596679);white-space:nowrap}
  .revisions{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--muted-foreground,#596679)}
  .revisions code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;color:var(--foreground,#171d27)}
  .failures{padding:8px 10px;border:1px solid var(--warning,#d97706);border-radius:8px;background:var(--card,#ffffff);font-size:12px;max-height:76px;overflow:auto}
  .failures strong{display:block;color:var(--warning,#d97706);font-weight:600}
  .failures ul{margin:4px 0 0;padding-left:16px}
  .tablist{display:flex;align-items:center;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}
  .tablist button{flex:none;display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:7px;border:1px solid var(--card-border,#d8dde5);background:var(--card,#ffffff);cursor:pointer;font-size:12px;color:var(--foreground,#171d27)}
  .tablist button:hover{border-color:var(--muted-foreground,#596679)}
  .tablist button[aria-selected="true"]{border-color:var(--primary,#2563eb);box-shadow:inset 0 0 0 1px var(--primary,#2563eb)}
  .badge{font-size:11px;font-weight:600;padding:1px 5px;border-radius:4px;border:1px solid var(--card-border,#d8dde5);color:var(--muted-foreground,#596679)}
  .badge[data-badge="added"],.badge[data-badge="proposed"]{color:var(--success,#16a34a);border-color:var(--success,#16a34a)}
  .badge[data-badge="direct"]{color:var(--primary,#2563eb);border-color:var(--primary,#2563eb)}
  .tab-label{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .stage-card{border:1px solid var(--card-border,#d8dde5);border-radius:9px;background:var(--card,#ffffff);overflow:hidden}
  .stage-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-bottom:1px solid var(--card-border,#d8dde5);min-height:34px}
  .stage-origin{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap;font-size:12px}
  .origin-crumb{color:var(--muted-foreground,#596679);white-space:nowrap}
  .origin-frame{font-weight:600;color:var(--foreground,#171d27);text-decoration:none;white-space:nowrap}
  a.origin-frame:hover{color:var(--primary,#2563eb);text-decoration:underline}
  .meta-tag{font-size:11px;padding:0 5px;border-radius:4px;border:1px solid var(--card-border,#d8dde5);color:var(--muted-foreground,#596679)}
  .meta-dim{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;color:var(--muted-foreground,#596679)}
  .stage-controls{display:inline-flex;align-items:center;gap:4px;flex:none}
  .mode-btn{border:1px solid var(--card-border,#d8dde5);background:transparent;color:var(--muted-foreground,#596679);padding:2px 8px;border-radius:5px;font-size:12px;cursor:pointer}
  .mode-btn:hover{color:var(--foreground,#171d27)}
  .mode-btn[aria-pressed="true"]{background:var(--primary,#2563eb);border-color:var(--primary,#2563eb);color:var(--primary-foreground,#ffffff)}
  .stage-body{padding:8px;height:196px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
  .stage-body.is-split{grid-template-columns:repeat(2,minmax(0,1fr))}
  .stage-body.is-motion{overflow:auto;display:block}
  .stage-pane{margin:0;min-width:0;min-height:0;display:flex;flex-direction:column;gap:4px}
  .stage-pane figcaption{font-size:11px;font-weight:600;color:var(--muted-foreground,#596679);line-height:1.2}
  .stage-well{flex:1;min-height:0;border:1px solid var(--card-border,#d8dde5);border-radius:6px;display:grid;place-items:center;overflow:hidden;position:relative;transition:background-color 150ms ease}
  [data-preview-theme="light"] .stage-well{background:#edf0f4;color:#171d27}
  [data-preview-theme="dark"] .stage-well{background:#101319;color:#eff3f9}
  .plane{position:relative;flex:none}
  .plane>img{display:block;width:100%;height:100%;object-fit:contain;object-position:top left}
  .specimen{position:absolute;inset:0 auto auto 0;overflow:hidden;transform:scale(var(--preview-scale,1));transform-origin:top left;font:16px/normal "Times New Roman",serif;color:initial}
  .absent{font-size:12px;color:var(--muted-foreground,#596679)}
  .motion-wrap{display:grid;gap:8px}
  .motion-head{font-size:12px;font-weight:600;color:var(--foreground,#171d27);margin-bottom:4px}
  .motion-strip{display:flex;gap:6px;overflow-x:auto}
  .motion-strip figure{margin:0;flex:none}
  .motion-strip img{height:68px;width:auto;display:block;border:1px solid var(--card-border,#d8dde5);border-radius:4px}
  .motion-strip figcaption{font-size:11px;color:var(--muted-foreground,#596679);text-align:center}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:2px;font-size:12px;color:var(--muted-foreground,#596679)}
  .foot-left{display:flex;align-items:center;gap:6px;min-width:0}
  .dot{width:7px;height:7px;border-radius:999px;background:var(--primary,#2563eb);flex:none}
  .foot-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground,#171d27)}
  .foot-index{flex:none;font-family:ui-monospace,"SF Mono",Menlo,monospace}
  .empty{padding:10px 12px;border:1px solid var(--card-border,#d8dde5);border-radius:8px;background:var(--card,#ffffff);font-size:12px;color:var(--muted-foreground,#596679)}
`;
