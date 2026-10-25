// Real plants and props: loads the CC0 scans in assets/, scatters them in
// culled chunks with wind, swaps far trees for billboards rendered from the
// real model, and grows a dense field of grass blades around the player.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { E } from './editlayer/index.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

// Loads a model. Poly Haven files often hold several variations side by side
// (a set of ferns, three shrubs); each top-level node becomes a variant with
// its base centred on the origin. Returns {variants: [{parts, box, height,
// radius}]} plus the first variant's fields for convenience.
function floatAttr(a) {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return new THREE.BufferAttribute(out, a.itemSize);
}
export function loadModel(id) {
  if (cache.has(id)) return cache.get(id);
  const p = loader.loadAsync(`assets/models/${id}.glb`).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    // every mesh in world space
    const all = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) if (o.geometry.attributes[k]) g.setAttribute(k, floatAttr(o.geometry.attributes[k]));
      if (o.geometry.index) g.setIndex(o.geometry.index.clone());
      g.applyMatrix4(o.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingBox();
      o.material.side = THREE.DoubleSide;   // leaves are single sheets
      all.push({ geometry: g, material: o.material, box: g.boundingBox.clone() });
    });
    // meshes whose footprints overlap belong to the same plant (trunk + leaves)
    const group = all.map((_, i) => i);
    const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i].box, b = all[j].box;
      if (a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.z <= b.max.z && b.min.z <= a.max.z) group[find(i)] = find(j);
    }
    const sets = new Map();
    all.forEach((m, i) => { const k = find(i); if (!sets.has(k)) sets.set(k, []); sets.get(k).push(m); });
    const variants = [];
    for (const parts of sets.values()) {
      const box = new THREE.Box3();
      for (const q of parts) { q.geometry.computeBoundingBox(); box.union(q.geometry.boundingBox); }
      const c = box.getCenter(new THREE.Vector3());
      for (const q of parts) { q.geometry.translate(-c.x, -box.min.y, -c.z); q.geometry.computeBoundingSphere(); }
      box.translate(new THREE.Vector3(-c.x, -box.min.y, -c.z));
      variants.push({ parts, box, height: box.max.y, radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 });
    }
    return { id, variants, ...variants[0] };
  }).catch((e) => { console.warn('missing model', id, e.message); return null; });
  cache.set(id, p);
  return p;
}

// A scanned surface (diffuse, normal, ambient/roughness/metal) for building
// materials, repeating every `size` metres along the box-projected UVs.
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
export function surface(id, { color = '#ffffff', size = 2, rough = 1 } = {}) {
  const key = `${id}|${color}|${size}`;
  if (texCache.has(key)) return texCache.get(key);
  const load = (k, srgb) => {
    const t = texLoader.load(`assets/tex/${id}/${k}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / size, 1 / size);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map: load('diff', true), normalMap: load('nor', false),
    roughnessMap: arm, metalnessMap: arm, aoMap: arm, roughness: rough, metalness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
  texCache.set(key, m);
  return m;
}
// Gives a geometry world-scale UVs from a box projection (1 unit = 1 metre),
// so textures keep the same size on every panel and roof.
export function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------- wind ----------
export const wind = { uTime: { value: 0 } };
function windy(material, height, amount) {
  const m = material.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float k = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0); k = k * k;
      float w = sin(uTime * 1.3 + ip.x * 0.31 + ip.z * 0.23) * 0.7 + sin(uTime * 2.7 + ip.x * 0.9 + position.x * 2.0) * 0.3;
      transformed.x += w * ${amount.toFixed(3)} * k;
      transformed.z += w * ${(amount * 0.6).toFixed(3)} * k;`);
  };
  m.customProgramCacheKey = () => `windy${height.toFixed(1)}${amount}`;
  return m;
}

