import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { commandIdentity, commands, help, jsonRequested, main, parseCli } from '../src/cli.mjs';
import { CliError, classifyError, createOutput, errorCatalog, nextActions, sanitize } from '../src/cli-output.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const key = `adg_${'a'.repeat(64)}`;
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
  assert.ok(result.stdout.endsWith('\n'));
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(value).sort(), ['command', 'data', 'error', 'ok', 'schemaVersion', 'warnings']);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.command, command);
  assert.equal(value.ok, ok);
  assert.ok(Array.isArray(value.warnings));
  assert.equal(value.error === null, ok);
  assert.deepEqual(result.exits, [exitCode]);
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /\x1b/);
  return value;
}

const invocations = [
  ['open'], ['link', 'http://127.0.0.1:4311/'], ['serve'],
  ['root', 'add', '/tmp/project'], ['root', 'remove', '/tmp/project'], ['root', 'list'], ['root', 'scan'],
  ...['install', 'uninstall', 'status', 'logs', 'migrate'].map(action => ['service', action]),
  ['migrate'], ['init'], ['check'], ['render'], ['compare', 'surfaces/demo', '--frame=default'],
  ['diff', '--base=HEAD'],
  ['owner', '--file=ui/controls.tsx'],
];

test('global JSON parsing and canonical identities cover every command/action without executing it', () => {
  for (const args of invocations) {
    const expected = ['root', 'service'].includes(args[0]) ? args.slice(0, 2).join(' ') : args[0];
    for (const argv of [['--json', ...args], [...args, '--json']]) {
      const parsed = parseCli(argv);
      assert.equal(parsed.values.json, true, argv.join(' '));
      assert.equal(commandIdentity(parsed), expected);
    }
  }
  const implicit = parseCli(['--json', 'design', '--no-open']);
  assert.equal(commandIdentity(implicit), 'open');
  assert.deepEqual(implicit.positionals, ['design']);
  assert.deepEqual(parseCli(['open', '--', '--json']).positionals, ['--json']);
  assert.equal(jsonRequested(['open', '--', '--json']), false);
  assert.equal(jsonRequested(['render', '--frame=--json']), false);
  assert.equal(jsonRequested(['--json', 'open', '--', '--json']), true);
  assert.throws(() => parseCli(['--json', 'render', '--scale', '--json']), /argument/);
});

test('help/version use the injected entry and bypass project configuration', async () => {
  for (const args of [[], ...commands.map(command => [command]), ...invocations.filter(args => ['root', 'service'].includes(args[0])).map(args => args.slice(0, 2))]) {
    const result = capture();
    assert.equal(await main(['--json', ...args, '--help'], '/missing/project', result.io), 0);
    const value = envelope(result, 'help', true, 0);
    const subject = args.length ? args.join(' ') : null;
    assert.equal(value.data.subject, subject);
    assert.equal(value.data.text, help(args[0]));
    assert.equal(value.data.usage, value.data.text.split('\n')[0]);
  }
  for (const args of [['--version', '--json'], ['--json', 'check', '-v']]) {
    const result = capture();
    await main(args, '/missing/project', result.io);
    assert.deepEqual(envelope(result, 'version', true, 0).data, { version });
  }
  const result = capture();
  await main(['--json', '--version', '--help'], '/missing/project', result.io);
  envelope(result, 'help', true, 0);
});

test('parse and dispatch-usage failures produce JSON before loading any command module', async () => {
  const failures = [
    [['--unknown'], 'adg'], [['open', 'a', 'b'], 'open'], [['link'], 'link'],
    [['serve', 'extra'], 'serve'], [['root', 'add'], 'root add'], [['root', 'invalid'], 'root'],
    [['root', 'list', 'extra'], 'root list'], [['service', 'invalid'], 'service'],
    [['service', 'status', '--port=4000'], 'service status'], [['migrate', 'a', 'b'], 'migrate'],
    [['init', 'extra'], 'init'], [['check', '--unknown'], 'check'], [['render', '--unknown'], 'render'],
    [['compare', 'surfaces/demo'], 'compare'], [['root', 'invalid', '--help'], 'root'],
    [['render', '--scale'], 'render'],
    [['diff'], 'diff'], [['diff', '--base='], 'diff'], [['diff', '--base=HEAD', '--unknown'], 'diff'],
  ];
  for (const [args, command] of failures) {
    const result = capture();
    await main(['--json', ...args], '/missing/project', result.io);
    const value = envelope(result, command, false, 2);
    assert.equal(value.data, null);
    assert.equal(value.error.code, 'USAGE_INVALID');
    for (const action of value.error.next) assert.equal(parseCli(action.argv.slice(1)).values.help, true);
  }
  const after = capture();
  await main(['render', '--unknown', '--json'], '/missing/project', after.io);
  envelope(after, 'render', false, 2);
});

