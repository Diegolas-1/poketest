// Viridian City, built (worker 34): what stands on viridian.js's land.
//   the cutting      the road over the rim, the slide the earthquake brought
//                    down mostly cleared (rubble, a crew hut, cones, barriers)
//   the streets      paving (asphalt with pavements, cobbles in the Old Town,
//                    stone flags on the promenade, rings of setts in the
//                    plaza), lamps, benches, signs, planters
//   the lining       every edge of the walkable streets is a real thing: a
//                    building front, a trimmed hedge, a railing over the
//                    water, a stone wall (traced from walkF, so none is missed)
//   the Old Town     the MART, the Trainer School, the nickname house, the
//                    police box (placeholder massing: real models later) and
//                    houses and shops along Old Street, Lakeside Road and
//                    School Lane; the old clock tower
//   the landmarks    the POKéMON CENTER and the GYM: their own models
//                    (props/viridian.js) when there, else placeholders
//   downtown         towers from a kit (podium, glass bands, setbacks, roof
//                    gardens), near ones lining Evergreen Avenue, the rest
//                    seen across the valley; far ones are merged boxes (no
//                    shadow, no ink)
//   the slopes       terraces of small houses with blue and red tiled roofs
//   the lake         the promenade's quay wall and railing, the pier, the
//                    Route 22 gate; Route 2's gate in the north (both shut,
//                    with a reason)
// town.js buildTown calls viridianFill(world) after route1Fill.
import * as THREE from 'three';
import { height, rng, ROUTE1, routeX, isWater } from './terrain.js';
import { traceEdges, finishLine } from './edges.js';
import * as O from './props/outdoor.js';
import { building } from './props/buildings.js';
import { welcomeSign, noticeBoard, fingerpost } from './signs.js';
import * as VC from './viridian.js';
import { PADS, STORY } from './viridian_spots.js';
// the landmark models, when they exist (another builder's: props/viridian.js)
const VP = await import('./props/viridian.js').catch(() => null);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const eid = (g, id) => { g.userData.eid = id; return g; };

// ---------- pictures ----------
const texCache = new Map();
function tex(key, size, draw, rep = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = size[0]; c.height = size[1];
  draw(c.getContext('2d'), size[0], size[1], rng(key.length * 131 + 7));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.name = 'vc_' + key;
  texCache.set(key, t); return t;
}
// asphalt: blue-grey, fine grain, a few darker patches (4 x 4 m)
const asphaltTex = () => tex('asphalt', [256, 256], (x, w, h, R) => {
  x.fillStyle = '#6f7682'; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 4000; k++) { const v = 0.85 + R() * 0.3; x.fillStyle = `rgba(${(120 * v) | 0},${(126 * v) | 0},${(138 * v) | 0},.55)`; x.fillRect(R() * w, R() * h, 1.5, 1.5); }
  for (let k = 0; k < 3; k++) { x.fillStyle = 'rgba(70,74,84,.07)'; x.beginPath(); x.ellipse(R() * w, R() * h, 30 + R() * 40, 14 + R() * 20, R() * 3, 0, 6.28); x.fill(); }
});
// pavement: big pale stone flags with darker joints (2 x 2 m)
const flagsTex = (col = [226, 216, 196]) => tex('flags' + col.join(), [256, 256], (x, w, h, R) => {
  x.fillStyle = '#a8a08e'; x.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 0.92 + R() * 0.12;
    x.fillStyle = `rgb(${(col[0] * v) | 0},${(col[1] * v) | 0},${(col[2] * v) | 0})`;
    x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(i * s + 3, j * s + 3, s - 8, 5);
  }
  for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(96,150,70,${0.25 + R() * 0.4})`; x.fillRect(R() * w, (Math.floor(R() * n) * s) - 1, 3 + R() * 6, 2); }
});
// cobbles: rounded setts in staggered rows, moss in the joints (2 x 2 m)
const cobbleTex = () => tex('cobble', [256, 256], (x, S, H, R) => {
  x.fillStyle = '#7f8a6a'; x.fillRect(0, 0, S, S);
  const rows = 11, rh = S / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 10; c++) {
    const w = S / 9, cx = (c + (r % 2) * 0.5) * w + w / 2, cy = r * rh + rh / 2, v = 0.85 + R() * 0.3;
    x.fillStyle = `rgb(${(186 * v) | 0},${(176 * v) | 0},${(160 * v) | 0})`;
    x.beginPath(); x.roundRect(cx - w / 2 + 2, cy - rh / 2 + 2, w - 4, rh - 4, 6); x.fill();
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.roundRect(cx - w / 2 + 4, cy - rh / 2 + 3, w - 10, (rh - 6) * 0.4, 4); x.fill();
  }
  for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(96,150,70,${0.4 + R() * 0.4})`; x.fillRect(R() * S, R() * S, 2 + R() * 4, 2); }
});
// the plaza: concentric rings of setts (one picture over the whole disc)
const plazaTex = (key, a = '#e6dcc6', b = '#c9bda4', c = '#b3a58a') => tex('plaza_' + key, [1024, 1024], (x, w, h, R) => {
  x.fillStyle = a; x.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  for (let r = 30; r < w / 2; r += 18) {
    const n = Math.round(2 * Math.PI * r / 20);
    for (let k = 0; k < n; k++) {
      const a0 = (k + (r % 36 ? 0.5 : 0)) / n * 6.283, v = 0.9 + R() * 0.14;
      x.save(); x.translate(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r); x.rotate(a0);
      const ring = Math.floor(r / 18) % 7 === 0;
      const col = new THREE.Color(ring ? c : b).multiplyScalar(v);
      x.fillStyle = '#' + col.getHexString(); x.fillRect(-7, -9, 14, 18); x.restore();
    }
  }
  // a star of lighter stone in the middle
  x.fillStyle = a; x.beginPath(); x.arc(cx, cy, 34, 0, 6.28); x.fill();
}, false);
// the glass of the towers: blue panes with a sky streak, white mullions (one
// band = 3 m wide x 2.1 m); its picture marks it as glass for the night
export const glassBandTex = () => tex('glassband', [256, 128], (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fd2ee'); g.addColorStop(0.55, '#5f9fcf'); g.addColorStop(1, '#3f78b0');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(0, h * 0.75); x.lineTo(w * 0.35, 0); x.lineTo(w * 0.55, 0); x.lineTo(w * 0.15, h); x.lineTo(0, h); x.fill();
  x.fillStyle = '#eef3f4'; for (let k = 0; k <= 4; k++) x.fillRect(k * w / 4 - 3, 0, 6, h);
  x.fillRect(0, 0, w, 5); x.fillRect(0, h - 5, w, 5);
});
// house windows for the far terraces: a row of small panes in a wall
const houseWinTex = () => tex('housewin', [128, 64], (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) { x.fillStyle = '#4f7aa0'; x.fillRect(k * w / 2 + 14, 16, w / 2 - 28, h - 30); x.fillStyle = '#9fc4dc'; x.fillRect(k * w / 2 + 14, 16, w / 2 - 28, 8); }
});

