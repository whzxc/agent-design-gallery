import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSource } from '../src/toolkit/build.mjs';
import { starterTokens, listSources } from '../src/toolkit/project.mjs';
import { sourceRelationships } from '../public/relationships.js';
import { startServer } from '../src/server.mjs';

function project(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdg-relationships-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = { root, design: path.join(root, 'design'), sources: ['components', 'modules', 'surfaces'] };
  put(config, 'tokens.css', starterTokens);
  return config;
}
function put(config, name, text) {
  const file = path.join(config.design, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}
const source = (imports = '', expression = '"Example"') => `${imports}
  import { Frame } from 'sdg';
  export const label = 'Example';
  export default () => <Frame name="default"><div>{${expression}}</div></Frame>;`;
async function graph(config) {
  const assets = await Promise.all(listSources(config.design, config.sources).map(async file => ({
    path: path.relative(config.design, file).split(path.sep).join('/'),
    imports: (await buildSource(config, file, { write: false })).imports,
  })));
  return sourceRelationships(assets);
}

test('relationships resolve relative imports, explicit extensions, duplicates and direct edges only', async t => {
  const c = project(t);
  put(c, 'components/alert.tsx', source());
  put(c, 'modules/composer.tsx', source("import {label as alert} from '../components/alert';", 'alert'));
  put(c, 'surfaces/home.tsx', source(`import {label as a} from '../modules/../modules/composer';
    import {label as b} from '../modules/composer.tsx';`, 'a + b'));
  const result = await graph(c);
  assert.deepEqual(result, {
    'components/alert.tsx': { uses: [], usedBy: ['modules/composer.tsx'] },
    'modules/composer.tsx': { uses: ['components/alert.tsx'], usedBy: ['surfaces/home.tsx'] },
    'surfaces/home.tsx': { uses: ['modules/composer.tsx'], usedBy: [] },
  });
  assert.equal(existsSync(path.join(c.design, '.sdg')), false, 'read-only builds do not write generated types');
});

test('relationships reuse extension and directory index resolution, including re-exports', async t => {
  const c = project(t);
  put(c, 'components/index.tsx', source());
  put(c, 'modules/index.tsx', source("export {label as componentLabel} from '../components';"));
  put(c, 'surfaces/home.tsx', source("import {componentLabel} from '../modules/index';", 'componentLabel'));
  const result = await graph(c);
  assert.deepEqual(result['modules/index.tsx'].uses, ['components/index.tsx']);
  assert.deepEqual(result['surfaces/home.tsx'].uses, ['modules/index.tsx']);
});

test('relationships ignore runtime packages, fixtures, artwork, tokens and non-source helper imports', async t => {
  const c = project(t);
  put(c, 'components/alert.tsx', source());
  put(c, 'fixtures/data.tsx', "import {label} from '../components/alert'; export const data = label;");
  put(c, 'components/nested/index.tsx', 'export const nested = "nested";');
  put(c, 'components/helper.ts', 'export const helper = "helper";');
  put(c, 'tokens.ts', 'export const token = "token";');
  put(c, 'art/mark.svg', '<svg width="12" height="12"></svg>');
  put(c, 'surfaces/home.tsx', source(`import {data} from '../fixtures/data';
    import {nested} from '../components/nested'; import {helper} from '../components/helper';
    import {token} from '../tokens'; import Art from '../art/mark.svg';`, '[data, nested, helper, token, <Art/>]'));
  assert.deepEqual(await graph(c), {
    'components/alert.tsx': { uses: [], usedBy: [] },
    'surfaces/home.tsx': { uses: [], usedBy: [] },
  });
});

test('relationships keep cycles finite and only include configured source directories', async t => {
  const c = project(t);
  put(c, 'modules/a.tsx', source("import {label as b} from './b'; export const next = () => b;"));
  put(c, 'modules/b.tsx', source("import {label as a} from './a'; export const next = () => a;"));
  put(c, 'surfaces/home.tsx', source("import {label as a} from '../modules/a';", 'a'));
  const result = await graph(c);
  assert.deepEqual(result['modules/a.tsx'], { uses: ['modules/b.tsx'], usedBy: ['modules/b.tsx', 'surfaces/home.tsx'] });
  assert.deepEqual(result['modules/b.tsx'], { uses: ['modules/a.tsx'], usedBy: ['modules/a.tsx'] });
  c.sources = ['components', 'surfaces'];
  assert.deepEqual(await graph(c), { 'surfaces/home.tsx': { uses: [], usedBy: [] } });
});

test('graph endpoint refreshes both directions after import edits, source additions and removals', { timeout: 15000 }, async t => {
  const c = project(t);
  writeFileSync(path.join(c.root, 'sdg.config.mjs'), `export default { sources: ${JSON.stringify(c.sources)} };`);
  put(c, 'components/alert.tsx', source());
  put(c, 'modules/home.tsx', source());
  const surface = put(c, 'surfaces/home.tsx', source("import {label as imported} from '../modules/home';", 'imported'));
  const server = await startServer({directory:c.design, stateDirectory:path.join(c.root, 'state')});
  const controller = new AbortController();
  try {
    const events = await fetch(new URL('/events', server.url), {signal:controller.signal});
    const reader = events.body.getReader();
    await reader.read(); // Initial revision, before any edits.
    const readGraph = async () => {
      const response = await fetch(new URL('/relationships', server.url));
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.deepEqual((await readGraph())['modules/home.tsx'].usedBy, ['surfaces/home.tsx']);
    writeFileSync(surface, source("import {label as imported} from '../components/alert';", 'imported'));
    await reader.read();
    let updated = await readGraph();
    assert.deepEqual(updated['surfaces/home.tsx'].uses, ['components/alert.tsx']);
    assert.deepEqual(updated['modules/home.tsx'].usedBy, []);
    assert.deepEqual(updated['components/alert.tsx'].usedBy, ['surfaces/home.tsx']);
    const added = put(c, 'modules/new.tsx', source("import {label as imported} from '../components/alert';", 'imported'));
    await reader.read();
    updated = await readGraph();
    assert.deepEqual(updated['components/alert.tsx'].usedBy, ['modules/new.tsx', 'surfaces/home.tsx']);
    unlinkSync(added);
    await reader.read();
    updated = await readGraph();
    assert.equal(updated['modules/new.tsx'], undefined);
    assert.deepEqual(updated['components/alert.tsx'].usedBy, ['surfaces/home.tsx']);
    await reader.cancel();
  } finally { controller.abort(); await server.close(); }
});
