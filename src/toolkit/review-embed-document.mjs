import { readFileSync } from 'node:fs';
import { escape } from './html.mjs';
import { Icon } from './runtime.mjs';
import { renderCaptureExemptions } from './capture-exemptions.mjs';

const stylesForEmbed = readFileSync(new URL('./review-embed.css', import.meta.url), 'utf8');
const cssText = value => value.replace(/<\/style/gi, '<\\/style');
const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const short = revision => revision?.slice(0, 8) ?? 'Working';

function iconButton(icon, label, attribute, { pressed, codex = false, hidden = false } = {}) {
  const tooltip = codex ? 'data-tooltip' : 'title';
  return `<button type="button" ${attribute} aria-label="${escape(label)}" ${tooltip}="${escape(label)}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}${hidden ? ' hidden' : ''}>${Icon({ name: icon, size: 15 })}</button>`;
}

function viewOptions(theme, changed, codex) {
  const toggle = (icon, label, value, pressed) => iconButton(icon, label, `data-choice="${value}"`, { pressed, codex });
  return `<div class="icon-group" role="group" aria-label="Preview theme">
    ${toggle('sun', 'Light', 'light', theme === 'light')}${toggle('moon', 'Dark', 'dark', theme === 'dark')}
  </div>
  ${changed ? `<div class="icon-group" data-compare-options role="group" aria-label="Comparison mode">
    ${toggle('columns-2', 'Split view', 'split', false)}${toggle('arrow-left-right', 'Slider view', 'slider', true)}
  </div>` : ''}`;
}

function summaryLine(report) {
  const { counts, omitted, omittedMotion } = report;
  const parts = ['added', 'changed', 'removed', 'moved'].filter(kind => counts[kind]).map(kind => `${counts[kind]} ${kind}`);
  if (omitted) parts.push(`${omitted} more in full HTML`);
  if (omittedMotion) parts.push(`${omittedMotion} motion changes in full HTML`);
  return parts.join(' · ') || 'No changes';
}

function cardHtml(card, index, codex) {
  const { origin } = card;
  const badge = card.proposed ? 'Proposed' : card.status === 'added' ? 'Added' : card.change?.kind === 'inherited' ? 'Inherited' : '';
  const title = escape(origin.frame);
  return `<article class="frame-card" data-embed-card="${index}" aria-labelledby="embed-frame-${index}">
    <header class="card-head">
      <h2 id="embed-frame-${index}">${origin.href
        ? `<a href="${escape(origin.href)}" target="_blank" rel="noopener">${title}</a>` : title}</h2>
      ${badge ? `<span class="badge">${badge}</span>` : ''}
      <div class="card-actions">
        ${iconButton('maximize-2', 'Enlarge ' + origin.frame, 'data-enlarge', { codex })}
        ${codex ? iconButton('message-square-plus', 'Use this frame in Codex', 'data-handoff', { codex, hidden: true }) : ''}
      </div>
    </header>
    <div class="comparison-slot" data-stage-host></div>
    ${card.note ? `<div class="card-note">${escape(card.note)}</div>` : ''}
  </article>`;
}

function motionCardHtml(card) {
  const label = card.after?.edge.label ?? card.before?.edge.label ?? card.id;
  const sideHtml = (side, name) => side ? `<section class="motion-side">
    <div>${name} · ${side.error ? escape(side.error) : `${escape(side.edge?.gesture ?? side.edge?.trigger?.on ?? '')} · ${side.duration} ms`}</div>
    ${side.error || !side.samples?.length ? '' : `<div class="motion-strip">${side.samples.map(sample => `<figure>
      <img data-motion-image="${escape(sample.image)}" alt="${name} at ${sample.ms} ms">
      <figcaption>${sample.state ? escape(sample.state) + ' ' : ''}${sample.ms} ms</figcaption>
    </figure>`).join('')}</div>`}
  </section>` : '';
  return `<article class="frame-card motion-card">
    <header class="card-head"><h2>${escape(label)}</h2><span class="badge">Motion · ${escape(card.kind)}</span></header>
    <div class="motion-wrap">${sideHtml(card.before, 'Before')}${sideHtml(card.after, 'After')}</div>
    ${card.reasons.length ? `<div class="card-note">${escape(card.reasons.join(' · '))}</div>` : ''}
  </article>`;
}

