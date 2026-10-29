// Small DOM helpers for the creator: an element maker, the icons (stroked tab
// icons, and garment / hair glyphs filled in an item's own colours, so the
// catalogue reads at a glance without rendering every item), and the controls
// every panel is made of: sliders (filled from their default, which a tick
// marks; double-click resets), swatch rows with a custom colour, chip rows,
// switches, collapsible sections and toasts.
export function h(tag, props = {}, ...kids) {
  const el = tag === 'svg' || props.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false || k === 'svg') continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && !(el instanceof SVGElement) && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const svg = (inner, cls = 'ico', vb = '0 0 24 24') => { const s = h('span', { class: cls }); s.innerHTML = `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`; return s; };

// ---------- tab and button icons (stroked) ----------
const I = {
  presets: '<path d="M12 3.2l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.2 6.9 19l1.1-5.8-4.3-4 5.8-.7z"/>',
  body: '<circle cx="12" cy="4.6" r="2.3"/><path d="M12 7.8v7.4M6.2 10.4l5.8-1.3 5.8 1.3M8.8 21l3.2-5.8 3.2 5.8"/>',
  face: '<circle cx="12" cy="12" r="8.6"/><circle cx="9" cy="10.4" r=".9" fill="currentColor"/><circle cx="15" cy="10.4" r=".9" fill="currentColor"/><path d="M8.6 14.4c1.9 2.1 4.9 2.1 6.8 0"/>',
  skin: '<path d="M12 3.2c3.6 4.6 6 7.6 6 10.6a6 6 0 0 1-12 0c0-3 2.4-6 6-10.6z"/><path d="M9.3 14.4a2.8 2.8 0 0 0 2.4 2.6"/>',
  hair: '<path d="M4.6 15.5c-.6-6.4 3-10.7 7.4-10.7s8 4.3 7.4 10.7"/><path d="M4.6 15.5c2-1 3.6-3.4 4.2-6.2 1.4 2.6 4.4 4.1 7.4 3.8 1.3-.1 2.6 1.3 3.2 2.4"/><path d="M7 18.5c.6.9 1.4 1.6 2.4 2M17 18.5c-.6.9-1.4 1.6-2.4 2"/>',
  outfit: '<path d="M8.4 3.8L3.6 6.6l1.9 4 2.4-.9v10.5h8.2V9.7l2.4.9 1.9-4-4.8-2.8c-.8 1.4-2.1 2.2-3.6 2.2s-2.8-.8-3.6-2.2z"/>',
  underwear: '<path d="M4.5 6.5h15l.9 11.8h-6.2L12 12.6l-2.2 5.7H3.6z"/><path d="M4.5 9h15"/>',
  look: '<rect x="3" y="4.5" width="18" height="15" rx="2.6"/><circle cx="8.6" cy="10.4" r="2.1"/><path d="M5.4 16.5c.9-2 5.5-2 6.4 0M14 9.5h4M14 13h4"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.3" cy="8.3" r="1.3" fill="currentColor"/><circle cx="15.7" cy="15.7" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.7" cy="8.3" r="1.3" fill="currentColor"/><circle cx="8.3" cy="15.7" r="1.3" fill="currentColor"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  save: '<path d="M5 3.8h11l3.2 3.2V19a1.2 1.2 0 0 1-1.2 1.2H5A1.2 1.2 0 0 1 3.8 19V5A1.2 1.2 0 0 1 5 3.8z"/><path d="M7.5 3.8v4.6h7V3.8M7.5 20.2v-6h9v6"/>',
  load: '<path d="M3.8 7.2V18a1.6 1.6 0 0 0 1.6 1.6h13.2a1.6 1.6 0 0 0 1.6-1.6V9.4a1.6 1.6 0 0 0-1.6-1.6h-6.8L9.6 5H5.4a1.6 1.6 0 0 0-1.6 1.6z"/><path d="M12 16.6v-6M9.4 13l2.6-2.6 2.6 2.6"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
  upload: '<path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M4.5 19.5h15"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  camera: '<path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.2a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.4"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/>',
  turn: '<path d="M20 12a8 4 0 1 1-4.2-3.5"/><path d="M13.5 6.2l2.6 2.4-2.6 2.4"/><path d="M12 4v4"/>',
  eye: '<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.6"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.6h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  frame: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  chevron: '<path d="M8 10l4 4 4-4"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  warn: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.2M12 17v.2"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.8v.2"/>',
  palette: '<path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.3 1.5-2.3h2.2a3.3 3.3 0 0 0 3.3-3.3c0-5-3.8-9.3-8.4-9.3z"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/><circle cx="11" cy="7.6" r="1.2" fill="currentColor"/><circle cx="15.4" cy="8.6" r="1.2" fill="currentColor"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
};
export const icon = (name, cls) => svg(I[name] || I.info, cls ? 'ico ' + cls : 'ico');

