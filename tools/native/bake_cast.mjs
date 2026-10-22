// Bakes the web build's characters and gameplay data for the native (Godot) game.
// Each person is made by the web build (actor.js: Ash's model from
// web/world/local/ash.glb with ashcloth.js; the villagers from cast.js) in a
// headless browser and saved finished, in the rest pose, to native/cast/:
//   <look>.glb    the skinned model (one skeleton, cloth bones included) with
//                 its idle / walk / run clips (anims/ash.json, scaled to its legs)
//   cast.json     per look: material cel bands, decals, double sided, eye atlas,
//                 clip metadata (stride, lead); the villagers (spawn, lines,
//                 wander), the things to read (town.use), Oak's lab door,
//                 Route 1's road and the tall grass
// Run: node tools/native/bake_cast.mjs   (serves web/ on :8790 if nothing is there)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/cast');
fs.mkdirSync(OUT, { recursive: true });

const up = async () => { try { return (await fetch('http://localhost:8790/world/')).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', '8790'], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text().slice(0, 200)); });
await p.goto('http://localhost:8790/world/?test&q=high&outline=0');
await p.waitForFunction(() => window.worldReady, null, { timeout: 300000 });
console.log('world ready');

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const A = await import('/world/actor.js');
  const CA = await import('/world/cast.js');
  const T = await import('/world/terrain.js');
  const N = await import('/world/nature.js');
  const w = window.world;
  const ex = new GLTFExporter();
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ash = await (await fetch('/world/anims/ash.json')).json();
  const ashClips = Object.fromEntries(ash.clips.map((c) => [c.name, THREE.AnimationClip.parse(c)]));
  const STD = new Set(['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight']);
  const out = { looks: {}, glb: {} };
  for (const look of ['ash', 'girl', 'fisher', 'kid', 'oak']) {
    const a = A.makeActor(A.LOOKS[look]);
    for (let i = 0; i < 600 && !a.model; i++) await sleep(50);
    if (!a.model) throw new Error('no model for ' + look);
    const holder = a.model;
    const anims = look === 'ash' ? { clips: ashClips, meta: ash.meta } : (await CA.castReady(null, look)).anims;
    // plain materials: colour + texture; the cel profile and flags go to cast.json
    const mats = [], seen = new Map();
    holder.traverse((o) => {
      if (!o.isMesh) return;
      for (const k of Object.keys(o.geometry.attributes)) if (!STD.has(k)) { o.geometry = o.geometry.clone(); break; }
      for (const k of Object.keys(o.geometry.attributes)) if (!STD.has(k)) o.geometry.deleteAttribute(k);
      const m = o.material;
      if (!seen.has(m)) {
        const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
        const ci = key.lastIndexOf('cel{');
        let cel = null; try { cel = ci >= 0 ? JSON.parse(key.slice(ci + 3)) : null; } catch { cel = null; }
        const i = mats.length;
        const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors, side: m.side, alphaTest: m.alphaTest || 0, roughness: 1, metalness: 0 });
        if (n.map) { n.map = n.map.clone(); n.map.offset.set(0, 0); n.map.repeat.set(1, 1); }
        n.name = 'c' + i;
        mats.push({ src: m.name || '', cel, ds: m.side === THREE.DoubleSide, alpha: m.alphaTest || 0, decal: !!m.polygonOffset, vc: !!m.vertexColors, eyes: m.name === 'face_on_0', shadow: o.castShadow, ink: o.userData.outline !== false });
        seen.set(m, n);
      }
      o.material = seen.get(m);
    });
    const glb = await new Promise((ok, bad) => ex.parse(holder, (r) => ok(new Uint8Array(r)), bad, { binary: true, animations: Object.values(anims.clips), onlyVisible: false }));
    out.glb[look] = b64(glb);
    out.looks[look] = { mats, meta: anims.meta, scale: holder.scale.x, y0: holder.position.y };
  }
  // villagers as main.js places them
  const LOOK_OF = { Girl: 'girl', Fisher: 'fisher', Kid: 'kid', 'Prof. Oak': 'oak' };
  out.npcs = w.npcs.map((n) => ({ look: LOOK_OF[n.name], name: n.name, x: n.home.x, z: n.home.z, yaw: n.yaw, wander: n.wander, lines: n.lines }));
  out.use = w.town.use.map((u) => ({ x: +u.x.toFixed(3), z: +u.z.toFixed(3), r: u.r, label: u.label, lines: u.lines }));
  out.labDoor = w.town.labDoor;
  out.road = T.ROADS[0].map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]);
  out.tallGrass = N.TALL_GRASS;
  return out;
});

for (const [k, v] of Object.entries(res.glb)) {
  fs.writeFileSync(path.join(OUT, k + '.glb'), Buffer.from(v, 'base64'));
  console.log(k + '.glb', (fs.statSync(path.join(OUT, k + '.glb')).size / 1048576).toFixed(2), 'MB');
}
delete res.glb;
fs.writeFileSync(path.join(OUT, 'cast.json'), JSON.stringify(res));
console.log('npcs', res.npcs.length, 'use', res.use.length);
await b.close();
