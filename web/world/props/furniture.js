// Furniture: desks, chairs, the sofa, the drafting table, bookshelves, tables,
// counters, crates and cabinets. Each builder takes the placement P ({params
// (catalog defaults merged with the placement's), size [w, d, h], id}) and
// returns a group with its footprint centred on the origin, standing on y 0,
// its front toward +z.
import * as THREE from 'three';
import { rng, hash, shade, paint, flat, texm, unlit, box, block, cyl, sphere, torus, lathe, rod, plane, wood, planks, metal, roundRect, extrude, HEAD, BODY, fitText } from './kit.js';

const DARK = '#3b3f4a';

// ---------- desk ----------
export function desk(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, R = rng(hash(P.id || 'desk'));
  const top = texm(wood(p.wood || '#c9874f')), body = texm(wood(shade(p.wood || '#c9874f', 0.92)));
  block(G, w, 0.05, d, top, 0, h - 0.05, 0, { uv: 1 });
  // a pedestal of drawers on one side, a side panel on the other, a modesty panel
  const sx = p.drawers === 'left' ? -1 : 1, pw = Math.min(0.48, w * 0.32), ph = h - 0.05;
  block(G, pw, ph, d - 0.05, body, sx * (w / 2 - pw / 2 - 0.02), 0, 0, { uv: 1 });
  for (let i = 0; i < 3; i++) {
    const dh = (ph - 0.08) / 3, y = 0.05 + i * dh;
    box(G, pw - 0.06, dh - 0.04, 0.025, shade(p.wood || '#c9874f', 1.06), sx * (w / 2 - pw / 2 - 0.02), y + dh / 2, d / 2 - 0.015);
    box(G, 0.12, 0.02, 0.025, '#e2c15a', sx * (w / 2 - pw / 2 - 0.02), y + dh * 0.62, d / 2 + 0.01, { line: false });
  }
  block(G, 0.04, ph, d - 0.05, body, -sx * (w / 2 - 0.04), 0, 0, { uv: 1 });
  block(G, w - pw - 0.1, ph * 0.55, 0.02, body, -sx * (pw / 2 + 0.01), ph * 0.42, -d / 2 + 0.06, { uv: 1 });
  // things on it: papers, a mug, a pen pot, a book
  if (p.clutter !== false) {
    const tp = h;
    for (let k = 0; k < 3; k++) box(G, 0.21, 0.004, 0.29, k ? '#f6f3ea' : '#f8f6ef', -sx * (w * 0.15) + (R() - 0.5) * 0.12, tp + 0.003 + k * 0.004, (R() - 0.5) * 0.1, { ry: (R() - 0.5) * 0.4, line: k === 2 });
    cyl(G, 0.045, 0.04, 0.1, R() < 0.5 ? '#e05a4a' : '#4a8ad0', sx * (w * 0.3), tp + 0.05, -d * 0.2, { seg: 12 });
    cyl(G, 0.035, 0.035, 0.11, '#5f6b7a', sx * (w * 0.4), tp + 0.055, -d * 0.28, { seg: 10 });
    for (let k = 0; k < 3; k++) rod(G, [sx * (w * 0.4) + (k - 1) * 0.012, tp + 0.09, -d * 0.28], [sx * (w * 0.4) + (k - 1) * 0.02, tp + 0.18, -d * 0.28 + (k - 1) * 0.01], 0.005, ['#e8463c', '#3a6ad0', '#2a2a2a'][k], { line: false, seg: 5 });
    block(G, 0.2, 0.04, 0.28, '#3e7a6a', sx * (w * 0.1), tp, -d * 0.22, { ry: 0.3 });
  }
  return G;
}

