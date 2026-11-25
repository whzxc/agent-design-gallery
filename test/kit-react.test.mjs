import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSource } from '../src/toolkit/build.mjs';
import { createBuildStore } from '../src/toolkit/build-store.mjs';
import { check } from '../src/toolkit/commands.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { diff } from '../src/toolkit/diff.mjs';
import { escape } from '../src/toolkit/html.mjs';
import { unwrapAdgMarkers } from '../src/toolkit/kit/html-markers.mjs';
import { scanMotion } from '../src/toolkit/motion-inventory.mjs';
import { loadMotionPatterns } from '../src/toolkit/motion-patterns.mjs';
import { init, refreshTypes, starterTokens } from '../src/toolkit/project.mjs';
import { startServer } from '../src/server.mjs';

const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

function installSyntheticReact(root) {
  const reactIndex = `
export const Fragment = Symbol.for('react.fragment');
export function createElement(type, props, ...children) {
  const merged = props ? { ...props } : {};
  if (children.length === 1) merged.children = children[0];
  else if (children.length > 1) merged.children = children;
  return { $$mockReact: true, type, props: merged, key: merged.key ?? null };
}
export default { Fragment, createElement };
`;
  const jsxRuntime = `
import { Fragment } from './index.js';
export { Fragment };
export function jsx(type, props, key) {
  return { $$mockReact: true, type, props: props ?? {}, key: key ?? null };
}
export const jsxs = jsx;
export default { Fragment, jsx, jsxs };
`;
  const jsxDevRuntime = `
import { Fragment, jsx } from './jsx-runtime.js';
export { Fragment };
export function jsxDEV(type, props, key) {
  return jsx(type, props, key);
}
export default { Fragment, jsxDEV };
`;
  const reactDomServer = `
import { Fragment } from '../react/index.js';
const VOID = new Set(${JSON.stringify([...VOID_TAGS])});
const ESC = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function styleText(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())) + ':' + (typeof v === 'number' && !/^(opacity|zIndex|fontWeight|lineHeight|flex|flexGrow|flexShrink|order|gridColumn|gridRow|scale)$/.test(k) && !k.startsWith('--') ? v + 'px' : v))
    .join(';');
}
function renderNode(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(renderNode).join('');
  if (typeof node !== 'object') return ESC(node);
  if (node.type === Fragment) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props ?? {}));
  const props = node.props ?? {};
  let attrs = '';
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'dangerouslySetInnerHTML' || v == null || v === false) continue;
    if (/^on[A-Z]/.test(k)) continue;
    const name = k === 'className' ? 'class' : k;
    const val = name === 'style' && typeof v === 'object' ? styleText(v) : v === true ? '' : v;
    attrs += ' ' + name + '="' + ESC(val) + '"';
  }
  const tag = String(node.type);
  if (VOID.has(tag)) return '<' + tag + attrs + '/>';
  const inner = props.dangerouslySetInnerHTML ? String(props.dangerouslySetInnerHTML.__html ?? '') : renderNode(props.children);
  return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
}
export function renderToStaticMarkup(el) { return renderNode(el); }
export default { renderToStaticMarkup };
`;
  const mockKitPkg = `
import { createElement } from 'react';
export function MockPrimitive({ children, variant = 'default', ...rest }) {
  return createElement('div', { 'data-slot': 'mock-primitive', 'data-variant': variant, ...rest }, children);
}
`;
  writeFiles(root, {
    'package.json': JSON.stringify({ name: 'kit-test', private: true, type: 'module' }),
    'node_modules/react/package.json': JSON.stringify({
      name: 'react',
      type: 'module',
      exports: {
        '.': './index.js',
        './jsx-runtime': './jsx-runtime.js',
        './jsx-dev-runtime': './jsx-dev-runtime.js',
      },
    }),
    'node_modules/react/index.js': reactIndex,
    'node_modules/react/jsx-runtime.js': jsxRuntime,
    'node_modules/react/jsx-dev-runtime.js': jsxDevRuntime,
    'node_modules/react-dom/package.json': JSON.stringify({
      name: 'react-dom',
      type: 'module',
      exports: { './server': './server.js' },
    }),
    'node_modules/react-dom/server.js': reactDomServer,
    'node_modules/mock-kit/package.json': JSON.stringify({ name: 'mock-kit', type: 'module', exports: { '.': './index.js' } }),
    'node_modules/mock-kit/index.js': mockKitPkg,
  });
}