export function reviewEmbedDocument(report, { properties, styles, templates }, target = 'antigravity') {
  const { title, theme, base, head, cards, failures, motion } = report;
  const codex = target === 'codex';
  const changed = cards.some(card => card.before);
  const payload = {
    title, base, head,
    cards: cards.map(({ source, frame, origin, before, after, proposed }) => ({ source, frame, origin, before, after, proposed })),
    motionAssets: motion?.assets ?? null,
  };
  const zoomButton = (icon, label, action) => iconButton(icon, label, `data-zoom="${action}"`, { codex });
  const fragment = `<style>${cssText(properties.join('\n'))}\n${stylesForEmbed}</style>
<div id="embed-root" data-preview-theme="${escape(theme)}" data-comparison-mode="slider">
  <header class="review-toolbar" data-review-options>
    ${viewOptions(theme, changed, codex)}
    <span class="summary">${escape(summaryLine(report))}</span>
    <span class="revisions"><code>${escape(short(base))}</code> → <code>${escape(!head || head === base ? 'Working' : short(head))}</code></span>
  </header>
  ${failures.length ? `<section class="failures" role="alert"><strong>Some sources could not be built</strong><ul>${failures.map(f =>
    `<li><code>${escape(f.source)}</code> (${escape(f.side)}): ${escape(f.message)}</li>`).join('')}</ul></section>` : ''}
  ${cards.length || motion?.cards.length ? `<div class="cards">${cards.map((card, index) => cardHtml(card, index, codex)).join('')}${(motion?.cards ?? []).map(motionCardHtml).join('')}</div>`
    : `<div class="empty">${report.omitted || report.omittedMotion ? 'Open the full HTML review for previews.' : 'No changed frames.'}</div>`}
  ${renderCaptureExemptions(report.captureExemptions)}
  <p data-handoff-status role="status" hidden></p>
  <dialog id="embed-zoom" aria-labelledby="embed-zoom-title">
    <header class="zoom-heading">
      <div><strong id="embed-zoom-title"></strong><small data-zoom-info></small></div>
      ${zoomButton('x', 'Close enlarged view', 'close')}
    </header>
    <div class="zoom-toolbar" data-review-options>
      ${viewOptions(theme, changed, codex)}
      <div class="icon-group zoom-group" role="group" aria-label="Zoom">
        ${zoomButton('minus', 'Zoom out', 'out')}
        <output data-zoom-scale aria-label="Zoom level">Fit</output>
        ${zoomButton('plus', 'Zoom in', 'in')}
        ${zoomButton('scan', 'Fit to width', 'fit')}
      </div>
    </div>
    <div class="zoom-content" data-zoom-content></div>
  </dialog>
  <template id="embed-comparison">
    <div class="comparison">
      <div class="comparison-panes">
        <figure data-side="before"><figcaption>Before</figcaption><div class="well"></div></figure>
        <figure data-side="after"><figcaption>After</figcaption><div class="well"></div></figure>
      </div>
      <div class="curtain">
        <div class="curtain-labels"><span>Before</span><span>After</span></div>
        <div class="curtain-images">
          <div class="curtain-layer" data-side="before"></div><div class="curtain-layer" data-side="after"></div>
          <div class="curtain-divider" aria-hidden="true"><span>↔</span></div>
          <input type="range" min="0" max="100" value="50">
        </div>
      </div>
    </div>
  </template>
  <script id="embed-data" type="application/json">${safeJson(payload)}</script>
  ${styles.map((style, index) => `<template id="style-${index}"><style>${cssText(style)}</style></template>`).join('\n')}
  ${templates.join('\n')}
  <script>(${mountEmbed.toString()})();</script>
</div>`;
  if (codex) return fragment + '\n';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} · Inline design review</title>
  <style>body{margin:0;padding:8px}</style>
