import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { prepareDiffInputs } from './diff-inputs.mjs';
import { revisionChanges, currentHead } from './arch-git.mjs';
import { cleanup } from './results.mjs';
import { CliError } from '../cli-output.mjs';

const slash = name => name.split(path.sep).join('/');
const within = (name, directory) => !directory || name === directory || name.startsWith(directory + '/');

export { configInputFiles } from './input-generation.mjs';

/** Reuse diff's historical config, dependency environment and disposable-tree lifecycle. */
export async function prepareImpactInputs(config, values) {
  const base = await prepareDiffInputs(config, [], values);
  try {
    const { before, after } = base;
    const head = after.revision;
    const projectPrefix = slash(path.relative(base.base.root, await realpath(config.root)));
    const outputs = [before, after].map(side => slash(path.join(projectPrefix, path.relative(side.config.root, side.config.output))));
    const artifacts = values['out-dir'] === undefined ? null : slash(path.relative(base.base.root, path.resolve(await realpath(config.root), values['out-dir'])));
    const excluded = name => name.split('/').some(part => ['.git', 'node_modules', '.adg'].includes(part)) || outputs.some(output => within(name, output)) || artifacts !== null && within(name, artifacts) && /\.(?:png|json)$/.test(name);
    const changes = (await revisionChanges(base.base, head)).filter(change => [change.before, change.after].some(name => name !== null && !excluded(name)));
    return {
      session: base,
      before: { config: before.config, revision: base.base },
      after: { config: after.config, revision: head ?? null },
      query: { kind: 'git', base: { rev: base.base.rev, sha: base.base.sha }, head: head ? { rev: head.rev, sha: head.sha } : null },
      repository: base.base.root, projectPrefix, changes,
      head: head?.sha ?? await currentHead(base.base),
      warnings: base.warnings,
      translate: base.translateDiagnostic,
      async verifyChanges() {
        if (head) return;
        const current = (await revisionChanges(base.base)).filter(change => [change.before, change.after].some(name => name !== null && !excluded(name)));
        if (JSON.stringify(current) !== JSON.stringify(changes)) throw new CliError('IMPACT_INPUT_CHANGED', 'Git input inventory changed during query.');
      },
      close: base.close,
    };
  } catch (error) {
    await cleanup(base.close, error);
    throw error;
  }
}
