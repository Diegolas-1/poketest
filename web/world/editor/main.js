// PalletEdit: the world editor (web/world/editor.html).
//
// ============================== THE DESIGN ==============================
// The world is procedural: code in web/world/*.js makes it, the same code
// every time, and tools/native/bake*.mjs turns what it makes into the native
// game's files. Hand edits therefore cannot live in the meshes (the next bake
// would make them again) or in the code (other workers change it all the
// time). They live in DATA that the generators apply on top of what they make:
//
//  1. The edit layer, web/world/edits/: world.json (one document) plus raster
//     tiles (tiles/<layer>_<i>_<j>.png, 64 m squares of 0.5 m nodes, written
//     only where something was painted). editlayer/index.js loads it before any
//     generator runs (a top-level await) and gives the generators small hooks:
//     terrain.js adds the height deltas, the painted dirt / sand / rock / grass,
//     the walk flags and ledges, the edited and added roads; veg.js passes every
//     list of plant points through E.veg (deleted, moved, thinned, kept off
//     paths); assets.js places moved plants; town.js tracks every piece it adds
//     and applies the object edits (editlayer/objects.js); the grass reads the
//     blade brush. With an empty layer the world is exactly what it was.
//
//  2. Stable ids. Every top-level piece the town and Route 1 generators add
//     gets an id from the generator functions that added it ('town:<chain>#n',
//     e.g. town:laneFurniture/lamp#4), read from the call stack, so nothing in
//     the generators had to change. Each edit also keeps the piece's anchor
//     (where it stood as generated) and its builder's label, so when code
//     changes reorder things an edit still finds its piece (the nearest with
//     the same chain and label); edits whose piece is truly gone are listed as
//     orphans, never silently applied elsewhere. Parts of a piece are
//     '<id>>c3>c0' (child indices). Plants: their seeded position ('veg@x_z').
//     A generator may pin an explicit id with obj.userData.eid.
//
//  3. Edits never change random decisions. The town and the plants decide
//     where things go on the ground as generated (E.raw: terrain.js answers
//     from terrain.js?raw, an unedited twin of itself); the edits are applied
//     afterwards as offsets and filters (pieces ride the sculpted ground,
//     plants on a new path or under a moved house are left out). So sculpting
//     a hill never reshuffles the forest, and edits survive regeneration.
//
//  4. Everything the bake reads comes through the same generators, so the
//     native bake (tools/native/bake.mjs) picks the edits up with no change;
//     colliders of moved / deleted pieces are flagged (c.off) and left out.
//
//  5. Saving: the editor runs on GitHub Pages (static), so drafts and saved
//     versions go to the pallet-editor Worker (R2), behind a passphrase kept
//     on this device. "Publish to phone" files a request; tools/editor/
//     publish.mjs (run in a Claude session) pulls the version into the repo
//     (tools/editor/pull.mjs), runs the QA scan, bakes what changed and
//     publishes the patch, and reports back here. Game data (native/life/*.json)
//     is edited as whole files with the base they were edited from, merged
//     three-way by pull.mjs.
//
//  6. The viewport is the game's own generator output (town unmerged so each
//     piece can be picked), so what you see is the world; Play here opens the
//     real game on this draft at the camera.
// ========================================================================
import * as THREE from 'three';
import { api, local, API_URL } from './api.js';
import { fromBase64 } from '../editlayer/png.js';

const $ = (id) => document.getElementById(id);
const bootText = (t) => { $('bootText').textContent = t; };

