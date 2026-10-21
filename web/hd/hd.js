// HD-2D view of the running game. The real game runs in the emulator as usual;
// every frame this reads where everything is and draws it in 3D.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GB } from './gb.js';
import { World, Sprites } from './world.js';
import { tilesetConfig } from './tilesets.js';
import { drawBoxes } from './textbox.js';

const view = document.getElementById('view');
const ui = document.getElementById('ui');
const uictx = ui.getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
// Orthographic, like an isometric game: vertical lines stay vertical.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
let viewRows = 30;   // world units shown from top to bottom of the screen
function frustum() {
  const a = W / H;
  camera.left = -viewRows * a / 2; camera.right = viewRows * a / 2;
  camera.top = viewRows / 2; camera.bottom = -viewRows / 2;
  camera.updateProjectionMatrix();
}

const hemi = new THREE.HemisphereLight(0xdcefff, 0x6f8a58, 1.1);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.015;
sun.shadow.intensity = 0.8;
const SUN_DIR = new THREE.Vector3(-0.85, 1.0, 0.35).normalize();
const SHADOW_HALF = 36;   // the shadow map covers the area around the camera
const fill = new THREE.DirectionalLight(0xbfd8ff, 0.35);
scene.add(hemi, sun, sun.target, fill);
const lamps = new THREE.Group();
scene.add(lamps);

// ---------- post effects: tilt-shift blur, bloom, grade ----------
const TiltShift = {
  uniforms: {
    tDiffuse: { value: null }, delta: { value: new THREE.Vector2() },
    focus: { value: 0.45 }, range: { value: 0.16 }, amount: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 delta; uniform float focus, range, amount; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focus);
      float r = smoothstep(range, range + 0.32, d) * amount;
      vec4 c = vec4(0.0); float tot = 0.0;
      for (int i = -6; i <= 6; i++) {
        float w = 1.0 - abs(float(i)) / 7.0;
        c += texture2D(tDiffuse, vUv + delta * float(i) * r) * w; tot += w;
      }
      gl_FragColor = c / tot;
    }`,
};
const Grade = {
  uniforms: {
    tDiffuse: { value: null }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(1, 1, 1) },
    dim: { value: 0 },
  },
  vertexShader: TiltShift.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float fade, dim; uniform vec3 fadeColor; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 1.0, 0.93), 0.6);
      float v = smoothstep(0.95, 0.35, length((vUv - 0.5) * vec2(1.25, 1.0)));
      c.rgb *= mix(0.68, 1.0, v);
      c.rgb = mix(c.rgb, fadeColor, fade);
      c.rgb *= 1.0 - dim;
      gl_FragColor = c;
    }`,
};
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const tiltH = new ShaderPass(TiltShift);
const tiltV = new ShaderPass(TiltShift);
composer.addPass(tiltH);
composer.addPass(tiltV);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.86);
composer.addPass(bloom);
const grade = new ShaderPass(Grade);
composer.addPass(grade);
composer.addPass(new OutputPass());

let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  frustum();
  const px = Math.min(devicePixelRatio, 2);
  tiltH.uniforms.delta.value.set(2.2 / (W * px), 0);
  tiltV.uniforms.delta.value.set(0, 2.2 / (H * px));
  ui.width = Math.round(W * px); ui.height = Math.round(H * px);
  ui.style.width = W + 'px'; ui.style.height = H + 'px';
}
addEventListener('resize', resize);
resize();

// ---------- the Game Boy screen, for text boxes, menus and battles ----------
const gbCanvas = document.createElement('canvas');
gbCanvas.width = 160; gbCanvas.height = 144;
const gbCtx = gbCanvas.getContext('2d');
const gbImg = gbCtx.createImageData(160, 144);

function drawUI(gb, mode, boxes) {
  const px = ui.width / W;
  uictx.setTransform(1, 0, 0, 1, 0, 0);
  uictx.clearRect(0, 0, ui.width, ui.height);
  if (mode === '3d' && !boxes.length) return;
  gbImg.data.set(gb.frameBuffer());
  gbCtx.putImageData(gbImg, 0, 0);
  uictx.imageSmoothingEnabled = false;
  if (mode === 'screen') {
    // the whole Game Boy screen, as large as fits
    let s = Math.min(W * 0.94 / 160, H * 0.9 / 144);
    if (s >= 2) s = Math.floor(s);
    const w = 160 * s, h = 144 * s, x = (W - w) / 2, y = (H - h) / 2;
    uictx.fillStyle = 'rgba(0,0,0,0.55)';
    uictx.fillRect((x - 10) * px, (y - 10) * px, (w + 20) * px, (h + 20) * px);
    uictx.drawImage(gbCanvas, x * px, y * px, w * px, h * px);
    return;
  }
  // text boxes and menus, in our own style
  drawBoxes(uictx, px, W, H, boxes, (x, y) => gb.screenTile(x, y), gbCanvas, performance.now());
}

