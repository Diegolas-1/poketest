// Interiors: a map blueprint (maps/format.js) built into a detailed cel-shaded
// space. The shell (floors, walls with their openings, wainscot and trim,
// vaults with ribs, flat ceilings, slabs, stairs, railings, pipes and beams,
// windows with the view outside, doors, light pools) is made here from the
// blueprint; the props come from the prop library (props/index.js).
//
//   buildInterior(bp) -> { group, space (the compiled blueprint), lamps,
//                          edges ({pos, n1, n2, k} ink in the group's space), stats }
//
// The finished group is a handful of meshes: every part is first given its
// ink (the edges of each piece cut against the other pieces of the same
// thing, outline.js partEdges, so a prop is outlined as one shape), then all
// meshes are merged by material, flat colours moving into vertex colours, as
// town.js does for the town. Mesh names say how the native game draws them
// (tools/native/bake_interior.mjs): 'ns' = casts no shadow.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { compile, wallSegments, propMount } from './maps/format.js';
import { CATALOG } from './props/catalog.js';
import { buildProp } from './props/index.js';
import { doorLeaf } from './props/decor.js';
import { inkSolid, partEdges, inkSkip } from './outline.js';
import { setPalette, paint, flat, texm, unlit, glow, box, block, cyl, sphere, torus, rod, plane, extrude, wuv, plaster, planks, metal, poolTex, shade, rng, hash } from './props/kit.js';

const D2R = Math.PI / 180;
const TRIM = '#fbf7ea';

// ---------- painted surfaces of the shell ----------
// glossy tiles: grout lines, a soft sheen, a few bright streaks (1 texture = 2 x 2 tiles)
const tileTex = (col, n = 2) => paint('tile' + col + n, 512, 512, (x, w, h, R) => {
  const s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const c = shade(col, 0.97 + R() * 0.06);
    const g = x.createLinearGradient(i * s, j * s, (i + 1) * s, (j + 1) * s);
    g.addColorStop(0, shade(c, 1.05)); g.addColorStop(0.6, c); g.addColorStop(1, shade(c, 0.95));
    x.fillStyle = g; x.fillRect(i * s, j * s, s, s);
    // sheen: a pale diagonal band across each tile
    x.globalAlpha = 0.18; x.fillStyle = '#ffffff';
    x.beginPath(); x.moveTo(i * s + s * 0.15, j * s); x.lineTo(i * s + s * 0.38, j * s); x.lineTo(i * s, j * s + s * 0.38); x.lineTo(i * s, j * s + s * 0.15); x.fill();
    x.globalAlpha = 1;
  }
  x.fillStyle = shade(col, 0.72);
  for (let i = 0; i <= n; i++) { x.fillRect(i * s - 2, 0, 4, h); x.fillRect(0, i * s - 2, w, 4); }
  x.fillStyle = 'rgba(255,255,255,.45)';
  for (let i = 0; i <= n; i++) { x.fillRect(i * s + 2, 0, 1.5, h); x.fillRect(0, i * s + 2, w, 1.5); }
});
// the vault: maroon panels, lighter in the middle of each bay (u = one bay, v = 1/7 of the arc)
const vaultTex = (col) => paint('vault' + col, 256, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, shade(col, 0.82)); g.addColorStop(0.5, shade(col, 1.08)); g.addColorStop(1, shade(col, 0.82));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = shade(col, 0.68); x.fillRect(0, 0, w, 3);
  x.fillStyle = shade(col, 1.2); x.fillRect(0, 3, w, 2);
  x.globalAlpha = 0.07; x.fillStyle = '#ffffff';
  for (let k = 0; k < 12; k++) x.fillRect(Math.random() * w, Math.random() * h, 1, 30 + Math.random() * 60);
  x.globalAlpha = 1;
});
const ceilTex = (col) => paint('ceil' + col, 256, 256, (x, w, h) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  x.fillStyle = shade(col, 0.86); for (let i = 0; i <= 4; i++) { x.fillRect(i * 64 - 1.5, 0, 3, h); x.fillRect(0, i * 64 - 1.5, w, 3); }
  x.fillStyle = 'rgba(0,0,0,.05)'; for (let k = 0; k < 400; k++) x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
});
const plateTex = (col) => paint('plate' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.18; x.strokeStyle = shade(col, 0.7); x.lineWidth = 2;
  for (let k = 0; k < 90; k++) { const cx = R() * w, cy = R() * h, a = R() * 3; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); x.stroke(); }
  x.globalAlpha = 1; x.fillStyle = shade(col, 0.72); x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
});
// the view out of a window: sky, clouds, and per kind trees, a garden, the sea or blossom branches
const outsideTex = (kind) => paint('out' + kind, 384, 384, (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7fc4ee'); g.addColorStop(0.6, '#c6e8f6'); g.addColorStop(1, '#e8f6f2');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.92)';
  for (let k = 0; k < 6; k++) { const cx = R() * w, cy = h * (0.08 + R() * 0.3); for (let j = 0; j < 5; j++) { x.beginPath(); x.ellipse(cx + (j - 2) * 18, cy - Math.sin(j) * 8, 26, 14, 0, 0, 6.28); x.fill(); } }
  const tree = (cx, cy, r, c) => { for (let j = 0; j < 7; j++) { x.fillStyle = shade(c, 0.85 + R() * 0.3); x.beginPath(); x.arc(cx + (R() - 0.5) * r, cy + (R() - 0.5) * r * 0.8, r * (0.45 + R() * 0.3), 0, 6.28); x.fill(); } };
  if (kind === 'sea') {
    x.fillStyle = '#4f9ed0'; x.fillRect(0, h * 0.58, w, h); x.fillStyle = 'rgba(255,255,255,.5)'; for (let k = 0; k < 20; k++) x.fillRect(R() * w, h * (0.6 + R() * 0.35), 20 + R() * 30, 2);
    tree(w * 0.1, h * 0.72, 50, '#5fae5a'); tree(w * 0.92, h * 0.75, 46, '#4f9a4a');
  } else if (kind === 'sky_branches') {
    x.strokeStyle = '#7a5a48'; x.lineWidth = 6;
    for (let k = 0; k < 4; k++) { x.beginPath(); let px = R() * w, py = h * (0.2 + R() * 0.6); x.moveTo(px, py); for (let j = 0; j < 6; j++) { px += 30 + R() * 30; py += (R() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); }
    for (let k = 0; k < 160; k++) { x.fillStyle = R() < 0.5 ? '#f6c9d6' : '#fbe7ee'; x.beginPath(); x.arc(R() * w, R() * h, 3 + R() * 4, 0, 6.28); x.fill(); }
  } else if (kind !== 'sky') {
    x.fillStyle = '#9fcf8a'; x.fillRect(0, h * 0.7, w, h);
    for (let k = 0; k < 7; k++) tree(R() * w, h * (0.45 + R() * 0.2), 40 + R() * 40, ['#5fae5a', '#4f9a4a', '#78c06a'][k % 3]);
    if (kind === 'garden') { for (let k = 0; k < 40; k++) { x.fillStyle = ['#f6d24a', '#f08aa6', '#ffffff'][k % 3]; x.beginPath(); x.arc(R() * w, h * (0.78 + R() * 0.2), 4, 0, 6.28); x.fill(); } x.fillStyle = '#f2ead4'; for (let i = 0; i < w; i += 22) x.fillRect(i, h * 0.8, 6, 40); x.fillRect(0, h * 0.83, w, 5); }
  }
}, { repeat: false });
const blindsTex = () => paint('blinds', 128, 128, (x, w, h) => {
  for (let y = 0; y < h; y += 8) { x.fillStyle = '#f4f2ea'; x.fillRect(0, y, w, 6); x.fillStyle = '#c9c6ba'; x.fillRect(0, y + 6, w, 2); }
});
const streakTex = () => paint('streak', 64, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const s = x.createLinearGradient(0, 0, w, 0); s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = s; x.fillRect(0, 0, w, h);
}, { repeat: false });
const softRect = () => paint('softrect', 128, 128, (x, w, h) => {
  for (let i = 0; i < 24; i++) { x.fillStyle = `rgba(255,255,255,${0.05})`; x.fillRect(i * 2.4, i * 2.4, w - i * 4.8, h - i * 4.8); }
}, { repeat: false });