// ---------- 1. the passphrase ----------
async function login() {
  const q = new URLSearchParams(location.search);
  if (q.has('offline')) { api.offline = true; return; }
  for (;;) {
    if (api.token) {
      try { await api.ping(); return; } catch (e) { if (e.status !== 401) { bootText('Cannot reach the editor\'s server (' + e.message + '). Work offline?'); } else { api.setToken(''); bootText('Wrong passphrase.'); } }
    } else bootText('Enter the editor passphrase.');
    const got = await new Promise((ok) => {
      const f = $('bootForm');
      f.innerHTML = '<input id="pw" type="password" placeholder="Passphrase" autocomplete="current-password"><div><button id="go">Open the editor</button><button id="off">Work offline (this browser only)</button></div>';
      const go = () => ok($('pw').value.trim());
      $('go').onclick = go; $('pw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
      $('off').onclick = () => ok(null);
      $('pw').focus();
    });
    $('bootForm').innerHTML = '';
    if (got === null) { api.offline = true; return; }
    api.setToken(got);
  }
}

// ---------- 2. the draft ----------
async function loadDraft() {
  bootText('Loading your draft');
  let text = null, from = 'repo';
  if (!api.offline) { try { const d = await api.getDraft(); if (d) { text = JSON.stringify(d); from = 'server'; } } catch (e) { console.warn(e); } }
  if (!text) { const l = await local.load(); if (l) { text = l; from = 'this browser'; } }
  if (!text) return { from, bundle: null };
  const b = JSON.parse(text);
  const tiles = {};
  for (const [k, v] of Object.entries(b.tiles || {})) tiles[k] = fromBase64(v);
  globalThis.__PALLET_EDITS = { doc: b.doc, tiles };
  return { from, bundle: b };
}

await login();
const draft = await loadDraft();
bootText('Building the world (the game\'s own generators)');
const [{ E }, ST, VP, W, OB, TR, UI, TH] = await Promise.all([import('../editlayer/index.js'), import('./state.js'), import('./viewport.js'), import('./world.js'), import('./objects.js'), import('./terrain.js'), import('./ui.js'), import('./thumbs.js')]);
const { S, on, emit, undo, redo } = ST;
if (draft.bundle) { S.life = draft.bundle.life || {}; S.meta = draft.bundle.meta || {}; }

const V = VP.createViewport($('c'));
const world = await W.buildWorld(V.renderer, bootText);
V.scene = world.scene; V.world = world;
world.scene.add(V.gizmoHelper, V.ring);
OB.bindObjects(V, world);
TR.bindWorld(world);
for (const e of world.town.reg.list) if (!e.gen) e.gen = { p: e.o.position.clone(), r: e.o.rotation.clone(), s: e.o.scale.clone() };
// start over the square
V.focus(new THREE.Vector3(-3, 2, -2), 110); V.yaw = 0.6; V.pitch = 0.8;
$('boot').classList.add('done');

// ---------- the toolbar ----------
const TOOLS = [
  ['select', 'Select', 'Q'], ['move', 'Move', 'W'], ['rotate', 'Turn', 'E'], ['scale', 'Scale', 'R'], null,
  ['raise', 'Raise', '1'], ['lower', 'Lower', '2'], ['smooth', 'Smooth', '3'], ['flatten', 'Flatten', '4'], ['noise', 'Noise', '5'], null,
  ['path', 'Path', '6'], ['sand', 'Sand', '7'], ['rock', 'Rock', '8'], ['grass', 'Grass', '9'], ['vegdens', 'Plants', ''], ['grassk', 'Blades', ''], ['walk', 'Walk', ''],
];
const BRUSHES = new Set([...TR.SCULPT, ...Object.keys(TR.PAINT)]);
function setTool(t) {
  S.tool = t; if (BRUSHES.has(t)) UI.disarm();
  drawTools(); OB.syncGizmo();
  UI.toolOpts($('toolOpts'), BRUSHES.has(t) ? t : null);
  V.showRing(null);
  hint();
}
function drawTools() {
  $('tools').replaceChildren(...TOOLS.map((t) => (t ? UI.h('button', { class: S.tool === t[0] ? 'on' : '', title: t[1] + (t[2] ? ` (${t[2]})` : ''), onclick: () => setTool(t[0]) }, t[1]) : UI.h('span', { style: 'width:6px' }))));
}
function drawSnaps() {
  const sn = OB.SNAP;
  const tog = (k, label, title) => UI.h('button', { class: sn[k] ? 'on' : '', title, onclick: () => { sn[k] = !sn[k]; drawSnaps(); OB.syncGizmo(); } }, label);
  const sel = (k, label, opts) => UI.h('select', { title: label, onchange: (e) => { sn[k] = +e.target.value; OB.syncGizmo(); } }, opts.map(([v, l]) => UI.h('option', { value: v, selected: sn[k] === v }, l)));
  $('snaps').replaceChildren(tog('ground', 'Ground', 'Moved pieces stay on the ground (G)'), tog('surface', 'Surface', 'Placed pieces face out of walls'),
    sel('move', 'Move snap', [[0, 'no grid'], [0.25, '0.25 m'], [0.5, '0.5 m'], [1, '1 m'], [2, '2 m']]), sel('rot', 'Turn snap', [[0, 'free turn'], [5, '5°'], [15, '15°'], [45, '45°'], [90, '90°']]),
    UI.h('button', { class: V.shadows ? 'on' : '', title: 'Shadows (faster without)', onclick: () => { V.shadows = !V.shadows; drawSnaps(); } }, 'Shadows'));
}
drawTools(); drawSnaps();
const hint = () => {
  const t = S.tool, a = UI.armedAsset();
  $('viewHint').textContent = a ? `Click to place ${a.name} · Esc stops` : BRUSHES.has(t) ? 'Left drag paints · [ ] size · right drag looks, + WASD flies'
    : 'Left click selects · drag a box · double-click: parts · right drag looks, + WASD flies · middle drag orbits · F focus';
};
on('armed', hint); hint();

// ---------- the docks ----------
const thumbs = TH.createThumbs();
const left = UI.tabs('leftTabs', 'leftPane', [['scene', 'Scene', UI.outliner], ['assets', 'Assets', (p) => UI.assets(p, thumbs)]]);
const right = UI.tabs('rightTabs', 'rightPane', [['insp', 'Inspector', UI.inspector], ['changes', 'Changes', UI.changes]]);
on('armed', () => { if (UI.armedAsset() && S.tool !== 'select') setTool('select'); });
void left; void right;

// ---------- viewport input ----------
let stroke = null, box = null, lastClick = 0;
const boxEl = UI.h('div', { style: 'position:absolute;border:1px solid #4fa3ff;background:rgba(79,163,255,.12);pointer-events:none;display:none' });
$('view').append(boxEl);
V.onDown = (e) => {
  const rr = V.rayAt(e.clientX, e.clientY);
  const a = UI.armedAsset();
  if (a) { const hit = V.pick(rr); if (hit) OB.placeAsset(a.kind, a.params, hit); if (!e.shiftKey) UI.disarm(); return; }
  if (BRUSHES.has(S.tool)) {
    const g = V.ground(rr); if (!g) return;
    if (S.tool === 'flatten' && (e.ctrlKey || e.metaKey)) { TR.sampleTarget(g); UI.toast('Flatten height ' + TR.BRUSH.target.toFixed(2) + ' m'); return; }
    TR.strokeBegin(S.tool, g); stroke = { p: g, t: performance.now() };
    return;
  }
  const now = performance.now(), dbl = now - lastClick < 320; lastClick = now;
  const hit = V.pick(rr);
  if (hit && !hit.ground && !UI.isLocked(hit.object)) {
    const it = OB.itemFromHit(hit, dbl);
    if (it) { OB.select([it], e.ctrlKey || e.metaKey || e.shiftKey); return; }
  }
  box = { x: e.clientX, y: e.clientY, add: e.ctrlKey || e.metaKey || e.shiftKey };
};
V.onMove = (e) => {
  const rr = V.rayAt(e.clientX, e.clientY);
  if (BRUSHES.has(S.tool)) { const g = V.ground(rr); V.showRing(g, TR.BRUSH.r, TR.BRUSH.hard); if (stroke && g) stroke.p = g; if (g) $('stPos').textContent = `x ${g.x.toFixed(1)} · y ${g.y.toFixed(2)} · z ${g.z.toFixed(1)}`; }
  if (box) {
    const r = $('view').getBoundingClientRect();
    Object.assign(boxEl.style, { display: 'block', left: Math.min(box.x, e.clientX) - r.left + 'px', top: Math.min(box.y, e.clientY) - r.top + 'px', width: Math.abs(e.clientX - box.x) + 'px', height: Math.abs(e.clientY - box.y) + 'px' });
  }
};
V.onUp = (e) => {
  if (stroke) { TR.strokeEnd(); stroke = null; }
  if (box) {
    boxEl.style.display = 'none';
    const x0 = Math.min(box.x, e.clientX), x1 = Math.max(box.x, e.clientX), y0 = Math.min(box.y, e.clientY), y1 = Math.max(box.y, e.clientY);
    if (x1 - x0 < 4 && y1 - y0 < 4) { if (!box.add) OB.select([]); box = null; return; }
    const r = V.canvas.getBoundingClientRect(), v = new THREE.Vector3(), items = [];
    for (const en of OB.reg().list) {
      if (!en.o.visible || !en.anchor || UI.isLocked(en.o)) continue;
      v.fromArray(en.anchor).project(V.camera);
      if (v.z > 1) continue;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) items.push(OB.itemOf(en));
    }
    OB.select(items, box.add); box = null;
  }
};
V.onWheel = (e) => {
  if (BRUSHES.has(S.tool) && e.altKey) { TR.BRUSH.r = Math.max(0.5, Math.min(40, TR.BRUSH.r * Math.exp(-e.deltaY * 0.001))); UI.toolOpts($('toolOpts'), S.tool); return true; }
  return false;
};
on('focus', () => {
  const it = S.sel[0]; if (!it) return;
  const p = it.kind === 'veg' ? new THREE.Vector3(it.p.x, it.p.y, it.p.z) : new THREE.Box3().setFromObject(it.o).getCenter(new THREE.Vector3());
  const s = it.kind === 'veg' ? 6 : new THREE.Box3().setFromObject(it.o).getSize(new THREE.Vector3()).length();
  V.focus(p, Math.max(6, Math.min(200, s * 1.6)));
});

