// Route 1, filled in (worker 12): what stands along the road from Pallet Town
// to Viridian City's gate, in four zones from south to north (route1land.js
// has the land: pockets, trails, creeks):
//   1 Pallet's fields   the farm field with its scarecrow and shed, birdhouses
//                       on poles, the POKé MART clerk's sample cart
//   2 the hills         the flower meadow on the east plateau (its lone tree
//                       and swing, the lookout's coin telescope over Pallet and
//                       the sea), the berry orchard
//   3 the dells         the tea house by the creek (benches, parasol, lanterns,
//                       kettle, menu, wind chime), stepping stones, the road's
//                       footbridge, the wayside shrine, the rest area with
//                       its picnic tables and vending machine; telegraph poles
//   4 Viridian's edge   stone walls for the rail fences, the road gravelled and
//                       then cobbled with a kerb, street lamps, the bus stop and
//                       postbox, the stone bridge over the brook, an ivy
//                       cottage, the windmill and the water tower, roofs in the
//                       trees, the welcome sign, the city gate, and the city
//                       itself in the haze beyond: roofs, terraces, a clock tower
// Everything is overgrown more the nearer Viridian is (Ghibli green, lived in).
// town.js buildTown calls route1Fill(world) after its own Route 1 signs.
import * as THREE from 'three';
import { height, meshHeight, baseHeight, ROADS, TRAIL0, routeX, ROUTE1, onPath, pathSD, isWater, roadDist, rng, LEDGES, ledgeLineZ } from './terrain.js';
import * as O from './props/outdoor.js';
import * as FA from './props/farm.js';
import './props/buildings.js';   // (the building kit: outdoor.js's cottages, tea house and shrine use it)
import { routeSign, noticeBoard, welcomeSign, fingerpost } from './signs.js';
import { wallMeshes, boulderGeometry, stoneMesh, STONE } from './stone.js';
import { POCKET, TREE, LOOKOUT, TEA, SHRINE, REST, ORCHARD, FARM_FIELD, COTTAGE, TOWER, CREEKS, creekAt } from './route1land.js';
import { handTrees } from './route1veg.js';
import { leafMaterial, pushCard, toGeometry, cards, TILE } from './foliage.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a stable id for the web editor's edit layer: edits stick to it
const eid = (g, id) => { g.userData.eid = id; return g; };
const WALL_FADE = [300, 310];
const road = () => ROADS[0];
// the road's point nearest z (and its direction)
function roadAt(z) {
  const R = road();
  let bi = 0;
  for (let i = 0; i < R.length; i++) if (Math.abs(R[i][1] - z) < Math.abs(R[bi][1] - z)) bi = i;
  const a = R[Math.max(0, bi - 2)], b = R[Math.min(R.length - 1, bi + 2)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return { x: R[bi][0], z: R[bi][1], dx: dx / l, dz: dz / l, i: bi };
}

export function route1Fill(world) {
  const G = world.group;
  // for the native game (tools/native/bake_cast.mjs -> cast.json route1;
  // native/route1.gd and cast.gd): the route's people, the moving parts, the
  // ambient life
  const r1 = world.r1 = { npcs: [], anim: {}, amb: {} };
  const P3 = (v) => v.map((k) => +k.toFixed(3));
  const hit = (x, z, r) => world.colliders.some((c) => (c.box ? Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r : (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2));
  // put a prop on the ground at (x, z) turned `rot`; `col` a collider radius
  // or {hw, hd} box (local); returns the group
  const place = (g, x, z, rot = 0, col = null, dy = 0) => {
    g.position.set(x, height(x, z) + dy, z); g.rotation.y = rot; G.add(g);
    if (typeof col === 'number') world.colliders.push({ x, z, r: col });
    else if (col) world.colliders.push({ box: true, x, z, hw: col.hw, hd: col.hd, rot });
    return g;
  };
  // the lowest ground under a footprint (so a building never floats)
  const footY = (x, z, r) => { let m = Infinity; for (let a = 0; a < 8; a++) m = Math.min(m, height(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r)); return Math.min(m, height(x, z)); };
  const use = (x, z, label, lines, r = 1.3) => world.use.push({ x, z, r, label, lines });
  // a sign from signs.js facing `face`, its Read spot in front
  const sign = (x, z, face, build, lines, r = 1.05) => {
    const g = build(); place(g, x, z, face); g.position.y -= 0.03;
    const c = Math.cos(face), s = Math.sin(face);
    for (const [lx, lz, pr] of g.userData.posts || [[0, 0, 0.5]]) world.colliders.push({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, r: pr });
    use(x + s * 1.1, z + c * 1.1, 'Read', lines);
    return g;
  };
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  // ================= zone 1: Pallet's fields =================
  {
    const F = FARM_FIELD;
    const fx = (u, v) => [F.x + u * Math.cos(F.rot) + v * Math.sin(F.rot), F.z - u * Math.sin(F.rot) + v * Math.cos(F.rot)];
    // furrowed beds and the crops in them (crops.js, farm.js): rows of
    // cabbages, lettuces, carrots and radishes, corn, staked tomatoes, a bean
    // teepee, pumpkins and sunflowers; a gap round the scarecrow
    const ground = (x, z) => Math.max(height(x, z), meshHeight(x, z)) + 0.02;
    const [sx0, sz0] = fx(1, 0);
    FA.cropField(G, F, ground, { seed: 311, skip: (x, z) => Math.hypot(x - sx0, z - sz0) < 1.3 });
    { const [x, z] = fx(1, 0); place(eid(FA.scarecrow({ seed: 5 }), 'route1/farm/scarecrow'), x, z, F.rot + 0.4, 0.3, -0.05); use(x, z + 1.0, 'Look', ['A scarecrow in a patched blue coat.', 'The PIDGEY sitting on its hat don\'t look scared at all.']); }
    // the shed, with the farm's odds and ends round it
    { const [x, z] = fx(-F.w / 2 - 6, -4), sh = eid(FA.farmShed({ seed: 21 }), 'route1/farm/shed'); place(sh, x, z, F.rot + Math.PI / 2, null, footY(x, z, 2) + 0.02 - height(x, z));
      world.colliders.push({ box: true, x, z, hw: sh.userData.foot.hw, hd: sh.userData.foot.hd, rot: F.rot + Math.PI / 2 });
      const S = (u, v) => fx(-F.w / 2 - 6 + v, -4 - u);   // the shed's own frame: u right of its door, v out from it
      for (const [mk, u, v, r, col] of [[() => FA.wheelbarrow(), -2.6, 2.4, 0.6, 0.6], [() => FA.wateringCan(), 1.9, 1.5, 1.2, 0.2], [() => FA.crateStack({ seed: 3 }), -2.4, -0.4, 0.1, 0.6], [() => FA.sack(), -2.0, 0.6, 0.4, 0.3], [() => FA.sack({ col: '#c8b48a' }), -1.75, 1.0, 1.9, 0.3], [() => FA.trough(), 2.6, 2.6, 0.0, { hw: 0.85, hd: 0.4 }]]) {
        const [x2, z2] = S(u, v); place(mk(), x2, z2, F.rot + Math.PI / 2 + r, col);
      }
      use(...S(0.55, 2.0), 'Look', ['The farm shed. Rakes, hoes and a spade hang on a rack by the door.', 'Someone has left the watering can full. The cabbages will be happy.']); }
    { const [x, z] = fx(-F.w / 2 - 3, 6); place(FA.haybale({ seed: 1 }), x, z, 0.4, 0.8); const [x2, z2] = fx(-F.w / 2 - 4.5, 7.6); place(FA.haybale({ seed: 2 }), x2, z2, 1.2, 0.8);
      const [x3, z3] = fx(-F.w / 2 - 3.4, 8.4); place(FA.squareBale(), x3, z3, 0.2, 0.5); const [x4, z4] = fx(-F.w / 2 - 3.3, 8.45); place(FA.squareBale(), x4, z4, 0.25, null, 0.42); }
    { const [x, z] = fx(F.w / 2 + 2, F.d / 2 + 1.5), rr = roadAt(z); sign(x, z, yawTo(x, z, rr.x, rr.z), () => noticeBoard('ROUTE 1 FARM', ['Cabbages and corn grow here.', 'Please keep to the path.', 'RATTATA, stay out!'], { style: 'pinned', frame: '#7a5a3a', roof: '#6a8a3a', accent: '#6aa84f' }),
      ['ROUTE 1 FARM', 'Cabbages and corn grow here. Please keep to the path.', 'Someone has added in pencil: RATTATA, stay out!'], 0.9); }
  }
  // birdhouses on poles along the first stretch (PIDGEY country)
  for (const [x, z, h, col, roof] of [[-14, -77, 2.6, '#e8d6a8', '#c4553a'], [-36, -86, 2.2, '#bfe0e8', '#3d6fa8'], [26, -84, 2.8, '#f2c9a8', '#4f8a6a'], [30, -102, 2.4, '#e8e2c8', '#c4553a'], [-30, -130, 2.6, '#d8e8b8', '#8a5a3a']]) {
    if (onPath(x, z, 0.4)) continue;
    place(O.birdhouse({ h, col, roof }), x, z, yawTo(x, z, routeX(z), z), 0.15);
  }
  use(-36, -84.8, 'Look', ['A little birdhouse on a pole.', 'A PIDGEY peeks out, decides you\'re not food, and goes back to sleep.']);
  // the POKé MART clerk's sample cart, by the road where the route begins
  {
    const r = roadAt(-92), side = 1, x = r.x - r.dz * 2.5 * side, z = r.z + r.dx * 2.5 * side;   // on the verge, road side of the rail fence (3.3 m out; at 4.2 the fence cut it off)
    place(O.martCart(), x, z, yawTo(x, z, r.x, r.z), { hw: 0.8, hd: 0.45 });
    const cx = x - r.dx * 1.5, cz = z - r.dz * 1.5;
    r1.npcs.push({ id: 'clerk', name: 'POKé MART Clerk', look: 'fisher', x: +cx.toFixed(2), z: +cz.toFixed(2), yaw: +yawTo(cx, cz, r.x, r.z).toFixed(3),
      lines: ['Hi there! I work at a POKé MART.', 'It\'s a convenient shop, so please visit us in VIRIDIAN CITY.', 'I know, I\'ll give you a sample! Here you go!', 'ASH received a POTION!', 'We also carry POKé BALLS for catching POKéMON!'] });
  }

  // ================= zone 2: the hills =================
  // the meadow's lone tree: a bench under it, a swing from its low branch
  {
    const by = yawTo(TREE.x - 4, TREE.z + 3, LOOKOUT.x, LOOKOUT.z + 40);
    place(benchSeat(), TREE.x - 4.2, TREE.z + 3.2, by, 0.94);   // (0.95 would read as a town bench: bake_places.mjs)
    // a sturdy low bough to hang the swing from
    const bx = TREE.x + 1.2, bz = TREE.z + 0.4, y0 = height(TREE.x, TREE.z);
    const bough = new THREE.Group(); bough.position.set(0, 0, 0); G.add(bough); bough.userData.qa = { k: 'hung', why: 'a bough growing out of the meadow tree' };
    O.beam(V(TREE.x + 0.4, y0 + 3.2, TREE.z), V(TREE.x + 4.6, y0 + 4.3, TREE.z + 1.2), 0.32, '#6a4a34', bough);
    const sw = O.swing({ h: 4.0 }); sw.position.set(TREE.x + 3.2, y0 + 3.95 + 0.1, TREE.z + 0.8); sw.rotation.y = 0.27; G.add(sw);
    world.anim.push((dt, t) => { sw.rotation.x = Math.sin(t * 1.3) * 0.12; });
    sw.traverse((o) => { if (o.isMesh) { o.name = 'r1_swing'; o.userData.outline = false; } });
    r1.anim.swing = { p: P3([sw.position.x, sw.position.y, sw.position.z]), axis: P3([Math.cos(0.27), 0, -Math.sin(0.27)]) };
    void bx; void bz;
    use(TREE.x + 3.2, TREE.z + 1.8, 'Look', ['A rope swing on the old tree\'s low bough.', 'From up here the whole meadow sways like the sea.']);
  }
  // the lookout: a plank deck on posts set into the slope, a railed south
  // (view) side and ends, steps up from the meadow on the north, the coin
  // telescope looking south over Pallet and the sea, a bench, a sign
  {
    const L = LOOKOUT;
    let gmax = -Infinity, gmin = Infinity;
    for (let u = -3; u <= 3; u += 1) for (let v = -2; v <= 2; v += 1) { const h = height(L.x + u, L.z + v); gmax = Math.max(gmax, h); gmin = Math.min(gmin, h); }
    const y = gmax + 0.32, top = 0.1;   // deck top = y + top
    const D = eid(new THREE.Group(), 'route1/lookout/deck'); D.position.set(L.x, y, L.z); G.add(D); D.userData.qa = { k: 'open', why: 'the lookout deck: open, with a rail' };
    const wood = O.texm(O.planks('#a87a4c')), post = '#7a5a3e', rail = '#8a6a4a';
    // boards (a gap between each), the rim joists, posts down into the ground
    for (let i = 0; i < 20; i++) O.box(0.28, 0.08, 4.0, wood, -2.86 + i * 0.301, top - 0.04, 0, D);
    for (const sz of [-1, 1]) O.box(6.1, 0.24, 0.1, rail, 0, top - 0.2, sz * 2.02, D);
    for (const sx of [-1, 1]) O.box(0.1, 0.24, 4.1, rail, sx * 3.02, top - 0.2, 0, D);
    for (const px of [-2.9, 0, 2.9]) for (const pz of [-1.9, 1.9]) {
      const g = height(L.x + px, L.z + pz) - y - 0.3, h = top - 0.08 - g;
      O.box(0.2, h, 0.2, post, px, g + h / 2, pz, D);
      if (px !== 0 && h > 0.5) O.beam(V(px, g + 0.25, pz), V(px * 0.55, top - 0.24, pz), 0.09, post, D);
    }
    // the railing: posts, a top and a mid rail, balusters, on the south and the ends
    for (const [a, b] of [[[-3, 2], [3, 2]], [[-3, -0.7], [-3, 2]], [[3, -0.7], [3, 2]]]) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      O.beam(V(a[0], top + 0.98, a[1]), V(b[0], top + 0.98, b[1]), 0.1, rail, D, { over: 0.12 });
      O.beam(V(a[0], top + 0.5, a[1]), V(b[0], top + 0.5, b[1]), 0.06, rail, D, { over: 0.06 });
      const n = Math.round(len / 1.5);
      for (let k = 0; k <= n; k++) { const t = k / n; O.box(0.12, 1.08, 0.12, post, a[0] + (b[0] - a[0]) * t, top + 0.54, a[1] + (b[1] - a[1]) * t, D); }
      const nb = Math.round(len / 0.2);
      for (let k = 1; k < nb; k++) { const t = k / nb; O.box(0.045, 0.44, 0.045, rail, a[0] + (b[0] - a[0]) * t, top + 0.74, a[1] + (b[1] - a[1]) * t, D, { line: false, shadow: false }); }
    }
    // steps down to the meadow on the north side
    const gN = height(L.x, L.z - 2.3), nSteps = Math.max(1, Math.ceil((y + top - gN) / 0.22));
    for (let k = 1; k <= nSteps; k++) {
      const sy = top - k * (y + top - gN) / (nSteps + 0.5), sz = -2.02 - 0.17 - (k - 1) * 0.34;
      const below = height(L.x, L.z + sz) - y;
      O.box(1.8, Math.max(0.1, sy - below + 0.05), 0.34, wood, 0, (sy + below - 0.05) / 2, sz, D);
      world.walk.push({ x: L.x, z: L.z + sz, hw: 0.9, hd: 0.17, rot: 0, y: y + sy + 0.02 });
    }
    for (const sx of [-1, 1]) { const zb = -2.02 - nSteps * 0.34; O.beam(V(sx * 0.95, top + 0.98, -2.0), V(sx * 0.95, top + 0.98 - (y + top - gN) * 0.9, zb + 0.15), 0.07, rail, D, { over: 0.1 });
      O.box(0.1, 1.0, 0.1, post, sx * 0.95, (height(L.x + sx * 0.95, L.z + zb + 0.15) - y) + 0.5, zb + 0.15, D); }
    const T = O.coinTelescope(); T.position.set(0.8, top, 1.2); D.add(T);
    const T2 = benchSeat(); T2.position.set(-1.4, top, 0.6); T2.rotation.y = 0; D.add(T2);
    world.walk.push({ x: L.x, z: L.z, hw: 3, hd: 2, rot: 0, y: y + top });
    world.colliders.push({ box: true, x: L.x, z: L.z + 2.05, hw: 3.1, hd: 0.12 }, { box: true, x: L.x - 3.05, z: L.z + 0.65, hw: 0.12, hd: 1.4 }, { box: true, x: L.x + 3.05, z: L.z + 0.65, hw: 0.12, hd: 1.4 },
      { x: L.x + 0.8, z: L.z + 1.2, r: 0.35 }, { box: true, x: L.x - 2.0, z: L.z - 2.0, hw: 1.0, hd: 0.08 }, { box: true, x: L.x + 2.0, z: L.z - 2.0, hw: 1.0, hd: 0.08 });
    void gmin;
    use(L.x + 0.8, L.z + 0.4, 'Look', ['You drop a coin in the telescope.', 'PALLET TOWN, tiny and bright in its green bowl... the harbour, the lighthouse... and the sea, all the way to the edge of the world.', 'Somewhere out there is CINNABAR ISLAND.']);
    sign(L.x - 4.2, L.z - 2.2, 0.4, () => noticeBoard('LOOKOUT', ['PALLET TOWN', 'The sea and the harbour', 'Watch for PIDGEOTTO!'], { style: 'pinned', frame: '#7a5a3a', roof: '#3d6fa8', accent: '#3d8fb0' }),
      ['LOOKOUT', 'Below: PALLET TOWN, its harbour and the open sea.', 'On a clear day the wind carries the smell of salt all the way up here.'], 0.9);
  }
  sign(52, -128, -0.9, () => noticeBoard('FLOWER MEADOW', ['Wildflowers in bloom!', 'Please don\'t pick them.', 'Mind the BUTTERFREE.'], { style: 'pinned', frame: '#7a5a3a', roof: '#c4553a', accent: '#e86a8a' }),
    ['FLOWER MEADOW', 'Wildflowers in bloom! Please don\'t pick them.', 'In spring the ODDISH come out to dance here at night, they say.'], 0.9);
  // the orchard: berries hung on its little trees, a picking sign, baskets, a ladder
  {
    const berries = [], R = rng(91);
    const kinds = ['#3a6ad8', '#f26aa0', '#e8402e', '#f2a23a'];   // ORAN, PECHA, CHERI, RAWST
    const colOf = [];
    for (const [x, z, k, s] of handTrees()) {
      if (roadDist(x, z) < 3.4 || onPath(x, z, 1.2)) continue;   // veg.js leaves trees off the dirt
      if (k !== 'bushy' || x < ORCHARD.x0 - 2 || x > ORCHARD.x1 + 2 || z < ORCHARD.z0 - 2 || z > ORCHARD.z1 + 2) continue;
      const y0 = height(x, z), kc = kinds[Math.floor((x - ORCHARD.x0) / 8) % kinds.length];
      for (let i = 0; i < 26; i++) {
        const a = R() * 6.28, u = R() * 1.6 - 0.8, k = s / 0.62, rr = (1.05 + R() * 0.15) * k;
        const ry = Math.sqrt(1 - u * u);
        berries.push([x + Math.cos(a) * ry * rr, z + Math.sin(a) * ry * rr, 0, 0.9 + R() * 0.4, y0 + (1.95 + u * 0.75) * k]);
        colOf.push(kc);
      }
    }
    const bm = instanced(G, new THREE.SphereGeometry(0.13, 8, 6), O.flat('#ffffff'), berries, 0, 0, colOf);
    if (bm) bm.userData.qa = { k: 'hung', why: 'berries hang in the orchard trees' };
    const cx = (ORCHARD.x0 + ORCHARD.x1) / 2;
    sign(ORCHARD.x1 + 3, ORCHARD.z1 - 2, Math.PI / 2 - 0.2, () => noticeBoard('BERRY ORCHARD', ['ORAN  PECHA  CHERI  RAWST', 'Pick one a day, please!', 'Leave some for the PIDGEY.'], { style: 'chalk' }),
      ['BERRY ORCHARD', 'ORAN, PECHA, CHERI and RAWST BERRIES grow here.', 'Pick one a day, please! Leave some for the PIDGEY.'], 0.9);
    for (const [x, z] of [[cx - 6, ORCHARD.z1 + 2], [cx + 7, ORCHARD.z0 - 1.5]]) place(basket(), x, z, R() * 6, 0.4);
    { const lx = cx - 2, lz = (ORCHARD.z0 + ORCHARD.z1) / 2; const ld = ladder(); place(ld, lx, lz, 0.4, 0.3); }
    use(cx, ORCHARD.z1 + 1.5, 'Look', ['The little trees are heavy with BERRIES: blue ORAN, pink PECHA, red CHERI.', 'Wild POKéMON love them too. Something has nibbled the low ones.']);
  }

  r1.amb.meadow = { x: 72, z: -150, r: 46 };   // butterflies over the flowers
  r1.amb.birds = [[0, -120, 30], [-10, -260, 34], [20, -380, 30]];   // PIDGEY flocks circling [x, z, radius]

  // ================= zone 3: the dells =================
  // the creeks: the road's footbridge, the tea trail's stepping stones
  {
    const C = CREEKS.find((c) => c.id === 'tea');
    // where the road crosses: the creek point nearest the road
    let best = null;
    for (let i = 0; i < C.line.length; i++) { const [x, z] = C.line[i], d = roadDist(x, z); if (!best || d < best.d) best = { d, i, x, z }; }
    const a = C.line[Math.max(0, best.i - 2)], b = C.line[Math.min(C.line.length - 1, best.i + 2)];
    const ang = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;   // the bridge runs across the creek
    const yA = height(best.x + Math.sin(ang) * 4.5, best.z + Math.cos(ang) * 4.5), yB = height(best.x - Math.sin(ang) * 4.5, best.z - Math.cos(ang) * 4.5);
    const y = Math.max(yA, yB) + 0.05;
    deckBridge(world, O.footbridge({ L: 7, w: 3.0, rise: 0.25 }), best.x, best.z, ang, y, 7, 3.0, 0.25);
    // stepping stones where the tea trail crosses
    const T = ROADS[TRAIL0 + 4];
    let bs = null;
    for (const [x, z] of T) { const q = creekAt(x, z); if (q && (!bs || q.d < bs.d)) bs = { d: q.d, x, z, y: q.y }; }
    if (bs) {
      const q = creekAt(bs.x, bs.z), t = Math.round(q.t), p0 = C.line[Math.max(0, t - 1)], p1 = C.line[Math.min(C.line.length - 1, t + 1)];
      const ca = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) + Math.PI / 2, sx = Math.sin(ca), sz = Math.cos(ca);
      const geos = [];
      for (let k = -3; k <= 3; k++) {
        const x = bs.x + sx * k * 0.85, z = bs.z + sz * k * 0.85, top = bs.y + 0.18;
        const g = boulderGeometry(500 + k, { w: 0.8, h: 0.5, d: 0.7, kind: 'slab', col: new THREE.Color(STONE.bank), flatTop: true });
        g.rotateY(k * 0.7).translate(x, top - 0.25, z);
        geos.push(g);
        world.walk.push({ x, z, hw: 0.55, hd: 0.55, rot: ca, y: top });
      }
      G.add(stoneMesh(mergeGeos(geos), { fade: [140, 146] }));
    }
    // the brook's little stone bridge on the road near Viridian
    const B = CREEKS.find((c) => c.id === 'brook');
    let bb = null;
    for (let i = 0; i < B.line.length; i++) { const [x, z] = B.line[i], d = roadDist(x, z); if (!bb || d < bb.d) bb = { d, i, x, z }; }
    const ra = roadAt(bb.z), rang = Math.atan2(ra.dx, ra.dz);
    const yb = Math.max(height(bb.x + ra.dx * 4.5, bb.z + ra.dz * 4.5), height(bb.x - ra.dx * 4.5, bb.z - ra.dz * 4.5)) + 0.04;
    deckBridge(world, O.stoneBridge({ L: 8, w: 4.0, rise: 0.3 }), bb.x, bb.z, rang, yb, 8, 4.0, 0.3);
    use(bb.x + Math.sin(rang + Math.PI / 2) * 1.6, bb.z + Math.cos(rang + Math.PI / 2) * 1.6, 'Look', ['An old stone bridge, soft with moss.', 'Down in the brook, a little POLIWAG swims against the current and gets nowhere.']);
  }
  // the tea house
  {
    const T = TEA, y = footY(T.x, T.z, 5) + 0.05;
    const H = eid(O.teaHouse(), 'route1/teahouse/house'); H.position.set(T.x, y, T.z); H.rotation.y = T.rot; G.add(H);
    const c = Math.cos(T.rot), s = Math.sin(T.rot), W = (lx, lz) => [T.x + lx * c + lz * s, T.z - lx * s + lz * c];
    const fp = H.userData.foot;
    { const z0 = -fp.hd, z1 = H.userData.front + 0.12, zc = (z0 + z1) / 2;   // the house up to its front wall; the veranda is open
      world.colliders.push({ box: true, x: T.x + s * zc, z: T.z + c * zc, hw: fp.hw, hd: (z1 - z0) / 2, rot: T.rot });
      // no plants under the house, its veranda or its step
      const z2 = fp.hd + 1.0, zm = (z0 + z2) / 2; (world.noVeg ||= []).push({ box: true, x: T.x + s * zm, z: T.z + c * zm, hw: fp.hw + 0.3, hd: (z2 - z0) / 2, rot: T.rot }); }
    // the floor is a deck you can step onto at the front
    { const [x, z] = W(0, 2.2); world.walk.push({ x, z, hw: 4.1, hd: 0.7, rot: T.rot, y: y + 0.48 }); }
    // lanterns from the eaves (local points), the wind chime
    for (const [lx, ly, lz] of H.userData.lantern) { const L = O.chochin({ col: '#e0402c', s: 1.1 }); L.position.set(lx, ly, lz); H.add(L); }
    { const f = O.furin(); f.position.set(2.4, 3.05, 4.0); H.add(f); }
    // out front: shogi benches, the parasol, the kettle, the menu, pots
    for (const [lx, lz, r] of [[-2.6, 5.2, 0.12], [2.2, 5.6, -0.15], [-0.2, 7.4, 0.05]]) { const [x, z] = W(lx, lz); place(O.shogiBench(), x, z, T.rot + r, { hw: 1.0, hd: 0.35 }); }
    { const [x, z] = W(0.2, 6.3); place(O.parasol(), x, z, 0, 0.25); }
    { const [x, z] = W(-3.6, 3.6); place(O.kettleStove(), x, z, T.rot, 0.35); r1.amb.steam = P3([x, height(x, z) + 0.85, z]); }
    { const [x, z] = W(1.9, 0.75); r1.npcs.push({ id: 'teakeeper', name: 'Tea keeper Hana', look: 'rose', x: +x.toFixed(2), z: +z.toFixed(2), yaw: +(T.rot).toFixed(3), ylock: +(y + 0.48).toFixed(3),
      lines: ['Welcome, welcome! Sit down and rest your legs.', 'Travellers from PALLET TOWN always stop here before VIRIDIAN CITY.', 'The tea is green tea from my own bushes, and the water comes from the spring up the hill.', 'Oh, and if you see a PIDGEY on the parasol, don\'t shoo it. It\'s a regular.'] });
      const [cx, cz] = W(4.4, -0.9); r1.amb.chime = P3([cx, y + 3.0, cz]); }
    { const [x, z] = W(4.6, 4.6); place(O.menuBoard(), x, z, T.rot - 0.5, 0.4); use(...W(4.6, 5.6), 'Read', ['TODAY\'S TEA: green tea 50, barley tea 40, sweet dumplings 80, lemonade 60.', '~ please rest a while ~']); }
    for (const [lx, lz] of [[-4.3, 3.0], [4.4, 3.0], [-4.6, -1.5]]) { const [x, z] = W(lx, lz); place(pot(), x, z, 0, 0.35); }
    { const [x, z] = W(0, 4.9); use(x, z, 'Look', ['A little tea house with red benches and a big paper parasol.', 'The kettle sings on the coals. Someone has written TODAY\'S TEA on a chalk board.']); }
    // stone lanterns at the way in
    for (const lx of [-5.6, 5.6]) { const [x, z] = W(lx, 6.5); place(O.stoneLantern({ s: 0.95 }), x, z, T.rot, 0.35); }
  }
  // the wayside shrine with its lanterns
  {
    const S = SHRINE, r = roadAt(S.z), rot = yawTo(S.x, S.z, r.x, r.z);
    place(eid(O.shrine(), 'route1/shrine/shrine'), S.x, S.z, rot, { hw: 0.75, hd: 0.65 });
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const lx of [-1.4, 1.4]) place(O.stoneLantern({ s: 0.8 }), S.x + lx * c + 1.0 * s, S.z - lx * s + 1.0 * c, rot, 0.3);
    use(S.x + s * 2.4, S.z + c * 2.4, 'Look', ['A tiny wayside shrine under a red gate.', 'Someone left a rice cake and a cup of tea. Travellers stop here to wish for a safe road.']);
  }
  // the rest area: picnic tables, a vending machine, a bin, a sign
  {
    const P = REST;
    place(eid(O.picnicTable(), 'route1/rest/picnic1'), P.x - 3, P.z + 2, 0.2, { hw: 1.0, hd: 1.0 });
    place(eid(O.picnicTable(), 'route1/rest/picnic2'), P.x + 4, P.z + 4, -0.3, { hw: 1.0, hd: 1.0 });
    const r = roadAt(P.z), vx = P.x - 9, vz = P.z - 3;
    place(eid(O.vendingMachine(), 'route1/rest/vending'), vx, vz, yawTo(vx, vz, P.x - 3, P.z + 8), { hw: 0.55, hd: 0.45 });
    use(vx + 1.2, vz + 0.6, 'Look', ['A vending machine, humming to itself.', 'POKé COLA... FRESH WATER... SODA POP... LEMONADE. It only takes coins.']);
    place(bin(), vx + 1.3, vz + 0.6, 0, 0.3);
    sign(P.x - 12, P.z + 6, yawTo(P.x - 12, P.z + 6, r.x, r.z), () => noticeBoard('REST AREA', ['Tables, water and shade.', 'Take your rubbish home.', 'VIRIDIAN CITY: 1 hour'], { style: 'pinned', frame: '#7a5a3a', roof: '#4f8a6a', accent: '#4f8a6a' }),
      ['REST AREA', 'Tables, water and shade. Please take your rubbish home.', 'VIRIDIAN CITY: about an hour on foot.'], 0.9);
  }
  // the woods' odds and ends: a fallen tree, hollow logs, fairy rings, outcrops
  for (const [x, z, rot, k] of [[44, -334, 0.4, 'fall'], [-36, -142, 1.2, 'hollow'], [46, -214, -0.6, 'hollow'], [-44, -300, 2.2, 'fall']]) {
    if (onPath(x, z, 3)) continue;
    // laid along the slope: the ground under each end sets its tilt, and it sits a little sunk in
    { const L = k === 'fall' ? 8 : 3.2, ca = Math.cos(rot), sa = Math.sin(rot), ha = height(x - ca * L * 0.45, z + sa * L * 0.45), hb = height(x + ca * L * 0.45, z - sa * L * 0.45);
      const g = place(O.fallenLog({ L, r: k === 'fall' ? 0.5 : 0.42, hollow: k === 'hollow', seed: Math.round(x * 7 + z) }), x, z, rot, { hw: L / 2, hd: 0.55 }, 0);
      g.position.y = Math.min(height(x, z), (ha + hb) / 2) - 0.12; g.rotation.set(0, rot, Math.atan2(hb - ha, L * 0.9), 'YXZ'); g.userData.eid = `route1/fallenLog/${k}${Math.round(x)}_${Math.round(z)}`; }
    if (k === 'hollow') use(x + Math.sin(rot + 1.57) * 1.2, z + Math.cos(rot + 1.57) * 1.2, 'Look', ['A hollow log.', 'It\'s warm inside, and smells of RATTATA. Something squeaks and goes quiet.']);
  }
  for (const [x, z, r] of [[-30, -196, 1.3], [62, -270, 1.6], [-50, -330, 1.2], [34, -160, 1.1]]) if (!onPath(x, z, r + 0.5)) place(O.mushroomRing({ r, seed: Math.round(x - z), ground: (lx, lz) => height(x + lx, z + lz) - height(x, z) }), x, z, 0);
  {
    const geos = [], R = rng(707);
    for (const [x, z, s] of [[-40, -170, 2.4], [-43, -173, 1.4], [40, -238, 2.8], [44, -242, 1.6], [-42, -350, 2.6], [56, -320, 2.2], [-48, -228, 1.8]]) {
      if (onPath(x, z, s)) continue;
      const g = boulderGeometry(Math.round(x * 13 - z), { w: s * 1.4, h: s, d: s * 1.1, col: new THREE.Color(STONE.grey) });
      g.rotateY(R() * 6.28).translate(x, height(x, z) - s * 0.25, z);
      geos.push(g); world.colliders.push({ x, z, r: s * 0.7 });
    }
    if (geos.length) G.add(stoneMesh(mergeGeos(geos), { fade: [200, 210] }));
  }
  // telegraph poles along the road's east side from the rest area north,
  // their wires sagging from pole to pole
  {
    const poles = [];
    for (let z = -262; z > -440; z -= 26) {
      const r = roadAt(z);
      let x = r.x - r.dz * 4.8, zz = r.z + r.dx * 4.8;
      if (r.dz > 0) { x = r.x + r.dz * 4.8; zz = r.z - r.dx * 4.8; }
      if (onPath(x, zz, 0.6) || isWater(x, zz) || creekAt(x, zz)?.d < 3) continue;
      const P = O.telegraphPole(); place(P, x, zz, Math.atan2(r.dx, r.dz), 0.25);   // crossarm (local x) across the road, the wires along it
      poles.push(P);
    }
    const wm = O.flat('#2a2a2a');
    for (let i = 0; i + 1 < poles.length; i++) {
      const A = poles[i], B = poles[i + 1];
      A.updateMatrixWorld(true); B.updateMatrixWorld(true);
      const ends = A.userData.ends.map(([x, y]) => [V(x, y, 0).applyMatrix4(A.matrixWorld), V(x, y, 0).applyMatrix4(B.matrixWorld)]);
      const W = new THREE.Group(); G.add(W); W.userData.qa = { k: 'hung', why: 'telegraph wires, strung between the poles' };   // (tools/qa: held up by something else)
      for (const [a, b] of ends) O.rope(a, b, 0.6, 0.018, wm, W);
    }
  }

  // ================= zone 4: Viridian's edge =================
  const R0 = road();
  // the road's surface: gravel from z -335, cobbles from -386 (with kerbs)
  pave(G, R0, -335, -386, 'gravel');
  pave(G, R0, -386, ROUTE1.gateZ + 1, 'cobble');
  // dry-stone walls in place of the rail fences, both sides of the road
  {
    const runs = [];
    // a gap where the bus stop and the postbox stand (placed below), so the
    // shelter opens onto the road, not onto the wall
    const rb = roadAt(-400), BUS = [rb.x + rb.dz * 5.2 - rb.dx * 1.6, rb.z - rb.dx * 5.2 - rb.dz * 1.6];
    for (const s of [-1, 1]) {
      let run = null;
      for (let i = 0; i < R0.length - 2; i++) {
        const [x, z] = R0[i];
        if (z > -338 || z < ROUTE1.gateZ + 3) { run = null; continue; }
        const b = R0[i + 1], dx = b[0] - x, dz = b[1] - z, l = Math.hypot(dx, dz) || 1;
        const px = x - dz / l * 3.9 * s, pz = z + dx / l * 3.9 * s;
        const free = !onPath(px, pz, 0.5) && !isWater(px, pz) && !(creekAt(px, pz)?.d < 4.5) && !hit(px, pz, 0.6) && roadDist(px, pz) > 3.3 && Math.hypot(px - BUS[0], pz - BUS[1]) > 4.2;
        if (!free || (i % 34 === 33)) { if (run && run.pts.length > 3) runs.push(run); run = null; continue; }
        if (!run) run = { pts: [] };
        run.pts.push([px, pz]);
      }
      if (run && run.pts.length > 3) runs.push(run);
    }
    const out = [], R = rng(55);
    for (const r of runs) for (let k = 0; k + 1 < r.pts.length; k++) {
      const a = r.pts[k], b = r.pts[k + 1], hgt = 0.85 + R() * 0.12;
      out.push({ a, b, hgt, t: 0.55, top: (u) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = u / L; return height(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) + hgt; },
        faces: [{ side: 1, bottom: () => Math.min(height(...a), height(...b)) - 0.2 }, { side: -1, bottom: () => Math.min(height(...a), height(...b)) - 0.2 }], col: '#b9b6a0' });
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      world.colliders.push({ box: true, x: mx, z: mz, hw: 0.3, hd: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 0.05, rot: Math.atan2(b[0] - a[0], b[1] - a[1]) });
    }
    G.add(...wallMeshes(out, 9100, { fade: WALL_FADE }));
    // ivy and moss along the walls' tops (a mat every few metres)
    const W = new THREE.Group(); G.add(W);
    for (let k = 0; k < out.length; k += 2) {
      const { a, b, hgt } = out[k];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ry = Math.atan2(b[0] - a[0], b[1] - a[1]), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // on the segment's own top (its height varies), no longer than it
      O.mossTop(W, 0.5, L, mx, (height(...a) + height(...b)) / 2 + hgt, mz, ry, 900 + k).rotation.x = -Math.atan2(height(...b) - height(...a), L);   // tilted with the top
      if (k % 4 === 0) O.ivy(W, Math.min(1.6, L * 0.9), 0.9, mx, height(mx, mz) - 0.1, mz, ry + Math.PI / 2, 950 + k, 10).position.add(V(Math.cos(ry) * 0.29, 0, -Math.sin(ry) * 0.29));
    }
  }
  // street lamps every 17 m from z -384, alternating sides
  for (let z = -384, k = 0; z > ROUTE1.gateZ + 4; z -= 17, k++) {
    const r = roadAt(z), s = k % 2 ? 1 : -1, x = r.x - r.dz * 3.1 * s, zz = r.z + r.dx * 3.1 * s;
    if (onPath(x, zz, 0.2) || hit(x, zz, 0.3) || creekAt(x, zz)?.d < 3) continue;
    place(O.streetLamp(), x, zz, 0, 0.22);
  }
  // the bus stop and the postbox
  {
    const r = roadAt(-400), x = r.x + r.dz * 5.2, z = r.z - r.dx * 5.2;
    place(O.busShelter(), x, z, yawTo(x, z, r.x, r.z), { hw: 1.4, hd: 0.7 });
    sign(x + r.dx * 2.5 + r.dz * 0.8, z + r.dz * 2.5 - r.dx * 0.8, yawTo(x, z, r.x, r.z), () => fingerpost([['VIRIDIAN CITY', Math.PI + 0.1], ['PALLET TOWN', 0.1]]), ['VIRIDIAN CITY this way. PALLET TOWN back the way you came.'], 0.25);
    use(x + (r.x - x) * 0.4, z + (r.z - z) * 0.4, 'Read', ['BUS STOP: ROUTE 1 LINE', 'To VIRIDIAN CITY: every half hour from 7:15.', '(Service suspended while the road is under repair.)']);
    const px = r.x + r.dz * 4.4 - r.dx * 3.8, pz = r.z - r.dx * 4.4 - r.dz * 3.8;
    place(O.postbox(), px, pz, yawTo(px, pz, r.x, r.z), 0.3);
    use(px + (r.x - px) * 0.3, pz + (r.z - pz) * 0.3, 'Look', ['A red postbox. Next collection: 4 PM.', 'Someone has posted a letter addressed to "MOM, PALLET TOWN".']);
  }
  // the cottage on the west, with its garden and a washing line
  {
    const C = COTTAGE, y = footY(C.x, C.z, 4) + 0.02;
    const H = eid(O.cottage({ seed: 401 }), 'route1/viridian/ivycottage'); H.position.set(C.x, y, C.z); H.rotation.y = C.rot; G.add(H);
    world.colliders.push({ box: true, x: C.x, z: C.z, hw: H.userData.foot.hw, hd: H.userData.foot.hd, rot: C.rot });
    const c = Math.cos(C.rot), s = Math.sin(C.rot), W = (lx, lz) => [C.x + lx * c + lz * s, C.z - lx * s + lz * c];
    // a picket fence round the front garden
    const pk = [];
    for (let u = -6; u <= 6; u += 0.5) { if (Math.abs(u - 0.9) < 0.9) continue; const [x, z] = W(u, 7.5); pk.push([x, z, C.rot, 1]); }
    for (let v = 3; v < 7.5; v += 0.5) for (const u of [-6, 6]) { const [x, z] = W(u, v); pk.push([x, z, C.rot + Math.PI / 2, 1]); }
    instanced(G, new THREE.BoxGeometry(0.1, 0.9, 0.05).translate(0, 0.45, 0), O.flat('#f2ecdc'), pk, 0, 0x1);
    for (const [u0, v0, u1, v1] of [[-6, 7.5, 0, 7.5], [1.8, 7.5, 6, 7.5], [-6, 3, -6, 7.5], [6, 3, 6, 7.5]]) {
      const [ax, az] = W(u0, v0), [bx, bz] = W(u1, v1);
      world.colliders.push({ box: true, x: (ax + bx) / 2, z: (az + bz) / 2, hw: 0.08, hd: Math.hypot(bx - ax, bz - az) / 2, rot: Math.atan2(bx - ax, bz - az) });
    }
    // a washing line with sheets
    { const [ax, az] = W(-8.5, 2), [bx, bz] = W(-8.5, -4); for (const [x, z] of [[ax, az], [bx, bz]]) place(pole(2.1), x, z, 0, 0.1);
      const ya = height(ax, az) + 2.0, yb = height(bx, bz) + 2.0, Wg = new THREE.Group(); G.add(Wg); Wg.userData.qa = { k: 'hung', why: 'the washing line, hung between two poles' };
      O.rope(V(ax, ya, az), V(bx, yb, bz), 0.2, 0.012, '#e8e2d2', Wg);
      for (const [k, col] of [[0.3, '#f6f2e8'], [0.55, '#9fc8e8'], [0.78, '#f2c9a8']]) {
        const x = ax + (bx - ax) * k, z = az + (bz - az) * k, y = ya + (yb - ya) * k - 0.2 - Math.sin(k * Math.PI) * 0.16;
        O.put(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), O.flat(col, THREE.DoubleSide)), Wg, x, y - 0.32, z, { ry: Math.atan2(bx - ax, bz - az) + Math.PI / 2 });
      }
    }
    use(...W(0.9, 4.2), 'Look', ['A cottage wrapped in ivy, with a blue-green door.', 'A sign on the door: GONE TO THE MARKET IN VIRIDIAN. BACK SOON!']);
  }
  // the water tower on the east, the windmill on the west hill
  { const T = TOWER, y = footY(T.x, T.z, 2.5); const g = O.waterTower(); g.userData.qa = { k: 'open', why: 'the water tower stands on four legs' }; g.position.set(T.x, y, T.z); g.rotation.y = -0.6; G.add(g); world.colliders.push({ x: T.x, z: T.z, r: 2.6 }); use(T.x - 2.8, T.z + 1.5, 'Look', ['VIRIDIAN WATER WORKS, painted in faded letters.', 'Ivy has climbed all the way to the top.']); }
  { const x = -104, z = -421, y = footY(x, z, 2.5); const g = O.windmill(); g.position.set(x, y, z); g.rotation.y = 0.5; G.add(g); world.colliders.push({ x, z, r: 2.6 });
    const S = g.getObjectByName('r1_sails'); world.anim.push((dt, t) => { S.rotation.z = t * 0.35; });
    S.traverse((o) => { if (o.isMesh) { o.name = 'r1_sails'; o.userData.outline = false; } });
    g.updateMatrixWorld(true); const hub = S.getWorldPosition(V(0, 0, 0));
    r1.anim.sails = { p: P3([hub.x, hub.y, hub.z]), axis: P3([Math.sin(0.5), 0, Math.cos(0.5)]), speed: 0.35 };
    r1.amb.mill = P3([hub.x, hub.y, hub.z]); }
  // more roofs in the trees, nearer the city: cottages up the slopes
  for (const [x, z, rot, seed, roof] of [[-92, -444, 0.6, 411, '#3d7a6a'], [86, -436, -0.7, 412, '#c4553a'], [98, -392, -1.2, 413, '#5a6a8a'], [-104, -380, 1.1, 414, '#c4553a'], [72, -456, -0.3, 415, '#d08a3a']]) {
    const H = O.cottage({ seed, roof, wall: seed % 2 ? '#efe2c8' : '#f2d9c0' }), f = H.userData.foot;
    // the lowest ground under its footprint (it floated on the slopes)
    let y = Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const lx = i / 2 * f.hw, lz = j / 2 * f.hd; y = Math.min(y, height(x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot))); }
    H.position.set(x, y, z); H.rotation.y = rot; G.add(H);
    H.userData.eid = `route1/cottage/c${seed}`;
    world.colliders.push({ box: true, x, z, hw: f.hw, hd: f.hd, rot });   // solid, and no trees grow inside it
  }
  // the welcome sign before the gate
  {
    const r = roadAt(ROUTE1.gateZ + 14), x = r.x + r.dz * 4.8, z = r.z - r.dx * 4.8;
    sign(x, z, yawTo(x, z, r.x - r.dx * 6, r.z - r.dz * 6), () => welcomeSign({ title: 'VIRIDIAN CITY', sub: 'THE ETERNALLY GREEN PARADISE', wood: '#9a7a4a', slate: '#2f5a4a' }),
      ['VIRIDIAN CITY', 'The Eternally Green Paradise'], 1.3);
  }
  // the gate itself, and walls off into the woods from its piers
  {
    const gz = ROUTE1.gateZ, r = roadAt(gz), gx = r.x, y = footY(gx, gz, 4) - 0.05;
    const g = O.viridianGate(); g.position.set(gx, y, gz); G.add(g);
    world.colliders.push({ box: true, x: gx, z: gz, hw: 3.2, hd: 0.25 }, { x: gx - 3.8, z: gz, r: 1.0 }, { x: gx + 3.8, z: gz, r: 1.0 });
    use(gx, gz + 1.8, 'Look', ['The gate to VIRIDIAN CITY is shut.', 'Through the bars: rooftops in the green, a clock tower in the haze... and a note: ROAD WORKS AHEAD. Come back another day!'], 2.2);
    const runs = [];
    for (const s of [-1, 1]) {
      const a = [gx + s * 4.6, gz], b = [gx + s * 30, gz - 2];
      runs.push({ a, b, t: 0.7, top: (u) => { const t = u / 25.4; return height(a[0] + (b[0] - a[0]) * t, gz) + 1.6; }, faces: [{ side: 1, bottom: (u) => height(a[0] + (b[0] - a[0]) * u / 25.4, gz) - 0.3 }, { side: -1, bottom: (u) => height(a[0] + (b[0] - a[0]) * u / 25.4, gz) - 0.3 }] });
      world.colliders.push({ box: true, x: (a[0] + b[0]) / 2, z: gz - 1, hw: 12.8, hd: 0.5 });
      const W = new THREE.Group(); G.add(W);
      // ivy on the wall's south (road) face, moss along its top: both from
      // the wall's own line (it runs from the pier back 2 m into the woods)
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      const fl = dx >= 0 ? 1 : -1, nx = -dz * fl, nz = dx * fl;   // the outward normal toward +z
      const along = Math.atan2(dx, dz), face = Math.atan2(nx, nz);
      for (let k = 0; k < 5; k++) {
        const t = (k + 0.5) / 5, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = height(x, gz);   // (the wall's height follows gz too)
        O.ivy(W, 4, 1.6, x + nx * 0.37, y - 0.2, z + nz * 0.37, face, 1200 + k * 2 + (s > 0 ? 1 : 0), 10);
        const hx = (tt) => height(a[0] + (b[0] - a[0]) * tt, gz);
        O.mossTop(W, 0.6, L / 5 - 0.2, x, y + 1.6, z, along, 1300 + k + s).rotation.x = -Math.atan2(hx(t + 0.1) - hx(t - 0.1), L / 5);   // tilted with the top
      }
    }
    G.add(...wallMeshes(runs, 9200, { fade: WALL_FADE }));
  }
  // the city beyond, in the haze: terraces of houses with gardens up both
  // slopes, a clock tower in the middle
  {
    const R = rng(8080);
    const city = new THREE.Group(); city.name = 'r1_city'; G.add(city);
    { const x = 6, z = -560; const t = O.clockTower(); t.position.set(x, baseHeight(x, z) - 0.5, z); city.add(t); }
    const roofs = ['#3d7a6a', '#c4553a', '#5a6a8a', '#d08a3a', '#4f8a6a'], walls = ['#efe2c8', '#f2d9c0', '#e8e0d0', '#f0e6c8'];
    for (let i = 0; i < 34; i++) {
      const z = -478 - R() * 150, side = R() < 0.5 ? -1 : 1, x = side * (14 + R() * 70) + (R() - 0.5) * 6;
      if (Math.abs(x - 6) < 10 && Math.abs(z + 560) < 10) continue;
      const W = 5 + R() * 4, D = 5 + R() * 3, f = 1 + Math.floor(R() * 3);
      const b = O.cityBlock({ W, D, floors: f, wall: walls[i % walls.length], roof: roofs[i % roofs.length], seed: 600 + i, garden: true });
      b.position.set(x, baseHeight(x, z) - 0.4, z); b.rotation.y = (R() - 0.5) * 0.5 + (side > 0 ? -0.2 : 0.2);
      city.add(b);
    }
  }
}

