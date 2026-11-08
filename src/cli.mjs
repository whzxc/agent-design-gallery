#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { VERSION, loadConfig } from './toolkit/config.mjs';

export const commands = ['open', 'serve', 'root', 'init', 'check', 'render', 'compare'];
const usage = {
  open: '[directory] [--port=<n>] [--no-open] [--state-dir=<path>]',
  serve: '[--port=4310] [--state-dir=<path>] [--print-key | --rotate-key]',
  root: 'add <dir> [--depth=2] | remove <dir> | list | scan [dir] [--state-dir=<path>]',
  init: '', check: '[source...] [--read-only]', render: '[source...] [--frame=<name>] [--scale=2]',
  compare: '<source> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css> | --page] [--origin="<x> <y>"] [--click=<name>...] [--viewport=<w>x<h>] | --all',
};
const details = {
  serve: 'Run the resident multi-project hub on 127.0.0.1. Projects build on viewer access and idle viewers stop after five minutes. --print-key prints the key and exits; --rotate-key rotates the running hub key and exits. Forwarded data requests require a header or query key; direct-local requests are exempt.',
  root: 'Manage registered scan roots. add scans immediately. scan rescans registered roots only; depth is 0 through 3. Hidden directories, node_modules and Git worktrees are skipped.',
  open: 'Browse TSX sources and legacy SVG designs on an independent random-port server.', init: 'Create design sources, tokens and editor configuration without overwriting files.',
  check: 'Check import direction and every selected frame in both themes. --read-only skips generated types and build files.', render: 'Render each selected frame in both themes. Scale defaults to 2.',
  compare: 'Compare fixture text positions. Flags override Frame fixture and capture. --all writes a summary for every fixture frame.',
};
export function help(command) {
  if (command) return `Usage: sdg ${command} ${usage[command]}\n\n${details[command]}\n\n-h, --help  Show help\nExit codes: 0 success, 1 check/compare problems, 2 usage/configuration/environment error.`;
  return `Usage: sdg [open] [directory] [options]\n\n${commands.map(name => `  sdg ${name} ${usage[name]}`).join('\n')}\n\nAny first argument that is not a command opens a directory. Use sdg open check for a directory named check.\nRun sdg <command> --help for details. -v, --version prints the installed version.`;
}
export function parseCli(args) {
  const explicit = commands.includes(args[0]), command = explicit ? args[0] : 'open';
  const options = { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } };
  const strings = { open: ['port', 'state-dir'], serve: ['port', 'state-dir'], root: ['depth', 'state-dir'], render: ['scale', 'frame'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport', 'origin'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
  if (command === 'serve') for (const name of ['print-key', 'rotate-key']) options[name] = { type: 'boolean' };
  if (command === 'open') options['no-open'] = { type: 'boolean' };
  if (command === 'check') options['read-only'] = { type: 'boolean' };
  if (command === 'compare') { options.all = { type: 'boolean' }; options.page = { type: 'boolean' }; }
  if (command === 'compare') options.click = { type: 'string', multiple: true };
  let parsed;
  try { parsed = parseArgs({ args: explicit ? args.slice(1) : args, options, allowPositionals: true }); }
  catch (error) { throw new Error(`${error.message}; run sdg ${command} --help`); }
  const { values, positionals } = parsed;
  if (!values.help && !values.version) {
    if ((command === 'init' && positionals.length) || (command === 'open' && positionals.length > 1) || (command === 'compare' && (values.all ? positionals.length || values.frame : positionals.length !== 1 || !values.frame))) throw new Error(`Invalid arguments; run sdg ${command} --help`);
  }
  return { command, values, positionals, explicit };
}
export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const { command, values, positionals, explicit } = parseCli(args);
  if (values.help) { console.log(help(explicit ? command : undefined)); return 0; }
  if (values.version) { console.log(VERSION); return 0; }
  if (command === 'open') return (await import('./open.mjs')).open(positionals, values);
  if (command === 'root') {
    const [action, directory, ...extra] = positionals;
    if (extra.length || !['add', 'remove', 'list', 'scan'].includes(action) || (['add', 'remove'].includes(action) && !directory) || (action === 'list' && directory) || (values.depth !== undefined && action !== 'add')) throw new Error('Invalid arguments; run sdg root --help');
    const registry = await import('./hub/registry.mjs');
    const state = values['state-dir'];
    const result = action === 'add' ? await registry.addRoot(directory, values.depth === undefined ? 2 : Number(values.depth), state)
      : action === 'remove' ? await registry.removeRoot(directory, state)
      : action === 'scan' ? await registry.scanRoots(directory, state) : await registry.listRoots(state);
    console.log(JSON.stringify(result, null, 2)); return 0;
  }
  if (command === 'serve') {
    if (positionals.length) throw new Error('Invalid arguments; run sdg serve --help');
    if (values['print-key'] || values['rotate-key']) {
      const key = await (await import('./hub/auth.mjs')).hubKey(values['state-dir'], { rotate: !!values['rotate-key'] });
      console.log(values['print-key'] ? key : 'Hub key rotated.'); return 0;
    }
    const port = values.port === undefined ? 4310 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535.');
    const hub = await (await import('./hub.mjs')).startHub({ port, stateDirectory: values['state-dir'] });
    console.log(`SDG: ${hub.url}`);
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
    console.error(`sdg: ${message}`);
    process.exitCode = 2;
  });
}
