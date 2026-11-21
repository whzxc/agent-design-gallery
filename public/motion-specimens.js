import { dataFetch } from './auth.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value));
const shapes = stage => [...stage.querySelectorAll('[data-motion-shape]')];
function parameters(stage) {
  const dark = stage.closest('[data-theme="dark"]');
  return JSON.parse(stage.dataset.preview)[dark ? 'dark' : 'light'];
}

function states(effect, on, off, index) {
  const opacity = (a, b) => [{ opacity: a }, { opacity: b }];
  const transform = (from, to, a = 1, b = 1) => [
    { transform: from, opacity: a }, { transform: to, opacity: b },
  ];
  switch (effect) {
    case 'expand': return [{ height: '2px', opacity: off.opacity }, { height: '58px', opacity: 1 }];
    case 'size': return [{ width: '40px', height: '24px' }, { width: '105px', height: '66px' }];
    case 'slide': return transform('translateX(' + (off.distance ?? '20px') + ')', 'translateX(0)', off.opacity);
    case 'pop': return transform('scale(' + off.scale + ')', 'scale(1)', off.opacity);
    case 'stagger': return transform('translateY(' + (off.distance ?? '20px') + ')', 'translateY(0)', off.opacity);
    case 'crossfade': return opacity(index ? 0 : 1, index ? 1 : 0);
    case 'pulse': return transform('scale(' + on.scale + ')', 'scale(1)', .35);
    default: return opacity(off.opacity, 1);
  }
}

