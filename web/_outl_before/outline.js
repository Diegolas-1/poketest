// Anime ink lines as one screen-space pass (the single source of truth for
// outlines). After the normal render, the scene is drawn once more into a small
// G-buffer: view-space normal (octahedral, RG), an object/instance id (B) and a
// kind (A), plus depth. A full-screen pass then inks pixels where depth, normal,
// id or kind change, multiplied over the picture. Lines are a constant number of
// pixels wide (scaled with the screen height), fade into the fog, and follow
// whatever the vertex shaders do (wind sway, skinning, instancing).
//
// Kinds (mesh.userData.outline, inherited by children; false = not drawn):
//   'solid'  buildings, props, fences, characters: silhouettes, creases, part edges
//   'leaf'   tree canopies and bushes: one silhouette per plant, no line per card,
//            small holes in the canopy stay clean
//   'ground' terrain, water, small plants: hides lines behind it, draws none
//   false    left out of the pass (decals, glow, sky)
// Unmarked meshes: ShaderMaterials, sprites, depthWrite-off and polygonOffset
// (decal) materials are left out; cut-out leaf materials are 'leaf'; anything
// smaller than SMALL metres is 'ground'; the rest is 'solid'.
import * as THREE from 'three';

const K = { sky: 0, ground: 1, leaf: 2, solid: 3 };
const SMALL = 0.4;

