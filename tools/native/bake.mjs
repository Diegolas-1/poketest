// Bakes the web build's Pallet Town into files for the native (Godot) game.
// The world is made once by the web generator (web/world/*.js) in a headless
// browser, then saved to native/world/:
//   terrain.glb   ground mesh (positions, normals, vertex colours, uv)
//   town.glb      every static building and prop, as drawn (merged meshes)
//   water.glb     sea and fresh water surfaces (mesh names sea_*, fresh0_* pond, fresh1_* stream)
//   pathmap.rgba  the path map, raw RGBA8 (R = signed distance, as in paths.js)
//   grass.png     the painted grass colour texture
//   ground.bin    walk grid: uint16 height (cm + 2000) then uint8 flags per cell
//   seabed.bin    float32 terrain height every metre over the terrain (water depth)
//   grassmap.bin  float32 pairs [height, density] for the grass field (1 m)
//   world.json    sizes and boxes of the grids, colliders, spawn, sun, sea level
//   town_inst.bin repeated town parts (pickets, posts, treads): float32 x 15 per
//                 copy (3x4 matrix, rows, then rgb); world.json inst lists the
//                 mesh node I<k> in town.glb and the copies of each
//   veg.bin/.json every plant: each model part's geometry once, its material
//                 (leaf / bark / rock and the cel bands), and where its copies
//                 stand (3x4 matrices); far billboards (veg_imp_N.png) baked by
//                 the web's own Impostor; leaf atlas and barks as veg_*.png
//   mountains.bin the distant ranges (main.js opening to the south included)
//   clouds.png/.json the painted clouds as one atlas, and where each sprite is
// Run: node tools/native/bake.mjs   (serves web/ on :8790 if nothing is there)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/world');
fs.mkdirSync(OUT, { recursive: true });

