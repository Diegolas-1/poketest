// Dialogue, quests, rumours and the townspeople's Pokémon: the writing of the
// native game (native/life/dialogue.json, quests.json, lore.json,
// companions.json), edited in the bottom drawer with the line editor
// (treeedit.js), each change one undo step, checked the way quests.gd reads
// them, and played back in a text box like the game's (▶).
import { h, toast } from './ui.js';
import { S, on } from './state.js';
import * as L from './life.js';
import { treeEdit, setAt } from './treeedit.js';
import { openDrawer } from './lifeui.js';

// ---------- the preview player: the game's text box ----------
let box = null;
export function play(lines, who = '') {
  if (!lines || !lines.length) return;
  box?.remove();
  let i = 0;
  const text = h('div', { class: 'tbtext' }), next = h('div', { class: 'tbnext' }, '▼');
  box = h('div', { id: 'talkbox', onclick: () => step() }, who ? h('div', { class: 'tbwho' }, who) : null, text, next);
  document.getElementById('view').append(box);
  const fill = (s) => s.replace(/\{name\}/g, 'Ash').replace(/\{b\}/g, 'Mae');
  const step = () => {
    if (i >= lines.length) { box.remove(); box = null; removeEventListener('keydown', key, true); return; }
    // the game types each box out
    const s = fill(String(lines[i++])); let k = 0;
    const t = setInterval(() => { text.textContent = s.slice(0, ++k); if (k >= s.length) clearInterval(t); }, 18);
  };
  const key = (e) => { if (['Enter', 'Space', 'KeyE'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); step(); } if (e.code === 'Escape') { i = lines.length; step(); } };
  addEventListener('keydown', key, true);
  step();
}

// ---------- the panels ----------
const opens = {};
function editor(file, title, pick, extra) {
  return async () => {
    const data = await L.life(file);
    const d = openDrawer(title);
    const open = (opens[file + title] ||= new Set());
    const draw = () => {
      if (!d.body.isConnected) return;
      const cur = S.life[file + '.json'].data, node = pick(cur);
      if (node === undefined) { d.body.replaceChildren(h('div', { class: 'note' }, 'Gone.')); return; }
      const onChange = (path, v) => L.lifeChange(file, `${file}: ${title}`, (dd) => { const n = pick(dd); setAt(n, path, v); if (!path.length) replace(dd, v); });
      const replace = (dd, v) => { const n = pick(dd); for (const k of Object.keys(n)) delete n[k]; Object.assign(n, v); };
      d.body.replaceChildren(...(extra ? [extra(cur)] : []), treeEdit(node, onChange, { open, play: (ls) => play(ls, title) }), problems(file, title));
    };
    curDraw = draw;
    draw();
    void data;
  };
}
let curDraw = null;
on('life', () => { if (curDraw && document.getElementById('drawer') && !document.getElementById('drawer').hidden) curDraw(); });
function problems(file, key) {
  const el = h('div', { class: 'note', style: 'margin-top:10px' });
  L.lifeCheck().then((r) => {
    const mine = [...r.errors.map((e) => ['err', e]), ...r.warnings.map((w) => ['warnc', w])].filter(([, t]) => t.startsWith(file + '.json') && t.includes(key.split(' ')[0]));
    el.replaceChildren(...(mine.length ? mine.map(([c, t]) => h('div', { class: c }, '• ' + t)) : [h('div', { class: 'okc' }, 'No problems found')]));
  });
  return el;
}

