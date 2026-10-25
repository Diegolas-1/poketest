// Pallet Town as the anime draws it: clapboard cottages with steep red-tiled
// roofs, white trim and picket fences spread over the valley, and Professor
// Oak's lab (lab.js) on its tall wooded hill, reached through a brick gate and
// up a long stone staircase lined with round bushes. Everything is cel shaded with painted textures
// and a thin ink outline. Returns the meshes plus colliders, walkable decks
// and things to read or use.
import * as THREE from 'three';
import { height, baseHeight, rng, LAB_HILL, STAIRS, STEP, PLAT_Y, PLAZA, BRIDGES, HOUSES, ROADS, STREAM, SEA_Y, toWorld, roadDist, coastZ, labHillU, isWater, inYard, streamAt, stairY, onPath, pathSD, onStairs, shoreSD, HARBOUR, ISLET, BOATHOUSE, ROUTE1, routeX, LEDGES, ledgeLineZ } from './terrain.js';
import { buildLab, LAB_DOOR } from './lab.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { addEdgeLines, inkSolid, partEdges, inkSkip } from './outline.js';
import { makeTree, makeBush, makeClump, makeRock, TILE } from './foliage.js';
import { STONE, boulderGeometry, blockGeometry, mergeAll, wallGeometry, wallMeshes, stoneMesh, mergeStones } from './stone.js';
const WALL_FADE = [300, 310];   // native: walls stay drawn this far (m)
import { welcomeSign, routeSign, nameplate, fingerpost, labPlate, noticeBoard } from './signs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- painted textures ----------
const texCache = new Map();
function paint(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, rng(key.length * 97 + w));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
// horizontal clapboards, 0.2 m each (texture = 2 x 2 m)
const siding = (col) => paint('siding' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let r = 0; r < 10; r++) {
    const y = r * 25.6;
    x.fillStyle = shade(col, 1.07); x.fillRect(0, y + 2, w, 6);
    x.fillStyle = shade(col, 0.8); x.fillRect(0, y + 22, w, 3.6);
    x.globalAlpha = 0.18; x.fillStyle = shade(col, 0.88);
    for (let k = 0; k < 6; k++) x.fillRect(R() * w, y + 8 + R() * 10, 20 + R() * 60, 1.5);
    x.globalAlpha = 1;
  }
});
// rounded clay tiles in rows (texture = 1.5 x 1.5 m)
const tiles = (col) => paint('tiles' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = shade(col, 0.72); x.fillRect(0, 0, w, h);
  const rows = 7, cols = 9, rh = h / rows, cw = w / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const cx = (c + (r % 2) * 0.5) * cw, y = r * rh;
    const g = x.createLinearGradient(cx, 0, cx + cw, 0);
    g.addColorStop(0, shade(col, 1.12)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, 0.82));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(cx + 1.5, y); x.lineTo(cx + cw - 1.5, y); x.lineTo(cx + cw - 1.5, y + rh * 0.7);
    x.quadraticCurveTo(cx + cw / 2, y + rh * 1.12, cx + 1.5, y + rh * 0.7); x.fill();
    x.fillStyle = shade(col, 0.62); x.fillRect(cx + 2, y + rh * 0.86, cw - 4, 2);
  }
});
const bricks = (col) => paint('bricks' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = '#d9cfbd'; x.fillRect(0, 0, w, h);
  const rows = 12, bw = 64, rh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
    x.fillStyle = shade(col, 0.88 + R() * 0.24);
    x.fillRect(c * bw + (r % 2) * bw / 2 + 2, r * rh + 2, bw - 4, rh - 4);
  }
});
const stones = (col) => paint('stones' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = shade(col, 0.6); x.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) {
    const cx = R() * w, cy = R() * h, rx = 18 + R() * 22, ry = 12 + R() * 14;
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      x.fillStyle = shade(col, 0.9 + R() * 0.25);
      x.beginPath(); x.ellipse(cx + ox, cy + oy, rx, ry, R(), 0, 6.28); x.fill();
    }
  }
});
const planks = (col) => paint('planks' + col, 256, 256, (x, w, h, R) => {
  for (let k = 0; k < 8; k++) {
    x.fillStyle = shade(col, 0.9 + R() * 0.18); x.fillRect(0, k * 32, w, 32);
    x.fillStyle = shade(col, 0.7); x.fillRect(0, k * 32 + 30, w, 2);
    x.globalAlpha = 0.25; x.fillStyle = shade(col, 0.75);
    for (let j = 0; j < 4; j++) x.fillRect(R() * w, k * 32 + 6 + R() * 20, 40 + R() * 80, 1.5);
    x.globalAlpha = 1;
  }
});
const plaster = (col) => paint('plaster' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) { x.globalAlpha = 0.06; x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.8); x.beginPath(); x.arc(R() * w, R() * h, 10 + R() * 30, 0, 6.28); x.fill(); }
  x.globalAlpha = 1;
});
// glass: sky blue with a white reflection streak
const glassTex = () => paint('glass', 128, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fd2f2'); g.addColorStop(1, '#4d8fc4');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.beginPath(); x.moveTo(w * 0.15, h); x.lineTo(w * 0.42, 0); x.lineTo(w * 0.56, 0); x.lineTo(w * 0.29, h); x.fill();
  x.beginPath(); x.moveTo(w * 0.62, h); x.lineTo(w * 0.8, 0); x.lineTo(w * 0.85, 0); x.lineTo(w * 0.67, h); x.fill();
});

// ---------- materials ----------
const mats = new Map();
function M(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
const BUILD = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
const FLAT = new Set();
const flat = (col) => M('c' + col, () => { const m = toon(col, { cel: BUILD }); FLAT.add(m); return m; });
// Plain coloured parts of a group share one material, their colours in the
// vertices (one draw for all of them once the group is merged)
function vcFlat(G) {
  const vm = M('vcflat', () => toon('#ffffff', { cel: BUILD, vertexColors: true }));
  G.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !FLAT.has(o.material)) return;
    for (let q = o; q && q !== G; q = q.parent) if (q.userData.keep) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), n = g.attributes.position.count, c = o.material.color, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    o.geometry = g; o.material = vm;
  });
}
const tex = (t, col = '#ffffff') => M(t.uuid + col, () => toon(col, { map: t, cel: BUILD }));
const glass = () => M('glass', () => new THREE.MeshBasicMaterial({ map: glassTex() }));

// UVs in metres, projected along the face's main axis
function wuv(g, s = 0.5) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getZ(i); v = p.getX(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Ink lines come from the screen-space outline pass (outline.js), which draws
// constant-width lines on every silhouette, crease and part edge. ink() is kept
// so callers still work; it only tags the mesh as a solid for that pass.
function ink(mesh, w) { void w; mesh.userData.outline = 'solid'; return mesh; }
function add(mesh, parent, x = 0, y = 0, z = 0, { shadow = true, line = true } = {}) {
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  if (line) ink(mesh);
  parent.add(mesh);
  return mesh;
}
// a box with metre UVs; mat may be a colour or a material
function box(w, h, d, m, x, y, z, parent, o) {
  const g = wuv(new THREE.BoxGeometry(w, h, d), (o && o.uvs) || 0.5);
  return add(new THREE.Mesh(g, typeof m === 'string' ? flat(m) : m), parent, x, y, z, o);
}
function cyl(rt, rb, h, m, x, y, z, parent, seg = 14, o) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  return add(new THREE.Mesh(g, typeof m === 'string' ? flat(m) : m), parent, x, y, z, o);
}
// a plant model from foliage.js placed as plain meshes
function plant(model, parent, x, y, z, s = 1, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = rot; g.userData.keep = true;
  for (const p of model.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  parent.add(g);
  return g;
}

// A stone foundation w (x) by d (z) centred at (cx, cz) in grp, its top at
// `top` (local y) and `deep` below that: a dark core, then fitted stones on
// all four sides down to the ground (stone.js wallGeometry), in grp's space.
function foundation(grp, w, d, top, cx, cz, deep, seed) {
  const core = box(w - 0.12, top + deep, d - 0.12, flat('#5c584f'), cx, (top - deep) / 2, cz, grp, { line: false });
  core.userData.outline = false;
  grp.updateMatrixWorld(true);
  const v = new THREE.Vector3(), gy = grp.getWorldPosition(new THREE.Vector3()).y;
  const ground = (x, z) => { v.set(x, 0, z); grp.localToWorld(v); return height(v.x, v.z) - gy; };
  const hx = w / 2 - 0.15, hz = d / 2 - 0.15, runs = [];
  // x sides run past the corners so their ends cover the corners
  for (const [a, b, ox, oz] of [[[cx - hx - 0.15, cz + hz], [cx + hx + 0.15, cz + hz], 0, 1], [[cx + hx + 0.15, cz - hz], [cx - hx - 0.15, cz - hz], 0, -1],
    [[cx + hx, cz + hz], [cx + hx, cz - hz], 1, 0], [[cx - hx, cz - hz], [cx - hx, cz + hz], -1, 0]]) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    const side = -dz * ox + dx * oz > 0 ? 1 : -1;
    runs.push({ a, b, t: 0.34, cap: false, top: () => top + 0.02, col: STONE.wall,
      faces: [{ side, bottom: (u) => ground(a[0] + dx * u + ox * 0.4, a[1] + dz * u + oz * 0.4) - 0.2 }] });
  }
  grp.add(...wallMeshes(runs, seed * 31 + 7, { fade: WALL_FADE, shadow: false }));
}

// ---------- building parts ----------
// A window: white frame, blue glass, mullions, a sill. Faces +z.
function windowAt(parent, x, y, z, w, h, cols, rows, frame = '#fbfaf4') {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  box(w + 0.24, h + 0.24, 0.1, frame, 0, 0, 0, g);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass()); gl.position.z = 0.06; g.add(gl);
  for (let c = 1; c < cols; c++) box(0.06, h, 0.06, frame, -w / 2 + (w * c) / cols, 0, 0.08, g, { line: false, shadow: false });
  for (let r = 1; r < rows; r++) box(w, 0.06, 0.06, frame, 0, -h / 2 + (h * r) / rows, 0.08, g, { line: false, shadow: false });
  box(w + 0.5, 0.1, 0.26, frame, 0, -h / 2 - 0.16, 0.1, g);
  return g;
}
// an arched window (lab): a rectangle with a round top, faces +z
function archWindow(parent, x, y, z, w, h, frame = '#fbfaf4') {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const r = w / 2, shape = (k) => {
    const s = new THREE.Shape(); const rw = r + k;
    s.moveTo(-rw, -h / 2 - k); s.lineTo(rw, -h / 2 - k); s.lineTo(rw, h / 2 - r); s.absarc(0, h / 2 - r, rw, 0, Math.PI, false); s.lineTo(-rw, -h / 2 - k);
    return s;
  };
  const outer = shape(0.16); outer.holes.push(new THREE.Path(shape(0).getPoints(24).reverse()));
  const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false, curveSegments: 20 }), flat(frame));
  fr.castShadow = true; g.add(fr);
  const gl = new THREE.Mesh(new THREE.ShapeGeometry(shape(0), 20), glass()); gl.position.z = 0.04; g.add(gl);
  // planar uv for the glass
  { const p = gl.geometry.attributes.position, uv = gl.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5); }
  box(0.06, h, 0.06, frame, 0, 0, 0.08, g, { line: false, shadow: false });
  box(w, 0.06, 0.06, frame, 0, h / 2 - r, 0.08, g, { line: false, shadow: false });
  box(w + 0.4, 0.1, 0.24, frame, 0, -h / 2 - 0.2, 0.1, g);
  return g;
}
// A gable roof over a w (x) by d (z) rectangle: ridge along z at top, eaves at
// y0. Returns the slabs. Overhang ox at the sides, oz at the ends.
function gableRoof(parent, w, d, y0, rise, roofMat, trim, ox = 0.45, oz = 0.5, th = 0.2) {
  const half = w / 2, ang = Math.atan2(rise, half), slope = Math.hypot(half, rise) + ox / Math.cos(ang);
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); parent.add(g);
    // centre of the slab: halfway down the slope from the ridge
    const mx = s * (slope / 2) * Math.cos(ang), my = y0 + rise - (slope / 2) * Math.sin(ang);
    g.position.set(mx, my + th / 2 / Math.cos(ang), 0); g.rotation.z = -s * ang;
    const geo = new THREE.BoxGeometry(slope, th, d + oz * 2);
    // tile rows run along the ridge: u along z, v down the slope
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) / 1.5, (p.getX(i) * s) / 1.5);
    add(new THREE.Mesh(geo, roofMat), g, 0, 0, 0);
    // white fascia boards along the front and back edges
    for (const e of [-1, 1]) box(slope + 0.05, th + 0.12, 0.12, trim, 0, -0.02, e * (d / 2 + oz), g);
    box(slope * 0.02 + 0.1, th + 0.1, d + oz * 2 + 0.12, trim, s * (slope / 2), -0.04, 0, g, { line: false });
  }
  // ridge cap
  box(0.32, 0.22, d + oz * 2 + 0.1, roofMat, 0, y0 + rise + th * 0.9, 0, parent);
}
// the triangle of wall under a gable, facing +z at z, w wide, rise tall
function gableWall(parent, w, rise, y0, z, m, flip = 1) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rise); s.lineTo(-w / 2, 0);
  const g = wuv(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }), 0.5);
  const mesh = new THREE.Mesh(g, m); mesh.position.set(0, y0, z - 0.1); if (flip < 0) mesh.rotation.y = Math.PI;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ---------- placing things in a house's own frame ----------
// Each cottage is built in its own frame (front door toward +z) and turned
// by hs.rot; colliders and walk decks are written in world space, as
// oriented boxes.
function placer(hs, world) {
  const G = new THREE.Group(); G.position.set(hs.x, hs.y, hs.z); G.rotation.y = hs.rot; world.group.add(G);
  const W = (lx, lz) => toWorld(hs, lx, lz);
  return {
    G, W,
    hy: (lx, lz) => { const [x, z] = W(lx, lz); return height(x, z) - hs.y; },
    col: (lx, lz, hw, hd, rot = 0) => { const [x, z] = W(lx, lz); world.colliders.push({ box: true, x, z, hw, hd, rot: hs.rot + rot }); },
    circ: (lx, lz, r) => { const [x, z] = W(lx, lz); world.colliders.push({ x, z, r }); },
    use: (lx, lz, r, label, lines) => { const [x, z] = W(lx, lz); world.use.push({ x, z, r, label, lines }); },
    walk: (lx, lz, hw, hd, y) => { const [x, z] = W(lx, lz); world.walk.push({ x, z, hw, hd, rot: hs.rot, y }); },
  };
}

