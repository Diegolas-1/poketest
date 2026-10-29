// The base body's textures, drawn on canvases from the turnaround sheets.
//  - the face: eyes, brows, nose, mouth and the cheek marks, projected onto the
//    front of the head along z (FACE_BOX), in their own colours on the skin;
//  - the atlas: the ink lines of the body, projected along z, the front view on
//    the left half and the back view on the right (ATLAS_BOX). It is white with
//    the lines as tints, multiplied by the material colour (skin or briefs).
// Shapes are given in sheet pixels (TURNAROUND_G): across from the figure's
// centre line (front: + is the image's right, the character's left; back: + is
// the image's right, the character's right) and down from the top of the image.
import * as THREE from 'three';

const PX = 1.40 / 900, GROUND = 1000;
export const SKIN = '#e0956d', SKIN_SHADE = '#a86e62', BRIEFS = '#3f4659', INK = '#2b1d18';
export const FACE_BOX = { x0: -80 * PX, x1: 80 * PX, y0: (GROUND - 310) * PX, y1: (GROUND - 168) * PX };
export const ATLAS_BOX = { x0: -0.56, x1: 0.56, y0: 0, y1: 1.42 };

const LINE = '#66575e';        // anatomy lines: on the skin colour this gives the sheets' brown
const SHADE = '#d8d6ee';       // the cool shade tone, as a tint of the skin
const SEAM = '#8a90a0';        // the briefs' seams, as a tint of their navy

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// sheet pixels -> canvas, for a box in metres drawn into [ox, ox + w] x [0, h]
function sheetTransform(ctx, box, ox, w, h, mirror = false) {
  const kx = PX / (box.x1 - box.x0) * w, ky = PX / (box.y1 - box.y0) * h;
  ctx.setTransform(mirror ? -kx : kx, 0, 0, ky, ox + (-box.x0) / (box.x1 - box.x0) * w, h - (GROUND * PX - box.y0) / (box.y1 - box.y0) * h);
}
function stroke(ctx, pts, width, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]); else ctx.lineTo(p[0], p[1]);
  }
  ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
}
const mirrorPts = (pts) => pts.map((p) => p.map((v, i) => (i % 2 ? v : -v)));
const both = (ctx, pts, w, c) => { stroke(ctx, pts, w, c); stroke(ctx, mirrorPts(pts), w, c); };

