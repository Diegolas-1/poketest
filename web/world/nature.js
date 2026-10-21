// Sky, clouds, mountains, trees, grass, tall grass, flowers and rocks.
import * as THREE from 'three';
import { height, roadMask, isWater, fbm, rng, SEA_Y, POND } from './terrain.js';

const C = (h) => new THREE.Color(h);

// Joins non-indexed geometries that share position / normal / color.
export function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
// Paints a geometry one colour (or a vertical gradient from bottom to top colour).
export function tint(g, bottom, top = bottom, y0 = null, y1 = null) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  g.computeBoundingBox();
  const lo = y0 ?? g.boundingBox.min.y, hi = y1 ?? g.boundingBox.max.y;
  const a = C(bottom), b = C(top), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, (p.getY(i) - lo) / (hi - lo || 1)));
    t.copy(a).lerp(b, k);
    c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Adds a gentle wind sway to a material (tips move, roots stay).
function windy(mat, uTime, amount, top) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float k = clamp(position.y / ${top.toFixed(2)}, 0.0, 1.0); k = k * k;
      float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.22) * 0.6 + sin(uTime * 3.1 + ip.x * 1.3) * 0.25;
      transformed.x += w * ${amount.toFixed(3)} * k;
      transformed.z += w * ${(amount * 0.5).toFixed(3)} * k;`);
  };
  return mat;
}

// ---------- sky ----------
export function buildSky(sunDir) {
  const g = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 uSun; varying vec3 vD;
      void main(){
        float y = vD.y;
        vec3 top = vec3(0.07, 0.30, 0.82), mid = vec3(0.28, 0.60, 0.95), hor = vec3(0.80, 0.92, 0.96);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y));
        c = mix(c, top, smoothstep(0.12, 0.6, y));
        float s = max(dot(vD, uSun), 0.0);
        c += vec3(1.0, 0.92, 0.7) * pow(s, 64.0) * 0.8 + vec3(1.0, 0.85, 0.6) * pow(s, 6.0) * 0.18;
        c = mix(c, vec3(0.86, 0.9, 0.86), smoothstep(0.0, -0.2, y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(g, m);
  sky.renderOrder = -10;
  return sky;
}

// Soft painted clouds, drifting slowly.
export function buildClouds() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * 176, y = 60 + (r() - 0.5) * 30 - Math.abs(x - 128) * 0.15, rad = 18 + r() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(250,252,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  // a little shade on the underside
  const sh = ctx.createLinearGradient(0, 50, 0, 110);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(120,140,170,0.35)');
  ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = sh; ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const rr = rng(21);
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
    const a = rr() * Math.PI * 2, d = 160 + rr() * 380;
    s.position.set(Math.cos(a) * d, 70 + rr() * 60, Math.sin(a) * d);
    const k = 60 + rr() * 90; s.scale.set(k, k * 0.5, 1);
    group.add(s);
  }
  group.userData.tick = (dt) => { group.rotation.y += dt * 0.004; };
  return group;
}

// Distant mountains in the haze, all round except the open sea.
export function buildMountains(sunDir = new THREE.Vector3(-0.55, 0.75, 0.45)) {
  // Painted ranges as in the anime: rounded blue ridges, cel lit, streaked
  // with vertical brush marks, melting into pale haze at the foot.
  const group = new THREE.Group();
  const layer = (d, depth, hMin, hMax, seed, far) => {
    const r = rng(seed), N = 360, rows = 12;
    const ph = [r() * 9, r() * 9, r() * 9];
    const pos = [], hv = [], av = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI * 0.97 + (i / N) * Math.PI * 1.94 - Math.PI / 2;
      const t = i / N * 40;
      let h = 0.5 + 0.28 * Math.sin(t * 0.55 + ph[0]) + 0.16 * Math.sin(t * 1.3 + ph[1]) + 0.07 * Math.sin(t * 3.1 + ph[2]) + 0.03 * Math.sin(t * 7.7);
      h = hMin + (hMax - hMin) * Math.pow(Math.max(0, h), 1.3);
      for (let j = 0; j <= rows; j++) {
        const k = j / rows, rr = d + (1 - Math.cos(k * Math.PI / 2)) * depth;
        const y = -20 + (h + 20) * Math.sin(k * Math.PI / 2);
        pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); hv.push(k); av.push(i / N);
      }
      if (i > 0) for (let j = 0; j < rows; j++) { const p0 = (i - 1) * (rows + 1) + j, p1 = i * (rows + 1) + j; idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('h', new THREE.Float32BufferAttribute(hv, 1));
    g.setAttribute('ang', new THREE.Float32BufferAttribute(av, 1));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.ShaderMaterial({
      uniforms: { sun: { value: sunDir.clone().normalize() }, far: { value: far } },
      vertexShader: `attribute float h; attribute float ang; varying float vH; varying float vA; varying vec3 vN;
        void main(){ vH = h; vA = ang; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 sun; uniform float far; varying float vH; varying float vA; varying vec3 vN;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float l = dot(normalize(vN), normalize(sun));
          vec3 lit = mix(vec3(0.36, 0.72, 0.86), vec3(0.62, 0.84, 0.92), far);
          vec3 shd = mix(vec3(0.17, 0.42, 0.63), vec3(0.42, 0.66, 0.82), far);
          vec3 c = mix(shd, lit, smoothstep(0.08, 0.16, l));
          // vertical brush strokes: dashes of darker blue, denser in shade
          float col = floor(vA * 1400.0);
          float row = floor(vH * 9.0 + hash(vec2(col, 1.0)) * 3.0);
          float dash = step(0.55 - (1.0 - smoothstep(0.0, 0.2, l)) * 0.25, hash(vec2(col, row)));
          c = mix(c, c * vec3(0.72, 0.8, 0.9), dash * 0.6 * (1.0 - far * 0.6));
          // haze at the foot
          vec3 haze = vec3(0.78, 0.9, 0.93);
          c = mix(haze, c, smoothstep(0.0, 0.55, vH) * (1.0 - far * 0.35));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -1;
    group.add(mesh);
  };
  layer(470, 40, 70, 160, 7, 1);
  layer(340, 30, 30, 95, 3, 0);
  return group;
}

