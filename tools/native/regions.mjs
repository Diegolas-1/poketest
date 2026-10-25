// The native world in regions, so a change in one area ships as one small
// over-the-air pack (tools/native/publish_patch.mjs) instead of the whole world.
//
// The bakes (bake.mjs, bake_ink.mjs) make the world as before, as single files
// in a staging folder; splitWorld() here cuts them up into native/world/:
//
//   world/base/      pack "base": what the whole world shares and what rarely
//                    changes: world.json (sizes of the grids, spawn, sea level,
//                    mountains, Cinnabar, the region list), water.glb,
//                    mountains.bin, cinnabar.bin, clouds, grass.png, dirt.webp,
//                    and tex/<hash>.png = town pictures used by two or more regions
//   world/plants/    pack "plants": the plants' pictures (billboard atlas
//                    bill.png, leaf atlases, barks; named by their content) and
//                    plants.json (where each billboard sits in the atlas)
//   world/r/<id>/    pack "r_<id>", one per region (REGIONS below):
//     region.json    {id, box, colliders, inst, tiles, ink_meshes}
//     town.glb       the region's town meshes (and the repeated parts it has
//                    copies of), pictures as files: <hash>.png here when only
//                    this region uses one, else ../../base/tex/<hash>.png
//     terrain.glb    the region's ground chunks
//     inst.bin       its copies of the repeated parts (as town_inst.bin)
//     veg.json/.bin  its plants: the copies standing in it, and the models
//                    whose copies mostly stand in it (models by content id)
//     ink.bin        its 64 m ink cells (INK2, as bake_ink.mjs writes it)
//     ground.bin, pathmap.bin, seabed.bin, grassmap.bin
//                    its tiles of the whole-world grids (region.json tiles:
//                    [i0, j0, w, h] in cells of that grid)
//
// Everything is assigned by where it stands (a mesh by its box centre, a plant
// by its foot, an ink cell or a grid cell by its centre), names come from
// content (no counters), and the files are written in a fixed order, so a
// change in one region leaves the other regions' files byte for byte the same.
// The native game (world_data.gd, WorldRegions in world_regions.gd) loads every
// region at start and joins them back into the same arrays as before.
//
// Regions are fixed rectangles that tile the whole plane (x east, z south;
// Route 1 runs north to -z). Change them only with a reason: every region's
// pack changes when they move. Adding a region needs no new app (its pack is
// new, the region list in base/world.json grows).
//
//   node tools/native/split_world.mjs <dir with the single-file bake>   (CLI)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const I = Infinity;
export const REGIONS = [
  { id: 'viridian_outskirts', x0: -I, x1: I, z0: -I, z1: -384 },   // Route 1's north end, the gate, Viridian on the horizon
  { id: 'route1_north', x0: -I, x1: I, z0: -384, z1: -256 },        // tea house, shrine, lookout
  { id: 'route1_south', x0: -I, x1: I, z0: -256, z1: -64 },         // orchard, farm, cottage, the town's north edge
  { id: 'west_woods', x0: -I, x1: -128, z0: -64, z1: 64 },
  { id: 'pallet_north', x0: -128, x1: 32, z0: -64, z1: 0 },         // Ash's and Gary's houses, the plaza
  { id: 'pallet_south', x0: -128, x1: 32, z0: 0, z1: 64 },          // the south houses, the pond, the lab stairs' foot
  { id: 'lab_hill', x0: 32, x1: I, z0: -64, z1: 64 },               // Oak's lab on its hill, the stream
  { id: 'harbour_coast', x0: -I, x1: 64, z0: 64, z1: I },           // the harbour, the beach, the sea to the south
  { id: 'pallet_house_trail', x0: 64, x1: I, z0: 64, z1: I },       // the woodland trail to PALLET HOUSE
];
export const regionOf = (x, z) => {
  for (const r of REGIONS) if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return r.id;
  throw new Error(`no region at ${x}, ${z}`);
};
// the rectangles must tile the plane: every point in exactly one
{
  const xs = [-1e6, ...new Set(REGIONS.flatMap((r) => [r.x0, r.x1]).filter(Number.isFinite)), 1e6].sort((a, b) => a - b);
  const zs = [-1e6, ...new Set(REGIONS.flatMap((r) => [r.z0, r.z1]).filter(Number.isFinite)), 1e6].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
    const n = REGIONS.filter((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1).length;
    if (n !== 1) throw new Error(`regions: ${n} regions at ${x}, ${z}`);
  }
  if (new Set(REGIONS.map((r) => r.id)).size !== REGIONS.length || REGIONS.some((r) => !/^[a-z0-9_]{1,24}$/.test(r.id))) throw new Error('regions: bad ids');
}

