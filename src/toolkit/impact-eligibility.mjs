import { parse } from 'parse5';
import { tokenize, tokenTypes as T } from 'css-tree';
import { decodeCssEscapes } from './token-reachability.mjs';

const svg = 'http://www.w3.org/2000/svg';
const scriptTags = new Set(['script', 'iframe', 'object', 'embed']);
const urlAttributes = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'codebase', 'cite', 'longdesc', 'profile', 'usemap', 'manifest']);
const svgPaintAttributes = new Set(['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile']);
const javascript = value => /^javascript:/i.test(value.replace(/[\u0000-\u0020]/g, ''));

// WHATWG srcset URLs consume non-whitespace bytes (including data-URL commas).
function srcsetUrls(value) {
  const urls = [];
  let i = 0;
  while (i < value.length) {
    while (/[\s,]/.test(value[i] ?? '') && i < value.length) i++;
    const start = i;
    while (i < value.length && !/\s/.test(value[i])) i++;
    const url = value.slice(start, i);
    if (url) urls.push(url.replace(/,+$/, ''));
    if (url.endsWith(',')) continue;
    let depth = 0;
    while (i < value.length) {
      const char = value[i++];
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (char === ',' && !depth) break;
    }
  }
  return urls;
}

/** Two parsed-document checks only; no browser, rendering, or environment certificate. */
export function createEligibilityChecker() {
  const resources = new Map(), stylesheets = new Map();
  function cssReasons(css) {
    if (stylesheets.has(css)) return stylesheets.get(css);
    const reasons = new Set(), stack = [];
    let importing = false;
    try {
      tokenize(css, (type, start, end) => {
        const raw = css.slice(start, end);
        if (type === T.BadString || type === T.BadUrl) reasons.add('unsupported_css');
        if (type === T.AtKeyword) importing = decodeCssEscapes(raw.slice(1)).toLowerCase() === 'import';
        if (type === T.Url) {
          for (const reason of urlReasons(decodeCssEscapes(raw.slice(raw.indexOf('(') + 1, raw.endsWith(')') ? -1 : undefined).trim()))) reasons.add(reason);
          importing = false;
        } else if (type === T.String) {
          if (raw.length < 2 || raw.at(-1) !== raw[0]) reasons.add('unsupported_css');
          if (importing || ['url', 'image', 'image-set', '-webkit-image-set'].includes(stack.at(-1)?.name)) {
            for (const reason of urlReasons(decodeCssEscapes(raw.slice(1, -1)))) reasons.add(reason);
          }
          importing = false;
        } else if (type === T.Function) {
          const name = decodeCssEscapes(raw.slice(0, -1)).toLowerCase();
          if (['var', 'attr'].includes(name) && stack.some(context => ['image', 'image-set', '-webkit-image-set'].includes(context?.name))) reasons.add('unsupported_css');
          stack.push({ name, start: end });
        }
        else if (type === T.LeftParenthesis) stack.push(null);
        else if (type === T.RightParenthesis) {
          const context = stack.pop();
          if (context?.name === 'url') {
            let value = css.slice(context.start, start).trim();
            if (/^['"]/.test(value)) value = value.slice(1, -1);
            for (const reason of urlReasons(decodeCssEscapes(value))) reasons.add(reason);
          }
        }
        else if (type === T.Semicolon) importing = false;
      });
      if (stack.length) reasons.add('unsupported_css');
    } catch { reasons.add('unsupported_css'); }
    const result = [...reasons].sort(); stylesheets.set(css, result); return result;
  }
  function urlReasons(value) {
    value = value.trim();
    if (javascript(value)) return ['dynamic_document'];
    if (value.startsWith('#')) return [];
    if (!/^data:/i.test(value)) return ['external_resource'];
    if (resources.has(value)) return resources.get(value);
    resources.set(value, []);
    let result = [];
    try {
      const comma = value.indexOf(',');
      if (comma < 0) return ['incomplete_identity'];
      const header = value.slice(5, comma), encoded = decodeURIComponent(value.slice(comma + 1));
      const text = /;base64(?:;|$)/i.test(header) ? Buffer.from(encoded, 'base64').toString('utf8') : encoded;
      if (/^(?:image\/svg\+xml|text\/html|application\/xhtml\+xml)(?:;|$)/i.test(header) || /^\s*<(?:svg|html|!doctype)/i.test(text)) result = htmlReasons(text);
      else if (/^text\/css(?:;|$)/i.test(header)) result = cssReasons(text);
    } catch { result = ['incomplete_identity']; }
    resources.set(value, result); return result;
  }
  function htmlReasons(document) {
    const reasons = new Set();
    try {
      const tree = parse(document);
      function visit(node) {
        const tag = node.tagName?.toLowerCase();
        if (scriptTags.has(tag)) reasons.add('dynamic_document');
        const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name.toLowerCase(), attr.value]));
        for (const attr of node.attrs ?? []) {
          const name = attr.name.toLowerCase(), value = attr.value;
          if (name.startsWith('on') || urlAttributes.has(name) && javascript(value)) reasons.add('dynamic_document');
          if (name === 'style') for (const reason of cssReasons(value)) reasons.add(reason);
          if (node.namespaceURI === svg && svgPaintAttributes.has(name)) for (const reason of cssReasons(value)) reasons.add(reason);
          if (['src', 'poster', 'background'].includes(name) || name === 'href' && (node.namespaceURI === svg || ['link', 'base'].includes(tag))) {
            for (const reason of urlReasons(value)) reasons.add(reason);
          }
          if (['srcset', 'imagesrcset'].includes(name)) for (const url of srcsetUrls(value)) for (const reason of urlReasons(url)) reasons.add(reason);
        }
        if (tag === 'meta' && attrs['http-equiv']?.toLowerCase() === 'refresh') {
          const url = /(?:^|;)\s*url\s*=\s*['"]?([^'"]+)/i.exec(attrs.content ?? '')?.[1];
          for (const reason of urlReasons(url ?? '')) reasons.add(reason);
        }
        // SMIL is allowed, but animated resource URLs still have to be closed.
        if (['animate', 'set'].includes(tag)) {
          for (const name of ['from', 'to', 'by', 'values']) if (attrs[name]) {
            if (['href', 'xlink:href', 'src'].includes(attrs.attributename?.toLowerCase())) {
              for (const url of attrs[name].split(';')) for (const reason of urlReasons(url)) reasons.add(reason);
            } else for (const reason of cssReasons(attrs[name])) reasons.add(reason);
          }
        }
        if (tag === 'style') for (const reason of cssReasons((node.childNodes ?? []).map(child => child.value ?? '').join(''))) reasons.add(reason);
        for (const child of node.childNodes ?? []) visit(child);
        if (node.content) visit(node.content);
      }
      visit(tree);
    } catch { reasons.add('incomplete_identity'); }
    return [...reasons].sort();
  }
  return htmlReasons;
}
