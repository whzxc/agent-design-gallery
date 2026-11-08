import { request as httpRequest } from 'node:http';

// Pipe through the owning server, preserving streaming and backpressure.
export function proxy(request, response, port, pathname, prefix) {
  return new Promise(resolve => {
    const headers = { ...request.headers, host: `127.0.0.1:${port}` };
    for (const name of Object.keys(headers)) {
      if (['authorization', 'x-sdg-key', 'cookie', 'forwarded', 'origin', 'connection'].includes(name) || name.startsWith('x-forwarded-')) delete headers[name];
    }
    headers['x-forwarded-prefix'] = prefix;
    const upstream = httpRequest({ hostname: '127.0.0.1', port, method: request.method, path: pathname, headers }, incoming => {
      const outgoing = { ...incoming.headers };
      delete outgoing['set-cookie'];
      response.writeHead(incoming.statusCode, outgoing);
      incoming.pipe(response);
      incoming.on('error', () => response.destroy());
    });
    const done = () => { upstream.destroy(); resolve(); };
    response.once('close', done);
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
      if (!response.destroyed) response.end(JSON.stringify({ error: 'Viewer unavailable.' }));
    });
    request.pipe(upstream);
  });
}