// ---------- shell parts ----------
// a wall segment: the face as a 2D shape (u along, v up) with the openings cut
// out, extruded through the wall's thickness
function wallShape(w, sg, top) {
  const L = sg.len, e = w.t / 2, s = new THREE.Shape();
  // openings that reach the floor are notches in the outline, the rest holes
  const low = sg.openings.filter((o) => !(o.sill > 0.001) && o.style !== 'round').sort((a, b) => a.at - b.at);
  s.moveTo(-e, 0);
  for (const o of low) {
    const x0 = o.at - o.w / 2, x1 = o.at + o.w / 2, y1 = o.h;
    s.lineTo(x0, 0);
    if (o.style === 'arched' || o.type === 'arch') {
      const r = o.w / 2; s.lineTo(x0, y1 - r);
      for (let i = 1; i <= 16; i++) { const a = Math.PI - (i / 16) * Math.PI; s.lineTo(o.at + Math.cos(a) * r, y1 - r + Math.sin(a) * r); }
    } else { s.lineTo(x0, y1); s.lineTo(x1, y1); }
    s.lineTo(x1, 0);
  }
  s.lineTo(L + e, 0);
  if (w.gable) {
    const n = 40;
    for (let i = n; i >= 0; i--) { const u = -e + (L + 2 * e) * (i / n); s.lineTo(u, top(u)); }
  } else { s.lineTo(L + e, w.h); s.lineTo(-e, w.h); }
  s.lineTo(-e, 0);
  for (const o of sg.openings) if (!low.includes(o)) s.holes.push(openingPath(o));
  return s;
}
function openingPath(o, grow = 0) {
  const p = new THREE.Path(), x0 = o.at - o.w / 2 - grow, x1 = o.at + o.w / 2 + grow, y0 = (o.sill || 0) - grow, y1 = (o.sill || 0) + o.h + grow;
  if (o.style === 'round') { p.absarc(o.at, (y0 + y1) / 2, o.w / 2 + grow, 0, Math.PI * 2, false); return p; }
  const arched = o.style === 'arched' || o.type === 'arch';
  p.moveTo(x0, y0); p.lineTo(x1, y0);
  if (arched) { const r = (x1 - x0) / 2; p.lineTo(x1, y1 - r); p.absarc(o.at, y1 - r, r, 0, Math.PI, false); }
  else { p.lineTo(x1, y1); p.lineTo(x0, y1); }
  p.lineTo(x0, y0);
  return p;
}
// a frame ring round an opening on one face (d deep, width fw)
function frameRing(o, fw) {
  const s = new THREE.Shape(openingPath(o, fw).getPoints(48));
  s.holes.push(new THREE.Path(openingPath(o).getPoints(48).reverse()));
  return s;
}
// the matrix from a segment's (u, v, n) frame to the space
function segMatrix(sg, n0 = 0) {
  const [ux, uz] = sg.dir;
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-uz, 0, ux))
    .setPosition(sg.a[0] - uz * n0, 0, sg.a[1] + ux * n0);
}

