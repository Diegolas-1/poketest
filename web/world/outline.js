// Anime ink lines, one system with two parts:
//  1. Vector ink (addEdgeLines, bottom of this file) for hard surfaces:
//     buildings, the lab, fences, lamps, signs, the pier, props. Real
//     anti-aliased line geometry of a constant pixel width on silhouettes and
//     modelled creases, chosen per frame in the vertex shader.
//  2. A screen-space pass (createOutline) for what has no clean edges:
//     characters (skinned), tree canopies and bushes (one silhouette per
//     plant), rocks and other scattered props. After the normal render, the
//     scene is drawn once more into a G-buffer: view-space normal (octahedral,
//     RG), an object/instance id (B) and a kind (A), plus depth. A mask pass
//     then measures line coverage at several sub-pixel points (supersampled
//     G-buffer on better devices), a composite pass smooths it along the line
//     (FXAA-like) and lays dark ink over the picture. Constant pixel width,
//     fades into the fog, follows the vertex shaders (wind sway, skinning).
//
// Kinds for the screen-space pass (mesh.userData.outline, inherited; false =
// not drawn):
//   'solid'  characters and other props: silhouettes, creases, part edges
//   'leaf'   tree canopies and bushes: one silhouette per plant, no line per
//            card, small holes in the canopy stay clean
//   'ground' terrain, water, small plants and every mesh with vector ink:
//            hides lines behind it, draws none
//   false    left out of the pass (decals, glow, sky)
// Unmarked meshes: ShaderMaterials, sprites, depthWrite-off and polygonOffset
// (decal) materials are left out; cut-out leaf materials are 'leaf'; anything
// smaller than SMALL metres is 'ground'; the rest is 'solid'.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const K = { sky: 0, ground: 1, leaf: 2, solid: 3 };
const SMALL = 0.4;

