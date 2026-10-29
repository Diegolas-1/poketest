// Dresses, one-pieces and aprons, built with the kit in tops.js (and the jacket kit
// in outer.js for the coat dress).
//   dresses: a bodice (a body shell to the waist, or to under the bust) and a skirt
//            (a tube hung from the waist outside the legs and whatever is worn under
//            it): flared, pleated, tiered, ruffled or scalloped at the hem; children's
//            and teens' dresses carry their built-in shorts or leggings (catalogue rule).
//   one-pieces: overalls (a bib and braces over a top, trouser legs), jumpsuits and
//            coveralls, the toddler's romper, the hooded sleepsuit, the surf suit.
//   aprons:  panels hung over everything (front sectors of a tube), a waistband with
//            a bow at the back, a bib held up by neck straps.
import { TAU, sstep, clamp, lerp, shell } from '../wear.js';
import { P, smin, union } from '../sdf.js';
import { FIT } from './basics.js';
import { LEG, SLEEVE, neckOf, skirtHem, bottomCover } from './common.js';
import {
  f4Helper as f, hasHelper as has, stackHelper, rememberHelper, topHelper, wordsHelper, finishHelper, edgesHelper, overlayHelper, bandsHelper,
  tubeHelper, collarPiecesHelper, collarHelper, pocketsHelper, pocketPaintHelper, buttonsHelper, buttonRowHelper, zipHelper, ribHelper, stitchHHelper,
  stitchVHelper, hoodPiecesHelper, solidHelper, surfaceHelper, sashHelper, frillHelper, bowTree, sailorHelper, shirtHelper, wrapTopHelper,
  placketHelper, cuffsHelper, analyseHelper,
} from './tops.js';
import { jacketHelper, lapelsHelper, closureHelper, beltHelper } from './outer.js';

const TRUNK = 'step(vG.z, 0.5)', SKIRT = 'step(5.5, vG.z)', FRONT = 'step(0.0, vCanon.z)';
const BRASS = 'vec3(0.86, 0.7, 0.32)', PEARL = 'vec3(0.97, 0.95, 0.92)', WHITE = 'vec3(0.96, 0.95, 0.94)';
const FLARE = { a_line: 0.075, full: 0.12, flared: 0.095, fitted: 0.02, tight: 0.012, straight: 0.03, loose: 0.06, relaxed: 0.05, regular: 0.045, oversized: 0.07 };

