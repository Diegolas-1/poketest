// The town's people, made from the player's base model (web/world/local/ash.glb)
// so they share its quality, its 70-bone skeleton and its Mixamo clips.
//
// castReady(base, name, hooks) turns the loaded base into one person's variant,
// once per person, at run time (nothing extra to download):
//   - textures repainted on canvases: the jacket, trousers and face are painted
//     triangle by triangle in UV space by where each texel sits on the body in
//     the rest (T) pose, so a rule like "below the knee is a sock" lands right
//     on every seam and mirrored island; the eyes, hair and shoes are recoloured;
//   - parts reshaped (bare legs slimmed, collars lowered, sleeves puffed) and
//     parts the person doesn't wear dropped (Ash's cap, spikes and logo);
//   - garments and props added as skinned meshes on the same skeleton (a hair
//     crown, ponytail and ribbon, a skirt, coat tails, a bucket hat, a backpack);
//   - proportions changed by scaling and moving bones in the rest pose and
//     baking that into the meshes and the bind pose, so the clips (rotations
//     only, plus the waist's bob, which is rescaled) still fit and feet plant.
// The result has the same shape as the base, and calemActor clones it like Ash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';

const V3 = THREE.Vector3, M4 = THREE.Matrix4;
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// ---------- the body in the rest pose ----------
// model units, 1.34 tall, facing +z, left = +x, arms out along x. Joints: ankle 0.083,
// knee 0.381, hip 0.678 (legs at x = +-0.056), waist 0.712, neck 1.063, head 1.131,
// top of the hair 1.244; shoulder, elbow and wrist at |x| = 0.098, 0.278, 0.458 (y 1.029)
const ASH_SKIN = [253, 214, 190];

// which part of the body a vertex belongs to, by the bone it follows most
function partOf(name) {
  if (/Finger|Hand/.test(name)) return 'hand';
  if (/ForeArm/.test(name)) return 'fore';
  if (/Arm|Shoulder/.test(name)) return /Shoulder/.test(name) ? 'torso' : 'upper';
  if (/Thigh/.test(name)) return 'thigh';
  if (/Leg/.test(name)) return 'shin';
  if (/Foot|Toe/.test(name)) return 'foot';
  if (/Head|FJ|Lip|acchat/.test(name)) return 'head';
  if (/Neck/.test(name)) return 'neck';
  return 'torso';
}

// ---------- painting ----------
// paintUV(mesh, texture, w, h, fn): every texel the mesh covers gets fn(p, n, orig, part, u, v),
// with p and n its rest-pose position and normal; return [r,g,b] or nothing to keep it
function imageData(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return { c, g, d: g.getImageData(0, 0, w, h) };
}
function finish(c, g, d, src) {
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT;
  t.anisotropy = src.anisotropy; t.name = src.name;
  return t;
}
function paintUV(mesh, src, w, h, fn) {
  const { c, g, d } = imageData(src.image, w, h);
  const px = d.data, orig = new Uint8ClampedArray(px), cover = new Uint8Array(w * h);
  const geo = mesh.geometry, P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv;
  const parts = mesh.userData.parts, idx = geo.index ? geo.index.array : [...Array(P.count).keys()];
  const p = new V3(), n = new V3(), o = [0, 0, 0], tri = [0, 0, 0];
  const ua = [0, 0, 0], va = [0, 0, 0];
  for (let f = 0; f < idx.length; f += 3) {
    for (let j = 0; j < 3; j++) { tri[j] = idx[f + j]; ua[j] = UV.getX(tri[j]) * w - 0.5; va[j] = UV.getY(tri[j]) * h - 0.5; }
    const det = (va[1] - va[2]) * (ua[0] - ua[2]) + (ua[2] - ua[1]) * (va[0] - va[2]);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...ua)) - 1), x1 = Math.min(w - 1, Math.ceil(Math.max(...ua)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...va)) - 1), y1 = Math.min(h - 1, Math.ceil(Math.max(...va)) + 1);
    const e = 1.2 / Math.sqrt(Math.abs(det));   // half a texel or so of overdraw closes seams
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let b0 = ((va[1] - va[2]) * (x - ua[2]) + (ua[2] - ua[1]) * (y - va[2])) / det;
      let b1 = ((va[2] - va[0]) * (x - ua[2]) + (ua[0] - ua[2]) * (y - va[2])) / det;
      let b2 = 1 - b0 - b1;
      if (b0 < -e || b1 < -e || b2 < -e) continue;
      const k = y * w + x;
      if (cover[k] === 2 && (b0 < 0 || b1 < 0 || b2 < 0)) continue;   // an edge never overwrites a texel inside another triangle
      b0 = clamp(b0); b1 = clamp(b1); b2 = clamp(b2); const s = b0 + b1 + b2; b0 /= s; b1 /= s; b2 /= s;
      p.set(0, 0, 0); n.set(0, 0, 0);
      for (const [j, b] of [[0, b0], [1, b1], [2, b2]]) {
        p.x += P.getX(tri[j]) * b; p.y += P.getY(tri[j]) * b; p.z += P.getZ(tri[j]) * b;
        n.x += N.getX(tri[j]) * b; n.y += N.getY(tri[j]) * b; n.z += N.getZ(tri[j]) * b;
      }
      n.normalize();
      const part = parts[tri[b0 >= b1 && b0 >= b2 ? 0 : b1 >= b2 ? 1 : 2]];
      o[0] = orig[k * 4]; o[1] = orig[k * 4 + 1]; o[2] = orig[k * 4 + 2];
      const r = fn(p, n, o, part, x / w, y / h);
      if (r) { px[k * 4] = r[0]; px[k * 4 + 1] = r[1]; px[k * 4 + 2] = r[2]; }
      cover[k] = Math.max(cover[k], b0 > 0 && b1 > 0 && b2 > 0 ? 2 : 1);
    }
  }
  // grow the painted islands a few texels so mipmaps don't pull in the old colours
  for (let it = 0; it < 3; it++) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x; if (cover[k]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Yy = y + dy; if (X < 0 || Yy < 0 || X >= w || Yy >= h) continue;
        const q = Yy * w + X; if (cover[q]) { add.push([k, q]); break; }
      }
    }
    for (const [k, q] of add) { px[k * 4] = px[q * 4]; px[k * 4 + 1] = px[q * 4 + 1]; px[k * 4 + 2] = px[q * 4 + 2]; cover[k] = 1; }
  }
  return finish(c, g, d, src);
}
// a whole-image recolour: fn(orig, x, y) -> [r,g,b] or nothing
function paintImage(src, w, h, fn) {
  const { c, g, d } = imageData(src.image, w, h);
  const px = d.data, o = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4; o[0] = px[k]; o[1] = px[k + 1]; o[2] = px[k + 2];
    const r = fn(o, x, y);
    if (r) { px[k] = r[0]; px[k + 1] = r[1]; px[k + 2] = r[2]; }
  }
  return finish(c, g, d, src);
}