// ---------- swivel chair ----------
export function swivel_chair(P) {
  const G = new THREE.Group(), col = P.params.color || '#8fb4e0';
  // five-star base with casters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, ex = Math.sin(a) * 0.3, ez = Math.cos(a) * 0.3;
    rod(G, [0, 0.1, 0], [ex, 0.07, ez], 0.022, '#6c7684', { seg: 6 });
    sphere(G, 0.035, '#2c3038', ex, 0.035, ez, { seg: 8, rings: 6 });
  }
  cyl(G, 0.05, 0.06, 0.08, '#6c7684', 0, 0.12, 0, { seg: 12 });
  cyl(G, 0.025, 0.025, 0.32, '#b8c0c8', 0, 0.3, 0, { seg: 10 });
  // seat: a rounded cushion
  const seat = roundRect(0.5, 0.48, 0.08);
  extrude(G, seat, 0.08, col, 0, 0.5, 0, { rx: -Math.PI / 2, order: 'XYZ' }).position.y = 0.46;
  cyl(G, 0.09, 0.09, 0.04, '#6c7684', 0, 0.45, 0, { seg: 10 });
  // backrest on a bar, tilted back
  rod(G, [0, 0.47, -0.2], [0, 0.62, -0.26], 0.02, '#6c7684', { seg: 6 });
  const back = new THREE.Group(); back.position.set(0, 0.62, -0.27); back.rotation.x = -0.12; G.add(back);
  extrude(back, roundRect(0.44, 0.42, 0.12, 0, 0.21), 0.07, col, 0, 0, -0.035);
  extrude(back, roundRect(0.34, 0.3, 0.08, 0, 0.21), 0.01, shade(col, 0.85), 0, 0, 0.036, { line: false });
  // armrests
  for (const s of [-1, 1]) {
    rod(G, [s * 0.24, 0.47, -0.05], [s * 0.26, 0.66, -0.05], 0.016, '#6c7684', { seg: 6 });
    box(G, 0.06, 0.03, 0.26, '#3e444f', s * 0.26, 0.67, -0.03);
  }
  return G;
}

// ---------- the orange sofa (ref: tufted with X stitches) ----------
const cushionTex = (col) => paint('cushion' + col, 128, 128, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.72);
  g.addColorStop(0, shade(col, 1.06)); g.addColorStop(1, shade(col, 0.86));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = shade(col, 0.62); x.lineWidth = 4; x.lineCap = 'round';
  x.beginPath(); x.moveTo(w * 0.42, h * 0.42); x.lineTo(w * 0.58, h * 0.58); x.moveTo(w * 0.58, h * 0.42); x.lineTo(w * 0.42, h * 0.58); x.stroke();
  x.strokeStyle = shade(col, 0.78); x.lineWidth = 2; x.strokeRect(3, 3, w - 6, h - 6);
}, { repeat: false });
export function sofa(P) {
  const G = new THREE.Group(), [w, d] = P.size, col = P.params.color || '#f29a2e', n = P.params.seats || 3;
  const cm = texm(cushionTex(col)), frame = flat(shade(col, 0.82));
  // dark legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(G, 0.03, 0.025, 0.12, '#4a3a30', sx * (w / 2 - 0.12), 0.06, sz * (d / 2 - 0.1), { seg: 8 });
  block(G, w, 0.22, d, frame, 0, 0.12, 0);
  const aw = 0.16, inner = w - 2 * aw, sw = inner / n;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + sw * (i + 0.5);
    block(G, sw - 0.03, 0.16, d - 0.24, cm, x, 0.34, 0.1);
    const b = block(G, sw - 0.03, 0.46, 0.2, cm, x, 0.34, -d / 2 + 0.13);
    b.rotation.x = -0.12;
  }
  // armrests with a rolled top and a dark metal bar (ref: thin frame rails)
  for (const s of [-1, 1]) {
    block(G, aw, 0.36, d, frame, s * (w / 2 - aw / 2), 0.34, 0);
    cyl(G, aw / 2 + 0.01, aw / 2 + 0.01, d, frame, s * (w / 2 - aw / 2), 0.7, 0, { rx: Math.PI / 2, seg: 12 });
    rod(G, [s * (w / 2 + 0.02), 0.2, d / 2 - 0.08], [s * (w / 2 + 0.02), 0.62, d / 2 - 0.08], 0.018, '#5a4a40', { seg: 6 });
  }
  return G;
}

