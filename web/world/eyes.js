// The eye atlas drawn as clean vector art (canvas paths, fills and gradients) instead of the
// base model's small game bitmap (face_on_0 in web/world/local/ash.glb), so the eyes stay
// crisp at any size: solid tapered lids and lashes, flat irises with one soft gradient, a
// cel-shaded shadow under the lid, round highlights, tapered brows.
//
// It keeps the bitmap's layout, which the face's UVs and everything else rely on: 4x2 cells of
// 128x64 (atlas pixels; drawn at `scale` times that), two eyes in each, mirror images about
// x = 50.5, the skin in two bands (darker above y 34) with a strip at the right; cell 0 open,
// cell 1 narrower (grown-ups: cast.js copies it into cell 0), cell 2 closed (blinking moves the
// UVs by half the width), the others other expressions. Ash's colours are the default; the
// town's people get theirs drawn in (cast.js eyeTex): their skin, brows, irises and lashes.
//   drawEyes({ scale, skin: [4 colours: EYE_COLOURS.skin's], brow, browW, iris: [3 colours: top
//     to bottom], lashes: a colour (a girl's lashes), forehead: true | 'smooth' (swept-back hair:
//     the forehead lit skin, with lines unless smooth), happy (brows raised and arched, no frown),
//     clear (no skin: transparent round the eyes and brows) })
//     -> canvas
const SKIN = ['#cdaca4', '#ffdcd5', '#c5a49c', '#eed0c5'];   // the bands above and below, the strip's two
const INK = '#1b1418', BROW = '#2a2024', LID_SHADE = 'rgba(70,46,72,0.24)';
const IRIS = ['#241b1f', '#3e3134', '#6e5658'], RIM = '#160f12', PUPIL = '#0e0a0c';
export const EYE_COLOURS = { skin: SKIN, iris: IRIS };

// the cells: o = open, n = narrow, c = closed (happy), a = angry closed; per cell the brow
// (outer end y, inner end y, how high its middle lifts), the eye's top (the lid at its highest),
// the iris's centre x shift (looking aside) and size, a crease above the lid
const CELLS = [
  { k: 'o', brow: [17.5, 26.5, 1.2], top: 30.2, iris: 0, r: 1, crease: false },
  { k: 'n', brow: [19.5, 26.5, 0.8], top: 35, iris: 0, r: 0.86, crease: false },
  { k: 'c', brow: [21.5, 27, 1] },
  { k: 'o', brow: [15, 25.5, 1.6], top: 30, iris: 0, r: 0.9, white: true, crease: false },
  { k: 'o', brow: [15.5, 26, 1.4], top: 30.2, iris: 0, r: 1, crease: true },
  { k: 'o', brow: [18, 26.5, 1.2], top: 30.2, iris: 0.6, r: 1, crease: false },
  { k: 'o', brow: [18, 26.5, 1.2], top: 30.2, iris: 2.4, r: 0.96, crease: false },
  { k: 'a', brow: [19, 27.5, -0.6] },
];

const lerp = (a, b, t) => a + (b - a) * t;
// a filled stroke along a quadratic curve a -> c -> b, w0 thick at a, w1 at b, wm in the middle
function taper(g, a, c, b, w0, wm, w1, n = 24) {
  const P = [], N = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
    const dx = 2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), dy = 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1]), l = Math.hypot(dx, dy) || 1;
    const w = (t < 0.5 ? lerp(w0, wm, Math.sin(t * Math.PI)) : lerp(w1, wm, Math.sin(t * Math.PI))) / 2;
    P.push([x, y]); N.push([-dy / l * w, dx / l * w]);
  }
  g.beginPath();
  P.forEach((p, i) => (i ? g.lineTo(p[0] + N[i][0], p[1] + N[i][1]) : g.moveTo(p[0] + N[i][0], p[1] + N[i][1])));
  for (let i = n; i >= 0; i--) g.lineTo(P[i][0] - N[i][0], P[i][1] - N[i][1]);
  g.closePath(); g.fill();
}