// ---------- distance fades (LOD without pop-in) ----------
// Every scattered plant fades on its own instead of whole chunks appearing at
// once. When a plant crosses its range (with hysteresis, so standing on the
// line does not flicker) it fades over FADE_S seconds: an 8x8 ordered dither
// (screen door) eats its pixels and small plants also shrink toward their
// root. A far tree's billboard draws exactly the pixels its model gives up
// (the same dither, the other side of the threshold), so the swap is a
// cross-fade, and nothing ever stands half-dithered. Per instance the
// geometry attribute fadeR = (k 0 shown..1 gone, smallest scale, 2 = on);
// meshes without it never fade. The shadow pass uses the same k.
export const FADE_S = 0.6;
const BAYER = `
  float fdB2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float fdB4(vec2 a){ return fdB2(0.5 * a) * 0.25 + fdB2(a); }
  float fdB8(vec2 a){ return fdB4(0.5 * a) * 0.25 + fdB2(a); }`;
const faded = new WeakSet();
// adds the fade to a material in place (idempotent; works on Lambert, depth
// and anything else built from three's chunks)
export function fadeMaterial(m) {
  if (!m || faded.has(m)) return m;
  faded.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    // (an unset attribute reads 0 or 1, never 2: those meshes stay as they are)
    sh.vertexShader = 'attribute vec3 fadeR;\nvarying float vFadeK;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFadeK = 0.0;
      if (fadeR.z > 1.5) {
        vFadeK = fadeR.x;
        // gone: collapse to a point so it costs no pixels; else shrink toward the root
        transformed *= vFadeK >= 0.999 ? 0.0 : mix(1.0, fadeR.y, vFadeK);
      }`);
    sh.fragmentShader = 'varying float vFadeK;\n' + BAYER + '\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `
      if (vFadeK > 0.0 && fdB8(gl_FragCoord.xy) < vFadeK) discard;
      #include <clipping_planes_fragment>`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + '|fade';
  m.needsUpdate = true;
  return m;
}
// a shadow caster's depth material with the fade (foliage's swaying depth
// materials are faded in place; plain meshes get a shared one)
let plainDepth = null;
function fadeDepth(im) {
  const d = im.customDepthMaterial;
  if (d) { fadeMaterial(d); return; }
  if (!plainDepth) plainDepth = fadeMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  im.customDepthMaterial = plainDepth;
}
// a geometry that shares the model's buffers (uploaded once) plus the chunk's
// per-instance fade attribute (shared by the model's parts)
function chunkGeometry(g, fadeAttr) {
  const c = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) c.setAttribute(k, a);
  if (g.index) c.setIndex(g.index);
  if (!g.boundingSphere) g.computeBoundingSphere();
  c.boundingSphere = g.boundingSphere; c.boundingBox = g.boundingBox;
  c.setAttribute('fadeR', fadeAttr);
  return c;
}

