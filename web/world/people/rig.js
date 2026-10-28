// The skeleton every generated person shares. Bone names, the hierarchy and
// each joint's frame (its rest rotation, T pose) follow the game's rig
// convention, so the clips in web/world/anims/ash.json (rotations, plus the
// waist's bob) and everything that drives bones by name (idles, conversations,
// the native game's CastActor) work on these people as they are. Only where the
// joints sit changes from person to person: anatomy.js places them, and a joint
// is put along its parent's frame axis the same way the rig's own are, so a
// clip's rotation swings each limb the way it was authored.
//
// Frames: a bone's +x points along the bone to its child. Model space: metres,
// feet on y = 0, facing +z, the person's left = +x, arms out along x (T pose).
import { qmul, qrot, qinv, mcompose, mmul, minv, mpt, qaxis, sub } from './vmath.js';

// [name, parent, rest rotation (local, x y z w)]
const DEF = [
  ['Origin', null, [0, 0, 0, 1]],
  ['Waist', 'Origin', [0, 0, 0.707108, 0.707105]],
  ['Hips', 'Waist', [0, 0, 1, -1e-6]],
  ['LThigh', 'Hips', [0, -0.008141, 0, 0.999967]],
  ['LLeg', 'LThigh', [0, 0.024022, 0, 0.999711]],
  ['LFoot', 'LLeg', [0, -0.51582, 0, 0.856697]],
  ['LToe', 'LFoot', [0, 0, 0, 1]],
  ['RThigh', 'Hips', [0, -0.008141, 0, 0.999967]],
  ['RLeg', 'RThigh', [0, 0.024022, 0, 0.999711]],
  ['RFoot', 'RLeg', [0, -0.51582, 0, 0.856697]],
  ['RToe', 'RFoot', [0, 0, 0, 1]],
  ['Spine1', 'Waist', [0, 0, 0, 1]],
  ['Spine2', 'Spine1', [0, 0.020998, 0, 0.99978]],
  ['Spine3', 'Spine2', [0, 0.001745, 0, 0.999998]],
  ['Neck', 'Spine3', [0, -0.086396, 0, 0.996261]],
  ['Head', 'Neck', [0, 0.063715, 0, 0.997968]],
  ['LShoulder', 'Spine3', [0.018871, -0.012694, -0.82953, 0.557998]],
  ['LArmA', 'LShoulder', [0, 0, 0.192054, 0.981384]],
  ['LForeArm', 'LArmA', [0, -0.000359, -0.002789, 0.999996]],
  ['LHand', 'LForeArm', [8e-6, -0.001465, 0.003919, 0.999991]],
  ['LFingerA1', 'LHand', [-0.090118, -0.189014, -0.41477, 0.885505]],
  ['LFingerA2', 'LFingerA1', [0, 0, 0, 1]],
  ['LFingerA3', 'LFingerA2', [0, 0, 0, 1]],
  ['LFingerB1', 'LHand', [0, 0.002269, -0.00113, 0.999997]],
  ['LFingerB2', 'LFingerB1', [0, 3.8e-5, 0, 1]],
  ['LFingerB3', 'LFingerB2', [0, 0, 0, 1]],
  ['LFingerC1', 'LHand', [0, 0.002259, -0.00113, 0.999997]],
  ['LFingerC2', 'LFingerC1', [0, 5.2e-5, 0, 1]],
  ['LFingerC3', 'LFingerC2', [0, 0, 0, 1]],
  ['LFingerD1', 'LHand', [0, 0.002281, -0.00113, 0.999997]],
  ['LFingerD2', 'LFingerD1', [0, 2.2e-5, 0, 1]],
  ['LFingerD3', 'LFingerD2', [0, 0, 0, 1]],
  ['RShoulder', 'Spine3', [-0.01887, -0.012695, 0.829497, 0.558048]],
  ['RArmA', 'RShoulder', [0, 0, -0.191991, 0.981397]],
  ['RForeArm', 'RArmA', [0, -0.000359, 0.002805, 0.999996]],
  ['RHand', 'RForeArm', [-8e-6, -0.001466, -0.003919, 0.999991]],
  ['RFingerA1', 'RHand', [0.090117, -0.189012, 0.414772, 0.885504]],
  ['RFingerA2', 'RFingerA1', [0, 0, 0, 1]],
  ['RFingerA3', 'RFingerA2', [0, 0, 0, 1]],
  ['RFingerB1', 'RHand', [0, 0.002269, 0.001114, 0.999997]],
  ['RFingerB2', 'RFingerB1', [0, 3.9e-5, 0, 1]],
  ['RFingerB3', 'RFingerB2', [0, 0, 0, 1]],
  ['RFingerC1', 'RHand', [0, 0.002259, 0.001114, 0.999997]],
  ['RFingerC2', 'RFingerC1', [0, 5.1e-5, 0, 1]],
  ['RFingerC3', 'RFingerC2', [0, 0, 0, 1]],
  ['RFingerD1', 'RHand', [0, 0.002281, 0.001114, 0.999997]],
  ['RFingerD2', 'RFingerD1', [0, 2.3e-5, 0, 1]],
  ['RFingerD3', 'RFingerD2', [0, 0, 0, 1]],
];

