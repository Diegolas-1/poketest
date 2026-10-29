// The creator's Randomize, on top of the generator the game uses (../random.js:
// coherent outfits from catalog.json's generator rules, bodies by age group,
// skin, hair). Every random look has a seed, so the same seed with the same
// options and locks gives the same person; the creator shows it and takes one.
// This file only adds what the creator offers beyond the core generator: the
// lists from skin.js and hair.js passed in (with the creator's fallbacks), an
// underwear lock and roll, and the face options rolled when skin.js has no
// faceDefaults yet.
//
// rollLook(seed, look, catalog, { locks: Set(body, skin, face, hair, outfit,
// underwear), group, sex, archetype }) -> a new look (look.seed = seed)
// rollBody / rollOutfit: one part only, with a new seed.
import * as CORE from '../random.js';
import { rng } from '../vmath.js';
import { SKIN, groupOf, faceOptions, skinTones, hairStyles, hairColors, underwearStyles, facialStyles } from './data.js';

export const newSeed = () => (Math.random() * 0x7fffffff) >>> 0;
const pick = (R, a) => a[Math.floor(R() * a.length)];
const NATURAL = /black|brown|chestnut|auburn|ginger|honey|blond|platinum|grey|gray|white|copper|dark|light|sand|ash|silver/i;

function hairColorsFlagged() {
  return hairColors().map((c) => ({ ...c, anime: c.anime ?? (c.natural !== undefined ? !c.natural : !NATURAL.test(c.name)) }));
}
function faceRoll(body, R) {
  if (typeof SKIN.faceDefaults === 'function') {
    try { const d = SKIN.faceDefaults(body, R); if (d && typeof d === 'object') return d; } catch (e) { console.warn('faceDefaults', e); }
  }
  const face = {};
  for (const o of faceOptions()) {
    if (o.kind === 'choice') face[o.key] = pick(R, o.options).id;
    else if (o.kind === 'color') face[o.key] = pick(R, o.options).color;
    else if (o.kind === 'toggle') face[o.key] = R() < 0.25;
    else if (o.kind === 'range') face[o.key] = +Math.max(o.min, Math.min(o.max, (o.def ?? 0) + (R() - 0.5) * (o.max - o.min) * 0.4)).toFixed(2);
  }
  return face;
}
const UNDER_COLS = ['#f2f0ee', '#f4f2f4', '#cfdfee', '#eec4d1', '#f4e0a2', '#9bcbbd', '#a8aad2', '#c8c6c9'];
function underwearRoll(body, R) {
  const st = underwearStyles();
  const want = body.age < 13 ? ['tank', 'suit', 'tee'] : body.sex > 0.5 ? ['sport', 'suit', 'tank'] : ['tee', 'tank'];
  const ok = st.filter((s) => want.includes(s.id));
  return { style: pick(R, ok.length ? ok : st).id, color: pick(R, UNDER_COLS), trim: pick(R, ['#9fb6d8', '#de626c', '#2b3554', '#86977f', '#e4b730']) };
}

export function rollLook(seed, look, catalog, o = {}) {
  const L = o.locks || new Set();
  const lock = { body: L.has('body'), face: L.has('face'), skin: L.has('skin'), hair: L.has('hair'), outfit: L.has('outfit') };
  // an age group asked for overrides the body lock's age group
  const group = o.group || (lock.body && look.body ? groupOf(look.body.age).id : undefined);
  const sex = o.sex ?? (lock.body && look.body ? look.body.sex : undefined);
  const next = CORE.randomLook(seed, {
    catalog, group, sex, archetype: o.archetype, lock, base: look,
    skinTones: skinTones().map((t) => t.color), hairStyles: hairStyles(), hairColors: hairColorsFlagged(), faceDefaults: faceRoll,
  });
  if (lock.body && look.body && o.group && groupOf(look.body.age).id !== o.group) next.body = { ...look.body, age: CORE.randomBody(rng(seed ^ 0x5bd1), o.group, look.body.sex).age };
  const R = rng((seed ^ 0x2545f491) >>> 0);
  next.underwear = L.has('underwear') && look.underwear ? look.underwear : underwearRoll(next.body, R);
  // facial hair: some grown men (the elder beard for the old only)
  if (!lock.hair && next.hair) {
    const fs = facialStyles().filter((f) => f.id !== 'none' && (next.body.age >= 60 || !/elder/.test(f.id)));
    next.hair.facial = next.body.age >= 18 && next.body.sex < 0.5 && fs.length && R() < 0.3 ? pick(R, fs).id : 'none';
  }
  if (lock.face && look.face) next.face = look.face;
  next.name = look.name;
  next.seed = seed;
  return next;
}
export function rollBody(look, seed = newSeed()) {
  const g = groupOf(look.body.age).id;
  return { ...look, body: CORE.randomBody(rng(seed), g, look.body.sex), seed: undefined };
}
export function rollOutfit(look, catalog, seed = newSeed()) {
  return { ...look, outfit: CORE.randomOutfit(rng(seed), catalog, groupOf(look.body.age).id, look.body.sex), seed: undefined };
}
export function presetLook(preset, catalog, look, seed = newSeed()) {
  const p = CORE.presetLook(preset, catalog, { seed });
  // the preset's hair suggestion ("short side-swept, dark brown") matched to the hair lists
  const hair = { ...(look.hair || {}) };
  const words = String(preset.hair_suggestion || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const score = (s) => words.filter((w) => `${s.id} ${s.name} ${(s.tags || []).join(' ')}`.toLowerCase().includes(w)).length;
  const styles = hairStyles();
  if (styles.length && words.length) { const best = styles.reduce((a, b) => (score(b) > score(a) ? b : a), styles[0]); if (score(best)) hair.style = best.id; }
  const cols = hairColors(); const c = cols.find((x) => words.some((w) => x.name.toLowerCase().includes(w)));
  if (c) hair.color = c.color;
  return { ...look, body: p.body, outfit: p.outfit, preset: p.preset, hair, face: look.face, name: look.name, seed: undefined };
}
export const outfitFromPreset = CORE.outfitFromPreset;
