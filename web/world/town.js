// Pallet Town as the anime draws it: clapboard cottages with steep red-tiled
// roofs, white trim and picket fences, and Professor Oak's lab on its green
// hill (a barrel-roofed hall, a round tower with a windmill, winding stone
// stairs through the bushes). Everything is cel shaded with painted textures
// and a thin ink outline. Returns the meshes plus colliders, walkable decks
// and things to read or use.
import * as THREE from 'three';
import { height, rng, LAB_HILL, LAB_STAIRS, STEP, stairDist } from './terrain.js';
import { toon } from './toon.js';
import { makeTree, makeBush, makeClump, TILE } from './foliage.js';

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
function signTexture(lines, { bg = '#f4ead2', fg = '#4a3524' } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = shade(bg, 0.75); x.lineWidth = 10; x.strokeRect(8, 8, 496, 240);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const big = lines.length > 1 ? 50 : 60;
  lines.forEach((l, i) => {
    x.font = `${i ? 700 : 700} ${i ? 34 : big}px "Pixelify Sans", system-ui, sans-serif`;
    x.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * 64);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- materials ----------
const mats = new Map();
function M(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
const BUILD = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
const flat = (col) => M('c' + col, () => toon(col, { cel: BUILD }));
const tex = (t, col = '#ffffff') => M(t.uuid + col, () => toon(col, { map: t, cel: BUILD }));
const glass = () => M('glass', () => new THREE.MeshBasicMaterial({ map: glassTex() }));
const INK = new THREE.MeshBasicMaterial({ color: '#2f2b36', side: THREE.BackSide });

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
// an ink outline: the same convex shape a little bigger, drawn inside out
function ink(mesh, w = 0.035) {
  const g = mesh.geometry; g.computeBoundingBox();
  const b = g.boundingBox, s = b.getSize(V(0, 0, 0)), c = b.getCenter(V(0, 0, 0));
  const o = new THREE.Mesh(g, INK);
  o.position.copy(c).multiplyScalar(-1);
  const pivot = new THREE.Group();
  pivot.position.copy(c);
  pivot.scale.set((s.x + 2 * w) / Math.max(s.x, 1e-3), (s.y + 2 * w) / Math.max(s.y, 1e-3), (s.z + 2 * w) / Math.max(s.z, 1e-3));
  pivot.add(o);
  mesh.add(pivot);
  return mesh;
}
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
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = rot;
  for (const p of model.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  parent.add(g);
  return g;
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

// White picket fence from a to b (local x, z), with two rails.
function picketFence(parent, ax, az, bx, bz, world, ox, oz, col = '#fbfaf4') {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.32));
  const ang = Math.atan2(bz - az, bx - ax);
  const pick = new THREE.Shape(); pick.moveTo(-0.06, 0); pick.lineTo(0.06, 0); pick.lineTo(0.06, 0.95); pick.lineTo(0, 1.08); pick.lineTo(-0.06, 0.95); pick.lineTo(-0.06, 0);
  const pg = new THREE.ExtrudeGeometry(pick, { depth: 0.04, bevelEnabled: false });
  const im = new THREE.InstancedMesh(pg, flat(col), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    m4.compose(V(x, height(ox + x, oz + z) - 0.05, z), q, V(1, 1, 1)); im.setMatrixAt(i, m4);
  }
  im.castShadow = true; im.receiveShadow = true; parent.add(im);
  const mid = height(ox + (ax + bx) / 2, oz + (az + bz) / 2);
  for (const ry of [0.32, 0.72]) {
    const r = box(len, 0.08, 0.05, col, (ax + bx) / 2, mid + ry, (az + bz) / 2, parent, { line: false });
    r.position.y -= 0; r.rotation.y = -ang; r.translateZ(-0.05);
  }
  world.colliders.push({ box: true, x: ox + (ax + bx) / 2, z: oz + (az + bz) / 2, hw: Math.abs(bx - ax) / 2 + 0.1, hd: Math.abs(bz - az) / 2 + 0.1 });
}

// ---------- the cottages ----------
// Ash's house from the show: pale clapboards, a steep red gable facing the
// street, dormers in the side slope, a porch, a railed deck, a picket fence
// and a vegetable garden. Faces +z. side = which side the garden is on.
function cottage({ x, z, wall, roof, door, name, seed, side = -1, lines }, world) {
  const G = new THREE.Group(); G.position.set(x, height(x, z), z); world.group.add(G);
  const R = rng(seed);
  const W = 7.2, D = 6.4, base = 0.45, wallH = 3.5, rise = 4.6, y0 = base + wallH;
  const sid = tex(siding(wall)), trim = '#fbfaf4';
  const roofMat = tex(tiles(roof));
  // stone foundation and the walls
  box(W + 0.3, base + 0.3, D + 0.3, tex(stones('#cfc8b6')), 0, base / 2 - 0.15, 0, G);
  box(W, wallH, D, sid, 0, base + wallH / 2, 0, G);
  gableWall(G, W, rise, y0, D / 2, sid);
  gableWall(G, W, rise, y0, -D / 2, sid, -1);
  gableRoof(G, W, D, y0, rise, roofMat, trim);
  // corner boards and the frieze under the eaves
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.22, wallH, 0.22, trim, sx * W / 2, base + wallH / 2, sz * D / 2, G, { line: false });
  for (const sx of [-1, 1]) box(0.14, 0.24, D + 0.1, trim, sx * (W / 2 + 0.04), y0 - 0.1, 0, G, { line: false });
  box(W + 0.1, 0.24, 0.14, trim, 0, y0 - 0.06, D / 2 + 0.06, G, { line: false });
  // front: a big window, the gable window, the porch over the door
  const front = D / 2 + 0.06;
  const big = windowAt(G, side * 1.7, base + 1.75, front, 2.3, 1.7, 4, 3);
  windowAt(G, 0, y0 + 1.5, front, 1.0, 1.2, 2, 2);
  const dx = -side * 1.75;
  box(1.5, 2.3, 0.14, tex(planks(door)), dx, base + 1.15, front, G);
  for (const k of [-0.36, 0.36]) box(0.5, 0.8, 0.04, door, dx + k, base + 1.6, front + 0.08, G, { line: false, shadow: false });
  box(0.06, 2.3, 0.04, shade(door, 0.6), dx, base + 1.15, front + 0.09, G, { line: false, shadow: false });
  box(1.8, 0.16, 0.16, trim, dx, base + 2.4, front + 0.02, G, { line: false });
  // porch: two posts and a small gable roof
  const pg = new THREE.Group(); pg.position.set(dx, 0, front + 0.85); G.add(pg);
  for (const k of [-1.05, 1.05]) box(0.16, 2.5, 0.16, trim, k, base + 1.25, 0.65, pg);
  const pr = new THREE.Group(); pr.position.set(0, 0, 0); pg.add(pr);
  gableRoof(pr, 2.3, 1.7, base + 2.6, 0.9, roofMat, trim, 0.15, 0.1, 0.12);
  gableWall(pr, 2.3, 0.9, base + 2.6, 0.85, flat(trim));
  // wall lamp beside the door
  const lamp = box(0.18, 0.28, 0.18, '#3a3d46', dx - side * 1.0, base + 2.0, front + 0.14, G);
  lamp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: '#ffe7a6' })));
  // flower box under the big window
  box(2.4, 0.3, 0.36, tex(planks('#c99a62')), side * 1.7, base + 0.62, front + 0.22, G);
  for (let k = 0; k < 5; k++) plant(makeClump(seed + k, k % 2 ? TILE.flowersR : TILE.flowersY, 0.6), G, side * 1.7 - 1.0 + k * 0.5, base + 0.75, front + 0.24, 1);
  // side windows and the dormers in the slope over the garden side
  for (const sx of [-1, 1]) for (const zz of [-1.4, 1.4]) {
    const w = windowAt(G, sx * (W / 2 + 0.06), base + 1.9, zz, 1.0, 1.3, 2, 2);
    w.rotation.y = sx * Math.PI / 2;
  }
  const ang = Math.atan2(rise, W / 2);
  for (const zz of [-1.3, 1.3]) {
    const dg = new THREE.Group(); G.add(dg);
    const hx = side * 2.0, hy = y0 + (W / 2 - 2.0) * Math.tan(ang) - 0.6;   // where it meets the slope
    dg.position.set(hx, hy, zz); dg.rotation.y = side * Math.PI / 2;
    box(1.4, 1.5, 1.6, sid, 0, 0.75, -0.6, dg);
    const w = windowAt(dg, 0, 0.8, 0.22, 0.7, 0.8, 2, 2); void w;
    const rg = new THREE.Group(); rg.position.set(0, 0, -0.6); rg.rotation.y = 0; dg.add(rg);
    gableRoof(rg, 1.4, 1.6, 1.5, 0.75, roofMat, trim, 0.12, 0.12, 0.1);
    gableWall(rg, 1.4, 0.75, 1.5, 0.8, sid);
  }
  // chimney at the back
  box(0.8, 3.2, 0.8, tex(bricks('#b7604a')), -side * 1.6, y0 + 2.4, -1.8, G);
  box(1.0, 0.18, 1.0, '#d9cfbd', -side * 1.6, y0 + 4.05, -1.8, G);
  // front deck with a white railing and steps to the path
  const deckY = base + 0.05, dz0 = D / 2 + 0.05, dz1 = D / 2 + 2.3;
  box(W + 0.6, 0.2, dz1 - dz0, tex(planks('#c99a62')), 0, deckY, (dz0 + dz1) / 2, G);
  box(W + 0.6, deckY, 0.2, trim, 0, deckY / 2 - 0.05, dz1 - 0.1, G, { line: false });
  const rail = (ax, bx, zz) => {
    const n = Math.max(2, Math.round(Math.abs(bx - ax) / 0.22));
    for (let i = 0; i <= n; i++) box(0.07, 0.8, 0.07, trim, ax + (bx - ax) * i / n, deckY + 0.5, zz, G, { line: false, shadow: false });
    box(Math.abs(bx - ax) + 0.12, 0.1, 0.12, trim, (ax + bx) / 2, deckY + 0.92, zz, G);
  };
  rail(-W / 2 - 0.25, dx - 0.95, dz1 - 0.1); rail(dx + 0.95, W / 2 + 0.25, dz1 - 0.1);
  if (dx - 0.95 < -W / 2) rail(-W / 2 - 0.25, -W / 2 - 0.25, dz1);  // keeps the shape when the door is at the end
  for (let s = 0; s < 2; s++) box(1.8, 0.2, 0.5, tex(stones('#d6cfbd')), dx, deckY - 0.18 - s * 0.2, dz1 + 0.25 + s * 0.45, G);
  world.walk.push({ x0: x - W / 2 - 0.3, x1: x + W / 2 + 0.3, z0: z + dz0, z1: z + dz1, y: G.position.y + deckY + 0.1 });
  world.colliders.push({ box: true, x, z: z - 0.05, hw: W / 2 + 0.2, hd: D / 2 + 0.2 });
  for (const xx of [-W / 2 - 0.25, dx - 0.95, dx + 0.95, W / 2 + 0.25].filter((v, i, a) => i % 2 === 0 || true)) void xx;
  world.colliders.push({ box: true, x: x + (-W / 2 - 0.25 + dx - 0.95) / 2, z: z + dz1 - 0.1, hw: Math.max(0.05, (dx - 0.95 + W / 2 + 0.25) / 2), hd: 0.12 });
  world.colliders.push({ box: true, x: x + (W / 2 + 0.25 + dx + 0.95) / 2, z: z + dz1 - 0.1, hw: Math.max(0.05, (W / 2 + 0.25 - dx - 0.95) / 2), hd: 0.12 });
  world.use.push({ x: x + dx, z: z + D / 2 + 1.1, r: 1.0, label: 'Door', lines });
  // the yard: picket fence round it, a gate on the path, stepping stones
  const fx = 8.4, fz0 = -5.2, fz1 = 8.6;
  const gate = 0;   // the path to the street runs down x = 0... toward the door
  void gate;
  picketFence(G, -fx, fz1, dx - 0.9, fz1, world, x, z);
  picketFence(G, dx + 0.9, fz1, fx, fz1, world, x, z);
  picketFence(G, -fx, fz0, -fx, fz1, world, x, z);
  picketFence(G, fx, fz0, fx, fz1, world, x, z);
  for (const k of [-1, 1]) box(0.22, 1.25, 0.22, trim, dx + k * 0.95, height(x + dx, z + fz1) - G.position.y + 0.6, fz1, G);
  for (let s = 0; s < 5; s++) {
    const sz = dz1 + 0.95 + s * 0.85, sx = dx + Math.sin(s * 1.7) * 0.18;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.12, 10), flat('#d8d0bf'));
    st.scale.set(1, 1, 0.8); st.rotation.y = R() * 3;
    add(st, G, sx, height(x + sx, z + sz) - G.position.y + 0.02, sz, { shadow: false });
  }
  // mailbox by the gate
  const mb = new THREE.Group(); mb.position.set(dx + side * 1.6, height(x + dx + side * 1.6, z + fz1 + 0.4) - G.position.y, fz1 + 0.4); G.add(mb);
  box(0.1, 1.1, 0.1, '#fbfaf4', 0, 0.55, 0, mb);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14, 1, false, 0, Math.PI), flat('#ec8a2e'));
  body.rotation.z = Math.PI / 2; add(body, mb, 0, 1.15, 0);
  box(0.44, 0.24, 0.6, '#ec8a2e', 0, 1.03, 0, mb);
  box(0.04, 0.2, 0.06, '#d83a2e', 0.24, 1.3, 0.1, mb, { line: false });
  world.colliders.push({ x: x + dx + side * 1.6, z: z + fz1 + 0.4, r: 0.2 });
  world.use.push({ x: x + dx + side * 1.6, z: z + fz1 + 1.2, r: 0.8, label: 'Look', lines: [`${name}'s mailbox. It's empty.`] });
  // vegetable garden on the side: a little fenced bed of tomato plants
  const gx = side * 6.2, gz = 1.0;
  box(2.6, 0.25, 4.6, tex(planks('#8d6a46')), gx, height(x + gx, z + gz) - G.position.y + 0.05, gz, G, { line: false });
  const soil = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 4.4), flat('#7a5a3c')); add(soil, G, gx, height(x + gx, z + gz) - G.position.y + 0.18, gz, { line: false });
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const px = gx - 0.6 + r * 1.2, pz = gz - 1.6 + k * 1.05, py = height(x + px, z + pz) - G.position.y + 0.2;
    box(0.05, 1.2, 0.05, '#c9a876', px, py + 0.6, pz, G, { line: false });
    plant(makeBush(seed * 10 + r * 4 + k, { size: 0.5 }), G, px, py, pz, 1, R() * 6);
    for (let t = 0; t < 4; t++) {
      const tm = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flat('#e8402e'));
      add(tm, G, px + (R() - 0.5) * 0.5, py + 0.4 + R() * 0.5, pz + (R() - 0.5) * 0.5, { line: false });
    }
  }
  world.colliders.push({ box: true, x: x + gx, z: z + gz, hw: 1.3, hd: 2.3 });
  // shrubs: round trimmed bushes along the deck, a cone topiary, cypresses
  for (const [px, pz, s] of [[-W / 2 - 1.0, dz1 - 0.3, 1.0], [W / 2 + 1.0, dz1 - 0.3, 1.0], [-side * (W / 2 + 0.9), -1.5, 1.2]]) {
    plant(makeBush(seed + 50 + px, { size: s }), G, px, height(x + px, z + pz) - G.position.y, pz);
    world.colliders.push({ x: x + px, z: z + pz, r: 0.8 * s });
  }
  for (const [px, pz, k, s] of [[-side * 6.6, 6.8, 'bushy', 0.85], [-side * 6.8, -3.8, 'lombardy', 0.5], [side * 7.0, -4.3, 'cypress', 0.7]]) {
    const m = makeTree(k, seed + Math.round(px * 3 + pz));
    plant(m, G, px, height(x + px, z + pz) - G.position.y, pz, s);
    world.colliders.push({ x: x + px, z: z + pz, r: Math.max(0.4, m.trunk * s + 0.15) });
  }
  world.solid.push(G);
  return G;
}

