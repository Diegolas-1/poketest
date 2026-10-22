// Pallet Town in 3D: a modern seaside eco-village to walk around freely.
import * as THREE from 'three';
import { buildTerrain, buildWater, grassMap, height, isWater, SEA_Y, noWalk, HOUSES, toWorld, ROADS, coastZ, labHillU } from './terrain.js';
import { buildSky, buildClouds, buildMountains, TALL_GRASS } from './nature.js';
import { buildTown, BEDS, PIER } from './town.js';
import { celify } from './toon.js';
import { foliageTime } from './foliage.js';
import { buildPaths, buildFields, grassTexture, pathGround } from './paths.js';
import { buildVegetation } from './veg.js';
import { grassField, wind, surface } from './assets.js';
import { makeActor, LOOKS } from './actor.js';
import { Input } from './input.js';
import { Dialog } from './dialog.js';
import { createOutline, setInkFocus, INK_LAYER } from './outline.js';
import { createSettings, loadSettings } from './settings.js';
import { createPerfLog } from './perflog.js';
import { createSpaces } from './spaces.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('loadText').textContent = t; };

// ---------- quality ----------
const q = new URLSearchParams(location.search);
// iPhones and iPads get their own profile: their GPUs handle far more than a
// Chromebook, and their screens are 3x, so 'low' (1x pixels) looked blurry
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const auto = iOS ? 'phone' : (navigator.hardwareConcurrency || 4) <= 4 || /CrOS|Android/.test(navigator.userAgent) ? 'low' : 'high';
// presets; the settings window (cog button, settings.js) can change each
// value on this device: ?q=<preset> picks a preset and ignores saved changes
const PRESETS = {
  low: { dpr: 1, aa: 1, shadow: 1024, grass: 60000, grassSize: 40, trees: 0.6, plants: 0.5, lod: 0.7, outline: 1, fog: 1, exposure: 1, shadowRate: 1, shadowSoft: 0, autoRes: 1, fpsCap: 60 },
  medium: { dpr: 1.25, aa: 1, shadow: 2048, grass: 110000, grassSize: 50, trees: 0.85, plants: 0.8, lod: 0.85, outline: 1.5, fog: 1, exposure: 1, shadowRate: 1, shadowSoft: 1, autoRes: 1, fpsCap: 60 },
  high: { dpr: 1.5, aa: 1, shadow: 2048, grass: 180000, grassSize: 60, trees: 1, plants: 1, lod: 1, outline: 1.5, fog: 1, exposure: 1, shadowRate: 1, shadowSoft: 1, autoRes: 1, fpsCap: 60 },
  // sharp (2x pixels), long view distances (grass, plants, full trees) and
  // the ink G-buffer at native size
  phone: { dpr: 2, aa: 1, shadow: 2048, grass: 150000, grassSize: 64, trees: 1, plants: 1, lod: 1.35, outline: 1, fog: 1, exposure: 1, shadowRate: 1, shadowSoft: 1, autoRes: 1, fpsCap: 60 },
};
const SAVED = loadSettings();
const level = q.get('q') in PRESETS ? q.get('q') : SAVED.preset in PRESETS ? SAVED.preset : auto;
const QUALITY = { ...PRESETS[level], ...(q.has('q') ? {} : SAVED.o || {}) };
// ink lines (outline.js): G-buffer resolution scale (1.5 = supersampled), 0 = off. ?outline=0..2
// overrides; on a very weak device the frame loop drops to half, then off.
if (q.has('outline')) QUALITY.outline = Math.max(0, Math.min(2, +q.get('outline') || 0));

// ---------- renderer and scene ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: !!QUALITY.aa, powerPreference: 'high-performance' });
// the drawing resolution: the Resolution setting times the auto-resolution
// scale (lowered while the GPU cannot keep up, e.g. a hot phone)
const autoRes = { scale: 1, acc: 0, n: 0, cpu: 0, last: 0, good: 0, hold: 0, need: 4, upAt: 0 };
const pixelRatio = () => Math.max(0.75, Math.min(devicePixelRatio, QUALITY.dpr) * (QUALITY.autoRes ? autoRes.scale : 1));
renderer.setPixelRatio(pixelRatio());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = QUALITY.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = QUALITY.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
// the shadow map is redrawn by draw(): every frame, or every 2nd / 3rd (settings)
renderer.shadowMap.autoUpdate = false;
let shadowTick = 0;
const outline = createOutline(renderer, { scale: QUALITY.outline || 1 });
outline.enabled = QUALITY.outline > 0;
if (!outline.enabled) outline.lines.visible = false;   // ?outline=0: no ink at all
// O key or the settings window: ink on / off (remembered on this device)
let inkOn = outline.enabled && localStorage.getItem('pallet-ink') !== 'off';
function setInk(on) {
  inkOn = on; outline.enabled = on && QUALITY.outline > 0; outline.lines.visible = outline.enabled;
  localStorage.setItem('pallet-ink', on ? 'on' : 'off');
}
setInk(inkOn);
addEventListener('keydown', (e) => { if (e.code === 'KeyO' && !e.repeat) { setInk(!inkOn); gfx?.redraw(); } });
const scene = new THREE.Scene();
const FOG = new THREE.Color('#c4e2f0');
scene.fog = new THREE.Fog(FOG, 90 * QUALITY.fog, 430 * QUALITY.fog);
const camera = new THREE.PerspectiveCamera(52, 1, 0.25, 2000);   // near 0.25 (was 0.1): 2.5x the depth precision far off

