import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { cp, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startServer } from '../src/server.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { launch } from '../src/toolkit/browser.mjs';

test('contract: period net changes, working-tree generations and visit ancestry through the viewer', async t => {
  const dir = await mkdtemp(path.join(tmpdir(),'adg-recent-'));
  const root = path.join(dir,'project'), design = path.join(root,'design'), stateDirectory = path.join(dir,'state');
  let server;
  t.after(async () => {
    try { await server?.close(); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
  // Visual workers fingerprint the runtime files on each request. Keep those
  // inputs fixed for the cold and warm requests even while the checkout is edited.
  const runtime = path.join(dir, 'runtime');
  const checkout = path.resolve(import.meta.dirname, '..');
  await mkdir(runtime);
  await Promise.all(['src', 'public', 'package.json'].map(name =>
    cp(path.join(checkout, name), path.join(runtime, name), { recursive: true })));
  await symlink(path.join(checkout, 'node_modules'), path.join(runtime, 'node_modules'), 'junction');
  const { startServer: startFixtureServer } = await import(pathToFileURL(path.join(runtime, 'src/server.mjs')));
  const modules = path.join(design,'modules');
  await mkdir(modules,{recursive:true});
  const frame = (name, text) => `<Frame name="${name}" width={100} height={50}><div>${text}</div></Frame>`;
  const source = (...frames) => `import {Frame} from 'adg'; export default()=>[${frames.join(',')}];`;
  const put = (file, ...frames) => writeFile(path.join(modules,file+'.tsx'),source(...frames));
  const git = (...args) => execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  const commit = (date,subject) => {
    git('add','.');
    execFileSync('git',['-C',root,'commit','-qm',subject],{env:{...process.env,GIT_COMMITTER_DATE:date,GIT_AUTHOR_DATE:date}});
    return git('rev-parse','HEAD');
  };
  await writeFile(path.join(root,'adg.config.mjs'),'export default {};');
  await writeFile(path.join(design,'tokens.css'),starterTokens.replace(':root {',':root {\n  --notice: #001122;'));
  await put('notice',`<Frame name="notice" width={100} height={50}><div style={{color:'var(--notice)'}}>Notice</div></Frame>`);
  const feature = path.join(modules,'feature');
  await mkdir(feature);
  await mkdir(path.join(design,'surfaces'));
  const internal = text => writeFile(path.join(feature,'badge.tsx'),`export function Badge(){return <b>${text}</b>}`);
  await internal('Before');
  await writeFile(path.join(feature,'index.tsx'),`import {Frame} from 'adg';import {Badge} from './badge';export {Badge};
    export default()=>[<Frame name="badge"><Badge/></Frame>,<Frame name="untouched"><i/></Frame>];`);
  await writeFile(path.join(design,'surfaces','example.tsx'),`import {Frame} from 'adg';import {Badge} from '../modules/feature';
    export default()=> <Frame name="screen"><div style={{color:'var(--notice)'}}><Badge/></div></Frame>;`);
  const stable = frame('sibling','Stable');
  const parts = (note,label) => `import {Frame} from 'adg';
    export function Flag(){ ${note} return <b>Flag</b> }
    export default()=>[<Frame name='using'><Flag/></Frame>,<Frame name="authored"><p>{${label}}</p></Frame>,<Frame name="other"><i>Other</i></Frame>];`;
  const partsFile=path.join(modules,'flags.tsx');
  await writeFile(partsFile,parts('',"'A'"));
  await put('entry',stable,frame('home','Before'));
  await put('old',frame('moving','Keep'));
  git('init','-q'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.test');
  const initial = commit('2026-11-08T09:00:00Z','Initial');
  await put('entry',stable,frame('home','Interim'));
  commit('2026-11-16T09:00:00Z','Interim');
  await put('entry',stable,frame('home','Before'));
  commit('2026-11-17T09:00:00Z','Revert interim');
  await rename(path.join(modules,'old.tsx'),path.join(modules,'new.tsx'));
  await put('entry',stable,frame('home','Committed'));
  await writeFile(path.join(design,'tokens.css'),starterTokens.replace(':root {',':root {\n  --notice: #ff2211;'));
  await internal('After');
  await writeFile(partsFile,parts('/* Clarify Flag */','"A"'));
  await writeFile(path.join(root,'bun.lock'),'{}');
  await writeFile(path.join(root,'adg.config.mjs'),'export default { check: {strictMotion:true} };');
  commit('2026-11-21T09:00:00Z','Move and change');
  await put('entry',stable,frame('home','Dirty staged')); git('add','design/modules/entry.tsx');
  await put('entry',stable,frame('home','Dirty'));
  await put('untracked',frame('extra','Extra'));
  await rm(path.join(modules,'new.tsx'));
  const baseline = git('status','--porcelain'), tree = git('write-tree');
  // Include enough generated frames for a second page without testing incidental markup.
  await put('batch', ...Array.from({ length: 24 }, (_, i) => frame('batch-' + i, 'Batch')));
  server = await startFixtureServer({directory:design,stateDirectory,port:0,readOnly:true});
  const url = new URL('api/recent-updates',server.url);
  url.search = new URLSearchParams({day:+new Date('2026-11-21'),week:+new Date('2026-11-16')});
  const get = async () => (await fetch(url)).json();
  const feed = new URL('/api/recent-frames', url);
  feed.search = url.search;
  const frames = async () => (await fetch(feed)).json();
  const direct = await frames();
  assert.deepEqual(direct.failures, []);
  assert.equal(direct.rows.length, 20);
  assert.ok(direct.hasMore);
  assert.equal(direct.rows[0].subject, 'Uncommitted changes');
  assert.ok(direct.rows.every(row => Number.isSafeInteger(row.time)));
  feed.searchParams.set('offset', '20');
  feed.searchParams.set('snapshot', direct.snapshot);
  const next = await frames();
  const all = [...direct.rows, ...next.rows];
  assert.equal(new Set(all.map(row => JSON.stringify([row.source, row.frame]))).size, all.length);
  assert.ok(all.every((row, i) => !i || row.time <= all[i - 1].time));
  assert.ok(all.some(row => row.frame === 'badge' && row.subject === 'Move and change'));
  assert.ok(all.some(row => row.frame === 'home' && row.subject === 'Uncommitted changes'));
  assert.ok(!all.some(row => ['screen', 'notice', 'sibling', 'other'].includes(row.frame)));
  await rm(path.join(modules, 'batch.tsx'));
  assert.equal((await frames()).stale, true);
  feed.searchParams.delete('offset');
  feed.searchParams.set('since', git('rev-parse', 'HEAD'));
  assert.ok((await frames()).rows.every(row => row.commit === null));
  feed.searchParams.set('since', 'f'.repeat(40));
  assert.match((await frames()).notice, /History changed/);
  feed.searchParams.delete('since');
  feed.searchParams.set('latest', '1');
  assert.ok((await frames()).rows.some(row => row.frame === 'notice' && row.commit === initial));
  const first = await get();
  assert.equal(first.complete,true,JSON.stringify(first));
  assert.deepEqual(first.periods.map(p=>p.title),['Uncommitted','Today','Earlier this week']);
  const [dirty,today,older] = first.periods;
  const changes = p => p.rows.map(row=>row.status+':'+row.frame).sort();
  assert.deepEqual(changes(dirty),['added:extra','changed:home','removed:moving']);
  assert.deepEqual(changes(today),['changed:authored','changed:badge','changed:home','changed:notice','changed:screen','changed:using','moved:moving']);
  assert.deepEqual(today.globalCauses,['adg.config.mjs','bun.lock']);
  assert.ok(!today.rows.some(row => row.frame === 'other'));
  assert.deepEqual(today.rows.find(r=>r.frame==='notice').causes,['design/tokens.css']);
  assert.equal(today.rows.find(r=>r.frame==='badge').causes,undefined);
  assert.deepEqual(today.rows.find(r=>r.frame==='screen').causes,['design/modules/feature/badge.tsx','design/tokens.css']);
  const visual=new URL(url);
  visual.pathname='/api/recent-visual';
  visual.searchParams.set('from',today.base); visual.searchParams.set('to',today.head);
  const verify=async()=> (await (await fetch(visual)).text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const events=await verify();
  assert.ok(events.some(e=>e.phase==='Comparing frame images'));
  assert.ok(events.some(e=>e.changes?.some(r=>r.frame==='home' && r.status==='changed')));
  const verdict=events.at(-1).result.periods[0];
  assert.ok(verdict.complete);
  assert.ok(verdict.rows.some(r=>r.frame==='home'));
  assert.ok(!verdict.rows.some(r=>['using','authored'].includes(r.frame)));
  assert.equal((await verify()).at(-1).result.periods[0].cached,true);
  assert.equal(today.rows.find(r=>r.status==='moved').former.source,'design/modules/old.tsx');
  assert.deepEqual(changes(older),[]); assert.deepEqual(older.subjects,['Revert interim','Interim']);
  const reopened = await get();
  assert.ok(reopened.periods.every(p=>p.cached),JSON.stringify(reopened));
  await put('entry',stable,frame('home','Committed'));
  const second = await get();
  assert.notEqual(second.generation,first.generation);
  assert.deepEqual(changes(second.periods[0]),['added:extra','removed:moving']);
  assert.ok(second.periods[1].cached);
  url.searchParams.set('since',initial);
  assert.equal((await get()).notice,null);
  url.searchParams.set('since','f'.repeat(40));
  assert.match((await get()).notice,/History changed/);
  assert.equal(git('status','--porcelain'),baseline); assert.equal(git('write-tree'),tree);
  assert.equal(await readFile(path.join(modules,'entry.tsx'),'utf8'),source(stable,frame('home','Committed')));
});

test('contract: directory visit checkpoints survive reload and remain independent across branches and tabs',async t=>{
  const dir = await mkdtemp(path.join(tmpdir(),'adg-visit-'));
  const server = await startServer({directory:path.resolve('fixtures/arc-sample/design'),stateDirectory:dir,readOnly:true});
  const browser = await launch();
  t.after(async()=>{await browser.close();await server.close();await rm(dir,{recursive:true,force:true});});
  const context = await browser.newContext();
  let head='a'.repeat(40),branch='main';
  await context.route('**/api/recent-visit',r=>r.fulfill({json:{head,branch}}));
  const page = await context.newPage();
  const url = new URL('recent-updates.js',server.url).href;
  const visit = async p => p.evaluate(async url => (await import(url)).recordVisit('project',true),url);
  // Open a same-origin document without starting a board visit for the test directory.
  await page.goto(url);
  assert.equal((await visit(page)).baseline,null);
  head='b'.repeat(40);
  await page.reload(); assert.equal((await visit(page)).baseline,null);
  const next = await context.newPage();await next.goto(url);
  assert.equal((await visit(next)).baseline,'a'.repeat(40));
  head='c'.repeat(40);assert.equal((await visit(page)).baseline,null);
  branch='other';assert.equal((await visit(page)).baseline,null);
  branch='main';const last=await context.newPage();await last.goto(url);
  assert.equal((await visit(last)).baseline,'b'.repeat(40));
});

test('contract: both history ranges bound the global input summary and disclose all files by directory', async t => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'adg-global-inputs-'));
  const directory = path.resolve('fixtures/arc-sample/design');
  const server = await startServer({ directory, stateDirectory, readOnly: true });
  const browser = await launch();
  t.after(async () => { await browser.close(); await server.close(); await rm(stateDirectory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const head = 'a'.repeat(40), baseline = 'b'.repeat(40), branch = 'fixture';
  const directories = ['src/toolkit', 'fixtures'];
  const globalCauses = [
    ...directories.flatMap(dir => Array.from({ length: 29 }, (_, i) => `${dir}/input-${i}.mjs`)),
    'package-lock.json', 'README.md', 'package.json', 'adg.config.mjs'
  ];
  await page.addInitScript(({ directory, branch, baseline }) => {
    localStorage.setItem('adg-visit:' + JSON.stringify([directory, branch]), JSON.stringify({ started: 0, head: baseline }));
  }, { directory, branch, baseline });
  await page.route('**/api/recent-visit', route => route.fulfill({ json: { head, branch } }));
  await page.route('**/api/recent-state', route => route.fulfill({ json: { head, branch, generation: 'fixture' } }));
  const requests = [], rangeRequests = [];
  await page.route('**/api/recent-frames?*', route => {
    const params = new URL(route.request().url()).searchParams;
    rangeRequests.push(params.get('since') ?? (params.has('latest') ? 'latest' : 'week'));
    const rows = [{
      source: 'design/modules/example.tsx', frame: 'retired', status: 'removed',
      subject: 'Remove the example frame', time: Date.UTC(2026, 10, 20, 10)
    }];
    return route.fulfill({ json: { head, branch, available: true, generation: 'fixture', rows, hasMore: false } });
  });
  await page.route('**/api/recent-updates?*', route => {
    requests.push(new URL(route.request().url()).searchParams.get('since'));
    const periods = [{ title: 'Today', head, base: baseline, complete: true, rows: [], globalCauses }];
    return route.fulfill({ json: { head, branch, available: true, complete: true, generation: 'fixture', periods } });
  });

  await page.goto(new URL('view/all?view=recent', server.url).href);
  const details = page.locator('.recent-global');
  const summary = details.locator('summary');
  await page.getByText('Remove the example frame', { exact: true }).waitFor();
  assert.deepEqual(requests, []);
  assert.deepEqual(rangeRequests, ['latest']);
  for (const since of [null, baseline]) {
    await page.getByRole('button', { name: since ? 'Since my last visit' : 'This week', exact: true }).click();
    await page.getByRole('button', { name: 'Show impact' }).click();
    await summary.waitFor();
    assert.equal(requests.at(-1), since);
    assert.equal(await details.getAttribute('open'), null);
    const text = await summary.textContent();
    const match = /^Global inputs changed: 62 files \((.+), \+60\)$/.exec(text);
    assert.ok(match, text);
    assert.deepEqual(match[1].split(', '), ['adg.config.mjs', 'package.json']);
    assert.equal(await details.getByRole('listitem').count(), 0);
    await summary.press('Enter');
    await details.getByRole('heading', { name: 'src/toolkit', exact: true }).waitFor();
    assert.deepEqual(await details.getByRole('heading').allTextContents(), ['Project root', 'fixtures', 'src/toolkit']);
    assert.equal(await details.getByRole('listitem').count(), globalCauses.length);
    await summary.press('Enter');
    assert.equal(await details.getByRole('listitem').count(), 0);
  }
});

test('lifecycle: cancelling an open comparison releases its revision cache and preserves board service',async t=>{
  const stateDirectory=await mkdtemp(path.join(tmpdir(),'adg-cancel-'));
  const server=await startServer({directory:path.resolve('design'),stateDirectory,readOnly:true});
  t.after(async()=>{await server.close();await rm(stateDirectory,{recursive:true,force:true});});
  const controller=new AbortController();
  const recent=new URL('api/recent-updates',server.url);
  recent.search=new URLSearchParams({day:Date.now(),week:Date.now()-86400000});
  const request=fetch(recent,{signal:controller.signal}).then(r=>r.json());
  const jobs=async()=>(await readdir(path.join(stateDirectory,'cache'),{recursive:true})).filter(name=>path.basename(name).startsWith('job-'));
  const wait=async predicate=>{
    for(let i=0;i<200;i++) {if(await predicate())return; await new Promise(resolve=>setTimeout(resolve,25));}
    assert.fail('Timed out waiting for the comparison worker lifecycle.');
  };
  await wait(async()=>(await jobs()).length>0);
  const response=await fetch(new URL('api/health',server.url),{signal:AbortSignal.timeout(3000)});
  assert.equal((await response.json()).id,server.id);
  controller.abort();await assert.rejects(request,{name:'AbortError'});
  await wait(async()=>(await jobs()).length===0);
});

test('contract: non-Git, unborn and failed source coverage remain distinguishable',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'adg-recent-coverage-'));
  const root=path.join(dir,'consumer'),design=path.join(root,'design');
  await mkdir(path.join(design,'modules'),{recursive:true});
  await writeFile(path.join(root,'adg.config.mjs'),'export default {};');
  await writeFile(path.join(design,'tokens.css'),starterTokens);
  const frame=path.join(design,'modules','home.tsx');
  await writeFile(frame,"import {Frame} from 'adg'; export default()=> <Frame name='home'><div>Home</div></Frame>;");
  const server=await startServer({directory:design,stateDirectory:path.join(dir,'state'),readOnly:true});
  t.after(async()=>{await server.close();await rm(dir,{recursive:true,force:true});});
  const url=new URL('api/recent-updates',server.url);
  url.search=new URLSearchParams({day:Date.now(),week:Date.now()-86400000});
  const get=async()=>(await fetch(url)).json();
  assert.equal((await get()).available,false);
  execFileSync('git',['-C',root,'init','-q']);
  const unborn=await get();
  assert.equal(unborn.complete,true,JSON.stringify(unborn));
  assert.deepEqual(unborn.periods[0].rows.map(r=>r.frame),['home']);
  // A long subject exercises full worker replies beyond the IPC pipe buffer
  // without requiring thousands of raster comparisons.
  execFileSync('git',['-C',root,'add','.']);
  const subject='a'.repeat(512*1024);
  execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qF','-'],{input:subject});
  const large=await get();
  assert.equal(large.complete,true);
  assert.equal(large.periods.at(-1).subjects[0]?.length,subject.length);
  await writeFile(frame,'broken TSX syntax here');
  const broken=await get();
  assert.equal(broken.available,true);
  assert.equal(broken.complete,false);
  assert.ok(broken.periods[0].failures.length);
});
