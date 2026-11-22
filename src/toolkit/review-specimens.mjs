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

export function compileSpecimens({ built, theme, inlineArt = false }) {
  const properties = new Set(), styles = [], scopedStyles = new Map(), rawStyles = new Map(), templates = [];
  function walk(node, visit) {
    visit(node);
    for (const child of node.childNodes ?? []) walk(child, visit);
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
  function storeStyle(source, raw = false) {
    const indexes = raw ? rawStyles : scopedStyles;
    if (indexes.has(source)) return indexes.get(source);
    const index = styles.length;
    styles.push(raw ? source : scopedStyle(source));
    indexes.set(source, index);
    return index;
  }
  function scopedStyle(source) {
    const ast = scopedUnits(css.parse(source));
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
    return css.generate(ast);
  }
  function compileFrame(ref, size, side) {
    if (!ref) return null;
    const source = built[side].get(ref.source);
    const frame = source?.frames.find(frame => frame.name === ref.frame);
    if (!frame || !size) throw Error(`Missing ${side} source for ${ref.source}#${ref.frame}`);
    const fragment = parseFragment(frame.html);
    let framed = false;
    if (inlineArt) walk(fragment, node => {
      const art = embeddedStylesheet(node);
      if (!art) return;
      framed = true;
      // Keep the link's position and media while storing the bytes once per review.
      art.href.name = 'data-review-style';
      art.href.value = String(storeStyle(art.text, true));
    });
    function scopeInlineStyles(node) {
      const style = node.attrs?.find(attr => attr.name === 'style');
      if (style && /[\d.]v(?:h|w|min|max)\b|[\d.][sld]v(?:h|w|min|max)\b/i.test(style.value)) {
        style.value = css.generate(scopedUnits(css.parse(style.value, { context: 'declarationList' })));
      }
    }
    if (!framed) walk(fragment, scopeInlineStyles);
    const index = templates.length;
    const { width, height } = size;
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
    return { template: index, style: storeStyle(stylesheet, framed), width, height, ...(framed && { framed }) };
  }
  return { compileFrame, assets: () => ({ properties: [...properties], styles, templates }) };
}
