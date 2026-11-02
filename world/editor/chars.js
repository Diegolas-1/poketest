// Characters: the native game's people as baked (native/cast/<look>.glb and
// cast.json), on a little stage: their materials (tint, cel bands), skeleton
// (the bone tree, the bind pose), animation clips (play, scrub, and key a
// bone's rotation at any frame with the turn gizmo; delete keys), the gait
// (stride and lead per clip) and the cloth chains (stiffness, drag, damping,
// cone...). Edits are kept in native/tunables/cast.json, which actor.gd
// applies over the baked cast at load: no rebake, they reach the phone with
// "Publish to phone".
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { h, toast } from './ui.js';
import { S, on } from './state.js';
import * as L from './life.js';
import { openDrawer } from './lifeui.js';

const OV = 'native/tunables/cast.json';
let cast = null;
async function castJSON() { return cast ||= await fetch(L.REPO_URL + 'native/cast/cast.json', { cache: 'no-cache' }).then((r) => r.json()); }

export async function charsPanel(pane) {
  pane.append(h('div', { class: 'note' }, 'The people as the phone game has them (native/cast). Pick one: materials, skeleton, animations (key frames), gait and cloth.'));
  let c;
  try { c = await castJSON(); } catch (e) { pane.append(h('div', { class: 'err' }, 'Could not load cast.json: ' + e.message)); return; }
  pane.append(h('ul', { class: 'tree' }, Object.keys(c.looks).map((k) => h('li', { onclick: () => openLook(k) }, h('span', { class: 'lab' }, k), h('span', { class: 'meta' }, `${c.looks[k].mats.length} materials · ${(c.looks[k].sim?.chains || []).length} cloth chains`)))));
  pane.append(h('div', { class: 'note' }, 'Creatures\' gait: Game tab › Creatures. Their talk and owners: Town life › Pokémon.'));
}