// ---------- scattering in chunks ----------
// points: [{x, y, z, rot, s}]. Each chunk is its own InstancedMesh so the
// camera culls what is off screen. A plant leaves when it gets farther than
// fade[1] metres from the camera and comes back nearer than fade[0] (the gap
// is the hysteresis), fading over FADE_S (shrinking to `shrink` of its size);
// with an impostor its billboard fades in as it goes, and lasts out to `far`.
// A chunk's meshes are hidden only once every plant in it has gone.
// (maxDist alone = fade [maxDist - 4, maxDist].)
export class Scatter {
  constructor(scene, model, points, { chunk = 24, maxDist = 90, fade = null, shrink = 1, wind: w = 0.06, shadows = true, impostor = null, far = [500, 600] } = {}) {
    points = E.placed(points);   // plants the world editor moved (editlayer/index.js)
    this.chunks = [];
    this.fade = fade || [maxDist - 4, maxDist];
    this.impostor = impostor;
    this.points = points;
    this.t = 0;
    const groups = new Map();
    points.forEach((p, i) => {
      const k = `${Math.floor(p.x / chunk)},${Math.floor(p.z / chunk)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    const mats = model.parts.map((part) => fadeMaterial(w > 0 ? windy(part.material, model.height, w) : part.material));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (const idx of groups.values()) {
      const list = idx.map((i) => points[i]);
      const c = { center: new THREE.Vector3(), radius: 0, meshes: [], idx, k: new Float32Array(list.length).fill(1), out: new Uint8Array(list.length).fill(1), live: false, allOut: true, anyOut: true };
      for (const p of list) c.center.add(t.set(p.x, p.y, p.z));
      c.center.divideScalar(list.length);
      for (const p of list) c.radius = Math.max(c.radius, Math.hypot(p.x - c.center.x, p.z - c.center.z) + model.radius * p.s);
      const f = new Float32Array(list.length * 3);
      for (let j = 0; j < list.length; j++) f.set([1, shrink, 2], j * 3);
      c.attr = new THREE.InstancedBufferAttribute(f, 3);
      c.attr.setUsage(THREE.DynamicDrawUsage);
      model.parts.forEach((part, i) => {
        const im = new THREE.InstancedMesh(chunkGeometry(part.geometry, c.attr), mats[i], list.length);
        list.forEach((p, j) => {
          q.setFromAxisAngle(up, p.rot);
          m4.compose(t.set(p.x, p.y, p.z), q, s.set(p.s, p.s * (p.sy || 1), p.s));
          im.setMatrixAt(j, m4);
        });
        // all parts of a plant stand in the same places: one matrix buffer
        if (c.meshes.length) im.instanceMatrix = c.meshes[0].instanceMatrix;
        im.computeBoundingSphere();
        im.castShadow = shadows; im.receiveShadow = true;
        im.visible = false;
        if (shadows) fadeDepth(im);
        scene.add(im);
        c.meshes.push(im);
      });
      this.chunks.push(c);
    }
    // one billboard mesh for all the far plants of this scatter
    if (impostor) this.bill = impostor.make(scene, points, far);
  }
  // cam: camera position; dt: seconds since the last call (first call snaps)
  update(cam, dt) {
    const first = this.t === 0;
    this.t += dt || 0.016;
    const step = first ? 1 : Math.min(1, (dt || 0.016) / FADE_S);
    const [a, b] = this.fade, P = this.points, bk = this.bill ? this.bill.k : null;
    let billDirty = false;
    for (const c of this.chunks) {
      const dc = c.center.distanceTo(cam);
      // whole chunk well inside or well outside its band and settled: nothing to do
      if (!c.live && ((dc + c.radius < a && !c.anyOut) || (dc - c.radius > b && c.allOut))) {
        if (c.meshes[0].visible === c.allOut) for (const m of c.meshes) m.visible = !c.allOut;
        continue;
      }
      let live = false, dirty = false, allOut = true, anyOut = false;
      const f = c.attr.array;
      for (let j = 0; j < c.idx.length; j++) {
        const p = P[c.idx[j]];
        const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (c.out[j] ? d < a : d > b) c.out[j] ^= 1;
        const want = c.out[j], k = c.k[j];
        if (k !== want) {
          const nk = want > k ? Math.min(want, k + step) : Math.max(want, k - step);
          c.k[j] = nk; f[j * 3] = nk; dirty = true;
          if (bk) { bk[c.idx[j]] = nk; billDirty = true; }
          if (nk !== want) live = true;
        }
        if (c.k[j] < 1) allOut = false; else anyOut = true;
        if (c.out[j]) anyOut = true;
      }
      if (dirty) c.attr.needsUpdate = true;
      c.live = live; c.allOut = allOut; c.anyOut = anyOut;
      for (const m of c.meshes) m.visible = !allOut;
    }
    if (billDirty) this.bill.attr.needsUpdate = true;
  }
}

// ---------- billboards (impostors) ----------
// Renders the real model from 8 directions into one texture, each with the
// sun from 4 directions round it (in front, right, behind, left of the view),
// lit like the scene (same sun, sky light and environment, cel bands and all),
// so a billboard has the model's colours from any side the sun is on. Far
// plants are quads that pick the view nearest the camera's and blend the two
// sun rows nearest the real sun. Stored linear, tone-mapped and fogged in the
// shader the way three does it for the models.
export class Impostor {
  constructor(renderer, model, { size = 192, lights = null } = {}) {
    const views = 8, rows = 4;
    // the frame from the real geometry (a bush's puffs rise past its nominal height)
    const box = new THREE.Box3();
    for (const p of model.parts) { if (!p.geometry.boundingBox) p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
    const r = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) * 1.04, top = box.max.y * 1.03, bot = Math.min(0, box.min.y);
    const w = size, h = Math.max(16, Math.round(size * (top - bot) / (r * 2)));
    this.rt = new THREE.WebGLRenderTarget(w * views, h * rows, { colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true });
    this.views = views;
    this.bytes = w * views * h * rows * 4 * 1.33;
    const scene = new THREE.Scene();
    const L = lights || {};
    const hemi = L.hemi ? L.hemi.clone() : new THREE.HemisphereLight('#e2f1ff', '#6d7f4c', 0.55);
    const sun = L.sun ? new THREE.DirectionalLight(L.sun.color, L.sun.intensity) : new THREE.DirectionalLight('#fff0d4', 2.9);
    scene.add(hemi, sun, sun.target);
    if (L.environment) { scene.environment = L.environment; scene.environmentIntensity = L.environmentIntensity ?? 1; }
    const sd = (L.sunDir || new THREE.Vector3(-0.55, 0.75, 0.45)).clone().normalize();
    const el = Math.asin(sd.y);
    this.sunAz = Math.atan2(sd.x, sd.z);
    // one draw per sun direction: the 8 views side by side as 8 turned
    // copies in front of one far-away orthographic camera (same picture as
    // circling the camera, a quarter of the draw calls of one per view)
    const g = new THREE.Group(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const p of model.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, views);
      for (let i = 0; i < views; i++) {
        q.setFromAxisAngle(up, -(i / views) * Math.PI * 2);
        im.setMatrixAt(i, m4.compose(new THREE.Vector3(r * 2 * i, 0, 0), q, new THREE.Vector3(1, 1, 1)));
      }
      im.frustumCulled = false;
      g.add(im);
    }
    scene.add(g);
    const cam = new THREE.OrthographicCamera(-r, -r + r * 2 * views, top, bot, 1, 2000);
    cam.position.set(0, 0, 1000); cam.lookAt(0, 0, 0);
    const old = renderer.getRenderTarget(), oldClear = renderer.getClearAlpha();
    const oldColor = renderer.getClearColor(new THREE.Color());
    const oldShadow = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    // the target's own viewport (the renderer's is scaled by the pixel ratio);
    // each row is cleared and drawn, the mip chain is rebuilt after each
    this.rt.scissorTest = true;
    for (let j = 0; j < rows; j++) {
      const az = (j / rows) * Math.PI * 2;
      sun.position.set(Math.sin(az) * Math.cos(el) * 1000, Math.sin(el) * 1000, Math.cos(az) * Math.cos(el) * 1000);
      this.rt.viewport.set(0, j * h, w * views, h);
      this.rt.scissor.copy(this.rt.viewport);
      renderer.setRenderTarget(this.rt);
      renderer.render(scene, cam);
    }
    this.rt.scissorTest = false; this.rt.viewport.set(0, 0, w * views, h * rows);
    // keep only the picture: read it back into a plain texture (mipmapped on
    // upload) and free the render target, whose depth buffer is as big again
    const W = w * views, H = h * rows, px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(this.rt, 0, 0, W, H, px);
    const tex = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true; tex.needsUpdate = true;
    tex.onUpdate = () => { tex.image = { data: null, width: W, height: H }; };
    this.rt.dispose(); this.rt = { texture: tex };
    renderer.setRenderTarget(old);
    renderer.setClearColor(oldColor, oldClear);
    renderer.shadowMap.autoUpdate = oldShadow;
    for (const im of g.children) im.dispose();
    this.width = r * 2; this.height = top - bot; this.bottom = bot;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, views: { value: views }, rows: { value: rows }, sunAz: { value: this.sunAz },
        fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: `
        attribute vec4 inst; attribute float scl; attribute float kf; attribute vec2 far;
        uniform float views, rows, sunAz; varying vec2 vUv; varying vec2 vRow; varying float vFog; varying float vK;
        void main(){
          vec3 c = inst.xyz; float rot = inst.w;
          vec3 toCam = cameraPosition - c;
          // kf = how far the model has faded out (we take the pixels it gives
          // up); far = where the billboards themselves thin out into the fog
          vK = kf * (1.0 - clamp((length(toCam) - far.x) / (far.y - far.x), 0.0, 1.0));
          if (vK <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          toCam.y = 0.0; toCam = normalize(toCam);
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          vec3 p = c + (right * position.x + vec3(0.0, position.y, 0.0)) * scl;
          float camAz = atan(toCam.x, toCam.z);
          float ang = camAz - rot;
          float f = mod(floor(ang / 6.2831853 * views + 0.5), views);
          float rs = mod((sunAz - camAz) / 6.2831853 * rows, rows);
          vRow = vec2(floor(rs), fract(rs));
          vUv = vec2((f + uv.x) / views, uv.y);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFog = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform float rows; uniform vec3 fogColor; uniform float fogNear, fogFar;
        varying vec2 vUv; varying vec2 vRow; varying float vFog; varying float vK;
        ${BAYER}
        void main(){
          if (fdB8(gl_FragCoord.xy) >= vK) discard;
          // (the row index comes through a varying: round it, or 3 + 1 lands a
          // hair short of 4 and the second sample reads off the atlas)
          float r0 = floor(vRow.x + 0.5), r1 = r0 + 1.0 >= rows - 0.5 ? 0.0 : r0 + 1.0;
          vec4 a = texture2D(map, vec2(vUv.x, (r0 + vUv.y) / rows));
          vec4 b = texture2D(map, vec2(vUv.x, (r1 + vUv.y) / rows));
          float al = mix(a.a, b.a, vRow.y);
          // smaller mip levels average the gaps between leaves into the alpha,
          // so a far crown would thin out: scale it up with the level
          vec2 px = vUv * vec2(textureSize(map, 0)) * vec2(1.0, 1.0 / rows);
          float lod = max(0.0, 0.5 * log2(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px)))));
          if (al * (1.0 + lod * 0.3) < 0.5) discard;
          // colour without the transparent border's black (as if premultiplied)
          vec3 c = mix(a.rgb / max(a.a, 0.004), b.rgb / max(b.a, 0.004), vRow.y);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFog));
        }`,
    });
  }
  make(scene, list, far) {
    const g = new THREE.PlaneGeometry(this.width, this.height);
    g.translate(0, this.height / 2 + this.bottom, 0);
    const ig = new THREE.InstancedBufferGeometry().copy(g);
    ig.instanceCount = list.length;
    const inst = new Float32Array(list.length * 4), scl = new Float32Array(list.length), k = new Float32Array(list.length).fill(1);
    list.forEach((p, i) => { inst.set([p.x, p.y, p.z, p.rot], i * 4); scl[i] = p.s; });
    ig.setAttribute('inst', new THREE.InstancedBufferAttribute(inst, 4));
    ig.setAttribute('scl', new THREE.InstancedBufferAttribute(scl, 1));
    const attr = new THREE.InstancedBufferAttribute(k, 1);
    attr.setUsage(THREE.DynamicDrawUsage);
    ig.setAttribute('kf', attr);
    const fr = new Float32Array(list.length * 2);
    for (let i = 0; i < list.length; i++) fr.set(far, i * 2);
    ig.setAttribute('far', new THREE.InstancedBufferAttribute(fr, 2));
    const mesh = new THREE.Mesh(ig, this.material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, k, attr };
  }
}

// ---------- grass ----------
// A fixed pattern of blades that wraps around the camera. A texture holds the
// ground height and where grass may grow (not on roads, water or buildings).
export function grassField(scene, { count, size, heightTex, area, sunDir, heightAt }) {
  // anime grass clumps: broad flat blades, pointed, fanning out of one root,
  // a few with a notch on one side, plus short blades curling at the foot
  const blades = [];
  let s = 12345;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // one blade: a long pointed leaf from a root at (rx, rz), leaning out along
  // ang; notch adds a small spike on one side, layer = shade (inner darker)
  // role: 0 main blade, 1 the dark heart, 2 a wisp, 3 a curl at the foot
  // (the far clumps leave out 1-3: too small to see from there)
  const bladeAt = (rx, rz, ang, lean, len, wid, notch, layer, curl = 0, role = 0) => {
    blades.push({ rx, rz, ang, lean, len, wid, notch, layer, curl, role, twist: (r() - 0.5) * 0.6 });
  };
  const build = (list, segs) => {
    const pos = [], tt = [], face = [], lay = [], idx = [];
    for (const { rx, rz, ang, lean, len, wid, notch, layer, curl, twist } of list) {
      const base = pos.length / 3;
      const dx = Math.cos(ang), dz = Math.sin(ang), sx = -dz, sz = dx;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const w = wid * Math.min(1, t * 5 + 0.35) * Math.pow(1 - t, 0.85);
        const out = lean * t * t * len * 0.8 + curl * t * 0.2, y = len * t * (1 - lean * 0.25 * t) * (1 - curl * t * 0.6);
        const cx = rx + dx * out, cz = rz + dz * out;
        const tw = twist * t, ux = sx * Math.cos(tw) - dx * Math.sin(tw), uz = sz * Math.cos(tw) - dz * Math.sin(tw);
        const wl = w * (notch && Math.abs(t - 0.4) < 0.11 ? 2.4 : 1);
        pos.push(cx - ux * wl, y, cz - uz * wl, cx + ux * w, y, cz + uz * w);
        tt.push(t, t); face.push(ang, ang); lay.push(layer, layer);
        if (i < segs) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('bt', new THREE.Float32BufferAttribute(tt, 1));
    g.setAttribute('bface', new THREE.Float32BufferAttribute(face, 1));
    g.setAttribute('blay', new THREE.Float32BufferAttribute(lay, 1));
    g.setIndex(idx);
    return g;
  };
  // a tuft in layers: short dark blades in the heart, a middle ring, long
  // blades fanning out low, thin wisps, and a couple curling on the ground
  const tuft = (cx, cz, sc) => {
    const R = (k) => (r() - 0.5) * k;
    for (let k = 0; k < 6; k++) bladeAt(cx + R(0.08) * sc, cz + R(0.08) * sc, r() * 6.28, 0.12, (0.32 + r() * 0.15) * sc, 0.07 * sc, false, 0.55, 0, 1);
    for (let k = 0; k < 7; k++) bladeAt(cx + R(0.12) * sc, cz + R(0.12) * sc, r() * 6.28, 0.22 + r() * 0.2, (0.65 + r() * 0.3) * sc, 0.09 * sc, r() < 0.3, 0.8);
    for (let k = 0; k < 8; k++) bladeAt(cx + R(0.14) * sc, cz + R(0.14) * sc, (k / 8) * 6.28 + R(0.6), 0.45 + r() * 0.35, (0.85 + r() * 0.4) * sc, 0.1 * sc, r() < 0.4, 1.0);
    for (let k = 0; k < 4; k++) bladeAt(cx + R(0.1) * sc, cz + R(0.1) * sc, r() * 6.28, 0.5 + r() * 0.6, (0.8 + r() * 0.4) * sc, 0.014 * sc, false, 0.9, 0, 2);
    for (let k = 0; k < 2; k++) bladeAt(cx + R(0.2) * sc, cz + R(0.2) * sc, r() * 6.28, 1.6, 0.28 * sc, 0.045 * sc, false, 0.85, 1, 3);
  };
  // a cluster: a big tuft with two or three smaller ones leaning against it
  tuft(0, 0, 1);
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(), d = 0.3 + r() * 0.15; tuft(Math.cos(a) * d, Math.sin(a) * d, 0.55 + r() * 0.3); }
  // three levels of detail: the full clump near the player; past MID the hair-
  // thin wisps and foot curls go and blades bend in 4 segments (about 60% of
  // the triangles); past FAR only the main blades in 3 (about a third)
  const nearG = build(blades, 5), midG = build(blades.filter((b) => b.role < 2), 4), farG = build(blades.filter((b) => b.role === 0), 3);
  const n = Math.round(count / 14);
  const off = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) off.set([r() * size, r() * size, r(), r()], i * 4);
  const uniforms = {
    uTime: wind.uTime, uCam: { value: new THREE.Vector3() }, uSize: { value: size },
    uHeight: { value: heightTex }, uArea: { value: new THREE.Vector4(area.x0, area.z0, area.w, area.d) },
    uSun: { value: sunDir.clone().normalize() },
    fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 off; attribute float bt; attribute float bface; attribute float blay;
      uniform float uTime, uSize; uniform vec3 uCam; uniform sampler2D uHeight; uniform vec4 uArea; uniform vec3 uSun;
      varying float vT; varying vec3 vCol; varying float vFog; varying float vLight;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        // the clump's tile has been moved next to the player (its model matrix)
        vec2 p = off.xy + vec2(modelMatrix[3].x, modelMatrix[3].z);
        vec4 hm = texture2D(uHeight, (p - uArea.xy) / uArea.zw);
        // density + 2 = Route 1's tall grass (terrain.js grassMap)
        float tall = step(1.5, hm.g);
        float dens = hm.g - 2.0 * tall;
        float dist = length(p - uCam.xz);
        // the field's edge: clumps thin out (small ones first) and shrink over
        // the outer half of the radius, all gone before the wrap at uSize / 2
        float fk = smoothstep(uSize * 0.3, uSize * 0.5, dist);
        float keep = step(off.z, dens) * (1.0 - smoothstep(off.w * 0.75, off.w * 0.75 + 0.25, fk)) * (1.0 - fk * 0.35);
        float sc = (0.45 + off.w * 0.35) * (0.6 + dens * 0.6) * keep;
        // no grass here (a path, a roof, the edge of the field): skip the rest
        if (sc <= 0.0) { vT = 0.0; vCol = vec3(0.0); vFog = 0.0; vLight = 0.0; gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        // turn each clump its own way
        float ra = off.z * 40.0, c = cos(ra), s = sin(ra);
        vec3 lp = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c) * sc * vec3(1.0 + tall * 0.35, 1.0 + tall * 1.3, 1.0 + tall * 0.35);
        float t = bt; vT = t;
        float w = sin(uTime * 1.5 + p.x * 0.25 + p.y * 0.18) * 0.5 + sin(uTime * 3.1 + p.x * 0.9) * 0.2;
        lp.x += w * t * t * 0.12 * sc * 3.0; lp.z += w * t * t * 0.05 * sc * 3.0;
        vec3 wp = vec3(p.x, hm.r, p.y) + lp;
        // green root, lime body, pale yellow tips, a little patch variety
        float n = hash(floor(p * 0.3));
        vec3 root = vec3(0.03, 0.2, 0.1), body = mix(vec3(0.2, 0.52, 0.08), vec3(0.26, 0.58, 0.08), n);
        vec3 tip = mix(vec3(0.66, 0.86, 0.16), vec3(0.78, 0.9, 0.24), n);
        tip = mix(tip, vec3(0.42, 0.7, 0.2), tall); body = mix(body, vec3(0.12, 0.42, 0.12), tall);
        vCol = mix(mix(root, body, smoothstep(0.0, 0.35, t)), tip, smoothstep(0.4, 0.85, t)) * mix(vec3(0.55, 0.75, 0.9), vec3(1.0), blay);
        // blades turned to the sun are lit, the rest in cool shade (two bands)
        float fa = bface + ra;
        vec3 nrm = normalize(vec3(cos(fa), 0.7, sin(fa)));
        vLight = mix(0.78, 1.08, step(0.15, dot(nrm, normalize(uSun))));
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying float vT; varying vec3 vCol; varying float vFog; varying float vLight;
      void main(){
        vec3 c = vCol * vLight;
        if (vLight < 0.9) c *= vec3(0.86, 0.95, 1.05);
        c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFog));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // The field is cut into tiles. Each frame every tile is moved to the copy
  // of itself nearest the player (the field repeats every size metres), and
  // three.js skips the tiles outside the camera's view; tiles past the field's
  // round edge are hidden, and farther tiles use lighter clumps (MID, FAR).
  const G = Math.max(4, Math.round(size / 7)), T = size / G;
  const bins = Array.from({ length: G * G }, () => []);
  for (let i = 0; i < n; i++) bins[Math.min(G - 1, Math.floor(off[i * 4] / T)) * G + Math.min(G - 1, Math.floor(off[i * 4 + 1] / T))].push(i);
  const mesh = new THREE.Group(), tiles = [];
  for (let gi = 0; gi < G; gi++) for (let gj = 0; gj < G; gj++) {
    const ids = bins[gi * G + gj]; if (!ids.length) continue;
    const o = new Float32Array(ids.length * 4);
    ids.forEach((id, k) => o.set(off.subarray(id * 4, id * 4 + 4), k * 4));
    const attr = new THREE.InstancedBufferAttribute(o, 4);
    const sphere = new THREE.Sphere(new THREE.Vector3((gi + 0.5) * T, 0, (gj + 0.5) * T), T * 0.75 + 1.5);
    const mk = (base) => {
      const g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'bt', 'bface', 'blay']) g.setAttribute(k, base.attributes[k]);
      g.setIndex(base.index); g.setAttribute('off', attr); g.instanceCount = ids.length; g.boundingSphere = sphere;
      return g;
    };
    const t = { cx: (gi + 0.5) * T, cz: (gj + 0.5) * T, near: mk(nearG), mid: mk(midG), far: mk(farG), sphere, kx: NaN, kz: NaN };
    t.mesh = new THREE.Mesh(t.near, mat);
    t.mesh.matrixAutoUpdate = false; t.mesh.receiveShadow = false;
    mesh.add(t.mesh); tiles.push(t);
  }
  scene.add(mesh);
  const MID = size * 0.15, FAR = size * 0.3, EDGE = size * 0.5;
  function update(cam) {
    uniforms.uCam.value.copy(cam);
    for (const t of tiles) {
      const kx = Math.floor((cam.x - t.cx) / size + 0.5), kz = Math.floor((cam.z - t.cz) / size + 0.5);
      const x = t.cx + kx * size, z = t.cz + kz * size;
      if (kx !== t.kx || kz !== t.kz) {
        t.kx = kx; t.kz = kz;
        t.mesh.matrix.makeTranslation(kx * size, 0, kz * size);
        // the ground's height range under the tile, for the view test
        if (heightAt) {
          let lo = Infinity, hi = -Infinity;
          for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { const h = heightAt(x + a * T * 0.5, z + b * T * 0.5); lo = Math.min(lo, h); hi = Math.max(hi, h); }
          t.sphere.center.y = (lo + hi) / 2 + 0.6;
          t.sphere.radius = Math.hypot(T * 0.71 + 1.2, (hi - lo) / 2 + 1.2);
        }
      }
      // nearest point of the tile to the player
      const dx = Math.max(0, Math.abs(cam.x - x) - T / 2), dz = Math.max(0, Math.abs(cam.z - z) - T / 2), d = Math.hypot(dx, dz);
      t.mesh.visible = d < EDGE;
      const g = d > FAR ? t.far : d > MID ? t.mid : t.near;
      if (t.mesh.geometry !== g) t.mesh.geometry = g;
    }
  }
  return { mesh, uniforms, update, tiles };
}
