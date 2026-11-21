import { dataFetch } from './auth.js';
import { boardElement as node, frameKey } from './view-boards.js';

async function read(path, signal) {
  const response = await dataFetch(path, { signal });
  const result = await response.json();
  if (!response.ok || result.error) throw Error(result.error || 'Cannot read project history.');
  return result;
}

// history.state belongs to this navigation entry and survives reload. Local storage
// belongs to this browser profile. The lock orders checkpoint writes from its tabs.
const started = window.history.state?.adgVisitStarted ?? performance.timeOrigin;
let visitDirectory, pendingVisit;
const successfulVisits = new Set();
export function recordVisit(directory, refresh = false, successful = true) {
  if (successful && !successfulVisits.has(directory)) {
    successfulVisits.add(directory);
    refresh = true;
  }
  if (!refresh && visitDirectory === directory && pendingVisit) return pendingVisit;
  visitDirectory = directory;
  pendingVisit = read('api/recent-visit')
    .then(async ({ head, branch }) => {
      if (!head || directory !== visitDirectory) return {};
      const key = 'adg-visit:' + JSON.stringify([directory, branch]);
      const capture = () => {
        const entry = window.history.state ?? {};
        const visits = entry.adgVisits ?? {};
        if (key in visits) return { baseline: visits[key], branch };
        const last = JSON.parse(localStorage.getItem(key) || 'null');
        const baseline = last?.started > started ? last.previous : (last?.head ?? null);
        if (!successfulVisits.has(directory)) return { baseline, branch };
        if (!last || last.started < started)
          localStorage.setItem(key, JSON.stringify({ started, head, previous: baseline }));
        window.history.replaceState(
          { ...entry, adgVisits: { ...visits, [key]: baseline }, adgVisitStarted: started },
          ''
        );
        return { baseline, branch };
      };
      return navigator.locks ? navigator.locks.request(key, capture) : capture();
    })
    .catch(() => ({}));
  return pendingVisit;
}

function boundaries() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const week = new Date(day);
  week.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return { day: +day, week: +week };
}

