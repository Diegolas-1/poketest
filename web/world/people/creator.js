// The character creator (creator.html): every part of the people generator in
// one screen. The look being made is one plain object (person.js' look); every
// control edits it through app.edit, which works out whether the change moves
// geometry (body, hair style, what is worn, an item's shape or pattern: the
// person is rebuilt off the page's thread after a short pause, the old one stays
// on screen until the new one is ready) or only colour (skin, face, underwear,
// garment and hair colours: pushed into the materials at once). Undo / redo
// keep whole looks; the current look is autosaved in the browser.
//
// Modules: creator/data.js (option lists, catalogue slots, colour maths,
// warnings), creator/random.js (seeded Randomize over ../random.js),
// creator/stage.js (the 3D viewport), creator/ui.js (DOM helpers, icons),
// creator/panels.js (the tabs).
import { makePerson, loadCatalog, loadClips } from './person.js';
import { createStage } from './creator/stage.js';
import { h, icon, toast, download, iconButton } from './creator/ui.js';
import { PANELS, equipInto } from './creator/panels.js';
import { SLIDERS, groupOf, warnings, paletteOf, colorsOfWorn, built, expressions, SLOT_TABS, has, HAIR_SHAPE } from './creator/data.js';
import { rollLook, rollBody, rollOutfit, presetLook, newSeed } from './creator/random.js';

