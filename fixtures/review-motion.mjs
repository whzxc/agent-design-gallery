import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { starterTokens } from '../src/toolkit/project.mjs';

// A two-phase interaction with byte-identical resting frames across revisions.
export async function prepareMotionReview(directory, { brokenBase = false } = {}) {
  const project = path.join(directory, 'Atlas');
  const owner = 'design/components/details.tsx';
  await mkdir(path.join(project, 'design/components'), { recursive: true });
  const put = (file, text) => writeFile(path.join(project, file), text);
  const git = (...args) => execFileSync('git', ['-C', project, ...args]);
  const frame = (name, text) => `<Frame name="${name}" width={160} height={64}><div class="p-2">
    <button data-adg-id="toggle">Details</button><span data-adg-id="value">${text}</span></div></Frame>`;
  const source = `import { Frame } from 'adg'; export default () => [${frame('closed','')},${frame('open','Ready')}];`;
  const edge = { id: 'open-details', label: 'Open details', from: { source: owner, frame: 'closed' },
    to: { source: owner, frame: 'open' }, trigger: { on: 'click', target: { anchor: 'toggle' } },
    duration: '--details', easing: '--ease', reduced: 'instant', interrupt: 'finish', focus: 'frame',
    phases: ['toggle', 'value'].map((anchor, i) => [{ mode: 'crossfade', targets: [{anchor}], properties: ['opacity'],
      ...(i ? {duration:'--fast'} : {}) }]) };
  const edges = (list = [edge]) => put(owner.replace('.tsx','.motion.json'), JSON.stringify({version:1, edges:list}));
  const tokens = (ms = 100) => put('design/tokens.css', starterTokens.replace(':root {',
    `:root {\n  --base: ${ms}ms;\n  --details: var(--base);\n  --fast: 40ms;\n  --ease: linear;`));
  await put('adg.config.mjs', "export default {name:'Atlas'};");
  await put('.gitignore', 'output/\ndesign/.adg/\n');
  await put(owner, brokenBase ? 'export default () => <broken;' : source);
  await tokens();
  await edges();
  git('init','-q');
  git('add','.');
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture: initial motion');
  if (brokenBase) await put(owner, source);
  return {project, edge, edges, tokens};
}
