// Build board studies through a running `adg open`, emit compact standalone HTML and a review PNG.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [adg, outDir, theme = 'light', ...sources] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const compactCss = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}');
const compactHtml = html => html
  .replace(/ class="([^"]*)"/g, (_, c) => ` class="${c.replace(/\s+/g, ' ').trim()}"`)
  .replace(/ data-adg-owners="([^"]*)"/g, (_, json) => {
    const owners = JSON.parse(json.replaceAll('&quot;', '"'));
    return ` data-owner="${owners.map(o => `${o.source}#${o.export}`).join(' ')}"`;
  });
// Boards are tall documents, so viewport media queries (orientation, width) would answer for the board,
// not for the frames on it. Resolve them once against the presentation viewport the board stands for.
const viewport = { width: 1440, height: 900 };
const feature = (name, op, value) => {
  const actual = viewport[name.replace(/^(min|max)-/, '')];
  if (actual === undefined) return null;
  const limit = parseFloat(value);
  if (name.startsWith('min-')) return actual >= limit;
  if (name.startsWith('max-')) return actual <= limit;
  return { '<': actual < limit, '<=': actual <= limit, '>': actual > limit, '>=': actual >= limit }[op] ?? null;
};
const evaluate = condition => {
  const parts = condition.replace(/\s+/g, '').split(/\)and\(/).map(part => part.replace(/^\(|\)$/g, ''));
  let result = true;
  for (const part of parts) {
    let match;
    if ((match = /^orientation:(portrait|landscape)$/.exec(part))) result &&= (viewport.height > viewport.width) === (match[1] === 'portrait');
    else if ((match = /^((?:min-|max-)?(?:width|height)):([\d.]+)px$/.exec(part))) result &&= feature(match[1], ':', match[2]);
    else if ((match = /^(width|height)(<=|>=|<|>)([\d.]+)px$/.exec(part))) result &&= feature(match[1], match[2], match[3]);
    else return null;
  }
  return result;
};
const flattenViewportMedia = css => {
  let out = '', index = 0, resolved = 0;
  for (let at = css.indexOf('@media', index); at !== -1; at = css.indexOf('@media', index)) {
    const open = css.indexOf('{', at);
    let depth = 1, close = open + 1;
    for (; depth && close < css.length; close++) depth += css[close] === '{' ? 1 : css[close] === '}' ? -1 : 0;
    const verdict = evaluate(css.slice(at + 6, open).trim());
    out += css.slice(index, at);
    if (verdict === null) out += css.slice(at, close);
    else { resolved++; if (verdict) out += css.slice(open + 1, close - 1); }
    index = close;
  }
  return { css: out + css.slice(index), resolved };
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
for (const source of sources) {
  const built = await (await fetch(`${adg}/asset/${encodeURIComponent(source)}`)).json();
  if (built.error) { console.error(source, built.error); continue; }
  const frame = built.frames[0];
  const name = source.replace(/^studies\//, '').replace(/\.tsx$/, '');
  const { css, resolved } = flattenViewportMedia(compactCss(built.css));
  const html = `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><title>${name}</title><style>${css}</style></head><body><div data-adg-frame="${frame.name}" data-source="design/${source}" data-viewport="${viewport.width}x${viewport.height}" style="width:${frame.width}px">${compactHtml(frame.html)}</div></body></html>`;
  const file = `${outDir}/${name}-${theme}.html`;
  writeFileSync(file, html);
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('[data-adg-frame]').boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
  await page.screenshot({ path: `${outDir}/${name}-${theme}.png`, fullPage: true });
  const size = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
  writeFileSync(`${outDir}/${name}-${theme}.meta.json`, JSON.stringify(size));
  console.log(JSON.stringify({ source, theme, bytes: html.length, ...size, resolvedMedia: resolved, file }));
}
await browser.close();
