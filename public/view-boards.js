import { icon } from './icons.js';

export const frameKey = (source, frame) => JSON.stringify([source, frame]);

export function boardElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function playButton(frame, onPlay) {
  const button = boardElement('button', 'frame-play');
  button.type = 'button';
  button.setAttribute('aria-label', 'Play from ' + frame);
  button.title = button.getAttribute('aria-label');
  button.innerHTML = icon('play', 16);
  button.onclick = onPlay;
  return button;
}

export function placePlayButton(card, content, size, viewport) {
  const inset = 4;
  const right = card.x + card.width;
  const visibleRight = viewport ? Math.min(right, viewport.width) : right;
  const visibleTop = viewport ? Math.max(card.y, 0) : card.y;
  const corner = { x: visibleRight - size - inset, y: visibleTop + inset, outside: false };
  const above = { x: visibleRight - size, y: card.y - size - inset, outside: true };
  const beside = { x: right + inset, y: visibleTop, outside: true };
  const visible = ({ x, y }) => !viewport || (x >= 0 && y >= 0 && x + size <= viewport.width && y + size <= viewport.height);
  if (corner.x >= card.x && corner.y + size <= card.y + card.height &&
      (corner.x >= content.x + content.width || corner.y + size <= content.y) && visible(corner)) return corner;
  return [above, beside].find(visible);
}

// Work entirely from the indexed edge summaries and measured frame references.
export function prototypeFlows(edges, frames, relative) {
  const nodes = new Map();
  const links = [];
  for (const edge of edges) {
    const from = frameKey(relative(edge.from.source), edge.from.frame);
    const to = frameKey(relative(edge.to.source), edge.to.frame);
    if (!frames.has(from)) continue;
    if (!nodes.has(from)) nodes.set(from, { outgoing: [], incoming: [], flow: edge.flow });
    if (!frames.has(to)) continue;
    if (!nodes.has(to)) nodes.set(to, { outgoing: [], incoming: [], flow: edge.flow });
    nodes.get(from).outgoing.push(to);
    nodes.get(to).incoming.push(from);
    links.push({ ...edge, from, to });
  }
  const visited = new Set(), flows = [];
  for (const seed of nodes.keys()) {
    if (visited.has(seed)) continue;
    const members = [seed];
    visited.add(seed);
    for (const id of members) {
      const node = nodes.get(id);
      for (const other of [...node.outgoing, ...node.incoming]) {
        if (visited.has(other)) continue;
        visited.add(other);
        members.push(other);
      }
    }
    const flow = nodes.get(seed).flow;
    const projectedStart = flow && frameKey(relative(flow.start.source), flow.start.frame);
    // A scope can omit the start. Use the first available root, then authored order.
    const start = members.includes(projectedStart) ? projectedStart : members.find(id => !nodes.get(id).incoming.length) ?? seed;
    const ranks = new Map([[start, 0]]);
    const traverse = root => {
      const pending = [root];
      for (const current of pending) for (const other of nodes.get(current).outgoing) {
        if (ranks.has(other)) continue;
        ranks.set(other, ranks.get(current) + 1);
        pending.push(other);
      }
    };
    traverse(start);
    for (const id of members) {
      if (ranks.has(id)) continue;
      ranks.set(id, 0);
      traverse(id);
    }
    flows.push({ start, ranks, links: [], id: flow?.id, label: flow?.label });
  }
  const byNode = new Map(flows.flatMap(flow => [...flow.ranks.keys()].map(id => [id, flow])));
  for (const link of links) byNode.get(link.from).links.push(link);
  return flows;
}

