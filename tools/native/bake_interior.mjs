// Bakes an interior (a map blueprint, web/world/maps/<id>.json, built by
// web/world/interior.js) for the native game, into native/interiors/:
//   <id>.glb       the space as drawn: a few merged meshes. Material names say
//                  how to draw them: 'glow' (unshaded, added on top), 'unlit'
//                  (unshaded), 'leaf_<variant>' (potted plants), else cel
//                  shaded; '_vc' = vertex colours. Mesh names ending '_ns'
//                  cast no shadow.
//   <id>_ink.bin   the vector ink (INK2, as tools/native/bake_ink.mjs writes it)
//   <id>.json      the compiled blueprint (maps/format.js compile): walk grids
//                  per level, colliders, interactions, portals, spawns, actors,
//                  camera volumes, lights and lamps
// Run: node tools/native/bake_interior.mjs [oak_lab]   (serves web/ on :8790 if
// nothing is there; WEB_PORT for another checkout)
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');   // (tools/native/setup.sh sets PLAYWRIGHT on a fresh machine)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/interiors');
fs.mkdirSync(OUT, { recursive: true });
const ID = process.argv[2] || 'oak_lab';
const PORT = process.env.WEB_PORT || '8790';
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/`)).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
// leaf materials remember their variant (as tools/native/bake.mjs does)
await p.route('**/world/foliage.js', async (route) => {
  const r = await route.fetch();
  let body = await r.text();
  const a = "const m = new THREE.MeshLambertMaterial({ map: leafAtlas(variant), color: new THREE.Color(tint), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });";
  if (!body.includes(a)) throw new Error('bake patch not found in foliage.js');
  body = body.replace(a, a + ' m.userData.leaf = { tint, wind, variant };');
  await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'text/javascript' } });
});
await p.goto(`http://localhost:${PORT}/world/interior.html?map=${ID}&ink=0`);
await p.waitForFunction(() => window.ready, null, { timeout: 300000 });

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const I = window.interior;
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const G = new THREE.Group(), made = new Map();
  const plain = (m) => {
    if (made.has(m)) return made.get(m);
    const n = new THREE.MeshStandardMaterial({ color: m.color.clone(), map: m.map || null, vertexColors: !!m.vertexColors, side: m.side,
      transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, roughness: 1, metalness: 0 });
    n.name = m.userData.leaf ? 'leaf_' + m.userData.leaf.variant : (m.name || 'm') + (m.vertexColors ? '_vc' : '');
    made.set(m, n); return n;
  };
  I.group.updateMatrixWorld(true);
  I.group.traverse((o) => {
    if (!o.isMesh || o.userData.inkLines) return;
    const m = new THREE.Mesh(o.geometry, plain(o.material)); m.name = o.name;
    o.matrixWorld.decompose(m.position, m.quaternion, m.scale); G.add(m);
  });
  const glb = await new Promise((ok, bad) => new GLTFExporter().parse(G, (r) => ok(new Uint8Array(r)), bad, { binary: true }));
  const e = I.edges, f = new Float32Array(e.k.length * 13);
  for (let i = 0; i < e.k.length; i++) f.set([...e.pos.slice(i * 6, i * 6 + 6), ...e.n1.slice(i * 3, i * 3 + 3), ...e.n2.slice(i * 3, i * 3 + 3), e.k[i]], i * 13);
  const S = { ...I.space }; delete S._raw;
  S.lamps = I.lamps;
  return { glb: b64(glb), ink: b64(new Uint8Array(f.buffer)), n: e.k.length, space: S, stats: I.stats };
});
await b.close();

fs.writeFileSync(path.join(OUT, ID + '.glb'), Buffer.from(res.glb, 'base64'));
fs.writeFileSync(path.join(OUT, ID + '.json'), JSON.stringify(res.space));
// ink: the same INK2 layout as bake_ink.mjs, one cell per 64 m
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const half = (v) => {
  f32[0] = v; const x = u32[0], sgn = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e <= 0) return sgn;
  if (e >= 31) return sgn | 0x7c00;
  return sgn | (e << 10) | ((m + 0x1000) >>> 13 > 0x3ff ? 0x3ff : (m + 0x1000) >>> 13);
};
const sn = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const F = new Float32Array(new Uint8Array(Buffer.from(res.ink, 'base64')).buffer);
const CELL = 64, bins = new Map();
for (let i = 0; i < res.n; i++) {
  const o = i * 13, k = Math.floor((F[o] + F[o + 3]) / 2 / CELL) + ',' + Math.floor((F[o + 2] + F[o + 5]) / 2 / CELL);
  if (!bins.has(k)) bins.set(k, []); bins.get(k).push(i);
}
const parts = [Buffer.from('INK2', 'ascii'), Buffer.from(new Uint32Array([bins.size]).buffer)];
for (const [k, ids] of bins) {
  const m = ids.length, [cx, cz] = k.split(',').map(Number);
  const pos = new Float32Array(m * 12), c0 = new Uint16Array(m * 16), c1 = new Int8Array(m * 16), c2 = new Int8Array(m * 16), idx = new Int32Array(m * 6);
  ids.forEach((id, j) => {
    const o = id * 13, A = [F[o], F[o + 1], F[o + 2]], B = [F[o + 3], F[o + 4], F[o + 5]], W = [-1, 1, -2, 2];
    for (let c = 0; c < 4; c++) {
      const v = j * 4 + c, me = c < 2 ? A : B, ot = c < 2 ? B : A;
      pos.set(me, v * 3);
      c0.set([half(ot[0] - me[0]), half(ot[1] - me[1]), half(ot[2] - me[2]), half(W[c])], v * 4);
      c1.set([sn(F[o + 6]), sn(F[o + 7]), sn(F[o + 8]), 0], v * 4);
      c2.set([sn(F[o + 9]), sn(F[o + 10]), sn(F[o + 11]), sn(F[o + 12] / 2)], v * 4);
    }
    const v = j * 4;
    idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], j * 6);
  });
  parts.push(Buffer.from(new Int32Array([cx, cz, m]).buffer));
  for (const a of [pos, c0, c1, c2, idx]) parts.push(Buffer.from(a.buffer));
}
fs.writeFileSync(path.join(OUT, ID + '_ink.bin'), Buffer.concat(parts));
for (const f of [ID + '.glb', ID + '.json', ID + '_ink.bin']) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(2), 'MB');
console.log('meshes', res.stats.meshes, 'triangles', res.stats.tris, 'ink edges', res.n);
