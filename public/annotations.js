import { dataFetch } from './auth.js';
import { icon } from './icons.js';

export const READABLE_ANNOTATION_SCALE = 0.45;

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const quoteShell = value => /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : `'${String(value).replace(/'/g, `'\\''`)}'`;
const toProjectSource = (sourcePrefix, value) => !value ? '' : (!sourcePrefix || value === sourcePrefix || value.startsWith(sourcePrefix + '/')) ? value : `${sourcePrefix}/${value}`;

export function formatElementReference({ sourcePrefix = '', source, owner, frame, elementId }) {
  const sourcePath = toProjectSource(sourcePrefix, source);
  const ownerPath = owner?.source ? toProjectSource(sourcePrefix, owner.source) : '';
  const exportName = owner?.export ? (ownerPath && ownerPath !== sourcePath ? `${ownerPath}#${owner.export}` : owner.export) : 'none';
  return `source=${sourcePath} export=${exportName} frame=${JSON.stringify(frame)} element=${elementId}`;
}

export function formatAgentPrompt({ projectRoot, sourcePrefix = '', notes }) {
  const root = projectRoot || '.';
  const header = [
    `Handle the following ADG design ${notes.length === 1 ? 'annotation' : `annotations (${notes.length})`} in project ${root}.`,
    `Run ADG CLI commands from ${root}. Keep the user's notes verbatim, inspect each target, apply the requested code/design changes, and mark each annotation addressed with a summary.`,
  ].join('\n');
  const blocks = notes.map(({ row, stale = false }) => {
    const sourcePath = toProjectSource(sourcePrefix, row.source);
    const owner = row.element?.owner ?? null;
    const ownerPath = owner?.source ? toProjectSource(sourcePrefix, owner.source) : '';
    const exportLabel = owner?.export ? (ownerPath && ownerPath !== sourcePath ? `${ownerPath}#${owner.export}` : owner.export) : 'none';
    const elementId = row.element?.id ?? null;
    const inspectFlag = elementId && !stale ? ` --element=${quoteShell(elementId)}` : '';
    const lines = [
      `## Annotation #${row.number} (id: ${row.id}, status: ${row.status}${stale ? ', stale: true' : ''})`,
      `- Project: ${root}`,
      `- Source: ${sourcePath}`,
      `- Export: ${exportLabel}`,
      `- Frame: ${row.frame}`,
      `- Element ID: ${elementId ? `${elementId}${stale ? ' (stale — element no longer matches; use fallback coordinates)' : ''}` : 'none (frame note)'}`,
      `- Coordinates: frame (${row.x.toFixed(3)}, ${row.y.toFixed(3)})${row.element ? `, element (${row.element.x.toFixed(3)}, ${row.element.y.toFixed(3)})` : ''}`,
      `- Note (verbatim):`,
      row.note,
    ];
    if (row.replies?.length) {
      lines.push(`- Thread (${row.replies.length}):`);
      for (const reply of row.replies) lines.push(`  - [${reply.author}] ${reply.message}`);
    }
    lines.push(
      `- CLI commands:`,
      `  adg annotations read ${quoteShell(row.id)} --json`,
      `  adg inspect ${quoteShell(sourcePath)} --frame=${quoteShell(row.frame)}${inspectFlag} --json`,
      `  adg annotations reply ${quoteShell(row.id)} --message="<reply>"`,
      `  adg annotations address ${quoteShell(row.id)} --message="<summary of changes>"`,
    );
    return lines.join('\n');
  });
  return [header, ...blocks].join('\n\n') + '\n';
}

