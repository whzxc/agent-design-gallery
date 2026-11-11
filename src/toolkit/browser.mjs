import { UPDATE } from './config.mjs';

export async function launch() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error(`Playwright is missing; run ${UPDATE}`); }
  try { return await chromium.launch(); }
  catch (error) {
    if (/Executable doesn't exist|playwright install/i.test(error.message)) throw new Error('Chromium is missing; run npx playwright@1.64.1 install chromium');
    throw new Error(`Cannot launch Chromium: ${error.message.split('\n')[0]}; check your Playwright installation (npx playwright@1.64.1 install chromium)`);
  }
}
export async function loadFrame(page, frame, theme = 'light') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.setViewportSize({ width: Math.ceil(frame.width ?? 1600), height: Math.ceil(frame.height ?? 1200) });
  await page.setContent(frame.document(theme));
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('[data-sdg-frame]').boundingBox();
  await page.setViewportSize({ width: Math.max(1, Math.ceil(box.width)), height: Math.max(1, Math.ceil(box.height)) });
  return box;
}
