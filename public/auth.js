import { icon } from './icons.js';
const storageKey = 'adg-key';
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
  const theme = window.localStorage.getItem('adg-theme');
  document.documentElement.dataset.theme = theme === 'light' || theme === 'dark'
    ? theme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.adgUnauthorized = 'true';
  const gallery = document.querySelector('.gallery');
  if (gallery) gallery.hidden = true;
  const hub = document.querySelector('#hub');
  if (hub) hub.hidden = true;
  for (const popover of document.querySelectorAll(':popover-open')) popover.hidePopover();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  const shell = document.createElement('main');
  shell.className = 'access-shell';
  shell.setAttribute('aria-label', 'Hub access');
  shell.innerHTML = `<div class="access-brand">ADG</div><div class="access-center"><section class="access-card" role="alert" aria-labelledby="access-title"><div class="access-code">${icon('key-round', 20)}<span>401</span></div><div class="access-copy"><h1 id="access-title">Key required</h1><p></p></div></section></div>`;
  shell.querySelector('p').textContent = storedKey()
    ? 'The key saved in this browser was rejected.' : 'This browser needs an access key.';
  document.body.append(shell);
  window.dispatchEvent(new Event('adg-unauthorized'));
}
function storedKey() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey);
}
function withBase(input) {
  if(typeof window==='undefined')return input;
  const base=new URL(window.location.href).searchParams.get('base');
  if(base===null)return input;
  const url=new URL(input,document.baseURI);
  if(!url.searchParams.has('base'))url.searchParams.set('base',base);
  return url.href;
}
export function keyURL(input) {
  const url = new URL(withBase(input), document.baseURI), key = storedKey();
  if (url.origin !== window.location.origin) throw new Error('ADG data requests must use the same origin.');
  if (key) url.searchParams.set('key', key);
  return url.href;
}
export async function dataFetch(input, init = {}) {
  input=withBase(input);
  if (typeof window !== 'undefined' && new URL(input, document.baseURI).origin !== window.location.origin)
    throw new Error('ADG data requests must use the same origin.');
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
