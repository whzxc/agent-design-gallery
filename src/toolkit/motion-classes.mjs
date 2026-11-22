export const possibleTailwind = /(?:\btransition\b|\banimate-|\b(?:fade|zoom|spin)-(?:in|out)\b|\bslide-(?:in-from|out-to)-)/;

const effect = /^(?:transition(?:-.+)?|animate-.+|(?:fade|zoom|spin)-(?:in|out)(?:-.+)?|slide-(?:in-from|out-to)-.+)$/;
const timing = /^(?:duration|ease|delay)-.+$/;
const disabled = /^(?:animate|transition)-none$/;

function* candidates(text) {
  let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') i++;
    else if (char === '[' || char === '(') depth++;
    else if ((char === ']' || char === ')') && depth) depth--;
    else if (depth === 0 && /[\s<>=;,"'`]/.test(char)) {
      if (start < i) yield text.slice(start, i);
      start = i + 1;
    }
  }
  if (start < text.length) yield text.slice(start);
}

function utility(candidate) {
  let start = 0, depth = 0;
  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i];
    if (char === '\\' && depth) i++;
    else if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') {
      if (--depth < 0) return '';
    } else if (depth === 0 && char === ':') start = i + 1;
    else if (depth === 0 && !/[\w!@./-]/.test(char)) return '';
  }
  if (depth) return '';
  const base = candidate.slice(start).replace(/^!|!$/g, '');
  return /[\w)\]]$/.test(base) ? base : '';
}

export function scanTailwind(parts, record, within = []) {
  const effects = new Set(), parameters = new Set();
  let line = Infinity;
  for (const { text, line: at } of parts) {
    for (const candidate of candidates(text)) {
      const base = utility(candidate);
      if (timing.test(base) || disabled.test(base)) parameters.add(candidate);
      else if (effect.test(base)) {
        effects.add(candidate);
        line = Math.min(line, at);
      }
    }
  }
  if (effects.size) record('tailwind:' + [...effects].sort().join(' '), line, within, true, [...parameters].sort());
}
