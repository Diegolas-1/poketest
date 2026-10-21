// Stylized, hand-painted foliage made in code: a painted leaf atlas, trees and
// bushes with clumpy canopies of leaf cards (lit like soft round puffs), ivy
// and hanging vines. Cheap to draw, rich to look at.
import * as THREE from 'three';
import { rng } from './terrain.js';
import { celify } from './toon.js';

// ---------- the painted atlas ----------
// 4 x 4 tiles of 256 px. Each tile is one kind of leaf card.
export const TILE = {
  leafA: 0, leafB: 1, leafC: 2, leafD: 3,       // broadleaf clusters, four greens
  bushA: 4, bushB: 5,                           // dense small-leaf clusters
  blossom: 6, blossomW: 7,                      // pink and white flowering
  needles: 8, needles2: 9,                      // pine
  palm: 10, fern: 11,                           // fronds
  ivy: 12, ivy2: 13,                            // heart-shaped climbing leaves
  flowersY: 14, flowersR: 15,                   // little flower heads among leaves
};
let atlas = null;
export function leafAtlas() {
  if (atlas) return atlas;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 4;
  const ctx = c.getContext('2d');
  const R = rng(9001);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // one leaf: a pointed oval along +x from the origin
  const leaf = (len, wid, h, s, l, vein = true) => {
    const g = ctx.createLinearGradient(0, -wid, 0, wid);
    g.addColorStop(0, hsl(h, s, l + 10)); g.addColorStop(0.55, hsl(h, s, l)); g.addColorStop(1, hsl(h + 6, s + 5, l - 12));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.9, len, 0);
    ctx.bezierCurveTo(len * 0.75, wid * 0.9, len * 0.3, wid, 0, 0);
    ctx.fill();
    ctx.strokeStyle = hsl(h + 10, s, l - 22, 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    if (vein) { ctx.strokeStyle = hsl(h - 4, s - 10, l + 18, 0.55); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(len * 0.08, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke(); }
  };
  const tile = (i, draw) => {
    ctx.save(); ctx.translate((i % 4) * S, Math.floor(i / 4) * S);
    ctx.beginPath(); ctx.rect(2, 2, S - 4, S - 4); ctx.clip();
    draw(); ctx.restore();
  };
  // a cluster: leaves fanned from a hidden stem, back ones darker
  const cluster = (i, n, len, wid, h, s, l) => tile(i, () => {
    const items = [];
    for (let k = 0; k < n; k++) items.push({ a: R() * Math.PI * 2, r: Math.sqrt(R()) * 80, d: R() });
    items.sort((p, q) => p.d - q.d);
    for (const it of items) {
      ctx.save();
      ctx.translate(S / 2 + Math.cos(it.a) * it.r * 0.75, S / 2 + Math.sin(it.a) * it.r * 0.75);
      ctx.rotate(it.a + (R() - 0.5) * 1.4);
      const k = 0.75 + R() * 0.5;
      leaf(len * k, wid * k, h + (R() - 0.5) * 14, s, l - 14 + it.d * 22);
      ctx.restore();
    }
  });
  // anime canopy clumps: a scalloped silhouette of round dabs, filled flat,
  // with lighter dabs toward the top and darker ones below (the band edges
  // follow them, like the dotted light in the show's tree paintings)
  // one painted leaf stroke: a round heel, a pointed tip, a slight curve
  const brush = (x, y, len, wid, ang, bend = 0.25) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -wid * (1 + bend), len * 0.7, -wid * (0.7 + bend), len, wid * bend * 0.6);
    ctx.bezierCurveTo(len * 0.65, wid * (0.9 - bend), len * 0.2, wid, 0, 0);
    ctx.fill(); ctx.restore();
  };
  // anime canopy clumps, painted with leaf-shaped brush strokes: a flat body,
  // a ragged rim of strokes hanging outward and down, then lighter strokes
  // toward the top and darker ones below (the light bands follow them)
  const dapple = (i, h, s, l, dot = 1) => tile(i, () => {
    const C = S / 2, k = 1 / Math.sqrt(dot);
    ctx.fillStyle = hsl(h, s, l);
    for (let n = 0; n < 22; n++) {   // body
      const a = R() * 6.28, d = Math.sqrt(R()) * 52;
      brush(C + Math.cos(a) * d - 30, C + Math.sin(a) * d * 0.9, 70 + R() * 30, 26 + R() * 12, (R() - 0.5) * 0.8);
    }
    for (let n = 0; n < 90 * dot; n++) {   // rim: strokes pointing out, drooping
      const a = R() * 6.28, d = 62 + R() * 26;
      const x = C + Math.cos(a) * d * 0.7, y = C + Math.sin(a) * d * 0.62;
      const out = a + (R() - 0.5) * 0.7, droop = Math.cos(out) * 0.45 * (Math.sin(out) < 0.3 ? 1 : 0);
      brush(x, y, (20 + R() * 22) * k, (7 + R() * 6) * k, out + droop * Math.sign(Math.cos(out)) * 0.6, (R() - 0.5) * 0.6);
    }
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (let n = 0; n < 110 * dot; n++) {   // light and shade strokes
      const x = 20 + R() * (S - 40), y = 20 + R() * (S - 40);
      const up = (S - y) / S + (x / S) * 0.3 + (R() - 0.5) * 0.45;
      if (up > 0.64) ctx.fillStyle = hsl(h - 16, s + 10, l + 14 + R() * 10);
      else if (up < 0.4) ctx.fillStyle = hsl(h + 22, s - 4, l - 13 - R() * 9);
      else continue;
      const ang = Math.PI * 0.5 + (R() - 0.5) * 2.2 + (x < C ? 0.4 : -0.4);
      brush(x, y, (14 + R() * 18) * k, (5 + R() * 4) * k, ang, (R() - 0.5) * 0.7);
    }
    ctx.restore();
  });
  dapple(TILE.leafA, 118, 52, 42);
  dapple(TILE.leafB, 108, 55, 45);
  dapple(TILE.leafC, 128, 48, 38);
  dapple(TILE.bushA, 116, 52, 41, 1.8);
  dapple(TILE.bushB, 126, 48, 38, 1.8);
  // cypress: upward flames of dark blue-green brush strokes
  tile(TILE.leafD, () => {
    for (let k = 0; k < 120; k++) {
      const x = 30 + R() * 196, y = 40 + R() * 200, w = 6 + R() * 10, hh = 26 + R() * 40;
      if (Math.abs(x - S / 2) > (y - 20) * 0.5 + 10) continue;
      const up = (S - y) / S + (R() - 0.5) * 0.6;
      ctx.fillStyle = up > 0.65 ? hsl(150, 38, 40) : up < 0.3 ? hsl(170, 36, 24) : hsl(158, 38, 31);
      ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.quadraticCurveTo(x + w, y - hh * 0.3, x, y); ctx.quadraticCurveTo(x - w, y - hh * 0.3, x, y - hh); ctx.fill();
    }
  });
  // blossoms: small round petals over a few leaves
  const blossom = (i, h, s, l) => tile(i, () => {
    for (let k = 0; k < 10; k++) { ctx.save(); ctx.translate(S / 2 + (R() - 0.5) * 120, S / 2 + (R() - 0.5) * 120); ctx.rotate(R() * 6.28); leaf(50, 16, 100, 45, 40); ctx.restore(); }
    for (let k = 0; k < 46; k++) {
      const x = S / 2 + (R() - 0.5) * 190, y = S / 2 + (R() - 0.5) * 190;
      if (Math.hypot(x - S / 2, y - S / 2) > 110) continue;
      for (let p = 0; p < 5; p++) {
        const a = p * 1.2566 + R() * 0.2;
        ctx.fillStyle = hsl(h, s, l + (R() - 0.5) * 10);
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 7, 5, a, 0, 6.28); ctx.fill();
      }
      ctx.fillStyle = hsl(48, 90, 62); ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill();
    }
  });
  blossom(TILE.blossom, 340, 70, 80);
  blossom(TILE.blossomW, 40, 30, 94);
  // pine needles: radiating thin strokes on twigs
  const needles = (i, h, l) => tile(i, () => {
    for (let b = 0; b < 7; b++) {
      const x0 = 30 + R() * 40, y0 = 30 + b * 32, ang = -0.25 + (R() - 0.5) * 0.3;
      ctx.strokeStyle = hsl(30, 40, 30); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(ang) * 190, y0 + Math.sin(ang) * 190); ctx.stroke();
      for (let k = 0; k < 60; k++) {
        const t = R(), px = x0 + Math.cos(ang) * 190 * t, py = y0 + Math.sin(ang) * 190 * t;
        const a = ang + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6);
        ctx.strokeStyle = hsl(h + (R() - 0.5) * 12, 45, l + (R() - 0.5) * 16); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 26, py + Math.sin(a) * 26); ctx.stroke();
      }
    }
  });
  needles(TILE.needles, 150, 32); needles(TILE.needles2, 140, 38);
  // palm frond: a long arching spine with many thin leaflets
  tile(TILE.palm, () => {
    ctx.strokeStyle = hsl(70, 40, 40); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(10, S / 2); ctx.quadraticCurveTo(S / 2, S / 2 - 30, S - 10, S / 2 + 10); ctx.stroke();
    for (let k = 0; k < 44; k++) {
      const t = k / 44, x = 10 + t * (S - 20), y = S / 2 - Math.sin(t * Math.PI) * 26;
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(sgn * (1.0 - t * 0.3) + 0.3);
        leaf(70 * (1 - t * 0.5), 6, 92 + R() * 20, 55, 40 + R() * 12, false); ctx.restore();
      }
    }
  });
  tile(TILE.fern, () => {
    for (let f = 0; f < 3; f++) {
      ctx.save(); ctx.translate(S / 2, S - 10); ctx.rotate(-1.2 + f * 0.6);
      for (let k = 0; k < 26; k++) {
        const t = k / 26;
        for (const sgn of [-1, 1]) { ctx.save(); ctx.translate(t * 220, 0); ctx.rotate(sgn * 1.1); leaf(40 * (1 - t * 0.7), 7, 110, 50, 36 + R() * 10, false); ctx.restore(); }
      }
      ctx.restore();
    }
  });
  // ivy: heart shaped leaves on a vine
  const ivy = (i, h, l) => tile(i, () => {
    for (let k = 0; k < 26; k++) {
      const x = 30 + R() * 196, y = 30 + R() * 196, s = 14 + R() * 12;
      ctx.save(); ctx.translate(x, y); ctx.rotate(R() * 6.28);
      ctx.fillStyle = hsl(h + (R() - 0.5) * 16, 50, l + (R() - 0.5) * 16);
      ctx.beginPath(); ctx.moveTo(0, s);
      ctx.bezierCurveTo(-s * 1.4, 0, -s * 0.6, -s * 1.2, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.6, -s * 1.2, s * 1.4, 0, 0, s); ctx.fill();
      ctx.strokeStyle = hsl(h, 40, l + 20, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, s * 0.8); ctx.lineTo(0, -s * 0.3); ctx.stroke();
      ctx.restore();
    }
  });
  ivy(TILE.ivy, 110, 34); ivy(TILE.ivy2, 95, 42);
  // leaves with little flowers among them
  const flowers = (i, h, l) => tile(i, () => {
    for (let k = 0; k < 24; k++) { ctx.save(); ctx.translate(S / 2 + (R() - 0.5) * 150, S / 2 + (R() - 0.5) * 150); ctx.rotate(R() * 6.28); leaf(44, 14, 108, 50, 38 + R() * 10); ctx.restore(); }
    for (let k = 0; k < 18; k++) {
      const x = S / 2 + (R() - 0.5) * 150, y = S / 2 + (R() - 0.5) * 150;
      for (let p = 0; p < 6; p++) { const a = p * 1.047; ctx.fillStyle = hsl(h, 85, l); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 6, 3.5, a, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = hsl(40, 90, 55); ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill();
    }
  });
  flowers(TILE.flowersY, 48, 62); flowers(TILE.flowersR, 2, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = t;
  return t;
}

// The material for every leaf card: cut-out, double sided, with a little
// light through the leaves (backlit leaves glow warm) and soft wind.
export const foliageTime = { value: 0 };
const leafMats = new Map();
export function leafMaterial(tint = '#ffffff', wind = 0.08) {
  const key = tint + wind;
  if (leafMats.has(key)) return leafMats.get(key);
  const m = new THREE.MeshLambertMaterial({ map: leafAtlas(), color: new THREE.Color(tint), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = foliageTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float flutter;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float sway = sin(uTime * 1.2 + ip.x * 0.2 + ip.z * 0.17) * 0.6 + sin(uTime * 2.3 + ip.x * 0.5) * 0.25;
      float k = clamp(position.y / 8.0, 0.0, 1.0);
      transformed.x += sway * ${wind.toFixed(3)} * k * 3.0;
      transformed.z += sway * ${(wind * 0.6).toFixed(3)} * k * 3.0;
      transformed += normal * sin(uTime * 4.0 + flutter * 30.0) * 0.03 * flutter;`);
    // cards seen edge-on thin out, so no flat streaks or straight seams show
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
      vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
      float edgeOn = abs(dot(fN, normalize(vViewPosition)));
      vec2 tl = fract(vMapUv * 4.0) - 0.5;
      if (diffuseColor.a < alphaTest || length(tl) > mix(0.0, 0.75, smoothstep(0.1, 0.5, edgeOn))) discard;`);
  };
  m.customProgramCacheKey = () => 'leaf' + wind;
  celify(m, { ao: true, noflip: true, detail: 0.55, mid: 0.26, bands: [0.24, 0.44, 0.57], soft: 0.02,
    deep: [0.13, 0.33, 0.6], shade: [0.36, 0.66, 0.9], lit: [1.45, 1.3, 0.62], litAdd: [0.07, 0.08, 0.0] });
  leafMats.set(key, m);
  return m;
}

// Barks: painted streaks on a soft brown, generated once per colour.
const barkMats = new Map();
export function barkMaterial(color = '#7a5638') {
  if (barkMats.has(color)) return barkMats.get(color);
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(color);
  ctx.fillStyle = '#' + base.getHexString(); ctx.fillRect(0, 0, 128, 256);
  const R = rng(77);
  for (let i = 0; i < 70; i++) {
    const x = R() * 128, w = 2 + R() * 6, l = R() < 0.5 ? 0.78 : 1.18;
    ctx.fillStyle = '#' + base.clone().multiplyScalar(l).getHexString();
    ctx.globalAlpha = 0.5; ctx.fillRect(x, R() * 200 - 40, w, 60 + R() * 140);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = celify(new THREE.MeshLambertMaterial({ map: t }), { bands: [0.1, 0.3, 0.6], deep: [0.4, 0.48, 0.62], shade: [0.6, 0.68, 0.82], lit: [1.12, 1.1, 1.0] });
  barkMats.set(color, m);
  return m;
}

// ---------- geometry helpers ----------
// A card of size s at p facing n, using atlas tile i, rotated by r.
function pushCard(out, p, n, s, tile, r, center, flutter) {
  const up = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(up, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const cr = Math.cos(r), sr = Math.sin(r);
  const U = u.clone().multiplyScalar(cr).addScaledVector(v, sr).multiplyScalar(s / 2);
  const Vv = v.clone().multiplyScalar(cr).addScaledVector(u, -sr).multiplyScalar(s / 2);
  const tx = (tile % 4) / 4, ty = 1 - (Math.floor(tile / 4) + 1) / 4;
  const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
  const base = out.pos.length / 3;
  for (const [a, b, uu, vv] of corners) {
    const q = p.clone().addScaledVector(U, a).addScaledVector(Vv, b);
    out.pos.push(q.x, q.y, q.z);
    // normals point out of the puff, so lighting wraps round it like a ball
    const nn = q.clone().sub(center).normalize().lerp(n, 0.25).normalize();
    out.nor.push(nn.x, nn.y, nn.z);
    out.uv.push(tx + uu * 0.25 * 0.98 + 0.0025, ty + vv * 0.25 * 0.98 + 0.0025);
    out.fl.push(flutter);
    const ao = out.ao !== undefined ? out.ao : 1;
    out.col.push(ao, ao, ao);
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function toGeometry(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.setAttribute('flutter', new THREE.Float32BufferAttribute(out.fl, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  g.computeBoundingSphere();
  return g;
}
const cards = () => ({ pos: [], nor: [], uv: [], idx: [], fl: [], col: [] });

// A puff of leaf cards round a centre (one lobe of a canopy).
function puff(out, c, r, n, tiles, R, treeCenter) {
  for (let i = 0; i < n; i++) {
    // points spread over the sphere, a bit more on top and on the sun side
    const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(rr * Math.cos(a), u * 0.85 + 0.1, rr * Math.sin(a)).normalize();
    const depth = 0.35 + Math.sqrt(R()) * 0.65;
    const p = c.clone().addScaledVector(d, r * depth);
    const facing = d.clone().lerp(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5), 0.25).normalize();
    const centre = treeCenter ? c.clone().lerp(treeCenter, 0.15) : c;
    // deeper and lower cards sit in shade
    out.ao = Math.min(1, 0.3 + depth * 0.5 + (d.y + 1) * 0.16);
    pushCard(out, p, facing, r * (0.9 + R() * 0.45), tiles[Math.floor(R() * tiles.length)], R() * 6.28, centre, R());
    out.ao = 1;
  }
}

// A tapered tube along a path of points (trunks and branches).
function tube(points, r0, r1, sides = 7) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(4, points.length * 4);
  const g = new THREE.TubeGeometry(curve, segs, 1, sides, false);
  const p = g.attributes.position, uv = g.attributes.uv;
  const frames = curve.computeFrenetFrames(segs, false);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = r0 + (r1 - r0) * t, c = curve.getPointAt(t);
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)).sub(c).normalize();
      p.setXYZ(k, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
      uv.setXY(k, uv.getX(k) * 2, t * curve.getLength() / 2);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}
function mergeGeos(list) {
  const nonIdx = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of nonIdx) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of nonIdx) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// ---------- trees ----------
// Returns a model {parts:[{geometry, material}], height, radius} that the
// Scatter and Impostor code in assets.js can use directly.
export function makeTree(kind, seed) {
  const R = rng(seed);
  const leaves = cards(), wood = [];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  let height = 0, radius = 0, bark = '#7a5638', tint = '#ffffff';
  if (kind === 'round' || kind === 'blossom') {
    // the show's broadleaf: a slim pale trunk that forks into a few rising
    // branches, under a broad canopy of big rounded clumps
    const h = 3.6 + R() * 1.4;
    const lean = V3((R() - 0.5) * 0.7, 0, (R() - 0.5) * 0.7);
    const top = V3(lean.x, h, lean.z);
    wood.push(tube([V3(0, -0.3, 0), V3(lean.x * 0.3, h * 0.45, lean.z * 0.3), top], 0.32, 0.17));
    const lobes = [];
    const nb = 3 + Math.floor(R() * 3);
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + R() * 0.7, out = 1.4 + R() * 1.4, up = 1.6 + R() * 1.8;
      const end = top.clone().add(V3(Math.cos(a) * out, up, Math.sin(a) * out));
      const mid = top.clone().lerp(end, 0.45).add(V3(0, -0.2, 0));
      wood.push(tube([top.clone().add(V3(0, -0.5, 0)), mid, end], 0.15, 0.05, 5));
      // a twig off each branch
      const tw = mid.clone().add(V3(Math.cos(a + 1) * 0.9, 0.9, Math.sin(a + 1) * 0.9));
      wood.push(tube([mid, tw], 0.07, 0.03, 4));
      lobes.push([end.clone().add(V3(0, 0.4, 0)), 1.5 + R() * 0.6]);
    }
    lobes.push([top.clone().add(V3(0, 3.0, 0)), 1.9 + R() * 0.5]);
    for (let k = 0; k < 5; k++) {
      const [c] = lobes[Math.floor(R() * lobes.length)];
      lobes.push([c.clone().add(V3((R() - 0.5) * 2.2, (R() - 0.1) * 1.3, (R() - 0.5) * 2.2)), 1.1 + R() * 0.5]);
    }
    const centre = top.clone().add(V3(0, 2.4, 0));
    const tiles = kind === 'blossom' ? [TILE.blossom, TILE.blossom, TILE.blossomW, TILE.leafB] : [TILE.leafA, TILE.leafB, TILE.leafC, TILE.leafA];
    for (const [c, r] of lobes) puff(leaves, c, r, Math.round(r * r * 10 + 5), tiles, R, centre);
    height = centre.y + 3.4; radius = 4.6;
    bark = '#9a9572';
  } else if (kind === 'cypress') {
    // tall dark flame of a tree, as in the show's hills
    const h = 6.5 + R() * 3, w = 1.3 + R() * 0.4;
    wood.push(tube([V3(0, -0.3, 0), V3(0, 1.4, 0)], 0.22, 0.16));
    const centre = V3(0, h * 0.45, 0);
    for (let y = 0.9; y < h; y += 0.45) {
      const f = (y - 0.9) / (h - 0.9), r = w * Math.pow(Math.sin(Math.PI * Math.min(1, f * 0.8 + 0.12)), 0.8) * (1 - f * 0.55) + 0.15;
      const n = Math.round(r * 10 + 3);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d = V3(Math.cos(a), 0.15, Math.sin(a)).normalize();
        const p = V3(Math.cos(a) * r * (0.4 + R() * 0.5), y, Math.sin(a) * r * (0.4 + R() * 0.5));
        leaves.ao = Math.min(1, 0.55 + f * 0.35 + R() * 0.15);
        pushCard(leaves, p, d, 1.0 + r * 0.5, TILE.leafD, (R() - 0.5) * 0.4, V3(0, y, 0).lerp(centre, 0.4), R() * 0.4);
        leaves.ao = 1;
      }
    }
    height = h + 1; radius = w + 1;
    bark = '#6a5f4c';
  } else if (kind === 'poplar') {
    // tall and narrow, layered lobes up a straight trunk
    const h = 7 + R() * 2;
    wood.push(tube([V3(0, -0.3, 0), V3(0, h * 0.5, 0), V3(0, h, 0)], 0.3, 0.1));
    const centre = V3(0, h * 0.62, 0);
    for (let y = 2.2; y < h + 1.2; y += 1.0) {
      const r = 1.3 * Math.sin(Math.PI * (y / (h + 1.6))) + 0.4;
      puff(leaves, V3((R() - 0.5) * 0.4, y, (R() - 0.5) * 0.4), r, Math.round(r * r * 18 + 6), [TILE.leafC, TILE.leafA, TILE.leafB], R, centre);
    }
    height = h + 2; radius = 2;
    bark = '#8a8466';
  } else if (kind === 'pine') {
    const h = 8 + R() * 3;
    wood.push(tube([V3(0, -0.3, 0), V3(0, h * 0.5, 0), V3(0, h + 0.6, 0)], 0.32, 0.06));
    const centre = V3(0, h * 0.5, 0);
    for (let y = 1.6; y < h + 0.4; y += 0.55) {
      const r = (1 - (y - 1.6) / (h - 1.0)) * 2.6 + 0.3;
      const n = Math.round(r * 9 + 3);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d = V3(Math.cos(a), -0.35, Math.sin(a)).normalize();
        const p = V3(0, y, 0).addScaledVector(V3(Math.cos(a), 0, Math.sin(a)), r * (0.5 + R() * 0.5));
        pushCard(leaves, p, V3(d.x * 0.3, 1, d.z * 0.3).normalize(), r * 0.9 + 0.5, R() < 0.5 ? TILE.needles : TILE.needles2, a, centre, R() * 0.5);
        pushCard(leaves, p, d, r * 0.8 + 0.4, TILE.needles, R() * 6, centre, R() * 0.5);
      }
    }
    height = h + 1; radius = 3;
    bark = '#5e4530';
  } else if (kind === 'palm') {
    const h = 5.5 + R() * 2.5;
    const bend = V3((R() - 0.5) * 2.4, 0, (R() - 0.5) * 2.4);
    const top = V3(bend.x, h, bend.z);
    wood.push(tube([V3(0, -0.3, 0), V3(bend.x * 0.2, h * 0.5, bend.z * 0.2), top], 0.26, 0.18, 8));
    // fronds: arching strips, the frond picture running along each
    for (let f = 0; f < 18; f++) {
      const a = (f / 18) * Math.PI * 2 + R() * 0.3, len = 3.4 + R() * 1.2, droop = 1.2 + R() * 1.4, w = 2.2;
      const dir = V3(Math.cos(a), 0, Math.sin(a)), side = V3(-Math.sin(a), 0, Math.cos(a));
      const tx = (TILE.palm % 4) / 4, ty = 1 - (Math.floor(TILE.palm / 4) + 1) / 4;
      const segs = 6, base = leaves.pos.length / 3;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const p = top.clone().addScaledVector(dir, len * t).add(V3(0, 0.5 * t - droop * t * t, 0));
        const nrm = V3(0, 1, 0).addScaledVector(dir, -0.4 + t * 0.8).normalize();
        for (const sgn of [-1, 1]) {
          const q = p.clone().addScaledVector(side, sgn * w / 2 * (1 - t * 0.6)).add(V3(0, -Math.abs(sgn) * 0.12 * t, 0));
          leaves.pos.push(q.x, q.y, q.z); leaves.nor.push(nrm.x, nrm.y, nrm.z);
          leaves.uv.push(tx + t * 0.245 + 0.0025, ty + (sgn < 0 ? 0.005 : 0.245));
          leaves.fl.push(0.3 + t * 0.7); const ao = 0.75 + t * 0.25; leaves.col.push(ao, ao, ao);
        }
        if (k < segs) { const b = base + k * 2; leaves.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
    }
    for (let k = 0; k < 5; k++) { // coconuts
      const c = new THREE.SphereGeometry(0.16, 8, 6); c.translate(top.x + (R() - 0.5) * 0.4, top.y - 0.2, top.z + (R() - 0.5) * 0.4);
      wood.push(c);
    }
    height = h + 1.5; radius = 4;
    bark = '#8a7356';
  } else if (kind === 'oldgrowth') {
    // a very tall old tree: a gnarled leaning trunk on buttress roots that
    // splits into leaders, branching 3 levels up and out under a broad,
    // layered canopy of many separate lobes with gaps between them
    const J = (s) => V3((R() - 0.5) * s, (R() - 0.5) * s * 0.4, (R() - 0.5) * s);
    // fluted, knotty bark: push the tube's surface in and out along its normals
    const gnarl = (g, amt, f) => {
      const p = g.attributes.position, n = g.attributes.normal, k = R() * 10;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const d = amt * (Math.sin(Math.atan2(z, x) * 5 + y * 0.35 + k) * 0.75 + Math.sin(y * f * 0.35 + x * 1.3 + k) * 0.25);
        p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
      }
      g.computeVertexNormals(); return g;
    };
    const th = 10 + R() * 1.5, la = R() * 6.28, ln = 1.3 + R() * 0.9;
    const trunk = [V3(0, -0.6, 0)];
    for (let i = 1; i <= 6; i++) {
      const t = i / 6, w = 1.1 * Math.sin(t * Math.PI);
      trunk.push(V3(Math.cos(la) * ln * t * t + (R() - 0.5) * w, th * t, Math.sin(la) * ln * t * t + (R() - 0.5) * w));
    }
    wood.push(gnarl(tube(trunk, 1.15, 0.6, 12), 0.1, 1.3));
    // buttress roots spreading out and down into the ground
    const nr = 4 + Math.floor(R() * 2);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * 6.28 + R() * 0.6, d = 2.2 + R() * 1.2, dir = V3(Math.cos(a), 0, Math.sin(a));
      wood.push(gnarl(tube([V3(0, 2.0 + R() * 0.9, 0).addScaledVector(dir, 0.35), V3(0, 0.6, 0).addScaledVector(dir, 1.15),
        V3(0, 0.05, 0).addScaledVector(dir, d * 0.75), V3(0, -0.35, 0).addScaledVector(dir, d)], 0.6, 0.08, 7), 0.05, 2));
    }
    const top = trunk[trunk.length - 1], lobes = [];
    // a curving branch from p along dir; recurses, leaving lobes at the tips
    const branch = (p, dir, len, r, lv) => {
      const d = dir.clone().normalize(), pts = [p.clone()];
      for (let i = 1; i <= 3; i++) {
        d.y += 0.1 * (lv + 0.6) * (1 - d.y); d.add(J(0.35)).normalize();   // bends upward as it goes
        pts.push(pts[i - 1].clone().addScaledVector(d, len / 3));
      }
      const end = pts[3], r1 = r * 0.6;
      wood.push(tube(pts, r, r1, lv < 1 ? 9 : lv < 2 ? 7 : 6));
      if (lv >= 2) {   // tips: a big lobe at the end, sometimes a smaller one along it
        lobes.push([end.clone().addScaledVector(d, 0.5).add(V3(0, 0.5, 0)), 1.35 + R() * 0.7]);
        if (R() < 0.7) lobes.push([pts[1].clone().lerp(pts[2], R()).add(V3((R() - 0.5) * 1.2, 0.9, (R() - 0.5) * 1.2)), 0.95 + R() * 0.5]);
        return;
      }
      const n = lv ? 2 + Math.floor(R() * 2) : 3, a0 = R() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.28 + (R() - 0.5) * 0.8;
        const cd = d.clone().multiplyScalar(0.9).add(V3(Math.cos(a), 0.1, Math.sin(a)).multiplyScalar(0.8));
        branch(i === 0 ? end : pts[1 + (R() < 0.5 ? 1 : 2)], cd, len * (0.6 + R() * 0.2), r1 * 0.9, lv + 1);
      }
      if (lv === 1 && R() < 0.5) lobes.push([pts[2].clone().add(V3(0, 0.8, 0)), 1.0 + R() * 0.4]);
    };
    // 2-3 leaders out of the crown, plus a couple of low limbs off the trunk
    const nl = 2 + Math.floor(R() * 2), b0 = R() * 6.28;
    branch(top.clone().add(V3(0, -0.4, 0)), V3(Math.cos(la) * 0.15, 1, Math.sin(la) * 0.15), 4.0 + R() * 0.8, 0.68, 0);   // the tall central leader
    for (let i = 0; i < nl; i++) {
      const a = b0 + (i / nl) * 6.28 + (R() - 0.5) * 0.6;
      branch(top.clone().add(V3(0, -0.8, 0)), V3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), 3.0 + R() * 0.8, 0.52, 0);
    }
    for (let i = 0; i < 3; i++) {   // lower limbs in tiers
      const p = trunk[i ? 5 : 4].clone().add(V3(0, i === 2 ? -0.9 : 0, 0)), a = b0 + 1.2 + i * 2.2 + R() * 0.6;
      branch(p, V3(Math.cos(a), 0.3, Math.sin(a)), (i ? 3.0 : 4.0) + R() * 0.8, 0.4, 1);
    }
    // dead stubs low on the trunk
    for (let i = 0; i < 3; i++) {
      const p = trunk[2 + i], a = R() * 6.28;
      wood.push(tube([p, p.clone().add(V3(Math.cos(a) * 1.0, 0.3 + R() * 0.4, Math.sin(a) * 1.0))], 0.14, 0.04, 6));
    }
    // fill in the crown: a few lobes between neighbours, a crown lobe on top
    let cx = 0, cy = 0, cz = 0, ymax = 0;
    for (const [c] of lobes) { cx += c.x; cy += c.y; cz += c.z; ymax = Math.max(ymax, c.y); }
    const centre = V3(cx / lobes.length, cy / lobes.length, cz / lobes.length);
    lobes.push([V3(centre.x, ymax + 0.6, centre.z), 2.0 + R() * 0.4]);
    for (let k = 0; k < 4; k++) {
      const [c] = lobes[Math.floor(R() * lobes.length)];
      lobes.push([c.clone().lerp(centre, 0.35).add(V3(0, -0.6, 0)), 1.3 + R() * 0.5]);
    }
    const tiles = [TILE.leafA, TILE.leafB, TILE.leafC, TILE.leafA, TILE.leafB];
    // built big, then scaled to 17-20 m (cards counted at the built size)
    const sc = (17.5 + R() * 2.5) / Math.max(...lobes.map(([c, r]) => c.y + r));
    for (const g of wood) g.scale(sc, sc, sc);
    centre.multiplyScalar(sc);
    for (const L of lobes) { puff(leaves, L[0].multiplyScalar(sc), L[1] * sc, Math.round(L[1] * L[1] * 14 + 8), tiles, R, centre); L[1] *= sc; }
    for (const [c, r] of lobes) { height = Math.max(height, c.y + r); radius = Math.max(radius, Math.hypot(c.x, c.z) + r); }
    bark = '#8e8a6c';
  }
  return {
    parts: [
      { geometry: mergeGeos(wood), material: barkMaterial(bark) },
      { geometry: toGeometry(leaves), material: leafMaterial(tint, kind === 'pine' ? 0.04 : 0.07) },
    ],
    height, radius,
  };
}

