// Where the stylized plants grow: a forest ring of big painted broadleaves,
// birches, poplars and cypresses, willows by the pond, Scots pines and giants
// on the hills, palms on the beach, bushes and hedges, fern beds in the shade,
// flower clumps and mossy rocks. Seeded, so the town always looks the same.
import { height, roadMask, isWater, fbm, rng, POND } from './terrain.js';
import { Scatter, Impostor } from './assets.js';
import { makeTree, makeBush, makeRock, makeClump, TILE, setTreeDetail } from './foliage.js';
import { BEDS } from './town.js';

const inTown = (x, z) => Math.abs(x) < 44 && z > -36 && z < 44;

export async function buildVegetation(scene, renderer, blocked, colliders, quality, onProgress) {
  const R = rng(4242);
  const free = (x, z, r = 1) => !blocked(x, z, r) && roadMask(x, z) < 0.05 && !isWater(x, z) && height(x, z) > 0.12;
  const scatters = [], impostors = [];
  const pick = (w) => { let t = R() * w.reduce((a, b) => a + b[1], 0); for (const [k, p] of w) { t -= p; if (t <= 0) return k; } return w[0][0]; };
  // a few shapes of each kind, points shared out between them
  const sow = (models, pts, opts) => {
    const by = models.map(() => []);
    for (const p of pts) by[Math.floor(R() * models.length)].push(p);
    models.forEach((m, i) => { if (by[i].length) scatters.push(new Scatter(scene, m, by[i], opts(m))); });
  };
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

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
  for (const [x, z, k, s] of [[-34, -27, 'tiered', 1.0], [34, -28, 'linden', 0.9], [-37, 22, 'shade', 0.9], [-9, 39, 'tiered', 0.85], [31, 3, 'shade', 0.85],
    [-38, -3, 'cypress', 1.0], [-30, 2, 'tiered', 0.8], [-31, -6, 'cypress', 1.0], [9, -3, 'lombardy', 0.55], [-4, 54, 'palm', 1.0], [12, 54, 'palm', 1.0],
    [-34.5, 37, 'willow', 0.85], [-10.5, 29, 'willow', 0.75], [40, 37, 'maple', 0.9]]) place(k, x, z, s);
  const north = [['scotspine', 2.5], ['giant', 2], ['linden', 3], ['beech', 2], ['tiered', 3], ['shade', 2], ['cypress', 1.5], ['oldgrowth', 1], ['multistem', 1], ['birch', 1], ['bushy', 1], ['dead', 0.25]];
  const edge = [['tiered', 5], ['shade', 3], ['linden', 3], ['oak', 3], ['beech', 2], ['multistem', 2], ['bushy', 3], ['sapling', 2], ['birch', 2], ['lombardy', 1.5], ['cypress', 1.5], ['spreading', 1], ['oldgrowth', 0.7], ['giant', 0.7]];
  const far = [['tiered', 3], ['linden', 3], ['beech', 2], ['oak', 2], ['giant', 2], ['shade', 2], ['oldgrowth', 1], ['scotspine', 1], ['cypress', 1], ['dead', 0.3], ['birch', 1]];
  for (let i = 0; i < 12000 && all.length < 400 * quality.trees; i++) {
    const x = (R() - 0.5) * 320, z = -200 + R() * 260;
    if (inTown(x, z)) continue;
    if (Math.abs(x + Math.sin(z * 0.02) * 6) < 10 && z < -34) continue;
    if (z > 44 && x > -34 && x < -8) continue;
    const beach = z > 46;
    const ring = Math.abs(x) < 70 && z > -56 && z < 52;
    const dens = beach ? 0.25 : ring ? 0.95 : 0.35 + fbm(x * 0.025, z * 0.025, 2) * 0.6;
    if (R() > dens || !free(x, z, 2.5)) continue;
    let k = beach ? 'palm' : pick(z < -60 ? north : ring ? edge : far);
    if (k === 'dead' && (ring || R() < 0.5)) k = 'tiered';   // snags only deep in the woods
    const s = k === 'palm' ? 0.9 + R() * 0.3 : 0.8 + R() * 0.35, r = models[k][0].radius * s;
    if (tooClose(x, z, r)) continue;
    place(k, x, z, s);
  }
  for (const t of all) colliders.push({ x: t.x, z: t.z, r: Math.max(0.45, t.trunk + 0.1) });
  for (const [k, list] of Object.entries(pts)) {
    if (!list.length) continue;
    // one billboard set per kind (its first shape), shared by its variants
    const imp = new Impostor(renderer, models[k][0]);
    impostors.push(imp);
    sow(models[k], list, () => ({ chunk: 30, maxDist: 75 * quality.lod, wind: 0, impostor: imp }));
    await yieldUI();
  }
  window.__trees = Object.fromEntries(Object.entries(pts).map(([k, l]) => [k, l.length]));

  // ---------- bushes and hedges ----------
  onProgress('Planting bushes');
  const bushes = [makeBush(1, { size: 1.0 }), makeBush(2, { size: 1.3 }), makeBush(3, { size: 0.9, flowers: TILE.flowersR }), makeBush(4, { size: 1.1, flowers: TILE.flowersY }), makeBush(5, { size: 1.5 })];
  const bp = [];
  for (let i = 0; i < 14000 && bp.length < 900 * quality.plants; i++) {
    const x = (R() - 0.5) * 210, z = -150 + R() * 200;
    if (!free(x, z, 0.9)) continue;
    const edge = all.some((t) => { const d = (t.x - x) ** 2 + (t.z - z) ** 2; return d < 60 && d > 6; });
    const lane = Math.abs(roadMask(x + 2.6, z) - roadMask(x - 2.6, z)) > 0.3 && R() < 0.25;  // along roads
    if (!edge && !lane && R() > 0.04) continue;
    bp.push({ x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s: 0.8 + R() * 0.7 });
  }
  sow(bushes, bp, () => ({ chunk: 24, maxDist: 80 * quality.lod, wind: 0 }));

  // ---------- ferns and flowers ----------
  onProgress('Sowing flowers');
  const ferns = [makeClump(1, TILE.fern, 1.4), makeClump(2, TILE.fern, 1.1)];
  const flowers = [makeClump(3, TILE.flowersY, 0.9), makeClump(4, TILE.flowersR, 0.9), makeClump(5, TILE.blossom, 0.7), makeClump(6, TILE.blossomW, 0.7)];
  const fp = [], fl = [];
  for (let i = 0; i < 16000 && fp.length < 1200 * quality.plants; i++) {
    const x = (R() - 0.5) * 220, z = -150 + R() * 200;
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
    const cx = (R() - 0.5) * 180, cz = -120 + R() * 160;
    if (!free(cx, cz, 1.5) || fbm(cx * 0.05, cz * 0.05, 2) < 0.48) continue;
    const n = 4 + Math.floor(R() * 8);
    for (let k = 0; k < n; k++) {
      const x = cx + (R() - 0.5) * 4, z = cz + (R() - 0.5) * 4;
      if (free(x, z, 0.3)) fl.push({ x, z, y: height(x, z), rot: R() * 6.28, s: 0.8 + R() * 0.5 });
    }
  }
  sow(ferns, fp, () => ({ chunk: 20, maxDist: 60 * quality.lod, wind: 0, shadows: false }));
  sow(flowers, fl, () => ({ chunk: 16, maxDist: 55 * quality.lod, wind: 0, shadows: false }));

  // ---------- rocks ----------
  const rocks = [makeRock(1, 1.0), makeRock(2, 1.4), makeRock(3, 0.8), makeRock(4, 2.0)];
  const rp = [];
  for (let i = 0; i < 3000 && rp.length < 45; i++) {
    const x = (R() - 0.5) * 240, z = -170 + R() * 220;
    if (inTown(x, z) && R() > 0.08) continue;
    if (!free(x, z, 1.5)) continue;
    rp.push({ x, z, y: height(x, z) - 0.1, rot: R() * 6.28, s: 0.7 + R() * 1.0 });
  }
  for (const [x, z] of [[-31, 28], [-14, 41], [-28, 40], [-17, 26]]) rp.push({ x, z, y: height(x, z) - 0.1, rot: R() * 6, s: 1.0 });
  sow(rocks, rp, () => ({ chunk: 40, maxDist: 160, wind: 0 }));
  for (const p of rp) colliders.push({ x: p.x, z: p.z, r: 0.8 * p.s });

  return { update(cam) { for (const s of scatters) s.update(cam); }, impostors };
}
