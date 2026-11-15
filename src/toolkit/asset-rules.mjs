import { isFeatureEntry, sourceFeature } from './project.mjs';

// Production sources are ordered from lower to higher layers. Studies are explorations.
export function importDirectionViolations(graph, sources, { strictLayers = false } = {}) {
  const production=sources.filter(name=>name!=='studies'), rank=new Map(production.map((name,index)=>[name,index])), moduleLayer=production.length >= 3 ? production[1] : null, topLayer=production.at(-1);
  const violations=[];
  for (const source of Object.keys(graph).sort()) {
    const from=source.split('/')[0];
    if (!rank.has(from)) continue;
    for (const target of [...new Set(graph[source].uses)].sort()) {
      const to=target.split('/')[0];
      if (!rank.has(to)) continue;
      const sameLayer=rank.get(to)===rank.get(from), crossFeature=sameLayer && rank.get(from)===rank.get(moduleLayer) && sourceFeature(source,sources)!==sourceFeature(target,sources);
      const surfaceInternal=from===topLayer && to===moduleLayer && !isFeatureEntry(target,sources);
      const sameLayerViolation=sameLayer && rank.get(from)>0 && (rank.get(from)!==rank.get(moduleLayer) || crossFeature);
      if (rank.get(to)>rank.get(from) || (strictLayers && (sameLayerViolation || surfaceInternal))) {
        violations.push({source,target,from,to,sameLayer,featureBoundary:crossFeature||surfaceInternal});
      }
    }
  }
  return violations;
}

// A component is a library asset only when distinct higher-layer sources reach it.
// Walk the resolved source graph backwards so component-to-component indirection
// and feature/surface transitive use are counted without treating its own frames
// as consumers.
export function singleConsumerComponents(graph, sources, partsBySource) {
  const production = sources.filter(name => name !== 'studies');
  const rank = new Map(production.map((name, index) => [name, index]));
  const reverse = new Map();
  for (const [source, row] of Object.entries(graph)) for (const target of new Set(row.uses ?? [])) {
    const list = reverse.get(target) ?? []; list.push(source); reverse.set(target, list);
  }
  const warnings = [];
  for (const [source, parts] of Object.entries(partsBySource)) {
    const layer = source.split('/')[0];
    if (layer !== production[0] || !rank.has(layer)) continue;
    for (const part of parts) {
      const consumers = new Set();
      const queue = [source], seen = new Set([source]);
      while (queue.length) for (const importer of reverse.get(queue.shift()) ?? []) {
        if (seen.has(importer)) continue;
        seen.add(importer);
        const importerLayer = importer.split('/')[0];
        if (importerLayer === layer) queue.push(importer);
        else if (rank.has(importerLayer) && rank.get(importerLayer) > rank.get(layer)) consumers.add(sourceFeature(importer, sources));
      }
      if (consumers.size < 2) warnings.push({ code: 'SINGLE_CONSUMER_COMPONENT', source, part, consumers: [...consumers].sort(), message: `${source}#${part} is reached by ${consumers.size} distinct higher-layer source${consumers.size === 1 ? '' : 's'}; move it back to its feature or add another feature consumer` });
    }
  }
  return warnings;
}