// ---------- Professor Oak's lab ----------
function lab(world) {
  const cx = 25, cz = 20.6, top = height(LAB_HILL.x, LAB_HILL.z);
  const G = new THREE.Group(); G.position.set(cx, top, cz); world.group.add(G);
  const wall = tex(plaster('#f6f0e2')), roofMat = tex(tiles('#d4473a')), trim = '#fbfaf4';
  const L = 11, W = 6.6, base = 0.5, wallH = 3.2, r = W / 2 + 0.25;
  box(L + 0.4, base + 0.4, W + 0.4, tex(stones('#cfc8b6')), 0, base / 2 - 0.2, 0, G);
  box(L, wallH, W, wall, 0, base + wallH / 2, 0, G);
  box(L + 0.2, 0.25, W + 0.2, trim, 0, base + wallH, 0, G);
  // barrel vault: a half cylinder along x, end walls, and ribs
  const vault = new THREE.CylinderGeometry(r, r, L + 0.7, 32, 1, true, -Math.PI / 2, Math.PI);
  { const p = vault.attributes.position, uv = vault.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getY(i) / 1.5, Math.atan2(p.getX(i), p.getZ(i)) * r / 1.5); }
  vault.rotateZ(Math.PI / 2);
  const vm = roofMat.clone(); vm.side = THREE.DoubleSide;
  const vmesh = new THREE.Mesh(vault, vm); add(vmesh, G, 0, base + wallH + 0.1, 0, { line: false });
  const vin = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.06, L + 0.72, 32, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), INK);
  vin.position.set(0, base + wallH + 0.1, 0); G.add(vin);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r - 0.2, 32, 0, Math.PI), wall);
    cap.rotation.y = sx * Math.PI / 2; cap.position.set(sx * L / 2, base + wallH + 0.1, 0); G.add(cap);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.12, 6, 32, Math.PI), flat(trim));
    rim.rotation.y = Math.PI / 2; add(rim, G, sx * (L / 2 + 0.35), base + wallH + 0.1, 0, { line: false });
    // a round window in each end
    const rw = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), glass()); rw.rotation.y = sx * Math.PI / 2;
    rw.position.set(sx * (L / 2 + 0.01), base + wallH + 1.2, 0); G.add(rw);
    const rf = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 6, 24), flat(trim)); rf.rotation.y = Math.PI / 2;
    rf.position.set(sx * (L / 2 + 0.03), base + wallH + 1.2, 0); G.add(rf);
  }
  for (let k = -2; k <= 2; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.07, 6, 32, Math.PI), flat('#a93a30'));
    rib.rotation.y = Math.PI / 2; rib.position.set(k * 2.2, base + wallH + 0.1, 0); G.add(rib);
  }
  // arched windows along both long sides, the door in the middle of the front
  for (const sz of [-1, 1]) for (const k of [-4, -2.2, 2.2, 4]) {
    const w = archWindow(G, k, base + 1.7, sz * (W / 2 + 0.02), 1.0, 2.0);
    if (sz < 0) w.rotation.y = Math.PI;
  }
  const front = W / 2 + 0.05;
  const dm = new THREE.Group(); dm.position.set(0, 0, front); G.add(dm);
  box(2.6, 3.3, 0.6, wall, 0, base + 1.65, 0.25, dm);
  box(2.8, 0.25, 0.8, trim, 0, base + 3.35, 0.25, dm);
  box(1.7, 2.5, 0.1, tex(planks('#8a5a3a')), 0, base + 1.25, 0.56, dm);
  box(0.05, 2.5, 0.04, '#5a3a26', 0, base + 1.25, 0.62, dm, { line: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: signTexture(['OAK POKéMON LAB'], { bg: '#2f5a4a', fg: '#f4ead2' }) }));
  plate.position.set(0, base + 2.85, 0.56); dm.add(plate);
  for (let s = 0; s < 3; s++) box(3.0 - s * 0.2, 0.18, 0.5, tex(stones('#d6cfbd')), 0, base - 0.1 - s * 0.18, front + 0.8 + s * 0.45, G);
  // the round tower with a windmill
  const tx = -L / 2 - 1.2, tz = -1.0, tH = 9.5;
  const tw = new THREE.Mesh(wuv(new THREE.CylinderGeometry(2.0, 2.15, tH, 24), 0.5), wall); add(tw, G, tx, tH / 2, tz);
  for (const y of [3.4, 6.6, tH - 0.2]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(2.18, 2.18, 0.22, 24), flat(trim)); add(b, G, tx, y, tz, { line: false }); }
  for (const [a, y] of [[0.9, 2.2], [0.5, 5.0], [1.6, 8.0]]) {
    const w = archWindow(G, tx + Math.sin(a) * 2.05, y, tz + Math.cos(a) * 2.05, 0.7, 1.2); w.rotation.y = a;
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.6, 24), roofMat); add(cone, G, tx, tH + 1.3, tz);
  { const p = cone.geometry.attributes.position, uv = cone.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, Math.atan2(p.getX(i), p.getZ(i)) * 2, p.getY(i) / 1.5); }
  // windmill: mast, nacelle and three slim blades turning in the wind
  cyl(0.12, 0.18, 2.4, '#e9ece8', tx, tH + 3.4, tz, G, 10);
  const nac = new THREE.Group(); nac.position.set(tx, tH + 4.7, tz); nac.rotation.y = 0.6; G.add(nac);
  box(0.45, 0.45, 1.2, '#f4f5f1', 0, 0, 0, nac);
  const hub = new THREE.Group(); hub.position.z = 0.7; nac.add(hub);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), flat('#f4f5f1')), hub, 0, 0, 0);
  for (let b = 0; b < 3; b++) {
    const bl = new THREE.Group(); bl.rotation.z = b * Math.PI * 2 / 3; hub.add(bl);
    const s = new THREE.Shape(); s.moveTo(-0.12, 0); s.quadraticCurveTo(-0.22, 1.2, -0.05, 3.2); s.lineTo(0.06, 3.2); s.quadraticCurveTo(0.14, 1.0, 0.12, 0); s.lineTo(-0.12, 0);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }), flat('#fbfbf8'));
    add(m, bl, 0, 0.15, 0);
  }
  world.anim.push((dt, t) => { hub.rotation.z = -t * 1.6; });
  // a weather vane-ish antenna and a little greenhouse by the hall
  const gh = new THREE.Group(); gh.position.set(L / 2 + 2.2, 0, 1.6); G.add(gh);
  box(2.6, 0.3, 3.2, tex(stones('#cfc8b6')), 0, 0.15, 0, gh);
  const gm = new THREE.MeshBasicMaterial({ color: '#cfeff2', transparent: true, opacity: 0.45 });
  const gb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 3.0), gm); gb.position.y = 1.1; gh.add(gb);
  const groof = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.0, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), gm);
  groof.position.y = 1.9; gh.add(groof);
  for (const k of [-1.4, -0.47, 0.47, 1.4]) box(2.45, 0.06, 0.06, '#fbfaf4', 0, 1.9, k, gh, { line: false });
  for (const sx of [-1.2, 1.2]) for (const k of [-1.5, 1.5]) box(0.07, 1.6, 0.07, '#fbfaf4', sx, 1.1, k, gh, { line: false });
  for (let k = 0; k < 4; k++) plant(makeBush(700 + k, { size: 0.45, flowers: k % 2 ? TILE.flowersR : null }), gh, (k % 2 - 0.5) * 1.1, 0.3, -1 + k * 0.65);
  world.colliders.push({ box: true, x: cx + L / 2 + 2.2, z: cz + 1.6, hw: 1.4, hd: 1.7 });
  // the courtyard: paving from the stairs to the door, round bushes
  const paveTo = [cx, cz + W / 2 + 2.6];
  const start = LAB_STAIRS[LAB_STAIRS.length - 1];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14, px = start[0] + (paveTo[0] - start[0]) * t, pz = start[1] + (paveTo[1] - start[1]) * t + Math.sin(t * Math.PI) * 1.2;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.1, 9), flat('#ddd5c4')); st.scale.z = 0.7; st.rotation.y = k;
    add(st, world.group, px, height(px, pz) + 0.03, pz, { shadow: false });
  }
  world.colliders.push({ box: true, x: cx, z: cz, hw: L / 2 + 0.3, hd: W / 2 + 0.3 });
  world.colliders.push({ box: true, x: cx, z: cz + front, hw: 1.4, hd: 0.6 });
  world.colliders.push({ x: cx + tx, z: cz + tz, r: 2.3 });
  world.use.push({ x: cx, z: cz + W / 2 + 1.6, r: 1.2, label: 'Door', lines: ['OAK POKéMON RESEARCH LAB', 'The door is locked. PROF. OAK must be out!'] });
  world.solid.push(G);
}