// ---------- merged geometry for the many plain boxes ----------
// one buffer per material key; boxes as 24 vertices with uvs in metres
class Batch {
  constructor() { this.parts = new Map(); }
  add(key, mat, geo) { if (!this.parts.has(key)) this.parts.set(key, { mat, geos: [] }); this.parts.get(key).geos.push(geo); }
  box(key, mat, w, h, d, x, y, z, ry = 0, col = null, uvs = 0.5) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const sw = ax > 0.5 ? d : w, sh = ay > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * sw * uvs, uv.getY(i) * sh * uvs);
    }
    g.rotateY(ry); g.translate(x, y, z);
    if (col) colorize(g, col);
    this.add(key, mat, g); return g;
  }
  flush(parent, { shadow = true, outline = false, name = 'vc_batch' } = {}) {
    const out = [];
    for (const [key, { mat, geos }] of this.parts) {
      // (in pieces of up to ~60k vertices, so no single mesh is huge)
      let run = [], n = 0;
      const emit = () => {
        if (!run.length) return;
        const g = mergeAll(run); const m = new THREE.Mesh(g, mat);
        m.castShadow = shadow; m.receiveShadow = true; m.name = name + '_' + key; m.userData.outline = outline; m.userData.keep = true;
        if (name.startsWith('vc_far')) m.onBeforeRender = function () {};   // (kept whole by town.js cellMerge: the native game finds the far towers by name)
        parent.add(m); out.push(m); run = []; n = 0;
      };
      for (const g of geos) { run.push(g); n += g.attributes.position.count; if (n > 60000) emit(); }
      emit();
    }
    this.parts.clear();
    return out;
  }
}
function colorize(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
function mergeAll(list) {
  const keys = ['position', 'normal', 'uv', 'color'].filter((k) => list.every((g) => g.attributes[k]));
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry(), arrs = {}, idx = new Uint32Array(ni);
  for (const k of keys) arrs[k] = new Float32Array(nv * list[0].attributes[k].itemSize);
  let vo = 0, io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    for (const k of keys) arrs[k].set(g.attributes[k].array, vo * g.attributes[k].itemSize);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
    else for (let i = 0; i < c; i++) idx[io++] = i + vo;
    vo += c;
  }
  for (const k of keys) out.setAttribute(k, new THREE.BufferAttribute(arrs[k], list[0].attributes[k].itemSize));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const vcMat = (key, opts = {}) => matCache(key, () => O.vcFlat(opts.side));
const _mc = new Map();
function matCache(k, f) { if (!_mc.has(k)) _mc.set(k, f()); return _mc.get(k); }
// a textured material with vertex colours (the colour tints the picture)
function texVC(t, key) {
  return matCache('tvc' + key, () => { const m = O.texm(t, '#ffffff', undefined, true); return m; });
}

// ---------- ribbons on the ground ----------
// a strip along a polyline, `a`..`b` metres from its centre line (signed:
// left negative), following the ground, `lift` above it
function ribbon(pts, a, b, lift, uvScale = 0.5, step = 1.5, yAt = null) {
  // resample the polyline
  const P = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  P.push(pts[pts.length - 1].slice(0, 2));
  const pos = [], uv = [], idx = [], cols = 3;
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(P.length - 1, i + 1)];
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (let k = 0; k < cols; k++) {
      const o = a + (b - a) * k / (cols - 1), x = P[i][0] + nx * o, z = P[i][1] + nz * o;
      pos.push(x, (yAt ? yAt(x, z) : height(x, z)) + lift, z); uv.push(o * uvScale, s * uvScale);
    }
    if (i) for (let k = 0; k < cols - 1; k++) { const q = (i - 1) * cols + k; idx.push(q, q + 1, q + cols, q + 1, q + cols + 1, q + cols); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a disc following the ground (uv over the whole disc, or in metres)
function disc(cx, cz, r, lift, whole = true, uvScale = 0.5) {
  const pos = [], uv = [], idx = [], RN = Math.max(6, Math.ceil(r / 1.5)), AN = Math.max(24, Math.ceil(r * 3));
  pos.push(cx, height(cx, cz) + lift, cz); uv.push(whole ? 0.5 : 0, whole ? 0.5 : 0);
  for (let i = 1; i <= RN; i++) for (let k = 0; k < AN; k++) {
    const rr = r * i / RN, a = k / AN * 6.2832, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    pos.push(x, height(x, z) + lift, z); uv.push(whole ? 0.5 + Math.cos(a) * rr / r / 2 : (x - cx) * uvScale, whole ? 0.5 - Math.sin(a) * rr / r / 2 : (z - cz) * uvScale);
  }
  for (let k = 0; k < AN; k++) idx.push(0, 1 + (k + 1) % AN, 1 + k);
  for (let i = 1; i < RN; i++) for (let k = 0; k < AN; k++) {
    const a = 1 + (i - 1) * AN + k, b = 1 + (i - 1) * AN + (k + 1) % AN, c = a + AN, d = b + AN;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const decal = (t, col = '#ffffff', units = -2) => {
  const m = O.texm(t, col); m.polygonOffset = true; m.polygonOffsetFactor = units; m.polygonOffsetUnits = units; return m;
};
function groundMesh(G, g, m, name) { const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.outline = false; mesh.name = name; G.add(mesh); return mesh; }

// ---------- the build ----------
// the landmark models' pads are walkable once the models stand there (their
// own colliders keep you out of the walls): before anything reads walkF
if (VP && VP.place) for (const k of ['center', 'gym']) {
  const P = PADS[k], hw = (Math.abs(Math.sin(P.rot)) > 0.7 ? P.d : P.w) / 2, hd = (Math.abs(Math.sin(P.rot)) > 0.7 ? P.w : P.d) / 2;
  if ((k === 'center' && VP.pokemonCenter) || (k === 'gym' && VP.viridianGym)) VC.RECTS.push({ id: k + 'Pad', x0: P.x - hw, x1: P.x + hw, z0: P.z - hd, z1: P.z + hd });
}
export function viridianFill(world) {
  const root = new THREE.Group(); root.name = 'viridian';
  const G = world.group;
  const col = (c) => { c.ed = 1; world.colliders.push(c); return c; };   // (ed: the plants seeded before keep their places)
  const use = (x, z, label, lines, r = 1.3) => world.use.push({ x, z, r, label, lines });
  const place = (g, x, z, rot = 0, y = null) => { g.position.set(x, y ?? height(x, z), z); g.rotation.y = rot; G.add(g); return g; };
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const vc = world.viridian = { buildings: [], trees: [], lamps: [] };

  paving(G);
  const fronts = buildings(G, world, col, use, vc);
  lots(G, world, col, use, fronts);
  slopes(G, fronts);
  lining(G, world, col, fronts);
  cutting(G, world, col, use, place);
  lakeside(G, world, col, use);
  gates(G, world, col, use, place);
  furniture(G, world, col, use, place, yawTo, vc);
  plantsPlan(fronts);
  // the perches as built: the downtown tower nearest STORY's ledge, at its real roof
  vc.perches = { ...STORY.perches };
  { const [px, , pz] = STORY.perches.towerLedge; let best = null; for (const P of fronts) if (P.top !== undefined && (!best || Math.hypot(P.x - px, P.z - pz) < Math.hypot(best.x - px, best.z - pz))) best = P; if (best) vc.perches.towerLedge = [+best.x.toFixed(2), +(best.y + best.top).toFixed(2), +best.z.toFixed(2)]; }
  for (const P of fronts) OCC.push([P.x, P.z, P.w / 2, P.d / 2, P.rot || 0]);
  return root;
}

// ---------- paving ----------
function paving(G) {
  const P = new THREE.Group(); P.name = 'vc_paving'; G.add(P);
  const asphalt = decal(asphaltTex(), '#ffffff', -2), flags = decal(flagsTex(), '#ffffff', -2), cob = decal(cobbleTex(), '#ffffff', -2);
  const prom = decal(flagsTex([214, 206, 188]), '#ffffff', -2);
  const lines = matCache('vc_lines', () => { const m = O.flat('#f2efe2'); m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3; return m; });
  for (const S of VC.STREETS) {
    const yAt = S.kind === 'cut' ? null : null;
    if (S.kind === 'road') {
      groundMesh(P, ribbon(S.pts, -S.hw, S.hw, 0.04, 0.5, 1.5, yAt), flags, 'vc_pave_' + S.id);
      const rw = S.hw - 3.2;
      groundMesh(P, ribbon(S.pts, -rw, rw, 0.07, 0.25, 1.5, yAt), asphalt, 'vc_road_' + S.id);
      // the kerbs: a darker stone line, a little proud (broken where another
      // street's road or a round place crosses)
      const other = (x, z) => VC.ROUNDS.some((R) => Math.hypot(x - R.x, z - R.z) < R.r + 0.5) || VC.STREETS.some((S2) => S2 !== S && S2.kind !== 'prom' && VC.streetNear(S2.pts, x, z).d < S2.hw - (S2.kind === 'road' ? 3.0 : -0.3));
      for (const s of [-1, 1]) for (const run of runsOf(S.pts, s * rw, other)) groundMesh(P, ribbon(run, s * rw - 0.15, s * rw + 0.15, 0.1, 0.5, 1.5, yAt), matCache('vc_kerb', () => O.flat('#cfc7b4')), 'vc_kerb');
      // the centre line, dashed
      for (const run of runsOf(S.pts, 0, other)) dashes(P, run, 0, 0.09, lines);
    } else if (S.kind === 'old' || S.kind === 'cut' || S.kind === 'lane') {
      groundMesh(P, ribbon(S.pts, -S.hw, S.hw, 0.05, 0.5, 1.5, yAt), cob, 'vc_cobble_' + (S.id || 'cut'));
      if (S.kind === 'cut') dashes(P, S.pts, 0, 0.09, lines, 3, 5);
    } else groundMesh(P, ribbon(S.pts, -S.hw, S.hw, 0.05, 0.5, 1.5, yAt), prom, 'vc_prom');
  }
  for (const R of VC.ROUNDS) {
    const t = R.kind === 'plaza' ? plazaTex('plaza') : plazaTex('sq', '#e2d8c2', '#cfc3a8', '#b9ab8e');
    groundMesh(P, disc(R.x, R.z, R.r + 0.3, 0.09), decal(t, '#ffffff', -4), 'vc_round_' + R.id);
  }
  for (const R of VC.RECTS) {
    if (R.deck || R.id.endsWith('Pad')) continue;   // (a model's grounds: its own paving)
    const pts = [[(R.x0 + R.x1) / 2, R.z1], [(R.x0 + R.x1) / 2, R.z0]];
    groundMesh(P, ribbon(pts, -(R.x1 - R.x0) / 2, (R.x1 - R.x0) / 2, 0.08), flags, 'vc_rect_' + R.id);
  }
}
// the stretches of a polyline (offset `off` to its left) where skip() is false
function runsOf(pts, off, skip) {
  const out = []; let run = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
    for (let d = 0; d < l; d += 0.5) {
      const x = ax + (bx - ax) * d / l, z = az + (bz - az) * d / l;
      if (skip(x + nx * off, z + nz * off)) { if (run.length > 2) out.push(run); run = []; }
      else run.push([x, z]);
    }
  }
  run.push(pts[pts.length - 1].slice(0, 2));
  if (run.length > 2) out.push(run);
  return out;
}
function dashes(P, pts, off, lift, m, on = 3, gap = 4) {
  const geos = [];
  let s = 0, st = true, run = [];
  const flushRun = () => { if (run.length > 1) geos.push(ribbon(run, off - 0.08, off + 0.08, lift, 1, 1)); run = []; };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < l; d += 0.5) {
      const ph = (s + d) % (on + gap) < on;
      const p = [ax + (bx - ax) * d / l, az + (bz - az) * d / l];
      if (ph) run.push(p); else flushRun();
    }
    s += l;
  }
  flushRun();
  for (const g of geos) groundMesh(P, g, m, 'vc_line');
}

// ---------- the Old Town and the landmarks ----------
// footprints of everything built: [x, z, hw, hd, rot] (for the lining)
function buildings(G, world, col, use, vc) {
  const fronts = [];
  const add = (g, P, id) => {
    g.position.set(P.x, P.y, P.z); g.rotation.y = P.rot || 0; eid(g, 'viridian/' + id); G.add(g);
    col({ box: true, x: P.x, z: P.z, hw: (P.rot && Math.abs(Math.sin(P.rot)) > 0.7 ? P.d : P.w) / 2, hd: (P.rot && Math.abs(Math.sin(P.rot)) > 0.7 ? P.w : P.d) / 2, rot: 0 });
    fronts.push(P);
    return g;
  };
  // the POKéMON CENTER and the GYM: their own models (props/viridian.js, with
  // their colliders, decks and markers: its place()), whose pads are then
  // walkable grounds lined like the streets; else stand-ins
  vc.markers = {};
  for (const [k, make, standIn] of [['center', VP && VP.pokemonCenter, centerStandIn], ['gym', VP && VP.viridianGym, gymStandIn]]) {
    const P = PADS[k];
    if (make && VP.place) {
      const g = eid(make(), 'viridian/' + k);
      vc.markers[k] = VP.place(world, g, P.x, P.y, P.z, P.rot);
    } else add(standIn(), P, k);
  }
  // the story's places on the models, in world coordinates (their markers)
  const mk = vc.markers, xyz = (m) => m && [m[0], m[1], m[2]];
  if (mk.center) {
    Object.assign(STORY.perches, { centerDome: xyz(mk.center.perch_dome) || STORY.perches.centerDome, centerLamp: xyz(mk.center.perch_lamp) });
    for (const k of ['perch_dome_front', 'perch_rim_back', 'perch_rim_east', 'perch_rim_west']) if (mk.center[k]) STORY.perches['center_' + k.slice(6)] = xyz(mk.center[k]);
    if (mk.center.door) STORY.centerDoors = xyz(mk.center.door);
    if (mk.center.bike) STORY.centerBike = mk.center.bike;
    if (mk.center.ramp_foot) STORY.bikeRoute[STORY.bikeRoute.length - 1] = [mk.center.ramp_foot[0], mk.center.ramp_foot[2]];
    STORY.center = mk.center;
  }
  if (mk.gym) { for (const [k, v] of Object.entries(mk.gym)) if (k.startsWith('perch')) STORY.perches['gym_' + k.slice(6)] = xyz(v); STORY.gym = mk.gym; }
  use(PADS.center.door[0], PADS.center.door[1] + 2.2, 'Read', ['POKéMON CENTER', 'Heal your POKéMON! Open around the clock.'], 1.6);
  // the MART, the School, the nickname house, the police box: massing for now
  add(placeholder({ W: PADS.mart.w, D: PADS.mart.d, floors: 2, wall: '#f4f1ea', roof: '#2f6fc8', band: '#3a7ad8', sign: 'POKé MART', signCol: '#2f6fc8', flat: true }), PADS.mart, 'mart');
  add(placeholder({ W: PADS.school.w, D: PADS.school.d, floors: 2, wall: '#efe2c8', roof: '#c4553a', band: '#8a5a3a', sign: 'TRAINER SCHOOL', signCol: '#3f6a4a', gable: true }), PADS.school, 'school');
  add(placeholder({ W: PADS.nickname.w, D: PADS.nickname.d, floors: 2, wall: '#f2d9c0', roof: '#3d6fa8', band: '#6a4a3a', gable: true }), PADS.nickname, 'nickname');
  add(placeholder({ W: PADS.police.w, D: PADS.police.d, floors: 1, wall: '#f4f4f0', roof: '#2a3f6a', band: '#2a3f6a', sign: 'POLICE', signCol: '#2a3f6a', flat: true }), PADS.police, 'police');
  return fronts;
}
// a stand-in massing for a building to come: walls, a band of windows per
// floor, a roof (flat with a parapet, or a gable), a sign over the door
function placeholder({ W, D, floors, wall, roof, band, sign = null, signCol = '#2f5a4a', flat = false, gable = false }) {
  const G = new THREE.Group(), FH = 3.2;
  O.box(W, 0.5, D, '#b4ad98', 0, 0.0, 0, G);
  O.box(W, floors * FH, D, wall, 0, 0.25 + floors * FH / 2, 0, G);
  const gl = texVC(glassBandTex(), 'glassband');
  for (let f = 0; f < floors; f++) for (const rz of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const len = (rz === 0 || rz === Math.PI) ? W : D, dd = (rz === 0 || rz === Math.PI) ? D : W;
    const g = new THREE.PlaneGeometry(len - 1.2, 1.5); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * (len - 1.2) / 3);
    colorize(g, '#ffffff');
    const m = new THREE.Mesh(g, gl); m.position.set(Math.sin(rz) * (dd / 2 + 0.03), 0.25 + f * FH + 1.7, Math.cos(rz) * (dd / 2 + 0.03)); m.rotation.y = rz; G.add(m);
  }
  O.box(W + 0.1, 0.35, D + 0.1, band, 0, 0.25 + FH * floors - 0.2, 0, G);
  if (flat) { O.box(W + 0.4, 0.6, D + 0.4, roof, 0, 0.25 + floors * FH + 0.3, 0, G); }
  else if (gable) {
    const sh = new THREE.Shape(); sh.moveTo(-D / 2 - 0.5, 0); sh.lineTo(D / 2 + 0.5, 0); sh.lineTo(0, 2.8); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: W + 0.8, bevelEnabled: false }); g.translate(0, 0, -(W + 0.8) / 2); g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, O.flat(roof)); m.position.y = 0.25 + floors * FH; G.add(m);
  }
  if (sign) {
    const t = O.words('vc_sign_' + sign, 512, 128, (x, w, h) => {
      x.fillStyle = signCol; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 18); x.fill();
      x.fillStyle = '#ffffff'; O.fitFont(x, sign, 70, w * 0.86, '"Lilita One", "Pixelify Sans", system-ui, sans-serif'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sign, w / 2, h / 2 + 3);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(W - 1, 5.2), 1.3), O.texm(t)); m.position.set(0, 0.25 + FH - 0.2, D / 2 + 0.08); m.userData.outline = false; G.add(m);
  }
  // the door
  O.box(1.6, 2.3, 0.12, '#3a4a5a', 0, 0.25 + 1.15, D / 2 + 0.04, G);
  return G;
}
// the Center until its model is here: a white curved base, the red dome
function centerStandIn() {
  const G = new THREE.Group();
  O.cyl(16, 17, 1.0, '#e8e2d4', 0, 0.5, 0, G, 48);
  O.cyl(15, 15, 7.5, '#f6f4ee', 0, 4.75, 0, G, 48);
  O.box(12, 6, 3, '#f6f4ee', 0, 3.5, 14.5, G);
  O.box(8, 4.2, 0.2, '#7fb2d8', 0, 3.1, 16.05, G);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(14.5, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), O.flat('#e2403a'));
  dome.position.y = 8.5; dome.scale.y = 0.62; G.add(dome);
  O.box(7, 1.6, 0.3, '#e2403a', 0, 7.4, 16.1, G);
  return G;
}
// the GYM until its model is here: the orange curved roof on columns, stairs
function gymStandIn() {
  const G = new THREE.Group();
  O.box(46, 1.0, 36, '#d8d0bc', 0, 0.5, 0, G);
  O.box(36, 10, 24, '#efe6d2', 0, 6, -3, G);
  for (let i = 0; i < 8; i++) O.cyl(0.6, 0.6, 9, '#f6f2e6', -14 + i * 4, 5.5, 9.6, G, 12);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 40, 32, 1, false, -Math.PI / 2, Math.PI), O.flat('#e8862e'));
  roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.45); roof.position.set(0, 11, -2); G.add(roof);
  for (const sx of [-1, 1]) O.box(8, 1.2, 6, '#d8d0bc', sx * 12, 0.6, 15, G);
  O.cyl(3, 3.4, 0.8, '#cfc7b4', 0, 0.9, 13.5, G, 24);
  return G;
}

