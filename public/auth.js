const storageKey = 'sdg-key';
let unauthorized = false;

export function captureKey() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('key')) return;
  const key = url.searchParams.get('key');
  window.localStorage.setItem(storageKey, key);
  url.searchParams.delete('key');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
export function isUnauthorized() { return unauthorized; }
export function showUnauthorized() {
  if (unauthorized) return;
  unauthorized = true;
  document.documentElement.dataset.sdgUnauthorized = 'true';
  const gallery = document.querySelector('.gallery');
  if (gallery) gallery.hidden = true;
  const hub = document.querySelector('#hub');
  if (hub) hub.hidden = true;
  const message = document.createElement('h1');
  message.textContent = '401 Unauthorized';
  message.setAttribute('role', 'alert');
  document.body.append(message);
  window.dispatchEvent(new Event('sdg-unauthorized'));
}
function storedKey() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey);
}
export function keyURL(input) {
  const url = new URL(input, window.location.href), key = storedKey();
  if (url.origin !== window.location.origin) throw new Error('SDG data requests must use the same origin.');
  if (key) url.searchParams.set('key', key);
  return url.href;
}
export async function dataFetch(input, init = {}) {
  if (typeof window !== 'undefined' && new URL(input, window.location.href).origin !== window.location.origin)
    throw new Error('SDG data requests must use the same origin.');
  const headers = new Headers(init.headers), key = storedKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    showUnauthorized();
    const error = new Error('401 Unauthorized');
    error.status = 401;
    throw error;
  }
  return response;
}
captureKey();