// A bush: a few overlapping puffs of small leaves (some with flowers).
export function makeBush(seed, { size = 1, flowers = null } = {}) {
  const R = rng(seed), leaves = cards();
  const centre = new THREE.Vector3(0, 0.55 * size, 0);
  const tiles = flowers ? [TILE.bushA, TILE.bushB, flowers] : [TILE.bushA, TILE.bushB, TILE.leafC];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Vector3((R() - 0.5) * 0.8 * size, (0.45 + R() * 0.35) * size, (R() - 0.5) * 0.8 * size);
    const r = (0.45 + R() * 0.3) * size;
    puff(leaves, c, r, Math.round(30 + r * 34), tiles, R, centre);
  }
  return { parts: [{ geometry: toGeometry(leaves), material: leafMaterial('#ffffff', 0.03) }], height: size * 1.2, radius: size * 0.9 };
}

// Ivy on a wall: leaf cards lying flat on a w x h patch (facing +z), denser
// at the bottom, thinning in tendrils toward the top.
export function ivyGeometry(w, h, seed, density = 14) {
  const R = rng(seed), out = cards();
  const n = Math.round(w * h * density);
  const centre = new THREE.Vector3(0, h / 2, -2);
  for (let i = 0; i < n; i++) {
    const x = (R() - 0.5) * w, y = Math.pow(R(), 1.7) * h;
    if (y > h * 0.45 && Math.abs(Math.sin(x * 2.3)) > 0.55 && R() < 0.7) continue;  // tendrils
    pushCard(out, new THREE.Vector3(x, y, 0.03 + R() * 0.08), new THREE.Vector3((R() - 0.5) * 0.5, (R() - 0.5) * 0.3, 1).normalize(),
      0.35 + R() * 0.3, R() < 0.5 ? TILE.ivy : TILE.ivy2, R() * 6.28, centre, R() * 0.5);
  }
  return toGeometry(out);
}

