// Prof. Oak's lab coat (cast.js): a whole garment built over the body in its rest
// pose, every part of it its own cloth standing off the body, none of it paint:
//
//   - the coat's shell: one piece from the neckline over the shoulders and the upper
//     back (riding rigidly with the trunk) and from the armpits straight down to the
//     knees, every row a convex outline clear of the body (bridging its hollows), open
//     in front along a roll line that runs from the break point at the waist up to the
//     sides of the neck; below the chest it moves as cloth (garments.js clothSim);
//   - the collar: a shirt-style collar on a stand round the back of the neck, folded
//     over and down onto the shoulders and the upper back, its points coming forward
//     onto the chest; a folded sheet with real thickness (an outside, a lining and rims);
//   - the lapels: the front edges folded back along the roll line, lying on the chest,
//     notched under the collar's points, moving with the front edges below the chest;
//   - patch pockets low on each front panel and a breast pocket on the left, sewn on
//     the cloth (they move with it);
//   - sleeves: loose tubes from the shoulder seam (lapped over the shell) to the wrist,
//     snug underneath so they stay outside the coat at the armpit, with turned-back cuffs.
//
// labCoat(G, colours) adds them all to the garment set G (cast.js dressUp).
import * as THREE from 'three';
import { slab, paintGrid, nearW, mixW, trisOf, fixRing, hullRing, cast, ZC, ARM_Y, ARM_Z } from './garments.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = THREE.MathUtils.lerp;
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
// piecewise linear table lookup: rows [y, ...values]
function table(rows, y) {
  const r = rows[0][0] < rows[rows.length - 1][0] ? rows : [...rows].reverse();
  if (y <= r[0][0]) return r[0].slice(1);
  for (let i = 1; i < r.length; i++) if (y <= r[i][0]) { const a = r[i - 1], b = r[i], u = (y - a[0]) / (b[0] - a[0]); return a.slice(1).map((v, k) => lerp(v, b[k + 1], u)); }
  return r[r.length - 1].slice(1);
}
// a rounded box round the trunk's axis: half width a, depth f in front, b behind
const box = (a, f, b, n = 4) => (th) => { const s = Math.abs(Math.sin(th)), c = Math.cos(th), d = c > 0 ? f : b; return 1 / ((s / a) ** n + (Math.abs(c) / d) ** n) ** (1 / n); };
const at = (r, y, th) => V(r * Math.sin(th), y, ZC + r * Math.cos(th));
const radOf = (p) => Math.hypot(p.x, p.z - ZC);

// ---------- the shape ----------
// rows of the shell: the neckline, over the shoulders to the armpits (Y_ARM), then
// straight down to the hem just above the knees
const JY = [1.06, 1.05, 1.036, 1.018, 1.0, 0.98, 0.96];
for (let y = 0.94; y > 0.395; y -= 0.02) JY.push(+y.toFixed(3));
const I_ARM = 6, I_PIN = 7, HEM = JY.length - 1, NC = 42;
// over the shoulders: [y, half width out to the sleeves' seams, clearance off the body]
const YOKE = [[1.05, 0.079, 0.003], [1.036, 0.087, 0.005], [1.018, 0.094, 0.008], [1.0, 0.099, 0.011], [0.98, 0.103, 0.014], [0.96, 0.106, 0.017]];
// the front edges, |x| at height y: straight below the break point (a little open
// towards the hem), along the roll line up to the side of the neck above it
const Y_BREAK = 0.80;
const edgeX = (y) => (y <= Y_BREAK ? 0.032 + 0.014 * sstep(0.74, 0.42, y) : lerp(0.032, 0.038, ((y - Y_BREAK) / (JY[0] - Y_BREAK)) ** 1.2));
// the lapels' width (along the chest) and where they stop under the collar
const LAPEL_W = 0.056, LAPEL_TOP = [1.012, 1.03];