// ---------- garment glyphs, filled in the item's colours ----------
const G = {
  top: (m, s) => `<path d="M17 6l-11 6 4.5 8.5 4.5-2.2V42h18V18.3l4.5 2.2L42 12 31 6c-1.5 3-4 4.5-7 4.5S18.5 9 17 6z" fill="${m}"/><path d="M17.5 6.3c1.5 2.8 3.9 4.2 6.5 4.2s5-1.4 6.5-4.2" fill="none" stroke="${s}" stroke-width="2.6"/>`,
  outer: (m, s, a) => `<path d="M16 6L5 12l2 26h6l2-14v18h18V24l2 14h6l2-26-11-6-8 6z" fill="${m}"/><path d="M24 12v30" stroke="${a}" stroke-width="2.4"/><path d="M16 6l8 6 8-6" fill="none" stroke="${s}" stroke-width="2.6"/>`,
  dress: (m, s) => `<path d="M18 4h12l-1.5 11L38 42H10l9.5-27z" fill="${m}"/><path d="M19.5 15h9" stroke="${s}" stroke-width="3"/><path d="M11.5 38h25" stroke="${s}" stroke-width="2.4"/>`,
  onepiece: (m, s) => `<path d="M15 4h5v8h8V4h5v14l3 24h-9l-3-15-3 15h-9l3-24z" fill="${m}"/><path d="M15 18h18" stroke="${s}" stroke-width="2.6"/>`,
  bottom: (m, s) => `<path d="M13 5h22l3 37h-9.5L24 20l-4.5 22H10z" fill="${m}"/><path d="M13 9.5h22" stroke="${s}" stroke-width="2.4"/>`,
  legwear: (m, s) => `<path d="M17 3h12v25l7 5.5c3.4 2.6 2 8.5-2.6 8.5H19c-2.5 0-4-1.6-4-4V3z" fill="${m}"/><path d="M17 8h12" stroke="${s}" stroke-width="3"/>`,
  shoes: (m, s, a, t) => `<path d="M4 31c0-7 1.6-14 6-14 3.6 0 5.5 3.5 10 4.6l10 2.2C38 25.6 44 28 44 33.5V36H4z" fill="${m}"/><path d="M3.5 36h41v3.4a2 2 0 0 1-2 2h-37a2 2 0 0 1-2-2z" fill="${t || s}"/><path d="M19 22.5l3 4M23.5 23.5l3 4" stroke="${s}" stroke-width="2"/>`,
  hat: (m, s) => `<path d="M8.5 29a15.5 14 0 0 1 31 0z" fill="${m}"/><path d="M22 29h22c0 3.4-4 5.5-10 5.5H22z" fill="${s}"/><circle cx="24" cy="15.2" r="1.8" fill="${s}"/>`,
  eyewear: (m) => `<circle cx="14" cy="25" r="8" fill="#cfe6f2" stroke="${m}" stroke-width="3.2"/><circle cx="34" cy="25" r="8" fill="#cfe6f2" stroke="${m}" stroke-width="3.2"/><path d="M22 24c1.3-1.6 2.7-1.6 4 0M6 23L3 20M42 23l3-3" fill="none" stroke="${m}" stroke-width="3"/>`,
  neckwear: (m, s) => `<path d="M19 6h10l-2 6 5 24-8 7-8-7 5-24z" fill="${m}"/><path d="M19 6h10l-2 6h-6z" fill="${s}"/>`,
  bag: (m, s) => `<path d="M15 17c0-7 18-7 18 0" fill="none" stroke="${s}" stroke-width="3.2"/><rect x="8" y="17" width="32" height="24" rx="5" fill="${m}"/><path d="M8 25h32" stroke="${s}" stroke-width="2.4"/><rect x="21" y="23" width="6" height="5" rx="1.2" fill="${s}"/>`,
  belt: (m, s) => `<rect x="3" y="19" width="42" height="10" rx="2.6" fill="${m}"/><rect x="18" y="16" width="12" height="16" rx="2.6" fill="none" stroke="${s}" stroke-width="3"/>`,
  gloves: (m, s) => `<path d="M14 42V24l-4-8c-1.4-2.8 2-4.6 3.6-2.2L17 19V8c0-3 4-3 4 0v9-11c0-3 4-3 4 0v11-9c0-3 4-3 4 0v10-6c0-3 4-3 4 0v17l-2 11z" fill="${m}"/><path d="M14 37h17" stroke="${s}" stroke-width="3"/>`,
  apron: (m, s) => `<path d="M17 5h14v9l6 3-1 25H12l-1-25 6-3z" fill="${m}"/><rect x="18" y="26" width="12" height="8" rx="1.5" fill="${s}"/><path d="M11 17L5 15M37 17l6-2" stroke="${s}" stroke-width="2"/>`,
  wrist: (m, s) => `<ellipse cx="24" cy="24" rx="15" ry="9" fill="none" stroke="${m}" stroke-width="6"/><rect x="19" y="28" width="10" height="8" rx="2.4" fill="${s}"/>`,
  jewellery: (m, s) => `<path d="M9 9c0 14 8 20 15 20s15-6 15-20" fill="none" stroke="${m}" stroke-width="2.6"/><circle cx="24" cy="33" r="6" fill="${s}" stroke="${m}" stroke-width="2.4"/>`,
  pin: (m, s, a) => `<circle cx="24" cy="24" r="15" fill="${m}"/><circle cx="24" cy="24" r="10" fill="${s}"/><path d="M24 17l2 4.6 5 .5-3.8 3.3 1.1 4.9L24 27.8l-4.3 2.5 1.1-4.9-3.8-3.3 5-.5z" fill="${a}"/>`,
  hair_acc: (m, s) => `<path d="M24 24L9 14c-3-2-6 0-6 4v12c0 4 3 6 6 4z" fill="${m}"/><path d="M24 24l15-10c3-2 6 0 6 4v12c0 4-3 6-6 4z" fill="${m}"/><circle cx="24" cy="24" r="5" fill="${s}"/>`,
};
export function slotGlyph(slot, c = {}) {
  const f = G[slot] || G.top;
  const m = c.main || '#999', s = c.second || '#eee', a = c.accent || s, t = c.trim || s;
  return svg(f(m, s, a, t), 'glyph', '0 0 48 48');
}
// a hair glyph from the style's name (short, spiky, bob, long, bun, pony, twin, curly, buzz)
export function hairGlyph(style, color = '#4a3226', skin = '#f9dcb4') {
  const n = `${style.id} ${style.name} ${(style.tags || []).join(' ')}`.toLowerCase();
  const head = `<ellipse cx="24" cy="26" rx="11" ry="12" fill="${skin}"/>`;
  let hair;
  if (/bald|none/.test(n)) hair = '';
  else if (/buzz|crew|shaved/.test(n)) hair = `<path d="M13 23c0-8 5-12 11-12s11 4 11 12c-3-3-7-4-11-4s-8 1-11 4z" fill="${color}"/>`;
  else if (/spik|messy|wild/.test(n)) hair = `<path d="M11 26l-3-6 5 1-2-8 6 4 1-9 5 6 4-7 2 8 6-4-1 8 6-1-4 7 3 3-7-3-11-2-6 3z" fill="${color}"/>`;
  else if (/twin|pig/.test(n)) hair = `<path d="M12 26c0-10 5-15 12-15s12 5 12 15c-3-4-7-6-12-6s-9 2-12 6z" fill="${color}"/><path d="M11 22c-6 4-6 14-3 20 2-5 4-10 5-16zM37 22c6 4 6 14 3 20-2-5-4-10-5-16z" fill="${color}"/>`;
  else if (/bun|updo|top.?knot/.test(n)) hair = `<circle cx="24" cy="9" r="6" fill="${color}"/><path d="M12 26c0-10 5-15 12-15s12 5 12 15c-3-4-7-6-12-6s-9 2-12 6z" fill="${color}"/>`;
  else if (/pony|tail/.test(n)) hair = `<path d="M12 26c0-10 5-15 12-15s12 5 12 15c-3-4-7-6-12-6s-9 2-12 6z" fill="${color}"/><path d="M34 16c8 2 9 12 6 22-2-6-4-10-8-14z" fill="${color}"/>`;
  else if (/long|wav|straight|flow/.test(n)) hair = `<path d="M11 44c-2-10-2-18 0-24 2-7 7-10 13-10s11 3 13 10c2 6 2 14 0 24h-5c1-8 0-15-2-20-2 1-4 1-6 1s-6-1-8-3c-2 6-3 14-2 22z" fill="${color}"/>`;
  else if (/bob|curly|afro|fluff/.test(n)) hair = `<path d="M10 34c-3-12 2-24 14-24s17 12 14 24h-4c0-6-1-10-3-12-3 1-5 1-7 1s-5-1-8-3c-2 3-3 8-3 14z" fill="${color}"/>`;
  else hair = `<path d="M12 27c-1-10 4-16 12-16s13 6 12 16c-2-4-4-6-6-6l-4 3-2-3-5 4-2-4c-2 1-4 3-5 6z" fill="${color}"/>`;
  return svg(head + hair, 'glyph', '0 0 48 48');
}

