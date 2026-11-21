import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';
import { canonicalBytes } from './impact-proof.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

export function assetStore() {
  const assets = Object.create(null);
  return { assets, put(value) {
    const key = hash(typeof value === 'string' ? value : canonicalBytes(value));
    assets[key] ??= value;
    return key;
  } };
}

export async function withFilmstrip(theme, store, work) {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./review-playback.js', import.meta.url))],
    bundle: true, format: 'iife', globalName: 'reviewPlayback', minify: true, write: false });
  const script = bundle.outputFiles[0].text.trim();
  const environment = { colorScheme: theme, reducedMotion: 'no-preference', deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' };
  const browser = await launch();
  try {
    const page = await browser.newPage(environment);
    await page.setContent('<style>*{margin:0}iframe{display:block;border:0}</style>');
    await page.addScriptTag({ content: script });
    await page.evaluate(async () => { window.stageFrame = await reviewPlayback.createStage(document.body); });
    const capture = async () => {
      const image = await page.locator('iframe').screenshot({ animations: 'disabled', caret: 'hide' });
      return { image: store.put('data:image/png;base64,' + image.toString('base64')),
        width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
    };
    const endpoints = new Map(), samples = new Map(), loaded = new Set();
    async function load(key) {
      const endpoint = store.assets[key];
      const entries = Object.fromEntries([key, endpoint.html, ...endpoint.styles].filter(k => !loaded.has(k)).map(k => [k, store.assets[k]]));
      await page.evaluate(entries => Object.assign(window.motionAssets ??= {}, entries), entries);
      Object.keys(entries).forEach(k => loaded.add(k));
    }
    async function endpoint(key) {
      if (!endpoints.has(key)) {
        await load(key);
        const rows = await page.evaluate(async ({ key, theme }) => {
          const scene = motionAssets[key];
          const stage = await reviewPlayback.showEndpoint(stageFrame, scene, motionAssets, theme);
          return reviewPlayback.identities(stage, scene.design);
        }, { key, theme });
        endpoints.set(key, { rows, ...await capture() });
      }
      return endpoints.get(key);
    }
    async function filmstrip(side) {
      const key = hash(canonicalBytes([side.from, side.to, side.edge, environment, browser.version(), hash(script)]));
      if (samples.has(key)) return samples.get(key);
      const opening = await endpoint(side.from), final = await endpoint(side.to);
      const info = await page.evaluate(async ({ side, theme }) => {
        window.paint?.dispose();
        window.paint = await reviewPlayback.prepare(stageFrame, side, motionAssets, theme);
        return { duration: paint?.duration ?? 0, boundaries: paint?.boundaries ?? [], fallback: paint?.fallback };
      }, { side, theme });
      const { duration, boundaries, fallback } = info;
      const sample = ({ image, width, height }, ms, state) => ({ image, width, height, ms, state });
      const strip = [sample(opening, 0, 'From')];
      for (const ms of [...new Set([duration / 2, ...boundaries])].filter(ms => ms > 0 && ms < duration).sort((a,b) => a-b)) {
        await page.evaluate(p => paint.seek(p), ms / duration);
        strip.push(sample(await capture(), ms, ''));
      }
      strip.push(sample(final, duration, 'To'));
      const result = { duration, fallback, samples: strip };
      samples.set(key, result);
      return result;
    }
    return await work({ endpoint, filmstrip, script });
  } finally { await browser.close(); }
}
