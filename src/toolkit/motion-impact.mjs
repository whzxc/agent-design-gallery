import { canonicalBytes } from './impact-proof.mjs';
import { motionRows } from './motion.mjs';
import { targetsFor, usesTiming } from './motion-queries.mjs';
import { parseTokens } from './tokens.mjs';

export function impactedEdges(views, query, themes, assessments, explain) {
  const git = query.kind === 'git',
    ids = new Set(views.flatMap((v) => [...v.motion.ids.keys()]));
  const output = [];
  const tokenMaps = new Map();
  const tokens = (v) => {
    if (!tokenMaps.has(v)) tokenMaps.set(v, parseTokens(v.tokenBytes.toString()));
    return tokenMaps.get(v);
  };
  for (const id of [...ids].sort()) {
    const reasons = new Set(),
      records = views.map((v) => motionRows(v.motion.ids.get(id) ?? [])[0]);
    let kind = 'candidate';
    if (git) {
      kind = !records[0] ? 'added' : !records[1] ? 'removed' : 'changed';
      const declaration = (r) => r && canonicalBytes({ owner: r.owner, edge: r.edge });
      if (declaration(records[0]) !== declaration(records[1])) reasons.add('declaration');
      const selectors = views.map((v) =>
        canonicalBytes(
          v.map.mappings
            .filter((m) => m.design.some((d) => d.transition === id))
            .map((m) => canonicalBytes(m.implementation))
            .sort()
        )
      );
      if (
        views[0].config.check?.lifecycle !== views[1].config.check?.lifecycle ||
        views[0].map.present !== views[1].map.present
      )
        reasons.add('binding');
      if (selectors[0] !== selectors[1]) reasons.add('binding');
    }
    views.forEach((view, i) => {
      const r = records[i];
      if (!r) return;
      if (view.motionBindingHits?.has(id)) reasons.add('binding');
      if (query.kind === 'source' && !query.part && query.sources.includes(r.source)) reasons.add('declaration');
      if (!r.valid) return;
      const edge = r.edge;
      if (
        (query.kind === 'token' || git) &&
        view.motionTokenHits?.some((hit) => usesTiming(edge, tokens(view), [hit.token], hit.themes))
      )
        reasons.add('timing_token');
      for (const side of ['from', 'to']) {
        const ref = edge[side],
          facts = view.facts.get(ref.source),
          frame = facts?.frames.find((f) => f.name === ref.frame);
        if (git) {
          const prior = views[1 - i].facts.get(ref.source)?.frames.find((f) => f.name === ref.frame);
          if (frame?.proposed !== prior?.proposed) reasons.add('endpoint');
        }
        if (query.kind === 'source' && query.part) {
          if (
            frame?.parts.some((p) => p.source === query.sources[0] && p.part === query.part) ||
            targetsFor(edge, side).some((t) => t.part === query.sources[0] + '#' + query.part)
          )
            reasons.add('part');
          continue;
        }
        if (query.kind === 'source' && query.sources.includes(ref.source)) reasons.add('endpoint');
        if (
          themes.some((theme) => {
            const a = assessments.get(JSON.stringify([ref.source, ref.frame, theme]));
            return a?.candidate && (!git || a.disposition !== 'proven_unaffected');
          })
        )
          reasons.add('endpoint');
      }
    });
    if (reasons.size) output.push({ id, kind, ...(explain ? { reasons: [...reasons].sort() } : {}) });
  }
  return output;
}
