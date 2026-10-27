// Game settings: the native game's tunables (native/tunables/*.json, read by
// tunables.gd at each place the value is used: speeds, the camera, the sun and
// haze, music, the clock, the settings window's defaults). A key that is not
// in the file keeps the default written in the code, so "Reset" just removes it.
import { h, toast } from './ui.js';
import { S, on } from './state.js';
import * as L from './life.js';
import { treeEdit, setAt } from './treeedit.js';
import { openDrawer } from './lifeui.js';

export const TUNABLES = [
  ['player', 'Player', 'Ash: walk and run speed, how fast he speeds up and turns, how wide he is for collisions'],
  ['camera', 'Camera', 'The outdoor camera: distance, pitch and its limits, how it follows'],
  ['render', 'Look', "The sun's direction and the haze colour"],
  ['music', 'Music', 'Tracks per part of the day, levels, fades'],
  ['clock', 'Clock', 'The hour a new game starts and the weekday of day 1'],
  ['settings', 'Settings defaults', 'Graphics presets and the other defaults a new player gets'],
  ['bike', 'Bike', "Ash's bicycle: speeds, braking and skids, turning and leaning, slopes and ground, hops, the camera on it, where it starts; the townspeople who ride (npc); bike looks over bike/looks.json (looks)"],
  ['creatures', 'Creatures', 'Doduo, Caterpie and Mr. Mime: gait, bounce, act timings, and Mr. Mime\'s job lengths (creature_*.gd, mime_life.gd)'],
];
// ---------- sound effects: the catalog (tools/sfx/build.py), changed through native/tunables/sfx.json ----------
let sfxQ = '';
async function openSfx() {
  const path = 'native/tunables/sfx.json';
  let cat;
  try { await L.repoFile(path); cat = await fetch(L.REPO_URL + 'native/audio/sfx/catalog.json').then((r) => r.json()); } catch (e) { toast(e.message); return; }
  const d = openDrawer('Game settings · Sound effects');
  const audio = new Audio();
  const draw = () => {
    if (!d.body.isConnected) return;
    const ov = S.life[path].data.sounds ||= {};
    const q = sfxQ.toLowerCase();
    const list = cat.sounds.filter((x) => !q || x.id.includes(q) || x.category.includes(q) || (x.tags || []).join(' ').includes(q));
    const set = (id, k, v) => L.fileChange(path, 'sfx ' + id, (dd) => { const o = ((dd.sounds ||= {})[id] ||= {}); if (v === null) delete o[k]; else o[k] = v; if (!Object.keys(o).length) delete dd.sounds[id]; });
    d.body.replaceChildren(h('input', { class: 'search', placeholder: `Search ${cat.sounds.length} sounds…`, value: sfxQ, oninput: (e) => { sfxQ = e.target.value; draw(); } }),
      h('table', { class: 'sched' }, h('tr', {}, ['', 'sound', 'category', 'vol dB', 'pitch lo', 'pitch hi', 'vary dB', 'distance', 'voices', 'gap s', ''].map((t) => h('th', {}, t))),
        list.slice(0, 200).map((x) => {
          const o = ov[x.id] || {}, val = (k) => o[k] ?? x[k];
          const num = (k, st, get = (v) => v, put = (v) => v) => h('td', {}, h('input', { type: 'number', step: st, style: 'width:62px' + (o[k] !== undefined ? ';border-color:#ff9b42' : ''), value: get(val(k)), onchange: (e) => set(x.id, k, put(+e.target.value)) }));
          const p = val('pitch') || [1, 1];
          return h('tr', {}, h('td', {}, h('button', { title: 'Play a variant', onclick: () => { audio.src = L.REPO_URL + 'native/audio/sfx/' + x.files[Math.floor(Math.random() * x.files.length)]; audio.volume = Math.min(1, Math.pow(10, (val('vol') || 0) / 20)); audio.playbackRate = (p[0] + p[1]) / 2; audio.play(); } }, '▶')),
            h('td', {}, x.id), h('td', { class: 'note' }, x.category), num('vol', 0.5),
            h('td', {}, h('input', { type: 'number', step: 0.01, style: 'width:62px', value: p[0], onchange: (e) => set(x.id, 'pitch', [+e.target.value, p[1]]) })),
            h('td', {}, h('input', { type: 'number', step: 0.01, style: 'width:62px', value: p[1], onchange: (e) => set(x.id, 'pitch', [p[0], +e.target.value]) })),
            num('vjit', 0.5), num('dist', 1), num('voices', 1), num('gap', 0.05),
            h('td', {}, Object.keys(o).length ? h('button', { onclick: () => L.fileChange(path, 'sfx reset', (dd) => { delete dd.sounds[x.id]; }) }, 'reset') : ''));
        })), list.length > 200 ? h('div', { class: 'note' }, 'Showing 200: search to narrow.') : '');
  };
  cur = draw; draw();
}
export function gamePanel(pane) {
  pane.append(h('div', { class: 'note' }, 'Numbers and tables the native game reads (native/tunables/). They go to the phone with "Publish to phone" (no world rebake needed).'),
    h('ul', { class: 'tree' }, TUNABLES.map(([f, name, sub]) => h('li', { title: sub, onclick: () => openTunable(f, name) }, h('span', { class: 'lab' }, name))),
      h('li', { title: 'Every sound: level, pitch, distance… (▶ plays it)', onclick: openSfx }, h('span', { class: 'lab' }, 'Sound effects'))),
    h('div', { class: 'sect', style: 'margin-top:10px' }, h('h3', {}, 'Interiors')));
  import('./interiors.js').then((I) => I.interiorsList(pane));
}
let cur = null;
async function openTunable(f, name) {
  const path = `native/tunables/${f}.json`;
  let data;
  try { data = await L.repoFile(path); } catch (e) { toast('Not in the repo yet: ' + path + ' (' + e.message + ')'); return; }
  const d = openDrawer('Game settings · ' + name);
  const open = new Set();
  const draw = () => {
    if (!d.body.isConnected) return;
    const node = S.life[path].data;
    d.body.replaceChildren(treeEdit(node, (p, v) => L.fileChange(path, 'tunable ' + f, (dd) => { if (!p.length) { for (const k of Object.keys(dd)) delete dd[k]; Object.assign(dd, v); } else setAt(dd, p, v); }), { open }),
      h('div', { class: 'btns', style: 'margin-top:8px' }, h('button', { onclick: () => { if (confirm('Put every value back to the code\'s defaults?')) L.fileChange(path, 'reset ' + f, (dd) => { const doc = dd._doc; for (const k of Object.keys(dd)) delete dd[k]; if (doc) dd._doc = doc; }); } }, 'Reset to the code\'s defaults')));
  };
  cur = draw; draw();
  void data;
}
on('life', () => { if (cur) cur(); });
