import { dataFetch } from './auth.js';
import { collectViewerElements } from './frame-identity.js';
import { blockForAsset, componentWrapWidth, layoutWorld, specimenPaintCrop } from "./layout.js";
// Measure declared SVG content in an isolated, script-disabled document.
export const metadataContext = () => `specimen-bleed-v2-comments|${navigator.userAgent}|${devicePixelRatio}`;
export function measuredMetadata(asset) {
  const {format,full,component,parts,background,imports,frameRanges}=asset;
  return {format,full,component,parts,background,imports,frameRanges};
}
export function previewAddress(asset,theme,crop) {
  const query=new URLSearchParams({theme,context:metadataContext(),crop});
  return `preview/${asset.hash}?${query}`;
}

export async function prepare(asset, theme, {signal} = {}) {
  const frameQuery = asset.onlyFrame && /\.(tsx|mmd)$/.test(asset.path) ? `&frame=${encodeURIComponent(asset.onlyFrame)}` : '';
  const response = await dataFetch(
    `asset/${encodeURIComponent(asset.path)}?theme=${theme}&v=${encodeURIComponent(asset.version)}${frameQuery}`,
    {signal},
  );
  if(response.status===409)throw Object.assign(Error('Source rebuild superseded'),{name:'AbortError'});
  if (!response.ok) {
    const problem = frameQuery && (await response.json().catch(() => null))?.error;
    throw new Error(problem || `Cannot load ${asset.path}`);
  }
  const source = await response.text();
  if (/\.(tsx|mmd)$/.test(asset.path)) {
    const built=JSON.parse(source);
    return prepareSource({...asset,hash:built.hash??asset.hash,version:built.hash??asset.version},built,theme,signal);
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText =
    "position:fixed;left:-100000px;top:0;width:2000px;height:2000px;visibility:hidden";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`SVG measurement timed out: ${asset.path}`)),
        10000,
      );
      frame.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      frame.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Cannot measure ${asset.path}`));
      };
      frame.srcdoc = `<!doctype html><html data-theme="${theme}"><body style="margin:0">${source}</body></html>`;
      document.body.append(frame);
    });
    const root = frame.contentDocument.querySelector("svg");
    if (!root) throw new Error(`Invalid SVG: ${asset.path}`);
    const vb = root.viewBox.baseVal;
    const full = {
      x: vb.x,
      y: vb.y,
      width: vb.width || root.width.baseVal.value || 300,
      height: vb.height || root.height.baseVal.value || 150,
    };
    const component = root.dataset.design === "component";
    const selector = component
      ? "g[data-component][data-form]"
      : 'g[data-part^="frame-"]';
    const nodes = [...root.querySelectorAll(selector)].filter(
      (e) => !e.parentElement.closest(selector),
    );
    const parts = nodes
      .map((e, index) => {
        const b = e.getBBox(),
          m = root.getScreenCTM().inverse().multiply(e.getScreenCTM());
        const points = [
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x, b.y + b.height],
          [b.x + b.width, b.y + b.height],
        ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
        const x = Math.min(...points.map((p) => p.x)),
          y = Math.min(...points.map((p) => p.y));
        return {
          id: String(index),
          name: e.dataset.form || e.dataset.part.replace(/^frame-/, ""),
          x,
          y,
          width: Math.max(...points.map((p) => p.x)) - x,
          height: Math.max(...points.map((p) => p.y)) - y,
        };
      })
      .filter((p) => p.width > 0 && p.height > 0);
    return {
      ...asset,
      source,
      full,
      component,
      parts,
      background: frame.contentWindow
        .getComputedStyle(root)
        .getPropertyValue("--canvas")
        .trim(),
    };
  } finally {
    frame.remove();
  }
}
// Retain one stylesheet in the bounded in-memory source cache. Individual
// crops restore that exact stylesheet before XML parsing, so their bytes match.
export function compactPreparedSource(asset) {
  if(asset.format!=='tsx'||!asset.frameRanges?.length||asset.frameRanges.length<2)return asset;
  const frames=asset.frameRanges.map(([start,end])=>asset.source.slice(start,end));
  const sheets=frames.map(frame=>[...frame.matchAll(/<style>[\s\S]*?<\/style>/g)]);
  if(sheets.some(styles=>styles.length!==1)||sheets.some(styles=>styles[0][0]!==sheets[0][0][0]))return asset;
  const shared=sheets[0][0][0],comment='<style>/* shared stylesheet */</style>';
  const pieces=[asset.source.slice(0,asset.frameRanges[0][0])],frameRanges=[];
  let offset=pieces[0].length;
  const sharedStyleRange=[offset+sheets[0][0].index,offset+sheets[0][0].index+shared.length];
  for(const [index,frame] of frames.entries()) {
    const content=index?frame.replace(shared,comment):frame;
    frameRanges.push([offset,offset+content.length]);pieces.push(content);offset+=content.length;
  }
  pieces.push(asset.source.slice(asset.frameRanges.at(-1)[1]));
  return {...asset,source:pieces.join(''),frameRanges,sharedStyleRange};
}

export function imageURL(asset, crop, onSource) {
  const endPreview = globalThis.__adgTiming?.span('preview-generation', asset.path, {crop:crop?.id});
  if (!crop)
    return URL.createObjectURL(
      new Blob([asset.source], { type: "image/svg+xml" }),
    );
  // TSX preparation records the exact character range of each top-level frame.
  // Parse only the requested frame instead of reparsing all its siblings.
  const range = typeof crop.id === 'string' && /^\d+$/.test(crop.id) && asset.frameRanges?.[crop.id];
  let fragment=range?asset.source.slice(...range):null;
  if(range&&asset.sharedStyleRange)
    fragment=fragment.replace('<style>/* shared stylesheet */</style>',asset.source.slice(...asset.sharedStyleRange));
  const source = range
    ? asset.source.slice(0, asset.frameRanges[0][0]) + fragment + '</svg>'
    : asset.source;
  const doc = new DOMParser().parseFromString(source, "image/svg+xml"),
    root = doc.documentElement;
  if (asset.format === 'tsx' && ['overview','full'].includes(crop.id)) {
    const styles = [...root.querySelectorAll('style')];
    // Prepared TSX sets repeat the same generated stylesheet in every frame.
    // Keep the elements and nonempty text for structural selectors, but submit
    // its CSS rules only once. Authored or differing styles keep their cascade.
    if (styles.length > 1 && styles.length === asset.parts.length &&
        styles.every(style => !style.attributes.length && style.textContent === styles[0].textContent)) {
      for (const style of styles.slice(1)) style.textContent = '/* shared stylesheet */';
    }
  }
  if (crop.id !== "full")
    for (const note of root.querySelectorAll(":scope > text.note"))
      note.remove();
  if (!range && /^\d+$/.test(crop.id)) {
    const selector = asset.component
      ? "g[data-component][data-form]"
      : 'g[data-part^="frame-"]';
    const nodes = [...root.querySelectorAll(selector)].filter(
      (e) => !e.parentElement.closest(selector),
    );
    nodes.forEach((node, index) => {
      if (String(index) !== crop.id) node.remove();
    });
  }
  root.setAttribute(
    "viewBox",
    `${crop.x} ${crop.y} ${crop.width} ${crop.height}`,
  );
  root.setAttribute("width", crop.width);
  root.setAttribute("height", crop.height);
  const rendered=new XMLSerializer().serializeToString(doc);
  onSource?.(rendered);
  const url = URL.createObjectURL(new Blob([rendered], {type:"image/svg+xml"}));
  endPreview?.();
  return url;
}

// Keep current visible previews and a small LRU of offscreen previews. Identity
// includes theme and source version so visible paths cannot pin stale generations.
export function evictPreviews(cache, activeKeys) {
  if (cache.size <= 100) return;
  for (const entry of [...cache.values()].sort((a, b) => a.used - b.used)) {
    if (cache.size <= 80) break;
    if (!activeKeys.has(entry.key)) cache.delete(entry.key);
  }
}

export function groupAssets(data) {
  const layerOf = asset => asset.layer ?? (asset.path.includes('/') ? asset.path.split('/')[0] : 'Design');
  const byPath = new Map(data.assets.map(asset => [asset.path, asset]));
  const used = new Set(), grouped = [];
  const add = (group, assets, key) => {
    const layers = new Map();
    for (const asset of assets) {
      const layer = layerOf(asset);
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer).push(asset);
    }
    for (const [layer, members] of layers) grouped.push({ ...group, key: `${key}:${layer}`, layer, assets: members });
  };
  for (const [index, group] of (data.groups ?? []).entries()) {
    const assets = group.assets.flatMap(path => {
      const asset = byPath.get(path);
      if (!asset || used.has(path)) return [];
      used.add(path);
      return [asset];
    });
    add(group, assets, `group:${index}:${group.title}`);
  }
  const rest = new Map();
  for (const asset of data.assets) {
    if (used.has(asset.path)) continue;
    const parent = asset.path.split('/').slice(0, -1).join('/') || 'Design';
    if (!rest.has(parent)) rest.set(parent, []);
    rest.get(parent).push(asset);
  }
  for (const [title, assets] of rest) add({ title }, assets, `directory:${title}`);
  const canonical = ['tokens', 'components', 'modules', 'surfaces', 'studies'];
  const layers = [...new Set([...canonical, ...(data.layers ?? []).map(layer => layer.toLowerCase()), ...grouped.map(group => group.layer.toLowerCase())])];
  grouped.sort((a, b) => layers.indexOf(a.layer.toLowerCase()) - layers.indexOf(b.layer.toLowerCase()));
  const chapters = new Map();
  return grouped.map(group => {
    const chapter = (chapters.get(group.layer) ?? 0) + 1;
    chapters.set(group.layer, chapter);
    return { ...group, chapter };
  });
}

export function scopeKind(scope) {
  return scope?.split(':', 1)[0];
}

export function scopeTarget(scope) {
  const separator = scope?.indexOf(':') ?? -1;
  return separator < 0 ? undefined : scope.slice(separator + 1);
}

export function resolveScope(data, layers, requested) {
  const layerOf = asset => asset.layer ?? (asset.path.includes('/') ? asset.path.split('/')[0] : 'Design');
  const layerAssets = new Map(layers.map(layer => [layer, []]));
  for (const asset of data.assets) {
    const layer = layerOf(asset);
    if (!layerAssets.has(layer)) layerAssets.set(layer, []);
    layerAssets.get(layer).push(asset);
  }
  const available = [...layerAssets.keys()];
  const result = (scope, assets) => ({ scope, assets, layers: available });
  if (requested === 'all') return result('all', data.assets);
  const key = scopeTarget(requested);
  switch (scopeKind(requested)) {
    case 'layer':
      if (layerAssets.has(key)) return result(requested, layerAssets.get(key));
      break;
    case 'group': {
      const groups = groupAssets(data).filter(item => item.title === key);
      if (groups.length) return result(requested, groups.flatMap(group => group.assets));
      break;
    }
    case 'asset': {
      const asset = data.assets.find(item => item.path === key);
      if (asset) return result(requested, [asset]);
      break;
    }
  }
  const first = available.find(layer => layerAssets.get(layer).length) ?? available[0];
  return first ? result(`layer:${first}`, layerAssets.get(first)) : result('all', data.assets);
}


export function arrangementInput(data) {
  return groupAssets(data).map(({ assets, ...group }) => ({ ...group, blocks: assets.map(blockForAsset) }));
}

export function arrange(data, { placed, previousGroups } = {}) {
  const grouped = groupAssets(data);
  const boards = previousGroups ? layoutWorld(arrangementInput(data), { previousGroups })
    : placed ?? layoutWorld(arrangementInput(data));
  const byKey = new Map(grouped.map(group => [group.key, group]));
  const groups = boards.map(board => ({ ...byKey.get(board.key), ...board, width: board.w, height: board.h }));
  const items = [];
  for (const [group, board] of groups.entries()) {
    const byPath = new Map(board.assets.map(asset => [asset.path, asset]));
    for (const section of board.blocks) {
      const asset = byPath.get(section.asset);
      for (const frame of section.frames) {
        const crop = { ...frame.crop, width: frame.w, height: frame.h, id: frame.id, name: frame.name };
        items.push({ ...asset, name: section.title, component: false, id: `${asset.path}#${frame.id}`, kind: 'flow', group,
          x: board.x + section.x + frame.x, y: board.y + section.y + frame.y,
          width: frame.w, height: frame.h, shown: [crop],
          well: {x:board.x+section.x+frame.well.x,y:board.y+section.y+frame.well.y,width:frame.well.w,height:frame.well.h},
          paintCrop: specimenPaintCrop(asset, crop),
          previewCrop: section.previewCrop ?? specimenPaintCrop(asset, crop),
        });
      }
    }
  }
  return { groups, items, world: { x: 0, y: 0, width: Math.max(1, ...groups.map(g => g.x + g.w)), height: Math.max(1, ...groups.map(g => g.y + g.h)) } };
}

