// The creator's data: the generator's option lists gathered in one place and
// put in one shape, whatever shape the module that owns them uses. Face, skin,
// hair and garment builders are written in parallel, so every list is read
// defensively from the module's namespace (an export that is not there yet is
// undefined) with a fallback, and the creator picks the real lists up as they land.
//
// Also: the catalogue's slots as the outfit tab's sub-tabs, which age group an
// age is in, colour maths (hex <-> hsv, distance, contrast) and the warnings the
// summary card shows for a look.
import * as SKIN from '../skin.js';
import * as HAIR from '../hair.js';
import { SLIDERS, AGE_GROUPS } from '../anatomy.js';
import { BUILDERS } from '../garments/index.js';

export { SLIDERS, AGE_GROUPS, BUILDERS, SKIN, HAIR };

// ---------- ages ----------
// the catalogue's age ids for anatomy.js' age groups
export const CAT_AGE = { toddler: 'toddler', child: 'child', preteen: 'preteen', teen: 'teen', young: 'young_adult', adult: 'adult', middle: 'middle_aged', elder: 'elder' };
export const GROUP_OF_CAT = Object.fromEntries(Object.entries(CAT_AGE).map(([k, v]) => [v, k]));
export function groupOf(age = 11) {
  return AGE_GROUPS.find((g) => age <= g.range[1] + 0.999) || AGE_GROUPS[AGE_GROUPS.length - 1];
}
export const isMinor = (age) => age < 18;