export function createHistoryFilter(update) {
  let request, timer, invalidation, directory, result, message, baseline, range, stamp;
  let query, verifying;
  let cached;
  const visualStates = new Map();
  const expanded = new Set();
  function cancelVisual() {
    verifying?.controller.abort();
    verifying = null;
  }
  function close() {
    if (verifying) visualStates.delete(verifying.period);
    cancelVisual();
    request?.abort();
    request = null;
    clearTimeout(timer);
    clearTimeout(invalidation);
  }
  async function open(nextDirectory, nextRange, force = false) {
    close();
    if (nextDirectory !== directory) expanded.clear();
    range = nextRange ?? (nextDirectory === directory ? range : null) ?? 'week';
    directory = nextDirectory;
    const controller = (request = new AbortController());
    const { signal } = controller;
    const dates = boundaries();
    const cacheKey = JSON.stringify([directory, range, dates]);
    const reuse = !force && cached?.key === cacheKey;
    if (!reuse) {
      result = null;
      cached = null;
      visualStates.clear();
      message = 'Finding changed sources and inputs…';
    }
    update();
    const validate = async () => {
      try {
        const state = await read('api/recent-state', signal);
        signal.throwIfAborted();
        if (stamp !== JSON.stringify([state.head, state.branch, state.generation, boundaries()])) {
          void open(directory, range, true);
          return;
        }
      } catch {
        // Try again after the viewer connection returns.
      }
      if (!signal.aborted) timer = setTimeout(validate, 5000);
    };
    if (reuse) {
      void validate();
      return;
    }
    try {
      ({ baseline } = await recordVisit(directory, true, false));
      signal.throwIfAborted();
      query = new URLSearchParams(dates);
      if (range === 'visit' && baseline) query.set('since', baseline);
      const response = await read('api/recent-updates?' + query, signal);
      signal.throwIfAborted();
      result = response;
      message = !result.available
        ? 'Recently updated is unavailable outside a Git project.'
        : result.notice || (!baseline ? 'Your next visit will have a revision to compare.' : '');
      if (!baseline || result.notice) range = 'week';
      stamp = JSON.stringify([result.head, result.branch, result.generation, dates]);
      cached = result.available && result.complete && !result.stale
        ? { key: JSON.stringify([directory, range, dates]) }
        : null;
      update();
      if (result.stale) timer = setTimeout(() => void open(directory, range, true), 200);
      else if (result.available) timer = setTimeout(validate, 5000);
    } catch (error) {
      if (!signal.aborted) {
        message = 'Incomplete coverage. ' + error.message;
        update();
      }
    }
  }
  async function visualChanges(period) {
    if (verifying?.period === period) {
      cancelVisual();
      visualStates.delete(period);
      update();
      return;
    }
    if (verifying) visualStates.delete(verifying.period);
    cancelVisual();
    const controller = new AbortController();
    verifying = { period, controller };
    const state = { message: 'Preparing visual comparison', verdicts: new Map() };
    visualStates.set(period, state);
    update();
    try {
      const params = new URLSearchParams(query);
      params.set('from', period.base ?? '');
      params.set('to', period.head ?? '');
      params.set('generation', result.generation);
      const response = await dataFetch('api/recent-visual?' + params, { signal: controller.signal });
      if (!response.ok) throw Error('Visual comparison unavailable.');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = '',
        finished = false;
      function apply(line) {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.error) throw Error(event.error);
        if (event.phase) {
          state.message = event.phase + (event.total ? ' · ' + event.completed + ' / ' + event.total : '') + '…';
          if (state.output) state.output.textContent = state.message;
          for (const row of event.changes ?? []) {
            for (const id of [identity(row), ...(row.former ? [identity(row.former)] : [])]) {
              state.verdicts.set(id, row.status);
              const label = state.labels?.get(id);
              if (label) label.textContent = 'Visual comparison · ' + row.status;
            }
          }
        } else if (event.result) {
          if (event.result.stale) throw Error('Period changed. Refresh Recently updated.');
          const checked = event.result.periods[0];
          if (!checked) throw Error('Period unavailable.');
          state.verdicts = new Map();
          for (const row of checked.rows) {
            state.verdicts.set(identity(row), row.status);
            if (row.former) state.verdicts.set(identity(row.former), row.status);
          }
          state.complete = checked.complete;
          state.message = checked.complete
            ? 'Visual comparison complete · ' + checked.rows.length + ' changes'
            : 'Visual coverage incomplete. ' + (checked.failures?.[0]?.message ?? '');
          finished = true;
        }
      }
      for (;;) {
        const { value, done } = await reader.read();
        controller.signal.throwIfAborted();
        if (done) {
          apply(pending);
          break;
        }
        const lines = (pending + value).split('\n');
        pending = lines.pop();
        for (const line of lines) apply(line);
      }
      if (!finished) throw Error('Visual comparison ended early.');
    } catch (error) {
      if (controller.signal.aborted) return;
      state.verdicts.clear();
      state.message = error.message;
    } finally {
      if (verifying?.controller === controller) {
        verifying = null;
        update();
      }
    }
  }
  return {
    open,
    close,
    invalidate() {
      cached = null;
      if (!request) return;
      clearTimeout(invalidation);
      invalidation = setTimeout(() => void open(directory, range, true), 200);
    },
    render(container, { relative, frames, inScope, card }) {
      const controls = node('div', 'recent-ranges');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'History range');
      for (const [id, title] of [['week', 'This week'], ['visit', 'Since my last visit']]) {
        const button = node('button', '', title);
        button.dataset.recentFocus = id;
        button.setAttribute('aria-pressed', String(id === range));
        button.disabled = id === 'visit' && !baseline;
        button.onclick = () => void open(directory, id);
        controls.append(button);
      }
      const children = [controls];
      container.dataset.historyReady = String(!!result || !!message?.startsWith('Incomplete coverage'));
      if (message) {
        const status = node('p', 'view-board-status', message);
        status.setAttribute('role', 'status');
        children.push(status);
      }
      if (result?.available && !result.complete)
        children.push(node('p', 'view-board-status', 'Incomplete history coverage.'));
      const redirects = new Map();
      for (const period of result?.periods ?? []) {
        const periodKey = JSON.stringify([period.title, period.base, period.head]);
        const section = node('section', 'view-board-section recent-period');
        const header = node('header', 'view-section-heading');
        const heading = node('div');
        heading.append(node('h2', '', period.title));
        if (period.globalCauses?.length)
          heading.append(globalInputs(period.globalCauses, expanded, JSON.stringify([periodKey, 'global'])));
        const visual = visualStates.get(period);
        const action = node('button', 'view-board-action', verifying?.period === period ? 'Cancel comparison' : 'Visual changes');
        action.setAttribute('aria-label', action.textContent + ' · ' + period.title);
        action.dataset.recentFocus = periodKey;
        action.onclick = () => void visualChanges(period);
        header.append(heading, action);
        section.append(header);
        if (visual) {
          visual.labels = new Map();
          visual.output = node('small', 'recent-visual', visual.message);
          visual.output.setAttribute('role', 'status');
          section.append(visual.output);
        }

        const sources = new Map();
        const removed = [];
        for (const row of period.rows) {
          const id = identity(row);
          const locator = redirects.has(id) ? redirects.get(id) : row;
          const source = relative(locator?.source ?? row.source);
          const ref = locator && frames.get(frameKey(source, locator.frame));
          if (!ref && !inScope(relative(row.source), row.frame, row.chapter)) continue;
          if (row.status === 'removed' || !locator) {
            removed.push(row);
            continue;
          }
          if (!ref) continue;
          if (!sources.has(source)) sources.set(source, { direct: [], shared: new Map() });
          const { direct, shared } = sources.get(source);
          if (row.causes?.length) {
            const key = JSON.stringify(row.causes);
            if (!shared.has(key)) shared.set(key, { causes: row.causes, frames: [] });
            shared.get(key).frames.push({ row, ref });
          } else direct.push({ row, ref });
        }
        for (const [source, { direct, shared }] of sources) {
          const group = node('section', 'recent-source');
          group.append(node('h3', 'recent-source-heading view-source-name', source));
          function grid(items, sharedInput = false) {
            const gallery = node('div', 'recent-frame-grid');
            for (const { row, ref } of items) {
              const badge = sharedInput ? 'Affected by shared input' : row.status === 'added' ? 'New' : 'Edited';
              const frame = card(ref, { badge, source: false });
              frame.querySelector('.view-show-in-board').dataset.recentFocus = JSON.stringify([periodKey, identity(row)]);
              if (row.former) {
                const former = node('small', 'view-source-name', 'From ' + relative(row.former.source) + ' · ' + row.former.frame);
                former.title = former.textContent;
                frame.querySelector('.view-frame-caption').append(former);
              }
              if (visual) {
                const id = identity(row), oldId = row.former && identity(row.former);
                const status = visual.verdicts.get(id) ?? visual.verdicts.get(oldId);
                const annotation = node('small', 'recent-visual', status
                  ? 'Visual comparison · ' + status
                  : visual.complete ? 'Visually unchanged' : verifying?.period === period ? '' : 'Visual result unknown');
                visual.labels.set(id, annotation);
                if (oldId) visual.labels.set(oldId, annotation);
                frame.querySelector('.view-frame-caption').append(annotation);
              }
              gallery.append(frame);
            }
            return gallery;
          }
          if (direct.length) group.append(grid(direct));
          for (const [key, entry] of shared) {
            const id = JSON.stringify([periodKey, source, key]);
            const details = node('details', 'recent-shared');
            const summary = node('summary', '', entry.causes.join(', ') + ' · ' + entry.frames.length +
              (entry.frames.length === 1 ? ' affected frame' : ' affected frames'));
            summary.dataset.recentFocus = id;
            details.open = expanded.has(id);
            details.append(summary);
            const mount = () => {
              if (details.open) {
                expanded.add(id);
                if (details.children.length === 1) details.append(grid(entry.frames, true));
              } else {
                expanded.delete(id);
              }
            };
            mount();
            details.ontoggle = mount;
            group.append(details);
          }
          section.append(group);
        }
        if (removed.length) {
          const list = node('ul', 'recent-removed');
          for (const row of removed) list.append(node('li', '', relative(row.source) + ' · ' + row.frame));
          const group = node('section', 'recent-source');
          group.append(node('h3', 'recent-source-heading', 'Removed frames'), list);
          section.append(group);
        }
        if (!removed.length && !sources.size && !period.globalCauses?.length && period.complete)
          section.append(node('p', 'recent-visual view-board-status', 'No matching changes in this scope.'));
        for (const failure of period.failures ?? []) section.append(node('small', 'recent-visual', failure.message));
        children.push(section);
        // Traverse newest first to resolve historical names forward to the current frame.
        const prior = new Map(redirects);
        for (const row of period.rows) {
          if (row.former) prior.set(identity(row.former), redirects.has(identity(row)) ? redirects.get(identity(row)) : row);
          if (row.status === 'added' || row.status === 'removed' || row.former) prior.set(identity(row), null);
        }
        for (const [id, target] of prior) redirects.set(id, target);
      }
      const focus = container.contains(document.activeElement) ? document.activeElement.dataset.recentFocus : null;
      container.replaceChildren(...children);
      if (focus) container.querySelector('[data-recent-focus="' + CSS.escape(focus) + '"]')?.focus({ preventScroll: true });
    }
  };
}

