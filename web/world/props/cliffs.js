// Cliff faces along the world's edges (terrain.js edgeRuns): the reusable cliff
// builder. Where the land you can walk on ends, rock shows it: a slab-jointed
// face rising from the grass ('up': the land beyond climbs; terrain.js lifts
// the ground behind the face to its top) or a rocky lip with a layered face
// dropping to the sea or the slope below ('down'). Like the references: big
// flat planes (each slab a cut polytope, stone.js), two or three tiers per
// column with ledges between them (moss and grass on the ledges, from the stone
// paint and veg.js's ferns), strata painted as bands of tone, a few columns
// leaning out or set back, and a talus of broken blocks at the foot. The walk
// grid ends exactly at the line, so the player walks right up to the rock.
//
// buildCliffs(runs, heightAt) -> [Mesh] (stone meshes, merged per 40 m cell by
// town.js mergeStones; userData.barrier = 'cliff' for tools/qa/checks.js).
// buildCliffRun(run, opts) is the builder for one polyline with a height
// profile: run = {kind, pts, n (unit normals toward the far side), cum, foot,
// top, bottom} (per vertex), so other places (a waterfall's lip, a gorge) can
// use it with their own lines.
import * as THREE from 'three';
import { rng } from '../terrain.js';
import { cutGeometry, boulderGeometry, mergeAll, stoneMesh } from '../stone.js';

// the cliff rock: a cool grey with a little warmth, like the meadow
// outcrop; strata tones alternate per tier
export const CLIFF = { rock: '#a9a597', sea: '#a3a497', wet: '#7d7e78' };
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

