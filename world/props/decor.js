// Decor and hanging things: potted plants, notice boards, framed pictures,
// vents, clocks, the globe, the desk lamp, the big industrial pendant lamp,
// the chain hoist, ceiling panel lights and a door. Wall props have their back
// on z = -d/2 (against the wall) and their middle at y 0 (the placement's y is
// the height of their middle); ceiling props hang down from y 0.
import * as THREE from 'three';
import { makeBush, TILE } from '../foliage.js';
import { rng, hash, shade, paint, flat, texm, unlit, box, block, cyl, sphere, torus, lathe, rod, plane, planks, metal, HEAD, BODY, fitText } from './kit.js';

// ---------- potted plant ----------
export function potted_plant(P) {
  const G = new THREE.Group(), p = P.params, s = p.size || 0.55, pot = p.pot || '#c86a3e';
  lathe(G, [[0, 0], [0.2, 0], [0.24, 0.04], [0.27, 0.42], [0.3, 0.44], [0.3, 0.5], [0.25, 0.5], [0, 0.46]], pot, 0, 0, 0, { seg: 20 });
  cyl(G, 0.25, 0.25, 0.02, '#5a3f2a', 0, 0.45, 0, { seg: 20, line: false });
  const R = rng(hash(P.id || 'plant') + (p.seed || 0));
  const bush = makeBush(500 + Math.floor(R() * 400), { size: s, flowers: R() < 0.3 ? TILE.flowersY : null });
  const L = new THREE.Group(); L.position.y = 0.42; G.add(L);
  for (const part of bush.parts) { const m = new THREE.Mesh(part.geometry, part.material); m.castShadow = true; m.receiveShadow = true; m.userData.outline = 'leaf'; L.add(m); }
  return G;
}

// ---------- notice board: 'pinned' (cork with papers) or 'chalk' ----------
export function notice_board(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, key = (P.id || 'board') + p.title;
  const style = p.style || 'pinned', lines = p.lines || [];
  const t = paint('board' + key, 512, Math.round(512 * (h - 0.1) / (w - 0.1)), (x, W, H, R) => {
    if (style === 'chalk') {
      x.fillStyle = '#2f5246'; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.06; x.fillStyle = '#fff'; for (let k = 0; k < 12; k++) { x.beginPath(); x.ellipse(R() * W, R() * H, 60 + R() * 90, 12 + R() * 16, R(), 0, 6.28); x.fill(); }
      x.globalAlpha = 1; x.textAlign = 'center'; x.fillStyle = '#fff6dc';
      fitText(x, p.title, H * 0.17, W * 0.84, HEAD); x.fillText(p.title, W / 2, H * 0.22);
      x.strokeStyle = '#f3c443'; x.lineWidth = 4; x.beginPath(); x.moveTo(W * 0.2, H * 0.29); x.lineTo(W * 0.8, H * 0.29); x.stroke();
      x.textAlign = 'left';
      lines.forEach((l, i) => { x.fillStyle = ['#bfeee6', '#ffe0a0', '#ffc7bd'][i % 3]; fitText(x, l, H * 0.1, W * 0.84, BODY, 600); x.fillText(l, W * 0.08, H * (0.45 + i * 0.16)); });
    } else {
      x.fillStyle = '#c99a62'; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.25; for (let k = 0; k < 900; k++) { x.fillStyle = R() < 0.5 ? '#a8783e' : '#e0b67a'; x.fillRect(R() * W, R() * H, 2, 2); }
      x.globalAlpha = 1;
      // a header paper, then pinned notes and a photo
      const paper = (px, py, pw, ph, col, rot) => { x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(-pw / 2 + 4, -ph / 2 + 5, pw, ph); x.fillStyle = col; x.fillRect(-pw / 2, -ph / 2, pw, ph); x.restore(); };
      paper(W / 2, H * 0.16, W * 0.62, H * 0.2, '#fdfbf2', -0.01);
      x.fillStyle = '#2f4f6f'; x.textAlign = 'center'; fitText(x, p.title, H * 0.12, W * 0.56, HEAD); x.fillText(p.title, W / 2, H * 0.2);
      lines.forEach((l, i) => {
        const px = W * (0.27 + (i % 2) * 0.45), py = H * (0.5 + Math.floor(i / 2) * 0.3), rot = (R() - 0.5) * 0.12;
        paper(px, py, W * 0.38, H * 0.24, ['#fff7c2', '#d9f1ff', '#ffe1e8'][i % 3], rot);
        x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = '#3a3f4f'; x.textAlign = 'center';
        const words = l.split(' '), mid = Math.ceil(words.length / 2), a = words.slice(0, mid).join(' '), b = words.slice(mid).join(' ');
        fitText(x, a, H * 0.07, W * 0.34, BODY, 600); x.fillText(a, 0, -H * 0.02); x.fillText(b, 0, H * 0.07);
        x.restore();
        x.fillStyle = ['#e0473e', '#3e7ad0', '#3fbf6a'][i % 3]; x.beginPath(); x.arc(px, py - H * 0.1, 7, 0, 6.28); x.fill();
      });
      if (lines.length < 4) paper(W * 0.72, H * (0.5 + Math.floor(lines.length / 2) * 0.3), W * 0.3, H * 0.22, '#9fd0e8', 0.06);
    }
  }, { repeat: false });
  const frame = style === 'chalk' ? '#7a5234' : '#a8784a';
  const back = -d / 2;
  box(G, w, h, 0.03, frame, 0, 0, back + 0.015);
  box(G, w - 0.1, h - 0.1, 0.012, texm(t), 0, 0, back + 0.036, { line: false });
  for (const s of [-1, 1]) { box(G, w, 0.05, 0.05, frame, 0, s * (h / 2 - 0.025), back + 0.04); box(G, 0.05, h, 0.05, frame, s * (w / 2 - 0.025), 0, back + 0.04); }
  if (style === 'chalk') { box(G, w - 0.1, 0.03, 0.07, frame, 0, -h / 2 + 0.06, back + 0.08); box(G, 0.08, 0.015, 0.015, '#fffdf2', -0.2, -h / 2 + 0.083, back + 0.09, { line: false }); }
  return G;
}

