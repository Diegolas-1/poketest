// The editor's state: the edit document (editlayer E.doc + its raster
// tiles), the selection, undo / redo, and the bundle that is saved.
import { E, GRID, LAYER_DEFAULT, FORMAT } from '../editlayer/index.js';
import { encodePNG, toBase64, fromBase64 } from '../editlayer/png.js';

export const S = {
  sel: [],            // [{ kind: 'obj', e, o, id } | { kind: 'veg', ... }]
  tool: 'select',
  dirty: false,
  savedAt: 0,
  history: [], future: [],
  listeners: new Map(),
  life: {},           // native/life/*.json edits: { file: { base, data } } (phases 2-3)
  meta: {},
};
export function on(ev, f) { if (!S.listeners.has(ev)) S.listeners.set(ev, []); S.listeners.get(ev).push(f); }
export function emit(ev, ...a) { for (const f of S.listeners.get(ev) || []) try { f(...a); } catch (err) { console.error(ev, err); } }

export function touch() { S.dirty = true; E.version++; emit('dirty'); }

// ---------- undo / redo ----------
// a command: { label, undo(), redo() }; do() runs redo once
export function run(cmd) { cmd.redo(); push(cmd); }
export function push(cmd) { S.history.push(cmd); if (S.history.length > 300) S.history.shift(); S.future.length = 0; touch(); emit('history'); }
export function undo() { const c = S.history.pop(); if (!c) return; c.undo(); S.future.push(c); touch(); emit('history'); emit('changed'); }
export function redo() { const c = S.future.pop(); if (!c) return; c.redo(); S.history.push(c); touch(); emit('history'); emit('changed'); }

// ---------- tiles ----------
export const tileKey = (l, ti, tj) => `${l}_${ti}_${tj}`;
const encCache = new Map();   // key -> { ver, b64 }
const tileVer = new Map();     // key -> change counter
export function tileChanged(key) { tileVer.set(key, (tileVer.get(key) || 0) + 1); }
const isDefault = (l, t) => { const d = LAYER_DEFAULT[l]; for (let i = 0; i < t.length; i += 4) if (t[i] !== d[0] || t[i + 1] !== d[1] || t[i + 2] !== d[2] || t[i + 3] !== d[3]) return false; return true; };
export async function encodeTiles() {
  const out = {};
  for (const l of ['h', 'p', 'm']) {
    E.tiles[l].forEach((t, k) => {
      if (!t) return;
      const ti = k % GRID.ntx, tj = Math.floor(k / GRID.ntx), key = tileKey(l, ti, tj);
      out[key] = t;
    });
  }
  const res = {};
  await Promise.all(Object.entries(out).map(async ([key, t]) => {
    const v = tileVer.get(key) || 0, c = encCache.get(key);
    if (c && c.ver === v) { if (c.b64) res[key] = c.b64; return; }
    const l = key[0];
    const b64 = isDefault(l, t) ? null : toBase64(await encodePNG(t, GRID.n, GRID.n, 4));
    encCache.set(key, { ver: v, b64 });
    if (b64) res[key] = b64;
  }));
  return res;
}

// ---------- the bundle (what the backend stores; tools/editor/pull.mjs writes it) ----------
export async function bundle() {
  const tiles = await encodeTiles();
  const doc = { ...E.doc, format: FORMAT, tiles: Object.keys(tiles).sort() };
  E.doc.tiles = doc.tiles;
  // life files: only those that differ from the base they were loaded from
  const life = {};
  for (const [f, v] of Object.entries(S.life)) if (JSON.stringify(v.base) !== JSON.stringify(v.data)) life[f] = v;
  return { doc, tiles, life, meta: { ...S.meta, at: Date.now(), editor: 1 } };
}
// the edits for a game page (Play): tiles as PNG bytes
export async function forGame() {
  const b = await bundle();
  const tiles = {};
  for (const [k, v] of Object.entries(b.tiles)) tiles[k] = fromBase64(v);
  return { doc: b.doc, tiles };
}
