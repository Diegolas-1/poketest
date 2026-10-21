// Downloads CC0 models and textures from Poly Haven (polyhaven.com) and makes
// them small enough for the browser: simplified meshes, WebP textures and
// meshopt-compressed .glb files in web/world/assets/.
//
//   cd tools/world && npm install && node fetch-assets.mjs [id ...]
//
// Everything here is CC0 (public domain). The list of what we use and where it
// came from is written to web/world/assets/CREDITS.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, 'cache');
const OUT = path.join(here, '../../web/world/assets');
const API = 'https://api.polyhaven.com';

// Models: id, target triangle count, texture size.
export const MODELS = [
  // trees
  { id: 'island_tree_02', tris: 60000, tex: 1024, kind: 'tree' },
  { id: 'island_tree_01', tris: 90000, tex: 1024, kind: 'tree' },
  { id: 'island_tree_03', tris: 90000, tex: 1024, kind: 'tree' },
  { id: 'fir_sapling', tris: 25000, tex: 1024, kind: 'tree' },
  { id: 'pine_sapling_small', tris: 25000, tex: 1024, kind: 'tree' },
  // shrubs and ground plants
  { id: 'shrub_01', tris: 12000, tex: 1024, kind: 'plant' },
  { id: 'shrub_02', tris: 10000, tex: 1024, kind: 'plant' },
  { id: 'shrub_03', tris: 8000, tex: 512, kind: 'plant' },
  { id: 'shrub_04', tris: 8000, tex: 512, kind: 'plant' },
  { id: 'shrub_sorrel_01', tris: 3400, tex: 512, kind: 'plant' },
  { id: 'fern_02', tris: 6300, tex: 512, kind: 'plant' },
  { id: 'nettle_plant', tris: 6000, tex: 512, kind: 'plant' },
  { id: 'weed_plant_02', tris: 6000, tex: 512, kind: 'plant' },
  { id: 'wild_rooibos_bush', tris: 8000, tex: 512, kind: 'plant' },
  { id: 'calathea_orbifolia_01', tris: 6000, tex: 512, kind: 'plant' },
  { id: 'dandelion_01', tris: 4000, tex: 512, kind: 'flower' },
  { id: 'periwinkle_plant', tris: 6000, tex: 512, kind: 'flower' },
  { id: 'flower_ursinia', tris: 4000, tex: 512, kind: 'flower' },
  { id: 'flower_gazania', tris: 4000, tex: 512, kind: 'flower' },
  { id: 'flower_empodium', tris: 4000, tex: 512, kind: 'flower' },
  { id: 'grass_bermuda_01', tris: 12000, tex: 512, kind: 'grass' },
  { id: 'moss_01', tris: 6000, tex: 512, kind: 'ground' },
  { id: 'rock_moss_set_01', tris: 8000, tex: 1024, kind: 'rock' },
  { id: 'rock_moss_set_02', tris: 8000, tex: 1024, kind: 'rock' },
  { id: 'boulder_01', tris: 8000, tex: 1024, kind: 'rock' },
  { id: 'tree_stump_01', tris: 6000, tex: 1024, kind: 'rock' },
  // building parts and street things
  { id: 'planter_box_01', tris: 8100, tex: 1024, kind: 'prop' },
  { id: 'planter_box_02', tris: 11000, tex: 1024, kind: 'prop' },
  { id: 'planter_box_03', tris: 13200, tex: 1024, kind: 'prop' },
  { id: 'planter_pot_clay', tris: 3100, tex: 512, kind: 'prop' },
  { id: 'potted_plant_01', tris: 12000, tex: 512, kind: 'prop' },
  { id: 'potted_plant_02', tris: 12000, tex: 512, kind: 'prop' },
  { id: 'exterior_aircon_unit', tris: 12000, tex: 1024, kind: 'prop' },
  { id: 'utility_box_02', tris: 6300, tex: 1024, kind: 'prop' },
  { id: 'industrial_wall_lamp', tris: 4500, tex: 512, kind: 'prop' },
  { id: 'security_light', tris: 4700, tex: 512, kind: 'prop' },
  { id: 'modular_street_seating', tris: 14000, tex: 1024, kind: 'prop' },
  { id: 'wooden_picnic_table', tris: 10300, tex: 1024, kind: 'prop' },
  { id: 'outdoor_table_chair_set_01', tris: 9900, tex: 1024, kind: 'prop' },
  { id: 'watering_can_metal_01', tris: 6000, tex: 512, kind: 'prop' },
  { id: 'wooden_crate_02', tris: 5200, tex: 1024, kind: 'prop' },
  { id: 'wooden_barrels_01', tris: 12000, tex: 1024, kind: 'prop' },
  { id: 'wicker_basket_01', tris: 8000, tex: 512, kind: 'prop' },
  { id: 'seeding_tray_01', tris: 6000, tex: 512, kind: 'prop' },
  { id: 'lifebuoy', tris: 6000, tex: 512, kind: 'prop' },
  { id: 'ocean_buoy', tris: 8000, tex: 512, kind: 'prop' },
  { id: 'lateral_sea_marker', tris: 8000, tex: 512, kind: 'prop' },
  { id: 'stone_fire_pit', tris: 3900, tex: 1024, kind: 'prop' },
];

