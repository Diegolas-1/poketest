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
// Run: node tools/native/bake.mjs   (serves web/ on :8790 if nothing is there)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/world');
fs.mkdirSync(OUT, { recursive: true });

const up = async () => { try { return (await fetch('http://localhost:8790/world/')).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', '8790'], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
await p.goto('http://localhost:8790/world/?test&q=high&outline=0');
await p.waitForFunction(() => window.worldReady, null, { timeout: 300000 });
console.log('world ready');

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const T = await import('/world/terrain.js');
  const P = await import('/world/paths.js');
  const w = window.world;
  const ex = new GLTFExporter();
  const glb = (obj) => new Promise((ok, bad) => ex.parse(obj, (r) => ok(new Uint8Array(r)), bad, { binary: true, onlyVisible: true }));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  // a flat copy of every visible mesh under root, in world space
  const flat = (root, keep = () => true) => {
    root.updateMatrixWorld(true);
    const G = new THREE.Group();
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.userData.inkLines || !shown(o) || !keep(o)) return;
      if (o.isInstancedMesh) {
        // repeated parts (pickets, posts): every copy merged into one mesh
        const geos = [], im = new THREE.Matrix4();
        const base = o.geometry.clone();
        for (const k of Object.keys(base.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) base.deleteAttribute(k);
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, im); geos.push(base.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, im))); }
        const g = geos.length ? mergeGeometries(geos, false) : null;
        if (g) { const m = new THREE.Mesh(g, o.material); m.name = o.name || 'inst'; G.add(m); }
        return;
      }
      const m = new THREE.Mesh(o.geometry, o.material);
      m.name = o.name || '';
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      G.add(m);
    });
    return G;
  };
  const out = {};

  // terrain
  const terr = w.scene.children.find((o) => o.name === 'terrain');
  const tg = new THREE.Group();
  const tm = new THREE.Mesh(terr.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  tm.name = 'terrain'; tg.add(tm);
  out.terrain = b64(await glb(tg));

  // town (static, merged), with plain materials: colour, texture, flags
  const tmat = new Map();
  const plain = (m) => {
    if (tmat.has(m)) return tmat.get(m);
    const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors,
      side: m.side, transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, roughness: 1, metalness: 0 });
    n.name = (m.name || 'm') + (m.polygonOffset ? '_decal' : '') + (m.vertexColors ? '_vc' : '');
    tmat.set(m, n); return n;
  };
  const town = flat(w.town.group);
  town.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(plain) : plain(o.material); });
  out.town = b64(await glb(town));
  out.townMeshes = town.children.length;

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

  // walk grid: height + flags (1 water, 2 no-walk hill, 4 deck/walkway)
  const G = { x0: -150, z0: -205, w: 300, d: 320, res: 0.25 };
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
    let y = T.height(x, z), f = 0;
    for (const d of walk) if (onDeck(d, x, z)) { if (d.y > y) y = d.y; f |= 4; }
    if (T.isWater(x, z)) f |= 1;
    if (T.noWalk(x, z)) f |= 2;
    hb[j * nx + i] = Math.max(0, Math.min(65535, Math.round(y * 100 + 2000)));
    fb[j * nx + i] = f;
  }
  const gbuf = new Uint8Array(hb.byteLength + fb.byteLength);
  gbuf.set(new Uint8Array(hb.buffer), 0); gbuf.set(fb, hb.byteLength);
  out.ground = b64(gbuf);
  out.groundGrid = { ...G, nx, nz };

  // seabed: terrain height every metre over the terrain's 420 m square
  const S = { x0: -210, z0: -210, n: 420 };
  const sb = new Float32Array(S.n * S.n);
  for (let j = 0; j < S.n; j++) for (let i = 0; i < S.n; i++) sb[j * S.n + i] = T.height(S.x0 + i + 0.5, S.z0 + j + 0.5);
  out.seabed = b64(new Uint8Array(sb.buffer));
  out.seabedGrid = S;

  // grass field: height + density (same rules as the web grass)
  const GA = { x0: -150, z0: -200, w: 300, d: 290, res: 1 };
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
fs.copyFileSync(path.join(ROOT, 'web/world/tex/dirt_pack.webp'), path.join(OUT, 'dirt.webp'));
const meta = { ...res.meta, ground: res.groundGrid, seabed: res.seabedGrid, grassmap: res.grassGrid };
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(meta));
console.log('town meshes', res.townMeshes, 'colliders', meta.colliders.length);
await b.close();
