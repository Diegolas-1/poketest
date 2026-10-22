// Bakes the web build's vector ink (web/world/outline.js addEdgeLines) for the
// native game: every edge line in the scene, in world space, with the normals
// of the two faces it joins and its kind, to native/world/ink.bin. The native
// game draws them with native/ink.gd + shaders/ink_lines.gdshader.
//   ink.bin: ready-made vertex arrays (the native game only slices them):
//     'INK2', uint32 cell count, then per 64 m cell (edges binned by their
//     middle, for culling): int32 cx, int32 cz, uint32 edges m, then
//       position float32 xyz        [4m]  this end of the edge (quad corners A-, A+, B-, B+)
//       custom0  float16 xyzw       [4m]  other end minus this end, w = side +-1 (|w| 2 = end B)
//       custom1  snorm8 xyzw        [4m]  normal of face 1
//       custom2  snorm8 xyzw        [4m]  normal of face 2, w = kind / 2
//       index    int32              [6m]
//     (kind 0 = silhouette candidate, 1 = hard crease, 2 = open boundary)
// The edges are those outline.js computed: parts cut against each other
// (partEdges), so overlapping parts are outlined as one shape. The town's
// props that the web outlines with its screen-space pass instead (instanced
// pickets, posts and rocks: kind 'solid' in outline.js) get
// vector ink here too, from the same edge finder, since that is far cheaper
// than a screen-space pass on the phone. Smooth high-poly solids (tree
// trunks) are left to an inverted hull in the native game (Ink.outline_mesh)
// and leaf cards (bushes, hedges, canopies) to its leaf ink
// (Ink.outline_plant): ink_meshes.json lists the world box centre of each
// such town mesh ({hull: [[x,y,z]...], leaf: [...]}), which the native game
// matches against the meshes of town.glb (Ink.outline_town).
// Run: node tools/native/bake_ink.mjs   (serves web/ on :8790 if nothing is there)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/world');
fs.mkdirSync(OUT, { recursive: true });

