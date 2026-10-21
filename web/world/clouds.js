// Anime clouds, painted flat like a background illustration: each cloud is a
// camera-facing sprite whose texture is painted once at load. The silhouette
// is a union of many circles (scalloped, crisp 1 px edge, no blur); inside,
// overlapping puffs are shaded softly from a smooth 2D height field: mostly
// white, gentle pale blue / lavender shadow shapes that follow the puffs, a
// warm peach glow on the sunlit lower puffs, and the base melting into pale
// blue haze. A few flat cloudlets and thin streaks complete the sky.
import * as THREE from 'three';
import { rng } from './terrain.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// palette (sRGB 0-255)
const WHITE = [255, 255, 255];
const MID = [234, 241, 253];
const SHADE = [210, 222, 247];
const DEEP = [194, 205, 240];
const WARM = [255, 238, 222];
const BACK = [214, 228, 248];
const HAZE = [166, 204, 240];

// light in canvas space (y down): from the upper left, toward the viewer
const LX = -0.55, LY = -0.72, LZ = 0.45;
const LN = Math.hypot(LX, LY, LZ);

// separable box blur, in place, n passes
function blur(a, w, h, rad, n) {
  if (rad < 1) return;
  const t = new Float32Array(Math.max(w, h));
  for (let p = 0; p < n; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0, c = 0;
      for (let x = -rad; x <= rad; x++) if (x >= 0 && x < w) { s += a[o + x]; c++; }
      for (let x = 0; x < w; x++) {
        t[x] = s / c;
        const out = x - rad, inn = x + rad + 1;
        if (out >= 0) { s -= a[o + out]; c--; }
        if (inn < w) { s += a[o + inn]; c++; }
      }
      for (let x = 0; x < w; x++) a[o + x] = t[x];
    }
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let y = -rad; y <= rad; y++) if (y >= 0 && y < h) { s += a[y * w + x]; c++; }
      for (let y = 0; y < h; y++) {
        t[y] = s / c;
        const out = y - rad, inn = y + rad + 1;
        if (out >= 0) { s -= a[out * w + x]; c--; }
        if (inn < h) { s += a[inn * w + x]; c++; }
      }
      for (let y = 0; y < h; y++) a[y * w + x] = t[y];
    }
  }
}

// One puff: a dome of big core circles with small round bumps along its top
// and sides. (cx, cy) = middle of its base, pw = width, ph = height.
function puff(r, cx, cy, pw, ph, bumps = 1) {
  const cs = [];
  const nCore = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nCore; i++) {
    const t = nCore === 1 ? 0.5 : i / (nCore - 1);
    const rad = pw * (0.2 + r() * 0.08) * (1 - Math.abs(t - 0.5) * 0.6);
    cs.push([cx + (t - 0.5) * pw * 0.55, cy - ph * (0.3 + 0.25 * (1 - Math.abs(t - 0.5) * 2)) + rad * 0.3, rad]);
  }
  // a column of core circles up the middle so the top bumps never float free
  for (let k = 1; k <= 3; k++) {
    const rad = pw * (0.27 - k * 0.03);
    cs.push([cx + (r() - 0.5) * pw * 0.12, cy - ph * (0.25 + k * 0.17), rad]);
  }
  // bumps along the outline of a half ellipse (left foot, over the top, right foot)
  const n = Math.round((8 + r() * 5) * bumps);
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i + 0.5 + (r() - 0.5) * 0.6) / n * Math.PI; // pi..2pi = over the top (y up = -)
    const ex = cx + Math.cos(a) * pw * 0.45, ey = cy + Math.sin(a) * ph * 0.82;
    const top = -Math.sin(a); // 1 at the top
    const rad = pw * (0.07 + r() * 0.07) * (0.7 + top * 0.6);
    cs.push([ex - Math.cos(a) * rad * 0.6, ey - Math.sin(a) * rad * 0.6, rad]);
  }
  // a few tiny bumps on top of bumps, for a lively edge
  for (let i = 0; i < 3 * bumps; i++) {
    const c = cs[nCore + Math.floor(r() * (cs.length - nCore))];
    if (!c) break;
    const a = Math.PI + 0.3 + r() * (Math.PI - 0.6);
    cs.push([c[0] + Math.cos(a) * c[2] * 0.75, c[1] + Math.sin(a) * c[2] * 0.75, c[2] * (0.35 + r() * 0.2)]);
  }
  return cs;
}

