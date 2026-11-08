// Production sources are ordered from lower to higher layers. Studies are explorations.
export function importDirectionViolations(graph, sources) {
  const rank=new Map(sources.filter(name=>name!=='studies').map((name,index)=>[name,index]));
  const violations=[];
  for (const source of Object.keys(graph).sort()) {
    const from=source.split('/')[0];
    if (!rank.has(from)) continue;
    for (const target of [...new Set(graph[source].uses)].sort()) {
      const to=target.split('/')[0];
      if (rank.has(to) && rank.get(to)>rank.get(from)) violations.push({source,target,from,to});
    }
  }
  return violations;
}
