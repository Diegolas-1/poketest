// Town life in the editor: the native game's data files (native/life/*.json:
// people and their schedules, places, dialogue, quests, lore, companions),
// loaded from the draft or the repo, edited here as whole files with the base
// they were edited from (tools/editor/pull.mjs merges them three ways), and
// the places drawn in the view as markers you can move and turn.
//
// Places come from tools/native/bake_places.mjs, which bakes them from the
// world; a moved spot is kept in the edit document too (doc.places, a path ->
// value map that bake_places applies after baking), so a rebake keeps it.
import * as THREE from 'three';
import { E } from '../editlayer/index.js';
import { S, emit, push } from './state.js';
import { validateData } from './lifecheck.js';

export const LIFE_FILES = ['people', 'places', 'dialogue', 'quests', 'lore', 'companions'];
export const LIFE_URL = localStorage.getItem('pallet-editor-life') || 'https://raw.githubusercontent.com/Diegolas-1/poketest/main/native/life/';
const cache = {};
// a life file to edit: its data (an editable copy; the base stays as loaded)
export async function life(name) {
  const f = name + '.json';
  if (S.life[f]) return S.life[f].data;
  if (!cache[f]) cache[f] = fetch(LIFE_URL + f, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  const base = await cache[f];
  if (!S.life[f]) S.life[f] = { base, data: JSON.parse(JSON.stringify(base)) };
  return S.life[f].data;
}
export async function allLife() { const out = {}; for (const n of LIFE_FILES) { try { out[n] = await life(n); } catch (e) { console.warn(e); } } return out; }
// any other game file by its repo path (native/tunables/player.json, ...),
// edited the same way and kept in the same place (S.life, by path)
export const REPO_URL = localStorage.getItem('pallet-editor-repo') || 'https://raw.githubusercontent.com/Diegolas-1/poketest/main/';
export async function repoFile(path) {
  if (S.life[path]) return S.life[path].data;
  if (!cache[path]) cache[path] = fetch(REPO_URL + path, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); });
  const base = await cache[path];
  if (!S.life[path]) S.life[path] = { base, data: JSON.parse(JSON.stringify(base)) };
  return S.life[path].data;
}
export function fileChange(path, label, fn) {
  const rec = S.life[path], before = JSON.stringify(rec.data);
  fn(rec.data);
  const after = JSON.stringify(rec.data);
  if (before === after) return;
  push({ label, undo: () => { rec.data = JSON.parse(before); emit('life', path); }, redo: () => { rec.data = JSON.parse(after); emit('life', path); } });
  emit('life', path);
}
// the bundle keeps only files that changed
export function lifeForSave() {
  const out = {};
  for (const [f, v] of Object.entries(S.life)) if (JSON.stringify(v.base) !== JSON.stringify(v.data)) out[f] = v;
  return out;
}
// an edit of a life file as an undo step: fn(data) changes it
export function lifeChange(name, label, fn) {
  const f = name + '.json', rec = S.life[f];
  const before = JSON.stringify(rec.data);
  fn(rec.data);
  const after = JSON.stringify(rec.data);
  if (before === after) return;
  push({ label, undo: () => { rec.data = JSON.parse(before); emit('life', name); }, redo: () => { rec.data = JSON.parse(after); emit('life', name); } });
  emit('life', name);
}
export async function lifeCheck() { return validateData(await allLife()); }

// ---------- places in the view ----------
const isPt = (v) => Array.isArray(v) && (v.length === 2 || v.length === 3) && v.every((x) => typeof x === 'number');
// every spot in places.json: { path: 'places/pier/spots/3', v: [x, z, yaw?] }
export function spotsOf(pl) {
  const out = [];
  const walk = (v, path) => {
    if (isPt(v)) { out.push({ path, v }); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '/' + i));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'note' && k !== 'roads') walk(x, path ? path + '/' + k : k);
  };
  walk({ houses: pl.houses, places: pl.places }, '');
  return out;
}
const getPath = (o, path) => path.split('/').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, path, v) => { const ks = path.split('/'), last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; };