// ---------- the lining: what stands along every edge of the walkable streets ----------
function lining(G, world, col, fronts) {
  const box = { x0: -200, x1: 200, z0: VC.NORTH_Z + 10, z1: VC.GATE_Z - 1, res: 1 };
  const lines = traceEdges(VC.walkF, box).map((L) => finishLine(L, VC.walkF, 1.0)).filter(Boolean);
  const inFoot = (x, z, m) => fronts.some((P) => VC.padDist(P, x, z) < m);
  const hedge = [], rail = [], wall = [];
  for (const L of lines) {
    for (let i = 0; i < L.pts.length; i++) {
      const [x, z] = L.pts[i], [nx, nz] = L.n[i];
      if (z > VC.GATE_Z - 2) continue;
      if (VC.cutRock(x, z)) continue;
      if (inFoot(x + nx * 0.6, z + nz * 0.6, 1.2)) continue;
      const wx = x + nx * 2.5, wz = z + nz * 2.5;
      const lake = Math.hypot(wx - VC.LAKE.x, wz - VC.LAKE.z) < VC.LAKE.r + 3 || isWater(wx, wz);
      const p = { x: x + nx * 0.45, z: z + nz * 0.45, nx, nz, i };
      if (lake) rail.push(p);
      else if (z > -592) wall.push(p);
      else hedge.push(p);
    }
  }
  // hedges: trimmed boxes with a leafy skin, 1.1 m, a collider per metre
  {
    const B = new Batch(), m = matCache('vc_hedge', () => O.flat('#3f8a3e'));
    for (const p of hedge) {
      const ry = Math.atan2(p.nx, p.nz), y = height(p.x, p.z);
      B.box('hedge', m, 1.15, 1.25, 0.95, p.x, y + 0.55, p.z, ry);
      col({ box: true, x: p.x, z: p.z, hw: 0.55, hd: 0.5, rot: ry });
    }
    const H = new THREE.Group(); H.name = 'vc_hedges'; G.add(H); B.flush(H, { shadow: true, outline: false, name: 'vc_hedge' });
    // a leafy crown along them: small bushes sitting on the trimmed box (veg.js sows them, with their own ink)
    for (let k = 0; k < hedge.length; k += 2) { const p = hedge[k]; HEDGE_TOPS.push({ x: p.x, z: p.z, y: height(p.x, p.z) + 0.55, rot: (k * 2.39) % 6.28, s: 0.55 }); }
  }
  // railings over the water: posts and two rails, a stone kerb under
  {
    const B = new Batch(), iron = matCache('vc_iron', () => O.flat('#2f4a46')), kerb = matCache('vc_quay', () => O.flat('#c9bfa8'));
    for (const p of rail) {
      const ry = Math.atan2(p.nx, p.nz), y = height(p.x, p.z);
      B.box('kerb', kerb, 1.05, 0.35, 0.6, p.x, y + 0.12, p.z, ry);
      if (p.i % 2 === 0) B.box('post', iron, 0.08, 1.1, 0.08, p.x, y + 0.75, p.z, ry);
      B.box('rail', iron, 1.05, 0.06, 0.06, p.x, y + 1.25, p.z, ry);
      B.box('rail2', iron, 1.05, 0.04, 0.04, p.x, y + 0.75, p.z, ry);
      // the quay's stone face down into the water
      B.box('quay', kerb, 1.08, 3.2, 0.7, p.x + p.nx * 0.45, Math.min(y, 14.6) - 1.55, p.z + p.nz * 0.45, ry);
      col({ box: true, x: p.x, z: p.z, hw: 0.55, hd: 0.3, rot: ry });
    }
    const H = new THREE.Group(); H.name = 'vc_rails'; G.add(H); B.flush(H, { shadow: true, outline: false, name: 'vc_rail' });
  }
  // stone walls (the corridor past the gate, the road down from the crest)
  {
    const B = new Batch(), st = matCache('vc_wall', () => O.texm(O.stonesTex('#c4bca6')));
    for (const p of wall) {
      const ry = Math.atan2(p.nx, p.nz), y = height(p.x, p.z);
      B.box('wall', st, 1.08, 1.4, 0.7, p.x, y + 0.45, p.z, ry);
      col({ box: true, x: p.x, z: p.z, hw: 0.55, hd: 0.36, rot: ry });
    }
    const H = new THREE.Group(); H.name = 'vc_walls'; G.add(H); B.flush(H, { shadow: true, outline: false, name: 'vc_wall' });
  }
  return { hedge, rail, wall };
}