export function buildInterior(bp, { cat = CATALOG } = {}) {
  setPalette(bp.lights && bp.lights.palette);
  const space = compile(bp, cat);
  const LI = Object.fromEntries(bp.levels.map((l, i) => [l.id, i])), LY = bp.levels.map((l) => l.y);
  const root = new THREE.Group(); root.name = 'interior_' + bp.id;
  const parts = [];   // groups, each inked as one shape
  const part = (name) => { const g = new THREE.Group(); g.name = name; root.add(g); parts.push(g); return g; };
  const pal = (id, fb = '#cccccc') => (bp.palette[id] ? bp.palette[id].color : fb);
  const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const zoneAt = (L, x, z) => bp.zones.find((zz) => LI[zz.level] === L && inPoly(zz.poly, x, z)) || (bp.slabs || []).find((s) => LI[s.level] === L && inPoly(s.poly, x, z));
  const anyZone = (x, z) => bp.zones.some((zz) => inPoly(zz.poly, x, z));
  // a room at (x, z) whose space reaches height y (under its ceiling)
  const roomAt = (x, z, y) => bp.zones.some((zz) => {
    if (!inPoly(zz.poly, x, z)) return false;
    const c = zz.ceiling || {}, top = LY[LI[zz.level]] + (c.type === 'vault' ? c.spring + c.rise : c.type === 'flat' ? c.h : 99);
    return y < top - 0.05;
  });

  // ---- floors ----
  const F = part('floors');
  for (const z of bp.zones) {
    const sh = new THREE.Shape(z.poly.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    const p = bp.palette[z.floor] || {}, n = p.pattern === 'tile05' ? 4 : 2, rep = p.pattern === 'tile05' ? 0.5 : 0.5;
    const uv = g.attributes.uv, P = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i) * rep * (n / 2), P.getZ(i) * rep * (n / 2));
    const fm = texm(tileTex(p.color || '#cccccc', n)); fm.name = 'floor';   // glossy in the native game (interior_floor.gdshader)
    const m = new THREE.Mesh(g, fm);
    m.position.y = LY[LI[z.level]]; m.receiveShadow = true; m.userData.outline = false; m.userData.noShadow = true; F.add(m);
  }

  // ---- walls, wainscot, trim, openings ----
  for (const w of bp.walls) {
    const L = LI[w.level], y0 = LY[L], wallM = texm(plaster(pal(w.mat)));
    for (const sg of wallSegments(w)) {
      const W = part('wall_' + w.id + '_' + sg.i);
      const M = segMatrix(sg);
      // the top of a gable wall follows the vault across it
      const top = (u) => {
        const x = sg.a[0] + sg.dir[0] * u, z = sg.a[1] + sg.dir[1] * u, g = w.gable;
        const c = g.axis === 'x' ? x - g.c : z - g.c;
        return w.h + g.rise * Math.sqrt(Math.max(0, 1 - (c / g.half) ** 2));
      };
      const geo = new THREE.ExtrudeGeometry(wallShape(w, sg, top), { depth: w.t, bevelEnabled: false, curveSegments: 16 });
      geo.translate(0, y0, -w.t / 2); geo.applyMatrix4(M); wuv(geo, 0.5);
      const wm = new THREE.Mesh(geo, wallM); wm.receiveShadow = true; wm.userData.noShadow = true; W.add(wm);
      // which faces look into a room (n = +1: the left of the segment's direction... the (-uz, ux) side)
      const mid = [sg.a[0] + sg.dir[0] * sg.len / 2, sg.a[1] + sg.dir[1] * sg.len / 2];
      const sides = [1, -1].filter((s) => anyZone(mid[0] - sg.dir[1] * s * (w.t / 2 + 0.2), mid[1] + sg.dir[0] * s * (w.t / 2 + 0.2)));
      for (const s of sides) {
        const face = s * (w.t / 2);
        // put a box in the segment's frame: u along, v up, n out of the face
        const seg = (u0, u1, v0, v1, n0, n1, m, o = {}) => {
          const g = new THREE.BoxGeometry(u1 - u0, v1 - v0, Math.abs(n1 - n0));
          if (o.uv !== undefined) wuv(g, o.uv);
          g.translate((u0 + u1) / 2, y0 + (v0 + v1) / 2, face + s * (n0 + n1) / 2);
          g.applyMatrix4(M);
          if (o.uvAfter !== undefined) wuv(g, o.uvAfter);
          const mesh = new THREE.Mesh(g, typeof m === 'string' ? flat(m) : m); mesh.castShadow = false; mesh.receiveShadow = true;
          if (o.line === false) mesh.userData.outline = false;
          mesh.userData.noShadow = true; W.add(mesh); return mesh;
        };
        const stops = sg.openings.map((o) => [o.at - o.w / 2, o.at + o.w / 2, o.sill || 0, (o.sill || 0) + o.h]);
        const runs = (vTop) => {   // stretches of the wall free of openings below vTop
          const cuts = stops.filter((o) => o[2] < vTop).map((o) => [o[0] - 0.12, o[1] + 0.12]).sort((a, b) => a[0] - b[0]);
          const out = []; let u = 0;
          for (const [a, b] of cuts) { if (a > u + 0.05) out.push([u, a]); u = Math.max(u, b); }
          if (sg.len > u + 0.05) out.push([u, sg.len]);
          return out.map(([a, b]) => [Math.max(a, w.t / 2), Math.min(b, sg.len - w.t / 2)]).filter(([a, b]) => b - a > 0.05);
        };
        // wainscot: planked panel, a cap rail and a skirting
        if (w.wainscot) {
          const wh = w.wainscot.h, wc = pal(w.wainscot.mat);
          for (const [a, b] of runs(wh)) {
            seg(a, b, 0, wh, 0, 0.035, texm(planks(wc, 6)), { uvAfter: 0.5 });
            seg(a, b, wh - 0.02, wh + 0.05, 0, 0.065, shade(wc, 0.78));
            seg(a, b, 0, 0.12, 0, 0.05, shade(wc, 0.62));
          }
        } else for (const [a, b] of runs(0.12)) seg(a, b, 0, 0.1, 0, 0.03, '#e2ddd0');
        // a cornice under the vault / ceiling
        if (!w.gable && w.h > 4) for (const [a, b] of runs(w.h - 0.3)) { seg(a, b, w.h - 0.22, w.h, 0, 0.16, TRIM); seg(a, b, w.h - 0.32, w.h - 0.22, 0, 0.07, TRIM); }
      }
      // openings
      for (const o of sg.openings) {
        const O = part('opening_' + (o.id || w.id));
        const Mo = M.clone();
        const at = (g) => { g.applyMatrix4(Mo); return g; };
        const addG = (g, m, o2 = {}) => { const mesh = new THREE.Mesh(at(g), typeof m === 'string' ? flat(m) : m); mesh.receiveShadow = true; mesh.castShadow = !o2.noShadow; if (o2.line === false) mesh.userData.outline = false; if (o2.noShadow) mesh.userData.noShadow = true; O.add(mesh); return mesh; };
        const yb = y0, sill = o.sill || 0;
        // the faces of the wall this opening is seen from (a room there that reaches its height)
        const om = [sg.a[0] + sg.dir[0] * o.at, sg.a[1] + sg.dir[1] * o.at], oy = y0 + sill + o.h / 2;
        const sides = [1, -1].filter((s) => roomAt(om[0] - sg.dir[1] * s * (w.t / 2 + 0.25), om[1] + sg.dir[0] * s * (w.t / 2 + 0.25), oy));
        const ringOn = (s, fw, d, col) => { const g = new THREE.ExtrudeGeometry(frameRing(o, fw), { depth: d, bevelEnabled: false, curveSegments: 16 }); g.translate(0, yb, s > 0 ? w.t / 2 : -w.t / 2 - d); addG(g, col, { noShadow: true }); };
        // the reveal: the hole's sides lined in trim
        const reveal = () => {
          const pts = openingPath(o).getPoints(48);
          const sh = new THREE.Shape(openingPath(o, 0.04).getPoints(48)); sh.holes.push(new THREE.Path(pts.slice().reverse()));
          const g = new THREE.ExtrudeGeometry(sh, { depth: w.t + 0.02, bevelEnabled: false, curveSegments: 16 }); g.translate(0, yb, -w.t / 2 - 0.01);
          addG(g, TRIM, { noShadow: true, line: false });
        };
        if (o.type === 'window') {
          reveal();
          for (const s of sides) ringOn(s, 0.1, 0.05, TRIM);
          // the view outside: a painted card beyond the wall (on the side with no room)
          const out = sides.length === 1 ? -sides[0] : -1;
          const cw = o.w + 2.4, ch = o.h + 2.4;
          const card = new THREE.PlaneGeometry(cw, ch); card.rotateY(out > 0 ? Math.PI : 0);
          card.translate(o.at, yb + sill + o.h / 2, out * (w.t / 2 + 1.0));
          addG(card, unlit(outsideTex(o.outside || 'sky')), { noShadow: true, line: false });
          // mullions and a transom (in the middle of the wall's depth)
          const mul = (u0, u1, v0, v1) => { const g = new THREE.BoxGeometry(u1 - u0, v1 - v0, 0.06); g.translate((u0 + u1) / 2, yb + (v0 + v1) / 2, 0); addG(g, TRIM, { noShadow: true }); };
          if (o.style === 'round') { mul(o.at - 0.03, o.at + 0.03, sill, sill + o.h); mul(o.at - o.w / 2, o.at + o.w / 2, sill + o.h / 2 - 0.03, sill + o.h / 2 + 0.03); }
          else {
            const cols = o.style === 'blinds' ? 4 : o.w > 1.2 ? 2 : 1;
            for (let c = 1; c < cols * (o.style === 'arched' ? 1 : 1) + (o.style === 'arched' ? 1 : 0); c++) { const u = o.at - o.w / 2 + (o.w * c) / (cols + (o.style === 'arched' ? 1 : 0)); mul(u - 0.03, u + 0.03, sill, sill + o.h - (o.style === 'arched' ? 0.05 : 0)); }
            if (o.style !== 'arched' && cols === 1) mul(o.at - o.w / 2, o.at + o.w / 2, sill + o.h * 0.55 - 0.03, sill + o.h * 0.55 + 0.03);
            if (o.style === 'arched') { const sp = sill + o.h - o.w / 2; mul(o.at - o.w / 2, o.at + o.w / 2, sp - 0.03, sp + 0.03); mul(o.at - o.w / 2, o.at + o.w / 2, sill + (sp - sill) * 0.5 - 0.025, sill + (sp - sill) * 0.5 + 0.025); }
          }
          // a sill on the room side
          for (const s of sides) { const g = new THREE.BoxGeometry(o.w + 0.3, 0.06, 0.16); g.translate(o.at, yb + sill - 0.03, s * (w.t / 2 + 0.06)); addG(g, TRIM); }
          // glass: a faint streak of light (additive)
          for (const s of sides) {
            const g = new THREE.PlaneGeometry(Math.min(0.5, o.w * 0.35), o.h * 0.9); g.rotateY(s > 0 ? 0 : Math.PI); g.rotateZ(0.0);
            g.translate(o.at - o.w * 0.18, yb + sill + o.h * 0.48, s * 0.02);
            addG(g, glow(streakTex(), '#ffffff', 0.35), { noShadow: true, line: false });
          }
          // blinds: slats down over the top part, further down on the right half (ref)
          if (o.style === 'blinds') for (const s of sides) {
            for (const [u0, u1, drop] of [[o.at - o.w / 2, o.at, 0.38], [o.at, o.at + o.w / 2, 0.62]]) {
              const bh = o.h * drop, g = new THREE.PlaneGeometry(u1 - u0 - 0.04, bh); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * bh * 3);
              g.rotateY(s > 0 ? 0 : Math.PI); g.translate((u0 + u1) / 2, yb + sill + o.h - bh / 2, s * (w.t / 2 - 0.06));
              addG(g, texm(blindsTex()), { noShadow: true, line: false });
              const rail = new THREE.BoxGeometry(u1 - u0 - 0.02, 0.04, 0.04); rail.translate((u0 + u1) / 2, yb + sill + o.h - bh - 0.02, s * (w.t / 2 - 0.05)); addG(rail, '#e6e2d6', { noShadow: true });
              const head = new THREE.BoxGeometry(u1 - u0, 0.08, 0.08); head.translate((u0 + u1) / 2, yb + sill + o.h - 0.04, s * (w.t / 2 - 0.05)); addG(head, '#e6e2d6', { noShadow: true });
            }
          }
        } else if (o.type === 'door') {
          reveal();
          // the leaf: on the room side, closed
          const g2 = new THREE.Group();
          const s = sides[0] || 1;
          doorLeaf(g2, o.w, o.h, '#8a5634', -0.05, { double: o.style === 'double' });
          g2.position.set(o.at, yb + sill + o.h / 2, s * (w.t / 2 - 0.08)); if (s < 0) g2.rotation.y = Math.PI;
          g2.updateMatrix();
          g2.traverse((m) => { if (m.isMesh) { m.updateMatrix(); const g = m.geometry.clone().applyMatrix4(m.matrix).applyMatrix4(g2.matrix); addG(g, m.material, { line: m.userData.outline !== false }); } });
          if (o.portal) {
            // a bright doorway glow on the floor in front (the way out)
            const p = new THREE.PlaneGeometry(o.w + 0.4, 1.2).rotateX(-Math.PI / 2); p.translate(o.at, yb + sill + 0.012, s * (w.t / 2 + 0.6));
            addG(p, glow(softRect(), '#fff4cc', 0.5), { noShadow: true, line: false });
          }
        } else {
          // a walk-through arch: trimmed both sides and lined
          reveal();
          for (const s of [1, -1]) ringOn(s, 0.14, 0.06, TRIM);
          const key = new THREE.BoxGeometry(0.22, 0.3, w.t + 0.16); key.translate(o.at, yb + sill + o.h + 0.05, 0); addG(key, TRIM);
        }
      }
    }
  }

  // ---- ceilings: vaults with ribs, flat ceilings ----
  for (const z of bp.zones) {
    const c = z.ceiling; if (!c) continue;
    const xs = z.poly.map((p) => p[0]), zs = z.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const yB = LY[LI[z.level]];
    if (c.type === 'vault') {
      const V = part('vault_' + z.id);
      const half = (c.axis === 'x' ? z1 - z0 : x1 - x0) / 2 - 0.15, mid = c.axis === 'x' ? (z0 + z1) / 2 : (x0 + x1) / 2;
      const a0 = c.axis === 'x' ? x0 : z0, a1 = c.axis === 'x' ? x1 : z1, n = 40;
      const arc = (t, rr = 0) => [Math.cos(t) * (half - rr), c.spring + Math.sin(t) * (c.rise - rr)];
      let Ltot = 0; const lens = [0];
      for (let i = 1; i <= n; i++) { const [p, q] = arc((i - 1) / n * Math.PI), [r2, s2] = arc(i / n * Math.PI); Ltot += Math.hypot(r2 - p, s2 - q); lens.push(Ltot); }
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const [cc, yy] = arc((i / n) * Math.PI);
        for (const a of [a0, a1]) {
          if (c.axis === 'x') pos.push(a, yB + yy, mid + cc); else pos.push(mid + cc, yB + yy, a);
          uv.push(a / (c.ribs || 2), (lens[i] / Ltot) * 7);
        }
      }
      for (let i = 0; i < n; i++) { const a = i * 2, b = a + 1, cc = a + 2, d = a + 3; if (c.axis === 'x') idx.push(a, b, cc, cc, b, d); else idx.push(a, cc, b, cc, d, b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      // normals point into the room (down)
      const N = g.attributes.normal; let dn = 0; for (let i = 0; i < N.count; i++) dn += N.getY(i); if (dn > 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; } g.setIndex(idx); g.computeVertexNormals(); }
      const vm = new THREE.Mesh(g, texm(vaultTex(pal(c.mat)))); vm.receiveShadow = true; vm.userData.outline = false; vm.userData.noShadow = true; V.add(vm);
      // ribs: arched bands every `ribs` metres (a part each, so each is inked on its own)
      const ribCol = pal(c.rib, shade(pal(c.mat), 0.75));
      for (let a = a0; a <= a1 + 1e-6; a += c.ribs || 2.25) {
        const R = part('rib_' + z.id + '_' + a.toFixed(2));
        const sh = new THREE.Shape(), outer = [], inner = [];
        for (let i = 0; i <= 32; i++) { outer.push(arc((i / 32) * Math.PI, -0.02)); inner.push(arc((i / 32) * Math.PI, 0.16)); }
        sh.moveTo(...outer[0]); for (const p of outer.slice(1)) sh.lineTo(...p); for (const p of inner.reverse()) sh.lineTo(...p); sh.lineTo(...outer[0]);
        const rg = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
        rg.translate(0, yB, -0.1);
        if (c.axis === 'x') { rg.rotateY(Math.PI / 2); rg.translate(Math.min(Math.max(a, a0 + 0.25), a1 - 0.25), 0, mid); } else rg.translate(mid, 0, Math.min(Math.max(a, a0 + 0.25), a1 - 0.25));
        const rm = new THREE.Mesh(rg, flat(ribCol)); rm.userData.noShadow = true; R.add(rm);
      }
    } else if (c.type === 'flat') {
      const C = part('ceiling_' + z.id);
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2);
      const uv = g.attributes.uv, P = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (P.getX(i) + (x0 + x1) / 2) * 0.625, (P.getZ(i) + (z0 + z1) / 2) * 0.625);
      const m = new THREE.Mesh(g, texm(ceilTex(pal(c.mat)))); m.position.set((x0 + x1) / 2, yB + c.h, (z0 + z1) / 2); m.userData.outline = false; m.userData.noShadow = true; C.add(m);
    }
  }

  // ---- slabs (the mezzanine) with a fascia, joists and columns ----
  for (const s of bp.slabs || []) {
    const S = part('slab_' + s.id);
    const xs = s.poly.map((p) => p[0]), zs = s.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), y = LY[LI[s.level]];
    const top = block(S, x1 - x0, s.t, z1 - z0, texm(plateTex(pal(s.mat))), (x0 + x1) / 2, y - s.t, (z0 + z1) / 2, { uv: 0.5 });
    top.castShadow = true;
    const under = pal(s.under || s.mat);
    // the edge facing the hall (the side not against a wall): a fascia band
    box(S, 0.08, 0.32, z1 - z0, shade(under, 0.9), x0 - 0.04, y - 0.16, (z0 + z1) / 2);
    for (let zz = z0 + 1.2; zz < z1 - 0.5; zz += 1.6) block(S, x1 - x0 - 0.1, 0.18, 0.12, under, (x0 + x1) / 2, y - s.t - 0.18, zz);
    block(S, 0.22, 0.24, z1 - z0 - 0.3, under, x0 + 0.15, y - s.t - 0.24, (z0 + z1) / 2);
    for (const c of s.columns || []) {
      cyl(S, 0.11, 0.11, y - s.t - 0.24, under, c[0], (y - s.t - 0.24) / 2, c[1], { seg: 14 });
      cyl(S, 0.18, 0.2, 0.08, shade(under, 0.8), c[0], 0.04, c[1], { seg: 14 });
      box(S, 0.3, 0.06, 0.3, shade(under, 0.8), c[0], y - s.t - 0.27, c[1]);
    }
  }

  // ---- stairs: open metal treads between two stringers, a handrail ----
  for (const st of bp.stairs || []) {
    const S = part('stairs_' + st.id);
    const y0 = LY[LI[st.from]], y1 = LY[LI[st.to]], len = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]);
    const ux = (st.b[0] - st.a[0]) / len, uz = (st.b[1] - st.a[1]) / len, n = st.steps, g = len / n, rise = (y1 - y0) / n;
    const col = pal(st.mat, '#9cc0ad');
    const G = new THREE.Group(); G.position.set(st.a[0], y0, st.a[1]); G.rotation.y = Math.atan2(-uz, ux); S.add(G);
    // local: +x up the stairs, z across (-w/2 .. w/2)
    for (let i = 0; i < n; i++) {
      const yy = (i + 1) * rise;
      block(G, g + 0.03, 0.04, st.w - 0.1, texm(plateTex('#c9d8d0')), (i + 0.5) * g, yy - 0.04, 0, { uv: 1 });
    }
    const ang = Math.atan2(y1 - y0, len), sl = Math.hypot(len, y1 - y0);
    for (const s of [-1, 1]) {
      const sg2 = box(G, sl + 0.1, 0.26, 0.05, col, len / 2, (y1 - y0) / 2 - 0.08, s * (st.w / 2 - 0.02));
      sg2.rotation.z = ang;
    }
    // handrails: the open side gets posts and a rail, the wall side a rail on brackets
    const open = st.rails === 'both' ? [-1, 1] : st.rails === 'l' ? [-1] : st.rails === 'r' ? [1] : [];
    for (const s of [-1, 1]) {
      // local z = +w/2 is the right going up? G turned by atan2(-uz, ux): local +z = world (uz?, ...) -> right
      const z = s * (st.w / 2 + (open.includes(s) ? 0.02 : -0.05)), hRail = 0.92;
      rod(G, [0, hRail, z], [len, (y1 - y0) + hRail, z], 0.03, col, { seg: 8 });
      if (open.includes(s)) {
        for (let t = 0.15; t < len; t += 0.95) rod(G, [t, (t / len) * (y1 - y0) + 0.05, z], [t, (t / len) * (y1 - y0) + hRail, z], 0.024, col, { seg: 6 });
        rod(G, [0, 0.46, z], [len, (y1 - y0) + 0.46, z], 0.016, col, { seg: 6 });
      } else for (let t = 0.6; t < len; t += 1.4) rod(G, [t, (t / len) * (y1 - y0) + hRail, z], [t, (t / len) * (y1 - y0) + hRail, z - s * 0.08], 0.015, col, { seg: 5, line: false });
    }
  }

  // ---- railings ----
  for (const r of bp.rails || []) {
    const R = part('rail_' + r.id), y = LY[LI[r.level]], col = pal(r.mat, '#9cc0ad'), h = r.h || 1;
    for (let i = 0; i + 1 < r.path.length; i++) {
      const [ax, az] = r.path[i], [bx, bz] = r.path[i + 1], len = Math.hypot(bx - ax, bz - az);
      rod(R, [ax, y + h, az], [bx, y + h, bz], 0.035, col, { seg: 10 });
      rod(R, [ax, y + 0.1, az], [bx, y + 0.1, bz], 0.022, col, { seg: 6 });
      const np = Math.max(1, Math.round(len / 1.25));
      for (let k = 0; k <= np; k++) { const t = k / np; block(R, 0.06, h, 0.06, col, ax + (bx - ax) * t, y, az + (bz - az) * t); }
      const nb = Math.round(len / 0.13);
      for (let k = 1; k < nb; k++) { const t = k / nb; block(R, 0.022, h - 0.12, 0.022, col, ax + (bx - ax) * t, y + 0.1, az + (bz - az) * t, { line: k % 2 === 0 }); }
    }
  }

  // ---- runs: pipes (with elbows and flanges) and beams ----
  for (const r of bp.runs || []) {
    const P = part('run_' + r.id), col = pal(r.mat, '#8cc4a2');
    P.userData.high = r.pts.every((q) => q[1] > 5);   // high up: no shadow stripes across the floor
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (r.type === 'beam') {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const m = box(P, r.r * 1.6, r.r * 2.4, len, texm(metal(col)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { uv: 1 });
        m.lookAt(b[0], b[1], b[2]);
        // hangers up to the vault
        for (const t of [0.1, 0.5, 0.9]) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t; rod(P, [x, y + r.r * 1.2, z], [x, y + 1.6, z], 0.02, '#5a6068', { seg: 5 }); }
        continue;
      }
      rod(P, a, b, r.r, col, { seg: 12 });
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (let t = 1.2; t < len - 0.6; t += 2.6) {
        const k = t / len, p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        const q = [a[0] + (b[0] - a[0]) * (k + 0.05 / len), a[1] + (b[1] - a[1]) * (k + 0.05 / len), a[2] + (b[2] - a[2]) * (k + 0.05 / len)];
        rod(P, p, q, r.r * 1.35, shade(col, 0.82), { seg: 12 });
      }
    }
    for (let i = 1; i + 1 < r.pts.length; i++) sphere(P, r.r * 1.15, col, ...r.pts[i], { seg: 12, rings: 8 });
  }

  // ---- props ----
  const propGroups = [];
  for (const p of bp.props) {
    const G = buildProp(p, cat);
    const L = LI[p.level], mount = propMount(p, cat), s = (p.params && p.params.size3) || cat[p.type].size;
    let y = LY[L] + (p.y || 0);
    if (mount === 'wall') y = LY[L] + p.y;
    if (mount === 'ceiling') y = p.y;
    G.position.set(p.pos[0], y, p.pos[1]);
    G.rotation.y = (p.rot || 0) * D2R;
    // hanging things carry light and air, not shadows
    if (mount === 'ceiling') G.userData.high = true;
    root.add(G); parts.push(G); propGroups.push(G);
    void s;
  }

  // ---- light: pools on the floor under lamps, warm patches under windows ----
  const LG = part('light');
  const lamps = (bp.lights && bp.lights.lamps) || [];
  for (const l of lamps) {
    const lv = l.kind === 'desk' ? l.pos[1] - 0.52 : (() => { let best = 0; for (const y of LY) if (y <= l.pos[1] - 0.4) best = y; return best; })();
    const r = l.r * (l.kind === 'pendant' ? 1.0 : 1);
    const g = new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, glow(poolTex(), l.color, l.kind === 'pendant' ? 0.32 : l.kind === 'panel' ? 0.2 : 0.4));
    m.position.set(l.pos[0], lv + 0.015, l.pos[2]); m.userData.outline = false; m.userData.noShadow = true; LG.add(m);
  }
  // sunlight through the big windows lying on the floor in front of them
  for (const w of bp.walls) for (const sg of wallSegments(w)) for (const o of sg.openings) {
    if (o.type !== 'window' || o.style === 'round') continue;
    const mid = [sg.a[0] + sg.dir[0] * o.at, sg.a[1] + sg.dir[1] * o.at];
    for (const s of [1, -1]) {
      const nx = -sg.dir[1] * s, nz = sg.dir[0] * s;
      // the floor this window lights: the level whose floor is just below its sill
      let L = -1; LY.forEach((y, i) => { if (y <= LY[LI[w.level]] + (o.sill || 0) + 0.05) L = i; });
      const fx = mid[0] + nx * 1.6, fz = mid[1] + nz * 1.6;
      if (L < 0 || (o.sill || 0) + LY[LI[w.level]] - LY[L] > 1.5 || !zoneAt(L, fx, fz)) continue;
      const len = 2.2 + (o.sill || 0) * 0.15;
      const g = new THREE.PlaneGeometry(o.w * 0.95, len).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, glow(softRect(), '#fff1cc', 0.42));
      m.position.set(mid[0] + nx * (len / 2 + 0.2), LY[L] + 0.013, mid[1] + nz * (len / 2 + 0.2));
      // the long side runs along the light, away from the wall
      m.rotation.set(0, Math.atan2(nx, nz), 0);
      m.userData.outline = false; m.userData.noShadow = true; LG.add(m);
    }
  }

  for (const g of parts) if (g.userData.high) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } });
  // ---- ink, then merge everything by material ----
  const edges = inkAndMerge(root, parts);
  let tris = 0, meshes = 0;
  root.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  return { group: root, space, lamps, edges, stats: { meshes, tris: Math.round(tris), edges: edges.k.length } };
}

