// Ash's base body, made from the turnaround sheets
// (ASH_KETCHUM_BASE_MODEL_TURNAROUND_G and _H, _VERT_ANGLES, _VERT_TOP_BOTTOM).
//
// The body is sculpted as a signed distance field: the head, torso and legs are
// lofted through cross-sections measured off the sheets row by row (width from
// the front view, depth from the side view), the arms, hands, feet, ears and
// nose are capsules, boxes and ellipsoids placed at the sheets' landmarks. The
// field is meshed (mesher.js), cut where the briefs end, rigged to a humanoid
// skeleton (Mixamo bone names; weights from which shapes make up the surface
// at each point) and textured (paint.js: the face, and the ink lines of the
// collarbones, chest, knees, shoulder blades... projected front and back).
//
//   buildBody(o) -> { group, meshes, skeleton, bones, materials }
// group holds the root bone and two SkinnedMeshes on one skeleton: 'body'
// (skin + face materials) and 'briefs'. o.cell (metres) is the meshing grid,
// o.tris the triangle budget, o.material(name, map, color) makes materials.
//
// Units are metres, y up, facing +z, the character's left is +x, feet on y = 0.
import * as THREE from 'three';
import { ellipsoid, roundCone, roundBox, loft, Field, sstep } from './sdf.js';
import { surfaceNets, relax, project, decimate, cutAlong } from './mesher.js';
import { paintFace, paintAtlas, FACE_BOX, ATLAS_BOX, SKIN, BRIEFS } from './paint.js';

const V3 = THREE.Vector3;

// ---------- sheet space ----------
// TURNAROUND_G is read in pixels: the front view (first figure) across from its
// centre line at x 371.5, the side view (third figure, facing right) across from
// z 1375, both down from the top of the image to the ground at y 1000.
export const PX = 1.40 / 900;   // metres per pixel: 1.40 m tall
const CX = 371.5, GROUND = 1000, CZ = 1375;
export const sx = (fx) => fx * PX, sy = (py) => (GROUND - py) * PX, sz = (pz) => (pz - CZ) * PX;
export { CX, GROUND, CZ };
const P = (fx, py, pz) => new V3(sx(fx), sy(py), sz(pz));
const frame = (a, b, c) => new THREE.Matrix3().set(a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z);

// ---------- skeleton ----------
const BONES = [], BI = {};
function bone(name, parent, p) { BI[name] = BONES.length; BONES.push({ name, parent: parent ? BI[parent] : -1, p: p.clone() }); return BI[name]; }

// torso, head
bone('Hips', null, P(0, 600, 1386));
bone('Spine', 'Hips', P(0, 548, 1390));
bone('Spine1', 'Spine', P(0, 490, 1392));
bone('Spine2', 'Spine1', P(0, 420, 1390));
bone('Neck', 'Spine2', P(0, 326, 1377));
bone('Head', 'Neck', P(0, 287, 1386));
bone('HeadTop_End', 'Head', P(0, 102, 1390));

// ---------- the shapes ----------
const prims = [];
const INK_LINES = [];   // extra lines for the atlas' front half, in metres
const add = (p) => (prims.push(p), p);
const R = (px) => px * PX;

// levels up a limb or the trunk -> weights shared out between the two nearest
function ladder(levels) {
  return (y) => {
    if (y <= levels[0][1]) return [[levels[0][0], 1]];
    for (let i = 0; i < levels.length - 1; i++) {
      const [b0, y0] = levels[i], [b1, y1] = levels[i + 1];
      if (y <= y1) { const t = sstep(y0, y1, y); return [[b0, 1 - t], [b1, t]]; }
    }
    return [[levels[levels.length - 1][0], 1]];
  };
}

