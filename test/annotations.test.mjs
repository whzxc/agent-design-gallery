import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer} from '../src/server.mjs';
import {main} from '../src/cli.mjs';

test('annotation API persists per project across viewers and CLI reads and resolves with envelopes',async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'adg-annotations-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const design=path.join(root,'design'),state=path.join(root,'external');await mkdir(design);await writeFile(path.join(root,'adg.config.mjs'),'export default {design:"design"}');
 let server=await startServer({directory:design,stateDirectory:state});
 t.after(()=>server.close());
 const api=async(action,payload={})=>{const r=await fetch(new URL('api/annotations',server.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});return [r.status,await r.json()];};
 const [status,row]=await api('create',{source:'screens/test.tsx',frame:'Example',note:'First note',x:.2,y:.3});assert.equal(status,200);assert.equal(row.number,1);assert.ok('revision' in row);
 assert.equal((await api('create',{note:'invalid'}))[0],400);
 assert.equal((await api('update',{id:row.id,note:'Changed',x:.7}))[1].x,.7);
 await server.close();server=await startServer({directory:design,stateDirectory:path.join(state,'viewer'),annotationStateDirectory:state});
 assert.equal((await(await fetch(new URL('api/annotations',server.url))).json())[0].note,'Changed');
 const cli=async(args)=>{let out='';await main(['annotations',...args,'--state-dir='+state,'--json'],root,{stdout:v=>out+=v,stderr:()=>{},exit:()=>{}});const e=JSON.parse(out);assert.equal(e.ok,true);assert.equal(e.command,'annotations');return e.data;};
 assert.equal((await cli([])).length,1);assert.equal((await cli(['read',row.id])).note,'Changed');assert.equal((await cli(['resolve',row.id])).status,'resolved');
 assert.equal((await(await fetch(new URL('api/annotations',server.url))).json())[0].status,'resolved');
 assert.equal((await api('delete',{id:row.id}))[0],200);assert.deepEqual(await cli([]),[]);
});

test('viewer drops, edits, reloads, moves and deletes annotation callouts', {timeout:60000},async t=>{
 const {launch}=await import('../src/toolkit/browser.mjs');const {states,recent}=await import('../fixtures/viewer.mjs');
 const state=await mkdtemp(path.join(tmpdir(),'adg-annotation-ui-'));t.after(()=>rm(state,{recursive:true,force:true}));
 const server=await startServer({directory:path.resolve('fixtures/arc-sample/design'),stateDirectory:state,fixtures:{states,recent}});t.after(()=>server.close());
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(server.url+'?fixture=sample-inspect-component');await page.waitForFunction(()=>window.__adg?.ready);
 await page.locator('#annotate').click();
 const box=await page.locator('#selection-outline').boundingBox();assert.ok(box);
 await page.mouse.click(box.x+box.width*.4,box.y+box.height*.4);
 await page.getByRole('textbox',{name:'Annotation note'}).fill('Review this point');await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.annotation-note').waitFor();assert.match(await page.locator('.annotation-note').textContent(),/Review this point/);
 await page.locator('.annotation-note').click();await page.getByRole('textbox',{name:'Annotation note'}).fill('Updated note');await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.annotation-note')?.textContent.includes('Updated note'));
 await page.reload();await page.waitForFunction(()=>window.__adg?.ready);await page.locator('.annotation-note').waitFor();
 await page.getByRole('button',{name:'Move',exact:true}).click();const next=await page.locator('#selection-outline').boundingBox();await page.mouse.click(next.x+next.width*.7,next.y+next.height*.7);
 await page.waitForFunction(async()=>{const rows=await(await fetch('api/annotations')).json();return rows[0]?.x>.65;});
 await page.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.annotation-note'));
});

test('hub proxies annotation writes and shares standalone project storage',async t=>{
 const {startHub}=await import('../src/hub.mjs');const {addRoot,listProjects}=await import('../src/hub/registry.mjs');
 const state=await mkdtemp(path.join(tmpdir(),'adg-annotation-hub-'));t.after(()=>rm(state,{recursive:true,force:true}));
 const consumer=path.join(state,'consumer');await mkdir(path.join(consumer,'design'),{recursive:true});await writeFile(path.join(consumer,'adg.config.mjs'),'export default {}');
 await addRoot(consumer,0,state);
 const project=(await listProjects(state))[0];assert.ok(project);
 const hub=await startHub({port:0,stateDirectory:state});t.after(()=>hub.close());
 const response=await fetch(new URL(`p/${project.slug}/api/annotations`,hub.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',source:'components/button.tsx',frame:'primary',note:'Hub note',x:.1,y:.2})});assert.equal(response.status,200);
 const {annotations}=await import('../src/annotations.mjs');assert.equal((await annotations(project.path,state))[0].note,'Hub note');
 const denied=await fetch(new URL(`p/${project.slug}/api/annotations`,hub.url),{headers:{'X-Forwarded-Host':'example.test'}});assert.equal(denied.status,401);
});
