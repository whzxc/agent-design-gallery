import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startServer} from '../src/server.mjs';
import {launch} from '../src/toolkit/browser.mjs';
import {endPlayerFixtureAtInstance, playerFixtureURL} from '../adg.config.mjs';

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
  // Match the designed desktop player viewport so wider Linux fallback fonts do not wrap the header on Reduced motion.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Stretch the authored clock to make interruption observable under a busy test runner.
  await page.route('**/api/play?*',async route=>{
    const response=await route.fetch(), data=await response.json();
    for(const edge of data.edges??[]) {
      edge.timings['/duration']=3000;
      if (edge.id === 'open-project-switcher') Object.assign(edge, {
        interrupt: 'retarget', reduced: 'static', playbackOmissions: ['Stagger is outside the discrete player contract.'],
      });
    }
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
  await player.getByText(/Runtime interruption: retarget.*finishes the current transition/).waitFor();
  await player.getByText(/Runtime reduced motion: static.*shows the destination immediately/).waitFor();
  await player.getByText('Omitted: Stagger is outside the discrete player contract.', { exact: true }).waitFor();
  await player.getByRole('button',{name:'Pause transition',exact:true}).click();
  await seek.focus();await page.keyboard.press('End');
  assert.equal(await seek.inputValue(),'100');
  await current('project-picker → switcher-open');
  assert.deepEqual(await picker.boundingBox(), anchor);
  await player.locator('[data-control=flow]').click();
  const besideRail = await picker.boundingBox();
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
  await frame.locator('[data-adg-frame=switcher-open]').waitFor();
  assert.deepEqual(await picker.boundingBox(), besideRail);
  await page.keyboard.press('ArrowRight');await current('project-picker');
  await page.keyboard.press('r');await current('project-picker');
  assert.equal(await player.locator('[data-control=path]').textContent(), 'project-picker');
  await player.getByRole('button',{name:'Exit to board',exact:true}).click();
  assert.deepEqual(await board(),before);assert.ok(await invoker.evaluate(el=>el===document.activeElement));
});

