// The hair catalogue for generated people (data only; hairgen.js builds it):
//
//   HAIR_STYLES   [{ id, name, ages: [min, max], sexes: [0 boy/man, 1 girl/woman], tags, params }]
//   HAIR_COLORS   [{ id, name, base, shade, hi?, natural }] (style.json anime.hair.colours: blacks are
//                 tinted, shade = base darkened and warmed, hi = the highlight band's colour)
//   FACIAL_STYLES [{ id, name, kind, params }] (adults only)
//   FRINGES       bangs presets by name: none, straight, blunt, side, parted, curtain, spiky,
//                 choppy, wispy, long, short, puffy
//
// A style's params are parts, each optional (sizes in head heights, `to` heights in head
// heights from the chin, negative below it; az round the head from the front, + to the
// person's left; el up from the horizontal, radians):
//   cap     { t (thickness), top, back (extra on top / at the back), line: std | low | high |
//            horseshoe | none, front (moves the front hairline), nape }
//   fringe  { kind (FRINGES) + any preset field: n, spread, el, to / toSide (tip heights above
//            the eye line in front / at the sides), w, flat, prof, sweep, fan, parted, ... }
//   sides   { n, to, w, flare, az0, az1, el0, el1, sweep, prof, hug, grav }   locks in front of / over the ears
//   back    { n, to, w, flare, rows, el, el2, to2, prof, mid }                clumps round the back to the nape
//   crown   { n, len, up, w, az, el, ring, flat, grav }                       spikes round a whorl
//   top     { flow: back | side | up | forward, n, len, w, lift, spread, el, to, hug }   flows over the top
//   mohawk  { n, len, w }
//   fall    { n, to, w, flat, front (locks before the shoulders), el, az0, fan, v, wave }   long hair down the back
//   tails   [{ az, el, to, n, w, lift, flare, dir, tie }]   ponytails / twin tails (dir: start direction)
//   braids  [{ az, el, to, w }]   buns [{ az, el, r, tie }]   puffs [{ az, el, r }]
//   loops   { r, w, az, el }   afro { r, bumps }   curls { r, n }   ahoge (true | { az, el, w })
//   spiky (0..1), vol (volume multiplier), highlight (the anime highlight band), color (default),
//   part (left | right), verts (vertex budget)

export const FRINGES = {
  none: { n: 0 },
  straight: { n: 8, spread: 0.85, to: 0.13, toSide: 0.02, w: 0.1, prof: 'blunt', fan: 0.08, vary: 0.04, jitter: 0.04, flick: 0 },
  blunt: { n: 9, spread: 0.9, to: 0.12, toSide: 0.1, w: 0.1, prof: 'blunt', fan: 0.02, vary: 0.0, jitter: 0.0, flick: 0, flat: 0.38 },
  side: { n: 6, spread: 0.8, to: 0.12, toSide: 0.0, sweep: 0.65, longSide: 0.12, w: 0.13, fan: 0.15, vary: 0.12 },
  parted: { n: 6, spread: 0.85, parted: true, partSweep: 0.75, centre: 0.2, to: 0.12, toSide: -0.04, w: 0.12, fan: 0.1 },
  curtain: { n: 6, spread: 0.85, parted: true, partSweep: 1.0, centre: 0.3, to: 0.04, toSide: -0.2, w: 0.13, fan: 0.1 },
  spiky: { n: 5, spread: 0.8, to: 0.12, toSide: -0.02, w: 0.15, fan: 0.35, vary: 0.3, flick: 0.12, bulge: 0.8 },
  choppy: { n: 7, spread: 0.85, to: 0.12, toSide: -0.04, w: 0.12, fan: 0.4, vary: 0.35, jitter: 0.25, flick: 0.1 },
  wispy: { n: 9, spread: 0.85, to: 0.13, toSide: -0.03, w: 0.075, vary: 0.35, jitter: 0.3, fan: 0.2 },
  long: { n: 6, spread: 0.85, parted: true, partSweep: 0.3, centre: 0.1, to: 0.1, toSide: -0.38, w: 0.13 },
  short: { n: 6, spread: 0.75, to: 0.25, toSide: 0.17, w: 0.12, vary: 0.2, fan: 0.2 },
  puffy: { n: 4, spread: 0.7, to: 0.15, toSide: 0.02, w: 0.2, flat: 0.55, bulge: 1.2, lift: 0.05, fan: 0.25 },
};

