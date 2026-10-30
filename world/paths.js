// Dirt paths as the anime paints them: a warm, worn track with a lighter
// middle, faint ruts, stones and hollows, a darker damp lip under a crisp
// ragged edge where tufts of grass lean over it. The dirt is painted INTO the
// terrain surface by its shader, from the path map (terrain.js: one smooth
// union of every road, the square and the plaza), so forks and crossings are
// one connected track and nothing can z-fight. The stones and ruts come from a
// photo dirt texture (Poly Haven "Dry Ground Rocks", CC0; tex/CREDITS.md),
// used only for its shapes and relief: the colour is our painted palette.
import * as THREE from 'three';
import { ROADS, FIELDS, height, rng, pathMap, pathSD, meshHeight } from './terrain.js';
import { celify } from './toon.js';
import { makeClump, TILE } from './foliage.js';
import { earthAtlas } from './props/earth.js';

let DIRT = null;
function dirtTexture() {
  if (DIRT) return DIRT;
  DIRT = new THREE.TextureLoader().load(new URL('./tex/dirt_pack.webp', import.meta.url).href);
  DIRT.colorSpace = THREE.NoColorSpace; DIRT.wrapS = DIRT.wrapT = THREE.RepeatWrapping; DIRT.anisotropy = 8;
  return DIRT;
}

