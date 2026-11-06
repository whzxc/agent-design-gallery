export function matchTexts(design, implementation) {
  const candidates = design.flatMap((d, di) => implementation.flatMap((i, ii) => d.text === i.text ? [{di,ii,distance:Math.hypot(d.x-i.x,d.y-i.y)}] : [])).sort((a,b)=>a.distance-b.distance);
  const usedD=new Set(), usedI=new Set(), pairs=[];
  for (const {di,ii} of candidates) if (!usedD.has(di) && !usedI.has(ii)) { usedD.add(di); usedI.add(ii); pairs.push([design[di],implementation[ii]]); }
  return {pairs,missing:design.filter((_,i)=>!usedD.has(i)),extra:implementation.filter((_,i)=>!usedI.has(i))};
}

// Compares the anchored edge, vertical center and width of a paired text.
export function textDelta(design, implementation) {
  const edge = box => design.anchor === 'middle' ? box.x + box.width / 2 : design.anchor === 'end' ? box.x + box.width : box.x;
  return { dx: edge(implementation) - edge(design), dy: (implementation.y + implementation.height / 2) - (design.y + design.height / 2), dw: implementation.width - design.width };
}