// ---------- drafting table with a blueprint ----------
const blueprintTex = () => paint('blueprint', 256, 192, (x, w, h, R) => {
  x.fillStyle = '#f7f6ef'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#5a7fa8'; x.lineWidth = 1.5;
  x.strokeRect(10, 10, w - 20, h - 20);
  // a ball design: circles, a band, dimension lines
  x.beginPath(); x.arc(w * 0.38, h * 0.52, 52, 0, 6.28); x.stroke();
  x.beginPath(); x.moveTo(w * 0.38 - 52, h * 0.52); x.lineTo(w * 0.38 + 52, h * 0.52); x.stroke();
  x.beginPath(); x.arc(w * 0.38, h * 0.52, 14, 0, 6.28); x.stroke();
  x.setLineDash([4, 3]); x.beginPath(); x.moveTo(w * 0.38, h * 0.12); x.lineTo(w * 0.38, h * 0.92); x.stroke(); x.setLineDash([]);
  for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(w * 0.65, 30 + k * 18); x.lineTo(w * 0.65 + 40 + R() * 40, 30 + k * 18); x.stroke(); }
  x.strokeRect(w * 0.65, h * 0.7, 70, 34);
  x.fillStyle = '#5a7fa8'; x.font = `600 13px ${BODY}`; x.fillText('MODEL 02', w * 0.66, h * 0.66);
});
export function drafting_table(P) {
  const G = new THREE.Group(), [w, d] = P.size, tilt = (P.params.tilt || 38) * Math.PI / 180;
  const steel = '#dfe6ea';
  // two A-frame legs joined by a bar
  for (const s of [-1, 1]) {
    rod(G, [s * (w / 2 - 0.08), 0, d / 2 - 0.1], [s * (w / 2 - 0.08), 1.0, 0], 0.025, steel, { seg: 8 });
    rod(G, [s * (w / 2 - 0.08), 0, -d / 2 + 0.1], [s * (w / 2 - 0.08), 1.0, 0], 0.025, steel, { seg: 8 });
    box(G, 0.08, 0.03, d - 0.1, steel, s * (w / 2 - 0.08), 0.015, 0);
  }
  rod(G, [-w / 2 + 0.08, 0.35, 0], [w / 2 - 0.08, 0.35, 0], 0.02, steel, { seg: 8 });
  // the board, tilted toward +z
  const B = new THREE.Group(); B.position.set(0, 1.05, -0.05); B.rotation.x = tilt; G.add(B);
  box(B, w, 0.035, 0.95, '#f2f4f2', 0, 0, 0);
  box(B, w * 0.62, 0.006, 0.6, texm(blueprintTex()), -0.08, 0.02, -0.04, { line: false });
  box(B, w + 0.04, 0.05, 0.05, '#c9d2d8', 0, 0.03, 0.47);              // pencil ledge
  box(B, w * 0.9, 0.02, 0.05, '#9fb0bc', 0, 0.035, 0.12);              // parallel rule
  // a lamp on an arm
  rod(G, [w / 2 - 0.05, 1.1, -0.35], [w / 2 + 0.05, 1.5, -0.25], 0.012, '#4a5a7a', { seg: 6 });
  rod(G, [w / 2 + 0.05, 1.5, -0.25], [w / 2 - 0.15, 1.55, 0.0], 0.012, '#4a5a7a', { seg: 6 });
  cyl(G, 0.05, 0.1, 0.1, '#4a5a7a', w / 2 - 0.17, 1.52, 0.03, { rx: 0.5, seg: 12 });
  return G;
}

