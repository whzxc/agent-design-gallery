import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import example from '../design/fixtures/review-motion.json' with { type: 'json' };
import { commit } from './hub-compare.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

// A two-phase interaction with byte-identical resting frames across revisions.
export async function prepareMotionReview(directory, { brokenBase = false } = {}) {
  const project = path.join(directory, example.project.name);
  const owner = example.source;
  await mkdir(path.join(project, 'design/components'), { recursive: true });
  const put = (file, text) => writeFile(path.join(project, file), text);
  const frame = (name, text) => `<Frame name="${name}" width={160} height={64}><div class="p-2">
    <button data-adg-id="${example.trigger.anchor}">${example.trigger.text}</button><span data-adg-id="${example.value.anchor}">${text}</span></div></Frame>`;
  const source = `import { Frame } from 'adg'; export default () => [${frame(example.from,'')},${frame(example.to,example.value.text)}];`;
  const edge = { id: example.id, label: example.label, from: { source: owner, frame: example.from },
    to: { source: owner, frame: example.to }, trigger: { on: 'click', target: { anchor: example.trigger.anchor } },
    duration: example.before.token, easing: '--ease', reduced: 'instant', interrupt: 'finish', focus: example.focus,
    phases: [example.trigger.anchor, example.value.anchor].map((anchor, i) => [{ mode: 'crossfade', targets: [{anchor}], properties: ['opacity'],
      ...(i ? {duration:example.after.token} : {}) }]) };
  const edges = (list = [edge]) => put(owner.replace('.tsx','.motion.json'), JSON.stringify({version:1, edges:list}));
  const tokens = (ms = example.before.ms) => put('design/tokens.css', starterTokens.replace(':root {',
    `:root {\n  --base: ${ms}ms;\n  ${example.before.token}: var(--base);\n  ${example.after.token}: ${example.after.ms}ms;\n  --ease: linear;`));
  await put('adg.config.mjs', `export default {name:${JSON.stringify(example.project.name)}};`);
  await put('.gitignore', 'output/\ndesign/.adg/\n');
  await put(owner, brokenBase ? 'export default () => <broken;' : source);
  await tokens();
  await edges();
  execFileSync('git', ['-C', project, 'init', '-q']);
  await commit(project, 'fixture: initial motion', '2025-12-31T23:40:00Z');
  if (brokenBase) await put(owner, source);
  return {project, edge, edges, tokens};
}

export async function prepareMotionCompare(directory) {
  const { project, edge, edges } = await prepareMotionReview(directory);
  await edges([{ ...edge, duration: example.after.token }]);
  await commit(project, 'fixture: shorten details transition', '2025-12-31T23:48:00Z');
  return project;
}
