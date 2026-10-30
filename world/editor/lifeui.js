// The Town life panels: people (their details and their days, the schedule
// drawn in the view), places (markers in the view, moved with the gizmo).
// Schedules open in the bottom drawer over the view.
import { S, on, emit } from './state.js';
import { h, toast } from './ui.js';
import * as L from './life.js';
import * as T from './talk.js';

let lifeTab = 'people', person = null, day = 'default';
export function lifePanel(pane) {
  const nav = h('div', { class: 'btns', style: 'margin-bottom:8px' });
  const body = h('div');
  pane.append(nav, body);
  const draw = async () => {
    nav.replaceChildren(...[['people', 'People'], ['places', 'Places'], ['dialogue', 'Dialogue'], ['quests', 'Quests'], ['lore', 'Rumours'], ['pokemon', 'Pokémon'], ['check', 'Check']].map(([k, l]) => h('button', { class: lifeTab === k ? 'on' : '', onclick: () => { lifeTab = k; draw(); } }, l)));
    body.replaceChildren(h('div', { class: 'note' }, 'Loading…'));
    try {
      if (lifeTab === 'people') await peopleList(body);
      else if (lifeTab === 'places') await placesList(body);
      else if (lifeTab === 'dialogue') await T.dialogueList(body);
      else if (lifeTab === 'quests') await T.questList(body);
      else if (lifeTab === 'lore') await T.loreList(body);
      else if (lifeTab === 'pokemon') await T.companionList(body);
      else await checkList(body);
    } catch (e) { body.replaceChildren(h('div', { class: 'err' }, 'Could not load the game data: ' + e.message)); }
    L.showPlaces(lifeTab === 'places');
  };
  draw();
  on('life', () => { if (pane.isConnected) draw(); });
}

async function peopleList(body) {
  const pp = await L.life('people');
  body.replaceChildren(h('div', { class: 'note' }, 'The townspeople of the native game (native/life/people.json). Pick one to edit their day; their places show in the view.'),
    h('ul', { class: 'tree' }, (pp.people || []).map((p) => h('li', { class: person && person.id === p.id ? 'sel' : '', onclick: () => openPerson(p.id) },
      h('span', { class: 'lab' }, p.name || p.id), h('span', { class: 'meta' }, `${p.id} · home ${p.home}`)))),
    h('div', { class: 'btns' }, h('button', { onclick: addPerson }, '+ New person')));
}
async function addPerson() {
  const id = prompt('A short id for them (lowercase, like "rose"):');
  if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) return;
  const pp = await L.life('people');
  if (pp.people.some((p) => p.id === id)) return toast('There is already ' + id);
  L.lifeChange('people', 'new person', (d) => d.people.push({ id, name: id[0].toUpperCase() + id.slice(1), full: '', look: 'girl', stand_in: 'girl', home: 'red', age: 'adult', speed: 1.4, jitter: 15, friends: [],
    schedule: { default: [['00:00', 'sleep', 'home'], ['07:00', 'breakfast', 'home'], ['09:00', 'walk', 'plaza'], ['12:00', 'home', 'home'], ['14:00', 'chat', 'plaza'], ['18:00', 'supper', 'home'], ['22:00', 'sleep', 'home']] } }));
  openPerson(id);
}