// White picket fence from a to b (local x, z of the placer), with two rails.
function picketFence(P, ax, az, bx, bz, col = '#fbfaf4') {
  const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) return;
  // a gap where a path crosses: only the runs that keep off the dirt are built
  if (!P.split) {
    const n0 = Math.max(1, Math.ceil(len / 0.1)), runs = [];
    let a = -1;
    for (let i = 0; i <= n0; i++) {
      const t = i / n0, [wx, wz] = P.W(ax + (bx - ax) * t, az + (bz - az) * t), ok = !onPath(wx, wz, 0.12);
      if (ok && a < 0) a = t;
      if ((!ok || i === n0) && a >= 0) { runs.push([a, ok ? t : (i - 1) / n0]); a = -1; }
    }
    if (!(runs.length === 1 && runs[0][0] === 0 && runs[0][1] === 1)) {
      P.split = true;
      for (const [t0, t1] of runs) picketFence(P, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, col);
      P.split = false;
      return;
    }
  }
  const n = Math.max(2, Math.round(len / 0.32));
  const ang = Math.atan2(bz - az, bx - ax);
  const pick = new THREE.Shape(); pick.moveTo(-0.06, 0); pick.lineTo(0.06, 0); pick.lineTo(0.06, 0.95); pick.lineTo(0, 1.08); pick.lineTo(-0.06, 0.95); pick.lineTo(-0.06, 0);
  const pg = new THREE.ExtrudeGeometry(pick, { depth: 0.04, bevelEnabled: false });
  const im = new THREE.InstancedMesh(pg, flat(col), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    m4.compose(V(x, P.hy(x, z) - 0.05, z), q, V(1, 1, 1)); im.setMatrixAt(i, m4);
  }
  im.castShadow = true; im.receiveShadow = true; P.G.add(im);
  const mid = P.hy((ax + bx) / 2, (az + bz) / 2);
  for (const ry of [0.32, 0.72]) {
    const r = box(len, 0.08, 0.05, col, (ax + bx) / 2, mid + ry, (az + bz) / 2, P.G, { line: false });
    r.rotation.y = -ang; r.translateZ(-0.05);
  }
  P.col((ax + bx) / 2, (az + bz) / 2, len / 2 + 0.05, 0.1, -ang);
}

// A hip roof over w x d at eaves height y0: four sloping faces, tiled.
function hipRoof(parent, w, d, y0, rise, roofMat, trim, o = 0.5) {
  const hw = w / 2 + o, hd = d / 2 + o;
  const along = d >= w, rl = Math.max(0, (along ? hd - hw : hw - hd));
  const top = y0 + rise;
  const e = [[-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd]];
  const r0 = along ? [0, top, -rl] : [-rl, top, 0], r1 = along ? [0, top, rl] : [rl, top, 0];
  const tris = along
    ? [[e[3], e[2], r1], [e[1], e[0], r0], [e[2], e[1], r0], [e[2], r0, r1], [e[0], e[3], r1], [e[0], r1, r0]]
    : [[e[0], e[3], r0], [e[2], e[1], r1], [e[3], e[2], r1], [e[3], r1, r0], [e[1], e[0], r0], [e[1], r0, r1]];
  const p = [], uv = [];
  for (const t of tris) {
    // keep each face pointing out and up
    const a = V(...t[0]), b = V(...t[1]), c = V(...t[2]);
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    const tri = nrm.y < 0 ? [t[0], t[2], t[1]] : t;
    // tile rows run level: u along the eave, v up the slope
    const fn = nrm.y < 0 ? nrm.negate() : nrm; fn.y = 0; fn.normalize();
    for (const v of tri) { p.push(...v); uv.push((v[0] * fn.z - v[2] * fn.x) / 1.5, (-(v[0] * fn.x + v[2] * fn.z) + v[1] * 0.6) / 1.5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, roofMat); m.castShadow = true; m.receiveShadow = true; parent.add(m);
  // a thick white fascia round the eaves
  for (const s of [-1, 1]) {
    box(2 * hw + 0.1, 0.24, 0.14, trim, 0, y0 - 0.05, s * hd, parent, { line: false });
    box(0.14, 0.24, 2 * hd + 0.1, trim, s * hw, y0 - 0.05, 0, parent, { line: false });
  }
  box(0.2, 0.2, 2 * rl + 0.3, roofMat, 0, top + 0.06, 0, parent, { line: false }).rotation.y = along ? 0 : Math.PI / 2;
}

// ---------- the cottages ----------
// The anime's cottages: clapboards, a steep tiled gable facing the lane (or a
// hip roof), a porch, a railed front deck, a flower box, dormers, a chimney,
// a picket fence round the yard (or none), a vegetable garden, a mailbox with
// the family name, sometimes a side wing or a washing line. Faces +z.
const STYLE = {
  red: { wall: '#a9cbe8', roof: '#d8473a', door: '#f4f1e6', name: 'RED', seed: 10,
    lines: ['RED\'s house. Home sweet home!', 'MOM is out shopping. You can come back in later.'] },
  blue: { wall: '#f2e2b8', roof: '#3f8f78', door: '#8a5a3a', name: 'BLUE', seed: 20, wing: true,
    lines: ['BLUE\'s house.', 'Nobody answers. BLUE is probably at the lab already.'] },
  hollis: { wall: '#f6ecd0', roof: '#c4553a', door: '#5a7a4a', name: 'HOLLIS', seed: 31, hip: true, W: 7.8, laundry: true,
    lines: ['The HOLLIS family\'s house.', 'Something smells good... they must be baking bread.'] },
  mae: { wall: '#f4cfd2', roof: '#d24a3c', door: '#ffffff', name: 'GRANNY MAE', seed: 42, fence: false, W: 6.6,
    lines: ['GRANNY MAE\'s cottage.', 'A sign on the door says: "Gone to feed the PIDGEY. Back soon!"'] },
  marina: { wall: '#f8f6ef', roof: '#3d6fa8', door: '#3d6fa8', name: 'MARINA', seed: 53, fence: false, laundry: true,
    lines: ['MARINA\'s seaside house.', 'Fishing nets hang drying by the door.'] },
  farmer: { wall: '#d4e6c2', roof: '#a8553a', door: '#7a5232', name: 'FARMER BEN', seed: 64, wing: true, W: 8.0, garden: true,
    lines: ['FARMER BEN\'s farmhouse.', 'Muddy boots by the door. Ben must be out in the fields.'] },
  oldman: { wall: '#efe3c6', roof: '#4f7f4a', door: '#8a5a3a', name: 'OLD TOM', seed: 75, hip: true, fence: false,
    lines: ['OLD TOM\'s house on the hill.', 'He says on a clear day you can see CINNABAR from his porch.'] },
  lily: { wall: '#fdfbf6', roof: '#c9563f', door: '#e88a3e', name: 'LILY', seed: 86, W: 6.8,
    lines: ['LILY\'s house.', 'The garden is full of flowers. LILY loves BUTTERFREE.'] },
};
function cottage(hs, world) {
  const st = STYLE[hs.id];
  const { wall, roof, door, name, seed, lines } = st;
  const side = hs.side, P = placer(hs, world), G = P.G;
  const R = rng(seed);
  const W = st.W || 7.2, D = 6.4, base = 0.45, wallH = 3.5, rise = st.hip ? 3.0 : 4.6, y0 = base + wallH;
  const fence = st.fence !== false;
  const sid = tex(siding(wall)), trim = '#fbfaf4';
  const roofMat = tex(tiles(roof));
  // stone foundation and the walls
  foundation(G, W + 0.3, D + 0.3, base, 0, 0, 1.3, seed);
  box(W, wallH, D, sid, 0, base + wallH / 2, 0, G);
  if (st.hip) hipRoof(G, W, D, y0, rise, roofMat, trim);
  else {
    gableWall(G, W, rise, y0, D / 2, sid);
    gableWall(G, W, rise, y0, -D / 2, sid, -1);
    gableRoof(G, W, D, y0, rise, roofMat, trim);
  }
  // corner boards and the frieze under the eaves
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.22, wallH, 0.22, trim, sx * W / 2, base + wallH / 2, sz * D / 2, G, { line: false });
  for (const sx of [-1, 1]) box(0.14, 0.24, D + 0.1, trim, sx * (W / 2 + 0.04), y0 - 0.1, 0, G, { line: false });
  box(W + 0.1, 0.24, 0.14, trim, 0, y0 - 0.06, D / 2 + 0.06, G, { line: false });
  // front: a big window, the gable window, the porch over the door
  const front = D / 2 + 0.06;
  windowAt(G, side * 1.7, base + 1.75, front, 2.3, 1.7, 4, 3);
  if (!st.hip) windowAt(G, 0, y0 + 1.5, front, 1.0, 1.2, 2, 2);
  const dx = -side * 1.75;
  box(1.5, 2.3, 0.14, tex(planks(door)), dx, base + 1.15, front, G);
  for (const k of [-0.36, 0.36]) box(0.5, 0.8, 0.04, door, dx + k, base + 1.6, front + 0.08, G, { line: false, shadow: false });
  box(0.06, 2.3, 0.04, shade(door, 0.6), dx, base + 1.15, front + 0.09, G, { line: false, shadow: false });
  box(1.8, 0.16, 0.16, trim, dx, base + 2.4, front + 0.02, G, { line: false });
  // porch: two posts and a small gable roof
  const pg = new THREE.Group(); pg.position.set(dx, 0, front + 0.85); G.add(pg);
  for (const k of [-1.05, 1.05]) box(0.16, 2.5, 0.16, trim, k, base + 1.25, 0.65, pg);
  gableRoof(pg, 2.3, 1.7, base + 2.6, 0.9, roofMat, trim, 0.15, 0.1, 0.12);
  gableWall(pg, 2.3, 0.9, base + 2.6, 0.85, flat(trim));
  // wall lamp beside the door
  const lampB = box(0.18, 0.28, 0.18, '#3a3d46', dx - side * 1.0, base + 2.0, front + 0.14, G);
  lampB.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: '#ffe7a6' })));
  // flower box under the big window
  box(2.4, 0.3, 0.36, tex(planks('#c99a62')), side * 1.7, base + 0.62, front + 0.22, G);
  for (let k = 0; k < 5; k++) plant(makeClump(seed + k, k % 2 ? TILE.flowersR : TILE.flowersY, 0.6), G, side * 1.7 - 1.0 + k * 0.5, base + 0.75, front + 0.24, 1);
  // side windows; dormers in the slope over the garden side
  for (const sx of [-1, 1]) for (const zz of [-1.4, 1.4]) {
    if (st.wing && sx === -side) continue;
    const w = windowAt(G, sx * (W / 2 + 0.06), base + 1.9, zz, 1.0, 1.3, 2, 2);
    w.rotation.y = sx * Math.PI / 2;
  }
  if (!st.hip) {
    const ang = Math.atan2(rise, W / 2);
    for (const zz of [-1.3, 1.3]) {
      const dg = new THREE.Group(); G.add(dg);
      const hx = side * 2.0, hy = y0 + (W / 2 - 2.0) * Math.tan(ang) - 0.6;
      dg.position.set(hx, hy, zz); dg.rotation.y = side * Math.PI / 2;
      box(1.4, 1.5, 1.6, sid, 0, 0.75, -0.6, dg);
      windowAt(dg, 0, 0.8, 0.22, 0.7, 0.8, 2, 2);
      const rg = new THREE.Group(); rg.position.set(0, 0, -0.6); dg.add(rg);
      gableRoof(rg, 1.4, 1.6, 1.5, 0.75, roofMat, trim, 0.12, 0.12, 0.1);
      gableWall(rg, 1.4, 0.75, 1.5, 0.8, sid);
    }
  }
  // a side wing with its own gable, on the side away from the garden
  if (st.wing) {
    const wg = new THREE.Group(); wg.position.set(-side * (W / 2 + 1.7), 0, -0.6); wg.rotation.y = Math.PI / 2; G.add(wg);
    const ww = 4.6, wd = 3.6, wh = 2.9;
    foundation(wg, ww + 0.3, wd + 0.3, base + 0.01, 0, 0, 1.3, seed + 5);   // 1 cm over the house's foundation where they overlap
    box(ww, wh, wd, sid, 0, base + wh / 2, 0, wg);
    gableRoof(wg, ww, wd, base + wh, 2.2, roofMat, trim, 0.35, 0.3);
    gableWall(wg, ww, 2.2, base + wh, -side * wd / 2, sid, -side);
    const wn = windowAt(wg, 0, base + 1.6, -side * (wd / 2 + 0.05), 1.3, 1.2, 2, 2); if (side > 0) wn.rotation.y = Math.PI;
    for (const k of [-1, 1]) { const w2 = windowAt(wg, k * (ww / 2 + 0.05), base + 1.6, 0, 1.0, 1.1, 2, 2); w2.rotation.y = k * Math.PI / 2; }
    P.col(-side * (W / 2 + 1.7), -0.6, wd / 2 + 0.2, ww / 2 + 0.2);
  }
  // chimney at the back
  box(0.8, 3.2, 0.8, tex(bricks('#b7604a')), -side * 1.6, y0 + (st.hip ? 1.8 : 2.4), -1.8, G);
  box(1.0, 0.18, 1.0, '#d9cfbd', -side * 1.6, y0 + (st.hip ? 3.45 : 4.05), -1.8, G);
  // front deck with a white railing and steps to the path
  const deckY = base + 0.05, dz0 = D / 2 + 0.05, dz1 = D / 2 + 2.3;
  box(W + 0.6, 0.2, dz1 - dz0, tex(planks('#c99a62')), 0, deckY, (dz0 + dz1) / 2, G);
  box(W + 0.62, deckY + 1, 0.2, trim, 0, deckY / 2 - 0.55, dz1 - 0.085, G, { line: false });   // skirt 1.5 cm proud of the deck's edge (flush, they fought)
  const rail = (ax, bx, zz) => {
    const n = Math.max(2, Math.round(Math.abs(bx - ax) / 0.22));
    for (let i = 0; i <= n; i++) box(0.07, 0.8, 0.07, trim, ax + (bx - ax) * i / n, deckY + 0.5, zz, G, { line: false, shadow: false });
    box(Math.abs(bx - ax) + 0.12, 0.1, 0.12, trim, (ax + bx) / 2, deckY + 0.92, zz, G);
  };
  rail(-W / 2 - 0.25, dx - 0.95, dz1 - 0.1); rail(dx + 0.95, W / 2 + 0.25, dz1 - 0.1);
  for (let s = 0; s < 2; s++) box(1.8, 0.2, 0.5, tex(stones('#d6cfbd')), dx, deckY - 0.18 - s * 0.2, dz1 + 0.25 + s * 0.45, G);
  P.walk(0, (dz0 + dz1) / 2, W / 2 + 0.3, (dz1 - dz0) / 2, hs.y + deckY + 0.1);
  P.col(0, -0.05, W / 2 + 0.2, D / 2 + 0.2);
  { const a = -W / 2 - 0.25, b = dx - 0.95; P.col((a + b) / 2, dz1 - 0.1, Math.max(0.05, (b - a) / 2), 0.12); }
  { const a = dx + 0.95, b = W / 2 + 0.25; P.col((a + b) / 2, dz1 - 0.1, Math.max(0.05, (b - a) / 2), 0.12); }
  P.use(dx, D / 2 + 1.1, 1.0, 'Door', lines);
  // the yard: picket fence round it, a gate on the path, stepping stones
  const fx = 8.4, fz0 = -5.2, fz1 = 8.6;
  // the gate opens as wide as the path that comes in through it
  const gClear = (u) => { const [wx, wz] = P.W(u, fz1); return !onPath(wx, wz, 0.16); };
  let gl = dx - 0.95, gr = dx + 0.95;
  while (gl > -fx + 0.5 && !gClear(gl)) gl -= 0.05;
  while (gr < fx - 0.5 && !gClear(gr)) gr += 0.05;
  if (fence) {
    picketFence(P, -fx, fz1, gl + 0.05, fz1);
    picketFence(P, gr - 0.05, fz1, fx, fz1);
    picketFence(P, -fx, fz0, -fx, fz1);
    picketFence(P, fx, fz0, fx, fz1);
    picketFence(P, -fx, fz0, fx, fz0);
    for (const gx of [gl, gr]) box(0.22, 1.25, 0.22, trim, gx, P.hy(gx, fz1) + 0.6, fz1, G);
  }
  for (let s = 0; s < 5; s++) {
    const sz = dz1 + 0.95 + s * 0.85, sx = dx + Math.sin(s * 1.7) * 0.18;
    const stn = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.12, 10), flat('#d8d0bf'));
    stn.scale.set(1, 1, 0.8); stn.rotation.y = R() * 3;
    add(stn, G, sx, P.hy(sx, sz) + 0.02, sz, { shadow: false });
  }
  // mailbox by the gate, with the family name on a little board
  // (along the fence, clear of the path)
  let mx = side > 0 ? Math.max(dx + 1.6, gr + 0.6) : Math.min(dx - 1.6, gl - 0.6);
  const mz = fz1 + 0.4;
  for (let k = 0; k < 40 && onPath(...P.W(mx, mz), 0.4); k++) mx += side * 0.2;
  const mb = new THREE.Group(); mb.position.set(mx, P.hy(mx, mz), mz); G.add(mb);
  box(0.1, 1.1, 0.1, '#fbfaf4', 0, 0.55, 0, mb);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14, 1, false, 0, Math.PI), flat('#ec8a2e'));
  body.rotation.z = Math.PI / 2; add(body, mb, 0, 1.15, 0);
  box(0.44, 0.24, 0.6, '#ec8a2e', 0, 1.03, 0, mb);
  box(0.04, 0.2, 0.06, '#d83a2e', 0.24, 1.3, 0.1, mb, { line: false });
  const nb = nameplate(name); nb.position.set(0, 0.62, 0.056); mb.add(nb);   // signs.js; its back 6 mm off the post
  P.circ(mx, mz, 0.25);
  P.use(mx, mz + 0.9, 0.8, 'Look', [`${name}'s mailbox. It's empty.`]);
  // vegetable garden on the side: a little bed of tomato plants
  const gx = side * 6.2, gz = 1.0;
  box(2.6, 0.25, 4.6, tex(planks('#8d6a46')), gx, P.hy(gx, gz) + 0.05, gz, G, { line: false });
  add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 4.4), flat('#7a5a3c')), G, gx, P.hy(gx, gz) + 0.18, gz, { line: false });
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const px = gx - 0.6 + r * 1.2, pz = gz - 1.6 + k * 1.05, py = P.hy(px, pz) + 0.2;
    box(0.05, 1.2, 0.05, '#c9a876', px, py + 0.6, pz, G, { line: false });
    plant(makeBush(seed * 10 + r * 4 + k, { size: 0.5 }), G, px, py, pz, 1, R() * 6);
    for (let t = 0; t < 3; t++) add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flat('#e8402e')), G, px + (R() - 0.5) * 0.5, py + 0.4 + R() * 0.5, pz + (R() - 0.5) * 0.5, { line: false });
  }
  P.col(gx, gz, 1.3, 2.3);
  // a washing line across the back of the yard, the washing swaying
  if (st.laundry) {
    const lx0 = -side * 1.5, lx1 = -side * 7.0, lz = -3.9;
    for (const lx of [lx0, lx1]) { box(0.1, 2.0, 0.1, '#e8e2d2', lx, P.hy(lx, lz) + 1.0, lz, G); box(0.7, 0.08, 0.08, '#e8e2d2', lx, P.hy(lx, lz) + 1.95, lz, G, { line: false }); P.circ(lx, lz, 0.15); }
    const ly = (P.hy(lx0, lz) + P.hy(lx1, lz)) / 2 + 1.9;
    const line = box(Math.abs(lx1 - lx0), 0.02, 0.02, '#f4f1e6', (lx0 + lx1) / 2, ly, lz, G, { line: false, shadow: false });
    void line;
    const cols = ['#ffffff', '#e86a5a', '#7ab8e8', '#f6d65a', '#9ad06a'];
    const cloths = [];
    for (let k = 0; k < 5; k++) {
      const cw = 0.55 + R() * 0.35, ch = 0.6 + R() * 0.5;
      const pivot = new THREE.Group(); pivot.userData.keep = true; pivot.position.set(lx0 + (lx1 - lx0) * (0.12 + k * 0.19), ly, lz); G.add(pivot);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), toon(cols[k % 5], { cel: BUILD }));
      m.material.side = THREE.DoubleSide; m.position.y = -ch / 2; m.castShadow = true; pivot.add(m);
      cloths.push(pivot);
    }
    world.anim.push((dt, t) => { cloths.forEach((c, i) => { c.rotation.x = Math.sin(t * 1.7 + i * 0.9) * 0.18 + 0.12; }); });
  }
  // shrubs: round trimmed bushes along the deck, a cone topiary, cypresses
  for (const [px, pz, s] of [[-W / 2 - 1.0, dz1 - 0.3, 1.0], [W / 2 + 1.0, dz1 - 0.3, 1.0], [side * (W / 2 + 0.9), -3.0, 1.1]]) {
    plant(makeBush(seed + 50 + px, { size: s }), G, px, P.hy(px, pz), pz);
    P.circ(px, pz, 0.8 * s);
  }
  const trees = [[-side * 6.6, 6.8, 'bushy', 0.85], [side * 7.0, -4.3, 'cypress', 0.7]];
  if (!st.laundry && !st.wing) trees.push([-side * 6.8, -3.8, 'lombardy', 0.5]);
  for (const [px, pz, k, s] of trees) {
    const m = makeTree(k, seed + Math.round(px * 3 + pz));
    plant(m, G, px, P.hy(px, pz), pz, s);
    P.circ(px, pz, Math.max(0.4, m.trunk * s + 0.15));
  }
  world.solid.push(G);
  return G;
}

