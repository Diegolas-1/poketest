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
  ['creatures', 'Creatures', 'Doduo and Caterpie: speeds, gait, bounce (creature_*.gd)'],
];
export function gamePanel(pane) {
  pane.append(h('div', { class: 'note' }, 'Numbers and tables the native game reads (native/tunables/). They go to the phone with "Publish to phone" (no world rebake needed).'),
    h('ul', { class: 'tree' }, TUNABLES.map(([f, name, sub]) => h('li', { onclick: () => openTunable(f, name) }, h('span', { class: 'lab' }, name), h('span', { class: 'meta' }, sub.slice(0, 40) + '…')))));
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
