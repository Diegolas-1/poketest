// The Roads tool: every lane and trail as its control points (terrain.js
// ROAD_CTRL, smoothed into the road by a Catmull-Rom curve, as the game does).
// Click a road to pick it, drag its points on the ground, Alt + click on the
// road adds a point, Delete removes the picked point, "New road" draws one
// point by point (Enter or double-click ends it). Edits go to
// doc.roads.edit[<index>] = { at, ctrl, w } (at = its first generated point,
// so the edit finds its road again if roads are added in code) or
// doc.roads.added. The ground, the dirt and the plants follow the new road on
// Rebuild (and in the game); here the line shows where it will run.
import * as THREE from 'three';
import { E } from '../editlayer/index.js';
import { ROAD_CTRL_LIST } from '../terrain.js';
import { ROAD_CTRL_LIST as RAW_CTRL, ROAD_N0 as RAW_N } from '../terrain.js?raw';
import { S, push, emit } from './state.js';

let V = null;
const group = new THREE.Group(); group.name = 'roads'; group.visible = false;
export const roadsGroup = group;
export const R = { roads: [], sel: -1, pt: -1, drawing: null, w: 1.38 };
const ptGeo = new THREE.SphereGeometry(0.55, 12, 8);
const M = { pt: new THREE.MeshBasicMaterial({ color: '#ffd84a', depthTest: false, transparent: true }), sel: new THREE.MeshBasicMaterial({ color: '#ff5a3a', depthTest: false, transparent: true }),
  line: new THREE.LineBasicMaterial({ color: '#ffe9a8', depthTest: false, transparent: true, opacity: 0.85 }), lineSel: new THREE.LineBasicMaterial({ color: '#ff8a3a', depthTest: false, transparent: true }),
  edited: new THREE.LineBasicMaterial({ color: '#7dff9a', depthTest: false, transparent: true }) };

export function bindRoads(viewport) {
  V = viewport; V.scene.add(group);
  // the roads as the generators made them, then each edit
  R.roads = RAW_CTRL.slice(0, RAW_N).map((c, i) => ({ i, gen: c, ctrl: (ROAD_CTRL_LIST[i] || c).map((p) => p.slice()) }));
  for (const a of E.doc.roads.added || []) R.roads.push({ i: -1, added: a.id, gen: null, ctrl: a.ctrl.map((p) => p.slice()), w: a.w });
  for (const [k, e] of Object.entries(E.doc.roads.edit || {})) { const r = R.roads[+k]; if (r && e.del) r.del = true; if (r && e.w) r.w = e.w; }
}
const dense = (ctrl) => {
  const pts = ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  return c.getSpacedPoints(Math.max(2, Math.ceil(c.getLength() / 1.5)));
};
export function drawRoads() {
  group.clear();
  const H = E.fn.height;
  R.roads.forEach((r, k) => {
    if (r.del) return;
    const ed = !r.gen || JSON.stringify(r.gen) !== JSON.stringify(r.ctrl);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(dense(r.ctrl).map((p) => p.setY(H(p.x, p.z) + 0.35))), k === R.sel ? M.lineSel : ed ? M.edited : M.line);
    line.userData.road = k; line.renderOrder = 997;
    group.add(line);
    if (k !== R.sel) return;
    r.ctrl.forEach(([x, z], j) => {
      const m = new THREE.Mesh(ptGeo, j === R.pt ? M.sel : M.pt);
      m.position.set(x, H(x, z) + 0.4, z); m.userData.road = k; m.userData.pt = j; m.renderOrder = 999;
      group.add(m);
    });
  });
  if (R.drawing && R.drawing.length) {
    const pts = R.drawing.map(([x, z]) => new THREE.Vector3(x, H(x, z) + 0.4, z));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? dense(R.drawing).map((p) => p.setY(H(p.x, p.z) + 0.35)) : pts), M.lineSel);
    group.add(l);
    for (const p of pts) { const m = new THREE.Mesh(ptGeo, M.sel); m.position.copy(p); group.add(m); }
  }
  group.traverse((o) => { o.userData.noPick = false; });
}
export function showRoads(on) { group.visible = on; if (on) drawRoads(); else { R.sel = -1; R.pt = -1; R.drawing = null; } }