// ---------- framed picture ----------
export function framed_picture(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, p = P.params, art = p.art || 'landscape';
  const t = paint('pic' + art + (p.seed || 0), 192, 240, (x, W, H, R) => {
    if (art === 'pokemon') {
      // an old naturalist's plate: a round, long-eared creature on cream paper
      x.fillStyle = '#f2ead4'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#f4d65a'; x.beginPath(); x.ellipse(W / 2, H * 0.56, W * 0.26, H * 0.22, 0, 0, 6.28); x.fill();
      x.beginPath(); x.moveTo(W * 0.36, H * 0.42); x.lineTo(W * 0.26, H * 0.16); x.lineTo(W * 0.43, H * 0.38); x.fill();
      x.beginPath(); x.moveTo(W * 0.64, H * 0.42); x.lineTo(W * 0.74, H * 0.16); x.lineTo(W * 0.57, H * 0.38); x.fill();
      x.fillStyle = '#2d2a2a'; x.beginPath(); x.moveTo(W * 0.26, H * 0.16); x.lineTo(W * 0.3, H * 0.26); x.lineTo(W * 0.33, H * 0.25); x.fill();
      x.beginPath(); x.moveTo(W * 0.74, H * 0.16); x.lineTo(W * 0.7, H * 0.26); x.lineTo(W * 0.67, H * 0.25); x.fill();
      x.beginPath(); x.arc(W * 0.42, H * 0.52, 5, 0, 6.28); x.arc(W * 0.58, H * 0.52, 5, 0, 6.28); x.fill();
      x.fillStyle = '#e8584a'; x.beginPath(); x.arc(W * 0.35, H * 0.6, 8, 0, 6.28); x.arc(W * 0.65, H * 0.6, 8, 0, 6.28); x.fill();
      x.fillStyle = '#6b5a40'; x.font = `600 15px ${BODY}`; x.textAlign = 'center'; x.fillText('No. 025', W / 2, H * 0.9);
    } else if (art === 'diagram') {
      x.fillStyle = '#eef2f0'; x.fillRect(0, 0, W, H);
      x.lineWidth = 4; for (const [c, ph] of [['#3e7ad0', 0], ['#e0473e', Math.PI]]) { x.strokeStyle = c; x.beginPath(); for (let y = 10; y < H - 10; y += 4) x.lineTo(W / 2 + Math.sin(y * 0.05 + ph) * W * 0.25, y); x.stroke(); }
    } else {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9fd3f0'); g.addColorStop(0.55, '#e8f4f0'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#7fb06a'; x.beginPath(); x.moveTo(0, H * 0.62); x.quadraticCurveTo(W * 0.35, H * 0.42, W * 0.6, H * 0.58); x.quadraticCurveTo(W * 0.8, H * 0.66, W, H * 0.55); x.lineTo(W, H); x.lineTo(0, H); x.fill();
      x.fillStyle = '#5a9a5a'; x.beginPath(); x.moveTo(0, H * 0.8); x.quadraticCurveTo(W * 0.5, H * 0.66, W, H * 0.82); x.lineTo(W, H); x.lineTo(0, H); x.fill();
      x.fillStyle = '#ffffff'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(R() * W, H * (0.12 + R() * 0.2), 24, 8, 0, 0, 6.28); x.fill(); }
    }
  }, { repeat: false });
  const fr = p.frame || '#b8864e', back = -d / 2;
  box(G, w, h, 0.02, '#f2ead4', 0, 0, back + 0.01, { line: false });
  box(G, w - 0.12, h - 0.12, 0.006, texm(t), 0, 0, back + 0.024, { line: false });
  for (const s of [-1, 1]) { box(G, w, 0.06, 0.045, fr, 0, s * (h / 2 - 0.03), back + 0.025); box(G, 0.06, h, 0.045, fr, s * (w / 2 - 0.03), 0, back + 0.025); }
  return G;
}

