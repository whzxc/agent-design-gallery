// Assets carry direct source imports resolved by the toolkit's bundler.
export function sourceRelationships(assets) {
  const graph = Object.fromEntries(assets.filter(a => a.path.endsWith('.tsx')).map(a => [a.path, { uses: [], usedBy: [] }]));
  for (const asset of assets) {
    const node = graph[asset.path];
    if (!node) continue;
    node.uses = [...new Set(asset.imports ?? [])].filter(name => Object.hasOwn(graph, name)).sort();
    for (const name of node.uses) graph[name].usedBy.push(asset.path);
  }
  for (const node of Object.values(graph)) node.usedBy.sort();
  return graph;
}

// Breadth-first traversal keeps one shortest, deterministic route per source.
export function relatedSources(graph, source, direction = 'uses') {
  const seen = new Set([source]), result = [], queue = [{path:source, via:[]}];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const name of [...(graph[current.path]?.[direction] ?? [])].sort()) {
      if (seen.has(name)) continue;
      seen.add(name);
      const via = current.path === source ? [] : [...current.via, current.path];
      result.push({path:name, direct:via.length === 0, via});
      queue.push({path:name, via});
    }
  }
  return result.sort((a,b) => Number(b.direct)-Number(a.direct) || a.path.localeCompare(b.path));
}
