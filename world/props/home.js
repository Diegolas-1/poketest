// Home, inn and tea house furniture: the Ketchums' house (the kitchen, the
// living room, the entrance), PALLET HOUSE's dining room and the tea house on
// Route 1. Each builder takes the placement P ({params (catalog defaults merged
// with the placement's), size [w, d, h], id}) and returns a group with its
// footprint centred on the origin, standing on y 0, its front toward +z (wall
// props: back on z = -d/2, middle at y 0; ceiling props hang down from y 0;
// top props stand on y 0). Things that glow use the kit's 'unlit' / 'glow'
// materials (the native bake keeps their names).
import * as THREE from 'three';
import { makeBush, TILE } from '../foliage.js';
import { pokeBall } from './furniture.js';
import { rng, hash, shade, mixc, paint, flat, texm, unlit, glow, box, block, cyl, sphere, torus, lathe, rod, plane, extrude, wood, planks, roundRect, haloTex, HEAD, BODY, fitText, put } from './kit.js';

const BRASS = '#d9b45a';
const IRON = '#2f3036';
const CREAM = '#f6efdc';

// ---------- shared painted surfaces ----------
// a woven / printed cloth: 'gingham' (two-tone checks), 'stripe', 'plain', 'lace'
export const cloth = (col, kind = 'gingham', col2 = '#fbf8f0') => paint('cloth' + col + kind + col2, 128, 128, (x, w, h, R) => {
  x.fillStyle = col2; x.fillRect(0, 0, w, h);
  if (kind === 'gingham') {
    const n = 8, s = w / n;
    x.globalAlpha = 0.55; x.fillStyle = col;
    for (let i = 0; i < n; i += 2) { x.fillRect(i * s, 0, s, h); x.fillRect(0, i * s, w, s); }
    x.globalAlpha = 0.45; for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) x.fillRect(i * s, j * s, s, s);
    x.globalAlpha = 1;
  } else if (kind === 'stripe') {
    x.fillStyle = col; for (let i = 0; i < w; i += 32) x.fillRect(i, 0, 14, h);
    x.fillStyle = shade(col, 0.8); for (let i = 0; i < w; i += 32) x.fillRect(i + 18, 0, 3, h);
  } else if (kind === 'lace') {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.65)'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(i * 32 + 16, j * 32 + 16, 10, 0, 6.28); x.stroke(); x.beginPath(); x.arc(i * 32 + 16, j * 32 + 16, 3, 0, 6.28); x.stroke(); }
  } else { x.fillStyle = col; x.fillRect(0, 0, w, h); }
  x.globalAlpha = 0.08; for (let k = 0; k < 300; k++) { x.fillStyle = R() < 0.5 ? '#ffffff' : '#000000'; x.fillRect(R() * w, R() * h, 1.5, 1.5); }
  x.globalAlpha = 1;
});
// a soft fabric with a few folds (sofas, cushions)
const fabric = (col) => paint('fabric' + col, 128, 128, (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, shade(col, 1.05)); g.addColorStop(1, shade(col, 0.93));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.07; for (let k = 0; k < 500; k++) { x.fillStyle = R() < 0.5 ? '#ffffff' : '#000000'; x.fillRect(R() * w, R() * h, 2, 1); }
  x.globalAlpha = 1;
});
// lacquered dark wood with a soft sheen (tea house tables, trays)
const lacquer = (col) => paint('lacq' + col, 128, 128, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 22; k++) { x.globalAlpha = 0.1; x.strokeStyle = R() < 0.5 ? shade(col, 1.4) : shade(col, 0.7); x.lineWidth = 1 + R() * 2; const y0 = R() * h; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + 6, w * 0.6, y0 - 6, w, y0); x.stroke(); }
  x.globalAlpha = 0.18; x.fillStyle = '#ffffff'; x.fillRect(0, h * 0.18, w, 5); x.globalAlpha = 1;
});
const enamel = (col) => paint('enamel' + col, 64, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, shade(col, 0.94)); g.addColorStop(0.35, shade(col, 1.06)); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.62, shade(col, 1.04)); g.addColorStop(1, shade(col, 0.92));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { repeat: false });
const tilesTex = (col, n = 6) => paint('btile' + col + n, 256, 256, (x, w, h, R) => {
  const s = w / n;
  x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? col : shade(col, 1.12 + R() * 0.04); x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(i * s + 4, j * s + 4, s * 0.4, 3); }
});

// ---------- the dining table ----------
// params: wood, cloth (a colour, or null for bare wood), clothKind, round, runner
export function dining_table(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params;
  const wd = p.wood || '#b5784a', top = texm(wood(wd)), leg = texm(wood(shade(wd, 0.9)));
  const round = !!p.round, th = 0.05;
  if (round) {
    cyl(G, w / 2, w / 2, th, top, 0, h - th / 2, 0, { seg: 32 });
    cyl(G, w / 2 - 0.04, w / 2 - 0.04, 0.08, leg, 0, h - th - 0.04, 0, { seg: 28 });
    // a turned pedestal on a cross foot
    lathe(G, [[0, 0.06], [0.1, 0.06], [0.09, 0.12], [0.06, 0.18], [0.075, 0.32], [0.05, 0.46], [0.065, h - 0.16], [0.11, h - 0.12], [0, h - 0.12]], leg, 0, 0, 0, { seg: 16 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const f = box(G, 0.08, 0.07, w * 0.32, leg, Math.sin(a) * w * 0.15, 0.035, Math.cos(a) * w * 0.15); f.rotation.y = a; }
  } else {
    block(G, w, th, d, top, 0, h - th, 0, { uv: 1 });
    // the apron and four turned legs
    for (const s of [-1, 1]) { block(G, w - 0.16, 0.09, 0.03, leg, 0, h - th - 0.09, s * (d / 2 - 0.07)); block(G, 0.03, 0.09, d - 0.16, leg, s * (w / 2 - 0.07), h - th - 0.09, 0); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(G, [[0, 0], [0.026, 0], [0.032, 0.05], [0.024, 0.2], [0.036, 0.36], [0.026, 0.5], [0.034, h - th - 0.1], [0.034, h - th], [0, h - th]], leg, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), { seg: 10 });
  }
  if (p.cloth) {
    // a tablecloth over the top, hanging a hand's width down the sides
    const cm = texm(cloth(p.cloth, p.clothKind || 'gingham'), '#ffffff'), drop = 0.17;
    if (round) {
      cyl(G, w / 2 + 0.03, w / 2 + 0.03, 0.006, cm, 0, h + 0.003, 0, { seg: 32, line: false });
      const sk = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 + 0.03, w / 2 + 0.07, drop, 32, 1, true), texm(cloth(p.cloth, p.clothKind || 'gingham'), '#ffffff', { side: THREE.DoubleSide }));
      put(sk, G, 0, h - drop / 2, 0);
    } else {
      box(G, w + 0.06, 0.006, d + 0.06, cm, 0, h + 0.003, 0, { uv: 1.2 });
      for (const s of [-1, 1]) { box(G, w + 0.06, drop, 0.006, cm, 0, h - drop / 2, s * (d / 2 + 0.03), { uv: 1.2, line: false }); box(G, 0.006, drop, d + 0.06, cm, s * (w / 2 + 0.03), h - drop / 2, 0, { uv: 1.2, line: false }); }
    }
  }
  if (p.runner) box(G, round ? w * 0.3 : w * 0.28, 0.004, round ? w * 0.85 : d + 0.1, texm(cloth(p.runner, 'lace')), 0, h + 0.009, 0, { line: false });
  return G;
}

// ---------- a wooden dining chair (seat at 0.46) ----------
// params: wood, cushion (colour or null), style 'spindle' | 'ladder' | 'cafe'
export function dining_chair(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, sh = 0.44;
  const wd = p.wood || '#a8693e', m = texm(wood(wd)), dk = shade(wd, 0.86);
  // the seat (slightly dished), four legs splayed a touch, stretchers
  extrude(G, roundRect(w, d, 0.05), 0.04, m, 0, sh, d / 2, { rx: -Math.PI / 2, order: 'XYZ' }).position.set(0, sh, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(G, [sx * (w / 2 - 0.05), sh, sz * (d / 2 - 0.05)], [sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035)], 0.02, dk, { seg: 8, r2: 0.016 });
  for (const sz of [-1, 1]) rod(G, [-w / 2 + 0.045, 0.16, sz * (d / 2 - 0.045)], [w / 2 - 0.045, 0.16, sz * (d / 2 - 0.045)], 0.011, dk, { seg: 6, line: false });
  rod(G, [-w / 2 + 0.045, 0.22, 0], [w / 2 - 0.045, 0.22, 0], 0.011, dk, { seg: 6, line: false });
  // the back: two posts up from the back legs, a curved crest rail, spindles or slats
  const bz = -d / 2 + 0.04, top = h - 0.02;
  for (const sx of [-1, 1]) rod(G, [sx * (w / 2 - 0.05), sh, bz], [sx * (w / 2 - 0.06), top, bz - 0.06], 0.019, dk, { seg: 8 });
  const crest = box(G, w - 0.04, 0.09, 0.035, m, 0, top - 0.06, bz - 0.055, { uv: 1 }); crest.rotation.x = -0.12;
  if (p.style === 'ladder') for (const y of [sh + 0.17, sh + 0.31]) box(G, w - 0.12, 0.05, 0.022, m, 0, y, bz - 0.03 * (y - sh) / 0.3, { rx: -0.12 });
  else if (p.style === 'cafe') { const r = box(G, w - 0.12, 0.16, 0.022, m, 0, sh + 0.28, bz - 0.03); r.rotation.x = -0.12; }
  else for (let i = 0; i < 4; i++) { const x = -w / 2 + 0.11 + i * (w - 0.22) / 3; rod(G, [x, sh + 0.03, bz], [x, top - 0.1, bz - 0.05], 0.011, dk, { seg: 6, line: i % 3 === 0 }); }
  if (p.cushion) {
    const c = extrude(G, roundRect(w - 0.06, d - 0.08, 0.07), 0.045, texm(cloth(p.cushion, p.cushionKind || 'gingham')), 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ' });
    c.position.set(0, sh + 0.04, 0.02);
    for (const sx of [-1, 1]) rod(G, [sx * (w / 2 - 0.08), sh + 0.06, bz + 0.03], [sx * (w / 2 - 0.06), sh + 0.1, bz - 0.01], 0.006, shade(p.cushion, 0.8), { seg: 4, line: false });
  }
  return G;
}

// ---------- kitchen units ----------
// base cabinets under a countertop, with doors, drawers and knobs; params:
// body, top, sink (x of a sink, or null), clutter ('cook' | 'tea' | 'bar' | false), seed
export function kitchen_counter(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, R = rng(hash(P.id || 'counter') + (p.seed || 0));
  const body = p.body || '#f2e6c8', topc = p.top || '#e8d8b0';
  const bm = texm(enamel(body), '#ffffff'), tt = texm(tilesTex(topc, p.tileN || 8));
  block(G, w - 0.02, 0.1, d - 0.08, shade(body, 0.55), 0, 0, -0.04);                 // toe kick
  block(G, w, h - 0.14, d - 0.04, bm, 0, 0.1, -0.02);
  block(G, w + 0.04, 0.045, d + 0.03, tt, 0, h - 0.045, 0.01, { uv: 2 });           // tiled top
  box(G, w + 0.05, 0.035, 0.035, shade(topc, 0.75), 0, h - 0.04, d / 2 + 0.025, { line: false });   // the nosing
  const n = Math.max(1, Math.round(w / 0.55)), dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5), sink = p.sink != null && Math.abs(x - p.sink) < dw / 2;
    // a drawer over a door (or a false front under the sink)
    box(G, dw - 0.05, 0.15, 0.022, shade(body, 1.03), x, h - 0.15, d / 2, { line: true });
    if (!sink) box(G, 0.1, 0.018, 0.02, BRASS, x, h - 0.15, d / 2 + 0.018, { line: false });
    box(G, dw - 0.05, h - 0.38, 0.022, shade(body, 1.03), x, 0.1 + (h - 0.38) / 2 + 0.02, d / 2);
    box(G, dw - 0.15, h - 0.5, 0.008, shade(body, 0.94), x, 0.1 + (h - 0.38) / 2 + 0.02, d / 2 + 0.014, { line: false });
    sphere(G, 0.018, BRASS, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), h - 0.42, d / 2 + 0.025, { seg: 8, rings: 6, line: false });
  }
  if (p.sink != null) {
    const sx = p.sink;
    box(G, 0.5, 0.012, 0.38, '#c9cdd2', sx, h + 0.001, 0.02, { line: false });
    box(G, 0.44, 0.02, 0.32, '#6d747c', sx, h + 0.004, 0.02, { line: false });
    box(G, 0.4, 0.004, 0.28, '#9aa3ab', sx, h + 0.012, 0.02, { line: false });
    // the tap: a swan neck and two cross handles
    rod(G, [sx, h, -d / 2 + 0.1], [sx, h + 0.26, -d / 2 + 0.1], 0.016, '#d8dde2', { seg: 8 });
    torus(G, 0.07, 0.014, '#d8dde2', sx, h + 0.26, -d / 2 + 0.17, { arc: Math.PI, ry: Math.PI / 2, ts: 10, rs: 5 });
    for (const s of [-1, 1]) { rod(G, [sx + s * 0.09, h, -d / 2 + 0.1], [sx + s * 0.09, h + 0.07, -d / 2 + 0.1], 0.012, '#d8dde2', { seg: 6 }); box(G, 0.07, 0.012, 0.012, '#d8dde2', sx + s * 0.09, h + 0.075, -d / 2 + 0.1, { line: false }); }
  }
  const T = h;
  const cl = p.clutter;
  if (cl === 'cook') {
    // a chopping board with a knife and vegetables, a crock of utensils, canisters, a dish rack
    const bx = (p.sink != null ? (p.sink > 0 ? -w * 0.22 : w * 0.22) : -w * 0.2);
    block(G, 0.42, 0.025, 0.28, texm(wood('#d9b07a')), bx, T, 0.04, { ry: 0.12 });
    box(G, 0.2, 0.004, 0.035, '#d9dde2', bx + 0.08, T + 0.03, 0.12, { ry: 0.3, line: false });
    box(G, 0.09, 0.016, 0.03, '#3a2a20', bx - 0.06, T + 0.032, 0.15, { ry: 0.3, line: false });
    sphere(G, 0.045, '#e8473a', bx - 0.1, T + 0.07, 0.0, { seg: 10, rings: 8 });           // a tomato
    sphere(G, 0.04, '#e8473a', bx - 0.02, T + 0.065, -0.05, { seg: 10, rings: 8 });
    cyl(G, 0.02, 0.012, 0.18, '#ef8a2e', bx + 0.1, T + 0.045, -0.04, { rz: Math.PI / 2, ry: 0.4, seg: 8 });   // a carrot
    for (let k = 0; k < 3; k++) rod(G, [bx + 0.18 + k * 0.004, T + 0.04, -0.04], [bx + 0.24 + k * 0.01, T + 0.06 + k * 0.01, -0.06 + k * 0.012], 0.004, '#5fa84a', { seg: 4, line: false });
    const cx = w / 2 - 0.16;
    cyl(G, 0.07, 0.06, 0.16, '#3f7aa8', cx, T + 0.08, -d / 2 + 0.16, { seg: 14 });
    for (const [a, c] of [[0.2, '#c9a06a'], [-0.15, '#9aa3ab'], [0.05, '#7a5234']]) rod(G, [cx, T + 0.1, -d / 2 + 0.16], [cx + Math.sin(a) * 0.06, T + 0.36, -d / 2 + 0.16 + Math.cos(a) * 0.03], 0.009, c, { seg: 5 });
    for (let k = 0; k < 3; k++) { const s = 0.07 - k * 0.012; cyl(G, s, s, 0.2 - k * 0.04, ['#e8e2d2', '#f4b8a8', '#bfe0d0'][k], -w / 2 + 0.14 + k * 0.17, T + (0.2 - k * 0.04) / 2, -d / 2 + 0.14, { seg: 14 }); cyl(G, s + 0.005, s + 0.005, 0.025, '#c9563f', -w / 2 + 0.14 + k * 0.17, T + 0.2 - k * 0.04 + 0.012, -d / 2 + 0.14, { seg: 14, line: false }); }
    if (p.sink != null) {
      const rx = p.sink + (p.sink > 0 ? -0.5 : 0.5);
      block(G, 0.34, 0.02, 0.26, '#d8dde2', rx, T, 0.0, { line: false });
      for (let k = 0; k < 4; k++) cyl(G, 0.11, 0.11, 0.012, CREAM, rx - 0.12 + k * 0.07, T + 0.12, 0.0, { rz: Math.PI / 2 - 0.15, seg: 18 });
      cyl(G, 0.04, 0.035, 0.09, '#e05a4a', rx + 0.1, T + 0.065, 0.06, { seg: 12 });
    }
  } else if (cl === 'tea') {
    for (let i = 0; i < 4; i++) { const x = -w / 2 + 0.3 + i * 0.12; cyl(G, 0.04, 0.032, 0.07, i % 2 ? '#e8e2d2' : '#7a9a6a', x, T + 0.035, -0.06, { seg: 10 }); }
  } else if (cl === 'bar') {
    for (let i = 0; i < 3; i++) cyl(G, 0.06, 0.05, 0.1, CREAM, -w / 2 + 0.25 + i * 0.16, T + 0.05, -0.1, { seg: 12 });
  }
  return G;
}

