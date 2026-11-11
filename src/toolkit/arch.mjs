import { readFileSync, existsSync, globSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse, render } from 'pele';
import { parseTokens } from './tokens.mjs';
import { launch } from './browser.mjs';

export const phases = ['progress', 'waiting', 'done', 'stopped', 'uncertain'];
export const marks = ['experimental', 'temporary', 'gap'];
export const vocabulary = [...phases, ...marks];
const reserved = ['added', 'removed', 'changed'];

export function sidecar(text = '') {
  const problems = [], owners = []; let status, body = text.trim();
  if (/^---\r?\n/.test(text)) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!match) return {owners, body:'', problems:['Unclosed sidecar frontmatter']};
    body = match[2].trim(); let current; const keys = new Set();
    const scalar = value => {
      const quoted = /^(["'])(.*)\1$/.exec(value);
      return quoted ? quoted[2] : value;
    };
    for (const raw of match[1].split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const key = /^(owners|status):\s*(.*)$/.exec(raw);
      if (key) {
        current = key[1];
        if (keys.has(current)) problems.push(`Duplicate sidecar frontmatter key ${current}`);
        keys.add(current);
        if (current === 'status' && key[2].trim()) status = scalar(key[2].trim());
        else if (current === 'owners' && !key[2].trim()) continue;
        else problems.push(`Invalid sidecar ${current}; use ${current === 'owners' ? 'an indented list' : 'a non-empty string'}`);
      } else {
        const item = /^ +-[ \t]+(.+)$/.exec(raw);
        if (item && current === 'owners') owners.push(scalar(item[1].trim()));
        else problems.push(`Invalid sidecar frontmatter key or entry: ${raw.trim()}`);
      }
    }
  }
  for (const owner of owners) if (path.isAbsolute(owner) || owner.split('/').includes('..') || owner.includes('\\')) problems.push(`Invalid owners path ${owner}; use project-root-relative paths or globs`);
  return {owners,status,body,problems};
}

// Preserve newlines and statement delimiters while masking quoted labels and comments.
// This catches same-line statements without treating words in labels as commands.
function statements(text) {
  let quote = '', comment = false, masked = '';
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='\n') { comment=false; masked+='\n'; continue; }
    if (comment) { masked+=' '; continue; }
    if (quote) {
      if (c==='\\') { masked+='  '; i++; continue; }
      if (c===quote) quote='';
      masked+=' '; continue;
    }
    if (c==='"' || (c==="'" && !/[\w]/.test(text[i-1]??''))) { quote=c; masked+=' '; continue; }
    if (c==='%' && text[i+1]==='%') {comment=true;masked+=' ';continue;}
    masked+=c;
  }
  return masked;
}
export function inspectArch(text, maxEdges = 30) {
  const problems=[], classes=new Set(), clean=statements(text);
  for (const match of clean.matchAll(/(?:^|[;\n])\s*(classDef|style|linkStyle)\b/g)) {
    const line=clean.slice(0,match.index+match[0].length).split('\n').length;
    problems.push(`Painting statement ${match[1]} at line ${line}; paint comes from tokens`);
  }
  // Pele accepts both init directives and Mermaid YAML frontmatter. Theme config
  // can be nested; reject paint keys anywhere in these configuration regions.
  const configRegions=[...text.matchAll(/%%\{[\s\S]*?\}%%/g), ...text.matchAll(/^---\r?\n[\s\S]*?\r?\n---/g)];
  for (const match of configRegions) if (/\b(?:theme\w*|[\w-]*color[\w-]*|fill|stroke|background)\b/i.test(match[0]))
    problems.push(`Painting directive/frontmatter at line ${text.slice(0,match.index).split('\n').length}; paint comes from tokens`);
  for (const match of clean.matchAll(/(?:^|[;\n])\s*class\s+\S+\s+([^;\n]+)/g))
    for(const name of match[1].trim().split(/[\s,]+/)) classes.add(name);
  for (const match of clean.matchAll(/:::\s*([\w,-]+)/g)) for(const name of match[1].split(',')) classes.add(name);
  for(const name of classes) if (!vocabulary.includes(name)) problems.push(`${reserved.includes(name)?'Reserved':'Unknown'} class ${name}; vocabulary: ${vocabulary.join(', ')} (added, removed, changed are reserved)`);
  let model;
  try {
    model=parse(text);
    const count=([model.edges,model.relations,model.messages,model.relationships,model.rels,model.graph?.edges,model.links].find(Array.isArray)??[]).length;
    if(count>maxEdges) problems.push(`${count} edges/messages exceeds check.archMaxEdges (${maxEdges})`);
  } catch(error) { problems.push(`Pele: ${error.message.replace(/\s+/g,' ')} (line ${error.line ?? 1})`); }
  return {model,classes:vocabulary.filter(name=>classes.has(name)),problems};
}
export function ownerProblems(config, metadata) {
  return metadata.owners.flatMap(owner => {
    if(path.isAbsolute(owner) || owner.split('/').includes('..') || owner.includes('\\')) return [];
    const matches=globSync(owner,{cwd:config.root,exclude:['**/node_modules/**','**/.git/**']});
    return matches.some(file=>statSync(path.join(config.root,file),{throwIfNoEntry:false})?.isFile()) ? [] : [`Owners entry ${owner} matches no file`];
  });
}

