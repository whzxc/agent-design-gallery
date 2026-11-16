import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildSource } from '../toolkit/build.mjs';
import { listSources, isFeatureInternal } from '../toolkit/project.mjs';
import { parseTokens, themeCss } from '../toolkit/tokens.mjs';
import { escape } from '../toolkit/html.mjs';
import { launch, readyResources, browserTask } from '../toolkit/browser.mjs';
import { resolveMedia } from './media.mjs';

export const layers = ['Tokens', 'Components', 'Modules', 'Surfaces'];
export const hash = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.split(path.sep).join('/');
const sheetWidth = 1680;
const themeSwitch = `<button data-adg-theme-switch type="button" aria-label="Switch light/dark theme">Light / Dark</button><script>document.querySelector('[data-adg-theme-switch]').addEventListener('click',()=>{const r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'});</script>`;
const chrome = `html,body{margin:0}[data-adg-theme-switch]{position:fixed;z-index:2147483647;right:12px;top:12px;padding:8px 12px;border:1px solid var(--border,var(--text));border-radius:6px;background:var(--canvas);color:var(--text);font:12px var(--font-ui);cursor:pointer}
[data-adg-sheet]{box-sizing:border-box;padding:48px;width:1680px;background:var(--canvas);color:var(--text);font-family:var(--font-ui)}
[data-adg-sheet]>header{margin-bottom:32px;font:16px var(--font-mono)}
[data-adg-specimens]{display:flex;flex-wrap:wrap;align-items:flex-start;gap:32px}
[data-adg-specimens]>figure{margin:0;max-width:none}
[data-adg-specimens]>figure[data-wide]{flex-basis:100%}
[data-adg-specimens] figcaption{display:flex;flex-direction:column;gap:4px;margin-bottom:12px;font:13px/1.5 var(--font-ui);color:var(--text-secondary,var(--text))}
[data-adg-specimens] figcaption strong{color:var(--text);font-weight:600}
[data-adg-token-grid]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
[data-adg-token]{border:1px solid var(--border,var(--text));padding:16px;min-width:0}
[data-adg-token] code{display:block;font:12px/1.5 var(--font-mono);overflow-wrap:anywhere}
[data-adg-token-preview]{height:44px;margin-bottom:12px}
[data-adg-token-heading]{margin:32px 0 16px;font-size:20px}
`;
function document(source, body, css, revision) {
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="generator" content="ADG"><meta name="adg-provenance" content="${escape(JSON.stringify({ generator: 'ADG', source, revision }))}"><title>${escape(source)}</title><style>${css.replace(/<\/style/gi, '<\\/style')}\n${chrome}</style></head><body>${body}${themeSwitch}</body></html>`;
}
// A revision-only change must not rewrite every document. The revision remains the last published one on skips.
export const contentHash = html => hash(html.replace(/<meta name="adg-provenance"[^>]*>/, ''));
const sizeStyle = frame => `width:${frame.width ? `${frame.width}px` : 'max-content'};${frame.height ? `height:${frame.height}px;` : ''}`;
function specimen(source, frame) {
  return `<div data-adg-frame="${escape(frame.name)}" data-specimen="${escape(`${source}#${frame.name}`)}" style="${sizeStyle(frame)}">${frame.html}</div>`;
}
function tokenCategory(name, value) {
  if (themeCss({ light: new Map([[name, value]]) }).includes(`--color-${name.slice(2)}:var(`)) return 'Colours';
  if (name.startsWith('--font-')) return 'Families';
  if (/^--(?:text|line|weight|tracking)-/.test(name)) return 'Typography';
  if (name.startsWith('--radius-')) return 'Radii';
  if (name.startsWith('--shadow-')) return 'Shadows';
  if (/^--(?:duration|ease|motion|transition|animation)-/.test(name)) return 'Motion';
  return 'Sizes';
}
export function tokenSheet(source, css, revision) {
  const tokens = parseTokens(css), groups = new Map();
  for (const [name, light] of tokens.light) {
    const category = tokenCategory(name, light), dark = tokens.dark.get(name) ?? light;
    let preview = '';
    if (category === 'Colours') preview = `background:var(${name});border:1px solid var(--text)`;
    if (category === 'Radii') preview = `border-radius:var(${name});border:2px solid var(--text)`;
    if (category === 'Shadows') preview = `box-shadow:var(${name});background:var(--canvas)`;
    const sample = category === 'Families' ? `font-family:var(${name});font-size:20px` : category === 'Typography' && name.startsWith('--text-') ? `font-size:var(${name})` : '';
    const row = `<article data-adg-token data-specimen="${escape(`${source}#${name}`)}">${preview ? `<div data-adg-token-preview style="${preview}"></div>` : sample ? `<div style="${sample}">Aa 0123</div>` : ''}<code>${escape(name)}</code><code>Light: ${escape(light)}</code><code>Dark: ${escape(dark)}</code></article>`;
    groups.set(category, [...(groups.get(category) ?? []), row]);
  }
  const body = `<main data-adg-sheet><header>${escape(source)}</header>${['Colours','Typography','Families','Radii','Shadows','Sizes','Motion'].filter(g => groups.has(g)).map(g => `<h2 data-adg-token-heading>${g}</h2><div data-adg-token-grid>${groups.get(g).join('')}</div>`).join('')}</main>`;
  return { key: source, source, name: 'Tokens', layer: 'Tokens', kind: 'sheet', width: sheetWidth, html: document(source, body, css, revision) };
}
export async function deriveDocuments(config, revision) {
  const source = slash(path.relative(config.root, path.join(config.design, 'tokens.css')));
  const documents = [tokenSheet(source, await readFile(path.join(config.design, 'tokens.css'), 'utf8'), revision)];
  const production = config.sources.filter(name => name !== 'studies');
  for (const file of listSources(config.design, config.sources)) {
    const relative = slash(path.relative(config.design, file));
    if (relative.startsWith('studies/') || isFeatureInternal(relative, config.sources)) continue;
    const index = production.indexOf(relative.split('/')[0]);
    const layer = index === 0 ? 'Components' : index === production.length - 1 && production.length > 1 ? 'Surfaces' : 'Modules';
    const source = slash(path.relative(config.root, file)), built = await buildSource(config, file, { write: false, allowLegacy: false });
    if (layer === 'Surfaces') {
      for (const frame of built.frames) documents.push({ key: `${source}#${frame.name}`, source, frame: frame.name, name: `${source} · ${frame.name}`, layer, kind: 'surface', width: frame.width, height: frame.height, html: document(source, specimen(source, frame), built.css, revision) });
    } else {
      const css = resolveMedia(built.css, config.publish.viewport);
      const body = `<main data-adg-sheet><header>${escape(source)}</header><div data-adg-specimens>${built.frames.map(frame => `<figure${frame.width > (sheetWidth - 96 - 32) / 2 ? ' data-wide' : ''}><figcaption><strong>${escape(frame.name)}</strong>${frame.note ? `<span>${escape(frame.note)}</span>` : ''}${frame.proposed ? `<span>Proposed: ${escape(frame.proposed)}</span>` : ''}</figcaption>${specimen(source, frame)}</figure>`).join('')}</div></main>`;
      documents.push({ key: source, source, name: source, layer, kind: 'sheet', width: sheetWidth, html: document(source, body, css, revision) });
    }
  }
  for (const doc of documents) doc.hash = contentHash(doc.html);
  return documents;
}
export async function measureDocuments(documents, { launchBrowser = launch } = {}) {
  if (!documents.length) return;
  const browser = await launchBrowser();
  try {
    await browserTask(browser, async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      try {
        for (const doc of documents) {
          await page.setViewportSize({ width: Math.ceil(doc.width ?? 1440), height: Math.ceil(doc.height ?? 900) });
          await page.setContent(doc.html, { waitUntil: 'load' });
          await page.evaluate(readyResources);
          const box = await page.locator(doc.kind === 'sheet' ? '[data-adg-sheet]' : '[data-adg-frame]').boundingBox();
          doc.width ??= Math.max(1, Math.ceil(box.width));
          doc.height ??= Math.max(1, Math.ceil(box.height));
        }
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
export function placeDocuments(documents) {
  for (const layer of layers) {
    let y = 0, previous, row = [], rowHeight = 0;
    for (const doc of documents.filter(d => d.layer === layer)) {
      if (doc.kind === 'surface') {
        if (previous && previous !== doc.source) { y += rowHeight + 120; row = []; rowHeight = 0; }
        doc.x = row.reduce((sum, item) => sum + item.width + 80, 0); doc.y = y;
        row.push(doc); rowHeight = Math.max(rowHeight, doc.height); previous = doc.source;
      } else { doc.x = 0; doc.y = y; y += doc.height + 120; }
    }
  }
}
