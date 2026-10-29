// The face, painted in the body's shader (skin.js) like the anime's cels: no
// textures, every line worked out per pixel from where the pixel is on the
// reference head, so the face stays crisp at any zoom and follows the head
// through every age (the fitted body keeps each vertex's canonical place).
//
// Layout: the face is laid out in "face units" (the person's head height, hh):
// x from the nose line (the person's left +), y up from the chin. The canonical
// head is the reference body's (base.bin land); a person's own landmarks (eye
// line, nose; anatomy.js) are carried into it, so a toddler's eyes sit low and
// an adult's halfway up the head. The features are projected straight onto the
// head from the front and fade out round the sides.
//
// Each eye is built from layers like the X/Y face sheets: the white (two lid
// curves: an upper and a lower one, both closing onto a "closed" curve, a ∪ when
// blinking or asleep, a ∩ when laughing), a lavender shadow under the upper lid,
// the iris (a tall oval, darker at the top), the pupil, one or two highlights
// (the same screen side on both eyes: the key light is upper left), then the
// bold upper lid line (a polyline of tapered segments: the boldest line on the
// face) ending in a tick or a wing past the outer corner, lashes, and a thin
// lower lid stroke. Brows, nose mark, mouth (a closed line that opens into a D
// or an O, with teeth and tongue), blush, freckles, cheek marks, beauty marks,
// age lines and makeup are layered round them; tears and embarrassed hatching
// on top.
//
// Options (look.face) are described by FACE_OPTIONS (the creator builds its
// controls from them): eyes, brows, nose, mouth, marks and makeup; sliders are
// relative (1 = the age's norm, 0 = no offset), so they survive age changes.
// faceDefaults(body, R?) gives tasteful defaults for an age and sex (R, a random
// function, varies them for random townsfolk). EXPRESSIONS change lids, irises,
// brows and mouth; skin.js mixes them in through uniforms (no recompiling).
//
// No three.js in this file: faceParams() and exprParams() return plain values
// (numbers, arrays, '#hex' colours) keyed by uniform name for skin.js to load.

