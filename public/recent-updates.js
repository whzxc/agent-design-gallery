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
  let activeGroup, query, verifying;
  const visualStates = new Map();
  function cancelVisual() {
    verifying?.controller.abort();
    verifying = null;
  }
  function close() {
    cancelVisual();
    activeGroup = null;
    visualStates.clear();
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
    message = 'Finding changed sources and inputs…';
    update();
    try {
      ({ baseline } = await recordVisit(directory, true, false));
      signal.throwIfAborted();
      const dates = boundaries();
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
      const nodes = [controls, element('p', 'Frames whose sources or inputs changed.')];
      if (message) nodes.push(element('p', message));
      if (result?.available && !result.complete)
        nodes.push(element('p', 'Incomplete coverage. Unclassified frames keep their normal emphasis.'));
      const matches = new Map(),
        redirects = new Map();
      const key = identity;
      for (const period of result?.periods ?? []) {
        const section = element('section');
        const header = element('header');
        const visual = visualStates.get(period);
        const action = element('button', verifying?.period === period ? 'Cancel comparison' : 'Visual changes');
        action.setAttribute('aria-label', action.textContent + ' · ' + period.title);
        action.dataset.recentFocus = JSON.stringify(['visual', period.base, period.head]);
        action.onclick = () => void visualChanges(period);
        header.append(element('h3', period.title), action);
        section.append(header);
        if (visual) {
          visual.labels = new Map();
          visual.output = element('small', visual.message);
          visual.output.setAttribute('role', 'status');
          section.append(visual.output);
        }
        for (const subject of period.subjects) section.append(element('small', subject));
        const inherited = new Map(),
          direct = [];
        for (const row of period.rows) {
          const locator = redirects.has(key(row)) ? redirects.get(key(row)) : row;
          const source = context.relative(locator?.source ?? row.source);
          const live = row.status !== 'removed' && locator && context.visible.get(source)?.has(locator.frame);
          if (!live && !context.inScope(context.relative(row.source), row.frame, row.chapter)) continue;
          const group = row.causes && JSON.stringify([period.title, ...row.causes]);
          if (live && (activeGroup ? activeGroup === group : !group)) {
            if (!matches.has(source)) matches.set(source, new Set());
            matches.get(source).add(locator.frame);
          }
          if (group) {
            if (!inherited.has(group)) inherited.set(group, { causes: row.causes, rows: [], count: 0 });
            inherited.get(group).count++;
            if (activeGroup !== group) continue;
          }
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
          if (visual?.verdicts) {
            const status = visual.verdicts.get(key(row)) ?? (row.former && visual.verdicts.get(key(row.former)));
            const annotation = element(
              'small',
              status
                ? 'Visual comparison · ' + status
                : visual.complete
                  ? 'Visually unchanged'
                  : verifying?.period === period
                    ? ''
                    : 'Visual result unknown'
            );
            visual.labels.set(key(row), annotation);
            if (row.former) visual.labels.set(key(row.former), annotation);
            button.append(annotation);
          }
          if (live) {
            button.setAttribute('aria-label', 'Locate ' + row.frame + ' on board');
            button.dataset.recentFocus = JSON.stringify([period.base, period.head, row.source, row.frame]);
            button.onclick = () => context.locate(source, locator.frame);
          }
          if (group) inherited.get(group).rows.push(button);
          else direct.push(button);
        }
        section.append(...direct);
        const select = (id) => {
          activeGroup = activeGroup === id ? null : id;
          update();
        };
        if (inherited.size) section.append(element('small', 'Shared inputs'));
        for (const [id, { causes, rows, count }] of inherited) {
          const button = element(
            'button',
            causeLabel(causes) + ' → ' + count + (count === 1 ? ' frame' : ' frames')
          );
          button.title = causes.join(', ');
          button.setAttribute('aria-label', button.title + ' → ' + count + ' frames');
          button.setAttribute('aria-expanded', String(activeGroup === id));
          button.onclick = () => select(id);
          section.append(button, ...rows);
        }
        if (period.globalCauses?.length) {
          const id = JSON.stringify([period.title, 'global']);
          const button = element('button', causeLabel(period.globalCauses) + ' → all frames');
          button.title = period.globalCauses.join(', ');
          button.setAttribute('aria-label', button.title + ' → all frames');
          button.setAttribute('aria-pressed', String(activeGroup === id));
          button.onclick = () => select(id);
          section.append(element('small', 'Global inputs'), button);
          if (activeGroup === id) {
            for (const [source, frames] of Object.entries(period.globalFrames ?? {}))
              for (const frame of frames) {
                const ref = { source, frame },
                  target = redirects.has(key(ref)) ? redirects.get(key(ref)) : ref;
                if (!target) continue;
                const file = context.relative(target.source);
                if (!context.visible.get(file)?.has(target.frame)) continue;
                if (!matches.has(file)) matches.set(file, new Set());
                matches.get(file).add(target.frame);
              }
          }
        }
        if (!direct.length && !inherited.size && !period.globalCauses?.length && period.complete)
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
        const same = [...container.querySelectorAll('button, summary')].find((node) =>
          focus.dataset.recentFocus
            ? node.dataset.recentFocus === focus.dataset.recentFocus
            : node.textContent === focus.textContent &&
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

function identity({ source, frame }) {
  return JSON.stringify([source, frame]);
}
function causeLabel(causes) {
  return causes.length <= 2
    ? causes.join(', ')
    : causes.slice(0, 2).join(', ') + ' + ' + (causes.length - 2) + ' more';
}
