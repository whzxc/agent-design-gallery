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
