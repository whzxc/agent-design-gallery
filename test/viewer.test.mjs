import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from '../src/server.mjs';
import { states, recent } from '../fixtures/viewer.mjs';
import config from '../sdg.config.mjs';
import { icon } from '../public/icons.js';
import { overlaps } from '../public/labels.js';
import { launch } from '../src/toolkit/browser.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';

const root = path.resolve(import.meta.dirname, '..');
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'sdg-viewer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('every approved frame maps to an isolated fixture environment', async () => {
  const project = await loadConfig(root);
  const sources = await Promise.all(['canvas','inspector','menus','open-directory'].map(name => buildSource(project,path.join(root,'design/surfaces',name+'.tsx'),{write:false})));
  const declared = sources.flatMap(source => source.frames.map(frame => frame.fixture));
  assert.deepEqual(Object.keys(states).sort(), [...new Set(declared)].sort());
  for (const name of declared) {
    const fixture=config.compare.fixture(name);
    assert.equal(fixture.url, `/?fixture=${name}`); assert.equal(fixture.theme,states[name].theme);
    assert.equal(fixture.locale,'en-US'); assert.ok(Number.isFinite(Date.parse(fixture.clock)));
  }
  assert.throws(()=>config.compare.fixture('unknown'), /Unknown SDG fixture/);
});
test('icons preserve rendered stroke and label collisions include both axes', () => {
  assert.match(icon('folder',16),/stroke-width="2.625"/);
  assert.match(icon('x',14),/stroke-width="3"/);
  assert.match(icon('panel-left'),/aria-hidden="true"/);
  assert.equal(overlaps({x:0,y:0,width:10,height:10},{x:9,y:9,width:5,height:5}),true);
  assert.equal(overlaps({x:0,y:0,width:10,height:10},{x:10,y:0,width:5,height:5}),false);
});
test('server serves the packaged token source and ignores fixture queries in normal use', async t => {
  const temporaryRoot=await temporary(t), server=await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory:temporaryRoot});
  t.after(()=>server.close());
  const tokens=await fetch(new URL('/tokens.css',server.url));
  assert.equal(tokens.status,200);assert.equal(await tokens.text(),await readFile(path.join(root,'design/tokens.css'),'utf8'));
  for(const file of ['app.js','assets.js','icons.js','layout.js','labels.js']) assert.equal((await fetch(new URL('/'+file,server.url))).status,200);
  const manifest=await (await fetch(new URL('/manifest?fixture=open-empty',server.url))).json();
  assert.ok(manifest.directory);assert.equal(manifest.fixture,undefined);
  const empty=path.join(temporaryRoot,'empty');await mkdir(empty);
  const response=await fetch(new URL('/open',server.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({directory:empty})});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'No SVG files in this directory.');
  assert.equal((await (await fetch(new URL('/manifest',server.url))).json()).directory,manifest.directory);
});
test('missing directory CLI errors name the path on one plain line', async t => {
  const directory=path.join(await temporary(t),'absent');
  await assert.rejects(promisify(execFile)(process.execPath,[path.join(root,'src/cli.mjs'),'open',directory,'--no-open']),error=>{
    assert.equal(error.code,2);assert.equal(error.stderr.trim().split('\n').length,1);
    assert.match(error.stderr,/Directory not found/);assert.ok(error.stderr.includes(directory));
    assert.doesNotMatch(error.stderr,/ENOENT|review sdg/);return true;
  });
});
test('catalog is usable before asset preparation and retains a queued selection', {timeout:30000}, async t => {
  const stateDirectory = await temporary(t);
  const server = await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory});
  const browser = await launch();
  let release;
  const gate = new Promise(resolve => {release=resolve});
  try {
    const page = await browser.newPage();
    await page.route('**/asset/**', async route => {await gate;await route.continue()});
    await page.goto(server.url, {waitUntil:'domcontentloaded'});
    await page.locator('#all').waitFor();
    assert.equal(await page.locator('#sidebar').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.__sdg.assets),0);
    assert.equal(await page.evaluate(()=>window.__sdg.ready),false);
    await page.getByRole('button',{name:'Toggle Essentials',exact:true}).click();
    await page.locator('[data-navkey="file:components/button.tsx"]').click();
    release();
    await page.waitForFunction(()=>window.__sdg.ready);
    assert.equal(await page.locator('#source-name').textContent(),'button');
    assert.equal(await page.locator('[data-navkey="file:components/button.tsx"]').getAttribute('aria-current'),'true');
    assert.equal(await page.locator('#error').isVisible(),false);
  } finally {release();await browser.close();await server.close()}
});
test('camera and selected form survive immediate reload and a server restart', {timeout:30000}, async t => {
  const stateDirectory=await temporary(t), directory=path.join(root,'fixtures/arc-sample/design');
  let server=await startServer({directory,stateDirectory});
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(server.url);await page.waitForFunction(()=>window.__sdg?.ready);
    await page.getByRole('button',{name:'Toggle Essentials',exact:true}).click();
    await page.locator('[data-navkey="file:components/button.tsx"]').click();
    await page.locator('#inspect').click();
    await page.locator('#forms button').filter({hasText:/^secondary/}).click();
    await page.locator('#plus').click();
    const camera=await page.evaluate(()=>window.__sdg.view);
    // Reload inside the save debounce, without waiting for camera settling.
    await page.reload();await page.waitForFunction(()=>window.__sdg?.ready);
    assert.deepEqual(await page.evaluate(()=>window.__sdg.view),camera);
    assert.equal(await page.locator('[data-navkey="file:components/button.tsx"]').getAttribute('aria-current'),'true');
    assert.match(await page.locator('#forms [aria-current=true]').textContent(),/^secondary/);
    const data=await(await fetch(new URL('/manifest',server.url))).json();
    assert.deepEqual(data.selection,{path:'components/button.tsx',form:'secondary',group:'Essentials'});
    assert.equal(data.assets.find(a=>a.path==='components/button.tsx').modifiedAt,(await stat(path.join(directory,'components/button.tsx'))).mtimeMs);
    const time=page.locator('.canvas-label:not([hidden]) time').first();
    await time.waitFor({timeout:3000});assert.ok(await time.getAttribute('datetime'));assert.ok(await time.getAttribute('title'));
    await page.close();await server.close();
    server=await startServer({directory,stateDirectory});
    const restored=await browser.newPage({viewport:{width:1440,height:900}});
    await restored.goto(server.url);await restored.waitForFunction(()=>window.__sdg?.ready);
    assert.deepEqual(await restored.evaluate(()=>window.__sdg.view),camera);
    assert.equal(await restored.locator('#source-name').textContent(),'button');
    assert.match(await restored.locator('#forms [aria-current=true]').textContent(),/^secondary/);
    const heading = restored.locator('.canvas-label:not([hidden])').filter({hasText:/^button/});
    const before = await heading.boundingBox();
    await restored.locator('.gallery-viewport').evaluate(async el => {
      el.dispatchEvent(new WheelEvent('wheel',{deltaX:8,deltaY:0,bubbles:true,cancelable:true}));
      await new Promise(requestAnimationFrame);
    });
    assert.equal((await heading.boundingBox()).x,before.x,'clipped headings remain pinned during small pans');
  } finally {await browser.close();await server.close()}
});
test('all fixture states reach drawn readiness without screenshots or persisted preferences', {timeout:90000}, async t => {
  const temporaryRoot=await temporary(t),empty=path.join(temporaryRoot,'empty');await mkdir(empty);
  const server=await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory:temporaryRoot,fixtures:{states,recent,paths:{'~/projects/empty':empty}}});
  const browser=await launch();
  try {
    for(const [name,state] of Object.entries(states)) {
      const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:state.theme,reducedMotion:'reduce',locale:'en-US'});
      let fail;const pageError=new Promise((_,reject)=>{fail=reject});page.on('pageerror',error=>fail(new Error(`${name}: ${error.message}`)));
      try {
        await page.goto(new URL(config.compare.fixture(name).url,server.url).href);
        await Promise.race([config.compare.ready(page,name),pageError]);
        assert.equal(await page.evaluate(()=>window.__sdg.ready),true,name);
        assert.equal(await page.locator('html').getAttribute('data-theme'),state.theme,name);
        assert.equal(await page.locator('#sidebar').isVisible(),state.sidebar&&!state.empty,name);
        if(state.asset) assert.equal(await page.locator('#source-name').textContent(),path.basename(state.asset,'.tsx'),name);
        if(state.menu) assert.equal(await page.locator('#'+state.menu).evaluate(el=>el.matches(':popover-open')),true,name);
        if(state.inspector) assert.equal(await page.locator('#source').isVisible(),true,name);
        if(state.dialog) assert.equal(await page.locator('#'+state.dialog).evaluate(el=>el.open),true,name);
        if(state.empty) assert.equal(await page.locator('#close').isVisible(),false);
        if(state.submit) assert.equal(await page.locator('#open-error span:last-child').textContent(),'No SVG files in this directory.');
        if(state.query) { assert.equal(await page.locator('.search-result').count(),2);assert.match(await page.locator('.search-result').first().textContent(),/state-pill/); }
        const relativeBox = async (selector, parent) => page.locator(selector).first().evaluate((el, parent) => {
          const box=el.getBoundingClientRect(), origin=document.querySelector(parent).getBoundingClientRect();
          return [box.x-origin.x,box.y-origin.y,box.width,box.height];
        }, parent);
        if(name==='sample-overview') {
          const actual=await page.evaluate(async()=>{
            const {prepare,arrange}=await import('/assets.js');
            const manifest=await(await fetch('/manifest')).json();
            const assets=await Promise.all(manifest.assets.map(a=>prepare(a,'light')));
            return {paths:manifest.assets.map(a=>a.path),sections:arrange({...manifest,assets}).groups.map(({title,x,y,w,h,blocks})=>({title,x,y,w,h,blocks}))};
          });
          const reference=JSON.parse(await readFile(path.join(root,'fixtures/arc-sample.layout.json'),'utf8'));
          assert.equal(actual.paths.length,51);assert.ok(actual.paths.every(p=>p.endsWith('.tsx')));
          assert.deepEqual(actual.sections,reference.sections);
        }
        if(name==='sample-zoomed') {
          for(const caption of ['regular','compact']) assert.equal(await page.locator('#labels .canvas-label:not([hidden])').filter({hasText:new RegExp(`^${caption}$`)}).count(),1);
        }
        if(name==='sample-inspect-frame') {
          assert.equal(Math.round(await page.evaluate(()=>window.__sdg.view.scale)*100),71);
          assert.equal((await relativeBox('.source-actions','#source'))[1],68);
          assert.deepEqual(await relativeBox('#forms .tree-row','#source'),[8,152,284,28]);
          assert.equal(await page.locator('#source-path').evaluate(el=>getComputedStyle(el).fontSize),'12px');
        }
        if(name==='sidebar-search') assert.equal((await relativeBox('.search-result','#sidebar'))[1],164);
        if(name==='menu-zoom') {
          const gap=await page.evaluate(()=>document.querySelector('.zoom').getBoundingClientRect().top-document.querySelector('#zoom-menu').getBoundingClientRect().bottom);
          assert.equal(gap,8);
        }
        if(name==='dialog-shortcuts') assert.equal((await relativeBox('#keys dl','#keys'))[1],64);
        if(name==='tooltip-inspector') {
          assert.equal(await page.locator('#tooltip').evaluate(el=>el.getBoundingClientRect().height),26);
          assert.equal(await page.locator('#tooltip').evaluate(el=>getComputedStyle(el).fontSize),'12px');
        }
        if(name==='sample-components') {
          assert.equal((await relativeBox('#all','#sidebar'))[1],136);
          assert.equal((await relativeBox('#modules>.rule','#sidebar'))[1],168);
          assert.deepEqual((await relativeBox('.group-name','#sidebar')).slice(0,2),[40,176]);
          assert.equal(await page.locator('#labels .canvas-label:not([hidden])').filter({hasText:/^icon-button$/}).count(),1);
          assert.equal(await page.locator('#search').getAttribute('placeholder'),'Find assets…');
          assert.ok(await page.locator('#labels .canvas-label:not([hidden])').count()>0);
          const view=await page.evaluate(()=>window.__sdg.view);
          await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
          assert.deepEqual(await page.evaluate(()=>window.__sdg.view),view);
          await page.getByRole('button',{name:'Expand sidebar',exact:true}).focus();
          await page.keyboard.press('1');
          assert.equal(await page.evaluate(()=>window.__sdg.view.scale),1);
          await page.keyboard.press('0');
          assert.ok(await page.evaluate(()=>window.__sdg.view.scale)<.2);
        }
      } finally { await page.close(); }
    }
    await assert.rejects(access(path.join(temporaryRoot,'state.json')), {code:'ENOENT'});
  } finally { await browser.close();await server.close(); }
});

