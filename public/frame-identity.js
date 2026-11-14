const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const encoder = new TextEncoder();
const W = new Uint32Array(64);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256Hex(value) {
  const bytes = encoder.encode(value);
  const len = bytes.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(total);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(total - 8, Math.floor((len * 8) / 0x100000000), false);
  view.setUint32(total - 4, (len * 8) >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(v => v.toString(16).padStart(8, '0')).join('');
}

export const identityVersion = 1;
const digest = value => sha256Hex(value).slice(0, 24);
const normalize = value => value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
const namingAttributes = new Set(['id', 'data-part', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby']);
const containerRoots = new Set(['div', 'main', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'form']);

export function identityNode(node, path, parentPath, owners, styleFor) {
  const attributes = {};
  for (const name of ['id', 'data-part', 'data-adg-id', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby']) {
    if (node.hasAttribute(name)) attributes[name] = node.getAttribute(name);
  }
  const password = node.matches('input[type=password]');
  const directText = password ? '' : [...node.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('');
  let neutral = false;
  if (!owners.length && !node.hasAttribute('data-adg-id') && !node.hasAttribute('data-adg-keys') &&
      !Object.keys(attributes).length && /^(div|span)$/.test(node.localName) && !directText.trim()) {
    const style = styleFor(node);
    neutral = Boolean(style) && (node.children.length === 1 || style.display === 'contents') &&
      ['block', 'inline', 'contents'].includes(style.display) && style.position === 'static' &&
      style.transform === 'none' && style.overflowX === 'visible' && style.overflowY === 'visible' &&
      style.opacity === '1' && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.boxShadow === 'none' &&
      ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(style[`margin${side}`]) === 0 && parseFloat(style[`padding${side}`]) === 0 && parseFloat(style[`border${side}Width`]) === 0);
  }
  const native = { button: 'button', a: node.hasAttribute('href') ? 'link' : null, input: node.type === 'checkbox' ? 'checkbox' : node.type === 'radio' ? 'radio' : node.type === 'button' || node.type === 'submit' ? 'button' : 'textbox', select: 'combobox', textarea: 'textbox', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', img: 'img' };
  const role = node.getAttribute('role') ?? native[node.localName];
  const labelled = node.getAttribute('aria-labelledby')?.split(/\s+/).map(id => node.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
  const name = normalize(labelled || node.getAttribute('aria-label') || node.getAttribute('alt') || (role === 'textbox' || role === 'combobox' ? Array.from(node.labels ?? []).map(l => l.textContent).join(' ') : role ? node.textContent : '') || '');
  const resource = node.localName === 'svg' && (node.hasAttribute('data-adg-icon') || node.getAttribute('aria-hidden') === 'true' || !node.querySelector('text,foreignObject') && !node.hasAttribute('role'));
  return {
    path, parentPath, tag: node.localName, namespace: node.namespaceURI, attributes, owners, neutral, resource,
    ...(role && name ? { semantic: { role, name } } : {}),
    keys: JSON.parse(node.getAttribute('data-adg-keys') ?? '[]'),
    password,
    directText,
  };
}

export function elementIdentities(nodes, { source, frame }, { hash = digest } = {}) {
  const children = new Map(nodes.map(n => [n.path, []])), byPath = new Map(nodes.map(n => [n.path, n]));
  for (const n of nodes) children.get(n.parentPath)?.push(n);
  const result = new Map(), seen = new Map(), rootScope = JSON.stringify([identityVersion, source, frame]);
  const conflict = message => { throw Object.assign(new Error(message), { code: 'INSPECT_IDENTITY_CONFLICT' }); };
  function describe(node) {
    const attrs = node.attributes ?? {}, owners = node.owners ?? [], keys = node.keys ?? [], anchor = attrs['data-adg-id'];
    let defining = owners, ancestor = byPath.get(node.parentPath);
    while (!defining.length && ancestor) { defining = ancestor.owners ?? []; ancestor = byPath.get(ancestor.parentPath); }
    if (anchor !== undefined && (typeof anchor !== 'string' || !anchor.trim())) conflict('data-adg-id must be a nonempty string.');
    const naming = Object.entries(attrs).filter(([name]) => namingAttributes.has(name)).sort(([a], [b]) => a.localeCompare(b));
    const signature = [node.namespace, node.tag, naming, node.semantic ?? null, node.password ? '' : normalize(node.directText ?? '')];
    const seed = anchor !== undefined ? ['anchor', anchor, owners, ...keys] : keys.length ? ['key', keys, owners] : [node.neutral ? 'wrapper' : 'semantic', signature, defining];
    const boundary = !node.neutral && (anchor !== undefined || keys.length || owners.length || naming.length || node.semantic?.name);
    return { node, signature, seed, defining, candidate: boundary, boundary: false, fixed: anchor !== undefined || keys.length > 0, strict: keys.length > 0 || anchor !== undefined && !owners.length };
  }
  const descriptors = new Map(nodes.map(n => [n.path, describe(n)]));
  function assign(record, scope, ordinal, count, inherited) {
    const duplicate = count > 1, id = `e1_${hash(JSON.stringify([scope, record.seed, ...(!record.strict && duplicate ? [ordinal] : [])]))}`;
    if (seen.has(id)) conflict(`Element identity conflicts at ${source}#${frame}, paths ${seen.get(id)} and ${record.node.path}; use unique anchors or instance keys.`);
    seen.set(id, record.node.path);
    const positional = inherited || !record.strict && duplicate;
    result.set(record.node.path, { path: record.node.path, id, defining: record.defining });
    return { id, positional };
  }
  function resource(root, scope) {
    let slot = 0;
    function visit(node) {
      const r = descriptors.get(node.path), local = slot++;
      const original = r.seed; r.seed = ['resource-slot', local]; assign(r, scope, 0, 1, false); r.seed = original;
      for (const child of children.get(node.path)) visit(child);
    }
    for (const child of children.get(root.path)) visit(child);
  }
  function scope(roots, address, inherited = false) {
    let pool = [];
    function gather(node) { const r = descriptors.get(node.path); pool.push(r); if (!r.boundary && !node.resource) for (const child of children.get(node.path)) gather(child); }
    for (let changed = true; changed;) {
      changed = false; pool = []; roots.forEach(gather);
      const candidates = new Map();
      for (const r of pool) if (r.candidate) { const key = JSON.stringify(r.seed); candidates.set(key, (candidates.get(key) ?? 0) + 1); }
      for (const r of pool) if (r.candidate && !r.boundary && (r.fixed || candidates.get(JSON.stringify(r.seed)) === 1)) { r.boundary = true; changed = true; }
    }
    const groups = new Map();
    for (const r of pool) {
      let parent = byPath.get(r.node.parentPath); while (parent?.neutral) parent = byPath.get(parent.parentPath);
      const key = JSON.stringify([r.seed, ...(r.node.keys?.length ? [parent?.path ?? null] : [])]);
      const peers = groups.get(key) ?? []; peers.push(r); groups.set(key, peers); r.peers = peers;
    }
    const resolved = new Map();
    function resolve(r) {
      if (resolved.has(r.node.path)) return resolved.get(r.node.path);
      let local = address, localPositional = inherited;
      if (r.node.attributes?.['data-adg-id'] !== undefined && !r.node.owners?.length) {
        let owner = byPath.get(r.node.parentPath); while (owner && !owner.owners?.length) owner = byPath.get(owner.parentPath);
        const ownerRecord = pool.find(p => p.node === owner), value = ownerRecord ? resolve(ownerRecord) : null;
        if (value) { local = value.id; localPositional ||= value.positional; }
      }
      if (r.node.keys?.length) {
        let parent = byPath.get(r.node.parentPath); while (parent?.neutral) parent = byPath.get(parent.parentPath);
        const parentRecord = pool.find(p => p.node === parent), parentValue = parentRecord ? resolve(parentRecord) : null;
        local = parentValue?.id ?? result.get(parent?.path)?.id ?? address; localPositional ||= parentValue?.positional ?? false;
      }
      const value = assign(r, local, r.peers.indexOf(r), r.peers.length, localPositional);
      resolved.set(r.node.path, value);
      return value;
    }
    for (const r of pool) resolve(r);
    for (const r of pool) {
      const value = resolved.get(r.node.path);
      if (r.node.resource) resource(r.node, value.id);
      else if (r.boundary) scope(children.get(r.node.path), value.id, value.positional);
    }
  }
  for (const root of nodes.filter(n => !byPath.has(n.parentPath))) {
    const record = descriptors.get(root.path), seed = record.seed; record.seed = ['frame-root'];
    const value = assign(record, rootScope, 0, 1, false); record.seed = seed;
    if (root.resource) resource(root, value.id); else scope(children.get(root.path), value.id);
  }
  return nodes.map(node => result.get(node.path));
}

export function collectViewerElements(shell, { projectSource, assetPath, frame, styleFor, rectFor, origin }) {
  const root = shell.firstElementChild;
  if (!root || shell.children.length !== 1) return [];
  const domNodes = [], inputs = [];
  function walk(node, parentPath) {
    const path = String(inputs.length);
    const owners = node.hasAttribute('data-adg-owners') ? JSON.parse(node.getAttribute('data-adg-owners')) : [];
    const entry = identityNode(node, path, parentPath, owners, styleFor);
    domNodes.push(node);
    inputs.push(entry);
    if (!entry.resource) {
      for (let child = node.firstElementChild; child; child = child.nextElementSibling) walk(child, path);
    }
  }
  walk(root, null);
  let assigned;
  try {
    assigned = elementIdentities(inputs, { source: projectSource, frame });
  } catch (error) {
    if (error.code === 'INSPECT_IDENTITY_CONFLICT') return [];
    throw error;
  }
  const clean = n => n === 0 ? 0 : n;
  const elements = [];
  for (let i = 0; i < domNodes.length; i++) {
    const node = domNodes[i], input = inputs[i], idRow = assigned[i];
    if (input.neutral) continue;
    if (node === root && !input.owners.length && !node.hasAttribute('data-adg-id') && !node.hasAttribute('role') && containerRoots.has(node.localName)) continue;
    const rect = rectFor(node);
    let left = Math.max(rect.left, origin.left), right = Math.min(rect.right, origin.right);
    let top = Math.max(rect.top, origin.top), bottom = Math.min(rect.bottom, origin.bottom);
    for (let p = node; p && p !== shell; p = p.parentElement) {
      const s = styleFor(p);
      if (s.display === 'none' || (p === node && s.visibility !== 'visible') || Number(s.opacity) === 0) { left = right; break; }
      if (p !== node && s.display !== 'inline') {
        const clip = rectFor(p);
        if (/(hidden|clip|scroll|auto)/.test(s.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
        if (/(hidden|clip|scroll|auto)/.test(s.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
      }
    }
    if (right <= left || bottom <= top) continue;
    const owner = idRow.defining.at(-1) ?? { source: assetPath, export: null };
    elements.push({
      id: idRow.id,
      owners: input.owners,
      owner,
      x: clean(left - origin.left),
      y: clean(top - origin.top),
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    });
  }
  return elements;
}
