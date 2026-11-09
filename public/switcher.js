import { dataFetch, isUnauthorized } from './auth.js';
import { icon } from './icons.js';
import { instanceCloseButton } from './instance-actions.js';

const route = location.pathname.match(/^\/(p|i)\/([^/]+)\//);
if (route) document.documentElement.dataset.hubViewer = 'true';
let current, kind, targets = [], triggers = [], opener;
const menu = document.createElement('nav');
menu.id = 'project-switcher';
menu.setAttribute('popover', 'auto');
menu.setAttribute('aria-label', 'Project switcher');
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const glyph = (name, size = 16) => {
  const node = element('span', 'switcher-icon');
  node.innerHTML = icon(name, size);
  return node;
};
export function updateSwitcherLabels() {
  if (!current) return;
  for (const trigger of triggers) {
    trigger.querySelector('.directory-name').textContent = current.name;
    trigger.setAttribute('aria-label', `Switch project: ${current.name}`);
    trigger.title = current.design ?? current.path ?? current.directory ?? '';
  }
}
function position() {
  if (!opener) return;
  const rect = opener.getBoundingClientRect();
  const phone = innerWidth <= 600;
  const bottom = opener.closest('#app-bar')?.getBoundingClientRect().bottom ?? rect.bottom;
  menu.style.left = `${phone ? 12 : Math.min(rect.left, Math.max(12, innerWidth - 372))}px`;
  menu.style.top = `${bottom + 6}px`;
  menu.style.maxHeight = `${Math.max(80, innerHeight - bottom - 18)}px`;
}
function close() {
  menu.hidePopover();
  opener?.focus({ preventScroll: true });
}
function open(trigger) {
  opener = trigger;
  render();
  position();
  menu.showPopover();
  (menu.querySelector('a[aria-current="page"]') ?? menu.querySelector('a')).focus({ preventScroll: true });
}
function render() {
  const home = element('a', 'switcher-home', 'All projects');
  home.href = '/';
  home.append(glyph('arrow-up-left', 14));
  menu.replaceChildren(home, element('div', 'switcher-rule'));
  if (targets.length >= 5) {
    const field = element('div', 'switcher-search');
    const input = element('input', '');
    input.type = 'search';
    input.placeholder = 'Find project or instance…';
    input.setAttribute('aria-label', 'Find project or instance');
    input.autocomplete = 'off';
    const clear = element('button', 'switcher-clear');
    clear.type = 'button'; clear.setAttribute('aria-label', 'Clear project search');
    clear.append(glyph('x')); clear.hidden = true;
    clear.onclick = () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); };
    field.append(glyph('search'), input, clear);
    input.oninput = () => { clear.hidden = !input.value; renderTargets(input.value); };
    menu.append(field);
  }
  menu.append(element('div', 'switcher-targets'));
  renderTargets('');
}
function renderTargets(query) {
  const container = menu.querySelector('.switcher-targets');
  container.replaceChildren();
  const matches = targets.filter(item => [item.name, item.design, item.path, item.directory, item.branch].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  for (const [type, title] of [['p', 'Projects'], ['i', 'Live instances']]) {
    const items = matches.filter(item => item.kind === type);
    if (!items.length) continue;
    if (container.childElementCount) container.append(element('div', 'switcher-rule'));
    const section = element('section', '');
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', title);
    section.append(element('h3', '', title));
    for (const item of items) {
      const disabled = item.compatibility?.compatible === false || item.proxyable === false || item.error;
      const selected = item.kind === kind && (item.slug ?? item.id) === (current.slug ?? current.id);
      const row = element(disabled ? 'div' : 'a', 'switcher-row');
      if (disabled) row.setAttribute('aria-disabled', 'true');
      else row.href = item.url ?? `/${item.kind}/${encodeURIComponent(item.slug ?? item.id)}/`;
      if (selected) row.setAttribute('aria-current', 'page');
      row.append(glyph(type === 'i' ? 'radio' : 'folder'));
      const labels = element('span', 'switcher-labels');
      labels.append(element('span', 'switcher-name', item.name));
      const detail = item.compatibility?.compatible === false
        ? `Requires SDG ${item.compatibility.requires?.replace(/>=/g, '≥')} · hub ${item.compatibility.version}`
        : item.proxyable === false ? 'Proxy unavailable' : type === 'i' ? `:${item.port} · ${item.directory}`
        : item.error ?? item.design ?? item.path ?? item.directory;
      const meta = element('span', `switcher-detail${disabled ? ' switcher-danger' : ''}`, detail);
      meta.title = detail ?? '';
      labels.append(meta); row.append(labels);
      if (selected) row.append(glyph('check', 14));
      if (disabled) { const alert = glyph('circle-alert', 14); alert.classList.add('switcher-danger'); row.append(alert); }
      if (type !== 'i' || !item.stoppable) { section.append(row); continue; }
      const instance = element('div', 'switcher-instance');
      if (selected) instance.classList.add('switcher-instance-current');
      const stop = instanceCloseButton(item, 'icon-button switcher-close', () => {
        if (selected) { location.replace('/'); return; }
        targets = targets.filter(target => target !== item);
        renderTargets(menu.querySelector('input')?.value ?? '');
        (menu.querySelector('a[aria-current="page"]') ?? menu.querySelector('a')).focus({ preventScroll: true });
      }, failure => {
        const alert = document.querySelector('#error');
        alert.textContent = failure.message;
        alert.hidden = false;
      });
      instance.append(row, stop);
      section.append(instance);
    }
    container.append(section);
  }
  if (!matches.length) container.append(element('p', 'switcher-empty', 'No matches'));
}
export async function initSwitcher() {
  if (!route) return;
  kind = route[1];
  triggers = [...document.querySelectorAll('#directory, #app-directory')];
  try {
    const responses = await Promise.all(['/api/projects', '/api/instances'].map(url => dataFetch(url)));
    for (const response of responses) if (!response.ok) throw new Error(`Cannot load project switcher: HTTP ${response.status}`);
    const [projects, instances] = await Promise.all(responses.map(response => response.json()));
    targets = [...projects.map(item => ({ ...item, kind: 'p' })), ...instances.map(item => ({ ...item, kind: 'i' }))];
    current = targets.find(item => item.kind === kind && (item.slug ?? item.id) === route[2]);
    if (!current) return;
    document.body.append(menu);
    for (const trigger of triggers) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', menu.id);
      trigger.querySelector('[data-icon]').innerHTML = icon(kind === 'i' ? 'radio' : 'folder', 14);
      const chevron = element('span', 'switcher-chevron'); chevron.innerHTML = icon('chevron-down', 12); trigger.append(chevron);
      trigger.onclick = () => menu.matches(':popover-open') ? close() : open(trigger);
      trigger.onkeydown = event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(trigger); }
      };
    }
    updateSwitcherLabels();
    menu.addEventListener('toggle', event => {
      for (const trigger of triggers) trigger.setAttribute('aria-expanded', String(event.newState === 'open' && trigger === opener));
    });
    window.addEventListener('resize', position);
    document.addEventListener('keydown', event => {
      if (!menu.matches(':popover-open') || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const input = menu.querySelector('input');
        if (input) { event.preventDefault(); event.stopImmediatePropagation(); input.focus(); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (event.target.matches('input') && ['Home', 'End'].includes(event.key)) return;
      const actions = [...menu.querySelectorAll('a, .switcher-close:not(:disabled)')];
      const index = actions.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
      event.preventDefault(); event.stopImmediatePropagation(); actions[next]?.focus();
    }, true);
  } catch (failure) {
    if (isUnauthorized()) return;
    // Keep the current target visible when hub discovery is temporarily unavailable.
    window.dispatchEvent(new CustomEvent('sdg-switcher-error', { detail: failure }));
  }
}
