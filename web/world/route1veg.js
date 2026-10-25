// Route 1's planted things for veg.js: the meadow's wildflower drifts (one
// model per kind, all on the 'meadow' leaf atlas, so they share a material),
// the trees placed by hand (the meadow's lone tree, the orchard's rows, the
// old oak at the rest area, the cottage's garden trees) and the wildflowers
// along the tea house creek and the farm's verges.
import * as THREE from 'three';
import { cards, pushCard, toGeometry, leafMaterial, MEADOW_TILE } from './foliage.js';
import { height, rng } from './terrain.js';
import { POCKET, pocketMask, drift, TREE, REST, ORCHARD, COTTAGE, TEA, creekAt, n2 } from './route1land.js';

// a tuft of one meadow flower: crossed upright cards plus a few leaning out
function tuft(seed, tile, size) {
  const R = rng(seed), out = cards(), centre = new THREE.Vector3(0, -0.4, 0);
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + R() * 0.4, d = R() * 0.18 * size;
    const p = new THREE.Vector3(Math.cos(a * 2) * d, (0.24 + R() * 0.12) * size, Math.sin(a * 2) * d);
    pushCard(out, p, new THREE.Vector3(Math.cos(a), 0.25 + R() * 0.3, Math.sin(a)).normalize(), (0.48 + R() * 0.2) * size, tile, (R() - 0.5) * 0.3, centre, 0.7);
  }
  return { parts: [{ geometry: toGeometry(out), material: leafMaterial('#ffffff', 0.05, 'meadow') }], height: size * 0.6, radius: size * 0.35 };
}

// The drifts: points for each kind (0 yellow, 1 pink, 2 lavender, 3 white,
// 4 poppy, 5 blue accents), denser in the middle of a drift.
export function meadowFlowers(free, quality) {
  const R = rng(1777), models = MEADOW_TILE.map((t, i) => [tuft(300 + i, t, 0.85), tuft(310 + i, t, 1.05)]);
  const pts = MEADOW_TILE.map(() => []);
  const M = POCKET.meadow, budget = 5200 * quality.plants;
  let n = 0;
  for (let i = 0; i < 60000 && n < budget; i++) {
    const x = M.cx + (R() * 2 - 1) * (M.rx + 6), z = M.cz + (R() * 2 - 1) * (M.rz + 6);
    const m = pocketMask(M, x, z);
    if (m < 0.35 || !free(x, z, 0.3)) continue;
    const k = drift(x, z);
    let s = k.s;
    if (s < 0 || R() > k.w * 0.95 + 0.05) { if (R() < 0.06) s = 5; else continue; }   // open grass between drifts, a blue now and then
    if (R() < 0.08) s = Math.floor(R() * 6);   // a stray of another kind
    pts[s].push({ x, z, y: height(x, z) - 0.04, rot: R() * 6.28, s: 0.75 + R() * 0.5 });
    n++;
  }
  // wildflowers along the creek and round the tea house, the farm's verges
  for (const [p, num, kinds] of [[POCKET.tea, 700, [3, 5, 1]], [POCKET.farm, 420, [0, 4, 3]], [POCKET.rest, 300, [3, 0]], [POCKET.west_end, 380, [1, 2, 3]], [POCKET.east_end, 260, [0, 3]]]) {
    for (let i = 0, got = 0; i < num * 12 && got < num * quality.plants; i++) {
      const x = p.cx + (R() * 2 - 1) * p.rx, z = p.cz + (R() * 2 - 1) * p.rz;
      if (pocketMask(p, x, z) < 0.5 || !free(x, z, 0.3)) continue;
      const c = creekAt(x, z), nearC = c && c.d < c.c.w + 4.5;
      if (!nearC && n2(x * 0.09, z * 0.09, 2) < 0.52) continue;
      const s = kinds[Math.floor(n2(x * 0.05 + 7, z * 0.05, 2) * 2.2 * kinds.length) % kinds.length];
      pts[s].push({ x, z, y: height(x, z) - 0.04, rot: R() * 6.28, s: 0.7 + R() * 0.45 });
      got++;
    }
  }
  return { models, pts };
}

// trees placed by hand: [x, z, kind, scale]
export function handTrees() {
  const R = rng(4243), out = [[TREE.x, TREE.z, 'spreading', 1.35], [REST.x + 9, REST.z - 7, 'oak', 1.2], [REST.x - 12, REST.z + 9, 'linden', 0.9]];
  // the orchard: rows of small fruit trees (berries hung by route1.js)
  for (let x = ORCHARD.x0 + 4, r = 0; x < ORCHARD.x1 - 2; x += 8, r++) for (let z = ORCHARD.z0 + 4 + (r % 2) * 3; z < ORCHARD.z1 - 2; z += 7.5) out.push([x + (R() - 0.5), z + (R() - 0.5), 'bushy', 0.62 + R() * 0.12]);
  // the cottage's garden: an apple tree, a tall poplar behind
  out.push([COTTAGE.x - 9, COTTAGE.z + 10, 'bushy', 0.95], [COTTAGE.x + 4, COTTAGE.z - 13, 'lombardy', 0.8], [COTTAGE.x - 14, COTTAGE.z - 6, 'tiered', 0.9]);
  // the tea house: a maple by the creek, a cypress behind
  const tw = (lx, lz) => [TEA.x + lx * Math.cos(TEA.rot) + lz * Math.sin(TEA.rot), TEA.z - lx * Math.sin(TEA.rot) + lz * Math.cos(TEA.rot)];
  out.push([...tw(8.5, -3), 'maple', 0.75], [...tw(-3, -9), 'cypress', 0.9], [...tw(4, -10), 'cypress', 0.8]);
  return out;
}
