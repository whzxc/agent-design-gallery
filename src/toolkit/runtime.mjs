import { icons } from 'lucide';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export const markup = html => ({ html, toString() { return this.html; } });
export function children(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(children).join('');
  if (typeof value === 'object' && typeof value.html === 'string') return value.html;
  return escape(value);
}
export function attributes(props) {
  return Object.entries(props).filter(([key, value]) => !['children', 'key', '__source'].includes(key) && value != null && value !== false).map(([key, value]) => {
    if (/^on/i.test(key) || key === 'className' || key === 'dangerouslySetInnerHTML') throw Error(`Forbidden attribute ${key}; use static markup and class`);
    if (key === 'style' && typeof value === 'object') value = Object.entries(value).map(([name, v]) => `${name.startsWith('--') ? name : name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${typeof v === 'number' && !/^(opacity|zIndex|fontWeight|lineHeight|flex|flexGrow|flexShrink|order|gridColumn|gridRow|scale)$/.test(name) && !name.startsWith('--') ? v + 'px' : v}`).join(';');
    return ` ${key}="${escape(value === true ? '' : value)}"`;
  }).join('');
}
const artworkSources = new Map();
export function registerArtwork(url, source) { artworkSources.set(url,source); return url; }
const componentOwners = new WeakMap();
export const componentOwner = component => componentOwners.get(component);
export function registerComponent(component, source, name) {
  if (typeof component === 'function' && !componentOwners.has(component)) componentOwners.set(component, {source, export:name});
}
const stampIdentity = (value, identity) => Array.isArray(value) ? value.map((item, root) => stampIdentity(item, {...identity, root})) : value?.withIdentity ? value.withIdentity(identity) : value;
const stamp = (value, owner) => Array.isArray(value) ? value.map(item => stamp(item, owner)) : value?.withOwner ? value.withOwner(owner) : value;
export const Fragment = ({ children: value }) => ({...markup(children(value)), withOwner:owner => Fragment({children:stamp(value,owner)}), withIdentity:identity => Fragment({children:stampIdentity(Array.isArray(value)?value:[value],identity)})});
export function jsx(type, props = {}, key = props.key) {
  if (key !== undefined && key !== null && !(typeof key === 'string' && key.length || typeof key === 'number' && Number.isFinite(key))) throw Error('JSX key must be a nonempty string or finite number');
  props={...props,key:undefined};
  if (typeof type === 'function') {
    const value = type(props), owner = componentOwners.get(type);
    const owned = owner ? stamp(value, owner) : value;
    return key == null ? owned : stampIdentity(owned, {key, ...(owner ? {owner} : {})});
  }
  if (['script', 'style'].includes(type.toLowerCase())) throw Error(`Forbidden <${type}>; use tokens and utility classes`);
  const art=artworkSources.get(props.src ?? props.href ?? props['xlink:href']);
  if(art)props={...props,'data-adg-art':art};
  if (key != null) props = {...props, 'data-adg-keys':JSON.stringify([...(props['data-adg-keys'] ? JSON.parse(props['data-adg-keys']) : []), {key}])};
  const result = markup(`<${type}${attributes(props)}>${voids.has(type) ? '' : children(props.children) + `</${type}>`}`);
  result.withOwner = owner => jsx(type, {...props, 'data-adg-owners':JSON.stringify([...(props['data-adg-owners'] ? JSON.parse(props['data-adg-owners']) : []), owner])});
  result.withIdentity = identity => jsx(type, {...props, key:undefined, 'data-adg-keys':JSON.stringify([...(props['data-adg-keys'] ? JSON.parse(props['data-adg-keys']) : []), identity])});
  return result;
}
export const jsxs = jsx;
export function jsxDEV(type, props, key, isStatic, source) {
  try { return jsx(type, props, key); }
  catch (error) { if (!error.located && source) { error.message = `${source.fileName}:${source.lineNumber}:${source.columnNumber}: ${error.message}`; error.located = true; } throw error; }
}
export function Frame({ children: content, ...props }) { return { frame: true, ...props, html: children(content) }; }
export function Icon({ name, size = 16, class: className, ...props }) {
  const key = name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
  const geometry = icons[key];
  if (!geometry) throw Error(`Unknown Lucide icon ${name}`);
  return jsx('svg', { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75 * 24 / size, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: className, ...props, 'data-adg-icon':name, children: geometry.map(([tag, attrs]) => jsx(tag, attrs)) });
}
export function artwork(source, props, provenance) {
  if (provenance) props={...props,'data-adg-art':provenance};
  const match = source.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
  if (!match) throw Error('Invalid SVG artwork');
  let attrs = match[1];
  for (const key of Object.keys(props)) attrs = attrs.replace(new RegExp(`\\s${key}\\s*=\\s*(["']).*?\\1`, 'g'), '');
  const result = markup(`<svg${attrs}${attributes(props)}>${match[2]}</svg>`);
  result.withIdentity = identity => artwork(source, {...props, 'data-adg-keys':JSON.stringify([...(props['data-adg-keys'] ? JSON.parse(props['data-adg-keys']) : []), identity])}, provenance);
  result.withOwner = owner => artwork(source, {...props, 'data-adg-owners':JSON.stringify([...(props['data-adg-owners'] ? JSON.parse(props['data-adg-owners']) : []), owner])});
  return result;
}
