// Eyewear: glasses, sunglasses, goggles (flight, swim, safety), a monocle and a
// doctor's head mirror. All of it is built as direct meshes (hats.js' MeshHelper:
// tubes swept along paths, lathed cups, flat lenses) in the head's frame and is
// rigid on the Head bone.
//
// Fit: the lenses are centred on the painted eyes (face.js lays them out in head
// heights from the nose line: about 0.18 hh out, just under the eye line) and
// sized to cover them (the anime's eyes are big, so are its glasses), standing
// off the face's own surface (the body field, found by marching) by a little,
// turned a touch round the face's curve. The bridge clears the nose, the temples
// run back along the side of the head (over the ears' tops) and hook down behind
// the ears. Goggles' straps go round the head over the hair; flight goggles are
// worn up on the forehead (or on a hat), as the catalogue says.
//
// Paint (gco): x, y in the lens' plane (m, from the lens centre), z unused,
// w part id: 0 frame, 1 lens, 2 strap, 3 chain / mount, 4 mirror.
import { headHelper, MeshHelper, pieceHelper, surfHelper, exitHelper, frameHelper, inFrameHelper, toFrameHelper, addV, subV, nrm, cross, lerpV, hasHelper as has, hairLift, outerOffHelper, rampHelper, fmtHelper as f3 } from './hats.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// where the painted eyes are (face.js' layout), in the head's local frame, and the face in front of them
function eyesOf(ctx) {
  const H = headHelper(ctx), L = H.L, a = L.age, hh = H.hh, T = hh / 0.28;
  const kid = 1 - sm(9, 18, a), toddler = 1 - sm(4, 8, a);
  const W = 0.158 + (0.148 - 0.158) * sm(4, 16, a) + 0.012 * toddler;
  const ex = W * (1.08 + 0.1 * kid) * hh, ey = H.eye - (0.012 + 0.02 * toddler) * hh;
  // the face's surface in front of each eye and at the bridge (the body field: nose and cheeks included)
  const front = (x, y) => surfHelper(ctx, H.W([x, y, 0]), [0, 0, 1], 0, H.hh * 0.8);
  const eyeZ = front(ex, ey)[2] - H.O[2], bridgeZ = front(0, ey + hh * 0.02)[2] - H.O[2];
  return { H, hh, T, ex, ey, W: W * hh, eyeZ, bridgeZ, kid, toddler };
}
// a lens outline (local 2D, CCW): round (r) or a rounded rectangle (hx, hy, rd); n points
function outline(shape, n, o) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    if (shape === 'round') pts.push([c * o.r, s * o.r]);
    else {
      // superellipse: squarish with round corners
      const e = o.e ?? 0.3, x = Math.sign(c) * Math.pow(Math.abs(c), e) * o.hx, y = Math.sign(s) * Math.pow(Math.abs(s), e) * o.hy;
      pts.push([x + (o.tilt || 0) * y, y - (o.drop || 0) * Math.max(0, -y / o.hy) * Math.abs(x) / o.hx * o.hy]);
    }
  }
  return pts;
}
// both lens frames: centres (world), the frame axes per side, and a builder for paths in a lens' plane
function lensFrames(E, o) {
  const { H } = E, out = [];
  for (const s of [1, -1]) {
    const c = H.W([s * (o.x ?? E.ex), o.y ?? E.ey, (o.z ?? E.eyeZ) + o.off]);
    const ax = frameHelper([s * (o.wrap ?? 0.16), -(o.tiltBack ?? 0.05), 1], [0, 1, 0]);
    out.push({ s, c, ax, P: (x, y, z = 0) => inFrameHelper(c, ax, [x, y, z]) });
  }
  return out;
}
const gEye = (F, id) => (p) => { const l = toFrameHelper(F.c, F.ax, p); return [l[0], l[1], l[2], id]; };