const sunDir = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();
const sky = buildSky(sunDir);
scene.add(sky);
// image-based light from the sky itself
{
  const envScene = new THREE.Scene(); envScene.add(buildSky(sunDir));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02, 1, 2000).texture;
  scene.environmentIntensity = 0.75;
}
const hemi = new THREE.HemisphereLight('#e2f1ff', '#6d7f4c', 0.55);
const sun = new THREE.DirectionalLight('#fff0d4', 2.9);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadow, QUALITY.shadow);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 });
scene.add(hemi, sun, sun.target);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const db = renderer.getDrawingBufferSize(new THREE.Vector2()); outline.setSize(db.x, db.y);
  const px = Math.min(devicePixelRatio, 2);
  $('ui').width = Math.round(w * px); $('ui').height = Math.round(h * px);
}
addEventListener('resize', resize); resize();
// iOS reports the new size a moment after turning the phone
addEventListener('orientationchange', () => { setTimeout(resize, 120); setTimeout(resize, 500); });
// the home bar's height, so the dialog box sits above it
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:var(--sb)';
document.body.appendChild(safeProbe);
let safeB = 10;
const readSafe = () => { safeB = parseFloat(getComputedStyle(safeProbe).paddingBottom) || 10; };
readSafe(); addEventListener('resize', readSafe);

// the FPS counter beside the cog: frames per second over the last half second,
// the slowest frame in that window, and the resolution being drawn
const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
fpsEl.style.cssText = 'position:fixed;top:var(--st,10px);left:calc(var(--sl,10px) + 178px);z-index:6;height:28px;padding:0 9px;border-radius:8px;background:rgba(20,30,40,.4);color:#fff;font:600 13px/28px ui-monospace,Menlo,monospace;pointer-events:none;white-space:nowrap';
document.body.appendChild(fpsEl);
const fps = { on: localStorage.getItem('pallet-fps') !== '0', n: 0, acc: 0, worst: 0, last: performance.now() };
const setFps = (on) => { fps.on = on; localStorage.setItem('pallet-fps', on ? '1' : '0'); fpsEl.style.display = on ? '' : 'none'; };
setFps(fps.on);
function fpsTick() {
  const now = performance.now(), d = now - fps.last; fps.last = now;
  if (!fps.on || d > 1000) return;
  fps.n++; fps.acc += d; fps.worst = Math.max(fps.worst, d);
  if (fps.acc >= 500) {
    const f = Math.round(fps.n * 1000 / fps.acc);
    fpsEl.style.color = f >= 55 ? '#9ef0a0' : f >= 30 ? '#ffd27a' : '#ff8a7a';
    fpsEl.textContent = `${f} fps · ${Math.round(fps.worst)} ms · ${renderer.getPixelRatio().toFixed(2).replace(/\.?0+$/, '')}x`;
    fps.n = 0; fps.acc = 0; fps.worst = 0;
  }
}
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && !e.target.closest?.('input,textarea')) { setFps(!fps.on); gfx?.redraw(); } });

let plog = null;   // performance log (perflog.js), made once the player and camera exist

// the graphics settings window (settings.js)
const pct = (v) => Math.round(v * 100) + '%';
const gfx = createSettings({
  presets: PRESETS, preset: level, values: QUALITY,
  ink: () => inkOn, onInk: setInk,
  toggles: [
    { label: 'FPS counter', hint: 'F key', get: () => fps.on, set: setFps },
    { label: 'Performance log', hint: 'records while you play (starts a new log)', get: () => plog?.on, set: (v) => plog.set(v) },
  ],
  actions: [
    { label: 'Share log', enabled: () => plog?.has(), run: () => plog.share() },
    { label: 'Copy log', enabled: () => plog?.has(), run: () => plog.copy() },
  ],
  rows: [
    { key: 'dpr', label: 'Resolution', values: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3], fmt: (v) => v + 'x', live: true },
    { key: 'autoRes', label: 'Auto resolution', values: [0, 1], fmt: (v) => (v ? 'On' : 'Off'), live: true },
    { key: 'fpsCap', label: 'Frame rate cap', values: [30, 60], fmt: (v) => v + ' fps', live: true },
    { key: 'aa', label: 'Anti-aliasing', values: [0, 1], fmt: (v) => (v ? 'On' : 'Off') },
    { key: 'outline', label: 'Outline quality', values: [0.5, 0.75, 1, 1.25, 1.5, 2], fmt: (v) => v + 'x', live: true },
    { key: 'shadow', label: 'Shadow detail', values: [512, 1024, 2048, 4096], live: true },
    { key: 'shadowRate', label: 'Shadow refresh', values: [1, 2, 3], fmt: (v) => (v === 1 ? 'every frame' : v === 2 ? 'every 2nd' : 'every 3rd'), live: true },
    { key: 'shadowSoft', label: 'Shadow edges', values: [0, 1], fmt: (v) => (v ? 'Soft' : 'Crisp') },
    { key: 'grass', label: 'Grass density', values: [20000, 40000, 60000, 90000, 120000, 150000, 180000, 220000, 260000], fmt: (v) => Math.round(v / 1000) + 'k' },
    { key: 'grassSize', label: 'Grass distance', values: [30, 40, 50, 64, 76, 90], fmt: (v) => Math.round(v / 2) + ' m' },
    { key: 'lod', label: 'View distance', values: [0.5, 0.7, 0.85, 1, 1.2, 1.35, 1.6, 2], fmt: pct },
    { key: 'trees', label: 'Trees', values: [0.3, 0.45, 0.6, 0.8, 1, 1.25, 1.5], fmt: pct },
    { key: 'plants', label: 'Bushes and flowers', values: [0.25, 0.5, 0.75, 1, 1.25, 1.5], fmt: pct },
    { key: 'fog', label: 'Haze distance', values: [0.6, 0.8, 1, 1.25, 1.5, 2], fmt: pct, live: true },
    { key: 'exposure', label: 'Brightness', values: [0.8, 0.9, 1, 1.1, 1.2, 1.3], fmt: pct, live: true },
  ],
  onLive(k, v) {
    QUALITY[k] = v;
    if (k === 'dpr' || k === 'autoRes') { if (k === 'autoRes' && !v) autoRes.scale = 1; renderer.setPixelRatio(pixelRatio()); resize(); }
    if (k === 'outline') { outline.scale = v; resize(); }
    if (k === 'shadow') { sun.shadow.mapSize.set(v, v); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } shadowTick = 0; }
    if (k === 'fog') { scene.fog.near = 90 * v; scene.fog.far = 430 * v; }
    if (k === 'exposure') renderer.toneMappingExposure = v;
  },
});