// ---------- trees ----------
function broadleaf(seed) {
  const r = rng(seed), parts = [];
  parts.push(tint(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7).translate(0, 1.6, 0), '#6b4a30', '#8a6440'));
  const greens = [['#3f7f3a', '#7cbf55'], ['#4a8a3c', '#8fcf63'], ['#386f36', '#6fb04e']];
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.9 + r() * 0.7, s = i === 0 ? 2.0 : 1.2 + r() * 0.7;
    const g = new THREE.IcosahedronGeometry(s, 1);
    const [lo, hi] = greens[i % 3];
    g.scale(1, 0.85, 1).translate(Math.cos(a) * d, 3.6 + (i === 0 ? 0.6 : r() * 1.4), Math.sin(a) * d);
    parts.push(tint(g, lo, hi));
  }
  return merge(parts);
}
function pine(seed) {
  const r = rng(seed), parts = [];
  parts.push(tint(new THREE.CylinderGeometry(0.18, 0.32, 2.4, 6).translate(0, 1.2, 0), '#5e4128', '#7a5636'));
  let y = 1.6;
  for (let i = 0; i < 4; i++) {
    const w = 2.4 - i * 0.45, h = 2.2 - i * 0.2;
    parts.push(tint(new THREE.ConeGeometry(w, h, 8).translate(0, y + h / 2, 0), '#2e5f3a', '#5f9b5a'));
    y += h * 0.55;
  }
  return merge(parts);
}