// --- torso: front half width, back and front of the side view, exponent ---
const TORSO = [
  [318, 30, 1352, 1405, 2.2], [325, 46, 1348, 1409, 2.4], [332, 62, 1344, 1412, 2.6], [340, 72, 1340, 1417, 2.6],
  [350, 77, 1336, 1426, 2.6], [360, 79, 1334, 1431, 2.6], [380, 80, 1331, 1441, 2.5], [400, 79, 1332, 1446, 2.4],
  [420, 77, 1336, 1448, 2.3], [440, 74, 1340, 1449, 2.2], [460, 70, 1345, 1450, 2.2], [480, 66.5, 1349, 1451, 2.2],
  [500, 66, 1351, 1451, 2.2], [520, 68.5, 1350, 1450, 2.2], [540, 73, 1343, 1449, 2.3], [560, 78, 1333, 1449, 2.4],
  [580, 80, 1327, 1447, 2.4], [600, 79, 1325, 1444, 2.4], [620, 72, 1330, 1440, 2.3], [636, 56, 1340, 1434, 2.2],
];
{
  const lv = ladder([[BI.Hips, sy(600)], [BI.Spine, sy(548)], [BI.Spine1, sy(490)], [BI.Spine2, sy(420)]]);
  const torso = loft(TORSO.map(([py, w, b, f, e]) => ({ y: sy(py), cx: 0, cz: sz((b + f) / 2), w: R(w), d: R((f - b) / 2), eB: e, eF: e })), {
    k: 0.012, name: 'torso',
    bone: (x, y) => {
      // the top corners go with the shoulders
      const sh = sstep(sx(45), sx(95), Math.abs(x)) * sstep(sy(410), sy(350), y);
      const out = lv(y).map(([b, w]) => [b, w * (1 - sh)]);
      if (sh > 0) out.push([BI[x > 0 ? 'LeftShoulder' : 'RightShoulder'] ?? BI.Spine2, sh]);
      return out;
    },
  });
  add(torso);
}
// --- neck ---
{
  const lv = ladder([[BI.Spine2, sy(336)], [BI.Neck, sy(316)], [BI.Head, sy(292)]]);
  add(roundCone(P(0, 345, 1373), P(0, 280, 1386), R(23.5), R(22.5), { k: 0.008, bone: (x, y) => lv(y), name: 'neck' }));
}
// --- head: front half width; back and front of the side view; exponents behind
// and in front; how much it narrows to the chin ---
const HEAD = [
  [122, 44, 1340, 1440, 2, 2.2, 0], [130, 62.5, 1323, 1456, 2.05, 2.4, 0], [140, 68.5, 1316, 1462, 2.1, 2.5, 0], [150, 73, 1312, 1467, 2.1, 2.6, 0], [160, 76, 1308, 1470, 2.15, 2.6, 0],
  [170, 77, 1307, 1472, 2.15, 2.6, 0], [180, 77.5, 1305, 1473, 2.15, 2.6, 0], [190, 77, 1306, 1473, 2.15, 2.6, 0], [200, 76, 1307, 1472, 2.15, 2.6, 0],
  [210, 75, 1309, 1470, 2.15, 2.6, 0.02], [220, 74, 1312, 1469, 2.15, 2.6, 0.04], [230, 73.5, 1315, 1468, 2.15, 2.6, 0.06], [240, 72.5, 1321, 1468, 2.15, 2.6, 0.08],
  [250, 71, 1329, 1470, 2.15, 2.6, 0.12], [260, 67, 1340, 1471, 2.1, 2.5, 0.2], [270, 59, 1352, 1470, 2.05, 2.4, 0.3], [280, 50, 1364, 1466, 2, 2.3, 0.4],
  [289, 39, 1376, 1461, 2, 2.2, 0.48], [296, 27, 1390, 1455, 2, 2.1, 0.55], [301, 13, 1405, 1446, 2, 2, 0.55],
];
add(loft(HEAD.map(([py, w, b, f, eB, eF, tF]) => ({ y: sy(py), cx: 0, cz: sz((b + f) / 2), w: R(w), d: R((f - b) / 2), eB, eF, tF })), { k: 0.012, bone: BI.Head, name: 'head' }));
add(ellipsoid(P(0, 186, 1390), [R(77.5), R(85), R(84.5)], { k: 0.012, bone: BI.Head, name: 'cranium' }));
add(ellipsoid(P(0, 252.5, 1469), [R(4.5), R(6), R(7)], { k: 0.005, bone: BI.Head, name: 'nose' }));