// ---------- keys ----------
addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea,select') || !$('modal').hidden) { if (e.key === 'Escape' && !$('modal').hidden) { $('modal').hidden = true; } return; }
  const c = e.ctrlKey || e.metaKey;
  if (c && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (c && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
  if (c && e.code === 'KeyS') { e.preventDefault(); save(true); return; }
  if (c && e.code === 'KeyD') { e.preventDefault(); OB.duplicateSel(); return; }
  if (c && e.code === 'KeyA') { e.preventDefault(); return; }
  if (V.fly) return;   // WASD fly
  if (e.code === 'Escape') { UI.disarm(); OB.select([]); setTool(S.tool === 'select' || BRUSHES.has(S.tool) ? 'select' : S.tool); return; }
  if (e.code === 'Delete' || e.code === 'Backspace') { OB.deleteSel(); return; }
  const map = { KeyQ: 'select', KeyW: 'move', KeyE: 'rotate', KeyR: 'scale', Digit1: 'raise', Digit2: 'lower', Digit3: 'smooth', Digit4: 'flatten', Digit5: 'noise', Digit6: 'path', Digit7: 'sand', Digit8: 'rock', Digit9: 'grass' };
  if (map[e.code]) { setTool(map[e.code]); return; }
  if (e.code === 'KeyF') emit('focus');
  if (e.code === 'KeyG') { OB.SNAP.ground = !OB.SNAP.ground; drawSnaps(); }
  if (e.code === 'End') OB.dropToGround();
  if (e.code === 'KeyP') play();
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') { TR.BRUSH.r = Math.max(0.5, Math.min(40, TR.BRUSH.r * (e.code === 'BracketLeft' ? 0.85 : 1.18))); UI.toolOpts($('toolOpts'), BRUSHES.has(S.tool) ? S.tool : null); }
});

