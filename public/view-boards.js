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

const cardWidth = 248, cardHeight = 230, columnGap = 202, rowGap = 24;
const stepX = cardWidth + columnGap, stepY = cardHeight + rowGap;

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
    const pairs = new Map();
    for (const link of flow.links) {
      const pair = frameKey(link.from, link.to);
      if (!pairs.has(pair)) pairs.set(pair, { from: link.from, to: link.to, labels: new Set() });
      pairs.get(pair).labels.add(triggerLabel(link));
    }
    const scroll = boardElement('div', 'prototype-scroll');
    const graph = boardElement('div', 'prototype-map');
    const positions = new Map();
    const adjacent = link => flow.ranks.get(link.to) === flow.ranks.get(link.from) + 1;
    const columnsHeight = Math.max(...[...columns.values()].map(items => items.length)) * stepY - rowGap;
    const tracks = [...pairs.values()].filter(link => !adjacent(link));
    const trackGap = 36;
    const offset = tracks.length * trackGap + 14;
    const graphWidth = (columns.size - 1) * stepX + cardWidth + 83;
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
        const x = 26 + rank * stepX;
        const y = offset + (columnsHeight - (items.length * stepY - rowGap)) / 2 + row * stepY;
        positions.set(id, { x, y });
        const node = card(frames.get(id), { badge: id === flow.start ? 'Start' : '' });
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        graph.append(node);
      });
    }
    for (const link of pairs.values()) {
      const a = positions.get(link.from), b = positions.get(link.to);
      const forward = adjacent(link);
      const x = a.x + cardWidth, y = a.y + 82;
      const endY = b.y + 82;
      const track = forward ? 0 : tracks.indexOf(link);
      const laneY = offset - (track + 1) * trackGap + 14;
      const fromX = x + 16 + (track % 5) * 7;
      const endX = b.x - 15 - (track % 2) * 6;
      const mid = x + columnGap / 2;
      const arrow = document.createElementNS(svg.namespaceURI, 'path');
      const path = forward
        ? `M${x} ${y} C${mid} ${y},${mid} ${endY},${b.x} ${endY}`
        : `M${x} ${y} H${fromX} V${laneY} H${endX} V${endY} H${b.x}`;
      arrow.setAttribute('d', path);
      arrow.setAttribute('marker-end', `url(#${marker})`);
      svg.append(arrow);
      const label = boardElement('span', 'prototype-trigger', [...link.labels].filter(Boolean).join(' · '));
      label.style.left = (forward ? mid : (fromX + endX) / 2) + 'px';
      label.style.top = (forward ? (y + endY) / 2 - 14 : laneY - 6) + 'px';
      label.setAttribute('aria-label', frames.get(link.from).part.name + ' to ' + frames.get(link.to).part.name + ' · ' + label.textContent);
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
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const canvas = entry.target, ref = pending.get(canvas);
      if (!ref) continue;
      observer.unobserve(canvas);
      pending.delete(canvas);
      void preview(ref, canvas);
    }
  }, { root, rootMargin: '96px' });
  return {
    reset() {
      observer.disconnect();
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
      if (playable(asset.path, part.name)) well.append(playButton(part.name, event => play(asset.path, part.name, event.currentTarget)));
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
