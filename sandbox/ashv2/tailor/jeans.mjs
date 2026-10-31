// Ash's jeans: a straight-leg trouser block drafted to his measurements, a front and a back piece
// per leg, sewn (side seams, inseams, the front and back crotch seams) and draped on him.
//
// His measurements (tailor/measure.mjs), cm: waist where jeans sit 68, hip 77.5, waist to crotch 20,
// thigh 40, knee 30, waist to ankle 65. Ease: 2 at the waist, 6 at the hip, a 37 knee and a 36 hem
// so the leg falls straight from the seat, not along the calf (and the legs, which he stands with
// close together, don't meet).
import { piece, assemble, sew, tether, simulate, finish } from './cloth.mjs';
import { CM, armSkin, smoothBody } from './body.mjs';

const W = 70, H = 84, HIP = -9, KNEE = -37.5, HEM = -65, KNEE_G = 37, HEM_G = 36;
const XC = -0.006, WAIST_Y = 0.0;                     // his centre line; where the waistband sits (body units)

// the block (left leg; x from the centre front/back toward the side seam, y down from the waist)
export function draft() {
  const fC = -H / 16, fCY = -21.5, fSide = H / 4 - 1, fCrease = (fC + fSide) / 2;
  const front = piece('front',
    [[0.8, 0], [0, HIP], ...curve(0, HIP, fC, fCY), [fCrease - (KNEE_G / 4 - 0.5), KNEE], [fCrease - (HEM_G / 4 - 0.5), HEM]],
    [[0.8 + W / 4 - 0.5, 0], [fSide, HIP], [fSide - 0.3, fCY], [fCrease + (KNEE_G / 4 - 0.5), KNEE], [fCrease + (HEM_G / 4 - 0.5), HEM]],
    { leftParts: { cf: [0, fCY], inseam: [fCY, HEM] }, rightParts: { side: [0, HEM] } });
  const bC = -H / 8, bCY = -22.5, bSide = H / 4 + 1, bCrease = (bC + bSide) / 2;
  const back = piece('back',
    [[2.5, 2.5], [0, HIP], ...curve(0, HIP, bC, bCY), [bCrease - (KNEE_G / 4 + 0.5), KNEE], [bCrease - (HEM_G / 4 + 0.5), HEM]],
    [[2.5 + W / 4 + 0.5, 0], [bSide, HIP], [bSide - 0.3, bCY], [bCrease + (KNEE_G / 4 + 0.5), KNEE], [bCrease + (HEM_G / 4 + 0.5), HEM]],
    { leftParts: { cf: [2.5, bCY], inseam: [bCY, HEM] }, rightParts: { side: [0, HEM] } });
  return { front, back };
}
// a crotch curve: straight down from the hip line, sweeping out to the crotch point
function curve(x0, y0, x1, y1, n = 8) {
  const out = [];
  for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; out.push([x0 + (x1 - x0) * (1 - Math.cos(a)), y0 + (y1 - y0) * Math.sin(a)]); }
  return out;
}