// One slab (a tier of a column) in the column's frame: x along the line, y
// up, z into the far side. f = its face's z at its foot, lean = how far the
// face leans back (radians), w = width, y0..y1 = foot and top, back = the
// far side's z. dir = +1 for a face toward -z ('up'), -1 toward +z ('down').
function slab(R, { w, y0, y1, f, back, lean, dir, col, tilt = 0.08, seed, yaw = 0, diag = 0, facets = true }) {
  const P = [];
  const sl = Math.sin(lean), cl = Math.cos(lean);
  // the face (toward -z for dir 1): n = (0, sin, -cos) * dir in z
  const fn = unit(Math.sin(yaw) * cl + (R() - 0.5) * 0.1, sl, -Math.cos(yaw) * cl * dir);
  P.push([...fn, fn[1] * y0 + fn[2] * f]);
  // the back, buried
  P.push([0, 0, dir, dir * back]);
  // the sides, each turned a little (joints are never quite square)
  for (const sx of [-1, 1]) { const a = (R() - 0.5) * 0.22, n = [sx * Math.cos(a), 0, Math.sin(a)]; P.push([...n, w / 2 * Math.cos(a) + 0.05 + n[2] * ((f + back) / 2)]); }
  // the foot and the top (tilted a touch: ledges are never level)
  P.push([0, -1, 0, -y0]);
  const tn = unit((R() - 0.5) * tilt * 2, 1, (R() - 0.5) * tilt * 2 + 0.05 * dir);
  P.push([...tn, tn[1] * y1 + tn[2] * (f + 0.5 * dir)]);
  // one or two big facets across the face's corners (the anime's flat planes)
  const nf = facets ? (R() < 0.35 ? 2 : 1) : 0;
  for (let k = 0; k < nf + (diag ? 1 : 0); k++) {
    const sx = R() < 0.5 ? -1 : 1, up = R() < 0.6 ? 1 : -1;
    // (diag: one big slanting plane across the face, the slab-jointed look)
    const n = k === nf ? unit(sx * (0.7 + R() * 0.5), 0.35 + R() * 0.4, -dir * (0.5 + R() * 0.3)) : unit(sx * (0.5 + R() * 0.7), up * (0.15 + R() * 0.5), -dir * (0.8 + R() * 0.4));
    // through a point set in from the corner
    const cx = sx * w / 2, cy = up > 0 ? y1 : y0, cz = f + (cy - y0) * Math.tan(lean) * dir;
    const inset = k === nf ? 0.6 + R() * Math.min(w, y1 - y0) * 0.35 : 0.25 + R() * 0.45;
    P.push([...n, n[0] * (cx - sx * inset) + n[1] * (cy - up * inset * 0.8) + n[2] * cz]);
  }
  // rounded rims only on the edges you see (the face and its top)
  const only = (p) => p[2] * dir < -0.3 || p[1] > 0.7;
  return cutGeometry(P, { seed, col, bevel: Math.min(0.14, w * 0.05), only, ao: false });
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3();
// a frame at (x, y, z): x along t, z along n (horizontal unit vectors)
const frame = (x, y, z, tx, tz, nx, nz) => _m.set(tx, 0, nx, x, 0, 1, 0, y, tz, 0, nz, z, 0, 0, 0, 1);

// One run: its slabs and talus as geometries (world space)
export function buildCliffRun(run, { seed = 1, heightAt, col = CLIFF.rock, wet = null, notch = null, faces = null } = {}) {
  const R = rng(seed * 977 + 31);
  const geos = [], N = run.pts.length, dir = run.kind === 'down' ? -1 : 1;
  const at = (u) => {
    // vertex index and blend at arc length u
    let i = Math.min(N - 2, Math.max(0, Math.floor(u)));
    while (i > 0 && run.cum[i] > u) i--;
    while (i < N - 2 && run.cum[i + 1] < u) i++;
    const t = Math.min(1, Math.max(0, (u - run.cum[i]) / Math.max(1e-6, run.cum[i + 1] - run.cum[i])));
    const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
    const nx = run.n[i][0] * (1 - t) + run.n[i + 1][0] * t, nz = run.n[i][1] * (1 - t) + run.n[i + 1][1] * t, nl = Math.hypot(nx, nz) || 1;
    return { x: run.pts[i][0] + (run.pts[i + 1][0] - run.pts[i][0]) * t, z: run.pts[i][1] + (run.pts[i + 1][1] - run.pts[i][1]) * t, nx: nx / nl, nz: nz / nl,
      foot: L(run.foot), top: L(run.top), bottom: L(run.bottom) };
  };
  const base = new THREE.Color(col), tone = new THREE.Color();
  // strata: a band tone per height, shared along the run (layers read across columns)
  const bandK = (y) => { const b = Math.floor((y + 40) / 1.7); return 0.9 + ((b * 7919) % 5) / 5 * 0.16; };
  let u = 0.2;
  while (u < run.len - 0.4) {
    let w = Math.min(run.len - u, dir > 0 ? 2.0 + R() * 2.8 : 1.6 + R() * 2.2);
    // (narrow columns round a waterfall, so its notch is only as wide as the water)
    if (notch) { const p0 = at(u + 0.5); if (notch(p0.x, p0.z, 3.5)) w = Math.min(w, 1.1 + R() * 0.6); }
    if (w < 0.6) break;
    const c = at(u + w / 2), tx = c.nz, tz = -c.nx;   // (along the line: n turned a quarter)
    const wetK = wet ? wet(c.x, c.z) : 0;
    const F = notch ? notch(c.x, c.z, 0) : null;
    if (dir > 0) {
      // ----- a rising face: tiers from below the grass up past the top -----
      // (columns stand higher or lower than the ground's top: a jagged
      // skyline, grassy shelves where one stops short)
      let y1 = Math.max(c.top + (R() - 0.3) * 1.5, c.foot + 1.6);
      const y0 = c.foot - 0.9;
      // under a waterfall: the rock cut down below its lip and set back (the
      // water falls clear of it, down a dark wet cleft)
      if (F) y1 = Math.min(y1, F.top - 0.25);
      // beside a waterfall: plain upright faces flush with each other, for the
      // curtains of ivy and vines that hang there (town.js fallPlants)
      const side = !F && notch && notch(c.x, c.z, 4.6);
      if (side) y1 = c.top + 0.1;
      let y = y0, f = side ? 0.45 : 0.38 + R() * 0.5 + (F ? 0.85 : 0), k = 0;
      // (and the columns either side of those stand square to the line, set
      // no further forward, so none juts across the ivy)
      const calm = !F && notch && notch(c.x, c.z, 8);
      if (calm && !side) f = Math.max(f, 0.5);
      const lean = side ? 0.0 : 0.03 + R() * 0.09, yaw = side || calm ? 0 : (R() - 0.5) * 0.3, diag = !side && R() < 0.55;
      while (y < y1 - 0.3) {
        const h = Math.min(y1 - y, (k === 0 ? 1.6 : 1.8) + R() * 2.2);
        const top = y + h < y1 - 0.5 ? y + h : y1;
        const yb = k === 0 ? y : y - 0.05;
        tone.copy(base).multiplyScalar(bandK((yb + top) / 2) * (0.96 + R() * 0.08));
        if (wetK > 0) tone.lerp(new THREE.Color(CLIFF.wet), wetK);
        const g = slab(R, { w: w + 0.55, y0: yb - c.foot, y1: top - c.foot, f, back: 4.4 + R() * 0.8, lean: side ? 0 : lean + (R() - 0.5) * 0.06, dir: 1, col: tone, seed: Math.floor(R() * 1e6), yaw: side || calm ? 0 : yaw + (R() - 0.5) * 0.15, diag: diag && R() < 0.7, facets: !side });
        frame(c.x, c.foot, c.z, tx, tz, c.nx, c.nz);
        g.applyMatrix4(_m); geos.push(g);
        // the next tier steps back (a ledge) or now and then out a little
        f += side ? 0 : (top - yb) * Math.tan(lean) + (R() < 0.75 ? 0.05 + R() * 0.2 : -0.06);
        f = Math.max(0.35, f);
        y = top; k++;
      }
      // (a plain face beside a fall: where town.js hangs its ivy)
      const ca = at(Math.max(0, u - 2.5)), cb = at(Math.min(run.len, u + w + 2.5));   // (only where the line runs straight: on a bend the next column juts across)
      if (side && faces && ca.nx * cb.nx + ca.nz * cb.nz > 0.97) faces.push({ x: c.x + c.nx * 0.45, z: c.z + c.nz * 0.45, nx: c.nx, nz: c.nz, w, y0: c.foot, y1 });
      // talus: broken blocks heaped at the foot, the big ones against the face
      const nTal = side || calm ? 0 : 1 + Math.floor(R() * 3);
      for (let j = 0; j < nTal; j++) {
        const big = R() < 0.35, s = big ? 0.55 + R() * 0.55 : 0.22 + R() * 0.3;
        const along = (R() - 0.5) * w, off = big ? 0.55 + s * 0.6 + R() * 0.3 : 0.3 + s * 0.5 + R() * 0.25;
        const px = c.x + tx * along + c.nx * off, pz = c.z + tz * along + c.nz * off;
        const gy = heightAt ? heightAt(px - c.nx * 0.3, pz - c.nz * 0.3) : c.foot;
        tone.copy(base).multiplyScalar(0.86 + R() * 0.1);
        const g = boulderGeometry(Math.floor(R() * 1e6), { w: s * 1.3, h: s * (big ? 0.9 : 0.7), d: s, kind: R() < 0.5 ? 'slab' : 'boulder', col: tone });
        g.rotateY(R() * 6.28).translate(px, Math.min(gy, c.foot) - s * 0.12, pz);
        geos.push(g);
      }
    } else {
      // ----- a lip and a face dropping away: a rim stone on top, layered
      // tiers stepping out as they go down, boulders at the bottom -----
      const yTop = c.foot + 0.3 + R() * 0.3, yBot = Math.min(c.bottom, c.foot - 1.5) - 0.6;
      let y = yTop, f = 1.0 + R() * 0.35, k = 0;
      const lean = 0.04 + R() * 0.12;
      while (y > yBot + 0.2) {
        const h = Math.min(y - yBot, (k === 0 ? 1.0 : 1.4) + R() * 1.8);
        const lo = y - h > yBot + 0.5 ? y - h : yBot;
        tone.copy(base).multiplyScalar(bandK((y + lo) / 2) * (0.96 + R() * 0.08));
        if (wetK > 0) tone.lerp(new THREE.Color(CLIFF.wet), wetK);
        const g = slab(R, { w: w + 0.06, y0: lo - c.foot, y1: y - c.foot + (k ? 0.05 : 0), f, back: 0.36 + R() * 0.05, lean, dir: -1, col: tone, seed: Math.floor(R() * 1e6), yaw: (R() - 0.5) * 0.4, diag: R() < 0.4 });
        frame(c.x, c.foot, c.z, tx, tz, c.nx, c.nz);
        g.applyMatrix4(_m); geos.push(g);
        f += R() < 0.7 ? 0.15 + R() * 0.5 : -0.05;
        y = lo; k++;
      }
      // boulders where the face meets the sea or the slope
      if (R() < 0.7) {
        const s = 0.5 + R() * 1.1, along = (R() - 0.5) * w, off = f + s * 0.4 + R() * 0.8;
        const px = c.x + tx * along + c.nx * off, pz = c.z + tz * along + c.nz * off;
        const gy = heightAt ? heightAt(px, pz) : yBot;
        tone.copy(base).multiplyScalar(0.84 + R() * 0.1);
        const g = boulderGeometry(Math.floor(R() * 1e6), { w: s * 1.3, h: s * 0.85, d: s, col: tone });
        g.rotateY(R() * 6.28).translate(px, gy - s * 0.25, pz);
        geos.push(g);
      }
    }
    u += w;
  }
  return geos;
}

// Every edge run as stone meshes (one per run piece; town.js merges them by cell)
export function buildCliffs(runs, { heightAt, wet, notch } = {}) {
  const out = [];
  out.faces = [];   // the plain faces beside the falls (their ivy)
  for (const run of runs) {
    const geos = buildCliffRun(run, { seed: run.id + 1, heightAt, col: run.kind === 'down' ? CLIFF.sea : CLIFF.rock, wet, notch, faces: out.faces });
    // in pieces of ~30 m so each mesh stays local (culling, the region packs)
    for (let i = 0; i < geos.length; i += 36) {
      const m = stoneMesh(mergeAll(geos.slice(i, i + 36)), { fade: [320, 330] });
      m.userData.barrier = 'cliff';
      m.userData.outline = 'solid';
      m.userData.eid = `edges/cliff/${run.id}/${i / 36}`;
      m.name = 'cliff';
      out.push(m);
    }
  }
  return out;
}
