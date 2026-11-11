import { asCliError, CliError, classifyError } from './cli-output.mjs';

/** @typedef {import('./toolkit/results.mjs').Location} Location */
/** @typedef {{onDiagnostic: (error: unknown, location?: Location | null) => void, onFatal: (error: unknown, location?: Location | null) => void}} ErrorCallbacks */
/** @typedef {{id: string, url: string, port: number, directory?: string | null, stateDirectory: string, close: () => Promise<unknown>, openBrowser?: () => void}} ForegroundHandle */
/** @typedef {{output: ReturnType<import('./cli-output.mjs').createOutput>, json: boolean, context?: import('./cli-output.mjs').ErrorContext, signals?: Pick<import('node:events').EventEmitter, 'on' | 'off'>, stdoutEvents?: Pick<import('node:events').EventEmitter, 'on' | 'off'>}} LifecycleOptions */

/** Own one foreground invocation from serving readiness through its single terminal event.
 * @param {string} command
 * @param {(callbacks: ErrorCallbacks) => Promise<ForegroundHandle>} start
 * @param {LifecycleOptions} options
 */
export async function runForeground(command, start, { output, json, context = {}, signals = process, stdoutEvents = process.stdout }) {
  /** @type {ForegroundHandle | undefined} */
  let handle;
  /** @type {CliError | null} */
  let startupFailure = null;
  /** @type {'SIGINT' | 'SIGTERM' | null} */
  let pendingSignal = null;
  let ready = false, finishing = false, brokenOutput = false;
  /** @type {import('./cli-output.mjs').Diagnostic[]} */
  const pendingWarnings = [];
  /** @type {(code: number) => void} */
  let resolveDone = () => {};
  /** @type {Promise<number>} */
  const done = new Promise(resolve => { resolveDone = resolve; });

  /** @param {unknown} [cause] @param {'SIGINT' | 'SIGTERM' | null} [signal] @param {Location | null} [location] */
  const finish = (cause, signal = null, location = null) => {
    if (finishing) return done;
    finishing = true;
    const stop = async () => {
      let failure = cause === undefined ? null : asCliError(cause);
      try { await handle?.close(); }
      catch (error) {
        const cleanup = error instanceof CliError && error.code === 'SHUTDOWN_FAILED' ? error : new CliError('SHUTDOWN_FAILED', error instanceof Error ? error.message : String(error), { cause: error });
        if (failure) failure.warnings.push(classifyError(cleanup).error);
        else failure = cleanup;
      }
      try {
        if (failure) {
          failure.data = ready ? { event:'diagnostic', location } : null;
          failure.warnings.push(...pendingWarnings);
          if (!brokenOutput) {
            if (json || !ready) output.failure(failure,context);
            else output.progress(failure.message);
          }
          return 2;
        }
        if (!brokenOutput && json) output.success({event:'stopped',signal});
        return brokenOutput ? 2 : 0;
      } catch { return 2; }
      finally {
        signals.off('SIGINT',interrupt); signals.off('SIGTERM',terminate);
        stdoutEvents.off('error',outputError);
      }
    };
    void stop().then(resolveDone, () => { resolveDone(2); });
    return done;
  };
  /** @param {unknown} error */
  const outputError = error => {
    brokenOutput = true;
    if (!handle) startupFailure ??= asCliError(error);
    else void finish(error);
  };
  /** @param {'SIGINT' | 'SIGTERM'} signal */
  const stopSignal = signal => {
    if (!handle) pendingSignal ??= signal;
    else void finish(undefined,signal);
  };
  const interrupt = () => stopSignal('SIGINT'), terminate = () => stopSignal('SIGTERM');
  signals.on('SIGINT',interrupt); signals.on('SIGTERM',terminate);
  stdoutEvents.on('error',outputError);
  /** @type {ErrorCallbacks} */
  const callbacks = {
    onDiagnostic(error,location = null) {
      if (finishing || (error instanceof Error && error.name === 'AbortError')) return;
      const diagnostic = !(error instanceof Error) && error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && 'message' in error && typeof error.message === 'string' && 'next' in error && Array.isArray(error.next)
        ? {code:error.code,message:error.message,next:error.next} : classifyError(asCliError(error),context).error;
      if (!ready) { pendingWarnings.push(diagnostic); return; }
      try {
        if (json) output.success({event:'diagnostic',location},[diagnostic]);
        else output.progress(diagnostic.message);
      } catch (cause) { outputError(cause); }
    },
    onFatal(error,location = null) {
      if (finishing || (error instanceof Error && error.name === 'AbortError')) return;
      if (!handle) startupFailure ??= asCliError(error);
      else void finish(error,null,location);
    },
  };
  try {
    handle = await start(callbacks);
    if (startupFailure) return await finish(startupFailure);
    if (pendingSignal) return await finish(undefined,pendingSignal);
    const data = { event:'ready', url:handle.url, port:handle.port, pid:process.pid,
      directory:command === 'open' ? handle.directory ?? null : null,
      stateDirectory:handle.stateDirectory, instanceId:handle.id };
    if (json) output.success(data,pendingWarnings.splice(0));
    else { output.log(`ADG: ${handle.url}`); for (const warning of pendingWarnings.splice(0)) output.progress(warning.message); }
    ready = true;
    handle.openBrowser?.();
    return await done;
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'EPIPE') brokenOutput = true;
    return await finish(startupFailure ?? cause);
  }
}
