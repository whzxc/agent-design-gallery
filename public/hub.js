import { dataFetch, isUnauthorized } from './auth.js';
import { icon, hydrateIcons } from './icons.js';
import { instanceCloseButton } from './instance-actions.js';

const projects = document.querySelector('#projects');
const instances = document.querySelector('#instances');
const liveSection = document.querySelector('.live-section');
const error = document.querySelector('#error');
const rescan = document.querySelector('#rescan');
const searchBox = document.querySelector('#hub-search');
const searchInput = document.querySelector('#hub-search-input');
const searchKey = document.querySelector('#hub-search-key');
const searchClear = document.querySelector('#hub-search-clear');
const media = matchMedia('(prefers-color-scheme: dark)');

let projectData = [];
let instanceData = [];
let rootData = [];
let rescanning = false;

function applyTheme() {
  const saved = localStorage.getItem('adg-theme');
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
function proxyReason(reason) {
  if (reason === 'proxy-auth-unsupported') return 'Update ADG to proxy';
  if (reason === 'health-unavailable') return 'Viewer not responding';
  return 'Proxy unavailable';
}
function formatCounts(project) {
  if (project.sourceCount == null && project.frameCount == null) return '—';
  const s = project.sourceCount ?? 0;
  const sources = `${s} ${s === 1 ? 'source' : 'sources'}`;
  if (project.frameCount == null) return sources;
  const f = project.frameCount;
  return `${sources} · ${f} ${f === 1 ? 'frame' : 'frames'}`;
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
  const text = branch || (head ? 'HEAD' : '—');
  const label = element('span', '', text);
  label.title = branch || (head ? 'Detached HEAD' : '');
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
    element('div', 'hub-counts', formatCounts(project)));
  row.append(columns);
  if (incompatible || project.error) {
    const warning = element('div', 'hub-warning');
    warning.append(glyph('circle-alert', 14));
    if (incompatible) warning.append(element('span', '', 'Version incompatible'),
      element('span', 'hub-warning-detail', `Requires ADG ${project.compatibility.requires?.replace(/>=/g, '≥')} · hub ${project.compatibility.version}`));
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
  const meta = element('div', 'hub-git instance-meta');
  if (instance.branch) {
    const branchLabel = element('span', '', instance.branch);
    branchLabel.title = instance.branch;
    meta.append(glyph('git-branch', 13), branchLabel);
  }
  if (instance.port != null) meta.append(element('code', '', `:${instance.port}`));
  if (instance.directory) {
    const dir = element('span', 'instance-dir', instance.directory);
    dir.title = instance.directory;
    meta.append(dir);
  }
  const started = element('span', 'instance-start', `${meta.childElementCount ? '· ' : ''}Started ${relativeTime(instance.startedAt)}`);
  started.title = instance.startedAt || '';
  meta.append(started);
  identity.append(meta);
  row.append(identity);
  if (!instance.proxyable) {
    const warning = element('span', 'instance-warning', proxyReason(instance.reason));
    warning.prepend(glyph('circle-alert', 14));
    row.append(warning);
  }
  if (instance.stoppable) {
    row.classList.add('instance-row-closeable');
    row.append(instanceCloseButton(instance, 'instance-close', () => {
      instanceData = instanceData.filter(item => item !== instance);
      renderLists();
      (instances.querySelector('a, button') ?? (rescan.disabled ? document.querySelector('#projects a') : rescan))?.focus({ preventScroll: true });
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
function matchesQuery(fields, query) {
  if (!query) return true;
  return fields.some(value => value && String(value).toLowerCase().includes(query));
}
function updateRescanState() {
  rescan.disabled = rescanning || rootData.length === 0;
  rescan.toggleAttribute('data-loading', rescanning);
  rescan.title = !rescanning && rootData.length === 0 ? 'No roots registered' : '';
  rescan.replaceChildren(glyph(rescanning ? 'loader-circle' : 'refresh-cw', 14),
    element('span', '', rescanning ? 'Rescanning…' : 'Rescan'));
}
function renderLists() {
  const total = projectData.length + instanceData.length;
  const showSearch = total >= 5;
  searchBox.hidden = !showSearch;
  if (!showSearch && searchInput.value) {
    searchInput.value = '';
    searchClear.hidden = true;
    searchKey.hidden = false;
  }
  const query = showSearch ? searchInput.value.trim().toLowerCase() : '';
  const filteredProjects = projectData.filter(project =>
    matchesQuery([project.name, project.design, project.path, project.branch, project.head], query));
  const filteredInstances = instanceData.filter(instance =>
    matchesQuery([instance.projectName, instance.name, instance.id, instance.directory, instance.branch, instance.port != null ? `:${instance.port}` : ''], query));

  if (filteredProjects.length) {
    projects.hidden = false;
    projects.className = 'hub-list';
    const header = element('div', 'project-columns project-header');
    header.append(...['Projects', 'Design changed', 'Git', 'Designs'].map(label => element('span', '', label)));
    projects.replaceChildren(header, ...filteredProjects.map(projectRow));
  } else if (query) {
    if (filteredInstances.length) {
      projects.hidden = true;
      projects.replaceChildren();
    } else {
      projects.hidden = false;
      projects.className = '';
      projects.replaceChildren(empty('No matches', `Nothing matched “${searchInput.value.trim()}”.`));
    }
  } else {
    projects.hidden = false;
    projects.className = '';
    projects.replaceChildren(empty(rootData.length ? 'No projects found' : 'No roots registered', rootData.length
      ? `No design sources found in the ${rootData.length} registered ${rootData.length === 1 ? 'root' : 'roots'}.`
      : 'Run adg root add <dir> to register a workspace.'));
  }

  instances.className = 'hub-list';
  instances.replaceChildren(...filteredInstances.map(instanceRow));
  liveSection.hidden = !filteredInstances.length;
}
async function refresh() {
  [projectData, instanceData, rootData] = await Promise.all([api('api/projects'), api('api/instances'), api('api/roots')]);
  updateRescanState();
  renderLists();
}
function report(failure) {
  if (isUnauthorized()) return;
  error.textContent = failure.message;
  error.hidden = false;
}
function pending(value) {
  rescanning = value;
  updateRescanState();
}

searchInput.addEventListener('input', () => {
  const hasValue = Boolean(searchInput.value);
  searchClear.hidden = !hasValue;
  searchKey.hidden = hasValue;
  renderLists();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  searchKey.hidden = false;
  renderLists();
  searchInput.focus();
});
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape' && searchInput.value) {
    event.preventDefault();
    searchClear.click();
  }
});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && !searchBox.hidden) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

rescan.addEventListener('click', async () => {
  pending(true);
  error.hidden = true;
  try { await api('api/rescan', { method: 'POST' }); await refresh(); }
  catch (failure) { report(failure); }
  finally { pending(false); }
});
try { await refresh(); } catch (failure) { report(failure); }
