import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { parse as parseJs } from '@babel/parser';
import { generate, parse as parseCss, walk } from 'css-tree';
import { CliError } from '../cli-output.mjs';
import { loadMotionPatterns, motionPatternFile } from './motion-patterns.mjs';
import { readMotion } from './motion.mjs';

const extension = /\.(?:[cm]?[jt]sx?|css)$/;
const excluded = new Set(['node_modules','vendor','dist','build','out','coverage','output','test','tests','__tests__']);
const codeFile = name => extension.test(name) && !/\.(?:d\.ts|(?:spec|test)\.[cm]?[jt]sx?)$/.test(name) &&
  !name.split('/').some(part => part.startsWith('.') || excluded.has(part));
const sourcePath = (config, name) => path.relative(config.root, name).split(path.sep).join('/');
const keyName = node => node?.name ?? node?.value;
const none = /^(?:none|initial|unset|inherit|revert(?:-layer)?|0(?:m?s)?)(?:\s*!important)?$/i;
const cssMotion = /^(?:-webkit-)?(?:animation|transition)(?:-[a-z-]+)?$/i;
const jsxMotion = new Set(['layout','layoutId','animate','whileHover','whileTap','whileDrag','whileFocus','whileInView','exit','variants']);
const importsFromMotion = /^(?:motion(?:\/(?:react(?:-client)?|mini))?|framer-motion)$/;
const motionExports = new Set(['AnimatePresence','animate','useAnimate','useSpring','spring']);

function codeFiles(config) {
  try {
    const output = execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard','--','.'],
      { cwd: config.root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
    return [...new Set(output.split('\0').filter(codeFile))].sort();
  } catch {
    const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (entry.name.startsWith('.') || excluded.has(entry.name)) return [];
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? visit(full) : entry.isFile() ? [sourcePath(config, full)] : [];
    });
    return visit(config.root).filter(codeFile).sort();
  }
}

function scanCss(source, record, firstLine = 1, context, location) {
  const ast = parseCss(source, { context: context ?? 'stylesheet', positions: true });
  const lineOf = node => firstLine + node.loc.start.line - 1;
  const seen = new Set();
  walk(ast, {
    enter(node) {
      if (node.type === 'Atrule' && /^(?:-webkit-)?keyframes$/i.test(node.name) && node.prelude)
        record('keyframes:' + generate(node.prelude), lineOf(node), location);
      if (node.type !== 'Declaration' || !cssMotion.test(node.property) || none.test(generate(node.value))) return;
      if (this.atrule?.name === 'media' && /prefers-reduced-motion:reduce/.test(generate(this.atrule.prelude)) &&
          /^(?:0(?:\.0+)?m?s|0?\.01ms)$/.test(generate(node.value))) return;
      const selector = this.rule?.prelude ? generate(this.rule.prelude) : null;
      const name = node.property.replace(/^-webkit-/i, '').toLowerCase().split('-')[0];
      const match = selector ? 'css:' + selector : 'style:' + name;
      const line = this.rule ? lineOf(this.rule) : lineOf(node);
      const id = JSON.stringify([match, this.rule?.loc.start.offset ?? node.loc.start.offset]);
      if (!seen.has(id)) { seen.add(id); record(match, line, location); }
    },
  });
}

