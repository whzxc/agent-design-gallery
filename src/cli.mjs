#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { VERSION, loadConfig } from './toolkit/config.mjs';

export const commands = ['open', 'init', 'sync', 'check', 'render', 'measure', 'compare'];
const usage = {
  open: '[directory] [--port=<n>] [--no-open] [--state-dir=<path>]',
  init: '', sync: '', check: '[asset...]', render: '[asset...] [--scale=2]',
  measure: '<text> [--size=<px|token>] [--weight=400] [--mono]',
  compare: '<asset> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css>] [--click=<name>...] [--viewport=<w>x<h>]',
};
const details = {
  open: 'Browse SVG designs. Omit directory to open recent directories. --port defaults to automatic; --no-open prints the URL; --state-dir isolates preferences.',
  init: 'Create sdg.config.mjs, required tokens and component/surface directories. Existing paths are skipped.',
  sync: 'Rewrite the generated token region in every asset from tokens.css.',
  check: 'Check selected assets, or all assets, in both themes. Exit 1 means asset problems; run sdg sync for stale tokens.',
  render: 'Write <asset>-light.png and <asset>-dark.png under the configured output directory. --scale defaults to 2.',
  measure: 'Print text width in pixels. --size accepts pixels (14 or 14px) or a --text-* suffix (body). --mono uses --font-mono.',
  compare: 'Compare one frame using the sdg.config.mjs adapter. --fixture defaults to data-fixture. Declared viewports capture a page clip; otherwise use --region or --selector. Clicks run in order. Exit 1 means differences above 2px or unmatched texts.',
};
export function help(command) {
  if (command) return `Usage: sdg ${command} ${usage[command]}\n\n${details[command]}\n\n-h, --help  Show help\nExit codes: 0 success, 1 check/compare problems, 2 usage/configuration/environment error.`;
  return `Usage: sdg [open] [directory] [options]\n\n${commands.map(name => `  sdg ${name} ${usage[name]}`).join('\n')}\n\nAny first argument that is not a command opens a directory. Use sdg open check for a directory named check.\nRun sdg <command> --help for details. -v, --version prints the installed version.`;
}
export function parseCli(args) {
  const explicit = commands.includes(args[0]), command = explicit ? args[0] : 'open';
  const options = { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } };
  const strings = { open: ['port', 'state-dir'], render: ['scale'], measure: ['size', 'weight'], compare: ['frame', 'fixture', 'region', 'selector', 'viewport'] };
  for (const name of strings[command] ?? []) options[name] = { type: 'string' };
  if (command === 'open') options['no-open'] = { type: 'boolean' };
  if (command === 'measure') options.mono = { type: 'boolean' };
  if (command === 'compare') options.click = { type: 'string', multiple: true };
  let parsed;
  try { parsed = parseArgs({ args: explicit ? args.slice(1) : args, options, allowPositionals: true }); }
  catch (error) { throw new Error(`${error.message}; run sdg ${command} --help`); }
  const { values, positionals } = parsed;
  if (!values.help && !values.version) {
    if ((['init', 'sync'].includes(command) && positionals.length) || (command === 'open' && positionals.length > 1) || (['measure', 'compare'].includes(command) && positionals.length !== 1) || (command === 'compare' && !values.frame)) throw new Error(`Invalid arguments; run sdg ${command} --help`);
  }
  return { command, values, positionals, explicit };
}
export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const { command, values, positionals, explicit } = parseCli(args);
  if (values.help) { console.log(help(explicit ? command : undefined)); return 0; }
  if (values.version) { console.log(VERSION); return 0; }
  if (command === 'open') return (await import('./open.mjs')).open(positionals, values);
  const config = await loadConfig(cwd);
  if (command === 'init' || command === 'sync') return (await import('./toolkit/project.mjs'))[command](config);
  if (command === 'compare') return (await import('./toolkit/compare.mjs')).compare(config, positionals, values);
  return (await import('./toolkit/commands.mjs'))[command](config, positionals, values);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    const message = String(error.message).replace(/\s+/g, ' ').trim();
    console.error(`sdg: ${message}; review sdg ${commands.includes(process.argv[2]) ? process.argv[2] : 'open'} --help and the named configuration/path`);
    process.exitCode = 2;
  });
}
