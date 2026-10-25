// Object tools: the selection, the gizmo (move / turn / scale, one pivot for
// several), duplicate, delete, hide in game, drop to the ground, adding from
// the asset browser, and single plants. Every change is written to the edit
// document (E.doc.objects / added / veg) and is one undo step.
import * as THREE from 'three';
import { E, vegKey } from '../editlayer/index.js';
import { makeKind, find } from '../editlayer/objects.js';
import { S, push, emit, touch } from './state.js';

let V = null, W = null;
export const SNAP = { move: 0, rot: 0, scale: 0, ground: true, surface: true };
export function bindObjects(viewport, world) {
  V = viewport; W = world;
  V.scene.add(pivot);
  const tc = V.gizmo;
  tc.attach(pivot); tc.detach();
  tc.addEventListener('mouseDown', () => { if (S.sel.length) dragStart(); });
  tc.addEventListener('objectChange', dragMove);
  tc.addEventListener('mouseUp', dragEnd);
}

// ---------- ids and the document ----------
export const reg = () => W.town.reg;
export function idOf(e, o) {
  if (o === e.o) return e.id;
  const path = [];
  for (let q = o; q && q !== e.o; q = q.parent) path.unshift('c' + q.parent.children.indexOf(q));
  return e.id + '>' + path.join('>');
}
export function entryOf(o) {
  for (let q = o; q; q = q.parent) { const e = reg().list.find((x) => x.o === q); if (e) return e; }
  return null;
}
const docEdit = (id) => (E.doc.objects[id] ||= {});
function cleanEdit(id) {
  const d = E.doc.objects[id];
  if (d && !d.pos && !d.rot && !d.scl && !d.del && !d.hide) delete E.doc.objects[id];
}
const addedOf = (e) => (e.added ? E.doc.added.find((a) => a.id === e.added.id) : null);

// the transform of an item, written to the document
function writeTransform(it) {
  const o = it.o;
  const pos = o.position.toArray().map((v) => +v.toFixed(4)), rot = [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(5)), scl = o.scale.toArray().map((v) => +v.toFixed(4));
  if (it.kind === 'veg') return writeVeg(it);
  const a = addedOf(it.e);
  if (a && it.o === it.e.o) { a.pos = pos; a.rot = rot; a.scl = scl; return; }
  const d = docEdit(it.id);
  d.at = it.e.anchor; d.label = it.e.label;
  d.pos = pos; d.rot = rot;
  if (scl.some((v) => Math.abs(v - 1) > 1e-4)) d.scl = scl; else delete d.scl;
  it.e.moved = true;
}

// ---------- selection ----------
export function select(items, add = false) {
  if (!add) S.sel = [];
  for (const it of items) {
    const i = S.sel.findIndex((x) => x.o === it.o && x.j === it.j);
    if (i >= 0 && add) S.sel.splice(i, 1); else if (i < 0) S.sel.push(it);
  }
  syncGizmo();
  emit('select');
}
export function itemOf(e, o = e.o) { return { kind: 'obj', e, o, id: idOf(e, o) }; }
export function itemFromHit(h, drill = false) {
  if (h.object.isInstancedMesh && h.object.userData.veg) return vegItem(h.object, h.instanceId);
  const e = entryOf(h.object);
  if (!e) return null;
  if (!drill) return itemOf(e);
  // drill down: one level deeper than the current selection on each click
  const cur = S.sel[0] && S.sel[0].e === e ? S.sel[0].o : null;
  const chain = [];
  for (let q = h.object; q && q !== e.o; q = q.parent) chain.unshift(q);
  let o = chain[0] || e.o;
  if (cur) { const i = chain.indexOf(cur); if (i >= 0 && chain[i + 1]) o = chain[i + 1]; else if (i >= 0) o = cur; }
  return itemOf(e, o);
}

