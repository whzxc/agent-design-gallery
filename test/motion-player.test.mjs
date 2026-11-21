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
  const invoker=page.getByRole('button',{name:'Play from project-picker',exact:true});
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
  const picker = frame.locator('[data-adg-id=picker]');
  await picker.waitFor();
  assert.ok(await player.getByRole('complementary', { name: 'Flow' }).isHidden());
  assert.ok(await player.getByRole('region', { name: 'Transition inspector' }).isHidden());
  const anchor = await picker.boundingBox();
  await picker.click();
  await player.locator('[data-control=inspector]').click();
  await player.getByRole('button',{name:'Pause transition',exact:true}).click();
  await seek.focus();await page.keyboard.press('End');
  assert.equal(await seek.inputValue(),'100');
  await current('project-picker → switcher-open');
  assert.deepEqual(await picker.boundingBox(), anchor);
  await player.locator('[data-control=flow]').click();
  assert.deepEqual(await picker.boundingBox(), anchor);
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
  await page.keyboard.press('ArrowLeft');await current('switcher-open');
  assert.deepEqual(await picker.boundingBox(), anchor);
  await page.keyboard.press('ArrowRight');await current('project-picker');
  await page.keyboard.press('r');await current('project-picker');
  assert.equal(await player.locator('[data-control=path]').textContent(), 'project-picker');
  await player.getByRole('button',{name:'Exit to board',exact:true}).click();
  assert.deepEqual(await board(),before);assert.ok(await invoker.evaluate(el=>el===document.activeElement));
});

test('contract: player entry and Escape restore focus one layer at a time', async t => {
  const { page, url } = await viewer(t);
  await page.goto(url);
  const invoker = page.getByRole('button', { name: 'Play from project-picker', exact: true });
  await invoker.click();
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const first = player.frameLocator('iframe').locator('[data-adg-id=picker]');
  await first.waitFor();
  assert.ok(await first.evaluate(b => b === b.ownerDocument.activeElement));
  await page.keyboard.press('ArrowDown');
  await player.locator('[data-control=current]').filter({hasText:/^switcher-open$/}).waitFor({state:'attached'});
  const settings = player.getByRole('button', { name: /Playback settings/ });
  for (const target of [player.locator('[data-speed="1"]'), player.frameLocator('iframe').getByRole('searchbox')]) {
    await settings.click();
    await target.focus();
    await page.keyboard.press('Escape');
    assert.equal(await settings.getAttribute('aria-expanded'), 'false');
    assert.ok(await settings.evaluate(b => b === document.activeElement));
    assert.equal(await player.locator('[data-control=current]').textContent(), 'switcher-open');
  }
  await page.keyboard.press('Escape');
  await player.locator('[data-control=current]').filter({hasText:/^project-picker$/}).waitFor({state:'attached'});
  assert.ok(await first.evaluate(b => b === b.ownerDocument.activeElement));
  await page.keyboard.press('Escape');
  await player.waitFor({state:'detached'});
  assert.ok(await invoker.evaluate(b => b === document.activeElement));
});

test('contract: hotspot hints follow interaction and keep labels outside the target and inside the stage', async t => {
  const { page, url } = await viewer(t);
  await page.goto(url);
  const invoker = page.getByRole('button', { name: 'Play from project-picker', exact: true });
  await invoker.focus();
  await page.keyboard.press('Enter');
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const iframe = player.locator('iframe');
  const scene = iframe.contentFrame();
  const picker = scene.locator('[data-adg-id=picker]');
  const hints = scene.locator('[data-player-hints]');
  const label = hints.getByText('Open project switcher', { exact: true });
  await picker.waitFor();
  assert.ok(await picker.evaluate(el => el === el.ownerDocument.activeElement));
  assert.ok(await hints.isHidden());

  const stage = await iframe.boundingBox();
  const empty = { x: stage.x + 8, y: stage.y + 8 };
  await picker.hover();
  await label.waitFor();
  const above = await label.boundingBox();
  const target = await picker.boundingBox();
  assert.ok(above.y + above.height <= target.y);
  assert.equal(above.x, target.x);
  await page.mouse.move(empty.x, empty.y);
  await hints.waitFor({ state: 'hidden' });

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await label.waitFor();
  const flow = player.getByRole('button', { name: 'Flow', exact: true });
  await flow.click();
  const action = player.getByRole('button', { name: 'Open project switcher · Click “Atlas”', exact: true });
  await action.hover();
  await label.waitFor();
  await page.mouse.move(empty.x, empty.y);
  await hints.waitFor({ state: 'hidden' });
  await action.focus();
  await label.waitFor();
  await flow.click();

  // A target at the upper-right stage edge has room for a label only below it.
  await picker.evaluate(el => Object.assign(el.style, { position: 'fixed', top: '0', left: 'calc(100vw - 36px)' }));
  const edge = await picker.boundingBox();
  await page.mouse.move(edge.x + 10, edge.y + 10);
  await label.waitFor();
  const below = await label.boundingBox();
  assert.ok(below.y >= edge.y + edge.height);
  assert.ok(below.x >= stage.x && below.x + below.width <= stage.x + stage.width);
  await page.mouse.click(empty.x, empty.y);
  await label.waitFor();
  await hints.waitFor({ state: 'hidden' });
});