// ---------- bookshelf ----------
const BOOK_COLS = ['#c8463c', '#3e6fb0', '#e0b83a', '#3e8f5e', '#8a4a9a', '#e8803a', '#2f4f6f', '#a8382f', '#5c9a8a', '#d9c7a0', '#7a4e2d', '#4a7ad0'];
export function bookshelf(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, R = rng(hash(P.id || 'shelf') + (p.seed || 0));
  const wd = texm(wood(p.wood || '#9a6a40')), t = 0.035;
  block(G, t, h, d, wd, -w / 2 + t / 2, 0, 0, { uv: 1 });
  block(G, t, h, d, wd, w / 2 - t / 2, 0, 0, { uv: 1 });
  block(G, w, t, d, wd, 0, h - t, 0, { uv: 1 });
  block(G, w - 2 * t, 0.08, d - 0.02, wd, 0, 0, 0.01, { uv: 1 });
  block(G, w - 2 * t, h - 0.1, 0.015, flat(shade(p.wood || '#9a6a40', 0.7)), 0, 0.05, -d / 2 + 0.008, { line: false });
  const n = p.shelves || 5, gap = (h - 0.08 - t) / n;
  for (let i = 0; i < n; i++) {
    const y = 0.08 + i * gap;
    if (i) block(G, w - 2 * t, 0.025, d - 0.02, wd, 0, y - 0.025, 0.01, { uv: 1 });
    // books: a row with gaps, a few leaning, now and then a box or a plant pot
    let x = -w / 2 + t + 0.01;
    const end = w / 2 - t - 0.01;
    while (x < end - 0.03) {
      if (R() < 0.06) { x += 0.08 + R() * 0.1; continue; }
      if (R() < 0.04 && end - x > 0.25) {
        block(G, 0.2, Math.min(gap * 0.5, 0.18), d * 0.7, R() < 0.5 ? '#e9dcc0' : '#c9d6dc', x + 0.1, y, 0.02);
        x += 0.22; continue;
      }
      const bw = 0.025 + R() * 0.035, bh = Math.min(gap - 0.03, gap * (0.6 + R() * 0.32)), bd = d * (0.62 + R() * 0.25);
      if (x + bw > end) break;
      const col = BOOK_COLS[Math.floor(R() * BOOK_COLS.length)];
      const lean = R() < 0.08 ? (R() < 0.5 ? -1 : 1) * (0.12 + R() * 0.2) : 0;
      const b = block(G, bw, bh, bd, col, x + bw / 2, y, (d - bd) / 2 - 0.01 + 0.01);
      if (lean) { b.rotation.z = lean; b.position.x += Math.sin(lean) * -bh / 2; }
      // a band on the spine
      if (R() < 0.5) box(G, bw + 0.002, 0.012, 0.004, shade(col, R() < 0.5 ? 1.45 : 0.6), x + bw / 2, y + bh * (0.7 + R() * 0.15), (d - bd) / 2 + bd / 2 + 0.002, { line: false });
      x += bw + (R() < 0.15 ? 0.004 : 0.001);
    }
  }
  return G;
}

// ---------- tables ----------
export function green_table(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, top = P.params.top || '#7cc07a';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(G, 0.05, h - 0.06, 0.05, '#c7ccd2', sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08));
  block(G, w - 0.1, 0.05, 0.03, '#c7ccd2', 0, h - 0.16, -d / 2 + 0.08);
  block(G, w - 0.1, 0.05, 0.03, '#c7ccd2', 0, h - 0.16, d / 2 - 0.08);
  block(G, w, 0.04, d, '#eceff0', 0, h - 0.06, 0);
  block(G, w - 0.08, 0.025, d - 0.08, top, 0, h - 0.025, 0);
  // papers and a microscope
  block(G, 0.21, 0.004, 0.3, '#f8f6ef', w * 0.28, h, 0.1, { ry: 0.2, line: false });
  block(G, 0.21, 0.004, 0.3, '#f4f0e4', w * 0.3, h + 0.004, 0.06, { ry: -0.1 });
  const mx = w * 0.36, mz = -d * 0.18;
  block(G, 0.16, 0.03, 0.2, '#e9ecee', mx, h, mz);
  rod(G, [mx, h + 0.03, mz - 0.07], [mx, h + 0.26, mz - 0.03], 0.025, '#e9ecee', { seg: 8 });
  box(G, 0.12, 0.012, 0.12, '#3b3f4a', mx, h + 0.12, mz + 0.01);
  cyl(G, 0.025, 0.02, 0.16, '#2f3640', mx, h + 0.27, mz + 0.01, { rx: 0.35, seg: 10 });
  return G;
}

