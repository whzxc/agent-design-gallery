import * as css from 'css-tree';
import { parseFragment, serialize } from 'parse5';
import { embeddedArtStylesheet } from '../../public/art-styles.js';

function embeddedStylesheet(node) {
  if (node.tagName !== 'link' || node.attrs.some(attr => attr.name === 'disabled') ||
      node.attrs.find(attr => attr.name === 'rel')?.value.toLowerCase() !== 'stylesheet') return null;
  const href = node.attrs.find(attr => attr.name === 'href');
  const text = embeddedArtStylesheet(href?.value);
  return text === null ? null : { href, text };
}

function normalizeFamily(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function parseArtStylesheet(text) {
  try {
    const ast = css.parse(text);
    const fontFaces = new Map();
    const properties = [];
    const remaining = [];
    ast.children.forEach(node => {
      if (node.type === 'Atrule' && node.name.toLowerCase() === 'font-face' && node.block) {
        let family = '';
        css.walk(node.block, { visit: 'Declaration', enter(decl) {
          if (decl.property.toLowerCase() === 'font-family') family = normalizeFamily(css.generate(decl.value));
        } });
        const list = fontFaces.get(family) ?? [];
        list.push(css.generate(node));
        fontFaces.set(family, list);
      } else if (node.type === 'Atrule' && node.name.toLowerCase() === 'property') {
        properties.push(css.generate(node));
      } else {
        remaining.push(node);
      }
    });
    return { fontFaces, properties, remaining, unparseable: false };
  } catch {
    return { fontFaces: new Map(), properties: [], remaining: [], unparseable: true };
  }
}

function rle(ids) {
  const out = [];
  for (const id of ids) {
    const prev = out.at(-1);
    if (Array.isArray(prev) && prev[0] + prev[1] === id) prev[1]++;
    else if (typeof prev === 'number' && prev + 1 === id) out[out.length - 1] = [prev, 2];
    else out.push(id);
  }
  return out;
}

export function compileSpecimens({ built, theme, inlineArt = false }) {
  const properties = new Set();
  const styleChunks = [], chunkMap = new Map();
  const styles = [], scopedStyles = new Map(), rawStyles = new Map();
  const templates = [], pending = [];
  let finalized = false;

  function walk(node, visit, parent = null) {
    visit(node, parent);
    for (const child of node.childNodes ?? []) walk(child, visit, node);
  }

  function scopedUnits(ast) {
    css.walk(ast, { visit: 'Dimension', enter(node, item) {
      if (/^[sld]?v(w|h|min|max)$/i.test(node.unit)) {
        const unit = node.unit.toLowerCase().replace(/^[sld]/, '');
        item.data = css.parse(`calc(${node.value} * var(--review-${unit}))`, { context: 'value' }).children.first;
      }
    } });
    return ast;
  }

  function scopeAst(ast) {
    scopedUnits(ast);
    css.walk(ast, (node, item, list) => {
      if (node.type === 'Atrule' && node.name === 'property') {
        properties.add(css.generate(node));
        list.remove(item);
      } else if (node.type === 'PseudoClassSelector' && ['root', 'host'].includes(node.name) && !node.children) {
        item.data = { type: 'ClassSelector', name: 'review-root' };
      } else if (node.type === 'TypeSelector' && ['html', 'body'].includes(node.name)) {
        node.name = node.name === 'html' ? 'review-document' : 'review-body';
      }
    });
    return ast;
  }

  function internChunk(text) {
    let id = chunkMap.get(text);
    if (id === undefined) {
      id = styleChunks.length;
      styleChunks.push(text);
      chunkMap.set(text, id);
    }
    return id;
  }

  function storeStyle(source, raw = false) {
    const indexes = raw ? rawStyles : scopedStyles;
    if (indexes.has(source)) return indexes.get(source);
    let spec;
    try {
      const ast = raw ? css.parse(source) : scopeAst(css.parse(source));
      spec = [];
      ast.children.forEach(node => {
        if (node.type === 'Atrule' && node.name === 'layer' && node.block) {
          const head = '@layer' + (node.prelude ? ' ' + css.generate(node.prelude) : '');
          const ids = [];
          node.block.children.forEach(child => ids.push(internChunk(css.generate(child))));
          spec.push([head, rle(ids)]);
        } else {
          spec.push(internChunk(css.generate(node)));
        }
      });
    } catch {
      spec = [internChunk(source)];
    }
    const index = styles.length;
    styles.push(spec);
    indexes.set(source, index);
    return index;
  }

  function scopeInlineStyles(node) {
    const style = node.attrs?.find(attr => attr.name === 'style');
    if (style && /[\d.]v(?:h|w|min|max)\b|[\d.][sld]v(?:h|w|min|max)\b/i.test(style.value)) {
      style.value = css.generate(scopedUnits(css.parse(style.value, { context: 'declarationList' })));
    }
  }

  function compileFrame(ref, size, side) {
    if (!ref) return null;
    const source = built[side].get(ref.source);
    const frame = source?.frames.find(frame => frame.name === ref.frame);
    if (!frame || !size) throw Error(`Missing ${side} source for ${ref.source}#${ref.frame}`);
    const fragment = parseFragment(frame.html);
    const artLinks = [];
    walk(fragment, (node, parent) => {
      const art = embeddedStylesheet(node);
      if (!art) return;
      const media = node.attrs.find(attr => attr.name === 'media')?.value?.trim() || null;
      artLinks.push({ node, parent, href: art.href, media, text: art.text, parsed: parseArtStylesheet(art.text) });
    });
    const index = pending.length;
    const descriptor = { template: index, style: 0, width: size.width, height: size.height };
    pending.push({ index, descriptor, fragment, frame, source, artLinks });
    return descriptor;
  }

  function finalize() {
    if (finalized) return;
    finalized = true;

    // Only isolate revisions into iframe documents when the same font-family differs across frames.
    const familySignatures = new Map();
    for (const record of pending) {
      const perFrame = new Map();
      for (const link of record.artLinks) {
        if (link.parsed.unparseable || link.media) continue;
        for (const [family, rules] of link.parsed.fontFaces) {
          const list = perFrame.get(family) ?? [];
          list.push(...rules);
          perFrame.set(family, list);
        }
      }
      for (const [family, rules] of perFrame) {
        const signature = [...new Set(rules)].sort().join('\n');
        let seen = familySignatures.get(family);
        if (!seen) { seen = new Set(); familySignatures.set(family, seen); }
        seen.add(signature);
      }
    }
    const conflictingFamilies = new Set(
      [...familySignatures].filter(([family, seen]) => !family || seen.size > 1).map(([family]) => family),
    );

    for (const record of pending) {
      const { index, descriptor, fragment, frame, source, artLinks } = record;
      const hasConflict = artLinks.some(link =>
        link.parsed.unparseable ||
        (link.media && link.parsed.fontFaces.size > 0) ||
        [...link.parsed.fontFaces.keys()].some(family => !family || conflictingFamilies.has(family)));
      const framed = Boolean(inlineArt && hasConflict);

      if (framed) {
        for (const link of artLinks) {
          // Keep the link's position and media while storing the bytes once per review.
          link.href.name = 'data-review-style';
          link.href.value = String(storeStyle(link.text, true));
        }
        descriptor.framed = true;
      } else {
        const extraStyles = [];
        for (const link of artLinks) {
          if (hasConflict) continue;
          if (link.parent?.childNodes) {
            const position = link.parent.childNodes.indexOf(link.node);
            if (position !== -1) link.parent.childNodes.splice(position, 1);
          }
          for (const rule of link.parsed.properties) properties.add(rule);
          for (const rules of link.parsed.fontFaces.values()) for (const rule of rules) properties.add(rule);
          if (link.parsed.remaining.length) {
            const rawRemaining = link.parsed.remaining.map(node => css.generate(node)).join('');
            const scopedRemaining = link.media ? `@media ${link.media}{${rawRemaining}}` : rawRemaining;
            extraStyles.push(storeStyle(scopedRemaining, false));
          }
        }
        if (extraStyles.length) descriptor.extraStyles = extraStyles;
        walk(fragment, scopeInlineStyles);
      }

      const widthStyle = frame.width ? `width:${frame.width}px;` : 'width:max-content;';
      const heightStyle = frame.height ? `height:${frame.height}px;` : '';
      const name = frame.name.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      const body = `<div data-adg-frame="${name}" style="${widthStyle}${heightStyle}">${serialize(fragment)}</div>`;
      const content = framed ? body : `<review-document class="review-root" data-theme="${theme}"><review-body>${body}</review-body></review-document>`;
      templates.push(`<template id="frame-${index}">${content}</template>`);

      const defaults = source.cssAfterTokens;
      // Drop only the backdrop appended by ADG. Authored element and stylesheet paint stays intact.
      const stylesheet = defaults && source.css.endsWith(defaults)
        ? source.css.slice(0, -defaults.length) + defaults.replaceAll(';background:var(--canvas)', '')
        : source.css;
      descriptor.style = storeStyle(stylesheet, framed);
    }
  }

  return {
    compileFrame,
    assets: () => {
      finalize();
      return { properties: [...properties], styleChunks, styles, templates };
    },
  };
}
