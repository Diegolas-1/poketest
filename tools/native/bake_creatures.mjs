// Bakes the Pokémon models (3DS X/Y rips, Source .smd) for the native game:
// native/creatures/<id>.glb, one skinned mesh per material on one skeleton,
// textures embedded (Godot extracts them on import), in the game's frame:
// metres, Y up, facing +Z (the people's forward), feet (or belly) at y = 0
// once posed. The rips have no animation; creature.gd animates the bones.
//
//   node tools/native/bake_creatures.mjs [id...] [--src dir]
//
// --src (default $CREATURE_SRC) holds the extracted rips as The Models
// Resource ships them: <src>/<Folder>/<Name>.SMD and <src>/<Folder>/images/*.png.
// Each species below names its files and its size. An .smd is plain text:
// bones (name, parent), the bind pose (position + XYZ euler per bone, Z up,
// the model facing -Y) and triangles (material, then per corner position,
// normal, uv and up to n bone weights). The bind pose becomes the skeleton's
// rest; vertices are in model space at that pose.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const require = createRequire(path.join(ROOT, 'tools/world/package.json'));
const { Document, NodeIO } = require('@gltf-transform/core');
const sharp = require('sharp');

const SPECIES = {
  // ~0.5 m long and ~0.4 m tall once its front is reared up (the bind pose lies straight)
  // its red forked horn has no bone of its own: the orange texels on the head get one ("Horn")
  caterpie: { dir: 'Caterpie', smd: 'Caterpie.SMD', scale: 0.025,
    extra: [{ name: 'Horn', parent: 'Head', png: 'pm0010_00_Body1.png', pick: ([r, g, b]) => r > 200 && g < 160 && b < 110, ramp: 1.2 }] },
  // the heads at about 1.2 m with the necks up (about Ben's chest)
  doduo: { dir: 'Doduo', smd: 'DoduoM.SMD', scale: 0.0082, split: { 'pm0084_00_Eye1.png': ['LHead', 'RHead'] } },
};

const args = process.argv.slice(2);
let src = process.env.CREATURE_SRC || '';
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src') src = args[++i];
  else ids.push(args[i]);
}
if (!src) throw new Error('--src <dir with the extracted rips> (or CREATURE_SRC)');
const OUT = path.join(ROOT, 'native/creatures');
fs.mkdirSync(OUT, { recursive: true });

// ---------- small 4x4 helpers (column-major like glTF) ----------
function rotXYZ(rx, ry, rz) {   // R = Rz * Ry * Rx
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
const mat = (R, t) => ({ R, t });
const mul = (A, B) => ({
  R: A.R.map((row) => [0, 1, 2].map((j) => row[0] * B.R[0][j] + row[1] * B.R[1][j] + row[2] * B.R[2][j])),
  t: A.R.map((row, i) => row[0] * B.t[0] + row[1] * B.t[1] + row[2] * B.t[2] + A.t[i]),
});
const inv = (A) => {
  const RT = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A.R[j][i]));
  return { R: RT, t: RT.map((row) => -(row[0] * A.t[0] + row[1] * A.t[1] + row[2] * A.t[2])) };
};
function quat(R) {
  const [m00, m01, m02] = R[0], [m10, m11, m12] = R[1], [m20, m21, m22] = R[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}
const col = (A) => [A.R[0][0], A.R[1][0], A.R[2][0], 0, A.R[0][1], A.R[1][1], A.R[2][1], 0, A.R[0][2], A.R[1][2], A.R[2][2], 0, A.t[0], A.t[1], A.t[2], 1];
// the rips' frame (Z up, facing -Y, model units) -> the game's (Y up, facing +Z, metres): (x, y, z) -> (x, z, -y)
const M = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
const toGame = (v) => [v[0], v[2], -v[1]];

function parseSMD(text) {
  const L = text.split(/\r?\n/);
  let i = L.indexOf('nodes') + 1;
  const nodes = [];
  for (; L[i] !== 'end'; i++) {
    const m = L[i].match(/^\s*(\d+)\s+"([^"]*)"\s+(-?\d+)/);
    nodes[+m[1]] = { name: m[2], parent: +m[3] };
  }
  i = L.indexOf('time 0', i) + 1;
  for (; L[i] !== 'end'; i++) {
    const v = L[i].trim().split(/\s+/).map(Number);
    nodes[v[0]].local = mat(rotXYZ(v[4], v[5], v[6]), [v[1], v[2], v[3]]);
  }
  i = L.indexOf('triangles', i) + 1;
  const tris = [];
  for (; L[i] !== 'end' && i < L.length; i += 4) {
    const tri = { mat: L[i].trim(), v: [] };
    for (let k = 1; k <= 3; k++) {
      const t = L[i + k].trim().split(/\s+/).map(Number);
      const n = t[9] || 0;
      const w = [];
      for (let j = 0; j < n; j++) w.push([t[10 + 2 * j], t[11 + 2 * j]]);
      if (!w.length) w.push([t[0], 1]);
      tri.v.push({ p: t.slice(1, 4), n: t.slice(4, 7), uv: [t[7], t[8]], w });
    }
    tris.push(tri);
  }
  return { nodes, tris };
}

