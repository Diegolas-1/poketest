// Anime ink outlines: a thin dark line round the outer silhouette of marked
// meshes (tree canopies, trunks), not on every inner card. Screen space:
// the marked meshes are drawn into an id mask (everything else as a black
// occluder), then a full-screen pass inks the mask's outer edges on top.
// Mark meshes with mesh.userData.ink = 'leaf' | 'bark'.
import * as THREE from 'three';

export function createInk(renderer, { leaf = '#1d3a3a', bark = '#3a3328', width = 1.5, hole = 3 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mask = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true });
  const occ = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const barkM = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const leafMs = new Map();   // one per leaf map, cut out like the cards
  const leafMask = (m) => {
    if (!leafMs.has(m.map)) {
      const k = new THREE.MeshBasicMaterial({ map: m.map, alphaTest: m.alphaTest || 0.45, side: THREE.DoubleSide });
      // the same cut as the leaf cards: edge-on cards thin out (see leafMaterial)
      k.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying vec3 vVP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vVP = -mvPosition.xyz;');
        sh.fragmentShader = 'varying vec3 vVP;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
          vec3 fN = normalize(cross(dFdx(vVP), dFdy(vVP)));
          float edgeOn = abs(dot(fN, normalize(vVP)));
          vec2 tl = fract(vMapUv * 4.0) - 0.5;
          if (diffuseColor.a < alphaTest || length(tl) > mix(0.0, 0.75, smoothstep(0.1, 0.5, edgeOn))) discard;
          diffuseColor.rgb = vec3(1.0, 0.0, 0.0);`);
      };
      leafMs.set(m.map, k);
    }
    return leafMs.get(m.map);
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uMask: { value: mask.texture }, uPx: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      uW: { value: width }, uHole: { value: hole }, uLeaf: { value: new THREE.Color(leaf) }, uBark: { value: new THREE.Color(bark) } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D uMask; uniform vec2 uPx; uniform float uW, uHole; uniform vec3 uLeaf, uBark; varying vec2 vU;
      float tree(vec4 m){ return max(m.r, m.g); }
      void main(){
        vec4 c = texture2D(uMask, vU);
        float ink = 0.0; vec3 col = uLeaf; float nl = 0.0, nb = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236; vec2 d = vec2(cos(a), sin(a)) * uPx;
          vec4 n1 = texture2D(uMask, vU + d * uW), n2 = texture2D(uMask, vU + d * uW * uHole);
          if (tree(c) > 0.5) {
            // tree pixel beside open background (a real gap, not a tiny hole between cards)
            if (tree(n1) < 0.5 && tree(n2) < 0.5) ink = 1.0;
            // a canopy lobe in front of the trunk gets its line too
            if (c.r > 0.5 && n1.g > 0.5 && n2.g > 0.5) ink = 1.0;
          } else if (tree(n1) > 0.5) { ink = max(ink, 0.7); nl += n1.r; nb += n1.g; }
        }
        if (tree(c) > 0.5) col = c.r > 0.5 ? uLeaf : uBark; else col = nl >= nb ? uLeaf : uBark;
        if (ink < 0.01) discard;
        gl_FragColor = vec4(col, ink * 0.92);
        #include <colorspace_fragment>
      }`,
  }));
  const oScene = new THREE.Scene(); oScene.add(quad);
  const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const swap = [];
  return {
    setSize(w, h) { mask.setSize(w, h); quad.material.uniforms.uPx.value.set(1 / w, 1 / h); },
    // call after the normal render of scene with camera
    render(scene, camera) {
      scene.traverseVisible((o) => {
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const k = o.userData.ink;
        if (!k && m.depthWrite === false) { swap.push([o, o.material, o.visible]); o.visible = false; return; }
        swap.push([o, o.material, o.visible]);
        o.material = k === 'leaf' ? leafMask(m) : k === 'bark' ? barkM : occ;
      });
      const fog = scene.fog, bg = scene.background, ac = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      scene.fog = null; scene.background = null;
      renderer.setRenderTarget(mask); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
      for (const [o, m, v] of swap) { o.material = m; o.visible = v; }
      swap.length = 0; scene.fog = fog; scene.background = bg;
      renderer.autoClear = false; renderer.render(oScene, oCam); renderer.autoClear = ac;
    },
  };
}
