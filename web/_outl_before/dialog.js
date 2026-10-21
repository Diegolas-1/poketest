// The text box: the same panel as the HD-2D view (double border, Poké Ball
// corners, Pixelify Sans), typing its text out, with a bouncing arrow.
import { panel, triangle, INK, FONT } from '../hd/textbox.js';

export class Dialog {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.lines = null; this.i = 0; this.shown = 0; this.onDone = null;
    this.prompt = null;
  }
  get open() { return !!this.lines; }
  say(lines, onDone) { this.lines = lines; this.i = 0; this.shown = 0; this.onDone = onDone || null; }
  // A press: finish the line, or go to the next one, or close.
  next() {
    if (!this.lines) return;
    const line = this.lines[this.i];
    if (this.shown < line.length) { this.shown = line.length; return; }
    this.i++; this.shown = 0;
    if (this.i >= this.lines.length) { const f = this.onDone; this.lines = null; if (f) f(); }
  }
  // Wraps text into rows that fit the width.
  wrap(text, w) {
    const words = text.split(' '), rows = []; let row = '';
    for (const word of words) {
      const t = row ? row + ' ' + word : word;
      if (this.ctx.measureText(t).width > w && row) { rows.push(row); row = word; } else row = t;
    }
    if (row) rows.push(row);
    return rows;
  }
  draw(dt, t, W, H, px) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    // the "use" prompt over something nearby
    if (this.prompt && !this.lines) {
      const { x, y, label } = this.prompt;
      ctx.font = `600 ${Math.round(15 * px)}px "${FONT}", monospace`;
      const tw = ctx.measureText(label).width, bw = tw + 44 * px, bh = 30 * px;
      const bx = x * px - bw / 2, by = y * px - bh - 10 * px;
      ctx.fillStyle = 'rgba(255,253,246,0.94)'; ctx.strokeStyle = INK; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10 * px); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8463c'; ctx.beginPath(); ctx.arc(bx + 16 * px, by + bh / 2, 9 * px, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(12 * px)}px "${FONT}", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('A', bx + 16 * px, by + bh / 2 + px);
      ctx.fillStyle = INK; ctx.font = `600 ${Math.round(15 * px)}px "${FONT}", monospace`; ctx.textAlign = 'left';
      ctx.fillText(label, bx + 32 * px, by + bh / 2 + px);
    }
    if (!this.lines) return;
    const line = this.lines[this.i];
    this.shown = Math.min(line.length, this.shown + dt * 55);
    const u = Math.min(W * 0.78 / 160, H * 0.3 / 48) * px;
    const w = 160 * u, h = 48 * u, x = (W * px - w) / 2, y = H * px - h - 16 * px;
    panel(ctx, x, y, w, h, u);
    ctx.font = `600 ${Math.round(9 * u)}px "${FONT}", monospace`;
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const rows = this.wrap(line.slice(0, Math.floor(this.shown)), w - 22 * u);
    const full = this.wrap(line, w - 22 * u);
    rows.slice(0, 3).forEach((r, k) => ctx.fillText(r.replace(/f(?=[a-z])/g, 'f‌'), x + 11 * u, y + 17 * u + k * 12 * u));
    if (this.shown >= line.length) {
      const bob = Math.round(Math.sin(t * 6) * 1.2) * u;
      triangle(ctx, x + w - 16 * u, y + h - 11 * u + bob, 3 * u, 'down', '#e8463c');
    }
    void full;
  }
}