// ---------- the lab hill ----------
// A long straight flight of stone stairs up the front of the hill, a landing
// half way, stone cheek walls, and round trimmed bushes lining both sides.
function labStairs(world) {
  const S = STAIRS, stone = flat('#dcd5c6');
  const treads = [];
  // every tread: x range and top height
  for (let x = S.x0; x < S.x1 + 0.01; ) {
    const y = stairY(x + 0.01);
    let x2 = x + S.run;
    if (Math.abs(y - (PLAZA.y + S.n1 * STEP)) < 0.01 && x >= S.x0 + S.n1 * S.run - 0.01) x2 = S.x0 + S.n1 * S.run + S.landing;
    // the flight's last tread and the landing are one level: one slab, so no
    // two coplanar tops (and no stray nose) fight in the middle of the landing
    const last = treads[treads.length - 1];
    if (last && Math.abs(last[2] - y) < 0.001) last[1] = Math.min(x2, S.x1 + 1.0);
    else treads.push([x, Math.min(x2, S.x1 + 1.0), y]);
    x = x2;
  }
  const g = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(g, stone, treads.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  treads.forEach(([a, b, y], i) => {
    m4.compose(V((a + b) / 2, y - 1.4, S.z), q, V(b - a + 0.02, 2.8, S.hw * 2 + 0.1)); im.setMatrixAt(i, m4);
  });
  // stone cheek walls, their coping sloped along the line of the noses (flat
  // on the landing), 0.4 m over it
  const nosePts = [];
  for (const [a, b, y] of treads) { nosePts.push([a, y]); if (b - a > S.run * 1.5 && b < S.x1) nosePts.push([b - S.run, y]); }
  { const [, b, y] = treads[treads.length - 1]; nosePts.push([b, y]); }
  const noseY = (x) => {
    if (x <= nosePts[0][0]) return nosePts[0][1];
    for (let i = 1; i < nosePts.length; i++) if (x <= nosePts[i][0]) { const [x0, y0] = nosePts[i - 1], [x1, y1] = nosePts[i]; return y0 + (y1 - y0) * (x - x0) / Math.max(1e-6, x1 - x0); }
    return nosePts[nosePts.length - 1][1];
  };
  const cx0 = S.x0, cx1 = treads[treads.length - 1][1];
  const cheeks = [-1, 1].map((s) => {
    const zc = S.z + s * (S.hw + 0.3);
    return { a: [cx0, zc], b: [cx1, zc], t: 0.55, col: '#c4bdac', top: (u) => noseY(cx0 + u) + 0.4,
      faces: [{ side: s, bottom: (u) => height(cx0 + u, zc + s * 0.5) - 0.25 }, { side: -s, bottom: (u) => stairY(Math.min(cx0 + u + 0.01, S.x1)) - 0.06 }] };
  });
  for (const c of cheeks) world.group.add(...wallMeshes([c], 4300 + c.a[1] * 10, { fade: WALL_FADE }));
  // each tread's worn front edge in a darker stone, so the steps read
  const nose = new THREE.InstancedMesh(g, flat('#a99f8e'), treads.length);
  treads.forEach(([a, b, y], i) => {
    // its front stands 1.5 cm proud of the riser (flush, the two faces fought)
    m4.compose(V(a + 0.035, y - 0.06, S.z), q, V(0.12, 0.14, S.hw * 2 + 0.06)); nose.setMatrixAt(i, m4);
    im.setColorAt(i, new THREE.Color('#ffffff').multiplyScalar(0.92 + ((i * 7919) % 9) / 9 * 0.1));
  });
  for (const o of [im, nose]) { o.castShadow = true; o.receiveShadow = true; world.group.add(o); }
  // white globe lamps on the cheek walls at the landing and the top
  const xl = S.x0 + S.n1 * S.run;
  for (const [x, y] of [[xl + 0.3, PLAZA.y + S.n1 * STEP + 0.4], [xl + S.landing - 0.3, PLAZA.y + S.n1 * STEP + 0.4], [S.x1 + 0.4, PLAT_Y + 0.4]]) for (const s of [-1, 1]) globeLamp(world, x, y, S.z + s * (S.hw + 0.3), 0.9);
  world.solid.push(im);
  // rows of round trimmed bushes down both sides
  const R = rng(77), list = [];
  for (let x = S.x0 + 0.6; x < S.x1 - 0.2; x += 1.25 + R() * 0.25) for (const s of [-1, 1]) {
    const z = S.z + s * (S.hw + 1.35 + R() * 0.15);
    list.push([x, z, R() * 6, 0.85 + R() * 0.2]);
    if (R() < 0.6) { const z2 = S.z + s * (S.hw + 2.8 + R() * 0.6); list.push([x + 0.6, z2, R() * 6, 1.0 + R() * 0.3]); }
  }
  instBushes(world, list, [makeBush(921, { size: 1.15 }), makeBush(922, { size: 1.25 }), makeBush(923, { size: 1.1, flowers: TILE.flowersR })], false);
}
function globeLamp(world, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); world.group.add(g);
  cyl(0.12, 0.16, 0.25, '#2c2d33', 0, 0.12, 0, g, 10);
  cyl(0.05, 0.05, 0.25, '#2c2d33', 0, 0.35, 0, g, 6, { line: false });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), new THREE.MeshBasicMaterial({ color: '#fffbea' }));
  globe.position.y = 0.72; g.add(globe);
  return g;
}
// many copies of a few bush shapes, instanced; [x, z, rot, scale]
function instBushes(world, list, models, collide = true, sink = 0.12) {
  const by = models.map(() => []);
  list.forEach((p, i) => by[i % models.length].push(p));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  models.forEach((mod, k) => {
    const l = by[k]; if (!l.length) return;
    for (const p of mod.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, l.length);
      l.forEach(([x, z, r, s], i) => { q.setFromAxisAngle(V(0, 1, 0), r); m4.compose(V(x, height(x, z) - sink, z), q, V(s, s * 0.95, s)); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true; world.group.add(im);
    }
    if (collide) for (const [x, z, , s] of l) world.colliders.push({ x, z, r: 0.7 * s });
  });
}

// Brick pillars with white globe lamps and an open black iron gate at the
// foot of the stairs; a low stone retaining wall along the hill's foot.
function labGate(world) {
  const S = STAIRS, gx = S.x0 - 0.3, y = PLAZA.y;
  const brick = tex(bricks('#b7604a'));
  for (const s of [-1, 1]) {
    const z = S.z + s * (S.hw + 0.75);
    const G = new THREE.Group(); G.position.set(gx, y, z); world.group.add(G);
    box(1.0, 2.6, 1.0, brick, 0, 1.3, 0, G);
    box(1.2, 0.22, 1.2, '#e2dccd', 0, 2.7, 0, G);
    box(0.9, 0.16, 0.9, '#e2dccd', 0, 2.88, 0, G);
    globeLamp(world, gx, y + 2.95, z, 1.25);
    world.colliders.push({ box: true, x: gx, z, hw: 0.55, hd: 0.55 });
    // the iron gate leaf, swung open up the stairs
    const leaf = new THREE.Group(); leaf.position.set(gx + 0.45, y, z - s * 0.5); leaf.rotation.y = s * 1.35; G.parent.add(leaf);
    const LW = S.hw - 0.05;
    for (let k = 0; k <= 9; k++) {
      const lx = -s * 0, lz = -s * (0.08 + k * LW / 9.3);
      const hgt = 1.9 + Math.sin(k / 9 * Math.PI) * 0.3 * (s > 0 ? 1 : 1);
      box(0.05, hgt, 0.05, '#25262c', lx, hgt / 2 + 0.05, lz, leaf, { line: false });
      add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), flat('#25262c')), leaf, lx, hgt + 0.12, lz, { line: false });
    }
    for (const yy of [0.3, 1.0, 1.75]) box(0.06, 0.07, LW, '#25262c', 0, yy, -s * LW / 2, leaf, { line: false });
    box(0.07, 0.07, LW * 0.9, '#25262c', 0, 0.65, -s * LW / 2, leaf, { line: false }).rotation.x = s * 0.5;
  }
  // the low retaining wall of rough stone along the foot of the hill
  const wx = gx - 0.1, runs = [];
  const wallSeg = (z0, z1) => {
    // built stone by stone, its face to the plaza (-x)
    runs.push({ a: [wx, z0], b: [wx, z1], t: 0.9, top: () => y + 1.28, faces: [{ side: 1, bottom: (u) => height(wx - 0.6, z0 + u) - 0.25 }] });
    world.colliders.push({ box: true, x: wx, z: (z0 + z1) / 2, hw: 0.5, hd: (z1 - z0) / 2 });
  };
  wallSeg(LAB_HILL.z0 - 4, S.z - S.hw - 1.25);
  wallSeg(S.z + S.hw + 1.25, LAB_HILL.z1 + 4);
  for (const r of runs) world.group.add(...wallMeshes([r], 4100 + Math.round(r.a[1]), { fade: WALL_FADE }));
  sign(PLAZA.x0 + 1.6, S.z - S.hw - 3.2, Math.PI / 2 + 0.35, () => labPlate('OAK POKéMON RESEARCH LAB', { mount: 'posts', w: 1.7, h: 0.56, line2: 'Up the stairs', height: 0.9 }), ['OAK POKéMON RESEARCH LAB'], world);
  // plaza: two lamps, a bench, flower tubs
  lamp(PLAZA.x0 + 2.2, PLAZA.z1 - 1.0, world);
  lamp(PLAZA.x1 - 1.2, PLAZA.z0 + 1.2, world);
  bench(PLAZA.x1 - 1.4, PLAZA.z1 - 1.6, -Math.PI / 2 + 0.2, world);
  for (let [x, z] of [[PLAZA.x1 - 1.0, S.z + 4.4], [PLAZA.x1 - 1.0, S.z - 4.4]]) {
    [x, z] = offPath(x, z, 0.65, world);
    cyl(0.6, 0.5, 0.6, tex(stones('#c9c0ae')), x, height(x, z) + 0.3, z, world.group, 12);
    plant(makeBush(400 + Math.round(z), { size: 0.7, flowers: TILE.flowersR }), world.group, x, height(x, z) + 0.55, z);
    world.colliders.push({ x, z, r: 0.65 });
  }
}

