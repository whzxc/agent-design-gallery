import path from 'node:path';
import { relative, sourceDirectories, sourceFeature } from './project.mjs';
import { frameOwners } from './source-facts.mjs';

function sourcePaths(config) {
  const design = relative(config, config.design), layers = sourceDirectories(config);
  const designPath = source => path.posix.relative(design, source);
  return { designPath, featurePath: source => sourceFeature(designPath(source), layers) };
}

function sourceRelations(inputs) {
  const renames = new Map(inputs.renames?.map(rename => [rename.before, rename.after]));
  const before = sourcePaths(inputs.before.config), after = sourcePaths(inputs.after.config);
  const owned = new Map();
  const partNames = (row, { designPath, featurePath }, frame) => {
    if (!owned.has(row)) {
      const source = designPath(row.source), feature = featurePath(row.source);
      const owners = frame.owners ?? frameOwners(frame.html ?? '');
      owned.set(row, new Set(owners.filter(owner =>
        owner.source === source || (feature !== source && owner.source.startsWith(feature + '/')),
      ).map(owner => owner.export)));
    }
    return owned.get(row);
  };
  return [
    (old, current) => renames.get(old.source) === current.source,
    (old, current) => {
      const feature = after.featurePath(current.source);
      return feature !== after.designPath(current.source) && before.designPath(old.source) === feature + '.tsx';
    },
    (old, current) => {
      const currentParts = partNames(current, after, current.after);
      return [...partNames(old, before, old.before)].some(name => currentParts.has(name));
    },
  ];
}

/** Strongest relation wins. Only mutually unique endpoints pair within each tier. */
export async function pairFrameMoves(rows, inputs, fingerprint, themes = ['light', 'dark']) {
  const additions = rows.filter(row => row.status === 'added');
  const removals = rows.filter(row => row.status === 'removed');
  if (!additions.length || !removals.length) return rows;
  const added = new Map(), pending = new Set();
  for (const row of additions) {
    const group = added.get(row.frame) ?? [];
    group.push(row);
    added.set(row.frame, group);
  }
  for (const old of removals) {
    for (const current of added.get(old.frame) ?? []) {
      if (old.source !== current.source) pending.add({ old, current });
    }
  }
  const removed = new Set(), paired = new Map(), ambiguous = new Map();
  const addCandidate = (row, candidate) => {
    const candidates = ambiguous.get(row) ?? [];
    candidates.push({ source: candidate.source, frame: candidate.frame });
    ambiguous.set(row, candidates);
  };
  function resolve(edges, related) {
    const candidates = [...edges].filter(({ old, current }) => related(old, current));
    const left = new Map(), right = new Map();
    for (const { old, current } of candidates) {
      left.set(old, (left.get(old) ?? 0) + 1);
      right.set(current, (right.get(current) ?? 0) + 1);
    }
    for (const { old, current } of candidates) {
      if (left.get(old) === 1 && right.get(current) === 1) {
        removed.add(old);
        paired.set(current, {
          ...current, before: old.before, previousSource: old.source, previousFrame: old.frame, status: 'matched',
          matchKind: 'exact', matchCandidates: [],
          change: { kind: 'direct', causes: [old.source, current.source].sort() },
        });
      } else {
        addCandidate(old, current);
        addCandidate(current, old);
      }
    }
    // A weaker relation must not pick a winner among stronger ambiguous candidates.
    for (const edge of edges) if (left.has(edge.old) || right.has(edge.current)) edges.delete(edge);
  }

  const relations = sourceRelations(inputs);
  const fingerprints = new Map(themes.map(theme => [theme, new Map()]));
  async function capture(candidates, theme) {
    const saved = fingerprints.get(theme);
    const missing = [...new Set(candidates)].filter(row => !saved.has(row));
    if (missing.length) {
      const captured = await fingerprint(missing, theme);
      for (const row of missing) saved.set(row, captured.get(row));
    }
    return saved;
  }
  const endpoints = edges => [...edges].flatMap(({ old, current }) => [old, current]);
  const identical = saved => (old, current) => saved.get(old) !== undefined && saved.get(old) === saved.get(current);

  for (const related of relations) resolve(pending, related);
  if (pending.size) {
    const sameFirst = identical(await capture(endpoints(pending), themes[0]));
    for (const edge of pending) if (!sameFirst(edge.old, edge.current)) pending.delete(edge);
    if (pending.size) resolve(pending, identical(await capture(endpoints(pending), themes[1])));
  }

  const oldUnpaired = removals.filter(row => !removed.has(row));
  const currentUnpaired = additions.filter(row => !paired.has(row));
  if (oldUnpaired.length && currentUnpaired.length) {
    const first = await capture([...oldUnpaired, ...currentUnpaired], themes[0]);
    const byRender = new Map();
    for (const current of currentUnpaired) {
      const key = first.get(current);
      if (key === undefined) continue;
      const group = byRender.get(key) ?? [];
      group.push(current);
      byRender.set(key, group);
    }
    const renamed = new Set();
    for (const old of oldUnpaired) {
      for (const current of byRender.get(first.get(old)) ?? []) {
        if (old.frame !== current.frame) renamed.add({ old, current });
      }
    }
    if (renamed.size) {
      const sameSecond = identical(await capture(endpoints(renamed), themes[1]));
      for (const edge of renamed) if (!sameSecond(edge.old, edge.current)) renamed.delete(edge);
      for (const related of relations) resolve(renamed, related);
      resolve(renamed, () => true);
    }
  }
  const identity = ({ source, frame }) => JSON.stringify([source, frame]);
  const moved = new Set([...removed, ...paired.keys()].map(identity));
  return rows.flatMap(row => {
    if (removed.has(row)) return [];
    if (paired.has(row)) return [paired.get(row)];
    const entries = [...row.matchCandidates, ...(ambiguous.get(row) ?? [])];
    const candidates = new Map(entries.map(candidate => [identity(candidate), candidate]).filter(([key]) => !moved.has(key)));
    if (!ambiguous.has(row) && candidates.size === row.matchCandidates.length) return [row];
    return [{ ...row, matchCandidates: [...candidates.values()], matchKind: candidates.size ? 'renamed_or_unknown' : 'unmatched' }];
  });
}
