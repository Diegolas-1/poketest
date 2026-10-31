// Ash V2's clothes, made from his own body: each garment is a region of the body's surface (cut out
// along smooth fields, so hems and seams are clean curves rather than the triangles' jagged edges),
// lifted off the skin, smoothed so it reads as cloth over the body rather than paint on it, and
// skinned to the same bones as the skin under it, so it moves with every animation. The skin a
// garment covers is hidden, so it can't poke through.
//
// All of it in the body's bind space: Y up, front +Z, his left +X; the body is 2 units tall
// (feet -1, crown 1), the neck about 0.48, the waist 0, the knees -0.5, the ankles -0.83.
import * as THREE from 'three';

const XC = -0.006;                                   // his centre line

// ---------- the body, welded (its UV seams split vertices that are one point on the skin) ----------
function bodyData(body) {
  const g = body.geometry, pos = g.attributes.position, nrm = g.attributes.normal;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index.array;
  const key = new Map(), weld = new Int32Array(pos.count), P = [], N = [], J = [], W = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * 2e4) + ',' + Math.round(y * 2e4) + ',' + Math.round(z * 2e4);
    let w = key.get(k);
    if (w === undefined) {
      w = P.length / 3; key.set(k, w);
      P.push(x, y, z); N.push(0, 0, 0);
      for (let c = 0; c < 4; c++) { J.push(si.getComponent(i, c)); W.push(sw.getComponent(i, c)); }
    }
    weld[i] = w;
    N[w * 3] += nrm.getX(i); N[w * 3 + 1] += nrm.getY(i); N[w * 3 + 2] += nrm.getZ(i);
  }
  for (let w = 0; w < N.length; w += 3) { const l = Math.hypot(N[w], N[w + 1], N[w + 2]) || 1; N[w] /= l; N[w + 1] /= l; N[w + 2] /= l; }
  const T = new Int32Array(idx.length);
  for (let i = 0; i < idx.length; i++) T[i] = weld[idx[i]];
  const bones = body.skeleton.bones, bind = {}, id = {};
  bones.forEach((b, i) => { bind[b.name] = new THREE.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[i].clone().invert()); id[b.name] = i; });
  return { P, N, J, W, T, weld, n: P.length / 3, bind, id, names: bones.map((b) => b.name) };
}

// what a field sees of a vertex: where it is, and how much of it each bone moves
function view(names, P, J, W, i) {
  const p = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const w = (test) => { let s = 0; for (let c = 0; c < 4; c++) if (W[i * 4 + c] > 0 && test(names[J[i * 4 + c]])) s += W[i * 4 + c]; return s; };
  let dom = 0; for (let c = 1; c < 4; c++) if (W[i * 4 + c] > W[i * 4 + dom]) dom = c;
  return { p, w, dom: names[J[i * 4 + dom]] };
}
const vertexView = (B, i) => view(B.names, B.P, B.J, B.W, i);

// ---------- shape helpers (bind space) ----------
function limb(B, a, b) {                               // a bone's segment: where along it (0..1), and how far off its line
  const A = B.bind[a], d = new THREE.Vector3().subVectors(B.bind[b], A), L = d.length(); d.divideScalar(L);
  const q = new THREE.Vector3();
  return (p) => { q.subVectors(p, A); const t = q.dot(d); return { s: t / L, L, r: Math.sqrt(Math.max(0, q.lengthSq() - t * t)) }; };
}
const side = (p) => (p.x > XC ? 'Left' : 'Right');
const isArm = (side) => (n) => n.startsWith(side + 'Arm') || n.startsWith(side + 'ForeArm') || n.startsWith(side + 'Hand');
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// a neckline: a bowl round the neck, lower at the front by `drop`; inside (the garment) is below it
function neckline(y0, drop, open = 0.065) {
  return ({ p }) => {
    const dx = p.x - XC, dz = p.z - 0.0, r = Math.hypot(dx, dz), front = Math.max(0, dz / (r || 1));
    return p.y - (y0 - drop * front * front + 3.2 * Math.max(0, r - open) ** 2);
  };
}

