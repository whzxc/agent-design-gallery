import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { parse as parseJs } from '@babel/parser';
import { generate, parse as parseCss, walk } from 'css-tree';
import { parseFragment } from 'parse5';
import scss from 'postcss-scss';
import { loadMotionPatterns, motionPatternFile } from './motion-patterns.mjs';
import { readMotion } from './motion.mjs';

const extension = /\.(?:[cm]?[jt]sx?|css|scss|vue|html?)$/i;
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
const possibleMotion = /animat|transition|keyframes|framer-motion|['"]motion(?:\/|['"])|spring|data-/i;
const keyframes = /^(?:-webkit-)?keyframes$/i;
const reducedTiming = (query, value) => /prefers-reduced-motion:\s*reduce/.test(query) &&
  /^(?:0(?:\.0+)?m?s|0?\.01ms)$/.test(value);

function codeFiles(config) {
  try {
    const output = execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard','--','.'],
      { cwd: config.root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
    return [...new Set(output.split('\0').filter(codeFile))].sort();
  } catch {
    const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (entry.name.startsWith('.') || excluded.has(entry.name)) return [];
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? visit(full) : [sourcePath(config, full)];
    });
    return visit(config.root).filter(codeFile).sort();
  }
}

function scanCss(source, record, problem, firstLine = 1, context, location) {
  const errors = [];
  const ast = parseCss(source, { context: context ?? 'stylesheet', positions: true,
    onParseError: error => errors.push(error) });
  if (errors.length && !context) {
    // The CSS grammar can reject valid nesting or tool directives. PostCSS
    // reads those rules without interpreting their selectors or at-rule preludes.
    try { scanStylesheet(source, record, firstLine, location); return; }
    catch { /* Use the recovered CSS tree and report the incomplete parse. */ }
  }
  for (const error of errors) problem(error.message, firstLine + error.line - 1);
  const lineOf = node => firstLine + node.loc.start.line - 1;
  const seen = new Set();
  walk(ast, {
    enter(node) {
      if (node.type === 'Atrule' && keyframes.test(node.name) && node.prelude)
        record('keyframes:' + generate(node.prelude), lineOf(node), location);
      if (node.type !== 'Declaration' || !cssMotion.test(node.property) || none.test(generate(node.value))) return;
      if (this.atrule?.name === 'media' && reducedTiming(generate(this.atrule.prelude), generate(node.value))) return;
      const selector = this.rule?.prelude ? generate(this.rule.prelude) : null;
      const name = node.property.replace(/^-webkit-/i, '').toLowerCase().split('-')[0];
      const match = selector ? 'css:' + selector : 'style:' + name;
      const line = this.rule ? lineOf(this.rule) : lineOf(node);
      const id = JSON.stringify([match, this.rule?.loc.start.offset ?? node.loc.start.offset]);
      if (!seen.has(id)) { seen.add(id); record(match, line, location); }
    },
  });
}

function scanStylesheet(source, record, firstLine = 1, location) {
  const ast = scss.parse(source);
  const lineOf = node => firstLine + node.source.start.line - 1;
  const seen = new Set();
  ast.walk(node => {
    if (node.type === 'atrule' && keyframes.test(node.name) && node.params)
      record('keyframes:' + node.params, lineOf(node), location);
    if (node.type !== 'decl' || !cssMotion.test(node.prop) || none.test(node.value)) return;
    let rule;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media' && reducedTiming(parent.params, node.value)) return;
      if (parent.type === 'rule') rule ??= parent;
    }
    const site = rule ?? node;
    if (seen.has(site)) return;
    seen.add(site);
    let selector = rule?.selector;
    if (selector) try { selector = generate(parseCss(selector, { context: 'selectorList' })); }
    catch { /* Keep authored Sass syntax such as interpolated selectors. */ }
    record(selector ? 'css:' + selector : 'style:' + node.prop, lineOf(site), location);
  });
}