// a cream enamel range: four burners, an oven with a window, knobs, a backguard
// with a clock; a stock pot and the red kettle on the burners
export function stove(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.color || '#f4ead0';
  const em = texm(enamel(col), '#ffffff');
  block(G, w, h - 0.06, d, em, 0, 0.06, 0);
  block(G, w - 0.04, 0.06, d - 0.06, shade(col, 0.5), 0, 0, -0.02);
  block(G, w + 0.02, 0.03, d + 0.01, shade(col, 1.05), 0, h - 0.03, 0);
  // the cooktop: four black burner grates
  const bt = h + 0.002;
  for (const [x, z, r] of [[-w * 0.24, d * 0.18, 0.1], [w * 0.24, d * 0.18, 0.08], [-w * 0.24, -d * 0.2, 0.08], [w * 0.24, -d * 0.2, 0.1]]) {
    cyl(G, r + 0.025, r + 0.025, 0.012, '#26272c', x, bt + 0.006, z, { seg: 20, line: false });
    torus(G, r, 0.01, '#3a3b42', x, bt + 0.016, z, { rx: Math.PI / 2, ts: 20, rs: 4, line: false });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; box(G, r * 2, 0.012, 0.012, '#3a3b42', x, bt + 0.02, z, { ry: a, line: false }); }
  }
  // the oven door: a handle bar, a dark window with a warm glow inside
  box(G, w - 0.08, h * 0.5, 0.03, shade(col, 1.04), 0, 0.08 + h * 0.26, d / 2 + 0.01);
  box(G, w * 0.55, h * 0.2, 0.01, unlit(null, '#4a2a1e'), 0, 0.08 + h * 0.27, d / 2 + 0.027, { line: false });
  box(G, w * 0.5, h * 0.06, 0.006, unlit(null, '#e87a3a'), 0, 0.08 + h * 0.21, d / 2 + 0.031, { line: false });
  rod(G, [-w * 0.34, 0.08 + h * 0.48, d / 2 + 0.06], [w * 0.34, 0.08 + h * 0.48, d / 2 + 0.06], 0.014, '#d8dde2', { seg: 8 });
  for (const s of [-1, 1]) rod(G, [s * w * 0.34, 0.08 + h * 0.48, d / 2 + 0.06], [s * w * 0.34, 0.08 + h * 0.48, d / 2 + 0.015], 0.01, '#d8dde2', { seg: 6, line: false });
  // the knob rail
  for (let k = 0; k < 4; k++) cyl(G, 0.024, 0.024, 0.03, '#2f3036', -w * 0.3 + k * w * 0.2, h - 0.1, d / 2 + 0.015, { rx: Math.PI / 2, seg: 10 });
  // the backguard with a little clock
  block(G, w, 0.2, 0.05, em, 0, h, -d / 2 + 0.025);
  cyl(G, 0.055, 0.055, 0.012, '#fbf8ee', 0, h + 0.1, -d / 2 + 0.056, { rx: Math.PI / 2, seg: 16, line: false });
  torus(G, 0.058, 0.008, BRASS, 0, h + 0.1, -d / 2 + 0.058, { ts: 18, rs: 4, line: false });
  // a stock pot with a lid, the red kettle
  if (p.pots !== false) {
    const px = -w * 0.24, pz = d * 0.18;
    cyl(G, 0.13, 0.12, 0.17, '#c9cdd2', px, bt + 0.11, pz, { seg: 20 });
    cyl(G, 0.135, 0.135, 0.015, '#d8dde2', px, bt + 0.2, pz, { seg: 20 });
    sphere(G, 0.02, IRON, px, bt + 0.215, pz, { seg: 8, rings: 6, line: false });
    for (const s of [-1, 1]) box(G, 0.05, 0.015, 0.02, IRON, px + s * 0.15, bt + 0.17, pz, { line: false });
    const kx = w * 0.24, kz = -d * 0.2;
    lathe(G, [[0, 0], [0.09, 0], [0.105, 0.04], [0.1, 0.1], [0.06, 0.15], [0.025, 0.16], [0, 0.16]], p.kettle || '#d8473a', kx, bt + 0.02, kz, { seg: 18 });
    rod(G, [kx + 0.07, bt + 0.08, kz], [kx + 0.17, bt + 0.15, kz], 0.014, p.kettle || '#d8473a', { seg: 6, r2: 0.008 });
    torus(G, 0.065, 0.011, IRON, kx, bt + 0.19, kz, { arc: Math.PI, ts: 12, rs: 5 });
  }
  return G;
}

// an old rounded fridge: freezer over the fridge, chrome handles, magnets and a
// child's drawing, a note
export function fridge(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.color || '#f7f3e6';
  const em = texm(enamel(col), '#ffffff');
  const body = extrude(G, roundRect(w, h, 0.09, 0, h / 2), d - 0.04, em, 0, 0, -d / 2, { curve: 6 });
  void body;
  // the door split, the handles (vertical chrome bars)
  box(G, w - 0.04, 0.012, 0.012, shade(col, 0.7), 0, h * 0.68, d / 2 - 0.03, { line: false });
  for (const [y0, y1] of [[h * 0.74, h * 0.9], [h * 0.4, h * 0.62]]) {
    rod(G, [w / 2 - 0.08, y0, d / 2 + 0.02], [w / 2 - 0.08, y1, d / 2 + 0.02], 0.016, '#e2e6ea', { seg: 8 });
    for (const y of [y0, y1]) rod(G, [w / 2 - 0.08, y, d / 2 + 0.02], [w / 2 - 0.08, y, d / 2 - 0.04], 0.012, '#e2e6ea', { seg: 6, line: false });
  }
  block(G, w - 0.1, 0.06, d - 0.1, '#5a5048', 0, 0, -0.03);
  // a drawing held by magnets, a note, a few fruit magnets
  const art = paint('fridge_art', 128, 128, (x, W, H) => {
    x.fillStyle = '#fffdf6'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(W * 0.8, H * 0.2, 14, 0, 6.28); x.fill();
    x.strokeStyle = '#ffd23a'; x.lineWidth = 3; for (let k = 0; k < 8; k++) { const a = k * 0.785; x.beginPath(); x.moveTo(W * 0.8 + Math.cos(a) * 18, H * 0.2 + Math.sin(a) * 18); x.lineTo(W * 0.8 + Math.cos(a) * 26, H * 0.2 + Math.sin(a) * 26); x.stroke(); }
    x.fillStyle = '#7ac46a'; x.fillRect(0, H * 0.78, W, H * 0.22);
    // a red-roofed house and two stick people, crayon style
    x.fillStyle = '#a9cbe8'; x.fillRect(W * 0.12, H * 0.5, W * 0.34, H * 0.28);
    x.fillStyle = '#e0473e'; x.beginPath(); x.moveTo(W * 0.08, H * 0.52); x.lineTo(W * 0.29, H * 0.32); x.lineTo(W * 0.5, H * 0.52); x.fill();
    x.strokeStyle = '#3a3a48'; x.lineWidth = 3;
    for (const [cx, s] of [[0.62, 1], [0.8, 0.75]]) { x.beginPath(); x.arc(W * cx, H * (0.5 + (1 - s) * 0.2), 7 * s, 0, 6.28); x.moveTo(W * cx, H * (0.55 + (1 - s) * 0.2)); x.lineTo(W * cx, H * 0.72); x.moveTo(W * cx - 10 * s, H * 0.62); x.lineTo(W * cx + 10 * s, H * 0.62); x.moveTo(W * cx, H * 0.72); x.lineTo(W * cx - 7, H * 0.8); x.moveTo(W * cx, H * 0.72); x.lineTo(W * cx + 7, H * 0.8); x.stroke(); }
    x.fillStyle = '#e0473e'; x.font = `700 15px ${BODY}`; x.fillText('MOM', W * 0.56, H * 0.36);
  }, { repeat: false });
  plane(G, 0.24, 0.24, texm(art), -0.08, h * 0.5, d / 2 + 0.003, { rz: 0.05, line: false });
  plane(G, 0.13, 0.16, flat('#fff6a8'), 0.14, h * 0.8, d / 2 + 0.003, { rz: -0.08, line: false });
  for (const [x, y, c] of [[-0.08, h * 0.62, '#e8473a'], [0.14, h * 0.88, '#3f8ad0'], [-0.2, h * 0.38, '#f6c23a'], [0.05, h * 0.3, '#5fae5a']]) sphere(G, 0.022, c, x, y, d / 2 + 0.008, { seg: 8, rings: 6, line: false });
  return G;
}

// wall cupboards: panelled doors and one with glass, cups and plates inside;
// params body, glass (index of the glass door or -1)
export function wall_cabinets(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.body || '#f2e6c8';
  const back = -d / 2, bm = texm(enamel(col), '#ffffff');
  box(G, w, h, d - 0.02, bm, 0, 0, back + (d - 0.02) / 2);
  box(G, w + 0.04, 0.04, d + 0.02, shade(col, 0.92), 0, h / 2 + 0.02, back + d / 2);
  const n = Math.max(1, Math.round(w / 0.45)), dw = w / n, gi = p.glass ?? 1;
  const inside = paint('cupboard_in', 128, 128, (x, W, H) => {
    x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, W, H); x.fillStyle = '#c9b48e'; x.fillRect(0, H / 2 - 3, W, 6);
    for (let k = 0; k < 4; k++) { x.fillStyle = ['#f8f4ea', '#a8d0e8', '#f8f4ea', '#f4c8b8'][k]; x.beginPath(); x.ellipse(16 + k * 32, H / 2 - 16, 13, 14, 0, 0, 6.28); x.fill(); x.strokeStyle = 'rgba(0,0,0,.2)'; x.stroke(); }
    for (let k = 0; k < 5; k++) { x.fillStyle = ['#e05a4a', '#f8f4ea', '#4a8ad0', '#f6d65a', '#f8f4ea'][k]; x.fillRect(8 + k * 24, H - 30, 16, 22); x.fillRect(22 + k * 24, H - 24, 5, 10); }
  }, { repeat: false });
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5), z = back + d + 0.005;
    box(G, dw - 0.04, h - 0.06, 0.02, shade(col, 1.03), x, 0, z);
    if (i === gi) { plane(G, dw - 0.16, h - 0.2, unlit(inside, '#e8e4dc'), x, 0, z + 0.012, { line: false }); for (const yy of [-0.01]) box(G, dw - 0.14, 0.02, 0.01, shade(col, 1.03), x, yy, z + 0.016, { line: false }); }
    else box(G, dw - 0.15, h - 0.2, 0.008, shade(col, 0.94), x, 0, z + 0.013, { line: false });
    sphere(G, 0.016, BRASS, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), -h / 2 + 0.08, z + 0.02, { seg: 8, rings: 6, line: false });
  }
  return G;
}

// a hood over the stove, a warm light under it (wall prop)
export function range_hood(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, col = P.params.color || '#f4ead0', back = -d / 2;
  const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w * 0.22, h / 2); s.lineTo(-w * 0.22, h / 2); s.lineTo(-w / 2, -h / 2);
  const m = extrude(G, s, d, texm(enamel(col), '#ffffff'), 0, 0, back); void m;
  box(G, w + 0.03, 0.05, d + 0.02, shade(col, 0.92), 0, -h / 2 + 0.025, back + d / 2);
  plane(G, w * 0.5, d * 0.5, unlit(null, '#fff2c8'), 0, -h / 2 - 0.001, back + d / 2, { rx: Math.PI / 2, line: false });
  return G;
}