export function createOutline(renderer, o = {}) {
  const opt = { color: '#2a2132', strength: 1, width: 1.1, scale: 1, fadeNear: 70, fadeFar: 170, idFar: 30, creaseFar: 48, ...o };
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
  // one id per object; meshes sharing userData.outlineGroup share one (no line between them)
  const hashStr = (t) => { let h = 7; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 100003; return h; };
  const idOf = (obj) => { const g = obj.userData.outlineGroup; const n = g !== undefined ? hashStr(String(g)) + 1e6 : obj.id; return ((n * 0.61803399) % 1 + 1) % 1; };
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

  // ---------- the ink passes ----------
  // 1. mask: line coverage per screen pixel, from several sub-pixel samples of
  //    the G-buffer (supersampled on better devices), so edges come out soft
  // 2. composite: the mask smoothed along the line's direction (an FXAA-like
  //    filter for one channel, which takes out the last stair steps), laid
  //    over the picture in dark ink. The picture itself keeps its MSAA.
  const mask = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  const VQ = 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const maskMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    defines: { SUB: 4 },
    uniforms: {
      tG: { value: rt.texture }, tD: { value: depth }, uPx: { value: new THREE.Vector2() }, uR: { value: 1.5 },
      uNear: { value: 0.1 }, uFar: { value: 1000 },
      uFade: { value: new THREE.Vector2(opt.fadeNear, opt.fadeFar) },
      uDet: { value: new THREE.Vector2(opt.idFar, opt.creaseFar) },
    },
    vertexShader: VQ,
    fragmentShader: `
      uniform sampler2D tG, tD; uniform vec2 uPx, uFade, uDet; uniform float uR, uNear, uFar;
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
      // how strong a line between two surfaces (p is the farther one): a
      // continuous strength, not a yes/no, so lines ease in and out.
      // silhouettes: a change of kind or object with a real depth jump
      float edgeSil(S p, S q) {
        float z = q.z;
        if (p.k != q.k) return 1.0;
        if (p.k < 0.5) return 0.0;
        float thr = (0.025 * z + 0.04) / max(abs(q.n.z), 0.2);
        return smoothstep(thr * 0.7, thr * 1.3, p.z - q.z);
      }
      // inner detail (creases, one part against another on the same body,
      // e.g. hair over a face): drawn thinner, one pixel, and fading sooner
      float edgeDet(S p, S q) {
        float z = q.z;
        if (p.k != q.k || p.k < 0.5) return 0.0;
        float e = smoothstep(0.78, 0.62, dot(p.n, q.n)) * (1.0 - smoothstep(uDet.y * 0.5, uDet.y, z));
        if (abs(p.id - q.id) > 0.002) e = max(e, 1.0 - smoothstep(uDet.x * 0.5, uDet.x, z));
        return e;
      }
      bool same(S a, S b) { return a.k == b.k && abs(a.id - b.id) < 0.002 && abs(a.z - b.z) < 0.15 * a.z + 0.1; }
      // ink at one sample point: is there an edge within uR pixels?
      float inkAt(vec2 uv, out float zl) {
        S p = get(uv);
        float hit = 0.0; zl = 1e9;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982;
          vec2 d = vec2(cos(a), sin(a)) * uPx;
          S q = get(uv + d * uR);
          // solid lines: ink the farther side of an edge, so lines sit just
          // outside a silhouette (or on one side of a crease)
          S qd = get(uv + d);
          if (p.k > 2.5 && qd.k > 2.5 && qd.z <= p.z) { float e = edgeDet(p, qd); if (e > 0.0) { hit += e * 0.8; zl = min(zl, qd.z); } }
          if ((p.k > 2.5 || q.k > 2.5) && q.z <= p.z && abs(q.k - 2.0) > 0.5) {
            float e = edgeSil(p, q);
            if (e > 0.0) {
              // a thin part (a picket, a rail) under ~1.5 px across: its two
              // lines would merge into a flickering smear, so ease it off
              S q3 = get(uv + d * (uR + 1.5));
              if (!same(q3, q)) e *= 0.35;
              hit += e; zl = min(zl, q.z);
            }
          }
          // canopy lines: one per plant, inside its silhouette; a hole smaller
          // than 3 line widths (sky between leaf cards) stays clean
          if (abs(p.k - 2.0) < 0.5) {
            S q2 = get(uv + d * uR * 3.0);
            float g1 = q.k == 2.0 ? max(0.3, 0.05 * p.z) : 0.1 + 0.01 * p.z;
            float g2 = q2.k == 2.0 ? max(0.3, 0.05 * p.z) : 0.1 + 0.01 * p.z;
            bool o1 = (q.k != 2.0 || abs(q.id - p.id) > 0.002) && q.z > p.z + g1;
            bool o2 = (q2.k != 2.0 || abs(q2.id - p.id) > 0.002) && q2.z > p.z + g2;
            if (o1 && o2) { hit += 1.0; zl = min(zl, p.z); }
          }
        }
        return clamp(hit / 1.5, 0.0, 1.0);
      }
      void main() {
        // rotated-grid sub-pixel samples (in screen pixels)
        vec2 o[4];
        o[0] = vec2(-0.125, -0.375); o[1] = vec2(0.375, -0.125); o[2] = vec2(0.125, 0.375); o[3] = vec2(-0.375, 0.125);
        float c = 0.0, zl = 1e9, z;
        for (int i = 0; i < SUB; i++) {
          vec2 off = SUB == 1 ? vec2(0.0) : SUB == 2 ? o[i * 2] : o[i];
          c += inkAt(vU + off * uPx, z); zl = min(zl, z);
        }
        c /= float(SUB);
        c *= 1.0 - smoothstep(uFade.x, uFade.y, zl);
        gl_FragColor = vec4(c, c, c, 1.0);
      }`,
  });
  const ink = new THREE.Color(opt.color).convertLinearToSRGB();   // drawn straight onto the sRGB canvas
  const compMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, transparent: true, blending: THREE.NormalBlending,
    uniforms: { tM: { value: mask.texture }, uPx: { value: new THREE.Vector2() }, uInk: { value: new THREE.Vector3(ink.r, ink.g, ink.b) }, uStr: { value: opt.strength } },
    vertexShader: VQ,
    fragmentShader: `
      uniform sampler2D tM; uniform vec2 uPx; uniform vec3 uInk; uniform float uStr; varying vec2 vU;
      float m(vec2 o) { return texture2D(tM, vU + o * uPx).r; }
      void main() {
        float c = m(vec2(0.0));
        float l = m(vec2(-1.0, 0.0)), r = m(vec2(1.0, 0.0)), d = m(vec2(0.0, -1.0)), u = m(vec2(0.0, 1.0));
        vec2 g = vec2(r - l, u - d);
        float gl = length(g);
        float a = c;
        if (gl > 0.05) {
          // smooth along the line (across the gradient stays sharp)
          vec2 t = vec2(-g.y, g.x) / gl;
          a = (c * 2.0 + m(t) + m(-t) + 0.5 * (m(t * 2.0) + m(-t * 2.0))) / 5.0;
        }
        // a gentle falloff curve: full ink in the middle, soft edges
        a = smoothstep(0.0, 0.85, a) * uStr;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uInk, a);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), maskMat);
  quad.frustumCulled = false;
  const oScene = new THREE.Scene(); oScene.add(quad);
  const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const swap = [];
  const api = {
    enabled: true,
    // the vector lines' shared material (hide it to turn vector ink off)
    get lines() { return lineMat; },
    scale: opt.scale,
    K,
    // mark a subtree: 'solid' | 'leaf' | 'ground' | false
    mark(obj, kind) { obj.userData.outline = kind; return obj; },
    // w, h: the canvas drawing buffer. The G-buffer is api.scale times that
    // (capped near 4.5 Mpx), the mask and the line width are in screen pixels.
    setSize(w, h) {
      const s = Math.min(api.scale, Math.sqrt(4.5e6 / (w * h)));
      const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
      rt.setSize(W, H); depth.image.width = W; depth.image.height = H;
      mask.setSize(w, h);
      maskMat.uniforms.uPx.value.set(1 / w, 1 / h); compMat.uniforms.uPx.value.set(1 / w, 1 / h);
      edgeLinesSize(w, h);
      // about opt.width pixels at 1080p (so it follows DPR), at least 1
      maskMat.uniforms.uR.value = Math.max(1.0, opt.width * (h / 1080));   // same width as the vector ink
      // sub-pixel samples: 4 when the G-buffer is supersampled, else 2
      const sub = s > 1.01 ? 4 : 2;
      if (maskMat.defines.SUB !== sub) { maskMat.defines.SUB = sub; maskMat.needsUpdate = true; }
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
      // nothing past fadeFar gets a line, so the G-buffer stops there: the far
      // trees, hills and sea are left out of this pass (and depth gets finer)
      const far = camera.far, gFar = Math.min(far, opt.fadeFar + 15);
      if (gFar !== far) { camera.far = gFar; camera.updateProjectionMatrix(); }
      renderer.setRenderTarget(rt); renderer.setClearColor(0x80ff00, 0); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
      for (let i = swap.length - 1; i >= 0; i--) { const [ob, m, hid] = swap[i]; ob.material = m; if (hid) ob.visible = true; }
      swap.length = 0;
      scene.fog = fog; scene.background = bg; scene.environment = env; renderer.shadowMap.autoUpdate = su; renderer.toneMapping = tm;
      const u = maskMat.uniforms; u.uNear.value = camera.near; u.uFar.value = camera.far;
      if (gFar !== far) { camera.far = far; camera.updateProjectionMatrix(); }
      quad.material = maskMat; renderer.setRenderTarget(mask); renderer.render(oScene, oCam);
      renderer.setRenderTarget(null);
      quad.material = compMat; renderer.autoClear = false; renderer.render(oScene, oCam); renderer.autoClear = ac;
    },
    dispose() { rt.dispose(); depth.dispose(); mask.dispose(); maskMat.dispose(); compMat.dispose(); },
  };
  api.setSize(size.x, size.y);
  return api;
}

// ---------- vector ink for hard surfaces ----------
// Buildings and props get real lines (geometry, not a filter): each mesh's
// edges with the normals of the two faces they join. The line shader keeps an
// edge only when it is a crease (faces meet at more than CREASE) facing the
// camera, an open boundary, or a silhouette right now (one face toward the
// camera, the other away), and drops the rest; lines are a constant number of
// pixels wide with soft, anti-aliased sides, and fade into the distance. The
// lined meshes get a polygon offset (their faces step back, most where they
// are steep to the view) so their own faces never eat a line. One line
// object per group of static meshes. Meshes that get lines are marked
// 'ground' for the screen-space pass, so they draw no second line there.

export const INK_LAYER = 2;
const CREASE = Math.cos(THREE.MathUtils.degToRad(32));
// width: pixels at 1080p near the player; lines thin to nothing with distance
// from the player (focus), so far-off detail never clots into black
const EDGE = { width: 1.1, color: '#2a2132', opacity: 1, pull: 0.0003, fade: [70, 170], focus: [10, 55] };
const lineMat = new LineMaterial({ color: new THREE.Color(EDGE.color), linewidth: 3, transparent: true, depthWrite: false, opacity: EDGE.opacity, fog: true });
lineMat.userData.u = { uCore: { value: 2 }, uPull: { value: EDGE.pull }, uFadeL: { value: new THREE.Vector2(...EDGE.fade) },
  uFocus: { value: new THREE.Vector3() }, uFocusR: { value: new THREE.Vector2(...EDGE.focus) } };
// the player's position: lines are full width around it and thin away from it
export function setInkFocus(p) { lineMat.userData.u.uFocus.value.copy(p); }
lineMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, lineMat.userData.u);
  sh.vertexShader = sh.vertexShader
    .replace('attribute vec3 instanceStart;', 'attribute vec3 instanceStart;\nattribute vec3 instanceN1, instanceN2;\nattribute float instanceK;\nuniform float uPull;\nuniform vec2 uFadeL, uFocusR;\nuniform vec3 uFocus;\nvarying float vFadeL, vInkW;')
    .replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );', `vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );
      vec3 inkN1 = normalMatrix * instanceN1, inkN2 = normalMatrix * instanceN2, eMid = 0.5 * (start.xyz + end.xyz);
      float f1 = dot(inkN1, -eMid), f2 = dot(inkN2, -eMid);
      // a silhouette: one face toward the camera, the other away
      bool inkSil = (f1 > 0.0) != (f2 > 0.0);
      vec3 inkOut = f1 > 0.0 ? inkN1 : inkN2;
      bool show = instanceK > 1.5 || (instanceK > 0.5 && (f1 > 0.0 || f2 > 0.0)) || inkSil;
      vFadeL = 1.0 - smoothstep(uFadeL.x, uFadeL.y, -eMid.z);
      // creases inside a shape are detail: a little thinner than the outline,
      // and gone sooner, so small parts far off (balusters, window bars) stay light
      vInkW = inkSil ? 1.0 : 0.72;
      float dFocus = distance(eMid, (viewMatrix * vec4(uFocus, 1.0)).xyz);
      vInkW *= 1.0 - smoothstep(uFocusR.x, uFocusR.y, dFocus);
      vFadeL *= smoothstep(0.0, 0.2, vInkW);
      if (!inkSil) vFadeL *= 1.0 - smoothstep(uFadeL.x * 0.35, uFadeL.x * 0.85, -eMid.z);
      if (!show || vFadeL <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
      start.xyz *= 1.0 - uPull; end.xyz *= 1.0 - uPull;`)
    // a silhouette line sits wholly outside the shape (its inner side on the
    // edge), so the shape's own faces never cover half of it
    .replace('if ( position.x < 0.0 ) offset *= - 1.0;', `if ( position.x < 0.0 ) offset *= - 1.0;
      if (inkSil && length(inkOut.xy) > 1e-4) {
        vec2 pu = offset * (position.x < 0.0 ? -1.0 : 1.0);
        offset += pu * sign(dot(pu * vec2(aspect, 1.0), inkOut.xy));
      }
      offset *= vInkW;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('uniform float linewidth;', 'uniform float linewidth;\nuniform float uCore;\nvarying float vFadeL, vInkW;')
    .replace('float alpha = opacity;', `float alpha = opacity * vFadeL;
      // soft sides: the quad is a pixel and a half wider than the line
      alpha *= clamp((uCore * 0.5 - abs(vUv.x) * linewidth * 0.5) * vInkW + 0.5, 0.0, 1.0);`);
};
lineMat.customProgramCacheKey = () => 'inkedges';

