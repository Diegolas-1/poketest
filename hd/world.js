// Builds the 3D scene for one map. One world unit is one 8x8 tile; x runs east,
// z runs south, y is up. The ground lies at y = 0.
import * as THREE from 'three';
import { RAMPS, SPRITE_COLORS, tilesetConfig } from './tilesets.js';
import { GB, FIRST_STILL_SPRITE } from './gb.js';

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RAMP_RGB = Object.fromEntries(Object.entries(RAMPS).map(([k, v]) => [k, v.map(rgb)]));
export const BORDER = 12; // tiles of border around the map in wOverworldMap

function makeTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  return t;
}

// Paints a rectangle of tiles into a canvas. tile(tx, ty) gives the tile number
// (or -1 for nothing), ramp(tx, ty, id) the ramp name. With cutout, shade-0
// pixels connected to the outside become transparent (the background around
// trees, signs and roof corners).
function paint(map, x0, y0, w, h, tile, ramp, cutout = false, pad = 0) {
  const W = w * 8, H = h * 8;
  const shade = new Int8Array(W * H).fill(-1);
  const cols = new Array(W * H);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const id = tile(x0 + tx, y0 + ty);
    if (id < 0) continue;
    const g = map.gfx[id] || map.gfx[0];
    const r = RAMP_RGB[ramp(x0 + tx, y0 + ty, id)] || RAMP_RGB.path;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = (ty * 8 + y) * W + tx * 8 + x;
      shade[i] = g[y * 8 + x];
      cols[i] = r[g[y * 8 + x]];
    }
  }
  const alpha = new Uint8Array(W * H).fill(255);
  for (let i = 0; i < W * H; i++) if (shade[i] < 0) alpha[i] = 0;
  if (cutout) {
    const q = [];
    const push = (i) => { if (shade[i] === 0 && alpha[i]) { alpha[i] = 0; q.push(i); } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % W, y = (i / W) | 0;
      if (x > 0) push(i - 1); if (x < W - 1) push(i + 1);
      if (y > 0) push(i - W); if (y < H - 1) push(i + W);
      // also flood through transparent (empty) pixels
    }
  }
  const c = document.createElement('canvas');
  c.width = W + pad * 2; c.height = H + pad * 2;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const col = cols[i] || [0, 0, 0];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(img, pad, pad);
  return c;
}

// Every panel casts its shadow from both sides; a one-sided panel lit from the
// front would otherwise cast nothing.
function solid(hex) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.95, metalness: 0, shadowSide: THREE.DoubleSide });
}

// Invisible, but casts a shadow (stand-ins for flat pictures).
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

function texMat(canvas, cutout) {
  const m = new THREE.MeshStandardMaterial({ map: makeTexture(canvas), roughness: 0.95, metalness: 0, shadowSide: THREE.DoubleSide });
  if (cutout) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
  return m;
}

// A quad from four corners (bottom-left, bottom-right, top-right, top-left),
// with the texture's bottom edge on the first two.
function quad(a, b, c, d, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// A standing card: bottom edge from x0 to x1 at depth z, height h.
function card(x0, x1, z, h, mat, lean = 0) {
  return quad([x0, 0, z], [x1, 0, z], [x1, h, z - lean], [x0, h, z - lean], mat);
}

// 4-connected groups of tiles for which test(tx, ty) is true.
function components(tw, th, test) {
  const seen = new Uint8Array(tw * th), out = [];
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    if (seen[y * tw + x] || !test(x, y)) continue;
    const cells = [], q = [[x, y]];
    seen[y * tw + x] = 1;
    while (q.length) {
      const [cx, cy] = q.pop();
      cells.push([cx, cy]);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th || seen[ny * tw + nx] || !test(nx, ny)) continue;
        seen[ny * tw + nx] = 1; q.push([nx, ny]);
      }
    }
    let c0 = 1e9, c1 = -1, r0 = 1e9, r1 = -1;
    for (const [cx, cy] of cells) { c0 = Math.min(c0, cx); c1 = Math.max(c1, cx); r0 = Math.min(r0, cy); r1 = Math.max(r1, cy); }
    const set = new Set(cells.map(([a, b]) => b * tw + a));
    out.push({ cells, set, c0, c1, r0, r1 });
  }
  return out;
}

