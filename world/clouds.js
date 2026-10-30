// Anime clouds, painted flat like a background illustration. Each cloud is a
// camera-facing sprite whose texture is painted once at load:
//  - the cloud is a pile of big lobes (towering cumulus: a wide base of front
//    lobes, a body, one or two towers rising out of it), each lobe an ellipse
//    edged with many small round bumps, so the outer silhouette is a crisp
//    scalloped edge (1 px anti-aliasing, no blur);
//  - lobes are painted back (top) to front (bottom); each one is lit where a
//    copy of its own bumps, shifted toward the light, covers it, so the shade
//    is a broad, softly scalloped crescent on the side away from the light;
//  - a soft blue halo around every front lobe shades the lobes behind it, so
//    the lobe edges read as gentle inner scallop lines;
//  - very low contrast: white, pale blue, light lavender; a warm peach glow in
//    the lit part of the lower lobes; the base melts into the horizon haze.
// Textures are painted lit from the upper left and mirrored per cloud so the
// lit side faces the sun. A few flat cloudlets and thin streaks complete it.
import * as THREE from 'three';
import { rng } from './terrain.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// palette (sRGB 0-255)
const WHITE = [255, 255, 255];
const MID = [240, 245, 254];   // the lit side next to the shade
const SH1 = [216, 225, 249];   // shade, pale blue
const SH2 = [199, 205, 241];   // deeper shade, light lavender
const HALO = [208, 218, 246];  // shade cast on a lobe behind another
const WARM = [255, 237, 222];  // peach glow
const HAZE = [205, 226, 244];  // the base, into the horizon haze

// light in canvas space (y down): from the upper left
const LX = -0.62, LY = -0.78;

// Signed distance-ish field of a union of circles over a box: max(r - d).
function field(cs, x0, y0, w, h, m) {
  const S = new Float32Array(w * h).fill(-m);
  for (const c of cs) {
    const cx = c[0] - x0, cy = c[1] - y0, r = c[2], R = r + m;
    const i0 = Math.max(0, Math.floor(cx - R)), i1 = Math.min(w - 1, Math.ceil(cx + R));
    const j0 = Math.max(0, Math.floor(cy - R)), j1 = Math.min(h - 1, Math.ceil(cy + R));
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy, o = j * w;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx, v = r - Math.sqrt(dx * dx + dy * dy);
        if (v > S[o + i]) S[o + i] = v;
      }
    }
  }
  return S;
}

// One mass: an ellipse (a row of core circles) edged with small round bumps
// all along its outline except the bottom. Bump size follows the cloud (bs),
// not the mass, so every edge has the same fine scallop. [x, y, r, core]
function mass(r, cx, cy, rx, ry, bs) {
  const cs = [];
  const nc = Math.max(1, Math.ceil(rx / ry * 1.6));
  for (let i = 0; i < nc; i++) {
    const t = nc === 1 ? 0 : i / (nc - 1) * 2 - 1;
    const rr = ry * (1 - t * t * 0.3);
    cs.push([cx + t * (rx - rr * 0.95), cy + t * t * ry * 0.2, rr, 1]);
  }
  const a0 = Math.PI * (0.8 + r() * 0.08), a1 = Math.PI * (2.2 - r() * 0.08);
  let a = a0;
  while (a < a1) {
    const top = Math.max(0, -Math.sin(a));
    const rb = bs * (0.75 + r() * 0.7) * (0.8 + top * 0.5);
    const ex = cx + Math.cos(a) * rx, ey = cy + Math.sin(a) * ry;
    const nx = Math.cos(a) * ry, ny = Math.sin(a) * rx, nl = Math.hypot(nx, ny);
    const k = rb * (0.15 + r() * 0.3);
    cs.push([ex - nx / nl * k, ey - ny / nl * k, rb, 0]);
    // now and then a small bump riding on it
    if (r() < 0.25) {
      const t = a + (r() - 0.5) * 0.6;
      cs.push([ex - nx / nl * k + Math.cos(t) * rb * 0.7, ey - ny / nl * k + Math.sin(t) * rb * 0.7, rb * (0.45 + r() * 0.15), 0]);
    }
    a += (rb * (1.0 + r() * 0.45)) / Math.hypot(Math.sin(a) * rx, Math.cos(a) * ry);
  }
  return cs;
}

