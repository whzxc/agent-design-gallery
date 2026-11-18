import { viewerBase } from './view-route.js';

const endpoint = 'api/comments';
const dragThreshold = 5;
const pinHeight = 26;
const gutter = 8;
const noticeTimeoutMs = 4000;
const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, className, action) {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function closeButton(label, action) {
  const node = button('×', 'adg-comment-close', action);
  node.setAttribute('aria-label', label);
  return node;
}

function authorName(author) {
  return author?.kind === 'user' ? 'You' : author?.name ?? author ?? 'Unknown';
}

function timeLabel(value) {
  const node = element('time', 'adg-comment-meta');
  const date = new Date(value);
  if (!value || !Number.isFinite(+date)) return node;
  node.dateTime = date.toISOString();
  node.title = date.toLocaleString();
  const seconds = (+date - Date.now()) / 1000;
  const [unit, duration] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]
    .find(([, duration]) => Math.abs(seconds) >= duration) ?? ['second', 1];
  node.textContent = relativeTime.format(Math.trunc(seconds / duration), unit);
  return node;
}

function messageMeta(message) {
  const node = element('div', 'adg-comment-message-meta');
  node.append(element('strong', null, authorName(message.author)), timeLabel(message.at));
  if (message.editedAt) node.append(element('span', 'adg-comment-meta', 'Edited'));
  return node;
}

function label(thread) {
  return thread.target?.label || thread.anchor?.frame || thread.anchor?.source || thread.anchor?.chapter || 'Board';
}

function secondaryTarget(thread) {
  const primary = label(thread);
  const detail = thread.target?.displayName;
  return detail && detail !== primary ? detail : '';
}

