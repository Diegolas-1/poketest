// Terrain tools: sculpt (raise, lower, smooth, flatten, noise) and paint
// (dirt path, sand, rock, grass, erase), plus the painted masks (vegetation
// density, grass blades, walk flags). Each brush stroke writes the edit
// layer's raster tiles (editlayer/index.js), then redraws the ground mesh,
// the path map and the colours under the brush, and carries the pieces
// standing there up or down. A stroke is one undo step (the tiles' bytes
// before and after).
import * as THREE from 'three';
import { E, GRID } from '../editlayer/index.js';
import { S, push, tileKey, tileChanged, emit } from './state.js';

export const BRUSH = { r: 6, strength: 0.5, hard: 0.4, target: null, layer: 'path', value: 1 };
export const SCULPT = ['raise', 'lower', 'smooth', 'flatten', 'noise', 'level'];
export const PAINT = { path: ['p', 0, 'Dirt path'], sand: ['p', 1, 'Sand'], rock: ['p', 2, 'Rock'], grass: ['p', 3, 'Grass (erases)'],
  vegdens: ['m', 0, 'Plants: thin / clear'], grassk: ['h', 2, 'Grass blades'], walk: ['m', 1, 'Walk flags'] };

const fall = (d, r, hard) => { const t = d / r; if (t >= 1) return 0; if (t <= hard) return 1; const u = (t - hard) / (1 - hard); return 1 - u * u * (3 - 2 * u); };

// node helpers
const NI = (x) => Math.round((x - GRID.x0) / GRID.res), NJ = (z) => Math.round((z - GRID.z0) / GRID.res);
const NX = (i) => GRID.x0 + i * GRID.res, NZ = (j) => GRID.z0 + j * GRID.res;
function nodeRef(layer, i, j, create, stroke) {
  const ti = i >> 7, tj = j >> 7;
  if (stroke) {
    const key = tileKey(layer, ti, tj);
    if (!stroke.before.has(key)) { const t0 = E.tile(layer, ti, tj, false); stroke.before.set(key, t0 ? t0.slice() : null); }
  }
  const t = E.tile(layer, ti, tj, create);
  return t ? [t, ((j & 127) * 128 + (i & 127)) * 4] : null;
}
const getH = (i, j) => E.hNode(i, j);
function setH(i, j, v, stroke) {
  const r = nodeRef('h', i, j, true, stroke); if (!r) return;
  const c = Math.max(0, Math.min(65535, Math.round(v * 100) + 32768));
  r[0][r[1]] = c >> 8; r[0][r[1] + 1] = c & 255;
}

