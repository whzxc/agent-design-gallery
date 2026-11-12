#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { VERSION, loadConfig } from './toolkit/config.mjs';
import { CliError, createOutput, withHumanOutput } from './cli-output.mjs';

export const commands = ['open', 'link', 'serve', 'root', 'service', 'migrate', 'init', 'check', 'render', 'compare', 'diff', 'owner', 'impact'];
const targetOptions = '[--asset=<path> [--frame=<name>] | --group=<name> | --layer=<name> | --tokens] [--mode=query|path] [--base=<rev>]';
const usage = {
  open: `[directory] [--port=<n>] [--no-open] [--state-dir=<path>] ${targetOptions}`,
  link: `<viewer-url> ${targetOptions}`,
  serve: '[--port=4310] [--state-dir=<path>] [--print-key | --rotate-key]',
  service: 'install|uninstall|status|logs|migrate [--state-dir=<path>] [--port=4310]',
  root: 'add <dir> [--depth=2] | remove <dir> | list | scan [dir] [--state-dir=<path>]',
  migrate: '[project]', init: '', check: '[source...] [--read-only] [--impacted --base=<rev>] [--frame=<name>] [--theme=both|light|dark]', render: '[source...] [--frame=<name>] [--theme=both|light|dark] [--scale=2] [--out-dir=<path>] [--json] [--base=<rev>] [--impacted]',
  compare: '<source> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css> | --page] [--origin="<x> <y>"] [--click=<name>...] [--viewport=<w>x<h>] | --all',
  diff: '[source...] --base=<rev> [--frame=<name>] [--theme=both|light|dark] [--scale=2] [--out-dir=<path>] [--json] [--impacted]',
  owner: '(--file=<path|directory|glob> [--line=<n>] [--symbol=<name>] | --text=<text> [--contains] [--locale=<tag>] | --color=<css> | --token=<name>) [--theme=both|light|dark] [--state-dir=<path>] [--json]',
  impact: '(--source=<path>... [--part=<name>] | --token=<name>... | --file=<path|directory|glob> [--line=<n>] [--symbol=<name>] | --base=<rev> [--head=<rev>]) [--theme=both|light|dark] [--explain] [--state-dir=<path>] [--json]',
};
const details = {
  migrate: 'Rename a project configuration and runtime imports, update editor paths and ignore entries, remove old generated files and regenerate declarations. Refuses mixed config names; safe to run again.',
  serve: 'Run the resident multi-project hub on 127.0.0.1. Projects build on viewer access and idle viewers stop after five minutes. --print-key prints the key and exits; --rotate-key rotates the running hub key and exits. Forwarded data requests require a header or query key; direct-local requests are exempt.',
  service: 'Manage the macOS resident hub LaunchAgent. install starts it with RunAtLoad and KeepAlive, recording absolute Node/CLI paths. --port applies only to install. status prints JSON; logs prints the last 200 lines per log. Uninstall retains state and logs. migrate moves old hub state and replaces its LaunchAgent, then lists other agents referencing the old state path. --state-dir selects the migration destination. Other platforms are unsupported.',
  root: 'Manage registered scan roots. add scans immediately. scan rescans registered roots only; depth is 0 through 3. Hidden directories, node_modules and Git worktrees are skipped.',
  open: 'Browse TSX, Mermaid architecture sources and legacy SVG designs on an independent random-port server.', init: 'Create design sources, tokens and editor configuration without overwriting files.',
  link: 'Print a clean ADG preview URL. Query mode isolates a target. Path mode locates it in the design hierarchy.',
  check: 'Check import direction and every selected frame in both themes. --read-only skips generated types and build files. --impacted --base=<rev> evaluates scheduled current rows; proven rows remain not_checked with partial coverage.', render: 'Render selected frames as PNG. Defaults to both themes at 2×. --impacted --base=<rev> captures scheduled plain current frames and reports deletions, with operation-local proofs for skipped rows. --json prints completed captures and impact coverage.',
  compare: 'Compare fixture text positions. Flags override Frame fixture and capture. --all writes a summary for every fixture frame.',
  diff: 'Compare the Git base and working-tree source/frame union. Existing frames require exact pixels and CSS/device size; added Frame parent declarations enable structural part evidence under diff.thresholds. Defaults to both themes at 2× and <configured output>/diff. Writes before, after and difference PNGs plus report.json. --impacted captures only scheduled rows; unqualified both-theme runs count fresh proofs toward full coverage. Required parents/support always capture. A structural batch requires all existing frames in both themes; source/frame/theme restrictions report partial coverage. Exit 0 identical/structural, 1 changed, 2 incomplete.',
  owner: 'Find owning design sources, parts, frames and tokens from an implementation path, rendered text, absolute CSS color or token name. Paths resolve from the project root; quote globs. --line returns the containing export/anchor region, including unmapped exports; non-exported helpers belong to the preceding export. Text is NFC/whitespace normalized and exact unless --contains; --locale filters exact Frame locale annotations without translation. Colors use 8-bit sRGB RGBA equality. Owner evidence is scoped to the query: mappings for files, text runs for text, computed paint for colors and authored references for tokens. Text authoredIn lists literal-search copy candidates; escaped or concatenated strings may be missed. Color evidence may include compact same-element/property references. Defaults to both themes. Broad color/token JSON can be around 100 KB; read owners first and narrow with --theme. Empty, stale and ambiguous results exit 0; invalid/incomplete requests exit 2.',
  impact: 'List potential frame impact using the shared project index: direct and transitive build dependencies, emitted part occurrences, lexical token reachability and implementation mappings. --base compares the exact commit with staged, unstaged and untracked working files; --head selects a second exact commit. Hypothetical token inputs assume unchanged Tailwind classification. Candidate frames are grouped by equal theme records and equal same-source frame records; hypothetical noncandidates are counted as unassessed. --explain keeps one first-frame witness per reason with group counts. Git queries freshly execute both endpoint source sets and prove equal closed rendering inputs; noncandidate proofs are counted without listing. Lifecycle and required-parent rows render. Proofs are operation-local; --explain adds a sampled digest. Hypothetical queries stay proof-free. Render/check/diff --impacted consume these proofs in the same operation. Exit 0 completed, including empty or incomplete mappings; 2 invalid/incomplete execution.',
};
export function help(command) {
  if (command) return `Usage: adg ${command} ${usage[command]}\n\n${details[command]}\n\n-h, --help  Show help\nExit codes: 0 success, 1 check/compare/diff problems, 2 usage/configuration/environment error.`;
  return `Usage: adg [open] [directory] [options]\n\n${commands.map(name => `  adg ${name} ${usage[name]}`).join('\n')}\n\nAny first argument that is not a command opens a directory. Use adg open check for a directory named check.\nRun adg <command> --help for details. -v, --version prints the installed version.`;
}
export function parseCli(args) {
  let globalJson = false;
  while (args[0] === '--json') { globalJson = true; args = args.slice(1); }
  const explicit = commands.includes(args[0]), command = explicit ? args[0] : 'open';
  const options = { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, json: { type: 'boolean' } };
  const locators = ['asset', 'frame', 'group', 'layer', 'mode', 'base'];
  const strings = { open: ['port', 'state-dir', ...locators], link: locators, serve: ['port', 'state-dir'], root: ['depth', 'state-dir'], service: ['port', 'state-dir'], check: ['base', 'frame', 'theme', 'state-dir'], render: ['scale', 'frame', 'theme', 'out-dir', 'base', 'state-dir'], diff: ['base', 'frame', 'theme', 'scale', 'out-dir', 'state-dir'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport', 'origin'], owner: ['file', 'text', 'color', 'token', 'line', 'symbol', 'locale', 'theme', 'state-dir'], impact: ['source', 'part', 'token', 'file', 'line', 'symbol', 'base', 'head', 'theme', 'state-dir'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
  if (command === 'serve') for (const name of ['print-key', 'rotate-key']) options[name] = { type: 'boolean' };
  if (command === 'open') options['no-open'] = { type: 'boolean' };
  if (command === 'open' || command === 'link') options.tokens = { type: 'boolean' };
  if (command === 'check') options['read-only'] = { type: 'boolean' };
  if (['render', 'check', 'diff'].includes(command)) { options.impacted = { type: 'boolean' }; options.explain = { type: 'boolean' }; }
  if (command === 'owner') options.contains = { type: 'boolean' };
  if (command === 'impact') {
    options.explain = { type: 'boolean' };
    for (const name of ['source', 'token']) options[name].multiple = true;
  }
  if (command === 'compare') { options.all = { type: 'boolean' }; options.page = { type: 'boolean' }; }
  if (command === 'compare') options.click = { type: 'string', multiple: true };
  let parsed;
  try { parsed = parseArgs({ args: explicit ? args.slice(1) : args, options, allowPositionals: true, tokens: command === 'owner' || command === 'impact' }); }
  catch (error) { throw new CliError('USAGE_INVALID', `${error.message}; run adg ${command} --help`); }
  const { values, positionals } = parsed;
  if (globalJson) values.json = true;
  if (!values.help && !values.version) {
    if (['render', 'check', 'diff'].includes(command)) {
      if (!values.impacted && (values.explain !== undefined || values['state-dir'] !== undefined)) throw new CliError('USAGE_INVALID', '--explain and --state-dir require --impacted --base=<rev>.');
      if (values.impacted && (typeof values.base !== 'string' || !values.base.trim())) throw new CliError('USAGE_INVALID', '--impacted requires --base=<rev>.');
      if (command === 'check' && !values.impacted && ['base', 'frame', 'theme', 'state-dir', 'explain'].some(key => values[key] !== undefined)) throw new CliError('USAGE_INVALID', 'Check selection flags require --impacted --base=<rev>.');
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
      const kinds = ['file', 'text', 'color', 'token'].filter(key => values[key] !== undefined);
      const seen = new Set();
      for (const token of parsed.tokens) if (token.kind === 'option' && !['json', 'help', 'version'].includes(token.name)) {
        if (seen.has(token.name)) throw new CliError('USAGE_INVALID', `Do not repeat --${token.name}; run adg owner --help.`);
        seen.add(token.name);
      }
      if (positionals.length || kinds.length !== 1 || strings.owner.some(key => values[key] !== undefined && !values[key].trim()) ||
        values.theme !== undefined && !['both', 'light', 'dark'].includes(values.theme) ||
        (values.line !== undefined || values.symbol !== undefined) && kinds[0] !== 'file' ||
        (values.contains !== undefined || values.locale !== undefined) && kinds[0] !== 'text' ||
        values.line !== undefined && (!/^[1-9]\d*$/.test(values.line) || !Number.isSafeInteger(Number(values.line)))) throw new CliError('USAGE_INVALID', 'Choose one nonempty owner input and compatible options; run adg owner --help.');
    }
    if (command === 'diff' && (typeof values.base !== 'string' || !values.base.trim())) throw new CliError('USAGE_INVALID', 'Set --base to a Git revision; run adg diff --help.');
    if ((command === 'init' && positionals.length) || (['open', 'migrate'].includes(command) && positionals.length > 1) || (command === 'compare' && (values.all ? positionals.length || values.frame : positionals.length !== 1 || !values.frame))) throw new CliError('USAGE_INVALID', `Invalid arguments; run adg ${command} --help`);
    if (command === 'link' && positionals.length !== 1) throw new CliError('USAGE_INVALID', 'Expected one viewer URL. Run adg link --help.');
    if (command === 'service' && (positionals.length !== 1 || !serviceActions.includes(positionals[0]) || (values.port !== undefined && positionals[0] !== 'install'))) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg service --help');
    if (command === 'root') {
      const [action, directory, ...extra] = positionals;
      if (extra.length || !rootActions.includes(action) || (['add', 'remove'].includes(action) && !directory) || (action === 'list' && directory) || (values.depth !== undefined && action !== 'add')) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg root --help');
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

export function commandIdentity({ command, positionals = [] }) {
  const actions = command === 'root' ? rootActions : command === 'service' ? serviceActions : [];
  return actions.includes(positionals[0]) ? `${command} ${positionals[0]}` : command;
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
  if (command === 'impact') return (await import('./toolkit/impact.mjs')).impact(config, { ...values, ...(values['state-dir'] !== undefined ? { 'state-dir': path.resolve(cwd, values['state-dir']) } : {}) }, { log: output.log });
  if (command === 'owner') return (await import('./toolkit/owner.mjs')).owner(config, { ...values, ...(values['state-dir'] !== undefined ? { 'state-dir': path.resolve(cwd, values['state-dir']) } : {}) }, { log: output.log });
  if (command === 'init') return { data: (await import('./toolkit/project.mjs')).init(config, output.log) };
  if (command === 'compare') return (await import('./toolkit/compare.mjs')).compare(config, positionals, values, {log:output.log});
  if (command === 'diff') return (await import('./toolkit/diff.mjs')).diff(config, positionals, values, { log: output.log });
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