export function buildTrees(blocked, colliders) {
  const spots = [];
  const r = rng(1234);
  const ok = (x, z, gap = 3.2) => {
    if (blocked(x, z, 3)) return false;
    if (roadMask(x, z) > 0.05 || isWater(x, z) || height(x, z) < 0.1) return false;
    for (const s of spots) if ((s[0] - x) ** 2 + (s[1] - z) ** 2 < gap * gap) return false;
    return true;
  };
  // the forest ring around the town (open to the north road and the sea)
  for (let i = 0; i < 2600 && spots.length < 520; i++) {
    const x = (r() - 0.5) * 300, z = -190 + r() * 250;
    const inTown = Math.abs(x) < 46 && z > -38 && z < 46;
    if (inTown) continue;
    const ring = Math.abs(x) < 64 && z > -52 && z < 50;
    const keep = ring ? 0.95 : 0.35 + fbm(x * 0.03, z * 0.03, 2) * 0.5;
    if (r() > keep) continue;
    if (Math.abs(x) < 9 && z < -36) continue;   // keep the road north open
    if (z > 44 && x > -32 && x < -10) continue; // and the pond's stream
    if (ok(x, z)) spots.push([x, z, r() < 0.35 ? 1 : 0, 0.8 + r() * 0.5, r() * Math.PI * 2]);
  }
  // a few shade trees in town
  for (const [x, z] of [[-34, -26], [33, -27], [-36, 20], [35, 34], [-8, 38], [30, 4], [-36, -2]]) spots.push([x, z, 0, 1.05, r() * 6]);
  const kinds = [broadleaf(5), pine(8)];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const out = new THREE.Group();
  kinds.forEach((geo, k) => {
    const list = spots.filter((s) => s[2] === k);
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    list.forEach(([x, z, , s, rot], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(new THREE.Vector3(x, height(x, z) - 0.2, z), q, new THREE.Vector3(s, s * (0.9 + (i % 5) * 0.05), s));
      inst.setMatrixAt(i, m);
      col.setHSL(0.27 + ((i * 37) % 10) / 200, 0.35, 0.92 + ((i * 13) % 7) / 60);
      inst.setColorAt(i, col);
      colliders.push({ x, z, r: 0.6 * s });
    });
    inst.castShadow = true; inst.receiveShadow = true;
    out.add(inst);
  });
  return out;
}

// ---------- grass ----------
function bladeGeo(h, w) {
  const g = new THREE.BufferGeometry();
  const v = [-w, 0, 0, w, 0, 0, -w * 0.6, h * 0.5, 0, w * 0.6, h * 0.5, 0, 0, h, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  g.computeVertexNormals();
  // normals point up so blades light like the ground under them
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function buildGrass(uTime, blocked, count) {
  const group = new THREE.Group();
  const r = rng(77);
  const make = (geo, n, place, colors, amount, top) => {
    const g = geo.clone(); tint(g, colors[0], colors[1]);
    const mat = windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), uTime, amount, top);
    const inst = new THREE.InstancedMesh(g, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    let k = 0;
    for (let tries = 0; k < n && tries < n * 6; tries++) {
      const p = place(); if (!p) continue;
      const [x, z, s] = p;
      e.set((r() - 0.5) * 0.4, r() * Math.PI, (r() - 0.5) * 0.4); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, height(x, z) - 0.02, z), q, new THREE.Vector3(s, s * (0.7 + r() * 0.6), s));
      inst.setMatrixAt(k, m);
      const nn = fbm(x * 0.08, z * 0.08, 2);
      col.setRGB(0.85 + nn * 0.25, 0.9 + nn * 0.15, 0.8 + nn * 0.1);
      inst.setColorAt(k, col);
      k++;
    }
    inst.count = k;
    inst.receiveShadow = true;
    group.add(inst);
    return inst;
  };
  // meadow grass all over the open ground
  make(bladeGeo(0.55, 0.06), count, () => {
    const x = (r() - 0.5) * 200, z = -120 + r() * 175;
    if (roadMask(x, z) > 0.3 || isWater(x, z) || height(x, z) < 0.15 || blocked(x, z, 0.4)) return null;
    if (fbm(x * 0.15, z * 0.15, 2) < 0.35) return null; // patches
    return [x, z, 0.8 + r() * 0.6];
  }, ['#4e8a3a', '#b4d870'], 0.12, 0.55);
  // tall grass on Route 1 (where wild Pokémon will live)
  const patches = TALL_GRASS;
  const inPatch = (x, z) => patches.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  make(bladeGeo(1.35, 0.11), Math.round(count * 0.18), () => {
    const pi = Math.floor(r() * patches.length), [x0, z0, x1, z1] = patches[pi];
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (!inPatch(x, z)) return null;
    return [x, z, 0.85 + r() * 0.5];
  }, ['#2f6a35', '#7fbf4f'], 0.22, 1.35);
  return group;
}
// [x0, z0, x1, z1]
export const TALL_GRASS = [[-9, -80, 9, -58], [-22, -112, -6, -92], [6, -128, 22, -104], [-14, -150, 4, -134]];