// the hem of a dress / skirt from the item's length word
export function dressHemHelper(ctx, length) {
  const land = ctx.land;
  if (length === 'floor') return land.ankleY + 0.02;
  if (length === 'thigh') return land.crotchY - 0.04;
  if (length === 'hip') return land.hipJ - 0.02;
  return Math.max(land.ankleY + 0.03, skirtHem(land, length || 'knee'));
}
// a skirt tube from the waist (or under the bust), wrapping the bodice and what is worn under it
export function skirtHelper(ctx, it, top, hem, o = {}) {
  const p = it.params, d = p.details || [], hk = o.hemKind ?? p.hem;
  const pleats = o.pleats ?? (hk === 'pleated' || d.includes('pleats_knife') ? 28 : d.includes('pleats_box') ? 16 : 0);
  const long = (top - hem) > 0.45;
  const tb = tubeHelper(ctx, {
    top, hem, off: o.off ?? it.off + 0.004, flare: o.flare ?? FLARE[p.fit] ?? 0.05, follow: o.follow ?? (long ? 0.95 : 0.7), split: long ? 4 : 2.5, back: 0.012,
    pleats, pleatDepth: o.pleatDepth ?? (pleats > 20 ? 0.0045 : 0.007), wrap: o.wrap ?? stackHelper(ctx).slice(), layer: it.layer, rim: 0.004,
    ruffle: hk === 'ruffle' ? { amp: 0.012, n: 28, band: 0.22 } : o.ruffle, scallop: hk === 'scalloped' || o.scallop ? { n: 18, depth: 0.014 } : null,
    tiers: hk === 'tiered' ? { n: 3, step: 0.012 } : null, sector: o.sector, topBone: o.topBone, segments: o.segments, flarePow: o.flarePow,
  });
  if (tb) rememberHelper(ctx, tb);
  let paint = '';
  if (pleats) paint += `col = mix(col, col * 0.86, aa(abs(fract(vG.x / ${f(TAU * 0.15 / pleats)} + 0.5) - 0.5) * ${f(TAU * 0.15 / pleats)} - 0.0008) * smoothstep(${f(top - 0.03)}, ${f(top - 0.08)}, vCanon.y));`;
  if (hk === 'lace_trim') paint += `{ float y = vCanon.y - ${f(hem)}; col = mix(col, uTrim, step(y, 0.025)); col = mix(col, col * 0.8, dotsHex(vec2(vG.x, y), 0.008, 0.0018) * step(y, 0.022)); }`;
  if (hk === 'ruffle') paint += `col = mix(col, col * 0.85, stripes(vG.x, 0.016, 0.004) * step(vCanon.y, ${f(hem + (top - hem) * 0.22)}));`;
  if (hk === 'tiered') paint += `col = mix(col, col * 0.7, line(fract((${f(top)} - vCanon.y) / ${f((top - hem) / 3)}), 0.0, 0.03));`;
  return { piece: tb, paint };
}
// built-in shorts (or leggings to the ankle) under a skirt, in a darker shade
export function underHelper(ctx, it, o = {}) {
  const p = it.params, out = [], land = ctx.land;
  const leggings = has(p, 'under_leggings'), shorts = has(p, 'built_in_shorts');
  if (!leggings && !shorts && !o.force) return out;
  const pc = shell(ctx, { cover: bottomCover(land, { leg: leggings ? 0.97 : 0.14 }), off: Math.max(0.003, it.off * 0.45), rim: 0.002, fill: 2 });
  if (pc) { rememberHelper(ctx, pc); out.push({ piece: pc, glsl: leggings ? 'vec3 col = uSecond * 0.85; return col;' : 'vec3 col = mix(uMain, vec3(0.1, 0.1, 0.12), 0.45); return col;', noPattern: true }); }
  return out;
}
// a dress: a bodice and a skirt. o: { waist (canonical y where the skirt hangs from), hem, bodice (topHelper options),
// skirt (skirtHelper options), patternSkirtOnly, collar, words (wordsHelper options) }
export function dressHelper(ctx, it, o = {}) {
  const land = ctx.land, p = { ...it.params, ...(o.params || {}) };
  const waist = o.waist ?? land.waistY + 0.005, hem = o.hem ?? dressHemHelper(ctx, p.length);
  const r = topHelper(ctx, it, { hem: waist - 0.03, hang: o.hang ?? 0.15, ease: o.ease ?? 0.002, ...(o.bodice || {}) });
  if (!r.b.piece) return r;
  wordsHelper(ctx, it, r, { hemKind: 'plain', pockets: 'none', ...(o.words || {}) });
  it.hemY = hem; it.topY = land.shY + 0.03;
  const sk = skirtHelper(ctx, it, waist, hem, o.skirt || {});
  if (sk.piece) { r.pieces.push({ piece: sk.piece, extra: sk.paint + (o.skirtPaint || ''), noPattern: o.patternBodiceOnly, _skirt: true }); r.skirt = sk.piece; }
  if (o.patternSkirtOnly) for (const pc of r.pieces) if (!pc._skirt && !pc.glsl) pc.noPattern = true;
  r.waist = waist; r.hemT = hem;
  r.pieces.push(...underHelper(ctx, it));
  return r;
}
const skirtPc = (r) => r.pieces.find((x) => x._skirt);
// patch pockets on the skirt at hip height
function skirtPockets(ctx, r, y, o = {}) {
  if (!r.skirt) return;
  const boxes = [[0.1, y, o.hx ?? 0.042, o.hy ?? 0.045, 0.012], [-0.1, y, o.hx ?? 0.042, o.hy ?? 0.045, 0.012]];
  const pc = pocketsHelper(ctx, { piece: r.skirt }, boxes, { d: 0.0025 });
  if (pc) r.pieces.push({ piece: pc, extra: (o.color ? `col = ${o.color};` : '') + boxes.map(([x, yy, hx, hy, rd]) => pocketPaintHelper(x, yy, hx, hy, rd)).join('') + (o.paint || '') });
}
// a front button placket painted down the skirt
const skirtButtons = (r, x0, y0, y1, n, btn = 'uTrim') => { const pc = skirtPc(r); if (pc) pc.extra += `col = mix(col, col * 0.65, line(vCanon.x, ${f(x0 + 0.012)}, 0.0014) * step(0.0, vCanon.z));` + buttonsHelper(buttonRowHelper(x0, y0, y1, n), 0.0062, btn, { where: SKIRT }); };
// a waist seam band
function waistBand(ctx, it, r, o = {}) { if (r.waist) sashHelper(ctx, it, r, r.waist - 0.012, o.h ?? 0.012, { color: o.color || 'uMain * 0.94', d: 0.0025, bow: o.bow, back: o.back, bowSize: o.bowSize }); }

