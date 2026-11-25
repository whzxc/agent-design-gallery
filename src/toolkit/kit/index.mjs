import { reactAdapter } from './react.mjs';

export {
  SUPPORTED_KIT_ENGINES,
  RESERVED_KIT_ENGINES,
  normalizeKitConfig,
  isWithinDirectory,
  isInNodeModules,
  resolveKitAlias,
  isKitAllowedFile,
  isKitUiFile,
  matchesAllowedPackage,
  kitWatchDirectories,
} from './config.mjs';

const ADAPTERS = {
  react: reactAdapter,
};

export function getKitAdapter(config) {
  if (!config?.kit) return null;
  return ADAPTERS[config.kit.engine] ?? null;
}

export function kitFingerprintFiles() {
  return [
    'config.mjs',
    'html-markers.mjs',
    'index.mjs',
    'react.mjs',
    'react-runtime.mjs',
  ].map(file => new URL(`./${file}`, import.meta.url));
}
