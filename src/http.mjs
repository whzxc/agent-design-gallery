import { readFile } from 'node:fs/promises';

export function directLocal(request) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$|^::1$/i.test(request.headers.host ?? '') &&
    !Object.keys(request.headers).some(name => name.toLowerCase() === 'forwarded' || name.toLowerCase().startsWith('x-forwarded-'));
}

export const viewerFiles = {
  '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/auth.js': 'auth.js',
  '/assets.js': 'assets.js', '/icons.js': 'icons.js', '/layout.js': 'layout.js', '/labels.js': 'labels.js',
  '/relationships.js': 'relationships.js', '/selection.js': 'selection.js', '/style.css': 'style.css', '/tokens.css': 'tokens.css',
};
export function json(response, code, data) {
  response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}
export async function shell(request, response, file) {
  let content;
  if (file === 'tokens.css') {
    try { content = await readFile(new URL('../design/tokens.css', import.meta.url)); }
    catch { content = await readFile(new URL('../public/tokens.css', import.meta.url)); }
  } else content = await readFile(new URL(`../public/${file}`, import.meta.url));
  response.writeHead(200, { 'Content-Type': `${file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'}; charset=utf-8`,
    'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  response.end(request.method === 'HEAD' ? undefined : content);
}
