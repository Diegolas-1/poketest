// The Ash V2 stage (bundled into stage.js by build.sh)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { dressAsh } from './clothes.src.js';

const status = document.getElementById('status');
const fail = (e) => { status.textContent = 'Could not load Ash V2: ' + (e && (e.message || e)); status.classList.add('err'); console.error(e); };
addEventListener('error', (e) => fail(e.error || e.message));
addEventListener('unhandledrejection', (e) => fail(e.reason));
main().catch(fail);

async function main() {

// ---------- the stage ----------
const host = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const applyTheme = () => { scene.background = new THREE.Color(css('--bg')); scene.fog = new THREE.Fog(css('--bg'), 14, 40); };
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
camera.position.set(2.6, 1.5, 4.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.minDistance = 1.2; controls.maxDistance = 16; controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight('#fff6ec', '#7d7368', 1.4));
const key = new THREE.DirectionalLight('#fff1dc', 2.6);
key.position.set(3.5, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 }); key.shadow.bias = -0.0004;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight('#cfe0ff', 0.9); rim.position.set(-4, 3, -5); scene.add(rim);

// the floor: a round stage, a fine grid, and spike-tape marks where a performer stands
const R = 7;
const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#cfc9bf', roughness: 0.92 }));
floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.PolarGridHelper(R, 16, 7, 96, '#a49c90', '#b8b0a4'); grid.position.y = 0.002; scene.add(grid);
const tape = new THREE.MeshBasicMaterial({ color: '#d2452f' });
for (const [x, z, a] of [[0, 0, 0], [0, 0, Math.PI / 2], [2.5, -1.5, 0.4], [-2.5, -1.5, -0.4]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.05).rotateX(-Math.PI / 2), tape); m.position.set(x, 0.004, z); m.rotation.y = a; scene.add(m);
}

const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

// ---------- Ash V2 ----------
const NAMES = { HumanStandingIdle: 'Standing idle', HumanWalking: 'Walking', HumanCrouchedWalking2: 'Crouched walk', HumanTwoCycleSprint: 'Sprint',
  HumanRunningJump: 'Running jump', HumanRunningSlide: 'Running slide', HumanSitting: 'Sitting', HumanGoalieThrow: 'Goalie throw',
  HumanGoalkeeperOverhandThrow: 'Overhand throw', HumanDeathFromRight: 'Hit from the right' };
const ORDER = Object.keys(NAMES);
let model, mixer, actions = {}, clipsRaw = {}, current = null, hips;
// the model travels as base64 text (the host serves no .glb files), its images as .webp files
status.textContent = 'Downloading Ash V2\u2026';
// the one-file build (build.sh --single) carries everything inline in window.ASHV2
const packed = window.ASHV2 || {};
let b64 = packed.glb;
if (!b64) {
  const res = await fetch('ashv2.glb.txt');
  if (!res.ok) throw new Error('model download failed (' + res.status + ')');
  b64 = (await res.text()).trim();
}
status.textContent = 'Unpacking\u2026';
const bin = atob(b64), bytes = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
status.textContent = 'Loading textures\u2026';
const tl = new THREE.TextureLoader();
const tex = async (f, srgb) => { const t = await tl.loadAsync(packed[f] ? 'data:image/webp;base64,' + packed[f] : f); t.flipY = false; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const [map, normalMap, orm] = await Promise.all([tex('ashv2_color.webp', true), tex('ashv2_normal.webp'), tex('ashv2_orm.webp')]);
model = gltf.scene;
let tris = 0;
model.traverse((o) => {
  if (o.isMesh) { Object.assign(o.material, { map, normalMap, roughnessMap: orm, metalnessMap: orm }); o.material.needsUpdate = true; }
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }
  if (o.isBone && o.name === 'Hips') hips = o;
});
scene.add(model);

