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
const componentOwners = new WeakMap();
export function registerComponent(component, source, name) {
  if (typeof component === 'function' && !componentOwners.has(component)) componentOwners.set(component, {source, export:name});
}
const stamp = (value, owner) => Array.isArray(value) ? value.map(item => stamp(item, owner)) : value?.withOwner ? value.withOwner(owner) : value;
export const Fragment = ({ children: value }) => ({...markup(children(value)), withOwner:owner => Fragment({children:stamp(value,owner)})});
export function jsx(type, props = {}) {
  if (typeof type === 'function') {
    const value = type(props), owner = componentOwners.get(type);
    return owner ? stamp(value, owner) : value;
  }
  if (['script', 'style'].includes(type.toLowerCase())) throw Error(`Forbidden <${type}>; use tokens and utility classes`);
  const result = markup(`<${type}${attributes(props)}>${voids.has(type) ? '' : children(props.children) + `</${type}>`}`);
  result.withOwner = owner => jsx(type, {...props, 'data-adg-owners':JSON.stringify([...(props['data-adg-owners'] ? JSON.parse(props['data-adg-owners']) : []), owner])});
  return result;
}
export const jsxs = jsx;
export function jsxDEV(type, props, key, isStatic, source) {
  try { return jsx(type, props); }
  catch (error) { if (!error.located && source) { error.message = `${source.fileName}:${source.lineNumber}:${source.columnNumber}: ${error.message}`; error.located = true; } throw error; }
}
export function Frame({ children: content, ...props }) { return { frame: true, ...props, html: children(content) }; }
export function Icon({ name, size = 16, class: className, ...props }) {
  const key = name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
  const geometry = icons[key];
  if (!geometry) throw Error(`Unknown Lucide icon ${name}`);
  return jsx('svg', { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75 * 24 / size, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: className, ...props, children: geometry.map(([tag, attrs]) => jsx(tag, attrs)) });
}
export function artwork(source, props) {
  const match = source.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
  if (!match) throw Error('Invalid SVG artwork');
  let attrs = match[1];
  for (const key of Object.keys(props)) attrs = attrs.replace(new RegExp(`\\s${key}\\s*=\\s*(["']).*?\\1`, 'g'), '');
  const result = markup(`<svg${attrs}${attributes(props)}>${match[2]}</svg>`);
  result.withOwner = owner => artwork(source, {...props, 'data-adg-owners':JSON.stringify([...(props['data-adg-owners'] ? JSON.parse(props['data-adg-owners']) : []), owner])});
  return result;
}