test('camera pans retain labels, while scale, settle and viewport changes refresh them', {timeout:30000}, async t => {
  const temporaryRoot=await temporary(t);
  const server=await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory:temporaryRoot,fixtures:{states,recent}});
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(new URL('/?fixture=sample-zoomed',server.url).href);
    await config.compare.ready(page,'sample-zoomed');
    const pan=await page.evaluate(async()=>{
      const {Labels}=await import('/labels.js'), update=Labels.prototype.update;
      const rect=Element.prototype.getBoundingClientRect;
      window.labelWork={updates:0,chromeReads:0,childWrites:0};
      Labels.prototype.update=function(...args){window.labelWork.updates++;return update.apply(this,args)};
      Element.prototype.getBoundingClientRect=function(){
        if(this.matches('.floating, [popover], dialog, #tooltip'))window.labelWork.chromeReads++;
        return rect.call(this);
      };
      const layer=document.querySelector('.label-layer'), viewport=document.querySelector('.gallery-viewport');
      const observer=new MutationObserver(records=>{window.labelWork.childWrites+=records.filter(r=>r.target!==layer).length});
      observer.observe(layer,{subtree:true,attributes:true,childList:true,characterData:true});
      const snapshot=()=>[...layer.children].filter(el=>!el.hidden).map(el=>[el.textContent,el.style.transform]);
      const before=snapshot(), camera=window.__sdg.view;
      // Keep each event inside the idle interval; one animation frame per move.
      for(let i=0;i<12;i++) {
        viewport.dispatchEvent(new WheelEvent('wheel',{deltaX:2,deltaY:1,bubbles:true,cancelable:true}));
        await new Promise(requestAnimationFrame);
      }
      await Promise.resolve();observer.disconnect();
      return {before,after:snapshot(),camera,view:window.__sdg.view,work:{...window.labelWork},transform:layer.style.transform};
    });
    assert.ok(pan.before.length>0);
    assert.deepEqual(pan.after,pan.before);
    assert.deepEqual(pan.work,{updates:0,chromeReads:0,childWrites:0});
    assert.equal(pan.view.x,pan.camera.x-24);assert.equal(pan.view.y,pan.camera.y-12);
    assert.equal(pan.transform,'translate(-24px, -12px)');
    await page.waitForFunction(()=>window.__sdg.ready);
    assert.equal(await page.evaluate(()=>window.labelWork.updates),1);
    assert.equal(await page.locator('.label-layer').evaluate(el=>el.style.transform),'translate(0px, 0px)');
    const zoom=await page.evaluate(async()=>{
      window.labelWork={updates:0,chromeReads:0,childWrites:0};
      const viewport=document.querySelector('.gallery-viewport');
      for(let i=0;i<3;i++) {
        viewport.dispatchEvent(new WheelEvent('wheel',{deltaY:-5,ctrlKey:true,clientX:800,clientY:400,bubbles:true,cancelable:true}));
        await new Promise(requestAnimationFrame);
      }
      return {...window.labelWork};
    });
    assert.equal(zoom.updates,3);assert.equal(zoom.chromeReads,0);
    await page.waitForFunction(()=>window.__sdg.ready);
    const immediate=await page.evaluate(async()=>{
      const viewport=document.querySelector('.gallery-viewport'),before=window.labelWork.updates;
      viewport.dispatchEvent(new WheelEvent('wheel',{deltaX:40,deltaY:0,bubbles:true,cancelable:true}));
      await new Promise(requestAnimationFrame);
      return window.labelWork.updates-before;
    });
    assert.equal(immediate,1,'large pans refresh visible labels without waiting for the idle timer');
    const updates=await page.evaluate(()=>window.labelWork.updates);
    await page.setViewportSize({width:1200,height:800});
    await page.waitForFunction(previous=>window.labelWork.updates>previous&&window.__sdg.ready,updates);
    assert.ok(await page.evaluate(()=>window.labelWork.chromeReads)>0);
  } finally {await browser.close();await server.close()}
});