// ---------- the face ----------
function eye(ctx, s) {
  ctx.save();
  ctx.translate(s * 37.2, 223.5);
  ctx.rotate(s * 0.05);
  const white = new Path2D(); white.ellipse(0, 0, 13.6, 19.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f4ece6'; ctx.fill(white);
  ctx.save();
  ctx.clip(white);
  const ix = -s * 1.8, iy = 0.6;
  const g = ctx.createLinearGradient(0, iy - 16, 0, iy + 16);
  g.addColorStop(0, '#2e1a1e'); g.addColorStop(0.45, '#4b2a2e'); g.addColorStop(1, '#8a5050');
  ctx.beginPath(); ctx.ellipse(ix, iy, 7, 16.8, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 0.9; ctx.strokeStyle = '#24141a'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(ix, iy + 1.2, 3.4, 10.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#1e1216'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(ix - s * 0.8, iy - 11, 2.6, 5.4, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  // the upper lid's shadow on the white
  ctx.beginPath(); ctx.ellipse(0, -19.6, 15, 4.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(150,120,120,0.35)'; ctx.fill();
  ctx.restore();
  // outline, open at the bottom, heavier along the top
  ctx.lineCap = 'round'; ctx.strokeStyle = '#1c1414';
  ctx.beginPath(); ctx.ellipse(0, 0, 13.6, 19.6, 0, Math.PI * 0.62, Math.PI * 2.38); ctx.lineWidth = 2.0; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0.4, 13.9, 19.9, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.lineWidth = 3.0; ctx.stroke();
  // lash flick at the outer top corner
  ctx.beginPath();
  ctx.moveTo(s * 9, -15.5); ctx.quadraticCurveTo(s * 15, -12, s * 16.5, -4); ctx.lineTo(s * 13.2, -6); ctx.closePath();
  ctx.fillStyle = '#1c1414'; ctx.fill();
  // lower lid
  stroke(ctx, [[-5.5 - s * 1.2, 21], [-s * 1.2, 21.6, 5.5 - s * 1.2, 21]], 1.6, '#3a2420');
  ctx.restore();
}
export function paintFace(size = 1024) {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = SKIN; ctx.fillRect(0, 0, size, size);
  sheetTransform(ctx, FACE_BOX, 0, size, size);
  eye(ctx, -1); eye(ctx, 1);
  // brows: heavy at the outer end, coming down to a point over the nose
  const brow = [[-59.5, 191.5], [-54, 187], [-45, 186], [-16, 208.2], [-20.5, 209.8], [-46.5, 193.8], [-57.5, 193.8]];
  ctx.fillStyle = '#231a19';
  for (const s of [1, -1]) {
    ctx.beginPath();
    brow.forEach(([x, y], i) => (i ? ctx.lineTo(s * x, y) : ctx.moveTo(s * x, y)));
    ctx.closePath(); ctx.fill();
  }
  stroke(ctx, [[-4, 244.5], [-8.5, 252, -2.5, 257.5]], 1.4, '#6a3a2c');
  stroke(ctx, [[-19, 271.2], [2, 269.8, 23, 271.6]], 2.0, '#3c221c');
  // the zigzag marks on the cheeks (the same way round on both sides)
  stroke(ctx, [[-48, 258], [-39.5, 252], [-38.5, 258.5], [-28.5, 253]], 1.5, '#3c221c');
  stroke(ctx, [[28, 257], [37, 251.5], [39, 259], [49, 253]], 1.5, '#3c221c');
  return texture(c);
}

// ---------- the body's ink lines ----------
// extra: [{ pts: [[x, y], ...] in metres, w: width in sheet pixels }] for the front half
export function paintAtlas(extra = [], w = 4096, h = 2048) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  // front view
  sheetTransform(ctx, ATLAS_BOX, 0, w / 2, h);
  both(ctx, [[54, 336], [35, 340, 15, 347]], 1.5, LINE);                // collarbones
  stroke(ctx, [[0, 376], [0, 404]], 1.3, LINE);                          // breastbone
  both(ctx, [[72, 421], [50, 431, 27, 427]], 1.5, LINE);                 // under the chest
  both(ctx, [[41, 461], [33, 454, 23, 451]], 1.3, LINE);                 // ribs
  stroke(ctx, [[0, 516], [0.5, 527]], 1.6, LINE);                        // navel
  both(ctx, [[37.5, 534], [37, 543, 34, 551]], 1.3, LINE);               // hips
  both(ctx, [[112, 379], [87, 382]], 1.4, LINE);                         // armpits
  stroke(ctx, [[-100, 562], [100, 562]], 1.2, SEAM);                    // waistband seam
  for (const l of extra) stroke(ctx, l.pts.map(([x, y]) => [x / PX, GROUND - y / PX]), l.w, l.color || LINE);
  for (const s of [-1, 1]) {
    // under the kneecaps: a shaded crescent and its line
    const k = (x, y) => [s * (57 + x), y];
    ctx.beginPath();
    ctx.moveTo(...k(-21, 755));
    ctx.quadraticCurveTo(...k(-18, 786), ...k(-3, 788)); ctx.quadraticCurveTo(...k(8, 788), ...k(11.5, 776));
    ctx.quadraticCurveTo(...k(4, 784), ...k(-4, 784)); ctx.quadraticCurveTo(...k(-14, 782), ...k(-21, 755));
    ctx.fillStyle = SHADE; ctx.fill();
    stroke(ctx, [k(-21, 755), [...k(-18, 786), ...k(-3, 788)], [...k(8, 788), ...k(11.5, 776)]], 1.4, LINE);
  }
  // back view (+ = the character's right)
  sheetTransform(ctx, ATLAS_BOX, w / 2, w / 2, h, true);
  both(ctx, [[15, 370], [17, 400, 45, 425]], 1.5, LINE);                 // shoulder blades
  stroke(ctx, [[0, 465], [0, 512]], 1.3, LINE);                          // spine
  both(ctx, [[106, 380], [87, 382]], 1.4, LINE);                         // armpits
  both(ctx, [[160, 446], [175, 452, 184, 467]], 1.3, LINE);              // elbows
  stroke(ctx, [[-100, 556], [100, 556]], 1.2, SEAM);                    // waistband seam
  stroke(ctx, [[0, 603], [0, 645]], 1.3, SEAM);                          // between the buttocks
  for (const s of [-1, 1]) {
    const k = (x, y) => [s * (57 + x), y];
    stroke(ctx, [k(-9.5, 763), k(-7, 778)], 1.2, LINE);                  // behind the knees
    stroke(ctx, [k(9.5, 766), k(11, 780)], 1.2, LINE);
    const v = (x, y) => [s * (63 + x), y];
    stroke(ctx, [v(-8, 858), v(-1, 874)], 1.2, LINE);                    // bottom of the calves
    stroke(ctx, [v(6, 862), v(1, 874)], 1.2, LINE);
  }
  return texture(c);
}
