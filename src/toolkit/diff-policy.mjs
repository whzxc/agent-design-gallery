import { CliError } from '../cli-output.mjs';

const defaults = {
  imperceptible: { maxChannelDelta: 2 },
  antialiasing: { maxChannelDelta: 48, maxRatioExclusive: 0.005 },
  boundaryBleed: { edgeDevicePixels: 2 },
  bitmapResampling: { maxRatioExclusive: 0.001 },
};
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function resolveDiffPolicy(value = {}) {
  const invalid = () => { throw new CliError('CONFIG_INVALID', 'Set diff.thresholds to class-specific channel, ratio and edge limits in adg.config.mjs.'); };
  if (!object(value) || Object.keys(value).some(key => key !== 'thresholds')) invalid();
  const supplied = value.thresholds === undefined ? {} : value.thresholds;
  if (!object(supplied) || Object.keys(supplied).some(key => !Object.hasOwn(defaults, key))) invalid();
  const thresholds = {};
  for (const [name, fields] of Object.entries(defaults)) {
    const overrides = supplied[name] === undefined ? {} : supplied[name];
    if (!object(overrides) || Object.keys(overrides).some(key => !Object.hasOwn(fields, key))) invalid();
    thresholds[name] = { ...fields, ...overrides };
    for (const [key, limit] of Object.entries(thresholds[name])) {
      if (!Number.isFinite(limit) || limit < 0) invalid();
      if (key === 'maxRatioExclusive' ? limit > 1 : !Number.isInteger(limit)) invalid();
      if (key === 'maxChannelDelta' && limit > 255) invalid();
    }
  }
  return { thresholds };
}
