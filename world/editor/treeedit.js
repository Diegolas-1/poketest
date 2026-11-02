// A JSON editor shaped for game writing: objects are folding sections, lists
// of lines are boxes of dialogue (one box per entry; an entry with several
// lines shows them together, one per line of the box), numbers and switches
// are fields. Every change goes through onChange(path, value) (one undo step).
// Used for dialogue, quests, lore and companions (editor/talk.js).
import { h } from './ui.js';

const isLines = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' || (Array.isArray(x) && x.every((y) => typeof y === 'string')));
const isSpeech = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string');
export function treeEdit(value, onChange, { open = new Set(), path = [], play = null, depth = 0, hint = null } = {}) {
  const set = (p, v) => onChange(p, v);
  const label = (k) => h('span', { class: 'tk' }, String(k));
  if (typeof value === 'string') {
    return h('textarea', { rows: Math.min(6, Math.max(1, Math.ceil(value.length / 70))), onchange: (e) => set(path, e.target.value) }, value);
  }
  if (typeof value === 'number') return h('input', { type: 'number', step: 'any', value, onchange: (e) => set(path, +e.target.value) });
  if (typeof value === 'boolean') return h('input', { type: 'checkbox', checked: value, onchange: (e) => set(path, e.target.checked) });
  if (value === null) return h('span', { class: 'note' }, 'null');
  if (isSpeech(value)) {
    // [[speaker, line], ...]: an exchange
    return h('div', { class: 'tlines' }, value.map(([who, line], i) => h('div', { class: 'row' },
      h('input', { type: 'text', value: who, style: 'width:70px;flex:none', onchange: (e) => { const v = clone(value); v[i][0] = e.target.value; set(path, v); } }),
      h('input', { type: 'text', value: line, onchange: (e) => { const v = clone(value); v[i][1] = e.target.value; set(path, v); } }),
      h('button', { onclick: () => { const v = clone(value); v.splice(i, 1); set(path, v); } }, '✕'))),
    h('div', { class: 'btns' }, h('button', { onclick: () => set(path, [...clone(value), [value[value.length - 1]?.[0] || 'A', '']]) }, '+ line'), play ? h('button', { onclick: () => play(value.map(([w, l]) => w + ': ' + l)) }, '▶') : null));
  }
  if (isLines(value) || (Array.isArray(value) && !value.length)) {
    // boxes of dialogue
    return h('div', { class: 'tlines' }, value.map((entry, i) => {
      const text = Array.isArray(entry) ? entry.join('\n') : entry;
      return h('div', { class: 'tline' },
        h('textarea', { rows: Math.max(1, text.split('\n').length), title: 'One line per text box shown together', onchange: (e) => {
          const v = clone(value), lines = e.target.value.split('\n').filter((s) => s.trim() !== '');
          v[i] = lines.length > 1 ? lines : lines[0] || ''; set(path, v);
        } }, text),
        h('div', { class: 'tbtn' }, play ? h('button', { title: 'Play it', onclick: () => play(Array.isArray(entry) ? entry : [entry]) }, '▶') : null,
          h('button', { title: 'Up', onclick: () => { if (!i) return; const v = clone(value); [v[i - 1], v[i]] = [v[i], v[i - 1]]; set(path, v); } }, '↑'),
          h('button', { title: 'Remove', onclick: () => { const v = clone(value); v.splice(i, 1); set(path, v); } }, '✕')));
    }), h('button', { onclick: () => set(path, [...clone(value), '']) }, '+ line'));
  }
  if (Array.isArray(value)) {
    return h('div', { class: 'tarr' }, value.map((x, i) => h('div', { class: 'titem' }, h('div', { class: 'thead' }, label('#' + (i + 1) + (x && x.id ? ' ' + x.id : x && x.hint ? ' ' + String(x.hint).slice(0, 40) : '')),
      h('button', { onclick: () => { const v = clone(value); v.splice(i, 1); set(path, v); } }, 'remove'),
      i ? h('button', { onclick: () => { const v = clone(value); [v[i - 1], v[i]] = [v[i], v[i - 1]]; set(path, v); } }, '↑') : null),
      treeEdit(x, onChange, { open, path: [...path, i], play, depth: depth + 1 }))),
    h('button', { onclick: () => set(path, [...clone(value), value.length ? blank(value[value.length - 1]) : ''] ) }, '+ add'));
  }
  // an object: folding sections
  const keys = Object.keys(value).filter((k) => k !== '_doc');
  const box = h('div', { class: 'tobj' });
  if (value._doc) box.append(h('div', { class: 'note' }, value._doc));
  for (const k of keys) {
    const p = [...path, k], key = p.join('/'), v = value[k];
    const simple = typeof v !== 'object' || v === null;
    if (simple) { box.append(h('div', { class: 'row' }, h('label', { title: key }, k), treeEdit(v, onChange, { open, path: p, play, depth: depth + 1 }), h('button', { title: 'Remove ' + k, onclick: () => { const o = clone(value); delete o[k]; set(path, o); } }, '✕'))); continue; }
    const isOpen = open.has(key);
    const head = h('div', { class: 'thead', onclick: () => { if (open.has(key)) open.delete(key); else open.add(key); redraw(); } },
      (isOpen ? '▾ ' : '▸ '), label(k), h('span', { class: 'meta' }, summary(v)));
    const body = h('div', { class: 'tbody' });
    const redraw = () => { head.firstChild.textContent = open.has(key) ? '▾ ' : '▸ '; body.replaceChildren(open.has(key) ? treeEdit(v, onChange, { open, path: p, play, depth: depth + 1 }) : ''); };
    redraw();
    box.append(h('div', { class: 'tsec' }, head, body));
  }
  box.append(h('div', { class: 'btns' }, h('button', { onclick: () => {
    const k = prompt('New key' + (hint ? ' (' + hint + ')' : '') + ':'); if (!k || k in value) return;
    const kind = prompt('Kind: lines, text, number, section', 'lines'); const o = clone(value);
    o[k] = kind === 'text' ? '' : kind === 'number' ? 0 : kind === 'section' ? {} : [''];
    open.add([...path, k].join('/')); set(path, o);
  } }, '+ key')));
  return box;
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const blank = (x) => (typeof x === 'string' ? '' : typeof x === 'number' ? 0 : Array.isArray(x) ? [] : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).map((k) => [k, blank(x[k])])) : x);
const summary = (v) => (Array.isArray(v) ? `${v.length}` : `${Object.keys(v).filter((k) => k !== '_doc').length} keys`);
export function setAt(root, path, v) {
  if (!path.length) return v;
  let o = root;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path[path.length - 1]] = v;
  return root;
}