const hash = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(typeof p === 'string' ? p : Buffer.from(p.buffer ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : p)); return h.digest('hex').slice(0, 16); };
const box = (r) => [r.x0, r.x1, r.z0, r.z1].map((v) => (Number.isFinite(v) ? v : null));

// ---------- glb ----------
export function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jl));
  let bin = Buffer.alloc(0);
  if (20 + jl < buf.length) { const bl = buf.readUInt32LE(20 + jl); bin = buf.subarray(28 + jl, 28 + jl + bl); }
  return { json, bin };
}
export function writeGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  let bn = bin;
  if (bn.length % 4) bn = Buffer.concat([bn, Buffer.alloc(4 - (bn.length % 4))]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  const parts = [head, chunkHead(js.length, 0x4e4f534a), js];
  if (bn.length) parts.push(chunkHead(bn.length, 0x004e4942), bn);
  const out = Buffer.concat(parts);
  out.writeUInt32LE(out.length, 8);
  return out;
}
const chunkHead = (n, t) => { const b = Buffer.alloc(8); b.writeUInt32LE(n, 0); b.writeUInt32LE(t, 4); return b; };
const viewBytes = (g, i) => { const v = g.json.bufferViews[i]; return g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };

// the world-space centre (x, z) of a mesh node of the root's children
function nodeCentre(g, n) {
  let lo = [I, I, I], hi = [-I, -I, -I];
  for (const p of g.json.meshes[n.mesh].primitives) {
    const a = g.json.accessors[p.attributes.POSITION];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
  }
  const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  let M = n.matrix;
  if (!M) {
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0];
    M = [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, t[0], t[1], t[2], 1];
  }
  return [M[0] * c[0] + M[4] * c[1] + M[8] * c[2] + M[12], M[2] * c[0] + M[6] * c[1] + M[10] * c[2] + M[14]];
}