// Paint one cloud to a canvas. kind 'tower' (towering cumulus) or 'low' (flat cloudlet).
export function paintCloud(seed, W, H, kind) {
  const r = rng(seed);
  const base = H * 0.9;
  const P = []; // {cs, depth}
  if (kind === 'tower') {
    // back tower(s)
    const nt = 1 + Math.floor(r() * 2);
    for (let i = 0; i < nt; i++) {
      const cx = W * (0.36 + r() * 0.28), pw = W * (0.32 + r() * 0.1);
      P.push({ cs: puff(r, cx, H * (0.66 + r() * 0.06), pw, H * (0.58 + r() * 0.1), 1.1), depth: 0 });
    }
    // middle body
    const nm = 2 + Math.floor(r() * 2);
    for (let i = 0; i < nm; i++) {
      const t = nm === 1 ? 0.5 : i / (nm - 1);
      const pw = W * (0.4 + r() * 0.1);
      P.push({ cs: puff(r, W * (0.3 + t * 0.4 + (r() - 0.5) * 0.06), H * (0.84 + r() * 0.04), pw, H * (0.4 + r() * 0.08)), depth: 0.45 });
    }
    // front puffs along the base
    const nf = 3 + Math.floor(r() * 2);
    for (let i = 0; i < nf; i++) {
      const t = i / (nf - 1);
      const pw = W * (0.27 + r() * 0.08);
      P.push({ cs: puff(r, W * (0.16 + t * 0.68 + (r() - 0.5) * 0.05), base + H * 0.02, pw, H * (0.2 + r() * 0.08), 0.8), depth: 1 });
    }
  } else {
    const nf = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nf; i++) {
      const t = nf === 1 ? 0.5 : i / (nf - 1);
      const pw = W * (0.34 + r() * 0.16);
      P.push({ cs: puff(r, W * (0.22 + t * 0.56), base + H * 0.02, pw, H * (0.45 + r() * 0.35), 0.8), depth: i % 2 ? 1 : 0.5 });
    }
  }
  P.sort((a, b) => a.depth - b.depth);

  const N = W * H;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), A = new Float32Array(N);
  for (const p of P) {
    let x0 = W, y0 = H, x1 = 0, y1 = 0, top = H, rmax = 0;
    for (const [x, y, rad] of p.cs) {
      x0 = Math.min(x0, x - rad); x1 = Math.max(x1, x + rad); y0 = Math.min(y0, y - rad); y1 = Math.max(y1, y + rad);
      top = Math.min(top, y - rad); rmax = Math.max(rmax, rad);
    }
    const pw = x1 - x0, bR = Math.max(2, Math.round(pw * 0.09));
    x0 = Math.max(0, Math.floor(x0) - bR * 3); y0 = Math.max(0, Math.floor(y0) - bR * 3);
    x1 = Math.min(W - 1, Math.ceil(x1) + bR * 3); y1 = Math.min(H - 1, Math.ceil(y1) + bR * 3);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const S = new Float32Array(w * h), Bl = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      const y = y0 + j + 0.5;
      for (let i = 0; i < w; i++) {
        const x = x0 + i + 0.5;
        let s = -1e9;
        for (const c of p.cs) { const dx = x - c[0], dy = y - c[1]; const v = c[2] - Math.sqrt(dx * dx + dy * dy); if (v > s) s = v; }
        // flat base, softly scalloped: small arcs bulging down
        const seg = W * 0.06, u = ((x / seg) % 1) * 2 - 1;
        s = Math.min(s, base + H * 0.018 * Math.sqrt(1 - u * u) - y);
        S[j * w + i] = s;
        Bl[j * w + i] = Math.max(-bR * 2, Math.min(s, rmax));
      }
    }
    blur(Bl, w, h, bR, 3);
    const hs = Math.max(1, pw * 0.22);
    const ph = base - top;
    for (let j = 1; j < h - 1; j++) {
      const y = y0 + j;
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i, s = S[k];
        const a = Math.min(1, Math.max(0, s + 0.5));
        if (a <= 0) continue;
        // height field: smooth dome from the blurred distance, with a little of
        // the raw distance so shadow edges keep soft scallops
        const f = (q) => Bl[q] * 0.93 + Math.max(-2, Math.min(S[q], rmax)) * 0.07;
        const gx = (f(k + 1) - f(k - 1)) * 0.5, gy = (f(k + w) - f(k - w)) * 0.5;
        const hn = Math.min(1, Math.max(0, Bl[k] / hs));
        let nx = -gx, ny = -gy, nz = 0.8 + hn * 1.8;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const d = (nx * LX + ny * LY + nz * LZ) / LN;
        const vy = (y - top) / ph; // 0 top .. 1 base of this puff
        const sh = d - vy * 0.22 - (1 - p.depth) * 0.04 + 0.08;
        let col = mixc(DEEP, SHADE, sm(-0.05, 0.18, sh));
        col = mixc(col, MID, sm(0.18, 0.36, sh));
        col = mixc(col, WHITE, sm(0.38, 0.56, sh));
        // back puffs sit a little in the blue
        col = mixc(col, BACK, (1 - p.depth) * 0.22 * (1 - sm(0.5, 0.8, sh)));
        // warm glow on the sunlit side of the lower puffs
        col = mixc(col, WARM, sm(0.35, 0.6, d) * sm(0.4, 0.8, y / H) * 0.7);
        // the base dissolves into the pale blue haze
        col = mixc(col, HAZE, sm(base - H * 0.22, base + H * 0.02, y) * 0.7);
        const kk = y * W + x0 + i;
        const ta = A[kk];
        R[kk] = R[kk] * (1 - a) + col[0] * a; G[kk] = G[kk] * (1 - a) + col[1] * a; B[kk] = B[kk] * (1 - a) + col[2] * a;
        A[kk] = a + ta * (1 - a);
        if (ta === 0) { R[kk] = col[0]; G[kk] = col[1]; B[kk] = col[2]; }
      }
    }
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), D = img.data;
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    if (A[k] > 0) { D[o] = R[k]; D[o + 1] = G[k]; D[o + 2] = B[k]; D[o + 3] = A[k] * 255; }
    else { D[o] = 214; D[o + 1] = 228; D[o + 2] = 248; D[o + 3] = 0; } // light fringe when filtered
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// A thin painted streak: a few long lenses, crisp edged.
export function paintStreak(seed, W, H) {
  const r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const cx = W * (0.15 + r() * 0.7), cy = H * (0.35 + r() * 0.3), rx = W * (0.12 + r() * 0.2), ry = H * (0.08 + r() * 0.12);
    ctx.fillStyle = i % 2 ? 'rgb(236,243,252)' : 'rgb(255,255,255)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  return cv;
}