function kitTokens() {
  return starterTokens
    .replace('--text: #171717;', '--text: #171717;\n  --surface: #f5f5f5;\n  --border: #dedede;\n  --ring: #22c55e;\n  --primary: #16a34a;')
    .replace('--text: #ffffff;', '--text: #ffffff;\n  --surface: #1e1e1e;\n  --border: #2a2a2a;\n  --ring: #22f06a;\n  --primary: #22f06a;');
}

function createKitProject(t, { strictMotion = false, withView = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'adg-kit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  init({ root }, () => {});
  rmSync(path.join(root, 'design/components/example.tsx'));
  rmSync(path.join(root, 'design/modules/example.tsx'));
  rmSync(path.join(root, 'design/surfaces/example.tsx'));
  rmSync(path.join(root, 'design/fixtures/example.ts'));
  installSyntheticReact(root);
  writeFiles(root, {
    'adg.config.mjs': `export default {
  requires: '>=0.17.16',
  design: 'design',
  output: 'output/design',
  check: { strictLayers: true, lifecycle: false, strictMotion: ${strictMotion} },
  kit: {
    engine: 'react',
    paths: { '@/': 'frontend/' },
    roots: ['frontend/components/ui', 'frontend/views'],
    ui: ['frontend/components/ui'],
    packages: ['mock-kit'],
    css: ['frontend/styles/kit.css'],
    tokens: 'tailwind-kit',
  },
};
`,
    'design/tokens.css': kitTokens(),
    'frontend/styles/kit.css': `@import "tailwindcss";\n@theme inline {\n  --color-canvas: var(--canvas);\n  --color-text: var(--text);\n  --color-surface: var(--surface);\n  --color-border: var(--border);\n  --color-ring: var(--ring);\n  --color-primary: var(--primary);\n}\n@layer base { * { border-color: var(--border); } }\n`,
    'frontend/components/ui/button.tsx': `import { MockPrimitive } from 'mock-kit';
export function Button({ label, children, onClick }: { label?: string; children?: any; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-lg bg-surface px-3 text-sm text-text shadow-xs/5 before:shadow-[0_1px_--theme(--color-black/4%)] has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4 transition-shadow duration-200"
    >
      <MockPrimitive>{label}{children}</MockPrimitive>
      <input type="checkbox" aria-hidden="true" style={{ position: 'fixed', clip: 'rect(0, 0, 0, 0)' }} />
    </button>
  );
}
`,
    'frontend/components/ui/card.tsx': `export function Card({ title, children }: { title: string; children?: any }) {
  return (
    <section data-slot="card" className="flex flex-col gap-3 rounded-lg bg-surface p-4 text-text shadow-xs/5">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <div data-slot="card-body">{children}</div>
    </section>
  );
}
`,
    ...(withView ? {
      'frontend/views/OverviewView.tsx': `import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
export function OverviewView({ heading }: { heading: string }) {
  return (
    <Card title={heading}>
      <Button label="Sync" />
    </Card>
  );
}
`,
    } : {}),
  });
  return root;
}

test('Contract: kit config validation normalizes valid config, reserves vue, and rejects invalid paths/packages', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'adg-kit-cfg-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFiles(root, { 'adg.config.mjs': `export default { design: 'design' };\n` });
  return loadConfig(root).then(async plain => {
    assert.equal('kit' in plain, false);

    writeFiles(root, {
      'adg.config.mjs': `export default {
  kit: {
    engine: 'react',
    paths: { '@/': 'frontend/' },
    roots: ['frontend/views'],
    ui: 'frontend/components/ui',
    packages: ['lucide-react', '@base-ui/react'],
    css: 'frontend/styles/kit.css',
  },
};
`,
    });
    const cfg = await loadConfig(root);
    assert.deepEqual(cfg.kit, {
      engine: 'react',
      paths: { '@/': 'frontend/' },
      roots: ['frontend', 'frontend/components/ui', 'frontend/views'],
      ui: ['frontend/components/ui'],
      packages: ['@base-ui/react', 'lucide-react'],
      tokens: 'tailwind-kit',
      css: ['frontend/styles/kit.css'],
    });

    for (const [label, body, match] of [
      ['vue reserved', `export default { kit: { engine: 'vue' } };`, /reserved for a future ADG adapter/],
      ['unsupported engine', `export default { kit: { engine: 'svelte' } };`, /supported engine/],
      ['escaping paths', `export default { kit: { engine: 'react', paths: { '@/': '../outside' } } };`, /inside the project root/],
      ['node_modules target', `export default { kit: { engine: 'react', roots: ['node_modules/pkg'] } };`, /node_modules/],
      ['.git target', `export default { kit: { engine: 'react', ui: ['.git/hooks'] } };`, /\.git/],
      ['reserved adg alias', `export default { kit: { engine: 'react', paths: { adg: 'frontend' } } };`, /Invalid kit\.paths alias/],
      ['invalid package node:', `export default { kit: { engine: 'react', packages: ['node:fs'] } };`, /Invalid npm package/],
      ['invalid relative package', `export default { kit: { engine: 'react', packages: ['./local'] } };`, /Invalid npm package/],
      ['invalid tokens mode', `export default { kit: { engine: 'react', tokens: 'other' } };`, /kit\.tokens/],
      ['non-css file', `export default { kit: { engine: 'react', css: 'frontend/app.ts' } };`, /\.css/],
    ]) {
      writeFiles(root, { 'adg.config.mjs': body });
      await assert.rejects(() => loadConfig(root, { fresh: true }), err => err.code === 'CONFIG_INVALID' && match.test(err.message), label);
    }
  });
});

