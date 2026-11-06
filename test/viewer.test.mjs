import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, access } from 'node:fs/promises';
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

const root = path.resolve(import.meta.dirname, '..');
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'sdg-viewer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('every approved frame maps to an isolated fixture environment', async () => {
  const source = await Promise.all(['canvas','inspector','menus','open-directory'].map(name => readFile(path.join(root, 'design/surfaces',name+'.svg'),'utf8')));
  const declared = source.flatMap(svg => [...svg.matchAll(/data-fixture="([^"]+)"/g)].map(match => match[1]));
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
  const temporaryRoot=await temporary(t), server=await startServer({directory:path.join(root,'fixtures/arc-sample'),stateDirectory:temporaryRoot});
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
test('all fixture states reach drawn readiness without screenshots or persisted preferences', {timeout:30000}, async t => {
  const temporaryRoot=await temporary(t),empty=path.join(temporaryRoot,'empty');await mkdir(empty);
  const server=await startServer({directory:path.join(root,'fixtures/arc-sample'),stateDirectory:temporaryRoot,fixtures:{states,recent,paths:{'~/projects/empty':empty}}});
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
        if(state.asset) assert.equal(await page.locator('#source-name').textContent(),path.basename(state.asset,'.svg'),name);
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