// ---------- the mesh cutter ----------
// a mesh here: base points on the skin (P), their normals (N), skinning (J, W) and the value of
// every field at every vertex (F[k]); cutting along field k splits each triangle it crosses, the
// new vertices shared between neighbours, every field interpolated to them
function regionMesh(B, fields, keepRaw) {
  const F = fields.map(() => new Float32Array(B.n));
  for (let i = 0; i < B.n; i++) { const v = vertexView(B, i); fields.forEach((f, k) => { F[k][i] = f(v); }); }
  // start from the body triangles touching the region (any vertex inside every region field, or near)
  const M = { P: [], N: [], J: [], W: [], F: fields.map(() => []), T: [] }, map = new Int32Array(B.n).fill(-1);
  const near = (i) => keepRaw.every((k) => F[k][i] < 0.03);
  const add = (i) => {
    if (map[i] >= 0) return map[i];
    map[i] = M.P.length / 3;
    for (let c = 0; c < 3; c++) { M.P.push(B.P[i * 3 + c]); M.N.push(B.N[i * 3 + c]); }
    for (let c = 0; c < 4; c++) { M.J.push(B.J[i * 4 + c]); M.W.push(B.W[i * 4 + c]); }
    F.forEach((a, k) => M.F[k].push(a[i]));
    return map[i];
  };
  for (let t = 0; t < B.T.length; t += 3) {
    const a = B.T[t], b = B.T[t + 1], c = B.T[t + 2];
    if (a === b || b === c || a === c) continue;
    if (near(a) || near(b) || near(c)) M.T.push(add(a), add(b), add(c));
  }
  return M;
}

function cut(M, k) {
  const f = M.F[k];
  for (let i = 0; i < f.length; i++) if (Math.abs(f[i]) < 1e-7) f[i] = 1e-7;
  const edges = new Map(), T = M.T, out = [];
  const mid = (a, b) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let m = edges.get(key);
    if (m !== undefined) return m;
    const t = f[a] / (f[a] - f[b]); m = M.P.length / 3;
    for (let c = 0; c < 3; c++) M.P.push(M.P[a * 3 + c] + (M.P[b * 3 + c] - M.P[a * 3 + c]) * t);
    let nx = M.N[a * 3] + (M.N[b * 3] - M.N[a * 3]) * t, ny = M.N[a * 3 + 1] + (M.N[b * 3 + 1] - M.N[a * 3 + 1]) * t, nz = M.N[a * 3 + 2] + (M.N[b * 3 + 2] - M.N[a * 3 + 2]) * t;
    const l = Math.hypot(nx, ny, nz) || 1; M.N.push(nx / l, ny / l, nz / l);
    const s = t < 0.5 ? a : b;
    for (let c = 0; c < 4; c++) { M.J.push(M.J[s * 4 + c]); M.W.push(M.W[s * 4 + c]); }
    for (const g of M.F) g.push(g[a] + (g[b] - g[a]) * t);
    edges.set(key, m); return m;
  };
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t], T[t + 1], T[t + 2]], s = v.map((i) => f[i] < 0);
    const n = s.filter(Boolean).length;
    if (n === 0 || n === 3) { out.push(v[0], v[1], v[2]); continue; }
    // rotate so v[0] is the odd one out
    let o = 0; for (let i = 0; i < 3; i++) if (s[i] === (n === 1)) o = i;
    const a = v[o], b = v[(o + 1) % 3], c = v[(o + 2) % 3];
    const ab = mid(a, b), ac = mid(a, c);
    out.push(a, ab, ac, ab, b, c, ab, c, ac);
  }
  M.T = out;
}