// The hill: round bushes all over its slopes (big trees come from veg.js),
// a hedge round the top, and the courtyard path to the lab door.
function hillPlants(world, door) {
  const R = rng(515), L = LAB_HILL, list = [];
  const occ = new Set(), key = (x, z) => Math.round(x / 1.8) * 1000 + Math.round(z / 1.8);
  for (let i = 0; i < 9000 && list.length < 900; i++) {
    const x = L.x0 - L.wW - 2 + R() * (L.x1 - L.x0 + L.wW + L.wE + 4), z = L.z0 - L.wN - 2 + R() * (L.z1 - L.z0 + L.wN + L.wS + 4);
    const u = labHillU(x, z);
    if (u <= 0.03 || u > 0.97) continue;
    if (Math.abs(z - STAIRS.z) < STAIRS.hw + 3.4 && x < STAIRS.x1 + 1) continue;
    if (isWater(x, z) || height(x, z) < SEA_Y + 0.4) continue;
    const k = key(x, z); if (occ.has(k)) continue; occ.add(k);
    list.push([x, z, R() * 6.28, 0.9 + R() * 0.7]);
  }
  // a trimmed hedge round the rim of the plateau (open at the stairs and the lab)
  const rim = [];
  const ring = [[L.x0 + 0.8, L.z0 + 0.8], [L.x1 - 0.8, L.z0 + 0.8], [L.x1 - 0.8, L.z1 - 0.8], [L.x0 + 0.8, L.z1 - 0.8], [L.x0 + 0.8, L.z0 + 0.8]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 1.3) {
      const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
      if (Math.abs(z - STAIRS.z) < 3.2 && x < L.x0 + 3) continue;
      rim.push([x, z, R() * 6, 0.75 + R() * 0.15]);
    }
  }
  instBushes(world, list, [makeBush(901, { size: 1.3 }), makeBush(902, { size: 1.6 }), makeBush(903, { size: 1.1, flowers: TILE.flowersR }), makeBush(904, { size: 1.8 }), makeBush(905, { size: 1.2, flowers: TILE.flowersY })], false, 0.25);
  instBushes(world, rim, [makeBush(911, { size: 1.0 }), makeBush(912, { size: 1.1 })], true);
  // the courtyard path from the top of the stairs to the lab's front steps
  const a = [STAIRS.x1 + 0.2, STAIRS.z], b = door, pts = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 0.8;
    for (const o of [-1, 1]) pts.push([x + (R() - 0.5) * 0.3, z + o * 0.85 + (R() - 0.5) * 0.3, R() * 6]);
  }
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.66, 0.12, 9), flat('#ddd5c4'), pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  pts.forEach(([x, z, r], i) => { q.setFromAxisAngle(V(0, 1, 0), r); m4.compose(V(x, height(x, z) + 0.03, z), q, V(1, 1, 0.8)); im.setMatrixAt(i, m4); });
  im.receiveShadow = true; world.group.add(im);
  // two lamps and a bench by the path
  lamp(STAIRS.x1 + 3, STAIRS.z + 3.2, world);
  lamp(door[0] - 3, door[1] - 3.4, world);
  bench(STAIRS.x1 + 5, STAIRS.z + 4.5, Math.PI + 0.1, world);
}

// ---------- the bridges ----------
function bridge(world, b) {
  const G = new THREE.Group(); G.position.set((b.x0 + b.x1) / 2, b.y, b.z); world.group.add(G);
  const len = b.x1 - b.x0, wood = tex(planks('#c99a62')), dark = '#8a5f3c', hw = b.w / 2;
  // planks across, on two beams
  const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.12, b.w), toon('#d2a56c', { cel: BUILD }), Math.ceil(len / 0.46));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < pk.count; i++) {
    const R = (i * 7919 % 13) / 13;
    m4.compose(V(-len / 2 + 0.23 + i * 0.46, 0.04, 0), q, V(1, 1, 1)); pk.setMatrixAt(i, m4);
    pk.setColorAt(i, new THREE.Color('#ffffff').multiplyScalar(0.88 + R * 0.18));
  }
  pk.castShadow = pk.receiveShadow = true; G.add(pk);
  for (const s of [-1, 1]) box(len + 0.3, 0.32, 0.26, wood, 0, -0.18, s * (hw - 0.3), G);
  // posts into the stream and the railings
  const n = Math.max(2, Math.round(len / 1.4));
  for (const s of [-1, 1]) {
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + 0.1 + (len - 0.2) * i / n;
      box(0.16, 1.15, 0.16, wood, x, 0.6, s * (hw - 0.05), G);
      if (i === 0 || i === n) box(0.2, 0.12, 0.2, '#e8d6b0', x, 1.2, s * (hw - 0.05), G, { line: false });
    }
    if (b.rails) {
      box(len, 0.12, 0.14, wood, 0, 1.05, s * (hw - 0.05), G);
      box(len, 0.08, 0.08, wood, 0, 0.55, s * (hw - 0.05), G, { line: false });
    }
    for (let i = 1; i < n; i++) { const x = -len / 2 + 0.1 + (len - 0.2) * i / n; cyl(0.14, 0.16, 2.6, dark, x, -1.4, s * (hw - 0.3), G, 8, { line: false }); }
    world.colliders.push({ box: true, x: G.position.x, z: b.z + s * (hw - 0.05), hw: len / 2, hd: 0.1 });
  }
  world.walk.push({ x0: b.x0 - 0.2, x1: b.x1 + 0.2, z0: b.z - hw + 0.1, z1: b.z + hw - 0.1, y: b.y + 0.1 });
  world.solid.push(G);
}

// ---------- the stream's rocky banks ----------
function streamRocks(world) {
  const R = rng(611), list = [];
  for (let i = 2; i < STREAM.length - 1; i += 1) {
    const [x, z] = STREAM[i];
    if (shoreSD(x, z) < 6) break;
    const a = STREAM[i - 1], b = STREAM[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const nx = -dz / l, nz = dx / l;
    for (const s of [-1, 1]) {
      if (R() < 0.35) continue;
      const o = 1.9 + R() * 0.7, px = x + nx * o * s, pz = z + nz * o * s;
      if (BRIDGES.some((br) => Math.abs(pz - br.z) < br.w / 2 + 0.6 && px > br.x0 - 0.5 && px < br.x1 + 0.5)) continue;
      if (roadDist(px, pz) < 2.2) continue;
      list.push([px, pz, R() * 6, 0.45 + R() * 0.5]);
    }
  }
  for (let i = list.length - 1; i >= 0; i--) if (onPath(list[i][0], list[i][1], 1.0 * list[i][3])) list.splice(i, 1);
  // damp, darker stones for the banks
  const models = [makeRock(81, 1.0, { col: STONE.bank }), makeRock(82, 1.2, { col: STONE.bank, kind: 'slab' }), makeRock(83, 0.8, { col: STONE.bank })];
  const by = models.map(() => []); list.forEach((p, i) => by[i % 3].push(p));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  models.forEach((mod, k) => {
    for (const p of mod.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, by[k].length);
      by[k].forEach(([x, z, r, s], i) => { q.setFromAxisAngle(V(0, 1, 0), r); m4.compose(V(x, height(x, z) - 0.18 * s, z), q, V(s, s * 1.1, s * 0.9)); im.setMatrixAt(i, m4); });
      im.castShadow = im.receiveShadow = true; world.group.add(im);
    }
  });
}

// ---------- along the lanes: stone retaining walls in the cuttings, white
// rail fences, lamps ----------
function laneFurniture(world) {
  const walls = [];
  const R = rng(919);
  ROADS.forEach((road) => {
    for (let i = 2; i < road.length - 2; i += 2) {
      const [x, z] = road[i], a = road[i - 2], b = road[i + 2];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      for (const s of [-1, 1]) {
        const ox = x + nx * 2.75 * s, oz = z + nz * 2.75 * s;
        const hNear = height(ox, oz), hFar = baseHeight(x + nx * 7 * s, z + nz * 7 * s);
        const cut = hFar - hNear;
        if (cut < 1.6) continue;
        if (roadDist(ox, oz) < 2.5 || [-0.5, -0.25, 0, 0.25, 0.5].some((f) => onPath(ox + dx * f * (l + 0.3) / l, oz + dz * f * (l + 0.3) / l, 0.4)) || inYard(ox, oz, 1) || labHillU(ox, oz) < 1) continue;
        walls.push([ox, oz, Math.atan2(dx, dz), Math.min(1.6, 0.55 + cut * 0.22), l, -s]);
      }
    }
  });
  // each stretch of wall built stone by stone (stone.js), its face to the
  // lane; one mesh per 40 m of town
  const cells = new Map();
  walls.forEach(([x, z, ang, h, l, side]) => {
    const dx = Math.sin(ang), dz = Math.cos(ang), L = l + 0.3, y = height(x, z);
    const a = [x - dx * L / 2, z - dz * L / 2], b = [x + dx * L / 2, z + dz * L / 2];
    const nx = -dz * side, nz = dx * side;   // toward the lane
    const run = { a, b, t: 0.7, top: () => y + h + 0.04, faces: [{ side, bottom: (u) => height(a[0] + dx * u + nx * 0.6, a[1] + dz * u + nz * 0.6) - 0.2 }] };
    const k = Math.floor(x / 40) + ',' + Math.floor(z / 40);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(run);
    world.colliders.push({ x, z, r: 0.5 });
  });
  let ci = 0;
  for (const runs of cells.values()) world.group.add(...wallMeshes(runs, 5200 + ci++, { fade: WALL_FADE }));
  // white rail fences beside some lanes
  // (Route 1's road runs from its far end: the town's stretch is its last 60 m)
  const r0n = ROADS[0].length, idxAt = (z) => ROADS[0].findIndex((p) => p[1] > z);
  const runs = [[0, r0n - 60, r0n - 6, [-1, 1]], [8, 2, 36, [1]], [1, 10, 46, [1]], [6, 8, 30, [-1]], [9, 3, 20, [-1]]];
  // rustic post-and-rail stretches along Route 1
  const brown = [];
  for (const [za, zb, sd] of [[-96, -82, 1], [-134, -122, -1], [-176, -168, 1], [-212, -200, -1], [-250, -238, 1], [-300, -292, -1], [-332, -318, 1], [-372, -360, 1], [-420, -400, -1]]) brown.push([0, idxAt(za), idxAt(zb), [sd]]);
  const nWhite = runs.length;
  runs.push(...brown);
  const posts = [], rails = [], bPosts = [], bRails = [];
  runs.forEach(([ri, i0, i1, sides], runI) => {
    const isBrown = runI >= nWhite;
    const P = isBrown ? bPosts : posts, Rr = isBrown ? bRails : rails;
    const road = ROADS[ri];
    for (const s of sides) {
      let prev = null;
      for (let i = i0; i <= Math.min(i1, road.length - 2); i += 2) {
        const [x, z] = road[i], b = road[i + 1], dx = b[0] - x, dz = b[1] - z, l = Math.hypot(dx, dz) || 1;
        const px = x - dz / l * 3.3 * s, pz = z + dx / l * 3.3 * s;
        const ok = roadDist(px, pz) > 2.9 && !onPath(px, pz, 0.12) && !inYard(px, pz, 0.5) && !isWater(px, pz) && labHillU(px, pz) >= 1 && streamAt(px, pz).d > 3.5;
        if (!ok) { prev = null; continue; }
        const py = height(px, pz);
        P.push([px, py, pz]);
        if (prev && !onPath((prev[0] + px) / 2, (prev[2] + pz) / 2, 0.1)) Rr.push([prev, [px, py, pz]]);
        prev = [px, py, pz];
      }
    }
  });
  fenceMeshes(world, posts, rails, '#fbfaf4');
  fenceMeshes(world, bPosts, bRails, '#9a6b42');

  // lamps along the lanes in town
  ROADS.forEach((road, ri) => {
    if (ri === 0) return;
    for (let i = 8; i < road.length - 4; i += 18) {
      const [x, z] = road[i], b = road[i + 1], dx = b[0] - x, dz = b[1] - z, l = Math.hypot(dx, dz) || 1;
      const s = (i / 18) % 2 ? 1 : -1, px = x - dz / l * 2.9 * s, pz = z + dx / l * 2.9 * s;
      if (roadDist(px, pz) < 2.6 || inYard(px, pz, 0.6) || isWater(px, pz) || streamAt(px, pz).d < 3.6 || labHillU(px, pz) < 1) continue;
      lamp(px, pz, world);
    }
  });
}
function fenceMeshes(world, posts, rails, colour) {
  const g = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pm = new THREE.InstancedMesh(g, flat(colour), posts.length || 1);
  posts.forEach(([x, y, z], i) => { m4.compose(V(x, y + 0.55, z), q.identity(), V(0.14, 1.25, 0.14)); pm.setMatrixAt(i, m4); world.colliders.push({ x, z, r: 0.18 }); });
  pm.count = posts.length;
  const rm = new THREE.InstancedMesh(g, flat(colour), Math.max(1, rails.length * 2));
  rails.forEach(([a, b], i) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    q.setFromAxisAngle(V(0, 1, 0), Math.atan2(dx, dz));
    const tilt = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.atan2(b[1] - a[1], len));
    const qq = q.clone().multiply(tilt);
    for (const [k, hh] of [[0, 0.55], [1, 0.98]]) { m4.compose(V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + hh, (a[2] + b[2]) / 2), qq, V(0.07, 0.11, Math.hypot(len, b[1] - a[1]) + 0.1)); rm.setMatrixAt(i * 2 + k, m4); }
    world.colliders.push({ box: true, x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2, hw: 0.08, hd: len / 2, rot: Math.atan2(dx, dz) });
  });
  rm.count = rails.length * 2;
  for (const o of [pm, rm]) { o.castShadow = o.receiveShadow = true; world.group.add(o); }
}

