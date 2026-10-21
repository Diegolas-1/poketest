// The land around Pallet Town: heights, roads, the pond, the coast and the sea.
// Units are metres; x runs east, z runs south, y is up.
import * as THREE from 'three';

// ---------- noise ----------
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
// seeded random for placing things, so the town looks the same every visit
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---------- layout ----------
export const SEA_Y = -0.7;
export const POND = { x: -22, z: 33, r: 8.5, y: -0.25 };
// roads as polylines [x, z]
export const ROADS = [
  [[0, -150], [0, -60], [0, -30], [0, -8], [0, 30], [0, 46], [-2, 58]],   // north-south through town
  [[-30, -8], [30, -8]],                                                   // in front of the houses
  [[-20, -12.6], [-20, -8]], [[20, -12.6], [20, -8]],                      // to the doors
  [[0, 35], [9.5, 35]],                                                     // to the lab hill's gate
];
const ROAD_W = 1.75;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}
export function roadDist(x, z) {
  let d = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
  return d;
}
// 1 on a road, 0 off it, with a ragged painted edge
export function roadMask(x, z) {
  const d = roadDist(x, z) + (fbm(x * 0.6, z * 0.6, 2) - 0.5) * 0.9;
  return 1 - smooth(ROAD_W - 0.4, ROAD_W + 0.5, d);
}