// ---------- the document ----------
function writeRoad(k) {
  const r = R.roads[k];
  if (r.added) { const a = E.doc.roads.added.find((x) => x.id === r.added); if (a) { a.ctrl = r.ctrl.map((p) => p.map((v) => +v.toFixed(2))); if (r.w) a.w = r.w; } return; }
  const same = JSON.stringify(r.gen) === JSON.stringify(r.ctrl);
  if (same && !r.del && !r.w) { delete E.doc.roads.edit[r.i]; return; }
  E.doc.roads.edit[r.i] = { at: r.gen[0], ...(r.del ? { del: true } : { ctrl: r.ctrl.map((p) => p.map((v) => +v.toFixed(2))) }), ...(r.w ? { w: r.w } : {}) };
}
const snap = () => JSON.stringify({ roads: R.roads, doc: E.doc.roads });
function setSnap(s) { const d = JSON.parse(s); R.roads = d.roads; E.doc.roads = d.doc; drawRoads(); emit('roads'); }
function change(label, fn) {
  const before = snap(); fn(); const after = snap();
  if (before === after) return;
  push({ label, undo: () => setSnap(before), redo: () => setSnap(after) });
  drawRoads(); emit('roads'); emit('changed');
}

// ---------- input (main.js passes the viewport's pointer events while the tool is on) ----------
let dragPt = null;
export function onDown(e, rr) {
  const g = V.ground(rr);
  if (R.drawing) {
    if (g) { R.drawing.push([g.x, g.z]); drawRoads(); }
    return true;
  }
  rr.params.Line = { threshold: Math.max(0.5, V.dist * 0.01) };
  const hits = rr.intersectObjects(group.children, false);
  const ph = hits.find((h) => h.object.userData.pt !== undefined);
  if (ph) { R.sel = ph.object.userData.road; R.pt = ph.object.userData.pt; dragPt = { before: snap() }; drawRoads(); emit('roads'); return true; }
  const l = hits.find((h) => h.object.userData.road !== undefined);
  if (l) {
    const k = l.object.userData.road;
    if (e.altKey && k === R.sel && g) {
      // a new point on the road, between the two nearest
      change('road: add point', () => {
        const c = R.roads[k].ctrl;
        let bi = 0, bd = Infinity;
        for (let j = 0; j < c.length - 1; j++) { const d = segD(g.x, g.z, c[j], c[j + 1]); if (d < bd) { bd = d; bi = j; } }
        c.splice(bi + 1, 0, [g.x, g.z]); R.pt = bi + 1; writeRoad(k);
      });
    } else { R.sel = k; R.pt = -1; drawRoads(); emit('roads'); }
    return true;
  }
  R.sel = -1; R.pt = -1; drawRoads(); emit('roads');
  return false;
}
export function onMove(e, rr) {
  if (!dragPt) return;
  const g = V.ground(rr); if (!g) return;
  R.roads[R.sel].ctrl[R.pt] = [g.x, g.z];
  dragPt.moved = true;
  drawRoads();
}
export function onUp() {
  if (!dragPt) return;
  const d = dragPt; dragPt = null;
  if (!d.moved) return;
  writeRoad(R.sel);
  const after = snap();
  push({ label: 'road: move point', undo: () => setSnap(d.before), redo: () => setSnap(after) });
  emit('changed');
}
export function onKey(e) {
  if (R.drawing && (e.code === 'Enter' || e.code === 'NumpadEnter')) { finish(); return true; }
  if (R.drawing && e.code === 'Escape') { R.drawing = null; drawRoads(); return true; }
  if ((e.code === 'Delete' || e.code === 'Backspace') && R.sel >= 0) {
    if (R.pt >= 0 && R.roads[R.sel].ctrl.length > 2) change('road: remove point', () => { R.roads[R.sel].ctrl.splice(R.pt, 1); R.pt = -1; writeRoad(R.sel); });
    return true;
  }
  return false;
}
export function startDrawing() { R.drawing = []; R.sel = -1; drawRoads(); emit('roads'); }
export function finish() {
  const pts = R.drawing; R.drawing = null;
  if (!pts || pts.length < 2) { drawRoads(); return; }
  change('new road', () => {
    const id = 'user/road_' + Date.now().toString(36);
    const a = { id, ctrl: pts.map((p) => p.map((v) => +v.toFixed(2))), w: R.w };
    E.doc.roads.added.push(a);
    R.roads.push({ i: -1, added: id, gen: null, ctrl: pts, w: R.w });
    R.sel = R.roads.length - 1;
  });
}
export function deleteRoad() {
  if (R.sel < 0) return;
  const k = R.sel;
  change('delete road', () => {
    const r = R.roads[k];
    if (r.added) { E.doc.roads.added = E.doc.roads.added.filter((a) => a.id !== r.added); r.del = true; }
    else { r.del = true; writeRoad(k); }
    R.sel = -1;
  });
}
export function resetRoad() {
  if (R.sel < 0 || !R.roads[R.sel].gen) return;
  const k = R.sel;
  change('road back to generated', () => { const r = R.roads[k]; r.ctrl = r.gen.map((p) => p.slice()); delete r.w; r.del = false; writeRoad(k); });
}
export function setWidth(w) { if (R.sel < 0) { R.w = w; return; } const k = R.sel; change('road width', () => { R.roads[k].w = w; writeRoad(k); }); }
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); };
void S;