// skin of another tone, keeping the painted shading: scale by target / Ash's skin
const reskin = (o, skin) => [o[0] * skin[0] / ASH_SKIN[0], o[1] * skin[1] / ASH_SKIN[1], o[2] * skin[2] / ASH_SKIN[2]];
// a skin texel as the person's skin, by its lightness only (the atlases mix a peach and a pinker
// skin, which shows as a band across the eyes otherwise); amt keeps that much of the shading
const SKIN_L = 0.855;
const toneSkin = (o, skin, amt = 0.75) => mul(skin, 1 + (lum(o) / SKIN_L - 1) * amt);
const isSkinTexel = (o) => o[0] > 150 && o[0] > o[2] + 10 && o[0] - o[2] < 90;
// a flat colour with a little of the original's light and dark (folds, painted shading)
const keepShade = (col, o, ref, amt = 0.5) => mul(col, 1 + (clamp(lum(o) / ref, 0.6, 1.25) - 1) * amt);

// eyes: the 512x128 atlas holds 4x2 cells of two eyes; recolour skin, brows and irises
function eyeTex(src, L) {
  const skin = hex(L.skin), brow = hex(L.face.brow), iris = hex(L.face.iris);
  const { c, g, d } = imageData(src.image, src.image.width, src.image.height);
  const w = c.width, h = c.height, px = d.data, cw = w / 4, ch = h / 2;
  const orig = new Uint8ClampedArray(px);
  const at = (x, y) => { const k = (y * w + x) * 4; return [orig[k], orig[k + 1], orig[k + 2]]; };
  const isSkin = (o) => o[0] > 150 && o[0] > o[2] + 10;
  const browThick = L.face.browThick || 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4, o = at(x, y), cy = (y % ch) / ch;
    let r;
    if (isSkin(o)) {
      r = toneSkin(o, skin);
      // bushier brows: darken skin just under a brow stroke
      if (browThick && cy < 0.47) for (let j = 1; j <= browThick; j++) { const a = at(x, Math.max(0, y - j)); if (!isSkin(a) && lum(a) < 0.35 && (Math.floor((y - j) / ch) === Math.floor(y / ch))) { r = mix(toneSkin(at(x, y), skin), brow, 0.85); break; } }
    } else if (cy < 0.455 && lum(o) < 0.55) {
      r = mix(brow, toneSkin(o, skin), clamp(lum(o) / 0.55) ** 2);   // the brow strokes, anti-aliased into the skin
    } else if (lum(o) < 0.5 && Math.abs(o[0] - o[2]) < 40) {
      const l = lum(o); r = l < 0.16 ? mix([22, 16, 18], iris, (l / 0.16) ** 2 * 0.35) : mul(iris, 0.5 + l * 1.4);   // pupil and lash lines stay dark, the iris takes the colour
    }
    if (r) { px[k] = r[0]; px[k + 1] = r[1]; px[k + 2] = r[2]; }
  }
  if (L.face.lashes) lashes(px, w, h, cw, ch, hex(L.face.lashes));
  // grown-ups: the atlas's narrower, smaller-irised eyes (cell 1) as the open eyes (cell 0)
  if (L.face.mature) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let j = 0; j < 4; j++) px[(y * w + x) * 4 + j] = px[(y * w + x + cw) * 4 + j];
  // swept-back hair: the forehead (the top of the eye cells) is lit skin, with a few lines
  if (L.face.forehead) {
    const sk = skin, line = mul(sk, 0.86);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cy = (y % ch) / ch, k = (y * w + x) * 4, o = [px[k], px[k + 1], px[k + 2]];
      if (cy > 0.5 || !(o[0] > 150 && o[0] > o[2] + 10)) continue;
      const cx = (x % cw) / cw, t = sstep(0.5, 0.42, cy);
      let r = mix(o, sk, t);
      for (const [ly, lw] of [[0.1, 0.22], [0.19, 0.27]]) if (Math.abs(cy - ly - 0.03 * Math.cos((cx - 0.38) * 6)) < 0.012 && Math.abs(cx - 0.38) < lw) r = mix(r, line, 0.8);
      px[k] = r[0]; px[k + 1] = r[1]; px[k + 2] = r[2];
    }
  }
  return finish(c, g, d, src);
}
// a girl's lashes: thicken the upper lid line and flick it out at the outer corner of each eye
function lashes(px, w, h, cw, ch, col) {
  const dark = (x, y) => { const k = (y * w + x) * 4; return px[k] + px[k + 1] + px[k + 2] < 160; };
  const set = (x, y, a) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 4; px[k] += (col[0] - px[k]) * a; px[k + 1] += (col[1] - px[k + 1]) * a; px[k + 2] += (col[2] - px[k + 2]) * a; };
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 4; cx++) {
    for (const side of [0, 1]) {   // the left and right halves of the cell
      const xa = cx * cw + side * cw * 0.5, xb = xa + cw * 0.5;
      // the top of the eye's dark pixels in every column
      const top = [];
      for (let x = Math.floor(xa); x < xb; x++) for (let y = cy * ch + Math.floor(ch * 0.455); y < cy * ch + ch * 0.8; y++) if (dark(x, y)) { top.push([x, y]); break; }
      if (top.length < 4) continue;
      for (const [x, y] of top) { set(x, y, 1); set(x, y - 1, 1); set(x, y - 2, 0.5); }
      // outer corner (away from the cell's middle): two lashes flicked up and out
      const outer = side === 0 ? top[0] : top[top.length - 1], dir = side === 0 ? -1 : 1;
      for (let i = 0; i <= 6; i++) { const yy = outer[1] + 1 - Math.round(i * 0.75); set(outer[0] + dir * i, yy, 1 - i * 0.1); set(outer[0] + dir * i, yy + 1, 0.85 - i * 0.12); }
      for (let i = 0; i <= 4; i++) set(outer[0] + dir * (i * 0.6 - 1), outer[1] - 1 - i, 0.85 - i * 0.15);
    }
  }
}

// hair: Ash's dark navy hair texture recoloured by its lightness
function hairTex(src, col, w, h, contrast = 1) {
  const c0 = hex(col);
  return paintImage(src, w, h, (o) => { const t = clamp(lum(o) / 0.17, 0.3, 1.5); return mul(c0, 1 + (t - 1) * 0.55 * contrast); });
}
// shoes, by where on the shoe: the rubber sole and toe cap, the upper, the top rim
function shoeFn(S) {
  const up = hex(S.up), sole = hex(S.sole), toe = hex(S.toe || S.up), rim = hex(S.rim || S.up);
  return (p, n, o) => {
    const t = clamp(lum(o) / 0.62, 0.82, 1.1);
    if (p.y < (S.soleH ?? 0.03)) return mul(sole, clamp(lum(o) / 0.85, 0.85, 1.04));
    if (S.toe && p.z > 0.1 && p.y < 0.075) return mul(toe, clamp(lum(o) / 0.85, 0.85, 1.04));
    if (S.sock && p.y > S.sockY) return mul(hex(S.sock), clamp(lum(o) / 0.8, 0.9, 1.03));   // a low shoe: the high top becomes the sock
    if (p.y > (S.rimY ?? 0.215)) return mul(rim, t);
    return mul(up, t);
  };
}

