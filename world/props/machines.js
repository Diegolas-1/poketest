// Machines of the lab: Oak's computer console (with the pink beacon), desk
// computers and Pokédex tablets, the big specimen tank under its funnel, the
// machinery blocks with dials, gauges and red beacons, the tall cylinder
// machine with its green gauge, the green fluid tank and the capsule machine.
// Same contract as furniture.js: footprint centred on the origin, on y 0,
// front toward +z. Glowing parts (screens, fluids) are 'unlit' materials.
import * as THREE from 'three';
import { rng, hash, shade, paint, flat, texm, unlit, box, block, cyl, sphere, torus, lathe, rod, extrude, roundRect, metal, BODY, HEAD, fitText } from './kit.js';

// ---------- painted panels ----------
// riveted machine panel: seams and rivets (1 texture = 1 m)
export const panelTex = (col) => paint('mpanel' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.08;
  for (let k = 0; k < 24; k++) { x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.7); x.fillRect(0, R() * h, w, 1 + R() * 2); }
  x.globalAlpha = 1;
  x.fillStyle = shade(col, 0.74);
  for (const p of [0, 128]) { x.fillRect(p, 0, 2, h); x.fillRect(0, p, w, 2); }
  x.fillStyle = 'rgba(255,255,255,.35)';
  for (const p of [2, 130]) { x.fillRect(p, 0, 1.5, h); x.fillRect(0, p, w, 1.5); }
  x.fillStyle = shade(col, 0.6);
  for (const a of [10, 118, 138, 246]) for (const b of [10, 118, 138, 246]) { x.beginPath(); x.arc(a, b, 2.6, 0, 6.28); x.fill(); }
});
// a CRT screen: dark blue with glowing charts and text lines
const screenTex = (kind) => paint('screen' + kind, 256, 192, (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b6fd0'); g.addColorStop(1, '#173f8f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(160,230,255,.25)'; x.lineWidth = 1;
  for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  for (let i = 0; i < h; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  if (kind === 'chart') {
    x.strokeStyle = '#9ff3ff'; x.lineWidth = 3; x.beginPath();
    for (let i = 0; i <= 20; i++) { const px = 16 + i * (w * 0.55 / 20), py = h * 0.7 - Math.sin(i * 0.5) * 22 - i * 3; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    x.fillStyle = '#ffe27a'; for (let i = 0; i < 6; i++) x.fillRect(w * 0.66 + i * 13, h * 0.75 - (10 + R() * 50), 9, 10 + R() * 50 - 0 + 0);
    x.fillStyle = 'rgba(220,250,255,.85)'; for (let i = 0; i < 4; i++) x.fillRect(16, 14 + i * 9, 50 + R() * 70, 4);
    x.beginPath(); x.arc(w * 0.82, h * 0.28, 22, 0, 6.28); x.strokeStyle = '#ff9fd0'; x.lineWidth = 6; x.stroke();
  } else {
    // the Pokédex program: a list with question marks
    x.fillStyle = '#e8463c'; x.fillRect(0, 0, w, 26);
    x.fillStyle = '#fff'; x.font = `600 16px ${BODY}`; x.fillText('POKéDEX', 10, 19);
    for (let i = 0; i < 7; i++) {
      x.fillStyle = 'rgba(230,250,255,.9)'; x.fillRect(12, 36 + i * 21, 24, 14);
      x.fillStyle = '#cfe8ff'; x.font = `600 13px ${BODY}`; x.fillText(String(i + 1).padStart(3, '0') + (i < 3 ? '  ' + ['BULB...', 'IVY...', 'VENU...'][i] : '  ??????'), 44, 48 + i * 21);
    }
  }
  // scan lines and a sheen
  x.fillStyle = 'rgba(0,0,40,.18)'; for (let i = 0; i < h; i += 3) x.fillRect(0, i, w, 1);
  const s = x.createLinearGradient(0, 0, w, h); s.addColorStop(0, 'rgba(255,255,255,.22)'); s.addColorStop(0.4, 'rgba(255,255,255,0)');
  x.fillStyle = s; x.fillRect(0, 0, w, h);
}, { repeat: false });
const keysTex = () => paint('keys', 256, 64, (x, w, h) => {
  x.fillStyle = '#d8dde2'; x.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 18; c++) { x.fillStyle = (r + c) % 7 ? '#f6f8f9' : '#ffd27a'; x.fillRect(6 + c * 13.6 + (r % 2) * 4, 5 + r * 14.5, 11, 11); }
}, { repeat: false });
const ventTex = () => paint('vent', 128, 128, (x, w, h) => {
  x.fillStyle = '#8f9aa4'; x.fillRect(0, 0, w, h);
  for (let i = 8; i < h - 6; i += 10) { x.fillStyle = '#4c5560'; x.fillRect(8, i, w - 16, 5); x.fillStyle = '#c9d0d6'; x.fillRect(8, i + 5, w - 16, 2); }
}, { repeat: false });

// a round dial: bezel, white face with ticks, a needle (front faces +z)
const dialTex = () => paint('dial', 128, 128, (x, w, h) => {
  x.fillStyle = '#f8f7f0'; x.beginPath(); x.arc(64, 64, 62, 0, 6.28); x.fill();
  x.strokeStyle = '#2d3138'; x.lineWidth = 3;
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.8 + i * 0.14); x.beginPath(); x.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); x.lineTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); x.stroke(); }
  x.strokeStyle = '#e0473e'; x.beginPath(); x.arc(64, 64, 46, Math.PI * 2.0, Math.PI * 2.2); x.lineWidth = 6; x.stroke();
}, { repeat: false });
export function dial(G, r, x, y, z, a = 0.4, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; G.add(g);
  cyl(g, r * 1.15, r * 1.2, 0.05, '#5c656e', 0, 0, 0.02, { rx: Math.PI / 2, seg: 18 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 20), texm(dialTex())); face.position.z = 0.046; face.userData.outline = false; g.add(face);
  const n = box(g, r * 0.08, r * 0.85, 0.01, '#23252c', 0, 0, 0.052, { line: false });
  n.geometry.translate(0, r * 0.38, 0); n.rotation.z = a;
  return g;
}
// a beacon: a dome lamp on a short stand (glow halo added by interior.js lamps)
export function beacon(G, col, x, y, z, s = 1) {
  cyl(G, 0.09 * s, 0.11 * s, 0.08 * s, '#3b414a', x, y + 0.04 * s, z, { seg: 14 });
  lathe(G, [[0, 0], [0.085 * s, 0], [0.085 * s, 0.08 * s], [0.06 * s, 0.15 * s], [0, 0.17 * s]], unlit(null, col), x, y + 0.08 * s, z, { seg: 16 });
  torus(G, 0.087 * s, 0.012 * s, '#3b414a', x, y + 0.11 * s, z, { rx: Math.PI / 2, ts: 18, rs: 4, line: false });
}