// temples: from the frame's outer edge back along the side of the head to behind the ear (path, world)
function templePath(ctx, E, F, from, o = {}) {
  const { H, hh, T } = E, s = F.s, path = [from];
  const y0 = H.W([0, E.ey + hh * (o.up ?? 0.07), 0])[1], zEar = H.O[2] + H.ear[2] - hh * 0.06;
  const z0 = from[2] - 0.006 * T;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, z = z0 + (zEar - z0) * t, y = from[1] + (y0 - from[1]) * Math.min(1, t * 2.5);
    path.push(surfHelper(ctx, [H.O[0], y, z], [s, 0, 0], (o.off ?? 0.0035) * T, H.hw));
  }
  // over the ear and down behind it
  const last = path[path.length - 1];
  for (let i = 1; i <= 3; i++) { const a = (i / 3) * 1.1; path.push(surfHelper(ctx, [H.O[0], last[1] - Math.sin(a) * hh * 0.09, last[2] - (1 - Math.cos(a)) * hh * 0.04 - hh * 0.02 * i / 3], [s, 0, 0], 0.003 * T, H.hw)); }
  return path;
}
// a strap round the head through the two lens centres' height (over the hair at the back)
function strapLoop(E, y, tilt, lift, n = 40) {
  const { H } = E, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, back = Math.max(0, -Math.cos(a));
    const d = nrm([Math.sin(a), (y + (Math.cos(a) < 0 ? -Math.cos(a) * tilt : 0)) / H.hh * 0.0, Math.cos(a)]);
    const yy = y - back * tilt;
    // the skull's radius in this direction at that height
    let r = 0; { const dir = [d[0], 0, d[2]]; let t = H.hw; for (let k = 0; k < 80; k++) { const v = H.f(dir[0] * t, yy, dir[2] * t); if (v < 1e-4) break; t -= Math.max(v * 0.9, 1e-4); } r = t; }
    pts.push(H.W([d[0] * (r + lift * (0.4 + 0.6 * back)), yy, d[2] * (r + lift * (0.4 + 0.6 * back))]));
  }
  return pts;
}

