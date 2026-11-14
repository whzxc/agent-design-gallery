export const contains = (box, x, y) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
export function frameBox(asset, part) {
  const crop = asset.shown[0];
  return {x:asset.x + part.x - crop.x, y:asset.y + part.y - crop.y, width:part.width, height:part.height};
}
export function hitSelection(assets, x, y, elements = true) {
  for (const asset of [...assets].reverse()) {
    if (!contains(asset, x, y)) continue;
    const crop = asset.shown[0];
    const part = asset.parts.find(p => (asset.component || p.id === crop.id) && contains(frameBox(asset,p), x,y));
    if (!part) return {asset, part:asset.component ? null : asset.parts.find(p=>p.id===crop.id)};
    const box = frameBox(asset,part);
    const element = elements ? [...(part.elements ?? [])].reverse().find(e => contains(e,x-box.x,y-box.y)) : null;
    return {asset, part, element};
  }
  return null;
}
export function exportFrames(asset, owner) {
  return (asset?.parts ?? []).filter(part => part.elements?.some(element => (element.owners ?? []).some(o => o.source === owner.source && o.export === owner.export)));
}
