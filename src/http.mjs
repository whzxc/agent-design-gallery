import { readFile } from 'node:fs/promises';

export function directLocal(request) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$|^::1$/i.test(request.headers.host ?? '') &&
    !Object.keys(request.headers).some(name => name.toLowerCase() === 'forwarded' || name.toLowerCase().startsWith('x-forwarded-'));
}

export const viewerFiles = {
  '/access.css': 'access.css', '/switcher.js': 'switcher.js', '/switcher.css': 'switcher.css',
  '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/auth.js': 'auth.js', '/favicon.svg': 'favicon.svg',
  '/assets.js': 'assets.js', '/icons.js': 'icons.js', '/layout.js': 'layout.js', '/labels.js': 'labels.js',
  '/relationships.js': 'relationships.js', '/selection.js': 'selection.js', '/style.css': 'style.css', '/tokens.css': 'tokens.css',
};
const designFiles = { 'tokens.css': 'tokens.css', 'favicon.svg': 'art/sdg-mark.svg' };
const shellTypes = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
export function json(response, code, data) {
  response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}
export async function shell(request, response, file) {
  const packaged = new URL(`../public/${file}`, import.meta.url);
  const source = designFiles[file];
  const content = source
    ? await readFile(new URL(`../design/${source}`, import.meta.url)).catch(() => readFile(packaged))
    : await readFile(packaged);
  const type = shellTypes[file.slice(file.lastIndexOf('.'))] ?? 'text/javascript';
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  response.end(request.method === 'HEAD' ? undefined : content);
}