// ---------- a garment ----------
// spec: region (fields, all <= 0 inside), panels [{ color, off, field? (<= 0 inside) }] (the first
// is the rest), smooth (iterations), loose (extra lift by height), hide (skin margin)
export function garment(B, spec) {
  const fields = [...spec.region, ...spec.panels.filter((p) => p.field).map((p) => p.field)];
  const R = spec.region.length;
  const M = regionMesh(B, fields, spec.region.map((_, k) => k));
  for (let k = 0; k < fields.length; k++) cut(M, k);
  // the triangles inside, each in its panel
  const tris = [];
  for (let t = 0; t < M.T.length; t += 3) {
    const v = [M.T[t], M.T[t + 1], M.T[t + 2]], c = (k) => (M.F[k][v[0]] + M.F[k][v[1]] + M.F[k][v[2]]) / 3;
    let ok = true; for (let k = 0; k < R; k++) if (c(k) > 0) { ok = false; break; }
    if (!ok) continue;
    let panel = 0, pk = R;
    for (let p = 1; p < spec.panels.length; p++) if (spec.panels[p].field) { if (c(pk) <= 0 && !panel) panel = p; pk++; }
    tris.push({ v, panel });
  }
  // compact, and the lift of each vertex: the most of its panels
  const remap = new Map(), base = [], nrm = [], J = [], W = [], off = [];
  const vid = (i, panel) => {
    let r = remap.get(i);
    if (r === undefined) {
      r = base.length / 3; remap.set(i, r);
      for (let c = 0; c < 3; c++) { base.push(M.P[i * 3 + c]); nrm.push(M.N[i * 3 + c]); }
      for (let c = 0; c < 4; c++) { J.push(M.J[i * 4 + c]); W.push(M.W[i * 4 + c]); }
      off.push(0);
    }
    const p = new THREE.Vector3(M.P[i * 3], M.P[i * 3 + 1], M.P[i * 3 + 2]);
    off[r] = Math.max(off[r], spec.panels[panel].off + (spec.loose ? spec.loose(p) : 0));
    return r;
  };
  const idx = tris.map(({ v, panel }) => ({ v: v.map((i) => vid(i, panel)), panel }));
  const n = off.length;
  // neighbours, and the open edges (the hems)
  const nb = Array.from({ length: n }, () => new Set()), edge = new Map();
  for (const { v } of idx) for (let e = 0; e < 3; e++) {
    const a = v[e], b = v[(e + 1) % 3]; nb[a].add(b); nb[b].add(a);
    const key = a < b ? a * 4194304 + b : b * 4194304 + a; edge.set(key, (edge.get(key) || 0) + 1);
  }
  const rim = new Uint8Array(n), rimNb = Array.from({ length: n }, () => []);
  for (const [key, c] of edge) if (c === 1) { const a = Math.floor(key / 4194304), b = key % 4194304; rim[a] = rim[b] = 1; rimNb[a].push(b); rimNb[b].push(a); }
  // lift off the skin, then smooth: inner vertices toward their neighbours, hem vertices along the
  // hem; never closer to the skin than their lift
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) P[i * 3 + c] = base[i * 3 + c] + nrm[i * 3 + c] * off[i];
  const tmp = new Float32Array(n * 3), its = spec.smooth ?? 12;
  for (let it = 0; it < its; it++) {
    for (let i = 0; i < n; i++) {
      const list = rim[i] ? rimNb[i] : nb[i];
      let x = 0, y = 0, z = 0, m = 0; for (const j of list) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; m++; }
      if (!m) { for (let c = 0; c < 3; c++) tmp[i * 3 + c] = P[i * 3 + c]; continue; }
      tmp[i * 3] = P[i * 3] + 0.6 * (x / m - P[i * 3]);
      tmp[i * 3 + 1] = P[i * 3 + 1] + 0.6 * (y / m - P[i * 3 + 1]);
      tmp[i * 3 + 2] = P[i * 3 + 2] + 0.6 * (z / m - P[i * 3 + 2]);
    }
    for (let i = 0; i < n; i++) {
      const d = (tmp[i * 3] - base[i * 3]) * nrm[i * 3] + (tmp[i * 3 + 1] - base[i * 3 + 1]) * nrm[i * 3 + 1] + (tmp[i * 3 + 2] - base[i * 3 + 2]) * nrm[i * 3 + 2];
      const push = Math.max(0, off[i] - d);
      for (let c = 0; c < 3; c++) P[i * 3 + c] = tmp[i * 3 + c] + nrm[i * 3 + c] * push;
    }
  }
  // the geometry, a group per panel (a crisp line where colours meet)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(J, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(W, 4));
  const order = [];
  spec.panels.forEach((_, p) => {
    const start = order.length; for (const t of idx) if (t.panel === p) order.push(...t.v);
    if (order.length > start) g.addGroup(start, order.length - start, p);
  });
  g.setIndex(order); g.computeVertexNormals();
  const mats = spec.panels.map((p) => new THREE.MeshStandardMaterial({ color: p.color, roughness: p.rough ?? 0.82, metalness: 0, side: THREE.DoubleSide, name: spec.name + ':' + (p.name || 'main') }));
  const mesh = new THREE.SkinnedMesh(g, mats);
  mesh.name = spec.name; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  // the skin it covers (with a margin back from its hems)
  mesh.userData.covers = (v, margin = spec.hide ?? 0.012) => spec.region.every((f) => f(v) < -margin);
  mesh.userData.view = (i) => view(B.names, base, J, W, i);
  return mesh;
}

