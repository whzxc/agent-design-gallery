import {matchRoots,candidates,chain} from '../../public/motion-identity.js';
import { flowLayout } from '../../public/motion-flow.js';
import { frameKey } from './motion-flows.mjs';
import { nativeTextEntry } from '../../public/motion-scene.js';
export {instanceKeyMatches} from '../../public/motion-identity.js';
import path from 'node:path';
import { loadFrame } from './browser.mjs';
import { buildSource } from './build.mjs';
import { listSources, relative, loadTokens, sourceDirectories, isFeatureInternal } from './project.mjs';
import { resolveMotionToken, timingRefs } from './motion.mjs';

// Runs inside the frame observation page. Indexes are local to this one observation.
function observe({ design, nativeTextEntry }) {
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
    let limitation=null;
    for(let p=el;p && !limitation;p=p.parentElement){
      const style=getComputedStyle(p),b=p.getBoundingClientRect();
      if(style.transform!=='none' && !Number.isFinite(new DOMMatrix(style.transform).inverse().a))limitation='non_invertible';
      else if(style.clipPath!=='none' || p!==el && (
        /hidden|clip|auto|scroll/.test(style.overflowX) && (rect.left<b.left || rect.right>b.right) ||
        /hidden|clip|auto|scroll/.test(style.overflowY) && (rect.top<b.top || rect.bottom>b.bottom)))limitation='clipped';
    }
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
      limitation,
      exposed: visible && !el.closest('[inert],[aria-hidden="true"]'),
      pointer: visible && hit(el, rect),
      disabled: el.matches(':disabled,[aria-disabled="true"]'),
      textEntry: !el.readOnly && (el.matches(nativeTextEntry) || (el.hasAttribute('contenteditable') && el.isContentEditable)),
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

export function motionEvaluator(
  config,
  { getPage, getBuild, bindings = [], hasMap = false, flows = new Map(), themes = ['light', 'dark'] } = {}
) {
  const builds = new Map(),
    observations = new Map(),
    dispatch = new Map(),
    layouts = new Map();
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
      const { x, y, width, height } = await loadFrame(page, frame, theme);
      const rows = await page.evaluate(observe, { design: relative(config, config.design), nativeTextEntry });
      observations.set(key, { box: [x, y, width, height], rows });
    }
    return observations.get(key);
  }
  async function layoutFor(flow, theme) {
    if (!layouts.has(flow)) layouts.set(flow, new Map());
    const byTheme = layouts.get(flow);
    if (!byTheme.has(theme)) {
      const frames = [];
      for (const ref of flow.frames) {
        const frame = await frameAt(ref);
        if (!frame) break;
        frames.push(await observeFrame(ref, frame, theme));
      }
      byTheme.set(theme, frames.length === flow.frames.length ? flowLayout(flow, frames) : null);
    }
    return byTheme.get(theme);
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
      const observed = { from: await observeFrame(e.from, from, theme), to: await observeFrame(e.to, to, theme) };
      const rows = { from: observed.from.rows, to: observed.to.rows };
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
        if (e.trigger.on === 'input' && (!t.textEntry || !t.focusable))
          issue('MOTION_INPUT_TARGET', '/trigger/target', 'Input requires an editable text-entry control.', theme);
        if (
          !t.exposed ||
          t.disabled ||
          (['click', 'hover'].includes(e.trigger.on) && !t.pointer) ||
          (e.trigger.on === 'focus' && !t.focusable) ||
          (e.trigger.on === 'key' && !e.trigger.target.frame && !t.keyboard)
        )
          issue('MOTION_TRIGGER_MISSING', '/trigger', 'Origin cannot receive ' + e.trigger.on + '.', theme);
        const k = JSON.stringify([e.from.source, e.from.frame, theme, t.i, e.trigger.on, e.trigger.key ?? e.trigger.value]);
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
              claims[side].push({ row, subtree, mode: track.mode, props: track.properties, duration });
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
      const flow = flows.get(frameKey(e.from));
      if (flow) {
        const layout = await layoutFor(flow, theme);
        const fromIndex = flow.frames.findIndex((ref) => frameKey(ref) === frameKey(e.from));
        const toIndex = flow.frames.findIndex((ref) => frameKey(ref) === frameKey(e.to));
        const warning = !config.check?.strictMotion;
        if (!layout?.pin)
          issue('MOTION_FLOW_ANCHOR', '/trigger/target', flow.anchor
            ? 'Flow anchor must resolve to one nonempty box in every member frame.'
            : 'No trigger target is present uniquely across the flow. Playback uses an unpinned stage.', theme, warning);
        if (layout && flow.stage && (layout.width > flow.stage.width + 0.01 || layout.height > flow.stage.height + 0.01))
          issue('MOTION_FLOW_STAGE', '/to', 'Flow stage is smaller than the aligned frame union.', theme, warning);
        if (layout?.pin) {
          const { boxes } = layout.pin;
          if ([2, 3].some(axis => Math.abs(boxes[fromIndex][axis] - boxes[toIndex][axis]) > 0.01))
            issue('MOTION_FLOW_ANCHOR', '/to', 'The persistent flow anchor changes size.', theme, warning);
        }
        const positions = ['from', 'to'].map((side, i) => {
          const offset = layout?.offsets[i ? toIndex : fromIndex] ?? [0, 0];
          return offset.map((value, axis) => value - observed[side].box[axis]);
        });
        checkComposition(rows, matched.pairs, excluded, claims, positions,
          (code, message) => issue(code, '/phases', message, theme, warning));
      }
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

function checkComposition(rows, pairs, excluded, claims, positions, issue) {
  const active = (row) => row.box[2] > 0 && row.box[3] > 0;
  const identity = (row) => row.anchor ? '#' + row.anchor : row.parts.at(-1);
  const matched = { from: new Set(), to: new Set() };
  const compare = (left, right) => {
    if (!active(left) || !active(right)) return;
    matched.from.add(left.i);
    matched.to.add(right.i);
    const axes = ['x', 'y'].filter((axis, i) =>
      Math.abs(left.box[i] + positions[0][i] - right.box[i] - positions[1][i]) > 0.01 &&
      !claims.from.some((claim) => claim.row === left && claim.mode === 'match' &&
        claim.props.includes(axis) && claim.duration > 0));
    if (axes.length) issue('MOTION_UNANIMATED_MOVE', identity(left) + ' moves on ' + axes.join('/') + ' without a position track.');
  };
  const replaced = (side, row) => excluded[side].has(row.i) &&
    !claims[side].some((claim) => claim.subtree && claim.row === row);
  for (const pair of pairs) {
    const left = rows.from[pair.from], right = rows.to[pair.to];
    if (!replaced('from', left) && !replaced('to', right)) compare(left, right);
  }
  const anchors = new Set([...rows.from, ...rows.to].flatMap((row) => row.anchor ? [row.anchor] : []));
  for (const anchor of anchors) {
    const [left, right] = ['from', 'to'].map((side) => candidates(rows[side], { anchor }));
    if (left.length === 1 && right.length === 1 &&
        !matched.from.has(left[0].i) && !matched.to.has(right[0].i) &&
        !replaced('from', left[0]) && !replaced('to', right[0])) compare(left[0], right[0]);
  }
  for (const side of ['from', 'to']) {
    const uncovered = new Set();
    for (const row of rows[side]) {
      if (uncovered.has(row.parent)) {
        uncovered.add(row.i);
        continue;
      }
      if (!identity(row) || !active(row) || matched[side].has(row.i) || excluded[side].has(row.i)) continue;
      uncovered.add(row.i);
      issue('MOTION_UNANIMATED_PRESENCE', identity(row) + ' appears only on ' + side +
        ' without ' + (side === 'from' ? 'an exit' : 'an enter') + ' track.');
    }
  }
}