function scanJs(source, file, record) {
  const extension = path.extname(file);
  const ts = /[cm]?tsx?$/.test(extension);
  const plugins = [...(ts ? ['typescript'] : []), ...(!ts || extension === '.tsx' ? ['jsx'] : [])], bindings = new Map();
  const { program } = parseJs(source, { sourceType: 'unambiguous', plugins, errorRecovery: true });
  for (const node of program.body) if (node.type === 'ImportDeclaration' && importsFromMotion.test(node.source.value)) {
    for (const specifier of node.specifiers) bindings.set(specifier.local.name,
      specifier.type === 'ImportNamespaceSpecifier' ? '*' : keyName(specifier.imported) ?? 'motion');
  }
  const binding = node => {
    if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return bindings.get(node.name);
    if (['MemberExpression','JSXMemberExpression'].includes(node?.type) &&
        bindings.get(keyName(node.object)) === '*') return keyName(node.property);
  };
  const motionTag = node => {
    if (['motion','m','Reorder'].includes(binding(node))) return true;
    return node?.type === 'JSXMemberExpression' && motionTag(node.object);
  };
  function visit(node, scopes = [], inMotion = false, inStyle = false) {
    if (typeof node?.type !== 'string') return;
    const scope = /^(?:FunctionDeclaration|ClassDeclaration|VariableDeclarator|ObjectMethod|ClassMethod)$/.test(node.type)
      ? keyName(node.id ?? node.key) : null;
    if (typeof scope === 'string') scopes = [...scopes, scope];
    const { start: { line } } = node.loc;
    const add = match => record(match, line, scopes);
    if (node.type === 'JSXOpeningElement') {
      if (binding(node.name) === 'AnimatePresence') add('motion:AnimatePresence');
      for (const attr of node.attributes) {
        const name = keyName(attr.name);
        if (motionTag(node.name) && jsxMotion.has(name) && attr.value?.expression?.value !== false)
          record('motion:' + name, attr.loc.start.line, scopes);
        if (typeof name === 'string' && name.startsWith('data-')) record('attribute:' + name, attr.loc.start.line, scopes, false);
        if (name === 'style' && typeof attr.value?.value === 'string') scanCss(attr.value.value, record, attr.loc.start.line, 'declarationList', scopes);
      }
      inMotion ||= motionTag(node.name);
    }
    if (node.type === 'CallExpression') {
      const name = binding(node.callee);
      if (motionExports.has(name) && name !== 'AnimatePresence') add('motion:' + name);
      if (node.callee.type === 'MemberExpression') {
        const method = keyName(node.callee.property);
        if (method === 'animate') record('web:animate', line, scopes, false);
        if (method === 'spring') record('call:spring', line, scopes, false);
      }
      inMotion ||= motionExports.has(name);
    }
    if (node.type === 'ObjectProperty') {
      const name = keyName(node.key), value = node.value;
      if (name === 'type' && value?.value === 'spring') record('motion:spring', line, scopes, inMotion || (bindings.size > 0 && scopes.some(name => /spring|transition/i.test(name))));
      if (typeof name === 'string' && cssMotion.test(name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())) &&
          (typeof value?.value === 'string' ? !none.test(value.value) : inStyle || value?.type === 'TemplateLiteral'))
        add('style:' + name);
    }
    if (node.type === 'TemplateLiteral') {
      const css = node.quasis.map(part => part.value.raw).join('var(--dynamic)');
      if (/@(?:-webkit-)?keyframes\s|\b(?:animation|transition)\s*[-:]/i.test(css) && css.includes('{'))
        scanCss(css, record, line, undefined, scopes);
    }
    inStyle ||= node.type === 'JSXAttribute' && keyName(node.name) === 'style';
    for (const [key, child] of Object.entries(node)) {
      if (['loc','comments','tokens','errors','leadingComments','trailingComments','innerComments'].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(item => visit(item, scopes, inMotion, inStyle));
      else visit(child, scopes, inMotion, inStyle);
    }
  }
  visit(program);
}

