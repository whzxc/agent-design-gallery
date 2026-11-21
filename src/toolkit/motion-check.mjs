import path from 'node:path';
import { loadFrame } from './browser.mjs';
import { buildSource } from './build.mjs';
import { listSources, relative, loadTokens, sourceDirectories, isFeatureInternal } from './project.mjs';
import { resolveMotionToken, timingRefs } from './motion.mjs';

// Runs inside the frame observation page. Indexes are local to this one observation.
function observe(design) {
  const shell = document.querySelector('[data-adg-frame]').firstElementChild;
  const elements = [shell, ...shell.querySelectorAll('*')],
    indexes = new Map(elements.map((el, i) => [el, i]));
  function hit(el, rect) {
    let left = Math.max(0, rect.left),
      top = Math.max(0, rect.top),
      right = Math.min(innerWidth, rect.right),
      bottom = Math.min(innerHeight, rect.bottom);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p),
        bounds = p.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
        left = Math.max(left, bounds.left);
        right = Math.min(right, bounds.right);
      }
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
        top = Math.max(top, bounds.top);
        bottom = Math.min(bottom, bounds.bottom);
      }
    }
    if (right <= left || bottom <= top) return false;
    return [0.5, 0.01, 0.99].some((x) =>
      [0.5, 0.01, 0.99].some((y) =>
        el.contains(document.elementFromPoint(left + (right - left) * x, top + (bottom - top) * y))
      )
    );
  }
  const rows = elements.map((el, i) => {
    const parts = JSON.parse(el.dataset.adgOwners ?? '[]').map((o) => design + '/' + o.source + '#' + o.export);
    const keys = JSON.parse(el.dataset.adgKeys ?? '[]');
    const rect = el.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
      el.getClientRects().length > 0;
    return {
      i,
      parent: indexes.get(el.parentElement) ?? -1,
      parts,
      keys,
      anchor: el.dataset.adgId ?? null,
      box: [rect.x, rect.y, rect.width, rect.height],
      exposed: visible && !el.closest('[inert],[aria-hidden="true"]'),
      pointer: visible && hit(el, rect),
      disabled: el.matches(':disabled,[aria-disabled="true"]'),
      focusable: false,
      keyboard: false
    };
  });
  // Ask the browser so native controls such as summary and tabindex=-1 behave as authored.
  for (const row of rows) {
    const el = elements[row.i];
    if (row.exposed && !row.disabled && (el.tabIndex >= 0 || el.hasAttribute('tabindex') || el.isContentEditable)) {
      el.focus({ preventScroll: true });
      row.focusable = document.activeElement === el;
      if (row.focusable) el.blur();
    }
  }
  for (const row of rows.toReversed()) {
    row.keyboard ||= row.focusable;
    if (row.parent >= 0 && row.keyboard) rows[row.parent].keyboard = true;
  }
  return rows;
}

