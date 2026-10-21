// Kept for the preview pages (trees.html, oldtree.html with ?ink=1): the old
// mask-based tree ink, now a thin wrapper over the game's outline pass
// (outline.js), so previews show the same lines as the town.
// Meshes marked userData.ink = 'leaf' | 'bark' get lines; every other mesh
// only hides lines behind it.
import { createOutline } from './outline.js';

export function createInk(renderer, o = {}) {
  const out = createOutline(renderer, o);
  return {
    setSize(w, h) { out.setSize(w, h); },
    render(scene, camera) {
      scene.traverse((m) => {
        if (!m.isMesh || m.userData.outline !== undefined) return;
        m.userData.outline = m.material.isShaderMaterial ? false : m.userData.ink === 'leaf' ? 'leaf' : m.userData.ink === 'bark' ? 'solid' : 'ground';
      });
      out.render(scene, camera);
    },
  };
}