export class World {
  constructor(map, gb) {
    this.map = map;
    this.gb = gb;
    this.cfg = tilesetConfig(map.tileset);
    this.group = new THREE.Group();
    this.animated = [];          // [tx, ty, id] ground tiles that animate
    this.indoor = !this.cfg || this.cfg.kind === 'indoor';
    const cfg = this.cfg || { kind: 'indoor', ramp: 'path', floor: [], wall: [], cards: [], tall: [], ramps: {}, fill: 0, wallFill: 0 };
    this.cfg = cfg;
    this.rampOf = new Array(256).fill(cfg.ramp);
    for (const [name, list] of Object.entries(cfg.ramps)) for (const id of list) this.rampOf[id] = name;
    this.override = new Map();   // ground tile replacements (under objects)
    this.height = new Float32Array(map.tw * map.th);  // top of furniture, per tile
    if (cfg.kind === 'outdoor') this.buildOutdoor(); else this.buildIndoor();
    this.buildGround();
  }

  // How high the top of whatever stands at world point (x, z) is.
  heightAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z), m = this.map;
    if (tx < 0 || tz < 0 || tx >= m.tw || tz >= m.th) return 0;
    return this.height[tz * m.tw + tx];
  }

  t(x, y) {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.tw || y >= m.th) return -1;
    return m.tiles[y * m.tw + x];
  }
  inMap(x, y) {
    const m = this.map;
    return x >= BORDER && y >= BORDER && x < BORDER + m.w * 4 && y < BORDER + m.h * 4;
  }

  buildGround() {
    const m = this.map, cfg = this.cfg;
    const tile = (x, y) => {
      if (this.indoor && !this.inMap(x, y)) return -1;
      const k = y * m.tw + x;
      return this.override.has(k) ? this.override.get(k) : m.tiles[k];
    };
    const ramp = (x, y, id) => this.rampOf[id];
    this.groundCanvas = paint(m, 0, 0, m.tw, m.th, tile, ramp);
    this.groundTex = makeTexture(this.groundCanvas);
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1, metalness: 0 });
    const g = new THREE.PlaneGeometry(m.tw, m.th);
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, mat);
    ground.position.set(m.tw / 2, 0, m.th / 2);
    ground.receiveShadow = true;
    this.group.add(ground);
    if (!this.indoor) {
      // the land goes on past the map's border
      const edge = this.t(0, 0);
      const col = RAMPS[this.rampOf[edge]] || RAMPS.grass;
      const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(col[2]), roughness: 1 }));
      far.position.set(m.tw / 2, -0.03, m.th / 2);
      far.receiveShadow = true;
      this.group.add(far);
    }
    // animated tiles (water, flowers) are repainted from VRAM
    for (let y = 0; y < m.th; y++) for (let x = 0; x < m.tw; x++) {
      const id = tile(x, y);
      if (cfg.kind === 'outdoor' && (id === 0x03 || id === 0x14)) this.animated.push([x, y, id]);
    }
    this.animCache = new Map();
  }

  // Repaints water and flower tiles from the live VRAM picture.
  animate(gb) {
    if (!this.animated.length) return;
    const ctx = this.groundCanvas.getContext('2d');
    let changed = false;
    const live = {};
    for (const id of [0x03, 0x14]) {
      const t = gb.vramTile(id);
      if (!t) return;
      const key = t.join('');
      if (this.animCache.get(id) !== key) { this.animCache.set(id, key); live[id] = t; changed = true; }
    }
    if (!changed) return;
    const imgs = {};
    for (const [id, t] of Object.entries(live)) {
      const r = RAMP_RGB[this.rampOf[id]];
      const img = ctx.createImageData(8, 8);
      for (let i = 0; i < 64; i++) {
        const c = r[t[i]];
        img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
      }
      imgs[id] = img;
    }
    for (const [x, y, id] of this.animated) if (imgs[id]) ctx.putImageData(imgs[id], x * 8, y * 8);
    this.groundTex.needsUpdate = true;
  }

  // ---------- outdoors ----------
  buildOutdoor() {
    const m = this.map, cfg = this.cfg, tw = m.tw, th = m.th;
    const T = (x, y) => this.t(x, y);
    const used = new Uint8Array(tw * th);
    // trees
    const treeCanvases = new Map();
    const trees = [];
    for (let y = 0; y < th - 1; y++) for (let x = 0; x < tw - 1; x++) {
      for (const [a, b, c, d] of cfg.trees) {
        if (T(x, y) === a && T(x + 1, y) === b && T(x, y + 1) === c && T(x + 1, y + 1) === d) {
          trees.push([x, y, a]);
          if (!treeCanvases.has(a)) treeCanvases.set(a, paint(m, x, y, 2, 2, T, (xx, yy, id) => this.rampOf[id], true));
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            used[(y + dy) * tw + x + dx] = 1;
            this.override.set((y + dy) * tw + x + dx, cfg.treeUnder);
          }
        }
      }
    }
    for (const [a, canvas] of treeCanvases) {
      const list = trees.filter((t) => t[2] === a);
      const geo = new THREE.PlaneGeometry(2.5, 2.7);
      geo.translate(0, 1.35, 0);
      geo.rotateX(-0.4);
      const mat = texMat(canvas, true);
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      const mtx = new THREE.Matrix4();
      list.forEach(([x, y], i) => {
        const jitter = ((x * 7 + y * 13) % 5) / 40;
        mtx.makeScale(1 + jitter, 1 + jitter * 1.5, 1);
        mtx.setPosition(x + 1, 0, y + 1.75);
        inst.setMatrixAt(i, mtx);
      });
      inst.castShadow = false; inst.receiveShadow = true;
      this.group.add(inst);
      // shadows come from a round canopy and trunk, not the flat picture
      const canopy = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), SHADOW_ONLY, list.length);
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.28, 1, 6), SHADOW_ONLY, list.length);
      list.forEach(([x, y], i) => {
        mtx.makeScale(1.15, 0.95, 1.0); mtx.setPosition(x + 1, 1.75, y + 1.1); canopy.setMatrixAt(i, mtx);
        mtx.makeScale(1, 1, 1); mtx.setPosition(x + 1, 0.5, y + 1.1); trunk.setMatrixAt(i, mtx);
      });
      canopy.castShadow = trunk.castShadow = true;
      this.group.add(canopy, trunk);
    }
    // tall grass tufts
    const grass = [];
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (T(x, y) === 0x52) grass.push([x, y]);
    if (grass.length) {
      const gc = paint(m, 0, 0, 1, 1, () => 0x52, () => 'tallgrass', true);
      const geo = new THREE.PlaneGeometry(1.1, 0.75);
      geo.translate(0, 0.37, 0);
      geo.rotateX(-0.35);
      const inst = new THREE.InstancedMesh(geo, texMat(gc, true), grass.length);
      const mtx = new THREE.Matrix4();
      grass.forEach(([x, y], i) => { mtx.makeTranslation(x + 0.5, 0, y + 0.95); inst.setMatrixAt(i, mtx); });
      inst.castShadow = false; inst.receiveShadow = true;
      this.group.add(inst);
    }
    // signs and fences: standing cards
    const signSet = new Set(cfg.signs), fenceSet = new Set(cfg.fences);
    for (const set of [signSet, fenceSet]) {
      for (const c of components(tw, th, (x, y) => !used[y * tw + x] && set.has(T(x, y)))) {
        const w = c.c1 - c.c0 + 1, h = c.r1 - c.r0 + 1;
        const canvas = paint(m, c.c0, c.r0, w, h, (x, y) => (c.set.has(y * tw + x) ? T(x, y) : -1),
          (x, y, id) => this.rampOf[id], true);
        this.group.add(card(c.c0, c.c0 + w, c.r1 + 0.85, h, texMat(canvas, true), h * 0.3));
        for (const [x, y] of c.cells) { used[y * tw + x] = 1; this.override.set(y * tw + x, this.below(c, x, cfg.fill)); }
      }
    }
    // buildings
    const bset = new Set(cfg.buildings);
    const roofs = (cfg.roofs && cfg.roofs[m.map]) || [];
    const bs = components(tw, th, (x, y) => !used[y * tw + x] && bset.has(T(x, y)))
      .filter((c) => c.cells.length >= 8)
      .sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    bs.forEach((c, i) => {
      this.building(c, roofs[i] || 'roofRed');
      for (const [x, y] of c.cells) { used[y * tw + x] = 1; this.override.set(y * tw + x, cfg.fill); }
    });
  }

  // The flat tile just below a column of an object, for the ground under it.
  below(c, x, fallback) {
    const id = this.t(x, c.r1 + 1);
    return id >= 0 && this.rampOf[id] !== 'tree' ? id : fallback;
  }

  building(c, roof) {
    const m = this.map, cfg = this.cfg, tw = m.tw;
    const T = (x, y) => (c.set.has(y * tw + x) ? this.t(x, y) : -1);
    const w = c.c1 - c.c0 + 1;
    // the eave: the lowest row that is mostly eave tiles
    let eave = -1;
    for (let y = c.r1; y >= c.r0; y--) {
      let n = 0;
      for (let x = c.c0; x <= c.c1; x++) if (T(x, y) === cfg.eave) n++;
      if (n * 2 >= w) { eave = y; break; }
    }
    if (eave < 0) eave = c.r0 + Math.floor((c.r1 - c.r0) / 2);
    const wallRows = c.r1 - eave, roofRows = eave - c.r0 + 1;
    const win = new Set(cfg.windowTiles), door = new Set(cfg.doorTiles), wall = new Set(cfg.wallTiles);
    const wallRamp = (x, y, id) => (win.has(id) ? 'window' : door.has(id) ? 'door' : 'wall');
    const roofRamp = (x, y, id) => (win.has(id) ? 'window' : wall.has(id) ? 'wall' : roof);
    const x0 = c.c0, x1 = c.c1 + 1, zf = c.r1 + 1, zb = c.r0;
    const H = Math.max(wallRows, 1);
    const rise = Math.min(roofRows * 0.7, 3);
    const zr = zb + (zf - zb) * 0.38;   // ridge
    // facade
    if (wallRows > 0) {
      const fc = paint(m, c.c0, eave + 1, w, wallRows, T, wallRamp, true);
      this.group.add(card(x0, x1, zf, H, texMat(fc, true)));
    }
    // front roof slope, with a little overhang
    const rc = paint(m, c.c0, c.r0, w, roofRows, T, roofRamp, true);
    const ov = 0.25;
    const rm = texMat(rc, true);
    this.group.add(quad([x0 - ov, H - 0.05, zf + ov], [x1 + ov, H - 0.05, zf + ov],
      [x1 + ov, H + rise, zr], [x0 - ov, H + rise, zr], rm));
    // back slope and walls in plain colours
    const roofCol = RAMPS[roof][2], wallCol = RAMPS.wall[1];
    const back = solid(roofCol);
    this.group.add(quad([x1 + ov, H - 0.05, zb - ov], [x0 - ov, H - 0.05, zb - ov],
      [x0 - ov, H + rise, zr], [x1 + ov, H + rise, zr], back));
    const side = solid(wallCol);
    for (const x of [x0, x1]) {
      const s = new THREE.Shape();
      s.moveTo(zf, 0); s.lineTo(zf, H); s.lineTo(zr, H + rise - 0.05); s.lineTo(zb, H); s.lineTo(zb, 0); s.lineTo(zf, 0);
      const g = new THREE.ShapeGeometry(s);
      // shape is in (z, y); turn it to stand in the y-z plane at x
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const z = pos.getX(i), y = pos.getY(i); pos.setXYZ(i, x, y, z); }
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, side);
      mesh.material.side = THREE.DoubleSide;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.group.add(card(x1, x0, zb, H, side));
  }

  // ---------- indoors ----------
  buildIndoor() {
    const m = this.map, cfg = this.cfg, tw = m.tw;
    const floor = new Set(cfg.floor), wallIds = new Set(cfg.wall);
    const cards = new Set(cfg.cards), tall = new Set(cfg.tall);
    const B = BORDER, W = m.w * 4, Hh = m.h * 4;
    const T = (x, y) => this.t(x, y);
    const wallRow = (y) => y < B + 2;
    const isObj = (x, y) => this.inMap(x, y) && !floor.has(T(x, y)) && !(wallRow(y) && wallIds.has(T(x, y)));
    const objs = components(tw, m.th, isObj);
    const ramp = (x, y, id) => this.rampOf[id];
    const wallOwned = new Set();
    for (const c of objs) {
      const w = c.c1 - c.c0 + 1, n = c.r1 - c.r0 + 1;
      // entirely inside the wall rows: a picture on the wall
      if (c.r1 < B + 2) continue;
      const tile = (x, y) => (c.set.has(y * tw + x) ? T(x, y) : -1);
      const ids = c.cells.map(([x, y]) => T(x, y));
      const touchesWall = c.r0 < B + 2;
      let kind = 'box';
      if (ids.some((i) => cards.has(i))) kind = 'card';
      else if (ids.some((i) => tall.has(i))) kind = 'tall';
      for (const [x, y] of c.cells) {
        if (wallRow(y)) wallOwned.add(y * tw + x);
        this.override.set(y * tw + x, cfg.fill);
      }
      const x0 = c.c0, x1 = c.c1 + 1, zf = c.r1 + 1;
      if (kind === 'card' || n < 2) {
        this.group.add(card(x0, x1, zf - 0.3, n, texMat(paint(m, c.c0, c.r0, w, n, tile, ramp, true), true), n * 0.3));
        continue;
      }
      // front face: the bottom rows standing; top: the rest lying on top
      const frontRows = kind === 'tall' ? n - 1 : 1;
      const topRows = n - frontRows;
      const h = frontRows;
      const zb = kind === 'tall' && touchesWall ? B + 2 : zf - topRows;
      const front = paint(m, c.c0, c.r1 - frontRows + 1, w, frontRows, tile, ramp, false);
      const top = paint(m, c.c0, c.r0, w, topRows, tile, ramp, false);
      this.group.add(card(x0, x1, zf, h, texMat(front, false)));
      this.group.add(quad([x0, h, zf], [x1, h, zf], [x1, h, zb], [x0, h, zb], texMat(top, false)));
      for (let z = Math.floor(zb); z < zf; z++) for (let x = x0; x < x1; x++) this.height[z * tw + x] = h;
      const sideCol = RAMPS[ramp(0, 0, ids[ids.length - 1])] || RAMPS.wood;
      const side = solid(sideCol[2]);
      side.side = THREE.DoubleSide;
      this.group.add(quad([x0, 0, zb], [x0, 0, zf], [x0, h, zf], [x0, h, zb], side));
      this.group.add(quad([x1, 0, zf], [x1, 0, zb], [x1, h, zb], [x1, h, zf], side));
    }
    // the back wall: two tile rows standing at the back, plus wall above it
    const extra = 2;
    const wallTile = (x, y) => {
      if (y < B) return cfg.wallFill;
      return wallOwned.has(y * tw + x) ? cfg.wallFill : T(x, y);
    };
    const wc = paint(m, B, B - extra, W, 2 + extra, wallTile, (x, y, id) => this.rampOf[id]);
    const roomParts = [card(B, B + W, B + 2, 2 + extra, texMat(wc, false))];
    // side walls and trim, in the wall's colours
    const wr = RAMPS[this.rampOf[cfg.wallFill]] || RAMPS.iwall;
    const side = solid(wr[1]);
    side.side = THREE.DoubleSide;
    const top = 2 + extra;
    roomParts.push(quad([B, 0, B + Hh], [B, 0, B + 2], [B, top, B + 2], [B, top, B + Hh], side));
    roomParts.push(quad([B + W, 0, B + 2], [B + W, 0, B + Hh], [B + W, top, B + Hh], [B + W, top, B + 2], side));
    const trim = solid(wr[3]);
    roomParts.push(quad([B - 0.2, top, B + 2.15], [B + W + 0.2, top, B + 2.15], [B + W + 0.2, top, B + 1.6], [B - 0.2, top, B + 1.6], trim));
    for (const r of roomParts) { r.castShadow = false; this.group.add(r); }
    for (const c of objs) for (const [x, y] of c.cells) if (wallRow(y)) this.override.set(y * tw + x, cfg.fill);
    for (let y = B; y < B + 2; y++) for (let x = B; x < B + W; x++) this.override.set(y * tw + x, cfg.fill);
  }
}

