// Where the water cuts the land steeply: the plan of every stream and creek
// bank that gets a designed face (props/banks.js builds it). Pure numbers (no
// three.js, no terrain.js import), so terrain.js can run it at load, like
// edges.js for the cliffs: terrain.js gives it the water lines and the
// ground, and keeps the result (BANKS) for height-free questions: is this
// spot on a bank face (no plants, no walking), how high is the bank here.
//
// A line: { id, pts: [[x, z]...] about 1 m apart, level(f) = the water level
// at fractional vertex index f, w0 = the half width of the bed (where the
// bank starts to rise) }. For each side of each line, every STEP metres
// along it, the cross-section is read off the ground: the toe (where the
// ground comes out of the water, dT), the brim (where the steep part ends,
// dB, at height yB) and how strong a face it needs (k, 0..1: 0 a grassy slope,
// up to 1 a full cut face: k grows with the bank's height above the water and
// its steepness, and is smoothed along the line so it never jumps; a bank
// over ~6 m is a gorge side, left to the ground's own steep-slope paint).
// Runs: the stretches of one side with k > 0, each tapering to 0 at its ends.
export const STEP = 0.5;
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function planBanks(lines, { height, exclude, cross }) {
  const runs = [];
  for (const L of lines) {
    const P = L.pts, n = P.length;
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const len = cum[n - 1], N = Math.floor(len / STEP) + 1;
    // the samples along the line: point, tangent (over +-1.5 m), water level
    const S = [];
    let i = 0;
    const at = (u) => {
      while (i < n - 2 && cum[i + 1] < u) i++;
      while (i > 0 && cum[i] > u) i--;
      const t = Math.min(1, Math.max(0, (u - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i])));
      return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t, i + t];
    };
    for (let j = 0; j < N; j++) {
      const u = j * STEP;
      const [x, z, f] = at(u);
      const [ax, az] = at(Math.max(0, u - 1.5)), [bx, bz] = at(Math.min(len, u + 1.5));
      at(u);
      let tx = bx - ax, tz = bz - az; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      S.push({ u, x, z, tx, tz, wl: L.level(f), c: cross ? cross(x, z) : 0 });
    }
    // crossings (bridges, fords, stepping stones) keep the banks off for 5 m either side
    const cr = S.map((s, j) => { let m = 0; for (let q = Math.max(0, j - 10); q <= Math.min(N - 1, j + 10); q++) m = Math.max(m, S[q].c); return m; });
    for (const side of [-1, 1]) {
      const A = S.map((s, j) => {
        const nx = -s.tz * side, nz = s.tx * side;
        const o = { u: s.u, x: s.x, z: s.z, tx: s.tx, tz: s.tz, nx, nz, wl: s.wl, dT: L.w0 + 0.8, dB: L.w0 + 1.6, yB: s.wl + 0.4, H: 0.4, k: 0 };
        // (quick: a bank under half a metre high needs nothing)
        if (height(s.x + nx * (L.w0 + 3.6), s.z + nz * (L.w0 + 3.6)) - s.wl < 0.5 && height(s.x + nx * (L.w0 + 2.4), s.z + nz * (L.w0 + 2.4)) - s.wl < 0.5) return o;
        const D0 = L.w0 - 0.6, DS = 0.15, M = Math.round(6.6 / DS);
        const h = new Float32Array(M + 1);
        for (let q = 0; q <= M; q++) { const d = D0 + q * DS; h[q] = height(s.x + nx * d, s.z + nz * d); }
        let qT = 0;
        while (qT < M && h[qT] < s.wl + 0.02) qT++;
        // the steepest point above the toe, then the brim where it levels off
        let qP = qT, gP = 0;
        const g = (q) => (h[Math.min(M, q + 2)] - h[Math.max(0, q - 2)]) / ((Math.min(M, q + 2) - Math.max(0, q - 2)) * DS);
        for (let q = qT; q <= Math.min(M, qT + Math.round(3.4 / DS)); q++) { const v = g(q); if (v > gP) { gP = v; qP = q; } }
        let qB = qP;
        while (qB < M && g(qB) > 0.42) qB++;
        o.dT = D0 + qT * DS; o.dB = D0 + qB * DS; o.yB = h[qB]; o.H = o.yB - s.wl;
        const slope = o.H / Math.max(0.25, o.dB - o.dT);
        const bx = s.x + nx * (o.dB + 0.6), bz = s.z + nz * (o.dB + 0.6);
        o.k = sm(0.7, 1.5, o.H) * (1 - sm(5.5, 7.5, o.H)) * sm(0.62, 0.95, slope) * (1 - Math.max(cr[j], exclude(bx, bz, s.x, s.z)));
        return o;
      });
      // smooth along the line: the strength (wide), the brim and toe (a little)
      const k = A.map((_, j) => { let a = 0, w = 0; for (let q = -6; q <= 6; q++) { const r = A[j + q]; if (!r) continue; const wt = Math.exp(-(q * q) / 18); a += r.k * wt; w += wt; } return a / w; });
      const sv = (key) => A.map((_, j) => { let a = 0, w = 0; for (let q = -2; q <= 2; q++) { const r = A[j + q]; if (!r) continue; a += r[key]; w++; } return a / w; });
      const dT = sv('dT'), dB = sv('dB'), yB = sv('yB');
      A.forEach((o, j) => { o.k = k[j]; o.dT = dT[j]; o.dB = Math.max(dB[j], dT[j] + 0.3); o.yB = yB[j]; o.H = o.yB - o.wl; });
      // runs of k > 0, a little padding at their ends (k ~ 0 there)
      let a = -1;
      const flush = (e) => {
        if (a < 0) return;
        const a0 = Math.max(0, a - 2), e0 = Math.min(N - 1, e + 2);
        if (e0 - a0 >= 8 && Math.max(...A.slice(a0, e0 + 1).map((o) => o.k)) > 0.2) runs.push({ id: runs.length, line: L.id, side, s: A.slice(a0, e0 + 1) });
        a = -1;
      };
      for (let j = 0; j < N; j++) { if (A[j].k > 0.04) { if (a < 0) a = j; } else flush(j - 1); }
      flush(N - 1);
    }
  }
  return runs;
}