export function wall_vent(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, back = -d / 2;
  const t = paint('wallvent', 128, 96, (x, W, H) => {
    x.fillStyle = '#d6dbde'; x.fillRect(0, 0, W, H);
    for (let y = 10; y < H - 8; y += 9) { x.fillStyle = '#6c757e'; x.fillRect(8, y, W - 16, 4); x.fillStyle = '#ffffff'; x.fillRect(8, y + 4, W - 16, 1.5); }
  }, { repeat: false });
  box(G, w, h, 0.04, '#cfd5d8', 0, 0, back + 0.02);
  box(G, w - 0.06, h - 0.06, 0.01, texm(t), 0, 0, back + 0.045, { line: false });
  return G;
}
export function wall_clock(P) {
  const G = new THREE.Group(), [w, d] = P.size, r = w / 2, back = -d / 2;
  const t = paint('clockface', 128, 128, (x, W) => {
    x.fillStyle = '#fbf8ee'; x.beginPath(); x.arc(64, 64, 63, 0, 6.28); x.fill();
    x.fillStyle = '#2d3138'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 5, 4, 10); }
    x.fillStyle = '#e0473e'; x.beginPath(); x.arc(64, 64, 5, 0, 6.28); x.fill(); void W;
  }, { repeat: false });
  cyl(G, r, r, 0.05, '#3e4a5a', 0, 0, back + 0.025, { rx: Math.PI / 2, seg: 28 });
  const f = new THREE.Mesh(new THREE.CircleGeometry(r - 0.04, 28), texm(t)); f.position.z = back + 0.052; f.userData.outline = false; G.add(f);
  const hand = (len, a, wd) => { const m = box(G, wd, len, 0.006, '#23252c', 0, 0, back + 0.058, { line: false }); m.geometry.translate(0, len / 2 - 0.02, 0); m.rotation.z = a; };
  hand(r * 0.55, -2.2, 0.022); hand(r * 0.8, 0.9, 0.014);
  return G;
}
export function globe(P) {
  const G = new THREE.Group();
  const t = paint('globemap', 256, 128, (x, W, H, R) => {
    x.fillStyle = '#5aa0d8'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#8cc46a';
    for (let k = 0; k < 9; k++) { x.beginPath(); const cx = R() * W, cy = H * (0.25 + R() * 0.5); for (let a = 0; a < 6.28; a += 0.5) x.lineTo(cx + Math.cos(a) * (14 + R() * 26), cy + Math.sin(a) * (10 + R() * 18)); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,.35)'; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * H / 6); x.lineTo(W, i * H / 6); x.stroke(); }
    x.strokeStyle = '#e0473e'; x.lineWidth = 3; x.beginPath(); x.arc(W * 0.7, H * 0.4, 9, 0, 6.28); x.stroke();
  });
  lathe(G, [[0, 0], [0.22, 0], [0.24, 0.04], [0.06, 0.1], [0.04, 0.55], [0, 0.55]], '#8a5a36', 0, 0, 0, { seg: 18 });
  const S = new THREE.Group(); S.position.y = 0.8; S.rotation.z = 0.41; G.add(S);
  sphere(S, 0.24, texm(t), 0, 0, 0, { seg: 24, rings: 14 });
  torus(S, 0.27, 0.012, '#c9a24a', 0, 0, 0, { arc: Math.PI * 1.2, ts: 24, rs: 4 }).rotation.set(0, Math.PI / 2, -0.6 * Math.PI);
  rod(S, [0, -0.3, 0], [0, 0.3, 0], 0.01, '#c9a24a', { seg: 5, line: false });
  return G;
}
export function desk_lamp(P) {
  const G = new THREE.Group(), col = P.params.color || '#4a5a7a';
  cyl(G, 0.1, 0.12, 0.03, col, 0, 0.015, 0, { seg: 16 });
  rod(G, [0, 0.03, 0], [0.02, 0.36, -0.05], 0.014, col, { seg: 6 });
  rod(G, [0.02, 0.36, -0.05], [0.0, 0.5, 0.12], 0.014, col, { seg: 6 });
  const S = new THREE.Group(); S.position.set(0.0, 0.5, 0.14); S.rotation.x = 0.7; G.add(S);
  lathe(S, [[0.02, 0.06], [0.05, 0.04], [0.11, -0.06], [0.1, -0.07]], col, 0, 0, 0, { seg: 16 });
  sphere(S, 0.04, unlit(null, '#fff4c0'), 0, -0.02, 0, { seg: 10, rings: 6, line: false });
  return G;
}