test('contract: the Flow rail leaves the specimen clickable at laptop and narrow widths', async t => {
  const { page, url } = await viewer(t);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.getByRole('button', { name: 'Play from project-picker', exact: true }).click();
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const scene = player.frameLocator('iframe');
  const picker = scene.locator('[data-adg-id=picker]');
  await picker.waitFor();
  await player.getByRole('button', { name: 'Flow', exact: true }).click();
  const rail = player.getByRole('complementary', { name: 'Flow' });
  const stage = player.locator('iframe');
  for (const width of [1280, 760]) {
    await page.setViewportSize({ width, height: 720 });
    const specimen = await stage.boundingBox(), actions = await rail.boundingBox();
    assert.ok(specimen.width > 0 && specimen.height > 0);
    assert.ok(specimen.x + specimen.width <= actions.x || specimen.y + specimen.height <= actions.y);
    await picker.click();
    await rail.getByRole('heading', { name: 'switcher-open', exact: true }).waitFor();
    await player.getByRole('button', { name: 'Restart', exact: true }).click();
    await rail.getByRole('heading', { name: 'project-picker', exact: true }).waitFor();
  }
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

test('contract: toolbar Back and Restart recover a terminal state without moving the stage', async t => {
  const { page, url } = await viewer(t);
  await endPlayerFixtureAtInstance(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.getByRole('button', { name: 'Play from project-picker', exact: true }).click();
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const scene = player.frameLocator('iframe');
  const picker = scene.locator('[data-adg-id=picker]');
  const toolbar = player.getByRole('navigation', { name: 'Player controls' });
  const back = toolbar.getByRole('button', { name: 'Back', exact: true });
  const restart = toolbar.getByRole('button', { name: 'Restart', exact: true });
  const marker = toolbar.getByText('End of flow', { exact: true });
  const current = frame => player.locator('[data-control=current]').filter({ hasText: new RegExp('^' + frame + '$') })
    .waitFor({ state: 'attached' });
  await picker.waitFor();
  assert.ok(await back.isVisible() && await back.isDisabled());
  assert.ok(await restart.isEnabled());
  assert.match(await restart.getAttribute('title'), /\(R\)/);
  assert.ok(await marker.isHidden());
  const anchor = await picker.boundingBox();
  await picker.click();
  await current('switcher-open');
  const instance = scene.locator('[data-adg-id=live-instance]');
  await instance.click();
  await current('project-picker-instance');
  assert.ok(await marker.isVisible());
  const endBox = await marker.boundingBox(), stage = await player.locator('iframe').boundingBox();
  assert.ok(endBox.y + endBox.height <= stage.y);
  assert.deepEqual(await picker.boundingBox(), anchor);
  await back.click();
  await current('switcher-open');
  assert.ok(await marker.isHidden());
  await instance.click();
  await current('project-picker-instance');
  await restart.click();
  await current('project-picker');
  assert.ok(await back.isDisabled() && await marker.isHidden());
  assert.equal(await player.locator('[data-control=path]').textContent(), 'project-picker');
});

test('contract: the instance picker reopens, closes to its own state, and can return to Atlas', async t => {
  const { page, url } = await viewer(t);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.getByRole('button', { name: 'Play from project-picker', exact: true }).click();
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const scene = player.frameLocator('iframe'), picker = scene.locator('[data-adg-id=picker]');
  const current = frame => scene.locator('[data-adg-frame="' + frame + '"]').waitFor();
  await picker.click();
  await scene.locator('[data-adg-id=live-instance]').click();
  await current('project-picker-instance');
  const marker = player.getByRole('navigation', { name: 'Player controls' }).getByText('End of flow', { exact: true });
  assert.ok(await marker.isHidden());
  await picker.click();
  await current('switcher-open-instance');
  await page.keyboard.press('Escape');
  await current('project-picker-instance');
  await picker.click();
  await current('switcher-open-instance');
  await picker.click();
  await current('project-picker-instance');
  await picker.click();
  await scene.locator('[data-adg-id=atlas-project]').click();
  await current('project-picker');
});

test('contract: hotspots are controlled only by a persistent toggle and keep labels outside targets', async t => {
  const { page, url } = await viewer(t);
  await page.goto(url);
  const invoker = page.getByRole('button', { name: 'Play from project-picker', exact: true });
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const toggle = player.getByRole('button', { name: 'Hotspots', exact: true });
  const iframe = player.locator('iframe');
  const scene = iframe.contentFrame();
  const picker = scene.locator('[data-adg-id=picker]');
  const hints = scene.locator('[data-player-hints]');
  const label = hints.getByText('Open project switcher', { exact: true });
  await invoker.focus();
  await page.keyboard.press('Enter');
  await picker.waitFor();
  assert.ok(await picker.evaluate(el => el === el.ownerDocument.activeElement));
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.ok(await hints.isHidden());

  const stage = await iframe.boundingBox();
  await picker.hover();
  assert.ok(await hints.isHidden());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.ok(await hints.isHidden());
  await page.mouse.click(stage.x + 8, stage.y + 8);
  assert.ok(await hints.isHidden());
  const flow = player.getByRole('button', { name: 'Flow', exact: true });
  await flow.click();
  const action = player.getByRole('button', { name: 'Open project switcher · Click “Atlas”', exact: true });
  await action.hover();
  await action.focus();
  assert.ok(await hints.isHidden());
  await flow.click();

  await toggle.click();
  await label.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  const above = await label.boundingBox(), target = await picker.boundingBox();
  assert.ok(above.y + above.height <= target.y);
  assert.equal(above.x, target.x);
  await page.mouse.click(stage.x + 8, stage.y + 8);
  assert.ok(await label.isVisible());
  await page.keyboard.press('h');
  await hints.waitFor({ state: 'hidden' });

  // A target at the upper-right stage edge has room for a label only below it.
  await picker.evaluate(el => Object.assign(el.style, { position: 'fixed', top: '0', left: 'calc(100vw - 36px)' }));
  const edge = await picker.boundingBox();
  await toggle.click();
  await label.waitFor();
  const below = await label.boundingBox();
  assert.ok(below.y >= edge.y + edge.height);
  assert.ok(below.x >= stage.x && below.x + below.width <= stage.x + stage.width);
  await player.getByRole('button', { name: 'Exit to board' }).click();
  await invoker.click();
  await label.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await player.getByRole('button', { name: 'Exit to board' }).click();
  await page.reload();
  await invoker.click();
  await label.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');

  await picker.click();
  await scene.locator('[data-adg-frame=switcher-open]').waitFor();
  for (const name of ['Close project switcher', 'Search for “Nova”', 'Open live instance'])
    await hints.getByText(name, { exact: true }).first().waitFor();
  await page.keyboard.press('h');
  await hints.waitFor({ state: 'hidden' });
  await player.getByRole('button', { name: 'Exit to board' }).click();
  await invoker.click();
  await picker.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.ok(await hints.isHidden());
});

test('contract: the player stage follows the board theme and Flow map focuses the full flow from an isolated frame', async t => {
  const { page, url } = await viewer(t);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(url);
  await page.getByRole('button', { name: 'Play from project-picker', exact: true }).click();
  const player = page.getByRole('dialog', { name: 'Play transitions' });
  const scene = player.frameLocator('iframe');
  const picker = scene.locator('[data-adg-id=picker]');
  await picker.waitFor();

  async function canvas(theme) {
    await page.waitForFunction(theme => {
      const root = document.documentElement;
      const stage = document.querySelector('.play-stage');
      const child = stage.querySelector('iframe').contentDocument.documentElement;
      const canonical = document.createElement('canvas').getContext('2d');
      canonical.fillStyle = getComputedStyle(root).getPropertyValue('--canvas').trim();
      const background = canonical.fillStyle;
      const matches = node => {
        canonical.fillStyle = node.ownerDocument.defaultView.getComputedStyle(node).backgroundColor;
        return canonical.fillStyle === background;
      };
      return root.dataset.theme === theme && child.dataset.theme === theme &&
        matches(stage) && matches(child) && child.style.colorScheme === theme;
    }, theme);
  }
  await canvas('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await canvas('dark');
  assert.ok(await picker.evaluate(el => el === el.ownerDocument.activeElement));
  await page.emulateMedia({ colorScheme: 'light' });
  await canvas('light');

  await player.getByRole('button', { name: 'Flow map', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('view') === 'playable' &&
    url.searchParams.get('flow') === JSON.stringify(['modules/project-switcher.tsx', 'project-picker']));
  const board = page.getByRole('main', { name: 'Playable' });
  await board.getByRole('heading', { name: 'project-picker-instance', exact: true }).waitFor();
  await board.locator('button:focus').filter({ hasText: 'Play flow' }).waitFor();
  assert.equal(await board.locator('button:focus').getAttribute('aria-label'), 'Play flow from project-picker');
});

test('contract: playable board routes and restores camera, grouped gestures dispatch individually, and text matches committed input only',async t=>{
  const {page,url}=await viewer(t);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.route('**/manifest?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    for (const edge of data.motionEdges ?? []) {
      if (edge.id === 'filter-instance-projects') delete edge.label;
    }
    await route.fulfill({ response, json: data });
  });
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
  assert.equal(await map.locator('.view-frame').count(), 6);
  assert.match(await map.locator('.prototype-map').textContent(), /Search for “Nova”/);
  assert.match(await map.locator('.prototype-map').textContent(), /Type Nova/);
  const returnLabels = map.locator('.prototype-trigger[aria-label^="switcher-"][aria-label*=" to project-picker · "]').filter({ hasText: 'Close project switcher' });
  assert.deepEqual(await returnLabels.allTextContents(), ['Close project switcher', 'Close project switcher']);
  assert.equal(await map.locator('.prototype-trigger[aria-label*=" to project-picker-instance · "]').count(), 3);
  assert.equal(await map.locator('.prototype-trigger[aria-label^="switcher-open-instance to project-picker · "]').count(), 1);
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
  const viewport = page.locator('.gallery-viewport');
  assert.ok(await viewport.evaluate(el => el === document.activeElement));

  // Reproduce the clipped card corner behind the top-right toolbar at 278%.
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__adg.ready);
  await viewport.dispatchEvent('wheel', { ctrlKey: true, deltaY: -Math.log(2.78) / .008, clientX: 640, clientY: 360 });
  await page.waitForFunction(() => window.__adg.ready);
  assert.ok(Math.abs((await camera()).scale - 2.78) < .001);
  const outline = page.locator('#selection-outline');
  const zoomed = await outline.boundingBox();
  const viewSize = page.viewportSize();
  await viewport.dispatchEvent('wheel', { deltaX: zoomed.x + zoomed.width - (viewSize.width - 20), deltaY: zoomed.y - 124 });
  async function checkVisiblePlay(overlaysContent) {
    await page.waitForFunction(() => window.__adg.ready);
    const state = await floatingPlay.evaluate(button => {
      const rect = button.getBoundingClientRect(), view = document.querySelector('.gallery-viewport').getBoundingClientRect();
      const touches = box => rect.left < box.right && box.left < rect.right && rect.top < box.bottom && box.top < rect.bottom;
      return {
        viewportClear: rect.left >= view.left && rect.top >= view.top && rect.right <= view.right && rect.bottom <= view.bottom,
        toolbarClear: [...document.querySelectorAll('.floating[role="toolbar"]:not([hidden])')].every(el => !touches(el.getBoundingClientRect())),
        overlaysContent: touches(document.querySelector('#selection-outline').getBoundingClientRect()),
        clickable: !!document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('.frame-play')
      };
    });
    assert.deepEqual(state, { viewportClear: true, toolbarClear: true, overlaysContent, clickable: true });
  }
  await checkVisiblePlay(false);
  await page.setViewportSize({ width: 500, height: 400 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => window.__adg.ready);
  const cropped = await outline.boundingBox();
  await viewport.dispatchEvent('wheel', { deltaX: cropped.x + 20, deltaY: cropped.y + 20 });
  await checkVisiblePlay(true);
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

test('contract: presence tracks seek distance, scale and opacity together', async t => {
  const { page, url } = await viewer(t);
  await page.goto(url);
  const values = await page.evaluate(async () => {
    const { createStage, mountScene, observeScene } = await import('./motion-scene.js');
    const { preparePaint } = await import('./motion-paint.js');
    const iframe = await createStage(document.body), doc = iframe.contentDocument;
    const endpoint = show => ({
      frame: 'test', design: 'design', css: 'body{margin:0}',
      html: '<main>' + (show ? '<div data-adg-id="menu" style="position:absolute;left:20px;top:30px;width:100px;height:50px">Menu</div>' : '') + '</main>',
    });
    const before = observeScene(await mountScene(doc, endpoint(false), 'light'), 'design', true);
    const stage = await mountScene(doc, endpoint(true), 'light');
    const after = observeScene(stage, 'design', true);
    const track = { targets: [{ anchor: 'menu' }], properties: ['opacity', 'translate', 'scale'],
      transform: { axis: 'y', distance: '--lift', scale: '--scale' } };
    function sample(from, to, mode) {
      const paint = preparePaint(stage, from, to, {
        phases: [[{ ...track, mode }]],
        timings: { '/duration': 160, '/easing': 'linear' },
        transforms: { '/phases/0/0/transform/distance': '6px', '/phases/0/0/transform/scale': 0.97 },
      });
      const layer = doc.body.lastElementChild.shadowRoot;
      const root = [...layer.children].find(node => node.shadowRoot?.textContent === 'Menu');
      const samples = [0, 0.5, 1, 0.5].map(progress => {
        paint.seek(progress);
        const { x, y, width } = root.getBoundingClientRect();
        return [x, y, width, Number(root.style.opacity)];
      });
      paint.dispose();
      return samples;
    }
    const result = { enter: sample(before, after, 'enter'), exit: sample(after, before, 'exit') };
    iframe.remove();
    return result;
  });
  assert.deepEqual(values.enter, [[20, 24, 97, 0], [20, 27, 98.5, 0.5], [20, 30, 100, 1], [20, 27, 98.5, 0.5]]);
  assert.deepEqual(values.exit, [[20, 30, 100, 1], [20, 27, 98.5, 0.5], [20, 24, 97, 0], [20, 27, 98.5, 0.5]]);
});
