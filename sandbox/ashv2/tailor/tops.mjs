// Ash's T-shirt and jacket: a bodice block (back, fronts) with set-in short sleeves, drafted to his
// measurements and sewn on him.
//
// His measurements (tailor/measure.mjs), cm: chest 78, neck 30, across the shoulders 30, the side of
// the neck to the armpit 10.5, shoulder to elbow 19, upper arm 28; the side of his neck is at 0.47.
// The jacket: 12 of ease at the chest, boxy, to the hips, open down the front, short sleeves to above
// the elbow. The shirt under it: 6 of ease, a crew neck, short sleeves.
import { outlinePiece, cubic, bez, len, rev } from './outline.mjs';
import { assemble, sew, simulate, finish } from './cloth.mjs';
import { CM, armSkin, collider, smoothBody } from './body.mjs';

const XC = -0.006, NECK_Y = 0.47;

// the block: d = { chest, neckW (half), backNeck, frontNeck, shoulder (half across), slope,
// scye (side of neck to underarm), length, cap ease, sleeve (length), bicep, hemW, frontW }
export function draftTop(d) {
  const half = d.chest / 4, sh = [d.shoulder, -d.slope], ua = [half, -d.scye];
  // armholes: down from the shoulder, in a little (across the back / chest), out to the underarm
  const armB = cubic(sh, [d.shoulder - 0.4, -d.scye * 0.45], [d.shoulder + 0.2, -d.scye * 0.92], ua);
  const armF = cubic([d.shoulder, -d.slope - 0.5], [d.shoulder - 1.2, -d.scye * 0.5], [d.shoulder - 0.2, -d.scye * 0.95], ua);
  const neckB = bez([0, -d.backNeck], [d.neckW * 0.7, -d.backNeck], [d.neckW, 0]);
  const neckF = bez([0, -d.frontNeck], [d.neckW * 0.9, -d.frontNeck], [d.neckW, 0]);
  const mx = (pl) => pl.map(([x, y]) => [-x, y]);
  const back = outlinePiece('back', [
    { name: 'neckL', pts: neckB },
    { name: 'shoulderL', pts: [[d.neckW, 0], sh] },
    { name: 'armholeL', pts: armB },
    { name: 'sideL', pts: [ua, [half, -d.length]] },
    { name: 'hem', pts: [[half, -d.length], [-half, -d.length]] },
    { name: 'sideR', pts: [[-half, -d.length], [-half, -d.scye]] },
    { name: 'armholeR', pts: rev(mx(armB)) },
    { name: 'shoulderR', pts: [[-d.shoulder, -d.slope], [-d.neckW, 0]] },
    { name: 'neckR', pts: rev(mx(neckB)) },
  ]);
  const frontHalf = (s) => {
    const f = s < 0 ? mx : (pl) => pl;
    const segs = [
      { name: 'neck', pts: f(neckF) },
      { name: 'shoulder', pts: f([[d.neckW, 0], [d.shoulder, -d.slope - 0.5]]) },
      { name: 'armhole', pts: f(armF) },
      { name: 'side', pts: f([ua, [half, -d.length]]) },
      { name: 'hem', pts: f([[half, -d.length], [0, -d.length]]) },
      { name: 'cf', pts: f([[0, -d.length], [0, -d.frontNeck]]) },
    ];
    return segs;
  };
  // the sleeve cap: as long as the armhole it's set into (and a little more), found by its height
  const ah = (len(armB) + len(armF)) / 2, w = d.bicep / 2;
  let capH = 8;
  for (let lo = 2, hi = 16, k = 0; k < 30; k++) { capH = (lo + hi) / 2; const l = len(capCurve(w, capH)); if (l < ah + d.capEase) lo = capH; else hi = capH; }
  const capF = capCurve(w, capH), capB = capF.map(([x, y]) => [-x, y]).reverse();
  const sleeve = outlinePiece('sleeve', [
    { name: 'capBack', pts: capB },
    { name: 'capFront', pts: capF },
    { name: 'underFront', pts: [[w, -capH], [d.hemW / 2, -capH - d.sleeve]] },
    { name: 'hem', pts: [[d.hemW / 2, -capH - d.sleeve], [-d.hemW / 2, -capH - d.sleeve]] },
    { name: 'underBack', pts: [[-d.hemW / 2, -capH - d.sleeve], [-w, -capH]] },
  ]);
  return { back, frontHalf, sleeve, capH, armhole: ah, cap: len(capF), neckF, neckB };
}
// the front half of a sleeve cap, from its top (0, 0) to the underarm (w, -h): an S-curve
function capCurve(w, h) { return cubic([0, 0], [w * 0.45, 0], [w * 0.7, -h * 0.85], [w, -h]); }

