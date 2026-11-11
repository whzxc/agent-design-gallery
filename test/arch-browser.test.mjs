import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { launch } from '../src/toolkit/browser.mjs';
import { createArchBrowser } from '../src/toolkit/arch-browser.mjs';

class Browser extends EventEmitter {
  closes = 0;
  async close() { this.closes++; this.emit('disconnected'); }
}

test('worker measurement browser is lazy, reused, closed when idle, and closed on shutdown',async t=>{
  const browsers=[];
  const session=createArchBrowser({idleMs:20,launchBrowser:async()=>{const b=new Browser();browsers.push(b);return b;}});
  t.after(()=>session.close());
  assert.equal(browsers.length,0);
  const first=await session.run(browser=>browser);
  assert.equal(await session.run(browser=>browser),first);
  assert.equal(browsers.length,1);
  await once(first,'disconnected');
  assert.equal(first.closes,1);
  const second=await session.run(browser=>browser);
  assert.notEqual(second,first);
  await session.close();assert.equal(second.closes,1);
  await session.close();assert.equal(second.closes,1);
});

test('idle disposal waits for active work and a new lease waits for browser closure',async t=>{
  let finishClose,finishWork,releaseStarted;
  const first=new Browser(),second=new Browser();let launches=0;
  first.close=()=>new Promise(resolve=>{first.closes++;finishClose=()=>{first.emit('disconnected');resolve();};releaseStarted();});
  const closing=new Promise(resolve=>{releaseStarted=resolve;});
  const session=createArchBrowser({idleMs:10,launchBrowser:async()=>++launches===1?first:second});
  t.after(()=>session.close());
  const started=new Promise(resolve=>{
    session.run(async browser=>{resolve();await new Promise(done=>{finishWork=done;});assert.equal(browser.closes,0);});
  });
  await started;assert.equal(first.closes,0);
  finishWork();await closing;
  const next=session.run(browser=>browser);
  assert.equal(launches,1);finishClose();
  assert.equal(await next,second);
});

test('a rejected launch is retried and does not become a cached browser',async t=>{
  let launches=0;const browser=new Browser();
  const session=createArchBrowser({launchBrowser:async()=>{if(++launches===1)throw Error('launch failed');return browser;}});
  t.after(()=>session.close());
  await assert.rejects(session.run(()=>{}),/launch failed/);
  assert.equal(await session.run(b=>b),browser);
  assert.equal(launches,2);
});


test('Chromium launch errors retain a concrete installation hint',async t=>{
  const {chromium}=await import('playwright');
  t.mock.method(chromium,'launch',async()=>{throw Error('simulated browser startup failure');});
  await assert.rejects(launch(),/Cannot launch Chromium: simulated browser startup failure;.*npx playwright@1\.64\.1 install chromium/);
});