// ---------- the world ----------
status('Shaping the land');
const terrain = buildTerrain();
{
  // flat anime ground: bright in the sun, cool where shadows fall
  const pos = terrain.geometry.attributes.position, uv = terrain.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
  terrain.material = celify(pathGround(new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture() })), { detail: 0.5, mid: 0.4, bands: [0.08, 0.22, 0.5], soft: 0.04,
    deep: [0.5, 0.62, 0.8], shade: [0.66, 0.78, 0.9], lit: [1.06, 1.06, 0.98] });
}
scene.add(terrain);
const uTime = wind.uTime;
scene.add(outline.mark(buildWater(uTime, { color: '#cfe6f2', near: 140, far: 700 }), 'ground'));
buildPaths(scene);
buildFields(scene);
const clouds = buildClouds(); scene.add(clouds);
{
  // the distant ranges open up to the south so the sea runs to the horizon
  const mts = buildMountains(sunDir);
  mts.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z);   // 0 = due south
      const k = 1 - Math.min(1, Math.max(0, (Math.abs(a) - 0.9) / 0.5));
      if (k > 0) p.setY(i, p.getY(i) * (1 - k) + (-40) * k);
    }
    p.needsUpdate = true; o.geometry.computeVertexNormals();
  });
  scene.add(mts);
}
const town = buildTown();
scene.add(town.group);
const colliders = town.colliders;

// where plants may not grow: buildings, beds' walls, the dock
function blocked(x, z, r = 0) {
  for (const c of colliders) {
    if (c.box) {
      let dx = x - c.x, dz = z - c.z;
      if (c.rot) { const cs = Math.cos(c.rot), sn = Math.sin(c.rot); [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs]; }
      if (Math.abs(dx) < c.hw + r && Math.abs(dz) < c.hd + r) return true;
    }
    else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return true;
  }
  for (const [x0, z0, x1, z1] of BEDS) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
  return false;
}

// ---------- memory ----------
// Once every texture that uses a picture has been sent to the GPU, the
// picture itself (a canvas, a decoded image) is no longer needed: free it, so
// Safari keeps one copy of each texture instead of two.
const freed = new WeakSet();
function freePictures() {
  const users = new Map();
  const note = (t) => {
    if (!t || !t.isTexture || !t.source) return;
    const d = t.source.data;
    if (!d || freed.has(t.source) || !(d instanceof HTMLCanvasElement || d instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && d instanceof ImageBitmap))) return;
    if (!users.has(t.source)) users.set(t.source, new Set());
    users.get(t.source).add(t);
  };
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k in m) if (m[k] && m[k].isTexture) note(m[k]);
      if (m.uniforms) for (const k in m.uniforms) note(m.uniforms[k].value);
    }
  });
  for (const [src, texs] of users) {
    let ready = true;
    for (const t of texs) { const pr = renderer.properties.get(t); if (pr.__version !== t.version || !pr.__webglTexture) { ready = false; break; } }
    if (!ready) continue;
    const d = src.data, stub = { width: d.width, height: d.height };
    if (d instanceof HTMLCanvasElement) { d.width = 0; d.height = 0; }
    else if (typeof ImageBitmap !== 'undefined' && d instanceof ImageBitmap) d.close();
    src.data = stub; freed.add(src);
  }
}