for (const s of [1, -1]) {
  const L = s > 0 ? 'Left' : 'Right';
  // --- ear ---
  const er = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.12, 0, -s * 0.16, 'YXZ'));
  const erot = new THREE.Matrix3().setFromMatrix4(er);
  add(ellipsoid(P(s * 79, 238, 1385), [R(8), R(28), R(17)], { rot: erot, k: 0.006, bone: BI.Head, name: 'ear' }));
  add(ellipsoid(P(s * 86.5, 240, 1388), [R(5.5), R(18), R(10)], { rot: erot, k: 0.004, op: 'sub', bone: BI.Head, name: 'concha' }));

  // --- shoulder and arm ---
  const SH = bone(L + 'Shoulder', 'Spine2', P(s * 22, 338, 1378));
  const ARM = bone(L + 'Arm', L + 'Shoulder', P(s * 92, 376, 1386));
  const FORE = bone(L + 'ForeArm', L + 'Arm', P(s * 177, 461, 1386));
  const W = P(s * 256, 541, 1391);
  const HAND = bone(L + 'Hand', L + 'ForeArm', W);
  add(roundCone(P(s * 20, 326, 1368), P(s * 80, 349, 1380), R(13), R(15), { k: 0.012, bone: SH, name: 'trapezius' }));
  add(ellipsoid(P(s * 90, 377, 1386), [R(32), R(32), R(30)], { k: 0.012, bone: (x, y, z) => [[ARM, 0.7], [SH, 0.3]], name: 'deltoid' }));
  add(roundCone(P(s * 92, 378, 1386), P(s * 177, 461, 1386), R(23.5), R(20.5), { k: 0.008, bone: ARM, name: 'upperarm' }));
  add(roundCone(P(s * 177, 461, 1386), P(s * 207, 491, 1388), R(21), R(22), { k: 0.008, bone: FORE, name: 'forearm' }));
  add(roundCone(P(s * 207, 491, 1388), W, R(22), R(14), { k: 0.008, bone: FORE, name: 'forearm2' }));

  // --- hand: a = wrist to fingertips, b = thumb side to little finger side,
  // n = palm normal (the palms face back, the thumbs in towards the body) ---
  // (turned half way in towards the thighs, so the fingers stack up seen from the front)
  const a = new V3(s * 0.511, -0.86, 0).normalize();
  const n = new V3(-s * 0.86, -0.511, 0).multiplyScalar(0.7).add(new V3(0, 0, -0.7)).normalize();
  const b = a.clone().cross(n).normalize(); if (b.z > 0) b.negate();
  const H = (la, lb, ln) => W.clone().addScaledVector(a, la).addScaledVector(b, lb).addScaledVector(n, ln);
  const hrot = frame(a, b, n);
  add(roundBox(H(0.034, 0.0005, 0.0005), a, b, n, [0.027, 0.0185, 0.0035], 0.0075, { k: 0.008, bone: HAND, name: 'palm' }));
  add(roundCone(W, H(0.024, 0, 0.001), R(13.5), 0.0155, { k: 0.008, bone: HAND, name: 'wrist' }));
  add(ellipsoid(H(0.026, -0.0135, 0.0055), [0.021, 0.012, 0.0095], { rot: hrot, k: 0.006, bone: HAND, name: 'thenar' }));
  const fingers = [
    ['Index', [0.064, -0.0185, 0], -0.02, [0.028, 0.019, 0.017], [0.007, 0.0066, 0.0062, 0.0055]],
    ['Middle', [0.067, -0.006, 0], 0, [0.031, 0.021, 0.018], [0.0071, 0.0067, 0.0063, 0.0056]],
    ['Ring', [0.065, 0.006, 0], 0.025, [0.029, 0.02, 0.017], [0.0068, 0.0064, 0.006, 0.0053]],
    ['Pinky', [0.06, 0.0175, 0], 0.06, [0.022, 0.016, 0.014], [0.0062, 0.0058, 0.0054, 0.0048]],
  ];
  const curl = [0.12, 0.25, 0.15];
  for (const [f, base, spread, lens, rad] of fingers) {
    let p = H(...base), d = a.clone().multiplyScalar(Math.cos(spread)).addScaledVector(b, Math.sin(spread));
    let parent = L + 'Hand';
    for (let i = 0; i < 3; i++) {
      const ax = d.clone().cross(n).normalize();
      d.applyAxisAngle(ax, curl[i]);
      const q = p.clone().addScaledVector(d, lens[i]);
      const B = bone(`${L}Hand${f}${i + 1}`, parent, p);
      add(roundCone(p, q, rad[i], rad[i + 1], { k: 0.0025, bone: B, name: f }));
      parent = `${L}Hand${f}${i + 1}`; p = q;
    }
    bone(`${L}Hand${f}4`, parent, p.clone().addScaledVector(d, rad[3]));
  }
  {
    let p = H(0.01, -0.017, 0.006), parent = L + 'Hand';
    const dirs = [[0.82, -0.3, 0.48], [0.92, -0.2, 0.35], [0.96, -0.15, 0.2]].map(([x, y, z]) => a.clone().multiplyScalar(x).addScaledVector(b, y).addScaledVector(n, z).normalize());
    const lens = [0.03, 0.024, 0.021], rad = [0.0105, 0.0085, 0.0075, 0.0062];
    for (let i = 0; i < 3; i++) {
      const q = p.clone().addScaledVector(dirs[i], lens[i]);
      const B = bone(`${L}HandThumb${i + 1}`, parent, p);
      add(roundCone(p, q, rad[i], rad[i + 1], { k: i ? 0.003 : 0.008, bone: B, name: 'thumb' }));
      parent = `${L}HandThumb${i + 1}`; p = q;
    }
    bone(`${L}HandThumb4`, parent, p.clone().addScaledVector(dirs[2], rad[3]));
  }
}

