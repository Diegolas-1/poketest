// A small software renderer for checking generated meshes without a browser:
// orthographic views, z-buffered, flat-band shading by normal, written as PNG.
//   sheet([{ mesh: { pos, idx, col? }, label }], { views: ['front', 'side', 'back', 'q34'], px: 400, ppm }) -> PNG bytes
import zlib from 'node:zlib';

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy ? rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3) : raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const VIEWS = { front: 0, q34: -0.6, side: -Math.PI / 2, back: Math.PI, q34b: 2.4 };

// draw into rgb (w x h) a mesh turned by yaw about y, centred at (cx, cy) px, ppm px per metre
function draw(rgb, zb, w, h, mesh, view, ppm, ox, oy, wire) {
  const P = mesh.pos, I = mesh.idx, C = mesh.col, n = P.length / 3;
  const yaw = typeof view === 'number' ? view : view.yaw || 0, pitch = typeof view === 'number' ? 0 : view.pitch || 0, pc = view.pivot || [0, 0, 0];
  const cs = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // turn a point: yaw about y, then pitch about x (positive looks down on it), about the pivot
  const turn = (x, y, z) => { x -= pc[0]; y -= pc[1]; z -= pc[2]; const rx = x * cs + z * sn, rz = -x * sn + z * cs; return [rx + pc[0], y * cp - rz * sp + pc[1], y * sp + rz * cp + pc[2]]; };
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const [rx, ry, rz] = turn(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
    X[v] = ox + rx * ppm; Y[v] = oy - ry * ppm; Z[v] = rz;
  }
  const L = [0.45, 0.6, 0.66];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = X[b] - X[a], uy = Y[b] - Y[a], vx = X[c] - X[a], vy = Y[c] - Y[a];
    const area = ux * vy - uy * vx;
    if (area >= 0) continue;   // back face (screen y down)
    // world normal of the turned triangle
    const ax = (P[3 * b] - P[3 * a]), ay = (P[3 * b + 1] - P[3 * a + 1]), az = (P[3 * b + 2] - P[3 * a + 2]);
    const bx = (P[3 * c] - P[3 * a]), by = (P[3 * c + 1] - P[3 * a + 1]), bz = (P[3 * c + 2] - P[3 * a + 2]);
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const rnx = nx * cs + nz * sn, rnz0 = -nx * sn + nz * cs, rny = ny * cp - rnz0 * sp, rnz = ny * sp + rnz0 * cp;
    let l = rnx * L[0] + rny * L[1] + rnz * L[2];
    const band = l > 0.55 ? 1 : l > 0.15 ? 0.82 : 0.62;
    const base = C ? [C[3 * a], C[3 * a + 1], C[3 * a + 2]] : [235, 200, 175];
    const col = base.map((v) => Math.min(255, v * band));
    const minx = Math.max(0, Math.floor(Math.min(X[a], X[b], X[c]))), maxx = Math.min(w - 1, Math.ceil(Math.max(X[a], X[b], X[c])));
    const miny = Math.max(0, Math.floor(Math.min(Y[a], Y[b], Y[c]))), maxy = Math.min(h - 1, Math.ceil(Math.max(Y[a], Y[b], Y[c])));
    for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const w0 = ((X[b] - sx) * (Y[c] - sy) - (Y[b] - sy) * (X[c] - sx)) / area;
      const w1 = ((X[c] - sx) * (Y[a] - sy) - (Y[c] - sy) * (X[a] - sx)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * Z[a] + w1 * Z[b] + w2 * Z[c], k = py * w + px;
      if (z <= zb[k]) continue;
      zb[k] = z;
      const edge = wire && Math.min(w0, w1, w2) < 0.06;
      rgb[3 * k] = edge ? col[0] * 0.6 : col[0]; rgb[3 * k + 1] = edge ? col[1] * 0.6 : col[1]; rgb[3 * k + 2] = edge ? col[2] * 0.6 : col[2];
    }
  }
}

// items: [{ meshes: [mesh..], label }], one column per view per item
export function sheet(items, o = {}) {
  const views = o.views || ['front', 'q34', 'side', 'back'], ppm = o.ppm || 220, cw = o.cw || Math.round(ppm * 0.9), ch = o.ch || Math.round(ppm * 1.95);
  const w = cw * views.length * items.length, h = ch;
  const rgb = new Uint8Array(w * h * 3).fill(0);
  for (let i = 0; i < w * h; i++) { rgb[3 * i] = 228; rgb[3 * i + 1] = 236; rgb[3 * i + 2] = 240; }
  const zb = new Float32Array(w * h).fill(-1e9);
  items.forEach((it, ii) => views.forEach((v, vi) => {
    const ox = (ii * views.length + vi) * cw + cw / 2, oy = ch - 8 - (o.y0 || 0) * ppm;
    for (const m of it.meshes) draw(rgb, zb, w, h, m, VIEWS[v] ?? v, ppm, ox, oy, o.wire);
    // guide lines every head height if given
    if (it.guides) for (const g of it.guides) { const y = Math.round(oy - g * ppm); if (y >= 0 && y < h) for (let x = (ii * views.length + vi) * cw; x < (ii * views.length + vi + 1) * cw; x += 2) { const k = y * w + x; rgb[3 * k] = 120; rgb[3 * k + 1] = 120; rgb[3 * k + 2] = 160; } }
  }));
  return png(w, h, Buffer.from(rgb.buffer));
}
// a close-up: crop region [x0, y0, x1, y1] metres in view space
export function closeup(meshes, view, box, px = 600, wire = false) {
  const ppm = px / (box[2] - box[0]), w = px, h = Math.round((box[3] - box[1]) * ppm);
  const rgb = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) { rgb[3 * i] = 228; rgb[3 * i + 1] = 236; rgb[3 * i + 2] = 240; }
  const zb = new Float32Array(w * h).fill(-1e9);
  for (const m of meshes) draw(rgb, zb, w, h, m, VIEWS[view] ?? view, ppm, -box[0] * ppm, box[3] * ppm, wire);
  return png(w, h, Buffer.from(rgb.buffer));
}
