import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launch, loadSvg } from './browser.mjs';
import { designFrame, implementationTexts } from './document.mjs';
import { matchTexts, textDelta } from './text.mjs';
import { selectAssets, relative } from './project.mjs';
import { viewport } from './config.mjs';

export function compareReport(asset, frame, fixture, design, implementation) {
  const { pairs, missing, extra } = matchTexts(design.texts, implementation.texts);
  const rows = pairs.map(([d, i]) => ({ text: d.text, ...textDelta(d, i) })).map(row => ({ ...row, off: Math.max(Math.abs(row.dx), Math.abs(row.dy), Math.abs(row.dw)) }));
  return { asset, frame, fixture, size: { design: [Math.round(design.box.width), Math.round(design.box.height)], implementation: [Math.round(implementation.box.width), Math.round(implementation.box.height)] }, matched: rows.length,
    offBy2px: rows.filter(row => row.off > 2).sort((a, b) => b.off - a.off), missing: missing.map(m => m.text), extra: extra.map(e => e.text) };
}
const cell = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function reportHtml(report) {
  const fmt = value => (value > 0 ? '+' : '') + value.toFixed(1);
  return `<!doctype html><meta charset="utf-8"><title>${cell(report.asset)} ${cell(report.frame)}</title><style>body{font:13px system-ui;margin:24px;background:#f4f4f4}.row{display:flex;gap:16px;align-items:flex-start;overflow:auto}figure{margin:0}img{display:block;max-width:none;border:1px solid #ccc}table{border-collapse:collapse;margin-top:24px}td,th{padding:4px 10px;border-bottom:1px solid #ddd;text-align:left}td.n{font-family:ui-monospace,monospace;text-align:right}</style>
<h1>${cell(report.asset)} · ${cell(report.frame)} vs ${cell(report.fixture)}</h1><p>Matched ${report.matched} texts. ${report.offBy2px.length} differ by more than 2px. ${report.missing.length} missing in implementation. ${report.extra.length} extra in implementation.</p>
<div class="row">${['design', 'implementation', 'overlay'].map(name => `<figure><figcaption>${name}</figcaption><img src="${name}.png"></figure>`).join('')}</div>
<table><tr><th>Text</th><th>dx</th><th>dy</th><th>dw</th></tr>${report.offBy2px.map(row => `<tr><td>${cell(row.text)}</td><td class="n">${fmt(row.dx)}</td><td class="n">${fmt(row.dy)}</td><td class="n">${fmt(row.dw)}</td></tr>`).join('')}</table>
<h2>Missing in implementation</h2><p>${report.missing.map(cell).join(' · ') || 'None'}</p><h2>Extra in implementation</h2><p>${report.extra.map(cell).join(' · ') || 'None'}</p>`;
}
async function overlay(page, target) {
  const images = ['design', 'implementation'].map(name => `data:image/png;base64,${readFileSync(path.join(target, `${name}.png`)).toString('base64')}`);
  const data = await page.evaluate(async sources => {
    const [a, b] = await Promise.all(sources.map(src => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    })));
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(a.width, b.width); canvas.height = Math.min(a.height, b.height);
    const context = canvas.getContext('2d');
    context.drawImage(a, 0, 0); const first = context.getImageData(0, 0, canvas.width, canvas.height);
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(b, 0, 0);
    const second = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < first.data.length; i += 4) {
      for (let c = 0; c < 3; c++) first.data[i + c] = Math.round((first.data[i + c] + second.data[i + c]) / 2);
      first.data[i + 3] = 255;
    }
    context.putImageData(first, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, images);
  writeFileSync(path.join(target, 'overlay.png'), Buffer.from(data, 'base64'));
}
const safeName = value => encodeURIComponent(value).replace(/\./g, '%2E');
async function settle(read) {
  const started = performance.now();
  let previous, changed = started;
  for (;;) {
    const implementation = await read();
    const state = JSON.stringify({ box: implementation.box, texts: implementation.texts.map(({ text, x, y, width, height }) => ({ text, x, y, width, height })) });
    const now = performance.now();
    if (state !== previous) { previous = state; changed = now; }
    if (now - changed >= 300) return { implementation, settled: true };
    if (now - started >= 5000) return { implementation, settled: false };
    await delay(Math.min(50, 5000 - (now - started)));
  }
}
export async function compare(config, args, options) {
  const file = selectAssets(config, args)[0], adapter = config.compare;
  if (!adapter.fixture) throw new Error('Compare needs compare.fixture(name); add it to sdg.config.mjs');
  if (options.region && options.selector) throw new Error('Choose either --region or --selector');
  const frame = options.frame.startsWith('frame-') ? options.frame : `frame-${options.frame}`;
  const browser = await launch();
  let stop;
  try {
    const sheet = await browser.newPage();
    await loadSvg(sheet, file, 'light');
    let design = await sheet.evaluate(designFrame, frame);
    if (!design) throw new Error(`${relative(config, file)} has no ${frame}; choose an existing --frame`);
    const fixtureName = options.fixture ?? design.fixture;
    if (!fixtureName) throw new Error('Frame has no data-fixture; supply --fixture or declare data-fixture');
    const fixture = await adapter.fixture(fixtureName);
    if (!fixture || typeof fixture.url !== 'string' || !['light', 'dark'].includes(fixture.theme) || typeof fixture.locale !== 'string' || !fixture.locale || !Number.isFinite(Date.parse(fixture.clock))) throw new Error('compare.fixture must return url, theme (light/dark), locale and a valid clock; fix sdg.config.mjs');
    if (fixture.timezone !== undefined) {
      try {
        if (typeof fixture.timezone !== 'string' || !fixture.timezone || /^[+-]/.test(fixture.timezone)) throw new Error();
        new Intl.DateTimeFormat('en-US', { timeZone: fixture.timezone });
      } catch { throw new Error('compare.fixture timezone must be a valid IANA time zone such as Asia/Shanghai; fix sdg.config.mjs'); }
    }
    const size = viewport(design.viewport ?? options.viewport ?? adapter.viewport);
    const origin = design.origin?.trim().split(/\s+/).map(Number);
    if (design.viewport && (origin?.length !== 2 || !origin.every(Number.isFinite) || origin.some(n => n < 0) || origin[0] + design.box.width > size.width || origin[1] + design.box.height > size.height)) throw new Error('Frame does not fit its declared viewport; fix data-origin and the shell size');
    if (!design.viewport && !options.region && !options.selector) throw new Error('Frame has no data-viewport; supply --region or --selector');
    const absolute = /^https?:\/\//.test(fixture.url);
    if (!adapter.start && !absolute) throw new Error('Relative fixture URL needs compare.start; add it or return an absolute URL');
    const url = new URL(fixture.url, `http://127.0.0.1:${adapter.port}`).href;
    if (!/^https?:/.test(url)) throw new Error('Fixture URL must use HTTP or HTTPS; fix compare.fixture');
    if (adapter.start) {
      stop = await adapter.start({ port: adapter.port, root: config.root });
      if (typeof stop !== 'function') throw new Error('compare.start must return a stop function; fix sdg.config.mjs');
    }
    await sheet.emulateMedia({ colorScheme: fixture.theme, reducedMotion: 'reduce' });
    await sheet.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), fixture.theme);
    design = await sheet.evaluate(designFrame, frame);
    const target = path.join(config.output, 'compare', `${path.basename(file, '.svg')}-${safeName(frame.replace(/^frame-/, ''))}-${safeName(fixtureName)}`);
    mkdirSync(target, { recursive: true });
    await sheet.screenshot({ path: path.join(target, 'design.png'), clip: design.box });
    const app = await browser.newPage({ viewport: size, colorScheme: fixture.theme, reducedMotion: 'reduce', locale: fixture.locale, timezoneId: fixture.timezone });
    for (const pattern of adapter.block ?? []) await app.route(pattern, route => route.abort());
    await app.addInitScript(({ clock, theme }) => {
      const original = Date, fixed = original.parse(clock);
      function FixedDate(...values) {
        if (!new.target) return new original(fixed).toString();
        return Reflect.construct(original, values.length ? values : [fixed], new.target);
      }
      Object.setPrototypeOf(FixedDate, original); FixedDate.prototype = original.prototype; FixedDate.now = () => fixed;
      globalThis.Date = FixedDate;
      const apply = () => document.documentElement?.setAttribute('data-theme', theme);
      if (document.documentElement) apply();
      else { const observer = new MutationObserver(() => { if (document.documentElement) { apply(); observer.disconnect(); } }); observer.observe(document, { childList: true }); }
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }, { clock: fixture.clock, theme: fixture.theme });
    await app.goto(url, { waitUntil: 'load' });
    if (adapter.ready) await adapter.ready(app, fixtureName);
    for (const name of options.click ?? []) {
      let control;
      for (const role of ['button', 'radio', 'tab', 'checkbox', 'switch', 'menuitem', 'menuitemradio', 'option', 'link']) {
        const candidate = app.getByRole(role, { name, exact: true }).filter({ visible: true }).first();
        if (await candidate.count()) { control = candidate; break; }
      }
      if (!control) {
        console.error(`sdg: No visible control matches --click=${JSON.stringify(name)}`);
        return 1;
      }
      await control.click();
    }
    await app.evaluate(() => document.fonts.ready);
    const capture = design.viewport ? { x: origin[0], y: origin[1], width: design.box.width, height: design.box.height } : undefined;
    const panel = capture ? app.locator('html') : options.selector ? app.locator(options.selector).first() : app.getByRole('region', { name: options.region, exact: true }).or(app.getByRole('dialog', { name: options.region, exact: true })).first();
    if (!capture) await panel.scrollIntoViewIfNeeded();
    const { implementation, settled } = await settle(async () => {
      const result = await panel.evaluate(implementationTexts, capture);
      if (adapter.texts) {
        const additional = await adapter.texts(app), box = result.box;
        if (!Array.isArray(additional) || additional.some(t => typeof t.text !== 'string' || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(t[key])))) throw new Error('compare.texts must return text boxes in page coordinates; fix sdg.config.mjs');
        result.texts.push(...additional.filter(t => t.x >= box.x && t.y >= box.y && t.x + t.width <= box.x + box.width && t.y + t.height <= box.y + box.height).map(t => ({ ...t, x: t.x - box.x, y: t.y - box.y })));
      }
      return result;
    });
    const screenshot = { path: path.join(target, 'implementation.png') };
    if (capture) await app.screenshot({ ...screenshot, clip: capture });
    else await panel.screenshot(screenshot);
    const canvasPage = await browser.newPage();
    await overlay(canvasPage, target);
    const report = { ...compareReport(relative(config, file), frame, fixtureName, design, implementation), settled };
    writeFileSync(path.join(target, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(target, 'index.html'), reportHtml(report));
    console.log(`${relative(config, path.join(target, 'index.html'))}: matched ${report.matched}, ${report.offBy2px.length} off by >2px, ${report.missing.length} missing, ${report.extra.length} extra.`);
    return report.offBy2px.length || report.missing.length || report.extra.length ? 1 : 0;
  } finally {
    try { await browser.close(); } finally { if (typeof stop === 'function') await stop(); }
  }
}
