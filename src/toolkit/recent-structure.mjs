import { declarations } from './frame-declarations.mjs';
import path from 'node:path';
import { liveDependencies } from './input-generation.mjs';
import { readFile } from 'node:fs/promises';
import { prepareImpactInputs } from './impact-inputs.mjs';
import { canonicalBytes } from './impact-proof.mjs';
import { impact } from './impact.mjs';
import { openProjectIndex } from './project-index.mjs';
import { readGroups, relative, sourceFeature } from './project.mjs';

function inventoryMoves(rows, renames, complete) {
  const removed = rows.filter((r) => r.status === 'removed'),
    added = rows.filter((r) => r.status === 'added');
  const paired = new Map(),
    consumed = new Set();
  // Git source rename plus stable frame name wins even when several sources use that name.
  // Otherwise a name must occur only once in each complete endpoint inventory.
  const afterById = new Map(added.map((r) => [JSON.stringify([r.source, r.frame]), r]));
  for (const old of removed) {
    const next = afterById.get(JSON.stringify([renames.get(old.source), old.frame]));
    if (next) {
      paired.set(next, old);
      consumed.add(old);
    }
  }
  if (!complete) return { paired, consumed };
  const before = new Map(),
    after = new Map();
  for (const row of rows) {
    if (row.before) before.set(row.frame, before.has(row.frame) ? null : row);
    if (row.after) after.set(row.frame, after.has(row.frame) ? null : row);
  }
  for (const old of removed) {
    const next = after.get(old.frame);
    if (!consumed.has(old) && before.get(old.frame) === old && next?.status === 'added' && !paired.has(next)) {
      paired.set(next, old);
      consumed.add(old);
    }
  }
  return { paired, consumed };
}

