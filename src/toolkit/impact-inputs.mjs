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
  const sessions = [];
  try {
    const base = await prepareDiffInputs(config, [], { base: values.base }); sessions.push(base);
    let head;
    if (values.head !== undefined) { head = await prepareDiffInputs(config, [], { base: values.head }); sessions.push(head); }
    const before = base.before, after = head ? head.before : base.after;
    const projectPrefix = slash(path.relative(base.base.root, await realpath(config.root)));
    const outputs = [before, after].map(side => slash(path.join(projectPrefix, path.relative(side.config.root, side.config.output))));
    const artifacts = values['out-dir'] === undefined ? null : slash(path.relative(base.base.root, path.resolve(await realpath(config.root), values['out-dir'])));
    const excluded = name => name.split('/').some(part => ['.git', 'node_modules', '.adg'].includes(part)) || outputs.some(output => within(name, output)) || artifacts !== null && within(name, artifacts) && /\.(?:png|json)$/.test(name);
    const changes = (await revisionChanges(base.base, head?.base)).filter(change => [change.before, change.after].some(name => name !== null && !excluded(name)));
    return {
      session: base,
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