// ---------- the big industrial pendant lamp (ref: black dome, ring of round lights, cables) ----------
export function pendant_lamp(P) {
  const G = new THREE.Group(), p = P.params, drop = p.drop || 4, n = p.lights || 7;
  const R0 = 1.05, y = -drop;
  // cables from the vault to a hanger ring, then to the shade
  const hang = y + 1.25;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; rod(G, [Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12], [Math.sin(a) * 0.05, hang, Math.cos(a) * 0.05], 0.018, '#1c2028', { seg: 5 }); }
  cyl(G, 0.18, 0.18, 0.08, '#2a2f3a', 0, -0.04, 0, { seg: 14 });
  cyl(G, 0.08, 0.1, 0.18, '#2a2f3a', 0, hang - 0.05, 0, { seg: 12 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; rod(G, [0, hang - 0.12, 0], [Math.sin(a) * 0.55, y + 0.42, Math.cos(a) * 0.55], 0.014, '#1c2028', { seg: 5 }); }
  // the shade: a wide shallow dome with a collar, dark navy-black, a lighter rim
  lathe(G, [[0.001, 0.62], [0.22, 0.62], [0.24, 0.5], [0.42, 0.42], [0.8, 0.26], [R0, 0.1], [R0 + 0.04, 0.04], [R0 + 0.02, 0.0], [R0 - 0.06, 0.02], [0.001, 0.12]], '#262c3a', 0, y, 0, { seg: 40 });
  torus(G, R0, 0.035, '#5a6478', 0, y + 0.04, 0, { rx: Math.PI / 2, ts: 48, rs: 6 });
  // the round lights underneath: bright discs (unlit) in a ring plus one in the middle
  const bulb = unlit(null, '#fff7dc');
  const disc = (x, z, r) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18).rotateX(Math.PI / 2), bulb); m.position.set(x, y + 0.035, z); m.userData.outline = false; G.add(m); torus(G, r + 0.01, 0.012, '#9aa4b8', x, y + 0.04, z, { rx: Math.PI / 2, ts: 16, rs: 4, line: false }); };
  disc(0, 0, 0.17);
  for (let i = 0; i < n - 1; i++) { const a = (i / (n - 1)) * Math.PI * 2; disc(Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0.15); }
  return G;
}