// ---------- people ----------
// Skinned meshes upload their skeleton's bone matrices as a texture whenever
// the skeleton updates. Each clothing piece came with its own copy of the same
// skeleton, and three updates a skeleton once per render pass, so a crowd sent
// dozens of textures a frame (Safari on iPhone slows down badly under that).
// Pieces with the same bones and bind pose now share one skeleton, and a
// skeleton updates at most once per game frame.
let gameFrame = 0;
const frustum = new THREE.Frustum(), cullMat = new THREE.Matrix4(), cullSphere = new THREE.Sphere(new THREE.Vector3(), 4);
{
  const up = THREE.Skeleton.prototype.update;
  THREE.Skeleton.prototype.update = function () { if (this._gf === gameFrame) return; this._gf = gameFrame; up.call(this); };
}
function shareSkeletons(root) {
  const list = [];
  root.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  if (list.length === root.userData.skinN) return;
  root.userData.skinN = list.length;
  const kept = [];
  const same = (a, b) => {
    if (a === b) return true;
    if (a.bones.length !== b.bones.length) return false;
    for (let i = 0; i < a.bones.length; i++) {
      if (a.bones[i] !== b.bones[i]) return false;
      const x = a.boneInverses[i].elements, y = b.boneInverses[i].elements;
      for (let j = 0; j < 16; j++) if (Math.abs(x[j] - y[j]) > 1e-5) return false;
    }
    return true;
  };
  for (const m of list) {
    const k = kept.find((s) => same(s, m.skeleton));
    if (k) { if (m.skeleton !== k) m.skeleton = k; } else kept.push(m.skeleton);
  }
}
const player = makeActor(LOOKS.red);
scene.add(player.root);
// start on the path just outside Red's front door
const RED = HOUSES.find((h) => h.id === 'red');
const SPAWN = toWorld(RED, 1.75, 7.2);
const me = { pos: new THREE.Vector3(SPAWN[0], 0, SPAWN[1]), yaw: RED.rot, vy: 0, ground: true, speed: 0 };
const npcs = [];
function npc(look, x, z, lines, opts = {}) {
  const a = makeActor(look);
  scene.add(a.root);
  const n = { actor: a, home: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x, height(x, z), z), yaw: opts.yaw || 0,
    target: null, wait: 1 + Math.random() * 3, wander: opts.wander ?? 6, lines, speed: 0, name: opts.name };
  npcs.push(n);
  return n;
}
npc(LOOKS.girl, -8, 3, ['I\'m raising POKéMON too!', 'When they get strong, they can protect me!'], { name: 'Girl' });
npc(LOOKS.fisher, PIER.x + 1.2, PIER.z1 + 3.2, ['Technology is incredible!', 'You can now store and recall items and POKéMON as data via PC!'], { wander: 0, yaw: Math.PI, name: 'Fisher' });
npc(LOOKS.kid, 20, -12, ['Have you seen the windmill on PROF. OAK\'s lab?', 'It spins all day long. Grandpa says it powers the whole lab!'], { name: 'Kid' });
const oak = npc(LOOKS.oak, town.labDoor[0], town.labDoor[1], ['…'], { wander: 0, name: 'Prof. Oak' });
oak.actor.root.visible = false; oak.hidden = true;

// ---------- vegetation (async) ----------
let veg = null, grass = null;
// the grass lives in its own little scene, drawn in its own pass (see draw)
const grassScene = new THREE.Scene();
async function grow() {
  status('Loading plants');
  veg = await buildVegetation(scene, renderer, blocked, colliders, QUALITY, status);
  status('Growing grass');
  const area = { x0: -150, z0: -200, w: 300, d: 290 };
  const tex = grassMap(area.x0, area.z0, area.w, area.d, 1);
  grass = grassField(grassScene, { count: QUALITY.grass, size: QUALITY.grassSize, heightTex: tex, area, sunDir, heightAt: groundAt });
  for (const imp of veg.impostors) Object.assign(imp.material.uniforms, { fogColor: { value: FOG }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } });
  Object.assign(grass.uniforms, { fogColor: { value: FOG }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } });
  $('loading').classList.add('done');
  banner('Pallet Town', 'A quiet seaside village');
  setTimeout(() => $('hint').classList.add('fade'), 12000);
  window.worldReady = true;
}

// ---------- movement and collision ----------
// walk surfaces: axis boxes {x0, x1, z0, z1, y} or turned boxes {x, z, hw, hd, rot, y}
function onDeck(w, x, z) {
  if (w.x0 !== undefined) return x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1;
  const dx = x - w.x, dz = z - w.z, c = Math.cos(w.rot || 0), s = Math.sin(w.rot || 0);
  return Math.abs(dx * c - dz * s) < w.hw && Math.abs(dx * s + dz * c) < w.hd;
}
let space = null;   // the interior behind a door, when you are inside (spaces.js)
function groundAt(x, z) {
  if (space && space.active) return space.groundAt(x, z);
  let y = height(x, z);
  for (const w of town.walk) if (onDeck(w, x, z)) y = Math.max(y, w.y);
  return y;
}
function collide(p, r = 0.35) {
  for (const c of colliders) {
    if (Math.abs(p.x - c.x) > 12 || Math.abs(p.z - c.z) > 12) continue;
    if (c.box) {
      let dx = p.x - c.x, dz = p.z - c.z;
      const cs = c.rot ? Math.cos(c.rot) : 1, sn = c.rot ? Math.sin(c.rot) : 0;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const ox = c.hw + r - Math.abs(lx), oz = c.hd + r - Math.abs(lz);
      if (ox > 0 && oz > 0) {
        let mx = 0, mz = 0;
        if (ox < oz) mx = Math.sign(lx) * ox; else mz = Math.sign(lz) * oz;
        // back to world axes
        p.x += mx * cs + mz * sn; p.z += -mx * sn + mz * cs;
      }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); }
    }
  }
}
function onWalk(x, z) { return town.walk.some((w) => onDeck(w, x, z)); }
function step(obj, dx, dz) {
  if (space && space.active) return space.step(obj, dx, dz);
  const nx = obj.pos.x + dx, nz = obj.pos.z + dz;
  if (isWater(nx, nz) && !onWalk(nx, nz)) return false;
  if (nx < -150 || nx > 150 || nz < -205 || nz > 115) return false;
  // the lab hill is too steep and overgrown: only the stairs go up
  if (noWalk(nx, nz) && !noWalk(obj.pos.x, obj.pos.z)) return false;
  const ox = obj.pos.x, oz = obj.pos.z;
  obj.pos.x = nx; obj.pos.z = nz;
  collide(obj.pos);
  if (noWalk(obj.pos.x, obj.pos.z) && !noWalk(ox, oz)) { obj.pos.x = ox; obj.pos.z = oz; return false; }
  return true;
}

