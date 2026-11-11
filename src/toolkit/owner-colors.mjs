import { CliError } from '../cli-output.mjs';

const byte = value => Math.round(Math.max(0, Math.min(1, value)) * 255);
export const colorHex = rgba => '#' + rgba.map(value => value.toString(16).padStart(2, '0')).join('');
const alpha = raw => raw === undefined ? 255 : byte(Number(raw.replace('%', '')) / (raw.endsWith('%') ? 100 : 1));

/** Only syntax whose quantization is identical to the Chromium resolver is fast. */
export function fastColor(input) {
  const value = input.trim().toLowerCase(); let rgba;
  if (/^#[\da-f]{3,4}$/.test(value)) rgba = [...value.slice(1)].map(char => parseInt(char + char, 16));
  else if (/^#(?:[\da-f]{6}|[\da-f]{8})$/.test(value)) rgba = value.slice(1).match(/../g).map(char => parseInt(char, 16));
  else if (value === 'transparent') rgba = [0, 0, 0, 0];
  else {
    const rgb = /^rgba?\((.*)\)$/.exec(value);
    if (rgb) {
      const parts = rgb[1].includes(',') ? rgb[1].split(',').map(x => x.trim()) : rgb[1].split(/[\s/]+/).filter(Boolean);
      const separators = rgb[1].includes(',') ? !rgb[1].includes('/') : (rgb[1].match(/\//g)?.length ?? 0) === (parts.length === 4 ? 1 : 0);
      if (separators && parts.length >= 3 && parts.length <= 4 && parts.slice(0, 3).every(x => /^[-+]?\d+(?:\.0+)?$/.test(x)) && (parts[3] === undefined || /^[-+]?(?:\d*\.)?\d+%?$/.test(parts[3]))) rgba = [...parts.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(255, Number(x))))), alpha(parts[3])];
    }
    const hsl = /^hsla?\(\s*([-+\d.]+)(deg)?(?:\s*,\s*|\s+)([\d.]+)%(?:\s*,\s*|\s+)([\d.]+)%(?:(?:\s*,\s*|\s*\/\s*)([\d.]+%?))?\s*\)$/.exec(value);
    const validHslSeparators = value.includes(',') ? !value.includes('/') && [3,4].includes(value.split(',').length) : true;
    if (!rgba && hsl && validHslSeparators) {
      const h = ((Number(hsl[1]) % 360) + 360) % 360 / 60, s = Math.min(1, Number(hsl[3]) / 100), l = Math.min(1, Number(hsl[4]) / 100);
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
      const channels = (h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]).map(v => (v + m) * 255);
      if (channels.every(Number.isInteger)) rgba = [...channels, alpha(hsl[5])];
    }
  }
  if (!rgba) return null;
  if (rgba.length === 3) rgba.push(255);
  return rgba[3] ? rgba : [0, 0, 0, 0];
}

export function absoluteColor(input) {
  return typeof input === 'string' && !!input.trim() && !/\b(?:var|env|light-dark)\s*\(|\bfrom\b|\b(?:currentcolor|inherit|initial|unset|revert(?:-layer)?|canvas(?:text)?|accentcolor(?:text)?|activetext|button(?:border|face|text)|field(?:text)?|graytext|highlight(?:text)?|linktext|mark(?:text)?|selecteditem(?:text)?|visitedtext)\b/i.test(input);
}

/** Install a bounded absolute-color resolver in the current Chromium realm. */
export function installColorResolver() {
  if (globalThis.__adgOwnerColor) return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { colorSpace: 'srgb', colorType: 'float16', willReadFrequently: true }); context.globalCompositeOperation = 'copy';
  const sample = document.createElement('i'), cache = new Map();
  globalThis.__adgOwnerColor = input => {
    if (cache.has(input)) return cache.get(input);
    if (!CSS.supports('color', input)) return null;
    sample.style.color = ''; sample.style.color = input; document.body.append(sample);
    const value = getComputedStyle(sample).color; sample.remove();
    context.fillStyle = value; context.fillRect(0, 0, 1, 1);
    let rgba = [...context.getImageData(0, 0, 1, 1, { colorSpace: 'srgb', pixelFormat: 'rgba-float16' }).data].map(channel => Math.round(Math.max(0, Math.min(1, channel)) * 255));
    const rgb = /^rgba?\((.*)\)$/.exec(value);
    if (rgb) {
      const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (parts.every(Number.isFinite)) rgba = [...parts.slice(0, 3).map(channel => Math.round(Math.max(0, Math.min(255, channel)))), Math.round(Math.max(0, Math.min(1, parts[3] ?? 1)) * 255)];
    } else {
      const a = /\/\s*([\d.e+-]+)(%)?\s*\)$/.exec(value);
      if (a) rgba[3] = Math.round(Math.max(0, Math.min(1, Number(a[1]) / (a[2] ? 100 : 1))) * 255);
    }
    if (!rgba[3]) rgba = [0, 0, 0, 0];
    cache.set(input, rgba); if (cache.size > 512) cache.delete(cache.keys().next().value);
    return rgba;
  };
}

export async function resolveQueryColor(input, read) {
  if (!absoluteColor(input)) throw new CliError('OWNER_COLOR_INVALID', 'Supply an absolute supported CSS color, or query a custom property with --token.');
  const rgba = fastColor(input) ?? await read(input);
  if (!rgba) throw new CliError('OWNER_COLOR_INVALID', 'Chromium rejected the CSS color; supply a supported absolute color.');
  return rgba;
}
