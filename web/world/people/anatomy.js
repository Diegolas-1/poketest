// A person's body from a few dozen numbers: where the joints are (rig.js'
// skeleton) and the body's shape as a field (sdf.js) of bone-attached parts,
// melted together: pelvis, belly, rib cage, chest, shoulders, neck, the head
// (cranium, cheeks, jaw lines, chin, nose, ears), limbs with their muscles,
// hands with five fingers, feet flat on the ground. Doll style: smooth, no
// anatomical detail; the underwear is painted on (paint.js).
//
// Proportions come from tables by age (2 to 90) for a boy/man (sex 0) and a
// girl/woman (sex 1), blended; the tables follow the anime's and the 3DS
// games' proportions (big heads on children, long legs on adults; measured on
// the X/Y models, tools/people/), then every slider moves them.
//
// anatomy(params) -> { p (params filled in), H, sk (skeleton, T pose), tree
// (field, T pose), L (landmarks for garments, hair and faces), aq (A pose
// rotations), aw (A pose world matrices), ad (rest -> A pose per bone) }
import { BONE as B, axisX, skeleton, worlds, aPose, deltas, NB } from './rig.js';
import { P, smin, union, inter, sub, moved, compile } from './sdf.js';
import { add, scale, lerp, clamp, norm, qfromTo, qaxis, qmul, mirror } from './vmath.js';

// ---------- the tables ----------
const AGES = [2, 4, 7, 10, 13, 16, 20, 30, 45, 60, 75, 90];
// key: [boy/man values by AGES], [girl/woman values] (one array: the same for both)
const T = {
  H: [[0.88, 1.02, 1.22, 1.40, 1.56, 1.70, 1.76, 1.76, 1.75, 1.73, 1.70, 1.66], [0.87, 1.01, 1.21, 1.40, 1.55, 1.60, 1.63, 1.64, 1.63, 1.61, 1.57, 1.53]],
  heads: [[3.2, 3.5, 4.0, 4.6, 5.0, 5.5, 6.0, 6.2, 6.1, 5.9, 5.6, 5.4]],
  leg: [[0.34, 0.37, 0.4, 0.43, 0.455, 0.48, 0.5, 0.51, 0.505, 0.5, 0.49, 0.485], [0.34, 0.37, 0.4, 0.43, 0.46, 0.49, 0.51, 0.52, 0.515, 0.505, 0.495, 0.49]],
  sh: [[0.205, 0.20, 0.195, 0.195, 0.20, 0.212, 0.222, 0.226, 0.226, 0.222, 0.216, 0.21], [0.205, 0.20, 0.195, 0.192, 0.19, 0.192, 0.195, 0.197, 0.197, 0.195, 0.19, 0.186]],
  hipW: [[0.185, 0.18, 0.172, 0.166, 0.166, 0.17, 0.174, 0.178, 0.184, 0.186, 0.182, 0.178], [0.185, 0.18, 0.172, 0.172, 0.182, 0.196, 0.204, 0.208, 0.214, 0.214, 0.21, 0.204]],
  waistW: [[0.175, 0.158, 0.142, 0.135, 0.133, 0.137, 0.142, 0.148, 0.158, 0.164, 0.164, 0.16], [0.175, 0.158, 0.142, 0.13, 0.124, 0.12, 0.12, 0.124, 0.134, 0.144, 0.15, 0.15]],
  chestW: [[0.18, 0.172, 0.164, 0.16, 0.163, 0.168, 0.174, 0.178, 0.18, 0.176, 0.17, 0.165], [0.18, 0.172, 0.162, 0.156, 0.155, 0.155, 0.156, 0.16, 0.164, 0.164, 0.16, 0.156]],
  chestD: [[0.125, 0.118, 0.108, 0.102, 0.1, 0.104, 0.108, 0.112, 0.118, 0.12, 0.12, 0.118], [0.125, 0.118, 0.106, 0.1, 0.097, 0.098, 0.1, 0.104, 0.11, 0.114, 0.114, 0.112]],
  fat: [[1.0, 0.8, 0.5, 0.35, 0.25, 0.2, 0.15, 0.2, 0.3, 0.35, 0.3, 0.25]],
  limb: [[1.18, 1.08, 0.96, 0.92, 0.92, 0.95, 0.98, 1.0, 1.0, 0.98, 0.94, 0.9], [1.18, 1.08, 0.96, 0.92, 0.92, 0.93, 0.94, 0.95, 0.96, 0.96, 0.93, 0.9]],
  neck: [[0.018, 0.022, 0.028, 0.033, 0.036, 0.04, 0.042, 0.042, 0.04, 0.038, 0.035, 0.033]],
  headW: [[0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78], [0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.79, 0.79, 0.79, 0.79, 0.79, 0.79]],
  eye: [[0.38, 0.39, 0.41, 0.42, 0.43, 0.44, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45]],   // eye line, share of the head from the chin
  jaw: [[0.2, 0.3, 0.45, 0.55, 0.65, 0.78, 0.88, 0.92, 0.95, 0.95, 0.92, 0.9], [0.2, 0.3, 0.42, 0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.68, 0.66]],   // how much the jaw shows (0: round baby face)
  hand: [[0.12, 0.115, 0.11, 0.108, 0.107, 0.107, 0.108, 0.108, 0.108, 0.108, 0.108, 0.108], [0.12, 0.115, 0.11, 0.106, 0.104, 0.103, 0.103, 0.103, 0.103, 0.103, 0.103, 0.103]],
  foot: [[0.165, 0.163, 0.161, 0.16, 0.16, 0.158, 0.157, 0.157, 0.157, 0.157, 0.155, 0.155], [0.165, 0.163, 0.16, 0.157, 0.153, 0.15, 0.148, 0.148, 0.148, 0.148, 0.147, 0.146]],
  bust: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0.2, 0.45, 0.55, 0.58, 0.6, 0.6, 0.55, 0.5]],
  muscle: [[0, 0, 0.05, 0.1, 0.18, 0.3, 0.38, 0.4, 0.36, 0.3, 0.2, 0.12], [0, 0, 0.04, 0.08, 0.1, 0.12, 0.14, 0.14, 0.12, 0.1, 0.08, 0.06]],
  stoop: [[0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.1, 0.32, 0.55]],
};
function table(key, age, sex) {
  const rows = T[key], m = rows[0], f = rows[1] || rows[0];
  let i = 0; while (i < AGES.length - 2 && age > AGES[i + 1]) i++;
  const t = clamp((age - AGES[i]) / (AGES[i + 1] - AGES[i]));
  return lerp(lerp(m[i], m[i + 1], t), lerp(f[i], f[i + 1], t), sex);
}

