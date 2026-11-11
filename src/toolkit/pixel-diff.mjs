/** The same comparator runs in Node tests and as a browser function handle. */
export function pixelComparator() {
  return (before, after) => {
    const width = Math.max(before?.width ?? 0, after?.width ?? 0);
    const height = Math.max(before?.height ?? 0, after?.height ?? 0);
    const difference = new Uint8ClampedArray(width * height * 4);
    let differentPixels = 0, maxChannelDelta = 0;
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
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      const offset = (y * width + x) * 4;
      difference[offset] = 255; difference[offset + 2] = 255; difference[offset + 3] = 255;
    }
    const areaPixels = width * height;
    const classes = {};
    for (const name of ['imperceptible', 'antialiasing', 'boundary_bleed', 'bitmap_resampling']) {
      classes[name] = { pixels: 0, ratio: 0, maxChannelDelta: 0, withinThreshold: true };
    }
    classes.other = { pixels: differentPixels, ratio: differentPixels / areaPixels, maxChannelDelta, withinThreshold: differentPixels === 0 };
    return { width, height, difference, pixels: { areaPixels, equalPixels: areaPixels - differentPixels, differentPixels, classes } };
  };
}

export async function imageDifference({ before, after, compare }) {
  const read = async source => {
    if (source === null) return null;
    const image = new Image(); image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  };
  const result = compare(await read(before), await read(after));
  const canvas = document.createElement('canvas');
  canvas.width = result.width; canvas.height = result.height;
  canvas.getContext('2d').putImageData(new ImageData(result.difference, result.width, result.height), 0, 0);
  return { pixels: result.pixels, png: canvas.toDataURL('image/png').split(',')[1] };
}