function chain(rows, row) {
  const result = [];
  for (let r = row; r; r = rows[r.parent]) result.push(r);
  return result;
}
function matchRoots(from, to, excluded = { from: new Set(), to: new Set() }) {
  function roots(rows, skip) {
    return rows
      .filter((r) => r.parts.length && !skip.has(r.i))
      .map((row) => {
        const scope = chain(rows, row)
          .reverse()
          .flatMap((r) => r.keys.map((k) => [r.parts, k.owner ?? null, k.key, k.root ?? null]));
        return { row, key: JSON.stringify([row.parts, scope]), scope };
      });
  }
  const left = roots(from, excluded.from),
    right = roots(to, excluded.to),
    a = new Map(),
    b = new Map(),
    pairs = [];
  const matches = (roots, rows, matched) => {
    const groups = new Map();
    for (const root of roots) {
      if (matched.has(root.row.i)) continue;
      const parent = chain(rows, rows[root.row.parent]).find((p) => matched.has(p.i));
      const key = JSON.stringify([root.key, parent ? matched.get(parent.i) : null]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(root);
    }
    return groups;
  };
  let ambiguous = [];
  for (;;) {
    const old = matches(left, from, a),
      next = matches(right, to, b);
    const before = pairs.length;
    ambiguous = [];
    for (const [key, group] of old) {
      const other = next.get(key);
      if (!other) continue;
      if (group.length !== 1 || other.length !== 1) {
        ambiguous.push({ part: group[0].row.parts.at(-1), from: group.length, to: other.length });
        continue;
      }
      const f = group[0],
        t = other[0],
        id = pairs.length;
      pairs.push({ from: f.row.i, to: t.row.i, parts: f.row.parts, keys: f.scope });
      a.set(f.row.i, id);
      b.set(t.row.i, id);
    }
    if (before === pairs.length) {
      const conflicts = [];
      for (const [side, roots] of [
        ['from', left],
        ['to', right]
      ]) {
        const siblings = new Set();
        for (const { row, key } of roots) {
          if (!row.keys.length) continue;
          const local = JSON.stringify([row.parent, key]);
          if (siblings.has(local)) conflicts.push({ side, part: row.parts.at(-1) });
          siblings.add(local);
        }
      }
      const limitations = pairs.flatMap((p) =>
        [from[p.from], to[p.to]].some((r) => !r.box[2] || !r.box[3]) ? [{ from: p.from, to: p.to, reason: 'empty_box' }] : []
      );
      return {
        pairs,
        ambiguous,
        conflicts,
        limitations,
        counts: {
          match: pairs.length,
          enter: right.length - b.size,
          exit: left.length - a.size,
          ambiguous: ambiguous.length
        }
      };
    }
  }
}

export function instanceKeyMatches(ancestors, key) {
  // An explicit instance key shadows the containing list's or slot's key.
  return ancestors.find((row) => row.keys?.length)?.keys.some((k) => k.key === key) ?? false;
}
function candidates(rows, target) {
  if (target.frame) return rows.slice(0, 1);
  if (target.anchor) return rows.filter((r) => r.anchor === target.anchor);
  return rows.filter(
    (r) => r.parts.includes(target.part) && (target.key === undefined || instanceKeyMatches(chain(rows, r), target.key))
  );
}

export function motionEvaluator(
  config,
  { getPage, getBuild, bindings = [], hasMap = false, themes = ['light', 'dark'] } = {}
) {
  const builds = new Map(),
    observations = new Map(),
    dispatch = new Map();
  const layers = sourceDirectories(config).filter((s) => s !== 'studies'),
    top = layers.at(-1);
  const inventory = new Set(listSources(config.design, sourceDirectories(config)).map((f) => relative(config, f)));
  const tokens = loadTokens(config);
  async function frameAt(ref) {
    if (!inventory.has(ref.source)) return;
    if (!builds.has(ref.source))
      builds.set(
        ref.source,
        getBuild?.(ref.source) ?? buildSource(config, path.join(config.root, ref.source), { write: false })
      );
    return (await builds.get(ref.source)).frames.find((f) => f.name === ref.frame);
  }
  async function observeFrame(ref, frame, theme) {
    const key = JSON.stringify([ref.source, ref.frame, theme]);
    if (!observations.has(key)) {
      const page = await getPage();
      await loadFrame(page, frame, theme);
      observations.set(key, await page.evaluate(observe, relative(config, config.design)));
    }
    return observations.get(key);
  }
  return async function evaluate(record) {
    const { edge: e, owner } = record,
      problems = new Map(),
      detail = {
        edge: e,
        themes: {},
        bound: bindings.some((b) => b.active && b.design.source === owner && b.design.transition === e.id)
      };
    function issue(code, at, message, theme = null, warning = false) {
      const pointer = record.pointer + at,
        key = JSON.stringify([code, pointer, message]);
      const found = problems.get(key);
      if (found) {
        if (found.theme !== theme) found.theme = null;
        return;
      }
      problems.set(key, {
        code,
        pointer,
        source: record.source,
        transition: e.id,
        frame: e.from.frame,
        theme,
        warning,
        message,
        ...(record.locations[pointer] ?? record.locations[record.pointer])
      });
    }
    const designPath = (ref) => path.relative(config.design, path.join(config.root, ref)).split(path.sep).join('/');
    const layer = (ref) => designPath(ref).split('/')[0];
    if (
      owner !== e.from.source ||
      !layers.includes(layer(owner)) || isFeatureInternal(designPath(owner), layers) ||
      (owner !== e.to.source && !(layer(owner) === top && layer(e.to.source) === top))
    )
      issue('MOTION_LAYER', '/from', 'Declare this edge on its public origin entry. Only surfaces can cross sources.');
    const from = await frameAt(e.from),
      to = await frameAt(e.to);
    for (const [side, f] of [
      ['from', from],
      ['to', to]
    ]) {
      if (!f) issue('MOTION_FRAME_MISSING', '/' + side, 'Missing endpoint ' + e[side].source + '#' + e[side].frame);
      else if (f.proposed && f.proposed !== e.proposed)
        issue('MOTION_STATUS', '/' + side, 'Endpoint proposal scope differs from the edge.');
    }
    if (hasMap && config.check?.lifecycle && !e.proposed && !detail.bound)
      issue('MOTION_BINDING', '/id', 'Current action needs an active implementation binding.');
    for (const [i, u] of (e.unsupported ?? []).entries())
      issue('MOTION_UNSUPPORTED', '/unsupported/' + i, u.effect + ': ' + u.reason, null, true);
    for (const theme of themes) {
      const times = {};
      for (const { pointer, kind, name } of timingRefs(e)) {
        times[pointer] = resolveMotionToken(tokens, theme, name, kind).value;
        if (times[pointer] === null)
          issue(
            'MOTION_TOKEN',
            pointer,
            'Expected a project ' + kind + ' token, got ' + JSON.stringify(name ?? null),
            theme
          );
      }
      if (!from || !to) continue;
      const rows = { from: await observeFrame(e.from, from, theme), to: await observeFrame(e.to, to, theme) };
      const matched = matchRoots(rows.from, rows.to);
      for (const conflict of matched.conflicts)
        issue(
          'MOTION_IDENTITY_AMBIGUOUS',
          '/phases',
          conflict.side + ' repeats an authored instance key for ' + conflict.part + '.',
          theme
        );
      const resolved = [];
      function resolve(side, target, at, missing = 'MOTION_TARGET_MISSING') {
        const list = candidates(rows[side], target);
        if (list.length === 1) {
          resolved.push({ side, target, index: list[0].i });
          return list[0];
        }
        issue(
          list.length ? 'MOTION_IDENTITY_AMBIGUOUS' : missing,
          at,
          side + ' ' + JSON.stringify(target) + ' resolved to ' + list.length + ' elements.',
          theme
        );
      }
      const t = resolve('from', e.trigger.target, '/trigger/target', 'MOTION_TRIGGER_MISSING');
      if (t) {
        if (
          !t.exposed ||
          t.disabled ||
          (['click', 'hover'].includes(e.trigger.on) && !t.pointer) ||
          (e.trigger.on === 'focus' && !t.focusable) ||
          (e.trigger.on === 'key' && !e.trigger.target.frame && !t.keyboard)
        )
          issue('MOTION_TRIGGER_MISSING', '/trigger', 'Origin cannot receive ' + e.trigger.on + '.', theme);
        const k = JSON.stringify([e.from.source, e.from.frame, theme, t.i, e.trigger.on, e.trigger.key]);
        if (dispatch.has(k) && dispatch.get(k) !== e.id)
          issue('MOTION_TRIGGER_CONFLICT', '/trigger', 'Input also dispatches ' + dispatch.get(k) + '.', theme);
        else dispatch.set(k, e.id);
      }
      if (e.focus.target) {
        const f = resolve('to', e.focus.target, '/focus/target', 'MOTION_FOCUS');
        if (f && (!f.exposed || f.disabled || (!f.focusable && !e.focus.target.frame)))
          issue('MOTION_FOCUS', '/focus', 'Destination cannot receive focus.', theme);
      }
      const claims = { from: [], to: [] },
        tracks = [];
      let start = 0;
      for (const [i, phase] of e.phases.entries()) {
        let length = 0;
        for (const [j, track] of phase.entries()) {
          const at = '/phases/' + i + '/' + j,
            duration = times[at + '/duration'] ?? times['/duration'];
          tracks.push({ phase: i, track: j, start, duration, easing: times[at + '/easing'] ?? times['/easing'] });
          length = Math.max(length, duration ?? 0);
          for (const [n, target] of track.targets.entries()) {
            const found = {};
            const sides =
              track.mode === 'exit'
                ? ['from']
                : track.mode === 'enter' && !candidates(rows.from, target).length
                  ? ['to']
                  : ['from', 'to'];
            for (const side of sides) {
              const p = at + '/targets/' + n,
                row = resolve(side, target, p);
              if (!row) continue;
              found[side] = row;
              const subtree = track.mode !== 'match',
                ancestors = chain(rows[side], row);
              for (const prev of claims[side]) {
                if (
                  prev.row === row
                    ? track.properties.some((v) => prev.props.includes(v))
                    : (prev.subtree && ancestors.includes(prev.row)) ||
                      (subtree && chain(rows[side], prev.row).includes(row))
                )
                  issue('MOTION_TRACK_CONFLICT', p, 'Overlapping track claims on ' + side + ' endpoint.', theme);
              }
              claims[side].push({ row, subtree, props: track.properties });
            }
            if (
              track.mode === 'match' &&
              found.from?.parts.length &&
              found.to &&
              !matched.pairs.some((p) => p.from === found.from.i && p.to === found.to.i)
            )
              issue(
                'MOTION_IDENTITY_AMBIGUOUS',
                at,
                'Match track needs the same resolved owner instance in both endpoints.',
                theme
              );
          }
        }
        start += length;
      }
      const excluded = { from: new Set(), to: new Set() };
      for (const side of ['from', 'to']) {
        const subtrees = new Set(claims[side].filter((c) => c.subtree).map((c) => c.row.i));
        for (const row of rows[side]) if (subtrees.has(row.i) || excluded[side].has(row.parent)) excluded[side].add(row.i);
      }
      const implicit = excluded.from.size || excluded.to.size ? matchRoots(rows.from, rows.to, excluded) : matched;
      if (implicit.ambiguous.length)
        issue(
          'MOTION_IMPLICIT_FADE',
          '/phases',
          implicit.ambiguous.length + ' ambiguous owner groups use fades.',
          theme,
          true
        );
      detail.themes[theme] = { timings: times, tracks, targets: resolved, ...implicit };
    }
    if (detail.themes.dark && JSON.stringify(detail.themes.light) === JSON.stringify(detail.themes.dark))
      detail.themes.dark = { sameAs: 'light' };
    return { detail, findings: [...problems.values()] };
  };
}
