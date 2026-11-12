import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { availableParallelism } from 'node:os';
import { buildSource } from './build.mjs';
import { selectSources, relative, loadTokens, sourceDirectories, archFiles } from './project.mjs';
import { importDirectionViolations } from './asset-rules.mjs';
import { launch, loadFrame, browserTask } from './browser.mjs';
import { CliError, classifyError } from '../cli-output.mjs';
import { commandFailure, cleanup, emptySelection } from './results.mjs';
import { loadImplementationMap, validateImplementationMap } from './implementation-map.mjs';
import { withImpacted } from './impact-selection.mjs';
import { mappingFacts } from './source-facts.mjs';
export function inspectFrame(tokenNames) {
  const frame = document.querySelector('[data-adg-frame]'), box = frame.getBoundingClientRect(), problems = new Map();
  const add = (code, message) => problems.set(message, {code, message, line:null, column:null});
  if (frame.children.length !== 1 || [...frame.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) add('FRAME_ROOT_INVALID', 'Frame needs exactly one root element');
  const sample = document.createElement('i'); document.body.append(sample);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { colorSpace: 'srgb', colorType: 'float16', willReadFrequently: true });
  context.globalCompositeOperation = 'copy';
  const normalized = new Map();
  const normalize = value => {
    if (!normalized.has(value)) {
      context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      // Float pixels retain un-premultiplied RGB even at low opacity.
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1, { colorSpace: 'srgb', pixelFormat: 'rgba-float16' }).data;
      normalized.set(value, [r, g, b].map(channel => Math.round(channel * 255)).concat(a));
    }
    return normalized.get(value);
  };
  const colors = [];
  for (const name of tokenNames) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (CSS.supports('color', value)) { sample.style.color = value; colors.push(normalize(getComputedStyle(sample).color)); }
    for (const color of value.match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)|#[\da-f]{3,8}\b/gi) ?? []) { sample.style.color = color; colors.push(normalize(getComputedStyle(sample).color)); }
  }
  sample.remove();
  const outside = r => r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
  const styles = new Map(), bounds = new Map(), effects = new Map();
  const style = el => { if (!styles.has(el)) styles.set(el,getComputedStyle(el)); return styles.get(el); };
  const rectFor = el => { if (!bounds.has(el)) bounds.set(el,el.getBoundingClientRect()); return bounds.get(el); };
  const intersect = (a,b) => ({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)});
  const nonempty = r => r.right > r.left && r.bottom > r.top;
  const clipped = (rect,start) => {
    let visible = {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    for (let p=start;p;p=p.parentElement) {
      const ps=style(p),pr=rectFor(p);
      // Overflow does not clip non-replaced inline boxes. Client bounds exclude
      // borders/scrollbars and include padding, unlike the border-box DOMRect.
      if (!(p instanceof HTMLElement && ps.display==='inline')) {
        const sx=pr.width/(p.offsetWidth || p.clientWidth || pr.width || 1);
        const sy=pr.height/(p.offsetHeight || p.clientHeight || pr.height || 1);
        const left=pr.left+p.clientLeft*sx,top=pr.top+p.clientTop*sy;
        if (ps.overflowX!=='visible') visible={...visible,left:Math.max(visible.left,left),right:Math.min(visible.right,left+p.clientWidth*sx)};
        if (ps.overflowY!=='visible') visible={...visible,top:Math.max(visible.top,top),bottom:Math.min(visible.bottom,top+p.clientHeight*sy)};
      }
      if (p===frame) break;
    }
    return visible;
  };
  const opaqueEffects = el => {
    if (!el) return true;
    if (!effects.has(el)) {
      const s=style(el);
      effects.set(el,Number(s.opacity)===1 && s.filter==='none' && s.clipPath==='none' &&
        s.maskImage==='none' && s.mixBlendMode==='normal' && opaqueEffects(el.parentElement));
    }
    return effects.get(el);
  };
  const opaqueColor = value => {
    // Float16 canvas alpha rounds near-opaque colors up to 1. Read an explicit
    // computed alpha before using canvas normalization for opaque color syntax.
    if (value.startsWith('rgba(') || value.includes('/')) {
      const alpha=value.match(/(?:,|\/)\s*([\d.e+-]+)(%)?\s*\)$/i);
      return !!alpha && Number(alpha[1])===(alpha[2]?100:1);
    }
    return normalize(value)[3]===1;
  };
  const lines = [], covers = [];
  for (const el of [frame, ...frame.querySelectorAll('*')]) {
    const s = style(el), r = rectFor(el);
    if (['STYLE','SCRIPT'].includes(el.tagName.toUpperCase())) add('MARKUP_FORBIDDEN', `Forbidden <${el.tagName.toLowerCase()}> in output`);
    for (const attr of el.attributes) if (/^on/i.test(attr.name) || attr.name === 'classname') add('MARKUP_FORBIDDEN', `Forbidden attribute ${attr.name} in output`);
    if (!el.closest('[data-free]')) {
      const authored = (el.getAttribute('class') ?? '') + ' ' + (el.getAttribute('style') ?? '');
      if ([...authored.matchAll(/(-?(?:\d*\.)?\d+)px\b/g)].some(m => !Number.isInteger(Number(m[1])))) add('FRACTIONAL_LENGTH', 'Fractional pixel length outside data-free');
      for (const [,property] of (el.getAttribute('style') ?? '').matchAll(/(?:^|;)\s*([-\w]+)\s*:/g)) if (!['width','height'].includes(property) && !property.startsWith('--')) add('STYLE_FORBIDDEN', `Style ${property} outside data-free; use layout classes`);
    }
    if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const visibleBox=clipped(r,el.parentElement);
    if (nonempty(visibleBox) && outside(visibleBox)) add('FRAME_OVERFLOW', 'Content overflows the frame');
    // A border-box background has the same rounded hit shape as its element.
    // Other background clips/masks cannot establish rectangular opaque coverage.
    if (el instanceof HTMLElement && s.backgroundClip==='border-box' && opaqueColor(s.backgroundColor) && opaqueEffects(el)) {
      covers.push({el,rect:intersect(visibleBox,box)});
    }
    if (!el.closest('[data-brand]')) {
      const paints = [s.color, s.backgroundColor];
      for (const side of ['Top','Right','Bottom','Left']) if (parseFloat(s[`border${side}Width`]) > 0) paints.push(s[`border${side}Color`]);
      if (s.outlineStyle !== 'none') paints.push(s.outlineColor);
      if (el instanceof SVGElement && /^(path|rect|circle|ellipse|polygon|polyline|line|text)$/.test(el.localName)) paints.push(s.fill, s.stroke);
      paints.push(...((s.boxShadow+' '+s.textShadow+' '+s.backgroundImage).match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)/g) ?? []));
      for (const value of paints) {
        if (!value || value === 'none' || value.startsWith('url(')) continue;
        const paint = normalize(value), alpha = paint[3];
        if (alpha === 0) continue;
        const matches = colors.some(color => alpha < 1
          ? paint.slice(0, 3).every((channel, i) => Math.abs(channel - color[i]) <= 2)
          : paint.every((channel, i) => channel === color[i]));
        if (!matches) add('TOKEN_COLOR_MISMATCH', `Color ${value} matches no token`);
      }
    }
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1) continue;
        const label = node.textContent.trim().replace(/\s+/g, ' ');
        const visible=clipped(rect,el);
        if (!nonempty(visible)) continue;
        if (outside(visible)) add('TEXT_OUTSIDE_FRAME', `Text leaves frame: ${label}`);
        if (visible.left < r.left - 1 || visible.right > r.right + 1 ||
            (visible.top+visible.bottom)/2 < r.top - 1 || (visible.top+visible.bottom)/2 > r.bottom + 1) add('TEXT_OVERFLOW', `Text overflows its box: ${label}`);
        const inFrame=intersect(visible,box);
        if (nonempty(inFrame)) lines.push({rect:inFrame,label,el});
      }
    }
  }
  // Hit testing omits inert and pointer-events:none content, though it still paints.
  // Normalize only the text/cover nodes after validating authored styles, then
  // restore their exact attributes so inspection has no lasting DOM changes.
  const restored = [], inert = [];
  for (let el=frame;el;el=el.parentElement) if (el.hasAttribute('inert')) inert.push([el,el.getAttribute('inert')]);
  for (const el of frame.querySelectorAll('[inert]')) inert.push([el,el.getAttribute('inert')]);
  for (const [el] of inert) el.removeAttribute('inert');
  for (const el of new Set([...lines.map(line=>line.el),...covers.map(cover=>cover.el)])) {
    if (style(el).pointerEvents==='none') {
      restored.push([el,el.getAttribute('style')]);el.style.setProperty('pointer-events','auto','important');
    }
  }
  const hits = new Map();
  const paintStack = (x,y) => {
    const key=`${x},${y}`;
    if (!hits.has(key)) hits.set(key,document.elementsFromPoint(x,y));
    return hits.get(key);
  };
  const occluded = (el,rect) => {
    const dx=Math.min(.01,(rect.right-rect.left)/100),dy=Math.min(.01,(rect.bottom-rect.top)/100);
    const points=[[rect.left+dx,rect.top+dy],[rect.right-dx,rect.top+dy],
      [rect.left+dx,rect.bottom-dy],[rect.right-dx,rect.bottom-dy],[(rect.left+rect.right)/2,(rect.top+rect.bottom)/2]];
    return covers.some(cover => {
      if (cover.el.contains(el) || cover.rect.left>rect.left || cover.rect.right<rect.right ||
          cover.rect.top>rect.top || cover.rect.bottom<rect.bottom) return false;
      const samples=points.map(([x,y])=>{
        const stack=paintStack(x,y);return [stack.indexOf(el),stack.indexOf(cover.el)];
      });
      // The SAME convex background must hit every corner. Rounded controls can
      // omit their text owner at an edge, so establish paint order where both
      // elements hit; absence alone is never evidence that the text is behind.
      return samples.every(([subject,foreground])=>foreground>=0 && (subject<0 || foreground<subject)) &&
        samples.some(([subject,foreground])=>subject>=0 && foreground<subject);
    });
  };
  try {
    for (let i=0;i<lines.length;i++) for(let j=i+1;j<lines.length;j++) {
      const a=lines[i], b=lines[j];
      // Each Range belongs to a direct text node; an ancestor's own text and a
      // positioned child's text are distinct visible lines, not duplicate ranges.
      if (a.el===b.el) continue;
      const overlap=intersect(a.rect,b.rect);
      if (overlap.right-overlap.left>1 && overlap.bottom-overlap.top>2 &&
          !occluded(a.el,overlap) && !occluded(b.el,overlap)) add('TEXT_OVERLAP', `Text overlaps: ${a.label} / ${b.label}`);
    }
  } finally {
    for (const [el,authored] of restored) {
      // Flush a CSSOM-created attribute before removing it (Chromium creates it lazily).
      el.getAttribute('style');
      if (authored===null) el.removeAttribute('style');
      else el.setAttribute('style',authored);
    }
    for (const [el,authored] of inert) el.setAttribute('inert',authored);
  }
  return [...problems.values()];
}
export async function check(config, args = [], options = {}, log = console.log, error = console.error, { launchBrowser = launch, session } = {}) {
  if (options.impacted && !session) return withImpacted(config, args, options, 'check', selected =>
    check(config, args, options, log, error, { launchBrowser, session: selected }));
  const write = !options['read-only'];
  /** @type {import('./results.mjs').CheckData} */
  const data = { project: config.root, readOnly: !write, complete: false, impact: session?.selection ?? null, sources: [], summary: { sources: 0, frames: 0, evaluations: 0, problems: 0 }, findings: [] };
  const warnings = [], humanProblems = new Set(), findingKeys = new Set(), graph = {};
  let browser, primary;
  const add = (problem, file, frame = null, theme = null, source = relative(config, file)) => {
    const finding = { ...problem, source, frame, theme };
    const key = JSON.stringify(finding);
    if (!findingKeys.has(key)) { findingKeys.add(key); data.findings.push(finding); }
    humanProblems.add(`${relative(config, file)}: ${frame === null ? '' : `${frame}: ${theme}: `}${problem.message}`);
    data.summary.problems = data.findings.length;
  };
  const failed = cause => {
    const failure = cause instanceof CliError ? cause : new CliError('SOURCE_BUILD_FAILED', cause.message, { cause });
    if (!primary) primary = failure;
    else warnings.push(classifyError(failure).error);
  };
  try {
    const mapping = await loadImplementationMap(config);
    const files = session ? session.sources.map(source => path.join(config.root, source)).filter(existsSync) : selectSources(config, args, { write });
    data.sources = files.map(file => relative(config, file));
    data.summary.sources = files.length;
    const tokens = files.length ? loadTokens(config) : null;
    const arch = files.some(file => file.endsWith('.mmd')) ? await import('./arch.mjs') : null;
    let page;
    const builtSources = new Map(), failedSources = new Map();
    for (const file of files) {
      const architecture = file.endsWith('.mmd');
      if (architecture) {
        const side = file.replace(/\.mmd$/, '.md');
        const metadata = arch.sidecar(existsSync(side) ? readFileSync(side, 'utf8') : '');
        const validation = arch.inspectArch(readFileSync(file, 'utf8'), config.check?.archMaxEdges ?? 30).problems;
        const sidecarProblems = [...metadata.problems, ...arch.ownerProblems(config, metadata)];
        for (const problem of validation) add(problem, file);
        for (const problem of sidecarProblems) add(problem, file, null, null, relative(config, side));
        if (validation.length || sidecarProblems.length) continue;
      }
      let built;
      try {
        // Static architecture rejection is a completed rule evaluation and needs no browser.
        if (session && !architecture) built = session.views[1].built.get(relative(config, file));
        else if (session && !session.chosen.some(row => row.source === relative(config, file) && session.themes.some(theme => session.scheduled(row, theme)))) continue;
        else { browser ??= await launchBrowser(); built = await buildSource(config, file, { allowLegacy: false, write: session ? false : write, browser }); }
      } catch (cause) {
        const legacy = cause.errors?.find(item => item.detail?.code === 'LEGACY_SOURCE');
        if (legacy) throw legacy.detail;
        if (['PLAYWRIGHT_UNAVAILABLE', 'CHROMIUM_UNAVAILABLE', 'BROWSER_FAILED', 'LEGACY_SOURCE'].includes(cause.code)) throw cause;
        failed(cause);
        failedSources.set(relative(config, file), cause);
        for (const message of cause.message.split('\n')) humanProblems.add(`${relative(config, file)}: ${architecture ? '' : '-: '}${message.replace(/\s+/g, ' ')}`);
        continue;
      }
      data.summary.frames += built.frames.length;
      if (mapping.present && !architecture) builtSources.set(relative(config, file), mappingFacts(built));
      graph[path.relative(config.design, file).split(path.sep).join('/')] = { uses: built.imports };
      for (const frame of built.frames) for (const theme of session?.themes ?? ['light', 'dark']) {
        if (session && !session.scheduled({ source: relative(config, file), frame: frame.name }, theme)) continue;
        browser ??= await launchBrowser();
        try {
          page ??= await browserTask(browser, () => browser.newPage());
          await loadFrame(page, frame, theme);
          const findings = await browserTask(browser, () => page.evaluate(architecture ? arch.inspectArchLabels : inspectFrame, architecture ? undefined : [...tokens.light.keys()]));
          for (const finding of findings) add(finding, file, frame.name, theme);
          data.summary.evaluations++;
        } catch (cause) {
          failed(cause);
          humanProblems.add(`${relative(config, file)}: ${frame.name}: ${theme}: ${cause.message.replace(/\s+/g, ' ')}`);
        }
      }
    }
    if (mapping.present) {
      const { listSources } = await import('./project.mjs');
      await validateImplementationMap(config, mapping, {
        sources: listSources(config.design, sourceDirectories(config)).map(file => relative(config, file)),
        selected: args.length ? data.sources : undefined,
        getBuild: source => {
          if (failedSources.has(source)) throw failedSources.get(source);
          if (!builtSources.has(source)) builtSources.set(source, session?.views[1].built.get(source) ?? buildSource(config, path.join(config.root, source), { write: false, allowLegacy: false }));
          return builtSources.get(source);
        },
        onFinding: ({ code, message, line, column, frame }) => add({ code, message, line, column }, mapping.file, frame),
      });
    }
    await cleanup(() => browser?.close(), primary);
    browser = null;
    if (config.check?.importDirection !== false) for (const { source, target, from, to } of importDirectionViolations(graph, sourceDirectories(config))) {
      add({ code: 'IMPORT_DIRECTION', message: `import ${target} violates import direction (${from} -> ${to}); import from the same or a lower layer in sources`, line: null, column: null }, path.join(config.design, source));
    }
    for (const problem of humanProblems) error(problem);
    const message = `Design check ${humanProblems.size ? 'failed' : 'passed'} for ${files.length} sources${humanProblems.size ? `: ${humanProblems.size} problems` : ''}.`;
    log(message);
    if (!files.length) emptySelection(warnings);
    if (primary) { primary.humanReported = true; throw primary; }
    data.complete = true;
    if (data.findings.length) throw new CliError('CHECK_FAILED', message, { data, warnings, humanReported: true });
    return { data, warnings };
  } catch (cause) {
    primary = commandFailure(cause, data, warnings);
    throw primary;
  } finally { if (browser) await cleanup(() => browser.close(), primary); }
}

