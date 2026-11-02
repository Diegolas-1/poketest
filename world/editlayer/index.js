// The edit layer: hand edits made in the world editor (editor.html), kept as
// DATA that the procedural generators apply on top of what they make. The
// design is written up at the top of editor/main.js; in short:
//
//   web/world/edits/world.json      the edit document (objects, added things,
//                                   vegetation, roads, places; format below)
//   web/world/edits/tiles/<l>_<i>_<j>.png
//                                   raster tiles: 64 m squares of 128 x 128
//                                   nodes (0.5 m) over the world, only where
//                                   something was painted
//
// Raster layers (8-bit RGBA PNGs, written and read byte-exact by png.js):
//   h  R,G = height delta in cm + 32768 (big endian)   B = grass blades x B/128
//   p  R = dirt path   G = sand   B = rock   A = grass (erases dirt and tints)
//   m  R = vegetation density (128 = as generated, 0 = none)
//      G = walk flag (0 none, 1 blocked, 2 walkable, 3 ledge: hop down going south)
//
// The rule that keeps edits stable: an edit never changes a generator's
// random decisions. While the town and the vegetation decide where things go
// (E.raw = true) the terrain answers as if nothing was edited (terrain.js
// keeps a second, unedited copy of itself: terrain.js?raw); edits are then
// applied afterwards, as filters and offsets (things standing on sculpted
// ground move up or down with it, plants on a painted path or under a moved
// house are left out, deleted ones go). So raising a hill never reshuffles the
// forest, and the same edits give the same world every time.
//
// Generators use the hooks through `E` (or NOEDIT for the unedited copy).
// Everything here runs in the browser and in Node (tools/native/bake_places.mjs
// imports terrain.js there).
import { decodePNG } from './png.js';

export const GRID = { x0: -512, z0: -960, res: 0.5, n: 128, ntx: 16, ntz: 20 };   // tile = 64 m
export const TILE_M = GRID.n * GRID.res;
export const LAYER_DEFAULT = { h: [128, 0, 128, 255], p: [0, 0, 0, 0], m: [128, 0, 0, 0] };
export const FORMAT = 'pallet-edits v1';
export const emptyDoc = () => ({ format: FORMAT, objects: {}, added: [], veg: {}, vegAdd: [], roads: { edit: {}, added: [] }, places: {}, tiles: [] });

const NODE = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

// ---------- loading ----------
// Where the edits come from, in order:
//   globalThis.__PALLET_EDITS = { doc, tiles: { 'h_3_7': PNG bytes } }   (the editor, tests)
//   ?edits=off (or PALLET_EDITS=off in Node): none
//   ?edits=draft: asked from the page that opened this one (the editor's Play)
//   else web/world/edits/world.json and its tiles
async function source() {
  const G = globalThis;
  if (G.__PALLET_EDITS) return G.__PALLET_EDITS;
  if (NODE) {
    if (process.env.PALLET_EDITS === 'off') return null;
    const fs = await import('node:fs');
    const dir = new URL('../edits/', import.meta.url);
    const f = new URL('world.json', dir);
    if (!fs.existsSync(f)) return null;
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const tiles = {};
    for (const k of doc.tiles || []) { const tf = new URL(`tiles/${k}.png`, dir); if (fs.existsSync(tf)) tiles[k] = new Uint8Array(fs.readFileSync(tf)); }
    return { doc, tiles };
  }
  const q = G.location ? new URLSearchParams(G.location.search) : new URLSearchParams();
  if (q.get('edits') === 'off') return null;
  if (q.get('edits') === 'draft') {
    const host = G.opener || (G.parent !== G ? G.parent : null);
    if (host) {
      const got = await new Promise((ok) => {
        const t = setTimeout(() => ok(null), 4000);
        G.addEventListener('message', function on(e) {
          if (!e.data || e.data.type !== 'pallet-edits') return;
          G.removeEventListener('message', on); clearTimeout(t); ok(e.data.edits);
        });
        host.postMessage({ type: 'pallet-edits-please' }, '*');
      });
      if (got) return got;
    }
  }
  try {
    const base = new URL('../edits/', import.meta.url);
    const r = await fetch(new URL('world.json', base), { cache: 'no-cache' });
    if (!r.ok) return null;
    const doc = await r.json();
    const tiles = {};
    await Promise.all((doc.tiles || []).map(async (k) => {
      const t = await fetch(new URL(`tiles/${k}.png`, base), { cache: 'no-cache' });
      if (t.ok) tiles[k] = new Uint8Array(await t.arrayBuffer());
    }));
    return { doc, tiles };
  } catch { return null; }
}