test('contract: playable board routes and restores camera, grouped gestures dispatch individually, and text matches committed input only',async t=>{
  const {page,url}=await viewer(t);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(new URL('/view/layer/modules/asset/modules%2Fproject-switcher.tsx/frame/project-picker',url).href);
  await page.waitForFunction(() => window.__adg.ready && window.__adg.metadataComplete);
  const camera=()=>page.evaluate(()=>window.__adg.view);
  const before=await camera();
  await page.locator('#filter-toggle').click();
  await page.getByRole('button', { name: 'Playable', exact: true }).click();
  assert.deepEqual(await camera(),before);
  const map = page.getByRole('main', { name: 'Playable' });
  await map.getByRole('heading', { name: 'project-picker-instance' }).waitFor();
  assert.match(page.url(), /[?&]view=playable/);
  assert.equal(await map.locator('.view-frame').count(), 4);
  assert.match(await map.locator('.prototype-map').textContent(), /Type Nova/);
  await page.getByRole('button', { name: 'All frames', exact: true }).click();
  assert.deepEqual(await camera(), before);
  assert.equal(new URL(page.url()).searchParams.has('view'), false);
  await page.locator('#filter-toggle').click();
  await page.getByRole('button', { name: 'Playable', exact: true }).click();
  const loaded = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/asset/')) loaded.push(decodeURIComponent(path.slice('/asset/'.length)));
  });
  await page.reload();
  await map.locator('canvas[data-preview=ready]').first().waitFor();
  assert.ok(loaded.every(source => source === 'modules/project-switcher.tsx'));
  const launch = map.getByRole('button', { name: 'Play flow from project-picker' });
  await launch.click();
  const player=page.locator('#motion-player'), stage=player.frameLocator('iframe');
  await player.locator('[data-control=flow]').click();
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
  await player.locator('[data-control=exit]').click();assert.ok(await launch.evaluate(b=>b===document.activeElement));
  await map.getByRole('button', { name: 'Show switcher-open in board' }).click();
  await page.waitForFunction(() => window.__adg.selection.frame === 'switcher-open');
  assert.equal(new URL(page.url()).searchParams.has('view'), false);
  const floatingPlay = page.getByRole('button', { name: 'Play from switcher-open', exact: true });
  async function assertOutsideContent(outsideCard) {
    await page.waitForFunction(() => window.__adg.ready);
    const button = await floatingPlay.boundingBox();
    const content = await page.locator('#selection-outline').boundingBox();
    assert.ok(button && content);
    assert.ok(button.width >= 20 && button.width <= 32);
    assert.ok(button.x >= content.x + content.width || button.x + button.width <= content.x ||
      button.y >= content.y + content.height || button.y + button.height <= content.y);
    assert.equal(await floatingPlay.evaluate(b => b.hasAttribute('data-outside')), outsideCard);
  }
  await page.keyboard.press('1');
  await assertOutsideContent(false);
  for (let i = 0; i < 6; i++) await page.keyboard.press('-');
  await assertOutsideContent(true);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await floatingPlay.waitFor({ state: 'detached' });
  await page.keyboard.press('p');
  await player.frameLocator('iframe').getByRole('searchbox').waitFor();
  await player.locator('[data-control=current]').filter({hasText:/^switcher-open$/}).waitFor({state:'attached'});
  await player.getByRole('button', { name: 'Exit to board' }).click();
  assert.ok(await page.locator('.gallery-viewport').evaluate(el => el === document.activeElement));
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