// ---------- Route 1: signs along the way, and the gate at the mainland end ----------
function route1(world) {
  const at = (z, off) => { const road = ROADS[0]; const p = road.reduce((b, q) => (Math.abs(q[1] - z) < Math.abs(b[1] - z) ? q : b)); return [p[0] + off, p[1]]; };
  // where the route proper begins, past the rim
  { const [x, z] = at(-80, 4.2); sign(x, z, -0.2, () => routeSign({ num: '1', north: 'VIRIDIAN CITY', south: 'PALLET TOWN' }), ['ROUTE 1', 'PALLET TOWN - VIRIDIAN CITY'], world, 1.1); }
  // a tip by the first ledge
  { const [x, z] = at(-104, 4.0); sign(x, z, -0.4, () => noticeBoard('TRAINER TIPS', ['Hop down a ledge to get', 'back to PALLET TOWN fast.', 'You can\'t climb back up!'], { style: 'chalk' }),
    ['TRAINER TIPS', 'Jump down a ledge for a shortcut back to PALLET TOWN.', 'Ledges only go one way: you can\'t climb back up!'], world, 0.9); }
  { const [x, z] = at(-262, -3.6); signpost(x, z, [['VIRIDIAN CITY', Math.PI], ['PALLET TOWN', 0]], world); }
  // the gate: two stone-footed posts, a timber arch with the city's name, the
  // gates shut, and rail fences off into the woods either side
  const gz = ROUTE1.gateZ, gx = routeX(gz) + (at(gz, 0)[0] - routeX(gz));
  const G = new THREE.Group(); G.position.set(gx, height(gx, gz) - 0.05, gz); world.group.add(G);
  const wood = tex(planks('#9a6b42'));
  for (const sx of [-3.2, 3.2]) {
    box(0.9, 0.7, 0.9, tex(stones('#c9c0ae')), sx, 0.3, 0, G);
    box(0.42, 4.6, 0.42, wood, sx, 2.6, 0, G);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.4, 4), flat('#6f4a30')), G, sx, 5.1, 0).rotation.y = Math.PI / 4;
    world.colliders.push({ x: gx + sx, z: gz, r: 0.55 });
  }
  box(7.4, 0.3, 0.36, wood, 0, 4.35, 0, G);
  box(7.0, 0.18, 0.3, wood, 0, 3.75, 0, G);
  const np = nameplate('VIRIDIAN CITY', { w: 3.2, h: 0.5 }); np.position.set(0, 4.05, 0.2); G.add(np);
  const np2 = nameplate('VIRIDIAN CITY', { w: 3.2, h: 0.5 }); np2.position.set(0, 4.05, -0.2); np2.rotation.y = Math.PI; G.add(np2);
  for (const sx of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.position.set(sx * 2.95, 0, 0); leaf.rotation.y = sx * 0.05; G.add(leaf);
    for (const yy of [0.5, 1.15, 1.8]) box(2.9, 0.16, 0.1, wood, -sx * 1.45, yy, 0, leaf);
    for (const xx of [0.15, 1.45, 2.75]) box(0.12, 1.6, 0.12, wood, -sx * xx, 1.0, 0.05, leaf);
    const br = box(3.2, 0.12, 0.1, wood, -sx * 1.45, 1.15, 0.08, leaf); br.rotation.z = sx * 0.42;
  }
  world.colliders.push({ box: true, x: gx, z: gz, hw: 3.2, hd: 0.25 });
  // fences into the woods
  const fp = [], fr = [];
  for (const sd of [-1, 1]) {
    let prev = null;
    for (let k = 0; k <= 12; k++) {
      const px = gx + sd * (4.2 + k * 2.4), pz = gz + Math.sin(k * 0.7) * 0.4, py = height(px, pz);
      fp.push([px, py, pz]);
      if (prev) fr.push([prev, [px, py, pz]]);
      prev = [px, py, pz];
    }
  }
  fenceMeshes(world, fp, fr, '#9a6b42');
  world.use.push({ x: gx, z: gz + 1.6, r: 2.2, label: 'Look', lines: ['The gate to VIRIDIAN CITY is shut.', 'A note: ROAD WORKS AHEAD. Come back another day!'] });
  { const [x, z] = at(gz + 9, -4.5); sign(x, z, 0.3, () => noticeBoard('VIRIDIAN CITY AHEAD', ['The road beyond the gate', 'is closed for repairs.', 'Sorry for the trouble!'], { style: 'pinned', frame: '#5f8fb0', roof: '#3d6fa8' }),
    ['VIRIDIAN CITY AHEAD', 'The road beyond the gate is closed for repairs. Sorry for the trouble!'], world, 0.9); }
}