// one eye, the atlas's left one (its outer corner to the left), in cell units
function eye(g, C, lashes, IR) {
  const x0 = 18.2, x1 = 37, bot = 54.4, top = C.top, mid = (x0 + x1) / 2 - 0.4;
  // the eye's opening: under the lid's curve, round at the bottom
  const open = new Path2D();
  open.moveTo(x0 + 0.6, top + 6.5);
  open.bezierCurveTo(x0 + 2.5, top - 0.2, x1 - 4, top - 0.6, x1 - 0.4, top + 4.2);
  open.bezierCurveTo(x1 + 0.6, top + 12, x1 - 2.5, bot, mid + 1, bot);
  open.bezierCurveTo(x0 + 2.5, bot, x0 - 0.4, top + 14, x0 + 0.6, top + 6.5);
  open.closePath();
  g.save(); g.clip(open);
  g.fillStyle = '#ffffff'; g.fillRect(x0 - 2, top - 2, x1 - x0 + 4, bot - top + 4);
  // the iris: tall, flat colour graded from dark under the lid to lighter below, a dark rim
  const icx = mid + 0.6 + (C.iris || 0), rx = 6.1 * C.r, ry = 11.4 * C.r, icy = bot - ry + 0.6;
  const gr = g.createLinearGradient(0, icy - ry, 0, icy + ry);
  gr.addColorStop(0, IR[0]); gr.addColorStop(0.45, IR[1]); gr.addColorStop(1, IR[2]);
  g.fillStyle = RIM; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = gr; g.beginPath(); g.ellipse(icx, icy, rx - 0.75, ry - 0.75, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = PUPIL; g.beginPath(); g.ellipse(icx + 0.1, icy + 0.8, rx * 0.42, ry * 0.5, 0, 0, Math.PI * 2); g.fill();
  // a soft lighter crescent low in the iris
  g.fillStyle = 'rgba(150,120,118,0.35)'; g.beginPath(); g.ellipse(icx, icy + ry * 0.55, rx * 0.62, ry * 0.26, 0, 0, Math.PI * 2); g.fill();
  // the lid's cel shadow over the white and the iris
  g.fillStyle = LID_SHADE; g.beginPath();
  g.moveTo(x0 - 1, top - 1); g.lineTo(x1 + 1, top - 1); g.lineTo(x1 + 1, top + 5.2);
  g.bezierCurveTo(x1 - 4, top + 2.6, x0 + 3, top + 3.2, x0 - 1, top + 8.8); g.closePath(); g.fill();
  // highlights: a big one up by the lid, a small one low on the other side
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(icx - rx * 0.4, icy - ry * 0.45, 2.05 * C.r, 2.5 * C.r, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(icx + rx * 0.4, icy + ry * 0.48, 0.95 * C.r, 0.8 * C.r, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  // the upper lid: a solid line thickest at the outer corner, its lash flicked out and down
  g.fillStyle = lashes || INK;
  taper(g, [x0 - 0.3, top + 7], [x0 + 3.5, top - 1.4], [mid + 1, top - 0.2], 2.6, 3.4, 2.8);
  taper(g, [mid, top - 0.25], [x1 - 1.5, top - 0.1], [x1 + 0.2, top + 4.8], 2.8, 2.4, 1.1);
  taper(g, [x0 + 0.8, top + 4], [x0 - 1.6, top + 7.5], [x0 - 2.6, top + 11], 2.2, 1.6, 0.2);
  if (lashes) {   // a girl's lashes: a second flick up and out, and the lid a touch heavier
    taper(g, [x0 + 1.5, top + 1.5], [x0 - 1.2, top + 0.2], [x0 - 2.8, top + 2.4], 1.8, 1.3, 0.2);
    taper(g, [x0 + 3.5, top + 0.2], [x0 + 1.6, top - 2.2], [x0 + 0.6, top - 2.6], 1.4, 1, 0.2);
  }
  // the lower lid: a short thin line under the outer half
  g.fillStyle = INK;
  taper(g, [x0 + 2.4, bot - 3.2], [x0 + 4.5, bot + 0.4], [mid + 1.5, bot + 0.6], 0.2, 1.1, 0.3);
  if (C.crease) { g.fillStyle = 'rgba(40,28,34,0.7)'; taper(g, [x0 + 2, top - 1.8], [mid, top - 4.6], [x1 - 1.5, top - 2.2], 0.2, 0.8, 0.2); }
}
// closed eyes: a curved lid line (k 'c': bowed down, happy; 'a': bowed up), lashes at the corner
function closed(g, C, lashes) {
  const x0 = 17.6, x1 = 37.2;
  g.fillStyle = lashes || INK;
  if (C.k === 'c') {
    taper(g, [x0, 46.2], [27.5, 54.6], [x1, 47.4], 1.4, 2.8, 1.2);
    taper(g, [x0 + 1, 47], [x0 - 1.2, 47.6], [x0 - 2.4, 49.4], 1.6, 1.1, 0.2);
  } else {
    taper(g, [x0 + 0.4, 46.8], [27.5, 39.2], [x1, 45.4], 1.2, 2.8, 1.2);
    taper(g, [x0 + 1, 46.2], [x0 - 1, 47], [x0 - 2.2, 48.6], 1.6, 1.1, 0.2);
  }
}
function brow(g, C, col, k, happy) {
  let [yo, yi, lift] = C.brow;
  if (happy) { const m = (yo + yi) / 2 - 1; yo = m + 0.5; yi = m + 0.5; lift += 1.6; }   // soft, raised, arched: no frown
  g.fillStyle = col;
  taper(g, [21.5, yo], [31, (yo + yi) / 2 - lift], [40.5, yi], 0.5 * k, 2.6 * k, 1.5 * k);
}

export function drawEyes({ scale = 4, lashes = null, skin = SKIN, brow: browCol = BROW, browW = 1, iris = IRIS, forehead = false, happy = false, clear = false } = {}) {
  const c = document.createElement('canvas'); c.width = 512 * scale; c.height = 128 * scale;
  const g = c.getContext('2d');
  CELLS.forEach((C, i) => {
    const ox = (i % 4) * 128, oy = Math.floor(i / 4) * 64;
    g.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    // the skin: the bands and the strip (a hair over the cell's edges, so no seams show)
    if (!clear) {   // (clear: no skin, just the eyes and brows, for a head that has its own)
      g.fillStyle = skin[0]; g.fillRect(-0.1, -0.1, 99.6, 34.2);
      g.fillStyle = skin[1]; g.fillRect(-0.1, 34, 99.6, 30.1);
      g.fillStyle = skin[2]; g.fillRect(99.4, -0.1, 28.7, 34.2);
      g.fillStyle = skin[3]; g.fillRect(99.4, 34, 28.7, 30.1);
    }
    if (forehead && !clear) {
      // swept-back hair: the band above lit like the skin below, easing into it over the brows,
      // and (unless smooth) two lines across the forehead
      const fg = g.createLinearGradient(0, 26.9, 0, 32);
      fg.addColorStop(0, skin[1]); fg.addColorStop(1, skin[0]);
      g.fillStyle = fg; g.fillRect(-0.1, -0.1, 128.2, 34.2);
      if (forehead !== 'smooth') {
        g.strokeStyle = 'rgba(120,80,70,0.3)'; g.lineWidth = 1.5; g.lineCap = 'round';
        for (const [ly, lw] of [[0.1, 0.22], [0.19, 0.27]]) {
          g.beginPath();
          for (let k = 0; k <= 20; k++) { const cx = 0.38 - lw + 2 * lw * k / 20, x = cx * 128, y = (ly + 0.03 * Math.cos((cx - 0.38) * 6)) * 64; k ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
      }
    }
    for (const m of [false, true]) {
      g.save();
      if (m) g.transform(-1, 0, 0, 1, 101, 0);   // the other eye: the mirror image
      brow(g, C, browCol, browW, happy);
      if (C.k === 'o' || C.k === 'n') eye(g, C, lashes, iris); else closed(g, C, lashes);
      g.restore();
    }
  });
  c.dataset.eyes = 'vector';
  return c;
}