// --- legs: front centre and half width, side centre and half depth ---
const LEG = [
  [560, 36, 30, 1385, 32], [580, 41, 40, 1386, 40], [598, 45, 46, 1387, 47], [620, 47, 45, 1389, 46], [650, 50, 42, 1390, 44], [670, 50.5, 40, 1388, 43],
  [690, 52, 37.5, 1387, 41], [710, 53.5, 35, 1385.5, 39], [730, 54.5, 32.5, 1384, 36], [750, 55.5, 29.5, 1382, 34],
  [765, 57, 28.5, 1379.5, 35], [780, 60, 29, 1374, 37.5], [800, 62, 30.25, 1367.5, 36], [820, 63, 30.75, 1364, 34.5],
  [840, 64.5, 29, 1362, 32.5], [860, 66, 25.75, 1361, 30.5], [880, 67.5, 22.5, 1361, 28], [900, 68.5, 20, 1361, 25],
  [925, 70, 19, 1362, 24], [950, 71, 17.5, 1366, 21], [975, 72, 15, 1372, 18],
];
for (const s of [1, -1]) {
  const L = s > 0 ? 'Left' : 'Right';
  const UP = bone(L + 'UpLeg', 'Hips', P(s * 48, 605, 1388));
  const KN = bone(L + 'Leg', L + 'UpLeg', P(s * 57, 765, 1380));
  const A = P(s * 69, 920, 1361);
  const FT = bone(L + 'Foot', L + 'Leg', A);
  const yH = sy(605), yK = sy(765), yA = sy(920);
  add(loft(LEG.map(([py, fx, w, c, d]) => ({ y: sy(py), cx: sx(fx), cz: sz(c), w: R(w), d: R(d), eB: 2.2, eF: 2.2 })), {
    mirror: s < 0, k: 0.012, name: 'leg',
    bone: (x, y) => {
      const s0 = sstep(yH - 0.03, yH + 0.05, y), s1 = sstep(yK + 0.025, yK - 0.025, y), s2 = sstep(yA + 0.02, yA - 0.015, y);
      return [[BI.Hips, s0 * (1 - s1)], [UP, (1 - s0) * (1 - s1)], [KN, s1 * (1 - s2)], [FT, s1 * s2]];
    },
  }));
  add(ellipsoid(P(s * 30, 598, 1345), [R(34), R(38), R(24)], { k: 0.012, bone: BI.Hips, name: 'buttock' }));

  // --- foot: f = heel to toes (turned out a little), u = up, o = outwards ---
  const th = 0.1, f = new V3(s * Math.sin(th), 0, Math.cos(th)), u = new V3(0, 1, 0), o = new V3(s * Math.cos(th), 0, -Math.sin(th));
  const O = new V3(A.x, 0, A.z);
  const F = (lf, lu, lo) => O.clone().addScaledVector(f, lf).addScaledVector(u, lu).addScaledVector(o, lo);
  const frot = frame(f, u, o);
  const TOE = bone(L + 'ToeBase', L + 'Foot', F(0.122, 0.022, 0));
  bone(L + 'Toe_End', L + 'ToeBase', F(0.182, 0.016, 0));
  const fb = (x, y, z) => { const lf = (x - O.x) * f.x + (z - O.z) * f.z, t = sstep(0.1, 0.135, lf); return [[FT, 1 - t], [TOE, t]]; };
  const E = (c, r, k, name) => add(ellipsoid(c, r, { rot: frot, k, bone: fb, name }));
  E(F(-0.02, 0.03, 0.002), [0.03, 0.03, 0.025], 0.02, 'heel');
  E(F(0.045, 0.022, 0.006), [0.05, 0.022, 0.033], 0.02, 'arch');
  E(F(0.118, 0.02, -0.002), [0.036, 0.02, 0.045], 0.02, 'ball');
  add(roundCone(F(0.005, 0.085, 0), F(0.115, 0.03, -0.004), 0.03, 0.017, { k: 0.016, bone: fb, name: 'instep' }));
  const TOES = [[0.157, 0.014, -0.028, 0.016, 0.0125, 0.0125], [0.155, 0.011, -0.009, 0.012, 0.0095, 0.009], [0.149, 0.0105, 0.006, 0.011, 0.009, 0.0085],
    [0.142, 0.0098, 0.02, 0.0105, 0.0085, 0.008], [0.133, 0.009, 0.032, 0.0095, 0.008, 0.0075]];
  for (const [lf, lu, lo, rf, ru, ro] of TOES) E(F(lf, lu, lo), [rf, ru, ro], 0.006, 'toe');
  // the lines between the toes, drawn on the atlas
  for (let i = 0; i < 4; i++) {
    const t0 = TOES[i], t1 = TOES[i + 1], lo = (t0[2] + t0[5] + t1[2] - t1[5]) / 2, lf = (t0[0] + t0[3] + t1[0] + t1[3]) / 2 - 0.003;
    const p = F(lf, 0, lo);
    INK_LINES.push({ pts: [[p.x, 0.004], [p.x, 0.0135]], w: 1.3 });
  }
  add(ellipsoid(F(0, 0.1, -0.024), [0.011, 0.011, 0.011], { k: 0.012, bone: FT, name: 'ankle' }));
  add(ellipsoid(F(-0.005, 0.088, 0.026), [0.011, 0.011, 0.011], { k: 0.012, bone: FT, name: 'ankle' }));
}