// ---------- added meshes ----------
// a skinned mesh on the variant's skeleton from a geometry built in the rest pose;
// wfn(p) -> [[bone, weight], ...]
function skinGeo(geo, sk, wfn) {
  const P = geo.attributes.position, n = P.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new V3();
  const ix = new Map(sk.bones.map((b, i) => [b.name, i]));
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(P, i);
    const ws = wfn(p).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), s = ws.reduce((a, [, w]) => a + w, 0);
    ws.forEach(([b, w], j) => { si[i * 4 + j] = ix.get(b); sw[i * 4 + j] = w / s; });
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}
// a closed (or open) tube-like grid: at(t, u) -> [x, y, z] for t along it and u around it, both 0..1
function sheet(rows, cols, at, closed = true) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { pos.push(...at(i / rows, j / cols)); uv.push(j / cols, i / rows); }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closed) seamNormals(g, rows, cols);
  return g;
}
// average the normals across the wrap-around seam of a closed sheet
function seamNormals(g, rows, cols) {
  const N = g.attributes.normal;
  for (let i = 0; i <= rows; i++) {
    const a = i * (cols + 1), b = a + cols, n = new V3().fromBufferAttribute(N, a).add(new V3().fromBufferAttribute(N, b)).normalize();
    N.setXYZ(a, n.x, n.y, n.z); N.setXYZ(b, n.x, n.y, n.z);
  }
}
// the cel material for added parts: a flat colour, or a small canvas painted with fn(ctx, w, h)
// a neck (the base head is open underneath, hidden in its game by a tall collar): a skin tube
// from the chest to the jaw, bending with the neck; on the model before its ink hulls are made
export function addNeck(model, color, cel) {
  let hairM = null;
  model.traverse((o) => { if (o.isSkinnedMesh && o.material.name === 'hair01_on') hairM = o; });
  const geo = skinGeo(sheet(3, 16, (t, u) => { const a = u * 2 * Math.PI, r = 0.034; return [Math.sin(a) * r, 1.035 + t * 0.085, -0.013 + Math.cos(a) * r * 1.05]; }),
    hairM.skeleton, (p) => [['Neck', sstep(1.04, 1.09, p.y)], ['Spine3', 1 - sstep(1.04, 1.09, p.y)]]);
  const m = new THREE.SkinnedMesh(geo, flatMat(color, cel, { name: 'ash_neck' }));
  m.name = 'neck'; m.castShadow = true; m.frustumCulled = false;
  hairM.parent.add(m); m.bind(hairM.skeleton, hairM.bindMatrix);
  return m;
}
const flatMat = (color, cel, o = {}) => { const m = toon(color, { cel, side: o.side }); m.name = o.name || 'cast_' + color; return m; };
function canvasMat(w, h, draw, cel, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  const m = toon('#ffffff', { map: t, cel, side: o.side }); m.name = o.name || 'cast_tex'; return m;
}

// the open top of the hair (Ash's cap covered it): a dome from the hair's rim up to the crown
function crown(hair, o = {}) {
  const P = hair.geometry.attributes.position, zc = o.zc ?? -0.008;
  const bins = 48, rim = new Array(bins).fill(0), rimY = o.rimY ?? 1.236;
  const p = new V3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); if (p.y < rimY - 0.012) continue;
    const a = Math.atan2(p.x, p.z - zc), b = Math.floor(((a / (2 * Math.PI)) + 1) % 1 * bins);
    rim[b] = Math.max(rim[b], Math.hypot(p.x, p.z - zc));
  }
  // fill and smooth the rim
  for (let it = 0; it < 4; it++) for (let b = 0; b < bins; b++) if (!rim[b]) rim[b] = rim[(b + 1) % bins] || rim[(b + bins - 1) % bins];
  const sm = rim.map((_, b) => (rim[(b + bins - 1) % bins] + 2 * rim[b] + rim[(b + 1) % bins]) / 4);
  const R = (a) => { const f = ((a / (2 * Math.PI)) + 1) % 1 * bins, b = Math.floor(f), t = f - b; return sm[b % bins] * (1 - t) + sm[(b + 1) % bins] * t; };
  const top = o.top ?? 1.31, bulge = o.bulge ?? 1.04, back = o.back ?? 0;
  return sheet(10, 40, (t, u) => {
    const a = u * 2 * Math.PI, e = t * Math.PI / 2, r = R(a) * (o.inset ?? 1.01) * Math.cos(e) * (1 + (bulge - 1) * Math.sin(e * 2));
    const y0 = rimY - 0.03 + (o.front || 0) * Math.max(0, Math.cos(a)) ** 2, y = y0 + (top - y0) * Math.sin(e);   // front: a higher hairline
    const zb = back * Math.sin(e) * Math.sin(e);   // the crown leans back
    return [Math.sin(a) * r, y, zc + Math.cos(a) * r - zb];
  });
}

// ---------- proportions ----------
// edits: { bone: { s: number | [x,y,z], t: [x,y,z] } } in the rest pose, each scaling about the
// bone's joint and carrying its whole subtree; baked into the meshes and the bind pose
function reproportion(scene, meshes, edits) {
  scene.updateMatrixWorld(true);
  const D = new Map(), P0 = new Map(), Q0 = new Map();
  scene.traverse((b) => {
    if (!b.isBone) return;
    const p = b.getWorldPosition(new V3()), q = b.getWorldQuaternion(new THREE.Quaternion());
    P0.set(b, p); Q0.set(b, q);
    const d = (b.parent && D.get(b.parent)) ? D.get(b.parent).clone() : new M4();
    const e = edits[b.name];
    if (e) {
      const s = typeof e.s === 'number' ? [e.s, e.s, e.s] : (e.s || [1, 1, 1]), t = e.t || [0, 0, 0];
      d.multiply(new M4().makeTranslation(p.x + t[0], p.y + t[1], p.z + t[2])).multiply(new M4().makeScale(...s)).multiply(new M4().makeTranslation(-p.x, -p.y, -p.z));
    }
    D.set(b, d);
  });
  // meshes: v' = sum of w * D(bone) v; normals by the inverse transpose
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = m.skeleton.bones;
    const v = new V3(), n = new V3(), acc = new V3(), nacc = new V3(), t = new V3(), nm = new THREE.Matrix3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); acc.set(0, 0, 0); nacc.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = SW.getComponent(i, j); if (!w) continue;
        const d = D.get(bones[SI.getComponent(i, j)]);
        acc.addScaledVector(t.copy(v).applyMatrix4(d), w);
        nacc.addScaledVector(t.copy(n).applyMatrix3(nm.getNormalMatrix(d)).normalize(), w);
      }
      P.setXYZ(i, acc.x, acc.y, acc.z); nacc.normalize(); N.setXYZ(i, nacc.x, nacc.y, nacc.z);
    }
    P.needsUpdate = N.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
  }
  // bones: moved to their new joints, rotations kept, no scale
  const P1 = new Map();
  for (const [b, p] of P0) P1.set(b, p.clone().applyMatrix4(D.get(b)));
  scene.traverse((b) => {
    if (!b.isBone || !b.parent || !P1.has(b.parent)) return;
    b.position.copy(P1.get(b)).sub(P1.get(b.parent)).applyQuaternion(Q0.get(b.parent).clone().invert());
  });
  scene.updateMatrixWorld(true);
  for (const m of meshes) m.skeleton.calculateInverses();
  return { P0, P1 };
}

