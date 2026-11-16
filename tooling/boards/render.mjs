// Build board studies through a running `adg open`, emit compact standalone HTML and a review PNG.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/user/agent-design-gallery/package.json');
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
for (const source of sources) {
  const built = await (await fetch(`${adg}/asset/${encodeURIComponent(source)}`)).json();
  if (built.error) { console.error(source, built.error); continue; }
  const frame = built.frames[0];
  const name = source.replace(/^studies\//, '').replace(/\.tsx$/, '');
  const html = `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><title>${name}</title><style>${compactCss(built.css)}</style></head><body><div data-adg-frame="${frame.name}" data-source="design/${source}" style="width:${frame.width}px">${compactHtml(frame.html)}</div></body></html>`;
  const file = `${outDir}/${name}-${theme}.html`;
  writeFileSync(file, html);
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('[data-adg-frame]').boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
  await page.screenshot({ path: `${outDir}/${name}-${theme}.png`, fullPage: true });
  console.log(JSON.stringify({ source, theme, bytes: html.length, width: Math.ceil(box.width), height: Math.ceil(box.height), file }));
}
await browser.close();