// ---------- camera ----------
// test only: ?cam=x,y,z,tx,ty,tz fixes the camera for overview shots
let TEST_CAM = q.has('test') && q.get('cam') ? q.get('cam').split(',').map(Number) : null;
const cam = { yaw: 0, pitch: 0.32, dist: 7.5, target: new THREE.Vector3(), pos: new THREE.Vector3() };
plog = createPerfLog({ renderer, scene, me, cam, outline, quality: QUALITY, preset: level });
const ray = new THREE.Raycaster();
function updateCamera(dt) {
  if (space && space.active) { space.camera(dt, cam, camera); return; }
  // the height follows slowly, so stairs (and small bumps) read as a smooth
  // ramp instead of a hop per step; a big drop or jump catches up faster
  if (cam.ty == null) cam.ty = me.pos.y;
  const dy = me.pos.y - cam.ty;
  cam.ty += dy * (1 - Math.exp(-dt * (Math.abs(dy) > 1.5 ? 8 : 3.5)));
  const t = new THREE.Vector3(me.pos.x, cam.ty + 1.45, me.pos.z);
  const kx = 1 - Math.exp(-dt * 10);
  cam.target.x += (t.x - cam.target.x) * kx; cam.target.z += (t.z - cam.target.z) * kx; cam.target.y = t.y;
  const cp = Math.cos(cam.pitch);
  const dir = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  let d = cam.dist;
  ray.set(cam.target, dir); ray.far = d;
  const hit = ray.intersectObjects(town.solid, true)[0];
  if (hit) d = Math.max(1.2, hit.distance - 0.3);
  const want = cam.target.clone().addScaledVector(dir, d);
  // keep above the ground under the camera, smoothed too (the stairs' steps)
  const floor = Math.max(groundAt(want.x, want.z) + 0.4, SEA_Y + 0.4);
  if (cam.floor == null) cam.floor = floor;
  cam.floor += (floor - cam.floor) * (1 - Math.exp(-dt * (floor > cam.floor ? 9 : 3)));
  want.y = Math.max(want.y, cam.floor);
  cam.pos.lerp(want, 1 - Math.exp(-dt * 14));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.target);
  if (TEST_CAM) { camera.position.set(TEST_CAM[0], TEST_CAM[1], TEST_CAM[2]); camera.lookAt(TEST_CAM[3], TEST_CAM[4], TEST_CAM[5]); }
  // keep the sun's shadows on the area round the player, snapped to texels
  const texel = 84 / QUALITY.shadow;
  const c = new THREE.Vector3(Math.round(me.pos.x / texel) * texel, 0, Math.round(me.pos.z / texel) * texel);
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(sunDir, 100);
}

// ---------- UI ----------
const input = new Input(view);
const dialog = new Dialog($('ui'));
let bannerTimer = 0;
function banner(title, sub) {
  $('bannerTitle').textContent = title; $('bannerSub').textContent = sub;
  $('banner').classList.remove('show'); void $('banner').offsetWidth; $('banner').classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => $('banner').classList.remove('show'), 4200);
}
let area = 'town';
let script = null;    // a running cutscene: { t, update(dt) }
let camIdle = 0, recenter = 0;   // camera: seconds since you last turned it; recentring time left
// Oak's lab door leads inside (the interior is built from its blueprint, maps/oak_lab.json)
space = createSpaces({ me, player, dialog, banner, makeOak: (look) => makeActor(LOOKS[look] || LOOKS.oak),
  onLeave() {
    scene.add(player.root);
    // outside the lab door, facing away from it; the camera out in front
    me.pos.set(town.labDoor[0], 0, town.labDoor[1]); me.pos.y = groundAt(me.pos.x, me.pos.z); me.yaw = -Math.PI / 2; me.speed = 0; me.vy = 0;
    cam.yaw = me.yaw + 0.55; cam.pitch = 0.32; cam.ty = null; cam.floor = null; cam.target.set(me.pos.x, me.pos.y + 1.45, me.pos.z); cam.pos.copy(cam.target);
    oak.hidden = true; oak.actor.root.visible = false;
    banner('Pallet Town', 'A quiet seaside village');
  } });

// the closest thing to talk to or read
function nearby() {
  if (space.active) return space.nearby(me);
  let best = null, bd = 1e9;
  const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
  for (const u of town.use) {
    const dx = u.x - me.pos.x, dz = u.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < u.r + 0.6 && d < bd) {
      best = { label: u.label, lines: u.lines, x: u.x, y: groundAt(u.x, u.z) + 1.9, z: u.z, door: u.label === 'Door' && Math.hypot(u.x - town.labDoor[0], u.z - town.labDoor[1]) < 1.5 }; bd = d;
    }
  }
  for (const n of npcs) {
    if (n.hidden) continue;
    const dx = n.pos.x - me.pos.x, dz = n.pos.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.2 && (dx * fx + dz * fz) / (d || 1) > 0.2 && d < bd) { best = { label: 'Talk', lines: n.lines, npc: n, x: n.pos.x, y: n.pos.y + 2.0, z: n.pos.z }; bd = d; }
  }
  return best;
}

