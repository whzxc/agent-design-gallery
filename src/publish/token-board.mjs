import { parseTokens, themeCss } from '../toolkit/tokens.mjs';
import { escape } from '../toolkit/html.mjs';
import { boardDocument, boardHeader, sectionMarkup, boardHeightBudget } from './board.mjs';
import { readyResources } from '../toolkit/browser.mjs';

const tokenStyles = `
[data-adg-token-groups]{display:flex;flex-direction:column;gap:40px}
[data-adg-token-group]>h3{margin:0 0 16px;font-size:13px;line-height:18px;font-weight:600}
[data-adg-token-grid]{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:32px 24px;align-items:start}
[data-adg-token]{min-width:0;margin:0}
[data-adg-token] code{display:block;font:12px/17px var(--font-mono,ui-monospace,monospace);overflow-wrap:anywhere}
[data-adg-token] small{display:block;margin-top:2px;color:var(--text-tertiary,#777);font:11px/16px var(--font-mono,ui-monospace,monospace);overflow-wrap:anywhere}
[data-adg-token-swatch]{display:flex;height:72px;margin-bottom:8px;overflow:hidden;border:1px solid var(--border,#deded9);border-radius:var(--radius-tile,8px)}
[data-adg-token-swatch]>span{flex:1;min-width:0}
[data-adg-type-scale]{display:flex;flex-direction:column}
[data-adg-type-row]{display:grid;grid-template-columns:160px minmax(0,1fr) 160px;align-items:baseline;gap:24px;padding:16px 0;border-bottom:1px solid var(--border,#deded9)}
[data-adg-type-row]>small{text-align:right}
[data-adg-family-grid]{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
[data-adg-family]{padding:16px 20px;border-radius:var(--radius-card,12px);background:var(--canvas,#f0f0ee)}
[data-adg-family-sample]{margin-bottom:8px;font-size:18px;line-height:26px;overflow-wrap:anywhere}
[data-adg-shape-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:24px 16px}
[data-adg-radius]{height:88px;width:88px;margin:0 auto 12px;border:1px solid var(--border-strong,var(--border,#ccc));background:var(--surface-subtle,var(--surface-section,#f5f5f2))}
[data-adg-shape-grid] [data-adg-token]{text-align:center}
[data-adg-shadow-grid]{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px;padding:40px;border-radius:var(--radius-card,12px);background:var(--canvas,#f0f0ee)}
[data-adg-shadow]{height:120px;margin-bottom:16px;border-radius:var(--radius-card,12px);background:var(--surface,#fff)}
[data-adg-size-list]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 32px;align-items:start}
[data-adg-size]{width:100%;min-height:1px;margin-bottom:10px;border-radius:var(--radius-field,8px);background:var(--surface-subtle,var(--surface-section,#e9e9e4));border:1px solid var(--border,#deded9);box-sizing:border-box}
[data-adg-motion-grid]{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 24px;align-items:start}
[data-adg-easing]{display:block;width:100%;height:128px;margin-bottom:12px;border-radius:var(--radius-card,12px);background:var(--canvas,#f0f0ee);color:var(--text,#20201e)}
[data-adg-duration-track]{height:12px;margin:24px 0 20px;border-radius:6px;background:var(--canvas,#f0f0ee);overflow:hidden}
[data-adg-duration]{height:100%;min-width:2px;border-radius:6px;background:var(--action,var(--accent,#333))}
[data-adg-type-extras]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 24px}
`;

function colourGroups(css, names) {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
  const headings = new Map();
  let heading;
  for (const line of root.split('\n')) {
    const comment = /^\s*\/\*\s*(.*?)\s*\*\/\s*$/.exec(line);
    if (comment) { heading = comment[1]; continue; }
    const token = /^\s*(--[\w-]+)\s*:/.exec(line);
    if (token && heading) headings.set(token[1], heading);
  }
  const groups = new Map();
  for (const name of names) {
    const title = headings.get(name) ?? name.slice(2).split('-')[0];
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(name);
  }
  return groups;
}

function resolvedValue(name, values, seen = new Set()) {
  if (seen.has(name)) return values.get(name) ?? '';
  const visited = new Set([...seen, name]);
  return (values.get(name) ?? '').replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/g,
    (match, reference, fallback) => values.has(reference) ? resolvedValue(reference, values, visited) : fallback ?? match);
}

function caption(name, light, dark) {
  return `<code>${escape(name)}</code><small>Light: ${escape(light)}</small>${light !== dark ? `<small>Dark: ${escape(dark)}</small>` : ''}`;
}

