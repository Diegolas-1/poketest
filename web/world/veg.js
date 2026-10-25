// Where the stylized plants grow: a forest ring of big painted broadleaves,
// birches, poplars and cypresses, willows by the pond, Scots pines and giants
// on the hills, palms on the beach, bushes and hedges, fern beds in the shade,
// flower clumps and mossy rocks. Seeded, so the town always looks the same.
import { height, isWater, fbm, rng, POND, SEA_Y, roadDist, townDist, labHillU, fieldAt, onStairs, inYard, streamAt, PLAZA, STAIRS, FIELDS, onPath, shoreSD, cliffiness, routeX, routeHalfWidth, ledgeAt, HARBOUR, TALL_GRASS, BOATHOUSE, CLEARINGS, PALLET_HOUSE } from './terrain.js';
import { Scatter, Impostor } from './assets.js';
import * as THREE from 'three';
import { makeTree, makeBush, makeRock, makeClump, TILE, setTreeDetail } from './foliage.js';
import { STONE } from './stone.js';
import { BEDS } from './town.js';
import * as R1 from './route1land.js';
import { meadowFlowers, handTrees } from './route1veg.js';


const TALL = TALL_GRASS;
const HQ = HARBOUR.quay;
const HA = HARBOUR.apron;
const inHarbour = (x, z, m = 0) => (x > HA.x0 - 8 - m && x < HA.x1 + 8 + m && z > HQ.z0 - 3 - m && z < HA.z1 + 4 + m) || Math.hypot(x - BOATHOUSE.x, z - BOATHOUSE.z) < 6 + m;
const inPlaza = (x, z, m = 0) => x > PLAZA.x0 - m && x < PLAZA.x1 + m && z > PLAZA.z0 - m && z < PLAZA.z1 + m;
// the lab hill's slopes (not the plateau, not the stairs and the bushes beside them)
const onHill = (x, z) => { const u = labHillU(x, z); return u > 0.06 && u < 0.95 && !(Math.abs(z - STAIRS.z) < 10.5 && x < STAIRS.x1 + 3); };

