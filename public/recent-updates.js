import { dataFetch } from './auth.js';

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
  function close() {
    request?.abort();
    request = null;
    clearTimeout(timer);
    clearTimeout(invalidation);
  }
  async function open(nextDirectory, nextRange = 'week') {
    close();
    directory = nextDirectory;
    range = nextRange;
    const controller = (request = new AbortController());
    const { signal } = controller;
    result = null;
    message = 'Comparing frames across revisions…';
    update();
    try {
      ({ baseline } = await recordVisit(directory, true, false));
      signal.throwIfAborted();
      const dates = boundaries();
      const query = new URLSearchParams(dates);
      if (range === 'visit' && baseline) query.set('since', baseline);
      const response = await read('api/recent-updates?' + query, signal);
      signal.throwIfAborted();
      result = response;
      message = !result.available
        ? 'Recently updated is unavailable outside a Git project.'
        : result.notice || (!baseline ? 'Your next visit will have a revision to compare.' : '');
      if (!baseline || result.notice) range = 'week';
      stamp = JSON.stringify([result.head, result.branch, result.generation, dates]);
      update();
      if (result.stale) {
        timer = setTimeout(() => void open(directory, range), 200);
        return;
      }
      const validate = async () => {
        try {
          const state = await read('api/recent-state', signal);
          if (signal.aborted) return;
          if (
            (result.available &&
              stamp !== JSON.stringify([state.head, state.branch, state.generation, boundaries()])) ||
            (!result.available && state.branch)
          ) {
            void open(directory, range);
            return;
          }
        } catch {
          /* Recheck when the viewer connection returns. */
        }
        if (!signal.aborted) timer = setTimeout(validate, 5000);
      };
      timer = setTimeout(validate, 5000);
    } catch (error) {
      if (!signal.aborted) {
        message = 'Incomplete coverage. ' + error.message;
        update();
      }
    }
  }
  return {
    open,
    close,
    invalidate() {
      if (!request) return;
      clearTimeout(invalidation);
      invalidation = setTimeout(() => void open(directory, range), 200);
    },
    render(container, context) {
      const controls = element('div');
      controls.className = 'recent-ranges';
      for (const [id, title] of [
        ['week', 'This week'],
        ['visit', 'Since my last visit']
      ]) {
        const button = element('button', title);
        button.setAttribute('aria-pressed', String(id === range));
        button.disabled = id === 'visit' && !baseline;
        button.onclick = () => void open(directory, id);
        controls.append(button);
      }
      const nodes = [controls];
      if (message) nodes.push(element('p', message));
      if (result?.available && !result.complete)
        nodes.push(element('p', 'Incomplete coverage. Unclassified frames keep their normal emphasis.'));
      const matches = new Map(),
        redirects = new Map();
      const key = (row) => JSON.stringify([row.source, row.frame]);
      const expanded = new Set([...container.querySelectorAll('details[open]')].map((node) => node.dataset.group));
      for (const period of result?.periods ?? []) {
        const section = element('section');
        section.append(element('h3', period.title));
        for (const subject of period.subjects) section.append(element('small', subject));
        const inherited = new Map(),
          direct = [];
        for (const row of period.rows) {
          const locator = redirects.has(key(row)) ? redirects.get(key(row)) : row;
          const source = context.relative(locator?.source ?? row.source);
          const live = row.status !== 'removed' && locator && context.visible.get(source)?.has(locator.frame);
          if (!live && !context.inScope(context.relative(row.source), row.frame, row.chapter)) continue;
          const button = element(live ? 'button' : 'div');
          button.className = 'recent-row';
          button.append(
            element('span', row.frame),
            element('span', row.status[0].toUpperCase() + row.status.slice(1))
          );
          button.title = row.source;
          button.append(element('small', context.relative(row.source)));
          if (row.former)
            button.append(
              element('small', 'From ' + context.relative(row.former.source) + ' · ' + row.former.frame)
            );
          if (live) {
            if (!matches.has(source)) matches.set(source, new Set());
            matches.get(source).add(locator.frame);
            button.setAttribute('aria-label', 'Locate ' + row.frame + ' on board');
            button.onclick = () => context.locate(source, locator.frame);
          }
          if (row.causes) {
            const causes = [...row.causes].sort().join(', ') || 'Inherited changes';
            if (!inherited.has(causes)) inherited.set(causes, []);
            inherited.get(causes).push(button);
          } else direct.push(button);
        }
        section.append(...direct);
        if (inherited.size) section.append(element('small', 'Inherited changes'));
        for (const [cause, rows] of inherited) {
          const details = element('details');
          details.dataset.group = period.title + ' ' + cause;
          details.open = expanded.has(details.dataset.group);
          details.append(element('summary', cause + ' → ' + rows.length + ' frames'), ...rows);
          section.append(details);
        }
        if (!direct.length && !inherited.size && period.complete)
          section.append(element('p', 'No matching changes in this scope.'));
        for (const failure of period.failures ?? []) section.append(element('small', failure.message));
        nodes.push(section);
        // Traverse periods newest first. A removal breaks identity, including when
        // a later period added a different frame at the same path.
        const prior = new Map(redirects);
        for (const row of period.rows) {
          if (row.former) prior.set(key(row.former), redirects.has(key(row)) ? redirects.get(key(row)) : row);
          if (row.status === 'added' || row.status === 'removed' || row.former) prior.set(key(row), null);
        }
        for (const [id, target] of prior) redirects.set(id, target);
      }
      const focus = container.contains(document.activeElement) ? document.activeElement : null;
      container.replaceChildren(...nodes);
      if (focus) {
        const same = [...container.querySelectorAll('button, summary')].find(
          (node) =>
            node.textContent === focus.textContent &&
            node.getAttribute('aria-label') === focus.getAttribute('aria-label')
        );
        same?.focus({ preventScroll: true });
      }
      return result?.complete && result.available ? matches : null;
    }
  };
}
function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
