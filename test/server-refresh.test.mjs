import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer} from '../src/server.mjs';

test('an embedded artwork edit refreshes a legacy SVG without a TSX dependency', async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'adg-embedded-refresh-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const design=path.join(root,'design');
  await mkdir(path.join(design,'components'),{recursive:true});
  await mkdir(path.join(design,'art'));
  const pixels=[
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  ];
  const image=path.join(design,'art/pixel.png');
  await writeFile(image,Buffer.from(pixels[0],'base64'));
  await writeFile(path.join(design,'components/sheet.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="../art/pixel.png" width="10" height="10"/></svg>');
  const server=await startServer({directory:design,stateDirectory:path.join(root,'state')});
  t.after(()=>server.close());
  const url=new URL('asset/components%2Fsheet.svg',server.url);
  const first=await fetch(url),body=await first.text();
  assert.ok(body.includes(pixels[0]));
  const {revision}=await(await fetch(new URL('manifest',server.url))).json();
  await writeFile(image,Buffer.from(pixels[1],'base64'));
  let current=revision;
  for(let attempt=0;attempt<100&&current===revision;attempt++){
    await new Promise(resolve=>setTimeout(resolve,10));
    current=(await(await fetch(new URL('manifest',server.url))).json()).revision;
  }
  assert.ok(current>revision,'embedded-only edits must publish a new revision');
  const second=await fetch(url),updated=await second.text();
  assert.ok(updated.includes(pixels[1]));
  assert.notEqual(second.headers.get('etag'),first.headers.get('etag'));
});