// ---------- Oak's computer console (ref: THE CHAIR) ----------
export function computer_console(P) {
  const G = new THREE.Group(), [w, d] = P.size, p = P.params;
  const white = texm(panelTex('#e6eaec')), grey = texm(panelTex('#cfd6db'));
  // the desk part with a sloped control deck
  block(G, w, 0.72, d, white, 0, 0, 0, { uv: 1 });
  const deck = new THREE.Shape(); deck.moveTo(-d / 2, 0); deck.lineTo(d / 2, 0); deck.lineTo(d / 2, 0.06); deck.lineTo(-d / 2 + 0.25, 0.24); deck.lineTo(-d / 2, 0.24); deck.lineTo(-d / 2, 0);
  // extruded along -x after the turn, so the deck's high back edge is at -z
  extrude(G, deck, w * 0.94, grey, w * 0.47, 0.72, 0, { ry: -Math.PI / 2, uv: 1 });
  // keyboard and buttons on the slope
  const K = new THREE.Group(); K.position.set(0, 0.72 + 0.155, 0.12); K.rotation.x = Math.atan2(0.18, d - 0.25); G.add(K);
  box(K, w * 0.36, 0.02, 0.24, texm(keysTex()), -w * 0.1, 0.012, 0);
  const cols = ['#e8463c', '#3fbf6a', '#ffd25a', '#4a8ad0'];
  for (let i = 0; i < 8; i++) box(K, 0.05, 0.025, 0.05, cols[i % 4], w * 0.18 + (i % 4) * 0.08, 0.015, (i < 4 ? -0.06 : 0.06), { line: false });
  for (const sx of [-1, 1]) dial(K, 0.055, sx * w * 0.4, 0.04, 0, 0.3 * sx, 0).rotation.x = -Math.PI / 2;
  // the tall rack at the back with the screen
  const rw = w * 0.62, rd = 0.42;
  block(G, rw, 1.3, rd, white, -w * 0.12, 0.96, -d / 2 + rd / 2, { uv: 1 });
  block(G, rw + 0.06, 0.06, rd + 0.04, grey, -w * 0.12, 2.26, -d / 2 + rd / 2);
  const sx = -w * 0.12, sz = -d / 2 + rd + 0.006;
  box(G, rw * 0.72, 0.62, 0.04, '#3b4250', sx, 1.52, sz, {});
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(rw * 0.64, 0.52), unlit(screenTex('chart'))); scr.position.set(sx, 1.52, sz + 0.022); scr.userData.outline = false; G.add(scr);
  box(G, rw * 0.5, 0.12, 0.02, texm(ventTex()), sx, 1.06, sz - 0.002, { line: false });
  for (let i = 0; i < 6; i++) box(G, 0.04, 0.04, 0.02, i % 3 ? '#7ff0a0' : '#ff6a5a', sx + rw * 0.28 + 0.0, 1.0 + i * 0.12, sz, { line: false });
  // a low side unit with tape reels (the other end)
  const ox = w / 2 - 0.36;
  block(G, 0.66, 0.62, 0.4, white, ox, 0.96, -d / 2 + 0.2, { uv: 1 });
  for (const rx of [-0.15, 0.15]) {
    cyl(G, 0.11, 0.11, 0.03, '#3b4250', ox + rx, 1.32, -d / 2 + 0.41, { rx: Math.PI / 2, seg: 18 });
    cyl(G, 0.035, 0.035, 0.04, '#c9d0d6', ox + rx, 1.32, -d / 2 + 0.42, { rx: Math.PI / 2, seg: 10, line: false });
  }
  // the pink beacon on a stand beside it (ref)
  rod(G, [-w / 2 - 0.0, 0.72, -0.1], [-w / 2 - 0.0, 1.75, -0.1], 0.03, '#3b414a', { seg: 8 });
  cyl(G, 0.18, 0.2, 0.05, '#3b414a', -w / 2, 1.18, -0.1, { seg: 16 });
  beacon(G, p.beacon || '#ff5ea8', -w / 2, 1.72, -0.1, 1.6);
  return G;
}