export function scanMotion(config, catalog = loadMotionPatterns(config), graph = readMotion(config), { mappedOnly = false } = {}) {
  const declaration = sourcePath(config, path.join(config.design, motionPatternFile));
  const consumers = new Map([...catalog.patterns.keys()].map(id => [id, []]));
  const issues = [];
  const issue = (code, source, message, line = null) => issues.push({ code, source, message, line, column: null });
  const mappings = new Map();
  for (const [id, pattern] of catalog.patterns) {
    for (const frame of pattern.frames ?? []) {
      const file = path.join(config.root, frame.source);
      if (file.startsWith(config.design + path.sep) && existsSync(file)) consumers.get(id).push({ type: 'frame', ...frame });
      else issue('MOTION_CONSUMER_MISSING', declaration, id + ' frame source does not exist in the design directory: ' + frame.source + '.');
    }
    for (const ref of pattern.consumers ?? []) {
      if (!mappings.has(ref.file)) mappings.set(ref.file, []);
      mappings.get(ref.file).push({ ...ref, id, hits: 0 });
    }
  }
  for (const record of graph.records) {
    if (!record.valid || !record.pattern) continue;
    consumers.get(record.pattern.id)?.push({ type: 'edge', id: record.edge.id, ...record.edge.from,
      sidecar: record.source, line: record.locations[record.pointer + '/pattern']?.line ?? record.locations[record.pointer]?.line ?? 1 });
  }
  // Check never follows symlinks or scans ignored/untracked dependencies.
  const root = realpathSync(config.root);
  let animations = 0, unmapped = 0, unused = 0;
  for (const name of mappedOnly ? [...mappings.keys()].filter(codeFile).sort() : codeFiles(config)) {
    if (name === sourcePath(config, path.join(config.design, 'tokens.css'))) continue;
    const full = path.join(root, name);
    try {
      if (!lstatSync(full, { throwIfNoEntry: false })?.isFile() || realpathSync(full) !== full) continue;
      const source = readFileSync(full, 'utf8');
      if (!/animat|transition|keyframes|framer-motion|['"]motion(?:\/|['"])|spring|data-/i.test(source)) continue;
      const refs = mappings.get(name) ?? [];
      const sites = new Map();
      const record = (match, line, within = [], required = true) => {
        const key = JSON.stringify([match, line, within]);
        if (!sites.has(key) || required) sites.set(key, { match, line, within, required });
      };
      if (name.endsWith('.css')) scanCss(source, record);
      else scanJs(source, name, record);
      for (const { match, line, within, required } of sites.values()) {
        const hits = refs.filter(ref => ref.match === match && (!ref.within || within.includes(ref.within)));
        if (required || hits.length) animations++;
        if (!hits.length && required) {
          unmapped++;
          if (!mappedOnly) issue('MOTION_UNMAPPED', name, 'Map ' + match + (within.length ? ' within ' + within.at(-1) : '') + ' to a motion pattern.', line);
        }
        for (const ref of hits) ref.hits++;
        for (const id of new Set(hits.map(ref => ref.id))) consumers.get(id).push({ type: 'code', source: name, line, match });
      }
    } catch (error) {
      if (!mappedOnly) issue('MOTION_SCAN_FAILED', name, 'Could not scan source: ' + error.message.split('\n')[0]);
    }
  }
  for (const [file, refs] of mappings) for (const ref of refs) if (!ref.hits)
    issue('MOTION_CONSUMER_MISSING', declaration, ref.id + ' consumer did not match ' + file + ' (' + ref.match + ').');
  for (const id of catalog.declared) if (!consumers.get(id).length &&
    !catalog.variants.get(id)?.some(variant => consumers.get(variant).length)) {
    unused++;
    issue('MOTION_UNUSED', declaration, 'Pattern ' + id + ' has no consumers.');
  }
  return { consumers, issues, animations, unmapped, unused };
}

export function motionCodeExcerpt(config, catalog, source, line) {
  if (!source || !Number.isSafeInteger(line) || line < 1) return null;
  const isEdge = source.endsWith('.motion.json');
  const graph = isEdge ? readMotion(config) : { records: [] };
  const linked = [...scanMotion(config, catalog, graph, { mappedOnly: true }).consumers.values()].flat();
  if (!linked.some(ref => ref.line === line && (isEdge ? ref.type === 'edge' && ref.sidecar === source :
    ref.type === 'code' && ref.source === source))) return null;
  const full = path.join(realpathSync(config.root), source);
  if (realpathSync(full) !== full) return null;
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  return lines.slice(Math.max(0, line - 4), line + 3).map((text, index) =>
    [Math.max(1, line - 3) + index, text.slice(0, 500)]);
}