// Upload straight from the pixels (a canvas would premultiply and lose the
// colour of the clear pixels, leaving a dark fringe on the filtered edge).
function tex(cv) {
  const W = cv.width, H = cv.height;
  const src = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const D = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const so = y * W * 4, dO = (H - 1 - y) * W * 4;
    for (let i = 0; i < W * 4; i += 4) {
      const a = src[so + i + 3];
      if (a === 0) { D[dO + i] = 222; D[dO + i + 1] = 234; D[dO + i + 2] = 250; D[dO + i + 3] = 0; }
      else for (let c = 0; c < 4; c++) D[dO + i + c] = src[so + i + c];
    }
  }
  const t = new THREE.DataTexture(D, W, H);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export function buildClouds() {
  const r = rng(4242);
  const group = new THREE.Group();
  const mat = (t, o = 1) => new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: o });
  const towers = [], lows = [], streaks = [];
  for (let i = 0; i < 6; i++) towers.push(mat(tex(paintCloud(100 + i * 17, 448, 400, 'tower'))));
  for (let i = 0; i < 5; i++) lows.push(mat(tex(paintCloud(500 + i * 13, 256, 112, 'low'))));
  for (let i = 0; i < 3; i++) streaks.push(mat(tex(paintStreak(900 + i, 512, 48)), 0.9));
  const add = (m, ratio, w, a, d, y) => {
    const s = new THREE.Sprite(m);
    s.center.set(0.5, 0.06);
    s.scale.set(w, w * ratio, 1);
    s.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    s.renderOrder = -5;
    group.add(s);
    return s;
  };
  // towering cumulus all round, bases just above the far ridges
  const NT = 13;
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * Math.PI * 2 + (r() - 0.5) * 0.3;
    add(towers[i % towers.length], 400 / 448, 270 + r() * 160, a, 600 + r() * 150, 90 + r() * 80);
  }
  // flat cloudlets low on the horizon
  for (let i = 0; i < 24; i++) {
    add(lows[i % lows.length], 112 / 256, 50 + r() * 70, r() * Math.PI * 2, 720 + r() * 60, 70 + r() * 90);
  }
  // thin streaks
  for (let i = 0; i < 8; i++) {
    add(streaks[i % streaks.length], 48 / 512, 160 + r() * 160, r() * Math.PI * 2, 740 + r() * 60, 200 + r() * 200);
  }
  group.userData.tick = (dt) => { group.rotation.y += dt * 0.003; };
  return group;
}