// glasses and sunglasses ------------------------------------------------------
function spectacles(ctx, it, o) {
  const E = eyesOf(ctx), { H, hh, T } = E;
  const round = o.shape === 'round';
  const r = hh * (o.r ?? 0.118), hx = hh * (o.hx ?? 0.125), hy = hh * (o.hy ?? 0.1);
  const tube = (o.tube ?? 0.0021) * T;
  const off = (o.off ?? 0.016) * T;
  const frames = lensFrames(E, { off, y: E.ey + hh * (o.dy ?? 0.0), wrap: 0.18 });
  const m = new MeshHelper(), lens = new MeshHelper();
  const n = 40, shape = round ? outline('round', n, { r }) : outline('sq', n, { hx, hy, e: o.e ?? 0.32, drop: o.drop ?? 0.12 });
  let inner = [], outer = [];
  for (const F of frames) {
    const rim = shape.map(([x, y]) => F.P(x, y));
    m.sweep(rim, { r: tube, closed: true, seg: 7, prof: o.flatRim ? 'flat' : undefined, th: o.flatRim ? () => [tube * 1.7, tube] : undefined, up: o.flatRim ? () => F.ax[2] : undefined, g: (t, a, S, i) => gEye(F, 0)(rim[i]) });
    if (o.lens) {
      // a slightly domed lens filling the rim
      const g = gEye(F, 1), ctr = lens.vert(F.P(0, 0, 0.0015 * T), g(F.P(0, 0, 0.0015 * T))), ring = shape.map(([x, y]) => { const p = F.P(x * 0.97, y * 0.97, 0); return lens.vert(p, g(p)); });
      const t0 = lens.idx.length; lens.strip([ctr], ring, true); lens.orient(t0, lens.idx.length, () => F.ax[2]);
      const ctrB = lens.vert(F.P(0, 0, -0.0006 * T), g(F.P(0, 0, 0))), t1 = lens.idx.length; lens.strip([ctrB], ring, true); lens.orient(t1, lens.idx.length, () => F.ax[2].map((v) => -v));
    }
    // the inner (towards the nose) and outer edge points for the bridge and the temples
    const xs = shape.map((p) => p[0] * F.s);
    const iIn = xs.indexOf(Math.min(...xs)), iOut = xs.indexOf(Math.max(...xs));
    inner.push(rim[iIn]); outer.push(rim[iOut]);
    // nose pads
  }
  // the bridge: an arch over the nose
  const bz = H.O[2] + E.bridgeZ + off * 0.55, by = inner[0][1] + hh * 0.025;
  const bridge = [inner[0], [inner[0][0] * 0.45, by, bz], [0, by + hh * 0.01, bz], [inner[1][0] * 0.45, by, bz], inner[1]];
  m.sweep(bridge, { r: tube * 1.05, seg: 7, g: () => [0, 0, 0, 0] });
  if (o.browBar) { const bb = frames.map((F) => F.P(0, (round ? r : hy) * 0.95)); m.sweep([bb[0], [0, bb[0][1] + hh * 0.01, bz + 0.002 * T], bb[1]], { r: tube * 0.9, seg: 6, g: () => [0, 0, 0, 0] }); }
  // temples
  for (const [k, F] of frames.entries()) {
    const p = templePath(ctx, E, F, outer[k]);
    m.sweep(p, { prof: 'flat', th: () => [tube * 1.25, tube * 0.8], up: () => [F.s, 0, 0], seg: 6, g: () => [0, 0, 0, 0] });
  }
  const out = [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `vec3 col = uMain; return col;` }];
  if (o.lens) out.push({ piece: pieceHelper(ctx, lens, { bone: 'Head', double: true }), noPattern: true, glsl: `vec2 q = vG.xy; vec3 col = mix(uSecond, uSecond * 0.55, smoothstep(${f3(-hh * 0.1)}, ${f3(hh * 0.12)}, q.y));
    float gl = line(q.x + q.y * 0.9, ${f3(-hh * 0.035)}, ${f3(hh * 0.022)}) + line(q.x + q.y * 0.9, ${f3(hh * 0.01)}, ${f3(hh * 0.008)});
    col = mix(col, vec3(1.0), clamp(gl, 0.0, 1.0) * 0.55);
    return col;` });
  return out;
}
export const glasses_round = (ctx, it) => spectacles(ctx, it, { shape: 'round', tube: 0.0019 });
export const glasses_square = (ctx, it) => spectacles(ctx, it, { shape: 'square', tube: 0.0026, flatRim: true, hx: 0.13, hy: 0.095 });
export const sunglasses_round = (ctx, it) => spectacles(ctx, it, { shape: 'round', tube: 0.0026, lens: true, r: 0.122 });
export const sunglasses_square = (ctx, it) => spectacles(ctx, it, { shape: 'square', tube: 0.003, flatRim: true, lens: true, hx: 0.14, hy: 0.1, drop: 0.25, browBar: false });