test('Contract: unwrapAdgMarkers merges owners/keys inside tables, fragments, void tags, and quoted > attributes', () => {
  const tableHtml = '<table><tbody><adg-owner data-o="{&quot;source&quot;:&quot;m.tsx&quot;,&quot;export&quot;:&quot;Row&quot;}"><adg-key data-k="{&quot;key&quot;:&quot;r1&quot;}"><tr title="a > b" data-adg-owners="[{&quot;source&quot;:&quot;c.tsx&quot;,&quot;export&quot;:&quot;Cell&quot;}]"><td><input type="text" data-x="1"><span>OK</span></td></tr></adg-key></adg-owner></tbody></table>';
  const unwrapped = unwrapAdgMarkers(tableHtml);
  assert.doesNotMatch(unwrapped, /<adg-owner|<adg-key/);
  assert.match(unwrapped, /<tbody><tr title="a > b"/);
  assert.match(unwrapped, /data-adg-owners="\[.*?c\.tsx.*?m\.tsx.*?\]"/);
  assert.match(unwrapped, /data-adg-keys="\[.*?r1.*?\]"/);
  assert.doesNotMatch(unwrapped, /<td[^>]*data-adg-owners/);

  const fragmentHtml = '<adg-owner data-o="{&quot;source&quot;:&quot;f.tsx&quot;,&quot;export&quot;:&quot;Frag&quot;}"><br><svg width="10"><path d="M0 0"/></svg><div>Tail</div></adg-owner>';
  const fragOut = unwrapAdgMarkers(fragmentHtml);
  assert.equal((fragOut.match(/data-adg-owners=/g) ?? []).length, 3);
  assert.doesNotMatch(fragOut, /<path[^>]*data-adg-owners/);
});