// line width in drawing-buffer pixels (about EDGE.width at 1080p)
export function edgeLinesSize(w, h) {
  const core = Math.max(1.0, EDGE.width * h / 1080);
  lineMat.resolution.set(w, h);
  lineMat.linewidth = core + 1.5;
  lineMat.userData.u.uCore.value = core;
}

const skipMat = (m) => !m || m.isShaderMaterial || m.depthWrite === false || m.polygonOffset || (m.transparent && m.opacity < 0.99) ||
  (m.alphaTest > 0 && m.map) || /leaf|bark|wind/.test(m.customProgramCacheKey ? m.customProgramCacheKey() : '');

// edges of one geometry, positions taken through m4, appended to out
function collectEdges(geo, m4, out) {
  const P = geo.attributes.position; if (!P) return;
  const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : P.count;
  const v = new THREE.Vector3(), key = new Map(), weld = new Int32Array(P.count), pts = [];
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(m4);
    const k = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let id = key.get(k); if (id === undefined) { id = pts.length / 3; key.set(k, id); pts.push(v.x, v.y, v.z); }
    weld[i] = id;
  }
  // the mesh's own vertex normals tell a modelled hard edge (split normals:
  // box corners, cylinder rims) from a smooth curve made of flat facets (a
  // sphere, a torus), which only ever gets a silhouette line
  const N = geo.attributes.normal;
  const smooth = (va, vb) => !N || Math.abs(N.getX(va) - N.getX(vb)) + Math.abs(N.getY(va) - N.getY(vb)) + Math.abs(N.getZ(va) - N.getZ(vb)) < 0.02;
  const edges = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t + 2 < n; t += 3) {
    const r0 = idx ? idx[t] : t, r1 = idx ? idx[t + 1] : t + 1, r2 = idx ? idx[t + 2] : t + 2;
    const i0 = weld[r0], i1 = weld[r1], i2 = weld[r2];
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    a.fromArray(pts, i0 * 3); b.fromArray(pts, i1 * 3); c.fromArray(pts, i2 * 3);
    const nr = b.sub(a).cross(c.sub(a)); const l = nr.length(); if (l < 1e-10) continue; nr.divideScalar(l);
    for (const [p, q, rp, rq] of [[i0, i1, r0, r1], [i1, i2, r1, r2], [i2, i0, r2, r0]]) {
      const k = p < q ? p * 4194304 + q : q * 4194304 + p;
      const e = edges.get(k);
      if (!e) edges.set(k, [p, q, nr.x, nr.y, nr.z, 0, 0, 0, 1, p < q ? rp : rq, p < q ? rq : rp, 0]);
      else if (e[8] === 1) {
        e[5] = nr.x; e[6] = nr.y; e[7] = nr.z; e[8] = 2;
        // hard when the corners' normals differ from one face to the other
        const sp = p < q ? rp : rq, sq = p < q ? rq : rp;
        e[11] = smooth(e[9], sp) && smooth(e[10], sq) ? 0 : 1;
      } else e[8]++;
    }
  }
  for (const e of edges.values()) {
    let kind;
    if (e[8] === 1) { kind = 2; e[5] = e[2]; e[6] = e[3]; e[7] = e[4]; }
    else {
      const d = e[2] * e[5] + e[3] * e[6] + e[4] * e[7];
      if (e[8] === 2 && d > 0.9995) continue;            // flat: a triangle's diagonal
      kind = e[8] > 2 || (e[11] && d < CREASE) ? 1 : 0;   // a hard crease, else a silhouette candidate
    }
    out.pos.push(pts[e[0] * 3], pts[e[0] * 3 + 1], pts[e[0] * 3 + 2], pts[e[1] * 3], pts[e[1] * 3 + 1], pts[e[1] * 3 + 2]);
    out.n1.push(e[2], e[3], e[4]); out.n2.push(e[5], e[6], e[7]); out.k.push(kind);
  }
}
function linesFrom(out) {
  const g = new LineSegmentsGeometry();
  g.setPositions(out.pos);
  g.setAttribute('instanceN1', new THREE.InstancedBufferAttribute(new Float32Array(out.n1), 3));
  g.setAttribute('instanceN2', new THREE.InstancedBufferAttribute(new Float32Array(out.n2), 3));
  g.setAttribute('instanceK', new THREE.InstancedBufferAttribute(new Float32Array(out.k), 1));
  const L = new LineSegments2(g, lineMat);
  L.userData.outline = false; L.userData.inkLines = true; L.castShadow = false; L.receiveShadow = false;
  L.raycast = () => {};
  L.layers.set(INK_LAYER);   // drawn last, after the grass, so nothing paints over a line
  return L;
}