// the starters: a round drum table with a raised holder for three Poké Balls (ref: the anime lab)
export function pokeBall(parent, r, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  sphere(g, r, '#e3473d', 0, 0, 0, { theta: Math.PI / 2, seg: 20, rings: 8 });
  const lo = sphere(g, r, '#f7f7f4', 0, 0, 0, { theta: Math.PI / 2, seg: 20, rings: 8 }); lo.rotation.x = Math.PI;
  torus(g, r * 0.995, r * 0.09, '#23252c', 0, 0, 0, { rx: Math.PI / 2, ts: 24, rs: 6 });
  cyl(g, r * 0.3, r * 0.3, r * 0.14, '#23252c', 0, 0, r * 0.95, { rx: Math.PI / 2, seg: 16 });
  cyl(g, r * 0.2, r * 0.2, r * 0.08, '#fbfbf7', 0, 0, r * 1.03, { rx: Math.PI / 2, seg: 16, line: false });
  return g;
}
export function round_table_holder(P) {
  const G = new THREE.Group(), [w, , h] = P.size, r = w / 2;
  lathe(G, [[0, 0], [r - 0.12, 0], [r - 0.08, 0.06], [r - 0.12, 0.12], [r - 0.18, 0.66], [0, 0.66]], '#7ea7a2', 0, 0, 0, { seg: 32 });
  torus(G, r - 0.155, 0.035, '#e0473e', 0, 0.42, 0, { rx: Math.PI / 2, ts: 40, rs: 6 });
  // the table top: a white rim and a green felt middle
  cyl(G, r, r - 0.02, 0.07, '#eef2ef', 0, 0.7, 0, { seg: 40 });
  cyl(G, r - 0.1, r - 0.1, 0.012, '#4f9a86', 0, 0.74, 0, { seg: 40, line: false });
  // the holder: a raised dais with three sockets
  cyl(G, 0.42, 0.48, 0.16, '#5c6f7a', 0, 0.82, 0, { seg: 32 });
  cyl(G, 0.4, 0.42, 0.03, '#c9d6dc', 0, 0.915, 0, { seg: 32 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3, x = Math.sin(a) * 0.24, z = Math.cos(a) * 0.24;
    torus(G, 0.1, 0.022, '#2a3038', x, 0.94, z, { rx: Math.PI / 2, ts: 20, rs: 6 });
    pokeBall(G, 0.09, x, 1.02, z, a);
  }
  // little status lights round the drum (glow dots are added by interior.js lamps)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(G, 0.05, 0.05, 0.02, i % 2 ? '#7ff0a0' : '#ffd25a', Math.sin(a) * (r - 0.15), 0.55, Math.cos(a) * (r - 0.15), { ry: a, line: false });
  }
  return G;
}