// Brick-pillar gate posts and an open black iron gate at the foot of the stairs.
function labGate(world) {
  const [gx, gz] = LAB_STAIRS[0];
  const G = new THREE.Group(); G.position.set(gx + 0.6, height(gx + 0.6, gz), gz); G.rotation.y = Math.PI / 2; world.group.add(G);
  for (const s of [-1, 1]) {
    box(0.8, 2.2, 0.8, tex(bricks('#b7604a')), s * 1.6, 1.1, 0, G);
    box(1.0, 0.2, 1.0, '#d9cfbd', s * 1.6, 2.3, 0, G);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), flat('#d9cfbd')), G, s * 1.6, 2.6, 0);
    // iron gate leaf, swung open
    const leaf = new THREE.Group(); leaf.position.set(s * 1.2, 0, 0.2); leaf.rotation.y = s * 1.9; G.add(leaf);
    for (let k = 0; k < 6; k++) box(0.04, 1.6 + Math.sin(k / 5 * Math.PI) * 0.25, 0.04, '#2c2d33', -s * (0.1 + k * 0.2), 0.95, 0, leaf, { line: false });
    for (const y of [0.35, 1.5]) box(1.15, 0.06, 0.06, '#2c2d33', -s * 0.6, y, 0, leaf, { line: false });
    world.colliders.push({ x: gx + 0.6, z: gz + s * 1.6, r: 0.55 });
  }
  // low brick walls running off along the foot of the hill
  for (const s of [-1, 1]) {
    box(3.0, 0.9, 0.4, tex(bricks('#b7604a')), s * 3.6, 0.45, 0, G);
    world.colliders.push({ box: true, x: gx + 0.6, z: gz + s * 3.6, hw: 0.3, hd: 1.6 });
  }
  const sg = sign(gx - 1.6, gz + 3.4, -Math.PI / 2 + 0.25, ['OAK POKéMON', 'RESEARCH LAB'], ['OAK POKéMON RESEARCH LAB'], world);
  void sg;
}

