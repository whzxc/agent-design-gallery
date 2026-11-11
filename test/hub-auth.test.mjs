import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, cp, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { startHub } from '../src/hub.mjs';
import { hubKey, equalKey } from '../src/hub/auth.mjs';
import { directLocal } from '../src/http.mjs';
import { addRoot } from '../src/hub/registry.mjs';
import { registerInstance, listInstances } from '../src/hub/instances.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const forwarded = { 'X-Forwarded-Proto': 'https' };
function rawStatus(url, headers) {
  return new Promise((resolve,reject)=>{
    const req=request(url,{headers},response=>{response.resume();resolve(response.statusCode);});
    req.on('error',reject);req.end();
  });
}
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-auth-'));
  const project = path.join(root, 'project'), stateDirectory = path.join(root, 'state');
  await mkdir(project);
  await writeFile(path.join(project, 'adg.config.mjs'), 'export default { name: "Private project" };');
  await cp(new URL('../fixtures/arc-sample/design', import.meta.url), path.join(project, 'design'), { recursive: true });
  await addRoot(project, 0, stateDirectory);
  const hub = await startHub({ port: 0, stateDirectory });
  t.after(async () => { await hub.close(); await rm(root, { recursive: true, force: true }); });
  const key = await hubKey(stateDirectory);
  const auth = { ...forwarded, Authorization: `Bearer ${key}` };
  return { root, project, stateDirectory, hub, key, auth };
}

test('direct-local exemption uses only loopback Host and absence of every forwarding header', () => {
  for (const host of ['localhost','localhost:8000','127.0.0.1','127.0.0.1:9000','[::1]:9000','::1']) {
    assert.equal(directLocal({headers:{host}}),true);
    for (const name of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-forwarded-prefix','x-forwarded-anything'])
      assert.equal(directLocal({headers:{host,[name]:''}}),false);
  }
  for (const host of ['localhost.evil','127.0.0.1.evil','user@localhost','evil.invalid','[::ffff:127.0.0.1]']) assert.equal(directLocal({headers:{host}}),false);
  assert.equal(equalKey('short','longer'),false); assert.equal(equalKey('adg_test','adg_test'),true);
});

test('data endpoints require header or query keys, shells contain no project data, rotation takes effect live', async t => {
  const { hub, key, auth, stateDirectory } = await fixture(t);
  assert.equal((await stat(path.join(stateDirectory,'hub.key'))).mode & 0o777,0o600);
  const [project] = await (await fetch(new URL('api/projects',hub.url),{headers:auth})).json();
  for (const route of ['', 'hub.js','auth.js',project.url, project.url+'app.js',project.url+'tokens.css']) {
    const response = await fetch(new URL(route,hub.url),{headers:forwarded});
    assert.equal(response.status,200,route);
    const body = await response.text();
    assert.doesNotMatch(body,/Private project/);
    if (route === '' || route === project.url) assert.match(body, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
    assert.equal(response.headers.get('set-cookie'),null);
  }
  const icon = await fetch(new URL('favicon.svg',hub.url),{headers:forwarded});
  assert.equal(icon.status,200);
  assert.match(icon.headers.get('content-type'),/^image\/svg\+xml\b/);
  assert.equal(await icon.text(),await readFile(new URL('../design/art/adg-mark.svg',import.meta.url),'utf8'));
  for (const route of ['api/projects','api/instances','api/roots',project.url+'manifest',project.url+'relationships',project.url+'asset/components%2Fbutton.tsx',project.url+'events']) {
    for (const headers of [forwarded,{...forwarded,Authorization:'Bearer invalid'},{Host:'external.invalid'}])
      assert.equal(await rawStatus(new URL(route,hub.url),headers),401,route);
  }
  for (const headers of [{...forwarded,'X-ADG-Key':key},auth]) assert.equal((await fetch(new URL('api/projects',hub.url),{headers})).status,200);
  assert.equal((await fetch(new URL(`api/projects?key=${key}`,hub.url),{headers:forwarded})).status,200);
  assert.equal((await fetch(new URL('api/projects',hub.url))).status,200);
  assert.equal((await fetch(new URL('api/rescan',hub.url),{headers:forwarded,method:'POST'})).status,401);
  assert.equal((await fetch(new URL('api/rescan',hub.url),{headers:{...auth,Origin:'https://evil.invalid'},method:'POST'})).status,403);
  assert.equal((await fetch(new URL('api/rescan',hub.url),{headers:auth,method:'POST'})).status,200);
  assert.equal((await fetch(new URL(project.url+'manifest',hub.url),{headers:auth})).status,200);
  assert.equal((await fetch(new URL(project.url+'asset/components%2Fbutton.tsx',hub.url),{headers:auth})).status,200);
  const sse = await fetch(new URL(project.url+`events?key=${key}`,hub.url),{headers:forwarded});
  assert.equal(sse.status,200); assert.match(sse.headers.get('content-type'),/text\/event-stream/);
  const reader=sse.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value),/data:/); await reader.cancel();
  const exec=promisify(execFile), cli=new URL('../src/cli.mjs',import.meta.url).pathname;
  const printed=await exec(process.execPath,[cli,'serve','--print-key','--state-dir',stateDirectory]);
  assert.equal(printed.stdout.trim(),key);
  await exec(process.execPath,[cli,'serve','--rotate-key','--state-dir',stateDirectory]);
  assert.equal((await fetch(new URL('api/projects',hub.url),{headers:auth})).status,401);
  assert.equal((await fetch(new URL('api/projects',hub.url),{headers:{...forwarded,'X-ADG-Key':await hubKey(stateDirectory)}})).status,200);
});