// ---------- his clothes (clothes.src.js) ----------
status.textContent = 'Dressing\u2026';
await new Promise((r) => setTimeout(r, 30));
let body; model.traverse((o) => { if (o.isSkinnedMesh && !body) body = o; });
const outfit = dressAsh(body);
for (const m of outfit.pieces) { body.parent.add(m); m.bind(body.skeleton, body.bindMatrix); }
const WEAR = { shirt: 'Shirt', jacket: 'Jacket', jeans: 'Jeans', gloves: 'Gloves', shoes: 'Shoes' };
const wearQ = new URLSearchParams(location.search).get('wear') ?? (window.ASHV2 || {}).wear;
const worn = new Set(wearQ != null ? wearQ.split(',').filter((k) => WEAR[k]) : Object.keys(WEAR));
const wear = document.getElementById('wear');
for (const [k, label] of Object.entries(WEAR)) {
  const b = document.createElement('button'); b.className = 'tog'; b.textContent = label; b.setAttribute('aria-pressed', String(worn.has(k)));
  b.addEventListener('click', () => { worn.has(k) ? worn.delete(k) : worn.add(k); b.setAttribute('aria-pressed', String(worn.has(k))); outfit.set(worn); });
  wear.appendChild(b);
}
// the clothes made from patterns (tailor/bake.mjs), each in place of the fitted one of its name
const packedClothes = (window.ASHV2 || {})['clothes.json'];
const baked = packedClothes ? JSON.parse(packedClothes) : await (await fetch('clothes.json')).json();
const sewn = {};
for (const gm of baked.garments) {
  const f32 = (s) => new Float32Array(unb64(s).buffer), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(f32(gm.position), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(f32(gm.normal), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(f32(gm.uv), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(unb64(gm.skinIndex).buffer), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(f32(gm.skinWeight), 4));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(unb64(gm.index).buffer), 1));
  // pieces cut from a different cloth (the jacket's white sleeves): colour per vertex
  if (gm.pieceColors) {
    const col = new Float32Array(gm.count * 3), c = new THREE.Color();
    for (const pc of gm.pieces) { c.set(gm.pieceColors[pc.name] || gm.color).convertSRGBToLinear(); for (let i = pc.start; i < pc.start + pc.n; i++) col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const mat = new THREE.MeshStandardMaterial({ color: gm.pieceColors ? '#ffffff' : gm.color, vertexColors: !!gm.pieceColors, roughness: 0.9, side: THREE.DoubleSide, map: fabric(gm.fabric) });
  const m = new THREE.SkinnedMesh(g, mat); m.name = gm.name + ' (sewn)'; m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
  body.parent.add(m); m.bind(body.skeleton, body.bindMatrix); sewn[gm.name] = m;
}
const setFitted = outfit.set.bind(outfit);
outfit.set = (on) => { setFitted(on); for (const p of outfit.pieces) if (sewn[p.name]) { sewn[p.name].visible = p.visible; p.visible = false; } };
outfit.set(worn);
mixer = new THREE.AnimationMixer(model);
// the clips travel forward on their own (root motion on the hips, +Z); "in place" takes out
// the drift so a loop doesn't snap back, and walking around moves the body instead
const travel = {};
for (const clip of gltf.animations) {
  clipsRaw[clip.name] = clip;
  const inPlace = clip.clone();
  for (const tr of inPlace.tracks) {
    if (tr.name !== 'Hips.position') continue;
    const v = tr.values, n = v.length / 3, T = tr.times, d = T[n - 1] - T[0] || 1;
    const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
    travel[clip.name] = Math.hypot(dx, dz) / d;
    for (let i = 0; i < n; i++) { const u = (T[i] - T[0]) / d; v[i * 3] -= dx * u; v[i * 3 + 2] -= dz * u; }
  }
  actions[clip.name] = { root: mixer.clipAction(clip), place: mixer.clipAction(inPlace) };
}
document.getElementById('stats').textContent = `${Math.round(tris).toLocaleString()} triangles \u00b7 52 bones \u00b7 ${gltf.animations.length} clips`;
status.textContent = '';

// ---------- clips mode ----------
const list = document.getElementById('clips');
let inPlace = true;
const act = (name) => actions[name][inPlace ? 'place' : 'root'];
function play(name, fade = 0.35) {
  const next = act(name);
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (current && current !== next) current.fadeOut(fade);
  current = next;
  for (const b of list.children) b.setAttribute('aria-pressed', String(b.dataset.name === name));
}
for (const n of ORDER) {
  if (!actions[n]) continue;
  const b = document.createElement('button'); b.className = 'clip'; b.dataset.name = n; b.setAttribute('aria-pressed', 'false');
  const c = clipsRaw[n]; b.innerHTML = `<span>${NAMES[n]}</span><span class="t">${Math.round(c.duration * 30)}f \u00b7 ${c.duration.toFixed(2)}s</span>`;
  b.addEventListener('click', () => { setMode('clips'); play(n); });
  list.appendChild(b);
}
play('HumanStandingIdle', 0);

const speed = document.getElementById('speed'), speedV = document.getElementById('speedV');
speed.addEventListener('input', () => { speedV.textContent = (+speed.value).toFixed(2) + '\u00d7'; });
const pause = document.getElementById('pause');
pause.addEventListener('click', () => pause.setAttribute('aria-pressed', String(pause.getAttribute('aria-pressed') !== 'true')));
const ip = document.getElementById('inplace');
ip.addEventListener('click', () => {
  inPlace = !inPlace; ip.setAttribute('aria-pressed', String(inPlace));
  const name = [...list.children].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.name;
  model.position.set(0, 0, 0);
  if (name && mode === 'clips') play(name, 0.15);
});
const turn = document.getElementById('turn');
turn.addEventListener('click', () => turn.setAttribute('aria-pressed', String(turn.getAttribute('aria-pressed') !== 'true')));

// ---------- walk-around mode: idle, walk, crouch and sprint blended by speed, at the clips' own pace ----------
let mode = 'clips';
const pad = document.getElementById('pad'), knob = document.getElementById('knob'), sprintB = document.getElementById('sprint');
const keys = new Set(); let stick = { x: 0, y: 0 }, crouch = false, jumpT = -1, vel = 0, heading = 0;
const LOCO = ['HumanStandingIdle', 'HumanWalking', 'HumanTwoCycleSprint', 'HumanCrouchedWalking2'];
function setMode(m) {
  if (m === mode) return;
  mode = m;
  document.getElementById('m-clips').setAttribute('aria-pressed', String(m === 'clips'));
  document.getElementById('m-roam').setAttribute('aria-pressed', String(m === 'roam'));
  document.getElementById('clipBox').hidden = m !== 'clips';
  document.getElementById('roamBox').hidden = m !== 'roam';
  const touch = matchMedia('(pointer: coarse)').matches;
  pad.hidden = sprintB.hidden = !(m === 'roam' && touch);
  mixer.stopAllAction(); current = null;
  if (m === 'roam') { for (const n of LOCO) { const a = actions[n].place; a.reset().setEffectiveWeight(n === 'HumanStandingIdle' ? 1 : 0).play(); } }
  else { model.position.set(0, 0, 0); model.rotation.y = 0; play('HumanStandingIdle', 0); }
}
document.getElementById('m-clips').addEventListener('click', () => setMode('clips'));
document.getElementById('m-roam').addEventListener('click', () => setMode('roam'));
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (mode === 'roam' && e.code === 'KeyC') crouch = !crouch;
  if (mode === 'roam' && e.code === 'Space' && jumpT < 0) { jumpT = 0; e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
let padId = null;
pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; pad.setPointerCapture(padId); movePad(e); });
pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) movePad(e); });
pad.addEventListener('pointerup', () => { padId = null; stick = { x: 0, y: 0 }; knob.style.transform = ''; });
function movePad(e) {
  const r = pad.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1, l = Math.min(1, Math.hypot(x, y)), a = Math.atan2(y, x);
  stick = { x: Math.cos(a) * l, y: Math.sin(a) * l }; knob.style.transform = `translate(${stick.x * 40}px, ${stick.y * 40}px)`;
}
sprintB.addEventListener('click', () => sprintB.setAttribute('aria-pressed', String(sprintB.getAttribute('aria-pressed') !== 'true')));
const WALK = 1.62, SPRINT = 5.6, CROUCH = 1.24;
function roam(dt) {
  let ix = stick.x, iy = stick.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  const mag = Math.min(1, Math.hypot(ix, iy)), sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintB.getAttribute('aria-pressed') === 'true';
  const top = crouch ? CROUCH : sprint ? SPRINT : WALK, want = mag * top;
  vel += (want - vel) * (1 - Math.exp(-dt * (want > vel ? 3.5 : 6)));
  if (mag > 0.05) {
    // directions relative to the camera
    const f = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize(), r = new THREE.Vector3(-f.z, 0, f.x);
    const d = f.multiplyScalar(-iy).add(r.multiplyScalar(ix)); const target = Math.atan2(d.x, d.z);
    heading += Math.atan2(Math.sin(target - heading), Math.cos(target - heading)) * (1 - Math.exp(-dt * 10));
  }
  model.rotation.y = heading;
  model.position.x += Math.sin(heading) * vel * dt; model.position.z += Math.cos(heading) * vel * dt;
  const rr = Math.hypot(model.position.x, model.position.z); if (rr > R - 0.6) { model.position.x *= (R - 0.6) / rr; model.position.z *= (R - 0.6) / rr; }
  // weights by speed; each locomotion clip plays at the rate that matches its own stride
  const w = { HumanStandingIdle: 0, HumanWalking: 0, HumanTwoCycleSprint: 0, HumanCrouchedWalking2: 0 };
  if (crouch) { const k = Math.min(1, vel / CROUCH * 1.4); w.HumanCrouchedWalking2 = k; w.HumanStandingIdle = 1 - k; }
  else if (vel < WALK) { const k = vel / WALK; w.HumanWalking = k; w.HumanStandingIdle = 1 - k; }
  else { const k = Math.min(1, (vel - WALK) / (SPRINT - WALK)); w.HumanTwoCycleSprint = k; w.HumanWalking = 1 - k; }
  for (const n of LOCO) {
    const a = actions[n].place; a.setEffectiveWeight(w[n] * (jumpT >= 0 ? 0 : 1));
    if (n !== 'HumanStandingIdle') a.timeScale = travel[n] ? Math.max(0.35, vel / travel[n]) : 1;
  }
  // a running jump on Space: the clip in place, over the top
  if (jumpT >= 0) {
    const j = actions.HumanRunningJump.place;
    if (jumpT === 0) j.reset().setLoop(THREE.LoopOnce).setEffectiveWeight(1).play();
    jumpT += dt; if (jumpT > clipsRaw.HumanRunningJump.duration) { j.stop(); jumpT = -1; }
  }
  // the camera keeps him in frame
  const want3 = new THREE.Vector3(model.position.x, 0.95, model.position.z);
  const delta = want3.clone().sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 4));
  controls.target.add(delta); camera.position.add(delta);
}

