import { escape } from './html.mjs';
const esc = value => escape(value ?? '');
const ref = r => r ? r.source + '#' + r.frame : 'Unknown endpoint';
const target = t => t?.anchor ?? (t?.part ? t.part + (t.key == null ? '' : ' · ' + t.key) : 'frame');
const focus = f => typeof f === 'object' ? target(f?.target) : ({
  'restore-trigger': 'restore trigger, or frame when unavailable', preserve: 'preserve focus, or frame when unavailable'
}[f] ?? f);

export function motionCard(card, index, assets) {
  const sheet = !!assets;
  const sideHtml = name => {
    const side = card[name];
    if (!side) return '';
    const edge = side.edge;
    const label = name === 'before' ? 'Before' : 'After';
    const fallback = [side.fallback, ...(edge.unsupported ?? []).map(u => u.effect + ' · ' + u.reason)].filter(Boolean);
    return `<section class="motion-side"><h4>${label} · ${esc(edge.label ?? card.id)}</h4>
      <div>${esc(edge.gesture ?? edge.trigger?.on)} · ${esc(target(edge.trigger?.target))} · ${edge.proposed ? 'Proposed · ' + esc(edge.proposed) : 'Current'}</div>
      <code>${esc(ref(edge.from))} → ${esc(ref(edge.to))}</code>
      <div>Focus · ${esc(focus(edge.focus))}</div>
      ${side.error ? '<p role="alert">Partial · ' + esc(side.error) + '</p>' : `<div>${esc(edge.duration)} · ${side.duration} ms</div>
      ${fallback.length ? '<p>' + esc(fallback.join(' · ')) + '</p>' : ''}
      <div class="filmstrip">${side.samples.map(s => `<figure><img ${sheet ? 'src="' + assets[s.image] + '"' : 'data-image="' + s.image + '"'} alt="${label} at ${s.ms} ms"><figcaption>${s.state} ${s.ms} ms</figcaption></figure>`).join('')}</div>
      ${sheet ? '' : `<div class="motion-controls"><button data-play="${name}">Play ${name}</button><button data-preview="${name}">Preview ${name}</button><output data-elapsed="${name}">0 ms</output></div>`}`}
      </section>`;
  };
  const control = !sheet && (card.before?.samples || card.after?.samples);
  return `<article class="frame-card motion-card" data-motion="${index}" data-edge="${esc(card.id)}">
    <header class="card-head"><h3>${esc(card.after?.edge.label ?? card.before?.edge.label ?? card.id)}</h3><span>${esc(card.kind)}</span></header>
    <div class="motion-content"><code>${esc(card.id)}</code> · ${esc(card.reasons.join(' · '))}
    <div class="motion-sides">${sideHtml('before')}${sideHtml('after')}</div>
    ${control ? `<label class="motion-controls">Seek both sides <input type="range" min="0" max="100" value="0"></label>
    <div class="motion-stage"><img class="motion-cover" hidden alt="Source endpoint"></div><div role="status"></div>` : ''}</div></article>`;
}

export const motionStyle = `
.motion-card code,.motion-card h4 {overflow-wrap:anywhere}
.motion-content {padding:12px}
.motion-sides {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(270px,100%),1fr));gap:12px}
.motion-side {min-width:0}
.motion-card h4 {margin:10px 0 4px}
.filmstrip {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.filmstrip figure {min-width:0;flex:1 1 70px;margin:0}
.filmstrip img {width:100%;height:80px;object-fit:contain}
.filmstrip figcaption {font-size:11px;text-align:center}
.motion-controls {display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:8px 0}
.motion-controls button {border:1px solid var(--line);border-radius:6px;background:var(--panel);color:inherit;padding:4px 9px;cursor:pointer}
.motion-stage {position:relative;overflow:hidden}
.motion-stage iframe,.motion-cover {position:absolute;inset:0;border:0;transform-origin:top left;pointer-events:none}
.motion-cover {z-index:1}
`;
