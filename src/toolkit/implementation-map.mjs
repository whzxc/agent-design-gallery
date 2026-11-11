import { readFile, realpath, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { portablePath, globPattern, resolveLocator, symbolRegions } from './owner-locators.mjs';
import { mappingFacts } from './source-facts.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const nonempty = value => typeof value === 'string' && !!value.trim();
const missing = error => ['ENOENT', 'ENOTDIR'].includes(error.code);
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
const rel = (config, file) => path.relative(config.root, file).split(path.sep).join('/');
const invalid = message => { throw new CliError('OWNER_MAP_INVALID', message); };

export function parseImplementationMap(text) {
  let value;
  try { value = JSON.parse(text); } catch { invalid('Invalid implementation.json JSON; repair the mapping file.'); }
  if (!keys(value, ['version', 'mappings']) || value.version !== 1 || !Array.isArray(value.mappings)) invalid('implementation.json needs version 1 and a mappings array.');
  value.mappings.forEach((mapping, index) => {
    const pointer = `/mappings/${index}`, fail = reason => invalid(`${pointer}: ${reason}`);
    if (!keys(mapping, ['implementation', 'design']) || !Array.isArray(mapping.design) || !mapping.design.length) fail('use an implementation selector and nonempty design bindings.');
    const s = mapping.implementation;
    if (!object(s) || ['file', 'directory', 'glob'].filter(key => Object.hasOwn(s, key)).length !== 1) fail('choose exactly one file, directory or glob selector.');
    const kind = ['file', 'directory', 'glob'].find(key => Object.hasOwn(s, key));
    if (!keys(s, kind === 'file' ? ['file', 'symbol', 'anchor'] : [kind]) || !portablePath(s[kind], { directory: kind === 'directory', glob: kind === 'glob' })) fail('use a portable project-relative selector; glob supports *, ? and whole-segment **.');
    if (s.symbol !== undefined && !nonempty(s.symbol)) fail('symbol must be a nonempty exact label.');
    if (s.anchor !== undefined && (!nonempty(s.anchor) || !s.symbol)) fail('a nonempty anchor requires a symbol.');
    if (s.symbol && !/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(s.file) && s.anchor === undefined) fail('this file type requires an explicit symbol anchor.');
    for (const target of mapping.design) {
      if (!keys(target, ['source', 'part', 'frames']) || !portablePath(target.source) || !target.source.endsWith('.tsx') ||
        target.part !== undefined && !nonempty(target.part) || target.frames !== undefined && (!Array.isArray(target.frames) || !target.frames.length || target.frames.some(frame => !nonempty(frame)))) fail('use a TSX source, optional part and nonempty exact frame list.');
    }
  });
  return value;
}

export async function loadImplementationMap(config) {
  const file = path.join(config.design, 'implementation.json');
  let text;
  try { text = await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return { file, source: rel(config, file), present: false, mappings: [] }; throw error; }
  if (!inside(await realpath(config.root), await realpath(file))) invalid('implementation.json resolves outside the project.');
  return { ...parseImplementationMap(text), file, source: rel(config, file), present: true };
}

/** Expands only the selector prefix; escaping symlinks are rejected, not followed. */
export async function implementationFiles(config, selector) {
  const root = await realpath(config.root);
  const output = path.resolve(root, path.relative(config.root, config.output ?? path.join(config.root, 'output/design')));
  const excluded = file => path.relative(root, file).split(path.sep).some(p => ['.git', 'node_modules', '.adg'].includes(p)) || inside(output, file);
  const check = async file => {
    if (!inside(root, await realpath(file))) invalid(`Implementation selector resolves outside the project: ${rel(config, file)}.`);
    return stat(file);
  };
  if (selector.file) {
    const file = path.join(root, selector.file);
    try { return (await check(file)).isFile() ? [selector.file] : []; } catch (error) { if (missing(error)) return []; throw error; }
  }
  const pattern = selector.glob && globPattern(selector.glob);
  const segments = selector.glob?.split('/') ?? [];
  const wildcard = segments.findIndex(segment => /[?*]/.test(segment));
  const prefix = selector.directory ?? segments.slice(0, wildcard < 0 ? -1 : wildcard).join('/');
  const base = path.join(root, prefix), files = [], seen = new Set();
  async function visit(file) {
    if (excluded(file)) return;
    const physical = await realpath(file), info = await check(file);
    if (info.isDirectory()) {
      if (seen.has(physical)) return;
      seen.add(physical);
      for (const entry of await readdir(file)) await visit(path.join(file, entry));
    } else if (info.isFile()) {
      const name = path.relative(root, file).split(path.sep).join('/');
      if (!pattern || pattern.test(name)) files.push(name);
    }
  }
  try {
    if (selector.directory && !(await check(base)).isDirectory()) return [];
    await visit(base);
  } catch (error) { if (!missing(error)) throw error; }
  return files.sort();
}

export async function validateImplementationMap(config, map, { sources, selected, getBuild, onFinding = () => {} }) {
  const findings = [], bindings = [], regions = {}, seen = new Set(), builds = new Map(), contents = new Map();
  const sourceSet = new Set(sources), scope = selected && new Set(selected);
  const report = (code, pointer, selector, target, message, candidates = [], frame = null) => {
    const finding = { code, source: map.source, pointer, implementation: selector.file ?? selector.directory ?? selector.glob,
      target, line: null, column: null, frame, theme: null, message: `${pointer}: ${message}`, observedAnchorLines: candidates };
    findings.push(finding); onFinding(finding);
  };
  for (const [index, mapping] of map.mappings.entries()) {
    const targets = mapping.design.map((target, i) => ({ target, pointer: `/mappings/${index}/design/${i}` })).filter(({ target }) => !scope || scope.has(target.source));
    if (!targets.length) continue;
    const selector = mapping.implementation, pointer = `/mappings/${index}/implementation`, files = await implementationFiles(config, selector);
    let locator = { line: null, candidates: [], stale: false };
    if (!files.length) report('OWNER_IMPLEMENTATION_MISSING', pointer, selector, null, 'Selector matches no current implementation file.');
    else if (selector.symbol) {
      if (!contents.has(selector.file)) contents.set(selector.file, await readFile(path.join(config.root, selector.file), 'utf8'));
      locator = resolveLocator(contents.get(selector.file), selector);
      if (locator.stale) report('OWNER_LOCATOR_STALE', pointer, selector, null, 'Symbol must resolve exactly once; add or repair an explicit anchor.', locator.candidates);
    }
    for (const { target, pointer: targetPointer } of targets) {
      let valid = files.length > 0 && !locator.stale, frames = [];
      const duplicate = JSON.stringify([Object.fromEntries(Object.entries(selector).sort()), { source: target.source, part: target.part ?? null, frames: target.frames ? [...target.frames].sort() : null }]);
      if (seen.has(duplicate)) { report('OWNER_MAPPING_DUPLICATE', targetPointer, selector, target, 'Duplicate implementation/design binding.'); continue; }
      seen.add(duplicate);
      if (!sourceSet.has(target.source)) { report('OWNER_SOURCE_MISSING', targetPointer, selector, target, `Undiscovered source ${target.source}.`); valid = false; }
      else {
        if (!builds.has(target.source)) builds.set(target.source, Promise.resolve(getBuild(target.source)).then(mappingFacts));
        const built = await builds.get(target.source);
        if (target.part && !(built.parts ?? []).includes(target.part)) { report('OWNER_PART_MISSING', targetPointer, selector, target, `Missing design component ${target.part}.`); valid = false; }
        frames = built.frames.filter(frame => !target.frames || target.frames.includes(frame.name));
        for (const name of target.frames ?? []) if (!built.frames.some(frame => frame.name === name)) { report('OWNER_FRAME_MISSING', targetPointer, selector, target, `Missing frame ${name}.`, [], name); valid = false; }
        if (target.part && (built.parts ?? []).includes(target.part)) {
          const matches = frame => frame.owners.some(owner => rel(config, path.join(config.design, owner.source)) === target.source && owner.export === target.part);
          if (target.frames) for (const frame of frames) if (!matches(frame)) { report('OWNER_PART_FRAME_MISMATCH', targetPointer, selector, target, `Explicit frame ${frame.name} does not contain ${target.part}.`, [], frame.name); valid = false; }
          frames = frames.filter(matches);
        }
      }
      bindings.push({ pointer: targetPointer, implementation: selector, design: target, files, anchorLine: locator.line, frames: frames.map(frame => frame.name), active: valid });
    }
  }
  for (const [file, text] of contents) regions[file] = symbolRegions(text, file, map.mappings.map(m => m.implementation).filter(s => s.file === file));
  return { findings, bindings, regions };
}
