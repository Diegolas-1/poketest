// Anime cumulus: solid clouds made of billowing lobes, cel shaded in flat
// bands (white tops, pale blue-grey, lavender-periwinkle shadow) with crisp
// edges, flat bases, a thin warm rim toward the sun, and a flat tint of the
// horizon haze on the low far ones. One merged mesh, one draw call.
import * as THREE from 'three';
import { rng } from './terrain.js';

const SUN = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();

// a unit lobe, smooth normals; cel bands hide the facets
const LOBE = new THREE.SphereGeometry(1, 22, 14);

// One cumulus: a flat-bottomed heap of lobes. w = width, h = height of the tower.
function cumulus(r, w, h, out) {
  const lobes = [];
  // envelope: a dome with one or two billowing turrets
  const tur = [];
  const nt = 1 + Math.floor(r() * 2.2);
  for (let i = 0; i < nt; i++) tur.push([(r() - 0.5) * w * 0.45, w * (0.16 + r() * 0.1), h * (0.15 + r() * 0.25)]);
  const H = (x) => {
    const u = Math.min(1, Math.abs(x) / (w * 0.5));
    let y = h * 0.62 * Math.pow(1 - u * u, 0.8);
    for (const [tx, tw, th] of tur) y += th * Math.exp(-((x - tx) * (x - tx)) / (tw * tw));
    return y;
  };
  // flat base row
  const n0 = 4 + Math.floor(w / 32);
  for (let i = 0; i < n0; i++) {
    const t = i / (n0 - 1), x = (t - 0.5) * w * 0.92 + (r() - 0.5) * 6;
    const rad = w * (0.09 + r() * 0.04) * (0.75 + 0.5 * (1 - Math.abs(t - 0.5) * 2));
    lobes.push([x, rad * 0.5, (r() - 0.5) * w * 0.25, rad]);
  }
  // crown lobes along the envelope (these make the silhouette)
  const nc = 7 + Math.floor(w / 22);
  for (let i = 0; i < nc; i++) {
    const x = (r() - 0.5) * w * 0.9, top = H(x);
    const rad = w * (0.09 + r() * 0.07) * (0.7 + 0.5 * Math.min(1, top / h));
    const y = Math.max(rad * 0.5, top - rad * 0.9);
    lobes.push([x, y, (r() - 0.5) * w * 0.22, rad]);
    if (y > rad * 1.2) lobes.push([x * 0.9, y * 0.5, (r() - 0.5) * w * 0.12, rad * 1.25]); // body under it
  }
  // filler inside so no gaps show
  const nf = 5 + Math.floor(w / 25);
  for (let i = 0; i < nf; i++) {
    const x = (r() - 0.5) * w * 0.7, top = H(x);
    const rad = w * (0.12 + r() * 0.06);
    lobes.push([x, Math.max(rad * 0.5, top * (0.3 + r() * 0.4)), (r() - 0.5) * w * 0.12, rad]);
  }
  for (const L of lobes) out.push({ c: L, top: h * 0.95 + w * 0.08, sx: 1, sy: 0.92, sz: 1 });
}

// A high stratus streak: a row of long flattened lenses.
function streak(r, w, out) {
  const n = 3 + Math.floor(r() * 3);
  let x = -w / 2;
  for (let i = 0; i < n; i++) {
    const len = w / n * (1.4 + r() * 0.6), th = 2 + r() * 2.5;
    out.push({ c: [x + len / 2, (r() - 0.5) * 6, (r() - 0.5) * 10, 1], top: 10, sx: len / 2, sy: th, sz: 5 + r() * 5, flat: true });
    x += w / n * (0.8 + r() * 0.2);
  }
}

function place(lobes, P, yaw, base) {
  // returns arrays for one cloud placed at world P, turned by yaw
  const pos = [], nor = [], hgt = [], idx = [];
  const lp = LOBE.attributes.position, ln = LOBE.attributes.normal, li = LOBE.index.array;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (const L of lobes) {
    const [x0, y0, z0, rad] = L.c;
    const off = pos.length / 3;
    for (let i = 0; i < lp.count; i++) {
      v.set(lp.getX(i) * rad * L.sx, lp.getY(i) * rad * L.sy, lp.getZ(i) * rad * L.sz);
      nn.set(ln.getX(i) / L.sx, ln.getY(i) / L.sy, ln.getZ(i) / L.sz).normalize();
      let y = y0 + v.y;
      if (!L.flat && y < 0) { // flat base: squash what hangs below it
        y = y * 0.12;
        nn.set(nn.x * 0.3, -1, nn.z * 0.3).normalize();
      }
      const lx = x0 + v.x, lz = z0 + v.z;
      pos.push(P.x + lx * cy - lz * sy, P.y + y, P.z + lx * sy + lz * cy);
      nor.push(nn.x * cy - nn.z * sy, nn.y, nn.x * sy + nn.z * cy);
      hgt.push(L.flat ? 1.15 + 0.25 * nn.y : Math.max(0, Math.min(1, y / L.top)));
    }
    for (let i = 0; i < li.length; i++) idx.push(li[i] + off);
  }
  return { pos, nor, hgt, idx };
}

