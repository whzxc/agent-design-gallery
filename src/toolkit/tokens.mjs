import { CliError } from '../cli-output.mjs';
export function tokenLocations(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
  const blocks = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const maps = blocks.map(block => {
    const start = block.index + block[0].indexOf('{') + 1;
    return new Map([...block[2].matchAll(/(--[\w-]+)\s*:/g)].map(match => [match[1], clean.slice(0, start + match.index).split('\n').length]));
  });
  return { light: maps[0] ?? new Map(), dark: maps[1] ?? new Map() };
}
export function parseTokens(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  if (blocks.length !== 2 || source.replace(/[^{}]+\{[^{}]*\}/g, '').trim() ||
      blocks[0][1].trim() !== ':root' || blocks[1][1].trim() !== ':root[data-theme="dark"]') {
    throw new CliError('TOKENS_INVALID', 'tokens.css needs exactly :root and :root[data-theme="dark"] blocks; fix the token source');
  }
  const maps = blocks.map(([, , body]) => {
    const map = new Map();
    for (const line of body.split('\n').map(line => line.trim()).filter(Boolean)) {
      const match = line.match(/^(--[\w-]+)\s*:\s*([^;]+);$/);
      if (!match || map.has(match[1])) throw new CliError('TOKENS_INVALID', `Invalid token declaration ${line}; put each unique token on its own line`);
      map.set(match[1], match[2].trim());
    }
    return map;
  });
  for (const key of ['--font-ui', '--font-mono', '--canvas', '--text']) {
    if (!maps[0].has(key)) throw new CliError('TOKENS_INVALID', `tokens.css is missing ${key}; add it to :root`);
  }
  for (const key of maps[1].keys()) if (!maps[0].has(key)) throw new CliError('TOKENS_INVALID', `Dark token ${key} has no light value; add it to :root`);
  return { light: maps[0], dark: maps[1] };
}

const namedColors = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
export function themeCss(tokens) {
  const color = (value, seen = new Set()) => {
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (alias) { if (seen.has(alias[1])) return false; seen.add(alias[1]); return color(tokens.light.get(alias[1]) ?? '', seen); }
    return namedColors.has(value.toLowerCase()) || /^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\(|color-mix\(|(?:transparent|black|white|red|blue|green|rebeccapurple|orange|purple|pink|gray|grey|yellow|cyan|magenta|currentColor)$)/i.test(value);
  };
  const declarations = [...tokens.light].flatMap(([key, value]) => {
    const theme = color(value) ? '--color-' + key.slice(2) : /^(--font-|--radius-|--shadow-)/.test(key) || (key.startsWith('--text-') && /^[-.\d]+(?:px|rem|em|ch)$/.test(value)) ? key : null;
    return theme ? [`${theme}:var(${key});`] : [];
  });
  return `@theme { --color-*:initial; --text-*:initial; --font-*:initial; --radius-*:initial; --shadow-*:initial; --inset-shadow-*:initial; --drop-shadow-*:initial; --text-shadow-*:initial; }\n@theme inline reference { ${declarations.join('\n')} }`;
}