export const HAIR_COLORS = [
  // natural (style.json anime.hair.colours.natural)
  { id: 'black', name: 'Blue-black (Ash)', base: '#22303A', shade: '#0E1A20', hi: '#4A6070', natural: true },
  { id: 'soft_black', name: 'Soft black', base: '#2B2422', shade: '#151010', hi: '#5A4C48', natural: true },
  { id: 'dark_brown', name: 'Dark brown', base: '#4A3102', shade: '#2E1F08', hi: '#7A5A2A', natural: true },
  { id: 'brown', name: 'Brown', base: '#884A34', shade: '#5A2E22', hi: '#B87A60', natural: true },
  { id: 'chestnut', name: 'Chestnut', base: '#81433A', shade: '#5A2C28', hi: '#B07468', natural: true },
  { id: 'light_brown', name: 'Light brown', base: '#A8743F', shade: '#74492A', hi: '#D2A274', natural: true },
  { id: 'auburn', name: 'Auburn', base: '#9E471C', shade: '#6A3723', hi: '#D07A50', natural: true },
  { id: 'red_brown', name: 'Red-brown', base: '#8E231D', shade: '#4B1214', hi: '#C05048', natural: true },
  { id: 'ginger', name: 'Ginger', base: '#D2692A', shade: '#963E1C', hi: '#F2A060', natural: true },
  { id: 'strawberry', name: 'Strawberry blonde', base: '#E39A62', shade: '#B0683E', hi: '#F8C69A', natural: true },
  { id: 'blonde', name: 'Blonde', base: '#F2CF6B', shade: '#C99A3E', hi: '#FFF0B0', natural: true },
  { id: 'light_blonde', name: 'Light blonde', base: '#E8D08C', shade: '#B89A5E', hi: '#FFF4CC', natural: true },
  { id: 'platinum', name: 'Platinum', base: '#F0E8D0', shade: '#C2B698', hi: '#FFFFF4', natural: true },
  { id: 'ash_brown', name: 'Ash brown', base: '#7A6656', shade: '#4E4038', hi: '#A8988A', natural: true },
  { id: 'salt_pepper', name: 'Salt and pepper', base: '#77736F', shade: '#4C4846', hi: '#A8A4A0', natural: true },
  { id: 'grey', name: 'Grey', base: '#B2ADA1', shade: '#7F776D', hi: '#DCD8D0', natural: true },
  { id: 'silver', name: 'Silver', base: '#C9CDD4', shade: '#8E94A4', hi: '#F0F2F6', natural: true },
  { id: 'white', name: 'White', base: '#E8E8E8', shade: '#B8B8C0', hi: '#FFFFFF', natural: true },
  // anime colours (style.json anime.hair.colours.unnatural_anime)
  { id: 'misty_orange', name: 'Orange (Misty)', base: '#F57B14', shade: '#B4520E', hi: '#FFB060', natural: false },
  { id: 'joy_pink', name: 'Pink-red (Joy)', base: '#F83E3C', shade: '#B82830', hi: '#FF8A86', natural: false },
  { id: 'pink', name: 'Pink', base: '#F48FB1', shade: '#C2607F', hi: '#FFC8DA', natural: false },
  { id: 'magenta', name: 'Crimson-magenta', base: '#C0263E', shade: '#7A0C18', hi: '#F0A0C0', natural: false },
  { id: 'jenny_teal', name: 'Teal (Jenny)', base: '#2B9296', shade: '#1E5E66', hi: '#6CC8C8', natural: false },
  { id: 'mint', name: 'Mint', base: '#7FD1B9', shade: '#4E9C88', hi: '#C4F2E4', natural: false },
  { id: 'lavender', name: 'Lavender', base: '#A99BD8', shade: '#7565A8', hi: '#DCD4F6', natural: false },
  { id: 'periwinkle', name: 'Periwinkle', base: '#8A88AF', shade: '#585A71', hi: '#BEBCDC', natural: false },
  { id: 'blue_black', name: 'Blue-black (glossy)', base: '#3B409E', shade: '#2A2464', hi: '#7890D6', natural: false },
  { id: 'navy', name: 'Navy', base: '#2A3A6E', shade: '#18224A', hi: '#5A70B0', natural: false },
  { id: 'sky_blue', name: 'Sky blue', base: '#6FB7E8', shade: '#3F7FB8', hi: '#B8E2FF', natural: false },
  { id: 'purple', name: 'Purple', base: '#7A3FB8', shade: '#4A2580', hi: '#B080E8', natural: false },
  { id: 'dark_green', name: 'Dark green', base: '#1F3B32', shade: '#0E1E1A', hi: '#4A7A68', natural: false },
  { id: 'green', name: 'Leaf green', base: '#5FA845', shade: '#3A7030', hi: '#9AD880', natural: false },
  { id: 'olive', name: 'Olive', base: '#5A6040', shade: '#383C26', hi: '#8A9068', natural: false },
  { id: 'crimson', name: 'Crimson', base: '#B3212F', shade: '#74101C', hi: '#E86070', natural: false },
];

