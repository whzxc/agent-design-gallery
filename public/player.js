import { icon } from './icons.js';
import { dataFetch } from './auth.js';
import { candidates } from './motion-identity.js';
import { createStage, mountScene, observeScene } from './motion-scene.js';
import { preparePaint, playTimeline } from './motion-paint.js';

let preference = sessionStorage.getItem('adg-player-reduced') ?? 'system';
const exact = (rows, target) => {
  const found = target && candidates(rows, target);
  return found?.length === 1 ? found[0].el : null;
};

export async function openPlayer({ source, frame, theme, invoker }) {
  if (document.querySelector('#motion-player')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'motion-player';
  dialog.setAttribute('aria-label', 'Play transitions');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('player.css', document.baseURI);
  dialog.innerHTML = `<header class="play-header"><div><span class="play-project">${icon('route', 17)}<b data-control="source"></b></span>
    <button data-control="settings" aria-controls="play-settings" aria-expanded="false">${icon('settings-2', 15)}Playback settings <span data-control="mode"></span></button></div>
    <button data-control="exit">${icon('log-out', 14)}Exit to board</button></header>
    <section id="play-settings" class="play-settings" aria-label="Playback settings" hidden></section>
    <section class="play-stage" aria-label="Frame preview"></section>
    <aside class="play-rail"><section><small>Current frame</small><h1 data-control="current" aria-live="polite"></h1>
    <small>Path taken</small><p data-control="path"></p><button data-control="back">${icon('arrow-left', 14)}<span></span></button></section>
    <section><h2 data-control="next">Next actions</h2><p data-control="next-context"></p>
    <div class="play-actions" role="group" aria-label="Outgoing actions"></div></section></aside>
    <section class="play-dock" aria-label="Transition inspector" hidden><div class="play-transport">
    <div><small data-control="state"></small><h2 data-control="action"></h2><code data-control="endpoints"></code></div>
    <div><button data-control="pause">Pause transition</button><button data-control="replay">${icon('rotate-ccw', 14)}Replay transition</button></div></div>
    <div class="play-clock"><span>0 ms</span><input data-control="seek" type="range" min="0" max="100" step="1" value="0" aria-label="Transition progress">
    <span data-control="end"></span></div><p data-control="instant"></p>
    <footer><span data-control="duration"></span><span data-control="easing"></span><b data-control="elapsed"></b></footer></section>
    <small role="status"></small>`;
  document.head.append(link);
  document.body.append(dialog);
  dialog.showModal();
  const control = (id) => dialog.querySelector('[data-control="' + id + '"]');
  const stageHost = dialog.querySelector('.play-stage'),
    label = control('current'),
    status = dialog.querySelector('[role=status]');
  const actions = dialog.querySelector('.play-actions'),
    media = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController(),
    signal = controller.signal,
    cache = new Map();
  const history = [],
    focusStack = [];
  let iframe,
    doc,
    scene,
    stage,
    rows = [],
    active = null,
    last = null,
    busy = true,
    cancelClock,
    run = false,
    progress = 0,
    speed = 1,
    spots = false,
    hovered = null,
    committing = false,
    overlay;
  const reduced = () => preference === 'on' || (preference === 'system' && media.matches);
  function stop() {
    cancelClock?.();
    run = false;
  }
  function exit() {
    stop();
    controller.abort();
    active?.paint?.dispose();
    dialog.close();
    dialog.remove();
    link.remove();
    const caption = document.querySelector(
      '[data-frame-source="' + CSS.escape(source) + '"][data-frame-name="' + CSS.escape(frame) + '"] .caption-play'
    );
    (invoker.isConnected
      ? invoker
      : (caption ?? document.querySelector('#play-frame:not([hidden]),.gallery-viewport'))
    )?.focus({ preventScroll: true });
  }
  control('exit').onclick = exit;
  function dismissPopover() {
    const open = dialog.querySelectorAll('[aria-controls][aria-expanded="true"]');
    const button = open[open.length - 1];
    if (!button) return false;
    button.click();
    button.focus();
    return true;
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!dismissPopover()) exit();
  });
  // Modal keyboard commands never reach board camera or navigation handlers.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('keyup', (e) => e.stopPropagation());
  control('source').textContent = source
    .split('/')
    .at(-1)
    .replace(/\.tsx$/, '')
    .replace(/-/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
  stageHost.addEventListener('click', (event) => {
    if (event.target === stageHost) {
      spots = true;
      hints();
    }
  });
  function fail(err) {
    if (signal.aborted) return;
    busy = false;
    stop();
    status.textContent = err.message;
    update();
  }
  async function fetchScene(ref) {
    const key = JSON.stringify(ref);
    if (!cache.has(key)) {
      const res = await dataFetch('api/play?' + new URLSearchParams({ ...ref, theme, scene: '1' }), { signal });
      if (!res.ok) throw Error((await res.json()).error ?? 'Cannot load frame.');
      cache.set(key, await res.json());
    }
    return cache.get(key);
  }
  async function show(endpoint) {
    overlay?.remove();
    stage = await mountScene(doc, endpoint, theme);
    if (signal.aborted) throw new DOMException('Player closed', 'AbortError');
    rows = observeScene(stage, endpoint.design);
    hovered = null;
    for (const edge of endpoint.edges) {
      if (edge.trigger.on !== 'input') continue;
      const el = exact(rows, edge.trigger.target);
      if (el?.dataset.playerTextEntry === 'input') el.readOnly = false;
      if (el?.dataset.playerTextEntry === 'editable') el.contentEditable = 'plaintext-only';
    }
  }
  function hints() {
    overlay?.remove();
    overlay = null;
    if (!rows.length || busy) return;
    const chip = actions.querySelector('button:hover,button:focus-visible');
    const focused = doc.hasFocus() ? doc.activeElement : null;
    overlay = doc.createElement('div');
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
    const outlined = new Map();
    for (const edge of (active?.to ?? scene)?.edges ?? []) {
      const el = exact(rows, edge.trigger.target);
      if (!el) continue;
      const targetActive = edge.trigger.target.frame
        ? hovered === el || focused === el
        : el.contains(hovered) || el.contains(focused);
      if (!(spots || targetActive || chip?.dataset.edge === edge.id)) continue;
      if (outlined.has(el)) continue;
      outlined.set(el, edge);
      const b = el.getBoundingClientRect(),
        box = doc.createElement('div'),
        tag = doc.createElement('span');
      Object.assign(box.style, {
        position: 'absolute',
        left: b.x + 'px',
        top: b.y + 'px',
        width: b.width + 'px',
        height: b.height + 'px',
        outline: '2px dashed var(--accent)',
        boxSizing: 'border-box'
      });
      Object.assign(tag.style, { background: 'var(--surface)', color: 'var(--text)', font: '11px system-ui' });
      tag.textContent = edge.label;
      box.append(tag);
      overlay.append(box);
    }
    if (overlay.childElementCount) doc.body.append(overlay);
  }
  let actionFrame, actionsBusy;
  function drawActions(dest) {
    const groups = new Map();
    for (const edge of dest?.edges ?? []) {
      const key = edge.authoredLabel ? 'label:' + edge.label : JSON.stringify(edge.to);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    }
    actions.replaceChildren();
    const names = [...groups.values()].map((edges) => edges[0].label);
    for (const edges of groups.values()) {
      const row = document.createElement('div'),
        name = document.createElement('strong');
      name.textContent = edges[0].label;
      row.append(name);
      if (names.filter((label) => label === edges[0].label).length > 1) {
        const detail = document.createElement('small');
        detail.textContent = 'To ' + edges[0].to.frame;
        row.append(detail);
      }
      const chips = document.createElement('div');
      for (const edge of edges) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.dataset.edge = edge.id;
        chip.textContent = edges.some((other) => other !== edge && other.gesture === edge.gesture)
          ? edge.gesture + ' → ' + edge.to.frame
          : edge.gesture;
        chip.setAttribute('aria-label', edge.label + ' · ' + chip.textContent);
        chip.disabled = busy;
        chip.onclick = () => invoke(edge).catch(fail);
        chips.append(chip);
      }
      row.append(chips);
      actions.append(row);
    }
  }
  function clock() {
    const transition = active ?? last;
    if (!transition) return;
    const ms = transition.duration;
    control('seek').value = String(Math.round(progress * 100));
    const at = Math.round(progress * ms) + ' ms';
    control('seek').setAttribute('aria-valuetext', at);
    control('elapsed').textContent = at + ' elapsed';
  }
  function update() {
    const dest = active?.to ?? scene,
      transition = active ?? last;
    label.textContent = scene?.frame ?? 'Loading…';
    control('path').textContent = [...history.map((h) => h.scene.frame), scene?.frame].filter(Boolean).join(' › ');
    const prev = history.at(-1)?.scene;
    control('back').hidden = !prev;
    control('back').disabled = busy;
    control('back').lastElementChild.textContent = 'Back to ' + (prev?.frame ?? '');
    control('next').textContent = dest && !dest.edges.length ? 'End of flow' : 'Next actions';
    control('next-context').textContent = active
      ? 'Continue from ' + dest.frame
      : dest && !dest.edges.length
        ? 'No outgoing actions from this frame.'
        : '';
    if (actionFrame !== dest || actionsBusy !== busy) drawActions(dest);
    actionFrame = dest;
    actionsBusy = busy;
    dialog.querySelector('.play-dock').hidden = !transition;
    if (transition) {
      const { edge, instant } = transition;
      control('state').textContent = active ? (run ? 'Playing transition' : 'Paused transition') : 'Last transition';
      control('action').textContent = edge.label;
      control('endpoints').textContent = edge.from.frame + ' → ' + edge.to.frame;
      control('pause').hidden = !active;
      control('pause').innerHTML = run ? icon('pause', 14) + 'Pause transition' : icon('play', 14) + 'Resume transition';
      control('elapsed').hidden = instant;
      control('replay').disabled = busy;
      control('seek').disabled = busy || reduced() || !!edge.unsupported;
      dialog.querySelector('.play-clock').hidden = instant;
      control('instant').textContent = instant ? 'Applied instantly · 0 ms' : '';
      control('duration').textContent = 'Duration  ' + edge.duration + ' · ' + edge.timings['/duration'] + ' ms';
      control('easing').textContent = 'Easing  ' + edge.easing + ' · ' + edge.timings['/easing'];
      control('end').textContent = transition.duration + ' ms';
      clock();
    }
    control('mode').textContent = reduced() ? 'Reduced motion' : speed + '×';
    for (const b of settings.querySelectorAll('button'))
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.speed !== undefined ? Number(b.dataset.speed) === speed : b.dataset.reduce === preference)
      );
    hints();
  }
  function focusIdentity(el) {
    const row = rows.find((r) => r.el === el);
    if (!row) return null;
    if (row.anchor) return { anchor: row.anchor };
    if (row.parts.length) {
      let cur = row;
      while (cur && !cur.keys.length) cur = rows[cur.parent];
      return { part: row.parts.at(-1), ...(cur ? { key: cur.keys[0].key } : {}) };
    }
    return row === rows[0] ? { frame: true } : null;
  }
  function focus(target) {
    const el = exact(rows, target) ?? stage.firstElementChild;
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.tabIndex = -1;
    committing = true;
    try {
      el.focus({ preventScroll: true });
    } finally {
      committing = false;
    }
  }
  function commit() {
    if (!active) return;
    const { edge, to, from, priorFocus, priorStack, paint } = active;
    stop();
    paint?.dispose();
    active = null;
    history.push({ scene: from, focus: priorFocus, stack: priorStack });
    if (edge.rememberTrigger === 'replace') focusStack.pop();
    if (edge.rememberTrigger) focusStack.push(edge.trigger.target);
    scene = to;
    last = {
      from,
      edge,
      priorFocus,
      priorStack,
      duration: reduced() ? 0 : (paint?.duration ?? 0),
      instant: reduced() || !!edge.unsupported || !paint?.duration
    };
    progress = 1;
    update();
    const target =
      edge.focus === 'preserve'
        ? priorFocus
        : edge.focus === 'restore-trigger'
          ? focusStack.pop()
          : edge.focus.target;
    focus(target);
  }
  function play() {
    if (!active) return;
    if (reduced() || !active.paint?.duration || progress >= 1) {
      commit();
      return;
    }
    stop();
    run = true;
    update();
    cancelClock = playTimeline(active.paint.duration, progress, speed, p => {
      progress = p;
      active.paint.seek(p);
      clock();
    }, commit);
  }
  async function begin(edge, seek = null, restore = null) {
    busy = true;
    spots = false;
    hovered = null;
    overlay?.remove();
    status.textContent = '';
    update();
    const from = scene,
      priorFocus = restore?.priorFocus ?? focusIdentity(doc.activeElement),
      priorStack = [...focusStack];
    let replaced = false;
    try {
      const to = await fetchScene({
        source: from.design ? edge.to.source.slice(from.design.length + 1) : edge.to.source,
        frame: edge.to.frame
      });
      let first = reduced() || edge.unsupported ? null : observeScene(stage, from.design, true);
      replaced = true;
      await show(to);
      if (!first && !reduced() && !edge.unsupported) {
        await show(from);
        first = observeScene(stage, from.design, true);
        await show(to);
      }
      const instant = reduced() || !!edge.unsupported;
      const paint = instant ? null : preparePaint(stage, first, observeScene(stage, to.design, true), edge);
      active = { edge, from, to, paint, priorFocus, priorStack, duration: paint?.duration ?? 0, instant };
      progress = seek ?? 0;
      busy = false;
      if (edge.unsupported) status.textContent = edge.unsupported.map((u) => u.effect + ' — ' + u.reason).join(' · ');
      if (instant) {
        commit();
        return;
      }
      paint.seek(progress);
      if (seek === null) play();
      else update();
    } catch (error) {
      if (!signal.aborted) {
        if (replaced) await show(from);
        active = null;
        busy = false;
        update();
        if (replaced) focus(priorFocus);
      }
      throw error;
    }
  }
  async function invoke(edge) {
    if (busy) return;
    if (active) commit(); // Finish first, then dispatch the destination's input once.
    if (scene.edges.includes(edge)) await begin(edge);
  }
  async function replay(at = null) {
    if (busy || !(active || last)) return;
    if (active) {
      stop();
      progress = at ?? 0;
      active.paint.seek(progress);
      if (at === null) play();
      else update();
      return;
    }
    const prior = last;
    busy = true;
    update();
    scene = prior.from;
    history.pop();
    focusStack.splice(0, Infinity, ...prior.priorStack);
    await show(scene);
    await begin(prior.edge, at, prior);
  }
  control('back').onclick = async () => {
    if (busy) return;
    const prev = history.pop();
    if (!prev) return;
    stop();
    active?.paint?.dispose();
    active = null;
    last = null;
    progress = 0;
    busy = true;
    update();
    try {
      scene = prev.scene;
      focusStack.splice(0, Infinity, ...prev.stack);
      await show(scene);
      busy = false;
      update();
      focus(prev.focus);
    } catch (e) {
      fail(e);
    }
  };
  control('pause').onclick = () => {
    if (run) {
      stop();
      update();
    } else play();
  };
  control('replay').onclick = () => replay().catch(fail);
  const seek = control('seek');
  seek.oninput = () => replay(Number(seek.value) / 100).catch(fail);
  seek.onkeydown = (e) => {
    if (['PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      seek.value = Number(seek.value) + (e.key === 'PageUp' ? 10 : -10);
      seek.oninput();
    }
  };
  const settings = dialog.querySelector('.play-settings');
  control('settings').onclick = () => {
    settings.hidden = !settings.hidden;
    control('settings').setAttribute('aria-expanded', String(!settings.hidden));
  };
  const preferenceChanged = () => {
    if (active && reduced()) commit();
    else update();
  };
  for (const [title, options] of [
    ['Playback speed', ['0.25', '0.5', '1']],
    ['Reduced motion', ['system', 'on', 'off']]
  ]) {
    const field = document.createElement('fieldset'),
      legend = document.createElement('legend');
    legend.textContent = title;
    field.append(legend);
    for (const value of options) {
      const button = document.createElement('button');
      if (title === 'Playback speed') {
        button.dataset.speed = value;
        button.textContent = value + '×';
        button.onclick = () => {
          speed = Number(value);
          if (run) play();
          else update();
        };
      } else {
        button.dataset.reduce = value;
        button.textContent = value[0].toUpperCase() + value.slice(1);
        button.onclick = () => {
          preference = value;
          sessionStorage.setItem('adg-player-reduced', value);
          preferenceChanged();
        };
      }
      field.append(button);
    }
    settings.append(field);
  }
  media.addEventListener('change', preferenceChanged, { signal });
  let composing;
  const editingValue = (el) => el.value ?? el.innerText;
  function dispatch(event, on) {
    if (
      busy ||
      committing ||
      (on === 'key' && (event.isComposing || composing || event.keyCode === 229)) ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const dest = active?.to ?? scene;
    const origin =
      on === 'key' && [doc.body, doc.documentElement, doc].includes(event.target)
        ? stage.firstElementChild
        : event.target;
    for (let node = origin; node && node !== doc; node = node.parentElement) {
      const edge = dest?.edges.find(
        (e) =>
          e.trigger.on === on &&
          (on !== 'key' || event.key === e.trigger.key) &&
          (on !== 'input' || (!event.isComposing && editingValue(node) === e.trigger.value)) &&
          exact(rows, e.trigger.target) === node &&
          (on !== 'hover' || !node.contains(event.relatedTarget))
      );
      if (edge) {
        event.preventDefault();
        invoke(edge).catch(fail);
        return true;
      }
    }
  }
  try {
    iframe = await createStage(stageHost);
    if (signal.aborted) return;
    doc = iframe.contentDocument;
    Object.assign(doc.body.style, { minHeight: '100vh', display: 'grid', placeItems: 'center' });
    for (const kind of ['pointerover', 'pointerout', 'focusin', 'focusout'])
      actions.addEventListener(kind, hints);
    for (const kind of ['pointerover', 'pointerout', 'focusin', 'focusout'])
      doc.addEventListener(kind, (e) => {
        if (kind.startsWith('pointer')) hovered = kind.endsWith('out') ? e.relatedTarget : e.target;
        hints();
      });
    doc.addEventListener('compositionstart', (e) => {
      composing = { el: e.target, value: editingValue(e.target) };
    });
    doc.addEventListener('input', (e) => {
      if (!composing) dispatch(e, 'input');
    });
    doc.addEventListener('compositionend', (e) => {
      const prior = composing;
      composing = null;
      if (prior?.el === e.target && prior.value !== editingValue(e.target)) dispatch(e, 'input');
    });
    doc.addEventListener('click', (e) => {
      if (!dispatch(e, 'click')) {
        const edges = (active?.to ?? scene)?.edges ?? [];
        const hits = edges.filter(
          (x) => exact(rows, x.trigger.target)?.contains(e.target) && !x.trigger.target.frame
        );
        if (!hits.length) {
          spots = true;
          hints();
        } else if (!hits.some((x) => x.trigger.on === 'input'))
          actions.querySelector('[data-edge="' + CSS.escape(hits[0].id) + '"]')?.focus();
      }
    });
    doc.addEventListener('beforeinput', (e) => {
      if (
        !e.target.closest(
          'input[data-player-text-entry]:not([readonly]),textarea[data-player-text-entry]:not([readonly]),[contenteditable="plaintext-only"]'
        )
      )
        e.preventDefault();
    });
    doc.addEventListener('scroll', hints, true);
    for (const [name, input] of [
      ['pointerover', 'hover'],
      ['focusin', 'focus'],
      ['keydown', 'key']
    ])
      doc.addEventListener(
        name,
        (e) => {
          if (name === 'keydown' && e.key === 'Escape' && !e.isComposing && !composing && dismissPopover()) {
            e.preventDefault();
            return;
          }
          if (
            !dispatch(e, input) &&
            !busy &&
            !e.repeat &&
            !composing &&
            !e.isComposing &&
            e.keyCode !== 229 &&
            name === 'keydown' &&
            e.key === 'Escape'
          ) {
            e.preventDefault();
            exit();
          }
        },
        true
      );
    for (const name of ['click', 'auxclick', 'submit', 'drop', 'dragstart', 'contextmenu'])
      doc.addEventListener(name, (e) => e.preventDefault(), true);
    doc.addEventListener(
      'pointerdown',
      (e) => {
        if (active) e.preventDefault();
      },
      true
    );
    scene = await fetchScene({ source, frame });
    await show(scene);
    busy = false;
    update();
    (actions.querySelector('button') ?? control('exit')).focus();
  } catch (err) {
    fail(err);
  }
}
