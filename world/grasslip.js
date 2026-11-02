// Grass lips: where turf rolls over an edge (a stream's cut bank, the top of a
// retaining wall or a cliff, a Route 1 ledge) the grass does not stop at a
// line: fluffy rounded clusters of the field's own grass (assets.js
// grassBlades: the very blades, colours and wind the player knows) crowd the
// brim, fan outward and droop over it, a few longer tufts hang down the face,
// and they thin out behind the brim into the field and down the face. No ink
// line on them (they are not in the town group, and the native game draws them
// without its hull or leaf ink).
//
// lipAlong(samples, o) is the reusable builder: an edge as samples about
// 0.25-0.5 m apart, each { x, y, z, nx, nz [, k] } = a point on the brim (y the
// turf's top there), the way out over the edge (unit, horizontal), and how
// strong the lip is there (k 0..1, ends fade); o.face(sample, depth) -> [x, y,
// z] | null finds the face under the brim (for the tufts hanging down it), and
// o.seed keeps it the same every load. It adds clusters to LIPS.
//
// A cluster is 8 floats: x y z (its root), ox oz (out over the edge), droop
// (0 upright .. 2 hanging straight down at the tips), scale, stretch (blade
// length). The bake (tools/native/bake.mjs) writes them as lips.bin; the native
// game draws them with native/grass_lip.gd and shaders/grass_lip.gdshader, the
// web with buildLips() here (same bend, same colours).
import * as THREE from 'three';
import { grassBlades, grassClumpGeometry, wind } from './assets.js';
import { rng } from './terrain.js';

export const LIPS = [];
export const LIP_STRIDE = 8;
const add = (x, y, z, ox, oz, droop, scale, stretch) => LIPS.push(x, y, z, ox, oz, droop, scale, stretch);

export function lipAlong(samples, o = {}) {
  if (samples.length < 2) return 0;
  const R = rng(o.seed || 1), dens = o.density ?? 1, hang = o.hang ?? 1, back = o.back ?? 1;
  const n0 = LIPS.length;
  // walk the edge by arc length, a cluster every ~0.3 m
  const cum = [0];
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z));
  const L = cum[cum.length - 1];
  let j = 0;
  const at = (u) => {
    while (j < samples.length - 2 && cum[j + 1] < u) j++;
    while (j > 0 && cum[j] > u) j--;
    const a = samples[j], b = samples[j + 1], t = Math.min(1, Math.max(0, (u - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])));
    const nx = a.nx + (b.nx - a.nx) * t, nz = a.nz + (b.nz - a.nz) * t, l = Math.hypot(nx, nz) || 1;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, nx: nx / l, nz: nz / l, k: (a.k ?? 1) + ((b.k ?? 1) - (a.k ?? 1)) * t, src: t < 0.5 ? a : b };
  };
  for (let u = R() * 0.2; u < L; u += (0.24 + R() * 0.14) / dens) {
    const s = at(u), k = s.k;
    if (k < 0.08 || R() > 0.35 + k * 0.75) continue;
    const tx = -s.nz, tz = s.nx, jit = (R() - 0.5) * 0.12;
    const P = (out, dy = 0) => [s.x + s.nx * out + tx * jit, s.y + dy, s.z + s.nz * out + tz * jit];
    // the brim: rounded clusters on the curl of the sod, fanning out and over
    { const [x, y, z] = P(-0.02 + R() * 0.07, -0.02 - R() * 0.03); add(x, y, z, s.nx, s.nz, (0.8 + R() * 0.45) * (0.55 + 0.45 * k), (0.48 + R() * 0.3) * (0.6 + 0.4 * k), 0.95 + R() * 0.3); }
    // longer tufts hanging down over the face
    if (R() < 0.34 * hang * k) { const [x, y, z] = P(0.04 + R() * 0.05, -0.05 - R() * 0.04); add(x, y, z, s.nx + (R() - 0.5) * 0.3, s.nz + (R() - 0.5) * 0.3, 1.5 + R() * 0.4, 0.38 + R() * 0.14, 1.3 + R() * 0.6); }
    // the crown behind the brim: fluffy, nearly upright, thinning into the field
    if (R() < 0.85 * back) { const d = 0.22 + R() * 0.3; const [x, y, z] = P(-d, -0.01); add(x, y, z, s.nx, s.nz, 0.25 + R() * 0.35, (0.55 + R() * 0.3) * (0.7 + 0.3 * k), 0.9 + R() * 0.25); }
    if (R() < 0.4 * back * k) { const d = 0.6 + R() * 0.45; const [x, y, z] = P(-d, -0.02); add(x, y, z, s.nx, s.nz, 0.08 + R() * 0.15, 0.5 + R() * 0.3, 0.9 + R() * 0.2); }
    // a few small ones lower down the face, in its cracks (thinning downward)
    if (o.face && R() < (o.faceRate ?? 0.22) * k) {
      const dep = 0.15 + Math.pow(R(), 1.6) * (o.faceMax ?? 0.8);
      const fp = o.face(s.src, dep);
      if (fp) add(fp[0] - s.nx * 0.02 + tx * jit, fp[1], fp[2] - s.nz * 0.02 + tz * jit, s.nx, s.nz, 1.2 + R() * 0.5, 0.22 + R() * 0.12 * (1 - dep), 1.1 + R() * 0.5);
    }
  }
  return (LIPS.length - n0) / LIP_STRIDE;
}

