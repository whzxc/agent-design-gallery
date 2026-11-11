/** Value-token locations for already validated JSON, keyed by JSON Pointer. */
export function jsonLocations(text) {
  let offset = 0, line = 1, column = 1; const locations = {};
  const advance = () => { if (text[offset++] === '\n') { line++; column = 1; } else column++; };
  const whitespace = () => { while (/\s/.test(text[offset] ?? '') && offset < text.length) advance(); };
  const string = () => {
    const start = offset; advance();
    while (offset < text.length) { if (text[offset] === '\\') { advance(); advance(); } else if (text[offset] === '"') { advance(); break; } else advance(); }
    return JSON.parse(text.slice(start, offset));
  };
  const value = pointer => {
    whitespace(); locations[pointer] = { line, column };
    if (text[offset] === '{') {
      advance(); whitespace();
      while (text[offset] !== '}') {
        const key = string().replaceAll('~', '~0').replaceAll('/', '~1'); whitespace(); advance(); value(pointer + '/' + key); whitespace();
        if (text[offset] !== ',') break; advance(); whitespace();
      }
      advance();
    } else if (text[offset] === '[') {
      advance(); whitespace(); let index = 0;
      while (text[offset] !== ']') { value(pointer + '/' + index++); whitespace(); if (text[offset] !== ',') break; advance(); }
      advance();
    } else if (text[offset] === '"') string();
    else while (offset < text.length && !/[\s,}\]]/.test(text[offset])) advance();
  };
  value(''); return locations;
}
