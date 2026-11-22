import { canonicalBytes } from './impact-proof.mjs';
import { relative } from './project.mjs';
import { parseTokens } from './tokens.mjs';
import { playbackEdge } from './play-endpoint.mjs';
import { timingRefs, transformRefs } from './motion.mjs';
import { assetStore, withFilmstrip } from './review-filmstrip.mjs';

const equal = (a, b) => canonicalBytes(a) === canonicalBytes(b);
const sides = ['before', 'after'];
const refKey = ref => JSON.stringify([ref.source, ref.frame]);

// Impact owns the per-revision indexes. Preserve incident IDs even when a failed
// source was removed from the static comparison inventory on both sides.
export function reviewEdgeCandidates({ views, motionIds, data, assessments }, theme) {
  const ids = new Set(motionIds);
  const failed = new Set(data.failures.map(f => f.source));
  for (const view of views) for (const { edge, valid } of view.motion.records) {
    if (!valid) continue;
    for (const ref of [edge.from, edge.to]) {
      if (failed.has(ref.source)) ids.add(edge.id);
      // Unassessed frames can change even without a lexical impact seed.
      const assessment = assessments.get(JSON.stringify([ref.source, ref.frame, theme]));
      if (assessment?.disposition !== 'render') continue;
      const [a, b] = views.map(v => v.built.get(ref.source));
      const [first, last] = [a, b].map(build => build?.frames.find(f => f.name === ref.frame));
      if (a?.css !== b?.css || first?.html !== last?.html || first?.width !== last?.width ||
        first?.height !== last?.height || first?.proposed !== last?.proposed) ids.add(edge.id);
    }
  }
  return [...ids].map(id => views.map(v => v.motion.ids.get(id)?.[0]));
}

function revision(view, side, store, failures, theme) {
  const tokens = parseTokens(view.tokenBytes.toString()), design = relative(view.config, view.config.design);
  const cache = new Map();
  const buildFailures = new Map(failures.filter(f => f.side === side).map(f => [f.source, f.message]));
  async function endpoint(ref) {
    const key = refKey(ref);
    if (cache.has(key)) return cache.get(key);
    if (buildFailures.has(ref.source)) throw Error(buildFailures.get(ref.source));
    const built = view.built.get(ref.source) ?? await view.index.materialize(ref.source);
    const frame = built.frames.find(f => f.name === ref.frame);
    if (!frame) throw Error('Missing frame ' + ref.frame);
    const result = { frame, hash: store.put({ frame: ref.frame, design, width: frame.width, height: frame.height,
      html: store.put(frame.html), styles: [built.cssBeforeTokens, built.tokenCss, built.cssAfterTokens].map(store.put) }) };
    cache.set(key, result);
    return result;
  }
  return async record => {
    if (!record) return;
    const { edge, owner } = record;
    let source = owner;
    try {
      if (!record.valid) throw Error('Invalid transition declaration: ' + edge.id);
      source = edge.from.source;
      const from = await endpoint(edge.from);
      source = edge.to.source;
      const to = await endpoint(edge.to);
      source = owner;
      const resolved = playbackEdge(edge, from.frame, tokens, theme, design);
      const timings = Object.fromEntries([...timingRefs(edge), ...transformRefs(edge)].map(({ name, pointer }) =>
        [name, resolved.timings[pointer] ?? resolved.transforms?.[pointer]]));
      return { from: from.hash, to: to.hash, edge: resolved,
        endpointStatus: [from.frame.proposed, to.frame.proposed].map(v => v ?? 'current'), timings };
    } catch (error) {
      if (!failures.some(f => f.source === source && f.side === side))
        failures.push({ source, side, code: 'SOURCE_BUILD_FAILED', message: error.message });
      return { edge, error: side + ' · ' + source + ' · ' + error.message };
    }
  };
}