let W = null, V = null;
const group = new THREE.Group(); group.name = 'places'; group.visible = false;
export const placesGroup = group;
const mats = { house: new THREE.MeshBasicMaterial({ color: '#ffb04a' }), place: new THREE.MeshBasicMaterial({ color: '#4fd6ff' }), sel: new THREE.MeshBasicMaterial({ color: '#ffffff' }), arrow: new THREE.MeshBasicMaterial({ color: '#ff5a7a' }) };
const pin = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8).translate(0, 0.8, 0), head = new THREE.SphereGeometry(0.32, 12, 8).translate(0, 1.75, 0), arrow = new THREE.ConeGeometry(0.22, 0.7, 8).rotateX(Math.PI / 2).translate(0, 0.25, 0.55);
export function bindLife(viewport, world) { V = viewport; W = world; W.scene.add(group); }
export async function showPlaces(on) {
  group.visible = on;
  if (on) await drawPlaces();
}
export async function drawPlaces() {
  const pl = await life('places');
  group.clear();
  for (const s of spotsOf(pl)) {
    const g = new THREE.Group();
    const m = s.path.startsWith('houses') ? mats.house : mats.place;
    g.add(new THREE.Mesh(pin, m), new THREE.Mesh(head, m));
    if (s.v.length === 3) { const a = new THREE.Mesh(arrow, mats.arrow); a.position.y = 0.6; g.add(a); }
    const y = E.fn.height(s.v[0], s.v[1]);
    g.position.set(s.v[0], y, s.v[1]);
    if (s.v.length === 3) g.rotation.y = s.v[2];
    g.userData.spot = s.path; g.userData.label = s.path.replace(/^(houses|places)\//, '').replace(/\//g, ' › ');
    group.add(g);
  }
  emit('places');
}
// a spot moved with the gizmo: written to places.json (the life file) and to
// the edit document (kept through rebakes)
export function writeSpot(o) {
  const path = o.userData.spot, pl = S.life['places.json'].data, cur = getPath(pl, path);
  const v = cur.length === 3 ? [+o.position.x.toFixed(2), +o.position.z.toFixed(2), +o.rotation.y.toFixed(3)] : [+o.position.x.toFixed(2), +o.position.z.toFixed(2)];
  setPath(pl, path, v);
  E.doc.places[path] = v;
}
export function spotItem(o) { return { kind: 'spot', o, id: 'place:' + o.userData.spot, e: { label: o.userData.label, anchor: o.position.toArray() } }; }
export function placeStrings(pl) {
  // the place names a schedule may use (life.gd _goal)
  const out = ['home'];
  for (const [h, v] of Object.entries(pl.houses || {})) { out.push(h); for (const k of ['door', 'porch', 'gate', 'lane', 'mailbox', 'yard']) if (v[k]) out.push(h + '.' + k); }
  for (const [p, v] of Object.entries(pl.places || {})) { if (v.spots) out.push(p); for (const [k, x] of Object.entries(v)) if (Array.isArray(x) && k !== 'spots') out.push(p + '.' + k); }
  if (pl.places?.pallet_house) for (const k of ['terrace', 'seats', 'porch', 'garden', 'roses', 'kitchen', 'bench', 'fence']) out.push('pallet_house.' + k);
  return [...new Set(out)].sort();
}
// where a schedule's place is (the first spot), for drawing a person's day
export function placeAt(pl, s, home) {
  if (s === 'home') s = home;
  s = s.split('|')[0];
  if (s.startsWith('route:')) s = s.slice(6).split(',')[0];
  const [a, b] = s.split('.');
  const h = pl.houses?.[a];
  if (h) { const v = b ? h[b] : h.door; const p = Array.isArray(v?.[0]) ? v[0] : v; return isPt(p) ? p : h.door; }
  const P = pl.places?.[a];
  if (P) { const v = b ? P[b] : P.spots || P.middle || P.center; const p = Array.isArray(v?.[0]) ? v[0] : v; return isPt(p) ? p : P.middle || P.center || null; }
  return null;
}
// a person's day drawn in the view: a line through the places of one day type
const dayLine = new THREE.Group(); dayLine.name = 'day';
export async function drawDay(person, day) {
  if (!dayLine.parent && W) W.scene.add(dayLine);
  dayLine.clear();
  if (!person) return;
  const pl = await life('places'), blocks = person.schedule?.[day] || [];
  const pts = [];
  blocks.forEach((b, i) => {
    const p = placeAt(pl, String(b[2]), person.home);
    if (!p) return;
    const y = E.fn.height(p[0], p[1]) + 2.4 + i * 0.05;
    pts.push(new THREE.Vector3(p[0], y, p[1]));
    const sp = makeLabel(`${b[0]} ${b[1]}`);
    sp.position.set(p[0], y + 0.9 + (i % 3) * 0.7, p[1]);
    dayLine.add(sp);
  });
  if (pts.length > 1) dayLine.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffd84a', depthTest: false, transparent: true })));
  for (const p of pts) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd84a', depthTest: false, transparent: true })); m.position.copy(p); m.renderOrder = 998; dayLine.add(m); }
  dayLine.traverse((o) => { o.renderOrder = 998; o.userData.noPick = true; });
}
export function makeLabel(text, col = '#fff') {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = '600 26px system-ui'; const w = Math.ceil(x.measureText(text).width) + 16;
  c.width = w; c.height = 38;
  x.fillStyle = 'rgba(20,24,32,.8)'; x.fillRect(0, 0, w, 38);
  x.font = '600 26px system-ui'; x.fillStyle = col; x.fillText(text, 8, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / 38 * 0.9, 0.9, 1); s.userData.noPick = true;
  return s;
}
void V;