// ---------- Ash's Kanto outfit ----------
export function dressAsh(body, THREEref) {
  const B = bodyData(body);
  const upper = { Left: limb(B, 'LeftArm', 'LeftForeArm'), Right: limb(B, 'RightArm', 'RightForeArm') };
  const fore = { Left: limb(B, 'LeftForeArm', 'LeftHand'), Right: limb(B, 'RightForeArm', 'RightHand') };
  const fingers = {};
  for (const s of ['Left', 'Right']) for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    const a = `${s}Hand${f}1`, b = `${s}Hand${f}2`; if (B.bind[a] && B.bind[b]) fingers[a] = limb(B, a, b);
  }
  // past the end of a short sleeve (on the arm only; everything else is inside)
  const sleeveEnd = (send) => (v) => { const sd = side(v.p); if (v.w(isArm(sd)) < 0.5) return -1; const u = upper[sd](v.p); return (u.s - send) * u.L; };
  const arms = (v) => (v.w(isArm(side(v.p))) > 0.5 ? 1 : -1);

  const SHIRT = '#1d2a30', JACKET = '#2c5bb5', WHITE = '#f3f1ea', GOLD = '#e2b33c', JEANS = '#4a79b4', GREEN = '#2f9a4c', SHOE = '#202226', SOLE = '#f2f0ea';

  const shirt = garment(B, {
    name: 'shirt', smooth: 10, hide: 0.012,
    region: [neckline(0.452, 0.03), (v) => -0.06 - v.p.y, sleeveEnd(0.36)],
    panels: [{ color: SHIRT, off: 0.006 }],
  });
  const openFront = (v) => { if (v.p.z < 0.02) return -1; const w = 0.022 + 0.07 * smooth(0.42, -0.08, v.p.y); return w - Math.abs(v.p.x - XC); };
  const jacket = garment(B, {
    name: 'jacket', smooth: 16, hide: 0.02,
    region: [neckline(0.462, 0.07, 0.07), (v) => -0.085 - v.p.y, sleeveEnd(0.5), openFront],
    panels: [
      { color: JACKET, off: 0.017 },
      { name: 'collar', color: WHITE, off: 0.022, field: (v) => -(neckline(0.462, 0.07, 0.07)(v) + 0.045) },
      { name: 'trim', color: GOLD, off: 0.019, field: (v) => Math.min(-(openFront(v) + 0.016), -(-0.085 - v.p.y + 0.02)) },
      { name: 'sleeves', color: WHITE, off: 0.018, field: (v) => { const u = upper[side(v.p)](v.p); return Math.max((0.12 - u.s) * u.L, u.r - 0.075); } },
    ],
  });
  const jeans = garment(B, {
    name: 'jeans', smooth: 18, hide: 0.012,
    region: [(v) => v.p.y - 0.005, (v) => -0.835 - v.p.y, arms],
    panels: [{ color: JEANS, off: 0.009 }],
    loose: (p) => 0.026 * smooth(-0.35, -0.75, p.y),
  });
  // fingerless gloves: the hand, the knuckles, half of each finger's first bone, a cuff up the wrist
  const glove = (v) => {
    const d = v.dom, sd = side(v.p);
    if (d === sd + 'ForeArm') return (0.86 - fore[sd](v.p).s) * fore[sd](v.p).L;
    if (d === sd + 'Hand') return -1;
    if (fingers[d]) { const u = fingers[d](v.p); return (u.s - (d.includes('Thumb') ? 0.35 : 0.5)) * u.L; }
    return 1;
  };
  const gloves = garment(B, { name: 'gloves', smooth: 4, hide: 0.006, region: [glove], panels: [{ color: GREEN, off: 0.0045 }] });
  const shoes = garment(B, {
    name: 'shoes', smooth: 30, hide: 0.01,
    region: [(v) => v.p.y + 0.815],
    panels: [{ color: SHOE, off: 0.02 }, { name: 'sole', color: SOLE, off: 0.022, field: (v) => v.p.y + 0.955 }],
  });

  const pieces = [shirt, jacket, jeans, gloves, shoes];
  // the skin under the clothes hidden (each skin vertex: which pieces cover it), and the shirt
  // under the jacket
  const cov = new Uint8Array(B.n);
  for (let i = 0; i < B.n; i++) { const v = vertexView(B, i); pieces.forEach((m, k) => { if (m.userData.covers(v)) cov[i] |= 1 << k; }); }
  const bodyAll = Array.from(body.geometry.index.array), weld = B.weld;
  const shirtAll = Array.from(shirt.geometry.index.array), sv = shirt.userData.view;
  const underJacket = new Uint8Array(shirt.geometry.attributes.position.count);
  for (let i = 0; i < underJacket.length; i++) underJacket[i] = jacket.userData.covers(sv(i), 0.025) ? 1 : 0;
  const shirtVis = [];
  for (let t = 0; t < shirtAll.length; t += 3) if (!(underJacket[shirtAll[t]] && underJacket[shirtAll[t + 1]] && underJacket[shirtAll[t + 2]])) shirtVis.push(shirtAll[t], shirtAll[t + 1], shirtAll[t + 2]);
  return {
    pieces,
    // on: the names of the pieces he wears
    set(on) {
      let mask = 0; pieces.forEach((m, k) => { m.visible = on.has(m.name); if (m.visible) mask |= 1 << k; });
      const keep = [];
      for (let t = 0; t < bodyAll.length; t += 3) {
        const a = bodyAll[t], b = bodyAll[t + 1], c = bodyAll[t + 2];
        if (!(cov[weld[a]] & cov[weld[b]] & cov[weld[c]] & mask)) keep.push(a, b, c);
      }
      body.geometry.setIndex(keep);
      shirt.geometry.setIndex(on.has('jacket') ? shirtVis : shirtAll);
      // the groups were built for the whole index: the shirt has one panel, so one group over all of it
      shirt.geometry.clearGroups(); shirt.geometry.addGroup(0, Infinity, 0);
    },
  };
}