// ---------- lab counter with glassware ----------
export function glassware(G, x, y, z, R, kind) {
  const liquid = ['#7fe0d8', '#f07aa8', '#a6e05a', '#f2c94a', '#8ab6ff'][Math.floor(R() * 5)];
  const glassM = unlit(null, '#d8f0f6');
  if (kind === 0) {           // beaker
    cyl(G, 0.055, 0.05, 0.13, glassM, x, y + 0.065, z, { seg: 14, open: true, noShadow: true });
    cyl(G, 0.048, 0.048, 0.07, unlit(null, liquid), x, y + 0.036, z, { seg: 14 });
  } else if (kind === 1) {    // conical flask
    lathe(G, [[0, 0], [0.07, 0], [0.072, 0.01], [0.02, 0.14], [0.02, 0.2], [0.026, 0.205]], glassM, x, y, z, { seg: 16, noShadow: true });
    lathe(G, [[0, 0.003], [0.066, 0.003], [0.04, 0.07], [0, 0.07]], unlit(null, liquid), x, y, z, { seg: 16 });
  } else if (kind === 2) {    // round flask on a ring stand
    rod(G, [x + 0.08, y, z], [x + 0.08, y + 0.32, z], 0.006, '#7a828c', { seg: 5 });
    block(G, 0.12, 0.012, 0.09, '#5f6670', x + 0.04, y, z);
    sphere(G, 0.06, unlit(null, liquid), x, y + 0.13, z, { seg: 14, rings: 8 });
    cyl(G, 0.018, 0.018, 0.09, glassM, x, y + 0.22, z, { seg: 8, noShadow: true });
    torus(G, 0.06, 0.005, '#7a828c', x, y + 0.13, z, { rx: Math.PI / 2, ts: 14, rs: 4, line: false });
  } else {                    // a rack of test tubes
    block(G, 0.22, 0.05, 0.07, '#e6e0d2', x, y, z);
    for (let k = 0; k < 5; k++) {
      cyl(G, 0.012, 0.012, 0.13, glassM, x - 0.08 + k * 0.04, y + 0.09, z, { seg: 8, noShadow: true, line: false });
      cyl(G, 0.011, 0.011, 0.04 + R() * 0.05, unlit(null, ['#7fe0d8', '#f07aa8', '#a6e05a', '#f2c94a'][k % 4]), x - 0.08 + k * 0.04, y + 0.05, z, { seg: 8, line: false });
    }
  }
}
export function lab_counter(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, R = rng(hash(P.id || 'counter') + (p.seed || 0));
  const body = '#e8ecee';
  block(G, w, 0.1, d - 0.08, '#4a525c', 0, 0, -0.03);                    // toe kick
  block(G, w, h - 0.14, d - 0.04, body, 0, 0.1, -0.01);
  // doors and drawers
  const nd = Math.max(2, Math.round(w / 0.6)), dw = w / nd;
  for (let i = 0; i < nd; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    box(G, dw - 0.03, h - 0.38, 0.02, '#f4f6f6', x, 0.1 + (h - 0.38) / 2 + 0.02, d / 2 - 0.02);
    box(G, dw - 0.03, 0.16, 0.02, '#f4f6f6', x, h - 0.15, d / 2 - 0.02);
    box(G, 0.14, 0.018, 0.02, '#8b96a2', x, h - 0.15, d / 2 + 0.005, { line: false });
    box(G, 0.018, 0.12, 0.02, '#8b96a2', x + (i % 2 ? -1 : 1) * (dw / 2 - 0.08), 0.62, d / 2 + 0.005, { line: false });
  }
  block(G, w + 0.02, 0.04, d, '#2f3742', 0, h - 0.04, 0);                // dark worktop
  block(G, w, 0.12, 0.025, '#2f3742', 0, h, -d / 2 + 0.0125);            // backsplash
  let x = -w / 2 + 0.15;
  if (p.sink) {
    block(G, 0.5, 0.012, 0.38, '#b9c4cc', -w / 2 + 0.45, h, 0.0, { line: false });
    box(G, 0.42, 0.006, 0.3, '#56616c', -w / 2 + 0.45, h + 0.014, 0.0, { line: false });
    rod(G, [-w / 2 + 0.45, h, -0.25], [-w / 2 + 0.45, h + 0.28, -0.25], 0.015, '#c9d2d8', { seg: 8 });
    rod(G, [-w / 2 + 0.45, h + 0.28, -0.25], [-w / 2 + 0.45, h + 0.28, -0.08], 0.015, '#c9d2d8', { seg: 8 });
    x = -w / 2 + 0.85;
  }
  const n = p.glass || 5;
  for (let k = 0; k < n && x < w / 2 - 0.12; k++) {
    glassware(G, x, h, (R() - 0.5) * 0.25, R, Math.floor(R() * 4));
    x += 0.2 + R() * 0.18;
  }
  return G;
}