test('canvas names copy by pointer and keyboard without changing the camera or selection', {timeout:30000}, async t => {
  const stateDirectory=await temporary(t);
  const server=await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory,fixtures:{states,recent}});
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.addInitScript(()=>{
      window.copiedNames=[];
      window.nativeClipboardWrite=navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{
        if(window.copyFailure) throw Error('Clipboard access denied');
        window.copiedNames.push(text);
      }});
    });
    await page.goto(new URL('/?fixture=sample-inspect-component',server.url).href);
    await config.compare.ready(page,'sample-inspect-component');
    const view=await page.evaluate(()=>window.__sdg.view);
    const name=page.getByRole('button',{name:'Copy button name',exact:true});
    const glyph=name.locator('.label-copy-icon');
    const bounds=await name.boundingBox();
    assert.equal(await glyph.evaluate(el=>getComputedStyle(el).opacity),'0');
    await name.hover();
    assert.equal(await glyph.evaluate(el=>getComputedStyle(el).opacity),'1');
    await page.mouse.move(0,0);
    assert.equal(await glyph.evaluate(el=>getComputedStyle(el).opacity),'0');
    assert.deepEqual(await name.boundingBox(),bounds);
    await name.locator('.label-copy-icon').click();
    await page.getByRole('button',{name:'Copied button',exact:true}).waitFor();
    await page.mouse.move(0,0);
    assert.equal(await page.getByRole('button',{name:'Copied button',exact:true}).locator('.label-copy-icon').evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.deepEqual(await page.evaluate(()=>window.copiedNames),['button']);
    assert.deepEqual(await page.evaluate(()=>window.__sdg.view),view);
    assert.equal(await page.locator('#source-name').textContent(),'button');
    await name.waitFor({timeout:2500});
    assert.equal(await glyph.evaluate(el=>getComputedStyle(el).opacity),'0');
    await name.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await glyph.evaluate(el=>getComputedStyle(el).opacity),'1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.copiedNames.length===2);
    assert.deepEqual(await page.evaluate(()=>window.__sdg.view),view);
    await page.evaluate(()=>{window.copyFailure=true});
    await page.getByRole('button',{name:'Copy primary name',exact:true}).click();
    await page.locator('#error').waitFor();
    assert.match(await page.locator('#error').textContent(),/Clipboard access denied/);
    assert.deepEqual(await page.evaluate(()=>window.copiedNames),['button','button']);
    await page.evaluate(()=>{window.copyFailure=false});
    await page.getByRole('button',{name:'Copy primary name',exact:true}).focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>window.copiedNames.length===3);
    assert.equal((await page.evaluate(()=>window.copiedNames)).at(-1),'primary');
    assert.equal(await page.locator('#error').isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>window.__sdg.view),view);
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(server.url).origin});
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:window.nativeClipboardWrite}));
    await name.waitFor();await name.click();
    await page.getByRole('button',{name:'Copied button',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'button');
  } finally {await browser.close();await server.close()}
});

