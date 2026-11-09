import { dataFetch, isUnauthorized } from './auth.js';
import { icon, hydrateIcons } from './icons.js';
import { instanceCloseButton } from './instance-actions.js';

const projects = document.querySelector('#projects');
const instances = document.querySelector('#instances');
const error = document.querySelector('#error');
const rescan = document.querySelector('#rescan');
const media = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const saved = localStorage.getItem('sdg-theme');
  document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : media.matches ? 'dark' : 'light';
}
applyTheme();
media.addEventListener('change', applyTheme);
hydrateIcons();

async function api(url, init) {
  const response = await dataFetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function glyph(name, size = 16) {
  const node = element('span');
  node.innerHTML = icon(name, size);
  return node.firstElementChild;
}
function relativeTime(value) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) { const hours = Math.floor(seconds / 3600); return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`; }
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
function change(project, phone = false) {
  const node = element('span', phone ? 'phone-change' : 'hub-change desktop-change');
  if (project.lastDesignChange?.dirty) {
    const dot = element('span', 'hub-dirty');
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', 'Uncommitted design changes');
    dot.title = 'Uncommitted design changes';
    node.append(dot);
  }
  const time = element('span', '', relativeTime(project.lastDesignChange?.committedAt));
  if (project.lastDesignChange?.committedAt) time.title = project.lastDesignChange.committedAt;
  node.append(time);
  return node;
}
function git(branch, head) {
  const node = element('div', 'hub-git');
  const label = element('span', '', branch || '—');
  label.title = branch || '';
  node.append(glyph('git-branch', 13), label);
  if (head) node.append(element('code', '', head));
  return node;
}
function destination(name, url, kind) {
  const node = element('div', 'hub-name');
  const title = element(url ? 'a' : 'span', 'hub-title', name);
  if (url) title.href = url;
  node.append(glyph(kind), title);
  if (url) { const arrow = glyph('arrow-up-right', 12); arrow.classList.add('hub-external'); node.append(arrow); }
  return node;
}
function projectRow(project) {
  const incompatible = project.compatibility?.compatible === false;
  const row = element('div', 'project-row');
  const columns = element('div', 'project-columns');
  const identity = element('div', 'project-identity');
  const name = destination(project.name, incompatible || project.error ? null : project.url, 'folder');
  name.append(change(project, true));
  const path = project.design || project.path;
  const pathNode = element('div', 'hub-path', path);
  pathNode.title = path;
  identity.append(name, pathNode);
  columns.append(identity, change(project), git(project.branch, project.head),
    element('div', 'hub-counts', `${project.sourceCount ?? '—'} sources · ${project.frameCount ?? '—'} frames`));
  row.append(columns);
  if (incompatible || project.error) {
    const warning = element('div', 'hub-warning');
    warning.append(glyph('circle-alert', 14));
    if (incompatible) warning.append(element('span', '', 'Version incompatible'),
      element('span', 'hub-warning-detail', `Requires SDG ${project.compatibility.requires?.replace(/>=/g, '≥')} · hub ${project.compatibility.version}`));
    else warning.append(element('span', '', project.error));
    row.append(warning);
  }
  return row;
}
function instanceRow(instance) {
  const row = element('div', 'instance-row');
  const identity = element('div', 'instance-identity');
  identity.append(destination(instance.projectName ?? instance.name ?? instance.id,
    instance.proxyable ? instance.url ?? `/i/${encodeURIComponent(instance.id)}/` : null, 'radio'));
  const branch = git(instance.branch);
  const started = element('span', 'instance-start', `· Started ${relativeTime(instance.startedAt)}`);
  started.title = instance.startedAt || '';
  branch.append(started);
  identity.append(branch);
  row.append(identity);
  if (!instance.proxyable) {
    const warning = element('span', 'instance-warning', 'Proxy unavailable');
    warning.prepend(glyph('circle-alert', 14));
    row.append(warning);
  }
  if (instance.stoppable) {
    row.classList.add('instance-row-closeable');
    row.append(instanceCloseButton(instance, 'instance-close', () => {
      row.remove();
      document.querySelector('.live-section').hidden = !instances.childElementCount;
      (instances.querySelector('a, button') ?? rescan).focus({ preventScroll: true });
    }, report));
  }
  return row;
}
function empty(title, detail) {
  const node = element('div', 'hub-list hub-empty');
  const copy = element('div');
  copy.append(element('h2', '', title), element('p', '', detail));
  node.append(glyph('folders', 24), copy);
  return node;
}
async function refresh() {
  const [projectData, instanceData, roots] = await Promise.all([api('api/projects'), api('api/instances'), api('api/roots')]);
  if (projectData.length) {
    projects.className = 'hub-list';
    const header = element('div', 'project-columns project-header');
    header.append(...['Projects', 'Design changed', 'Git', 'Designs'].map(label => element('span', '', label)));
    projects.replaceChildren(header, ...projectData.map(projectRow));
  } else {
    projects.className = '';
    projects.replaceChildren(empty(roots.length ? 'No projects found' : 'No roots registered', roots.length
      ? `No design sources found in the ${roots.length} registered ${roots.length === 1 ? 'root' : 'roots'}.`
      : 'Register a root in the hub configuration to list projects.'));
  }
  instances.className = 'hub-list';
  instances.replaceChildren(...instanceData.map(instanceRow));
  document.querySelector('.live-section').hidden = !instanceData.length;
}
function report(failure) {
  if (isUnauthorized()) return;
  error.textContent = failure.message;
  error.hidden = false;
}
function pending(value) {
  rescan.disabled = value;
  rescan.replaceChildren(glyph(value ? 'loader-circle' : 'refresh-cw', 14),
    element('span', '', value ? 'Rescanning…' : 'Rescan'));
}
rescan.addEventListener('click', async () => {
  pending(true);
  error.hidden = true;
  try { await api('api/rescan', { method: 'POST' }); await refresh(); }
  catch (failure) { report(failure); }
  finally { pending(false); }
});
try { await refresh(); } catch (failure) { report(failure); }