export function buildClouds() {
  const r = rng(4242);
  const parts = [];
  const add = (lobes, P, extra = {}) => {
    const p = place(lobes, P, r() * Math.PI * 2);
    p.far = extra.far || 0;
    parts.push(p);
  };
  // big cumulus around the town, bases just above the far ridges
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.35;
    const d = 560 + r() * 180;
    const w = 130 + r() * 130, h = w * (0.32 + r() * 0.3);
    const lobes = []; cumulus(r, w, h, lobes);
    add(lobes, new THREE.Vector3(Math.cos(a) * d, 150 + r() * 110, Math.sin(a) * d));
  }
  // small far cumulus low on the horizon, peeking over the mountains
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = 700 + r() * 70;
    const w = 40 + r() * 60, h = w * (0.25 + r() * 0.3);
    const lobes = []; cumulus(r, w, h, lobes);
    add(lobes, new THREE.Vector3(Math.cos(a) * d, 95 + r() * 80, Math.sin(a) * d), { far: 1 });
  }
  // high streaky stratus
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = 760 + r() * 60;
    const lobes = []; streak(r, 160 + r() * 200, lobes);
    // lay the streak across the line of sight so it reads long
    const P = new THREE.Vector3(Math.cos(a) * d, 340 + r() * 140, Math.sin(a) * d);
    const p = place(lobes, P, a + Math.PI / 2 + (r() - 0.5) * 0.3);
    p.far = 0.4; parts.push(p);
  }
  // merge
  const pos = [], nor = [], hgt = [], far = [], idx = [];
  for (const p of parts) {
    const off = pos.length / 3;
    pos.push(...p.pos); nor.push(...p.nor); hgt.push(...p.hgt);
    for (let i = 0; i < p.hgt.length; i++) far.push(p.far);
    for (const i of p.idx) idx.push(i + off);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('ch', new THREE.Float32BufferAttribute(hgt, 1));
  g.setAttribute('cf', new THREE.Float32BufferAttribute(far, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();

  const col = (h) => new THREE.Color(h);
  const m = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uSun: { value: SUN.clone() },
      uLit: { value: col('#ffffff') },
      uMid: { value: col('#e3e8f6') },
      uShd: { value: col('#b4b8e2') },
      uDeep: { value: col('#9ba3d8') },
      uRim: { value: col('#fff2d6') },
      uHaze: { value: col('#cfe6f2') },
    },
    vertexShader: `
      attribute float ch; attribute float cf;
      varying vec3 vN; varying vec3 vW; varying float vH; varying float vF;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vH = ch; vF = cf;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uSun, uLit, uMid, uShd, uDeep, uRim, uHaze;
      varying vec3 vN; varying vec3 vW; varying float vH; varying float vF;
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        // light leans upward so tops stay white even on the far side of the sun
        vec3 L = normalize(vec3(uSun.x * 0.6, 1.0, uSun.z * 0.6));
        float l = dot(N, L) * 0.36 + (vH - 0.4) * 1.2;
        float e = 0.012; // crisp band edges
        vec3 c = uDeep;
        c = mix(c, uShd, smoothstep(-0.56 - e, -0.56 + e, l));
        c = mix(c, uMid, smoothstep(-0.24 - e, -0.24 + e, l));
        c = mix(c, uLit, smoothstep(-0.03 - e, -0.03 + e, l));
        // thin warm rim on the silhouette toward the sun
        float fr = 1.0 - max(dot(N, V), 0.0);
        float sunSide = dot(N, normalize(uSun));
        float rim = smoothstep(0.86 - e, 0.86 + e, fr) * smoothstep(0.15, 0.2, sunSide);
        c = mix(c, uRim, rim * 0.9);
        // flat haze tint low on the horizon and for the far ones
        float elev = normalize(vW - cameraPosition).y;
        float hz = (1.0 - smoothstep(0.03, 0.26, elev)) * (0.35 + 0.4 * vF) + vF * 0.12;
        c = mix(c, uHaze, clamp(hz, 0.0, 0.75));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -5; // after the sky dome, before the mountains; depth sorts the rest
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.tick = (dt) => { group.rotation.y += dt * 0.003; };
  return group;
}