test('TSX sets and flows use built frame sizes, inline previews, notes and import-dependent refresh', {timeout:30000}, async t=>{
  const {writeFile}=await import('node:fs/promises');
  const {init}=await import('../src/toolkit/project.mjs');
  const temporaryRoot=await temporary(t);init({root:temporaryRoot},()=>{});
  const directory=path.join(temporaryRoot,'design');
  await mkdir(path.join(directory,'scenes'));
  await writeFile(path.join(directory,'scenes/sizes.tsx'),'export const widths=[900,700,500];');
  for(const name of ['helper.tsx','art/helper.tsx','components/nested/helper.tsx','surfaces/nested/helper.tsx']) {
    await mkdir(path.dirname(path.join(directory,name)),{recursive:true});
    await writeFile(path.join(directory,name),'imports only');
  }
  await writeFile(path.join(directory,'components/forms.tsx'),`import {Frame} from 'sdg';import {widths} from '../scenes/sizes';export default()=>widths.map((width,i)=><Frame name={'form-'+i} width={width} height={20+i*10} note={'Note '+i}><div class="bg-text text-canvas" style={{width,height:20+i*10}}>Form {i}</div></Frame>);`);
  await writeFile(path.join(directory,'surfaces/flow.tsx'),`import {Frame} from 'sdg';export default()=>['one','two'].map(name=><Frame name={name} width={100} height={50}><div class="w-[100px] h-[50px] bg-text">{name}</div></Frame>);`);
  const server=await startServer({directory,stateDirectory:path.join(temporaryRoot,'state')});const browser=await launch();
  try{
    const page=await browser.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.__sdg?.ready);
    const result=await page.evaluate(async()=>{
      const {prepare,arrange,imageURL}=await import('/assets.js');const data=await(await fetch('/manifest')).json();const assets=await Promise.all(data.assets.map(a=>prepare(a,'light')));
      const set=assets.find(a=>a.component),flow=assets.find(a=>!a.component),world=arrange({...data,assets});
      const src=imageURL(set,{...set.full,id:'overview'});await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=src});URL.revokeObjectURL(src);
      return {paths:data.assets.map(a=>a.path),parts:set.parts,blocks:world.groups.flatMap(g=>g.blocks).map(b=>({kind:b.kind,w:b.w,h:b.h,frames:b.frames})),note:set.parts[0].note,version:data.assets.find(a=>a.path===set.path).version};
    });
    assert.deepEqual(result.paths,['components/forms.tsx','surfaces/flow.tsx']);
    assert.deepEqual(result.parts.map(p=>[p.x,p.y]),[[0,0],[0,68],[732,68]]);assert.equal(result.note,'Note 0');
    assert.deepEqual(result.blocks.map(b=>[b.kind,b.w,b.h]),[['set',1280,168],['flow',328,82]]);
    await writeFile(path.join(directory,'scenes/sizes.tsx'),'export const widths=[901,700,500];');
    await page.evaluate(async version=>{
      for(let i=0;i<100;i++) {
        const current=(await(await fetch('/manifest')).json()).assets.find(a=>a.path==='components/forms.tsx').version;
        if(current!==version)return;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw Error('Imported source did not invalidate its dependent');
    },result.version);
    const rebuilt=await(await fetch(new URL('/asset/components%2Fforms.tsx?theme=light',server.url))).json();assert.equal(rebuilt.frames[0].width,901);
    assert.equal(await page.locator('#full-sheet').count(),0);
  }finally{await browser.close();await server.close();}
  await writeFile(path.join(directory,'gallery.json'),JSON.stringify({groups:[{title:'Helpers',assets:['scenes/sizes.tsx']}]}));
  await assert.rejects(startServer({directory,stateDirectory:path.join(temporaryRoot,'state')}),/gallery.json: Invalid source scenes\/sizes.tsx/);
});

