// Outer layers: jackets, coats, cardigans, vests, the poncho, the happi coat.
// Built with the kit in tops.js. An outer layer stands a little further off the
// body than what is under it and hangs from the chest (so a loose tee does not
// poke through); its front is open (a gap down the centre front, with lapels or
// a shawl collar beside it), open above a break (a V over a buttoned front) or
// closed (a zip, a button placket, a double-breasted overlap, toggles). Coats
// longer than the hips get a skirt: a tube hung outside the jacket body and
// whatever is worn under it, open at the front when the coat is open, with the
// tails of a tailcoat as a back sector only. Paint carries the rest: zips,
// buttons and buttonholes, stitching, quilting lines, reflective tape, badges.
import { TAU, jointPos, sstep, clamp, lerp } from '../wear.js';
import { P, union, smin } from '../sdf.js';
import { FIT } from './basics.js';
import { SLEEVE, neckOf } from './common.js';
import {
  f4Helper as f, hasHelper as has, stackHelper, rememberHelper, topHelper, wordsHelper, finishHelper, edgesHelper, overlayHelper, bandsHelper,
  tubeHelper, collarHelper, collarPiecesHelper, standShell, pocketsOfHelper, pocketsHelper, pocketPaintHelper, buttonsHelper, buttonRowHelper,
  zipHelper, ribHelper, stitchHHelper, stitchVHelper, hoodPiecesHelper, solidHelper, surfaceHelper, hemOfHelper, sashHelper, frillHelper,
  knitPaintHelper, cuffsHelper, hemShapeHelper,
} from './tops.js';

const TRUNK = 'step(vG.z, 0.5)', SKIRT = 'step(5.5, vG.z)', FRONT = 'step(0.0, vCanon.z)';
const BRASS = 'vec3(0.86, 0.7, 0.32)', WOOD = 'vec3(0.55, 0.38, 0.22)', PEARL = 'vec3(0.97, 0.95, 0.92)';
const buttonColor = (p, def = 'uTrim') => (has(p, 'buttons_brass') ? BRASS : has(p, 'buttons_wood') ? WOOD : has(p, 'buttons_pearl') ? PEARL : has(p, 'buttons_contrast') ? 'uAccent' : def);

// ---------- the jacket kit ----------
// o: { open (gap half width), breakY (V above, closed below unless open), neckGap, lapels: 'notched' | 'shawl',
//      collar (stand / band_rib / point / peter_pan / funnel / hood ...), closure ('zip' | 'buttons' | 'double' | 'none'),
//      hem (canonical), flare, scallop, quilt, elastic, sleeve, noSkirt, sector, shellHem }
export function jacketHelper(ctx, it, o = {}) {
  const land = ctx.land, p = { ...it.params, ...(o.params || {}) };
  // vests worn under a jacket (both are 'outer'): they sit a layer lower, between the top and the jacket
  if (o.under) { it.off -= 0.0045; it.layer -= 1; }
  const [ease0, hang0] = FIT[p.fit] || FIT.regular;
  const over = it.has('top') || it.has('dress') || it.has('onepiece');
  const ease = (o.ease ?? ease0) + 0.003, hang = Math.max(o.hang ?? hang0 * 0.85, over ? 0.75 : 0.45);
  const hemT = (o.hem ?? hemOfHelper(ctx, it)) - 0.012;
  const long = !o.noSkirt && hemT < land.crotchY + 0.06;
  const shellHem = long ? o.shellHem ?? land.hipJ - 0.005 : hemT;
  const gap = o.open ? (typeof o.open === 'number' ? o.open : 0.03) : 0;
  const yN = land.shY + 0.03, yB = o.breakY ?? null, gN = o.neckGap ?? 0.055;
  let openAt = null;
  if (gap > 0 || yB !== null) {
    const y0 = yB ?? land.chestY + 0.02;
    openAt = (cy) => (cy > y0 ? lerp(Math.max(gap, 0.004), gN, Math.pow(clamp((cy - y0) / (yN - y0)), 0.9)) : gap > 0 ? gap : -1);
  }
  const neck = o.neck || (openAt ? neckOf(land, 'crew') : neckOf(land, o.neckWord || (p.neckline === 'v' ? 'v' : 'crew')));
  const r = topHelper(ctx, it, { hem: shellHem, hemAt: o.hemAt, neck, openAt, ease, hang, quilt: o.quilt, elastic: o.elastic, sleeve: o.sleeve, params: o.params, puff: o.puff, bell: o.bell, off: o.off, yoke: o.yoke });
  if (!r.b.piece) return r;
  r.long = long; r.gap = gap; r.yB = yB; r.openAt = openAt; r.hemT = hemT; r.shellHem = shellHem;
  it.hemY = long ? hemT : shellHem;
  // the skirt of a long coat
  if (long) {
    const gA = gap > 0 ? Math.max(0.16, (gap + 0.01) / 0.15) : 0;
    const sector = o.sector || (gap > 0 ? [gA, TAU - gA] : null);
    const tb = tubeHelper(ctx, {
      // a skirt worn under it is not known here (garments from other files do not join the stack): over a bottom, flare more
      top: shellHem + 0.035, hem: hemT, off: it.off + ease + 0.002 + (it.has('bottom') ? 0.004 : 0), flare: (o.flare ?? 0.045) + (it.has('bottom') ? 0.03 : 0), follow: 0.9, split: 3.5, back: 0.012,
      wrap: stackHelper(ctx).slice(), sector, scallop: o.scallop, layer: it.layer, rim: 0.004, topW: 0.2,
    });
    if (tb) { rememberHelper(ctx, tb); r.pieces.push({ piece: tb, extra: '', _skirt: true }); r.skirt = tb; }
  }
  return r;
}
// the skirt's own paint (the trunk's goes in r.extra): pass GLSL snippets
const skirtPaint = (r, s) => { const pc = r.pieces.find((x) => x._skirt); if (pc) pc.extra += s; };

