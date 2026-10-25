// Writes web/world/maps/kanto_south.json: the coarse "pallet-map" region
// blueprint of the south of Kanto as built so far (the seed of the world map):
// the peninsula's land, Pallet Town, the harbour, the lighthouse islet,
// Route 1 with its ledges and tall grass, and the way on to Viridian City
// (not built yet). Everything comes from web/world/terrain.js, so rerun this
// after changing the land:  node tools/maps/region.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const three = pathToFileURL(path.join(ROOT, 'web/lib/three/three.module.min.js')).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true }; return n(s, c); }`));
const T = await import(pathToFileURL(path.join(ROOT, 'web/world/terrain.js')).href);
const F = await import(pathToFileURL(path.join(ROOT, 'web/world/maps/format.js')).href);
const R1 = await import(pathToFileURL(path.join(ROOT, 'web/world/route1land.js')).href);   // Route 1's pockets, trails, creeks

const G = 1;   // the region's grid: 1 m
const r = (v) => Math.round(v / G) * G;
const pt = ([x, z]) => [r(x), r(z)];
const BOUNDS = [-500, -900, 500, 320];
const clampB = ([x, z]) => [Math.min(BOUNDS[2], Math.max(BOUNDS[0], x)), Math.min(BOUNDS[3], Math.max(BOUNDS[1], z))];
// the land: the waterline traced every ~25 m round the coast (from the
// signed distance), clipped to the bounds
const land = [];
{
  // march round the shore: sample a ring of points on the waterline by angle
  // from the town, out to the bounds
  for (let a = 0; a < 360; a += 2) {
    const t = a * Math.PI / 180, dx = Math.sin(t), dz = Math.cos(t);
    let last = [0, 0];
    for (let d = 0; d < 1400; d += 2) {
      const x = dx * d, z = 40 + dz * d;
      if (x < BOUNDS[0] || x > BOUNDS[2] || z < BOUNDS[1] || z > BOUNDS[3]) { last = clampB([x, z]); break; }
      if (T.shoreSD(x, z) < 0 && z > -380) { last = [x, z]; break; }
      last = [x, z];
    }
    const p = pt(last);
    if (!land.length || Math.hypot(p[0] - land[land.length - 1][0], p[1] - land[land.length - 1][1]) > 3) land.push(p);
  }
}
const rect = (x0, z0, x1, z1) => [[r(x0), r(z0)], [r(x1), r(z0)], [r(x1), r(z1)], [r(x0), r(z1)]];
// Route 1's valley: the walkable corridor from the rim to the gate
const corridor = [];
for (let z = -66; z >= T.ROUTE1.gateZ; z -= 12) corridor.push(pt([T.routeX(z) + T.routeHalfWidth(z), z]));
for (let z = T.ROUTE1.gateZ; z <= -66; z += 12) corridor.push(pt([T.routeX(z) - T.routeHalfWidth(z), z]));
const H = T.HARBOUR;
// Route 1's side pockets (ellipses) and creeks (route1land.js)
const ell = (p) => { const out = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, u = Math.cos(a) * p.rx, v = Math.sin(a) * p.rz; out.push(pt([p.cx + u * Math.cos(p.rot) + v * Math.sin(p.rot), p.cz - u * Math.sin(p.rot) + v * Math.cos(p.rot)])); } return out; };
const POCKET_INFO = {
  farm: ['Route 1 farm', 'farm', ['farm', 'scarecrow', 'shed', 'birdhouses']],
  meadow: ['The flower meadow', 'meadow', ['meadow', 'wildflowers', 'lone-tree', 'swing', 'lookout', 'telescope', 'butterflies']],
  orchard: ['Berry orchard', 'orchard', ['orchard', 'berries', 'oran', 'pecha', 'cheri', 'rawst']],
  tea: ['Tea house dell', 'route', ['tea-house', 'creek', 'stepping-stones', 'shrine', 'npc:tea-keeper']],
  rest: ['Rest area', 'route', ['rest-area', 'picnic', 'vending-machine']],
  west_end: ['Viridian outskirts (west)', 'route', ['cottage', 'garden', 'windmill', 'civilization']],
  east_end: ['Viridian outskirts (east)', 'route', ['water-tower', 'civilization']],
};
const creekZones = R1.CREEKS.map((c) => {
  const L = c.line, left = [], right = [];
  for (let i = 0; i < L.length; i += 6) {
    const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    left.push(pt([L[i][0] - dz / l * (c.w + 0.5), L[i][1] + dx / l * (c.w + 0.5)])); right.push(pt([L[i][0] + dz / l * (c.w + 0.5), L[i][1] - dx / l * (c.w + 0.5)]));
  }
  return { id: 'creek_' + c.id, name: c.id === 'tea' ? 'Tea house creek' : 'Viridian brook', level: 'ground', poly: [...left, ...right.reverse()], floor: 'water', walk: false, ceiling: { type: 'sky' }, tags: ['creek', 'fresh-water'] };
});
const bp = {
  format: 'pallet-map', version: 1, id: 'kanto_south', name: 'South Kanto: Pallet Town and Route 1', kind: 'region', grid: G,
  bounds: BOUNDS,
  note: 'Coarse region plan, made by tools/maps/region.mjs from web/world/terrain.js. Zones: what each area is; walk:false = seen, not walked. Ledges are one-way (hop south only).',
  palette: {
    grass: { color: '#72c94a', label: 'grass and woods' }, town: { color: '#c9e08a', label: 'Pallet Town' }, route: { color: '#9ad655', label: 'route' },
    tall: { color: '#2f6a35', label: 'tall grass' }, meadow: { color: '#e8a0c0', label: 'flower meadow' }, orchard: { color: '#7ab05a', label: 'orchard' },
    farm: { color: '#a0644a', label: 'farm field' }, water: { color: '#58b0d8', label: 'creek' }, paved: { color: '#c9c3b0', label: 'gravel / cobbles' }, sand: { color: '#f7dc9c', label: 'beach' }, timber: { color: '#c99a62', label: 'timber deck' },
    rock: { color: '#a08890', label: 'rock' }, forest: { color: '#3f7f3a', label: 'forest (bounds)' },
  },
  levels: [{ id: 'ground', name: 'Ground', y: 0 }],
  zones: [
    { id: 'land', name: 'The peninsula and the mainland', level: 'ground', poly: land, floor: 'grass', walk: false, ceiling: { type: 'sky' }, tags: ['land'] },
    { id: 'pallet_town', name: 'Pallet Town', level: 'ground', poly: rect(-150, -66, 150, 80), floor: 'town', ceiling: { type: 'sky' }, tags: ['town'] },
    { id: 'west_headland', name: 'West headland', level: 'ground', poly: rect(-186, 80, -100, 210), floor: 'grass', ceiling: { type: 'sky' }, tags: ['headland', 'cliffs'] },
    { id: 'east_headland', name: 'East headland', level: 'ground', poly: rect(110, 80, 186, 210), floor: 'grass', ceiling: { type: 'sky' }, tags: ['headland', 'cliffs'] },
    { id: 'harbour', name: 'Pallet Harbour', level: 'ground', poly: rect(H.quay.x0, H.quay.z0, H.quay.x1, H.arms[0].z1 + H.head.d), floor: 'timber', ceiling: { type: 'sky' }, tags: ['dock', 'square-U'] },
    { id: 'lighthouse_islet', name: 'Lighthouse islet', level: 'ground', poly: rect(T.ISLET.x - 9, T.ISLET.z - 9, T.ISLET.x + 9, T.ISLET.z + 9), floor: 'rock', walk: false, ceiling: { type: 'sky' }, tags: ['islet'] },
    { id: 'route_1', name: 'Route 1', level: 'ground', poly: corridor, floor: 'route', ceiling: { type: 'sky' }, tags: ['route', 'wild'] },
    ...R1.POCKETS.map((p) => ({ id: 'r1_' + p.id, name: POCKET_INFO[p.id][0], level: 'ground', poly: ell(p), floor: POCKET_INFO[p.id][1], ceiling: { type: 'sky' }, tags: ['route-1', 'zone-' + p.zone, ...POCKET_INFO[p.id][2]] })),
    ...creekZones,
    ...T.TALL_GRASS.map(([x0, z0, x1, z1], i) => ({ id: 'tall_' + (i + 1), name: 'Tall grass', level: 'ground', poly: rect(x0, z0, x1, z1), floor: 'tall', ceiling: { type: 'sky' }, tags: ['tall-grass', 'encounters'] })),
  ],
  walls: [],
  ledges: T.LEDGES.map((L) => ({ id: 'ledge_' + (L.i + 1), from: [r(L.x0), r(L.z)], to: [r(L.x1), r(L.z)], drop: L.drop, hop: 'south' })),
  roads: [{ id: 'route_1_road', name: 'Route 1', pts: T.ROADS[0].filter((_, i) => i % 12 === 0).map(pt), note: 'dirt; gravel from z -335, cobbles with a kerb from z -386 to the gate' },
    ...R1.TRAILS.map((t, i) => ({ id: 'route_1_trail_' + (i + 1), name: 'Route 1 trail', pts: t.map(pt) }))],
  props: [],
  camera: { default: { dist: 7.5, pitch: 0.32, fov: 52, height: 1.45 }, volumes: [{ id: 'sky', box: [BOUNDS[0], -20, BOUNDS[1], BOUNDS[2], 400, BOUNDS[3]] }] },
  spawns: [{ id: 'from_viridian', pos: pt([T.routeX(T.ROUTE1.gateZ + 6), T.ROUTE1.gateZ + 6]), level: 'ground', rot: 0 }],
  portals: [{ id: 'to_pallet_house', level: 'ground', rect: [r(T.PALLET_HOUSE.x - 2), r(T.PALLET_HOUSE.z - 2), r(T.PALLET_HOUSE.x + 2), r(T.PALLET_HOUSE.z + 2)], trigger: 'use', spawn: 'from_viridian', to: { map: 'pallet_house', spawn: 'front_door' }, label: 'PALLET HOUSE (interior not built yet)', locked: true },
    { id: 'to_viridian', level: 'ground', rect: [r(T.routeX(T.ROUTE1.gateZ) - 4), r(T.ROUTE1.gateZ - 3), r(T.routeX(T.ROUTE1.gateZ) + 4), r(T.ROUTE1.gateZ)], trigger: 'walk', spawn: 'from_viridian', to: { map: 'viridian_city', spawn: 'from_route_1' }, label: 'Viridian City (not built yet: the gate is shut)', locked: true }],
  places: {
    pallet_town: { at: [-3, -2], note: 'the square' }, oak_lab: { at: pt(T.STAIRS ? [T.LAB_HILL.x, T.LAB_HILL.z] : [60, 20]), map: 'oak_lab' },
    harbour: { at: pt([(H.quay.x0 + H.quay.x1) / 2, H.quay.z1 + 10]) }, lighthouse: { at: pt([T.ISLET.x, T.ISLET.z]) },
    viridian_city: { at: [0, -560], note: 'planned: past the gate, on the mainland; glimpsed from Route 1 (roofs, terraces, the clock tower)' }, cinnabar_island: { at: [-60, 1050], note: 'far south over the sea: scenery on the horizon (nature.js buildCinnabar), off the map' },
    pallet_house: { at: pt([T.PALLET_HOUSE.x, T.PALLET_HOUSE.z]), map: 'pallet_house', note: "Delia's restaurant with rooms upstairs, on the hill above the bay (exterior only; its door is a locked portal stub)" },
    viewpoint: { at: pt([T.CLEARINGS[0].x, T.CLEARINGS[0].z]), note: 'the east headland trail ends here' },
    route1_tea_house: { at: pt([R1.TEA.x, R1.TEA.z]), note: 'roadside tea house (chaya): benches, parasol, lanterns; the tea keeper' },
    route1_lone_tree: { at: pt([R1.TREE.x, R1.TREE.z]), note: 'the meadow\'s lone tree with a swing and a bench' },
    route1_lookout: { at: pt([R1.LOOKOUT.x, R1.LOOKOUT.z]), note: 'lookout deck with a coin telescope: Pallet Town and the sea' },
    route1_shrine: { at: pt([R1.SHRINE.x, R1.SHRINE.z]), note: 'wayside shrine and stone lanterns' },
    route1_rest_area: { at: pt([R1.REST.x, R1.REST.z]), note: 'picnic tables, vending machine' },
    route1_mart_clerk: { at: [12, -92], note: 'POKé MART clerk with free POTION samples' },
    route1_cottage: { at: pt([R1.COTTAGE.x, R1.COTTAGE.z]), note: 'ivy cottage on Viridian\'s edge' },
    route1_water_tower: { at: pt([R1.TOWER.x, R1.TOWER.z]) }, route1_windmill: { at: [-104, -421] },
    route1_bus_stop: { at: pt([T.routeX(-400) + 5, -400]), note: 'bus stop and postbox' },
  },
};
const res = F.validate(bp, {});
for (const e of res.errors) console.error('error:', e);
for (const w of res.warnings) console.warn('warning:', w);
fs.writeFileSync(path.join(ROOT, 'web/world/maps/kanto_south.json'), JSON.stringify(bp, null, 1) + '\n');
console.log('kanto_south.json:', bp.zones.length, 'zones,', bp.ledges.length, 'ledges, land outline', land.length, 'points;', res.errors.length, 'errors');