// ---------- dresses ----------
// the heroine silhouette: a top tucked into a very high-waisted pleated skirt (second colour) with its waistband under the bust
export function dress_top_skirt_set(ctx, it) {
  const land = ctx.land, under = land.chestY - 0.02;
  const r = dressHelper(ctx, it, { waist: under, bodice: { hang: 0.1 }, skirt: { pleats: 26, flare: 0.07 } });
  if (!r.b.piece) return [];
  const sec = { main: it.colors.second || '#2b3554', second: it.colors.main };
  const sp = skirtPc(r); if (sp) { sp.colors = sec; sp.noPattern = true; }
  const band = overlayHelper(ctx, { ...r.b.piece, mesh: r.skirt.mesh }, (V) => V.cy - (under - 0.045), { d: 0.0025 });
  if (band) r.pieces.push({ piece: band, glsl: `vec3 col = uMain * 0.92; ${stitchHHelper(under - 0.04, '1.0', 'col * 0.7')} return col;`, colors: sec, noPattern: true });
  return finishHelper(r);
}
// a party dress: puff sleeves, a full skirt (polka dots on the skirt only) with lace and a ruffle, a bow at the waist
export function party_dress(ctx, it) {
  const land = ctx.land, p = it.params;
  const r = dressHelper(ctx, it, { patternSkirtOnly: true, skirt: { flare: 0.12, ruffle: has(p, 'ruffle_trim') ? { amp: 0.008, n: 30, band: 0.2 } : null, scallop: has(p, 'scallop_edge') } });
  if (!r.b.piece) return [];
  waistBand(ctx, it, r, { color: 'uSecond', bow: has(p, 'bow'), bowSize: 0.24 });
  return finishHelper(r);
}
// a coat dress: double-breasted, A-line to the knee, peter pan collar, belt, scalloped hem
export function coat_dress(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { breakY: land.chestY + 0.02, neckGap: 0.05, flare: 0.08, hang: 1, scallop: p.hem === 'scalloped' ? { n: 16, depth: 0.014 } : null });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'peter_pan', { color: 'uSecond' });
  closureHelper(ctx, it, r, 'double', { n: 3, button: has(p, 'buttons_contrast') ? 'uAccent' : 'uTrim' });
  if (has(p, 'belt')) beltHelper(ctx, it, r, { color: 'uSecond', buckle: 'uAccent' });
  wordsHelper(ctx, it, r, { neckBand: false, collar: 'none', hemKind: 'plain', pockets: 'none' });
  r.pieces.push(...underHelper(ctx, it));
  return finishHelper(r);
}
// the overalls / pinafore cover: everything below the waist, a square bib in front, a lower panel at the back,
// braces over the shoulders (crossing at the back); legs to s (or none: a skirt goes on instead)
export function bibCoverHelper(land, o = {}) {
  const top = o.bibTop ?? land.chestY + 0.04, w = o.bibW ?? 0.085, backTop = o.backTop ?? land.waistY + 0.05, sx = o.strapX ?? 0.07, sw = o.strapW ?? 0.016;
  return (V) => {
    if (V.limb === 3 || V.limb === 1) return -0.1;
    const arm = (0.3 - V.arm) * 0.2;
    if (V.limb === 2) return o.legs ? Math.min((o.legs - V.s) * 0.5, 0.4 - V.ext) : Math.min(0.05, V.cy - (land.crotchY - 0.02));
    const low = (land.waistY + 0.01) - V.cy;
    const x = Math.abs(V.cx);
    const bib = V.cz > 0 ? Math.min(w - x, top - V.cy) : -1;
    const back = V.cz <= 0 ? Math.min(w + 0.02 - x, backTop - V.cy) : -1;
    const xb = lerp(sx, 0.025, clamp((land.shY + 0.05 - V.cy) / (land.shY + 0.05 - backTop)));
    const strap = V.cz > 0 ? (V.cy > top - 0.02 ? sw - Math.abs(x - sx) : -1) : (V.cy > backTop - 0.02 ? sw - Math.abs(x - xb) : -1);
    return Math.min(Math.max(low, bib, back, Math.min(strap, (0.36 - V.arm) * 0.2)), arm + 0.1, 0.4 - V.head);
  };
}
// a pinafore dress over a tee: square bib with a big pocket, braces with brass buttons, an A-line skirt, built-in shorts
export function pinafore(ctx, it) {
  const land = ctx.land, p = it.params, top = land.chestY + 0.035;
  const over = it.has('top');
  const it2 = { ...it, off: over ? it.off + 0.006 : it.off };
  const piece = shell(ctx, { cover: bibCoverHelper(land, { bibTop: top, bibW: 0.08 }), off: it2.off + 0.002, fill: 2, rim: 0.0035, hideMargin: 0.02 });
  if (!piece) return [];
  rememberHelper(ctx, piece);
  const hem = dressHemHelper(ctx, p.length);
  it.hemY = hem; it.topY = top;
  const r = { pieces: [{ piece, extra: '', _main: true }], extra: [], b: { piece, A: analyseHelper(piece.mesh, { e: () => 1 }) }, p };
  r.extra.push(`col = mix(col, col * 0.7, line(abs(vCanon.x), 0.08, 0.0014) * step(${f(land.waistY)}, vCanon.y) * ${FRONT} * ${TRUNK});`);
  r.extra.push(stitchHHelper(top - 0.006, `${FRONT} * ${TRUNK}`, 'uAccent'));
  const btn = has(p, 'buttons_brass') ? BRASS : 'uTrim';
  r.extra.push(buttonsHelper([[0.07, top - 0.012], [-0.07, top - 0.012]], 0.0075, btn));
  const sk = skirtHelper(ctx, it2, land.waistY + 0.02, hem, { flare: FLARE[p.fit] ?? 0.07 });
  if (sk.piece) { r.pieces.push({ piece: sk.piece, extra: sk.paint, _skirt: true }); r.skirt = sk.piece; }
  if (p.pockets === 'apron_front') {
    const bx = [[0, top - 0.06, 0.05, 0.035, 0.008]], pk = pocketsHelper(ctx, { piece }, bx);
    if (pk) r.pieces.push({ piece: pk, extra: pocketPaintHelper(0, top - 0.06, 0.05, 0.035, 0.008, 'uAccent') });
  }
  r.pieces.push(...underHelper(ctx, it));
  return finishHelper(r);
}
// a sundress: square neck, cap sleeves, A-line to the knee with a ruffled hem, a tie at the waist with a bow behind
export function sundress(ctx, it) {
  const p = it.params, r = dressHelper(ctx, it);
  if (!r.b.piece) return [];
  if (has(p, 'tie_waist')) waistBand(ctx, it, r, { color: 'uAccent', bow: true, back: true, bowSize: 0.24 });
  return finishHelper(r);
}
// a shirt dress: a shirt to the waist, a straight skirt to the knee with the button placket running on, a belt
export function shirt_dress(ctx, it) {
  const land = ctx.land, p = it.params, hem = dressHemHelper(ctx, p.length), waist = land.waistY + 0.005;
  const r = shirtHelper(ctx, it, { hem: waist - 0.03, hang: 0.3, button: 'uTrim' });
  if (!r.b) return [];
  const sk = skirtHelper(ctx, it, waist, hem, { flare: 0.035 });
  if (sk.piece) { r.pieces.push({ piece: sk.piece, extra: sk.paint, _skirt: true }); r.skirt = sk.piece; r.waist = waist; }
  skirtButtons(r, 0, waist - 0.04, hem + 0.06, 3);
  if (has(p, 'belt')) beltHelper(ctx, it, r, { y: waist - 0.006, color: 'uMain * 0.85', buckle: 'uTrim' });
  it.hemY = hem;
  r.pieces.push(...underHelper(ctx, it));
  return finishHelper(r);
}
// a toddler's smock dress: a yoke, a gathered skirt from the chest with smocking, a round collar, a creature-face pocket
export function smock_dress(ctx, it) {
  const land = ctx.land, p = it.params, yoke = land.chestY + 0.02;
  const r = dressHelper(ctx, it, { waist: yoke, bodice: { hang: 0.2 }, skirt: { flare: 0.09, topBone: 'Spine2' }, words: { collar: 'none', neckBand: false } });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'round_flat', { color: 'uSecond' });
  const sp = skirtPc(r);
  if (sp && has(p, 'smocking')) sp.extra += `{ float y = ${f(yoke)} - vCanon.y; float zz = abs(fract(vG.x / 0.012) - 0.5) * 0.008; col = mix(col, uAccent, (line(y - zz, 0.012, 0.0018) + line(y - zz, 0.024, 0.0018) + line(y - zz, 0.036, 0.0018)) * step(y, 0.045)); col = mix(col, col * 0.85, stripes(vG.x, 0.012, 0.004) * smoothstep(0.03, 0.06, y)); }`;
  if (r.skirt && p.pockets === 'patch_hip') {
    const y = lerp(yoke, r.hemT, 0.62), bx = [[0.085, y, 0.032, 0.03, 0.025]];
    const pc = pocketsHelper(ctx, { piece: r.skirt }, bx, { d: 0.0025 });
    // the pocket is a creature's face: round, two ears, two eyes, a smile
    if (pc) r.pieces.push({ piece: pc, extra: `{ vec2 q = vCanon.xy - vec2(0.085, ${f(y)}); col = uAccent; col = mix(col, vec3(0.13), circle(q, vec2(-0.011, 0.004), 0.0035) + circle(q, vec2(0.011, 0.004), 0.0035)); col = mix(col, vec3(0.13), ring(q, vec2(0.0, -0.002), 0.008, 0.0015) * step(q.y, -0.004)); col = mix(col, uSecond, circle(q, vec2(-0.017, -0.006), 0.004) + circle(q, vec2(0.017, -0.006), 0.004)); }` });
    const ears = pocketsHelper(ctx, { piece: r.skirt }, [[0.085 - 0.022, y + 0.03, 0.009, 0.01, 0.008], [0.085 + 0.022, y + 0.03, 0.009, 0.01, 0.008]], { d: 0.0025 });
    if (ears) r.pieces.push({ piece: ears, extra: 'col = uAccent;' });
  }
  return finishHelper(r);
}
// a sailor dress: the sailor collar and bow on the bodice, a pleated skirt, built-in shorts
export function sailor_dress(ctx, it) {
  const p = it.params, r = dressHelper(ctx, it, { params: { neckline: 'sailor' }, words: { neckBand: false, collar: 'none' }, skirt: { pleats: 24 } });
  if (!r.b.piece) return [];
  sailorHelper(ctx, it, r);
  return finishHelper(r);
}
// a maid's dress: fitted bodice, a flared skirt below the knee, puff sleeves, a white round collar and cuffs
export function maid_dress(ctx, it) {
  const p = it.params, r = dressHelper(ctx, it, { words: { collar: 'none', neckBand: false, cuffs: 'none' }, skirt: { flare: 0.1 } });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'round_flat', { color: 'uSecond' });
  r.pieces.push(...cuffsHelper(ctx, r.b, 'contrast_band', { color: 'uSecond' }));
  r.extra.push(buttonsHelper(buttonRowHelper(0, ctx.land.shY - 0.03, r.waist + 0.01, 4), 0.005, 'uSecond'));
  return finishHelper(r);
}
// a nurse's dress: A-line below the knee, a round collar, piping, contrast cuffs, hip pockets, the heart-in-leaf emblem
export function nurse_dress(ctx, it) {
  const land = ctx.land, p = it.params, r = dressHelper(ctx, it, { words: { collar: 'none', neckBand: false, cuffs: 'none' } });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'round_flat', { color: 'uSecond', collarPaint: has(p, 'piping') ? 'col = mix(col, uAccent, step(0.5, vG.w));' : '' });
  r.pieces.push(...cuffsHelper(ctx, r.b, 'contrast_band', { color: 'uSecond' }));
  r.extra.push(buttonsHelper(buttonRowHelper(0, land.shY - 0.04, r.waist + 0.01, 4), 0.0048, 'uSecond'));
  if (has(p, 'cross_emblem')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(0.075, ${f(land.chestY + 0.03)}); float fr = ${FRONT} * ${TRUNK};
    col = mix(col, uSecond, circle(q, vec2(0.0), 0.018) * fr); col = mix(col, uAccent, heart(q, vec2(0.0, -0.004), 0.012) * fr);
    vec2 l = q - vec2(0.006, 0.01); l = mat2(0.8, 0.6, -0.6, 0.8) * l; col = mix(col, vec3(0.3, 0.6, 0.35), aa(length(l / vec2(0.008, 0.004)) - 1.0) * fr); }`);
  if (p.pockets === 'patch_hip') skirtPockets(ctx, r, r.waist - 0.09, { paint: has(p, 'piping') ? '' : '' });
  return finishHelper(r);
}
// a festival robe (furisode-inspired): the wrap front, wide sleeves, straight to the ankle, an obi with a bow behind
export function festival_robe(ctx, it) {
  const land = ctx.land, p = it.params, hem = dressHemHelper(ctx, p.length);
  const r = wrapTopHelper(ctx, it, { hem: land.hipJ - 0.005, band: 0.026, bandColor: 'uSecond', hang: 0.5, ease: 0.004, bell: 0.06 });
  if (!r.b) return [];
  it.hemY = hem;
  const sk = skirtHelper(ctx, it, land.hipJ + 0.03, hem, { flare: 0.035 });
  if (sk.piece) r.pieces.push({ piece: sk.piece, extra: `col = mix(col, col * 0.6, line(vCanon.x, -0.1, 0.0018) * step(0.0, vCanon.z));` });
  if (has(p, 'obi_band')) sashHelper(ctx, it, r, land.waistY + 0.0, 0.045, { color: 'uAccent', d: 0.005, bow: true, back: true, bowSize: 0.42, paint: `col = mix(col, uTrim, line(vCanon.y, ${f(land.waistY)}, 0.005));` });
  return finishHelper(r);
}
// a gala gown: fitted, a boat neck, cap sleeves, a flared skirt to the floor (stars on it), pearls at the neckline
export function gown(ctx, it) {
  const land = ctx.land, p = it.params, r = dressHelper(ctx, it, { patternSkirtOnly: true, skirt: { flare: 0.14, flarePow: 1.6 }, words: { neckBand: false } });
  if (!r.b.piece) return [];
  if (has(p, 'pearls')) { const pc = bandsHelper(ctx, r.b, { neck: 0.012 }, { d: 0.0025 }); if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = uMain * 0.9; col = mix(col, ${PEARL}, aa(length(vec2(fract(vG.x / 0.012 + 0.5) - 0.5, (vG.y - 0.5) * 0.9)) * 0.012 - 0.0045)); return col;`, noPattern: true }); }
  waistBand(ctx, it, r, { color: 'uMain * 0.85', h: 0.008 });
  return finishHelper(r);
}
// a nightgown: loose from a yoke, calf long, puff sleeves, a ruffled hem, piping, a bow at the neck
export function nightgown(ctx, it) {
  const land = ctx.land, p = it.params, yoke = land.chestY + 0.03;
  const r = dressHelper(ctx, it, { waist: yoke, bodice: { hang: 0.2 }, skirt: { flare: 0.09, topBone: 'Spine2' } });
  if (!r.b.piece) return [];
  r.extra.push(`col = mix(col, uSecond, line(vCanon.y, ${f(yoke - 0.03)}, 0.003) * ${TRUNK});`);
  if (has(p, 'bow')) {
    const at = surfaceHelper(r.b.piece.mesh, 0, land.shY - 0.01, 1);
    if (at) { const s = ctx.A.L.hw * 0.12, bp = solidHelper(ctx, bowTree([at.p[0], at.p[1], at.p[2] + s * 0.25], s, { tailLen: 1.2 }), { cell: Math.max(0.003, s * 0.05), verts: 4000 }); if (bp) r.pieces.push({ piece: bp, glsl: 'vec3 col = uSecond; return col;', noPattern: true }); }
  }
  return finishHelper(r);
}
// a skirted swimsuit: a fitted one-piece with cap sleeves and its shorts, a short ruffled swim skirt from the waist
export function swimsuit_skirted(ctx, it) {
  const land = ctx.land, p = it.params;
  const r = topHelper(ctx, it, { legs: 0.12, hang: 0, ease: 0 });
  if (!r.b.piece) return [];
  wordsHelper(ctx, it, r, { hemKind: 'plain', pockets: 'none' });
  const sk = skirtHelper(ctx, it, land.waistY - 0.01, dressHemHelper(ctx, 'thigh'), { flare: 0.06, ruffle: { amp: 0.008, n: 26, band: 0.4 }, hemKind: 'plain' });
  if (sk.piece) r.pieces.push({ piece: sk.piece, extra: sk.paint });
  it.hemY = land.crotchY - 0.04;
  return finishHelper(r);
}

