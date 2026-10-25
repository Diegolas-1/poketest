// The world as the game makes it, built by the game's own generators (with
// the edit layer applied), for the editor's viewport: the ground, water,
// paths, fields, the town (unmerged, so each piece can be picked and moved:
// town.js returns before merging when globalThis.__PALLET_EDITOR is set) and
// the vegetation. No ink pass, no grass blades (Play shows the real thing).
import * as THREE from 'three';
import { buildTerrain, buildWater, WALK } from '../terrain.js';
import { buildSky, buildMountains, buildCinnabar } from '../nature.js';
import { buildTown, BEDS } from '../town.js';
import { celify } from '../toon.js';
import { buildPaths, buildFields, grassTexture, pathGround } from '../paths.js';
import { buildVegetation } from '../veg.js';
import { wind } from '../assets.js';
import { E } from '../editlayer/index.js';

// the game's 'high' preset (the native bake's): the vegetation is seeded the same
export const QUALITY = { dpr: 1, shadow: 2048, grass: 0, grassSize: 0, trees: 1, plants: 1, lod: 1, fog: 1 };

export async function buildWorld(renderer, status) {
  const scene = new THREE.Scene();
  const FOG = new THREE.Color('#c4e2f0');
  scene.fog = new THREE.Fog(FOG, 260, 900);
  const sunDir = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();
  scene.add(buildSky(sunDir));
  {
    const envScene = new THREE.Scene(); envScene.add(buildSky(sunDir));
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02, 1, 2000).texture;
    scene.environmentIntensity = 0.75;
  }
  const hemi = new THREE.HemisphereLight('#e2f1ff', '#6d7f4c', 0.55);
  const sun = new THREE.DirectionalLight('#fff0d4', 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 300 });
  scene.add(hemi, sun, sun.target);

  status('Shaping the land');
  await tick();
  const terrain = buildTerrain();
  let pmTex = null;
  {
    const m = pathGround(new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture() }));
    const mat = celify(m, { detail: 0.5, mid: 0.4, bands: [0.08, 0.22, 0.5], soft: 0.04, deep: [0.5, 0.62, 0.8], shade: [0.66, 0.78, 0.9], lit: [1.06, 1.06, 0.98] });
    // the path map's texture (the editor repaints it as you paint paths)
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => { prev.call(mat, sh, r); if (sh.uniforms.uPM) pmTex = sh.uniforms.uPM.value; };
    terrain.traverse((o) => { if (o.isMesh) { o.material = mat; o.userData.terrain = true; } });
  }
  scene.add(terrain);
  scene.add(buildWater(wind.uTime, { color: '#cfe6f2', near: 300, far: 1200 }));
  buildPaths(scene);
  buildFields(scene);
  scene.add(buildMountains(sunDir));
  scene.add(buildCinnabar(sunDir));
  status('Building the town');
  await tick();
  const town = buildTown();
  scene.add(town.group);
  const colliders = town.colliders;
  function blocked(x, z, r = 0) {
    for (const c of colliders) {
      if (E.raw ? c.ed : c.off) continue;
      if (c.box) {
        let dx = x - c.x, dz = z - c.z;
        if (c.rot) { const cs = Math.cos(c.rot), sn = Math.sin(c.rot); [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs]; }
        if (Math.abs(dx) < c.hw + r && Math.abs(dz) < c.hd + r) return true;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return true;
    }
    for (const [x0, z0, x1, z1] of BEDS) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
    return false;
  }
  const veg = await buildVegetation(scene, renderer, blocked, colliders, QUALITY, status);
  for (const imp of veg.impostors) if (imp.material && imp.material.uniforms) Object.assign(imp.material.uniforms, { fogColor: { value: FOG }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } });
  // which scatter and point each plant instance is (for picking)
  for (const sc of veg.scatters) for (const c of sc.chunks) for (const m of c.meshes) m.userData.veg = { sc, c };
  return { scene, sun, hemi, terrain, town, veg, pmTex: () => pmTex, WALK };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
