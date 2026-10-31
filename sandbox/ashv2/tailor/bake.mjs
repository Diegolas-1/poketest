// Bakes Ash V2's clothes from their patterns into ../clothes.json (loaded by the stage):
//   GTX=<npm prefix with @gltf-transform/core> node tailor/bake.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBody } from './body.mjs';
import { makeJeans } from './jeans.mjs';
import { makeTop, JACKET, SHIRT } from './tops.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const t0 = Date.now();
const body = await loadBody();
console.log('body', body.n, 'points', Date.now() - t0, 'ms');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const out = path.join(HERE, '../clothes.json');
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')).garments : [];
const garments = [];
const make = (name, f) => {
  if (only && !only.includes(name)) { const g = prev.find((x) => x.name === name); if (g) garments.push(g); return; }
  const t = Date.now(); garments.push({ name, ...f() }); console.log(name, Date.now() - t, 'ms');
};
const log = (n) => (s) => console.log('  ', n, 'step', s, Date.now() - t0, 'ms');
let jeansMesh = null;
make('jeans', () => ({ color: '#4a79b4', fabric: 'denim', ...pack(jeansMesh = makeJeans(body, log('jeans'))) }));
let shirtMesh = null;
make('shirt', () => {
  // over the jeans' waist (baked now, or as they were baked before)
  const jeans = jeansMesh || unpack(garments.find((g) => g.name === 'jeans'));
  const m = shirtMesh = makeTop(body, SHIRT, { thick: 0.25 / 75, gap: 0.015, under: [jeans], log: log('shirt') });
  console.log('  shirt armhole', m.draft.armhole.toFixed(1), 'cap', m.draft.cap.toFixed(1), 'cap height', m.draft.capH.toFixed(1));
  return { color: '#1f2a30', fabric: 'jersey', ...pack(m) };
});
make('jacket', () => {
  // over the shirt (baked now, or as it was baked before)
  const under = shirtMesh || unpack(garments.find((g) => g.name === 'shirt'));
  const m = makeTop(body, JACKET, { openFront: true, collar: 3.5, bend: 0.5, thick: 0.5 / 75, gap: 0.03, under: [under], log: log('jacket') });
  console.log('  jacket armhole', m.draft.armhole.toFixed(1), 'cap', m.draft.cap.toFixed(1), 'cap height', m.draft.capH.toFixed(1));
  return { color: '#3d6fd1', fabric: 'twill', pieceColors: { sleeveL: '#f3f1ea', sleeveR: '#f3f1ea', collar: '#f3f1ea' }, ...pack(m) };
});
fs.writeFileSync(out, JSON.stringify({ garments }));
console.log('done', Date.now() - t0, 'ms');

function unpack(g) {
  const f = (s) => new Float32Array(Buffer.from(s, 'base64').buffer.slice(0));
  return { P: f(g.position), N: f(g.normal) };
}
function pack(m) {
  return {
    count: m.P.length / 3, position: b64(m.P), normal: b64(m.N), uv: b64(m.UV),
    index: b64(Uint32Array.from(m.T)), skinIndex: b64(m.J), skinWeight: b64(m.W), pieces: m.pieces,
  };
}
