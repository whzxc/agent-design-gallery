import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const fields = ['components/field.tsx', 'components/other.tsx'];
const home = 'surfaces/home.tsx', summary = 'modules/summary.tsx';
const source = (...names) => `import {Frame} from 'sdg'; export default () => ${JSON.stringify(names)}
  .map(name => <Frame name={name} width={240} height={100}><div>{name}</div></Frame>);`;

test('render scopes bound cold loads and live edits, with independent focus links and Back', { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdg-render-scope-'));
  const directory = path.join(root, 'design'), stateDirectory = path.join(root, 'state');
  let server, browser;
  try {
    for (const layer of ['components', 'modules', 'surfaces']) await mkdir(path.join(directory, layer), {recursive:true});
    await copyFile(new URL('../design/tokens.css', import.meta.url), path.join(directory, 'tokens.css'));
    await writeFile(path.join(directory, 'gallery.json'), JSON.stringify({groups:[{title:'Essentials',assets:[fields[0],home]}]}));
    for (const asset of [...fields,home,summary]) {
      await writeFile(path.join(directory,asset),asset===fields[0] ? source('default','error') : source('default'));
    }
    server=await startServer({directory,stateDirectory});
    browser=await launch();
    const page=await browser.newPage();
    const requests=[];
    page.on('request', request => {
      const route = new URL(request.url()).pathname;
      if (route.startsWith('/asset/') && request.method()==='GET') requests.push(decodeURIComponent(route.slice(7)));
    });
    const ready = scope => page.waitForFunction(scope=>window.__sdg?.ready && window.__sdg.scope===scope,scope);
    const paths = async tab => [...new Set(await tab.evaluate(()=>window.__sdg.items.map(item=>item.path)))].sort();
    const query = key => new URL(page.url()).searchParams.get(key);
    const builds = () => server.cacheStats().builds.builds;
    const switchTo = async (label, scope) => {
      await page.locator('#render-scope').click();
      await page.locator('#scope-menu').getByRole('button',{name:label,exact:true}).click();
      await ready(scope);
    };

    await page.goto(server.url);
    await ready('layer:components');
    assert.deepEqual(await paths(page),fields);
    assert.deepEqual([...new Set(requests)].sort(),fields);
    assert.equal(builds(),2);
    assert.equal(await page.locator('#source').isVisible(),false);

    await page.locator('[data-navkey="group:Essentials"]').click();
    const camera = await page.evaluate(()=>window.__sdg.view);
    assert.equal(query('group'),'Essentials');
    assert.equal(query('scope'),'layer:components');
    assert.deepEqual(await paths(page),fields);
    await page.getByRole('button',{name:'Render only this group: Essentials',exact:true}).click();
    await ready('group:Essentials');
    assert.deepEqual(await paths(page),[fields[0],home]);
    assert.equal(query('group'),null);
    assert.equal(builds(),3);

    await page.getByRole('button',{name:'Render only this asset: field',exact:true}).click();
    await ready(`asset:${fields[0]}`);
    assert.deepEqual(await paths(page),[fields[0]]);
    await page.locator('[data-navkey="form:error"]').click();
    assert.equal(query('frame'),'error');
    assert.equal(await page.locator('#source').isVisible(),false);
    const shared=await browser.newPage();
    await shared.goto(page.url());
    await shared.waitForFunction(()=>window.__sdg?.ready);
    assert.deepEqual(await paths(shared),[fields[0]]);
    assert.equal(await shared.locator('#frame-name').textContent(),'error');
    assert.equal(await shared.locator('#source').isVisible(),false);
    await shared.close();
    await page.locator('#back').click(); // Back from the frame to the isolated asset.
    await page.locator('#back').click();
    await ready('group:Essentials');
    await page.locator('#back').click();
    await ready('layer:components');
    assert.equal(query('group'),'Essentials');
    assert.deepEqual(await page.evaluate(()=>window.__sdg.view),camera);

    await switchTo('Modules','layer:modules');
    assert.deepEqual(await paths(page),[summary]);
    await switchTo('All designs','all');
    assert.deepEqual(await paths(page),[...fields,summary,home].sort());
    await switchTo('Components','layer:components');
    const revision=await page.evaluate(()=>window.__sdg.revision), before=builds();
    requests.length=0;
    await writeFile(path.join(directory,home),source('updated'));
    await page.waitForFunction(revision=>window.__sdg.ready&&window.__sdg.revision>revision,revision);
    assert.equal(builds(),before,'an edit outside the active scope does not rebuild that source');
    assert.ok(!requests.includes(home));
    await switchTo('Surfaces','layer:surfaces');
    assert.deepEqual(await paths(page),[home]);
    assert.equal(builds(),before+1);

    await page.goto(server.url+'?group=Essentials');
    await ready('all');
    assert.deepEqual(await paths(page),[...fields,summary,home].sort());
    assert.equal(query('group'),'Essentials');
    const fallback = await (await fetch(server.url+'manifest?scope=asset:missing')).json();
    assert.equal(fallback.scope,'layer:components');
  } finally {
    await browser?.close();
    await server?.close();
    await rm(root,{recursive:true,force:true});
  }
});
