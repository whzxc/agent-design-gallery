import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { check, render } from '../src/toolkit/commands.mjs';
import { compare, settle } from '../src/toolkit/compare.mjs';
import { main } from '../src/cli.mjs';
import { createOutput } from '../src/cli-output.mjs';

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-gates-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'design/components'), { recursive: true });
  await writeFile(path.join(root, 'adg.config.mjs'), 'export default {};');
  await writeFile(path.join(root, 'design/tokens.css'), starterTokens);
  return loadConfig(root);
}
const source = "import {Frame} from 'adg';export default()=> <Frame name='sample' width={96} height={96}><div/></Frame>;";
const put = (config, name, content) => writeFile(path.join(config.design, 'components', name), content);

// Unit boundary double: no browser process or raster suite is started here.
function browserDouble({ findings = [], evaluationFailure = false, disconnected = false, failCapture = -1 } = {}) {
  let pages = 0, closedPages = 0, closedBrowsers = 0;
  const browser = {
    isConnected: () => !disconnected,
    close: async () => { closedBrowsers++; },
    newPage: async () => {
      const index = pages++;
      const element = {
        boundingBox: async () => ({ x: 0, y: 0, width: 96, height: 96 }),
        screenshot: async ({ path: target }) => {
          if (index === failCapture) { await writeFile(target, 'partial'); throw Error('Screenshot failed'); }
          const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64');
          await writeFile(target, png); return png;
        },
      };
      return {
        context: () => ({ browser: () => browser }),
        emulateMedia: async () => {}, setViewportSize: async () => {}, setContent: async () => {},
        evaluate: async fn => {
          if (fn.name !== 'inspectFrame') return;
          if (evaluationFailure) throw Error('Evaluation failed');
          return findings;
        },
        locator: () => element,
        close: async () => { closedPages++; },
      };
    },
    counts: () => ({ pages, closedPages, closedBrowsers }),
  };
  return browser;
}

test('check rule failures are complete and build failures retain observed findings with exit 2', async t => {
  const config = await project(t);
  await put(config, 'a.tsx', source);
  const browser = browserDouble({ findings: [{code:'FRAME_OVERFLOW',message:'Content overflows the frame',line:null,column:null}] });
  const options = { launchBrowser: async () => browser };
  const run = () => check(config, [], {'read-only':true}, () => {}, () => {}, options);
  await assert.rejects(run(), error => {
    assert.equal(error.code, 'CHECK_FAILED'); assert.equal(error.data.complete, true);
    assert.deepEqual(error.data.summary, {sources:1,frames:1,evaluations:2,problems:2});
    assert.deepEqual(error.data.findings.map(finding => [finding.source,finding.frame,finding.theme,finding.code,finding.line,finding.column]), [
      ['design/components/a.tsx','sample','light','FRAME_OVERFLOW',null,null],
      ['design/components/a.tsx','sample','dark','FRAME_OVERFLOW',null,null],
    ]);
    return true;
  });
  await put(config, 'b.tsx', 'export default()=> <');
  await assert.rejects(run(), error => {
    assert.equal(error.code, 'SOURCE_BUILD_FAILED'); assert.equal(error.data.complete, false);
    assert.equal(error.data.summary.sources, 2); assert.equal(error.data.summary.evaluations, 2);
    assert.equal(error.data.findings.length, 2);
    let stdout = '', stderr = '';
    assert.equal(createOutput({json:true,command:'check',stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}}).failure(error), 2);
    assert.equal(JSON.parse(stdout).data.complete, false); assert.equal(stderr, '');
    return true;
  });
});

test('check evaluation errors distinguish connected render failure from browser failure', async t => {
  const config = await project(t); await put(config, 'a.tsx', source);
  for (const disconnected of [false, true]) {
    const browser = browserDouble({evaluationFailure:true,disconnected});
    await assert.rejects(check(config,[],{'read-only':true},()=>{},()=>{},{launchBrowser:async()=>browser}), error => {
      assert.equal(error.code, disconnected ? 'BROWSER_FAILED' : 'RENDER_FAILED');
      assert.equal(error.data.complete, false); assert.equal(error.data.summary.evaluations, 0);
      return true;
    });
    assert.equal(browser.counts().closedBrowsers, 1);
  }
});

test('render failures advertise only completed files and preserve source/theme order', async t => {
  const config = await project(t); await put(config, 'a.tsx', source);
  const browser = browserDouble({failCapture:1});
  await assert.rejects(render(config,[],{json:true},()=>{},{launchBrowser:async()=>browser}), asyncError => {
    assert.equal(asyncError.code, 'RENDER_FAILED'); assert.equal(asyncError.data.complete, false);
    assert.equal(asyncError.data.captures.length, 1);
    assert.equal(asyncError.data.captures[0].theme, 'light');
    assert.equal(asyncError.data.captures[0].source, 'design/components/a.tsx');
    assert.equal(asyncError.data.captures[0].pixelWidth, 1);
    return true;
  });
  assert.deepEqual(browser.counts(), {pages:2,closedPages:2,closedBrowsers:1});
  assert.equal(await readFile(path.join(config.output,'components/a/sample-dark.png'),'utf8'), 'partial');
});

test('empty gate selections succeed without launching a browser and CLI emits one document', async t => {
  const config = await project(t), noBrowser = {launchBrowser:async()=>assert.fail('empty selection launched a browser')};
  for (const result of [await check(config,[],{'read-only':true},()=>{},()=>{},noBrowser), await render(config,[],{},()=>{},noBrowser), await compare(config,[],{all:true},noBrowser)]) {
    assert.equal(result.data.complete, true);
    assert.ok(result.warnings.some(warning => warning.code === 'EMPTY_SELECTION'));
  }
  for (const command of ['check','render','compare']) {
    let stdout = '', stderr = '', exit;
    await main([command,...(command === 'compare' ? ['--all'] : []),'--json'],config.root,{stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;},exit:code=>{exit=code;}});
    const result = JSON.parse(stdout);
    assert.equal(result.command, command); assert.equal(result.ok,true); assert.equal(exit,0);
    assert.equal(result.warnings[0].code,'EMPTY_SELECTION');
    assert.equal(stdout.trimEnd().split('\n').length,1);
    assert.ok(!stdout.includes('Design check passed'));
  }
});

test('settling uses monotonic time and the timeout test waits no real five-second interval', async () => {
  let time = 0, reads = 0;
  const result = await settle(async () => ({box:{width:100,height:20},texts:[{text:'Moving',x:reads++,y:0,width:20,height:10}]}), {now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(result.settled,false); assert.equal(time,5000); assert.ok(reads>1);
});
