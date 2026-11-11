#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { VERSION, loadConfig } from './toolkit/config.mjs';

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
  const explicit = commands.includes(args[0]), command = explicit ? args[0] : 'open';
  const options = { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } };
  const locators = ['asset', 'frame', 'group', 'layer', 'mode', 'base'];
  const strings = { open: ['port', 'state-dir', ...locators], link: locators, serve: ['port', 'state-dir'], root: ['depth', 'state-dir'], service: ['port', 'state-dir'], render: ['scale', 'frame', 'theme', 'out-dir', 'base'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport', 'origin'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
  if (command === 'serve') for (const name of ['print-key', 'rotate-key']) options[name] = { type: 'boolean' };
  if (command === 'open') options['no-open'] = { type: 'boolean' };
  if (command === 'open' || command === 'link') options.tokens = { type: 'boolean' };
  if (command === 'render') options.json = { type: 'boolean' };
  if (command === 'check') options['read-only'] = { type: 'boolean' };
  if (command === 'compare') { options.all = { type: 'boolean' }; options.page = { type: 'boolean' }; }
  if (command === 'compare') options.click = { type: 'string', multiple: true };
  let parsed;
  try { parsed = parseArgs({ args: explicit ? args.slice(1) : args, options, allowPositionals: true }); }
  catch (error) { throw new Error(`${error.message}; run adg ${command} --help`); }
  const { values, positionals } = parsed;
  if (!values.help && !values.version) {
    if ((command === 'init' && positionals.length) || (['open', 'migrate'].includes(command) && positionals.length > 1) || (command === 'compare' && (values.all ? positionals.length || values.frame : positionals.length !== 1 || !values.frame))) throw new Error(`Invalid arguments; run adg ${command} --help`);
  }
  return { command, values, positionals, explicit };
}
export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const { command, values, positionals, explicit } = parseCli(args);
  if (values.help) { console.log(help(explicit ? command : undefined)); return 0; }
  if (values.version) { console.log(VERSION); return 0; }
  if (command === 'migrate') return (await import('./toolkit/migrate.mjs')).migrate(positionals[0] === undefined ? cwd : path.resolve(cwd, positionals[0]));
  if (command === 'open') return (await import('./open.mjs')).open(positionals, values);
  if (command === 'link') {
    if (positionals.length !== 1) throw Error('Expected one viewer URL. Run adg link --help.');
    const { previewTarget, previewURL } = await import('./link.mjs');
    console.log(previewURL(positionals[0], previewTarget(values)).href);
    return 0;
  }
  if (command === 'service') {
    if (positionals.length !== 1 || !['install', 'uninstall', 'status', 'logs', 'migrate'].includes(positionals[0]) || (values.port !== undefined && positionals[0] !== 'install')) throw new Error('Invalid arguments; run adg service --help');
    return (await import('./service.mjs')).service(positionals[0], values);
  }
  if (command === 'root') {
    const [action, directory, ...extra] = positionals;
    if (extra.length || !['add', 'remove', 'list', 'scan'].includes(action) || (['add', 'remove'].includes(action) && !directory) || (action === 'list' && directory) || (values.depth !== undefined && action !== 'add')) throw new Error('Invalid arguments; run adg root --help');
    const registry = await import('./hub/registry.mjs');
    const state = values['state-dir'];
    const result = action === 'add' ? await registry.addRoot(directory, values.depth === undefined ? 2 : Number(values.depth), state)
      : action === 'remove' ? await registry.removeRoot(directory, state)
      : action === 'scan' ? await registry.scanRoots(directory, state) : await registry.listRoots(state);
    console.log(JSON.stringify(result, null, 2)); return 0;
  }
  if (command === 'serve') {
    if (positionals.length) throw new Error('Invalid arguments; run adg serve --help');
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
  if (command === 'init') return (await import('./toolkit/project.mjs'))[command](config);
  if (command === 'compare') return (await import('./toolkit/compare.mjs')).compare(config, positionals, values);
  return (await import('./toolkit/commands.mjs'))[command](config, positionals, values);
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    const message = String(error.message).replace(/\s+/g, ' ').trim();
    console.error(`adg: ${message}`);
    process.exitCode = 2;
  });
}