export const FACIAL_STYLES = [
  { id: 'none', name: 'None', kind: 'none' },
  { id: 'stubble', name: 'Stubble', kind: 'stubble' },
  { id: 'mustache', name: 'Mustache', kind: 'mustache', params: { mw: 0.05, wide: 0.3, droop: 0.05 } },
  { id: 'walrus', name: 'Walrus mustache', kind: 'mustache', params: { mw: 0.075, wide: 0.36, droop: 0.1 } },
  { id: 'goatee', name: 'Goatee', kind: 'goatee', params: { mustache: true, len: 0.1, mw: 0.04 } },
  { id: 'full_beard', name: 'Full beard', kind: 'beard', params: { t: 0.032, mw: 0.05 } },
  { id: 'short_beard', name: 'Short beard', kind: 'beard', params: { t: 0.022, mw: 0.04 } },
  { id: 'mutton_chops', name: 'Mutton chops', kind: 'chops', params: { t: 0.025 } },
  { id: 'elder_beard', name: 'Long elder beard', kind: 'long', params: { t: 0.04, mw: 0.06, len: 0.75 } },
];

// colours: an id from HAIR_COLORS or any '#rrggbb'
const hex2 = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2 = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
// darker and a little warmer (shade = base x 0.6-0.78, hue towards red)
export function shadeOf(h, k = 0.68) { const [r, g, b] = hex2(h); return rgb2([r * k * 1.04, g * k * 0.97, b * k * 1.0]); }
// the highlight: lighter, a little less saturated
export function lightOf(h, k = 0.3) { const [r, g, b] = hex2(h); const m = (r + g + b) / 3; return rgb2([r, g, b].map((v) => v + (255 - v) * k + (m - v) * 0.1)); }
export function hairColor(c) {
  if (c && typeof c === 'object') return { base: c.base, shade: c.shade || shadeOf(c.base), hi: c.hi || lightOf(c.base) };
  const t = HAIR_COLORS.find((x) => x.id === c);
  if (t) return { base: t.base, shade: t.shade, hi: t.hi || lightOf(t.base) };
  const h = typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#884A34';
  return { base: h, shade: shadeOf(h), hi: lightOf(h) };
}