// The masses of one cloud, back first. Each: {cs, cx, cy, rx, ry, row}
// row: 0 = top of the cloud .. 1 = front masses along the base.
function layout(r, W, H, kind) {
  const L = [];
  const bs = W * (kind === 'tower' ? 0.032 : 0.06);
  const add = (cx, cy, rx, ry, row, sub = true) => {
    const rx0 = rx;
    rx = Math.min(rx, cx - bs * 1.6 - 2, W - bs * 1.6 - 2 - cx);
    if (rx < 6) return;
    ry = Math.min(ry * rx / rx0, rx);
    L.push({ cs: mass(r, cx, cy, rx, ry, bs * Math.min(1, rx / (W * 0.1))), cx, cy, rx, ry, row });
    // a smaller mass bulging out of the lower part of a big one
    if (sub && rx > W * 0.11 && row < 0.7) {
      const sd = r() < 0.5 ? -1 : 1, srx = rx * (0.45 + r() * 0.15);
      add(cx + sd * rx * (0.35 + r() * 0.2), cy + ry * (0.35 + r() * 0.15), srx, srx * 0.75, row + 0.02, false);
    }
  };
  const j = (v) => v * (0.9 + r() * 0.2);
  if (kind === 'tower') {
    const mx = W * (0.4 + r() * 0.2);
    const side = mx < W * 0.5 ? 1 : -1;
    // body behind everything (fills the gaps between the masses)
    add(W * 0.5, H * 0.72, W * 0.36, H * 0.17, 0.5, false);
    // the main tower, top first
    add(mx + (r() - 0.5) * W * 0.04, H * 0.2, j(W * 0.1), j(W * 0.085), 0);
    add(mx + (r() - 0.5) * W * 0.05, H * 0.33, j(W * 0.14), j(W * 0.1), 0.1);
    add(mx + (r() - 0.5) * W * 0.06, H * 0.47, j(W * 0.18), j(W * 0.12), 0.25);
    // a lower second tower beside it
    const sx = mx + side * W * (0.22 + r() * 0.05);
    add(sx, H * (0.4 + r() * 0.05), j(W * 0.1), j(W * 0.08), 0.15);
    add(sx + side * W * 0.03, H * 0.52, j(W * 0.14), j(W * 0.1), 0.35);
    // the shoulder on the other side
    add(mx - side * W * (0.2 + r() * 0.04), H * 0.58, j(W * 0.13), j(W * 0.09), 0.45);
    // front masses along the base, reaching below it (cut flat)
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const rx = j(W * (n === 3 ? 0.17 : 0.14));
      add(W * (0.2 + t * 0.6) + (r() - 0.5) * W * 0.04, H * (0.79 + r() * 0.04), rx, rx * 0.75, 0.8 + (i % 2) * 0.2);
    }
  } else {
    const n = 2 + Math.floor(r() * 2);
    add(W * 0.5, H * 0.72, W * 0.36, H * 0.22, 0.5, false);
    const rx = W * (0.1 + r() * 0.05);
    add(W * (0.38 + r() * 0.24), H * 0.42, rx, rx * 0.8, 0.2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const rx = W * (0.13 + r() * 0.06);
      add(W * (0.27 + t * 0.46), H * (0.64 + r() * 0.1), rx, rx * 0.6, 0.8 + (i % 2) * 0.2);
    }
  }
  L.sort((a, b) => (a.row - b.row) || (a.cy - b.cy));
  return L;
}

