// Earth faces (stream banks, Route 1's ledges, the dirt under a turf lip):
// one material for all of them, painted from the earth atlas (tex/earth_atlas.webp,
// tools/world/earth_atlas.py: eight CC0 photo soils made into painted detail,
// credits in tex/CREDITS.md). The vertices carry the colour (the strata
// palette, moss, the wet band) and two tiles of the atlas in uv1 (x the
// layer's own soil, y a second soil it is mixed with); uv is the face's own
// metres (along it, up it). Each pixel shows the two soils blended by a
// seeded noise over the face, each at its own scale and offset, so a face
// never repeats; the atlas is detail around 1 (128 = the vertex colour).
// The native game draws the same with shaders/earth.gdshader (a material whose
// name starts with "earth": main.gd toon_for), its atlas in world/base.
import * as THREE from 'three';
import { toon } from '../toon.js';

// the atlas's tiles (tools/world/earth_atlas.py TILES)
export const EARTH_TILES = { loam: 0, sand: 1, clay: 2, gravel: 3, roots: 4, silt: 5, eroded: 6, forest: 7 };
// metres of face one tile covers
export const EARTH_TILE_M = 1.6;

let ATLAS = null;
export function earthAtlas() {
  if (ATLAS) return ATLAS;
  ATLAS = new THREE.TextureLoader().load(new URL('../tex/earth_atlas.webp', import.meta.url).href);
  ATLAS.colorSpace = THREE.NoColorSpace; ATLAS.anisotropy = 4;
  ATLAS.minFilter = THREE.LinearMipmapLinearFilter; ATLAS.magFilter = THREE.LinearFilter;
  return ATLAS;
}

// the sampling, word for word in shaders/earth.gdshader and terrain.gdshader
export const EARTH_GLSL = `
  float eHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float eNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(eHash(i), eHash(i + vec2(1, 0)), f.x), mix(eHash(i + vec2(0, 1)), eHash(i + vec2(1, 1)), f.x), f.y); }
  // tile k of the 4 x 2 atlas at p (in tiles; repeats), with smooth mip levels across the repeat
  vec3 eTile(sampler2D atlas, vec2 p, float k) {
    vec2 cell = vec2(mod(k, 4.0), floor(k / 4.0));
    vec2 sc = vec2(480.0 / 2048.0, 480.0 / 1024.0);
    vec2 q = (cell * 512.0 + 16.0) / vec2(2048.0, 1024.0) + fract(p) * sc;
    return textureGrad(atlas, q, dFdx(p) * sc, dFdy(p) * sc).rgb;
  }
  // two soils blended by noise over the face: detail around 1
  vec3 eDetail(sampler2D atlas, vec2 uv, vec2 tiles, vec3 wp) {
    vec2 p = uv / ${EARTH_TILE_M.toFixed(2)};
    float m = smoothstep(0.38, 0.62, eNoise(wp.xz * 0.45 + wp.y * 0.3 + 7.0) * 0.7 + eNoise(wp.xz * 1.3 - wp.y) * 0.3);
    vec3 a = eTile(atlas, p + vec2(eHash(vec2(tiles.x, 1.7)), 0.0), tiles.x);
    vec3 b = eTile(atlas, p * 0.83 + vec2(0.37, 0.61), tiles.y);
    return mix(vec3(1.0), mix(a, b, m) * 2.0, 0.85);
  }
`;

let MAT = null;
// cel: the bands (props/banks.js CEL)
export function earthMaterial(cel) {
  if (MAT) return MAT;
  const m = toon('#ffffff', { vertexColors: true, cel });
  const U = { uEarth: { value: earthAtlas() } };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec2 uv1; varying vec2 vEUv; varying vec2 vETile; varying vec3 vEW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vEUv = uv; vETile = uv1; vEW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = 'uniform sampler2D uEarth; varying vec2 vEUv; varying vec2 vETile; varying vec3 vEW;\n' + EARTH_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= eDetail(uEarth, vEUv, floor(vETile + 0.5), vEW);`);
    if (prev) prev.call(m, sh, r);
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + 'earth';
  m.name = 'earth';
  m.userData.earth = true;
  MAT = m;
  return m;
}
