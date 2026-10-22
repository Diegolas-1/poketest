// Map blueprints, format "pallet-map" version 1: a simplified 3D top-down
// description of one SPACE (Oak's lab today; later the houses, the routes and
// the town itself at a coarse level). A blueprint is authoring data only.
// Everything a renderer or the game needs is derived from it by compile():
// the walk grid of each level, colliders, interactions, portals, camera
// volumes, lights, the plan drawing (maps/plan.js) and the block model
// (maps/blocks.js). No three.js here: the browser, Node tools and the native
// bake all read it.
//
// FRAME  metres. x east, z south (north = -z = the top of a plan), y up.
//   rot = degrees about +y; 0 = the thing's front faces +z (south), 90 = +x
//   (east), 180 = north, 270 = west. (three.js rotation.y in degrees.)
//   `grid` is the authoring snap (the validator warns about stray values).
//
// TOP LEVEL
//   format 'pallet-map', version 1, id, name, kind 'interior' | 'exterior' | 'region'
//   grid      snap (m)                      bounds [x0, z0, x1, z1]
//   place     {map, at:[x,z], y, rot}  where this space sits on its parent map
//             (the world-map overlay; local (0,0) lands on `at`)
//   palette   {matId: {color, label, pattern?}}  every material a zone, wall,
//             ceiling, slab, run or stair names (the plan's colours come from here)
//   levels    [{id, name, y}]  floor heights, low to high
//   zones     [{id, name, level, poly:[[x,z]...], floor, ceiling, walk, tags}]
//             walkable areas with a floor material; ceiling:
//               {type:'vault', axis:'x'|'z', spring, rise, ribs (spacing), mat}
//               {type:'flat', h, mat, lights?}   {type:'open'} (under another
//               zone's ceiling)   {type:'sky'} (outdoors)
//             walk:false = a floor nobody walks on (a pit, a stage)
//   walls     [{id, level, path:[[x,z]...] (centre line), t, h, mat,
//               gable?:{rise, axis} (a wall end-on to a vault: the top follows it),
//               wainscot?:{h, mat}, trim?, openings:[...]}]
//             opening {id?, type:'door'|'window'|'arch'|'opening', seg (index of
//               the path segment, default 0), at (distance along that segment
//               to the opening's middle), w, h, sill, style, outside?, portal?}
//               door / arch / opening without sill are walk-through unless
//               `locked`; window styles: 'plain' | 'arched' | 'round' | 'blinds'
//   slabs     [{id, level, poly, t, mat, under?, columns?:[[x,z]...]}]   a floor
//             standing over a lower one (a mezzanine): walkable on its own
//             level; columns hold it up (colliders on the levels below)
//   stairs    [{id, from, to, a:[x,z], b:[x,z], w, steps, style, rails}]  the
//             foot a is on level `from`, the head b on level `to`
//   rails     [{id, level, path, h, style}] railings: block walking
//   runs      [{id, type:'pipe'|'cable'|'beam', pts:[[x,y,z]...], r, mat}]
//             linear fixtures (absolute y)
//   props     [{id, type (props/catalog.js), pos:[x,z], rot, level, y?, mount?,
//               params?, walk?:'block'|'free', use?:{label, lines|dialogue} | false,
//               tags?}]   y: above the level for floor/top props, the middle of a
//               wall prop, the ceiling a hanging prop hangs from
//   actors    [{id, look, name, pos, rot, level, pose:'stand'|'sit', dialogue | lines}]
//             people who live here (the cast's looks)
//   dialogue  {id: [lines]}
//   spawns    [{id, pos, level, rot}]
//   portals   [{id, level, rect:[x0,z0,x1,z1], trigger:'walk'|'use', spawn
//               (where you arrive here), to:{map, spawn}, label?}]
//   lights    {key:{dir:[x,y,z], shadow, dist}, palette:{bands, deep, shade, lit,
//               litAdd}, bg, lamps:[{id, pos:[x,y,z], r, color, kind}]}
//   camera    {default:{dist, pitch, fov, height}, margin, volumes:[{id,
//               box:[x0,y0,z0,x1,y1,z1], vault?:{axis, spring, rise}, dist?,
//               pitch?, fov?}]}  the camera stays inside the union of the
//               volumes (so it never passes a wall, the ceiling or a slab);
//               the first volume holding the player picks the framing
//
// COMPILED SPACE (compile(bp, catalog))
//   {id, name, levels, grid:{x0, z0, res, nx, nz}, walk:[{level, y, h (base64
//    int16 cm), f (base64 uint8 flags)}], colliders:[[level, kind, ...]],
//    uses, portals, spawns, actors, camera, lights, props, place}
//   flags: 1 OPEN floor, 2 STAIR (shared by both levels it joins), 4 PROP under
//   a blocking prop, 8 WALL, 16 RAIL, 32 PORTAL
//   collider [levelIndex, 1, x, z, hw, hd, rot (radians)] box, [levelIndex, 0, x, z, r] circle