// ---------- helpers ----------
// an InstancedMesh of `geo` at [x, z, rot, scale, y?] points (y: ground + dy)
function instanced(G, geo, mat, list, dy = 0, _mask = 0, colours = null) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  list.forEach(([x, z, r, s, y], i) => {
    q.setFromAxisAngle(V(0, 1, 0), r);
    m4.compose(V(x, y !== undefined ? y : height(x, z) + dy, z), q, V(s, s, s));
    im.setMatrixAt(i, m4);
    if (colours) im.setColorAt(i, col.set(colours[i]));
  });
  im.castShadow = true; im.receiveShadow = true;
  // small round things (berries, cabbages) get no outline: a sphere's every
  // edge is a silhouette candidate, and hundreds of them double the ink
  im.userData.outline = geo.type === 'SphereGeometry' ? false : 'solid';
  G.add(im);
  return im;
}
function mergeGeos(list) {
  const P = [], N = [], C = [], U = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
    if (g.attributes.color) C.push(...g.attributes.color.array);
    if (g.attributes.uv) U.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (C.length) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}
// a bridge prop laid across water at (x, z) along `ang`, its deck at y, and
// walk decks in short steps following its arch
function deckBridge(world, g, x, z, ang, y, L, w, rise) {
  g.position.set(x, y, z); g.rotation.y = ang; world.group.add(g);
  const n = 9, s = Math.sin(ang), c = Math.cos(ang);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, u = -L / 2 + t * L;
    world.walk.push({ x: x + s * u, z: z + c * u, hw: w / 2 - 0.2, hd: L / n / 2 + 0.06, rot: ang, y: y + Math.sin(t * Math.PI) * rise + 0.02 });
  }
  // the rails / parapets
  for (const sd of [-1, 1]) world.colliders.push({ box: true, x: x + c * sd * (w / 2 - 0.1), z: z - s * sd * (w / 2 - 0.1), hw: 0.12, hd: L / 2 - 0.5, rot: ang });
}
// the road surface from z0 to z1: a ribbon over the dirt, gravel or cobbles
function pave(G, R, z0, z1, kind) {
  const pts = R.filter(([, z]) => z <= z0 && z >= z1);
  if (pts.length < 3) return;
  const HW = kind === 'cobble' ? 2.05 : 1.85, pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (let k = 0; k <= 4; k++) {
      const o = -HW + k * HW / 2, x = pts[i][0] + nx * o, z = pts[i][1] + nz * o;
      pos.push(x, height(x, z) + 0.035, z); uv.push(o / 2, s / 2);
    }
    if (i) for (let k = 0; k < 4; k++) { const p = (i - 1) * 5 + k; idx.push(p, p + 1, p + 5, p + 1, p + 6, p + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const t = kind === 'cobble' ? cobbleTex() : gravelTex();
  const m = O.texm(t); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.outline = false; mesh.name = 'r1_' + kind;
  G.add(mesh);
  if (kind !== 'cobble') return;
  // kerb stones both sides
  const kerb = [];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    for (const sd of [-1, 1]) { const x = pts[i][0] + nx * (HW + 0.12) * sd, z = pts[i][1] + nz * (HW + 0.12) * sd; kerb.push([x, z, Math.atan2(dx, dz), 1, height(x, z) + 0.06]); }
  }
  instanced(G, new THREE.BoxGeometry(0.26, 0.2, 1.05), O.flat('#c9c3b0'), kerb);
}
const texCache = new Map();
function tex(key, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d'), 256, rng(key.length * 31));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.name = 'r1_' + key;
  texCache.set(key, t); return t;
}
// cobbles: rounded setts in staggered rows, grass in the joints (2 x 2 m)
const cobbleTex = () => tex('cobble', (x, S, R) => {
  x.fillStyle = '#7f8a6a'; x.fillRect(0, 0, S, S);
  const rows = 11, rh = S / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 10; c++) {
    const w = S / 9, cx = (c + (r % 2) * 0.5) * w + w / 2, cy = r * rh + rh / 2;
    const v = 0.85 + R() * 0.3;
    x.fillStyle = `rgb(${(178 * v) | 0},${(170 * v) | 0},${(152 * v) | 0})`;
    x.beginPath(); x.roundRect(cx - w / 2 + 2, cy - rh / 2 + 2, w - 4, rh - 4, 6); x.fill();
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.roundRect(cx - w / 2 + 4, cy - rh / 2 + 3, w - 10, (rh - 6) * 0.4, 4); x.fill();
  }
  for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(96,150,70,${0.4 + R() * 0.4})`; x.fillRect(R() * S, R() * S, 2 + R() * 4, 2); }
});
const gravelTex = () => tex('gravel', (x, S, R) => {
  x.fillStyle = '#c8b894'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 2600; k++) { const v = 0.7 + R() * 0.5; x.fillStyle = `rgb(${(200 * v) | 0},${(188 * v) | 0},${(160 * v) | 0})`; x.beginPath(); x.arc(R() * S, R() * S, 1 + R() * 2.4, 0, 6.28); x.fill(); }
  for (let k = 0; k < 40; k++) { x.fillStyle = 'rgba(110,150,70,.35)'; x.beginPath(); x.ellipse(R() * S, R() * S, 6 + R() * 10, 3, R() * 3, 0, 6.28); x.fill(); }
});
// small things
function benchSeat() {
  const g = new THREE.Group(), w = O.texm(O.planks('#a87a4c'));
  for (let i = 0; i < 3; i++) O.box(1.8, 0.06, 0.13, w, 0, 0.48, -0.16 + i * 0.16, g);
  for (let i = 0; i < 2; i++) O.box(1.8, 0.13, 0.05, w, 0, 0.75 + i * 0.2, -0.28, g);
  for (const sx of [-0.8, 0.8]) { O.box(0.07, 0.48, 0.5, '#2f4a40', sx, 0.24, 0, g); O.box(0.07, 0.6, 0.07, '#2f4a40', sx, 0.8, -0.3, g); }
  return g;
}
// a woven basket of berries: a tapered lathe with a rolled rim and weave
// bands, a hoop handle, a heap of berries
function basket() {
  const g = new THREE.Group(), w = O.texm(O.thatch('#b88a52'));
  O.put(new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.24, 0], [0.27, 0.06], [0.33, 0.3], [0.33, 0.32], [0.3, 0.32], [0.24, 0.05], [0.001, 0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 14), w), g, 0, 0, 0);
  O.put(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 5, 18).rotateX(Math.PI / 2), O.flat('#9a6a3a')), g, 0, 0.32, 0);
  for (const y of [0.1, 0.2]) O.put(new THREE.Mesh(new THREE.TorusGeometry(0.29 + y * 0.18, 0.012, 3, 18).rotateX(Math.PI / 2), O.flat('#9a6a3a')), g, 0, y, 0, { line: false });
  O.put(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 4, 14, Math.PI), O.flat('#9a6a3a')), g, 0, 0.32, 0);
  for (let i = 0; i < 9; i++) O.ball(0.07, ['#3a6ad8', '#f26aa0', '#e8402e'][i % 3], (i % 3 - 1) * 0.12, 0.3 + (i > 5 ? 0.06 : 0), (Math.floor(i / 3) - 1) * 0.1, g, { seg: 7, line: false });
  return g;
}
// an orchard ladder: two splayed rails, round rungs, a prop leg
function ladder() {
  const g = new THREE.Group(), w = '#9a7a4a';
  for (const sx of [-1, 1]) O.beam(V(sx * 0.32, 0, 0), V(sx * 0.18, 2.9, -0.75), 0.07, w, g);
  for (let k = 0; k < 8; k++) { const t = (k + 0.5) / 8, hw = 0.32 - 0.14 * t; const r = O.cyl(0.025, 0.025, hw * 2, w, 0, t * 2.9, -t * 0.75, g, 6); r.rotation.z = Math.PI / 2; }
  O.beam(V(0, 2.7, -0.7), V(0, 0, -1.6), 0.06, w, g);
  return g;
}
// a terracotta pot with a rolled rim, a saucer, a plant of leaf cards
function pot() {
  const g = new THREE.Group();
  O.put(new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0.02], [0.22, 0.02], [0.3, 0.38], [0.33, 0.4], [0.33, 0.46], [0.29, 0.46], [0.27, 0.42], [0.001, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 14), O.flat('#c86a3e')), g, 0, 0, 0);
  O.cyl(0.27, 0.27, 0.03, '#b05a34', 0, 0.015, 0, g, 14);
  O.mossTop(g, 0.5, 0.5, 0, 0.43, 0, 0, 33);
  const out = cards();
  for (let i = 0; i < 9; i++) { const a = i * 2.4, p = V(Math.cos(a) * 0.15, 0.62 + (i % 3) * 0.1, Math.sin(a) * 0.15); pushCard(out, p, V(Math.cos(a), 0.8, Math.sin(a)).normalize(), 0.45, i % 2 ? TILE.bushA : TILE.flowersR, a, V(0, 0.4, 0), 0.4); }
  O.put(new THREE.Mesh(toGeometry(out), leafMaterial('#ffffff', 0.04)), g, 0, 0, 0, { line: false });
  return g;
}
// a litter bin: a slatted drum on a post-mounted frame with a domed lid
function bin() {
  const g = new THREE.Group();
  O.cyl(0.26, 0.24, 0.8, '#4f7a6a', 0, 0.42, 0, g, 16);
  for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28; const s = O.box(0.025, 0.74, 0.02, '#3a5a4e', Math.cos(a) * 0.255, 0.42, Math.sin(a) * 0.255, g, { line: false, shadow: false }); s.rotation.y = -a; }
  for (const y of [0.1, 0.78]) O.put(new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.02, 4, 18).rotateX(Math.PI / 2), O.flat('#2f4a40')), g, 0, y, 0, { line: false });
  const lid = O.ball(0.28, '#3a5a4e', 0, 0.82, 0, g, { seg: 14 }); lid.scale.y = 0.35;
  O.box(0.12, 0.04, 0.03, '#2a2a2a', 0, 0.92, 0, g, { line: false });
  return g;
}
function pole(h) { const g = new THREE.Group(); O.cyl(0.05, 0.06, h, '#8a6a4a', 0, h / 2, 0, g, 6); return g; }
void routeSign; void LEDGES; void ledgeLineZ; void pathSD; void POCKET; void ORCHARD;