export async function render(config, args = [], options = {}, log = console.log, { launchBrowser = launch, session } = {}) {
  if (options.impacted && !session) return withImpacted(config, args, options, 'render', selected =>
    render(config, args, options, log, { launchBrowser, session: selected }));
  const output = options['out-dir'] ? path.resolve(config.root, options['out-dir']) : config.output;
  /** @type {import('./results.mjs').RenderData} */
  const data = { project: config.root, outputDirectory: output, complete: false, impact: session?.selection ?? null, base: null, captures: [], deleted: [] };
  const warnings = [], completed = [], failures = [];
  let browser, primary;
  try {
    const scale = Number(options.scale ?? 2);
    if (!(Number.isFinite(scale) && scale > 0)) throw new CliError('USAGE_INVALID', 'Invalid --scale; use a positive number');
    const themeOption = options.theme ?? 'both';
    if (!['both', 'light', 'dark'].includes(themeOption)) throw new CliError('USAGE_INVALID', 'Choose --theme=both, light, or dark.');
    if (options['out-dir'] === '') throw new CliError('USAGE_INVALID', 'Set --out-dir to a directory.');
    const themes = themeOption === 'both' ? ['light', 'dark'] : [themeOption];
    let base, additional = [];
    if (!session && options.base !== undefined && (!args.length || args.some(arg => arg.endsWith('.mmd')))) {
      const git = await import('./arch-git.mjs');
      base = await git.resolveBase(config, options.base);
      additional = await git.baseArchFiles(config, base);
      data.base = { rev: base.rev, sha: base.sha };
    } else if (!session && options.base !== undefined) warnings.push({ code: 'USAGE_INVALID', message: '--base applies only to architecture sources.', next: [] });
    if (session) data.base = { rev: session.selection.query.base.rev, sha: session.selection.query.base.sha };
    if (session) data.deleted = [...new Set(session.chosen.filter(row => row.status === 'removed').map(row => row.source))];
    const selected = session ? [...new Set(session.chosen.filter(row => row.after && themes.some(theme => session.scheduled(row, theme))).map(row => path.join(config.root, row.source)))] : selectSources(config, args, { additional });
    const currentArchitecture = base ? new Set(archFiles(config.arch)) : null;
    const files = selected.filter(file => {
      if (!existsSync(file) || (base && file.endsWith('.mmd') && !currentArchitecture.has(file))) { data.deleted.push(relative(config, file)); return false; }
      return true;
    });
    if (!selected.length && (!session || !session.selection.coverage.expectedRows)) emptySelection(warnings);
    if (files.length) browser = await launchBrowser();
    const captures = [];
    for (const file of files) {
      const built = session?.views[1].built.get(relative(config, file)) ?? (base && file.endsWith('.mmd') ? await (await import('./arch-overlay.mjs')).buildOverlay(config, file, { base, browser }) : await buildSource(config, file, { allowLegacy: false, write: !session, browser }));
      for (const frame of built.frames.filter(frame => !options.frame || frame.name === options.frame)) for (const theme of themes) {
        if (session && !session.scheduled({ source: relative(config, file), frame: frame.name }, theme)) continue;
        const outputSource = file.endsWith('.mmd') ? relative(config, file) : path.relative(config.design, file);
        const target = path.join(output, outputSource.replace(/\.(?:tsx|mmd)$/, ''), `${encodeURIComponent(frame.name)}-${theme}.png`);
        captures.push({ source: relative(config, file), frame, theme, target });
      }
    }
    if (!session && options.frame && !captures.length && !data.deleted.length) throw new CliError('FRAME_NOT_FOUND', `Unknown frame ${options.frame}; choose a declared frame`);
    let next = 0;
    await Promise.allSettled(Array.from({ length: Math.min(4, availableParallelism(), captures.length) }, async () => {
      while (next < captures.length) {
        const index = next++, { source, frame, theme, target } = captures[index];
        let page, failure;
        try {
          page = await browserTask(browser, () => browser.newPage({ deviceScaleFactor: scale }));
          await loadFrame(page, frame, theme);
          mkdirSync(path.dirname(target), { recursive: true });
          const { box, png } = await browserTask(browser, async () => {
            const element = page.locator('[data-adg-frame]');
            const box = await element.boundingBox();
            if (!box) throw Error('Frame has no visible bounds.');
            return { box, png: await element.screenshot({ path: target }) };
          });
          completed[index] = { source, frame: frame.name, theme, path: target, scale, width: box.width, height: box.height, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20) };
        } catch (cause) {
          failure = commandFailure(cause, data, warnings);
          failures.push({ index, failure });
          throw failure;
        } finally {
          if (page) try { await cleanup(() => page.close(), failure); }
          catch (cause) { failures.push({ index, failure: commandFailure(cause, data, warnings) }); throw cause; }
        }
      }
    }));
    data.captures = completed.filter(Boolean);
    failures.sort((a, b) => a.index - b.index);
    if (failures.length) {
      for (const { failure } of failures.slice(1)) warnings.push(classifyError(failure).error);
      throw failures[0].failure;
    }
    if (!options.json) for (const capture of data.captures) log(relative(config, capture.path));
    await cleanup(() => browser?.close(), null);
    browser = null;
    data.complete = true;
    return { data, warnings };
  } catch (cause) {
    data.captures = completed.filter(Boolean);
    primary = commandFailure(cause, data, warnings);
    throw primary;
  } finally { if (browser) await cleanup(() => browser.close(), primary); }
}
