import path from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { configFile } from './config.mjs';
import { prepareDiffInputs } from './diff-inputs.mjs';
import { revisionChanges, currentHead } from './arch-git.mjs';
import { cleanup } from './results.mjs';
import { CliError } from '../cli-output.mjs';

const slash = name => name.split(path.sep).join('/');
const within = (name, directory) => name === directory || name.startsWith(directory + '/');

/** Literal local config imports supply path roles; opaque inputs retain unknown classification. */
export async function configInputFiles(config) {
  const found = new Set(), entry = configFile(config.root);
  async function visit(file) {
    file = await realpath(file);
    if (found.has(file)) return;
    found.add(file);
    const text = await readFile(file, 'utf8');
    for (const [, specifier] of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\(\s*)['"](\.[^'"]+)['"]/g)) {
      const requested = path.resolve(path.dirname(file), specifier);
      for (const candidate of [requested, ...['.ts', '.js', '.mjs', '/index.ts', '/index.js'].map(extension => requested + extension)]) {
        try { if ((await stat(candidate)).isFile()) { await visit(candidate); break; } }
        catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
      }
    }
  }
  if (entry) await visit(entry);
  return [...found];
}

/** Reuse diff's historical config, dependency environment and disposable-tree lifecycle. */
export async function prepareImpactInputs(config, values) {
  const sessions = [];
  try {
    const base = await prepareDiffInputs(config, [], { base: values.base }); sessions.push(base);
    let head;
    if (values.head !== undefined) { head = await prepareDiffInputs(config, [], { base: values.head }); sessions.push(head); }
    const before = base.before, after = head ? head.before : base.after;
    const projectPrefix = slash(path.relative(base.base.root, await realpath(config.root)));
    const outputs = [before, after].map(side => slash(path.join(projectPrefix, path.relative(side.config.root, side.config.output))));
    const excluded = name => name.split('/').some(part => ['.git', 'node_modules', '.adg'].includes(part)) || outputs.some(output => within(name, output));
    const changes = (await revisionChanges(base.base, head?.base)).filter(change => [change.before, change.after].some(name => name !== null && !excluded(name)));
    return {
      before: { config: before.config, revision: base.base },
      after: { config: after.config, revision: head?.base ?? null },
      query: { kind: 'git', base: { rev: base.base.rev, sha: base.base.sha }, head: head ? { rev: head.base.rev, sha: head.base.sha } : null },
      repository: base.base.root, projectPrefix, changes,
      head: head?.base.sha ?? await currentHead(base.base),
      warnings: sessions.flatMap(session => session.warnings),
      translate: value => sessions.reduce((result, session) => session.translateDiagnostic(result), value),
      async verifyChanges() {
        if (head) return;
        const current = (await revisionChanges(base.base)).filter(change => [change.before, change.after].some(name => name !== null && !excluded(name)));
        if (JSON.stringify(current) !== JSON.stringify(changes)) throw new CliError('IMPACT_INPUT_CHANGED', 'Git input inventory changed during query.');
      },
      async close() {
        let failure;
        for (const session of [...sessions].reverse()) {
          try { await session.close(); } catch (error) { failure ??= error; }
        }
        if (failure) throw failure;
      },
    };
  } catch (error) {
    for (const session of [...sessions].reverse()) await cleanup(() => session.close(), error);
    throw error;
  }
}