// lapels (notched or shawl) beside an open front, and the collar round the back of the neck
export function lapelsHelper(ctx, it, r, kind = 'notched', o = {}) {
  const b = r.b, A = b.A, land = ctx.land;
  if (!b.piece) return;
  const yB = r.yB ?? land.chestY, yN = land.shY + 0.03, wMax = o.w ?? 0.05, cw = o.collarW ?? 0.03;
  const yNotch = lerp(yB, yN, 0.78);
  const region = (V, i) => {
    if (V.limb !== 0) return -1;
    if (V.cz <= 0.015) return cw - A.neck[i];
    const t = clamp((V.cy - yB) / (yN - yB));
    if (V.cy < yB - 0.005) return -1;
    const w = wMax * sstep(0, 0.45, t) * (kind === 'shawl' ? 1 - 0.35 * sstep(0.7, 1, t) : 1);
    let lap = w - A.front[i];
    if (kind === 'notched') {
      // the notch: a small gap between the lapel's top and the collar
      if (V.cy > yNotch) lap = Math.min(lap, (yNotch + 0.004 - V.cy) * 2 + (A.front[i] < w * 0.45 ? 1 : 0));
      const col = Math.min(cw - A.neck[i], V.cy - (yNotch + 0.012));
      return Math.max(lap, col);
    }
    return Math.max(lap, cw - A.neck[i]);
  };
  const pc = overlayHelper(ctx, b.piece, region, { d: o.d ?? 0.0032 });
  if (pc) r.pieces.push({ piece: pc, extra: (o.color ? `col = ${o.color};` : '') + (o.piping ? `col = mix(col, ${o.piping}, step(0.5, vG.w));` : '') + (o.paint || ''), noPattern: !!o.color });
}
// the closure's paint on the trunk (and the skirt): zip / buttons (single, double) / snaps / velcro
export function closureHelper(ctx, it, r, kind, o = {}) {
  const land = ctx.land, p = r.p, top = o.top ?? land.shY + 0.03, hemT = r.long ? r.hemT : r.shellHem ?? r.hem;
  const btn = o.button || buttonColor(p);
  if (kind === 'zip') {
    const z = zipHelper(0, (r.shellHem ?? r.hem) + 0.002, top, { tape: o.tape ?? 'col * 0.85', teeth: o.teeth ?? 'uTrim', pull: has(p, 'zip_pulls') || has(p, 'tabs_pull') ? 'uAccent' : 'uTrim' });
    r.extra.push(z);
    skirtPaint(r, `col = mix(col, uTrim, zipper(vec2(vCanon.x, vCanon.y), 0.0, ${f(hemT)}, ${f(r.shellHem + 0.04)}, 0.0042) * step(0.0, vCanon.z));`);
    return;
  }
  if (kind === 'buttons' || kind === 'snaps') {
    const yTop = (r.yB ?? top - 0.03) - 0.005, n = o.n ?? Math.max(2, Math.round((yTop - (r.shellHem + 0.03)) / 0.08));
    if (r.gap > 0) {
      // open: buttons down the wearer's right edge, buttonholes on the left
      const x = r.gap + 0.016;
      const pts = buttonRowHelper(-x, yTop, r.shellHem + 0.035, n);
      r.extra.push(buttonsHelper(pts, kind === 'snaps' ? 0.005 : 0.0062, btn));
      r.extra.push(pts.map(([, y]) => `col = mix(col, col * 0.55, box2(vCanon.xy, vec2(${f(x)}, ${f(y)}), vec2(0.007, 0.0012), 0.001) * ${FRONT} * ${TRUNK});`).join('\n'));
    } else {
      r.extra.push(`col = mix(col, col * 0.62, line(vCanon.x, 0.014, 0.0014) * step(vCanon.y, ${f(yTop + 0.02)}) * ${FRONT} * ${TRUNK});`);
      r.extra.push(stitchVHelper(0.009, r.shellHem, yTop + 0.02, `${FRONT} * ${TRUNK}`, 'col * 0.7'));
      r.extra.push(buttonsHelper(buttonRowHelper(0, yTop - 0.01, r.shellHem + 0.035, n), kind === 'snaps' ? 0.005 : 0.0065, btn));
      if (r.long) skirtPaint(r, `col = mix(col, col * 0.62, line(vCanon.x, 0.014, 0.0014) * step(0.0, vCanon.z));` + buttonsHelper(buttonRowHelper(0, r.shellHem - 0.02, hemT + 0.08, Math.max(1, Math.round((r.shellHem - hemT) / 0.09))), 0.0065, btn, { where: SKIRT }));
    }
    return;
  }
  if (kind === 'double') {
    // the overlapping panel's edge at x = 0.07, two rows of buttons
    const yTop = (r.yB ?? land.chestY + 0.02) - 0.01, n = o.n ?? 3, x = 0.048;
    const edge = overlayHelper(ctx, r.b.piece, (V) => (V.cz > 0 && V.limb === 0 && V.cy < yTop + 0.03 ? Math.min(0.072 - V.cx, V.cx - 0.03) : -1), { d: 0.0026 });
    const pts = [...buttonRowHelper(x, yTop, Math.max(r.shellHem + 0.04, yTop - 0.09 * (n - 1)), n), ...buttonRowHelper(-x, yTop, Math.max(r.shellHem + 0.04, yTop - 0.09 * (n - 1)), n)];
    if (edge) r.pieces.push({ piece: edge, extra: buttonsHelper(pts, o.r ?? 0.0075, btn, { where: '1.0' }) });
    r.extra.push(buttonsHelper(pts, o.r ?? 0.0075, btn));
    if (r.long) skirtPaint(r, `col = mix(col, col * 0.6, line(vCanon.x, 0.07, 0.0016) * step(0.0, vCanon.z));`);
  }
}
// epaulettes / shoulder tabs: strips along the top of the shoulders with a button at the neck end
export function epaulettesHelper(ctx, r, o = {}) {
  const land = ctx.land;
  const zc = (x) => (x < 0.1 ? lerp(0.005, -0.03, clamp((x - 0.06) / 0.04)) : lerp(-0.03, -0.008, clamp((x - 0.1) / 0.06)));
  const pc = overlayHelper(ctx, r.b.piece, (V) => {
    const x = Math.abs(V.cx);
    return Math.min(0.013 - Math.abs(V.cz - zc(x)), x - 0.075, 0.185 - x, V.cy - (land.shY + 0.035));
  }, { d: 0.0032 });
  if (pc) r.pieces.push({ piece: pc, extra: `${o.color ? `col = ${o.color};` : ''} { float x = abs(vCanon.x); col = mix(col, ${o.button || 'uTrim'}, circle(vec2(x, vCanon.z), vec2(0.088, ${f(zc(0.088))}), 0.0055)); }` });
}
// a belt round the waist (with a buckle at the front), on the jacket body
export function beltHelper(ctx, it, r, o = {}) {
  const land = ctx.land, y = o.y ?? land.waistY - 0.005;
  sashHelper(ctx, it, r, y, o.h ?? 0.016, { color: o.color || 'uMain * 0.9', d: 0.004, paint: `${stitchHHelper(y + 0.012, '1.0', 'col * 0.7')} ${stitchHHelper(y - 0.012, '1.0', 'col * 0.7')}
    { vec2 q = vCanon.xy - vec2(${f(o.x ?? 0.0)}, ${f(y)}); float fb = step(0.0, vCanon.z); col = mix(col, ${o.buckle || BRASS}, boxLine(q, vec2(0.0), vec2(0.016, 0.017), 0.003, 0.004) * fb); col = mix(col, ${o.buckle || BRASS}, box2(q, vec2(0.0), vec2(0.0015, 0.014), 0.0005) * fb); }` });
}
// the wearer's stitched waistband / hem band of a jacket
const hemBand = (ctx, r, w, glsl) => { const pc = bandsHelper(ctx, r.b, { hem: w }, { d: 0.0022 }); if (pc) r.pieces.push({ piece: pc, glsl, noPattern: true }); };
// small toggles (a duffle's): wooden pegs on rope loops at canonical places on the garment
function togglesTree(ctx, mesh, pts, k) {
  const parts = [];
  for (const [x, y] of pts) {
    const at = surfaceHelper(mesh, x, y, 1);
    if (!at) continue;
    const c = [at.p[0] + at.n[0] * k * 0.5, at.p[1] + at.n[1] * k * 0.5, at.p[2] + at.n[2] * k * 0.5];
    parts.push(P.rcone({ a: [c[0] - k * 2.2, c[1] + k * 0.2, c[2]], b: [c[0] + k * 2.2, c[1] - k * 0.2, c[2]], ra: k * 0.55, rb: k * 0.55 }));
  }
  return parts.length ? union(...parts) : null;
}
// the finishing words of a jacket: cuffs, hem, pockets (on the skirt for long coats), lining
function finish(ctx, it, r, o = {}) {
  const land = ctx.land, p = r.p;
  wordsHelper(ctx, it, r, { neckBand: false, collar: 'none', hemKind: r.long ? 'plain' : o.hemKind, pockets: r.long ? 'none' : o.pockets, open: r.gap, ...o });
  if (r.long && (o.pockets ?? p.pockets) && (o.pockets ?? p.pockets) !== 'none' && r.skirt) {
    const kind = o.pockets ?? p.pockets, y = r.shellHem - 0.075;
    const boxes = kind === 'slash' ? [] : [[0.1, y, 0.05, 0.055, 0.008], [-0.1, y, 0.05, 0.055, 0.008]];
    if (boxes.length) {
      const pc = pocketsHelper(ctx, { piece: r.skirt }, boxes, { d: 0.0025 });
      if (pc) r.pieces.push({ piece: pc, extra: boxes.map(([x, yy, hx, hy, rd]) => pocketPaintHelper(x, yy, hx, hy, rd)).join('') });
      if (/flap|utility/.test(kind)) { const fl = pocketsHelper(ctx, { piece: r.skirt }, boxes.map(([x, yy, hx, hy]) => [x, yy + hy - 0.013, hx + 0.004, 0.016, 0.004]), { d: 0.0045 }); if (fl) r.pieces.push({ piece: fl, extra: buttonsHelper(boxes.map(([x, yy, , hy]) => [x, yy + hy - 0.017]), 0.0045, 'uTrim', { where: '1.0' }) }); }
    } else skirtPaint(r, [1, -1].map((s) => `col = mix(col, col * 0.62, line(vCanon.x * ${s}.0 - 0.1 - (vCanon.y - ${f(y)}) * 0.3, 0.0, 0.0022) * band(vCanon.y, ${f(y - 0.05)}, ${f(y + 0.05)}) * step(0.0, vCanon.z));`).join(''));
  }
  if (o.lining) r.extra.push(`if (!gl_FrontFacing) return ${o.lining} * 1.3;`);
  return finishHelper(r);
}