export async function structuralChanges(config, options) {
  const started = performance.now();
  const inputs = await prepareImpactInputs(config, options);
  // An immutable documentation-only range outside both design and architecture trees
  // has identical source inputs. Config imports and the effective capture policy still count.
  const endpoints = [inputs.session.before, inputs.session.after];
  const policy = ({ config: c }) =>
    canonicalBytes({
      sources: c.sources,
      design: relative(c, c.design),
      arch: c.arch && relative(c, c.arch),
      check: c.check,
      diff: c.diff
    });
  if (
    options.head &&
    !inputs.session.globalChanges.length &&
    policy(endpoints[0]) === policy(endpoints[1]) &&
    inputs.session.changes
      .flatMap((c) => [c.before, c.after])
      .filter(Boolean)
      .every(
        (file) =>
          /\.(md|txt)$/i.test(file) &&
          endpoints.every(
            ({ config: c, sources }) =>
              !sources.has(file) &&
              !file.startsWith(relative(c, c.design) + '/') &&
              !(c.arch && file.startsWith(relative(c, c.arch) + '/'))
          )
      )
  ) {
    await inputs.close();
    return {
      rows: [],
      globalCauses: [],
      dependencies: [],
      failures: [],
      complete: true,
      timings: { prepareMs: performance.now() - started }
    };
  }
  let projection;
  const { data } = await impact(
    config,
    { ...options, json: true },
    {
      prepareInputs: async () => inputs,
      tolerateSourceFailures: true,
      openIndex: (config, opts) => openProjectIndex(config, { ...opts, frameOrigins: true }),
      async consume({ views, rows, data, assessments, inputs }) {
        const facts = new Map(data.facts.map((f) => [f.id, f]));
        const globalCauses = [
          ...new Set(
            data.changes.filter((c) => ['config', 'environment'].includes(c.role)).map((c) => c.after ?? c.before)
          )
        ].sort();
        const changed = new Set(
          data.facts.filter((f) => ['source', 'architecture'].includes(f.kind)).map((f) => f.source)
        );
        const sides = await Promise.all(
          views.map(async (view) => {
            const { config } = view,
              code = new Map(),
              chapters = new Map();
            for (const group of readGroups(config.design, config.sources))
              for (const file of group.assets)
                chapters.set(relative(config, path.join(config.design, file)), group.title);
            for (const file of changed) {
              if (!file?.endsWith('.tsx') || !view.index.inventory.tsx.includes(file)) continue;
              if (data.failures.some((f) => f.source === file)) continue;
              code.set(file, declarations(await readFile(path.join(config.root, file), 'utf8')));
            }
            const frames = new Map();
            for (const [source, built] of view.built)
              frames.set(source, new Map(built.frames.map((f) => [f.name, f])));
            const feature = (file) =>
              sourceFeature(path.posix.relative(relative(config, config.design), file), config.sources);
            return { code, chapters, frames, feature };
          })
        );
        const result = [];
        const renames = new Map(inputs.session.renames.map((r) => [r.before, r.after]));
        const { paired, consumed } = inventoryMoves(rows, renames, !data.failures.length);
        const changedPaths = new Set(inputs.session.changes.flatMap((c) => [c.before, c.after]));
        for (const row of rows) {
          if (consumed.has(row)) continue;
          const { source, frame } = row,
            entry = { source, frame, status: row.status };
          const chapter = sides[row.after ? 1 : 0].chapters.get(source);
          if (chapter) entry.chapter = chapter;
          if (row.status !== 'matched') {
            const old = paired.get(row);
            if (old) Object.assign(entry, { status: 'moved', former: { source: old.source, frame: old.frame } });
            result.push(entry);
            continue;
          }
          const causes = new Set();
          const inputsChanged = ['light', 'dark']
            .map((t) => assessments.get(JSON.stringify([source, frame, t])))
            .filter((a) => a && a.disposition !== 'proven_unaffected');
          for (const assessment of inputsChanged)
            for (const reason of assessment.reasons) {
              const fact = facts.get(reason.fact);
              if (!fact?.source || reason.scope === 'support') continue;
              if (
                fact.source !== source &&
                ['token', 'source', 'global_css'].includes(fact.kind) &&
                (fact.kind !== 'global_css' ||
                  views.some((v) => v.facts.get(source)?.dependencies.includes(fact.source)))
              )
                causes.add(fact.source);
              if (fact.kind === 'architecture')
                for (const i of fact.pathIndexes) {
                  const file = path.posix.relative(
                    inputs.projectPrefix || '.',
                    data.changes[i].after ?? data.changes[i].before
                  );
                  if (file !== source) causes.add(file);
                }
            }
          const [old, current] = sides.map((s) => s.frames.get(source)?.get(frame));
          const fragments = sides.map((side, i) => {
            const declared = i ? current : old,
              loc = declared?.declaration;
            return loc && side.code.get(loc.source)?.site(loc);
          });
          let direct = fragments[0] !== fragments[1];
          const owners = [...(row.before.parts ?? []), ...(row.after.parts ?? [])];
          for (const { source: file, part } of owners) {
            if (!changed.has(file)) continue;
            if (sides[0].code.get(file)?.part(part) === sides[1].code.get(file)?.part(part)) continue;
            if (sides[1].feature(file) === sides[1].feature(source)) direct = true;
          }
          // Generated values or a local unexported helper can change the individual
          // frame while the JSX at its call site stays the same. Ignore sheet-wide CSS.
          const ownChanged = changedPaths.has(source);
          if (ownChanged && !causes.size && (source.endsWith('.mmd') || localFrame(old) !== localFrame(current)))
            direct = true;
          if (!direct && !causes.size) continue;
          result.push({ ...entry, status: 'changed', ...(!direct ? { causes: [...causes].sort() } : {}) });
        }
        projection = {
          rows: result,
          globalCauses,
          complete: !data.failures.length,
          failures: data.failures,
          dependencies: await liveDependencies(views, options.temporaryDirectory)
        };
      }
    }
  );
  return { ...projection, timings: { ...data.timings, totalMs: performance.now() - started } };
}
function localFrame(frame) {
  if (!frame) return '';
  const { declaration, document, ...props } = frame;
  return JSON.stringify(props);
}