const fallback = {
  progress:['#6a5ad0','#ab9fff'], waiting:['#9a6700','#e9b949'], done:['#18794e','#62c993'],
  stopped:['#c42b37','#ff808b'], uncertain:['#737373','#a3a3a3'],
  experimental:['#6a5ad0','#ab9fff'], temporary:['#9a6700','#e9b949'], gap:['#c42b37','#ff808b'],
};
const roles = {waiting:'warning',temporary:'warning',done:'success',stopped:'danger',gap:'danger',uncertain:'text-tertiary'};
export function archStyles() {
  // Defaults live on :root before project tokens, so tokens may override either theme.
  const defaults=theme=>vocabulary.map(name=>`--arch-${name}:${roles[name]?`var(--${roles[name]}, ${fallback[name][theme]})`:fallback[name][theme]};`).join('');
  const shape=':is(rect,path,polygon,circle,ellipse)';
  return `:root{${defaults(0)}}:root[data-theme="dark"]{${defaults(1)}}
[data-sdg-arch]{--pele-bg:var(--surface,var(--canvas));--pele-fg:var(--text);--pele-muted:var(--text-secondary,var(--text));--pele-line:var(--text-tertiary,var(--text));--pele-surface:var(--surface-subtle,var(--canvas));--pele-surface-alt:var(--surface-subtle,var(--canvas));--pele-border:var(--border-strong,var(--border,var(--text)));--pele-accent:var(--accent,var(--text));--pele-font:var(--font-ui);--pele-font-mono:var(--font-mono);--pele-radius:8px;background:var(--pele-bg);color:var(--text);padding:24px;width:max-content;font:14px var(--font-ui)}
[data-sdg-arch]>.pele{display:block;max-width:none!important}
.arch-legend{display:flex;align-items:center;gap:16px;margin-bottom:16px;white-space:nowrap}.arch-key{display:flex;align-items:center;gap:6px}.arch-swatch{box-sizing:border-box;width:16px;height:12px;border:1px solid var(--arch-color);background:color-mix(in srgb,var(--arch-color) 20%,var(--pele-bg));border-radius:3px}
${phases.map(name=>`.pele-node.${name}>${shape}{fill:color-mix(in srgb,var(--arch-${name}) 20%,var(--pele-bg));stroke:var(--arch-${name})}`).join('\n')}
${marks.map(name=>`.pele-node.${name}>${shape}{stroke:var(--arch-${name});stroke-width:${name==='gap'?'2.5':'2'}px;stroke-dasharray:${name==='experimental'?'6 4':name==='temporary'?'2 3':'none'}}`).join('\n')}
.arch-key.experimental .arch-swatch{border:2px dashed var(--arch-color);background:transparent}.arch-key.temporary .arch-swatch{border:2px dotted var(--arch-color);background:transparent}.arch-key.gap .arch-swatch{border-width:2.5px;background:transparent}`;
}

