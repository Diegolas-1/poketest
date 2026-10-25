// The edit layer for the town's objects (editlayer/index.js has the rest).
//
// trackTown(world) runs first in buildTown: it notes every top-level piece the
// generators add (its stable id comes from the generator functions that added
// it: the call stack), which colliders, Read spots and walk decks belong to
// it, and which builder made each group (the label in the editor's outliner).
// applyTown(world) runs once the town is built (before it is merged): the
// ground's edits carry each piece up or down, then the object edits (move,
// turn, scale, hide, delete) and the added objects are applied.
//
// ID: 'town:<chain>#<n>', chain = the generator functions between buildTown
// and the add ('laneFurniture/lamp', 'route1Fill/place'), n = its place among
// the pieces with that chain. A generator may also set obj.userData.eid. Each
// edit keeps the piece's anchor (where it stood as generated), so when code
// changes reorder things, an edit still finds its piece: same id near the
// anchor, else the nearest piece with the same chain and label.
import * as THREE from 'three';
import { E } from './index.js';
import * as O from '../props/outdoor.js';
import * as S from '../signs.js';
import { buildProp, PROPS } from '../props/index.js';
import { CATALOG } from '../props/catalog.js';
import { makeTree, makeBush, makeRock } from '../foliage.js';

// functions that only add parts to a parent (never a piece's builder)
const HELPERS = new Set(['add', 'put', 'box', 'cyl', 'block', 'sphere', 'torus', 'lathe', 'plane', 'extrude', 'rod', 'beam', 'rope', 'roofSlab', 'ivy', 'vines',
  'mossTop', 'plant', 'foundation', 'windowAt', 'archWindow', 'gableRoof', 'gableWall', 'hipRoof', 'picketFence', 'ink', 'forEach', 'map', 'call', 'apply', 'push',
  'anonymous', 'Object', 'Module', 'instanced', 'place', 'sign', 'flat', 'texm', 'M', 'memo', 'eval', 'ball', 'shade', 'frames', 'trackTown', 'buildTown']);