// a beige CRT and keyboard for a desk (ref: the game's lab computers)
export function desk_computer(P) {
  const G = new THREE.Group();
  block(G, 0.26, 0.04, 0.22, '#d9dbd6', 0, 0, -0.1);
  rod(G, [0, 0.04, -0.1], [0, 0.1, -0.1], 0.04, '#cfd1cc', { seg: 10 });
  block(G, 0.46, 0.36, 0.36, '#e3e4dc', 0, 0.1, -0.12);
  block(G, 0.34, 0.28, 0.12, '#cfd1c8', 0, 0.14, -0.33);
  box(G, 0.4, 0.3, 0.02, '#3b4250', 0, 0.28, 0.065);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26), unlit(screenTex('dex'))); s.position.set(0, 0.28, 0.077); s.userData.outline = false; G.add(s);
  box(G, 0.44, 0.022, 0.15, texm(keysTex()), 0, 0.011, 0.2, {});
  // a little tower beside it
  block(G, 0.16, 0.36, 0.34, '#e3e4dc', 0.36, 0, -0.08);
  box(G, 0.1, 0.02, 0.005, '#3b4250', 0.36, 0.28, 0.092, { line: false });
  box(G, 0.025, 0.025, 0.005, '#7ff0a0', 0.4, 0.06, 0.092, { line: false });
  return G;
}
// a red Pokédex propped on its stand
export function tablet(P) {
  const G = new THREE.Group(), col = P.params.color || '#e0453e';
  block(G, 0.14, 0.012, 0.1, '#3b414a', 0, 0, -0.05);
  const T = new THREE.Group(); T.position.set(0, 0.012, 0.0); T.rotation.x = -1.05; G.add(T);
  block(T, 0.24, 0.32, 0.035, col, 0, 0, 0);
  box(T, 0.17, 0.13, 0.006, '#2a3a52', 0, 0.2, 0.019);
  box(T, 0.15, 0.11, 0.004, unlit(null, '#9fe0ff'), 0, 0.2, 0.023, { line: false });
  sphere(T, 0.022, unlit(null, '#5fd6ff'), -0.08, 0.06, 0.018, { seg: 10, rings: 6, line: false });
  box(T, 0.08, 0.018, 0.006, shade(col, 0.7), 0.04, 0.07, 0.019, { line: false });
  box(T, 0.004, 0.32, 0.03, shade(col, 0.72), -0.045, 0.16, 0.0, { line: false });
  return G;
}

