// A generated person as a self-contained model for other engines (the native
// Godot game): every mesh gets UVs (uvatlas.js) and its shader paint baked into a
// texture by drawing the mesh flat in UV space with its own material (the same
// shader, without the light bands), the empty texels round each chart filled from
// their neighbours so no seams show; then the whole skinned person (skeleton in
// the game's rig, the A pose as the bind pose) is written as a binary glTF with
// the game's clips if asked.
//
// exportGLB(person, renderer, { size: 1024 (body; garments get size / 2), clips: [AnimationClip] }) -> ArrayBuffer
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';
import { atlas } from './uvatlas.js';

const ARR = (g, k) => (g.attributes[k] ? g.attributes[k].array : null);

// the mesh's arrays (bind pose), body triangles hidden under clothes left out
function arraysOf(mesh) {
  const g = mesh.geometry, out = { pos: ARR(g, 'position'), nrm: ARR(g, 'normal') };
  for (const [k, a] of [['skin', 'skinIndex'], ['wts', 'skinWeight'], ['canon', 'canon'], ['part', 'part'], ['share', 'share'], ['gco', 'gco'], ['hide', 'hide']]) if (g.attributes[a]) out[k] = ARR(g, a);
  let idx = g.index.array;
  if (out.hide) {
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) if (!(out.hide[idx[t]] > 0.99 && out.hide[idx[t + 1]] > 0.99 && out.hide[idx[t + 2]] > 0.99)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    idx = Uint32Array.from(keep);
  }
  out.idx = idx;
  return out;
}
function geometryFrom(a, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (a.skin) { g.setAttribute('skinIndex', new THREE.BufferAttribute(a.skin, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(a.wts, 4)); }
  for (const [k, w] of [['canon', 3], ['part', 4], ['share', 4], ['gco', 4]]) if (a[k]) g.setAttribute(k, new THREE.BufferAttribute(a[k], w));
  g.setIndex(new THREE.BufferAttribute(a.idx.length > 65535 * 3 || a.pos.length / 3 > 65535 ? Uint32Array.from(a.idx) : Uint16Array.from(a.idx), 1));
  return g;
}

// the material drawing itself flat into UV space, unlit
function bakeMaterial(src) {
  const m = src.clone();
  const prev = src.onBeforeCompile;
  m.side = THREE.DoubleSide;
  if (src.userData.u && src.userData.u.uInside) m.userData.u = src.userData.u;
  m.onBeforeCompile = (sh, r) => {
    prev.call(src, sh, r);
    if (sh.uniforms.uInside) sh.uniforms.uInside = { value: 1 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 bakeUV;')
      .replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position = vec4(bakeUV * 2.0 - 1.0, 0.0, 1.0);');
    const i = sh.fragmentShader.lastIndexOf('#include <opaque_fragment>');
    sh.fragmentShader = sh.fragmentShader.slice(0, i) + 'outgoingLight = diffuseColor.rgb;\n' + sh.fragmentShader.slice(i);
  };
  const key = src.customProgramCacheKey();
  m.customProgramCacheKey = () => 'bake:' + key;
  return m;
}

const DILATE = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, px: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tex; uniform vec2 px; varying vec2 vUv;
    void main() { vec4 c = texture2D(tex, vUv); if (c.a > 0.5) { gl_FragColor = c; return; }
      vec4 s = vec4(0.0);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec4 t = texture2D(tex, vUv + vec2(x, y) * px); if (t.a > 0.5) s += vec4(t.rgb, 1.0); }
      gl_FragColor = s.a > 0.0 ? vec4(s.rgb / s.a, 1.0) : vec4(0.0); }`,
});

function bake(renderer, geo, mat, size) {
  const rt = () => new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  let a = rt(), b = rt();
  const g = geo.clone(); g.setAttribute('bakeUV', geo.attributes.uv);
  const mesh = new THREE.Mesh(g, bakeMaterial(mat)); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  scene.add(new THREE.AmbientLight('#ffffff', 1));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const prev = { tm: renderer.toneMapping, rt: renderer.getRenderTarget(), cc: renderer.getClearColor(new THREE.Color()), ca: renderer.getClearAlpha() };
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(a); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  // fill outwards from the charts
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), DILATE), qs = new THREE.Scene(); qs.add(quad);
  DILATE.uniforms.px.value.set(1 / size, 1 / size);
  for (let i = 0; i < 8; i++) { DILATE.uniforms.tex.value = a.texture; renderer.setRenderTarget(b); renderer.render(qs, cam); [a, b] = [b, a]; }
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(a, 0, 0, size, size, px);
  renderer.setRenderTarget(prev.rt); renderer.toneMapping = prev.tm; renderer.setClearColor(prev.cc, prev.ca);
  a.dispose(); b.dispose(); g.dispose(); mesh.material.dispose();
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  const tex = new THREE.DataTexture(px, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.needsUpdate = true;
  // GLTFExporter writes images from canvases
  const c = document.createElement('canvas'); c.width = c.height = size;
  const id = new ImageData(new Uint8ClampedArray(px.buffer), size, size); c.getContext('2d').putImageData(id, 0, 0);
  const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace; t2.flipY = false;
  return t2;
}

export async function exportGLB(person, renderer, o = {}) {
  const size = o.size || 1024;
  // the bind (A) pose
  const mixer = person.mixer; if (mixer) mixer.stopAllAction();
  person.root.updateMatrixWorld(true);
  const pose = person.bones.map((b) => b.quaternion.clone());
  person.skeleton.pose();
  const clone = SU.clone(person.root);
  person.bones.forEach((b, i) => b.quaternion.copy(pose[i]));
  const srcMeshes = person.meshes, dst = [];
  clone.traverse((m) => { if (m.isSkinnedMesh) dst.push(m); });
  for (let i = 0; i < srcMeshes.length; i++) {
    const src = srcMeshes[i], d = dst[i]; if (!d) continue;
    const arrays = arraysOf(src);
    const big = src.name === 'body';
    const { mesh, uv } = atlas(arrays, { size: big ? size : size / 2, weight: big ? (x, y, z) => (y > person.anat.L.chinY - 0.02 && z > 0 ? 6 : 1) : null });
    const geo = geometryFrom(mesh, uv);
    const map = bake(renderer, geo, src.material, big ? size : Math.max(256, size / 2));
    // only what other engines read
    for (const k of ['canon', 'part', 'share', 'gco']) geo.deleteAttribute(k);
    d.geometry = geo;
    d.material = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, side: src.material.side, name: src.name });
    d.name = src.name;
  }
  clone.name = o.name || 'person';
  const ex = new GLTFExporter();
  return await ex.parseAsync(clone, { binary: true, animations: o.clips || [], onlyVisible: true });
}