// ---------- the living room ----------
// a CRT television on a low cabinet with a video player and its rabbit ears
export function tv_set(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params;
  const cab = texm(wood(p.wood || '#8a5a36')), ch = 0.45;
  block(G, w, ch, d, cab, 0, 0.04, 0, { uv: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(G, 0.025, 0.02, 0.04, IRON, sx * (w / 2 - 0.06), 0.02, sz * (d / 2 - 0.06), { seg: 8, line: false });
  for (const s of [-1, 1]) { box(G, w / 2 - 0.04, ch - 0.18, 0.02, shade(p.wood || '#8a5a36', 1.1), s * w / 4, 0.04 + ch / 2 - 0.05, d / 2); sphere(G, 0.016, BRASS, s * 0.05, 0.04 + ch / 2 - 0.05, d / 2 + 0.015, { seg: 8, rings: 6, line: false }); }
  // the video player on top of the doors' shelf
  block(G, w * 0.52, 0.08, d * 0.7, '#2e3038', -w * 0.18, 0.04 + ch - 0.12, d * 0.08, { line: true });
  box(G, w * 0.2, 0.012, 0.01, '#5a5e68', -w * 0.25, 0.04 + ch - 0.08, d * 0.43 + 0.001, { line: false });
  box(G, 0.04, 0.012, 0.01, '#5fe08a', -w * 0.02, 0.04 + ch - 0.085, d * 0.43 + 0.001, { line: false });
  // the set: a deep rounded box, a dark bezel, a bright picture
  const tw = Math.min(w * 0.72, 0.68), th = tw * 0.82, ty = 0.04 + ch, tz = -0.02;
  extrude(G, roundRect(tw, th, 0.07, 0, th / 2), d * 0.82, texm(enamel(p.color || '#c9c4bc'), '#ffffff'), 0, ty, tz - d * 0.41, { curve: 5 });
  box(G, tw * 0.62, th * 0.5, d * 0.5, '#9a958e', 0, ty + th * 0.5, tz - d * 0.55);
  extrude(G, roundRect(tw * 0.78, th * 0.7, 0.06, 0, 0), 0.02, '#2a2c32', -tw * 0.05, ty + th * 0.52, tz + d * 0.41, { curve: 5 });
  const pic = paint('tv_' + (p.show || 'league'), 160, 120, (x, W, H) => {
    // the POKéMON LEAGUE on the TV: a stadium, a battle field, two silhouettes, a banner
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5fb0f0'); g.addColorStop(1, '#c8ecff'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#e0473e'; x.fillRect(0, H * 0.32, W, H * 0.1); x.fillStyle = '#ffffff'; x.font = `400 13px ${HEAD}`; x.textAlign = 'center'; x.fillText('POKéMON LEAGUE', W / 2, H * 0.41);
    x.fillStyle = '#8acb5a'; x.fillRect(0, H * 0.62, W, H * 0.38); x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.strokeRect(W * 0.12, H * 0.66, W * 0.76, H * 0.3); x.beginPath(); x.arc(W / 2, H * 0.81, 10, 0, 6.28); x.stroke();
    x.fillStyle = '#f6d24a'; x.beginPath(); x.ellipse(W * 0.3, H * 0.6, 12, 14, 0, 0, 6.28); x.fill();
    x.fillStyle = '#7a62c8'; x.beginPath(); x.ellipse(W * 0.72, H * 0.58, 15, 17, 0, 0, 6.28); x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.ellipse(W * 0.3, H * 0.15, 30, 10, 0, 0, 6.28); x.fill();
    x.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
  }, { repeat: false });
  plane(G, tw * 0.66, th * 0.58, unlit(pic, '#f2f2f2'), -tw * 0.05, ty + th * 0.52, tz + d * 0.41 + 0.022, { line: false });
  // the knobs and speaker grille on the right
  for (let k = 0; k < 2; k++) cyl(G, 0.024, 0.024, 0.02, '#4a4c54', tw * 0.38, ty + th * (0.7 - k * 0.2), tz + d * 0.41 + 0.01, { rx: Math.PI / 2, seg: 10, line: false });
  for (let k = 0; k < 4; k++) box(G, 0.07, 0.008, 0.006, '#6a6c74', tw * 0.38, ty + th * 0.3 - k * 0.022, tz + d * 0.41 + 0.004, { line: false });
  // a game console on the floor in front, a controller on its cord
  if (p.console) {
    const cz = d / 2 + 0.22;
    block(G, 0.28, 0.07, 0.2, '#6a6c78', -0.15, 0, cz, { line: true });
    box(G, 0.16, 0.012, 0.1, '#4a4c58', -0.15, 0.075, cz - 0.02, { line: false });
    cyl(G, 0.012, 0.012, 0.01, '#e0473e', -0.04, 0.075, cz + 0.06, { seg: 8, line: false });
    const C = new THREE.Group(); C.position.set(0.25, 0.02, cz + 0.32); C.rotation.y = 0.5; G.add(C);
    box(C, 0.16, 0.035, 0.07, '#5a5c68', 0, 0, 0);
    for (const sx of [-1, 1]) { const h2 = box(C, 0.05, 0.03, 0.08, '#5a5c68', sx * 0.07, 0, 0.04); h2.rotation.y = sx * 0.3; }
    for (const [x, c] of [[0.035, '#e0473e'], [0.06, '#3f8ad0']]) cyl(C, 0.01, 0.01, 0.01, c, x, 0.02, 0, { seg: 6, line: false });
    rod(G, [-0.1, 0.02, cz + 0.1], [0.18, 0.012, cz + 0.28], 0.004, '#2a2a2e', { seg: 3, line: false });
  }
  // rabbit ears
  cyl(G, 0.05, 0.06, 0.03, '#3a3c44', 0.04, ty + th + 0.015, tz, { seg: 12 });
  for (const a of [-0.45, 0.5]) rod(G, [0.04, ty + th + 0.03, tz], [0.04 + Math.sin(a) * 0.32, ty + th + 0.03 + Math.cos(a) * 0.32, tz - 0.05], 0.005, '#c9cdd2', { seg: 4 });
  return G;
}

// a homely sofa: rolled arms, two seat cushions, plump pillows, a knitted throw
export function home_sofa(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.color || '#e9a35a';
  const fm = texm(fabric(col)), dk = texm(fabric(shade(col, 0.86)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(G, [[0, 0], [0.03, 0], [0.025, 0.1], [0, 0.1]], '#6a4630', sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.1), { seg: 8 });
  block(G, w - 0.04, 0.22, d - 0.04, dk, 0, 0.1, 0);
  const aw = 0.18, inner = w - 2 * aw, n = p.seats || 2, sw = inner / n;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + sw * (i + 0.5);
    const c = extrude(G, roundRect(sw - 0.02, d - 0.26, 0.07), 0.15, fm, 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ', curve: 4 }); c.position.set(x, 0.32, 0.11);
    const b = extrude(G, roundRect(sw - 0.03, 0.5, 0.09, 0, 0.25), 0.2, fm, x, 0.3, -d / 2 + 0.02, { rx: -0.14, curve: 4 }); void b;
  }
  for (const s of [-1, 1]) {
    block(G, aw, 0.36, d - 0.02, fm, s * (w / 2 - aw / 2), 0.28, 0);
    cyl(G, aw / 2 + 0.03, aw / 2 + 0.03, d - 0.02, fm, s * (w / 2 - aw / 2), 0.64, 0, { rx: Math.PI / 2, seg: 14 });
  }
  // pillows, a little tilted, and a knitted throw folded over one arm
  const pc = p.pillows || ['#f4e3b8', '#e8706a'];
  pc.forEach((c, i) => {
    const s = i ? 1 : -1, pg = new THREE.Group(); pg.position.set(s * (inner / 2 - 0.2), 0.47, -d / 2 + 0.27); pg.rotation.set(-0.28, -s * 0.3, s * 0.1); G.add(pg);
    extrude(pg, roundRect(0.38, 0.36, 0.12, 0, 0.18), 0.12, texm(cloth(c, i ? 'stripe' : 'gingham', '#fbf8f0')), 0, 0, -0.06, { curve: 5 });
  });
  const tm = texm(cloth(p.throw || '#7aa6d8', 'stripe', '#f6efe0')), ax = w / 2 - aw / 2, ty = 0.64 + aw / 2 + 0.035;
  box(G, aw + 0.1, 0.025, 0.5, tm, ax, ty, 0.05, { line: true });
  box(G, 0.02, 0.36, 0.5, tm, ax + aw / 2 + 0.05, ty - 0.18, 0.05, { line: false });
  box(G, 0.02, 0.2, 0.5, tm, ax - aw / 2 - 0.05, ty - 0.1, 0.05, { line: false });
  return G;
}

// an armchair with a round seat cushion and a lace antimacassar
export function armchair(P) {
  const G = new THREE.Group(), [w, d] = P.size, p = P.params, col = p.color || '#c8604a', fm = texm(fabric(col));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(G, [[0, 0], [0.025, 0], [0.02, 0.1], [0, 0.1]], '#6a4630', sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), { seg: 8 });
  block(G, w - 0.04, 0.3, d - 0.04, fm, 0, 0.1, 0);
  const c = extrude(G, roundRect(w - 0.32, d - 0.24, 0.08), 0.12, fm, 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ', curve: 4 }); c.position.set(0, 0.4, 0.1);
  extrude(G, roundRect(w - 0.1, 0.56, 0.18, 0, 0.28), 0.18, fm, 0, 0.34, -d / 2 + 0.02, { rx: -0.12, curve: 5 });
  for (const s of [-1, 1]) { block(G, 0.15, 0.3, d - 0.04, fm, s * (w / 2 - 0.08), 0.32, 0); cyl(G, 0.09, 0.09, d - 0.04, fm, s * (w / 2 - 0.08), 0.62, 0, { rx: Math.PI / 2, seg: 12 }); }
  box(G, 0.3, 0.2, 0.012, texm(cloth('#f8f4ea', 'lace', '#ffffff')), 0, 0.82, -d / 2 + 0.17, { rx: -0.12, line: false });
  return G;
}

// a low wooden coffee table with a magazine, the remote and a mug
export function coffee_table(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, wd = p.wood || '#a8693e', m = texm(wood(wd));
  extrude(G, roundRect(w, d, 0.08), 0.04, m, 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ' }).position.set(0, h - 0.04, 0);
  block(G, w - 0.12, 0.02, d - 0.12, shade(wd, 0.9), 0, 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(G, [sx * (w / 2 - 0.08), h - 0.04, sz * (d / 2 - 0.08)], [sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07)], 0.022, shade(wd, 0.85), { seg: 8, r2: 0.016 });
  if (p.clutter !== false) {
    const mag = paint('magazine', 64, 80, (x, W, H) => { x.fillStyle = '#f4f0e6'; x.fillRect(0, 0, W, H); x.fillStyle = '#e0473e'; x.fillRect(0, 0, W, 18); x.fillStyle = '#ffffff'; x.font = `400 11px ${HEAD}`; x.fillText('TRAINER', 6, 13); x.fillStyle = '#f6d24a'; x.beginPath(); x.arc(W / 2, H * 0.6, 14, 0, 6.28); x.fill(); }, { repeat: false });
    box(G, 0.21, 0.008, 0.28, texm(mag), -w * 0.22, h + 0.004, 0.02, { ry: 0.25, line: false });
    box(G, 0.05, 0.02, 0.16, '#2e3038', w * 0.05, h + 0.01, 0.08, { ry: -0.5 });
    cyl(G, 0.04, 0.036, 0.09, '#f4f0e6', w * 0.28, h + 0.045, -0.06, { seg: 12 });
    torus(G, 0.025, 0.008, '#f4f0e6', w * 0.28 + 0.045, h + 0.05, -0.06, { ry: Math.PI / 2, ts: 10, rs: 4, line: false });
  }
  return G;
}

// a little round side table with a doily (a vase or a lamp goes on it)
export function side_table(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params, wd = p.wood || '#9a6a40', m = texm(wood(wd));
  cyl(G, w / 2, w / 2, 0.03, m, 0, h - 0.015, 0, { seg: 24 });
  cyl(G, w / 2 - 0.03, w / 2 - 0.03, 0.06, m, 0, h - 0.06, 0, { seg: 20 });
  for (let k = 0; k < 3; k++) { const a = k * 2.094; rod(G, [Math.sin(a) * w * 0.3, h - 0.06, Math.cos(a) * w * 0.3], [Math.sin(a) * w * 0.42, 0, Math.cos(a) * w * 0.42], 0.018, shade(wd, 0.86), { seg: 8, r2: 0.012 }); }
  cyl(G, w * 0.32, w * 0.32, 0.02, m, 0, h * 0.35, 0, { seg: 18 });
  cyl(G, w * 0.36, w * 0.36, 0.003, texm(cloth('#fbf8f0', 'lace', '#ffffff')), 0, h + 0.002, 0, { seg: 24, line: false });
  return G;
}

// ---------- flowers ----------
function bloom(G, x, y, z, kind, col, s = 1) {
  if (kind === 'daisy') {
    for (let k = 0; k < 7; k++) { const a = k * 0.9; const pm = box(G, 0.012 * s, 0.004, 0.045 * s, '#fbfaf2', x + Math.sin(a) * 0.022 * s, y, z + Math.cos(a) * 0.022 * s, { ry: a, line: false }); void pm; }
    sphere(G, 0.012 * s, '#f6c23a', x, y + 0.004, z, { seg: 8, rings: 5, line: false });
  } else if (kind === 'tulip') {
    const t = sphere(G, 0.028 * s, col, x, y, z, { seg: 10, rings: 8 }); t.scale.set(1, 1.35, 1);
  } else {
    // a rose: a ball and a few petals round it
    sphere(G, 0.026 * s, col, x, y, z, { seg: 10, rings: 8 });
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.3; const pt = sphere(G, 0.018 * s, shade(col, 1.08), x + Math.sin(a) * 0.018 * s, y - 0.006, z + Math.cos(a) * 0.018 * s, { seg: 8, rings: 6, line: false }); pt.scale.set(1, 0.7, 1); }
  }
}
// a vase of flowers (top prop): params vase, flowers [colour...], kind 'mixed' | 'tulip' | 'rose' | 'daisy'
export function flower_vase(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params, R = rng(hash(P.id || 'vase') + (p.seed || 0));
  const vh = h * 0.42, vr = w * 0.26, vc = p.vase || '#7ab0d8';
  lathe(G, [[0, 0], [vr * 0.7, 0], [vr, vh * 0.28], [vr * 0.95, vh * 0.6], [vr * 0.55, vh * 0.86], [vr * 0.62, vh], [vr * 0.5, vh], [0, vh * 0.8]], texm(enamel(vc), '#ffffff'), 0, 0, 0, { seg: 18 });
  const cols = p.flowers || ['#f08aa6', '#f6d24a', '#fbfaf2', '#e8473a', '#c890e0'];
  const n = p.n || 9;
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, r = R() * w * 0.32, top = [Math.sin(a) * r, vh + (h - vh) * (0.6 + R() * 0.35), Math.cos(a) * r];
    rod(G, [Math.sin(a) * 0.01, vh * 0.7, Math.cos(a) * 0.01], top, 0.004, '#4f8a3a', { seg: 4, line: false });
    const kind = p.kind && p.kind !== 'mixed' ? p.kind : ['rose', 'daisy', 'tulip'][i % 3];
    bloom(G, top[0], top[1], top[2], kind, cols[i % cols.length], 1.1);
    if (i % 2 === 0) { const lf = box(G, 0.05, 0.004, 0.022, '#5fa84a', top[0] * 0.7, vh + (top[1] - vh) * 0.45, top[2] * 0.7, { ry: a, rz: 0.6, line: false }); void lf; }
  }
  return G;
}

// a small framed photo standing on a shelf (top prop): params art
export function photo_frame(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params;
  const t = photoTex(p.art || 'family', p.seed || 0);
  const F = new THREE.Group(); F.rotation.x = -0.18; G.add(F);
  box(F, w, h, 0.018, p.frame || '#c99a62', 0, h / 2, 0);
  plane(F, w - 0.04, h - 0.04, texm(t), 0, h / 2, 0.0095, { line: false });
  rod(G, [0, h * 0.4, -0.01], [0, 0, -h * 0.35], 0.006, p.frame || '#c99a62', { seg: 4, line: false });
  return G;
}

// the family's photos (also on the walls, framed_picture art 'family' ...)
export function photoTex(art, seed = 0) {
  return paint('photo' + art + seed, 160, 200, (x, W, H, R) => {
    const sky = (a, b) => { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, W, H); };
    const person = (cx, cy, s, hair, shirt, cap) => {
      x.fillStyle = shirt; x.beginPath(); x.ellipse(cx, cy + 30 * s, 16 * s, 22 * s, 0, 0, 6.28); x.fill();
      x.fillStyle = '#f6d2b0'; x.beginPath(); x.arc(cx, cy, 12 * s, 0, 6.28); x.fill();
      x.fillStyle = hair; x.beginPath(); x.arc(cx, cy - 4 * s, 12.5 * s, Math.PI, 0); x.fill();
      if (cap) { x.fillStyle = cap; x.beginPath(); x.arc(cx, cy - 5 * s, 12.5 * s, Math.PI, 0); x.fill(); x.fillRect(cx - 2 * s, cy - 7 * s, 18 * s, 4 * s); }
      x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(cx - 4 * s, cy + 1 * s, 1.6 * s, 0, 6.28); x.arc(cx + 4 * s, cy + 1 * s, 1.6 * s, 0, 6.28); x.fill();
      x.strokeStyle = '#a8483a'; x.lineWidth = 1.5 * s; x.beginPath(); x.arc(cx, cy + 5 * s, 4 * s, 0.2, Math.PI - 0.2); x.stroke();
    };
    if (art === 'family') {
      // Mom and little Ash on the beach
      sky('#8fd0f4', '#e8f6fa'); x.fillStyle = '#4f9ed0'; x.fillRect(0, H * 0.5, W, H * 0.2); x.fillStyle = '#f2dca8'; x.fillRect(0, H * 0.68, W, H * 0.32);
      person(W * 0.36, H * 0.42, 1.5, '#6a3a2a', '#f2b8c6');
      x.fillStyle = '#6a3a2a'; x.fillRect(W * 0.36 + 8, H * 0.38, 14, 30);
      person(W * 0.66, H * 0.6, 1.0, '#2a2a3a', '#3a6ad0', '#e0473e');
    } else if (art === 'baby') {
      sky('#fbe8d8', '#f4d0c0'); x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(W / 2, H * 0.62, W * 0.36, H * 0.22, 0, 0, 6.28); x.fill();
      person(W / 2, H * 0.48, 1.2, '#2a2a3a', '#a8d0f0');
    } else if (art === 'trainer') {
      // Ash with his cap, a thumbs-up, in front of the lab's windmill
      sky('#7fc4ee', '#d8f0fa'); x.fillStyle = '#8acb5a'; x.fillRect(0, H * 0.72, W, H);
      x.fillStyle = '#d8dde2'; x.fillRect(W * 0.72, H * 0.15, 14, H * 0.6); x.fillStyle = '#ffdc3a'; for (let k = 0; k < 4; k++) { x.save(); x.translate(W * 0.72 + 7, H * 0.16); x.rotate(k * 1.57 + 0.6); x.fillRect(-3, 0, 6, 34); x.restore(); }
      person(W * 0.4, H * 0.5, 1.5, '#2a2a3a', '#3a6ad0', '#e0473e');
    } else if (art === 'garden') {
      sky('#9fd6f4', '#eef8f4'); x.fillStyle = '#7ac46a'; x.fillRect(0, H * 0.6, W, H);
      for (let k = 0; k < 30; k++) { x.fillStyle = ['#f08aa6', '#f6d24a', '#ffffff', '#e8473a'][k % 4]; x.beginPath(); x.arc(R() * W, H * (0.62 + R() * 0.35), 4 + R() * 3, 0, 6.28); x.fill(); }
      person(W * 0.5, H * 0.45, 1.4, '#6a3a2a', '#f6d65a');
    } else {
      sky('#a8daf4', '#f0f8f4'); x.fillStyle = '#5fae5a'; x.beginPath(); x.moveTo(0, H * 0.7); x.quadraticCurveTo(W * 0.5, H * 0.5, W, H * 0.7); x.lineTo(W, H); x.lineTo(0, H); x.fill();
      x.fillStyle = '#a9cbe8'; x.fillRect(W * 0.3, H * 0.55, W * 0.4, H * 0.2); x.fillStyle = '#d8473a'; x.beginPath(); x.moveTo(W * 0.25, H * 0.56); x.lineTo(W * 0.5, H * 0.4); x.lineTo(W * 0.75, H * 0.56); x.fill();
    }
    x.strokeStyle = '#ffffff'; x.lineWidth = 8; x.strokeRect(0, 0, W, H);
  }, { repeat: false });
}

// ---------- the entrance ----------
// Delia's apron and a tea towel on a peg rail (wall prop)
export function apron_hook(P) {
  const G = new THREE.Group(), [w, d] = P.size, p = P.params, back = -d / 2, col = p.color || '#f08aa6';
  box(G, w, 0.07, 0.025, texm(wood('#c99a62')), 0, 0.38, back + 0.0125);
  for (const x of [-w * 0.28, w * 0.28]) { rod(G, [x, 0.38, back + 0.025], [x, 0.4, back + 0.08], 0.012, '#8a5a36', { seg: 6 }); sphere(G, 0.016, '#8a5a36', x, 0.405, back + 0.085, { seg: 8, rings: 6, line: false }); }
  // the apron: a bib, a waist, a full skirt with a frill and a heart pocket
  const A = new THREE.Group(); A.position.set(-w * 0.28, 0.38, back + 0.06); G.add(A);
  const am = texm(cloth(col, 'gingham', '#fdf6f8'));
  rod(A, [-0.06, 0.0, 0.01], [-0.09, -0.16, 0.02], 0.005, col, { seg: 4, line: false }); rod(A, [0.06, 0.0, 0.01], [0.09, -0.16, 0.02], 0.005, col, { seg: 4, line: false });
  box(A, 0.2, 0.18, 0.012, am, 0, -0.24, 0.02);
  const sk = new THREE.Shape(); sk.moveTo(-0.13, 0); sk.lineTo(0.13, 0); sk.lineTo(0.2, -0.38); sk.quadraticCurveTo(0, -0.42, -0.2, -0.38); sk.lineTo(-0.13, 0);
  extrude(A, sk, 0.012, am, 0, -0.33, 0.016);
  for (let k = 0; k < 9; k++) sphere(A, 0.028, '#fdf6f8', -0.18 + k * 0.045, -0.73, 0.03, { seg: 8, rings: 5, line: false }).scale.set(1, 0.6, 0.4);
  box(A, 0.3, 0.035, 0.016, shade(col, 0.85), 0, -0.33, 0.028, { line: false });
  const heart = new THREE.Shape(); heart.moveTo(0, -0.03); heart.bezierCurveTo(-0.05, 0.01, -0.03, 0.05, 0, 0.025); heart.bezierCurveTo(0.03, 0.05, 0.05, 0.01, 0, -0.03);
  extrude(A, heart, 0.006, '#e8473a', 0.03, -0.5, 0.03, { line: false });
  // a tea towel on the other peg
  const T = new THREE.Group(); T.position.set(w * 0.28, 0.4, back + 0.07); G.add(T);
  box(T, 0.2, 0.36, 0.01, texm(cloth('#4a8ad0', 'stripe', '#fbf8f0')), 0, -0.19, 0, { line: true });
  return G;
}

// Mr. Mime's broom, leaning on the wall by the door (its foot on the floor)
export function broom(P) {
  const G = new THREE.Group(), [, d, h] = P.size, lean = 0.2;
  const B = new THREE.Group(); B.position.set(0, 0, d / 2 - 0.12); B.rotation.x = -lean; G.add(B);
  rod(B, [0, 0.3, 0], [0, h, 0], 0.016, '#c9965a', { seg: 8 });
  sphere(B, 0.02, '#a8763a', 0, h, 0, { seg: 8, rings: 6, line: false });
  // the bristles: a straw fan bound with red twine
  const s = new THREE.Shape(); s.moveTo(-0.05, 0.34); s.lineTo(0.05, 0.34); s.lineTo(0.17, 0.0); s.quadraticCurveTo(0, -0.02, -0.17, 0.0); s.lineTo(-0.05, 0.34);
  const bm = paint('straw', 64, 64, (x, W, H, R) => { x.fillStyle = '#e2c27a'; x.fillRect(0, 0, W, H); for (let k = 0; k < 60; k++) { x.fillStyle = R() < 0.5 ? '#c9a45a' : '#f2d898'; x.fillRect(R() * W, 0, 1.5, H); } });
  extrude(B, s, 0.05, texm(bm), 0, 0, -0.025);
  for (const y of [0.26, 0.31]) box(B, 0.12, 0.02, 0.06, '#d8473a', 0, y, 0, { line: false });
  return G;
}

// a low shoe bench by the door: shoes underneath, a bowl for keys and a little plant on top
export function entry_bench(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, wd = p.wood || '#b5784a', m = texm(wood(wd));
  block(G, w, 0.04, d, m, 0, h - 0.04, 0, { uv: 1 });
  block(G, w - 0.04, 0.03, d - 0.04, m, 0, 0.12, 0, { uv: 1 });
  for (const s of [-1, 1]) block(G, 0.04, h - 0.04, d, m, s * (w / 2 - 0.02), 0, 0, { uv: 1 });
  // the shoes: pairs of little rounded toes (Mom's red flats, slippers, Ash's old sneakers)
  const pairs = p.shoes || ['#e0473e', '#7aa6d8', '#3a6ad0'];
  pairs.forEach((c, i) => {
    const x = -w / 2 + 0.17 + i * (w - 0.3) / Math.max(1, pairs.length - 1) * 0.92;
    for (const s of [-1, 1]) { const sh = sphere(G, 0.05, c, x + s * 0.045, 0.165, 0.03, { seg: 10, rings: 6 }); sh.scale.set(0.8, 0.45, 1.9); }
    if (i === 2) for (const s of [-1, 1]) box(G, 0.06, 0.012, 0.12, '#ffffff', x + s * 0.045, 0.14, 0.03, { line: false });
  });
  for (const s of [-1, 1]) { const sh = sphere(G, 0.05, '#c99a62', -w * 0.2 + s * 0.05, 0.035, d / 2 - 0.05, { seg: 10, rings: 6 }); sh.scale.set(0.8, 0.5, 1.9); }
  // a key bowl and a small ceramic pot with a succulent
  lathe(G, [[0, 0], [0.06, 0], [0.09, 0.04], [0.085, 0.045], [0, 0.015]], '#4a8ad0', w * 0.25, h, 0, { seg: 14 });
  rod(G, [w * 0.25 - 0.03, h + 0.03, 0], [w * 0.25 + 0.03, h + 0.025, 0.02], 0.008, BRASS, { seg: 4, line: false });
  cyl(G, 0.06, 0.05, 0.09, '#f2ead6', -w * 0.25, h + 0.045, -0.02, { seg: 12 });
  for (let k = 0; k < 6; k++) { const a = k; const lf = sphere(G, 0.03, '#6ab07a', -w * 0.25 + Math.sin(a) * 0.025, h + 0.1, -0.02 + Math.cos(a) * 0.025, { seg: 8, rings: 5, line: false }); lf.scale.set(0.6, 1.3, 0.6); }
  return G;
}

export function umbrella_stand(P) {
  const G = new THREE.Group(), [w, , h] = P.size;
  lathe(G, [[0, 0], [w * 0.4, 0], [w * 0.42, h * 0.5], [w * 0.46, h * 0.98], [w * 0.43, h], [w * 0.38, h * 0.1], [0, h * 0.1]], texm(enamel('#3f7a74'), '#ffffff'), 0, 0, 0, { seg: 16 });
  for (const [a, c] of [[0.15, '#e8a33a'], [-0.2, '#3a6ad0']]) {
    rod(G, [0, 0.1, 0], [Math.sin(a) * 0.08, h + 0.55, 0.02], 0.008, '#3a3d46', { seg: 5 });
    torus(G, 0.04, 0.008, '#6a4630', Math.sin(a) * 0.08 + 0.04, h + 0.56, 0.02, { arc: Math.PI, ts: 10, rs: 4, line: false });
    const u = lathe(G, [[0.005, 0], [0.04, 0.05], [0.035, 0.42], [0.005, 0.5]], c, Math.sin(a) * 0.03, h - 0.05, 0.01, { seg: 8 }); u.rotation.z = -a * 0.5;
  }
  return G;
}

// ---------- stairs to the floor above (set dressing) ----------
// size [run (x), width (z), rise]: the flight climbs toward +x, its back side
// on the wall (-z), an open side with a banister toward +z; the space under it
// panelled with a little cupboard door. params wood, carpet (a runner colour)
export function staircase(P) {
  const G = new THREE.Group(), [L, W, H] = P.size, p = P.params, wd = p.wood || '#a8693e', m = texm(wood(wd)), n = p.steps || Math.round(H / 0.19);
  const g = L / n, r = H / n, x0 = -L / 2, run = p.carpet;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * g, y = (i + 1) * r;
    block(G, g + 0.03, 0.035, W, m, x + g / 2, y - 0.035, 0, { uv: 1 });
    box(G, 0.02, r, W - 0.02, shade(wd, 1.08), x + 0.01, y - r / 2 - 0.02, 0, { line: false });
    if (run) { box(G, g + 0.02, 0.006, W * 0.62, texm(cloth(run, 'stripe', shade(run, 1.25))), x + g / 2, y + 0.003, -0.02, { line: false }); box(G, 0.006, r, W * 0.62, texm(cloth(run, 'stripe', shade(run, 1.25))), x + 0.004, y - r / 2, -0.02, { line: false }); }
  }
  // the side under the flight: a panelled triangle with a cupboard door
  const tri = new THREE.Shape(); tri.moveTo(x0, 0); tri.lineTo(-x0, 0); tri.lineTo(-x0, H); tri.lineTo(x0, 0);
  extrude(G, tri, 0.04, texm(planks(shade(wd, 1.1), 6)), 0, 0, W / 2 - 0.04, { uv: 0.8 });
  const dx = L * 0.2;
  box(G, 0.62, 1.1, 0.02, shade(wd, 0.92), dx, 0.62, W / 2 + 0.01);
  box(G, 0.48, 0.96, 0.008, shade(wd, 1.02), dx, 0.62, W / 2 + 0.022, { line: false });
  sphere(G, 0.02, BRASS, dx + 0.22, 0.62, W / 2 + 0.035, { seg: 8, rings: 6, line: false });
  // a stringer along the open side, the banister on balusters, the newel post
  const ang = Math.atan2(H, L), sl = Math.hypot(L, H), oz = W / 2 + 0.02;
  const st = box(G, sl, 0.2, 0.05, m, 0, H / 2 - 0.06, oz); st.rotation.z = ang;
  const hr = 0.9;
  rod(G, [x0 + 0.1, r + hr, oz], [-x0 + 0.1, H + hr, oz], 0.03, shade(wd, 0.85), { seg: 8 });
  for (let i = 1; i < n; i++) { const x = x0 + (i + 0.5) * g, y = (i + 1) * r; rod(G, [x, y, oz], [x, y + hr - 0.03 + 0.5 * g * Math.tan(ang), oz], 0.014, CREAM, { seg: 6, line: i % 2 === 0 }); }
  lathe(G, [[0, 0], [0.07, 0], [0.07, 0.08], [0.05, 0.12], [0.05, hr + r + 0.05], [0.07, hr + r + 0.08], [0.06, hr + r + 0.14], [0.03, hr + r + 0.2], [0, hr + r + 0.2]], m, x0 + 0.06, 0, oz, { seg: 4 });
  sphere(G, 0.06, shade(wd, 0.85), x0 + 0.06, hr + r + 0.22, oz, { seg: 10, rings: 8 });
  // a rail on the wall side
  rod(G, [x0 + 0.3, r * 2 + hr, -W / 2 + 0.06], [-x0, H + hr * 0.9, -W / 2 + 0.06], 0.02, shade(wd, 0.85), { seg: 6 });
  return G;
}

