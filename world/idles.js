// Idle actions for the people made on the local base model (actor.js, calemActor):
// now and then, while someone stands still, a small piece of acting on top of the
// idle clip: a hand on the hip, a yawn and stretch, a Poke Ball taken from the
// belt, looked at, tossed and put back, a crouch to look at the ground, sitting
// down for a while, a scratch of the head, the cap put right, hands behind the
// head looking at the sky, a stretch of the arms and neck, a look round with a
// hand shading the eyes, and two small fidgets (a foot twisted in the dirt, the
// shoulders rolled).
//
//   makeIdleActions(rig, { life, ball, npc }) -> { update(dt, wI), post(dt), busy, eyes }
// update runs early in the idle layers (it picks actions and steers the look-around
// target, life.ty / life.tp); post runs after every other layer and poses the body.
//
// Each action is keyed per part, so the parts move on their own timing (the head
// leads, the hands follow): `body` (scalars: holder offset dx/dy/dz in metres, waist
// pitch wp, spine lean / side / tw, shoulders sh, head hp / hy / hr, jaw, eye),
// `gaze` (the look-around target y / p), and `armL` / `armR`, whose keys put the
// wrist at a point on a bone ([bone, x, y, z], metres in the bone's rest axes:
// x left, y up, z forward), the elbow towards `pole`, the wrist turned by wf / wd /
// wt and the fingers curled by cu; a null key is the arm as the idle has it.
// Scalars go through the keys on a monotone cubic (no overshoot, eased at both
// ends and wherever a value holds), so the motion flows rather than stopping at
// every key. Crouching and sitting lower and move the body and keep the feet where
// they stood with a two-bone IK on each leg. When the person moves or jumps, the
// action lets go within a few tenths of a second.
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const ease = (u) => smooth(0, 1, u);
const rnd = (a, b) => a + Math.random() * (b - a);

// monotone cubic Hermite through (ts[i], vs[i]); flat at the ends
function mono(ts, vs, t) {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0; while (t >= ts[i + 1]) i++;
  const tan = (k) => {
    if (k <= 0 || k >= n - 1) return 0;
    const s0 = (vs[k] - vs[k - 1]) / (ts[k] - ts[k - 1]), s1 = (vs[k + 1] - vs[k]) / (ts[k + 1] - ts[k]);
    return s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1);
  };
  const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * tan(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * tan(i + 1);
}
// a scalar track: keys [[t, {name: value}], ...], a missing name is 0
function scalars(keys) {
  const ts = keys.map((k) => k[0]), names = new Set();
  for (const [, o] of keys) for (const n in o) names.add(n);
  const ch = [...names].map((n) => [n, keys.map((k) => k[1][n] ?? 0)]);
  return (t, out) => { for (const [n, vs] of ch) out[n] = mono(ts, vs, t); return out; };
}

