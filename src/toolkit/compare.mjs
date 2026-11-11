import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launch, loadFrame } from './browser.mjs';
import { implementationTexts } from './document.mjs';
import { matchTexts, textDelta } from './text.mjs';
import { selectSources, relative } from './project.mjs';
import { buildSource } from './build.mjs';
import { viewport } from './config.mjs';
import { CliError } from '../cli-output.mjs';

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
  if (options.all) return compareAll(config);
  const file = selectSources(config, args)[0], adapter = config.compare;
  if (!adapter.fixture) throw new Error('Compare needs compare.fixture(name); add it to adg.config.mjs');
  if ([options.region,options.selector,options.page].filter(Boolean).length > 1) throw Error('Choose --region, --selector or --page');
  const frame = options.frame;
  const built = await buildSource(config,file,{allowLegacy:false}), definition = built.frames.find(f=>f.name===frame);
  if (!definition) throw new CliError('FRAME_NOT_FOUND', `Unknown frame ${frame}; choose a declared frame`);
  const settings = {...definition.capture};
  if (options.region || options.selector || options.page) { delete settings.region; delete settings.selector; delete settings.page; }
  for (const key of ['region','selector','page','origin','viewport']) if (options[key] !== undefined) settings[key] = options[key];
  settings.clicks = options.click ?? settings.clicks ?? [];
  const browser = await launch();
  let stop;
  try {
    const fixtureName = options.fixture ?? definition.fixture;
    if (!fixtureName) throw Error('Frame needs a fixture; supply --fixture or Frame fixture');
    const fixture = await adapter.fixture(fixtureName);
    if (!fixture || typeof fixture.url !== 'string' || !['light', 'dark'].includes(fixture.theme) || typeof fixture.locale !== 'string' || !fixture.locale || !Number.isFinite(Date.parse(fixture.clock))) throw new Error('compare.fixture must return url, theme (light/dark), locale and a valid clock; fix adg.config.mjs');
    if (fixture.timezone !== undefined) {
      try {
        if (typeof fixture.timezone !== 'string' || !fixture.timezone || /^[+-]/.test(fixture.timezone)) throw new Error();
        new Intl.DateTimeFormat('en-US', { timeZone: fixture.timezone });
      } catch { throw new Error('compare.fixture timezone must be a valid IANA time zone such as Asia/Shanghai; fix adg.config.mjs'); }
    }
    const sheet = await browser.newPage({colorScheme:fixture.theme,locale:fixture.locale,timezoneId:fixture.timezone,reducedMotion:'reduce'});
    const frameBox = await loadFrame(sheet,definition,fixture.theme);
    let design = await sheet.locator('[data-adg-frame] > :first-child').evaluate(implementationTexts);
    const size = viewport(settings.viewport ?? adapter.viewport);
    const origin = (settings.origin ?? '0 0').trim().split(/\s+/).map(Number);
    if (settings.page && (origin.length !== 2 || !origin.every(Number.isFinite) || origin.some(n=>n<0) || origin[0]+frameBox.width>size.width || origin[1]+frameBox.height>size.height)) throw Error('Frame does not fit capture viewport; fix origin or viewport');
    if (!settings.page && !settings.region && !settings.selector) throw Error('Frame needs capture; supply --page, --region or --selector');
    const absolute = /^https?:\/\//.test(fixture.url);
    if (!adapter.start && !absolute) throw new Error('Relative fixture URL needs compare.start; add it or return an absolute URL');
    const url = new URL(fixture.url, `http://127.0.0.1:${adapter.port}`).href;
    if (!/^https?:/.test(url)) throw new Error('Fixture URL must use HTTP or HTTPS; fix compare.fixture');
    if (adapter.start) {
      stop = await adapter.start({ port: adapter.port, root: config.root });
      if (typeof stop !== 'function') throw new Error('compare.start must return a stop function; fix adg.config.mjs');
    }
    await sheet.emulateMedia({ colorScheme: fixture.theme, reducedMotion: 'reduce' });
    await sheet.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), fixture.theme);
    design = await sheet.locator('[data-adg-frame] > :first-child').evaluate(implementationTexts);
    const target = path.join(config.output, 'compare', `${path.relative(config.design,file).replace(/\.tsx$/, '').split(path.sep).join('-')}-${safeName(frame)}-${safeName(fixtureName)}`);
    mkdirSync(target, { recursive: true });
    await sheet.screenshot({ path: path.join(target, 'design.png'), clip: frameBox });
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
    for (const name of settings.clicks) {
      let control;
      for (const role of ['button', 'radio', 'tab', 'checkbox', 'switch', 'menuitem', 'menuitemradio', 'option', 'link']) {
        const candidate = app.getByRole(role, { name, exact: true }).filter({ visible: true }).first();
        if (await candidate.count()) { control = candidate; break; }
      }
      if (!control) {
        console.error(`adg: No visible control matches --click=${JSON.stringify(name)}`);
        return 1;
      }
      await control.click();
    }
    await app.evaluate(() => document.fonts.ready);
    const capture = settings.page ? { x: origin[0], y: origin[1], width: frameBox.width, height: frameBox.height } : undefined;
    const panel = capture ? app.locator('html') : settings.selector ? app.locator(settings.selector).first() : app.getByRole('region', { name: settings.region, exact: true }).or(app.getByRole('dialog', { name: settings.region, exact: true })).first();
    if (!capture) await panel.scrollIntoViewIfNeeded();
    const { implementation, settled } = await settle(async () => {
      const result = await panel.evaluate(implementationTexts, capture);
      if (adapter.texts) {
        const additional = await adapter.texts(app), box = result.box;
        if (!Array.isArray(additional) || additional.some(t => typeof t.text !== 'string' || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(t[key])))) throw new Error('compare.texts must return text boxes in page coordinates; fix adg.config.mjs');
        result.texts.push(...additional.filter(t => t.x >= box.x && t.y >= box.y && t.x + t.width <= box.x + box.width && t.y + t.height <= box.y + box.height).map(t => ({ ...t, x: t.x - box.x, y: t.y - box.y })));
      }
      return result;
    });
    const screenshot = { path: path.join(target, 'implementation.png') };
    if (capture) await app.screenshot({ ...screenshot, clip: capture });
    else await panel.screenshot(screenshot);
    const canvasPage = await browser.newPage();
    await overlay(canvasPage, target);
    const report = { ...compareReport(relative(config, file), frame, fixtureName, {...design,box:frameBox}, implementation), settled };
    if (options.collect) options.collect.push({...report, report: path.relative(path.join(config.output,'compare'),path.join(target,'index.html'))});
    writeFileSync(path.join(target, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(target, 'index.html'), reportHtml(report));
    console.log(`${relative(config, path.join(target, 'index.html'))}: matched ${report.matched}, ${report.offBy2px.length} off by >2px, ${report.missing.length} missing, ${report.extra.length} extra.`);
    return report.offBy2px.length || report.missing.length || report.extra.length ? 1 : 0;
  } finally {
    try { await browser.close(); } finally { if (typeof stop === 'function') await stop(); }
  }
}

async function compareAll(config) {
  const files = selectSources(config), summary = []; let code = 0;
  for (const file of files) {
    const built = await buildSource(config,file,{allowLegacy:false});
    for (const frame of built.frames.filter(f=>f.fixture)) code = Math.max(code,await compare(config,[file],{frame:frame.name,collect:summary}));
  }
  const target=path.join(config.output,'compare'); mkdirSync(target,{recursive:true});
  writeFileSync(path.join(target,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  writeFileSync(path.join(target,'index.html'),`<!doctype html><meta charset="utf-8"><title>Design comparisons</title><table><tr><th>Source</th><th>Frame</th><th>Matched</th><th>Offsets</th><th>Missing</th><th>Extra</th></tr>${summary.map(r=>`<tr><td>${cell(r.asset)}</td><td><a href="${cell(r.report)}">${cell(r.frame)}</a></td><td>${r.matched}</td><td>${r.offBy2px.length}</td><td>${r.missing.length}</td><td>${r.extra.length}</td></tr>`).join('')}</table>`);
  return code;
}