// the age groups the creator offers (a typical age for each)
export const AGE_GROUPS = [
  { id: 'toddler', name: 'Toddler', age: 4, range: [2, 5] },
  { id: 'child', name: 'Child', age: 7, range: [6, 9] },
  { id: 'preteen', name: 'Preteen', age: 11, range: [10, 12] },
  { id: 'teen', name: 'Teen', age: 15, range: [13, 17] },
  { id: 'young', name: 'Young adult', age: 23, range: [18, 29] },
  { id: 'adult', name: 'Adult', age: 38, range: [30, 49] },
  { id: 'middle', name: 'Middle-aged', age: 56, range: [50, 64] },
  { id: 'elder', name: 'Elder', age: 74, range: [65, 90] },
];

// every slider, its range and default (0 = the age's norm); the creator's body
// and head panels are made from this list
export const SLIDERS = {
  age: [2, 90, 11], sex: [0, 1, 0],
  height: [-1, 1, 0], weight: [-1, 2, 0], muscle: [-0.5, 1, 0],
  shoulders: [-1, 1, 0], chest: [-1, 1, 0], waist: [-1, 1, 0], hips: [-1, 1, 0], belly: [0, 1, 0], bust: [0, 1, 0.5],
  legs: [-1, 1, 0], arms: [-1, 1, 0], neck: [-1, 1, 0], neckW: [-1, 1, 0], torso: [-1, 1, 0],
  head: [-1, 1, 0], hands: [-1, 1, 0], feet: [-1, 1, 0], posture: [0, 1, 0],
  thighs: [-1, 1, 0], calves: [-1, 1, 0], upperArms: [-1, 1, 0],
  headW: [-1, 1, 0], headH: [-1, 1, 0], headD: [-1, 1, 0], jaw: [-1, 1, 0], jawLine: [-1, 1, 0], chin: [-1, 1, 0], chinW: [-1, 1, 0],
  cheeks: [-1, 1, 0], cheekbones: [0, 1, 0], forehead: [-1, 1, 0],
  ears: [-1, 1, 0], earPoint: [0, 1, 0], earOut: [-1, 1, 0],
  nose: [-1, 1, 0], noseLen: [-1, 1, 0], noseUp: [-1, 1, 0], noseW: [-1, 1, 0], noseBridge: [0, 1, 0],
};
export function defaults(over = {}) {
  const p = {};
  for (const [k, v] of Object.entries(SLIDERS)) p[k] = v[2];
  return Object.assign(p, over);
}