// ---------- controls ----------
// a slider: { label, min, max, step, value, def, fmt, onInput(v), onChange(v), hint }
export function slider(o) {
  const fmt = o.fmt || ((v) => (o.min < 0 ? (v > 0 ? '+' : '') : '') + (+v).toFixed(2).replace(/\.?0+$/, '').replace(/^-?0$/, '0'));
  const step = o.step || (o.max - o.min > 10 ? 1 : 0.01);
  const val = h('span', { class: 'val' }, fmt(o.value));
  const inp = h('input', { type: 'range', min: o.min, max: o.max, step, value: o.value, 'aria-label': o.label });
  const def = o.def ?? 0;
  const paint = () => {
    const a = (Math.min(+inp.value, def) - o.min) / (o.max - o.min) * 100, b = (Math.max(+inp.value, def) - o.min) / (o.max - o.min) * 100;
    wrap.style.setProperty('--a', a + '%'); wrap.style.setProperty('--b', b + '%');
    wrap.style.setProperty('--d', ((def - o.min) / (o.max - o.min) * 100) + '%');
    wrap.classList.toggle('changed', Math.abs(+inp.value - def) > 1e-6);
  };
  inp.addEventListener('input', () => { val.textContent = fmt(+inp.value); paint(); o.onInput && o.onInput(+inp.value); });
  inp.addEventListener('change', () => o.onChange && o.onChange(+inp.value));
  const reset = () => { inp.value = def; val.textContent = fmt(def); paint(); o.onInput && o.onInput(def); o.onChange && o.onChange(def); };
  inp.addEventListener('dblclick', reset);
  const wrap = h('div', { class: 'slider', title: o.hint || 'Double-click to reset' },
    h('div', { class: 'slider-top' }, h('label', {}, o.label), val),
    h('div', { class: 'slider-track' }, inp, h('span', { class: 'tick' })));
  wrap.set = (v) => { inp.value = v; val.textContent = fmt(+v); paint(); };
  wrap.input = inp;
  paint();
  return wrap;
}
// swatches: { items: [{ color, name }], value (hex), onPick(hex, item), custom: true, onCustomInput(hex) }
export function swatchRow(o) {
  const row = h('div', { class: 'swatches' + (o.big ? ' big' : '') });
  const norm = (c) => String(c || '').toLowerCase();
  for (const it of o.items) {
    const b = h('button', { class: 'sw' + (norm(it.color) === norm(o.value) ? ' on' : ''), title: it.name, style: { '--c': it.color }, 'aria-label': it.name,
      onclick: () => { row.querySelectorAll('.sw.on').forEach((x) => x.classList.remove('on')); b.classList.add('on'); o.onPick(it.color, it); } });
    row.append(b);
  }
  if (o.custom !== false) {
    const known = o.items.some((it) => norm(it.color) === norm(o.value));
    const inp = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(o.value || '') ? o.value : '#888888', 'aria-label': 'Custom colour' });
    const lab = h('label', { class: 'sw custom' + (!known && o.value ? ' on' : ''), title: 'Custom colour', style: { '--c': known || !o.value ? 'transparent' : o.value } }, inp, icon('plus'));
    inp.addEventListener('input', () => { lab.style.setProperty('--c', inp.value); row.querySelectorAll('.sw.on').forEach((x) => x.classList.remove('on')); lab.classList.add('on'); (o.onCustomInput || o.onPick)(inp.value, null, true); });
    inp.addEventListener('change', () => o.onCustomChange && o.onCustomChange(inp.value));
    row.append(lab);
  }
  return row;
}
// chips: { items: [{ id, name, badge? }], value, onPick(id), small }
export function chips(o) {
  const row = h('div', { class: 'chips' + (o.small ? ' small' : '') + (o.wrap === false ? ' nowrap' : '') });
  for (const it of o.items) {
    const b = h('button', { class: 'chip' + (it.id === o.value || (Array.isArray(o.value) && o.value.includes(it.id)) ? ' on' : ''), title: it.title || it.name,
      onclick: () => { if (!o.multi) row.querySelectorAll('.chip.on').forEach((x) => x.classList.remove('on')); b.classList.toggle('on', o.multi ? !b.classList.contains('on') : true); o.onPick(it.id, b.classList.contains('on')); } },
    it.dot ? h('span', { class: 'dot', style: { background: it.dot } }) : null, it.name, it.badge ? h('span', { class: 'badge' }, it.badge) : null);
    row.append(b);
  }
  return row;
}
export function toggle(o) {
  const inp = h('input', { type: 'checkbox', checked: !!o.value });
  inp.addEventListener('change', () => o.onChange(inp.checked));
  return h('label', { class: 'switch', title: o.title || '' }, inp, h('span', { class: 'knob' }), h('span', { class: 'switch-label' }, o.label));
}
export function select(o) {
  const s = h('select', { 'aria-label': o.label }, o.items.map((it) => h('option', { value: it.id, selected: String(it.id) === String(o.value) }, it.name)));
  s.addEventListener('change', () => o.onChange(s.value));
  return h('label', { class: 'field' }, h('span', {}, o.label), s);
}
// a card section: title, optional actions (buttons), body; collapsible when o.fold
export function section(title, body, o = {}) {
  const head = h('div', { class: 'sec-head' }, h('h3', {}, title, o.badge ? h('span', { class: 'badge ' + (o.badgeClass || '') }, o.badge) : null), h('div', { class: 'sec-actions' }, o.actions || []));
  const sec = h('section', { class: 'sec' + (o.fold ? ' fold' : '') + (o.closed ? ' closed' : '') }, head, h('div', { class: 'sec-body' }, body));
  if (o.fold) head.addEventListener('click', (e) => { if (e.target.closest('.sec-actions')) return; sec.classList.toggle('closed'); o.onFold && o.onFold(!sec.classList.contains('closed')); });
  if (o.onFocus) sec.addEventListener('focusin', o.onFocus);
  return sec;
}
export function iconButton(name, title, onclick, cls = '') { return h('button', { class: 'ibtn ' + cls, title, 'aria-label': title, onclick }, icon(name)); }

let toastTimer = 0;
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.className = 'show ' + kind; t.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2400);
}
export function download(name, data, type) {
  const url = data instanceof Blob ? URL.createObjectURL(data) : typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  if (!url.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(url), 4000);
}
