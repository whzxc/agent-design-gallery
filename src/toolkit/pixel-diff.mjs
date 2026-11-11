/** The same comparator runs in Node tests and as a browser function handle. */
export function pixelComparator() {
  const color = (image, offset) => image.data[offset + 3] === 0 ? [0, 0, 0, 0] : [...image.data.subarray(offset, offset + 4)];
  const delta = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));
  const blend = (value, a, b) => {
    let channel = 0;
    for (let index = 1; index < 4; index++) if (Math.abs(b[index] - a[index]) > Math.abs(b[channel] - a[channel])) channel = index;
    const t = (value[channel] - a[channel]) / (b[channel] - a[channel]);
    return t >= 0 && t <= 1 && value.every((number, index) => Math.abs(number - a[index] - t * (b[index] - a[index])) <= 2)
      ? delta(value, a) > 2 && delta(value, b) > 2 : null;
  };
  const antialias = (before, after, x, y, a, b, minimum) => {
    const anchors = new Map();
    for (let dy = Math.max(0, y - 1); dy <= Math.min(before.height - 1, y + 1); dy++) for (let dx = Math.max(0, x - 1); dx <= Math.min(before.width - 1, x + 1); dx++) {
      const offset = (dy * before.width + dx) * 4, old = color(before, offset), current = color(after, offset);
      if (delta(old, current)) continue;
      const key = old.join(','), entry = anchors.get(key) ?? { color: old, count: 0 };
      entry.count++; anchors.set(key, entry);
    }
    const colors = [...anchors.values()].filter(anchor => anchor.count >= 3).map(anchor => anchor.color);
    const luminance = rgba => rgba[0] * 0.2126 + rgba[1] * 0.7152 + rgba[2] * 0.0722;
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
      if (delta(colors[i], colors[j]) <= minimum || luminance(colors[i]) === luminance(colors[j])) continue;
      const old = blend(a, colors[i], colors[j]), current = blend(b, colors[i], colors[j]);
      if (old !== null && current !== null && (old || current)) return true;
    }
    return false;
  };
  return (before, after, evidence = null, isolated = null) => {
    const width = Math.max(before?.width ?? 0, after?.width ?? 0);
    const height = Math.max(before?.height ?? 0, after?.height ?? 0);
    const difference = new Uint8ClampedArray(width * height * 4);
    const bleed = isolated ? new Uint8ClampedArray(width * height * 4) : null;
    const classes = Object.fromEntries(['imperceptible', 'antialiasing', 'boundary_bleed', 'bitmap_resampling', 'other'].map(name => [name, { pixels: 0, ratio: 0, maxChannelDelta: 0, withinThreshold: true }]));
    const palette = { imperceptible: [100, 116, 139], antialiasing: [245, 158, 11], boundary_bleed: [14, 165, 233], bitmap_resampling: [168, 85, 247], other: [255, 0, 255] };
    const raster = new Set(evidence?.rasterMask ?? []), policy = evidence?.thresholds;
    const eligible = evidence?.snapshotsMatch && before?.width === after?.width && before?.height === after?.height;
    let differentPixels = 0, needsIsolation = false;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const hasBefore = before && x < before.width && y < before.height;
      const hasAfter = after && x < after.width && y < after.height;
      let delta = 0;
      if (!!hasBefore !== !!hasAfter) delta = 255;
      else if (hasBefore && hasAfter) {
        const a = (y * before.width + x) * 4, b = (y * after.width + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          const old = channel < 3 && before.data[a + 3] === 0 ? 0 : before.data[a + channel];
          const current = channel < 3 && after.data[b + 3] === 0 ? 0 : after.data[b + channel];
          delta = Math.max(delta, Math.abs(old - current));
        }
      }
      if (!delta) continue;
      differentPixels++;
      const offset = (y * width + x) * 4;
      let name = 'other';
      if (policy && delta <= policy.imperceptible.maxChannelDelta) name = 'imperceptible';
      else if (eligible) {
        const old = color(before, offset), current = color(after, offset), alone = isolated && color(isolated, offset);
        const external = alone && old.some((value, channel) => value !== alone[channel]);
        if (!isolated) needsIsolation = true;
        const edge = policy.boundaryBleed.edgeDevicePixels;
        if (external) {
          if ((x < edge || y < edge || x >= width - edge || y >= height - edge) && current.every((value, channel) => value === alone[channel])) name = 'boundary_bleed';
        } else if (raster.has(y * width + x)) name = 'bitmap_resampling';
        else if (delta <= policy.antialiasing.maxChannelDelta && evidence.edgeBoxes.some(box => x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height) && antialias(before, after, x, y, old, current, policy.imperceptible.maxChannelDelta)) name = 'antialiasing';
      }
      const stat = classes[name]; stat.pixels++; stat.maxChannelDelta = Math.max(stat.maxChannelDelta, delta);
      difference.set(palette[name], offset); difference[offset + 3] = 255;
      if (bleed && name === 'boundary_bleed') { bleed.set([255, 255, 255, 255], offset); }
    }
    const areaPixels = width * height;
    for (const stat of Object.values(classes)) stat.ratio = areaPixels ? stat.pixels / areaPixels : 0;
    classes.other.withinThreshold = classes.other.pixels === 0;
    if (policy) {
      classes.antialiasing.withinThreshold = !classes.antialiasing.pixels || classes.antialiasing.ratio < policy.antialiasing.maxRatioExclusive;
      classes.bitmap_resampling.withinThreshold = !classes.bitmap_resampling.pixels || classes.bitmap_resampling.ratio < policy.bitmapResampling.maxRatioExclusive;
    }
    return { width, height, difference, bleed, needsIsolation, pixels: { areaPixels, equalPixels: areaPixels - differentPixels, differentPixels, classes } };
  };
}

export async function imageDifference({ before, after, compare, crop = null, isolated = null, evidence = null }) {
  const read = async (source, clip = null) => {
    if (source === null) return null;
    const image = new Image(); image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return clip ? context.getImageData(clip.x, clip.y, clip.width, clip.height) : context.getImageData(0, 0, canvas.width, canvas.height);
  };
  const first = await read(before, crop), second = await read(after), alone = await read(isolated, crop);
  const result = compare(first, second, evidence, alone);
  const encode = image => {
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d').putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  };
  return { pixels: result.pixels, png: encode(new ImageData(result.difference, result.width, result.height)),
    beforePng: crop && encode(first), isolatedPng: alone && encode(alone),
    bleedPng: result.bleed && encode(new ImageData(result.bleed, result.width, result.height)), needsIsolation: result.needsIsolation };
}