// Pele is synchronous. Collect its exact width requests, measure them together in
// Chromium with both project font stacks, then render the model with those widths.
// Keep the model boundary separate so a future Git overlay can supply a model.
export async function renderArch(model, tokenSource) {
  const requests=new Map(),measured=new Map();
  const key=(text,size,style)=>JSON.stringify([text,size,style]);
  const browser=await launch();
  try {
    const page=await browser.newPage();
    await page.setContent(`<style>${tokenSource.replace(/<\/style/gi,'<\\/style')}</style>`);
    const fonts=await page.evaluate(()=>{
      const style=getComputedStyle(document.documentElement);
      return {ui:style.getPropertyValue('--font-ui').trim(),mono:style.getPropertyValue('--font-mono').trim()};
    });
    for(let pass=0;pass<16;pass++) {
      const result=render(model,{fontFamily:fonts.ui,fontFamilyMono:fonts.mono,measurer:{width(text,size,style){
        const id=key(text,size,style);
        if(!measured.has(id))requests.set(id,{text,size,style});
        return measured.get(id)??text.length*size*.6;
      }}});
      if(!requests.size)return result;
      const widths=await page.evaluate(async requests=>{
        const canvas=document.createElement('canvas').getContext('2d'),widths=requests.map(()=>0);
        for(const theme of ['light','dark']) {
          document.documentElement.dataset.theme=theme;
          const style=getComputedStyle(document.documentElement),ui=style.getPropertyValue('--font-ui').trim(),mono=style.getPropertyValue('--font-mono').trim();
          await document.fonts.ready;
          requests.forEach(({text,size,style},i)=>{
            canvas.font=`${style&2?'italic ':''}${style&1?'bold ':''}${size}px ${style&4?mono:ui}`;
            widths[i]=Math.max(widths[i],canvas.measureText(text).width);
          });
        }
        return widths;
      },[...requests.values()]);
      [...requests.keys()].forEach((id,i)=>measured.set(id,widths[i]));requests.clear();
    }
    throw Error('Pele label measurement did not settle after 16 passes');
  } finally {await browser.close();}
}

export async function buildArch(config,file,{snapshot,model:overlayModel}={}) {
  const dependencies=[],read=name=>{
    dependencies.push(name);
    let bytes;
    try{bytes=readFileSync(name);}catch(error){if(error.code!=='ENOENT'||!name.endsWith('.md'))throw error;bytes=null;}
    snapshot?.set(name,bytes);return bytes?.toString('utf8')??'';
  };
  const text=read(file),metadata=sidecar(read(file.replace(/\.mmd$/,'.md'))),tokenSource=read(path.join(config.design,'tokens.css'));
  parseTokens(tokenSource);
  const checked=inspectArch(text,Infinity);
  const problems=[...checked.problems,...metadata.problems];
  if(problems.length)throw Error(problems.join('\n'));
  const result=await renderArch(overlayModel??checked.model,tokenSource);
  const legend=checked.classes.length?`<div class="arch-legend">${checked.classes.map(name=>`<span class="arch-key ${name}" style="--arch-color:var(--arch-${name})"><i class="arch-swatch"></i>${name}</span>`).join('')}</div>`:'';
  const html=`<section data-sdg-arch>${legend}${result.svg}</section>`;
  const css=`${archStyles()}\n${tokenSource}\nhtml,body{margin:0;font-family:var(--font-ui);color:var(--text);background:var(--canvas)}[data-sdg-frame]{display:flex;width:max-content}`;
  const note=[metadata.body,metadata.owners.length?`Owners: ${metadata.owners.join(', ')}`:'',metadata.status?`Status: ${metadata.status}`:''].filter(Boolean).join('\n');
  const frame={frame:true,name:'default',html,note};
  frame.document=theme=>`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div data-sdg-frame="default">${html}</div></body></html>`;
  return {frames:[frame],css,imports:[],dependencies};
}

// Executed in the same Chromium page as ordinary frame checks. Bounds are in
// screen coordinates, including every nested SVG transform and the actual fonts.
export function inspectArchLabels() {
  const problems=[];
  for(const node of document.querySelectorAll('.pele-node')) {
    const shapes=[...node.children].filter(el=>['rect','path','polygon','circle','ellipse'].includes(el.localName));
    if(!shapes.length)continue;
    const shape=shapes[0],box=shape.getBoundingClientRect();
    for(const text of node.querySelectorAll('text,foreignObject')) {
      if(text.closest('.pele-node')!==node)continue;
      const r=text.getBoundingClientRect();
      const matrix=shape.getScreenCTM()?.inverse();
      const inside=matrix && [[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1]].every(([x,y])=>shape.isPointInFill(new DOMPoint(x,y).matrixTransform(matrix)));
      if(!inside || r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1)
        problems.push(`Label overflows node ${node.dataset.id}: ${text.textContent.trim()}`);
    }
  }
  return problems;
}
