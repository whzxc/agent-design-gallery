import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { startServer } from './server.mjs';
import { listProjects, listRoots, scanRoots, defaultStateDirectory } from './hub/registry.mjs';
import { proxy } from './hub/proxy.mjs';
import { listInstances, stopInstance } from './hub/instances.mjs';
import { hubKey, authorized } from './hub/auth.mjs';
import { json, shell, viewerFile } from './http.mjs';
import { CliError, asCliError } from './cli-output.mjs';
import { loadConfig } from './toolkit/config.mjs';
import { cleanup } from './toolkit/results.mjs';

export async function startHub({ port = 4310, stateDirectory = defaultStateDirectory, idleTimeout = 300_000, onDiagnostic, onFatal, startViewer = startServer } = {}) {
  await hubKey(stateDirectory);
  let closing = false;
  const id = randomUUID(), viewers = new Map(), streams = new Set();
  const stopping = new Map();
  const projects = async () => (await listProjects(stateDirectory)).map(project => ({ ...project, ...viewers.get(project.slug)?.viewer?.stats(), url: `/p/${project.slug}/` }));
  const server = createServer(async (request, response) => {
    try {
      if (closing) return json(response, 503, { error: 'Hub is stopping.' });
      const url = new URL(request.url, 'http://localhost');
      const read = ['GET', 'HEAD'].includes(request.method);
      const projectRoute = url.pathname.match(/^\/p\/([A-Za-z0-9_-]+)(\/.*)?$/);
      const instanceRoute = url.pathname.match(/^\/i\/([A-Za-z0-9_-]+)(\/.*)?$/);
      const stopRoute = url.pathname.match(/^\/api\/instances\/([A-Za-z0-9_-]+)\/stop$/);
      const route = projectRoute ?? instanceRoute;
      const publicFile = read && (route ? viewerFile(route[2] ?? '/') : { '/': 'hub.html', '/hub.js': 'hub.js', '/auth.js': 'auth.js', '/icons.js': 'icons.js', '/tokens.css': 'tokens.css', '/hub.css': 'hub.css', '/access.css': 'access.css', '/favicon.svg': 'favicon.svg', '/instance-actions.js': 'instance-actions.js' }[url.pathname]);
      // Project shells do not discover, build, watch, or embed any project data.
      // The switcher manages hub destinations, including in viewers started before this hub version.
      if (publicFile && (!instanceRoute || ['switcher.js', 'switcher.css', 'instance-actions.js'].includes(publicFile))) {
        if (route && !route[2]) { response.writeHead(302, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
        return await shell(request, response, publicFile, projectRoute && `/p/${projectRoute[1]}/`);
      }
      if (!publicFile && !await authorized(request, url, stateDirectory)) return json(response, 401, { error: 'Unauthorized' });
      if (request.method === 'POST' && request.headers.origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(request.headers.origin))
        return json(response, 403, { error: 'Cross-origin request refused.' });
      if (url.pathname === '/api/health' && request.method === 'GET') return json(response, 200, { id });
      if (url.pathname === '/api/projects' && request.method === 'GET') return json(response, 200, await projects());
      if (url.pathname === '/api/instances' && request.method === 'GET') return json(response, 200, await listInstances(stateDirectory));
      if (stopRoute && request.method === 'POST') {
        const instanceId = stopRoute[1];
        if (!stopping.has(instanceId))
          stopping.set(instanceId, stopInstance(instanceId, stateDirectory).finally(() => stopping.delete(instanceId)));
        const status = await stopping.get(instanceId);
        if (status === 200) return json(response, 200, { ok: true });
        const error = { 404: 'Instance is no longer live.', 409: 'Cannot verify that this viewer can be stopped.',
          503: 'The viewer is still shutting down.' }[status];
        return json(response, status, { error });
      }
      if (url.pathname === '/api/roots' && request.method === 'GET') return json(response, 200, await listRoots(stateDirectory));
      if (url.pathname === '/api/rescan' && request.method === 'POST') return json(response, 200, (await scanRoots(undefined, stateDirectory)).data.roots);
      if (route) {
        if (!read && !(request.method === 'POST' && (route[2] === '/preferences' || route[2] === '/catalog' || /^\/(metadata|preview)\/[a-f0-9]{64}$/.test(route[2]??'')))) return json(response, 405, { error: 'Only viewer preferences and derived cache data may be changed.' });
        if (instanceRoute) {
          const instance = (await listInstances(stateDirectory)).find(item => item.id === instanceRoute[1]);
          if (!instance) return json(response, 404, { error: 'Instance is no longer live.' });
          if (!instance.proxyable) return json(response, 409, { error: 'Instance viewer does not support authenticated proxying.' });
          if (!route[2]) { response.writeHead(302, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
          streams.add(response);
          try { await proxy(request, response, instance.port, route[2] + url.search, `/i/${instance.id}/`, onDiagnostic); }
          finally { streams.delete(response); }
          return;
        }
        const slug = projectRoute[1];
        let entry = viewers.get(slug);
        if (!entry) {
          entry = { active: 0, last: Date.now() };
          entry.pending = (async () => {
            const project = (await listProjects(stateDirectory)).find(item => item.slug === slug);
            if (!project) throw new CliError('PROJECT_NOT_FOUND','Unknown project; run adg root scan.');
            if (project.error) { await loadConfig(project.path); throw new CliError('CONFIG_INVALID',project.error); }
            entry.viewer = await startViewer({ directory: project.design, stateDirectory: path.join(stateDirectory, 'projects', slug), onDiagnostic, onFatal });
            return entry.viewer;
          })();
          viewers.set(slug, entry);
        }
        try { await entry.pending; }
        catch (error) { if (viewers.get(slug) === entry) viewers.delete(slug); throw error; }
        entry.active++;
        try { await proxy(request, response, entry.viewer.port, route[2] + url.search, undefined, onDiagnostic); }
        finally { entry.active--; entry.last = Date.now(); }
        return;
      }
      json(response, read ? 404 : 405, { error: 'Not found.' });
    } catch (error) {
      if (error.code === 'STATE_INVALID') onFatal?.(error);
      else if (error.name !== 'AbortError' && !['PROJECT_NOT_FOUND','USAGE_INVALID'].includes(error.code)) onDiagnostic?.(asCliError(error));
      if (response.destroyed) return;
      if (response.headersSent) response.destroy();
      else json(response, 400, { error: error.message });
    }
  });
  const reap = setInterval(() => {
    for (const [slug, entry] of viewers) {
      if (!entry.active && entry.viewer && Date.now() - entry.last > idleTimeout) {
        viewers.delete(slug);
        entry.viewer.close().catch(error => { if (!closing) onDiagnostic?.(new CliError('SHUTDOWN_FAILED',error.message,{cause:error})); });
      }
    }
  }, Math.min(idleTimeout, 30_000));
  reap.unref();
  let closePromise;
  const close = () => closePromise ??= (async () => {
    closing = true; clearInterval(reap);
    let primary;
    const steps = [async () => {
      for (const response of streams) response.destroy();
      const disconnected = server.listening ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
      server.closeAllConnections(); await disconnected;
    }, ...[...viewers.values()].map(entry => async () => {
      let viewer; try { viewer=await entry.pending; } catch { return; }
      await viewer.close();
    })];
    for (const step of steps) try { await cleanup(step,primary); } catch (error) { primary=error; }
    if (primary) throw primary;
  })();
  try { await new Promise((resolve,reject) => {
    const startupError=error=>{server.off('listening',listening);reject(error);};
    const listening=()=>{server.off('error',startupError);server.on('error',error=>{if(!closing)onFatal?.(asCliError(error));});resolve();};
    server.once('error',startupError);server.listen(port,'127.0.0.1',listening);
  }); }
  catch (cause) { const primary=asCliError(cause);await cleanup(close,primary);throw primary; }
  return {
    id, url: `http://127.0.0.1:${server.address().port}/`,port:server.address().port,stateDirectory:path.resolve(stateDirectory),close,
  };
}
