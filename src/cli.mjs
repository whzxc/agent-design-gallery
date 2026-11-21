#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { VERSION, loadConfig } from './toolkit/config.mjs';
import { CliError, createOutput, withHumanOutput } from './cli-output.mjs';

export const commands = ['comments', 'open', 'link', 'serve', 'root', 'service', 'migrate', 'init', 'check', 'render', 'compare', 'diff', 'review', 'owner', 'impact', 'inspect', 'motion'];
const targetOptions = '[--asset=<path> [--frame=<name>] | --group=<name> | --layer=<name> | --tokens] [--mode=query|path] [--base=<rev>]';
const usage = {
  comments: '[[list] [--status=open|resolved|all] [--source=<path>] [--frame=<name>] | read <n> | reply <n> --author=<name> --message=<text> | resolve <n> --author=<name> [--message=<text>]] [--state-dir=<path>] [--json]',
  open: `[directory] [--port=<n>] [--no-open] [--state-dir=<path>] ${targetOptions}`,
  link: `<viewer-url> [--comment=<n> | ${targetOptions}]`,
  serve: '[--port=4310] [--state-dir=<path>] [--print-key | --rotate-key]',
  service: 'install|uninstall|status|logs|migrate [--state-dir=<path>] [--port=4310] [--public-origin=<origin>]',
  root: 'add <dir> [--depth=2] | remove <dir> | list | scan [dir] [--state-dir=<path>]',
  motion: '[--css | --json]',
  migrate: '[project]', init: '', check: '[source...] [--transitions] [--read-only] [--motion-only] [--motion-details] [--impacted --base=<rev> [--frame=<name>] [--theme=both|light|dark] [--state-dir=<path>] [--explain]]', render: '[source...] [--frame=<name>] [--theme=both|light|dark|system] [--scale=2] [--out-dir=<path>] [--json] [--base=<rev>] [--impacted [--state-dir=<path>] [--explain]]',
  compare: '<source> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css> | --page] [--origin="<x> <y>"] [--click=<name>...] [--viewport=<w>x<h>] [--no-screenshots] | --all',
  diff: '[source...] --base=<rev> [--frame=<name>] [--theme=both|light|dark|system] [--scale=2] [--out-dir=<path>] [--json] [--impacted [--state-dir=<path>] [--explain]]',
  review: '--base=<rev> [--format=html|png|embed] [--theme=system|light|dark] [--out=<file>] [--viewer-url=<project-url>] [--exact] [--json]',
  owner: '[--transitions] (--transition=<id> | --file=<path|directory|glob> [--line=<n>] [--symbol=<name>] | --text=<text> [--contains] [--locale=<tag>] | --color=<css> | --token=<name> | --part=<source>[#<Export>]) [--theme=both|light|dark] [--state-dir=<path>] [--json]',
  inspect: '[--transition=<id> [--explain] | <source> --frame=<name> --transitions] [source] [--frame=<name>] [--theme=both|light|dark] [--part=<source>#<Export> | --element=<id> | --text=<text> [--contains]] [--depth=<n|all>] [--fields=<groups>] [--wrappers=semantic|all] [--expand] [--state-dir=<path>] [--json]',
  impact: '[--transitions] (--source=<path>... [--part=<name>] | --token=<name>... | --file=<path|directory|glob> [--line=<n>] [--symbol=<name>] | --base=<rev> [--head=<rev>]) [--theme=both|light|dark] [--explain] [--state-dir=<path>] [--json]',
};
const details = {
  motion: 'Export project motion tokens and raw spring parameters. --css emits a token stylesheet with generated linear() springs.',
  comments: 'List open project comment threads by default, or read, reply to or resolve a thread by number, #number or ID. Run from the project directory.',
  migrate: 'Rename a project configuration and runtime imports, update editor paths and ignore entries, remove old generated files and regenerate declarations. Refuses mixed config names; safe to run again.',
  serve: 'Run the resident multi-project hub on 127.0.0.1. Projects build on viewer access and idle viewers stop after five minutes. --print-key prints the key and exits; --rotate-key rotates the running hub key and exits. Forwarded data requests require a header or query key; direct-local requests are exempt.',
  service: 'Manage the macOS resident hub LaunchAgent. install creates or updates it with RunAtLoad and KeepAlive, recording absolute Node/CLI paths. --port and --public-origin apply only to install. Set --public-origin to an HTTP(S) origin for public comment links. Reinstalling keeps the port, state directory and public origin unless specified. status prints JSON; logs prints the last 200 lines per log. Uninstall retains state and logs. migrate moves old hub state and replaces its LaunchAgent, then lists other agents referencing the old state path. --state-dir selects the migration destination. Other platforms are unsupported.',
  root: 'Manage registered scan roots. add scans immediately. scan rescans registered roots only; depth is 0 through 3. Hidden directories, node_modules and Git worktrees are skipped.',
  open: 'Browse TSX, Mermaid architecture sources and legacy SVG designs on an independent random-port server.', init: 'Create design sources, tokens and editor configuration without overwriting files.',
  link: 'Print a clean ADG preview URL. --comment=<n> opens a comment thread. --base=<rev> enables Git overlays for architecture diagrams. Query mode isolates a target. Path mode locates it in the design hierarchy.',
  check: 'Check import direction and every selected frame in both themes. --read-only skips generated types and build files. --impacted --base=<rev> evaluates scheduled current rows; proven rows remain not_checked with partial coverage.', render: 'Render selected frames as PNG. Defaults to both themes at 2×. --theme=system resolves the current macOS appearance, otherwise light, and reports the resolved themes. --impacted --base=<rev> captures scheduled plain current frames and reports deletions, with operation-local proofs for skipped rows. Ordinary architecture --base produces proposal overlays; --impacted never does. --json prints completed captures and impact coverage, including zero-job runs.',
  compare: 'Compare fixture text positions. Flags override Frame fixture and capture. --all writes a summary for every fixture frame.',
  diff: 'Compare the Git base and working-tree source/frame union. Existing frames require exact pixels and CSS/device size; added Frame parent declarations enable structural part evidence under diff.thresholds. Defaults to both themes at 2× and <configured output>/diff, overwriting previous diff artifacts and writing a self-contained index.html review page, before/after/difference PNGs and report.json. --impacted also writes review-sheet.png with up to 12 image cards at 2× plus lists of removed and moved frames. The sheet uses the explicit single theme or system appearance. --theme=system resolves the current macOS appearance, otherwise light. --impacted captures only scheduled rows (both themes when either theme of a frame is impacted); unqualified both-theme runs count fresh proofs toward full coverage. Required parents/support always capture. A structural batch requires all existing frames in both themes; source/frame/theme restrictions report partial coverage. Exit 0 identical/structural, 1 changed, 2 incomplete.',
  review: 'Generate one review of the Git base and working tree. Defaults to interactive HTML, the system theme and <configured output>/review.html. Use --format=embed for a compact inline review widget at <configured output>/review-embed.html, or --format=png for a static summary at <configured output>/review.png. --out must match the selected format. Uses structural prefiltering with pixel comparison for the remaining frames. --exact uses pixel comparison for every frame scheduled by impact analysis. A registered hub supplies HTML frame links, or set --viewer-url. Exit 0 when written, including changes, or 2 for incomplete generation.',
  owner: 'Find owning design sources, parts, frames and tokens from an implementation path, rendered text, absolute CSS color or token name. Paths resolve from the project root; quote globs. --part reverses the lookup from a design source or source#Export to implementation bindings with resolved files and symbol regions. --line returns the containing export/anchor region, including unmapped exports; non-exported helpers belong to the preceding export. Text is NFC/whitespace normalized and exact unless --contains; --locale filters exact Frame locale tags without translation. Colors use 8-bit sRGB RGBA equality. Owner evidence is scoped to the query: mappings for files, text runs for text, computed paint for colors and authored references for tokens. Text authoredIn lists literal-search copy candidates; escaped or concatenated strings may be missed. Color evidence may include compact same-element/property references. Defaults to both themes. Broad color/token JSON can be around 100 KB; read owners first and narrow with --theme. Empty, stale and ambiguous results exit 0; invalid/incomplete requests exit 2.',
  inspect: 'Read TSX frame structure, text, CSS-pixel boxes, computed styles and token-reference evidence. Without a unique frame, return a catalog. Default: both themes, all fields, full depth. Field groups: structure,layout,typography,color,text. Shared styles, semantic wrappers, repeated subtrees and a sparse dark delta keep the default compact. --expand reconstructs ordinary element records for both themes. No consumer application or viewer is started. Exit 0 completed observation, 2 invalid/incomplete.',
  impact: 'Query direct/transitive candidates from sources, named parts, tokens or implementation mappings, or compare exact Git endpoints. --base includes staged, unstaged and untracked working files; --head selects another exact commit. Hypothetical selectors cannot prove skips; token candidates assume unchanged Tailwind classification. Git mode freshly executes both endpoint source sets and compares eligible materialized inputs. Closure or occurrence absence never proves safety. Groups merge equal theme and same-source frame records; noncandidate proofs remain counts. --explain samples witnesses/digests without splitting groups. No browser launch. Render/check/diff --impacted compute their own operation-local proofs. Exit 0 completed, including empty/stale mappings; 2 invalid/incomplete.',
};
const helpExamples = {
  impact: 'adg impact --source=design/components/badge.tsx --part=Badge --json\nadg impact --token=--accent --json\nadg impact --base=HEAD --json',
  render: 'adg render --impacted --base=HEAD --json\nadg render arch/catalog.mmd --base=HEAD --json',
  check: 'adg check --impacted --base=HEAD --read-only --json\nadg check --read-only --json',
  diff: 'adg diff --base=HEAD --impacted --json',
  review: 'adg review --base=HEAD --json\nadg review --base=HEAD --format=embed --json\nadg review --base=HEAD --format=png --json',
};
export function help(command) {
  if (command) return `Usage: adg ${command} ${usage[command]}\n\n${details[command]}${helpExamples[command] ? `\n\nExamples:\n${helpExamples[command]}` : ''}\n\n-h, --help  Show help\nExit codes: 0 success, 1 check/compare/diff problems, 2 usage/configuration/environment error.`;
  return `Usage: adg [open] [directory] [options]\n\n${commands.map(name => `  adg ${name} ${usage[name]}`).join('\n')}\n\nAny first argument that is not a command opens a directory. Use adg open check for a directory named check.\nRun adg <command> --help for details. -v, --version prints the installed version.`;
}
export function parseCli(args) {
  let globalJson = false;
  while (args[0] === '--json') { globalJson = true; args = args.slice(1); }
  const explicit = commands.includes(args[0]), command = explicit ? args[0] : 'open';
  const options = { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, json: { type: 'boolean' } };
  const locators = ['asset', 'frame', 'group', 'layer', 'mode', 'base'];
  const strings = { comments: ['status', 'source', 'frame', 'author', 'message', 'state-dir'], open: ['port', 'state-dir', ...locators], link: [...locators, 'comment'], serve: ['port', 'state-dir'], root: ['depth', 'state-dir'], service: ['port', 'state-dir', 'public-origin'], check: ['base', 'frame', 'theme', 'state-dir'], render: ['scale', 'frame', 'theme', 'out-dir', 'base', 'state-dir'], diff: ['base', 'frame', 'theme', 'scale', 'out-dir', 'state-dir'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport', 'origin'], owner: ['transition','file', 'text', 'color', 'token', 'part', 'line', 'symbol', 'locale', 'theme', 'state-dir'], impact: ['source', 'part', 'token', 'file', 'line', 'symbol', 'base', 'head', 'theme', 'state-dir'], inspect: ['transition','frame','theme','part','element','text','depth','fields','wrappers','state-dir'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
  if (command === 'review') {
    for (const name of ['base', 'format', 'theme', 'out', 'viewer-url']) options[name] = { type: 'string' };
    options.exact = { type: 'boolean' };
  }
  if (command === 'serve') for (const name of ['print-key', 'rotate-key']) options[name] = { type: 'boolean' };
  if (command === 'open') options['no-open'] = { type: 'boolean' };
  if (command === 'open' || command === 'link') options.tokens = { type: 'boolean' };
  if (command === 'check') for (const name of ['read-only','motion-only','motion-details']) options[name] = { type: 'boolean' };
  if (command === 'compare') options['no-screenshots'] = { type: 'boolean' };
  if (command === 'motion') options.css = { type: 'boolean' };
  if (['render', 'check', 'diff'].includes(command)) { options.impacted = { type: 'boolean' }; options.explain = { type: 'boolean' }; }
  if (command === 'owner' || command === 'inspect') options.contains = { type: 'boolean' };
  if (['inspect','owner','impact','check'].includes(command)) options.transitions = {type:'boolean'};
  if (command === 'inspect') options.explain = {type:'boolean'};
  if (command === 'inspect') options.expand = { type: 'boolean' };
  if (command === 'impact') {
    options.explain = { type: 'boolean' };
    for (const name of ['source', 'token']) options[name].multiple = true;
  }
  if (command === 'compare') { options.all = { type: 'boolean' }; options.page = { type: 'boolean' }; }
  if (command === 'compare') options.click = { type: 'string', multiple: true };
  let parsed;
  try { parsed = parseArgs({ args: explicit ? args.slice(1) : args, options, allowPositionals: true, tokens: ['owner','impact','inspect'].includes(command) }); }
  catch (error) { throw new CliError('USAGE_INVALID', `${error.message}; run adg ${command} --help`); }
  const { values, positionals } = parsed;
  if (globalJson) values.json = true;
  if (!values.help && !values.version) {
    if (command === 'motion' && (positionals.length || values.css && values.json)) throw new CliError('USAGE_INVALID', 'Choose --css or --json.');
    if (command === 'check' && ((values['motion-only'] && (positionals.length || values.impacted || values.transitions)) ||
        (values['motion-details'] && (positionals.length || values.impacted))))
      throw new CliError('USAGE_INVALID', 'Motion inventory flags apply to a whole-project check.');
    if (command === 'review') {
      const format = values.format ?? 'html';
      const extension = format === 'png' ? '.png' : '.html';
      if (positionals.length || !values.base?.trim() ||
          !['html', 'png', 'embed'].includes(format) ||
          (values.theme !== undefined && !['system', 'light', 'dark'].includes(values.theme)) ||
          (values.out !== undefined && !values.out.toLowerCase().endsWith(extension)) || values['viewer-url'] === '') {
        throw new CliError('USAGE_INVALID', 'Set --base=<rev>, choose one theme and format, and match --out to the format; run adg review --help.');
      }
    }
    if (['render', 'check', 'diff'].includes(command)) {
      if (!values.impacted && (values.explain !== undefined || values['state-dir'] !== undefined)) throw new CliError('USAGE_INVALID', '--explain and --state-dir require --impacted --base=<rev>.');
      if (values.impacted && (typeof values.base !== 'string' || !values.base.trim())) throw new CliError('USAGE_INVALID', '--impacted requires --base=<rev>.');
      if (command === 'check' && !values.impacted && ['base', 'frame', 'theme', 'state-dir', 'explain'].some(key => values[key] !== undefined)) throw new CliError('USAGE_INVALID', 'Check selection flags require --impacted --base=<rev>.');
    }
    if (command === 'inspect') {
      const seen=new Set();
      for(const token of parsed.tokens)if(token.kind==='option'&&!['json','help','version'].includes(token.name)){
        if(seen.has(token.name))throw new CliError('USAGE_INVALID',`Do not repeat --${token.name}; run adg inspect --help.`);seen.add(token.name);
      }
      if ((values.transition!==undefined && (positionals.length || Object.keys(values).some(k=>!['transition','json','theme','explain','state-dir'].includes(k)))) ||
          (values.explain && !values.transition) || (values.transitions && (!values.frame || positionals.length!==1 || Object.keys(values).some(k=>!['frame','transitions','state-dir','json'].includes(k)))))
        throw new CliError('USAGE_INVALID','Choose --transition=<id> or <source> --frame=<name> --transitions.');
      if(positionals.length>1 || strings.inspect.some(k=>values[k]!==undefined&&!values[k].trim()) ||
        ['part','element','text'].filter(k=>values[k]!==undefined).length>1 || values.contains!==undefined&&values.text===undefined ||
        values.theme!==undefined&&!['both','light','dark'].includes(values.theme) ||
        values.wrappers!==undefined&&!['semantic','all'].includes(values.wrappers) ||
        values.depth!==undefined&&values.depth!=='all'&&(!/^(0|[1-9]\d*)$/.test(values.depth)||!Number.isSafeInteger(Number(values.depth))) ||
        values.fields!==undefined&&values.fields.split(',').some(k=>!['structure','layout','typography','color','text'].includes(k)))throw new CliError('USAGE_INVALID','Choose compatible inspect selectors and field groups; run adg inspect --help.');
    }
    if (command === 'impact') {
      const kinds = ['source', 'token', 'file', 'base'].filter(key => values[key] !== undefined), seen = new Set();
      for (const token of parsed.tokens) if (token.kind === 'option' && !['json', 'help', 'version', 'source', 'token'].includes(token.name)) {
        if (seen.has(token.name)) throw new CliError('USAGE_INVALID', `Do not repeat --${token.name}; run adg impact --help.`);
        seen.add(token.name);
      }
      if (positionals.length || kinds.length !== 1 || strings.impact.some(key => values[key] !== undefined && (Array.isArray(values[key]) ? values[key] : [values[key]]).some(value => !value.trim())) ||
        values.theme !== undefined && !['both', 'light', 'dark'].includes(values.theme) ||
        values.part !== undefined && (kinds[0] !== 'source' || values.source.length !== 1) ||
        values.head !== undefined && kinds[0] !== 'base' ||
        (values.line !== undefined || values.symbol !== undefined) && kinds[0] !== 'file' ||
        values.line !== undefined && (!/^[1-9]\d*$/.test(values.line) || !Number.isSafeInteger(Number(values.line)))) throw new CliError('USAGE_INVALID', 'Choose one nonempty impact selector family and compatible options; run adg impact --help.');
    }
    if (command === 'owner') {
      const kinds = ['file', 'text', 'color', 'token', 'part','transition'].filter(key => values[key] !== undefined);
      const seen = new Set();
      for (const token of parsed.tokens) if (token.kind === 'option' && !['json', 'help', 'version'].includes(token.name)) {
        if (seen.has(token.name)) throw new CliError('USAGE_INVALID', `Do not repeat --${token.name}; run adg owner --help.`);
        seen.add(token.name);
      }
      if (values.transitions && !['token','file'].includes(kinds[0])) throw new CliError('USAGE_INVALID','Use --transitions with --file or --token.');
      if (positionals.length || kinds.length !== 1 || strings.owner.some(key => values[key] !== undefined && !values[key].trim()) ||
        values.theme !== undefined && !['both', 'light', 'dark'].includes(values.theme) ||
        (values.line !== undefined || values.symbol !== undefined) && kinds[0] !== 'file' ||
        values.part !== undefined && (values.line !== undefined || values.symbol !== undefined || values.locale !== undefined || values.contains !== undefined) ||
        (values.contains !== undefined || values.locale !== undefined) && kinds[0] !== 'text' ||
        values.line !== undefined && (!/^[1-9]\d*$/.test(values.line) || !Number.isSafeInteger(Number(values.line)))) throw new CliError('USAGE_INVALID', 'Choose one nonempty owner input and compatible options; run adg owner --help.');
    }
    if (command === 'diff' && (typeof values.base !== 'string' || !values.base.trim())) throw new CliError('USAGE_INVALID', 'Set --base to a Git revision; run adg diff --help.');
    if ((command === 'init' && positionals.length) || (['open', 'migrate'].includes(command) && positionals.length > 1) || (command === 'compare' && (values.all ? positionals.length || values.frame : positionals.length !== 1 || !values.frame))) throw new CliError('USAGE_INVALID', `Invalid arguments; run adg ${command} --help`);
    if (command === 'link' && positionals.length !== 1) throw new CliError('USAGE_INVALID', 'Expected one viewer URL. Run adg link --help.');
    if (command === 'service' && (positionals.length !== 1 || !serviceActions.includes(positionals[0]) || (['port', 'public-origin'].some(name => values[name] !== undefined) && positionals[0] !== 'install'))) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg service --help');
    if (command === 'root') {
      const [action, directory, ...extra] = positionals;
      if (extra.length || !rootActions.includes(action) || (['add', 'remove'].includes(action) && !directory) || (action === 'list' && directory) || (values.depth !== undefined && action !== 'add')) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg root --help');
    }
    if (command === 'comments') {
      const [action = 'list', id, ...extra] = positionals;
      const write = action === 'reply' || action === 'resolve';
      const hasFilter = ['status', 'source', 'frame'].some(key => values[key] !== undefined);
      if (!commentActions.includes(action) || extra.length ||
          (action === 'list' ? id !== undefined : !id?.trim() || hasFilter) ||
          (write ? values.author === undefined : values.author !== undefined || values.message !== undefined) ||
          (action === 'reply' && values.message === undefined) ||
          strings.comments.some(key => values[key] !== undefined && !values[key].trim()) ||
          (values.status !== undefined && !['open', 'resolved', 'all'].includes(values.status))) {
        throw new CliError('USAGE_INVALID', 'Choose a comment action and its options. Run adg comments --help.');
      }
    }
    if (command === 'serve' && positionals.length) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg serve --help');
    if (command === 'serve' && ((values['print-key'] && values['rotate-key']) || (values.port !== undefined && (values['print-key'] || values['rotate-key'])))) throw new CliError('USAGE_INVALID','Choose --print-key or --rotate-key without --port; run adg serve --help');
  } else if (values.json && values.help && ['root', 'service'].includes(command) && (positionals.length > 1 || (positionals.length && !(command === 'root' ? rootActions : serviceActions).includes(positionals[0])))) {
    throw new CliError('USAGE_INVALID', `Invalid arguments; run adg ${command} --help`);
  }
  return { command, values, positionals, explicit };
}
const rootActions = ['add', 'remove', 'list', 'scan'];
const serviceActions = ['install', 'uninstall', 'status', 'logs', 'migrate'];
const commentActions = ['list', 'read', 'reply', 'resolve'];

export function commandIdentity({ command, positionals = [], values }) {
  const actions = command === 'root' ? rootActions : command === 'service' ? serviceActions : command === 'comments' ? commentActions : [];
  const action = positionals[0] ?? (command === 'comments' && !values?.help ? 'list' : undefined);
  return actions.includes(action) ? `${command} ${action}` : command;
}

export function jsonRequested(args) {
  const separator = args.indexOf('--');
  return (separator < 0 ? args : args.slice(0, separator)).includes('--json');
}

function errorCommand(args) {
  while (args[0] === '--json') args = args.slice(1);
  if (commands.includes(args[0])) return commandIdentity({ command: args[0], positionals: args.slice(1) });
  return args[0] && !args[0].startsWith('-') ? 'open' : 'adg';
}

async function dispatch({ command, values, positionals }, cwd, output, serviceOptions) {
  if (command === 'migrate') return { data: await (await import('./toolkit/migrate.mjs')).migrate(positionals[0] === undefined ? cwd : path.resolve(cwd, positionals[0]), output.log) };
  if (command === 'link') {
    const { previewTarget, previewURL } = await import('./link.mjs');
    const data = { url: previewURL(positionals[0], previewTarget(values)).href };
    if (!values.json) output.log(data.url);
    return { data };
  }
  if (command === 'service') {
    const options={...serviceOptions,output:output.log};
    if (values['state-dir'] !== undefined) values={...values,'state-dir':path.resolve(cwd,values['state-dir'])};
    return (await import('./service.mjs')).service(positionals[0], values, options);
  }
  if (command === 'root') {
    const [action, directory] = positionals;
    const registry = await import('./hub/registry.mjs');
    const state = path.resolve(cwd, values['state-dir'] ?? registry.defaultStateDirectory);
    const options = { cwd, error: output.progress };
    const result = action === 'add' ? await registry.addRoot(directory, values.depth === undefined ? 2 : Number(values.depth), state, options)
      : action === 'remove' ? await registry.removeRoot(directory, state, options)
      : action === 'scan' ? await registry.scanRoots(directory, state, options)
      : { data: { stateDirectory: state, roots: await registry.listRoots(state), affected: [] } };
    if (!values.json) output.log(JSON.stringify(result.data.roots, null, 2));
    return result;
  }
  if (command === 'serve') {
    const {defaultStateDirectory}=await import('./hub/registry.mjs');
    const stateDirectory=path.resolve(cwd,values['state-dir'] ?? defaultStateDirectory);
    const key=await (await import('./hub/auth.mjs')).hubKey(stateDirectory,{rotate:!!values['rotate-key']});
    if (!values.json && !values['print-key']) output.log('Hub key rotated.');
    return {data:values['print-key'] ? {action:'print-key',stateDirectory,key} : {action:'rotate-key',stateDirectory,rotated:true}};
  }
  const config = await loadConfig(cwd);
  if (command === 'comments') {
    const [action = 'list', id] = positionals;
    const stateDir = values['state-dir'] ? path.resolve(cwd, values['state-dir']) : undefined;
    const { changeComment, listComments, readCommentContext } = await import('./comments.mjs');
    const data = action === 'list'
      ? await listComments(config.root, stateDir, { status: values.status ?? 'open', source: values.source, frame: values.frame })
      : action === 'read'
        ? await readCommentContext(config, stateDir, id)
        : await changeComment(config.root, stateDir, { action, id, message: values.message }, { author: values.author });
    if (!values.json) output.log(JSON.stringify(data, null, 2));
    return { data };
  }
  if (command === 'motion') {
    const { loadMotionPatterns, patternParameters } = await import('./toolkit/motion-patterns.mjs');
    const { motionTokenCss } = await import('./toolkit/motion-primitives.mjs');
    const { tokens, springs, patterns } = loadMotionPatterns(config);
    if (values.css) {
      output.log(motionTokenCss(tokens).trimEnd());
      return { data: null };
    }
    const used = new Set([...patterns.values()].flatMap(pattern => ['enter', 'exit'].flatMap(direction => Object.values(patternParameters(pattern, direction)))));
    const names = Object.fromEntries([...tokens.light].filter(([name]) => used.has(name) || /^--(?:adg-motion|motion)-/.test(name)).map(([name, value]) =>
      [name, { light: value, ...(tokens.dark.has(name) ? { dark: tokens.dark.get(name) } : {}) }]));
    const data = { tokens: names, springs };
    if (!values.json) output.log(JSON.stringify(data, null, 2));
    return { data };
  }
  if (command === 'inspect') return (await import('./toolkit/inspect.mjs')).inspect(config, positionals, { ...values, ...(values['state-dir'] !== undefined ? { 'state-dir': path.resolve(cwd, values['state-dir']) } : {}) }, { log: output.log });
  if (command === 'impact') return (await import('./toolkit/impact.mjs')).impact(config, { ...values, ...(values['state-dir'] !== undefined ? { 'state-dir': path.resolve(cwd, values['state-dir']) } : {}) }, { log: output.log });
  if (command === 'owner') return (await import('./toolkit/owner.mjs')).owner(config, { ...values, ...(values['state-dir'] !== undefined ? { 'state-dir': path.resolve(cwd, values['state-dir']) } : {}) }, { log: output.log });
  if (command === 'init') return { data: (await import('./toolkit/project.mjs')).init(config, output.log) };
  if (command === 'compare') return (await import('./toolkit/compare.mjs')).compare(config, positionals, values, {log:output.log});
  if (command === 'diff') return (await import('./toolkit/diff.mjs')).diff(config, positionals, values, { log: output.log });
  if (command === 'review') return (await import('./toolkit/review.mjs')).review(config, values, { log: output.log });
  const toolkit = await import('./toolkit/commands.mjs');
  return command === 'check' ? toolkit.check(config, positionals, values, output.log, output.progress) : toolkit.render(config, positionals, values, output.log);
}
export async function main(args = process.argv.slice(2), cwd = process.cwd(), {
  stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr),
  exit = code => { process.exitCode = code; },
  serviceOptions, openOptions, hubOptions, signals = process, stdoutEvents = process.stdout,
} = {}) {
  let command = errorCommand(args), parsed;
  const json = jsonRequested(args);
  let output = createOutput({ json, command, stdout, stderr });
  let code;
  try {
    parsed = parseCli(args);
    command = parsed.values.help ? 'help' : parsed.values.version ? 'version' : commandIdentity(parsed);
    output = createOutput({ json, command, stdout, stderr, revealKey:command === 'serve' && !!parsed.values['print-key'] });
    if (command === 'help') {
      const text = help(parsed.explicit ? parsed.command : undefined);
      if (json) output.success({ subject: parsed.explicit ? commandIdentity(parsed) : null, usage: text.split('\n')[0], text });
      else output.log(text);
      code = 0;
    } else if (command === 'version') {
      if (json) output.success({ version: VERSION });
      else output.log(VERSION);
      code = 0;
    } else if (command === 'open' || (command === 'serve' && !parsed.values['print-key'] && !parsed.values['rotate-key'])) {
      const {defaultStateDirectory}=await import('./hub/registry.mjs');
      const stateDirectory=path.resolve(cwd,parsed.values['state-dir'] ?? defaultStateDirectory);
      const port=parsed.values.port === undefined ? command === 'open' ? 0 : 4310 : Number(parsed.values.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new CliError('USAGE_INVALID','--port must be an integer from 0 to 65535.');
      const {runForeground}=await import('./lifecycle.mjs');
      const start=command === 'open'
        ? async callbacks => (await import('./open.mjs')).open(parsed.positionals,parsed.values,{...openOptions,cwd,...callbacks})
        : async callbacks => (await import('./hub.mjs')).startHub({...hubOptions,port,stateDirectory,...callbacks});
      const run=()=>runForeground(command,start,{output,json,signals,stdoutEvents,context:{...parsed,command,stateDirectory}});
      code=json ? await withHumanOutput(run,stderr) : await run();
    } else {
      const run=()=>dispatch(parsed,cwd,output,serviceOptions);
      const result = json ? await withHumanOutput(run, stderr) : await run();
      if (json) output.success(result.data, result.warnings);
      else if (command === 'serve' && parsed.values['print-key']) stdout(`${result.data.key}\n`);
      code = 0;
    }
  } catch (error) {
    code = output.failure(error, {
      ...(parsed ?? {}), command,
      ...(parsed?.values['state-dir'] ? { stateDirectory: path.resolve(cwd, parsed.values['state-dir']) } : {}),
    });
  }
  exit(code);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main();
}
