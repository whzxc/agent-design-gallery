import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tokenBoard } from '../src/boards/token-board.mjs';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const source = 'design/tokens.css';
const css = `:root {
  --font-ui: sans-serif;
  --font-mono: monospace;
  /* Surfaces */
  --canvas: #fafafa;
  --surface: #ffffff;
  /* Text and actions */
  --text: #111111;
  --accent: var(--text);
  --text-body: 14px;
  --line-body: 20px;
  --weight-body: 600;
  --radius-card: 12px;
  --shadow-card: 0 2px 8px #0002;
  --control-height: 32px;
  --ease-enter: cubic-bezier(.2,0,0,1);
  --motion-fast: 120ms;
  --motion-slow: .3s;
}
:root[data-theme="dark"] {
  /* This heading must not rename the light groups. */
  --canvas: #141414;
  --surface: #202020;
  --text: #efefef;
}`;

test('every token section groups by root headings, with prefix fallbacks and repeated headings merged', () => {
  const styles = `:root {
  --font-ui: sans-serif;
  --font-mono: monospace;
  --canvas: #fff;
  --text: #111;
  --radius-plain: 0px;
  --shadow-plain: none;
  --gap-plain: 8px;
  --ease-plain: linear;
  --motion-plain: 100ms;
  /* Compact & calm */
  --accent-compact: #123;
  --text-compact: 12px;
  --line-compact: 16px;
  --weight-compact: 400;
  --font-compact: sans-serif;
  --tracking-compact: 0px;
  --radius-compact: 4px;
  --shadow-compact: 0 1px 2px #0002;
  --gap-compact: 16px;
  --motion-compact: 120ms;
  --ease-compact: ease;
  /* Spacious */
  --accent-spacious: #456;
  --text-spacious: 20px;
  --font-spacious: serif;
  --tracking-spacious: 1px;
  --radius-spacious: 12px;
  --shadow-spacious: 0 2px 8px #0002;
  --gap-spacious: 32px;
  --ease-spacious: ease-out;
  --motion-spacious: 240ms;
  /* Compact & calm */
  --gap-compact-end: 24px;
}
:root[data-theme="dark"] {
  /* Dark-only heading */
  --canvas: #111;
}`;
  const board = tokenBoard(source, styles);
  const headings = {
    colour: ['canvas', 'text', 'Compact &amp; calm', 'Spacious'],
    type: ['font', 'Compact &amp; calm', 'Spacious'],
    shape: ['radius', 'Compact &amp; calm', 'Spacious'],
    elevation: ['shadow', 'Compact &amp; calm', 'Spacious'],
    sizing: ['gap', 'Compact &amp; calm', 'Spacious'],
    motion: ['ease', 'motion', 'Compact &amp; calm', 'Spacious'],
  };
  for (const [section, expected] of Object.entries(headings)) {
    const content = board.body.split(`data-adg-section="${source}#${section}"`)[1].split('</section>')[0];
    assert.deepEqual([...content.matchAll(/<h3>([^<]*)/g)].map(match => match[1]), expected, section);
  }
  assert.doesNotMatch(board.body, /Dark-only heading/);
  assert.match(board.body, /font-size:var\(--text-compact\);line-height:var\(--line-compact\);font-weight:var\(--weight-compact\)/);
});

test('token and all manifests expose reusable board data and retain token rows across saves', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-token-board-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tokenFile = path.join(directory, 'tokens.css');
  await writeFile(tokenFile, css);
  const diagnostics = [];
  const server = await startServer({ directory, stateDirectory: path.join(directory, 'state'), onDiagnostic: error => diagnostics.push(error) });
  t.after(() => server.close());
  const manifest = async scope => {
    const response = await fetch(new URL(`manifest?scope=${scope}`, server.url));
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const scope of ['tokens', 'all']) {
    const data = await manifest(scope);
    assert.equal(data.scope, scope);
    assert.equal(data.tokenBoard.source, data.tokenSource);
    assert.deepEqual(data.tokens.find(([name]) => name === '--text'), ['--text', '#111111', '#efefef']);
    assert.deepEqual(data.assets, []);
  }
  await writeFile(tokenFile, css.replace('--surface: #ffffff;', '--surface: #fefefe;'));
  assert.match((await manifest('tokens')).tokenBoard.body, /Light: #fefefe/);
  await writeFile(tokenFile, ':root {}');
  const invalid = await manifest('tokens');
  assert.equal(typeof invalid.tokenError, 'string');
  assert.equal(invalid.tokenBoard, undefined);
  assert.ok(diagnostics.length > 0);
});

