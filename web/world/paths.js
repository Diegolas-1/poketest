// Dirt paths as the anime paints them: a warm, worn track with a lighter
// middle, faint ruts, pebbles and cracks, now and then a tuft of weeds, and a
// crisp ragged edge where the grass spills over it. Each road is a ribbon that
// follows the ground; the grass fringe is drawn first for every road and the
// dirt on top, so crossings join cleanly.
import * as THREE from 'three';
import { ROADS, height, rng, fbm } from './terrain.js';
import { celify } from './toon.js';
import { makeClump, TILE } from './foliage.js';

const HALF = 1.95;      // ribbon half width (dirt + grass fringe)
const CORE = 0.74;      // share of the half width that is dirt (on average)

// The path picture, 512 x 1024 = one ribbon width x 5 m. Two layers from the
// same strokes: 'core' (dirt only, transparent outside) and 'fringe' (the grass
// blades that hang over the edge).
let TEX = null;
function pathTextures() {
  if (TEX) return TEX;
  const W = 512, H = 1024, R = rng(4711);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // the ragged edge: how far the dirt reaches at each row, both sides
  const edge = (side, y) => 0.5 + side * (CORE / 2) * (1 + 0.1 * Math.sin(y * 0.021 + side * 3) + 0.06 * Math.sin(y * 0.083 + side) + 0.035 * Math.sin(y * 0.31 + side * 7));
  const core = document.createElement('canvas'); core.width = W; core.height = H;
  const c = core.getContext('2d');
  // dirt body, wrapping top to bottom
  c.beginPath();
  c.moveTo(edge(-1, 0) * W, 0);
  for (let y = 0; y <= H; y += 8) c.lineTo(edge(-1, y) * W, y);
  for (let y = H; y >= 0; y -= 8) c.lineTo(edge(1, y) * W, y);
  c.closePath();
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, hsl(32, 42, 58)); g.addColorStop(0.32, hsl(38, 52, 70)); g.addColorStop(0.5, hsl(40, 56, 76));
  g.addColorStop(0.68, hsl(38, 52, 70)); g.addColorStop(1, hsl(32, 42, 58));
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  const wrap = (fn) => { for (const oy of [-H, 0, H]) { c.save(); c.translate(0, oy); fn(); c.restore(); } };
  // painted patches: lighter wear, darker damp, soft streaks along the track
  for (let k = 0; k < 70; k++) {
    const x = W * (0.25 + R() * 0.5), y = R() * H, rx = 20 + R() * 50, ry = 30 + R() * 90, light = R() < 0.55;
    wrap(() => { c.fillStyle = light ? hsl(42, 58, 80, 0.35) : hsl(30, 40, 56, 0.3); c.beginPath(); c.ellipse(x, y, rx, ry, (R() - 0.5) * 0.3, 0, 6.28); c.fill(); });
  }
  // two faint ruts
  for (const rx of [0.38, 0.62]) {
    c.strokeStyle = hsl(30, 38, 58, 0.45); c.lineWidth = 14;
    c.beginPath(); for (let y = -20; y <= H + 20; y += 16) c.lineTo(W * rx + Math.sin(y * 0.012 + rx * 9) * 8, y); c.stroke();
    c.strokeStyle = hsl(42, 55, 80, 0.4); c.lineWidth = 4;
    c.beginPath(); for (let y = -20; y <= H + 20; y += 16) c.lineTo(W * rx + 7 + Math.sin(y * 0.012 + rx * 9) * 8, y); c.stroke();
  }
  // cracks
  for (let k = 0; k < 14; k++) {
    let x = W * (0.25 + R() * 0.5), y = R() * H;
    c.strokeStyle = hsl(28, 35, 46, 0.55); c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (R() - 0.5) * 30; y += 6 + R() * 16; c.lineTo(x, y); }
    c.stroke();
  }
  // pebbles: a shadow, a body and a lit top
  for (let k = 0; k < 120; k++) {
    const x = W * (0.2 + R() * 0.6), y = R() * H, r = 2 + R() * (R() < 0.12 ? 9 : 4), a = R() * 3;
    wrap(() => {
      c.fillStyle = hsl(28, 35, 45, 0.6); c.beginPath(); c.ellipse(x + r * 0.3, y + r * 0.35, r, r * 0.7, a, 0, 6.28); c.fill();
      c.fillStyle = hsl(35 + R() * 10, 18 + R() * 15, 70 + R() * 12); c.beginPath(); c.ellipse(x, y, r, r * 0.7, a, 0, 6.28); c.fill();
      c.fillStyle = hsl(40, 30, 90, 0.8); c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.2, r * 0.45, r * 0.3, a, 0, 6.28); c.fill();
    });
  }
  c.restore();
  // a darker lip just inside the dirt edge, where the grass shades it
  for (const side of [-1, 1]) {
    c.strokeStyle = hsl(30, 40, 52, 0.7); c.lineWidth = 10;
    c.beginPath(); for (let y = 0; y <= H; y += 8) c.lineTo(edge(side, y) * W - side * 5, y); c.stroke();
  }
  // grass fringe: blades growing from outside over the dirt edge
  const fringe = document.createElement('canvas'); fringe.width = W; fringe.height = H;
  const f = fringe.getContext('2d');
  const blade = (x0, y0, len, ang, w, col) => {
    f.fillStyle = col; f.beginPath(); f.moveTo(x0 - w, y0);
    const tx = x0 + Math.cos(ang) * len, ty = y0 + Math.sin(ang) * len;
    f.quadraticCurveTo((x0 + tx) / 2 + Math.sin(ang) * 6, (y0 + ty) / 2, tx, ty);
    f.quadraticCurveTo((x0 + tx) / 2, (y0 + ty) / 2 + 3, x0 + w, y0 + w * 0.4); f.fill();
  };
  for (const side of [-1, 1]) {
    // blades and clumps growing from the grass and leaning in over the edge
    for (let k = 0; k < 700; k++) {
      const y = R() * H, x0 = edge(side, y) * W + side * (8 + R() * 30);
      const ang = (side < 0 ? 0 : Math.PI) + (R() - 0.5) * 1.3 - Math.PI * 0.08 * side;
      const len = 14 + R() * (R() < 0.15 ? 46 : 22);
      const l = R();
      const col = l < 0.3 ? hsl(110, 50, 32) : l < 0.75 ? hsl(98, 58, 46) : hsl(84, 70, 60);
      for (const oy of [-H, 0, H]) blade(x0, y + oy, len, ang, 2.5 + R() * 2.5, col);
    }
  }
  const mk = (cv) => {
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  };
  TEX = { core: mk(core), fringe: mk(fringe) };
  return TEX;
}

