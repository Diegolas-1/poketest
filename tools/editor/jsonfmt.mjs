// Writes changed JSON back in the file's own hand-made layout: every part
// that did not change keeps its original text, changed objects and lists keep
// their separators and indentation, and only new parts are laid out fresh.
// So an edit made in the editor is a small diff in git, next to the other
// workers' changes to the same file.
//   reformat(originalText, newValue) -> text

// a JSON parser that remembers where each value is in the text
function parse(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const val = () => {
    ws();
    const s = i, c = text[i];
    if (c === '{') {
      i++; const members = [];
      ws();
      if (text[i] === '}') { i++; return { t: 'o', s, e: i, members }; }
      for (;;) {
        ws(); const ks = i; const key = JSON.parse(str()); const ke = i;
        ws(); i++; // :
        const v = val();
        members.push({ key, ks, ke, v });
        ws();
        if (text[i] === ',') { i++; continue; }
        i++; return { t: 'o', s, e: i, members };
      }
    }
    if (c === '[') {
      i++; const items = [];
      ws();
      if (text[i] === ']') { i++; return { t: 'a', s, e: i, items }; }
      for (;;) {
        items.push(val()); ws();
        if (text[i] === ',') { i++; continue; }
        i++; return { t: 'a', s, e: i, items };
      }
    }
    if (c === '"') { str(); return { t: 'v', s, e: i }; }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    return { t: 'v', s, e: i };
  };
  const str = () => { const s = i; i++; while (text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; return text.slice(s, i); };
  return val();
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function reformat(text, value) {
  let root;
  try { root = parse(text); } catch { return JSON.stringify(value, null, 1) + '\n'; }
  const orig = JSON.parse(text);
  const unit = (/\n( +)"/.exec(text) || [, ' '])[1].length;
  const out = emit(text, root, orig, value, '', unit);
  return out + (text.endsWith('\n') ? '\n' : '');
}
// the indentation of the line a position is on
const indentAt = (text, pos) => { const ls = text.lastIndexOf('\n', pos - 1) + 1; return /^ */.exec(text.slice(ls))[0]; };
function fresh(value, indent, unit, oneLine) {
  if (oneLine || typeof value !== 'object' || value === null) return JSON.stringify(value);
  const s = JSON.stringify(value, null, unit);
  return s.length < 100 ? JSON.stringify(value).replace(/,"/g, ', "').replace(/":/g, '": ') : s.replace(/\n/g, '\n' + indent);
}
function emit(text, node, orig, value, indent, unit) {
  if (eq(orig, value)) return text.slice(node.s, node.e);
  const myIndent = indentAt(text, node.s);
  if (node.t === 'o' && isObj(value) && isObj(orig)) {
    const m = node.members;
    if (!m.length) return fresh(value, myIndent, unit, false);
    const open = text.slice(node.s + 1, m[0].ks), close = text.slice(m[m.length - 1].v.e, node.e - 1);
    const sep = m.length > 1 ? text.slice(m[0].v.e, m[1].ks) : (open.includes('\n') ? ',' + open : ', ');
    const colon = text.slice(m[0].ke, m[0].v.s);
    const oneLine = !open.includes('\n');
    const byKey = new Map(m.map((x, j) => [x.key, j]));
    // each original member keeps the separator that followed it
    const after = m.map((x, j) => (j + 1 < m.length ? text.slice(x.v.e, m[j + 1].ks) : sep));
    let o = '{' + open, prev = -1;
    Object.keys(value).forEach((k, n) => {
      const j = byKey.get(k);
      if (n) o += prev >= 0 ? after[prev] : sep;
      if (j !== undefined) { const x = m[j]; o += text.slice(x.ks, x.ke) + text.slice(x.ke, x.v.s) + emit(text, x.v, orig[k], value[k], indent, unit); }
      else o += JSON.stringify(k) + colon + fresh(value[k], oneLine ? myIndent : (/\n( *)$/.exec(open) || [, myIndent + ' '.repeat(unit)])[1], unit, oneLine);
      prev = j === undefined ? -1 : j;
    });
    return o + close + '}';
  }
  if (node.t === 'a' && Array.isArray(value) && Array.isArray(orig)) {
    const it = node.items;
    if (!it.length) return fresh(value, myIndent, unit, false);
    const open = text.slice(node.s + 1, it[0].s), close = text.slice(it[it.length - 1].e, node.e - 1);
    const sep = it.length > 1 ? text.slice(it[0].e, it[1].s) : (open.includes('\n') ? ',' + open : ', ');
    const oneLine = !open.includes('\n');
    const inner = oneLine ? myIndent : (/\n( *)$/.exec(open) || [, myIndent + ' '.repeat(unit)])[1];
    // items matched by position (and by id for lists of records)
    const ids = orig.every((x) => isObj(x) && x.id !== undefined) && value.every((x) => isObj(x) && x.id !== undefined);
    const after = it.map((x, j) => (j + 1 < it.length ? text.slice(x.e, it[j + 1].s) : sep));
    let o = '[' + open, prev = -1;
    value.forEach((v, k) => {
      const j = ids ? orig.findIndex((x) => x.id === v.id) : k < orig.length ? k : -1;
      if (k) o += prev >= 0 ? after[prev] : sep;
      o += j >= 0 && j < it.length ? emit(text, it[j], orig[j], v, inner, unit) : fresh(v, inner, unit, oneLine);
      prev = j;
    });
    return o + close + ']';
  }
  return fresh(value, myIndent, unit, false);
}