// ---------- the people ----------
// colours and identity follow LOOKS in actor.js; heights are in metres, hats included
const C = {
  girl: { skin: '#f8d8bc', hair: '#8a4a2c', ribbon: '#ec4a78', dress: '#f494b4', dress2: '#e9789e', white: '#fbf8f4', socks: '#ffffff', shoes: '#d04a72', sole: '#7a2a40' },
  fisher: { skin: '#eebf96', hair: '#4a3a30', hat: '#e4d29e', band: '#7a5a3a', shirt: '#3f7fa8', vest: '#c8b07a', pocket: '#b39a64', pants: '#66705a', boots: '#3a3030', sole: '#241e1e' },
  kid: { skin: '#f8d8bc', hair: '#4e3424', shirt: '#74c66e', trim: '#56a852', shorts: '#4f6fa0', shoes: '#ffd23f', sole: '#ffffff', bag: '#5fa8d3', bag2: '#3d7fb0', strap: '#3d7fb0' },
  oak: { skin: '#f0c8a4', hair: '#b9bbc6', shirt: '#c9373c', coat: '#f6f6f2', coat2: '#dfe2e6', pants: '#8a6a4a', belt: '#4a3428', shoes: '#5a3a28', sole: '#3a2418' },
};

// common painters for the jacket (topsjer): body parts in the rest pose
const ax = (p) => Math.abs(p.x);
const isArm = (part) => part === 'upper' || part === 'fore' || part === 'hand';
// along the arm (|x|), for parts on an arm
const sleeveTo = (p, part, x) => isArm(part) && ax(p) > x;

const CAST = {
  kid: {
    height: 1.35,
    edits: { Head: { s: 1.18 }, LThigh: { s: 0.85 }, RThigh: { s: 0.85 }, Spine2: { s: [0.94, 0.9, 0.94] }, LArmA: { s: [0.92, 1, 1] }, RArmA: { s: [0.92, 1, 1] } },
    drop: ['hathun', 'ash_extra', 'ash_logo'],
    face: { mouth: 'o', iris: '#4a3020', brow: '#3a2a20' },
  },
  girl: { height: 1.5, edits: { Head: { s: 1.08 }, LThigh: { s: 0.93 }, RThigh: { s: 0.93 } }, drop: ['hathun', 'ash_extra', 'ash_logo'], face: { iris: '#6a3a22', brow: '#6a3a24', lashes: '#2a1a1a', mouth: 'smile', blush: '#f07a8a' } },
  // broad: a wider, deeper trunk (arms and head scaled back to size), thicker arms and legs, a smaller head
  fisher: {
    height: 1.86,
    edits: {
      Spine1: { s: [1.16, 1.05, 1.16] }, Hips: { s: [1.1, 1, 1.08] },
      Neck: { s: [0.94 / 1.16, 0.94 / 1.05, 0.94 / 1.16] },
      LShoulder: { s: [1 / 1.16, 1.12 / 1.05, 1.12 / 1.16], t: [0.008, 0, 0] }, RShoulder: { s: [1 / 1.16, 1.12 / 1.05, 1.12 / 1.16], t: [-0.008, 0, 0] },
      LThigh: { s: [1.08 / 1.1, 1.03, 1.08 / 1.08] }, RThigh: { s: [1.08 / 1.1, 1.03, 1.08 / 1.08] },
    },
    drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
    face: { iris: '#3a2a20', brow: '#3a2a20', browThick: 1, mature: true, stubble: '#6a5040' },
  },
  oak: {
    height: 1.88,
    edits: {
      Spine1: { s: [1.06, 1.05, 1.06] },
      Neck: { s: [0.93 / 1.06, 0.93 / 1.05, 0.93 / 1.06] },
      LShoulder: { s: [1 / 1.06, 1 / 1.05, 1 / 1.06], t: [0.005, 0, 0] }, RShoulder: { s: [1 / 1.06, 1 / 1.05, 1 / 1.06], t: [-0.005, 0, 0] },
      LThigh: { s: [1, 1.05, 1] }, RThigh: { s: [1, 1.05, 1] },
    },
    drop: ['hathun', 'ash_logo', 'ash_sleeve'],
    face: { iris: '#3a2a22', brow: '#b4b2ac', browThick: 1, old: true, mature: true, forehead: true },
  },
};