// ---------- curtains over a window (wall prop: centred on the window) ----------
// params color, kind (cloth pattern), valance
export function curtains(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2, col = p.color || '#f2b8c6';
  const cm = texm(cloth(col, p.kind || 'gingham', p.col2 || '#fdf8f2'), '#ffffff', { side: THREE.DoubleSide });
  rod(G, [-w / 2 - 0.08, h / 2 + 0.05, back + 0.08], [w / 2 + 0.08, h / 2 + 0.05, back + 0.08], 0.014, '#c99a62', { seg: 8 });
  for (const s of [-1, 1]) sphere(G, 0.03, '#c99a62', s * (w / 2 + 0.1), h / 2 + 0.05, back + 0.08, { seg: 10, rings: 6, line: false });
  // two drapes gathered to the sides with tie-backs: wavy folds (a bent plane)
  for (const s of [-1, 1]) {
    const cw = w * 0.26, g2 = new THREE.PlaneGeometry(cw, h, 10, 8), pos = g2.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / cw + 0.5, v = pos.getY(i) / h + 0.5;
      const pinch = v > 0.32 && v < 0.5 ? 1 - Math.sin((v - 0.32) / 0.18 * Math.PI) * 0.45 : 1;
      pos.setX(i, (pos.getX(i)) * pinch);
      pos.setZ(i, Math.sin(u * Math.PI * 4) * 0.025 + 0.03);
    }
    g2.computeVertexNormals();
    put(new THREE.Mesh(g2, cm), G, s * (w / 2 - cw / 2 + 0.06), -0.0, back + 0.06, { line: true });
    box(G, cw * 0.62, 0.03, 0.04, shade(col, 0.8), s * (w / 2 - cw / 2 + 0.06), -h * 0.09, back + 0.1, { line: false });
  }
  if (p.valance !== false) {
    const vg = new THREE.PlaneGeometry(w + 0.18, 0.22, 24, 2), vp = vg.attributes.position;
    for (let i = 0; i < vp.count; i++) { const u = vp.getX(i) / (w + 0.18) + 0.5; vp.setZ(i, Math.sin(u * Math.PI * 9) * 0.02); if (vp.getY(i) < 0) vp.setY(i, vp.getY(i) - Math.abs(Math.sin(u * Math.PI * 3)) * 0.06); }
    vg.computeVertexNormals();
    put(new THREE.Mesh(vg, cm), G, 0, h / 2 - 0.06, back + 0.11);
  }
  return G;
}

// ---------- lamps ----------
// a hanging lamp (ceiling prop): style 'dome' (a flush frosted bowl), 'pendant'
// (a fabric shade on a cord), 'cone' (an enamel shade), 'tiffany' (stained glass);
// params drop, color
export function hanging_lamp(P) {
  const G = new THREE.Group(), p = P.params, st = p.style || 'pendant', drop = p.drop ?? 0.9, col = p.color || '#f4d8a8';
  const warm = unlit(null, p.glowCol || '#fff1c4');
  if (st === 'dome') {
    cyl(G, 0.1, 0.1, 0.03, BRASS, 0, -0.015, 0, { seg: 14 });
    const dm = lathe(G, [[0.001, 0], [0.22, -0.02], [0.24, -0.08], [0.18, -0.15], [0.001, -0.17]], warm, 0, 0, 0, { seg: 22 }); void dm;
    torus(G, 0.225, 0.012, BRASS, 0, -0.03, 0, { rx: Math.PI / 2, ts: 24, rs: 4, line: false });
    sphere(G, 0.025, BRASS, 0, -0.18, 0, { seg: 8, rings: 6, line: false });
    return G;
  }
  cyl(G, 0.06, 0.06, 0.03, st === 'cone' ? '#3a3d46' : BRASS, 0, -0.015, 0, { seg: 10 });
  rod(G, [0, -0.02, 0], [0, -drop + 0.12, 0], 0.007, '#3a3028', { seg: 4 });
  const y = -drop;
  if (st === 'cone') {
    lathe(G, [[0.025, 0.14], [0.05, 0.13], [0.2, 0.0], [0.21, -0.01], [0.001, 0.02]], texm(enamel(col), '#ffffff', { side: THREE.DoubleSide }), 0, y, 0, { seg: 20 });
    sphere(G, 0.06, warm, 0, y + 0.02, 0, { seg: 10, rings: 6, line: false });
  } else if (st === 'tiffany') {
    const tt = paint('tiffany', 128, 64, (x, W, H) => { const cs = ['#e8a33a', '#c8402e', '#5fae5a', '#f6d24a']; for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) { x.fillStyle = cs[(i + j) % 4]; x.fillRect(i * 16 + 1, j * 21 + 1, 14, 19); } x.fillStyle = '#3a2a1c'; for (let i = 0; i <= 8; i++) x.fillRect(i * 16 - 1, 0, 2, H); });
    lathe(G, [[0.03, 0.2], [0.12, 0.16], [0.24, 0.04], [0.26, 0.0], [0.001, 0.06]], unlit(tt, '#ffffff'), 0, y, 0, { seg: 16 });
    torus(G, 0.26, 0.012, '#3a2a1c', 0, y, 0, { rx: Math.PI / 2, ts: 20, rs: 4, line: false });
  } else {
    // a pleated fabric drum shade, glowing from inside
    const sh = paint('pleat' + col, 128, 32, (x, W, H) => { x.fillStyle = col; x.fillRect(0, 0, W, H); for (let i = 0; i < W; i += 8) { x.fillStyle = shade(col, 0.88); x.fillRect(i, 0, 3, H); } });
    const g = new THREE.CylinderGeometry(0.15, 0.24, 0.24, 24, 1, true);
    put(new THREE.Mesh(g, unlit(sh, '#ffffff')), G, 0, y + 0.07, 0);
    for (const yy of [y + 0.19, y - 0.05]) torus(G, yy > y ? 0.15 : 0.24, 0.008, shade(col, 0.6), 0, yy, 0, { rx: Math.PI / 2, ts: 20, rs: 3, line: false });
    sphere(G, 0.05, warm, 0, y + 0.03, 0, { seg: 10, rings: 6, line: false });
  }
  return G;
}

