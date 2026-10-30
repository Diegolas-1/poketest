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
//   - props added as skinned meshes on the same skeleton (a hair crown, ponytail
//     and ribbon, a bucket hat, a backpack);
//   - clothes made as real garments over the body (garments.js): Oak's lab coat
//     (labcoat.js: shell, collar, lapels, pockets, sleeves and cuffs), the girl's dress, the fisher's vest, the kid's tee and shorts, standing off
//     the body and hanging from the shoulders, the long ones moving as cloth;
//   - proportions changed by scaling and moving bones in the rest pose and
//     baking that into the meshes and the bind pose, so the clips (rotations
//     only, plus the waist's bob, which is rescaled) still fit and feet plant.
// The result has the same shape as the base, and calemActor clones it like Ash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { labCoat } from './labcoat.js';
import { Build, slab, hangGrid, gridWeights, gridChains, paintGrid, clothSim, trisOf, nearW, mixW, ringOf, cast, fixRing, ZC, ARM_Y, ARM_Z } from './garments.js';
import { townsfolk } from './cast2.js';

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
      if (L.face.forehead !== 'smooth') for (const [ly, lw] of [[0.1, 0.22], [0.19, 0.27]]) if (Math.abs(cy - ly - 0.03 * Math.cos((cx - 0.38) * 6)) < 0.012 && Math.abs(cx - 0.38) < lw) r = mix(r, line, 0.8);
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
  return { P0, P1, D };
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
    drop: ['hathun', 'ash_extra', 'ash_logo', 'ash_sleeve'],
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
      if (part === 'hand' || sleeveTo(p, part, 0.175)) return skin;     // (the tee's sleeves are their own: below)
      if (p.y > 1.045) return trim;                                        // crew collar
      // backpack straps over the shoulders
      const sx = ax(p);
      if (!isArm(part) && sx > 0.045 && sx < 0.072 && p.y > 0.8) return strap;
      return keepShade(shirt, o, 0.5, 0.12);
    });
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
    v.garment((G) => {
      // loose shorts: two wide legs off the thighs, the hips round, hems standing off
      const PY = rowsOf([], 0.745, 0.5, 0.02), NC = 28, B = G.build(), body = [...G.torsoT, ...G.hipT];
      let left = null;
      for (const s of [1, -1]) {
        const L = s > 0 ? 'L' : 'R', T = G.hipT.filter((t) => t.v.every((p) => p.x * s > -0.004)), cx = s * 0.056, cz = 0.002;
        const P = PY.map((y) => {
          const dir = (ph) => V(s * Math.sin(ph), 0, Math.cos(ph));
          const rl = fixRing(Array.from({ length: NC }, (_, j) => cast(T, V(cx, y, cz), dir(j / NC * 2 * Math.PI), 0.12)), true, 2);
          const rh = fixRing(Array.from({ length: NC }, (_, j) => cast(body, V(0, y, ZC), dir(j / NC * 2 * Math.PI), 0.3)), true, 1);
          const t = sstep(0.7, 0.6, y), off = 0.012 + 0.014 * sstep(0.64, 0.5, y);
          return Array.from({ length: NC + 1 }, (_, j) => {
            const k = j % NC, ph = k / NC * 2 * Math.PI, sn = Math.sin(ph), cs = Math.cos(ph);
            const leg = V(cx + s * (rl[k] + off) * sn, y, cz + (rl[k] + off) * cs);
            const hip = V(s * Math.max((rh[k] + 0.007) * sn, -0.012), y, ZC + (rh[k] + 0.007) * cs);
            return hip.lerp(leg, t);
          });
        });
        const W = PY.map((y) => {
          const tH = sstep(0.745, 0.7, y), tT = sstep(0.7, 0.6, y);
          const w = mixW([1 - tH, { Spine1: 0.25, Waist: 0.45, Hips: 0.3 }], [tH * (1 - tT), { Hips: 1 }], [tH * tT, { [L + 'Thigh']: 1 }]);
          return P[0].map(() => w);
        });
        slab(B, P, W, 0.004, { loop: true, out: (p) => V(p.x - s * 0.05, 0, p.z - ZC), rims: { top: true, bottom: true } });
        if (s > 0) left = P;
      }
      G.add(B, paintGrid(left, 256, 128, (p, i, j) => {
        if (p.y > 0.722) return [58, 78, 120];                     // the waistband
        if (p.y < 0.516) return p.y < 0.504 ? mul(shorts, 0.8) : mul(shorts, 0.9);   // the hem
        if (Math.abs(j - NC / 4) < 0.14) return mul(shorts, 0.82);  // the outer seam
        return shorts;
      }, mul(shorts, 0.62)), 'kid_shorts');
      // the tee: hung from the shoulders, loose, straight down from the armpits, its hem off the belly
      const ys = rowsOf([0.958, 0.945], 0.93, 0.69, 0.02);
      G.hang({
        name: 'kid_tee', ys, nc: 44, pin: 2, mid: rowAt(ys, 0.89),
        off: offTop(0.005, 0.011, 0.82), tuck: 0.012, lining: mul(shirt, 0.66),
        paint: (p) => {
          if (p.y < 0.706) return p.y < 0.694 ? mul(trim, 0.9) : trim;   // the hem
          const x = Math.abs(p.x);
          if (p.z > 0 && p.y > 0.8) { const e = Math.min(x - 0.046, 0.073 - x); if (e > -0.0015) return mix(shirt, strap, clamp(0.5 + e / 0.003)); }   // the backpack's straps
          return shirt;
        },
      });
      // short sleeves: loose tubes round the upper arm, snug underneath (against the ribs with the arm down)
      const SX = [0.074, 0.086, 0.1, 0.12, 0.145, 0.17, 0.195], OFF = [-0.007, 0, 0.005, 0.009, 0.012, 0.014, 0.016], MIN = [0, 0, 0, 0.042, 0.045, 0.048, 0.05];
      const SB = G.build(); let sl = null;
      for (const s of [1, -1]) {
        const T = trisOf(G.top, (i, v) => v.every((p) => p.x * s > 0.03 && p.x * s < 0.3 && p.y > 0.93));
        const R = SX.map((x, i) => limbR(T, V(s * x, ARM_Y, ARM_Z), 16).map((r, j) => {
          const full = Math.max(r + OFF[i], MIN[i]), u = sstep(0.3, 0.95, -Math.cos(j / 16 * 2 * Math.PI));
          return full + (Math.min(full, r + 0.006) - full) * 0.8 * u;
        }));
        const P = SX.map((x, i) => Array.from({ length: 17 }, (_, j) => { const a = (j % 16) / 16 * 2 * Math.PI, r = R[i][j % 16]; return V(s * x, ARM_Y + r * Math.cos(a), ARM_Z + r * Math.sin(a)); }));
        const aw = G.armW(s), W = P.map((row) => row.map((p) => aw(p)));
        slab(SB, P, W, 0.004, { loop: true, out: (p) => V(0, p.y - ARM_Y, p.z - ARM_Z), rims: { bottom: true } });
        if (s > 0) sl = P;
      }
      G.add(SB, paintGrid(sl, 64, 64, (p, i) => (i > SX.length - 1.6 ? trim : shirt), mul(shirt, 0.66)), 'kid_sleeves');
      // the body drawn in under the tee and the shorts
      G.late('topsjer', drawIn((p, th) => 0.008 * sstep(0.95, 0.92, p.y)));
      G.late('btmsskin', (p) => {
        const t = sstep(0.49, 0.53, p.y) * sstep(0.76, 0.72, p.y); if (!t) return;
        const cx = Math.sign(p.x) * 0.056, d = Math.hypot(p.x - cx, p.z - 0.002); if (d < 1e-4) return;
        const f = 1 - 0.006 * t / d; p.x = cx + (p.x - cx) * f; p.z = 0.002 + (p.z - 0.002) * f;
      });
    });
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
    v.ponytail(c.hair, c.ribbon);
    // the dress: hung from the yoke, falling loose past the chest and flaring from the waist
    // into a soft pleated skirt with a white hem, moving as cloth
    v.garment((G) => {
      const ys = rowsOf([0.958, 0.945], 0.93, 0.47, 0.02), hem = ys.length - 1, dark = hex(c.dress2);
      G.hang({
        name: 'girl_dress', ys, nc: 48, pin: 2, mid: rowAt(ys, 0.85),
        off: offTop(0.004, 0.012),
        min: (y, th) => {
          const t = clamp((0.775 - y) / 0.305); if (t <= 0) return 0;
          const e = t ** 0.9, rx = 0.118 + 0.087 * e, rz = 0.086 + 0.094 * e;
          return (1 / Math.hypot(Math.sin(th) / rx, Math.cos(th) / rz)) * (1 + 0.028 * Math.cos(th * 14) * t);
        },
        tuck: 0.01, lining: mul(dark, 0.86),
        paint: (p) => {
          const y = p.y;
          if (y < 0.496) return y < 0.474 ? mul(white, 0.9) : white;   // the hem's white band
          const th = Math.atan2(p.x, p.z - ZC), f = ((th / (2 * Math.PI) * 14) % 1 + 1) % 1;
          if (y < 0.74 && Math.abs(f - 0.5) < 0.04 * sstep(0.74, 0.6, y)) return dark;   // the pleats' folds
          if (Math.abs(y - 0.768) < 0.0024) return dark;   // the seam under the bodice
          return dress;
        },
        sim: {
          tag: 'D', ns: 20, rows: [2, rowAt(ys, 0.75), hem], parent: 'Spine2',
          prm: () => ({
            ks: [40, 26], drag: [0.5, 0.9], damp: 4.5, vmax: 1.6, flut: 0.55, cone: [0.35, 0.6], hangBone: 'Hips', hang: [0, 0.5, 0.75], quad: true,
            coll: [{ ring: 'Spine1', caps: ['arms'], seg: ['arms'] },
              { ring: 'Hips', mid: 'Hips', caps: ['arms'], seg: ['arms', 'thighs'], after: ['thighs'] }],
          }),
        },
      });
      G.late('topsjer', drawIn((p) => 0.01 * sstep(0.95, 0.92, p.y)));
    });
  },
  fisher(v) {
    const c = C.fisher, skin = hex(c.skin), shirt = hex(c.shirt), vest = hex(c.vest), pocket = hex(c.pocket), seam = mul(vest, 0.78), pants = hex(c.pants);
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand') return ax(p) < 0.462 ? mul(shirt, 0.86) : skin;   // the cuff right to the wrist
      if (isArm(part)) return ax(p) > 0.425 ? mul(shirt, 0.86) : shirtFolds(p) ? mul(shirt, 0.88) : keepShade(shirt, o, 0.6, 0.25);   // long sleeves, creased, buttoned cuffs
      const x = ax(p);
      if (p.y > 1.04) return mul(shirt, 0.95);                       // shirt collar
      if (p.y < 0.94 && p.z > 0 && x < 0.06) return shirt;           // under the vest's opening
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
    v.shape('topsjer', looseSleeves(0.12, 0.41, 0.07));
    // the fishing vest: a boxy shell over the shirt, hung from the shoulders, open down the
    // front, straight down from the armpits to the hip, four patch pockets with flaps
    v.garment((G) => {
      const ys = rowsOf([0.958, 0.945], 0.93, 0.70, 0.02), nc = 44, PK = [[0.872, 0.948], [0.742, 0.828]];
      const g = G.hang({
        name: 'fisher_vest', ys, nc, pin: 2, mid: rowAt(ys, 0.85), gap: () => 0.21,
        off: offTop(0.006, 0.016, 0.83), tuck: 0.012, th: 0.006, lining: mul(vest, 0.7),
        paint: (p, i, j) => {
          const x = Math.abs(p.x), y = p.y, je = Math.min(j, nc - j);
          if (je < 0.9 || y < 0.713) return seam;   // the front edges' facing and the hem's band
          if (p.z > 0.02) for (const [y0, y1] of PK) if (y > y0 && y < y1 && x > 0.042 && x < 0.097) return x < 0.046 || x > 0.093 || y < y0 + 0.004 ? seam : pocket;
          if (p.z < -0.02 && Math.abs(y - 0.925) < 0.0022) return seam;   // the back's yoke
          return vest;
        },
      });
      const flaps = [];
      for (const [, y1] of PK) for (const s of [1, -1]) flaps.push({ ...G.on(g, s * 0.0695, y1 - 0.008), w: 0.06, h: 0.018, d: 0.006 });
      G.boxes(flaps, c.pocket, 'fisher_flaps');
      G.late('topsjer', drawIn((p, th) => 0.008 * sstep(0.95, 0.92, p.y) * sstep(0.3, 0.6, Math.abs(th))));
    });
  },
  oak(v) {
    const c = C.oak, skin = hex(c.skin), shirt = hex(c.shirt), coat = hex(c.coat), coat2 = hex(c.coat2), pants = hex(c.pants);
    // the body as what he wears under the coat (garments: below): the red shirt, its collar
    // turned down at the neck and its sleeves to the wrists, and the brown trousers
    v.paint('topsjer', 0.5, (p, n, o, part) => {
      if (part === 'hand') return skin;   // (the wrist, inside the cuff)
      if (isArm(part)) return ax(p) > 0.43 ? skin : keepShade(shirt, o, 0.6, 0.2);   // (bare wrists inside the cuffs)
      if (p.y > 1.05) return p.y > 1.072 ? mul(shirt, 0.78) : mul(shirt, 0.9);   // the shirt's collar, its edge
      return keepShade(shirt, o, 0.5, 0.3);
    });
    v.paint('btmsskin', 0.5, (p, n, o) => (p.y > 0.69 ? hex(c.belt) : keepShade(pants, o, 0.55, 0.6)));
    v.shoes({ up: c.shoes, sole: c.sole, rim: c.shoes, sock: c.pants, sockY: 0.1, slim: false });
    v.hair(c.hair, 0.8);
    v.shape('ash_extra', (p) => { if (p.y > 1.3) p.set(0, 1.2, -0.02); });   // drop Ash's cap button
    v.shape('hair01_on', foldFringe);
    v.shape('hair01_on', liftNape);
    v.shape('topsjer', lowerCollar(1.05, 0.38));   // Ash's tall collar down to a shirt collar
    v.neck();
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
    // the lab coat, every part of it real cloth over the body (labcoat.js): the shell hung
    // from the shoulders and moving as cloth below the chest, the collar, lapels, pockets,
    // sleeves and cuffs
    v.garment((G) => {
      labCoat(G, { coat, coat2, shirt });
      // the shirt drawn in under the coat's back and sides (the opening left as it is),
      // and the arms a little inside their sleeves
      G.late('topsjer', drawIn((p, th) => 0.012 * sstep(0.95, 0.92, p.y) * sstep(0.55, 0.95, Math.abs(th))));
      G.late('topsjer', (p, part) => {
        if (part !== 'upper' && part !== 'fore') return;
        const x = ax(p), k = sstep(0.1, 0.14, x) * sstep(0.45, 0.43, x), dy = p.y - ARM_Y, dz = p.z - ARM_Z, r = Math.hypot(dy, dz);
        if (!k || r < 1e-4) return;
        const f = 1 - 0.004 * k / r; p.y = ARM_Y + dy * f; p.z = ARM_Z + dz * f;
      });
    });
  },
};
// Oak's hair: the fringe folded away up under the crown, so the forehead shows
function foldFringe(p) {
  if (p.z < 0.035 || Math.abs(p.x) > 0.085 || p.y > 1.25) return;
  p.set(p.x * 0.8, 1.255, Math.min(p.z, 0.07));
}
// and the ends at the nape taken up a little, clear of the coat's collar
function liftNape(p) {
  if (p.z > -0.02 || p.y > 1.112) return;
  p.y = 1.112 - (1.112 - p.y) * 0.45;
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
// a shirt sleeve's creases: across the inside of the elbow, and bunched above the cuff
function shirtFolds(p) {
  const x = Math.abs(p.x), a = Math.atan2(p.z + 0.004, p.y - 1.029), inner = Math.abs(a - Math.PI / 2) < 1.1;
  for (const [x0, amp, ph, all] of [[0.262, 0.012, 0, 0], [0.29, 0.01, 1.3, 0], [0.4, 0.008, 2, 1]]) {
    if ((all || inner) && Math.abs(x - x0 - amp * Math.sin(a * 1.5 + ph)) < 0.0035) return true;
  }
  return false;
}
// radii round the arm at a point on its axis (T pose), by rays at the body: 0 = up, then to the front
const limbR = (T, c, n) => fixRing(Array.from({ length: n }, (_, j) => { const a = j / n * 2 * Math.PI; return cast(T, c, V(0, Math.cos(a), Math.sin(a)), 0.08); }), true, 2);
// sleeves let out round the arm (along it from x0 to x1, by k at most), as cloth not skin
function looseSleeves(x0, x1, k) {
  return (p, n, part) => {
    if (part !== 'upper' && part !== 'fore') return;
    const x = Math.abs(p.x), f = 1 + k * sstep(x0, x0 + 0.05, x) * sstep(x1, x1 - 0.03, x);
    p.y = 1.029 + (p.y - 1.029) * f; p.z = -0.004 + (p.z + 0.004) * f;
  };
}
// Ash's tall collar folded down into a low neckline
function lowerCollar(y0, k) {
  return (p, n, part) => {
    if (isArm(part) || p.y <= y0) return;
    p.y = y0 + (p.y - y0) * k;
  };
}

// ---------- garments ----------
// the people's clothes as real garments over the body (garments.js), made on the body in its
// rest pose once it is shaped (before the proportions, which then carry them along). G, for
// each person's garment functions: the body to clear and its weights, and
//   G.hang(o): a garment hanging round the trunk (see hangGrid), painted by o.paint(p, i, j),
//     lined with o.lining; o.sim: its panels move as cloth (cloth bones and a sim chain each)
//   G.add(B, texture, name): any other garment from a Build
//   G.late(mesh name, fn(p, part)): reshape the body afterwards (drawn in under the cloth)
const V = (x = 0, y = 0, z = 0) => new V3(x, y, z);
const rowsOf = (head, a, b, step) => { const n = Math.round((a - b) / step); return [...head, ...Array.from({ length: n + 1 }, (_, i) => +(a - (a - b) * i / n).toFixed(4))]; };
const rowAt = (ys, y) => ys.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(ys[b] - y) ? i : b), 0);   // the row nearest y
// a garment's stand-off from the top: tucked into the painted yoke at 0.958, a easing to b clear by y1
const offTop = (a, b, y1 = 0.85) => (y) => (y > 0.945 ? -0.007 * (y - 0.945) / 0.013 : y > 0.93 ? a * (0.945 - y) / 0.015 : a + (b - a) * sstep(0.93, y1, y));
function trisOfBuild(B) {
  const out = [], P = (i) => V(B.pos[i * 3], B.pos[i * 3 + 1], B.pos[i * 3 + 2]);
  for (let t = 0; t < B.idx.length; t += 3) out.push({ v: [P(B.idx[t]), P(B.idx[t + 1]), P(B.idx[t + 2])] });
  return out;
}
function dressUp(scene, meshes, hairM, fns, extras, cel) {
  scene.updateMatrixWorld(true);
  const top = meshes.get('topsjer'), bot = meshes.get('btmsskin'), tp = top.userData.parts;
  const boneBy = {}; scene.traverse((b) => { if (b.isBone) boneBy[b.name] = b; });
  const names = [], slot = (n) => { let i = names.indexOf(n); if (i < 0) { i = names.length; names.push(n); } return i; };
  const made = [], late = [];
  const G = {
    top, bot, boneBy, chains: [], links: [], groups: [],
    torsoT: trisOf(top, (i) => i.every((k) => tp[k] === 'torso')),
    hipT: trisOf(bot, (i, v) => v.every((p) => p.y > 0.3)),
    extraT: [],
    bodyW: nearW([{ mesh: top, keep: (x, y, z, i) => tp[i] === 'torso' }, { mesh: bot, keep: (x, y) => y > 0.62 }]),
    armW: (s) => nearW([{ mesh: top, keep: (x, y) => x * s > 0.04 && y > 0.9 }]),
    late: (nm, fn) => late.push([nm, fn]),
    build: () => new Build(slot),
    add(B, tex, name, sim = false) { made.push({ geo: B.geometry(), tex, name, sim }); G.extraT.push(...trisOfBuild(B)); },
    // the point on a garment grid's front nearest x at height y, and the turn (about y) of the cloth there
    on(g, x, y) {
      let i = 0; while (i < g.P.length - 2 && g.P[i + 1][0].y > y) i++;
      const u = clamp((g.P[i][0].y - y) / (g.P[i][0].y - g.P[i + 1][0].y)), at = (j) => g.P[i][j].clone().lerp(g.P[i + 1][j], u);
      let bj = 0;
      for (let j = 0; j < g.P[0].length; j++) { const p = at(j); if (p.z > 0 && Math.abs(p.x - x) < Math.abs(at(bj).x - x)) bj = j; }
      const t = at(Math.min(g.P[0].length - 1, bj + 1)).sub(at(Math.max(0, bj - 1)));
      return { p: at(bj), th: Math.atan2(-t.z, t.x) };
    },
    // small rounded boxes on a garment (pocket flaps), following the body there
    boxes(list, color, name) {
      const B = G.build();
      for (const { p, th, w, h, d } of list) {
        const geo = new THREE.BoxGeometry(w, h, d, 2, 1, 1); roundBox(geo, w, h, d, d * 0.45);
        geo.translate(0, 0, d / 2 - 0.001).rotateY(th).translate(p.x, p.y, p.z);
        const P = geo.attributes.position, base = B.pos.length / 3;
        for (let i = 0; i < P.count; i++) { const q = V().fromBufferAttribute(P, i); B.v(q, [0.5, 0.5], G.bodyW(q)); }   // as the cloth under it
        for (const k of geo.index.array) B.idx.push(base + k);
      }
      const cv = document.createElement('canvas'); cv.width = cv.height = 4; const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 4, 4);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
      G.add(B, t, name);
    },
    // a cloth bone at a rest point, turned like the model (no rotation in its frame)
    bone(name, parent, p) {
      const pb = boneBy[parent], b = new THREE.Bone(); b.name = name;
      pb.updateWorldMatrix(true, false);
      pb.matrixWorld.clone().invert().multiply(new M4().makeTranslation(p.x, p.y, p.z)).decompose(b.position, b.quaternion, b.scale);
      pb.add(b); b.updateWorldMatrix(false, false); boneBy[name] = b; slot(name);
      return b;
    },
    hang(o) {
      const g = o.grid || hangGrid({ T: [...G.torsoT, ...G.hipT, ...G.extraT], ...o });
      const sim = o.sim && { ...o.sim, loop: g.closed };
      const W = g.W = gridWeights(g.P, o.weights || G.bodyW, sim);
      const B = G.build();
      slab(B, g.P, W, o.th ?? 0.0045, { loop: g.closed, out: (p) => V(p.x, 0, p.z - ZC), rims: o.rims || (g.closed ? { bottom: true } : { bottom: true, left: true, right: true }) });
      G.add(B, paintGrid(g.P, 512, 256, o.paint, o.lining), o.name, !!sim);
      if (sim) {
        const from = G.chains.length, cs = gridChains(g.P, sim);
        for (const c of cs) {
          c.bones.forEach((n, k) => G.bone(n, k ? c.bones[k - 1] : sim.parent, c.rest[k]));
          G.chains.push({ ...sim.prm(c), parent: sim.parent, bones: c.bones, tip0: c.rest[c.rest.length - 1].clone() });
        }
        G.groups.push({ from, n: cs.length, loop: g.closed });
        for (let s = 0; s < cs.length - (g.closed ? 0 : 1); s++) for (let k = 0; k < sim.rows.length - 1; k++) G.links.push([from + s, k, from + (s + 1) % cs.length, k]);
      }
      return g;
    },
  };
  for (const fn of fns) fn(G);
  scene.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(names.map((n) => boneBy[n]));
  for (const p of made) {
    const mat = toon('#ffffff', { map: p.tex, cel }); mat.name = 'cast_' + p.name;
    const m = new THREE.SkinnedMesh(p.geo, mat);
    m.name = p.name; m.userData.sim = p.sim; m.castShadow = true; m.frustumCulled = false;
    hairM.parent.add(m); m.bind(skel, hairM.bindMatrix); extras.push(m);
  }
  // the body drawn in under the cloth, so it cannot reach through
  for (const [nm, fn] of late) {
    const m = meshes.get(nm); if (!m) continue;
    const P = m.geometry.attributes.position, p = new V3();
    for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); fn(p, m.userData.parts[i]); P.setXYZ(i, p.x, p.y, p.z); }
    P.needsUpdate = true;
  }
  return G;
}
// draw a body mesh in toward the trunk's axis by d(p, th) (model units)
const drawIn = (d) => (p, part) => {
  if (part !== 'torso' && part !== 'thigh') return;
  const x = p.x, z = p.z - ZC, r = Math.hypot(x, z), k = d(p, Math.atan2(x, z)); if (!k || r < 1e-4) return;
  const f = Math.max(0.82, 1 - k / r); p.x = x * f; p.z = ZC + z * f;
};
// after the proportions: the sim's rest points, the body's girth and the limbs' capsules
// in the new rest pose
function simKit(G, scene, meshes, D) {
  scene.updateMatrixWorld(true);
  const B = G.boneBy, at = (n) => B[n].getWorldPosition(V());
  for (const c of G.chains) c.rest = [...c.bones.map(at), c.tip0.clone().applyMatrix4(D.get(B[c.bones[c.bones.length - 1]]))];
  const restInv = {}, restQ = {};
  for (const n in B) { restInv[n] = B[n].matrixWorld.clone().invert(); restQ[n] = B[n].getWorldQuaternion(new THREE.Quaternion()); }
  const top = meshes.get('topsjer'), bot = meshes.get('btmsskin'), tp = top.userData.parts, bp = bot.userData.parts;
  const T = [...trisOf(top, (i) => i.every((k) => tp[k] === 'torso')), ...trisOf(bot, (i, v) => v.every((p) => p.y > 0.3))];
  const rings = new Map(), ringAt = (y) => { const k = Math.round(y * 400); if (!rings.has(k)) rings.set(k, ringOf(T, k / 400)); return rings.get(k); };
  // a limb's capsule: its bones' joints, its radius from the skin round it (most of it inside)
  const caps = {};
  const radius = (mesh, parts, part, s, a, b, q = 0.9) => {
    const P = mesh.geometry.attributes.position, p = V(), ab = b.clone().sub(a), d = [];
    for (let i = 0; i < P.count; i++) {
      if (parts[i] !== part) continue;
      p.fromBufferAttribute(P, i); if (p.x * s <= 0) continue;
      const u = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq()); d.push(p.distanceTo(a.clone().addScaledVector(ab, u)));
    }
    d.sort((x, y) => x - y);
    return d.length ? d[Math.floor(d.length * q)] : 0.04;
  };
  for (const [L, s] of [['L', 1], ['R', -1]]) {
    const sh = at(L + 'ArmA'), el = at(L + 'ForeArm'), wr = at(L + 'Hand'), tip = wr.clone().lerp(el, -0.45);
    const cap = (n, bone, a, b, r) => { caps[n] = { bone, a, b, r0: r + 0.006, r1: r + 0.006, out: bone.endsWith('Thigh') || bone.endsWith('Leg'), inn: !!G.armsOutside && /Arm|Hand/.test(bone) }; };
    // (the arms fatter by what is worn over them: G.armPad, a sleeve standing off the skin)
    cap(L + 'arm', L + 'ArmA', sh, el, radius(top, tp, 'upper', s, sh, el) + (G.armPad || 0));
    cap(L + 'fore', L + 'ForeArm', el, wr, radius(top, tp, 'fore', s, el, wr) + (G.armPad || 0));
    cap(L + 'hand', L + 'Hand', wr, tip, radius(top, tp, 'hand', s, wr, tip));
    const hp = at(L + 'Thigh'), kn = at(L + 'Leg'), an = at(L + 'Foot');
    // (the legs a little fatter: the cloth between two particles must clear them too)
    cap(L + 'thigh', L + 'Thigh', hp, kn, radius(bot, bp, 'thigh', s, hp, kn, 0.98) + 0.01);
    cap(L + 'shin', L + 'Leg', kn, an, radius(bot, bp, 'shin', s, kn, an, 0.98) + 0.01);
  }
  const SETS = { arms: ['Larm', 'Lfore', 'Lhand', 'Rarm', 'Rfore', 'Rhand'], thighs: ['Lthigh', 'Rthigh'], legs: ['Lthigh', 'Rthigh', 'Lshin', 'Rshin'] };
  const list = (x) => (x || []).flatMap((n) => SETS[n] || [n]);
  const chains = G.chains.map((c) => ({
    ...c,
    coll: c.coll.map((k, i) => {
      const y = c.rest[i + 1].y, ym = (c.rest[i].y + y) / 2;
      return { caps: list(k.caps), seg: list(k.seg), after: list(k.after),
        ring: k.ring && { bone: k.ring, ring: ringAt(y), pad: k.pad ?? 0.009 },
        mid: k.mid && { bone: k.mid, ring: ringAt(ym), pad: k.midPad ?? 0.008 } };
    }),
  }));
  const links = G.links.map(([a, k, b]) => [a, k, b, k, chains[a].rest[k + 1].distanceTo(chains[b].rest[k + 1])]);
  return { chains, links, groups: G.groups, restInv, restQ, caps };
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
  const flats = [], garmentFns = [];
  const v = {
    name, meshes, sk, hairM, add, C: C[name], CLOTH, SKIN,
    // a real garment over the body (garments.js), made once the body is shaped: fn(G)
    garment: (fn) => garmentFns.push(fn),
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
      g.translate(0, 0.88, -0.128);
      v.flat(g, c1, () => [['Spine3', 0.7], ['Spine2', 0.3]]);
      const f = new THREE.BoxGeometry(0.152, 0.075, 0.074, 3, 2, 2); roundBox(f, 0.152, 0.075, 0.074, 0.02); f.translate(0, 0.94, -0.129);
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
  const G = garmentFns.length ? dressUp(scene, meshes, hairM, garmentFns, extras, CLOTH) : null;
  const all = [...meshes.values(), ...extras];
  const { P0, P1, D } = reproportion(scene, all, spec.edits || {});
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
  // the cloth's sim, for the garments that move on their own (each clone its own)
  if (G && G.chains.length) {
    const kit = simKit(G, scene, meshes, D);
    out.dress = (m) => { const ms = []; m.traverse((o) => { if (o.isSkinnedMesh && o.userData.sim) ms.push(o); }); return clothSim(m, kit, ms); };
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
    // lips a little coloured: the mouth's dark line and the texels round it
    if (F.lips && p.z > 0.06 && Math.abs(p.x) < 0.024 && Math.abs(p.y - 1.1175) < 0.007) {
      const k = sstep(0.024, 0.012, Math.abs(p.x)) * sstep(0.007, 0.003, Math.abs(p.y - 1.1175));
      if (lum(r) < 0.62) r = mix(r, hex(F.lips), 0.55 * k);
    }
    // freckles across the nose and the cheeks
    if (F.freckles && p.z > 0.05) {
      const d = Math.hypot((Math.abs(p.x) - 0.036) / 0.026, (p.y - 1.141) / 0.009);
      if (d < 1) { const gx = u * 512, gy = vv * 512, cx = Math.floor(gx / 3.2), cy = Math.floor(gy / 3.2), h = ((Math.sin(cx * 127.1 + cy * 311.7) * 43758.5) % 1 + 1) % 1;
        if (h > 0.82 && Math.hypot(gx / 3.2 - cx - 0.5, gy / 3.2 - cy - 0.5) < 0.42) r = mix(r, hex(F.freckles), 0.55 * (1 - d)); }
    }
    // age: a line under each eye and lines out from the corners
    if (F.wrinkles && p.z > 0.02) {
      const x0 = Math.abs(p.x);
      if (x0 > 0.026 && x0 < 0.062 && Math.abs(p.y - 1.1405 - 0.05 * (x0 - 0.044) ** 2 * 40) < 0.0013) r = mul(r, 0.86);
      for (const [dy, k] of [[0.006, 0.4], [-0.002, 0.25]]) if (x0 > 0.068 && x0 < 0.082 && Math.abs(p.y - 1.155 - dy - (x0 - 0.068) * k) < 0.0012) r = mul(r, 0.85);
    }
    if (F.mouth === 'o' && p.z > 0.06) {
      const dx = p.x / 0.0092, dy = (p.y - 1.1175) / 0.0108, d = Math.hypot(dx, dy);
      if (d < 1) r = d > 0.68 ? mix([62, 30, 32], r, sstep(0.88, 1, d)) : [110, 46, 50];
    }
    return r;
  };
}

// the rest of the town (cast2.js): their colours, proportions and builds, made with the same kit
{
  const T = townsfolk({
    hex, mix, mul, lum, clamp, sstep, keepShade, toneSkin, isArm, ax, sleeveTo, V, sheet, mergeGeos, shade, roundBox, canvasMat, flatMat,
    rowsOf, rowAt, offTop, drawIn, slimLegs, lowerCollar, looseSleeves, shirtFolds, limbR, legR, foldFringe, liftNape, crown, skinGeo, labCoat,
  });
  Object.assign(C, T.C); Object.assign(CAST, T.CAST); Object.assign(BUILD, T.BUILD);
}