test('instance proxy streams its own server and strips credentials and browser filesystem mutations', async t => {
  const { hub, stateDirectory, project, auth, key } = await fixture(t);
  const seen=[];
  const instance = createServer((req,res) => {
    if (req.url==='/api/health') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'custom',capabilities:{keyAuth:1}}));return;}
    seen.push({url:req.url,headers:req.headers});
    if (req.url.startsWith('/events')) {res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: custom-stream\n\n');return;}
    res.end('own modified instance code');
  });
  await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{instance.closeAllConnections();await new Promise(resolve=>instance.close(resolve));});
  await registerInstance({directory:project,port:instance.address().port,id:'custom',stateDirectory});
  for(const route of ['','app.js','manifest','asset/anything?theme=dark']) {
    const response=await fetch(new URL(`i/custom/${route}${route.includes('?')?'&':'?'}key=${key}`,hub.url),{headers:{...auth,'X-ADG-Key':key,Cookie:'test=discard'}});
    assert.equal(response.status,200);assert.equal(await response.text(),'own modified instance code');
  }
  assert.equal((await fetch(new URL('i/custom/manifest',hub.url),{headers:forwarded})).status,401);
  for(const route of ['open','reveal','anything']) assert.equal((await fetch(new URL(`i/custom/${route}`,hub.url),{headers:auth,method:'POST'})).status,405);
  const stream=await fetch(new URL(`i/custom/events?key=${key}`,hub.url),{headers:forwarded});
  const reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/custom-stream/);await reader.cancel();
  for(const {url,headers} of seen) {
    assert.equal(new URL(url,'http://localhost').searchParams.has('key'),false);
    for(const name of ['authorization','x-adg-key','cookie','forwarded','x-forwarded-proto']) assert.equal(headers[name],undefined);
  }
  await writeFile(path.join(stateDirectory,'instances/legacy.json'),JSON.stringify({id:'legacy',pid:process.pid,port:instance.address().port}));
  // Reused port identities are pruned rather than ever routed.
  assert.equal((await fetch(new URL('i/legacy/manifest',hub.url),{headers:auth})).status,404);
});

test('browser captures localStorage key, cleans URL, authenticates prefixed viewer and shows401 without a key', async t => {
  const { hub, key }=await fixture(t), browser=await launch();
  try {
    const context=await browser.newContext({extraHTTPHeaders:forwarded}),page=await context.newPage(),requests=[],errors=[];
    page.on('request',req=>requests.push({url:req.url(),headers:req.headers()}));page.on('pageerror',error=>errors.push(error.message));
    await page.goto(hub.url+`?key=${key}&keep=yes#anchor`);
    await page.waitForSelector('#projects a');
    assert.equal(new URL(page.url()).searchParams.has('key'),false);
    assert.equal(new URL(page.url()).searchParams.get('keep'),'yes');
    assert.equal(await page.evaluate(()=>localStorage.getItem('adg-key')),key);
    assert.equal((await context.cookies()).length,0);
    await page.locator('#projects a').click();
    await page.waitForFunction(()=>window.__adg?.ready);
    await page.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('/asset/')));
    assert.ok(requests.some(req=>req.url.includes('/asset/')&&req.headers.authorization===`Bearer ${key}`));
    assert.ok(requests.some(req=>req.url.includes('/events?key=')));
    await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    assert.deepEqual(errors,[]);
    const denied=await browser.newContext({extraHTTPHeaders:forwarded}),deniedPage=await denied.newPage();
    await deniedPage.goto(hub.url);
    await deniedPage.getByRole('heading', { name: 'Key required', exact: true }).waitFor();
    assert.match(await deniedPage.getByRole('alert').innerText(), /This browser needs an access key\./);
    await deniedPage.evaluate(() => localStorage.setItem('adg-key', 'rejected'));
    await deniedPage.reload();
    await deniedPage.getByRole('heading', { name: 'Key required', exact: true }).waitFor();
    assert.match(await deniedPage.getByRole('alert').innerText(), /The key saved in this browser was rejected\./);
    await denied.close();await context.close();
  } finally {await browser.close();}
});

test('adg open records actual health identity and cleans records on exit without a running hub', async t => {
  const state=await mkdtemp(path.join(tmpdir(),'adg-open-contract-'));
  const child=spawn(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'open',new URL('../fixtures/arc-sample/design',import.meta.url).pathname,'--no-open','--port','0','--state-dir',state],{stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(state,{recursive:true,force:true});});
  const url=await new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(new Error('Instance CLI startup timed out')),5000);
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/ADG: (http:\/\/\S+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
    child.once('exit',()=>{clearTimeout(timeout);reject(new Error(output));});child.once('error',reject);
  });
  const [record]=await listInstances(state);
  assert.equal(record.pid,child.pid);assert.equal(record.proxyable,true);assert.equal(record.worktree,(await stat(new URL("../.git",import.meta.url))).isFile());
  assert.equal((await(await fetch(new URL('api/health',url))).json()).id,record.id);
  const icon = await fetch(new URL('favicon.svg',url));
  assert.equal(icon.status,200);
  assert.match(icon.headers.get('content-type'),/^image\/svg\+xml\b/);
  const hub=await startHub({port:0,stateDirectory:state});
  const browser=await launch();
  try {
    const context=await browser.newContext({extraHTTPHeaders:forwarded}),page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(new URL(`i/${record.id}/?key=${await hubKey(state)}`,hub.url).href);
    await page.waitForFunction(()=>window.__adg?.ready);
    assert.equal(new URL(page.url()).searchParams.has('key'),false);
    await page.reload();await page.waitForFunction(()=>window.__adg?.ready);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await hub.close();}
  assert.equal((await fetch(new URL('manifest',url))).status,200);
  const done=once(child,'exit');child.kill('SIGTERM');await done;
  assert.deepEqual(await readdir(path.join(state,'instances')),[]);
});