const PORT = process.env.WEB_PORT || '8790';   // WEB_PORT: bake another checkout's web/
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/`)).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
// small patches to the web build, only for the bake: materials remember how
// they were made (cel bands, leaf / bark settings), scatters remember their
// model and options, billboards keep their pixels, pictures are not freed
const patch = async (file, edits) => p.route('**/world/' + file, async (route) => {
  const r = await route.fetch();
  let body = await r.text();
  for (const [a, b] of edits) { if (!body.includes(a)) throw new Error('bake patch not found in ' + file + ': ' + a); body = body.replace(a, b); }
  await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'text/javascript' } });
});
await patch('toon.js', [['const prev = m.onBeforeCompile;', 'm.userData.cel = o; const prev = m.onBeforeCompile;']]);
await patch('foliage.js', [
  ["const m = new THREE.MeshLambertMaterial({ map: leafAtlas(variant), color: new THREE.Color(tint), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });",
    "const m = new THREE.MeshLambertMaterial({ map: leafAtlas(variant), color: new THREE.Color(tint), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true }); m.userData.leaf = { tint, wind, variant };"],
  ['const m = new THREE.MeshLambertMaterial({ map: t });', "const m = new THREE.MeshLambertMaterial({ map: t }); m.userData.bark = { color, style, wind, mossy: style === 'ridged' || style === 'smooth' };"],
]);
await patch('assets.js', [
  ['this.chunks = [];', 'this.chunks = []; this.model = model; this.opts = { fade: fade || [maxDist - 4, maxDist], shrink, wind: w, shadows, far };'],
  ['tex.onUpdate = () => { tex.image = { data: null, width: W, height: H }; };', ''],
]);
await patch('main.js', [
  ['if (gameFrame % 180 === 90 && window.worldReady) freePictures();', ''],
  ['scene.add(mts);', "mts.name = 'mountains'; scene.add(mts);"],
  ['const clouds = buildClouds(); scene.add(clouds);', "const clouds = buildClouds(); clouds.name = 'clouds'; scene.add(clouds);"],
]);
await p.goto(`http://localhost:${PORT}/world/?test&q=high&outline=0`);
await p.waitForFunction(() => window.worldReady, null, { timeout: 300000 });
console.log('world ready');

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { mergeGeometries, mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js');
  const T = await import('/world/terrain.js');
  const P = await import('/world/paths.js');
  const w = window.world;
  const ex = new GLTFExporter();
  const glb = (obj) => new Promise((ok, bad) => ex.parse(obj, (r) => ok(new Uint8Array(r)), bad, { binary: true, onlyVisible: true }));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  // a flat copy of every visible mesh under root, in world space
  const insts = [];
  const flat = (root, keep = () => true) => {
    root.updateMatrixWorld(true);
    const G = new THREE.Group();
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.userData.inkLines || !shown(o) || !keep(o)) return;
      if (o.isInstancedMesh) { insts.push(o); return; }   // repeated parts: one mesh + copies (below)
      const m = new THREE.Mesh(o.geometry, o.material);
      m.name = o.name || '';
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      G.add(m);
    });
    return G;
  };
  const out = {};
  const canvasPngOf = (cv) => cv.toDataURL('image/png').split(',')[1];

  // terrain
  // (chunks of the ground and Route 1's ledges, one mesh each: terrain.js buildTerrain)
  const terr = w.scene.children.find((o) => o.name === 'terrain');
  const tg = new THREE.Group(), terrMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const c of terr.children) { const tm = new THREE.Mesh(c.geometry, terrMat); tm.name = c.name; tg.add(tm); }
  out.terrain = b64(await glb(tg));

  // town (static, merged), with plain materials: colour, texture, flags
  const tmat = new Map();
  const plain = (m) => {
    if (tmat.has(m)) return tmat.get(m);
    const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors,
      side: m.side, transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, roughness: 1, metalness: 0 });
    n.name = m.userData.leaf ? 'leaf_' + m.userData.leaf.variant : (m.name || 'm') + (m.polygonOffset ? '_decal' : '') + (m.vertexColors ? '_vc' : '');
    tmat.set(m, n); return n;
  };
  const town = flat(w.town.group);
  // repeated parts: plants (leaf, bark, rock materials) go with the
  // vegetation; the rest (pickets, posts, treads) as one mesh I<k> each in
  // town.glb plus their copies
  const isPlant = (m) => m && m.userData && (m.userData.leaf || m.userData.bark || m.userData.rock);
  const townPlants = [], instList = [], instData = [];
  let instN = 0;
  for (const o of insts) {
    if (isPlant(o.material)) { townPlants.push(o); continue; }
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Mesh(g, o.material);
    m.name = 'I' + instList.length;
    town.add(m);
    const im = new THREE.Matrix4(), wm = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, im); wm.multiplyMatrices(o.matrixWorld, im);
      const e = wm.elements;   // column major: rows of the 3x4 are e[0],e[4],e[8],e[12] ...
      if (o.instanceColor) o.getColorAt(i, c); else c.setRGB(1, 1, 1);
      instData.push(e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14], c.r, c.g, c.b);
    }
    instList.push({ node: m.name, off: instN, n: o.count, color: !!o.instanceColor, shadow: o.castShadow });
    instN += o.count;
  }
  town.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(plain) : plain(o.material); });
  out.townInst = b64(new Uint8Array(new Float32Array(instData).buffer));
  out.inst = instList;
  out.town = b64(await glb(town));
  out.townMeshes = town.children.length;


  // ---------- vegetation: models once, copies as matrices ----------
  {
    const A = await import('/world/assets.js');
    const bufs = [];   // [Float32Array | Uint32Array]
    let byteLen = 0;
    const put = (arr) => { const off = byteLen; bufs.push(arr); byteLen += arr.byteLength; return [off, arr.length]; };
    const pngs = {};
    const canvasPng = (cv) => cv.toDataURL('image/png').split(',')[1];
    // raw pixels (rows bottom-up, as GL reads them) to a PNG, top row first
    const pixelsPng = (px, W, H) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      ctx.putImageData(img, 0, 0);
      return canvasPng(cv);
    };
    const texName = new Map();
    const texOf = (t, prefix) => {
      if (!t) return null;
      const key = t.source ? t.source.uuid : t.uuid;
      if (texName.has(key)) return texName.get(key);
      const name = `veg_${prefix}${texName.size}.png`;
      texName.set(key, name);
      pngs[name] = canvasPng(t.image);
      return name;
    };
    const mats = [], matId = new Map();
    const matOf = (m) => {
      if (matId.has(m.uuid)) return matId.get(m.uuid);
      const u = m.userData, d = { cel: u.cel || {} };
      if (u.leaf) Object.assign(d, { kind: 'leaf', tint: '#' + m.color.getHexString(), wind: u.leaf.wind, tex: texOf(m.map, 'leaf_' + u.leaf.variant + '_') });
      else if (u.bark) Object.assign(d, { kind: 'bark', color: u.bark.color, style: u.bark.style, wind: u.bark.wind, mossy: u.bark.mossy, tex: texOf(m.map, 'bark') });
      else Object.assign(d, { kind: u.stone ? 'stone' : 'rock', color: '#' + m.color.getHexString() });   // stone: stone.js (veg_stone.gdshader)
      mats.push(d); matId.set(m.uuid, mats.length - 1);
      return mats.length - 1;
    };
    const meshes = [], meshId = new Map();
    // unindexed geometry (merged wood) is welded back to shared vertices, so
    // the native game can simplify it into levels of detail
    const weld = (g0) => {
      if (g0.index) return g0;
      const g = g0.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'flutter'].includes(k)) g.deleteAttribute(k);
      return mergeVertices(g, 1e-5);
    };
    // Leaf cards cut down to the painted part of their atlas tile: a card is a
    // whole tile, often half empty (fronds, ferns), and the GPU pays for the
    // empty pixels it throws away. Each card's corners move to the tile's
    // opaque box (4 px margin); position, normal and uv follow bilinearly.
    const tileBoxes = new Map();
    const boxesOf = (tex) => {
      const key = tex.source ? tex.source.uuid : tex.uuid;
      if (tileBoxes.has(key)) return tileBoxes.get(key);
      const cv = tex.image, S = cv.width / 4, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, out = [];
      for (let t = 0; t < 16; t++) {
        const x0 = (t % 4) * S, y0 = Math.floor(t / 4) * S;
        let a = S, b = -1, c = S, e = -1;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[((y0 + y) * cv.width + x0 + x) * 4 + 3] >= 100) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); e = Math.max(e, y); }
        // tile pixels -> the card's 0..1 (pushCard: u = tx + uu * 0.245 + 0.0025; canvas y runs down, v up)
        const W = cv.width, uu = (px) => Math.min(1, Math.max(0, ((px / W) * 4 - 0.01) / 0.98));
        out.push(b < 0 ? [0, 1, 0, 1] : [uu(a - 4), uu(b + 5), uu(S - (e + 5)), uu(S - (c - 4))]);
      }
      tileBoxes.set(key, out);
      return out;
    };
    const trimCards = (g, tex) => {
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count / 4, boxes = boxesOf(tex);
      if (!U || P.count % 4) return g;
      let before = 0, after = 0;
      const v3 = (A, i) => [A.getX(i), A.getY(i), A.getZ(i)];
      for (let q = 0; q < n; q++) {
        const i = q * 4, u0 = U.getX(i), v0 = U.getY(i);
        const tile = Math.floor(u0 * 4 + 1e-4) + 4 * (3 - Math.floor(v0 * 4 + 1e-4));
        const [bu0, bu1, bv0, bv1] = boxes[tile];
        const p = [0, 1, 2, 3].map((k) => v3(P, i + k)), nn = [0, 1, 2, 3].map((k) => v3(N, i + k));
        // corners: 0 (0,0) 1 (1,0) 2 (1,1) 3 (0,1)
        const at = (L, s, t) => [0, 1, 2].map((c) => L[0][c] * (1 - s) * (1 - t) + L[1][c] * s * (1 - t) + L[2][c] * s * t + L[3][c] * (1 - s) * t);
        const tx = Math.floor(u0 * 4 + 1e-4) / 4, ty = Math.floor(v0 * 4 + 1e-4) / 4;
        [[bu0, bv0], [bu1, bv0], [bu1, bv1], [bu0, bv1]].forEach(([s, t], k) => {
          P.setXYZ(i + k, ...at(p, s, t));
          const m = at(nn, s, t), l = Math.hypot(...m) || 1; N.setXYZ(i + k, m[0] / l, m[1] / l, m[2] / l);
          U.setXY(i + k, tx + s * 0.245 + 0.0025, ty + t * 0.245 + 0.0025);
        });
        before += 1; after += (bu1 - bu0) * (bv1 - bv0);
      }
      cardArea.push(after / Math.max(1, before));
      return g;
    };
    const cardArea = [];
    const meshOf = (g0, mat) => {
      if (meshId.has(g0.uuid)) return meshId.get(g0.uuid);
      let g = weld(g0);
      if (mat && mat.userData.leaf && mat.map) g = trimCards(g.clone(), mat.map);
      const a = g.attributes, e = { v: a.position.count };
      const f32 = (attr) => { const o = new Float32Array(attr.count * attr.itemSize); for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) o[i * attr.itemSize + k] = attr.getComponent(i, k); return put(o); };
      e.pos = f32(a.position); e.nrm = f32(a.normal);
      // uv with v down, as Godot reads images (three's canvas textures are flipped: v up)
      if (a.uv) { const o = new Float32Array(a.uv.count * 2); for (let i = 0; i < a.uv.count; i++) { o[i * 2] = a.uv.getX(i); o[i * 2 + 1] = 1 - a.uv.getY(i); } e.uv = put(o); }
      // colour as rgba and flutter as (flutter, 0), so they load straight
      // into Godot's colour and uv2 arrays
      if (a.color) { const o = new Float32Array(a.color.count * 4); for (let i = 0; i < a.color.count; i++) o.set([a.color.getX(i), a.color.getY(i), a.color.getZ(i), 1], i * 4); e.col = put(o); }
      if (a.flutter) { const o = new Float32Array(a.flutter.count * 2); for (let i = 0; i < a.flutter.count; i++) o[i * 2] = a.flutter.getX(i); e.flt = put(o); }
      if (g.index) e.idx = put(new Uint32Array(g.index.array));
      g.computeBoundingBox();
      e.box = [...g.boundingBox.min.toArray(), ...g.boundingBox.max.toArray()].map((x) => +x.toFixed(3));
      meshes.push(e); meshId.set(g0.uuid, meshes.length - 1);
      return meshes.length - 1;
    };
    // billboards: every one in a single atlas (one draw for all far plants
    // of a chunk), its place in imps[i].rect (pixels: x, y, w, h)
    const imps = [], impId = new Map(), impPx = [];
    const impOf = (imp) => {
      if (!imp) return null;
      if (impId.has(imp)) return impId.get(imp);
      const t = imp.rt.texture;
      impPx.push(t.image);
      imps.push({ w: +imp.width.toFixed(4), h: +imp.height.toFixed(4), bottom: +imp.bottom.toFixed(4), views: imp.views, rows: 4, sunAz: imp.sunAz });
      impId.set(imp, imps.length - 1);
      return imps.length - 1;
    };
    const impAtlas = () => {
      const AW = 4096, G = 8, rects = [];
      let x = 0, y = 0, rowH = 0;
      const order = impPx.map((_, i) => i).sort((a, b) => impPx[b].height - impPx[a].height);
      for (const i of order) {
        const im = impPx[i];
        if (x + im.width > AW) { x = 0; y += rowH + G; rowH = 0; }
        rects[i] = [x, y, im.width, im.height]; x += im.width + G; rowH = Math.max(rowH, im.height);
      }
      const AH = y + rowH;
      const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(AW, AH);
      impPx.forEach((im, i) => {
        const [x0, y0, W, H] = rects[i];
        // GL rows are bottom-up: the atlas is top row first
        for (let r = 0; r < H; r++) img.data.set(im.data.subarray((H - 1 - r) * W * 4, (H - r) * W * 4), ((y0 + r) * AW + x0) * 4);
        imps[i].rect = rects[i];
      });
      ctx.putImageData(img, 0, 0);
      pngs['veg_bill.png'] = canvasPng(cv);
      return [AW, AH];
    };
    const sets = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const mat34 = (m, out) => { const e = m.elements; out.push(e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]); };
    // the forest, bushes, ferns, flowers and rocks (veg.js scatters)
    for (const S of window.__scatters || []) {
      const xf = [], ip = [];
      for (const pt of S.points) {
        q.setFromAxisAngle(up, pt.rot);
        mat34(m4.compose(v.set(pt.x, pt.y, pt.z), q, sc.set(pt.s, pt.s * (pt.sy || 1), pt.s)), xf);
        ip.push(pt.x, pt.y, pt.z, pt.rot, pt.s);
      }
      sets.push({ src: 'veg', parts: S.model.parts.map((pp) => ({ mesh: meshOf(pp.geometry, pp.material), mat: matOf(pp.material) })), radius: S.model.radius, height: S.model.height,
        ...S.opts, impostor: impOf(S.impostor), xf: put(new Float32Array(xf)), ip: put(new Float32Array(ip)), n: S.points.length });
    }
    // the town's own repeated plants (hedges along the stairs, the hill's
    // bushes, stream-bank rocks): grouped by model, billboards baked here
    let sun = null, hemi = null;
    w.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) sun = o; if (o.isHemisphereLight) hemi = o; });
    const lights = { sun, hemi, sunDir: new THREE.Vector3(-0.55, 0.75, 0.45).normalize(), environment: w.scene.environment, environmentIntensity: w.scene.environmentIntensity };
    const byGeoKey = new Map();
    for (const o of townPlants) {
      // a model's parts are separate InstancedMeshes sharing one matrix buffer
      const key = o.instanceMatrix.uuid || o.instanceMatrix.array;
      if (!byGeoKey.has(key)) byGeoKey.set(key, []);
      byGeoKey.get(key).push(o);
    }
    for (const list of byGeoKey.values()) {
      const o = list[0], xf = [], ip = [], im = new THREE.Matrix4(), wm = new THREE.Matrix4(), p = new THREE.Vector3(), qq = new THREE.Quaternion(), s3 = new THREE.Vector3();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, im); wm.multiplyMatrices(o.matrixWorld, im); mat34(wm, xf);
        wm.decompose(p, qq, s3);
        const e = new THREE.Euler().setFromQuaternion(qq, 'YXZ');
        ip.push(p.x, p.y, p.z, e.y, s3.x);
      }
      const model = { parts: list.map((m) => ({ geometry: m.geometry, material: m.material })) };
      let r = 0, h = 0;
      for (const pp of model.parts) { pp.geometry.computeBoundingBox(); const b = pp.geometry.boundingBox; r = Math.max(r, -b.min.x, b.max.x, -b.min.z, b.max.z); h = Math.max(h, b.max.y); }
      const leafy = list.some((m) => m.material.userData.leaf);
      const imp = leafy ? new A.Impostor(w.renderer, model, { size: 56, lights }) : null;
      sets.push({ src: 'town', parts: model.parts.map((pp) => ({ mesh: meshOf(pp.geometry, pp.material), mat: matOf(pp.material) })), radius: r, height: h,
        fade: o.userData.fade || (leafy ? [90, 95] : [140, 146]), shrink: leafy ? 1 : 0.6, wind: 0, shadows: o.castShadow, far: [500, 600], impostor: impOf(imp),
        xf: put(new Float32Array(xf)), ip: put(new Float32Array(ip)), n: o.count });
    }
    // one binary: every buffer at its byte offset
    const all = new Uint8Array(byteLen);
    let off = 0;
    for (const b of bufs) { all.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), off); off += b.byteLength; }
    out.veg = b64(all);
    const billSize = impAtlas();
    out.vegJson = { meshes, mats, sets, impostors: imps, billSize, uvDown: true };
    out.cardArea = cardArea.length ? cardArea.reduce((a, b) => a + b, 0) / cardArea.length : 1;
    out.vegPngs = pngs;
  }

  // ---------- distant mountains (as main.js shaped them) ----------
  {
    const mts = w.scene.getObjectByName('mountains'), f = [];
    const layers = [];
    mts.traverse((o) => {
      if (!o.isMesh) return;
      const a = o.geometry.attributes, idx = o.geometry.index.array;
      layers.push({ v: a.position.count, i: idx.length, far: o.material.uniforms.far.value });
      for (let i = 0; i < a.position.count; i++) f.push(a.position.getX(i), a.position.getY(i), a.position.getZ(i), a.normal.getX(i), a.normal.getY(i), a.normal.getZ(i), a.h.getX(i), a.ang.getX(i));
      for (const k of idx) f.push(k);
    });
    out.mountains = b64(new Uint8Array(new Float32Array(f).buffer));
    out.mountainsJson = layers;
  }

  // ---------- clouds: one atlas, a quad per sprite ----------
  {
    const cl = w.scene.getObjectByName('clouds');
    const srcs = [], srcId = new Map(), sprites = [];
    for (const s of cl.children) {
      const t = s.material.map, key = t.source.uuid;
      if (!srcId.has(key)) { srcId.set(key, srcs.length); srcs.push(t.source.data); }
      sprites.push({ t: srcId.get(key), mirror: t.repeat.x < 0, p: s.position.toArray().map((x) => +x.toFixed(2)), w: +s.scale.x.toFixed(2), h: +s.scale.y.toFixed(2),
        cy: s.center.y, o: s.material.opacity });
    }
    // shelf-pack the pictures into one atlas (2 px gaps)
    const AW = 2048, rects = [];
    let x = 0, y = 0, rowH = 0;
    const order = srcs.map((d, i) => i).sort((a, b) => srcs[b].height - srcs[a].height);
    for (const i of order) {
      const d = srcs[i];
      if (x + d.width > AW) { x = 0; y += rowH + 2; rowH = 0; }
      rects[i] = [x, y, d.width, d.height]; x += d.width + 2; rowH = Math.max(rowH, d.height);
    }
    const AH = y + rowH;
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(AW, AH);
    srcs.forEach((d, i) => {
      const [x0, y0, W, H] = rects[i];
      // DataTexture rows are bottom-up; the atlas is top-down (rgb kept under alpha 0)
      for (let r = 0; r < H; r++) img.data.set(d.data.subarray((H - 1 - r) * W * 4, (H - r) * W * 4), ((y0 + r) * AW + x0) * 4);
    });
    // putImageData premultiplies nothing, but toDataURL may drop rgb under
    // alpha 0; the rgb of clear pixels is only used by filtering at the rim
    ctx.putImageData(img, 0, 0);
    out.clouds = canvasPngOf(cv);
    out.cloudsJson = { size: [AW, AH], rects, sprites, spin: 0.003 };
  }

  // water
  const water = w.scene.children.find((o) => o.isGroup && o.children.some((c) => c.material && c.material.uniforms && c.material.uniforms.uTime && c.renderOrder === 1));
  const wg = new THREE.Group();
  if (water) {
    water.updateMatrixWorld(true);
    let i = 0;
    for (const c of water.children) {
      if (!c.isMesh) continue;
      const m = new THREE.Mesh(c.geometry, new THREE.MeshBasicMaterial());
      m.name = (c.material.uniforms.uFlow ? 'fresh' + c.material.uniforms.uFlow.value + '_' : 'sea_') + i++;
      c.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      wg.add(m);
    }
  }
  out.water = b64(await glb(wg));

  // path map + textures
  const PM = T.pathMap();
  // raw RGBA bytes: a PNG would be recompressed by Godot's importer and lose the distances
  out.pathmap = b64(new Uint8Array(PM.data.buffer, PM.data.byteOffset, PM.nx * PM.nz * 4));
  const gt = P.grassTexture();
  out.grass = (gt.image.toDataURL ? gt.image : (() => { const c = document.createElement('canvas'); c.width = gt.image.width; c.height = gt.image.height; c.getContext('2d').drawImage(gt.image, 0, 0); return c; })()).toDataURL('image/png').split(',')[1];

  // walk grid: height + flags (1 water, 2 no-walk (the lab hill, cliffs, the
  // world's edges), 4 deck/walkway, 8 sea (not fresh water), 16 beach sand,
  // 32 a Route 1 ledge: entered only going south, never climbed)
  const G = { x0: T.WALK.x0 - 4, z0: T.WALK.z0 - 4, w: T.WALK.x1 - T.WALK.x0 + 8, d: T.WALK.z1 - T.WALK.z0 + 8, res: 0.25 };
  const nx = Math.round(G.w / G.res), nz = Math.round(G.d / G.res);
  const hb = new Uint16Array(nx * nz), fb = new Uint8Array(nx * nz);
  const walk = w.town.walk;
  const onDeck = (d, x, z) => {
    if (d.x0 !== undefined) return x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1;
    const dx = x - d.x, dz = z - d.z, c = Math.cos(d.rot || 0), s = Math.sin(d.rot || 0);
    return Math.abs(dx * c - dz * s) < d.hw && Math.abs(dx * s + dz * c) < d.hd;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = G.x0 + (i + 0.5) * G.res, z = G.z0 + (j + 0.5) * G.res;
    const h0 = T.height(x, z);
    let y = h0, f = 0;
    for (const d of walk) if (onDeck(d, x, z)) { if (d.y > y) y = d.y; f |= 4; }
    const wl = T.waterLevel(x, z);
    if (h0 < wl - 0.05) { f |= 1; if (wl === T.SEA_Y && Math.hypot(x - T.POND.x, z - T.POND.z) > T.POND.r + 3 && T.streamAt(x, z).d > 4) f |= 8; }
    if (T.noWalk(x, z)) f |= 2;
    if (h0 - T.SEA_Y < 2.6 && T.shoreSD(x, z) < 16 && T.cliffiness(x, z) < 0.6) f |= 16;
    if (z < -90 && z > -380 && T.ledgeAt(x, z, 0.5)) f |= 32;
    hb[j * nx + i] = Math.max(0, Math.min(65535, Math.round(y * 100 + 2000)));
    fb[j * nx + i] = f;
  }
  const gbuf = new Uint8Array(hb.byteLength + fb.byteLength);
  gbuf.set(new Uint8Array(hb.buffer), 0); gbuf.set(fb, hb.byteLength);
  out.ground = b64(gbuf);
  out.groundGrid = { ...G, nx, nz };

  // seabed: terrain height every metre over the terrain's 420 m square
  const S = { x0: T.SEA_BOX.x0, z0: T.SEA_BOX.z0, n: T.SEA_BOX.n };
  const sb = new Float32Array(S.n * S.n);
  // (far inland or far out at sea the plain land shape is enough)
  for (let j = 0; j < S.n; j++) for (let i = 0; i < S.n; i++) {
    const x = S.x0 + i + 0.5, z = S.z0 + j + 0.5, sd = T.shoreSD(x, z);
    sb[j * S.n + i] = sd > 40 || sd < -40 ? T.baseHeight(x, z) : T.height(x, z);
  }
  out.seabed = b64(new Uint8Array(sb.buffer));
  out.seabedGrid = S;

  // grass field: height + density (same rules as the web grass)
  const GA = { x0: T.WALK.x0, z0: T.WALK.z0, w: T.WALK.x1 - T.WALK.x0, d: T.WALK.z1 - T.WALK.z0, res: 1 };
  const gm = T.grassMap(GA.x0, GA.z0, GA.w, GA.d, GA.res).image;
  const gp = new Float32Array(gm.width * gm.height * 2);
  for (let k = 0; k < gm.width * gm.height; k++) { gp[k * 2] = gm.data[k * 4]; gp[k * 2 + 1] = gm.data[k * 4 + 1]; }
  out.grassmap = b64(new Uint8Array(gp.buffer));
  out.grassGrid = { ...GA, nx: gm.width, nz: gm.height };

  out.meta = {
    sea: T.SEA_Y, pathmap: { x0: PM.x0, z0: PM.z0, w: PM.w, d: PM.d, nx: PM.nx, nz: PM.nz },
    spawn: [w.me.pos.x, w.me.pos.y, w.me.pos.z], yaw: w.me.yaw,
    colliders: w.town.colliders.map((c) => c.box ? [1, +c.x.toFixed(3), +c.z.toFixed(3), +c.hw.toFixed(3), +c.hd.toFixed(3), +(c.rot || 0).toFixed(4)] : [0, +c.x.toFixed(3), +c.z.toFixed(3), +c.r.toFixed(3)]),
  };
  return out;
});