// Hanging vines along an edge from a to b, each strand a column of leaf cards.
export function vineGeometry(a, b, strands, len, seed) {
  const R = rng(seed), out = cards();
  for (let s = 0; s < strands; s++) {
    const t = (s + R() * 0.7) / strands;
    const top = a.clone().lerp(b, t);
    const L = len * (0.35 + R() * 0.9);
    for (let y = 0; y < L; y += 0.16) {
      const p = top.clone().add(new THREE.Vector3(Math.sin(y * 3 + s) * 0.06, -y, 0.05 + R() * 0.05));
      pushCard(out, p, new THREE.Vector3((R() - 0.5) * 0.6, (R() - 0.5) * 0.4, 1).normalize(), 0.3 * (1 - y / L * 0.5) + 0.12,
        R() < 0.5 ? TILE.ivy : TILE.ivy2, R() * 6.28, p.clone().add(new THREE.Vector3(0, 0, -1)), 0.5 + R() * 0.5);
    }
  }
  return toGeometry(out);
}

// A green roof: a dense mat of small-leaf cards, grass and flowers on top of
// a slab of w x d at height 0 (local).
export function greenRoofGeometry(w, d, seed) {
  const R = rng(seed), out = cards();
  const n = Math.round(w * d * 9);
  const centre = new THREE.Vector3(0, -1.5, 0);
  for (let i = 0; i < n; i++) {
    const x = (R() - 0.5) * (w - 0.4), z = (R() - 0.5) * (d - 0.4);
    const r = R();
    const tile = r < 0.12 ? TILE.flowersY : r < 0.2 ? TILE.flowersR : r < 0.5 ? TILE.bushA : r < 0.75 ? TILE.bushB : TILE.fern;
    const p = new THREE.Vector3(x, 0.15 + R() * 0.25, z);
    pushCard(out, p, new THREE.Vector3((R() - 0.5) * 1.2, 0.8, (R() - 0.5) * 1.2).normalize(), 0.45 + R() * 0.35, tile, R() * 6.28, centre, R() * 0.4);
  }
  return toGeometry(out);
}