// ---------- the cutting ----------
// ---------- the lake: the quay wall, the pier ----------
function lakeside(G, world, col, use) {
  const P = VC.PIER, y = P.y;
  const D = new THREE.Group(); D.name = 'vc_pier'; G.add(D);
  const deck = O.texm(O.planks('#b88a5a'));
  const len = P.x1 - P.x0;
  O.box(len, 0.25, P.w, deck, (P.x0 + P.x1) / 2, y - 0.12, P.z, D);
  for (let x = P.x0 + 1; x < P.x1; x += 3.2) for (const s of [-1, 1]) {
    O.cyl(0.16, 0.16, 4, '#6a5038', x, y - 2.1, P.z + s * (P.w / 2 - 0.25), D, 8);
    O.cyl(0.05, 0.05, 1.0, '#2f4a46', x, y + 0.5, P.z + s * (P.w / 2 - 0.1), D, 6);
  }
  for (const s of [-1, 1]) O.box(len, 0.06, 0.06, '#2f4a46', (P.x0 + P.x1) / 2, y + 1.0, P.z + s * (P.w / 2 - 0.1), D);
  world.walk.push({ x0: P.x0, x1: P.x1, z0: P.z - P.w / 2 + 0.1, z1: P.z + P.w / 2 - 0.1, y: y + 0.02 });
  for (const s of [-1, 1]) col({ box: true, x: (P.x0 + P.x1) / 2, z: P.z + s * (P.w / 2), hw: len / 2, hd: 0.12, rot: 0 });
  col({ box: true, x: P.x0 - 0.1, z: P.z, hw: 0.15, hd: P.w / 2, rot: 0 });
  use(P.x0 + 1.5, P.z, 'Look', ['The lake is deep and very still here.', 'A sign on the last post: FISHING FROM THE PIER WELCOME. PLEASE TAKE YOUR LINES HOME.'], 1.4);
}
// ---------- the gates: Route 2 north, Route 22 west ----------
// ---------- lamps, benches, signs ----------
function furniture(G, world, col, use, place, yawTo, vc) {
  signs(G, world, col, use, place, yawTo);
  benches(G, world, col, place);
  clockTower(G, col, use);
  plaza(G, col);
  // the welcome sign at the South Square
  {
    const x = 18, z = -584;
    const g = welcomeSign({ title: 'VIRIDIAN CITY', sub: 'THE ETERNALLY GREEN PARADISE', wood: '#9a7a4a', slate: '#2f5a4a' });
    place(g, x, z, yawTo(x, z, 6, -572));
    for (const [lx, lz, pr] of g.userData.posts || [[0, 0, 0.5]]) col({ x: x + lx, z: z + lz, r: pr });
    use(x - 1.2, z + 1.4, 'Read', ['VIRIDIAN CITY', 'The Eternally Green Paradise']);
  }
  // street lamps along the streets, every ~16 m, both sides alternating
  for (const S of VC.STREETS) {
    if (S.kind === 'prom') continue;
    let k = 0;
    for (let i = 0; i + 1 < S.pts.length; i++) {
      const [ax, az] = S.pts[i], [bx, bz] = S.pts[i + 1], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
      for (let d = 6; d < l; d += 16, k++) {
        const s = k % 2 ? 1 : -1, off = S.hw - 0.9, x = ax + (bx - ax) * d / l + nx * off * s, z = az + (bz - az) * d / l + nz * off * s;
        if (VC.walkF(x, z) > -0.5) continue;
        place(O.streetLamp({ h: 4.2 }), x, z, 0); col({ x, z, r: 0.22 });
        vc.lamps.push([x, z]);
      }
    }
  }
}
// ---------- far: the downtown towers, the terraces on the slopes ----------

// ---------- for veg.js ----------
const PLANTS = { trees: [], bushes: [] };
const HEDGE_TOPS = [];
// what the city keeps clear of the plants seeded before it (its streets, its
// buildings, the lake)
const OCC = [];   // [x, z, hw, hd, rot] footprints the city built
export function plantOff(x, z, r = 1) {
  if (z > VC.GATE_Z + 1) return false;
  if (VC.walkF(x, z) < r) return true;
  for (const P of Object.values(PADS)) if (VC.padDist(P, x, z) < r + 1) return true;
  for (const [cx, cz, hw, hd, rot] of OCC) { const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dz = z - cz; if (Math.abs(dx * c - dz * s) < hw + r && Math.abs(dx * s + dz * c) < hd + r) return true; }
  return Math.hypot(x - VC.LAKE.x, z - VC.LAKE.z) < VC.LAKE.r + 4;
}
// the city's own plants: [[models, points, kind]] (points {x, y, z, rot, s})
export function cityPlants(makeTree, makeBush, makeClump, TILE) {
  const out = [];
  const byKind = new Map();
  for (const t of PLANTS.trees) { if (!byKind.has(t.k)) byKind.set(t.k, []); byKind.get(t.k).push(t); }
  let seed = 3400;
  for (const [k, list] of byKind) { const ms = [makeTree(k, seed)]; seed += 3; out.push([ms, list, 'tree']); }
  if (HEDGE_TOPS.length) out.push([[makeBush(3470, { size: 1.0 }), makeBush(3471, { size: 1.1 })], HEDGE_TOPS, 'bush']);
  if (PLANTS.bushes.length) out.push([[makeBush(3460, { size: 1.1 }), makeBush(3461, { size: 1.4, flowers: TILE.flowersR }), makeBush(3462, { size: 1.0, flowers: TILE.flowersY })], PLANTS.bushes, 'bush']);
  return out;
}