export const BONE_NAMES = DEF.map((d) => d[0]);
export const BONE = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
export const PARENT = DEF.map((d) => (d[1] ? BONE[d[1]] : -1));
export const REST_Q = DEF.map((d) => d[2]);
export const NB = DEF.length;

// each bone's rest rotation in model space (T pose)
export const REST_W = (() => {
  const w = [];
  for (let i = 0; i < NB; i++) w.push(PARENT[i] < 0 ? REST_Q[i] : qmul(w[PARENT[i]], REST_Q[i]));
  return w;
})();
// a bone's axes in model space at rest: x along the bone
export const axisX = (i) => qrot(REST_W[i], [1, 0, 0]);
export const axisY = (i) => qrot(REST_W[i], [0, 1, 0]);
export const axisZ = (i) => qrot(REST_W[i], [0, 0, 1]);

// a skeleton from joint positions (model space, T pose): { pos[i], t[i] (local
// translation), q[i] (local rotation = the rig's), world[i] (Float64Array 16), inv[i] }
export function skeleton(pos) {
  const t = [], q = REST_Q.map((r) => r.slice());
  for (let i = 0; i < NB; i++) {
    const p = PARENT[i];
    t.push(p < 0 ? pos[i].slice() : qrot(qinv(REST_W[p]), sub(pos[i], pos[p])));
  }
  const sk = { pos, t, q };
  sk.world = worlds(sk, q);
  sk.inv = sk.world.map(minv);
  return sk;
}

// world matrices for local rotations q (array by bone; missing = rest)
export function worlds(sk, q) {
  const w = [];
  for (let i = 0; i < NB; i++) {
    const m = mcompose(sk.t[i], q[i] || REST_Q[i]);
    w.push(PARENT[i] < 0 ? m : mmul(w[PARENT[i]], m));
  }
  return w;
}

// the pose the meshes are made in: arms lowered (deg, from horizontal) and the
// legs a touch apart; returns local rotations
export function aPose(armDeg = 45, legDeg = 2.5) {
  const q = REST_Q.map((r) => r.slice());
  const turn = (name, axisWorld, ang) => {
    const i = BONE[name], ax = qrot(qinv(REST_W[i]), axisWorld);
    q[i] = qmul(REST_Q[i], qaxis(ax, ang));
  };
  turn('LArmA', [0, 0, 1], -armDeg * Math.PI / 180);
  turn('RArmA', [0, 0, 1], armDeg * Math.PI / 180);
  turn('LThigh', [0, 0, 1], legDeg * Math.PI / 180);
  turn('RThigh', [0, 0, 1], -legDeg * Math.PI / 180);
  return q;
}

// for each bone the matrix taking a rest (T pose) point to the posed one
export function deltas(sk, posedWorld) { return posedWorld.map((m, i) => mmul(m, sk.inv[i])); }
export const xform = mpt;
