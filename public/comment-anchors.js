const clamp = (value, size) => Math.min(size, Math.max(0, value ?? 0));

export function commentLabel(source, frame) {
  const label = source.replace(/\.[^./]+$/, '');
  return frame ? `${label}#${frame}` : label;
}

export function placeComment({ source = null, frame = null, layer = null, chapter = null, box,
  frameBox = null, element = null, owner = null, label }, point) {
  const kind = element ? 'element' : frame ? 'frame' : source ? 'source' : 'chapter';
  const tag = element?.tag ?? null, text = element?.text ?? null;
  const name = tag ? tag[0].toUpperCase() + tag.slice(1) : '';
  return {
    anchor: {
      kind, source, frame, layer, chapter, element: element ? { id: element.id } : null,
      x: clamp(point.x - box.x, box.width), y: clamp(point.y - box.y, box.height),
      frameX: frameBox ? clamp(point.x - frameBox.x, frameBox.width) : null,
      frameY: frameBox ? clamp(point.y - frameBox.y, frameBox.height) : null,
    },
    target: { label, tag, text, owner },
    hint: name ? `${name}${text ? ` “${text}”` : ''}` : label,
  };
}

export function attachComment(thread, { chapter, source, frame, elements = [] }) {
  const { anchor, target } = thread;
  if (anchor.kind === 'chapter') {
    return chapter ? attach(chapter, anchor.x, anchor.y, false) : null;
  }
  if (anchor.kind === 'source') return source ? attach(source, anchor.x, anchor.y, false) : null;
  if (!frame) return source ? attach(source, 0, 0, true) : null;
  if (anchor.kind === 'frame') return attach(frame, anchor.x, anchor.y, false);
  const element = elements.find(candidate => candidate.id === anchor.element?.id &&
    (!target.tag || !candidate.tag || target.tag === candidate.tag) &&
    (target.text === null || candidate.text === undefined || target.text === candidate.text));
  return element ? attach({ ...element, x: frame.x + element.x, y: frame.y + element.y }, anchor.x, anchor.y, false)
    : attach(frame, anchor.frameX, anchor.frameY, true);
}

function attach(box, x, y, changed) {
  return { x: box.x + clamp(x, box.width), y: box.y + clamp(y, box.height), box, changed };
}
