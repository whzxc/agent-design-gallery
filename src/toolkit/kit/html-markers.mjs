import { decodeHTML } from 'entities';
import { escape } from '../html.mjs';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function readAttr(attrsText, attrName) {
  const regex = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = regex.exec(attrsText);
  return match ? decodeHTML(match[1] ?? match[2] ?? '') : null;
}

function setAttr(attrsText, attrName, value) {
  const regex = new RegExp(`((?:^|\\s)${attrName}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
  const encoded = `"${escape(value)}"`;
  if (regex.test(attrsText)) {
    return attrsText.replace(regex, (_, prefix) => `${prefix}${encoded}`);
  }
  return `${attrsText} ${attrName}=${encoded}`;
}

function scanTagEnd(html, start) {
  let quote = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
}

/**
 * Unwraps `<adg-owner data-o="...">` and `<adg-key data-k="...">` marker elements
 * emitted around React components, merging provenance onto the first real root element
 * child(ren) without triggering HTML5 table/SVG foster parenting.
 */
export function unwrapAdgMarkers(html) {
  if (!html.includes('<adg-owner') && !html.includes('<adg-key')) return html;

  const out = [];
  const stack = [];
  let cursor = 0;

  while (cursor < html.length) {
    const lt = html.indexOf('<', cursor);
    if (lt === -1) {
      out.push(html.slice(cursor));
      break;
    }
    if (lt > cursor) out.push(html.slice(cursor, lt));

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const stop = end === -1 ? html.length : end + 3;
      out.push(html.slice(lt, stop));
      cursor = stop;
      continue;
    }

    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = scanTagEnd(html, lt + 2);
      const stop = end === -1 ? html.length : end + 1;
      out.push(html.slice(lt, stop));
      cursor = stop;
      continue;
    }

    if (html.startsWith('</', lt)) {
      const end = scanTagEnd(html, lt + 2);
      if (end === -1) {
        out.push(html.slice(lt));
        break;
      }
      const tagName = html.slice(lt + 2, end).trim().toLowerCase();
      if (tagName === 'adg-owner' || tagName === 'adg-key') {
        const expectedKind = tagName === 'adg-owner' ? 'owner' : 'key';
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].kind === expectedKind) {
            stack.splice(i, 1);
            break;
          }
        }
      } else {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].depth > 0) stack[i].depth--;
        }
        out.push(html.slice(lt, end + 1));
      }
      cursor = end + 1;
      continue;
    }

    const nameMatch = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(lt));
    if (!nameMatch) {
      out.push('<');
      cursor = lt + 1;
      continue;
    }

    const end = scanTagEnd(html, lt + 1 + nameMatch[1].length);
    if (end === -1) {
      out.push(html.slice(lt));
      break;
    }

    const rawTagName = nameMatch[1];
    const tagName = rawTagName.toLowerCase();
    let rawAttrs = html.slice(lt + 1 + rawTagName.length, end);
    const trimmedAttrs = rawAttrs.trimEnd();
    const selfClosing = trimmedAttrs.endsWith('/');
    if (selfClosing) {
      rawAttrs = trimmedAttrs.slice(0, -1);
    }

    if (tagName === 'adg-owner') {
      const encoded = readAttr(rawAttrs, 'data-o');
      if (encoded) {
        stack.push({ kind: 'owner', data: JSON.parse(encoded), depth: 0 });
      }
      cursor = end + 1;
      continue;
    }

    if (tagName === 'adg-key') {
      const encoded = readAttr(rawAttrs, 'data-k');
      if (encoded) {
        stack.push({ kind: 'key', data: JSON.parse(encoded), depth: 0 });
      }
      cursor = end + 1;
      continue;
    }

    const ownersToAdd = [];
    const keysToAdd = [];
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].depth === 0) {
        if (stack[i].kind === 'owner') ownersToAdd.push(stack[i].data);
        else keysToAdd.push(stack[i].data);
      }
    }

    let nextAttrs = rawAttrs;
    if (ownersToAdd.length) {
      const existingRaw = readAttr(nextAttrs, 'data-adg-owners');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      nextAttrs = setAttr(nextAttrs, 'data-adg-owners', JSON.stringify([...existing, ...ownersToAdd]));
    }
    if (keysToAdd.length) {
      const existingRaw = readAttr(nextAttrs, 'data-adg-keys');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      nextAttrs = setAttr(nextAttrs, 'data-adg-keys', JSON.stringify([...existing, ...keysToAdd]));
    }

    if (!selfClosing && !VOID_TAGS.has(tagName)) {
      for (let i = 0; i < stack.length; i++) stack[i].depth++;
    }

    out.push(`<${rawTagName}${nextAttrs}${selfClosing ? ' />' : '>'}`);
    cursor = end + 1;
  }

  return out.join('');
}