// Oak stops you at the tall grass, like in the original.
let walkPath = null;
function oakScene() {
  oak.hidden = false; oak.actor.root.visible = true;
  oak.pos.set(me.pos.x + 1.5, 0, me.pos.z + 9); oak.pos.y = height(oak.pos.x, oak.pos.z);
  let phase = 0;
  script = {
    update(dt) {
      if (phase === 0) {
        const dx = me.pos.x - oak.pos.x, dz = me.pos.z + 1.6 - oak.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.15) { const v = Math.min(d, dt * 5.5); oak.pos.x += dx / d * v; oak.pos.z += dz / d * v; oak.yaw = Math.atan2(dx, dz); oak.speed = 5.5; }
        else {
          oak.speed = 0; phase = 1; me.yaw = Math.PI * 0 + Math.atan2(oak.pos.x - me.pos.x, oak.pos.z - me.pos.z);
          dialog.say(['OAK: Hey! Wait! Don\'t go out!', 'It\'s unsafe! Wild POKéMON live in tall grass!', 'You need your own POKéMON for your protection.', 'I know! Come see me at my lab, by the sea. Follow me!'], () => { phase = 2; });
        }
      } else if (phase === 2) {
        // both head back south along Route 1 toward town
        if (!walkPath) {
          const r = ROADS[0];
          let bi = 0, bd = 1e9;
          r.forEach(([x, z], i) => { const d = (x - me.pos.x) ** 2 + (z - me.pos.z) ** 2; if (d < bd) { bd = d; bi = i; } });
          walkPath = r.slice(bi + 1, bi + 16);
        }
        const tgt = walkPath[0];
        let moved = false;
        if (tgt) {
          for (const [o, off] of [[oak, -0.9], [me, 0.9]]) {
            const dx = tgt[0] + off - o.pos.x, dz = tgt[1] - o.pos.z, d = Math.hypot(dx, dz);
            if (d > 0.2) { const v = Math.min(d, dt * 4.5); o.pos.x += dx / d * v; o.pos.z += dz / d * v; o.yaw = Math.atan2(dx, dz); o.speed = 4.5; moved = true; }
          }
          if (Math.hypot(tgt[0] + 0.9 - me.pos.x, tgt[1] - me.pos.z) < 0.5 || !moved) walkPath.shift();
          oak.pos.y = height(oak.pos.x, oak.pos.z);
        }
        if (!walkPath.length) {
          phase = 3; me.speed = 0; oak.speed = 0;
          oak.hidden = true; oak.actor.root.visible = false;
          oak.pos.set(town.labDoor[0], 0, town.labDoor[1]); oak.pos.y = height(oak.pos.x, oak.pos.z); oak.yaw = -Math.PI / 2;
          oak.lines = ['OAK: There you are! Inside the lab is coming soon.', 'For now, explore the town. Pallet has changed a lot!'];
          oak.hidden = false; oak.actor.root.visible = true;
          script = null; walkPath = null;
          banner('Prof. Oak\'s Lab', 'Up the stairs on the hill by the sea');
        }
      }
    },
  };
}

// ---------- drawing ----------
// The picture, then the ink lines over it (outline.js), then the grass on top:
// the grass is its own scene so blades in front of a wall cover its line, and
// the line pass never has to draw the blades.
outline.mark(terrain, 'ground');
const perf = { n: 0, t: 0, last: 0 };
function draw() {
  const sc = space && space.active ? space.scene : scene;   // inside: the interior's own scene
  camera.layers.set(0);
  renderer.shadowMap.needsUpdate = shadowTick++ % (QUALITY.shadowRate || 1) === 0;
  const withShadow = renderer.shadowMap.needsUpdate;
  renderer.render(sc, camera);
  plog?.pass(withShadow ? 'main+shadow' : 'main');
  renderer.shadowMap.needsUpdate = false;
  setInkFocus(me.pos);
  outline.render(sc, camera);
  plog?.pass('ink-gbuf');
  if (grass && sc === scene) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(grassScene, camera);
    renderer.autoClear = ac;
    plog?.pass('grass');
  }
  // the vector ink last: depth-tested against everything already drawn (grass
  // included), so blades and water behind a line never paint over it
  if (outline.lines.visible) {
    camera.layers.set(INK_LAYER);
    const ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
    const bg = sc.background; sc.background = null;   // (a colour background would clear the picture)
    renderer.render(sc, camera);
    sc.background = bg;
    renderer.autoClear = ac; renderer.shadowMap.autoUpdate = su;
    camera.layers.set(0);
    plog?.pass('lines');
  }
  // weak device: if frames stay slow (average over 4 s above 50 ms), step the line buffer down (1.5 -> 1 -> 0.5), then drop it
  if (!TEST && outline.enabled && !q.has('outline') && window.worldReady) {
    const now = performance.now(), dt = now - (perf.last || now); perf.last = now;
    perf.n++; perf.t += Math.min(dt, 200);
    if (perf.t > 4000) {
      if (perf.t / perf.n > 50) {
        if (outline.scale > 0.5) { outline.scale = outline.scale > 1 ? 1 : 0.5; resize(); } else { outline.enabled = false; outline.lines.visible = false; }
      }
      perf.n = 0; perf.t = 0;
    }
  }
}

