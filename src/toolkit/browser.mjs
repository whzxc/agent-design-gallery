import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { UPDATE } from './config.mjs';
import { svgSize } from './project.mjs';

export async function launch() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error(`Playwright is missing; run ${UPDATE}`); }
  try { return await chromium.launch(); }
  catch (error) {
    if (/Executable doesn't exist|playwright install/i.test(error.message)) throw new Error('Chromium is missing; run npx playwright@1.64.1 install chromium');
    throw new Error(`Cannot launch Chromium: ${error.message.split('\n')[0]}; check your Playwright installation`);
  }
}
export async function loadSvg(page, file, theme) {
  await page.setViewportSize(svgSize(readFileSync(file, 'utf8')));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(theme => {
    if (document.querySelector('parsererror')) throw new Error('Invalid SVG XML; fix the asset markup');
    document.documentElement.setAttribute('data-theme', theme);
  }, theme);
  await page.evaluate(() => document.fonts.ready);
}