// ---------- the body ----------
export function anatomy(params = {}) {
  const p = defaults(params), age = clamp(p.age, 2, 90), sx = clamp(p.sex);
  const tb = (k) => table(k, age, sx);
  const H = tb('H') * (1 + 0.075 * p.height);
  const w = p.weight, mu = clamp(tb('muscle') + 0.6 * p.muscle, -0.3, 1.2), fat = tb('fat');
  const kh = 1 + 0.12 * p.head;
  const hh = H / tb('heads') * kh;                       // head: chin to crown
  const hw = hh * tb('headW') * (1 + 0.08 * p.headW);    // head width
  const hd = hh * 0.9 * (1 + 0.07 * p.headD);           // head depth
  const hhs = hh * (1 + 0.07 * p.headH);                 // cranium height
  const limbK = tb('limb') * (1 + 0.13 * w + 0.06 * mu);
  const legShare = tb('leg') + 0.025 * p.legs;
  const stoop = clamp(tb('stoop') + p.posture);
  const bust = tb('bust') * clamp(p.bust) * 1.6;

  // ---- landmarks (T pose) ----
  const crown = H, chinY = H - hh;
  const neckLen = H * tb('neck') * (1 + 0.3 * p.neck);
  const shY = chinY - neckLen - 0.022 * H;               // shoulder joints
  const ankleY = 0.043 * H + 0.006;
  const hipJ = Math.max(ankleY + 0.2 * H, legShare * H);
  const torsoK = 1 + 0.06 * p.torso;
  const sh = H * tb('sh') * (1 + 0.07 * p.shoulders + 0.03 * mu);
  const hipW = H * tb('hipW') * (1 + 0.07 * p.hips + 0.06 * w);
  const waistW = H * tb('waistW') * (1 + 0.08 * p.waist + 0.13 * w + 0.05 * fat);
  const chestW = H * tb('chestW') * (1 + 0.06 * p.chest + 0.08 * w + 0.04 * mu);
  const chestD = H * tb('chestD') * (1 + 0.05 * p.chest + 0.1 * w);
  const waistD = chestD * (0.82 + 0.1 * fat) * (1 + 0.14 * w);
  const hipD = chestD * (0.98 + 0.06 * sx) * (1 + 0.08 * w);
  const hipJx = hipW * 0.255;
  const armK = 1 + 0.05 * p.arms;
  const Lua = 0.168 * H * armK, Lfa = 0.142 * H * armK;
  const handL = tb('hand') * H * (1 + 0.1 * p.hands), footL = tb('foot') * H * (1 + 0.1 * p.feet);
  const legL = hipJ - ankleY, Lth = legL * 0.5, Lsh = legL * 0.5;
  const eyeY = chinY + hh * tb('eye');

  // ---- joints ----
  const J = new Array(NB);
  const st = stoop;
  J[B.Origin] = [0, 0, 0];
  J[B.Waist] = [0, hipJ + 0.022 * H, 0];
  J[B.Hips] = [0, hipJ + 0.01 * H, 0];
  J[B.Spine1] = [0, hipJ + 0.034 * H, 0];
  J[B.Spine2] = [0, shY - 0.17 * H * torsoK, -0.004 * H - 0.012 * H * st];
  J[B.Spine3] = [0, shY - 0.07 * H, -0.006 * H + 0.012 * H * st];
  J[B.Neck] = [0, shY + 0.018 * H - 0.01 * H * st, -0.012 * H + 0.04 * H * st];
  J[B.Head] = [0, chinY + 0.24 * hh - 0.015 * H * st, -0.035 * hh + 0.055 * H * st];
  // the head and everything on it moves with the stoop: the face forward and a little down
  const headShift = [0, -0.015 * H * st, 0.055 * H * st];
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1, X = (v) => [v[0] * m, v[1], v[2]];
    J[B[s + 'Thigh']] = X([hipJx, hipJ, 0]);
    J[B[s + 'Leg']] = add(J[B[s + 'Thigh']], scale(axisX(B.LThigh), Lth));
    J[B[s + 'Foot']] = add(J[B[s + 'Leg']], scale(axisX(B.LLeg), Lsh));
    J[B[s + 'Foot']][1] = ankleY; J[B[s + 'Leg']][2] = J[B[s + 'Foot']][2] * 0.5;
    const dropT = (ankleY - 0.012 * H) / 0.496;
    J[B[s + 'Toe']] = add(J[B[s + 'Foot']], scale(axisX(B.LFoot), Math.min(dropT, footL * 0.52)));
    J[B[s + 'Shoulder']] = X([0.024 * H, shY + 0.022 * H, -0.004 * H + 0.012 * H * st]);
    J[B[s + 'ArmA']] = X([sh / 2, shY, -0.006 * H + 0.014 * H * st]);
    J[B[s + 'ForeArm']] = X(add(J[B.LArmA] || [sh / 2, shY, -0.006 * H + 0.014 * H * st], [Lua, 0, 0]));
    J[B[s + 'Hand']] = X(add([sh / 2 + Lua, shY, -0.006 * H + 0.014 * H * st], [Lfa, -0.001 * H, 0]));
  }
  // fingers (left hand, then mirrored): knuckles across the palm, the thumb at its root
  const pw = handL * 0.42 * (1 + 0.04 * w), palmL = handL * 0.47;
  const wl = J[B.LHand];
  const F = {   // [name, knuckle offset across (z, share of palm width), segment lengths (share of hand)]
    B: [0.34, [0.215, 0.135, 0.11]], C: [0.11, [0.23, 0.155, 0.12]], D: [-0.13, [0.215, 0.14, 0.11]],
  };
  const knuck = (zs, back = 0) => add(wl, [palmL - back, 0.006 * pw, zs * pw]);
  for (const [f, [zs, segs]] of Object.entries(F)) {
    let q = knuck(zs, f === 'B' ? 0.01 * handL : f === 'D' ? 0.02 * handL : 0);
    J[B['LFinger' + f + '1']] = q;
    q = add(q, [segs[0] * handL, 0, zs * 0.03 * pw]); J[B['LFinger' + f + '2']] = q;
    q = add(q, [segs[1] * handL, 0, zs * 0.03 * pw]); J[B['LFinger' + f + '3']] = q;
  }
  const thumbDir = norm([0.62, -0.42, 0.66]);
  J[B.LFingerA1] = add(wl, [0.1 * handL, -0.16 * pw, 0.34 * pw]);
  J[B.LFingerA2] = add(J[B.LFingerA1], scale(thumbDir, 0.2 * handL));
  J[B.LFingerA3] = add(J[B.LFingerA2], scale(norm([0.8, -0.25, 0.55]), 0.15 * handL));
  for (const n of ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3']) J[B['RFinger' + n]] = mirror(J[B['LFinger' + n]]);
  // finger tips (not joints, for the shapes)
  const tipOf = (f) => { const [zs, segs] = F[f]; return add(J[B['LFinger' + f + '3']], [segs[2] * handL, 0, zs * 0.02 * pw]); };
  const sk = skeleton(J);

  // ---- the shape ----
  const R = H * limbK;                          // limb radii scale
  const fem = sx, kidRound = fat;
  const parts = [];
  const torso = [], front = [];   // the trunk's big forms; chest and belly on them with a tighter blend
  // pelvis, buttocks, abdomen, rib cage, upper chest
  torso.push(P.ellipsoid({ c: [0, hipJ + 0.012 * H, -0.006 * H], r: [hipW * 0.47, 0.078 * H, hipD * 0.5], bone: B.Hips }));
  for (const m of [1, -1]) torso.push(P.ellipsoid({ c: [m * 0.042 * H * (hipW / (0.17 * H)), hipJ - 0.006 * H, -hipD * 0.2], r: [0.048 * H * (1 + 0.1 * fem), 0.058 * H, 0.046 * H * (1 + 0.12 * fem + 0.1 * w)], bone: B.Hips }));
  const abY = hipJ + 0.085 * H;
  torso.push(P.ellipsoid({ c: [0, abY, 0.0], r: [waistW * 0.56, 0.11 * H * torsoK, waistD * 0.52], ramp: [B.Hips, B.Spine1, [0, hipJ, 0], [0, abY + 0.05 * H, 0]] }));
  const ribY = shY - 0.115 * H * torsoK;
  torso.push(P.ellipsoid({ c: [0, ribY, -0.006 * H + 0.008 * H * st], r: [chestW * 0.5, 0.125 * H * torsoK, chestD * 0.5], ramp: [B.Spine2, B.Spine3, [0, J[B.Spine2][1], 0], [0, shY, 0]] }));
  torso.push(P.ellipsoid({ c: [0, shY - 0.045 * H, -0.004 * H + 0.012 * H * st], r: [chestW * 0.53, 0.062 * H, chestD * 0.46], bone: B.Spine3 }));
  // the back's curve with the stoop
  if (st > 0.01) torso.push(P.ellipsoid({ c: [0, shY - 0.06 * H, -chestD * 0.32 + 0.004 * H], r: [chestW * 0.42, 0.09 * H, 0.05 * H * st + 0.02 * H], bone: B.Spine3 }));
  // belly (weight, the slider and baby fat)
  const bel = clamp(p.belly + 0.4 * Math.max(w, 0) + 0.5 * kidRound * (age < 6 ? 1 : 0));
  if (bel > 0.02) front.push(P.ellipsoid({ c: [0, hipJ + 0.075 * H, waistD * 0.5 - 0.035 * H * (1 - 0.4 * bel)], r: [waistW * 0.4 * (0.7 + 0.4 * bel), 0.075 * H * (0.7 + 0.4 * bel), 0.05 * H * bel + 0.01 * H], bone: B.Spine1 }));
  // chest: a woman's bust (modest), a man's pectorals with muscle
  if (bust > 0.02) for (const m of [1, -1]) front.push(P.ellipsoid({ c: [m * 0.05 * H, shY - 0.105 * H, chestD * 0.5 - 0.022 * H], r: [0.046 * H * (0.6 + 0.4 * bust), 0.04 * H * (0.6 + 0.4 * bust), 0.022 * H * bust + 0.008 * H], q: qaxis([0, 1, 0], m * 0.25), bone: B.Spine3 }));
  if (mu > 0.15 && fem < 0.6) for (const m of [1, -1]) front.push(P.ellipsoid({ c: [m * 0.048 * H, shY - 0.075 * H, chestD * 0.46 - 0.018 * H], r: [0.055 * H, 0.04 * H, 0.012 * H * mu + 0.004 * H], bone: B.Spine3 }));
  parts.push(front.length ? smin(0.02 * H, smin(0.045 * H, torso), front) : smin(0.045 * H, torso));

  // shoulder girdle and trapezius (to each arm)
  const girdle = [];
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1, arm = J[B[s + 'ArmA']];
    girdle.push(P.rcone({ a: [0, shY + 0.008 * H, -0.01 * H + 0.012 * H * st], b: [arm[0] * 0.92, shY + 0.002 * H, arm[2] - 0.004 * H], ra: 0.036 * H * (1 + 0.1 * w), rb: 0.032 * H * (1 + 0.15 * mu), ramp: [B.Spine3, B[s + 'Shoulder'], [0, shY, 0], [arm[0], shY, 0]] }));
    girdle.push(P.rcone({ a: [0, shY + 0.035 * H - 0.012 * H * st, -0.018 * H + 0.03 * H * st], b: [m * sh * 0.32, shY + 0.012 * H, -0.016 * H + 0.012 * H * st], ra: 0.026 * H * (1 + 0.3 * mu), rb: 0.024 * H, ramp: [B.Neck, B[s + 'Shoulder'], [0, shY + 0.03 * H, 0], [m * sh * 0.35, shY, 0]] }));
  }
  parts.push(smin(0.03 * H, girdle));

  // neck
  // anime necks are slender; a man's thickens after puberty
  const neckR = H * (0.0195 + 0.0065 * (1 - fem) * clamp((age - 12) / 8)) * (1 + 0.15 * p.neckW + 0.12 * w + 0.1 * mu) * (age < 8 ? 1.08 : 1);
  const neckTop = add([0, chinY + 0.2 * hh, -0.05 * hh], headShift);
  parts.push(P.rcone({ a: [0, shY - 0.02 * H, -0.014 * H + 0.03 * H * st], b: neckTop, ra: neckR * 1.15, rb: neckR, ramp: [B.Spine3, B.Head, [0, shY, 0], [0, chinY + 0.15 * hh, 0]] }));

  // legs and feet
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1, hip = J[B[s + 'Thigh']], knee = J[B[s + 'Leg']], ank = J[B[s + 'Foot']], toe = J[B[s + 'Toe']];
    const thR = 0.05 * R * (1 + 0.1 * fem + 0.1 * p.thighs), knR = 0.03 * R, caR = 0.032 * R * (1 + 0.1 * p.calves), anR = 0.018 * R * (1 - 0.1 * w);
    const leg = [];
    leg.push(P.rcone({ a: add(hip, [m * 0.004 * H, 0.012 * H, 0]), b: knee, ra: thR, rb: knR, bone: B[s + 'Thigh'] }));
    // anime legs: long smooth tapers; muscle only shows when asked for
    leg.push(P.ellipsoid({ c: add(knee, [m * 0.002 * H, Lth * 0.55, 0.008 * H]), r: [thR * (0.62 + 0.2 * mu), Lth * 0.42, thR * (0.6 + 0.18 * mu)], bone: B[s + 'Thigh'] }));
    if (fem > 0.3 && age > 12) leg.push(P.ellipsoid({ c: add(hip, [m * 0.022 * H, -0.03 * H, -0.004 * H]), r: [0.04 * H, 0.06 * H, 0.042 * H], bone: B[s + 'Thigh'] }));
    leg.push(P.rcone({ a: knee, b: ank, ra: knR * 1.02, rb: anR, bone: B[s + 'Leg'] }));
    leg.push(P.ellipsoid({ c: add(knee, [m * 0.001 * H, -Lsh * 0.32, -0.012 * R]), r: [caR * (0.78 + 0.25 * mu), Lsh * 0.32, caR * (0.74 + 0.25 * mu)], bone: B[s + 'Leg'] }));
    if (mu > 0.5) leg.push(P.sphere({ c: add(knee, [0, 0.004 * H, 0.01 * R]), r: knR * 0.6, bone: B[s + 'Leg'] }));
    parts.push(smin(0.022 * H, leg));
    // foot: heel, arch, ball and toes, flat underneath
    const fw = footL * 0.19 * (1 + 0.15 * w), heelZ = ank[2] - footL * 0.25, ballZ = toe[2], tipZ = heelZ + footL;
    const foot = [
      P.sphere({ c: [ank[0], ankleY, ank[2] - 0.002 * H], r: anR * 1.1, bone: B[s + 'Foot'] }),
      P.ellipsoid({ c: [ank[0], 0.022 * H, heelZ + footL * 0.08], r: [fw * 0.85, 0.024 * H, footL * 0.12], bone: B[s + 'Foot'] }),
      P.ellipsoid({ c: [ank[0] + m * 0.003 * H, 0.022 * H, (heelZ + ballZ) / 2 + 0.01 * H], r: [fw, 0.026 * H, (ballZ - heelZ) / 2 + 0.01 * H], bone: B[s + 'Foot'] }),
      P.ellipsoid({ c: [ank[0] + m * 0.004 * H, 0.014 * H, (ballZ + tipZ) / 2], r: [fw * 1.02, 0.015 * H, (tipZ - ballZ) / 2 + 0.004 * H], bone: B[s + 'Toe'] }),
    ];
    parts.push(inter(smin(0.016 * H, foot), P.plane({ p: [0, 0.0015, 0], n: [0, -1, 0] })));
  }

  // arms and hands
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1, sho = J[B[s + 'ArmA']], elb = J[B[s + 'ForeArm']], wr = J[B[s + 'Hand']];
    const uaR = 0.029 * R * (1 + 0.12 * p.upperArms - 0.05 * fem), elR = 0.02 * R, faR = 0.023 * R, wrR = 0.0155 * R * (1 - 0.1 * w);
    const arm = [
      P.ellipsoid({ c: add(sho, [m * 0.004 * H, -0.004 * H, 0]), r: [0.036 * H, 0.032 * H * (1 + 0.3 * mu), 0.034 * H * (1 + 0.2 * mu)], bone: B[s + 'ArmA'] }),
      P.rcone({ a: sho, b: elb, ra: uaR, rb: elR, bone: B[s + 'ArmA'] }),
      P.ellipsoid({ c: add(elb, [-m * Lua * 0.45, 0.002 * H, 0.004 * H]), r: [Lua * 0.33, uaR * (0.62 + 0.4 * mu), uaR * (0.66 + 0.45 * mu)], bone: B[s + 'ArmA'] }),
      P.rcone({ a: elb, b: wr, ra: elR * 1.04, rb: wrR, bone: B[s + 'ForeArm'] }),
      P.ellipsoid({ c: add(elb, [m * Lfa * 0.28, 0, 0.002 * H]), r: [Lfa * 0.3, faR * (0.72 + 0.2 * mu), faR * (0.84 + 0.2 * mu)], bone: B[s + 'ForeArm'] }),
    ];
    parts.push(smin(0.02 * H, arm));
    // hand: palm (and the thumb's pad), fingers
    const X = (v) => [v[0] * m, v[1], v[2]];
    const fr = 0.0047 * H * (1 + 0.08 * w) * (age < 7 ? 1.12 : 1) * (1 - 0.06 * fem), wlL = [Math.abs(wr[0]), wr[1], wr[2]];
    const hand = [
      P.box({ c: X(add(wlL, [palmL * 0.52, 0.001 * H, 0.02 * pw])), h: [palmL * 0.5, pw * 0.17, pw * 0.5], round: pw * 0.16, bone: B[s + 'Hand'] }),
      P.ellipsoid({ c: X(add(wlL, [palmL * 0.3, -0.06 * pw, 0.3 * pw])), r: [palmL * 0.3, pw * 0.15, pw * 0.2], bone: B[s + 'FingerA1'] }),
      P.rcone({ a: X(add(wlL, [0.02 * handL, 0, 0])), b: X(add(wlL, [palmL * 0.3, 0, 0])), ra: wrR, rb: pw * 0.3, bone: B[s + 'Hand'] }),
    ];
    const fingers = [];
    const chain = (pts, rs, bones) => { for (let i = 0; i < pts.length - 1; i++) fingers.push(P.rcone({ a: X(pts[i]), b: X(pts[i + 1]), ra: rs[i], rb: rs[i + 1], bone: B[s + bones[i]] })); };
    for (const f of ['B', 'C', 'D']) {
      const k1 = J[B['LFinger' + f + '1']], k2 = J[B['LFinger' + f + '2']], k3 = J[B['LFinger' + f + '3']], tp = tipOf(f);
      const fk = f === 'C' ? 1.04 : f === 'D' ? 0.97 : 1;
      chain([add(k1, [-0.02 * handL, 0, 0]), k2, k3, add(tp, [-fr * 0.6, 0, 0])], [fr * 1.08 * fk, fr * fk, fr * 0.93 * fk, fr * 0.86 * fk], ['Finger' + f + '1', 'Finger' + f + '2', 'Finger' + f + '3']);
    }
    // the little finger rides on the ring finger's bones
    {
      const zs = -0.36, base = knuck(zs, 0.075 * handL), a2 = add(base, [0.16 * handL, 0, zs * 0.06 * pw]), a3 = add(a2, [0.105 * handL, 0, zs * 0.03 * pw]), tp = add(a3, [0.09 * handL - fr * 0.5, 0, 0]);
      chain([add(base, [-0.02 * handL, 0, 0]), a2, a3, tp], [fr * 0.95, fr * 0.86, fr * 0.8, fr * 0.74], ['FingerD1', 'FingerD2', 'FingerD3']);
    }
    {
      const a1 = J[B.LFingerA1], a2 = J[B.LFingerA2], a3 = J[B.LFingerA3], tp = add(a3, scale(norm([0.8, -0.2, 0.55]), 0.12 * handL - fr * 0.6));
      chain([add(a1, [-0.01 * handL, 0.003 * H, -0.004 * H]), a2, a3, tp], [fr * 1.35, fr * 1.15, fr * 1.05, fr * 0.95], ['FingerA1', 'FingerA2', 'FingerA3']);
    }
    parts.push(smin(0.0028 * H, smin(0.007 * H, hand), smin(0.0012 * H, fingers)));
  }

  // head
  const hc = (x, y, z) => add([x, chinY + y, z], headShift);   // head space: y from the chin, z from the neck's axis
  const jawK = tb('jaw') * (1 + 0.35 * p.jawLine), cheekK = clamp(fat * 0.9 + 0.25 * p.cheeks + 0.15 * Math.max(w, 0), 0, 1.4);
  const head = [];
  // cranium (big and round; the back of the skull reaches well behind the neck)
  const fh = 1 + 0.05 * p.forehead;
  head.push(P.ellipsoid({ c: hc(0, hh - 0.4 * hhs, -0.03 * hh), r: [hw * 0.5, 0.4 * hhs * fh, hd * 0.52], bone: B.Head }));
  // the face: a broad, nearly upright front from the brow to the mouth
  const faceW = hw * (0.45 + 0.04 * p.jaw) * (1 - 0.06 * jawK);
  head.push(P.ellipsoid({ c: hc(0, 0.38 * hh, 0.09 * hh), r: [faceW, 0.38 * hh, 0.37 * hh], bone: B.Head }));
  // cheeks (round on small children), cheekbones
  if (cheekK > 0.02) for (const m of [1, -1]) head.push(P.sphere({ c: hc(m * 0.26 * hw, 0.29 * hh, 0.24 * hh), r: 0.15 * hw * (0.6 + 0.5 * cheekK), bone: B.Head }));
  if (p.cheekbones > 0.02) for (const m of [1, -1]) head.push(P.ellipsoid({ c: hc(m * 0.35 * hw, 0.43 * hh, 0.2 * hh), r: [0.1 * hw, 0.05 * hh * p.cheekbones + 0.02 * hh, 0.09 * hh], bone: B.Head }));
  // jaw lines from under the ears down to the chin (a soft V; rounder on children)
  const chinLen = 1 + 0.1 * p.chin, chinR = hw * (0.085 + 0.025 * p.chinW) * (1.25 - 0.3 * jawK);
  const chinZ = 0.3 * hh * chinLen, chinX = hw * (0.05 + 0.03 * p.chinW) * (1.6 - jawK);
  for (const m of [1, -1]) head.push(P.rcone({ a: hc(m * 0.41 * hw * (1 + 0.05 * p.jaw), 0.42 * hh, -0.03 * hh), b: hc(m * chinX, chinR * 0.95, chinZ - 0.04 * hh), ra: 0.075 * hw * (0.7 + 0.5 * jawK), rb: chinR * 0.8, bone: B.Head }));
  head.push(P.sphere({ c: hc(0, chinR, chinZ - chinR * 0.35), r: chinR, bone: B.Head }));
  let headTree = smin(hw * (0.14 - 0.05 * jawK), head);
  // the face's front, found on the head so far, to put the nose and the ears on
  const hf = compile(headTree);
  const frontZ = (x, y) => { let z = hd; for (let i = 0; i < 64; i++) { const d = hf.f(x, y, z); if (d < 1e-4) break; z -= Math.max(d, 1e-4); } return z; };
  const sideX = (y, z) => { let x = hw; for (let i = 0; i < 64; i++) { const d = hf.f(x, y, z); if (d < 1e-4) break; x -= Math.max(d, 1e-4); } return x; };
  const noseY = eyeY - hh * 0.13 * (1 + 0.15 * p.noseLen) + 0.012 * hh * p.noseUp;
  const nz = frontZ(0, noseY + headShift[1]);
  const ns = hh * (0.045 + 0.012 * p.nose) * (age < 8 ? 0.8 : 1);
  const nose = [
    P.ellipsoid({ c: [0, noseY + headShift[1], nz - ns * 0.15], r: [ns * 0.75 * (1 + 0.25 * p.noseW), ns * 0.8, ns * 0.7], q: qaxis([1, 0, 0], -0.25 - 0.25 * p.noseUp), bone: B.Head }),
  ];
  if (p.noseBridge > 0.02 || age > 14) {
    const bt = eyeY + headShift[1] - 0.02 * hh, bz = frontZ(0, bt);
    nose.push(P.rcone({ a: [0, bt, bz - ns * 0.4], b: [0, noseY + headShift[1] + ns * 0.4, nz - ns * 0.05], ra: ns * 0.32, rb: ns * 0.5 * (0.6 + 0.4 * (p.noseBridge + 0.3)), bone: B.Head }));
  }
  // ears: a flat shell with a hollow, set back on the sides
  const ears = [];
  const earY = eyeY + headShift[1] - 0.06 * hh, earS = hh * (0.13 + 0.025 * p.ears) * (age < 8 ? 1.05 : 1);
  for (const m of [1, -1]) {
    const ez = -0.035 * hh + headShift[2], ex = sideX(earY, ez);
    const tilt = qmul(qaxis([0, 0, 1], m * (0.15 + 0.2 * p.earOut)), qaxis([1, 0, 0], 0.2));
    const shellE = P.ellipsoid({ c: [m * (ex + earS * 0.2), earY, ez - earS * 0.05], r: [earS * 0.2, earS * (0.55 + 0.25 * p.earPoint), earS * 0.38], q: tilt, bone: B.Head });
    const hollow = P.ellipsoid({ c: [m * (ex + earS * 0.36), earY - earS * 0.02, ez - earS * 0.02], r: [earS * 0.12, earS * 0.38, earS * 0.24], q: tilt });
    const parts2 = [shellE];
    if (p.earPoint > 0.05) parts2.push(P.rcone({ a: [m * (ex + earS * 0.05), earY + earS * 0.2, ez - earS * 0.05], b: [m * (ex + earS * 0.15), earY + earS * (0.5 + 0.5 * p.earPoint), ez - earS * 0.2 * p.earPoint], ra: earS * 0.15, rb: earS * 0.03, q: tilt, bone: B.Head }));
    ears.push(sub(earS * 0.04, smin(earS * 0.08, parts2), hollow));
  }
  headTree = smin(hw * 0.03, headTree, smin(ns * 0.6, nose), smin(hw * 0.04, ears));
  parts.push(headTree);

  // the whole body: limbs melt into the trunk with their own blend
  const tree = smin(0.02 * H, parts);

  // ---- landmarks for garments, hair, faces ----
  const L = {
    H, hh, hw, hd, crown, chinY, eyeY, noseY: noseY + headShift[1], headShift, shY, sh, hipJ, hipJx, ankleY, Lth, Lsh, Lua, Lfa, handL, footL, pw,
    waistY: abY + 0.02 * H, chestY: shY - 0.105 * H, crotchY: hipJ - 0.055 * H, kneeY: J[B.LLeg][1],
    hipW, waistW, chestW, chestD, waistD, hipD, neckR, R, fem, age, fat, bust, stoop: st, muscle: mu, weight: w,
    headC: add([0, chinY + 0.55 * hh, 0.0], headShift), faceZ: frontZ(0, eyeY + headShift[1]),
  };
  const aq = aPose(age < 6 ? 40 : 45);
  const aw = worlds(sk, aq), ad = deltas(sk, aw);
  return { p, H, sk, J, tree, L, aq, aw, ad };
}

// the field in the A pose (the pose meshes are made in): every leaf moved with its bone
export function posed(tree, ad) {
  const walk = (n) => {
    if (n.op) return { ...n, kids: n.kids ? n.kids.map(walk) : n.kids };
    const b = n.bone !== undefined ? n.bone : n.ramp ? n.ramp[0] : -1;
    if (b < 0) return n;
    const m = ad[b];
    if (Math.abs(m[0] - 1) + Math.abs(m[5] - 1) + Math.abs(m[10] - 1) + Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14]) < 1e-9) return n;
    return moved(m, n);
  };
  return walk(tree);
}
export { union };