function causePriority(file) {
  const name = file.split('/').at(-1);
  if (/^adg\.config\.[cm]?[jt]s$/.test(name)) return 0;
  if (name === 'package.json') return 1;
  if (/^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(name)) return 2;
  return file.includes('/') ? 4 : 3;
}

function globalInputs(causes, expanded, id) {
  const files = [...new Set(causes)];
  const named = [...files].sort((a, b) => causePriority(a) - causePriority(b) ||
    Number(a.includes('/')) - Number(b.includes('/')) || a.localeCompare(b)).slice(0, 2);
  const remaining = files.length - named.length;
  const details = node('details', 'recent-global');
  const summary = node('summary', 'view-board-status');
  summary.dataset.recentFocus = id;
  summary.append(
    node('span', '', 'Global inputs changed: ' + files.length + (files.length === 1 ? ' file' : ' files')),
    node('span', 'recent-global-sample', ' (' + named.join(', ')),
    node('span', '', (remaining ? ', +' + remaining : '') + ')')
  );
  details.open = expanded.has(id);
  details.append(summary);
  const showList = () => {
    if (!details.open) {
      expanded.delete(id);
      return;
    }
    expanded.add(id);
    if (details.children.length > 1) return;
    const directories = new Map();
    for (const file of files.sort((a, b) => a.localeCompare(b))) {
      const separator = file.lastIndexOf('/');
      const directory = separator < 0 ? '' : file.slice(0, separator);
      if (!directories.has(directory)) directories.set(directory, []);
      directories.get(directory).push(file.slice(separator + 1));
    }
    const groups = node('div', 'recent-global-list');
    for (const directory of [...directories.keys()].sort((a, b) => a.localeCompare(b))) {
      const group = node('section');
      const list = node('ul');
      for (const file of directories.get(directory)) list.append(node('li', '', file));
      group.append(node('h3', 'view-source-name', directory || 'Project root'), list);
      groups.append(group);
    }
    details.append(groups);
  };
  if (details.open) showList();
  details.ontoggle = showList;
  return details;
}

function identity({ source, frame }) {
  return frameKey(source, frame);
}