export const FORMAT = 'pallet-map';
export const VERSION = 1;
export const F = { OPEN: 1, STAIR: 2, PROP: 4, WALL: 8, RAIL: 16, PORTAL: 32 };
const RES = 0.25;
const D2R = Math.PI / 180;

// ---------- geometry ----------
const inPoly = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const area = (poly) => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]); return a / 2; };
const segX = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
const selfCross = (poly) => {
  const n = poly.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segX(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
  }
  return false;
};
// a rotated box as [cx, cz, hw, hd, rot]: is (x, z) inside (grown by g)?
const inBox = (b, x, z, g = 0) => {
  const dx = x - b[0], dz = z - b[1], c = Math.cos(b[4]), s = Math.sin(b[4]);
  return Math.abs(dx * c - dz * s) <= b[2] + g && Math.abs(dx * s + dz * c) <= b[3] + g;
};
const boxCorners = (b) => {
  const c = Math.cos(b[4]), s = Math.sin(b[4]), out = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = u * b[2], lz = v * b[3]; out.push([b[0] + lx * c + lz * s, b[1] - lx * s + lz * c]); }
  return out;
};
// separating axes: do two rotated boxes overlap (by more than eps)?
const boxesOverlap = (A, B, eps = 0.02) => {
  const pa = boxCorners(A), pb = boxCorners(B);
  for (const P of [pa, pb]) for (let i = 0; i < 4; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 4], ax = -(z1 - z0), az = x1 - x0, l = Math.hypot(ax, az);
    const pr = (Q) => Q.map(([x, z]) => (x * ax + z * az) / l);
    const ra = pr(pa), rb = pr(pb);
    if (Math.max(...ra) - eps <= Math.min(...rb) || Math.max(...rb) - eps <= Math.min(...ra)) return false;
  }
  return true;
};
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// the footprint box of a prop [cx, cz, hw, hd, rot]
export function propBox(p, cat) {
  const c = cat[p.type] || { size: [1, 1, 1] };
  const s = (p.params && p.params.size3) || c.size, k = (p.params && p.params.scale) || 1;
  return [p.pos[0], p.pos[1], s[0] * k / 2, s[1] * k / 2, (p.rot || 0) * D2R];
}
export const propMount = (p, cat) => p.mount || (cat[p.type] && cat[p.type].mount) || 'floor';
export const propWalk = (p, cat) => p.walk || (cat[p.type] && cat[p.type].walk) || (propMount(p, cat) === 'floor' ? 'block' : 'free');
export const propShape = (p, cat) => (cat[p.type] && cat[p.type].shape) || 'box';

// wall segments with their openings: [{wall, i, a, b, len, dir:[ux,uz], openings}]
export function wallSegments(w) {
  const out = [];
  for (let i = 0; i + 1 < w.path.length; i++) {
    const a = w.path[i], b = w.path[i + 1], len = segLen(a, b);
    out.push({ wall: w, i, a, b, len, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], openings: (w.openings || []).filter((o) => (o.seg || 0) === i) });
  }
  return out;
}
// can you walk through this opening?
export const passable = (o) => ['door', 'arch', 'opening'].includes(o.type) && !(o.sill > 0) && !o.locked && (o.type !== 'door' || !!o.portal || o.open);
// the height of a wall's top at a point along it (gable walls follow their vault)
export function wallTop(w, x, z) {
  if (!w.gable) return w.h;
  const g = w.gable, half = g.half, c = g.axis === 'x' ? x - g.c : z - g.c;
  return w.h + g.rise * Math.sqrt(Math.max(0, 1 - (c / half) ** 2));
}

const levelIndex = (bp) => Object.fromEntries(bp.levels.map((l, i) => [l.id, i]));

