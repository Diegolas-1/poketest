// Bakes the town's places for the native town life (native/life.gd) into
// native/life/places.json: every house's door (where a person stands to go in,
// and the way it faces), its gate, porch and yard spots; the pier, the boat
// steps (Gus rows out to the lighthouse from there), the beach, the boathouse,
// the square (the "plaza", market mornings), the sandy plaza before the lab gate
// ("lab_gate"), Route 1's gate in the rim, the fields, the pond, the hill by Old
// Tom's, the benches; and the lanes (dense polylines) the walkers prefer.
// Positions come straight from web/world/terrain.js and the baked cast/world
// data (doors and mailboxes from cast.json `use`, benches from the colliders);
// life.gd snaps every spot onto its walk grid at load, so a spot that lands on
// a flower tub or a fence still works.
// Run: node tools/native/bake_places.mjs   (no browser needed)
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const three = pathToFileURL(path.join(ROOT, 'web/lib/three/three.module.min.js')).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true }; return n(s, c); }`));
const T = await import(pathToFileURL(path.join(ROOT, 'web/world/terrain.js')).href);
const cast = JSON.parse(fs.readFileSync(path.join(ROOT, 'native/cast/cast.json'), 'utf8'));
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'native/world/world.json'), 'utf8'));

const r2 = (v) => Math.round(v * 100) / 100;
const P = (x, z, yaw) => (yaw === undefined ? [r2(x), r2(z)] : [r2(x), r2(z), r2(yaw)]);
const near = (list, x, z) => list.reduce((b, u) => (Math.hypot(u.x - x, u.z - z) < Math.hypot(b.x - x, b.z - z) ? u : b));
const facing = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

const doors = cast.use.filter((u) => u.label === 'Door');
const boxes = cast.use.filter((u) => u.label === 'Look' && /mailbox/.test(u.lines[0]));
// (only those inside the town life's walk grid, life.gd X0..X1, Z0..Z1: the
// trails' far benches are out in the woods)
const benches = world.colliders.filter((c) => c[0] === 0 && Math.abs(c[3] - 0.95) < 1e-3 && c[1] > -110 && c[1] < 78 && c[2] > -60 && c[2] < 150).map((c) => ({ x: c[1], z: c[2] }));

const out = { note: 'baked by tools/native/bake_places.mjs; [x, z] or [x, z, yaw] (yaw: the way a person there faces)', houses: {}, places: {}, roads: [] };

// ---------- the houses ----------
for (const hs of T.HOUSES) {
  const n = [Math.sin(hs.rot), Math.cos(hs.rot)];            // out of the front door
  const d = near(doors, ...T.toWorld(hs, -hs.side * 1.75, 4.3));
  const inYaw = Math.atan2(-n[0], -n[1]);                     // facing the door
  const dx = -hs.side * 1.75;
  const yard = [];
  // the garden side and the front, away from the lane to the gate
  for (const [lx, lz] of [[hs.side * 4.6, 6.4], [hs.side * 6.4, 4.2], [hs.side * 3.2, 7.4], [hs.side * 6.8, 1.0], [-hs.side * 5.6, 6.6], [-hs.side * 6.6, 2.0]]) {
    const [x, z] = T.toWorld(hs, lx, lz);
    yard.push(P(x, z, facing(x, z, hs.x, hs.z)));
  }
  const porch = T.toWorld(hs, dx - hs.side * 1.4, 5.0);
  const gate = T.gateOf(hs);
  const out2 = T.toWorld(hs, dx, T.YARD.z1 + 2.0);
  const mb = near(boxes, ...gate);
  out.houses[hs.id] = {
    center: P(hs.x, hs.z), rot: r2(hs.rot), floor_y: r2(hs.y + 0.45),   // the door's sill (town.js: base 0.45 over the house's y)
    door: P(d.x, d.z, inYaw),                    // stand here facing the door to go in
    doorway: P(d.x - n[0] * 1.0, d.z - n[1] * 1.0, inYaw),   // the door itself (the "open" beat is drawn here)
    porch: P(porch[0], porch[1], Math.atan2(n[0], n[1])),
    gate: P(gate[0], gate[1]), lane: P(out2[0], out2[1]),
    mailbox: P(mb.x, mb.z), yard,
  };
}

// ---------- the waterfront ----------
// the harbour (terrain.js HARBOUR): "pier" is the west pier and its head,
// with spots on the quay too; Gus's boat steps are the iron ladder at the
// west pier's head (town.js dock)
const HB = T.HARBOUR, [WA, EA] = HB.arms, Q = HB.quay, PX = WA.x, PZ0 = WA.z0, PZ1 = WA.z1, HW = HB.w / 2;
const pierY = Math.PI;   // looking out to sea is +z (south): yaw 0; the land is yaw PI
out.places.pier = {
  spots: [P(PX - 2.2, PZ1 + 3.4, 0), P(PX + 1.2, PZ1 + 3.6, 0.2), P(PX - 1.0, PZ1 + 1.2, -0.3), P(PX + 0.9, PZ1 - 3.0, Math.PI / 2), P(PX - 0.9, PZ1 - 10.0, -Math.PI / 2),
    P(EA.x - 0.9, EA.z1 + 3.4, 0), P(EA.x + 0.9, EA.z0 + 14.0, -Math.PI / 2), P((Q.x0 + Q.x1) / 2 + 3, Q.z1 - 1.0, 0)],
  head: P(PX, PZ1 + 2.0), foot: P((Q.x0 + Q.x1) / 2, Q.z0 + 0.8),
  boat_steps: P(PX + HW - 0.45, PZ1 - 3, Math.PI / 2),   // Gus's dinghy: off to the lighthouse from here
};
const bhx = T.BOATHOUSE.x, bhz = T.BOATHOUSE.z;
out.places.boathouse = { spots: [P(bhx + 0.2, bhz + 3.4, pierY), P(bhx - 1.8, bhz + 3.8, pierY + 0.4), P(bhx + 2.2, bhz + 4.0, pierY - 0.5)], door: P(bhx + 0.2, bhz + 3.2, pierY) };
const beach = [];
for (const x of [-72, -66, 12, 20, 30, 40]) beach.push(P(x, T.coastZ(x) - 3.5, 0 + (x % 3) * 0.2));
out.places.beach = { spots: beach };
out.places.lighthouse = { spots: [P(T.ISLET.x, T.ISLET.z)], offmap: true, via: 'pier.boat_steps' };

// ---------- PALLET HOUSE (Delia's restaurant on the hill above the bay) ----------
// every named spot from terrain.js PALLET_HOUSE.spots, in world space, with the
// way a person there faces; tables carry their chairs (3 round each). Outside
// life.gd's walk grid (x up to 80) for now: a later worker extends it there
{
  const PH = T.PALLET_HOUSE, hs = { x: PH.x, z: PH.z, rot: PH.rot };
  const W = (s) => { const [x, z] = T.toWorld(hs, s[0], s[1]); return s.length > 2 ? P(x, z, s[2] + PH.rot) : P(x, z); };
  const ph = { middle: P(PH.x, PH.z), floor_y: r2(PH.y + 0.3), offmap: false, interior: 'pallet_house (not built: the door is a locked portal stub)' };
  for (const [k, v] of Object.entries(PH.spots)) if (k !== 'tables') ph[k] = W(v);
  ph.tables = PH.spots.tables.map(([tx, tz]) => ({ table: W([tx, tz]), chairs: [0, 2.1, 4.2].map((a) => W([tx + Math.cos(a) * 0.85, tz + Math.sin(a) * 0.85, Math.atan2(-Math.cos(a), -Math.sin(a))])) }));
  out.places.pallet_house = ph;
}

// ---------- the square (the market), the lab gate, Route 1 ----------
const S = T.SQUARE;
const sqBench = benches.filter((b) => Math.hypot(b.x - S.x, b.z - S.z) < S.r + 6);
const stalls = [P(S.x - 4.2, S.z - 3.6, 0.7), P(S.x + 1.2, S.z - 5.4, 0.1), P(S.x - 5.6, S.z + 1.2, Math.PI / 2)];
out.places.plaza = {
  center: P(S.x, S.z), r: S.r,
  spots: [P(S.x - 2, S.z + 3, 0), P(S.x + 3.5, S.z - 2.5, -1.2), P(S.x - 5, S.z - 1, 1.4), P(S.x + 1, S.z - 4, 0.2), P(S.x - 1.5, S.z - 5.5, 0.5), P(S.x + 4, S.z + 3.2, -2.4)],
  stalls,                                          // market mornings: where the sellers stand
  well: P(1.8, 1.3 + 1.6, Math.PI),
  benches: sqBench.map((b) => P(b.x, b.z)),
};
const L = T.PLAZA;
out.places.lab_gate = { spots: [P(L.x0 + 2.5, 13.0, Math.PI / 2), P(L.x0 + 3.5, 19.5, Math.PI / 2 + 0.4), P(L.x0 + 1.5, 16, Math.PI / 2)], benches: benches.filter((b) => b.x > L.x0 - 1 && b.x < L.x1 + 1 && b.z > L.z0 - 1 && b.z < L.z1 + 1).map((b) => P(b.x, b.z)) };
out.places.route1_gate = { spots: [P(-3.2, -42.0, Math.PI), P(-1.0, -39.0, Math.PI - 0.4), P(-5.0, -37.0, 2.6)] };

// ---------- the land ----------
out.places.fields = { spots: [], fields: [] };
for (const f of T.FIELDS) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  const at = (u, v) => [f.x + u * c + v * s, f.z - u * s + v * c];   // inverse of fieldAt's rotation
  out.places.fields.fields.push({ center: P(f.x, f.z), w: f.w, d: f.d, rot: r2(f.rot), kind: f.kind });
  if (f.x > 0) continue;   // the field east of Route 1 is not Ben's
  for (const [u, v] of [[-f.w * 0.3, 0], [f.w * 0.3, -f.d * 0.25], [0, f.d * 0.3], [f.w * 0.1, -f.d * 0.35]]) {
    const [x, z] = at(u, v);
    out.places.fields.spots.push(P(x, z, f.rot + Math.PI / 2));
  }
}
const po = T.POND;
out.places.pond = { spots: [0, 1.3, 2.4, 3.6, 4.8].map((a) => P(po.x + Math.cos(a) * (po.r + 3.2), po.z + Math.sin(a) * (po.r + 3.2), Math.atan2(-Math.cos(a), -Math.sin(a)))) };
// the hill: the rim by Old Tom's house, looking south over the town to the sea
const tom = T.HOUSES.find((h) => h.id === 'oldman');
const hill = [];
for (const [lx, lz] of [[-12, 14], [-8, 16], [10, 14]]) { const [x, z] = T.toWorld(tom, lx, lz); hill.push(P(x, z, 0.1)); }
out.places.hill = { spots: hill };
out.places.lab_hill = { spots: benches.filter((b) => b.x > T.STAIRS.x1).map((b) => P(b.x + 1.2, b.z, -Math.PI / 2)) };
out.places.benches = { spots: benches.map((b) => P(b.x, b.z)) };

// ---------- the lanes ----------
out.roads = T.ROADS.map((r) => r.filter((_, i) => i % 2 === 0 || i === r.length - 1).map(([x, z]) => P(x, z)));

fs.mkdirSync(path.join(ROOT, 'native/life'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'native/life/places.json'), JSON.stringify(out, null, 1));
console.log('places:', Object.keys(out.places).join(' '), '| houses:', Object.keys(out.houses).join(' '), '| benches', benches.length);