// ---------- a stroke ----------
let stroke = null;
export function strokeBegin(tool, p) {
  stroke = { tool, before: new Map(), box: [Infinity, Infinity, -Infinity, -Infinity], last: p.clone() };
  if (tool === 'flatten' && (!BRUSH.target || !BRUSH.keep)) BRUSH.target = E.fn.height(p.x, p.z);
  if (tool === 'level') BRUSH.target = E.fn.height(p.x, p.z);
}
export function strokeApply(tool, p, dt) {
  if (!stroke) return;
  const R = BRUSH.r, k = BRUSH.strength, hard = BRUSH.hard;
  const i0 = NI(p.x - R), i1 = NI(p.x + R), j0 = NJ(p.z - R), j1 = NJ(p.z + R);
  const H = E.fn.height;
  if (SCULPT.includes(tool)) {
    E.has.h = true;
    // the total height at each node (generated + delta), then the change
    const W = i1 - i0 + 3, Hh = j1 - j0 + 3, tot = new Float32Array(W * Hh);
    if (tool === 'smooth') for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) tot[j * W + i] = H(NX(i0 - 1 + i), NZ(j0 - 1 + j));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = NX(i), z = NZ(j), f = fall(Math.hypot(x - p.x, z - p.z), R, hard);
      if (f <= 0) continue;
      const d0 = getH(i, j);
      let d = d0;
      if (tool === 'raise') d += k * 6 * dt * f;
      else if (tool === 'lower') d -= k * 6 * dt * f;
      else if (tool === 'noise') d += (hash(i, j, stroke.seed ||= (Math.random() * 1e9) | 0) - 0.5) * k * 4 * dt * f;
      else if (tool === 'flatten' || tool === 'level') {
        const h = H(x, z), a = tool === 'level' ? Math.min(1, f * 4) : Math.min(1, k * 8 * dt * f);
        d += (BRUSH.target - h) * a;
      } else if (tool === 'smooth') {
        const a = (j - j0 + 1) * W + (i - i0 + 1);
        let s = 0; for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) s += tot[a + b * W + c];
        d += (s / 9 - tot[a]) * Math.min(1, k * 10 * dt * f);
      }
      if (d !== d0) setH(i, j, d, stroke);
    }
  } else if (PAINT[tool]) {
    const [layer, ch] = PAINT[tool];
    E.has[layer] = true;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = NX(i), z = NZ(j), f = fall(Math.hypot(x - p.x, z - p.z), R, hard);
      if (f <= 0) continue;
      const r = nodeRef(layer, i, j, true, stroke), t = r[0], o = r[1];
      if (tool === 'walk') { if (f > 0.5) t[o + 1] = BRUSH.value; continue; }   // 0 none, 1 blocked, 2 walkable, 3 ledge
      if (tool === 'vegdens' || tool === 'grassk') {
        const want = Math.round(BRUSH.value * 128), cur = t[o + ch];
        t[o + ch] = Math.round(cur + (want - cur) * Math.min(1, k * 8 * dt * f));
        continue;
      }
      const erase = BRUSH.erase;
      const a = Math.min(1, k * 8 * dt * f);
      if (erase) { for (let c = 0; c < 4; c++) t[o + c] = Math.round(t[o + c] * (1 - a)); continue; }
      // painting one surface fades the others
      for (let c = 0; c < 4; c++) {
        const cur = t[o + c], want = c === ch ? 255 : (c === 0 && tool !== 'grass' ? cur : 0);
        t[o + c] = Math.round(cur + (want - cur) * a);
      }
    }
  }
  const b = stroke.box;
  b[0] = Math.min(b[0], p.x - R - 1); b[1] = Math.min(b[1], p.z - R - 1); b[2] = Math.max(b[2], p.x + R + 1); b[3] = Math.max(b[3], p.z + R + 1);
  refresh([p.x - R - 1, p.z - R - 1, p.x + R + 1, p.z + R + 1], tool);
}
export function strokeEnd() {
  if (!stroke) return;
  const st = stroke; stroke = null;
  const after = new Map();
  for (const key of st.before.keys()) { const [l, ti, tj] = key.split('_'); const t = E.tile(l, +ti, +tj, false); after.set(key, t ? t.slice() : null); tileChanged(key); }
  if (!st.before.size) return;
  const box = st.box, tool = st.tool;
  const put = (m) => {
    for (const [key, data] of m) {
      const [l, ti, tj] = key.split('_'), k = +tj * GRID.ntx + +ti;
      E.tiles[l][k] = data ? data.slice() : null;
      if (data) E.has[l] = true;
      tileChanged(key);
    }
    refresh(box, tool);
  };
  push({ label: 'terrain: ' + tool, undo: () => put(st.before), redo: () => put(after) });
  emit('terrain');
}
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------- redrawing what the brush touched ----------
let W = null;
export function bindWorld(world) {
  W = world;
  // where each piece stands without the ground's edits (they ride on it)
  if (E.has.h || E.roadsEdited()) for (const sc of W.veg.scatters) for (const p of sc.points) p._dy = E.fn.height(p.x, p.z) - E.fn.rawHeight(p.x, p.z);
  for (const e of W.town.reg.list) if (e.anchor && !e.origin) { const [ax, , az] = e.anchor; e.y0 = e.o.position.y - (E.fn.height(ax, az) - E.fn.rawHeight(ax, az)); }
}
const tmp = new THREE.Color(), _m4 = new THREE.Matrix4();
export function refresh(box, tool) {
  if (!W) return;
  const [x0, z0, x1, z1] = box;
  const sculpt = SCULPT.includes(tool), paint = tool === 'path' || tool === 'grass' || tool === 'sand' || tool === 'rock' || !tool;
  if (tool === 'path' || tool === 'grass' || !tool) repaintPaths(box);
  const MY = E.fn.meshY, GC = E.fn.groundColor;
  for (const m of W.terrain.children) {
    if (!m.geometry || m.name === 'ledges') continue;
    const bb = m.geometry.boundingBox;
    if (bb.max.x < x0 || bb.min.x > x1 || bb.max.z < z0 || bb.min.z > z1) continue;
    const P = m.geometry.attributes.position, N = m.geometry.attributes.normal, C = m.geometry.attributes.color;
    let lo = Infinity, hi = -1;
    for (let v = 0; v < P.count; v++) {
      const x = P.getX(v), z = P.getZ(v);
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const y = MY(x, z), s = 0.75;
      const dx = (MY(x + s, z) - MY(x - s, z)) / (2 * s), dz = (MY(x, z + s) - MY(x, z - s)) / (2 * s), l = Math.hypot(dx, 1, dz);
      P.setY(v, y); N.setXYZ(v, -dx / l, 1 / l, -dz / l);
      if (paint || sculpt) { GC(x, z, y, 1 - 1 / l, tmp); C.setXYZ(v, tmp.r, tmp.g, tmp.b); }
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    if (hi >= 0) {
      for (const a of [P, N, C]) { a.clearUpdateRanges(); a.addUpdateRange(lo * 3, (hi - lo + 1) * 3); a.needsUpdate = true; }
      m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox();
    }
  }
  // plants too
  if (sculpt || !tool) for (const sc of W.veg.scatters) for (const c of sc.chunks) {
    if (c.center.x + c.radius < x0 || c.center.x - c.radius > x1 || c.center.z + c.radius < z0 || c.center.z - c.radius > z1) continue;
    let any = false;
    c.idx.forEach((pi, j) => {
      const p = sc.points[pi];
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || p._del) return;
      if (p.y0 === undefined) p.y0 = p.y - (p._dy || 0);
      p._dy = E.fn.height(p.x, p.z) - E.fn.rawHeight(p.x, p.z);
      p.y = p.y0 + p._dy;
      c.meshes[0].getMatrixAt(j, _m4); _m4.elements[13] = p.y; c.meshes[0].setMatrixAt(j, _m4); any = true;
    });
    if (any) { c.meshes[0].instanceMatrix.needsUpdate = true; for (const m of c.meshes) m.computeBoundingSphere(); }
  }
  // the pieces standing there ride with the ground
  if (sculpt || !tool) for (const e of W.town.reg.list) {
    if (!e.anchor || e.origin || e.o.parent == null) continue;
    const [ax, , az] = e.anchor;
    if (ax < x0 || ax > x1 || az < z0 || az > z1) continue;
    if (e.y0 !== undefined && !e.moved) e.o.position.y = e.y0 + E.fn.height(ax, az) - E.fn.rawHeight(ax, az);
  }
}
// the path map under a box: from the generated distances (sd0) plus the paint
function repaintPaths([x0, z0, x1, z1]) {
  const PM = E.fn.rebuildPathMap && E.fn.pathMapNow ? E.fn.pathMapNow() : null;
  if (!PM || !PM.sd0) return;
  const i0 = Math.max(0, Math.floor((x0 - PM.x0) / PM.res)), i1 = Math.min(PM.nx - 1, Math.ceil((x1 - PM.x0) / PM.res));
  const j0 = Math.max(0, Math.floor((z0 - PM.z0) / PM.res)), j1 = Math.min(PM.nz - 1, Math.ceil((z1 - PM.z0) / PM.res));
  if (i0 > i1 || j0 > j1) return;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const id = j * PM.nx + i, x = PM.x0 + (i + 0.5) * PM.res, z = PM.z0 + (j + 0.5) * PM.res;
    const d = E.pathSD(x, z, PM.sd0[id]);
    PM.sd[id] = d;
    PM.data[id * 4] = Math.round(Math.min(1, Math.max(0, (d + PM.clamp) / (2 * PM.clamp))) * 255);
  }
  const t = W.pmTex();
  if (t) t.needsUpdate = true;
}
// flatten: sample the target height (Ctrl + click)
export function sampleTarget(p) { BRUSH.target = E.fn.height(p.x, p.z); BRUSH.keep = true; }
void S;

