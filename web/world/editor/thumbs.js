// Asset browser thumbnails: each asset built once by its builder and drawn
// small from the front corner, one at a time while the editor is idle.
import * as THREE from 'three';
import { makeKind } from '../editlayer/objects.js';

export function createThumbs() {
  const SZ = 112;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(SZ, SZ); r.setPixelRatio(1); r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e2f1ff', '#6d7f4c', 1.1));
  const sun = new THREE.DirectionalLight('#fff0d4', 2.6); sun.position.set(-3, 5, 4); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 500);
  const cache = new Map(), queue = [];
  let busy = false;
  const pump = () => {
    if (busy || !queue.length) return;
    busy = true;
    setTimeout(() => {
      const { a, cv } = queue.shift();
      try {
        const g = makeKind(a.kind, a.params || {});
        scene.add(g);
        const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
        const d = Math.max(s.x, s.y, s.z) * 1.9 + 0.2;
        cam.position.set(c.x + d * 0.62, c.y + d * 0.42, c.z + d * 0.75); cam.lookAt(c);
        r.render(scene, cam);
        cv.getContext('2d').drawImage(r.domElement, 0, 0);
        cv.done = true;
        for (const v of cv.views) v.getContext('2d').drawImage(cv, 0, 0);
        scene.remove(g);
      } catch (e) { const x = cv.getContext('2d'); x.fillStyle = '#5a3a3a'; x.fillRect(0, 0, SZ, SZ); console.warn('thumb', a.kind, e); }
      busy = false; pump();
    }, 30);
  };
  return {
    get(a) {
      if (!cache.has(a.kind)) {
        const cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ; cv.views = [];
        cache.set(a.kind, cv); queue.push({ a, cv }); pump();
      }
      // a copy for each place it is shown (filled in when drawn)
      const src = cache.get(a.kind), cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ;
      if (src.done) cv.getContext('2d').drawImage(src, 0, 0); else { src.views = src.views.filter((v) => v.isConnected); src.views.push(cv); }
      return cv;
    },
  };
}
