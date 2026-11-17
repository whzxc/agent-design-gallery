import { execFileSync } from 'node:child_process';
import { CliError } from '../cli-output.mjs';

export function systemTheme({ platform = process.platform, readAppearance = () => execFileSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  if (platform !== 'darwin') return 'light';
  try { return readAppearance().trim() === 'Dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function resolveThemes(option = 'both', readSystemTheme = systemTheme) {
  if (!['both', 'light', 'dark', 'system'].includes(option)) {
    throw new CliError('USAGE_INVALID', 'Choose --theme=both, light, dark, or system.');
  }
  if (option === 'both') return ['light', 'dark'];
  return [option === 'system' ? readSystemTheme() : option];
}