// ---------- the web's lips: one InstancedMesh-like draw per 40 m cell ----------
const LIP_VS = `
  attribute float bt; attribute float bface; attribute float blay;
  attribute vec4 lipA; attribute vec4 lipB;   // x y z droop | ox oz scale stretch
  uniform float uTime; uniform vec3 uSun;
  varying vec3 vCol; varying float vLight; varying float vFog;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 root = lipA.xyz; float droop = lipA.w;
    vec2 o = normalize(lipB.xy + 1e-5); float sc = lipB.z, st = lipB.w;
    float rnd = hash(root.xz * 3.1);
    // the clump turned its own way, its blades stretched
    float ra = rnd * 40.0, c = cos(ra), s = sin(ra);
    vec3 lp = vec3(position.x * c - position.z * s, position.y * st, position.x * s + position.z * c) * sc * vec3(1.12, 1.0, 1.12);
    float t = bt;
    // bent over the edge (+x = out): more toward the tips and for the blades
    // already leaning out; the ones leaning back lie on the crown
    float h = max(lp.y, 0.0);
    float ow = lp.x / max(length(lp.xz), 0.02);
    float a = droop * pow(t, 1.15) * 1.25 * (0.62 + 0.38 * ow);
    float ca = cos(a), sa = sin(a);
    lp = vec3(lp.x * ca + h * sa, -lp.x * sa + h * ca, lp.z);
    // wind (the field's own), a little more on what hangs free
    float w = sin(uTime * 1.5 + root.x * 0.25 + root.z * 0.18) * 0.5 + sin(uTime * 3.1 + root.x * 0.9) * 0.2;
    float free = 1.0 + max(0.0, -ca) * 0.8;
    lp.x += w * t * t * 0.12 * sc * 3.0 * free; lp.z += w * t * t * 0.05 * sc * 3.0 * free;
    vec3 wp = root + vec3(o.x * lp.x - o.y * lp.z, lp.y, o.y * lp.x + o.x * lp.z);
    float n = hash(floor(root.xz * 0.3));
    vec3 cr = vec3(0.03, 0.2, 0.1), body = mix(vec3(0.2, 0.52, 0.08), vec3(0.26, 0.58, 0.08), n);
    vec3 tip = mix(vec3(0.66, 0.86, 0.16), vec3(0.78, 0.9, 0.24), n);
    vCol = mix(mix(cr, body, smoothstep(0.0, 0.35, t)), tip, smoothstep(0.4, 0.85, t)) * mix(vec3(0.55, 0.75, 0.9), vec3(1.0), blay);
    float fa = bface + ra + atan(o.y, o.x);
    vec3 nrm = normalize(vec3(cos(fa), 0.7, sin(fa)));
    // what hangs below the brim is in the turf's shade
    vLight = mix(0.78, 1.08, step(0.15, dot(nrm, normalize(uSun))) * step(-0.15, ca));
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vFog = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const LIP_FS = `
  uniform vec3 fogColor; uniform float fogNear, fogFar;
  varying vec3 vCol; varying float vLight; varying float vFog;
  void main(){
    vec3 c = vCol * vLight;
    if (vLight < 0.9) c *= vec3(0.86, 0.95, 1.05);
    c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFog));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export const LIP_RANGES = [14, 30, 60];   // m: full clumps, lighter, lightest, then none
export function buildLips(scene, { sunDir }) {
  let s = 12345;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blades = grassBlades(r);
  const geos = [grassClumpGeometry(blades.filter((b) => b.role < 2), 4), grassClumpGeometry(blades.filter((b) => b.role === 0), 2), grassClumpGeometry(blades.filter((b) => b.role === 0), 1)];
  const uniforms = { uTime: wind.uTime, uSun: { value: sunDir.clone().normalize() }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: LIP_VS, fragmentShader: LIP_FS, side: THREE.DoubleSide });
  const cells = new Map(), N = LIPS.length / LIP_STRIDE;
  for (let i = 0; i < N; i++) {
    const k = Math.floor(LIPS[i * LIP_STRIDE] / 40) + ',' + Math.floor(LIPS[i * LIP_STRIDE + 2] / 40);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  }
  const G = new THREE.Group(); G.name = 'grass_lips'; G.userData.outline = false;
  const list = [];
  for (const ids of cells.values()) {
    const A = new Float32Array(ids.length * 4), B = new Float32Array(ids.length * 4), box = new THREE.Box3();
    ids.forEach((id, q) => {
      const o = id * LIP_STRIDE;
      A.set([LIPS[o], LIPS[o + 1], LIPS[o + 2], LIPS[o + 5]], q * 4); B.set([LIPS[o + 3], LIPS[o + 4], LIPS[o + 6], LIPS[o + 7]], q * 4);
      box.expandByPoint(new THREE.Vector3(LIPS[o], LIPS[o + 1], LIPS[o + 2]));
    });
    box.expandByScalar(1.4);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const a = new THREE.InstancedBufferAttribute(A, 4), b = new THREE.InstancedBufferAttribute(B, 4);
    const lods = geos.map((base) => {
      const g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'bt', 'bface', 'blay']) g.setAttribute(k, base.attributes[k]);
      g.setIndex(base.index); g.setAttribute('lipA', a); g.setAttribute('lipB', b); g.instanceCount = ids.length; g.boundingSphere = sphere;
      return g;
    });
    const m = new THREE.Mesh(lods[0], mat);
    m.frustumCulled = true; m.userData.outline = false; m.raycast = () => {};
    G.add(m); list.push({ m, lods, sphere });
  }
  scene.add(G);
  return {
    group: G, uniforms,
    update(cam) {
      for (const c of list) {
        const d = Math.max(0, c.sphere.center.distanceTo(cam) - c.sphere.radius);
        c.m.visible = d < LIP_RANGES[2];
        const g = d > LIP_RANGES[1] ? c.lods[2] : d > LIP_RANGES[0] ? c.lods[1] : c.lods[0];
        if (c.m.geometry !== g) c.m.geometry = g;
      }
    },
  };
}