// ---------- town furniture ----------
// Nothing stands on the dirt: a piece placed by hand on or at a path moves to
// the nearest clear spot beside it (r = its footprint radius; clear of the
// water, the stairs, the yards and anything already built).
function offPath(x, z, r, world) {
  if (!onPath(x, z, r)) return [x, z];
  const hit = (qx, qz) => world.colliders.some((c) => {
    if (!c.box) return (qx - c.x) ** 2 + (qz - c.z) ** 2 < (c.r + r) ** 2;
    let dx = qx - c.x, dz = qz - c.z;
    if (c.rot) { const cs = Math.cos(c.rot), sn = Math.sin(c.rot); [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs]; }
    return Math.abs(dx) < c.hw + r && Math.abs(dz) < c.hd + r;
  });
  for (let d = 0.25; d <= 10; d += 0.25) {
    const n = Math.max(16, Math.ceil(d * 10));
    let best = null, bs = -1;
    for (let a = 0; a < n; a++) {
      const qx = x + Math.cos(a / n * Math.PI * 2) * d, qz = z + Math.sin(a / n * Math.PI * 2) * d, sd = pathSD(qx, qz);
      if (sd <= bs || onPath(qx, qz, r) || isWater(qx, qz) || streamAt(qx, qz).d < r + 1.6 || onStairs(qx, qz, r + 0.6) || inYard(qx, qz, r) || hit(qx, qz)) continue;
      best = [qx, qz]; bs = sd;
    }
    if (best) { (window.__offPath ||= []).push([+x.toFixed(1), +z.toFixed(1), +best[0].toFixed(1), +best[1].toFixed(1), r]); return best; }   // test hook: what moved
  }
  return [x, z];
}
// a free-standing sign built by signs.js (`build` returns it, facing +z);
// its posts become colliders and its Read spot is in front of it
function sign(x, z, face, build, lines, world, r = 1.05) {
  [x, z] = offPath(x, z, r, world);
  const g = build(); g.position.set(x, height(x, z) - 0.03, z); g.rotation.y = face; world.group.add(g);
  const c = Math.cos(face), s = Math.sin(face);
  for (const [lx, lz, pr] of g.userData.posts || [[0, 0, 0.5]]) world.colliders.push({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, r: pr });
  world.use.push({ x: x + s * 1.1, z: z + c * 1.1, r: 1.3, label: 'Read', lines });
  return g;
}
// a fingerpost: a post with arrow boards pointing down the lanes (signs.js)
function signpost(x, z, arms, world) {
  [x, z] = offPath(x, z, 0.25, world);
  const g = fingerpost(arms); g.position.set(x, height(x, z) - 0.03, z); world.group.add(g);
  world.colliders.push({ x, z, r: 0.25 });
  world.use.push({ x, z, r: 1.4, label: 'Read', lines: arms.map(([l]) => l) });
}
function lamp(x, z, world) {
  [x, z] = offPath(x, z, 0.25, world);
  const g = new THREE.Group(); g.position.set(x, height(x, z), z); world.group.add(g);
  cyl(0.16, 0.2, 0.4, '#2f4a40', 0, 0.2, 0, g, 10);
  cyl(0.06, 0.08, 3.0, '#2f4a40', 0, 1.8, 0, g, 8);
  box(0.36, 0.08, 0.36, '#2f4a40', 0, 3.3, 0, g);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.26), new THREE.MeshBasicMaterial({ color: '#fff1c4' })); add(glow, g, 0, 3.55, 0, { shadow: false });
  add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 4), flat('#2f4a40')), g, 0, 3.86, 0).rotation.y = Math.PI / 4;
  world.colliders.push({ x, z, r: 0.2 });
}
function bench(x, z, rot, world) {
  [x, z] = offPath(x, z, 0.95, world);
  const g = new THREE.Group(); g.position.set(x, height(x, z), z); g.rotation.y = rot; world.group.add(g);
  const wood = tex(planks('#c99a62'));
  for (let i = 0; i < 3; i++) box(1.8, 0.06, 0.13, wood, 0, 0.48, -0.16 + i * 0.16, g, { line: false });
  for (let i = 0; i < 2; i++) box(1.8, 0.13, 0.05, wood, 0, 0.75 + i * 0.2, -0.28, g, { line: false });
  for (const sx of [-0.8, 0.8]) { box(0.07, 0.48, 0.5, '#2f4a40', sx, 0.24, 0, g); box(0.07, 0.6, 0.07, '#2f4a40', sx, 0.8, -0.3, g); }
  world.colliders.push({ x, z, r: 0.95 });
}
// the old stone well in the square
function well(x, z, world) {
  [x, z] = offPath(x, z, 1.4, world);
  const g = new THREE.Group(); g.position.set(x, height(x, z), z); world.group.add(g);
  const ring = new THREE.Mesh(wuv(new THREE.CylinderGeometry(1.15, 1.25, 1.0, 20, 1, true), 0.6), tex(stones('#c9c0ae')));
  ring.material = ring.material.clone(); ring.material.side = THREE.DoubleSide; add(ring, g, 0, 0.5, 0, { line: false });
  add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 6, 24).rotateX(Math.PI / 2), flat('#ddd6c6')), g, 0, 1.0, 0, { line: false });
  add(new THREE.Mesh(new THREE.CircleGeometry(1.05, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2e5e74' })), g, 0, 0.55, 0, { line: false, shadow: false });
  for (const s of [-1, 1]) box(0.16, 2.3, 0.16, '#8a5f3c', s * 1.05, 1.15, 0, g);
  box(2.4, 0.12, 0.12, '#8a5f3c', 0, 2.0, 0, g, { line: false });
  const rf = new THREE.Group(); g.add(rf);
  gableRoof(rf, 2.6, 1.6, 2.25, 0.7, tex(tiles('#c4553a')), '#fbfaf4', 0.15, 0.1, 0.12);
  const bucket = cyl(0.2, 0.16, 0.3, '#9a6a3e', 0, 1.35, 0, g, 10); bucket.userData.keep = true;
  world.anim.push((dt, t) => { bucket.position.y = 1.35 + Math.sin(t * 0.7) * 0.03; });
  world.colliders.push({ x, z, r: 1.35 });
  world.use.push({ x, z: z + 1.6, r: 1.2, label: 'Look', lines: ['An old stone well.', 'The water is cool and clear. Someone left a coin at the bottom.'] });
}
// a low wooden border round a flower bed
function bedBorder([x0, z0, x1, z1], world) {
  const m = tex(planks('#a97a4c'));
  const seg = (ax, az, bx, bz) => {
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az);
    const b = box(len + 0.2, 0.3, 0.18, m, cx, height(cx, cz) + 0.1, cz, world.group);
    b.rotation.y = -Math.atan2(bz - az, bx - ax);
  };
  seg(x0, z0, x1, z0); seg(x1, z0, x1, z1); seg(x1, z1, x0, z1); seg(x0, z1, x0, z0);
}

// ---------- the waterfront ----------
// The harbour in the bay (terrain.js HARBOUR): a square U of timber piers on
// piles, open to the sea. The quay along the waterline is where the main lane
// comes down; a long pier runs out from each end of it to a wider head with
// lamps. Bollards, iron ladders down to the water, lifebuoys, crates, barrels,
// nets and coiled rope; rowing boats and a little fishing boat moored in the
// basin. A boathouse on the sand, and the red-and-white lighthouse on its
// rocky islet near the bay's mouth.
const HB = HARBOUR, HB_Y = SEA_Y + HB.y;
// (the west pier as "the pier": the fisher stands on its head)
export const PIER = { x: HB.arms[0].x, z0: HB.arms[0].z0, z1: HB.arms[0].z1, w: HB.w, y: HB_Y };
function rowboat(g, x, z, rot, hullCol, trim, world, phase = 0) {
  const boat = new THREE.Group(); boat.userData.keep = true; boat.position.set(x, SEA_Y + 0.2, z); boat.rotation.y = rot; g.add(boat);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.6, 3.8, 14, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), flat(hullCol));
  hull.scale.set(1, 0.62, 1); add(hull, boat, 0, 0.3, 0);
  box(1.85, 0.12, 3.82, trim, 0, 0.32, 0, boat, { line: false });
  for (const zz of [-0.7, 0.5]) box(1.7, 0.08, 0.32, tex(planks('#c99a62')), 0, 0.18, zz, boat, { line: false });
  for (const sd of [-1, 1]) { const oar = box(0.06, 0.06, 2.4, '#c9a876', sd * 0.55, 0.38, 0.1, boat, { line: false }); oar.rotation.y = sd * 0.15; }
  world.anim.push((k, time) => { boat.position.y = SEA_Y + 0.17 + Math.sin(time * 1.1 + phase) * 0.06; boat.rotation.z = Math.sin(time * 0.9 + phase) * 0.035; boat.rotation.x = Math.sin(time * 0.7 + phase) * 0.02; });
  return boat;
}
// a small wooden fishing boat with a wheelhouse and a mast
function fishingBoat(g, x, z, rot, world) {
  const b = new THREE.Group(); b.userData.keep = true; b.position.set(x, SEA_Y + 0.35, z); b.rotation.y = rot; g.add(b);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.0, 7.2, 16, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), flat('#2f6fa8'));
  hull.scale.set(1, 0.7, 1); add(hull, b, 0, 0.55, 0);
  box(3.15, 0.14, 7.25, '#f4f1e6', 0, 0.58, 0, b, { line: false });
  box(2.9, 0.08, 6.6, tex(planks('#c99a62')), 0, 0.5, 0, b, { line: false });
  box(1.7, 1.5, 1.8, tex(planks('#f4f1e6')), 0, 1.3, 0.9, b);
  box(2.0, 0.14, 2.1, '#d8473a', 0, 2.1, 0.9, b);
  windowAt(b, 0, 1.55, 1.82, 1.1, 0.5, 2, 1);
  cyl(0.07, 0.09, 4.2, '#7d5536', 0, 2.6, -1.4, b, 8);
  box(1.8, 0.06, 0.06, '#7d5536', 0, 3.6, -1.4, b, { line: false });
  for (const zz of [-2.6, -2.0]) add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 5, 16).rotateX(Math.PI / 2), flat('#e8402e')), b, 0.9, 0.62, zz, { line: false });
  world.anim.push((k, time) => { b.position.y = SEA_Y + 0.35 + Math.sin(time * 0.8 + 1.7) * 0.07; b.rotation.z = Math.sin(time * 0.6 + 0.4) * 0.03; });
}
function dock(world) {
  const g = new THREE.Group(); world.group.add(g);
  const y = HB_Y, hw = HB.w / 2, Q = HB.quay, wood = tex(planks('#c99a62')), post = '#7d5536';
  // the deck: planks across the way you walk (instanced, each a shade apart)
  const planksAt = [];
  for (let xx = Q.x0; xx < Q.x1 - 0.05; xx += 0.42) planksAt.push([xx + 0.21, (Q.z0 + Q.z1) / 2, 0.38, Q.z1 - Q.z0]);
  for (const a of HB.arms) for (let zz = a.z0; zz < a.z1 - 0.05; zz += 0.42) planksAt.push([a.x, zz + 0.21, HB.w, 0.38]);
  const pk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 1), toon('#d2a56c', { cel: BUILD }), planksAt.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  planksAt.forEach(([px, pz, sx, sz], i) => { m4.compose(V(px, y, pz), q, V(sx, 1, sz)); pk.setMatrixAt(i, m4); pk.setColorAt(i, new THREE.Color('#ffffff').multiplyScalar(0.86 + ((i * 7919) % 11) / 11 * 0.2)); });
  pk.castShadow = pk.receiveShadow = true; g.add(pk);
  // edge beams under the plank ends, and the heads
  for (const sz of [Q.z0 + 0.13, Q.z1 - 0.13]) box(Q.x1 - Q.x0 - 0.02, 0.34, 0.24, wood, (Q.x0 + Q.x1) / 2, y - 0.22, sz, g);
  for (const a of HB.arms) {
    for (const sx of [-1, 1]) box(0.24, 0.34, a.z1 - a.z0, wood, a.x + sx * (hw - 0.13), y - 0.22, (a.z0 + a.z1) / 2, g);
    box(HB.head.w, 0.16, HB.head.d, wood, a.x, y + 0.01, a.z1 + HB.head.d / 2 - 0.2, g);
    box(HB.head.w + 0.1, 0.12, 0.2, wood, a.x, y + 0.12, a.z1 + HB.head.d - 0.2, g, { line: false });
  }
  // piles: along the arms' sides and the quay's sea side, and under the heads
  const piles = [];
  for (const a of HB.arms) {
    for (let zz = a.z0 + 1.3; zz <= a.z1; zz += 2.6) for (const sx of [-1, 1]) piles.push([a.x + sx * (hw + 0.05), zz]);
    for (const [px, pz] of [[-3.3, 0.2], [3.3, 0.2], [-3.3, 4.4], [3.3, 4.4], [0, 4.5], [-1.1, 4.5], [1.1, 4.5]]) piles.push([a.x + px, a.z1 + pz]);
  }
  for (let xx = Q.x0 + 1.2; xx <= Q.x1; xx += 2.6) piles.push([xx, Q.z1 + 0.05]);
  const pg = new THREE.CylinderGeometry(0.17, 0.2, 4.4, 8), pm = new THREE.InstancedMesh(pg, flat(post), piles.length);
  piles.forEach(([px, pz], i) => { m4.compose(V(px, y - 1.6, pz), q, V(1, 1, 1)); pm.setMatrixAt(i, m4); });
  pm.castShadow = pm.receiveShadow = true; g.add(pm);
  harbourFront(world, g);
  // bollards along the basin's sides, iron ladders down to the water
  const bollard = (bx, bz) => { cyl(0.16, 0.2, 0.55, '#3a3d46', bx, y + 0.3, bz, g, 10); cyl(0.24, 0.24, 0.08, '#3a3d46', bx, y + 0.6, bz, g, 10); world.colliders.push({ x: bx, z: bz, r: 0.25 }); };
  const [W, E] = HB.arms, inW = W.x + hw - 0.35, inE = E.x - hw + 0.35;
  for (const zz of [W.z0 + 6, W.z0 + 15, W.z0 + 24]) { bollard(inW, zz); bollard(inE, zz + 2); }
  for (const xx of [Q.x0 + 6, Q.x1 - 6]) bollard(xx, Q.z1 - 0.35);
  const ladder = (lx, lz, side) => {
    for (const dz of [-0.28, 0.28]) box(0.06, 2.3, 0.06, '#3a3d46', lx + side * 0.08, y - 0.85, lz + dz, g, { line: false });
    for (let k = 0; k < 6; k++) box(0.05, 0.05, 0.56, '#3a3d46', lx + side * 0.08, y - 0.1 - k * 0.32, lz, g, { line: false });
  };
  ladder(W.x + hw, W.z0 + 10.5, 1); ladder(E.x - hw, E.z0 + 19.5, -1); ladder(W.x + hw, W.z1 - 3, 1);
  // lamps: a pair on each head, two on the quay
  const lampAt = (lx, lz) => {
    const L = new THREE.Group(); L.position.set(lx, y, lz); g.add(L);
    cyl(0.06, 0.08, 2.6, '#2f4a40', 0, 1.3, 0, L, 8);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), new THREE.MeshBasicMaterial({ color: '#fff1c4' })); glow.position.y = 2.75; L.add(glow);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 4), flat('#2f4a40')), L, 0, 3.05, 0).rotation.y = Math.PI / 4;
    world.colliders.push({ x: lx, z: lz, r: 0.2 });
  };
  for (const a of HB.arms) for (const sx of [-1, 1]) lampAt(a.x + sx * 3.0, a.z1 + 4.2);
  lampAt(Q.x0 + 1.0, Q.z0 + 0.6); lampAt(Q.x1 - 1.0, Q.z0 + 0.6);
  // lifebuoys on posts at the heads' inner corners
  for (const [lx, lz] of [[W.x + 3.2, W.z1 + 0.5], [E.x - 3.2, E.z1 + 0.5]]) {
    box(0.12, 1.4, 0.12, post, lx, y + 0.7, lz, g);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 6, 18), flat('#e8402e')), g, lx, y + 0.95, lz + 0.12, { line: false });
    world.colliders.push({ x: lx, z: lz, r: 0.2 });
  }
  // crates, barrels, nets and rope on the quay and the west head
  const crate = tex(planks('#b9884f'));
  for (const [cx, cz, sz, r, up] of [[Q.x0 + 2.4, Q.z0 + 1.3, 0.8, 0.2, 0], [Q.x0 + 2.4, Q.z0 + 2.3, 0.7, -0.1, 0], [Q.x0 + 2.45, Q.z0 + 1.8, 0.6, 0.5, 0.75], [W.x - 2.4, W.z1 + 3.3, 0.8, 0.3, 0]]) {
    const c = box(sz, sz, sz, crate, cx, y + sz / 2 + 0.08 + up, cz, g); c.rotation.y = r;
  }
  world.colliders.push({ box: true, x: Q.x0 + 2.4, z: Q.z0 + 1.8, hw: 0.5, hd: 1.0 }, { x: W.x - 2.4, z: W.z1 + 3.3, r: 0.55 });
  for (const [bx, bz] of [[Q.x1 - 2.6, Q.z0 + 1.2], [Q.x1 - 2.2, Q.z0 + 2.1], [E.x + 2.5, E.z1 + 3.4]]) {
    cyl(0.36, 0.36, 0.9, '#8a5a36', bx, y + 0.53, bz, g, 12);
    for (const yy of [0.25, 0.8]) add(new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.035, 4, 16).rotateX(Math.PI / 2), flat('#3a3d46')), g, bx, y + yy, bz, { line: false });
    world.colliders.push({ x: bx, z: bz, r: 0.42 });
  }
  for (const [rx, rz] of [[W.x - 0.6, W.z0 + 12], [E.x + 0.6, E.z1 + 1.2], [Q.x0 + 12, Q.z0 + 1.6]]) for (let k = 0; k < 3; k++) add(new THREE.Mesh(new THREE.TorusGeometry(0.3 - k * 0.07, 0.05, 5, 16).rotateX(Math.PI / 2), flat('#d8c290')), g, rx, y + 0.12 + k * 0.08, rz, { line: false });
  const net = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat('#5f7f8a')); net.scale.set(1.2, 0.35, 0.8); add(net, g, Q.x0 + 16, y + 0.07, Q.z0 + 1.4, { line: false });
  // boats moored in the basin: rowing boats along the piers, the fishing boat
  // at the quay; mooring lines to the bollards
  const bx0 = W.x + hw, bx1 = E.x - hw;
  rowboat(g, bx0 + 1.4, W.z0 + 7.5, 0.06, '#f4f1e6', '#d84a3a', world, 0);
  rowboat(g, bx0 + 1.5, W.z0 + 20, -0.04, '#f4e7c8', '#3d6fa8', world, 1.3);
  rowboat(g, bx1 - 1.5, E.z0 + 12, 0.1, '#e8f0ec', '#3f9a6a', world, 2.1);
  fishingBoat(g, (bx0 + bx1) / 2 + 2, Q.z1 + 6.5, Math.PI / 2 + 0.05, world);
  const rope = (ax, az, zx, zz) => { const len = Math.hypot(zx - ax, zz - az); const r = box(0.04, 0.04, len, '#d8c290', (ax + zx) / 2, y + 0.1, (az + zz) / 2, g, { line: false }); r.rotation.y = Math.atan2(zx - ax, zz - az); r.rotation.x = 0.08; };
  rope(inW, W.z0 + 6, bx0 + 1.4, W.z0 + 5.8); rope(inW, W.z0 + 15, bx0 + 1.5, W.z0 + 18.2); rope(inE, E.z0 + 8, bx1 - 1.5, E.z0 + 10.2);
  // walking on it
  world.walk.push({ x0: Q.x0, x1: Q.x1, z0: Q.z0, z1: Q.z1 + 0.05, y: y + 0.08 });
  for (const a of HB.arms) {
    world.walk.push({ x0: a.x - hw, x1: a.x + hw, z0: a.z0 - 0.05, z1: a.z1 + 0.2, y: y + 0.08 });
    world.walk.push({ x0: a.x - HB.head.w / 2, x1: a.x + HB.head.w / 2, z0: a.z1 - 0.2, z1: a.z1 + HB.head.d - 0.2, y: y + 0.09 });
  }
  for (const a of HB.arms) world.use.push({ x: a.x, z: a.z1 + 3.4, r: 1.8, label: 'Look', lines: ['The sea stretches south toward CINNABAR ISLAND.', 'You\'d need a POKéMON that can SURF to go any further.'] });
  world.use.push({ x: (bx0 + bx1) / 2 + 2, z: Q.z1 + 1.0, r: 2.0, label: 'Look', lines: ['A little fishing boat, the SEAGULL.', 'Nets piled in the stern. It smells of salt and fish.'] });
  world.solid.push(g);
  boathouse(world, BOATHOUSE.x, BOATHOUSE.z);
  lighthouse(world, ISLET.x, ISLET.z);
}
// The apron's sea front (terrain.js HARBOUR.apron): a stone quay wall on
// either side of the basin's mouth, running on a little into the beach, with
// boulders heaped at its foot and a ragged ribbon of foam where the sea
// breaks on it.
function harbourFront(world, g) {
  const A = HARBOUR.apron, B = HARBOUR.basin, zf = A.z1 + 0.3;
  const runs = [];
  for (const [xa, xb] of [[A.x0 - 8, B.x0 - 1.6], [B.x1 + 1.6, A.x1 + 6]]) {
    runs.push({ a: [xa, zf], b: [xb, zf], t: 0.9, top: (u) => Math.max(height(xa + u, zf - 0.6), SEA_Y + 0.25) + 0.04, faces: [{ side: -1, bottom: () => SEA_Y - 1.6 }] });
  }
  world.group.add(...wallMeshes(runs, 7711, { fade: WALL_FADE }));
  // boulders at its foot
  const R = rng(7712), list = [];
  for (const [xa, xb] of [[A.x0 - 8, B.x0 - 2.5], [B.x1 + 2.5, A.x1 + 6]]) for (let x = xa; x < xb; x += 1.1 + R() * 1.4) list.push([x + R() * 0.6, zf + 0.9 + R() * 1.3, R() * 6, 0.5 + R() * 0.7]);
  const models = [makeRock(91, 1.0, { col: STONE.beach }), makeRock(92, 1.2, { col: STONE.beach, kind: 'slab' }), makeRock(93, 0.8, { col: STONE.beach })];
  const by = models.map(() => []); list.forEach((p, i) => by[i % 3].push(p));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  models.forEach((mod, k) => {
    for (const p of mod.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, by[k].length);
      by[k].forEach(([x, z, r, sc], i) => { q.setFromAxisAngle(V(0, 1, 0), r); m4.compose(V(x, SEA_Y - 0.12 * sc, z), q, V(sc, sc * 1.1, sc)); im.setMatrixAt(i, m4); });
      im.castShadow = im.receiveShadow = true; world.group.add(im);
    }
  });
  // the foam: a wobbly white ribbon on the water along the wall and the rocks
  const fp = [];
  for (const [xa, xb] of [[A.x0 - 8, B.x0 - 1.4], [B.x1 + 1.4, A.x1 + 6]]) {
    const n = Math.ceil((xb - xa) / 0.8);
    for (let i = 0; i < n; i++) {
      const x0 = xa + (xb - xa) * i / n, x1 = xa + (xb - xa) * (i + 1) / n;
      const w0 = 0.5 + Math.sin(x0 * 0.9) * 0.25 + Math.sin(x0 * 2.3) * 0.15, w1 = 0.5 + Math.sin(x1 * 0.9) * 0.25 + Math.sin(x1 * 2.3) * 0.15;
      fp.push(x0, 0, zf + 0.4, x0, 0, zf + 0.4 + w0, x1, 0, zf + 0.4 + w1, x0, 0, zf + 0.4, x1, 0, zf + 0.4 + w1, x1, 0, zf + 0.4);
      // a broken second line further out, where the swell meets the rocks
      if (Math.sin(x0 * 0.7) + Math.sin(x0 * 1.9) > 0.5) fp.push(x0, 0, zf + 2.3, x0, 0, zf + 2.6, x1, 0, zf + 2.6, x0, 0, zf + 2.3, x1, 0, zf + 2.6, x1, 0, zf + 2.3);
    }
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.computeVertexNormals();
  const foam = new THREE.Mesh(fg, flat('#ffffff')); foam.position.y = SEA_Y + 0.14; foam.userData.outline = false; foam.castShadow = false; foam.receiveShadow = false; g.add(foam);
  // the heads' sea ends: a stout timber fender across each
  for (const a of HARBOUR.arms) box(HARBOUR.head.w + 0.3, 0.5, 0.3, tex(planks('#8a5f3c')), a.x, SEA_Y + HARBOUR.y - 0.3, a.z1 + HARBOUR.head.d - 0.05, g);
  void g;
}
function boathouse(world, x, z) {
  [x, z] = offPath(x, z, 3.6, world);
  const G = new THREE.Group(); G.position.set(x, height(x, z), z); G.rotation.y = 0.1; world.group.add(G);
  const wall = tex(planks('#6f9fbf')), roofMat = tex(tiles('#d8473a'));
  foundation(G, 5.2, 4.2, 0.2, 0, 0, 0.8, 991);
  box(5.0, 2.6, 4.0, wall, 0, 1.4, 0, G);
  gableWall(G, 5.0, 1.6, 2.7, 2.0, wall); gableWall(G, 5.0, 1.6, 2.7, -2.0, wall, -1);
  gableRoof(G, 5.0, 4.0, 2.7, 1.6, roofMat, '#fbfaf4', 0.3, 0.3);
  box(2.6, 2.1, 0.12, tex(planks('#f4f1e6')), 0, 1.15, 2.05, G);
  windowAt(G, 0, 3.15, 2.06, 0.7, 0.5, 2, 1);
  for (let k = 0; k < 3; k++) add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 18), flat('#e8402e')), G, -2.6, 1.6, 0.8 - k * 0.0, { line: false }).rotation.y = Math.PI / 2;
  const sb = nameplate('BOATHOUSE', { w: 1.1, h: 0.3 }); sb.position.set(0, 2.5, 2.015); G.add(sb);   // signs.js, 1.5 cm off the wall
  world.colliders.push({ box: true, x, z, hw: 2.8, hd: 2.4, rot: 0.1 });
  world.use.push({ x: x + 0.2, z: z + 3.2, r: 1.2, label: 'Look', lines: ['The BOATHOUSE.', 'Oars, nets and a fresh coat of paint drying on a dinghy.'] });
  world.solid.push(G);
}
// The lighthouse islet: stacked shelves of faceted rock round a level top,
// a stone landing with steps and a little jetty on the town side (-z), the
// rock dark and weedy where the tide wets it, a ring of foam, and a red and
// white tower: stone plinth, door, windows, a gallery on corbels with a
// railing, the lantern room and its domed cap.
function lighthouse(world, x, z) {
  const G = new THREE.Group(); G.position.set(x, SEA_Y, z); world.group.add(G);
  const R = rng(9791), C = new THREE.Color(STONE.sea), parts = [];
  const rock = (seed, px, py, pz, w, h, d, rot, kind = 'boulder', o = {}) => {
    const g = boulderGeometry(seed, { w, h, d, kind, col: C.clone().multiplyScalar(0.9 + R() * 0.15), ...o });
    g.rotateY(rot).translate(px, py, pz); parts.push(g); return g;
  };
  const y0 = 2.4;   // the top
  // the level top: one broad slab
  rock(9001, 0, y0 - 2.6, 0.3, 9.5, 2.6, 8.5, 0.3, 'slab', { flatTop: true, bevel: 0.22 });
  // a ring of shelves under it, stepping down to the water
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + R() * 0.3, rr = 5.2 + R() * 1.2;
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.45) continue;   // the landing side
    const w = 3.4 + R() * 2.4, h = 2.2 + R() * 1.6;
    rock(9100 + i, Math.cos(a) * rr, -1.8, Math.sin(a) * rr, w, h, w * (0.7 + R() * 0.3), -a + R(), 'boulder');
    if (R() < 0.7) rock(9200 + i, Math.cos(a + 0.25) * (rr - 1.6), -0.2 + R() * 0.6, Math.sin(a + 0.25) * (rr - 1.6), w * 0.7, h * 0.8 + 0.6, w * 0.6, R() * 6, 'boulder');
  }
  // layered stacks at the back: slabs piled up, each a little set back
  for (const [sx, sz, n0, rot] of [[-6.6, 1.8, 5, 0.7], [6.4, 2.6, 4, 2.1], [-2.8, 5.6, 4, 4.0], [-6.8, -3.2, 2, 1.2]]) {
    let yy = -1.6, w = 4.2;
    for (let k = 0; k < n0; k++) {
      const h = 1.3 + R() * 0.7;
      rock(9310 + k * 7 + Math.round(sx * 3), sx + (R() - 0.5) * 0.6, yy, sz + (R() - 0.5) * 0.6, w, h, w * 0.75, rot + (R() - 0.5) * 0.5, 'slab', { flatTop: true, bevel: 0.14 });
      yy += h * 0.92; w *= 0.78;
    }
  }
  for (let i = 0; i < 9; i++) { const a = R() * 6.28, rr = 7.2 + R() * 2.2; rock(9400 + i, Math.cos(a) * rr, -0.9 - R() * 0.3, Math.sin(a) * rr, 0.8 + R() * 1.4, 0.9 + R() * 0.9, 0.8 + R() * 1.2, R() * 6, R() < 0.5 ? 'pebble' : 'boulder'); }
  // the landing: a block quay at the water, steps up to the top
  const lz = -6.6, landing = wallGeometry([
    { a: [-2.2, lz + 1.4], b: [-2.2, lz - 1.3], t: 0.6, top: () => 0.75, col: STONE.wall, faces: [{ side: -1, bottom: () => -1.5 }] },
    { a: [2.2, lz - 1.3], b: [2.2, lz + 1.4], t: 0.6, top: () => 0.75, col: STONE.wall, faces: [{ side: -1, bottom: () => -1.5 }] },
    { a: [-2.2, lz - 1.3], b: [2.2, lz - 1.3], t: 0.6, top: () => 0.75, col: STONE.wall, faces: [{ side: -1, bottom: () => -1.5 }] },
  ], 9501);
  parts.push(landing);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 2.8), flat('#8d8a80')); deck.position.set(0, 0.45, lz + 0.05); deck.userData.outline = false; G.add(deck);
  const stepsN = 8, sx0 = 0.35, run = 0.5;
  for (let i = 0; i < stepsN; i++) {
    const yt = 0.75 + (i + 1) * (y0 - 0.75) / stepsN, zc = lz + 1.6 + i * run;
    const g = blockGeometry(9600 + i, { aspect: 3.2, back: true, col: new THREE.Color(STONE.wall).multiplyScalar(0.95 + R() * 0.1) });
    g.scale(1.9 / 3.2 * 1.0, yt + 0.6, run + 0.08).translate(sx0, (yt - 0.6) / 2, zc); parts.push(g);
  }
  // the rock: dark and weedy where the tide wets it
  const geo = mergeAll(parts), P = geo.attributes.position, Cc = geo.attributes.color, wet = new THREE.Color('#5d6658'), weed = new THREE.Color('#5f7a3c');
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i), k = 1 - THREE.MathUtils.smoothstep(y, 0.35, 0.95);
    if (k <= 0) continue;
    const c = new THREE.Color(Cc.getX(i), Cc.getY(i), Cc.getZ(i));
    c.lerp(wet, k * 0.85);
    if (y > -0.15 && y < 0.4) c.lerp(weed, 0.35 * k);
    Cc.setXYZ(i, c.r, c.g, c.b);
  }
  // the foam ring: from the outline of the rock at the waterline
  const bins = 120, rad = new Float32Array(bins);
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i); if (y < -0.6 || y > 0.5) continue;
    const px = P.getX(i), pz = P.getZ(i), b = Math.floor(((Math.atan2(pz, px) / (Math.PI * 2)) + 1) % 1 * bins);
    rad[b] = Math.max(rad[b], Math.hypot(px, pz));
  }
  for (let k = 0; k < 3; k++) for (let b = 0; b < bins; b++) rad[b] = Math.max(rad[b], (rad[(b + bins - 1) % bins] + rad[(b + 1) % bins]) / 2 * 0.97);
  G.add(stoneMesh(geo, { fade: [700, 720], key: 'isle' }));
  const fp = [], ring = (r0, r1, keep) => {
    for (let b = 0; b < bins; b++) {
      if (!keep(b)) continue;
      const a0 = b / bins * Math.PI * 2, a1 = (b + 1) / bins * Math.PI * 2, b1 = (b + 1) % bins;
      const p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      const A = p(a0, rad[b] + r0(b)), B = p(a1, rad[b1] + r0(b1)), Cq = p(a1, rad[b1] + r1(b1)), D = p(a0, rad[b] + r1(b));
      fp.push(...A, ...B, ...Cq, ...A, ...Cq, ...D);
    }
  };
  const wob = (b, k) => Math.sin(b * 0.55 + k) * 0.25 + Math.sin(b * 1.4 + k * 2) * 0.15;
  ring((b) => -0.4, (b) => 0.45 + wob(b, 1) * 0.6, () => true);
  ring((b) => 0.9 + wob(b, 3) * 0.4, (b) => 1.2 + wob(b, 3) * 0.6, (b) => Math.sin(b * 0.42) + Math.sin(b * 1.15) > 0.4);
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.computeVertexNormals();
  const foam = new THREE.Mesh(fg, flat('#ffffff')); foam.position.y = 0.16; foam.userData.outline = false; foam.castShadow = false; G.add(foam);
  // a short jetty off the landing, a bollard
  const wood = tex(planks('#b98a5a'));
  box(1.6, 0.14, 3.2, wood, -0.6, 0.7, lz - 2.9, G);
  for (const [px, pz] of [[-1.3, lz - 1.6], [0.1, lz - 1.6], [-1.3, lz - 4.3], [0.1, lz - 4.3]]) cyl(0.11, 0.13, 2.2, '#6d4a30', px, -0.3, pz, G, 8);
  cyl(0.16, 0.2, 0.45, '#3a3d46', 1.6, 0.98, lz - 0.9, G, 10);
  // the tower: plinth of blocks, then four bands, red and white
  const plinth = [], np = 8, pr = 2.35;
  for (let i = 0; i < np; i++) {
    const a0 = i / np * Math.PI * 2, a1 = (i + 1) / np * Math.PI * 2;
    plinth.push({ a: [Math.cos(a0) * pr, Math.sin(a0) * pr], b: [Math.cos(a1) * pr, Math.sin(a1) * pr], t: 0.5, top: () => y0 + 0.95, col: STONE.wall, faces: [{ side: -1, bottom: () => y0 - 0.3 }] });
  }
  G.add(...wallMeshes(plinth, 9701, { fade: [700, 720], key: 'isle' }));
  cyl(2.15, 2.15, 1.2, '#5c584f', 0, y0 + 0.35, 0, G, 16, { line: false });
  const yb = y0 + 0.95, TH = 9.4, rAt = (t) => 1.72 - 0.42 * t + 0.12 * Math.pow(1 - t, 6);
  for (let k = 0; k < 4; k++) {
    const pts = [];
    for (let j = 0; j <= 6; j++) { const t = (k + j / 6) / 4; pts.push(new THREE.Vector2(rAt(t), t * TH)); }
    const lg = new THREE.LatheGeometry(pts, 28);
    add(new THREE.Mesh(lg, flat(k % 2 ? '#d8473a' : '#fbfaf4')), G, 0, yb, 0);
  }
  // the door (facing the landing) and windows up the tower
  const onTower = (a, t, w, h, mk) => {
    const r = rAt(t), g = new THREE.Group(); g.position.set(Math.sin(a) * r, yb + t * TH, Math.cos(a) * r); g.rotation.y = a; G.add(g); mk(g); return g;
  };
  onTower(Math.PI, 0.02, 0, 0, (g) => {
    box(1.15, 2.05, 0.16, '#fbfaf4', 0, 1.0, 0.0, g);
    box(0.85, 1.85, 0.12, tex(planks('#3d6fa8')), 0, 0.93, 0.07, g);
    box(1.45, 0.14, 0.45, '#2c2d33', 0, 2.1, 0.2, g);
    box(0.08, 0.08, 0.06, '#e8c45a', 0.28, 0.95, 0.15, g, { line: false });
  });
  for (const [a, t] of [[Math.PI + 0.9, 0.36], [Math.PI - 0.7, 0.58], [Math.PI + 0.2, 0.82], [0.4, 0.5]]) {
    onTower(a, t, 0, 0, (g) => {
      box(0.62, 0.9, 0.12, '#fbfaf4', 0, 0, 0.0, g);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.68), glass()); gl.position.z = 0.07; g.add(gl);
      box(0.05, 0.68, 0.05, '#fbfaf4', 0, 0, 0.08, g, { line: false, shadow: false });
      box(0.74, 0.08, 0.2, '#fbfaf4', 0, -0.5, 0.06, g);
    });
  }
  // the gallery on corbels, with a railing
  const yg = yb + TH;
  cyl(2.2, 2.05, 0.26, '#2c2d33', 0, yg + 0.13, 0, G, 24);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, c = box(0.22, 0.5, 0.75, '#fbfaf4', Math.sin(a) * 1.55, yg - 0.22, Math.cos(a) * 1.55, G); c.rotation.y = a; }
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; box(0.06, 0.95, 0.06, '#2c2d33', Math.sin(a) * 2.08, yg + 0.73, Math.cos(a) * 2.08, G, { line: false }); }
  for (const yy of [0.62, 1.2]) add(new THREE.Mesh(new THREE.TorusGeometry(2.08, yy > 1 ? 0.05 : 0.03, 5, 40).rotateX(Math.PI / 2), flat('#2c2d33')), G, 0, yg + yy, 0, { line: yy > 1 });
  // the lantern room: a low wall, glass, glazing bars, the domed cap
  cyl(1.2, 1.25, 0.5, '#d8473a', 0, yg + 0.51, 0, G, 16);
  const lampM = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 1.5, 8), new THREE.MeshBasicMaterial({ color: '#fff3c0' })); lampM.position.y = yg + 1.51; G.add(lampM);
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; box(0.08, 1.5, 0.08, '#2c2d33', Math.sin(a) * 1.04, yg + 1.51, Math.cos(a) * 1.04, G, { line: false }); }
  cyl(1.3, 1.3, 0.12, '#2c2d33', 0, yg + 2.32, 0, G, 16);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat('#d8473a'));
  dome.scale.y = 0.75; add(dome, G, 0, yg + 2.38, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), flat('#2c2d33')), G, 0, yg + 3.4, 0);
  cyl(0.03, 0.03, 0.9, '#2c2d33', 0, yg + 3.9, 0, G, 6, { line: false });
  // a turning beam
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 12, 1, true).rotateZ(Math.PI / 2).translate(4.6, 0, 0), new THREE.MeshBasicMaterial({ color: '#fff6cc', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  const bp = new THREE.Group(); bp.userData.keep = true; bp.position.y = yg + 1.51; bp.add(beam); G.add(bp);
  world.anim.push((dt, t) => { bp.rotation.y = t * 0.6; });
  // ferns and flowers on the top (two instanced clumps)
  const tufts = [[], []];
  for (let i = 0; i < 14; i++) {
    const a = R() * 6.28, rr = 2.7 + R() * 1.4, px = Math.cos(a) * rr, pz = Math.sin(a) * rr + 0.3;
    if (pz < -2.5 && Math.abs(px) < 1.4) continue;
    tufts[R() < 0.35 ? 1 : 0].push([px, pz, R() * 6.28, 0.9 + R() * 0.4]);
  }
  [makeClump(9800, TILE.fern, 1.0), makeClump(9801, TILE.flowersY, 0.9)].forEach((mod, k) => {
    const im = new THREE.InstancedMesh(mod.parts[0].geometry, mod.parts[0].material, tufts[k].length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    tufts[k].forEach(([px, pz, r, sc], i) => { q.setFromAxisAngle(V(0, 1, 0), r); m4.compose(V(px, y0 - 0.05, pz), q, V(sc, sc, sc)); im.setMatrixAt(i, m4); });
    im.castShadow = false; im.receiveShadow = true; G.add(im);
  });
  vcFlat(G);
}

// Merge a group's static meshes by material, so a cottage is a handful of
// draw calls instead of hundreds. Anything marked userData.keep (moving
// parts) and instanced meshes are left alone.
function mergeStatic(G) {
  G.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(G.matrixWorld).invert();
  const groups = new Map(), done = [];
  const walk = (o) => {
    if (o.userData.keep) return;
    if (o.isMesh && !o.isInstancedMesh && o !== G) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k) && !(k === 'color' && o.material.vertexColors)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.renderOrder || 0);
      if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, list: [] });
      groups.get(key).list.push(g);
      done.push(o);
    }
    for (const c of o.children.slice()) walk(c);
  };
  walk(G);
  // ink: each part's edges cut against the other parts, so overlapping parts
  // read as one shape (outline.js partEdges); addEdgeLines uses these
  const inked = done.filter((o) => o.userData.outline !== false && !inkSkip(Array.isArray(o.material) ? o.material[0] : o.material));
  if (inked.length) {
    const mats = inked.map((o) => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const solids = inked.map((o, i) => inkSolid(o.geometry, mats[i]));
    const all = { pos: [], n1: [], n2: [], k: [] };
    inked.forEach((o, i) => { const e = partEdges(o.geometry, mats[i], solids, i); for (const k of ['pos', 'n1', 'n2', 'k']) for (const x of e[k]) all[k].push(x); });
    G.userData.inkEdges = all;
  }
  for (const o of done) o.parent && o.parent.remove(o);
  for (const { mat, cast, list } of groups.values()) {
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.castShadow = cast; m.receiveShadow = true;
    G.add(m);
  }
}

