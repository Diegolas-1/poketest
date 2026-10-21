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
// variant 'autumn' paints the broadleaf and bush tiles in reds and oranges
// (same layout and TILE indices; every other tile is the same)
const atlases = new Map();
export function leafAtlas(variant = 'green') {
  if (atlases.has(variant)) return atlases.get(variant);
  const fall = variant === 'autumn', LH = fall ? 14 : -16, SH = fall ? -12 : 22;
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
      if (up > 0.64) ctx.fillStyle = hsl(h + LH, s + 10, l + 14 + R() * 10);
      else if (up < 0.4) ctx.fillStyle = hsl(h + SH, s - 4, l - 13 - R() * 9);
      else continue;
      const ang = Math.PI * 0.5 + (R() - 0.5) * 2.2 + (x < C ? 0.4 : -0.4);
      brush(x, y, (14 + R() * 18) * k, (5 + R() * 4) * k, ang, (R() - 0.5) * 0.7);
    }
    ctx.restore();
  });
  if (fall) {   // maple reds, a scarlet, a crimson, orange and amber bushes
    dapple(TILE.leafA, 8, 78, 52); dapple(TILE.leafB, 22, 85, 55); dapple(TILE.leafC, 354, 66, 44);
    dapple(TILE.bushA, 34, 88, 55, 1.8); dapple(TILE.bushB, 14, 76, 50, 1.8);
  } else {
    dapple(TILE.leafA, 118, 52, 42);
    dapple(TILE.leafB, 108, 55, 45);
    dapple(TILE.leafC, 128, 48, 38);
    dapple(TILE.bushA, 116, 52, 41, 1.8);
    dapple(TILE.bushB, 126, 48, 38, 1.8);
  }
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
  atlases.set(variant, t);
  return t;
}

// The material for every leaf card: cut-out, double sided, with a little
// light through the leaves (backlit leaves glow warm) and soft wind.
export const foliageTime = { value: 0 };
// One wind for leaves and wood, so a leaf card and the branch under it move
// together: the phase comes from the tree's position (the instance's for an
// InstancedMesh, else the mesh's own, so trees placed one by one still differ),
// and the bend grows smoothly with height (a smoothstep over 8 m: quadratic at
// the root, so the base stays planted, rigid above, so nothing shears).
const swayGLSL = (wind) => `
      #ifdef USE_INSTANCING
        vec3 ip = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
      #else
        vec3 ip = modelMatrix[3].xyz;
      #endif
      float sway = sin(uTime * 1.2 + ip.x * 0.2 + ip.z * 0.17) * 0.6 + sin(uTime * 2.3 + ip.x * 0.5) * 0.25;
      float k = clamp(position.y / 8.0, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
      transformed.x += sway * ${wind.toFixed(3)} * k * 3.0;
      transformed.z += sway * ${(wind * 0.6).toFixed(3)} * k * 3.0;`;
const FLUTTER = `
      transformed += normal * sin(uTime * 4.0 + flutter * 30.0) * 0.03 * flutter;`;
// vertex wind for a material (leaves add the per-card flutter)
function windVertex(sh, wind, leaf) {
  sh.uniforms.uTime = foliageTime;
  sh.vertexShader = 'uniform float uTime;\n' + (leaf ? 'attribute float flutter;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>' + swayGLSL(wind) + (leaf ? FLUTTER : ''));
}
// Shadows: the shadow pass draws with the mesh's customDepthMaterial, which
// three looks up on the object, not the material. Meshes are made in other
// files, so Mesh.prototype gets a getter that hands out a swaying depth
// material for our wind materials (set one by hand and it wins as before).
// Only the sun casts shadows, so no customDistanceMaterial is needed.
const windDepth = new WeakMap();
if (!Object.getOwnPropertyDescriptor(THREE.Mesh.prototype, 'customDepthMaterial')) {
  Object.defineProperty(THREE.Mesh.prototype, 'customDepthMaterial', {
    configurable: true,
    get() { return this._customDepth !== undefined ? this._customDepth : Array.isArray(this.material) ? undefined : windDepth.get(this.material); },
    set(v) { this._customDepth = v; },
  });
}
function addWindDepth(m, wind, leaf) {
  // the renderer copies map, alphaTest and side from m each draw, so leaf
  // cut-outs stay cut out in the shadow
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => windVertex(sh, wind, leaf);
  d.customProgramCacheKey = () => 'winddepth' + wind + (leaf ? 'leaf' : 'wood');
  windDepth.set(m, d);
}
const leafMats = new Map();
export function leafMaterial(tint = '#ffffff', wind = 0.08, variant = 'green') {
  const key = tint + wind + variant;
  if (leafMats.has(key)) return leafMats.get(key);
  const m = new THREE.MeshLambertMaterial({ map: leafAtlas(variant), color: new THREE.Color(tint), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    windVertex(sh, wind, true);
    // cards seen edge-on thin out, so no flat streaks or straight seams show
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
      vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
      float edgeOn = abs(dot(fN, normalize(vViewPosition)));
      vec2 tl = fract(vMapUv * 4.0) - 0.5;
      if (diffuseColor.a < alphaTest || length(tl) > mix(0.0, 0.75, smoothstep(0.1, 0.5, edgeOn))) discard;`);
  };
  m.customProgramCacheKey = () => 'leaf' + wind;
  // green leaves go teal in shade and yellow-green in sun; autumn leaves go
  // plum in shade and golden in sun (the green numbers would turn red olive)
  const fall = variant === 'autumn';
  celify(m, { ao: true, noflip: true, detail: 0.55, mid: fall ? 0.3 : 0.26, bands: [0.24, 0.44, 0.57], soft: 0.02,
    deep: fall ? [0.32, 0.12, 0.26] : [0.13, 0.33, 0.6], shade: fall ? [0.62, 0.36, 0.48] : [0.36, 0.66, 0.9],
    lit: fall ? [1.2, 1.18, 0.75] : [1.45, 1.3, 0.62], litAdd: fall ? [0.06, 0.04, 0.0] : [0.07, 0.08, 0.0] });
  addWindDepth(m, wind, true);
  leafMats.set(key, m);
  return m;
}

// Barks: painted like an anime background, in broad flat brush strokes on a
// canvas that tiles both ways (so no seams band the trunk): a few tones of
// the colour in long vertical strokes, the lit ridges as long pale dabs,
// fissures as soft dark streaks with a few darker accents. Styles:
//  ridged  furrowed (oak, old trees)    smooth  pale thin bark (young trees)
//  dead    weathered grey, long splits  birch   white with black marks
//  flaky   orange papery plates (pine)
// Ridged and smooth get a little moss low on one side (in the shader).
const barkMats = new Map();
// wind: the same sway as the leaves (pass the tree's leaf wind; 0 = rigid).
export function barkMaterial(color = '#7a5638', style = 'ridged', wind = 0.07) {
  const key = color + style + wind;
  if (barkMats.has(key)) return barkMats.get(key);
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(color), R = rng(77 + style.length);
  const dark = new THREE.Color(style === 'birch' ? '#1e1d1c' : '#2a2a22'), light = new THREE.Color(style === 'dead' || style === 'birch' ? '#f6f4ec' : style === 'flaky' ? '#f4cf9a' : '#ece4c2');
  const col = (k) => '#' + (k < 0 ? base.clone().lerp(dark, -k) : base.clone().lerp(light, k)).getHexString();
  // draw f at every wrapped offset, so shapes crossing an edge come back on the other side
  const wrap = (f) => { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) { ctx.save(); ctx.translate(ox, oy); f(); ctx.restore(); } };
  // one brush stroke: pointed ends, widest a third of the way down, a slight lean
  const stroke = (x, y, len, w, k, lean = (R() - 0.5) * 10, ang = 0) => wrap(() => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = col(k);
    const b = 0.25 + R() * 0.2, wl = w * (0.8 + R() * 0.4);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w, len * b, -wl * 0.7 + lean, len * 0.75, lean, len);
    ctx.bezierCurveTo(wl * 0.6 + lean, len * 0.7, w * 0.9, len * b * 0.8, 0, 0);
    ctx.fill(); ctx.restore();
  });
  const rx = () => R() * W, ry = () => R() * H;
  ctx.fillStyle = col(0); ctx.fillRect(0, 0, W, H);
  if (style === 'birch') {
    for (let i = 0; i < 12; i++) stroke(rx(), ry(), 200 + R() * 260, 16 + R() * 18, (R() - 0.5) * 0.12);
    for (let i = 0; i < 10; i++) stroke(rx(), ry(), 70 + R() * 120, 5 + R() * 6, -0.18);   // soft grey shading streaks
    for (let i = 0; i < 44; i++) stroke(rx(), ry(), 18 + R() * 46, 2.5 + R() * 3, -0.85, (R() - 0.5) * 6, Math.PI / 2 + (R() - 0.5) * 0.25);   // lenticels: dark horizontal dashes
    for (let i = 0; i < 3; i++) {   // black chevron patches where twigs fell
      const x = rx(), y = ry(), s = 16 + R() * 14;
      stroke(x, y, s * 2.2, s * 0.5, -0.9, 0, Math.PI / 2 + 0.45); stroke(x, y, s * 2.2, s * 0.5, -0.9, 0, Math.PI / 2 + 2.7);
    }
    for (let i = 0; i < 10; i++) stroke(rx(), ry(), 50 + R() * 100, 4 + R() * 5, 0.6);
  } else if (style === 'flaky') {
    for (let i = 0; i < 16; i++) stroke(rx(), ry(), 140 + R() * 220, 18 + R() * 20, (R() - 0.5) * 0.2);
    for (let i = 0; i < 22; i++) {   // papery plates: short broad patches with a dark edge under them
      const x = rx(), y = ry(), w = 14 + R() * 16, l = 30 + R() * 40;
      stroke(x + 2, y + 6, l, w, -0.4); stroke(x, y, l, w, R() < 0.5 ? 0.18 : -0.08);
    }
    for (let i = 0; i < 12; i++) stroke(rx(), ry(), 40 + R() * 80, 3 + R() * 4, 0.45);
  } else if (style === 'smooth') {
    for (let i = 0; i < 14; i++) stroke(rx(), ry(), 200 + R() * 260, 18 + R() * 22, (R() - 0.5) * 0.14);
    for (let i = 0; i < 6; i++) stroke(rx(), ry(), 80 + R() * 120, 3 + R() * 4, -0.32);
    for (let i = 0; i < 3; i++) { const x = rx(), y = ry(); stroke(x, y, 22 + R() * 14, 6, -0.55, 0, Math.PI / 2 + (R() - 0.5) * 0.3); stroke(x - 4, y - 5, 20, 3, 0.35, 0, Math.PI / 2); }   // eyes where twigs were
    for (let i = 0; i < 14; i++) stroke(rx(), ry(), 60 + R() * 140, 4 + R() * 6, 0.32);
  } else {
    const dead = style === 'dead';
    for (let i = 0; i < 18; i++) stroke(rx(), ry(), 160 + R() * 260, 16 + R() * 18, (R() - 0.5) * 0.24);   // broad tones
    for (let i = 0; i < (dead ? 9 : 12); i++) stroke(rx(), ry(), (dead ? 260 : 130) + R() * 220, (dead ? 3 : 5) + R() * 4, dead ? -0.62 : -0.48);   // fissures
    for (let i = 0; i < 8; i++) stroke(rx(), ry(), 30 + R() * 50, 3 + R() * 3, -0.68);   // dark accents
    for (let i = 0; i < 12; i++) stroke(rx(), ry(), 110 + R() * 160, 6 + R() * 6, dead ? 0.5 : 0.32);   // lit ridges: long pale dabs
    for (let i = 0; i < 5; i++) stroke(rx(), ry(), 50 + R() * 60, 3 + R() * 2, dead ? 0.7 : 0.5);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: t });
  const mossy = style === 'ridged' || style === 'smooth';
  // moss: low on the trunk, on the side facing -x -z, breaking up along the bark's grooves
  const moss = new THREE.Color('#6f9a3e');
  if (mossy || wind > 0) {
    m.onBeforeCompile = (sh) => {
      if (mossy) {
        // vMP is the rest position (before the wind), so the moss stays on the bark
        sh.vertexShader = 'varying vec3 vMP, vMN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMP = position; vMN = objectNormal;');
        sh.fragmentShader = 'varying vec3 vMP, vMN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        // a ragged line that rises and falls round the trunk, patches along the ridges
        float ang = atan(vMP.z, vMP.x), top = 1.1 + 0.6 * sin(ang * 3.0 + 1.3) + 0.3 * sin(ang * 7.0);
        float mz = smoothstep(top, top - 0.9, vMP.y) * smoothstep(-0.1, 0.5, dot(normalize(vMN), normalize(vec3(-0.7, 0.15, -0.7))));
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1)) / max(dot(diffuse, vec3(0.3, 0.6, 0.1)), 1e-3);
        float mm = smoothstep(0.0, 0.04, mz - (1.0 - lum * 1.6) * 0.7);
        vec3 mc = mix(vec3(${moss.r.toFixed(3)}, ${moss.g.toFixed(3)}, ${moss.b.toFixed(3)}) * 0.6, vec3(${moss.r.toFixed(3)}, ${moss.g.toFixed(3)}, ${moss.b.toFixed(3)}) * 1.25, step(0.5, lum * 2.2));
        diffuseColor.rgb = mix(diffuseColor.rgb, mc, mm * 0.85);`);
      }
      if (wind > 0) windVertex(sh, wind, false);
    };
    m.customProgramCacheKey = () => 'bark' + (mossy ? 'moss' : '') + wind;
    if (wind > 0) addWindDepth(m, wind, false);
  }
  celify(m, { bands: [0.1, 0.3, 0.6], deep: [0.4, 0.48, 0.62], shade: [0.6, 0.68, 0.82], lit: [1.12, 1.1, 1.0], detail: 0.25, mid: 0.35 });
  barkMats.set(key, m);
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
    pushCard(out, p, facing, r * (0.9 + R() * 0.45) * treeDetail.grow, tiles[Math.floor(R() * tiles.length)], R() * 6.28, centre, R());
    out.ao = 1;
  }
}