export async function reviewMotion(session, candidates, model, comparisons, theme) {
  if (!candidates.length) return;
  const store = assetStore(), failures = model.failures;
  const readers = session.views.map((v, i) => revision(v, i === 0 ? 'base' : 'current', store, failures, theme));
  const moves = new Map([...model.movePairs, ...comparisons.filter(r => r.previousSource)].map(({before, after}) =>
    [refKey(before), {source: after.source, frame: after.frame}]));
  const relocate = ref => ref && (moves.get(refKey(ref)) ?? ref);
  // Qualify part selectors by a relocated source only when established moves
  // agree on its new owner. Frame references always use their exact pair.
  const owners = new Map();
  for (const [ref, to] of moves) {
    const [source] = JSON.parse(ref);
    if (!owners.has(source)) owners.set(source, new Set());
    owners.get(source).add(to.source);
  }
  const relocatePart = part => {
    const [source, name] = part.split('#');
    const paths = owners.get(source);
    return paths?.size === 1 ? [...paths][0] + '#' + name : part;
  };
  const normalize = edge => JSON.parse(JSON.stringify({ ...edge, from: relocate(edge.from), to: relocate(edge.to) },
    (key, value) => key === 'part' && typeof value === 'string' ? relocatePart(value) : value));
  const pending = [];
  for (const records of candidates) {
    const versions = await Promise.all(records.map((r, i) => readers[i](r)));
    const [a, b] = versions;
    if (a && b && !a.error && !b.error && a.from === b.from && a.to === b.to &&
        equal(a.endpointStatus, b.endpointStatus) && equal(a.edge, b.edge)) continue;
    pending.push({records, versions});
  }
  if (!pending.length) return;
  const cards = [];
  return withFilmstrip(theme, store, async renderer => {
    for (const {records, versions} of pending) {
      const [old, next] = records.map(r => r?.edge);
      const reasons = [], kind = !old ? 'added' : !next ? 'removed' : 'changed';
      const former = old && normalize(old);
      if (!equal(former, next)) reasons.push('Direct declaration');
      const [a, b] = versions;
      if (a?.error || b?.error) reasons.push('Incomplete endpoint');
      if (a?.timings && b?.timings) {
        const changed = Object.keys(a.timings).filter(k => k in b.timings && a.timings[k] !== b.timings[k]).sort();
        if (changed.length) reasons.push('Inherited timing · ' + changed.join(', '));
        if (equal(former.trigger, next.trigger) && a.edge.gesture !== b.edge.gesture) reasons.push('Inherited trigger name');
        if (!equal(a.endpointStatus, b.endpointStatus)) reasons.push('Inherited endpoint status');
        for (const end of ['from', 'to']) {
          if (a[end] === b[end] || !equal(relocate(old[end]), next[end])) continue;
          const first = await renderer.endpoint(a[end]), last = await renderer.endpoint(b[end]);
          const rows = first.rows.map(row => ({
            ...row, parts: row.parts.map(relocatePart),
            keys: row.keys.map(key => key.owner ? { ...key, owner: relocatePart(key.owner) } : key)
          }));
          if (first.image !== last.image || !equal(rows, last.rows)) reasons.push('Inherited ' + end + ' endpoint');
        }
      }
      if (!reasons.length) continue;
      const record = records[1] ?? records[0];
      const card = { id: record.edge.id, owner: record.owner, kind, reasons };
      for (const [i, version] of versions.entries()) {
        if (!version) continue;
        if (!version.error) {
          try { Object.assign(version, await renderer.filmstrip(version)); }
          catch (error) {
            const side = i === 0 ? 'base' : 'current', source = version.edge.from.source;
            version.error = side + ' · ' + source + ' · ' + error.message;
            failures.push({ source, side, code: 'SOURCE_BUILD_FAILED', message: error.message });
          }
        }
        card[sides[i]] = version;
      }
      cards.push(card);
    }
    if (!cards.length) return;
    cards.sort((a, b) => a.owner.localeCompare(b.owner,'en') || a.id.localeCompare(b.id,'en'));
    // Keep only assets referenced by final cards. Candidate observations are disposable.
    const live = new Set();
    for (const card of cards) for (const name of sides) {
      const side = card[name];
      if (!side?.samples) continue;
      for (const key of [side.from, side.to]) {
        const endpoint = store.assets[key];
        for (const id of [key, endpoint.html, ...endpoint.styles]) live.add(id);
      }
      for (const sample of side.samples) live.add(sample.image);
    }
    return { cards, assets: Object.fromEntries([...live].map(k => [k, store.assets[k]])), theme, script: renderer.script };
  });
}