// props/outdoor.js builders: builder({ params } = {}) (its painting helpers take arguments)
export const OUTDOOR = Object.keys(O).filter((k) => typeof O[k] === 'function' && O[k].length === 0 && /^function\s*\w*\s*\(\s*\{/.test(O[k].toString()));
const BUILDERS = new Set([...OUTDOOR, 'welcomeSign', 'routeSign', 'nameplate', 'fingerpost', 'labPlate', 'noticeBoard', ...Object.keys(PROPS), 'makeTree', 'makeBush', 'makeRock', 'makeClump', 'buildLab', 'rockModel',
  'cottage', 'lamp', 'bench', 'well', 'bridge', 'lighthouse', 'boathouse', 'rowboat', 'fishingBoat', 'dock', 'palletHouse', 'labGate', 'labStairs', 'globeLamp',
  'signpost', 'bedBorder', 'streamRocks', 'laneFurniture', 'hillPlants', 'harbourFront', 'route1']);

const BUILTIN = new Set(['forEach', 'map', 'filter', 'reduce', 'some', 'every', 'call', 'apply', 'Array', 'Object', 'Module', 'Function', 'Promise']);
// the function names on the stack, innermost first (V8 "at name (" and JSC "name@")
function frames() {
  const lim = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  const st = new Error().stack || '';
  Error.stackTraceLimit = lim;
  const out = [];
  for (const line of st.split('\n')) {
    let m = /^\s*at (?:async )?(?:new )?([^\s(]+) \(/.exec(line) || /^([^@\s]*)@/.exec(line);
    if (!m) continue;
    let n = m[1];
    if (!n || /[/:]/.test(n)) continue;
    n = n.split('.').pop().replace(/^<|>$/g, '');
    if (!/^[A-Za-z_$][\w$]*$/.test(n)) continue;
    out.push(n);
  }
  return out;
}

export function trackTown(world) {
  E.raw = true;   // decide on the unedited ground (editlayer/index.js)
  const reg = { list: [], byId: new Map(), cur: null, owner: new Map(), maker: new WeakMap(), seq: new Map() };
  world.reg = reg;
  const G = world.group, add0 = G.add;
  G.add = function (...objs) {
    const f = frames();
    const i0 = f.indexOf('add') >= 0 ? f.indexOf('add') + 1 : 1, i1 = f.indexOf('buildTown');
    const chain = f.slice(i0, i1 < 0 ? f.length : i1).filter((n) => n !== 'add' && !BUILTIN.has(n)).reverse();
    const ch = chain.filter((n, i) => n !== chain[i - 1]).join('/') || 'town';
    for (const o of objs) {
      if (o === G || reg.list.some((e) => e.o === o)) continue;
      const n = reg.seq.get(ch) || 0; reg.seq.set(ch, n + 1);
      const e = { o, chain: ch, n, id: o.userData.eid || `town:${ch}#${n}`, cols: [], uses: [], walks: [] };
      reg.list.push(e); reg.cur = e;
    }
    return add0.apply(this, objs);
  };
  // who owns each collider, Read spot and walk deck: the piece added last
  // (checked against where they are in applyTown)
  for (const k of ['colliders', 'use', 'walk']) {
    const arr = world[k], p0 = arr.push;
    arr.push = function (...items) { for (const it of items) reg.owner.set(it, [k, reg.cur]); return p0.apply(this, items); };
    reg['un_' + k] = () => { arr.push = p0; };
  }
  // the builder that made each group: the first builder function on the stack
  // when something is first added to it
  const proto = THREE.Object3D.prototype, padd = proto.add;
  proto.add = function (...objs) {
    if (this !== G && !reg.maker.has(this)) {
      const f = frames(), b = f.find((n) => BUILDERS.has(n)) || f.find((n) => !HELPERS.has(n) && n !== 'frames' && n !== 'add');
      reg.maker.set(this, b || '');
    }
    return padd.apply(this, objs);
  };
  reg.unAdd = () => { proto.add = padd; G.add = add0; };
}

const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3();
const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const near2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// the label of a piece: its builder, else the last name in its chain
function labelOf(reg, o, chain) {
  const m = reg.maker.get(o);
  if (m) return m;
  let k = null;
  o.traverse((c) => { if (!k && reg.maker.get(c) && BUILDERS.has(reg.maker.get(c))) k = reg.maker.get(c); });
  return k || chain.split('/').pop();
}

// a collider's centre inside a box (with margin)
const inBox = (b, x, z, m) => x > b.min.x - m && x < b.max.x + m && z > b.min.z - m && z < b.max.z + m;

export function applyTown(world) {
  const reg = world.reg;
  E.raw = false;
  reg.unAdd();
  for (const k of ['colliders', 'use', 'walk']) reg['un_' + k]();
  const G = world.group;
  G.updateMatrixWorld(true);
  // anchors and boxes as generated
  for (const e of reg.list) {
    const o = e.o;
    e.box = new THREE.Box3().setFromObject(o, false);
    o.getWorldPosition(v3);
    // pieces built in world space round the origin: their box's middle instead
    e.origin = Math.abs(o.position.x) + Math.abs(o.position.z) < 0.01 && !e.box.isEmpty();
    if (e.origin) { e.box.getCenter(v3); v3.y = e.box.min.y; }
    e.anchor = r3(v3);
    e.label = labelOf(reg, o, e.chain);
    e.size = e.box.isEmpty() ? 0 : Math.max(e.box.max.x - e.box.min.x, e.box.max.z - e.box.min.z);
    reg.byId.set(e.id, e);
  }
  // owners of colliders, spots and decks: the piece added just before, when
  // it lies inside that piece's box; else the smallest piece around it
  const smallest = (x, z, m) => { let b = null; for (const e of reg.list) if (e.size > 0 && inBox(e.box, x, z, m) && (!b || e.size < b.size)) b = e; return b; };
  for (const [it, [k, e0]] of reg.owner) {
    const x = it.x !== undefined ? it.x : (it.x0 + it.x1) / 2, z = it.z !== undefined ? it.z : (it.z0 + it.z1) / 2;
    let e = e0 && !e0.box.isEmpty() && inBox(e0.box, x, z, 1.0) ? e0 : smallest(x, z, 0.5);
    if (!e && e0) e = e0;
    if (e) e[k === 'colliders' ? 'cols' : k === 'use' ? 'uses' : 'walks'].push(it);
  }
  reg.owner.clear();
  // the ground's edits carry each piece with it
  const F = E.fn;
  if ((E.has.h || E.roadsEdited()) && F.height && F.rawHeight) {
    const dy = (x, z) => F.height(x, z) - F.rawHeight(x, z);
    for (const e of reg.list) {
      const o = e.o;
      if (o.isInstancedMesh) {
        const m = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(v3, q4, s3); const d = dy(v3.x, v3.z); if (d) { m.elements[13] += d; o.setMatrixAt(i, m); } }
        o.instanceMatrix.needsUpdate = true;
        continue;
      }
      if (e.origin && e.size > 40) continue;   // a long piece in world space: leave it
      const d = dy(e.anchor[0], e.anchor[2]);
      if (Math.abs(d) < 1e-4) continue;
      o.position.y += d;
      for (const w of e.walks) w.y += d;
    }
    G.updateMatrixWorld(true);
  }
  // the edits
  const doc = E.doc;
  E.orphans = E.orphans.filter((x) => x.kind !== 'object');
  E.edColliders = [];
  for (const [id, ed] of Object.entries(doc.objects || {})) {
    const hit = find(reg, id, ed);
    if (!hit) { E.orphans.push({ kind: 'object', id }); continue; }
    applyOne(world, hit.e, hit.o, ed);
  }
  // added objects
  reg.added = [];
  for (const a of doc.added || []) {
    try { addOne(world, a); } catch (err) { console.warn('edit: could not add', a.id, err); E.orphans.push({ kind: 'added', id: a.id, why: String(err.message || err) }); }
  }
  G.updateMatrixWorld(true);
  return reg;
}

// find the object an edit names: '<id>' or '<id>>c3>c0' (a part of it)
export function find(reg, id, ed = {}) {
  const [top, ...path] = id.split('>');
  let e = reg.byId.get(top);
  const at = ed.at;
  if (at && (!e || near2(e.anchor, at) > 1.5) && !path.length) {
    // the same kind of piece, nearest to where it stood
    const m = /^town:(.*)#\d+$/.exec(top), chain = m ? m[1] : null;
    let best = null, bd = 3;
    for (const c of reg.list) if (c.chain === chain && (!ed.label || c.label === ed.label)) { const d = near2(c.anchor, at); if (d < bd) { bd = d; best = c; } }
    if (!best && ed.label) for (const c of reg.list) if (c.label === ed.label) { const d = near2(c.anchor, at); if (d < 1.5 && d < bd) { bd = d; best = c; } }
    if (best) e = best;
  }
  if (!e) return null;
  let o = e.o;
  for (const p of path) {
    const i = +p.slice(1);
    if (!o.children[i]) return null;
    o = o.children[i];
  }
  return { e, o, part: path.length > 0 };
}

// the turn about y between two world matrices
const yawOf = (m) => { const e = m.elements; return Math.atan2(e[8], e[0]); };
const sclOf = (m) => Math.hypot(m.elements[0], m.elements[2]) || 1;

function applyOne(world, e, o, ed) {
  const top = o === e.o;
  if (top && !e.gen) e.gen = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
  if (ed.del || ed.hide) {
    // (the editor keeps deleted pieces, hidden, so they can come back)
    if (globalThis.__PALLET_EDITOR) o.visible = !ed.del;
    else if (ed.del) o.parent && o.parent.remove(o); else o.visible = false;
    o.userData.deleted = !!ed.del; o.userData.gameHidden = !!ed.hide;
    if (!globalThis.__PALLET_EDITOR) {
      if (top) dropOwned(world, e);
      world.solid = world.solid.filter((s) => { for (let q = s; q; q = q.parent) if (q === o) return false; return true; });
      return;
    }
  }
  // its Read / Look text
  if (ed.use && top && e.uses.length) { const u = e.uses[0]; if (ed.use.label) u.label = ed.use.label; if (ed.use.lines) u.lines = ed.use.lines.slice(); }
  if (!ed.pos && !ed.rot && !ed.scl) return;
  o.updateMatrixWorld(true);
  const before = o.matrixWorld.clone();
  if (ed.pos) o.position.fromArray(ed.pos);
  if (ed.rot) o.rotation.set(ed.rot[0], ed.rot[1], ed.rot[2], o.rotation.order);
  if (ed.scl) o.scale.fromArray(ed.scl);
  o.updateMatrixWorld(true);
  if (!top) return;
  // its colliders, Read spots and decks move with it
  const M = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, before.clone().invert());
  const dyaw = yawOf(o.matrixWorld) - yawOf(before), k = sclOf(o.matrixWorld) / sclOf(before);
  const P = (x, y, z) => v3.set(x, y, z).applyMatrix4(M);
  for (const c of e.cols) {
    c.off = 1;
    const p = P(c.x, 0, c.z), n = { ...c, x: p.x, z: p.z, ed: 1 };
    delete n.off;
    if (c.box) { n.rot = (c.rot || 0) + dyaw; n.hw = c.hw * k; n.hd = c.hd * k; } else n.r = c.r * k;
    world.colliders.push(n); E.edColliders.push(n);
  }
  for (const u of e.uses) { const p = P(u.x, 0, u.z); u.x = p.x; u.z = p.z; }
  for (const w of e.walks) {
    if (w.x0 !== undefined) {
      const p = P((w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2), hw = (w.x1 - w.x0) / 2, hd = (w.z1 - w.z0) / 2;
      delete w.x0; delete w.x1; delete w.z0; delete w.z1;
      Object.assign(w, { x: p.x, z: p.z, hw, hd, rot: dyaw, y: p.y });
    } else { const p = P(w.x, w.y, w.z); Object.assign(w, { x: p.x, z: p.z, y: p.y, rot: (w.rot || 0) + dyaw }); }
  }
}
function dropOwned(world, e) {
  for (const c of e.cols) c.off = 1;
  world.use = world.use.filter((u) => !e.uses.includes(u));
  world.walk = world.walk.filter((w) => !e.walks.includes(w));
}

// ---------- added objects ----------
// { id, kind, params, pos, rot, scl, col: 'auto' | 'none' | radius, use: {label, lines} }
// kinds: 'outdoor:<builder>' (props/outdoor.js), 'prop:<type>' (props catalog),
// 'sign:<builder>' (signs.js), 'tree:<kind>', 'bush', 'rock', 'clone:<id>'
export function makeKind(kind, params = {}, reg = null) {
  const [k, n] = kind.split(':');
  if (k === 'outdoor') { if (!O[n]) throw new Error('no outdoor builder ' + n); return O[n](params); }
  if (k === 'prop') { if (!CATALOG[n]) throw new Error('no prop ' + n); return buildProp({ id: n, type: n, params }); }
  if (k === 'sign') {
    if (n === 'noticeBoard') return S.noticeBoard(params.title || 'NOTICE', params.lines || [], params);
    if (n === 'fingerpost') return S.fingerpost(params.arms || [['PALLET TOWN', 0]], params);
    if (n === 'nameplate') return S.nameplate(params.name || 'NAME', params);
    if (!S[n]) throw new Error('no sign ' + n);
    return S[n](params);
  }
  if (k === 'tree' || k === 'bush' || k === 'rock') {
    const model = k === 'tree' ? makeTree(n, params.seed ?? 11) : k === 'bush' ? makeBush(params.seed ?? 1, { size: params.size ?? 1 }) : makeRock(params.seed ?? 1, params.size ?? 1);
    const g = new THREE.Group();
    for (const p of model.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.userData.keep = true;
    return g;
  }
  if (k === 'clone') {
    const hit = reg && find(reg, kind.slice(6));
    if (!hit) throw new Error('clone source missing: ' + kind.slice(6));
    const c = hit.o.clone(true);
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
    c.userData.cloneOf = hit.e;
    return c;
  }
  throw new Error('unknown kind ' + kind);
}

function addOne(world, a) {
  const reg = world.reg;
  const g = makeKind(a.kind, a.params || {}, reg);
  g.position.fromArray(a.pos || [0, 0, 0]);
  if (a.rot) g.rotation.set(a.rot[0], a.rot[1], a.rot[2]);
  if (a.scl) g.scale.fromArray(a.scl);
  g.userData.eid = a.id;
  world.group.add(g);
  g.updateMatrixWorld(true);
  const e = { o: g, id: a.id, chain: 'added', n: 0, added: a, cols: [], uses: [], walks: [], label: a.kind };
  // its collider: the catalog's footprint, a clone's own colliders, its box, or none
  const col = a.col ?? 'auto';
  const push = (c) => { c.ed = 1; world.colliders.push(c); E.edColliders.push(c); e.cols.push(c); };
  const src = g.userData.cloneOf;
  if (col !== 'none') {
    if (typeof col === 'number') push({ x: g.position.x, z: g.position.z, r: col });
    else if (src && src.cols.length) {
      // the source's colliders, carried from where it stands to here
      const M = new THREE.Matrix4().multiplyMatrices(g.matrixWorld, src.o.matrixWorld.clone().invert());
      const dyaw = yawOf(g.matrixWorld) - yawOf(src.o.matrixWorld);
      for (const c of src.cols) { const p = v3.set(c.x, 0, c.z).applyMatrix4(M); push(c.box ? { box: true, x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + dyaw } : { x: p.x, z: p.z, r: c.r }); }
    } else {
      const [k, n] = a.kind.split(':');
      const free = k === 'prop' && CATALOG[n] && (CATALOG[n].walk === 'free' || (CATALOG[n].mount && CATALOG[n].mount !== 'floor'));
      if (!free) {
        if (k === 'tree' || k === 'rock' || k === 'bush') push({ x: g.position.x, z: g.position.z, r: k === 'tree' ? 0.5 * (a.scl ? a.scl[0] : 1) : 0.7 * (a.params?.size ?? 1) });
        else {
          // the footprint in the piece's own frame, turned with it
          const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), b = new THREE.Box3();
          g.traverse((m) => { if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))); } });
          if (!b.isEmpty()) {
            const sx = g.scale.x, sz = g.scale.z, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
            const p = v3.set(cx, 0, cz).applyMatrix4(g.matrixWorld);
            push({ box: true, x: p.x, z: p.z, hw: (b.max.x - b.min.x) / 2 * sx, hd: (b.max.z - b.min.z) / 2 * sz, rot: g.rotation.y });
          }
        }
      }
    }
  }
  if (a.use && a.use.lines && a.use.lines.length) {
    const u = { x: g.position.x + Math.sin(g.rotation.y) * 1.2, z: g.position.z + Math.cos(g.rotation.y) * 1.2, r: 1.3, label: a.use.label || 'Look', lines: a.use.lines };
    world.use.push(u); e.uses.push(u);
  }
  e.anchor = r3(g.position); e.box = new THREE.Box3().setFromObject(g); e.size = 1;
  reg.list.push(e); reg.byId.set(e.id, e); reg.added.push(e);
}
