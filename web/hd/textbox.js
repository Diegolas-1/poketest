// Our own text boxes and menus. The game still writes its text into its screen
// buffer (wTileMap); we read the characters back and draw them in an HD panel:
// the classic double border with a Poké Ball in each corner, redrawn as crisp
// pixel art, and a modern pixel font.

// pokered's character map (constants/charmap.asm), the parts that show in boxes.
const CHARS = { 0x7f: ' ', 0x4a: 'PKMN', 0x54: 'POKé', 0x56: '……', 0x5b: 'PC', 0x5c: 'TM',
  0x5d: 'TRAINER', 0x5e: 'ROCKET', 0x6d: ':', 0x70: '‘', 0x71: '’', 0x72: '“', 0x73: '”',
  0x74: '·', 0x75: '…', 0x9a: '(', 0x9b: ')', 0x9c: ':', 0x9d: ';', 0x9e: '[', 0x9f: ']',
  0xba: 'é', 0xbb: '\'d', 0xbc: '\'l', 0xbd: '\'s', 0xbe: '\'t', 0xbf: '\'v', 0xe0: '\'',
  0xe1: 'PK', 0xe2: 'MN', 0xe3: '-', 0xe4: '\'r', 0xe5: '\'m', 0xe6: '?', 0xe7: '!', 0xe8: '.',
  0xef: '♂', 0xf0: '¥', 0xf1: '×', 0xf2: '.', 0xf3: '/', 0xf4: ',', 0xf5: '♀' };
for (let i = 0; i < 26; i++) { CHARS[0x80 + i] = String.fromCharCode(65 + i); CHARS[0xa0 + i] = String.fromCharCode(97 + i); }
for (let i = 0; i < 10; i++) CHARS[0xf6 + i] = String(i);
const CURSOR = 0xed, CURSOR_OFF = 0xec, PROMPT = 0xee;
const BORDER = new Set([0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e]);

const INK = '#23284f';
const PAL = { K: '#1b1d33', R: '#e8463c', r: '#a32a2c', h: '#ffb1a4', W: '#ffffff', w: '#c9cbdc' };
const BALL = [
  '....KKKK....',
  '..KKRRRRKK..',
  '.KRhhRRRRrK.',
  '.KRhRRRRRrK.',
  'KRRRRKKRRRrK',
  'KKKKKWWKKKKK',
  'KKKKKWWKKKKK',
  'KWWWWKKWWWwK',
  '.KWWWWWWWwK.',
  '.KWWWWWWwwK.',
  '..KKwwwwKK..',
  '....KKKK....',
];

let fontReady = false;
const FONT = 'Pixelify Sans';
if (document.fonts) {
  document.fonts.load(`600 20px "${FONT}"`).then(() => { fontReady = true; });
}

function pixelArt(ctx, rows, x, y, u) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const c = PAL[rows[j][i]];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + i * u), Math.round(y + j * u), Math.ceil(u), Math.ceil(u));
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function triangle(ctx, x, y, s, dir, fill) {
  ctx.beginPath();
  if (dir === 'right') { ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.lineTo(x, y + 2 * s); }
  else { ctx.moveTo(x, y); ctx.lineTo(x + 2 * s, y); ctx.lineTo(x + s, y + s); }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  else { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s / 4); ctx.stroke(); }
}

// One panel: rect in device pixels, u = size of one Game Boy pixel.
function panel(ctx, x, y, w, h, u) {
  const r = 4 * u;
  ctx.save();
  ctx.shadowColor = 'rgba(10, 14, 40, 0.38)';
  ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 2.5 * u;
  roundRect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#fffdf6'); g.addColorStop(1, '#f2e9d6');
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  // double frame, like the original box
  ctx.lineWidth = 1.5 * u;
  ctx.strokeStyle = INK;
  roundRect(ctx, x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u, r - u); ctx.stroke();
  ctx.lineWidth = 0.75 * u;
  ctx.strokeStyle = 'rgba(35, 40, 79, 0.55)';
  roundRect(ctx, x + 4.5 * u, y + 4.5 * u, w - 9 * u, h - 9 * u, r - 2 * u); ctx.stroke();
  // Poké Balls on the corners
  const b = 12 * u * 0.85, bu = u * 0.85, o = 6 * bu;
  for (const [cx, cy] of [[x + 2 * u, y + 2 * u], [x + w - 2 * u, y + 2 * u], [x + 2 * u, y + h - 2 * u], [x + w - 2 * u, y + h - 2 * u]]) {
    pixelArt(ctx, BALL, cx - o, cy - o, bu);
  }
  return b;
}

// Draws every box. ctx is in device pixels; px = device pixels per CSS pixel.
// tile(x, y) reads the screen buffer; fb is the Game Boy picture (canvas) for
// tiles we have no character for.
export function drawBoxes(ctx, px, W, H, boxes, tile, fb, t) {
  if (!boxes.length) return;
  let s = Math.min(W * 0.8 / 160, H * 0.34 / 48);
  const u = s * px;
  const ox = (W - 160 * s) / 2 * px, oy = (H - 144 * s - Math.max(10, H * 0.025)) * px;
  const fontPx = Math.round(9.5 * u);
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingEnabled = false;
  for (const [bx, by, bw, bh] of boxes) {
    const x = ox + bx * 8 * u, y = oy + by * 8 * u, w = bw * 8 * u, h = bh * 8 * u;
    panel(ctx, x, y, w, h, u);
    ctx.font = `600 ${fontPx}px "${fontReady ? FONT : 'monospace'}", monospace`;
    for (let row = by + 1; row < by + bh - 1; row++) {
      let run = '', runX = -1;
      const flush = () => {
        if (run.trim()) {
          ctx.fillStyle = INK;
          // a zero-width non-joiner after f stops the font joining fi / fl / ff
          ctx.fillText(run.replace(/\s+$/, '').replace(/f(?=[a-z])/g, 'f\u200c'), x + (runX - bx) * 8 * u + u, y + (row - by) * 8 * u + 7.5 * u);
        }
        run = ''; runX = -1;
      };
      let spaces = 0;
      for (let col = bx + 1; col < bx + bw - 1; col++) {
        const c = tile(col, row);
        const cx = x + (col - bx) * 8 * u, cy = y + (row - by) * 8 * u;
        if (c === CURSOR || c === CURSOR_OFF) {
          flush();
          triangle(ctx, cx + 2 * u, cy + 1 * u, 3 * u, 'right', c === CURSOR ? '#e8463c' : null);
          continue;
        }
        if (c === PROMPT) {
          flush();
          const bob = Math.round(Math.sin(t / 160) * 1.2) * u;
          triangle(ctx, cx + 1 * u, cy + 3 * u + bob, 3 * u, 'down', '#e8463c');
          continue;
        }
        if (BORDER.has(c)) { flush(); continue; }
        const ch = CHARS[c];
        if (ch === undefined) {
          flush();
          ctx.drawImage(fb, col * 8, row * 8, 8, 8, cx, cy, 8 * u, 8 * u);
          continue;
        }
        if (ch === ' ') {
          spaces++;
          if (spaces >= 2) { flush(); continue; }
          if (runX >= 0) run += ' ';
          continue;
        }
        spaces = 0;
        if (runX < 0) runX = col;
        run += ch;
      }
      flush();
    }
  }
}