const functionNode = /^(?:Function(?:Declaration|Expression)|ArrowFunctionExpression|(?:Object|Class)Method)$/;
const member = node => ['MemberExpression','OptionalMemberExpression'].includes(node?.type);
const property = node => !node.computed || node.property.type === 'StringLiteral' ? keyName(node.property) : null;
const animationFrame = node => node?.type === 'Identifier' && node.name === 'requestAnimationFrame' ||
  member(node) && property(node) === 'requestAnimationFrame' && ['window','globalThis','self'].includes(keyName(node.object));
const callbackNode = init => init?.type === 'CallExpression' &&
  (keyName(init.callee) === 'useCallback' || member(init.callee) && property(init.callee) === 'useCallback')
  ? init.arguments[0] : init;

function scanJs(source, lang, record, problem, firstLine = 1) {
  const ts = /[cm]?tsx?$/.test(lang);
  const plugins = [...(ts ? ['typescript'] : []), ...(!ts || lang === 'tsx' ? ['jsx'] : [])], bindings = new Map();
  const { program, errors } = parseJs(source, { sourceType: 'unambiguous', plugins, errorRecovery: true, startLine: firstLine });
  for (const error of errors) problem(error.message, error.loc?.line);
  for (const node of program.body) if (node.type === 'ImportDeclaration' && importsFromMotion.test(node.source.value)) {
    for (const specifier of node.specifiers) bindings.set(specifier.local.name,
      specifier.type === 'ImportNamespaceSpecifier' ? '*' : keyName(specifier.imported) ?? 'motion');
  }
  const binding = node => {
    if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return bindings.get(node.name);
    if (bindings.get(keyName(node?.object)) === '*') {
      if (member(node)) return property(node);
      if (node.type === 'JSXMemberExpression') return keyName(node.property);
    }
  };
  const motionTag = node => {
    if (['motion','m','Reorder'].includes(binding(node))) return true;
    return node?.type === 'JSXMemberExpression' && motionTag(node.object);
  };
  const frameCalls = [];
  function visit(node, scopes = [], inMotion = false, inStyle = false, lexical = null, active = null) {
    if (typeof node?.type !== 'string') return;
    const scope = /^(?:FunctionDeclaration|ClassDeclaration|VariableDeclarator|ObjectMethod|ClassMethod)$/.test(node.type)
      ? keyName(node.id ?? node.key) : null;
    if (typeof scope === 'string') scopes = [...scopes, scope];
    const { start: { line } } = node.loc;
    const add = match => record(match, line, scopes);
    if (node.type === 'FunctionDeclaration' && node.id) lexical.names.set(node.id.name, node);
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      const callback = callbackNode(node.init);
      lexical.names.set(node.id.name, functionNode.test(callback?.type) ? callback : null);
    }
    if (node.type === 'BlockStatement' || node.type === 'Program' || functionNode.test(node.type)) {
      lexical = { parent: lexical, names: new Map() };
      if (functionNode.test(node.type)) {
        active = node;
        if (node.id) lexical.names.set(node.id.name, node);
        for (const param of node.params) if (param.type === 'Identifier') lexical.names.set(param.name, null);
      }
    }
    if (node.type === 'JSXOpeningElement') {
      if (binding(node.name) === 'AnimatePresence') add('motion:AnimatePresence');
      for (const attr of node.attributes) {
        const name = keyName(attr.name);
        if (motionTag(node.name) && jsxMotion.has(name) && attr.value?.expression?.value !== false)
          record('motion:' + name, attr.loc.start.line, scopes);
        if (typeof name === 'string' && name.startsWith('data-')) record('attribute:' + name, attr.loc.start.line, scopes, false);
        if (name === 'style' && typeof attr.value?.value === 'string')
          scanCss(attr.value.value, record, problem, attr.loc.start.line, 'declarationList', scopes);
      }
      inMotion ||= motionTag(node.name);
    }
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const name = binding(node.callee);
      if (motionExports.has(name) && name !== 'AnimatePresence') add('motion:' + name);
      if (member(node.callee)) {
        const method = property(node.callee);
        if (method === 'animate' && name !== 'animate') add('web:animate');
        if (method === 'spring') record('call:spring', line, scopes, false);
      }
      if (animationFrame(node.callee) && node.arguments[0]?.type === 'Identifier')
        frameCalls.push({ name: node.arguments[0].name, lexical, active, line, scopes });
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
      let template = node.quasis[0].value.raw;
      for (const [index, part] of node.quasis.slice(1).entries())
        template += 'var(--dynamic)' + '\n'.repeat(part.loc.start.line - node.quasis[index].loc.end.line) + part.value.raw;
      if (/<style\b/i.test(template)) {
        scanMarkup(template, false, (match, at, within = [], required) =>
          record(match, line + at - 1, [...scopes, ...within], required),
          (message, at) => problem(message, at ? line + at - 1 : line), { interpolated: node.expressions.length > 0 });
      } else if (/@(?:-webkit-)?keyframes\s|\b(?:animation|transition)\s*[-:]/i.test(template) && template.includes('{'))
        scanCss(template, record, problem, line, undefined, scopes);
    }
    inStyle ||= node.type === 'JSXAttribute' && keyName(node.name) === 'style';
    for (const [key, child] of Object.entries(node)) {
      if (['loc','comments','tokens','errors','leadingComments','trailingComments','innerComments'].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(item => visit(item, scopes, inMotion, inStyle, lexical, active));
      else visit(child, scopes, inMotion, inStyle, lexical, active);
    }
  }
  visit(program);
  for (const call of frameCalls) {
    for (let scope = call.lexical; scope; scope = scope.parent) {
      if (!scope.names.has(call.name)) continue;
      call.callback = scope.names.get(call.name);
      break;
    }
  }
  const loops = new Set(frameCalls.filter(call => call.callback && call.callback === call.active).map(call => call.callback));
  for (const {callback, line, scopes} of frameCalls)
    if (loops.has(callback)) record('web:requestAnimationFrame', line, scopes);
}