// per person: the repaint of each mesh, reshaping, and added parts
const BUILD = {
  kid(v) {
    const c = C.kid, skin = hex(c.skin), shirt = hex(c.shirt), trim = hex(c.trim), strap = hex(c.strap), shorts = hex(c.shorts);
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand' || sleeveTo(p, part, 0.205)) return skin;
      if (isArm(part) && ax(p) > 0.19) return trim;                      // sleeve hem
      if (p.y > 1.045) return trim;                                        // crew collar
      // backpack straps over the shoulders
      const sx = ax(p);
      if (!isArm(part) && sx > 0.045 && sx < 0.072 && p.y > 0.8) return strap;
      return keepShade(shirt, o, 0.5, 0.12);
    });
    v.paint('ash_sleeve', 1, () => trim);
    v.paint('btmsskin', 0.5, (p, n, o) => {
      if (p.y > 0.5) return p.y > 0.69 ? [58, 78, 120] : p.y < 0.515 ? mul(shorts, 0.86) : keepShade(shorts, o, 0.55, 0.5);   // shorts, a darker waistband
      if (p.y < 0.25) return [250, 250, 250];   // socks
      return skin;
    });
    v.shape('btmsskin', slimLegs(0.5, 0.74));
    v.shape('topsjer', lowerCollar(1.05, 0.45));
    v.shoes({ up: c.shoes, sole: c.sole, toe: '#ffffff', sock: '#ffffff', sockY: 0.12, rimY: 0.1, rim: '#f2b01f' });
    v.hair(c.hair);
    v.crown({ top: 1.315 });
    v.neck();
    v.backpack(c.bag, c.bag2);
  },
  girl(v) {
    const c = C.girl, skin = hex(c.skin), dress = hex(c.dress), white = hex(c.white);
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand' || sleeveTo(p, part, 0.2)) return skin;
      if (isArm(part) && ax(p) > 0.1) return keepShade(white, o, 0.8, 0.4);   // puffed sleeves
      if (p.y > 1.035 || (p.y > 0.985 && p.z > 0 && Math.abs(p.x) < 0.075 - (1.035 - p.y) * 0.6)) return keepShade(white, o, 0.8, 0.3);   // the collar, round on the chest
      return keepShade(dress, o, 0.5, 0.15);
    });
    v.paint('ash_sleeve', 1, () => white);
    v.paint('btmsskin', 0.5, (p) => (p.y > 0.55 ? dress : p.y < 0.24 ? [250, 250, 250] : skin));
    v.shape('btmsskin', slimLegs(0.6, 0.72));
    v.shape('topsjer', (p, n, part) => {
      if (part === 'upper' || (isArm(part) && ax(p) < 0.215)) {   // puff the sleeves out round the arm
        const u = clamp((ax(p) - 0.095) / 0.12), k = 1 + 0.42 * Math.sin(Math.PI * u) ** 0.8;
        p.y = 1.029 + (p.y - 1.029) * k; p.z = -0.004 + (p.z + 0.004) * k;
      }
    });
    v.shape('ash_sleeve', (p) => { p.y = 1.029 + (p.y - 1.029) * 1.12; p.z = -0.004 + (p.z + 0.004) * 1.12; });
    v.shape('topsjer', lowerCollar(1.05, 0.4));
    v.shoes({ up: c.shoes, sole: c.sole, sock: '#ffffff', sockY: 0.1, rimY: 0.09, rim: c.shoes });
    v.hair(c.hair);
    v.crown({ top: 1.312, back: 0.012 });
    v.neck();
    v.skirt({ top: 0.745, hem: 0.47, r0: [0.125, 0.088], r1: [0.205, 0.18], pleats: 14, color: c.dress, trim: c.white, dark: c.dress2 });
    v.ponytail(c.hair, c.ribbon);
  },
  fisher(v) {
    const c = C.fisher, skin = hex(c.skin), shirt = hex(c.shirt), vest = hex(c.vest), pocket = hex(c.pocket), seam = mul(vest, 0.78), pants = hex(c.pants);
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand') return skin;
      if (isArm(part)) return ax(p) > 0.425 ? mul(shirt, 0.86) : keepShade(shirt, o, 0.6, 0.4);   // long sleeves, buttoned cuffs
      const x = ax(p);
      if (p.y > 1.04) return mul(shirt, 0.95);                       // shirt collar
      if (p.z > 0 && x < 0.026 + (p.y > 0.98 ? (p.y - 0.98) * 0.5 : 0)) return x > 0.02 && p.y < 0.98 ? seam : shirt;   // the vest open over the shirt
      if (x > 0.092 && p.y > 0.93) return shirt;                     // armholes
      if (p.z > 0) {                                                 // four patch pockets with flaps
        for (const [y0, y1] of [[0.875, 0.95], [0.745, 0.83]]) if (p.y > y0 && p.y < y1 && x > 0.036 && x < 0.088) return p.y > y1 - 0.016 ? seam : (x < 0.04 || x > 0.084 || p.y < y0 + 0.004) ? seam : pocket;
      }
      return keepShade(vest, o, 0.5, 0.15);
    });
    v.paint('btmsskin', 0.5, (p, n, o) => (p.y > 0.69 ? [74, 60, 48] : keepShade(pants, o, 0.55, 0.6)));
    v.shoes({ up: c.boots, sole: c.sole, rim: '#4a3c38' });
    v.hair(c.hair);
    v.bucketHat(c.hat, c.band);
  },
  oak(v) {
    const c = C.oak, skin = hex(c.skin), shirt = hex(c.shirt), coat = hex(c.coat), coat2 = hex(c.coat2), pants = hex(c.pants);
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand') return skin;
      if (isArm(part)) return ax(p) > 0.43 ? coat2 : keepShade(coat, o, 0.8, 0.35);
      const x = ax(p), open = p.y > 0.86 ? 0.03 + (p.y - 0.86) * 0.32 : 0.03;   // the coat's V over the red shirt
      if (p.z > 0 && p.y < 1.05 && x < open) return x > open - 0.006 ? mul(shirt, 0.8) : keepShade(shirt, o, 0.5, 0.3);
      if (p.z > 0 && p.y < 1.04 && x < open + 0.007) return coat2;   // lapel edge
      if (p.z > 0 && x > 0.05 && x < 0.088 && p.y > 0.86 && p.y < 0.875) return coat2;   // breast pocket
      return keepShade(coat, o, 0.8, 0.35);
    });
    v.paint('btmsskin', 0.5, (p, n, o) => (p.y > 0.69 ? hex(c.belt) : keepShade(pants, o, 0.55, 0.6)));
    v.shoes({ up: c.shoes, sole: c.sole, rim: c.shoes, sock: c.pants, sockY: 0.1, slim: false });
    v.hair(c.hair, 0.8);
    v.shape('ash_extra', (p) => { if (p.y > 1.3) p.set(0, 1.2, -0.02); });   // drop Ash's cap button
    v.shape('hair01_on', foldFringe);
    v.crown({ top: 1.312, back: 0.018, bulge: 1.04, rimY: 1.232, front: 0.03, strands: false });
    // grey hair swept up off the forehead and back in spikes
    const S = [];
    for (const s of [-1, 1]) {
      S.push([s * 0.25, 0.22, 0.12, 0.045, [s * 0.25, 0.8, -0.55], 0.5]);     // the front locks rising from the hairline
      S.push([s * 0.75, 0.3, 0.12, 0.044, [s * 0.55, 0.65, -0.6], 0.5]);
      S.push([s * 1.2, 0.35, 0.13, 0.042, [s * 0.8, 0.45, -0.6], 0.45]);
      S.push([s * 1.65, 0.2, 0.12, 0.04, [s * 0.85, 0.05, -0.6], 0.35]);     // over the ears
      S.push([s * 2.25, 0.3, 0.13, 0.042, [s * 0.5, -0.05, -0.9], 0.35]);    // behind
      S.push([s * 0.45, 0.7, 0.13, 0.045, [s * 0.25, 0.7, -0.75], 0.45]);    // on top
      S.push([s * 2.7, 0.55, 0.12, 0.042, [s * 0.2, 0.25, -1], 0.4]);
    }
    S.push([0, 0.5, 0.12, 0.045, [0, 0.75, -0.65], 0.5], [Math.PI, 0.3, 0.12, 0.042, [0, -0.25, -1], 0.35], [0, 1.0, 0.12, 0.045, [0, 0.4, -1], 0.4]);
    v.spikes(c.hair, S);
    v.skirt({ top: 0.765, hem: 0.36, r0: [0.13, 0.094], r1: [0.17, 0.135], gap: 0.42, color: c.coat, dark: c.coat2, pleats: 0, follow: 0.8 });
  },
};
// Oak's hair: the fringe folded away up under the crown, so the forehead shows
function foldFringe(p) {
  if (p.z < 0.035 || Math.abs(p.x) > 0.085 || p.y > 1.25) return;
  p.set(p.x * 0.8, 1.255, Math.min(p.z, 0.07));
}