export function createOutline(renderer, o = {}) {
  const opt = { color: '#3b2f45', strength: 0.9, width: 2, scale: 1, fadeNear: 55, fadeFar: 125, ...o };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depth = new THREE.DepthTexture(1, 1);
  const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth, generateMipmaps: false });

  // ---------- G-buffer materials ----------
  const GV = `
    varying float vGId;
    #ifdef GB_CUT
      varying vec2 vGUv; varying vec3 vGV;
    #endif
    uniform float uGId;
`;
  const GV_MAIN = `
    #ifdef USE_INSTANCING
      vGId = fract(uGId + float(gl_InstanceID) * 0.38196601);
    #else
      vGId = uGId;
    #endif
    #ifdef GB_CUT
      vGUv = uv; vGV = -mvPosition.xyz;
    #endif`;
  const GF = `
    varying float vGId; uniform float uGKind;
    #ifdef GB_CUT
      varying vec2 vGUv; varying vec3 vGV; uniform sampler2D uGMap; uniform float uGCut;
    #endif
    vec2 gbOct(vec3 n) {
      n /= (abs(n.x) + abs(n.y) + abs(n.z));
      vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
      return e * 0.5 + 0.5;
    }
`;
  const GF_MAIN = `
    #ifdef GB_CUT
      // the same cut as the leaf cards (foliage.js leafMaterial): edge-on cards thin out
      if (texture2D(uGMap, vGUv).a < uGCut) discard;
      #ifdef GB_LEAF
        vec3 fN = normalize(cross(dFdx(vGV), dFdy(vGV)));
        float edgeOn = abs(dot(fN, normalize(vGV)));
        vec2 tl = fract(vGUv * 4.0) - 0.5;
        if (length(tl) > mix(0.0, 0.75, smoothstep(0.1, 0.5, edgeOn))) discard;
      #endif
    #endif
    gl_FragColor = vec4(gbOct(normalize(normal)), vGId, uGKind / 3.0);`;

  // one G-buffer material per object (so its id/kind uniforms upload with it);
  // programs are shared through the cache key
  const objMats = new WeakMap();
  const vertexMods = (src, sh) => {
    // replay the source material's vertex changes (wind sway) on our shader;
    // fragment edits are thrown away
    if (!src || !src.onBeforeCompile || src.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) return;
    const proxy = { vertexShader: sh.vertexShader, fragmentShader: '', uniforms: sh.uniforms, defines: sh.defines || {} };
    try { src.onBeforeCompile(proxy, renderer); } catch (e) { return; }
    sh.vertexShader = proxy.vertexShader;
    Object.assign(sh.uniforms, proxy.uniforms);
  };
  function standardFor(obj, src, kind) {
    const cut = !!(src.alphaTest > 0 && src.map), leaf = cut && kind === K.leaf && src.side === THREE.DoubleSide;
    const m = new THREE.MeshNormalMaterial({ side: src.side, flatShading: !!src.flatShading });
    m.defines = {}; if (cut) m.defines.GB_CUT = ''; if (leaf) m.defines.GB_LEAF = '';
    m.userData.u = { uGId: { value: 0 }, uGKind: { value: kind }, uGMap: { value: src.map || null }, uGCut: { value: src.alphaTest || 0.5 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, m.userData.u);
      if (kind !== K.ground) vertexMods(src, sh);
      sh.vertexShader = GV + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + GV_MAIN);
      sh.fragmentShader = GF + sh.fragmentShader.replace(/gl_FragColor = vec4\( packNormalToRGB\( normal \), diffuseColor\.a \);[\s\S]*?#endif/, GF_MAIN);
    };
    const srcKey = src.customProgramCacheKey ? src.customProgramCacheKey() : '';
    m.customProgramCacheKey = () => 'gbuf|' + kind + '|' + (kind !== K.ground ? srcKey : '');
    return m;
  }
  // ShaderMaterials (water, marked by hand): same vertex shader and uniforms, flat output
  function shaderFor(obj, src, kind) {
    const m = new THREE.ShaderMaterial({
      vertexShader: src.vertexShader,
      fragmentShader: `uniform float uGId, uGKind; void main(){ gl_FragColor = vec4(0.5, 1.0, uGId, uGKind / 3.0); }`,
      uniforms: { ...src.uniforms, uGId: { value: 0 }, uGKind: { value: kind } },
      defines: { ...src.defines }, side: src.side,
    });
    m.userData.u = m.uniforms;
    return m;
  }
  const idOf = (obj) => ((obj.id * 0.61803399) % 1 + 1) % 1;
  function gmat(obj, src, kind) {
    let e = objMats.get(obj);
    if (!e || e.src !== src || e.kind !== kind) {
      if (e) e.mat.dispose();
      const mat = src.isShaderMaterial ? shaderFor(obj, src, kind) : standardFor(obj, src, kind);
      mat.userData.u.uGId.value = Math.floor(idOf(obj) * 250 + 3) / 255;
      e = { src, kind, mat }; objMats.set(obj, e);
    }
    return e.mat;
  }
  const radiusOf = (obj) => {
    const g = obj.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const s = obj.matrixWorld.getMaxScaleOnAxis();
    return g.boundingSphere.radius * s;
  };
  function autoKind(obj, m) {
    if (m.isShaderMaterial || m.isRawShaderMaterial) return null;
    if (m.depthWrite === false || m.polygonOffset || m.side === THREE.BackSide || (m.transparent && m.opacity < 0.99)) return null;
    if (m.alphaTest > 0 && m.map) return radiusOf(obj) < SMALL * 1.5 ? K.ground : K.leaf;
    return radiusOf(obj) < SMALL ? K.ground : K.solid;
  }

  // ---------- the ink pass ----------
  const ink = new THREE.Color(opt.color);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, transparent: true,
    // multiply: the line takes the colour of what it lies on, darkened
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    uniforms: {
      tG: { value: rt.texture }, tD: { value: depth }, uPx: { value: new THREE.Vector2() }, uR: { value: 1 },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uInk: { value: new THREE.Vector3(ink.r, ink.g, ink.b) }, uStr: { value: opt.strength },
      uFade: { value: new THREE.Vector2(opt.fadeNear, opt.fadeFar) },
    },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tG, tD; uniform vec2 uPx, uFade; uniform float uR, uNear, uFar, uStr; uniform vec3 uInk;
      varying vec2 vU;
      float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      vec3 oct(vec2 e) {
        e = e * 2.0 - 1.0;
        vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
        float t = max(-n.z, 0.0); n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t;
        return normalize(n);
      }
      struct S { vec3 n; float id; float k; float z; };
      S get(vec2 uv) {
        vec4 g = texture2D(tG, uv); S s;
        s.n = oct(g.rg); s.id = g.b; s.k = floor(g.a * 3.0 + 0.5); s.z = lin(texture2D(tD, uv).r);
        return s;
      }
      // is there a line between the two surfaces? (p is the farther one)
      bool edge(S p, S q) {
        if (p.k != q.k || abs(p.id - q.id) > 0.002) return true;
        if (p.k < 0.5) return false;
        if (dot(p.n, q.n) < 0.8) return true;
        float thr = (0.025 * q.z + 0.04) / max(abs(q.n.z), 0.2);
        return p.z - q.z > thr;
      }
      void main() {
        S p = get(vU);
        float hit = 0.0, zl = 1e9;
        // two rings: the whole pixels of the width, then the part pixel at a
        // fraction (a soft, anti-aliased outer edge and widths like 1.5 px)
        float r0 = max(1.0, floor(uR)), fr = uR - r0;
        for (int k = 0; k < 2; k++) {
          float w = k == 0 ? 1.0 : fr;
          if (w < 0.01) break;
          float rr = r0 + float(k);
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7853982;
            vec2 d = vec2(cos(a), sin(a)) * uPx * rr;
            S q = get(vU + d);
            // solid lines: ink the farther pixel of an edge, so lines sit just
            // outside a silhouette (or on one side of a crease)
            if ((p.k > 2.5 || q.k > 2.5) && q.z <= p.z && abs(q.k - 2.0) > 0.5 && edge(p, q)) { hit += w; zl = min(zl, q.z); }
            // canopy lines: one per plant, inside its silhouette; a hole smaller
            // than 3 line widths (sky between leaf cards) stays clean
            if (abs(p.k - 2.0) < 0.5) {
              S q2 = get(vU + d * 3.0);
              float gap = max(0.3, 0.05 * p.z);
              bool o1 = (q.k != 2.0 || abs(q.id - p.id) > 0.002) && q.z > p.z + gap;
              bool o2 = (q2.k != 2.0 || abs(q2.id - p.id) > 0.002) && q2.z > p.z + gap;
              if (o1 && o2) { hit += w; zl = min(zl, p.z); }
            }
          }
        }
        float a = clamp(hit / 2.5, 0.0, 1.0) * uStr * (1.0 - smoothstep(uFade.x, uFade.y, zl));
        if (a < 0.004) discard;
        gl_FragColor = vec4(mix(vec3(1.0), uInk, a), 1.0);
      }`,
  }));
  quad.frustumCulled = false;
  const oScene = new THREE.Scene(); oScene.add(quad);
  const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const swap = [];
  const api = {
    enabled: true,
    scale: opt.scale,
    K,
    // mark a subtree: 'solid' | 'leaf' | 'ground' | false
    mark(obj, kind) { obj.userData.outline = kind; return obj; },
    setSize(w, h) {
      const s = api.scale;
      const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
      rt.setSize(W, H); depth.image.width = W; depth.image.height = H;
      quad.material.uniforms.uPx.value.set(1 / W, 1 / H);
      // about opt.width pixels at 1080p, never under one G-buffer pixel
      quad.material.uniforms.uR.value = Math.max(1, opt.width * (h / 1080) * s);   // fractional: see the two rings
    },
    // call right after renderer.render(scene, camera), with the canvas as target
    render(scene, camera) {
      if (!api.enabled) return;
      const walk = (o, inh) => {
        if (!o.visible || !o.layers.test(camera.layers)) return;
        const mk = o.userData.outline;
        const k = mk === false ? -1 : mk ? K[mk] : inh;
        if (o.isMesh) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const kind = k === -1 ? null : k !== undefined ? k : autoKind(o, m);
          if (kind === null || (m.isShaderMaterial && k === undefined)) { swap.push([o, o.material, true]); o.visible = false; }
          else { swap.push([o, o.material, false]); o.material = gmat(o, m, kind); }
        } else if (o.isSprite || o.isPoints || o.isLine) { swap.push([o, o.material, true]); o.visible = false; return; }
        if (k === -1) return;
        for (const c of o.children) walk(c, k);
      };
      for (const c of scene.children) walk(c, undefined);
      const fog = scene.fog, bg = scene.background, env = scene.environment, ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate;
      const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), tm = renderer.toneMapping;
      scene.fog = null; scene.background = null; scene.environment = null; renderer.shadowMap.autoUpdate = false; renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x80ff00, 0); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
      for (let i = swap.length - 1; i >= 0; i--) { const [ob, m, hid] = swap[i]; ob.material = m; if (hid) ob.visible = true; }
      swap.length = 0;
      scene.fog = fog; scene.background = bg; scene.environment = env; renderer.shadowMap.autoUpdate = su; renderer.toneMapping = tm;
      const u = quad.material.uniforms; u.uNear.value = camera.near; u.uFar.value = camera.far;
      renderer.autoClear = false; renderer.render(oScene, oCam); renderer.autoClear = ac;
    },
    dispose() { rt.dispose(); depth.dispose(); quad.material.dispose(); },
  };
  api.setSize(size.x, size.y);
  return api;
}