// ---------- colours ----------
const hexRgb = (h) => { const s = String(h || '#888888').replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => v / 255); };
const rgbHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
const mixC = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => v + (hexRgb(b)[i] - v) * t));
const mulC = (a, k) => rgbHex(hexRgb(a).map((v) => v * k));
const lum = (h) => { const [r, g, b] = hexRgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const isHex = (h) => typeof h === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- option tables ----------
// eye shapes, in eye widths: ht / hb half heights above / below the corner line,
// et / eb roundness of the upper / lower lid (0.5 an ellipse, 1 a parabola: more
// almond), skew moves the upper lid's peak outwards (+) or inwards (-), slant
// raises the outer corner, drop lowers the upper lid (hooded, sleepy).
export const EYE_SHAPES = {
  round: { label: 'Round', ht: 0.68, hb: 0.6, et: 0.5, eb: 0.55, skew: 0.04, slant: 0.03, drop: 0 },
  almond: { label: 'Almond', ht: 0.56, hb: 0.44, et: 0.66, eb: 0.85, skew: 0.18, slant: 0.07, drop: 0.04 },
  droopy: { label: 'Droopy', ht: 0.6, hb: 0.46, et: 0.6, eb: 0.75, skew: -0.3, slant: -0.12, drop: 0.12 },
  sharp: { label: 'Sharp', ht: 0.48, hb: 0.42, et: 0.95, eb: 0.62, skew: 0.3, slant: 0.14, drop: 0.06 },
  narrow: { label: 'Narrow', ht: 0.36, hb: 0.27, et: 0.75, eb: 0.9, skew: 0.12, slant: 0.04, drop: 0.04 },
  sleepy: { label: 'Sleepy', ht: 0.62, hb: 0.5, et: 0.55, eb: 0.7, skew: 0, slant: -0.04, drop: 0.48 },
  cat: { label: 'Cat', ht: 0.56, hb: 0.44, et: 0.62, eb: 0.9, skew: 0.42, slant: 0.2, drop: 0 },
  line: { label: 'Closed line', ht: 0.5, hb: 0.4, et: 0.6, eb: 0.7, skew: 0, slant: 0.02, drop: 0, closed: 1 },
};
export const PUPILS = { round: 'Round', slit: 'Slit', none: 'None' };
export const HIGHLIGHTS = { classic: 'Big and small', single: 'Single', sparkle: 'Sparkle', soft: 'Soft glow', none: 'None' };
export const LASHES = { none: 'None', light: 'Light', full: 'Full', bottom: 'Full and lower' };
export const BROWS = { straight: 'Straight', arched: 'Arched', angled: 'Angled', thick: 'Thick', thin: 'Thin', round: 'Round', bushy: 'Bushy' };
export const NOSES = { none: 'None', dot: 'Dot', tick: 'Tick', line: 'Line', shadow: 'Shadow' };
// mouth shapes at rest: curve (+ smile), open, teeth, tongue, wave, asym (smirk), round, cat ('w'), width
export const MOUTHS = {
  line: { label: 'Line', curve: 0.05 },
  smile: { label: 'Smile', curve: 0.5 },
  soft: { label: 'Soft smile', curve: 0.25, width: 0.85 },
  open: { label: 'Open smile', curve: 0.55, open: 0.32, tongue: 0.7, width: 0.9 },
  grin: { label: 'Grin', curve: 0.6, open: 0.3, teeth: 1, width: 1.1 },
  frown: { label: 'Frown', curve: -0.35, width: 0.9 },
  smirk: { label: 'Smirk', curve: 0.15, asym: 0.45, width: 0.9 },
  cat: { label: 'Cat', curve: 0.3, cat: 1, width: 0.85 },
  small: { label: 'Small', curve: 0.1, width: 0.6 },
};
export const CHEEK_MARKS = { none: 'None', bolt: 'Zigzags', dots: 'Dots', stripes: 'Stripes', whiskers: 'Whiskers', plaster: 'Plaster' };
export const BEAUTY_MARKS = { none: 'None', eye_l: 'Under left eye', eye_r: 'Under right eye', lip_l: 'Left of mouth', lip_r: 'Right of mouth', cheek: 'Cheek' };
export const IRIS_COLORS = [
  { id: 'dark', name: 'Dark brown', color: '#3a2418' }, { id: 'brown', name: 'Brown', color: '#6b3a1e' }, { id: 'amber', name: 'Amber', color: '#b5651d' },
  { id: 'hazel', name: 'Hazel', color: '#7a6a2a' }, { id: 'green', name: 'Green', color: '#3d8a4a' }, { id: 'viridian', name: 'Viridian', color: '#2f7d5b' },
  { id: 'teal', name: 'Teal', color: '#2e8c86' }, { id: 'sky', name: 'Sky blue', color: '#4a8fd0' }, { id: 'blue', name: 'Blue', color: '#2d4e9e' },
  { id: 'grey', name: 'Grey blue', color: '#6a7a90' }, { id: 'violet', name: 'Violet', color: '#5a4fa8' }, { id: 'red', name: 'Red', color: '#a8323a' },
  { id: 'gold', name: 'Gold', color: '#c8a030' }, { id: 'black', name: 'Near black', color: '#1c1a22' },
];
const BROW_COLORS = ['#2a2224', '#4a3226', '#6b4426', '#9a6a3a', '#c89a5a', '#a8a6a4', '#e0dcd6', '#8a3a2a'].map((c) => ({ color: c, name: c }));
const LIP_COLORS = [{ name: 'Rose', color: '#d9656f' }, { name: 'Coral', color: '#e8735a' }, { name: 'Pink', color: '#e889a8' }, { name: 'Berry', color: '#a83a5a' }, { name: 'Red', color: '#cf2a36' }, { name: 'Nude', color: '#c98a7a' }];
const SHADOW_COLORS = [{ name: 'Mauve', color: '#b07a8a' }, { name: 'Brown', color: '#9a6a52' }, { name: 'Peach', color: '#e0956e' }, { name: 'Lilac', color: '#9a86c8' }, { name: 'Teal', color: '#4f9a9a' }, { name: 'Gold', color: '#c8a050' }];

export const EXPRESSION_NAMES = { neutral: 'Neutral', happy: 'Happy', grin: 'Grin', laugh: 'Laugh', sad: 'Sad', angry: 'Angry', surprised: 'Surprised', worried: 'Worried', smug: 'Smug', sleepy: 'Sleepy', wink: 'Wink', determined: 'Determined', embarrassed: 'Embarrassed', crying: 'Crying' };
export const EXPRESSIONS = Object.entries(EXPRESSION_NAMES).map(([id, name]) => ({ id, name }));

// ---------- defaults by age and sex ----------
const ageOf = (b) => clamp(+(b && b.age) || 11, 2, 90);
const sexOf = (b) => clamp(+(b && b.sex) || 0);
// the brows follow the hair: its shadow tone (darker hair: the line colour)
export function browFromHair(hair) {
  if (!isHex(hair)) return null;
  const l = lum(hair);
  if (l < 0.12) return mixC(hair, '#1e1a1c', 0.4);
  return mulC(mixC(hair, '#5a3a2a', 0.12), l > 0.7 ? 0.78 : 0.72);
}
export function faceDefaults(body = {}, R = null) {
  if (body && body.body) body = body.body;     // a whole look
  const a = ageOf(body), s = sexOf(body), girl = s > 0.5;
  const pick = (arr, w) => { if (!R) return arr[0]; const t = w ? w.reduce((x, y) => x + y, 0) : arr.length; let r = R() * t; for (let i = 0; i < arr.length; i++) { r -= w ? w[i] : 1; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
  const jit = (v, d, lo = -Infinity, hi = Infinity) => (R ? +clamp(v + (R() - 0.5) * 2 * d, lo, hi).toFixed(2) : v);
  const f = {};
  f.eyeShape = a < 10 ? pick(['round', 'almond', 'cat'], [8, 1, 1]) : a < 18 ? (girl ? pick(['round', 'almond', 'cat', 'droopy'], [5, 3, 1, 1]) : pick(['almond', 'round', 'sharp', 'narrow'], [5, 3, 2, 1]))
    : a < 60 ? (girl ? pick(['almond', 'round', 'droopy', 'cat', 'sharp'], [5, 2, 2, 1, 1]) : pick(['almond', 'sharp', 'narrow', 'droopy', 'line'], [5, 3, 2, 1, 0.5]))
    : pick(['droopy', 'almond', 'narrow', 'line'], [5, 2, 2, 1]);
  f.eyeSize = jit(1, 0.06, 0.6, 1.5);
  f.eyeSpacing = jit(0, 0.15, -1, 1);
  f.eyeHeight = jit(0, 0.1, -1, 1);
  f.eyeTilt = jit(0, 0.15, -1, 1);
  const iris = R ? pick(IRIS_COLORS.map((c) => c.color), [5, 6, 2, 2, 1.5, 1, 1, 1.5, 1.5, 1, 0.6, 0.3, 0.3, 2]) : '#6b3a1e';
  f.irisColor = iris;
  f.irisColor2 = iris;
  f.irisSize = jit(1, 0.05, 0.7, 1.3);
  f.pupil = 'round';
  f.highlight = a < 8 ? pick(['classic', 'sparkle'], [3, 1]) : 'classic';
  f.lashes = girl ? (a < 13 ? 'light' : a < 60 ? pick(['full', 'bottom', 'light'], [4, 2, 1]) : 'light') : 'none';
  f.lidWeight = jit(a < 13 ? 1 : girl ? 1.05 : 1.1, 0.08, 0.5, 1.6);
  f.lidDrop = jit(a < 40 ? 0 : a < 65 ? 0.12 : 0.25, 0.05, 0, 1);
  f.browShape = a < 13 ? (girl ? pick(['thin', 'arched', 'round'], [4, 2, 1]) : pick(['straight', 'thick', 'angled', 'round'], [4, 2, 2, 1]))
    : a < 60 ? (girl ? pick(['arched', 'thin', 'angled', 'straight'], [4, 3, 1, 1]) : pick(['straight', 'thick', 'angled', 'bushy'], [4, 3, 2, 1]))
    : (girl ? pick(['thin', 'arched'], [1, 1]) : pick(['bushy', 'thick', 'straight'], [3, 2, 1]));
  f.browThick = jit(1, 0.12, 0.5, 2);
  f.browHeight = jit(0, 0.15, -1, 1);
  f.browTilt = jit(0, 0.12, -1, 1);
  f.nose = a < 8 ? pick(['dot', 'none'], [3, 1]) : a < 18 ? pick(['tick', 'dot'], [3, 1]) : girl ? pick(['tick', 'dot', 'shadow'], [3, 1, 1]) : pick(['tick', 'line', 'shadow'], [3, 2, 1]);
  f.mouthShape = a < 10 ? pick(['smile', 'open', 'soft', 'cat'], [4, 2, 2, 0.5]) : a < 60 ? (girl ? pick(['soft', 'smile', 'line', 'small'], [4, 2, 2, 1]) : pick(['line', 'soft', 'smirk'], [4, 2, 1])) : pick(['soft', 'line', 'frown'], [3, 2, 1]);
  f.mouthWidth = jit(1, 0.08, 0.6, 1.5);
  f.blush = jit(a < 6 ? 0.55 : a < 10 ? 0.42 : a < 14 ? 0.3 : girl ? (a < 60 ? 0.22 : 0.15) : a < 18 ? 0.08 : 0, 0.06, 0, 1);
  f.freckles = R && R() < 0.12 ? +(0.3 + R() * 0.5).toFixed(2) : 0;
  f.cheekMarks = 'none';
  f.beautyMark = R && a > 16 && R() < 0.1 ? pick(['eye_l', 'eye_r', 'lip_l', 'lip_r', 'cheek']) : 'none';
  f.lines = 1;
  f.lipTint = girl ? jit(a < 13 ? 0 : a < 18 ? 0.15 : a < 70 ? 0.35 : 0.2, 0.08, 0, 1) : 0;
  f.lipColor = '#d9656f';
  f.eyeShadow = girl && a >= 18 ? jit(0.15, 0.08, 0, 1) : 0;
  f.shadowColor = '#b07a8a';
  return f;
}

// a default as the spec wants it (default(look)), that also reads as a number / string where the creator expects one
const dflt = (fn, typical) => Object.assign(fn, { valueOf: () => typical, toString: () => String(typical) });
const fromDefaults = (key, typical) => dflt((look = {}) => faceDefaults((look && look.body) || look || {})[key], typical);
const opts = (table) => Object.entries(table).map(([id, v]) => ({ id, label: typeof v === 'string' ? v : v.label }));
const choice = (key, label, group, table, typical) => ({ key, label, name: label, group, type: 'choice', options: opts(table), default: fromDefaults(key, typical) });
const slider = (key, label, group, min, max, step, typical) => ({ key, label, name: label, group, type: 'slider', range: [min, max], min, max, step, default: fromDefaults(key, typical) });
const color = (key, label, group, palette, fn, typical) => ({ key, label, name: label, group, type: 'color', options: palette, colors: palette, default: dflt(fn, typical) });

// every face option, for the creator: { key, label, group, type: 'choice' | 'slider' | 'color', options (choices / swatches) | range + step, default(look) }
export const FACE_OPTIONS = [
  choice('eyeShape', 'Eye shape', 'Eyes', EYE_SHAPES, 'round'),
  slider('eyeSize', 'Eye size', 'Eyes', 0.6, 1.5, 0.01, 1),
  slider('eyeSpacing', 'Eye spacing', 'Eyes', -1, 1, 0.01, 0),
  slider('eyeHeight', 'Eye height', 'Eyes', -1, 1, 0.01, 0),
  slider('eyeTilt', 'Eye tilt', 'Eyes', -1, 1, 0.01, 0),
  color('irisColor', 'Eye colour', 'Eyes', IRIS_COLORS, (look = {}) => (look.face && look.face.irisColor) || faceDefaults(look.body || {}).irisColor, '#6b3a1e'),
  color('irisColor2', 'Right eye colour', 'Eyes', IRIS_COLORS, (look = {}) => (look.face && (look.face.irisColor2 || look.face.irisColor)) || faceDefaults(look.body || {}).irisColor, '#6b3a1e'),
  slider('irisSize', 'Iris size', 'Eyes', 0.7, 1.3, 0.01, 1),
  choice('pupil', 'Pupil', 'Eyes', PUPILS, 'round'),
  choice('highlight', 'Highlights', 'Eyes', HIGHLIGHTS, 'classic'),
  choice('lashes', 'Lashes', 'Eyes', LASHES, 'none'),
  slider('lidWeight', 'Lid line', 'Eyes', 0.5, 1.6, 0.01, 1),
  slider('lidDrop', 'Heavy lids', 'Eyes', 0, 1, 0.01, 0),
  choice('browShape', 'Brow shape', 'Brows', BROWS, 'straight'),
  slider('browThick', 'Brow thickness', 'Brows', 0.5, 2, 0.01, 1),
  color('browColor', 'Brow colour', 'Brows', BROW_COLORS, (look = {}) => (look.face && look.face.browColor) || browFromHair(look.hair && look.hair.color) || browDefault(look.body), '#4a3226'),
  slider('browHeight', 'Brow height', 'Brows', -1, 1, 0.01, 0),
  slider('browTilt', 'Brow tilt', 'Brows', -1, 1, 0.01, 0),
  choice('nose', 'Nose', 'Nose & mouth', NOSES, 'tick'),
  choice('mouthShape', 'Mouth', 'Nose & mouth', MOUTHS, 'smile'),
  slider('mouthWidth', 'Mouth width', 'Nose & mouth', 0.6, 1.5, 0.01, 1),
  slider('blush', 'Blush', 'Marks', 0, 1, 0.01, 0.3),
  slider('freckles', 'Freckles', 'Marks', 0, 1, 0.01, 0),
  choice('cheekMarks', 'Cheek marks', 'Marks', CHEEK_MARKS, 'none'),
  choice('beautyMark', 'Beauty mark', 'Marks', BEAUTY_MARKS, 'none'),
  slider('lines', 'Age lines', 'Marks', 0, 2, 0.01, 1),
  slider('lipTint', 'Lip tint', 'Makeup', 0, 1, 0.01, 0),
  color('lipColor', 'Lip colour', 'Makeup', LIP_COLORS, () => '#d9656f', '#d9656f'),
  slider('eyeShadow', 'Eye shadow', 'Makeup', 0, 1, 0.01, 0),
  color('shadowColor', 'Shadow colour', 'Makeup', SHADOW_COLORS, () => '#b07a8a', '#b07a8a'),
];
function browDefault(body) { const a = ageOf(body); return a > 62 ? '#a8a4a0' : '#4a3226'; }

// ---------- uniforms from a look ----------
// L: the person's landmarks (anatomy.js), R: the reference body's (base.bin land).
// tone: the skin tone record (skin.js: { color, shade, blush }).
export function faceParams(look = {}, L, R, tone) {
  const body = look.body || {}, a = ageOf(body), s = sexOf(body);
  const f = { ...faceDefaults(body), ...(look.face || {}) };
  const sh = EYE_SHAPES[f.eyeShape] || EYE_SHAPES.round;
  const kid = 1 - smooth(9, 18, a), toddler = 1 - smooth(4, 8, a), old = smooth(50, 80, a);
  // eye size (eye widths in face units), by age and sex, then the slider
  // (the X/Y heads: an eye about 0.19 head heights wide and 0.27 tall on a teen; a little smaller on adults, more on men and elders)
  let W = lerp(0.215, 0.19, smooth(4, 16, a)) + 0.012 * toddler;
  W -= 0.018 * (1 - s) * smooth(13, 22, a) + 0.008 * s * smooth(16, 24, a) + 0.025 * old;
  W *= clamp(+f.eyeSize || 1, 0.5, 1.6);
  // eye height (the white's height over its width): tall for children and girls
  const aspect = (1.3 + 0.1 * toddler - 0.3 * (1 - s) * smooth(11, 20, a) - 0.08 * s * smooth(14, 22, a) - 0.12 * old);
  const eyeR = (L.eyeY - L.chinY) / L.hh, noseR = (L.noseY - L.chinY) / L.hh;
  const cy = eyeR - 0.012 - 0.02 * toddler + 0.03 * (+f.eyeHeight || 0);
  // the eyes where the head's model has them (headgrid.js), else by their size
  const cx = (L.eyeX ? L.eyeX / L.hh * 1.05 : W * (1.12 + 0.05 * kid)) + 0.02 * (+f.eyeSpacing || 0);
  const slant = sh.slant + 0.1 * (+f.eyeTilt || 0) - 0.04 * old;
  const lashes = { none: 0, light: 1, full: 2, bottom: 3 }[f.lashes] ?? 0;
  const flick = lashes ? 1 : (s < 0.5 ? -1 : 0);
  const closed = sh.closed ? 1 : 0;
  const hl = { classic: 0, single: 1, sparkle: 2, soft: 3, none: 4 }[f.highlight] ?? 0;
  const lidW = 0.17 * clamp(+f.lidWeight || 1, 0.3, 2) * (1 + 0.15 * (lashes >= 2) - 0.25 * closed);
  const lower = lashes >= 2 ? 2 : 1;
  const tw = (L.hw / L.hh) / R.hw;                // canon x -> face units
  const brow = BROWS[f.browShape] ? Object.keys(BROWS).indexOf(f.browShape) : 0;
  const browCol = isHex(f.browColor) ? f.browColor : (browFromHair(look.hair && look.hair.color) || browDefault(body));
  const mouth = MOUTHS[f.mouthShape] || MOUTHS.line;
  const mouthY = L.mouthY ? (L.mouthY - L.chinY) / L.hh : noseR * (0.62 + 0.02 * toddler);
  const mw = (0.062 + 0.008 * smooth(10, 20, a)) * clamp(+f.mouthWidth || 1, 0.5, 1.6);
  const lineK = clamp(+f.lines ?? 1, 0, 2);
  const crow = lineK * smooth(38, 70, a), naso = lineK * smooth(30, 62, a), fore = lineK * smooth(48, 78, a), bags = lineK * smooth(42, 72, a);
  const mark = Object.keys(CHEEK_MARKS).indexOf(f.cheekMarks), beauty = Object.keys(BEAUTY_MARKS).indexOf(f.beautyMark);
  const irisC = isHex(f.irisColor) ? f.irisColor : '#6b3a1e';
  const lineC = '#2a1f22';
  return {
    state: { mouth, closed, slant, lashes },
    uFK: [tw, R.chinY, 1 / R.hh, 0],
    uEyeP: [cx, cy, W, slant],
    uEyeS: [sh.ht * aspect, sh.hb * aspect, sh.et, sh.eb],
    uEyeL: [sh.skew, sh.drop + clamp(+f.lidDrop || 0, 0, 1) * 0.55, lidW, lashes],
    uEyeK: [flick, lower, closed, hl],
    uIris: [0.66 * clamp(+f.irisSize || 1, 0.6, 1.4) * (1 + 0.1 * kid + 0.04 * toddler - 0.08 * old), 1.28 + 0.06 * kid - 0.1 * old, { round: 0, slit: 1, none: 2 }[f.pupil] ?? 0, 1],
    uIrisC: irisC, uIrisC2: isHex(f.irisColor2) ? f.irisColor2 : irisC,
    uLineC: lineC, uSclera: '#fbfaf6',
    uBrowP: [0.2 + 0.08 * kid + 0.12 * (+f.browHeight || 0) - 0.06 * old, 1.12 + 0.08 * (1 - s), 0.06 * clamp(+f.browThick || 1, 0.3, 2.5) * (1 + 0.7 * (1 - s) * smooth(10, 20, a) - 0.15 * kid * s), 0.12 * (+f.browTilt || 0)],
    uBrowS: [brow, 0, 0, 0],
    uBrowC: browCol,
    uNose: [Object.keys(NOSES).indexOf(f.nose), noseR, 1 + 0.25 * smooth(14, 25, a) * (1 - s * 0.4), 0],
    uMouth: [mw, mouthY, 0, clamp(+f.lipTint || 0)],
    uLipC: isHex(f.lipColor) ? f.lipColor : '#d9656f',
    uShadowC: isHex(f.shadowColor) ? f.shadowColor : '#b07a8a',
    uCheek: [clamp(+f.blush || 0), clamp(+f.freckles || 0), Math.max(0, mark), Math.max(0, beauty)],
    uAgeL: [crow, naso, fore, bags],
    uMake: [clamp(+f.eyeShadow || 0), kid, old, s],
  };
}

// ---------- expressions ----------
// per eye: open (1 open, 0 closed, > 1 wide), lower (lower lid raised), arc (the
// closed curve: -1 a ∪ (asleep, blinking), +1 a ∩ (laughing)), angle (inner end of
// the upper lid down +: angry; up -: sad). iris scale, gaze x / y, sparkle.
// per brow: raise, angle (inner end up +), curve. mouth: open, curve, width,
// teeth | tongue, wave, asym, round | blush, hatch, tears, cat.
const N = { open: 1, lower: 0, arc: -0.75, angle: 0, iris: 1, gx: 0, gy: 0, spark: 0, bRaise: 0, bAngle: 0, bCurve: 0, mOpen: 0, mCurve: 0, mWidth: 1, teeth: 0, tongue: 0, wave: 0, asym: 0, round: 0, blush: 0, hatch: 0, tears: 0, cat: 0 };
// an expression: shared values, then L / R overrides for the person's left / right side
export const EXPRESSION_TABLE = {
  neutral: {},
  happy: { lower: 0.3, bRaise: 0.06, bCurve: 0.25, mOpen: 0.3, mCurve: 0.65, mWidth: 1.05, tongue: 0.7, blush: 0.15 },
  grin: { lower: 0.35, bRaise: 0.05, bCurve: 0.15, mOpen: 0.34, mCurve: 0.85, mWidth: 1.3, teeth: 1, blush: 0.1 },
  laugh: { open: 0, arc: 1, bRaise: 0.18, bCurve: 0.35, mOpen: 1, mCurve: 0.55, mWidth: 1.3, tongue: 1, blush: 0.3 },
  sad: { open: 0.88, angle: -0.6, lower: 0.05, gy: -0.12, bAngle: 0.85, bRaise: 0.04, bCurve: -0.1, mCurve: -0.55, mWidth: 0.78 },
  angry: { open: 0.95, angle: 0.75, lower: 0.18, iris: 0.92, bAngle: -1, bRaise: -0.1, bCurve: -0.15, mOpen: 0.28, mCurve: -0.55, mWidth: 1, teeth: 0.75 },
  surprised: { open: 1.22, lower: -0.12, iris: 0.72, bRaise: 0.38, bCurve: 0.45, mOpen: 0.62, round: 1, mWidth: 0.55, tongue: 0.3 },
  worried: { open: 0.95, angle: -0.4, gy: -0.04, bAngle: 0.75, bRaise: 0.12, wave: 0.7, mCurve: -0.15, mWidth: 0.75 },
  smug: { open: 0.62, angle: 0.15, lower: 0.18, gx: 0.15, mCurve: 0.3, asym: 0.55, mWidth: 0.9, L: { bRaise: 0.16, bAngle: -0.15 }, R: { bRaise: -0.05, bAngle: -0.25 } },
  sleepy: { open: 0.32, lower: 0.12, angle: -0.1, gy: -0.1, bRaise: -0.04, bAngle: 0.25, mOpen: 0.14, round: 0.7, mWidth: 0.45 },
  wink: { lower: 0.25, mOpen: 0.22, mCurve: 0.65, tongue: 0.8, mWidth: 0.95, asym: 0.15, L: { bRaise: 0.1 }, R: { open: 0, arc: 0.85, bRaise: -0.06, bAngle: -0.1 } },
  determined: { open: 1, angle: 0.4, lower: 0.12, spark: 1, bAngle: -0.75, bRaise: -0.06, mCurve: 0.15, mWidth: 0.85 },
  embarrassed: { open: 0.92, angle: -0.15, lower: 0.15, gx: 0.3, gy: -0.08, bAngle: 0.45, bRaise: 0.05, wave: 0.8, mWidth: 0.7, blush: 0.9, hatch: 1 },
  crying: { open: 0.72, angle: -0.5, lower: 0.25, gy: -0.05, spark: 0.5, bAngle: 0.95, bRaise: 0.08, mOpen: 0.42, mCurve: -0.7, wave: 0.35, mWidth: 0.9, tongue: 0.4, tears: 1, blush: 0.3 },
};
// the face at rest (its mouth shape; line eyes stay closed)
function restOf(state) {
  const m = state.mouth || {};
  return { ...N, mCurve: m.curve || 0, mOpen: m.open || 0, teeth: m.teeth || 0, tongue: m.tongue || 0, asym: m.asym || 0, cat: m.cat || 0, mWidth: m.width || 1 };
}
export function exprParams(state, name = 'neutral', amount = 1) {
  const rest = restOf(state), e = EXPRESSION_TABLE[name] || {};
  const k = clamp(amount, 0, 1.5);
  const side = (o) => {
    const t = { ...rest, ...e, ...(o || {}) };
    // an expression that does not open the mouth keeps the face's own mouth shape where it can
    if (e.mCurve === undefined) t.mCurve = rest.mCurve;
    if (e.mWidth === undefined) t.mWidth = rest.mWidth;
    const v = {};
    for (const key of Object.keys(N)) v[key] = rest[key] + (t[key] - rest[key]) * k;
    if (e.mOpen !== undefined || e.round !== undefined) { v.teeth = rest.teeth * (1 - k) + (e.teeth || 0) * k; v.cat = rest.cat * (1 - k); }
    if (e.asym === undefined) v.asym = rest.asym * (1 - Math.min(k, 1) * (e.mOpen ? 1 : 0.5));
    return v;
  };
  const l = side(e.L), r = side(e.R);
  const closed = state.closed;
  const eye = (v) => closed ? [0, v.lower, Math.max(0.2, v.arc + 0.05 * (v.arc < 0 ? 0 : 1)), v.angle * 0.5] : [v.open, v.lower, v.arc, v.angle];
  return {
    uXL: eye(l), uXR: eye(r),
    uXI: [l.iris, l.gx, l.gy, l.spark],
    uXBL: [l.bRaise, l.bAngle, l.bCurve, 0], uXBR: [r.bRaise, r.bAngle, r.bCurve, 0],
    uXM: [l.mOpen, l.mCurve, l.mWidth, l.teeth], uXM2: [l.tongue, l.wave, l.asym, l.round],
    uXF: [l.blush, l.hatch, l.tears, l.cat],
  };
}

// uniform names and sizes (skin.js makes them)
export const FACE_UNIFORMS = {
  vec4: ['uFK', 'uEyeP', 'uEyeS', 'uEyeL', 'uEyeK', 'uIris', 'uBrowP', 'uBrowS', 'uNose', 'uMouth', 'uCheek', 'uAgeL', 'uMake', 'uXL', 'uXR', 'uXI', 'uXBL', 'uXBR', 'uXM', 'uXM2', 'uXF'],
  color: ['uIrisC', 'uIrisC2', 'uLineC', 'uSclera', 'uBrowC', 'uLipC', 'uShadowC'],
};

// ---------- the shader ----------
// needs paint.js' LIB (noise2, hash12), vCanon / vShare, uSkinShade, uBlushC and
// gPx (face units per pixel, worked out by the caller outside any branch: the
// face is drawn inside branches, where screen derivatives are undefined).
// Gives vec3 paintFace(vec3 col).
export const FACE_GLSL = /* glsl */ `
uniform vec4 uFK, uEyeP, uEyeS, uEyeL, uEyeK, uIris, uBrowP, uBrowS, uNose, uMouth, uCheek, uAgeL, uMake;
uniform vec4 uXL, uXR, uXI, uXBL, uXBR, uXM, uXM2, uXF;
uniform vec3 uIrisC, uIrisC2, uLineC, uSclera, uBrowC, uLipC, uShadowC;
uniform float uBlink;
const float PI_F = 3.14159265;
float gPx = 1e-3;
// coverage of a signed distance (< 0 inside), anti-aliased over a pixel: face units / eye widths
float af(float d) { return clamp(0.5 - d / gPx, 0.0, 1.0); }
float ae(float d) { return clamp(0.5 - d * uEyeP.z / gPx, 0.0, 1.0); }

// a polyline's segment with a varying half width: signed distance (< 0 inside)
float segD(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
// a quadratic stroke from a through c to b, half width ra -> rb
float qStroke(vec2 p, vec2 a, vec2 c, vec2 b, float ra, float rb) {
  float d = 1e3; vec2 q0 = a; float r0 = ra;
  for (int i = 1; i <= 5; i++) {
    float t = float(i) / 5.0; vec2 q1 = mix(mix(a, c, t), mix(c, b, t), t); float r1 = mix(ra, rb, t);
    d = min(d, segD(p, q0, q1, r0, r1)); q0 = q1; r0 = r1;
  }
  return d;
}
vec3 over(vec3 c, vec3 t, float a) { return mix(c, t, clamp(a, 0.0, 1.0)); }
// an ellipse (approximate distance)
float ell(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
float rbox(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// a four-point star of radius r
float star4(vec2 p, float r) { vec2 a = abs(p) / r; return (sqrt(a.x) + sqrt(a.y) - 1.0) * r * 0.5; }

// ----- the eye's lids (eye widths: x outward from the eye's centre, y up) -----
float eHt, eHb, eEt, eEb, eSkew, eSlant, eDrop, eOpen, eLower, eArc, eAngle;
float gE(float u, float e) { return pow(max(1.0 - u * u, 0.0), e); }
// both lids close onto this curve: a ∪ low in the eye (blinking, asleep) or a ∩ (laughing)
float eClosed(float u) { float g = gE(u, 0.8); return eArc >= 0.0 ? eArc * eHt * 0.62 * g : eArc * eHb * 0.8 * g; }
float eUp(float u) {
  // drop: a heavy lid; angle: the inner end down (angry) or up with the outer end down (sad)
  float inner = 0.5 - 0.5 * u, outer = 0.5 + 0.5 * u;
  float k = 1.0 - 0.8 * eDrop - eAngle * (0.75 * inner - 0.3 * outer) + min(eAngle, 0.0) * 0.55 * outer;
  float t = eHt * gE(u, eEt) * (1.0 + eSkew * u) * max(k, 0.0);
  return mix(eClosed(u), t, eOpen) + eSlant * u * 0.5;
}
float eLo(float u) {
  float b = -eHb * gE(u, eEb) * (1.0 - 0.72 * eLower);
  float y = mix(eClosed(u), b, clamp(eOpen * 3.0, 0.0, 1.0)) + eSlant * u * 0.5;
  return min(y, eUp(u));
}
// the upper lid line's half width along it (s 0 inner corner .. 1 outer corner)
float lidProfile(float s) { return (0.14 + 0.86 * smoothstep(0.0, 0.4, s)) * (1.0 + 0.28 * smoothstep(0.42, 0.72, s)) * (1.0 - 0.62 * smoothstep(0.78, 1.0, s)); }
vec2 lidPt(float s) { float u = -cos(PI_F * s); return vec2(u * 0.5, eUp(u)); }

// one eye: q in eye widths (x outward); fx = +1 when outward is the face's +x. -> colour, alpha
vec4 eyeLayer(vec2 q, float fx, vec3 irisC) {
  float u = clamp(q.x * 2.0, -1.0, 1.0);
  float T = eUp(u), B = eLo(u);
  float inX = ae(abs(q.x) - 0.5);
  float white = inX * ae(q.y - T) * ae(B - q.y) * step(B + 0.003, T);
  float hgt = eHt + eHb;
  vec3 col = uSclera;
  // the iris (face-oriented coordinates: the highlights keep their screen side on both eyes)
  float rx = uIris.x * 0.5 * uXI.x, ry = rx * uIris.y;
  vec2 ic = vec2(uXI.y * 0.2, (eHt - eHb) * 0.5 - hgt * 0.05 + uXI.z * 0.18);
  vec2 qi = vec2(q.x * fx, q.y) - ic;
  float dI = ell(qi, vec2(0.0), vec2(rx, ry));
  float t = clamp(qi.y / ry, -1.0, 1.0);
  vec3 dark = irisC * 0.3, light = mix(irisC, vec3(1.0), 0.3) * 1.08;
  vec3 ir = mix(light, irisC, smoothstep(-0.9, -0.1, t));
  ir = mix(ir, dark, smoothstep(0.0, 0.8, t));
  ir = mix(ir, dark * 0.7, 1.0 - ae(dI + rx * 0.09));                        // rim
  vec3 pc = irisC * 0.08 + vec3(0.025, 0.02, 0.025);
  if (uIris.z < 0.5) ir = mix(ir, pc, ae(ell(qi, vec2(0.0, ry * 0.06), vec2(rx * 0.44, ry * 0.5) * uIris.w)));
  else if (uIris.z < 1.5) ir = mix(ir, pc, ae(ell(qi, vec2(0.0), vec2(rx * 0.13, ry * 0.8))));
  // a light crescent low in the iris (the X/Y glow)
  ir = mix(ir, mix(irisC, vec3(1.0), 0.45), 0.5 * ae(ell(qi, vec2(0.0, -ry * 0.52), vec2(rx * 0.56, ry * 0.3))) * (1.0 - ae(ell(qi, vec2(0.0, -ry * 0.3), vec2(rx * 0.62, ry * 0.4)))));
  col = mix(col, ir, ae(dI));
  // the shadow under the upper lid on the white and the iris
  float sh = (1.0 - smoothstep(0.0, hgt * 0.17, T - q.y)) * step(0.08, eOpen);
  col = mix(col, col * vec3(0.78, 0.78, 0.9), sh * 0.85);
  // highlights: a big one upper left, a small one lower right
  float hl = uEyeK.w;
  if (hl < 3.5 && eOpen > 0.2) {
    float big = hl > 1.5 && hl < 2.5 ? ae(star4(qi - vec2(-rx * 0.34, ry * 0.36), rx * 0.42)) : ae(ell(qi, vec2(-rx * 0.36, ry * 0.36), vec2(rx * 0.27, ry * 0.3)));
    float small = hl < 0.5 || hl > 1.5 ? ae(ell(qi, vec2(rx * 0.4, -ry * 0.42), vec2(rx * 0.13))) : 0.0;
    if (hl > 2.5) { big *= 0.8; small = 0.5 * ae(ell(qi, vec2(0.0, -ry * 0.6), vec2(rx * 0.55, ry * 0.12))); }
    if (uXI.w > 0.01) small = max(small, uXI.w * ae(star4(qi - vec2(rx * 0.3, ry * 0.52), rx * 0.32)));
    col = mix(col, vec3(1.0), max(big, small));
  }
  vec4 res = vec4(col, white);
  // the white's lower edge: a faint skin-shade line
  float rimLo = ae(abs(q.y - B) - 0.012) * inX * step(B + 0.01, T) * smoothstep(0.08, 0.4, eOpen) * (1.0 - white);
  res.rgb = mix(res.rgb, uSkinShade * 0.85, rimLo);
  res.a = max(res.a, rimLo * 0.45);
  // the bold upper lid: a tapered polyline over the top of the eye
  float lw = uEyeL.z * 0.5;
  float d = 1e3; vec2 a = lidPt(0.0); float ra = lw * lidProfile(0.0);
  for (int i = 1; i <= 16; i++) {
    float s = float(i) / 16.0;
    vec2 b = lidPt(s); float rb = lw * lidProfile(s);
    d = min(d, segD(q, a, b, ra, rb)); a = b; ra = rb;
  }
  // its end past the outer corner: a short tick (boys), a short line, or a wing (lashes)
  float fl = uEyeK.x, op = smoothstep(0.1, 0.5, eOpen);
  float cdir = eOpen < 0.3 ? (eArc > 0.0 ? 0.35 : -0.45) : 0.0;
  if (uEyeK.z > 0.5) {
  } else if (fl > 0.5) {
    vec2 P = lidPt(0.82); vec2 dir = normalize(vec2(1.0, mix(cdir, 0.42, op) + eSlant));
    d = min(d, qStroke(q, P - vec2(0.02, 0.0), P + dir * 0.09 + vec2(0.0, 0.015), P + dir * 0.19, lw * lidProfile(0.82) * 0.95, lw * 0.08));
  } else {
    vec2 P = lidPt(0.92); vec2 dir = normalize(vec2(1.0, mix(cdir, fl < -0.5 ? -0.3 : 0.0, op) + eSlant));
    d = min(d, qStroke(q, P - vec2(0.02, 0.0), P + dir * 0.05, P + dir * 0.1, lw * lidProfile(0.88) * 0.95, lw * 0.15));
  }
  // lashes: flicks fanning out from the outer half of the upper lid
  float nl = uEyeL.w;
  if (nl > 0.5) {
    float up = eArc > 0.0 || eOpen > 0.3 ? 1.0 : -1.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      if (fi > nl - 1.0) break;
      float s = 0.7 - 0.12 * fi;
      vec2 P = lidPt(s);
      vec2 tg = normalize(lidPt(s + 0.02) - lidPt(s - 0.02));
      vec2 n = vec2(-tg.y, tg.x) * up;
      vec2 dr = normalize(n * 0.8 + vec2(1.0, 0.0));
      float len = (0.15 - 0.03 * fi) * (nl > 1.5 ? 1.1 : 0.95);
      d = min(d, qStroke(q, P, P + dr * len * 0.55 + vec2(0.0, 0.035 * up), P + dr * len + vec2(0.05, 0.02 * up), lw * 0.55, lw * 0.06));
    }
  }
  float lid = ae(d);
  // the lower lid: a thin stroke along its outer part (and two little lashes for 'bottom')
  float dl = 1e3;
  float lowOn = smoothstep(0.12, 0.45, eOpen);
  if (lowOn > 0.0 && uEyeK.y > 0.5) {
    float u0 = uEyeK.y > 1.5 ? 0.0 : 0.3;
    vec2 a2 = vec2(u0 * 0.5, eLo(u0)); float r2 = 0.0;
    for (int i = 1; i <= 8; i++) {
      float s = float(i) / 8.0, uu = mix(u0, 0.97, s);
      vec2 b = vec2(uu * 0.5, eLo(uu)); float rb = lw * 0.26 * pow(sin(PI_F * min(s * 1.12, 1.0)), 0.6) * lowOn;
      dl = min(dl, segD(q, a2, b, r2, rb)); a2 = b; r2 = rb;
    }
    if (nl > 2.5) for (int i = 0; i < 2; i++) {
      float uu = 0.6 + 0.24 * float(i); vec2 P = vec2(uu * 0.5, eLo(uu));
      dl = min(dl, qStroke(q, P, P + vec2(0.04, -0.05), P + vec2(0.09, -0.09), lw * 0.28, lw * 0.03));
    }
  }
  float strokes = max(lid, ae(dl));
  res.rgb = mix(res.rgb, uLineC, strokes);
  res.a = max(res.a, strokes);
  return res;
}

// ----- brows (eye widths, from the eye's centre, x outward) -----
float browD(vec2 q, vec4 X) {
  float sid = uBrowS.x;
  bool round = sid > 4.5 && sid < 5.5, bushy = sid > 5.5;
  float len = uBrowP.y * (round ? 0.42 : 1.0) * (bushy ? 1.08 : 1.0);
  float th = uBrowP.z * (sid > 2.5 && sid < 3.5 ? 1.9 : sid > 3.5 && sid < 4.5 ? 0.6 : round ? 2.6 : bushy ? 2.2 : 1.0);
  float x0 = -0.52 + (round ? 0.12 : 0.0);
  float y0 = uEyeS.x + uBrowP.x + X.x * 0.5;
  float d = 1e3; vec2 a = vec2(0.0); float ra = 0.0;
  for (int i = 0; i <= 10; i++) {
    float s = float(i) / 10.0;
    float arch = sid < 0.5 ? 0.05 * sin(PI_F * s) : sid < 1.5 ? 0.2 * pow(sin(PI_F * s), 0.8) - 0.04 * s
      : sid < 2.5 ? 0.2 * (s < 0.62 ? s / 0.62 : 1.0 - (s - 0.62) / 0.38 * 1.15) : sid < 3.5 ? 0.07 * sin(PI_F * s)
      : sid < 4.5 ? 0.15 * sin(PI_F * s) : round ? 0.0 : 0.06 * sin(PI_F * s);
    float y = y0 + arch + uBrowP.w * (s - 0.5) + X.y * (0.5 - s) * 0.34 + X.z * 0.16 * sin(PI_F * s) + uEyeP.w * s * 0.4;
    vec2 b = vec2(x0 + s * len, y);
    float rb = th * 0.5 * (round ? 1.0 : mix(1.0, 0.25, smoothstep(0.35, 1.0, s)));
    if (i > 0) d = min(d, segD(q, a, b, ra, rb));
    a = b; ra = rb;
  }
  if (bushy) d += (noise2(q * 40.0) - 0.5) * th * 0.5 * smoothstep(-0.2, 0.3, q.y - y0);
  return d;
}

// the mouth's centre line and its open edges (face units; xn -1..1 across)
float mouthMid(float xn, float mw) {
  return mw * (uXM.y * 0.32 * xn * xn + uXM2.z * 0.15 * (xn + xn * xn) + uXM2.y * 0.08 * sin(xn * 4.7) - uXF.w * 0.16 * abs(sin(xn * PI_F)) * (1.0 - uXM.x));
}
vec2 mouthEdges(float xn, float mw) {
  float o = uXM.x, rnd = uXM2.w, hh = mw * (1.0 + 0.4 * rnd), g = max(1.0 - xn * xn, 0.0), m = mouthMid(xn, mw);
  return vec2(m + o * hh * (0.12 * g * (1.0 - rnd) + rnd * 0.48 * sqrt(g)), m - o * hh * ((1.0 - rnd) * 0.95 * pow(g, 0.62) + rnd * 0.5 * sqrt(g)));
}

// ----- the whole face -----
vec3 paintFace(vec3 col) {
  vec2 F = vec2(vCanon.x * uFK.x, (vCanon.y - uFK.y) * uFK.z);
  float front = smoothstep(0.018, 0.045, vCanon.z) * smoothstep(0.6, 0.95, vShare.z);
  if (front <= 0.0) return col;
  vec3 c = col;
  float side = F.x >= 0.0 ? 1.0 : -1.0, ax = abs(F.x);
  vec2 A = vec2(ax, F.y);
  float W = uEyeP.z, cx = uEyeP.x, cy = uEyeP.y;
  vec2 q = vec2(ax - cx, F.y - cy) / W;            // eye widths, x outward
  vec4 X = side > 0.0 ? uXL : uXR, XB = side > 0.0 ? uXBL : uXBR;
  vec3 shadeLine = uSkinShade * 0.82;
  float kid = uMake.y;
  // ---- age lines ----
  if (uAgeL.x + uAgeL.y + uAgeL.z + uAgeL.w > 0.01) {
    float dd = 1e3;
    if (uAgeL.x > 0.01) for (int i = 0; i < 3; i++) {        // crow's feet
      float fi = float(i) - 1.0; vec2 P = vec2(0.66, uEyeP.w * 0.5 + 0.02 + fi * 0.11);
      vec2 Q = P + vec2(0.17, fi * 0.1 + 0.02);
      dd = min(dd, qStroke(q, P, mix(P, Q, 0.5) + vec2(0.0, 0.02), Q, 0.016, 0.005) + (1.0 - uAgeL.x) * 0.02);
    }
    if (uAgeL.w > 0.01) dd = min(dd, qStroke(q, vec2(-0.3, -uEyeS.y - 0.14), vec2(0.05, -uEyeS.y - 0.3), vec2(0.42, -uEyeS.y - 0.12), 0.007, 0.016) + (1.0 - uAgeL.w) * 0.02);
    float lines = ae(dd) * 0.55;
    float dn = 1e3;
    if (uAgeL.y > 0.01) {                                      // nasolabial folds
      vec2 P = vec2(0.058, uNose.y - 0.006), Q = vec2(uMouth.x + 0.016, uMouth.y + 0.004);
      dn = min(dn, qStroke(A, P, vec2(Q.x + 0.012, (P.y + Q.y) * 0.5 + 0.004), Q, 0.0022, 0.0008) + (1.0 - uAgeL.y) * 0.003);
    }
    if (uAgeL.z > 0.01) for (int i = 0; i < 3; i++) {          // forehead lines
      float y = cy + (uEyeS.x + uBrowP.x) * W + 0.08 + float(i) * 0.03;
      dn = min(dn, qStroke(A, vec2(0.0, y + 0.006), vec2(0.06, y + 0.002), vec2(0.13 - 0.02 * float(i), y - 0.008), 0.0028, 0.001) + (1.0 - uAgeL.z) * 0.004 + step(1.5, float(i)) * (1.0 - smoothstep(0.6, 1.0, uAgeL.z)) * 0.01);
    }
    lines = max(lines, af(dn) * 0.55);
    c = over(c, shadeLine, lines);
  }
  // ---- blush: a soft oval under each eye ----
  float blush = uCheek.x + uXF.x;
  vec2 bc = vec2(cx + W * 0.12, cy - uEyeS.y * W - 0.05);
  float bd = length((A - bc) / vec2(0.085 + 0.01 * kid, 0.042));
  c = over(c, uBlushC, min(blush, 1.2) * 0.55 * (1.0 - smoothstep(0.25, 1.0, bd)));
  if (uXF.y > 0.01) {                                          // embarrassed: hatching
    vec2 h = A - bc; float k = 0.0;
    for (int i = 0; i < 4; i++) { float x0 = -0.045 + 0.03 * float(i); k = max(k, af(segD(h, vec2(x0 - 0.008, -0.015), vec2(x0 + 0.01, 0.017), 0.0028, 0.0028))); }
    c = over(c, mix(uBlushC, vec3(0.6, 0.15, 0.15), 0.6), k * uXF.y);
  }
  // ---- freckles: a loose arc over the nose and cheeks ----
  if (uCheek.y > 0.01) {
    vec2 p = vec2(F.x, F.y - (uNose.y + 0.05) + 0.4 * F.x * F.x);
    float reg = 1.0 - smoothstep(0.6, 1.0, length(p / vec2(cx + W * 0.55, 0.05)));
    vec2 g = p / 0.017, id = floor(g), fr = fract(g) - 0.5;
    vec2 off = vec2(hash12(id), hash12(id + 17.0)) - 0.5;
    float on = step(1.0 - uCheek.y * 0.85, hash12(id + 5.3)) * reg;
    c = over(c, mix(uSkinShade, vec3(0.45, 0.25, 0.15), 0.25), on * af(length(fr - off * 0.55) * 0.017 - 0.0032 * (0.7 + 0.6 * hash12(id + 9.1))) * 0.8);
  }
  // ---- cheek marks ----
  float mk = uCheek.z;
  if (mk > 0.5) {
    vec2 h = A - (bc + vec2(0.01, 0.0));
    float m = 0.0; vec3 mc = uLineC;
    if (mk < 1.5) {                                            // zigzags
      m = af(min(min(segD(h, vec2(-0.035, 0.008), vec2(-0.008, -0.008), 0.0026, 0.0026), segD(h, vec2(-0.008, -0.008), vec2(0.012, 0.008), 0.0026, 0.0026)), segD(h, vec2(0.012, 0.008), vec2(0.04, -0.008), 0.0026, 0.0026)));
    } else if (mk < 2.5) {                                     // three dots
      m = af(min(min(length(h - vec2(-0.02, 0.006)), length(h - vec2(0.0, -0.008))), length(h - vec2(0.02, 0.006))) - 0.005);
      mc = uLineC * 0.9 + vec3(0.12, 0.06, 0.06);
    } else if (mk < 3.5) {                                     // two painted stripes
      for (int i = 0; i < 2; i++) m = max(m, af(segD(h, vec2(-0.03, 0.006 - 0.018 * float(i)), vec2(0.03, 0.014 - 0.018 * float(i)), 0.004, 0.0025)));
      mc = vec3(0.75, 0.18, 0.2);
    } else if (mk < 4.5) {                                     // whiskers
      for (int i = 0; i < 3; i++) m = max(m, af(segD(h, vec2(-0.025, 0.01 - 0.012 * float(i)), vec2(0.035, 0.018 - 0.02 * float(i)), 0.0018, 0.0008)));
    } else if (side < 0.0) {                                   // a plaster on the right cheek
      float an = 0.5; mat2 rt = mat2(cos(an), sin(an), -sin(an), cos(an));
      vec2 r = rt * (h - vec2(0.005, 0.005));
      float body = af(rbox(r, vec2(0.04, 0.014), 0.012)), pad = af(rbox(r, vec2(0.014, 0.011), 0.004));
      float edge = af(abs(rbox(r, vec2(0.04, 0.014), 0.012)) - 0.0011);
      vec2 dq = mod(r + 0.004, 0.008) - 0.004;
      c = over(c, vec3(0.96, 0.84, 0.68), body);
      c = over(c, vec3(0.99, 0.93, 0.84), pad);
      c = over(c, vec3(0.8, 0.62, 0.48), max(edge, af(length(dq) - 0.0012) * body * (1.0 - pad) * 0.6));
    }
    c = over(c, mc, m);
  }
  // ---- beauty mark ----
  float bm = uCheek.w;
  if (bm > 0.5) {
    vec2 p = bm < 1.5 ? vec2(cx + 0.02, cy - uEyeS.y * W - 0.03) : bm < 2.5 ? vec2(-cx - 0.02, cy - uEyeS.y * W - 0.03)
      : bm < 3.5 ? vec2(uMouth.x * 0.95, uMouth.y - 0.022) : bm < 4.5 ? vec2(-uMouth.x * 0.95, uMouth.y - 0.022) : vec2(cx + 0.06, uNose.y - 0.02);
    c = over(c, vec3(0.28, 0.17, 0.14), af(length(F - p) - 0.0045));
  }
  // ---- nose ----
  float nt = uNose.x, ns = uNose.z;
  if (nt > 0.5) {
    vec2 p = F - vec2(0.0, uNose.y);
    float n = 0.0; vec3 nc = mix(uSkinShade, uLineC, 0.25);
    if (nt < 1.5) n = af(ell(p, vec2(0.004, -0.012), vec2(0.007, 0.0045) * ns)) * 0.85;
    else if (nt < 2.5) n = af(qStroke(p, vec2(0.006, 0.02) * ns, vec2(0.016, 0.0) * ns, vec2(0.004, -0.012) * ns, 0.0016, 0.0024)) * 0.9;
    else if (nt < 3.5) { n = af(qStroke(p, vec2(0.004, 0.035) * ns, vec2(0.01, 0.01) * ns, vec2(0.002, -0.01) * ns, 0.0007, 0.0018)); nc = mix(nc, uLineC, 0.4); }
    else { vec2 r = p - vec2(0.0, -0.016); n = af(max(abs(r.x) * 1.6 + r.y - 0.012 * ns, -r.y - 0.004)) * 0.45; }
    c = over(c, nc, n);
  }
  // ---- mouth: a closed line that opens into a D or an O ----
  {
    float mw = uMouth.x * uXM.z;
    vec2 p = F - vec2(0.0, uMouth.y);
    if (abs(p.x) < mw * 1.6 + 0.02 && abs(p.y) < 0.12) {
      float o = uXM.x;
      float xn = clamp(p.x / mw, -1.0, 1.0);
      vec2 E = mouthEdges(xn, mw);
      float inside = af(abs(p.x) - mw) * af(p.y - E.x) * af(E.y - p.y) * step(0.02, o);
      // the outline: upper and lower edges as tapered polylines
      float lwm = 0.0044 * (0.75 + 0.25 * min(1.0, mw / 0.06));
      float dm = 1e3; vec2 a = vec2(0.0), a2 = vec2(0.0);
      for (int i = 0; i <= 12; i++) {
        float x = mix(-1.0, 1.0, float(i) / 12.0);
        vec2 e = mouthEdges(x, mw);
        float r = lwm * 0.5 * (0.35 + 0.65 * pow(max(1.0 - x * x, 0.0), 0.35)) * (1.0 - 0.3 * step(0.05, o));
        vec2 b = vec2(x * mw, e.x), b2 = vec2(x * mw, e.y);
        if (i > 0) dm = min(dm, min(segD(p, a, b, r, r), segD(p, a2, b2, r, r)));
        a = b; a2 = b2;
      }
      vec3 mline = mix(mix(uLineC, vec3(0.45, 0.16, 0.15), 0.35), uLipC * 0.7, uMouth.w * 0.5);
      if (uMouth.w > 0.01) c = over(c, uLipC, uMouth.w * 0.5 * af(ell(p, vec2(0.0, E.y - 0.011), vec2(mw * 0.5, 0.008))) * (1.0 - inside));
      float hgt = max(E.x - E.y, 1e-4);
      float teeth = af(p.y - (E.x - hgt * 0.42 * uXM.w)) * 0.0 + af((E.x - hgt * 0.42 * uXM.w) - p.y) * 0.0;
      teeth = step(0.05, uXM.w) * af(-(p.y - (E.x - hgt * 0.42 * uXM.w)));
      float tong = uXM2.x > 0.01 ? af(ell(p, vec2(0.0, E.y + hgt * 0.06), vec2(mw * 0.62, hgt * 0.48 * uXM2.x))) : 0.0;
      vec3 ins = mix(vec3(0.42, 0.11, 0.13), vec3(0.92, 0.45, 0.47), tong);
      ins = mix(ins, vec3(0.99, 0.98, 0.96), teeth);
      c = over(c, ins, inside);
      c = over(c, mline, af(dm));
    }
  }
  // ---- the eyes ----
  if (abs(q.x) < 1.0 && q.y > -1.5 && q.y < 1.6) {
    eHt = uEyeS.x; eHb = uEyeS.y; eEt = uEyeS.z; eEb = uEyeS.w; eSkew = uEyeL.x; eSlant = uEyeP.w; eDrop = uEyeL.y;
    eOpen = uEyeK.z > 0.5 ? 0.0 : X.x * (1.0 - uBlink); eLower = X.y; eArc = X.z; eAngle = X.w;
    if (uMake.x > 0.01) {                                      // makeup: eye shadow above the lid
      float above = q.y - eUp(clamp(q.x * 2.0, -1.0, 1.0));
      float sh = smoothstep(-0.05, 0.02, above) * (1.0 - smoothstep(0.0, 0.32, above)) * (1.0 - smoothstep(0.6, 0.85, abs(q.x + 0.05)));
      c = over(c, uShadowC, sh * uMake.x * 0.6);
    }
    vec4 e = eyeLayer(q, side, side > 0.0 ? uIrisC : uIrisC2);
    c = mix(c, e.rgb, e.a);
    if (uXF.z > 0.01) {                                        // tears welling on the lower lid
      float well = ae(abs(q.y - eLo(clamp(q.x * 2.0, -1.0, 1.0)) - 0.05) - 0.05) * ae(abs(q.x) - 0.48);
      c = over(c, vec3(0.75, 0.9, 1.0), well * 0.75 * uXF.z);
    }
  }
  // ---- tears down the cheeks ----
  if (uXF.z > 0.01) {
    vec2 h = vec2(ax - cx - W * 0.22, F.y - (cy - uEyeS.y * W * 0.8));
    float wob = 0.004 * sin(h.y * 90.0);
    float st = af(abs(h.x - wob + h.y * 0.12) - 0.009 * (1.0 - smoothstep(-0.12, -0.02, h.y) * 0.3)) * af(h.y) * af(-h.y - 0.13);
    float drop = af(ell(h, vec2(-0.012, -0.145), vec2(0.013, 0.017)));
    float t = max(st, drop) * uXF.z;
    c = over(c, vec3(0.62, 0.84, 1.0), t * 0.8);
    c = over(c, vec3(1.0), t * af(abs(h.x - wob + h.y * 0.12 + 0.004) - 0.0018));
  }
  // ---- brows ----
  if (abs(q.x) < 1.4 && q.y > 0.0 && q.y < 2.2) c = over(c, uBrowC, ae(browD(q, XB)));
  return mix(col, c, front);
}
`;
