// A pattern piece of any shape: its outline as named segments (cm, going round it), meshed into
// even triangles (boundary points spaced along the outline, a triangular lattice inside, Delaunay
// between them). The segments' names are the edges seams are sewn along.
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.env.ESB || '', 'node_modules') + '/');
const Delaunator = req('delaunator').default || req('delaunator');

// segments: [{ name, pts: [[x, y], ...] }], each starting where the last ended, closing the loop
export function outlinePiece(name, segments, h = 1.3) {
  const pts = [], edges = {}, loop = [];
  for (const seg of segments) {
    const ids = [];
    // resample the segment at about h
    const P = seg.pts, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / h));
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * L; let i = 1; while (i < P.length - 1 && cum[i] < t) i++;
      const s = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), p = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * s, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * s];
      // the segment's first point is the last one's end
      if (k === 0 && loop.length) { ids.push(loop[loop.length - 1]); continue; }
      if (k === n && seg === segments[segments.length - 1]) { ids.push(loop[0]); continue; }
      ids.push(pts.length); loop.push(pts.length); pts.push(p);
    }
    edges[seg.name] = ids;
  }
  const poly = loop.map((i) => pts[i]);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const nb = pts.length;
  for (let r = 0, y = y0 + h * 0.5; y < y1; y += h * 0.866, r++) for (let x = x0 + (r % 2 ? h / 2 : 0); x < x1; x += h) {
    if (inside(poly, x, y) && distToPoly(poly, x, y) > h * 0.5) pts.push([x, y]);
  }
  const d = new Delaunator(pts.flat());
  const tris = [];
  for (let t = 0; t < d.triangles.length; t += 3) {
    const [a, b, c] = [d.triangles[t], d.triangles[t + 1], d.triangles[t + 2]];
    const cx = (pts[a][0] + pts[b][0] + pts[c][0]) / 3, cy = (pts[a][1] + pts[b][1] + pts[c][1]) / 3;
    if (!inside(poly, cx, cy)) continue;
    // no triangle across a hollow of the outline
    if (a < nb && b < nb && c < nb) { const mx = [(pts[a][0] + pts[b][0]) / 2, (pts[b][0] + pts[c][0]) / 2, (pts[c][0] + pts[a][0]) / 2], my = [(pts[a][1] + pts[b][1]) / 2, (pts[b][1] + pts[c][1]) / 2, (pts[c][1] + pts[a][1]) / 2]; if (!mx.every((x, k) => inside(poly, x, my[k]) || distToPoly(poly, x, my[k]) < 1e-3)) continue; }
    tris.push(a, b, c);
  }
  // all the same way round
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    if ((pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]) < 0) { tris[t + 1] = c; tris[t + 2] = b; }
  }
  return { name, uv: Float32Array.from(pts.flat()), tris, edges, n: pts.length, outline: segments };
}

export function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToPoly(poly, x, y) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l));
    d = Math.min(d, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return d;
}

// smooth curves for drafting: a quadratic Bezier through a control point, and its length
export function bez(a, c, b, n = 10) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return out; }
export function cubic(a, c1, c2, b, n = 14) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([0, 1].map((k) => u * u * u * a[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * b[k])); } return out; }
export const len = (pl) => pl.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pl[i][0], p[1] - pl[i][1]), 0);
export const rev = (pl) => pl.slice().reverse();