const up = async () => { try { return (await fetch('http://localhost:8790/world/')).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', '8790'], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
await p.goto('http://localhost:8790/world/?test&q=high&outline=0');
await p.waitForFunction(() => window.worldReady, null, { timeout: 300000 });
console.log('world ready');

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const O = await import('/world/outline.js');
  const T = await import('/world/terrain.js');
  const w = window.world;
  const shown = (o) => { for (let q = o; q; q = q.parent) if (q.userData.inkLines ? false : !q.visible) return false; return true; };
  const out = [];
  let objs = 0;
  w.scene.updateMatrixWorld(true);
  const s = new THREE.Vector3(), e = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), nm = new THREE.Matrix3();
  w.scene.traverse((o) => {
    if (!o.userData.inkLines || !shown(o)) return;
    const g = o.geometry, S = g.attributes.instanceStart, E = g.attributes.instanceEnd;
    const N1 = g.attributes.instanceN1, N2 = g.attributes.instanceN2, K = g.attributes.instanceK;
    if (!S || !N1) return;
    objs++;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < S.count; i++) {
      s.fromBufferAttribute(S, i).applyMatrix4(o.matrixWorld);
      e.fromBufferAttribute(E, i).applyMatrix4(o.matrixWorld);
      n1.fromBufferAttribute(N1, i).applyMatrix3(nm).normalize();
      n2.fromBufferAttribute(N2, i).applyMatrix3(nm).normalize();
      out.push(s.x, s.y, s.z, e.x, e.y, e.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z, K.getX(i));
    }
  });
  // screen-space 'solid' props of the town (outline.js autoKind), as vector ink
  const mark = (o) => { for (let q = o; q; q = q.parent) if (q.userData.outline !== undefined) return q.userData.outline; return undefined; };
  const radius = (o, g) => { if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(); };
  let solids = 0, meets = 0;
  // where a prop goes into the ground or the water (rocks in the stream bank,
  // posts in the grass): the web's screen-space pass draws a line there; here
  // the cut of each triangle with the visible ground surface becomes an
  // always-shown line (kind 2)
  // the terrain as drawn: terrain.js buildTerrain's 420 m grid of 280 cells,
  // each cell split along its (0,1)-(1,0) diagonal
  const meshH = (x, z) => {
    const u = (x + 210) / 1.5, w2 = (z + 210) / 1.5, i = Math.floor(u), j = Math.floor(w2), fx = u - i, fz = w2 - j;
    const H = (a, b) => T.height(-210 + a * 1.5, -210 + b * 1.5);
    const ha = H(i, j), hb = H(i, j + 1), hc = H(i + 1, j + 1), hd = H(i + 1, j);
    return fx + fz <= 1 ? ha + fz * (hb - ha) + fx * (hd - ha) : hc + (1 - fx) * (hb - hc) + (1 - fz) * (hd - hc);
  };
  const ground = (x, z) => Math.max(meshH(x, z), T.waterLevel(x, z));
  const meet = (geo, m4) => {
    const P = geo.attributes.position, idx = geo.index ? geo.index.array : null, n = idx ? idx.length : P.count;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], d = [0, 0, 0], nr = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    for (let t = 0; t + 2 < n; t += 3) {
      for (let c = 0; c < 3; c++) { v[c].fromBufferAttribute(P, idx ? idx[t + c] : t + c).applyMatrix4(m4); d[c] = v[c].y - ground(v[c].x, v[c].z); }
      if ((d[0] > 0) === (d[1] > 0) && (d[1] > 0) === (d[2] > 0)) continue;
      const pts = [];
      for (let c = 0; c < 3; c++) {
        const a = c, b2 = (c + 1) % 3;
        if ((d[a] > 0) !== (d[b2] > 0)) { const f = d[a] / (d[a] - d[b2]); pts.push(v[a].clone().lerp(v[b2], f)); }
      }
      if (pts.length < 2) continue;

      nr.copy(t1.subVectors(v[1], v[0])).cross(t2.subVectors(v[2], v[0])).normalize();
      out.push(pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z, nr.x, nr.y, nr.z, nr.x, nr.y, nr.z, 2);
      meets++;
    }
  };
  const hull = [], leaf = [], bb = new THREE.Box3(), cc = new THREE.Vector3();
  // the box Godot gives the same mesh in town.glb: a mesh's own box through its
  // transform; instances are merged into one world-space mesh there (exact box)
  const centre = (o) => {
    if (o.isInstancedMesh) {
      bb.makeEmpty(); const P = o.geometry.attributes.position, v = new THREE.Vector3(), mm = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mm); mm.premultiply(o.matrixWorld); for (let j = 0; j < P.count; j++) bb.expandByPoint(v.fromBufferAttribute(P, j).applyMatrix4(mm)); }
    } else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
    bb.getCenter(cc); return [+cc.x.toFixed(3), +cc.y.toFixed(3), +cc.z.toFixed(3)];
  };
  const im = new THREE.Matrix4(), m4 = new THREE.Matrix4();
  w.town.group.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.userData.inkLines || !shown(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    let k = mark(o);
    if (k === undefined) {
      // (an instanced part whose material is shared with lined meshes carries
      // their polygon offset, but still shows an outline on the web)
      if (m.isShaderMaterial || m.depthWrite === false || (m.polygonOffset && !o.isInstancedMesh) || m.side === THREE.BackSide || (m.transparent && m.opacity < 0.99)) k = null;
      else if (m.alphaTest > 0 && m.map) k = 'leaf';
      else k = radius(o, o.geometry) < 0.4 ? 'ground' : 'solid';
    }
    if (k === 'leaf') { leaf.push(centre(o)); return; }
    if (k === 'solid' && !o.isInstancedMesh) { hull.push(centre(o)); return; }
    if (k !== 'solid') return;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < n; i++) {
      if (o.isInstancedMesh) { o.getMatrixAt(i, im); m4.multiplyMatrices(o.matrixWorld, im); } else m4.copy(o.matrixWorld);
      const ed = O.partEdges(o.geometry, m4, [], -1);
      for (let j = 0; j < ed.k.length; j++) out.push(...ed.pos.slice(j * 6, j * 6 + 6), ...ed.n1.slice(j * 3, j * 3 + 3), ...ed.n2.slice(j * 3, j * 3 + 3), ed.k[j]);
      meet(o.geometry, m4);
      solids++;
    }
  });
  const f = new Float32Array(out);
  const u8 = new Uint8Array(f.buffer);
  let str = ''; for (let i = 0; i < u8.length; i += 0x8000) str += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { objs, solids, meets, hull, leaf, n: f.length / 13, b64: btoa(str) };
});

// float32 -> float16 bits
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const half = (v) => {
  f32[0] = v; const x = u32[0], sgn = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e <= 0) return sgn;
  if (e >= 31) return sgn | 0x7c00;
  return sgn | (e << 10) | ((m + 0x1000) >>> 13 > 0x3ff ? 0x3ff : (m + 0x1000) >>> 13);
};
const sn = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const F = new Float32Array(new Uint8Array(Buffer.from(res.b64, 'base64')).buffer);
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
    const o = id * 13, A = [F[o], F[o + 1], F[o + 2]], B = [F[o + 3], F[o + 4], F[o + 5]];
    const W = [-1, 1, -2, 2];
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
fs.writeFileSync(path.join(OUT, 'ink.bin'), Buffer.concat(parts));
fs.writeFileSync(path.join(OUT, 'ink_meshes.json'), JSON.stringify({ hull: res.hull, leaf: res.leaf }));
console.log('ink_meshes.json', res.hull.length, 'hull', res.leaf.length, 'leaf');
console.log('ink.bin', res.n, 'edges from', res.objs, 'line objects +', res.solids, 'props (', res.meets, 'ground cuts),', bins.size, 'cells,', (fs.statSync(path.join(OUT, 'ink.bin')).size / 1048576).toFixed(2), 'MB');
await b.close();
