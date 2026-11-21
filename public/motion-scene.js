// Only the viewer writes to the document. Parse in an inert template before attachment.
export async function createStage(parent) {
  const frame = document.createElement('iframe');
  frame.title = 'Transition specimen';
  frame.setAttribute('sandbox', 'allow-same-origin');
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'"><style></style><body></body>`;
  parent.append(frame);
  await loaded;
  return frame;
}

export async function mountScene(doc, endpoint, theme) {
  const template = doc.createElement('template');
  template.innerHTML = endpoint.html;
  const fragment = template.content;
  for (const el of fragment.querySelectorAll(
    'script,style,meta,base,link,iframe,frame,object,embed,portal,fencedframe,foreignObject,template,audio,video,animate,animateTransform,animateMotion,set'
  ))
    el.remove();
  for (const el of fragment.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name === 'href' && el.localName === 'a' && !el.hasAttribute('tabindex')) el.tabIndex = 0;
      if (
        /^on/.test(name) ||
        [
          'action',
          'formaction',
          'target',
          'srcset',
          'srcdoc',
          'ping',
          'download',
          'autofocus',
          'popover',
          'popovertarget',
          'contenteditable',
          'is'
        ].includes(name) ||
        (['href', 'xlink:href', 'src'].includes(name) &&
          !(
            (el.localName === 'use' && attr.value.startsWith('#')) ||
            (['img', 'image'].includes(el.localName) && /^data:image\//i.test(attr.value))
          ))
      )
        el.removeAttribute(attr.name);
    }
    if (el.matches('input,textarea')) el.readOnly = true;
  }
  doc.documentElement.dataset.theme = theme;
  doc.head.querySelector('style').textContent =
    endpoint.css +
    '\n*,*::before,*::after {animation:none!important;transition:none!important;caret-color:transparent!important}';
  const stage = doc.createElement('div');
  stage.dataset.adgFrame = endpoint.frame;
  Object.assign(stage.style, {
    width: endpoint.width ? endpoint.width + 'px' : 'max-content',
    height: endpoint.height ? endpoint.height + 'px' : ''
  });
  stage.append(fragment);
  doc.body.replaceChildren(stage);
  await Promise.all([doc.fonts.ready, ...[...doc.images].map((img) => img.decode().catch(() => {}))]);
  return stage;
}

export function observeScene(stage, design, freeze = false) {
  const root = stage.firstElementChild,
    doc = stage.ownerDocument;
  const elements = [root, ...root.querySelectorAll('*')],
    indexes = new Map(elements.map((el, i) => [el, i]));
  return elements.map((el, i) => {
    const rect = el.getBoundingClientRect(),
      css = doc.defaultView.getComputedStyle(el);
    const row = {
      el,
      i,
      parent: indexes.get(el.parentElement) ?? -1,
      box: [rect.x, rect.y, rect.width, rect.height],
      parts: JSON.parse(el.dataset.adgOwners ?? '[]').map(
        (o) => (design ? design + '/' : '') + o.source + '#' + o.export
      ),
      keys: JSON.parse(el.dataset.adgKeys ?? '[]'),
      anchor: el.dataset.adgId ?? null,
      opacity: Number(css.opacity)
    };
    if (freeze) {
      row.paint = el.cloneNode(false);
      for (const name of ['data-adg-id', 'data-adg-owners', 'data-adg-keys']) row.paint.removeAttribute(name);
      if (el.localName === 'input') row.paint.value = el.value;
      const cssText = (style) => Array.from(style, (prop) => prop + ':' + style.getPropertyValue(prop) + ';').join('');
      row.paint.style.cssText = cssText(css);
      row.pseudos = [];
      for (const pseudo of ['before', 'after']) {
        const style = doc.defaultView.getComputedStyle(el, '::' + pseudo);
        if (!['none', 'normal'].includes(style.content)) row.pseudos.push({ pseudo, css: cssText(style) });
      }
      row.children = [...el.childNodes].map((n) =>
        n.nodeType === 1 ? indexes.get(n) : n.nodeType === 3 ? n.textContent : ''
      );
      row.runs = [];
      for (const [index, n] of [...el.childNodes].entries())
        if (n.nodeType === 3 && n.textContent.trim()) {
          const range = doc.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          row.runs.push({ index, text: n.textContent, box: [r.x, r.y, r.width, r.height] });
        }
      row.text = el.textContent;
      row.localSize = [el.offsetWidth ?? rect.width, el.offsetHeight ?? rect.height];
      row.matrix = new DOMMatrix();
      let clip = [-Infinity, -Infinity, Infinity, Infinity];
      for (let p = el; p; p = p.parentElement) {
        const style = doc.defaultView.getComputedStyle(p);
        if (style.transform !== 'none') row.matrix = new DOMMatrix(style.transform).multiply(row.matrix);
        if (style.clipPath !== 'none') row.clipped = true;
        if (p === el) continue;
        const b = p.getBoundingClientRect();
        if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
          clip[0] = Math.max(clip[0], b.left);
          clip[2] = Math.min(clip[2], b.right);
        }
        if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
          clip[1] = Math.max(clip[1], b.top);
          clip[3] = Math.min(clip[3], b.bottom);
        }
      }
      row.clip = [
        Math.max(0, clip[1] - rect.top),
        Math.max(0, rect.right - clip[2]),
        Math.max(0, rect.bottom - clip[3]),
        Math.max(0, clip[0] - rect.left)
      ];
      row.clipped ||= row.clip.some((x) => x > 0) || !Number.isFinite(row.matrix.inverse().a);
    }
    return row;
  });
}
