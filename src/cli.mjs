#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { VERSION, loadConfig } from './toolkit/config.mjs';

export const commands = ['open', 'init', 'check', 'render', 'compare'];
const usage = {
  open: '[directory] [--port=<n>] [--no-open] [--state-dir=<path>]',
  init: '', check: '[source...] [--read-only]', render: '[source...] [--frame=<name>] [--scale=2]',
  compare: '<source> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css> | --page] [--origin="<x> <y>"] [--click=<name>...] [--viewport=<w>x<h>] | --all',
};
const details = {
  open: 'Browse TSX sources and legacy SVG designs.', init: 'Create design sources, tokens and editor configuration without overwriting files.',
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
  const strings = { open: ['port', 'state-dir'], render: ['scale', 'frame'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport', 'origin'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
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