// a glb of some of the root's children (nodes: [[source node index, name]]),
// with only what they use; pictures become files (imageUri(source image index))
function subsetGlb(g, nodes, imageUri) {
  const J = g.json, out = { asset: J.asset, scenes: [{ name: 'AuxScene', nodes: [0] }], scene: 0, nodes: [{ children: [] }] };
  const bins = [];
  let off = 0;
  const maps = {};
  const remap = (kind, i, make) => { const m = (maps[kind] ||= new Map()); if (!m.has(i)) { (out[kind] ||= []).push(null); const k = out[kind].length - 1; m.set(i, k); out[kind][k] = make(); } return m.get(i); };
  const view = (i) => remap('bufferViews', i, () => {
    const v = { ...J.bufferViews[i] }, b = viewBytes(g, i);
    const pad = (4 - (off % 4)) % 4;
    if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
    bins.push(b); v.buffer = 0; v.byteOffset = off; off += b.length;
    return v;
  });
  const accessor = (i) => remap('accessors', i, () => { const a = { ...J.accessors[i] }; if (a.bufferView !== undefined) a.bufferView = view(a.bufferView); return a; });
  const image = (i) => remap('images', i, () => ({ uri: imageUri(i), mimeType: J.images[i].mimeType || 'image/png' }));
  const sampler = (i) => remap('samplers', i, () => ({ ...J.samplers[i] }));
  const texture = (i) => remap('textures', i, () => { const t = { ...J.textures[i] }; if (t.sampler !== undefined) t.sampler = sampler(t.sampler); if (t.source !== undefined) t.source = image(t.source); return t; });
  const texRef = (r) => (r ? { ...r, index: texture(r.index) } : r);
  const material = (i) => remap('materials', i, () => {
    const m = JSON.parse(JSON.stringify(J.materials[i]));
    if (m.pbrMetallicRoughness) for (const k of ['baseColorTexture', 'metallicRoughnessTexture']) if (m.pbrMetallicRoughness[k]) m.pbrMetallicRoughness[k] = texRef(m.pbrMetallicRoughness[k]);
    for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[k]) m[k] = texRef(m[k]);
    return m;
  });
  const mesh = (i) => remap('meshes', i, () => {
    const m = JSON.parse(JSON.stringify(J.meshes[i]));
    for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = accessor(p.attributes[k]);
      if (p.indices !== undefined) p.indices = accessor(p.indices);
      if (p.material !== undefined) p.material = material(p.material);
    }
    return m;
  });
  for (const [ni, name] of nodes) {
    const n = { ...J.nodes[ni] };
    if (name !== undefined) n.name = name;
    if (n.mesh !== undefined) n.mesh = mesh(n.mesh);
    out.nodes.push(n);
    out.nodes[0].children.push(out.nodes.length - 1);
  }
  if (J.extensionsUsed) out.extensionsUsed = J.extensionsUsed;
  out.buffers = [{ byteLength: off }];
  if (!off) { delete out.buffers; }
  return writeGlb(out, Buffer.concat(bins));
}

// images a mesh's materials use
function meshImages(g, mi) {
  const J = g.json, out = new Set();
  for (const p of J.meshes[mi].primitives) {
    if (p.material === undefined) continue;
    const m = J.materials[p.material], refs = [];
    if (m.pbrMetallicRoughness) refs.push(m.pbrMetallicRoughness.baseColorTexture, m.pbrMetallicRoughness.metallicRoughnessTexture);
    refs.push(m.normalTexture, m.occlusionTexture, m.emissiveTexture);
    for (const r of refs) if (r && J.textures[r.index].source !== undefined) out.add(J.textures[r.index].source);
  }
  return out;
}
function meshKey(g, mi) {
  const J = g.json, parts = [];
  for (const p of J.meshes[mi].primitives) {
    for (const k of Object.keys(p.attributes).sort()) parts.push(k, viewBytes(g, J.accessors[p.attributes[k]].bufferView));
    if (p.indices !== undefined) parts.push(viewBytes(g, J.accessors[p.indices].bufferView));
    if (p.material !== undefined) {
      // the material with its pictures by content (not by their place in the file)
      const m = JSON.stringify(J.materials[p.material], (k, v) => (k === 'index' && typeof v === 'number' && J.textures?.[v]
        ? { img: hash(viewBytes(g, J.images[J.textures[v].source].bufferView)), sampler: J.samplers?.[J.textures[v].sampler] } : v));
      parts.push(m);
    }
  }
  return hash(...parts);
}

// ---------- the split ----------
// import settings of new pictures (Godot fills in the rest and the ids; the
// .import files are committed). Town pictures: lossless, as Godot extracted
// them from town.glb before; plant pictures VRAM compressed (ASTC on the
// phone: as plain images the billboards alone took 130 MB of GPU memory);
// the ground's grass and dirt without mipmaps, as they always were.
const texImport = (mode, mips, detect) => `[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n\n[params]\n\ncompress/mode=${mode}\nmipmaps/generate=${mips}\nprocess/fix_alpha_border=true\ndetect_3d/compress_to=${detect}\n`;
const TEX_IMPORT = texImport(0, true, 0), VRAM_IMPORT = texImport(2, true, 0);
const BASE_IMPORT = { 'clouds.png': texImport(0, true, 1), 'grass.png': texImport(0, false, 1), 'dirt.webp': texImport(0, false, 1) };