// A smooth curve through a road's points, sampled every step metres.
function sample(road, step = 0.5) {
  const pts = road.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3);
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return { pts: curve.getSpacedPoints(n), len: curve.getLength() };
}

export function buildPaths(scene) {
  const tex = pathTextures();
  const COLS = 8;
  const geos = [];
  const weeds = [];
  const R = rng(321);
  for (const road of ROADS) {
    const { pts, len } = sample(road);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const v = (i / (pts.length - 1)) * len / 5;
      // the track wanders a little in width
      const hw = HALF * (0.92 + fbm(p.x * 0.15, p.z * 0.15, 2) * 0.22);
      for (let j = 0; j <= COLS; j++) {
        const s = j / COLS * 2 - 1, x = p.x + nx * hw * s, z = p.z + nz * hw * s;
        pos.push(x, height(x, z) + 0.06, z); uv.push(j / COLS, v);
      }
      if (i > 0) for (let j = 0; j < COLS; j++) {
        const p0 = (i - 1) * (COLS + 1) + j, p1 = i * (COLS + 1) + j;
        idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
      }
      // now and then a tuft of weeds on the track, mostly between the ruts
      if (i % 3 === 0 && R() < 0.16) {
        const s = (R() - 0.5) * 0.5, x = p.x + nx * hw * s, z = p.z + nz * hw * s;
        weeds.push([x, z, R() * 6.28, 0.5 + R() * 0.5]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  const cel = { bands: [0.08, 0.22, 0.5], soft: 0.04, deep: [0.5, 0.6, 0.8], shade: [0.68, 0.76, 0.9], lit: [1.05, 1.04, 0.98] };
  const mat = (map, offset) => {
    const m = celify(new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 }), cel);
    m.polygonOffset = true; m.polygonOffsetFactor = offset; m.polygonOffsetUnits = offset;
    return m;
  };
  const fringeMat = mat(tex.fringe, -3), coreMat = mat(tex.core, -5);
  const group = new THREE.Group();
  for (const g of geos) {
    const a = new THREE.Mesh(g, fringeMat); a.receiveShadow = true; a.renderOrder = 1; group.add(a);
    const b = new THREE.Mesh(g, coreMat); b.receiveShadow = true; b.renderOrder = 2; group.add(b);
  }
  // weeds: two kinds of small clumps, instanced
  const kinds = [makeClump(71, TILE.fern, 0.45), makeClump(72, TILE.bushB, 0.4), makeClump(73, TILE.flowersY, 0.4)];
  kinds.forEach((k, ki) => {
    const list = weeds.filter((_, i) => i % kinds.length === ki);
    if (!list.length) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const p of k.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, list.length);
      list.forEach(([x, z, r, s], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r); m4.compose(new THREE.Vector3(x, height(x, z) + 0.04, z), q, new THREE.Vector3(s, s * 0.7, s)); im.setMatrixAt(i, m4); });
      im.renderOrder = 3; group.add(im);
    }
  });
  scene.add(group);
  return group;
}

// The painterly grass the ground is painted with: short brush strokes in
// clumps, light and dark, as a grey-green detail map (the ground's own colour
// tints it). One tile = 4 m.
export function grassTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), R = rng(2024);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  c.fillStyle = hsl(90, 12, 86); c.fillRect(0, 0, S, S);
  const wrap = (x, y, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(x + ox, y + oy); };
  // soft patches
  for (let k = 0; k < 40; k++) {
    const x = R() * S, y = R() * S, r = 30 + R() * 70, l = R() < 0.5;
    wrap(x, y, (px, py) => { c.fillStyle = l ? hsl(80, 30, 96, 0.25) : hsl(120, 20, 72, 0.22); c.beginPath(); c.ellipse(px, py, r, r * 0.6, R(), 0, 6.28); c.fill(); });
  }
  // clumps of blades: a fan of short strokes, dark at the root, light at the tips
  for (let k = 0; k < 260; k++) {
    const cx = R() * S, cy = R() * S, n = 4 + Math.floor(R() * 6), light = R();
    for (let j = 0; j < n; j++) {
      const ang = -Math.PI / 2 + (j / (n - 1) - 0.5) * 1.6 + (R() - 0.5) * 0.3, len = 10 + R() * 14;
      const col = light < 0.35 ? hsl(125, 25, 66, 0.8) : light < 0.75 ? hsl(95, 30, 92, 0.85) : hsl(70, 45, 100, 0.9);
      wrap(cx, cy, (px, py) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(px - 2, py);
        const tx = px + Math.cos(ang) * len, ty = py + Math.sin(ang) * len;
        c.quadraticCurveTo((px + tx) / 2 + 3, (py + ty) / 2, tx, ty);
        c.quadraticCurveTo((px + tx) / 2, (py + ty) / 2 + 2, px + 2, py); c.fill();
      });
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