// ---------- sprites ----------
const FRAME_ROWS = { standDown: 0, standUp: 1, standLeft: 2, walkDown: 3, walkUp: 4, walkLeft: 5 };
// [row, flipped] for facing (0 down, 1 up, 2 left, 3 right) and walk frame 0-3
const FACINGS = [
  [['standDown', 0], ['walkDown', 0], ['standDown', 0], ['walkDown', 1]],
  [['standUp', 0], ['walkUp', 0], ['standUp', 0], ['walkUp', 1]],
  [['standLeft', 0], ['walkLeft', 0], ['standLeft', 0], ['walkLeft', 0]],
  [['standLeft', 1], ['walkLeft', 1], ['standLeft', 1], ['walkLeft', 1]],
];

export class Sprites {
  constructor(gb, scene) {
    this.gb = gb;
    this.scene = scene;
    this.sheets = new Map();
    this.slots = new Map();
    this.shadowGeo = new THREE.CircleGeometry(0.7, 20).rotateX(-Math.PI / 2);
    this.bodyGeo = new THREE.CapsuleGeometry(0.5, 0.8, 4, 8).translate(0, 0.9, 0);
    this.itemGeo = new THREE.SphereGeometry(0.55, 10, 8).translate(0, 0.55, 0);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
  }

  sheet(pic) {
    if (this.sheets.has(pic)) return this.sheets.get(pic);
    const s = this.gb.readSprite(pic);
    const cols = (SPRITE_COLORS[pic] || SPRITE_COLORS.default).map(rgb);
    const c = document.createElement('canvas');
    c.width = 16; c.height = 96;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(16, 96);
    const put = (tile, ox, oy) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const v = tile[y * 8 + x], i = ((oy + y) * 16 + ox + x) * 4;
        if (!v) continue;
        const col = cols[v - 1];
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
    };
    // frame f uses tiles f*4 .. f*4+3 (TL, TR, BL, BR); walking frames follow the 12 standing tiles
    const frames = s.still ? 1 : 6;
    for (let f = 0; f < frames; f++) {
      const base = f < 3 ? f * 4 : 12 + (f - 3) * 4;
      put(s.tiles[base], 0, f * 16); put(s.tiles[base + 1], 8, f * 16);
      put(s.tiles[base + 2], 0, f * 16 + 8); put(s.tiles[base + 3], 8, f * 16 + 8);
    }
    ctx.putImageData(img, 0, 0);
    // empty rows under the first frame's picture, so it can stand on its base
    let pad = 0;
    for (let y = 15; y >= 0; y--) {
      let empty = true;
      for (let x = 0; x < 16; x++) if (img.data[(y * 16 + x) * 4 + 3]) { empty = false; break; }
      if (!empty) break;
      pad++;
    }
    const tex = makeTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const out = { tex, still: s.still, pad };
    this.sheets.set(pic, out);
    return out;
  }

  update(list, world) {
    const seen = new Set();
    for (const sp of list) {
      seen.add(sp.slot);
      let o = this.slots.get(sp.slot);
      if (!o || o.pic !== sp.pic) {
        if (o) this.remove(sp.slot);
        const sh = this.sheet(sp.pic);
        const tex = sh.tex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, 1 / 6);
        const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
        const geo = new THREE.PlaneGeometry(2, 2);
        geo.translate(0, 1 - (sh.still ? sh.pad / 8 : 0), 0);
        const mesh = new THREE.Mesh(geo, mat);
        // the picture leans back to face the camera; the shadow comes from an
        // invisible upright copy, so it is the right shape
        const caster = new THREE.Mesh(sh.still ? this.itemGeo : this.bodyGeo, SHADOW_ONLY);
        caster.castShadow = true;
        const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
        if (sh.still) shadow.scale.setScalar(0.65);
        this.scene.add(mesh, caster, shadow);
        o = { pic: sp.pic, mesh, caster, shadow, tex, still: sh.still };
        this.slots.set(sp.slot, o);
      }
      let row = 0, flip = 0;
      if (!o.still) {
        const facing = sp.img !== 0xff ? (sp.img >> 2) & 3 : (sp.facing >> 2) & 3;
        const frame = sp.img !== 0xff ? sp.img & 3 : 0;
        const [name, f] = FACINGS[facing][frame];
        row = FRAME_ROWS[name]; flip = f;
      }
      o.tex.offset.set(flip ? 1 : 0, (5 - row) / 6);
      o.tex.repeat.set(flip ? -1 : 1, 1 / 6);
      // items (Poké Balls, the Pokédex) and seated people sit on the furniture under them
      let x = (sp.x + 6) * 2 + 1, z = (sp.y + 6) * 2 + 1.55, y = 0.05;
      if (world) {
        // characters never walk onto furniture, so anyone over some is sitting on it
        const top = Math.max(world.heightAt(x - 0.5, z), world.heightAt(x + 0.5, z));
        if (top > 0) { y = top + 0.02; if (o.still) z += 0.15; }
      }
      o.mesh.position.set(x, y, z);
      o.caster.position.set(x, y, o.still ? z : z - 0.4);
      o.shadow.position.set(x, y + 0.02, o.still ? z : z - 0.2);
      o.x = x; o.z = z;
    }
    for (const slot of [...this.slots.keys()]) if (!seen.has(slot)) this.remove(slot);
  }

  remove(slot) {
    const o = this.slots.get(slot);
    if (!o) return;
    this.scene.remove(o.mesh, o.caster, o.shadow);
    o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.tex.dispose();
    this.slots.delete(slot);
  }

  // The emotion bubble floats over the character below it.
  bubble(b) {
    if (!b) { if (this.bub) this.bub.visible = false; return; }
    if (!this.bub) {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      this.bubCanvas = c;
      const tex = makeTexture(c); tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      const geo = new THREE.PlaneGeometry(2, 2); geo.translate(0, 1, 0);
      this.bub = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
      this.bub.renderOrder = 5;
      this.scene.add(this.bub);
    }
    if (b.key !== this.bubKey) {
      this.bubKey = b.key;
      const ctx = this.bubCanvas.getContext('2d'), img = ctx.createImageData(16, 16);
      const cols = [null, [255, 255, 255], [170, 172, 190], [27, 29, 51]];
      for (let i = 0; i < 256; i++) {
        const c = cols[b.pix[i]]; if (!c) continue;
        img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.bub.material.map.needsUpdate = true;
    }
    this.bub.visible = true;
    this.bub.position.set((b.x + 6) * 2 + 1, 2.3, (b.y + 1 + 6) * 2 + 1.6);
    this.bub.rotation.x = this.lastPitch ? -this.lastPitch * 0.85 : 0;
  }

  // Characters lean back to face the camera, so they are not squashed.
  face(pitch) { this.lastPitch = pitch; for (const o of this.slots.values()) o.mesh.rotation.x = -pitch * 0.85; }

  clear() { for (const slot of [...this.slots.keys()]) this.remove(slot); }
}