// ---------- the game ----------
let gb = null, world = null, sprites = null, mapKey = '';
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camReady = false, frameNo = 0;
const status = { mode: 'screen' };
window.hd = { status, THREE, scene, camera };

function setMood(indoor) {
  if (indoor) {
    scene.background = new THREE.Color(0x14121a);
    scene.fog = null;
    hemi.color.set(0xfff1dc); hemi.groundColor.set(0x5a4a3a); hemi.intensity = 1.0;
    sun.color.set(0xffe6c4); sun.intensity = 1.6;
    fill.intensity = 0.25;
    bloom.strength = 0.38;
  } else {
    scene.background = new THREE.Color(0x9fd2f4);
    scene.fog = new THREE.Fog(0xb7d9e8, 185, 260);  // camera sits 160 away
    hemi.color.set(0xdcefff); hemi.groundColor.set(0x6f8a58); hemi.intensity = 1.1;
    sun.color.set(0xfff0d8); sun.intensity = 2.4;
    fill.intensity = 0.35;
    bloom.strength = 0.3;
  }
}

function loadMap() {
  const map = gb.readMap();
  if (map.key === mapKey) return;
  mapKey = map.key;
  if (world) {
    scene.remove(world.group);
    world.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
  world = new World(map, gb);
  scene.add(world.group);
  setMood(world.indoor);
  // warm lamps indoors, placed over the room
  lamps.clear();
  if (world.indoor) {
    const B = 12, w = map.w * 4, h = map.h * 4;
    for (const [fx, fz] of [[0.3, 0.45], [0.7, 0.45], [0.5, 0.8]]) {
      const l = new THREE.PointLight(0xffd9a8, 22, 30, 1.6);
      l.position.set(B + w * fx, 6, B + h * fz);
      lamps.add(l);
    }
  }
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
  sc.near = 1; sc.far = 160;
  sc.updateProjectionMatrix();
  camReady = false;
}

// Brightness change the game is doing through its palette (fades to white/black).
function paletteFade(bgp) {
  let d = 0;
  for (let c = 0; c < 4; c++) d += ((bgp >> (c * 2)) & 3) - c;
  return d / 6; // < 0 lighter, > 0 darker
}

function frame(emu) {
  if (!gb || gb.emu !== emu) { gb = new GB(emu, window.gbRom); sprites = new Sprites(gb, scene); mapKey = ''; }
  frameNo++;
  const s = gb.state();
  const player = s.sprites.find((p) => p.slot === 0);
  const known = !!tilesetConfig(s.tileset);
  const overworld = !s.battle && player && player.pic === 0x01 && known && s.mapTiles > 0.35 && (s.lcdc & 0x80);
  status.mode = overworld ? '3d' : 'screen';
  status.state = s;
  if (overworld) {
    if (!world || frameNo % 10 === 0 || world.map.map !== s.map || world.map.tileset !== s.tileset) loadMap();
    if (world && frameNo % 4 === 0) world.animate(gb);
    sprites.update(s.sprites, world);
    sprites.bubble(s.bubble);
    // follow the player
    const tx = (s.px + 6) * 2 + 1, tz = (s.py + 6) * 2 + 1;
    const indoor = world && world.indoor;
    const pitch = indoor ? 0.72 : 0.58, dist = 160;
    const rows = indoor ? 26 : 32;
    if (rows !== viewRows) { viewRows = rows; frustum(); }
    const look = new THREE.Vector3(tx, 1, tz);
    const pos = look.clone().add(new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist));
    if (!camReady) { camPos.copy(pos); camLook.copy(look); camReady = true; }
    camPos.lerp(pos, 0.18); camLook.lerp(look, 0.18);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
    sprites.face(pitch);
    // keep the sun's shadow map on what the camera sees, snapped to whole
    // shadow-map texels so the edges don't shimmer while scrolling
    const texel = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
    const c = camLook.clone();
    c.x = Math.round(c.x / texel) * texel; c.z = Math.round(c.z / texel) * texel; c.y = 0;
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(SUN_DIR, 70);
    fill.position.copy(c).add(new THREE.Vector3(30, 20, 60));
    fill.target = sun.target;
    const f = paletteFade(s.bgp);
    grade.uniforms.fade.value = Math.min(1, Math.abs(f) * 1.3);
    grade.uniforms.fadeColor.value.set(f < 0 ? 0xffffff : 0x000000);
    grade.uniforms.dim.value = 0;
    // keep the player in the sharp band of the tilt-shift
    const p = look.clone().project(camera);
    const fy = (p.y + 1) / 2;
    tiltH.uniforms.focus.value = tiltV.uniforms.focus.value = fy;
  } else {
    grade.uniforms.dim.value = world ? 0.45 : 1;
    grade.uniforms.fade.value = 0;
  }
  if (window.hd.skipDraw) return;  // used by automated tests
  composer.render();
  drawUI(gb, status.mode, overworld ? s.boxes : []);
}

window.onGbFrame = (emu) => {
  try { frame(emu); } catch (e) { console.error(e); window.onGbFrame = null; }
};