test('human help, version and usage output retain their existing text and channels', async () => {
  for (const [args, expected] of [[['--help'], help()], [['root', 'add', '--help'], help('root')], [['--version'], version]]) {
    const result = capture();
    await main(args, '/missing/project', result.io);
    assert.equal(result.stdout, `${expected}\n`);
    assert.equal(result.stderr, '');
    assert.deepEqual(result.exits, [0]);
  }
  const result = capture();
  await main(['init', 'extra'], '/missing/project', result.io);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'adg: Invalid arguments; run adg init --help\n');
  assert.deepEqual(result.exits, [2]);
});

test('one serializer keeps human logs on stderr and strings inside one JSON record', () => {
  const result = capture(), output = createOutput({ json: true, command: 'version', ...result.io });
  output.log('Loading'); output.progress('Progress');
  output.success({ text: 'line one\nline two', color: '\x1b[31mred\x1b[0m', key });
  assert.equal(result.stderr, 'Loading\nProgress\n');
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  assert.deepEqual(JSON.parse(result.stdout).data, { text: 'line one\nline two', color: 'red', key: '[REDACTED]' });
  const empty = capture();
  createOutput({ json: true, command: 'version', ...empty.io }).success(undefined);
  assert.equal(JSON.parse(empty.stdout).data, null);
});

function parseAction(action) {
  assert.ok(action.reason.length > 0);
  assert.ok(action.argv.every(value => typeof value === 'string'));
  if (action.argv[0] === 'adg') return parseCli(action.argv.slice(1));
  // External recovery tools have no ADG parser; pin the complete allowed argv shapes.
  if (action.argv[0] === 'npm') assert.deepEqual(action.argv, ['npm', 'install', '-g', '@whzxc/agent-design-gallery']);
  else if (action.argv[0] === 'npx') assert.deepEqual(action.argv, ['npx', `playwright@${JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).dependencies.playwright}`, 'install', 'chromium']);
  else if (action.argv.length === 2) assert.deepEqual(action.argv, ['git', '--version']);
  else {
    assert.deepEqual(action.argv.slice(0, 3), ['git', '-C', '/tmp/project']);
    assert.ok([['rev-parse', '--show-toplevel'], ['log', '-5', '--oneline'], ['status', '--short']].some(values => JSON.stringify(values) === JSON.stringify(action.argv.slice(3))));
  }
}

test('all catalog codes have stable exits, exact recovery argv and parser-valid ADG actions', () => {
  assert.equal(Object.keys(errorCatalog).length, 46);
  for (const removed of ['CONFIG_LOAD_FAILED', 'GIT_REPOSITORY_REQUIRED', 'GIT_BASE_NOT_FOUND', 'GIT_READ_FAILED']) assert.equal(Object.hasOwn(errorCatalog, removed), false);
  for (const code of Object.keys(errorCatalog)) {
    assert.match(code, /^[A-Z][A-Z_]+$/);
    const data = { complete: ['CHECK_FAILED', 'COMPARE_FAILED', 'DIFF_FAILED'].includes(code) };
    const failure = classifyError(new CliError(code, `Message for ${code}`, { data }), {
      command: 'compare', project: '/tmp/project', stateDirectory: '/tmp/state with spaces',
      positionals: ['surfaces/demo'], values: { frame: 'default', click: ['Open panel', 'Continue'], viewport: '800x600' },
    });
    assert.equal(failure.error.code, code);
    assert.equal(failure.exitCode, ['CHECK_FAILED', 'COMPARE_FAILED', 'DIFF_FAILED'].includes(code) ? 1 : 2);
    assert.equal(failure.data, data);
    assert.ok(failure.error.next.length > 0);
    failure.error.next.forEach(parseAction);
    nextActions(code).forEach(parseAction);
  }
});

