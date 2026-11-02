// Top-down plan of a map blueprint on a 2D canvas: the seed of the minimap
// and the world map. Draws zones in their floor colours, walls with their
// openings (doors with their swing, windows as thin double lines, walk-through
// arches as gaps), slabs over a lower level (dashed), stairs with their
// treads and an UP arrow, railings, every prop as its footprint in the
// catalog's plan colour, actors, spawns, portals, lamps, and on request the
// camera volumes, labels, a scale bar and a north arrow.
//
//   drawPlan(ctx, bp, cat, {x, y, scale (px per m), level ('all' or a level id),
//            labels, props, camera, legend, fade (alpha for other levels)})
import { wallSegments, propBox, propShape, propMount, passable } from './format.js';

const D2R = Math.PI / 180;
export function planSize(bp, scale, pad = 0) {
  const [x0, z0, x1, z1] = bp.bounds;
  return [Math.ceil((x1 - x0) * scale + pad * 2), Math.ceil((z1 - z0) * scale + pad * 2)];
}

export function drawPlan(ctx, bp, cat, o = {}) {
  const s = o.scale || 30, [bx0, bz0] = bp.bounds, ox = (o.x || 0) - bx0 * s, oy = (o.y || 0) - bz0 * s;
  const P = (x, z) => [ox + x * s, oy + z * s];
  const LI = Object.fromEntries(bp.levels.map((l, i) => [l.id, i]));
  const showL = (l) => o.level === undefined || o.level === 'all' || o.level === l;
  const col = (m, f = '#ddd') => (bp.palette[m] ? bp.palette[m].color : f);
  const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); };
  const font = (px, w = 600) => { ctx.font = `${w} ${Math.round(px)}px "Fredoka", system-ui, sans-serif`; };
  const label = (t, x, z, px, c = '#2c3446', bg = null) => {
    font(px); const [px0, py0] = P(x, z); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bg) { const wd = ctx.measureText(t).width + px * 0.6; ctx.fillStyle = bg; ctx.fillRect(px0 - wd / 2, py0 - px * 0.65, wd, px * 1.3); }
    ctx.fillStyle = c; ctx.fillText(t, px0, py0);
  };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // floors: zones (tile grid) and slabs
  for (const z of bp.zones) {
    if (!showL(z.level)) continue;
    poly(z.poly); ctx.fillStyle = col(z.floor); ctx.fill();
    // a tile grid clipped to the zone
    ctx.save(); poly(z.poly); ctx.clip();
    const pat = (bp.palette[z.floor] || {}).pattern, step = pat === 'tile05' ? 0.5 : 1;
    ctx.strokeStyle = 'rgba(40,30,70,.12)'; ctx.lineWidth = 1;
    const [x0, z0, x1, z1] = bp.bounds;
    for (let x = Math.ceil(x0); x <= x1; x += step) { ctx.beginPath(); ctx.moveTo(...P(x, z0)); ctx.lineTo(...P(x, z1)); ctx.stroke(); }
    for (let zz = Math.ceil(z0); zz <= z1; zz += step) { ctx.beginPath(); ctx.moveTo(...P(x0, zz)); ctx.lineTo(...P(x1, zz)); ctx.stroke(); }
    ctx.restore();
  }
  for (const sl of bp.slabs || []) {
    if (!showL(sl.level)) {
      // a slab overhead: dashed outline and a light hatch
      if (o.level !== undefined && o.level !== 'all') { poly(sl.poly); ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(40,50,80,.55)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      continue;
    }
    poly(sl.poly); ctx.fillStyle = col(sl.mat); ctx.globalAlpha = o.level === 'all' ? 0.82 : 1; ctx.fill(); ctx.globalAlpha = 1;
    ctx.save(); poly(sl.poly); ctx.clip(); ctx.strokeStyle = 'rgba(40,60,60,.18)'; ctx.lineWidth = 1;
    const [x0, z0, x1, z1] = bp.bounds; for (let k = x0 - 30; k < x1 + 30; k += 0.4) { ctx.beginPath(); ctx.moveTo(...P(k, z0)); ctx.lineTo(...P(k + (z1 - z0), z1)); ctx.stroke(); }
    ctx.restore();
    poly(sl.poly); ctx.setLineDash([10, 6]); ctx.strokeStyle = '#2b5a4a'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
    for (const c of sl.columns || []) { const [px, py] = P(...c); ctx.fillStyle = '#4a6a5a'; ctx.beginPath(); ctx.arc(px, py, 0.14 * s, 0, 6.28); ctx.fill(); }
  }
  // stairs
  for (const st of bp.stairs || []) {
    const len = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]), ux = (st.b[0] - st.a[0]) / len, uz = (st.b[1] - st.a[1]) / len, nx = -uz, nz = ux;
    const c = (t, sd) => [st.a[0] + ux * t + nx * sd * st.w / 2, st.a[1] + uz * t + nz * sd * st.w / 2];
    poly([c(0, -1), c(len, -1), c(len, 1), c(0, 1)]); ctx.fillStyle = col(st.mat, '#9cc0ad'); ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,40,.6)'; ctx.lineWidth = 1.2;
    for (let i = 0; i <= st.steps; i++) { const t = (len * i) / st.steps; ctx.beginPath(); ctx.moveTo(...P(...c(t, -1))); ctx.lineTo(...P(...c(t, 1))); ctx.stroke(); }
    ctx.strokeStyle = '#1e2a40'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(...P(...c(len * 0.08, 0))); ctx.lineTo(...P(...c(len * 0.9, 0))); ctx.stroke();
    const [hx, hy] = P(...c(len * 0.93, 0)), a = Math.atan2(uz, ux);
    ctx.fillStyle = '#1e2a40'; ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 9, hy + Math.sin(a) * 9); ctx.lineTo(hx + Math.cos(a + 2.5) * 9, hy + Math.sin(a + 2.5) * 9); ctx.lineTo(hx + Math.cos(a - 2.5) * 9, hy + Math.sin(a - 2.5) * 9); ctx.fill();
    if (o.labels !== false) label('UP', ...c(len * 0.18, 0), s * 0.32, '#1e2a40', 'rgba(255,255,255,.7)');
  }
  // props (floor ones first, then wall, then hanging as outlines)
  if (o.props !== false) {
    const order = { floor: 0, top: 1, wall: 2, ceiling: 3 };
    const list = bp.props.filter((p) => showL(p.level) && cat[p.type]).sort((a, b) => order[propMount(a, cat)] - order[propMount(b, cat)]);
    for (const p of list) {
      const b = propBox(p, cat), mount = propMount(p, cat), [pc] = cat[p.type].plan || ['#999'];
      const fade = o.level === 'all' && LI[p.level] > 0 ? 0.8 : 1;
      ctx.save(); ctx.translate(...P(b[0], b[1])); ctx.rotate(-b[4]);
      ctx.globalAlpha = fade;
      if (mount === 'ceiling') { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#3a3050'; ctx.lineWidth = 1.5; }
      if (propShape(p, cat) === 'round') { ctx.beginPath(); ctx.arc(0, 0, Math.max(b[2], b[3]) * s, 0, 6.28); }
      else { ctx.beginPath(); ctx.rect(-b[2] * s, -b[3] * s, b[2] * 2 * s, b[3] * 2 * s); }
      if (mount === 'ceiling') ctx.stroke();
      else { ctx.fillStyle = pc; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,40,.75)'; ctx.lineWidth = 1.3; ctx.stroke();
        // a tick on the front edge
        ctx.strokeStyle = 'rgba(20,20,40,.75)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-b[2] * s * 0.4, b[3] * s); ctx.lineTo(b[2] * s * 0.4, b[3] * s); ctx.stroke(); }
      ctx.restore();
    }
  }
  // walls with their openings
  for (const w of bp.walls) {
    if (!showL(w.level) && !(o.level && w.h + bp.levels[LI[w.level]].y > bp.levels[LI[o.level]].y)) continue;
    for (const sg of wallSegments(w)) {
      const cuts = sg.openings.filter((op) => op.type !== 'window' || true).map((op) => [op.at - op.w / 2, op.at + op.w / 2, op]).sort((a, b) => a[0] - b[0]);
      const pt = (u) => [sg.a[0] + sg.dir[0] * u, sg.a[1] + sg.dir[1] * u];
      let u = -w.t / 2;
      ctx.strokeStyle = '#232838'; ctx.lineWidth = w.t * s; ctx.lineCap = 'square';
      const seg = (a, b) => { if (b - a < 0.01) return; ctx.beginPath(); ctx.moveTo(...P(...pt(a))); ctx.lineTo(...P(...pt(b))); ctx.stroke(); };
      for (const [a, b] of cuts) { seg(u, a); u = Math.max(u, b); }
      seg(u, sg.len + w.t / 2);
      for (const [a, b, op] of cuts) {
        const onL = showL(op.level || w.level) || o.level === 'all';
        ctx.lineCap = 'butt';
        if (op.type === 'window') {
          // a window: a thin frame line pair in the wall's thickness (a high one dashed)
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w.t * s * 0.86; seg(a, b);
          ctx.strokeStyle = (op.sill || 0) > 2.5 ? '#6aa8d8' : '#3a78b8'; ctx.lineWidth = 2; if ((op.sill || 0) > 2.5) ctx.setLineDash([5, 3]);
          for (const sd of [-0.18, 0.18]) { const n = [-sg.dir[1] * sd * w.t, sg.dir[0] * sd * w.t]; ctx.beginPath(); ctx.moveTo(...P(pt(a)[0] + n[0], pt(a)[1] + n[1])); ctx.lineTo(...P(pt(b)[0] + n[0], pt(b)[1] + n[1])); ctx.stroke(); }
          ctx.setLineDash([]);
        } else if (op.type === 'door' && onL) {
          // the door's swing (into the room)
          const n = [-sg.dir[1], sg.dir[0]], hinge = pt(a), r = op.w * (op.style === 'double' ? 0.5 : 1);
          ctx.strokeStyle = op.locked ? '#a03030' : '#8a5634'; ctx.lineWidth = 2;
          const swing = (h, dirU) => {
            const [hx, hy] = P(...h), ang0 = Math.atan2(sg.dir[1] * dirU, sg.dir[0] * dirU), ang1 = Math.atan2(n[1], n[0]);
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ang1) * r * s, hy + Math.sin(ang1) * r * s); ctx.stroke();
            ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(hx, hy, r * s, Math.min(ang0, ang1), Math.max(ang0, ang1)); ctx.stroke(); ctx.setLineDash([]);
          };
          if (op.style === 'double') { swing(hinge, 1); swing(pt(b), -1); } else swing(hinge, 1);
        }
        void passable;
      }
    }
  }
  // railings
  for (const r of bp.rails || []) {
    if (!showL(r.level)) continue;
    ctx.strokeStyle = '#2b5a4a'; ctx.lineWidth = 3; ctx.setLineDash([2, 4]); ctx.beginPath();
    r.path.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]);
  }
  // camera volumes
  if (o.camera) for (const v of bp.camera.volumes) {
    const [x0, , z0, x1, , z1] = v.box; poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    ctx.strokeStyle = 'rgba(220,60,140,.8)'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
  }
  // portals, spawns, actors, lamps
  for (const p of bp.portals || []) { if (!showL(p.level)) continue; const [a, b, c, d] = p.rect; poly([[a, b], [c, b], [c, d], [a, d]]); ctx.fillStyle = 'rgba(60,200,110,.55)'; ctx.fill(); ctx.strokeStyle = '#1f8a4a'; ctx.lineWidth = 2; ctx.stroke(); }
  for (const sp of bp.spawns || []) {
    if (!showL(sp.level)) continue;
    const [px, py] = P(...sp.pos), a = (90 - (sp.rot || 0)) * D2R;
    ctx.fillStyle = '#1f8a4a'; ctx.beginPath(); ctx.moveTo(px + Math.sin(sp.rot * D2R) * 12, py + Math.cos(sp.rot * D2R) * 12);
    ctx.lineTo(px + Math.sin(sp.rot * D2R + 2.4) * 8, py + Math.cos(sp.rot * D2R + 2.4) * 8); ctx.lineTo(px + Math.sin(sp.rot * D2R - 2.4) * 8, py + Math.cos(sp.rot * D2R - 2.4) * 8); ctx.fill(); void a;
  }
  for (const a of bp.actors || []) {
    if (!showL(a.level)) continue;
    const [px, py] = P(...a.pos); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#7a2a8a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, 0.3 * s, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.sin((a.rot || 0) * D2R) * 0.45 * s, py + Math.cos((a.rot || 0) * D2R) * 0.45 * s); ctx.stroke();
  }
  ctx.restore();
  return { P };
}