// ---------- body sliders, grouped for the body tab ----------
export const SLIDER_NAMES = {
  age: 'Age', sex: 'Boy  ·  Girl', height: 'Height', weight: 'Weight', muscle: 'Muscle', belly: 'Belly', bust: 'Bust', posture: 'Stoop',
  shoulders: 'Shoulders', chest: 'Chest', waist: 'Waist', hips: 'Hips', torso: 'Torso length', legs: 'Leg length', arms: 'Arm length',
  thighs: 'Thighs', calves: 'Calves', upperArms: 'Upper arms', neck: 'Neck length', neckW: 'Neck width', head: 'Head size', hands: 'Hands', feet: 'Feet',
  headW: 'Head width', headH: 'Head height', headD: 'Head depth', forehead: 'Forehead', cheeks: 'Cheeks', cheekbones: 'Cheekbones',
  jaw: 'Jaw width', jawLine: 'Jaw line', chin: 'Chin length', chinW: 'Chin width',
  ears: 'Ear size', earPoint: 'Pointed ears', earOut: 'Ears stick out', nose: 'Nose size', noseLen: 'Nose length', noseUp: 'Nose tilt', noseW: 'Nose width', noseBridge: 'Nose bridge',
};
const GROUPS = [
  { id: 'agesex', name: 'Age & sex', keys: ['age', 'sex'], frame: 'full' },
  { id: 'build', name: 'Build', keys: ['height', 'weight', 'muscle', 'belly', 'bust', 'posture'], frame: 'full' },
  { id: 'prop', name: 'Proportions', keys: ['shoulders', 'chest', 'waist', 'hips', 'torso', 'legs', 'arms', 'thighs', 'calves', 'upperArms', 'neck', 'neckW', 'head', 'hands', 'feet'], frame: 'full' },
  { id: 'head', name: 'Head shape', keys: ['headW', 'headH', 'headD', 'forehead', 'cheeks', 'cheekbones', 'jaw', 'jawLine', 'chin', 'chinW'], frame: 'face' },
  { id: 'earnose', name: 'Ears & nose', keys: ['ears', 'earPoint', 'earOut', 'nose', 'noseLen', 'noseUp', 'noseW', 'noseBridge'], frame: 'face' },
];
// every slider anatomy.js has ends up in a group (new ones in "More")
export function sliderGroups() {
  const seen = new Set(), out = [];
  for (const g of GROUPS) {
    const keys = g.keys.filter((k) => SLIDERS[k]);
    keys.forEach((k) => seen.add(k));
    if (keys.length) out.push({ ...g, keys });
  }
  const rest = Object.keys(SLIDERS).filter((k) => !seen.has(k));
  if (rest.length) out.push({ id: 'more', name: 'More', keys: rest, frame: 'full' });
  return out;
}
export const sliderName = (k) => SLIDER_NAMES[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

// ---------- option lists in one shape ----------
const titleCase = (s) => String(s).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
const HEXRE = /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i;
const asHex = (c) => (typeof c === 'string' && HEXRE.test(c) ? (c[0] === '#' ? c : '#' + c) : null);
// swatches: [{ id, name, color }] from an array of hexes / { name, color|hex|base|value } or a { name: hex } map
export function swatches(src) {
  if (!src) return [];
  const list = Array.isArray(src) ? src : Object.entries(src).map(([k, v]) => (typeof v === 'string' ? { id: k, name: titleCase(k), color: v } : { id: k, ...v }));
  return list.map((e, i) => {
    if (typeof e === 'string') return { id: e, name: e, color: asHex(e) || '#888888' };
    const color = asHex(e.color) || asHex(e.hex) || asHex(e.base) || asHex(e.value) || asHex(e.tone) || asHex(e.main) || '#888888';
    return { ...e, id: e.id ?? e.key ?? e.name ?? String(i), name: e.name || e.label || titleCase(e.id || e.key || color), color };
  });
}
// choices: [{ id, name, ... }] from an array of strings / objects or an { id: name|{} } map
export function choices(src) {
  if (!src) return [];
  if (Array.isArray(src)) return src.map((e, i) => (typeof e === 'string' || typeof e === 'number' ? { id: e, name: titleCase(e) } : { ...e, id: e.id ?? e.key ?? e.name ?? i, name: e.name || e.label || titleCase(e.id ?? e.key ?? i) }));
  return Object.entries(src).map(([k, v]) => (typeof v === 'string' ? { id: k, name: v } : { ...v, id: k, name: (v && (v.name || v.label)) || titleCase(k) }));
}
// option descriptors (face options): [{ key, name, kind: choice|range|color|toggle, options, min, max, step, def, group }]
export function optionList(src) {
  if (!src) return [];
  const entries = Array.isArray(src) ? src.map((e) => [e.key ?? e.id ?? e.name, e]) : Object.entries(src);
  const out = [];
  for (const [key, v] of entries) {
    if (key === undefined) continue;
    const d = { key, name: titleCase(key) };
    if (Array.isArray(v)) {
      if (v.length >= 2 && v.length <= 4 && v.every((x) => typeof x === 'number')) Object.assign(d, { kind: 'range', min: v[0], max: v[1], def: v[2] ?? v[0], step: v[3] });
      else if (v.every((x) => asHex(x) || (x && asHex(x.color || x.hex)))) Object.assign(d, { kind: 'color', options: swatches(v) });
      else Object.assign(d, { kind: 'choice', options: choices(v) });
    } else if (v && typeof v === 'object') {
      Object.assign(d, { name: v.name || v.label || d.name, group: v.group, hint: v.hint || v.note, def: v.default ?? v.def });
      const t = v.type || v.kind;
      const opts = v.options || v.values || v.choices || v.styles;
      if (t === 'color' || t === 'colour' || v.colors || v.colours || v.palette) Object.assign(d, { kind: 'color', options: swatches(v.colors || v.colours || v.palette || opts || []) });
      else if (t === 'bool' || t === 'boolean' || t === 'toggle' || typeof v.default === 'boolean') d.kind = 'toggle';
      else if (opts) Object.assign(d, { kind: 'choice', options: choices(opts) });
      else if (v.range || v.min !== undefined) { const r = v.range || [v.min, v.max]; Object.assign(d, { kind: 'range', min: r[0], max: r[1], step: v.step, def: d.def ?? r[2] ?? (r[0] < 0 ? 0 : r[0]) }); }
      else continue;
    } else if (typeof v === 'boolean') Object.assign(d, { kind: 'toggle', def: v });
    else continue;
    if (d.kind === 'range' && d.def === undefined) d.def = d.min < 0 ? 0 : d.min;
    if (d.kind === 'choice' && d.def === undefined && d.options.length) d.def = d.options[0].id;
    if (d.kind === 'color' && d.def === undefined && d.options.length) d.def = d.options[0].color;
    out.push(d);
  }
  return out;
}

// ---------- the lists, real or fallback ----------
// skin tones from the anime research (style.json) until skin.js has SKIN_TONES
const FALLBACK_TONES = [
  ['Porcelain', '#f3e2cc'], ['Fair peach', '#f9dcb4'], ['Fair pink', '#ffc19e'], ['Warm peach', '#ffb272'], ['Peach tan', '#f9a97f'],
  ['Golden tan', '#e8bb89'], ['Ruddy', '#e8a57b'], ['Tan', '#eaa556'], ['Brown', '#c98a55'], ['Deep brown', '#9a6236'], ['Umber', '#7a4a2c'],
].map(([name, color]) => ({ id: name, name, color }));
const FALLBACK_FACE = {
  eyeShape: { name: 'Eye shape', options: ['round', 'almond', 'sleepy', 'sharp', 'sparkly'], group: 'Eyes' },
  eyeColor: { name: 'Eye colour', type: 'color', colors: ['#3a2a22', '#6b4a2b', '#2f5d8c', '#3f7a4a', '#7a6a3a', '#5a3f7a', '#8a2f2f'], group: 'Eyes' },
  eyeSize: { name: 'Eye size', range: [-1, 1, 0], group: 'Eyes' },
  brows: { name: 'Eyebrows', options: ['soft', 'straight', 'thick', 'arched', 'worried'], group: 'Brows' },
  mouth: { name: 'Mouth', options: ['smile', 'small', 'wide', 'cat', 'neutral'], group: 'Mouth' },
  lashes: { name: 'Lashes', type: 'toggle', default: false, group: 'Eyes' },
};
const FALLBACK_MARKS = { blush: { name: 'Blush', type: 'toggle', default: false }, freckles: { name: 'Freckles', type: 'toggle', default: false }, mole: { name: 'Beauty mark', type: 'toggle', default: false } };
const FALLBACK_EXPRESSIONS = ['neutral', 'happy', 'grin', 'surprised', 'sad', 'angry', 'sleepy'];
const FALLBACK_HAIR_COLORS = [
  ['Black', '#2a2526'], ['Dark brown', '#4a3226'], ['Brown', '#7a5232'], ['Chestnut', '#9a4e2c'], ['Auburn', '#a8432a'], ['Ginger', '#d0702e'],
  ['Honey', '#c8964e'], ['Blonde', '#e8c878'], ['Platinum', '#efe6cf'], ['Grey', '#a8a6a4'], ['White', '#eeeceb'],
  ['Navy', '#2e3f73'], ['Teal', '#2f8f8a'], ['Green', '#4f9a4a'], ['Pink', '#e58bb0'], ['Purple', '#7c5aa8'], ['Red', '#c8323a'], ['Blue', '#3f7fd0'],
].map(([name, color]) => ({ id: name, name, color }));
const FALLBACK_FACIAL = ['none', 'stubble', 'moustache', 'goatee', 'short beard', 'full beard'];
const FALLBACK_UNDERWEAR = { tank: 'Tank and shorts', sport: 'Sports top and shorts', tee: 'Undershirt and briefs', suit: 'One-piece' };

export const has = {
  face: () => !!SKIN.FACE_OPTIONS, tones: () => !!SKIN.SKIN_TONES, expressions: () => !!SKIN.EXPRESSIONS,
  hair: () => !!(HAIR.HAIR_STYLES && (Array.isArray(HAIR.HAIR_STYLES) ? HAIR.HAIR_STYLES.length : Object.keys(HAIR.HAIR_STYLES).length)),
  hairColors: () => !!HAIR.HAIR_COLORS, facial: () => !!(HAIR.FACIAL_HAIR || HAIR.FACIAL_STYLES),
  marks: () => !!(SKIN.SKIN_MARKS || SKIN.MARKS),
};
const MARKISH = /mark|freckle|blush|mole|scar|plaster|sticker|paint/i;
export function faceOptions() {
  const all = optionList(SKIN.FACE_OPTIONS || FALLBACK_FACE);
  return all.filter((o) => !MARKISH.test(o.key) && !MARKISH.test(o.group || ''));
}
// marks: skin.js' own list, else face options that look like marks, else a fallback
export function markOptions() {
  if (SKIN.SKIN_MARKS || SKIN.MARKS) return { where: 'skin', list: optionList(SKIN.SKIN_MARKS || SKIN.MARKS) };
  if (SKIN.FACE_OPTIONS) {
    const m = optionList(SKIN.FACE_OPTIONS).filter((o) => MARKISH.test(o.key) || MARKISH.test(o.group || ''));
    if (m.length) return { where: 'face', list: m };
  }
  return { where: 'skin', list: optionList(FALLBACK_MARKS), fallback: true };
}
export const skinTones = () => swatches(SKIN.SKIN_TONES) .length ? swatches(SKIN.SKIN_TONES) : FALLBACK_TONES;
export const expressions = () => choices(SKIN.EXPRESSIONS || FALLBACK_EXPRESSIONS);
export const underwearStyles = () => choices(SKIN.UNDERWEAR || FALLBACK_UNDERWEAR);
export const hairStyles = () => choices(HAIR.HAIR_STYLES).filter((s) => !/facial|beard|moustache|mustache/i.test(`${s.kind || ''} ${s.type || ''} ${s.slot || ''}`));
export const hairColors = () => (HAIR.HAIR_COLORS ? swatches(HAIR.HAIR_COLORS) : FALLBACK_HAIR_COLORS);
export function facialStyles() {
  if (HAIR.FACIAL_HAIR || HAIR.FACIAL_STYLES) return choices(HAIR.FACIAL_HAIR || HAIR.FACIAL_STYLES);
  const inStyles = choices(HAIR.HAIR_STYLES).filter((s) => /facial|beard|moustache|mustache/i.test(`${s.kind || ''} ${s.type || ''} ${s.slot || ''}`));
  if (inStyles.length) return [{ id: 'none', name: 'None' }, ...inStyles];
  return choices(FALLBACK_FACIAL);
}
// skin.js' defaults for a face (signature not fixed yet: try the body, then the look)
export function faceDefaults(look) {
  if (typeof SKIN.faceDefaults !== 'function') return {};
  for (const arg of [look.body || {}, look]) { try { const d = SKIN.faceDefaults(arg); if (d && typeof d === 'object') return d; } catch { /* next */ } }
  return {};
}

// ---------- the catalogue's slots as tabs ----------
export const SLOT_TABS = [
  { id: 'top', name: 'Tops', slots: ['top'], frame: 'torso' },
  { id: 'outer', name: 'Outerwear', slots: ['outer'], frame: 'torso' },
  { id: 'dress', name: 'Dresses', slots: ['dress', 'onepiece'], frame: 'full' },
  { id: 'bottom', name: 'Bottoms', slots: ['bottom'], frame: 'legs' },
  { id: 'legwear', name: 'Legwear', slots: ['legwear'], frame: 'legs' },
  { id: 'shoes', name: 'Shoes', slots: ['shoes'], frame: 'feet' },
  { id: 'hat', name: 'Hats', slots: ['hat'], frame: 'face' },
  { id: 'eyewear', name: 'Eyewear', slots: ['eyewear'], frame: 'face' },
  { id: 'neckwear', name: 'Neckwear', slots: ['neckwear'], frame: 'bust' },
  { id: 'bag', name: 'Bags', slots: ['bag'], frame: 'full' },
  { id: 'belt', name: 'Belts', slots: ['belt'], frame: 'torso' },
  { id: 'gloves', name: 'Gloves', slots: ['gloves'], frame: 'torso' },
  { id: 'apron', name: 'Aprons', slots: ['apron'], frame: 'full' },
  { id: 'wrist', name: 'Wrist', slots: ['wrist'], frame: 'torso' },
  { id: 'jewellery', name: 'Jewellery', slots: ['jewellery'], frame: 'bust' },
  { id: 'pin', name: 'Pins', slots: ['pin'], frame: 'torso' },
  { id: 'hair_acc', name: 'Hair acc.', slots: ['hair_acc'], frame: 'face' },
];
export const SLOT_NAME = { top: 'Top', outer: 'Outerwear', dress: 'Dress', onepiece: 'One-piece', bottom: 'Bottom', legwear: 'Legwear', shoes: 'Shoes', hat: 'Hat', eyewear: 'Eyewear', neckwear: 'Neckwear', bag: 'Bag', belt: 'Belt', gloves: 'Gloves', apron: 'Apron', wrist: 'Wrist', jewellery: 'Jewellery', pin: 'Pin', hair_acc: 'Hair accessory' };
// slots that take several items (accessories); every other slot holds one
export const MULTI = new Set(['wrist', 'jewellery', 'pin', 'hair_acc']);
// what else an item takes off when it goes on
export const CONFLICTS = { dress: ['bottom', 'onepiece'], onepiece: ['bottom', 'dress'], bottom: ['dress', 'onepiece'] };
export const built = (item) => !!BUILDERS[item.base];

// ---------- colour maths ----------
export function hexRgb(h) { const x = parseInt(String(h || '#888888').slice(1).padEnd(6, '0'), 16); return [(x >> 16 & 255) / 255, (x >> 8 & 255) / 255, (x & 255) / 255]; }
export function rgbHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join(''); }
export function hsv(hex) {
  const [r, g, b] = hexRgb(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
export function hsvHex(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return rgbHex(f(5), f(3), f(1));
}
export const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export function colorDist(a, b) { const A = hexRgb(a), B = hexRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1] * 1.2, A[2] - B[2]); }
export const chromatic = (hex) => { const [, s, v] = hsv(hex); return s > 0.28 && v > 0.22; };
export const readableOn = (hex) => (hsv(hex)[2] > 0.72 && hsv(hex)[1] < 0.5 ? '#23284f' : '#ffffff');