// bare legs from Ash's wide jeans: below y0 every ring is pulled in toward the bone
// and capped by a leg's profile (thigh, knee, calf, ankle), so the rolled cuffs go too
const LEG_R = [[0.08, 0.034], [0.13, 0.029], [0.2, 0.036], [0.28, 0.042], [0.38, 0.037], [0.48, 0.047], [0.6, 0.056], [0.7, 0.07]];
const legR = (y) => { for (let i = 1; i < LEG_R.length; i++) if (y < LEG_R[i][0]) { const [y0, r0] = LEG_R[i - 1], [y1, r1] = LEG_R[i]; return r0 + (r1 - r0) * clamp((y - y0) / (y1 - y0)); } return 0.07; };
function slimLegs(y0, k) {
  return (p) => {
    if (p.y > y0 + 0.04) return;
    const t = sstep(y0 + 0.04, y0 - 0.04, p.y), cx = Math.sign(p.x) * 0.056, cz = 0.002;
    const d = Math.hypot(p.x - cx, p.z - cz); if (d < 1e-6) return;
    const cap = legR(p.y), want = Math.min(d * k, cap - Math.max(0, cap - d * k) * 0.25), kk = 1 + (want / d - 1) * t;
    p.x = cx + (p.x - cx) * kk; p.z = cz + (p.z - cz) * kk;
  };
}
// Ash's tall collar folded down into a low neckline
function lowerCollar(y0, k) {
  return (p, n, part) => {
    if (isArm(part) || p.y <= y0) return;
    p.y = y0 + (p.y - y0) * k;
  };
}