// A tapered tube along a path of points (trunks and branches).
// A tapering tube along a smooth curve through points, built by hand so
// every piece of wood reads as one continuous surface:
//  - rings follow rotation-minimizing frames (no twists or pinches on bends);
//  - normals are exact (round the curve, tilted by the taper) and the seam
//    column shares them, so the cel shading shows no crack down the side and
//    gnarlGeo pushes both copies of a seam vertex the same way;
//  - both ends are closed with a rounded dome (o.cap = false leaves them
//    open), so a limb forking off the end of its parent grows out of a
//    rounded knuckle instead of an open ring or a flat ledge.
// u wraps round the tube (repeats every ~1.6 m of girth), v runs along it
// (one repeat per 3.2 m), so the bark keeps its proportions on every limb.
function tube(points, r0, r1, sides = 7, o = {}) {
  const cap = o.cap ?? true;
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(4, points.length * 4);
  const L = curve.getLength(), ur = Math.max(1, Math.round((Math.PI * (r0 + r1)) / 1.6));
  // rotation-minimizing frames by double reflection (Wang et al. 2008)
  const P = [], T = [], N = [];
  for (let i = 0; i <= segs; i++) { P.push(curve.getPointAt(i / segs)); T.push(curve.getTangentAt(i / segs).normalize()); }
  const t0 = T[0], helper = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(new THREE.Vector3().crossVectors(helper, t0).normalize());
  for (let i = 0; i < segs; i++) {
    const v1 = P[i + 1].clone().sub(P[i]), c1 = v1.dot(v1);
    if (c1 < 1e-12) { N.push(N[i].clone()); continue; }
    const rL = N[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(N[i]));
    const tL = T[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(T[i]));
    const v2 = T[i + 1].clone().sub(tL), c2 = v2.dot(v2);
    const n = c2 < 1e-12 ? rL : rL.addScaledVector(v2, (-2 / c2) * v2.dot(rL));
    N.push(n.addScaledVector(T[i + 1], -n.dot(T[i + 1])).normalize());
  }
  // rows: [centre, tangent, normal, radius along the ring, push along tangent, v]
  const slope = (r0 - r1) / Math.max(L, 1e-3), rows = [], CAP = [0.5, 0.82, 1];   // dome rings (fraction of 90 degrees)
  const domeRows = (i, sgn, r) => CAP.map((f) => [P[i], T[i], N[i], r * Math.cos(f * Math.PI / 2), sgn * r * Math.sin(f * Math.PI / 2), f]);
  if (cap) rows.push(...domeRows(0, -1, r0).reverse());
  for (let i = 0; i <= segs; i++) rows.push([P[i], T[i], N[i], r0 + (r1 - r0) * (i / segs), 0, -1, i / segs]);
  if (cap) rows.push(...domeRows(segs, 1, r1));
  const nr = rows.length, cols = sides + 1, pos = new Float32Array(nr * cols * 3), nor = new Float32Array(nr * cols * 3), uv = new Float32Array(nr * cols * 2);
  const B = new THREE.Vector3(), rad = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let k = 0; k < nr; k++) {
    const [c, t, n, r, push, f, tt] = rows[k];
    B.crossVectors(t, n);
    // v: along the body by length; the domes carry on a little past each end
    const v = f < 0 ? (tt * L) / 3.2 : push < 0 ? (push / 3.2) : (L + push) / 3.2;
    for (let j = 0; j < cols; j++) {
      const a = ((j % sides) / sides) * Math.PI * 2;   // the seam column repeats column 0 exactly
      rad.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      const q = (k * cols + j) * 3;
      pos[q] = c.x + rad.x * r + t.x * push; pos[q + 1] = c.y + rad.y * r + t.y * push; pos[q + 2] = c.z + rad.z * r + t.z * push;
      if (f < 0) nn.copy(rad).addScaledVector(t, slope);   // the body: tilted by the taper
      else { const ang = f * Math.PI / 2; nn.copy(rad).multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sign(push) * Math.sin(ang)); }
      nn.normalize(); nor[q] = nn.x; nor[q + 1] = nn.y; nor[q + 2] = nn.z;
      uv[(k * cols + j) * 2] = (j / sides) * ur; uv[(k * cols + j) * 2 + 1] = v;
    }
  }
  const idx = [];
  for (let k = 0; k < nr - 1; k++) for (let j = 0; j < sides; j++) {
    const a = k * cols + j, b2 = (k + 1) * cols + j, c2 = (k + 1) * cols + j + 1, d = k * cols + j + 1;
    idx.push(a, d, b2, b2, d, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.tube = { rows: nr, cols, body: [cap ? CAP.length : 0, segs + 1] };
  return g;
}
// Recomputes normals, then gives every set of vertices at the same spot one
// shared normal (the tube's seam column, the dome tips): no shading cracks.
function weldNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, m = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i); let s = m.get(k);
    if (!s) m.set(k, (s = [0, 0, 0]));
    s[0] += n.getX(i); s[1] += n.getY(i); s[2] += n.getZ(i);
  }
  for (let i = 0; i < p.count; i++) {
    const s = m.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1;
    n.setXYZ(i, s[0] / l, s[1] / l, s[2] / l);
  }
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