// ---------- one shape from overlapping parts ----------
// Many props are built from overlapping parts (a roof slab running into the
// ridge, a wall standing in its foundation). Before the parts are merged
// (town.js mergeStatic), each part's edges are cut against the other parts:
// any stretch of an edge that lies inside or on another part is dropped, so
// only the outside of the whole shape gets ink. Parts are tested as convex
// solids (boxes, cylinders, cones, prisms); a concave part still gets its own
// lines cut but hides nothing.
const SOLID_EPS = 0.004;
export function inkSolid(geo, m4) {
  const P = geo.attributes.position; if (!P) return null;
  const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : P.count;
  if (n / 3 > 1500) return null;
  const v = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) v.push(new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(m4));
  const planes = [], seen = new Set();
  const box = new THREE.Box3().setFromPoints(v);
  for (let t = 0; t + 2 < n; t += 3) {
    a.copy(v[idx ? idx[t] : t]); b.copy(v[idx ? idx[t + 1] : t + 1]); c.copy(v[idx ? idx[t + 2] : t + 2]);
    const nr = b.clone().sub(a).cross(c.clone().sub(a)); const l = nr.length(); if (l < 1e-9) continue; nr.divideScalar(l);
    const d = nr.dot(a), k = `${nr.x.toFixed(3)},${nr.y.toFixed(3)},${nr.z.toFixed(3)},${d.toFixed(3)}`;
    if (seen.has(k)) continue; seen.add(k); planes.push(nr.x, nr.y, nr.z, d);
  }
  // convex: every vertex behind (or on) every face plane
  for (let i = 0; i < planes.length; i += 4) for (const p of v) if (planes[i] * p.x + planes[i + 1] * p.y + planes[i + 2] * p.z - planes[i + 3] > 0.002) return { box, planes: null };
  return { box, planes: new Float32Array(planes) };
}
function inside(s, x, y, z) {
  const b = s.box, e = SOLID_EPS;
  if (x < b.min.x - e || x > b.max.x + e || y < b.min.y - e || y > b.max.y + e || z < b.min.z - e || z > b.max.z + e) return false;
  const p = s.planes;
  for (let i = 0; i < p.length; i += 4) if (p[i] * x + p[i + 1] * y + p[i + 2] * z - p[i + 3] > e) return false;
  return true;
}
// edges of one part (geo through m4), cut against the other solids
export function partEdges(geo, m4, solids, self) {
  const raw = { pos: [], n1: [], n2: [], k: [] }, out = { pos: [], n1: [], n2: [], k: [] };
  collectEdges(geo, m4, raw);
  const others = solids.filter((s, i) => i !== self && s && s.planes);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), eb = new THREE.Box3();
  for (let e = 0; e < raw.k.length; e++) {
    A.fromArray(raw.pos, e * 6); B.fromArray(raw.pos, e * 6 + 3);
    eb.makeEmpty().expandByPoint(A).expandByPoint(B).expandByScalar(SOLID_EPS);
    const near = others.filter((s) => s.box.intersectsBox(eb));
    const push = (t0, t1) => {
      out.pos.push(A.x + (B.x - A.x) * t0, A.y + (B.y - A.y) * t0, A.z + (B.z - A.z) * t0, A.x + (B.x - A.x) * t1, A.y + (B.y - A.y) * t1, A.z + (B.z - A.z) * t1);
      out.n1.push(raw.n1[e * 3], raw.n1[e * 3 + 1], raw.n1[e * 3 + 2]); out.n2.push(raw.n2[e * 3], raw.n2[e * 3 + 1], raw.n2[e * 3 + 2]); out.k.push(raw.k[e]);
    };
    if (!near.length) { push(0, 1); continue; }
    const len = A.distanceTo(B), N = Math.max(2, Math.min(96, Math.ceil(len / 0.03)));
    let start = -1;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, z = A.z + (B.z - A.z) * t;
      const hid = near.some((s) => inside(s, x, y, z));
      if (!hid && start < 0) start = Math.max(0, (i - 0.5) / N);
      if (hid && start >= 0) { push(start, Math.min(1, (i - 0.5) / N)); start = -1; }
    }
    if (start >= 0) push(start, 1);
  }
  return out;
}
export const inkSkip = (m) => skipMat(m);