// ---------- the stage ----------
let stage = null;
function makeStage(host) {
  if (stage) { host.append(stage.wrap); stage.resize(); return stage; }
  const canvas = h('canvas', { style: 'width:100%;height:100%;display:block' });
  const wrap = h('div', { style: 'position:relative;flex:1;min-width:0;min-height:0' }, canvas);
  host.append(wrap);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a3040');
  scene.add(new THREE.HemisphereLight('#e2f1ff', '#6d7f4c', 1.2));
  const sun = new THREE.DirectionalLight('#fff0d4', 2.4); sun.position.set(-2, 4, 3); scene.add(sun);
  scene.add(new THREE.GridHelper(6, 12, '#55607a', '#3a4152'));
  const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  const st = { r, scene, cam, wrap, canvas, model: null, mixer: null, action: null, clip: null, t: 0, playing: true, yaw: 0.6, pitch: 0.15, dist: 3.4, target: new THREE.Vector3(0, 0.9, 0), bone: null, skelHelper: null, look: null };
  st.tc = new TransformControls(cam, canvas); st.tc.setMode('rotate'); st.tc.setSpace('local'); st.tc.setSize(0.6);
  scene.add(st.tc.getHelper());
  st.resize = () => { const b = wrap.getBoundingClientRect(); r.setSize(b.width, b.height, false); cam.aspect = b.width / Math.max(1, b.height); cam.updateProjectionMatrix(); };
  new ResizeObserver(st.resize).observe(wrap);
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (st.tc.dragging || e.button === 0 && st.tc.axis) return; drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; st.yaw -= (e.clientX - drag[0]) * 0.008; st.pitch = Math.max(-0.5, Math.min(1.3, st.pitch + (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(0.6, Math.min(12, st.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  const clock = new THREE.Clock();
  const loop = () => {
    requestAnimationFrame(loop);
    if (!wrap.isConnected) return;
    const dt = clock.getDelta();
    if (st.action && st.clip) {
      if (st.playing && !st.tc.dragging) st.t = (st.t + dt) % st.clip.duration;
      if (!st.tc.dragging) { st.mixer.setTime(st.t); }
      st.onTime && st.onTime(st.t);
    }
    const cp = Math.cos(st.pitch);
    cam.position.copy(st.target).add(new THREE.Vector3(Math.sin(st.yaw) * cp, Math.sin(st.pitch), Math.cos(st.yaw) * cp).multiplyScalar(st.dist));
    cam.lookAt(st.target);
    r.render(scene, cam);
  };
  loop();
  window.__charStage = st;   // (automated checks)
  return (stage = st);
}

// ---------- one character ----------
async function openLook(look) {
  const c = await castJSON(), info = c.looks[look];
  let ov;
  try { ov = await L.repoFile(OV); } catch (e) { toast('No ' + OV + ' in the repo yet'); return; }
  const d = openDrawer('Character · ' + look);
  document.getElementById('drawer').classList.add('tall');
  const row = h('div', { style: 'display:flex;gap:10px;height:100%;min-height:0' });
  const side = h('div', { style: 'width:360px;flex:none;overflow:auto' });
  d.body.style.display = 'flex'; d.body.append(row);
  const st = makeStage(row); row.append(side);
  st.wrap.style.height = '100%';
  const timeline = h('div', { style: 'position:absolute;left:8px;right:8px;bottom:8px;height:34px;background:#0008;border-radius:6px' });
  const tlc = h('canvas', { style: 'width:100%;height:100%' }); timeline.append(tlc); st.wrap.append(timeline);
  // the model
  const gltf = await new GLTFLoader().loadAsync(L.REPO_URL + `native/cast/${look}.glb`);
  if (st.model) st.scene.remove(st.model, st.skelHelper);
  st.model = gltf.scene; st.look = look; st.scene.add(st.model);
  st.skelHelper = new THREE.SkeletonHelper(st.model); st.skelHelper.visible = false; st.scene.add(st.skelHelper);
  const box = new THREE.Box3().setFromObject(st.model); st.target.set(0, (box.min.y + box.max.y) / 2, 0); st.dist = (box.max.y - box.min.y) * 2.2;
  st.mixer = new THREE.AnimationMixer(st.model);
  st.clips = gltf.animations;
  const bones = []; st.model.traverse((o) => { if (o.isBone) bones.push(o); });
  const mats = new Map(); st.model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) mats.set(m.name, m); });
  const E = () => S.life[OV].data;
  const lookOv = () => ((E().looks ||= {})[look] ||= {});
  const change = (label, fn) => L.fileChange(OV, 'character: ' + label, (dd) => { const lo = ((dd.looks ||= {})[look] ||= {}); fn(lo); });
  // apply the saved overrides to the stage (tints, keyframes)
  const applyOv = () => {
    const lo = E().looks?.[look] || {};
    info.mats.forEach((m, i) => { const mm = mats.get('c' + i); if (!mm) return; const a = lo.mats?.[m.src]?.albedo; mm.color.set(a || '#ffffff'); if (!mm.userData.c0) mm.userData.c0 = mm.color.clone(); });
    for (const clip of st.clips) {
      const co = lo.clips?.[clip.name]?.tracks || {};
      for (const tr of clip.tracks) {
        if (!tr.name.endsWith('.quaternion')) continue;
        const bn = tr.name.slice(0, -11);
        if (!tr.userData0) tr.userData0 = { t: tr.times.slice(), v: tr.values.slice() };
        const o = co[bn];
        if (o) { tr.times = Float32Array.from(o.t); tr.values = Float32Array.from(o.q.flat()); } else { tr.times = tr.userData0.t.slice(); tr.values = tr.userData0.v.slice(); }
      }
    }
    if (st.clip) playClip(st.clip.name);
  };
  const playClip = (name) => {
    const clip = st.clips.find((x) => x.name === name) || st.clips[0];
    if (!clip) return;
    st.mixer.stopAllAction(); st.mixer.uncacheRoot(st.model);
    st.clip = clip; st.action = st.mixer.clipAction(clip); st.action.play();
  };
  playClip('idle');
  // the timeline: keys of the picked bone in the clip
  st.onTime = (t) => {
    const W = tlc.clientWidth, H = tlc.clientHeight; if (tlc.width !== W) { tlc.width = W; tlc.height = H; }
    const x = tlc.getContext('2d'); x.clearRect(0, 0, W, H);
    if (!st.clip) return;
    const tr = st.bone && st.clip.tracks.find((q) => q.name === st.bone.name + '.quaternion');
    x.fillStyle = '#ffd84a';
    if (tr) for (const k of tr.times) { const px = k / st.clip.duration * (W - 10) + 5; x.beginPath(); x.moveTo(px, H / 2 - 6); x.lineTo(px + 5, H / 2); x.lineTo(px, H / 2 + 6); x.lineTo(px - 5, H / 2); x.fill(); }
    x.fillStyle = '#ff5a3a'; x.fillRect(t / st.clip.duration * (W - 10) + 4, 2, 2, H - 4);
    x.fillStyle = '#fff'; x.font = '11px system-ui'; x.fillText(`${st.clip.name} ${t.toFixed(2)} / ${st.clip.duration.toFixed(2)} s${tr ? ' · ' + st.bone.name + ': ' + tr.times.length + ' keys' : ''}`, 6, 12);
  };
  tlc.onpointerdown = (e) => { const b = tlc.getBoundingClientRect(); st.playing = false; const f = (ev) => { st.t = Math.max(0, Math.min(st.clip.duration, (ev.clientX - b.left - 5) / (b.width - 10) * st.clip.duration)); st.mixer.setTime(st.t); }; f(e); tlc.onpointermove = (ev) => ev.buttons && f(ev); drawSide(); };
  // keying: the turn gizmo on the picked bone writes a key at the current time
  st.tc.removeEventListener?.('mouseUp', st._key);
  st._key = () => {
    if (!st.bone || !st.clip) return;
    const bn = st.bone.name, t = +st.t.toFixed(4), q = st.bone.quaternion;
    const tr = st.clip.tracks.find((x) => x.name === bn + '.quaternion');
    const times = tr ? Array.from(tr.times) : [], vals = tr ? Array.from(tr.values) : [];
    // baked clips have a key every frame: the turn is blended into the keys
    // around it (cosine falloff over ±FALL seconds), so the motion stays smooth
    const FALL = st.fall ?? 0.25;
    if (FALL > 0 && times.length > 8 && st.q0) {
      const delta = q.clone().multiply(st.q0.clone().invert());
      const I = new THREE.Quaternion(), qk = new THREE.Quaternion(), dd = new THREE.Quaternion();
      const D = st.clip.duration;
      for (let k = 0; k < times.length; k++) {
        let dt = Math.abs(times[k] - t); dt = Math.min(dt, D - dt);   // the clip loops
        if (dt >= FALL) continue;
        const w = 0.5 + 0.5 * Math.cos(Math.PI * dt / FALL);
        dd.slerpQuaternions(I, delta, w);
        qk.fromArray(vals, k * 4).premultiply(dd).normalize();
        vals.splice(k * 4, 4, +qk.x.toFixed(5), +qk.y.toFixed(5), +qk.z.toFixed(5), +qk.w.toFixed(5));
      }
    } else {
      let i = times.findIndex((k) => Math.abs(k - t) < 1 / 60);
      if (i < 0) { i = times.findIndex((k) => k > t); if (i < 0) i = times.length; times.splice(i, 0, t); vals.splice(i * 4, 0, 0, 0, 0, 1); }
      vals.splice(i * 4, 4, +q.x.toFixed(5), +q.y.toFixed(5), +q.z.toFixed(5), +q.w.toFixed(5));
    }
    change('key ' + bn, (lo) => { (((lo.clips ||= {})[st.clip.name] ||= {}).tracks ||= {})[bn] = { t: times, q: chunk(vals) }; });
  };
  st.tc.addEventListener('mouseUp', st._key);
  st.tc.removeEventListener?.('mouseDown', st._down);
  st._down = () => { st.q0 = st.bone ? st.bone.quaternion.clone() : null; };
  st.tc.addEventListener('mouseDown', st._down);
  const chunk = (v) => { const o = []; for (let i = 0; i < v.length; i += 4) o.push(v.slice(i, i + 4)); return o; };
  // ---------- the side panel ----------
  let tab = 'anim';
  const add = (...k) => side.append(...k.filter((x) => x != null && x !== false));
  const drawSide = () => {
    const lo = E().looks?.[look] || {};
    side.replaceChildren(h('div', { class: 'btns', style: 'margin-bottom:6px' }, [['anim', 'Animation'], ['skel', 'Skeleton'], ['mats', 'Materials'], ['gait', 'Gait'], ['cloth', 'Cloth']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; drawSide(); } }, l))));
    st.skelHelper.visible = tab === 'skel' || tab === 'anim';
    if (tab === 'anim') {
      add(h('div', { class: 'row' }, h('label', {}, 'Clip'), h('select', { onchange: (e) => { playClip(e.target.value); drawSide(); } }, st.clips.map((cl) => h('option', { value: cl.name, selected: st.clip && st.clip.name === cl.name }, `${cl.name} (${cl.duration.toFixed(2)} s)`)))),
        h('div', { class: 'btns' }, h('button', { onclick: () => { st.playing = !st.playing; drawSide(); } }, st.playing ? '❚❚ Pause' : '▶ Play'),
          h('button', { onclick: () => { st.t = Math.max(0, st.t - 1 / 30); st.playing = false; } }, '◀ frame'), h('button', { onclick: () => { st.t = Math.min(st.clip.duration, st.t + 1 / 30); st.playing = false; } }, 'frame ▶')),
        h('div', { class: 'note' }, 'Pick a bone below, pause, scrub the bar under the view, and turn the bone with the gizmo: that sets a key at that time. Yellow marks are its keys.'),
        h('div', { class: 'row' }, h('label', {}, 'Blend over'), h('select', { onchange: (e) => { st.fall = +e.target.value; } }, [[0, 'this frame only'], [0.1, '±0.1 s'], [0.25, '±0.25 s'], [0.5, '±0.5 s'], [1, '±1 s'], [99, 'the whole clip']].map(([v, l]) => h('option', { value: v, selected: (st.fall ?? 0.25) === v }, l)))),
        st.bone ? h('div', { class: 'btns' }, h('b', {}, st.bone.name),
          h('button', { onclick: () => { const tr = st.clip.tracks.find((x) => x.name === st.bone.name + '.quaternion'); if (!tr) return; const ts = Array.from(tr.times), vs = Array.from(tr.values); const i = ts.findIndex((k) => Math.abs(k - st.t) < 1 / 50); if (i < 0) return toast('No key here'); if (ts.length <= 2) return toast('A track keeps two keys'); ts.splice(i, 1); vs.splice(i * 4, 4); change('delete key', (lo2) => { (((lo2.clips ||= {})[st.clip.name] ||= {}).tracks ||= {})[st.bone.name] = { t: ts, q: chunk(vs) }; }); } }, 'Delete key here'),
          h('button', { onclick: () => change('reset bone', (lo2) => { const tr = lo2.clips?.[st.clip.name]?.tracks; if (tr) delete tr[st.bone.name]; }) }, 'Back to baked')) : null,
        boneTree(), h('div', { class: 'note' }, `${Object.keys(lo.clips?.[st.clip?.name]?.tracks || {}).length} bone(s) edited in this clip`));
      if (st.bone) st.tc.attach(st.bone); else st.tc.detach();
    } else st.tc.detach();
    if (tab === 'skel') add(h('div', { class: 'note' }, `${bones.length} bones. The bind pose is the model's rest (shown when paused at a clip's rest); pick a bone to see its rest transform.`), boneTree(),
      st.bone ? h('div', { class: 'mono' }, `rest position ${st.bone.position.toArray().map((v) => v.toFixed(3)).join(', ')}\nrest rotation ${new THREE.Euler().setFromQuaternion(st.bone.quaternion).toArray().slice(0, 3).map((v) => (v * 57.3).toFixed(1)).join('°, ')}°`) : null);
    if (tab === 'mats') add(h('div', { class: 'note' }, 'Tint multiplies the painted texture; the cel bands are the shading steps (bands = where light turns to shade, deep / shade / lit = the colour of each).'),
      ...info.mats.map((m, i) => {
        const o = lo.mats?.[m.src] || {};
        return h('div', { class: 'sect' }, h('h3', {}, m.src), h('div', { class: 'row' }, h('label', {}, 'tint'), h('input', { type: 'color', value: o.albedo || '#ffffff', oninput: (e) => { const mm = mats.get('c' + i); if (mm) mm.color.set(e.target.value); }, onchange: (e) => change('tint ' + m.src, (l2) => { ((l2.mats ||= {})[m.src] ||= {}).albedo = e.target.value; }) }),
          o.albedo ? h('button', { onclick: () => change('untint', (l2) => { delete l2.mats[m.src].albedo; }) }, 'reset') : null),
        ...['bands', 'deep', 'shade', 'lit'].map((k) => h('div', { class: 'row' }, h('label', {}, k), h('input', { type: 'text', value: (o.cel?.[k] || m.cel?.[k] || []).join(', '), onchange: (e) => { const v = e.target.value.split(',').map(Number); if (v.length !== 3 || v.some(isNaN)) return toast('Three numbers'); change(k + ' ' + m.src, (l2) => { (((l2.mats ||= {})[m.src] ||= {}).cel ||= {})[k] = v; }); } }))));
      }));
    if (tab === 'gait') add(h('div', { class: 'note' }, 'How far one walk / run cycle carries the body (stride, m) and where in the clip the left foot lands (lead, 0..1). The game matches the clip\'s pace to the speed with these.'),
      ...Object.entries(info.meta || {}).map(([cn, m]) => h('div', { class: 'sect' }, h('h3', {}, cn), ...Object.keys(m).map((k) => h('div', { class: 'row' }, h('label', {}, k), h('input', { type: 'number', step: 0.01, value: lo.meta?.[cn]?.[k] ?? m[k], onchange: (e) => change(cn + ' ' + k, (l2) => { ((l2.meta ||= {})[cn] ||= {})[k] = +e.target.value; }) }))))));
    if (tab === 'cloth') add(h('div', { class: 'note' }, 'Cloth and hair chains (cloth.gd). ks = stiffness per joint, drag = how much air slows each joint, damp = how fast swings die out, vmax = speed cap, flut = flutter in the wind, cone = how far each joint may bend (radians). The stage does not simulate cloth: check it with Play here or on the phone.'),
      ...(info.sim?.chains || []).map((ch, i) => h('div', { class: 'sect' }, h('h3', {}, `chain ${i}: ${ch.bones.join(' › ')}`), ...['ks', 'drag', 'damp', 'vmax', 'flut', 'cone'].filter((k) => ch[k] !== undefined).map((k) => {
        const v = lo.sim?.chains?.[i]?.[k] ?? ch[k];
        return h('div', { class: 'row' }, h('label', {}, k), h('input', { type: 'text', value: Array.isArray(v) ? v.join(', ') : v, onchange: (e) => { const t = e.target.value.split(',').map(Number); if (t.some(isNaN)) return toast('Numbers'); change(`chain ${i} ${k}`, (l2) => { (((l2.sim ||= {}).chains ||= {})[i] ||= {})[k] = Array.isArray(ch[k]) ? t : t[0]; }); } }));
      }))));
  };
  const boneTree = () => {
    const ul = h('ul', { class: 'tree', style: 'max-height:280px;overflow:auto' });
    const rows = (b, depth) => { if (!b.isBone) return; ul.append(h('li', { class: st.bone === b ? 'sel' : '', style: `padding-left:${4 + depth * 10}px`, onclick: () => { st.bone = b; st.playing = false; drawSide(); } }, h('span', { class: 'lab' }, b.name))); for (const c of b.children) rows(c, depth + 1); };
    for (const b of bones) if (!b.parent || !b.parent.isBone) rows(b, 0);
    return ul;
  };
  applyOv(); drawSide();
  on('life', (p) => { if (p === OV && side.isConnected) { applyOv(); drawSide(); } });
  void lookOv;
}
