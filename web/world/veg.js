// Where the stylized plants grow: a forest ring of broadleaf trees, poplars
// and hill pines, blossom trees in the village, palms on the beach, bushes and
// hedges, fern beds in the shade, flower clumps and mossy rocks. Seeded, so the
// town always looks the same.
import { height, roadMask, isWater, fbm, rng, POND } from './terrain.js';
import { Scatter, Impostor } from './assets.js';
import { makeTree, makeBush, makeRock, makeClump, TILE } from './foliage.js';
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
  onProgress('Growing the forest');
  await yieldUI();
  const kinds = { round: [11, 12, 13, 14], cypress: [61, 62, 63], poplar: [21, 22], pine: [31, 32, 33], blossom: [41, 42], palm: [51, 52, 53] };
  const models = Object.fromEntries(Object.entries(kinds).map(([k, seeds]) => [k, seeds.map((s) => makeTree(k, s))]));
  const pts = { round: [], cypress: [], poplar: [], pine: [], blossom: [], palm: [] };
  const all = [];
  const tooClose = (x, z, d) => all.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < d * d);
  for (let i = 0; i < 12000 && all.length < 520 * quality.trees; i++) {
    const x = (R() - 0.5) * 320, z = -200 + R() * 260;
    if (inTown(x, z)) continue;
    if (Math.abs(x + Math.sin(z * 0.02) * 6) < 10 && z < -34) continue;
    if (z > 44 && x > -34 && x < -8) continue;
    const beach = z > 46;
    const ring = Math.abs(x) < 70 && z > -56 && z < 52;
    const dens = beach ? 0.25 : ring ? 0.95 : 0.35 + fbm(x * 0.025, z * 0.025, 2) * 0.6;
    if (R() > dens || !free(x, z, 2.5) || tooClose(x, z, beach ? 7 : 4.6)) continue;
    const kind = beach ? 'palm' : z < -60 ? pick([['cypress', 4], ['round', 4], ['pine', 1]]) : pick([['round', 8], ['cypress', 3], ['poplar', 1]]);
    const t = { x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s: 0.85 + R() * 0.4 };
    pts[kind].push(t); all.push(t);
  }
  // shade and blossom trees in the village
  for (const [x, z, k] of [[-34, -27, 'round'], [34, -28, 'round'], [-37, 22, 'round'], [-9, 39, 'round'], [31, 3, 'round'], [-38, -3, 'cypress'], [-30, 2, 'round'], [-4, 54, 'palm'], [12, 54, 'palm'], [-31, -6, 'cypress'], [9, -3, 'cypress']]) {
    const t = { x, z, y: height(x, z) - 0.05, rot: R() * 6.28, s: 1.0 };
    pts[k].push(t); all.push(t);
  }
  for (const t of all) colliders.push({ x: t.x, z: t.z, r: 0.45 * t.s });
  for (const [k, list] of Object.entries(pts)) {
    sow(models[k], list, (m) => {
      const imp = new Impostor(renderer, m);
      impostors.push(imp);
      return { chunk: 30, maxDist: 75 * quality.lod, wind: 0, impostor: imp };
    });
    await yieldUI();
  }

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