// Stone stairs winding up the hill, step by step on the terrain's steps.
function labStairs(world) {
  const geo = [];
  let along = 0;
  const pts = [];
  for (let i = 0; i < LAB_STAIRS.length - 1; i++) {
    const [ax, az] = LAB_STAIRS[i], [bx, bz] = LAB_STAIRS[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 0.25) pts.push([ax + (bx - ax) * d / len, az + (bz - az) * d / len, Math.atan2(bx - ax, bz - az), along + d]);
    along += len;
  }
  // one slab per step level
  let last = -99;
  const m = tex(stones('#d8d0bf'));
  for (const [x, z, a] of pts) {
    const y = height(x, z);
    if (Math.abs(y - last) < STEP * 0.5) continue;
    last = y;
    const g = wuv(new THREE.BoxGeometry(2.4, 0.9, 0.9), 0.6);
    g.rotateY(a); g.translate(x, y - 0.42, z); geo.push(g);
  }
  for (const g of geo) { const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; world.group.add(mesh); }
}

// The lab hill wrapped in dense round bushes, cypresses and trees; only the
// stairs get through. Drawn as instanced meshes.
function hillPlants(world) {
  const R = rng(515);
  const models = [makeBush(901, { size: 1.3 }), makeBush(902, { size: 1.6 }), makeBush(903, { size: 1.1, flowers: TILE.flowersR }), makeBush(904, { size: 1.8 }), makeBush(905, { size: 1.2, flowers: TILE.flowersY })];
  const pts = models.map(() => []);
  for (let i = 0; i < 2600; i++) {
    const a = R() * Math.PI * 2, rr = LAB_HILL.top + 0.6 + R() * (LAB_HILL.r - LAB_HILL.top - 0.3);
    const x = LAB_HILL.x + Math.cos(a) * rr, z = LAB_HILL.z + Math.sin(a) * rr / 1.1;
    if (stairDist(x, z) < 1.9) continue;
    if (Math.hypot(x - LAB_STAIRS[0][0], z - LAB_STAIRS[0][1]) < 4.5) continue;
    if (Math.abs(x) < 2.6 && z > 20) continue;   // the main road
    if (z > 37 && x < 14) continue;
    const near = pts.flat().some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < 1.6);
    if (near) continue;
    pts[Math.floor(R() * models.length)].push([x, z, R() * 6.28, 0.8 + R() * 0.5]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  models.forEach((mod, k) => {
    const list = pts[k]; if (!list.length) return;
    for (const p of mod.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, list.length);
      list.forEach(([x, z, r, s], i) => { q.setFromAxisAngle(V(0, 1, 0), r); m4.compose(V(x, height(x, z) - 0.1, z), q, V(s, s, s)); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true; world.group.add(im);
    }
    for (const [x, z, , s] of list) world.colliders.push({ x, z, r: 0.75 * s });
  });
  // cypresses and broad trees on the hill around the lab
  for (const [x, z, k, s] of [[14.5, 14, 'cypress', 1.0], [16.5, 11, 'lombardy', 0.6], [33.5, 13, 'tiered', 0.8], [36.5, 19, 'cypress', 1.1], [35.5, 27, 'lombardy', 0.55], [30.5, 32, 'shade', 0.7], [19, 10, 'linden', 0.7], [27, 9.5, 'cypress', 1.1]]) {
    const m = makeTree(k, Math.round(x * 13 + z));
    plant(m, world.group, x, height(x, z) - 0.1, z, s, x);
    world.colliders.push({ x, z, r: Math.max(0.6, m.trunk * s + 0.15) });
  }
}

// ---------- town furniture ----------
function sign(x, z, face, title, lines, world) {
  const g = new THREE.Group(); g.position.set(x, height(x, z), z); g.rotation.y = face; world.group.add(g);
  for (const s of [-0.8, 0.8]) box(0.14, 1.6, 0.14, '#8a5f3c', s, 0.8, 0, g);
  box(2.0, 1.1, 0.12, tex(planks('#c99a62')), 0, 1.45, 0, g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: signTexture(title) }));
  scr.position.set(0, 1.45, 0.07); g.add(scr);
  world.colliders.push({ x, z, r: 0.5 });
  world.use.push({ x: x + Math.sin(face) * 1.0, z: z + Math.cos(face) * 1.0, r: 1.3, label: 'Read', lines });
  return g;
}
function lamp(x, z, world) {
  const g = new THREE.Group(); g.position.set(x, height(x, z), z); world.group.add(g);
  cyl(0.16, 0.2, 0.4, '#2f4a40', 0, 0.2, 0, g, 10);
  cyl(0.06, 0.08, 3.0, '#2f4a40', 0, 1.8, 0, g, 8);
  box(0.36, 0.08, 0.36, '#2f4a40', 0, 3.3, 0, g);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.26), new THREE.MeshBasicMaterial({ color: '#fff1c4' })); add(glow, g, 0, 3.55, 0, { shadow: false });
  add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 4), flat('#2f4a40')), g, 0, 3.86, 0).rotation.y = Math.PI / 4;
  world.colliders.push({ x, z, r: 0.2 });
}
function bench(x, z, rot, world) {
  const g = new THREE.Group(); g.position.set(x, height(x, z), z); g.rotation.y = rot; world.group.add(g);
  const wood = tex(planks('#c99a62'));
  for (let i = 0; i < 3; i++) box(1.8, 0.06, 0.13, wood, 0, 0.48, -0.16 + i * 0.16, g, { line: false });
  for (let i = 0; i < 2; i++) box(1.8, 0.13, 0.05, wood, 0, 0.75 + i * 0.2, -0.28, g, { line: false });
  for (const sx of [-0.8, 0.8]) { box(0.07, 0.48, 0.5, '#2f4a40', sx, 0.24, 0, g); box(0.07, 0.6, 0.07, '#2f4a40', sx, 0.8, -0.3, g); }
  world.colliders.push({ x, z, r: 0.95 });
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
function dock(world) {
  const g = new THREE.Group(); world.group.add(g);
  const x = 6, z0 = 58, z1 = 78, y = -0.35;
  const wood = tex(planks('#c99a62'));
  box(3.2, 0.25, z1 - z0, wood, x, y, (z0 + z1) / 2, g);
  for (let z = z0 + 1; z <= z1; z += 3) for (const sx of [-1.55, 1.55]) cyl(0.13, 0.13, 2.6, '#8a5f3c', x + sx, y - 0.6, z, g, 8);
  for (const sx of [-1.55, 1.55]) box(0.1, 0.1, z1 - z0, '#8a5f3c', x + sx, y + 0.65, (z0 + z1) / 2, g, { line: false });
  // a little rowing boat
  const boat = new THREE.Group(); boat.position.set(x + 3.2, -0.65, z1 - 4); boat.rotation.y = 0.25; g.add(boat);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 3.6, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), flat('#f4f1e6'));
  hull.scale.set(1, 0.6, 1); add(hull, boat, 0, 0.3, 0);
  box(1.75, 0.12, 3.62, '#d84a3a', 0, 0.32, 0, boat, { line: false });
  box(1.6, 0.08, 0.3, tex(planks('#c99a62')), 0, 0.2, 0.4, boat, { line: false });
  world.anim.push((k, time) => { boat.position.y = -0.65 + Math.sin(time * 1.1) * 0.06; boat.rotation.z = Math.sin(time * 0.9) * 0.03; });
  world.walk.push({ x0: x - 1.6, x1: x + 1.6, z0, z1, y: y + 0.13 });
  world.use.push({ x, z: z1 - 0.8, r: 1.6, label: 'Look', lines: ['The sea stretches south toward CINNABAR ISLAND.', 'You\'d need a POKéMON that can SURF to go any further.'] });
}

