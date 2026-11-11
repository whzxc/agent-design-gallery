import { readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';

/** @typedef {{argv: string[], reason: string}} NextAction */
/** @typedef {{code: string, message: string, next: NextAction[]}} Diagnostic */
/** @typedef {keyof typeof errorCatalog} ErrorCode */
/** @typedef {{schemaVersion: 1, command: string, ok: boolean, data: unknown, warnings: Diagnostic[], error: Diagnostic | null}} Envelope */
/** @typedef {{command?: string, project?: string, stateDirectory?: string, gitCause?: 'repository' | 'revision' | 'read', positionals?: string[], values?: Record<string, string | string[] | boolean>, failureCode?: ErrorCode}} ErrorContext */
/** @typedef {{json: boolean, command: string, revealKey?: boolean, stdout?: (text: string) => void, stderr?: (text: string) => void}} OutputOptions */

// Recovery kinds keep the catalog declarative; actions are constructed from known operands.
/** @satisfies {Record<string, [number, string, string]>} */
export const errorCatalog = {
  USAGE_INVALID: [2, 'help', 'Read command arguments.'],
  CONFIG_INVALID: [2, 'check', 'Recheck after fixing configuration.'],
  TOKENS_INVALID: [2, 'check', 'Recheck after repairing tokens.css.'],
  MIGRATION_REQUIRED: [2, 'migrate', 'Migrate the legacy project.'],
  MIGRATION_CONFLICT: [2, 'migration', 'Inspect migration inputs before resolving the conflict.'],
  VERSION_UNSATISFIED: [2, 'install', 'Install a version satisfying project requires.'],
  DIRECTORY_NOT_FOUND: [2, 'help', 'Choose an existing directory.'],
  PROJECT_NOT_FOUND: [2, 'migrate-help', 'Select the project root.'],
  SOURCE_NOT_FOUND: [2, 'check-help', 'Choose a discovered source inside the project.'],
  FRAME_NOT_FOUND: [2, 'render-help', 'Choose a declared frame in the selected sources.'],
  ROOT_NOT_REGISTERED: [2, 'roots', 'Read registered roots.'],
  LEGACY_SOURCE: [2, 'check', 'Recheck after converting the SVG source to TSX.'],
  SOURCE_BUILD_FAILED: [2, 'check', 'Read source diagnostics after repairing the source.'],
  GIT_UNAVAILABLE: [2, 'git-version', 'Verify Git after installing it.'],
  GIT_BASE_INVALID: [2, 'git', 'Inspect the project repository and base revision.'],
  DIFF_BASE_DEPENDENCIES_UNAVAILABLE: [2, 'diff', 'Restore the reported historical import or its installed dependency before retrying.'],
  DIFF_FAILED: [1, 'diff', 'Review the reported artifacts, then repeat the comparison after resolving the differences.'],
  CHECK_FAILED: [1, 'check', 'Recheck after fixing findings.'],
  COMPARE_FAILED: [1, 'compare', 'Compare again after reviewing the reports.'],
  PLAYWRIGHT_UNAVAILABLE: [2, 'install', 'Restore the packaged browser dependency.'],
  CHROMIUM_UNAVAILABLE: [2, 'chromium', 'Install Chromium matching ADG\'s Playwright.'],
  BROWSER_FAILED: [2, 'chromium', 'Repair Chromium before retrying.'],
  RENDER_FAILED: [2, 'check', 'Inspect frame execution diagnostics.'],
  COMPARE_TARGET_NOT_FOUND: [2, 'compare', 'Retry after repairing the fixture target.'],
  COMPARE_ADAPTER_FAILED: [2, 'compare', 'Retry after repairing the adapter callback.'],
  COMPARE_UNSETTLED: [2, 'compare', 'Retry after stabilizing fixture readiness.'],
  STATE_INVALID: [2, 'help', 'Inspect the reported state file before retrying.'],
  HUB_KEY_INVALID: [2, 'rotate', 'Replace the invalid key; existing access will expire.'],
  SERVICE_UNSUPPORTED: [2, 'serve-help', 'Use a foreground hub on this platform.'],
  SERVICE_ALREADY_INSTALLED: [2, 'status', 'Inspect the existing installation.'],
  SERVICE_FAILED: [2, 'logs', 'Inspect service diagnostics before retrying.'],
  WATCH_FAILED: [2, 'check', 'Inspect project inputs before reopening the viewer.'],
  SHUTDOWN_FAILED: [2, 'help', 'Inspect the reported resource before retrying.'],
  PORT_IN_USE: [2, 'help', 'Choose an unused port.'],
  NETWORK_FAILED: [2, 'compare', 'Retry after restoring fixture connectivity.'],
  AUTH_REQUIRED: [2, 'compare', 'Retry after providing fixture access.'],
  IO_FAILED: [2, 'help', 'Repair access to the reported path before retrying.'],
  INTERNAL_ERROR: [2, 'version', 'Record the runtime version with the diagnostic.'],
};

export class CliError extends Error {
  /** @param {ErrorCode} code @param {string} message @param {{data?: unknown, cause?: unknown, context?: ErrorContext, warnings?: Diagnostic[], humanReported?: boolean}} [options] */
  constructor(code, message, { data = null, cause, context = {}, warnings = [], humanReported = false } = {}) {
    super(message, { cause });
    this.name = 'CliError';
    this.code = code;
    this.data = data;
    this.context = context;
    this.warnings = warnings;
    this.humanReported = humanReported;
  }
}

const canonicalCommands = new Set([
  'open', 'link', 'serve', 'root', 'service', 'migrate', 'init', 'check', 'render', 'compare', 'diff',
  'root add', 'root remove', 'root list', 'root scan',
  'service install', 'service uninstall', 'service status', 'service logs', 'service migrate',
  'help', 'version', 'adg',
]);
const playwrightVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies.playwright;

/** Sanitize strings before either diagnostic channel; never stringify raw errors/configs. @param {string} text */
export function sanitize(text) {
  return stripVTControlCharacters(text)
    .replace(/\b(?:adg|sdg)_[a-f0-9]{64}\b/gi, '[REDACTED]')
    .replace(/(\bBearer\s+)[^\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/(\b(?:X-(?:ADG|SDG)-Key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}<>]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:key|token|access_token|api_key|authorization)=)[^&#\s"'<>]*/gi, '$1[REDACTED]');
}

/** @param {string} [command] */
function helpArgv(command = 'adg') {
  return ['adg', ...(canonicalCommands.has(command) && !['adg', 'help', 'version'].includes(command) ? command.split(' ') : []), '--help', '--json'];
}

/** @param {ErrorCode} code @param {ErrorContext} [context] @returns {NextAction[]} */
export function nextActions(code, context = {}) {
  const [, recovery, reason] = errorCatalog[code];
  const state = context.stateDirectory ? ['--state-dir', context.stateDirectory] : [];
  let argv;
  switch (recovery) {
    case 'check': argv = ['adg', 'check', '--read-only', '--json', ...(context.positionals?.length && context.command === 'check' ? ['--', ...context.positionals] : [])]; break;
    case 'install': argv = ['npm', 'install', '-g', '@whzxc/agent-design-gallery']; break;
    case 'migrate': argv = context.project ? ['adg', 'migrate', context.project, '--json'] : helpArgv('migrate'); break;
    case 'migration': argv = context.command === 'service migrate' ? ['adg', 'service', 'status', ...state, '--json'] : helpArgv('migrate'); break;
    case 'migrate-help': argv = helpArgv('migrate'); break;
    case 'check-help': argv = helpArgv('check'); break;
    case 'render-help': argv = helpArgv('render'); break;
    case 'serve-help': argv = helpArgv('serve'); break;
    case 'roots': argv = ['adg', 'root', 'list', ...state, '--json']; break;
    case 'rotate': argv = ['adg', 'serve', '--rotate-key', ...state, '--json']; break;
    case 'status': argv = ['adg', 'service', 'status', ...state, '--json']; break;
    case 'logs': argv = ['adg', 'service', 'logs', ...state, '--json']; break;
    case 'version': argv = ['adg', '--version', '--json']; break;
    case 'git-version': argv = ['git', '--version']; break;
    case 'git': {
      const operation = context.gitCause === 'revision' ? ['log', '-5', '--oneline'] : context.gitCause === 'read' ? ['status', '--short'] : ['rev-parse', '--show-toplevel'];
      argv = context.project ? ['git', '-C', context.project, ...operation] : helpArgv(context.command);
      break;
    }
    case 'chromium': argv = ['npx', `playwright@${playwrightVersion}`, 'install', 'chromium']; break;
    case 'diff': {
      const values = context.values ?? {};
      if (context.command !== 'diff' || typeof values.base !== 'string' || !values.base.trim()) { argv = helpArgv('diff'); break; }
      argv = ['adg', 'diff'];
      for (const key of ['base', 'frame', 'theme', 'scale', 'out-dir']) {
        if (typeof values[key] === 'string') argv.push(`--${key}=${values[key]}`);
      }
      argv.push('--json');
      if (context.positionals?.length) argv.push('--', ...context.positionals);
      break;
    }
    case 'compare': {
      const values = context.values ?? {}, sources = context.positionals ?? [];
      if (context.command !== 'compare' || (!values.all && (sources.length !== 1 || typeof values.frame !== 'string' || !values.frame))) {
        argv = helpArgv(context.command);
        break;
      }
      argv = ['adg', 'compare'];
      if (values.all) argv.push('--all');
      else {
        // Attached values preserve literal operands starting with '-'.
        for (const key of ['frame', 'fixture', 'region', 'selector', 'origin', 'viewport']) {
          if (typeof values[key] === 'string') argv.push(`--${key}=${values[key]}`);
        }
        if (values.page) argv.push('--page');
        for (const click of Array.isArray(values.click) ? values.click : []) argv.push(`--click=${click}`);
        argv.push('--json', '--', sources[0]);
        break;
      }
      argv.push('--json');
      break;
    }
    default: argv = helpArgv(context.command);
  }
  // Redacted operands are not executable corrections; offer safe help instead.
  if (argv.some(value => sanitize(value) !== value)) return [{ argv: helpArgv(context.command), reason: 'Read command arguments without exposing credentials.' }];
  return [{ argv, reason: String(reason) }];
}

const ioCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EISDIR', 'ENOSPC', 'EROFS', 'EEXIST', 'EXDEV', 'EMFILE', 'ENFILE', 'EIO']);
const networkCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED']);

/** @param {unknown} cause @param {ErrorContext} [context] @returns {{error: Diagnostic & {code: ErrorCode}, exitCode: number, data: unknown, warnings: Diagnostic[]}} */
export function classifyError(cause, context = {}) {
  const raw = cause instanceof Error ? cause : null;
  const rawCode = raw && 'code' in raw ? String(raw.code) : '';
  /** @type {ErrorCode} */
  let code = 'INTERNAL_ERROR';
  if (raw instanceof CliError && Object.hasOwn(errorCatalog, raw.code)) code = raw.code;
  else if (rawCode === 'EADDRINUSE') code = 'PORT_IN_USE';
  else if (context.failureCode && Object.hasOwn(errorCatalog, context.failureCode)) code = context.failureCode;
  else if (ioCodes.has(rawCode)) code = 'IO_FAILED';
  else if (networkCodes.has(rawCode)) code = 'NETWORK_FAILED';
  const message = sanitize(raw?.message ?? (typeof cause === 'string' ? cause : 'Unexpected ADG error.')).replace(/\s+/g, ' ').trim();
  return {
    error: { code, message, next: nextActions(code, { ...context, ...(raw instanceof CliError ? raw.context : {}) }) },
    exitCode: Number(errorCatalog[code][0]),
    data: raw instanceof CliError ? raw.data : null,
    warnings: raw instanceof CliError ? raw.warnings : [],
  };
}

/** @param {unknown} cause @param {ErrorCode} [fallback] */
export function asCliError(cause, fallback = 'INTERNAL_ERROR') {
  if (cause instanceof CliError) return cause;
  const classified = classifyError(cause);
  return new CliError(classified.error.code === 'INTERNAL_ERROR' ? fallback : classified.error.code, cause instanceof Error ? cause.message : String(cause), { cause });
}

/** @param {unknown} value @returns {unknown} */
function sanitizedValue(value) {
  if (typeof value === 'string') return sanitize(value);
  if (Array.isArray(value)) return value.map(sanitizedValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizedValue(item)]));
  return value;
}

