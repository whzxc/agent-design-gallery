import { escape } from './runtime.mjs';

/** The builder and operation-local proof use the same exact document construction. */
export function frameDocument(frame, theme, css) {
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div data-adg-frame="${escape(frame.name)}" style="${frame.width ? `width:${frame.width}px;` : 'width:max-content;'}${frame.height ? `height:${frame.height}px;` : ''}">${frame.html}</div></body></html>`;
}