// ---------- chain hoist on the beam (ref: block, chain, hook) ----------
export function chain_hoist(P) {
  const G = new THREE.Group(), drop = P.params.drop || 2.4;
  const steel = '#4a4f58';
  // trolley on the beam
  block(G, 0.34, 0.1, 0.26, steel, 0, -0.04, 0);
  for (const s of [-1, 1]) cyl(G, 0.06, 0.06, 0.04, '#2c3038', s * 0.12, 0.05, 0.15, { rx: Math.PI / 2, seg: 12 });
  // the block: a rounded housing with a wheel
  const by = -0.5;
  rod(G, [0, -0.04, 0], [0, by + 0.18, 0], 0.03, steel, { seg: 6 });
  box(G, 0.22, 0.36, 0.3, '#d8dde0', 0, by, 0);
  cyl(G, 0.17, 0.17, 0.08, '#e0473e', 0, by, 0.16, { rx: Math.PI / 2, seg: 18 });
  cyl(G, 0.06, 0.06, 0.1, steel, 0, by, 0.17, { rx: Math.PI / 2, seg: 10 });
  // two chains: links alternate in plane
  const link = (x, yy, k) => torus(G, 0.03, 0.009, '#5c6068', x, yy, 0, { ry: k % 2 ? Math.PI / 2 : 0, ts: 8, rs: 4, line: false });
  const n = Math.floor((drop - 0.7) / 0.05);
  for (let i = 0; i < n; i++) link(-0.05, by - 0.2 - i * 0.05, i);
  for (let i = 0; i < Math.floor(n * 0.6); i++) link(0.08, by - 0.2 - i * 0.05, i + 1);
  // the hook
  const hy = by - 0.25 - n * 0.05;
  box(G, 0.1, 0.14, 0.08, '#e8b32a', -0.05, hy, 0);
  torus(G, 0.07, 0.02, '#e8b32a', -0.05, hy - 0.15, 0, { arc: Math.PI * 1.45, ts: 14, rs: 5 }).rotation.z = -0.4 * Math.PI;
  return G;
}
export function panel_light(P) {
  const G = new THREE.Group(), [w, d] = P.size;
  box(G, w, 0.05, d, '#e4e6e2', 0, -0.025, 0, { noShadow: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, d - 0.1).rotateX(Math.PI / 2), unlit(null, '#fffbe8')); m.position.y = -0.052; m.userData.outline = false; G.add(m);
  return G;
}

// a standalone door with frame (wall prop; its middle at its placement's y)
export function door(P) {
  const G = new THREE.Group(), [w, d, h] = P.size, col = P.params.wood || '#8a5634', back = -d / 2;
  doorLeaf(G, w, h, col, back);
  return G;
}
// a panelled wooden door leaf with its frame, centred, the leaf's back at z
export function doorLeaf(G, w, h, col, z, { double = false, frame = '#fbf7ea' } = {}) {
  const leaves = double ? [[-w / 4, w / 2 - 0.02], [w / 4, w / 2 - 0.02]] : [[0, w - 0.02]];
  for (const [x, lw] of leaves) {
    box(G, lw, h - 0.02, 0.06, texm(planks(col, 6)), x, 0, z + 0.03, { uv: 0.5 });
    for (const dy of [h * 0.22, -h * 0.18]) box(G, lw - 0.22, h * 0.3, 0.025, shade(col, 0.86), x, dy, z + 0.065, { line: false });
    const kx = double ? x + Math.sign(-x || 1) * (lw / 2 - 0.1) : x + lw / 2 - 0.12;
    sphere(G, 0.04, '#e8c15a', kx, -0.06, z + 0.1, { seg: 10, rings: 6 });
  }
  if (double) box(G, 0.02, h - 0.02, 0.07, shade(col, 0.6), 0, 0, z + 0.035, { line: false });
  for (const s of [-1, 1]) box(G, 0.1, h + 0.1, 0.1, frame, s * (w / 2 + 0.05), 0.05, z + 0.05);
  box(G, w + 0.2, 0.1, 0.1, frame, 0, h / 2 + 0.05, z + 0.05);
}
void flat; void block; void plane; void metal; void rng;