function replyCount(thread) {
  const count = Math.max(0, thread.messages.length - 1);
  return `${count} ${count === 1 ? 'reply' : 'replies'}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function position(node, x, y) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function placeCard(node, anchor, width, height, panelBox) {
  const cardWidth = node.offsetWidth;
  const cardHeight = node.offsetHeight;
  const right = panelBox && anchor.x < panelBox.left ? panelBox.left : width;
  let x = anchor.x + 12;
  if (x + cardWidth + gutter > right) x = anchor.x - cardWidth - 12;
  x = clamp(x, gutter, Math.max(gutter, right - cardWidth - gutter));
  if (panelBox && anchor.x >= panelBox.left) x = clamp(panelBox.left - cardWidth - gutter, gutter, width - cardWidth - gutter);
  position(node, x, clamp(anchor.y - pinHeight, gutter, height - cardHeight - gutter));
}

function fanOut(point, width, occupied, viewportWidth, viewportHeight) {
  const origin = {
    x: clamp(point.x, 1, viewportWidth - width - 1),
    y: clamp(point.y, pinHeight + 1, viewportHeight - 1),
  };
  const available = (x, y) => x >= 1 && x + width < viewportWidth && y > pinHeight && y < viewportHeight &&
    !occupied.some(pin => Math.abs(pin.y - y) < pinHeight + 3 && pin.x < x + width + 3 && pin.x + pin.width + 3 > x);
  if (available(origin.x, origin.y)) return origin;
  const dx = width + 5;
  const dy = pinHeight + 5;
  const rings = Math.ceil(Math.max(viewportWidth / dx, viewportHeight / dy));
  for (let ring = 1; ring <= rings; ring++) {
    for (let row = -ring; row <= ring; row++) {
      const step = Math.abs(row) === ring ? 1 : 2 * ring;
      for (let column = -ring; column <= ring; column += step) {
        const x = origin.x + column * dx;
        const y = origin.y + row * dy;
        if (available(x, y)) return { x, y };
      }
    }
  }
  return origin;
}

function setStatus(node, text = '') {
  node.textContent = text;
  node.hidden = !text;
}

function makeStateBadge(state = 'changed') {
  const node = element('span', 'adg-comment-changed', state === 'missing' ? 'Missing' : 'Changed');
  node.dataset.state = state;
  return node;
}

function makeConfirmBar(promptText, onConfirm, onCancel) {
  const bar = element('div', 'adg-comment-confirm');
  const text = element('span', 'adg-comment-confirm-label', promptText);
  const actions = element('div', 'adg-comment-confirm-actions');
  const cancel = button('Cancel', 'adg-comment-action', onCancel);
  const confirm = button('Delete', 'adg-comment-action adg-comment-danger-button', async () => {
    confirm.disabled = true;
    cancel.disabled = true;
    try {
      await onConfirm();
    } finally {
      if (bar.isConnected) {
        confirm.disabled = false;
        cancel.disabled = false;
      }
    }
  });
  actions.append(cancel, confirm);
  bar.append(text, actions);
  return { bar, cancel, confirm };
}

function editor(placeholder, action, onSubmit) {
  const form = element('form', 'adg-comment-editor');
  const field = element('textarea');
  field.placeholder = placeholder;
  field.setAttribute('aria-label', placeholder);
  field.maxLength = 10000;
  field.rows = 3;
  const status = element('p', 'adg-comment-error');
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const submit = element('button', 'adg-comment-action adg-comment-primary', action);
  submit.type = 'submit';
  submit.disabled = true;
  submit.title = '⌘↩';
  submit.setAttribute('aria-keyshortcuts', 'Meta+Enter Control+Enter');
  const actions = element('div', 'adg-comment-editor-actions');
  actions.append(submit);
  form.append(field, status, actions);
  let pending = false;
  function update() { submit.disabled = pending || !field.value.trim(); }
  field.addEventListener('input', update);
  field.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    form.requestSubmit();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    pending = true;
    field.readOnly = true;
    setStatus(status);
    update();
    try {
      await onSubmit(field.value);
    } catch (error) {
      setStatus(status, error.message || 'Could not save the comment.');
    } finally {
      pending = false;
      field.readOnly = false;
      update();
    }
  });
  return { form, field, actions, update, pending: () => pending };
}

export function createComments({
  toolButton, panelButton, panel, layer, hitTest, locate, navigate, boardPlace,
  boardOrder = () => 0, request, onPanelToggle,
  initialThreads = [], initialComment, storageKey = `adg-comments-visible:${viewerBase(location.pathname)}`,
}) {
  panel.classList.add('adg-comments-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Comments');
  if (panel.id) panelButton.setAttribute('aria-controls', panel.id);
  panelButton.setAttribute('aria-expanded', 'false');
  toolButton.setAttribute('aria-keyshortcuts', 'C');
  layer.classList.add('adg-comments-layer');

  const header = element('header', 'adg-comment-panel-header');
  const list = element('div', 'adg-comment-list');
  const filterBar = element('div', 'adg-comment-filters');
  filterBar.setAttribute('role', 'group');
  filterBar.setAttribute('aria-label', 'Comment status');
  const openFilter = button('Open', null, () => setFilter('open'));
  const resolvedFilter = button('Resolved', null, () => setFilter('resolved'));
  filterBar.append(openFilter, resolvedFilter);

  const hiddenBanner = element('div', 'adg-comment-pins-banner');
  hiddenBanner.append(
    element('span', null, 'Pins hidden'),
    button('Show (⇧C)', 'adg-comment-action', () => setVisible(true)),
  );

  header.append(element('h2', null, 'Comments'), closeButton('Close comments', () => setPanel(false, true)));
  panel.replaceChildren(header, filterBar, hiddenBanner, list);
  const count = element('span', 'adg-comment-count');
  count.setAttribute('aria-hidden', 'true');
  count.hidden = true;
  panelButton.append(count);

  const outline = element('div', 'adg-comment-outline');
  const highlightLabel = element('div', 'adg-comment-highlight-label');
  outline.setAttribute('aria-hidden', 'true');
  highlightLabel.setAttribute('aria-hidden', 'true');
  const pins = element('div', 'adg-comment-pins');
  const preview = element('div', 'adg-comment-card adg-comment-preview');
  preview.setAttribute('role', 'tooltip');
  const notice = element('p', 'adg-comment-notice');
  notice.setAttribute('role', 'alert');
  notice.hidden = true;
  layer.replaceChildren(outline, highlightLabel, pins, preview, notice);

  let tool = false;
  let available = !toolButton.disabled;
  let unavailableReason = '';
  let visible = true;
  try { visible = localStorage.getItem(storageKey) !== 'false'; } catch {}
  let threads = new Map(initialThreads.map(thread => [thread.id, thread]));
  let filter = 'open';
  let highlightPoint = null;
  let previewId = null;
  let draft = null;
  let card = null;
  let menu = null;
  let drag = null;
  let navigation = 0;
  let version = 0;
  let noticeTimer = 0;
  let writeQueue = Promise.resolve();
  let refreshing = null;
  let refreshAgain = false;
  let listSignature = '';
  let previewSignature = '';
  const pinNodes = new Map();
  const rowNodes = new Map();
  const replyDrafts = new Map();
  const pendingMoves = new Map();
  const unlocated = new Set();

  function canUseTool() { return available && !toolButton.disabled; }
  function active() { return tool && canUseTool(); }

  function showNotice(text = '') {
    clearTimeout(noticeTimer);
    setStatus(notice, text);
    if (text) noticeTimer = setTimeout(() => setStatus(notice), noticeTimeoutMs);
  }

  function updateTool() {
    const isActive = active();
    toolButton.setAttribute('aria-pressed', String(isActive));
    toolButton.dataset.tooltip = isActive
      ? 'Exit comment mode (C)'
      : (canUseTool() ? 'Comment (C)' : (unavailableReason || 'Comments unavailable in this view.'));
    document.body.classList.toggle('adg-comment-tool-active', isActive);
    if (!isActive) delete document.body.dataset.commentTarget;
    hiddenBanner.hidden = visible;
    panelButton.dataset.pinsHidden = String(!visible);
  }

  function setAvailable(nextAvailable, reason = '') {
    const next = Boolean(nextAvailable);
    const nextReason = next ? '' : String(reason || '');
    const changedAvailability = available !== next || unavailableReason !== nextReason || toolButton.disabled !== !next;
    available = next;
    unavailableReason = nextReason;
    toolButton.disabled = !available;
    toolButton.toggleAttribute('aria-disabled', !available);
    if (!available) {
      tool = false;
      highlightPoint = null;
    }
    updateTool();
    if (changedAvailability) render();
  }

  function toggle(force = !active()) {
    tool = Boolean(force) && canUseTool();
    if (tool && !visible) setVisible(true);
    if (!tool) highlightPoint = null;
    updateTool();
    render();
    return active();
  }

  function setVisible(next = !visible) {
    visible = Boolean(next);
    try { localStorage.setItem(storageKey, String(visible)); } catch {}
    if (!visible) {
      cancelDrag();
      previewId = null;
      closeThread(true);
    }
    render();
    return visible;
  }

  function setPanel(open, focus = false) {
    open = Boolean(open);
    panel.hidden = !open;
    panelButton.setAttribute('aria-expanded', String(open));
    onPanelToggle?.(open);
    render();
    if (focus) (open ? (filter === 'open' ? openFilter : resolvedFilter) : panelButton).focus({ preventScroll: true });
  }

  function closePanel() {
    if (panel.hidden) return false;
    setPanel(false, false);
    return true;
  }

  function setFilter(next) {
    filter = next;
    previewId = null;
    if (card && threads.get(card.id)?.status !== filter) closeThread(false);
    render();
  }

  function report(error) { showNotice(error?.message || 'Could not update comments.'); }

  function currentLocation(thread) {
    const point = locate(thread);
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  }

  function threadState(thread, point, boardChanged = false) {
    if (thread.state === 'gone' || (!point && unlocated.has(thread.id))) return 'missing';
    if (point?.changed || thread.state === 'changed' || boardChanged) return 'changed';
    return '';
  }

  function renderPanel(locations) {
    const countOpen = [...threads.values()].filter(thread => thread.status === 'open').length;
    count.hidden = countOpen === 0;
    if (count.textContent !== String(countOpen)) count.textContent = String(countOpen);
    const nextAriaLabel = countOpen ? `Comments, ${countOpen} open` : 'Comments';
    if (panelButton.getAttribute('aria-label') !== nextAriaLabel) panelButton.setAttribute('aria-label', nextAriaLabel);
    hiddenBanner.hidden = visible;
    panelButton.dataset.pinsHidden = String(!visible);
    if (panel.hidden) return;
    openFilter.setAttribute('aria-pressed', String(filter === 'open'));
    resolvedFilter.setAttribute('aria-pressed', String(filter === 'resolved'));
    const items = [...threads.values()].filter(thread => thread.status === filter).map(thread => {
      const point = locations.get(thread.id);
      const board = !point?.layer || !point?.chapter ? boardPlace?.(thread) : null;
      const group = [point?.layer ?? board?.layer ?? thread.anchor?.layer, point?.chapter ?? board?.chapter ?? thread.anchor?.chapter]
        .filter(Boolean).join(' / ');
      const state = threadState(thread, point, !!board?.changed);
      return { thread, group, state, detail: secondaryTarget(thread), order: filter === 'open' ? boardOrder(thread) : 0 };
    });
    items.sort((a, b) => filter === 'open'
      ? (a.order ?? Infinity) - (b.order ?? Infinity) || a.thread.number - b.thread.number
      : (Date.parse(b.thread.resolvedAt) - Date.parse(a.thread.resolvedAt)) || b.thread.number - a.thread.number);
    const emptyCopy = filter === 'open'
      ? (canUseTool() ? 'Press C and click a frame to start a comment.' : (unavailableReason || 'Comments unavailable in this view.'))
      : 'No resolved comments.';
    const signature = JSON.stringify([filter, card?.id, emptyCopy, items.map(({ thread, group, state, detail }) =>
      [thread.id, thread.updatedAt, thread.messages.length, group, state, detail])]);
    if (listSignature === signature) return;
    listSignature = signature;
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.commentId : null;
    list.replaceChildren();
    rowNodes.clear();
    if (!items.length) {
      list.append(element('p', 'adg-comment-empty', emptyCopy));
      return;
    }
    let group;
    for (const item of items) {
      const { thread } = item;
      if (filter === 'open' && group !== item.group) {
        group = item.group;
        if (group) list.append(element('h3', 'adg-comment-group', group));
      }
      const row = button('', 'adg-comment-row', () => { void openThread(thread.id, { go: true, from: row }); });
      row.dataset.commentId = thread.id;
      if (card?.id === thread.id) row.setAttribute('aria-current', 'true');
      const title = element('span', 'adg-comment-row-title');
      title.append(element('span', 'adg-comment-number', `#${thread.number}`), element('strong', null, label(thread)));
      if (item.state) title.append(makeStateBadge(item.state));
      const first = thread.messages[0];
      const last = thread.messages.at(-1);
      const meta = element('span', 'adg-comment-row-meta adg-comment-meta');
      if (last) meta.append(element('span', null, authorName(last.author)), timeLabel(last.at));
      meta.append(element('span', 'adg-comment-reply-count', replyCount(thread)));
      row.append(title);
      if (item.detail) row.append(element('span', 'adg-comment-target adg-comment-meta', item.detail));
      row.append(element('span', 'adg-comment-excerpt', first?.text), meta);
      rowNodes.set(thread.id, row);
      list.append(row);
    }
    rowNodes.get(focused)?.focus({ preventScroll: true });
  }

  function renderHighlight() {
    const point = drag?.moved && !drag.cancelled ? drag : active() ? highlightPoint : null;
    const target = point ? hitTest(point.x, point.y, point.deepest) : null;
    const box = target?.box;
    if (active()) document.body.dataset.commentTarget = String(!!box);
    else delete document.body.dataset.commentTarget;
    outline.hidden = !box;
    highlightLabel.hidden = !box;
    if (!box) return;
    const x = box.x ?? box.left;
    const y = box.y ?? box.top;
    position(outline, x, y);
    outline.style.width = `${box.width}px`;
    outline.style.height = `${box.height}px`;
    highlightLabel.textContent = target.hint || label(target);
    position(highlightLabel, clamp(x, gutter, window.innerWidth - highlightLabel.offsetWidth - gutter),
      clamp(y >= 28 ? y - 26 : y + box.height + 4, gutter, window.innerHeight - 28));
  }

  function hover(x, y, deepest) {
    highlightPoint = active() && Number.isFinite(x) && Number.isFinite(y) ? { x, y, deepest } : null;
    renderHighlight();
  }

  function renderPreview(positions, locations, width, height) {
    const thread = threads.get(previewId);
    const point = positions.get(previewId);
    preview.hidden = !thread || !point || !!card || !!draft || !!drag;
    if (preview.hidden) return;
    const state = threadState(thread, locations.get(previewId));
    const detail = secondaryTarget(thread);
    const nextSignature = JSON.stringify([thread.id, thread.updatedAt, thread.messages.length, state, detail]);
    if (previewSignature !== nextSignature) {
      previewSignature = nextSignature;
      const first = thread.messages[0];
      preview.replaceChildren();
      const head = element('div', 'adg-comment-row-title');
      head.append(element('span', 'adg-comment-number', `#${thread.number}`), element('strong', null, label(thread)));
      if (state) head.append(makeStateBadge(state));
      preview.append(head);
      if (detail) preview.append(element('p', 'adg-comment-target adg-comment-meta', detail));
      if (first) preview.append(messageMeta(first), element('p', 'adg-comment-excerpt', first.text));
      preview.append(element('p', 'adg-comment-meta', replyCount(thread)));
    }
    placeCard(preview, point, width, height, panel.hidden ? null : panel.getBoundingClientRect());
  }

  function cancelDrag() {
    if (!drag?.moved || drag.cancelled) return false;
    drag.cancelled = true;
    render();
    return true;
  }

  async function dropPin(id, x, y, deepest) {
    const move = { point: { x, y } };
    pendingMoves.set(id, move);
    render();
    try {
      if (pendingMoves.get(id) !== move || !threads.has(id)) return;
      const target = hitTest(x, y, deepest);
      if (!target) return;
      move.placement = { id, ...placement(target) };
      await mutate('move', move.placement);
    } catch (error) {
      report(error);
    } finally {
      if (pendingMoves.get(id) === move) pendingMoves.delete(id);
      render();
    }
  }

  function makePin(thread) {
    const id = thread.id;
    let suppressClick = false;
    const pin = button(`#${thread.number}`, 'adg-comment-pin', event => {
      if (suppressClick && event.detail) { suppressClick = false; return; }
      if (card?.id === id) closeThread(true);
      else void openThread(id, { from: pin });
      render();
    });
    const stem = element('div', 'adg-comment-stem');
    pin.dataset.commentId = id;
    pin.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      suppressClick = false;
      drag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
      pin.setPointerCapture(event.pointerId);
    });
    pin.addEventListener('pointermove', event => {
      if (drag?.pointerId !== event.pointerId || drag.cancelled) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.deepest = event.altKey;
      if (!drag.moved) drag.moved = Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= dragThreshold;
      if (!drag.moved) return;
      suppressClick = true;
      previewId = null;
      render();
    });
    pin.addEventListener('pointerup', event => {
      if (drag?.pointerId !== event.pointerId) return;
      const previous = drag;
      drag = null;
      if (previous.moved && !previous.cancelled) void dropPin(id, event.clientX, event.clientY, event.altKey);
      else render();
    });
    function stopPointer(event) {
      if (drag?.pointerId !== event.pointerId) return;
      drag = null;
      render();
    }
    pin.addEventListener('pointercancel', stopPointer);
    pin.addEventListener('lostpointercapture', stopPointer);
    function showPreview() {
      if (!drag) previewId = id;
      render();
    }
    function hidePreview() {
      if (previewId === id) previewId = null;
      render();
    }
    pin.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showPreview(); });
    pin.addEventListener('pointerleave', hidePreview);
    pin.addEventListener('focus', showPreview);
    pin.addEventListener('blur', hidePreview);
    pins.append(stem, pin);
    return { pin, stem };
  }

  function renderPins(locations, width, height) {
    const positions = new Map();
    const occupied = [];
    const ordered = [...threads.values()].sort((a, b) => a.number - b.number);
    for (const thread of ordered) {
      const selected = card?.id === thread.id;
      const dragged = drag?.id === thread.id && drag.moved && !drag.cancelled;
      const point = dragged ? drag : locations.get(thread.id);
      const pinWidth = Math.max(34, 15 + String(thread.number).length * 7);
      const onScreen = point && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
      const shown = visible && onScreen && (selected || thread.status !== 'resolved' || (!panel.hidden && filter === 'resolved'));
      let nodes = pinNodes.get(thread.id);
      if (!shown) {
        if (nodes) nodes.pin.hidden = nodes.stem.hidden = true;
        continue;
      }
      if (!nodes) {
        nodes = makePin(thread);
        pinNodes.set(thread.id, nodes);
      }
      const { pin, stem } = nodes;
      const slot = fanOut(point, pinWidth, occupied, width, height);
      const dx = slot.x - point.x;
      const dy = slot.y - point.y;
      occupied.push({ ...slot, width: pinWidth });
      positions.set(thread.id, slot);
      position(pin, slot.x, slot.y);
      pin.hidden = false;
      pin.style.width = `${pinWidth}px`;
      const state = threadState(thread, locations.get(thread.id));
      pin.toggleAttribute('data-changed', Boolean(state));
      pin.toggleAttribute('data-resolved', thread.status === 'resolved');
      pin.toggleAttribute('data-dragging', dragged);
      pin.setAttribute('aria-expanded', String(selected));
      pin.setAttribute('aria-label', `Comment #${thread.number}, ${label(thread)}${state ? `, ${state}` : ''}`);
      stem.hidden = !dx && !dy;
      if (!stem.hidden) {
        position(stem, point.x, point.y);
        stem.style.width = `${Math.hypot(dx, dy)}px`;
        stem.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
    return positions;
  }

  function render(geometryOnly = false) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const locations = new Map();
    for (const thread of threads.values()) {
      const move = pendingMoves.get(thread.id);
      const point = move?.placement ? currentLocation(move.placement) : currentLocation(thread);
      if (point) unlocated.delete(thread.id);
      locations.set(thread.id, move ? { ...point, ...move.point } : point);
    }
    const positions = renderPins(locations, width, height);
    renderHighlight();
    if (!geometryOnly) {
      updateTool();
      renderPanel(locations);
    }
    renderPreview(positions, locations, width, height);
    const panelBox = panel.hidden ? null : panel.getBoundingClientRect();
    if (card) {
      const thread = threads.get(card.id);
      const point = locations.get(card.id);
      if (thread) {
        if (!geometryOnly) updateCard(card, thread, threadState(thread, point));
        const fallback = (rowNodes.get(card.id) ?? panelButton).getBoundingClientRect();
        placeCard(card.node, positions.get(card.id) ?? point ?? { x: fallback.left, y: fallback.bottom }, width, height, panelBox);
      }
    }
    if (draft) {
      const point = currentLocation(draft.target) ?? draft.origin;
      draft.pin.hidden = !visible;
      position(draft.pin, point.x, point.y);
      placeCard(draft.node, point, width, height, panelBox);
    }
    renderMenu();
  }

  function placement(target) {
    const { anchor, target: snapshot, revision } = target;
    return revision === undefined ? { anchor, target: snapshot } : { anchor, target: snapshot, revision };
  }

  function place(target) {
    if (!target?.anchor) return false;
    const box = target.box;
    const origin = { x: target.x ?? box?.x ?? box?.left, y: target.y ?? box?.y ?? box?.top };
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
    if (draft?.editor.pending()) return true;
    const preservedText = draft?.editor.field.value.trim() ? draft.editor.field.value : '';
    const preservedFrom = draft?.from;
    if (!visible) setVisible(true);
    closeDraft(false);
    closeThread(false);
    navigation++;
    highlightPoint = null;
    previewId = null;
    const snapshot = placement(target);
    const from = preservedFrom ?? document.activeElement;
    const node = element('section', 'adg-comment-card adg-comment-composer');
    const title = element('h2', null, 'New comment');
    const heading = element('header', 'adg-comment-card-header');
    heading.append(title, closeButton('Discard draft', () => { closeDraft(true); render(); }));
    const input = editor(`Comment on ${target.hint || label(target)}…`, 'Post', async message => {
      const thread = await mutate('create', { ...snapshot, message });
      if (draft?.node !== node) return;
      closeDraft(false);
      if (visible && thread) await openThread(thread.id, { from });
      render();
    });
    if (preservedText) {
      input.field.value = preservedText;
      input.update();
    }
    node.setAttribute('aria-label', 'New comment');
    node.append(heading, input.form);
    const pin = element('span', 'adg-comment-pin adg-comment-draft-pin', '+');
    pin.setAttribute('aria-hidden', 'true');
    draft = { target: snapshot, origin, node, pin, editor: input, from };
    layer.append(pin, node);
    render();
    input.field.focus({ preventScroll: true });
    if (preservedText) input.field.setSelectionRange(preservedText.length, preservedText.length);
    return true;
  }

  function closeDraft(restore) {
    if (!draft) return false;
    const previous = draft;
    draft = null;
    previous.node.remove();
    previous.pin.remove();
    if (restore) previous.from?.focus?.({ preventScroll: true });
    return true;
  }

  function dismiss() {
    const closedMenu = closeMenu(false);
    const closedCard = closeThread(false);
    const closedDraft = draft && !draft.editor.pending() && !draft.editor.field.value.trim() ? closeDraft(false) : false;
    if (closedMenu || closedCard || closedDraft) {
      render();
      return true;
    }
    return false;
  }

  function click(x, y, deepest) {
    if (active()) {
      const target = hitTest(x, y, deepest);
      if (target) place({ ...target, x, y });
      else dismiss();
      return true;
    }
    dismiss();
    return false;
  }

  function closeMenu(restore = false) {
    if (!menu) return false;
    const previous = menu;
    menu = null;
    previous.list.remove();
    previous.button.setAttribute('aria-expanded', 'false');
    if (restore) previous.button.focus({ preventScroll: true });
    return true;
  }

  function renderMenu() {
    if (!menu) return;
    const anchor = menu.button.getBoundingClientRect();
    const bounds = menu.button.closest('.adg-comment-messages')?.getBoundingClientRect();
    if (bounds && (anchor.bottom <= bounds.top || anchor.top >= bounds.bottom)) { closeMenu(); return; }
    const { offsetWidth, offsetHeight } = menu.list;
    const y = anchor.bottom + offsetHeight + gutter <= window.innerHeight ? anchor.bottom : anchor.top - offsetHeight;
    position(menu.list, clamp(anchor.right - offsetWidth, gutter, window.innerWidth - offsetWidth - gutter),
      clamp(y, gutter, window.innerHeight - offsetHeight - gutter));
  }

  function makeMenu(name, actions) {
    const wrapper = element('div', 'adg-comment-menu-wrapper');
    const items = element('div', 'adg-comment-menu');
    const trigger = button('⋯', 'adg-comment-close', () => {
      if (menu?.button === trigger) { closeMenu(); return; }
      closeMenu();
      menu = { wrapper, list: items, button: trigger };
      trigger.setAttribute('aria-expanded', 'true');
      layer.append(items);
      renderMenu();
      items.firstElementChild?.focus({ preventScroll: true });
    });
    trigger.setAttribute('aria-label', name);
    trigger.setAttribute('aria-expanded', 'false');
    for (const [title, action, destructive] of actions) {
      items.append(button(title, destructive ? 'adg-comment-danger' : null, () => { closeMenu(true); action(trigger); }));
    }
    wrapper.append(trigger);
    return wrapper;
  }

  function closeThread(restore) {
    if (!card) return false;
    const previous = card;
    card = null;
    closeMenu();
    previous.node.remove();
    if (restore) {
      const pin = pinNodes.get(previous.id)?.pin;
      const row = panel.hidden ? null : rowNodes.get(previous.id);
      (previous.from?.isConnected && !previous.from.hidden ? previous.from : pin && !pin.hidden ? pin : row ?? panelButton)
        .focus({ preventScroll: true });
    }
    return true;
  }

  async function openThread(id, { go = false, from } = {}) {
    const thread = threads.get(id);
    if (!thread) return false;
    if (!visible) setVisible(true);
    const sequence = ++navigation;
    if (go && navigate) {
      try {
        const located = await navigate(thread);
        if (sequence === navigation && located === false && !currentLocation(thread)) unlocated.add(id);
      }
      catch (error) { if (sequence === navigation) report(error); }
    }
    if (sequence !== navigation || !threads.has(id)) return false;
    closeDraft(false);
    closeThread(false);
    if (threads.get(id).status === 'resolved') {
      filter = 'resolved';
      setPanel(true);
    }
    previewId = null;
    card = makeCard(id, from);
    layer.append(card.node);
    render();
    card.node.focus({ preventScroll: true });
    return true;
  }

  function commentURL(thread) {
    const current = new URL(window.location.href);
    const url = thread.link ? new URL(thread.link) : new URL(current.href);
    const reviewPage = document.querySelector('#review-page');
    const onReview = Boolean(reviewPage && !reviewPage.hidden);
    if (onReview && current.searchParams.has('base')) url.searchParams.set('base', current.searchParams.get('base'));
    else url.searchParams.delete('base');
    url.pathname = viewerBase(url.pathname);
    for (const parameter of ['scope', 'group', 'asset', 'frame', 'element']) url.searchParams.delete(parameter);
    url.searchParams.set('comment', thread.number);
    url.hash = '';
    return url.href;
  }

  function cancelConfirm(view, restore = false) {
    if (!view?.confirm) return false;
    const previous = view.confirm;
    view.confirm = null;
    if (previous.row) {
      delete previous.row.dataset.content;
      view.threadMessages = null;
    } else {
      previous.bar.remove();
    }
    if (restore && previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
    return true;
  }

  function confirmDeleteThread(view, trigger) {
    stopEditing(view);
    cancelConfirm(view, false);
    const { bar, confirm } = makeConfirmBar(
      'Delete thread?',
      () => view.safely(() => mutate('delete-thread', { id: view.id })),
      () => { cancelConfirm(view, true); render(); },
    );
    view.confirm = { kind: 'thread', bar, trigger };
    view.messages.before(bar);
    render();
    confirm.focus({ preventScroll: true });
  }

  function confirmDeleteMessage(view, thread, message, row, trigger) {
    stopEditing(view);
    cancelConfirm(view, false);
    const { bar, confirm } = makeConfirmBar(
      'Delete message?',
      async () => {
        await view.safely(() => mutate('delete', { id: thread.id, messageId: message.id }));
        if (view.confirm?.messageId === message.id) cancelConfirm(view, false);
      },
      () => { cancelConfirm(view, true); render(); },
    );
    view.confirm = { kind: 'message', messageId: message.id, row, bar, trigger };
    row.append(bar);
    render();
    confirm.focus({ preventScroll: true });
  }

  function makeCard(id, from) {
    const node = element('section', 'adg-comment-card adg-comment-thread');
    node.tabIndex = -1;
    const title = element('h2');
    const targetLabel = element('p', 'adg-comment-target adg-comment-meta');
    targetLabel.hidden = true;
    const stale = makeStateBadge();
    const messages = element('div', 'adg-comment-messages');
    messages.tabIndex = 0;
    messages.setAttribute('aria-label', 'Messages');
    messages.addEventListener('scroll', renderMenu);
    node.addEventListener('scroll', renderMenu);
    const resolution = element('p', 'adg-comment-resolution adg-comment-meta');
    const status = element('p', 'adg-comment-error');
    status.setAttribute('role', 'alert');
    status.hidden = true;
    const safely = async action => {
      setStatus(status);
      status.classList.remove('adg-comment-copied');
      try { await action(); }
      catch (error) { setStatus(status, error.message || 'Could not update the thread.'); }
      if (node.isConnected) render();
    };
    let view;
    const actions = makeMenu('Thread actions', [
      ['Copy link', () => void safely(async () => {
        await navigator.clipboard.writeText(commentURL(threads.get(id)));
        status.classList.add('adg-comment-copied');
        setStatus(status, 'Link copied.');
      })],
      ['Delete thread', trigger => confirmDeleteThread(view, trigger), true],
    ]);
    const close = closeButton('Close thread', () => { navigation++; closeThread(true); render(); });
    const heading = element('header', 'adg-comment-card-header');
    heading.append(title, stale, actions, close);
    const reply = editor('Reply…', 'Reply', async message => {
      await mutate('reply', { id, message });
      if (replyDrafts.get(id) !== message) return;
      replyDrafts.delete(id);
      reply.field.value = '';
      if (card?.id === id && card.reply !== reply) {
        card.reply.field.value = '';
        card.reply.update();
      }
    });
    reply.field.value = replyDrafts.get(id) ?? '';
    reply.update();
    reply.field.addEventListener('input', () => replyDrafts.set(id, reply.field.value));
    const resolve = button('Resolve', 'adg-comment-action', async () => {
      resolve.disabled = true;
      await safely(async () => {
        const action = threads.get(id)?.status === 'resolved' ? 'reopen' : 'resolve';
        await mutate(action, { id });
      });
      resolve.disabled = false;
    });
    reply.actions.prepend(resolve);
    node.append(heading, targetLabel, messages, resolution, status, reply.form);
    view = { id, from, node, title, targetLabel, stale, messages, resolution, reply, resolve, safely, threadMessages: null, edit: null, confirm: null };
    return view;
  }

  function updateCard(view, thread, state) {
    const title = `#${thread.number} ${label(thread)}`;
    if (view.title.textContent !== title) {
      view.title.textContent = title;
      view.node.setAttribute('aria-label', title);
    }
    const detail = secondaryTarget(thread);
    view.targetLabel.hidden = !detail;
    if (view.targetLabel.textContent !== detail) view.targetLabel.textContent = detail;
    view.stale.hidden = !state;
    if (state) {
      view.stale.textContent = state === 'missing' ? 'Missing' : 'Changed';
      view.stale.dataset.state = state;
    }
    const resolved = thread.status === 'resolved';
    view.resolve.textContent = resolved ? 'Reopen' : 'Resolve';
    view.resolution.hidden = !resolved;
    const resolution = resolved ? `Resolved by ${authorName(thread.resolvedBy)}` : '';
    if (view.resolution.textContent !== resolution) view.resolution.textContent = resolution;
    if (view.threadMessages === thread.messages) return;
    view.threadMessages = thread.messages;
    const nearEnd = view.messages.scrollHeight - view.messages.scrollTop - view.messages.clientHeight < 24;
    const scrollTop = view.messages.scrollTop;
    const rows = new Map([...view.messages.children].map(node => [node.dataset.messageId, node]));
    if (menu && view.messages.contains(menu.wrapper)) closeMenu();
    let previous = null;
    for (const message of thread.messages) {
      const row = rows.get(message.id) ?? element('article', 'adg-comment-message');
      rows.delete(message.id);
      row.dataset.messageId = message.id;
      const content = JSON.stringify(message);
      const locked = view.edit?.id === message.id || view.confirm?.messageId === message.id;
      if (!locked && row.dataset.content !== content) {
        row.dataset.content = content;
        const meta = messageMeta(message);
        if (message.author?.kind === 'user') meta.append(makeMenu('Message actions', [
          ['Edit', () => editMessage(view, message, row)],
          ['Delete', trigger => confirmDeleteMessage(view, thread, message, row, trigger), true],
        ]));
        row.replaceChildren(meta, element('p', 'adg-comment-message-text', message.text));
      }
      if (row !== (previous ? previous.nextElementSibling : view.messages.firstElementChild)) view.messages.insertBefore(row, previous ? previous.nextElementSibling : view.messages.firstElementChild);
      previous = row;
    }
    for (const [id, row] of rows) {
      if (view.edit?.id === id) view.edit = null;
      if (view.confirm?.messageId === id) view.confirm = null;
      row.remove();
    }
    view.messages.scrollTop = nearEnd ? view.messages.scrollHeight : scrollTop;
  }

  function stopEditing(view) {
    if (!view.edit) return false;
    delete view.edit.row.dataset.content;
    view.edit = null;
    view.threadMessages = null;
    render();
    return true;
  }

  function editMessage(view, message, row) {
    cancelConfirm(view, false);
    stopEditing(view);
    const input = editor('Edit message', 'Save', async text => {
      await mutate('edit', { id: view.id, messageId: message.id, message: text });
      if (view.edit?.id === message.id) stopEditing(view);
    });
    input.field.value = message.text;
    input.update();
    input.actions.prepend(button('Cancel', 'adg-comment-action', () => stopEditing(view)));
    view.edit = { id: message.id, row };
    row.replaceChildren(messageMeta(message), input.form);
    input.field.focus({ preventScroll: true });
    render();
  }

  function removeThread(id) {
    if (card?.id === id) closeThread(true);
    if (drag?.id === id) drag = null;
    pinNodes.get(id)?.pin.remove();
    pinNodes.get(id)?.stem.remove();
    pinNodes.delete(id);
    replyDrafts.delete(id);
    pendingMoves.delete(id);
    unlocated.delete(id);
  }

  function mutate(action, fields) {
    const write = writeQueue.then(async () => {
      showNotice();
      const result = await request(endpoint, { action, ...fields });
      version++;
      if (result?.thread) threads.set(result.thread.id, result.thread);
      else if (action === 'delete-thread' || action === 'delete') {
        threads.delete(fields.id);
        removeThread(fields.id);
      }
      if (action === 'reopen' || (action === 'reply' && result?.thread?.status === 'open' && card?.id === fields.id && filter === 'resolved')) filter = 'open';
      render();
      return result?.thread;
    });
    writeQueue = write.catch(() => {});
    return write;
  }

  async function refresh() {
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }
    refreshing = (async () => {
      do {
        refreshAgain = false;
        const started = version;
        const result = await request(endpoint);
        if (started !== version) { refreshAgain = true; continue; }
        const next = new Map(result.threads.map(thread => [thread.id, thread]));
        for (const id of threads.keys()) if (!next.has(id)) removeThread(id);
        threads = next;
        render();
      } while (refreshAgain);
    })();
    try { await refreshing; }
    finally { refreshing = null; }
  }

  async function openLink(value = new URLSearchParams(location.search).get('comment')) {
    if (value == null || value === '') return false;
    const reference = String(value).replace(/^#/, '');
    const find = () => [...threads.values()].find(thread => thread.id === reference || String(thread.number) === reference);
    try {
      if (!find()) await refresh();
      const thread = find();
      if (!thread) throw new Error(`Comment #${reference} could not be found.`);
      return await openThread(thread.id, { go: true });
    } catch (error) {
      report(error);
      return false;
    }
  }

  function escape() {
    const hadNotice = !notice.hidden;
    if (hadNotice) showNotice();
    const handled = cancelDrag() || closeMenu(true) || (card && cancelConfirm(card, true)) || (card && stopEditing(card)) || closeDraft(true) || closeThread(true);
    if (handled || hadNotice) {
      if (handled) navigation++;
      render();
      return true;
    }
    if (active()) { toggle(false); return true; }
    if (!panel.hidden) { setPanel(false, true); return true; }
    return false;
  }

  function key(event) {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open], :popover-open')) return false;
    if (event.key === 'Escape') {
      if (!escape()) return false;
    } else {
      if (event.key.toLowerCase() !== 'c' || event.metaKey || event.ctrlKey || event.altKey ||
        event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false;
      if (!event.shiftKey && !canUseTool()) return false;
      if (!event.repeat) {
        if (event.shiftKey) setVisible();
        else toggle();
      }
    }
    event.preventDefault();
    return true;
  }

  document.addEventListener('pointerdown', event => {
    if (menu && !menu.wrapper.contains(event.target) && !menu.list.contains(event.target)) closeMenu();
  });
  for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => {
    if (event.key !== 'Alt' || (!highlightPoint && !drag?.moved)) return;
    if (highlightPoint) highlightPoint.deepest = event.altKey;
    if (drag) drag.deepest = event.altKey;
    renderHighlight();
  });
  toolButton.addEventListener('click', () => toggle());
  panelButton.addEventListener('click', () => setPanel(panel.hidden, panel.hidden));
  render();
  if (initialComment != null) queueMicrotask(() => { void openLink(initialComment); });
  return { active, place, click, hover, render, reposition: () => render(true), refresh, key, openLink, closePanel, dismiss, setAvailable };
}
