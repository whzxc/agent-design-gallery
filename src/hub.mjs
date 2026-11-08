import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { startServer } from './server.mjs';
import { listProjects, listRoots, scanRoots, defaultStateDirectory } from './hub/registry.mjs';
import { proxy } from './hub/proxy.mjs';
import { listInstances } from './hub/instances.mjs';
import { hubKey, authorized } from './hub/auth.mjs';
import { json, shell, viewerFiles } from './http.mjs';

export async function startHub({ port = 4310, stateDirectory = defaultStateDirectory, idleTimeout = 300_000 } = {}) {
  await hubKey(stateDirectory);
  let closing = false;
  const id = randomUUID(), viewers = new Map(), streams = new Set();
  const projects = async () => (await listProjects(stateDirectory)).map(project => ({ ...project, ...viewers.get(project.slug)?.viewer?.stats(), url: `/p/${project.slug}/` }));
  const server = createServer(async (request, response) => {
    try {
      if (closing) return json(response, 503, { error: 'Hub is stopping.' });
      const url = new URL(request.url, 'http://localhost');
      const read = ['GET', 'HEAD'].includes(request.method);
      const projectRoute = url.pathname.match(/^\/p\/([A-Za-z0-9_-]+)(\/.*)?$/);
      const instanceRoute = url.pathname.match(/^\/i\/([A-Za-z0-9_-]+)(\/.*)?$/);
      const route = projectRoute ?? instanceRoute;
      const publicFile = read && (route ? viewerFiles[route[2] ?? '/'] : { '/': 'hub.html', '/hub.js': 'hub.js', '/auth.js': 'auth.js', '/icons.js': 'icons.js', '/tokens.css': 'tokens.css', '/hub.css': 'hub.css', '/access.css': 'access.css' }[url.pathname]);
      // Project shells do not discover, build, watch, or embed any project data.
      if (publicFile && !instanceRoute) {
        if (route && !route[2]) { response.writeHead(302, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
        return await shell(request, response, publicFile);
      }
      if (!publicFile && !await authorized(request, url, stateDirectory)) return json(response, 401, { error: 'Unauthorized' });
      if (request.method === 'POST' && request.headers.origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(request.headers.origin))
        return json(response, 403, { error: 'Cross-origin request refused.' });
      if (url.pathname === '/api/health' && request.method === 'GET') return json(response, 200, { id });
      if (url.pathname === '/api/projects' && request.method === 'GET') return json(response, 200, await projects());
      if (url.pathname === '/api/instances' && request.method === 'GET') return json(response, 200, await listInstances(stateDirectory));
      if (url.pathname === '/api/roots' && request.method === 'GET') return json(response, 200, await listRoots(stateDirectory));
      if (url.pathname === '/api/rescan' && request.method === 'POST') return json(response, 200, await scanRoots(undefined, stateDirectory));
      if (route) {
        if (!read && !(request.method === 'POST' && route[2] === '/preferences')) return json(response, 405, { error: 'Only viewer preferences may be changed.' });
        if (instanceRoute) {
          const instance = (await listInstances(stateDirectory)).find(item => item.id === instanceRoute[1]);
          if (!instance) return json(response, 404, { error: 'Instance is no longer live.' });
          if (!instance.proxyable) return json(response, 409, { error: 'Instance viewer does not support authenticated proxying.' });
          if (!route[2]) { response.writeHead(302, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
          streams.add(response);
          try { await proxy(request, response, instance.port, route[2] + url.search); }
          finally { streams.delete(response); }
          return;
        }
        const slug = projectRoute[1];
        let entry = viewers.get(slug);
        if (!entry) {
          entry = { active: 0, last: Date.now() };
          entry.pending = (async () => {
            const project = (await listProjects(stateDirectory)).find(item => item.slug === slug);
            if (!project) throw new Error('Unknown project; run sdg root scan.');
            entry.viewer = await startServer({ directory: project.design, stateDirectory: path.join(stateDirectory, 'projects', slug) });
            return entry.viewer;
          })();
          viewers.set(slug, entry);
        }
        try { await entry.pending; }
        catch (error) { if (viewers.get(slug) === entry) viewers.delete(slug); throw error; }
        entry.active++;
        try { await proxy(request, response, entry.viewer.port, route[2] + url.search); }
        finally { entry.active--; entry.last = Date.now(); }
        return;
      }
      json(response, read ? 404 : 405, { error: 'Not found.' });
    } catch (error) {
      if (response.headersSent) response.destroy();
      else json(response, 400, { error: error.message });
    }
  });
  const reap = setInterval(() => {
    for (const [slug, entry] of viewers) {
      if (!entry.active && entry.viewer && Date.now() - entry.last > idleTimeout) {
        viewers.delete(slug);
        entry.viewer.close().catch(() => {});
      }
    }
  }, Math.min(idleTimeout, 30_000));
  reap.unref();
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { clearInterval(reap); throw error; }
  return {
    id, url: `http://127.0.0.1:${server.address().port}/`,
    async close() {
      closing = true;
      clearInterval(reap);
      for (const response of streams) response.destroy();
      await Promise.all([...viewers.values()].map(async entry => {
        let viewer; try { viewer = await entry.pending; } catch { return; }
        await viewer.close();
      }));
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