// ---------- the gizmo: one pivot for the whole selection ----------
const pivot = new THREE.Object3D();
pivot.name = 'pivot';
let drag = null;
export function setMode(m) { V.gizmo.setMode(m); syncGizmo(); }
export function syncGizmo() {
  const tc = V.gizmo;
  const objs = S.sel.filter((s) => !s.locked);
  if (!objs.length || !['move', 'rotate', 'scale'].includes(S.tool)) { tc.detach(); V.gizmoHelper.visible = false; return; }
  tc.setMode(S.tool === 'move' ? 'translate' : S.tool);
  const c = new THREE.Vector3();
  for (const it of objs) c.add(worldPos(it));
  c.divideScalar(objs.length);
  pivot.position.copy(c); pivot.rotation.set(0, objs.length === 1 && it0Yaw(objs[0]) || 0, 0); pivot.scale.set(1, 1, 1);
  pivot.updateMatrixWorld(true);
  tc.attach(pivot); V.gizmoHelper.visible = true;
  tc.translationSnap = SNAP.move || null; tc.rotationSnap = SNAP.rot ? THREE.MathUtils.degToRad(SNAP.rot) : null; tc.scaleSnap = SNAP.scale || null;
  tc.setSpace(objs.length === 1 ? 'local' : 'world');
}
const it0Yaw = (it) => { it.o.updateMatrixWorld(true); const e = it.o.matrixWorld.elements; return Math.atan2(e[8], e[0]); };
function worldPos(it) {
  if (it.kind === 'veg') return new THREE.Vector3(it.p.x, it.p.y, it.p.z);
  it.o.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(it.o.matrixWorld);
}
function snap(it) { return it.kind === 'veg' ? { p: [it.p.x, it.p.y, it.p.z, it.p.rot, it.p.s] } : { p: it.o.position.clone(), r: it.o.rotation.clone(), s: it.o.scale.clone() }; }
function restore(it, st) {
  if (it.kind === 'veg') { [it.p.x, it.p.y, it.p.z, it.p.rot, it.p.s] = st.p; vegMatrix(it); return; }
  it.o.position.copy(st.p); it.o.rotation.copy(st.r); it.o.scale.copy(st.s); it.o.updateMatrixWorld(true);
}
function dragStart() {
  pivot.updateMatrixWorld(true);
  drag = { inv: pivot.matrixWorld.clone().invert(), items: S.sel.map((it) => ({ it, st: snap(it), w: worldMatrix(it) })) };
}
function worldMatrix(it) {
  if (it.kind === 'veg') return new THREE.Matrix4().compose(new THREE.Vector3(it.p.x, it.p.y, it.p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.p.rot), new THREE.Vector3(it.p.s, it.p.s, it.p.s));
  it.o.updateMatrixWorld(true);
  return it.o.matrixWorld.clone();
}
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function dragMove() {
  if (!drag) return;
  pivot.updateMatrixWorld(true);
  const D = new THREE.Matrix4().multiplyMatrices(pivot.matrixWorld, drag.inv);
  for (const { it, w } of drag.items) {
    const m = new THREE.Matrix4().multiplyMatrices(D, w);
    if (it.kind === 'veg') {
      m.decompose(_p, _q, _s); _e.setFromQuaternion(_q, 'YXZ');
      it.p.x = _p.x; it.p.z = _p.z; it.p.y = SNAP.ground && S.tool === 'move' ? E.fn.height(_p.x, _p.z) - 0.05 : _p.y; it.p.rot = _e.y; it.p.s = _s.x;
      vegMatrix(it); continue;
    }
    const par = it.o.parent; par.updateMatrixWorld(true);
    m.premultiply(new THREE.Matrix4().copy(par.matrixWorld).invert());
    m.decompose(it.o.position, it.o.quaternion, it.o.scale);
    if (SNAP.ground && S.tool === 'move' && it.o === it.e.o && par === W.town.group) it.o.position.y = E.fn.height(it.o.position.x, it.o.position.z) + (it.lift || 0);
    it.o.updateMatrixWorld(true);
  }
  emit('transform');
}
function dragEnd() {
  if (!drag) return;
  const items = drag.items.map(({ it, st }) => ({ it, st, en: snap(it) }));
  drag = null;
  const moved = items.filter(({ st, en }) => JSON.stringify(st) !== JSON.stringify(en));
  if (!moved.length) return;
  const docBefore = JSON.stringify({ o: E.doc.objects, a: E.doc.added, v: E.doc.veg });
  for (const { it } of moved) writeTransform(it);
  const docAfter = JSON.stringify({ o: E.doc.objects, a: E.doc.added, v: E.doc.veg });
  push({ label: 'transform', undo: () => { for (const { it, st } of moved) restore(it, st); setDoc(docBefore); syncGizmo(); emit('changed'); },
    redo: () => { for (const { it, en } of moved) restore(it, en); setDoc(docAfter); syncGizmo(); emit('changed'); } });
  emit('changed');
}
function setDoc(json) { const d = JSON.parse(json); E.doc.objects = d.o; E.doc.added = d.a; E.doc.veg = d.v; }
// any change made by fn(), as one undo step (document + what fn did to the scene)
export function change(label, fn, undoScene) {
  const before = JSON.stringify({ o: E.doc.objects, a: E.doc.added, v: E.doc.veg });
  const redoScene = fn();
  const after = JSON.stringify({ o: E.doc.objects, a: E.doc.added, v: E.doc.veg });
  push({ label, undo: () => { setDoc(before); undoScene && undoScene(); emit('changed'); }, redo: () => { setDoc(after); redoScene && redoScene(); emit('changed'); } });
  emit('changed');
}

