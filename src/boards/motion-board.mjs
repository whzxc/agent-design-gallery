import { escape } from '../toolkit/html.mjs';
import { patternParameters } from '../toolkit/motion-patterns.mjs';
import { milliseconds, tokenValue } from '../toolkit/motion-primitives.mjs';

export const motionBoardCss = `
[data-motion-patterns]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start;margin-bottom:40px}
[data-motion-pattern]{display:flex;flex-direction:column;gap:12px;padding:20px;border:1px solid var(--adg-border);border-radius:var(--radius-card,12px);min-width:0}
[data-motion-pattern] h3,[data-motion-pattern] p{margin:0}
[data-motion-pattern] h3{font-size:17px}
[data-motion-pattern] p,[data-motion-pattern] dl{font:13px/1.5 var(--font-ui,system-ui);color:var(--adg-muted)}
[data-motion-pattern] dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;margin:0}
[data-motion-pattern] dd{margin:0;overflow-wrap:anywhere}
[data-motion-pattern] code{font:12px/1.5 var(--font-mono,monospace)}
[data-motion-pattern] h4{margin:0;font-size:14px;line-height:1.4}
[data-motion-variants]{display:flex;flex-direction:column;gap:10px}
[data-motion-variant]{display:grid;gap:6px;padding-top:10px;border-top:1px solid var(--adg-border)}
[data-motion-default]{font:11px/1.5 var(--font-ui,system-ui);white-space:nowrap;color:var(--adg-text)}
[data-motion-unadopted]{margin-top:32px;border-top:1px solid var(--adg-border)}
[data-motion-unadopted] summary{padding:16px 0;pointer-events:auto;cursor:pointer;font-size:14px;font-weight:600}
[data-motion-unadopted] summary span{margin-left:8px;color:var(--adg-muted);font-weight:400}
[data-motion-pattern] button,[data-motion-stage][tabindex]{pointer-events:auto;cursor:pointer}
[data-motion-stage]{display:grid;place-items:center;position:relative;min-width:0;height:116px;overflow:hidden;border-radius:8px;background:var(--adg-canvas);color:var(--action,var(--adg-text))}
[data-motion-stage][data-effect=follow]{touch-action:none;cursor:crosshair}
[data-motion-stage][data-effect=avoid]{display:flex;flex-direction:column;justify-content:center;gap:6px}
[data-motion-shape]{width:52px;height:34px;border-radius:8px;background:currentColor}
[data-effect=expand] [data-motion-shape]{height:58px;width:86px;transform-origin:top}
[data-effect=avoid] [data-motion-shape]{height:18px;width:54%}
[data-motion-sibling]{opacity:.38}
[data-motion-sibling][hidden]{display:none}
[data-effect=follow] [data-motion-shape]{width:20px;height:20px;border-radius:50%;pointer-events:none}
[data-effect=crossfade] [data-motion-shape]{position:absolute;display:grid;place-items:center;color:var(--on-action,var(--adg-surface));background:var(--action,var(--adg-text));font-size:13px}
[data-effect=crossfade] [data-motion-shape]:nth-child(2){opacity:0}
[data-effect=spin] [data-motion-shape]{width:32px;height:32px;border-radius:50%;background:none;border:3px solid var(--adg-border);border-top-color:currentColor}
[data-effect=stagger]{grid-auto-flow:column;justify-content:center;gap:8px}
[data-effect=stagger] [data-motion-shape]{width:22px;height:34px}
[data-effect=aurora] [data-motion-shape]{position:relative;overflow:hidden;width:104px;height:52px;background:var(--adg-surface);isolation:isolate}
[data-motion-aurora]{position:absolute;inset:-100%;z-index:-1;background:conic-gradient(#576de8,#71c9ad,#e8b279,#ac71ce,#576de8)}
[data-effect=aurora] [data-motion-shape]::after{content:"";position:absolute;inset:3px;border-radius:6px;background:var(--adg-surface)}
[data-effect=shimmer] [data-motion-shape]{width:100px;background:linear-gradient(105deg,currentColor 28%,var(--adg-surface) 50%,currentColor 72%);background-size:250% 100%}
[data-motion-reduced]{display:none!important}
@media(prefers-reduced-motion:reduce){[data-motion-reduced]{display:block!important}}
`;

const shape = '<span data-motion-shape></span>';
const stageShapes = {
  crossfade: '<span data-motion-shape>A</span><span data-motion-shape>B</span>',
  avoid: '<span data-motion-shape data-motion-sibling hidden></span>' + shape + shape,
  stagger: shape.repeat(3),
  aurora: '<span data-motion-shape><span data-motion-aurora></span></span>',
};
const title = id => id.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
const json = value => escape(JSON.stringify(value));
const pair = (name, value) => '<dt>' + escape(name) + '</dt><dd>' + value + '</dd>';

export function motionCards(catalog, inventory, source, prefix) {
  const asset = name => prefix && name.startsWith(prefix + '/') ? name.slice(prefix.length + 1) : name;
  const frameLink = ref => '?' + new URLSearchParams({ asset: asset(ref.source), frame: ref.frame });
  const codeLink = (file, line, label) =>
    '<a data-motion-code href="' + escape('api/motion-code?' + new URLSearchParams({ source: file, line })) + '">' + escape(label) + '</a>';
  const listConsumer = ref => {
    if (ref.type === 'code') return codeLink(ref.source, ref.line, ref.source + ':' + ref.line);
    const frame = '<a href="' + escape(frameLink(ref)) + '">' + escape(ref.frame + ' · ' + ref.source) + '</a>';
    return ref.type === 'edge' ? codeLink(ref.sidecar, ref.line, ref.id) + ' · ' + frame : frame;
  };
  const countLabel = count => 'Used in ' + count + (count === 1 ? ' place' : ' places');
  const uses = id => inventory.consumers.get(id) ?? [];
  const usage = (id, refs, prefix = '') => refs.length
    ? '<button type="button" data-motion-consumers="' + escape(title(id)) + '" aria-label="' +
      escape(title(id) + ' · ' + countLabel(refs.length)) + '">' + prefix + countLabel(refs.length) +
      '</button><template><ul>' + refs.map(ref => '<li>' + listConsumer(ref) + '</li>').join('') + '</ul></template>'
    : '<p>' + countLabel(0) + '</p>';
  const describe = params => Object.entries(params).map(([key,value]) => {
    const spring = catalog.springs.light[value];
    const light = tokenValue(catalog.tokens, 'light', value);
    const dark = tokenValue(catalog.tokens, 'dark', value);
    const label = spring ? spring.duration + ' ms / bounce ' + spring.bounce : light;
    const darkSpring = catalog.springs.dark[value];
    const themeLabel = darkSpring ? darkSpring.duration + ' ms / bounce ' + darkSpring.bounce : dark;
    const fallback = catalog.defaultTokens.has(value) || (spring &&
      ['-duration','-bounce'].some(suffix => catalog.defaultTokens.has(value + suffix)));
    return escape(key) + ' <code>' + escape(value) + '</code>' +
      (label === undefined ? '' : ' · ' + escape(label)) + (label === themeLabel ? '' : ' / dark ' + escape(themeLabel)) +
      (fallback ? ' <span data-motion-default>ADG default</span>' : '');
  }).join('<br>');
  const equal = (left, right) => Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([key, value]) => right[key] === value);
  const deltas = (base, variant, phase) => {
    const inherited = patternParameters(base, phase);
    return Object.fromEntries(Object.entries(patternParameters(variant, phase)).filter(([key, value]) => inherited[key] !== value));
  };
  const variantRow = (base, id) => {
    const variant = catalog.patterns.get(id);
    const enter = deltas(base, variant, 'enter'), exit = deltas(base, variant, 'exit');
    const overrides = equal(enter, exit)
      ? (Object.keys(enter).length ? pair('Overrides', describe(enter)) : '')
      : (Object.keys(enter).length ? pair('Enter', describe(enter)) : '') +
        (Object.keys(exit).length ? pair('Exit', describe(exit)) : '');
    return '<div data-motion-variant="' + escape(id) + '"><h4>' + title(id) + '</h4>' +
      (overrides ? '<dl>' + overrides + '</dl>' : '<p>Inherits base parameters</p>') +
      '<div>' + usage(id, uses(id)) + '</div></div>';
  };
  const render = (id, pattern) => {
    const directions = ['enter','exit'];
    const themeValues = (theme, direction) => {
      const params = patternParameters(pattern, direction);
      const value = key => tokenValue(catalog.tokens, theme, params[key]);
      const spring = catalog.springs[theme][params.spring];
      return {
        duration: spring?.duration ?? milliseconds(value('duration')), easing: spring?.easing ?? value('easing'),
        distance: value('distance'), scale: Number(value('scale') ?? .85), stagger: milliseconds(value('stagger')) || 0,
        opacity: params.fromOpacity ?? 0,
      };
    };
    const preview = Object.fromEntries(['light','dark'].map(theme =>
      [theme, Object.fromEntries(directions.map(direction => [direction, themeValues(theme, direction)]))]));
    const primary = pattern.action === 'exit' ? 'exit' : 'enter';
    const alternate = primary === 'enter' ? 'exit' : 'enter';
    const main = patternParameters(pattern, primary), other = patternParameters(pattern, alternate);
    const asymmetric = !equal(main, other);
    const variants = catalog.variants.get(id) ?? [];
    const direct = uses(id);
    const total = new Set([id, ...variants].flatMap(uses).map(ref =>
      JSON.stringify([ref.type, ref.source, ref.frame, ref.id, ref.line, ref.match]))).size;
    const adoption = variants.length
      ? '<p data-motion-family-count>' + countLabel(total) + '</p>' +
        (direct.length ? '<div>' + usage(id, direct, 'Base · ') + '</div>' : '') +
        '<div data-motion-variants>' + variants.map(child => variantRow(pattern, child)).join('') + '</div>'
      : usage(id, direct);
    return '<article data-motion-pattern="' + escape(id) + '" data-specimen="' + escape(source + '#' + id) + '">' +
      '<h3>' + title(id) + '</h3><p>' + escape(pattern.kind + ' · ' + pattern.action) + '</p>' +
      '<div data-motion-stage data-effect="' + escape(pattern.effect) + '" data-action="' + escape(pattern.action) +
      '" data-preview="' + json(preview) + '"' +
      (pattern.effect === 'follow' ? ' role="group" tabindex="0" aria-label="Follow specimen. Move the pointer or use the arrow keys."' : ' aria-hidden="true"') +
      '>' + (stageShapes[pattern.effect] ?? shape) + '</div>' +
      (pattern.effect === 'avoid' ? '<button type="button" data-motion-avoid aria-pressed="false">Insert sibling</button>' : '') +
      '<p data-motion-reduced>Reduced motion · ' + escape(pattern.reduced) + '</p><dl>' +
      pair('Properties', escape(pattern.properties.join(', '))) +
      pair(asymmetric ? title(primary) : 'Parameters', describe(main)) +
      (asymmetric ? pair(title(alternate), describe(other)) : '') +
      pair('Interrupt', escape(pattern.interrupt)) + pair('Reduced motion', escape(pattern.reduced)) + '</dl>' +
      adoption + '</article>';
  };
  const grid = cards => '<div data-motion-patterns>' + cards.join('') + '</div>';
  const adopted = [], notAdopted = [];
  for (const [id, pattern] of catalog.patterns) {
    if (pattern.extends) continue;
    const unused = catalog.variants.has(id) && ![id, ...catalog.variants.get(id)].some(key => uses(key).length);
    (unused ? notAdopted : adopted).push(render(id, pattern));
  }
  return {
    adopted: adopted.length ? grid(adopted) : '',
    notAdopted: notAdopted.length ? '<details data-motion-unadopted><summary>Not adopted <span>' +
      notAdopted.length + '</span></summary>' + grid(notAdopted) + '</details>' : '',
  };
}