// ---------- the archetypes ----------
// a track / zip jacket: stand collar, full zip, rib cuffs and hem (second), patch pockets
export function zip_jacket(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it);
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, p.collar === 'none' ? 'stand' : p.collar || 'stand', { collarPaint: zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col * 0.85' }) + (has(p, 'piping') ? `col = mix(col, uTrim, step(0.5, vG.w));` : '') });
  closureHelper(ctx, it, r, 'zip');
  if (has(p, 'piping')) r.extra.push(`col = mix(col, uTrim, line(vG.x, 0.0, 0.003) * step(0.5, vG.z) * step(vG.z, 2.5));`);
  return finish(ctx, it, r, { hemColor: 'uSecond', ribColor: it.pattern && it.pattern.cuffs_hem ? 'uSecond' : null });
}
// a windbreaker: the hood, a half zip, a kangaroo pocket, elastic cuffs and hem (gathered)
export function windbreaker(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { elastic: { hem: 0.006, cuff: 0.006 } });
  if (!r.b.piece) return [];
  hoodPiecesHelper(ctx, it, r, { frontOpen: false, cords: has(p, 'drawcords') });
  r.extra.push(zipHelper(0, land.chestY - 0.03, land.shY + 0.035, { tape: 'col * 0.85' }));
  r.extra.push(`col = mix(col, uSecond, band(vCanon.y - vCanon.x * 0.35, ${f(land.chestY - 0.01)}, ${f(land.chestY + 0.035)}) * ${TRUNK}); col = mix(col, uAccent, band(vPart.y, 0.25, 0.3) * step(0.5, vG.z) * step(vG.z, 2.5));`);
  r.extra.push(`col = mix(col, col * 0.85, stripes(vG.x, 0.012, 0.003) * (1.0 - smoothstep(0.0, 0.05, vCanon.y - ${f(r.shellHem)})) * ${TRUNK});`);
  return finish(ctx, it, r, { hemKind: 'plain', cuffs: 'elastic' });
}
// a down jacket / vest: quilted channels (real puffs in the offset), a funnel collar, zip, chest zip pocket
export function down_jacket(ctx, it, o = {}) {
  const land = ctx.land, p = it.params, ch = (land.shY - land.hipJ) / 6.5;
  const r = jacketHelper(ctx, it, { quilt: { trunk: ch, arm: 0.16, depth: 0.0085 }, ease: 0.008, sleeve: o.sleeve });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'funnel', { collarPaint: zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col * 0.85' }) });
  closureHelper(ctx, it, r, 'zip');
  // the stitched channels between the puffs
  r.extra.push(`{ float u = (vCanon.y - ${f(r.shellHem)}) / ${f(ch)}; col = mix(col, col * 0.6, aa(abs(fract(u + 0.5) - 0.5) * ${f(ch)} - 0.0012) * ${TRUNK} * step(vCanon.y, ${f(land.shY - 0.03)}));
    float a = vPart.y / 0.16; col = mix(col, col * 0.6, aa(abs(fract(a + 0.5) - 0.5) * 0.08 - 0.0012) * step(0.5, vG.z) * step(vG.z, 2.5)); }`);
  if (has(p, 'logo_sleeve')) r.extra.push(`col = mix(col, uAccent, box2(vec2(vG.x, vPart.y), vec2(0.0, 0.2), vec2(0.012, 0.012), 0.003) * step(0.5, vG.z) * step(vG.z, 1.5));`);
  return finish(ctx, it, r, { ribColor: 'uSecond' });
}
export const down_vest = (ctx, it) => down_jacket(ctx, it, { sleeve: -1 });
// a raincoat: hood (lined), thigh long, toggles, flap pockets, reflective dots, a glossy sheen
export function raincoat(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { elastic: { cuff: 0.005 } });
  if (!r.b.piece) return [];
  hoodPiecesHelper(ctx, it, r, { frontOpen: true, gap: 0.05 });
  r.extra.push(`col = mix(col, col * 0.62, line(vCanon.x, 0.016, 0.0016) * ${FRONT} * ${TRUNK});`);
  skirtPaint(r, `col = mix(col, col * 0.62, line(vCanon.x, 0.016, 0.0016) * step(0.0, vCanon.z));`);
  const sheen = `col = mix(col, mix(col, vec3(1.0), 0.3), aa(abs(vCanon.x + 0.06 + (vCanon.y - 1.1) * 0.35) - 0.008) * step(0.0, vCanon.z) * 0.6);`;
  r.extra.push(sheen); skirtPaint(r, sheen);
  if (has(p, 'reflective_dots')) { const d = `col = mix(col, vec3(0.92), dotsHex(vec2(vG.x, vCanon.y) * 1.0, 0.03, 0.004) * band(vCanon.y, ${f(r.hemT)}, ${f(r.hemT + 0.04)}));`; skirtPaint(r, d); r.extra.push(`col = mix(col, vec3(0.92), dotsHex(vec2(vG.x, vPart.y * 0.3), 0.03, 0.004) * band(vPart.y, 0.8, 0.88) * step(0.5, vG.z) * step(vG.z, 2.5));`); }
  const pieces = finish(ctx, it, r, { lining: 'uSecond' });
  togglesPieces(ctx, it, r, pieces, [[0.0, land.shY - 0.06], [0.0, land.chestY - 0.03], [0.0, land.waistY], [0.0, land.hipJ + 0.03]]);
  return pieces;
}
function togglesPieces(ctx, it, r, pieces, pts) {
  const k = ctx.A.L.hw * 0.035, t = togglesTree(ctx, r.b.piece.mesh, pts, k);
  if (!t) return;
  const pc = solidHelper(ctx, t, { cell: Math.max(0.0018, k * 0.4), verts: 1600 });
  if (pc) pieces.push({ piece: pc, glsl: `vec3 col = ${has(it.params, 'toggle') && it.item.base === 'duffle' ? WOOD : 'uTrim'}; return col;`, noPattern: true });
  // rope loops painted round them
  const loops = pts.map(([x, y]) => `col = mix(col, uTrim * 0.9, (ring(vCanon.xy, vec2(${f(x - 0.022)}, ${f(y)}), 0.01, 0.0025) + ring(vCanon.xy, vec2(${f(x + 0.022)}, ${f(y)}), 0.01, 0.0025)) * step(0.0, vCanon.z) * step(vG.z, 0.5));`).join('');
  const main = pieces.find((x) => x.piece === r.b.piece); if (main) main.extra += loops;
}
// a duffle coat: hood, toggles with rope loops, patch pockets, a tartan lining
export function duffle(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it);
  if (!r.b.piece) return [];
  hoodPiecesHelper(ctx, it, r, { frontOpen: true, gap: 0.05 });
  r.extra.push(`col = mix(col, col * 0.62, line(vCanon.x, 0.03, 0.0016) * ${FRONT} * ${TRUNK});`);
  skirtPaint(r, `col = mix(col, col * 0.62, line(vCanon.x, 0.03, 0.0016) * step(0.0, vCanon.z));`);
  // a yoke over the shoulders
  r.extra.push(`col = mix(col, col * 0.7, line(vCanon.y, ${f(land.shY - 0.07)}, 0.0016) * ${TRUNK} * step(vShare.x, 0.4));`);
  const pieces = finish(ctx, it, r, { lining: has(p, 'lining_contrast') ? 'uSecond' : null });
  togglesPieces(ctx, it, r, pieces, [[0.0, land.shY - 0.05], [0.0, land.chestY - 0.04], [0.0, land.waistY - 0.01], [0.0, land.hipJ + 0.03]]);
  return pieces;
}
// a trench coat: double-breasted, wide notched lapels, belt, epaulettes, storm flap, flap pockets, knee long
export function trench(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { breakY: land.chestY + 0.01, neckGap: 0.07, flare: 0.05 });
  if (!r.b.piece) return [];
  lapelsHelper(ctx, it, r, 'notched', { w: 0.06, collarW: 0.035 });
  closureHelper(ctx, it, r, 'double', { n: 3 });
  if (has(p, 'storm_flap')) { const sf = overlayHelper(ctx, r.b.piece, (V) => (V.cz > 0.01 && V.limb === 0 ? Math.min(-V.cx - 0.03, V.cy - (land.chestY - 0.02), 0.13 - (-V.cx)) : -1), { d: 0.004 }); if (sf) r.pieces.push({ piece: sf, extra: stitchHHelper(land.chestY - 0.01, '1.0', 'col * 0.7') }); }
  if (has(p, 'epaulettes')) epaulettesHelper(ctx, r);
  if (has(p, 'belt')) beltHelper(ctx, it, r, { color: 'uMain * 0.95' });
  skirtPaint(r, `col = mix(col, col * 0.62, line(vCanon.x, 0.07, 0.0016) * step(0.0, vCanon.z));`);
  return finish(ctx, it, r, { cuffs: 'button' });
}
// a kid's swing coat: A-line, a peter pan collar, pearl buttons, a scalloped hem, patch pockets, turned-up cuffs
export function swing_coat(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { flare: 0.09, hang: 1, scallop: has(p, 'scallop_edge') || p.hem === 'scalloped' ? { n: 16, depth: 0.014 } : null });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'peter_pan', { color: 'uTrim' });
  closureHelper(ctx, it, r, 'buttons', { button: PEARL });
  return finish(ctx, it, r, { cuffs: 'turn_up' });
}
// a peacoat: thigh long, double-breasted, notched lapels, big buttons, slash pockets
export function peacoat(ctx, it) {
  const land = ctx.land, r = jacketHelper(ctx, it, { breakY: land.chestY + 0.02, neckGap: 0.07 });
  if (!r.b.piece) return [];
  lapelsHelper(ctx, it, r, 'notched', { w: 0.065, collarW: 0.04 });
  closureHelper(ctx, it, r, 'double', { n: 3, r: 0.0085 });
  return finish(ctx, it, r, { cuffs: 'none' });
}
// blazers: notched lapels over a V, buttoned at the waist, flap pockets, a chest welt, cuff buttons
export function blazer(ctx, it) {
  const land = ctx.land, p = it.params, school = has(p, 'embroidery_small');
  const r = jacketHelper(ctx, it, { breakY: land.waistY + 0.03, neckGap: 0.06 });
  if (!r.b.piece) return [];
  lapelsHelper(ctx, it, r, 'notched', { w: 0.045, piping: has(p, 'piping') ? 'uAccent' : null });
  closureHelper(ctx, it, r, 'buttons', { n: 2, top: land.waistY + 0.02 });
  r.extra.push(`col = mix(col, col * 0.62, box2(vCanon.xy, vec2(0.075, ${f(land.chestY + 0.03)}), vec2(0.028, 0.003), 0.001) * ${FRONT} * ${TRUNK});`);
  if (school) r.extra.push(`{ vec2 q = vCanon.xy - vec2(0.075, ${f(land.chestY + 0.0)}); float sh = step(0.0, vCanon.z) * ${TRUNK};
    float crest = box2(q + vec2(0.0, 0.004), vec2(0.0), vec2(0.016, 0.012), 0.002) + circle(q, vec2(0.0, -0.016), 0.016) * step(q.y, -0.006);
    col = mix(col, uTrim, clamp(crest, 0.0, 1.0) * sh); col = mix(col, uAccent, star(q, vec2(0.0, -0.006), 0.009) * circle(q, vec2(0.0, -0.006), 0.0095) * sh); }`);
  r.extra.push(`col = mix(col, ${buttonColor(p)}, (circle(vec2(vG.x, vPart.y * 0.52), vec2(-0.022, 0.48), 0.004) + circle(vec2(vG.x, vPart.y * 0.52), vec2(-0.022, 0.465), 0.004)) * step(0.5, vG.z) * step(vG.z, 2.5));`);
  return finish(ctx, it, r, { cuffs: 'none' });
}
// a lab coat: knee long and open, notched lapels, patch pockets on the skirt, a pen pocket and an ID card
export function lab_coat(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { open: 0.032, breakY: land.chestY - 0.02, neckGap: 0.065, flare: 0.04 });
  if (!r.b.piece) return [];
  lapelsHelper(ctx, it, r, 'notched', { w: 0.045 });
  closureHelper(ctx, it, r, 'buttons', { n: 2 });
  r.extra.push(pocketPaintHelper(-0.08, land.chestY + 0.01, 0.03, 0.035, 0.004, 'col * 0.7'));
  if (has(p, 'pen_pocket')) r.extra.push(`col = mix(col, uAccent, box2(vCanon.xy, vec2(-0.09, ${f(land.chestY + 0.05)}), vec2(0.0025, 0.012), 0.001) * ${FRONT} * ${TRUNK});`);
  if (has(p, 'id_lanyard')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(0.085, ${f(land.chestY + 0.0)}); float fr = ${FRONT} * ${TRUNK}; col = mix(col, uAccent, box2(q, vec2(0.0), vec2(0.016, 0.022), 0.003) * fr); col = mix(col, vec3(0.95), box2(q, vec2(0.0, -0.004), vec2(0.012, 0.012), 0.002) * fr); col = mix(col, uSecond, box2(q, vec2(0.0, 0.014), vec2(0.004, 0.003), 0.001) * fr); }`);
  return finish(ctx, it, r, { cuffs: 'none' });
}
// cardigans: a V over buttons (rib front band) or a long open shawl cardigan
export function cardigan(ctx, it) {
  const land = ctx.land, p = it.params, shawl = p.neckline === 'shawl' || p.collar === 'shawl';
  const r = shawl ? jacketHelper(ctx, it, { open: 0.035, breakY: land.waistY + 0.02, neckGap: 0.06 }) : jacketHelper(ctx, it, { breakY: land.chestY - 0.01, neckGap: 0.05 });
  if (!r.b.piece) return [];
  knitPaintHelper(ctx, r, p);
  // the rib band round the front edges and the back of the neck (wide: the shawl collar)
  const pc = bandsHelper(ctx, r.b, { front: shawl ? 0.05 : 0.02, neck: shawl ? 0.04 : 0.018 }, { d: shawl ? 0.004 : 0.002 });
  if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = uMain; ${ribHelper('1.0', 0.84, 0.0055)} return col;`, noPattern: true });
  if (!shawl) closureHelper(ctx, it, r, 'buttons', { n: 4 });
  else r.extra.push(buttonsHelper(buttonRowHelper(-(r.gap + 0.016), land.waistY + 0.0, r.shellHem + 0.05, 2), 0.0075, buttonColor(p)));
  return finish(ctx, it, r);
}
// a bomber: rib collar, zip, rib cuffs and hem with tipping, slash pockets, a sleeve pocket, coloured lining
export function bomber(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { elastic: { hem: 0.004 } });
  if (!r.b.piece) return [];
  const tip = has(p, 'tipping_stripes') ? `col = mix(col, uSecond, line(vG.y, 0.3, 0.1) + line(vG.y, 0.55, 0.1));` : '';
  collarPiecesHelper(ctx, it, r, 'band_rib', { collarPaint: zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col * 0.85' }) });
  closureHelper(ctx, it, r, 'zip');
  if (has(p, 'logo_sleeve')) r.extra.push(`col = mix(col, col * 0.7, boxLine(vec2(vG.x, vPart.y * 0.52), vec2(0.0, 0.1), vec2(0.016, 0.02), 0.002, 0.0015) * step(0.5, vG.z) * step(vG.z, 1.5)); col = mix(col, uTrim, box2(vec2(vG.x, vPart.y * 0.52), vec2(0.0, 0.122), vec2(0.008, 0.002), 0.001) * step(0.5, vG.z) * step(vG.z, 1.5));`);
  const pieces = finish(ctx, it, r, { lining: has(p, 'lining_contrast') ? 'uSecond' : null });
  if (tip) for (const pc of pieces) if (pc.glsl && pc.glsl.includes('stripes(vG.x, 0.0055')) pc.glsl = pc.glsl.replace(/return col;/, tip + ' return col;');
  return pieces;
}
// a denim jacket: point collar, buttons, two chest flap pockets, a waistband, contrast stitching, front yoke seams
export function denim_jacket(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it);
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'point', {});
  closureHelper(ctx, it, r, 'buttons', { n: 5, button: BRASS });
  const st = has(p, 'stitch_contrast') ? 'vec3(0.86, 0.62, 0.25)' : 'uTrim';
  r.extra.push(`{ float yk = ${f(land.chestY + 0.07)} - abs(vCanon.x) * 0.15; col = mix(col, ${st}, (dashes(vG.x, vCanon.y, yk, 0.0011, 0.008, 0.005) + dashes(vG.x, vCanon.y, yk - 0.005, 0.0011, 0.008, 0.005)) * ${TRUNK});
    col = mix(col, ${st}, dashes(vCanon.y, abs(vCanon.x), 0.06, 0.0011, 0.008, 0.005) * step(vCanon.y, yk) * ${FRONT} * ${TRUNK}); }`);
  const ys = land.chestY + 0.03, boxes = [[0.075, ys, 0.032, 0.035, 0.006], [-0.075, ys, 0.032, 0.035, 0.006]];
  const pk = pocketsHelper(ctx, r.b, boxes);
  if (pk) r.pieces.push({ piece: pk, extra: boxes.map(([x, y, hx, hy]) => pocketPaintHelper(x, y, hx, hy, 0.006, st)).join('') });
  const fl = pocketsHelper(ctx, r.b, boxes.map(([x, y, hx, hy]) => [x, y + hy - 0.01, hx + 0.003, 0.014, 0.004]), { d: 0.0045 });
  if (fl) r.pieces.push({ piece: fl, extra: buttonsHelper(boxes.map(([x, y, , hy]) => [x, y + hy - 0.014]), 0.0045, BRASS, { where: '1.0' }) });
  hemBand(ctx, r, 0.04, `vec3 col = uMain; ${stitchHHelper(r.shellHem + 0.034, '1.0', st)} ${buttonsHelper([[0.12, r.shellHem + 0.02], [-0.12, r.shellHem + 0.02]], 0.005, BRASS, { where: '1.0' })} return col;`);
  return finish(ctx, it, r, { cuffs: 'button', pockets: 'none', button: BRASS });
}
// a safari / field jacket: point collar, buttons, four flap pockets, belt, epaulettes
export function field_jacket(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it);
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'point', {});
  closureHelper(ctx, it, r, 'buttons', { n: 5 });
  if (has(p, 'epaulettes')) epaulettesHelper(ctx, r);
  if (has(p, 'belt')) beltHelper(ctx, it, r);
  return finish(ctx, it, r, { cuffs: 'button' });
}
// a fleece: stand collar, zip, contrast yoke over the shoulders, slash pockets, bound hem
export function fleece(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { ease: 0.006 });
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'stand', { collarPaint: zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col * 0.85' }) + (has(p, 'contrast_yoke') ? 'col = uSecond;' : '') });
  closureHelper(ctx, it, r, 'zip');
  if (has(p, 'contrast_yoke')) r.extra.push(`col = mix(col, uSecond, (step(${f(land.chestY + 0.06)}, vCanon.y) * ${TRUNK} + step(0.5, vG.z) * step(vG.z, 2.5) * step(vPart.y, 0.12)) * 1.0); col = mix(col, col * 0.7, line(vCanon.y, ${f(land.chestY + 0.06)}, 0.0016) * ${TRUNK});`);
  r.extra.push(`col = mix(col, col * 0.94, noise2(vec2(vG.x, vCanon.y) / 0.004) * 0.6);`);
  return finish(ctx, it, r);
}
// a parka: hood with a faux-fur rim, thigh long, a storm flap over the zip, flap pockets, elastic cuffs, quilted
export function parka(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { elastic: { cuff: 0.006 }, quilt: has(p, 'quilted') ? { trunk: 0.09, arm: 0.2, depth: 0.004 } : null });
  if (!r.b.piece) return [];
  hoodPiecesHelper(ctx, it, r, { frontOpen: true, gap: 0.04, size: 1.1 });
  if (has(p, 'fur_trim')) {
    const A = r.b.A, L = ctx.A.L, amp = 0.09 * 1.1 * L.hw;
    const fur = overlayHelper(ctx, r.b.piece, (V, i) => (A.front[i] < 0.01 ? -1 : 0.016 - A.neck[i]), { dAt: (V) => amp * 0.75 + 0.006 * (0.6 + 0.4 * Math.sin(Math.atan2(V.cx, V.cz) * 40)), rim: amp * 0.5, nsmooth: 1 });
    if (fur) r.pieces.push({ piece: fur, glsl: `vec3 col = vec3(0.94, 0.9, 0.82); col = mix(col, col * 0.82, noise2(vec2(vG.x, vCanon.y) / 0.003)); return col;`, noPattern: true });
  }
  closureHelper(ctx, it, r, 'zip');
  if (has(p, 'storm_flap')) {
    const sf = overlayHelper(ctx, r.b.piece, (V) => (V.cz > 0.01 && V.limb === 0 ? 0.018 - Math.abs(V.cx - 0.004) : -1), { d: 0.004 });
    if (sf) r.pieces.push({ piece: sf, extra: buttonsHelper(buttonRowHelper(0.004, land.shY - 0.03, r.shellHem + 0.03, 5), 0.0045, 'uTrim', { where: '1.0' }) });
    skirtPaint(r, `col = mix(col, col * 0.6, line(vCanon.x, 0.02, 0.0016) * step(0.0, vCanon.z));` + buttonsHelper(buttonRowHelper(0.004, r.shellHem - 0.03, r.hemT + 0.06, 2), 0.0045, 'uTrim', { where: SKIRT }));
  }
  if (has(p, 'quilted')) r.extra.push(`col = mix(col, col * 0.75, aa(abs(fract((vCanon.y) / 0.09 + 0.5) - 0.5) * 0.09 - 0.001) * ${TRUNK});`);
  return finish(ctx, it, r, { cuffs: 'elastic' });
}
// a sweater vest: sleeveless V with rib bands (an argyle from the pattern)
export function sweater_vest(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { under: true, sleeve: -1, neck: neckOf(land, 'v'), hang: 0.5, ease: 0.002 });
  if (!r.b.piece) return [];
  knitPaintHelper(ctx, r, p);
  const pc = bandsHelper(ctx, r.b, { neck: 0.016, arm: 0.014, hem: 0.035 }, { d: 0.002 });
  if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = uMain; ${ribHelper('1.0', 0.84, 0.0055)} return col;`, noPattern: true });
  return finish(ctx, it, r, { hemKind: 'plain' });
}
// a waistcoat: a deep V to the waist, pointed fronts, buttons, welt pockets, the back in the lining colour
export function waistcoat(ctx, it) {
  const land = ctx.land, p = it.params, hem = Math.min(land.waistY - 0.03, land.hipJ + 0.07);
  const r = jacketHelper(ctx, it, { under: true, sleeve: -1, neck: { shape: 'v', front: land.chestY - 0.04, back: land.shY + 0.04, width: 0.06 }, hem: hem + 0.012, hemAt: hemShapeHelper(land, hem, 'points'), hang: 0.3, ease: 0.001 });
  if (!r.b.piece) return [];
  r.extra.push(`col = mix(col, uSecond * 0.9, step(vCanon.z, -0.005) * ${TRUNK} * step(vCanon.y, ${f(land.shY - 0.03)}));`);
  r.extra.push(`col = mix(col, col * 0.62, line(vCanon.x, 0.012, 0.0014) * step(vCanon.y, ${f(land.chestY - 0.03)}) * ${FRONT} * ${TRUNK});`);
  r.extra.push(buttonsHelper(buttonRowHelper(0.0, land.chestY - 0.05, hem + 0.025, 4), 0.0055, buttonColor(p)));
  r.extra.push([0.075, -0.075].map((x) => `col = mix(col, col * 0.62, box2(vCanon.xy, vec2(${f(x)}, ${f(land.waistY + 0.005)}), vec2(0.022, 0.003), 0.001) * ${FRONT} * ${TRUNK});`).join(''));
  const pc = bandsHelper(ctx, r.b, { neck: 0.008, arm: 0.008 }, { d: 0.0015 });
  if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uMain * 0.9; return col;', noPattern: true });
  return finish(ctx, it, r, { hemKind: 'plain', pockets: 'none' });
}
// a tailcoat: the front cut away at the waist, tails behind to the knee, notched lapels, two rows of buttons
export function tailcoat(ctx, it) {
  const land = ctx.land, p = it.params, hemF = land.waistY - 0.02, tails = (ctx.land.kneeY + 0.03);
  const r = jacketHelper(ctx, it, { open: 0.035, breakY: land.chestY - 0.02, neckGap: 0.06, hem: hemF + 0.012, noSkirt: true, hemAt: (V) => hemF - 0.02 * sstep(0.3, 1.5, Math.abs(Math.atan2(V.cx, V.cz))) });
  if (!r.b.piece) return [];
  lapelsHelper(ctx, it, r, 'notched', { w: 0.045, color: 'uSecond' });
  r.extra.push(buttonsHelper([...buttonRowHelper(0.065, land.chestY - 0.03, hemF + 0.03, 3), ...buttonRowHelper(-0.065, land.chestY - 0.03, hemF + 0.03, 3)], 0.006, 'uTrim'));
  // two tails with a vent between them
  const wrap = stackHelper(ctx).slice();
  for (const sec of [[Math.PI - 0.95, Math.PI - 0.035], [Math.PI + 0.035, Math.PI + 0.95]]) {
    const tb = tubeHelper(ctx, { top: hemF + 0.02, hem: tails, off: it.off + 0.006, flare: 0.03, follow: 0.6, back: 0.01, wrap, sector: sec, layer: it.layer, rim: 0.004, topW: 0.2, segments: 40 });
    if (tb) { rememberHelper(ctx, tb); r.pieces.push({ piece: tb, extra: '' }); }
  }
  return finish(ctx, it, r, { cuffs: 'button', hemKind: 'plain' });
}
// the park ranger's jacket: stand collar, zip, a contrast yoke, shoulder tabs, reflective tape, pockets, a carabiner
export function ranger_jacket(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it);
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'stand', { collarPaint: 'col = uSecond;' + zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col * 0.85' }) });
  closureHelper(ctx, it, r, 'zip', { teeth: 'vec3(0.8)' });
  if (has(p, 'contrast_yoke')) r.extra.push(`{ float yk = ${f(land.chestY + 0.05)} + abs(vCanon.x) * 0.25; col = mix(col, uSecond, (step(yk, vCanon.y) * ${TRUNK} + step(0.5, vG.z) * step(vG.z, 2.5) * step(vPart.y, 0.14))); col = mix(col, uTrim, line(vCanon.y, yk, 0.0025) * ${TRUNK}); }`);
  if (has(p, 'shoulder_tabs')) epaulettesHelper(ctx, r, { color: 'uSecond' });
  if (has(p, 'carabiner')) r.extra.push(`col = mix(col, vec3(0.75), ring(vCanon.xy, vec2(-0.1, ${f(land.chestY - 0.06)}), 0.008, 0.0025) * ${FRONT} * ${TRUNK});`);
  return finish(ctx, it, r, { pocketOpts: { stitch: 'uSecond' } });
}
// a uniform jacket (the friendly town officer): point collar, brass buttons, epaulettes, a star badge, a name badge
export function uniform_jacket(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it);
  if (!r.b.piece) return [];
  collarPiecesHelper(ctx, it, r, 'point', {});
  closureHelper(ctx, it, r, 'buttons', { n: 5, button: buttonColor(p) });
  if (has(p, 'epaulettes')) epaulettesHelper(ctx, r, { button: buttonColor(p) });
  if (has(p, 'star_emblem')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(0.08, ${f(land.chestY + 0.075)}); float fr = ${FRONT} * ${TRUNK}; col = mix(col, uAccent * 0.75, star(q, vec2(0.0), 0.017) * circle(q, vec2(0.0), 0.018) * fr); col = mix(col, uAccent, star(q, vec2(0.0), 0.013) * circle(q, vec2(0.0), 0.014) * fr); col = mix(col, uMain, circle(q, vec2(0.0), 0.004) * fr); }`);
  if (has(p, 'name_badge')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(-0.075, ${f(land.chestY + 0.075)}); float fr = ${FRONT} * ${TRUNK}; col = mix(col, uAccent, box2(q, vec2(0.0), vec2(0.026, 0.008), 0.002) * fr); col = mix(col, uMain, box2(q, vec2(0.0), vec2(0.02, 0.0015), 0.001) * fr); }`);
  return finish(ctx, it, r, { pocketOpts: { button: buttonColor(p) } });
}
// vests: a fishing / hiking utility vest (pockets everywhere, mesh back, carabiner) and the hi-vis safety vest
export function utility_vest(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { sleeve: -1, neck: neckOf(land, 'v'), ease: has(p, 'padding') ? 0.008 : 0.004 });
  if (!r.b.piece) return [];
  if (p.collar === 'stand') collarPiecesHelper(ctx, it, r, 'stand', { collarPaint: zipHelper(0, land.shY, land.shY + 0.12, { tape: 'col * 0.85' }) });
  closureHelper(ctx, it, r, 'zip', { top: p.collar === 'stand' ? land.shY + 0.03 : land.chestY - 0.03 });
  const pc = bandsHelper(ctx, r.b, { neck: 0.012, arm: 0.012 }, { d: 0.0018 });
  if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uSecond; return col;', noPattern: true });
  if (has(p, 'mesh_panel')) r.extra.push(`col = mix(col, col * 0.7, dotsHex(vCanon.xy, 0.008, 0.002) * step(vCanon.z, -0.01) * step(${f(land.chestY)}, vCanon.y) * ${TRUNK});`);
  if (has(p, 'carabiner')) r.extra.push(`col = mix(col, vec3(0.78), ring(vCanon.xy, vec2(0.11, ${f(land.chestY + 0.06)}), 0.008, 0.0025) * ${FRONT} * ${TRUNK});`);
  if (has(p, 'padding')) r.extra.push(`col = mix(col, col * 0.75, aa(abs(fract(vCanon.y / 0.06 + 0.5) - 0.5) * 0.06 - 0.001) * ${TRUNK});`);
  return finish(ctx, it, r, { pocketOpts: { flapColor: 'uSecond', stitch: 'uSecond' }, hemKind: 'plain' });
}
export function safety_vest(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { sleeve: -1, neck: neckOf(land, 'v'), ease: 0.006 });
  if (!r.b.piece) return [];
  const tape = (y) => `col = mix(col, vec3(0.75, 0.76, 0.78), band(vCanon.y, ${f(y - 0.014)}, ${f(y + 0.014)}) * ${TRUNK}); col = mix(col, vec3(0.92), band(vCanon.y, ${f(y - 0.006)}, ${f(y + 0.006)}) * ${TRUNK});`;
  r.extra.push(tape(land.waistY + 0.0) + tape(land.chestY - 0.02));
  // the Y of tape on the back, two straps up the front
  r.extra.push(`{ vec2 q = vCanon.xy; float bk = step(vCanon.z, 0.0) * ${TRUNK}; float yy = ${f(land.chestY + 0.03)};
    float y1 = aa(abs(abs(q.x) - (q.y - yy) * 0.7) - 0.012) * step(yy, q.y) + aa(abs(q.x) - 0.012) * step(q.y, yy);
    col = mix(col, vec3(0.92), y1 * bk); col = mix(col, vec3(0.92), aa(abs(abs(q.x) - 0.065) - 0.012) * step(0.0, vCanon.z) * step(${f(land.chestY - 0.02)}, q.y) * ${TRUNK}); }`);
  r.extra.push(`col = mix(col, col * 0.75, box2(vCanon.xy, vec2(0.0, ${f(land.waistY)}), vec2(0.008, 0.18), 0.002) * ${FRONT} * ${TRUNK} * step(vCanon.y, ${f(land.chestY - 0.03)}));`);
  const pc = bandsHelper(ctx, r.b, { neck: 0.012, arm: 0.012, hem: 0.012 }, { d: 0.0018 });
  if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uTrim; return col;', noPattern: true });
  return finish(ctx, it, r, { hemKind: 'plain' });
}
// an artist's smock: loose, thigh long, elastic cuffs, a big front pocket, ties at the back
export function smock(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { elastic: { cuff: 0.006 }, flare: 0.05, neck: neckOf(land, 'crew') });
  if (!r.b.piece) return [];
  const pc = bandsHelper(ctx, r.b, { neck: 0.014 }, { d: 0.0018 });
  if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uMain * 0.92; return col;', noPattern: true });
  if (r.skirt) {
    const y = r.shellHem - 0.03, bx = [[0, y, 0.11, 0.05, 0.01]];
    const pk = pocketsHelper(ctx, { piece: r.skirt }, bx, { d: 0.0025 });
    if (pk) r.pieces.push({ piece: pk, extra: pocketPaintHelper(0, y, 0.11, 0.05, 0.01) + `col = mix(col, col * 0.7, line(vCanon.x, 0.0, 0.0014) * step(0.0, vCanon.z));` });
  }
  r.extra.push(`{ float bk = step(vCanon.z, 0.0) * ${TRUNK}; vec2 q = vCanon.xy - vec2(0.0, ${f(land.waistY)}); col = mix(col, uSecond, (box2(q, vec2(0.0, 0.0), vec2(0.06, 0.006), 0.003) + box2(q, vec2(0.025, -0.03), vec2(0.006, 0.03), 0.003)) * bk); }`);
  return finish(ctx, it, r, { cuffs: 'elastic', pockets: 'none' });
}
// a bolero: very short, open with rounded fronts, puff sleeves with frilled cuffs, a ruffled edge
export function bolero(ctx, it) {
  const land = ctx.land, p = it.params, hem = land.chestY - 0.03;
  const r = jacketHelper(ctx, it, { hem: hem + 0.012, open: 0.05, neckGap: 0.06, breakY: land.chestY + 0.05, hang: 0.2, ease: 0.001 });
  if (!r.b.piece) return [];
  if (has(p, 'ruffle_trim')) { const fr = frillHelper(ctx, r.b, 'front', 0.018, { amp: 0.004 }); if (fr) r.pieces.push({ piece: fr, glsl: 'vec3 col = uTrim; col = mix(col, col * 0.85, stripes(vG.x + vCanon.y, 0.01, 0.003)); return col;', noPattern: true }); }
  const pieces = finish(ctx, it, r, { cuffs: p.cuffs === 'frilled' ? 'frilled' : p.cuffs, hemKind: 'plain' });
  return pieces;
}
// a happi coat: straight, open, kimono sleeves, a contrast band down both front edges and round the neck, a sash
export function happi(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { open: 0.03, breakY: land.chestY - 0.06, neckGap: 0.045, bell: 0.04 });
  if (!r.b.piece) return [];
  const pc = bandsHelper(ctx, r.b, { front: 0.03, neck: 0.03 }, { d: 0.003 });
  if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = ${has(p, 'collar_contrast') ? 'uSecond' : 'uMain * 0.9'}; return col;`, noPattern: true });
  // the obi worn under it shows as a band in the opening
  if (has(p, 'obi_band')) r.extra.push(`col = mix(col, uAccent, band(vCanon.y, ${f(land.waistY - 0.03)}, ${f(land.waistY + 0.02)}) * step(abs(vCanon.x), ${f(0.03 + 0.012)}) * ${FRONT} * ${TRUNK});`);
  r.extra.push(`{ float y = vCanon.y - ${f(r.shellHem + 0.03)}; float w = sin(vG.x / 0.02) * 0.006; col = mix(col, uSecond, aa(y - w) * ${TRUNK}); col = mix(col, uTrim, line(y - w, 0.0, 0.003) * ${TRUNK}); }`);
  return finish(ctx, it, r, { hemKind: 'plain', cuffs: 'none' });
}
// a rain poncho: a cape hung from the neck round the shoulders and upper arms, a hood (with creature ears), snaps
export function poncho(ctx, it) {
  const land = ctx.land, p = it.params, r = jacketHelper(ctx, it, { sleeve: 0.18, hem: land.chestY + 0.05, hang: 0.3, noSkirt: true });
  if (!r.b.piece) return [];
  hoodPiecesHelper(ctx, it, r, { frontOpen: false, size: 1.1 });
  const hem = Math.max(land.crotchY - 0.02, hemOfHelper(ctx, it) + 0.05);
  const tb = tubeHelper(ctx, { top: land.shY + 0.005, hem, off: it.off + 0.008, flare: 0.03, follow: 0.15, back: 0.0, wrap: stackHelper(ctx).slice(), arms: 0.5, layer: it.layer, rim: 0.004, topBone: 'Spine3', topW: 0.8, smoothRound: 20, step: 0.008 });
  if (tb) { rememberHelper(ctx, tb); r.pieces.push({ piece: tb, extra: buttonsHelper(buttonRowHelper(0, land.chestY - 0.02, hem + 0.05, 3), 0.007, 'uTrim', { where: '1.0' }) + `col = mix(col, col * 0.62, line(vCanon.x, 0.012, 0.0016) * step(0.0, vCanon.z));` }); }
  return finish(ctx, it, r, { hemKind: 'plain', cuffs: 'none', pockets: 'none' });
}
