import path from 'node:path';
import { relative, sourceDirectories, sourceFeature } from './project.mjs';
import { frameOwners } from './source-facts.mjs';

function sourcePaths(config) {
  const design = relative(config, config.design), layers = sourceDirectories(config);
  const designPath = source => path.posix.relative(design, source);
  return { designPath, featurePath: source => sourceFeature(designPath(source), layers) };
}

/** Strongest relation wins. Only mutually unique endpoints pair within each tier. */
export async function pairFrameMoves(rows, inputs, fingerprint, themes = ['light', 'dark']) {
  const added = new Map(), pending = new Set();
  for (const row of rows) if (row.status === 'added') {
    const group = added.get(row.frame) ?? [];
    group.push(row);
    added.set(row.frame, group);
  }
  for (const old of rows) if (old.status === 'removed') {
    for (const current of added.get(old.frame) ?? []) {
      if (old.source !== current.source) pending.add({ old, current });
    }
  }
  if (!pending.size) return rows;

  const removed = new Set(), paired = new Map(), ambiguous = new Map();
  const addCandidate = (row, candidate) => {
    const candidates = ambiguous.get(row) ?? [];
    candidates.push({ source: candidate.source, frame: candidate.frame });
    ambiguous.set(row, candidates);
  };
  function resolve(related) {
    const candidates = [...pending].filter(({ old, current }) => related(old, current));
    const left = new Map(), right = new Map();
    for (const { old, current } of candidates) {
      left.set(old, (left.get(old) ?? 0) + 1);
      right.set(current, (right.get(current) ?? 0) + 1);
    }
    for (const { old, current } of candidates) {
      if (left.get(old) === 1 && right.get(current) === 1) {
        removed.add(old);
        paired.set(current, {
          ...current, before: old.before, previousSource: old.source, status: 'matched',
          matchKind: 'exact', matchCandidates: [],
          change: { kind: 'direct', causes: [old.source, current.source].sort() },
        });
      } else {
        addCandidate(old, current);
        addCandidate(current, old);
      }
    }
    // A weaker relation must not pick a winner among stronger ambiguous candidates.
    for (const edge of pending) if (left.has(edge.old) || right.has(edge.current)) pending.delete(edge);
  }

  const renames = new Map(inputs.renames?.map(rename => [rename.before, rename.after]));
  resolve((old, current) => renames.get(old.source) === current.source);
  if (pending.size) {
    const { designPath: oldPath, featurePath: oldFeature } = sourcePaths(inputs.before.config);
    const { designPath: newPath, featurePath: newFeature } = sourcePaths(inputs.after.config);
    resolve((old, current) => {
      const feature = newFeature(current.source);
      return feature !== newPath(current.source) && oldPath(old.source) === feature + '.tsx';
    });
    if (pending.size) {
      const owned = new Map();
      const partNames = (row, designPath, featurePath, frame) => {
        if (!owned.has(row)) {
          const source = designPath(row.source), feature = featurePath(row.source);
          const owners = frame.owners ?? frameOwners(frame.html ?? '');
          owned.set(row, new Set(owners.filter(owner =>
            owner.source === source || (feature !== source && owner.source.startsWith(feature + '/')),
          ).map(owner => owner.export)));
        }
        return owned.get(row);
      };
      resolve((old, current) => {
        const before = partNames(old, oldPath, oldFeature, old.before);
        const after = partNames(current, newPath, newFeature, current.after);
        return [...before].some(name => after.has(name));
      });
    }
  }
  if (pending.size) {
    const candidates = () => [...new Set([...pending].flatMap(({ old, current }) => [old, current]))];
    const first = await fingerprint(candidates(), themes[0]);
    for (const edge of pending) {
      if (first.get(edge.old) === undefined || first.get(edge.old) !== first.get(edge.current)) pending.delete(edge);
    }
    if (pending.size) {
      const second = await fingerprint(candidates(), themes[1]);
      resolve((old, current) => second.get(old) !== undefined && second.get(old) === second.get(current));
    }
  }
  const identity = ({ source, frame }) => JSON.stringify([source, frame]);
  const moved = new Set([...removed, ...paired.keys()].map(identity));
  return rows.flatMap(row => {
    if (removed.has(row)) return [];
    if (paired.has(row)) return [paired.get(row)];
    const candidates = new Map(row.matchCandidates.map(candidate => [identity(candidate), candidate]).filter(([key]) => !moved.has(key)));
    for (const candidate of ambiguous.get(row) ?? []) candidates.set(identity(candidate), candidate);
    if (!ambiguous.has(row) && candidates.size === row.matchCandidates.length) return [row];
    return [{ ...row, matchCandidates: [...candidates.values()], matchKind: candidates.size ? 'renamed_or_unknown' : 'unmatched' }];
  });
}
