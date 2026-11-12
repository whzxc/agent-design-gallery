import { createHash } from 'node:crypto';
import { CliError } from '../cli-output.mjs';

export const identityVersion = 1;
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const normalize = value => value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
const namingAttributes = new Set(['id', 'data-part', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby']);

/** Assign before projections: paths, theme, paint and geometry never enter an address. */
export function elementIdentities(nodes, { source, frame }, { hash = digest, metadata = true } = {}) {
  const byPath = new Map(nodes.map(node => [node.path, node]));
  const records = new Map(), groups = new Map();
  const rootScope = JSON.stringify([identityVersion, source, frame]);
  const conflict = message => { throw new CliError('INSPECT_IDENTITY_CONFLICT', message); };

  function prepare(node) {
    if (records.has(node.path)) return records.get(node.path);
    const parent = byPath.get(node.parentPath), above = parent ? prepare(parent) : null;
    const attributes = node.attributes ?? {}, owners = node.owners ?? [], keys = node.keys ?? [];
    const naming = Object.entries(attributes).filter(([name]) => namingAttributes.has(name)).sort(([a], [b]) => a.localeCompare(b));
    const signature = [node.namespace, node.tag, naming, node.password ? '' : normalize(node.directText ?? '')];
    const anchor = attributes['data-adg-id'];
    if (anchor !== undefined && (typeof anchor !== 'string' || !anchor.trim())) conflict('data-adg-id must be a nonempty string.');
    const boundary = owners.length > 0 || keys.length > 0 || anchor !== undefined;
    const scope = above?.childScope ?? rootScope;
    const seed = !parent ? ['frame-root'] : anchor !== undefined ? ['anchor', anchor, owners, ...keys]
      : keys.length ? ['key', keys, owners] : ['semantic', signature, owners];
    const group = JSON.stringify([scope, seed]);
    let keyParent = above;
    while (keyParent?.node.neutral) keyParent = keyParent.above;
    const record = {
      node, above, keyParent, seed, signature, boundary, group,
      // A root-local anchor may repeat across unkeyed part instances. Its instance remains positional.
      strict: keys.length > 0 || anchor !== undefined && !owners.length,
      authored: anchor !== undefined || keys.length > 0,
    };
    records.set(node.path, record);
    const peers = groups.get(group) ?? [];
    peers.push(record); groups.set(group, peers);
    record.childScope = boundary ? hash(group) : scope;
    return record;
  }
  for (const node of nodes) prepare(node);

  // Resolve instance ordinals before descendants; distinct repeated instances cannot share addresses.
  const seen = new Map(), results = new Map();
  function resolve(record) {
    if (results.has(record.node.path)) return results.get(record.node.path);
    const above = record.above ? resolve(record.above) : null;
    const peers = groups.get(record.group), ordinal = peers.indexOf(record), duplicate = peers.length > 1;
    const keyScope = record.node.keys?.length && record.keyParent ? resolve(record.keyParent) : null;
    const scope = keyScope?.id ?? above?.childScope ?? rootScope;
    const tuple = JSON.stringify([scope, record.seed, ...(!record.strict && duplicate ? [ordinal] : [])]);
    const id = `e1_${hash(tuple)}`;
    if (seen.has(id)) conflict(`Element identity conflicts at ${source}#${frame}, paths ${seen.get(id)} and ${record.node.path}; use unique anchors or instance keys.`);
    seen.set(id, record.node.path);
    const positional = (keyScope ? keyScope.positional : above?.childPositional) || !record.strict && duplicate;
    const identity = metadata ? {
      stability: positional ? 'positional' : record.authored ? 'authored' : 'semantic',
      guard: hash(JSON.stringify([record.node.namespace, record.node.tag, record.signature, scope, record.node.owners ?? []])),
    } : undefined;
    if (identity) {
      if (record.node.attributes?.['data-adg-id'] !== undefined) identity.anchor = record.node.attributes['data-adg-id'];
      if (record.node.keys?.length) identity.key = record.node.keys.at(-1).key;
      if (!record.strict && duplicate) identity.duplicate = { group: hash(record.group), ordinal, count: peers.length };
    }
    const result = {
      id, identity, positional,
      childPositional: record.boundary ? positional : above?.childPositional ?? false,
      childScope: record.boundary ? id : scope,
    };
    results.set(record.node.path, result);
    return result;
  }
  return nodes.map(node => {
    const { id, identity } = resolve(records.get(node.path));
    return { path: node.path, id, ...(identity ? { identity } : {}) };
  });
}