test('dedicated legacy SVG sheets retain measurement, form crops and renderable previews', async t => {
  const server = await startServer({directory:path.join(root,'fixtures/legacy-svg'),stateDirectory:await temporary(t)});
  const browser = await launch();
  try {
    const page=await browser.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.__sdg?.ready);
    const result=await page.evaluate(async()=>{
      const {prepare,arrange,imageURL}=await import('/assets.js');
      const manifest=await(await fetch('/manifest')).json();
      const assets=await Promise.all(manifest.assets.map(a=>prepare(a,'light')));
      const world=arrange({...manifest,assets}), previews=[];
      for(const item of world.items) {
        const url=imageURL(item,item.shown[0]);
        const image=new Image();image.src=url;await image.decode();
        const document=new DOMParser().parseFromString(await(await fetch(url)).text(),'image/svg+xml');
        previews.push({notes:document.querySelectorAll('text.note').length,frames:document.querySelectorAll('[data-part]').length});URL.revokeObjectURL(url);
      }
      return {parts:assets.map(a=>a.parts),blocks:world.groups.flatMap(g=>g.blocks).map(b=>[b.kind,b.w,b.h]),previews};
    });
    assert.deepEqual(result.parts.map(parts=>parts.map(({name,x,y,width,height})=>[name,x,y,width,height])),[
      [['primary',40,62,100,34],['secondary',180,62,70,34]],
      [['ready',20,30,100,60],['empty',20,130,200,80]],
    ]);
    assert.deepEqual(result.blocks,[['set',258,94],['flow',428,112]]);
    assert.deepEqual(result.previews,[{notes:0,frames:0},{notes:0,frames:1},{notes:0,frames:1}]);
  } finally {await browser.close();await server.close();}
});
