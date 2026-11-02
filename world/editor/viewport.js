// The viewport: renderer, the editor camera (orbit and Godot-style freelook),
// picking (pieces, plants, the ground), the transform gizmo and the brush ring.
//   right drag: look around (freelook); hold it and WASD / QE fly (Shift faster)
//   middle drag or Alt + left drag: orbit   Shift + middle / right drag: pan
//   wheel: zoom toward the cursor
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { E } from '../editlayer/index.js';

export function createViewport(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 4000);
  const V = {
    renderer, camera, canvas, scene: null, world: null,
    target: new THREE.Vector3(0, 0, 0), yaw: 0.5, pitch: 0.75, dist: 90, fly: false,
    keys: new Set(), drag: null, gizmo: null, shadows: true, onPick: null, onBrush: null, brush: null,
    mouse: new THREE.Vector2(), hover: null, ndc: new THREE.Vector2(),
  };
  const resize = () => {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  // ---------- camera ----------
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  V.place = () => {
    const cp = Math.cos(V.pitch);
    const dir = new THREE.Vector3(Math.sin(V.yaw) * cp, Math.sin(V.pitch), Math.cos(V.yaw) * cp);
    camera.position.copy(V.target).addScaledVector(dir, V.dist);
    camera.lookAt(V.target);
  };
  V.focus = (p, d) => { V.target.copy(p); if (d) V.dist = d; V.place(); };
  V.update = (dt) => {
    if (V.fly) {
      const sp = (V.keys.has('ShiftLeft') || V.keys.has('ShiftRight') ? 60 : 18) * dt;
      camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
      const m = new THREE.Vector3();
      if (V.keys.has('KeyW')) m.add(fwd); if (V.keys.has('KeyS')) m.sub(fwd);
      if (V.keys.has('KeyD')) m.add(right); if (V.keys.has('KeyA')) m.sub(right);
      if (V.keys.has('KeyE')) m.y += 1; if (V.keys.has('KeyQ')) m.y -= 1;
      if (m.lengthSq()) { m.normalize().multiplyScalar(sp); V.target.add(m); }
    }
    V.place();
    // shadows follow the view's target
    const sun = V.world && V.world.sun;
    if (sun) {
      const c = V.target.clone(); c.y = 0;
      sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(-0.55, 0.75, 0.45).normalize().multiplyScalar(150));
      renderer.shadowMap.enabled = V.shadows;
    }
  };

  // ---------- picking ----------
  const ray = new THREE.Raycaster();
  V.rayAt = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    V.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(V.ndc, camera);
    return ray;
  };
  // the ground under a ray: march along it over the height field, then refine
  V.ground = (rr = ray) => {
    const H = E.fn.meshY || E.fn.height;
    if (!H) return null;
    const o = rr.ray.origin, d = rr.ray.direction;
    let t = 0, prev = 0, step = 0.5;
    for (let i = 0; i < 2000 && t < 3000; i++) {
      const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
      if (y < H(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 18; k++) { const m = (a + b) / 2; const mx = o.x + d.x * m, mz = o.z + d.z * m; if (o.y + d.y * m < H(mx, mz)) b = m; else a = m; }
        return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
      }
      prev = t; t += step; step = Math.min(4, 0.5 + t * 0.01);
    }
    return null;
  };
  // the piece / plant under a ray
  V.pick = (rr = ray) => {
    if (!V.world) return null;
    const hits = rr.intersectObjects([V.world.town.group, ...V.extraPickables()], true);
    const g = V.ground(rr), gd = g ? g.distanceTo(rr.ray.origin) : Infinity;
    for (const h of hits) {
      if (h.distance > gd + 0.3) break;
      if (!visible(h.object)) continue;
      if (h.object.userData.noPick) continue;
      return h;
    }
    // plants
    const vh = rr.intersectObjects(V.vegMeshes(), false);
    for (const h of vh) if (h.distance < gd + 0.5 && h.instanceId !== undefined) return h;
    return g ? { ground: true, point: g, distance: gd } : null;
  };
  V.extraPickables = () => [];
  V.vegMeshes = () => {
    const out = [];
    if (V.world) for (const sc of V.world.veg.scatters) for (const c of sc.chunks) for (const m of c.meshes) if (m.visible) out.push(m);
    return out;
  };
  const visible = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };

  // ---------- gizmo ----------
  const tc = new TransformControls(camera, canvas);
  tc.setSize(0.9);
  V.gizmo = tc;
  V.gizmoHelper = tc.getHelper();

  // ---------- brush ring ----------
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(65 * 3 * 2), 3));
  const ring = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color: 0xffb04a, depthTest: false, transparent: true }));
  ring.renderOrder = 999; ring.frustumCulled = false; ring.visible = false; ring.userData.noPick = true;
  V.ring = ring;
  V.showRing = (p, r, inner = 0.5) => {
    if (!p) { ring.visible = false; return; }
    const H = E.fn.meshY || E.fn.height, a = ringGeo.attributes.position;
    let k = 0;
    for (const rr of [r, r * inner]) for (let i = 0; i < 64; i += 2) {
      for (const j of [i, i + 1]) { const t = j / 64 * Math.PI * 2, x = p.x + Math.cos(t) * rr, z = p.z + Math.sin(t) * rr; a.setXYZ(k++, x, H(x, z) + 0.15, z); }
    }
    a.needsUpdate = true; ringGeo.setDrawRange(0, k); ringGeo.computeBoundingSphere();
    ring.visible = true;
  };

  // ---------- input ----------
  canvas.tabIndex = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const mode = e.button === 2 ? (e.shiftKey ? 'pan' : 'look') : e.button === 1 ? (e.shiftKey ? 'pan' : 'orbit') : e.button === 0 && e.altKey ? 'orbit' : null;
    if (mode) {
      V.drag = { mode, x: e.clientX, y: e.clientY, moved: 0 };
      if (mode === 'look') V.fly = true;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0 && !tc.dragging && V.onDown) V.onDown(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    V.mouse.set(e.clientX, e.clientY);
    const d = V.drag;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.mode === 'pan') {
        const k = V.dist * 0.0016;
        camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
        V.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      } else if (d.mode === 'orbit') {
        V.yaw -= dx * 0.005; V.pitch = Math.max(-1.45, Math.min(1.5, V.pitch + dy * 0.005));
      } else {
        // freelook: the camera stays where it is and turns
        const eye = camera.position.clone();
        V.yaw -= dx * 0.004; V.pitch = Math.max(-1.45, Math.min(1.5, V.pitch + dy * 0.004));
        const cp = Math.cos(V.pitch);
        V.target.copy(eye).addScaledVector(new THREE.Vector3(Math.sin(V.yaw) * cp, Math.sin(V.pitch), Math.cos(V.yaw) * cp), -V.dist);
      }
      return;
    }
    if (V.onMove) V.onMove(e);
  });
  const up = (e) => {
    if (V.drag) { V.drag = null; V.fly = false; try { canvas.releasePointerCapture(e.pointerId); } catch { /* */ } return; }
    if (e.button === 0 && V.onUp) V.onUp(e);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (V.onWheel && V.onWheel(e)) return;
    const k = Math.exp(e.deltaY * 0.0012);
    // toward the point under the cursor
    const rr = V.rayAt(e.clientX, e.clientY), g = V.ground(rr);
    if (g && k < 1) V.target.lerp(g, 1 - k);
    V.dist = Math.max(2, Math.min(1500, V.dist * k));
  }, { passive: false });
  addEventListener('keydown', (e) => { if (!e.target.closest('input,textarea,select')) V.keys.add(e.code); });
  addEventListener('keyup', (e) => V.keys.delete(e.code));
  addEventListener('blur', () => V.keys.clear());
  V.place();
  return V;
}
