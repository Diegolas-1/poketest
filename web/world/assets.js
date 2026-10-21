// Real plants and props: loads the CC0 scans in assets/, scatters them in
// culled chunks with wind, swaps far trees for billboards rendered from the
// real model, and grows a dense field of grass blades around the player.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

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

// ---------- scattering in chunks ----------
// points: [{x, y, z, rot, s}]. Each chunk is its own InstancedMesh so the
// camera culls what is off screen; chunks beyond maxDist are hidden.
export class Scatter {
  constructor(scene, model, points, { chunk = 24, maxDist = 90, wind: w = 0.06, shadows = true, impostor = null } = {}) {
    this.chunks = [];
    this.maxDist = maxDist;
    this.impostor = impostor;
    const groups = new Map();
    for (const p of points) {
      const k = `${Math.floor(p.x / chunk)},${Math.floor(p.z / chunk)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const mats = model.parts.map((part) => (w > 0 ? windy(part.material, model.height, w) : part.material));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (const list of groups.values()) {
      const c = { center: new THREE.Vector3(), meshes: [], list };
      for (const p of list) c.center.add(t.set(p.x, p.y, p.z));
      c.center.divideScalar(list.length);
      model.parts.forEach((part, i) => {
        const im = new THREE.InstancedMesh(part.geometry, mats[i], list.length);
        list.forEach((p, j) => {
          q.setFromAxisAngle(up, p.rot);
          m4.compose(t.set(p.x, p.y, p.z), q, s.set(p.s, p.s * (p.sy || 1), p.s));
          im.setMatrixAt(j, m4);
        });
        im.computeBoundingSphere();
        im.castShadow = shadows; im.receiveShadow = true;
        scene.add(im);
        c.meshes.push(im);
      });
      if (impostor) c.billboards = impostor.make(scene, list);
      this.chunks.push(c);
    }
  }
  // near chunks show the model, far ones the billboard (or nothing)
  update(cam) {
    for (const c of this.chunks) {
      const d = c.center.distanceTo(cam);
      const near = d < this.maxDist;
      for (const m of c.meshes) m.visible = near;
      if (c.billboards) c.billboards.visible = !near && d < 600;
    }
  }
}

// ---------- tree billboards ----------
// Renders the real model from 8 directions into one texture; far trees are
// quads that pick the view nearest to the camera's.
export class Impostor {
  constructor(renderer, model, lights) {
    const views = 8, size = 256;
    const aspect = (model.height * 1.05) / (model.radius * 2.1);
    const w = size, h = Math.round(size * aspect);
    this.rt = new THREE.WebGLRenderTarget(w * views, h, { colorSpace: THREE.SRGBColorSpace });
    this.views = views;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#e8f4ff', '#6a7a4a', 1.4));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(-1, 2, 1.2); scene.add(sun);
    const g = new THREE.Group();
    for (const p of model.parts) g.add(new THREE.Mesh(p.geometry, p.material));
    scene.add(g);
    const r = model.radius * 1.05, top = model.height * 1.05;
    const cam = new THREE.OrthographicCamera(-r, r, top, 0, -100, 100);
    const old = renderer.getRenderTarget(), oldClear = renderer.getClearAlpha();
    const oldColor = renderer.getClearColor(new THREE.Color()), oldVp = renderer.getViewport(new THREE.Vector4());
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    for (let i = 0; i < views; i++) {
      const a = (i / views) * Math.PI * 2;
      cam.position.set(Math.sin(a) * 10, 0, Math.cos(a) * 10);
      cam.lookAt(0, 0, 0);
      renderer.setViewport(i * w, 0, w, h);
      renderer.setScissor(i * w, 0, w, h); renderer.setScissorTest(true);
      renderer.render(scene, cam);
    }
    renderer.setScissorTest(false);
    renderer.setRenderTarget(old);
    renderer.setClearColor(oldColor, oldClear);
    renderer.setViewport(oldVp);
    this.width = r * 2; this.height = top;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, views: { value: views },
        fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: `
        attribute vec4 inst; attribute float scl; uniform float views; varying vec2 vUv; varying float vFog;
        void main(){
          vec3 c = inst.xyz; float rot = inst.w;
          vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          vec3 p = c + (right * position.x + vec3(0.0, position.y, 0.0)) * scl;
          float ang = atan(toCam.x, toCam.z) - rot;
          float f = mod(floor(ang / 6.2831853 * views + 0.5), views);
          vUv = vec2((f + uv.x) / views, uv.y);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFog = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear, fogFar; varying vec2 vUv; varying float vFog;
        void main(){
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.5) discard;
          c.rgb = mix(c.rgb, fogColor, smoothstep(fogNear, fogFar, vFog));
          gl_FragColor = vec4(c.rgb, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }
  make(scene, list) {
    const g = new THREE.PlaneGeometry(this.width, this.height);
    g.translate(0, this.height / 2, 0);
    const ig = new THREE.InstancedBufferGeometry().copy(g);
    ig.instanceCount = list.length;
    const inst = new Float32Array(list.length * 4), scl = new Float32Array(list.length);
    list.forEach((p, i) => { inst.set([p.x, p.y, p.z, p.rot], i * 4); scl[i] = p.s; });
    ig.setAttribute('inst', new THREE.InstancedBufferAttribute(inst, 4));
    ig.setAttribute('scl', new THREE.InstancedBufferAttribute(scl, 1));
    const mesh = new THREE.Mesh(ig, this.material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
}

// ---------- grass ----------
// A fixed pattern of blades that wraps around the camera. A texture holds the
// ground height and where grass may grow (not on roads, water or buildings).
export function grassField(scene, { count, size, heightTex, area, sunDir }) {
  // one curved blade, 4 segments
  const segs = 4, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.05 * (1 - t * 0.9);
    pos.push(-w, t, 0, w, t, 0); uv.push(0, t, 1, t);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const blade = new THREE.InstancedBufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  blade.setIndex(idx);
  const off = new Float32Array(count * 4);
  let s = 12345;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) off.set([r() * size, r() * size, r(), r()], i * 4);
  blade.setAttribute('off', new THREE.InstancedBufferAttribute(off, 4));
  blade.instanceCount = count;
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
      attribute vec4 off; uniform float uTime, uSize; uniform vec3 uCam; uniform sampler2D uHeight; uniform vec4 uArea;
      varying float vT; varying vec3 vCol; varying float vFog; varying float vLight;
      uniform vec3 uSun;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        // wrap the pattern around the camera
        vec2 p = off.xy;
        p += floor((uCam.xz - p) / uSize + 0.5) * uSize;
        vec2 huv = (p - uArea.xy) / uArea.zw;
        vec4 hm = texture2D(uHeight, huv);
        float dens = hm.g;
        float dist = length(p - uCam.xz);
        float keep = step(off.z, dens) * smoothstep(uSize * 0.5, uSize * 0.36, dist);
        float h = (0.12 + off.w * 0.22) * (0.5 + dens * 0.7) * keep;
        float t = position.y; vT = t;
        float ang = off.z * 40.0;
        vec2 dir = vec2(cos(ang), sin(ang));
        float w = sin(uTime * 1.6 + p.x * 0.25 + p.y * 0.18) * 0.5 + sin(uTime * 3.3 + p.x * 0.9) * 0.2 + 0.25;
        float bend = (0.25 + off.w * 0.35 + w * 0.45) * t * t;
        vec3 wp = vec3(p.x, hm.r, p.y);
        wp.xz += dir * position.x * (keep > 0.0 ? 1.0 : 0.0);
        wp.y += t * h;
        wp.x += bend * h * 0.9; wp.z += bend * h * 0.4;
        // colour: dark roots, sunlit tips, a little variety in each patch
        float n = hash(floor(p * 0.25));
        // anime grass: bright lime, yellow-green tips, cool teal at the roots
        vec3 base = mix(vec3(0.10, 0.36, 0.20), vec3(0.14, 0.42, 0.14), n);
        vec3 tip = mix(vec3(0.42, 0.78, 0.16), vec3(0.62, 0.86, 0.22), hash(floor(p * 0.6)) * 0.7);
        vCol = mix(base, tip, smoothstep(0.05, 0.8, t));
        vLight = 0.8 + 0.25 * step(0.35, dot(normalize(vec3(dir.y, 0.6, -dir.x)), normalize(uSun)));
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying float vT; varying vec3 vCol; varying float vFog; varying float vLight;
      void main(){
        vec3 c = vCol * vLight;
        c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFog));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(blade, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return { mesh, uniforms };
}