// a top on him: pieces wrapped round his torso and arms, sewn, draped
export function makeTop(body, d, o = {}) {
  const D = draftTop(d);
  const pieces = [{ ...D.back, part: 'back' }];
  if (o.openFront) for (const s of [1, -1]) pieces.push({ ...outlinePiece('front' + (s > 0 ? 'L' : 'R'), D.frontHalf(s)), part: 'front', side: s });
  else {
    // a whole front: the two halves joined down the middle
    const L = D.frontHalf(1), R = D.frontHalf(-1);
    const segs = [
      { name: 'neck', pts: rev(R[0].pts).concat(L[0].pts.slice(1)) },
      { name: 'shoulderL', pts: L[1].pts }, { name: 'armholeL', pts: L[2].pts }, { name: 'sideL', pts: L[3].pts },
      { name: 'hem', pts: [L[4].pts[0], [-L[4].pts[0][0], L[4].pts[0][1]]] },
      { name: 'sideR', pts: rev(R[3].pts) }, { name: 'armholeR', pts: rev(R[2].pts) }, { name: 'shoulderR', pts: rev(R[1].pts) },
    ];
    pieces.push({ ...outlinePiece('front', segs), part: 'front', side: 0 });
  }
  for (const s of [1, -1]) pieces.push({ ...D.sleeve, name: 'sleeve' + (s > 0 ? 'L' : 'R'), part: 'sleeve', side: s });
  // a stand collar (open fronts only): a band round the neck from one front edge to the other,
  // which also holds the fronts in to his chest
  const lf = len(D.neckF), lb = len(D.neckB), tot = 2 * (lf + lb);
  if (o.openFront && o.collar) {
    const h = o.collar, at = (x) => [x, 0];
    pieces.push({ ...outlinePiece('collar', [
      { name: 'nFR', pts: [at(0), at(lf)] }, { name: 'nBR', pts: [at(lf), at(lf + lb)] },
      { name: 'nBL', pts: [at(lf + lb), at(lf + 2 * lb)] }, { name: 'nFL', pts: [at(lf + 2 * lb), at(tot)] },
      { name: 'endL', pts: [at(tot), [tot, h]] }, { name: 'top', pts: [[tot, h], [0, h]] }, { name: 'endR', pts: [[0, h], at(0)] },
    ], 0.9), part: 'collar' });
  }

  // ray casting out of him, for where each piece starts
  const army = (j) => { for (let c = 0; c < 4; c++) { const n = body.names[body.J[j * 4 + c]]; if (body.W[j * 4 + c] > 0.3 && (n.includes('Arm') || n.includes('Hand'))) return true; } return false; };
  const torsoPts = [], armPts = { 1: [], [-1]: [] };
  for (let j = 0; j < body.n; j++) {
    const y = body.P[j * 3 + 1]; if (y < -0.25 || y > 0.62) continue;
    const p = [body.P[j * 3], y, body.P[j * 3 + 2]];
    if (army(j)) armPts[p[0] > XC ? 1 : -1].push(p); else torsoPts.push(p);
  }
  const cast = (pts, O, d, ax) => {                     // how far along d (from O) the body reaches
    let best = 0;
    for (const p of pts) {
      const q = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
      if (ax && Math.abs(q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2]) > 0.012) continue;
      if (!ax && Math.abs(q[1]) > 0.012) continue;
      const t = q[0] * d[0] + q[1] * d[1] + q[2] * d[2]; if (t <= best) continue;
      const r2 = q[0] ** 2 + q[1] ** 2 + q[2] ** 2 - t * t; if (r2 < 0.018 ** 2) best = t;
    }
    return best;
  };
  const gap = o.gap ?? 0.02;
  const torsoZ = (Y) => { let lo = 9, hi = -9; for (const p of torsoPts) if (Math.abs(p[1] - Y) < 0.01 && Math.abs(p[0] - XC) < 0.05) { lo = Math.min(lo, p[2]); hi = Math.max(hi, p[2]); } return lo < hi ? (lo + hi) / 2 : 0.03; };
  const zc = new Map();
  const place = (pc, i) => {
    const x = pc.uv[i * 2], y = pc.uv[i * 2 + 1];
    if (pc.part === 'collar') {
      // round his neck from the right front edge, behind, to the left front edge; lower in front
      const th = -(0.26 + (x / tot) * (2 * Math.PI - 0.52)), c = Math.max(0, Math.cos(th));
      const Y = NECK_Y + 0.004 - d.frontNeck * CM * c * c + y * CM, k = Math.round(Y * 100); if (!zc.has(k)) zc.set(k, torsoZ(Y));
      const O = [XC, Y, zc.get(k)], dir = [Math.sin(th), 0, Math.cos(th)], r = cast(torsoPts, O, dir) + gap;
      return [O[0] + dir[0] * r, Y, O[2] + dir[2] * r];
    }
    if (pc.part !== 'sleeve') {
      const Y = NECK_Y + y * CM, k = Math.round(Y * 100); if (!zc.has(k)) zc.set(k, torsoZ(Y));
      const O = [XC, Y, zc.get(k)], half = d.chest / 4;
      // back: centre back straight behind, side seams at the sides; fronts likewise in front
      const th = pc.part === 'back' ? Math.PI - (x / half) * (Math.PI / 2) : (x / half) * (Math.PI / 2);
      const dir = [Math.sin(th), 0, Math.cos(th)], r = cast(torsoPts, O, dir) + gap;
      return [O[0] + dir[0] * r, Y, O[2] + dir[2] * r];
    }
    // sleeves round the arm, from just above the shoulder joint down towards the elbow
    const s = pc.side, A = body.bind[s > 0 ? 'LeftArm' : 'RightArm'], F = body.bind[s > 0 ? 'LeftForeArm' : 'RightForeArm'];
    const ax = norm([F[0] - A[0], F[1] - A[1], F[2] - A[2]]), up = norm(cross(cross(ax, [0, 1, 0]), ax)), fw = norm(cross(ax, up));
    const front = fw[2] > 0 ? fw : fw.map((v) => -v);
    const along = (-y - D.capH * 0.55) * CM, O = A.map((v, k) => v + ax[k] * along);
    const th = (x / (d.bicep / 2)) * Math.PI;           // 0: the top of the arm; towards the front for x > 0
    const dir = up.map((v, k) => v * Math.cos(th) + front[k] * Math.sin(th));
    const r = Math.max(cast(armPts[s], O, dir, ax), 0.03) + gap;
    return O.map((v, k) => v + dir[k] * r);
  };
  const G = assemble(pieces, place);
  const F = o.openFront ? ['frontL', 'frontR'] : ['front', 'front'];
  const FS = o.openFront ? ['', ''] : ['L', 'R'];
  // shoulders and sides (back's L edges run neck->out / top->down, its R edges the other way)
  sew(G, F[0], 'shoulder' + FS[0], 'back', 'shoulderL');
  sew(G, F[1], 'shoulder' + FS[1], 'back', 'shoulderR', !o.openFront ? false : true);
  sew(G, F[0], 'side' + FS[0], 'back', 'sideL');
  sew(G, F[1], 'side' + FS[1], 'back', 'sideR', !o.openFront ? false : true);
  // the sleeves: caps into the armholes, the underarm seams
  for (const [s, k] of [['L', 0], ['R', 1]]) {
    sew(G, 'sleeve' + s, 'capFront', F[k], 'armhole' + FS[k], !o.openFront && s === 'R');
    sew(G, 'sleeve' + s, 'capBack', 'back', 'armhole' + s, s === 'L');
    sew(G, 'sleeve' + s, 'underFront', 'sleeve' + s, 'underBack', true);
  }
  // the body of the top neither rests on nor follows his forearms and hands (they hang by its hem);
  // it rests on the clothes under it (o.under)
  const lower = armSkin(body, 0.3), fore = new Uint8Array(body.n);
  for (let j = 0; j < body.n; j++) for (let c = 0; c < 4; c++) { const nm = body.names[body.J[j * 4 + c]]; if (body.W[j * 4 + c] > 0.3 && (nm.includes('ForeArm') || nm.includes('Hand'))) fore[j] = 1; }
  const smooth = smoothBody(body, 25), K = o.under ? collider(smooth, ...o.under) : smooth;
  if (o.openFront && o.collar) {
    sew(G, 'collar', 'nFR', 'frontR', 'neck');
    sew(G, 'collar', 'nBR', 'back', 'neckR');
    sew(G, 'collar', 'nBL', 'back', 'neckL');
    sew(G, 'collar', 'nFL', 'frontL', 'neck', true);
  }
  simulate(G, body, {
    steps: o.steps ?? 160, iters: 20, bend: o.bend, thick: o.thick ?? 0.3 * CM, gravity: 6, log: o.log, logEvery: o.logEvery,
    collider: K, collideOk: (j) => (j < body.n ? !fore[j] : true),
  });
  // skinning: the bodice from his torso (not his legs: the hem sits over his hips, and would pinch
  // in as his thighs move), the sleeves from his arms
  const m = finish(G, body, {
    allow: (pc, j) => (pc.part === 'sleeve' || pc.part === 'collar' ? true : !lower[j] || body.P[j * 3 + 1] > 0.3),
    remap: { LeftUpLeg: 'Hips', RightUpLeg: 'Hips' },
  });
  m.draft = D;
  return m;
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Ash: the jacket and the T-shirt under it
export const JACKET = { chest: 90, neckW: 4.6, backNeck: 1.6, frontNeck: 7.5, shoulder: 15.8, slope: 2.2, scye: 17.5, length: 41.5, capEase: 1, sleeve: 7, bicep: 33, hemW: 32 };
export const SHIRT = { chest: 84, neckW: 4.2, backNeck: 1.5, frontNeck: 5.5, shoulder: 15.2, slope: 2.4, scye: 16, length: 40, capEase: 0.5, sleeve: 5, bicep: 30.5, hemW: 30 };
