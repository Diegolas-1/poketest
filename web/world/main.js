// Pallet Town in 3D: a modern seaside eco-village to walk around freely.
import * as THREE from 'three';
import { buildTerrain, buildWater, grassMap, height, isWater, SEA_Y } from './terrain.js';
import { buildSky, buildClouds, buildMountains, TALL_GRASS } from './nature.js';
import { buildTown, BEDS } from './town.js';
import { celify } from './toon.js';
import { foliageTime } from './foliage.js';
import { buildVegetation } from './veg.js';
import { grassField, wind, surface } from './assets.js';
import { makeActor, LOOKS } from './actor.js';
import { Input } from './input.js';
import { Dialog } from './dialog.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('loadText').textContent = t; };

// ---------- quality ----------
const q = new URLSearchParams(location.search);
const auto = (navigator.hardwareConcurrency || 4) <= 4 || /CrOS|Android|iPhone|iPad/.test(navigator.userAgent) ? 'low' : 'high';
const level = q.get('q') || auto;
const QUALITY = {
  low: { dpr: 1, shadow: 1024, grass: 60000, grassSize: 40, trees: 0.6, plants: 0.5, lod: 0.7 },
  medium: { dpr: 1.25, shadow: 2048, grass: 110000, grassSize: 50, trees: 0.85, plants: 0.8, lod: 0.85 },
  high: { dpr: 1.5, shadow: 2048, grass: 180000, grassSize: 60, trees: 1, plants: 1, lod: 1 },
}[level] || null;

// ---------- renderer and scene ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.dpr));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = new THREE.Color('#c4e2f0');
scene.fog = new THREE.Fog(FOG, 90, 430);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 2000);

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
  const px = Math.min(devicePixelRatio, 2);
  $('ui').width = Math.round(w * px); $('ui').height = Math.round(h * px);
}
addEventListener('resize', resize); resize();

// ---------- the world ----------
status('Shaping the land');
const terrain = buildTerrain();
{
  // flat anime ground: bright in the sun, cool where shadows fall
  terrain.material = celify(new THREE.MeshLambertMaterial({ vertexColors: true }), { bands: [0.08, 0.22, 0.5], soft: 0.04,
    deep: [0.5, 0.62, 0.8], shade: [0.66, 0.78, 0.9], lit: [1.06, 1.06, 0.98] });
}
scene.add(terrain);
const uTime = wind.uTime;
scene.add(buildWater(uTime));
const clouds = buildClouds(); scene.add(clouds);
scene.add(buildMountains(sunDir));
const town = buildTown();
scene.add(town.group);
const colliders = town.colliders;

// where plants may not grow: buildings, beds' walls, the dock
function blocked(x, z, r = 0) {
  for (const c of colliders) {
    if (c.box) { if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return true; }
    else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return true;
  }
  for (const [x0, z0, x1, z1] of BEDS) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
  return false;
}

// ---------- people ----------
const player = makeActor(LOOKS.red);
scene.add(player.root);
const me = { pos: new THREE.Vector3(-20, 0, -9.6), yaw: 0, vy: 0, ground: true, speed: 0 };
const npcs = [];
function npc(look, x, z, lines, opts = {}) {
  const a = makeActor(look);
  scene.add(a.root);
  const n = { actor: a, home: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x, height(x, z), z), yaw: opts.yaw || 0,
    target: null, wait: 1 + Math.random() * 3, wander: opts.wander ?? 6, lines, speed: 0, name: opts.name };
  npcs.push(n);
  return n;
}
npc(LOOKS.girl, -16, 4, ['I\'m raising POKéMON too!', 'When they get strong, they can protect me!'], { name: 'Girl' });
npc(LOOKS.fisher, 6, 77, ['Technology is incredible!', 'You can now store and recall items and POKéMON as data via PC!'], { wander: 0, yaw: Math.PI, name: 'Fisher' });
npc(LOOKS.kid, 10, -2, ['Have you seen the windmill on PROF. OAK\'s lab?', 'It spins all day long. Grandpa says it powers the whole lab!'], { name: 'Kid' });
const oak = npc(LOOKS.oak, 22, 26, ['…'], { wander: 0, name: 'Prof. Oak' });
oak.actor.root.visible = false; oak.hidden = true;

