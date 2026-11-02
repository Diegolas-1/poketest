// Route 1's one-way ledges (terrain.js LEDGES) as natural earth faces, the
// way a terrace edge looks where a meadow has slumped: you hop down them going
// south, never climb them. Each ledge follows its line (terrain.js
// ledgeLineZ: a wandering, scalloped plan, the same line the walk grid's
// ledge flag and the ground's step use) and is, from the top down:
//   - a turf mat over the high side (ground: main.js joins it to the terrain,
//     in its material), swelling into a rounded sod cushion at the brim and
//     rolling over it, overhanging the face, with the fluffy grass lip on its
//     brim (grasslip.js) and tufts in the face's pockets;
//   - the face: dark rooty loam under the sod, orange clay, a pale sandy or
//     silty band, gravelly subsoil at the foot (the earth atlas's soils,
//     props/earth.js), each layer standing out or set back a little, lumps,
//     embedded stones and hanging roots; here and there a slump where the
//     face has slid and leans back over a spill of earth;
//   - at the foot a fringe of fallen pebbles and stones, ferns in the pockets
//     (veg.js sows them with the stream banks' ferns).
// The face stays within the ledge's flagged band (0.5 m either side of the
// line), so where you can stand and what you see agree.
//
// buildLedges(ledges, { height, groundColor }) -> { pieces: [Group], turf: [Mesh] }
import * as THREE from 'three';
import { rng, fbm, ledgeLineZ } from '../terrain.js';
import { boulderGeometry, mergeAll, stoneMesh, STONE } from '../stone.js';
import { lipAlong } from '../grasslip.js';
import { earthMat, LAYER_TILES, EARTH, grid, faceOut, soilBands, strand, strandGeometry, bankPlants } from './banks.js';

const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const ROOT = { dark: new THREE.Color('#6f5643'), pale: new THREE.Color('#c2a884') };
const STEP = 0.33;

// a face vertex's colour by layer (no water here: dry earth, a dark band in the sod's shadow)
function soilColor(layer, y, x, z, depth, out) {
  const n = fbm(x * 0.5 + y * 0.8, z * 0.5 - y * 0.6, 2), f = fbm(x * 0.09, z * 0.09 + y * 0.3, 2);
  switch (layer) {
    case 'under': out.copy(EARTH.under); break;
    case 'loam': out.copy(EARTH.loam).lerp(EARTH.loamR, n); break;
    case 'clay': out.copy(EARTH.clay).lerp(EARTH.clayD, sm(0.35, 0.75, f)); break;
    case 'sand': out.copy(EARTH.sand).lerp(EARTH.silt, 0.25 + 0.3 * f); break;
    case 'silt': out.copy(EARTH.silt).lerp(EARTH.clayD, 0.25 * n); break;
    default: out.copy(EARTH.gravel).lerp(EARTH.silt, 0.3 * n);
  }
  out.multiplyScalar(0.93 + 0.12 * Math.sin(y * 29 + n * 4));
  if (depth < 0.22) out.multiplyScalar(lerp(0.74, 1, depth / 0.22));
  return out;
}