const save = (f, b64) => { fs.writeFileSync(path.join(OUT, f), Buffer.from(b64, 'base64')); console.log(f, (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(2), 'MB'); };
save('terrain.glb', res.terrain);
save('town.glb', res.town);
save('water.glb', res.water);
save('pathmap.rgba', res.pathmap);
save('grass.png', res.grass);
save('ground.bin', res.ground);
save('seabed.bin', res.seabed);
save('grassmap.bin', res.grassmap);
save('town_inst.bin', res.townInst);
save('veg.bin', res.veg);
// pictures no longer made are removed (their .import files kept otherwise, so uids stay)
for (const f of fs.readdirSync(OUT)) { const m = /^(veg_.*\.png)(\.import)?$/.exec(f); if (m && !(m[1] in res.vegPngs)) fs.rmSync(path.join(OUT, f)); }
for (const [f, d] of Object.entries(res.vegPngs)) save(f, d);
fs.writeFileSync(path.join(OUT, 'veg.json'), JSON.stringify(res.vegJson));
save('mountains.bin', res.mountains);
save('clouds.png', res.clouds);
// the plant and cloud pictures are imported VRAM compressed (ASTC on the
// phone): as plain images the billboards alone took 130 MB of GPU memory
for (const f of [...Object.keys(res.vegPngs), 'clouds.png']) {
  const imp = path.join(OUT, f + '.import');
  if (!fs.existsSync(imp)) fs.writeFileSync(imp, '[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n\n[params]\n\ncompress/mode=2\nmipmaps/generate=true\nprocess/fix_alpha_border=true\ndetect_3d/compress_to=0\n');
}
fs.writeFileSync(path.join(OUT, 'clouds.json'), JSON.stringify(res.cloudsJson));
fs.copyFileSync(path.join(ROOT, 'web/world/tex/dirt_pack.webp'), path.join(OUT, 'dirt.webp'));
// the stone paint, word for word from the web (stone.js STONE_GLSL)
{
  const src = fs.readFileSync(path.join(ROOT, 'web/world/stone.js'), 'utf8'), m = src.match(/export const STONE_GLSL = `([\s\S]*?)`;/);
  fs.writeFileSync(path.join(ROOT, 'native/shaders/stone.gdshaderinc'), '// Made by tools/native/bake.mjs from web/world/stone.js STONE_GLSL: edit it there.\n' + m[1].trimStart());
}
const meta = { ...res.meta, ground: res.groundGrid, seabed: res.seabedGrid, grassmap: res.grassGrid, inst: res.inst, mountains: res.mountainsJson };
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(meta));
console.log('town meshes', res.townMeshes, 'instanced', res.inst.length, 'colliders', meta.colliders.length, 'veg sets', res.vegJson.sets.length, 'models', res.vegJson.meshes.length, 'billboards', res.vegJson.impostors.length, 'leaf card area kept', res.cardArea.toFixed(2));
await b.close();