// ---------- flowers ----------
function flowerGeo() {
  const parts = [tint(new THREE.CylinderGeometry(0.02, 0.025, 0.35, 4).translate(0, 0.17, 0), '#4f8a3a')];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(tint(new THREE.SphereGeometry(0.07, 5, 3).scale(1, 0.4, 1).translate(Math.cos(a) * 0.07, 0.36, Math.sin(a) * 0.07), '#ffffff'));
  }
  parts.push(tint(new THREE.SphereGeometry(0.045, 5, 3).translate(0, 0.38, 0), '#ffd84a'));
  return merge(parts);
}
const PETALS = ['#ff6f8a', '#ffb3c6', '#ffffff', '#ffd23f', '#ff8c42', '#c99bff'];

export function buildFlowers(beds, blocked, wild) {
  const pts = [];
  const r = rng(55);
  for (const [x0, z0, x1, z1, palette] of beds) {
    for (let x = x0 + 0.3; x < x1; x += 0.55) for (let z = z0 + 0.3; z < z1; z += 0.55) {
      pts.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, palette[Math.floor(r() * palette.length)], 1.1]);
    }
  }
  for (let i = 0; i < wild; i++) {
    const cx = (r() - 0.5) * 160, cz = -90 + r() * 140;
    if (roadMask(cx, cz) > 0.1 || isWater(cx, cz) || blocked(cx, cz, 1)) continue;
    const col = PETALS[Math.floor(r() * PETALS.length)];
    for (let k = 0; k < 6; k++) {
      const x = cx + (r() - 0.5) * 2.5, z = cz + (r() - 0.5) * 2.5;
      if (roadMask(x, z) < 0.1 && !isWater(x, z)) pts.push([x, z, col, 0.8 + r() * 0.4]);
    }
  }
  const geo = flowerGeo();
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  pts.forEach(([x, z, c, s], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
    m.compose(new THREE.Vector3(x, height(x, z), z), q, new THREE.Vector3(s, s, s));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.set(c));
  });
  return inst;
}

// ---------- rocks ----------
export function buildRocks(colliders) {
  const r = rng(31), geos = [];
  const spots = [[-31, 27, 1.3], [-14, 40, 0.9], [-27, 39, 1.0], [40, -36, 1.6], [-44, -34, 1.4], [12, -46, 1.2], [-10, -52, 1.6], [44, 30, 1.2]];
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 220, z = -150 + r() * 150;
    if (Math.abs(x) < 48 && z > -40) continue;
    if (roadMask(x, z) > 0.05 || isWater(x, z)) continue;
    spots.push([x, z, 0.8 + r() * 2.2]);
  }
  for (const [x, z, s] of spots) {
    const g = new THREE.IcosahedronGeometry(s, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + r() * 0.4), p.getY(k) * (0.55 + r() * 0.2), p.getZ(k) * (0.8 + r() * 0.4));
    g.rotateY(r() * 6).translate(x, height(x, z) + s * 0.15, z);
    g.computeVertexNormals();
    geos.push(tint(g, '#80807a', '#b5b2a6'));
    colliders.push({ x, z, r: s * 0.85 });
  }
  const m = new THREE.Mesh(merge(geos), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