// Flower beds [x0, z0, x1, z1]
export const BEDS = [
  [-12.5, -9.5, -9.0, -6.5],
  [3.6, 4.6, 7.0, 7.4],
];

export function buildTown() {
  const world = { colliders: [], use: [], solid: [], walk: [], anim: [], group: new THREE.Group() };
  for (const hs of HOUSES) cottage(hs, world);
  // the lab on its hill, facing west down the stairs
  const facing = -Math.PI / 2;
  const lx = LAB_HILL.x0 + 9 + 9.05, lz = STAIRS.z + 4;
  const before = world.group.children.length;
  buildLab(world, { x: lx, z: lz, y: PLAT_Y, facing });
  for (let i = before; i < world.group.children.length; i++) world.group.children[i].userData.keep = true;
  const c = Math.cos(facing), s = Math.sin(facing);
  const door = [lx + LAB_DOOR.x * c + (LAB_DOOR.z + 3.6) * s, lz - LAB_DOOR.x * s + (LAB_DOOR.z + 3.6) * c];
  world.labDoor = door;
  labGate(world);
  labStairs(world);
  hillPlants(world, door);
  for (const b of BRIDGES) bridge(world, b);
  streamRocks(world);
  laneFurniture(world);
  for (const b of BEDS) bedBorder(b, world);
  // the square: the well, benches, the town sign, fingerposts
  well(1.8, 1.3, world);
  bench(-9.5, 5.5, 0.5, world);
  bench(6.6, 1.0, -Math.PI / 2 - 0.2, world);
  sign(-10.5, -4.2, 0.9, () => welcomeSign(), ['PALLET TOWN', 'Shades of your journey await!'], world, 1.3);
  signpost(-9.5, -15.5, [['ROUTE 1', 0.15 + Math.PI], ['RED\'s house', -Math.PI / 2 + 0.1], ['TOWN SQUARE', 0.2]], world);
  signpost(2.6, 8.6, [['OAK LAB', Math.PI / 2 + 0.3], ['BEACH', 0], ['SQUARE', Math.PI + 0.4]], world);
  signpost(-17.5, 7.0, [['FARM', -Math.PI / 2], ['MAE', 0.2]], world);
  sign(4.4, -42, -0.3, () => routeSign({ num: '1', north: 'VIRIDIAN CITY', south: 'PALLET TOWN' }), ['ROUTE 1', 'PALLET TOWN - VIRIDIAN CITY'], world, 1.1);
  sign(6.9, -41.2, -0.3, () => noticeBoard('TRAINER TIPS', ['Wild POKéMON hide in tall grass.', 'Heal up before a long route.', 'Talk to everyone you meet!'], { style: 'chalk' }),
    ['TRAINER TIPS', 'Wild POKéMON hide in tall grass.', 'Heal up before a long route, and talk to everyone you meet!'], world, 0.9);
  sign(-3.5, 52.5, 0.2, () => noticeBoard('PALLET BEACH', ['Mind the tide pools.', 'Take your litter home.', 'No swimming past the buoys.'], { style: 'pinned', frame: '#5f8fb0', roof: '#3d6fa8' }),
    ['PALLET BEACH', 'The salty breeze smells like adventure.'], world, 0.9);
  dock(world);
  route1(world);
  // the walls, foundations and the islet: one mesh per cell and kind
  world.stoneMeshes = mergeStones(world.group);
  // merge each static piece's meshes by material
  for (const c of world.group.children.slice()) if (!c.userData.keep && !c.isMesh) mergeStatic(c);
  // loose single meshes (stones, slabs) straight under the town group
  const loose = new THREE.Group();
  for (const c of world.group.children.slice()) if (c.isMesh && !c.isInstancedMesh && !c.userData.keep) { world.group.remove(c); loose.add(c); }
  world.group.add(loose); mergeStatic(loose);
  // vector ink on every building and prop (outline.js)
  world.edges = addEdgeLines(world.group);
  cellMerge(world);
  return world;
}