// ---------- vegetation (async) ----------
let veg = null, grass = null;
async function grow() {
  status('Loading plants');
  veg = await buildVegetation(scene, renderer, blocked, colliders, QUALITY, status);
  status('Growing grass');
  const area = { x0: -150, z0: -200, w: 300, d: 290 };
  const tex = grassMap(area.x0, area.z0, area.w, area.d, 1);
  grass = grassField(scene, { count: QUALITY.grass, size: QUALITY.grassSize, heightTex: tex, area, sunDir });
  for (const imp of veg.impostors) Object.assign(imp.material.uniforms, { fogColor: { value: FOG }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } });
  Object.assign(grass.uniforms, { fogColor: { value: FOG }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } });
  $('loading').classList.add('done');
  banner('Pallet Town', 'A quiet seaside village');
  setTimeout(() => $('hint').classList.add('fade'), 12000);
  window.worldReady = true;
}

// ---------- movement and collision ----------
function groundAt(x, z) {
  let y = height(x, z);
  for (const w of town.walk) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) y = Math.max(y, w.y);
  return y;
}
function collide(p, r = 0.35) {
  for (const c of colliders) {
    if (Math.abs(p.x - c.x) > 12 || Math.abs(p.z - c.z) > 12) continue;
    if (c.box) {
      const dx = p.x - c.x, dz = p.z - c.z, ox = c.hw + r - Math.abs(dx), oz = c.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) { if (ox < oz) p.x += Math.sign(dx) * ox; else p.z += Math.sign(dz) * oz; }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); }
    }
  }
}
function onWalk(x, z) { return town.walk.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1); }
function step(obj, dx, dz) {
  const nx = obj.pos.x + dx, nz = obj.pos.z + dz;
  if (isWater(nx, nz) && !onWalk(nx, nz)) return false;
  if (nx < -150 || nx > 150 || nz < -205 || nz > 90) return false;
  obj.pos.x = nx; obj.pos.z = nz;
  collide(obj.pos);
  return true;
}

// ---------- camera ----------
const cam = { yaw: 0, pitch: 0.32, dist: 7.5, target: new THREE.Vector3(), pos: new THREE.Vector3() };
const ray = new THREE.Raycaster();
function updateCamera(dt) {
  const t = new THREE.Vector3(me.pos.x, me.pos.y + 1.45, me.pos.z);
  cam.target.lerp(t, 1 - Math.exp(-dt * 10));
  const cp = Math.cos(cam.pitch);
  const dir = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  let d = cam.dist;
  ray.set(cam.target, dir); ray.far = d;
  const hit = ray.intersectObjects(town.solid, true)[0];
  if (hit) d = Math.max(1.2, hit.distance - 0.3);
  const want = cam.target.clone().addScaledVector(dir, d);
  want.y = Math.max(want.y, groundAt(want.x, want.z) + 0.4, SEA_Y + 0.4);
  cam.pos.lerp(want, 1 - Math.exp(-dt * 14));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.target);
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

// the closest thing to talk to or read
function nearby() {
  let best = null, bd = 1e9;
  const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
  for (const u of town.use) {
    const dx = u.x - me.pos.x, dz = u.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < u.r + 0.6 && d < bd) { best = { label: u.label, lines: u.lines, x: u.x, y: groundAt(u.x, u.z) + 1.9, z: u.z }; bd = d; }
  }
  for (const n of npcs) {
    if (n.hidden) continue;
    const dx = n.pos.x - me.pos.x, dz = n.pos.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.2 && (dx * fx + dz * fz) / (d || 1) > 0.2 && d < bd) { best = { label: 'Talk', lines: n.lines, npc: n, x: n.pos.x, y: n.pos.y + 2.0, z: n.pos.z }; bd = d; }
  }
  return best;
}

// Oak stops you at the tall grass, like in the original.
function oakScene() {
  const start = me.pos.clone();
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
        // both head back toward town
        const tz = start.z + 14;
        oak.pos.z += dt * 4.6; oak.yaw = 0; oak.speed = 4.6;
        me.pos.z += dt * 4.6; me.yaw = 0; me.speed = 4.6;
        oak.pos.y = height(oak.pos.x, oak.pos.z);
        if (me.pos.z > tz) {
          phase = 3; me.speed = 0; oak.speed = 0;
          oak.hidden = true; oak.actor.root.visible = false;
          oak.pos.set(22, height(22, 26.5), 26.5); oak.yaw = Math.PI;
          oak.lines = ['OAK: There you are! Inside the lab is coming soon.', 'For now, explore the town. Pallet has changed a lot!'];
          oak.hidden = false; oak.actor.root.visible = true;
          script = null;
          banner('Prof. Oak\'s Lab', 'Find the professor by the sea');
        }
      }
    },
  };
}

