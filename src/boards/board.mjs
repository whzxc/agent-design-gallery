import { escape } from '../toolkit/html.mjs';

export const boardWidth = 1680;
export const specimenWidth = 1184;
export const boardCss = `
[data-adg-board]{--adg-surface:var(--surface,#fff);--adg-canvas:var(--canvas,#f2f2f0);--adg-text:var(--text,#202020);--adg-muted:var(--text-tertiary,var(--text-secondary,#737373));--adg-border:var(--border,#dededb);box-sizing:border-box;width:1680px;padding:64px 80px 80px;background:var(--adg-surface);color:var(--adg-text);font:16px/normal var(--font-ui,system-ui,sans-serif)}
[data-adg-board] *,[data-adg-board] *::before,[data-adg-board] *::after{box-sizing:border-box}
[data-adg-header]{display:grid;grid-template-columns:1fr 440px;align-items:end;gap:64px;padding-bottom:56px}
[data-adg-header] h1{margin:16px 0 0;font-size:48px;line-height:56px;font-weight:600;letter-spacing:-.02em}
[data-adg-eyebrow]{display:flex;align-items:center;gap:12px;margin:0;font-size:var(--text-caption,11px);font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--adg-muted)}
[data-adg-number]{display:grid;place-items:center;min-width:28px;height:28px;padding:0 6px;border-radius:var(--radius-pill,999px);background:var(--action,var(--adg-text));color:var(--on-action,var(--surface,#fff));font-family:var(--font-mono,monospace);letter-spacing:0}
[data-adg-counts]{margin:0;font-size:var(--text-body,var(--text-small,13px));line-height:1.6;color:var(--text-secondary,#666)}
[data-adg-section]{display:grid;grid-template-columns:280px minmax(0,1fr);gap:56px;border-top:1px solid var(--adg-border);padding:48px 0}
[data-adg-section-label] h2{margin:0;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
[data-adg-source]{display:flex;align-items:flex-start;gap:6px;margin-top:20px;color:var(--adg-muted);font:var(--text-caption,11px)/1.6 var(--font-mono,monospace);overflow-wrap:anywhere}
[data-adg-source] svg{flex-shrink:0;margin-top:2px}
[data-adg-section-content]{min-width:0}
[data-adg-specimens]{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:32px 24px;align-items:start}
[data-adg-specimens]>figure{margin:0;min-width:0;display:flex;flex-direction:column;gap:12px;grid-column:span var(--adg-span,12)}
[data-adg-well]{display:flex;align-items:center;justify-content:center;min-height:96px;padding:32px 24px;border-radius:var(--radius-card,var(--radius-menu,12px));background:var(--adg-canvas);overflow:hidden}
[data-adg-well]>[data-adg-frame]{flex-shrink:0}
[data-adg-specimens] figcaption{display:flex;flex-direction:column;gap:2px;font:var(--text-meta,12px)/17px var(--font-mono,monospace);overflow-wrap:anywhere}
[data-adg-specimens] figcaption small{font:var(--text-meta,12px)/17px var(--font-ui,system-ui,sans-serif);color:var(--adg-muted)}
`;
export function boardHeader({title, projectName, layer, number=1, sourceCount, frameCount, countLabel='frames'}) {
  return `<header data-adg-header><div><p data-adg-eyebrow><span data-adg-number>${String(number).padStart(2,'0')}</span>${escape(projectName)} · ${escape(layer)}</p><h1>${escape(title)}</h1></div><p data-adg-counts>${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'} · ${frameCount} ${countLabel}</p></header>`;
}
export function sectionMarkup({title, source, content}) {
  return `<section data-adg-section="${escape(source)}"><div data-adg-section-label><h2>${escape(title)}</h2><div data-adg-source><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13l-2 2 2 2m6-4 2 2-2 2"/></svg><span>${escape(source)}</span></div></div><div data-adg-section-content>${content}</div></section>`;
}