function tokenCategory(name, value, colours) {
  if (colours.has(name)) return 'colour';
  if (/^--(?:font-size|text)-/.test(name) && /^[-.\d]+(?:px|rem|em)$/.test(value)) return 'type';
  if (/^--(?:font|family)-/.test(name) && !/^--font-(?:size|weight|stretch|style|tracking|line)/.test(name)) return 'family';
  if (/^--(?:radius|round)-/.test(name)) return 'radius';
  if (/shadow/.test(name)) return 'shadow';
  if (/^(?:cubic-bezier\(|steps\(|linear\(|ease(?:-in|-out|-in-out)?$|linear$)/.test(value)) return 'easing';
  if (/^[\d.]+m?s$/.test(value)) return 'duration';
  if (/^--(?:line|weight|tracking|font-weight|font-line|letter-spacing)/.test(name)) return 'type-extra';
  return 'size';
}

function easingCurve(value) {
  const points = /^cubic-bezier\(\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*\)$/.exec(value);
  const presets = { ease: [.25,.1,.25,1], 'ease-in': [.42,0,1,1], 'ease-out': [0,0,.58,1], 'ease-in-out': [.42,0,.58,1] };
  const p = points ? points.slice(1).map(Number) : presets[value];
  let curve = 'M16 112 L112 16';
  if (p) curve = `M16 112 C${16 + p[0] * 96} ${112 - p[1] * 96} ${16 + p[2] * 96} ${112 - p[3] * 96} 112 16`;
  const steps = /^steps\(\s*(\d+)(?:\s*,\s*(start|end|jump-start|jump-end))?\s*\)$/.exec(value);
  if (steps) {
    const count = Math.min(100, Number(steps[1]));
    const start = steps[2] === 'start' || steps[2] === 'jump-start';
    curve = `M16 ${start ? 112 - 96 / count : 112}`;
    for (let i = 1; i <= count; i++) curve += ` H${16 + i * 96 / count} V${112 - Math.min(count, i + (start ? 1 : 0)) * 96 / count}`;
  }
  return `<svg data-adg-easing viewBox="0 0 128 128" role="img" aria-label="${escape(value)}"><path d="M16 16 V112 H112" fill="none" stroke="currentColor" opacity=".18"/><path d="${curve}" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`;
}

export function tokenBoard(source, css, revision, { projectName = 'Design library' } = {}) {
  const tokens = parseTokens(css);
  const darkValues = new Map([...tokens.light, ...tokens.dark]);
  const themes = themeCss(tokens);
  const colours = new Set([...tokens.light.keys()].filter(name => themes.includes(`--color-${name.slice(2)}:var(`)));
  const categories = new Map();
  for (const [name, value] of tokens.light) {
    const category = tokenCategory(name, value, colours);
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(name);
  }
  const light = name => resolvedValue(name, tokens.light);
  const dark = name => resolvedValue(name, darkValues);
  const article = (name, content, attrs = '') => `<article data-adg-token data-specimen="${escape(`${source}#${name}`)}"${attrs}>${content}</article>`;
  const label = name => caption(name, tokens.light.get(name), tokens.dark.get(name) ?? tokens.light.get(name));
  const section = (title, content) => sectionMarkup({ title, source, content }).replace(
    `data-adg-section="${escape(source)}"`, `data-adg-section="${escape(`${source}#${title.toLowerCase()}`)}"`); 
  const sections = [];
  if (categories.has('colour')) {
    const groups = colourGroups(css, categories.get('colour'));
    const content = [...groups].map(([title, names]) => `<div data-adg-token-group><h3>${escape(title)}</h3><div data-adg-token-grid>${names.map(name => article(name,
      `<div data-adg-token-swatch><span style="background:${escape(light(name))}"></span><span style="background:${escape(dark(name))}"></span></div>${label(name)}`)).join('')}</div></div>`).join('');
    sections.push(section('Colour', `<div data-adg-token-groups>${content}</div>`));
  }
  if (categories.has('type') || categories.has('family') || categories.has('type-extra')) {
    const sizes = (categories.get('type') ?? []).map(name => {
      const role = name.replace(/^--(?:font-size|text)-/, '');
      const line = [`--line-${role}`, `--line-height-${role}`, `--font-line-${role}`].find(key => tokens.light.has(key));
      const weight = [`--weight-${role}`, `--font-weight-${role}`].find(key => tokens.light.has(key));
      const style = `font-size:var(${name});line-height:${line ? `var(${line})` : '1.4'};font-weight:${weight ? `var(${weight})` : '400'}`;
      const metrics = [name, line, weight].filter(Boolean).map(key => key === name ? escape(tokens.light.get(key)) : `<span data-specimen="${escape(`${source}#${key}`)}">${escape(tokens.light.get(key))}</span>`).join(' / ');
      return article(name, `<code>${escape(name)}</code><span style="${escape(style)}">The quick brown fox</span><small>${metrics}</small>`, ' data-adg-type-row');
    }).join('');
    const families = (categories.get('family') ?? []).map(name => article(name,
      `<div data-adg-family-sample style="font-family:var(${escape(name)})">Aa Bb 0123</div>${label(name)}`, ' data-adg-family')).join('');
    const paired = new Set((categories.get('type') ?? []).flatMap(name => {
      const role = name.replace(/^--(?:font-size|text)-/, '');
      return [`--line-${role}`, `--line-height-${role}`, `--font-line-${role}`, `--weight-${role}`, `--font-weight-${role}`];
    }));
    const extras = (categories.get('type-extra') ?? []).filter(name => !paired.has(name)).map(name => article(name, label(name))).join('');
    sections.push(section('Type', `<div data-adg-token-groups>${sizes ? `<div data-adg-type-scale>${sizes}</div>` : ''}${families ? `<div data-adg-token-group><h3>Families</h3><div data-adg-family-grid>${families}</div></div>` : ''}${extras ? `<div data-adg-type-extras>${extras}</div>` : ''}</div>`));
  }
  if (categories.has('radius')) sections.push(section('Shape', `<div data-adg-shape-grid>${categories.get('radius').map(name => article(name, `<div data-adg-radius style="border-radius:var(${escape(name)})"></div>${label(name)}`)).join('')}</div>`));
  if (categories.has('shadow')) sections.push(section('Elevation', `<div data-adg-shadow-grid>${categories.get('shadow').map(name => article(name, `<div data-adg-shadow style="--hub-color:var(--accent,var(--text,#333));box-shadow:var(${escape(name)})"></div>${label(name)}`)).join('')}</div>`));
  if (categories.has('size')) sections.push(section('Sizing', `<div data-adg-size-list>${categories.get('size').map(name => {
    const value = light(name);
    const preview = /^[-.\d]+(?:px|rem|em|vh|vw|%)$/.test(value) ? `<div data-adg-size style="height:var(${escape(name)})"></div>` : '';
    return article(name, preview + label(name));
  }).join('')}</div>`));
  if (categories.has('easing') || categories.has('duration')) {
    const durations = categories.get('duration') ?? [];
    const milliseconds = name => parseFloat(light(name)) * (light(name).endsWith('ms') ? 1 : 1000);
    const maximum = Math.max(1, ...durations.map(milliseconds));
    const curves = (categories.get('easing') ?? []).map(name => article(name, easingCurve(light(name)) + label(name))).join('');
    const bars = durations.map(name => article(name, `<div data-adg-duration-track><div data-adg-duration style="width:${milliseconds(name) / maximum * 100}%"></div></div>${label(name)}`)).join('');
    sections.push(section('Motion', `<div data-adg-motion-grid>${curves}${bars}</div>`));
  }
  const body = `<main data-adg-board>${boardHeader({ title: 'Tokens', projectName, layer: 'Tokens', number: 1, sourceCount: 1, frameCount: tokens.light.size, countLabel: 'tokens' })}${sections.join('')}</main>`;
  return { key: source, source, name: 'Tokens', layer: 'Tokens', kind: 'board', width: 1680, html: boardDocument(source, body, `${css}\n${tokenStyles}`, revision),
    _tokenBoard: { sections, css: `${css}\n${tokenStyles}`, revision, projectName } }; 
}


export async function paginateTokenBoard(doc, page, { heightBudget = boardHeightBudget } = {}) {
  const { _tokenBoard: metadata, ...document } = doc;
  await page.setContent(doc.html);
  await page.evaluate(readyResources);
  const heights = await page.locator('[data-adg-section]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  const overhead = await page.locator('[data-adg-board]').evaluate(node => {
    const style = getComputedStyle(node);
    return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + node.querySelector('[data-adg-header]').getBoundingClientRect().height;
  });
  const buckets = [];
  let sections = [], height = overhead;
  for (const [index, section] of metadata.sections.entries()) {
    if (sections.length && height + heights[index] > heightBudget) {
      buckets.push(sections);
      sections = [];
      height = overhead;
    }
    sections.push(section);
    height += heights[index];
  }
  if (sections.length) buckets.push(sections);
  const documents = [];
  for (const [index, content] of buckets.entries()) {
    const part = index + 1;
    const name = part === 1 ? 'Tokens' : `Tokens · ${part}`;
    const frameCount = content.reduce((count, section) => count + [...section.matchAll(/data-specimen=/g)].length, 0);
    const header = boardHeader({ title: name, projectName: metadata.projectName, layer: 'Tokens', number: 1, sourceCount: 1, frameCount, countLabel: 'tokens' });
    const html = boardDocument(doc.source, `<main data-adg-board>${header}${content.join('')}</main>`, metadata.css, metadata.revision);
    await page.setContent(html);
    await page.evaluate(readyResources);
    const measuredHeight = Math.ceil(await page.locator('[data-adg-board]').evaluate(node => node.getBoundingClientRect().height));
    documents.push({ ...document, key: part === 1 ? doc.key : `${doc.key}:${part}`, chapter: 'tokens', part, name, sourceCount: 1, frameCount, height: measuredHeight, html });
  }
  return documents;
}
