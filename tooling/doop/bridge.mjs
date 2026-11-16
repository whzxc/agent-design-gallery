import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { chromium } from 'playwright';

const layers = ['components', 'modules', 'surfaces'];
const agent_name = 'ADG bridge';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
export const identity = (source, frame, theme) => JSON.stringify([source, frame, theme]);

// Preserve the builder's document bytes except for inert annotation attributes.
export function documentFor(built, frame, theme) {
  const wrapper = `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${built.css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div data-adg-frame="${escape(frame.name)}" style="${frame.width ? `width:${frame.width}px;` : 'width:max-content;'}${frame.height ? `height:${frame.height}px;` : ''}">${frame.html}</div></body></html>`;
  const edits = [], elements = {};
  function visit(node, trail = '', inherited = []) {
    let owners = inherited;
    if (node.tagName) {
      const attributes = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
      if (attributes['data-adg-owners']) owners = JSON.parse(attributes['data-adg-owners']);
      if (node.sourceCodeLocation?.startTag && !['html', 'head', 'meta', 'style', 'body'].includes(node.tagName)) {
        let salt = 0;
        let id;
        do {
          id = (BigInt(`0x${digest(`${trail}:${salt++}`)}`) % (36n ** 6n)).toString(36).padStart(6, '0');
        } while (elements[id]);
        elements[id] = { path: trail, tag: node.tagName, owners };
        const end = node.sourceCodeLocation.startTag.endOffset;
        edits.push([end - (wrapper.slice(end - 2, end) === '/>' ? 2 : 1), ` data-doop-id="${id}"`]);
      }
    }
    const counts = new Map();
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const n = (counts.get(child.tagName) ?? 0) + 1;
      counts.set(child.tagName, n);
      visit(child, `${trail}${trail ? ' > ' : ''}${child.tagName}:nth-of-type(${n})`, owners);
    }
  }
  visit(parse(wrapper, { sourceCodeLocationInfo: true }));
  let html = wrapper;
  for (const [offset, addition] of edits.sort((a, b) => b[0] - a[0])) html = html.slice(0, offset) + addition + html.slice(offset);
  return { html, elements };
}

// Doop injects its font registry into stored documents on every write.
export function canonicalHtml(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const cuts = [];
  function visit(node) {
    if (node.tagName === 'link' && node.attrs.some(a => a.name === 'data-doop-webfonts')) {
      cuts.push([node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset]);
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(document);
  for (const [start, end] of cuts.sort((a, b) => b[0] - a[0])) html = html.slice(0, start) + html.slice(end);
  return html;
}

export function createClient(endpoint, key) {
  let id = 0;
  return async (name, args = {}) => {
    const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(30000), headers: {
      authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) });
    const body = await response.text();
    if (!response.ok) throw Error(`Doop ${name}: HTTP ${response.status} ${body.slice(0, 300)}`);
    const message = response.headers.get('content-type')?.includes('text/event-stream')
      ? JSON.parse(body.split('\n').find(line => line.startsWith('data: ')).slice(6)) : JSON.parse(body);
    if (message.error) throw Error(`Doop ${name}: ${JSON.stringify(message.error)}`);
    const result = message.result;
    if (result.isError) throw Error(`Doop ${name}: ${result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')}`);
    for (const item of result.content ?? []) {
      if (item.type === 'text') {
        try { return JSON.parse(item.text); } catch { /* protocol notes may precede the payload */ }
      }
    }
    throw Error(`Doop ${name}: missing JSON payload`);
  };
}

async function saveState(file, state) {
  await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2) + '\n');
  await rename(`${file}.tmp`, file);
}