export function makeJeans(body, log) {
  const { front, back } = draft();
  const pieces = [];
  for (const s of ['L', 'R']) for (const p of [front, back]) pieces.push({ ...p, name: p.name + s, side: s === 'L' ? 1 : -1, part: p.name });
  // where each piece starts: wrapped round his half of the body at its height, a little off it
  const arm = (j) => { for (let c = 0; c < 4; c++) { const n = body.names[body.J[j * 4 + c]]; if (body.W[j * 4 + c] > 0.3 && (n.includes('Arm') || n.includes('Hand'))) return true; } return false; };
  const slices = new Map();
  const slice = (Y, sx) => {
    const k = Math.round(Y * 200) + ':' + sx; if (slices.has(k)) return slices.get(k);
    const pts = [];
    for (let j = 0; j < body.n; j++) { const y = body.P[j * 3 + 1]; if (Math.abs(y - Y) > 0.008) continue; const x = body.P[j * 3]; if (sx * (x - XC) < 0 || arm(j)) continue; pts.push([x, body.P[j * 3 + 2]]); }
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const r = { pts, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2 };
    slices.set(k, r); return r;
  };
  const place = (pc, i) => {
    const r = Math.floor(i / (pc.cols + 1)), c = i % (pc.cols + 1), u = c / pc.cols;
    const Y = WAIST_Y + pc.uv[i * 2 + 1] * CM, sl = slice(Math.max(-0.95, Math.min(0.05, Y)), pc.side);
    // front: inner -> front -> outer; back: inner -> back -> outer
    const th = pc.part === 'front' ? -Math.PI / 2 + Math.PI * u : -Math.PI / 2 - Math.PI * u;
    const dx = pc.side * Math.sin(th), dz = Math.cos(th);
    let ext = 0;
    for (const [x, z] of sl.pts) {
      const qx = x - sl.cx, qz = z - sl.cz, d = qx * dx + qz * dz, l = Math.hypot(qx, qz);
      if (d > ext && d > l * Math.cos(0.12)) ext = d;
    }
    // the inner edge above the crotch lies on his centre line (where the two legs' seams meet)
    if (u === 0 && Y > -0.27) { const d = (XC - sl.cx) / (dx || 1e-6); if (d > 0) ext = Math.min(ext || d, d); }
    const gap = u === 0 && Y > -0.27 ? 0.004 : 0.012;
    return [sl.cx + dx * (ext + gap), Y, sl.cz + dz * (ext + gap)];
  };
  const G = assemble(pieces, place);
  for (const s of ['L', 'R']) {
    sew(G, 'front' + s, 'side', 'back' + s, 'side');
    sew(G, 'front' + s, 'inseam', 'back' + s, 'inseam');
  }
  sew(G, 'frontL', 'cf', 'frontR', 'cf');
  sew(G, 'backL', 'cf', 'backR', 'cf');
  // the waistband holds them up: its row stays at its height
  for (const pc of pieces) tether(G, pc.name);
  for (const pc of pieces) for (const i of pc.edges.top) { const k = i + G.off.get(pc.name); G.pins.push([k, null, G.P[k * 3 + 1], null]); }
  const armK = armSkin(body);
  // below the seat each leg stays on its own side of his centre line (no cloth passes through cloth)
  const sideOf = new Int8Array(G.n);
  for (const pc of pieces) for (let i = 0; i < pc.n; i++) sideOf[i + G.off.get(pc.name)] = pc.side;
  const keep = (i, X) => { if (X[i * 3 + 1] < -0.25 && sideOf[i] * (X[i * 3] - XC) < 0.006) X[i * 3] = XC + sideOf[i] * 0.006; };
  simulate(G, body, { keep, steps: +(process.env.STEPS ?? 180), iters: 20, spans: [[2, 0.45], [4, 0.3], [8, 0.2]], collider: smoothBody(body), collideOk: (j) => !armK[j], log });
  // each leg follows its own leg below the seat, and nothing follows the feet
  const CROTCH_Y = -0.2;
  return finish(G, body, {
    allow: (pc, j) => !armK[j] && (body.P[j * 3 + 1] > CROTCH_Y || pc.side * (body.P[j * 3] - XC) > 0),
    apart: (a, b, y) => y < CROTCH_Y && a.side !== b.side,
    // a leg's cloth looks for skin from near the middle of that leg at its own height
    anchor: (pc, p) => {
      if (p[1] > CROTCH_Y + 0.05) return p;
      const s = pc.side > 0 ? 'Left' : 'Right', chain = [body.bind[s + 'UpLeg'], body.bind[s + 'Leg'], body.bind[s + 'Foot']];
      const y = Math.max(chain[2][1], Math.min(chain[0][1], p[1])), k = y > chain[1][1] ? 0 : 1, a = chain[k], b = chain[k + 1], t = (y - a[1]) / (b[1] - a[1]);
      const c = [a[0] + (b[0] - a[0]) * t, p[1], a[2] + (b[2] - a[2]) * t];
      return [c[0] + (p[0] - c[0]) * 0.45, p[1], c[2] + (p[2] - c[2]) * 0.45];
    },
    remap: { LeftFoot: 'LeftLeg', LeftToeBase: 'LeftLeg', LeftToe_End: 'LeftLeg', RightFoot: 'RightLeg', RightToeBase: 'RightLeg', RightToe_End: 'RightLeg' },
  });
}
