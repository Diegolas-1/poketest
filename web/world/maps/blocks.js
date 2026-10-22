// The simplified 3D top-down version of a map blueprint: flat-coloured blocks
// (floors, walls cut at their openings, slabs, stairs as a stepped run, every
// prop as its footprint box at its height, the vault as a translucent shell),
// for map views and quick looks at a layout. No textures, no props library.
//   blockModel(bp, cat, {cut (height walls are cut at), roof}) -> THREE.Group
import * as THREE from 'three';
import { wallSegments, propBox, propShape, propMount } from './format.js';

export function blockModel(bp, cat, o = {}) {
  const G = new THREE.Group(), LI = Object.fromEntries(bp.levels.map((l, i) => [l.id, i])), LY = bp.levels.map((l) => l.y);
  const mat = new Map();
  const M = (c, op = 1) => { const k = c + op; if (!mat.has(k)) mat.set(k, new THREE.MeshLambertMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1 })); return mat.get(k); };
  const col = (m, f = '#ccc') => (bp.palette[m] ? bp.palette[m].color : f);
  const add = (geo, c, x, y, z, ry = 0, op = 1) => { const m = new THREE.Mesh(geo, M(c, op)); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = op >= 1; m.receiveShadow = true; G.add(m); return m; };
  const cut = o.cut ?? 99;
  for (const z of bp.zones) {
    const sh = new THREE.Shape(z.poly.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2);
    add(g, col(z.floor), 0, LY[LI[z.level]] - 0.12, 0);
  }
  for (const s of bp.slabs || []) {
    const sh = new THREE.Shape(s.poly.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    // a slab above the cut is shown see-through, so the floor under it reads
    add(new THREE.ExtrudeGeometry(sh, { depth: s.t, bevelEnabled: false }).rotateX(-Math.PI / 2), col(s.mat), 0, LY[LI[s.level]] - s.t, 0, 0, LY[LI[s.level]] > cut ? 0.55 : 1);
    for (const c of s.columns || []) add(new THREE.CylinderGeometry(0.12, 0.12, LY[LI[s.level]] - s.t, 10), col(s.under || s.mat), c[0], (LY[LI[s.level]] - s.t) / 2, c[1]);
  }
  for (const w of bp.walls) {
    const y0 = LY[LI[w.level]];
    for (const sg of wallSegments(w)) {
      const h = Math.min(w.h, cut - y0), ry = -Math.atan2(sg.dir[1], sg.dir[0]);
      // pieces between openings, and under / over windows
      const os = sg.openings.slice().sort((a, b) => a.at - b.at);
      const piece = (u0, u1, v0, v1, c = col(w.mat)) => {
        if (u1 - u0 < 0.02 || v1 - v0 < 0.02) return;
        const m = (u0 + u1) / 2;
        add(new THREE.BoxGeometry(u1 - u0, v1 - v0, w.t), c, sg.a[0] + sg.dir[0] * m, y0 + (v0 + v1) / 2, sg.a[1] + sg.dir[1] * m, ry);
      };
      let u = -w.t / 2;
      for (const op of os) {
        const a = op.at - op.w / 2, b = op.at + op.w / 2, s0 = op.sill || 0, s1 = s0 + op.h;
        piece(u, a, 0, h);
        piece(a, b, 0, Math.min(h, s0));
        if (s1 < h) piece(a, b, s1, h);
        if (op.type === 'window' && s0 < h) piece(a, b, s0, Math.min(h, s1), '#8fd0f0');
        if (op.type === 'door' && s0 < h) piece(a + 0.05, b - 0.05, s0, Math.min(h, s1), op.portal ? '#46c47a' : '#a0623a');
        u = b;
      }
      piece(u, sg.len + w.t / 2, 0, h);
    }
  }
  for (const st of bp.stairs || []) {
    const len = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]), ux = (st.b[0] - st.a[0]) / len, uz = (st.b[1] - st.a[1]) / len;
    const y0 = LY[LI[st.from]], y1 = LY[LI[st.to]];
    for (let i = 0; i < st.steps; i++) {
      const t = (i + 0.5) * len / st.steps, y = y0 + (i + 1) * (y1 - y0) / st.steps;
      add(new THREE.BoxGeometry(len / st.steps, 0.05, st.w), col(st.mat, '#9cc0ad'), st.a[0] + ux * t, y - 0.025, st.a[1] + uz * t, -Math.atan2(uz, ux));
    }
  }
  for (const r of bp.rails || []) for (let i = 0; i + 1 < r.path.length; i++) {
    const [ax, az] = r.path[i], [bx, bz] = r.path[i + 1], len = Math.hypot(bx - ax, bz - az);
    add(new THREE.BoxGeometry(len, r.h, 0.06), col(r.mat, '#9cc0ad'), (ax + bx) / 2, LY[LI[r.level]] + r.h / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax), 0.55);
  }
  for (const p of bp.props) {
    const c = cat[p.type]; if (!c) continue;
    const mount = propMount(p, cat), b = propBox(p, cat), h = ((p.params && p.params.size3) || c.size)[2] * ((p.params && p.params.scale) || 1);
    const L = LI[p.level];
    let y = LY[L] + (p.y || 0);
    if (mount === 'wall') y = LY[L] + p.y - h / 2;
    if (mount === 'ceiling') { if (p.y - (p.params && p.params.drop || h) > cut) continue; y = p.y - Math.min(h, 1); }
    if (y > cut + 4) continue;
    const geo = propShape(p, cat) === 'round' ? new THREE.CylinderGeometry(Math.max(b[2], b[3]), Math.max(b[2], b[3]), h, 20) : new THREE.BoxGeometry(b[2] * 2, h, b[3] * 2);
    add(geo, c.plan ? c.plan[0] : '#999', b[0], y + h / 2, b[1], b[4], mount === 'ceiling' ? 0.5 : 1);
  }
  if (o.roof) for (const z of bp.zones) {
    const c = z.ceiling; if (!c || c.type !== 'vault') continue;
    const xs = z.poly.map((p) => p[0]), zs = z.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const g = new THREE.CylinderGeometry(1, 1, x1 - x0, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
    const m = add(g, col(c.mat), (x0 + x1) / 2, LY[LI[z.level]] + c.spring, (z0 + z1) / 2, 0, 0.28);
    m.scale.set(1, c.rise, (z1 - z0) / 2);
  }
  return G;
}