// Which spots the banks cover: a 0.5 m raster of each run's footprint, from
// the water to a little past the brim. bits: 1 the bank's zone (no plants,
// no grass), 2 its face (no walking: a visibly steep earth face).
export class BankIndex {
  constructor(runs, res = 0.5) {
    this.res = res; this.cells = new Map();
    for (const R of runs) for (let j = 0; j < R.s.length - 1; j++) {
      const A = R.s[j], B = R.s[j + 1];
      for (let t = 0; t <= 1; t += 0.25) {
        const L = (p, q) => p + (q - p) * t;
        const x = L(A.x, B.x), z = L(A.z, B.z), nx = L(A.nx, B.nx), nz = L(A.nz, B.nz), k = L(A.k, B.k), dT = L(A.dT, B.dT), dB = L(A.dB, B.dB);
        if (k < 0.06) continue;
        for (let d = dT - 0.6; d <= dB + 0.7; d += 0.2) {
          let bits = 1;
          if (k > 0.5 && d > dT - 0.15 && d < dB - 0.2) bits |= 2;
          this.mark(x + nx * d, z + nz * d, bits, k);
        }
      }
    }
  }
  key(x, z) { return Math.floor(x / this.res) * 65536 + Math.floor(z / this.res); }
  mark(x, z, bits, k) {
    const q = this.key(x, z), c = this.cells.get(q);
    if (!c) this.cells.set(q, { bits, k });
    else { c.bits |= bits; c.k = Math.max(c.k, k); }
  }
  get(x, z) { return this.cells.get(this.key(x, z)) || null; }
  // anything of a bank within r of (x, z)
  near(x, z, r = 0, bit = 1) {
    const s = this.res, n = Math.ceil(r / s);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
      if (a * a + b * b > (n + 0.5) * (n + 0.5)) continue;
      const c = this.cells.get(this.key(x + a * s, z + b * s));
      if (c && (c.bits & bit)) return true;
    }
    return false;
  }
}