// ---------- compile ----------
export function compile(bp, cat) {
  const LI = levelIndex(bp), LY = bp.levels.map((l) => l.y);
  const [bx0, bz0, bx1, bz1] = bp.bounds;
  const nx = Math.ceil((bx1 - bx0) / RES), nz = Math.ceil((bz1 - bz0) / RES);
  const N = nx * nz, NL = bp.levels.length;
  const H = bp.levels.map((l) => new Int16Array(N).fill(Math.round(l.y * 100)));
  const FL = bp.levels.map(() => new Uint8Array(N));
  const col = [];
  const cx = (i) => bx0 + (i + 0.5) * RES, cz = (j) => bz0 + (j + 0.5) * RES;
  const each = (fn) => { for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) fn(j * nx + i, cx(i), cz(j)); };
  // floors
  for (const z of bp.zones) if (z.walk !== false) { const L = LI[z.level]; each((k, x, zz) => { if (inPoly(z.poly, x, zz)) FL[L][k] |= F.OPEN; }); }
  for (const s of bp.slabs || []) { const L = LI[s.level]; each((k, x, zz) => { if (inPoly(s.poly, x, zz)) FL[L][k] |= F.OPEN; }); }
  // columns holding up slabs: round colliders on the levels below the slab
  for (const s of bp.slabs || []) for (const c of s.columns || []) {
    const ys = LY[LI[s.level]];
    bp.levels.forEach((l, L) => { if (l.y < ys) col.push([L, 0, c[0], c[1], 0.14]); });
  }
  // stairs: open on both levels, height by step
  const stairOf = [];
  for (const st of bp.stairs || []) {
    const L0 = LI[st.from], L1 = LI[st.to], y0 = LY[L0], y1 = LY[L1], len = segLen(st.a, st.b);
    const ux = (st.b[0] - st.a[0]) / len, uz = (st.b[1] - st.a[1]) / len, n = st.steps;
    stairOf.push({ st, L0, L1 });
    each((k, x, zz) => {
      const dx = x - st.a[0], dz = zz - st.a[1], t = dx * ux + dz * uz, sd = -dx * uz + dz * ux;
      if (t < 0 || t > len || Math.abs(sd) > st.w / 2) return;
      // tread i (0 = the first above the floor) rises (i + 1) / n of the way
      const i = Math.min(n - 1, Math.floor((t / len) * n));
      const y = y0 + ((i + 1) / n) * (y1 - y0);
      const hh = Math.round(Math.min(y1, y) * 100);
      for (const L of [L0, L1]) { H[L][k] = hh; FL[L][k] |= F.OPEN | F.STAIR; }
    });
  }
  // colliders
  const boxCol = (L, b) => col.push([L, 1, ...b.map((v) => +v.toFixed(4))]);
  // walls: a box per stretch between walkable openings, on every level it reaches
  for (const w of bp.walls) {
    const L0 = LI[w.level], top = LY[L0] + w.h + (w.gable ? w.gable.rise : 0);
    const levels = bp.levels.map((l, i) => i).filter((i) => LY[i] >= LY[L0] && LY[i] < top - 0.5);
    for (const sg of wallSegments(w)) {
      const cuts = sg.openings.filter(passable).map((o) => [o.at - o.w / 2, o.at + o.w / 2]).sort((a, b) => a[0] - b[0]);
      let s0 = -w.t / 2;
      const pieces = [];
      for (const [c0, c1] of cuts) { if (c0 > s0) pieces.push([s0, c0]); s0 = c1; }
      if (sg.len + w.t / 2 > s0) pieces.push([s0, sg.len + w.t / 2]);
      for (const [p0, p1] of pieces) {
        const m = (p0 + p1) / 2, b = [sg.a[0] + sg.dir[0] * m, sg.a[1] + sg.dir[1] * m, (p1 - p0) / 2, w.t / 2, Math.atan2(sg.dir[1], sg.dir[0]) * -1];
        for (const L of levels) {
          boxCol(L, b);
          each((k, x, zz) => { if (inBox(b, x, zz)) FL[L][k] |= F.WALL; });
        }
      }
    }
  }
  // rails
  for (const r of bp.rails || []) {
    const L = LI[r.level];
    for (let i = 0; i + 1 < r.path.length; i++) {
      const a = r.path[i], b2 = r.path[i + 1], len = segLen(a, b2), d = [(b2[0] - a[0]) / len, (b2[1] - a[1]) / len];
      const b = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, len / 2 + 0.03, 0.06, -Math.atan2(d[1], d[0])];
      boxCol(L, b);
      each((k, x, zz) => { if (inBox(b, x, zz, 0.06)) FL[L][k] |= F.RAIL; });
    }
  }
  // stair sides (a rail on each open side) are listed in stairs[].rails: 'l'|'r'|'both'|'none'
  for (const { st, L0, L1 } of stairOf) {
    const len = segLen(st.a, st.b), ux = (st.b[0] - st.a[0]) / len, uz = (st.b[1] - st.a[1]) / len;
    const sides = st.rails === 'both' ? [-1, 1] : st.rails === 'l' ? [-1] : st.rails === 'r' ? [1] : [];
    for (const sd of sides) {
      // sd -1 = the left side going up (north when climbing east), +1 the right
      const ox = -uz * sd * (st.w / 2 + 0.05), oz = ux * sd * (st.w / 2 + 0.05);
      const b = [(st.a[0] + st.b[0]) / 2 + ox, (st.a[1] + st.b[1]) / 2 + oz, len / 2, 0.06, -Math.atan2(uz, ux)];
      for (const L of [L0, L1]) { boxCol(L, b); each((k, x, zz) => { if (inBox(b, x, zz, 0.06)) FL[L][k] |= F.RAIL; }); }
    }
  }
  // props
  const props = [];
  for (const p of bp.props) {
    const L = LI[p.level], mount = propMount(p, cat), b = propBox(p, cat), c = cat[p.type] || {};
    const s = (p.params && p.params.size3) || c.size || [1, 1, 1], k = (p.params && p.params.scale) || 1;
    const y = mount === 'floor' ? LY[L] + (p.y || 0) : mount === 'top' ? LY[L] + (p.y || 0) : (p.y ?? 0) + (mount === 'wall' ? LY[L] : 0);
    props.push({ id: p.id, type: p.type, x: p.pos[0], z: p.pos[1], y, rot: (p.rot || 0) * D2R, level: L, mount, size: [s[0] * k, s[1] * k, s[2] * k], params: p.params || {}, tags: p.tags || [] });
    if (propWalk(p, cat) === 'block') {
      if (propShape(p, cat) === 'round') col.push([L, 0, b[0], b[1], +Math.max(b[2], b[3]).toFixed(4)]);
      else boxCol(L, b);
      each((kk, x, zz) => { if (inBox(b, x, zz)) FL[L][kk] |= F.PROP; });
    }
  }
  // interactions: props with a use (their own, or the catalog's), and portals with trigger 'use'
  const uses = [];
  for (const p of bp.props) {
    const c = cat[p.type] || {};
    const u = p.use === false ? null : p.use || c.use;
    if (!u) continue;
    const lines = u.dialogue ? bp.dialogue[u.dialogue] : u.lines;
    const b = propBox(p, cat), L = LI[p.level];
    const f = p.use && p.use.at ? p.use.at : null;
    uses.push({ id: p.id, level: L, x: f ? f[0] : b[0], z: f ? f[1] : b[1], r: +(Math.max(b[2], b[3]) + 0.35).toFixed(3), label: u.label || 'Look', lines,
      y: LY[L] + Math.min(1.9, ((c.size || [1, 1, 1])[2]) + 0.3), action: u.action || null });
  }
  // openings with a use (a locked door): the point is just inside the room
  // (side 1 = the right of the segment's direction, -1 the left)
  for (const w of bp.walls) for (const sg of wallSegments(w)) for (const o of sg.openings) {
    if (!o.use) continue;
    const sd = o.use.side || 1, L = LI[w.level] + 0, lv = o.level ? LI[o.level] : L;
    const x = sg.a[0] + sg.dir[0] * o.at - sg.dir[1] * sd * (w.t / 2 + 0.5), z = sg.a[1] + sg.dir[1] * o.at + sg.dir[0] * sd * (w.t / 2 + 0.5);
    const lines = o.use.dialogue ? bp.dialogue[o.use.dialogue] : o.use.lines;
    uses.push({ id: o.id || w.id + '_door', level: lv, x: +x.toFixed(3), z: +z.toFixed(3), r: +(o.w / 2 + 0.2).toFixed(3), label: o.use.label || 'Door', lines, y: LY[lv] + 2.0, action: o.use.action || null });
  }
  // portals
  const portals = (bp.portals || []).map((p) => {
    const L = LI[p.level];
    each((k, x, zz) => { if (x >= p.rect[0] && x <= p.rect[2] && zz >= p.rect[1] && zz <= p.rect[3]) FL[L][k] |= F.PORTAL; });
    return { id: p.id, level: L, rect: p.rect, trigger: p.trigger || 'walk', spawn: p.spawn, to: p.to, label: p.label || 'Door' };
  });
  const actors = (bp.actors || []).map((a) => ({ id: a.id, look: a.look, name: a.name || a.id, level: LI[a.level], x: a.pos[0], z: a.pos[1], y: LY[LI[a.level]], rot: (a.rot || 0) * D2R,
    pose: a.pose || 'stand', lines: a.dialogue ? bp.dialogue[a.dialogue] : a.lines || [] }));
  for (const a of actors) col.push([a.level, 0, a.x, a.z, 0.32]);
  const spawns = (bp.spawns || []).map((s) => ({ id: s.id, level: LI[s.level], x: s.pos[0], z: s.pos[1], y: LY[LI[s.level]], rot: (s.rot || 0) * D2R }));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  return {
    format: FORMAT + '/space', version: VERSION, id: bp.id, name: bp.name, kind: bp.kind, place: bp.place || null,
    levels: bp.levels.map((l) => ({ id: l.id, name: l.name, y: l.y })),
    grid: { x0: bx0, z0: bz0, res: RES, nx, nz },
    walk: bp.levels.map((l, i) => ({ level: i, y: l.y, h: b64(new Uint8Array(H[i].buffer)), f: b64(FL[i]) })),
    _raw: { H, FL },
    colliders: col, uses, portals, spawns, actors, props,
    camera: bp.camera, lights: bp.lights || {},
  };
}