// Flower beds [x0, z0, x1, z1]
export const BEDS = [
  [-27.4, 8.6, -10.6, 16.4],
];

export function buildTown() {
  const world = { colliders: [], use: [], solid: [], walk: [], anim: [], group: new THREE.Group() };
  cottage({ x: -20, z: -17, wall: '#a9cbe8', roof: '#d8473a', door: '#f4f1e6', name: 'RED', seed: 10, side: -1,
    lines: ['RED\'s house. Home sweet home!', 'MOM is out shopping. You can come back in later.'] }, world);
  cottage({ x: 20, z: -17, wall: '#f2e2b8', roof: '#3f8f78', door: '#8a5a3a', name: 'BLUE', seed: 20, side: 1,
    lines: ['BLUE\'s house.', 'Nobody answers. BLUE is probably at the lab already.'] }, world);
  lab(world);
  labGate(world);
  labStairs(world);
  hillPlants(world);
  for (const b of BEDS) bedBorder(b, world);
  sign(-7, 6.5, 0, ['PALLET TOWN', 'Shades of your journey await!'], ['PALLET TOWN', 'Shades of your journey await!'], world);
  sign(-27, -7.5, 0, ['RED\'s house'], ['RED\'s house.'], world);
  sign(13, -7.5, 0, ['BLUE\'s house'], ['BLUE\'s house.'], world);
  sign(4.2, -34, 0, ['ROUTE 1', 'Pallet Town - Viridian City'], ['ROUTE 1', 'PALLET TOWN - VIRIDIAN CITY'], world);
  sign(-6, 50, 0, ['Pallet Beach'], ['PALLET BEACH', 'The salty breeze smells like adventure.'], world);
  for (const [x, z] of [[-3.5, -12], [3.5, -4], [-3.5, 14], [3.5, 24], [-3.5, 36], [3.5, -28], [-12, -5], [12, -5]]) lamp(x, z, world);
  bench(-14, 24, 0.4, world);
  bench(27, -4, -Math.PI / 2, world);
  dock(world);
  return world;
}
