import path from 'node:path';
import { realpathSync } from 'node:fs';

export function frameOwners(html) {
  const result = new Map();
  for (const [, encoded] of html.matchAll(/\bdata-adg-owners="([^"]*)"/g)) {
    const value = encoded.replace(/&(quot|amp|lt|gt|#39);/g, (_, entity) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'" })[entity]);
    for (const owner of JSON.parse(value)) result.set(JSON.stringify(owner), owner);
  }
  return [...result.values()];
}

export function mappingFacts(built) {
  return { parts: built.parts ?? [], frames: built.frames.map(frame => ({ name: frame.name, owners: frame.owners ?? frameOwners(frame.html) })) };
}

export function sourceFacts(config, source, built) {
  const root = realpathSync(config.root), design = realpathSync(config.design);
  const projectPath = file => path.relative(root, file).split(path.sep).join('/');
  const designPath = name => projectPath(path.join(design, name));
  return { source, parts: built.parts ?? [],
    imports: built.imports.map(designPath),
    dependencies: built.dependencies.map(file => path.isAbsolute(file) ? projectPath(file) : designPath(file)),
    frames: built.frames.map(({ html, document, ...frame }) => ({ ...frame, parts: frameOwners(html).map(owner => ({ source: designPath(owner.source), part: owner.export })) })) };
}