// ---------- status ----------
on('select', () => {
  const s = S.sel;
  $('stSel').textContent = !s.length ? 'nothing selected' : s.length === 1 ? (s[0].kind === 'veg' ? 'plant ' + s[0].key : UI.nameOf(s[0].e)) : s.length + ' selected';
});
const setSave = (t, cls = '') => { $('stSave').textContent = t; $('stSave').className = cls; };
on('dirty', () => setSave(api.offline ? 'unsaved (offline: this browser only)' : 'unsaved changes', 'dirty'));
setSave(`draft from ${draft.from}` + (api.offline ? ' · offline' : ''), 'ok');
$('bUndo').onclick = undo; $('bRedo').onclick = redo;

// ---------- saving ----------
let saving = false;
async function save(manual) {
  if (saving) return; saving = true;
  try {
    setSave('saving…');
    const b = await ST.bundle(), text = JSON.stringify(b);
    await local.save(text);
    if (!api.offline) await api.putDraft(text);
    S.dirty = false; S.savedAt = Date.now();
    setSave(`saved ${new Date().toLocaleTimeString()}` + (api.offline ? ' (this browser)' : ''), 'ok');
    if (manual) UI.toast('Draft saved');
  } catch (e) { setSave('save failed: ' + e.message, 'bad'); console.error(e); } finally { saving = false; }
}
setInterval(() => { if (S.dirty && !V.drag && !stroke) save(false); }, 20000);
addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
$('bSave').onclick = () => save(true);