// ---------- delete / hide / duplicate / ground ----------
export function deleteSel() {
  const items = S.sel.slice();
  if (!items.length) return;
  const vis = items.map((it) => (it.kind === 'veg' ? null : it.o.visible));
  const apply = () => {
    for (const it of items) {
      if (it.kind === 'veg') { E.doc.veg[it.key] = { del: 1 }; it.p._del = true; vegMatrix(it); continue; }
      const a = addedOf(it.e);
      if (a && it.o === it.e.o) { E.doc.added = E.doc.added.filter((x) => x !== a); it.o.visible = false; continue; }
      const d = docEdit(it.id); d.at = it.e.anchor; d.label = it.e.label; d.del = 1;
      it.o.visible = false;
    }
    return () => apply2();
  };
  const apply2 = () => { for (const it of items) { if (it.kind === 'veg') { it.p._del = true; vegMatrix(it); } else it.o.visible = false; } };
  change('delete', apply, () => { items.forEach((it, i) => { if (it.kind === 'veg') { it.p._del = false; vegMatrix(it); } else it.o.visible = vis[i]; }); });
  select([]);
}
export function hideInGame(on) {
  const items = S.sel.filter((it) => it.kind === 'obj' && !it.e.added);
  change(on ? 'hide in game' : 'show in game', () => {
    for (const it of items) { const d = docEdit(it.id); d.at = it.e.anchor; d.label = it.e.label; if (on) d.hide = 1; else { delete d.hide; cleanEdit(it.id); } it.o.userData.gameHidden = on; }
    emit('select');
  });
}
export function restoreSel() {
  // back to the generated piece: drop its edit
  const items = S.sel.filter((it) => it.kind === 'obj' && !it.e.added);
  const st = items.map((it) => snap(it));
  change('reset to generated', () => {
    for (const it of items) {
      const d = E.doc.objects[it.id];
      if (d) delete E.doc.objects[it.id];
      if (it.o === it.e.o && it.e.gen) { restore(it, it.e.gen); it.e.moved = false; }
      it.o.userData.deleted = false; it.o.userData.gameHidden = false;
      it.o.visible = true;
    }
    syncGizmo();
  }, () => { items.forEach((it, i) => restore(it, st[i])); syncGizmo(); });
}
export function dropToGround() {
  const items = S.sel.filter((it) => it.kind === 'obj' && it.o === it.e.o);
  const st = items.map(snap);
  change('drop to ground', () => {
    for (const it of items) { it.o.position.y = E.fn.height(it.o.position.x, it.o.position.z); it.o.updateMatrixWorld(true); writeTransform(it); }
    const en = items.map(snap);
    syncGizmo();
    return () => { items.forEach((it, i) => restore(it, en[i])); syncGizmo(); };
  }, () => { items.forEach((it, i) => restore(it, st[i])); syncGizmo(); });
}
let uid = 0;
export const newId = (k) => `user/${k.replace(/[^a-z0-9]+/gi, '_')}_${Date.now().toString(36)}${(uid++).toString(36)}`;
export function duplicateSel() {
  const items = S.sel.filter((it) => it.kind === 'obj');
  if (!items.length) return;
  const made = [];
  change('duplicate', () => {
    for (const it of items) {
      const src = addedOf(it.e);
      const kind = src && it.o === it.e.o ? src.kind : 'clone:' + it.id;
      const o = it.o; o.updateMatrixWorld(true); o.matrixWorld.decompose(_p, _q, _s); _e.setFromQuaternion(_q, 'YXZ');
      const a = { id: newId(kind.split(':')[1] || kind), kind, params: src ? JSON.parse(JSON.stringify(src.params || {})) : {}, pos: [_p.x + 1.5, _p.y, _p.z + 1.5].map((v) => +v.toFixed(3)), rot: [0, +_e.y.toFixed(4), 0], scl: [_s.x, _s.y, _s.z].map((v) => +v.toFixed(4)) };
      if (src && src.use) a.use = JSON.parse(JSON.stringify(src.use));
      if (src && src.col !== undefined) a.col = src.col;
      if (SNAP.ground) a.pos[1] = +E.fn.height(a.pos[0], a.pos[2]).toFixed(3);
      E.doc.added.push(a);
      made.push(spawn(a));
    }
    return () => { made.forEach((e) => { e.o.visible = true; }); };
  }, () => { made.forEach((e) => { e.o.visible = false; }); });
  select(made.filter(Boolean).map((e) => itemOf(e)));
}
// put an added object in the scene (and the registry, so it can be picked)
export function spawn(a) {
  let g;
  try { g = makeKind(a.kind, a.params || {}, reg()); } catch (err) { console.error(err); emit('toast', 'Could not make ' + a.kind + ': ' + err.message); return null; }
  g.position.fromArray(a.pos); if (a.rot) g.rotation.set(a.rot[0], a.rot[1], a.rot[2]); if (a.scl) g.scale.fromArray(a.scl);
  W.town.group.add(g); g.updateMatrixWorld(true);
  const e = { o: g, id: a.id, chain: 'added', n: 0, added: a, cols: [], uses: [], walks: [], label: a.kind, anchor: [a.pos[0], a.pos[1], a.pos[2]], moved: true };
  reg().list.push(e); reg().byId.set(e.id, e);
  return e;
}
// rebuild an added object after its params changed
export function rebuild(e) {
  const a = addedOf(e);
  if (!a) return;
  const old = e.o;
  let g;
  try { g = makeKind(a.kind, a.params || {}, reg()); } catch (err) { emit('toast', err.message); return; }
  g.position.copy(old.position); g.rotation.copy(old.rotation); g.scale.copy(old.scale);
  old.parent.add(g); old.parent.remove(old);
  e.o = g;
  for (const it of S.sel) if (it.e === e) { it.o = g; }
  syncGizmo();
}
export function placeAsset(kind, params, hit) {
  const p = hit.point.clone();
  let yaw = 0;
  // on a wall: turned to face out of it
  if (SNAP.surface && hit.face && !hit.ground) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (Math.abs(n.y) < 0.5) yaw = Math.atan2(n.x, n.z);
  }
  if (hit.ground || !SNAP.surface) p.y = E.fn.height(p.x, p.z);
  const a = { id: newId(kind.split(':')[1] || kind), kind, params: JSON.parse(JSON.stringify(params || {})), pos: [p.x, p.y, p.z].map((v) => +v.toFixed(3)), rot: [0, +yaw.toFixed(4), 0], scl: [1, 1, 1] };
  let e = null;
  change('add ' + kind, () => { E.doc.added.push(a); e = e || spawn(a); if (e) e.o.visible = true; return () => { if (e) e.o.visible = true; }; }, () => { if (e) e.o.visible = false; });
  if (e) select([itemOf(e)]);
  return e;
}

// ---------- single plants ----------
function vegItem(mesh, j) {
  const { sc, c } = mesh.userData.veg;
  const p = sc.points[c.idx[j]];
  const key = p._k || vegKey((p._src || p).x, (p._src || p).z);
  return { kind: 'veg', o: mesh, j, sc, c, p, key, id: 'veg@' + key };
}
const _m = new THREE.Matrix4();
export function vegMatrix(it) {
  const p = it.p;
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
  const s = p._del ? 0 : p.s;
  _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s * (p.sy || 1), s));
  it.c.meshes[0].setMatrixAt(it.j, _m);
  it.c.meshes[0].instanceMatrix.needsUpdate = true;
  for (const m of it.c.meshes) m.computeBoundingSphere();
}
function writeVeg(it) {
  const p = it.p;
  E.doc.veg[it.key] = { x: +p.x.toFixed(3), z: +p.z.toFixed(3), rot: +p.rot.toFixed(4), s: +p.s.toFixed(4) };
}
export const writeTransformPublic = writeTransform;
void find; void touch;
