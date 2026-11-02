// Turf rolling over a wall's top: wherever the ground behind a stone wall
// comes up to (or close under) its top and the other side drops away (a
// retaining wall: the lab hill's foot, the lanes' cuttings, the harbour front,
// Route 1's banked walls), the lawn does not stop short of the cap with a
// step or a gap: the turf rises out of the ground behind, swells over the cap
// as a rounded sod cushion (the mossy-shelf look) and rolls over the wall's
// front edge, overhanging the face, with the fluffy grass lip along its brim
// (grasslip.js) and, on some stretches (seeded), ivy climbing the face from
// the ground or vines hanging down from the sod.
//
// turfOverWalls(walls, o) -> { turf: [Mesh] (ground: main.js joins them to
// the terrain, in its material), plants: Group (ivy and vines) }.
// walls: [{ runs (stone.js wallMeshes userData.wallRuns: a, b, t, top(u)), M
// (their parent's world matrix) }]; o: { height, groundColor, blocked(x, z)
// (a house, a deck, a path: no turf there), seed }.
// The wall's meshes and colliders are left as they are (tools/qa wallx).
import * as THREE from 'three';
import { rng, fbm } from '../terrain.js';
import { lipAlong } from '../grasslip.js';
import * as OD from './outdoor.js';

// how far the turf lifts the ground at (x, z) (0.25 m cells): tools/native/bake.mjs
// adds it to the walk grid, main.js to the ground the player stands on
const LIFT = new Map();
export function turfLift(x, z) {
  if (!LIFT.size) return 0;
  const i = Math.round(x * 4), j = Math.round(z * 4), c = LIFT.get(i + ',' + j);
  if (c !== undefined) return c;
  // (the samples are about a cell apart: a gap takes its neighbours' lift)
  let m = 0, n = 0;
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = LIFT.get((i + a) + ',' + (j + b)); if (v !== undefined) { m += v; n++; } }
  return n >= 2 ? m / n : 0;
}
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function turfOverWalls(walls, { height, groundColor, blocked = () => false, seed = 4400 }) {
  const out = { turf: [], plants: new THREE.Group(), stretches: 0, metres: 0, list: [] };
  out.plants.name = 'wall_turf_plants'; out.plants.userData.eid = 'town/wallturf/plants';
  const R = rng(seed), tmp = new THREE.Color(), v = new THREE.Vector3();
  let wid = 0;
  for (const { runs, M } of walls) for (const r of runs) {
    wid++;
    const ax = r.a[0], az = r.a[1], L = Math.hypot(r.b[0] - ax, r.b[1] - az);
    if (L < 1.2) continue;
    const t = r.t || 0.7, dx = (r.b[0] - ax) / L, dz = (r.b[1] - az) / L;
    // world space (walls are only moved and turned)
    const W = (u, off, y) => { v.set(ax + dx * u - dz * off, y, az + dz * u + dx * off).applyMatrix4(M); return [v.x, v.y, v.z]; };
    const oy = W(0, 0, 0)[1];
    const nW = (() => { const p0 = W(0, 0, 0), p1 = W(0, 1, 0); return [p1[0] - p0[0], p1[2] - p0[2]]; })();   // the left side, world
    for (const side of [1, -1]) {
      // samples every 0.25 m: does the earth come up behind this side?
      const S = [];
      for (let u = 0.15; u <= L - 0.15 + 1e-6; u += 0.25) {
        const top = r.top(u) + oy;
        const [bx, , bz] = W(u, side * (t / 2 + 0.45), 0), [cx, , cz] = W(u, side * (t / 2 + 1.1), 0), [fx, , fz] = W(u, -side * (t / 2 + 0.5), 0);
        const gb = Math.max(height(bx, bz), height(cx, cz)), gf = height(fx, fz);
        const ok = top - gb < 0.85 && top - gb > -0.25 && top - gf > Math.max(0.55, top - gb + 0.3) && !blocked(bx, bz) && !blocked(cx, cz);
        S.push({ u, top, gb, gf, ok });
      }
      // stretches of 1.5 m or more (short gaps closed)
      for (let i = 1; i < S.length - 1; i++) if (!S[i].ok && S[i - 1].ok && S[i + 1].ok) S[i].ok = true;
      let a = -1;
      const flush = (e) => {
        if (a >= 0 && e - a >= 5) build(S.slice(a, e + 1), side);
        a = -1;
      };
      for (let i = 0; i < S.length; i++) { if (S[i].ok) { if (a < 0) a = i; } else flush(i - 1); }
      flush(S.length - 1);
    }
    function build(S, side) {
      out.stretches++; out.metres += S[S.length - 1].u - S[0].u;
      { const m = S[S.length >> 1], [x, , z] = W(m.u, 0, 0); out.list.push([+x.toFixed(1), +z.toFixed(1), +(-nW[0] * side).toFixed(2), +(-nW[1] * side).toFixed(2), +m.top.toFixed(2), +m.gf.toFixed(2), +(S[S.length - 1].u - S[0].u).toFixed(1)]); }
      const n = S.length, rows = [], up = [0, 1, 0];
      const outW = [-nW[0] * side, -nW[1] * side];   // out over the face, world
      const lipS = [];
      const sid = wid * 31 + (side > 0 ? 7 : 3);
      const gAtU = (u, off) => { const [x, , z] = W(u, side * off, 0); return height(x, z); };
      const gAt0 = (u) => gAtU(u, t / 2 + 0.45);
      for (let j = 0; j < n; j++) {
        const s = S[j], e = Math.min(j, n - 1 - j) / 3;   // the ends taper in over 0.75 m
        const k = sm(0, 1, e);
        const [wx, , wz] = W(s.u, 0, 0);
        const n1 = fbm(wx * 0.6 + 3.1, wz * 0.6 - 1.7, 2), n2 = fbm(wx * 0.23 - 5, wz * 0.23 + 2, 2);
        const bul = (0.05 + 0.07 * n1) * k, ov = (0.07 + 0.16 * n2) * k, lipT = 0.1 + 0.08 * n1;
        const top = s.top;
        // the ground behind rises to the top over a run that grows with the gap
        // (a gentle swell, never a step: the walk grid follows it, turfLift)
        const gap = Math.max(0, top - gAt0(s.u)), B = t / 2 + 0.7 + gap * 2.0, ramp = [0, 0.35, 0.62, 0.85];
        // across the wall from the back (the earth behind) to the front's overhang: [off, y, kind]
        const gAt = (off) => gAtU(s.u, off);
        const prof = [
          ...ramp.map((f) => { const off = lerp(B, t / 2, f); const g0 = gAt(off); return [off, f === 0 ? g0 - 0.05 : Math.max(g0 + 0.02, lerp(g0, top + bul * 0.6, sm(0, 1, f) * (0.35 + 0.65 * k))), f === 0 ? 0 : 1]; }),
          [t / 2 * 0.3, top + bul, 2],
          [-t / 2 * 0.55, top + bul * 0.75, 2],
          [-(t / 2 + ov * 0.55), top + bul * 0.2 - 0.02, 3],
          [-(t / 2 + ov), top - lipT * 0.45, 4],
          [-(t / 2 + ov * 0.8), top - lipT * 0.82, 4],
          [-(t / 2 - 0.03), top - lipT, 5],
        ];
        // (at the ends the sod sinks into the cap)
        if (k < 1) for (const p of prof) if (p[2] >= 2) p[1] = lerp(top - 0.06, p[1], k);
        rows.push(prof.map(([off, y, kind]) => {
          const [x, , z] = W(s.u, side * off, 0);
          let c, nrm;
          groundColor(x, z, y, 0.02, tmp);
          if (kind <= 1) { c = tmp.clone(); nrm = up; }
          else {
            c = tmp.clone().multiplyScalar(kind === 5 ? 0.58 : kind === 4 ? 0.8 : kind === 3 ? 0.93 : 1);
            // (the front kept under ~33 degrees for the ground's shader: grass, not its bare earth)
            const kk = kind === 2 ? 0.08 : 0.38;
            nrm = kind === 5 ? [outW[0] * 0.6, -0.8, outW[1] * 0.6] : [lerp(0, outW[0], kk), lerp(1, 0, kk), lerp(0, outW[1], kk)];
          }
          const l = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
          return { p: [x, y, z], c, n: [nrm[0] / l, nrm[1] / l, nrm[2] / l] };
        }));
        // how far the sod lifts the ground behind (for the walk grid)
        for (let r2 = 0; r2 + 1 < prof.length && prof[r2 + 1][0] > t / 2 + 0.05; r2++) {
          const [o0, y0] = prof[r2], [o1, y1] = prof[r2 + 1];
          for (let f = 0; f <= 1; f += 0.125) {
            const off = lerp(o0, o1, f), [x, , z] = W(s.u, side * off, 0), d = lerp(y0, y1, f) - height(x, z);
            if (d > 0.03) { const key = Math.round(x * 4) + ',' + Math.round(z * 4); LIFT.set(key, Math.max(LIFT.get(key) || 0, d)); }
          }
        }
        const [lx, , lz] = W(s.u, -side * (t / 2 + ov * 0.5), 0);
        lipS.push({ x: lx, y: top + bul * 0.35, z: lz, nx: outW[0], nz: outW[1], k: k * (0.75 + 0.25 * n2), fy: top, gf: s.gf, u: s.u });
      }
      // the mesh: rows x columns, facing up
      const C = rows[0].length, pos = [], nrm = [], col = [], uv = [], idx = [];
      for (const row of rows) for (const q of row) { pos.push(...q.p); nrm.push(...q.n); col.push(q.c.r, q.c.g, q.c.b); uv.push(q.p[0] / 4, q.p[2] / 4); }
      for (let j = 0; j < n - 1; j++) for (let c = 0; c < C - 1; c++) {
        const p = j * C + c, q = p + C;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
      // (winding: up)
      const P = (i) => pos.slice(i * 3, i * 3 + 3);
      const [A, B, D] = [P(idx[0]), P(idx[1]), P(idx[2])];
      const cy = (B[2] - A[2]) * (D[0] - A[0]) - (B[0] - A[0]) * (D[2] - A[2]);
      if (cy < 0) for (let i = 0; i < idx.length; i += 3) { const q = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = q; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g);
      m.name = 'terrain_wallturf'; m.receiveShadow = true;
      m.userData.eid = `town/wallturf/${wid}/${side > 0 ? 'l' : 'r'}`;
      out.turf.push(m);
      // the grass lip along the brim, a few tufts in the face's joints
      const fa = (smp, dep) => { const y = smp.fy - 0.2 - dep; if (y < smp.gf + 0.15) return null; const [x, , z] = W(smp.u, -side * (t / 2 + 0.02), 0); return [x, y, z]; };
      lipAlong(lipS, { seed: sid, face: fa, faceMax: 1.0 });
      // ivy: some stretches (seeded), climbing from the foot, or hanging from the sod
      const len = S[n - 1].u - S[0].u, mid = S[Math.floor(n / 2)];
      const faceH = mid.top - mid.gf;
      const ry = Math.atan2(outW[0], outW[1]);
      if (R() < 0.45 && faceH > 0.6) {
        const k = 1 + Math.floor(R() * Math.min(3, len / 3));
        for (let i = 0; i < k; i++) {
          const s = S[Math.floor((i + 0.2 + R() * 0.6) / k * (n - 1))];
          const w = Math.min(len / k, 1.0 + R() * 1.6), h = Math.max(0.4, Math.min(s.top - s.gf - 0.32, (s.top - s.gf) * (0.45 + R() * 0.55)));   // (under the sod's overhang)
          const [x, , z] = W(s.u, -side * (t / 2 + 0.12), 0);
          const iv = OD.ivy(out.plants, w, h, x, s.gf - 0.08, z, ry, sid * 13 + i * 7, 11);
          iv.userData.eid = `town/wallturf/${wid}/ivy${side > 0 ? 'l' : 'r'}${i}`;
        }
      }
      if (R() < 0.35 && faceH > 0.8) {
        const s0 = S[Math.floor(R() * n * 0.5)], s1 = S[Math.min(n - 1, Math.floor(n * 0.5 + R() * n * 0.5))];
        const a = new THREE.Vector3(...W(s0.u, -side * (t / 2 + 0.06), s0.top - oy - 0.06)), b = new THREE.Vector3(...W(s1.u, -side * (t / 2 + 0.06), s1.top - oy - 0.06));
        const vn = OD.vines(out.plants, a, b, 2 + Math.floor(R() * 3), Math.min(faceH * 0.8, 0.6 + R() * 1.0), sid * 17 + 3);
        vn.userData.eid = `town/wallturf/${wid}/vines${side > 0 ? 'l' : 'r'}`;
      }
    }
  }
  return out;
}