function animateStage(stage) {
  const { enter, exit } = parameters(stage);
  const effect = stage.dataset.effect;
  if (effect === 'follow' || reduced.matches) return [];
  if (effect === 'avoid') {
    return shapes(stage).slice(1).map((node, i) => node.animate([
      { transform: 'translateY(0)', offset: 0, easing: enter.easing },
      { transform: 'translateY(' + (i ? 12 : -12) + 'px)', offset: .35, easing: exit.easing },
      { transform: 'translateY(' + (i ? 12 : -12) + 'px)', offset: .55, easing: exit.easing },
      { transform: 'translateY(0)', offset: .85 },
      { transform: 'translateY(0)', offset: 1 },
    ], { duration: enter.duration + exit.duration + 850, iterations: Infinity }));
  }
  if (['aurora','shimmer','spin'].includes(effect)) {
    const aurora = effect === 'aurora';
    const animated = stage.querySelector(aurora ? '[data-motion-aurora]' : '[data-motion-shape]');
    const frames = effect !== 'shimmer' ? [{transform:'rotate(0turn)'},{transform:'rotate(1turn)'}]
      : [{backgroundPosition:'100% 0'},{backgroundPosition:'0% 0'}];
    return [animated.animate(frames, { duration: Math.max(1, enter.duration), easing: enter.easing, iterations: Infinity })];
  }
  if (effect === 'pulse' && stage.dataset.action === 'loop') {
    return shapes(stage).map(node => node.animate([
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(' + enter.scale + ')', opacity: .35 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: Math.max(1, enter.duration), easing: enter.easing, iterations: Infinity }));
  }
  const first = stage.dataset.action === 'exit' ? exit : enter;
  const second = stage.dataset.action === 'exit' ? enter : exit;
  const pulse = effect === 'pulse';
  const hold = pulse ? 0 : 450;
  const stagger = effect === 'stagger' ? first.stagger : 0;
  const total = Math.max(1, first.duration + second.duration + 2 * hold + 2 * stagger);
  return shapes(stage).map((node, i) => {
    const [from, to] = states(effect, first, first, i);
    const [exitFrom, exitTo] = states(effect, second, second, i);
    const reverse = stage.dataset.action === 'exit';
    const start = reverse ? to : from, end = reverse ? from : to;
    const returnStart = reverse ? exitFrom : exitTo, returnEnd = reverse ? exitTo : exitFrom;
    const delay = i * stagger;
    return node.animate([
      { ...start, offset: 0 },
      { ...start, offset: delay / total, easing: first.easing },
      { ...end, offset: (delay + first.duration) / total },
      { ...returnStart, offset: (delay + first.duration + hold) / total, easing: second.easing },
      { ...returnEnd, offset: (delay + first.duration + hold + second.duration) / total },
      { ...returnEnd, offset: 1 },
    ], { duration: total, iterations: Infinity });
  });
}

function openDialog(title, body) {
  const dialog = document.createElement('dialog');
  dialog.className = 'motion-consumer-dialog';
  dialog.setAttribute('aria-label', title);
  const heading = document.createElement('h2');
  heading.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.onclick = () => dialog.close();
  dialog.append(heading, body, close);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}
async function showCode(link) {
  const content = document.createElement('pre');
  content.textContent = 'Loading…';
  openDialog(link.textContent, content);
  try {
    const response = await dataFetch(link.href);
    if (!response.ok) throw new Error('Source location is unavailable.');
    const { lines, line } = await response.json();
    for (const [number, source] of lines) {
      const row = document.createElement(number === line ? 'mark' : 'span');
      row.textContent = number + '  ' + source + '\n';
      content.append(row);
    }
    content.firstChild.remove();
  } catch (error) { content.textContent = error.message; }
}

export function installMotionSpecimens(board) {
  const mounted = new Map();
  const visible = new Set();
  const points = new WeakMap();
  const running = new WeakMap();
  const manualAvoid = new WeakSet();
  function sync(stage) {
    for (const animation of mounted.get(stage) ?? []) animation.cancel();
    mounted.set(stage, visible.has(stage) && !manualAvoid.has(stage) ? animateStage(stage) : []);
  }
  const intersection = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!mounted.has(target)) continue;
      if (isIntersecting) visible.add(target);
      else visible.delete(target);
      sync(target);
    }
  });
  const mount = () => {
    for (const [stage, animations] of mounted) if (!board.contains(stage)) {
      for (const animation of animations) animation.cancel();
      intersection.unobserve(stage);
      mounted.delete(stage);
      visible.delete(stage);
    }
    for (const stage of board.querySelectorAll('[data-motion-stage]')) if (!mounted.has(stage)) {
      mounted.set(stage, []);
      intersection.observe(stage);
    }
  };
  // Token markup is replaced as a unit. Camera updates never recreate specimens.
  new MutationObserver(mount).observe(board, { childList: true });
  const reset = () => {
    for (const stage of mounted.keys()) {
      sync(stage);
      for (const node of shapes(stage)) running.get(node)?.cancel();
      if (stage.dataset.effect === 'follow' && reduced.matches) {
        shapes(stage)[0].style.removeProperty('transform');
        points.delete(stage);
      }
    }
  };
  reduced.addEventListener('change', reset);
  new MutationObserver(reset).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mount();

  function follow(stage, x, y) {
    const node = shapes(stage)[0];
    const from = getComputedStyle(node).transform;
    const to = 'translate(' + x + 'px,' + y + 'px)';
    node.style.transform = to;
    running.get(node)?.cancel();
    points.set(stage, [x,y]);
    if (!reduced.matches) {
      const { duration, easing } = parameters(stage).enter;
      running.set(node, node.animate([{ transform: from }, { transform: to }], { duration, easing }));
    }
  }
  board.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-motion-pattern] button, [data-effect=follow]')) event.stopPropagation();
  });
  board.addEventListener('pointermove', event => {
    const stage = event.target.closest('[data-effect=follow]');
    if (!stage || reduced.matches) return;
    const box = stage.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width - .5) * (stage.clientWidth - 20);
    const y = ((event.clientY - box.top) / box.height - .5) * (stage.clientHeight - 20);
    follow(stage, x, y);
  });
  board.addEventListener('keydown', event => {
    const stage = event.target.closest('[data-effect=follow]');
    const steps = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
    if (!stage || !Object.hasOwn(steps, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (reduced.matches) return;
    const [x,y] = points.get(stage) ?? [0,0];
    const [dx,dy] = steps[event.key];
    const maxX = (stage.clientWidth - 20) / 2, maxY = (stage.clientHeight - 20) / 2;
    follow(stage, clamp(x + dx * 12, -maxX, maxX), clamp(y + dy * 12, -maxY, maxY));
  });
  board.addEventListener('click', event => {
    const card = event.target.closest('[data-motion-pattern]');
    if (!card) return;
    const avoid = event.target.closest('[data-motion-avoid]');
    if (avoid) {
      event.stopPropagation();
      const stage = card.querySelector('[data-motion-stage]');
      const [sibling, ...others] = shapes(stage);
      const first = others.map(node => {
        const transform = getComputedStyle(node).transform;
        return node.offsetTop + (transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42);
      });
      manualAvoid.add(stage);
      sync(stage);
      const insert = sibling.hidden;
      sibling.hidden = !insert;
      avoid.setAttribute('aria-pressed', String(insert));
      avoid.textContent = insert ? 'Remove sibling' : 'Insert sibling';
      const { duration, easing } = parameters(stage)[insert ? 'enter' : 'exit'];
      others.forEach((node, i) => {
        running.get(node)?.cancel();
        if (!reduced.matches) running.set(node, node.animate([
          { transform: 'translateY(' + (first[i] - node.offsetTop) + 'px)' }, { transform: 'translateY(0)' },
        ], { duration, easing }));
      });
    }
    const consumers = event.target.closest('[data-motion-consumers]');
    if (consumers) {
      event.stopPropagation();
      openDialog(card.querySelector('h3').textContent + ' consumers', card.querySelector('template').content.cloneNode(true));
    }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-motion-code]');
    if (!link) return;
    event.preventDefault();
    void showCode(link);
  });
}