// Each part's edges cut against the part's other pieces (outline.js
// partEdges), in the root's space; then every mesh is merged with the others
// of its material (flat colours as vertex colours) and shadow setting.
function inkAndMerge(root, parts) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const all = { pos: [], n1: [], n2: [], k: [] };
  const noInk = (o) => { for (let q = o; q && q !== root; q = q.parent) { const k = q.userData.outline; if (k === false || k === 'skip' || k === 'leaf') return true; } return false; };
  for (const G of parts) {
    const list = [];
    G.traverse((o) => { if (o.isMesh && !noInk(o) && !inkSkip(Array.isArray(o.material) ? o.material[0] : o.material)) list.push(o); });
    if (!list.length) continue;
    const mats = list.map((o) => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const solids = list.map((o, i) => inkSolid(o.geometry, mats[i]));
    list.forEach((o, i) => { const e = partEdges(o.geometry, mats[i], solids, i); for (const k of ['pos', 'n1', 'n2', 'k']) for (const v of e[k]) all[k].push(v); });
  }
  // merge
  const groups = new Map(), done = [];
  const bakeable = (m) => !m.vertexColors && !m.map;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material, ns = !!o.userData.noShadow || !o.castShadow, leaf = o.userData.outline === 'leaf' || (m.alphaTest > 0 && m.map);
    const bake = bakeable(m);
    const key = [m.type, m.name, bake ? 'vc' : m.uuid, m.map ? m.map.uuid : '', m.side, m.transparent, m.opacity, m.blending, ns, leaf, m.customProgramCacheKey ? m.customProgramCacheKey() : ''].join('|');
    if (!groups.has(key)) {
      let nm = m;
      if (bake) { nm = m.clone(); nm.onBeforeCompile = m.onBeforeCompile; nm.customProgramCacheKey = m.customProgramCacheKey; nm.color.setRGB(1, 1, 1); nm.vertexColors = true; nm.name = m.name; }
      groups.set(key, { m: nm, bake, ns, leaf, list: [] });
    }
    groups.get(key).list.push(o);
    done.push(o);
  });
  for (const o of done) o.parent.remove(o);
  for (const c of root.children.slice()) root.remove(c);
  let i = 0;
  for (const { m, bake, ns, leaf, list } of groups.values()) {
    const geos = list.map((o) => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (bake) {
        const n = g.attributes.position.count, col = new Float32Array(n * 3), cc = o.material.color;
        for (let j = 0; j < n; j++) { col[j * 3] = cc.r; col[j * 3 + 1] = cc.g; col[j * 3 + 2] = cc.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      } else if (!m.vertexColors && g.attributes.color) g.deleteAttribute('color');
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      return g;
    });
    const g0 = mergeGeometries(geos, false);
    if (!g0) continue;
    const g = mergeVertices(g0, 1e-4);   // shared corners: a third of the vertices
    const M = new THREE.Mesh(g, m);
    M.name = `${leaf ? 'leaf' : m.name || 'm'}_${i++}${ns ? '_ns' : ''}`;
    M.castShadow = !ns; M.receiveShadow = true;
    if (leaf) M.userData.outline = 'leaf';
    root.add(M);
  }
  root.userData.inkEdges = all;
  return all;
}
void rng; void hash; void extrude; void plane; void torus; void unlit;
