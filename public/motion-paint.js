import { matchRoots, candidates } from './motion-identity.js';

const properties = ['x', 'y', 'width', 'height', 'opacity'];
const blend = (a, b, t) => a + (b - a) * t;
function unique(rows, target) {
  const found = candidates(rows, target);
  if (found.length !== 1) throw Error('Unresolved playback target ' + JSON.stringify(target));
  return found[0];
}

// Each paint root has its own frame-coordinate layer. Nested roots are cut out of
// the parent copy, so their composed world transform is applied exactly once.
export function preparePaint(stage, from, to, edge, pin) {
  const doc = stage.ownerDocument,
    tracks = [],
    boundaries = [],
    clocks = new Map(),
    oldClaim = new Set(),
    newClaim = new Set();
  const layer = doc.createElement('div');
  layer.inert = true;
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  const sheet = layer.attachShadow({ mode: 'open' });
  const delay = edge.timings['/delay'] ?? 0;
  if (delay) boundaries.push(delay);
  const defaultTime = { start: delay, duration: edge.timings['/duration'], easing: edge.timings['/easing'] };
  let start = delay,
    total = 0;
  function add(left, right, mode, props, time, fromOpacity, transform) {
    let track = mode === 'match' && tracks.find((t) => t.mode === 'match' && t.left === left && t.right === right);
    if (!track) {
      track = { left, right, mode, props: {}, fromOpacity, transform };
      tracks.push(track);
    }
    for (const prop of props) track.props[prop] = time;
    if (left) oldClaim.add(left.i);
    if (right) newClaim.add(right.i);
  }
  const covered = (rows, claimed) =>
    new Set(
      rows
        .filter((row) => {
          for (let r = row; r; r = rows[r.parent]) if (claimed.has(r.i)) return true;
          return false;
        })
        .map((r) => r.i)
    );
  const subtrees = { from: new Set(), to: new Set() };
  for (const target of edge.instant ?? []) {
    const left = unique(from, target), right = unique(to, target);
    add(left, right, 'cut', [], defaultTime);
    subtrees.from.add(left.i);
    subtrees.to.add(right.i);
  }
  edge.phases.forEach((phase, i) => {
    let length = 0;
    phase.forEach((t, j) => {
      const path = '/phases/' + i + '/' + j,
        time = {
          start,
          duration: edge.timings[path + '/duration'] ?? defaultTime.duration,
          easing: edge.timings[path + '/easing'] ?? defaultTime.easing
        };
      length = Math.max(length, time.duration);
      for (const target of t.targets) {
        const left = t.mode === 'enter' && !candidates(from, target).length ? null : unique(from, target);
        const right = t.mode === 'exit' ? null : unique(to, target);
        const transform = t.transform && resolveTransform(t.mode === 'exit' ? left : right, t.transform, path);
        add(left, right, t.mode, t.properties, time, t.fromOpacity, transform);
        if (t.mode !== 'match') {
          if (left) subtrees.from.add(left.i);
          if (right) subtrees.to.add(right.i);
        }
      }
    });
    start += length;
    boundaries.push(start);
  });
  total = start;
  const excluded = { from: covered(from, subtrees.from), to: covered(to, subtrees.to) };
  const { pairs, ambiguous } = matchRoots(from, to, excluded);
  function implicit(left, right, mode) {
    add(left, right, mode, properties, defaultTime);
    if (
      !left ||
      !right ||
      left.text !== right.text ||
      left.opacity !== right.opacity ||
      left.box.some((v, i) => v !== right.box[i])
    )
      total = Math.max(total, delay + defaultTime.duration);
  }
  if (pin) {
    const left = candidates(from, pin), right = candidates(to, pin);
    if (left.length === 1 && right.length === 1 &&
        !oldClaim.has(left[0].i) && !newClaim.has(right[0].i) &&
        !excluded.from.has(left[0].i) && !excluded.to.has(right[0].i))
      implicit(left[0], right[0], 'match');
  }
  for (const pair of pairs)
    if (!oldClaim.has(pair.from) && !newClaim.has(pair.to)) implicit(from[pair.from], to[pair.to], 'match');
  for (const [rows, claimed, skip, side] of [
    [from, oldClaim, excluded.from, 'from'],
    [to, newClaim, excluded.to, 'to']
  ]) {
    for (const r of rows)
      if (r.parts.length && !claimed.has(r.i) && !skip.has(r.i))
        implicit(side === 'from' ? r : null, side === 'to' ? r : null, side === 'from' ? 'exit' : 'enter');
  }
  // Keep the unowned endpoint shell and its decorations in the composition.
  if (!newClaim.has(0)) add(oldClaim.has(0) ? null : from[0], to[0], 'match', [], defaultTime);
  const oldRoots = new Set(tracks.flatMap((t) => (t.left ? [t.left.i] : []))),
    newRoots = new Set(tracks.flatMap((t) => (t.right ? [t.right.i] : [])));
  function picture(rows, row, roots) {
    const host = doc.createElement('div'),
      shadow = host.attachShadow({ mode: 'open' }),
      styles = [],
      runs = new Map();
    Object.assign(host.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: row.box[2] + 'px',
      height: row.box[3] + 'px',
      transformOrigin: '0 0',
      pointerEvents: 'none'
    });
    if (row.clip.some((x) => x > 0)) host.style.clipPath = 'inset(' + row.clip.map((x) => x + 'px').join(' ') + ')';
    function copy(r, path) {
      const node = r.paint.cloneNode(false);
      if (r.pseudos.length) {
        node.dataset.paintNode = r.i;
        for (const { pseudo, css } of r.pseudos)
          styles.push('[data-paint-node="' + r.i + '"]::' + pseudo + '{' + css + '}');
      }
      for (const [index, child] of r.children.entries()) {
        const key = path + '.' + index;
        if (typeof child === 'string') {
          const text = doc.createTextNode(child);
          node.append(text);
          const run = r.runs.find((v) => v.index === index);
          if (run) runs.set(key, { ...run, textNode: text, style: r.paint.style });
        } else if (!roots.has(child)) node.append(copy(rows[child], key));
        else {
          const spacer = rows[child].paint.cloneNode(false);
          spacer.style.visibility = 'hidden';
          node.append(spacer);
        }
      }
      return node;
    }
    const content = copy(row, '');
    Object.assign(content.style, {
      position: 'absolute',
      margin: '0',
      inset: 'auto',
      left: '0',
      top: '0',
      opacity: '1',
      transformOrigin: '0 0'
    });
    // Transform the local paint inside the measured world-space rectangle.
    const m = DOMMatrix.fromMatrix(row.matrix),
      [w, h] = row.localSize;
    const corners = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h]
    ].map(([x, y]) => m.transformPoint({ x, y }));
    m.e -= Math.min(...corners.map((p) => p.x));
    m.f -= Math.min(...corners.map((p) => p.y));
    content.style.transform = m.toString();
    shadow.append(content);
    if (styles.length) {
      const style = doc.createElement('style');
      style.textContent = styles.join('');
      shadow.append(style);
    }
    return { host, content, runs };
  }
  function glyph(run) {
    if (!run) return;
    const spacer = doc.createElement('span');
    spacer.style.visibility = 'hidden';
    run.textNode.replaceWith(spacer);
    spacer.append(run.textNode);
    const node = doc.createElement('span');
    for (const prop of run.style)
      if (/^(font|text|line-height|letter-spacing|word-|white-space|direction|writing-mode|color)/.test(prop))
        node.style.setProperty(prop, run.style.getPropertyValue(prop));
    Object.assign(node.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      margin: '0',
      pointerEvents: 'none',
      width: run.box[2] + 0.5 + 'px',
      lineHeight: run.style.lineHeight
    });
    node.textContent = run.text;
    sheet.append(node);
    return node;
  }
  // Underlays precede their children even when explicitly choreographed later.
  tracks.sort((a, b) => (a.right?.i ?? a.left.i) - (b.right?.i ?? b.left.i));
  const alpha = (rows, row) => {
    let opacity = 1;
    for (let p = row; p; p = rows[p.parent]) opacity *= p.opacity;
    return opacity;
  };
  for (const t of tracks) {
    const { left, right } = t;
    if (left && t.mode !== 'cut') {
      t.old = picture(from, left, oldRoots);
      t.oldAlpha = alpha(from, left);
    }
    if (right) {
      t.next = picture(to, right, newRoots);
      t.newAlpha = alpha(to, right);
    }
    t.flat =
      left &&
      right &&
      (!left.box[2] || !left.box[3] || !right.box[2] || !right.box[3] || left.clipped || right.clipped);
    if (t.old && (t.mode !== 'match' || t.flat || !t.next)) sheet.append(t.old.host);
    if (t.next) sheet.append(t.next.host);
    t.text = [];
    if (t.mode === 'match' && t.old && t.next && !t.flat) {
      if (delay) {
        // The interpolation copies below replace some text with detached glyphs.
        t.hold = picture(from, left, oldRoots);
        sheet.insertBefore(t.hold.host, t.next.host);
      }
      for (const key of new Set([...t.old.runs.keys(), ...t.next.runs.keys()])) {
        const a = t.old.runs.get(key),
          b = t.next.runs.get(key);
        const unchanged = a?.text === b?.text;
        if (unchanged && left.box[2] === right.box[2] && left.box[3] === right.box[3]) continue;
        t.text.push({ a, b, unchanged, old: unchanged ? null : glyph(a), next: glyph(b) });
      }
    }
  }
  const original = stage.style.opacity;
  stage.style.opacity = '0';
  doc.body.append(layer);
  function progress(time, ms) {
    if (!time) return 1;
    if (ms < time.start) return 0;
    if (!time.duration || ms >= time.start + time.duration) return 1;
    let anim = clocks.get(time.easing);
    if (!anim) {
      anim = new doc.defaultView.Animation(
        new doc.defaultView.KeyframeEffect(null, [], { duration: 1, easing: time.easing, fill: 'both' }),
        doc.timeline
      );
      clocks.set(time.easing, anim);
    }
    anim.currentTime = (ms - time.start) / time.duration;
    return anim.effect.getComputedTiming().progress;
  }
  function draw(picture, base, box, opacity) {
    const node = picture?.host;
    if (!node?.parentNode) return;
    const sx = base[2] ? box[2] / base[2] : 1,
      sy = base[3] ? box[3] / base[3] : 1;
    node.style.transform = 'translate(' + box[0] + 'px,' + box[1] + 'px) scale(' + sx + ',' + sy + ')';
    node.style.opacity = String(Math.min(1, Math.max(0, opacity)));
  }
  function resolveTransform(row, track, path) {
    const axis = track.axis === 'x' ? 0 : 1;
    const distance = edge.transforms[path + '/transform/distance'];
    let translation = 0;
    if (distance) {
      const number = Number.parseFloat(distance);
      const pixels = distance.endsWith('%') ? number * row.localSize[axis] / 100
        : distance.endsWith('rem') ? number * Number.parseFloat(doc.defaultView.getComputedStyle(doc.documentElement).fontSize)
        : distance.endsWith('em') ? number * Number.parseFloat(row.paint.style.fontSize) : number;
      translation = (axis === 0 ? 1 : -1) * pixels;
    }
    return { axis, translation, scale: edge.transforms[path + '/transform/scale'] ?? 1 };
  }
  function offsetBox(row, transform, amount) {
    if (!transform) return row.box;
    const box = [...row.box];
    box[transform.axis] += transform.translation * amount;
    const scale = blend(1, transform.scale, amount);
    box[2] *= scale;
    box[3] *= scale;
    return box;
  }
  return {
    duration: total,
    boundaries,
    fallback: [
      ...(tracks.some(t => t.mode === 'match' && t.flat) ? ['Opacity fallback for clipped or degenerate geometry'] : []),
      ...(ambiguous.length ? [ambiguous.length + ' ambiguous match groups fade independently'] : [])
    ].join(' · ') || null,
    seek(fraction) {
      const ms = fraction * total;
      stage.style.opacity = fraction === 1 ? original : '0';
      layer.style.visibility = fraction === 1 ? 'hidden' : 'visible';
      for (const t of tracks) {
        const { left, right, mode } = t;
        if (mode === 'cut') {
          draw(t.next, right.box, right.box, t.newAlpha);
          continue;
        }
        const time = Object.values(t.props)[0] ?? defaultTime;
        const p = progress(t.props.opacity ?? time, ms),
          started = ms >= time.start;
        if (mode === 'match' && left && right) {
          if (t.flat) {
            draw(t.old, left.box, left.box, t.oldAlpha * (1 - p));
            draw(t.next, right.box, right.box, t.newAlpha * p);
            continue;
          }
          if (t.hold) {
            draw(t.hold, left.box, left.box, started ? 0 : t.oldAlpha);
            if (!started) {
              draw(t.next, right.box, right.box, 0);
              for (const run of t.text) {
                if (run.old) run.old.style.opacity = '0';
                if (run.next) run.next.style.opacity = '0';
              }
              continue;
            }
          }
          const box = right.box.map((v, i) =>
            blend(left.box[i], v, t.props[properties[i]] ? progress(t.props[properties[i]], ms) : Number(started))
          );
          const opacity = blend(t.oldAlpha, t.newAlpha, t.props.opacity ? p : Number(started));
          draw(t.next, right.box, box, opacity);
          // Move only the changed glyph runs. Their shell, icon and border keep full paint.
          for (const run of t.text) {
            const pos = [0, 1].map((i) => {
              const first = run.a ? run.a.box[i] - left.box[i] : run.b.box[i] - right.box[i];
              const last = run.b ? run.b.box[i] - right.box[i] : first;
              return box[i] + blend(first, last, p);
            });
            for (const [node, amount] of [
              [run.old, 1 - p],
              [run.next, run.unchanged ? 1 : p]
            ])
              if (node) {
                node.style.transform = 'translate(' + pos[0] + 'px,' + pos[1] + 'px)';
                node.style.opacity = String(opacity * amount);
              }
          }
        } else {
          if (left) {
            const box = mode === 'exit' ? offsetBox(left, t.transform, p) : left.box;
            const alpha = mode === 'enter' ? Number(!started) : t.props.opacity ? 1 - p : Number(p < 1);
            draw(t.old, left.box, box, t.oldAlpha * alpha);
          }
          if (right) {
            const first = (t.fromOpacity ?? 0) * (t.right.opacity ? t.newAlpha / t.right.opacity : 1);
            draw(
              t.next,
              right.box,
              mode === 'enter' ? offsetBox(right, t.transform, 1 - p) : right.box,
              (mode === 'match' && !delay) || (started && !t.props.opacity) ? t.newAlpha : started ? blend(first, t.newAlpha, p) : 0
            );
          }
        }
      }
    },
    dispose() {
      stage.style.opacity = original;
      layer.remove();
      for (const a of clocks.values()) a.cancel();
    }
  };
}

// A caller owns the clock. Painting always seeks the frozen pair by absolute progress.
export function playTimeline(duration, initial, speed, draw, finish) {
  const origin = performance.now();
  let raf;
  function tick(now) {
    const p = Math.min(1, initial + Math.max(0, now - origin) * speed / duration);
    draw(p);
    if (p === 1) finish();
    else raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
