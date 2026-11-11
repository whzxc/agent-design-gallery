import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_NAMES, LEGACY_CONFIG_NAMES, loadConfig } from './config.mjs';
import { refreshTypes, relative } from './project.mjs';
import { CliError, classifyError } from '../cli-output.mjs';

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules', '.sdg', '.adg'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : entry.isFile() ? [file] : [];
  });
}

// Keep source formatting, comments and ordinary string literals intact. Tokenize
// strings/comments first so text containing an import is never treated as code.
export function rewriteImports(source) {
  const tokens = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[\w$]+|[^\s]/g;
  let previous = [], result = '', end = 0;
  for (const match of source.matchAll(tokens)) {
    const value = match[0];
    if (value.startsWith('//') || value.startsWith('/*')) continue;
    if (/^["']/.test(value) && (['from', 'import'].includes(previous.at(-1)) ||
      (previous.at(-1) === '(' && previous.at(-2) === 'import'))) {
      const replacement = value.replace(/^(["'])sdg(?=["'/:])/, '$1adg');
      if (replacement !== value) {
        result += source.slice(end, match.index) + replacement;
        end = match.index + value.length;
      }
    }
    previous.push(value);
    if (previous.length > 2) previous.shift();
  }
  return result + source.slice(end);
}

export async function migrate(project = process.cwd(), log = console.log) {
  const root = path.resolve(project);
  const oldConfigs = LEGACY_CONFIG_NAMES.filter(name => existsSync(path.join(root, name)));
  const newConfigs = CONFIG_NAMES.filter(name => existsSync(path.join(root, name)));
  if (oldConfigs.length && newConfigs.length) throw new CliError('MIGRATION_CONFLICT', `Both old and new config names exist in ${root}; keep one configuration before running adg migrate.`, { context: { project: root } });
  const data = { project: root, complete: false, changes: [] };
  try {
    for (const name of oldConfigs) {
      const next = name.replace('sdg.', 'adg.');
      renameSync(path.join(root, name), path.join(root, next));
      data.changes.push({ action: 'renamed', path: path.join(root, next), from: path.join(root, name) });
      log(`Renamed ${name} -> ${next}`);
    }
    const config = await loadConfig(root, { checkVersion: false });
    if (config.root !== root) throw new CliError('PROJECT_NOT_FOUND', `No project configuration in ${root}; run adg migrate from the project root.`);
    const update = (file, next) => {
      const original = readFileSync(file, 'utf8');
      if (next === original) return;
      writeFileSync(file, next);
      data.changes.push({ action: 'updated', path: file, from: null });
      log(`Updated ${relative(config, file)}`);
    };
    for (const file of files(config.design)) {
      if (/\.[cm]?[jt]sx?$/.test(file)) update(file, rewriteImports(readFileSync(file, 'utf8')));
      if (/^tsconfig(?:\.[^.]+)*\.json$/.test(path.basename(file))) {
        update(file, readFileSync(file, 'utf8')
          .replace(/(["'])sdg(?=["'/:])/g, '$1adg').replace(/\.sdg(?=[/\\])/g, '.adg'));
      }
    }
    for (const file of files(root).filter(file => path.basename(file) === '.gitignore')) {
      update(file, readFileSync(file, 'utf8').replace(/^(?!\s*#)(.*)$/gm, line => line.replace(/(^|\/)\.sdg(?=\/|\r?$)/g, '$1.adg')));
    }
    const oldGenerated = path.join(config.design, '.sdg');
    if (existsSync(oldGenerated)) {
      rmSync(oldGenerated, { recursive: true });
      data.changes.push({ action: 'deleted', path: oldGenerated, from: null });
      log(`Deleted ${relative(config, oldGenerated)}/`);
    }
    refreshTypes(config, data.changes);
    log(`Regenerated ${relative(config, path.join(config.design, '.adg'))}/`);
    data.complete = true;
    return data;
  } catch (error) {
    if (!data.changes.length) throw error;
    if (error instanceof CliError) { error.data = data; throw error; }
    throw new CliError(classifyError(error).error.code, error.message, { cause: error, data });
  }
}