function pathMapTexture() {
  const M = pathMap();
  const t = new THREE.DataTexture(M.data, M.nx, M.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// The terrain material paints the dirt: call before celify (celify chains
// onto this onBeforeCompile and replaces only the final colour block).
//
// The grass along the edge is painted as single blades, not a tiling map:
// roots are scattered on a 0.25 m grid, each slid along the path map's
// gradient onto the edge, and each blade leans across the edge onto the dirt
// (direction = into the dirt, a little turned, a little bent), tapering to a
// point, darker at the root and lighter at the tip, with a small shadow on
// the dirt away from the sun. Far off (a pixel wider than a blade) the blades
// fade to their average, a soft green fringe, so nothing speckles.
export function pathGround(m) {
  const M = pathMap();
  const col = (h) => new THREE.Color(h);
  const U = {
    uPM: { value: pathMapTexture() }, uPMo: { value: new THREE.Vector2(M.x0, M.z0) }, uPMs: { value: new THREE.Vector2(M.w, M.d) },
    uDirt: { value: dirtTexture() }, uEarth: { value: earthAtlas() },
    uDMid: { value: col('#d8aa70') }, uDLight: { value: col('#e8c890') }, uDEdge: { value: col('#c49a6c') },
    uDDark: { value: col('#86593a') }, uDPale: { value: col('#e6cf9c') },
  };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vPW; varying vec3 vPN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vPW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vPN = mat3(modelMatrix) * objectNormal;`);
    sh.fragmentShader = `varying vec3 vPW; varying vec3 vPN;
      uniform sampler2D uPM, uDirt, uEarth; uniform vec2 uPMo, uPMs;
      // the earth atlas (props/earth.js): the steep earth's strata, the paths' soils
      vec3 eTile(vec2 p, float k) {
        vec2 cell = vec2(mod(k, 4.0), floor(k / 4.0));
        vec2 sc = vec2(480.0 / 2048.0, 480.0 / 1024.0);
        vec2 q = (cell * 512.0 + 16.0) / vec2(2048.0, 1024.0) + fract(p) * sc;
        return textureGrad(uEarth, q, dFdx(p) * sc, dFdy(p) * sc).rgb;
      }
      uniform vec3 uDMid, uDLight, uDEdge, uDDark, uDPale;
      float pHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float pvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(pHash(i), pHash(i + vec2(1, 0)), f.x), mix(pHash(i + vec2(0, 1)), pHash(i + vec2(1, 1)), f.x), f.y); }
      float pSD(vec2 w) { return texture2D(uPM, (w - uPMo) / uPMs).r * 8.0 - 4.0; }
      // steep ground (the same in native shaders/terrain.gdshader): the grass
      // projected from the side too, bare earth in strata on the steepest
      vec3 earthCol(float a, float y) {
        float wob = (pvn(vec2(a * 0.25, 1.7)) - 0.5) * 0.9 + (pvn(vec2(a * 1.1, 5.3)) - 0.5) * 0.2;
        float b = (y + wob) / 1.05, bi = floor(b), bf = fract(b);
        float pk = pHash(vec2(bi, 3.7));
        vec3 c = pk < 0.3 ? vec3(0.39, 0.18, 0.076) : pk < 0.52 ? vec3(0.27, 0.17, 0.11) : pk < 0.68 ? vec3(0.64, 0.43, 0.19) : vec3(0.33, 0.16, 0.08);
        c *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.06, bf));
        c *= 0.95 + 0.08 * sin(y * 27.0 + pvn(vec2(a * 0.7, y)) * 4.0);
        float st = pvn(vec2(a * 7.0, y * 0.4));
        c *= 0.95 + 0.12 * smoothstep(0.55, 0.7, st) - 0.08 * smoothstep(0.35, 0.2, st);
        vec2 pc = vec2(a, y) / 0.3, ci = floor(pc), fp = fract(pc) - 0.5;
        float h = pHash(ci + 5.1);
        if (h < 0.24) {
          vec2 off = (vec2(pHash(ci + 1.3), pHash(ci + 2.9)) - 0.5) * 0.4;
          float r = 0.12 + h * 0.45, d = length((fp - off) * vec2(1.0, 1.3));
          float sh = smoothstep(r * 1.15, r * 0.95, length((fp - off + vec2(0.0, 0.07)) * vec2(1.0, 1.3)));
          c *= 1.0 - 0.35 * sh * step(r, d);
          vec3 pcol = vec3(0.36, 0.34, 0.31) * (0.8 + h);
          c = mix(c, pcol, smoothstep(r, r - 0.03, d));
          c = mix(c, pcol * 1.45, smoothstep(r * 0.55, r * 0.35, length(fp - off + vec2(0.03, -0.05))));
        }
        return c;
      }
      ` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      float pDirt; vec2 pNrm;
      #if defined(USE_MAP) && defined(USE_COLOR)
      {
        vec3 n = normalize(vPN), w = vPW;
        float s = 1.0 - n.y;
        if (s > 0.1) {
          vec3 bw = pow(abs(n), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
          vec3 g = texture2D(map, w.xz / 4.0).rgb * bw.y + texture2D(map, w.zy / 4.0).rgb * bw.x + texture2D(map, w.xy / 4.0).rgb * bw.z;
          vec3 grass = mix(diffuseColor.rgb, diffuse * vColor * g, smoothstep(0.1, 0.2, s));
          float k = smoothstep(0.2, 0.42, s);
          if (k > 0.0) {
            k *= smoothstep(0.3, 0.55, pvn(w.xz * 0.5 + w.y * 0.4) + k * 0.45);
            float sx = bw.x / max(bw.x + bw.z, 1e-4);
            vec3 e = mix(earthCol(w.x, w.y), earthCol(w.z, w.y), sx);
            float ea = mix(w.x, w.z, sx);
            float band = floor((w.y + (pvn(vec2(ea * 0.25, 1.7)) - 0.5) * 0.9) / 1.05);
            float bt = pHash(vec2(band, 3.7));
            float t0 = bt < 0.3 ? 2.0 : bt < 0.52 ? 0.0 : bt < 0.68 ? 5.0 : 6.0;
            vec2 ep = vec2(ea, w.y) / 1.6;
            vec3 ed = mix(eTile(ep, t0), eTile(ep * 0.83 + vec2(0.37, 0.61), t0 == 0.0 ? 4.0 : 3.0), smoothstep(0.4, 0.6, pvn(w.xz * 0.45 + w.y * 0.3)));
            e *= mix(vec3(1.0), ed * 2.0, 0.8);
            grass = mix(grass * mix(1.0, 0.8, k), e, k);
          }
          diffuseColor.rgb = grass;
        }
      }
      #endif
      {
        vec2 wp = vPW.xz;
        vec4 pm = texture2D(uPM, (wp - uPMo) / uPMs);
        vec3 dt = texture2D(uDirt, wp / 3.0).rgb;
        float sd = pm.r * 8.0 - 4.0, det = dt.r;
        float pxw = max(length(dFdx(wp)), length(dFdy(wp)));
        // 0 up close, 1 once a pixel is wider than a blade
        float farK = smoothstep(0.02, 0.05, pxw);
        // the ragged edge: two scales of wobble (eS, smooth) and, up close,
        // the stones of the photo
        float eS = sd + (pvn(wp * 0.9) - 0.5) * 0.34 + (pvn(wp * 3.3 + 7.0) - 0.5) * 0.14;
        float e = eS + (det - 0.45) * 0.08 * (1.0 - farK);
        float aa = max(fwidth(e), 1e-3);
        float onDirt = smoothstep(aa, -aa, e);
        vec3 ldw = vec3(0.5, 0.8, 0.3);
        #if NUM_DIR_LIGHTS > 0
          ldw = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
        #endif
        vec2 sOff = -normalize(ldw.xz + 1e-4) * 0.035;
        // blades along the edge
        float blade = 0.0, bShade = 0.0, bTip = 0.5, bTone = 0.5;
        if (farK < 0.999 && eS > -0.42 && eS < 0.36) {
          vec2 gr = vec2(pSD(wp + vec2(0.3, 0.0)) - pSD(wp - vec2(0.3, 0.0)), pSD(wp + vec2(0.0, 0.3)) - pSD(wp - vec2(0.0, 0.3)));
          vec2 n = normalize(gr + vec2(1e-5, 0.0));       // out of the dirt
          const float CS = 0.25;
          vec2 ci = floor(wp / CS);
          for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
            vec2 cc = ci + vec2(float(i), float(j));
            vec2 cw = (cc + 0.5) * CS;
            if (abs(eS + dot(cw - wp, n)) > 0.48) continue;
            float clump = pvn(cw * 1.3 + 21.0);
            for (int k = 0; k < 4; k++) {
              vec2 hs = cc * 1.7 + float(k) * 13.1;
              float h0 = pHash(hs + 0.3), h1 = pHash(hs + 5.7), h2 = pHash(hs + 9.1), h3 = pHash(hs + 2.9), h4 = pHash(hs + 7.3);
              if (h0 > 0.55 + clump * 0.45) continue;
              vec2 r0 = (cc + vec2(h1, h2)) * CS;
              float er = eS + dot(r0 - wp, n);
              float keep = smoothstep(0.3, 0.2, abs(er));
              if (keep <= 0.0) continue;
              float L = (0.12 + h3 * h3 * 0.26) * (0.7 + clump * 0.5);
              vec2 R = r0 - n * (er - h4 * 0.07);           // the root, on the edge or just behind it
              vec2 q = wp - R;
              if (dot(q, q) > (L + 0.05) * (L + 0.05)) continue;
              float an = (h1 - 0.5) * 1.0 + (clump - 0.5) * 0.5, ca = cos(an), sa = sin(an);
              vec2 d = -vec2(ca * n.x - sa * n.y, sa * n.x + ca * n.y), s = vec2(-d.y, d.x);
              float W = (0.019 + h2 * 0.016) * keep, bend = (h4 - 0.5) * 1.2 / L;
              // the blade
              float al = dot(q, d), ac = dot(q, s) - bend * al * al, tt = al / L;
              float ds = max(max(abs(ac) - W * pow(max(1.0 - tt, 0.0), 0.7), -al), al - L);
              float cv = smoothstep(pxw * 0.6, -pxw * 0.6, ds);
              if (cv > blade) { blade = cv; bTip = clamp(tt, 0.0, 1.0); bTone = h0 / (0.55 + clump * 0.45); }
              // its shadow, a little away from the sun
              vec2 q2 = q - sOff;
              al = dot(q2, d); ac = dot(q2, s) - bend * al * al; tt = al / L;
              ds = max(max(abs(ac) - W * 1.2 * pow(max(1.0 - tt, 0.0), 0.7), -al), al - L);
              bShade = max(bShade, smoothstep(pxw * 0.8, -pxw * 0.8, ds));
            }
          }
        }
        // far off: the average of the blades, a soft fringe over the dirt
        float avgB = smoothstep(-0.16, 0.03, eS) * 0.8;
        blade = mix(blade, avgB, farK);
        bShade = mix(bShade * (1.0 - blade), smoothstep(-0.26, -0.04, eS) * (1.0 - avgB) * 0.5, farK);
        pDirt = onDirt * (1.0 - blade);
        // the grass: painted blades, darker at the root, lighter at the tip
        vec3 grass = diffuseColor.rgb;
        float bl = blade * (1.0 - farK);
        grass *= mix(1.0, mix(0.8, 1.26, bTip * bTip) * (0.9 + bTone * 0.2), bl);
        grass *= mix(1.0, 0.92, farK * blade);
        // a lit lip on the bank above the sunken track
        grass *= 1.0 + 0.06 * (1.0 - smoothstep(0.0, 0.16, eS)) * step(0.0, eS) * (1.0 - bl);
        // the dirt (only where there is some: grass pixels skip all this)
        vec3 c = grass;
        if (pDirt > 0.001) {
        float depth = -sd;
        c = mix(uDEdge, uDMid, smoothstep(0.0, 0.75, -eS));
        c = mix(c, uDLight, smoothstep(0.5, 1.7, depth) * 0.5);
        c = mix(c, uDPale, pm.a * smoothstep(0.1, 1.2, depth));
        // two worn ruts, a lit ridge outside each
        float lat = pm.g * 3.0 + (pvn(wp * 0.6 + 3.0) - 0.5) * 0.16;
        float rk = pm.b * smoothstep(0.2, 0.9, depth);
        c *= 1.0 - 0.2 * rk * (1.0 - smoothstep(0.08, 0.2, abs(lat - 0.6)));
        c = mix(c, uDLight * 1.04, 0.4 * rk * (1.0 - smoothstep(0.03, 0.09, abs(lat - 0.83))));
        // broad painted patches of lighter wear and darker damp
        float pn = pvn(wp * 0.32 + 11.0) * 0.65 + pvn(wp * 0.9 + 3.0) * 0.35;
        c *= 0.86 + smoothstep(0.25, 0.75, pn) * 0.22;
        // stones and hollows from the photo, posterized for the painted look
        if (farK < 0.99) {
          vec2 sp = wp / 2.2;
          vec3 sd2 = mix(eTile(sp, 1.0), eTile(sp * 0.83 + vec2(0.3, 0.7), 3.0), smoothstep(0.35, 0.65, pvn(wp * 0.12 + 5.0)));
          c *= mix(vec3(1.0), sd2 * 2.0, 0.3 * (1.0 - farK));
        }
        float dq = mix(det, floor(det * 4.0 + 0.5) / 4.0, 0.65 * (1.0 - farK));
        c *= 0.66 + dq * 0.72;
        // the photo's relief lit by the sun: stones get a lit and a shaded side
        vec2 nn = dt.gb * 2.0 - 1.0;
        float rel = dot(vec3(nn.x, 0.0, -nn.y), ldw);
        c *= 1.0 + clamp(rel * 1.6, -0.35, 0.3);
        c = mix(c, uDDark, smoothstep(0.2, 0.06, det) * 0.6);
        c = mix(c, uDLight * 1.12, smoothstep(0.74, 0.88, det) * 0.55);
        // the damp lip under the grass: one soft, darker band (wider when
        // seen from far, so it never breaks into flecks between blades)
        float lipW = 0.24 + pxw * 6.0;
        float lip = 1.0 - smoothstep(0.0, lipW, -eS);
        c *= mix(vec3(1.0), vec3(0.9, 0.86, 0.85), lip);
        c *= 1.0 - 0.3 * bShade;
        // painted pebbles: one now and then in a 0.32 m cell, a shadow on the
        // side away from the sun, a pale body and a lit top
        {
          vec2 pc = wp / 0.32, ci = floor(pc), fp = fract(pc) - 0.5;
          float hr = pHash(ci + 17.0);
          if (hr < 0.22 && -e > 0.12) {
            vec2 off = (vec2(pHash(ci + 3.1), pHash(ci + 7.7)) - 0.5) * 0.36;
            float rad = 0.07 + pHash(ci + 1.3) * 0.09 + step(0.19, hr) * 0.06;
            float an = pHash(ci + 9.0) * 6.283, ca = cos(an), sa = sin(an);
            vec2 q = fp - off; q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y); q.y *= 1.35;
            vec2 sdir = -normalize(ldw.xz + 1e-4) * 0.55;
            vec2 qs = fp - off - sdir * rad * 1.5; qs = vec2(ca * qs.x - sa * qs.y, sa * qs.x + ca * qs.y); qs.y *= 1.35;
            float w = pxw / 0.32 + 1e-3;
            float sh = smoothstep(w, -w, length(qs) - rad * 1.1);
            float bd = smoothstep(w, -w, length(q) - rad);
            float tp = smoothstep(w, -w, length(q + sdir * rad * 0.5) - rad * 0.5);
            vec3 pcol = mix(uDMid, vec3(0.62, 0.58, 0.54), 0.3 + pHash(ci + 4.4) * 0.4) * (0.7 + pHash(ci + 5.5) * 0.18);
            c *= 1.0 - 0.55 * sh * (1.0 - bd);
            c = mix(c, pcol, bd);
            c = mix(c, pcol * 1.3, tp * 0.85);
          }
        }
        }
        diffuseColor.rgb = mix(grass, c, pDirt);
        pNrm = (dt.gb * 2.0 - 1.0) * pDirt * (1.0 - farK * 0.5);
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(normal + mat3(viewMatrix) * vec3(pNrm.x, 0.0, -pNrm.y) * 0.5);`)
      // after the cel bands: dirt in shade (e.g. the big tree's shadow over
      // the lab-lane fork) keeps a painted lavender-brown hue. The cool cel
      // tints alone turned the pale sand a flat grey smudge.
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      {
        const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
        float lb = max(dot(diffuseColor.rgb, LW), 1e-4), lo = dot(gl_FragColor.rgb, LW);
        float rr = lo / lb;
        float shd = 1.0 - smoothstep(0.86, 1.0, rr);
        if (pDirt > 0.001 && shd > 0.0) {
          // a soft lavender-brown shade, a little lighter than the cel band
          // (a tree's shadow on the path reads as shade, not a dark blotch)
          vec3 wm = diffuseColor.rgb * mix(vec3(0.72, 0.64, 0.8), vec3(0.86, 0.8, 0.88), smoothstep(0.5, 0.85, rr));
          // shade on the path stays gentle: its brightness moves most of
          // the way back toward the sunlit dirt
          wm *= mix(lo, lb * 0.92, 0.6) / max(dot(wm, LW), 1e-4);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, wm, shd * pDirt * 0.8);
        }
      }`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + 'pathground';
  return m;
}

// A smooth curve through a road's points, sampled every step metres.
function sample(road, step = 0.5) {
  const pts = road.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3);
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return { pts: curve.getSpacedPoints(n), len: curve.getLength() };
}

// Nothing grows or stands on the track (the dirt itself is in the terrain):
// the weed tufts that used to sit between the ruts are gone. The empty group
// stays so callers keep their handle.
export function buildPaths(scene) {
  const group = new THREE.Group();
  scene.add(group);
  return group;
}

// The painterly grass the ground is painted with: short brush strokes in
// clumps, light and dark, as a grey-green detail map (the ground's own colour
// tints it). One tile = 4 m.
export function grassTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), R = rng(2024);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  c.fillStyle = hsl(90, 12, 86); c.fillRect(0, 0, S, S);
  const wrap = (x, y, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(x + ox, y + oy); };
  // soft patches
  for (let k = 0; k < 40; k++) {
    const x = R() * S, y = R() * S, r = 30 + R() * 70, l = R() < 0.5;
    wrap(x, y, (px, py) => { c.fillStyle = l ? hsl(80, 30, 96, 0.25) : hsl(120, 20, 72, 0.22); c.beginPath(); c.ellipse(px, py, r, r * 0.6, R(), 0, 6.28); c.fill(); });
  }
  // clumps of blades: a fan of short strokes, dark at the root, light at the tips
  for (let k = 0; k < 260; k++) {
    const cx = R() * S, cy = R() * S, n = 4 + Math.floor(R() * 6), light = R();
    for (let j = 0; j < n; j++) {
      const ang = -Math.PI / 2 + (j / (n - 1) - 0.5) * 1.6 + (R() - 0.5) * 0.3, len = 10 + R() * 14;
      const col = light < 0.35 ? hsl(125, 25, 66, 0.8) : light < 0.75 ? hsl(95, 30, 92, 0.85) : hsl(70, 45, 100, 0.9);
      wrap(cx, cy, (px, py) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(px - 2, py);
        const tx = px + Math.cos(ang) * len, ty = py + Math.sin(ang) * len;
        c.quadraticCurveTo((px + tx) / 2 + 3, (py + ty) / 2, tx, ty);
        c.quadraticCurveTo((px + tx) / 2, (py + ty) / 2 + 2, px + 2, py); c.fill();
      });
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Farm fields as the anime paints them: tilled rows in reddish brown, rows of
// green crops on brown soil, or ripening grain, laid over the ground.
function fieldTexture(kind) {
  const W = 256, H = 512, R = rng(kind.length * 31 + 7);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  const rows = 8, rh = H / rows;
  c.fillStyle = kind === 'wheat' ? hsl(52, 62, 62) : hsl(16, 42, 42); c.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    if (kind === 'till') {
      // a ridge with a lit top and a dark furrow under it
      c.fillStyle = hsl(14, 46, 50); c.fillRect(0, y + rh * 0.12, W, rh * 0.5);
      c.fillStyle = hsl(18, 50, 60); c.fillRect(0, y + rh * 0.14, W, rh * 0.16);
      c.fillStyle = hsl(10, 40, 34); c.fillRect(0, y + rh * 0.68, W, rh * 0.2);
      for (let k = 0; k < 30; k++) { c.fillStyle = hsl(14, 40, 40 + R() * 20, 0.6); c.fillRect(R() * W, y + R() * rh, 2 + R() * 6, 2); }
    } else if (kind === 'crop') {
      c.fillStyle = hsl(12, 38, 34); c.fillRect(0, y + rh * 0.75, W, rh * 0.18);
      // a row of leafy heads
      for (let x = -10; x < W + 10; x += 12 + R() * 6) {
        const cx = x, cy = y + rh * 0.42, r = rh * (0.28 + R() * 0.08);
        c.fillStyle = hsl(105, 48, 32); c.beginPath(); c.ellipse(cx + 2, cy + 3, r, r * 0.8, 0, 0, 6.28); c.fill();
        c.fillStyle = hsl(95, 55, 46); c.beginPath(); c.ellipse(cx, cy, r, r * 0.78, 0, 0, 6.28); c.fill();
        c.fillStyle = hsl(85, 62, 62); c.beginPath(); c.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.45, r * 0.3, 0, 0, 6.28); c.fill();
      }
    } else {
      c.fillStyle = hsl(46, 60, 54); c.fillRect(0, y + rh * 0.7, W, rh * 0.22);
      for (let k = 0; k < 120; k++) { const x = R() * W, yy = y + R() * rh * 0.7; c.strokeStyle = hsl(50 + R() * 10, 70, 70 + R() * 15, 0.9); c.lineWidth = 2; c.beginPath(); c.moveTo(x, yy + 10); c.lineTo(x + (R() - 0.5) * 4, yy); c.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
export function buildFields(scene) {
  const group = new THREE.Group(), texs = {};
  const cel = { bands: [0.08, 0.22, 0.5], soft: 0.04, deep: [0.5, 0.6, 0.8], shade: [0.68, 0.76, 0.9], lit: [1.05, 1.04, 0.98] };
  // The terrain mesh is a 1.5 m grid, so between its vertices it can sit up to
  // 12 cm off height(): sit each field vertex 8 cm over whichever is higher,
  // the true height or the rendered ground, or the ground pokes through (and
  // fights the field) where it bends.
  const onMesh = (x, z) => meshHeight(x, z);
  // (the fields are modelled now: furrowed beds and crops, props/farm.js
  // cropField from town.js and route1.js; nothing is painted here)
  for (const f of FIELDS.filter(() => false)) {
    const tex = texs[f.kind] || (texs[f.kind] = fieldTexture(f.kind));
    const nu = Math.ceil(f.w / 1.0), nv = Math.ceil(f.d / 1.0);
    const g = new THREE.PlaneGeometry(f.w, f.d, nu, nv);
    const p = g.attributes.position, uv = g.attributes.uv;
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = -p.getY(i);
      const x = f.x + u * c + v * s, z = f.z - u * s + v * c;
      p.setXYZ(i, x, Math.max(height(x, z), onMesh(x, z)) + 0.08, z);
      uv.setXY(i, u / 6, v / 1.4 / 8);
    }
    g.computeVertexNormals();
    const m = celify(new THREE.MeshLambertMaterial({ map: tex }), cel);
    m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