test('Contract: React kit SSR builds Level 2 views, compiles tailwind-kit & decoded classes, stamps kit boundaries, and enforces check rules', async t => {
  const root = createKitProject(t, { strictMotion: true });
  writeFiles(root, {
    'design/surfaces/overview.tsx': `import { Frame, Icon } from 'adg';
import { OverviewView } from '@/views/OverviewView';
export function OverviewBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-text">
      <Icon name="check" size={14} />
      {text}
    </span>
  );
}
export default () => (
  <Frame name="default" width={360} height={180}>
    <div className="flex flex-col gap-3 bg-canvas p-4">
      <OverviewBadge text="Ready" />
      <OverviewView heading="Gateway Overview" />
    </div>
  </Frame>
);
`,
  });

  const config = await loadConfig(root, { fresh: true });
  refreshTypes(config);
  const dts = readFileSync(path.join(config.design, '.adg/runtime.d.ts'), 'utf8');
  assert.doesNotMatch(dts, /interface IntrinsicElements/);
  assert.match(dts, /export function Frame/);

  const built = await buildSource(config, path.join(config.design, 'surfaces/overview.tsx'), { write: true });
  assert.equal(built.frames.length, 1);
  const html = built.frames[0].html;
  assert.doesNotMatch(html, /onclick=/i);
  assert.match(html, /data-adg-icon="check"/);
  assert.match(html, /OverviewBadge/);
  assert.match(html, /<button[^>]*data-adg-kit=""/);
  assert.match(html, /<div data-slot="mock-primitive"[^>]*data-adg-kit=""/);
  assert.match(html, /<section data-slot="card"[^>]*data-adg-kit=""/);
  assert.doesNotMatch(html, /<div class="flex flex-col gap-3 bg-canvas p-4"[^>]*data-adg-kit/);

  // Compiled CSS preserves tailwind-kit @theme inline & decoded entity selectors & kit.css @layer base
  assert.match(built.css, /border-color:\s*var\(--border\)/);
  assert.match(built.css, /rounded-lg/);
  assert.match(built.css, /shadow-xs\\\/5/);
  assert.match(built.css, /\[&_svg:not\(\[class\*='size-'\]\)\]:size-4|size-4/);
  assert.match(built.css, /:has\(\s*>\s*svg\)/);

  // Valid kit frame passes adg check cleanly (including shadow-xs/5, kit.ui inline style & transition-shadow)
  const checkRes = await check(config, ['surfaces/overview.tsx'], { 'read-only': true }, () => {}, () => {});
  assert.equal(checkRes.data.complete, true);
  assert.equal(checkRes.data.findings.length, 0);

  // Motion inventory skips unmapped kit.ui while still detecting unmapped motion in frontend/views/
  const invClean = scanMotion(config, loadMotionPatterns(config));
  assert.equal(invClean.issues.filter(i => i.source.startsWith('frontend/components/ui/')).length, 0);

  writeFiles(root, {
    'frontend/views/OverviewView.tsx': `import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
export function OverviewView({ heading }: { heading: string }) {
  return (
    <Card title={heading}>
      <div style={{ padding: 4 }} className="bg-[#ff0101] transition-all">Bad child</div>
      <Button label="Sync" />
    </Card>
  );
}
`,
  });
  const invDirty = scanMotion(config, loadMotionPatterns(config));
  assert.ok(invDirty.issues.some(i => i.source === 'frontend/views/OverviewView.tsx' && i.code === 'MOTION_UNMAPPED'));

  const checkProblems = [];
  await assert.rejects(
    check(config, ['surfaces/overview.tsx'], { 'read-only': true }, () => {}, msg => checkProblems.push(msg)),
    err => err.code === 'CHECK_FAILED'
  );
  const joined = checkProblems.join('\n');
  assert.match(joined, /Style padding outside data-free/);
  assert.match(joined, /Color rgb\(255, 1, 1\) matches no token/);
  assert.match(joined, /Declare the motion on a frame edge/);

  // KIT_THEME_UNMAPPED fails when kit.css omits a color token mapping and passes via local @import
  writeFiles(root, {
    'frontend/views/OverviewView.tsx': `import { Button } from '@/components/ui/button';\nimport { Card } from '@/components/ui/card';\nexport function OverviewView({ heading }: { heading: string }) { return <Card title={heading}><Button label="Sync" /></Card>; }\n`,
    'frontend/styles/kit.css': `@import "tailwindcss";\n@theme inline { --color-canvas: var(--canvas); --color-text: var(--text); }\n`,
  });
  await assert.rejects(
    check(config, ['surfaces/overview.tsx'], { 'read-only': true }, () => {}, () => {}),
    err => err.code === 'CHECK_FAILED' && err.data.findings.some(f => f.code === 'KIT_THEME_UNMAPPED' && f.message.includes('--color-primary'))
  );
  writeFiles(root, {
    'frontend/styles/theme-map.css': `@theme inline {\n  --color-canvas: var(--canvas);\n  --color-text: var(--text);\n  --color-surface: var(--surface);\n  --color-border: var(--border);\n  --color-ring: var(--ring);\n  --color-primary: var(--primary);\n}\n`,
    'frontend/styles/kit.css': `@import "tailwindcss";\n`,
  });
  const splitConfig = { ...config, kit: { ...config.kit, css: ['frontend/styles/theme-map.css', 'frontend/styles/kit.css'] } };
  const mappedRes = await check(splitConfig, ['surfaces/overview.tsx'], { 'read-only': true }, () => {}, () => {});
  assert.equal(mappedRes.data.findings.length, 0);
  writeFiles(root, {
    'frontend/styles/kit.css': `.btn { border-color: var(--border); }\n`,
  });
  const plainCssRes = await check(config, ['surfaces/overview.tsx'], { 'read-only': true }, () => {}, () => {});
  assert.equal(plainCssRes.data.findings.length, 0);

  // Unlisted npm package & escaping root imports are rejected
  writeFiles(root, {
    'outside-secret.ts': `export const secret = 1;\n`,
    'design/surfaces/bad-pkg.tsx': `import { Frame } from 'adg'; import x from 'unlisted-pkg'; export default () => <Frame name="a"><div>{String(x)}</div></Frame>;\n`,
    'design/surfaces/bad-path.tsx': `import { Frame } from 'adg'; import { secret } from '../../outside-secret'; export default () => <Frame name="a"><div>{secret}</div></Frame>;\n`,
  });
  await assert.rejects(buildSource(config, path.join(config.design, 'surfaces/bad-pkg.tsx')), /Package unlisted-pkg is not allowed/);
  await assert.rejects(buildSource(config, path.join(config.design, 'surfaces/bad-path.tsx')), /leaves design\/ and configured kit roots/);
});