// ---------- building a variant ----------
// castReady: the variant, built in a task of its own (a few hundred ms of painting each,
// so several people loading at once don't stall a frame for long)
const CACHE = new Map();
let queue = Promise.resolve();
export function castReady(base, name, hooks) {
  if (CACHE.has(name)) return Promise.resolve(CACHE.get(name));
  const p = queue.then(() => new Promise((res) => setTimeout(() => res(castBase(base, name, hooks)))));
  queue = p.catch(() => {});
  return p;
}
export function castBase(base, name, hooks) {
  if (CACHE.has(name)) return CACHE.get(name);
  const spec = CAST[name], { SKIN, CLOTH, smoothNormals } = hooks;
  const scene = base.SU.clone(base.scene);
  scene.updateMatrixWorld(true);
  const meshes = new Map();
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes.set(o.material.name, o); });
  for (const d of spec.drop || []) { const m = meshes.get(d); if (m) { m.parent.remove(m); meshes.delete(d); } }
  for (const m of meshes.values()) {
    // own bind matrices: Skeleton.clone() shares them with the base (and so with Ash), and
    // reproportion recomputes them in place
    m.skeleton.boneInverses = m.skeleton.boneInverses.map((x) => x.clone());
    m.geometry = m.geometry.clone();
    const SI = m.geometry.attributes.skinIndex, SW = m.geometry.attributes.skinWeight, parts = [];
    for (let i = 0; i < SI.count; i++) {
      let bj = 0, bw = -1; for (let j = 0; j < 4; j++) if (SW.getComponent(i, j) > bw) { bw = SW.getComponent(i, j); bj = SI.getComponent(i, j); }
      parts.push(partOf(m.skeleton.bones[bj].name));
    }
    m.userData.parts = parts;
  }
  const hairM = meshes.get('hair01_on'), sk = hairM.skeleton, holder = hairM.parent;
  const L = { skin: C[name].skin, face: spec.face };
  const extras = [], shapes = [];
  const add = (geo, mat, wfn, nm) => {
    const m = new THREE.SkinnedMesh(geo.attributes.skinIndex ? geo : skinGeo(geo, sk, wfn), mat); m.name = nm; holder.add(m); m.bind(sk, hairM.bindMatrix);
    m.castShadow = true; m.frustumCulled = false; extras.push(m); return m;
  };
  const retex = (nm, mk) => { const m = meshes.get(nm); if (!m) return; const m0 = m.material, t = mk(m0.map); const mm = toon('#ffffff', { map: t, side: m0.side, cel: nm.startsWith('face') ? SKIN : CLOTH }); mm.alphaTest = m0.alphaTest; mm.name = m0.name; mm.polygonOffset = m0.polygonOffset; mm.polygonOffsetFactor = m0.polygonOffsetFactor; mm.polygonOffsetUnits = m0.polygonOffsetUnits; keepCel(mm); m.material = mm; };
  // flat-coloured parts go into one vertex-coloured mesh per person (fewer draws)
  const flats = [];
  const v = {
    flat: (geo, color, wfn) => { const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); flats.push(skinGeo(geo, sk, wfn)); },
    paint: (nm, scale, fn) => retex(nm, (src) => paintUV(meshes.get(nm), src, Math.round(src.image.width * scale), Math.round(src.image.height * scale), fn)),
    shape: (nm, fn) => shapes.push([nm, fn]),
    shoes: (S) => {
      v.paint('shoessboots', 0.5, shoeFn(S));
      // a low shoe: the high top above sockY hugs the ankle like a sock
      if (S.sock && S.slim !== false) v.shape('shoessboots', (p) => {
        const t = sstep(S.sockY - 0.01, S.sockY + 0.05, p.y); if (!t) return;
        const cx = Math.sign(p.x) * 0.056, cz = -0.004, d = Math.hypot(p.x - cx, p.z - cz), want = Math.min(d, legR(p.y) * 1.02 + 0.003), kk = 1 + (want / d - 1) * t;
        p.x = cx + (p.x - cx) * kk; p.z = cz + (p.z - cz) * kk;
      });
    },
    hair: (col, contrast) => { retex('hair01_on', (src) => hairTex(src, col, 256, 64, contrast)); if (meshes.has('ash_extra')) retex('ash_extra', (src) => paintImage(src, src.image.width, src.image.height, (o) => mul(hex(col), clamp(lum(o) / 0.17, 0.5, 1.4)))); },
    crown: (o) => add(crown(hairM, o), canvasMat(64, 64, (g, w, h) => {
      g.fillStyle = shade(C[name].hair, 1); g.fillRect(0, 0, w, h);
      if (o.strands !== false) {
        g.strokeStyle = shade(C[name].hair, 0.86); g.lineWidth = 1.5;   // strands from the crown
        for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(i / 12 * w + 2, h * 0.1); g.lineTo(i / 12 * w + 3, h * 0.5); g.stroke(); }
      }
    }, CLOTH, { name: 'cast_crown' }), () => [['Head', 1]], 'crown'),
    neck: () => add(sheet(3, 16, (t, u) => { const a = u * 2 * Math.PI, r = 0.03; return [Math.sin(a) * r, 1.035 + t * 0.075, -0.008 + Math.cos(a) * r * 0.95]; }),
      flatMat(C[name].skin, SKIN, { name: 'cast_neck' }), (p) => [['Neck', sstep(1.04, 1.09, p.y)], ['Spine3', 1 - sstep(1.04, 1.09, p.y)]], 'neck'),
    // a flared skirt (or coat tails, open in front by gap radians): hips at the top, the hem partly following each thigh
    skirt: (o) => {
      const gap = o.gap || 0, rows = 6, cols = 48;
      const g = sheet(rows, cols, (t, u) => {
        const a = gap + u * (2 * Math.PI - 2 * gap), y = o.top + (o.hem - o.top) * t, e = t ** 0.85;
        const rx = o.r0[0] + (o.r1[0] - o.r0[0]) * e, rz = o.r0[1] + (o.r1[1] - o.r0[1]) * e, pl = 1 + (o.pleats ? 0.035 * Math.cos(a * o.pleats) * t : 0);
        return [Math.sin(a) * rx * pl, y, (o.z || 0) + Math.cos(a) * rz * pl];
      }, !gap);
      const m = canvasMat(32, 64, (x, w, h) => {
        x.fillStyle = o.color; x.fillRect(0, 0, w, h);
        if (o.dark) { x.fillStyle = o.dark; for (let i = 0; i < (o.pleats || 0); i++) x.fillRect((i + 0.5) / o.pleats * w, 0, 1, h); }
        if (o.trim) { x.fillStyle = o.trim; x.fillRect(0, h * 0.86, w, h * 0.14); }
      }, CLOTH, { name: 'cast_skirt', side: THREE.DoubleSide });
      add(g, m, (p) => {
        const t = clamp((o.top - p.y) / (o.top - o.hem)), wh = 1 - (o.follow ?? 0.6) * t ** 1.3, sd = clamp(0.5 + p.x / 0.16);
        return [['Hips', wh], ['LThigh', (1 - wh) * sd], ['RThigh', (1 - wh) * (1 - sd)]];
      }, 'skirt');
    },
    // a ponytail from the back of the head with a ribbon bow at its root
    ponytail: (col, ribbon) => {
      const P0 = new V3(0, 1.262, -0.1), c = (t) => new V3(0, P0.y - 0.06 * t - 0.19 * t * t, P0.z - 0.075 * Math.sin(t * 2.2) - 0.02 * t);
      const rad = (t) => 0.028 + 0.03 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.75) * (1 - t) - 0.024 * t;
      const g = sheet(14, 14, (t, u) => {
        const a = u * 2 * Math.PI, q = c(t), dq = c(Math.min(1, t + 0.01)).sub(c(Math.max(0, t - 0.01))).normalize();
        const s1 = new V3(1, 0, 0), s2 = new V3().crossVectors(dq, s1).normalize(), r = Math.max(0.002, rad(t)) * (1 + 0.08 * Math.cos(a * 5) * t);
        return q.addScaledVector(s1, -Math.sin(a) * r * 1.1).addScaledVector(s2, Math.cos(a) * r).toArray();
      });
      add(g, canvasMat(32, 64, (x, w, h) => {
        x.fillStyle = col; x.fillRect(0, 0, w, h); x.strokeStyle = shade(col, 0.8); x.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo((i + 0.3) / 6 * w, 0); x.lineTo((i + 0.5) / 6 * w, h); x.stroke(); }
      }, CLOTH, { name: 'cast_tail' }), (p) => { const t = clamp((P0.y - p.y) / 0.25); return [['Head', 1 - 0.45 * t * t], ['Neck', 0.45 * t * t]]; }, 'ponytail');
      // the bow: two loops and a knot on top of the tail's root
      const bow = [];
      for (const s of [-1, 1]) {
        const l = new THREE.SphereGeometry(1, 14, 10); l.scale(0.036, 0.022, 0.013); l.rotateZ(-s * 0.35); l.rotateX(0.5); l.translate(s * 0.036, P0.y + 0.012, P0.z - 0.014); bow.push(l);
        const tl = new THREE.SphereGeometry(1, 8, 6); tl.scale(0.011, 0.03, 0.006); tl.rotateZ(s * 0.5); tl.rotateX(0.5); tl.translate(s * 0.016, P0.y - 0.022, P0.z - 0.026); bow.push(tl);
      }
      const k = new THREE.SphereGeometry(1, 10, 8); k.scale(0.016, 0.016, 0.014); k.rotateX(0.5); k.translate(0, P0.y + 0.008, P0.z - 0.02); bow.push(k);
      v.flat(mergeGeos(bow), ribbon, () => [['Head', 1]]);
    },
    // spiky hair: tapered, slightly flattened cones from the crown; [azimuth, elevation, length, radius, direction, droop]
    spikes: (col, list) => {
      const c0 = new V3(0, 1.2, -0.012), geos = [];
      for (const [a, e, len, r0, d, droop] of list) {
        const out = new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
        const base = c0.clone().addScaledVector(out, 0.1), dir = new V3(...d).normalize();
        const side = new V3().crossVectors(dir, out).normalize(), flat = new V3().crossVectors(side, dir).normalize();
        geos.push(sheet(6, 10, (t, u) => {
          const q = base.clone().addScaledVector(dir, len * t).addScaledVector(out, -0.012 * (1 - t)).add(new V3(0, -droop * len * 0.35 * t * t, 0));
          const r = r0 * (1 - t) ** 1.15, an = u * 2 * Math.PI;
          return q.addScaledVector(side, Math.cos(an) * r).addScaledVector(flat, -Math.sin(an) * r * 0.5).toArray();
        }));
      }
      v.flat(mergeGeos(geos), col, () => [['Head', 1]]);
    },
    // a bucket hat: a soft crown, a band and a brim turned down, tipped back a little
    bucketHat: (col, band) => {
      const pts = [[0.188, 1.158], [0.193, 1.165], [0.152, 1.19], [0.121, 1.207], [0.117, 1.25], [0.113, 1.295], [0.098, 1.322], [0.06, 1.333], [0.001, 1.336]].map(([r, y]) => new THREE.Vector2(r, y));
      const tip = (g) => g.translate(0, -1.2 + 0.022, 0.012).rotateX(-0.16).translate(0, 1.2, -0.022);
      v.flat(tip(new THREE.LatheGeometry(pts, 32)), col, () => [['Head', 1]]);
      v.flat(tip(new THREE.LatheGeometry([[0.1225, 1.205], [0.1215, 1.232]].map(([r, y]) => new THREE.Vector2(r, y)), 32)), band, () => [['Head', 1]]);
    },
    backpack: (c1, c2) => {
      const g = new THREE.BoxGeometry(0.15, 0.17, 0.07, 3, 3, 2);
      roundBox(g, 0.15, 0.17, 0.07, 0.025);
      g.translate(0, 0.88, -0.115);
      v.flat(g, c1, () => [['Spine3', 0.7], ['Spine2', 0.3]]);
      const f = new THREE.BoxGeometry(0.152, 0.075, 0.074, 3, 2, 2); roundBox(f, 0.152, 0.075, 0.074, 0.02); f.translate(0, 0.94, -0.116);
      v.flat(f, c2, () => [['Spine3', 0.7], ['Spine2', 0.3]]);
    },
  };
  // the face: Ash's cheek marks gone, the person's skin, mouth and lines
  v.paint('face_on_1', 0.5, faceFn(spec.face, hex(C[name].skin)));
  retex('face_on_0', (src) => eyeTex(src, L));
  BUILD[name](v);
  if (flats.length) {
    // the hat's brim is seen from below, so the lot is two-sided
    const m = toon('#ffffff', { vertexColors: true, cel: CLOTH, side: THREE.DoubleSide }); m.name = 'cast_parts';
    add(mergeGeometries(flats), m, null, 'parts');
  }
  for (const [nm, fn] of shapes) {
    const m = meshes.get(nm); if (!m) continue;
    const P = m.geometry.attributes.position, N = m.geometry.attributes.normal, p = new V3(), n = new V3();
    for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); fn(p, n, m.userData.parts[i]); P.setXYZ(i, p.x, p.y, p.z); }
  }
  const all = [...meshes.values(), ...extras];
  const { P0, P1 } = reproportion(scene, all, spec.edits || {});
  for (const m of all) if (m.material.name !== 'ash_sleeve' && m.material.name !== 'face_on_0' && m.material.name !== 'ash_logo') smoothNormals(m.geometry);
  // rest pose, size and clips for the new proportions
  const rest = new Map();
  scene.traverse((b) => { if (b.isBone) rest.set(b.name, { q: b.quaternion.clone(), p: b.position.clone(), w: b.getWorldQuaternion(new THREE.Quaternion()) }); });
  const box = new THREE.Box3();
  for (const m of all) box.union(m.geometry.boundingBox || m.geometry.computeBoundingBox() || m.geometry.boundingBox);
  const byName = (n) => [...P0.keys()].find((b) => b.name === n);
  // the legs' new length: the waist's bob and the strides scale with it
  const th = byName('LThigh'), ft = byName('LFoot');
  const sL = (P1.get(th).y - P1.get(ft).y) / (P0.get(th).y - P0.get(ft).y);
  const out = { scene, SU: base.SU, rest, k: spec.height / (box.max.y - box.min.y), minY: box.min.y };
  if (base.anims) {
    const w0 = base.rest.get('Waist').p, w1 = rest.get('Waist').p;
    const clips = {};
    for (const [n, c] of Object.entries(base.anims.clips)) {
      const cc = c.clone();
      for (const t of cc.tracks) if (t.name === 'Waist.position') {
        const vv = t.values; for (let i = 0; i < vv.length; i += 3) { vv[i] = w1.x + (vv[i] - w0.x) * sL; vv[i + 1] = w1.y + (vv[i + 1] - w0.y) * sL; vv[i + 2] = w1.z + (vv[i + 2] - w0.z) * sL; }
      }
      clips[n] = cc;
    }
    const meta = {}; for (const [n, m] of Object.entries(base.anims.meta)) meta[n] = { ...m, stride: m.stride * sL };
    out.anims = { meta, clips };
  }
  CACHE.set(name, out);
  return out;
}
function mergeGeos(list) {
  const pos = [], nrm = [], uv = [], idx = []; let off = 0;
  for (const g of list) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); }
    const I = g.index ? g.index.array : [...Array(P.count).keys()]; for (const i of I) idx.push(i + off); off += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const shade = (c, k) => { const [r, g, b] = hex(c).map((x) => Math.round(clamp(x * k, 0, 255))); return `rgb(${r},${g},${b})`; };