// ---------- versions and publishing ----------
$('bVersions').onclick = versions;
async function versions() {
  const h = UI.h;
  const body = h('div', {}, 'Loading…');
  UI.modal('Versions and publishing', body);
  if (api.offline) { body.textContent = 'Offline: versions and publishing need the editor\'s server (reload and enter the passphrase).'; return; }
  const draw = async () => {
    const [vs, rq] = await Promise.all([api.versions(), api.requests()]);
    const msg = h('input', { type: 'text', placeholder: 'What changed (for the history and the phone\'s notes)', style: 'flex:1' });
    body.replaceChildren(
      h('div', { class: 'note' }, 'Save version keeps a copy of the draft. Publish to phone asks the publisher to put that version in the game: it bakes what changed, checks it and sends the update to the phone, and reports back here.'),
      h('div', { class: 'row' }, msg, h('button', { class: 'accent', onclick: async () => { await save(false); const v = await api.saveVersion(msg.value || 'edit'); UI.toast('Saved version ' + v.id); draw(); } }, 'Save version')),
      h('h3', {}, 'Publish requests'),
      rq.length ? h('table', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'version'), h('th', {}, 'when'), h('th', {}, 'status'), h('th', {}, 'log')),
        rq.slice().reverse().map((r) => h('tr', {}, h('td', {}, r.id), h('td', {}, r.version), h('td', {}, new Date(r.at).toLocaleString()),
          h('td', { class: r.status === 'done' ? 'okc' : r.status === 'failed' ? 'err' : 'warnc' }, r.status), h('td', { class: 'mono' }, (r.log || []).slice(-4).map((l) => l.t).join('\n') + (r.result ? '\n' + JSON.stringify(r.result) : ''))))) : h('div', { class: 'note' }, 'None yet.'),
      h('h3', {}, 'Saved versions'),
      vs.length ? h('table', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'when'), h('th', {}, 'message'), h('th', {}, 'size'), h('th', {}, '')),
        vs.slice().reverse().map((v) => h('tr', {}, h('td', {}, v.id), h('td', {}, new Date(v.at).toLocaleString()), h('td', {}, v.message), h('td', {}, (v.size / 1024).toFixed(0) + ' KB'),
          h('td', {}, h('div', { class: 'btns' },
            h('button', { onclick: async () => { const r = await api.publish(v.id, v.message); UI.toast('Publish request #' + r.id + ' filed'); draw(); } }, 'Publish to phone'),
            h('button', { onclick: async () => { if (!confirm('Replace the draft with version ' + v.id + '? (Save a version of the draft first if you want to keep it.)')) return; const b = await api.version(v.id); await api.putDraft(JSON.stringify(b)); S.dirty = false; location.reload(); } }, 'Open')))))) : h('div', { class: 'note' }, 'No versions yet.'),
    );
  };
  draw().catch((e) => { body.textContent = 'Could not load: ' + e.message; });
}