// ---------- the specimen tank (ref: glowing cyan fluid under a steel funnel and duct) ----------
const fluidTex = (col) => paint('fluid' + col, 128, 256, (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(col, 1.18)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, 0.72));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // caustic ribbons and bubbles
  x.globalAlpha = 0.35; x.strokeStyle = '#ffffff'; x.lineWidth = 2;
  for (let k = 0; k < 6; k++) { x.beginPath(); const x0 = R() * w; for (let y = 0; y <= h; y += 8) x.lineTo(x0 + Math.sin(y * 0.05 + k) * 10, y); x.stroke(); }
  x.globalAlpha = 0.7; x.fillStyle = '#ffffff';
  for (let k = 0; k < 40; k++) { x.beginPath(); x.arc(R() * w, R() * h, 1 + R() * 3, 0, 6.28); x.fill(); }
  // the glass's highlights: two bright vertical stripes
  x.globalAlpha = 0.55; x.fillRect(w * 0.18, 0, 5, h); x.globalAlpha = 0.3; x.fillRect(w * 0.27, 0, 2, h);
  x.globalAlpha = 1;
});
export function specimen_tank(P) {
  const G = new THREE.Group(), [w] = P.size, p = P.params, r = w / 2 - 0.1;
  const steel = texm(metal('#b9c6cf')), dark = '#6f7c88';
  lathe(G, [[0, 0], [r + 0.1, 0], [r + 0.1, 0.18], [r + 0.02, 0.24], [r + 0.02, 0.38], [0, 0.38]], steel, 0, 0, 0, { seg: 36 });
  torus(G, r + 0.03, 0.035, dark, 0, 0.38, 0, { rx: Math.PI / 2, ts: 40, rs: 6 });
  const fh = 2.15;
  const fl = cyl(G, r - 0.05, r - 0.05, fh, unlit(fluidTex(p.fluid || '#5fe8e6')), 0, 0.38 + fh / 2, 0, { seg: 36, noShadow: true });
  fl.userData.outline = 'skip';
  // steel bands holding the glass
  for (const yy of [0.42, 0.38 + fh - 0.04]) torus(G, r - 0.03, 0.05, steel, 0, yy, 0, { rx: Math.PI / 2, ts: 40, rs: 6 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; rod(G, [Math.sin(a) * (r - 0.02), 0.4, Math.cos(a) * (r - 0.02)], [Math.sin(a) * (r - 0.02), 0.38 + fh, Math.cos(a) * (r - 0.02)], 0.035, steel, { seg: 8 }); }
  // the funnel and the duct up into the ceiling
  const y0 = 0.38 + fh;
  lathe(G, [[0, 0], [r + 0.08, 0], [r + 0.08, 0.14], [r * 0.9, 0.22], [0.42, 0.78], [0.38, 0.86], [0, 0.86]], steel, 0, y0, 0, { seg: 36 });
  const top = p.duct || 4.6;
  cyl(G, 0.36, 0.36, top - (y0 + 0.86), steel, 0, (top + y0 + 0.86) / 2, 0, { seg: 24, uv: 1 });
  for (let yy = y0 + 1.3; yy < top - 0.2; yy += 0.9) torus(G, 0.37, 0.035, dark, 0, yy, 0, { rx: Math.PI / 2, ts: 24, rs: 5 });
  // a small control box on the base
  block(G, 0.5, 0.32, 0.12, '#d6dde2', 0, 0.05, r + 0.08);
  for (let i = 0; i < 3; i++) box(G, 0.06, 0.06, 0.02, ['#ff6a5a', '#7ff0a0', '#ffd25a'][i], -0.12 + i * 0.12, 0.26, r + 0.15, { line: false });
  return G;
}

// ---------- machinery block (ref: dials, gauges and a red beacon) ----------
export function machinery_block(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, R = rng(hash(P.id || 'mach') + (p.seed || 0));
  const col = p.color || '#b9c8c6', pm = texm(panelTex(col)), dk = texm(panelTex(shade(col, 0.82)));
  block(G, w + 0.08, 0.14, d + 0.08, '#5d6872', 0, 0, 0);
  block(G, w, h * 0.7, d, pm, 0, 0.14, 0, { uv: 1 });
  // stepped upper body, set back
  block(G, w * 0.66, h * 0.3 - 0.14, d * 0.7, dk, -w * 0.12, 0.14 + h * 0.7, -d * 0.15, { uv: 1 });
  beacon(G, p.beacon || '#ff4a3a', -w * 0.12, h, -d * 0.15, 1.5);
  // front: a window gauge, dials, buttons, a vent
  const fz = d / 2;
  box(G, w * 0.38, 0.42, 0.04, '#3e4752', -w * 0.22, h * 0.52, fz + 0.01);
  box(G, w * 0.34, 0.36, 0.01, unlit(null, '#ffe7a0'), -w * 0.22, h * 0.52, fz + 0.035, { line: false });
  box(G, 0.02, 0.32, 0.012, '#e0473e', -w * 0.22 + (R() - 0.5) * w * 0.25, h * 0.52, fz + 0.042, { line: false });
  const nd = p.dials || 4;
  for (let i = 0; i < nd; i++) dial(G, 0.1 + (i % 2) * 0.02, w * 0.12 + (i % 2) * 0.26, h * 0.62 - Math.floor(i / 2) * 0.3, fz, (R() - 0.5) * 2);
  const cols = ['#e8463c', '#3fbf6a', '#ffd25a', '#4a8ad0', '#f2f2ee'];
  for (let i = 0; i < 10; i++) box(G, 0.07, 0.07, 0.04, cols[i % 5], -w * 0.38 + (i % 5) * 0.12, h * 0.28 + Math.floor(i / 5) * 0.12, fz + 0.01, { line: false });
  box(G, w * 0.3, 0.3, 0.02, texm(ventTex()), w * 0.25, h * 0.2, fz + 0.005, { line: false });
  // pipes out of the side into the floor
  const side = w / 2;
  rod(G, [side, h * 0.5, 0.15], [side + 0.3, h * 0.5, 0.15], 0.07, '#8cc4a2', { seg: 12 });
  sphere(G, 0.07, '#8cc4a2', side + 0.3, h * 0.5, 0.15, { seg: 12, rings: 8 });
  rod(G, [side + 0.3, h * 0.5, 0.15], [side + 0.3, 0.0, 0.15], 0.07, '#8cc4a2', { seg: 12 });
  cyl(G, 0.11, 0.11, 0.05, '#6f9e84', side + 0.3, h * 0.5 - 0.3, 0.15, { seg: 12 });
  // a hatch with a wheel on the left side
  box(G, 0.02, 0.7, 0.6, dk, -side - 0.01, h * 0.38, 0.0);
  torus(G, 0.13, 0.02, '#e0473e', -side - 0.06, h * 0.38, 0.0, { ry: Math.PI / 2, ts: 18, rs: 5 });
  return G;
}

// ---------- tall cylinder machine (ref: blue-grey with a green gauge) ----------
export function cylinder_machine(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params, r = w / 2 - 0.05, col = p.color || '#9fb2cf';
  const m = texm(metal(col));
  lathe(G, [[0, 0], [r + 0.05, 0], [r + 0.05, 0.12], [r, 0.16], [r, h - 0.5], [r * 0.92, h - 0.28], [r * 0.6, h - 0.1], [0, h]], m, 0, 0, 0, { seg: 32 });
  for (const yy of [0.5, h * 0.55, h - 0.5]) torus(G, r + 0.01, 0.035, shade(col, 0.7), 0, yy, 0, { rx: Math.PI / 2, ts: 32, rs: 5 });
  // the gauge: a dark panel of green bars facing +z
  const gz = r + 0.005;
  box(G, 0.3, 0.9, 0.05, '#2c3440', 0, h * 0.42, gz);
  for (let i = 0; i < 8; i++) box(G, 0.22, 0.075, 0.02, unlit(null, i < 6 ? (p.gauge || '#58d36a') : '#1f4a2a'), 0, h * 0.42 - 0.36 + i * 0.1, gz + 0.03, { line: false });
  box(G, 0.36, 0.14, 0.04, '#d6dde2', 0, h * 0.42 + 0.56, gz - 0.01);
  // hatch, bolts and a pipe going up
  box(G, 0.5, 0.6, 0.03, shade(col, 0.9), 0, 0.55, gz - 0.005);
  rod(G, [0, h - 0.08, 0], [0, h + 0.6, 0], 0.08, '#8cc4a2', { seg: 12 });
  return G;
}

// ---------- green fluid tank in a frame (ref: the machine by the drafting table) ----------
export function green_tank_machine(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, col = p.color || '#a9bdb4';
  const pm = texm(panelTex(col));
  block(G, w, 0.5, d, pm, 0, 0, 0, { uv: 1 });
  const r = Math.min(w, d) / 2 - 0.14, th = h - 1.1;
  cyl(G, r, r, th, unlit(fluidTex(p.fluid || '#8fe36a')), -w * 0.12, 0.5 + th / 2, 0, { seg: 28, noShadow: true }).userData.outline = 'skip';
  for (const yy of [0.52, 0.5 + th]) torus(G, r + 0.02, 0.05, shade(col, 0.8), -w * 0.12, yy, 0, { rx: Math.PI / 2, ts: 28, rs: 6 });
  block(G, w, 0.4, d, pm, 0, 0.5 + th, 0, { uv: 1 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) rod(G, [s * (w / 2 - 0.06), 0.5, t * (d / 2 - 0.06)], [s * (w / 2 - 0.06), 0.5 + th, t * (d / 2 - 0.06)], 0.045, shade(col, 0.78), { seg: 8 });
  // side panel with dials
  block(G, 0.34, th * 0.8, d * 0.8, pm, w / 2 - 0.2, 0.5, 0);
  for (let i = 0; i < 3; i++) dial(G, 0.08, w / 2 - 0.2, 0.9 + i * 0.36, d * 0.4 + 0.0, (i - 1) * 0.8);
  beacon(G, '#ff4a3a', w * 0.25, 0.9 + th, 0.1, 1.1);
  return G;
}

// ---------- capsule machine (ref: white, red dome) ----------
export function capsule_machine(P) {
  const G = new THREE.Group(), [w, , h] = P.size, p = P.params, r = w / 2 - 0.16;
  const white = '#f3f4f2';
  // feet
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; block(G, 0.18, 0.12, 0.34, '#d9dcdc', Math.sin(a) * (r + 0.05), 0, Math.cos(a) * (r + 0.05), { ry: a }); }
  lathe(G, [[0, 0.08], [r + 0.04, 0.08], [r + 0.06, 0.2], [r, 0.55], [0, 0.55]], white, 0, 0, 0, { seg: 32 });
  torus(G, r + 0.01, 0.03, '#c9cfd2', 0, 0.55, 0, { rx: Math.PI / 2, ts: 32, rs: 5 });
  // the glass chamber
  cyl(G, r - 0.02, r - 0.02, 0.6, unlit(null, '#bfe6f6'), 0, 0.85, 0, { seg: 32, noShadow: true });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; rod(G, [Math.sin(a) * r, 0.55, Math.cos(a) * r], [Math.sin(a) * r, 1.15, Math.cos(a) * r], 0.04, white, { seg: 8 }); }
  lathe(G, [[0, 0], [r + 0.04, 0], [r + 0.04, 0.16], [r * 0.82, 0.22], [0, 0.22]], white, 0, 1.15, 0, { seg: 32 });
  sphere(G, r * 0.82, p.dome || '#e0473e', 0, 1.36, 0, { theta: Math.PI / 2, seg: 28, rings: 10 });
  // a front console with a keypad
  block(G, 0.42, 0.9, 0.22, white, 0, 0, r + 0.12);
  const K = new THREE.Group(); K.position.set(0, 0.92, r + 0.16); K.rotation.x = -0.6; G.add(K);
  box(K, 0.4, 0.03, 0.26, white, 0, 0, 0);
  for (let i = 0; i < 9; i++) box(K, 0.06, 0.02, 0.05, i === 4 ? '#e0473e' : '#9fb0bc', -0.08 + (i % 3) * 0.08, 0.02, -0.07 + Math.floor(i / 3) * 0.07, { line: false });
  void h; void BODY; void HEAD; void fitText; void roundRect; void flat; void rng;
  return G;
}