// Surface textures for the buildings: id, size.
export const TEXTURES = [
  { id: 'white_plaster_02', size: 1024 },
  { id: 'painted_plaster_wall', size: 1024 },
  { id: 'wood_planks', size: 1024 },
  { id: 'weathered_planks', size: 1024 },
  { id: 'corrugated_iron', size: 1024 },
  { id: 'metal_plate', size: 1024 },
  { id: 'concrete_floor_02', size: 1024 },
  { id: 'cobblestone_floor_08', size: 1024 },
  { id: 'brown_mud_leaves_01', size: 1024 },
  { id: 'aerial_grass_rock', size: 1024 },
];

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'pallet-world-assets' } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url, { headers: { 'User-Agent': 'pallet-world-assets' } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

function countTris(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return n;
}

async function model(m, credits) {
  const files = await getJSON(`${API}/files/${m.id}`);
  const g = files.gltf['1k'].gltf;
  const dir = path.join(CACHE, m.id);
  const main = path.join(dir, path.basename(g.url));
  await download(g.url, main);
  for (const [rel, v] of Object.entries(g.include)) await download(v.url, path.join(dir, rel));
  await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(main);
  const before = countTris(doc);
  const ratio = Math.min(1, m.tris / before);
  await doc.transform(
    dedup(), prune(), weld({ tolerance: 0.0001 }),
    ...(ratio < 0.98 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: m.kind === 'tree' ? 0.02 : 0.01, lockBorder: false })] : []),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [m.tex, m.tex], quality: 82 }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const after = countTris(doc);
  const out = path.join(OUT, 'models', `${m.id}.glb`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  const info = (await getJSON(`${API}/info/${m.id}`));
  credits.models[m.id] = { name: info.name, authors: Object.keys(info.authors || {}), license: 'CC0', source: `https://polyhaven.com/a/${m.id}`, tris: Math.round(after) };
  console.log(`${m.id.padEnd(28)} ${Math.round(before)} -> ${Math.round(after)} tris, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}

async function texture(t, credits) {
  const files = await getJSON(`${API}/files/${t.id}`);
  const pick = (k) => files[k] && files[k]['1k'] && (files[k]['1k'].jpg || files[k]['1k'].png);
  const maps = { diff: pick('Diffuse'), nor: pick('nor_gl'), arm: pick('arm') };
  const dir = path.join(OUT, 'tex', t.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, f] of Object.entries(maps)) {
    if (!f) continue;
    const src = path.join(CACHE, 'tex', t.id, path.basename(f.url));
    await download(f.url, src);
    await sharp(src).resize(t.size, t.size).webp({ quality: 82 }).toFile(path.join(dir, `${k}.webp`));
  }
  const info = await getJSON(`${API}/info/${t.id}`);
  credits.textures[t.id] = { name: info.name, authors: Object.keys(info.authors || {}), license: 'CC0', source: `https://polyhaven.com/a/${t.id}` };
  console.log(`texture ${t.id}: ${Object.keys(maps).filter((k) => maps[k]).join(', ')}`);
}

const only = process.argv.slice(2);
const credFile = path.join(OUT, 'CREDITS.json');
const credits = fs.existsSync(credFile) ? JSON.parse(fs.readFileSync(credFile, 'utf8')) : { models: {}, textures: {} };
credits.note = 'All models and textures are CC0 from Poly Haven (https://polyhaven.com), reduced in size for the web.';
for (const m of MODELS) if (!only.length || only.includes(m.id)) {
  try { await model(m, credits); } catch (e) { console.error(`${m.id}: ${e.message}`); }
}
for (const t of TEXTURES) if (!only.length || only.includes(t.id)) {
  try { await texture(t, credits); } catch (e) { console.error(`${t.id}: ${e.message}`); }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(credFile, JSON.stringify(credits, null, 2));
