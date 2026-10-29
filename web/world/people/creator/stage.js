// The creator's 3D viewport: a generated person on a round podium in a grassy
// clearing under a soft sky, lit like the game (hemisphere + sun, cel bands from
// toon.js) and inked by the game's screen-space outline pass (outline.js).
//
// The camera orbits the person (drag, wheel / pinch to zoom, shift- or
// two-finger-drag to raise and lower it, a little inertia) and glides between
// framings worked out from the person's landmarks: full, face, bust, torso,
// legs, feet. The podium can turn (turntable). The person can stand in the A
// pose (the bind pose) or play the game's clips; the face's expression and a
// blink loop go through the skin material (userData.setExpression / setBlink)
// when it has them. Frames are only drawn when something moves.
//
// createStage(host) -> { setPerson, person, frame, setPose, setTurntable,
//   setExpression, setBlink, snapshot, thumbnail, renderer, invalidate }
import * as THREE from 'three';
import { createOutline } from '../../outline.js';
import { toon, SUN_I } from '../../toon.js';

const PODIUM_H = 0.12, PODIUM_R = 0.8;
const SKY_TOP = '#8fcbee', SKY_MID = '#cfe9f4', HORIZON = '#fbf1d8', GRASS = '#9ccc78';

function backdrop() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(SKY_TOP) }, uMid: { value: new THREE.Color(SKY_MID) }, uHor: { value: new THREE.Color(HORIZON) }, uSun: { value: new THREE.Vector3(-0.5, 0.75, 0.6).normalize() } },
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }',
    fragmentShader: `uniform vec3 uTop, uMid, uHor, uSun; varying vec3 vD;
      void main() {
        float y = vD.y;
        vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.18, y));
        c = mix(c, uTop, smoothstep(0.18, 0.7, y));
        float s = max(dot(normalize(vD), uSun), 0.0);
        c += vec3(1.0, 0.93, 0.78) * (pow(s, 24.0) * 0.18 + pow(s, 4.0) * 0.06);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), m);
  s.userData.outline = false; s.frustumCulled = false; s.renderOrder = -10;
  return s;
}

function podium() {
  const g = new THREE.Group();
  const prof = [[0, 0], [PODIUM_R - 0.02, 0], [PODIUM_R, 0.015], [PODIUM_R + 0.01, 0.05], [PODIUM_R, PODIUM_H - 0.018], [PODIUM_R - 0.02, PODIUM_H], [0, PODIUM_H]].map(([x, y]) => new THREE.Vector2(x, y));
  const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), toon('#f2e6cc'));
  base.castShadow = true; base.receiveShadow = true; g.add(base);
  // a red band round the side and an inset ring on the top
  const band = new THREE.Mesh(new THREE.CylinderGeometry(PODIUM_R + 0.012, PODIUM_R + 0.012, 0.026, 72, 1, true), toon('#e8463c', { side: THREE.DoubleSide }));
  band.position.y = 0.052; band.userData.outline = 'ground'; g.add(band);
  const ring = new THREE.Mesh(new THREE.RingGeometry(PODIUM_R - 0.1, PODIUM_R - 0.075, 72).rotateX(-Math.PI / 2), toon('#e5d3ae'));
  ring.position.y = PODIUM_H + 0.0015; ring.receiveShadow = true; ring.userData.outline = 'ground'; g.add(ring);
  return g;
}

// grass tufts and little flowers scattered round the podium
function meadow() {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 72).rotateX(-Math.PI / 2), toon(GRASS));
  ground.receiveShadow = true; ground.userData.outline = 'ground'; g.add(ground);
  const shade = new THREE.Mesh(new THREE.RingGeometry(PODIUM_R + 0.01, PODIUM_R + 0.5, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fb362', transparent: true, opacity: 0.35, depthWrite: false }));
  shade.position.y = 0.002; shade.userData.outline = false; g.add(shade);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blade = new THREE.ConeGeometry(0.018, 0.11, 4).translate(0, 0.055, 0);
  const tufts = new THREE.InstancedMesh(blade, toon('#7fb85c'), 520);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 520; i++) {
    const cx = i % 3 === 0 ? null : 0;
    const a = rnd() * Math.PI * 2, r = PODIUM_R + 0.25 + Math.pow(rnd(), 0.8) * 6;
    p.set(Math.cos(a) * r + (cx ?? 0) + (rnd() - 0.5) * 0.06, 0, Math.sin(a) * r + (rnd() - 0.5) * 0.06);
    e.set((rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6); q.setFromEuler(e);
    const k = 0.6 + rnd() * 0.8; s.set(k, k * (0.8 + rnd() * 0.6), k);
    tufts.setMatrixAt(i, m4.compose(p, q, s));
  }
  tufts.userData.outline = 'ground'; g.add(tufts);
  const petal = new THREE.SphereGeometry(0.022, 8, 6).scale(1, 0.55, 1).translate(0, 0.05, 0);
  const cols = ['#fffaf0', '#ffd34d', '#f59ab5', '#fffaf0', '#b9a8ef'];
  cols.forEach((c, ci) => {
    const fl = new THREE.InstancedMesh(petal, toon(c), 40);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, r = PODIUM_R + 0.35 + rnd() * 5;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r); q.identity(); const k = 0.8 + rnd() * 0.6; s.set(k, k, k);
      fl.setMatrixAt(i, m4.compose(p, q, s));
    }
    fl.userData.outline = 'ground'; g.add(fl);
    void ci;
  });
  return g;
}

export function createStage(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'stage-canvas';
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 10, 26);
  scene.add(backdrop());
  const sunDir = new THREE.Vector3(-0.5, 0.75, 0.6).normalize();
  scene.add(new THREE.HemisphereLight('#dff0ff', '#9aa58a', 1.25));
  const sun = new THREE.DirectionalLight('#fff0d4', SUN_I); sun.position.copy(sunDir).multiplyScalar(10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.6, bottom: -1.6, near: 1, far: 22 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01; scene.add(sun); scene.add(sun.target);
  scene.add(meadow());
  const stand = new THREE.Group(); stand.add(podium()); scene.add(stand);
  const ink = createOutline(renderer, { scale: 1 });
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 120);
  const tf = () => Math.tan(cam.fov * Math.PI / 360);

  const st = {
    person: null, pose: 'idle', turntable: false, expression: null, blink: true,
    view: { yaw: 0.35, pitch: 0.08, dist: 6, ty: 0.9 }, goal: { yaw: 0.35, pitch: 0.08, dist: 6, ty: 0.9 },
    frameName: 'full', dirty: true, vyaw: 0, drag: false, lastH: 0,
    blinkAt: 2, blinkT: -1, clock: new THREE.Clock(),
  };

  // ---------- size ----------
  function resize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, w * h > 1.4e6 ? 1.5 : 2);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const db = renderer.getDrawingBufferSize(new THREE.Vector2()); ink.setSize(db.x, db.y);
    if (st.person) frame(st.frameName, true, true);
    st.dirty = true;
  }
  new ResizeObserver(resize).observe(host);

  // ---------- framing ----------
  function framing(name) {
    const p = st.person, L = p ? p.anat.L : null;
    const H = p ? p.H : 1.4, y0 = PODIUM_H, asp = cam.aspect, t = tf();
    const fit = (halfH, halfW) => Math.max(halfH / t, halfW / (t * asp));
    if (!L) return { ty: y0 + H * 0.5, dist: fit(H * 0.6, H * 0.45), pitch: 0.1 };
    const top = L.crown ?? (L.chinY + L.hh);
    switch (name) {
      case 'face': return { ty: y0 + L.chinY + L.hh * 0.52, dist: fit(L.hh * 0.95, L.hh * 0.95), pitch: 0.04, front: true };
      case 'bust': { const lo = (L.chestY ?? L.shY - 0.1 * H) - 0.05; return { ty: y0 + (lo + top) / 2, dist: fit((top - lo) * 0.62, (top - lo) * 0.6), pitch: 0.06, front: true }; }
      case 'torso': { const lo = L.hipJ - 0.06 * H; return { ty: y0 + (lo + top) / 2 - 0.02, dist: fit((top - lo) * 0.6, H * 0.36), pitch: 0.08 }; }
      case 'legs': return { ty: y0 + (L.hipJ + 0.04) * 0.52, dist: fit(L.hipJ * 0.62 + 0.04, H * 0.3), pitch: 0.12 };
      case 'feet': return { ty: y0 + Math.max(0.06, H * 0.05), dist: fit(H * 0.13 + 0.04, H * 0.22), pitch: 0.42 };
      default: return { ty: y0 + H * 0.5, dist: fit(H * 0.56 + 0.06, H * 0.46), pitch: 0.09 };
    }
  }
  function frame(name = st.frameName, instant = false, keepZoom = false) {
    st.frameName = name;
    const f = framing(name);
    const g = st.goal;
    g.ty = f.ty; g.pitch = f.pitch;
    if (!keepZoom || !instant) g.dist = f.dist; else g.dist = f.dist;
    // turn to the face when looking at a face from behind
    if (f.front && Math.cos(g.yaw + stand.rotation.y) < 0.35) g.yaw = 0.3 - stand.rotation.y + Math.round((g.yaw + stand.rotation.y) / (Math.PI * 2)) * Math.PI * 2;
    if (instant) Object.assign(st.view, g);
    st.dirty = true;
  }
  function place() {
    const v = st.view, cp = Math.cos(v.pitch);
    cam.position.set(Math.sin(v.yaw) * cp * v.dist, v.ty + Math.sin(v.pitch) * v.dist, Math.cos(v.yaw) * cp * v.dist);
    cam.lookAt(0, v.ty, 0);
  }

  // ---------- orbit ----------
  const el = renderer.domElement, ptrs = new Map();
  let pinch = null;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
    st.drag = true; st.vyaw = 0; host.classList.add('grabbing');
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2, dist: st.goal.dist, ty: st.goal.ty }; }
  });
  el.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const g = st.goal, h = el.clientHeight || 600;
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), my = (a.y + b.y) / 2;
      g.dist = clampDist(pinch.dist * pinch.d / Math.max(d, 1));
      g.ty = clampTy(pinch.ty + (my - pinch.y) / h * g.dist * 2 * tf());
    } else if (p.b === 2 || p.shift || e.shiftKey) {
      g.ty = clampTy(g.ty + dy / h * g.dist * 2 * tf());
    } else {
      const k = 2.6 / Math.max(400, el.clientWidth) * Math.PI;
      g.yaw -= dx * k; g.pitch = Math.max(-0.25, Math.min(1.25, g.pitch + dy * k * 0.8));
      st.view.yaw = g.yaw; st.view.pitch = g.pitch; st.vyaw = -dx * k * 60;
    }
    st.dirty = true;
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { st.drag = false; host.classList.remove('grabbing'); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => { e.preventDefault(); st.goal.dist = clampDist(st.goal.dist * Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0012))); st.dirty = true; }, { passive: false });
  el.addEventListener('dblclick', () => frame(st.frameName));
  const clampDist = (d) => Math.max(0.35, Math.min(10, d));
  const clampTy = (y) => Math.max(0.05, Math.min(2.4, y));

  // ---------- the person ----------
  function setPerson(p) {
    const old = st.person;
    if (old) { stand.remove(old.root); try { old.dispose(); } catch { /* already gone */ } }
    st.person = p;
    p.root.position.y = PODIUM_H;
    stand.add(p.root);
    if (p.mixer && old && old.mixer) { applyPose(); p.mixer.setTime(old.mixer.time); } else applyPose();
    if (st.expression) setExpression(st.expression);
    // reframe when the size changed (a new age or height), keep the user's view otherwise
    if (Math.abs(p.H - st.lastH) > 0.01) frame(st.frameName, !old);
    st.lastH = p.H; st.dirty = true;
  }
  function applyPose() {
    const p = st.person; if (!p) return;
    if (!p.mixer || st.pose === 'apose') { if (p.mixer) p.mixer.stopAllAction(); if (p.restPose) p.restPose(); else p.skeleton.pose(); }
    else p.play(st.pose);
    st.dirty = true;
  }
  const setPose = (name) => { st.pose = name; applyPose(); };
  const skinMat = () => st.person && st.person.body && st.person.body.material;
  function setExpression(name) {
    st.expression = name; const m = skinMat();
    if (m && m.userData.setExpression) { try { m.userData.setExpression(name); } catch (e) { console.warn('expression', e); } }
    st.dirty = true;
  }
  const canExpress = () => !!(skinMat() && skinMat().userData.setExpression);
  const canBlink = () => !!(skinMat() && skinMat().userData.setBlink);

  // ---------- drawing ----------
  let paused = false;
  function draw() { place(); renderer.render(scene, cam); ink.render(scene, cam); }
  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, st.clock.getDelta());
    if (paused) return;
    const v = st.view, g = st.goal;
    let moving = false;
    if (!st.drag && Math.abs(st.vyaw) > 0.002) { g.yaw += st.vyaw * dt; st.vyaw *= Math.exp(-dt * 5); moving = true; }
    const k = 1 - Math.exp(-dt * 7);
    for (const key of ['yaw', 'pitch', 'dist', 'ty']) {
      const d = g[key] - v[key];
      if (Math.abs(d) > 1e-4) { v[key] += d * k; moving = true; } else v[key] = g[key];
    }
    if (st.turntable) { stand.rotation.y += dt * 0.45; moving = true; }
    const p = st.person;
    if (p && p.mixer && st.pose !== 'apose') { p.mixer.update(dt); moving = true; }
    // blink: a quick close and open every few seconds
    if (p && st.blink && canBlink()) {
      st.blinkAt -= dt;
      if (st.blinkAt <= 0 && st.blinkT < 0) st.blinkT = 0;
      if (st.blinkT >= 0) {
        st.blinkT += dt; const T = 0.16, x = Math.min(1, st.blinkT / T);
        skinMat().userData.setBlink(1 - Math.abs(2 * x - 1));
        if (x >= 1) { skinMat().userData.setBlink(0); st.blinkT = -1; st.blinkAt = 2 + Math.random() * 3.5; if (Math.random() < 0.15) st.blinkAt = 0.25; }
        moving = true;
      }
    }
    if (moving || st.dirty) { st.dirty = false; draw(); }
  }

  // ---------- pictures ----------
  // the canvas as a data URL right after drawing (the drawing buffer is not kept)
  function snapshot(type = 'image/png') { draw(); return renderer.domElement.toDataURL(type, 0.86); }
  // a small front picture of the whole person for save slots
  function thumbnail(w = 120, h = 160) {
    const keep = { ...st.view }, rot = stand.rotation.y;
    stand.rotation.y = 0;
    const f = framing('full'); Object.assign(st.view, { yaw: 0.25, pitch: f.pitch, ty: f.ty, dist: f.dist * 1.02 });
    draw();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const src = renderer.domElement, sh = src.height, sw = Math.min(src.width, sh * w / h);
    c.getContext('2d').drawImage(src, (src.width - sw) / 2, 0, sw, sh, 0, 0, w, h);
    Object.assign(st.view, keep); stand.rotation.y = rot; st.dirty = true;
    return c.toDataURL('image/jpeg', 0.82);
  }

  resize();
  tick();
  return {
    renderer, scene, camera: cam,
    get person() { return st.person; },
    get pose() { return st.pose; },
    get turntable() { return st.turntable; },
    get frameName() { return st.frameName; },
    setPerson, frame, setPose, setExpression, canExpress, canBlink,
    setTurntable(on) { st.turntable = on; if (!on) st.dirty = true; },
    setBlink(on) { st.blink = on; if (!on && canBlink()) skinMat().userData.setBlink(0); st.dirty = true; },
    resetTurn() { stand.rotation.y = 0; st.goal.yaw = 0.35; st.dirty = true; },
    snapshot, thumbnail, invalidate() { st.dirty = true; },
    pause(on) { paused = on; if (!on) st.dirty = true; },
    resize,
  };
}
