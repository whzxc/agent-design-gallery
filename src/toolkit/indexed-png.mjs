import { deflateSync, inflateSync } from 'node:zlib';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  crcTable[i] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const header = Buffer.from(type, 'ascii');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([header, data]);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

/** Losslessly re-encode low-color RGBA8 mask PNGs (<=16 colors) as 4-bit indexed PNGs. */
export function compressIndexedPng(pngBuffer) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 33 || !pngBuffer.subarray(0, 8).equals(pngSignature)) {
    return pngBuffer;
  }
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idats = [];
  while (pos + 12 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(pos);
    const type = pngBuffer.toString('ascii', pos + 4, pos + 8);
    const start = pos + 8, end = start + length;
    if (end + 4 > pngBuffer.length) return pngBuffer;
    if (type === 'IHDR' && length >= 13) {
      width = pngBuffer.readUInt32BE(start);
      height = pngBuffer.readUInt32BE(start + 4);
      bitDepth = pngBuffer[start + 8];
      colorType = pngBuffer[start + 9];
    } else if (type === 'IDAT') {
      idats.push(pngBuffer.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }
    pos = end + 4;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6 || !idats.length) return pngBuffer;

  let raw;
  try { raw = inflateSync(Buffer.concat(idats)); }
  catch { return pngBuffer; }
  const bpp = 4, stride = width * bpp;
  if (raw.length < height * (stride + 1)) return pngBuffer;

  const rgba = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    if (filter === 0) {
      raw.copy(rgba, dst, src, src + stride);
      continue;
    }
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rgba[dst + x - bpp] : 0;
      const b = y > 0 ? rgba[dst - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? rgba[dst - stride + x - bpp] : 0;
      let val = raw[src + x];
      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else {
        return pngBuffer;
      }
      rgba[dst + x] = val;
    }
  }

  const paletteMap = new Map();
  const palette = [];
  const rowBytes = (width + 1) >> 1;
  const scanlines = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const outRow = y * (1 + rowBytes);
    scanlines[outRow] = 0;
    const rowOff = y * stride;
    for (let x = 0; x < width; x++) {
      const off = rowOff + x * 4;
      const alpha = rgba[off + 3];
      const key = alpha === 0 ? 0 : (((rgba[off] << 24) | (rgba[off + 1] << 16) | (rgba[off + 2] << 8) | alpha) >>> 0);
      let index = paletteMap.get(key);
      if (index === undefined) {
        index = palette.length;
        if (index >= 16) return pngBuffer;
        paletteMap.set(key, index);
        palette.push(alpha === 0 ? [0, 0, 0, 0] : [rgba[off], rgba[off + 1], rgba[off + 2], alpha]);
      }
      const bytePos = outRow + 1 + (x >> 1);
      if ((x & 1) === 0) scanlines[bytePos] = index << 4;
      else scanlines[bytePos] |= index;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 4;
  ihdr[9] = 3;
  const plte = Buffer.allocUnsafe(palette.length * 3);
  const trns = Buffer.allocUnsafe(palette.length);
  let hasTransparency = false;
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i][0];
    plte[i * 3 + 1] = palette[i][1];
    plte[i * 3 + 2] = palette[i][2];
    trns[i] = palette[i][3];
    if (palette[i][3] !== 255) hasTransparency = true;
  }
  const chunks = [
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    ...(hasTransparency ? [pngChunk('tRNS', trns)] : []),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  const encoded = Buffer.concat(chunks);
  return encoded.length < pngBuffer.length ? encoded : pngBuffer;
}