// ---------- one person ----------
export async function openPerson(id) {
  const pp = await L.life('people'), pl = await L.life('places');
  person = pp.people.find((p) => p.id === id);
  if (!person) return;
  if (!person.schedule[day]) day = Object.keys(person.schedule)[0];
  const drawer = openDrawer(person.name + ' · ' + person.id);
  const places = L.placeStrings(pl), acts = pp.activities || [];
  const dl = h('datalist', { id: 'dlPlaces' }, places.map((p) => h('option', { value: p })));
  const dla = h('datalist', { id: 'dlActs' }, acts.map((p) => h('option', { value: p })));
  const ch = (label, fn) => L.lifeChange('people', label, (d) => fn(d.people.find((p) => p.id === id)));
  const draw = () => {
    person = (S.life['people.json'].data.people || []).find((p) => p.id === id);
    if (!person) { closeDrawer(); return; }
    const sch = person.schedule || {};
    const field = (k, w = 120) => h('label', { class: 'note', style: 'display:inline-flex;gap:4px;align-items:center;margin:0 10px 4px 0' }, k,
      h('input', { type: typeof person[k] === 'number' ? 'number' : 'text', step: 0.05, style: `width:${w}px`, value: Array.isArray(person[k]) ? person[k].join(', ') : person[k] ?? '',
        onchange: (e) => ch('edit ' + k, (p) => { const v = e.target.value; p[k] = Array.isArray(p[k]) || k === 'friends' ? v.split(',').map((s) => s.trim()).filter(Boolean) : typeof p[k] === 'number' ? +v : v; }) }));
    const blocks = sch[day] || [];
    drawer.body.replaceChildren(dl, dla,
      h('div', {}, field('name'), field('full', 160), field('look', 90), field('home', 90), field('speed', 60), field('jitter', 60), field('friends', 220)),
      h('div', { class: 'btns', style: 'margin:6px 0' }, Object.keys(sch).map((k) => h('button', { class: k === day ? 'on' : '', onclick: () => { day = k; draw(); } }, k)),
        h('button', { onclick: () => { const k = prompt('Day key: default, or weekdays like "sat" or "mon,wed"'); if (k && !sch[k]) ch('add day ' + k, (p) => { p.schedule[k] = JSON.parse(JSON.stringify(p.schedule[day])); day = k; }); } }, '+ day'),
        day !== 'default' ? h('button', { class: 'danger', onclick: () => { if (confirm('Remove the ' + day + ' schedule?')) ch('remove day', (p) => { delete p.schedule[day]; day = 'default'; }); } }, 'remove ' + day) : null),
      timeline(blocks),
      h('table', { class: 'sched' }, h('tr', {}, ['time', 'activity', 'place (a|b = either)', 'chance', 'else (activity, place)', ''].map((t) => h('th', {}, t))),
        blocks.map((b, i) => {
          const o = b[3] || {};
          const set = (fn) => ch('schedule', (p) => { fn(p.schedule[day][i]); p.schedule[day].sort((a, c) => a[0].localeCompare(c[0])); });
          return h('tr', {},
            h('td', {}, h('input', { type: 'text', pattern: '[0-2][0-9]:[0-5][0-9]', style: 'width:58px', value: b[0], onchange: (e) => set((r) => { r[0] = e.target.value; }) })),
            h('td', {}, h('input', { type: 'text', list: 'dlActs', value: b[1], style: 'width:110px', onchange: (e) => set((r) => { r[1] = e.target.value; }) })),
            h('td', {}, h('input', { type: 'text', list: 'dlPlaces', value: b[2], style: 'width:220px', onchange: (e) => set((r) => { r[2] = e.target.value; }) })),
            h('td', {}, h('input', { type: 'number', min: 0, max: 1, step: 0.05, style: 'width:60px', value: o.p ?? '', placeholder: '1', onchange: (e) => set((r) => { const v = e.target.value; r[3] = { ...(r[3] || {}) }; if (v === '' || +v >= 1) delete r[3].p; else r[3].p = +v; if (!Object.keys(r[3]).length) r.length = 3; }) })),
            h('td', {}, h('input', { type: 'text', style: 'width:170px', placeholder: 'yardwork, red.yard', value: o.else ? o.else.join(', ') : '', onchange: (e) => set((r) => { const v = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); r[3] = { ...(r[3] || {}) }; if (v.length === 2) r[3].else = v; else delete r[3].else; if (!Object.keys(r[3]).length) r.length = 3; }) })),
            h('td', {}, h('button', { title: 'Show it in the view', onclick: () => emit('focusPlace', b[2], person.home) }, '◎'), h('button', { title: 'Remove', onclick: () => ch('remove block', (p) => p.schedule[day].splice(i, 1)) }, '✕')));
        })),
      h('div', { class: 'btns', style: 'margin-top:6px' }, h('button', { onclick: () => ch('add block', (p) => { const l = p.schedule[day], last = l[l.length - 1]; l.push([last ? bump(last[0]) : '12:00', 'walk', 'plaza']); }) }, '+ block'),
        h('span', { class: 'note' }, 'Times are when each block starts; the person walks there and does the activity until the next block. Chance: how often it happens (else the alternative, or the block before carries on).')),
      problems(id));
    L.drawDay(person, day);
  };
  curDraw = draw;
  draw();
}
let curDraw = null;
on('life', () => { if (curDraw && drawerEl && !drawerEl.hidden) curDraw(); });
const bump = (t) => { const [hh, mm] = t.split(':').map(Number), m = Math.min(23 * 60 + 59, hh * 60 + mm + 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const ACOL = {};
const colOf = (a) => ACOL[a] ||= `hsl(${[...a].reduce((x, c) => x * 31 + c.charCodeAt(0), 7) % 360} 55% 48%)`;
function timeline(blocks) {
  const hm = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const bar = h('div', { style: 'position:relative;height:30px;border-radius:6px;overflow:hidden;background:#2a2f3c;margin:4px 0 8px' });
  blocks.forEach((b, i) => {
    const t0 = hm(b[0]), t1 = i + 1 < blocks.length ? hm(blocks[i + 1][0]) : 1440;
    bar.append(h('div', { title: `${b[0]} ${b[1]} @ ${b[2]}`, style: `position:absolute;top:0;bottom:0;left:${t0 / 14.4}%;width:${(t1 - t0) / 14.4}%;background:${colOf(b[1])};border-right:1px solid #0006;font-size:10px;color:#fff;overflow:hidden;white-space:nowrap;padding:2px 3px` }, b[1]));
  });
  for (let k = 0; k <= 24; k += 3) bar.append(h('div', { style: `position:absolute;bottom:0;left:${k / 0.24}%;font-size:9px;color:#fff9` }, k));
  return bar;
}
function problems(id) {
  const box = h('div', { class: 'note' });
  L.lifeCheck().then((r) => {
    const mine = [...r.errors.map((e) => ['err', e]), ...r.warnings.map((w) => ['warnc', w])].filter(([, t]) => t.includes(` ${id} `) || t.includes(`${id}'s`));
    box.replaceChildren(...(mine.length ? mine.map(([c, t]) => h('div', { class: c }, '• ' + t)) : [h('div', { class: 'okc' }, 'No problems found for ' + id)]));
  });
  return box;
}

// ---------- places ----------
async function placesList(body) {
  const pl = await L.life('places');
  const spots = L.spotsOf(pl);
  const groups = new Map();
  for (const s of spots) { const [a, b] = s.path.split('/'); const k = a + ' · ' + b; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  body.replaceChildren(h('div', { class: 'note' }, 'Where the townspeople go (native/life/places.json). Markers show in the view: orange = houses, blue = places, red tip = the way a person faces. Select one and move or turn it (W / E).'),
    h('ul', { class: 'tree' }, [...groups].map(([k, list]) => [h('li', { class: 'grp' }, k), ...list.map((s) => h('li', { onclick: () => emit('pickSpot', s.path) }, h('span', { class: 'lab' }, s.path.split('/').slice(2).join(' › ') || '(spot)'), h('span', { class: 'meta' }, s.v.map((x) => x.toFixed(1)).join(', '))))]).flat()));
}
async function checkList(body) {
  const r = await L.lifeCheck();
  body.replaceChildren(h('div', { class: 'note' }, 'The game data checked the way the native game reads it.'),
    h('div', { class: r.errors.length ? 'err' : 'okc' }, `${r.errors.length} error(s), ${r.warnings.length} warning(s)`),
    ...r.errors.map((e) => h('div', { class: 'err' }, '• ' + e)), ...r.warnings.map((e) => h('div', { class: 'warnc' }, '• ' + e)));
}

// ---------- the bottom drawer ----------
let drawerEl = null;
export function openDrawer(title) {
  if (!drawerEl) {
    drawerEl = h('div', { id: 'drawer' });
    document.getElementById('view').append(drawerEl);
  }
  const body = h('div', { class: 'dbody' });
  drawerEl.replaceChildren(h('div', { class: 'dhead' }, h('b', {}, title), h('span', { class: 'spacer' }), h('button', { title: 'Taller / shorter', onclick: () => drawerEl.classList.toggle('tall') }, '⇕'), h('button', { onclick: closeDrawer }, '✕')), body);
  drawerEl.hidden = false;
  curDraw = null;
  return { body };
}
export function closeDrawer() { if (drawerEl) drawerEl.hidden = true; person = null; curDraw = null; L.drawDay(null); }
