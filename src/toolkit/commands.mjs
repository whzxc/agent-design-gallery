import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildSource } from './build.mjs';
import { selectSources, relative, loadTokens } from './project.mjs';
import { launch, loadFrame } from './browser.mjs';
export function inspectFrame(tokenNames) {
  const frame = document.querySelector('[data-sdg-frame]'), box = frame.getBoundingClientRect(), problems = new Set();
  if (frame.children.length !== 1 || [...frame.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) problems.add('Frame needs exactly one root element');
  const sample = document.createElement('i'); document.body.append(sample);
  const colors = new Set(['rgba(0, 0, 0, 0)']);
  for (const name of tokenNames) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (CSS.supports('color', value)) { sample.style.color = value; colors.add(getComputedStyle(sample).color); }
    for (const color of value.match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)|#[\da-f]{3,8}\b/gi) ?? []) { sample.style.color = color; colors.add(getComputedStyle(sample).color); }
  }
  sample.remove();
  const outside = r => r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
  const lines = [];
  for (const el of [frame, ...frame.querySelectorAll('*')]) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (['STYLE','SCRIPT'].includes(el.tagName.toUpperCase())) problems.add(`Forbidden <${el.tagName.toLowerCase()}> in output`);
    for (const attr of el.attributes) if (/^on/i.test(attr.name) || attr.name === 'classname') problems.add(`Forbidden attribute ${attr.name} in output`);
    if (!el.closest('[data-free]')) {
      const authored = (el.getAttribute('class') ?? '') + ' ' + (el.getAttribute('style') ?? '');
      if ([...authored.matchAll(/(-?(?:\d*\.)?\d+)px\b/g)].some(m => !Number.isInteger(Number(m[1])))) problems.add('Fractional pixel length outside data-free');
      for (const [,property] of (el.getAttribute('style') ?? '').matchAll(/(?:^|;)\s*([-\w]+)\s*:/g)) if (!['width','height'].includes(property) && !property.startsWith('--')) problems.add(`Style ${property} outside data-free; use layout classes`);
    }
    if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const clipped = rect => {
      let left=rect.left,right=rect.right,top=rect.top,bottom=rect.bottom;
      for(let p=el.parentElement;p && p!==frame;p=p.parentElement) { const ps=getComputedStyle(p),pr=p.getBoundingClientRect(); if (/(hidden|clip|auto|scroll)/.test(ps.overflowX)) {left=Math.max(left,pr.left);right=Math.min(right,pr.right);} if (/(hidden|clip|auto|scroll)/.test(ps.overflowY)) {top=Math.max(top,pr.top);bottom=Math.min(bottom,pr.bottom);} }
      return {left,right,top,bottom};
    };
    if (outside(clipped(r))) problems.add('Content overflows the frame');
    if (!el.closest('[data-brand]')) {
      const paints = [s.color, s.backgroundColor];
      for (const side of ['Top','Right','Bottom','Left']) if (parseFloat(s[`border${side}Width`]) > 0) paints.push(s[`border${side}Color`]);
      if (s.outlineStyle !== 'none') paints.push(s.outlineColor);
      if (el instanceof SVGElement && /^(path|rect|circle|ellipse|polygon|polyline|line|text)$/.test(el.localName)) paints.push(s.fill, s.stroke);
      paints.push(...((s.boxShadow+' '+s.textShadow+' '+s.backgroundImage).match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)/g) ?? []));
      for (const value of paints) if (value && !['none','transparent'].includes(value) && !value.startsWith('url(') && !colors.has(value)) problems.add(`Color ${value} matches no token`);
    }
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1) continue;
        const label = node.textContent.trim().replace(/\s+/g, ' ');
        if (outside(clipped(rect))) problems.add(`Text leaves frame: ${label}`);
        if ((rect.left < r.left - 1 || rect.right > r.right + 1 || (rect.top+rect.bottom)/2 < r.top - 1 || (rect.top+rect.bottom)/2 > r.bottom + 1) && s.textOverflow !== 'ellipsis') problems.add(`Text overflows its box: ${label}`);
        lines.push({rect, label, el});
      }
    }
  }
  for (let i=0;i<lines.length;i++) for(let j=i+1;j<lines.length;j++) {
    const a=lines[i], b=lines[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1 && Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>2) problems.add(`Text overlaps: ${a.label} / ${b.label}`);
  }
  return [...problems];
}
export async function check(config, args = [], options = {}, log = console.log, error = console.error) {
  const files = selectSources(config,args), tokens = loadTokens(config), problems = new Set();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    for (const file of files) {
      let built;
      try { built = await buildSource(config,file); }
      catch(e) { problems.add(`${relative(config,file)}: -: ${e.message.replace(/\s+/g,' ')}`); continue; }
      for (const frame of built.frames) for (const theme of ['light','dark']) {
        try {
          await loadFrame(page,frame,theme);
          for (const problem of await page.evaluate(inspectFrame,[...tokens.light.keys()])) problems.add(`${relative(config,file)}: ${frame.name}: ${theme}: ${problem}`);
        } catch(e) { problems.add(`${relative(config,file)}: ${frame.name}: ${theme}: ${e.message.replace(/\s+/g,' ')}`); }
      }
    }
  } finally { await browser.close(); }
  for (const problem of problems) error(problem);
  log(`Design check ${problems.size ? 'failed' : 'passed'} for ${files.length} sources${problems.size ? `: ${problems.size} problems` : ''}.`);
  return problems.size ? 1 : 0;
}
export async function render(config, args = [], options = {}) {
  const scale = Number(options.scale ?? 2);
  if (!(Number.isFinite(scale) && scale > 0)) throw Error('Invalid --scale; use a positive number');
  const files = selectSources(config,args), browser = await launch();
  let found = false;
  try {
    const page = await browser.newPage({deviceScaleFactor:scale});
    for (const file of files) {
      const built = await buildSource(config,file);
      for (const frame of built.frames.filter(f => !options.frame || f.name === options.frame)) {
        found = true;
        for (const theme of ['light','dark']) {
          await loadFrame(page,frame,theme);
          const target = path.join(config.output,path.relative(config.design,file).replace(/\.tsx$/,''),`${encodeURIComponent(frame.name)}-${theme}.png`);
          mkdirSync(path.dirname(target),{recursive:true});
          await page.locator('[data-sdg-frame]').screenshot({path:target});
          console.log(relative(config,target));
        }
      }
    }
    if (options.frame && !found) throw Error(`Unknown frame ${options.frame}; choose a declared frame`);
  } finally { await browser.close(); }
  return 0;
}
