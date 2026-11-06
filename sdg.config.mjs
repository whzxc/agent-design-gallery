import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from './src/server.mjs';
import { states, recent } from './fixtures/viewer.mjs';

export default {
  requires: '>=0.3.0',
  compare: {
    port: 5188,
    viewport: '1440x900',
    async start({ port, root }) {
      const temporary = await mkdtemp(path.join(tmpdir(), 'sdg-fixture-'));
      try {
        const empty = path.join(temporary, 'empty'); await mkdir(empty);
        const server = await startServer({ directory: path.join(root, 'fixtures/arc-sample'), port, stateDirectory: temporary,
          fixtures: { states, recent, paths: { '~/projects/empty': empty } } });
        return async () => { try { await server.close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
      } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
    },
    fixture(name) {
      const state = states[name];
      if (!state) throw new Error(`Unknown SDG fixture ${name}; choose ${Object.keys(states).join(', ')}`);
      return { url: `/?fixture=${encodeURIComponent(name)}`, theme: state.theme, locale: 'en-US', clock: '2026-01-01T00:00:00Z' };
    },
    async ready(page, name) {
      await page.waitForFunction(name => document.documentElement.dataset.fixtureError || document.documentElement.dataset.fixtureReady === name, name, { timeout: 15000 });
      const error = await page.evaluate(() => document.documentElement.dataset.fixtureError);
      if (error) throw new Error(`SDG fixture ${name}: ${error}`);
      if (states[name].tooltip) {
        await page.getByRole('button', { name: 'Inspector', exact: true }).hover();
        await page.getByRole('tooltip').waitFor({ state: 'visible' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
    },
  },
};