const ALL = [0, 1], M = [0], F = [1];
const ANY = [2, 90];
export const HAIR_STYLES = [
  // ---- short ----
  { id: 'bald', name: 'Bald', ages: [20, 90], sexes: M, tags: ['bald'], params: {} },
  { id: 'buzz', name: 'Buzz cut', ages: ANY, sexes: ALL, tags: ['short', 'buzz'], params: { cap: { t: 0.016, top: 0.006, back: 0.004, line: 'low' } } },
  { id: 'crew', name: 'Crew cut', ages: ANY, sexes: M, tags: ['short'], params: { cap: { t: 0.04, top: 0.03, back: 0.01 }, fringe: { kind: 'short', w: 0.11 }, back: { n: 6, to: 0.12, w: 0.13, flare: 0.08, lift: 0.0 } } },
  { id: 'spiky_ash', name: 'Spiky (trainer)', ages: [5, 40], sexes: M, tags: ['spiky', 'cap'], params: { spiky: 0.5, cap: { t: 0.08, top: 0.05 }, fringe: { kind: 'spiky' }, sides: { n: 2, to: 0.3, w: 0.15, flare: 0.6 }, back: { n: 5, to: 0.08, w: 0.17, flare: 0.5, sideFlare: 0.8 }, crown: { n: 7, len: 0.24, up: 0.35, w: 0.13, el: 1.05 } } },
  { id: 'messy_spikes', name: 'Messy spikes', ages: [5, 50], sexes: ALL, tags: ['spiky'], params: { spiky: 0.75, cap: { t: 0.08, top: 0.05 }, fringe: { kind: 'choppy' }, sides: { n: 2, to: 0.28, w: 0.13, flare: 0.5 }, back: { n: 6, to: 0.06, w: 0.15, flare: 0.55, sideFlare: 0.8 }, crown: { n: 12, len: 0.3, up: 0.45, w: 0.12, el: 1.1, ring: 0.45 } } },
  { id: 'radial_spikes', name: 'Radial spikes (Brock)', ages: [10, 60], sexes: M, tags: ['spiky'], params: { spiky: 0.6, cap: { t: 0.06, top: 0.05 }, crown: { n: 16, len: 0.36, up: 0.75, w: 0.12, el: 1.25, az: 0.4, ring: 0.6 }, fringe: { kind: 'short', n: 5 }, back: { n: 6, to: 0.16, w: 0.12, flare: 0.2 } } },
  { id: 'rival_swept', name: 'Swept-back spikes (rival)', ages: [10, 50], sexes: M, tags: ['spiky'], params: { spiky: 0.7, cap: { t: 0.08, top: 0.06 }, top: { flow: 'up', n: 5, len: 0.6, lift: 0.18, up: 0.7, w: 0.14, hug: 0.2 }, crown: { n: 10, len: 0.42, up: 0.5, w: 0.13, el: 1.0, ring: 0.5 }, sides: { n: 2, to: 0.32, flare: 0.5, sweep: -0.6 }, back: { n: 5, to: 0.06, flare: 0.5 } } },
  { id: 'swept_side', name: 'Side part', ages: ANY, sexes: M, tags: ['neat'], params: { cap: { t: 0.06, top: 0.04 }, top: { flow: 'side', n: 6, len: 0.75, w: 0.13 }, fringe: { kind: 'side', n: 5, to: 0.2 }, sides: { n: 2, to: 0.36, w: 0.11, flare: 0.05 }, back: { n: 6, to: 0.12, w: 0.14, flare: 0.08 } } },
  { id: 'centre_part', name: 'Centre part', ages: [7, 70], sexes: ALL, tags: ['neat'], params: { cap: { t: 0.065, top: 0.04 }, fringe: { kind: 'parted' }, sides: { n: 2, to: 0.28, w: 0.12 }, back: { n: 6, to: 0.06, w: 0.15 } } },
  { id: 'curtains', name: 'Curtains', ages: [10, 50], sexes: ALL, tags: ['neat'], params: { cap: { t: 0.07, top: 0.04 }, fringe: { kind: 'curtain' }, sides: { n: 2, to: 0.18, w: 0.13 }, back: { n: 6, to: 0.02, w: 0.16 } } },
  { id: 'bowl', name: 'Bowl cut', ages: [2, 30], sexes: ALL, tags: ['round'], params: { cap: { t: 0.085, top: 0.05, back: 0.03 }, fringe: { kind: 'blunt', to: 0.16, toSide: 0.14 }, sides: { n: 3, to: 0.3, w: 0.13, prof: 'blunt', flare: 0, grav: 0.4, az0: 0.95, az1: 1.55 }, back: { n: 8, to: 0.2, w: 0.14, prof: 'blunt', flare: 0.02 } } },
  { id: 'mushroom', name: 'Mushroom bob', ages: [2, 40], sexes: ALL, tags: ['round'], params: { vol: 1.1, cap: { t: 0.1, top: 0.07, back: 0.05 }, fringe: { kind: 'blunt', to: 0.14, toSide: 0.04, w: 0.11 }, sides: { n: 3, to: 0.14, w: 0.15, prof: 'blunt', flare: -0.15, az0: 0.95, az1: 1.55 }, back: { n: 8, to: 0.1, w: 0.16, prof: 'blunt', flare: -0.1 } } },
  { id: 'quiff', name: 'Quiff', ages: [10, 60], sexes: M, tags: ['styled'], params: { cap: { t: 0.04, top: 0.04, back: 0.01 }, top: { flow: 'up', n: 4, len: 0.55, lift: 0.14, up: 0.8, w: 0.15, spread: 0.45, hug: 0.4 }, sides: { n: 1, to: 0.4, w: 0.1, flare: 0 }, back: { n: 5, to: 0.14, w: 0.12, flare: 0.05 } } },
  { id: 'pompadour', name: 'Pompadour', ages: [14, 70], sexes: M, tags: ['styled', 'glossy'], params: { cap: { t: 0.045, top: 0.05 }, top: { flow: 'up', n: 5, len: 0.85, lift: 0.22, up: 1.1, w: 0.17, spread: 0.5, hug: 0.5, grav: 0.2 }, sides: { n: 2, to: 0.36, w: 0.1, sweep: -0.7, flare: 0 }, back: { n: 5, to: 0.1, w: 0.13, flare: 0.05 } } },
  { id: 'slicked_back', name: 'Slicked back', ages: [14, 90], sexes: ALL, tags: ['styled', 'glossy'], params: { highlight: true, cap: { t: 0.045, top: 0.03 }, top: { flow: 'back', n: 7, len: 1.0, lift: 0.0, w: 0.12, hug: 1, grav: 0.1 }, back: { n: 5, to: 0.06, w: 0.13, flare: 0.08 } } },
  { id: 'mohawk', name: 'Soft mohawk', ages: [8, 50], sexes: ALL, tags: ['spiky', 'bold'], params: { cap: { t: 0.016, top: 0.005, back: 0.004 }, mohawk: { n: 7, len: 0.24, w: 0.13 } } },
  { id: 'pixie', name: 'Pixie', ages: [5, 80], sexes: F, tags: ['short'], params: { cap: { t: 0.06, top: 0.05 }, fringe: { kind: 'wispy', sweep: 0.4, n: 7 }, sides: { n: 2, to: 0.34, w: 0.1, flare: 0.1 }, back: { n: 6, to: 0.14, w: 0.13, flare: 0.1 } } },
  { id: 'ear_shag', name: 'Ear-length shag', ages: [8, 60], sexes: ALL, tags: ['layered'], params: { spiky: 0.2, cap: { t: 0.08, top: 0.05 }, fringe: { kind: 'wispy' }, sides: { n: 3, to: 0.27, w: 0.12, flare: 0.25, az0: 0.95 }, back: { n: 7, to: 0.04, w: 0.14, flare: 0.3, rows: 2 } } },
  { id: 'toddler_tuft', name: 'Toddler tuft', ages: [2, 5], sexes: ALL, tags: ['short', 'kid'], params: { cap: { t: 0.025, top: 0.015, back: 0.01, line: 'low' }, crown: { n: 3, len: 0.18, up: 0.85, w: 0.09, el: 1.3, az: 0.2, ring: 0.12, grav: 0.3 }, fringe: { kind: 'short', n: 4, to: 0.28, w: 0.1 } } },
  // ---- curly ----
  { id: 'afro', name: 'Afro', ages: ANY, sexes: ALL, tags: ['curly', 'round'], params: { cap: { t: 0.05 }, afro: { r: 1, bumps: 34 }, verts: 8000 } },
  { id: 'afro_puffs', name: 'Afro puffs', ages: [2, 40], sexes: F, tags: ['curly', 'round'], params: { cap: { t: 0.035, top: 0.01 }, puffs: [{ az: 1.4, el: 0.85, r: 0.26 }, { az: -1.4, el: 0.85, r: 0.26 }], tie: '#f2c040' } },
  { id: 'short_curls', name: 'Short curls', ages: ANY, sexes: ALL, tags: ['curly'], params: { cap: { t: 0.06, top: 0.04 }, curls: { r: 0.09, n: 60 }, fringe: { kind: 'short', n: 5, to: 0.22, w: 0.1, flat: 0.6 } } },
  { id: 'long_curls', name: 'Long curls', ages: [5, 70], sexes: F, tags: ['curly', 'long'], params: { cap: { t: 0.07, top: 0.04 }, curls: { r: 0.08, n: 50 }, fall: { n: 8, to: -0.9, w: 0.2, flat: 0.5, wave: 0.05, front: 1 }, sides: { n: 2, to: -0.2, w: 0.15, flare: 0.1 }, fringe: { kind: 'parted', w: 0.12 }, verts: 8000 } },
  // ---- bobs ----
  { id: 'bob', name: 'Bob', ages: [3, 80], sexes: F, tags: ['bob'], params: { cap: { t: 0.08, top: 0.05, back: 0.04 }, fringe: { kind: 'straight' }, sides: { n: 3, to: 0.06, w: 0.14, prof: 'blunt', flare: -0.05, az0: 0.95, az1: 1.5 }, back: { n: 8, to: 0.0, w: 0.16, prof: 'blunt', flare: -0.05 } } },
  { id: 'ahoge_bob', name: 'Bob with ahoge', ages: [5, 40], sexes: F, tags: ['bob', 'cute'], params: { ahoge: true, cap: { t: 0.075, top: 0.05, back: 0.04 }, fringe: { kind: 'wispy' }, sides: { n: 2, to: 0.12, w: 0.14, flare: 0.05, az0: 1.0, az1: 1.45 }, back: { n: 7, to: 0.06, w: 0.16, flare: 0.1 } } },
  { id: 'erika_bob', name: 'Glossy bob', ages: [10, 60], sexes: F, tags: ['bob', 'glossy'], params: { highlight: true, color: 'blue_black', cap: { t: 0.08, top: 0.05, back: 0.04 }, fringe: { kind: 'blunt' }, sides: { n: 3, to: 0.02, w: 0.14, prof: 'blunt', flare: 0, az0: 0.95, az1: 1.5 }, back: { n: 8, to: -0.02, w: 0.16, prof: 'blunt' } } },
  { id: 'lob', name: 'Long bob', ages: [8, 80], sexes: F, tags: ['bob'], params: { cap: { t: 0.075, top: 0.05 }, fringe: { kind: 'side' }, sides: { n: 3, to: -0.2, w: 0.14, flare: 0.08, az0: 0.95, az1: 1.5 }, back: { n: 8, to: -0.28, w: 0.17, flare: 0.08 } } },
  { id: 'jenny', name: 'Flared shoulder-length (Jenny)', ages: [14, 60], sexes: F, tags: ['spiky', 'bold'], params: { spiky: 0.45, color: 'jenny_teal', cap: { t: 0.09, top: 0.06, back: 0.05 }, fringe: { kind: 'spiky', n: 5 }, sides: { n: 3, to: -0.05, w: 0.15, flare: 0.5, az0: 1.0, az1: 1.6 }, back: { n: 7, to: -0.28, w: 0.18, flare: 0.5 } } },
  { id: 'layered', name: 'Layered (face-framing)', ages: [12, 70], sexes: ALL, tags: ['layered'], params: { cap: { t: 0.07, top: 0.05 }, fringe: { kind: 'long' }, sides: { n: 2, to: -0.08, w: 0.13, flare: 0.1, az0: 1.1 }, back: { n: 7, to: -0.1, w: 0.16, flare: 0.15, rows: 2 } } },
  // ---- long ----
  { id: 'long_straight', name: 'Long straight', ages: [4, 80], sexes: F, tags: ['long', 'glossy'], params: { cap: { t: 0.07, top: 0.04 }, fringe: { kind: 'straight' }, sides: { n: 2, to: -0.25, w: 0.14, az0: 1.0, az1: 1.3, flare: 0.02 }, fall: { n: 7, to: -1.4, w: 0.22 }, verts: 8000 } },
  { id: 'hime', name: 'Hime cut', ages: [6, 60], sexes: F, tags: ['long', 'glossy'], params: { highlight: true, cap: { t: 0.07, top: 0.04 }, fringe: { kind: 'blunt' }, sides: { n: 2, to: 0.0, w: 0.13, prof: 'blunt', az0: 1.0, az1: 1.25, flare: -0.05, grav: 0.8 }, fall: { n: 7, to: -1.6, w: 0.22, prof: 'blunt', v: 0 }, verts: 8000 } },
  { id: 'long_wavy', name: 'Long wavy', ages: [8, 80], sexes: F, tags: ['long'], params: { cap: { t: 0.08, top: 0.05 }, fringe: { kind: 'side' }, sides: { n: 2, to: -0.4, w: 0.15, az0: 1.0, az1: 1.3, flare: 0.1 }, fall: { n: 8, to: -1.3, w: 0.22, wave: 0.06, front: 1 }, verts: 8000 } },
  { id: 'long_layered', name: 'Long layered (Jessie-ish)', ages: [14, 70], sexes: F, tags: ['long', 'glossy', 'bold'], params: { vol: 1.15, spiky: 0.2, cap: { t: 0.09, top: 0.07, back: 0.06 }, top: { flow: 'back', n: 5, len: 0.9, lift: 0.08, w: 0.15, hug: 0.6 }, sides: { n: 2, to: -0.5, w: 0.17, flare: 0.25, az0: 1.2, az1: 1.5 }, fall: { n: 8, to: -1.8, w: 0.26, flare: 0.08 }, verts: 8000 } },
  { id: 'jenny_volume', name: 'Big voluminous', ages: [14, 70], sexes: F, tags: ['long', 'bold'], params: { vol: 1.25, spiky: 0.35, cap: { t: 0.1, top: 0.07, back: 0.06 }, fringe: { kind: 'spiky', n: 6 }, sides: { n: 3, to: -0.3, w: 0.17, flare: 0.45, az0: 1.0, az1: 1.6 }, fall: { n: 9, to: -0.9, w: 0.24, flare: 0.25 }, verts: 8000 } },
  // ---- tied ----
  { id: 'ponytail_low', name: 'Low ponytail', ages: [4, 80], sexes: ALL, tags: ['tied'], params: { cap: { t: 0.055, top: 0.04 }, fringe: { kind: 'side' }, sides: { n: 1, to: 0.15, w: 0.12, az0: 1.05 }, tails: [{ az: Math.PI, el: 0.2, to: -0.9, lift: -0.3, w: 0.11 }] } },
  { id: 'ponytail_high', name: 'High ponytail', ages: [4, 60], sexes: F, tags: ['tied', 'sporty'], params: { cap: { t: 0.05, top: 0.04 }, fringe: { kind: 'spiky', n: 5, w: 0.13 }, sides: { n: 1, to: 0.12, w: 0.11, az0: 1.05 }, tails: [{ az: Math.PI, el: 0.9, to: -0.6, w: 0.13, grav: 0.6, dir: [0, 0.35, -1] }] } },
  { id: 'side_ponytail', name: 'Side ponytail (Misty)', ages: [5, 30], sexes: F, tags: ['tied', 'spiky'], params: { spiky: 0.3, color: 'misty_orange', cap: { t: 0.06, top: 0.04 }, fringe: { kind: 'spiky', n: 6, w: 0.13 }, sides: { n: 2, to: 0.12, w: 0.12, flare: 0.15 }, back: { n: 5, to: 0.14, w: 0.13, flare: 0.15 }, tails: [{ az: 2.1, el: 0.75, to: 0.25, lift: 0.7, w: 0.1, n: 4, flare: 0.3, lenK: 1.0, tie: true }], tie: '#3a6ad8' } },
  { id: 'twin_tails_low', name: 'Low twin tails', ages: [3, 30], sexes: F, tags: ['tied'], params: { cap: { t: 0.055, top: 0.03 }, fringe: { kind: 'straight' }, tails: [{ az: 2.0, el: 0.15, to: -0.7, lift: -0.3, w: 0.11, n: 4 }, { az: -2.0, el: 0.15, to: -0.7, lift: -0.3, w: 0.11, n: 4 }] } },
  { id: 'twin_tails_high', name: 'High twin tails', ages: [3, 30], sexes: F, tags: ['tied', 'long'], params: { cap: { t: 0.055, top: 0.03 }, fringe: { kind: 'wispy' }, sides: { n: 1, to: 0.05, w: 0.11, az0: 1.05 }, tails: [{ az: 1.75, el: 0.8, to: -0.9, w: 0.13, n: 5, grav: 0.7, dir: [1, 0.25, -0.35] }, { az: -1.75, el: 0.8, to: -0.9, w: 0.13, n: 5, grav: 0.7, dir: [1, 0.25, -0.35] }] } },
  { id: 'half_up', name: 'Half-up', ages: [8, 60], sexes: F, tags: ['long', 'tied'], params: { cap: { t: 0.07, top: 0.04 }, fringe: { kind: 'parted' }, sides: { n: 2, to: -0.25, w: 0.14, az0: 1.0, az1: 1.3 }, fall: { n: 7, to: -1.0, w: 0.21 }, tails: [{ az: Math.PI, el: 0.85, to: 0.15, lift: 0.1, w: 0.09, n: 3, lenK: 0.8 }], verts: 8000 } },
  { id: 'delia', name: 'Low side ponytail (Delia)', ages: [20, 70], sexes: F, tags: ['tied', 'long'], params: { color: 'auburn', ahoge: true, cap: { t: 0.06, top: 0.04 }, fringe: { kind: 'side', to: 0.1 }, sides: { n: 1, to: 0.1, w: 0.12, az0: 1.05 }, tails: [{ az: 2.3, el: 0.05, to: -0.95, lift: -0.4, w: 0.12, n: 4, dir: [0.3, -0.45, 0.85] }] } },
  { id: 'single_braid', name: 'Single braid', ages: [4, 80], sexes: F, tags: ['tied', 'braid'], params: { cap: { t: 0.055, top: 0.03 }, fringe: { kind: 'parted' }, sides: { n: 1, to: 0.15, w: 0.11, az0: 1.05 }, braids: [{ az: Math.PI, el: 0.15, to: -1.3, w: 0.085 }], verts: 7000 } },
  { id: 'twin_braids', name: 'Twin braids', ages: [3, 70], sexes: F, tags: ['tied', 'braid'], params: { cap: { t: 0.055, top: 0.03 }, fringe: { kind: 'straight' }, braids: [{ az: 1.95, el: 0.15, to: -1.0, w: 0.07 }, { az: -1.95, el: 0.15, to: -1.0, w: 0.07 }], verts: 7000 } },
  { id: 'top_bun', name: 'Top bun', ages: [6, 70], sexes: F, tags: ['tied', 'bun'], params: { cap: { t: 0.05, top: 0.02 }, top: { flow: 'back', n: 5, len: 0.6, w: 0.12, hug: 1, to: 0.5 }, fringe: { kind: 'wispy', n: 5, to: 0.16 }, sides: { n: 1, to: 0.15, w: 0.1, az0: 1.05 }, buns: [{ az: Math.PI, el: 1.15, r: 0.24 }] } },
  { id: 'odango', name: 'Twin buns', ages: [3, 40], sexes: F, tags: ['tied', 'bun'], params: { cap: { t: 0.055, top: 0.03 }, fringe: { kind: 'straight' }, sides: { n: 1, to: 0.1, w: 0.11, az0: 1.05 }, buns: [{ az: 1.25, el: 0.95, r: 0.18 }, { az: -1.25, el: 0.95, r: 0.18 }] } },
  { id: 'joy_loops', name: 'Side loops (Joy)', ages: [16, 50], sexes: F, tags: ['tied', 'bold'], params: { color: 'joy_pink', cap: { t: 0.07, top: 0.05 }, fringe: { kind: 'puffy' }, sides: { n: 1, to: 0.15, w: 0.13, az0: 1.0 }, loops: { r: 0.34, w: 0.09 }, verts: 7000 } },
  { id: 'low_bun', name: 'Low bun', ages: [14, 90], sexes: F, tags: ['tied', 'bun', 'neat'], params: { cap: { t: 0.05, top: 0.03 }, top: { flow: 'back', n: 6, len: 0.85, w: 0.12, hug: 1 }, sides: { n: 1, to: 0.2, w: 0.1, az0: 1.05 }, buns: [{ az: Math.PI, el: 0.12, r: 0.19 }] } },
  // ---- older people ----
  { id: 'elder_bun', name: 'Elder bun', ages: [50, 90], sexes: F, tags: ['tied', 'bun', 'elder'], params: { color: 'grey', cap: { t: 0.05, top: 0.03, line: 'high' }, top: { flow: 'back', n: 6, len: 0.9, w: 0.12, hug: 1, lift: 0.01 }, sides: { n: 1, to: 0.25, w: 0.1, az0: 1.05 }, buns: [{ az: Math.PI, el: 0.45, r: 0.18 }] } },
  { id: 'elder_waves', name: 'Short grey waves', ages: [50, 90], sexes: F, tags: ['curly', 'elder'], params: { color: 'silver', cap: { t: 0.06, top: 0.04, line: 'high' }, curls: { r: 0.085, n: 48 }, fringe: { kind: 'side', n: 4, to: 0.22, w: 0.14, flat: 0.6 } } },
  { id: 'elder_crest', name: 'Grey crest (Professor)', ages: [40, 90], sexes: M, tags: ['spiky', 'elder'], params: { color: 'grey', spiky: 0.3, cap: { t: 0.05, top: 0.03, line: 'high' }, crown: { n: 6, len: 0.22, up: 0.7, w: 0.13, el: 1.3, az: 0.3, ring: 0.3 }, back: { n: 6, to: 0.1, w: 0.13, flare: 0.25 }, sides: { n: 1, to: 0.33, w: 0.1, flare: 0.1 } } },
  { id: 'balding', name: 'Balding, side fringe', ages: [35, 90], sexes: M, tags: ['elder'], params: { color: 'white', cap: { t: 0.04, top: 0, back: 0.02, line: 'horseshoe' }, sides: { n: 2, to: 0.24, w: 0.13, flare: 0.3, az0: 1.25, az1: 1.65, el0: 0.4, el1: 0.35 }, back: { n: 6, to: 0.1, w: 0.14, flare: 0.15, el: 0.35, elSide: 0.35, az0: 1.8 } } },
  { id: 'comb_over', name: 'Comb-over', ages: [40, 90], sexes: M, tags: ['elder'], params: { cap: { t: 0.035, top: 0.0, line: 'high' }, top: { flow: 'side', n: 4, len: 0.6, w: 0.1, partAz: 0.9 }, sides: { n: 1, to: 0.32, w: 0.1, az0: 1.2 }, back: { n: 5, to: 0.12, w: 0.12, flare: 0.05 } } },
  { id: 'gentleman', name: 'Short neat (older)', ages: [30, 90], sexes: M, tags: ['neat', 'elder'], params: { cap: { t: 0.045, top: 0.03, line: 'high' }, top: { flow: 'side', n: 5, len: 0.7, w: 0.12 }, sides: { n: 1, to: 0.36, w: 0.1 }, back: { n: 6, to: 0.12, w: 0.13, flare: 0.04 } } },
];