test('Recurring: build-store, server watcher, and adg diff track & invalidate kit views and styles', async t => {
  const root = createKitProject(t);
  writeFiles(root, {
    'design/surfaces/home.tsx': `import { Frame } from 'adg';
import { OverviewView } from '@/views/OverviewView';
export default () => (
  <Frame name="default" width={320} height={140}>
    <div className="bg-canvas p-4">
      <OverviewView heading="Initial Heading" />
    </div>
  </Frame>
);
`,
  });

  const config = await loadConfig(root, { fresh: true });
  const store = await createBuildStore({ config: { ...config, sourceFiles: ['surfaces/home.tsx'] }, cacheDirectory: path.join(root, 'cache/build') });
  t.after(() => store.close());

  const first = await store.get('surfaces/home.tsx');
  assert.match(first.frames[0].html, /Initial Heading/);
  assert.ok(first.dependencies.includes('../frontend/views/OverviewView.tsx'));
  assert.ok(first.dependencies.includes('../frontend/styles/kit.css'));
  assert.equal((await store.get('surfaces/home.tsx')).hash, first.hash);

  writeFiles(root, {
    'frontend/views/OverviewView.tsx': `import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
export function OverviewView({ heading }: { heading: string }) {
  return (
    <Card title={heading + ' Updated'}>
      <Button label="Deploy" />
    </Card>
  );
}
`,
  });
  assert.deepEqual(store.invalidate(['../frontend/views/OverviewView.tsx']), ['surfaces/home.tsx']);
  const second = await store.get('surfaces/home.tsx');
  assert.notEqual(second.hash, first.hash);
  assert.match(second.frames[0].html, /Initial Heading Updated/);
  assert.match(second.frames[0].html, /Deploy/);

  // Live server kit watcher invalidates and serves updated frames when a kit view changes
  const server = await startServer({ directory: path.join(root, 'design'), stateDirectory: path.join(root, 'state'), port: 0 });
  t.after(() => server.close());
  const beforeAsset = await fetch(`${server.url}asset/surfaces/home.tsx`).then(r => r.json());
  assert.match(beforeAsset.frames[0].html, /Deploy/);

  writeFiles(root, {
    'frontend/views/OverviewView.tsx': `import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
export function OverviewView({ heading }: { heading: string }) {
  return (
    <Card title={heading + ' Live'}>
      <Button label="Apply" />
    </Card>
  );
}
`,
  });

  let afterAsset = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 100));
    const current = await fetch(`${server.url}asset/surfaces/home.tsx`).then(r => r.json());
    if (!current.error && current.hash && current.hash !== beforeAsset.hash && Array.isArray(current.frames)) {
      afterAsset = current;
      break;
    }
  }
  assert.ok(afterAsset, 'expected live server to invalidate kit view edit');
  assert.match(afterAsset.frames[0].html, /Initial Heading Live/);
  assert.match(afterAsset.frames[0].html, /Apply/);

  // adg diff --base=HEAD builds both revisions across kit component edits
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', 'adg.config.mjs', 'package.json', 'design', 'frontend'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'init kit baseline'], { cwd: root });

  writeFiles(root, {
    'frontend/components/ui/button.tsx': `import { MockPrimitive } from 'mock-kit';
export function Button({ label, children }: { label?: string; children?: any }) {
  return (
    <button type="button" className="inline-flex h-10 items-center rounded-lg bg-primary px-6 text-sm text-canvas">
      <MockPrimitive>{label}{children}</MockPrimitive>
    </button>
  );
}
`,
  });

  await assert.rejects(
    diff(config, ['surfaces/home.tsx'], { base: 'HEAD', theme: 'light' }, () => {}),
    err => err.code === 'DIFF_FAILED'
  );
  const report = JSON.parse(readFileSync(path.join(config.output, 'diff/report.json'), 'utf8'));
  assert.equal(report.verdict, 'changed');
  assert.equal(report.comparisons[0].source, 'design/surfaces/home.tsx');
  assert.equal(report.comparisons[0].status, 'matched');
  assert.equal(report.comparisons[0].verdict, 'changed');
  assert.equal(report.comparisons[0].change.kind, 'inherited');
  assert.ok(report.comparisons[0].change.causes.includes('frontend/components/ui/button.tsx'));
});