const $ = (s) => document.querySelector(s);
const STORE = 'people-creator';
const store = {
  get(k, d) { try { const v = localStorage.getItem(`${STORE}.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`${STORE}.${k}`, JSON.stringify(v)); return true; } catch { return false; } },
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const LOCKS = [['body', 'Body'], ['face', 'Face'], ['skin', 'Skin'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['underwear', 'Underwear']];
const POSES = [['apose', 'A pose'], ['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run']];
const FRAMES = [['full', 'Full body'], ['face', 'Face'], ['torso', 'Torso'], ['legs', 'Legs'], ['feet', 'Feet']];

// ---------- the look ----------
function normal(l = {}) {
  const look = clone(l);
  look.body = { age: SLIDERS.age[2], sex: 0, ...(look.body || {}) };
  look.skin = { tone: '#f9dcb4', ...(look.skin || {}) };
  look.hair = { color: '#4a3226', ...(look.hair || {}) };
  look.face = look.face || {};
  look.underwear = { style: 'tank', color: '#f2f0ee', trim: '#9fb6d8', ...(look.underwear || {}) };
  look.outfit = Array.isArray(look.outfit) ? look.outfit.filter((w) => w && (w.id || w.item)).map((w) => (w.item && !w.id ? { ...w, id: w.item } : w)) : [];
  return look;
}
// what has to be rebuilt when it changes (everything else is paint)
function structure(look) {
  const hr = look.hair || {};
  return JSON.stringify([look.body, HAIR_SHAPE.map((k) => hr[k]), (look.outfit || []).map((w) => [w.id, w.params, w.pattern])]);
}
// the look as makePerson takes it (no creator-only fields; no hair until hair.js has styles)
function buildable(look) {
  const l = clone(look);
  delete l.name; delete l.seed; delete l.preset;
  if (!has.hair() && !(l.hair && l.hair.style)) delete l.hair;
  return l;
}

// ---------- the app ----------
const app = {
  look: null, cat: null, stage: null,
  ui: store.get('ui', { tab: 'presets', slotTab: 'top', blink: true }),
  locks: new Set(store.get('locks', [])),
  hist: { stack: [], i: -1 },
};
window.creator = app;

// building: debounced, one at a time, the newest look wins
// built: the structure on screen; target: the structure the newest build is for
const B = { timer: 0, busy: false, want: 0, lastType: 0, first: true, built: null, target: null };
function scheduleBuild(delay = 150) {
  B.want++; B.target = structure(app.look); clearTimeout(B.timer);
  B.timer = setTimeout(runBuild, delay);
  spinner(true);
}
async function runBuild() {
  if (B.busy) return;
  // never during typing: wait for a pause
  if (performance.now() - B.lastType < 500) { B.timer = setTimeout(runBuild, 250); return; }
  B.busy = true; const v = B.want;
  const look = buildable(app.look);
  try {
    const t0 = performance.now();
    const p = await makePerson(look, { worker: true, anim: true });
    p.ms = Math.round(performance.now() - t0);
    app.stage.setPerson(p);
    B.built = structure(app.look);
    applyAllPaint();
    if (app.ui.expression) app.stage.setExpression(app.ui.expression, app.ui.exprAmount ?? 1);
    if (B.first) { B.first = false; requestAnimationFrame(() => { $('#loading').classList.add('gone'); setTimeout(() => { window.ready = true; }, 600); }); }
    renderCard();
  } catch (e) {
    console.error('build failed', e);
    toast('Could not build this look: ' + (e.message || e).toString().slice(0, 120), 'bad');
    if (B.first) { B.first = false; window.ready = true; $('#loading').classList.add('gone'); }
  }
  B.busy = false;
  if (B.want !== v) runBuild(); else spinner(false);
}
function spinner(on) { $('#spinner').classList.toggle('on', on); }

// colour-only changes straight into the materials; false when one can't be (then it is rebuilt)
function applyPaint(what) {
  const p = app.stage.person; if (!p) return true;
  const look = app.look;
  if (what === 'skin') {
    const m = p.body && p.body.material;
    if (m && m.userData.set) { m.userData.set(buildable(look)); app.stage.invalidate(); return true; }
    return false;
  }
  if (what === 'hair') {
    const ms = p.meshes.filter((m) => m.userData.slot === 'hair' || m.name === 'hair');
    if (!ms.length) return true;
    let ok = true;
    for (const m of ms) {
      const mat = m.material;
      if (mat.userData.set) mat.userData.set(look.hair, look);
      else if (mat.setColors) mat.setColors({ main: look.hair.color });
      else ok = false;
    }
    app.stage.invalidate();
    return ok;
  }
  if (what.startsWith('item:')) {
    const id = what.slice(5), w = look.outfit.find((x) => x.id === id), item = app.cat.byId[id];
    if (!w || !item) return true;
    for (const m of p.meshes) if (m.userData.item && m.userData.item.id === id && m.material.setColors) m.material.setColors(colorsOfWorn(item, w));
    app.stage.invalidate();
    return true;
  }
  return false;
}
function applyAllPaint() {
  let ok = applyPaint('skin') && applyPaint('hair');
  for (const w of app.look.outfit) ok = applyPaint('item:' + w.id) && ok;
  return ok;
}

// every change goes through here
app.edit = (fn, o = {}) => {
  const before = structure(app.look);
  fn(app.look);
  const after = structure(app.look);
  if (before !== after || after !== B.target) scheduleBuild(o.delay ?? 150);
  else {
    const ok = o.paint ? applyPaint(o.paint) : applyAllPaint();
    if (!ok) scheduleBuild(o.delay ?? 150);
  }
  if (o.frame) app.frame(o.frame);
  if (o.commit !== false) app.commit();
  renderCardSoon();
};
app.commit = () => {
  const j = JSON.stringify(app.look), H = app.hist;
  if (H.stack[H.i] === j) return;
  H.stack.splice(H.i + 1); H.stack.push(j);
  if (H.stack.length > 200) H.stack.shift();
  H.i = H.stack.length - 1;
  store.set('current', app.look);
  undoButtons();
};
// a whole new look (undo, load, presets, randomize)
app.setLook = (look, o = {}) => {
  const before = app.look ? structure(app.look) : null;
  app.look = normal(look);
  if (o.commit !== false) app.commit();
  if (structure(app.look) !== before || structure(app.look) !== B.target) scheduleBuild(o.delay ?? 0);
  else if (!applyAllPaint()) scheduleBuild(0);
  if (app.ui.sel && !app.look.outfit.some((w) => w.id === app.ui.sel)) app.ui.sel = null;
  app.renderPanel(); renderCard();
};
app.undo = () => { const H = app.hist; if (H.i <= 0) return; H.i--; app.setLook(JSON.parse(H.stack[H.i]), { commit: false }); store.set('current', app.look); undoButtons(); toast('Undo'); };
app.redo = () => { const H = app.hist; if (H.i >= H.stack.length - 1) return; H.i++; app.setLook(JSON.parse(H.stack[H.i]), { commit: false }); store.set('current', app.look); undoButtons(); toast('Redo'); };
app.typing = () => { B.lastType = performance.now(); };
app.frame = (name) => { if (name && app.stage.frameName !== name) app.stage.frame(name); highlightFrame(); };

app.randomize = (o = {}) => {
  const seed = o.seed ?? newSeed();
  const next = rollLook(seed, app.look, app.cat, { locks: o.ignoreLocks ? new Set() : app.locks, group: o.group, sex: o.sex });
  app.ui.sel = null;
  app.setLook(next);
  toast(`New look · seed ${seed}`);
};
app.rollBody = () => { app.setLook(rollBody(app.look)); };
app.rollOutfit = () => { app.ui.sel = null; app.setLook(rollOutfit(app.look, app.cat)); };
app.applyPreset = (p) => {
  app.ui.sel = null;
  app.setLook(presetLook(p, app.cat, app.look));
  app.stage.frame('full');
  toast(p.name);
};
app.equip = (item, o = {}) => {
  const tab = SLOT_TABS.find((t) => t.slots.includes(item.slot));
  app.edit((l) => { equipInto(l, item, o, app.cat); }, { frame: tab && tab.frame });
  app.ui.sel = item.id;
  if (!built(item)) toast(`${item.name}: coming soon (no "${item.base}" builder yet)`, 'info');
  app.renderPanel();
};
app.unequip = (item) => {
  app.edit((l) => { l.outfit = l.outfit.filter((w) => w.id !== item.id); });
  if (app.ui.sel === item.id) app.ui.sel = null;
  app.renderPanel();
};
app.setExpression = (id, amount = app.ui.exprAmount ?? 1) => { app.ui.expression = id; app.ui.exprAmount = amount; app.stage.setExpression(id, amount); saveUi(); const s = $('#expr'); if (s) s.value = id; };
app.setBlink = (on) => { app.ui.blink = on; app.stage.setBlink(on); saveUi(); const b = $('#blink'); if (b) b.classList.toggle('on', on); };
app.peekUnderwear = () => {
  const p = app.stage.person; if (!p) return;
  const hide = p.meshes.filter((m) => m.userData.item);
  hide.forEach((m) => { m.visible = false; }); app.stage.invalidate();
  setTimeout(() => { hide.forEach((m) => { m.visible = true; }); app.stage.invalidate(); }, 2200);
};
const saveUi = () => store.set('ui', { ...app.ui, sel: null });

// ---------- layout ----------
function shell() {
  const tabs = $('#tabs');
  for (const p of [...PANELS, { id: 'look', name: 'Look', icon: 'look', mobile: true }]) {
    tabs.append(h('button', { class: 'tab' + (p.mobile ? ' compact-only' : ''), 'data-tab': p.id, role: 'tab', title: `${p.name}${p.key ? ` (${p.key})` : ''}`, onclick: () => app.showTab(p.id) },
      icon(p.icon), h('span', {}, p.name)));
  }
  // the bottom sheet's handle (narrow screens): a bigger panel, a smaller viewport
  let gy = null;
  tabs.append(h('button', { id: 'grab', class: 'mobile-only', title: 'Resize the panel', 'aria-label': 'Resize the panel',
    onpointerdown: (e) => { gy = e.clientY; },
    onclick: (e) => { const dy = gy === null ? 0 : e.clientY - gy; gy = null; document.body.classList.toggle('sheet-full', Math.abs(dy) > 12 ? dy < 0 : !document.body.classList.contains('sheet-full')); setTimeout(() => app.stage.resize(), 320); } }));
  // header
  $('#undo').append(icon('undo')); $('#undo').onclick = app.undo;
  $('#redo').append(icon('redo')); $('#redo').onclick = app.redo;
  $('#dice-top').append(icon('dice')); $('#dice-top').onclick = () => app.randomize();
  $('#help').onclick = () => $('#keys').classList.toggle('open');
  // viewport toolbar
  const poses = h('div', { class: 'seg', role: 'group', 'aria-label': 'Pose' }, POSES.map(([id, name]) => h('button', { class: 'seg-b', 'data-pose': id, onclick: () => setPose(id) }, name)));
  const frames = h('div', { class: 'seg', role: 'group', 'aria-label': 'Framing' }, FRAMES.map(([id, name]) => h('button', { class: 'seg-b', 'data-frame': id, title: name, onclick: () => { app.stage.frame(id); highlightFrame(); } }, name)));
  const ex = expressions();
  const expr = h('select', { id: 'expr', 'aria-label': 'Expression', title: 'Expression', onchange: (e) => app.setExpression(e.target.value) }, ex.map((e) => h('option', { value: e.id }, e.name)));
  if (app.ui.expression) expr.value = app.ui.expression;
  const turn = h('button', { id: 'turn', class: 'tbtn' + (app.ui.turntable ? ' on' : ''), title: 'Turntable (T)', onclick: () => setTurn(!app.stage.turntable) }, icon('turn'), h('span', {}, 'Turntable'));
  const blink = h('button', { id: 'blink', class: 'tbtn' + (app.ui.blink !== false ? ' on' : ''), title: 'Blink', onclick: () => app.setBlink(!(app.ui.blink !== false)) }, icon('eye'), h('span', {}, 'Blink'));
  $('#tool-tl').append(poses);
  $('#tool-tr').append(turn);
  $('#tool-bl').append(frames);
  $('#tool-br').append(h('label', { class: 'expr-wrap', title: 'Expression' }, icon('face'), expr), blink);
}
function setPose(id) { app.ui.pose = id; app.stage.setPose(id); document.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', b.dataset.pose === id)); saveUi(); }
function setTurn(on) { app.ui.turntable = on; app.stage.setTurntable(on); $('#turn').classList.toggle('on', on); saveUi(); }
function highlightFrame() { const f = app.stage.frameName; document.querySelectorAll('[data-frame]').forEach((b) => b.classList.toggle('on', b.dataset.frame === f)); }

app.showTab = (id) => {
  if (id === 'look' && !mobile()) id = 'presets';
  app.ui.tab = id; saveUi();
  document.body.dataset.tab = id;
  document.querySelectorAll('#tabs .tab[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'); });
  const p = PANELS.find((x) => x.id === id);
  if (p) {
    app.renderPanel();
    const f = p.id === 'outfit' ? (SLOT_TABS.find((t) => t.id === app.ui.slotTab) || SLOT_TABS[0]).frame : p.frame;
    app.frame(f);
    $('#panel').scrollTop = 0;
  } else renderCard();
};
app.renderPanel = () => {
  const p = PANELS.find((x) => x.id === app.ui.tab) || PANELS[0];
  const el = $('#panel'), y = el.scrollTop;
  const body = h('div', { class: 'panel-inner' }, h('header', { class: 'panel-head' }, h('div', { class: 'step' }, String(PANELS.indexOf(p) + 1)), h('h2', {}, p.name)), p.make(app));
  el.replaceChildren(body);
  el.scrollTop = y;
};

// ---------- the summary card ----------
let cardTimer = 0;
function renderCardSoon() { clearTimeout(cardTimer); cardTimer = setTimeout(renderCard, 60); }
function renderCard() {
  const look = app.look, cat = app.cat, p = app.stage.person;
  const g = groupOf(look.body.age);
  const name = $('#name');
  if (document.activeElement !== name) name.value = look.name || '';
  const sex = look.body.sex < 0.15 ? 'Boy' : look.body.sex > 0.85 ? 'Girl' : 'Mixed';
  const grown = look.body.age >= 18 ? (sex === 'Boy' ? 'Man' : sex === 'Girl' ? 'Woman' : 'Mixed') : sex;
  const fresh = p && B.built === structure(look);
  $('#meta').replaceChildren(
    h('span', { class: 'pill' }, g.name), h('span', { class: 'pill' }, `${Math.round(look.body.age)} yrs`), h('span', { class: 'pill' }, grown),
    h('span', { class: 'pill tall', title: 'Height' }, p ? `${Math.round(p.H * 100)} cm${fresh ? '' : '…'}` : '… cm'));
  const pal = paletteOf(look, cat);
  const tot = pal.reduce((a, b) => a + b.w, 0) || 1;
  $('#palette').replaceChildren(...(pal.length ? pal.map((c) => h('i', { style: { background: c.c, flexGrow: c.w / tot }, title: c.c })) : [h('span', { class: 'empty' }, 'No outfit colours yet')]));
  const ws = warnings(look, cat, p && fresh ? p : null);
  $('#warnings').replaceChildren(...(ws.length ? ws.map((w) => h('li', { class: w.level }, icon(w.level === 'warn' ? 'warn' : w.level === 'style' ? 'palette' : 'info'), h('span', {}, w.text)))
    : [h('li', { class: 'ok' }, icon('sparkle'), h('span', {}, 'Looking good: no warnings'))]));
  const seed = $('#seed'); if (document.activeElement !== seed) seed.value = look.seed ?? '';
  $('#seed-note').textContent = look.seed !== undefined ? `Reproduces this look${look.preset ? ' (dressed from a catalogue preset)' : ''}` : 'Edited by hand: Randomize or type a seed for a reproducible look';
  $('#stats').textContent = p ? `${p.stats || ''}${p.ms ? ` · ${p.ms} ms` : ''}` : '';
}
function undoButtons() { $('#undo').disabled = app.hist.i <= 0; $('#redo').disabled = app.hist.i >= app.hist.stack.length - 1; }

function card() {
  const name = $('#name');
  name.addEventListener('input', () => { app.typing(); app.look.name = name.value; clearTimeout(name._t); name._t = setTimeout(() => app.commit(), 600); });
  name.addEventListener('change', () => app.commit());
  const locks = $('#locks');
  for (const [id, label] of LOCKS) {
    const b = h('button', { class: 'lock' + (app.locks.has(id) ? ' on' : ''), title: `Keep the ${label.toLowerCase()} when randomizing`, 'aria-pressed': app.locks.has(id) ? 'true' : 'false',
      onclick: () => { app.locks.has(id) ? app.locks.delete(id) : app.locks.add(id); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(app.locks.has(id))); b.replaceChildren(icon(app.locks.has(id) ? 'lock' : 'unlock'), label); store.set('locks', [...app.locks]); } },
    icon(app.locks.has(id) ? 'lock' : 'unlock'), label);
    locks.append(b);
  }
  $('#randomize').prepend(icon('dice'));
  $('#randomize').onclick = () => app.randomize();
  const seed = $('#seed');
  const goSeed = () => { const s = parseInt(seed.value, 10); if (Number.isFinite(s)) app.randomize({ seed: s >>> 0 }); else toast('A seed is a whole number', 'bad'); };
  seed.addEventListener('keydown', (e) => { if (e.key === 'Enter') goSeed(); });
  seed.addEventListener('input', app.typing);
  $('#seed-go').onclick = goSeed;
  const acts = $('#actions');
  const act = (ic, label, title, fn, id) => h('button', { class: 'act', title, id, onclick: fn }, icon(ic), h('span', {}, label));
  acts.append(
    act('save', 'Save slot', 'Save this look to a slot in this browser (with a picture)', saveSlot),
    act('download', 'Download', 'Download the look as JSON', () => download(`${fileName()}.look.json`, JSON.stringify({ kind: 'people-look', version: 1, look: app.look }, null, 2), 'application/json')),
    act('upload', 'Open file', 'Open a look JSON file', () => $('#file').click()),
    act('copy', 'Copy JSON', 'Copy the look as JSON', copyJSON),
    act('camera', 'Screenshot', 'Save the viewport as a PNG', () => { download(`${fileName()}.png`, app.stage.snapshot()); toast('Screenshot saved'); }),
    act('cube', 'Export GLB', 'A skinned glTF of the posed character on the game\'s rig, its paint baked into textures, with the game\'s clips', exportGLB, 'glb'));
  $('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const j = JSON.parse(await f.text()); loadJSON(j); toast(`Opened ${f.name}`); } catch (err) { toast('That file is not a look JSON', 'bad'); console.warn(err); }
  });
}
function loadJSON(j) {
  const look = j && j.look ? j.look : j;
  if (!look || typeof look !== 'object' || !(look.body || look.outfit)) throw new Error('not a look');
  app.ui.sel = null;
  app.setLook(look);
}
const fileName = () => (app.look.name || 'character').trim().replace(/[^\w-]+/g, '_').slice(0, 40) || 'character';
async function copyJSON() {
  const t = JSON.stringify(app.look, null, 2);
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, t); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* nothing more to try */ } ta.remove();
  }
  toast('Look JSON copied');
}
async function exportGLB() {
  const p = app.stage.person, btn = $('#glb'); if (!p || btn.disabled) return;
  btn.disabled = true; btn.classList.add('busy'); const lab = btn.querySelector('span'), keep = lab.textContent;
  lab.textContent = 'Baking…';
  await new Promise((r) => setTimeout(r, 30));
  try {
    const { exportGLB: bake } = await import('./export.js');
    const t0 = performance.now();
    app.stage.pause(true);
    const ab = await bake(p, app.stage.renderer, { size: 1024, clips: p.clips });
    download(`${fileName()}.glb`, new Blob([ab], { type: 'model/gltf-binary' }));
    toast(`GLB exported (${(ab.byteLength / 1048576).toFixed(1)} MB, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) { console.error(e); toast('Export failed: ' + (e.message || e), 'bad'); }
  app.stage.pause(false);
  btn.disabled = false; btn.classList.remove('busy'); lab.textContent = keep;
}

// ---------- save slots ----------
function saveSlot() {
  const slots = store.get('slots', []);
  const thumb = app.stage.thumbnail(96, 128);
  slots.unshift({ name: app.look.name || `Look ${slots.length + 1}`, look: app.look, thumb, t: Date.now() });
  if (slots.length > 12) slots.length = 12;
  if (!store.set('slots', slots)) { slots.length = Math.min(slots.length, 6); if (!store.set('slots', slots)) return toast('Browser storage is full or blocked', 'bad'); }
  renderSlots(); toast('Saved to a slot');
}
function renderSlots() {
  const slots = store.get('slots', []), el = $('#slots');
  $('#slots-count').textContent = slots.length ? `${slots.length}/12` : '';
  el.replaceChildren(...(slots.length ? slots.map((s, i) => h('div', { class: 'slot', title: `${s.name}\n${new Date(s.t).toLocaleString()}` },
    h('button', { class: 'slot-load', onclick: () => { app.ui.sel = null; app.setLook(s.look); toast(`Loaded ${s.name}`); } }, h('img', { src: s.thumb, alt: s.name }), h('span', {}, s.name)),
    iconButton('x', 'Delete slot', () => { const all = store.get('slots', []); all.splice(i, 1); store.set('slots', all); renderSlots(); }, 'slot-x')))
    : [h('p', { class: 'hint' }, 'Saved looks show up here, with a picture.')]));
}

// ---------- keys ----------
function keys() {
  addEventListener('keydown', (e) => {
    const t = e.target, typing = t && (t.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); app.redo(); return; }
    if (mod || e.altKey || typing) return;
    const p = PANELS.find((x) => x.key === e.key);
    if (p) { app.showTab(p.id); return; }
    if (e.key === 'r' || e.key === 'R') app.randomize();
    else if (e.key === 't' || e.key === 'T') setTurn(!app.stage.turntable);
    else if (e.key === 'f' || e.key === 'F') { app.stage.frame('full'); highlightFrame(); }
    else if (e.key === '?') $('#keys').classList.toggle('open');
    else if (e.key === 'Escape') $('#keys').classList.remove('open');
  });
}
const mq = matchMedia('(max-width: 1180px)');   // the card folds into a tab
const mobile = () => mq.matches;

// ---------- start ----------
async function start() {
  app.stage = createStage($('#stage'));
  shell(); card(); keys();
  mq.addEventListener('change', () => { if (!mobile() && app.ui.tab === 'look') app.showTab('presets'); });
  const [cat] = await Promise.all([loadCatalog(), loadClips()]);
  cat.byId = cat.byId || Object.fromEntries(cat.items.map((i) => [i.id, i]));
  app.cat = cat;
  // the first look: ?look=<json>, ?seed=<n>, the last session, or the starter trainer
  const q = new URLSearchParams(location.search);
  if (q.get('tab')) app.ui.tab = q.get('tab');
  if (q.get('slot')) app.ui.slotTab = q.get('slot');
  if (q.get('pose')) app.ui.pose = q.get('pose');
  let look = null;
  try { if (q.get('look')) look = JSON.parse(q.get('look')); } catch { toast('Could not read ?look=', 'bad'); }
  if (!look && q.has('seed')) look = rollLook(+q.get('seed') >>> 0, normal({}), cat, {});
  if (!look && !q.has('fresh')) look = store.get('current', null);
  if (!look) {
    const p = cat.outfits.find((o) => o.id === 'of_player_boy_classic') || cat.outfits[0];
    look = { ...presetLook(p, cat, normal({ hair: { color: '#4a3226' } }), 7), name: 'Trainer' };
    look.body = { age: 15, sex: 0 };
  }
  app.look = normal(look);
  app.hist = { stack: [], i: -1 };
  app.commit();
  undoButtons();
  setPose(app.ui.pose || 'idle');
  if (app.ui.turntable) setTurn(true);
  app.stage.setBlink(app.ui.blink !== false);
  app.showTab(mobile() || app.ui.tab !== 'look' ? app.ui.tab || 'presets' : 'presets');
  renderCard(); renderSlots();
  scheduleBuild(0);
}
start().catch((e) => { console.error(e); $('#loading').querySelector('p').textContent = 'Could not start: ' + e.message; window.ready = true; });