export function createContextMenu(menu, { viewport, onOverlayChange }) {
  let restoreTarget = null;
  let suppressAutoRestore = false;

  const enabledItems = () => [...menu.querySelectorAll('button[role="menuitem"]:not(:disabled)')];

  menu.addEventListener('toggle', event => {
    if (event.newState === 'open') {
      for (const other of document.querySelectorAll(':popover-open')) {
        if (other !== menu) other.hidePopover();
      }
    } else if (!suppressAutoRestore && restoreTarget?.isConnected) {
      if (!document.activeElement || document.activeElement === document.body || menu.contains(document.activeElement)) {
        restoreTarget.focus({ preventScroll: true });
      }
      restoreTarget = null;
    }
    onOverlayChange?.();
  });

  menu.addEventListener('keydown', event => {
    const items = enabledItems();
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[(index + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[0].focus();
    } else if (event.key === 'End' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items.at(-1).focus();
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      event.stopPropagation();
      items[index].click();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });

  function close(restore = true) {
    const target = restoreTarget;
    suppressAutoRestore = true;
    if (menu.matches(':popover-open')) menu.hidePopover();
    suppressAutoRestore = false;
    restoreTarget = null;
    if (restore && target?.isConnected) target.focus({ preventScroll: true });
    onOverlayChange?.();
  }

  function open(items, { x, y, returnFocus } = {}) {
    restoreTarget = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : viewport);
    const nodes = items.map(entry => {
      if (entry.separator) {
        const rule = document.createElement('div');
        rule.className = 'rule';
        rule.setAttribute('role', 'separator');
        return rule;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = entry.label;
      button.disabled = !!entry.disabled;
      button.onclick = () => {
        const target = restoreTarget;
        close(false);
        if (target?.isConnected) target.focus({ preventScroll: true });
        entry.action?.();
      };
      return button;
    });
    menu.replaceChildren(...nodes);
    menu.style.left = '0px';
    menu.style.top = '0px';
    if (!menu.matches(':popover-open')) menu.showPopover();
    const mw = menu.offsetWidth || 220, mh = menu.offsetHeight || 160;
    const left = Math.max(8, Math.min(window.innerWidth - mw - 8, Math.round(x)));
    const top = Math.max(8, Math.min(window.innerHeight - mh - 8, Math.round(y)));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    enabledItems()[0]?.focus({ preventScroll: true });
    onOverlayChange?.();
  }

  return { open, close, isOpen: () => menu.matches(':popover-open') };
}

export function createAnnotations({
  viewport,
  panel,
  toggleButton,
  contextMenu,
  getState,
  hitFrameAt,
  navigateToNote,
  selectNoteTarget,
  inspectFrame,
  onChromeChange,
  copyText,
  fail,
}) {
  let rows = [];
  let rowsVersion = 0;
  let panelOpen = false;
  let statusFilter = 'all';
  let scopeFilter = 'all';
  let movingId = null;
  let highlightedId = null;
  let signature = '';
  let panelSignature = '';
  let renderedView = null;
  let renderedSceneKey = '';
  const knownParts = new Map();

  const layer = document.createElement('div');
  layer.className = 'annotation-layer';
  viewport.append(layer);

  panel.innerHTML = `
    <div class="annotations-header">
      <div class="annotations-title"><h2>Annotations</h2><span id="annotations-count" class="count">0</span></div>
      <button type="button" id="copy-open-annotations" class="annotations-copy-prompt" aria-label="Copy open annotations as agent prompt">${icon('copy', 12)}<span>Copy prompt</span></button>
    </div>
    <div class="annotations-filters">
      <div class="annotations-filter-group" role="group" aria-label="Filter by status">
        <button type="button" data-filter-status="open" aria-pressed="false">Open</button>
        <button type="button" data-filter-status="addressed" aria-pressed="false">Addressed</button>
        <button type="button" data-filter-status="resolved" aria-pressed="false">Resolved</button>
        <button type="button" data-filter-status="all" aria-pressed="true">All</button>
      </div>
      <div class="annotations-filter-group" role="group" aria-label="Filter by scope">
        <button type="button" data-filter-scope="frame" aria-pressed="false">Current frame</button>
        <button type="button" data-filter-scope="all" aria-pressed="true">All frames</button>
      </div>
    </div>
    <div class="annotation-list" role="list"></div>
  `;

  const dialog = document.createElement('dialog');
  dialog.className = 'annotation-editor';
  dialog.setAttribute('aria-labelledby', 'annotation-editor-title');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="annotation-editor-title">Add annotation</h2>
      <p class="annotation-editor-meta"></p>
      <textarea aria-label="Annotation note" maxlength="10000" rows="4"></textarea>
      <div class="annotation-editor-footer">
        <span class="annotation-editor-hint">Enter saves · Shift+Enter newline · Esc cancels</span>
        <div class="annotation-editor-buttons">
          <button type="button" data-editor-cancel>Cancel</button>
          <button type="submit" value="save" class="primary">Save</button>
        </div>
      </div>
    </form>
  `;
  document.body.append(dialog);

  const textarea = dialog.querySelector('textarea');
  const editorTitle = dialog.querySelector('#annotation-editor-title');
  const editorMeta = dialog.querySelector('.annotation-editor-meta');
  dialog.querySelector('[data-editor-cancel]').onclick = () => dialog.close('cancel');
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (textarea.value.trim()) dialog.close('save');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dialog.close('cancel');
    }
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close('cancel');
  });

  function openEditor({ title = 'Add annotation', label = 'Annotation note', meta = '', initial = '', returnFocus } = {}) {
    const previousFocus = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : viewport);
    editorTitle.textContent = title;
    editorMeta.textContent = meta;
    editorMeta.hidden = !meta;
    textarea.setAttribute('aria-label', label);
    textarea.value = initial;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    onChromeChange?.();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const saved = dialog.returnValue === 'save' ? textarea.value : null;
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        else viewport.focus({ preventScroll: true });
        onChromeChange?.();
        resolve(saved);
      }, { once: true });
    });
  }

  function rememberKnownParts(state) {
    for (const asset of state.manifestAssets) {
      if (asset.parts) knownParts.set(asset.path, asset.parts);
    }
    if (!state.loading && state.scope === 'all') {
      const present = new Set(state.manifestAssets.map(a => a.path));
      for (const key of knownParts.keys()) if (!present.has(key)) knownParts.delete(key);
    }
  }

  function resolveRow(row, state = getState()) {
    const sourceAsset = state.manifestAssets.find(a => a.path === row.source);
    const parts = sourceAsset?.parts ?? knownParts.get(row.source);
    if (!parts) {
      const stale = !state.loading && state.scope === 'all';
      return { row, stale, fx: row.x, fy: row.y, element: null };
    }
    const part = parts.find(p => p.name === row.frame);
    if (!part) return { row, stale: true, fx: row.x, fy: row.y, element: null };
    if (!row.element) return { row, stale: false, fx: row.x, fy: row.y, element: null };
    const found = (part.elements ?? []).find(e => e.id === row.element.id);
    if (!found) return { row, stale: true, fx: row.x, fy: row.y, element: null };
    const fx = part.width > 0 ? clamp01((found.x + row.element.x * found.width) / part.width) : row.x;
    const fy = part.height > 0 ? clamp01((found.y + row.element.y * found.height) / part.height) : row.y;
    return { row, stale: false, fx, fy, element: found };
  }

  async function refresh() {
    const response = await dataFetch('api/annotations');
    if (!response.ok) throw Error('Cannot load annotations.');
    rows = await response.json();
    rowsVersion++;
    signature = '';
    panelSignature = '';
    renderedSceneKey = '';
    render();
  }

  async function mutate(action, payload) {
    const response = await dataFetch('api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action }),
    });
    if (!response.ok) throw Error((await response.json()).error ?? 'Cannot save annotation.');
    const result = await response.json();
    await refresh();
    return result;
  }

  function cancelMove() {
    if (!movingId) return false;
    movingId = null;
    viewport.classList.remove('annotating');
    signature = '';
    renderedSceneKey = '';
    render();
    return true;
  }

  function startMove(row) {
    movingId = row.id;
    highlightedId = row.id;
    viewport.classList.add('annotating');
    signature = '';
    renderedSceneKey = '';
    render();
  }

  async function annotateAt({ source, frame, fx, fy, element = null, returnFocus } = {}) {
    cancelMove();
    const state = getState();
    const sourcePath = toProjectSource(state.sourcePrefix, source);
    const meta = element
      ? `${sourcePath} · ${frame} · ${element.owner?.export ? `${element.owner.export} (${element.id})` : element.id}`
      : `${sourcePath} · ${frame}`;
    try {
      const note = await openEditor({ title: element ? 'Annotate element' : 'Annotate frame', label: 'Annotation note', meta, returnFocus });
      if (note?.trim()) {
        const created = await mutate('create', { source, frame, x: clamp01(fx), y: clamp01(fy), element, note: note.trim() });
        highlightedId = created.id;
        signature = '';
        panelSignature = '';
        renderedSceneKey = '';
        render();
      }
    } catch (e) {
      fail(e);
    }
  }

  async function editNote(row, returnFocus) {
    const state = getState();
    const meta = `#${row.number} · ${toProjectSource(state.sourcePrefix, row.source)} · ${row.frame}`;
    try {
      const note = await openEditor({ title: `Edit annotation #${row.number}`, label: 'Annotation note', meta, initial: row.note, returnFocus });
      if (note?.trim() && note.trim() !== row.note) {
        await mutate('update', { id: row.id, note: note.trim() });
      }
    } catch (e) {
      fail(e);
    }
  }

  async function replyToNote(row, returnFocus) {
    const state = getState();
    const meta = `#${row.number} · ${toProjectSource(state.sourcePrefix, row.source)} · ${row.frame}`;
    try {
      const message = await openEditor({ title: `Reply to annotation #${row.number}`, label: 'Reply message', meta, initial: '', returnFocus });
      if (message?.trim()) {
        await mutate('reply', { id: row.id, message: message.trim(), author: 'user' });
      }
    } catch (e) {
      fail(e);
    }
  }

  function copyNotesPrompt(targetRows) {
    const state = getState();
    if (!targetRows.length) return;
    const notes = targetRows.map(r => resolveRow(r, state));
    const text = formatAgentPrompt({ projectRoot: state.projectRoot, sourcePrefix: state.sourcePrefix, notes });
    copyText(text);
  }

  function copyOpenForFrame(source, frame) {
    const openRows = rows.filter(r => r.source === source && r.frame === frame && r.status === 'open').sort((a, b) => a.number - b.number);
    copyNotesPrompt(openRows);
  }

  function openRowsForPanel(state = getState()) {
    return rows
      .filter(r => r.status === 'open' && (scopeFilter !== 'frame' || (state.selectedFrame && r.source === state.selectedFrame.source && r.frame === state.selectedFrame.frame)))
      .sort((a, b) => a.number - b.number);
  }

  function noteMenuItems(row) {
    const items = [
      { label: 'Edit', action: () => editNote(row) },
      { label: 'Reply', action: () => replyToNote(row) },
    ];
    if (row.status === 'open' || row.status === 'addressed') {
      items.push({ label: 'Resolve', action: () => mutate('resolve', { id: row.id }).catch(fail) });
    }
    if (row.status === 'addressed' || row.status === 'resolved') {
      items.push({ label: 'Reopen', action: () => mutate('reopen', { id: row.id }).catch(fail) });
    }
    items.push(
      { label: 'Move', disabled: row.status === 'resolved', action: () => startMove(row) },
      { label: 'Copy as agent prompt', action: () => copyNotesPrompt([row]) },
      { separator: true },
      { label: 'Delete', action: () => mutate('delete', { id: row.id }).catch(fail) },
    );
    return items;
  }

  function openNoteMenu(row, { x, y, returnFocus } = {}) {
    highlightedId = row.id;
    selectNoteTarget?.(row, resolveRow(row));
    render();
    contextMenu.open(noteMenuItems(row), { x, y, returnFocus });
  }

  toggleButton.onclick = () => {
    panelOpen = !panelOpen;
    onChromeChange?.();
    render();
  };

  panel.querySelector('#copy-open-annotations').onclick = () => copyNotesPrompt(openRowsForPanel());
  for (const btn of panel.querySelectorAll('[data-filter-status]')) {
    btn.onclick = () => {
      statusFilter = btn.dataset.filterStatus;
      panelSignature = '';
      renderPanel(getState());
    };
  }
  for (const btn of panel.querySelectorAll('[data-filter-scope]')) {
    btn.onclick = () => {
      scopeFilter = btn.dataset.filterScope;
      panelSignature = '';
      renderPanel(getState());
    };
  }

  function renderPanel(state) {
    const canShow = state.opened && panelOpen;
    if (panel.hidden !== !canShow) panel.hidden = !canShow;
    toggleButton.disabled = !state.opened;
    toggleButton.setAttribute('aria-expanded', String(canShow));
    if (!canShow) return;

    const resolvedAll = rows.map(r => resolveRow(r, state));
    const pKey = JSON.stringify([
      rowsVersion,
      statusFilter,
      scopeFilter,
      highlightedId,
      state.selectedFrame?.source ?? null,
      state.selectedFrame?.frame ?? null,
      resolvedAll.map(x => [x.row.id, x.row.updatedAt, x.row.status, x.stale]),
    ]);
    if (pKey === panelSignature) return;
    panelSignature = pKey;

    for (const btn of panel.querySelectorAll('[data-filter-status]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filterStatus === statusFilter));
    }
    for (const btn of panel.querySelectorAll('[data-filter-scope]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filterScope === scopeFilter));
    }

    const openInScope = openRowsForPanel(state);
    const copyBtn = panel.querySelector('#copy-open-annotations');
    copyBtn.disabled = !openInScope.length;

    const scoped = scopeFilter === 'frame'
      ? (state.selectedFrame ? resolvedAll.filter(x => x.row.source === state.selectedFrame.source && x.row.frame === state.selectedFrame.frame) : [])
      : resolvedAll;
    const filtered = (statusFilter === 'all' ? scoped : scoped.filter(x => x.row.status === statusFilter))
      .sort((a, b) => a.row.number - b.row.number);

    panel.querySelector('#annotations-count').textContent = String(filtered.length);
    const list = panel.querySelector('.annotation-list');
    const focusedId = list.contains(document.activeElement) ? document.activeElement.closest('[data-annotation-id]')?.dataset.annotationId : null;

    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'annotation-empty';
      empty.textContent = scopeFilter === 'frame' && !state.selectedFrame
        ? 'Select a frame to filter annotations.'
        : 'No matching annotations.';
      list.replaceChildren(empty);
      return;
    }

    list.replaceChildren(...filtered.map(entry => {
      const { row: r, stale } = entry;
      const wrapper = document.createElement('div');
      wrapper.className = 'annotation-row-item';
      wrapper.setAttribute('role', 'listitem');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'annotation-row';
      btn.dataset.annotationId = r.id;
      btn.dataset.status = r.status;
      btn.dataset.stale = String(stale);
      btn.dataset.highlighted = String(highlightedId === r.id);

      const meta = document.createElement('span');
      meta.className = 'annotation-row-meta';
      const num = document.createElement('span');
      num.className = 'annotation-number';
      num.textContent = `#${r.number}`;
      const statusBadge = document.createElement('span');
      statusBadge.className = 'annotation-badge';
      statusBadge.dataset.status = r.status;
      statusBadge.textContent = r.status;
      meta.append(num, statusBadge);
      if (stale) {
        const staleBadge = document.createElement('span');
        staleBadge.className = 'annotation-badge';
        staleBadge.dataset.stale = 'true';
        staleBadge.textContent = 'stale';
        meta.append(staleBadge);
      }
      const frameSpan = document.createElement('span');
      frameSpan.className = 'annotation-row-frame';
      frameSpan.textContent = r.frame;
      frameSpan.title = `${r.source} · ${r.frame}`;
      const replySpan = document.createElement('span');
      replySpan.className = 'annotation-row-replies';
      replySpan.textContent = `${r.replies.length} ${r.replies.length === 1 ? 'reply' : 'replies'}`;
      meta.append(frameSpan, replySpan);

      const excerpt = document.createElement('span');
      excerpt.className = 'annotation-row-excerpt';
      excerpt.textContent = r.note;

      btn.append(meta, excerpt);
      btn.onclick = () => {
        highlightedId = r.id;
        navigateToNote?.(r, entry);
        signature = '';
        panelSignature = '';
        renderedSceneKey = '';
        render();
      };
      btn.oncontextmenu = event => {
        event.preventDefault();
        event.stopPropagation();
        openNoteMenu(r, { x: event.clientX, y: event.clientY, returnFocus: btn });
      };
      wrapper.append(btn);

      if (r.status === 'resolved') {
        const reopen = document.createElement('button');
        reopen.type = 'button';
        reopen.className = 'annotation-row-action';
        reopen.textContent = 'Reopen';
        reopen.setAttribute('aria-label', `Reopen annotation ${r.number}`);
        reopen.onclick = () => mutate('reopen', { id: r.id }).catch(fail);
        wrapper.append(reopen);
      }
      return wrapper;
    }));

    if (focusedId) {
      list.querySelector(`.annotation-row[data-annotation-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    }
  }

  function render() {
    const state = getState();
    rememberKnownParts(state);
    renderPanel(state);

    if (!state.opened) {
      if (layer.childElementCount) layer.replaceChildren();
      layer.style.transform = '';
      signature = 'closed';
      renderedSceneKey = '';
      return;
    }

    const activeRows = rows.filter(r => r.status !== 'resolved');
    const sceneKey = `${rowsVersion}|${state.revision ?? 0}|${state.scope}|${state.view.scale}|${movingId ?? ''}|${highlightedId ?? ''}|${state.visibleFrames.map(f => `${f.source}#${f.frame}@${f.world.x},${f.world.y},${f.world.width},${f.world.height}`).join(';')}`;

    if (state.moving && renderedView && renderedSceneKey === sceneKey) {
      layer.style.transform = `translate(${state.view.x - renderedView.x}px, ${state.view.y - renderedView.y}px)`;
      return;
    }

    const fullKey = `${sceneKey}|${state.view.x},${state.view.y}`;
    if (fullKey === signature) return;
    signature = fullKey;
    renderedSceneKey = sceneKey;
    renderedView = { ...state.view };
    layer.style.transform = '';
    layer.replaceChildren();

    if (!activeRows.length || !state.visibleFrames.length) return;

    if (state.view.scale < READABLE_ANNOTATION_SCALE) {
      for (const vf of state.visibleFrames) {
        const frameNotes = activeRows.filter(r => r.source === vf.source && r.frame === vf.frame);
        if (!frameNotes.length) continue;
        const resolvedList = frameNotes.map(r => resolveRow(r, state));
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'annotation-frame-badge';
        badge.dataset.source = vf.source;
        badge.dataset.frame = vf.frame;
        badge.dataset.status = frameNotes.some(r => r.status === 'open') ? 'open' : 'addressed';
        badge.dataset.stale = String(resolvedList.some(x => x.stale));
        badge.textContent = String(frameNotes.length);
        badge.setAttribute('aria-label', `${frameNotes.length} ${frameNotes.length === 1 ? 'annotation' : 'annotations'} on ${vf.frame}`);
        Object.assign(badge.style, { left: `${vf.box.x + vf.box.width - 2}px`, top: `${vf.box.y + 2}px` });
        badge.onclick = event => {
          event.stopPropagation();
          inspectFrame?.(vf.asset, vf.part, READABLE_ANNOTATION_SCALE);
        };
        layer.append(badge);
      }
      return;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    layer.append(svg);

    for (const vf of state.visibleFrames) {
      const frameNotes = activeRows
        .filter(r => r.source === vf.source && r.frame === vf.frame)
        .map(r => resolveRow(r, state))
        .sort((a, b) => a.fy - b.fy || a.fx - b.fx || a.row.number - b.row.number);
      if (!frameNotes.length) continue;

      const b = vf.box;
      let bottom = b.y;
      for (const entry of frameNotes) {
        const { row: r, stale, fx, fy } = entry;
        const x = b.x + fx * b.width;
        const y = b.y + fy * b.height;
        const cy = Math.max(y - 14, bottom);
        const cardGap = 114 + Math.min(r.replies.length, 3) * 38;
        bottom = cy + cardGap;

        const line = document.createElementNS(svg.namespaceURI, 'polyline');
        line.setAttribute('points', `${x},${y} ${b.x + b.width + 12},${y} ${b.x + b.width + 26},${cy + 16}`);
        line.dataset.state = r.status;
        line.dataset.stale = String(stale);
        svg.append(line);

        const point = document.createElement('button');
        point.type = 'button';
        point.className = 'annotation-point';
        point.dataset.annotationId = r.id;
        point.dataset.state = r.status;
        point.dataset.stale = String(stale);
        point.dataset.highlighted = String(highlightedId === r.id);
        point.textContent = String(r.number);
        point.setAttribute('aria-label', `Edit annotation ${r.number}`);
        Object.assign(point.style, { left: `${x}px`, top: `${y}px` });
        point.onclick = () => {
          highlightedId = r.id;
          selectNoteTarget?.(r, entry);
          editNote(r, point);
        };
        point.oncontextmenu = event => {
          event.preventDefault();
          event.stopPropagation();
          openNoteMenu(r, { x: event.clientX, y: event.clientY, returnFocus: point });
        };
        layer.append(point);

        const card = document.createElement('article');
        card.className = 'annotation-card';
        card.dataset.annotationId = r.id;
        card.dataset.state = r.status;
        card.dataset.stale = String(stale);
        card.dataset.highlighted = String(highlightedId === r.id);
        Object.assign(card.style, { left: `${b.x + b.width + 26}px`, top: `${cy}px` });
        card.oncontextmenu = event => {
          event.preventDefault();
          event.stopPropagation();
          openNoteMenu(r, { x: event.clientX, y: event.clientY, returnFocus: card.querySelector('.annotation-note') ?? point });
        };

        const header = document.createElement('div');
        header.className = 'annotation-card-header';
        const num = document.createElement('span');
        num.className = 'annotation-number';
        num.textContent = `#${r.number}`;
        const badge = document.createElement('span');
        badge.className = 'annotation-badge';
        badge.dataset.status = r.status;
        badge.textContent = r.status;
        header.append(num, badge);
        if (stale) {
          const staleBadge = document.createElement('span');
          staleBadge.className = 'annotation-badge';
          staleBadge.dataset.stale = 'true';
          staleBadge.textContent = 'stale';
          header.append(staleBadge);
        }
        if (r.element?.owner?.export) {
          const ownerSpan = document.createElement('span');
          ownerSpan.className = 'annotation-owner';
          ownerSpan.textContent = r.element.owner.export;
          ownerSpan.title = r.element.id;
          header.append(ownerSpan);
        }
        card.append(header);

        const noteBtn = document.createElement('button');
        noteBtn.type = 'button';
        noteBtn.className = 'annotation-note';
        noteBtn.textContent = r.note;
        noteBtn.onclick = () => {
          highlightedId = r.id;
          selectNoteTarget?.(r, entry);
          editNote(r, noteBtn);
        };
        card.append(noteBtn);

        if (r.replies.length) {
          const thread = document.createElement('div');
          thread.className = 'annotation-thread';
          for (const reply of r.replies) {
            const item = document.createElement('div');
            item.className = 'annotation-reply';
            item.dataset.author = reply.author;
            const author = document.createElement('span');
            author.className = 'annotation-reply-author';
            author.textContent = reply.author === 'agent' ? 'Agent' : 'You';
            const body = document.createElement('p');
            body.className = 'annotation-reply-body';
            body.textContent = reply.message;
            item.append(author, body);
            thread.append(item);
          }
          card.append(thread);
        }

        const actions = document.createElement('div');
        actions.className = 'annotation-actions';
        const actionDefs = [
          ['Reply', () => replyToNote(r, noteBtn)],
          ...(r.status === 'open' || r.status === 'addressed' ? [['Resolve', () => mutate('resolve', { id: r.id })]] : []),
          ...(r.status === 'addressed' ? [['Reopen', () => mutate('reopen', { id: r.id })]] : []),
          ['Move', () => startMove(r)],
          ['Delete', () => mutate('delete', { id: r.id })],
        ];
        for (const [label, handler] of actionDefs) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = label;
          btn.onclick = () => Promise.resolve(handler()).catch(fail);
          actions.append(btn);
        }
        card.append(actions);
        layer.append(card);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getState().opened) refresh().catch(fail);
  });

  refresh().catch(fail);

  return {
    render,
    refresh,
    annotateAt,
    openNoteMenu,
    copyOpenForFrame,
    countOpenForFrame: (source, frame) => rows.filter(r => r.source === source && r.frame === frame && r.status === 'open').length,
    getRow: id => rows.find(r => r.id === id) ?? null,
    active: () => Boolean(movingId),
    cancelMove,
    async click(worldX, worldY) {
      if (!movingId) return false;
      const targetRow = rows.find(r => r.id === movingId);
      if (!targetRow) { cancelMove(); return false; }
      const hit = hitFrameAt(worldX, worldY);
      if (!hit?.part) { cancelMove(); return true; }
      const fb = hit.frameBox;
      const fx = clamp01((worldX - fb.x) / fb.width);
      const fy = clamp01((worldY - fb.y) / fb.height);
      const el = hit.element;
      const element = el ? {
        id: el.id,
        owner: el.owner ?? el.owners?.at(-1) ?? { source: hit.asset.path, export: null },
        x: el.width > 0 ? clamp01((worldX - (fb.x + el.x)) / el.width) : 0.5,
        y: el.height > 0 ? clamp01((worldY - (fb.y + el.y)) / el.height) : 0.5,
      } : null;
      const id = movingId;
      cancelMove();
      try {
        await mutate('update', { id, source: hit.asset.path, frame: hit.part.name, x: fx, y: fy, element });
      } catch (e) {
        fail(e);
      }
      return true;
    },
  };
}