// Paint one cloud to a canvas. kind 'tower' (towering cumulus) or 'low' (flat cloudlet).
export function paintCloud(seed, W, H, kind) {
  const r = rng(seed);
  const L = layout(r, W, H, kind);
  const base = H * (kind === 'tower' ? 0.93 : 0.86);
  const N = W * H;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), A = new Float32Array(N);
  const seg = W * (kind === 'tower' ? 0.04 : 0.1);
  for (const p of L) {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const [x, y, rad] of p.cs) { x0 = Math.min(x0, x - rad); x1 = Math.max(x1, x + rad); y0 = Math.min(y0, y - rad); y1 = Math.max(y1, y + rad); }
    const hb = Math.max(3, W * 0.012); // a thin soft line where it overlaps the masses behind
    x0 = Math.max(0, Math.floor(x0 - hb - 2)); y0 = Math.max(0, Math.floor(y0 - hb - 2));
    x1 = Math.min(W - 1, Math.ceil(x1 + hb + 2)); y1 = Math.min(H - 1, Math.ceil(y1 + hb + 2));
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const S = field(p.cs, x0, y0, w, h, hb + 2);
    // the lit part: the mass's own circles, shifted toward the light
    const ox = LX * p.rx * 0.5, oy = LY * p.ry * 0.6;
    const lit = p.cs.map(([x, y, rad, core]) => [x + ox, y + oy, rad * (core ? 0.88 : 1)]);
    const Lt = field(lit, x0, y0, w, h, p.rx);
    const top = p.cy - p.ry, bot = p.cy + p.ry;
    const tw = Math.max(1.5, W * 0.006); // soft terminator
    for (let jj = 0; jj < h; jj++) {
      const y = y0 + jj + 0.5;
      const vy = (y - top) / (bot - top);
      for (let i = 0; i < w; i++) {
        const x = x0 + i + 0.5, k = jj * w + i, kk = (y0 + jj) * W + x0 + i;
        // flat base with small arcs bulging down
        const u = ((x / seg) % 1) * 2 - 1;
        const s = Math.min(S[k], base + H * 0.012 * Math.sqrt(Math.max(0, 1 - u * u)) - y);
        if (s < 0.5 && s > -hb && A[kk] > 0 && p.row > 0.05) {
          const f = 1 + s / hb, q = f * f * 0.35;
          R[kk] += (SH1[0] - R[kk]) * q; G[kk] += (SH1[1] - G[kk]) * q; B[kk] += (SH1[2] - B[kk]) * q;
        }
        const a = Math.min(1, Math.max(0, s + 0.5));
        if (a <= 0) continue;
        const l = Lt[k];
        const lt = sm(-tw, tw, l);                          // 0 shade .. 1 lit
        // which side of the mass faces the light (-1 .. 1)
        const side = -(((x - p.cx) / p.rx) * LX + ((y - p.cy) / p.ry) * LY);
        // the lower part of the masses behind sits in shade
        const low = sm(0.45, 1.05, vy) * (1 - p.row * 0.7);
        let sh = Math.max(1 - lt, low * 0.85);
        let col = mixc(WHITE, MID, sm(-0.2, 0.9, -side) * 0.8);
        col = mixc(col, SH1, sh);
        col = mixc(col, SH2, sh * sm(0.4, 1.1, vy) * 0.75);
        // warm glow on the sunlit side of the lower masses
        col = mixc(col, WARM, lt * (1 - low) * sm(0.0, 0.7, side) * sm(0.4, 1, p.row) * 1.0);
        // the base melts into the haze
        col = mixc(col, HAZE, sm(base - H * 0.18, base, y) * 0.75);
        const fade = 1 - sm(base - H * 0.05, base + H * 0.012, y) * 0.85;
        const aa = a * fade, ta = A[kk];
        if (ta === 0) { R[kk] = col[0]; G[kk] = col[1]; B[kk] = col[2]; A[kk] = aa; }
        else {
          R[kk] += (col[0] - R[kk]) * a; G[kk] += (col[1] - G[kk]) * a; B[kk] += (col[2] - B[kk]) * a;
          A[kk] = Math.max(ta, aa);
        }
      }
    }
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), D = img.data;
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    if (A[k] > 0) { D[o] = R[k]; D[o + 1] = G[k]; D[o + 2] = B[k]; D[o + 3] = A[k] * 255; }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}