// ---------- lots along the streets ----------
// kept free of lots: the clock tower's square, the police box's forecourt
const RESERVED = [{ x: -12.6, z: -790, w: 7, d: 7, rot: 0 }];
// rect test: is (x, z) inside lot L (+m)
const inLot = (L, x, z, m = 0) => { const c = Math.cos(L.rot), s = Math.sin(L.rot), dx = x - L.x, dz = z - L.z; return Math.abs(dx * c - dz * s) < L.w / 2 + m && Math.abs(dx * s + dz * c) < L.d / 2 + m; };
const lotPts = (L) => {
  const c = Math.cos(L.rot), s = Math.sin(L.rot), out = [];
  for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) for (const v of [-0.5, -0.2, 0.15, 0.5]) { const lx = u * L.w, lz = v * L.d; out.push([L.x + lx * c + lz * s, L.z - lx * s + lz * c]); }
  return out;
};
function lotFree(L, taken, { minE = 0, maxE = 0.86, margin = 0.6 } = {}) {
  for (const [x, z] of lotPts(L)) {
    if (VC.walkF(x, z) < margin) return false;
    const e = VC.bowlE(x, z); if (e > maxE || e < minE) return false;
    if (Math.hypot(x - VC.LAKE.x, z - VC.LAKE.z) < VC.LAKE.r + 9) return false;
    if (z > -548) return false;
  }
  for (const P of Object.values(PADS)) for (const [x, z] of lotPts(L)) if (VC.padDist(P, x, z) < 1.2) return false;
  for (const T of [...RESERVED, ...taken]) {
    if (Math.hypot(T.x - L.x, T.z - L.z) > (Math.hypot(T.w, T.d) + Math.hypot(L.w, L.d)) / 2 + 1) continue;
    for (const [x, z] of lotPts(L)) if (inLot(T, x, z, 0.4)) return false;
    for (const [x, z] of lotPts(T)) if (inLot(L, x, z, 0.4)) return false;
  }
  return true;
}
// lots fronting a street on one side: front on the pavement's edge
function frontage(S, side, R, taken, { w = [7, 11], d = [8, 11], gap = [0, 2], inset = 0.2, from = 0, to = 1e9, maxE = 0.86 } = {}) {
  const out = [], P = S.pts;
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s) => { let i = 0; while (i < P.length - 2 && cum[i + 1] < s) i++; const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1); const [ax, az] = P[i], [bx, bz] = P[i + 1], l = Math.hypot(bx - ax, bz - az) || 1; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / l, tz: (bz - az) / l }; };
  let s = Math.max(2, from);
  while (s < Math.min(total, to) - 3) {
    const W = w[0] + R() * (w[1] - w[0]), D = d[0] + R() * (d[1] - d[0]);
    const a = at(s + W / 2), nx = -a.tz * side, nz = a.tx * side;   // toward the lot
    const off = S.hw + inset + D / 2;
    const L = { x: a.x + nx * off, z: a.z + nz * off, w: W, d: D, rot: Math.atan2(-nx, -nz), street: S.id };
    if (lotFree(L, taken, { maxE, margin: 0.05 })) { out.push(L); taken.push(L); s += W + gap[0] + R() * (gap[1] - gap[0]); }
    else s += 2.5;
  }
  return out;
}
const WALLS = ['#f4f1ea', '#efe2c8', '#f2d9c0', '#e8eef0', '#dfe9df', '#f1e4cf', '#e6dccb', '#f6efe0'];
const ROOFS = ['#c4553a', '#3d6fa8', '#2f6f9a', '#b8483a', '#4f7ab0', '#3d7a6a', '#d0693e'];
const TOWER_WALLS = ['#f4f2ea', '#e6eef0', '#dde9e0', '#f1e4cf', '#e4dccc', '#d6e2ea', '#eef0f2', '#e8e0d4'];
const ACCENTS = ['#4f8a6a', '#3d6fa8', '#2f5a4a', '#c4553a', '#d08a3a', '#5a7a9a', '#3a8a8a'];
function lots(G, world, col, use, fronts) {
  const R = rng(3410), taken = [];
  const S = Object.fromEntries(VC.STREETS.filter((q) => q.id).map((q) => [q.id, q]));
  const old = [], towers = [];
  // downtown's front row: towers along Evergreen Avenue, both sides
  towers.push(...frontage(S.evergreen, -1, R, taken, { w: [16, 24], d: [16, 22], gap: [0, 4] }));
  towers.push(...frontage(S.evergreen, 1, R, taken, { w: [16, 24], d: [16, 22], gap: [0, 4], from: 30 }));
  // Mart Street's east side past the MART, Route 1 Avenue's east side
  towers.push(...frontage(S.mart, -1, R, taken, { w: [14, 20], d: [14, 18], gap: [1, 4], from: 85 }));
  // the Old Town: Old Street, Lakeside Road, School Lane, Mart Street's west side
  old.push(...frontage(S.old, 1, R, taken, { from: 4 }));
  old.push(...frontage(S.old, -1, R, taken, { from: 4 }));
  old.push(...frontage(S.lakeside, 1, R, taken, { from: 4 }));
  old.push(...frontage(S.lakeside, -1, R, taken, { from: 4 }));
  old.push(...frontage(S.school, 1, R, taken, { w: [6, 9], d: [7, 9] }));
  old.push(...frontage(S.school, -1, R, taken, { w: [6, 9], d: [7, 9] }));
  old.push(...frontage(S.mart, 1, R, taken, { w: [8, 12], d: [9, 12] }));
  old.push(...frontage(S.r1ave, 1, R, taken, { w: [7, 10], d: [8, 10] }));
  old.push(...frontage(S.r1ave, -1, R, taken, { w: [8, 12], d: [8, 12] }));
  old.push(...frontage(S.prom, -1, R, taken, { w: [8, 12], d: [8, 11], gap: [3, 8] }));
  // the avenue's far end: a landmark tower closing the view down it
  { const L = { x: 202, z: -624, w: 30, d: 26, rot: -Math.PI / 2, street: 'evergreen', landmark: true }; taken.push(L); towers.push(L); }
  let n = 0;
  for (const L of old) {
    const g = oldHouse(L, R, n++);
    const y = lotY(L) - 0.05;
    g.position.set(L.x, y, L.z); g.rotation.y = L.rot; eid(g, `viridian/old/${n}`); G.add(g);
    col({ box: true, x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, rot: L.rot });
    fronts.push({ ...L, y });
  }
  for (const L of towers) {
    const g = new THREE.Group(), B = new Batch();
    const floors = L.landmark ? 26 : 7 + Math.floor(R() * 12 * (0.6 + 0.4 * VC.smooth(60, 180, L.x)));
    const top = towerInto(B, { w: L.w, d: L.d, floors, wall: TOWER_WALLS[n % TOWER_WALLS.length], accent: ACCENTS[(n * 3) % ACCENTS.length], podium: true, top: L.landmark ? 'spire' : ['garden', 'garden', 'crown', 'flat'][n % 4], seed: 500 + n });
    B.flush(g, { shadow: true, outline: undefined, name: 'vc_tower' });
    n++;
    const y = lotY(L) - 0.3;
    g.position.set(L.x, y, L.z); g.rotation.y = L.rot; eid(g, `viridian/tower/${n}`); G.add(g);
    col({ box: true, x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, rot: L.rot });
    fronts.push({ ...L, y, top });
  }
}
const lotY = (L) => { let m = Infinity; for (const [x, z] of lotPts(L)) m = Math.min(m, height(x, z)); return m; };

// an Old Town house: two to four storeys, a shop on the ground floor of many
function oldHouse(L, R, i) {
  const floors = 2 + Math.floor(R() * 2.2), shop = R() < 0.55;
  const wallC = WALLS[i % WALLS.length], roofC = ROOFS[(i * 5 + 1) % ROOFS.length];
  const W = L.w, D = L.d, openings = [];
  const per = Math.max(1, Math.floor(W / 2.4));
  for (let f = 0; f < floors; f++) for (let k = 0; k < per; k++) {
    const x = per === 1 ? 0 : -W / 2 + 1.4 + k * (W - 2.8) / (per - 1);
    if (f === 0 && shop) continue;
    if (f === 0 && k === Math.floor(per / 2)) { openings.push({ face: 'front', kind: 'door', x, glass: true, canopy: R() < 0.4 }); continue; }
    openings.push({ face: 'front', kind: 'window', x, floor: f, w: 1.0, h: 1.25, panes: [2, 2], box: R() < 0.45 ? '#8a5a3a' : null, shutters: R() < 0.35 ? roofC : null, curtains: R() < 0.5 ? '#f2e6c8' : '#e8b8a0' });
  }
  if (shop) {
    openings.push({ face: 'front', kind: 'shop', x: W > 9 ? -1 : 0.4, w: Math.min(W - 3, 4.2) });
    openings.push({ face: 'front', kind: 'door', x: W / 2 - 1.2, w: 0.95 });
  }
  for (let f = 1; f < floors; f++) openings.push({ face: 'back', kind: 'window', x: 0, floor: f, w: 1.0, h: 1.2 });
  const SHOPS = ['BAKERY', 'FLOWERS', 'BOOKS', 'CAFE', 'TEA & CAKES', 'BIKES', 'HERBS', 'OUTFITTERS', 'NOODLES', 'BERRIES', 'CLOCKS', 'MAPS'];
  return building({ W, D, floors, floorH: 2.9, trim: '#fbfaf4', seed: 700 + i, lod: 'far',
    plinth: { h: 0.4, deep: 2.0, kind: 'stone', col: '#c4bca6' },
    wall: { kind: R() < 0.22 ? 'brick' : 'plaster', col: R() < 0.22 ? '#c47a5a' : wallC },
    roof: { type: R() < 0.45 ? 'hip' : 'gable', cover: R() < 0.5 ? 'clay' : 'slate', col: roofC, rise: 2.0 + R() * 0.8, over: 0.45, gableOver: 0.4, gutters: false },
    chimney: R() < 0.4 ? { x: W / 2 - 1.1, z: -D * 0.2, pots: 1 } : null,
    openings,
    awning: shop ? { x: W > 9 ? -1 : 0.4, w: Math.min(W - 2.6, 4.6), col: ['#3a74c8', '#d23a34', '#3f8a5a', '#d08a3a'][i % 4] } : null,
    sign: shop ? { text: SHOPS[i % SHOPS.length], y: 3.25, w: Math.min(3.2, W - 2), col: ['#2f5a4a', '#3a4a6a', '#6a3a2a'][i % 3] } : null,
    ivy: R() < 0.5 ? [{ face: 'front', x: (R() - 0.5) * W * 0.4, w: W * 0.4, h: floors * 2.9 * 0.8, dens: 7 }] : [],
    moss: R() < 0.3 });
}

