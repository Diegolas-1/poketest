// The Plant brush: sow trees, bushes, rocks, ferns or flowers where you paint
// (Shift + paint removes plants under the brush: yours, and the generated
// ones). Planted plants are kept as points in the edit document
// (doc.vegAdd: { id, k, x, z, rot, s }); veg.js grows them with the same
// models, billboards and colliders as the generated ones. Here they show as
// a preview until the next Rebuild.
import * as THREE from 'three';
import { E, vegKey } from '../editlayer/index.js';
import { makeTree, makeBush, makeRock, makeClump, TILE } from '../foliage.js';
import { S, push, emit } from './state.js';
import { BRUSH } from './terrain.js';

export const PLANT = { k: 'tree:linden', dens: 0.5, s0: 0.8, s1: 1.15, gap: 3 };
export const PLANT_KINDS = [
  ...['tiered', 'shade', 'linden', 'beech', 'oak', 'spreading', 'multistem', 'bushy', 'sapling', 'birch', 'lombardy', 'cypress', 'giant', 'oldgrowth', 'scotspine', 'dead', 'willow', 'palm', 'maple'].map((k) => ['tree:' + k, k + ' tree', 6]),
  ['bush', 'bush', 2.2], ['rock', 'rock', 2], ['fern', 'fern', 1.2], ['flower', 'flowers', 0.8],
];
// the model for a kind (veg.js uses the same choices)
const models = new Map();
export function plantModel(k) {
  if (!models.has(k)) {
    const [a, b] = k.split(':');
    models.set(k, a === 'tree' ? makeTree(b, 11) : a === 'bush' ? makeBush(2, { size: 1.3 }) : a === 'rock' ? makeRock(4, 1.4) : a === 'fern' ? makeClump(1, TILE.fern, 1.4) : makeClump(3, TILE.flowersY, 0.9));
  }
  return models.get(k);
}

let W = null;
const preview = new THREE.Group(); preview.name = 'planted';
export function bindScatter(world) { W = world; W.scene.add(preview); }
// the preview: one instanced mesh per model part, for the plants added since load
const loaded = new Set();
export function markLoaded() { for (const p of E.doc.vegAdd || []) loaded.add(p.id); }
export function drawPreview() {
  preview.clear();
  const by = new Map();
  for (const p of E.doc.vegAdd || []) { if (loaded.has(p.id)) continue; if (!by.has(p.k)) by.set(p.k, []); by.get(p.k).push(p); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (const [k, list] of by) {
    const model = plantModel(k);
    for (const part of model.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot); im.setMatrixAt(i, m4.compose(v.set(p.x, E.fn.height(p.x, p.z) - 0.05, p.z), q, s.set(p.s, p.s, p.s))); });
      im.castShadow = true; im.userData.noPick = true;
      preview.add(im);
    }
  }
}

// ---------- the brush ----------
let stroke = null;
const rnd = Math.random;
export function plantBegin(p, erase) { stroke = { erase, before: JSON.stringify({ a: E.doc.vegAdd, v: E.doc.veg }), hidden: [] }; plantApply(p, 0.1); }
export function plantApply(p, dt) {
  if (!stroke) return;
  const R = BRUSH.r;
  E.doc.vegAdd ||= [];
  if (stroke.erase) {
    const before = E.doc.vegAdd.length;
    E.doc.vegAdd = E.doc.vegAdd.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) > R);
    // generated (and loaded) plants under the brush
    for (const sc of W.veg.scatters) for (const c of sc.chunks) {
      if (Math.hypot(c.center.x - p.x, c.center.z - p.z) > c.radius + R) continue;
      c.idx.forEach((pi, j) => {
        const q = sc.points[pi];
        if (q._del || Math.hypot(q.x - p.x, q.z - p.z) > R) return;
        if (q._add) E.doc.vegAdd = E.doc.vegAdd.filter((x) => x.id !== q._add);
        else E.doc.veg[q._k || vegKey(q.x, q.z)] = { del: 1 };
        q._del = true; stroke.hidden.push([c, j, q]);
        hideInst(c, j);
      });
    }
    if (before !== E.doc.vegAdd.length) drawPreview();
    return;
  }
  // sow: about dens plants per 10 m x 10 m and second of painting, spaced apart
  const n = Math.max(1, Math.round(PLANT.dens * Math.PI * R * R / 100 * Math.min(1, dt * 4) + rnd()));
  let added = 0;
  const kind = PLANT_KINDS.find((x) => x[0] === PLANT.k), gap = Math.max(PLANT.gap, kind ? kind[2] * 0.5 : 1);
  for (let t = 0; t < n * 4 && added < n; t++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (E.doc.vegAdd.some((q) => Math.hypot(q.x - x, q.z - z) < gap)) continue;
    if (E.fn.pathSD && E.fn.pathSD(x, z) < 0.6) continue;
    E.doc.vegAdd.push({ id: 'p' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), k: PLANT.k, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rnd() * 6.283).toFixed(3), s: +(PLANT.s0 + rnd() * (PLANT.s1 - PLANT.s0)).toFixed(3) });
    added++;
  }
  if (added) drawPreview();
}
export function plantEnd() {
  if (!stroke) return;
  const st = stroke; stroke = null;
  const after = JSON.stringify({ a: E.doc.vegAdd, v: E.doc.veg });
  if (after === st.before) return;
  const set = (json, hide) => { const d = JSON.parse(json); E.doc.vegAdd = d.a; E.doc.veg = d.v; for (const [c, j, q] of st.hidden) { q._del = hide; if (hide) hideInst(c, j); else showInst(c, j, q); } drawPreview(); emit('changed'); };
  push({ label: st.erase ? 'remove plants' : 'plant', undo: () => set(st.before, false), redo: () => set(after, true) });
  emit('changed');
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function hideInst(c, j) { _m.makeScale(0, 0, 0); c.meshes[0].setMatrixAt(j, _m); c.meshes[0].instanceMatrix.needsUpdate = true; }
function showInst(c, j, q) { _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), q.rot); c.meshes[0].setMatrixAt(j, _m.compose(_v.set(q.x, q.y, q.z), _q, _s.set(q.s, q.s * (q.sy || 1), q.s))); c.meshes[0].instanceMatrix.needsUpdate = true; }
void S;
