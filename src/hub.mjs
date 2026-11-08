import { createServer } from 'node:http';
import path from 'node:path';
import { startServer } from './server.mjs';
import { listProjects, listRoots, scanRoots, defaultStateDirectory } from './hub/registry.mjs';
import { proxy } from './hub/proxy.mjs';

export const json = (response, code, data) => {
  response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function startHub({ port = 4310, stateDirectory = defaultStateDirectory, idleTimeout = 300_000 } = {}) {
  const viewers = new Map();
  const projects = async () => (await listProjects(stateDirectory)).map(project => ({ ...project, ...viewers.get(project.slug)?.viewer?.stats(), url: `/p/${project.slug}/` }));
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'POST') {
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}` && request.headers.origin !== `https://${request.headers.host}`) return json(response, 403, { error: 'Cross-origin request refused.' });
        if (url.pathname === '/api/rescan') return json(response, 200, await scanRoots(undefined, stateDirectory));
      }
      if (url.pathname === '/api/projects' && request.method === 'GET') return json(response, 200, await projects());
      if (url.pathname === '/api/roots' && request.method === 'GET') return json(response, 200, await listRoots(stateDirectory));
      const match = url.pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
      if (match) {
        const project = (await listProjects(stateDirectory)).find(item => item.slug === match[1]);
        if (!project) return json(response, 404, { error: 'Unknown project; run sdg root scan.' });
        if (!match[2]) { response.writeHead(302, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
        let entry = viewers.get(project.slug);
        if (!entry) {
          entry = { pending: startServer({ directory: project.design, stateDirectory: path.join(stateDirectory, 'projects', project.slug) }), active: 0, last: Date.now() };
          viewers.set(project.slug, entry);
          try { entry.viewer = await entry.pending; } catch (error) { viewers.delete(project.slug); throw error; }
        }
        await entry.pending;
        entry.active++;
        try { await proxy(request, response, entry.viewer.port, match[2] + url.search, `/p/${project.slug}`); }
        finally { entry.active--; entry.last = Date.now(); }
        return;
      }
      if (url.pathname === '/' && request.method === 'GET') {
        const items = await projects();
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>SDG</title><h1>SDG</h1><ul>${items.map(p => `<li><a href="${p.url}">${escape(p.name)}</a></li>`).join('')}</ul><form method="post" action="/api/rescan"><button>Rescan registered roots</button></form></html>`);
        return;
      }
      json(response, request.method === 'GET' ? 404 : 405, { error: 'Not found.' });
    } catch (error) { json(response, 400, { error: error.message }); }
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
    url: `http://127.0.0.1:${server.address().port}/`,
    async close() {
      clearInterval(reap);
      await Promise.all([...viewers.values()].map(async entry => (await entry.pending).close()));
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
