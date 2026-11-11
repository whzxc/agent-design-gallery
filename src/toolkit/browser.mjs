import { UPDATE } from './config.mjs';
import { CliError } from '../cli-output.mjs';

export async function launch({ importPlaywright = () => import('playwright') } = {}) {
  let chromium;
  try { ({ chromium } = await importPlaywright()); }
  catch (error) { throw new CliError('PLAYWRIGHT_UNAVAILABLE', `Playwright is missing; run ${UPDATE}`, { cause: error }); }
  try { return await chromium.launch(); }
  catch (error) {
    if (/Executable doesn't exist|playwright install/i.test(error.message)) throw new CliError('CHROMIUM_UNAVAILABLE', 'Chromium is missing; run npx playwright@1.64.1 install chromium', { cause: error });
    throw new CliError('BROWSER_FAILED', `Cannot launch Chromium: ${error.message.split('\n')[0]}; check your Playwright installation (npx playwright@1.64.1 install chromium)`, { cause: error });
  }
}
export async function loadFrame(page, frame, theme = 'light') {
  return browserTask(page.context().browser(), async () => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: Math.ceil(frame.width ?? 1600), height: Math.ceil(frame.height ?? 1200) });
    await page.setContent(frame.document(theme));
    await page.evaluate(() => document.fonts.ready);
    const box = await page.locator('[data-adg-frame]').boundingBox();
    await page.setViewportSize({ width: Math.max(1, Math.ceil(box.width)), height: Math.max(1, Math.ceil(box.height)) });
    return box;
  });
}

/** Classify Playwright execution failures where the browser's connection is observable. */
export async function browserTask(browser, work) {
  try { return await work(); }
  catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(browser?.isConnected() === false ? 'BROWSER_FAILED' : 'RENDER_FAILED', error.message, { cause: error });
  }
}