function formDocument(form,css,theme) {
  if(form.document)return form.document;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div data-adg-frame="${escape(form.name)}" style="${form.width ? `width:${form.width}px;` : 'width:max-content;'}${form.height ? `height:${form.height}px;` : ''}">${form.html}</div></body></html>`;
}
async function prepareSource(asset, built, theme, signal) {
  const endMeasurement = globalThis.__adgTiming?.span('measurement', asset.path, {frames:built.frames.length});
  const parts = [];
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox','allow-same-origin');
  frame.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden';
  document.body.append(frame);
  try {
    let sliceStart=performance.now();
    for (const [index, form] of built.frames.entries()) {
      const endFrame = globalThis.__adgTiming?.span('measurement-frame', asset.path, {frame:form.name});
      signal?.throwIfAborted();
      if(performance.now()-sliceStart>8) {
        await (globalThis.scheduler?.yield?.()??new Promise(resolve=>setTimeout(resolve,0)));
        sliceStart=performance.now();
      }
      const documentSource=formDocument(form,built.css,theme);
      frame.style.width=(form.width ?? 1600)+'px'; frame.style.height=(form.height ?? 1200)+'px';
      if (index === 0) {
        await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=documentSource;});
      } else {
        // Frames from one source share CSS. Keep its sandbox document and viewport,
        // replacing only the specimen instead of navigating for every form.
        const parsed = new DOMParser().parseFromString(documentSource, 'text/html');
        frame.contentDocument.body.replaceChildren(frame.contentDocument.importNode(parsed.querySelector('[data-adg-frame]'), true));
        await Promise.all([...frame.contentDocument.images].map(image => image.decode().catch(() => {})));
      }
      await frame.contentDocument.fonts.ready;
      const shell=frame.contentDocument.querySelector('[data-adg-frame]');
      const box=shell.getBoundingClientRect();
      const styles=new Map(),rects=new Map();
      const styleFor=node=>{if(!styles.has(node))styles.set(node,frame.contentWindow.getComputedStyle(node));return styles.get(node)};
      const rectFor=node=>{if(!rects.has(node))rects.set(node,node.getBoundingClientRect());return rects.get(node)};
      const elements = asset.path.endsWith('.tsx')
        ? collectViewerElements(shell, { projectSource: built.projectSource ?? asset.projectSource ?? asset.path, assetPath: asset.path, frame: form.name, styleFor, rectFor, origin: box })
        : [];
      const content=frame.contentDocument.createElement('div');
      content.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
      content.setAttribute('style','font:16px/1.5 var(--font-ui);color:var(--text);');
      content.append(frame.contentDocument.querySelector('style').cloneNode(true),shell.cloneNode(true));
      parts.push({id:String(index),name:form.name,note:form.note,proposed:form.proposed,width:box.width,height:box.height,elements,markup:new XMLSerializer().serializeToString(content)});
      endFrame?.();
    }
    const wrapWidth = built.component ? componentWrapWidth(parts) : Infinity;
    let x=0,y=0,rowHeight=0;
    for (const part of parts) {
      if (x && x+part.width>wrapWidth) { x=0;y+=rowHeight+64;rowHeight=0; }
      Object.assign(part,{x,y});
      x+=part.width+48;rowHeight=Math.max(rowHeight,part.height);
    }
    const width=Math.max(1,...parts.map(p=>p.x+p.width)),height=Math.max(1,...parts.map(p=>p.y+p.height));
    const xml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const header=`<svg xmlns="http://www.w3.org/2000/svg" data-theme="${theme}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    let offset=header.length;
    const frameRanges=[];
    const markup=parts.map(p=>{
      const value=`<g ${built.component ? 'data-component="source" data-form="'+xml(p.name)+'"' : 'data-part="frame-'+xml(p.name)+'"'}><foreignObject overflow="hidden" x="${p.x-24}" y="${p.y-32}" width="${p.width+48}" height="${p.height+64}"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:32px 24px;box-sizing:border-box;width:${p.width+48}px;height:${p.height+64}px">${p.markup}</div></foreignObject></g>`;
      frameRanges.push([offset,offset+value.length]);offset+=value.length;
      return value;
    });
    const source=header+markup.join('')+'</svg>';
    return {...asset,imports:built.imports,format:'tsx',source,frameRanges,full:{x:0,y:0,width,height},parts:parts.map(({markup,...p})=>p),component:built.component,background:frame.contentWindow.getComputedStyle(frame.contentDocument.documentElement).getPropertyValue('--canvas').trim()};
  } finally { frame.remove(); endMeasurement?.(); }
}