// Fewer draw calls (they cost a phone far more than triangles): every static
// mesh that the screen-space ink pass treats as 'ground' (it has vector ink, or
// draws no line) is merged with the others of the same material in its CELL
// of the map, so a stretch of town is a few draws instead of hundreds, in the
// picture, the shadow map and the ink G-buffer. Meshes that move (found by
// running the town's animations) and anything with its own screen-space line
// are left alone. The originals stay, hidden, for the camera's raycasts.
const CELL = 40;
function cellMerge(world) {
  const root = world.group;
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.userData.inkLines) meshes.push(o); });
  const before = meshes.map((o) => o.matrixWorld.clone());
  for (const t of [1.234, 5.678]) for (const f of world.anim) f(0.1, t);
  root.updateMatrixWorld(true);
  const moving = new Set(meshes.filter((o, i) => !o.matrixWorld.equals(before[i])));
  for (const f of world.anim) f(0, 0);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const mark = (o) => { for (let q = o; q && q !== root.parent; q = q.parent) if (q.userData.outline !== undefined) return q.userData.outline; return undefined; };
  const shown = (o) => { for (let q = o; q && q !== root.parent; q = q.parent) if (!q.visible) return false; return true; };
  // Materials that differ only in colour share one draw: the colour moves into
  // the vertices (vertex colours times a white material gives the same
  // picture). Not for materials that read their own colour in the shader
  // (cel 'detail' or 'ao') or already use vertex colours.
  const progKey = (m) => (m.customProgramCacheKey ? m.customProgramCacheKey() : '');
  const bakeable = (m) => !m.vertexColors && !/"(detail|ao)":/.test(progKey(m));
  const matKey = (m, bake) => [m.type, progKey(m), bake ? 'vc' : m.color?.getHexString(), m.emissive?.getHexString(), m.map?.uuid,
    m.side, m.vertexColors, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.depthTest, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.fog, m.flatShading, m.toneMapped].join('|');
  const shared = new Map();
  const matFor = (m, bake) => {
    const k = matKey(m, bake);
    if (!shared.has(k)) {
      let nm = m;
      if (bake) {
        nm = m.clone();
        nm.onBeforeCompile = m.onBeforeCompile; nm.customProgramCacheKey = m.customProgramCacheKey;
        nm.color.setRGB(1, 1, 1); nm.vertexColors = true;
      }
      shared.set(k, nm);
    }
    return shared.get(k);
  };
  const cells = new Map(), c = new THREE.Vector3();
  for (const o of meshes) {
    const mk = mark(o), m = o.material;
    if (moving.has(o) || !shown(o) || Array.isArray(m) || (mk !== 'ground' && mk !== false) || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) continue;
    const bake = bakeable(m);
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    c.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const attrs = Object.keys(o.geometry.attributes).filter((k) => k !== 'color' || !bake).sort().join() + (o.geometry.index ? '#i' : '');
    const key = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}|${matKey(m, bake)}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${mk}|${o.layers.mask}|${attrs}`;
    if (!cells.has(key)) cells.set(key, { m: matFor(m, bake), bake, o, mk, list: [] });
    cells.get(key).list.push(o);
  }
  for (const { m, bake, o: first, mk, list } of cells.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (bake) {
        const n = g.attributes.position.count, col = new Float32Array(n * 3), cc = o.material.color;
        for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      return g;
    });
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    const M = new THREE.Mesh(g, m);
    M.castShadow = first.castShadow; M.receiveShadow = first.receiveShadow; M.renderOrder = first.renderOrder;
    M.layers.mask = first.layers.mask; M.userData.outline = mk; M.userData.cell = true;
    M.raycast = () => {};
    root.add(M);
    for (const o of list) o.visible = false;
  }
}