function scanMarkup(source, vue, record, problem, { interpolated = false } = {}) {
  const tree = parseFragment(source, { sourceCodeLocationInfo: true });
  function visit(node) {
    const tag = node.tagName;
    const at = node.sourceCodeLocation;
    const attr = name => node.attrs?.find(entry => entry.name === name)?.value;
    if (vue && attr('v-pre') !== undefined) return;
    if (vue && at && /^(?:transition|transition-?group)$/.test(tag)) {
      const component = tag === 'transition' ? 'Transition' : 'TransitionGroup';
      record('vue:' + component + (attr('name') ? ':' + attr('name') : ''), at.startLine);
    }
    if (at?.startTag && (tag === 'style' || (tag === 'script' && attr('src') === undefined))) {
      if (!at.endTag) {
        problem('Unclosed <' + tag + '> block.', at.startLine);
        return;
      }
      const body = source.slice(at.startTag.endOffset, at.endTag.startOffset);
      const firstLine = at.startTag.endLine;
      const lang = attr('lang')?.toLowerCase();
      const type = attr('type')?.toLowerCase();
      if (tag === 'style') {
        // An HTML template can insert entire external stylesheets. Audit the
        // authored CSS here and let file discovery scan those stylesheets.
        if (interpolated && !possibleMotion.test(body)) return;
        if (lang === 'scss') {
          try { scanStylesheet(body, record, firstLine); }
          catch (error) { problem(error.reason ?? error.message, firstLine + (error.line ?? 1) - 1); }
        }
        else if ((!lang || lang === 'css') && (!type || type === 'text/css')) scanCss(body, record, problem, firstLine);
        else problem('Unsupported style syntax: ' + (lang ?? type) + '.', at.startLine);
      } else if (lang && !/^(?:[cm]?[jt]sx?)$/.test(lang)) {
        problem('Unsupported script syntax: ' + lang + '.', at.startLine);
      } else if (possibleMotion.test(body) && (!type || /^(?:module|(?:text|application)\/(?:java|ecma)script)$/.test(type))) {
        scanJs(body, lang ?? 'js', record, problem, firstLine);
      }
    }
    const inline = attr('style');
    if (inline && possibleMotion.test(inline))
      scanCss(inline, record, problem, at.attrs?.style?.startLine ?? at.startLine, 'declarationList');
    for (const child of node.content?.childNodes ?? node.childNodes ?? []) visit(child);
  }
  visit(tree);
}