test('recovery actions preserve scope, separators, subcommands, state and cause-specific Git actions', () => {
  for (const gitCause of ['repository', 'revision', 'read']) nextActions('GIT_BASE_INVALID', { project: '/tmp/project', gitCause }).forEach(parseAction);
  for (const command of ['service install', 'root add', 'open', 'adg', 'unknown command']) nextActions('USAGE_INVALID', { command }).forEach(parseAction);
  nextActions('MIGRATION_CONFLICT', { command: 'service migrate', stateDirectory: '/tmp/state' }).forEach(parseAction);
  const selection = { command: 'compare', positionals: ['--literal-source'], values: { frame: '--literal-frame', fixture: 'fixture', selector: '.panel', origin: '0 0', viewport: '800x600', click: ['Next'] } };
  const parsed = parseAction(nextActions('COMPARE_FAILED', selection)[0]);
  assert.deepEqual(parsed.positionals, selection.positionals);
  assert.deepEqual({ ...parsed.values }, { ...selection.values, json: true });
  assert.equal(parseAction(nextActions('COMPARE_FAILED', { command: 'compare', values: { all: true } })[0]).values.all, true);
  assert.deepEqual(parseAction(nextActions('CHECK_FAILED', { command: 'check', positionals: ['--literal-source'] })[0]).positionals, ['--literal-source']);
});

test('classification uses typed boundaries and native causes without matching message text', () => {
  const cases = [
    [new Error('CONFIG_INVALID EADDRINUSE Chromium is missing'), {}, 'INTERNAL_ERROR'],
    [Object.assign(new Error('arbitrary'), { code: 'EADDRINUSE' }), { failureCode: 'COMPARE_ADAPTER_FAILED' }, 'PORT_IN_USE'],
    [Object.assign(new Error('arbitrary'), { code: 'EACCES' }), {}, 'IO_FAILED'],
    [Object.assign(new Error('arbitrary'), { code: 'ECONNREFUSED' }), {}, 'NETWORK_FAILED'],
    [new CliError('LEGACY_SOURCE', 'arbitrary'), {}, 'LEGACY_SOURCE'],
    [new Error('import failed'), { failureCode: 'CONFIG_INVALID' }, 'CONFIG_INVALID'],
    [new Error('git failed'), { failureCode: 'GIT_BASE_INVALID' }, 'GIT_BASE_INVALID'],
    [null, {}, 'INTERNAL_ERROR'], ['unexpected thrown value', {}, 'INTERNAL_ERROR'],
    [new CliError('NOT_A_CODE', 'invalid typed error'), {}, 'INTERNAL_ERROR'],
  ];
  for (const [cause, context, code] of cases) assert.equal(classifyError(cause, context).error.code, code);
  const result = capture();
  assert.equal(createOutput({ json: true, command: 'check', ...result.io }).failure(new CliError('CHECK_FAILED', 'Found problems', { data: { complete: true } })), 1);
  assert.equal(JSON.parse(result.stdout).data.complete, true);
});

test('secrets and terminal control codes are sanitized in diagnostics, warnings, data and argv', async () => {
  for (const value of [key, `Bearer private-token`, 'X-ADG-Key: header-secret', '{"X-ADG-Key":"header-secret"}', 'https://user:password@example.test/?key=url-secret&token=token-secret']) {
    const safe = sanitize(value);
    assert.doesNotMatch(safe, /private-token|header-secret|url-secret|token-secret|user:password|adg_a{64}/);
    assert.match(safe, /\[REDACTED\]/);
  }
  const result = capture(), output = createOutput({ json: true, command: 'check', ...result.io });
  output.failure(new CliError('INTERNAL_ERROR', `Bad ${key}\n\x1b[31mmessage\x1b[0m`, { data: { nested: [key] } }));
  assert.doesNotMatch(result.stdout, /adg_a{64}|\x1b|stack/);
  const warning = capture();
  createOutput({ json: true, command: 'version', ...warning.io }).success({}, [{ code: 'WARNING', message: key, next: [{ argv: ['adg', key], reason: key }] }]);
  assert.doesNotMatch(warning.stdout, /adg_a{64}/);
  const next = nextActions('COMPARE_FAILED', { command: 'compare', positionals: ['demo'], values: { frame: key } });
  assert.equal(parseAction(next[0]).values.help, true);
  const entry = capture();
  await main(['--json', `--${key}`], '/missing/project', entry.io);
  assert.doesNotMatch(entry.stdout, /adg_a{64}/);
});

test('finite subprocess smoke wires JSON serialization and a successful process exit', async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [new URL('../src/cli.mjs', import.meta.url).pathname, '--json', '--version'], { timeout: 3000 });
  assert.deepEqual(JSON.parse(stdout), { schemaVersion: 1, command: 'version', ok: true, data: { version }, warnings: [], error: null });
  assert.equal(stderr, '');
  assert.equal(stdout.trimEnd().split('\n').length, 1);
});