/** @type {AsyncLocalStorage<(text: string) => void>} */
const humanOutput = new AsyncLocalStorage();
/**
 * Route config/module writes in this invocation without capturing the caller's output.
 * @template T
 * @param {() => T | Promise<T>} work
 * @param {(text: string) => void} stderr
 * @returns {Promise<T>}
 */
export async function withHumanOutput(work, stderr) {
  const originals = [process.stdout.write, process.stderr.write];
  for (const [index, stream] of [process.stdout, process.stderr].entries()) {
    /** @param {string | Uint8Array} chunk @param {BufferEncoding | ((error?: Error | null) => void)} [encoding] @param {(error?: Error | null) => void} [callback] */
    function redirect(chunk, encoding, callback) {
      const sink = humanOutput.getStore();
      const done = typeof encoding === 'function' ? encoding : callback;
      if (!sink) return originals[index].call(stream, chunk, typeof encoding === 'string' ? encoding : undefined, done);
      sink(sanitize(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8')));
      done?.();
      return true;
    }
    stream.write = redirect;
  }
  try { return await humanOutput.run(stderr, work); }
  finally { [process.stdout.write, process.stderr.write] = originals; }
}

/** Preserve the active output sink while translating revision-local diagnostics. */
export async function withHumanOutputMapping(work, transform) {
  const sink = humanOutput.getStore() ?? process.stderr.write.bind(process.stderr);
  return withHumanOutput(work, text => sink(transform(text)));
}

/** @param {OutputOptions} options */
export function createOutput({ json, command, revealKey = false, stdout = text => { process.stdout.write(text); }, stderr = text => { process.stderr.write(text); } }) {
  /** @param {Envelope} envelope */
  const emit = envelope => {
    const clean = /** @type {Envelope} */ (sanitizedValue(envelope));
    const data = envelope.data;
    if (json && revealKey && command === 'serve' && envelope.ok && data && typeof data === 'object' && 'action' in data && data.action === 'print-key' && 'key' in data && typeof data.key === 'string' && /^adg_[a-f0-9]{64}$/.test(data.key) && clean.data && typeof clean.data === 'object') {
      // Only the explicit print-key result field is exempt; siblings and diagnostics stay sanitized.
      Object.assign(clean.data, { key: data.key });
    }
    stdout(`${JSON.stringify(clean)}\n`);
  };
  /** @param {string} text */
  const log = text => (json ? stderr : stdout)(`${sanitize(text)}\n`);
  return {
    log,
    /** @param {string} text */
    progress: text => stderr(`${sanitize(text)}\n`),
    /** @param {unknown} data @param {Diagnostic[]} [warnings] */
    success(data, warnings = []) { emit({ schemaVersion: 1, command, ok: true, data: data ?? null, warnings, error: null }); },
    /** @param {unknown} cause @param {ErrorContext} [context] */
    failure(cause, context = {}) {
      const failure = classifyError(cause, { ...context, command });
      if (json) emit({ schemaVersion: 1, command, ok: false, data: failure.data, warnings: failure.warnings, error: failure.error });
      else if (!(cause instanceof CliError && cause.humanReported)) stderr(`adg: ${failure.error.message}\n`);
      return failure.exitCode;
    },
  };
}
