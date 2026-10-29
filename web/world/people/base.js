// The base body's file (web/world/people/base.bin, made by tools/people/build_base.mjs):
//   "PPLB" u32 json length, json { params, nv, nf, arrays: { name: [type, offset, length] } },
//   then each array (4-byte aligned): pos (A pose, metres), idx, skin (4 bones per vertex), wts,
//   aw0 (the reference skeleton's A pose, 16 per bone), meas0 (its parts' sizes, fit.js),
//   part (per vertex: limb, place along it, side), share (per vertex: how much it belongs to
//   an arm, a leg, the head, a hand or foot; 0..1), uv
const TYPES = { f32: Float32Array, f64: Float64Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array, i8: Int8Array };
const NAME = (a) => Object.entries(TYPES).find(([, T]) => a instanceof T)[0];

export function packBase(meta, arrays) {
  const json = { ...meta, arrays: {} };
  let off = 0;
  for (const [k, a] of Object.entries(arrays)) { off = (off + 7) & ~7; json.arrays[k] = [NAME(a), off, a.length]; off += a.byteLength; }
  const js = new TextEncoder().encode(JSON.stringify(json)), head = 8 + js.length, start = (head + 7) & ~7;
  const buf = new Uint8Array(start + off);
  buf.set([80, 80, 76, 66]); new DataView(buf.buffer).setUint32(4, js.length, true); buf.set(js, 8);
  for (const [k, a] of Object.entries(arrays)) buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + json.arrays[k][1]);
  return buf;
}

export function unpackBase(ab) {
  const u8 = new Uint8Array(ab), n = new DataView(ab).getUint32(4, true);
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'PPLB') throw new Error('not a people base file');
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n))), start = (8 + n + 7) & ~7, out = { ...json };
  for (const [k, [t, off, len]] of Object.entries(json.arrays)) out[k] = new TYPES[t](ab.slice(start + off, start + off + len * TYPES[t].BYTES_PER_ELEMENT));
  delete out.arrays;
  return out;
}