// ---------- the loop ----------
const clock = new THREE.Clock();
let t = 0;
const TEST = q.has('test');   // automated checks draw frames on demand
// Auto resolution: once a second, if frames came slower than 60 fps while the
// CPU had time to spare (so the GPU is the limit), lower the drawing
// resolution a step; after a few smooth seconds try a step back up. A step up
// that is undone soon after makes the next try wait longer.
function autoResTick(now, cpuMs) {
  if (TEST || !QUALITY.autoRes || document.hidden) { autoRes.last = 0; return; }
  if (autoRes.last) { const d = now - autoRes.last; if (d < 250) { autoRes.acc += d; autoRes.cpu += cpuMs; autoRes.n++; } }
  autoRes.last = now;
  if (autoRes.acc < 1000 || !window.worldReady) return;
  const ms = autoRes.acc / autoRes.n, cpu = autoRes.cpu / autoRes.n, target = 1000 / (QUALITY.fpsCap || 60);
  autoRes.acc = 0; autoRes.cpu = 0; autoRes.n = 0;
  if (now < autoRes.hold) return;
  let sc = autoRes.scale;
  if (ms > target * 1.12 && cpu < ms * 0.7) {
    sc = Math.max(0.5, sc - (ms > target * 1.8 ? 0.15 : 0.08)); autoRes.good = 0;
    if (now - autoRes.upAt < 4000) autoRes.need = Math.min(30, autoRes.need * 2);
  } else if (ms < target * 1.05 && sc < 1 && ++autoRes.good >= autoRes.need) { sc = Math.min(1, sc + 0.05); autoRes.good = 0; autoRes.upAt = now; }
  if (sc !== autoRes.scale) { autoRes.scale = Math.round(sc * 100) / 100; renderer.setPixelRatio(pixelRatio()); resize(); autoRes.hold = now + 1500; }
}
let lastFrameAt = 0;
function frame(fixed) {
  // frame rate cap: skip display refreshes until a frame is due
  if (!TEST && (QUALITY.fpsCap || 60) < 60) {
    const now = performance.now();
    if (now - lastFrameAt < 1000 / QUALITY.fpsCap - 3) { requestAnimationFrame(frame); return; }
    lastFrameAt = now;
  }
  const frameStart = performance.now();
  gameFrame++;
  plog?.begin();
  const dt = TEST && typeof fixed === 'number' ? fixed : Math.min(clock.getDelta(), 0.05);
  t += dt; uTime.value = t; foliageTime.value = t;
  const c = input.read(dt);
  if (dialog.open) {
    if (c.pressed.has('use') || c.pressed.has('jump') || c.pressed.has('back')) dialog.next();
  }
  // camera (as in Legends: Arceus): the right stick / arrows / mouse orbit it
  // freely; while you walk and leave it alone it slowly swings round behind
  // you; C (or ZL) brings it straight back behind the player
  const manual = Math.abs(c.lx) + Math.abs(c.ly) > 0.01;
  camIdle = manual ? 0 : camIdle + dt;
  cam.yaw -= c.lx * 0.0045; cam.pitch = Math.min(1.2, Math.max(-0.15, cam.pitch + c.ly * 0.0035));
  cam.dist = Math.min(14, Math.max(3, cam.dist + c.zoom * 0.8));
  if (c.pressed.has('recenter')) recenter = 0.35;
  {
    let behind = me.yaw + Math.PI - cam.yaw; behind = Math.atan2(Math.sin(behind), Math.cos(behind));
    if (recenter > 0) { recenter -= dt; cam.yaw += behind * (1 - Math.exp(-dt * 12)); if (manual) recenter = 0; }
    else if (camIdle > 1.0 && Math.abs(me.speed) > 0.5) cam.yaw += behind * (1 - Math.exp(-dt * 0.9 * Math.min(1, Math.abs(me.speed) / 6)));
  }
  // move: relative to the camera; Ash turns smoothly toward where you push
  let moving = 0;
  if (!dialog.open && !script && !space.busy) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const mx = rx * c.x - fx * c.y, mz = rz * c.x - fz * c.y;
    const m = Math.hypot(mx, mz);
    const want = m > 0.05 ? (c.run ? 8.5 : 4.5) * Math.min(1, m) : 0;
    me.speed += (want - me.speed) * (1 - Math.exp(-dt * 10));
    if (m > 0.05) {
      const ty = Math.atan2(mx, mz);
      let d = ty - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      me.yaw += d * (1 - Math.exp(-dt * 12));
      moving = 1;
    }
    if (Math.abs(me.speed) > 0.05) step(me, Math.sin(me.yaw) * me.speed * dt, Math.cos(me.yaw) * me.speed * dt);
    if (c.pressed.has('jump') && me.ground) { me.vy = 5.2; me.ground = false; }
    if (c.pressed.has('use')) {
      const n = nearby();
      if (n && n.door && !space.active) { me.speed = 0; space.enter('oak_lab', 'from_town'); }
      else if (n) {
        if (n.npc) {
          n.npc.target = null; n.npc.wait = 3; n.npc.speed = 0;
          n.npc.face = Math.atan2(me.pos.x - n.npc.pos.x, me.pos.z - n.npc.pos.z);
          space.npcFace(n.npc);
          me.face = Math.atan2(n.npc.pos.x - me.pos.x, n.npc.pos.z - me.pos.z);
        } else me.face = Math.atan2(n.x - me.pos.x, n.z - me.pos.z);
        me.speed = 0;
        dialog.say(n.lines);
      }
    }
  } else if (!script || dialog.open) me.speed = 0;
  // turn smoothly to face whoever (or whatever) you're talking to
  if (dialog.open && me.face != null) { let d = me.face - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); me.yaw += d * (1 - Math.exp(-dt * 10)); }
  if (!dialog.open) me.face = null;
  if (script) script.update(dt);
  // the door back out
  if (space.active && !space.busy && me.speed > 0.3 && space.portal()) space.leave();
  // gravity
  const g = groundAt(me.pos.x, me.pos.z);
  me.vy -= 16 * dt; me.pos.y += me.vy * dt;
  if (me.pos.y <= g) { me.pos.y = g; me.vy = 0; me.ground = true; }
  if (me.ground && me.pos.y - g < 0.3) me.pos.y = g;
  player.root.position.copy(me.pos);
  player.root.rotation.y = me.yaw;
  // the head turns toward where the camera looks, within a comfortable range
  {
    let rel = cam.yaw + Math.PI - me.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    player.lookYaw = Math.abs(rel) < 2.2 && !dialog.open ? Math.max(-1.0, Math.min(1.0, rel)) : 0;
  }
  if (gameFrame % 30 === 1) { shareSkeletons(player.root); for (const n of npcs) shareSkeletons(n.actor.root); }
  if (gameFrame % 180 === 90 && window.worldReady) freePictures();
  player.animate(dt, Math.abs(me.speed), !me.ground, t);
  void moving;
  // the view (last frame's camera) for the villagers' culling
  camera.updateMatrixWorld();
  cullMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(cullMat);
  // villagers wander
  for (const n of space.active ? [] : npcs) {
    if (n.hidden) continue;
    if (dialog.open || n === oak && !script) {
      // in a conversation (or waiting): stand still, turn to face the player
      if (dialog.open) n.speed = 0;
      if (n.face != null) { let d = n.face - n.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); n.yaw += d * (1 - Math.exp(-dt * 8)); }
    } else n.face = null;
    if (n !== oak && n.wander > 0 && !(dialog.open)) {
      if (!n.target) {
        n.wait -= dt; n.speed *= Math.exp(-dt * 8);
        if (n.wait <= 0) { const a = Math.random() * 6.28, r = Math.random() * n.wander; n.target = new THREE.Vector3(n.home.x + Math.cos(a) * r, 0, n.home.z + Math.sin(a) * r); }
      } else {
        const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { n.target = null; n.wait = 2 + Math.random() * 4; }
        else {
          n.speed = 1.6; const ty = Math.atan2(dx, dz);
          let dd = ty - n.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); n.yaw += dd * (1 - Math.exp(-dt * 6));
          if (!step(n, Math.sin(n.yaw) * n.speed * dt, Math.cos(n.yaw) * n.speed * dt)) n.target = null;
        }
      }
    }
    n.pos.y = groundAt(n.pos.x, n.pos.z);
    n.actor.root.position.copy(n.pos); n.actor.root.rotation.y = n.yaw;
    // well outside the view (with room for their shadow): not drawn, not animated
    cullSphere.center.set(n.pos.x, n.pos.y + 1, n.pos.z);
    const seen = n.hidden ? false : frustum.intersectsSphere(cullSphere);
    if (n.actor.root.visible !== seen && !n.hidden) n.actor.root.visible = seen;
    if (seen) n.actor.animate(dt, n.speed, false, t + n.home.x);
  }
  // areas and events
  const inGrass = TALL_GRASS.some(([x0, z0, x1, z1]) => me.pos.x > x0 && me.pos.x < x1 && me.pos.z > z0 && me.pos.z < z1);
  const now = me.pos.z < -60 ? 'route1' : 'town';
  if (now !== area && !space.active) { area = now; banner(now === 'route1' ? 'Route 1' : 'Pallet Town', now === 'route1' ? 'Pallet Town - Viridian City' : 'A quiet seaside village'); }
  if (inGrass && !script && !dialog.open && window.worldReady && !space.active) oakScene();
  updateCamera(dt);
  clouds.userData.tick(dt);
  for (const f of town.anim) f(dt, t);
  if (space.active) space.update(dt, t);
  else {
    if (veg) veg.update(camera.position);
    if (grass) grass.update(me.pos);
  }
  // the prompt over whatever is in reach
  const n = !dialog.open && !script ? nearby() : null;
  if (n) {
    const p = new THREE.Vector3(n.x, n.y, n.z).project(camera);
    dialog.prompt = p.z < 1 ? { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, label: n.label } : null;
  } else dialog.prompt = null;
  plog?.updated();
  draw();
  dialog.safeB = safeB;
  dialog.draw(dt, t, innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  plog?.end();
  autoResTick(frameStart, performance.now() - frameStart);
  fpsTick();
  if (!TEST) requestAnimationFrame(frame);
}

me.pos.y = groundAt(me.pos.x, me.pos.z);
cam.yaw = 0.35; cam.target.set(me.pos.x, me.pos.y + 1.45, me.pos.z);
if (TEST) frame(1 / 60); else requestAnimationFrame(frame);
grow().catch((e) => { console.error(e); status('Something went wrong loading the plants: ' + e.message); });
window.world = { outline, me, cam, space, setCam(v) { TEST_CAM = v; }, groundAt, town, dialog, oak, move(dx, dz) { return step(me, dx, dz); }, noWalk, scene, renderer, camera, npcs, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } };
