// Endless people: coherent random looks for the creator's Randomize and for the
// game's townsfolk (no three.js: works anywhere).
//
//   randomLook(seed, { catalog, style, group, sex, archetype, skinTones, hairStyles, hairColors, lock, base })
//     -> a look (person.js). group: an AGE_GROUPS id; sex 0..1 (or 'boy'/'girl');
//     archetype: a catalogue outfit archetype to start from ('townsfolk', 'player', 'role:chef' ...);
//     lock: { body, face, skin, hair, outfit } keeps those parts of `base` (a look) as they are.
//   presetLook(preset, catalog, o) -> the look for one of the catalogue's outfit presets (body to match)
//   outfitFromPreset(preset) -> the preset's items as worn items
//
// Outfits follow the catalogue's generator rules: one dominant colour, one neutral, one
// accent repeated on two small items (hat, shoes, bag, socks, tie); value contrast
// between top and bottom; at most one patterned main garment; age-appropriate items
// (children in skirts or dresses get built-in shorts, leggings or knee socks).
import { AGE_GROUPS, SLIDERS } from './anatomy.js';
import { rng } from './vmath.js';

const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function hsv(h) {
  const [r, g, b] = hexRgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
const dist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const neutral = (h) => hsv(h)[1] < 0.2;

export const GROUP_AGE = Object.fromEntries(AGE_GROUPS.map((g) => [g.id, g]));
// catalogue age groups -> ours
const CAT_GROUP = { toddler: 'toddler', child: 'child', preteen: 'preteen', teen: 'teen', young_adult: 'young', adult: 'adult', middle_aged: 'middle', elder: 'elder' };
const OUR_TO_CAT = Object.fromEntries(Object.entries(CAT_GROUP).map(([a, b]) => [b, a]));

export function outfitFromPreset(preset) {
  return preset.items.map((i) => ({ id: i.item || i.id, colourway: i.colourway }));
}

// a body for an age group (sliders varied, normal around the age's norm)
export function randomBody(R, group, sex) {
  const g = GROUP_AGE[group] || GROUP_AGE.preteen;
  const gauss = () => (R() + R() + R() - 1.5) / 1.5;
  const b = { age: Math.round(g.range[0] + R() * (g.range[1] - g.range[0])), sex };
  const vary = { height: 0.6, weight: 0.5, muscle: 0.4, shoulders: 0.5, chest: 0.4, waist: 0.4, hips: 0.5, legs: 0.4, arms: 0.3, neck: 0.3, torso: 0.3, head: 0.35, headW: 0.5, headH: 0.4, jaw: 0.5, chin: 0.5, cheeks: 0.5, ears: 0.4, nose: 0.5, noseLen: 0.4, noseUp: 0.5, noseW: 0.4 };
  for (const [k, s] of Object.entries(vary)) { const [lo, hi] = SLIDERS[k]; b[k] = Math.max(lo, Math.min(hi, +(gauss() * s).toFixed(2))); }
  // heavier builds are rarer than slim ones; some people carry a belly as they age
  if (R() < 0.2) b.weight = +(0.4 + R() * 1.2).toFixed(2);
  if (b.age > 35 && R() < 0.35) b.belly = +(R() * 0.7).toFixed(2);
  if (b.age > 65) b.posture = +(R() * 0.5).toFixed(2);
  if (sex > 0.5 && b.age > 13) b.bust = +(0.3 + R() * 0.5).toFixed(2);
  return b;
}

function pick(R, a) { return a[Math.floor(R() * a.length)]; }
function weighted(R, items, w) { const t = items.reduce((s, x) => s + w(x), 0); let r = R() * t; for (const x of items) { r -= w(x); if (r <= 0) return x; } return items[items.length - 1]; }

// uniforms, sleepwear, swimwear, costume and work kit: only through an outfit preset, never mixed in at random
export const ROLE_ONLY = /^(sport_helmet|hard_hat|toque|baker_cap|nurse_cap|head_mirror|oven_mitt|goggles_safety|goggles_swim|safety_vest|lab_coat|chef_jacket|gi_|maid_dress|nurse_dress|coverall|wader_boot|roller_skate|campaign_hat|sailor_cap|peaked_cap|uniform_jacket|apron|festival_robe|gown|tailcoat|top_hat|monocle|backpack_frame|rash_guard|swimsuit|swim_shorts|surf_suit|pyjama|nightgown|sleepsuit|slipper|happi|headdress|tiara|obi|device_gauntlet|aviator_cap|school_cap|foot_wrap|clog|basket|briefcase)/;
// the catalogue's items wearable by this person
function wearable(catalog, group, sex) {
  const cg = OUR_TO_CAT[group];
  return catalog.items.filter((i) => !ROLE_ONLY.test(i.base) && (!i.ages || i.ages.includes(cg)) && (i.gender_line === 'unisex' || (sex > 0.5 ? i.gender_line === 'girl' : i.gender_line === 'boy') || (sex > 0.3 && sex < 0.7)));
}

// colours: a palette for the outfit, then each item's colourway closest to its role's colour
function palette(R, catalog, group) {
  const lib = catalog.colour_library || {};
  const all = Object.values(lib);
  const chroma = all.filter((c) => !neutral(c) && hsv(c)[2] > 0.3);
  const neutrals = all.filter((c) => neutral(c));
  // reds, oranges, pinks and blues are the Pokémon wardrobe; greens and purples rarer
  const dom = weighted(R, chroma, (c) => { const h = hsv(c)[0]; return h < 40 || h > 320 || (h > 190 && h < 250) ? 3 : 1; });
  let acc = weighted(R, chroma, (c) => (Math.abs(hsv(c)[0] - hsv(dom)[0]) > 60 ? 2 : 0.05));
  const kid = ['toddler', 'child', 'preteen'].includes(group);
  // kids: brighter neutrals (white, cream, denim-ish); adults: darker ones
  const neu = pick(R, neutrals.filter((c) => (kid ? hsv(c)[2] > 0.5 : true)).concat(neutrals.length ? [] : ['#f4f2f4']));
  if (R() < 0.25) acc = dom;   // tone on tone sometimes
  return { dom, neu, acc };
}
function colourwayFor(item, want, R) {
  const cws = item.colourways || [];
  if (!cws.length) return { colors: { main: want } };
  let best = 0, bd = Infinity;
  cws.forEach((cw, i) => { const d = dist(cw.colours.main, want) + R() * 20; if (d < bd) { bd = d; best = i; } });
  // close enough: the designed colourway; otherwise its look in our colour
  return bd < 90 ? { colourway: cws[best].name } : { colourway: cws[best].name, colors: { main: want } };
}

const SMALL = ['hat', 'shoes', 'bag', 'legwear', 'neckwear', 'hair_acc', 'belt', 'wrist'];

// what the weather asks for: cold-weather and hot-weather things don't mix
const COLD = /down_|parka|duffle|peacoat|snow_boot|beanie|trapper|mittens|scarf|fleece|leg_warmers|toque/;
const HOT = /sandal|shorts|tank|sun_hat|straw_hat|visor|swim|ballet_flat/;
export function randomOutfit(R, catalog, group, sex, o = {}) {
  const season = o.season || weighted(R, ['mild', 'warm', 'cold'], (x) => ({ mild: 0.6, warm: 0.25, cold: 0.15 }[x]));
  const fits = (i) => (season === 'cold' ? !HOT.test(i.base) : season === 'warm' ? !COLD.test(i.base) : !COLD.test(i.base) || R() < 0.15);
  const items = wearable(catalog, group, sex).filter(fits), by = (slot) => items.filter((i) => i.slot === slot);
  const pal = palette(R, catalog, group);
  const out = [];
  const add = (item, role) => { if (!item) return; const want = role === 'dom' ? pal.dom : role === 'acc' ? pal.acc : pal.neu; out.push({ id: item.id, ...colourwayFor(item, want, R) }); };
  const solidFirst = (arr) => weighted(R, arr, (i) => (!i.pattern || i.pattern.type === 'solid' ? 3 : 1));
  // a dress (or one-piece) or a top with bottoms
  const girlish = sex > 0.5;
  const dresses = by('dress');
  let skirted = false;
  if (dresses.length && R() < (girlish ? 0.35 : 0.03)) { const d = solidFirst(dresses); add(d, 'dom'); skirted = true; }
  else {
    const tops = by('top'), bottoms = by('bottom').filter((b) => girlish || !/skirt|skort|culottes/.test(b.base));
    const top = tops.length && solidFirst(tops), bottom = bottoms.length && weighted(R, bottoms, (b) => (/skirt|skort/.test(b.base) ? (girlish ? 1.2 : 0) : 1));
    // value contrast: the darker garment takes the neutral
    add(top, 'dom'); add(bottom, 'neu');
    if (bottom && /skirt|skort/.test(bottom.base)) skirted = true;
  }
  if (R() < (season === 'cold' ? 0.9 : season === 'warm' ? 0.08 : 0.3)) { const outs = by('outer'); if (outs.length) add(solidFirst(outs), R() < 0.5 ? 'neu' : 'dom'); }
  // legwear: children in skirts always get something under them
  const kid = ['toddler', 'child', 'preteen', 'teen'].includes(group);
  const legs = by('legwear');
  if (legs.length && ((skirted && kid) || R() < 0.45)) add(pick(R, skirted && kid ? legs.filter((l) => /tights|leggings|knee|socks/.test(l.base + l.id)) .concat(legs).slice(0, 6) : legs), R() < 0.5 ? 'acc' : 'neu');
  const shoes = by('shoes'); if (shoes.length) add(pick(R, shoes), 'acc');
  // small accents: the accent colour on two of them
  let accents = 0;
  for (const slot of ['hat', 'bag', 'neckwear', 'hair_acc', 'eyewear', 'wrist', 'belt']) {
    const p = { hat: 0.45, bag: 0.4, neckwear: 0.12, hair_acc: girlish ? 0.4 : 0.05, eyewear: group === 'elder' || group === 'middle' ? 0.45 : 0.1, wrist: 0.15, belt: 0.1 }[slot];
    const pool = by(slot); if (!pool.length || R() > p) continue;
    add(pick(R, pool), accents++ < 2 ? 'acc' : 'neu');
  }
  return out;
}

export function presetLook(preset, catalog, o = {}) {
  const R = rng(o.seed ?? 1);
  const group = CAT_GROUP[preset.age_group] || 'teen';
  const sex = preset.presentation === 'girl' ? 1 : preset.presentation === 'boy' ? 0 : (R() < 0.5 ? 0 : 1);
  return { body: randomBody(R, group, sex), outfit: outfitFromPreset(preset), name: preset.name, preset: preset.id };
}

export function randomLook(seed = Date.now(), o = {}) {
  const R = rng(seed >>> 0), catalog = o.catalog, base = o.base || {}, lock = o.lock || {};
  const group = o.group || weighted(R, AGE_GROUPS.map((g) => g.id), (g) => ({ toddler: 0.6, child: 1, preteen: 1.2, teen: 1.2, young: 1.2, adult: 1.2, middle: 1, elder: 0.8 }[g]));
  const sex = typeof o.sex === 'number' ? o.sex : o.sex === 'girl' ? 1 : o.sex === 'boy' ? 0 : (R() < 0.5 ? 0 : 1);
  const look = { seed };
  look.body = lock.body && base.body ? base.body : randomBody(R, group, sex);
  // skin
  const tones = o.skinTones || ((o.style && o.style.anime && o.style.anime.skin && o.style.anime.skin.tones) || []).map((t) => t.base);
  look.skin = lock.skin && base.skin ? base.skin : { tone: tones.length ? (typeof tones[0] === 'string' ? pick(R, tones) : pick(R, tones).tone || pick(R, tones).base) : '#f6d2b8' };
  // hair: natural colours mostly, an anime colour about one person in four
  if (lock.hair && base.hair) look.hair = base.hair;
  else {
    const styles = (o.hairStyles || []).filter((s) => (!s.ages || s.ages.includes(group) || s.ages.includes(OUR_TO_CAT[group])) && (!s.sexes || s.sexes.includes(sex > 0.5 ? 'f' : 'm') || s.sexes.includes(sex > 0.5 ? 'girl' : 'boy')));
    const cols = o.hairColors || [];
    const natural = cols.filter((c) => !c.anime), anime = cols.filter((c) => c.anime);
    const col = (R() < 0.25 && anime.length ? pick(R, anime) : natural.length ? pick(R, natural) : null);
    look.hair = { style: styles.length ? pick(R, styles).id : undefined, color: col ? col.color || col.base || col.hex : group === 'elder' ? '#d8d6d2' : pick(R, ['#2b2322', '#4a3220', '#6b4426', '#a0682f', '#d9b066']) };
  }
  look.face = lock.face && base.face ? base.face : (o.faceDefaults ? o.faceDefaults(look.body, R) : {});
  look.underwear = base.underwear || { style: 'tank', color: '#f2f0ee' };
  if (lock.outfit && base.outfit) look.outfit = base.outfit;
  else if (catalog) {
    // a catalogue preset for this age and presentation about a third of the time (or when an archetype is asked for)
    const pres = catalog.outfits.filter((p) => CAT_GROUP[p.age_group] === group && (p.presentation === 'unisex' || (p.presentation === 'girl') === (sex > 0.5)) && (!o.archetype || p.archetype.startsWith(o.archetype)));
    if (pres.length && (o.archetype || R() < 0.33)) { const p = pick(R, pres); look.outfit = outfitFromPreset(p); look.preset = p.id; }
    else look.outfit = randomOutfit(R, catalog, group, sex, o);
  }
  return look;
}
export { hsv, rgbHex, hexRgb };
