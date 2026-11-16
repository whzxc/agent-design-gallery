// Derive a TS token table from design/tokens.css so boards never restate values.
import { readFileSync, writeFileSync } from 'node:fs';
const [, , cssPath, outPath] = process.argv;
const css = readFileSync(cssPath, 'utf8');
const block = selector => {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start), close = css.indexOf('}', open);
  return Object.fromEntries([...css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1].slice(2), m[2].trim()]));
};
const light = block(':root {'), dark = block(':root[data-theme="dark"]');
writeFileSync(outPath, `// Generated from design/tokens.css by the board pipeline. Do not edit.\nexport const light: Record<string, string> = ${JSON.stringify(light, null, 1)};\nexport const dark: Record<string, string> = ${JSON.stringify({ ...light, ...dark }, null, 1)};\n`);
console.log(Object.keys(light).length, 'tokens;', Object.keys(dark).length, 'dark overrides');
