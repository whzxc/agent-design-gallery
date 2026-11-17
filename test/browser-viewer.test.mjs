// Start the longest browser suite in the initial test-runner batch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from '../src/server.mjs';
import { states, recent, commentThreadState } from '../fixtures/viewer.mjs';
import { hubFixtures } from '../fixtures/hub-compare.mjs';
import comments from '../design/fixtures/comments.json' with { type: 'json' };
import config from '../adg.config.mjs';
import { icon } from '../public/icons.js';
import { overlaps } from '../public/labels.js';
import { launch } from '../src/toolkit/browser.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { listSources } from '../src/toolkit/project.mjs';

const root = path.resolve(import.meta.dirname, '..');
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-viewer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('token board opens by default and its list reads both themes, updates on save and preserves the design camera', { timeout: 30000 }, async t => {
  const folder = await temporary(t), directory = path.join(folder, 'design');
  await mkdir(directory);
  await writeFile(path.join(directory, 'button.svg'), await readFile(path.join(root, 'fixtures/legacy-svg/components/button.svg')));
  const source = path.join(directory, 'tokens.css');
  const tokens = `:root {
  --font-ui: system-ui;
  --font-mono: monospace;
  --canvas: #fff;
  --text: #333;
  --accent: var(--text);
  --space-2: 8px;
  --radius-card: 12px;
}
:root[data-theme="dark"] {
  --text: #eee;
  --radius-card: 16px;
}`;
  await writeFile(source, tokens);
  const server = await startServer({ directory, stateDirectory: path.join(folder, 'state') });
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const designRequests = [];
    page.on('request', request => {
      if (/^\/(?:asset|metadata|preview)\//.test(new URL(request.url()).pathname)) designRequests.push(request.url());
    });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async text => { window.copiedToken = text; } },
    }));
    const events = page.waitForResponse(response => new URL(response.url()).pathname === '/events' && response.ok());
    await page.goto(server.url + '?scope=tokens');
    await page.waitForFunction(() => window.__adg?.ready);
    await events;
    assert.deepEqual(designRequests, [], 'opening tokens must not request artboards');
    assert.equal(await page.locator('.token-board-drawing').isVisible(), true);
    assert.equal(await page.locator('#token-catalog').isVisible(), false);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.locator('#token-list-toggle').click();
    assert.equal(await page.locator('#token-catalog').isVisible(), true);
    const accent = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Copy --accent', exact: true }) });
    assert.deepEqual(await accent.locator('.token-swatch').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor)),
      ['rgb(51, 51, 51)', 'rgb(238, 238, 238)']);
    const search = page.getByRole('searchbox', { name: 'Find tokens' });
    await search.fill('16px');
    await page.getByRole('button', { name: 'Copy --radius-card', exact: true }).click();
    assert.equal(await page.evaluate(() => window.copiedToken), '--radius-card');
    assert.equal(await page.locator('.token-copy').count(), 1, 'search includes dark values');
    await page.getByRole('button', { name: 'Clear search' }).click();
    assert.equal(await page.locator('#sidebar').isVisible(), false, 'token search keeps Contents closed');
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.getByRole('button', { name: /^Spacing & size/ }).click();
    assert.deepEqual(await page.locator('.token-value code').allTextContents(), ['8px', '8px']);
    await writeFile(source, tokens.replace('8px', '10px'));
    await page.waitForFunction(() => document.querySelector('.token-value code')?.textContent === '10px');
    const switchScope = async to => {
      await page.getByRole('tab', { name: to, exact: true }).click();
      await page.waitForFunction(scope => window.__adg.ready && window.__adg.scope === scope,
        to === 'Tokens' ? 'tokens' : 'all', { timeout: 5000 });
    };
    await switchScope('All designs');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const camera = await page.evaluate(() => window.__adg.view);
    await switchScope('Tokens');
    await switchScope('All designs');
    assert.deepEqual(await page.evaluate(() => window.__adg.view), camera);
  } finally {
    await browser.close();
    await server.close();
  }
});

test('implementation captures map to isolated fixture environments', async () => {
  const project = await loadConfig(root);
  const sources = await Promise.all(listSources(project.design, project.sources)
    .map(file => buildSource(project, file, {write:false})));
  const declared = sources.flatMap(source => source.frames.filter(frame => frame.fixture).map(frame => frame.fixture));
  assert.ok(declared.length > 0);
  assert.equal(new Set(declared).size, declared.length);
  for (const name of declared) {
    const fixture=config.compare.fixture(name);
    const state = name === comments.commentCanvas.fixture ? commentThreadState : states[name];
    assert.equal(fixture.url, hubFixtures[name] ?? `/?fixture=${name}`);
    assert.equal(fixture.theme, Object.hasOwn(hubFixtures, name) ? 'light' : state.theme);
    assert.equal(fixture.locale,'en-US'); assert.ok(Number.isFinite(Date.parse(fixture.clock)));
  }
  assert.throws(()=>config.compare.fixture('unknown'), /Unknown ADG fixture/);
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
  for(const file of ['app.js','assets.js','icons.js','layout.js','labels.js','boards.js']) assert.equal((await fetch(new URL('/'+file,server.url))).status,200);
  const manifest=await (await fetch(new URL('/manifest?fixture=open-empty',server.url))).json();
  assert.ok(manifest.directory);assert.equal(manifest.fixture,undefined);
  const empty=path.join(temporaryRoot,'empty');await mkdir(empty);
  const response=await fetch(new URL('/open',server.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({directory:empty})});
  assert.equal(response.status,404);
  assert.equal((await (await fetch(new URL('/manifest',server.url))).json()).directory,manifest.directory);
});
test('missing directory CLI errors name the path on one plain line', async t => {
  const directory=path.join(await temporary(t),'absent');
  await assert.rejects(promisify(execFile)(process.execPath,[path.join(root,'src/cli.mjs'),'open',directory,'--no-open']),error=>{
    assert.equal(error.code,2);assert.equal(error.stderr.trim().split('\n').length,1);
    assert.match(error.stderr,/Directory not found/);assert.ok(error.stderr.includes(directory));
    assert.doesNotMatch(error.stderr,/ENOENT|review adg/);return true;
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
    await page.getByRole('tab',{name:'Components',exact:true}).waitFor();
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Tokens', 'Components', 'Modules', 'Surfaces', 'All designs']);
    assert.equal(await page.locator('#sidebar').isVisible(),false);
    assert.equal(await page.locator('#inspect').isEnabled(),false);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    assert.equal(await page.evaluate(()=>window.__adg.assets),0);
    assert.equal(await page.evaluate(()=>window.__adg.ready),false);
    await page.locator('[data-navkey="file:components/button.tsx"]').click();
    release();
    await page.waitForFunction(()=>window.__adg.ready);
    assert.equal(await page.locator('#source-name').textContent(),'button');
    assert.equal(await page.locator('[data-navkey="file:components/button.tsx"]').getAttribute('aria-current'),'true');
    assert.equal(await page.locator('#error').isVisible(),false);
    const camera = await page.evaluate(() => window.__adg.view);
    await page.getByRole('button', {name:'Contents',exact:true}).click();
    await page.locator('#search').fill('button');
    assert.equal(await page.locator('#sidebar').isVisible(),true);
    assert.equal(await page.locator('[data-navkey="search:components/button.tsx:"]').isVisible(),true);
    await page.locator('#search-clear').click();
    assert.equal(await page.locator('#sidebar').isVisible(),false);
    assert.equal(await page.locator('#tools > button').last().getAttribute('id'),'inspect');
    await page.locator('#inspect').click();
    assert.equal(await page.locator('#source').isVisible(),true);
    assert.deepEqual(await page.evaluate(() => window.__adg.view),camera);
    await page.locator('#more').click();
    assert.equal(await page.locator('#fullscreen').isVisible(),true);
    await page.locator('#themes [data-theme="dark"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  } finally {release();await browser.close();await server.close()}
});
test('camera and selected form survive immediate reload and a server restart', {timeout:30000}, async t => {
  const stateDirectory=await temporary(t), directory=path.join(root,'fixtures/arc-sample/design');
  let server=await startServer({directory,stateDirectory});
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(server.url);await page.waitForFunction(()=>window.__adg?.ready);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.locator('[data-navkey="file:components/button.tsx"]').click();
    await page.locator('#inspect').click();
    await page.locator('#forms button').filter({hasText:/^secondary/}).click();
    await page.locator('#plus').click();
    const camera=await page.evaluate(()=>window.__adg.view);
    // Reload inside the save debounce, without waiting for camera settling.
    await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    assert.deepEqual(await page.evaluate(()=>window.__adg.view),camera);
    assert.equal(await page.locator('[data-navkey="file:components/button.tsx"]').getAttribute('aria-current'),'true');
    assert.match(await page.locator('#forms [aria-current=true]').textContent(),/^secondary/);
    assert.equal(await page.locator('#source').isVisible(),false);
    const data=await(await fetch(new URL('/manifest?scope=layer:components',server.url))).json();
    assert.deepEqual(data.selection,{path:'components/button.tsx',form:'secondary',group:'Essentials',element:null});
    assert.equal(data.assets.find(a=>a.path==='components/button.tsx').modifiedAt,(await stat(path.join(directory,'components/button.tsx'))).mtimeMs);
    const modified=page.locator('.board-source').filter({has:page.locator('[data-source="components/button.tsx"]')}).locator('.board-modified');
    await modified.waitFor({timeout:3000});assert.ok((await modified.textContent()).trim());
    await page.close();await server.close();
    server=await startServer({directory,stateDirectory});
    const restored=await browser.newPage({viewport:{width:1440,height:900}});
    await restored.goto(server.url);await restored.waitForFunction(()=>window.__adg?.ready);
    assert.deepEqual(await restored.evaluate(()=>window.__adg.view),camera);
    assert.equal(await restored.locator('#source-name').textContent(),'button');
    assert.match(await restored.locator('#forms [aria-current=true]').textContent(),/^secondary/);
    const heading = restored.locator('.board-source [data-source="components/button.tsx"]');
    const before = await heading.boundingBox();
    await restored.locator('.gallery-viewport').evaluate(async el => {
      el.dispatchEvent(new WheelEvent('wheel',{deltaX:8,deltaY:0,bubbles:true,cancelable:true}));
      await new Promise(requestAnimationFrame);
    });
    assert.ok(Math.abs((await heading.boundingBox()).x-before.x+8)<.1,'board source titles pan with their specimens');
  } finally {await browser.close();await server.close()}
});
test('all board fixture states reach drawn readiness without persisted preferences', {timeout:90000}, async t => {
  const temporaryRoot=await temporary(t);
  const server=await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory:temporaryRoot,fixtures:{states,recent}});
  const browser=await launch();
  try {
    const fixtureEntries=Object.entries(states);let nextFixture=0;
    await Promise.all(Array.from({length:2},async()=>{
      while(nextFixture<fixtureEntries.length) {
      const [name,state]=fixtureEntries[nextFixture++];
      const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:state.theme,reducedMotion:'reduce',locale:'en-US'});
      let fail;const pageError=new Promise((_,reject)=>{fail=reject});page.on('pageerror',error=>fail(new Error(`${name}: ${error.message}`)));
      try {
        await page.goto(new URL(config.compare.fixture(name).url,server.url).href);
        await Promise.race([config.compare.ready(page,name),pageError]);
        assert.equal(await page.evaluate(()=>window.__adg.ready),true,name);
        assert.equal(await page.locator('html').getAttribute('data-theme'),state.theme,name);
        assert.equal(await page.locator('#sidebar').isVisible(),state.sidebar&&!state.empty,name);
        if(state.asset) assert.equal(await page.locator('#source-name').textContent(),path.basename(state.asset,'.tsx'),name);
        if(state.menu) assert.equal(await page.locator('#'+state.menu).evaluate(el=>el.matches(':popover-open')),true,name);
        if(state.inspector) assert.equal(await page.locator('#source').isVisible(),true,name);
        if(state.dialog) assert.equal(await page.locator('#'+state.dialog).evaluate(el=>el.open),true,name);
        assert.equal(await page.locator('#directories').count(),0);
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
            return {paths:manifest.assets.map(a=>a.path),sections:arrange({...manifest,assets}).groups.map(({title,layer,x,y,w,h,blocks})=>({title,layer,x,y,w,h,blocks}))};
          });
          const reference=JSON.parse(await readFile(path.join(root,'fixtures/arc-sample.layout.json'),'utf8'));
          assert.equal(actual.paths.length,51);assert.ok(actual.paths.every(p=>p.endsWith('.tsx')));
          const structure=sections=>sections.map(({title,layer,blocks})=>[title,layer,blocks.map(({asset,frames})=>[asset,frames.map(frame=>frame.name)])]);
          assert.deepEqual(structure(actual.sections),structure(reference.sections));
          const sectionSources=actual.sections.flatMap(section=>section.blocks.map(block=>block.asset));
          assert.deepEqual([...sectionSources].sort(),[...actual.paths].sort());
          for(const section of actual.sections) {
            assert.ok(section.w>=1680 && section.h>0);
            const placed=[];
            for(const {asset,x,y,w,h,frames} of section.blocks) {
              assert.ok(w>0 && h>0 && x>=0 && y>=0 && x+w<=section.w && y+h<=section.h,asset);
              const box={x,y,width:w,height:h};
              assert.ok(!placed.some(other=>overlaps(other,box)),`${asset} overlaps another source section`);
              placed.push(box);
              for(const frame of frames) {
                assert.ok(frame.w>0 && frame.h>0);
                assert.ok(frame.well.w>=frame.w && frame.well.h>=frame.h,`${asset} specimen fits its well`);
              }
            }
          }
          assert.equal(await page.locator('.chapter-board').count(),actual.sections.length);
          assert.equal(await page.locator('.board-source').count(),actual.paths.length);
        }
        if(name==='sample-zoomed') {
          const captions=await page.locator('.board-caption > span').allTextContents();
          for(const caption of ['default','error']) assert.ok(captions.includes(caption),caption);
          assert.equal(await page.locator('#labels .canvas-label:not([hidden])').count(),0);
        }
        if(name==='sample-inspect-frame') {
          assert.equal(await page.locator('#frame-name').textContent(),'failed');
          assert.equal(await page.locator('#frame-size').textContent(),'960 × 912');
          assert.equal(await page.locator('#relationships').isVisible(),true);
          assert.equal(await page.locator('#source-path').evaluate(el=>getComputedStyle(el).fontSize),'12px');
        }
        if (name === 'sidebar-search') {
          assert.equal(await page.locator('#app-bar #search').isVisible(), true);
          assert.equal(await page.locator('#sidebar #search').count(), 0);
        }
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
          assert.equal(await page.locator('#search').getAttribute('placeholder'),'Find assets…');
          assert.ok(await page.locator('.chapter-board header h1').count()>0);
          assert.ok(await page.locator('.board-source').count()>0);
          assert.equal(await page.locator('#labels .canvas-label:not([hidden])').count(),0);
          const view=await page.evaluate(()=>window.__adg.view);
          await page.getByRole('button',{name:'Contents',exact:true}).click();
          assert.deepEqual(await page.evaluate(()=>window.__adg.view),view);
          await page.getByRole('button',{name:'Contents',exact:true}).focus();
          await page.keyboard.press('1');
          assert.equal(await page.evaluate(()=>window.__adg.view.scale),1);
          await page.keyboard.press('0');
          assert.ok(await page.evaluate(()=>window.__adg.view.scale)<1);
        }
      } finally { await page.close(); }
      }
    }));
    await assert.rejects(access(path.join(temporaryRoot,'state.json')), {code:'ENOENT'});
  } finally { await browser.close();await server.close(); }
});