// ---------- the mask overlay: what the Walk / Thin / Blades brushes paint ----------
// dots on the ground round the cursor: Walk shows where the player cannot go
// (red: blocked by the world or painted, green: painted walkable, orange:
// ledge); Thin shows how many plants are kept (red = none); Blades the grass.
let ov = null, ovAt = null, ovTool = null;
export function overlay(tool, p) {
  if (!W) return;
  if (!ov) {
    ov = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }));
    ov.renderOrder = 996; ov.frustumCulled = false; ov.userData.noPick = true; W.scene.add(ov);
  }
  const on = !!p && (tool === 'walk' || tool === 'vegdens' || tool === 'grassk');
  ov.visible = on;
  if (!on || (ovAt && ovTool === tool && ovAt.distanceTo(p) < 3 && !overlay.dirty)) return;
  ovAt = p.clone(); ovTool = tool; overlay.dirty = false;
  const R = 36, step = tool === 'walk' ? 1 : 1.5, pos = [], col = [], H = E.fn.height, NW = E.fn.noWalk;
  for (let z = Math.round(p.z - R); z <= p.z + R; z += step) for (let x = Math.round(p.x - R); x <= p.x + R; x += step) {
    if ((x - p.x) ** 2 + (z - p.z) ** 2 > R * R) continue;
    let c = null;
    if (tool === 'walk') {
      const f = E.walkFlag(x, z), blocked = NW ? NW(x, z) : false;
      c = f === 3 ? [1, 0.6, 0.1] : f === 2 ? [0.2, 1, 0.4] : blocked ? [1, 0.2, 0.2] : null;
    } else if (tool === 'vegdens') { const d = E.vegDensity(x, z); if (d < 0.99) c = [1, d, d * 0.5]; }
    else { const k = E.grassK(x, z); if (Math.abs(k - 1) > 0.02) c = k < 1 ? [1, k, 0.3] : [0.3, 1, Math.min(1, k - 1)]; }
    if (!c) continue;
    pos.push(x, H(x, z) + 0.25, z); col.push(...c);
  }
  ov.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ov.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}