// ---------- the layer ----------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const vegKey = (x, z) => `${Math.round(x * 10)}_${Math.round(z * 10)}`;

function makeLayer() {
  const NT = GRID.ntx * GRID.ntz;
  const L = {
    doc: emptyDoc(),
    tiles: { h: new Array(NT).fill(null), p: new Array(NT).fill(null), m: new Array(NT).fill(null) },
    has: { h: false, p: false, m: false },
    raw: false,          // generators deciding: answer as if unedited (see the top)
    fn: {},              // bound by terrain.js: height, rawHeight, onPath, ...
    version: 0,          // bumped on every change (the editor)
    edColliders: [],     // colliders of moved / added objects (plants keep out of them)
    orphans: [],         // object edits whose object was not found (shown in the editor)
  };
  // a tile's pixels (creating it with the layer's default when asked)
  L.tile = (layer, ti, tj, create = false) => {
    if (ti < 0 || tj < 0 || ti >= GRID.ntx || tj >= GRID.ntz) return null;
    const k = tj * GRID.ntx + ti;
    let t = L.tiles[layer][k];
    if (!t && create) {
      t = new Uint8Array(GRID.n * GRID.n * 4);
      const d = LAYER_DEFAULT[layer];
      for (let i = 0; i < t.length; i += 4) { t[i] = d[0]; t[i + 1] = d[1]; t[i + 2] = d[2]; t[i + 3] = d[3]; }
      L.tiles[layer][k] = t; L.has[layer] = true;
    }
    return t;
  };
  // one node's bytes (or the default) for layer at node i, j
  const px = (layer, i, j, c) => {
    const ti = i >> 7, tj = j >> 7;
    if (ti < 0 || tj < 0 || ti >= GRID.ntx || tj >= GRID.ntz) return LAYER_DEFAULT[layer][c];
    const t = L.tiles[layer][tj * GRID.ntx + ti];
    return t ? t[((j & 127) * 128 + (i & 127)) * 4 + c] : LAYER_DEFAULT[layer][c];
  };
  L.px = px;
  const hNode = (i, j) => {
    const ti = i >> 7, tj = j >> 7;
    if (ti < 0 || tj < 0 || ti >= GRID.ntx || tj >= GRID.ntz) return 0;
    const t = L.tiles.h[tj * GRID.ntx + ti];
    if (!t) return 0;
    const o = ((j & 127) * 128 + (i & 127)) * 4;
    return ((t[o] << 8 | t[o + 1]) - 32768) / 100;
  };
  L.hNode = hNode;
  // bilinear over the nodes; f(i, j) -> value
  const bil = (x, z, f) => {
    const fx = (x - GRID.x0) / GRID.res, fz = (z - GRID.z0) / GRID.res;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = f(i, j), b = f(i + 1, j), c = f(i, j + 1), d = f(i + 1, j + 1);
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
  const near = (layer, x, z, c) => px(layer, Math.round((x - GRID.x0) / GRID.res), Math.round((z - GRID.z0) / GRID.res), c);

  // ---------- terrain hooks (terrain.js) ----------
  L.hDelta = (x, z) => (L.has.h ? bil(x, z, hNode) : 0);
  L.h = (x, z, h) => (L.raw || !L.has.h ? h : h + bil(x, z, hNode));
  // grass blades: a factor on the generated density (0 none, 1 as made, 2 double)
  L.grassK = (x, z) => (L.has.h ? bil(x, z, (i, j) => px('h', i, j, 2)) / 128 : 1);
  const SAND = [0xf7 / 255, 0xdc / 255, 0x9c / 255], ROCK = [0xa0 / 255, 0x88 / 255, 0x90 / 255], GRASS = [0x72 / 255, 0xc9 / 255, 0x4a / 255];
  // ground colour (a THREE.Color in linear rgb: the generators work in it)
  L.paint = (x, z, out) => {
    if (!L.has.p) return out;
    const s = bil(x, z, (i, j) => px('p', i, j, 1)) / 255, r = bil(x, z, (i, j) => px('p', i, j, 2)) / 255, g = bil(x, z, (i, j) => px('p', i, j, 3)) / 255;
    if (s + r + g < 0.004) return out;
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    for (const [k, c] of [[g, GRASS], [s, SAND], [r, ROCK]]) if (k > 0) { out.r += (lin(c[0]) - out.r) * k; out.g += (lin(c[1]) - out.g) * k; out.b += (lin(c[2]) - out.b) * k; }
    return out;
  };
  // the dirt's signed distance (paths.js paints the dirt from it)
  L.pathSD = (x, z, d) => {
    if (!L.has.p) return d;
    const w = bil(x, z, (i, j) => px('p', i, j, 0)) / 255, g = bil(x, z, (i, j) => px('p', i, j, 3)) / 255;
    if (w > 0.004) { const p = 1.5 - 2.1 * w, k = 0.8, hh = Math.max(k - Math.abs(d - p), 0) / k; d = Math.min(d, p) - hh * hh * k * 0.25; }
    if (g > 0.004) d = Math.max(d, -0.6 + 2.6 * g);
    return d;
  };
  L.walkFlag = (x, z) => (L.has.m ? near('m', x, z, 1) : 0);
  L.noWalk = (x, z, nw) => { if (!L.has.m) return nw; const f = near('m', x, z, 1); return f === 1 ? true : f === 2 ? false : nw; };
  L.ledge = (x, z, l) => { if (l || !L.has.m || L.raw) return l; return near('m', x, z, 1) === 3 ? { painted: true, x0: x - 1, x1: x + 1, z } : l; };
  L.vegDensity = (x, z) => (L.has.m ? bil(x, z, (i, j) => px('m', i, j, 0)) / 128 : 1);

  // ---------- roads (terrain.js ROAD_CTRL) ----------
  // doc.roads.edit: { "<index>": { at: [x, z] (its first control point as
  // generated), ctrl: [[x, z], ...] | del: true, w } }; doc.roads.added:
  // [{ id, ctrl, w }] (appended after the generated roads)
  L.roadW = {};
  L.roads = (ctrl) => {
    const R = L.doc.roads || {}, ed = R.edit || {}, out = ctrl.map((c) => c);
    const used = new Set();
    for (const [k, e] of Object.entries(ed)) {
      let i = +k;
      const fits = (j) => ctrl[j] && e.at && Math.hypot(ctrl[j][0][0] - e.at[0], ctrl[j][0][1] - e.at[1]) < 1.5;
      if (!fits(i)) { i = ctrl.findIndex((_, j) => fits(j)); if (i < 0) { L.orphans.push({ kind: 'road', key: k }); continue; } }
      if (used.has(i)) continue;
      used.add(i);
      if (e.del) out[i] = [[9000 + i * 10, 9000], [9001 + i * 10, 9000]];
      else if (e.ctrl && e.ctrl.length >= 2) out[i] = e.ctrl.map(([x, z]) => [x, z]);
      if (e.w) L.roadW[i] = e.w;
    }
    for (const a of R.added || []) {
      if (!a.ctrl || a.ctrl.length < 2) continue;
      if (a.w) L.roadW[out.length] = a.w;
      out.push(a.ctrl.map(([x, z]) => [x, z]));
    }
    return out;
  };
  L.roadsEdited = () => { const R = L.doc.roads || {}; return Object.keys(R.edit || {}).length > 0 || (R.added || []).length > 0; };

  // ---------- vegetation (veg.js: every list of plant points) ----------
  // Marks deleted plants off, moves edited ones, keeps plants off painted
  // paths, out of thinned areas and out of moved / added objects, and lifts or
  // lowers the rest with the sculpted ground. Runs once per point.
  L.veg = (list) => {
    const V = L.doc.veg || {}, anyV = Object.keys(V).length > 0;
    const terr = L.has.h || L.roadsEdited(), F = L.fn;
    if (!anyV && !terr && !L.has.p && !L.has.m && !L.edColliders.length) return;
    const raw = L.raw; L.raw = false;
    try {
      for (const p of list) {
        if (p._e) continue;
        p._e = 1;
        const key = vegKey(p.x, p.z);
        p._k = key;
        const e = anyV ? V[key] : null;
        if (e && e.del) { p.off = true; continue; }
        // a moved or turned plant: where it now stands goes in p._mv (the
        // seeded point stays where it was, so later plants that look at it
        // are seeded the same: Scatter and the colliders read L.at(p))
        if (e) {
          const m = { x: e.x ?? p.x, z: e.z ?? p.z, rot: e.rot ?? p.rot, s: e.s ?? p.s, y: p.y };
          if (F.height && F.rawHeight) m.y = p.y + F.height(m.x, m.z) - F.rawHeight(p.x, p.z);
          p._mv = m;
          continue;
        }
        if (L.has.m) { const dens = L.vegDensity(p.x, p.z); if (dens < 1 && hash2(Math.round(p.x * 10), Math.round(p.z * 10)) >= dens) { p.off = true; continue; } }
        if (L.has.p && F.onPath && F.onPath(p.x, p.z, 0.5)) { p.off = true; continue; }
        if (L.edColliders.length && L.inEdColliders(p.x, p.z, 0.3)) { p.off = true; continue; }
        if (terr && F.height && F.rawHeight) p.y += F.height(p.x, p.z) - F.rawHeight(p.x, p.z);
      }
    } finally { L.raw = raw; }
  };
  // where a plant point stands after edits, and a scatter's points so
  L.at = (p) => p._mv || p;
  L.placed = (points) => (points.some((p) => p._mv) ? points.map((p) => (p._mv ? { ...p, ...p._mv, _src: p } : p)) : points);
  // plants sown in the editor, by kind, standing on the edited ground
  L.vegAdded = () => {
    const by = new Map(), raw = L.raw;
    L.raw = false;
    try {
      for (const q of L.doc.vegAdd || []) {
        if (!q || !q.k || !Number.isFinite(q.x) || !Number.isFinite(q.z)) continue;
        if (!by.has(q.k)) by.set(q.k, []);
        by.get(q.k).push({ ...q, y: L.fn.height ? L.fn.height(q.x, q.z) : 0 });
      }
    } finally { L.raw = raw; }
    return by;
  };
  L.inEdColliders = (x, z, r = 0) => {
    for (const c of L.edColliders) {
      if (c.box) {
        let dx = x - c.x, dz = z - c.z;
        if (c.rot) { const cs = Math.cos(c.rot), sn = Math.sin(c.rot); [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs]; }
        if (Math.abs(dx) < c.hw + r && Math.abs(dz) < c.hd + r) return true;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return true;
    }
    return false;
  };

  // does the terrain need its unedited twin (terrain.js?raw)?
  L.needRaw = () => L.has.h || L.has.p || L.has.m || L.roadsEdited();
  L.empty = () => {
    const d = L.doc;
    return !L.has.h && !L.has.p && !L.has.m && !Object.keys(d.objects || {}).length && !(d.added || []).length && !Object.keys(d.veg || {}).length && !(d.vegAdd || []).length && !L.roadsEdited();
  };
  return L;
}

export const E = makeLayer();
// the unedited copy's hooks: pass everything through
export const NOEDIT = {
  raw: true, h: (x, z, h) => h, paint: (x, z, o) => o, pathSD: (x, z, d) => d, noWalk: (x, z, n) => n, ledge: (x, z, l) => l, grassK: () => 1,
  roads: (c) => c, roadW: {}, veg() {}, at: (p) => p, placed: (p) => p, vegAdded: () => new Map(), hDelta: () => 0, fn: {}, needRaw: () => false, edColliders: [],
};

// read a bundle { doc, tiles } into E
export async function loadInto(L, src) {
  L.doc = src && src.doc ? { ...emptyDoc(), ...src.doc } : emptyDoc();
  for (const l of ['h', 'p', 'm']) { L.tiles[l].fill(null); L.has[l] = false; }
  for (const [k, bytes] of Object.entries((src && src.tiles) || {})) {
    const m = /^([hpm])_(\d+)_(\d+)$/.exec(k);
    if (!m) continue;
    try {
      const png = await decodePNG(bytes);
      if (png.w !== GRID.n || png.h !== GRID.n) continue;
      const t = L.tile(m[1], +m[2], +m[3], true);
      if (png.ch === 4) t.set(png.data);
      else for (let i = 0, o = 0; i < png.data.length; i += 3, o += 4) { t[o] = png.data[i]; t[o + 1] = png.data[i + 1]; t[o + 2] = png.data[i + 2]; t[o + 3] = 255; }
    } catch (err) { console.warn('edit tile', k, err); }
  }
  L.version++;
}

await loadInto(E, await source());
