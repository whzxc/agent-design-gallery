#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { VERSION, loadConfig } from './toolkit/config.mjs';
import { CliError, createOutput, withHumanOutput } from './cli-output.mjs';

export const commands = ['open', 'link', 'serve', 'root', 'service', 'migrate', 'init', 'check', 'render', 'compare'];
const targetOptions = '[--asset=<path> [--frame=<name>] | --group=<name> | --layer=<name> | --tokens] [--mode=query|path] [--base=<rev>]';
const usage = {
  open: `[directory] [--port=<n>] [--no-open] [--state-dir=<path>] ${targetOptions}`,
  link: `<viewer-url> ${targetOptions}`,
  serve: '[--port=4310] [--state-dir=<path>] [--print-key | --rotate-key]',
  service: 'install|uninstall|status|logs|migrate [--state-dir=<path>] [--port=4310]',
  root: 'add <dir> [--depth=2] | remove <dir> | list | scan [dir] [--state-dir=<path>]',
  migrate: '[project]', init: '', check: '[source...] [--read-only]', render: '[source...] [--frame=<name>] [--theme=both|light|dark] [--scale=2] [--out-dir=<path>] [--json] [--base=<rev>]',
  compare: '<source> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css> | --page] [--origin="<x> <y>"] [--click=<name>...] [--viewport=<w>x<h>] | --all',
};
const details = {
  migrate: 'Rename a project configuration and runtime imports, update editor paths and ignore entries, remove old generated files and regenerate declarations. Refuses mixed config names; safe to run again.',
  serve: 'Run the resident multi-project hub on 127.0.0.1. Projects build on viewer access and idle viewers stop after five minutes. --print-key prints the key and exits; --rotate-key rotates the running hub key and exits. Forwarded data requests require a header or query key; direct-local requests are exempt.',
  service: 'Manage the macOS resident hub LaunchAgent. install starts it with RunAtLoad and KeepAlive, recording absolute Node/CLI paths. --port applies only to install. status prints JSON; logs prints the last 200 lines per log. Uninstall retains state and logs. migrate moves old hub state and replaces its LaunchAgent, then lists other agents referencing the old state path. --state-dir selects the migration destination. Other platforms are unsupported.',
  root: 'Manage registered scan roots. add scans immediately. scan rescans registered roots only; depth is 0 through 3. Hidden directories, node_modules and Git worktrees are skipped.',
  open: 'Browse TSX, Mermaid architecture sources and legacy SVG designs on an independent random-port server.', init: 'Create design sources, tokens and editor configuration without overwriting files.',
  link: 'Print a clean ADG preview URL. Query mode isolates a target. Path mode locates it in the design hierarchy.',
  check: 'Check import direction and every selected frame in both themes. --read-only skips generated types and build files.', render: 'Render selected frames as PNG. Defaults to both themes at 2×. --json prints a list of captures with absolute paths.',
  compare: 'Compare fixture text positions. Flags override Frame fixture and capture. --all writes a summary for every fixture frame.',
};
export function help(command) {
  if (command) return `Usage: adg ${command} ${usage[command]}\n\n${details[command]}\n\n-h, --help  Show help\nExit codes: 0 success, 1 check/compare problems, 2 usage/configuration/environment error.`;
  return `Usage: adg [open] [directory] [options]\n\n${commands.map(name => `  adg ${name} ${usage[name]}`).join('\n')}\n\nAny first argument that is not a command opens a directory. Use adg open check for a directory named check.\nRun adg <command> --help for details. -v, --version prints the installed version.`;
}
export function parseCli(args) {
  let globalJson = false;
  while (args[0] === '--json') { globalJson = true; args = args.slice(1); }
  const explicit = commands.includes(args[0]), command = explicit ? args[0] : 'open';
  const options = { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, json: { type: 'boolean' } };
  const locators = ['asset', 'frame', 'group', 'layer', 'mode', 'base'];
  const strings = { open: ['port', 'state-dir', ...locators], link: locators, serve: ['port', 'state-dir'], root: ['depth', 'state-dir'], service: ['port', 'state-dir'], render: ['scale', 'frame', 'theme', 'out-dir', 'base'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport', 'origin'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
  if (command === 'serve') for (const name of ['print-key', 'rotate-key']) options[name] = { type: 'boolean' };
  if (command === 'open') options['no-open'] = { type: 'boolean' };
  if (command === 'open' || command === 'link') options.tokens = { type: 'boolean' };
  if (command === 'check') options['read-only'] = { type: 'boolean' };
  if (command === 'compare') { options.all = { type: 'boolean' }; options.page = { type: 'boolean' }; }
  if (command === 'compare') options.click = { type: 'string', multiple: true };
  let parsed;
  try { parsed = parseArgs({ args: explicit ? args.slice(1) : args, options, allowPositionals: true }); }
  catch (error) { throw new CliError('USAGE_INVALID', `${error.message}; run adg ${command} --help`); }
  const { values, positionals } = parsed;
  if (globalJson) values.json = true;
  if (!values.help && !values.version) {
    if ((command === 'init' && positionals.length) || (['open', 'migrate'].includes(command) && positionals.length > 1) || (command === 'compare' && (values.all ? positionals.length || values.frame : positionals.length !== 1 || !values.frame))) throw new CliError('USAGE_INVALID', `Invalid arguments; run adg ${command} --help`);
    if (command === 'link' && positionals.length !== 1) throw new CliError('USAGE_INVALID', 'Expected one viewer URL. Run adg link --help.');
    if (command === 'service' && (positionals.length !== 1 || !serviceActions.includes(positionals[0]) || (values.port !== undefined && positionals[0] !== 'install'))) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg service --help');
    if (command === 'root') {
      const [action, directory, ...extra] = positionals;
      if (extra.length || !rootActions.includes(action) || (['add', 'remove'].includes(action) && !directory) || (action === 'list' && directory) || (values.depth !== undefined && action !== 'add')) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg root --help');
    }
    if (command === 'serve' && positionals.length) throw new CliError('USAGE_INVALID', 'Invalid arguments; run adg serve --help');
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

// Temporary: render/check/compare and service/lifecycle writers await their assigned adapters.
async function dispatch({ command, values, positionals }, cwd, output) {
  if (command === 'migrate') return { data: await (await import('./toolkit/migrate.mjs')).migrate(positionals[0] === undefined ? cwd : path.resolve(cwd, positionals[0]), output.log) };
  if (command === 'open') return (await import('./open.mjs')).open(positionals, values);
  if (command === 'link') {
    const { previewTarget, previewURL } = await import('./link.mjs');
    const data = { url: previewURL(positionals[0], previewTarget(values)).href };
    if (!values.json) output.log(data.url);
    return { data };
  }
  if (command === 'service') {
    return (await import('./service.mjs')).service(positionals[0], values);
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
    if (values['print-key'] || values['rotate-key']) {
      const key = await (await import('./hub/auth.mjs')).hubKey(values['state-dir'], { rotate: !!values['rotate-key'] });
      console.log(values['print-key'] ? key : 'Hub key rotated.'); return 0;
    }
    const port = values.port === undefined ? 4310 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535.');
    const hub = await (await import('./hub.mjs')).startHub({ port, stateDirectory: values['state-dir'] });
    console.log(`ADG: ${hub.url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => hub.close().catch(error => { console.error(error.message); process.exitCode = 2; }));
    return 0;
  }
  const config = await loadConfig(cwd);
  if (command === 'init') return { data: (await import('./toolkit/project.mjs')).init(config, output.log) };
  if (command === 'compare') return (await import('./toolkit/compare.mjs')).compare(config, positionals, values);
  return (await import('./toolkit/commands.mjs'))[command](config, positionals, values);
}
export async function main(args = process.argv.slice(2), cwd = process.cwd(), {
  stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr),
  exit = code => { process.exitCode = code; },
} = {}) {
  let command = errorCommand(args), parsed;
  const json = jsonRequested(args);
  let output = createOutput({ json, command, stdout, stderr });
  let code;
  try {
    parsed = parseCli(args);
    command = parsed.values.help ? 'help' : parsed.values.version ? 'version' : commandIdentity(parsed);
    output = createOutput({ json, command, stdout, stderr });
    if (command === 'help') {
      const text = help(parsed.explicit ? parsed.command : undefined);
      if (json) output.success({ subject: parsed.explicit ? commandIdentity(parsed) : null, usage: text.split('\n')[0], text });
      else output.log(text);
      code = 0;
    } else if (command === 'version') {
      if (json) output.success({ version: VERSION });
      else output.log(VERSION);
      code = 0;
    } else if (['link', 'init', 'migrate', 'root'].includes(parsed.command)) {
      const result = json ? await withHumanOutput(() => dispatch(parsed, cwd, output), stderr) : await dispatch(parsed, cwd, output);
      if (json) output.success(result.data, result.warnings);
      code = 0;
    } else code = await dispatch(parsed, cwd, output);
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