// ---------- tree building blocks ----------
// Leaf detail for the big painted trees: k scales how many cards a lobe gets
// (the game uses fewer), grow makes each card a little bigger to make up.
export const treeDetail = { k: 1, grow: 1 };
export function setTreeDetail(k) { treeDetail.k = k; treeDetail.grow = 1 + (1 - k) * 0.45; }
// A lobe of leaf cards on an ellipsoid (rx wide, ry tall): one mass of a
// canopy. Its underside sits in deep shade, so stacked masses read apart.
function lobe(out, c, rx, ry, n, tiles, R, treeCenter) {
  const centre = c.clone().lerp(treeCenter, 0.12).add(new THREE.Vector3(0, -ry * 0.25, 0));
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(rr * Math.cos(a), u * 0.9 + 0.12, rr * Math.sin(a)).normalize();
    const depth = 0.4 + Math.sqrt(R()) * 0.6;
    const p = c.clone().add(new THREE.Vector3(d.x * rx, d.y * ry, d.z * rx).multiplyScalar(depth));
    const facing = d.clone().lerp(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5), 0.25).normalize();
    out.ao = Math.max(0.12, Math.min(1, 0.22 + depth * 0.45 + (d.y + 1) * 0.22 - (d.y < -0.25 ? 0.24 : 0)));
    pushCard(out, p, facing, (rx + ry) * 0.5 * (0.85 + R() * 0.4) * treeDetail.grow, tiles[Math.floor(R() * tiles.length)], R() * 6.28, centre, R());
    out.ao = 1;
  }
}
// One stretched card from a down to b, w wide along side, normals leaning
// out along nrm (willow strands).
function ribbon(out, a, b, side, w, nrm, tile, flutter, ao) {
  const tx = (tile % 4) / 4, ty = 1 - (Math.floor(tile / 4) + 1) / 4, base = out.pos.length / 3;
  const n = nrm.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize(), hw = side.clone().normalize().multiplyScalar(w / 2);
  for (const [p, uu, vv] of [[a.clone().sub(hw), 0, 1], [a.clone().add(hw), 1, 1], [b.clone().add(hw), 1, 0], [b.clone().sub(hw), 0, 0]]) {
    out.pos.push(p.x, p.y, p.z); out.nor.push(n.x, n.y, n.z);
    out.uv.push(tx + uu * 0.245 + 0.0025, ty + vv * 0.245 + 0.0025); out.fl.push(flutter); out.col.push(ao, ao, ao);
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// Pushes a tube's surface in and out along its normals: fluting and burls.
function gnarlGeo(g, amt, R, f = 1.3) {
  const p = g.attributes.position, n = g.attributes.normal, k = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = amt * (Math.sin(Math.atan2(z, x) * 5 + y * 0.35 + k) * 0.75 + Math.sin(y * f * 0.35 + x * 1.3 + k) * 0.25);
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  return weldNormals(g);
}
// A curving limb from p along dir that forks until level o.lv; pushes its
// tubes into wood and [end, dir, mid] of every tip into tips.
//  o: up (bend toward the sky per step), wob, kids [min, max], keep (how much
//  of the parent's heading a child keeps), spread, rise, shrink, droop
// A branch's curve with a lead-in: it starts back inside its parent, along
// the parent's heading (pd), so it grows out of the parent's wood like a
// real crotch instead of starting as a ring stuck on its surface.
const UP = new THREE.Vector3(0, 1, 0);
const leadIn = (pts, pd, d) => [pts[0].clone().addScaledVector(pd, -d), ...pts];
// a root flare starts on the trunk's axis a little above its old start, so
// its top end is buried in the trunk instead of poking out of the bark
const root = (pts) => [new THREE.Vector3(0, pts[0].y + 0.6, 0), ...pts];
function limb(wood, R, p, dir, len, r, lv, o, tips, pd = UP) {
  const d = dir.clone().normalize(), pts = [p.clone()];
  for (let i = 1; i <= 3; i++) {
    d.y += o.up * (1 - d.y) - (o.droop || 0) * i; d.add(new THREE.Vector3((R() - 0.5) * o.wob, (R() - 0.5) * o.wob * 0.4, (R() - 0.5) * o.wob)).normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, len / 3));
  }
  const r1 = r * 0.6;
  wood.push(tube(leadIn(pts, pd, r * 1.5), r, r1, lv + 1 >= o.lv ? 5 : 7));
  if (lv >= o.lv) { tips.push([pts[3], d.clone(), pts[2], len]); return; }
  const n = o.kids[0] + Math.floor(R() * (o.kids[1] - o.kids[0] + 1)), a0 = R() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + (R() - 0.5) * 0.8;
    const cd = d.clone().multiplyScalar(o.keep).add(new THREE.Vector3(Math.cos(a), o.rise, Math.sin(a)).multiplyScalar(o.spread));
    limb(wood, R, i === 0 ? pts[3] : pts[R() < 0.5 ? 2 : 3], cd, len * (o.shrink + R() * 0.15), r1 * 0.9, lv + 1, o, tips, d);
  }
}
// Masses on the shell of an ellipsoid (centre c, half sizes ax ay az): n of
// size r spread evenly (golden spiral), flattened by fl; skip = the share of
// the bottom left open (where the trunk comes in).
function domeLobes(lobes, c, ax, ay, az, n, r, fl, R, skip = 0.15) {
  for (let i = 0; i < n; i++) {
    const u = 1 - ((i + 0.5) / n) * (2 - skip * 2), a = i * 2.39996 + R() * 0.4, rr = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(rr * Math.cos(a), u, rr * Math.sin(a));
    const k = 0.78 + R() * 0.14;
    lobes.push({ c: new THREE.Vector3(c.x + d.x * ax * k, c.y + d.y * ay * k, c.z + d.z * az * k), rx: r * (0.85 + R() * 0.3), ry: r * fl * (0.85 + R() * 0.3) });
  }
}
// Scales wood and lobes ({c, rx, ry}) so the top lands at height h (when
// given), then fills the lobes with cards. Returns {height, radius}.
function crown(leaves, wood, lobes, h, tiles, R, dens = 16, fill = 0) {
  // filler masses tucked in between the others, lower and in shade: a full crown
  if (lobes.length) {
    const m = new THREE.Vector3(); for (const L of lobes) m.add(L.c); m.multiplyScalar(1 / lobes.length);
    for (let k = 0; k < fill; k++) {
      const A = lobes[Math.floor(R() * lobes.length)], B = lobes[Math.floor(R() * lobes.length)];
      lobes.push({ c: A.c.clone().lerp(B.c, 0.5).lerp(m, 0.3).add(new THREE.Vector3(0, -0.4, 0)), rx: (A.rx + B.rx) * 0.55, ry: (A.ry + B.ry) * 0.5 });
    }
  }
  let top = 0; for (const L of lobes) top = Math.max(top, L.c.y + L.ry);
  for (const g of wood) g.computeBoundingBox();
  for (const g of wood) top = Math.max(top, g.boundingBox.max.y);
  const sc = h ? h / top : 1;
  if (sc !== 1) for (const g of wood) g.scale(sc, sc, sc);
  const centre = new THREE.Vector3();
  for (const L of lobes) centre.add(L.c); centre.multiplyScalar(sc / Math.max(1, lobes.length));
  let height = top * sc, radius = 0;
  for (const L of lobes) {
    const n = Math.round((L.rx * L.ry * dens + 8) * treeDetail.k);
    L.c.multiplyScalar(sc);
    lobe(leaves, L.c, L.rx * sc, L.ry * sc, n, L.tiles || tiles, R, centre);
    radius = Math.max(radius, Math.hypot(L.c.x, L.c.z) + L.rx * sc);
  }
  for (const g of wood) { g.computeBoundingBox(); const b = g.boundingBox; radius = Math.max(radius, Math.hypot(Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z))); }
  return { height, radius };
}