// ---------- the tower kit ----------
// into a Batch, in the tower's own frame (front +z, centred, ground y 0):
// a podium (two tall floors of shop glass, a canopy), the shaft (a band of
// glass on every floor, accent fins at the corners), a setback for the upper
// floors, and a top: a roof garden, a crown, a spire or a plain parapet
function towerInto(B, { w, d, floors, wall, accent, podium = true, top = 'garden', seed = 1, far = false }) {
  const R = rng(seed), wm = vcMat('vc_wall_vc'), gm = texVC(glassBandTex(), 'glassband');
  const FH = 3.3, PH = podium ? 9 : 0;
  let y = 0;
  const bands = (bw, bd, y0, nF, k) => {
    for (let f = 0; f < nF; f++) for (const [len, dd, ry] of [[bw, bd, 0], [bw, bd, Math.PI], [bd, bw, Math.PI / 2], [bd, bw, -Math.PI / 2]]) {
      const L = len - 1.0, g = new THREE.PlaneGeometry(L, 2.1);
      const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * L / 3);
      g.translate(0, y0 + f * FH + 1.6, dd / 2 + 0.04); g.rotateY(ry); colorize(g, k);
      B.add('glass', gm, g);
    }
  };
  if (podium) {
    B.box('wall', wm, w + 1.2, PH, d + 1.2, 0, PH / 2, 0, 0, shade2(wall, 0.92));
    // shop glass, tall, on all sides
    for (const [len, dd, ry] of [[w + 1.2, d + 1.2, 0], [w + 1.2, d + 1.2, Math.PI], [d + 1.2, w + 1.2, Math.PI / 2], [d + 1.2, w + 1.2, -Math.PI / 2]]) {
      for (const [y0, hh] of [[0.4, 3.6], [5.0, 3.0]]) {
        const L = len - 1.6, g = new THREE.PlaneGeometry(L, hh); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) { u.setX(i, u.getX(i) * L / 3); u.setY(i, u.getY(i) * hh / 2.1); }
        g.translate(0, y0 + hh / 2, dd / 2 + 0.05); g.rotateY(ry); colorize(g, '#e8f4ff'); B.add('glass', gm, g);
      }
    }
    // the canopy over the front
    B.box('acc', wm, w * 0.7, 0.3, 2.2, 0, 4.4, d / 2 + 0.6 + 1.1, 0, accent);
    B.box('acc', wm, w + 1.5, 0.5, d + 1.5, 0, PH, 0, 0, accent);
    y = PH;
  }
  const nLow = far ? floors : Math.max(3, Math.round(floors * (top === 'spire' ? 0.62 : 0.72)));
  const H1 = nLow * FH;
  B.box('wall', wm, w, H1, d, 0, y + H1 / 2, 0, 0, wall);
  bands(w, d, y, nLow, '#ffffff');
  // accent fins at the corners
  if (!far) for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('acc', wm, 0.6, H1, 0.6, sx * (w / 2), y + H1 / 2, sz * (d / 2), 0, accent);
  y += H1;
  if (!far && floors > nLow) {
    // the setback
    const w2 = w * (0.62 + R() * 0.16), d2 = d * (0.62 + R() * 0.16), n2 = floors - nLow, H2 = n2 * FH;
    B.box('acc', wm, w + 0.6, 0.6, d + 0.6, 0, y + 0.3, 0, 0, accent);
    B.box('wall', wm, w2, H2, d2, 0, y + H2 / 2, 0, 0, wall);
    bands(w2, d2, y, n2, '#ffffff');
    // a terrace garden on the setback (a green bed round the upper shaft)
    B.box('green', wm, w - 0.6, 0.5, d - 0.6, 0, y + 0.55, 0, 0, '#5aa04a');
    y += H2;
    var tw = w2, td = d2;
  } else { var tw = w, td = d; }
  // the top
  B.box('acc', wm, tw + 0.5, 0.9, td + 0.5, 0, y + 0.45, 0, 0, accent);
  if (top === 'garden' && !far) {
    B.box('green', wm, tw - 1.2, 0.4, td - 1.2, 0, y + 0.95, 0, 0, '#5aa04a');
    for (let k = 0; k < 4; k++) B.box('green', wm, 1.6 + R() * 2, 1.2 + R() * 1.5, 1.6 + R() * 2, (R() - 0.5) * (tw - 4), y + 1.6, (R() - 0.5) * (td - 4), 0, k % 2 ? '#4f9a46' : '#6aae52');
    B.box('wall', wm, 3, 2.6, 3, tw / 2 - 2.4, y + 2.1, -td / 2 + 2.4, 0, shade2(wall, 0.9));
  } else if (top === 'crown' && !far) {
    B.box('acc', wm, tw * 0.7, 3.5, td * 0.7, 0, y + 2.6, 0, 0, accent);
    B.box('wall', wm, tw * 0.5, 2, td * 0.5, 0, y + 5.3, 0, 0, wall);
  } else if (top === 'spire') {
    B.box('acc', wm, tw * 0.6, 4, td * 0.6, 0, y + 2.9, 0, 0, accent);
    const g = new THREE.CylinderGeometry(0.15, 0.7, 16, 8); g.translate(0, y + 12.9, 0); colorize(g, '#eef0f2'); B.add('wall', wm, g);
  } else {
    B.box('wall', wm, 2.4, 2.2, 2.4, (R() - 0.5) * (tw - 3), y + 2.0, (R() - 0.5) * (td - 3), 0, shade2(wall, 0.88));
  }
  return y;
}
const shade2 = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ---------- the slopes and the far city ----------
// downtown east and north-east (towers seen across the valley) and the
// terraces of houses up the bowl's sides: merged boxes, no ink
function slopes(G, fronts) {
  const R = rng(3420), taken = fronts.map((P) => ({ x: P.x, z: P.z, w: P.w, d: P.d, rot: P.rot || 0 }));
  const towers = new Batch(), houses = new Batch();
  const wm = vcMat('vc_wall_vc');
  const roofM = vcMat('vc_roof_vc');
  const winM = texVC(houseWinTex(), 'housewin');
  // downtown beyond the walkable streets: towers on a slightly turned grid,
  // thickest east of the avenue's end and round the Center's north-east,
  // with a few skyscrapers; lower toward the slopes
  const DT = { x: 215, z: -690 };
  for (let gx = 40; gx < 380; gx += 26) for (let gz = -556; gz > -990; gz -= 26) {
    const a = 0.18, ux = gx * Math.cos(a) - (gz + 700) * Math.sin(a), uz = gx * Math.sin(a) + (gz + 700) * Math.cos(a) - 700;
    const x = ux + (R() - 0.5) * 6, z = uz + (R() - 0.5) * 6;
    const e = VC.bowlE(x, z), core = Math.exp(-(((x - DT.x) / 120) ** 2 + ((z - DT.z) / 150) ** 2));
    if (e > 0.8 || z > -572 || R() > 0.25 + 0.75 * core) continue;
    const L = { x, z, w: 15 + R() * 10, d: 15 + R() * 10, rot: a + (R() < 0.2 ? Math.PI / 2 : 0) };
    if (!lotFree(L, taken, { maxE: 0.82, margin: 8 })) continue;
    taken.push(L);
    const sky = core > 0.55 && R() < 0.35;
    const floors = Math.round((sky ? 28 + R() * 16 : 6 + R() * 8 + 16 * core) * (1 - 0.5 * VC.smooth(0.62, 0.8, e)));
    const B = new Batch();
    towerInto(B, { w: L.w, d: L.d, floors, wall: TOWER_WALLS[Math.floor(R() * TOWER_WALLS.length)], accent: ACCENTS[Math.floor(R() * ACCENTS.length)], podium: false, top: sky ? (R() < 0.5 ? 'spire' : 'crown') : (R() < 0.6 ? 'garden' : 'crown'), seed: Math.round(gx * 31 - gz) });
    moveBatch(B, towers, L.x, lotY(L) - 0.5, L.z, L.rot);
  }
  // the terraces: rows of small houses round the bowl's sides
  for (let gx = -480; gx < 470; gx += 11) for (let gz = -520; gz > -1060; gz -= 11) {
    const x = gx + (R() - 0.5) * 4, z = gz + (R() - 0.5) * 4, e = VC.bowlE(x, z);
    if (e < 0.7 || e > 1.06) continue;
    if (R() > 0.55) continue;
    if (VC.walkF(x, z) < 22) continue;
    // not in the forest north of Route 2's gate, not on the pass, not by the lake's water
    if (z < -880 && Math.abs(x + 20) < 140) continue;
    if (z > -560 && Math.abs(x - 5) < 60) continue;
    const L = { x, z, w: 6 + R() * 3, d: 6 + R() * 2.5, rot: Math.atan2(BOWLX - x, BOWLZ - z) + (R() - 0.5) * 0.3 };
    if (!lotFree(L, taken, { minE: 0.55, maxE: 1.08, margin: 5 })) continue;
    if (!lotFree(L, [], { minE: 0.55, maxE: 1.08, margin: 5 })) continue;
    taken.push(L);
    houseInto(houses, L, R, wm, roofM, winM);
  }
  const T = new THREE.Group(); T.name = 'vc_downtown'; G.add(T); towers.flush(T, { shadow: false, outline: false, name: 'vc_far_tower' });
  const H = new THREE.Group(); H.name = 'vc_terraces'; G.add(H); houses.flush(H, { shadow: false, outline: false, name: 'vc_house' });
  for (const L of taken.slice(fronts.length)) OCC.push([L.x, L.z, L.w / 2, L.d / 2, L.rot]);
  SLOPE_LOTS.push(...taken.slice(fronts.length));
}
const SLOPE_LOTS = [];
const BOWLX = VC.BOWL.x, BOWLZ = VC.BOWL.z;
// copy a batch's geometry into another, moved to (x, y, z) turned ry
function moveBatch(src, dst, x, y, z, ry) {
  const m4 = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  for (const [key, { mat, geos }] of src.parts) for (const g of geos) { g.applyMatrix4(m4); dst.add(key, mat, g); }
  src.parts.clear();
}
// a small house: walls, a hip roof, a strip of windows each side, a garden wall
function houseInto(B, L, R, wm, roofM, winM) {
  const y = lotY(L) - 0.4, W = L.w, D = L.d, floors = R() < 0.3 ? 2 : 1 + (R() < 0.5 ? 1 : 0), H = floors * 2.8 + 0.4;
  const wallC = WALLS[Math.floor(R() * WALLS.length)], roofC = R() < 0.55 ? (R() < 0.5 ? '#3d6fa8' : '#2f6f9a') : (R() < 0.6 ? '#c4553a' : '#b8483a');
  const S = new Batch();
  S.box('wall', wm, W, H, D, 0, H / 2, 0, 0, wallC);
  // the roof: a hip (four slopes) with eaves
  {
    const o = 0.5, rise = 1.6 + R() * 0.8, hw = W / 2 + o, hd = D / 2 + o, rl = Math.max(0.3, (W - D) / 2);
    const p = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-rl, rise, 0], [rl, rise, 0]];
    const tri = [[0, 3, 4], [2, 1, 5], [3, 2, 5, 4], [1, 0, 4, 5]], pos = [];
    for (const f of tri) { const q = f.length === 3 ? [f] : [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]; for (const t of q) for (const k of t) pos.push(p[k][0], p[k][1] + H, p[k][2]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals(); colorize(g, roofC); S.add('roof', roofM, g);
  }
  // windows: a strip on each long side and the front, per floor
  for (let f = 0; f < floors; f++) for (const [len, dd, ry] of [[W, D, 0], [W, D, Math.PI], [D, W, Math.PI / 2]]) {
    const L2 = len - 1.4; if (L2 < 1) continue;
    const g = new THREE.PlaneGeometry(L2, 1.1); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * L2 / 2.4);
    g.translate(0, 0.4 + f * 2.8 + 1.5, dd / 2 + 0.03); g.rotateY(ry); colorize(g, '#ffffff'); S.add('win', winM, g);
  }
  // a low garden wall in front
  if (R() < 0.5) S.box('wall', wm, W + 2, 0.7, 0.3, 0, 0.35 + 0.4, D / 2 + 1.8, 0, '#d8d0bc');
  moveBatch(S, B, L.x, y, L.z, L.rot);
}