export async function buildVegetation(scene, renderer, blocked, colliders, quality, onProgress) {
  const R = rng(4242);
  const free = (x, z, r = 1) => !blocked(x, z, r) && roadDist(x, z) > 2.5 + r * 0.3 && !isWater(x, z) && height(x, z) > SEA_Y + 0.8
    && !fieldAt(x, z, 0.8) && !onStairs(x, z, 3) && !inYard(x, z, 0.4) && !inPlaza(x, z, 1) && streamAt(x, z).d > 3.4 && labHillU(x, z) > 0.04
    && !(z < -90 && ledgeAt(x, z, 2.2 + r)) && !inHarbour(x, z, r) && !CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r) && Math.hypot(x - PALLET_HOUSE.x, z - PALLET_HOUSE.z) > PALLET_HOUSE.r + 1 + r;
  const scatters = [], impostors = [];
  // how far a model's base (everything within 0.7 m of the ground) reaches out
  const baseR = (list) => { let r = 0; for (const m of list) for (const p of m.parts) { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) if (a.getY(i) < 0.7) r = Math.max(r, Math.hypot(a.getX(i), a.getZ(i))); } return r; };
  // nothing stands on the dirt: mark what would, and leave it out
  const keepOff = (list, br) => { for (const p of list) if (onPath(p.x, p.z, br * p.s)) p.off = true; };
  const pick = (w) => { let t = R() * w.reduce((a, b) => a + b[1], 0); for (const [k, p] of w) { t -= p; if (t <= 0) return k; } return w[0][0]; };
  // a few shapes of each kind, points shared out between them
  const sow = (models, pts, opts) => {
    const by = models.map(() => []);
    for (const p of pts) { const j = Math.floor(R() * models.length); if (!p.off) by[j].push(p); }   // p.off: on a path (the draw keeps the seeded layout)
    models.forEach((m, i) => { if (by[i].length) scatters.push(new Scatter(scene, m, by[i], opts(m))); });
  };
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));
  // billboards are baked under the scene's own lights (sky, sun, environment)
  const lights = () => {
    let sun = null, hemi = null;
    scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) sun = o; if (o.isHemisphereLight) hemi = o; });
    let sunDir = sun ? sun.position.clone().sub(sun.target.position) : null;
    if (!sunDir || sunDir.lengthSq() < 1e-6 || (sunDir.x === 0 && sunDir.z === 0)) sunDir = new THREE.Vector3(-0.55, 0.75, 0.45);   // before the first frame places the sun
    return { sun, hemi, sunDir: sunDir.normalize(), environment: scene.environment, environmentIntensity: scene.environmentIntensity };
  };
  const lowQ = quality.lod < 0.8;

  // ---------- trees ----------
  // Big painted broadleaves round the village (tiered park trees, shade
  // trees, lindens, beeches, oaks), birches and young trees at the edges,
  // poplars and cypresses as accents, willows by the pond, Scots pines and
  // giants on the northern hills, a couple of dead snags deep in the woods,
  // palms on the beach. Fewer, bigger trees than before: each has a few
  // thousand leaf cards, so the count stays low and canopies overlap.
  onProgress('Growing the forest');
  await yieldUI();
  const kinds = {
    tiered: [11, 12, 13], shade: [14, 15], linden: [16, 17], beech: [18, 19], oak: [20, 21], spreading: [22],
    multistem: [23, 24], bushy: [25, 26], sapling: [27, 28], birch: [29, 30], lombardy: [31, 32], cypress: [61, 62],
    giant: [33, 34], oldgrowth: [35], scotspine: [36, 37], dead: [38], willow: [39, 40], palm: [51, 52, 53], maple: [41],
  };
  const models = {}, pts = {};
  setTreeDetail(quality.trees < 0.8 ? 0.55 : 0.75);   // fewer, bigger leaf cards than the close-up models
  for (const [k, seeds] of Object.entries(kinds)) { models[k] = seeds.map((s) => makeTree(k, s)); pts[k] = []; await yieldUI(); }
  setTreeDetail(1);
  const all = [];
  // canopies may overlap a little (a forest), trunks never
  const tooClose = (x, z, r) => all.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < ((t.r + r) * 0.5) ** 2);
  const place = (k, x, z, s) => {
    const m = models[k][0], t = { x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s, k, r: m.radius * s, trunk: m.trunk * s };
    pts[k].push(t); all.push(t);
  };
  // shade and accent trees in the village and by the pond, placed by hand
  for (const [x, z, k, s] of [[-36, -26, 'tiered', 1.0], [12, -20, 'linden', 0.9], [-30, 30, 'shade', 0.9], [-12, 46, 'tiered', 0.85], [20, 2, 'shade', 0.85],
    [-60, -2, 'cypress', 1.0], [-14, 12, 'tiered', 0.8], [-34, -6, 'cypress', 1.0], [14, -30, 'lombardy', 0.55], [-2, 58, 'palm', 1.0], [-24, 60, 'palm', 1.0],
    [-58, 34, 'willow', 0.85], [-42, 44, 'willow', 0.75], [44, -24, 'maple', 0.9], [12, 34, 'willow', 0.8], [-48, -40, 'linden', 0.9], [-14, -36, 'oak', 0.85]]) {
    // a hand-placed tree near a path steps back off it (to the nearest clear spot)
    let p = [x, z];
    const rb = Math.max(1.5, baseR(models[k]) * s);
    if (onPath(x, z, rb)) {
      p = null;
      for (let d = 0.5; d <= 6 && !p; d += 0.5) for (let a = 0; a < 16 && !p; a++) {
        const qx = x + Math.cos(a / 16 * 6.283) * d, qz = z + Math.sin(a / 16 * 6.283) * d;
        if (!onPath(qx, qz, rb) && free(qx, qz, 1.5)) p = [qx, qz];
      }
    }
    if (p && (p[0] !== x || p[1] !== z)) (window.__offPath ||= []).push([x, z, +p[0].toFixed(1), +p[1].toFixed(1), k]);   // test hook: what moved
    if (p && free(p[0], p[1], 1.5)) place(k, p[0], p[1], s);
  }
  // Route 1's trees placed by hand (route1veg.js): the meadow's lone tree, the orchard
  for (const [x, z, k, s] of handTrees()) if (free(x, z, 1)) place(k, x, z, s);
  const north = [['scotspine', 2.5], ['giant', 2], ['linden', 3], ['beech', 2], ['tiered', 3], ['shade', 2], ['cypress', 1.5], ['oldgrowth', 1], ['multistem', 1], ['birch', 1], ['bushy', 1], ['dead', 0.25]];
  const edge = [['tiered', 5], ['shade', 3], ['linden', 3], ['oak', 3], ['beech', 2], ['multistem', 2], ['bushy', 3], ['sapling', 2], ['birch', 2], ['lombardy', 1.5], ['cypress', 1.5], ['spreading', 1], ['oldgrowth', 0.7], ['giant', 0.7]];
  const hillK = [['tiered', 3], ['shade', 2], ['linden', 3], ['bushy', 3], ['cypress', 2.5], ['oak', 1]];
  const far = [['tiered', 3], ['linden', 3], ['beech', 2], ['oak', 2], ['giant', 2], ['shade', 2], ['oldgrowth', 1], ['scotspine', 1], ['cypress', 1], ['dead', 0.3], ['birch', 1]];
  // the lab hill first: lush, broadleaves and cypresses all over its slopes
  for (let i = 0; i < 5000 && pts.tiered.length + pts.cypress.length + pts.bushy.length < 160 * quality.trees; i++) {
    const x = 18 + R() * 92, z = -26 + R() * 82;
    if (!onHill(x, z) || isWater(x, z) || height(x, z) < SEA_Y + 1) continue;
    if (R() > 0.7) continue;
    const k = pick(hillK), s = 0.75 + R() * 0.35, r = models[k][0].radius * s;
    if (tooClose(x, z, r * 1.1)) continue;
    place(k, x, z, s);
  }
  for (let i = 0; i < 40000 && all.length < 880 * quality.trees; i++) {
    const x = (R() - 0.5) * 470, z = -470 + R() * 700;
    if (onHill(x, z) || labHillU(x, z) < 1.02) continue;
    if (roadDist(x, z) < (z < -56 ? 5 : 7) && z < -56) continue;
    const td = townDist(x, z), sd = shoreSD(x, z);
    const beach = sd < 16 && cliffiness(x, z) < 0.5;
    if (sd < 3) continue;
    const ring = td > 10 && td < 40 && z > -64;
    let dens = beach ? 0.22 : td < 10 ? 0.05 : ring ? 0.8 : 0.35 + fbm(x * 0.025, z * 0.025, 2) * 0.6;
    if (z < -70) {
      // Route 1: groves on the valley floor, a wall of forest along its sides,
      // thinning out over the hills beyond (in the haze)
      const e = Math.abs(x - routeX(z)) - routeHalfWidth(z);
      dens = e < -8 ? 0.1 + fbm(x * 0.05 + 3, z * 0.05, 2) * 0.25 : e < 24 ? 0.95 : e < 70 ? 0.22 : 0.03;
      if (e < -8 && TALL.some(([a, b, c2, d]) => x > a - 3 && x < c2 + 3 && z > b - 3 && z < d + 3)) dens = 0.02;
      dens = R1.treeDensity(x, z, dens);
    }
    if (R1.cleared(x, z, 3)) dens = 0;
    if (R() > dens || !free(x, z, 2.5)) continue;
    let k = beach ? 'palm' : pick(z < -64 ? north : ring || td < 10 ? edge : far);
    if (k === 'dead' && (ring || R() < 0.5)) k = 'tiered';   // snags only deep in the woods
    const s = k === 'palm' ? 0.9 + R() * 0.3 : 0.8 + R() * 0.35, r = models[k][0].radius * s;
    if (tooClose(x, z, r)) continue;
    place(k, x, z, s);
  }
  // nothing stands on the dirt: drop any tree whose trunk base is on a path
  for (const k of Object.keys(pts)) keepOff(pts[k], Math.max(0.6, baseR(models[k])));
  for (const t of all) if (!t.off) colliders.push({ x: t.x, z: t.z, r: Math.max(0.45, t.trunk + 0.1) });
  // each shape gets its own billboard, so the far tree has the near one's
  // outline; the model cross-fades into it when it passes its range
  const treeD = 75 * quality.lod, L = lights();
  let bakeMs = 0;
  for (const [k, list] of Object.entries(pts)) {
    if (!list.length) continue;
    sow(models[k], list, (m) => {
      const t0 = performance.now(), imp = new Impostor(renderer, m, { size: lowQ ? 96 : 128, lights: L });
      bakeMs += performance.now() - t0;
      impostors.push(imp);
      return { chunk: 56, fade: [treeD - 4, treeD + 2], wind: 0, impostor: imp };
    });
    await yieldUI();
  }
  window.__trees = Object.fromEntries(Object.entries(pts).map(([k, l]) => [k, l.filter((t) => !t.off).length]));
  window.__treesOff = Object.fromEntries(Object.entries(pts).map(([k, l]) => [k, l.filter((t) => t.off).map((t) => [+t.x.toFixed(1), +t.z.toFixed(1)])]).filter(([, l]) => l.length));

  // ---------- bushes and hedges ----------
  onProgress('Planting bushes');
  const bushes = [makeBush(1, { size: 1.0 }), makeBush(2, { size: 1.3 }), makeBush(3, { size: 0.9, flowers: TILE.flowersR }), makeBush(4, { size: 1.1, flowers: TILE.flowersY }), makeBush(5, { size: 1.5 })];
  const bp = [];
  for (let i = 0; i < 30000 && bp.length < 1400 * quality.plants; i++) {
    const x = (R() - 0.5) * 380, z = -450 + R() * 650;
    if (!free(x, z, 0.9)) continue;
    const edge = all.some((t) => { const d = (t.x - x) ** 2 + (t.z - z) ** 2; return d < 60 && d > 6; });
    const rd = roadDist(x, z), lane = rd > 3 && rd < 4.5 && R() < 0.25;  // along roads
    if (!edge && !lane && R() > 0.04) continue;
    if (R1.cleared(x, z, 1)) continue;
    bp.push({ x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s: 0.8 + R() * 0.7 });
  }
  // low hedges round the farm fields
  const hedge = [];
  for (const f of FIELDS) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot), hw = f.w / 2 + 1.4, hd = f.d / 2 + 1.4;
    const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]];
    for (let e = 0; e < 4; e++) {
      const [au, av] = ring[e], [bu, bv] = ring[e + 1], len = Math.hypot(bu - au, bv - av);
      for (let d = 0; d < len; d += 1.15) {
        const u = au + (bu - au) * d / len, v = av + (bv - av) * d / len;
        const x = f.x + u * c + v * s, z = f.z - u * s + v * c;
        if (roadDist(x, z) < 3 || isWater(x, z) || inYard(x, z, 0.5) || R() < 0.08) continue;
        hedge.push({ x, z, y: height(x, z) - 0.15, rot: R() * 6.28, s: 0.62 + R() * 0.12 });
      }
    }
  }
  // nothing on the dirt (marked off, not removed, so the seeded layout stays)
  keepOff(bp, baseR(bushes)); keepOff(hedge, baseR(bushes));
  // bushes and hedges: billboards past the model's range, out into the fog
  // (a far band in clear air would leave them standing half-dithered)
  const bushD = 70 * quality.lod;
  sow(bushes, bp.concat(hedge), (m) => {
    const t0 = performance.now(), imp = new Impostor(renderer, m, { size: lowQ ? 40 : 56, lights: L });
    bakeMs += performance.now() - t0;
    impostors.push(imp);
    return { chunk: 44, fade: [bushD - 4, bushD + 1], wind: 0, impostor: imp };
  });
  window.__hedge = hedge.length;

  // ---------- ferns and flowers ----------
  onProgress('Sowing flowers');
  const ferns = [makeClump(1, TILE.fern, 1.4), makeClump(2, TILE.fern, 1.1)];
  const flowers = [makeClump(3, TILE.flowersY, 0.9), makeClump(4, TILE.flowersR, 0.9), makeClump(5, TILE.blossom, 0.7), makeClump(6, TILE.blossomW, 0.7)];
  const fp = [], fl = [];
  for (let i = 0; i < 30000 && fp.length < 1700 * quality.plants; i++) {
    const x = (R() - 0.5) * 360, z = -450 + R() * 640;
    if (!free(x, z, 0.4)) continue;
    const under = all.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 30);
    const pond = Math.hypot(x - POND.x, z - POND.z) < POND.r + 5;
    if (!under && !pond) continue;
    fp.push({ x, z, y: height(x, z), rot: R() * 6.28, s: 0.8 + R() * 0.6 });
  }
  for (const [x0, z0, x1, z1] of BEDS) {
    for (let x = x0 + 0.4; x < x1; x += 0.7) for (let z = z0 + 0.4; z < z1; z += 0.7) fl.push({ x: x + (R() - 0.5) * 0.4, z: z + (R() - 0.5) * 0.4, y: height(x, z), rot: R() * 6.28, s: 1.1 + R() * 0.4 });
  }
  for (let i = 0; i < 500 * quality.plants; i++) {
    const cx = (R() - 0.5) * 180, cz = -420 + R() * 460;
    if (!free(cx, cz, 1.5) || fbm(cx * 0.05, cz * 0.05, 2) < 0.48) continue;
    const n = 4 + Math.floor(R() * 8);
    for (let k = 0; k < n; k++) {
      const x = cx + (R() - 0.5) * 4, z = cz + (R() - 0.5) * 4;
      if (free(x, z, 0.3)) fl.push({ x, z, y: height(x, z), rot: R() * 6.28, s: 0.8 + R() * 0.5 });
    }
  }
  // marram grass on the dunes at the back of the beach
  for (let i = 0; i < 9000 && fp.length < 2100 * quality.plants; i++) {
    const x = -230 + R() * 460, z = -120 + R() * 350, sdx = shoreSD(x, z);
    if (sdx < 6 || sdx > 17 || cliffiness(x, z) > 0.5) continue;
    if (sdx < 11 && R() < 0.3) continue;
    if (roadDist(x, z) < 2.5 || isWater(x, z) || blocked(x, z, 0.5) || labHillU(x, z) < 1 || streamAt(x, z).d < 4) continue;
    if (fbm(x * 0.1, z * 0.1, 2) < 0.45) continue;
    fp.push({ x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s: 0.7 + R() * 0.5 });
  }
  keepOff(fp, baseR(ferns)); keepOff(fl, baseR(flowers));
  // small plants fade out and sink into the ground past their range
  sow(ferns, fp, () => ({ chunk: 36, fade: [60 * quality.lod - 3, 60 * quality.lod + 1], shrink: 0.35, wind: 0, shadows: false }));
  sow(flowers, fl, () => ({ chunk: 32, fade: [55 * quality.lod - 3, 55 * quality.lod + 1], shrink: 0.35, wind: 0, shadows: false }));
  // Route 1's flower meadow, in drifts (route1veg.js): one scatter per kind
  {
    const M = meadowFlowers(free, quality);
    M.pts.forEach((list, i) => { keepOff(list, 0.3); sow(M.models[i], list, () => ({ chunk: 48, fade: [62 * quality.lod - 3, 62 * quality.lod + 1], shrink: 0.35, wind: 0, shadows: false })); });
  }

  // ---------- rocks ----------
  const rocks = [makeRock(1, 1.0), makeRock(2, 1.4), makeRock(3, 0.8, { kind: 'slab' }), makeRock(4, 2.0), makeRock(5, 1.2)];
  const rp = [];
  for (let i = 0; i < 6000 && rp.length < 110; i++) {
    const x = (R() - 0.5) * 300, z = -440 + R() * 480;
    if (townDist(x, z) < 12) continue;
    if (!free(x, z, 1.5)) continue;
    rp.push({ x, z, y: height(x, z) - 0.15, rot: R() * 6.28, s: 0.5 + R() * 0.7 });
  }
  // small grey rocks along the beach and below the lab hill
  const brp = [];
  // and boulders heaped at the foot of the rocky shores and the headlands' cliffs
  for (let i = 0; i < 20000 && brp.length < 320; i++) {
    const x = -235 + R() * 470, z = -140 + R() * 370, sdx = shoreSD(x, z);
    if (sdx < -5 || sdx > 4) continue;
    const cl = cliffiness(x, z);
    if (roadDist(x, z) < 3 || inHarbour(x, z, 2) || blocked(x, z, 1.0) || streamAt(x, z).d < 4) continue;
    if (cl < 0.4 && (R() < 0.85 || labHillU(x, z) > 1.3 && R() < 0.6)) continue;
    brp.push({ x, z, y: height(x, z) - 0.2, rot: R() * 6.28, s: cl > 0.4 ? 0.6 + R() * 1.3 : 0.35 + R() * 0.45 });
  }
  const beachRocks = [makeRock(11, 1.0, { col: STONE.beach }), makeRock(12, 0.8, { col: STONE.beach, kind: 'slab' }), makeRock(13, 1.2, { col: STONE.beach }), makeRock(14, 0.7, { col: STONE.beach, kind: 'pebble' })];
  keepOff(brp, baseR(beachRocks));
  sow(beachRocks, brp, () => ({ chunk: 64, fade: [140, 146], shrink: 0.6, wind: 0 }));
  for (const p of brp) if (!p.off) colliders.push({ x: p.x, z: p.z, r: 0.8 * p.s });
  for (const [x, z] of [[-56, 33], [-43, 40], [-52, 47]]) rp.push({ x, z, y: height(x, z) - 0.1, rot: R() * 6, s: 1.0 });
  keepOff(rp, baseR(rocks));
  sow(rocks, rp, () => ({ chunk: 64, fade: [180, 186], shrink: 0.6, wind: 0 }));
  for (const p of rp) if (!p.off) colliders.push({ x: p.x, z: p.z, r: 0.8 * p.s });

  window.__scatters = scatters;
  window.__billboards = { ms: Math.round(bakeMs), n: impostors.length, mb: +(impostors.reduce((a, i) => a + i.bytes, 0) / 1048576).toFixed(1) };
  // plants that cross their range fade over a fraction of a second (wall
  // clock, so it looks the same at any frame rate)
  let last = 0;
  return {
    update(cam) {
      const now = performance.now(), dt = window.__fadeSnap ? +window.__fadeSnap : last ? Math.min(0.25, (now - last) / 1000) : 0;   // __fadeSnap = seconds per frame (tests)
      last = now;
      for (const s of scatters) s.update(cam, dt);
    },
    impostors,
    scatters,
  };
}