export function scanMotion(config, catalog = loadMotionPatterns(config), graph = readMotion(config), { mappedOnly = false } = {}) {
  const declaration = sourcePath(config, path.join(config.design, motionPatternFile));
  const consumers = new Map([...catalog.patterns.keys()].map(id => [id, []]));
  const issues = [], ignored = [];
  const issue = (code, source, message, line = null) => issues.push({ code, source, message, line, column: null });
  const mappings = new Map();
  const exclusions = new Map();
  for (const ref of catalog.ignore ?? []) {
    if (!exclusions.has(ref.file)) exclusions.set(ref.file, []);
    exclusions.get(ref.file).push(ref);
  }
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
    const sites = new Map();
    const record = (match, line, within = [], required = true) => {
      const key = JSON.stringify([match, line, within]);
      if (!sites.has(key) || required) sites.set(key, { match, line, within, required });
    };
    let failed = false;
    const problem = (message, line = null) => {
      if (!failed && !mappedOnly) issue('MOTION_SCAN_FAILED', name, 'Could not fully scan source: ' + message.split('\n')[0], line);
      failed = true;
    };
    try {
      const info = lstatSync(full);
      if (!info.isFile() || realpathSync(full) !== full) {
        problem('Expected a regular file without symlinks.');
        continue;
      }
      const source = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(full));
      const lang = path.extname(name).slice(1).toLowerCase();
      if (['vue','html','htm'].includes(lang)) scanMarkup(source, lang === 'vue', record, problem);
      else if (possibleMotion.test(source)) {
        if (lang === 'css') scanCss(source, record, problem);
        else if (lang === 'scss') scanStylesheet(source, record);
        else scanJs(source, lang, record, problem);
      }
    } catch (error) {
      problem(error.reason ?? error.message, error.line ?? error.loc?.line);
    }
    const refs = mappings.get(name) ?? [];
    for (const { match, line, within, required } of sites.values()) {
      const matches = ref => ref.match === match && (!ref.within || within.includes(ref.within));
      const hits = refs.filter(matches);
      if (!hits.length && required) {
        const exclusion = exclusions.get(name)?.find(matches);
        if (exclusion) {
          ignored.push({ source: name, line, match, ...(exclusion.within && { within: exclusion.within }), reason: exclusion.reason });
          continue;
        }
        unmapped++;
        if (!mappedOnly) issues.push({ code: 'MOTION_UNMAPPED', source: name, line, column: null,
          message: 'Map ' + match + (within.length ? ' within ' + within.at(-1) : '') + ' to a motion pattern.',
          match, ...(within.length && { within: within.at(-1) }) });
      }
      if (required || hits.length) animations++;
      for (const ref of hits) ref.hits++;
      for (const id of new Set(hits.map(ref => ref.id))) consumers.get(id).push({ type: 'code', source: name, line, match });
    }
  }
  for (const [file, refs] of mappings) for (const ref of refs) if (!ref.hits)
    issue('MOTION_CONSUMER_MISSING', declaration, ref.id + ' consumer did not match ' + file + ' (' + ref.match + ').');
  for (const id of catalog.declared) if (!consumers.get(id).length &&
    !catalog.variants.get(id)?.some(variant => consumers.get(variant).length)) {
    unused++;
    issue('MOTION_UNUSED', declaration, 'Pattern ' + id + ' has no consumers.');
  }
  return { consumers, issues, animations, unmapped, unused, ignored };
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
