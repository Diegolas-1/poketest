// Dev only: bakes one kit.html preview scene (a prop on its own) for the
// native game, the way the world bake would: the prop's meshes as a glb (the
// bake's plain materials: colour, texture, _vc / _decal / leaf_<variant>
// names; instanced parts expanded) and its vector ink as an INK2 ink.bin (the
// edges outline.js gives it, instanced solids through partEdges). The native
// dev scene dev/prop_shot.tscn shows them on a flat pad in the game's light.
//   node tools/native/bake_prop.mjs <kit scene> <out dir>   (serves web/ on :8790 if nothing is there)
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [scene, OUT] = process.argv.slice(2);
if (!scene || !OUT) { console.error('usage: bake_prop.mjs <kit scene> <out dir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.WEB_PORT || '8790';
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/kit.html`)).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
// (as bake.mjs: leaf materials remember their variant)
await p.route('**/world/foliage.js', async (route) => {
  const r = await route.fetch(); let body = await r.text();
  const a = "const m = new THREE.MeshLambertMaterial({ map: leafAtlas(variant), color: new THREE.Color(tint), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });";
  if (!body.includes(a)) throw new Error('foliage patch');
  body = body.replace(a, a + ' m.userData.leaf = { tint, wind, variant };');
  await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'text/javascript' } });
});
await p.goto(`http://localhost:${PORT}/world/kit.html?show=${scene}&ink=0`);
await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const OL = await import('/world/outline.js');
  const G = window.__kitG;
  OL.addEdgeLines(G);
  G.updateMatrixWorld(true);
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const out = new THREE.Group(), mats = new Map(), edges = [];
  const plain = (m) => {
    if (mats.has(m)) return mats.get(m);
    const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors, side: m.side, transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, roughness: 1, metalness: 0 });
    n.name = m.userData.leaf ? 'leaf_' + m.userData.leaf.variant : (m.name || 'm') + (m.polygonOffset ? '_decal' : '') + (m.vertexColors ? '_vc' : '');
    mats.set(m, n); return n;
  };
  let tris = 0;
  const nm = new THREE.Matrix3(), s = new THREE.Vector3(), e = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
  G.traverse((o) => {
    if (!o.isMesh || !shown(o)) return;
    if (o.userData.inkLines) {
      const g = o.geometry, S = g.attributes.instanceStart, E = g.attributes.instanceEnd, N1 = g.attributes.instanceN1, N2 = g.attributes.instanceN2, K = g.attributes.instanceK;
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < S.count; i++) {
        s.fromBufferAttribute(S, i).applyMatrix4(o.matrixWorld); e.fromBufferAttribute(E, i).applyMatrix4(o.matrixWorld);
        n1.fromBufferAttribute(N1, i).applyMatrix3(nm).normalize(); n2.fromBufferAttribute(N2, i).applyMatrix3(nm).normalize();
        edges.push(s.x, s.y, s.z, e.x, e.y, e.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z, K.getX(i));
      }
      return;
    }
    let geo, m4 = o.matrixWorld;
    if (o.isInstancedMesh) {
      const list = [], im = new THREE.Matrix4(), wm = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, im); wm.multiplyMatrices(o.matrixWorld, im);
        const g = o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        list.push(g.applyMatrix4(wm));
        if (o.userData.outline === 'solid') { const ed = OL.partEdges(o.geometry, wm, [], -1); for (let j = 0; j < ed.k.length; j++) edges.push(...ed.pos.slice(j * 6, j * 6 + 6), ...ed.n1.slice(j * 3, j * 3 + 3), ...ed.n2.slice(j * 3, j * 3 + 3), ed.k[j]); }
      }
      geo = mergeGeometries(list, false); m4 = new THREE.Matrix4();
    } else geo = o.geometry;
    const mm = new THREE.Mesh(geo, plain(o.material)); mm.name = o.name || '';
    m4.decompose(mm.position, mm.quaternion, mm.scale);
    out.add(mm);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  });
  const glb = await new Promise((ok, bad) => new GLTFExporter().parse(out, (r) => ok(new Uint8Array(r)), bad, { binary: true }));
  const b64 = (u8) => { let str = ''; for (let i = 0; i < u8.length; i += 0x8000) str += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(str); };
  const meta = {};
  G.traverse((o) => { if (o.userData && o.userData.markers) meta[o.userData.kind || o.name] = { markers: o.userData.markers, lod: o.userData.lod, foot: o.userData.foot }; });
  const byMat = {}; out.children.forEach((c) => { const k = c.material.name; byMat[k] = (byMat[k] || 0) + 1; });
  return { glb: b64(glb), ink: b64(new Uint8Array(new Float32Array(edges).buffer)), n: edges.length / 13, tris, meshes: out.children.length, materials: byMat, meta };
});
fs.writeFileSync(path.join(OUT, 'prop.glb'), Buffer.from(res.glb, 'base64'));
// INK2 (as bake_ink.mjs)
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const half = (v) => { f32[0] = v; const x = u32[0], sgn = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff; if (e <= 0) return sgn; if (e >= 31) return sgn | 0x7c00; return sgn | (e << 10) | ((m + 0x1000) >>> 13 > 0x3ff ? 0x3ff : (m + 0x1000) >>> 13); };
const sn = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const F = new Float32Array(new Uint8Array(Buffer.from(res.ink, 'base64')).buffer);
const CELL = 64, bins = new Map();
for (let i = 0; i < res.n; i++) { const o = i * 13, k = Math.floor((F[o] + F[o + 3]) / 2 / CELL) + ',' + Math.floor((F[o + 2] + F[o + 5]) / 2 / CELL); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(i); }
const parts = [Buffer.from('INK2', 'ascii'), Buffer.from(new Uint32Array([bins.size]).buffer)];
for (const [k, ids] of bins) {
  const m = ids.length, [cx, cz] = k.split(',').map(Number);
  const pos = new Float32Array(m * 12), c0 = new Uint16Array(m * 16), c1 = new Int8Array(m * 16), c2 = new Int8Array(m * 16), idx = new Int32Array(m * 6);
  ids.forEach((id, j) => {
    const o = id * 13, A = [F[o], F[o + 1], F[o + 2]], B = [F[o + 3], F[o + 4], F[o + 5]], W = [-1, 1, -2, 2];
    for (let c = 0; c < 4; c++) { const v = j * 4 + c, me = c < 2 ? A : B, ot = c < 2 ? B : A; pos.set(me, v * 3); c0.set([half(ot[0] - me[0]), half(ot[1] - me[1]), half(ot[2] - me[2]), half(W[c])], v * 4); c1.set([sn(F[o + 6]), sn(F[o + 7]), sn(F[o + 8]), 0], v * 4); c2.set([sn(F[o + 9]), sn(F[o + 10]), sn(F[o + 11]), sn(F[o + 12] / 2)], v * 4); }
    const v = j * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], j * 6);
  });
  parts.push(Buffer.from(new Int32Array([cx, cz, m]).buffer));
  for (const a of [pos, c0, c1, c2, idx]) parts.push(Buffer.from(a.buffer));
}
fs.writeFileSync(path.join(OUT, 'ink.bin'), Buffer.concat(parts));
fs.writeFileSync(path.join(OUT, 'prop.json'), JSON.stringify(res.meta, null, 1));
console.log(`${scene}: ${res.meshes} meshes, ${Math.round(res.tris)} tris, ${res.n} ink edges, materials`, res.materials);
await b.close();