// ---------- the actions ----------
// times in seconds; `dur` the length, `stretch: [a, b]` the span that a longer
// run (`len: [min, max]`) stretches; `need`: seconds of standing first;
// `legs`: keeps the feet planted while the body moves; `w`: how often it is picked
const H = (x, y, z) => ['Hips', x, y, z], HD = (x, y, z) => ['Head', x, y, z], CH = (x, y, z) => ['Spine3', x, y, z], GR = (x, y, z) => ['root', x, y, z];
const KN = (s, x, y, z) => [s + 'Leg', x, y, z];
const hold = (k) => ({ ...k });
// the hand on the hip
const HIP = { at: H(-0.205, 0.11, -0.03), pole: [-1, 0.4, -0.5], wf: 0.5, wd: -0.6, cu: -0.25 };
// both hands behind the head
const NAPE = (sg) => ({ at: HD(sg * 0.075, 0.1, -0.12), pole: [sg, 0.45, 0.3], wf: 0.2, wd: 0.3, cu: -0.1 });
// a hand by the side of the chest, elbow down: on the way up to the head and back
const SIDE = (sg) => ({ at: CH(sg * 0.23, -0.04, 0.07), pole: [sg, -0.6, -0.3], cu: 0.1 });
// arms on the knees, sitting
const ONKNEE = (s, sg) => ({ at: KN(s, sg * -0.02, 0.06, 0.1), pole: [sg * 0.6, -0.6, -0.5], wf: 0.4, cu: 0 });
const ACTIONS = {
  // one hand settles on the hip, fingers forward; held while looking round, then let go
  hip: {
    dur: 9, len: [7, 11], stretch: [2, 7], w: 1.2,
    armR: [[0, null], [0.9, HIP], [7.6, hold(HIP)], [8.6, null]],
    body: [[0, {}], [1, { side: 0.025, sh: 0.02 }], [7.4, { side: 0.025, sh: 0.02 }], [9, {}]],
  },
  // a hand up to the back of the head, a short scratch, a sheepish glance down
  scratch: {
    dur: 4.2, w: 1,
    armL: [[0, null], [0.4, { at: CH(0.21, 0.0, 0.08), pole: [1, -0.6, -0.2], cu: 0.15 }], [0.85, { at: HD(0.07, 0.11, -0.08), pole: [1, 0.3, 0.4], wf: 0.4, cu: 0.1 }],
      [3.0, { at: HD(0.07, 0.11, -0.08), pole: [1, 0.3, 0.4], wf: 0.4, cu: 0.1 }], [3.55, { at: CH(0.23, -0.06, 0.06), pole: [1, -0.6, -0.3], cu: 0.1 }], [4.2, null]],
    body: [[0, {}], [0.8, { hr: 0.08, hp: 0.06 }], [3.0, { hr: 0.06, hp: 0.08 }], [4.2, {}]],
    gaze: [[0, { y: 0, p: 0 }], [0.6, { y: 0.15, p: 0.25 }], [3.4, { y: 0.1, p: 0.2 }], [4.2, { y: 0, p: 0 }]],
    fx(c) { if (c.t > 0.8 && c.t < 3.0) c.wobble('L', Math.sin((c.t - 0.8) * 15) * 0.012 * smooth(0.8, 1.1, c.t) * (1 - smooth(2.6, 3.0, c.t))); },
  },
  // the cap: a hand to the brim, a tug down and a little turn, let go
  cap: {
    dur: 3.4, w: 1,
    armR: [[0, null], [0.7, { at: HD(-0.05, 0.17, 0.2), pole: [-0.7, -1, 0.1], wf: 0.3, wt: 0.3, cu: 0.3 }],
      [1.1, { at: HD(-0.05, 0.15, 0.21), pole: [-0.7, -1, 0.1], wf: 0.3, wt: 0.3, cu: 0.4 }],
      [1.9, { at: HD(-0.04, 0.155, 0.21), pole: [-0.7, -1, 0.1], wf: 0.3, wt: 0.3, cu: 0.4 }], [2.45, { at: CH(-0.2, -0.08, 0.12), pole: [-1, -0.6, -0.3], cu: 0.15 }], [3.1, null]],
    body: [[0, {}], [0.7, { hp: 0.1 }], [1.2, { hp: 0.16, hr: -0.03 }], [1.9, { hp: 0.12 }], [3.4, {}]],
  },
  // hands behind the head, a look up at the sky, a slow breath, back down
  sky: {
    dur: 10, len: [8, 13], stretch: [2.5, 7.5], w: 0.9,
    armL: [[0, null], [0.5, SIDE(1)], [1.2, NAPE(1)], [8.5, NAPE(1)], [9.1, SIDE(1)], [9.8, null]],
    armR: [[0, null], [0.6, SIDE(-1)], [1.35, NAPE(-1)], [8.4, NAPE(-1)], [9.0, SIDE(-1)], [9.7, null]],
    body: [[0, {}], [1.2, { lean: -0.06, sh: 0.03 }], [5, { lean: -0.08, sh: 0.04 }], [8.4, { lean: -0.06, sh: 0.03 }], [10, {}]],
    gaze: [[0, { y: 0, p: 0 }], [1.3, { y: 0.1, p: -0.55 }], [4.5, { y: -0.2, p: -0.6 }], [7.5, { y: 0.15, p: -0.5 }], [9.4, { y: 0, p: -0.05 }], [10, { y: 0, p: 0 }]],
  },
  // a hand flat over the eyes against the light, a slow look from one side to the other
  shade: {
    dur: 6.5, w: 0.9,
    armR: [[0, null], [0.8, { at: HD(-0.08, 0.14, 0.15), pole: [-1, -0.1, 0.3], wf: -0.1, wd: 0.2, wt: -0.6, cu: -0.35 }],
      [5.3, { at: HD(-0.08, 0.14, 0.15), pole: [-1, -0.1, 0.3], wf: -0.1, wd: 0.2, wt: -0.6, cu: -0.35 }], [5.85, SIDE(-1)], [6.5, null]],
    body: [[0, {}], [1, { tw: -0.05 }], [3.2, { tw: 0.08 }], [5.2, { tw: -0.04 }], [6.5, {}]],
    gaze: [[0, { y: 0, p: 0 }], [0.9, { y: -0.45, p: -0.1 }], [2.0, { y: -0.4, p: -0.12 }], [3.6, { y: 0.45, p: -0.1 }], [4.6, { y: 0.4, p: -0.12 }], [5.6, { y: 0, p: -0.05 }], [6.5, { y: 0, p: 0 }]],
  },
  // fingers laced, arms pushed out in front, then the neck to one side and the other
  stretch: {
    dur: 6.4, w: 0.9,
    armL: [[0, null], [0.8, { at: CH(0.05, 0.0, 0.3), pole: [0.6, -1, 0], wt: 1.2, cu: 0.2 }], [1.4, { at: CH(0.03, 0.02, 0.43), pole: [1, -0.4, 0], wt: 1.4, wf: -0.4, cu: 0.3 }],
      [2.4, { at: CH(0.03, 0.02, 0.44), pole: [1, -0.4, 0], wt: 1.4, wf: -0.4, cu: 0.3 }], [3.2, null]],
    armR: [[0, null], [0.8, { at: CH(-0.05, 0.0, 0.3), pole: [-0.6, -1, 0], wt: 1.2, cu: 0.2 }], [1.4, { at: CH(-0.03, 0.02, 0.43), pole: [-1, -0.4, 0], wt: 1.4, wf: -0.4, cu: 0.3 }],
      [2.4, { at: CH(-0.03, 0.02, 0.44), pole: [-1, -0.4, 0], wt: 1.4, wf: -0.4, cu: 0.3 }], [3.2, null]],
    body: [[0, {}], [1.4, { lean: 0.06, sh: 0.05 }], [2.4, { lean: 0.07, sh: 0.05 }], [3.2, { sh: -0.02 }], [3.9, { hr: 0.34, hp: 0.06, hy: 0.05 }], [4.5, { hr: 0.35, hp: 0.06, hy: 0.05 }],
      [5.2, { hr: -0.32, hp: 0.06, hy: -0.05 }], [5.7, { hr: -0.33, hp: 0.05, hy: -0.05 }], [6.4, {}]],
    gaze: [[0, { y: 0, p: 0 }], [1.4, { y: 0, p: 0.05 }], [3.2, { y: 0, p: 0 }], [6.4, { y: 0, p: 0 }]],
  },
  // a yawn: a breath in, arms up over the head, back arched, mouth wide and eyes shut, then down
  yawn: {
    dur: 6.4, w: 1,
    armL: [[0, null], [0.95, { at: CH(0.24, 0.02, 0.06), pole: [1, -0.8, -0.3], wf: 0.2, cu: 0.3 }], [1.45, { at: HD(0.2, 0.2, 0.0), pole: [1, -0.3, -0.3], wf: 0, cu: 0.3 }], [1.9, { at: HD(0.1, 0.4, -0.02), pole: [1, 0, -0.3], wf: -0.3, cu: 0.35 }],
      [3.1, { at: HD(0.11, 0.41, -0.03), pole: [1, 0, -0.3], wf: -0.3, cu: 0.35 }], [3.9, { at: CH(0.4, 0.02, 0.02), pole: [0.3, -0.3, -1], wf: 0, cu: 0.1 }],
      [4.5, { at: CH(0.3, -0.25, 0.02), pole: [1, -0.3, -0.6], cu: 0 }], [5.2, null]],
    armR: [[0, null], [1.05, { at: CH(-0.24, 0.02, 0.06), pole: [-1, -0.8, -0.3], wf: 0.2, cu: 0.3 }], [1.55, { at: HD(-0.2, 0.2, 0.0), pole: [-1, -0.3, -0.3], wf: 0, cu: 0.3 }], [2.0, { at: HD(-0.1, 0.4, -0.02), pole: [-1, 0, -0.3], wf: -0.3, cu: 0.35 }],
      [3.1, { at: HD(-0.11, 0.41, -0.03), pole: [-1, 0, -0.3], wf: -0.3, cu: 0.35 }], [3.95, { at: CH(-0.4, 0.02, 0.02), pole: [-0.3, -0.3, -1], wf: 0, cu: 0.1 }],
      [4.6, { at: CH(-0.3, -0.25, 0.02), pole: [-1, -0.3, -0.6], cu: 0 }], [5.3, null]],
    body: [[0, {}], [0.9, { sh: 0.05, hp: -0.06, jaw: 0.12, lean: -0.02 }], [2.1, { lean: -0.12, sh: 0.08, hp: -0.26, jaw: 0.48, eye: 1 }],
      [3.0, { lean: -0.14, sh: 0.08, hp: -0.28, jaw: 0.5, eye: 1, side: 0.035 }], [3.7, { lean: -0.05, sh: 0.02, hp: -0.1, jaw: 0.08, eye: 1 }],
      [4.4, { sh: -0.04, hp: 0.05 }], [5.2, { sh: -0.02, hp: 0.03, hr: 0.04 }], [6.4, {}]],
    gaze: [[0, { y: 0, p: 0 }], [6.4, { y: 0, p: 0 }]],
  },
  // a Poke Ball from the belt: looked at, tossed lightly twice, put back
  ball: {
    dur: 9.6, w: 1.1, ball: true,
    armR: [[0, null], [0.9, { at: H(-0.15, 0.09, 0.08), pole: [-1, -0.3, -0.7], wd: -0.2, cu: 0.1 }], [1.25, { at: H(-0.15, 0.085, 0.085), pole: [-1, -0.3, -0.7], wd: -0.2, cu: 0.3 }],
      [2.2, { at: CH(-0.07, -0.12, 0.29), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.15 }], [3.7, { at: CH(-0.06, -0.11, 0.29), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.25, cu: 0.15 }],
      [3.95, { at: CH(-0.06, -0.15, 0.29), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.25 }], [4.1, { at: CH(-0.06, -0.08, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.1, cu: 0.1 }],
      [4.4, { at: CH(-0.06, -0.12, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.2 }], [4.55, { at: CH(-0.06, -0.15, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.15 }],
      [4.9, { at: CH(-0.06, -0.12, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.15 }],
      [5.45, { at: CH(-0.06, -0.15, 0.29), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.25 }], [5.6, { at: CH(-0.06, -0.08, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.1, cu: 0.1 }],
      [5.9, { at: CH(-0.06, -0.12, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.2 }], [6.05, { at: CH(-0.06, -0.15, 0.3), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.15 }],
      [6.5, { at: CH(-0.07, -0.12, 0.29), pole: [-0.6, -1, -0.3], wt: 2.0, wf: 0.2, cu: 0.15 }],
      [7.8, { at: H(-0.15, 0.085, 0.085), pole: [-1, -0.3, -0.7], wd: -0.2, cu: 0.3 }], [8.15, { at: H(-0.15, 0.09, 0.08), pole: [-1, -0.3, -0.7], wd: -0.2, cu: 0.1 }], [9.2, null]],
    body: [[0, {}], [1.0, { hp: 0.1, tw: -0.06 }], [2.2, { hp: 0.05, lean: 0.04 }], [7, { hp: 0.05, lean: 0.04 }], [8.0, { hp: 0.1, tw: -0.05 }], [9.6, {}]],
    gaze: [[0, { y: 0, p: 0 }], [0.7, { y: -0.3, p: 0.4 }], [1.4, { y: -0.25, p: 0.35 }], [2.3, { y: -0.08, p: 0.45 }], [3.8, { y: -0.08, p: 0.42 }],
      [4.25, { y: -0.08, p: 0.1 }], [4.55, { y: -0.08, p: 0.42 }], [5.75, { y: -0.08, p: 0.1 }], [6.05, { y: -0.08, p: 0.42 }], [7.2, { y: -0.08, p: 0.42 }],
      [7.9, { y: -0.25, p: 0.3 }], [8.6, { y: -0.1, p: 0.05 }], [9.6, { y: 0, p: 0 }]],
    // [time shown, time it grows, tosses [release, catch], shrink, put away]
    prop: { show: 1.15, grow: [1.85, 2.1], toss: [[4.08, 4.52], [5.58, 6.02]], shrink: [7.3, 7.7], hide: 8.1 },
  },
  // down on the heels to look at something on the ground, a touch of it, back up
  crouch: {
    dur: 8, len: [6.5, 10], stretch: [2, 6], w: 0.8, legs: true, need: 15, player: true,
    body: [[0, {}], [0.4, { dy: -0.02, lean: 0.05, hp: 0.1 }], [1.6, { dy: -0.44, dz: -0.1, wp: 0.3, lean: 0.25, ko: 0.4, heel: 0.45, hp: -0.2 }],
      [2.0, { dy: -0.45, dz: -0.1, wp: 0.3, lean: 0.25, ko: 0.4, heel: 0.45, hp: -0.2 }], [3.0, { dy: -0.5, dz: -0.09, wp: 0.45, lean: 0.4, ko: 0.42, heel: 0.6, side: -0.1, tw: -0.1, hp: -0.18 }], [4.4, { dy: -0.5, dz: -0.09, wp: 0.45, lean: 0.4, ko: 0.42, heel: 0.6, side: -0.1, tw: -0.1, hp: -0.18 }], [5.4, { dy: -0.45, dz: -0.1, wp: 0.3, lean: 0.25, ko: 0.4, heel: 0.45, hp: -0.2 }], [6.2, { dy: -0.44, dz: -0.1, wp: 0.3, lean: 0.25, ko: 0.4, heel: 0.45, hp: -0.2 }],
      [7.2, { dy: -0.04, lean: 0.04 }], [8, {}]],
    armL: [[0, null], [1.6, ONKNEE('L', 1)], [6.2, ONKNEE('L', 1)], [7.2, null]],
    armR: [[0, null], [1.6, ONKNEE('R', -1)], [2.6, ONKNEE('R', -1)], [3.4, { at: GR(-0.21, 0.08, 0.3), pole: [-0.6, 0, -1], wf: -0.3, cu: -0.1 }],
      [4.4, { at: GR(-0.22, 0.08, 0.31), pole: [-0.6, 0, -1], wf: -0.3, cu: 0.05 }], [5.2, ONKNEE('R', -1)], [6.2, ONKNEE('R', -1)], [7.2, null]],
    gaze: [[0, { y: 0, p: 0 }], [1.2, { y: -0.1, p: 0.1 }], [3.6, { y: -0.2, p: 0.15 }], [5, { y: 0.2, p: 0.0 }], [6.4, { y: 0, p: 0.0 }], [7.4, { y: 0, p: 0 }], [8, { y: 0, p: 0 }]],
  },
  // down onto the ground for a while, knees up, arms on the knees; then back up
  sit: {
    dur: 16, len: [10, 25], stretch: [4, 12], w: 1.2, legs: true, need: 40, player: true,
    body: [[0, {}], [0.5, { dy: -0.03, lean: 0.06, hp: 0.08 }], [1.6, { dy: -0.45, dz: -0.12, wp: 0.3, lean: 0.25, ko: 0.4, heel: 0.4, hp: 0.1 }],
      [2.6, { dy: -0.61, dz: -0.38, wp: 0.05, lean: 0.12, ko: 0.35, heel: 0, hp: 0 }], [3.4, { dy: -0.63, dz: -0.4, wp: 0, lean: 0.1, ko: 0.35 }],
      [12, { dy: -0.63, dz: -0.4, wp: 0, lean: 0.1, ko: 0.35 }], [13, { dy: -0.6, dz: -0.34, wp: 0.3, lean: 0.35, ko: 0.38 }],
      [14, { dy: -0.45, dz: -0.12, wp: 0.3, lean: 0.25, ko: 0.4, heel: 0.35 }], [15.2, { dy: -0.03, lean: 0.05 }], [16, {}]],
    armL: [[0, null], [1.6, ONKNEE('L', 1)], [12.2, ONKNEE('L', 1)], [13.4, { at: KN('L', 0, 0.02, 0.06), pole: [0.6, -0.4, -0.6], wf: 0.6, cu: -0.1 }], [14.2, ONKNEE('L', 1)], [15.4, null]],
    armR: [[0, null], [1.6, ONKNEE('R', -1)], [12.2, ONKNEE('R', -1)], [13.4, { at: KN('R', 0, 0.02, 0.06), pole: [-0.6, -0.4, -0.6], wf: 0.6, cu: -0.1 }], [14.2, ONKNEE('R', -1)], [15.4, null]],
    gaze: [[0, { y: 0, p: 0 }], [1.2, { y: 0, p: 0.35 }], [3, { y: 0, p: 0.1, f: 0 }], [3.6, { f: 1 }], [11.6, { f: 1 }], [12, { y: 0, p: 0.15 }], [14.5, { y: 0, p: 0.1 }], [16, { y: 0, p: 0 }]],
  },
  // a foot twisted in the dirt, watched
  twist: {
    dur: 2.8, w: 0.6, mirror: true,
    gaze: [[0, { y: 0, p: 0 }], [0.5, { y: 0.15, p: 0.4 }], [2.4, { y: 0.15, p: 0.4 }], [2.8, { y: 0, p: 0 }]],
    fx(c) {
      const u = c.t / 2.8, env = smooth(0, 0.15, u) * (1 - smooth(0.85, 1, u)) * c.env, s = c.A.side, b = c.b;
      b(s + 'Thigh', 1, 0, 0, -0.1 * env); b(s + 'Leg', 1, 0, 0, 0.35 * env); b(s + 'Foot', 1, 0, 0, 0.45 * env);
      b(s + 'Thigh', 0, 1, 0, Math.sin(c.t * 3.6) * 0.26 * env);
      b('Spine1', 0, 0, 1, (s === 'L' ? -0.03 : 0.03) * env);
    },
  },
  // shoulders up and back, a little neck stretch
  shoulders: {
    dur: 1.8, w: 0.6,
    fx(c) {
      const u = c.t / 1.8, env = smooth(0, 0.15, u) * (1 - smooth(0.85, 1, u)) * c.env, b = c.b;
      const up = Math.sin(Math.min(1, u * 1.4) * Math.PI) * c.env;
      b('LShoulder', 0, 0, 1, 0.14 * up); b('RShoulder', 0, 0, 1, -0.14 * up); b('Spine3', 1, 0, 0, -0.06 * up);
      b('Head', 0, 0, 1, Math.sin(u * Math.PI * 2) * 0.12 * env);
    },
  },
};

export function makeIdleActions(rig, { life, ball = false, npc = false }) {
  const B = rig.bones, R = rig.rest, root = rig.root;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), qR = new THREE.Quaternion();
  const wpos = (b, out) => out.setFromMatrixPosition(b.matrixWorld);
  // a point on a bone: offset in metres in the bone's rest axes, turned with the bone
  const point = (spec, out) => {
    if (spec[0] === 'root') return root.localToWorld(out.set(spec[1], spec[2], spec[3]));
    const b = B[spec[0]]; wpos(b, out);
    b.getWorldQuaternion(q1).multiply(q2.copy(R.get(spec[0]).w).invert());
    return out.add(v5.set(spec[1], spec[2], spec[3]).applyQuaternion(q1));
  };
  const toWorldDir = (d, out) => out.set(d[0], d[1], d[2]).applyQuaternion(qR).normalize();

  // two-bone IK: bend the middle joint about its hinge so the chain spans to T, aim it at T,
  // turn the middle joint towards the pole; then blend from the pose it had by w
  const sv1 = new THREE.Quaternion(), sv2 = new THREE.Quaternion();
  const ik = (n1, n2, n3, T, pole, hinge, w) => {
    const b1 = B[n1], b2 = B[n2], b3 = B[n3];
    if (!b1 || !b2 || !b3 || w < 1e-4) return;
    sv1.copy(b1.quaternion); sv2.copy(b2.quaternion);
    b1.updateWorldMatrix(true, true);
    const p1 = wpos(b1, v1), a = p1.distanceTo(wpos(b2, v2)), c = v2.distanceTo(wpos(b3, v3));
    const d = clamp(T.distanceTo(p1), Math.abs(a - c) + 1e-4, (a + c) * 0.9995);
    const bend = Math.acos(clamp((d * d - a * a - c * c) / (2 * a * c), -1, 1));
    rig.pose(n2, [[hinge[0], hinge[1], hinge[2], hinge[3] * bend]]);
    b2.updateMatrixWorld(true);
    wpos(b3, v3).sub(p1).normalize();
    const dir = v4.copy(T).sub(p1).normalize();
    q1.setFromUnitVectors(v3, dir);
    // the middle joint after the aim, and the pole, square to the chain
    const k = wpos(b2, v2).sub(p1).applyQuaternion(q1); k.addScaledVector(dir, -k.dot(dir));
    const pp = v3.copy(pole); pp.addScaledVector(dir, -pp.dot(dir));
    if (k.lengthSq() > 1e-10 && pp.lengthSq() > 1e-8) {
      k.normalize(); pp.normalize();
      const ang = Math.atan2(v5.crossVectors(k, pp).dot(dir), k.dot(pp));
      q1.premultiply(q3.setFromAxisAngle(dir, ang));
    }
    b1.getWorldQuaternion(q2).premultiply(q1);
    b1.parent.getWorldQuaternion(q3);
    b1.quaternion.copy(q3.invert().multiply(q2));
    b1.quaternion.copy(sv1.slerp(b1.quaternion, w));
    b2.quaternion.copy(sv2.slerp(b2.quaternion, w));
    b1.updateMatrixWorld(true);
  };
  // set a bone's world orientation (given in the root frame), blended by w
  const qo1 = new THREE.Quaternion(), qo2 = new THREE.Quaternion(), qH = new THREE.Quaternion();
  const orient = (name, qRoot, w) => {
    const b = B[name]; if (!b) return;
    sv1.copy(b.quaternion);
    b.parent.getWorldQuaternion(qo1);
    b.quaternion.copy(qo1.invert().multiply(qo2.copy(qR).multiply(qRoot)));
    b.quaternion.copy(sv1.slerp(b.quaternion, w));
    b.updateMatrixWorld(true);
  };

  // ---------- the ball ----------
  let prop = null;
  if (ball) {
    const g = new THREE.Group(), r = 0.034;
    const mk = (geo, col) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col })); m.castShadow = true; g.add(m); return m; };
    mk(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#e8352e');
    mk(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#f4f2ee');
    mk(new THREE.CylinderGeometry(r * 1.01, r * 1.01, r * 0.16, 20), '#2f2b36');
    const btn = mk(new THREE.CylinderGeometry(r * 0.34, r * 0.34, r * 0.2, 16).rotateX(Math.PI / 2), '#2f2b36'); btn.position.z = r * 0.95;
    const b2 = mk(new THREE.CylinderGeometry(r * 0.22, r * 0.22, r * 0.24, 16).rotateX(Math.PI / 2), '#f4f2ee'); b2.position.z = r * 1.0;
    const ink = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 20, 12), new THREE.MeshBasicMaterial({ color: '#2f2b36', side: THREE.BackSide })); g.add(ink);
    g.visible = false; root.add(g);
    prop = g;
  }

  // ---------- state ----------
  const P = { act: null, wait: rnd(8, 15), idle: 0, last: null, busy: false, eyes: false };
  const names = Object.keys(ACTIONS).filter((n) => (ball || !ACTIONS[n].ball) && (!npc || !ACTIONS[n].player));
  const prep = (def) => {
    if (def._p) return def._p;
    return (def._p = { body: def.body && scalars(def.body), gaze: def.gaze && scalars(def.gaze) });
  };
  const start = (name) => {
    const def = ACTIONS[name], p = prep(def);
    const len = def.len ? rnd(def.len[0], def.len[1]) : def.dur;
    P.act = { name, def, p, t: 0, len, env: 1, ab: -1, feet: null, body: {}, gz: {}, wob: { L: 0, R: 0 }, side: def.mirror && Math.random() < 0.5 ? 'R' : 'L' };
    P.last = name; P.busy = true;
  };
  const end = () => {
    if (P.act?.def.gaze) life.look = rnd(0.5, 1.5);
    P.act = null; P.busy = false; P.eyes = false; P.wait = rnd(12, 30);
    rig.holder.position.x = 0; rig.holder.position.z = 0;
    if (prop) prop.visible = false;
  };
  const choose = () => {
    const ok = names.filter((n) => n !== P.last && P.idle >= (ACTIONS[n].need || 0));
    let s = 0; for (const n of ok) s += ACTIONS[n].w ?? 1;
    let x = Math.random() * s;
    for (const n of ok) if ((x -= ACTIONS[n].w ?? 1) <= 0) return n;
    return ok[0];
  };
  // the action's own clock: the stretch span takes up a longer run
  const local = (A) => {
    const d = A.def, st = d.stretch;
    if (!st || A.len === d.dur) return A.t;
    const k = (st[1] - st[0] + A.len - d.dur) / (st[1] - st[0]);
    if (A.t <= st[0]) return A.t;
    if (A.t <= st[0] + (st[1] - st[0]) * k) return st[0] + (A.t - st[0]) / k;
    return A.t - (A.len - d.dur);
  };

  const api = {
    get busy() { return P.busy; },
    get eyes() { return P.eyes; },
    get current() { return P.act?.name ?? null; },
    force(name, len) { if (P.act) end(); start(name); if (len) P.act.len = len; },
    update(dt, wI) {
      if (wI > 0.9) P.idle += dt; else if (wI < 0.5) P.idle = 0;
      const A = P.act;
      if (!A) {
        if (wI > 0.9) { if ((P.wait -= dt) < 0) start(choose()); }
        else if (wI < 0.5) P.wait = Math.max(P.wait, rnd(8, 15));
        return;
      }
      // moving or jumping: let go quickly
      if (A.ab < 0 && wI < 0.6) A.ab = 0;
      if (A.ab >= 0) {
        A.ab += dt / (A.def.legs ? 0.5 : 0.35);
        A.env = 1 - ease(A.ab);
        if (A.ab >= 1) return end();
      } else if ((A.t += dt) >= A.len) return end();
      const t = local(A);
      if (A.p.gaze) {
        A.p.gaze(t, A.gz);
        if (!(A.gz.f > 0.5)) { life.ty = A.gz.y * A.env * (A.side === 'R' ? -1 : 1); life.tp = A.gz.p * A.env; life.look = Math.max(life.look, 0.5); }
      }
      A.lt = t;
    },
    post(dt) {
      const A = P.act;
      if (!A) return;
      const t = A.lt ?? 0, env = A.env, d = A.def, b = rig.bend;
      root.updateWorldMatrix(true, false);
      root.getWorldQuaternion(qR);
      // feet where they stand, before anything moves them
      if (d.legs && !A.feet) {
        root.updateMatrixWorld(true);
        A.feet = ['L', 'R'].map((s) => {
          const f = B[s + 'Foot'], toe = B[s + 'Toe'];
          const ank = root.worldToLocal(wpos(f, new THREE.Vector3()));
          const tp = root.worldToLocal(wpos(toe, new THREE.Vector3()));
          const knee = root.worldToLocal(wpos(B[s + 'Leg'], new THREE.Vector3()));
          const hip = root.worldToLocal(wpos(B[s + 'Thigh'], new THREE.Vector3()));
          const axis = ank.clone().sub(hip).normalize(), pole = knee.clone().sub(hip); pole.addScaledVector(axis, -pole.dot(axis));
          if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
          const q = f.getWorldQuaternion(new THREE.Quaternion()).premultiply(qR.clone().invert());
          return { ank, toe: tp, pole: pole.normalize(), q };
        });
      }
      // body
      const Bo = A.p.body ? A.p.body(t, A.body) : A.body;
      const k = env;
      if (d.legs) {
        rig.holder.position.x = (Bo.dx || 0) * k; rig.holder.position.z = (Bo.dz || 0) * k; rig.holder.position.y += (Bo.dy || 0) * k;
      }
      if (Bo.wp) b('Waist', 1, 0, 0, Bo.wp * k);
      if (Bo.lean) { b('Spine1', 1, 0, 0, Bo.lean * 0.3 * k); b('Spine2', 1, 0, 0, Bo.lean * 0.35 * k); b('Spine3', 1, 0, 0, Bo.lean * 0.35 * k); }
      if (Bo.side) { b('Spine1', 0, 0, 1, Bo.side * 0.4 * k); b('Spine2', 0, 0, 1, Bo.side * 0.3 * k); b('Spine3', 0, 0, 1, Bo.side * 0.3 * k); }
      if (Bo.tw) { b('Spine1', 0, 1, 0, Bo.tw * 0.3 * k); b('Spine2', 0, 1, 0, Bo.tw * 0.35 * k); b('Spine3', 0, 1, 0, Bo.tw * 0.35 * k); }
      if (Bo.sh) { b('LShoulder', 0, 0, 1, Bo.sh * k); b('RShoulder', 0, 0, 1, -Bo.sh * k); }
      if (Bo.hp) { b('Neck', 1, 0, 0, Bo.hp * 0.4 * k); b('Head', 1, 0, 0, Bo.hp * 0.6 * k); }
      if (Bo.hy) { b('Neck', 0, 1, 0, Bo.hy * 0.4 * k); b('Head', 0, 1, 0, Bo.hy * 0.6 * k); }
      if (Bo.hr) { b('Neck', 0, 0, 1, Bo.hr * 0.4 * k); b('Head', 0, 0, 1, Bo.hr * 0.6 * k); }
      if (Bo.jaw && B.FJlipL) B.FJlipL.quaternion.multiply(q1.setFromAxisAngle(v1.set(0, 1, 0), Bo.jaw * k));   // (its own axis opens the mouth)
      P.eyes = (Bo.eye || 0) * k > 0.5;
      const ctx = { t, env, A, b, wobble: (s, x) => { A.wob[s] = x; }, prop, point, root };
      A.wob.L = A.wob.R = 0;
      d.fx?.(ctx);
      // legs, then the arms (which may reach for the knees)
      root.updateMatrixWorld(true);
      if (d.legs) legs(A, Bo, env);
      for (const s of ['L', 'R']) if (d['arm' + s]) arm(A, s, t, env);
      if (d.prop && prop) ballStep(A, t, env);
    },
  };

  // ---------- arms ----------
  const T = new THREE.Vector3(), PL = new THREE.Vector3();
  const tgt = { wf: 0, wd: 0, wt: 0, cu: 0 };
  const arm = (A, s, t, env) => {
    const keys = A.def['arm' + s], sg = s === 'L' ? 1 : -1, n = keys.length;
    let i = 0; while (i < n - 2 && t >= keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    let w = 1, run = null;
    if (t <= keys[0][0]) { if (!keys[0][1]) return; run = [0, 0]; }
    else if (t >= keys[n - 1][0]) { if (!keys[n - 1][1]) return; run = [n - 1, n - 1]; }
    else if (!k0[1] && !k1[1]) return;
    else if (!k0[1]) { w = ease((t - k0[0]) / (k1[0] - k0[0])); run = [i + 1, i + 1]; }
    else if (!k1[1]) { w = 1 - ease((t - k0[0]) / (k1[0] - k0[0])); run = [i, i]; }
    else { let a = i, z = i + 1; while (a > 0 && keys[a - 1][1]) a--; while (z < n - 1 && keys[z + 1][1]) z++; run = [a, z]; }
    w *= env;
    if (w < 1e-4) return;
    // interpolate the wrist target, the pole and the hand over the run of keys
    const ks = keys.slice(run[0], run[1] + 1), ts = ks.map((x) => x[0]);
    const pts = ks.map((x) => point(x[1].at, new THREE.Vector3()));
    T.set(mono(ts, pts.map((p) => p.x), t), mono(ts, pts.map((p) => p.y), t), mono(ts, pts.map((p) => p.z), t));
    const po = ks.map((x) => x[1].pole || [sg, -0.3, -0.3]);
    toWorldDir([0, 1, 2].map((j) => mono(ts, po.map((p) => p[j]), t)), PL);
    for (const f in tgt) tgt[f] = mono(ts, ks.map((x) => x[1][f] || 0), t);
    if (A.wob[s]) T.addScaledVector(v1.set(0, 1, 0), A.wob[s]);
    ik(s + 'ArmA', s + 'ForeArm', s + 'Hand', T, PL, [0, 1, 0, -sg], w);
    // the wrist, relative to the forearm
    const h = B[s + 'Hand'];
    if (h) {
      sv1.copy(h.quaternion);
      rig.pose(s + 'Hand', [[1, 0, 0, sg * tgt.wt], [0, 0, 1, -sg * tgt.wf], [0, 1, 0, -sg * tgt.wd]]);
      h.quaternion.copy(sv1.slerp(h.quaternion, w));
    }
    if (tgt.cu) for (const f of ['B', 'C', 'D']) for (let j = 1; j <= 3; j++) rig.bend(`${s}Finger${f}${j}`, 0, 0, 1, -sg * tgt.cu * w);
    B[s + 'ArmA']?.updateMatrixWorld(true);
  };

  // ---------- the ball: from the belt, small, grows in the hand, tossed, shrunk, put back ----------
  const BP = new THREE.Vector3(), BQ = new THREE.Vector3();
  const socket = (out) => point(B.pc_g_ball ? ['pc_g_ball', 0, -0.03, 0] : ['RHand', -0.06, -0.03, 0], out);
  const ballStep = (A, t, env) => {
    const S = A.def.prop;
    prop.visible = t > S.show && t < S.hide && env > 0.02;
    if (!prop.visible) return;
    // (let go of: put away at once, in the hand)
    let s = (0.4 + 0.6 * smooth(S.grow[0], S.grow[1], t) - 0.6 * smooth(S.shrink[0], S.shrink[1], t)) * (A.ab < 0 ? 1 : 1 - smooth(0, 0.4, A.ab));
    root.worldToLocal(socket(BP));
    let spin = 0;
    for (const [r0, r1] of S.toss) {
      if (t <= r0 || t >= r1 || A.ab >= 0) continue;
      // in the air: from where it left the hand up and back into it
      if (!A.rel || A.rel.t !== r0) A.rel = { t: r0, p: BP.clone() };
      const u = (t - r0) / (r1 - r0);
      BQ.copy(A.rel.p).lerp(BP, u); BQ.y += 4 * 0.2 * u * (1 - u);
      BP.copy(BQ); spin = u * Math.PI * 2;
    }
    prop.position.copy(BP); prop.scale.setScalar(s);
    // facing out of the palm, a turn when tossed
    B.RHand.getWorldQuaternion(q1).premultiply(q2.copy(qR).invert());
    prop.quaternion.copy(q1).multiply(q3.copy(R.get('RHand').w).invert()).multiply(q2.setFromAxisAngle(v1.set(1, 0, 0), spin));
  };

  // ---------- legs: feet kept where they stood ----------
  const legs = (A, Bo, env) => {
    root.updateMatrixWorld(true);
    for (const [i, s] of [[0, 'L'], [1, 'R']]) {
      const F = A.feet[i], sg = i ? -1 : 1, heel = (Bo['heel' + s] ?? Bo.heel ?? 0) * env;
      // heel lifted about the ball of the foot
      qH.setFromAxisAngle(v1.set(1, 0, 0), heel);
      const ank = v2.copy(F.ank).sub(F.toe).applyQuaternion(qH).add(F.toe);
      root.localToWorld(T.copy(ank));
      const ko = (Bo.ko || 0) * sg;
      PL.copy(F.pole).applyAxisAngle(v3.set(0, 1, 0), ko).applyQuaternion(qR);
      ik(s + 'Thigh', s + 'Leg', s + 'Foot', T, PL, [1, 0, 0, 1], env);
      orient(s + 'Foot', qH.multiply(F.q), env);
      if (heel) rig.bend(s + 'Toe', 1, 0, 0, -heel);
    }
  };
  return api;
}
