// The editor's panels: the outliner (scene tree), the asset browser, the
// inspector, the changes list, the brush options and the dialogs.
import * as THREE from 'three';
import { E } from '../editlayer/index.js';
import { OUTDOOR } from '../editlayer/objects.js';
import { CATALOG } from '../props/catalog.js';
import * as O from '../props/outdoor.js';
import { S, on, emit } from './state.js';
import * as OB from './objects.js';
import { BRUSH, PAINT } from './terrain.js';

export const $ = (id) => document.getElementById(id);
export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
};
export function toast(t, kind = '') {
  const el = h('div', { class: kind, style: 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:#2b3040;border:1px solid #4a5268;padding:7px 14px;border-radius:8px;z-index:70;max-width:80vw' }, t);
  document.body.append(el); setTimeout(() => el.remove(), 3500);
}
on('toast', toast);

// ---------- tabs ----------
export function tabs(navId, paneId, list, start) {
  const nav = $(navId), pane = $(paneId);
  let cur = start || list[0][0];
  const draw = () => {
    nav.replaceChildren(...list.map(([k, label]) => h('button', { class: k === cur ? 'on' : '', onclick: () => { cur = k; draw(); } }, label)));
    const f = list.find(([k]) => k === cur)[2];
    pane.replaceChildren(); f(pane);
  };
  draw();
  return { show(k) { cur = k; draw(); }, redraw: draw, get cur() { return cur; } };
}

// ---------- the outliner ----------
const AREA = (e) => {
  if (e.added) return 'Added by you';
  const z = e.anchor ? e.anchor[2] : 0, head = e.chain.split('/')[0];
  if (z < -66 || head === 'route1Fill' || head === 'route1') return 'Route 1';
  return ({ cottage: 'Houses', buildLab: "Oak's lab", labGate: "Oak's lab", labStairs: "Oak's lab", hillPlants: "Oak's lab", bridge: 'Bridges', streamRocks: 'Stream',
    laneFurniture: 'Lanes', dock: 'Harbour', palletHouse: 'PALLET HOUSE', bedBorder: 'Square', bench: 'Square', well: 'Square', sign: 'Signs', signpost: 'Signs' })[head] || 'Town';
};
export const nameOf = (e) => (e.added ? e.added.kind.split(':').pop() : e.label) + (e.uses && e.uses[0] && e.uses[0].lines ? ' · ' + String(e.uses[0].lines[0]).slice(0, 28) : '');
const editorHidden = new WeakSet(), locked = new WeakSet();
export const isLocked = (o) => { for (let q = o; q; q = q.parent) if (locked.has(q)) return true; return false; };
let outlineFilter = '', open = new Set();
export function outliner(pane) {
  const search = h('input', { class: 'search', placeholder: 'Search pieces (name, id, text)…', value: outlineFilter, oninput: (e) => { outlineFilter = e.target.value; draw(); } });
  const list = h('ul', { class: 'tree' });
  pane.append(search, list);
  function draw() {
    const q = outlineFilter.toLowerCase();
    const groups = new Map();
    for (const e of OB.reg().list) {
      if (e.o.parent == null || (e.added && !E.doc.added.includes(e.added))) continue;
      const n = nameOf(e);
      if (q && !(n.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))) continue;
      const g = AREA(e);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(e);
    }
    const rows = [];
    const selO = new Set(S.sel.map((s) => s.o));
    for (const [g, list2] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const isOpen = open.has(g) || !!q;
      rows.push(h('li', { class: 'grp', onclick: () => { if (open.has(g)) open.delete(g); else open.add(g); draw(); } }, (isOpen ? '▾ ' : '▸ ') + g + ` (${list2.length})`));
      if (!isOpen) continue;
      for (const e of list2) rows.push(row(e, e.o, 0, selO));
    }
    list.replaceChildren(...rows.flat());
  }
  function row(e, o, depth, selO) {
    const ed = E.doc.objects[OB.idOf(e, o)];
    const kids = o.children.filter((c) => c.isGroup || c.isMesh);
    const key = 'o' + o.id, isOpen = open.has(key);
    const li = h('li', { class: (selO.has(o) ? 'sel ' : '') + (ed || e.added ? 'edited ' : '') + (o.userData.deleted || !o.visible ? 'hidden' : ''), style: `padding-left:${4 + depth * 14}px`,
      onclick: (ev) => { OB.select([OB.itemOf(e, o)], ev.ctrlKey || ev.metaKey || ev.shiftKey); },
      ondblclick: () => emit('focus') },
    h('span', { class: 'ico', onclick: (ev) => { ev.stopPropagation(); if (open.has(key)) open.delete(key); else open.add(key); draw(); } }, kids.length ? (isOpen ? '▾' : '▸') : ''),
    h('span', { class: 'lab', title: OB.idOf(e, o) }, depth ? (o.name || o.type) + ' ' + (o.isMesh ? '' : `(${kids.length})`) : nameOf(e)),
    h('span', { class: 'ico', title: 'Show / hide in the editor', onclick: (ev) => { ev.stopPropagation(); if (editorHidden.has(o)) { editorHidden.delete(o); o.visible = !o.userData.deleted; } else { editorHidden.add(o); o.visible = false; } draw(); } }, editorHidden.has(o) ? '◌' : '◉'),
    h('span', { class: 'ico', title: 'Lock (no picking or moving)', onclick: (ev) => { ev.stopPropagation(); if (locked.has(o)) locked.delete(o); else locked.add(o); draw(); } }, locked.has(o) ? '🔒' : '·'));
    const out = [li];
    if (isOpen) for (const c of kids.slice(0, 200)) out.push(row(e, c, depth + 1, selO));
    return out;
  }
  draw();
  const re = () => { if (pane.isConnected) draw(); };
  on('select', re); on('changed', re);
}

// ---------- assets ----------
// params a builder takes, from its signature: builder({ W = 8.4, wood = '#8a5b38' } = {})
export function defaultsOf(fn) {
  const m = /^function\s*\w*\s*\(\s*\{([\s\S]*?)\}\s*=\s*\{\s*\}\s*\)/.exec(fn.toString());
  const out = {};
  if (!m) return out;
  for (const part of m[1].split(/,(?![^[]*\])/)) {
    const mm = /^\s*(\w+)\s*(?::\s*\w+)?\s*=\s*([\s\S]+?)\s*$/.exec(part);
    if (!mm) continue;
    try { out[mm[1]] = JSON.parse(mm[2].replace(/'/g, '"').replace(/\bMath\.PI\b/g, String(Math.PI))); } catch { /* an expression: left to the builder */ }
  }
  return out;
}
export const TREES = ['tiered', 'shade', 'linden', 'beech', 'oak', 'spreading', 'multistem', 'bushy', 'sapling', 'birch', 'lombardy', 'cypress', 'giant', 'oldgrowth', 'scotspine', 'dead', 'willow', 'palm', 'maple'];
export const ASSETS = [
  ['Outdoor', OUTDOOR.map((k) => ({ kind: 'outdoor:' + k, name: k, params: defaultsOf(O[k]) }))],
  ['Plants', [...TREES.map((k) => ({ kind: 'tree:' + k, name: k + ' tree', params: { seed: 11 } })), { kind: 'bush', name: 'bush', params: { seed: 1, size: 1 } }, { kind: 'rock', name: 'rock', params: { seed: 1, size: 1 } }]],
  ['Signs', [{ kind: 'sign:noticeBoard', name: 'notice board', params: { title: 'NOTICE', lines: ['A new notice.'], style: 'pinned' } }, { kind: 'sign:fingerpost', name: 'fingerpost', params: { arms: [['PALLET TOWN', 0], ['ROUTE 1', 3.1]] } },
    { kind: 'sign:welcomeSign', name: 'welcome sign', params: { title: 'PALLET TOWN', sub: 'WHERE EVERY JOURNEY BEGINS' } }, { kind: 'sign:routeSign', name: 'route sign', params: { num: '1', north: 'VIRIDIAN CITY', south: 'PALLET TOWN' } },
    { kind: 'sign:nameplate', name: 'nameplate', params: { name: 'NAME' } }]],
  ['Props', Object.entries(CATALOG).map(([k, c]) => ({ kind: 'prop:' + k, name: k.replace(/_/g, ' '), params: { ...(c.params || {}) } }))],
];
let armed = null, assetQ = '';
export const armedAsset = () => armed;
export function disarm() { armed = null; emit('armed'); }
export function assets(pane, thumbs) {
  const search = h('input', { class: 'search', placeholder: 'Search assets…', value: assetQ, oninput: (e) => { assetQ = e.target.value; draw(); } });
  const body = h('div');
  pane.append(h('div', { class: 'note' }, 'Pick one, then click in the view to place it (Esc stops). On a wall it faces out of the wall.'), search, body);
  function draw() {
    const q = assetQ.toLowerCase();
    body.replaceChildren(...ASSETS.map(([cat, list]) => {
      const items = list.filter((a) => !q || a.name.toLowerCase().includes(q));
      if (!items.length) return null;
      return h('div', { class: 'sect' }, h('h3', {}, cat), h('div', { class: 'assets' }, items.map((a) => {
        const el = h('div', { class: 'asset' + (armed && armed.kind === a.kind ? ' on' : ''), title: a.kind, onclick: () => { armed = armed && armed.kind === a.kind ? null : a; emit('armed'); draw(); } },
          thumbs.get(a), h('span', {}, a.name));
        return el;
      })));
    }));
  }
  draw();
  on('armed', () => { if (body.isConnected) draw(); });
}

// ---------- inspector ----------
const deg = (r) => +(r * 180 / Math.PI).toFixed(2), rad = (d) => d * Math.PI / 180;
const num = (v, f, step = 0.1) => h('input', { type: 'number', step, value: +(+v).toFixed(3), onchange: (e) => f(+e.target.value) });
export function inspector(pane) {
  const draw = () => {
    pane.replaceChildren();
    const sel = S.sel;
    if (!sel.length) { pane.append(h('div', { class: 'note' }, 'Nothing selected. Click a piece in the view or the outliner. Ctrl / Shift + click adds to the selection; double-click goes into a piece\'s parts.')); orphans(pane); return; }
    if (sel.length > 1) {
      pane.append(h('div', { class: 'sect' }, h('h3', {}, `${sel.length} selected`), h('div', { class: 'btns' },
        h('button', { onclick: OB.dropToGround }, 'Drop to ground'), h('button', { onclick: OB.duplicateSel }, 'Duplicate'), h('button', { class: 'danger', onclick: OB.deleteSel }, 'Delete'),
        h('button', { onclick: () => align('x') }, 'Align X'), h('button', { onclick: () => align('z') }, 'Align Z'), h('button', { onclick: () => align('y') }, 'Align height'))));
      return;
    }
    const it = sel[0];
    if (it.kind === 'veg') return vegPanel(pane, it);
    if (it.kind === 'spot') return spotPanel(pane, it);
    const e = it.e, o = it.o, top = o === e.o, ed = E.doc.objects[it.id] || {};
    const a = e.added ? E.doc.added.find((x) => x.id === e.added.id) : null;
    pane.append(h('div', { class: 'sect' }, h('h3', {}, top ? nameOf(e) : 'Part of ' + nameOf(e)),
      h('div', { class: 'mono' }, it.id), a ? h('div', { class: 'note' }, 'Added by you: ' + a.kind) : h('div', { class: 'note' }, `made by ${e.chain.replace(/\//g, ' › ')}` + (e.cols.length ? ` · ${e.cols.length} collider(s)` : ''))));
    const T = h('div', { class: 'sect' }, h('h3', {}, 'Transform'));
    const set = (f) => { OB.change('transform', () => { const st = [o.position.clone(), o.rotation.clone(), o.scale.clone()]; f(); o.updateMatrixWorld(true); OB.writeTransformPublic(it); OB.syncGizmo(); const en = [o.position.clone(), o.rotation.clone(), o.scale.clone()]; it._st = st; return () => { o.position.copy(en[0]); o.rotation.copy(en[1]); o.scale.copy(en[2]); OB.syncGizmo(); }; }, () => { o.position.copy(it._st[0]); o.rotation.copy(it._st[1]); o.scale.copy(it._st[2]); OB.syncGizmo(); }); draw(); };
    T.append(h('div', { class: 'row' }, h('span', { class: 'k' }, 'Position'), h('div', { class: 'vec' }, ['x', 'y', 'z'].map((k) => num(o.position[k], (v) => set(() => { o.position[k] = v; }))))));
    T.append(h('div', { class: 'row' }, h('span', { class: 'k' }, 'Rotation °'), h('div', { class: 'vec' }, ['x', 'y', 'z'].map((k) => num(deg(o.rotation[k]), (v) => set(() => { o.rotation[k] = rad(v); }), 1)))));
    T.append(h('div', { class: 'row' }, h('span', { class: 'k' }, 'Scale'), h('div', { class: 'vec' }, ['x', 'y', 'z'].map((k) => num(o.scale[k], (v) => set(() => { o.scale[k] = v; }), 0.05)))));
    pane.append(T);
    pane.append(h('div', { class: 'sect btns' },
      h('button', { onclick: () => emit('focus') }, 'Focus (F)'), top ? h('button', { onclick: OB.dropToGround }, 'Drop to ground') : null,
      h('button', { onclick: OB.duplicateSel }, 'Duplicate'), h('button', { class: 'danger', onclick: OB.deleteSel }, 'Delete'),
      !a ? h('button', { onclick: () => OB.hideInGame(!ed.hide) }, ed.hide ? 'Show in game' : 'Hide in game') : null,
      !a && (ed.pos || ed.del || ed.hide || ed.use) ? h('button', { onclick: OB.restoreSel }, 'Back to generated') : null));
    if (ed.del) pane.append(h('div', { class: 'note warnc' }, 'Deleted (kept here so it can come back: "Back to generated").'));
    // its interaction text
    const u = e.uses[0] || (a && a.use) || null;
    if (top && (u || a)) {
      const cur = (a ? a.use : ed.use) || (u ? { label: u.label, lines: u.lines } : { label: 'Look', lines: [] });
      const lab = h('input', { type: 'text', value: cur.label || '' }), txt = h('textarea', { rows: 4 }, (cur.lines || []).join('\n'));
      pane.append(h('div', { class: 'sect' }, h('h3', {}, 'What it says (E: read / look)'), h('div', { class: 'row' }, h('span', { class: 'k' }, 'Prompt'), lab), txt,
        h('div', { class: 'btns' }, h('button', { onclick: () => {
          const v = { label: lab.value || 'Look', lines: txt.value.split('\n').map((s) => s.trim()).filter(Boolean) };
          OB.change('text', () => { if (a) a.use = v; else { const d = (E.doc.objects[it.id] ||= {}); d.at = e.anchor; d.label = e.label; d.use = v; if (e.uses[0]) { e.uses[0].label = v.label; e.uses[0].lines = v.lines; } } });
        } }, 'Apply text')), h('div', { class: 'note' }, 'One line per box of dialogue.')));
    }
    if (a) params(pane, e, a);
    if (top && e.cols.length) pane.append(h('div', { class: 'sect' }, h('h3', {}, 'Colliders'), h('div', { class: 'mono' }, e.cols.map((c) => (c.box ? `box ${c.hw.toFixed(2)}×${c.hd.toFixed(2)}` : `circle r ${c.r.toFixed(2)}`)).join(' · '))));
  };
  function align(axis) {
    const items = S.sel.filter((s) => s.kind === 'obj'); if (items.length < 2) return;
    const v = items[0].o.position[axis];
    OB.change('align', () => { for (const it of items) { it.o.position[axis] = v; it.o.updateMatrixWorld(true); OB.writeTransformPublic(it); } OB.syncGizmo(); });
  }
  draw();
  const re = () => { if (pane.isConnected) draw(); };
  on('select', re); on('changed', re); on('transform', () => { if (pane.isConnected && document.activeElement?.tagName !== 'INPUT') draw(); });
}
function spotPanel(pane, it) {
  const o = it.o;
  pane.append(h('div', { class: 'sect' }, h('h3', {}, 'Place spot'), h('div', { class: 'mono' }, o.userData.spot),
    h('div', { class: 'note' }, `x ${o.position.x.toFixed(2)} · z ${o.position.z.toFixed(2)} · facing ${(o.rotation.y * 57.2958).toFixed(0)}°`),
    h('div', { class: 'note' }, 'Move it with W, turn it with E (the red tip is the way a person there faces). Saved to native/life/places.json, and kept through rebakes.'),
    h('div', { class: 'btns' }, h('button', { onclick: () => emit('focus') }, 'Focus'))));
}
function vegPanel(pane, it) {
  const p = it.p;
  pane.append(h('div', { class: 'sect' }, h('h3', {}, 'Plant'), h('div', { class: 'mono' }, it.id),
    h('div', { class: 'note' }, `x ${p.x.toFixed(2)} · z ${p.z.toFixed(2)} · turn ${(p.rot * 57.3).toFixed(0)}° · size ${p.s.toFixed(2)}`),
    h('div', { class: 'btns' }, h('button', { onclick: () => emit('focus') }, 'Focus'), h('button', { class: 'danger', onclick: OB.deleteSel }, 'Delete plant'),
      E.doc.veg[it.key] ? h('button', { onclick: () => OB.change('reset plant', () => { delete E.doc.veg[it.key]; }) }, 'Back to generated (on reload)') : null),
    h('div', { class: 'note' }, 'Move / turn / scale it with the gizmo (W / E / R).')));
}
function params(pane, e, a) {
  const P = a.params || (a.params = {});
  const base = (ASSETS.flatMap(([, l]) => l).find((x) => x.kind === a.kind) || {}).params || {};
  const keys = [...new Set([...Object.keys(base), ...Object.keys(P)])];
  const box = h('div', { class: 'sect' }, h('h3', {}, 'Parameters'));
  const apply = (k, v) => { OB.change('param ' + k, () => { P[k] = v; OB.rebuild(e); return () => OB.rebuild(e); }, () => OB.rebuild(e)); };
  for (const k of keys) {
    const v = P[k] ?? base[k];
    let inp;
    if (typeof v === 'number') inp = num(v, (x) => apply(k, x), Math.abs(v) >= 10 ? 1 : 0.05);
    else if (typeof v === 'boolean') inp = h('input', { type: 'checkbox', checked: v, onchange: (ev) => apply(k, ev.target.checked) });
    else if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) inp = h('input', { type: 'color', value: v, onchange: (ev) => apply(k, ev.target.value) });
    else if (typeof v === 'string') inp = h('input', { type: 'text', value: v, onchange: (ev) => apply(k, ev.target.value) });
    else inp = h('input', { type: 'text', value: JSON.stringify(v), onchange: (ev) => { try { apply(k, JSON.parse(ev.target.value)); } catch { toast('Not valid JSON'); } } });
    box.append(h('div', { class: 'row' }, h('label', { title: k }, k), inp));
  }
  const col = a.col ?? 'auto';
  box.append(h('div', { class: 'row' }, h('label', {}, 'collider'), h('select', { onchange: (ev) => OB.change('collider', () => { const v = ev.target.value; a.col = v === 'auto' || v === 'none' ? v : +v; }) },
    ['auto', 'none', '0.3', '0.6', '1', '1.5', '2.5'].map((v) => h('option', { value: v, selected: String(col) === v }, v === 'auto' ? 'its footprint' : v === 'none' ? 'none (walk through)' : 'circle r ' + v)))));
  pane.append(box);
}
function orphans(pane) {
  if (!E.orphans.length) return;
  pane.append(h('div', { class: 'sect' }, h('h3', {}, 'Edits that lost their piece'), h('div', { class: 'note' }, 'The generator no longer makes these (code changed). Remove them, or keep them in case it comes back.'),
    h('ul', { class: 'tree' }, E.orphans.map((x) => h('li', {}, h('span', { class: 'lab mono' }, `${x.kind}: ${x.id || x.key}`), x.kind === 'object' ? h('button', { onclick: () => OB.change('drop orphan', () => { delete E.doc.objects[x.id]; E.orphans = E.orphans.filter((y) => y !== x); }) }, 'Remove') : null)))));
}

// ---------- the changes list (what this draft changes) ----------
export function changes(pane) {
  const draw = () => {
    const d = E.doc, objs = Object.entries(d.objects || {}), veg = Object.keys(d.veg || {}).length;
    const tiles = { h: 0, p: 0, m: 0 };
    for (const l of ['h', 'p', 'm']) for (const t of E.tiles[l]) if (t) tiles[l]++;
    const roads = Object.keys(d.roads?.edit || {}).length + (d.roads?.added || []).length;
    pane.replaceChildren(
      h('div', { class: 'sect' }, h('h3', {}, 'This draft changes'), h('ul', { class: 'tree' },
        h('li', {}, `${objs.length} generated piece(s) edited`), h('li', {}, `${(d.added || []).length} piece(s) added`), h('li', {}, `${veg} plant(s) moved or deleted`),
        h('li', {}, `ground: ${tiles.h} height tile(s), ${tiles.p} paint tile(s), ${tiles.m} mask tile(s) (64 m squares)`), h('li', {}, `${roads} road edit(s)`),
        h('li', {}, `${Object.keys(S.life || {}).length} life file(s) edited`))),
      h('div', { class: 'sect' }, h('h3', {}, 'Edited pieces'), h('ul', { class: 'tree' }, objs.slice(0, 300).map(([id, ed]) => h('li', { onclick: () => { const hit = OB.reg().byId.get(id.split('>')[0]); if (hit) { OB.select([OB.itemOf(hit)]); emit('focus'); } } },
        h('span', { class: 'lab' }, (ed.label || '') + ' ' + [ed.del && 'deleted', ed.hide && 'hidden', ed.pos && 'moved', ed.use && 'text'].filter(Boolean).join(', ')), h('span', { class: 'meta mono' }, id.slice(5, 40)))))),
      h('div', { class: 'sect' }, h('h3', {}, 'Added'), h('ul', { class: 'tree' }, (d.added || []).map((a) => h('li', { onclick: () => { const hit = OB.reg().byId.get(a.id); if (hit) { OB.select([OB.itemOf(hit)]); emit('focus'); } } }, h('span', { class: 'lab' }, a.kind), h('span', { class: 'meta' }, a.pos.map((v) => v.toFixed(0)).join(', ')))))));
    orphans(pane);
  };
  draw();
  const re = () => { if (pane.isConnected) draw(); };
  on('changed', re); on('terrain', re);
}

// ---------- the brush options ----------
export function toolOpts(el, tool) {
  el.replaceChildren();
  el.classList.toggle('show', !!tool);
  if (!tool) return;
  const sl = (label, k, min, max, step) => { const o = h('span', { style: 'width:30px;color:#fff' }, String(BRUSH[k])); return h('label', {}, label, h('input', { type: 'range', min, max, step, value: BRUSH[k], oninput: (e) => { BRUSH[k] = +e.target.value; o.textContent = BRUSH[k]; } }), o); };
  el.append(sl('Size', 'r', 0.5, 40, 0.5), sl('Strength', 'strength', 0.05, 1, 0.05), sl('Hardness', 'hard', 0, 0.95, 0.05));
  if (tool === 'flatten') el.append(h('span', { class: 'note' }, 'Ctrl + click picks the height'));
  if (['path', 'sand', 'rock'].includes(tool)) el.append(h('label', {}, h('input', { type: 'checkbox', checked: !!BRUSH.erase, onchange: (e) => { BRUSH.erase = e.target.checked; } }), 'Erase paint'));
  if (tool === 'vegdens') { BRUSH.value = BRUSH.value > 1 ? 0 : BRUSH.value; el.append(sl('Keep', 'value', 0, 1, 0.05), h('span', { class: 'note' }, '0 = no plants, 1 = as generated')); }
  if (tool === 'grassk') { el.append(sl('Blades', 'value', 0, 2, 0.05), h('span', { class: 'note' }, '0 none · 1 as generated · 2 double')); }
  if (tool === 'walk') el.append(h('label', {}, 'Flag', h('select', { onchange: (e) => { BRUSH.value = +e.target.value; } },
    [[1, 'Blocked'], [2, 'Walkable'], [3, 'Ledge (hop down going south)'], [0, 'Clear (as generated)']].map(([v, l]) => h('option', { value: v, selected: BRUSH.value === v }, l)))));
  void PAINT; void THREE;
}

// ---------- dialogs ----------
export function modal(title, ...body) {
  const m = $('modal');
  const close = () => { m.hidden = true; m.replaceChildren(); };
  const box = h('div', { class: 'box' }, h('div', { style: 'display:flex;align-items:center' }, h('h2', { style: 'flex:1' }, title), h('button', { onclick: close }, '✕')), ...body);
  m.replaceChildren(box); m.hidden = false;
  m.onclick = (e) => { if (e.target === m) close(); };
  return { close, box };
}
