import { readViewRoute, viewURL, viewerBase } from '../public/view-route.js';

export function previewTarget(options) {
  const { asset, frame, group, layer, tokens, mode = 'query' } = options;
  if (!['path', 'query'].includes(mode)) throw Error('Choose --mode=path or --mode=query.');
  const targets = [asset, group, layer, tokens].filter(value => value !== undefined && value !== false);
  if (targets.length > 1 || (frame !== undefined && !asset) || targets.some(value => value === '') || frame === '')
    throw Error('Choose one of --asset, --group, --layer, or --tokens. --frame needs --asset.');
  if (asset && (!/\.(tsx|svg)$/i.test(asset) || asset.includes('\\') || asset.split('/').some(part => !part || part === '.' || part === '..')))
    throw Error('Use a design-relative .tsx or .svg file path for --asset.');
  if (tokens && mode === 'path') throw Error('Use --mode=query for --tokens.');
  return { asset, frame, group, layer, tokens, mode };
}

export function previewURL(input, target) {
  let base;
  try { base = new URL(input); }
  catch { throw Error('Enter an absolute SDG viewer URL.'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw Error('Enter an HTTP or HTTPS viewer URL without credentials.');
  const pathname = base.pathname.replace(/^(\/(?:p|i)\/[A-Za-z0-9_-]+)$/, '$1/');
  const root = viewerBase(pathname);
  if (pathname !== root && !pathname.startsWith(`${root}view/`) && pathname !== `${root}index.html`)
    throw Error('Use a direct viewer, hub project, or live instance URL.');
  const previous = target.asset || target.group || target.layer || target.tokens ? null : readViewRoute(base);
  const [kind, ...name] = (previous?.scope ?? '').split(':');
  const key = name.join(':');
  const asset = target.asset ?? previous?.target?.path ?? (kind === 'asset' ? key : null);
  const group = asset ? null : target.group ?? previous?.target?.group ?? (kind === 'group' ? key : null);
  const layer = target.layer ?? (kind === 'layer' ? key : null);
  const frame = target.frame ?? previous?.target?.form;
  const element = frame && previous?.target?.element;
  const tokens = target.tokens || kind === 'tokens';
  const { mode } = target;
  base.pathname = root;
  base.search = base.hash = '';
  if (tokens && mode === 'path') throw Error('Use --mode=query for --tokens.');
  if (tokens) return viewURL(base, 'tokens');
  if (mode === 'query') {
    if (asset) base.searchParams.set('asset', asset);
    if (group) base.searchParams.set('group', group);
    if (!asset && !group && layer) base.searchParams.set('scope', `layer:${layer}`);
    if (!asset && !group && kind === 'all') base.searchParams.set('scope', 'all');
    if (frame) base.searchParams.set('frame', frame);
    if (element) base.searchParams.set('element', element.id);
    return base;
  }
  const parent = layer ?? (asset?.includes('/') ? asset.split('/')[0] : null);
  if (!parent && !group && !asset && kind !== 'all') return base;
  return viewURL(base, parent ? `layer:${parent}` : 'all', { path: asset, group, form: frame, element });
}
