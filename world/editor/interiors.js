// Interiors: a map blueprint (web/world/maps/<id>.json, "pallet-map v1") built
// by the game's own interior.js on a stage: click a prop or a person to pick
// it, move it (W) or turn it (E) with the gizmo, add props from the catalog,
// remove them, and edit everything else in the blueprint (rooms, walls,
// lights, people, their dialogue, portals, camera) in the line editor.
// Saved as the blueprint file itself; publishing rebakes the interior
// (tools/native/bake_interior.mjs).
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildInterior } from '../interior.js';
import { CATALOG } from '../props/catalog.js';
import { h, toast } from './ui.js';
import { S, on } from './state.js';
import * as L from './life.js';
import { openDrawer } from './lifeui.js';
import { treeEdit, setAt } from './treeedit.js';

export const MAPS = [['oak_lab', "Prof. Oak's Lab"]];
export function interiorsList(pane) {
  pane.append(h('div', { class: 'note' }, 'Rooms the player walks into (map blueprints). Published interiors are rebaked for the phone.'),
    h('ul', { class: 'tree' }, MAPS.map(([id, name]) => h('li', { onclick: () => openInterior(id) }, h('span', { class: 'lab' }, name), h('span', { class: 'meta' }, id)))));
}

async function openInterior(id) {
  const path = `web/world/maps/${id}.json`;
  try { await L.repoFile(path); } catch (e) { toast(e.message); return; }
  const bp = () => S.life[path].data;
  const d = openDrawer('Interior · ' + id);
  document.getElementById('drawer').classList.add('tall');
  d.body.style.display = 'flex';
  const wrap = h('div', { style: 'position:relative;flex:1;min-width:0' }), side = h('div', { style: 'width:380px;flex:none;overflow:auto;padding-left:8px' });
  const canvas = h('canvas', { style: 'width:100%;height:100%;display:block' });
  wrap.append(canvas); d.body.append(wrap, side);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff', '#888', 1.4));
  const sun = new THREE.DirectionalLight('#fff', 1.6); sun.position.set(4, 10, 6); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.05, 300);
  const st = { yaw: 0.8, pitch: 0.9, dist: 22, target: new THREE.Vector3(9, 0, 0), sel: null, root: null };
  const tc = new TransformControls(cam, canvas); tc.setSize(0.7); scene.add(tc.getHelper());
  const resize = () => { const b = wrap.getBoundingClientRect(); r.setSize(b.width, b.height, false); cam.aspect = b.width / Math.max(1, b.height); cam.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(wrap);
  // the blueprint built as the game builds it; people as markers
  const people = new THREE.Group();
  const build = () => {
    if (st.root) scene.remove(st.root);
    try { st.root = buildInterior(bp()).group; } catch (e) { toast('The blueprint does not build: ' + e.message); return; }
    scene.add(st.root);
    scene.background = new THREE.Color(bp().lights?.bg || '#2a2440');
    people.clear(); scene.add(people);
    const LY = Object.fromEntries(bp().levels.map((l) => [l.id, l.y]));
    for (const a of bp().actors || []) {
      const g = new THREE.Group(); g.userData.actor = a.id;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.7, 12).translate(0, 0.85, 0), new THREE.MeshLambertMaterial({ color: '#ff9b42' })));
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8).rotateX(Math.PI / 2).translate(0, 1.2, 0.35), new THREE.MeshLambertMaterial({ color: '#ff5a7a' })));
      g.position.set(a.pos[0], LY[a.level] || 0, a.pos[1]); g.rotation.y = (a.rot || 0) * Math.PI / 180;
      people.add(g);
    }
    if (st.sel) reselect();
  };
  const propObj = (pid) => { let f = null; st.root.traverse((o) => { if (!f && o.name === 'prop_' + pid) f = o; }); return f; };
  const reselect = () => {
    const o = st.sel.kind === 'actor' ? people.children.find((g) => g.userData.actor === st.sel.id) : propObj(st.sel.id);
    if (o) tc.attach(o); else { tc.detach(); st.sel = null; }
  };
  // picking
  const ray = new THREE.Raycaster();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (tc.dragging || (e.button === 0 && tc.axis)) return;
    if (e.button !== 0 || e.altKey) { drag = [e.clientX, e.clientY, e.button === 1 || e.shiftKey]; canvas.setPointerCapture(e.pointerId); return; }
    const b = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1), cam);
    for (const hit of ray.intersectObjects([people, st.root], true)) {
      for (let q = hit.object; q; q = q.parent) {
        if (q.userData.actor) { st.sel = { kind: 'actor', id: q.userData.actor }; reselect(); drawSide(); return; }
        if (q.name && q.name.startsWith('prop_')) { st.sel = { kind: 'prop', id: q.name.slice(5) }; reselect(); drawSide(); return; }
      }
    }
    st.sel = null; tc.detach(); drawSide();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag[0] = e.clientX; drag[1] = e.clientY;
    if (drag[2]) { const k = st.dist * 0.0015; st.target.x -= (Math.cos(st.yaw) * dx) * k; st.target.z -= (-Math.sin(st.yaw) * dx) * k; st.target.x -= Math.sin(st.yaw) * dy * k; st.target.z -= Math.cos(st.yaw) * dy * k; }
    else { st.yaw -= dx * 0.006; st.pitch = Math.max(0.1, Math.min(1.5, st.pitch + dy * 0.005)); }
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(2, Math.min(80, st.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  // a moved / turned prop or person goes back into the blueprint
  tc.addEventListener('mouseUp', () => {
    const o = tc.object; if (!o || !st.sel) return;
    const pos = [+o.position.x.toFixed(3), +o.position.z.toFixed(3)], rot = +((o.rotation.y * 180 / Math.PI + 360) % 360).toFixed(1);
    L.fileChange(path, 'interior: move ' + st.sel.id, (dd) => {
      const list = st.sel.kind === 'actor' ? dd.actors : dd.props, it = list.find((x) => x.id === st.sel.id);
      if (it) { it.pos = pos; it.rot = rot; }
    });
  });
  tc.addEventListener('objectChange', () => { const o = tc.object; if (o) { o.position.y = o.position.y; o.rotation.x = 0; o.rotation.z = 0; } });
  const loop = () => {
    if (!wrap.isConnected) { r.dispose(); return; }
    requestAnimationFrame(loop);
    const cp = Math.cos(st.pitch);
    cam.position.copy(st.target).add(new THREE.Vector3(Math.sin(st.yaw) * cp, Math.sin(st.pitch), Math.cos(st.yaw) * cp).multiplyScalar(st.dist));
    cam.lookAt(st.target);
    r.render(scene, cam);
  };
  // ---------- the side panel ----------
  const open = new Set();
  const drawSide = () => {
    const B = bp();
    const sel = st.sel && (st.sel.kind === 'actor' ? B.actors : B.props).find((x) => x.id === st.sel.id);
    const kids = [h('div', { class: 'btns' }, h('button', { class: tc.mode === 'translate' ? 'on' : '', onclick: () => { tc.setMode('translate'); tc.showY = false; drawSide(); } }, 'Move (W)'), h('button', { class: tc.mode === 'rotate' ? 'on' : '', onclick: () => { tc.setMode('rotate'); tc.showX = false; tc.showZ = false; drawSide(); } }, 'Turn (E)')),
      h('div', { class: 'note' }, 'Left click picks a prop or a person (orange). Right or Alt drag turns the view, Shift drag pans, the wheel zooms.')];
    if (sel) {
      kids.push(h('div', { class: 'sect' }, h('h3', {}, `${st.sel.kind}: ${sel.id}`), treeEdit(sel, (p, v) => L.fileChange(path, 'interior: ' + sel.id, (dd) => { const it = (st.sel.kind === 'actor' ? dd.actors : dd.props).find((x) => x.id === sel.id); setAt(it, p, v); }), { open }),
        h('div', { class: 'btns' }, h('button', { class: 'danger', onclick: () => { const k = st.sel; st.sel = null; tc.detach(); L.fileChange(path, 'interior: remove ' + k.id, (dd) => { const list = k.kind === 'actor' ? dd.actors : dd.props; list.splice(list.findIndex((x) => x.id === k.id), 1); }); } }, 'Remove'))));
    }
    const typeSel = h('select', {}, Object.keys(CATALOG).map((k) => h('option', { value: k }, k.replace(/_/g, ' '))));
    kids.push(h('div', { class: 'sect' }, h('h3', {}, 'Add a prop'), h('div', { class: 'row' }, typeSel, h('button', { onclick: () => {
      const t = typeSel.value, id = t + '_' + Date.now().toString(36);
      L.fileChange(path, 'interior: add ' + t, (dd) => dd.props.push({ id, type: t, pos: [+st.target.x.toFixed(2), +st.target.z.toFixed(2)], rot: 0, level: dd.levels[0].id }));
      st.sel = { kind: 'prop', id };
    } }, 'Add at the view\'s middle'))));
    kids.push(h('div', { class: 'sect' }, h('h3', {}, 'The whole blueprint'), h('div', { class: 'note' }, 'Rooms (zones), walls and openings, stairs, lights, people and what they say, portals, the camera.'),
      treeEdit(B, (p, v) => L.fileChange(path, 'interior: blueprint', (dd) => { if (p.length) setAt(dd, p, v); }), { open })));
    side.replaceChildren(...kids);
  };
  build(); drawSide(); resize(); loop();
  on('life', (p) => { if (p === path && side.isConnected) { build(); drawSide(); } });
  addEventListener('keydown', (e) => { if (!side.isConnected || e.target.closest('input,textarea,select')) return; if (e.code === 'KeyW') { tc.setMode('translate'); drawSide(); } if (e.code === 'KeyE') { tc.setMode('rotate'); drawSide(); } });
}