// ---------- trees ----------
// Returns a model {parts:[{geometry, material}], height, radius} that the
// Scatter and Impostor code in assets.js can use directly.
export function makeTree(kind, seed) {
  const R = rng(seed);
  const leaves = cards(), wood = [];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  let height = 0, radius = 0, bark = '#7a5638', barkStyle = 'ridged', tint = '#ffffff', wind = kind === 'pine' ? 0.04 : 0.07, leafVar = 'green', extraWood = null;
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
    const gnarl = (g, amt, f) => gnarlGeo(g, amt, R, f);
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
      wood.push(gnarl(tube(root([V3(0, 2.0 + R() * 0.9, 0).addScaledVector(dir, 0.35), V3(0, 0.6, 0).addScaledVector(dir, 1.15),
        V3(0, 0.05, 0).addScaledVector(dir, d * 0.75), V3(0, -0.35, 0).addScaledVector(dir, d)]), 0.6, 0.08, 7), 0.05, 2));
    }
    const top = trunk[trunk.length - 1], lobes = [];
    // a curving branch from p along dir; recurses, leaving lobes at the tips
    const branch = (p, dir, len, r, lv, pd = UP) => {
      const d = dir.clone().normalize(), pts = [p.clone()];
      for (let i = 1; i <= 3; i++) {
        d.y += 0.1 * (lv + 0.6) * (1 - d.y); d.add(J(0.35)).normalize();   // bends upward as it goes
        pts.push(pts[i - 1].clone().addScaledVector(d, len / 3));
      }
      const end = pts[3], r1 = r * 0.6;
      wood.push(tube(leadIn(pts, pd, r * 1.5), r, r1, lv < 1 ? 9 : lv < 2 ? 7 : 6));
      if (lv >= 2) {   // tips: a big lobe at the end, sometimes a smaller one along it
        lobes.push([end.clone().addScaledVector(d, 0.5).add(V3(0, 0.5, 0)), 1.35 + R() * 0.7]);
        if (R() < 0.7) lobes.push([pts[1].clone().lerp(pts[2], R()).add(V3((R() - 0.5) * 1.2, 0.9, (R() - 0.5) * 1.2)), 0.95 + R() * 0.5]);
        return;
      }
      const n = lv ? 2 + Math.floor(R() * 2) : 3, a0 = R() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.28 + (R() - 0.5) * 0.8;
        const cd = d.clone().multiplyScalar(0.9).add(V3(Math.cos(a), 0.1, Math.sin(a)).multiplyScalar(0.8));
        branch(i === 0 ? end : pts[1 + (R() < 0.5 ? 1 : 2)], cd, len * (0.6 + R() * 0.2), r1 * 0.9, lv + 1, d);
      }
      if (lv === 1 && R() < 0.5) lobes.push([pts[2].clone().add(V3(0, 0.8, 0)), 1.0 + R() * 0.4]);
    };
    // 2-3 leaders out of the crown, plus a couple of low limbs off the trunk
    const nl = 2 + Math.floor(R() * 2), b0 = R() * 6.28;
    const tUp = top.clone().sub(trunk[trunk.length - 2]).normalize();   // the trunk's heading at the top: leaders lead in along it
    branch(top.clone().add(V3(0, -0.4, 0)), V3(Math.cos(la) * 0.15, 1, Math.sin(la) * 0.15), 4.0 + R() * 0.8, 0.68, 0, tUp);   // the tall central leader
    for (let i = 0; i < nl; i++) {
      const a = b0 + (i / nl) * 6.28 + (R() - 0.5) * 0.6;
      branch(top.clone().add(V3(0, -0.8, 0)), V3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), 3.0 + R() * 0.8, 0.52, 0, tUp);
    }
    for (let i = 0; i < 3; i++) {   // lower limbs in tiers
      const p = trunk[i ? 5 : 4].clone().add(V3(0, i === 2 ? -0.9 : 0, 0)), a = b0 + 1.2 + i * 2.2 + R() * 0.6;
      const k = i ? 5 : 4;
      branch(p, V3(Math.cos(a), 0.3, Math.sin(a)), (i ? 3.0 : 4.0) + R() * 0.8, 0.4, 1, trunk[k + 1].clone().sub(trunk[k - 1]).normalize());
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
    for (const L of lobes) { puff(leaves, L[0].multiplyScalar(sc), L[1] * sc, Math.round((L[1] * L[1] * 14 + 8) * treeDetail.k), tiles, R, centre); L[1] *= sc; }
    for (const [c, r] of lobes) { height = Math.max(height, c.y + r); radius = Math.max(radius, Math.hypot(c.x, c.z) + r); }
    bark = '#8e8a6c';
  } else if (kind === 'tiered') {
    // the show's big park tree: a slim pale trunk forking low, under a canopy
    // of broad masses stacked in tiers (a low sweeping tier, a big middle
    // one, a domed top), side masses poking out on one side
    const s = R() < 0.5 ? 1 : -1;   // which side the side masses are on
    const fork = V3(0.1 * s, 2.8 + R() * 0.5, 0);
    // the trunk stops a little under the fork and the two stems start back
    // down inside it, wider than it there: the fork is one piece of wood
    const tdir = fork.clone().sub(V3(-0.08 * s, 1.4, 0.05)).normalize();
    wood.push(gnarlGeo(tube([V3(0, -0.4, 0), V3(-0.08 * s, 1.4, 0.05), fork.clone().addScaledVector(tdir, -0.45)], 0.5, 0.37, 9), 0.05, R));
    const stA = [fork, V3(-0.5 * s, 5.8, 0.2), V3(-0.3 * s, 9.2, 0.1), V3(0, 11.6, 0)];
    const stB = [fork, V3(0.9 * s, 4.9, -0.2), V3(1.7 * s, 7.0, -0.3), V3(2.2 * s, 8.8, 0)];
    wood.push(tube(leadIn(stA, tdir, 0.9), 0.43, 0.14, 8), tube(leadIn(stB, tdir, 0.9), 0.4, 0.12, 8));
    // tiers: [y, x offset, width, mass count, mass size, mass height]
    const tiers = [[5.9, 0.6 * s, 5.6, 7, 2.4, 0.95], [8.7, -0.3 * s, 4.6, 6, 2.3, 1.05], [11.4, 0.1 * s, 2.6, 4, 2.4, 1.25]];
    const lobes = [], stem = (y) => (y < 6.5 ? stB[1] : y < 9.5 ? stA[2] : stA[3]);
    for (const [y, ox, w, n, sz, hh] of tiers) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + R() * 0.6, rr = i === 0 ? 0 : w * (0.45 + R() * 0.25);
        const c = V3(ox + Math.cos(a) * rr, y + (R() - 0.5) * 0.4 + (i === 0 ? 0.3 : 0), Math.sin(a) * rr * 0.7);
        lobes.push({ c, rx: sz * (0.8 + R() * 0.35), ry: sz * hh * 0.55 * (0.85 + R() * 0.3) });
        // a branch from the stem up into the mass
        const from = stem(y).clone().lerp(stem(y - 2), 0.5);
        wood.push(tube([from, from.clone().lerp(c, 0.5).add(V3(0, 0.25, 0)), c.clone().add(V3(0, -0.5, 0))], 0.12, 0.05, 5));
      }
    }
    // side masses poking out on one side, smaller, at three heights
    for (const [y, x, r] of [[10.4, 3.9, 1.3], [8.0, 4.6, 1.5], [6.0, 4.9, 1.25]]) {
      const c = V3(x * s, y + (R() - 0.5) * 0.4, (R() - 0.5) * 1.2);
      lobes.push({ c, rx: r, ry: r * 0.9 });
      const from = stB[3].clone().lerp(stB[2], y < 7 ? 1 : 0.2);
      wood.push(tube([from, from.clone().lerp(c, 0.5).add(V3(0, 0.3, 0)), c.clone().add(V3(-0.4 * s, -0.3, 0))], 0.11, 0.05, 5));
    }
    ({ height, radius } = crown(leaves, wood, lobes, 13 + R() * 1.5, [TILE.leafA, TILE.leafB, TILE.leafA, TILE.leafC], R, 17));
    bark = '#a8a586'; barkStyle = 'smooth';
  } else if (kind === 'giant') {
    // a tall straight forest canopy tree: a long clear bole on root flares,
    // limbs only in the top third, a tall rounded crown of many masses
    const th = 13 + R() * 2, trunk = [V3(0, -0.6, 0)];
    for (let i = 1; i <= 5; i++) trunk.push(V3((R() - 0.5) * 0.4, (th * i) / 5, (R() - 0.5) * 0.4));
    wood.push(gnarlGeo(tube(trunk, 0.95, 0.42, 11), 0.07, R));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + R() * 0.8, dir = V3(Math.cos(a), 0, Math.sin(a));
      wood.push(tube(root([V3(0, 1.6, 0).addScaledVector(dir, 0.3), V3(0, 0.4, 0).addScaledVector(dir, 1.0), V3(0, -0.3, 0).addScaledVector(dir, 1.8)]), 0.45, 0.08, 6));
    }
    const tips = [], o = { up: 0.16, wob: 0.35, kids: [2, 3], keep: 0.8, spread: 0.75, rise: 0.25, shrink: 0.6, lv: 2 };
    const nl = 6 + Math.floor(R() * 2);
    for (let i = 0; i < nl; i++) {
      const t = 0.62 + (i / nl) * 0.36, p = trunk[Math.min(5, Math.round(t * 5))].clone().lerp(trunk[5], t - 0.6), a = i * 2.4 + R() * 0.5;
      limb(wood, R, p, V3(Math.cos(a), 0.55 + t * 0.6, Math.sin(a)), 3.4 + R() * 1.2 - (t - 0.6) * 3, 0.32 - (t - 0.6) * 0.3, 1, o, tips);
    }
    const lobes = tips.map(([e, d]) => ({ c: e.clone().addScaledVector(d, 0.4).add(V3(0, 0.4, 0)), rx: 2.0 + R() * 0.7, ry: 1.7 + R() * 0.5 }));
    lobes.push({ c: trunk[5].clone().add(V3(0, 3.2, 0)), rx: 2.6, ry: 2.2 });
    ({ height, radius } = crown(leaves, wood, lobes, 21 + R() * 1.5, [TILE.leafC, TILE.leafA, TILE.leafB], R, 15, 12));
    bark = '#857a62';
  } else if (kind === 'spreading') {
    // a broad old field oak: a short thick bole, heavy limbs reaching out
    // almost level, a wide low dome of masses much wider than it is tall
    const th = 3.0 + R() * 0.6;
    wood.push(gnarlGeo(tube([V3(0, -0.5, 0), V3(0.1, th * 0.5, 0.05), V3(0, th, 0)], 1.0, 0.8, 12), 0.1, R));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + R() * 0.6, dir = V3(Math.cos(a), 0, Math.sin(a));
      wood.push(gnarlGeo(tube(root([V3(0, 1.3, 0).addScaledVector(dir, 0.4), V3(0, 0.3, 0).addScaledVector(dir, 1.2), V3(0, -0.3, 0).addScaledVector(dir, 2.0)]), 0.5, 0.08, 6), 0.04, R));
    }
    const tips = [], o = { up: 0.06, wob: 0.5, kids: [2, 3], keep: 0.75, spread: 0.7, rise: 0.15, shrink: 0.62, lv: 2 };
    const nl = 5 + Math.floor(R() * 2), a0 = R() * 6.28;
    for (let i = 0; i < nl; i++) {
      const a = a0 + (i / nl) * 6.28 + (R() - 0.5) * 0.5;
      limb(wood, R, V3(0, th - 0.3, 0), V3(Math.cos(a), 0.45 + R() * 0.25, Math.sin(a)), 4.6 + R() * 1.2, 0.48, 0, o, tips);
    }
    const lobes = tips.map(([e, d, m]) => ({ c: e.clone().add(V3(0, 0.6, 0)), rx: 2.2 + R() * 0.6, ry: 1.55 + R() * 0.35 }));
    for (const [e, , m] of tips) if (R() < 0.35) lobes.push({ c: m.clone().add(V3(0, 1.0, 0)), rx: 1.3, ry: 1.0 });
    lobes.push({ c: V3(0, th + 5.2, 0), rx: 3.0, ry: 1.7 });
    ({ height, radius } = crown(leaves, wood, lobes, 11 + R() * 1.5, [TILE.leafA, TILE.leafB, TILE.leafC, TILE.leafA], R, 12, 8));
    bark = '#7a6c55';
  } else if (kind === 'multistem') {
    // three or four stems from one root, leaning apart, crowns merging
    const ns = 3 + Math.floor(R() * 2), a0 = R() * 6.28, tips = [], lobes = [];
    const o = { up: 0.14, wob: 0.4, kids: [2, 3], keep: 0.8, spread: 0.7, rise: 0.3, shrink: 0.62, lv: 2 };
    wood.push(gnarlGeo(tube([V3(0, -0.4, 0), V3(0, 0.6, 0)], 0.75, 0.6, 10), 0.06, R));
    for (let i = 0; i < ns; i++) {
      const a = a0 + (i / ns) * 6.28 + (R() - 0.5) * 0.6, lean = 0.25 + R() * 0.25, h = 4.2 + R() * 1.6;
      const top = V3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h);
      const st = [V3(Math.cos(a) * 0.25, 0.1, Math.sin(a) * 0.25), V3(Math.cos(a) * 0.5, h * 0.35, Math.sin(a) * 0.5), top.clone().lerp(V3(0, top.y, 0), 0.25), top];
      wood.push(gnarlGeo(tube(st, 0.36, 0.2, 9), 0.04, R));
      // both limbs lead in along the stem (not straight up), so no knob shows where they leave it
      limb(wood, R, top, V3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4), 2.4 + R() * 0.8, 0.2, 1, o, tips, top.clone().sub(st[2]).normalize());
      limb(wood, R, st[2], V3(Math.cos(a + 1.2), 0.5, Math.sin(a + 1.2)), 2.0 + R() * 0.6, 0.15, 1, o, tips, st[3].clone().sub(st[1]).normalize());
    }
    for (const [e, d] of tips) lobes.push({ c: e.clone().addScaledVector(d, 0.3).add(V3(0, 0.3, 0)), rx: 1.6 + R() * 0.5, ry: 1.35 + R() * 0.35 });
    ({ height, radius } = crown(leaves, wood, lobes, 9 + R() * 1.2, [TILE.leafB, TILE.leafA, TILE.leafC], R, 15, 6));
    bark = '#9a9476'; barkStyle = 'smooth';
  } else if (kind === 'sapling') {
    // a young slim tree: a thin leaning stem, short twigs, a narrow oval crown
    const h = 4.6 + R() * 0.8, lean = V3((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6);
    const st = [V3(0, -0.3, 0), V3(lean.x * 0.2, h * 0.4, lean.z * 0.2), V3(lean.x * 0.6, h * 0.75, lean.z * 0.6), V3(lean.x, h, lean.z)];
    wood.push(tube(st, 0.16, 0.05, 7));
    const lobes = [];
    for (let i = 0; i < 6; i++) {
      const t = 0.42 + i * 0.11, p = st[1].clone().lerp(st[3], (t - 0.4) / 0.6), a = i * 2.3 + R();
      const c = p.clone().add(V3(Math.cos(a) * 0.55 * (1.2 - t), 0.4, Math.sin(a) * 0.55 * (1.2 - t)));
      wood.push(tube([p, p.clone().lerp(c, 0.5).add(V3(0, 0.15, 0)), c], 0.05, 0.02, 4));
      lobes.push({ c, rx: (0.75 + R() * 0.25) * (1.25 - t * 0.6), ry: 0.75 + R() * 0.2 });
    }
    lobes.push({ c: st[3].clone().add(V3(0, 0.5, 0)), rx: 0.7, ry: 0.8 });
    ({ height, radius } = crown(leaves, wood, lobes, 5.8 + R() * 0.6, [TILE.leafB, TILE.leafA], R, 24));
    bark = '#9c9a7c'; barkStyle = 'smooth';
  } else if (kind === 'dead') {
    // a dead snag: grey weathered wood, a broken top, bare crooked limbs,
    // a few dead twigs hanging down
    const th = 8 + R() * 2, la = R() * 6.28, trunk = [V3(0, -0.5, 0)];
    for (let i = 1; i <= 5; i++) { const t = i / 5; trunk.push(V3(Math.cos(la) * 1.2 * t * t + (R() - 0.5) * 0.8, th * t, Math.sin(la) * 1.2 * t * t + (R() - 0.5) * 0.8)); }
    wood.push(gnarlGeo(tube(trunk, 0.85, 0.42, 11), 0.1, R));
    const top = trunk[5];
    for (let i = 0; i < 5; i++) {   // the jagged break: splinters round the rim
      const a = (i / 5) * 6.28 + R() * 0.5, b = top.clone().add(V3(Math.cos(a) * 0.3, -0.2, Math.sin(a) * 0.3));
      wood.push(tube([b, b.clone().add(V3(Math.cos(a) * 0.1, 0.5 + R() * 1.1, Math.sin(a) * 0.1))], 0.16, 0.01, 4));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + R() * 0.7, dir = V3(Math.cos(a), 0, Math.sin(a));
      wood.push(tube(root([V3(0, 1.3, 0).addScaledVector(dir, 0.3), V3(0, 0.3, 0).addScaledVector(dir, 1.0), V3(0, -0.3, 0).addScaledVector(dir, 1.7)]), 0.4, 0.06, 6));
    }
    const tips = [], o = { up: 0.04, wob: 0.9, kids: [1, 3], keep: 0.7, spread: 0.7, rise: 0.2, shrink: 0.6, lv: 3, droop: 0.02 };
    for (let i = 0; i < 6; i++) {
      const p = trunk[2 + (i % 3)].clone().lerp(trunk[3 + (i % 3)], R()), a = i * 2.1 + R() * 0.6;
      if (R() < 0.3) {   // a broken-off limb stub
        wood.push(tube([p, p.clone().add(V3(Math.cos(a) * 1.1, 0.4, Math.sin(a) * 1.1))], 0.2, 0.12, 6));
        continue;
      }
      limb(wood, R, p, V3(Math.cos(a), 0.6, Math.sin(a)), 3.6 + R() * 1.4 - i * 0.2, 0.26, 0, o, tips, trunk[3 + (i % 3)].clone().sub(trunk[2 + (i % 3)]).normalize());
    }
    for (const [e, d, m, len] of tips) {   // dead twigs hanging from some tips
      if (R() < 0.5) continue;
      const q = R() < 0.5 ? e : m, L = 0.8 + R() * 1.4;
      wood.push(tube([q, q.clone().add(V3(d.x * 0.3, -L * 0.4, d.z * 0.3)), q.clone().add(V3(d.x * 0.35 + (R() - 0.5) * 0.3, -L, d.z * 0.35))], 0.03, 0.01, 3));
    }
    ({ height, radius } = crown(leaves, wood, [], 0, [], R));
    bark = '#a3a096'; barkStyle = 'dead';
  } else if (kind === 'birch') {
    // white birch: one or two slender white stems, thin rising branches with
    // drooping tips, a small airy crown of light little clumps
    const ns = R() < 0.5 ? 1 : 2, lobes = [], tips = [];
    const o = { up: 0.05, wob: 0.4, kids: [2, 2], keep: 0.8, spread: 0.6, rise: 0.2, shrink: 0.62, lv: 2, droop: 0.06 };
    for (let k = 0; k < ns; k++) {
      const a = R() * 6.28, lean = ns > 1 ? 0.1 : 0.04, h = 10 + R() * 2 - k * 1.5;
      const st = [V3(k * 0.25, -0.3, 0)];
      for (let i = 1; i <= 4; i++) st.push(V3(k * 0.25 + Math.cos(a) * lean * h * i / 4 + (R() - 0.5) * 0.25, (h * i) / 4, Math.sin(a) * lean * h * i / 4 + (R() - 0.5) * 0.25));
      wood.push(tube(st, 0.26 - k * 0.04, 0.06, 8));
      for (let i = 0; i < 10; i++) {
        const t = 0.36 + i * 0.062, p = st[Math.min(4, Math.floor(t * 4))].clone().lerp(st[Math.min(4, Math.floor(t * 4) + 1)], (t * 4) % 1), b = i * 2.4 + R();
        limb(wood, R, p, V3(Math.cos(b), 0.9, Math.sin(b)), (3.0 - t * 1.8) + R() * 0.6, 0.07, 1, o, tips);
      }
      lobes.push({ c: st[4].clone().add(V3(0, 0.4, 0)), rx: 0.8, ry: 0.9 });
    }
    for (const [e, d, m] of tips) {
      lobes.push({ c: e.clone().add(V3(0, 0.1, 0)), rx: 0.85 + R() * 0.35, ry: 0.75 + R() * 0.25 });
      if (R() < 0.7) lobes.push({ c: m.clone().add(V3(0, -0.1, 0)), rx: 0.7, ry: 0.6 });
    }
    ({ height, radius } = crown(leaves, wood, lobes, 0, [TILE.leafB, TILE.bushA, TILE.leafB], R, 24));
    bark = '#ebe8de'; barkStyle = 'birch'; tint = '#f3ffcf';
  } else if (kind === 'willow') {
    // weeping willow: a short stout trunk, limbs arching up and out, and
    // long curtains of leaf strands hanging nearly to the ground
    const th = 2.6 + R() * 0.6;
    wood.push(gnarlGeo(tube([V3(0, -0.4, 0), V3(0.15, th * 0.5, 0), V3(0, th, 0.1)], 0.75, 0.55, 11), 0.08, R));
    const tips = [], o = { up: 0.1, wob: 0.4, kids: [2, 3], keep: 0.75, spread: 0.7, rise: 0.25, shrink: 0.65, lv: 2, droop: 0.05 };
    const nl = 4 + Math.floor(R() * 2), a0 = R() * 6.28;
    for (let i = 0; i < nl; i++) {
      const a = a0 + (i / nl) * 6.28;
      limb(wood, R, V3(0, th - 0.2, 0), V3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), 3.4 + R() * 0.8, 0.36, 0, o, tips);
    }
    // the crown's top: a low dome of masses over the arching limbs
    const lobes = tips.map(([e]) => ({ c: e.clone().add(V3(0, 0.2, 0)), rx: 1.6 + R() * 0.4, ry: 0.95 }));
    let top = 0; for (const L of lobes) top = Math.max(top, L.c.y);
    const tiles = [TILE.bushA, TILE.bushB, TILE.leafB];
    // strands: from points over the dome, columns of small cards falling down
    for (let k = 0; k < Math.round(130 * treeDetail.k); k++) {
      const L = lobes[Math.floor(R() * lobes.length)], a = R() * 6.28;
      const s0 = L.c.clone().add(V3(Math.cos(a) * L.rx * (0.6 + R() * 0.5), -0.2 + R() * 0.4, Math.sin(a) * L.rx * (0.6 + R() * 0.5)));
      const out = V3(s0.x, 0, s0.z).normalize(), len = (s0.y - 0.8) * (0.55 + R() * 0.45), sw = R() * 6.28;
      // the strand: two crossed ribbons of stretched leaf tiles, segment by segment
      const side = V3(-out.z, 0, out.x), seg = 0.6;
      let prev = s0.clone();
      for (let y = seg; y < len + seg * 0.5; y += seg) {
        const f = Math.min(1, y / len), p = s0.clone().add(V3(out.x * (0.35 * f + Math.sin(sw + y) * 0.08), -Math.min(y, len), out.z * (0.35 * f + Math.sin(sw + y) * 0.08)));
        const ao = Math.min(1, 0.6 + (1 - f) * 0.25 + (out.z * 0.5 - out.x * 0.6) * 0.15), w = 0.5 * (1 - f * 0.45);
        const tl = tiles[Math.floor(R() * 3)];
        // each card runs well past its step, so the leaf blobs overlap into one strand
        const a0 = prev.clone().add(V3(0, 0.5, 0)), b0 = p.clone().add(V3(0, -0.35, 0));
        ribbon(leaves, a0, b0, side, w, out, tl, 0.4 + f * 0.6, ao);
        ribbon(leaves, a0, b0, out, w * 0.8, side, tl, 0.4 + f * 0.6, ao * 0.9);
        prev = p;
      }
    }
    ({ height, radius } = crown(leaves, wood, lobes, 0, tiles, R, 18));
    bark = '#7e7660'; tint = '#f0ffb8'; wind = 0.1;
  } else if (kind === 'maple') {
    // Japanese maple in autumn: a short trunk splitting into sinuous stems,
    // a low layered crown of thin flat tiers in reds and oranges
    const lobes = [], tips = [];
    const o = { up: 0.0, wob: 0.6, kids: [2, 3], keep: 0.6, spread: 0.85, rise: 0.05, shrink: 0.62, lv: 2 };
    wood.push(gnarlGeo(tube([V3(0, -0.3, 0), V3(0.1, 0.9, 0)], 0.32, 0.26, 8), 0.04, R));
    const ns = 3 + Math.floor(R() * 2), a0 = R() * 6.28;
    for (let i = 0; i < ns; i++) {
      const a = a0 + (i / ns) * 6.28, h = 2.4 + R() * 1.6;
      const st = [V3(0.1, 0.8, 0), V3(Math.cos(a) * 0.5, h * 0.5, Math.sin(a) * 0.5), V3(Math.cos(a) * 1.2, h, Math.sin(a) * 1.2)];
      wood.push(tube(leadIn(st, UP, 0.5), 0.17, 0.1, 7));
      limb(wood, R, st[2], V3(Math.cos(a), 0.35, Math.sin(a)), 2.2 + R() * 0.8, 0.1, 1, o, tips, st[2].clone().sub(st[1]).normalize());
    }
    for (const [e] of tips) lobes.push({ c: e.clone().add(V3(0, 0.25, 0)), rx: 1.5 + R() * 0.5, ry: 0.6 + R() * 0.15 });
    // tiers above, smaller toward the top, so the crown stacks in thin layers
    for (let t = 0; t < 3; t++) {
      const y = 4.3 + t * 0.95, n = 7 - t * 2;
      for (let i = 0; i < n; i++) {
        const a = R() * 6.28, rr = (2.6 - t * 0.7) * Math.sqrt(R());
        lobes.push({ c: V3(Math.cos(a) * rr, y + (R() - 0.5) * 0.3, Math.sin(a) * rr), rx: 1.45 - t * 0.15 + R() * 0.3, ry: 0.55 });
      }
    }
    ({ height, radius } = crown(leaves, wood, lobes, 7.5 + R() * 1.0, [TILE.leafA, TILE.leafB, TILE.leafB, TILE.bushA, TILE.leafC], R, 34));
    bark = '#857c6e'; barkStyle = 'smooth'; leafVar = 'autumn';
  } else if (kind === 'oak') {
    // English oak: a thick gnarled bole, crooked zigzag limbs, a tall broad
    // rounded crown broken into many lobed clumps of dark leaves
    const th = 4.0 + R() * 0.8;
    wood.push(gnarlGeo(tube([V3(0, -0.5, 0), V3(0.2, th * 0.5, -0.1), V3(-0.1, th, 0.1)], 1.0, 0.7, 12), 0.12, R));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + R() * 0.7, dir = V3(Math.cos(a), 0, Math.sin(a));
      wood.push(gnarlGeo(tube(root([V3(0, 1.5, 0).addScaledVector(dir, 0.15), V3(0, 0.35, 0).addScaledVector(dir, 1.0), V3(0, -0.3, 0).addScaledVector(dir, 1.8)]), 0.38, 0.08, 6), 0.04, R));
    }
    const tips = [], o = { up: 0.1, wob: 0.85, kids: [2, 3], keep: 0.65, spread: 0.7, rise: 0.45, shrink: 0.62, lv: 2 };
    const nl = 5 + Math.floor(R() * 2), a0 = R() * 6.28;
    for (let i = 0; i < nl; i++) {
      const a = a0 + (i / nl) * 6.28 + (R() - 0.5) * 0.5, y = th - 0.4 + (i % 2) * 0.9;
      limb(wood, R, V3(0, y, 0), V3(Math.cos(a), 1.4 + R() * 0.6, Math.sin(a)), 3.6 + R() * 1.0, 0.42, 0, o, tips);
    }
    const lobes = tips.map(([e, d]) => ({ c: e.clone().addScaledVector(d, 0.3).add(V3(0, 0.4, 0)), rx: 1.55 + R() * 0.5, ry: 1.3 + R() * 0.35 }));
    for (const [, , m] of tips) if (R() < 0.6) lobes.push({ c: m.clone().add(V3(0, 0.5, 0)), rx: 1.3, ry: 1.1 });
    ({ height, radius } = crown(leaves, wood, lobes, 14 + R() * 1.5, [TILE.leafC, TILE.leafC, TILE.leafA], R, 13, 10));
    bark = '#7c7058'; tint = '#e2f2d8';
  } else if (kind === 'scotspine') {
    // Scots pine: a tall bare trunk, grey below and orange above, curving a
    // little, with a few limbs at the top holding flat clumped pads of needles
    const th = 11 + R() * 2, la = R() * 6.28, trunk = [V3(0, -0.4, 0)];
    for (let i = 1; i <= 5; i++) { const t = i / 5; trunk.push(V3(Math.cos(la) * Math.sin(t * 2.4) * 0.9, th * t, Math.sin(la) * Math.sin(t * 2.4) * 0.9)); }
    // the grey base overlaps the orange top a little: the fluting breaks the join into a ragged edge
    // (both sampled from one curve so they follow the same line)
    const cv = new THREE.CatmullRomCurve3(trunk), part = (t0, t1) => Array.from({ length: 8 }, (_, i) => cv.getPointAt(t0 + ((t1 - t0) * i) / 7));
    const low = tube(part(0, 0.6), 0.62, 0.4, 10, { cap: false }), up = tube(part(0.3, 1), 0.42, 0.16, 9);
    // a ragged top to the grey: per column, the rings above a random height sink inside the orange
    const lp = low.attributes.position, segs = lp.count / 11 - 1, cut = Array.from({ length: 11 }, () => 0.6 + R() * 0.35);
    cut[10] = cut[0];
    for (let i = 0; i <= segs; i++) {
      const c = V3(0, 0, 0); for (let j = 0; j < 10; j++) c.add(V3(lp.getX(i * 11 + j), lp.getY(i * 11 + j), lp.getZ(i * 11 + j))); c.multiplyScalar(0.1);
      for (let j = 0; j <= 10; j++) if (i / segs > cut[j]) { const k = i * 11 + j; lp.setXYZ(k, c.x + (lp.getX(k) - c.x) * 0.7, lp.getY(k), c.z + (lp.getZ(k) - c.z) * 0.7); }
    }
    weldNormals(low);
    wood.push(gnarlGeo(low, 0.03, R));
    const tips = [], o = { up: 0.12, wob: 0.6, kids: [2, 2], keep: 0.7, spread: 0.75, rise: 0.2, shrink: 0.6, lv: 2 };
    const upper = [gnarlGeo(up, 0.03, R)];
    for (let i = 0; i < 6; i++) {
      const t = 0.66 + i * 0.06, p = trunk[Math.min(5, Math.round(t * 5))], a = i * 2.5 + R() * 0.6;
      const m = Math.min(5, Math.round(t * 5));
      limb(upper, R, p, V3(Math.cos(a), 0.55, Math.sin(a)), 3.2 - i * 0.25 + R() * 0.6, 0.18, 1, o, tips, trunk[Math.min(5, m + 1)].clone().sub(trunk[m - 1]).normalize());
    }
    for (let i = 0; i < 3; i++) {   // dead stubs on the bare trunk
      const p = trunk[2 + i % 2].clone().lerp(trunk[3], R()), a = R() * 6.28;
      wood.push(tube([p, p.clone().add(V3(Math.cos(a) * 0.6, -0.1, Math.sin(a) * 0.6))], 0.06, 0.02, 4));
    }
    const lobes = tips.map(([e]) => ({ c: e.clone().add(V3(0, 0.3, 0)), rx: 1.6 + R() * 0.4, ry: 0.7 + R() * 0.15 }));
    lobes.push({ c: trunk[5].clone().add(V3(0, 0.4, 0)), rx: 1.3, ry: 0.8 });
    ({ height, radius } = crown(leaves, [...wood, ...upper], lobes, 15 + R() * 2, [TILE.needles, TILE.needles2, TILE.leafC], R, 40));
    extraWood = { geo: upper, bark: '#c47a46', style: 'flaky' };
    bark = '#8a7a68'; tint = '#c8e2c8'; wind = 0.04;
  } else if (kind === 'shade') {
    // a big round shade tree: a short bole forking into heavy limbs under a
    // full dome of large masses that skirts down low all round
    const th = 2.4 + R() * 0.5;
    wood.push(gnarlGeo(tube([V3(0, -0.5, 0), V3(0.1, th * 0.6, 0), V3(0, th, 0.05)], 0.75, 0.6, 11), 0.08, R));
    const tips = [], o = { up: 0.1, wob: 0.5, kids: [2, 3], keep: 0.7, spread: 0.7, rise: 0.35, shrink: 0.62, lv: 1 };
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + R() * 0.5; limb(wood, R, V3(0, th - 0.2, 0), V3(Math.cos(a), 1.1, Math.sin(a)), 3.4 + R(), 0.36, 0, o, tips); }
    const lobes = [];
    domeLobes(lobes, V3(0, 6.6, 0), 5.6, 3.9, 5.6, 22, 2.0, 0.6, R);   // the dome's outside
    for (let i = 0; i < 4; i++) lobes.push({ c: V3((R() - 0.5) * 4, 6.5 + R() * 2, (R() - 0.5) * 4), rx: 2.4, ry: 2.0 });   // inside
    ({ height, radius } = crown(leaves, wood, lobes, 12 + R() * 1.5, [TILE.leafA, TILE.leafB, TILE.leafC, TILE.leafA], R, 11));
    bark = '#8c8468'; barkStyle = 'smooth';
  } else if (kind === 'lombardy') {
    // a Lombardy poplar: a tall narrow column of overlapping masses on a
    // straight trunk with short upswept branches, tapering at the top
    const h = 15 + R() * 2;
    wood.push(gnarlGeo(tube([V3(0, -0.4, 0), V3(0.05, h * 0.5, 0), V3(0, h * 0.95, 0.05)], 0.48, 0.1, 9), 0.05, R));
    const lobes = [];
    for (let y = 2.4; y < h + 0.4; y += 0.7) {
      const f = (y - 2.4) / (h - 2), w = 1.35 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + f * 0.86)), 0.7) + 0.35;
      for (let k = 0; k < 3; k++) {
        const a = R() * 6.28, c = V3(Math.cos(a) * w * 0.4, y + R() * 0.4, Math.sin(a) * w * 0.45);
        lobes.push({ c, rx: w * (0.7 + R() * 0.2), ry: 1.0 + R() * 0.3 });
        if (k === 0 && f < 0.85) wood.push(tube([V3(0, y - 1.0, 0), c.clone().multiplyScalar(0.6).add(V3(0, -0.3, 0))], 0.08, 0.03, 4));
      }
    }
    ({ height, radius } = crown(leaves, wood, lobes, 0, [TILE.leafC, TILE.leafA, TILE.leafB], R, 13));
    bark = '#8f8a6e';
  } else if (kind === 'linden') {
    // a broad linden / chestnut: a clear trunk under a tall dense egg shaped
    // crown, widest a third of the way up, many masses all over it
    const th = 4.5 + R() * 0.8;
    wood.push(gnarlGeo(tube([V3(0, -0.5, 0), V3(-0.1, th * 0.5, 0.1), V3(0.05, th, 0)], 0.75, 0.52, 11), 0.07, R));
    const tips = [], o = { up: 0.14, wob: 0.45, kids: [2, 3], keep: 0.75, spread: 0.7, rise: 0.4, shrink: 0.62, lv: 1 };
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + R() * 0.5; limb(wood, R, V3(0, th - 0.3 + i * 0.4, 0), V3(Math.cos(a), 1.2, Math.sin(a)), 3.6 + R(), 0.3, 0, o, tips); }
    wood.push(tube(leadIn([V3(0, th, 0), V3(0.2, th + 4, 0), V3(0, th + 8, 0.2)], UP, 1.2), 0.46, 0.12, 7));   // the leader, out of the trunk's top
    const lobes = [];
    domeLobes(lobes, V3(0, th + 4.6, 0), 4.6, 5.6, 4.6, 26, 1.9, 0.9, R, 0.25);
    for (let i = 0; i < 5; i++) lobes.push({ c: V3((R() - 0.5) * 3.5, th + 2 + R() * 5, (R() - 0.5) * 3.5), rx: 2.2, ry: 2.0 });
    ({ height, radius } = crown(leaves, wood, lobes, 15 + R() * 1.5, [TILE.leafB, TILE.leafA, TILE.leafC], R, 11));
    bark = '#7f7660';
  } else if (kind === 'bushy') {
    // a young bushy tree: a short trunk and a dense round crown starting low
    const th = 1.2 + R() * 0.4;
    wood.push(tube([V3(0, -0.3, 0), V3(0.05, th, 0)], 0.22, 0.17, 8));
    const tips = [], o = { up: 0.15, wob: 0.5, kids: [2, 3], keep: 0.7, spread: 0.7, rise: 0.4, shrink: 0.6, lv: 1 };
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + R() * 0.5; limb(wood, R, V3(0, th - 0.1, 0), V3(Math.cos(a), 1.1, Math.sin(a)), 1.6 + R() * 0.5, 0.14, 0, o, tips); }
    const lobes = [];
    domeLobes(lobes, V3(0, 3.2, 0), 2.2, 1.9, 2.2, 16, 1.2, 0.8, R);
    lobes.push({ c: V3(0, 3.2, 0), rx: 1.5, ry: 1.4 });
    ({ height, radius } = crown(leaves, wood, lobes, 5 + R() * 0.8, [TILE.bushA, TILE.leafB, TILE.leafA], R, 26));
    bark = '#8f8a70'; barkStyle = 'smooth';
  } else if (kind === 'beech') {
    // a lush beech: a smooth grey trunk, limbs sweeping up and out in
    // layers, a broad domed crown of flattened sprays, the lowest hanging low
    const th = 3.6 + R() * 0.6;
    wood.push(gnarlGeo(tube([V3(0, -0.5, 0), V3(0.1, th * 0.5, 0), V3(0, th, 0.1)], 0.8, 0.58, 12), 0.06, R));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + R() * 0.6, dir = V3(Math.cos(a), 0, Math.sin(a));
      wood.push(tube(root([V3(0, 1.3, 0).addScaledVector(dir, 0.15), V3(0, 0.3, 0).addScaledVector(dir, 0.9), V3(0, -0.3, 0).addScaledVector(dir, 1.5)]), 0.35, 0.08, 6));
    }
    const tips = [], o = { up: 0.05, wob: 0.4, kids: [2, 3], keep: 0.75, spread: 0.7, rise: 0.15, shrink: 0.62, lv: 2 };
    const nl = 6, a0 = R() * 6.28;
    for (let i = 0; i < nl; i++) {
      const a = a0 + i * 2.4, y = th - 0.4 + (i / nl) * 4.5;
      limb(wood, R, V3(0, Math.min(y, th + 3), 0), V3(Math.cos(a), 0.9 + 0.9 * (i / nl), Math.sin(a)), 4.4 - i * 0.3 + R() * 0.8, 0.36 - i * 0.03, 0, o, tips);
    }
    wood.push(tube(leadIn([V3(0, th, 0), V3(0.2, th + 3, 0), V3(-0.1, th + 6.5, 0.2)], UP, 1.2), 0.56, 0.15, 8));   // the leader, out of the trunk's top
    const lobes = tips.map(([e]) => ({ c: e.clone().add(V3(0, 0.35, 0)), rx: 1.9 + R() * 0.5, ry: 1.2 + R() * 0.25 }));   // flattish sprays
    lobes.push({ c: V3(0, th + 7.5, 0), rx: 2.6, ry: 1.8 }, { c: V3(1.2, th + 6, -0.8), rx: 2.2, ry: 1.6 }, { c: V3(-1.2, th + 6, 1), rx: 2.2, ry: 1.6 });
    ({ height, radius } = crown(leaves, wood, lobes, 16 + R() * 1.5, [TILE.leafB, TILE.leafA, TILE.leafB, TILE.leafC], R, 12, 10));
    bark = '#9c9f98'; barkStyle = 'smooth';
  }
  // the wood sways with the leaves (same wind); a dead snag is a bit stiffer
  const woodWind = kind === 'dead' ? +(wind * 0.7).toFixed(3) : wind;
  const parts = [
    { geometry: mergeGeos(wood), material: barkMaterial(bark, barkStyle, woodWind) },
    ...(extraWood ? [{ geometry: mergeGeos(extraWood.geo), material: barkMaterial(extraWood.bark, extraWood.style, woodWind) }] : []),   // a second bark (pine's orange top)
    { geometry: toGeometry(leaves), material: leafMaterial(tint, wind, leafVar) },
  ].filter((p) => p.geometry.attributes.position.count);   // a dead tree has no leaves
  // exact bounds for the impostor (the leaves' cards reach past the lobes),
  // and the trunk's radius at 1.5-2.5 m for colliders
  let top = 0, rad = 0, trunk = 0.2;
  for (const p of parts) {
    const a = p.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y = a.getY(i), d = Math.hypot(a.getX(i), a.getZ(i));
      top = Math.max(top, y); rad = Math.max(rad, d);
      if (p === parts[0] && y > 1.5 && y < 2.5) trunk = Math.max(trunk, d);
    }
  }
  return { parts, height: Math.max(height, top), radius: Math.max(radius, rad), trunk: Math.min(trunk, 1.6) };
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
