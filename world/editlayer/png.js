// A tiny exact PNG codec (8-bit RGB / RGBA, no interlace) for the edit
// layer's rasters. The browser's canvas would premultiply alpha and colour
// manage the pixels; this keeps every byte as written, in the browser and in
// Node (both have CompressionStream / DecompressionStream; PNG's IDAT is a
// zlib stream, which is what 'deflate' means there).

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

// pixels: Uint8Array w * h * ch (ch 3 or 4) -> PNG bytes
export async function encodePNG(pixels, w, h, ch = 4) {
  const row = w * ch, raw = new Uint8Array((row + 1) * h);
  for (let y = 0; y < h; y++) {
    // filter 1 (sub): smooth rasters compress far better
    const o = y * (row + 1), s = y * row;
    raw[o] = 1;
    for (let i = 0; i < row; i++) raw[o + 1 + i] = (pixels[s + i] - (i >= ch ? pixels[s + i - ch] : 0)) & 255;
  }
  const z = await pipe(raw, new CompressionStream('deflate'));
  const chunks = [];
  const chunk = (type, data) => {
    const b = new Uint8Array(12 + data.length), dv = new DataView(b.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    b.set(data, 8);
    dv.setUint32(8 + data.length, crc32(b, 4, 8 + data.length));
    chunks.push(b);
  };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  chunk('IHDR', ihdr); chunk('IDAT', z); chunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(8 + chunks.reduce((a, c) => a + c.length, 0));
  out.set(SIG, 0);
  let o = 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// PNG bytes -> { w, h, ch, data } (data: Uint8Array w * h * ch)
export async function decodePNG(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) throw new Error('not a PNG');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (o < b.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); ct = b[o + 17];
      if (b[o + 16] !== 8 || (ct !== 2 && ct !== 6) || b[o + 20] !== 0) throw new Error('PNG: only 8-bit RGB / RGBA without interlace');
    } else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const zl = new Uint8Array(idat.reduce((a, c) => a + c.length, 0));
  { let k = 0; for (const c of idat) { zl.set(c, k); k += c.length; } }
  const raw = await pipe(zl, new DecompressionStream('deflate'));
  const ch = ct === 6 ? 4 : 3, row = w * ch, out = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], s = y * (row + 1) + 1, t = y * row;
    for (let i = 0; i < row; i++) {
      const x = raw[s + i], a = i >= ch ? out[t + i - ch] : 0, up = y ? out[t - row + i] : 0, c = y && i >= ch ? out[t - row + i - ch] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + up;
      else if (f === 3) v = x + ((a + up) >> 1);
      else { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      out[t + i] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

export function toBase64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