// ---------- warnings for the summary card ----------
const SKIRTY = /skirt|dress|gown|pinafore|tunic|nightgown|swimsuit_skirted|robe|kilt/;
const SAFE_UNDER = /built_in_shorts|skort|culottes|shorts/;
export function warnings(look, cat, person) {
  const out = [];
  if (!cat) return out;
  const byId = cat.byId || (cat.byId = Object.fromEntries(cat.items.map((i) => [i.id, i])));
  const age = (look.body && look.body.age) ?? 11, g = groupOf(age);
  const worn = (look.outfit || []).map((w) => ({ w, item: byId[w.id] })).filter((x) => x.item);
  const slot = (s) => worn.filter((x) => x.item.slot === s);
  const soon = worn.filter((x) => !built(x.item));
  if (soon.length) out.push({ level: 'info', text: `${soon.length} item${soon.length > 1 ? 's' : ''} not built yet (coming soon): ${soon.map((x) => x.item.name).join(', ')}` });
  if (isMinor(age)) {
    const covered = worn.some((x) => x.item.slot === 'legwear' && /tights|leggings|knee|over_knee|full_leg/.test(`${x.item.base} ${x.item.params.length}`))
      || worn.some((x) => x.item.slot === 'bottom' && /shorts|leggings|trousers|pants|jeans|chinos|capri|culottes|skort|breeches|joggers/.test(x.item.base));
    for (const x of worn) {
      if ((x.item.slot === 'dress' || (x.item.slot === 'bottom' && SKIRTY.test(x.item.base))) && SKIRTY.test(x.item.base + ' ' + x.item.slot)) {
        const det = [...(x.item.params.details || []), ...((x.w.params && x.w.params.details) || [])].join(' ');
        if (!SAFE_UNDER.test(det + ' ' + x.item.base) && !covered) out.push({ level: 'warn', text: `${x.item.name}: skirt without built-in shorts for a ${g.name.toLowerCase()} (add leggings, tights or knee socks)` });
      }
    }
  }
  const off = worn.filter((x) => !(x.item.ages || []).includes(CAT_AGE[g.id]));
  if (off.length) out.push({ level: 'info', text: `Not usually worn by a ${g.name.toLowerCase()}: ${off.map((x) => x.item.name).join(', ')}` });
  const tops = worn.filter((x) => ['top', 'dress', 'onepiece', 'outer'].includes(x.item.slot));
  if (!tops.length) out.push({ level: 'info', text: 'No top: the underwear shows' });
  if (!slot('bottom').length && !slot('dress').length && !slot('onepiece').length) out.push({ level: 'info', text: 'No bottoms: the underwear shows' });
  if (!slot('shoes').length) out.push({ level: 'info', text: 'Barefoot' });
  // colour rules (catalog.json generator_rules)
  const colors = worn.map((x) => ({ x, c: colorsOfWorn(x.item, x.w) }));
  const hues = [];
  for (const { c } of colors) for (const k of ['main', 'second', 'accent']) if (c[k] && chromatic(c[k])) { const h = hsv(c[k])[0]; if (!hues.some((q) => hueDist(q, h) < 22)) hues.push(h); }
  if (hues.length > 4) out.push({ level: 'style', text: `${hues.length} different hues: the style guide suggests at most 4` });
  const top = colors.find(({ x }) => x.item.slot === 'outer') || colors.find(({ x }) => x.item.slot === 'top'), bot = colors.find(({ x }) => x.item.slot === 'bottom');
  if (top && bot) {
    const dv = Math.abs(hsv(top.c.main)[2] - hsv(bot.c.main)[2]);
    if (dv < 0.25 && colorDist(top.c.main, bot.c.main) > 0.08) out.push({ level: 'style', text: `Low contrast between top and bottom (value difference ${dv.toFixed(2)}, aim for 0.25+)` });
  }
  const patterned = worn.filter((x) => ['top', 'bottom', 'dress', 'outer', 'onepiece'].includes(x.item.slot) && ((x.w.pattern || x.item.pattern || {}).type || 'solid') !== 'solid');
  if (patterned.length > 1) out.push({ level: 'style', text: `${patterned.length} patterned main garments: the style guide suggests one` });
  if (person && person.missing && person.missing.length && !soon.length) out.push({ level: 'info', text: `No builder yet for: ${person.missing.join(', ')}` });
  return out;
}
// an item's colours as worn (outfit.js colorsOf, kept here so the card works before a build)
export function colorsOfWorn(item, worn = {}) {
  const cw = item.colourways || [];
  let c = cw[0] ? cw[0].colours : {};
  if (typeof worn.colourway === 'number' && cw[worn.colourway]) c = cw[worn.colourway].colours;
  else if (typeof worn.colourway === 'string') { const f = cw.find((x) => x.name === worn.colourway); if (f) c = f.colours; }
  return { main: '#888888', ...c, ...(worn.colors || {}) };
}
// the outfit's colours for the palette strip, most area first
export function paletteOf(look, cat) {
  if (!cat) return [];
  const byId = cat.byId || (cat.byId = Object.fromEntries(cat.items.map((i) => [i.id, i])));
  const W = { top: 5, dress: 6, outer: 6, bottom: 4, onepiece: 6, shoes: 1.5, hat: 1.5, legwear: 1.2, bag: 1.2 };
  const acc = [];
  for (const w of look.outfit || []) {
    const it = byId[w.id]; if (!it) continue;
    const c = colorsOfWorn(it, w), wt = W[it.slot] || 0.6;
    for (const [k, f] of [['main', 1], ['second', 0.3], ['accent', 0.12]]) {
      if (!c[k]) continue;
      const e = acc.find((a) => colorDist(a.c, c[k]) < 0.06);
      if (e) e.w += wt * f; else acc.push({ c: c[k], w: wt * f });
    }
  }
  return acc.sort((a, b) => b.w - a.w).slice(0, 8);
}
