import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { availableParallelism } from 'node:os';
import { buildSource } from './build.mjs';
import { selectSources, relative, loadTokens, sourceDirectories, archFiles } from './project.mjs';
import { importDirectionViolations } from './asset-rules.mjs';
import { launch, loadFrame } from './browser.mjs';
import { CliError } from '../cli-output.mjs';
export function inspectFrame(tokenNames) {
  const frame = document.querySelector('[data-adg-frame]'), box = frame.getBoundingClientRect(), problems = new Set();
  if (frame.children.length !== 1 || [...frame.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) problems.add('Frame needs exactly one root element');
  const sample = document.createElement('i'); document.body.append(sample);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { colorSpace: 'srgb', colorType: 'float16', willReadFrequently: true });
  context.globalCompositeOperation = 'copy';
  const normalized = new Map();
  const normalize = value => {
    if (!normalized.has(value)) {
      context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      // Float pixels retain un-premultiplied RGB even at low opacity.
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1, { colorSpace: 'srgb', pixelFormat: 'rgba-float16' }).data;
      normalized.set(value, [r, g, b].map(channel => Math.round(channel * 255)).concat(a));
    }
    return normalized.get(value);
  };
  const colors = [];
  for (const name of tokenNames) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (CSS.supports('color', value)) { sample.style.color = value; colors.push(normalize(getComputedStyle(sample).color)); }
    for (const color of value.match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)|#[\da-f]{3,8}\b/gi) ?? []) { sample.style.color = color; colors.push(normalize(getComputedStyle(sample).color)); }
  }
  sample.remove();
  const outside = r => r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
  const styles = new Map(), bounds = new Map(), effects = new Map();
  const style = el => { if (!styles.has(el)) styles.set(el,getComputedStyle(el)); return styles.get(el); };
  const rectFor = el => { if (!bounds.has(el)) bounds.set(el,el.getBoundingClientRect()); return bounds.get(el); };
  const intersect = (a,b) => ({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)});
  const nonempty = r => r.right > r.left && r.bottom > r.top;
  const clipped = (rect,start) => {
    let visible = {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    for (let p=start;p;p=p.parentElement) {
      const ps=style(p),pr=rectFor(p);
      // Overflow does not clip non-replaced inline boxes. Client bounds exclude
      // borders/scrollbars and include padding, unlike the border-box DOMRect.
      if (!(p instanceof HTMLElement && ps.display==='inline')) {
        const sx=pr.width/(p.offsetWidth || p.clientWidth || pr.width || 1);
        const sy=pr.height/(p.offsetHeight || p.clientHeight || pr.height || 1);
        const left=pr.left+p.clientLeft*sx,top=pr.top+p.clientTop*sy;
        if (ps.overflowX!=='visible') visible={...visible,left:Math.max(visible.left,left),right:Math.min(visible.right,left+p.clientWidth*sx)};
        if (ps.overflowY!=='visible') visible={...visible,top:Math.max(visible.top,top),bottom:Math.min(visible.bottom,top+p.clientHeight*sy)};
      }
      if (p===frame) break;
    }
    return visible;
  };
  const opaqueEffects = el => {
    if (!el) return true;
    if (!effects.has(el)) {
      const s=style(el);
      effects.set(el,Number(s.opacity)===1 && s.filter==='none' && s.clipPath==='none' &&
        s.maskImage==='none' && s.mixBlendMode==='normal' && opaqueEffects(el.parentElement));
    }
    return effects.get(el);
  };
  const opaqueColor = value => {
    // Float16 canvas alpha rounds near-opaque colors up to 1. Read an explicit
    // computed alpha before using canvas normalization for opaque color syntax.
    if (value.startsWith('rgba(') || value.includes('/')) {
      const alpha=value.match(/(?:,|\/)\s*([\d.e+-]+)(%)?\s*\)$/i);
      return !!alpha && Number(alpha[1])===(alpha[2]?100:1);
    }
    return normalize(value)[3]===1;
  };
  const lines = [], covers = [];
  for (const el of [frame, ...frame.querySelectorAll('*')]) {
    const s = style(el), r = rectFor(el);
    if (['STYLE','SCRIPT'].includes(el.tagName.toUpperCase())) problems.add(`Forbidden <${el.tagName.toLowerCase()}> in output`);
    for (const attr of el.attributes) if (/^on/i.test(attr.name) || attr.name === 'classname') problems.add(`Forbidden attribute ${attr.name} in output`);
    if (!el.closest('[data-free]')) {
      const authored = (el.getAttribute('class') ?? '') + ' ' + (el.getAttribute('style') ?? '');
      if ([...authored.matchAll(/(-?(?:\d*\.)?\d+)px\b/g)].some(m => !Number.isInteger(Number(m[1])))) problems.add('Fractional pixel length outside data-free');
      for (const [,property] of (el.getAttribute('style') ?? '').matchAll(/(?:^|;)\s*([-\w]+)\s*:/g)) if (!['width','height'].includes(property) && !property.startsWith('--')) problems.add(`Style ${property} outside data-free; use layout classes`);
    }
    if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const visibleBox=clipped(r,el.parentElement);
    if (nonempty(visibleBox) && outside(visibleBox)) problems.add('Content overflows the frame');
    // A border-box background has the same rounded hit shape as its element.
    // Other background clips/masks cannot establish rectangular opaque coverage.
    if (el instanceof HTMLElement && s.backgroundClip==='border-box' && opaqueColor(s.backgroundColor) && opaqueEffects(el)) {
      covers.push({el,rect:intersect(visibleBox,box)});
    }
    if (!el.closest('[data-brand]')) {
      const paints = [s.color, s.backgroundColor];
      for (const side of ['Top','Right','Bottom','Left']) if (parseFloat(s[`border${side}Width`]) > 0) paints.push(s[`border${side}Color`]);
      if (s.outlineStyle !== 'none') paints.push(s.outlineColor);
      if (el instanceof SVGElement && /^(path|rect|circle|ellipse|polygon|polyline|line|text)$/.test(el.localName)) paints.push(s.fill, s.stroke);
      paints.push(...((s.boxShadow+' '+s.textShadow+' '+s.backgroundImage).match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)/g) ?? []));
      for (const value of paints) {
        if (!value || value === 'none' || value.startsWith('url(')) continue;
        const paint = normalize(value), alpha = paint[3];
        if (alpha === 0) continue;
        const matches = colors.some(color => alpha < 1
          ? paint.slice(0, 3).every((channel, i) => Math.abs(channel - color[i]) <= 2)
          : paint.every((channel, i) => channel === color[i]));
        if (!matches) problems.add(`Color ${value} matches no token`);
      }
    }
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1) continue;
        const label = node.textContent.trim().replace(/\s+/g, ' ');
        const visible=clipped(rect,el);
        if (!nonempty(visible)) continue;
        if (outside(visible)) problems.add(`Text leaves frame: ${label}`);
        if (visible.left < r.left - 1 || visible.right > r.right + 1 ||
            (visible.top+visible.bottom)/2 < r.top - 1 || (visible.top+visible.bottom)/2 > r.bottom + 1) problems.add(`Text overflows its box: ${label}`);
        const inFrame=intersect(visible,box);
        if (nonempty(inFrame)) lines.push({rect:inFrame,label,el});
      }
    }
  }
  // Hit testing omits inert and pointer-events:none content, though it still paints.
  // Normalize only the text/cover nodes after validating authored styles, then
  // restore their exact attributes so inspection has no lasting DOM changes.
  const restored = [], inert = [];
  for (let el=frame;el;el=el.parentElement) if (el.hasAttribute('inert')) inert.push([el,el.getAttribute('inert')]);
  for (const el of frame.querySelectorAll('[inert]')) inert.push([el,el.getAttribute('inert')]);
  for (const [el] of inert) el.removeAttribute('inert');
  for (const el of new Set([...lines.map(line=>line.el),...covers.map(cover=>cover.el)])) {
    if (style(el).pointerEvents==='none') {
      restored.push([el,el.getAttribute('style')]);el.style.setProperty('pointer-events','auto','important');
    }
  }
  const hits = new Map();
  const paintStack = (x,y) => {
    const key=`${x},${y}`;
    if (!hits.has(key)) hits.set(key,document.elementsFromPoint(x,y));
    return hits.get(key);
  };
  const occluded = (el,rect) => {
    const dx=Math.min(.01,(rect.right-rect.left)/100),dy=Math.min(.01,(rect.bottom-rect.top)/100);
    const points=[[rect.left+dx,rect.top+dy],[rect.right-dx,rect.top+dy],
      [rect.left+dx,rect.bottom-dy],[rect.right-dx,rect.bottom-dy],[(rect.left+rect.right)/2,(rect.top+rect.bottom)/2]];
    return covers.some(cover => {
      if (cover.el.contains(el) || cover.rect.left>rect.left || cover.rect.right<rect.right ||
          cover.rect.top>rect.top || cover.rect.bottom<rect.bottom) return false;
      const samples=points.map(([x,y])=>{
        const stack=paintStack(x,y);return [stack.indexOf(el),stack.indexOf(cover.el)];
      });
      // The SAME convex background must hit every corner. Rounded controls can
      // omit their text owner at an edge, so establish paint order where both
      // elements hit; absence alone is never evidence that the text is behind.
      return samples.every(([subject,foreground])=>foreground>=0 && (subject<0 || foreground<subject)) &&
        samples.some(([subject,foreground])=>subject>=0 && foreground<subject);
    });
  };
  try {
    for (let i=0;i<lines.length;i++) for(let j=i+1;j<lines.length;j++) {
      const a=lines[i], b=lines[j];
      // Each Range belongs to a direct text node; an ancestor's own text and a
      // positioned child's text are distinct visible lines, not duplicate ranges.
      if (a.el===b.el) continue;
      const overlap=intersect(a.rect,b.rect);
      if (overlap.right-overlap.left>1 && overlap.bottom-overlap.top>2 &&
          !occluded(a.el,overlap) && !occluded(b.el,overlap)) problems.add(`Text overlaps: ${a.label} / ${b.label}`);
    }
  } finally {
    for (const [el,authored] of restored) {
      // Flush a CSSOM-created attribute before removing it (Chromium creates it lazily).
      el.getAttribute('style');
      if (authored===null) el.removeAttribute('style');
      else el.setAttribute('style',authored);
    }
    for (const [el,authored] of inert) el.setAttribute('inert',authored);
  }
  return [...problems];
}
export async function check(config, args = [], options = {}, log = console.log, error = console.error) {
  const write=!options['read-only'];
  const files = selectSources(config,args,{write}), tokens = loadTokens(config), problems = new Set(), graph={};
  const arch = files.some(file=>file.endsWith('.mmd')) ? await import('./arch.mjs') : null;
  const browser = await launch();
  try {
    const page = await browser.newPage();
    for (const file of files) {
      const architecture=file.endsWith('.mmd');
      if(architecture) {
        const {readFileSync,existsSync}=await import('node:fs');
        const text=readFileSync(file,'utf8'), side=file.replace(/\.mmd$/,'.md');
        const metadata=arch.sidecar(existsSync(side)?readFileSync(side,'utf8'):'');
        for(const problem of [...arch.inspectArch(text,config.check?.archMaxEdges??30).problems,...metadata.problems,...arch.ownerProblems(config,metadata)]) problems.add(`${relative(config,file)}: ${problem}`);
        if([...problems].some(problem=>problem.startsWith(relative(config,file)+':'))) continue;
      }
      let built;
      try { built = await buildSource(config,file,{allowLegacy:false,write,browser}); }
      catch(e) {
        const legacy = e.errors?.find(error => error.detail?.code === 'LEGACY_SOURCE');
        if (legacy) throw legacy.detail;
        for(const problem of e.message.split('\n')) problems.add(`${relative(config,file)}: ${architecture?'':'-: '}${problem.replace(/\s+/g,' ')}`); continue;
      }
      graph[path.relative(config.design,file).split(path.sep).join('/')]={uses:built.imports};
      for (const frame of built.frames) for (const theme of ['light','dark']) {
        try {
          await loadFrame(page,frame,theme);
          for (const problem of await page.evaluate(architecture?arch.inspectArchLabels:inspectFrame,architecture?undefined:[...tokens.light.keys()])) problems.add(`${relative(config,file)}: ${frame.name}: ${theme}: ${problem}`);
        } catch(e) { problems.add(`${relative(config,file)}: ${frame.name}: ${theme}: ${e.message.replace(/\s+/g,' ')}`); }
      }
    }
  } finally { await browser.close(); }
  if (config.check?.importDirection!==false) for (const {source,target,from,to} of importDirectionViolations(graph,sourceDirectories(config))) {
    problems.add(`${relative(config,path.join(config.design,source))}: import ${target} violates import direction (${from} -> ${to}); import from the same or a lower layer in sources`);
  }
  for (const problem of problems) error(problem);
  log(`Design check ${problems.size ? 'failed' : 'passed'} for ${files.length} sources${problems.size ? `: ${problems.size} problems` : ''}.`);
  return problems.size ? 1 : 0;
}
export async function render(config, args = [], options = {}) {
  const scale = Number(options.scale ?? 2);
  if (!(Number.isFinite(scale) && scale > 0)) throw Error('Invalid --scale; use a positive number');
  const themeOption = options.theme ?? 'both';
  if (!['both', 'light', 'dark'].includes(themeOption)) throw Error('Choose --theme=both, light, or dark.');
  if (options['out-dir'] === '') throw Error('Set --out-dir to a directory.');
  const output = options['out-dir'] ? path.resolve(config.root, options['out-dir']) : config.output;
  const themes = themeOption === 'both' ? ['light', 'dark'] : [themeOption];
  let base,deleted=[],additional=[];
  if(options.base!==undefined && (!args.length || args.some(arg=>arg.endsWith('.mmd')))) {
    const git=await import('./arch-git.mjs');
    base=await git.resolveBase(config,options.base);
    additional=await git.baseArchFiles(config,base);
  }
  const selected=selectSources(config,args,{additional});
  const {existsSync}=await import('node:fs');
  const currentArchitecture=base?new Set(archFiles(config.arch)):null;
  const files=selected.filter(file=>{if(!existsSync(file)||(base&&file.endsWith('.mmd')&&!currentArchitecture.has(file))){deleted.push(relative(config,file));return false;}return true;});
  const browser = base && !files.length ? null : await launch();
  try {
    const captures = [];
    for (const file of files) {
      const built = base&&file.endsWith('.mmd') ? await (await import('./arch-overlay.mjs')).buildOverlay(config,file,{base,browser}) : await buildSource(config,file,{allowLegacy:false,browser});
      for (const frame of built.frames.filter(f => !options.frame || f.name === options.frame)) {
        for (const theme of themes) {
          const source = file.endsWith('.mmd') ? relative(config,file) : path.relative(config.design, file);
          const target = path.join(output, source.replace(/\.(?:tsx|mmd)$/, ''), `${encodeURIComponent(frame.name)}-${theme}.png`);
          captures.push({source,frame,theme,target});
        }
      }
    }
    if (options.frame && !captures.length && !deleted.length) throw new CliError('FRAME_NOT_FOUND', `Unknown frame ${options.frame}; choose a declared frame`);
    let next = 0;
    const workers = await Promise.allSettled(Array.from({length:Math.min(4,availableParallelism(),captures.length)},async () => {
      while (next < captures.length) {
        const {frame,theme,target} = captures[next++];
        // Chromium reuses image resampling state across setContent calls.
        // A fresh page/context per capture keeps PNG bytes independent of history.
        const page = await browser.newPage({deviceScaleFactor:scale});
        try {
          await loadFrame(page,frame,theme);
          mkdirSync(path.dirname(target),{recursive:true});
          await page.locator('[data-adg-frame]').screenshot({path:target});
        } finally { await page.close(); }
      }
    }));
    const failed = workers.find(worker => worker.status === 'rejected');
    if (failed) throw failed.reason;
    if (options.json) {
      const output=captures.map(({source,frame,theme,target})=>({source:source.split(path.sep).join('/'),frame:frame.name,theme,path:target}));
      console.log(JSON.stringify(base?{base:{rev:base.rev,sha:base.sha},captures:output,deleted}:output));
    }
    else for (const {target} of captures) console.log(relative(config,target));
  } finally { await browser?.close(); }
  return 0;
}
