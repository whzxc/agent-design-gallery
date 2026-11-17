import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chapterWarnings } from '../src/toolkit/asset-rules.mjs';
import { main } from '../src/cli.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

test('chapter guidance groups unassigned components and modules and limits actual unique sources', () => {
  const files = ['components/a.tsx', 'modules/feature/index.tsx', 'surfaces/a.tsx', 'studies/a.tsx'];
  const warnings = chapterWarnings(files, [], ['components', 'modules', 'surfaces', 'studies']);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, 'CHAPTER_SOURCES_UNASSIGNED');
  assert.equal(warnings[0].count, 2);
  assert.deepEqual(warnings[0].paths, files.slice(0, 2));
  assert.deepEqual(chapterWarnings(['modules/feature/helper.tsx'], [], ['components','modules','surfaces']), []);
  const many = Array.from({ length: 13 }, (_, i) => `atoms/${i}.tsx`);
  const groups = [{ title: 'Controls', assets: [...many, many[0], 'atoms/missing.tsx'] }];
  assert.deepEqual(chapterWarnings(many, groups, ['atoms', 'features', 'pages']).map(w => [w.code,w.count]), [['CHAPTER_TOO_LARGE',13]]);
  assert.deepEqual(chapterWarnings(many.slice(0,12), groups, ['atoms', 'features', 'pages']), []);
});

test('check emits chapter warnings in JSON and plain text without failing', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-chapters-'));
  t.after(() => rm(root,{ recursive:true,force:true }));
  await mkdir(path.join(root,'design/components'),{recursive:true});
  await writeFile(path.join(root,'adg.config.mjs'),'export default { check: {singleConsumer:false} };');
  await writeFile(path.join(root,'design/tokens.css'), starterTokens);
  await writeFile(path.join(root,'design/components/item.tsx'), 'import {Frame} from "adg";export default()=> <Frame name="a"><div class="bg-canvas text-text">Item</div></Frame>;');
  let stdout='',stderr='';
  const io={stdout:s=>{stdout+=s;},stderr:s=>{stderr+=s;},exit:()=>{}};
  assert.equal(await main(['check','--read-only','--json'],root,io),0);
  const result=JSON.parse(stdout);
  assert.equal(result.data.complete,true);
  assert.equal(result.data.summary.problems,0);
  assert.deepEqual(result.warnings.find(w=>w.code==='CHAPTER_SOURCES_UNASSIGNED').paths,['components/item.tsx']);
  stdout='';stderr='';
  assert.equal(await main(['check','--read-only'],root,io),0);
  assert.match(stdout+stderr,/WARNING 1 component\/module sources have no gallery.json chapter/);
});