test('board titles and captions scale and pan with the camera without rebuilding source content', {timeout:30000}, async t => {
  const temporaryRoot=await temporary(t);
  const server=await startServer({directory:path.join(root,'fixtures/arc-sample/design'),stateDirectory:temporaryRoot,fixtures:{states,recent}});
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(new URL('/?fixture=sample-components',server.url).href);
    await config.compare.ready(page,'sample-components');
    const pan=await page.evaluate(async()=>{
      const root=document.querySelector('#board-chrome');
      const title=root.querySelector('.board-source button'),caption=root.querySelector('.board-caption');
      const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      const before={title:box(title),caption:box(caption),view:window.__adg.view};
      let childWrites=0;
      const observer=new MutationObserver(records=>{childWrites+=records.filter(record=>record.target!==root).length});
      observer.observe(root,{subtree:true,attributes:true,childList:true,characterData:true});
      const viewport=document.querySelector('.gallery-viewport');
      for(let i=0;i<12;i++) {
        viewport.dispatchEvent(new WheelEvent('wheel',{deltaX:2,deltaY:1,bubbles:true,cancelable:true}));
        await new Promise(requestAnimationFrame);
      }
      await Promise.resolve();observer.disconnect();
      return {before,after:{title:box(title),caption:box(caption),view:window.__adg.view},childWrites};
    });
    assert.equal(pan.childWrites,0,'panning transforms the board layer without rebuilding its children');
    assert.equal(pan.after.view.x,pan.before.view.x-24);
    assert.equal(pan.after.view.y,pan.before.view.y-12);
    for(const name of ['title','caption']) {
      assert.ok(Math.abs(pan.after[name].x-pan.before[name].x+24)<.1,name);
      assert.ok(Math.abs(pan.after[name].y-pan.before[name].y+12)<.1,name);
      assert.equal(pan.after[name].width,pan.before[name].width);
    }
    await page.waitForFunction(()=>window.__adg.ready);
    const before=await page.locator('.board-source button').first().boundingBox();
    const scale=await page.evaluate(()=>window.__adg.view.scale);
    await page.locator('#plus').click();await page.waitForFunction(()=>window.__adg.ready);
    const after=await page.locator('.board-source button').first().boundingBox();
    const ratio=await page.evaluate(previous=>window.__adg.view.scale/previous,scale);
    assert.ok(ratio>1);
    assert.ok(Math.abs(after.width/before.width-ratio)<.001,'source title scales in board pixels');
    assert.ok(Math.abs(after.height/before.height-ratio)<.001);
    await page.setViewportSize({width:1200,height:800});await page.waitForFunction(()=>window.__adg.ready);
    assert.equal(await page.locator('#board-chrome').isVisible(),true);
    assert.equal(await page.locator('#labels .canvas-label:not([hidden])').count(),0);
  } finally {await browser.close();await server.close()}
});