// ---------- the loop ----------
const clock = new THREE.Clock();
let t = 0;
const TEST = q.has('test');   // automated checks draw frames on demand
function frame(fixed) {
  const dt = TEST && typeof fixed === 'number' ? fixed : Math.min(clock.getDelta(), 0.05);
  t += dt; uTime.value = t; foliageTime.value = t;
  const c = input.read();
  if (dialog.open) {
    if (c.pressed.has('use') || c.pressed.has('jump') || c.pressed.has('back')) dialog.next();
  }
  // look around
  cam.yaw -= c.lx * 0.0045; cam.pitch = Math.min(1.2, Math.max(-0.15, cam.pitch + c.ly * 0.0035));
  cam.dist = Math.min(14, Math.max(3, cam.dist + c.zoom * 0.8));
  // move
  let moving = 0;
  if (!dialog.open && !script) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const mx = rx * c.x - fx * c.y, mz = rz * c.x - fz * c.y;
    const m = Math.hypot(mx, mz);
    const want = m > 0.05 ? (c.run ? 8.4 : 4.4) * Math.min(1, m) : 0;
    me.speed += (want - me.speed) * (1 - Math.exp(-dt * 10));
    if (m > 0.05) {
      const ty = Math.atan2(mx, mz);
      let d = ty - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      me.yaw += d * (1 - Math.exp(-dt * 14));
      moving = 1;
    }
    if (me.speed > 0.05) step(me, Math.sin(me.yaw) * me.speed * dt, Math.cos(me.yaw) * me.speed * dt);
    if (c.pressed.has('jump') && me.ground) { me.vy = 5.2; me.ground = false; }
    if (c.pressed.has('use')) {
      const n = nearby();
      if (n) {
        if (n.npc) { n.npc.yaw = Math.atan2(me.pos.x - n.npc.pos.x, me.pos.z - n.npc.pos.z); n.npc.target = null; n.npc.wait = 3; }
        dialog.say(n.lines);
      }
    }
  } else if (!script) me.speed *= Math.exp(-dt * 12);
  if (script) script.update(dt);
  // gravity
  const g = groundAt(me.pos.x, me.pos.z);
  me.vy -= 16 * dt; me.pos.y += me.vy * dt;
  if (me.pos.y <= g) { me.pos.y = g; me.vy = 0; me.ground = true; }
  if (me.ground && me.pos.y - g < 0.3) me.pos.y = g;
  player.root.position.copy(me.pos);
  player.root.rotation.y = me.yaw;
  player.animate(dt, me.speed, !me.ground, t);
  void moving;
  // villagers wander
  for (const n of npcs) {
    if (n.hidden) continue;
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
    n.actor.animate(dt, n.speed, false, t + n.home.x);
  }
  // areas and events
  const inGrass = TALL_GRASS.some(([x0, z0, x1, z1]) => me.pos.x > x0 && me.pos.x < x1 && me.pos.z > z0 && me.pos.z < z1);
  const now = me.pos.z < -46 ? 'route1' : 'town';
  if (now !== area) { area = now; banner(now === 'route1' ? 'Route 1' : 'Pallet Town', now === 'route1' ? 'Pallet Town - Viridian City' : 'A quiet seaside village'); }
  if (inGrass && !script && !dialog.open && window.worldReady) oakScene();
  updateCamera(dt);
  clouds.userData.tick(dt);
  for (const f of town.anim) f(dt, t);
  if (veg) veg.update(camera.position);
  if (grass) grass.uniforms.uCam.value.copy(me.pos);
  // the prompt over whatever is in reach
  const n = !dialog.open && !script ? nearby() : null;
  if (n) {
    const p = new THREE.Vector3(n.x, n.y, n.z).project(camera);
    dialog.prompt = p.z < 1 ? { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, label: n.label } : null;
  } else dialog.prompt = null;
  renderer.render(scene, camera);
  dialog.draw(dt, t, innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  if (!TEST) requestAnimationFrame(frame);
}

me.pos.y = groundAt(me.pos.x, me.pos.z);
cam.yaw = 0.35; cam.target.set(me.pos.x, me.pos.y + 1.45, me.pos.z);
if (TEST) frame(1 / 60); else requestAnimationFrame(frame);
grow().catch((e) => { console.error(e); status('Something went wrong loading the plants: ' + e.message); });
window.world = { me, cam, scene, renderer, camera, npcs, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } };
