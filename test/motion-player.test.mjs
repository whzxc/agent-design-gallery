import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startServer} from '../src/server.mjs';
import {launch} from '../src/toolkit/browser.mjs';
import {playerFixtureURL} from '../adg.config.mjs';

async function viewer(t){
  const state=await mkdtemp(path.join(os.tmpdir(),'adg-player-'));
  const server=await startServer({directory:path.resolve(import.meta.dirname,'../design'),stateDirectory:state,port:0});
  const browser=await launch();
  t.after(async()=>{await browser.close();await server.close();await rm(state,{recursive:true,force:true});});
  const page=await browser.newPage();
  page.setDefaultTimeout(10000);
  return {page,url:new URL(playerFixtureURL,server.url).href};
}

test('contract: switcher keyboard actions, seek without focus commit, finish interruption and reduced-motion history',async t=>{
  const {page,url}=await viewer(t);
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Stretch the authored clock to make interruption observable under a busy test runner.
  await page.route('**/api/play?*',async route=>{
    const response=await route.fetch(), data=await response.json();
    for(const edge of data.edges??[])edge.timings['/duration']=3000;
    await route.fulfill({json:data});
  });
  await page.goto(url);
  const invoker=page.getByRole('button',{name:'Play',exact:true});
  await invoker.waitFor();
  const board=()=>page.evaluate(()=>[location.href,window.__adg.selection,window.__adg.view]);
  const before=await board();
  assert.equal(await page.locator('#motion-player').count(),0);
  assert.ok(!await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/player.js'))));
  await invoker.focus();await page.keyboard.press('Enter');
  const player=page.getByRole('dialog',{name:'Play transitions'}), seek=player.getByRole('slider');
  const frame=player.frameLocator('iframe');
  const action=async id=>{const button=player.locator('[data-edge="'+id+'"]');await button.focus();await page.keyboard.press('Enter');};
  const current=name=>player.locator(name.includes(' → ')?'[data-control=endpoints]':'[data-control=current]').filter({hasText:new RegExp('^'+name+'$')}).waitFor();
  await action('open-project-switcher');
  await player.getByRole('button',{name:'Pause transition',exact:true}).click();
  await seek.focus();await page.keyboard.press('End');
  assert.equal(await seek.inputValue(),'100');
  await current('project-picker → switcher-open');
  assert.equal(await frame.locator('[data-adg-id="current-destination"]').evaluate(el=>el===el.ownerDocument.activeElement),false);
  await player.getByRole('button',{name:'Resume transition',exact:true}).click();await current('switcher-open');
  assert.ok(await frame.locator('[data-adg-id="current-destination"]').evaluate(el=>el===el.ownerDocument.activeElement));
  await player.getByRole('button',{name:'Replay transition',exact:true}).click();await current('project-picker → switcher-open');
  await action('filter-projects');
  await current('switcher-open → switcher-empty');
  await player.locator('[data-control=settings]').click();await player.locator('[data-reduce=on]').click();
  await current('switcher-empty');
  assert.ok(await frame.locator('[data-adg-id="search"]').evaluate(el=>el===el.ownerDocument.activeElement));
  assert.equal(await seek.count(),0);
  await action('clear-project-filter');await current('switcher-open');
  await action('dismiss-switcher');await current('project-picker');
  assert.ok(await frame.locator('[data-adg-id="picker"]').evaluate(el=>el===el.ownerDocument.activeElement));
  await player.getByRole('button',{name:'Back to switcher-open',exact:true}).click();await current('switcher-open');
  await player.getByRole('button',{name:'Exit to board',exact:true}).click();
  assert.deepEqual(await board(),before);assert.ok(await invoker.evaluate(el=>el===document.activeElement));
});

test('contract: board filter preserves placement, grouped gestures dispatch individually, and text matches committed input only',async t=>{
  const {page,url}=await viewer(t);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(new URL('/view/layer/modules/asset/modules%2Fproject-switcher.tsx/frame/project-picker',url).href);
  const caption=page.getByRole('button',{name:'Play from project-picker',exact:true});
  await caption.waitFor();
  const camera=()=>page.evaluate(()=>window.__adg.view);
  const before=await camera();
  await page.locator('#filter-toggle').click();await page.locator('[data-filter=playable]').click();
  assert.deepEqual(await camera(),before);
  assert.equal(await page.locator('#filter-rows button').count(),3);
  const row=page.locator('#filter-rows button').filter({hasText:/^project-picker$/});
  await row.click();
  await caption.focus();await page.keyboard.press('Enter');
  const player=page.locator('#motion-player'), stage=player.frameLocator('iframe');
  assert.equal(await player.locator('.play-actions strong').first().innerText(),'Open project switcher');
  assert.equal(await player.locator('.play-actions > div').count(),1);
  assert.equal(await player.locator('[data-edge]').count(),3);
  await player.locator('[data-edge=open-project-switcher-down]').click();
  const input=stage.getByRole('searchbox');
  await input.fill('Nov');await input.fill('nova');await input.fill('Nova ');
  assert.equal(await player.locator('[data-control=current]').innerText(),'switcher-open');
  await input.evaluate(el=>{
    el.value='Nova';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
  });
  assert.equal(await player.locator('[data-control=current]').innerText(),'switcher-open');
  await input.evaluate(el=>el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'})));
  await player.locator('[data-control=current]').filter({hasText:'switcher-empty'}).waitFor();
  await player.locator('[data-control=exit]').click();assert.ok(await caption.evaluate(b=>b===document.activeElement));
});

test('contract: one inert sandbox, deterministic seek and nested frame-coordinate FLIP',async t=>{
  const {page,url}=await viewer(t), requests=[];
  page.on('request',r=>{if(r.url().includes('fixture-network'))requests.push(r.url());});
  await page.goto(url);
  const result=await page.evaluate(async()=>{
    const {createStage,mountScene,observeScene}=await import('./motion-scene.js');
    const {preparePaint}=await import('./motion-paint.js');
    const iframe=await createStage(document.body),doc=iframe.contentDocument;
    const stamp=name=>"data-adg-owners='"+JSON.stringify([{source:'parts.tsx',export:name}])+"'";
    const endpoint=(x,width,child,opacity)=>({frame:'test',design:'design',css:'*{box-sizing:border-box}body{margin:0}',
      html:`<main style="position:relative;left:${x}px;width:${width}px;height:80px" ${stamp('Shell')}><span style="position:absolute;left:${child}px;width:20px;height:10px;opacity:${opacity}" ${stamp('Child')}>text</span><a href="/fixture-network/link">Link</a><img src="/fixture-network/icon"><iframe title="embedded"></iframe></main>`});
    let stage=await mountScene(doc,endpoint(10,100,10,0.2),'light');
    const old=observeScene(stage,'design',true);
    stage=await mountScene(doc,endpoint(50,200,50,0.8),'light');
    const paint=preparePaint(stage,old,observeScene(stage,'design',true),{phases:[],timings:{'/duration':200,'/easing':'linear'}});
    const box=()=>{const child=[...doc.body.lastElementChild.shadowRoot.children].find(el=>el.shadowRoot?.firstElementChild?.localName==='span');const r=child.getBoundingClientRect();return [r.x,r.width,Number(child.style.opacity)];};
    paint.seek(.5);const middle=box();paint.seek(.9);paint.seek(.1);paint.seek(.5);
    const repeated=box();paint.dispose();
    // A phased ARC replacement holds the old paint, starts the incoming fade at
    // its authored absolute opacity, then finishes at the destination opacity.
    const refs=[{part:'design/parts.tsx#Shell'},{part:'design/parts.tsx#Child'}];
    const replacement=preparePaint(stage,old,observeScene(stage,'design',true),{phases:[
      [{mode:'match',targets:[refs[0]],properties:['x']}],
      [{mode:'enter',targets:[refs[1]],properties:['opacity'],fromOpacity:.25}]],
      timings:{'/duration':100,'/easing':'linear'}});
    function opacities(t){
      replacement.seek(t);
      return [...doc.body.lastElementChild.shadowRoot.children].filter(node=>node.shadowRoot?.firstElementChild.localName==='span').map(node=>Number(node.style.opacity));
    }
    const phases=[opacities(.49),opacities(.5),opacities(1)];
    replacement.dispose();doc.querySelector('a').click();
    const result={middle,repeated,phases,sandbox:iframe.sandbox.value,href:doc.location.href,contexts:doc.querySelectorAll('iframe').length,link:doc.querySelector('a').hasAttribute('href')};
    iframe.remove();return result;
  });
  assert.deepEqual(result.middle,[60,20,0.5]);assert.deepEqual(result.repeated,result.middle);
  assert.deepEqual(result.phases,[[0.2,0],[0,0.25],[0,0.8]]);
  assert.equal(result.sandbox,'allow-same-origin');assert.equal(result.href,'about:srcdoc');
  assert.equal(result.contexts,0);assert.equal(result.link,false);assert.deepEqual(requests,[]);
});
