import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildSource } from '../toolkit/build.mjs';
import { listSources, isFeatureInternal, readGroups } from '../toolkit/project.mjs';
import { escape } from '../toolkit/html.mjs';
import { launch, readyResources, browserTask } from '../toolkit/browser.mjs';
import { resolveMedia } from './media.mjs';
import { CliError } from '../cli-output.mjs';
import { boardDocument, boardHeader, sectionMarkup, boardWidth, boardHeightBudget, specimenWidth } from './board.mjs';
import { tokenBoard, paginateTokenBoard } from './token-board.mjs';

export const layers = ['Tokens', 'Components', 'Modules', 'Surfaces'];
export const hash = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.split(path.sep).join('/');
// A revision-only change must not rewrite every document.
export const contentHash = html => hash(html.replace(/<meta name="adg-provenance"[^>]*>/, ''));
const sizeStyle = frame => `width:${frame.width ? `${frame.width}px` : 'max-content'};${frame.height ? `height:${frame.height}px;` : ''}`;
function specimen(source, frame) {
  return `<div data-adg-frame="${escape(frame.name)}" data-specimen="${escape(`${source}#${frame.name}`)}" style="${sizeStyle(frame)}">${frame.html}</div>`;
}
const sourceTitle = source => path.basename(source) === 'index.tsx' ? path.basename(path.dirname(source)) : path.basename(source, '.tsx');
function section(item) {
  return sectionMarkup({title:sourceTitle(item.source),source:item.source,content:`<div data-adg-specimens>${item.frames.map(frame=>`<figure data-adg-specimen-caption="${escape(`${item.source}#${frame.name}`)}" style="--adg-span:${frame.span ?? 12}"><div data-adg-well>${specimen(item.source,frame)}</div><figcaption><span>${escape(frame.name)}</span>${frame.note ? `<small>${escape(frame.note)}</small>` : ''}${frame.proposed ? `<small>Proposed: ${escape(frame.proposed)}</small>` : ''}</figcaption></figure>`).join('')}</div>`});
}
export function chapterGroups(items, groups) {
  const byPath = new Map(items.map(item=>[item.relative,item])), used = new Set(), chapters=[];
  for (const [index, group] of groups.entries()) {
    const sources=group.assets.map(name=>byPath.get(name)).filter(item=>item&&!used.has(item.relative));
    if (!sources.length) continue;
    sources.forEach(item=>used.add(item.relative));
    for (const layer of layers) {
      const selected = sources.filter(item => item.layer === layer);
      if (selected.length) {
        const key = `group:${group.title}:${layer}`;
        if (chapters.some(chapter => chapter.key === key)) throw new CliError('CONFIG_INVALID', `Duplicate publishing chapter ${group.title} in ${layer}; give each gallery group in a layer a distinct title.`);
        chapters.push({key,title:group.title,layer,items:selected});
      }
    }
  }
  const dirs=new Map();
  for (const item of items) if (!used.has(item.relative)) {
    const dir=slash(path.dirname(item.relative));
    if (!dirs.has(dir)) { const chapter={key:`directory:${dir}`,title:dir === item.relative.split('/')[0] ? item.layer : path.basename(dir),layer:item.layer,items:[]};dirs.set(dir,chapter);chapters.push(chapter); }
    dirs.get(dir).items.push(item);
  }
  return chapters;
}
function makeBoard(chapter, items, number, part, config, revision) {
  const sources=items.map(item=>item.source), frameCount=items.reduce((n,item)=>n+item.frames.length,0);
  const title=chapter.title+(part>1 ? ` · ${part}` : '');
  const body=`<main data-adg-board>${boardHeader({title,projectName:config.name,layer:chapter.layer,number,sourceCount:sources.length,frameCount})}${items.map(section).join('')}</main>`;
  const css=[...new Set(items.map(item=>item.css))].join('\n');
  return {key:`chapter:${chapter.key}:${part}`,chapter:chapter.key,part,source:sources[0],sources,name:title,layer:chapter.layer,kind:'board',width:boardWidth,sourceCount:sources.length,frameCount,html:boardDocument(sources,body,css,revision)};
}
export async function deriveDocuments(config, revision) {
  const tokenSource=slash(path.relative(config.root,path.join(config.design,'tokens.css')));
  const documents=[tokenBoard(tokenSource,await readFile(path.join(config.design,'tokens.css'),'utf8'),revision,{projectName:config.name})];
  const production=config.sources.filter(name=>name!=='studies'), items=[];
  for (const file of listSources(config.design,config.sources)) {
    const relative=slash(path.relative(config.design,file));
    if (relative.startsWith('studies/')||isFeatureInternal(relative,config.sources)) continue;
    const index=production.indexOf(relative.split('/')[0]);
    const layer=index===0?'Components':index===production.length-1&&production.length>1?'Surfaces':'Modules';
    const source=slash(path.relative(config.root,file)),built=await buildSource(config,file,{write:false,allowLegacy:false});
    items.push({relative,source,layer,frames:built.frames,css:layer==='Surfaces'?built.css:resolveMedia(built.css,config.publish.viewport)});
  }
  const chapters=chapterGroups(items,readGroups(config.design,config.sources));
  const browser=await launch();
  try {
    await browserTask(browser,async()=>{
      const page=await browser.newPage({viewport:{width:boardWidth,height:900},reducedMotion:'reduce'});
      try {
        documents.splice(0,1,...await paginateTokenBoard(documents[0],page));
        const numbers=new Map();
        for (const chapter of chapters) {
          const boards=chapter.items.filter(item=>item.layer!=='Surfaces');
          if (boards.length) {
            const layer=chapter.layer;
            const number=(numbers.get(layer)??0)+1;numbers.set(layer,number);
            const full=makeBoard(chapter,boards,number,1,config,revision);
            await page.setContent(full.html);await page.evaluate(readyResources);
            const widths=await page.locator('[data-adg-well]>[data-adg-frame]').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));
            let i=0;for(const item of boards)for(const frame of item.frames)frame.span=Math.min(12,Math.max(1,Math.ceil((widths[i++]+48+24)/((specimenWidth+24)/12))));
            const sized=makeBoard(chapter,boards,number,1,config,revision);
            await page.setContent(sized.html);await page.evaluate(readyResources);
            const heights=await page.locator('[data-adg-section]').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
            const header=await page.locator('[data-adg-header]').evaluate(node=>node.getBoundingClientRect().height);
            let bucket=[],height=144+header,part=1;
            const emit=async()=>{
              const doc=makeBoard(chapter,bucket,number,part++,config,revision);
              await page.setContent(doc.html);await page.evaluate(readyResources);
              doc.height=Math.ceil(await page.locator('[data-adg-board]').evaluate(node=>node.getBoundingClientRect().height));documents.push(doc);
            };
            for (let n=0;n<boards.length;n++) {
              if(bucket.length&&height+heights[n]>boardHeightBudget){await emit();bucket=[];height=144+header;}
              bucket.push(boards[n]);height+=heights[n];
            }
            if(bucket.length)await emit();
          }
          for(const item of chapter.items.filter(item=>item.layer==='Surfaces'))for(const frame of item.frames)documents.push({key:`${item.source}#${frame.name}`,chapter:chapter.key,chapterTitle:chapter.title,source:item.source,sources:[item.source],frame:frame.name,name:`${chapter.title} · ${item.source} · ${frame.name}`,layer:'Surfaces',kind:'surface',width:frame.width,height:frame.height,html:boardDocument(item.source,specimen(item.source,frame),item.css,revision)});
        }
      }finally{await page.close();}
    });
  }finally{await browser.close();}
  for(const doc of documents)doc.hash=contentHash(doc.html);
  return documents;
}
export async function measureDocuments(documents,{launchBrowser=launch}={}) {
  const pending=documents.filter(doc=>!doc.width||!doc.height);
  if(!pending.length)return;
  const browser=await launchBrowser();
  try{await browserTask(browser,async()=>{
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    try{for(const doc of pending){
      await page.setViewportSize({width:Math.ceil(doc.width??1440),height:Math.ceil(doc.height??900)});
      await page.setContent(doc.html,{waitUntil:'load'});await page.evaluate(readyResources);
      const box=await page.locator(doc.kind==='surface'?'[data-adg-frame]':'[data-adg-board]').boundingBox();
      doc.width??=Math.max(1,Math.ceil(box.width));doc.height??=Math.max(1,Math.ceil(box.height));
    }}finally{await page.close();}
  });}finally{await browser.close();}
}
export function placeDocuments(documents) {
  for(const layer of layers){
    let x=0,y=0,previous,rowWidth=0,rowHeight=0;
    for(const doc of documents.filter(doc=>doc.layer===layer)){
      if(doc.kind==='surface'){
        if(previous&&previous!==doc.source){y+=rowHeight+120;rowWidth=0;rowHeight=0;}
        doc.x=rowWidth;doc.y=y;rowWidth+=doc.width+80;rowHeight=Math.max(rowHeight,doc.height);previous=doc.source;
      }else{doc.x=x;doc.y=0;x+=doc.width+240;}
    }
  }
}