test('board source titles select and copy through pointer and keyboard without moving the camera', {timeout:30000}, async t => {
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
    await page.goto(new URL('/?fixture=sample-components',server.url).href);
    await config.compare.ready(page,'sample-components');
    const view=await page.evaluate(()=>window.__adg.view);
    const name=page.locator('.board-source [data-source="components/button.tsx"]');
    await name.click();
    await page.waitForFunction(()=>window.copiedNames.length===1);
    assert.deepEqual(await page.evaluate(()=>window.copiedNames),['button']);
    assert.deepEqual(await page.evaluate(()=>window.__adg.selection),{path:'components/button.tsx',frame:null,element:null});
    assert.deepEqual(await page.evaluate(()=>window.__adg.view),view);
    await name.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.copiedNames.length===2);
    await name.focus();await page.keyboard.press('Space');
    await page.waitForFunction(()=>window.copiedNames.length===3);
    assert.deepEqual(await page.evaluate(()=>window.__adg.view),view);
    await page.evaluate(()=>{window.copyFailure=true});
    await name.click();await page.locator('#error').waitFor();
    assert.match(await page.locator('#error').textContent(),/Clipboard access denied/);
    assert.equal(await page.evaluate(()=>window.copiedNames.length),3);
    await page.evaluate(()=>{window.copyFailure=false});
    await page.locator('#inspect').click();
    await page.locator('#forms [data-frame="primary"]').click();
    await page.waitForFunction(()=>window.__adg.ready);
    await page.locator('#copy-frame').click();
    assert.equal((await page.evaluate(()=>window.copiedNames)).at(-1),'primary');
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(server.url).origin});
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:window.nativeClipboardWrite}));
    await page.locator('#copy-path').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'components/button.tsx');
  } finally {await browser.close();await server.close()}
});

test('feature-folder board titles copy the displayed name instead of index', async t => {
  const directory=await temporary(t);
  await mkdir(path.join(directory,'design/modules/account'),{recursive:true});
  await writeFile(path.join(directory,'adg.config.mjs'),"export default {sources:['components','modules','surfaces']};");
  await writeFile(path.join(directory,'design/tokens.css'),(await import('../src/toolkit/project.mjs')).starterTokens);
  await writeFile(path.join(directory,'design/modules/account/index.tsx'),`import {Frame} from 'adg';export default()=> <Frame name="ready" width={200} height={100}><div>Account</div></Frame>;`);
  const server=await startServer({directory:path.join(directory,'design'),stateDirectory:path.join(directory,'state')});
  const browser=await launch();
  try {
    const page=await browser.newPage();
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedTitle=value}}}));
    await page.goto(server.url+'?scope=layer:modules');
    await page.waitForFunction(()=>window.__adg?.ready || document.querySelector('#error')?.textContent);
    const response=await fetch(new URL('/asset/modules%2Faccount%2Findex.tsx?theme=light',server.url));
    assert.equal(response.status,200,await response.text());
    assert.equal(await page.locator('#error').textContent(),'');
    const title=page.locator('.board-source [data-source="modules/account/index.tsx"]');
    assert.equal(await title.count(),1,JSON.stringify(await page.evaluate(()=>({error:document.querySelector('#error').textContent,items:window.__adg.items,titles:[...document.querySelectorAll('.board-source button')].map(node=>[node.dataset.source,node.textContent])}))));
    assert.equal(await title.textContent(),'account');
    await title.click();
    assert.equal(await page.evaluate(()=>window.copiedTitle),'account');
    assert.equal((await page.evaluate(()=>window.__adg.selection)).path,'modules/account/index.tsx');
  } finally {await browser.close();await server.close()}
});