// ---------- the loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  const k = pause.getAttribute('aria-pressed') === 'true' ? 0 : +speed.value;
  if (mode === 'roam') roam(dt * k);
  else if (turn.getAttribute('aria-pressed') === 'true') model.rotation.y += dt * 0.5;
  mixer.update(dt * k);
  key.position.set(model.position.x + 3.5, 6, model.position.z + 4); key.target.position.copy(model.position);
  controls.update();
  renderer.render(scene, camera);
});
// for checking shots: ?cam=x,y,z,tx,ty,tz&clip=Name&t=seconds&ui=0
const q = new URLSearchParams(location.search);
if (q.get('cam')) { const c = q.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); }
if (q.get('clip') && actions[q.get('clip')]) { play(q.get('clip'), 0); if (q.get('t')) { mixer.update(+q.get('t')); pause.setAttribute('aria-pressed', 'true'); } }
if (q.get('rest') === '1') { mixer.stopAllAction(); body.skeleton.pose(); pause.setAttribute('aria-pressed', 'true'); }
if (q.get('ui') === '0') document.querySelector('.rail').style.display = 'none';
window.ash = { THREE, model, gltf, outfit, body, scene, camera, controls, renderer, mixer, actions, play };
window.stageReady = true;
}

function unb64(s) { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

// cloth: a fine right-hand twill (denim: white weft flecks through indigo; the jacket's twill
// finer and flatter), or a jersey knit; the cloth's UVs are its pattern's centimetres, so a
// tile is a real size on him
function fabric(kind) {
  if (!kind) return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), img = x.createImageData(256, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const n = Math.random();
    let v;
    if (kind === 'jersey') v = 0.93 + 0.05 * Math.sin((i % 6) / 6 * Math.PI * 2) * (j % 2 ? 1 : -1) + 0.03 * (n - 0.5);
    else if (kind === 'twill') v = 0.92 + 0.05 * (((i + j) % 6) < 3 ? 1 : 0) + 0.03 * (n - 0.5);
    else v = 0.86 + 0.1 * (((i + j) % 8) < 4 ? 1 : 0) + 0.08 * (n - 0.5) + (n > 0.985 ? 0.12 : 0);
    const k = (j * 256 + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.min(255, v * 255); img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 4, 1 / 4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