class Out {
  constructor(root) { this.root = root; this.written = new Map(); }   // dir -> Set of names
  put(rel, data) {
    const f = path.join(this.root, rel), dir = path.dirname(rel), name = path.basename(rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (!fs.existsSync(f) || !fs.readFileSync(f).equals(Buffer.from(data))) fs.writeFileSync(f, data);
    if (!this.written.has(dir)) this.written.set(dir, new Set());
    this.written.get(dir).add(name);
  }
  seedImport(rel, body) { const f = path.join(this.root, rel + '.import'); if (!fs.existsSync(f)) fs.writeFileSync(f, body); this.written.get(path.dirname(rel)).add(path.basename(rel) + '.import'); }
  // files this part owns that it did not write this time are old: removed
  prune(dir, owns) {
    const d = path.join(this.root, dir);
    if (!fs.existsSync(d)) return;
    const keep = this.written.get(dir) || new Set();
    for (const f of fs.readdirSync(d)) {
      if (!fs.statSync(path.join(d, f)).isFile() || keep.has(f) || !owns(f)) continue;
      if (f.endsWith('.import') && keep.has(f.slice(0, -7))) continue;
      fs.rmSync(path.join(d, f));
    }
  }
}

const regionJson = (root, id) => { const f = path.join(root, 'r', id, 'region.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; };
function putRegionJson(out, id, patch) {
  const r = { ...regionJson(out.root, id), ...patch };
  const ordered = { id, box: box(REGIONS.find((q) => q.id === id)) };
  for (const k of ['colliders', 'inst', 'tiles', 'ink_meshes']) if (r[k] !== undefined) ordered[k] = r[k];
  out.put(`r/${id}/region.json`, JSON.stringify(ordered));
}

// raster tiles: the cells of each region (by their centres)
function tileOf(r, g) {
  const lo = (v, o) => (Number.isFinite(v) ? Math.ceil((v - o) / g.res - 0.5) : -I);
  const cl = (v, n) => Math.max(0, Math.min(n, v));
  const i0 = cl(lo(r.x0, g.x0), g.nx), i1 = cl(r.x1 === I ? g.nx : lo(r.x1, g.x0), g.nx);
  const j0 = cl(lo(r.z0, g.z0), g.nz), j1 = cl(r.z1 === I ? g.nz : lo(r.z1, g.z0), g.nz);
  return i1 > i0 && j1 > j0 ? [i0, j0, i1 - i0, j1 - j0] : null;
}
// planes: byte sizes per cell of each plane stored one after the other
function cutGrid(data, g, planes, t) {
  const [i0, j0, w, h] = t, parts = [];
  let base = 0;
  for (const b of planes) {
    for (let j = j0; j < j0 + h; j++) parts.push(data.subarray(base + (j * g.nx + i0) * b, base + (j * g.nx + i0 + w) * b));
    base += g.nx * g.nz * b;
  }
  if (base !== data.length) throw new Error(`grid size ${data.length} != ${base}`);
  return Buffer.concat(parts);
}

const WORLD_FILES = new Set(['town.glb', 'terrain.glb', 'inst.bin', 'veg.json', 'veg.bin', 'ground.bin', 'pathmap.bin', 'seabed.bin', 'grassmap.bin']);
const BASE_FILES = new Set(['world.json', 'water.glb', 'mountains.bin', 'cinnabar.bin', 'clouds.png', 'clouds.json', 'grass.png', 'dirt.webp']);

// src: a folder with the single-file bake (bake.mjs's outputs: world.json,
// town.glb, town_inst.bin, terrain.glb, water.glb, veg.json/bin, veg_*.png,
// the grids...; bake_ink.mjs's ink.bin and ink_meshes.json). parts: which to
// split ('world' = bake.mjs's, 'ink' = bake_ink.mjs's). dest: native/world.
export function splitWorld(src, dest, parts = ['world', 'ink']) {
  const out = new Out(dest);
  const S = (f) => fs.readFileSync(path.join(src, f));
  const has = (f) => fs.existsSync(path.join(src, f));
  const ids = REGIONS.map((r) => r.id);
  const stats = Object.fromEntries(ids.map((id) => [id, {}]));
  const note = (id, k, n) => { stats[id][k] = (stats[id][k] || 0) + n; };
  if (parts.includes('world')) {
    const meta = JSON.parse(S('world.json'));
    // ---- base ----
    const { colliders, inst, ...global } = meta;
    out.put('base/world.json', JSON.stringify({ format: 2, regions: ids, ...global }));
    for (const f of BASE_FILES) if (f !== 'world.json' && has(f)) out.put('base/' + f, S(f));
    for (const [f, imp] of Object.entries(BASE_IMPORT)) if (has(f)) out.seedImport('base/' + f, imp);
    // ---- colliders ----
    const col = Object.fromEntries(ids.map((id) => [id, []]));
    for (const c of colliders) col[regionOf(c[1], c[2])].push(c);
    // ---- town ----
    const town = readGlb(S('town.glb'));
    const TJ = town.json, root = TJ.nodes[TJ.scenes[0].nodes[0]];
    const instByNode = new Map(inst.map((e) => [e.node, e]));
    const xf = new Float32Array(S('town_inst.bin').buffer.slice(0));
    const nodesOf = Object.fromEntries(ids.map((id) => [id, []]));
    const instOf = Object.fromEntries(ids.map((id) => [id, { list: [], data: [] }]));
    for (const ni of root.children) {
      const n = TJ.nodes[ni];
      if (n.mesh === undefined) continue;
      const e = instByNode.get(n.name);
      if (!e) { const [x, z] = nodeCentre(town, n); nodesOf[regionOf(x, z)].push([ni, undefined]); continue; }
      // a repeated part: its mesh in every region that has copies, by a name from its content
      const name = 'I_' + hash(meshKey(town, n.mesh), String(e.color), String(e.shadow));
      const by = new Map();
      for (let i = 0; i < e.n; i++) {
        const o = (e.off + i) * 15, id = regionOf(xf[o + 3], xf[o + 11]);
        if (!by.has(id)) by.set(id, []);
        by.get(id).push(xf.subarray(o, o + 15));
      }
      for (const [id, rows] of by) {
        const I2 = instOf[id];
        let ent = I2.list.find((q) => q.node === name);
        if (!ent) { ent = { node: name, off: 0, n: 0, color: e.color, shadow: e.shadow, rows: [] }; I2.list.push(ent); nodesOf[id].push([ni, name]); }
        ent.rows.push(...rows);
      }
    }
    // pictures: in the one region that uses them, else shared in base/tex
    const imgHash = TJ.images ? TJ.images.map((im) => hash(viewBytes(town, im.bufferView))) : [];
    const imgUsers = imgHash.map(() => new Set());
    for (const id of ids) for (const [ni] of nodesOf[id]) for (const im of meshImages(town, TJ.nodes[ni].mesh)) imgUsers[im].add(id);
    for (let i = 0; i < imgHash.length; i++) {
      if (!imgUsers[i].size) continue;
      const rel = imgUsers[i].size > 1 ? `base/tex/${imgHash[i]}.png` : `r/${[...imgUsers[i]][0]}/${imgHash[i]}.png`;
      out.put(rel, viewBytes(town, TJ.images[i].bufferView));
      out.seedImport(rel, TEX_IMPORT);
    }
    for (const id of ids) {
      const I2 = instOf[id], data = [];
      let off = 0;
      for (const e of I2.list) { e.off = off; e.n = e.rows.length; off += e.n; for (const r of e.rows) data.push(...r); delete e.rows; }
      if (nodesOf[id].length) {
        out.put(`r/${id}/town.glb`, subsetGlb(town, nodesOf[id], (im) => (imgUsers[im].size > 1 ? `../../base/tex/${imgHash[im]}.png` : `${imgHash[im]}.png`)));
        note(id, 'town meshes', nodesOf[id].length);
      }
      if (data.length) out.put(`r/${id}/inst.bin`, Buffer.from(new Float32Array(data).buffer));
    }
    // ---- terrain ----
    const terr = readGlb(S('terrain.glb'));
    const tn = Object.fromEntries(ids.map((id) => [id, []]));
    for (const ni of terr.json.nodes[terr.json.scenes[0].nodes[0]].children) {
      const n = terr.json.nodes[ni];
      if (n.mesh === undefined) continue;
      const [x, z] = nodeCentre(terr, n);
      tn[regionOf(x, z)].push([ni, undefined]);
    }
    for (const id of ids) if (tn[id].length) { out.put(`r/${id}/terrain.glb`, subsetGlb(terr, tn[id], () => '')); note(id, 'terrain chunks', tn[id].length); }
    // ---- the grids ----
    const grids = [
      ['ground', 'ground.bin', meta.ground, [2, 1]],
      ['pathmap', 'pathmap.rgba', { ...meta.pathmap, res: meta.pathmap.w / meta.pathmap.nx }, [4]],
      ['seabed', 'seabed.bin', { ...meta.seabed, res: 1, nx: meta.seabed.n, nz: meta.seabed.n }, [4]],
      ['grassmap', 'grassmap.bin', meta.grassmap, [8]],
    ];
    const tiles = Object.fromEntries(ids.map((id) => [id, {}]));
    for (const [key, file, g, planes] of grids) {
      const data = S(file);
      let cells = 0;
      for (const r of REGIONS) {
        const t = tileOf(r, g);
        if (!t) continue;
        tiles[r.id][key] = t;
        out.put(`r/${r.id}/${key}.bin`, cutGrid(data, g, planes, t));
        cells += t[2] * t[3];
      }
      if (cells !== g.nx * g.nz) throw new Error(`${key}: the tiles cover ${cells} of ${g.nx * g.nz} cells`);
    }
    // ---- plants ----
    splitVeg(out, S, ids, note);
    for (const id of ids) putRegionJson(out, id, { colliders: col[id], inst: instOf[id].list, tiles: tiles[id] });
    out.prune('base', (f) => BASE_FILES.has(f.replace(/\.import$/, '')));
    out.prune('base/tex', () => true);
    out.prune('plants', () => true);
    for (const id of ids) out.prune('r/' + id, (f) => WORLD_FILES.has(f.replace(/\.import$/, '')) || /\.png(\.import)?$/.test(f));
    // regions no longer in the list
    const rdir = path.join(dest, 'r');
    if (fs.existsSync(rdir)) for (const d of fs.readdirSync(rdir)) if (!ids.includes(d)) fs.rmSync(path.join(rdir, d), { recursive: true });
  }
  if (parts.includes('ink')) {
    const raw = S('ink.bin');
    if (raw.toString('latin1', 0, 4) !== 'INK2') throw new Error('ink.bin: not INK2');
    const cells = raw.readUInt32LE(4), by = Object.fromEntries(ids.map((id) => [id, []]));
    let at = 8;
    for (let c = 0; c < cells; c++) {
      const cx = raw.readInt32LE(at), cz = raw.readInt32LE(at + 4), m = raw.readUInt32LE(at + 8), len = 12 + m * 136;
      // each edge goes with the region of its middle (a cell on a region's
      // edge becomes one cell in each)
      const P = at + 12, edges = new Map();
      for (let j = 0; j < m; j++) {
        const a = P + j * 48, b = a + 24;   // corners 0 (end A) and 2 (end B)
        const id = regionOf((raw.readFloatLE(a) + raw.readFloatLE(b)) / 2, (raw.readFloatLE(a + 8) + raw.readFloatLE(b + 8)) / 2);
        if (!edges.has(id)) edges.set(id, []);
        edges.get(id).push(j);
      }
      if (edges.size === 1) by[[...edges.keys()][0]].push(raw.subarray(at, at + len));
      else for (const [id, list] of edges) {
        const k = list.length, head = Buffer.alloc(12);
        head.writeInt32LE(cx, 0); head.writeInt32LE(cz, 4); head.writeUInt32LE(k, 8);
        const blocks = [[P, 48], [P + m * 48, 32], [P + m * 80, 16], [P + m * 96, 16]].map(([o, s]) => Buffer.concat(list.map((j) => raw.subarray(o + j * s, o + (j + 1) * s))));
        const idx = new Int32Array(k * 6);
        for (let q = 0; q < k; q++) { const v = q * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6); }
        by[id].push(Buffer.concat([head, ...blocks, Buffer.from(idx.buffer)]));
      }
      at += len;
    }
    if (at !== raw.length) throw new Error('ink.bin: bad size');
    const lists = has('ink_meshes.json') ? JSON.parse(S('ink_meshes.json')) : { hull: [], leaf: [] };
    const im = Object.fromEntries(ids.map((id) => [id, { hull: [], leaf: [] }]));
    for (const k of ['hull', 'leaf']) for (const c of lists[k] || []) im[regionOf(c[0], c[2])][k].push(c);
    for (const id of ids) {
      if (by[id].length) {
        const n = Buffer.alloc(4); n.writeUInt32LE(by[id].length);
        out.put(`r/${id}/ink.bin`, Buffer.concat([Buffer.from('INK2', 'ascii'), n, ...by[id]]));
        note(id, 'ink cells', by[id].length);
      }
      putRegionJson(out, id, { ink_meshes: im[id] });
      out.prune('r/' + id, (f) => f === 'ink.bin');
    }
  }
  return stats;
}

// plants: models by content, copies by where they stand, sets by what they are
function splitVeg(out, S, ids, note) {
  const V = JSON.parse(S('veg.json')), bin = S('veg.bin');
  const arr = (r) => bin.subarray(r[0], r[0] + r[1] * 4);
  // pictures, named by content
  const texName = {};
  for (const n of new Set(V.mats.map((m) => m.tex).filter(Boolean))) {
    const kind = n.replace(/^veg_/, '').replace(/[0-9_]*\.png$/, '');
    texName[n] = `${kind}_${hash(S(n))}.png`;
    out.put('plants/' + texName[n], S(n));
    out.seedImport('plants/' + texName[n], VRAM_IMPORT);
  }
  out.put('plants/bill.png', S('veg_bill.png'));
  out.seedImport('plants/bill.png', VRAM_IMPORT);
  const KEYS = ['pos', 'nrm', 'uv', 'col', 'flt', 'idx'];
  const meshId = V.meshes.map((e) => hash(JSON.stringify([e.v, e.box, KEYS.filter((k) => e[k])]), ...KEYS.filter((k) => e[k]).map((k) => arr(e[k]))));
  const mat = (i) => { const m = { ...V.mats[i] }; if (m.tex) m.tex = texName[m.tex]; return m; };
  // a billboard by what it shows: the model and how it was baked
  const impId = V.impostors.map(() => null);
  for (const s of V.sets) if (s.impostor !== null && s.impostor !== undefined && !impId[s.impostor]) {
    const { rect, ...geo } = V.impostors[s.impostor];
    impId[s.impostor] = hash(JSON.stringify(geo), ...s.parts.map((p) => meshId[p.mesh]));
  }
  out.put('plants/plants.json', JSON.stringify({ billSize: V.billSize, uvDown: V.uvDown,
    impostors: V.impostors.map((im, i) => ({ id: impId[i] || hash(JSON.stringify(im)), ...im })) }));
  // each set's copies, by region
  const per = Object.fromEntries(ids.map((id) => [id, []]));
  const useBy = V.meshes.map(() => new Map());
  for (const s of V.sets) {
    const xf = new Float32Array(arr(s.xf).buffer.slice(arr(s.xf).byteOffset, arr(s.xf).byteOffset + s.xf[1] * 4));
    const ip = new Float32Array(arr(s.ip).buffer.slice(arr(s.ip).byteOffset, arr(s.ip).byteOffset + s.ip[1] * 4));
    const { xf: _a, ip: _b, n: _c, parts, impostor, ...opts } = s;
    const def = { parts: parts.map((p) => ({ mesh: meshId[p.mesh], mat: mat(p.mat) })), ...opts, impostor: impostor === null || impostor === undefined ? null : impId[impostor] };
    const key = hash(JSON.stringify(def));
    const by = new Map();
    for (let i = 0; i < s.n; i++) {
      const id = regionOf(ip[i * 5], ip[i * 5 + 2]);
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(i);
    }
    for (const [id, list] of by) {
      per[id].push({ key, def, xf: Float32Array.from(list.flatMap((i) => [...xf.subarray(i * 12, i * 12 + 12)])), ip: Float32Array.from(list.flatMap((i) => [...ip.subarray(i * 5, i * 5 + 5)])), n: list.length });
      for (const p of parts) useBy[p.mesh].set(id, (useBy[p.mesh].get(id) || 0) + list.length);
    }
  }
  // a model lives in the region with most of its copies (ties: the first in the list)
  const home = useBy.map((m) => { let best = null, bn = -1; for (const id of ids) if ((m.get(id) || 0) > bn) { best = id; bn = m.get(id) || 0; } return bn > 0 ? best : null; });
  for (const id of ids) {
    const bufs = [];
    let off = 0;
    const put = (a) => { const o = off; bufs.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); off += a.byteLength; return [o, a.byteLength / 4]; };
    const meshes = [];
    const seen = new Set();
    V.meshes.forEach((e, i) => {
      if (home[i] !== id || seen.has(meshId[i])) return;
      seen.add(meshId[i]);
      const m = { id: meshId[i], v: e.v, box: e.box };
      for (const k of KEYS) if (e[k]) { const b = arr(e[k]); m[k] = put(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)); }
      meshes.push(m);
    });
    const sets = per[id].map((p) => ({ key: p.key, ...p.def, xf: put(p.xf), ip: put(p.ip), n: p.n }));
    if (!meshes.length && !sets.length) continue;
    out.put(`r/${id}/veg.json`, JSON.stringify({ meshes, sets }));
    out.put(`r/${id}/veg.bin`, Buffer.concat(bufs));
    note(id, 'plant models', meshes.length);
    note(id, 'plant copies', sets.reduce((a, s) => a + s.n, 0));
  }
}