// a wall sconce: a brass arm and a frosted tulip shade (wall prop)
export function wall_lamp(P) {
  const G = new THREE.Group(), [, d] = P.size, back = -d / 2;
  cyl(G, 0.05, 0.05, 0.02, BRASS, 0, 0, back + 0.01, { rx: Math.PI / 2, seg: 12 });
  rod(G, [0, 0, back + 0.02], [0, -0.04, back + 0.12], 0.01, BRASS, { seg: 6 });
  rod(G, [0, -0.04, back + 0.12], [0, 0.04, back + 0.16], 0.01, BRASS, { seg: 6 });
  lathe(G, [[0.02, 0], [0.07, 0.04], [0.09, 0.12], [0.085, 0.14], [0.001, 0.04]], unlit(null, P.params.glowCol || '#fff0c0'), 0, 0.03, back + 0.16, { seg: 14 });
  return G;
}

// ---------- shelves ----------
// a wall shelf on brackets; params items 'jars' | 'plates' | 'books' | 'tea' | 'bottles' | 'mixed', wood
export function wall_shelf(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2, R = rng(hash(P.id || 'shelf') + (p.seed || 0));
  const wd = p.wood || '#a8693e', m = texm(wood(wd)), y0 = -h / 2;
  box(G, w, 0.03, d, m, 0, y0 + 0.015, back + d / 2, { uv: 1 });
  for (const s of [-1, 1]) { const b = new THREE.Shape(); b.moveTo(0, 0); b.lineTo(d - 0.03, 0); b.quadraticCurveTo(0.02, -0.04, 0, -0.16); b.lineTo(0, 0); const e = extrude(G, b, 0.025, m, s * (w / 2 - 0.12) + 0.0125, y0, back, { ry: -Math.PI / 2 }); void e; }
  const items = p.items || 'mixed', ty = y0 + 0.03;
  let x = -w / 2 + 0.08;
  while (x < w / 2 - 0.1) {
    const k = items === 'mixed' ? ['jars', 'books', 'plates', 'jars'][Math.floor(R() * 4)] : items;
    const z = back + d / 2;
    if (k === 'jars') { const r = 0.045 + R() * 0.02, hh = 0.1 + R() * 0.08, c = ['#e8a33a', '#c8402e', '#f4e3b8', '#7aa66a', '#d8473a'][Math.floor(R() * 5)]; cyl(G, r, r, hh, c, x + r, ty + hh / 2, z, { seg: 12 }); cyl(G, r + 0.005, r + 0.005, 0.02, '#e8e2d2', x + r, ty + hh + 0.01, z, { seg: 12, line: false }); box(G, r * 1.2, hh * 0.35, 0.002, '#fbf8f0', x + r, ty + hh * 0.5, z + r, { line: false }); x += r * 2 + 0.03; }
    else if (k === 'plates') { for (let j = 0; j < 2; j++) { cyl(G, 0.1, 0.1, 0.012, j ? '#a8d0e8' : CREAM, x + 0.1 + j * 0.04, ty + 0.1, z - 0.02 + j * 0.02, { rx: Math.PI / 2 - 0.2, seg: 18 }); } x += 0.26; }
    else if (k === 'books') { for (let j = 0; j < 4; j++) { const bh = 0.15 + R() * 0.06; box(G, 0.035, bh, d * 0.75, ['#c8463c', '#3e6fb0', '#e0b83a', '#3e8f5e', '#8a4a9a'][Math.floor(R() * 5)], x + j * 0.04, ty + bh / 2, z, { line: j % 2 === 0 }); } x += 0.2; }
    else if (k === 'tea') { const r = 0.05, hh = 0.12; cyl(G, r, r, hh, ['#b05a3a', '#55707a', '#7a6a4a', '#2f4f6f'][Math.floor(R() * 4)], x + r, ty + hh / 2, z, { seg: 12 }); cyl(G, r + 0.003, r + 0.003, 0.03, '#2a2420', x + r, ty + hh + 0.015, z, { seg: 12, line: false }); x += r * 2 + 0.04; }
    else if (k === 'bottles') { const r = 0.035, hh = 0.2; lathe(G, [[0, 0], [r, 0], [r, hh * 0.65], [r * 0.4, hh * 0.85], [r * 0.35, hh], [0, hh]], ['#3f7a4a', '#7a3a2a', '#c9a24a'][Math.floor(R() * 3)], x + r, ty, z, { seg: 10 }); x += r * 2 + 0.04; }
    else x += 0.1;
  }
  return G;
}

// a 90s telephone (top prop)
export function telephone(P) {
  const G = new THREE.Group(), col = P.params.color || '#f4ece0';
  const s = new THREE.Shape(); s.moveTo(-0.1, 0); s.lineTo(0.1, 0); s.lineTo(0.08, 0.07); s.lineTo(-0.08, 0.07); s.lineTo(-0.1, 0);
  extrude(G, s, 0.18, col, 0, 0, -0.09);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box(G, 0.025, 0.01, 0.025, '#d8d0c0', -0.04 + i * 0.04, 0.07, 0.03 - j * 0.035, { rx: -0.2, line: false });
  rod(G, [-0.09, 0.1, -0.05], [0.09, 0.1, -0.05], 0.025, col, { seg: 8 });
  for (const s2 of [-1, 1]) sphere(G, 0.035, col, s2 * 0.1, 0.095, -0.05, { seg: 10, rings: 6 }).scale.set(1, 0.7, 1.1);
  return G;
}

// a bowl of fruit (top prop): apples, oranges, a bunch of bananas
export function fruit_bowl(P) {
  const G = new THREE.Group(), [w] = P.size, R = rng(hash(P.id || 'fruit'));
  lathe(G, [[0, 0], [w * 0.2, 0], [w * 0.45, 0.06], [w * 0.5, 0.09], [w * 0.47, 0.09], [0, 0.03]], P.params.bowl || '#f2ead6', 0, 0, 0, { seg: 20 });
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + R() * 0.3, r = w * 0.26; const c = k % 3 === 0 ? '#ef8a2e' : k % 3 === 1 ? '#d83a32' : '#8ac04a'; sphere(G, 0.045, c, Math.sin(a) * r, 0.09 + (k % 2) * 0.03, Math.cos(a) * r, { seg: 12, rings: 8 }); if (k % 3 === 1) rod(G, [Math.sin(a) * r, 0.13 + (k % 2) * 0.03, Math.cos(a) * r], [Math.sin(a) * r + 0.005, 0.155 + (k % 2) * 0.03, Math.cos(a) * r], 0.004, '#5a3a22', { seg: 4, line: false }); }
  for (let k = 0; k < 3; k++) { const b = torus(G, 0.08, 0.016, '#f6d24a', 0.0, 0.15, 0.0, { arc: 1.6, ts: 10, rs: 6 }); b.rotation.set(Math.PI / 2 - 0.3, 0.2 + k * 0.25, 0.9); }
  return G;
}

// ---------- PALLET HOUSE ----------
// the serving counter: a raised-panel front, a thick top, a brass rail; on it
// a cash register, a bell, a cake under a glass dome, a jar of sweets, menus
export function inn_counter(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, wd = p.wood || '#8a5634', m = texm(wood(wd)), dk = shade(wd, 0.8);
  block(G, w, 0.12, d - 0.08, dk, 0, 0, -0.04);
  block(G, w, h - 0.17, d - 0.06, texm(planks(shade(wd, 1.08), 6)), 0, 0.12, -0.03, { uv: 0.8 });
  const n = Math.max(2, Math.round(w / 0.7)), pw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pw * (i + 0.5);
    box(G, pw - 0.1, h - 0.42, 0.02, shade(wd, 1.0), x, 0.12 + (h - 0.17) / 2, d / 2 - 0.02);
    box(G, pw - 0.2, h - 0.54, 0.02, shade(wd, 1.12), x, 0.12 + (h - 0.17) / 2, d / 2 - 0.005, { line: false });
  }
  for (let i = 0; i <= n; i++) box(G, 0.06, h - 0.17, 0.04, dk, -w / 2 + pw * i, 0.12 + (h - 0.17) / 2, d / 2 - 0.02, { line: false });
  block(G, w + 0.1, 0.06, d + 0.06, m, 0, h - 0.06, 0.02, { uv: 1 });
  rod(G, [-w / 2, 0.16, d / 2 + 0.12], [w / 2, 0.16, d / 2 + 0.12], 0.02, BRASS, { seg: 10 });
  for (let i = 0; i <= 3; i++) rod(G, [-w / 2 + 0.1 + i * (w - 0.2) / 3, 0.16, d / 2 + 0.12], [-w / 2 + 0.1 + i * (w - 0.2) / 3, 0.16, d / 2 - 0.01], 0.012, BRASS, { seg: 6, line: false });
  const T = h;
  // the cash register
  if (p.register !== false) {
    const rx = w * 0.32, cz = -0.08;
    const s = new THREE.Shape(); s.moveTo(-0.17, 0); s.lineTo(0.17, 0); s.lineTo(0.17, 0.14); s.lineTo(0.06, 0.26); s.lineTo(-0.17, 0.26); s.lineTo(-0.17, 0);
    extrude(G, s, 0.3, texm(enamel('#c9b48e'), '#ffffff'), rx + 0.15, T, cz, { ry: -Math.PI / 2 });
    box(G, 0.2, 0.08, 0.05, '#2e3038', rx, T + 0.3, cz - 0.08, { line: false });
    box(G, 0.15, 0.045, 0.002, unlit(null, '#9ff0a8'), rx, T + 0.305, cz - 0.054, { line: false });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) cyl(G, 0.014, 0.014, 0.02, i === 3 ? '#e0473e' : '#f4f0e6', rx - 0.06 + i * 0.04, T + 0.15 + j * 0.03, cz + 0.13 - j * 0.035, { seg: 8, line: false, rx: 0.8 });
    box(G, 0.3, 0.05, 0.02, shade('#c9b48e', 0.8), rx, T + 0.05, cz + 0.175, { line: false });
  }
  // a service bell, a jar of sweets, a stack of menus
  cyl(G, 0.05, 0.05, 0.01, '#3a3d46', -w * 0.05, T + 0.005, 0.12, { seg: 14 });
  sphere(G, 0.045, BRASS, -w * 0.05, T + 0.01, 0.12, { seg: 14, rings: 8, theta: Math.PI / 2 });
  sphere(G, 0.01, BRASS, -w * 0.05, T + 0.06, 0.12, { seg: 6, rings: 4, line: false });
  lathe(G, [[0, 0], [0.07, 0], [0.08, 0.04], [0.08, 0.18], [0.05, 0.2], [0.055, 0.22], [0, 0.22]], glow(null, '#cfe8f0', 0.35), -w * 0.18, T, -0.08, { seg: 16 });
  for (let k = 0; k < 9; k++) sphere(G, 0.018, ['#e8473a', '#f6d24a', '#5fae5a', '#f08aa6'][k % 4], -w * 0.18 + Math.sin(k * 2.1) * 0.04, T + 0.03 + Math.floor(k / 3) * 0.035, -0.08 + Math.cos(k * 2.1) * 0.04, { seg: 6, rings: 4, line: false });
  for (let k = 0; k < 3; k++) box(G, 0.22, 0.006, 0.3, k % 2 ? '#7a3a2a' : '#8a4a32', -w * 0.4, T + 0.004 + k * 0.007, 0.05, { ry: 0.08 * k, line: k === 2 });
  return G;
}

// a chalk menu in a wooden frame (wall prop): params title, items [[name, price]], special
export function menu_board(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2;
  const items = p.items || [['STEW', '300']], key = (P.id || 'menu') + p.title + items.length;
  const t = paint('menu' + key, 512, Math.round(512 * (h - 0.12) / (w - 0.12)), (x, W, H, R) => {
    x.fillStyle = '#2c3f38'; x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.07; x.fillStyle = '#fff'; for (let k = 0; k < 14; k++) { x.beginPath(); x.ellipse(R() * W, R() * H, 70 + R() * 90, 14 + R() * 20, R(), 0, 6.28); x.fill(); }
    x.globalAlpha = 1; x.textAlign = 'center'; x.fillStyle = '#fff6dc';
    fitText(x, p.title || 'MENU', H * 0.13, W * 0.8, HEAD); x.fillText(p.title || 'MENU', W / 2, H * 0.15);
    x.strokeStyle = '#f3c443'; x.lineWidth = 3; x.beginPath(); x.moveTo(W * 0.25, H * 0.2); x.quadraticCurveTo(W / 2, H * 0.23, W * 0.75, H * 0.2); x.stroke();
    const top = H * 0.29, step = (H * (p.special ? 0.56 : 0.66)) / Math.max(1, items.length);
    items.forEach(([name, price], i) => {
      const y = top + step * (i + 0.6);
      x.textAlign = 'left'; x.fillStyle = ['#ffffff', '#ffe0a0', '#bfeee6', '#ffc7bd'][i % 4];
      const fs = fitText(x, name, Math.min(step * 0.62, H * 0.075), W * 0.62, BODY, 600); void fs; x.fillText(name, W * 0.08, y);
      x.textAlign = 'right'; x.fillStyle = '#fff6dc'; x.fillText(price, W * 0.92, y);
      const nw = x.measureText(name).width, tw = x.measureText(price).width;
      x.fillStyle = 'rgba(255,246,220,.5)'; for (let u = W * 0.08 + nw + 10; u < W * 0.92 - tw - 10; u += 11) x.fillRect(u, y - 5, 3, 3);
    });
    if (p.special) { x.textAlign = 'center'; x.fillStyle = '#f3c443'; fitText(x, p.special, H * 0.07, W * 0.84, HEAD); x.fillText(p.special, W / 2, H * 0.93); }
    // a doodle: a steaming bowl in the corner
    x.strokeStyle = '#fff6dc'; x.lineWidth = 3; x.beginPath(); x.arc(W * 0.88, H * 0.11, 22, 0, Math.PI); x.stroke(); x.beginPath(); x.moveTo(W * 0.88 - 26, H * 0.11); x.lineTo(W * 0.88 + 26, H * 0.11); x.stroke();
    for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(W * 0.88 + k * 10, H * 0.08); x.bezierCurveTo(W * 0.88 + k * 10 - 8, H * 0.05, W * 0.88 + k * 10 + 8, H * 0.03, W * 0.88 + k * 10, H * 0.0); x.stroke(); }
  }, { repeat: false });
  const fr = p.frame || '#8a5634';
  box(G, w, h, 0.03, fr, 0, 0, back + 0.015);
  plane(G, w - 0.12, h - 0.12, texm(t), 0, 0, back + 0.032, { line: false });
  for (const s of [-1, 1]) { box(G, w, 0.06, 0.05, fr, 0, s * (h / 2 - 0.03), back + 0.04); box(G, 0.06, h, 0.05, fr, s * (w / 2 - 0.03), 0, back + 0.04); }
  box(G, w - 0.16, 0.025, 0.06, fr, 0, -h / 2 + 0.07, back + 0.07);
  box(G, 0.07, 0.016, 0.016, '#fffdf2', w * 0.2, -h / 2 + 0.09, back + 0.08, { line: false });
  return G;
}