export const BONE_NAMES = BONES.map((b) => b.name);
export const field = new Field(prims);

// ---------- the briefs ----------
// > 0 on the briefs: under the waistband (y 547 on the sheet) and above each
// leg opening, which rises from the crotch (y 646) to high on the hip (y 588),
// dipping a little at the front and more over the buttocks behind.
export function briefsG(x, y, z) {
  const ax = Math.abs(x) / PX, pz = z / PX + CZ;
  const base = 588 + (88 - Math.max(ax, 6)) / 80 * 58;
  const zf = Math.max(-1.2, Math.min(1.2, (pz - 1390) / 50));
  const yOpen = base + (zf > 0 ? 7 : 22) * zf * zf;
  const top = sy(547 - Math.max(0, -zf) * 3) - y;
  return Math.min(top, y - sy(yOpen), sx(110) - Math.abs(x));
}

// ---------- build ----------
export function buildBody(o = {}) {
  const t0 = performance.now(), log = o.log || (() => {});
  const h = o.cell ?? 0.0025, target = o.tris ?? 50000;
  let { pos, tris } = surfaceNets(field, h);
  log(`surface nets: ${pos.length / 3} verts, ${tris.length / 3} tris, ${(performance.now() - t0) | 0} ms`);
  project(field, pos, 3);
  relax(field, pos, tris, 2);
  // finer where the drawing has small forms: face, ears, hands, feet
  const keep = (x, y, z) => (Math.abs(x) > 0.33 ? 6 : y < 0.07 ? 4 : y > sy(300) ? (z > sz(1440) || Math.abs(x) > sx(70) ? 4 : 2) : 1);
  ({ pos, tris } = decimate(pos, tris, target, { keep, lenK: 1e-4 }));
  project(field, pos, 3);
  relax(field, pos, tris, 1, 0.25);
  log(`decimated: ${pos.length / 3} verts, ${tris.length / 3} tris, ${(performance.now() - t0) | 0} ms`);

  // cut where the briefs end, so the edge is a clean line
  const cut = cutAlong(pos, tris, briefsG);
  pos = cut.pos; tris = cut.tris;
  const nv = pos.length / 3;
  const nrm = new Float32Array(nv * 3), skinI = new Uint16Array(nv * 4), skinW = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const [gx, gy, gz] = field.grad(x, y, z);
    nrm[v * 3] = gx; nrm[v * 3 + 1] = gy; nrm[v * 3 + 2] = gz;
    const w = field.weights(x, y, z, BONES.length);
    const top = [...w.keys()].sort((i, j) => w[j] - w[i]).slice(0, 4).filter((i) => w[i] > 0);
    const sum = top.reduce((s, i) => s + w[i], 0) || 1;
    top.forEach((b, k) => { skinI[v * 4 + k] = b; skinW[v * 4 + k] = w[b] / sum; });
    if (!top.length) { skinI[v * 4] = BI.Hips; skinW[v * 4] = 1; }
  }
  // the briefs stand a little off the skin, from nothing at their edge
  for (let v = 0; v < nv; v++) {
    const g = cut.g[v];
    if (g <= 0) continue;
    const k = 0.0016 * sstep(0, 0.006, g);
    for (let i = 0; i < 3; i++) pos[v * 3 + i] += nrm[v * 3 + i] * k;
  }
  log(`skinned, ${(performance.now() - t0) | 0} ms`);

  // ---------- materials, uv ----------
  // uv: 'front' and 'back' halves of the atlas (projected along z), or the face
  const FRONT = 0, BACK = 1, FACE = 2;
  const uvOf = (mode, x, y) => {
    if (mode === FACE) return [(x - FACE_BOX.x0) / (FACE_BOX.x1 - FACE_BOX.x0), (y - FACE_BOX.y0) / (FACE_BOX.y1 - FACE_BOX.y0)];
    const u = (x - ATLAS_BOX.x0) / (ATLAS_BOX.x1 - ATLAS_BOX.x0) * 0.5;
    return [mode === BACK ? 0.5 + u : u, (y - ATLAS_BOX.y0) / (ATLAS_BOX.y1 - ATLAS_BOX.y0)];
  };
  const parts = { body: { map: new Map(), idx: [[], []] }, briefs: { map: new Map(), idx: [[]] } };
  for (let t = 0; t < tris.length; t += 3) {
    const v = [tris[t], tris[t + 1], tris[t + 2]];
    const briefs = cut.side[t / 3] === 1;
    const c = [0, 1, 2].map((i) => (pos[v[0] * 3 + i] + pos[v[1] * 3 + i] + pos[v[2] * 3 + i]) / 3);
    const fz = v.reduce((s, i) => s + nrm[i * 3 + 2], 0) / 3;
    const face = !briefs && c[1] > sy(306) && Math.abs(c[0]) < sx(74) && v.every((i) => nrm[i * 3 + 2] > 0.12);
    const mode = face ? FACE : fz >= 0 ? FRONT : BACK;
    const part = briefs ? parts.briefs : parts.body, group = face ? 1 : 0;
    for (const i of v) {
      const key = i * 3 + mode;
      if (!part.map.has(key)) part.map.set(key, [i, mode]);
    }
    part.idx[group].push(...v.map((i) => i * 3 + mode));
  }
  const geoms = {};
  for (const [name, part] of Object.entries(parts)) {
    const keys = [...part.map.keys()], local = new Map(keys.map((k, i) => [k, i]));
    const n = keys.length, P3 = new Float32Array(n * 3), N3 = new Float32Array(n * 3), UV = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    keys.forEach((k, j) => {
      const [i, mode] = part.map.get(k);
      for (let c = 0; c < 3; c++) { P3[j * 3 + c] = pos[i * 3 + c]; N3[j * 3 + c] = nrm[i * 3 + c]; }
      const [u, vv] = uvOf(mode, pos[i * 3], pos[i * 3 + 1]); UV[j * 2] = u; UV[j * 2 + 1] = vv;
      for (let c = 0; c < 4; c++) { SI[j * 4 + c] = skinI[i * 4 + c]; SW[j * 4 + c] = skinW[i * 4 + c]; }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P3, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    const index = [];
    part.idx.forEach((list, gi) => { g.addGroup(index.length, list.length, gi); for (const k of list) index.push(local.get(k)); });
    g.setIndex(index);
    g.computeBoundingBox(); g.computeBoundingSphere();
    geoms[name] = g;
  }

  // ---------- skeleton ----------
  const bones = BONES.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  BONES.forEach((b, i) => {
    if (b.parent >= 0) { bones[b.parent].add(bones[i]); bones[i].position.copy(b.p).sub(BONES[b.parent].p); }
    else bones[i].position.copy(b.p);
  });
  const group = new THREE.Group(); group.name = 'AshBase';
  group.add(bones[0]);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mk = o.material || ((name, map, color) => new THREE.MeshStandardMaterial({ name, map, color, roughness: 1, metalness: 0 }));
  const atlas = paintAtlas(INK_LINES), face = paintFace();
  const materials = { skin: mk('skin', atlas, SKIN), face: mk('face', face, '#ffffff'), briefs: mk('briefs', atlas, BRIEFS) };
  const body = new THREE.SkinnedMesh(geoms.body, [materials.skin, materials.face]); body.name = 'body';
  const briefs = new THREE.SkinnedMesh(geoms.briefs, materials.briefs); briefs.name = 'briefs';
  for (const m of [body, briefs]) { group.add(m); m.bind(skeleton); m.frustumCulled = false; }
  log(`done: ${geoms.body.index.count / 3 + geoms.briefs.index.count / 3} tris, ${(performance.now() - t0) | 0} ms`);
  return { group, meshes: { body, briefs }, skeleton, bones: Object.fromEntries(bones.map((b) => [b.name, b])), materials };
}