// ---------- the cutting: the slide, mostly cleared ----------
function cutting(G, world, col, use, place) {
  const R = rng(3430), C = new THREE.Group(); C.name = 'vc_roadworks'; G.add(C);
  const at = (z, off) => { let best = null; for (let i = 0; i + 1 < VC.CUT.pts.length; i++) { const a = VC.CUT.pts[i], b = VC.CUT.pts[i + 1]; if (z <= a[1] && z >= b[1]) { const t = (z - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); best = { x: x + (-dz / l) * off, z: z + (dx / l) * off, y: a[2] + (b[2] - a[2]) * t, ry: Math.atan2(dx, dz) }; } } return best; };
  // the slide: a heap of rubble along the west side of the deep stretch,
  // pushed back off the road; boulders on its foot
  const rocks = [];
  for (let z = -470; z > -503; z -= 1.3) for (let k = 0; k < 5; k++) {
    // a heap against the west wall: big blocks at its foot, smaller up the slope
    const p = at(z + (R() - 0.5), -(VC.CUT.hw - 0.3 + k * 1.0 + R() * 0.5));
    if (!p) continue;
    const s = (k === 0 ? 0.6 : 1.0 + R() * 1.3) * (1 - k * 0.08);
    rocks.push([p.x, p.z, s, R() * 6.28, height(p.x, p.z) - 0.2 + k * 0.55]);
  }
  {
    const geos = [0, 1, 2, 3].map((k) => boulderGeo(3430 + k));
    const B = new Batch(), m = matCache('vc_rock', () => O.flat('#a99f92'));
    rocks.forEach(([x, z, s, r, y], i) => { const g = geos[i % 4].clone(); g.scale(s, s * 0.8, s); g.rotateY(r); g.translate(x, y, z); colorize(g, ['#b4aa98', '#a09684', '#bdb3a0'][i % 3]); B.add('rock', m, g); });
    B.flush(C, { shadow: true, outline: undefined, name: 'vc_rubble' });
  }
  // traffic cones along the rubble, two barriers, a ROAD WORKS sign, the crew's hut
  const cone = () => { const g = new THREE.Group(); O.cyl(0.03, 0.2, 0.62, '#f07a2a', 0, 0.33, 0, g, 10); O.cyl(0.13, 0.155, 0.12, '#ffffff', 0, 0.3, 0, g, 10); O.box(0.42, 0.04, 0.42, '#2a2a2a', 0, 0.02, 0, g); return g; };
  for (let z = -470; z > -502; z -= 3.2) { const p = at(z, -(VC.CUT.hw - 1.4)); if (p) { place(cone(), p.x, p.z, R() * 6); col({ x: p.x, z: p.z, r: 0.25 }); } }
  const barrier = () => { const g = new THREE.Group(), t = O.words('vc_barrier', 256, 32, (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#ffffff' : '#e8402e'; x.beginPath(); x.moveTo(k * 32, 0); x.lineTo(k * 32 + 32, 0); x.lineTo(k * 32 + 16, h); x.lineTo(k * 32 - 16, h); x.fill(); } });
    O.put(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 0.06), O.texm(t)), g, 0, 0.95, 0); for (const sx of [-0.95, 0.95]) { O.box(0.06, 1.0, 0.06, '#e8e2d2', sx, 0.5, 0, g); O.box(0.5, 0.06, 0.5, '#e8e2d2', sx, 0.03, 0, g); } return g; };
  for (const z of [-468, -503]) { const p = at(z, -(VC.CUT.hw - 1.1)); if (p) { place(barrier(), p.x, p.z, p.ry + Math.PI / 2); col({ box: true, x: p.x, z: p.z, hw: 1.1, hd: 0.2, rot: p.ry + Math.PI / 2 }); } }
  {
    const p = at(-462, -(VC.CUT.hw + 4.2));
    const hut = O.shed({ W: 3.6, D: 2.6, wood: '#d8b23a', roof: '#6a7a8a' }); place(hut, p.x, p.z, p.ry + Math.PI / 2);
    col({ box: true, x: p.x, z: p.z, hw: 1.9, hd: 1.4, rot: p.ry + Math.PI / 2 });
    use(p.x + 2.6, p.z, 'Look', ['The road crew\'s hut. A clipboard on the door:', '"SLIDE AT KM 0.4: CLEARED TO ONE LANE. Rest of the rubble next week. Watch for falling stones!"'], 1.6);
  }
  {
    const p = at(-455, VC.CUT.hw - 0.8);
    const g = noticeBoard('ROAD WORKS', ['ROAD WORKS AHEAD', 'Slide cleared to one lane.', 'Walkers keep right.', '- VIRIDIAN CITY WORKS'], { style: 'pinned', frame: '#8a6a3a', roof: '#e8862e', accent: '#e8402e' });
    place(g, p.x, p.z, p.ry + Math.PI); col({ x: p.x, z: p.z, r: 0.5 });
    use(p.x - 0.8, p.z + 0.6, 'Read', ['ROAD WORKS AHEAD', 'The slide the earthquake brought down has been cleared to one lane. Walkers keep right.', '- VIRIDIAN CITY WORKS']);
  }
}
function boulderGeo(seed) {
  const g = new THREE.IcosahedronGeometry(0.6, 1), p = g.attributes.position, R = rng(seed);
  for (let i = 0; i < p.count; i++) { const k = 0.75 + R() * 0.4; p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i)) * k, p.getZ(i) * k); }
  g.computeVertexNormals(); return g.toNonIndexed();
}

// ---------- the gates: Route 2 north, Route 22 west (both shut, with a reason) ----------
function gates(G, world, col, use, place) {
  {
    const [x, , z] = STORY.route2Gate, y = height(x, z);
    const g = O.viridianGate({ name: 'ROUTE 2' }); place(g, x, z, Math.PI, y - 0.05);
    col({ box: true, x, z, hw: 3.2, hd: 0.3 }, ); col({ x: x - 3.8, z, r: 1 }); col({ x: x + 3.8, z, r: 1 });
    // walls off into the woods
    const W = new THREE.Group(); G.add(W);
    for (const s of [-1, 1]) { O.box(14, 2.2, 0.8, O.texm(O.stonesTex('#c4bca6')), x + s * 11.6, y + 0.9, z, W); col({ box: true, x: x + s * 11.6, z, hw: 7, hd: 0.45 }); }
    use(x, z + 1.8, 'Look', ['The gate to ROUTE 2 and VIRIDIAN FOREST is chained shut.', 'A notice: FOREST ROAD CLOSED. Trees brought down by the earthquake are being cleared. Thank you for your patience! - FOREST RANGERS'], 2.2);
  }
  {
    const [x, , z] = STORY.route22Gate, y = height(x, z), rot = Math.atan2(-1, -0.85) + Math.PI;
    const g = O.viridianGate({ name: 'ROUTE 22' }); place(g, x, z, rot, y - 0.05);
    const c = Math.cos(rot), s = Math.sin(rot);
    col({ box: true, x, z, hw: 3.2, hd: 0.3, rot }); col({ x: x - 3.8 * c, z: z + 3.8 * s, r: 1 }); col({ x: x + 3.8 * c, z: z - 3.8 * s, r: 1 });
    use(x + Math.sin(rot) * 1.8, z + Math.cos(rot) * 1.8, 'Look', ['ROUTE 22. POKéMON LEAGUE this way!', 'The gate is shut: CAUSEWAY CLOSED. The lake causeway is being checked after the earthquake. - VIRIDIAN CITY POLICE'], 2.2);
    const fp = fingerpost([['POKéMON LEAGUE', Math.PI / 2], ['ROUTE 22', Math.PI / 2 + 0.2], ['CITY CENTRE', -Math.PI / 2]]);
    const fx = x + Math.cos(rot) * 5.2 + Math.sin(rot) * 2.5, fz = z - Math.sin(rot) * 5.2 + Math.cos(rot) * 2.5;
    place(fp, fx, fz, rot); col({ x: fx, z: fz, r: 0.3 });
    use(fx + Math.sin(rot) * 1.0, fz + Math.cos(rot) * 1.0, 'Read', ['POKéMON LEAGUE → (ROUTE 22)', 'The closest city to the INDIGO PLATEAU is VIRIDIAN!']);
  }
}

