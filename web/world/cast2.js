// The rest of Pallet Town's people (cast.js makes them, like the girl, the fisher,
// the kid and Prof. Oak, from the player's base model): Delia Ketchum, Rose the
// florist, Bram and Ada Hollis the bakers, Granny Mae, Marina, Farmer Ben, Old Tom,
// Gus the lighthouse keeper and Gary Oak, Ash's rival (on Ash's own body).
//
// Everything they wear is a real garment over the body (garments.js), not paint on
// it: skirts hung from the waist and moving as cloth round the legs, blouses, shirts
// and jumpers hung from the shoulders, sleeves as tubes round the arms with cuffs or
// rolled bands, aprons and bibs lying over what is under them (an apron over a skirt
// is skinned to the skirt's cloth, so the two move as one and nothing pokes through),
// shawls, coats (labcoat.js cut shorter or longer), collars and roll necks; hats,
// scarves, buns, beards, glasses and a pipe as rigid parts on the head. The body under
// the cloth is painted only where it shows (skin, the trousers' legs, boots) and drawn
// in under the garments.
//
// townsfolk(K) -> { C, CAST, BUILD }: K is cast.js's kit (painting, shaping, garment
// helpers); C the colours, CAST the heights, proportions and faces, BUILD the makers,
// merged into cast.js's own tables.
import * as THREE from 'three';
import { slab, paintGrid, trisOf, nearW, mixW, cast, fixRing, hullRing, ZC, ARM_Y, ARM_Z } from './garments.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;