export function buildLedges(ledges, { height, groundColor }) {
  const res = { pieces: [], turf: [] };
  const plants = bankPlants();
  for (const L of ledges) {
    const R = rng(7100 + L.i * 97);
    const xa = L.x0 - 3, xb = L.x1 + 3, N = Math.ceil((xb - xa) / STEP);
    // the samples along the ledge
    const S = [];
    for (let k = 0; k <= N; k++) {
      const x = xa + (xb - xa) * k / N, zl = ledgeLineZ(L, x);
      const s = (ledgeLineZ(L, x + 0.3) - ledgeLineZ(L, x - 0.3)) / 0.6, l = Math.hypot(1, s);
      const tx = 1 / l, tz = s / l, ox = -tz, oz = tx;   // along it, and out over it (south, the low side)
      const P = (d) => [x + ox * d, zl + oz * d];
      const hi = height(...P(-0.35)), lo = height(...P(0.75));
      S.push({ x, zl, tx, tz, ox, oz, P, hi, lo, H: hi - lo, u: k * STEP });
    }
    // ---------- per sample: the turf rows and the face rows ----------
    const tcols = [], ecols = [], lips = [], tmp = new THREE.Color();
    const secs = S.map((s) => {
      const k = sm(0.12, 0.6, s.H);
      const n1 = fbm(s.x * 0.5 + L.i, s.zl * 0.5, 2), n2 = fbm(s.x * 0.21 - 4 + L.i, 3.3, 2), n3 = fbm(s.x * 0.9 + 9, L.i * 1.7, 2);
      const bul = k * (0.05 + 0.07 * n1), ov = k * (0.06 + 0.17 * n2), lipT = 0.09 + 0.08 * n3;
      // a slump: the face slid and leans back, earth spilled at its foot
      const slump = sm(0.62, 0.8, fbm(s.x * 0.12 + L.i * 3.1, 7.7, 2)) * k;
      return { k, n1, n2, n3, bul, ov, lipT, slump };
    });
    S.forEach((s, j) => {
      const X = secs[j], { k, bul, ov, lipT, slump } = X;
      const yS = s.hi;   // the sod's top at the brim
      // turf: from 3 m back on the high side to the lip's underside
      const tr = [
        [-3.0, height(...s.P(-3.0)) - 0.03, 0], [-2.2, height(...s.P(-2.2)) + 0.035, 0], [-1.4, height(...s.P(-1.4)) + 0.04, 0],
        [-0.75, height(...s.P(-0.75)) + 0.045 + bul * 0.3, 1], [-0.32, yS + 0.02 + bul * 0.8, 2], [-0.1, yS + 0.02 + bul, 2],
        [ov * 0.5 - 0.02, yS + bul * 0.3 - 0.01, 3], [ov, yS - lipT * 0.45, 4], [ov * 0.78, yS - lipT * 0.82, 4], [-0.05, yS - lipT, 5],
      ];
      tcols.push(tr.map(([d, y, kind]) => {
        const [x, z] = s.P(d);
        groundColor(x, z, y, 0.03, tmp);
        let nrm;
        if (kind <= 1) { const dx = (height(x + 0.5, z) - height(x - 0.5, z)), dz = (height(x, z + 0.5) - height(x, z - 0.5)); nrm = [-dx, 1, -dz]; }
        else if (kind === 5) nrm = [s.ox * 0.6, -0.8, s.oz * 0.6];
        else { const kk = kind === 2 ? 0.08 : 0.38; nrm = [s.ox * kk, 1 - kk, s.oz * kk]; }
        const l = Math.hypot(...nrm);
        const c = tmp.clone().multiplyScalar(kind === 5 ? 0.58 : kind === 4 ? 0.8 : kind === 3 ? 0.93 : 1);
        return { p: [x, y, z], c, n: nrm.map((q) => q / l), uv: [x / 4, z / 4] };
      }));
      // the face: from under the sod down to the low ground
      const top = yS - lipT, bot = s.lo - 0.08, Hf = Math.max(0.02, top - bot);
      const dL = Math.min(Hf * 0.9, 0.16 + 0.12 * X.n1), dC = Math.min(Hf * 0.95, dL + 0.18 + 0.2 * X.n2), dS = Math.min(Hf * 0.97, dC + 0.1 + 0.14 * X.n3);
      const batter = 0.14 + 0.18 * X.n2 + slump * 0.6;
      const lump = (y) => Math.max(0, fbm(s.x * 1.1 + y * 1.6, s.zl * 0.5 - y * 1.2, 2) - 0.42) * 0.42 + Math.max(0, fbm(s.x * 3.1 - y * 2, y * 3 + L.i, 1) - 0.6) * 0.12;
      const rows = [[-0.05, top, 'under', 0]];
      const band = (dp) => (dp < dL ? 'loam' : dp < dC ? 'clay' : dp < dS ? (X.n3 > 0.5 ? 'sand' : 'silt') : 'gravel');
      const depths = [0.03, dL * 0.6, dL - 0.01, dL + 0.02, (dL + dC) / 2, dC - 0.01, dC + 0.02, dS - 0.01, dS + 0.02, Hf - 0.02];
      let prev = 0;
      for (const dp0 of depths) {
        const dp = Math.min(Hf - 0.01, Math.max(prev + 0.004, dp0)); prev = dp;
        const y = top - dp, layer = band(dp);
        // each layer stands out or is set back a little; lumps; the slump leans the lower face out
        const out = layer === 'loam' ? 0.05 : layer === 'clay' ? 0.03 + (dp > dC - 0.03 ? 0.04 * X.n1 : 0) : layer === 'sand' || layer === 'silt' ? -0.04 : 0.01;
        const d = -0.05 + dp * batter + out * k + lump(y) * k + slump * Math.pow(dp / Hf, 2) * 0.25;
        rows.push([Math.min(0.42, d), y, layer, dp]);
      }
      rows.push([Math.min(0.48, rows[rows.length - 1][0] + 0.1 + slump * 0.15), bot - 0.04, 'gravel', Hf]);
      ecols.push(rows.map(([d, y, layer, dp]) => {
        const [x, z] = s.P(d);
        const c = soilColor(layer, y, x, z, dp, new THREE.Color());
        // (stretches of the ledge redder, sandier or darker: the soil changes along it)
        const v = fbm(s.x * 0.06 + L.i * 2.3, 1.1, 2);
        if (layer === 'clay') c.lerp(EARTH.clayD, sm(0.55, 0.8, v) * 0.6).lerp(EARTH.sand, sm(0.45, 0.2, v) * 0.35);
        if (layer === 'loam') c.multiplyScalar(0.9 + 0.2 * v);
        return { p: [x, y, z], c: c.multiplyScalar(lerp(1.08, 1, k)), uv: [s.u, y], layer };
      }));
      X.rows = rows; X.top = top; X.Hf = Hf; X.dL = dL;
      const [lx, lz] = s.P(ov * 0.45);
      lips.push({ x: lx, y: yS + bul * 0.4, z: lz, nx: s.ox, nz: s.oz, k: k * (0.8 + 0.2 * X.n2), j });
    });
    // the face's point at depth dp under the sod, sample j
    const faceAt = (j, dp) => {
      const X = secs[j], rows = X.rows;
      for (let r = 0; r < rows.length - 1; r++) if (dp >= rows[r][3] && dp <= rows[r + 1][3]) {
        const t = (dp - rows[r][3]) / Math.max(1e-6, rows[r + 1][3] - rows[r][3]);
        const [x, z] = S[j].P(lerp(rows[r][0], rows[r + 1][0], t) - 0.02);
        return [x, lerp(rows[r][1], rows[r + 1][1], t), z];
      }
      return null;
    };
    lipAlong(lips, { seed: 5100 + L.i * 13, density: 1.05, face: (smp, dep) => (secs[smp.j].Hf > 0.35 ? faceAt(smp.j, Math.min(secs[smp.j].Hf - 0.1, 0.08 + dep * secs[smp.j].Hf)) : null), faceMax: 0.85, faceRate: 0.35 });
    // ---------- meshes, in pieces of ~20 m ----------
    const PIECE = 80;
    for (let a = 0; a < S.length - 1; a += PIECE) {
      const b = Math.min(S.length - 1, a + PIECE);
      // turf
      {
        const cols = tcols.slice(a, b + 1), Rr = cols[0].length;
        const g = grid(cols, Rr);
        const Nn = []; for (const c of cols) for (const q of c) Nn.push(...q.n);
        g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
        // (winding: up)
        const I = g.index.array, Pa = g.attributes.position, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
        va.fromBufferAttribute(Pa, I[0]); vb.fromBufferAttribute(Pa, I[1]); vc.fromBufferAttribute(Pa, I[2]);
        if (vb.sub(va).cross(vc.sub(va)).y < 0) for (let i = 0; i < I.length; i += 3) { const q = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = q; }
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g); m.name = `terrain_ledge_${L.i}_${a}`; m.receiveShadow = true;
        m.userData.eid = `route1/ledge/${L.i}/${a}/turf`;
        res.turf.push(m);
      }
      // face (only where it stands: past the ends it is a sliver under the ramp's turf)
      const G = new THREE.Group(); G.name = 'ledge'; G.userData.eid = `route1/ledge/${L.i}/${a}`;
      G.userData.keep = true;   // (not unindexed by town.js mergeStatic: cellMerge joins it by cell)
      G.userData.qa = { k: 'ground', why: 'a Route 1 ledge: an earth face laid on the ground\'s step, one-sided like the ground' };
      const cols = ecols.slice(a, b + 1), Rr = cols[0].length;
      const eg = soilBands(faceOut(grid(cols, Rr), -S[a].ox, -S[a].oz), Rr, (j, r) => LAYER_TILES[cols[j][Math.min(Rr - 1, r + 1)].layer] || LAYER_TILES.gravel);
      // roots out of the loam, hanging
      const st = { pos: [], col: [], idx: [] };
      const geos = [];
      for (let j = a; j < b; j++) {
        const s = S[j], X = secs[j];
        if (X.k < 0.4) continue;
        const side = [s.tx, 0, s.tz], out = [s.ox, 0, s.oz];
        if (R() < 0.33 * X.k) {
          const nr = 1 + Math.floor(R() * 3);
          for (let i = 0; i < nr; i++) {
            const fp = faceAt(j, 0.04 + R() * Math.min(0.2, X.dL)); if (!fp) continue;
            const al = (R() - 0.5) * 0.3, Lr = 0.12 + R() * 0.35, pts = [];
            let p = [fp[0] + side[0] * al, fp[1], fp[2] + side[2] * al];
            pts.push(p);
            for (let q = 1; q <= 4; q++) { p = [p[0] + out[0] * (q < 2 ? 0.05 : 0.01) + (R() - 0.5) * 0.03, p[1] - Lr * 0.25, p[2] + out[2] * (q < 2 ? 0.05 : 0.01) + (R() - 0.5) * 0.03]; pts.push(p); }
            strand(st, pts, 0.014 + R() * 0.01, 0.004, side, ROOT.dark, ROOT.pale, true);
          }
        }
        const rock = new THREE.Color(STONE.bank), tone = new THREE.Color();
        // stones embedded in the clay and gravel
        if (X.Hf > 0.45 && R() < 0.14 * X.k) {
          const dp = lerp(X.dL + 0.1, X.Hf - 0.1, R()), fp = faceAt(j, dp);
          if (fp) {
            const sz = 0.1 + Math.pow(R(), 1.7) * 0.22;
            tone.copy(rock).multiplyScalar(0.86 + R() * 0.2).lerp(EARTH.clay, 0.12);
            const g = boulderGeometry(Math.floor(R() * 1e6), { w: sz * (1.1 + R() * 0.4), h: sz * 0.7, d: sz, kind: R() < 0.4 ? 'slab' : 'boulder', col: tone });
            g.rotateY(R() * 6.28).translate(fp[0] + s.ox * sz * 0.3, fp[1] - sz * 0.35, fp[2] + s.oz * sz * 0.3); geos.push(g);
          }
        }
        // the fringe at the foot: pebbles and a few stones fallen off the face (more under a slump)
        if (X.k > 0.3 && R() < 0.2 * X.k + secs[j].slump * 0.3) {
          const n = 1 + Math.floor(R() * 1.6 + secs[j].slump * 1.5);
          for (let i = 0; i < n; i++) {
            const big = R() < 0.18, sz = big ? 0.2 + R() * 0.16 : 0.06 + R() * 0.1;
            const d = X.rows[X.rows.length - 1][0] - 0.05 + Math.pow(R(), 1.5) * (0.45 + secs[j].slump * 0.3), al = (R() - 0.5) * STEP * 2;
            const [x, z] = s.P(d), gy = height(x + s.tx * al, z + s.tz * al);
            tone.copy(rock).multiplyScalar(0.82 + R() * 0.24).lerp(EARTH.gravel, 0.2);
            const g = boulderGeometry(Math.floor(R() * 1e6), { w: sz * 1.25, h: sz * 0.75, d: sz, kind: big ? 'boulder' : 'pebble', col: tone });
            g.rotateY(R() * 6.28).translate(x + s.tx * al, gy - sz * 0.3, z + s.tz * al); geos.push(g);
          }
        }
        // ferns in a pocket of the face, and at the foot (veg.js sows them)
        if (X.Hf > 0.6 && R() < 0.025 * X.k) { const fp = faceAt(j, X.Hf * (0.4 + R() * 0.3)); if (fp) plants.push({ x: fp[0] - s.ox * 0.12, y: fp[1] - 0.05, z: fp[2] - s.oz * 0.12, s: 0.4 + R() * 0.2 }); }
        if (X.k > 0.5 && R() < 0.06) { const [x, z] = s.P(X.rows[X.rows.length - 1][0] + 0.1); plants.push({ x, y: height(x, z) - 0.02, z, s: 0.45 + R() * 0.25 }); }
      }
      const face = new THREE.Mesh(st.idx.length ? mergeGeometriesSafe([eg, strandGeometry(st, true)]) : eg, earthMat());
      face.name = 'ledge_face'; face.castShadow = false; face.receiveShadow = true; face.userData.outline = false;
      G.add(face);
      if (geos.length) { const m = stoneMesh(mergeAll(geos), { fade: [140, 146] }); m.userData.outline = 'solid'; G.add(m); }
      // (the group stands where its face is)
      const box = new THREE.Box3().setFromBufferAttribute(face.geometry.attributes.position), c = box.getCenter(new THREE.Vector3());
      c.y = box.min.y;
      G.position.copy(c);
      for (const ch of G.children) ch.position.sub(c);
      res.pieces.push(G);
    }
  }
  return res;
}

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const mergeGeometriesSafe = (list) => mergeGeometries(list, false);
