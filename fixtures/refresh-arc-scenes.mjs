// Run from the SDG root after replacing arc-sample/design and updating its gallery.
// Reads only the local fixture. Canvas data and chrome placement are the only captured geometry.
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { states, recent, assetModifiedAt } from './viewer.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'sdg-refresh-'));
await mkdir(path.join(temporary, 'empty'));
const server = await startServer({ directory: path.join(root, 'fixtures/arc-sample/design'), stateDirectory: temporary,
  fixtures: { states, recent, assetModifiedAt, paths: { '~/projects/empty': path.join(temporary, 'empty') } } });
const browser = await launch();
const art = path.join(root, 'design/art/arc-previews');
const navigationFile = path.join(root, 'design/fixtures/navigation.json');
const navigation = JSON.parse(await readFile(navigationFile, 'utf8'));
try {
  const catalog = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await catalog.goto(new URL('/manifest', server.url).href);
  const reference = await catalog.evaluate(async () => {
    const { prepare, arrange } = await import('/assets.js');
    const manifest = await (await fetch('/manifest')).json();
    window.snapshot = {};
    for (const theme of ['light', 'dark']) {
      const assets = [];
      for (const asset of manifest.assets) assets.push(await prepare(asset, theme));
      window.snapshot[theme] = arrange({ ...manifest, assets });
    }
    const { groups, items, world } = window.snapshot.light;
    return { sections: groups.map(({ title, x, y, w, h, blocks }) => ({ title, x, y, w, h, blocks })),
      sources: groups.flatMap(g => g.assets.map(({ path, name, component, parts }) => ({ path, name, component, parts }))),
      items: items.map(({ id, path, x, y, width, height, group }) => ({ id, path, x, y, width, height, group })), world };
  });
  await writeFile(path.join(root, 'fixtures/arc-sample.layout.json'), JSON.stringify({ sections: reference.sections, sources: reference.sources }, null, 2) + '\n');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId:'UTC' });
  const previews = new Map(), scenesBySource = new Map();
  for (const [entry, source] of [
    ['surfaces/canvas', 'canvas'], ['surfaces/inspector', 'inspector'],
    ['surfaces/open-directory', 'open-directory'], ['modules/menus', 'menus'],
    ['modules/shortcuts', 'shortcuts'], ['modules/navigation', 'navigation'], ['modules/view-controls', 'view-controls'],
  ]) {
    const file = path.join(root, `design/${entry}.tsx`);
    let text = await readFile(file, 'utf8');
    const match = text.match(/const frames = (\[[\s\S]*?\n\]) as const;/);
    const frames = JSON.parse(match[1]), scenes = {};
    for (const frame of frames) {
      const state = states[frame.fixture];
      await page.emulateMedia({ colorScheme: state.theme, reducedMotion: 'reduce' });
      await page.goto(new URL(`/?fixture=${frame.fixture}`, server.url).href);
      await page.waitForFunction(name => document.documentElement.dataset.fixtureError || document.documentElement.dataset.fixtureReady === name, frame.fixture, { timeout: 120000 });
      const snapshot = await page.evaluate(() => {
        if (document.documentElement.dataset.fixtureError) throw Error(document.documentElement.dataset.fixtureError);
        const zoom = document.querySelector('.zoom').getBoundingClientRect();
        return { view: window.__sdg.view, zoom: [zoom.x, zoom.y], labels: [...document.querySelectorAll('.canvas-label:not([hidden])')].flatMap(el => [...el.children].flatMap(span => {
          const b = span.getBoundingClientRect(), s = getComputedStyle(span);
          const role = s.fontSize === '14px' ? 'section' : s.fontSize === '11px' ? (s.fontWeight === '550' ? 'selected-frame' : 'form') : s.fontWeight === '400' ? 'count' : s.fontWeight === '600' ? 'flow' : s.color === getComputedStyle(document.body).color ? 'selected-set' : 'set';
          const labels = [[b.x, b.y + b.height / 2, role, span.textContent]];
          const glyph = span.querySelector('.label-copy-icon:not([hidden])');
          if (glyph) {const box=glyph.getBoundingClientRect();labels.push([box.x,box.y+box.height/2,'copy',''])}
          return labels;
        })) };
      });
      if (state.dialog && !state.empty && !frame.chrome.some(c => c.kind === 'scrim')) frame.chrome.unshift({kind: 'scrim'});
      const selected = reference.sources.find(a => a.path === state.asset);
      for (const chrome of frame.chrome) {
        const sidebar = chrome.kind === 'sidebar' ? navigation[chrome.navigation] : null;
        if (sidebar && !sidebar.search) {
          sidebar.rows = [{ form: 'root', label: 'All designs', meta: String(reference.sources.length), icon: 'layout-grid' }];
          for (const section of reference.sections) {
            sidebar.rows.push({ form: 'group', label: section.title, meta: String(section.blocks.length), icon: state.group === section.title ? 'chevron-down' : 'chevron-right' });
            if (state.group === section.title) for (const block of section.blocks) sidebar.rows.push({ form: block.asset === state.asset ? 'item-selected' : 'item', label: path.basename(block.asset, '.tsx'), icon: block.kind === 'set' ? 'component' : 'app-window' });
          }
        }
        if (chrome.kind === 'inspector') {
          chrome.path = selected.path;
          chrome.rows = selected.parts.map((part, index) => ({ form: (state.form ? part.name === state.form : index === 0) ? 'item-selected' : 'item', label: part.name, meta: `${Math.round(part.width)} × ${Math.round(part.height)}`, icon: selected.component ? 'component' : 'app-window', ...(part.note ? { note: part.note } : {}) }));
        }
        if (chrome.kind === 'zoom') {
          const [ox, oy] = frame.capture.origin.split(' ').map(Number);
          chrome.left = Math.round(snapshot.zoom[0] - ox); chrome.top = Math.round(snapshot.zoom[1] - oy);
          chrome.label = `${Math.round(snapshot.view.scale * 100)}%`;
        }
        if (chrome.kind === 'minimap') {
          const { width, height } = reference.world, s = Math.min(168 / width, 100 / height), x = (200 - width * s) / 2, y = (132 - height * s) / 2;
          chrome.boxes = reference.sections.map(g => [x + g.x * s, y + g.y * s, g.w * s, g.h * s]);
          const v = snapshot.view;
          chrome.viewport = [x + (292 - v.x) / v.scale * s, y + (100 - v.y) / v.scale * s, 1124 / v.scale * s, 716 / v.scale * s];
        }
      }
      const [ox, oy] = frame.capture.origin.split(' ').map(Number), v = snapshot.view;
      const at = (x, y) => [v.x + x * v.scale - ox, v.y + y * v.scale - oy];
      const visible = (x, y, w, h) => x < frame.width && x + w > 0 && y < frame.height && y + h > 0;
      const nodes = [];
      if (!state.empty) {
        for (const section of reference.sections) {
          const [x, y] = at(section.x, section.y), size = [section.w * v.scale, section.h * v.scale];
          if (visible(x, y, ...size)) nodes.push({ at: [x, y], size, kind: 'section' });
        }
        for (const item of reference.items) {
          const [x, y] = at(item.x, item.y), size = [item.width * v.scale, item.height * v.scale];
          if (!visible(x, y, ...size)) continue;
          const name = item.id.replace(/\.tsx/, '').replaceAll('/', '-').replace('#', '-');
          const previous = previews.get(name);
          previews.set(name, { item, scale: Math.max(previous?.scale ?? 0, v.scale * 2) });
          const selectedPart = selected?.parts.find(p => p.name === state.form);
          nodes.push({ at: [x, y], size, kind: 'asset', selected: item.path === state.asset && (selected.component || !selectedPart || item.id === `${item.path}#${selectedPart.id}`),
            preview: { crop: `0 0 ${item.width} ${item.height}`, size: [item.width, item.height], light: `@${name}-light`, dark: `@${name}-dark` } });
        }
        nodes.push({ at: [0, 0], size: [0, 0], kind: 'asset', outline: false, labels: snapshot.labels.map(([x, y, role, label]) => [x - ox, y - oy, role, label]) });
      }
      scenes[frame.name] = nodes;
      console.log(`${source}/${frame.name}: ${snapshot.view.scale.toFixed(4)}, ${nodes.length} canvas nodes`);
    }
    text = text.replace(match[0], `const frames = ${JSON.stringify(frames, null, 2)} as const;`);
    await writeFile(file, text);
    scenesBySource.set(source, scenes);
  }
  await writeFile(navigationFile, JSON.stringify(navigation, null, 2) + '\n');
  await rm(art, { recursive: true, force: true }); await mkdir(art, { recursive: true });
  for (const [name, { item, scale }] of previews) for (const theme of ['light', 'dark']) {
    const png = await catalog.evaluate(async ({ id, scale, theme }) => {
      const { imageURL } = await import('/assets.js');
      const item = window.snapshot[theme].items.find(a => a.id === id), part = item.shown[0];
      const url = imageURL(item, part), xml = await (await fetch(url)).text(); URL.revokeObjectURL(url);
      const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); await image.decode();
      const limit = Math.min(scale, 4096 / Math.max(part.width, part.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.ceil(part.width * limit)); canvas.height = Math.max(1, Math.ceil(part.height * limit));
      const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = item.background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL().split(',')[1];
    }, { id: item.id, scale, theme });
    await writeFile(path.join(art, `${name}-${theme}.png`), Buffer.from(png, 'base64'));
  }
  for (const [source, scenes] of scenesBySource) {
    const json = JSON.stringify(scenes, null, 2), names = [...new Set([...json.matchAll(/"@([^"]+)"/g)].map(m => m[1]))].sort();
    const imports = names.map((name, i) => `import image${i} from '../art/arc-previews/${name}.png';`).join('\n');
    const body = json.replace(/"@([^"]+)"/g, (_, name) => `image${names.indexOf(name)}`);
    await writeFile(path.join(root, `design/scenes/${source}.ts`), `// Generated from fixtures/arc-sample.layout.json by fixtures/refresh-arc-scenes.mjs.\n${imports}\n\nexport const scenes = ${body};\n`);
  }
  console.log(`${reference.sources.length} sources, ${reference.sections.length} sections, ${reference.items.length} artboards, ${previews.size * 2} previews`);
} finally { await browser.close(); await server.close(); await rm(temporary, { recursive: true, force: true }); }