export async function dialogueList(body) {
  const dl = await L.life('dialogue');
  body.replaceChildren(h('div', { class: 'note' }, 'What the townspeople say (native/life/dialogue.json, read by quests.gd). Pick someone; ▶ plays a line as the game shows it.'),
    h('div', { class: 'sect' }, h('h3', {}, 'People'), h('ul', { class: 'tree' }, Object.keys(dl.people || {}).map((id) => h('li', { onclick: editor('dialogue', id, (d) => d.people[id]) }, h('span', { class: 'lab' }, dl.people[id].name || id), h('span', { class: 'meta' }, id))))),
    h('div', { class: 'btns' }, h('button', { onclick: () => {
      const id = prompt('Their id (as in people.json):'); if (!id) return;
      L.lifeChange('dialogue', 'new voice', (d) => { d.people[id] ||= { name: id, short: id, greet: { any: ['Hello!'] }, ash: ['Hi, Ash!'] }; });
      editor('dialogue', id, (d) => d.people[id])();
    } }, '+ voice'),
    h('button', { onclick: editor('dialogue', 'pairs', (d) => d.pairs) }, 'Pair talks'), h('button', { onclick: editor('dialogue', 'relations', (d) => d.relations) }, 'Relations'), h('button', { onclick: editor('dialogue', 'fallback', (d) => d.fallback) }, 'Fallback lines')));
}
export async function questList(body) {
  const q = await L.life('quests');
  body.replaceChildren(h('div', { class: 'note' }, 'Quests and items (native/life/quests.json, quests.gd). A quest: giver, unlock, offer, steps (who, when, say, give / take, set), reward.'),
    h('ul', { class: 'tree' }, (q.quests || []).map((x, i) => h('li', { class: x.disabled ? 'hidden' : '', onclick: editor('quests', x.id, (d) => d.quests.find((y) => y.id === x.id), flow) },
      h('span', { class: 'lab' }, x.title || x.id), h('span', { class: 'meta' }, `${x.id} · ${x.giver} · ${(x.steps || []).length} steps`)))),
    h('div', { class: 'btns' }, h('button', { onclick: () => {
      const id = prompt('Quest id (like q_lost_hat):'); if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) return;
      if (q.quests.some((x) => x.id === id)) return toast('There is already ' + id);
      L.lifeChange('quests', 'new quest', (d) => d.quests.push({ id, title: 'New quest', giver: 'delia', summary: '', unlock: { day_min: 1 }, offer: ['Ash, could you help me?'], remind: ['Any luck, Ash?'],
        steps: [{ hint: 'Talk to someone.', who: 'mae', say: ['Oh, hello!'] }], reward: { say: ['Thank you, Ash!'], flag: id + '_done' } }));
      editor('quests', id, (d) => d.quests.find((y) => y.id === id), flow)();
    } }, '+ quest'), h('button', { onclick: editor('quests', 'items', (d) => d.items) }, 'Items')));
}
// a quest's steps as a chain of cards (who, where, what they get or give)
function flow(cur) {
  void cur;
  const el = h('div', { class: 'flow' });
  const q = (S.life['quests.json'].data.quests || []).find((x) => document.querySelector('#drawer .dhead b')?.textContent === x.id);
  if (!q) return el;
  const card = (t, sub, cls = '') => h('div', { class: 'fcard ' + cls }, h('b', {}, t), h('div', { class: 'note' }, sub));
  el.append(card('Offer', `${q.giver} · ${(q.offer || []).length} lines`, 'giver'));
  (q.steps || []).forEach((s, i) => { el.append(h('span', { class: 'farrow' }, '→')); el.append(card(`Step ${i + 1}`, `${[].concat(s.who || 'giver').join(s.mode === 'all' ? ' + ' : ' / ')}${s.give ? ' · gives ' + s.give : ''}${s.take ? ' · takes ' + s.take : ''}${s.set ? ' · sets ' + s.set : ''}`)); });
  el.append(h('span', { class: 'farrow' }, '→'), card('Reward', [q.reward?.item && 'item ' + q.reward.item, q.reward?.flag && 'flag ' + q.reward.flag].filter(Boolean).join(' · ') || 'thanks', 'giver'),
    h('button', { onclick: () => play([...(q.offer || []), ...(q.steps || []).flatMap((s) => (Array.isArray(s.say) ? s.say : Object.values(s.say || {})[0] || [])), ...(q.reward?.say || [])], q.title) }, '▶ Play it through'));
  return el;
}
export async function loreList(body) {
  const lo = await L.life('lore');
  body.replaceChildren(h('div', { class: 'note' }, 'Rumours (lore.json): who tells them, what they need first.'),
    h('ul', { class: 'tree' }, (lo.rumors || []).map((r) => h('li', { onclick: editor('lore', r.id, (d) => d.rumors.find((y) => y.id === r.id)) }, h('span', { class: 'lab' }, r.title || r.id), h('span', { class: 'meta' }, r.id)))),
    h('div', { class: 'btns' }, h('button', { onclick: editor('lore', 'chatter', (d) => d.chatter) }, 'Rumour chatter')));
}
export async function companionList(body) {
  const c = await L.life('companions');
  body.replaceChildren(h('div', { class: 'note' }, 'The townspeople\'s Pokémon (companions.json, companions.gd): owner, speeds, where they sleep, what they say.'),
    h('ul', { class: 'tree' }, (c.companions || []).map((x) => h('li', { onclick: editor('companions', x.id, (d) => d.companions.find((y) => y.id === x.id)) }, h('span', { class: 'lab' }, x.name || x.id), h('span', { class: 'meta' }, `${x.species} · ${x.owner}`)))));
}