function triggerLabel({ trigger, label }) {
  const { on, key, value, target } = trigger;
  const name = typeof target === 'string' ? target.replace(/.*#/, '').replace(/[-_]/g, ' ') : '';
  const action = { click: 'Click', hover: 'Hover over', focus: 'Focus' }[on];
  if (on === 'input') return 'Type ' + (value || name);
  if (on === 'key') return 'Press ' + ({ Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space' }[key] ?? key);
  return name ? action + ' ' + name : label || action;
}

const cardWidth = 248, cardHeight = 230, rowGap = 24;
const stepY = cardHeight + rowGap, bendStep = 8;

function groupLinks(links, endpoint) {
  const groups = new Map();
  for (const link of links) {
    const key = endpoint(link);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(link);
  }
  return groups;
}

// Order the side ports and elbows together so neighboring routes do not run
// along the same card edge or share an arrowhead.
function placePorts(links, positions, linksByColumn, side) {
  const outgoing = side === 'from';
  for (const [id, endpoints] of groupLinks(links, link => link[side])) {
    const { y } = positions.get(id);
    const gap = Math.min(16, 110 / Math.max(1, endpoints.length - 1));
    endpoints.forEach((link, i) => {
      link[side + 'Y'] = y + 74 + gap * (i - (endpoints.length - 1) / 2);
    });
  }
  for (const endpoints of linksByColumn.values()) {
    endpoints.sort((a, b) => a[side + 'Y'] - b[side + 'Y']);
    endpoints.forEach((link, i) => {
      const { x } = positions.get(link[side]);
      const inset = 14 + i * bendStep;
      link[side + 'Bend'] = x + (outgoing ? cardWidth + inset : -inset);
    });
  }
}

export function renderPrototype(container, flows, frames, { card, play, title }) {
  const groups = flows.map(flow => {
    const start = frames.get(flow.start);
    const section = boardElement('section', 'view-board-section');
    const header = boardElement('header', 'view-section-heading');
    if (flow.id) section.dataset.flowId = flow.id;
    const name = flow.label || title(start.asset.path);
    const heading = boardElement('h2', '', name);
    const launch = boardElement('button', 'view-board-action', 'Play flow');
    launch.insertAdjacentHTML('afterbegin', icon('play', 14));
    launch.setAttribute('aria-label', 'Play flow from ' + start.part.name);
    launch.onclick = () => play(start.asset.path, start.part.name, launch);
    header.append(heading, launch);
    section.append(header);

    const columns = new Map();
    for (const [id, rank] of flow.ranks) {
      if (!columns.has(rank)) columns.set(rank, []);
      columns.get(rank).push(id);
    }
    const forward = new Map(), tracks = [];
    for (const link of flow.links) {
      const label = triggerLabel(link);
      const adjacent = flow.ranks.get(link.to) === flow.ranks.get(link.from) + 1;
      if (!adjacent) {
        tracks.push({ from: link.from, to: link.to, id: link.id, label, lane: tracks.length });
        continue;
      }
      const pair = frameKey(link.from, link.to);
      if (!forward.has(pair)) forward.set(pair, { from: link.from, to: link.to, labels: new Set() });
      forward.get(pair).labels.add(label);
    }
    const connections = [...tracks, ...forward.values()];
    const fromColumns = groupLinks(tracks, link => flow.ranks.get(link.from));
    const toColumns = groupLinks(tracks, link => flow.ranks.get(link.to));
    const maxBends = groups => Math.max(0, ...[...groups.values()].map(links => links.length));
    const bendRoom = 16 + Math.max(maxBends(fromColumns), maxBends(toColumns)) * bendStep;
    const columnGap = Math.max(202, 2 * bendRoom + 24);
    const stepX = cardWidth + columnGap;
    const firstColumn = Math.max(26, 16 + (toColumns.get(0)?.length ?? 0) * bendStep);
    const lastColumn = Math.max(26, 16 + (fromColumns.get(columns.size - 1)?.length ?? 0) * bendStep);
    const scroll = boardElement('div', 'prototype-scroll');
    const graph = boardElement('div', 'prototype-map');
    const positions = new Map();
    const columnsHeight = Math.max(...[...columns.values()].map(items => items.length)) * stepY - rowGap;
    const trackGap = 28;
    const offset = Math.max(34, tracks.length * trackGap + 14);
    const graphWidth = firstColumn + (columns.size - 1) * stepX + cardWidth + lastColumn;
    const graphHeight = columnsHeight + offset + 8;
    graph.style.cssText = `width:${graphWidth}px;height:${graphHeight}px`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', graphWidth);
    svg.setAttribute('height', graphHeight);
    const marker = 'prototype-arrow-' + groupsMarker++;
    svg.innerHTML = `<defs><marker id="${marker}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z"/></marker></defs>`;
    graph.append(svg);
    for (const [rank, items] of columns) {
      items.forEach((id, row) => {
        const x = firstColumn + rank * stepX;
        const y = offset + (columnsHeight - (items.length * stepY - rowGap)) / 2 + row * stepY;
        positions.set(id, { x, y });
        const node = card(frames.get(id), { badge: id === flow.start ? 'Start' : '' });
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        graph.append(node);
      });
    }
    placePorts(connections, positions, fromColumns, 'from');
    placePorts(connections, positions, toColumns, 'to');
    for (const link of connections) {
      const x = positions.get(link.from).x + cardWidth;
      const endX = positions.get(link.to).x;
      const { fromY: y, toY: endY, fromBend, toBend } = link;
      const routed = link.lane !== undefined;
      const laneY = offset - (link.lane + 1) * trackGap + 14;
      const mid = (x + endX) / 2;
      const arrow = document.createElementNS(svg.namespaceURI, 'path');
      const path = routed
        ? `M${x} ${y} H${fromBend} V${laneY} H${toBend} V${endY} H${endX}`
        : `M${x} ${y} C${mid} ${y},${mid} ${endY},${endX} ${endY}`;
      arrow.setAttribute('d', path);
      arrow.setAttribute('marker-end', `url(#${marker})`);
      if (routed) arrow.dataset.edge = link.id;
      svg.append(arrow);
      const text = routed ? link.label : [...link.labels].filter(Boolean).join(' · ');
      const label = boardElement('span', 'prototype-trigger', text);
      label.style.left = (routed ? (fromBend + toBend) / 2 : mid) + 'px';
      label.style.top = (routed ? laneY - 4 : (y + endY) / 2 - 10) + 'px';
      label.title = text;
      if (routed) label.dataset.edge = link.id;
      label.setAttribute('aria-label', frames.get(link.from).part.name + ' to ' + frames.get(link.to).part.name + ' · ' + text);
      graph.append(label);
    }
    scroll.append(graph);
    section.append(scroll);
    return section;
  });
  container.replaceChildren(...groups);
}
let groupsMarker = 0;

export function createFrameCards(root, { preview, show, play, playable }) {
  let pending = new WeakMap();
  const resize = new ResizeObserver(entries => {
    for (const { target: well } of entries) {
      const button = well.querySelector('.frame-play');
      const preview = well.querySelector('canvas');
      const outer = well.getBoundingClientRect(), inner = preview.getBoundingClientRect();
      const size = button.offsetWidth;
      const position = placePlayButton(
        { x: 0, y: 0, width: outer.width, height: outer.height },
        { x: inner.x - outer.x, y: inner.y - outer.y, width: inner.width, height: inner.height },
        size
      );
      button.style.left = position.x + 'px';
      button.style.top = position.y + 'px';
      button.style.right = 'auto';
      button.toggleAttribute('data-outside', position.outside);
    }
  });
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const canvas = entry.target, ref = pending.get(canvas);
      if (!ref) continue;
      observer.unobserve(canvas);
      pending.delete(canvas);
      void preview(ref, canvas).then(() => {
        const well = canvas.parentElement;
        if (canvas.isConnected && well?.querySelector('.frame-play')) resize.observe(well);
      });
    }
  }, { root, rootMargin: '96px' });
  return {
    reset() {
      observer.disconnect();
      resize.disconnect();
      pending = new WeakMap();
    },
    card(ref, { badge = '', source = true } = {}) {
      const { asset, part } = ref;
      const node = boardElement('article', 'view-frame');
      node.dataset.frameSource = asset.path;
      node.dataset.frameName = part.name;
      const well = boardElement('div', 'view-frame-well');
      const canvas = boardElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.dataset.preview = 'queued';
      well.append(canvas);
      pending.set(canvas, ref);
      observer.observe(canvas);
      if (playable(asset.path, part.name)) {
        const button = playButton(part.name, event => play(asset.path, part.name, event.currentTarget));
        button.setAttribute('data-outside', '');
        well.append(button);
      }
      const heading = boardElement('h4', 'view-frame-title', part.name);
      heading.title = part.name;
      const caption = boardElement('div', 'view-frame-caption');
      caption.append(heading);
      if (source) caption.append(boardElement('small', 'view-source-name', asset.path));
      const footer = boardElement('div', 'view-frame-footer');
      if (badge) footer.append(boardElement('span', 'view-badge', badge));
      const button = boardElement('button', 'view-show-in-board', 'Show in board');
      button.setAttribute('aria-label', 'Show ' + part.name + ' in board');
      button.onclick = () => show(asset.path, part.name);
      footer.append(button);
      node.append(well, caption, footer);
      return node;
    }
  };
}