// Give every static hard-surface mesh under root vector ink. Meshes directly
// under one parent share a line object (in that parent's space); a mesh that
// moves on its own (userData.keep) gets its own. Returns the edge count.
export function addEdgeLines(root) {
  root.updateMatrixWorld(true);
  const byParent = new Map(), own = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.inkLines || o.userData.outline === false) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (skipMat(m)) return;
    if (o.userData.keep) own.push(o);
    else { if (!byParent.has(o.parent)) byParent.set(o.parent, []); byParent.get(o.parent).push(o); }
  });
  let count = 0;
  // the faces step back a little (more where they are steep to the view, as
  // at a silhouette), so the line along their edge is never eaten by them
  const done = (o) => {
    o.userData.outline = 'ground';
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = 0.6; m.polygonOffsetUnits = 1; }
  };
  for (const [parent, list] of byParent) {
    // edges cut against the parts before they were merged (partEdges), if any
    const pre = parent.userData.inkEdges;
    const out = pre || { pos: [], n1: [], n2: [], k: [] };
    for (const o of list) { o.updateMatrix(); if (!pre) collectEdges(o.geometry, o.matrix, out); done(o); }
    delete parent.userData.inkEdges;
    if (out.k.length) { parent.add(linesFrom(out)); count += out.k.length; }
  }
  for (const o of own) {
    const out = { pos: [], n1: [], n2: [], k: [] };
    collectEdges(o.geometry, new THREE.Matrix4(), out); done(o);
    if (out.k.length) { o.add(linesFrom(out)); count += out.k.length; }
  }
  return count;
}