export async function sync({ adgUrl, client, state, save = async () => {}, browser }) {
  const started = performance.now();
  const get = async route => {
    const response = await fetch(new URL(route, adgUrl));
    const body = await response.json();
    if (!response.ok) throw Error(`ADG ${route}: ${body.error ?? response.status}`);
    return body;
  };
  const manifest = await get('/manifest');
  if (!Array.isArray(manifest.assets)) throw Error('ADG returned an invalid asset manifest');
  const assets = manifest.assets.filter(a => layers.includes(a.path.split('/')[0]) && a.path.endsWith('.tsx'));
  const rows = [], page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    for (const asset of assets) {
      const built = await get(`/asset/${encodeURIComponent(asset.path)}`);
      for (const frame of built.frames) for (const theme of ['light', 'dark']) {
        const document = documentFor(built, frame, theme);
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: Math.ceil(frame.width ?? 1600), height: Math.ceil(frame.height ?? 1200) });
        await page.setContent(document.html);
        await page.evaluate(() => document.fonts.ready);
        const bounds = await page.locator('[data-adg-frame]').boundingBox();
        if (!bounds?.width || !bounds.height) throw Error(`Empty frame: ${built.projectSource}#${frame.name}`);
        rows.push({ source: built.projectSource, frame: frame.name, theme, layer: asset.path.split('/')[0],
          name: `${built.projectSource}#${frame.name} [${theme}]`, width: Math.ceil(bounds.width), height: Math.ceil(bounds.height), ...document });
      }
    }
  } finally { await page.close(); }
  const buildMs = performance.now() - started;
  if (!state.canvasId) {
    state.canvasId = (await client('create_canvas', { name: 'ADG source review', agent_name })).id;
    await save();
  }
  let canvas = await client('get_canvas', { canvas_id: state.canvasId });
  const desiredPages = layers.map(layer => canvas.pages.find(p => p.name === layer) ?? { id: `adg-${layer}`, name: layer });
  // A new dedicated canvas has one empty default page. Populated foreign pages stay intact.
  const retainedPages = canvas.pages.filter(p => !layers.includes(p.name) && canvas.frames.some(f => f.pageId === p.id));
  const pages = [...desiredPages, ...retainedPages].map(({ id, name }) => ({ id, name }));
  await client('set_canvas_pages', { canvas_id: state.canvasId, expectedPages: canvas.pages.map(({ id, name }) => ({ id, name })), pages, agent_name });
  state.frames ??= {};
  const remote = new Map(canvas.frames.map(f => [f.id, f]));
  const remoteNames = new Map(canvas.frames.map(f => [f.name, f]));
  const cursor = Object.fromEntries(layers.map(layer => [layer, 0]));
  const counts = { created: 0, updated: 0, unchanged: 0, removed: 0 };
  for (let i = 0; i < rows.length; i += 2) {
    const pair = rows.slice(i, i + 2), y = cursor[pair[0].layer];
    for (const [column, row] of pair.entries()) {
      const key = identity(row.source, row.frame, row.theme);
      const previous = state.frames[key];
      const found = remote.get(previous?.id) ?? remoteNames.get(row.name);
      const metadata = { name: row.name, pageId: desiredPages.find(p => p.name === row.layer).id,
        x: column === 0 ? 0 : pair[0].width + 80, y, width: row.width, height: row.height };
      const fingerprint = digest(JSON.stringify({ html: row.html, ...metadata }));
      let id = found?.id;
      if (!id) {
        id = (await client('create_frame', { canvas_id: state.canvasId, html: row.html, ...metadata, agent_name })).frame.id;
        counts.created++;
      } else {
        // Read remote HTML as users can edit a canvas. Git wins even when local state is unchanged.
        const current = await client('get_frame', { frame_id: id });
        const changed = canonicalHtml(current.html) !== canonicalHtml(row.html);
        if (changed) await client('set_frame_html', { frame_id: id, html: row.html, agent_name });
        const moved = Object.entries(metadata).some(([k, v]) => found[k] !== v);
        if (moved) await client('update_frame', { frame_id: id, ...metadata, agent_name });
        counts[!changed && !moved && previous?.fingerprint === fingerprint ? 'unchanged' : 'updated']++;
      }
      state.frames[key] = { id, source: row.source, frame: row.frame, theme: row.theme, fingerprint, elements: row.elements };
      if (previous?.id !== id || previous?.fingerprint !== fingerprint) await save();
    }
    cursor[pair[0].layer] += Math.max(...pair.map(r => r.height)) + 100;
  }
  const live = new Set(rows.map(row => identity(row.source, row.frame, row.theme)));
  for (const [key, old] of Object.entries(state.frames)) {
    if (live.has(key)) continue;
    if (remote.has(old.id)) await client('delete_frame', { frame_id: old.id, agent_name });
    delete state.frames[key]; counts.removed++; await save();
  }
  canvas = await client('get_canvas', { canvas_id: state.canvasId });
  return { canvasId: state.canvasId, sources: assets.length, frames: rows.length, remoteFrames: canvas.frames.length,
    ...counts, buildMs: Math.round(buildMs), pushMs: Math.round(performance.now() - started - buildMs), totalMs: Math.round(performance.now() - started) };
}