// calemActor gives everyone their own eye material (for blinking) with material.clone(),
// which drops the cel shader hooks; these materials keep them on clones
function keepCel(m) {
  const { onBeforeCompile, customProgramCacheKey } = m;
  m.clone = function () { const c = THREE.MeshLambertMaterial.prototype.clone.call(this); c.onBeforeCompile = onBeforeCompile; c.customProgramCacheKey = customProgramCacheKey; keepCel(c); return c; };
  return m;
}
// rounded corners for a box geometry (vertices pulled onto a rounded box)
function roundBox(g, w, h, d, r) {
  const P = g.attributes.position, p = new V3(), q = new V3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); q.set(clamp(p.x, -hw, hw), clamp(p.y, -hh, hh), clamp(p.z, -hd, hd));
    const off = p.clone().sub(q); if (off.lengthSq() > 0) off.setLength(r); p.copy(q).add(off); P.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
}

// the face texture: skin tone, no cheek marks, the person's mouth and lines
function faceFn(F, skin) {
  return (p, n, o, part, u, vv) => {
    // Ash's lightning-bolt cheek marks: paint them out with the skin around
    let s = o;
    if (u > 0.56 && u < 0.64 && vv > 0.37 && vv < 0.475 && !(o[0] > 200 && o[1] > 170)) s = [253, 214, 196];
    let r = isSkinTexel(s) ? toneSkin(s, skin, lum(s) > SKIN_L ? 0.35 : 0.75) : reskin(s, skin);   // the painted highlight calmed
    if (F.blush && p.z > 0.03) {   // pink cheeks under the eyes
      const d = Math.hypot((Math.abs(p.x) - 0.047) / 0.017, (p.y - 1.142) / 0.008);
      if (d < 1) r = mix(r, hex(F.blush), 0.38 * (1 - d * d));
    }
    if (F.stubble && p.z > -0.01 && p.y < 1.132) {   // a day's stubble on the jaw and upper lip
      const jaw = sstep(1.132, 1.122, p.y) * sstep(0.085, 0.06, Math.abs(p.x)), lip = Math.abs(p.y - 1.1255) < 0.0035 && Math.abs(p.x) < 0.018 ? 0.7 : 0;
      const k = Math.max(jaw, lip), dot = ((Math.sin(u * 1731.7 + vv * 911.3) * 43758.5) % 1 + 1) % 1;
      if (k > 0) r = mix(r, hex(F.stubble), k * (dot > 0.55 ? 0.5 : 0.22));
    }
    if (F.old && p.z > 0.04) {   // smile lines from the nose to the corners of the mouth
      const ax0 = Math.abs(p.x), t = clamp((1.138 - p.y) / 0.024), cx = 0.021 + 0.016 * t;
      if (t > 0 && t < 1 && Math.abs(ax0 - cx) < 0.0016) r = mul(r, 0.8);
    }
    if (F.mouth === 'o' && p.z > 0.06) {
      const dx = p.x / 0.0092, dy = (p.y - 1.1175) / 0.0108, d = Math.hypot(dx, dy);
      if (d < 1) r = d > 0.68 ? mix([62, 30, 32], r, sstep(0.88, 1, d)) : [110, 46, 50];
    }
    return r;
  };
}