// goggles ------------------------------------------------------------------------
// o: { up (worn on the forehead), r (cup radius x hh), depth, swim (small cups), safety (one wide visor) }
function goggleSet(ctx, it, o) {
  const E = eyesOf(ctx), { H, hh, T } = E;
  const hat = it.has('hat');
  let frames, stY, stTilt, lift;
  if (o.up) {
    // up on the forehead (over the hair, or on a hat): tipped back
    const y = H.eye + hh * 0.34, lf = hat ? 0.026 * T : hairLift(H) * 1.15;
    const zF = H.zF(y) + lf + 0.004 * T;
    frames = [1, -1].map((s) => { const c = H.W([s * E.ex * 1.05, y, zF - Math.abs(E.ex) * 0.25]); const ax = frameHelper([s * 0.2, 0.5, 1], [0, 1, 0]); return { s, c, ax, P: (x, yy, z = 0) => inFrameHelper(c, ax, [x, yy, z]) }; });
    stY = y - hh * 0.02; stTilt = hh * 0.12; lift = hat ? 0.026 * T : hairLift(H) * 1.1;
  } else {
    frames = lensFrames(E, { off: (o.off ?? 0.012) * T, wrap: o.swim ? 0.3 : 0.2, y: E.ey + hh * 0.01 });
    stY = E.ey + hh * 0.02; stTilt = hh * 0.06; lift = hairLift(H) * 0.6;
  }
  const m = new MeshHelper(), lens = new MeshHelper();
  const r = hh * (o.r ?? 0.12), depth = (o.depth ?? 0.014) * T;
  const ends = [];
  if (o.safety) {
    // one wide visor across both eyes, following the face's curve
    const n = 36, F0 = frames[0], F1 = frames[1], wy = hh * 0.13;
    // the frame: a band round the visor's outline (top, bottom), and the side shields
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = (t * 2 - 1) * (E.ex + r * 1.25), s = x >= 0 ? 1 : -1, F = s > 0 ? F0 : F1, lx = (Math.abs(x) - E.ex) * s;
      const bend = -Math.pow(Math.max(Math.abs(x) - E.ex * 0.2, 0) / (E.ex + r), 2) * hh * 0.08;
      top.push(F.P(lx, wy, bend)); bot.push(F.P(lx, -wy * (1 - 0.35 * Math.exp(-((x / (hh * 0.05)) ** 2))), bend));
    }
    const g = gEye(F0, 0);
    m.sweep(top, { prof: 'flat', th: () => [0.004 * T, 0.004 * T], up: () => [0, 0, 1], g: (tt, a, S, i) => g(top[i]) });
    m.sweep(bot, { prof: 'flat', th: () => [0.004 * T, 0.004 * T], up: () => [0, 0, 1], g: (tt, a, S, i) => g(bot[i]) });
    for (const [k, i] of [[0, n], [1, 0]]) { const side = [top[i], lerpV(top[i], bot[i], 0.5), bot[i]]; m.sweep(side, { prof: 'flat', th: () => [0.006 * T, 0.004 * T], up: () => [0, 0, 1], g: () => [0, 0, 0, 0] }); ends.push(lerpV(top[i], bot[i], 0.5)); void k; }
  } else {
    for (const F of frames) {
      const g0 = gEye(F, 0), sh = o.swim ? outline('sq', 28, { hx: r * 1.05, hy: r * 0.72, e: 0.6 }) : outline('round', 28, { r });
      // the cup: a ring from the face out to the lens, a thick rim at the front
      const back = sh.map(([x, y]) => F.P(x * 0.92, y * 0.92, -depth)), front = sh.map(([x, y]) => F.P(x, y, 0));
      const A = back.map((p) => m.vert(p, g0(p))), B = front.map((p) => m.vert(p, g0(p)));
      const t0 = m.idx.length; m.strip(A, B, true); m.orient(t0, m.idx.length, (q) => { const l = toFrameHelper(F.c, F.ax, q); return inFrameHelper([0, 0, 0], F.ax, [l[0], l[1], 0]); });
      m.sweep(front, { r: (o.rim ?? 0.0032) * T, closed: true, seg: 7, g: (t, a, S, i) => g0(front[i]) });
      const gl = gEye(F, 1), c = lens.vert(F.P(0, 0, 0.002 * T), gl(F.P(0, 0, 0))), ring = sh.map(([x, y]) => { const p = F.P(x * 0.96, y * 0.96, 0); return lens.vert(p, gl(p)); });
      const t1 = lens.idx.length; lens.strip([c], ring, true); lens.orient(t1, lens.idx.length, () => F.ax[2]);
      const xs = sh.map((p) => p[0] * F.s);
      ends.push(front[xs.indexOf(Math.max(...xs))]);
      F.inner = front[xs.indexOf(Math.min(...xs))];
    }
    // the bridge between the cups
    const b0 = frames[0].inner, b1 = frames[1].inner, mid = lerpV(b0, b1, 0.5);
    m.sweep([b0, addV(mid, [0, 0.004 * T, 0.003 * T]), b1], { prof: o.swim ? undefined : 'flat', r: 0.0022 * T, th: o.swim ? undefined : () => [0.004 * T, 0.0025 * T], up: () => [0, 0, 1], g: () => [0, 0, 0, 3] });
  }
  // the strap: from each side round the back of the head
  const loop = strapLoop(E, stY, stTilt, lift);
  // keep the back part (behind the cups' outer ends) and join it to the ends
  const zCut = Math.min(ends[0][2], ends[1][2]) - 0.01 * T;
  const back = loop.filter((p) => p[2] < zCut).sort((a, b) => Math.atan2(a[0], -(a[2] - H.O[2])) - Math.atan2(b[0], -(b[2] - H.O[2]))).reverse();
  const strap = [ends[0], ...back, ends[1]];
  m.sweep(strap, { prof: 'flat', th: () => [hh * (o.swim ? 0.03 : 0.05), 0.0018 * T], up: (i, p) => nrm([p[0] - H.O[0], 0, p[2] - H.O[2]]), seg: 8, g: (t) => [t, 0, 0, 2] });
  const strapAdj = has(it, 'strap_adjust');
  const out = [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = ${o.frame || 'uMain'};
    if (id > 1.5 && id < 2.5) { col = ${o.strap || 'uSecond'}; ${strapAdj ? 'col = mix(col, uTrim, band(vG.x, 0.46, 0.5) + band(vG.x, 0.5, 0.54) * 0.6);' : ''} }
    if (id > 2.5) col = uTrim;
    return col;` }];
  if (lens.idx.length) out.push({ piece: pieceHelper(ctx, lens, { bone: 'Head', double: true }), noPattern: true, glsl: `vec2 q = vG.xy; vec3 col = mix(${o.tint || 'uAccent'}, ${o.tint || 'uAccent'} * 0.6, smoothstep(${f3(-hh * 0.1)}, ${f3(hh * 0.1)}, q.y));
    col = mix(col, vec3(1.0), clamp(line(q.x + q.y, ${f3(-hh * 0.03)}, ${f3(hh * 0.025)}) + line(q.x + q.y, ${f3(hh * 0.02)}, ${f3(hh * 0.008)}), 0.0, 1.0) * 0.55);
    return col;` });
  return out;
}
export const goggles = (ctx, it) => goggleSet(ctx, it, { up: true, r: 0.12, depth: 0.018, rim: 0.0045, tint: 'uMain * 0.9 + vec3(0.06)', frame: 'uSecond', strap: 'uSecond * 0.8' });
export const goggles_swim = (ctx, it) => goggleSet(ctx, it, { swim: true, r: 0.11, depth: 0.01, rim: 0.0028, off: 0.006, tint: 'mix(uMain, uAccent, 0.5)' });
export const goggles_safety = (ctx, it) => goggleSet(ctx, it, { safety: true, r: 0.12, off: 0.02 });

// a monocle on the right eye, its chain down to the chest
export function monocle(ctx, it) {
  const E = eyesOf(ctx), { H, hh, T } = E;
  const [, F] = lensFrames(E, { off: 0.008 * T, wrap: 0.2 });
  const r = hh * 0.12, m = new MeshHelper(), g = gEye(F, 0);
  const rim = outline('round', 36, { r }).map(([x, y]) => F.P(x, y));
  m.sweep(rim, { r: 0.0026 * T, closed: true, seg: 7, g: (t, a, S, i) => g(rim[i]) });
  const out = [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: 'return uMain;' }];
  if (has(it, 'chain')) {
    // from the rim's outer bottom, down the cheek and the side of the neck, to the chest
    const L = ctx.A.L, start = F.P(-r * 0.7, -r * 0.7), off = outerOffHelper(it) + 0.003;
    const path = [start];
    // out over the cheek to the jaw's side, behind the jaw down the neck, onto the chest
    for (const [x, y, z] of [[-0.36, H.chin + hh * 0.22, 0.32], [-0.46, H.chin + hh * 0.08, 0.1], [-0.42, H.chin - hh * 0.05, 0.0]]) path.push(surfHelper(ctx, H.W([H.hw * x, y, hh * z]), [-0.7, 0, 0.7], 0.006 * T, 0.2));
    for (let i = 1; i <= 5; i++) { const t = i / 5, y = L.shY + 0.01 - (L.shY + 0.01 - L.chestY) * t * 0.95, x = -L.chestW * (0.26 - 0.06 * t); { const q = exitHelper(ctx, [x, y, -0.02], [0, 0, 1], 0); path.push(addV(q, [0, 0, 1], off)); } }
    // smooth the chain's hang
    const cm = new MeshHelper().sweep(path, { r: 0.0013 * T, seg: 5, g: (t) => [t, 0, 0, 3] });
    const yNeck = L.chinY - 0.01, yLow = L.shY - 0.02;
    out.push({ piece: pieceHelper(ctx, cm, { weights: (p) => rampHelper('Head', 'Spine3', clamp((yNeck - p[1]) / (yNeck - yLow))) }), noPattern: true, glsl: 'vec3 col = uMain; col *= 0.75 + 0.25 * step(0.5, fract(vG.x * 160.0)); return col;' });
  }
  return out;
}

// a doctor's head mirror: a band round the forehead, a round mirror on a mount
export function head_mirror(ctx, it) {
  const E = eyesOf(ctx), { H, hh, T } = E;
  const y = H.eye + hh * 0.3, lift = hairLift(H) * 0.6;
  const loop = strapLoop(E, y, hh * 0.08, lift, 48);
  loop.push(loop[0]);
  const m = new MeshHelper();
  m.sweep(loop, { prof: 'flat', th: () => [hh * 0.04, 0.0018 * T], up: (i, p) => nrm([p[0] - H.O[0], 0, p[2] - H.O[2]]), seg: 8, g: (t) => [t, 0, 0, 2] });
  // the mirror: a dished disc tipped up, in front of the forehead, a little to one side
  const c = H.W([H.hw * 0.12, y + hh * 0.05, H.zF(y) + lift * 0.6 + hh * 0.07]);
  const ax = frameHelper([0.15, 0.55, 1], [0, 1, 0]), R = hh * 0.17;
  const yax = [ax[0], ax[2], ax[1].map((v) => -v)];   // lathe axis (y) = the mirror's normal
  m.lathe(c, yax, [[0.0001, -0.002 * T], [R * 0.5, -0.0015 * T], [R, 0.001 * T], [R, 0.004 * T], [R * 0.5, 0.0045 * T], [0.0001, 0.005 * T]].reverse(), { seg: 32, g: (l, r) => [l[0], l[2], r, 4] });
  // the mount from the band to the mirror's back
  const bandFront = H.W([H.hw * 0.08, y, H.zF(y) + lift * 0.6 + 0.002 * T]);
  m.sweep([bandFront, lerpV(bandFront, c, 0.6), addV(c, ax[2], -0.004 * T)], { r: 0.0035 * T, seg: 6, g: () => [0, 0, 0, 3] });
  return [{ piece: pieceHelper(ctx, m, { bone: 'Head', double: true }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uSecond;
    if (id > 3.5) { col = uMain; float r = vG.z; col = mix(col, vec3(1.0), clamp(line(vG.x + vG.y, ${f3(-hh * 0.04)}, ${f3(hh * 0.03)}), 0.0, 1.0) * 0.6); col = mix(col, vec3(0.12), circle(vG.xy, vec2(0.0), ${f3(hh * 0.025)})); col = mix(col, uTrim, line(r, ${f3(hh * 0.165)}, ${f3(hh * 0.012)})); }
    if (id > 2.5 && id < 3.5) col = uTrim;
    return col;` }];
}