export function mapComments(comments, state) {
  const byId = new Map(Object.values(state.frames ?? {}).map(frame => [frame.id, frame]));
  return comments.map(comment => {
    const frame = byId.get(comment.frameId);
    const element = frame?.elements[comment.elementId];
    return { ...comment, adg: frame ? { source: frame.source, frame: frame.frame, theme: frame.theme,
      element: element ?? null, anchorStatus: element ? 'mapped-at-last-sync' : 'unmapped' } : null };
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = Object.fromEntries(args.map(arg => { const i = arg.indexOf('='); return [arg.slice(2, i), arg.slice(i + 1)]; }));
  if (!['sync', 'comments'].includes(command) || !options.state || !process.env.DOOP_AGENT_KEY) {
    throw Error('Usage: DOOP_AGENT_KEY=… node tooling/doop/bridge.mjs sync --project=/path/to/project --state=/path/to/state.json [--endpoint=http://localhost:4300/mcp] [--port=4317]\nRead feedback: same options with comments. An explicit state path is required.');
  }
  const stateFile = path.resolve(options.state), endpoint = options.endpoint ?? 'http://localhost:4300/mcp';
  await mkdir(path.dirname(stateFile), { recursive: true });
  await mkdir(`${stateFile}.lock`).catch(() => { throw Error(`Bridge already running or stale lock: ${stateFile}.lock`); });
  let state, child, browser;
  const shutdown = () => { child?.kill('SIGTERM'); };
  const interrupt = () => { shutdown(); void browser?.close(); };
  process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt);
  try {
    try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { endpoint, project: path.resolve(options.project ?? '.'), frames: {} }; }
    if (state.endpoint !== endpoint) throw Error('State endpoint differs. Use a separate state file for each Doop instance.');
    const client = createClient(endpoint, process.env.DOOP_AGENT_KEY);
    if (command === 'comments') {
      console.log(JSON.stringify(mapComments(await client('get_comments', { canvas_id: state.canvasId }), state), null, 2)); return;
    }
    if (options.project && path.resolve(options.project) !== state.project) throw Error('State project differs. Use its original project or another state file.');
    child = spawn('adg', ['open', state.project, '--no-open', `--port=${options.port ?? 4317}`, `--state-dir=${stateFile}.adg`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const adgUrl = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => { shutdown(); reject(Error(`adg startup timed out: ${output}`)); }, 30000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => { clearTimeout(timeout); reject(Error(`adg exited (${code}): ${output}`)); });
      child.stderr.on('data', chunk => { output += chunk; });
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/ADG: (http:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    browser = await chromium.launch();
    console.log(JSON.stringify(await sync({ adgUrl, client, state, browser, save: () => saveState(stateFile, state) }), null, 2));
  } finally {
    await browser?.close();
    if (child && child.exitCode === null && child.signalCode === null) { const exit = new Promise(resolve => child.once('exit', resolve)); shutdown(); await exit; }
    await rm(`${stateFile}.lock`, { recursive: true, force: true });
    process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
