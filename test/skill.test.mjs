import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.mjs';
import { defaultSkillsRoot, skillTargets } from '../src/skill.mjs';

function capture() {
  const result = { stdout: '', stderr: '', exits: [] };
  result.io = {
    stdout: text => { result.stdout += text; },
    stderr: text => { result.stderr += text; },
    exit: code => { result.exits.push(code); },
  };
  return result;
}

function envelope(result, command, ok, exitCode) {
  assert.deepEqual(result.exits, [exitCode]);
  const value = JSON.parse(result.stdout);
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.command, command);
  assert.equal(value.ok, ok);
  assert.equal(value.error === null, ok);
  return value;
}

test('contract: adg skill list and path expose bundled skills without project configuration', async () => {
  const listRun = capture();
  await main(['skill', '--json'], '/missing/project', listRun.io);
  const listed = envelope(listRun, 'skill list', true, 0);
  assert.equal(listed.data.root, defaultSkillsRoot);
  assert.deepEqual(listed.data.skills.map(item => item.name), ['adg-design', 'adg-setup']);
  for (const skill of listed.data.skills) {
    assert.ok(skill.description.length > 20);
    assert.ok(existsSync(skill.path));
  }

  const rootRun = capture();
  await main(['skill', 'path', '--json'], '/missing/project', rootRun.io);
  const rootPath = envelope(rootRun, 'skill path', true, 0);
  assert.equal(rootPath.data.root, defaultSkillsRoot);

  const singleRun = capture();
  await main(['skill', 'path', 'adg-setup', '--json'], '/missing/project', singleRun.io);
  const single = envelope(singleRun, 'skill path', true, 0);
  assert.equal(single.data.name, 'adg-setup');
  assert.equal(single.data.path, path.join(defaultSkillsRoot, 'adg-setup', 'SKILL.md'));

  const unknownRun = capture();
  await main(['skill', 'path', 'unknown-skill', '--json'], '/missing/project', unknownRun.io);
  const unknown = envelope(unknownRun, 'skill path', false, 2);
  assert.equal(unknown.error.code, 'USAGE_INVALID');
});

test('contract: adg skill install writes targets and custom dirs safely without touching siblings', async t => {
  const homeDir = mkdtempSync(path.join(os.tmpdir(), 'adg-skill-home-'));
  const workDir = mkdtempSync(path.join(os.tmpdir(), 'adg-skill-cwd-'));
  t.after(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  // Preserve unrelated sibling skills and replace stale files inside an ADG skill directory.
  const codexRoot = path.join(homeDir, ...skillTargets.codex);
  mkdirSync(path.join(codexRoot, 'unrelated-skill'), { recursive: true });
  writeFileSync(path.join(codexRoot, 'unrelated-skill', 'SKILL.md'), 'keep me\n');
  mkdirSync(path.join(codexRoot, 'adg-setup'), { recursive: true });
  writeFileSync(path.join(codexRoot, 'adg-setup', 'stale.txt'), 'remove me\n');

  const installTarget = capture();
  await main(['skill', 'install', '--target=codex', '--json'], workDir, { ...installTarget.io, skillOptions: { homeDir } });
  const targetRes = envelope(installTarget, 'skill install', true, 0);
  assert.equal(targetRes.data.target, 'codex');
  assert.equal(targetRes.data.directory, codexRoot);
  assert.deepEqual(targetRes.data.installed.map(item => item.name), ['adg-design', 'adg-setup']);
  assert.equal(readFileSync(path.join(codexRoot, 'unrelated-skill', 'SKILL.md'), 'utf8'), 'keep me\n');
  assert.equal(existsSync(path.join(codexRoot, 'adg-setup', 'stale.txt')), false);
  assert.equal(
    readFileSync(path.join(codexRoot, 'adg-setup', 'SKILL.md'), 'utf8'),
    readFileSync(path.join(defaultSkillsRoot, 'adg-setup', 'SKILL.md'), 'utf8'),
  );

  // Check every documented preset resolves inside the injected home directory.
  for (const target of Object.keys(skillTargets)) {
    const run = capture();
    await main(['skill', 'install', `--target=${target}`, 'adg-design', '--json'], workDir, { ...run.io, skillOptions: { homeDir } });
    const res = envelope(run, 'skill install', true, 0);
    assert.equal(res.data.directory, path.join(homeDir, ...skillTargets[target]));
    assert.deepEqual(res.data.installed.map(item => item.name), ['adg-design']);
    assert.ok(existsSync(path.join(res.data.directory, 'adg-design', 'SKILL.md')));
  }

  // Relative --dir resolves from cwd and installs only requested skills.
  const customRun = capture();
  await main(['skill', 'install', '--dir=.agents/skills', 'adg-setup', '--json'], workDir, customRun.io);
  const customRes = envelope(customRun, 'skill install', true, 0);
  assert.equal(customRes.data.target, null);
  assert.equal(customRes.data.directory, path.join(workDir, '.agents', 'skills'));
  assert.deepEqual(customRes.data.installed.map(item => item.name), ['adg-setup']);
  assert.equal(existsSync(path.join(workDir, '.agents', 'skills', 'adg-design')), false);

  // Guard against overwriting the bundled source directory in place.
  const selfRun = capture();
  await main(['skill', 'install', `--dir=${defaultSkillsRoot}`, '--json'], workDir, selfRun.io);
  const selfRes = envelope(selfRun, 'skill install', false, 2);
  assert.equal(selfRes.error.code, 'USAGE_INVALID');
  assert.ok(existsSync(path.join(defaultSkillsRoot, 'adg-setup', 'SKILL.md')));
});