// ---------- Play here ----------
$('bPlay').onclick = play;
function play() {
  const p = V.ground(V.rayAt(V.canvas.getBoundingClientRect().left + V.canvas.clientWidth / 2, V.canvas.getBoundingClientRect().top + V.canvas.clientHeight / 2)) || V.target;
  const yaw = Math.atan2(p.x - V.camera.position.x, p.z - V.camera.position.z);
  const url = `index.html?edits=draft&q=low&at=${p.x.toFixed(2)},${p.z.toFixed(2)},${yaw.toFixed(3)}`;
  const wrap = UI.h('div', { id: 'play' }, UI.h('button', { onclick: () => wrap.remove() }, '✕ Back to the editor (Esc)'), UI.h('iframe', { src: url, allow: 'fullscreen' }));
  document.body.append(wrap);
  const esc = (e) => { if (e.key === 'Escape') { wrap.remove(); removeEventListener('keydown', esc); } };
  addEventListener('keydown', esc);
}
addEventListener('message', async (e) => {
  if (e.data && e.data.type === 'pallet-edits-please') e.source.postMessage({ type: 'pallet-edits', edits: await ST.forGame() }, '*');
});

// ---------- help ----------
$('bHelp').onclick = () => UI.modal('PalletEdit: how it works', UI.h('div', { class: 'help', html: `
<p>What you see is the game's own world, made by its generators. Your changes are kept as <b>edits on top</b> (moved, turned, deleted or added pieces, sculpted and painted ground, moved plants), so they survive when the generators change, and the next bake carries them into the phone game.</p>
<p><b>Camera</b>: right drag looks around; hold it and <kbd>W A S D</kbd> fly (<kbd>Q</kbd>/<kbd>E</kbd> down/up, <kbd>Shift</kbd> faster). Middle drag or <kbd>Alt</kbd>+left drag orbits, <kbd>Shift</kbd>+middle drag pans, the wheel zooms to the cursor, <kbd>F</kbd> frames the selection.</p>
<p><b>Pieces</b>: <kbd>Q</kbd> select, <kbd>W</kbd> move, <kbd>E</kbd> turn, <kbd>R</kbd> scale. Click selects a whole piece, double-click goes into its parts; <kbd>Ctrl</kbd>/<kbd>Shift</kbd>+click adds; drag on empty ground for a box. <kbd>Ctrl+D</kbd> duplicate, <kbd>Delete</kbd>, <kbd>End</kbd> drop to the ground, <kbd>G</kbd> keeps moved pieces on the ground. Assets tab: pick one and click to place it.</p>
<p><b>Ground</b>: <kbd>1</kbd>–<kbd>5</kbd> raise, lower, smooth, flatten (<kbd>Ctrl</kbd>+click picks its height), noise; <kbd>6</kbd>–<kbd>9</kbd> paint dirt path, sand, rock, grass. Plants thins or clears trees and bushes, Blades the grass, Walk paints where you can walk (blocked, walkable, ledge). <kbd>[</kbd> <kbd>]</kbd> brush size.</p>
<p><b>Saving</b>: the draft saves itself every 20 s (and <kbd>Ctrl+S</kbd>). <b>Versions</b> keeps copies and sends one to the phone ("Publish to phone"). <kbd>Ctrl+Z</kbd> undo, <kbd>Ctrl+Shift+Z</kbd> redo. <b>Play here</b> (<kbd>P</kbd>) walks the draft from the middle of the view.</p>
<p class="mono">Server: ${API_URL}${api.offline ? ' (offline)' : ''}</p>` }));

// ---------- the loop ----------
const clock = new THREE.Clock();
const fps = { n: 0, t: 0 };
const STILL = new URLSearchParams(location.search).has('still');   // automated checks draw on demand (editor.draw())
function frame() {
  if (!STILL) requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  V.update(dt);
  if (stroke) TR.strokeApply(S.tool, stroke.p, dt);
  world.veg.update(V.camera.position);
  V.renderer.render(world.scene, V.camera);
  fps.n++; fps.t += dt;
  if (fps.t > 0.5) { $('stFps').textContent = Math.round(fps.n / fps.t) + ' fps'; fps.n = 0; fps.t = 0; }
}
frame();
window.editor = { V, world, S, E, OB, TR, UI, ST, save, setTool, draw: frame };