test('TSX board specimens retain frame sizes, exact previews, notes, caches and import-dependent refresh', {timeout:30000}, async t=>{
  const {writeFile}=await import('node:fs/promises');
  const {init}=await import('../src/toolkit/project.mjs');
  const temporaryRoot=await temporary(t);init({root:temporaryRoot},()=>{});
  for(const layer of ['components','modules','surfaces']) await rm(path.join(temporaryRoot,'design',layer,'example.tsx'));
  const directory=path.join(temporaryRoot,'design');
  await mkdir(path.join(directory,'scenes'));
  await writeFile(path.join(directory,'scenes/sizes.tsx'),'export const widths=[900,700,500];');
  for(const name of ['helper.tsx','art/helper.tsx','components/nested/helper.tsx','surfaces/nested/helper.tsx']) {
    await mkdir(path.dirname(path.join(directory,name)),{recursive:true});
    await writeFile(path.join(directory,name),'imports only');
  }
  await writeFile(path.join(directory,'components/forms.tsx'),`import {Frame} from 'adg';import {widths} from '../scenes/sizes';export default()=>widths.map((width,i)=><Frame name={'form-'+i} width={width} height={20+i*10} note={'Note '+i}><div class="bg-text text-canvas" style={{width,height:20+i*10}}>Form {i}</div></Frame>);`);
  await writeFile(path.join(directory,'surfaces/flow.tsx'),`import {Frame} from 'adg';export default()=>['one','two'].map(name=><Frame name={name} width={100} height={50}><div class="w-[100px] h-[50px] bg-text">{name}</div></Frame>);`);
  const server=await startServer({directory,stateDirectory:path.join(temporaryRoot,'state')});const browser=await launch();
  try{
    const page=await browser.newPage();
    let releaseSource;const sourceGate=new Promise(resolve=>{releaseSource=resolve});
    await page.route('**/asset/components%2Fforms.tsx?*',async route=>{await sourceGate;await route.continue()});
    await page.goto(server.url+'?scope=all');
    await page.waitForFunction(()=>window.__adg?.assets>0&&!window.__adg.metadataComplete);
    releaseSource();await page.waitForFunction(()=>window.__adg?.ready);
    const result=await page.evaluate(async()=>{
      const {prepare,arrange,imageURL,compactPreparedSource}=await import('/assets.js');const data=await(await fetch('/manifest')).json();const assets=await Promise.all(data.assets.map(a=>prepare(a,'light')));
      const set=assets.find(a=>a.component),flow=assets.find(a=>!a.component),world=arrange({...data,assets});
      const src=imageURL(set,{...set.full,id:'overview'});await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=src});URL.revokeObjectURL(src);
      const crops=[];
      for(const theme of ['light','dark']) {
        const source=await prepare(data.assets.find(a=>a.path===flow.path),theme);
        const {frameRanges,...legacy}=source;
        for(const part of source.parts) {
          const parse=DOMParser.prototype.parseFromString,inputs=[];
          DOMParser.prototype.parseFromString=function(text,type) {if(type==='image/svg+xml')inputs.push(text.length);return parse.call(this,text,type)};
          let optimized,original,compact;
          const compactSource=compactPreparedSource(source);
          try {optimized=imageURL(source,part);original=imageURL(legacy,part);compact=imageURL(compactSource,part)}
          finally {DOMParser.prototype.parseFromString=parse}
          try {
            const xml=await(await fetch(optimized)).text(),previous=await(await fetch(original)).text();
            const compactXml=await(await fetch(compact)).text();
            crops.push({theme,id:part.id,identical:xml===previous,compactIdentical:compactXml===previous,compactBytes:compactSource.source.length,parsedBytes:inputs,sourceBytes:source.source.length});
          } finally {URL.revokeObjectURL(optimized);URL.revokeObjectURL(original);URL.revokeObjectURL(compact)}
        }
      }
      const document=new DOMParser().parseFromString(set.source,'image/svg+xml');
      const windows=[...document.querySelectorAll('foreignObject')].map(node=>Object.fromEntries(['x','y','width','height','overflow'].map(name=>[name,node.getAttribute(name)])));
      return {paths:data.assets.map(a=>a.path),parts:set.parts,windows,blocks:world.groups.flatMap(g=>g.blocks).map(b=>({kind:b.kind,w:b.w,h:b.h,frames:b.frames})),note:set.parts[0].note,version:data.assets.find(a=>a.path===set.path).version,crops,items:world.items.map(({id,path,x,y,width,height,group})=>({id,path,x,y,width,height,group}))};
    });
    assert.deepEqual(result.paths,['components/forms.tsx','surfaces/flow.tsx']);
    assert.deepEqual(result.parts.map(p=>[p.x,p.y]),[[0,0],[0,84],[748,84]]);assert.equal(result.note,'Note 0');
    assert.deepEqual(result.windows, [
      {x:'-24',y:'-32',width:'948',height:'84',overflow:'hidden'},
      {x:'-24',y:'52',width:'748',height:'94',overflow:'hidden'},
      {x:'724',y:'52',width:'548',height:'104',overflow:'hidden'},
    ]);
    assert.equal(result.blocks.length,2);
    assert.deepEqual(result.blocks.map(b=>b.frames.map(f=>[f.w,f.h])),[[[900,20],[700,30],[500,40]],[[100,50],[100,50]]]);
    assert.equal(result.items.length,5);
    assert.ok(result.blocks.every(block=>block.kind==='flow' && block.w>=1520 && block.h>0));
    assert.equal(result.crops.length,4);
    for(const crop of result.crops) {
      assert.equal(crop.identical,true,`${crop.theme} frame ${crop.id} XML must remain exact`);
      assert.equal(crop.compactIdentical,true,'compacted cache crops must retain exact XML');
      assert.ok(crop.compactBytes<crop.sourceBytes,'cache must retain one generated stylesheet');
      assert.equal(crop.parsedBytes[1],crop.sourceBytes);
      assert.ok(crop.parsedBytes[0]<crop.sourceBytes,'individual previews must not parse sibling frames');
    }
    for (const theme of ['light','dark']) {
      const preview=await page.evaluate(async theme=>{
        const {prepare,imageURL,compactPreparedSource}=await import('/assets.js');const {blockForAsset}=await import('/layout.js');
        const data=await(await fetch('/manifest')).json();
        const asset=await prepare(data.assets.find(a=>a.path==='components/forms.tsx'),theme),block=blockForAsset(asset);
        const crop=block.previewCrop;
        const urls=[imageURL({...asset,format:undefined},crop),imageURL(asset,crop),imageURL(compactPreparedSource(asset),crop)];
        const documents=await Promise.all(urls.map(async url=>new DOMParser().parseFromString(await(await fetch(url)).text(),'image/svg+xml')));
        const styles=documents.map(document=>[...document.querySelectorAll('style')].map(style=>style.textContent));
        const guards=[];
        for(const kind of ['differing','attributes','count','legacy']) {
          const candidate=documents[0].cloneNode(true),styleNodes=[...candidate.querySelectorAll('style')];
          if(kind==='differing')styleNodes[1].textContent+=' .custom{color:red}';
          if(kind==='attributes')styleNodes[1].setAttribute('data-authored','true');
          if(kind==='count')candidate.documentElement.append(styleNodes[0].cloneNode(true));
          const guarded={...asset,source:new XMLSerializer().serializeToString(candidate),format:kind==='legacy'?'svg':'tsx'};
          const variants=[imageURL({...guarded,format:undefined},crop),imageURL(guarded,crop)];
          try {guards.push({kind,identical:(await(await fetch(variants[0])).text())===(await(await fetch(variants[1])).text())})}
          finally {variants.forEach(URL.revokeObjectURL)}
        }
        const scale=Math.min(1,1024/crop.width,600/crop.height),width=Math.ceil(crop.width*scale),height=Math.ceil(crop.height*scale);
        const host=document.createElement('div');host.id='dedup-preview';host.style.cssText=`position:fixed;left:0;top:0;z-index:2147483647;width:${width}px;height:${height}px;background:${asset.background};overflow:hidden;`;
        for(const [index,url] of urls.entries()){const image=new Image();image.dataset.variant=String(index);image.src=url;await image.decode();image.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;display:${index===0?'block':'none'};`;host.append(image)}
        document.body.append(host);window.cleanupDedupPreview=()=>{host.remove();urls.forEach(URL.revokeObjectURL)};
        return {styles,guards,cacheExact:new XMLSerializer().serializeToString(documents[1])===new XMLSerializer().serializeToString(documents[2])};
      },theme);
      assert.equal(preview.cacheExact,true,`${theme} compacted set cache must retain exact preview XML`);
      for(const guard of preview.guards)assert.equal(guard.identical,true,`${guard.kind} styles must preserve their original XML and cascade`);
      assert.equal(preview.styles[0].filter(css=>css===preview.styles[0][0]).length,3);
      assert.equal(preview.styles[1][0],preview.styles[0][0]);
      assert.deepEqual(preview.styles[1].slice(1),['/* shared stylesheet */','/* shared stylesheet */']);
      const original=await page.locator('#dedup-preview').screenshot();
      await page.evaluate(()=>{for(const image of document.querySelectorAll('#dedup-preview img'))image.style.display=image.dataset.variant==='1'?'block':'none'});
      assert.deepEqual(await page.locator('#dedup-preview').screenshot(),original,`${theme} shared stylesheet preview pixels must remain exact`);
      await page.evaluate(()=>window.cleanupDedupPreview());
    }
    const streamedItems=await page.evaluate(()=>window.__adg.items);
    const bandOffset=streamedItems[0].y-result.items[0].y;
    const expectedItems=result.items.map(item=>({...item,y:item.y+bandOffset}));
    assert.deepEqual(streamedItems,expectedItems,'streamed completion retains specimen geometry below the Tokens board');
    await page.evaluate(()=>window.__adg.cacheFlush);
    assert.equal(await page.evaluate(()=>window.__adg.cacheFailures),0);
    const warmRequests=[];const warmRequest=request=>{if(new URL(request.url()).pathname.startsWith('/asset/'))warmRequests.push(request.url())};
    page.on('request',warmRequest);await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    page.off('request',warmRequest);
    assert.deepEqual(warmRequests,[],'warm metadata and cropped previews must bypass source preparation');
    assert.deepEqual(await page.evaluate(()=>window.__adg.items),expectedItems);
    let lostPreview;
    await page.route('**/preview/**',async route=>{
      const address=route.request().url();
      if(route.request().method()==='GET'&&(!lostPreview||lostPreview===address)) {
        lostPreview=address;await route.fulfill({status:404,body:'Evicted preview'});
      } else await route.continue();
    });
    const recoveredSources=[];const recoverRequest=request=>{if(new URL(request.url()).pathname.startsWith('/asset/'))recoveredSources.push(request.url())};
    page.on('request',recoverRequest);await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    await page.evaluate(()=>window.__adg.cacheFlush);page.off('request',recoverRequest);await page.unroute('**/preview/**');
    assert.equal(recoveredSources.length,1,'an evicted preview must regenerate only its source');
    assert.equal(await page.locator('#error').textContent(),'');
    assert.deepEqual(await page.evaluate(()=>window.__adg.items),expectedItems);
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
    await page.waitForFunction(()=>window.__adg.ready && window.__adg.metadataComplete);
    const beforeGrowth=await page.evaluate(()=>({items:window.__adg.items,revision:window.__adg.revision,view:window.__adg.view}));
    await writeFile(path.join(directory,'scenes/sizes.tsx'),'export const widths=Array(87).fill(600);');
    await page.waitForFunction(revision=>window.__adg.ready && window.__adg.metadataComplete && window.__adg.revision>revision,beforeGrowth.revision);
    const grown=await page.evaluate(()=>({items:window.__adg.items,view:window.__adg.view}));
    assert.deepEqual(grown.view,beforeGrowth.view,'geometry refresh must retain the camera');
    const grownForms=grown.items.filter(a=>a.path==='components/forms.tsx');
    assert.equal(grownForms.length,87);
    assert.ok(grownForms.every(item=>item.width===600),'declared specimen widths stay unchanged as a chapter grows');
    assert.equal(grownForms[0].y,beforeGrowth.items.find(a=>a.path==='components/forms.tsx').y,'the first specimen retains the board origin');
    assert.ok(grownForms.at(-1).y>grownForms[0].y,'additional specimens extend the board vertically');
    const oldSurfaces=beforeGrowth.items.filter(a=>a.path==='surfaces/flow.tsx');
    const newSurfaces=grown.items.filter(a=>a.path==='surfaces/flow.tsx');
    assert.equal(newSurfaces.length,oldSurfaces.length);
    assert.ok(newSurfaces[0].y>oldSurfaces[0].y,'later layer bands follow the taller Components band');
    assert.equal(newSurfaces[1].y-newSurfaces[0].y,oldSurfaces[1].y-oldSurfaces[0].y);
    assert.deepEqual(newSurfaces.map(({width,height})=>({width,height})),oldSurfaces.map(({width,height})=>({width,height})));
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.locator('.group-name').filter({hasText:/^components/}).click();
    await page.locator('#more').click();await page.locator('#arrange').click();
    await page.waitForFunction(()=>window.__adg.ready);
    assert.deepEqual(await page.evaluate(()=>window.__adg.items),grown.items,'Arrange keeps deterministic one-board-per-layer placement');
    assert.equal(await page.locator('#full-sheet').count(),0);
  }finally{await browser.close();await server.close();}
  await writeFile(path.join(directory,'gallery.json'),JSON.stringify({groups:[{title:'Helpers',assets:['scenes/sizes.tsx']}]}));
  await assert.rejects(startServer({directory,stateDirectory:path.join(temporaryRoot,'state')}),/gallery.json: Invalid source scenes\/sizes.tsx/);
});

test('dedicated legacy SVG sheets retain measurement, form crops and renderable previews', async t => {
  const server = await startServer({directory:path.join(root,'fixtures/legacy-svg'),stateDirectory:await temporary(t)});
  const browser = await launch();
  try {
    const page=await browser.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.__adg?.ready);
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
    assert.equal(result.blocks.length,2);
    assert.ok(result.blocks.every(([kind,width,height])=>kind==='flow' && width>=1520 && height>0));
    assert.deepEqual(result.previews,[{notes:0,frames:0},{notes:0,frames:0},{notes:0,frames:1},{notes:0,frames:1}]);
  } finally {await browser.close();await server.close();}
});

test('frame and element selection expose transitive relationships, matching exports and a collapsed inspector on entry', {timeout:30000}, async t => {
  const {writeFile}=await import('node:fs/promises');
  const {init}=await import('../src/toolkit/project.mjs');
  const temporaryRoot=await temporary(t);init({root:temporaryRoot},()=>{});
  for(const layer of ['components','modules','surfaces']) await rm(path.join(temporaryRoot,'design',layer,'example.tsx'));
  const directory=path.join(temporaryRoot,'design');
  await mkdir(path.join(directory,'modules'),{recursive:true});
  await writeFile(path.join(temporaryRoot,'adg.config.mjs'),"export default {sources:['components','modules','surfaces']};");
  await writeFile(path.join(directory,'components/alert.tsx'),`import {Frame} from 'adg';export const Alert=()=> <span>Alert</span>;export default()=> <Frame name="alert"><Alert/></Frame>;`);
  await writeFile(path.join(directory,'modules/composer.tsx'),`import {Frame} from 'adg';import {Alert} from '../components/alert';export const Composer=()=> <section class="w-[200px] h-[80px] bg-text text-canvas"><Alert/></section>;export default()=> ['composer-home-enhancement-ready','compact'].map(name=><Frame name={name}><Composer/></Frame>);`);
  await writeFile(path.join(directory,'modules/home.tsx'),`import {Frame} from 'adg';import {Composer} from './composer';export const Hero=()=> <div><Composer/></div>;export default()=> <Frame name="hero"><Hero/></Frame>;`);
  await writeFile(path.join(directory,'surfaces/home.tsx'),`import {Frame} from 'adg';import {Hero} from '../modules/home';export default()=> ['one','two'].map(name=><Frame name={name} width={400} height={200}><main class="w-[400px] h-[200px]"><Hero/></main></Frame>);`);
  const server=await startServer({directory,stateDirectory:path.join(temporaryRoot,'state')});const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(server.url).origin});
    await page.goto(server.url+'?scope=all&keep=yes#notes');await page.waitForFunction(()=>window.__adg?.ready);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.locator('[data-navkey="group:surfaces"]').click();
    assert.equal(new URL(page.url()).searchParams.get('group'),'surfaces');
    const groupLink=page.url();
    await page.locator('#back').click();
    assert.equal(new URL(page.url()).searchParams.has('group'),false);
    await page.locator('[data-navkey="file:surfaces/home.tsx"]').click();
    await page.waitForFunction(()=>window.__adg.ready);
    assert.deepEqual(Object.fromEntries(new URL(page.url()).searchParams),{scope:'all',keep:'yes',asset:'surfaces/home.tsx'});
    assert.equal(new URL(page.url()).hash,'#notes');
    assert.deepEqual(await page.evaluate(()=>window.__adg.selection),{path:'surfaces/home.tsx',frame:null,element:null});
    assert.equal(await page.locator('#source').isVisible(),false);
    await page.locator('#inspect').click();
    assert.equal(await page.locator('#uses [data-related-path="modules/home.tsx"]').getAttribute('data-direct'),'true');
    assert.match(await page.locator('#uses [data-related-path="modules/composer.tsx"]').textContent(),/composer · via home/);
    assert.match(await page.locator('#uses [data-related-path="components/alert.tsx"]').textContent(),/via home → composer/);
    await page.locator('#forms [data-frame="two"]').click();await page.waitForFunction(()=>window.__adg.ready);
    assert.equal(new URL(page.url()).searchParams.get('frame'),'two');
    assert.equal(await page.locator('#frame-name').textContent(),'two');
    assert.equal(await page.locator('#frame-size').textContent(),'400 × 200');
    assert.equal(await page.locator('#selection-outline').isVisible(),true);
    await page.locator('#copy-frame').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'two');
    await page.locator('#copy-path').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'surfaces/home.tsx');
    await page.locator('#inspect').click();
    const point=await page.evaluate(()=>{
      const a=window.__adg.items.find(a=>a.id==='surfaces/home.tsx#1'),v=window.__adg.view;
      return {x:v.x+(a.x+100)*v.scale,y:v.y+(a.y+40)*v.scale};
    });
    await page.mouse.move(point.x,point.y);assert.equal(await page.locator('#hover-outline').isVisible(),true);
    await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>window.__adg.ready);
    const elementLink=page.url();
    await page.locator('#inspect').click();
    assert.ok(new URL(elementLink).searchParams.get('element'));
    assert.deepEqual((await page.evaluate(()=>window.__adg.selection)).element,{source:'modules/composer.tsx',export:'Composer'});
    assert.equal(await page.locator('#source-path').textContent(),'modules/composer.tsx');
    assert.equal(await page.locator('#source-name').textContent(),'Composer');
    assert.equal(await page.locator('#forms-heading').textContent(),'Frames using this export');
    assert.equal(await page.locator('#forms button').count(),2);
    assert.ok((await page.locator('#forms [data-frame="composer-home-enhancement-ready"]').boundingBox()).height>28,'long variant names wrap instead of sharing a truncated prefix');
    assert.equal(await page.locator('#used-by [data-related-path="surfaces/home.tsx"]').getAttribute('data-direct'),'false');
    // Reload flushes the pending selection save, retaining the host variant and owner.
    await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    assert.equal((await page.evaluate(()=>window.__adg.selection)).element.export,'Composer');
    await page.locator('#inspect').click();
    await page.locator('#forms [data-frame="compact"]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__adg.ready);
    assert.deepEqual(await page.evaluate(()=>window.__adg.selection),{path:'modules/composer.tsx',frame:'compact',element:null});
    await page.locator('#back').click();await page.waitForFunction(()=>window.__adg.ready);
    assert.equal((await page.evaluate(()=>window.__adg.selection)).element.export,'Composer');
    assert.equal(page.url(),elementLink);
    await page.locator('#used-by [data-related-path="surfaces/home.tsx"]').click();await page.waitForFunction(()=>window.__adg.ready);
    assert.deepEqual(await page.evaluate(()=>window.__adg.selection),{path:'surfaces/home.tsx',frame:null,element:null});
    await page.locator('#inspect').click();
    await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    assert.equal(await page.locator('#source').isVisible(),false);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.locator('[data-navkey="file:surfaces/home.tsx"]').click();
    assert.equal(await page.locator('#source').isVisible(),false,'navigation retains the collapsed inspector');
    await page.locator('#inspect').click();await page.locator('#forms [data-frame="one"]').click();await page.waitForFunction(()=>window.__adg.ready);
    const blank=await page.evaluate(()=>{const a=window.__adg.items.find(a=>a.id==='surfaces/home.tsx#0'),v=window.__adg.view;return{x:v.x+(a.x+300)*v.scale,y:v.y+(a.y+100)*v.scale}});
    await page.mouse.click(blank.x,blank.y);assert.equal((await page.evaluate(()=>window.__adg.selection)).frame,'one');
    assert.equal((await page.evaluate(()=>window.__adg.selection)).element,null);
    await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>window.__adg.selection),{path:null,frame:null,element:null});
    assert.equal(await page.locator('#source').isVisible(),false);
    assert.deepEqual(Object.fromEntries(new URL(page.url()).searchParams),{scope:'all',keep:'yes',group:'surfaces'});
    const shared=await browser.newPage({viewport:{width:1440,height:900}});
    await shared.goto(groupLink);await shared.waitForFunction(()=>window.__adg?.ready);
    assert.equal(await shared.locator('[data-navkey="toggle:surfaces"]').getAttribute('aria-expanded'),'true');
    await shared.goto(elementLink);await shared.waitForFunction(()=>window.__adg?.ready);
    assert.deepEqual(await shared.evaluate(()=>window.__adg.selection),{
      path:'surfaces/home.tsx',frame:'two',element:{source:'modules/composer.tsx',export:'Composer'},
    });
    const bounds=await shared.locator('#selection-outline').boundingBox();
    assert.ok(bounds && bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=1440 && bounds.y+bounds.height<=900, JSON.stringify({bounds,view:await shared.evaluate(()=>window.__adg.view)}));
    const stale=new URL(elementLink);stale.searchParams.set('frame','removed');
    await shared.goto(stale.href);await shared.waitForFunction(()=>window.__adg?.ready);
    assert.deepEqual(await shared.evaluate(()=>window.__adg.selection),{path:'surfaces/home.tsx',frame:null,element:null});
    assert.deepEqual(Object.fromEntries(new URL(shared.url()).searchParams),{scope:'all',keep:'yes',asset:'surfaces/home.tsx'});
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await server.close()}
});