// The ground height at (x, z).
export function height(x, z) {
  // town sits on a gently rolling plateau
  let h = (fbm(x * 0.03 + 7, z * 0.03 + 3, 3) - 0.5) * 1.2;
  // hills rise beyond the forest ring, except toward the sea
  const r = Math.max(Math.abs(x) / 60, z < 0 ? Math.abs(z) / 50 : 0);
  const hill = smooth(1.0, 2.2, r) * (6 + fbm(x * 0.02, z * 0.02, 4) * 22);
  // the road north runs through a valley between the hills
  const valley = 1 - smooth(6, 26, Math.abs(x + Math.sin(z * 0.02) * 6)) * (z < -50 ? 1 : 0);
  h += hill * (z < -50 ? 1 - valley * 0.85 : 1) * (1 - smooth(30, 55, z));
  // the coast: the land drops below the sea in the south
  const coast = 56 + Math.sin(x * 0.045) * 5 + fbm(x * 0.05, 9, 2) * 5;
  h -= smooth(coast - 8, coast + 10, z) * 5;
  // the pond, and the stream from it to the sea
  const pd = Math.hypot(x - POND.x, z - POND.z);
  h = Math.min(h, h - (1 - smooth(POND.r - 3, POND.r + 1.5, pd)) * 1.8);
  if (z > POND.z) {
    const sx = POND.x + Math.sin((z - POND.z) * 0.12) * 2.5;
    const sd = Math.abs(x - sx);
    h -= (1 - smooth(1.2, 3.2, sd)) * 1.3 * smooth(POND.z, POND.z + 4, z);
  }
  // flatten under the roads and the buildings
  const flat = Math.max(roadMask(x, z) * 0.7, buildingPad(x, z));
  h = h * (1 - flat) + 0.05 * flat;
  // Oak's hill: a round green hill with a flat top for the lab
  const ld = Math.hypot(x - LAB_HILL.x, (z - LAB_HILL.z) * 1.1);
  h = Math.max(h, LAB_HILL.h * (1 - smooth(LAB_HILL.top, LAB_HILL.r, ld)) + (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 0.4 * smooth(LAB_HILL.top, LAB_HILL.top + 2, ld) * (1 - smooth(LAB_HILL.r - 2, LAB_HILL.r, ld)));
  // the stone stairs up the hill: the ground under them rises in steps
  const sd = stairDist(x, z);
  if (sd < 1.6) { const q = Math.round(h / STEP) * STEP; h = q + (h - q) * smooth(1.0, 1.6, sd); }
  return h;
}

export const LAB_HILL = { x: 24, z: 22, h: 6, top: 9, r: 18 };
// the winding stairs from the gate up to the lab, and the step height
export const LAB_STAIRS = [[9.5, 35], [12.2, 34.6], [14.4, 33.2], [15.4, 31.2], [16.6, 29.6], [18.4, 28.6]];
export const STEP = 0.3;
export function stairDist(x, z) {
  let d = 1e9;
  for (let i = 0; i < LAB_STAIRS.length - 1; i++) d = Math.min(d, segDist(x, z, ...LAB_STAIRS[i], ...LAB_STAIRS[i + 1]));
  return d;
}
const PADS = [[-20, -17, 6, 7], [20, -17, 6, 7]];
function buildingPad(x, z) {
  let m = 0;
  for (const [cx, cz, hw, hd] of PADS) {
    const dx = Math.abs(x - cx) - hw, dz = Math.abs(z - cz) - hd;
    m = Math.max(m, 1 - smooth(0, 4, Math.max(dx, dz)));
  }
  return m;
}

export function isWater(x, z) { return height(x, z) < Math.max(SEA_Y, pondLevel(x, z)) - 0.05; }
function pondLevel(x, z) { return Math.hypot(x - POND.x, z - POND.z) < POND.r + 2 ? POND.y : SEA_Y; }

// ---------- colours ----------
const C = (h) => new THREE.Color(h);
const GRASS_A = C('#72c94a'), GRASS_B = C('#9ad655'), GRASS_C = C('#56b04a'), GRASS_DRY = C('#b8d062');
const DIRT = C('#e6c98e'), DIRT_D = C('#cfa86e'), SAND = C('#f1dfb0'), ROCK = C('#9a9a8c'), ROCK_D = C('#77786e');
const MUD = C('#8a7a52');

export function groundColor(x, z, h, slope, out) {
  const n = fbm(x * 0.08, z * 0.08, 3), n2 = fbm(x * 0.4 + 11, z * 0.4, 2);
  out.copy(GRASS_A).lerp(GRASS_B, smooth(0.35, 0.7, n)).lerp(GRASS_C, smooth(0.55, 0.85, n2) * 0.5);
  out.lerp(GRASS_DRY, smooth(0.62, 0.8, fbm(x * 0.02 + 40, z * 0.02, 2)) * 0.35);
  // rock on steep hillsides
  out.lerp(ROCK.clone().lerp(ROCK_D, n2), smooth(0.55, 0.85, slope));
  // roads
  // under the paths: the path meshes draw the dirt; a darker damp green at
  // the edge so the grass under the fringe reads as shade
  const rd = roadDist(x, z);
  if (rd < 2.6) out.lerp(GRASS_C, (1 - smooth(1.6, 2.6, rd)) * 0.5);
  const st = stairDist(x, z);
  if (st < 1.8) out.lerp(DIRT_D, (1 - smooth(1.2, 1.8, st)) * 0.8);
  // muddy banks and beach sand
  const pd = Math.hypot(x - POND.x, z - POND.z);
  out.lerp(MUD, (1 - smooth(POND.r - 1, POND.r + 2.5, pd)) * 0.6);
  out.lerp(SAND, smooth(0.6, -0.2, h) * smooth(40, 52, z));
  return out;
}

// ---------- meshes ----------
export function buildTerrain() {
  const size = 420, seg = 210;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, height(x, z));
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    groundColor(x, z, pos.getY(i), 1 - nrm.getY(i) * 1.0 + 0.0, tmp);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// The sea and the pond: a soft shader with a shoreline glow and slow ripples.
export function buildWater(uTime) {
  const group = new THREE.Group();
  const vert = `
    uniform float uTime; varying vec3 vW;
    void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p,1.0);
      w.y += sin(w.x*0.15 + uTime*0.8)*0.06 + cos(w.z*0.12 + uTime*0.6)*0.06;
      vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const frag = `
    uniform float uTime; uniform vec3 uDeep, uShallow, uFoam; uniform vec3 fogColor; uniform float fogNear, fogFar;
    varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){
      float r = n(vW.xz*0.35 + vec2(uTime*0.15, uTime*0.1)) * 0.6 + n(vW.xz*1.1 - vec2(uTime*0.2, 0.0)) * 0.4;
      float shore = SHORE;
      vec3 c = mix(uDeep, uShallow, shore);
      c = mix(c, uFoam, smoothstep(0.78, 0.95, shore + r*0.25));
      c += vec3(0.08) * smoothstep(0.62, 0.8, r);
      float d = 1.0 / gl_FragCoord.w;
      c = mix(c, fogColor, smoothstep(fogNear, fogFar, d));
      gl_FragColor = vec4(c, 0.92);
      #include <colorspace_fragment>
    }`;
  const mk = (geo, shore, deep, shallow) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uDeep: { value: C(deep) }, uShallow: { value: C(shallow) }, uFoam: { value: C('#f4fbff') },
        fogColor: { value: C('#cfe6f2') }, fogNear: { value: 120 }, fogFar: { value: 330 } },
      vertexShader: vert, fragmentShader: frag.replace('SHORE', shore), transparent: true, fog: false,
    });
    return new THREE.Mesh(geo, mat);
  };
  // the sea: shallow and foamy near the coast line
  const sea = mk(new THREE.PlaneGeometry(900, 500, 90, 50).rotateX(-Math.PI / 2),
    'smoothstep(110.0, 58.0, vW.z + sin(vW.x*0.045)*5.0)', '#2f7fb8', '#6cc9d8');
  sea.position.set(0, SEA_Y, 300);
  group.add(sea);
  // the pond and its stream
  const pond = mk(new THREE.CircleGeometry(POND.r + 2.2, 48).rotateX(-Math.PI / 2),
    `smoothstep(${(POND.r - 3.5).toFixed(1)}, ${(POND.r + 1.5).toFixed(1)}, length(vW.xz - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})))`, '#3f8fb0', '#7fd0cf');
  pond.position.set(POND.x, POND.y, POND.z);
  group.add(pond);
  const streamLen = 30;
  const sg = new THREE.PlaneGeometry(6, streamLen, 4, 30).rotateX(-Math.PI / 2);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const z = sp.getZ(i) + POND.z + streamLen / 2;
    sp.setX(i, sp.getX(i) + POND.x + Math.sin((z - POND.z) * 0.12) * 2.5);
    sp.setZ(i, z);
    sp.setY(i, Math.max(SEA_Y, POND.y - (z - POND.z) * 0.02));
  }
  const stream = mk(sg, '0.6', '#3f8fb0', '#7fd0cf');
  group.add(stream);
  return group;
}

// Paved roads: ribbons of scanned cobblestone laid over the ground, a little
// narrower than the dirt under them so the edges look worn into the grass.
export function buildRoads(material) {
  const geos = [];
  const half = 1.45;
  for (const r of ROADS) {
    const pos = [], uv = [], idx = [];
    let along = 0, n = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const [ax, az] = r[i], [bx, bz] = r[i + 1];
      const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 0.8));
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let k = (i === 0 ? 0 : 1); k <= steps; k++) {
        const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const a = along + len * t;
        for (const s of [-1, 1]) {
          const px = x + nx * half * s, pz = z + nz * half * s;
          pos.push(px, height(px, pz) + 0.035, pz);
          uv.push(s * half, a);
        }
        if (n > 0) { const b = (n - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        n++;
      }
      along += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  const group = new THREE.Group();
  const m = material.clone();
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  for (const g of geos) { const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; group.add(mesh); }
  return group;
}

// Height and grass density over an area, as a float texture for the grass:
// r = ground height, g = how much grass grows there.
export function grassMap(x0, z0, w, d, res) {
  const nx = Math.round(w / res), nz = Math.round(d / res);
  const data = new Float32Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res;
    const h = height(x, z);
    let g = smooth(1.55, 2.0, roadDist(x, z));
    if (isWater(x, z) || (h < 0.15 && z > 40) || buildingPad(x, z) > 0.97) g = 0;
    // patchy: tufts and drifts, open lawn between
    g *= 0.12 + smooth(0.42, 0.68, fbm(x * 0.11 + 3, z * 0.11, 3)) * 0.88;
    const k = (j * nx + i) * 4;
    data[k] = h; data[k + 1] = Math.max(0, Math.min(1, g)); data[k + 3] = 1;
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
