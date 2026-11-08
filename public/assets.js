import { dataFetch } from './auth.js';
import { blockForAsset, componentWrapWidth, layoutWorld } from "./layout.js";
// Measure declared SVG content in an isolated, script-disabled document.
export const metadataContext = () => `adaptive-wrap-v1|${navigator.userAgent}|${devicePixelRatio}`;
export function measuredMetadata(asset) {
  const {format,full,component,parts,background,imports,frameRanges}=asset;
  return {format,full,component,parts,background,imports,frameRanges};
}
export function previewAddress(asset,theme,crop) {
  const query=new URLSearchParams({theme,context:metadataContext(),crop});
  return `preview/${asset.hash}?${query}`;
}

export async function prepare(asset, theme, {signal} = {}) {
  const response = await dataFetch(
    `asset/${encodeURIComponent(asset.path)}?theme=${theme}&v=${encodeURIComponent(asset.version)}`,
    {signal},
  );
  if(response.status===409)throw Object.assign(Error('Source rebuild superseded'),{name:'AbortError'});
  if (!response.ok) throw new Error(`Cannot load ${asset.path}`);
  const source = await response.text();
  if (asset.path.endsWith(".tsx")) {
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
  return URL.createObjectURL(new Blob([rendered], {type:"image/svg+xml"}));
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
  const used = new Set(),
    grouped = [];
  for (const g of data.groups) {
    const list = g.assets.flatMap((p) => {
      const a = data.assets.find((a) => a.path === p);
      if (!a || used.has(p)) return [];
      used.add(p);
      return [a];
    });
    if (list.length) grouped.push({ ...g, assets: list });
  }
  const rest = new Map();
  for (const a of data.assets) {
    if (used.has(a.path)) continue;
    const parent = a.path.split("/").slice(0, -1).join("/") || "Design";
    if (!rest.has(parent)) rest.set(parent, []);
    rest.get(parent).push(a);
  }
  for (const [title, assets] of rest) grouped.push({ title, assets });
  return grouped;
}

export function arrange(data) {
  const grouped = groupAssets(data);
  const sections = layoutWorld(grouped.map(g => ({ ...g, blocks: g.assets.map(blockForAsset) })));
  const groups = sections.map(s => ({ ...s, width: s.w, height: s.h }));
  const items = [];
  for (const [group, section] of groups.entries()) {
    for (const block of section.blocks) {
      const asset = section.assets.find(a => a.path === block.asset);
      const frames = block.kind === 'set' ? [{ id: 'overview', name: 'All forms', x: block.x, y: block.y, crop: block.crop }] : block.frames;
      for (const frame of frames) {
        const crop = { ...frame.crop, width: frame.crop.w, height: frame.crop.h, id: frame.id, name: frame.name };
        items.push({ ...asset, id: block.kind === 'set' ? asset.path : `${asset.path}#${frame.id}`, kind: block.kind,
          group, x: frame.x, y: frame.y, width: crop.width, height: crop.height, shown: [crop] });
      }
    }
  }
  return { groups, items, world: { x: 0, y: 0, width: Math.max(1, ...groups.map(g => g.x + g.width)), height: Math.max(1, ...groups.map(g => g.y + g.height)) } };
}

function formDocument(form,css,theme) {
  if(form.document)return form.document;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div data-sdg-frame="${escape(form.name)}" style="${form.width ? `width:${form.width}px;` : 'width:max-content;'}${form.height ? `height:${form.height}px;` : ''}">${form.html}</div></body></html>`;
}
async function prepareSource(asset, built, theme, signal) {
  const parts = [];
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox','allow-same-origin');
  frame.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden';
  document.body.append(frame);
  try {
    let sliceStart=performance.now();
    for (const [index, form] of built.frames.entries()) {
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
        frame.contentDocument.body.replaceChildren(frame.contentDocument.importNode(parsed.querySelector('[data-sdg-frame]'), true));
        await Promise.all([...frame.contentDocument.images].map(image => image.decode().catch(() => {})));
      }
      await frame.contentDocument.fonts.ready;
      const shell=frame.contentDocument.querySelector('[data-sdg-frame]');
      const box=shell.getBoundingClientRect();
      const styles=new Map(),rects=new Map();
      const styleFor=node=>{if(!styles.has(node))styles.set(node,frame.contentWindow.getComputedStyle(node));return styles.get(node)};
      const rectFor=node=>{if(!rects.has(node))rects.set(node,node.getBoundingClientRect());return rects.get(node)};
      const elements = [...shell.querySelectorAll('[data-sdg-owners]')].flatMap((node,index) => {
        const rect = rectFor(node);
        let left=Math.max(rect.left,box.left),top=Math.max(rect.top,box.top),right=Math.min(rect.right,box.right),bottom=Math.min(rect.bottom,box.bottom);
        for (let parent=node.parentElement;parent && parent!==shell;parent=parent.parentElement) {
          const style=styleFor(parent);
          if (!/(hidden|clip|auto|scroll)/.test(style.overflowX+' '+style.overflowY)) continue;
          const clip=rectFor(parent);
          if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {left=Math.max(left,clip.left);right=Math.min(right,clip.right)}
          if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}
        }
        if (right<=left || bottom<=top || styleFor(node).visibility==='hidden') return [];
        return [{id:String(index),owners:JSON.parse(node.dataset.sdgOwners),x:left-box.x,y:top-box.y,width:right-left,height:bottom-top}];
      });
      const content=frame.contentDocument.createElement('div');
      content.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
      content.setAttribute('style','font:16px/1.5 var(--font-ui);color:var(--text);');
      content.append(frame.contentDocument.querySelector('style').cloneNode(true),shell.cloneNode(true));
      parts.push({id:String(index),name:form.name,note:form.note,width:box.width,height:box.height,elements,markup:new XMLSerializer().serializeToString(content)});
    }
    const wrapWidth = built.component ? componentWrapWidth(parts) : Infinity;
    let x=0,y=0,rowHeight=0;
    for (const part of parts) {
      if (x && x+part.width>wrapWidth) { x=0;y+=rowHeight+48;rowHeight=0; }
      Object.assign(part,{x,y});
      x+=part.width+32;rowHeight=Math.max(rowHeight,part.height);
    }
    const width=Math.max(1,...parts.map(p=>p.x+p.width)),height=Math.max(1,...parts.map(p=>p.y+p.height));
    const xml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const header=`<svg xmlns="http://www.w3.org/2000/svg" data-theme="${theme}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    let offset=header.length;
    const frameRanges=[];
    const markup=parts.map(p=>{
      const value=`<g ${built.component ? 'data-component="source" data-form="'+xml(p.name)+'"' : 'data-part="frame-'+xml(p.name)+'"'}><foreignObject overflow="visible" x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}">${p.markup}</foreignObject></g>`;
      frameRanges.push([offset,offset+value.length]);offset+=value.length;
      return value;
    });
    const source=header+markup.join('')+'</svg>';
    return {...asset,imports:built.imports,format:'tsx',source,frameRanges,full:{x:0,y:0,width,height},parts:parts.map(({markup,...p})=>p),component:built.component,background:frame.contentWindow.getComputedStyle(frame.contentDocument.documentElement).getPropertyValue('--canvas').trim()};
  } finally { frame.remove(); }
}