</head>
<body>
${fragment}
</body>
</html>\n`;
}

function mountEmbed() {
  const root = document.getElementById('embed-root');
  const data = JSON.parse(root.querySelector('#embed-data').textContent);
  const template = root.querySelector('#embed-comparison');
  const controls = root.querySelector('[data-review-options]');
  const dialog = root.querySelector('#embed-zoom');
  const zoomControls = dialog.querySelector('[data-review-options]');
  const zoomContent = dialog.querySelector('[data-zoom-content]');
  const zoomScale = dialog.querySelector('[data-zoom-scale]');
  const sheetCache = new Map();
  const appearance = { theme: root.dataset.previewTheme, mode: root.dataset.comparisonMode };
  const zoomState = { ...appearance };
  let activeZoom;
  let zoom = 100;

  for (const image of root.querySelectorAll('[data-motion-image]')) {
    const source = data.motionAssets?.[image.dataset.motionImage];
    if (source) image.src = source;
  }

  function getSheet(index) {
    if (!sheetCache.has(index)) {
      const sheet = new CSSStyleSheet();
      const css = root.querySelector('#style-' + index).content.firstElementChild.textContent;
      sheet.replaceSync('review-document,review-body{display:block}review-document{min-height:100%}' + css);
      sheetCache.set(index, sheet);
    }
    return sheetCache.get(index);
  }

  function createSpecimen(preview) {
    const specimen = document.createElement('div');
    specimen.className = 'specimen';
    const { width, height } = preview;
    specimen.style.width = width + 'px';
    specimen.style.height = height + 'px';
    for (const [unit, extent] of Object.entries({ vw: width, vh: height, vmin: Math.min(width, height), vmax: Math.max(width, height) })) {
      specimen.style.setProperty('--review-' + unit, extent / 100 + 'px');
    }
    const shadow = specimen.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [getSheet(preview.style)];
    shadow.append(root.querySelector('#frame-' + preview.template).content.cloneNode(true));
    return specimen;
  }

  function makeComparison(card, state, enlarged = false) {
    const element = template.content.firstElementChild.cloneNode(true);
    const panes = element.querySelector('.comparison-panes');
    const curtain = element.querySelector('.curtain');
    const slider = curtain.querySelector('input');
    const views = ['before', 'after'].map(side => {
      const [pane, layer] = element.querySelectorAll('[data-side="' + side + '"]');
      const well = pane.querySelector('.well');
      const preview = card[side];
      pane.hidden = !preview;
      const surface = document.createElement('div');
      surface.className = 'surface';
      const specimen = preview && createSpecimen(preview);
      if (specimen) surface.append(specimen);
      return { well, layer, surface, frame: specimen?.shadowRoot.querySelector('.review-root') };
    });
    const width = Math.max(card.before?.width ?? 0, card.after.width);
    const height = Math.max(card.before?.height ?? 0, card.after.height);

    slider.setAttribute('aria-label', 'Before and after split for ' + card.origin.frame);
    slider.addEventListener('input', () => curtain.style.setProperty('--split', slider.value + '%'));

    function fit() {
      if (!element.clientWidth) return;
      const sliderMode = element.dataset.mode === 'slider';
      const room = sliderMode ? curtain.clientWidth
        : views[1].well.clientWidth;
      if (!room) return;
      const available = Math.max(1, room - 4) / width;
      const scale = enlarged ? Math.min(4, available) : Math.min(1, available, 172 / height);
      element.style.setProperty('--specimen-width', Math.ceil(width * scale) + 'px');
      element.style.setProperty('--specimen-height', Math.ceil(height * scale) + 'px');
      element.style.setProperty('--specimen-scale', scale);
    }

    function render() {
      const mode = card.before ? state.mode : 'after';
      if (element.dataset.mode !== mode) {
        for (const view of views) (mode === 'slider' ? view.layer : view.well).append(view.surface);
      }
      element.dataset.mode = mode;
      element.dataset.theme = state.theme;
      panes.hidden = mode === 'slider';
      curtain.hidden = mode !== 'slider';
      for (const { frame } of views) if (frame) frame.dataset.theme = state.theme;
      fit();
    }

    const resize = new ResizeObserver(fit);
    resize.observe(element);
    render();
    return { element, render, disconnect: () => resize.disconnect() };
  }

  function updatePressed(toolbar, state) {
    for (const button of toolbar.querySelectorAll('[data-choice]')) {
      button.setAttribute('aria-pressed', String([state.theme, state.mode].includes(button.dataset.choice)));
    }
  }

  function wireOptions(toolbar, state, render) {
    toolbar.addEventListener('click', event => {
      const choice = event.target.closest('[data-choice]')?.dataset.choice;
      if (!choice) return;
      if (choice === 'light' || choice === 'dark') state.theme = choice;
      else state.mode = choice;
      updatePressed(toolbar, state);
      render();
    });
  }

  const scenes = [...root.querySelectorAll('[data-embed-card]')].map(article => {
    const card = data.cards[Number(article.dataset.embedCard)];
    const scene = makeComparison(card, appearance);
    article.querySelector('[data-stage-host]').append(scene.element);
    article.querySelector('[data-enlarge]').addEventListener('click', () => openZoom(card));
    article.querySelector('[data-handoff]')?.addEventListener('click', event => followUp(card, event.currentTarget));
    return scene;
  });

  wireOptions(controls, appearance, () => {
    root.dataset.previewTheme = appearance.theme;
    root.dataset.comparisonMode = appearance.mode;
    for (const scene of scenes) scene.render();
  });
  wireOptions(zoomControls, zoomState, () => activeZoom?.render());

  function openZoom(card) {
    const { origin, before, after } = card;
    Object.assign(zoomState, appearance);
    updatePressed(zoomControls, zoomState);
    const compareOptions = zoomControls.querySelector('[data-compare-options]');
    if (compareOptions) compareOptions.hidden = !before;
    dialog.querySelector('#embed-zoom-title').textContent = origin.frame;
    const dimensions = frame => Math.round(frame.width) + ' × ' + Math.round(frame.height);
    const size = before && dimensions(before) !== dimensions(after) ? dimensions(before) + ' → ' + dimensions(after) : dimensions(after);
    dialog.querySelector('[data-zoom-info]').textContent = [origin.layer, origin.title, size].filter(Boolean).join(' · ');
    activeZoom = makeComparison(card, zoomState, true);
    zoomContent.replaceChildren(activeZoom.element);
    zoom = 100;
    updateZoom();
    dialog.showModal();
  }

  function updateZoom() {
    activeZoom.element.style.width = zoom + '%';
    zoomScale.textContent = zoom === 100 ? 'Fit' : zoom + '%';
  }

  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (!action) return;
    if (action === 'close') {
      dialog.close();
      return;
    }
    zoom = action === 'fit' ? 100 : Math.max(75, Math.min(200, zoom + (action === 'in' ? 25 : -25)));
    updateZoom();
  });
  dialog.addEventListener('close', () => {
    activeZoom?.disconnect();
    activeZoom = null;
    zoomContent.replaceChildren();
  });

  const handoffButtons = root.querySelectorAll('[data-handoff]');
  if (handoffButtons.length) {
    const updateHandoff = () => {
      const available = typeof window.openai?.sendFollowUpMessage === 'function';
      for (const button of handoffButtons) button.hidden = !available;
    };
    updateHandoff();
    window.addEventListener('openai:set_globals', updateHandoff);
  }

  async function followUp(card, button) {
    const host = window.openai;
    if (typeof host?.sendFollowUpMessage !== 'function') return;
    const status = root.querySelector('[data-handoff-status]');
    button.disabled = true;
    status.hidden = true;
    try {
      await host.sendFollowUpMessage({
        title: 'Use this ADG frame',
        prompt: [
          'Continue the design work using this ADG review frame.',
          'Project: ' + data.title,
          'Source: ' + card.source,
          'Frame: ' + card.frame,
          'Base: ' + data.base,
          ...(data.head ? ['HEAD when generated: ' + data.head] : []),
          ...(card.proposed ? ['Proposal: ' + card.proposed] : []),
        ].join('\n'),
      });
    } catch {
      status.textContent = 'Could not open a Codex follow-up. Try again.';
      status.hidden = false;
    } finally {
      button.disabled = false;
    }
  }
}
