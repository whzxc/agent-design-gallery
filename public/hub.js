import { dataFetch, isUnauthorized } from './auth.js';

const projects = document.querySelector('#projects');
const instances = document.querySelector('#instances');
const error = document.querySelector('#error');
const rescan = document.querySelector('#rescan');
async function api(url, init) {
  const response = await dataFetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function item(name, url, details) {
  const row = document.createElement('li');
  const title = document.createElement(url ? 'a' : 'span');
  title.textContent = name;
  if (url) title.href = url;
  row.append(title, document.createTextNode(` — ${details.filter(value => value !== null && value !== undefined && value !== '').join(' · ')}`));
  return row;
}
async function refresh() {
  const [projectData, instanceData] = await Promise.all([api('api/projects'), api('api/instances')]);
  projects.replaceChildren(...projectData.map(project => item(project.name, project.url, [
    project.path, project.branch, project.head,
    project.sourceCount === null ? null : `${project.sourceCount} sources`,
    project.frameCount === null ? null : `${project.frameCount} frames`,
    project.lastDesignChange?.committedAt,
    project.lastDesignChange?.dirty ? 'Uncommitted design changes' : null,
    project.compatibility?.compatible === false ? `Requires SDG ${project.compatibility.requires}` : null,
    project.error,
  ])));
  instances.replaceChildren(...instanceData.map(instance => item(instance.projectName ?? instance.name ?? instance.id,
    instance.proxyable ? instance.url ?? `/i/${encodeURIComponent(instance.id)}/` : null,
    [instance.directory, instance.branch, instance.worktree ? 'Worktree' : null, instance.proxyable ? null : 'Not proxyable'])));
}
function report(failure) {
  if (isUnauthorized()) return;
  error.textContent = failure.message;
  error.hidden = false;
}
rescan.addEventListener('click', async () => {
  rescan.disabled = true;
  error.hidden = true;
  try { await api('api/rescan', { method: 'POST' }); await refresh(); }
  catch (failure) { report(failure); }
  finally { rescan.disabled = false; }
});
try { await refresh(); } catch (failure) { report(failure); }