async function bake(id) {
  const sp = SPECIES[id];
  const dir = path.join(src, sp.dir);
  const { nodes, tris } = parseSMD(fs.readFileSync(path.join(dir, sp.smd), 'utf8'));
  const s = sp.scale;
  // world bind matrices in the rip's frame, then in the game's (rotation by M, translation scaled)
  const W = [];
  nodes.forEach((n, i) => { W[i] = n.parent >= 0 ? mul(W[n.parent], n.local) : n.local; });
  const G = W.map((w) => ({ R: M.map((row) => [0, 1, 2].map((j) => row[0] * w.R[0][j] + row[1] * w.R[1][j] + row[2] * w.R[2][j])), t: toGame(w.t).map((x) => x * s) }));
  // extra bones: texels picked by colour on a bone's skin move to a new child bone, based
  // at the picked vertex nearest the parent's origin (weights ramp in over `ramp` units)
  const extra = [];
  for (const e of sp.extra || []) {
    const pi = nodes.findIndex((n) => n.name === e.parent);
    const { data, info } = await sharp(path.join(dir, 'images', e.png)).raw().toBuffer({ resolveWithObject: true });
    const texel = (uv) => {
      const x = Math.min(info.width - 1, Math.floor((((uv[0] % 1) + 1) % 1) * info.width));
      const y = Math.min(info.height - 1, Math.floor((1 - (((uv[1] % 1) + 1) % 1)) * info.height));
      const o = (y * info.width + x) * info.channels;
      return [data[o], data[o + 1], data[o + 2]];
    };
    const picked = [];
    for (const t of tris) if (t.mat === e.png) for (const v of t.v) if (v.w.length === 1 && v.w[0][0] === pi && e.pick(texel(v.uv))) picked.push(v);
    let base = null, bd = 1e9;
    for (const v of picked) { const d = Math.hypot(...v.p.map((x, j) => x - W[pi].t[j])); if (d < bd) { bd = d; base = v.p; } }
    const ni = nodes.length;
    nodes.push({ name: e.name, parent: pi });
    W[ni] = { R: W[pi].R, t: base };
    G[ni] = { R: G[pi].R, t: toGame(base).map((x) => x * s) };
    for (const v of picked) {
      const d = Math.hypot(...v.p.map((x, j) => x - base[j]));
      const a = Math.min(1, d / e.ramp), k = a * a * (3 - 2 * a);
      v.w = k >= 0.999 ? [[ni, 1]] : [[ni, k], [pi, 1 - k]];
    }
    extra.push(`${e.name}: ${picked.length} corners`);
  }
  if (extra.length) console.log('  extra bones', extra.join(', '));
  // the skeleton: every node under the model's root except the mesh holders
  const skip = (n, i) => n.parent < 0 || /Skin$|^VriVis/.test(n.name);
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene(id);
  doc.getRoot().setDefaultScene(scene);
  const top = doc.createNode(id);
  scene.addChild(top);
  const jn = [];   // node index -> joint Node
  nodes.forEach((n, i) => {
    if (skip(n, i)) return;
    const pi = nodes[n.parent] && !skip(nodes[n.parent], n.parent) ? n.parent : -1;
    const loc = pi >= 0 ? mul(inv(G[pi]), G[i]) : G[i];
    const nd = doc.createNode(n.name).setTranslation(loc.t).setRotation(quat(loc.R));
    jn[i] = nd;
    if (pi >= 0) jn[pi].addChild(nd); else top.addChild(nd);
  });
  const joints = [];
  const jidx = {};
  jn.forEach((nd, i) => { if (nd) { jidx[i] = joints.length; joints.push(i); } });
  const skin = doc.createSkin(id + '_skin');
  for (const i of joints) skin.addJoint(jn[i]);
  skin.setSkeleton(jn[joints[0]]);
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(new Float32Array(joints.flatMap((i) => col(inv(G[i]))))).setBuffer(buf));
  // materials (embedded textures); a split material gets one copy per named bone's branch
  const byName = Object.fromEntries(nodes.map((n, i) => [n.name, i]));
  const under = (b, root) => { for (let k = b; k >= 0; k = nodes[k].parent) if (k === root) return true; return false; };
  const mats = {};
  const material = (key, png) => {
    if (mats[key]) return mats[key];
    const img = fs.readFileSync(path.join(dir, 'images', png));
    const nm = key.slice(id.length + 1);   // Godot names the extracted file <glb>_<texture>.png
    const tex = doc.createTexture(nm).setImage(img).setMimeType('image/png').setURI(nm + '.png');
    return (mats[key] = doc.createMaterial(key).setBaseColorTexture(tex).setRoughnessFactor(1).setMetallicFactor(0));
  };
  const groups = {};
  for (const t of tris) {
    let key = t.mat.replace(/\.png$/i, '').replace(/^pm\d+_\d+_/, id + '_').toLowerCase();
    const sp2 = sp.split && sp.split[t.mat];
    if (sp2) {
      const b = t.v[0].w.reduce((a, c) => (c[1] > a[1] ? c : a))[0];
      const hit = sp2.find((nm) => under(b, byName[nm]));
      if (hit) key += '_' + hit.toLowerCase();
    }
    (groups[key] = groups[key] || { png: t.mat, tris: [] }).tris.push(t);
  }
  const mesh = doc.createMesh(id);
  let flipped = 0, faces = 0;
  for (const key of Object.keys(groups).sort()) {
    const g = groups[key];
    const pos = [], nor = [], uv = [], J = [], Wt = [], idx = [];
    const seen = new Map();
    const vert = (v) => {
      const w = v.w.filter((x) => jidx[x[0]] !== undefined).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = w.reduce((a, x) => a + x[1], 0) || 1;
      const k = [...v.p, ...v.n, ...v.uv, ...w.flat()].map((x) => x.toFixed(5)).join(',');
      if (seen.has(k)) return seen.get(k);
      const n = pos.length / 3;
      pos.push(...toGame(v.p).map((x) => x * s));
      const nn = toGame(v.n), nl = Math.hypot(...nn) || 1;
      nor.push(...nn.map((x) => x / nl));
      uv.push(v.uv[0], 1 - v.uv[1]);
      for (let j = 0; j < 4; j++) { J.push(w[j] ? jidx[w[j][0]] : 0); Wt.push(w[j] ? w[j][1] / sum : 0); }
      seen.set(k, n);
      return n;
    };
    for (const t of g.tris) {
      const ix = t.v.map(vert);
      // glTF fronts are counter-clockwise: keep the winding that agrees with the normals
      const p = ix.map((k) => pos.slice(k * 3, k * 3 + 3));
      const e1 = p[1].map((x, j) => x - p[0][j]), e2 = p[2].map((x, j) => x - p[0][j]);
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const vn = [0, 1, 2].map((j) => nor[ix[0] * 3 + j] + nor[ix[1] * 3 + j] + nor[ix[2] * 3 + j]);
      faces++;
      if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] < 0) { idx.push(ix[0], ix[2], ix[1]); flipped++; }
      else idx.push(...ix);
    }
    const acc = (type, arr, C = Float32Array) => doc.createAccessor().setType(type).setArray(new C(arr)).setBuffer(buf);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv))
      .setAttribute('JOINTS_0', acc('VEC4', J, Uint16Array)).setAttribute('WEIGHTS_0', acc('VEC4', Wt))
      .setIndices(acc('SCALAR', idx, Uint32Array)).setMaterial(material(key.replace(/_(l|r)head$/, ''), g.png));
    if (key !== key.replace(/_(l|r)head$/, '')) {
      // its own material (same texture) so each head's eyes can change on their own
      const m2 = material(key.replace(/_(l|r)head$/, ''), g.png).clone().setName(key);
      prim.setMaterial(m2);
    }
    mesh.addPrimitive(prim);
    console.log(`  ${key}: ${pos.length / 3} vertices, ${idx.length / 3} triangles`);
  }
  const body = doc.createNode(id + '_mesh').setMesh(mesh).setSkin(skin);
  top.addChild(body);
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const t of tris) for (const v of t.v) toGame(v.p).forEach((x, j) => { lo[j] = Math.min(lo[j], x * s); hi[j] = Math.max(hi[j], x * s); });
  const out = path.join(OUT, id + '.glb');
  await new NodeIO().writeBinary(doc).then((b) => fs.writeFileSync(out, b));
  console.log(`${id}: ${joints.length} bones, ${faces} faces (${flipped} rewound), bind box ${lo.map((x) => x.toFixed(2))} .. ${hi.map((x) => x.toFixed(2))} -> ${path.relative(ROOT, out)}`);
}

for (const id of ids.length ? ids : Object.keys(SPECIES)) await bake(id);