// ---------- validate ----------
// Returns {errors, warnings, space}: errors make a blueprint unusable,
// warnings are things to look at. Checks references, shapes, the snap, that
// openings fit their walls, stairs climb at a sensible pitch, props stand on
// a floor of their level without running into walls or each other, every
// spawn / portal / interaction can be walked to from the first spawn, and the
// camera volumes hold every walkable place.
export function validate(bp, cat) {
  const E = [], W = [];
  const err = (m) => E.push(m), warn = (m) => W.push(m);
  if (bp.format !== FORMAT) err(`format must be '${FORMAT}'`);
  if (bp.version !== VERSION) err(`version must be ${VERSION}`);
  for (const k of ['id', 'name', 'kind', 'bounds', 'levels', 'zones', 'walls', 'props']) if (bp[k] === undefined) err(`missing ${k}`);
  if (E.length) return { errors: E, warnings: W };
  const grid = bp.grid || 0.25;
  const snap = (v, what) => { if (Math.abs(v / grid - Math.round(v / grid)) > 1e-6) warn(`${what}: ${v} is off the ${grid} m grid`); };
  // ids
  const ids = new Map();
  const sections = ['levels', 'zones', 'walls', 'slabs', 'stairs', 'rails', 'runs', 'props', 'actors', 'spawns', 'portals'];
  for (const s of sections) for (const o of bp[s] || []) {
    if (!o.id) { err(`${s}: an entry has no id`); continue; }
    if (ids.has(o.id)) err(`duplicate id '${o.id}' (${ids.get(o.id)} and ${s})`); else ids.set(o.id, s);
  }
  const LI = levelIndex(bp);
  const lvl = (l, what) => { if (!(l in LI)) err(`${what}: unknown level '${l}'`); };
  const mat = (m, what) => { if (m && !(bp.palette || {})[m]) err(`${what}: unknown material '${m}'`); };
  for (let i = 1; i < bp.levels.length; i++) if (bp.levels[i].y <= bp.levels[i - 1].y) err(`levels must rise: ${bp.levels[i].id}`);
  const [bx0, bz0, bx1, bz1] = bp.bounds;
  const inBounds = (p) => p[0] >= bx0 && p[0] <= bx1 && p[1] >= bz0 && p[1] <= bz1;
  const polyOk = (poly, what) => {
    if (!Array.isArray(poly) || poly.length < 3) { err(`${what}: a polygon needs 3+ points`); return false; }
    if (Math.abs(area(poly)) < 0.01) err(`${what}: polygon has no area`);
    if (selfCross(poly)) err(`${what}: polygon crosses itself`);
    for (const p of poly) { snap(p[0], what); snap(p[1], what); if (!inBounds(p)) err(`${what}: point ${p} outside bounds`); }
    return true;
  };
  for (const z of bp.zones) {
    lvl(z.level, `zone ${z.id}`); mat(z.floor, `zone ${z.id} floor`);
    polyOk(z.poly, `zone ${z.id}`);
    if (z.ceiling) {
      const c = z.ceiling;
      if (!['vault', 'flat', 'open', 'sky'].includes(c.type)) err(`zone ${z.id}: ceiling type '${c.type}'`);
      if (c.type === 'vault' && !(c.spring > 0 && c.rise > 0 && ['x', 'z'].includes(c.axis))) err(`zone ${z.id}: vault needs spring, rise, axis`);
      if (c.type === 'flat' && !(c.h > 0)) err(`zone ${z.id}: flat ceiling needs h`);
      mat(c.mat, `zone ${z.id} ceiling`);
    }
  }
  for (const s of bp.slabs || []) { lvl(s.level, `slab ${s.id}`); mat(s.mat, `slab ${s.id}`); polyOk(s.poly, `slab ${s.id}`); }
  // walls and openings
  for (const w of bp.walls) {
    lvl(w.level, `wall ${w.id}`); mat(w.mat, `wall ${w.id}`);
    if (w.wainscot) mat(w.wainscot.mat, `wall ${w.id} wainscot`);
    if (!(w.t > 0 && w.h > 0)) err(`wall ${w.id}: needs t and h`);
    if (!w.path || w.path.length < 2) { err(`wall ${w.id}: path needs 2+ points`); continue; }
    for (const p of w.path) { snap(p[0], `wall ${w.id}`); snap(p[1], `wall ${w.id}`); }
    for (const sg of wallSegments(w)) {
      const os = sg.openings.slice().sort((a, b) => a.at - b.at);
      os.forEach((o, i) => {
        const what = `wall ${w.id} opening ${o.id || i}`;
        if (!['door', 'window', 'arch', 'opening'].includes(o.type)) err(`${what}: type '${o.type}'`);
        if (!(o.w > 0 && o.h > 0)) err(`${what}: needs w and h`);
        if (o.at - o.w / 2 < 0.1 || o.at + o.w / 2 > sg.len - 0.1) err(`${what}: runs off its segment (at ${o.at}, w ${o.w}, segment ${sg.len.toFixed(2)})`);
        for (const q of os.slice(0, i)) {
          const side = q.at + q.w / 2 > o.at - o.w / 2 - 0.05 && o.at + o.w / 2 > q.at - q.w / 2 - 0.05;
          const up = (q.sill || 0) + q.h > (o.sill || 0) - 0.05 && (o.sill || 0) + o.h > (q.sill || 0) - 0.05;
          if (side && up) err(`${what}: overlaps opening ${q.id || os.indexOf(q)}`);
        }
        const mx = sg.a[0] + sg.dir[0] * o.at, mz = sg.a[1] + sg.dir[1] * o.at;
        const top = w.gable ? w.h + w.gable.rise : w.h;
        if ((o.sill || 0) + o.h > top + 1e-6) err(`${what}: taller than the wall (${(o.sill || 0) + o.h} > ${top})`);
        if (o.portal && !(bp.portals || []).some((p) => p.id === o.portal)) err(`${what}: unknown portal '${o.portal}'`);
        void mx; void mz;
      });
    }
  }
  // gable walls: find the vault they close (centre and half width) for wallTop
  for (const w of bp.walls) if (w.gable && !(w.gable.half > 0 && Number.isFinite(w.gable.c))) err(`wall ${w.id}: gable needs c (vault centre line) and half (half width)`);
  // stairs
  for (const st of bp.stairs || []) {
    lvl(st.from, `stairs ${st.id}`); lvl(st.to, `stairs ${st.id}`); mat(st.mat, `stairs ${st.id}`);
    if (!(st.from in LI && st.to in LI)) continue;
    const rise = bp.levels[LI[st.to]].y - bp.levels[LI[st.from]].y, run = segLen(st.a, st.b);
    if (rise <= 0) err(`stairs ${st.id}: must climb (from ${st.from} to ${st.to})`);
    const r = rise / st.steps, g = run / st.steps;
    if (r < 0.14 || r > 0.24) warn(`stairs ${st.id}: risers of ${r.toFixed(3)} m (0.14-0.24 reads as a stair)`);
    if (g < 0.22) warn(`stairs ${st.id}: treads of ${g.toFixed(3)} m are shallow`);
    if (st.w < 0.8) warn(`stairs ${st.id}: narrower than 0.8 m`);
  }
  for (const r of bp.rails || []) { lvl(r.level, `rail ${r.id}`); if (!r.path || r.path.length < 2) err(`rail ${r.id}: path needs 2+ points`); }
  for (const r of bp.runs || []) { mat(r.mat, `run ${r.id}`); if (!r.pts || r.pts.length < 2) err(`run ${r.id}: needs 2+ points`); }
  // dialogue refs
  for (const p of bp.props) if (p.use && p.use.dialogue && !(bp.dialogue || {})[p.use.dialogue]) err(`prop ${p.id}: unknown dialogue '${p.use.dialogue}'`);
  // props: types, levels, floors, walls, each other
  const zonesOf = (L) => [...bp.zones.filter((z) => z.level === L).map((z) => z.poly), ...(bp.slabs || []).filter((s) => s.level === L).map((s) => s.poly)];
  const wallBoxes = [];
  for (const w of bp.walls) for (const sg of wallSegments(w)) {
    const m = sg.len / 2;
    wallBoxes.push({ w, b: [sg.a[0] + sg.dir[0] * m, sg.a[1] + sg.dir[1] * m, sg.len / 2 + w.t / 2, w.t / 2, -Math.atan2(sg.dir[1], sg.dir[0])], sg });
  }
  const blockers = [];
  for (const p of bp.props) {
    const what = `prop ${p.id} (${p.type})`;
    if (!cat[p.type]) { err(`${what}: unknown type`); continue; }
    lvl(p.level, what);
    if (!Array.isArray(p.pos) || p.pos.length !== 2) { err(`${what}: pos must be [x, z]`); continue; }
    snap(p.pos[0], what); snap(p.pos[1], what);
    if (p.rot !== undefined && Math.abs(p.rot % 5) > 1e-6) warn(`${what}: rot ${p.rot} is not a multiple of 5`);
    const mount = propMount(p, cat), b = propBox(p, cat);
    if (mount === 'floor') {
      const polys = zonesOf(p.level);
      // the stairs' own footprint counts as a floor too (things under or on them)
      const corners = boxCorners(b).concat([[b[0], b[1]]]);
      const onFloor = corners.every(([x, z]) => polys.some((poly) => inPoly(poly, x, z)) || (bp.stairs || []).some((st) => {
        const len = segLen(st.a, st.b), ux = (st.b[0] - st.a[0]) / len, uz = (st.b[1] - st.a[1]) / len, dx = x - st.a[0], dz = z - st.a[1], t = dx * ux + dz * uz;
        return t >= -0.05 && t <= len + 0.05 && Math.abs(-dx * uz + dz * ux) <= st.w / 2 + 0.05;
      }));
      if (!onFloor) err(`${what}: not wholly on a floor of level '${p.level}'`);
      if (propWalk(p, cat) === 'block') {
        for (const wb of wallBoxes) if (wb.w.level === p.level || bp.levels[LI[wb.w.level]].y <= bp.levels[LI[p.level]].y) {
          if (boxesOverlap(b, wb.b, 0.015)) err(`${what}: runs into wall ${wb.w.id}`);
        }
        for (const q of blockers) if (q.level === p.level && boxesOverlap(b, q.b, 0.02)) err(`${what}: overlaps ${q.id}`);
        blockers.push({ id: p.id, level: p.level, b });
      }
    } else if (mount === 'wall') {
      // its back within 0.25 m of a wall face, and the right way round
      const near = wallBoxes.some((wb) => {
        const [x, z] = [b[0], b[1]], dx = x - wb.b[0], dz = z - wb.b[1], c = Math.cos(wb.b[4]), s = Math.sin(wb.b[4]);
        const along = dx * c - dz * s, across = dx * s + dz * c;
        return Math.abs(along) <= wb.b[2] && Math.abs(Math.abs(across) - wb.b[3] - b[3]) < 0.25;
      });
      if (!near) err(`${what}: a wall prop must hang on a wall`);
      if (p.y === undefined) err(`${what}: a wall prop needs y`);
    } else if ((mount === 'ceiling' || mount === 'top') && p.y === undefined) err(`${what}: needs y`);
    if (!inBounds(p.pos)) err(`${what}: outside bounds`);
  }
  for (const s of bp.spawns || []) lvl(s.level, `spawn ${s.id}`);
  for (const a of bp.actors || []) { lvl(a.level, `actor ${a.id}`); if (!a.look) err(`actor ${a.id}: needs a look`); if (a.dialogue && !(bp.dialogue || {})[a.dialogue]) err(`actor ${a.id}: unknown dialogue '${a.dialogue}'`); }
  for (const w of bp.walls) for (const o of w.openings || []) if (o.use && o.use.dialogue && !(bp.dialogue || {})[o.use.dialogue]) err(`wall ${w.id}: opening ${o.id}: unknown dialogue`);
  for (const p of bp.portals || []) {
    lvl(p.level, `portal ${p.id}`);
    if (!(bp.spawns || []).some((s) => s.id === p.spawn)) err(`portal ${p.id}: unknown spawn '${p.spawn}'`);
    if (!p.to || !p.to.map || !p.to.spawn) err(`portal ${p.id}: needs to: {map, spawn}`);
  }
  if (!(bp.spawns || []).length) err('no spawns');
  if (!bp.camera || !(bp.camera.volumes || []).length) err('camera: needs volumes');
  if (E.length) return { errors: E, warnings: W };

  // ---- the compiled space: reachability and camera coverage ----
  const S = compile(bp, cat);
  const { nx, nz, x0, z0, res } = S.grid, NL = bp.levels.length, { H, FL } = S._raw;
  // cells someone can stand in: open, no wall / rail / blocking prop, and a
  // player's radius clear of colliders (approximated by one cell)
  const solid = FL.map((f) => f.map((v) => (v & (F.WALL | F.RAIL | F.PROP)) ? 1 : 0));
  const free = FL.map((f, L) => f.map((v, k) => {
    if (!(v & F.OPEN) || solid[L][k]) return 0;
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && solid[L][jj * nx + ii]) return 0; }
    return 1;
  }));
  const cellOf = (x, z) => { const i = Math.floor((x - x0) / res), j = Math.floor((z - z0) / res); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const seen = FL.map(() => new Uint8Array(nx * nz));
  const sp0 = S.spawns[0], start = cellOf(sp0.x, sp0.z);
  if (start < 0 || !free[sp0.level][start]) err(`spawn ${sp0.id}: not on a free floor cell`);
  else {
    const q = [[sp0.level, start]]; seen[sp0.level][start] = 1;
    while (q.length) {
      const [L, k] = q.pop(), i = k % nx, j = (k / nx) | 0, hk = H[L][k];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const kk = jj * nx + ii;
        if (!free[L][kk] || seen[L][kk] || Math.abs(H[L][kk] - hk) > 45) continue;
        seen[L][kk] = 1; q.push([L, kk]);
      }
      // stairs join their two levels
      if (FL[L][k] & F.STAIR) for (let L2 = 0; L2 < NL; L2++) if (L2 !== L && (FL[L2][k] & F.STAIR) && !seen[L2][k]) { seen[L2][k] = 1; q.push([L2, k]); }
    }
    const reach = (L, x, z, r) => {
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const xx = x0 + (i + 0.5) * res, zz = z0 + (j + 0.5) * res;
        if ((xx - x) ** 2 + (zz - z) ** 2 <= r * r && seen[L][j * nx + i]) return true;
      }
      return false;
    };
    for (const s of S.spawns) if (!reach(s.level, s.x, s.z, 0.3)) err(`spawn ${s.id}: cannot be walked to`);
    for (const p of S.portals) { const [a, b, c, d] = p.rect; if (!reach(p.level, (a + c) / 2, (b + d) / 2, Math.max(c - a, d - b) / 2 + 0.2)) err(`portal ${p.id}: cannot be walked to`); }
    for (const u of S.uses) if (!reach(u.level, u.x, u.z, u.r + 0.5)) err(`use ${u.id}: cannot be walked to (within ${(u.r + 0.5).toFixed(2)} m)`);
    // open floor nobody can reach (a sealed corner): a warning
    let lost = 0;
    for (let L = 0; L < NL; L++) for (let k = 0; k < nx * nz; k++) if (free[L][k] && !seen[L][k]) lost++;
    if (lost) warn(`${lost} free floor cells (${(lost * res * res).toFixed(1)} m2) cannot be reached`);
    // camera: every reachable place, at head height, inside a volume
    let bare = 0, first = null;
    const head = (bp.camera.default && bp.camera.default.height) || 1.4;
    for (let L = 0; L < NL; L++) for (let k = 0; k < nx * nz; k++) if (seen[L][k]) {
      const x = x0 + ((k % nx) + 0.5) * res, z = z0 + (((k / nx) | 0) + 0.5) * res, y = H[L][k] / 100 + head;
      if (!camInside(bp.camera, x, y, z, 0)) { bare++; if (!first) first = [x, y, z].map((v) => v.toFixed(2)).join(','); }
    }
    if (bare) err(`camera: ${bare} reachable places are outside every camera volume (first at ${first})`);
  }
  delete S._raw;
  return { errors: E, warnings: W, space: S };
}

