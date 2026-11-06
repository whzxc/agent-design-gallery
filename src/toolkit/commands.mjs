import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tokenRegion, syncSvg } from './tokens.mjs';
import { compareInstance } from './text.mjs';
import { listAssets, selectAssets, relative, loadTokens, svgSize } from './project.mjs';
import { launch, loadSvg } from './browser.mjs';
import { inspectDocument } from './document.mjs';

export async function check(config, args = [], options = {}, log = console.log, error = console.error) {
  const tokens = loadTokens(config), region = tokenRegion(tokens), files = selectAssets(config, args);
  const components = listAssets(path.join(config.design, 'components'));
  const problems = new Set(), invalid = new Set();
  const report = (file, message) => problems.add(`${relative(config, file)}: ${message}`);
  for (const file of new Set([...files, ...components])) {
    const source = readFileSync(file, 'utf8');
    try {
      svgSize(source);
      if (files.includes(file) && syncSvg(source, region) !== source) report(file, 'token region is stale; run sdg sync');
    } catch (error) { report(file, error.message); invalid.add(file); }
  }
  const browser = await launch();
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ colorScheme: theme });
      const results = new Map(), definitions = new Map();
      for (const file of new Set([...components, ...files])) {
        if (invalid.has(file)) continue;
        try { await loadSvg(page, file, theme); } catch (error) {
          if (!error.message.includes('Invalid SVG XML')) throw error;
          report(file, 'Invalid SVG XML; fix the asset markup'); invalid.add(file); continue;
        }
        results.set(file, await page.evaluate(inspectDocument, [...tokens.light.keys(), ...[...tokens.light.keys()].filter(key => key.startsWith('--shadow-')).map(key => key.replace('--shadow-', '--elev-'))]));
      }
      for (const file of components) {
        for (const item of results.get(file)?.instances ?? []) {
          if (item.nested) continue;
          const key = `${item.component}/${item.form}`;
          if (!item.form) report(file, `${item.at} has no data-form`);
          else if (definitions.has(key)) report(file, `form ${key} is defined twice`);
          else definitions.set(key, item.signature);
        }
      }
      for (const file of files) {
        const result = results.get(file);
        if (!result) continue;
        for (const problem of result.problems) report(file, problem);
        for (const item of result.instances) {
          if (components.includes(file) && !item.nested) continue;
          const definition = definitions.get(`${item.component}/${item.form}`);
          if (!definition) { report(file, `${item.at} has no definition; declare the component/form in design/components/`); continue; }
          for (const difference of compareInstance(definition, item.signature)) report(file, `${item.at}: ${difference}`);
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  for (const problem of problems) error(problem);
  log(`Design check ${problems.size ? 'failed' : 'passed'} for ${files.length} asset${files.length === 1 ? '' : 's'}${problems.size ? `: ${problems.size} problems` : ''}.`);
  return problems.size ? 1 : 0;
}

export async function render(config, args, options) {
  const scale = Number(options.scale ?? 2);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid --scale; use a positive number');
  const files = selectAssets(config, args), browser = await launch();
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ deviceScaleFactor: scale, colorScheme: theme });
      for (const file of files) {
        await loadSvg(page, file, theme);
        const target = path.join(config.output, path.relative(config.design, file).replace(/\.svg$/, `-${theme}.png`));
        mkdirSync(path.dirname(target), { recursive: true });
        await page.screenshot({ path: target });
        console.log(relative(config, target));
      }
      await page.close();
    }
  } finally { await browser.close(); }
  return 0;
}
export function measureFont(tokens, options) {
  const size = options.size ?? '14';
  const pixels = /^\d+(?:\.\d+)?(?:px)?$/.test(size) ? `${parseFloat(size)}px` : tokens.get(size.startsWith('--text-') ? size : `--text-${size}`);
  if (!pixels || !/^\d+(?:\.\d+)?px$/.test(pixels) || parseFloat(pixels) <= 0) throw new Error(`Invalid --size ${size}; use positive pixels or a --text-* token suffix`);
  const weight = options.weight ?? '400';
  if (!/^\d+$/.test(weight) || Number(weight) < 1 || Number(weight) > 1000) throw new Error('Invalid --weight; use an integer from 1 to 1000');
  return `${weight} ${pixels} ${tokens.get(options.mono ? '--font-mono' : '--font-ui')}`;
}
export async function measure(config, args, options) {
  const font = measureFont(loadTokens(config).light, options), browser = await launch();
  try {
    const page = await browser.newPage();
    const width = await page.evaluate(([value, spec]) => {
      const context = document.createElement('canvas').getContext('2d');
      context.font = spec;
      return context.measureText(value).width;
    }, [args[0], font]);
    console.log(width.toFixed(1));
  } finally { await browser.close(); }
  return 0;
}
