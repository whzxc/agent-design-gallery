// Bundled into the standalone report and used by the filmstrip renderer.
import { createStage, mountScene, observeScene, readySceneResources } from '../../public/motion-scene.js';
import { preparePaint, playTimeline } from '../../public/motion-paint.js';

export { createStage };

export async function showEndpoint(frame, endpoint, assets, theme) {
  const doc = frame.contentDocument;
  const size = (width, height) => Object.assign(frame.style, { width: width + 'px', height: height + 'px' });
  size(endpoint.width || 1600, endpoint.height || 1200);
  const stage = await mountScene(doc, {
    ...endpoint, html: assets[endpoint.html], css: endpoint.styles.map(key => assets[key]).join('')
  }, theme);
  const rect = stage.getBoundingClientRect();
  size(endpoint.width || Math.max(1, Math.ceil(rect.width)), endpoint.height || Math.max(1, Math.ceil(rect.height)));
  await readySceneResources(doc);
  return stage;
}

export async function prepare(frame, side, assets, theme) {
  const from = assets[side.from], to = assets[side.to];
  const origin = await showEndpoint(frame, from, assets, theme);
  const first = side.edge.unsupported ? null : observeScene(origin, from.design, true);
  const stage = await showEndpoint(frame, to, assets, theme);
  return first ? preparePaint(stage, first, observeScene(stage, to.design, true), side.edge) : null;
}

export function identities(stage, design) {
  return observeScene(stage, design).map(({ box, parts, keys, anchor, parent }) => ({
    box, parts, anchor, parent,
    keys: keys.map(({ owner, ...key }) => owner
      ? { ...key, owner: [design, owner.source].filter(Boolean).join('/') + '#' + owner.export }
      : key)
  }));
}

export function mountReport() {
  const data = JSON.parse(document.querySelector('#motion-data').textContent);
  let active, pending = Promise.resolve(), generation = 0;
  async function activate(card, sideName, play, ticket) {
    if (ticket !== generation) return;
    active?.stop?.();
    active?.paint?.dispose();
    active?.frame?.remove();
    if (active) {
      active.card.querySelector('.motion-cover').hidden = true;
      active.card.querySelector('.motion-stage').style.height = '';
      active.card.querySelector('[role=status]').textContent = '';
    }
    active?.fit?.disconnect();
    active = null;
    const side = data.cards[card.dataset.motion][sideName];
    const host = card.querySelector('.motion-stage');
    const frame = await createStage(host);
    frame.inert = true;
    if (ticket !== generation) { frame.remove(); return; }
    const state = active = { frame, sideName, card };
    card.querySelector('[role=status]').textContent = sideName === 'before' ? 'Previewing before' : 'Previewing after';
    // A new selection can arrive while the sandbox waits for fonts.
    const paint = await prepare(frame, side, data.assets, data.theme);
    if (ticket !== generation) { paint?.dispose(); return; }
    state.paint = paint;
    const endWidth = frame.offsetWidth, endHeight = frame.offsetHeight;
    const cover = card.querySelector('.motion-cover');
    const first = side.samples[0];
    cover.src = data.assets[first.image];
    const draw = p => {
      const atStart = p === 0 || (!side.duration && p < 1);
      cover.hidden = !atStart;
      frame.style.visibility = atStart ? 'hidden' : 'visible';
      paint?.seek(p);
      const w = atStart ? first.width : endWidth, h = atStart ? first.height : endHeight;
      const scale = Math.min(1, host.clientWidth / w, 400 / h);
      host.style.height = Math.ceil(h * scale) + 'px';
      frame.style.transform = 'scale(' + scale + ')';
      cover.style.width = w * scale + 'px';
    };
    state.draw = draw;
    const slider = card.querySelector('input');

    state.fit = new ResizeObserver(() => draw(Number(card.dataset[sideName] || 0)));
    state.fit.observe(host.parentElement);
    function advance(p) {
      card.dataset[sideName] = p;
      card.querySelector('[data-elapsed="' + sideName + '"]').value = elapsed(side.duration * p);
      draw(p);
    }
    draw(Number(card.dataset[sideName] || 0));
    if (play) {
      advance(0);
      if (side.duration) state.stop = playTimeline(side.duration, 0, 1, advance, () => {});
      else advance(1);
    }
    slider.setAttribute('aria-valuetext', slider.value + '%');
  }
  function elapsed(value) { return Number(value.toFixed(2)) + ' ms'; }
  for (const card of document.querySelectorAll('[data-motion]')) {
    const model = data.cards[card.dataset.motion];
    for (const image of card.querySelectorAll('[data-image]')) image.src = data.assets[image.dataset.image];
    const start = (side, play) => {
      const ticket = ++generation;
      pending = pending.then(() => activate(card, side, play, ticket)).catch(err => {
        if (ticket === generation) card.querySelector('[role=status]').textContent = err.message;
      });
    };
    for (const button of card.querySelectorAll('[data-play],[data-preview]')) {
      button.onclick = () => start(button.dataset.play ?? button.dataset.preview, button.hasAttribute('data-play'));
    }
    if (!card.querySelector('input')) continue;
    card.querySelector('input').oninput = event => {
      const p = event.target.valueAsNumber / 100;
      for (const name of ['before', 'after']) {
        const side = model[name];
        if (!side?.samples) continue;
        card.dataset[name] = p;
        card.querySelector('[data-elapsed="' + name + '"]').value = elapsed(side.duration * p);
      }
      event.target.setAttribute('aria-valuetext', event.target.value + '%');
      if (active?.card === card && active.draw) { active.stop?.(); active.draw(p); }
      else start(model.after?.samples ? 'after' : 'before', false);
    };
  }
}
