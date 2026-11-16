// Carry Doop element ids (comment and link anchors) from the published board HTML into a re-rendered one.
// Doop stamps data-doop-id lazily on the element someone commented on; a full replace would drop it.
// An element is matched by its board landmarks: the outermost section by order, the specimen by its
// caption label, then the nth-of-type path below the nearest landmark. Text edits keep anchors; structural
// moves inside a specimen or section do not.
import { parse } from 'parse5';

const isElement = node => 'tagName' in node;
const attr = (el, name) => el.attrs.find(a => a.name === name)?.value;
const text = node => isElement(node) || node.childNodes ? (node.childNodes ?? []).map(text).join('') : node.value ?? '';

function index(html) {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const keyed = new Map();
  const visit = (el, landmark, path, section) => {
    let mark = landmark, steps = path, inSection = section;
    if (el.tagName === 'section' && section === null) {
      inSection = visit.sections++;
      mark = `section:${inSection}`; steps = [];
    } else if (el.tagName === 'figure') {
      const caption = el.childNodes.filter(isElement).find(c => c.tagName === 'figcaption');
      const label = caption && text(caption.childNodes.filter(isElement)[0] ?? caption).trim();
      if (label) { mark = `section:${inSection}/figure:${label}`; steps = []; }
    }
    const key = `${mark}|${steps.join('>')}`;
    if (!keyed.has(key)) keyed.set(key, el);
    else keyed.set(key, null); // ambiguous: never guess
    const seen = {};
    for (const child of el.childNodes.filter(isElement)) {
      seen[child.tagName] = (seen[child.tagName] ?? 0) + 1;
      visit(child, mark, [...steps, `${child.tagName}:${seen[child.tagName]}`], inSection);
    }
  };
  visit.sections = 0;
  const html_ = doc.childNodes.filter(isElement).find(n => n.tagName === 'html');
  visit(html_, 'root', [], null);
  return keyed;
}

/** Returns the new HTML with every old data-doop-id re-stamped, plus the ids that found no match. */
export function carryAnchors(oldHtml, newHtml) {
  const before = index(oldHtml), after = index(newHtml);
  const inserts = [], kept = [], orphaned = [];
  for (const [key, el] of before) {
    const id = el && attr(el, 'data-doop-id');
    if (!id) continue;
    const target = after.get(key);
    if (!target) { orphaned.push({ id, key }); continue; }
    if (attr(target, 'data-doop-id')) continue;
    const start = target.sourceCodeLocation.startTag;
    const close = newHtml.lastIndexOf(newHtml.slice(start.endOffset - 2, start.endOffset) === '/>' ? '/>' : '>', start.endOffset);
    inserts.push([close, ` data-doop-id="${id}"`]);
    kept.push({ id, key });
  }
  let html = newHtml;
  for (const [at, text_] of inserts.sort((a, b) => b[0] - a[0])) html = html.slice(0, at) + text_ + html.slice(at);
  return { html, kept, orphaned };
}
