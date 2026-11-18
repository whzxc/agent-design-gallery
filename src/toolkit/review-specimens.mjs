import * as css from 'css-tree';
import { parseFragment, serialize } from 'parse5';

export function compileSpecimens({ built, theme }) {
  const properties = new Set(), styles = new Map(), templates = [];
  function scopedUnits(ast) {
    css.walk(ast, { visit: 'Dimension', enter(node, item) {
      if (/^[sld]?v(w|h|min|max)$/i.test(node.unit)) {
        const unit = node.unit.toLowerCase().replace(/^[sld]/, '');
        item.data = css.parse(`calc(${node.value} * var(--review-${unit}))`, { context: 'value' }).children.first;
      }
    } });
    return ast;
  }
  function compileStyle(source) {
    if (styles.has(source)) return styles.get(source).index;
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
    const index = styles.size;
    styles.set(source, { index, text: css.generate(ast) });
    return index;
  }
  function compileFrame(ref, size, side) {
    if (!ref) return null;
    const source = built[side].get(ref.source);
    const frame = source?.frames.find(frame => frame.name === ref.frame);
    if (!frame || !size) throw Error(`Missing ${side} source for ${ref.source}#${ref.frame}`);
    const fragment = parseFragment(frame.html);
    function scopeInlineStyles(node) {
      const style = node.attrs?.find(attr => attr.name === 'style');
      if (style && /[\d.]v(?:h|w|min|max)\b|[\d.][sld]v(?:h|w|min|max)\b/i.test(style.value)) {
        style.value = css.generate(scopedUnits(css.parse(style.value, { context: 'declarationList' })));
      }
      for (const child of node.childNodes ?? []) scopeInlineStyles(child);
    }
    scopeInlineStyles(fragment);
    const index = templates.length;
    const { width, height } = size;
    const widthStyle = frame.width ? `width:${frame.width}px;` : 'width:max-content;';
    const heightStyle = frame.height ? `height:${frame.height}px;` : '';
    const name = frame.name.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    templates.push(`<template id="frame-${index}"><review-document class="review-root" data-theme="${theme}"><review-body><div data-adg-frame="${name}" style="${widthStyle}${heightStyle}">${serialize(fragment)}</div></review-body></review-document></template>`);
    const defaults = source.cssAfterTokens;
    // Drop only the backdrop appended by ADG. Authored element and stylesheet paint stays intact.
    const stylesheet = defaults && source.css.endsWith(defaults)
      ? source.css.slice(0, -defaults.length) + defaults.replaceAll(';background:var(--canvas)', '')
      : source.css;
    return { template: index, style: compileStyle(stylesheet), width, height };
  }
  return { compileFrame, assets: () => ({ properties: [...properties], styles: [...styles.values()].map(style => style.text), templates }) };
}