// A thin painted streak: a few long lenses, crisp edged, white over pale blue.
export function paintStreak(seed, W, H) {
  const r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const n = 3 + Math.floor(r() * 3);
  const E = [];
  for (let i = 0; i < n; i++) E.push([W * (0.15 + r() * 0.7), H * (0.4 + r() * 0.2), W * (0.1 + r() * 0.22), H * (0.1 + r() * 0.14)]);
  ctx.fillStyle = 'rgb(222,232,250)';
  for (const [cx, cy, rx, ry] of E) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgb(255,255,255)';
  for (const [cx, cy, rx, ry] of E) { ctx.beginPath(); ctx.ellipse(cx - rx * 0.06, cy - ry * 0.35, rx * 0.92, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
  return cv;
}

// Upload straight from the pixels (a canvas would premultiply and lose the
// colour of the clear pixels, leaving a dark fringe on the filtered edge).
// Clear pixels take the colour of the nearest painted pixel in their row.
function tex(cv) {
  const W = cv.width, H = cv.height;
  const src = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const D = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const so = y * W * 4, dO = (H - 1 - y) * W * 4;
    let last = [228, 236, 250];
    for (let i = 0; i < W * 4; i += 4) {
      const a = src[so + i + 3];
      if (a > 0) { last = [src[so + i], src[so + i + 1], src[so + i + 2]]; for (let c = 0; c < 4; c++) D[dO + i + c] = src[so + i + c]; }
      else { D[dO + i] = last[0]; D[dO + i + 1] = last[1]; D[dO + i + 2] = last[2]; D[dO + i + 3] = 0; }
    }
  }
  const t = new THREE.DataTexture(D, W, H);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export const TOWER = [768, 640], LOW = [256, 112], STREAK = [512, 48];

export function buildClouds(sunDir = new THREE.Vector3(-0.55, 0.75, 0.45)) {
  const sun = sunDir.clone().normalize();
  const r = rng(4242);
  const group = new THREE.Group();
  // two materials per texture: as painted (lit from the left) and mirrored
  const mats = (t, o = 1) => {
    const m = (map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: o });
    const f = t.clone(); f.repeat.x = -1; f.offset.x = 1; f.needsUpdate = true;
    return [m(t), m(f)];
  };
  const towers = [], lows = [], streaks = [];
  for (let i = 0; i < 6; i++) towers.push(mats(tex(paintCloud(100 + i * 17, TOWER[0], TOWER[1], 'tower'))));
  for (let i = 0; i < 4; i++) lows.push(mats(tex(paintCloud(500 + i * 13, LOW[0], LOW[1], 'low'))));
  for (let i = 0; i < 3; i++) streaks.push(mats(tex(paintStreak(900 + i, STREAK[0], STREAK[1])), 0.9));
  const add = (pair, ratio, w, a, d, y) => {
    // sun to the right of this cloud on screen -> use the mirrored texture
    const vx = Math.cos(a), vz = Math.sin(a);
    const right = -sun.x * vz + sun.z * vx;
    const s = new THREE.Sprite(pair[right > 0 ? 1 : 0]);
    s.center.set(0.5, 0.04);
    s.scale.set(w, w * ratio, 1);
    s.position.set(vx * d, y, vz * d);
    s.renderOrder = -5;
    group.add(s);
    return s;
  };
  // towering cumulus all round, bases just above the far ridges
  const NT = 11;
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * Math.PI * 2 + (r() - 0.5) * 0.35;
    add(towers[i % towers.length], TOWER[1] / TOWER[0], 300 + r() * 200, a, 660 + r() * 140, -5 + r() * 30);
  }
  // flat cloudlets low on the horizon
  for (let i = 0; i < 22; i++) {
    add(lows[i % lows.length], LOW[1] / LOW[0], 45 + r() * 65, r() * Math.PI * 2, 760 + r() * 60, 60 + r() * 110);
  }
  // thin streaks
  for (let i = 0; i < 9; i++) {
    add(streaks[i % streaks.length], STREAK[1] / STREAK[0], 140 + r() * 180, r() * Math.PI * 2, 780 + r() * 50, 120 + r() * 260);
  }
  group.userData.tick = (dt) => { group.rotation.y += dt * 0.003; };
  return group;
}