// Godot imports the new files (and writes their .import files, which are
// committed with them so every machine gives them the same ids)
export function godotImport(project) {
  const g = process.env.GODOT;
  if (!g) { console.warn('regions: GODOT is not set: run Godot --import on native/ before committing (new pictures need their .import files)'); return; }
  const r = spawnSync(g, ['--headless', '--path', project, '--import'], { stdio: 'ignore' });
  if (r.status !== 0) console.warn('regions: Godot --import failed');
}

export function report(stats, dest) {
  const size = (d) => { let t = 0; if (!fs.existsSync(d)) return 0; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); t += fs.statSync(p).isDirectory() ? size(p) : fs.statSync(p).size; } return t; };
  const mb = (n) => (n / 1048576).toFixed(1).padStart(6) + ' MB';
  for (const d of ['base', 'plants']) console.log(`${d.padEnd(20)} ${mb(size(path.join(dest, d)))}`);
  for (const r of REGIONS) console.log(`${r.id.padEnd(20)} ${mb(size(path.join(dest, 'r', r.id)))}  ${Object.entries(stats[r.id] || {}).map(([k, v]) => `${v} ${k}`).join(', ')}`);
}

// the world as the native game joins it back (for tools that read it):
// base/world.json plus every region's colliders
export function readWorld(dest) {
  const meta = JSON.parse(fs.readFileSync(path.join(dest, 'base/world.json'), 'utf8'));
  meta.colliders = [];
  for (const id of meta.regions) meta.colliders.push(...(regionJson(dest, id).colliders || []));
  return meta;
}
