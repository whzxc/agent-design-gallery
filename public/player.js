import { dataFetch } from './auth.js';
import { candidates } from './motion-identity.js';
import { createStage, mountScene, observeScene } from './motion-scene.js';
import { preparePaint } from './motion-paint.js';

let preference = sessionStorage.getItem('adg-player-reduced') ?? 'system';
const actionLabel = (e) =>
  e.trigger.on +
  (e.trigger.key ? ' ' + e.trigger.key : '') +
  ' → ' +
  e.to.frame +
  (e.unsupported ? ' (instant jump)' : '');
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
  dialog.innerHTML = `<section class="play-stage"></section>
    <section class="play-dock"><div class="play-location"><strong aria-live="polite"></strong><button type="button" data-control="exit">Exit</button></div>
    <div class="play-controls" role="toolbar" aria-label="Playback controls">
    <button data-control="back">Back</button><button data-control="replay">Replay</button><button data-control="pause">Pause</button>
    <input data-control="seek" type="range" min="0" max="100" value="0" step="1" aria-label="Transition progress">
    <select data-control="speed" aria-label="Playback speed"><option value="1">1×</option><option value=".5">0.5×</option><option value=".25">0.25×</option></select>
    <select data-control="reduce" aria-label="Reduced motion"><option value="system">System motion</option><option value="on">Reduced motion on</option><option value="off">Reduced motion off</option></select>
    <button data-control="spots" aria-pressed="false">Hotspots</button></div>
    <div class="play-actions" role="group" aria-label="Outgoing actions"></div><small role="status"></small></section>`;
  document.head.append(link);
  document.body.append(dialog);
  dialog.showModal();
  const control = (id) => dialog.querySelector('[data-control="' + id + '"]');
  const stageHost = dialog.querySelector('.play-stage'),
    label = dialog.querySelector('strong'),
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
    raf = 0,
    run = false,
    progress = 0,
    speed = 1,
    spots = false,
    keyboardHints = false,
    committing = false,
    overlay;
  const reduced = () => preference === 'on' || (preference === 'system' && media.matches);
  function stop() {
    cancelAnimationFrame(raf);
    run = false;
  }
  function exit() {
    stop();
    controller.abort();
    active?.paint?.dispose();
    dialog.close();
    dialog.remove();
    link.remove();
    invoker.focus({ preventScroll: true });
  }
  control('exit').onclick = exit;
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    exit();
  });
  // Modal keyboard commands never reach board camera or navigation handlers.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      keyboardHints = true;
      hints();
    }
  });
  dialog.addEventListener('keyup', (e) => e.stopPropagation());
  dialog.addEventListener('focusin', (e) => {
    if (e.target.matches(':focus-visible') && !busy) {
      keyboardHints = true;
      hints();
    }
  });
  dialog.addEventListener('pointerdown', () => {
    keyboardHints = false;
    hints();
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
  }
  function hints() {
    overlay?.remove();
    overlay = null;
    if (!rows.length || busy || !(spots || keyboardHints)) return;
    overlay = doc.createElement('div');
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
    for (const edge of (active?.to ?? scene)?.edges ?? []) {
      const el = exact(rows, edge.trigger.target);
      if (!el) continue;
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
      tag.textContent = actionLabel(edge);
      box.append(tag);
      overlay.append(box);
    }
    doc.body.append(overlay);
  }
  let actionFrame, actionsBusy;
  function update() {
    const dest = active?.to ?? scene;
    label.textContent = active ? active.from.frame + ' → ' + dest.frame : (dest?.frame ?? 'Loading…');
    control('back').disabled = busy || (!history.length && !active);
    control('replay').disabled = busy || !(active || last);
    control('pause').disabled = busy || !active;
    control('pause').textContent = run ? 'Pause' : 'Resume';
    control('seek').disabled = busy || !(active || last) || reduced() || !!(active ?? last)?.edge.unsupported;
    control('seek').value = String(Math.round(progress * 100));
    control('spots').setAttribute('aria-pressed', String(spots));
    control('reduce').value = preference;
    if (actionFrame !== dest || actionsBusy !== busy)
      actions.replaceChildren(
        ...(dest?.edges ?? []).map((edge) => {
          const button = document.createElement('button');
          button.textContent = actionLabel(edge);
          button.disabled = busy;
          button.dataset.edge = edge.id;
          button.onclick = () => invoke(edge).catch(fail);
          return button;
        })
      );
    actionFrame = dest;
    actionsBusy = busy;
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
    last = { from, edge, priorFocus, priorStack };
    progress = 1;
    update();
    const target =
      edge.focus === 'preserve' ? priorFocus : edge.focus === 'restore-trigger' ? focusStack.pop() : edge.focus.target;
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
    let before = performance.now();
    function tick(now) {
      if (!run) return;
      progress = Math.min(1, progress + ((now - before) * speed) / active.paint.duration);
      before = now;
      active.paint.seek(progress);
      control('seek').value = String(Math.round(progress * 100));
      if (progress === 1) commit();
      else raf = requestAnimationFrame(tick);
    }
    update();
    raf = requestAnimationFrame(tick);
  }
  async function begin(edge, seek = null, restore = null) {
    busy = true;
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
      active = { edge, from, to, paint, priorFocus, priorStack };
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
    const prev = active ? { scene: active.from, focus: active.priorFocus, stack: active.priorStack } : history.pop();
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
  control('speed').onchange = (e) => {
    speed = Number(e.target.value);
  };
  const preferenceChanged = () => {
    if (active && reduced()) commit();
    else update();
  };
  control('reduce').onchange = (e) => {
    preference = e.target.value;
    sessionStorage.setItem('adg-player-reduced', preference);
    preferenceChanged();
  };
  media.addEventListener('change', preferenceChanged, { signal });
  control('spots').onclick = () => {
    spots = !spots;
    update();
  };
  function dispatch(event, on) {
    if (busy || committing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
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
    doc.addEventListener('scroll', hints, true);
    for (const [name, input] of [
      ['click', 'click'],
      ['pointerover', 'hover'],
      ['focusin', 'focus'],
      ['keydown', 'key']
    ])
      doc.addEventListener(
        name,
        (e) => {
          if (!dispatch(e, input) && !busy && !e.repeat && name === 'keydown' && e.key === 'Escape') {
            e.preventDefault();
            exit();
          }
        },
        true
      );
    for (const name of ['click', 'auxclick', 'submit', 'beforeinput', 'drop', 'dragstart', 'contextmenu'])
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
    control('exit').focus();
  } catch (err) {
    fail(err);
  }
}