export function townsfolk(K) {
  const { hex, mix, mul, lum, clamp, sstep, keepShade, isArm, ax, V, sheet, mergeGeos, rowsOf, rowAt, offTop, drawIn, slimLegs, lowerCollar, looseSleeves, shirtFolds, legR, crown, labCoat } = K;
  const lerp = THREE.MathUtils.lerp;
  const dirOf = (th) => V(Math.sin(th), 0, Math.cos(th));
  const table = (rows, x) => {
    if (x <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) if (x <= rows[i][0]) { const [x0, a] = rows[i - 1], [x1, b] = rows[i]; return a + (b - a) * (x - x0) / (x1 - x0); }
    return rows[rows.length - 1][1];
  };
  const hash = (x, y) => ((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1 + 1) % 1;

  // ---------- proportions ----------
  // edits for cast.js reproportion from a few numbers: the trunk's scale [x, y, z] (the head
  // and the arms scaled back from it), the head, the arms' and legs' thickness and length,
  // the hips, the shoulders moved out (+) or in (-); and a stoop (the neck forward and down)
  function body(o) {
    const [tx, ty, tz] = o.trunk || [1, 1, 1], [hx, hy, hz] = o.hips || [1, 1, 1];
    const head = o.head ?? 1, arm = o.arm ?? 1, armL = o.armLen ?? 1, leg = o.leg ?? 1, legL = o.legLen ?? 1, sh = o.sh ?? 0;
    const e = {
      Spine1: { s: [tx, ty, tz] }, Hips: { s: [hx, hy, hz] },
      Neck: { s: [head / tx, head / ty, head / tz], t: o.stoop ? [0, -0.012 * o.stoop, 0.024 * o.stoop] : [0, 0, 0] },
      LShoulder: { s: [armL / tx, arm / ty, arm / tz], t: [sh, 0, 0] }, RShoulder: { s: [armL / tx, arm / ty, arm / tz], t: [-sh, 0, 0] },
      LThigh: { s: [leg / hx, legL / hy, leg / hz] }, RThigh: { s: [leg / hx, legL / hy, leg / hz] },
    };
    if (o.stoop) e.Spine3 = { t: [0, -0.004 * o.stoop, 0.01 * o.stoop] };
    return e;
  }

  // ---------- garments (G: cast.js dressUp's garment set) ----------
  // a skirt hung from the waist, flaring to its hem (an ellipse rx x rz there), moving as
  // cloth round the legs below the hips. o: { name, hem, top, rx: [at the waist, at the hem],
  // rz, back: the back's fullness, folds, paint, lining, ns }
  function skirt(G, o) {
    const top = o.top ?? 0.745, hem = o.hem, ys = rowsOf([], top, hem, o.step ?? 0.025), H = ys.length - 1, y0 = o.flareFrom ?? 0.7;
    const folds = o.folds ?? 12;
    const min = (y, th) => {
      const t = clamp((y0 - y) / (y0 - hem)); if (t <= 0) return 0;
      const e = t ** (o.curve ?? 0.8), rx = lerp(o.rx[0], o.rx[1], e), rz = lerp(o.rz[0], o.rz[1], e) * (Math.cos(th) < 0 ? o.back ?? 1 : 1);
      return (1 / Math.hypot(Math.sin(th) / rx, Math.cos(th) / rz)) * (1 + (o.wave ?? 0.022) * Math.cos(th * folds) * t);
    };
    const pin = rowAt(ys, o.pinY ?? 0.69);
    const segs = hem < 0.3 ? [rowAt(ys, 0.52), rowAt(ys, 0.36)] : hem < 0.45 ? [rowAt(ys, 0.55)] : [];
    const n = segs.length + 1;
    return G.hang({
      name: o.name, ys, nc: o.nc ?? 40, pin, mid: rowAt(ys, 0.6),
      off: (y) => 0.003 + 0.007 * sstep(top, top - 0.08, y), min, lining: o.lining, paint: o.paint, th: 0.004,
      sim: {
        tag: o.tag || 'S', ns: o.ns ?? 16, rows: [pin, ...segs, H], parent: 'Hips',
        prm: () => ({
          ks: [38, 28, 22].slice(0, n), drag: [0.45, 0.65, 0.85].slice(0, n), damp: 4.5, vmax: 1.6, flut: o.flut ?? 0.45,
          cone: [0.32, 0.45, 0.55].slice(0, n), quad: true,
          coll: [{ ring: 'Hips', caps: ['arms'], seg: ['arms', 'thighs'], after: ['thighs'] },
            { caps: ['arms'], seg: ['legs'], after: ['legs'] }, { seg: ['legs'], after: ['legs'] }].slice(0, n),
        }),
      },
    });
  }
  // a top hung from the shoulders (a blouse, a shirt, a jumper, a smock) down to o.hem,
  // straight down from the chest; o.gap: open in front; o.min: fuller (a belly)
  function top(G, o) {
    const ys = rowsOf([0.958, 0.945], 0.93, o.hem ?? 0.69, 0.02);
    return G.hang({
      name: o.name, ys, nc: o.nc ?? 44, pin: 2, mid: rowAt(ys, o.midY ?? 0.89), gap: o.gap, min: o.min,
      off: offTop(o.off0 ?? 0.005, o.off1 ?? 0.011, 0.82), tuck: o.tuck ?? 0.012, lining: o.lining, paint: o.paint, th: o.th ?? 0.0045,
    });
  }
  // sleeves: tubes round the arms from the shoulder seam to x = o.to (0.2 short, 0.3 to the
  // elbow, 0.435 to the wrist), loose, snug underneath at the armpit; o.cuff: a band turned
  // back at the end (o.roll: a fat rolled one), o.puff: fuller at the shoulder; o.loose: fuller
  // all along (from o.looseFrom out, if given, so the shoulder stays round)
  function sleeves(G, o) {
    const x1 = o.to, NS = 16, SX = [];
    for (let x = 0.064; x < x1 - 0.004; x += x < 0.12 ? 0.011 : 0.025) SX.push(+x.toFixed(4));
    SX.push(x1);
    const puff = o.puff || 0;
    const OFF = (x) => table([[0.064, -0.002], [0.08, 0.004], [0.1, 0.008], [0.13, 0.011], [0.25, 0.013], [0.3, 0.014], [0.38, 0.012], [0.435, 0.009]], x) * lerp(1, o.loose ?? 1, o.looseFrom ? sstep(o.looseFrom, o.looseFrom + 0.06, x) : 1)
      + puff * Math.sin(Math.PI * clamp((x - 0.075) / Math.max(0.06, x1 - 0.075))) ** 0.8;
    const MIN = (x) => table([[0.064, 0], [0.08, 0], [0.11, 0.046], [0.2, 0.048], [0.3, 0.044], [0.435, 0.036]], x);
    const SB = G.build(), CB = G.build(); let sl = null, cl = null;
    for (const s of [1, -1]) {
      const T = trisOf(G.top, (i, v) => v.every((p) => p.x * s > 0.03 && p.x * s < 0.48 && p.y > 0.93));
      const R = SX.map((x) => fixRing(Array.from({ length: NS }, (_, j) => { const a = j / NS * TAU; return cast(T, V(s * x, ARM_Y, ARM_Z), V(0, Math.cos(a), Math.sin(a)), 0.09); }), true, 2).map((r, j) => {
        const full = Math.max(r + OFF(x), MIN(x) + puff * 0.6 * Math.sin(Math.PI * clamp((x - 0.075) / Math.max(0.06, x1 - 0.075)))), u = sstep(0.3, 0.95, -Math.cos(j / NS * TAU)) * sstep(0.2, 0.1, x);
        return lerp(full, Math.min(full, r + 0.006), 0.85 * u);
      }));
      const ring = (x, rr) => Array.from({ length: NS + 1 }, (_, j) => { const a = (j % NS) / NS * TAU, r = rr[j % NS]; return V(s * x, ARM_Y + r * Math.cos(a), ARM_Z + r * Math.sin(a)); });
      const Ps = SX.map((x, i) => ring(x, R[i]));
      const aw = G.armW(s), Ws = Ps.map((row) => row.map((p) => aw(p)));
      slab(SB, Ps, Ws, 0.0035, { loop: true, out: (p) => V(0, p.y - ARM_Y, p.z - ARM_Z), rims: { bottom: true } });
      if (o.cuff) {
        const w = o.roll ? 0.03 : 0.022, Rl = R[R.length - 1], CX = [x1 - w, x1 - w * 0.66, x1 - w * 0.33, x1 + (o.roll ? 0.004 : 0.002)];
        const bulge = o.roll ? 0.0075 : 0.004;
        const Pk = CX.map((x, i) => ring(x, Rl.map((r) => r + bulge * (o.roll ? 0.55 + 0.45 * Math.sin(i / 3 * Math.PI) : 1) + 0.001 * Math.sin(i / 3 * Math.PI))));
        slab(CB, Pk, Pk.map((row) => row.map((p) => aw(p))), 0.003, { loop: true, out: (p) => V(0, p.y - ARM_Y, p.z - ARM_Z), rims: { top: true, bottom: true } });
        if (s > 0) cl = Pk;
      }
      if (s > 0) sl = Ps;
    }
    const col = o.color;
    G.add(SB, paintGrid(sl, 128, 64, o.paint || ((p, i, j) => {
      const a = (j / NS) * TAU, inner = Math.abs(Math.sin(a) - 1) < 0.6 && Math.cos(a) > -0.6;
      if (x1 > 0.28) for (const [x0, amp] of [[0.262, 0.008], [0.288, 0.006]]) if (inner && Math.abs(Math.abs(p.x) - x0 - amp * Math.sin(a * 2)) < 0.0025) return mul(col, 0.88);
      return col;
    }), o.lining || mul(col, 0.7)), o.name + '_sleeves');
    if (o.cuff) G.add(CB, paintGrid(cl, 64, 32, o.cuffPaint || ((p, i) => (o.roll && Math.abs(i - 1.5) < 0.2 ? mul(o.cuff, 0.86) : o.cuff)), mul(o.cuff, 0.75)), o.name + '_cuffs');
    // the arms a little inside their sleeves
    G.late('topsjer', (p, part) => {
      if (part !== 'upper' && part !== 'fore') return;
      const x = ax(p), k = sstep(0.09, 0.12, x) * sstep(x1, x1 - 0.02, x), dy = p.y - ARM_Y, dz = p.z - ARM_Z, r = Math.hypot(dy, dz);
      if (!k || r < 1e-4) return;
      const f = 1 - 0.004 * k / r; p.y = ARM_Y + dy * f; p.z = ARM_Z + dz * f;
    });
  }
  // a panel lying over the front (an apron, a bib): rows ys from its top down, columns across
  // u in [-1, 1] at angle u * half(y) round the trunk; above o.waist it lies on what is under
  // it, below it falls straight like a curtain. o.under: a garment grid it is skinned to (it
  // moves with that cloth), else o.sim. -> the grid
  function panel(G, o) {
    const T = [...G.torsoT, ...G.hipT, ...G.extraT], NC = o.nc ?? 20, ys = o.ys, NI = ys.length;
    const waist = o.waist ?? 0.74;
    const thAt = (i, j) => (j / NC * 2 - 1) * o.half(ys[i]);
    const RB = ys.map((y, i) => fixRing(Array.from({ length: NC + 1 }, (_, j) => cast(T, V(0, y, ZC), dirOf(thAt(i, j)), 0.45)), false, 1));
    // below the waist: each column the farthest out of everything beneath it, smoothed
    const R = RB.map((r) => r.slice());
    // (below the waist, the column's farthest out anywhere down to the hem, eased in from the waist)
    for (let j = 0; j <= NC; j++) {
      let m = 0; for (let i = 0; i < NI; i++) if (ys[i] <= waist + 0.02) m = Math.max(m, RB[i][j]);
      for (let i = 0; i < NI; i++) { const t = sstep(waist + 0.02, waist - 0.04, ys[i]); R[i][j] = Math.max(RB[i][j], lerp(RB[i][j], m, t)) + (o.flare || 0) * sstep(waist, o.ys[NI - 1], ys[i]); }
    }
    for (const r of R) fixRing(r, false, 2);
    const P = ys.map((y, i) => R[i].map((r, j) => { const th = thAt(i, j); return V(0, y, ZC).addScaledVector(dirOf(th), r + (o.off ? o.off(y, j / NC * 2 - 1) : 0.006)); }));
    let weights = o.weights;
    if (o.under) {
      // skinned like the nearest point of the cloth under it
      const U = o.under, list = [];
      U.P.forEach((row, i) => row.forEach((p, j) => list.push([p, U.W[i][j]])));
      weights = (p) => {
        if (p.y > waist - 0.01) return G.bodyW(p);
        let best = null, bd = 1e9;
        for (const [q, w] of list) { const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = w; } }
        return best;
      };
    }
    return G.hang({ name: o.name, grid: { P, closed: false }, weights, lining: o.lining, paint: o.paint, th: o.th ?? 0.004,
      rims: { top: true, bottom: true, left: true, right: true }, sim: o.sim });
  }
  // a band round the base of the neck over the shoulders (a round collar, a yoke, a shawl's
  // top): rays from above the trunk's axis outwards and down, e0..e1 radians below the level
  function band(G, o) {
    const T = G.torsoT, NC = o.nc ?? 40, c = V(0, o.cy ?? 1.12, ZC - 0.004), E = o.e, NI = E.length;
    // the distances out along each ray, smoothed round and across (the shoulders' mesh is coarse)
    const D = E.map((e) => fixRing(Array.from({ length: NC }, (_, j) => { const th = j / NC * TAU; return cast(T, c, V(Math.sin(th) * Math.cos(e), -Math.sin(e), Math.cos(th) * Math.cos(e)), 0.3); }), true, o.smooth ?? 6));
    for (let it = 0; it < 2; it++) for (let i = 1; i < NI - 1; i++) for (let j = 0; j < NC; j++) D[i][j] = D[i][j] * 0.5 + (D[i - 1][j] + D[i + 1][j]) * 0.25;
    const P = E.map((e, i) => Array.from({ length: NC + 1 }, (_, j) => { const th = (j % NC) / NC * TAU, d = V(Math.sin(th) * Math.cos(e), -Math.sin(e), Math.cos(th) * Math.cos(e)); return c.clone().addScaledVector(d, D[i][j % NC] + (o.off ? o.off(e, th) : 0.004)); }));
    const B = G.build(), W = P.map((row) => row.map((p) => G.bodyW(p)));
    slab(B, P, W, o.th ?? 0.003, { loop: true, out: (p) => p.clone().sub(c), rims: { top: true, bottom: true } });
    G.add(B, paintGrid(P, 128, 32, o.paint || (() => o.color), o.lining || mul(o.color, 0.75)), o.name);
    return P;
  }
  // buttons or other small domes on a garment grid's front at [x, y] (moving with it)
  function studs(G, g, list, color, name, r = 0.009, h = 0.004) {
    const B = G.build(), NB = 12;
    for (const [x, y, rr = r] of list) {
      const { p, th } = G.on(g, x, y), n = V(Math.sin(th), 0, Math.cos(th)), up = V(0, 1, 0), sd = V().crossVectors(up, n), w = G.bodyW(p);
      const W2 = g.W ? nearestW(g, p) : w;
      const rows = [0, 1, 2].map((k) => Array.from({ length: NB + 1 }, (_, j) => {
        const a = j / NB * TAU, e = k / 2 * Math.PI / 2, rad = rr * Math.cos(e) + 1e-4;
        return p.clone().addScaledVector(sd, Math.cos(a) * rad).addScaledVector(up, Math.sin(a) * rad).addScaledVector(n, 0.002 + h * Math.sin(e));
      }));
      slab(B, rows, rows.map((row) => row.map(() => W2)), 0.0015, { loop: true, out: () => n, rims: { top: true } });
    }
    G.add(B, paintGrid([[V(), V()], [V(), V()]], 8, 8, () => color, mul(color, 0.7)), name);
  }
  const nearestW = (g, p) => { let b = null, bd = 1e9; g.P.forEach((row, i) => row.forEach((q, j) => { const d = q.distanceToSquared(p); if (d < bd) { bd = d; b = g.W[i][j]; } })); return b; };
  // a roll neck: a soft tube round the neck, folded over at the top
  function rollNeck(v, col, o = {}) {
    const r0 = o.r ?? 0.041, y0 = o.y0 ?? 1.035, y1 = o.y1 ?? 1.085;
    const g = sheet(6, 24, (t, u) => { const a = u * TAU, f = Math.sin(t * Math.PI) * 0.006, r = r0 + f + (t > 0.7 ? 0.003 : 0); return [Math.sin(a) * r, y0 + (y1 - y0) * t, -0.01 + Math.cos(a) * r * 0.95]; });
    v.flat(g, col, (p) => [['Neck', 0.7 * sstep(1.04, 1.09, p.y)], ['Spine3', 1 - 0.7 * sstep(1.04, 1.09, p.y)]]);
  }

  // ---------- on the head (rigid on it) ----------
  const head1 = () => [['Head', 1]];
  // a hat from a profile turned round [[r, y], ...] (bottom to top), centred at (0, zc), tipped
  // back by tilt; o.sx / o.sz squash it round
  function lathe(v, pts, col, o = {}) {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), o.seg ?? 32);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) * (o.sx ?? 1), P.getY(i), P.getZ(i) * (o.sz ?? 1));
    g.translate(0, -1.2, (o.zc ?? -0.01)).rotateX(-(o.tilt ?? 0.1)).translate(0, 1.2 + (o.dy ?? 0), 0);
    g.computeVertexNormals();
    v.flat(g, col, head1);
    return g;
  }
  // a bun of hair at the back of the head, with a band round its root
  function bun(v, col, o = {}) {
    const c = o.at || [0, 1.27, -0.095], r = o.r ?? 0.052;
    const s = new THREE.SphereGeometry(r, 16, 12); s.scale(1, 0.85, 0.9); s.translate(...c); v.flat(s, col, head1);
    const t = new THREE.TorusGeometry(r * 0.72, r * 0.16, 6, 20); t.rotateX(Math.PI / 2 + 0.9); t.translate(c[0], c[1] - r * 0.25, c[2] + r * 0.35); v.flat(t, o.band || mul3(col, 0.85), head1);
  }
  const mul3 = (c, k) => '#' + hex(c).map((x) => Math.round(clamp(x * k, 0, 255)).toString(16).padStart(2, '0')).join('');
  // a tapered lock of hair (or anything long and soft) along a curve pts, radius r0 at the root
  // and flattened by flat; [[x, y, z], ...]
  function lock(pts, r0, flat = 0.5, r1 = 0, n = 10, cols = 10, about = null) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)));
    const g = sheet(n, cols, (t, u) => {
      const q = curve.getPoint(t), d = curve.getTangent(t).normalize();
      // thin across `about` (a point inside the head: the lock lies flat on it), else across the up
      const thin = about ? q.clone().sub(about) : new V3(0, 1, 0).cross(d);
      thin.addScaledVector(d, -thin.dot(d)); if (thin.lengthSq() < 1e-8) thin.set(1, 0, 0); thin.normalize();
      const wide = new V3().crossVectors(d, thin).normalize(), a = u * TAU, r = lerp(r0, r1, t ** 0.9) * (1 - 0.15 * t);
      return q.addScaledVector(wide, Math.cos(a) * r).addScaledVector(thin, Math.sin(a) * r * flat).toArray();
    });
    return g;
  }
  // a beard (and o.mous: a moustache) on the lower face: the face mesh's surface pushed out by
  // the beard's fullness, from the sideburns round the jaw and under the chin, the mouth left open;
  // skinned like the face under it (so it goes with the jaw)
  function beard(v, col, o = {}) {
    const face = v.meshes.get('face_on_1'), T = trisOf(face), fw = nearW([{ mesh: face }]);
    const NC = 26, PH = 1.75, rows = 9;
    const topY = (ph) => lerp(o.lip ?? 1.106, o.side ?? 1.16, sstep(0.35, 0.95, Math.abs(ph)));
    const full = o.full ?? 0.012, low = o.low ?? 0.075;   // low: how far below the chin it reaches
    const P = [], W = [];
    for (let i = 0; i <= rows; i++) {
      const row = [], wr = [];
      for (let j = 0; j <= NC; j++) {
        const ph = (j / NC * 2 - 1) * PH, t = i / rows, y = lerp(topY(ph), 1.086, t);
        const d = V(Math.sin(ph), 0, Math.cos(ph)), c = V(0, y, -0.012);
        let r = cast(T, c, d, 0.2); if (r == null) r = 0.06 + 0.02 * Math.cos(ph);
        const f = full * (0.35 + 0.65 * sstep(0, 0.6, t)) * (0.55 + 0.45 * Math.cos(ph * 0.8)) * (1 - 0.6 * sstep(0.15, 0, t) * sstep(0.6, 0.2, Math.abs(ph)));
        const p = c.clone().addScaledVector(d, r + 0.002 + f);
        // the chin's beard hangs below it, more at the front
        if (t > 0.6) { const k = (t - 0.6) / 0.4; p.y -= low * k * k * (0.25 + 0.75 * Math.cos(ph * 0.9) ** 2); p.z -= 0.012 * k * (1 - Math.cos(ph) ** 2); }
        row.push(p); wr.push(fw(V(p.x * 0.8, Math.max(p.y, 1.092), Math.min(p.z, 0.07))));
      }
      P.push(row); W.push(wr);
    }
    // closed underneath: a last row in under the jaw, to the neck
    const last = P[rows].map((p) => V(p.x * 0.55, p.y + 0.01, lerp(p.z, -0.02, 0.6)));
    P.push(last); W.push(W[rows]);
    const geo = new THREE.BufferGeometry(), pos = [], idx = [], nj = NC + 1;
    P.forEach((row) => row.forEach((p) => pos.push(p.x, p.y, p.z)));
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < NC; j++) { const a = i * nj + j, b = a + nj; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const flat = P.flat(), wl = W.flat();
    v.flat(geo, col, (p) => { let b = 0, bd = 1e9; for (let k = 0; k < flat.length; k++) { const d = flat[k].distanceToSquared(p); if (d < bd) { bd = d; b = k; } } return Object.entries(wl[b]); });
    if (o.mous !== false) {
      // a moustache: two soft lobes from under the nose out over the corners of the mouth
      const g = [];
      for (const s of [1, -1]) g.push(o.mousFlat
        ? lock([[s * 0.002, 1.1255, 0.093], [s * 0.016, 1.1245, 0.09], [s * 0.028, 1.121, 0.083], [s * 0.034, 1.117, 0.076]], o.mousR ?? 0.0085, 0.55, 0.002, 8, 8)   // a trim one, curled up a touch
        : lock([[s * 0.002, 1.126, 0.093], [s * 0.018, 1.123, 0.089], [s * 0.032, 1.114, 0.079], [s * (0.036 + (o.mousLong || 0)), 1.104 - (o.mousLong || 0), 0.07]], o.mousR ?? 0.0085, 0.55, 0.002, 8, 8));
      v.flat(mergeGeos(g), o.mousCol || col, (p) => Object.entries(fw(V(p.x * 0.9, 1.124, 0.08))));
    }
  }
  // round glasses: rims, a bridge and the arms back to the ears
  function glasses(v, col, o = {}) {
    const y = o.y ?? 1.163, z = o.z ?? 0.098, x = o.x ?? 0.036, r = o.r ?? 0.021, g = [];
    for (const s of [1, -1]) {
      const t = new THREE.TorusGeometry(r, 0.0022, 5, 22); t.translate(s * x, y, z + 0.004 - Math.abs(s * x) * 0.18); g.push(t);
      g.push(lock([[s * (x + r), y + 0.003, z - 0.012], [s * 0.078, y + 0.006, 0.03], [s * 0.084, y - 0.004, -0.02]], 0.0022, 1, 0.0018, 6, 5));
    }
    g.push(lock([[-x + r * 0.9, y + 0.004, z + 0.006], [0, y + 0.008, z + 0.012], [x - r * 0.9, y + 0.004, z + 0.006]], 0.002, 1, 0.002, 6, 5));
    v.flat(mergeGeos(g), col, head1);
  }
  // a headscarf: a dome over the crown and the hair, tied in a knot at the nape with two tails
  function headscarf(v, col, o = {}) {
    const g = crown(v.hairM, { top: o.top ?? 1.33, back: 0.02, bulge: 1.06, rimY: o.rimY ?? 1.2, front: o.front ?? 0.045, inset: o.inset ?? 1.13 });
    const c = col;
    v.add(g, K.canvasMat(64, 64, (x, w, h) => {
      x.fillStyle = c; x.fillRect(0, 0, w, h);
      if (o.dots) { x.fillStyle = o.dots; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { x.beginPath(); x.arc((i + (j % 2) * 0.5) / 9 * w, (j + 0.5) / 9 * h, 1.3, 0, TAU); x.fill(); } }
      if (o.hemCol) { x.fillStyle = o.hemCol; x.fillRect(0, 0, w, h * 0.12); }
    }, v.CLOTH, { name: 'cast_scarf' }), head1, 'scarf');
    const kz = o.knotZ ?? -0.118, ky = o.knotY ?? 1.165;
    const k = new THREE.SphereGeometry(0.022, 10, 8); k.scale(1.2, 0.9, 0.8); k.translate(0, ky, kz); const parts = [k];
    for (const s of [1, -1]) parts.push(lock([[s * 0.008, ky, kz - 0.006], [s * 0.03, ky - 0.04, kz - 0.022], [s * 0.04, ky - 0.085, kz - 0.022]], 0.017, 0.35, 0.006, 8, 8));
    v.flat(mergeGeos(parts), o.knot || col, head1);
  }
  // a low ponytail at the nape (the mesh is named 'ponytail', so the native bake hangs it on a
  // bone chain) tied with a scrunchie
  function lowTail(v, col, tie, o = {}) {
    const P0 = new V3(0, o.y ?? 1.17, o.z ?? -0.098), L = o.len ?? 0.17, sw = o.sway ?? 0.03;
    const c = (t) => new V3(sw * Math.sin(t * 2.2) * t, P0.y - L * t, P0.z - 0.03 * Math.sin(t * 1.8) - 0.012 * t);
    const rad = (t) => (o.r ?? 0.026) * (1 + 0.5 * Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.8) * (1 - t)) * (1 - 0.85 * t ** 1.8);
    const g = sheet(12, 14, (t, u) => {
      const a = u * TAU, q = c(t), dq = c(Math.min(1, t + 0.01)).sub(c(Math.max(0, t - 0.01))).normalize();
      const s1 = new V3(1, 0, 0), s2 = new V3().crossVectors(dq, s1).normalize(), r = Math.max(0.002, rad(t)) * (1 + 0.1 * Math.cos(a * 4) * t);
      return q.addScaledVector(s1, -Math.sin(a) * r * (o.wide ?? 1.15)).addScaledVector(s2, Math.cos(a) * r * 0.85).toArray();
    });
    v.add(g, K.canvasMat(32, 64, (x, w, h) => {
      x.fillStyle = col; x.fillRect(0, 0, w, h); x.strokeStyle = K.shade(col, 0.8); x.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo((i + 0.3) / 6 * w, 0); x.lineTo((i + 0.5) / 6 * w, h); x.stroke(); }
    }, v.CLOTH, { name: 'cast_tail' }), (p) => [['Head', 1]], 'ponytail');
    if (tie) {
      const t = new THREE.TorusGeometry(0.022, 0.011, 8, 16); t.scale(1.15, 1, 0.9); t.rotateX(Math.PI / 2 + 0.25); t.translate(0, P0.y - 0.018, P0.z - 0.004);
      // a scrunchie's gathers: the tube's radius rippled
      const Pt = t.attributes.position;
      for (let i = 0; i < Pt.count; i++) { const x = Pt.getX(i), z = Pt.getZ(i) - (P0.z - 0.004), a = Math.atan2(x, z), k = 1 + 0.12 * Math.cos(a * 9); Pt.setX(i, x * k); Pt.setZ(i, (P0.z - 0.004) + z * k); }
      t.computeVertexNormals();
      v.flat(t, tie, head1);
    }
  }

  // a strap lying on the body (and what is on it): a path of [angle round the trunk, height]
  // points, w wide, o.off off the surface; skinned like the body under it
  function strap(G, path, w, col, name, o = {}) {
    const T = [...G.torsoT, ...G.hipT, ...G.extraT], N = o.n ?? 24, pts = [];
    const at = (u) => { const f = u * (path.length - 1), k = Math.min(path.length - 2, Math.floor(f)), t = f - k; return [lerp(path[k][0], path[k + 1][0], t), lerp(path[k][1], path[k + 1][1], t)]; };
    for (let i = 0; i <= N; i++) { const [th, y] = at(i / N), r = cast(T, V(0, y, ZC), dirOf(th), 0.4) ?? 0.08; pts.push(V(0, y, ZC).addScaledVector(dirOf(th), r + (o.off ?? 0.005))); }
    // smooth the path a little
    for (let it = 0; it < 2; it++) for (let i = 1; i < N; i++) pts[i] = pts[i].clone().multiplyScalar(0.5).addScaledVector(pts[i - 1], 0.25).addScaledVector(pts[i + 1], 0.25);
    const rows = pts.map((p, i) => {
      const tg = pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(), out = V(p.x, 0, p.z - ZC).normalize(), side = V().crossVectors(tg, out).normalize();
      return [p.clone().addScaledVector(side, -w / 2), p.clone().addScaledVector(side, w / 2)];
    });
    const B = G.build();
    slab(B, rows, rows.map((r) => r.map((p) => G.bodyW(p))), o.th ?? 0.0025, { out: (p) => V(p.x, 0, p.z - ZC), rims: { top: true, bottom: true, left: true, right: true } });
    G.add(B, paintGrid(rows, 16, 64, o.paint || (() => col), mul(col, 0.75)), name);
    return rows;
  }
  // a band round the trunk from y0 down to y1 (a waistband, a sash, an apron's ties), over
  // everything under it
  function belt(G, y0, y1, col, name, o = {}) {
    const T = [...G.torsoT, ...G.hipT, ...G.extraT], NC = 40, ys = [y0, (y0 + y1) / 2, y1];
    const H = ys.map((y) => hullRing(T, y, 0.3));
    const P = ys.map((y, i) => Array.from({ length: NC + 1 }, (_, j) => { const th = (j % NC) / NC * TAU; return V(0, y, ZC).addScaledVector(dirOf(th), Math.max(...H.map((h) => h(th))) + (o.off ?? 0.006) + (i === 1 ? 0.001 : 0)); }));
    const B = G.build();
    slab(B, P, P.map((r) => r.map((p) => G.bodyW(p))), 0.003, { loop: true, out: (p) => V(p.x, 0, p.z - ZC), rims: { top: true, bottom: true } });
    G.add(B, paintGrid(P, 128, 16, o.paint || (() => col), mul(col, 0.75)), name);
    return P;
  }
  // a knot with two hanging ends (an apron's ties at the back, a kerchief's at the front)
  function tie(v, at, col, o = {}) {
    const [x, y, z] = at, dz = Math.sign(z) || 1, L = o.len ?? 0.09, parts = [];
    const k = new THREE.SphereGeometry(o.r ?? 0.014, 10, 8); k.scale(1.3, 0.9, 0.8); k.translate(x, y, z); parts.push(k);
    for (const s of [1, -1]) {
      parts.push(lock([[x + s * 0.004, y, z + dz * 0.004], [x + s * 0.02, y + 0.012, z + dz * 0.01], [x + s * 0.034, y + 0.004, z + dz * 0.008]], 0.011, 0.35, 0.006, 6, 8));   // a loop
      parts.push(lock([[x + s * 0.004, y - 0.004, z + dz * 0.006], [x + s * 0.012, y - L * 0.5, z + dz * 0.012], [x + s * 0.016, y - L, z + dz * 0.012]], 0.009, 0.3, 0.007, 6, 8));   // an end
    }
    v.flat(mergeGeos(parts), col, o.w || ((p) => [['Spine1', 0.5], ['Hips', 0.5]]));
  }
  // a cap's peak: a curved half disc in front of the band
  function peak(v, col, o = {}) {
    const zc = o.zc ?? -0.012, r0 = o.r0 ?? 0.118, r1 = o.r1 ?? 0.175, y0 = o.y ?? 1.205, A = o.half ?? 1.15;
    const g = sheet(3, 20, (t, u) => { const a = (u * 2 - 1) * A, rr = lerp(r0, r1 - 0.03 * Math.abs(Math.sin(a)) ** 2 * 0, t) * (1 - t * 0.25 * (Math.abs(a) / A) ** 2); return [Math.sin(a) * rr, y0 - 0.016 * t * t - 0.004 * t, zc + Math.cos(a) * rr]; }, false);
    g.translate(0, -1.2, 0).rotateX(-(o.tilt ?? 0.06)).translate(0, 1.2, 0); g.computeVertexNormals();
    v.flat(g, col, head1);
  }
  // per-vertex colours on a flat part just made (v.flat recoloured): fn(p) -> '#rrggbb' or [r, g, b]
  const recolor = (geo, fn) => { const P = geo.attributes.position, Cc = geo.attributes.color, p = V(); for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); const c = fn(p); if (!c) continue; const cc = typeof c === 'string' ? new THREE.Color(c) : new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace); Cc.setXYZ(i, cc.r, cc.g, cc.b); } };
  // gloves: the hands and a cuff round the wrist
  function gloves(v, G, col) {
    const B = G.build(), NS = 14;
    for (const s of [1, -1]) {
      const T = trisOf(G.top, (i, vv) => vv.every((p) => p.x * s > 0.38 && p.x * s < 0.5));
      const R = [0.432, 0.445, 0.458].map((x) => fixRing(Array.from({ length: NS }, (_, j) => { const a = j / NS * TAU; return cast(T, V(s * x, 1.028, -0.004), V(0, Math.cos(a), Math.sin(a)), 0.06); }), true, 2));
      const P = [0.432, 0.445, 0.458].map((x, i) => Array.from({ length: NS + 1 }, (_, j) => { const a = (j % NS) / NS * TAU, r = R[i][j % NS] + 0.004 + (2 - i) * 0.002; return V(s * x, 1.028 + r * Math.cos(a), -0.004 + r * Math.sin(a)); }));
      const aw = G.armW(s);
      slab(B, P, P.map((row) => row.map((p) => aw(p))), 0.002, { loop: true, out: (p) => V(0, p.y - 1.028, p.z + 0.004), rims: { top: true, bottom: true } });
    }
    G.add(B, paintGrid([[V(), V()], [V(), V()]], 8, 8, () => col, mul(col, 0.7)), v.name + '_gloves');
  }

  // ---------- painting helpers ----------
  const stripes = (y, period, frac) => ((y / period) % 1 + 1) % 1 < frac;
  // a check (a plaid): lines across and down; u, w the two directions
  const plaid = (base, line, line2, u, w, p = 0.024) => {
    const a = ((u / p) % 1 + 1) % 1 < 0.28, b = ((w / p) % 1 + 1) % 1 < 0.28;
    if (a && b) return line;
    if (a || b) return mix(base, line, 0.55);
    if (((u / p + 0.5) % 1 + 1) % 1 < 0.06 || ((w / p + 0.5) % 1 + 1) % 1 < 0.06) return mix(base, line2, 0.5);
    return base;
  };
  // a knit: little vertical V ribs
  const knit = (col, p, k = 0.92) => { const th = Math.atan2(p.x, p.z), u = (th / TAU) * 120, f = ((u % 1) + 1) % 1, g = ((p.y * 260 + Math.abs(f - 0.5) * 2) % 1 + 1) % 1; return g < 0.22 ? mul(col, k) : col; };
  // the trousers' legs painted on the jeans mesh, a belt; o.cuff: rolled up above y
  function trousers(c, o = {}) {
    return (p, n, o2) => {
      if (p.y > 0.69) return hex(o.belt || mul3(c, 0.7));
      if (o.cuff && p.y < o.cuff) return p.y > o.cuff - 0.018 ? mul(hex(c), 0.86) : hex(o.below || c);
      return keepShade(hex(c), o2, 0.55, 0.6);
    };
  }

  // ---------- the people ----------
  const C = {
    // Delia Ketchum: auburn hair in a low ponytail with a green scrunchie, a pink short-sleeved
    // blouse with a round yellow collar and a big pink button, a long light-blue A-line skirt
    delia: { skin: '#f6c9a8', hair: '#8e4422', hair2: '#8a3c1a', tie: '#4cb86a', blouse: '#f4a2b8', blouse2: '#e08aa2', collar: '#f6d65a', button: '#e2507a', skirt: '#9cc4ee', skirt2: '#86aedc', shoes: '#f6f2ea', sole: '#d8d2c4' },
    rose: { skin: '#f6d2b2', hair: '#6e3424', hat: '#ecd59a', hat2: '#d8bc78', band: '#e0566e', flower: '#ffd0e0', blouse: '#fbf4e2', skirt: '#86b88a', skirt2: '#70a274', apron: '#f2b8c0', apron2: '#e09aa6', gloves: '#78b04a', shoes: '#8a5a3a', sole: '#5a3a26' },
    bram: { skin: '#f3c6a0', hair: '#8a4a28', jacket: '#f8f6f0', jacket2: '#e4e0d6', kerchief: '#d0503c', apron: '#e9d3a6', apron2: '#c8ac7a', pants: '#5c5448', cap: '#fbfaf6', shoes: '#5a3a28', sole: '#3a2418', button: '#d0c8b4' },
    ada: { skin: '#f4cfae', hair: '#4a2c22', scarf: '#e8b448', dots: '#fff4d8', blouse: '#a990cc', blouse2: '#9078b8', skirt: '#3f7c78', skirt2: '#336a66', apron: '#fbf8f2', check: '#d9544f', shoes: '#6a3e2c', sole: '#40261a' },
    mae: { skin: '#f4d2b8', hair: '#eeeef2', blouse: '#f2ead6', shawl: '#c4788e', shawl2: '#a8607a', skirt: '#4e5a7a', skirt2: '#424c68', glasses: '#9a6a3a', shoes: '#3a3034', sole: '#241e22', tights: '#6a6470' },
    marina: { skin: '#e8b48c', hair: '#2c2836', scarf: '#36b0a8', top: '#f6f4ee', stripe: '#2c4a86', pants: '#c0583e', boots: '#3f6e4a', sole: '#2a4a32' },
    ben: { skin: '#dca27a', hair: '#6a5240', hat: '#e4c674', hat2: '#c8a656', band: '#b8402e', shirt: '#cc4a3e', check: '#f2e6d0', check2: '#7a2a22', overalls: '#4a70a8', overalls2: '#3d5e90', brass: '#e0b84a', boots: '#5a4030', sole: '#3a2a20' },
    tom: { skin: '#eebf9c', hair: '#f2f2f0', beard: '#f6f6f4', coat: '#2a3552', coat2: '#222b44', sweater: '#efe6cf', pants: '#55595f', cap: '#fbfbf8', capBand: '#1e2436', peak: '#151821', badge: '#e8c050', brass: '#e2b850', boots: '#2a2626', sole: '#1a1616', pipe: '#6a3e26' },
    // Officer Jenny (Viridian City): teal hair flaring out at the sides under a navy police cap
    // (a red band, a gold winged badge, a black peak), a blue short-sleeved uniform jacket with a
    // light-blue front panel, a red collar and red cuffs, a black belt with a gold buckle, a black
    // strap across to a pouch on her left hip, a navy pencil skirt, white gloves, black low heels
    jenny: { skin: '#f6d0b0', hair: '#2fa58c', hair2: '#24876f', cap: '#474cb6', cap2: '#3a3e9c', band: '#d8343a', peak: '#23264a', gold: '#e8b830',
      jacket: '#5157c6', jacket2: '#4247a8', panel: '#a8d6ee', panel2: '#86bcda', red: '#d8343a', red2: '#b02630', navy: '#2c2f70',
      skirt: '#4446ac', skirt2: '#2f3180', belt: '#1c1c24', strap: '#1c1c24', glove: '#f8f8f4', shoes: '#1e1e28', sole: '#121218' },
    // Gary Oak: auburn hair in big spikes swept up and back, a baggy purple sweatshirt (an orange
    // undershirt's hem below it) with a black cord and a yellow and green yin-yang pendant, straight
    // blue jeans bunched over mustard-yellow boots banded in black
    gary: { skin: '#f6d4b6', hair: '#7c4024', hair2: '#62301a', sweat: '#5e3a8c', sweat2: '#4c2e74', under: '#d0682a',
      jeans: '#36528a', jeans2: '#2a4070', stitch: '#4a6498', boots: '#c08a24', black: '#1c1a1e', cord: '#18161a', yin: '#f4d43c', yang: '#3d9e4a' },
    gus: { skin: '#e9b896', hair: '#5e4a3e', beard: '#5a4a40', cap: '#cc4b2e', cap2: '#a83a22', coat: '#f2c22e', coat2: '#d9a41e', jumper: '#3e5a4e', pants: '#3e4452', boots: '#2a2a2e', sole: '#1a1a1e', brass: '#3a3a3a' },
  };
  // adult women: a smaller head, longer legs, narrower shoulders, a slimmer waist
  const WOMAN = { trunk: [0.94, 1.03, 0.96], hips: [1.02, 1, 1.02], head: 0.93, arm: 0.92, armLen: 1.02, leg: 0.95, legLen: 1.06, sh: -0.004 };
  const CAST = {
    delia: { height: 1.8, edits: body(WOMAN), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#9a5a1e', brow: '#7a3418', lashes: '#2a1810', mouth: 'smile', blush: '#f29a9a', forehead: 'smooth', lips: '#d86a6e' } },
    rose: { height: 1.78, edits: body({ ...WOMAN, trunk: [0.96, 1.02, 0.98] }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#4a7a3a', brow: '#5a2a1c', lashes: '#2a1610', blush: '#f0a0a0', mature: true, lips: '#d4686a', freckles: '#c88a6a' } },
    bram: { height: 1.92, edits: body({ trunk: [1.24, 1.04, 1.3], hips: [1.14, 1, 1.12], head: 0.94, arm: 1.2, armLen: 1, leg: 1.14, legLen: 0.98, sh: 0.012 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#4a3020', brow: '#7a4024', browThick: 2, mature: true, blush: '#f08a7a', old: true } },
    ada: { height: 1.76, edits: body({ ...WOMAN, trunk: [1.0, 1.02, 1.04], hips: [1.08, 1, 1.06], arm: 0.98 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#3a2a20', brow: '#3a2218', lashes: '#20140e', mature: true, blush: '#f0907e', lips: '#c85a5a' } },
    mae: { height: 1.5, edits: body({ trunk: [0.98, 0.96, 1.02], hips: [1.04, 1, 1.04], head: 0.98, arm: 0.92, leg: 0.95, legLen: 0.92, sh: -0.004, stoop: 1 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#5a6a7a', brow: '#c8c6c2', mature: true, old: true, blush: '#f09a9a', wrinkles: true } },
    marina: { height: 1.77, edits: body({ ...WOMAN, trunk: [0.97, 1.03, 0.98], arm: 0.96 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#2a4a5a', brow: '#24202c', lashes: '#141018', mature: true, freckles: '#b8805a', mouth: 'smile' } },
    ben: { height: 1.86, edits: body({ trunk: [1.12, 1.04, 1.1], hips: [1.06, 1, 1.04], head: 0.94, arm: 1.12, leg: 1.06, legLen: 1.01, sh: 0.008 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#3a3020', brow: '#5a4434', browThick: 1, mature: true, stubble: '#7a6250', old: true } },
    tom: { height: 1.8, edits: body({ trunk: [1.14, 1.0, 1.16], hips: [1.08, 1, 1.06], head: 0.96, arm: 1.12, leg: 1.06, legLen: 0.97, sh: 0.006, stoop: 0.4 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#3a4a5a', brow: '#e4e2de', browThick: 2, mature: true, old: true, wrinkles: true, blush: '#e88a7a' } },
    gus: { height: 1.86, edits: body({ trunk: [1.12, 1.04, 1.12], hips: [1.06, 1, 1.04], head: 0.94, arm: 1.12, leg: 1.06, legLen: 1.02, sh: 0.008 }), drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
      face: { iris: '#2a3a3a', brow: '#4a3a30', browThick: 2, mature: true, old: true } },
  };
  // an adult woman, tall (the cap included), long-legged and trim
  CAST.jenny = { height: 1.86, edits: body({ ...WOMAN, trunk: [0.94, 1.03, 0.95], hips: [1.0, 1, 1.0], arm: 0.9, leg: 0.92, legLen: 1.08 }),
    face: { iris: '#8a4a26', brow: '#1f6a5c', lashes: '#141418', mouth: 'smile', blush: '#f2a0a0', forehead: 'smooth', lips: '#d46a6c', mature: true } };
  for (const k in CAST) CAST[k].drop = ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'];
  // a boy of Ash's age: Ash's body at Ash's scale, the head set lower on a shorter neck (Ash's
  // tall collar hides his; Gary's neckline is low)
  CAST.gary = { height: 0, edits: { Head: { t: [0, -0.024, 0] } }, drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
    face: { iris: '#3a2a22', brow: '#6a3016', browThick: 1, mature: true, forehead: 'smooth' } };   // (mature: the atlas's narrower, cooler eyes)

  // bare forearms and hands, the rest of the arm as the sleeve's colour (it shows only in gaps)
  const armsUnder = (skin, col, x) => (p, part) => (part === 'hand' || (isArm(part) && ax(p) > x) ? skin : col);
  // the body's trunk drawn in under a top and a skirt
  const underTop = (G, d = 0.01) => G.late('topsjer', drawIn((p) => d * sstep(0.95, 0.92, p.y)));
  const underSkirt = (G, d = 0.008) => {
    G.late('btmsskin', (p, part) => {
      const t = sstep(0.6, 0.66, p.y) * sstep(0.76, 0.72, p.y); if (!t) return;
      const r = Math.hypot(p.x, p.z - ZC); if (r < 1e-4) return;
      const f = Math.max(0.85, 1 - d * t / r); p.x *= f; p.z = ZC + (p.z - ZC) * f;
    });
  };
  // bare or stockinged legs under a long skirt: Ash's jeans taken in to legs
  const skirtLegs = (v, skin, from = 0.66) => { v.shape('btmsskin', slimLegs(from, 0.66)); };
  // looser trouser legs: the jeans let out round each leg from the knee up to the seat
  const looseLegs = (k, y0 = 0.3, y1 = 0.62) => (p) => {
    const t = sstep(y0 - 0.06, y0 + 0.04, p.y) * sstep(y1 + 0.06, y1 - 0.04, p.y); if (!t) return;
    const cx = Math.sign(p.x) * 0.056, cz = 0.002, f = 1 + (k - 1) * t;
    p.x = cx + (p.x - cx) * f; p.z = cz + (p.z - cz) * f;
  };

  const BUILD = {
    delia(v) {
      const c = C.delia, skin = hex(c.skin), blouse = hex(c.blouse), b2 = hex(c.blouse2), collar = hex(c.collar), sk = hex(c.skirt), sk2 = hex(c.skirt2);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand' || (isArm(part) && ax(p) > 0.19)) return skin;
        if (isArm(part)) return blouse;
        if (p.y > 1.035) return collar;                      // (under the collar band)
        return keepShade(blouse, o, 0.5, 0.15);
      });
      v.paint('btmsskin', 0.5, (p) => (p.y > 0.6 ? sk2 : skin));
      skirtLegs(v, skin, 0.62);
      v.shape('topsjer', lowerCollar(1.045, 0.2));
      v.shoes({ up: c.shoes, sole: c.sole, sock: c.skin, sockY: 0.075, rimY: 0.07, rim: c.shoes });
      v.hair(c.hair);
      v.shape('hair01_on', K.foldFringe);   // (the forehead shows between the bangs)
      v.crown({ top: 1.315, back: 0.012, front: 0.02 });
      v.neck();
      deliaHair(v, c);
      lowTail(v, c.hair, c.tie, { y: 1.172, z: -0.1, len: 0.21, r: 0.036, wide: 1.45 });
      v.garment((G) => {
        // the skirt: from the waist, A-line to mid-calf, a seam round it above the hem
        const sg = skirt(G, {
          name: 'delia_skirt', hem: 0.2, rx: [0.118, 0.215], rz: [0.094, 0.2], back: 1.04, folds: 10, lining: mul(sk2, 0.85),
          paint: (p) => {
            if (p.y < 0.212) return mul(sk2, 0.95);
            if (Math.abs(p.y - 0.262) < 0.0028) return mul(sk2, 0.86);    // the band above the hem (ref: a line round it)
            const th = Math.atan2(p.x, p.z - ZC), f = ((th / TAU * 10) % 1 + 1) % 1;
            if (p.y < 0.6 && Math.abs(f - 0.5) < 0.018 * sstep(0.6, 0.3, p.y)) return sk2;   // soft folds
            return sk;
          },
        });
        // the blouse: short, boxy, to the hip over the skirt's waist, a button at the left
        const bg = top(G, {
          name: 'delia_blouse', hem: 0.69, lining: mul(b2, 0.85), off1: 0.013,
          paint: (p) => {
            if (p.y < 0.703) return b2;                                      // the hem
            const x = p.x;
            if (p.z > 0 && Math.abs(x - 0.03 + (0.96 - p.y) * 0.05) < 0.0018 && p.y < 0.96) return b2;   // the front edge, wrapping over to the left
            if (Math.abs(Math.abs(x) - 0.1) < 0.0016 && p.y > 0.93) return b2;
            return blouse;
          },
        });
        studs(G, bg, [[0.046, 0.8, 0.014]], hex(c.button), 'delia_button', 0.014, 0.005);
        sleeves(G, { name: 'delia', to: 0.205, color: blouse, cuff: b2, puff: 0.006 });
        // the round yellow collar, lying on the shoulders round the neck
        band(G, { name: 'delia_collar', e: [0.72, 0.8, 0.88, 0.96], color: collar, off: () => 0.003, nc: 40 });
        underTop(G); underSkirt(G);
      });
    },
    rose(v) {
      const c = C.rose, skin = hex(c.skin), bl = hex(c.blouse), sk = hex(c.skirt), sk2 = hex(c.skirt2), ap = hex(c.apron), ap2 = hex(c.apron2), gl = hex(c.gloves);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand') return gl;
        if (isArm(part)) return ax(p) > 0.19 ? skin : bl;
        return keepShade(bl, o, 0.5, 0.15);
      });
      v.paint('btmsskin', 0.5, (p) => (p.y > 0.6 ? sk2 : skin));
      skirtLegs(v, skin, 0.62);
      v.shape('topsjer', lowerCollar(1.045, 0.25));
      v.shoes({ up: c.shoes, sole: c.sole, sock: c.skin, sockY: 0.085, rimY: 0.08, rim: c.shoes, toe: c.shoes });
      v.hair(c.hair);
      v.neck();
      bun(v, c.hair, { at: [0, 1.15, -0.1], r: 0.045 });
      // the sunhat: a wide soft brim, a ribbon round it and flowers on the side
      lathe(v, [[0.24, 1.182], [0.228, 1.196], [0.19, 1.212], [0.15, 1.222], [0.124, 1.226], [0.12, 1.25], [0.116, 1.298], [0.094, 1.326], [0, 1.332]], c.hat, { tilt: 0.16, zc: -0.012 });
      lathe(v, [[0.1245, 1.226], [0.1225, 1.252]], c.band, { tilt: 0.16, zc: -0.012 });
      const fl = [];
      for (const [a, y, r] of [[1.25, 1.24, 0.017], [1.55, 1.236, 0.014], [1.05, 1.236, 0.012]]) { const g = new THREE.SphereGeometry(r, 10, 8); g.scale(1, 1, 0.6); g.rotateY(a); g.translate(Math.sin(a) * 0.128, y, -0.012 + Math.cos(a) * 0.128); g.translate(0, -1.2, 0).rotateX(-0.16).translate(0, 1.2, 0); fl.push(g); }
      v.flat(mergeGeos(fl), c.flower, head1);
      const cg = []; for (const [a, y] of [[1.25, 1.24], [1.55, 1.236], [1.05, 1.236]]) { const g = new THREE.SphereGeometry(0.005, 6, 5); g.translate(Math.sin(a) * 0.137, y, -0.012 + Math.cos(a) * 0.137); g.translate(0, -1.2, 0).rotateX(-0.16).translate(0, 1.2, 0); cg.push(g); }
      v.flat(mergeGeos(cg), '#f6c23a', head1);
      v.garment((G) => {
        const sg = skirt(G, { name: 'rose_skirt', hem: 0.25, rx: [0.118, 0.2], rz: [0.094, 0.185], folds: 12, lining: mul(sk2, 0.85),
          paint: (p) => (p.y < 0.262 ? sk2 : sk) });
        top(G, { name: 'rose_blouse', hem: 0.7, lining: mul(bl, 0.8), off1: 0.01,
          paint: (p) => (p.y < 0.712 ? mul(bl, 0.92) : p.z > 0 && Math.abs(p.x) < 0.0016 && p.y < 0.95 ? mul(bl, 0.86) : bl) });
        sleeves(G, { name: 'rose', to: 0.19, color: bl, cuff: mul(bl, 0.94), puff: 0.009 });
        band(G, { name: 'rose_collar', e: [0.72, 0.8, 0.88, 0.96], color: hex('#ffffff'), off: () => 0.003 });
        // the pinafore apron: a bib on the chest and the skirt of it over hers to below the knee,
        // a pocket, a frill along the hem; it moves with her skirt
        const ys = rowsOf([], 0.93, 0.31, 0.025);
        const half = (y) => (y > 0.76 ? 0.5 + 0.12 * sstep(0.93, 0.78, y) : 0.62 + 0.55 * sstep(0.76, 0.6, y));
        panel(G, { name: 'rose_apron', ys, nc: 20, half, waist: 0.75, under: sg, lining: ap2, off: (y) => (y > 0.76 ? 0.005 : 0.008),
          paint: (p, i, j) => {
            if (p.y < 0.335) return ((j * 2) % 2 < 1) ? ap2 : mix(ap, [255, 255, 255], 0.4);   // the frill
            const x = Math.abs(p.x);
            if (p.y < 0.6 && p.y > 0.47 && x < 0.07 && p.z > 0) return (p.y > 0.585 || x > 0.066 || p.y < 0.474) ? ap2 : mix(ap, [255, 255, 255], 0.2);   // the pocket
            if (Math.abs(p.y - 0.75) < 0.006) return ap2;   // the waist seam
            if (j < 0.6 || j > 19.4) return ap2;
            return hash(Math.floor(p.y * 90), Math.floor(Math.atan2(p.x, p.z) * 40)) > 0.93 ? [255, 246, 250] : ap;   // a little sprig print
          } });
        for (const s of [1, -1]) strap(G, [[s * 0.42, 0.925], [s * 0.5, 0.99], [s * 0.45, 1.04], [s * 0.02, 1.07]], 0.014, ap2, 'rose_strap' + (s > 0 ? 'L' : 'R'));
        belt(G, 0.76, 0.742, ap2, 'rose_ties');
        gloves(v, G, mul(gl, 0.9));
        underTop(G); underSkirt(G);
      });
      tie(v, [0, 0.75, -0.1], C.rose.apron2);
    },
    bram(v) {
      const c = C.bram, skin = hex(c.skin), jk = hex(c.jacket), jk2 = hex(c.jacket2), ap = hex(c.apron), ap2 = hex(c.apron2);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand' || (isArm(part) && ax(p) > 0.265)) return skin;
        if (isArm(part)) return jk;
        return keepShade(jk, o, 0.5, 0.15);
      });
      v.paint('btmsskin', 0.5, trousers(c.pants, { belt: '#4a3428' }));
      v.shoes({ up: c.shoes, sole: c.sole, rim: c.shoes, sock: c.pants, sockY: 0.1, slim: false });
      v.shape('topsjer', lowerCollar(1.05, 0.38));
      v.shape('topsjer', looseSleeves(0.12, 0.26, 0.05));
      v.hair(c.hair);
      v.neck();
      // a short white baker's cap
      const cap = lathe(v, [[0.119, 1.214], [0.12, 1.25], [0.128, 1.262], [0.138, 1.285], [0.136, 1.306], [0.116, 1.324], [0.06, 1.332], [0, 1.334]], c.cap, { tilt: 0.16 });
      recolor(cap, (p) => (p.y < 1.226 ? '#e8e4da' : null));
      beard(v, c.hair, { full: 0.009, low: 0.02, lip: 1.104, side: 1.17, mousR: 0.0065, mousFlat: true });
      // the red kerchief round the neck, knotted in front
      rollNeck(v, c.kerchief, { r: 0.04, y0: 1.032, y1: 1.062 });
      tie(v, [0.0, 1.035, 0.045], c.kerchief, { len: 0.05, r: 0.012, w: () => [['Spine3', 0.6], ['Neck', 0.4]] });
      v.garment((G) => {
        // the baker's jacket: white, double-breasted, to the hips, roomy over the belly
        const g = top(G, { name: 'bram_jacket', hem: 0.66, lining: jk2, off1: 0.012,
          paint: (p) => {
            if (p.y < 0.676) return jk2;
            if (p.z > 0 && Math.abs(p.x - 0.045) < 0.0018 && p.y < 0.95) return jk2;   // the edge of the wrap over the front
            return jk;
          } });
        studs(G, g, [0.9, 0.84, 0.78, 0.72].flatMap((y) => [[0.072, y], [-0.03, y]]), hex(c.button), 'bram_buttons', 0.0075, 0.003);
        sleeves(G, { name: 'bram', to: 0.265, color: jk, cuff: jk, roll: true, loose: 1.2 });
        // the apron: from the waist to the shins, striped, tied round the back; moving as cloth
        const ys = rowsOf([], 0.77, 0.3, 0.025);
        panel(G, { name: 'bram_apron', ys, nc: 20, half: (y) => 0.95 + 0.15 * sstep(0.7, 0.5, y), waist: 0.78, flare: 0.02, lining: ap2, off: () => 0.008,
          paint: (p, i, j) => {
            if (p.y < 0.32 || p.y > 0.755) return ap2;
            if (j < 0.6 || j > 19.4) return ap2;
            const u = j / 20; if (Math.abs(((u * 7) % 1) - 0.5) < 0.05) return mix(ap, [120, 150, 190], 0.6);   // blue stripes down it
            if (p.y < 0.6 && p.y > 0.5 && Math.abs(p.x) < 0.06 && p.z > 0) return p.y > 0.592 ? ap2 : mix(ap, ap2, 0.25);   // the pocket
            return ap;
          },
          sim: { tag: 'A', ns: 7, rows: [rowAt(ys, 0.7), rowAt(ys, 0.5), ys.length - 1], parent: 'Hips',
            prm: (ch) => ({ ks: [34, 26], drag: [0.6, 0.9], damp: 4.5, vmax: 1.6, flut: ch.edge ? 0.6 : 0.4, cone: [0.4, 0.55], quad: true,
              coll: [{ ring: 'Hips', caps: ['arms'], seg: ['arms', 'thighs'], after: ['thighs'], pad: 0.016 }, { caps: ['arms'], seg: ['legs'], after: ['legs'] }] }) } });
        belt(G, 0.79, 0.772, ap2, 'bram_ties');
        underTop(G, 0.012);
      });
      tie(v, [0, 0.78, -0.088], C.bram.apron2);
    },
    ada(v) {
      const c = C.ada, skin = hex(c.skin), bl = hex(c.blouse), bl2 = hex(c.blouse2), sk = hex(c.skirt), sk2 = hex(c.skirt2), ap = hex(c.apron), ck = hex(c.check);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand' || (isArm(part) && ax(p) > 0.33)) return skin;
        if (isArm(part)) return bl;
        return keepShade(bl, o, 0.5, 0.15);
      });
      v.paint('btmsskin', 0.5, (p) => (p.y > 0.6 ? sk2 : skin));
      skirtLegs(v, skin, 0.62);
      v.shape('topsjer', lowerCollar(1.045, 0.25));
      v.shoes({ up: c.shoes, sole: c.sole, sock: c.skin, sockY: 0.085, rimY: 0.08, rim: c.shoes });
      v.hair(c.hair);
      v.neck();
      headscarf(v, c.scarf, { dots: c.dots, knot: c.scarf, front: 0.05, inset: 1.12 });
      v.garment((G) => {
        const sg = skirt(G, { name: 'ada_skirt', hem: 0.16, rx: [0.122, 0.21], rz: [0.1, 0.2], back: 1.06, folds: 14, lining: mul(sk2, 0.85),
          paint: (p) => (p.y < 0.175 ? sk2 : Math.abs(p.y - 0.2) < 0.003 ? sk2 : sk) });
        top(G, { name: 'ada_blouse', hem: 0.71, lining: bl2, off1: 0.012,
          paint: (p) => (p.y < 0.722 ? bl2 : p.z > 0 && Math.abs(p.x) < 0.0018 && p.y < 0.95 ? bl2 : bl) });
        sleeves(G, { name: 'ada', to: 0.33, color: bl, cuff: bl2, roll: true });
        band(G, { name: 'ada_collar', e: [0.74, 0.82, 0.9, 0.98], color: bl2, off: () => 0.003 });
        // a gingham apron over the skirt, from the waist to the shins, moving with it
        const ys = rowsOf([], 0.755, 0.3, 0.025);
        panel(G, { name: 'ada_apron', ys, nc: 20, half: (y) => 0.75 + 0.4 * sstep(0.74, 0.55, y), waist: 0.76, under: sg, lining: mul(ap, 0.85), off: () => 0.008,
          paint: (p, i, j) => {
            if (p.y < 0.325) return ck;                                     // a red hem band
            if (j < 0.5 || j > 19.5) return ck;
            return plaid(ap, ck, ck, Math.atan2(p.x, p.z) * 0.13, p.y, 0.016);
          } });
        belt(G, 0.765, 0.745, ck, 'ada_ties');
        underTop(G); underSkirt(G);
      });
      tie(v, [0, 0.755, -0.1], C.ada.check);
    },
    mae(v) {
      const c = C.mae, skin = hex(c.skin), bl = hex(c.blouse), sh = hex(c.shawl), sh2 = hex(c.shawl2), sk = hex(c.skirt), sk2 = hex(c.skirt2);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand') return skin;
        if (isArm(part)) return ax(p) > 0.44 ? skin : sh;
        return keepShade(bl, o, 0.5, 0.15);
      });
      v.paint('btmsskin', 0.5, (p) => (p.y > 0.6 ? sk2 : hex(c.tights)));
      skirtLegs(v, skin, 0.62);
      v.shape('topsjer', lowerCollar(1.045, 0.25));
      v.shoes({ up: c.shoes, sole: c.sole, sock: c.tights, sockY: 0.085, rimY: 0.08, rim: c.shoes });
      v.hair(c.hair, 0.6);
      v.crown({ top: 1.31, back: 0.012 });
      v.neck();
      bun(v, c.hair, { at: [0, 1.29, -0.075], r: 0.05, band: '#c8c8d0' });
      glasses(v, c.glasses);
      v.garment((G) => {
        skirt(G, { name: 'mae_skirt', hem: 0.17, rx: [0.122, 0.225], rz: [0.1, 0.215], back: 1.04, folds: 12, lining: mul(sk2, 0.85),
          paint: (p) => (p.y < 0.185 ? sk2 : sk) });
        // a knitted cardigan, open down the front, buttons on the left edge, ribbed hem
        const g = top(G, { name: 'mae_cardigan', hem: 0.68, gap: () => 0.24, lining: sh2, off1: 0.014, th: 0.006,
          paint: (p, i, j) => {
            if (p.y < 0.705) return ((Math.atan2(p.x, p.z) * 60) % 1 + 1) % 1 < 0.3 ? sh2 : sh;   // the ribbed hem
            if (j < 0.9 || j > 43.1) return sh2;   // the button band
            return knit(sh, p, 0.9);
          } });
        studs(G, g, [0.92, 0.85, 0.78, 0.72].map((y) => [0.043, y]), hex('#f4ead8'), 'mae_buttons', 0.0065, 0.003);
        sleeves(G, { name: 'mae', to: 0.425, color: sh, cuff: sh2, paint: (p) => knit(sh, p, 0.9) });
        band(G, { name: 'mae_collar', e: [0.74, 0.82, 0.9, 0.98], color: hex('#ffffff'), off: () => 0.003 });
        underTop(G, 0.012); underSkirt(G);
      });
    },
    marina(v) {
      const c = C.marina, skin = hex(c.skin), tp = hex(c.top), st = hex(c.stripe), pants = hex(c.pants), boots = hex(c.boots);
      const breton = (p) => (p.y < 1.036 && stripes(p.y, 0.028, 0.42) ? st : tp);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand' || (isArm(part) && ax(p) > 0.27)) return skin;
        if (isArm(part)) return tp;
        if (p.y > 1.04) return st;
        return breton(p);
      });
      // the trousers rolled up to mid-calf, rubber boots below
      v.paint('btmsskin', 0.5, (p, n, o) => {
        if (p.y > 0.69) return hex('#5a3a2a');
        if (p.y < 0.31) return p.y > 0.295 ? mul(boots, 1.12) : boots;
        if (p.y < 0.36) return p.y > 0.345 || p.y < 0.322 ? mul(pants, 0.82) : mul(pants, 0.92);   // the rolled cuffs
        return keepShade(pants, o, 0.55, 0.6);
      });
      v.shape('btmsskin', (p) => {   // the boots' shafts hug the calf
        if (p.y > 0.33) return;
        const cx = Math.sign(p.x) * 0.056, cz = 0.002, d = Math.hypot(p.x - cx, p.z - cz); if (d < 1e-6) return;
        const want = Math.min(d, legR(p.y) * 1.22 + 0.006), k = 1 + (want / d - 1) * sstep(0.34, 0.3, p.y);
        p.x = cx + (p.x - cx) * k; p.z = cz + (p.z - cz) * k;
      });
      v.shoes({ up: c.boots, sole: c.sole, rim: c.boots, toe: c.boots });
      v.shape('btmsskin', looseLegs(1.12, 0.36));
      v.shape('topsjer', lowerCollar(1.045, 0.25));
      v.hair(c.hair);
      v.neck();
      headscarf(v, c.scarf, { hemCol: '#f6f4ee', knot: c.scarf, front: 0.06, inset: 1.12 });
      lowTail(v, c.hair, null, { y: 1.15, z: -0.105, len: 0.1, r: 0.026, wide: 1.2 });
      v.garment((G) => {
        top(G, { name: 'marina_top', hem: 0.7, lining: mul(tp, 0.82), off1: 0.011, paint: (p) => (p.y < 0.712 ? st : breton(p)) });
        sleeves(G, { name: 'marina', to: 0.27, color: tp, cuff: tp, roll: true, paint: (p) => (stripes(Math.abs(p.x), 0.028, 0.42) ? st : tp), cuffPaint: (p, i) => (i < 1 || i > 2.4 ? st : tp) });
        band(G, { name: 'marina_neck', e: [0.8, 0.88, 0.96], color: st, off: () => 0.003 });
        underTop(G);
      });
    },
    ben(v) {
      const c = C.ben, skin = hex(c.skin), sh = hex(c.shirt), ck = hex(c.check), ck2 = hex(c.check2), ov = hex(c.overalls), ov2 = hex(c.overalls2);
      const flannel = (p) => plaid(sh, ck2, ck, p.x, p.y, 0.03);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand' || (isArm(part) && ax(p) > 0.27)) return skin;
        if (isArm(part)) return sh;
        if (p.y > 1.04) return mul(sh, 0.9);
        return flannel(p);
      });
      v.paint('btmsskin', 0.5, (p, n, o) => {
        if (p.y < 0.215) return hex(c.boots);
        const x = Math.abs(p.x);
        if (p.z > 0.02 && Math.abs(x - 0.056) < 0.0015) return ov2;   // the seams down the front
        return keepShade(ov, o, 0.55, 0.6);
      });
      v.shoes({ up: c.boots, sole: c.sole, rim: c.boots });
      v.shape('btmsskin', looseLegs(1.14, 0.22));
      v.shape('topsjer', lowerCollar(1.05, 0.38));
      v.hair(c.hair);
      v.neck();
      // the straw hat: a flat brim and a dented crown, a red band
      const hat = lathe(v, [[0.205, 1.226], [0.2, 1.218], [0.16, 1.213], [0.126, 1.215], [0.123, 1.24], [0.121, 1.29], [0.112, 1.312], [0.07, 1.318], [0.03, 1.31], [0, 1.312]], c.hat, { tilt: 0.1, seg: 36 });
      recolor(hat, (p) => { const a = Math.atan2(p.x, p.z), r = Math.hypot(p.x, p.z); return ((a * 18 / TAU + r * 60) % 1 + 1) % 1 < 0.22 ? c.hat2 : null; });   // the straw's weave
      lathe(v, [[0.1245, 1.216], [0.1232, 1.24]], c.band, { tilt: 0.1 });
      v.garment((G) => {
        top(G, { name: 'ben_shirt', hem: 0.7, lining: mul(sh, 0.7), off1: 0.01, paint: (p) => flannel(p) });
        sleeves(G, { name: 'ben', to: 0.27, color: sh, cuff: sh, roll: true, paint: (p) => plaid(sh, ck2, ck, p.x, p.y + p.z, 0.03), cuffPaint: () => mix(sh, ck, 0.3) });
        // the dungarees: the waist over the shirt's tail, a bib on the chest, straps over the
        // shoulders crossing at the back, brass buttons
        belt(G, 0.79, 0.67, ov, 'ben_waist', { paint: (p) => (Math.abs(p.y - 0.785) < 0.004 ? ov2 : ov), off: 0.007 });
        const ys = rowsOf([], 0.92, 0.79, 0.02);
        const bib = panel(G, { name: 'ben_bib', ys, nc: 12, half: () => 0.62, waist: 0.6, lining: ov2, off: () => 0.009, th: 0.004,
          paint: (p, i, j) => (i < 0.5 || j < 0.4 || j > 11.6 ? ov2 : p.y < 0.88 && p.y > 0.82 && Math.abs(p.x) < 0.04 ? (p.y > 0.875 || Math.abs(p.x) > 0.037 ? ov2 : mul(ov, 1.05)) : ov) });
        studs(G, bib, [[0.05, 0.9], [-0.05, 0.9]], hex(c.brass), 'ben_buttons', 0.008, 0.003);
        for (const s of [1, -1]) strap(G, [[s * 0.55, 0.915], [s * 0.62, 0.98], [s * 1.2, 1.035], [s * 2.3, 1.0], [s * 2.85, 0.9], [s * 3.2, 0.8]], 0.02, ov, 'ben_strap' + (s > 0 ? 'L' : 'R'), { paint: (p, i, j) => (j < 0.15 || j > 0.85 ? ov2 : ov), off: 0.006 });
        underTop(G);
      });
    },
    tom(v) {
      const c = C.tom, skin = hex(c.skin), sw = hex(c.sweater), coat = hex(c.coat), coat2 = hex(c.coat2);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand') return skin;
        if (isArm(part)) return ax(p) > 0.43 ? skin : coat;
        return knit(sw, p, 0.92);
      });
      v.paint('btmsskin', 0.5, trousers(c.pants, { belt: '#2a2626' }));
      v.shoes({ up: c.boots, sole: c.sole, rim: c.boots, sock: c.pants, sockY: 0.1, slim: false });
      v.shape('topsjer', lowerCollar(1.05, 0.38));
      v.hair(c.hair, 0.6);
      v.shape('hair01_on', K.liftNape);
      v.neck();
      rollNeck(v, c.sweater, { r: 0.041, y0: 1.03, y1: 1.08 });
      // the captain's cap: a white top, a dark band, a black peak and a gold badge
      lathe(v, [[0.12, 1.196], [0.1215, 1.238]], c.capBand, { tilt: 0.06 });
      lathe(v, [[0.1215, 1.238], [0.13, 1.258], [0.142, 1.276], [0.135, 1.29], [0.07, 1.294], [0, 1.295]], c.cap, { tilt: 0.06 });
      peak(v, c.peak, { tilt: 0.06, y: 1.205 });
      { const b = new THREE.SphereGeometry(0.012, 10, 8); b.scale(1.3, 1, 0.5); b.translate(0, 1.222, -0.012 + 0.124); b.translate(0, -1.2, 0).rotateX(-0.06).translate(0, 1.2, 0); v.flat(b, c.badge, head1); }
      beard(v, c.beard, { full: 0.016, low: 0.06, lip: 1.106, side: 1.18, mousR: 0.011, mousLong: 0.006 });
      // his pipe, in the corner of his mouth
      { const st = lock([[-0.018, 1.114, 0.086], [-0.03, 1.106, 0.11], [-0.04, 1.1, 0.13]], 0.0035, 1, 0.003, 6, 6);
        const bw = new THREE.CylinderGeometry(0.0085, 0.007, 0.02, 12); bw.translate(-0.042, 1.107, 0.132);
        v.flat(mergeGeos([st, bw]), c.pipe, head1); }
      v.garment((G) => {
        labCoat(G, { coat, coat2, shirt: sw, line: mul(coat2, 0.8) }, { name: 'tom', hem: 0.58,
          pockets: [[1, 0.06, 0.125, 0.63, 0.7], [-1, 0.06, 0.125, 0.63, 0.7]],
          buttons: { color: hex(c.brass), r: 0.008, at: [0.86, 0.78, 0.7].flatMap((y) => [[0.05, y], [-0.05, y]]) } });
        G.late('topsjer', drawIn((p, th) => 0.012 * sstep(0.95, 0.92, p.y) * sstep(0.55, 0.95, Math.abs(th))));
      });
    },
    gus(v) {
      const c = C.gus, skin = hex(c.skin), jp = hex(c.jumper), coat = hex(c.coat), coat2 = hex(c.coat2);
      v.paint('topsjer', 0.5, (p, n, o, part) => {
        if (part === 'hand') return skin;
        if (isArm(part)) return ax(p) > 0.43 ? skin : coat;
        return knit(jp, p, 0.88);
      });
      const tr = trousers(c.pants, { belt: '#2a2a2e' });
      v.paint('btmsskin', 0.5, (p, n, o) => (p.y < 0.3 ? hex(c.boots) : tr(p, n, o)));
      v.shape('btmsskin', (p) => {   // sea boots to below the knee
        if (p.y > 0.33) return;
        const cx = Math.sign(p.x) * 0.056, cz = 0.002, d = Math.hypot(p.x - cx, p.z - cz); if (d < 1e-6) return;
        const want = Math.min(d, legR(p.y) * 1.3 + 0.008), k = 1 + (want / d - 1) * sstep(0.34, 0.3, p.y);
        p.x = cx + (p.x - cx) * k; p.z = cz + (p.z - cz) * k;
      });
      v.shoes({ up: c.boots, sole: c.sole, rim: c.boots });
      v.shape('topsjer', lowerCollar(1.05, 0.38));
      v.hair(c.hair);
      v.shape('hair01_on', K.liftNape);
      v.neck();
      rollNeck(v, c.jumper, { r: 0.042, y0: 1.03, y1: 1.075 });
      // the knitted cap, its brim turned up
      const cap = lathe(v, [[0.123, 1.188], [0.128, 1.205], [0.128, 1.235], [0.121, 1.242], [0.12, 1.28], [0.104, 1.322], [0.066, 1.345], [0, 1.35]], c.cap, { tilt: 0.1, seg: 40 });
      recolor(cap, (p) => { const a = Math.atan2(p.x, p.z + 0.012); return ((a / TAU * 40) % 1 + 1) % 1 < 0.35 ? c.cap2 : null; });
      beard(v, c.beard, { full: 0.013, low: 0.035, lip: 1.105, side: 1.17, mousR: 0.01 });
      v.garment((G) => {
        // the oilskin: a long yellow coat with its collar up, toggles down the front
        labCoat(G, { coat, coat2, shirt: jp, line: mul(coat2, 0.82), collar: coat }, { name: 'gus', hem: 0.4,
          pockets: [[1, 0.055, 0.125, 0.53, 0.62], [-1, 0.055, 0.125, 0.53, 0.62]],
          buttons: { color: hex('#3a2e24'), r: 0.007, at: [0.78, 0.7, 0.62, 0.54, 0.46].map((y) => [0.047, y]) } });
        G.late('topsjer', drawIn((p, th) => 0.012 * sstep(0.95, 0.92, p.y) * sstep(0.55, 0.95, Math.abs(th))));
      });
    },
  };

  // a shirt collar turned down round the neck, open in a V at the throat, its two points
  // lying on the chest either side of it: rays from above the trunk's axis outwards and down
  // (as band), each row t (0 at the neck .. 1 at the edge) e0..e1 radians below the level, the
  // points (at ptAt radians either side of the front) reaching on to tip
  function pointCollar(G, o) {
    const T = G.torsoT, NC = o.nc ?? 48, c = V(0, o.cy ?? 1.12, ZC - 0.004), NI = o.rows ?? 5;
    const gap = (t) => (o.gap0 ?? 0.05) + (o.gap1 ?? 0.3) * t;
    const thOf = (t, j) => gap(t) + j / NC * (TAU - 2 * gap(t));
    const eOf = (t, th) => {
      const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
      const pt = Math.exp(-(((a - (o.ptAt ?? 0.5)) / (o.ptW ?? 0.22)) ** 2));
      return o.e0 + (o.e1 - o.e0) * t + (o.tip - o.e1) * pt * t * t;
    };
    const ray = (e, th) => V(Math.sin(th) * Math.cos(e), -Math.sin(e), Math.cos(th) * Math.cos(e));
    const D = Array.from({ length: NI }, (_, i) => {
      const t = i / (NI - 1);
      return fixRing(Array.from({ length: NC + 1 }, (_, j) => { const th = thOf(t, j); return cast(T, c, ray(eOf(t, th), th), 0.3) ?? 0.09; }), false, o.smooth ?? 5);
    });
    const P = D.map((row, i) => row.map((d, j) => { const t = i / (NI - 1), th = thOf(t, j); return c.clone().addScaledVector(ray(eOf(t, th), th), d + (o.off ?? 0.004) + 0.003 * t); }));
    const B = G.build(), W = P.map((row) => row.map((p) => G.bodyW(p)));
    slab(B, P, W, o.th ?? 0.003, { out: (p) => p.clone().sub(c), rims: { top: true, bottom: true, left: true, right: true } });
    G.add(B, paintGrid(P, 128, 32, o.paint || (() => o.color), o.lining || mul(o.color, 0.75)), o.name);
    return P;
  }
  // rigid parts in one skinned mesh with a palette texture (a strip of colour cells, each part's
  // uvs on its cell) instead of vertex colours: the native renderer reads the baked vertex
  // colours as sRGB and shows them darker than the web does, a texture comes out the same in
  // both. parts: [[geometry, colour]], wfn(p) -> [[bone, weight]]
  function paletted(v, parts, wfn, name) {
    const cols = [...new Set(parts.map(([, c]) => c))], CW = 32;
    const geos = parts.map(([g, c]) => {
      const k = cols.indexOf(c), U = new Float32Array(g.attributes.position.count * 2);
      for (let i = 0; i < U.length; i += 2) { U[i] = (k + 0.5) / cols.length; U[i + 1] = 0.5; }
      g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      return g;
    });
    v.add(mergeGeos(geos), K.canvasMat(cols.length * CW, 4, (x, w, h) => cols.forEach((c, k) => { x.fillStyle = c; x.fillRect(k * CW, 0, CW, h); }), v.CLOTH,
      { name: 'cast_' + name, side: THREE.DoubleSide }), wfn, name);
  }
  // a point on the trunk (or what is on it already) at angle th round it and height y, off it by off
  const onTrunk = (G, th, y, off = 0) => {
    const T = [...G.torsoT, ...G.hipT, ...G.extraT], r = cast(T, V(0, y, ZC), dirOf(th), 0.45) ?? 0.12;
    return { p: V(0, y, ZC).addScaledVector(dirOf(th), r + off), th };
  };
  BUILD.jenny = (v) => {
    const c = C.jenny, skin = hex(c.skin), jk = hex(c.jacket), jk2 = hex(c.jacket2), pn = hex(c.panel), pn2 = hex(c.panel2), red = hex(c.red), red2 = hex(c.red2);
    const navy = hex(c.navy), sk = hex(c.skirt), sk2 = hex(c.skirt2), glove = hex(c.glove), blk = hex(c.belt);
    // the body: white gloves on the hands, bare arms below the sleeves, the jacket's blue under it
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand' || (isArm(part) && ax(p) > 0.425)) return glove;
      if (isArm(part)) return ax(p) > 0.19 ? skin : jk;
      if (p.y > 1.0) return navy;                        // (inside the collar)
      if (p.z > 0 && p.y > 0.93 && ax(p) < 0.088) return pn;   // the front panel up to the collar (above the jacket's top)
      return keepShade(jk, o, 0.5, 0.15);
    });
    v.paint('btmsskin', 0.5, (p) => (p.y > 0.6 ? sk2 : skin));
    // bare legs right down into the shoes: the jeans' legs (which stop at the boots' tops)
    // let down to the ankle, slimmed to legs from the upper thigh (a trim seat for the skirt)
    v.shape('btmsskin', (p) => { if (p.y < 0.3) p.y = 0.3 - (0.3 - p.y) * (0.3 - 0.07) / (0.3 - 0.213); });
    skirtLegs(v, skin, 0.68);
    // and smooth (the jeans' creases gone): round, a leg's profile, the calves fuller behind
    v.shape('btmsskin', (p) => {
      const t = sstep(0.66, 0.58, p.y); if (!t) return;
      const cx = Math.sign(p.x) * 0.056, cz = 0.002, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz); if (d < 1e-6) return;
      const ca = dz / d, want = legR(p.y) * (1 + 0.1 * Math.max(0, -ca) * sstep(0.18, 0.26, p.y) * sstep(0.38, 0.3, p.y) - 0.03 * ca);
      const k = 1 + (want / d - 1) * t; p.x = cx + dx * k; p.z = cz + dz * k;
    });
    v.shape('topsjer', lowerCollar(1.045, 0.22));
    // low black court shoes: the boots cut down to the instep (the rest sunk inside the ankle),
    // narrower and lower over the toes, a thin sole with an arch under it, a heel at the back
    v.shoes({ up: c.shoes, sole: c.sole, sock: c.skin, sockY: 0.068, rimY: 0.066, rim: c.shoes, toe: c.shoes, soleH: 0.016 });
    v.shape('shoessboots', (p) => {
      const cx = Math.sign(p.x) * 0.056, cz = 0.002, dx = p.x - cx, dz = p.z - cz;
      if (p.y > 0.075) {   // inside the leg
        const d = Math.hypot(dx, dz), want = legR(Math.min(p.y, 0.2)) * 0.78; if (d > want && d > 1e-6) { p.x = cx + dx * want / d; p.z = cz + dz * want / d; }
        return;
      }
      const toe = sstep(0.02, 0.1, dz);
      p.x = cx + dx * (0.86 - 0.08 * toe);
      if (p.y > 0.018) p.y = 0.018 + (p.y - 0.018) * (1 - 0.22 * toe);
      if (p.y < 0.016) { const arch = sstep(-0.035, -0.012, dz) * sstep(0.065, 0.035, dz); p.y = Math.max(p.y, 0.016 * arch); }
    });
    v.hair(c.hair);
    v.neck();
    // (what goes on the head is gathered into one mesh coloured from a palette strip: see paletted)
    const onHead = [], flat0 = v.flat;
    v.flat = (geo, col) => onHead.push([geo, col]);
    // the police cap: a tall crown, flat on top, a red band round its top edge, a black peak and a
    // gold winged badge on the front
    const TILT = 0.07;
    lathe(v, [[0.119, 1.196], [0.1205, 1.23], [0.1235, 1.28], [0.1265, 1.322], [0.1262, 1.332], [0.11, 1.338], [0.06, 1.341], [0, 1.342]], c.cap, { tilt: TILT, seg: 40 });
    lathe(v, [[0.1255, 1.308], [0.1278, 1.311], [0.1281, 1.324], [0.1262, 1.327]], c.band, { tilt: TILT, seg: 40 });
    lathe(v, [[0.1203, 1.199], [0.1222, 1.203], [0.1228, 1.222], [0.1208, 1.226]], c.cap2, { tilt: TILT, seg: 40 });   // the band above the peak
    peak(v, c.peak, { tilt: TILT, y: 1.203, r0: 0.116, r1: 0.178, half: 1.1 });
    {
      const at = (g, x, y) => { g.translate(x, y, -0.012 + 0.1262); g.translate(0, -1.2, 0).rotateX(-TILT).translate(0, 1.2, 0); return g; };
      const bd = [], ctr = new THREE.SphereGeometry(0.011, 10, 8); ctr.scale(1, 1.15, 0.45); bd.push(at(ctr, 0, 1.262));
      for (const s of [1, -1]) {
        const w = new THREE.SphereGeometry(1, 10, 6); w.scale(0.021, 0.0075, 0.004); w.rotateZ(s * 0.5); bd.push(at(w, s * 0.02, 1.27));
        const w2 = new THREE.SphereGeometry(1, 8, 6); w2.scale(0.015, 0.006, 0.0035); w2.rotateZ(s * 0.25); bd.push(at(w2, s * 0.018, 1.259));
      }
      v.flat(mergeGeos(bd), c.gold, head1);
    }
    // the hair: bangs and face-framing locks from under the cap, and spikes flaring out at the
    // sides and the back below it
    {
      const parts = [], hc = new V3(0, 1.17, -0.005);
      for (const s of [1, -1]) {
        parts.push(lock([[s * 0.03, 1.232, 0.096], [s * 0.044, 1.208, 0.103], [s * 0.052, 1.18, 0.1], [s * 0.05, 1.162, 0.097]], 0.019, 0.3, 0.003, 10, 10, hc));
        parts.push(lock([[s * 0.072, 1.225, 0.078], [s * 0.088, 1.18, 0.07], [s * 0.094, 1.13, 0.052], [s * 0.088, 1.09, 0.036]], 0.022, 0.32, 0.004, 12, 10, hc));
        parts.push(lock([[s * 0.092, 1.215, 0.04], [s * 0.104, 1.16, 0.03], [s * 0.106, 1.11, 0.012], [s * 0.098, 1.075, 0.0]], 0.02, 0.35, 0.004, 12, 10, hc));
      }
      parts.push(lock([[0.004, 1.236, 0.1], [0.008, 1.21, 0.107], [0.006, 1.186, 0.106], [0.0, 1.17, 0.104]], 0.017, 0.3, 0.002, 10, 10, hc));
      v.flat(mergeGeos(parts), c.hair, head1);
      const S = [];
      for (const s of [-1, 1]) {
        S.push([s * 1.65, -0.45, 0.15, 0.062, [s * 1, 0.3, -0.25], 0.0]);
        S.push([s * 1.95, -0.55, 0.17, 0.066, [s * 1, 0.05, -0.5], 0.05]);
        S.push([s * 2.3, -0.65, 0.14, 0.062, [s * 0.75, -0.25, -0.8], 0.1]);
        S.push([s * 1.75, -0.8, 0.11, 0.05, [s * 1, -0.35, -0.1], 0.1]);
        S.push([s * 2.7, -0.75, 0.1, 0.055, [s * 0.3, -0.6, -0.9], 0.15]);
      }
      S.push([Math.PI, -0.8, 0.09, 0.06, [0, -0.75, -0.65], 0.2]);
      v.spikes(c.hair, S);
    }
    v.flat = flat0;
    paletted(v, onHead, head1, 'jenny_head');
    v.garment((G) => {
      // the pencil skirt: from the waist to above the knee, close round the hips and thighs,
      // darker panels down the sides
      skirt(G, { name: 'jenny_skirt', hem: 0.46, rx: [0.118, 0.128], rz: [0.096, 0.094], back: 1.06, curve: 1, folds: 8, wave: 0.008, lining: mul(sk2, 0.8), flut: 0.25,
        paint: (p) => {
          if (p.y < 0.472) return mul(sk, 0.86);
          const th = Math.atan2(p.x, p.z - ZC), sd = Math.abs(Math.sin(th));
          if (sd > 0.9) return sk2;                                       // the side panels
          if (sd > 0.86) return mix(sk, sk2, 0.5);
          return sk;
        } });
      // the uniform jacket: fitted at the waist, a little peplum over the skirt; the light-blue
      // panel down the front, narrowing to the belt; the seams and the breast pockets
      const ys = rowsOf([0.958, 0.945], 0.93, 0.665, 0.02);
      const panel = (y) => 0.028 + 0.06 * sstep(0.76, 0.96, y);
      const jg = G.hang({
        name: 'jenny_jacket', ys, nc: 48, pin: 2, mid: 0,
        off: offTop(0.005, 0.009, 0.82), tuck: 0.012, lining: mul(jk2, 0.8), th: 0.0045,
        min: (y, th) => { const t = clamp((0.745 - y) / 0.08); if (t <= 0) return 0; const rx = 0.118 + 0.03 * t, rz = 0.098 + 0.024 * t; return 1 / Math.hypot(Math.sin(th) / rx, Math.cos(th) / rz); },
        paint: (p) => {
          const x = Math.abs(p.x), y = p.y;
          if (y < 0.678) return jk2;                                               // the hem
          if (p.z > 0 && y > 0.745) {                                              // (it ends at the belt)
            const e = panel(y) - x;
            if (e > 0.003) return pn;
            if (e > 0) return pn2;                                                 // its edge
          }
          if (p.z < -0.02 && Math.abs(x - 0.06) < 0.0018 && y < 0.92) return jk2;  // the back's seams
          return jk;
        },
      });
      // the breast pockets' flaps and buttons, beside the panel
      const flaps = [];
      for (const s of [1, -1]) flaps.push({ ...G.on(jg, s * 0.1, 0.915), w: 0.046, h: 0.02, d: 0.006 });
      G.boxes(flaps, c.jacket2, 'jenny_flaps');
      studs(G, jg, [[0.1, 0.906], [-0.1, 0.906]], hex(c.gold), 'jenny_buttons', 0.0045, 0.004);
      sleeves(G, { name: 'jenny', to: 0.2, color: jk, cuff: red, puff: 0.004 });
      // the red collar, turned down, open at the throat
      pointCollar(G, { name: 'jenny_collar', e0: 0.7, e1: 0.86, tip: 1.1, ptAt: 0.42, ptW: 0.25, gap0: 0.07, gap1: 0.2, color: red, lining: red2, off: 0.004 });
      // the belt and its gold buckle
      const bp = belt(G, 0.768, 0.742, c.belt, 'jenny_belt', { off: 0.005 });
      G.boxes([{ ...G.on({ P: bp }, 0, 0.755), w: 0.038, h: 0.03, d: 0.007 }], c.gold, 'jenny_buckle');
      // the strap: from the right shoulder across the chest to the left hip, and down the back
      strap(G, [[1.28, 0.71], [0.75, 0.78], [0.25, 0.85], [-0.3, 0.93], [-0.7, 1.0], [-0.98, 1.032], [-1.3, 1.042], [-1.72, 1.036], [-2.2, 0.99], [-2.6, 0.94],
        [-2.95, 0.88], [-3.45, 0.8], [-3.95, 0.74], [-4.45, 0.71], [-4.9, 0.7]], 0.017, blk, 'jenny_strap', { off: 0.004, n: 40 });
      // the pouch on it, on the left hip: a box with a flap
      const hp = onTrunk(G, 1.33, 0.69, 0.002), fp = onTrunk(G, 1.33, 0.716, 0.036);
      G.boxes([{ p: hp.p, th: hp.th, w: 0.068, h: 0.088, d: 0.036 }], c.belt, 'jenny_pouch');
      G.boxes([{ p: fp.p, th: fp.th, w: 0.072, h: 0.036, d: 0.006 }], '#2a2a34', 'jenny_pouchflap');
      gloves(v, G, mul(glove, 0.97));
      underTop(G); underSkirt(G);
    });
  };

  BUILD.gary = (v) => {
    const c = C.gary, skin = hex(c.skin), sw = hex(c.sweat), sw2 = hex(c.sweat2), un = hex(c.under), jn = hex(c.jeans), jn2 = hex(c.jeans2);
    const blk = hex(c.black), bt = hex(c.boots);
    // the body: the hands bare, the rest under the sweatshirt its purple, up to a plain round
    // neckline (no collar: Ash's jacket collar folded down to the base of the neck, the skin)
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand' || (isArm(part) && ax(p) > 0.44)) return skin;
      if (isArm(part)) return sw;
      return p.y > 1.05 && Math.hypot(p.x, p.z + 0.008) < 0.042 ? skin : p.y > 1.04 ? sw2 : sw;
    });
    // the jeans: denim with its painted folds, a stitched seam down the outside of each leg, and
    // bunched in creases above the boots
    v.paint('btmsskin', 0.5, (p, n, o) => {
      if (p.y > 0.69) return mul(jn2, 0.8);   // (the waist, under the sweatshirt)
      const dx = Math.abs(p.x) - 0.056, dz = p.z - 0.002, a = Math.atan2(dx, dz);
      if (Math.abs(a - Math.PI / 2) < 0.07 && p.y < 0.62) return hex(c.stitch);
      if (Math.abs(a - Math.PI / 2) < 0.16 && p.y < 0.62) return jn2;
      for (const [y0, ph] of [[0.236, 0], [0.262, 1.7], [0.292, 3.1], [0.33, 4.4]]) if (Math.abs(p.y - y0 - 0.006 * Math.sin(a * 2 + ph)) < 0.0028) return mul(jn2, 0.88);
      return keepShade(jn, o, 0.55, 0.6);
    });
    v.shape('btmsskin', looseLegs(1.1, 0.3));
    // the legs' bottoms bunched out a little over the boots' tops
    v.shape('btmsskin', (p) => {
      const t = sstep(0.34, 0.22, p.y); if (!t) return;
      const cx = Math.sign(p.x) * 0.056, cz = 0.002, k = 1 + 0.1 * t;
      p.x = cx + (p.x - cx) * k; p.z = cz + (p.z - cz) * k;
    });
    // the boots: mustard yellow, a black band round the shaft below its top and a strap round the
    // ankle, a black toe cap and sole
    v.paint('shoessboots', 0.5, (p, n, o) => {
      const t = clamp(lum(o) / 0.62, 0.82, 1.1);
      if (p.y < 0.03) return mul(blk, clamp(lum(o) / 0.5, 0.9, 1.3));
      if (p.z > 0.1 && p.y < 0.075) return mul(blk, 1.2);
      if ((p.y > 0.168 && p.y < 0.19) || (p.y > 0.086 && p.y < 0.102 && p.z < 0.09)) return blk;
      return mul(bt, t);
    });
    v.shape('topsjer', lowerCollar(1.045, 0.25));
    // the shoulders rounded off (the jacket's shoulder line rises to points beside the neck)
    v.shape('topsjer', (p, n, part) => {
      const x = Math.abs(p.x); if (isArm(part) || x < 0.035 || p.y < 0.99) return;
      const cap = 1.05 - 3.5 * (x - 0.035) ** 2;
      if (p.y > cap - 0.004) p.y = cap - 0.004 + 0.004 * Math.tanh((p.y - cap + 0.004) / 0.004);
    });
    // and what is left of it taken in round the neck, so the neckline lies flat (no collar)
    v.shape('topsjer', (p, n, part) => {
      const t = sstep(1.04, 1.05, p.y), r = Math.hypot(p.x, p.z + 0.008); if (!t || isArm(part) || r < 0.033) return;
      const k = 1 + (0.033 / r - 1) * t; p.x *= k; p.z = -0.008 + (p.z + 0.008) * k;
    });
    // none of Ash's hair: his hair mesh (which is also the back and top of his head) folded away
    // inside the head, and Gary's own scalp in its place (garyScalp)
    v.shape('hair01_on', (p) => p.set(0, 1.18, -0.02));
    v.neck();
    garyScalp(v, c);
    v.garment((G) => {
      // the sweatshirt: hung from the shoulders, big and loose like a long-sleeved shirt, falling
      // wide past the waist to low on the hips, the undershirt's orange hem just showing under it;
      // moving as a heavy cotton below the chest
      const ys = rowsOf([0.958, 0.945], 0.93, 0.6, 0.02), hem = ys.length - 1;
      const sg = G.hang({
        name: 'gary_sweat', ys, nc: 48, pin: 2, mid: rowAt(ys, 0.86),
        off: offTop(0.006, 0.016, 0.82), tuck: 0.006, lining: mul(sw2, 0.8), th: 0.005,
        min: (y, th) => { const t = clamp((0.8 - y) / 0.2); if (t <= 0) return 0; const rx = 0.125 + 0.022 * t, rz = 0.1 + 0.018 * t; return 1 / Math.hypot(Math.sin(th) / rx, Math.cos(th) / rz); },
        paint: (p) => {
          if (p.y < 0.607) return un;
          if (p.y < 0.614) return sw2;   // the hem's fold
          return sw;
        },
        sim: {
          tag: 'G', ns: 16, rows: [2, rowAt(ys, 0.76), hem], parent: 'Spine2',
          prm: () => ({
            ks: [46, 34], drag: [0.5, 0.75], damp: 5.5, vmax: 1.4, flut: 0.3, cone: [0.3, 0.42], hangBone: 'Hips', hang: [0, 0.35, 0.65], quad: true,
            coll: [{ ring: 'Spine1', caps: ['arms'], seg: ['arms'] },
              { ring: 'Hips', mid: 'Spine1', caps: ['arms'], seg: ['arms', 'thighs'], after: ['thighs'] }],
          }),
        },
      });
      // long loose sleeves to the wrists, plain hems
      sleeves(G, { name: 'gary', to: 0.44, color: sw, loose: 1.5, looseFrom: 0.12, paint: (p) => (Math.abs(p.x) > 0.433 ? sw2 : sw) });
      // the necklace: a black cord snug round the neck (not out over the shoulders: a ring round
      // the neck itself, skinned like it), hanging down the front to a yellow and green yin-yang
      // pendant on the chest
      const PY = 0.905, PR = 0.017;
      const at = (y) => onTrunk(G, 0, y, 0.0045).p, pc = at(PY), tg = at(PY + 0.02).sub(at(PY - 0.02)).normalize();
      const ux = V(1, 0, 0), nn = V().crossVectors(ux, tg).normalize(), uy = V().crossVectors(nn, ux).normalize();
      const path = [];
      const NR0 = 0.0345, NZ = -0.008;   // (v.neck: a tube of radius 0.03 round (0, y, -0.008))
      for (let k = 0; k <= 24; k++) { const th = lerp(0.75, TAU - 0.75, k / 24), y = 1.048 + 0.008 * (1 - Math.cos(th)) / 2; path.push(V(Math.sin(th) * NR0, y, NZ + Math.cos(th) * NR0 * 0.95)); }
      const top = pc.clone().addScaledVector(uy, PR * 0.95), start = path[0], end = path[path.length - 1];
      const down = (a) => Array.from({ length: 6 }, (_, k) => {
        const t = (k + 1) / 7, y = lerp(a.y, top.y, t), q = onTrunk(G, Math.atan2(a.x, a.z - ZC) * (1 - t), y, 0.006).p;
        return q.lerp(a.clone().lerp(top, t), 0.2 * sstep(0.5, 1, t));
      });
      const pts = [top, ...down(start).reverse(), ...path, ...down(end), top];
      for (let it = 0; it < 3; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = pts[i].clone().multiplyScalar(0.5).addScaledVector(pts[i - 1], 0.25).addScaledVector(pts[i + 1], 0.25);
      const cord = G.build(), NR = 6, RC = 0.0022;
      const rings = pts.map((p, i) => {
        const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(), o = V(p.x, 0, p.z - ZC).normalize(), b = V().crossVectors(d, o).normalize(), o2 = V().crossVectors(b, d);
        return Array.from({ length: NR + 1 }, (_, k) => { const a = (k % NR) / NR * TAU; return p.clone().addScaledVector(o2, Math.cos(a) * RC).addScaledVector(b, Math.sin(a) * RC); });
      });
      const neckW = (p) => ({ Neck: sstep(1.04, 1.09, p.y), Spine3: 1 - sstep(1.04, 1.09, p.y) });
      const wOf = (p) => (p.y > 1.035 && Math.hypot(p.x, p.z - NZ) < 0.045 ? neckW(p) : p.y > 0.975 ? G.bodyW(p) : nearestW(sg, p));
      slab(cord, rings, rings.map((r) => r.map(wOf)), 0.0008, { loop: true, out: (p, i) => p.clone().sub(pts[i]), rims: {} });
      G.add(cord, paintGrid(rings, 8, 64, () => hex(c.cord), hex(c.cord)), 'gary_cord');
      // the pendant: a disc on the chest, its face the yin-yang ringed in black
      const pd = G.build(), NI = 5, NJ = 28;
      const disc = Array.from({ length: NI }, (_, i) => Array.from({ length: NJ + 1 }, (_, j) => { const a = (j % NJ) / NJ * TAU, r = PR * Math.max(0.02, i / (NI - 1)); return pc.clone().addScaledVector(ux, Math.cos(a) * r).addScaledVector(uy, Math.sin(a) * r).addScaledVector(nn, 0.0015 * (1 - (i / (NI - 1)) ** 2)); }));
      slab(pd, disc, disc.map((r) => r.map((p) => nearestW(sg, p))), 0.0028, { loop: true, out: () => nn, rims: { bottom: true } });
      const yy = (p) => {
        const q = p.clone().sub(pc), a = q.dot(ux) / PR, b = q.dot(uy) / PR, r = Math.hypot(a, b);
        if (r > 0.86) return blk;
        const Y = hex(c.yin), G2 = hex(c.yang);
        if (Math.hypot(a, b - 0.43) < 0.13) return G2;   // the dots
        if (Math.hypot(a, b + 0.43) < 0.13) return Y;
        if (Math.hypot(a, b - 0.43) < 0.43) return Y;   // the two heads
        if (Math.hypot(a, b + 0.43) < 0.43) return G2;
        return a < 0 ? Y : G2;
      };
      G.add(pd, paintGrid(disc, 64, 64, yy, mul(blk, 1.4)), 'gary_pendant');
      underTop(G); underSkirt(G, 0.006);
      // the hair: big chunky spikes rising off the crown and arcing out and down, swept to his
      // right, shorter ones to his left and down the back, each its own bouncy chain hanging a
      // little under its own weight; [azimuth of the root (0 front, + his left), its elevation on
      // the head, the direction it rises in, the direction it arcs out to, length, width]
      bouncyLocks(G, 'gary_hair', c.hair, c.hair2, [
        [-0.5, 0.95, [-0.2, 1, 0], [-1, 0.1, 0], 0.22, 0.075],          // swept to his right
        [-1.1, 0.7, [-0.5, 1, -0.1], [-1, -0.15, -0.15], 0.22, 0.07],
        [-1.6, 0.4, [-0.8, 0.6, -0.2], [-1, -0.35, -0.3], 0.2, 0.065],
        [-2.1, 0.15, [-0.8, 0.4, -0.5], [-0.8, 0.1, -0.6], 0.16, 0.06],
        [0, 0.6, [0, 1, 0.35], [-0.6, 0.5, 0.4], 0.16, 0.07],              // the front's tuft, over to his right
        [0.4, 0.9, [0.2, 1, -0.1], [0.4, 0.6, -0.5], 0.16, 0.07],          // on top
        [1.1, 0.65, [0.5, 1, -0.1], [1, 0, -0.2], 0.15, 0.065],            // his left, shorter
        [1.7, 0.3, [0.8, 0.6, -0.3], [0.9, 0.1, -0.4], 0.14, 0.06],
        [Math.PI, 0.6, [0, 0.7, -0.7], [0, 0.35, -1], 0.17, 0.072],        // the back, up and out
        [2.5, 0.35, [0.5, 0.6, -0.7], [0.6, 0.4, -0.8], 0.15, 0.066],
        [-2.6, 0.4, [-0.5, 0.6, -0.7], [-0.6, 0.4, -0.8], 0.16, 0.066],
        [Math.PI, 0.15, [0, 0.3, -1], [0, 0.45, -0.9], 0.13, 0.062],
      ]);
      // the bangs: chunky locks lifting off the forehead and arcing down and over to his right, a
      // row along the hairline and a row further back on the front of the head; stiffer, so they
      // keep off his eyes
      bouncyLocks(G, 'gary_bangs', c.hair, c.hair2, [
        [0.5, 0.55, [0.4, 0.35, 0.85], [-0.45, -0.8, -0.35], 0.17, 0.07],     // along the hairline, down to the brows
        [0.15, 0.55, [0.05, 0.35, 1], [-0.55, -0.8, -0.25], 0.18, 0.075],
        [-0.2, 0.55, [-0.15, 0.35, 1], [-0.6, -0.75, -0.2], 0.18, 0.075],
        [-0.55, 0.5, [-0.45, 0.35, 0.85], [-0.7, -0.7, -0.1], 0.16, 0.068],
        [0.3, 0.85, [0.1, 0.6, 0.8], [-0.6, -0.75, -0.1], 0.17, 0.075],      // further back on the front of the head
        [-0.1, 0.85, [-0.05, 0.6, 0.8], [-0.65, -0.72, -0.08], 0.17, 0.075],
        [-0.5, 0.8, [-0.35, 0.6, 0.7], [-0.75, -0.65, 0], 0.16, 0.07],
      ], { stiff: 1.6 });
    });
  };

  // Gary's scalp: the whole back and top of the head as hair (the base head is only a face mask,
  // the forehead the eye patch's flat-topped block), a shell round a head-shaped volume kept
  // outside the face and the eye patch, standing off it more at the top and back. Its edge is
  // the hairline all round: across the forehead a row of points leaning over to his right (each
  // drops gently from his left and rises steeply on his right), down in front of the ears as
  // pointed sideburns, arching over the ears, and down the back to a pointed nape
  function garyScalp(v, c) {
    const C0 = V(0, 1.18, -0.01), T = [...trisOf(v.meshes.get('face_on_1')), ...trisOf(v.meshes.get('face_on_0'))];
    const NA = 144, NE = 30, TAU2 = TAU;
    const dirOf2 = (az, el) => V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // the skull: an egg a little longer at the back, narrowing below into the neck, never inside
    // the face or the eye patch
    const skull = (d) => {
      const lo = Math.max(0, -d.y), rz = d.z > 0 ? 0.106 : 0.118 * (1 - 0.45 * lo), rx = 0.1 * (1 - 0.4 * lo), ry = d.y > 0 ? 0.128 : 0.11;
      const e = 1 / Math.hypot(d.x / rx, d.y / ry, d.z / rz), h = cast(T, C0, d, 0.25);
      return h == null ? e : Math.max(e, h + 0.004);
    };
    // the hairline's height round the head (|azimuth|), then its points
    const base = (az) => table([[0, 1.238], [0.62, 1.238], [0.92, 1.2], [1.2, 1.155], [1.38, 1.168], [1.5, 1.19], [1.66, 1.165], [1.85, 1.135], [2.2, 1.11], [Math.PI, 1.1]], Math.abs(az));
    const teeth = (az) => {
      const a = Math.abs(az);
      // [count over the whole circle, depth, where in each the point is (0..1)]
      const [n, depth] = a < 0.8 ? [26, 0.03] : a < 1.35 ? [22, 0.034] : a < 1.7 ? [22, 0.008] : [30, 0.026];
      const f = ((az / TAU2 * n + 0.15) % 1 + 1) % 1, fp = 0.3;
      return depth * (f < fp ? f / fp : (1 - f) / (1 - fp)) ** 1.4;
    };
    // the edge's elevation where the skull reaches height y (a few steps of refinement)
    const elAt = (az, y) => {
      let el = -0.5;
      for (let it = 0; it < 12; it++) { const d = dirOf2(az, el), r = skull(d); el += (y - (C0.y + d.y * r)) / Math.max(0.04, r * Math.cos(el)); el = clamp(el, -1.3, 1.5); }
      return el;
    };
    const vol = (el, t) => lerp(0.004, 0.014 + 0.012 * Math.max(0, Math.sin(el)), sstep(0, 0.35, t));   // (t: 0 at the edge, 1 at the top)
    // the sheet from the crown's point (row 0) to the hairline (row NE); pointed, or smooth (for
    // its shading: the points change the outline, not the light on it)
    const sheetOf = (pointed) => {
      const pos = [];
      for (let i = 0; i <= NE; i++) for (let j = 0; j <= NA; j++) {
        const az = (j % NA) / NA * TAU2 - Math.PI, t = 1 - i / NE;
        // the points shape only the band near the edge; above it the hair is smooth
        const el0 = elAt(az, base(az)), el1 = pointed ? elAt(az, base(az) - teeth(az)) : el0, w = 1 - sstep(0, 0.3, t);
        const e = lerp(lerp(el0, el1, w), Math.PI / 2 - 0.001, 1 - (1 - t) ** 1.25), d = dirOf2(az, e), p = C0.clone().addScaledVector(d, skull(d) + vol(e, t));
        pos.push(p.x, p.y, p.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const idx = [];
    for (let i = 0; i < NE; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b2 = a + NA + 1; idx.push(a, a + 1, b2, a + 1, b2 + 1, b2); }
    // facing out: flip if the normals point in
    let smooth = sheetOf(false), dot = 0;
    { const N = smooth.attributes.normal, P = smooth.attributes.position; for (let k = 0; k < N.count; k++) dot += N.getX(k) * (P.getX(k) - C0.x) + N.getY(k) * (P.getY(k) - C0.y) + N.getZ(k) * (P.getZ(k) - C0.z); }
    if (dot < 0) { for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]]; smooth = sheetOf(false); }
    const g = sheetOf(true);
    g.setAttribute('normal', smooth.attributes.normal.clone());
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    v.flat(g, c.hair, head1);
    // the head's underside: skin from just inside the hairline at the sides and the back (behind
    // the jaw, under the ears, the nape) down and in to the top of the neck, so nothing shows
    // through the head there; it goes with the head at the top and the neck at the bottom
    const NU = 6, A0 = 1.0, NJ = 60, neck = (az, y) => V(Math.sin(az) * 0.031, y, -0.008 + Math.cos(az) * 0.031 * 0.95);
    const ug = sheet(NU, NJ, (t, u) => {
      const az = A0 + u * (TAU2 - 2 * A0), d = dirOf2(az, elAt(az, base(az))), top = C0.clone().addScaledVector(d, skull(d) - 0.003);
      const bot = neck(az, 1.09), p = top.clone().lerp(bot, t), out = V(Math.sin(az), 0, Math.cos(az));
      return p.addScaledVector(out, 0.016 * Math.sin(Math.PI * t) * sstep(1.3, 1.9, Math.abs(Math.atan2(Math.sin(az), Math.cos(az))))).toArray();
    }, false);
    v.add(ug, K.flatMat(c.skin, v.SKIN, { name: 'cast_skull', side: THREE.DoubleSide }), (p) => { const t = sstep(1.13, 1.095, p.y); return [['Head', 1 - t], ['Neck', t]]; }, 'skull');
  }

  // spiky hair as separate locks that bounce: each a chunky tapered lock rising from the head in
  // one direction and arcing over into another, on a chain of two cloth bones from the head
  // (garments.js clothSim, and the native game's), stiff enough to hold its shape but sagging a
  // little more under gravity and swinging when the head moves
  function bouncyLocks(G, name, col, col2, list, o = {}) {
    const k = o.stiff ?? 1;
    const c0 = new V3(0, 1.2, -0.012), B = G.build(), N = 12, NC = 10;
    list.forEach(([a, e, d0, d1, len, r0], li) => {
      const out = V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      const p0 = c0.clone().addScaledVector(out, 0.085), p1 = p0.clone().addScaledVector(V(...d0).normalize(), len * 0.55), p2 = p1.clone().addScaledVector(V(...d1).normalize(), len * 0.6);
      const at = (t) => p0.clone().multiplyScalar((1 - t) ** 2).addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t);
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => at(t).toArray());
      const geo = lock(pts, r0, 0.55, 0.0015, N, NC);
      // its two bones: at the root and halfway, the tip beyond
      const bn = [`hr${name}${li}_0`, `hr${name}${li}_1`], mid = at(0.5), tip = at(1);
      G.bone(bn[0], 'Head', p0); G.bone(bn[1], bn[0], mid);
      G.chains.push({ parent: 'Head', bones: bn, tip0: tip, ks: [240 * k, 170 * k], drag: [0.12, 0.16], damp: 2.2 * Math.sqrt(k), vmax: 4, flut: 0.12, cone: [0.32 / k, 0.5 / k],
        hangBone: '', hang: [], quad: false, coll: [{}, {}] });
      const P = geo.attributes.position, U = geo.attributes.uv, base = B.pos.length / 3, p = V();
      for (let i = 0; i < P.count; i++) {
        const t = Math.floor(i / (NC + 1)) / N, wh = 1 - sstep(0, 0.2, t), w1 = (1 - wh) * sstep(0.4, 0.6, t);
        B.v(p.fromBufferAttribute(P, i), [U.getX(i), U.getY(i)], { Head: wh, [bn[0]]: 1 - wh - w1, [bn[1]]: w1 });
      }
      for (const k of geo.index.array) B.idx.push(base + k);
    });
    // coloured darker at the roots, the hair's own colour out to the tips
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    const x = cv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, col2); gr.addColorStop(0.3, col); gr.addColorStop(1, col);
    x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    G.add(B, t, name, true);
  }

  // Delia's hair: the fringe parted in the middle and swept to the sides, an ahoge on top
  function partBangs(p) {
    if (p.z < 0.02 || p.y < 1.12) return;
    const ax0 = Math.abs(p.x), s = Math.sign(p.x) || 1;
    const k = sstep(0.075, 0.0, ax0) * sstep(0.02, 0.06, p.z);
    // lift the middle of the fringe (an inverted V up to the parting) and push it aside
    p.y = Math.max(p.y, lerp(p.y, 1.248 - ax0 * 0.9, k));
    p.x += s * 0.012 * k;
  }
  function deliaHair(v, c) {
    const parts = [], hc = new V3(0, 1.17, -0.005);
    for (const s of [1, -1]) {
      // the two big bangs from the centre parting, curving out over the forehead and down
      // past the outer corners of the eyes
      parts.push(lock([[s * 0.004, 1.275, 0.07], [s * 0.03, 1.252, 0.095], [s * 0.06, 1.215, 0.096], [s * 0.08, 1.17, 0.082], [s * 0.088, 1.125, 0.062]], 0.026, 0.28, 0.004, 14, 12, hc));
      // a lock between them dropping to a point above the inner corner of the eye
      parts.push(lock([[s * 0.008, 1.27, 0.08], [s * 0.022, 1.235, 0.1], [s * 0.03, 1.2, 0.103], [s * 0.034, 1.182, 0.102]], 0.017, 0.3, 0.002, 10, 10, hc));
      // the locks framing the face, in front of the ears down to the jaw
      parts.push(lock([[s * 0.08, 1.24, 0.06], [s * 0.096, 1.18, 0.05], [s * 0.1, 1.12, 0.035], [s * 0.092, 1.075, 0.025]], 0.022, 0.3, 0.004, 12, 10, hc));
    }
    // the ahoge: one strand up from the crown, curling forward and over
    parts.push(lock([[0, 1.3, 0.005], [0.003, 1.335, 0.012], [0.006, 1.362, 0.03], [0.004, 1.37, 0.052], [0.0, 1.36, 0.064]], 0.009, 0.4, 0.0015, 12, 6));
    v.flat(mergeGeos(parts), c.hair, head1);
  }

  return { C, CAST, BUILD };
}
