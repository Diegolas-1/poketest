// Reads the running game: memory through the emulator, pictures from the ROM.
import { SYM } from './syms.js';

const A = (name) => SYM[name][1];
export const FIRST_STILL_SPRITE = 0x3d;
export const MAP_TILESET_SIZE = 0x60;
const PLAYER_SCREEN_X = 0x40;
const PLAYER_SCREEN_Y = 0x3c;
// text box border tiles in wTileMap: ┌ ─ ┐ │ └ ┘
const BOX_TL = 0x79, BOX_TR = 0x7b, BOX_BL = 0x7d, BOX_BR = 0x7e;

export class GB {
  constructor(emu, rom) {
    this.emu = emu;
    this.m = emu.module;
    this.e = emu.e;
    this.rom = rom;
    this.wramPtr = this.m._emulator_get_wram_ptr(this.e);
  }

  // One byte of Game Boy memory. WRAM is read straight from the emulator's
  // memory; anything else goes through the emulator's bus.
  b(addr) {
    if (addr >= 0xc000 && addr < 0xe000) return this.m.HEAPU8[this.wramPtr + addr - 0xc000];
    return this.m._emulator_read_mem(this.e, addr);
  }
  w(addr) { return this.b(addr) | (this.b(addr + 1) << 8); }
  s8(addr) { const v = this.b(addr); return v > 127 ? v - 256 : v; }

  romByte(bank, addr) {
    return this.rom[addr < 0x4000 ? addr : bank * 0x4000 + addr - 0x4000];
  }
  romBytes(bank, addr, n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.romByte(bank, addr + i);
    return out;
  }