// A stylized rock: a lumpy smooth stone, grey below, mossy on top.
export function makeRock(seed, size = 1) {
  const R = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const k1 = R() * 10, k2 = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = 1 + Math.sin(v.x * 2.1 + k1) * 0.12 + Math.sin(v.z * 2.7 + k2) * 0.1 + Math.sin(v.y * 3.3) * 0.06;
    v.multiplyScalar(n); v.y *= 0.62; if (v.y < -0.1) v.y = -0.1 + (v.y + 0.1) * 0.3;
    p.setXYZ(i, v.x * size, (v.y + 0.25) * size, v.z * size);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, stone = new THREE.Color('#d3c09a'), dark = new THREE.Color('#a08c6c'), moss = new THREE.Color('#6f9a3e'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(dark).lerp(stone, Math.min(1, (p.getY(i) / size) * 1.2 + 0.3));
    c.lerp(moss, Math.max(0, nrm.getY(i) - 0.55) * 2.2);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { parts: [{ geometry: g, material: celify(new THREE.MeshLambertMaterial({ vertexColors: true }), { bands: [0.1, 0.32, 0.62], deep: [0.45, 0.5, 0.66], shade: [0.66, 0.72, 0.86], lit: [1.12, 1.1, 1.02] }) }], height: size * 0.9, radius: size };
}

// A low clump of flowers or ferns: crossed cards from the atlas.
export function makeClump(seed, tile, size = 1) {
  const R = rng(seed), out = cards();
  const n = 5 + Math.floor(R() * 4);
  const centre = new THREE.Vector3(0, -0.3, 0);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, d = R() * 0.35 * size;
    const p = new THREE.Vector3(Math.cos(a) * d, (0.22 + R() * 0.2) * size, Math.sin(a) * d);
    pushCard(out, p, new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)).normalize(), (0.5 + R() * 0.3) * size, tile, R() * 6.28, centre, 0.6);
  }
  return { parts: [{ geometry: toGeometry(out), material: leafMaterial('#ffffff', 0.02) }], height: size * 0.6, radius: size * 0.5 };
}