// ---------- one-pieces ----------
// overalls / shortalls: the bib and braces over the top, trouser (or short) legs with turn-ups, a bib pocket, buckles
export function overalls(ctx, it) {
  const land = ctx.land, p = it.params, legS = (LEG[p.length] ?? 0.97) - (p.hem === 'turn_up' ? 0.0 : 0), top = land.chestY + 0.035;
  const over = it.has('top') ? 0.008 : 0.002, [ease] = FIT[p.fit] || FIT.regular;
  const piece = shell(ctx, {
    cover: bibCoverHelper(land, { bibTop: top, legs: legS, bibW: 0.075 }),
    // over a top the bib and waist stand off further; the legs ease out towards the hems
    off: (V) => it.off + ease + (V.limb === 2 ? 0.004 * sstep(0.1, 0.6, V.s) : over * sstep(land.crotchY - 0.04, land.waistY - 0.03, V.cy)),
    fill: 3, rim: 0.0035, flare: { leg: p.fit === 'relaxed' ? 0.012 : 0.006, from: 0.2 },
  });
  if (!piece) return [];
  rememberHelper(ctx, piece);
  it.hemY = land.hipJ - legS * (land.hipJ - land.ankleY); it.topY = top;
  const A = analyseHelper(piece.mesh, { leg: (V) => (V.limb === 2 ? (legS - V.s) * 0.5 : 1), other: (V) => (V.limb === 2 ? 1 : 0) });
  const r = { pieces: [{ piece, extra: '', _main: true }], extra: [], b: { piece, A }, p };
  const st = has(p, 'stitch_contrast') ? 'vec3(0.86, 0.62, 0.25)' : 'col * 0.7';
  r.extra.push(stitchHHelper(top - 0.006, `${FRONT} * ${TRUNK}`, st));
  r.extra.push(`col = mix(col, ${st}, dashes(vPart.y, vG.x, 0.065, 0.0011, 0.008, 0.005) * step(2.5, vG.z) * step(vG.z, 4.5));`);
  // buckles where the braces meet the bib, buttons at the hips
  r.extra.push(`{ float fr = ${FRONT} * ${TRUNK}; for (int i = 0; i < 2; i++) { vec2 q = vCanon.xy - vec2(i == 0 ? 0.07 : -0.07, ${f(top + 0.012)}); col = mix(col, ${BRASS}, boxLine(q, vec2(0.0), vec2(0.014, 0.011), 0.003, 0.0035) * fr); col = mix(col, ${BRASS} * 0.8, box2(q, vec2(0.0, -0.002), vec2(0.0015, 0.008), 0.0005) * fr); } }`);
  r.extra.push(buttonsHelper([[0.07, top - 0.014], [-0.07, top - 0.014]], 0.006, BRASS));
  r.extra.push(`col = mix(col, ${BRASS}, (circle(vec2(abs(vCanon.x), vCanon.y), vec2(0.13, ${f(land.waistY - 0.01)}), 0.006)) * ${TRUNK});`);
  if (p.pockets === 'apron_front') {
    const bx = [[0, top - 0.055, 0.045, 0.035, 0.006]], pk = pocketsHelper(ctx, { piece }, bx);
    if (pk) r.pieces.push({ piece: pk, extra: pocketPaintHelper(0, top - 0.055, 0.045, 0.035, 0.006, st) + `col = mix(col, ${st}, line(vCanon.x, 0.0, 0.0012) * step(vCanon.y, ${f(top - 0.03)}));` });
  }
  if (p.hem === 'turn_up') {
    const cuf = overlayHelper(ctx, piece, (V, i) => (V.limb === 2 ? 0.04 - A.leg[i] : -1), { d: 0.004 });
    if (cuf) r.pieces.push({ piece: cuf, extra: `col = mix(col, uSecond, 0.5); col = mix(col, col * 0.7, line(vPart.y, ${f(legS - 0.03)}, 0.004));` });
  }
  return finishHelper(r);
}
// coveralls and jumpsuits: one shell with sleeves and legs, a point collar, a zip from the crotch to the neck,
// pockets, a belt, kneepads and reflective tape from the details
export function coverall(ctx, it, o = {}) {
  const land = ctx.land, p = it.params, legS = LEG[p.length] ?? 0.97;
  const r = topHelper(ctx, it, { legs: legS, hang: 0.35, ease: (FIT[p.fit] || FIT.regular)[0], ...o });
  if (!r.b.piece) return [];
  it.hemY = land.crotchY - 0.02; it.topY = land.shY + 0.03;
  collarPiecesHelper(ctx, it, r, p.collar === 'none' ? 'stand' : p.collar || 'point', {});
  r.extra.push(zipHelper(0, land.crotchY + 0.02, land.shY + 0.03, { tape: 'col * 0.85' }));
  if (has(p, 'contrast_yoke')) r.extra.push(`col = mix(col, uSecond, step(${f(land.chestY + 0.06)}, vCanon.y) * ${TRUNK}); col = mix(col, col * 0.7, line(vCanon.y, ${f(land.chestY + 0.06)}, 0.0016) * ${TRUNK});`);
  if (has(p, 'name_badge')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(-0.075, ${f(land.chestY + 0.075)}); float fr = ${FRONT} * ${TRUNK}; col = mix(col, uTrim, box2(q, vec2(0.0), vec2(0.025, 0.009), 0.002) * fr); col = mix(col, uMain, box2(q, vec2(0.0), vec2(0.018, 0.0015), 0.001) * fr); }`);
  if (has(p, 'reflective_tape')) r.extra.push(`col = mix(col, vec3(0.9), band(vPart.y, 0.72, 0.77) * step(2.5, vG.z) * step(vG.z, 4.5));`);
  wordsHelper(ctx, it, r, { neckBand: false, collar: 'none', hemKind: 'plain', pockets: p.pockets });
  if (p.hem === 'turn_up') { const cuf = overlayHelper(ctx, r.b.piece, (V, i) => (V.limb === 2 ? 0.035 - r.b.A.leg[i] : -1), { d: 0.004 }); if (cuf) r.pieces.push({ piece: cuf, extra: `col = col * 0.9;` }); }
  if (has(p, 'belt')) beltHelper(ctx, it, r, { color: 'uSecond', buckle: 'uTrim' });
  return finishHelper(r);
}
export const jumpsuit = (ctx, it) => coverall(ctx, it, { hang: 0.4 });
// a toddler's romper: short sleeves and short legs, a round collar, snaps, hip pockets, an animal appliqué
export function romper(ctx, it) {
  const land = ctx.land, p = it.params, r = topHelper(ctx, it, { legs: LEG[p.length] ?? 0.18, hang: 0.5, ease: 0.004 });
  if (!r.b.piece) return [];
  it.hemY = land.crotchY - 0.02;
  collarPiecesHelper(ctx, it, r, 'round_flat', { color: 'uSecond' });
  r.extra.push(buttonsHelper(buttonRowHelper(0, land.shY - 0.03, land.chestY - 0.03, 3), 0.005, 'uSecond'));
  if (has(p, 'applique_animal')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(0.0, ${f(land.waistY + 0.02)}); float fr = ${FRONT} * ${TRUNK};
    col = mix(col, uAccent, (circle(q, vec2(0.0), 0.026) + circle(q, vec2(-0.02, 0.022), 0.01) + circle(q, vec2(0.02, 0.022), 0.01)) * fr);
    col = mix(col, vec3(0.13), (circle(q, vec2(-0.009, 0.004), 0.0035) + circle(q, vec2(0.009, 0.004), 0.0035)) * fr); col = mix(col, uSecond, circle(q, vec2(0.0, -0.008), 0.006) * fr); }`);
  wordsHelper(ctx, it, r, { neckBand: false, collar: 'none', hemKind: 'plain', pockets: 'none' });
  if (p.hem === 'turn_up') { const cuf = overlayHelper(ctx, r.b.piece, (V, i) => (V.limb === 2 ? 0.025 - r.b.A.leg[i] : -1), { d: 0.0035 }); if (cuf) r.pieces.push({ piece: cuf, glsl: 'vec3 col = uSecond; return col;', noPattern: true }); }
  return finishHelper(r);
}
// a hooded sleepsuit: long sleeves and legs, rib cuffs, a zip, a front pouch, the hood with ears, a little tail
export function sleepsuit(ctx, it) {
  const land = ctx.land, p = it.params, r = topHelper(ctx, it, { legs: LEG[p.length] ?? 0.97, hang: 0.5, ease: 0.006, params: { neckline: 'crew' } });
  if (!r.b.piece) return [];
  it.hemY = land.crotchY - 0.02;
  hoodPiecesHelper(ctx, it, r, { frontOpen: true, gap: 0.05 });
  r.extra.push(zipHelper(0, land.crotchY + 0.03, land.shY + 0.03, { tape: 'col * 0.85' }));
  wordsHelper(ctx, it, r, { neckBand: false, collar: 'none', hemKind: 'plain', pockets: p.pockets === 'apron_front' ? 'kangaroo' : p.pockets });
  { const cuf = overlayHelper(ctx, r.b.piece, (V, i) => (V.limb === 2 ? 0.035 - r.b.A.leg[i] : -1), { d: 0.002 }); if (cuf) r.pieces.push({ piece: cuf, glsl: `vec3 col = uMain; ${ribHelper('1.0', 0.84, 0.006)} return col;`, noPattern: true }); }
  // the tail
  const at = surfaceHelper(r.b.piece.mesh, 0, land.hipJ + 0.02, -1);
  if (at) {
    const k = ctx.A.L.hw * 0.9, c = at.p;
    const t = smin(k * 0.06, P.rcone({ a: [c[0], c[1], c[2] - k * 0.02], b: [c[0], c[1] + k * 0.12, c[2] - k * 0.22], ra: k * 0.07, rb: k * 0.09 }), P.sphere({ c: [c[0], c[1] + k * 0.16, c[2] - k * 0.26], r: k * 0.1 }));
    const tp = solidHelper(ctx, t, { cell: Math.max(0.003, k * 0.018), verts: 3000 });
    if (tp) r.pieces.push({ piece: tp, glsl: `vec3 col = uMain; return col;`, noPattern: true });
  }
  return finishHelper(r);
}
// a surf suit: fitted, short sleeves, legs to above the knee, a mock collar with a zip, contrast yoke and chest stripe
export function surf_suit(ctx, it) {
  const land = ctx.land, p = it.params, r = topHelper(ctx, it, { legs: LEG[p.length] ?? 0.4, hang: 0, ease: 0, params: { neckline: 'crew' } });
  if (!r.b.piece) return [];
  it.hemY = land.crotchY - 0.02;
  collarPiecesHelper(ctx, it, r, 'mock', { collarPaint: zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col' }) });
  r.extra.push(zipHelper(0, land.waistY, land.shY + 0.03, { tape: 'col * 0.85' }));
  if (has(p, 'contrast_yoke')) r.extra.push(`col = mix(col, uSecond, (step(${f(land.chestY + 0.04)}, vCanon.y) * ${TRUNK} + step(0.5, vG.z) * step(vG.z, 2.5)));`);
  if (has(p, 'chest_stripe')) r.extra.push(`col = mix(col, uAccent, band(vCanon.y, ${f(land.chestY + 0.015)}, ${f(land.chestY + 0.035)}) * ${TRUNK});`);
  r.extra.push(`col = mix(col, uSecond, line(abs(vG.x), 0.21, 0.004) * step(vG.z, 0.5) * step(${f(land.crotchY + 0.06)}, vCanon.y));`);
  wordsHelper(ctx, it, r, { neckBand: false, collar: 'none', hemKind: 'plain', pockets: 'none' });
  return finishHelper(r);
}

// ---------- aprons ----------
// o: { bib, ruffle, length, pockets }
export function apronHelper(ctx, it, o = {}) {
  const land = ctx.land, p = it.params, pieces = [], wrap = stackHelper(ctx).slice();
  const waist = land.waistY + 0.01, hem = dressHemHelper(ctx, p.length || 'knee'), off = it.off + 0.004;
  it.hemY = hem; it.topY = o.bib ? land.chestY + 0.07 : waist;
  // the skirt panel: a front sector of a tube over everything
  const half = o.half ?? 1.15;
  const panel = tubeHelper(ctx, { top: waist, hem, off, flare: 0.035, follow: 0.4, back: 0, wrap, sector: [-half, half], layer: it.layer, rim: 0.003, segments: 50, ruffle: o.ruffle ? { amp: 0.006, n: 40, band: 0.12 } : null, scallop: o.ruffle ? { n: 22, depth: 0.008 } : null });
  if (panel) { rememberHelper(ctx, panel); pieces.push({ piece: panel, extra: o.ruffle ? `col = mix(col, uSecond, step(vCanon.y, ${f(hem + 0.03)})); col = mix(col, col * 0.85, stripes(vG.x, 0.012, 0.003) * step(vCanon.y, ${f(hem + 0.03)}));` : '' }); }
  // the waistband: a short full ring, with the bow behind
  const band = tubeHelper(ctx, { top: waist + 0.014, hem: waist - 0.014, off: off + 0.002, flare: 0, follow: 0, back: 0, wrap, layer: it.layer, rim: 0.003, segments: 64, step: 0.007 });
  if (band) pieces.push({ piece: band, glsl: `vec3 col = ${o.bandColor || 'uMain * 0.9'}; ${stitchHHelper(waist + 0.008, '1.0', 'col * 0.7')} ${stitchHHelper(waist - 0.008, '1.0', 'col * 0.7')} return col;`, noPattern: true });
  if (band) {
    // the bow at the back, on the band
    let bx = 0, by = -1, bz = 0;
    const m = band.mesh;
    for (let i = 0; i < m.pos.length / 3; i++) if (m.pos[3 * i + 2] < bz) { bz = m.pos[3 * i + 2]; bx = m.pos[3 * i]; by = m.pos[3 * i + 1]; }
    const s = ctx.A.L.hw * (o.bowSize ?? 0.26);
    const bp = solidHelper(ctx, bowTree([0, by, bz - s * 0.15], s, { back: true, tailLen: 1.6 }), { cell: Math.max(0.003, s * 0.05), verts: 4000 });
    if (bp) pieces.push({ piece: bp, glsl: `vec3 col = ${o.bandColor || 'uMain * 0.9'}; return col;`, noPattern: true });
  }
  // the bib and its neck straps
  if (o.bib) {
    const top = land.chestY + 0.07;
    const bib = tubeHelper(ctx, { top, hem: waist - 0.005, off, flare: 0, follow: 0, back: 0, wrap, sector: [-0.62, 0.62], layer: it.layer, rim: 0.003, segments: 30, topBone: 'Spine3', topW: 0.9, step: 0.008 });
    if (bib) pieces.push({ piece: bib, extra: o.bibPaint || '' });
    const sx = 0.075, sw = 0.012;
    const straps = shell(ctx, {
      cover: (V) => {
        if (V.limb !== 0 || V.head > 0.4) return -0.1;
        const x = Math.abs(V.cx);
        if (V.cz > 0) return Math.min(sw - Math.abs(x - lerp(sx, 0.06, clamp((V.cy - top) / 0.12))), V.cy - (top - 0.01));
        return Math.min(sw - Math.abs(V.cy - (land.shY + 0.055 - x * 0.2)) , 0.2 - x);
      },
      off: off + 0.004, fill: 2, rim: 0.003, hides: false,
    });
    if (straps) pieces.push({ piece: straps, glsl: `vec3 col = ${o.strapColor || 'uMain'}; return col;`, noPattern: true });
    if (o.ruffle && straps) {
      const sh = shell(ctx, { cover: (V) => (V.limb === 0 || V.limb === 1 ? Math.min(0.022 - Math.abs(Math.abs(V.cx) - 0.105), V.cy - (land.chestY + 0.02), V.cz + 0.05, 0.12 - V.cz) : -0.1), off: (V) => off + 0.006 + 0.006 * (0.6 + 0.4 * Math.sin(V.cy * 300)), fill: 1, rim: 0.003, hides: false });
      if (sh) pieces.push({ piece: sh, glsl: `vec3 col = uSecond; col = mix(col, col * 0.85, stripes(vCanon.y, 0.01, 0.003)); return col;`, noPattern: true });
    }
    // pockets / badges on the bib
    if (o.bibPocket && bib) { const bx = [[0, top - 0.06, 0.04, 0.03, 0.006]], pk = pocketsHelper(ctx, { piece: bib }, bx, { d: 0.0025 }); if (pk) pieces.push({ piece: pk, extra: pocketPaintHelper(0, top - 0.06, 0.04, 0.03, 0.006) + (has(p, 'pen_pocket') ? `col = mix(col, uAccent, box2(vCanon.xy, vec2(0.025, ${f(top - 0.035)}), vec2(0.0025, 0.012), 0.001));` : '') }); }
  }
  // pockets on the panel
  if (panel && p.pockets && p.pockets !== 'none') {
    const y = waist - 0.08, multi = p.pockets === 'utility_multi';
    const boxes = multi ? [[0.085, y, 0.04, 0.045, 0.004], [-0.085, y, 0.04, 0.045, 0.004], [0, y + 0.005, 0.03, 0.04, 0.004]] : [[0.075, y, 0.05, 0.045, 0.01], [-0.075, y, 0.05, 0.045, 0.01]];
    const pk = pocketsHelper(ctx, { piece: panel }, boxes, { d: 0.0025 });
    if (pk) pieces.push({ piece: pk, extra: (o.pocketColor ? `col = ${o.pocketColor};` : '') + boxes.map(([x, yy, hx, hy, rd]) => pocketPaintHelper(x, yy, hx, hy, rd)).join('') });
  }
  return pieces;
}
export const apron_long = (ctx, it) => edgesHelper(apronHelper(ctx, it, { pockets: true }));
export function apron_bib(ctx, it) {
  const p = it.params, badge = has(p, 'name_badge'), buckle = has(p, 'buckle');
  const bibPaint = (badge ? `{ vec2 q = vCanon.xy - vec2(-0.05, ${f(ctx.land.chestY + 0.03)}); col = mix(col, uTrim, box2(q, vec2(0.0), vec2(0.022, 0.009), 0.002)); col = mix(col, uSecond, box2(q, vec2(0.0), vec2(0.016, 0.0015), 0.001)); }` : '')
    + (buckle ? `col = mix(col, vec3(0.8), boxLine(vec2(abs(vCanon.x), vCanon.y), vec2(0.075, ${f(ctx.land.chestY + 0.065)}), vec2(0.012, 0.008), 0.002, 0.003));` : '');
  return edgesHelper(apronHelper(ctx, it, { bib: true, bibPocket: !has(p, 'name_badge'), bibPaint, strapColor: it.item.id === 'ap_shop' ? 'uSecond' : 'uMain' }));
}
export const apron_pinafore = (ctx, it) => edgesHelper(apronHelper(ctx, it, { bib: true, ruffle: has(it.params, 'ruffle_trim'), bowSize: 0.32 }));