export function labCoat(G, col) {
  const { coat, coat2, shirt } = col, line = mul(coat2, 0.86);
  const tp = G.top.userData.parts;
  // the trunk without the arms' roots (out to the sides in the rest pose), and all of the body
  const trunkT = trisOf(G.top, (i, v) => v.every((p) => Math.abs(p.x) < 0.075));
  const bodyT = [...G.torsoT, ...G.hipT];
  // the trunk's weights (the shoulders and back, not the neck or the shirt's collar)
  const yokeW = nearW([{ mesh: G.top, keep: (x, y, z, i) => tp[i] === 'torso' && y < 1.045 }, { mesh: G.bot, keep: (x, y) => y > 0.62 }]);

  // ----- the shell: each row's radius all round -----
  const F = [];
  { const o = hullRing(trunkT, JY[0], 0.12); F[0] = (th) => o(th) + 0.003; }
  // (over the shoulders, the shoulder blades and the arms' roots too, out to the sleeves' seams)
  const yokeT = G.torsoT.filter((t) => t.v.every((p) => Math.abs(p.x) < 0.104));
  for (let i = 1; i < I_ARM; i++) {
    const y = JY[i], o = ((a, b) => (th) => Math.max(a(th), b(th)))(hullRing(trunkT, y), hullRing(yokeT, y)), [a, off] = table(YOKE, y), bx = box(a, o(0) + off, o(Math.PI) + off);
    F[i] = (th) => Math.max(o(th) + off, bx(th));
  }
  const topShape = ((fs) => (th) => Math.max(...fs.map((f) => f(th))))([0.94, 0.96, 0.98].map((y) => hullRing(G.torsoT, y)));
  const offA = table(YOKE, 0.96)[1], boxA = box(table(YOKE, 0.96)[0], topShape(0) + offA, topShape(Math.PI) + offA);
  const ringTop = (th) => Math.max(topShape(th) + offA, boxA(th));
  // the hem as wide as the hips and the legs under it, so the sides fall straight
  const hemShape = ((fs) => (th) => Math.max(...fs.map((f) => f(th))) + 0.014)([0.7, 0.66, 0.62, 0.45, 0.42, 0.4].map((y) => hullRing(bodyT, y)));
  F[I_ARM] = ringTop;
  for (let i = I_ARM + 1; i <= HEM; i++) {
    const y = JY[i], u = (JY[I_ARM] - y) / (JY[I_ARM] - JY[HEM]), body = hullRing(bodyT, y);
    F[i] = (th) => Math.max(lerp(ringTop(th), hemShape(th), u), body(th) + 0.01);
  }
  // the front edge's angle at each row
  const gapOf = (i) => { const x = edgeX(JY[i]); let th = 0.3; for (let k = 0; k < 6; k++) th = Math.asin(Math.min(0.97, x / F[i](th))); return th; };
  const GAP = JY.map((_, i) => gapOf(i));
  const thOf = (i, j) => GAP[i] + j / NC * (TAU - 2 * GAP[i]);
  const P = JY.map((y, i) => {
    const r = fixRing(Array.from({ length: NC + 1 }, (_, j) => F[i](thOf(i, j))), false, 2);
    return r.map((v, j) => at(v, y, thOf(i, j)));
  });
  const rowAt = (y) => JY.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(JY[b] - y) ? i : b), 0);
  const nc = NC;
  const g = G.hang({
    name: 'oak_coat', grid: { P, closed: false }, weights: (p) => yokeW(p, 12, 4), lining: coat2, th: 0.0045,
    rims: { top: true, bottom: true, left: true, right: true },
    paint: (p, i, j) => {
      const y = p.y, x = Math.abs(p.x), front = p.z > 0.02, je = Math.min(j, nc - j);
      if (je < 0.18) return line;                                                     // the front edges' facing
      if (y <= Y_BREAK && Math.abs(je - 0.6) < 0.1) return line;                      // stitched down the front
      if (!front && p.z < 0 && x < 0.0022 && y < 0.95) return line;                   // a seam down the back,
      if (!front && p.z < 0 && y < 0.56 && Math.abs(x - 0.007) < 0.0018) return line; // the vent below the hips
      if (!front && p.z < 0 && Math.abs(y - 0.95) < 0.0016 && x < 0.085) return line; // the back's yoke
      if (Math.abs(y - 0.412) < 0.0018) return line;                                  // the hem's stitching
      return coat;
    },
    sim: {
      tag: 'C', ns: 15, rows: [I_PIN, rowAt(0.75), rowAt(0.57), HEM], parent: 'Spine2',
      // a medium cotton, heavier towards the hem, riding partly with the hips; the front
      // edges (and the lapels on them) lighter and freer
      prm: (ch) => ({
        ks: [40, 30, 24], drag: [0.5, 0.7, ch.edge ? 1.0 : 0.85], damp: 5, vmax: 1.6, flut: ch.edge ? 0.75 : 0.5,
        cone: ch.edge ? [0.5, 0.62, 0.72] : [0.4, 0.5, 0.6], hangBone: 'Hips', hang: [0, 0.25, 0.5, 0.65], quad: true,
        coll: [{ ring: 'Spine1', caps: ['arms'], seg: ['arms'] },
          { ring: 'Hips', mid: 'Spine1', caps: ['arms'], seg: ['arms', 'thighs'], after: ['thighs'] },
          { caps: ['arms'], seg: ['legs'], after: ['legs'] }],
      }),
    },
  });
  const W = g.W;
  // a point on the shell (its outside) at angle th and height y, with the weights there
  const onShell = (th, y) => {
    let i = 0; while (i < HEM - 1 && JY[i + 1] > y) i++;
    const v = clamp((JY[i] - y) / (JY[i] - JY[i + 1]));
    const side = (k) => { const f = clamp((th - GAP[k]) / (TAU - 2 * GAP[k]) * NC, 0, NC), j = Math.min(NC - 1, Math.floor(f)); return [j, f - j]; };
    const [j0, u0] = side(i), [j1, u1] = side(i + 1);
    const p = P[i][j0].clone().lerp(P[i][j0 + 1], u0).lerp(P[i + 1][j1].clone().lerp(P[i + 1][j1 + 1], u1), v);
    const w = mixW([(1 - v) * (1 - u0), W[i][j0]], [(1 - v) * u0, W[i][j0 + 1]], [v * (1 - u1), W[i + 1][j1]], [v * u1, W[i + 1][j1 + 1]]);
    return { p, w, r: radOf(p) };
  };
  // the angle on the shell's row at y where it is x across (the front, left side)
  const thAtX = (x, y) => { let th = 0.4; for (let k = 0; k < 6; k++) th = Math.asin(Math.min(0.97, x / onShell(th, y).r)); return th; };

  // ----- the collar -----
  // round the back of the neck from one front edge's top to the other's: a stand rising
  // from the neckline, folded over and down onto the shoulders and back (the fall), its
  // points coming forward and down onto the chest. Each column a profile in the plane
  // through the trunk's axis at its angle: (r, y)
  {
    const thC = GAP[0], NCC = 44, CG = 0.0065, CTH = 0.003;
    const B = G.build(), Pc = [], Nc = [], Wc = [];
    for (let j = 0; j <= NCC; j++) {
      const th = thC + j / NCC * (TAU - 2 * thC), back = Math.cos(th) < 0 ? 1 : 0;
      const e = Math.min(th - thC, TAU - thC - th);              // from the collar's end, round the neck
      const hs = 0.007 + 0.015 * sstep(0, 0.9, e);               // the stand: lower towards the points
      const wf = 0.026 + 0.006 * Math.abs(Math.cos(th)) * back + 0.03 * Math.exp(-((e / 0.25) ** 2)) + hs;   // the fall: past the neckline, longest at the points
      const r0 = F[0](th), rs = r0 + 0.0025, y0 = JY[0];
      // the core the fall lies on: the stand's back, then the shell down over the shoulders
      const core = [[rs + CTH, y0 + hs], [rs + CTH, y0]];
      for (let i = 1; i <= I_ARM; i++) core.push([F[i](th), JY[i]]);
      // resample by length and offset outward (left of the way down)
      const len = [0]; for (let k = 1; k < core.length; k++) len.push(len[k - 1] + Math.hypot(core[k][0] - core[k - 1][0], core[k][1] - core[k - 1][1]));
      const ptAt = (s) => { let k = 1; while (k < core.length - 1 && len[k] < s) k++; const u = clamp((s - len[k - 1]) / (len[k] - len[k - 1])); return [lerp(core[k - 1][0], core[k][0], u), lerp(core[k - 1][1], core[k][1], u)]; };
      const nAt = (s) => { const a = ptAt(Math.max(0, s - 0.006)), b = ptAt(s + 0.006), dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1; return [-dy / l, dr / l]; };
      const prof = [], nrm = [];
      // up the stand (its outside faces the neck)
      for (const t of [0, 0.5, 1]) { prof.push([rs, y0 - 0.006 + (hs + 0.006) * t]); nrm.push([-1, 0]); }
      // over the fold
      const R = (CTH + CG) / 2, cx = rs + R, cy = y0 + hs;
      for (const a of [0.8, 0.6, 0.4, 0.2]) { const an = Math.PI * a; prof.push([cx + R * Math.cos(an), cy + R * Math.sin(an)]); nrm.push([Math.cos(an), Math.sin(an)]); }
      // and down the fall, its edge turned up a touch
      const NF = 7;
      for (let k = 0; k <= NF; k++) {
        const s = wf * k / NF, q = ptAt(s), n = nAt(s), o = CG + 0.0015 * (k / NF) ** 2;
        prof.push([q[0] + n[0] * o, q[1] + n[1] * o]); nrm.push(n);
      }
      prof.forEach(([r, y], i) => {
        (Pc[i] || (Pc[i] = []))[j] = at(r, y, th);
        (Nc[i] || (Nc[i] = []))[j] = V(nrm[i][0] * Math.sin(th), nrm[i][1], nrm[i][0] * Math.cos(th));
        // rigid with the trunk under it (the stand's top a little with the neck at the back)
        const base = yokeW(at(Math.max(r, r0), Math.min(y, 1.04), th)), nk = i < 7 ? 0.25 * back * (i / 6) * sstep(0.3, 1, -Math.cos(th)) : 0;
        (Wc[i] || (Wc[i] = []))[j] = mixW([1 - nk, base], [nk, { Neck: 1 }]);
      });
    }
    slab(B, Pc, Wc, CTH, { out: (p, i, j) => Nc[i][j], rims: { top: true, bottom: true, left: true, right: true } });
    G.add(B, paintGrid(Pc, 256, 64, (p, i) => (i > Pc.length - 1.9 ? mul(coat, 0.97) : coat), coat2), 'oak_collar');
  }

  // ----- the lapels -----
  // the front edges turned back along the roll line, lying on the coat from the break point
  // up to under the collar's points, their tops cut on a slant for the notch
  {
    const B = G.build(), NL = 12, NK = 5;
    for (const s of [1, -1]) {
      const Pl = [], Wl = [];
      for (let a = 0; a < NL; a++) {
        const t = a / (NL - 1) * 0.985;
        const row = [], wr = [];
        for (let k = 0; k < NK; k++) {
          const u = k / (NK - 1), y = lerp(lerp(LAPEL_TOP[0], LAPEL_TOP[1], u), Y_BREAK, t);
          const gE = thAtX(edgeX(y), y), wd = Math.max(0.004, LAPEL_W * clamp((y - Y_BREAK) / (LAPEL_TOP[0] - Y_BREAK)) ** 0.75);
          const sh0 = onShell(gE, y), th = gE + u * wd / sh0.r, sh = onShell(th, y);
          const r = sh.r + (k === 0 ? 0.0032 : 0.0058 + 0.0008 * u);
          const p = at(r, y, th); if (s < 0) p.x = -p.x;
          row.push(p); wr.push(s > 0 ? sh.w : onShell(TAU - th, y).w);
        }
        Pl.push(s > 0 ? row : row.reverse()); Wl.push(s > 0 ? wr : wr.reverse());
      }
      slab(B, Pl, Wl, 0.003, { out: (p) => V(p.x, 0, p.z - ZC), rims: { top: true, bottom: true, left: true, right: true } });
    }
    G.add(B, paintGrid([[V(), V()], [V(), V()]], 64, 64, (p, i, j) => coat, coat2), 'oak_lapels', true);
  }

  // ----- pockets -----
  // patch pockets sewn on the coat, moving with it: two low on the front panels, one on the left breast
  {
    const B = G.build(), list = [[1, 0.052, 0.12, 0.555, 0.65], [-1, 0.052, 0.12, 0.555, 0.65], [1, 0.06, 0.1, 0.842, 0.892]];
    let ref = null;
    for (const [s, x0, x1, y0, y1] of list) {
      const NI = 4, NJ = 5, Pp = [], Wp = [];
      for (let a = 0; a < NI; a++) {
        const y = lerp(y1, y0, a / (NI - 1)), row = [], wr = [];
        for (let k = 0; k < NJ; k++) {
          const x = lerp(x0, x1, k / (NJ - 1)), th = thAtX(x, y), sh = onShell(s > 0 ? th : TAU - th, y);
          row.push(at(sh.r + 0.0035, y, s > 0 ? th : TAU - th)); wr.push(sh.w);
        }
        Pp.push(row); Wp.push(wr);
      }
      slab(B, Pp, Wp, 0.0025, { out: (p) => V(p.x, 0, p.z - ZC), rims: { top: true, bottom: true, left: true, right: true } });
      ref = ref || Pp;
    }
    G.add(B, paintGrid(ref, 64, 32, (p, i, j) => (Math.abs(i - 0.42) < 0.09 ? line : coat), coat2), 'oak_pockets', true);
  }

  // ----- sleeves and cuffs -----
  // loose tubes round the arm from the shoulder seam (lapped over the shell's shoulders)
  // to the wrist, snug underneath (against the ribs with the arm down, so they stay outside
  // the coat), skinned to the arm like the skin under them
  {
    const SX = [0.062, 0.071, 0.08, 0.09, 0.1, 0.115, 0.135, 0.16, 0.19, 0.22, 0.25, 0.27, 0.285, 0.3, 0.33, 0.36, 0.39, 0.415, 0.435];
    const OFF = (x) => table([[0.062, 0.0015], [0.08, 0.005], [0.1, 0.009], [0.13, 0.012], [0.25, 0.014], [0.3, 0.015], [0.38, 0.013], [0.435, 0.009]], x)[0];
    const MIN = (x) => table([[0.062, 0], [0.08, 0], [0.11, 0.046], [0.2, 0.048], [0.3, 0.044], [0.435, 0.036]], x)[0];
    const NS = 16, SB = G.build(), CB = G.build(); let sl = null, cl = null;
    const limbR = (T, c) => fixRing(Array.from({ length: NS }, (_, j) => { const a = j / NS * TAU; return cast(T, c, V(0, Math.cos(a), Math.sin(a)), 0.09); }), true, 2);
    for (const s of [1, -1]) {
      const T = trisOf(G.top, (i, v) => v.every((p) => p.x * s > 0.03 && p.x * s < 0.48 && p.y > 0.93));
      const R = SX.map((x) => limbR(T, V(s * x, ARM_Y, ARM_Z)).map((r, j) => {
        const full = Math.max(r + OFF(x), MIN(x)), u = sstep(0.3, 0.95, -Math.cos(j / NS * TAU)) * sstep(0.2, 0.1, x);
        return lerp(full, Math.min(full, r + 0.006), 0.85 * u);
      }));
      const ring = (x, rr) => Array.from({ length: NS + 1 }, (_, j) => { const a = (j % NS) / NS * TAU, r = rr[j % NS]; return V(s * x, ARM_Y + r * Math.cos(a), ARM_Z + r * Math.sin(a)); });
      const Ps = SX.map((x, i) => ring(x, R[i]));
      const aw = G.armW(s), Ws = Ps.map((row) => row.map((p) => aw(p)));
      slab(SB, Ps, Ws, 0.0035, { loop: true, out: (p) => V(0, p.y - ARM_Y, p.z - ARM_Z), rims: { bottom: true } });
      // the cuff: a band turned back over the sleeve's end
      const CX = [0.405, 0.42, 0.44, 0.452], Rl = R[R.length - 1];
      const Pk = CX.map((x, i) => ring(x, Rl.map((r) => r + 0.004 + 0.001 * Math.sin(i / 3 * Math.PI))));
      slab(CB, Pk, Pk.map((row) => row.map((p) => aw(p))), 0.003, { loop: true, out: (p) => V(0, p.y - ARM_Y, p.z - ARM_Z), rims: { top: true, bottom: true } });
      if (s > 0) { sl = Ps; cl = Pk; }
    }
    // a crease or two inside the elbow
    G.add(SB, paintGrid(sl, 128, 64, (p, i, j) => {
      const a = (j / NS) * TAU, inner = Math.abs(Math.sin(a) - 1) < 0.6 && Math.cos(a) > -0.6;
      for (const [x0, amp] of [[0.262, 0.008], [0.288, 0.006]]) if (inner && Math.abs(Math.abs(p.x) - x0 - amp * Math.sin(a * 2)) < 0.0025) return mul(coat, 0.9);
      return coat;
    }, coat2), 'oak_sleeves');
    G.add(CB, paintGrid(cl, 64, 32, (p, i) => (i < 0.25 ? mul(coat2, 0.95) : coat), coat2), 'oak_cuffs');
  }
  // the shirt round the armholes, under the coat's yoke and the sleeves' roots: drawn in
  // towards the shoulder joint, so as the arm turns about it (raised overhead, say) the skin
  // there stays inside the cloth instead of reaching out past the yoke
  G.late('topsjer', (p, part) => {
    if (part !== 'torso' && part !== 'upper') return;
    const s = Math.sign(p.x), jx = s * 0.098, d = Math.hypot(p.x - jx, p.y - 1.029, p.z + 0.004);
    const k = 0.32 * sstep(0.085, 0.055, d) * sstep(0.03, 0.06, Math.abs(p.x)) * sstep(0.15, 0.11, Math.abs(p.x));
    if (!k) return;
    p.x = jx + (p.x - jx) * (1 - k); p.y = 1.029 + (p.y - 1.029) * (1 - k); p.z = -0.004 + (p.z + 0.004) * (1 - k);
  });
  // the sim keeps the coat off the sleeves, not just the arms in them, and always under them
  // (the arms are outside the coat: a caught point goes to the trunk's side of the arm)
  G.armPad = 0.004; G.armsOutside = true;
  return g;
}