// is a point inside a camera volume (shrunk by margin m)?
export function inVolume(v, x, y, z, m = 0) {
  const [x0, y0, z0, x1, y1, z1] = v.box;
  if (x < x0 + m || x > x1 - m || z < z0 + m || z > z1 - m || y < y0 + m) return false;
  if (v.vault) {
    const g = v.vault, half = g.axis === 'x' ? (z1 - z0) / 2 : (x1 - x0) / 2, c = g.axis === 'x' ? z - (z0 + z1) / 2 : x - (x0 + x1) / 2;
    const top = g.spring + g.rise * Math.sqrt(Math.max(0, 1 - (c / half) ** 2));
    return y <= Math.min(y1, top) - m;
  }
  return y <= y1 - m;
}
// a ball of radius m round the point inside the union of the volumes (its
// middle and six points round it: shrinking each volume would open gaps where
// two volumes meet)
const inAny = (cam, x, y, z) => cam.volumes.some((v) => inVolume(v, x, y, z, 0));
export const camInside = (cam, x, y, z, m = cam.margin || 0) => inAny(cam, x, y, z) && (m <= 0 ||
  [[m, 0, 0], [-m, 0, 0], [0, m, 0], [0, -m, 0], [0, 0, m], [0, 0, -m]].every(([a, b, c]) => inAny(cam, x + a, y + b, z + c)));