// ---------- lamps, benches, signs (more) ----------
function signs(G, world, col, use, place, yawTo) {
  const board = (x, z, face, title, lines, readLines, style = {}) => {
    const g = noticeBoard(title, lines, { style: 'pinned', frame: '#7a5a3a', roof: '#3d6fa8', accent: '#3fa7a0', ...style });
    place(g, x, z, face); col({ x, z, r: 0.5 });
    use(x + Math.sin(face) * 1.1, z + Math.cos(face) * 1.1, 'Read', readLines);
  };
  // TRAINER TIPS, near the South Square (the original's second one)
  board(-4, -604, yawTo(-4, -604, 6, -596), 'TRAINER TIPS', ['Catch POKéMON and', 'expand your collection!', 'The more you have, the', 'easier it is to fight!'],
    ['TRAINER TIPS', 'Catch POKéMON and expand your collection! The more you have, the easier it is to fight!']);
  // TRAINER TIPS, the north one by Route 2's gate
  board(-31, -866, Math.PI / 2, 'TRAINER TIPS', ['The battle moves of', 'POKéMON are limited', 'by their POWER POINTS.', 'Rest at a POKéMON CENTER!'],
    ['TRAINER TIPS', 'The battle moves of POKéMON are limited by their POWER POINTS, PP. To replenish PP, rest your tired POKéMON at a POKéMON CENTER!']);
  // the city sign, where Lakeside Road meets Old Street
  board(-31, -620, Math.PI * 0.75, 'VIRIDIAN CITY', ['VIRIDIAN CITY', 'The Eternally Green', 'Paradise'], ['VIRIDIAN CITY', 'The Eternally Green Paradise'], { roof: '#3f7a5a' });
  // the GYM's sign, ominous
  board(64, -767, Math.PI / 4, 'VIRIDIAN GYM', ['VIRIDIAN CITY', 'POKéMON GYM', 'LEADER: ...', 'The leader is away.'],
    ['VIRIDIAN CITY POKéMON GYM', 'The leader is away.', '...The doors are locked. No one remembers when the GYM was last open.'], { roof: '#5a3a2a', accent: '#8a2a2a' });
  // the CENTER's sign beside its approach
  board(19.5, -641.5, Math.PI * 0.85, 'POKéMON CENTER', ['POKéMON CENTER', 'Heal your POKéMON!', 'Open day and night.'], ['POKéMON CENTER', 'Heal your POKéMON! Open day and night.'], { roof: '#d8403a', accent: '#d8403a' });
  // the MART's sign by its door
  { const [dx, dz] = PADS.mart.door; board(dx - 2.5, dz + 6.5, -Math.PI / 2, 'POKé MART', ['POKé MART', 'for all your', 'POKéMON needs!'], ['POKé MART', 'For all your POKéMON needs!'], { roof: '#2f6fc8', accent: '#2f6fc8' }); }
  // Officer Jenny's notice board by the police box
  { const [x, , z] = STORY.jennyBoard; board(x, z, Math.PI / 2, 'VIRIDIAN POLICE', ['NOTICES', 'Route 1 road works:', 'one lane open.', 'Lost something? Ask', 'at the police box.'],
      ['VIRIDIAN CITY POLICE: NOTICES', 'Route 1: the slide in the cutting is cleared to one lane. Walkers keep right.', 'Lost something? Ask at the police box. - Officer Jenny'], { roof: '#2a3f6a', accent: '#2a3f6a' }); }
}
function benches(G, world, col, place) {
  const bench = () => { const g = new THREE.Group(), w = O.texm(O.planks('#a87a4c'));
    for (let i = 0; i < 3; i++) O.box(1.8, 0.06, 0.13, w, 0, 0.48, -0.16 + i * 0.16, g);
    for (let i = 0; i < 2; i++) O.box(1.8, 0.13, 0.05, w, 0, 0.75 + i * 0.2, -0.28, g);
    for (const sx of [-0.8, 0.8]) { O.box(0.07, 0.48, 0.5, '#2f4a40', sx, 0.24, 0, g); O.box(0.07, 0.6, 0.07, '#2f4a40', sx, 0.8, -0.3, g); } return g; };
  // the travellers' benches on the Route 2 street (STORY.travellers), the plaza's ring, the promenade
  const spots = [...STORY.travellers.map(([x, z, r]) => [x, z, r])];
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.5; if (Math.abs(Math.sin(a)) > 0.92 || Math.abs(Math.cos(a)) > 0.92) continue; spots.push([10 + Math.cos(a) * 17.5, -624 + Math.sin(a) * 17.5, Math.atan2(-Math.cos(a), -Math.sin(a))]); }
  for (const [x, z, r] of [[-129, -700, -Math.PI / 2 + 0.2], [-123, -722, -Math.PI / 2], [-123, -750, -Math.PI / 2], [-129, -772, -Math.PI / 2 - 0.25]]) spots.push([x + 3.5, z, r + Math.PI]);
  for (const [x, z, r] of spots) { place(bench(), x, z, r); col({ box: true, x, z, hw: 0.95, hd: 0.35, rot: r }); }
}
function clockTower(G, col, use) {
  const [tx, , tz] = STORY.perches.clockTower;
  const g = O.clockTower({ h: 22, w: 4.6 }); g.position.set(tx, height(tx, tz) - 0.3, tz); G.add(g);
  col({ box: true, x: tx, z: tz, hw: 2.9, hd: 2.9 });
  use(tx - 3.6, tz, 'Look', ['The old clock tower. It has kept VIRIDIAN\'s time for a hundred years.', 'The earthquake stopped it for a day, they say. Now it runs two minutes fast.'], 1.6);
}
function plaza(G, col) {
  // the fountain in the middle of the plaza
  const [x, z] = [10, -624], y = height(x, z);
  const F = new THREE.Group(); F.position.set(x, y, z); G.add(F);
  O.cyl(5.2, 5.5, 0.7, O.texm(O.stonesTex('#d8cfb8')), 0, 0.35, 0, F, 40);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 0.1, 40), O.flat('#5fb6d0')); water.position.y = 0.62; water.userData.outline = false; F.add(water);
  O.cyl(1.1, 1.4, 1.6, '#d8cfb8', 0, 1.2, 0, F, 20);
  O.cyl(2.2, 1.8, 0.35, '#d8cfb8', 0, 2.1, 0, F, 24);
  O.cyl(0.4, 0.5, 1.2, '#d8cfb8', 0, 2.8, 0, F, 12);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 12), O.flat('#e8e4dc')); ball.position.y = 3.8; F.add(ball);
  col({ x, z, r: 5.4 });
}

// where the city's trees and bushes grow (veg.js sows them: cityPlants)
function plantsPlan(fronts) {
  const R = rng(3440), T = PLANTS.trees, Bu = PLANTS.bushes;
  const lots = [...fronts.map((P) => ({ x: P.x, z: P.z, w: P.w, d: P.d, rot: P.rot || 0 })), ...SLOPE_LOTS, ...RESERVED];
  const occ = (x, z, m) => lots.some((L) => inLot(L, x, z, m));
  const near = (x, z, r) => T.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < r * r);
  const tree = (k, x, z, s) => T.push({ k, x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s });
  const lakeD = (x, z) => Math.hypot(x - VC.LAKE.x, z - VC.LAKE.z) - VC.LAKE.r;
  // street trees in the pavements of the avenues, every ~12 m
  for (const S of VC.STREETS) {
    if (S.kind !== 'road') continue;
    for (let i = 0; i + 1 < S.pts.length; i++) {
      const [ax, az] = S.pts[i], [bx, bz] = S.pts[i + 1], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
      for (let d = 4; d < l; d += 12) for (const sd of [-1, 1]) {
        const x = ax + (bx - ax) * d / l + nx * (S.hw - 1.7) * sd, z = az + (bz - az) * d / l + nz * (S.hw - 1.7) * sd;
        if (ROUNDS_NEAR(x, z, 3) || near(x, z, 6)) continue;
        // (not where another street crosses: the pavement must be this street's)
        let other = false; for (const S2 of VC.STREETS) if (S2 !== S && VC.streetNear(S2.pts, x, z).d < S2.hw + 1.5) other = true;
        if (other) continue;
        tree(S.id === 'evergreen' ? 'linden' : 'tiered', x, z, 0.62 + R() * 0.12);
      }
    }
  }
  // gardens, parks and the slopes: wherever nothing is built and nobody walks
  for (let gx = -470; gx < 470; gx += 5.5) for (let gz = -470; gz > -1080; gz -= 5.5) {
    const x = gx + (R() - 0.5) * 4, z = gz + (R() - 0.5) * 4, e = VC.bowlE(x, z), ld = lakeD(x, z);
    if (e > 1.4 || ld < 3) continue;
    const forest = z < -888 && Math.abs(x + 20) < 160 && e < 1.15;
    const p = forest ? 0.55 : e > 1.15 ? 0.1 : e > 0.95 ? 0.32 : e > 0.6 ? 0.24 : ld < 30 ? 0.3 : 0.16;
    if (R() > p) continue;
    if (VC.walkF(x, z) < 2.2 || occ(x, z, 1.6)) continue;
    let pad = false; for (const P of Object.values(PADS)) if (VC.padDist(P, x, z) < 2) pad = true;
    if (pad || near(x, z, forest ? 4.5 : 6)) continue;
    if (VC.cutRock(x, z) || (z > -575 && z < -470 && Math.abs(x - 4) < 70 + (z + 470) * -0.6)) continue;   // (the view from the crest stays open)
    const k = forest ? ['scotspine', 'giant', 'beech', 'linden', 'scotspine', 'oak'][Math.floor(R() * 6)]
      : e > 0.97 ? ['scotspine', 'beech', 'giant', 'scotspine', 'linden', 'cypress'][Math.floor(R() * 6)]
      : e > 0.7 ? ['tiered', 'beech', 'cypress', 'linden', 'tiered', 'shade'][Math.floor(R() * 6)]
        : ['linden', 'tiered', 'shade', 'cypress', 'oak', 'linden'][Math.floor(R() * 6)];
    tree(k, x, z, (forest ? 0.85 : 0.7) + R() * 0.35);
  }
  // bushes in the front gardens and round the plaza
  for (let gx = -190; gx < 200; gx += 3) for (let gz = -545; gz > -900; gz -= 3) {
    const x = gx + (R() - 0.5) * 2, z = gz + (R() - 0.5) * 2;
    if (R() > 0.12) continue;
    const w = VC.walkF(x, z);
    if (w < 1.4 || w > 6 || occ(x, z, 0.8) || lakeD(x, z) < 4 || near(x, z, 2)) continue;
    Bu.push({ x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s: 0.7 + R() * 0.5 });
  }
}
const ROUNDS_NEAR = (x, z, m) => VC.ROUNDS.some((R) => Math.hypot(x - R.x, z - R.z) < R.r + m);