// a stone fireplace with a mantel, logs and a fire (floor prop, back on the wall)
export function fireplace(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2;
  const st = paint('fstone' + (p.stone || '#c9b89a'), 256, 256, (x, W, H, R) => {
    const col = p.stone || '#c9b89a'; x.fillStyle = shade(col, 0.7); x.fillRect(0, 0, W, H);
    const rows = 7, rh = H / rows;
    for (let r = 0; r < rows; r++) { let u = -R() * 40; while (u < W) { const bw = 40 + R() * 40; x.fillStyle = shade(col, 0.88 + R() * 0.24); x.beginPath(); x.roundRect(u + 2, r * rh + 2, bw - 4, rh - 4, 6); x.fill(); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(u + 5, r * rh + 4, bw - 12, 3); u += bw; } }
  });
  const sm = texm(st);
  const ow = w * 0.5, oh = h * 0.55;
  // the surround: two jambs and a lintel
  for (const s of [-1, 1]) block(G, (w - ow) / 2, h - 0.12, d - 0.06, sm, s * (w / 2 - (w - ow) / 4), 0.06, back + (d - 0.06) / 2, { uv: 1.2 });
  block(G, ow + 0.02, h - 0.12 - oh, d - 0.06, sm, 0, 0.06 + oh, back + (d - 0.06) / 2, { uv: 1.2 });
  // the firebox: soot dark, the hearth slab, logs and flames
  block(G, ow, oh, d * 0.6, '#2a2220', 0, 0.06, back + d * 0.3);
  block(G, w + 0.3, 0.06, d + 0.25, shade(p.stone || '#c9b89a', 0.85), 0, 0, back + (d + 0.25) / 2, { uv: 1.2 });
  for (const [a, y, z] of [[0.3, 0.13, 0.0], [-0.25, 0.13, 0.06], [0.05, 0.22, 0.03]]) cyl(G, 0.055, 0.06, ow * 0.7, '#7a4a2e', 0, y, back + d * 0.4 + z, { rz: Math.PI / 2, ry: a, seg: 10 });
  const ft = paint('flame', 64, 128, (x, W, H) => {
    const g = x.createLinearGradient(0, H, 0, 0); g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(0.35, 'rgba(255,170,60,.95)'); g.addColorStop(0.75, 'rgba(230,80,30,.6)'); g.addColorStop(1, 'rgba(200,40,20,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(W * 0.1, H); x.bezierCurveTo(0, H * 0.5, W * 0.4, H * 0.4, W * 0.45, 0); x.bezierCurveTo(W * 0.6, H * 0.35, W, H * 0.45, W * 0.9, H); x.fill();
  }, { repeat: false });
  // the back of the firebox lit by the fire (embers at the bottom), then the flames
  const fb = paint('firebox', 64, 64, (x, W, H) => { const g = x.createLinearGradient(0, H, 0, 0); g.addColorStop(0, '#ff8a30'); g.addColorStop(0.35, '#a83a18'); g.addColorStop(1, '#2a1410'); x.fillStyle = g; x.fillRect(0, 0, W, H); }, { repeat: false });
  plane(G, ow - 0.04, oh - 0.02, unlit(fb, '#ffffff'), 0, 0.06 + oh / 2, back + 0.02, { line: false });
  box(G, ow * 0.8, 0.03, d * 0.4, unlit(null, '#ff7a2a'), 0, 0.075, back + d * 0.35, { line: false });
  for (const [x, s, a] of [[-0.12, 1.0, 0.2], [0.1, 1.25, -0.15], [0.0, 1.45, 0.0], [0.16, 0.9, 0.4], [-0.2, 0.8, -0.3]]) plane(G, 0.3 * s, 0.46 * s, glow(ft, '#ffffff', 1.0), x * ow * 1.6, 0.14 + 0.23 * s, back + d * 0.45, { ry: a, line: false });
  plane(G, ow * 0.9, oh * 0.6, glow(haloTex(), '#ff9a40', 0.5), 0, 0.3, back + d * 0.2, { line: false });
  // the mantel shelf with candlesticks and a clock
  const my = h - 0.06;
  block(G, w + 0.16, 0.08, d + 0.08, texm(wood(p.wood || '#7a4a2e')), 0, my, back + (d + 0.08) / 2, { uv: 1 });
  for (const s of [-1, 1]) { lathe(G, [[0, 0], [0.04, 0], [0.02, 0.03], [0.015, 0.14], [0.03, 0.15], [0, 0.15]], BRASS, s * w * 0.38, my + 0.08, back + d / 2, { seg: 10 }); cyl(G, 0.012, 0.012, 0.12, CREAM, s * w * 0.38, my + 0.29, back + d / 2, { seg: 8, line: false }); sphere(G, 0.012, unlit(null, '#ffd27a'), s * w * 0.38, my + 0.365, back + d / 2, { seg: 6, rings: 4, line: false }).scale.y = 1.8; }
  const c = new THREE.Shape(); c.moveTo(-0.13, 0); c.lineTo(0.13, 0); c.lineTo(0.13, 0.12); c.absarc(0, 0.12, 0.13, 0, Math.PI, false); c.lineTo(-0.13, 0);
  extrude(G, c, 0.1, texm(wood('#6a3a22')), 0, my + 0.08, back + d / 2 - 0.05);
  cyl(G, 0.085, 0.085, 0.01, '#fbf8ee', 0, my + 0.2, back + d / 2 + 0.055, { rx: Math.PI / 2, seg: 18, line: false });
  // fire tools on a stand to the side
  const tx = w / 2 + 0.12;
  rod(G, [tx, 0.06, back + d * 0.6], [tx, 0.75, back + d * 0.6], 0.012, IRON, { seg: 6 });
  for (const a of [-0.25, 0, 0.25]) rod(G, [tx, 0.7, back + d * 0.6], [tx + Math.sin(a) * 0.06, 0.08, back + d * 0.6 + Math.cos(a) * 0.04], 0.008, IRON, { seg: 4, line: false });
  return G;
}

// a dresser: a cupboard base with a drawer row, an open rack of plates and
// cups above (floor prop, back on the wall)
export function plate_dresser(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, wd = p.wood || '#8a5634', m = texm(wood(wd)), R = rng(hash(P.id || 'dresser'));
  const bh = 0.9;
  block(G, w, bh, d, m, 0, 0, 0, { uv: 1 });
  block(G, w + 0.06, 0.04, d + 0.04, shade(wd, 0.9), 0, bh, 0.01);
  for (let i = 0; i < 3; i++) { const x = -w / 3 + i * w / 3; box(G, w / 3 - 0.06, 0.16, 0.02, shade(wd, 1.1), x, bh - 0.12, d / 2); sphere(G, 0.016, BRASS, x, bh - 0.12, d / 2 + 0.015, { seg: 8, rings: 6, line: false }); box(G, w / 3 - 0.06, bh - 0.32, 0.02, shade(wd, 1.06), x, (bh - 0.25) / 2 + 0.02, d / 2); }
  // the rack: back boards, sides with a shaped top, three shelves
  const rd = 0.24, rz = -d / 2 + rd / 2;
  block(G, w - 0.04, h - bh - 0.04, 0.02, texm(planks(shade(wd, 1.15), 6)), 0, bh + 0.04, -d / 2 + 0.01, { uv: 0.8 });
  for (const s of [-1, 1]) block(G, 0.04, h - bh - 0.04, rd, m, s * (w / 2 - 0.02), bh + 0.04, rz);
  block(G, w + 0.04, 0.08, rd + 0.04, m, 0, h - 0.08, rz);
  for (let k = 0; k < 3; k++) {
    const y = bh + 0.04 + (k + 0.08) * (h - bh - 0.12) / 3;
    block(G, w - 0.08, 0.025, rd, m, 0, y, rz);
    box(G, w - 0.08, 0.02, 0.012, shade(wd, 0.9), 0, y + 0.07, rz + rd / 2 - 0.02, { line: false });
    if (k < 2) {
      const n = Math.floor((w - 0.2) / 0.2);
      for (let i = 0; i < n; i++) { const c = [CREAM, '#a8cfe8', CREAM, '#f2c4b2'][(i + k) % 4]; const pl = cyl(G, 0.085, 0.085, 0.012, c, -w / 2 + 0.16 + i * 0.2, y + 0.11, rz - 0.03, { rx: Math.PI / 2 - 0.25, seg: 18 }); void pl; torus(G, 0.06, 0.006, '#4a7ab0', -w / 2 + 0.16 + i * 0.2, y + 0.11, rz - 0.022, { rx: -0.25, ts: 16, rs: 3, line: false }); }
    } else {
      for (let i = 0; i < 5; i++) { const x = -w / 2 + 0.16 + i * (w - 0.3) / 4; cyl(G, 0.05, 0.04, 0.09, ['#e05a4a', CREAM, '#4a8ad0', '#f6d65a', CREAM][i], x, y + 0.07, rz, { seg: 12 }); torus(G, 0.025, 0.007, ['#e05a4a', CREAM, '#4a8ad0', '#f6d65a', CREAM][i], x + 0.055, y + 0.075, rz, { ry: Math.PI / 2, ts: 10, rs: 4, line: false }); }
    }
  }
  // a jug and a bread crock on top of the base
  lathe(G, [[0, 0], [0.08, 0], [0.1, 0.1], [0.07, 0.2], [0.08, 0.24], [0, 0.22]], '#f2ead6', w * 0.3, bh + 0.04, 0.08, { seg: 16 });
  cyl(G, 0.11, 0.1, 0.16, '#c9a06a', -w * 0.3, bh + 0.12, 0.08, { seg: 16 });
  void R;
  return G;
}

export function barrel(P) {
  const G = new THREE.Group(), [w, , h] = P.size, r = w / 2, m = texm(planks('#9a6a42', 10));
  lathe(G, [[0, 0], [r * 0.86, 0], [r, h * 0.5], [r * 0.86, h], [0, h]], m, 0, 0, 0, { seg: 18 });
  for (const t of [0.08, 0.3, 0.7, 0.92]) { const rr = r * (0.86 + 0.14 * Math.sin(t * Math.PI)) + 0.006; torus(G, rr, 0.012, IRON, 0, h * t, 0, { rx: Math.PI / 2, ts: 22, rs: 4, line: false }); }
  cyl(G, r * 0.84, r * 0.84, 0.01, texm(wood('#8a5a36')), 0, h + 0.004, 0, { seg: 18, line: false });
  cyl(G, 0.02, 0.025, 0.08, '#6a4630', r * 0.3, h * 0.3, r * 0.92, { rx: Math.PI / 2, seg: 8 });
  return G;
}

// a coat stand with a hat and a scarf
export function coat_stand(P) {
  const G = new THREE.Group(), [, , h] = P.size, wd = '#7a4a2e';
  for (let k = 0; k < 3; k++) { const a = k * 2.094; rod(G, [0, 0.25, 0], [Math.sin(a) * 0.24, 0, Math.cos(a) * 0.24], 0.016, wd, { seg: 6 }); }
  rod(G, [0, 0, 0], [0, h, 0], 0.025, wd, { seg: 8 });
  sphere(G, 0.04, wd, 0, h + 0.02, 0, { seg: 10, rings: 6 });
  for (let k = 0; k < 4; k++) { const a = k * 1.57; rod(G, [0, h - 0.12, 0], [Math.sin(a) * 0.14, h - 0.02, Math.cos(a) * 0.14], 0.012, wd, { seg: 5 }); }
  // a straw hat with a ribbon, a coat
  const hy = h - 0.0;
  cyl(G, 0.2, 0.2, 0.012, '#e6cf8a', 0.12, hy, 0.02, { seg: 18, rz: 0.3 });
  cyl(G, 0.09, 0.1, 0.09, '#e6cf8a', 0.11, hy + 0.04, 0.02, { seg: 14, rz: 0.3 });
  cyl(G, 0.102, 0.102, 0.025, '#e8473a', 0.105, hy + 0.015, 0.02, { seg: 14, rz: 0.3, line: false });
  const coat = lathe(G, [[0.06, 0], [0.12, -0.05], [0.2, -0.6], [0.22, -0.9], [0.001, -0.9]], texm(fabric('#5a7ab0')), -0.04, h - 0.1, -0.08, { seg: 12 }); coat.scale.set(1, 1, 0.55);
  return G;
}

// ---------- the tea house ----------
// a low lacquered table (zataku) on four short legs
export function low_table(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.color || '#4a2e22', m = texm(lacquer(col));
  extrude(G, roundRect(w, d, 0.06), 0.045, m, 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ' }).position.set(0, h - 0.045, 0);
  block(G, w - 0.1, 0.06, d - 0.1, shade(col, 0.8), 0, h - 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(G, 0.07, h - 0.1, 0.07, shade(col, 0.85), sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1));
  return G;
}
// a floor cushion (zabuton): a plump square with tufts and corner tassels
export function zabuton(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.color || '#b8443a';
  const c = extrude(G, roundRect(w, d, 0.08), h * 0.7, texm(fabric(col)), 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ', curve: 4 });
  c.position.set(0, 0.0, 0);
  const t = extrude(G, roundRect(w - 0.06, d - 0.06, 0.1), h * 0.3, texm(fabric(shade(col, 1.06))), 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ', curve: 4 });
  t.position.set(0, h * 0.7, 0);
  sphere(G, 0.02, p.tuft || '#f2e6c8', 0, h + 0.004, 0, { seg: 6, rings: 4, line: false }).scale.y = 0.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sphere(G, 0.016, p.tuft || '#f2e6c8', sx * (w / 2 - 0.03), h * 0.5, sz * (d / 2 - 0.03), { seg: 6, rings: 4, line: false });
  return G;
}
// a tea set on a tray (top prop): a side-handled pot (kyusu), cups, a little bowl
export function tea_set(P) {
  const G = new THREE.Group(), [w, d] = P.size, p = P.params, col = p.color || '#5f7f6a';
  const tray = extrude(G, roundRect(w, d, 0.04), 0.015, texm(lacquer('#3a2418')), 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ' }); tray.position.set(0, 0, 0);
  for (const s of [-1, 1]) box(G, w, 0.025, 0.012, '#3a2418', 0, 0.02, s * (d / 2 - 0.006), { line: false });
  const ky = 0.015, kx = -w * 0.22;
  lathe(G, [[0, 0], [0.05, 0], [0.065, 0.03], [0.062, 0.06], [0.04, 0.08], [0, 0.08]], texm(enamel(col), '#ffffff'), kx, ky, 0, { seg: 16 });
  cyl(G, 0.03, 0.03, 0.012, shade(col, 0.9), kx, ky + 0.085, 0, { seg: 12 });
  sphere(G, 0.01, shade(col, 0.8), kx, ky + 0.097, 0, { seg: 6, rings: 4, line: false });
  rod(G, [kx + 0.06, ky + 0.04, 0], [kx + 0.11, ky + 0.07, -0.01], 0.011, col, { seg: 6, r2: 0.006 });
  rod(G, [kx - 0.05, ky + 0.04, 0.04], [kx - 0.1, ky + 0.06, 0.09], 0.014, col, { seg: 6 });
  for (let i = 0; i < (p.cups || 2); i++) { const cx = w * 0.08 + i * 0.1, cz = (i % 2 ? -0.05 : 0.05); lathe(G, [[0, 0], [0.028, 0], [0.036, 0.06], [0.034, 0.062], [0, 0.012]], '#e8e2d2', cx, ky, cz, { seg: 12 }); cyl(G, 0.03, 0.03, 0.002, '#9ac46a', cx, ky + 0.05, cz, { seg: 12, line: false }); }
  return G;
}
// a hanging scroll (kakejiku): params art 'mountain' | 'crane' | 'tea' | 'blossom'
export function hanging_scroll(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2, art = p.art || 'mountain';
  const t = paint('scroll' + art, 128, 320, (x, W, H, R) => {
    x.fillStyle = p.silk || '#6a5a3a'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#c9a85a'; x.fillRect(0, H * 0.1, W, 4); x.fillRect(0, H * 0.9 - 4, W, 4);
    const px = W * 0.1, py = H * 0.16, pw = W * 0.8, ph = H * 0.68;
    x.fillStyle = '#f2ead4'; x.fillRect(px, py, pw, ph);
    x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
    if (art === 'tea') {
      // the character for tea, brushed big, with a red seal
      x.strokeStyle = '#1e1a18'; x.lineWidth = 9; x.lineCap = 'round';
      const cx = W / 2, cy = py + ph * 0.42, s = pw * 0.36;
      x.beginPath(); x.moveTo(cx - s, cy - s * 0.85); x.lineTo(cx + s, cy - s * 0.85); x.moveTo(cx - s * 0.4, cy - s * 1.2); x.lineTo(cx - s * 0.4, cy - s * 0.5); x.moveTo(cx + s * 0.4, cy - s * 1.2); x.lineTo(cx + s * 0.4, cy - s * 0.5); x.stroke();
      x.beginPath(); x.moveTo(cx, cy - s * 0.45); x.lineTo(cx - s, cy + s * 0.2); x.moveTo(cx, cy - s * 0.45); x.lineTo(cx + s, cy + s * 0.2); x.moveTo(cx - s * 0.6, cy + s * 0.15); x.lineTo(cx + s * 0.6, cy + s * 0.15); x.moveTo(cx, cy + s * 0.15); x.lineTo(cx, cy + s * 1.3); x.moveTo(cx - s * 0.1, cy + s * 0.55); x.lineTo(cx - s * 0.7, cy + s * 1.0); x.moveTo(cx + s * 0.1, cy + s * 0.55); x.lineTo(cx + s * 0.7, cy + s * 1.0); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(cx + s * 0.6, cy + s * 1.7); for (let k = 0; k < 4; k++) x.lineTo(cx + s * 0.6 + (k % 2 ? 6 : -6), cy + s * 1.9 + k * 12); x.stroke();
    } else if (art === 'crane') {
      x.fillStyle = '#e0473e'; x.beginPath(); x.arc(W * 0.7, py + ph * 0.2, 14, 0, 6.28); x.fill();
      x.strokeStyle = '#2a2420'; x.lineWidth = 2.5; x.fillStyle = '#ffffff';
      x.beginPath(); x.ellipse(W / 2, py + ph * 0.5, 22, 12, -0.4, 0, 6.28); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(W / 2 - 14, py + ph * 0.47); x.quadraticCurveTo(W / 2 - 40, py + ph * 0.25, W / 2 - 10, py + ph * 0.28); x.lineTo(W / 2 + 30, py + ph * 0.35); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(W / 2 + 14, py + ph * 0.45); x.quadraticCurveTo(W / 2 + 26, py + ph * 0.3, W / 2 + 34, py + ph * 0.32); x.stroke();
      x.fillStyle = '#e0473e'; x.beginPath(); x.arc(W / 2 + 34, py + ph * 0.31, 3, 0, 6.28); x.fill();
      x.beginPath(); x.moveTo(W / 2, py + ph * 0.56); x.lineTo(W / 2 - 4, py + ph * 0.75); x.moveTo(W / 2 + 4, py + ph * 0.56); x.lineTo(W / 2 + 6, py + ph * 0.75); x.stroke();
    } else if (art === 'blossom') {
      x.strokeStyle = '#3a2a22'; x.lineWidth = 5; x.beginPath(); x.moveTo(px, py + ph * 0.3); x.bezierCurveTo(W * 0.4, py + ph * 0.32, W * 0.5, py + ph * 0.5, W * 0.85, py + ph * 0.55); x.stroke();
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(W * 0.45, py + ph * 0.38); x.lineTo(W * 0.6, py + ph * 0.25); x.stroke();
      for (let k = 0; k < 22; k++) { x.fillStyle = R() < 0.6 ? '#f4a8c0' : '#fbe0ea'; x.beginPath(); x.arc(px + R() * pw, py + ph * (0.22 + R() * 0.4), 4 + R() * 3, 0, 6.28); x.fill(); }
    } else {
      // ink mountains in the mist, a pine, a little boat
      for (const [c, y, a] of [['rgba(60,60,70,.35)', 0.55, 0.3], ['rgba(40,40,50,.6)', 0.7, 0.5], ['rgba(20,20,30,.85)', 0.85, 0.7]]) { x.fillStyle = c; x.beginPath(); x.moveTo(px, py + ph); x.lineTo(px, py + ph * y); for (let u = 0; u <= 1; u += 0.1) x.lineTo(px + pw * u, py + ph * (y - Math.abs(Math.sin(u * 6 + a * 7)) * 0.2)); x.lineTo(px + pw, py + ph); x.fill(); }
      x.fillStyle = '#e0473e'; x.beginPath(); x.arc(W * 0.72, py + ph * 0.2, 9, 0, 6.28); x.fill();
      x.fillStyle = '#1e1a18'; for (let k = 0; k < 5; k++) x.fillRect(W * 0.2, py + ph * (0.12 + k * 0.05), 4, 10);
    }
    x.restore();
    x.fillStyle = '#c8402e'; x.fillRect(px + pw - 16, py + ph - 26, 10, 12);
  }, { repeat: false });
  plane(G, w - 0.02, h - 0.1, texm(t), 0, 0, back + 0.012, { line: true });
  for (const s of [-1, 1]) { cyl(G, 0.018, 0.018, w + 0.08, s > 0 ? '#3a2a1c' : '#2a1e14', 0, s * (h / 2 - 0.04), back + 0.02, { rz: Math.PI / 2, seg: 8 }); for (const e of [-1, 1]) cyl(G, 0.022, 0.022, 0.03, '#d8c8a0', e * (w / 2 + 0.05), s * (h / 2 - 0.04), back + 0.02, { rz: Math.PI / 2, seg: 8, line: false }); }
  rod(G, [-w * 0.3, h / 2 - 0.04, back + 0.02], [0, h / 2 + 0.16, back + 0.005], 0.004, '#6a5a3a', { seg: 4, line: false });
  rod(G, [w * 0.3, h / 2 - 0.04, back + 0.02], [0, h / 2 + 0.16, back + 0.005], 0.004, '#6a5a3a', { seg: 4, line: false });
  return G;
}
// the alcove's raised floor (tokonoma) with its polished edge (a vase stands on it)
export function tokonoma(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params;
  block(G, w, h, d, texm(lacquer(p.color || '#5a3a26')), 0, 0, 0);
  block(G, w - 0.04, 0.01, d - 0.04, texm(wood('#c8a272')), 0, h, 0, { line: false });
  // a pillar of rustic wood at its side (the tokobashira)
  cyl(G, 0.07, 0.075, p.post || 2.4, texm(wood('#8a6a4a')), w / 2 + 0.06, (p.post || 2.4) / 2, d / 2 - 0.08, { seg: 10 });
  return G;
}
// ikebana: a shallow dish, a pine branch, a few camellias (top prop)
export function ikebana(P) {
  const G = new THREE.Group(), [w] = P.size, p = P.params;
  lathe(G, [[0, 0], [w * 0.3, 0], [w * 0.36, 0.05], [w * 0.34, 0.055], [0, 0.04]], texm(enamel(p.dish || '#3f5f7a'), '#ffffff'), 0, 0, 0, { seg: 18 });
  rod(G, [0, 0.04, 0], [-0.05, 0.3, 0.02], 0.008, '#4a3426', { seg: 5 });
  rod(G, [-0.05, 0.3, 0.02], [0.12, 0.5, -0.02], 0.007, '#4a3426', { seg: 5 });
  rod(G, [-0.03, 0.2, 0.01], [-0.18, 0.32, 0.03], 0.006, '#4a3426', { seg: 5 });
  for (const [x, y, z, s] of [[0.12, 0.5, -0.02, 1], [-0.18, 0.33, 0.03, 0.8], [0.02, 0.4, 0.0, 0.7]]) { const pad = sphere(G, 0.07 * s, '#3f7a4a', x, y, z, { seg: 10, rings: 6 }); pad.scale.set(1.4, 0.45, 1.0); }
  for (const [x, y, z] of [[0.04, 0.12, 0.05], [-0.06, 0.1, -0.03]]) bloom(G, x, y, z, 'rose', p.flower || '#d8303a', 1.4);
  rod(G, [0.02, 0.04, 0.0], [0.08, 0.2, 0.02], 0.004, '#5fa84a', { seg: 4, line: false });
  return G;
}
// a paper floor lamp (andon): a wooden frame with glowing paper sides
export function andon(P) {
  const G = new THREE.Group(), [w, , h] = P.size, wd = '#4a3020';
  const paper = paint('andon_paper', 64, 128, (x, W, H) => { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffe8b0'); g.addColorStop(0.5, '#fff4d8'); g.addColorStop(1, '#ffd890'); x.fillStyle = g; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(120,80,40,.4)'; x.fillRect(0, H * 0.5 - 1, W, 2); x.fillRect(W * 0.5 - 1, 0, 2, H); }, { repeat: false });
  const pm = unlit(paper, '#ffffff'), b = h * 0.18, ph = h - b - 0.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(G, 0.03, h, 0.03, wd, sx * (w / 2 - 0.015), 0, sz * (w / 2 - 0.015));
  for (const y of [b, h - 0.03]) for (const s of [-1, 1]) { block(G, w, 0.025, 0.025, wd, 0, y, s * (w / 2 - 0.0125)); block(G, 0.025, 0.025, w, wd, s * (w / 2 - 0.0125), y, 0); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const pl = plane(G, w - 0.04, ph - 0.02, pm, Math.sin(a) * (w / 2 - 0.016), b + ph / 2 + 0.02, Math.cos(a) * (w / 2 - 0.016), { ry: a, line: false }); void pl; }
  block(G, w - 0.02, 0.02, w - 0.02, wd, 0, b - 0.02, 0);
  return G;
}
// a paper lantern hanging from the ceiling (chochin): params color, drop, text
export function paper_lantern(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params, col = p.color || '#e0402c', drop = p.drop ?? 0.4, r = w / 2;
  rod(G, [0, 0, 0], [0, -drop, 0], 0.005, '#2a2420', { seg: 4, line: false });
  const y = -drop - h / 2;
  const t = paint('lantern' + col + (p.text || ''), 128, 64, (x, W, H) => {
    x.fillStyle = col; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < H; k += 6) x.fillRect(0, k, W, 1.5);
    if (p.text) { x.fillStyle = '#1e1a18'; x.font = `600 26px ${BODY}`; x.textAlign = 'center'; x.fillText(p.text, W / 4, H * 0.68); x.fillText(p.text, W * 3 / 4, H * 0.68); }
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), unlit(t, '#ffffff')); body.scale.y = h / w * 0.9; put(body, G, 0, y, 0);
  for (const s of [-1, 1]) cyl(G, r * 0.45, r * 0.45, 0.04, '#1e1a18', 0, y + s * h * 0.45, 0, { seg: 14 });
  return G;
}
// the tea counter: a wooden counter with a sunken brazier and the iron kettle,
// tea caddies, cups upside down on a cloth, a whisk; params wood
export function tea_counter(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, wd = p.wood || '#8a5b38', m = texm(wood(wd)), pale = texm(wood('#c8a272'));
  block(G, w, 0.08, d - 0.06, shade(wd, 0.7), 0, 0, -0.03);
  block(G, w, h - 0.13, d - 0.04, texm(planks(wd, 8)), 0, 0.08, -0.02, { uv: 0.8 });
  for (let i = 0; i <= 4; i++) box(G, 0.05, h - 0.13, 0.03, shade(wd, 0.75), -w / 2 + i * w / 4, 0.08 + (h - 0.13) / 2, d / 2 - 0.02, { line: false });
  block(G, w + 0.08, 0.05, d + 0.04, pale, 0, h - 0.05, 0.01, { uv: 1 });
  const T = h;
  // a brazier with coals and the cast iron kettle (tetsubin)
  const bx = -w * 0.32;
  cyl(G, 0.17, 0.15, 0.16, '#6a5a4a', bx, T + 0.08, -0.04, { seg: 16 });
  cyl(G, 0.14, 0.14, 0.01, unlit(null, '#e8603a'), bx, T + 0.155, -0.04, { seg: 16, line: false });
  for (let k = 0; k < 5; k++) sphere(G, 0.028, '#2a2220', bx + Math.sin(k * 1.3) * 0.07, T + 0.16, -0.04 + Math.cos(k * 1.3) * 0.07, { seg: 6, rings: 4, line: false });
  const ky = T + 0.18;
  const kt = sphere(G, 0.12, '#2a2a30', bx, ky + 0.06, -0.04, { seg: 16, rings: 10 }); kt.scale.y = 0.75;
  cyl(G, 0.05, 0.05, 0.03, '#3a3a40', bx, ky + 0.15, -0.04, { seg: 12 });
  rod(G, [bx + 0.1, ky + 0.06, -0.04], [bx + 0.18, ky + 0.12, -0.04], 0.016, '#2a2a30', { seg: 6, r2: 0.01 });
  torus(G, 0.1, 0.01, '#2a2a30', bx, ky + 0.15, -0.04, { arc: Math.PI, ts: 12, rs: 5 });
  // cups upside down on a cloth, a whisk, tea caddies, a little bell
  box(G, 0.4, 0.004, 0.22, texm(cloth('#2b3f6e', 'plain')), w * 0.05, T + 0.002, 0.04, { line: false });
  for (let i = 0; i < 6; i++) { const cx = w * 0.05 - 0.15 + (i % 3) * 0.15, cz = -0.03 + Math.floor(i / 3) * 0.12; lathe(G, [[0, 0.06], [0.034, 0.06], [0.03, 0.0], [0.024, 0.0], [0, 0.012]], i % 2 ? '#e8e2d2' : '#7a9a6a', cx, T + 0.004, cz, { seg: 12 }); }
  const wx = w * 0.3;
  cyl(G, 0.03, 0.025, 0.07, '#e6d7b0', wx, T + 0.035, 0.06, { seg: 12 });
  for (let k = 0; k < 8; k++) rod(G, [wx, T + 0.07, 0.06], [wx + Math.sin(k) * 0.025, T + 0.12, 0.06 + Math.cos(k) * 0.025], 0.003, '#e6d7b0', { seg: 3, line: false });
  for (let i = 0; i < 3; i++) { cyl(G, 0.05, 0.05, 0.11, ['#b05a3a', '#55707a', '#2f4f6f'][i], w * 0.36 + (i - 1) * 0.11, T + 0.055, -0.12, { seg: 14 }); cyl(G, 0.052, 0.052, 0.03, '#1e1a18', w * 0.36 + (i - 1) * 0.11, T + 0.125, -0.12, { seg: 14, line: false }); }
  return G;
}
// a folding screen (byobu): six panels in a zigzag, gold leaf, pines and waves
export function folding_screen(P) {
  const G = new THREE.Group(), [w, , h] = P.size, n = 6, pw = w / n;
  const t = paint('byobu', 384, 160, (x, W, H, R) => {
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#e8c46a'); g.addColorStop(0.5, '#f4dc8a'); g.addColorStop(1, '#d8b058'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.15; for (let i = 0; i < W; i += 24) for (let j = 0; j < H; j += 24) { x.fillStyle = (i + j) % 48 ? '#ffffff' : '#a8803a'; x.fillRect(i, j, 23, 23); } x.globalAlpha = 1;
    x.strokeStyle = '#3f6aa8'; x.lineWidth = 4; for (let k = 0; k < 5; k++) { x.beginPath(); for (let u = 0; u <= W; u += 8) x.lineTo(u, H * 0.75 + k * 7 + Math.sin(u * 0.05 + k) * 6); x.stroke(); }
    x.strokeStyle = '#4a3426'; x.lineWidth = 7; x.beginPath(); x.moveTo(W * 0.2, H); x.bezierCurveTo(W * 0.22, H * 0.6, W * 0.3, H * 0.4, W * 0.42, H * 0.25); x.stroke();
    for (const [cx, cy] of [[0.42, 0.22], [0.3, 0.38], [0.5, 0.35], [0.22, 0.5]]) { x.fillStyle = '#3f7a4a'; x.beginPath(); x.ellipse(W * cx, H * cy, 34, 10, 0, 0, 6.28); x.fill(); }
    x.fillStyle = '#ffffff'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(W * (0.6 + k * 0.12), H * (0.2 + R() * 0.1), 30, 7, 0, 0, 6.28); x.fill(); }
  }, { repeat: false });
  for (let i = 0; i < n; i++) {
    const a = (i % 2 ? -1 : 1) * 0.35, x = -w / 2 + pw * (i + 0.5), z = i % 2 ? -0.05 : 0.05;
    const pg = new THREE.Group(); pg.position.set(x, 0, z); pg.rotation.y = a; G.add(pg);
    block(pg, pw, h, 0.03, '#2a1e14', 0, 0, 0);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.05, h - 0.06), texm(t)); const uv = pl.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / n);
    put(pl, pg, 0, h / 2, 0.017, { line: false });
  }
  return G;
}
// a little bonsai pine on a stand (floor prop)
export function bonsai(P) {
  const G = new THREE.Group(), [w, , h] = P.size;
  const sh = h * 0.55;
  block(G, w, 0.04, w * 0.7, texm(lacquer('#3a2418')), 0, sh - 0.04, 0);
  for (const sx of [-1, 1]) block(G, 0.05, sh - 0.04, w * 0.6, texm(lacquer('#3a2418')), sx * (w / 2 - 0.05), 0, 0);
  box(G, w * 0.6, 0.08, w * 0.4, '#6a7a8a', 0, sh + 0.04, 0);
  rod(G, [0, sh + 0.08, 0], [0.04, sh + 0.2, 0], 0.025, '#5a4030', { seg: 6, r2: 0.02 });
  rod(G, [0.04, sh + 0.2, 0], [-0.06, sh + 0.3, 0.02], 0.02, '#5a4030', { seg: 6, r2: 0.014 });
  for (const [x, y, z, s] of [[-0.08, sh + 0.32, 0.02, 1], [0.08, sh + 0.24, -0.02, 0.8], [-0.02, sh + 0.38, 0.0, 0.7]]) { const pad = sphere(G, 0.1 * s, '#3f7a4a', x, y, z, { seg: 10, rings: 6 }); pad.scale.set(1.3, 0.5, 1.0); }
  return G;
}
// a sliding shoji screen in a wall (wall prop): params panels, w
export function shoji_panel(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2, n = p.panels || 2, wd = '#5a3a22';
  const paper = paint('shoji_p', 128, 128, (x, W, H) => { x.fillStyle = '#f6f0dc'; x.fillRect(0, 0, W, H); x.fillStyle = '#5a3a22'; for (let i = 0; i <= 4; i++) { x.fillRect(i * 32 - 2, 0, 4, H); x.fillRect(0, i * 32 - 2, W, 4); } });
  const pm = texm(paper, '#ffffff');
  for (let i = 0; i < n; i++) {
    const pw = w / n, x = -w / 2 + pw * (i + 0.5), z = back + 0.02 + (i % 2) * 0.025;
    box(G, pw, h, 0.03, wd, x, 0, z);
    const pl = plane(G, pw - 0.07, h - 0.4, pm, x, 0.06, z + 0.016, { line: false });
    const uv = pl.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (pw - 0.07) * 2.5, uv.getY(k) * (h - 0.4) * 2.5);
    box(G, pw - 0.06, 0.24, 0.012, shade(wd, 1.2), x, -h / 2 + 0.16, z + 0.017, { line: false });
    box(G, 0.03, 0.08, 0.008, '#2a1e14', x + (i % 2 ? -1 : 1) * (pw / 2 - 0.06), 0, z + 0.02, { line: false });
  }
  box(G, w + 0.1, 0.06, d, wd, 0, h / 2 + 0.03, 0);
  box(G, w + 0.1, 0.03, d, wd, 0, -h / 2 - 0.015, 0);
  return G;
}

// ---------- Ash's room ----------
// a wooden bed: headboard toward -z, a mattress, the sheet, a blanket with a
// big ball on it, kicked into a heap, a pillow (params wood, blanket, rumpled)
export function bed(P) {
  const G = new THREE.Group(), [w, d] = P.size, p = P.params, wd = p.wood || '#b5784a', m = texm(wood(wd));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(G, 0.07, sz < 0 ? 0.95 : 0.55, 0.07, m, sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035));
  for (const sz of [-1, 1]) block(G, w - 0.06, sz < 0 ? 0.5 : 0.22, 0.04, m, 0, sz < 0 ? 0.38 : 0.3, sz * (d / 2 - 0.03));
  for (const sx of [-1, 1]) block(G, 0.04, 0.12, d - 0.08, m, sx * (w / 2 - 0.035), 0.2, 0);
  block(G, w - 0.08, 0.2, d - 0.1, '#f4f2ea', 0, 0.26, 0);
  const bc = p.blanket || '#3f7ad0';
  const bt = paint('blanket' + bc, 128, 256, (x, W, H) => {
    x.fillStyle = bc; x.fillRect(0, 0, W, H);
    x.fillStyle = shade(bc, 1.15); for (let i = 0; i < H; i += 32) x.fillRect(0, i, W, 6);
    const cx = W / 2, cy = H * 0.55, r = W * 0.32;
    x.fillStyle = '#e3473d'; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.fill();
    x.fillStyle = '#f7f7f4'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI); x.fill();
    x.fillStyle = '#23252c'; x.fillRect(cx - r, cy - 4, r * 2, 8); x.beginPath(); x.arc(cx, cy, 13, 0, 6.28); x.fill();
    x.fillStyle = '#f7f7f4'; x.beginPath(); x.arc(cx, cy, 7, 0, 6.28); x.fill();
  }, { repeat: false });
  // the blanket over the lower two thirds, a lump where he kicked it, hanging over the sides
  const bl = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.06, d * 0.68, 8, 1, 10), texm(bt));
  const bp = bl.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    if (bp.getY(i) > 0 && p.rumpled !== false) bp.setY(i, bp.getY(i) + Math.max(0, 0.1 - Math.hypot(x + 0.12, z - 0.1) * 0.22) + Math.sin(x * 9 + z * 5) * 0.012);
    if (Math.abs(x) > (w - 0.02) / 2 - 0.001) bp.setY(i, bp.getY(i) - 0.12);
  }
  bl.geometry.computeVertexNormals();
  put(bl, G, 0, 0.49, d / 2 - d * 0.34);
  box(G, w - 0.02, 0.03, 0.2, '#f8f6ee', 0, 0.5, d / 2 - d * 0.68 - 0.06, { rx: 0.15 });
  const pl = extrude(G, roundRect(w * 0.6, 0.34, 0.1), 0.12, '#f8f6ee', 0, 0, 0, { rx: -Math.PI / 2, order: 'XYZ', curve: 4 }); pl.position.set(0.05, 0.46, -d / 2 + 0.28); pl.rotation.z = 0.08;
  return G;
}
// a twin-bell alarm clock (top prop)
export function alarm_clock(P) {
  const G = new THREE.Group(), col = P.params.color || '#e0473e';
  const C = new THREE.Group(); C.position.y = 0.08; C.rotation.x = -0.15; G.add(C);
  cyl(C, 0.06, 0.06, 0.04, col, 0, 0, 0, { rx: Math.PI / 2, seg: 18 });
  cyl(C, 0.05, 0.05, 0.004, '#fbf8ee', 0, 0, 0.021, { rx: Math.PI / 2, seg: 18, line: false });
  for (const [a, l] of [[0.6, 0.035], [2.4, 0.026]]) { const hnd = box(C, 0.005, l, 0.003, '#23252c', Math.sin(a) * l / 2, Math.cos(a) * l / 2, 0.025, { line: false }); hnd.rotation.z = -a; }
  for (const sx of [-1, 1]) { sphere(C, 0.028, BRASS, sx * 0.04, 0.06, 0, { seg: 10, rings: 6, theta: Math.PI / 2 }); rod(G, [sx * 0.03, 0.02, 0], [sx * 0.045, 0, 0.02], 0.006, IRON, { seg: 4, line: false }); }
  rod(C, [-0.035, 0.085, 0], [0.035, 0.085, 0], 0.005, BRASS, { seg: 4, line: false });
  sphere(C, 0.01, BRASS, 0, 0.09, 0, { seg: 6, rings: 4, line: false });
  return G;
}
// a poster on the wall (wall prop): params art 'league' | 'mouse' | 'lizard' | 'ball', tilt
export function poster(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, back = -d / 2, art = p.art || 'league';
  const t = paint('poster' + art, 160, 220, (x, W, H) => {
    const bg = { league: ['#2f5fb0', '#5f9ae8'], mouse: ['#f6e08a', '#fff4c8'], lizard: ['#f4a65a', '#ffe0b0'], ball: ['#e0473e', '#f8b0a0'] }[art] || ['#888888', '#cccccc'];
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#1e1e26'; x.lineWidth = 3; x.textAlign = 'center';
    if (art === 'mouse') {
      // a round yellow electric mouse: long black-tipped ears, red cheeks, a zigzag tail
      x.fillStyle = '#f2c81a';
      x.beginPath(); x.moveTo(W * 0.72, H * 0.62); x.lineTo(W * 0.92, H * 0.5); x.lineTo(W * 0.84, H * 0.42); x.lineTo(W * 0.98, H * 0.28); x.lineTo(W * 0.86, H * 0.3); x.lineTo(W * 0.78, H * 0.48); x.closePath(); x.fill(); x.stroke();
      for (const s of [-1, 1]) { x.fillStyle = '#f2c81a'; x.beginPath(); x.moveTo(W / 2 + s * 18, H * 0.36); x.lineTo(W / 2 + s * 44, H * 0.08); x.lineTo(W / 2 + s * 30, H * 0.4); x.fill(); x.stroke(); x.fillStyle = '#1e1e26'; x.beginPath(); x.moveTo(W / 2 + s * 44, H * 0.08); x.lineTo(W / 2 + s * 36, H * 0.18); x.lineTo(W / 2 + s * 42, H * 0.2); x.fill(); }
      x.fillStyle = '#f2c81a';
      x.beginPath(); x.ellipse(W / 2, H * 0.74, 34, 30, 0, 0, 6.28); x.fill(); x.stroke();
      x.beginPath(); x.ellipse(W / 2, H * 0.5, 40, 36, 0, 0, 6.28); x.fill(); x.stroke();
      x.fillStyle = '#1e1e26'; for (const s of [-1, 1]) { x.beginPath(); x.arc(W / 2 + s * 15, H * 0.47, 5, 0, 6.28); x.fill(); }
      x.fillStyle = '#e8473a'; for (const s of [-1, 1]) { x.beginPath(); x.arc(W / 2 + s * 28, H * 0.54, 8, 0, 6.28); x.fill(); }
      x.fillStyle = '#c8402e'; x.font = `400 22px ${HEAD}`; x.fillText('ZAP!', W / 2, H * 0.95);
    } else if (art === 'lizard') {
      x.fillStyle = '#f08a3a';
      x.beginPath(); x.ellipse(W / 2, H * 0.6, 32, 42, 0, 0, 6.28); x.fill(); x.stroke();
      x.beginPath(); x.arc(W / 2, H * 0.32, 30, 0, 6.28); x.fill(); x.stroke();
      x.fillStyle = '#fbe0a0'; x.beginPath(); x.ellipse(W / 2, H * 0.64, 18, 28, 0, 0, 6.28); x.fill();
      x.fillStyle = '#1e1e26'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(W / 2 + s * 11, H * 0.3, 4, 7, 0, 0, 6.28); x.fill(); }
      x.strokeStyle = '#f08a3a'; x.lineWidth = 10; x.beginPath(); x.moveTo(W / 2 + 28, H * 0.75); x.quadraticCurveTo(W * 0.92, H * 0.78, W * 0.86, H * 0.58); x.stroke();
      x.fillStyle = '#ffd23a'; x.beginPath(); x.moveTo(W * 0.86, H * 0.6); x.quadraticCurveTo(W * 0.78, H * 0.48, W * 0.86, H * 0.4); x.quadraticCurveTo(W * 0.96, H * 0.5, W * 0.86, H * 0.6); x.fill();
      x.fillStyle = '#e8402e'; x.beginPath(); x.moveTo(W * 0.86, H * 0.56); x.quadraticCurveTo(W * 0.82, H * 0.5, W * 0.86, H * 0.46); x.quadraticCurveTo(W * 0.9, H * 0.5, W * 0.86, H * 0.56); x.fill();
    } else if (art === 'ball') {
      x.fillStyle = '#ffffff'; x.font = `400 22px ${HEAD}`; x.fillText('GOTTA', W / 2, H * 0.14); x.fillText('CATCH THEM!', W / 2, H * 0.92);
      const cx = W / 2, cy = H * 0.52, r = 52;
      x.fillStyle = '#e3473d'; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.fill(); x.fillStyle = '#f7f7f4'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI); x.fill();
      x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, r, 0, 6.28); x.stroke(); x.fillStyle = '#1e1e26'; x.fillRect(cx - r, cy - 4, r * 2, 8); x.beginPath(); x.arc(cx, cy, 16, 0, 6.28); x.fill(); x.fillStyle = '#f7f7f4'; x.beginPath(); x.arc(cx, cy, 9, 0, 6.28); x.fill();
    } else {
      x.fillStyle = '#ffd23a'; x.font = `400 26px ${HEAD}`; x.fillText('POKéMON', W / 2, H * 0.16); x.fillText('LEAGUE', W / 2, H * 0.29);
      x.fillStyle = '#ffffff'; x.font = `400 14px ${HEAD}`; x.fillText('INDIGO PLATEAU', W / 2, H * 0.38);
      x.fillStyle = '#f6c23a'; x.beginPath(); x.moveTo(W / 2 - 30, H * 0.48); x.lineTo(W / 2 + 30, H * 0.48); x.lineTo(W / 2 + 22, H * 0.66); x.lineTo(W / 2 - 22, H * 0.66); x.fill(); x.stroke();
      x.fillRect(W / 2 - 6, H * 0.66, 12, 20); x.fillRect(W / 2 - 24, H * 0.75, 48, 10);
      x.strokeStyle = '#f6c23a'; x.lineWidth = 5; for (const s of [-1, 1]) { x.beginPath(); x.arc(W / 2 + s * 32, H * 0.55, 10, s < 0 ? 1.6 : -1.6, s < 0 ? 4.7 : 1.6); x.stroke(); }
      x.fillStyle = '#ffffff'; x.font = `600 13px ${BODY}`; x.fillText('Be the very best!', W / 2, H * 0.92);
    }
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 6; x.strokeRect(0, 0, W, H);
  }, { repeat: false });
  plane(G, w, h, texm(t), 0, 0, back + 0.006, { rz: p.tilt || 0, line: true });
  for (const [sx, sy, c] of [[-1, 1, '#e0473e'], [1, 1, '#3f8ad0'], [-1, -1, '#f6c23a'], [1, -1, '#5fae5a']]) sphere(G, 0.012, c, sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), back + 0.012, { seg: 6, rings: 4, line: false });
  return G;
}
// a plush toy (top or floor prop): params kind 'mouse' | 'ball' | 'blob' | 'lizard'
export function plush(P) {
  const G = new THREE.Group(), [w] = P.size, p = P.params, k = p.kind || 'mouse', s = w / 0.3;
  if (k === 'ball') { pokeBall(G, 0.07 * s, 0, 0.07 * s, 0, p.ry || 0.4); return G; }
  const col = { mouse: '#f2c81a', blob: '#7ac0e8', lizard: '#f08a3a' }[k] || '#f2c81a';
  const body = sphere(G, 0.1 * s, col, 0, 0.1 * s, 0, { seg: 14, rings: 10 }); body.scale.set(1, 0.95, 0.9);
  sphere(G, 0.085 * s, col, 0, 0.25 * s, 0.01, { seg: 14, rings: 10 });
  if (k === 'mouse') {
    for (const sx of [-1, 1]) { const e = lathe(G, [[0.001, 0], [0.025 * s, 0.02 * s], [0.02 * s, 0.12 * s], [0.001, 0.15 * s]], col, sx * 0.05 * s, 0.31 * s, 0, { seg: 8 }); e.rotation.z = -sx * 0.4; sphere(G, 0.014 * s, '#1e1e26', sx * 0.105 * s, 0.43 * s, 0, { seg: 6, rings: 4, line: false }); }
    for (const sx of [-1, 1]) sphere(G, 0.018 * s, '#e8473a', sx * 0.055 * s, 0.23 * s, 0.07 * s, { seg: 8, rings: 5, line: false });
    const tl = box(G, 0.03 * s, 0.14 * s, 0.015 * s, col, 0.09 * s, 0.15 * s, -0.09 * s); tl.rotation.z = -0.6;
  } else if (k === 'lizard') { sphere(G, 0.025 * s, '#ffd23a', 0.12 * s, 0.14 * s, -0.08 * s, { seg: 6, rings: 4 }); }
  for (const sx of [-1, 1]) sphere(G, 0.013 * s, '#1e1e26', sx * 0.03 * s, 0.27 * s, 0.075 * s, { seg: 6, rings: 4, line: false });
  for (const sx of [-1, 1]) { const f = sphere(G, 0.035 * s, col, sx * 0.06 * s, 0.03 * s, 0.06 * s, { seg: 8, rings: 5 }); f.scale.set(1, 0.6, 1.3); }
  return G;
}
// Ash's backpack, slumped on the floor (EP001: green with a yellow flap)
export function backpack(P) {
  const G = new THREE.Group(), p = P.params, col = p.color || '#4f9a4a', flap = p.flap || '#f2c81a';
  const B = new THREE.Group(); B.rotation.set(-0.25, 0.3, 0.08); G.add(B);
  extrude(B, roundRect(0.32, 0.38, 0.1, 0, 0.19), 0.16, texm(fabric(col)), 0, 0, -0.08, { curve: 5 });
  extrude(B, roundRect(0.33, 0.2, 0.08, 0, 0.29), 0.04, texm(fabric(flap)), 0, 0, 0.07, { curve: 5 });
  box(B, 0.24, 0.12, 0.05, shade(col, 0.9), 0, 0.1, 0.1);
  for (const sx of [-1, 1]) { const st = box(B, 0.04, 0.34, 0.015, '#3a3d46', sx * 0.09, 0.2, -0.095); st.rotation.z = sx * 0.1; }
  torus(B, 0.04, 0.01, '#3a3d46', 0, 0.39, -0.02, { arc: Math.PI, ts: 8, rs: 4, line: false });
  return G;
}
// clothes dropped on the floor: a shirt, a towel, socks (a 10-year-old's room)
export function clothes_pile(P) {
  const G = new THREE.Group(), p = P.params, R = rng(hash(P.id || 'clothes'));
  const cols = p.colors || ['#3a6ad0', '#f4f2ea', '#3f8a4a'];
  cols.forEach((c, i) => {
    const g = new THREE.PlaneGeometry(0.42 - i * 0.08, 0.34 - i * 0.06, 6, 5), pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.abs(Math.sin(pp.getX(k) * 13 + i + pp.getY(k) * 9)) * 0.04);
    g.rotateX(-Math.PI / 2); g.computeVertexNormals();
    put(new THREE.Mesh(g, texm(fabric(c), '#ffffff', { side: THREE.DoubleSide })), G, (R() - 0.5) * 0.25, 0.01 + i * 0.03, (R() - 0.5) * 0.2, { ry: R() * 3 });
  });
  for (let k = 0; k < 2; k++) box(G, 0.06, 0.03, 0.18, '#f4f2ea', 0.25 + k * 0.08, 0.015, 0.1 - k * 0.05, { ry: k * 0.8 });
  return G;
}

void mixc; void makeBush; void TILE; void flat; void glow;
