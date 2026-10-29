// What the catalogue's words mean on a body (catalog.json's vocabulary), shared by
// every garment builder in this folder, so a "knee" hem or a "three_quarter"
// sleeve is the same everywhere. Heights are on the reference body (base.bin's
// land), arm and leg places along the limb (wear.js: arm 0 shoulder .. 1 wrist,
// leg 0 hip .. 1 ankle).
import { all, any, below, above, neckline, limbTo, noHead, noExt, sstep, clamp } from '../wear.js';

// sleeve -> how far down the arm (s); none: no sleeve (the armhole)
export const SLEEVE = { none: -1, 'n/a': -1, cap: 0.1, short: 0.3, puff_short: 0.24, raglan_short: 0.32, elbow: 0.52, rolled_elbow: 0.46, three_quarter: 0.74, long: 0.97, raglan_long: 0.97, puff_long: 0.95, bell_long: 0.95, kimono_wide: 0.85 };
// leg lengths for bottoms, dresses and legwear -> s along the leg (from the hip)
export const LEG = { short: 0.16, thigh: 0.2, above_knee: 0.4, knee: 0.5, below_knee: 0.6, midi: 0.72, calf: 0.8, ankle: 0.97, floor: 1.1, full_leg: 1.0,
  ankle_sock: 1.02, crew: 0.86, knee_high: 0.53, over_knee: 0.36, low: 1.04, ankle_boot: 0.9, mid_calf: 0.72, below_knee_boot: 0.6 };

// top lengths -> canonical hem height (land)
export function topHem(land, length) {
  switch (length) {
    case 'waist': return land.waistY - 0.01;
    case 'hip': return land.hipJ - 0.0;
    case 'thigh': return land.crotchY - 0.05;
    case 'above_knee': case 'short': return land.kneeY + 0.12;
    case 'knee': return land.kneeY + 0.02;
    case 'below_knee': return land.kneeY - 0.06;
    case 'midi': return land.kneeY - 0.14;
    case 'calf': return land.kneeY - 0.2;
    case 'ankle': case 'floor': return land.ankleY + 0.06;
    default: return land.hipJ - 0.01;
  }
}
// a hem height for skirts/dresses from a leg length word
export function skirtHem(land, length) {
  const s = LEG[length] ?? 0.4;
  return land.hipJ - s * (land.hipJ - land.ankleY);
}

// necklines -> wear.neckline options
export function neckOf(land, neck = 'crew') {
  const base = land.shY + 0.035;   // a crew neck's front, at the collar bones
  switch (neck) {
    case 'v': return { shape: 'v', front: land.shY - 0.07, back: base + 0.01, width: 0.06 };
    case 'scoop': return { shape: 'scoop', front: land.shY - 0.05, back: base - 0.005, width: 0.07 };
    case 'square': return { shape: 'square', front: land.shY - 0.045, back: base - 0.01, width: 0.06 };
    case 'boat': return { shape: 'boat', front: base - 0.005, back: base - 0.005, width: 0.075 };
    case 'turtleneck': case 'funnel': return { shape: 'crew', front: land.chinY - 0.012, back: land.chinY - 0.002, width: 0.05 };
    case 'mock': return { shape: 'crew', front: base + 0.035, back: base + 0.04, width: 0.05 };
    case 'halter_layered': return { shape: 'crew', front: base, back: base, width: 0.05 };
    case 'sailor': case 'wrap': return { shape: 'v', front: land.shY - 0.08, back: base, width: 0.07 };
    case 'notched_lapel': case 'shawl': return { shape: 'v', front: land.shY - 0.11, back: base + 0.01, width: 0.06 };
    case 'henley': case 'collar': case 'mandarin': case 'peter_pan': case 'jewel': case 'bow_neck': default:
      return { shape: 'crew', front: base, back: base + 0.008, width: 0.055 };
  }
}

// the cover of a top: trunk from the neckline down to the hem, sleeves to s (none: armholes)
export function topCover(land, o) {
  const neck = neckOf(land, o.neckline), hem = o.hem ?? topHem(land, o.length), sl = SLEEVE[o.sleeve] ?? 0.3;
  return (V) => {
    if (V.limb === 3) return -0.1;
    const trunk = all(neckline(V, land, neck), above(V, hem), noHead(V) * 0.1, noExt(V) * 0.1);
    if (V.limb === 1) return sl < 0 ? -0.05 : all(limbTo(V, 1, sl), noExt(V) * 0.1);
    if (sl < 0) return all(trunk, (0.36 - V.arm) * 0.2);     // armholes
    if (V.limb === 2) return all(above(V, hem), 0.05);       // the top of the legs under a long top
    return trunk;
  };
}
// the cover of bottoms: from the waist (rise: 'high' | 'mid' | 'low') down each leg to s
export function bottomCover(land, o) {
  const rise = o.rise === 'high' ? land.waistY + 0.03 : o.rise === 'low' ? land.hipJ + 0.07 : land.waistY - 0.01;
  const s = typeof o.leg === 'number' ? o.leg : LEG[o.length] ?? 0.97;
  return (V) => {
    if (V.limb === 1 || V.limb === 3) return -0.1;
    if (V.limb === 2) return all(limbTo(V, 2, s), noExt(V) * 0.1 + (s > 1 ? 0.2 : 0));
    return below(V, rise);
  };
}
// legwear (socks, tights): the leg from s0 down over the foot (ext share allowed)
export function legCover(land, from, foot = true) {
  return (V) => {
    if (V.limb !== 2) return from <= 0 && V.limb === 0 ? below(V, land.waistY - 0.01) : -0.1;
    return foot ? (V.s - from) * 0.5 : all((V.s - from) * 0.5, noExt(V) * 0.1);
  };
}
export { all, any, below, above, neckline, limbTo, noHead, noExt, sstep, clamp };