test('contract: Motion board cards keep their height and disclose details in both themes', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-motion-cards-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const design = path.join(root, 'design');
  await mkdir(design);
  await writeFile(path.join(root, 'adg.config.mjs'), 'export default {}');
  await writeFile(path.join(design, 'tokens.css'), css.replace('  --canvas: #141414;', '  --canvas: #141414;\n  --motion-fast: 150ms;'));
  await writeFile(path.join(root, 'motion.css'), '@keyframes appear { from {opacity:0} }\n@keyframes spin { to {transform:rotate(1turn)} }');
  await writeFile(path.join(design, 'motion-patterns.json'), JSON.stringify({
    version: 1,
    roles: {'duration-base':'--motion-fast','easing-enter':'--ease-enter'},
    patterns: {
      appear: {extends:'fade', parameters:{fromOpacity:.2}, consumers:[{file:'motion.css', match:'keyframes:appear'}]},
      spinner: {kind:'ambient', action:'loop', effect:'spin', properties:['transform'],
        parameters:{duration:'--motion-slow', easing:'--ease-enter'}, interrupt:'cancel', reduced:'static',
        consumers:[{file:'motion.css', match:'keyframes:spin'}]},
    },
  }));
  const server = await startServer({directory: design, stateDirectory: path.join(root, 'state'), readOnly:true});
  t.after(() => server.close());
  const browser = await launch();
  try {
    for (const [colorScheme, time, background] of [['light', 120, 'rgb(255, 255, 255)'], ['dark', 150, 'rgb(32, 32, 32)']]) {
      const page = await browser.newPage({viewport:{width:1440,height:900}, colorScheme, reducedMotion:'no-preference'});
      await page.goto(new URL('?scope=tokens&section=motion', server.url).href);
      const cards = page.locator('[data-motion-patterns] > [data-motion-pattern]:visible');
      const fade = cards.filter({has:page.getByRole('button',{name:'Fade',exact:true})});
      const toggle = fade.getByRole('button',{name:'Fade',exact:true});
      await toggle.waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), colorScheme);
      assert.equal(await cards.count(), 2);
      assert.deepEqual(await cards.evaluateAll(nodes => [...new Set(nodes.map(node => node.offsetHeight))]), [192]);
      assert.equal(await fade.evaluate(node => getComputedStyle(node).backgroundColor), background);
      assert.match(await fade.innerText(), new RegExp(time + ' ms · ease-enter'));
      assert.match(await fade.innerText(), /Used in 1 place\s+1 variant/);
      assert.equal(await page.locator('[data-motion-detail]').count(), 0);
      const unused = page.locator('[data-motion-unadopted]');
      assert.equal(await unused.evaluate(node => node.open), false);
      assert.equal(await unused.locator('[data-motion-pattern]:visible').count(), 0);
      const disclosure = unused.locator('summary');
      await disclosure.click();
      assert.deepEqual(await cards.evaluateAll(nodes => [...new Set(nodes.map(node => node.offsetHeight))]), [192]);
      assert.ok(await unused.locator('[data-motion-pattern]:visible').count() > 0);
      await disclosure.press('Enter');
      assert.equal(await unused.evaluate(node => node.open), false);

      const specimen = fade.locator('[data-motion-stage]');
      await specimen.click();
      const details = page.getByRole('region', {name:'Fade',exact:true});
      await details.waitFor();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await details.evaluate(node => node.offsetWidth), await fade.evaluate(node => node.parentElement.clientWidth));
      assert.ok(await details.locator('[data-motion-stage]').evaluate(node => node.offsetHeight) > await specimen.evaluate(node => node.offsetHeight));
      await toggle.click();
      assert.equal(await details.count(), 0);

      await toggle.press('Enter');
      await details.waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await details.count(), 0);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.evaluate(node => node === document.activeElement), true);

      await toggle.press('Enter');
      await details.getByRole('link',{name:'Open detail view'}).click();
      assert.equal(new URL(page.url()).searchParams.get('pattern'), 'fade');
      const dialog = page.getByRole('dialog',{name:'Fade',exact:true});
      await dialog.waitFor();
      const shape = dialog.locator('[data-motion-shape]');
      await page.waitForFunction(() => document.querySelector('[data-motion-page] [data-motion-shape]').getAnimations().length > 0);
      const animation = await shape.evaluateHandle(node => node.getAnimations()[0]);
      await dialog.getByRole('button',{name:'Replay'}).click();
      assert.equal(await animation.evaluate(previous => previous.playState), 'idle');
      await animation.dispose();
      await dialog.getByRole('button',{name:'Appear · Used in 1 place'}).click();
      await page.getByRole('dialog',{name:'Appear consumers'}).getByRole('link',{name:'motion.css:1'}).click();
      await page.getByRole('dialog',{name:'motion.css:1'}).locator('mark').filter({hasText:'@keyframes appear'}).waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), true);
      await page.goto(new URL('?pattern=fade', server.url).href);
      await dialog.waitFor();
      await dialog.getByRole('button',{name:'Close Fade details'}).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('pattern'));
      await dialog.waitFor({state:'detached'});
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