  // 2bpp tile (16 bytes) -> 64 shades 0-3
  static decode(bytes, off = 0) {
    const t = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      const lo = bytes[off + y * 2], hi = bytes[off + y * 2 + 1];
      for (let x = 0; x < 8; x++) t[y * 8 + x] = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
    }
    return t;
  }

  // The current map as a grid of 8x8 tile numbers, borders and connections
  // included (wOverworldMap has 3 blocks of border on every side).
  readMap() {
    const w = this.b(A('wCurMapWidth')), h = this.b(A('wCurMapHeight'));
    const tileset = this.b(A('wCurMapTileset'));
    const bank = this.b(A('wTilesetBank'));
    const blocksPtr = this.w(A('wTilesetBlocksPtr'));
    const gfxPtr = this.w(A('wTilesetGfxPtr'));
    const bw = w + 6, bh = h + 6;
    const blocks = new Uint8Array(bw * bh);
    for (let i = 0; i < blocks.length; i++) blocks[i] = this.b(A('wOverworldMap') + i);
    const blockset = this.romBytes(bank, blocksPtr, 256 * 16);
    const tw = bw * 4, th = bh * 4;
    const tiles = new Uint8Array(tw * th);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const blk = blocks[by * bw + bx];
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        tiles[(by * 4 + ty) * tw + bx * 4 + tx] = blockset[blk * 16 + ty * 4 + tx];
      }
    }
    const gfx = [];
    const raw = this.romBytes(bank, gfxPtr, MAP_TILESET_SIZE * 16);
    for (let i = 0; i < MAP_TILESET_SIZE; i++) gfx.push(GB.decode(raw, i * 16));
    return {
      map: this.b(A('wCurMap')), tileset, w, h, tw, th, tiles, gfx,
      key: `${this.b(A('wCurMap'))}:${tileset}:${w}x${h}:${blocks.join(',')}`,
    };
  }

  // Video memory can't be read while the screen is being drawn (mode 3).
  vramOpen() { return (this.b(0xff41) & 3) !== 3 || !(this.b(0xff40) & 0x80); }

  // Live picture of a background tile (animated water and flowers), or null
  // when video memory is busy.
  vramTile(id) {
    if (!this.vramOpen()) return null;
    const bytes = new Uint8Array(16);
    const base = 0x9000 + id * 16;
    for (let i = 0; i < 16; i++) bytes[i] = this.b(base + i);
    return GB.decode(bytes);
  }

  // A sprite sheet: 6 frames of 16x16 (stand down, up, left; walk down, up, left).
  readSprite(pic) {
    const [bank, table] = SYM.SpriteSheetPointerTable;
    const e = table + (pic - 1) * 4;
    const ptr = this.romByte(bank, e) | (this.romByte(bank, e + 1) << 8);
    const size = this.romByte(bank, e + 2);
    const sbank = this.romByte(bank, e + 3);
    const still = pic >= FIRST_STILL_SPRITE;
    const n = still ? 4 : 24;
    const raw = this.romBytes(sbank, ptr, n * 16);
    const tiles = [];
    for (let i = 0; i < n; i++) tiles.push(GB.decode(raw, i * 16));
    return { pic, still, tiles, size };
  }

  isHidden(slot) {
    const list = A('wToggleableObjectList');
    for (let i = 0; i < 64; i += 2) {
      const s = this.b(list + i);
      if (s === 0xff) return false;
      if (s === slot) {
        const g = this.b(list + i + 1);
        return (this.b(A('wToggleableObjectFlags') + (g >> 3)) >> (g & 7) & 1) === 1;
      }
    }
    return false;
  }

  // Everything the 3D view needs for one frame.
  state() {
    const s = {
      map: this.b(A('wCurMap')),
      tileset: this.b(A('wCurMapTileset')),
      battle: this.b(A('wIsInBattle')),
      x: this.b(A('wXCoord')),
      y: this.b(A('wYCoord')),
      walk: this.b(A('wWalkCounter')),
      bgp: this.b(0xff47),
      lcdc: this.b(0xff40),
    };
    const d1 = A('wSpriteStateData1'), d2 = A('wSpriteStateData2');
    // The player's position, in map steps, with the walk in progress.
    const pys = this.s8(d1 + 3), pxs = this.s8(d1 + 5);
    const k = s.walk > 0 ? (8 - s.walk) / 8 : 0;
    s.px = s.x + pxs * k;
    s.py = s.y + pys * k;
    s.sprites = [];
    for (let i = 0; i < 16; i++) {
      const a = d1 + i * 16, b = d2 + i * 16;
      const pic = this.b(a);
      if (!pic) continue;
      if (i > 0 && this.isHidden(i)) continue;
      const img = this.b(a + 2);
      const sp = { slot: i, pic, img, facing: this.b(a + 9) };
      if (i === 0) {
        sp.x = s.px; sp.y = s.py;
      } else if (img !== 0xff) {
        // screen pixels just off the top or left edge wrap round (-4 reads 252)
        const wrap = (v) => (v >= 0xc0 ? v - 256 : v);
        sp.x = s.px + (wrap(this.b(a + 6)) - PLAYER_SCREEN_X) / 16;
        sp.y = s.py + (wrap(this.b(a + 4)) - PLAYER_SCREEN_Y) / 16;
      } else {
        sp.x = this.b(b + 5) - 4;
        sp.y = this.b(b + 4) - 4;
      }
      s.sprites.push(sp);
    }
    s.bubble = this.bubble(s);
    s.boxes = this.boxes();
    s.mapTiles = this.mapTileShare();
    return s;
  }

  // Text boxes and menus on screen, as tile rectangles [x, y, w, h].
  boxes() {
    const tm = A('wTileMap');
    const at = (x, y) => this.b(tm + y * 20 + x);
    const out = [];
    for (let y = 0; y < 18; y++) for (let x = 0; x < 20; x++) {
      if (at(x, y) !== BOX_TL) continue;
      let x2 = x + 1; while (x2 < 20 && at(x2, y) !== BOX_TR) x2++;
      let y2 = y + 1; while (y2 < 18 && at(x, y2) !== BOX_BL) y2++;
      if (x2 < 20 && y2 < 18 && at(x2, y2) === BOX_BR) out.push([x, y, x2 - x + 1, y2 - y + 1]);
    }
    return out;
  }

  // The emotion bubble ("!" when Oak calls out), drawn straight into OAM with
  // tiles $f8-$fb. Returns its picture and where it is, or null.
  bubble(s) {
    const ents = [];
    const oam = SYM.wShadowOAM[1];
    for (let i = 0; i < 40; i++) {
      const a = oam + i * 4, tile = this.b(a + 2);
      if (tile >= 0xf8 && tile <= 0xfb) ents.push({ y: this.b(a) - 16, x: this.b(a + 1) - 8, tile, attr: this.b(a + 3) });
    }
    if (!ents.length) return null;
    if (!this.vramOpen()) return this.lastBubble || null;
    const x0 = Math.min(...ents.map((e) => e.x)), y0 = Math.min(...ents.map((e) => e.y));
    const pix = new Uint8Array(256);
    for (const e of ents) {
      const raw = new Uint8Array(16);
      for (let i = 0; i < 16; i++) raw[i] = this.b(0x8000 + e.tile * 16 + i);
      const t = GB.decode(raw);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const sx = e.attr & 0x20 ? 7 - x : x, sy = e.attr & 0x40 ? 7 - y : y;
        const dx = e.x - x0 + x, dy = e.y - y0 + y;
        if (dx < 16 && dy < 16) pix[dy * 16 + dx] = t[sy * 8 + sx];
      }
    }
    this.lastBubble = { x: s.px + (x0 - 0x40) / 16, y: s.py + (y0 + 4 - 0x3c) / 16, pix, key: pix.join('') };
    return this.lastBubble;
  }

  screenTile(x, y) { return this.b(A('wTileMap') + y * 20 + x); }

  // Share of the screen's tiles that are map tiles (not font or menu tiles).
  mapTileShare() {
    const tm = A('wTileMap');
    let n = 0;
    for (let i = 0; i < 360; i++) if (this.b(tm + i) < MAP_TILESET_SIZE) n++;
    return n / 360;
  }

  frameBuffer() {
    return new Uint8ClampedArray(this.m.HEAP8.buffer,
      this.m._get_frame_buffer_ptr(this.e), this.m._get_frame_buffer_size(this.e));
  }
}