// ---------- crates and cabinets ----------
export function crate(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params, R = rng(hash(P.id || 'crate') + (p.seed || 0));
  const one = (s, x, y, z, ry) => {
    const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.y = ry; G.add(c);
    const col = ['#c89a5e', '#b98a52', '#d4a86a'][Math.floor(R() * 3)];
    block(c, w * s, h * s, w * s, texm(planks(col, 5)), 0, 0, 0, { uv: 1 / (w * s) });
    const bt = 0.05 * s, e = w * s / 2;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) block(c, bt, h * s, bt, shade(col, 0.72), a * (e - bt / 2 + 0.006), 0, b * (e - bt / 2 + 0.006));
    for (const yy of [0, h * s - bt]) for (const sz of [-1, 1]) block(c, w * s, bt, bt, shade(col, 0.72), 0, yy, sz * (e - bt / 2 + 0.006));
  };
  one(1, 0, 0, 0, 0);
  if ((p.stack || 1) > 1) one(0.72, (R() - 0.5) * 0.08, h, (R() - 0.5) * 0.08, (R() - 0.5) * 0.5);
  return G;
}
export function filing_cabinet(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, col = P.params.color || '#a9b4bc';
  block(G, w, h, d, texm(metal(col)), 0, 0, 0, { uv: 1 });
  for (let i = 0; i < 4; i++) {
    const dh = (h - 0.06) / 4, y = 0.03 + dh * i;
    box(G, w - 0.05, dh - 0.03, 0.02, shade(col, 1.08), 0, y + dh / 2, d / 2);
    box(G, 0.16, 0.025, 0.03, '#5f6873', 0, y + dh * 0.55, d / 2 + 0.02, { line: false });
    box(G, 0.09, 0.04, 0.005, '#f4f1e6', 0, y + dh * 0.78, d / 2 + 0.012, { line: false });
  }
  return G;
}
export function door_mat(P) {
  const G = new THREE.Group(), [w, d] = P.size, col = P.params.color || '#a64a3a';
  const t = paint('mat' + col, 256, 160, (x, W, H) => {
    x.fillStyle = col; x.fillRect(0, 0, W, H);
    x.strokeStyle = shade(col, 1.35); x.lineWidth = 6; x.strokeRect(12, 12, W - 24, H - 24);
    // (mirrored: the mat's plane is seen from above with u running backwards)
    x.save(); x.translate(W, 0); x.scale(-1, 1);
    x.fillStyle = shade(col, 1.4); fitText(x, 'WELCOME', 52, W * 0.7, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('WELCOME', W / 2, H / 2 + 2);
    x.restore();
  }, { repeat: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), texm(t));
  m.position.y = 0.011; m.receiveShadow = true; m.userData.outline = false; G.add(m);
  return G;
}
export function rug(P) {
  const G = new THREE.Group(), [w, d] = P.size, col = P.params.color || '#7d6db8';
  const t = paint('rug' + col, 256, 192, (x, W, H) => {
    x.fillStyle = col; x.fillRect(0, 0, W, H);
    x.strokeStyle = shade(col, 1.4); x.lineWidth = 8; x.strokeRect(14, 14, W - 28, H - 28);
    x.strokeStyle = shade(col, 0.75); x.lineWidth = 4; x.strokeRect(28, 28, W - 56, H - 56);
  }, { repeat: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), texm(t));
  m.position.y = 0.008; m.receiveShadow = true; m.userData.outline = false; G.add(m);
  return G;
}
void DARK; void plane; void torus;
