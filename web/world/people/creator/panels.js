// The creator's left-hand tabs, each a function (app) -> element made fresh
// from the current look: Presets, Body, Face, Skin, Hair, Outfit, Underwear.
// Panels change the look only through app.edit(fn, { build, paint, commit }):
// build (default) rebuilds the person after a short pause, paint applies a
// colour-only change to the materials at once (no rebuild), commit adds an
// undo step (sliders and colour pickers commit when they are let go).
import { h, icon, slider, swatchRow, chips, toggle, select, section, slotGlyph, hairGlyph, iconButton } from './ui.js';
import {
  SLIDERS, AGE_GROUPS, CAT_AGE, GROUP_OF_CAT, groupOf, sliderGroups, sliderName, faceOptions, markOptions, skinTones, hairStyles, hairColors,
  facialStyles, underwearStyles, expressions, faceDefaults, has, SLOT_TABS, SLOT_NAME, MULTI, CONFLICTS, built, colorsOfWorn, isMinor,
} from './data.js';
import { outfitFromPreset } from './random.js';

const pending = (text) => h('div', { class: 'note soon' }, icon('sparkle'), h('span', {}, text));

// ---------- presets ----------
export function presetsPanel(app) {
  const ui = app.ui, cat = app.cat;
  const quick = h('div', { class: 'quick' });
  const sexes = [{ id: 'any', name: 'Anyone' }, { id: 'boy', name: 'Boy / man' }, { id: 'girl', name: 'Girl / woman' }];
  quick.append(chips({ items: sexes, value: ui.quickSex || 'any', small: true, onPick: (id) => { ui.quickSex = id; } }));
  const grid = h('div', { class: 'age-grid' });
  for (const g of AGE_GROUPS) {
    grid.append(h('button', { class: 'age-btn', onclick: () => app.randomize({ group: g.id, sex: ui.quickSex === 'boy' ? 0 : ui.quickSex === 'girl' ? 1 : undefined, ignoreLocks: true }) },
      h('b', {}, g.name), h('small', {}, `${g.range[0]}–${g.range[1]}`)));
  }
  grid.append(h('button', { class: 'age-btn any', onclick: () => app.randomize({ sex: ui.quickSex === 'boy' ? 0 : ui.quickSex === 'girl' ? 1 : undefined, ignoreLocks: true }) }, icon('dice'), h('b', {}, 'Any age')));
  quick.append(grid);

  // the catalogue's outfit presets
  const outfits = cat.outfits;
  const f = ui.presetFilter || (ui.presetFilter = { age: 'all', pres: 'all', q: '' });
  const list = h('div', { class: 'preset-grid' });
  const draw = () => {
    list.textContent = '';
    const q = f.q.trim().toLowerCase();
    const shown = outfits.filter((p) => (f.age === 'all' || p.age_group === f.age) && (f.pres === 'all' || p.presentation === f.pres)
      && (!q || `${p.name} ${p.archetype} ${p.palette_mood || ''} ${p.notes || ''}`.toLowerCase().includes(q)));
    count.textContent = `${shown.length} of ${outfits.length}`;
    for (const p of shown) {
      const items = outfitFromPreset(p).map((w) => ({ w, item: cat.byId[w.id] })).filter((x) => x.item);
      const nb = items.filter((x) => built(x.item)).length;
      const strip = h('div', { class: 'mini-strip' }, items.slice(0, 7).map((x) => h('i', { style: { background: colorsOfWorn(x.item, x.w).main } })));
      const g = AGE_GROUPS.find((a) => a.id === GROUP_OF_CAT[p.age_group]);
      list.append(h('button', { class: 'preset' + (app.look.preset === p.id ? ' on' : ''), title: `${p.name}\n${p.palette_mood || ''}\n${p.notes || ''}`, onclick: () => app.applyPreset(p) },
        strip,
        h('div', { class: 'preset-name' }, p.name),
        h('div', { class: 'preset-meta' }, h('span', { class: 'tag' }, (g && g.name) || p.age_group), h('span', { class: 'tag ' + p.presentation }, p.presentation), h('span', { class: 'arch' }, p.archetype.replace(/^(role|trainer_class|seasonal):/, '').replace(/_/g, ' '))),
        h('div', { class: 'preset-built' + (nb < items.length ? ' part' : '') }, nb < items.length ? `${nb}/${items.length} items built` : `${items.length} items`)));
    }
  };
  const count = h('span', { class: 'count' });
  const ageItems = [{ id: 'all', name: 'All ages' }, ...AGE_GROUPS.map((g) => ({ id: CAT_AGE[g.id], name: g.name }))];
  const search = h('input', { type: 'search', placeholder: 'Search outfits, roles, colours…', value: f.q, class: 'search', oninput: (e) => { f.q = e.target.value; app.typing(); draw(); } });
  const filters = h('div', { class: 'filters' },
    h('div', { class: 'search-wrap' }, icon('search'), search),
    chips({ items: ageItems, value: f.age, small: true, wrap: false, onPick: (id) => { f.age = id; draw(); } }),
    chips({ items: [{ id: 'all', name: 'Everyone' }, { id: 'boy', name: 'Boy' }, { id: 'girl', name: 'Girl' }, { id: 'unisex', name: 'Unisex' }], value: f.pres, small: true, onPick: (id) => { f.pres = id; draw(); } }));
  draw();
  return h('div', {},
    section('Random townsperson', [h('p', { class: 'hint' }, 'A whole new person for an age group, dressed by the game\'s own generator (ignores locks).'), quick]),
    section('Catalogue outfits', [filters, list], { badge: count }));
}

// ---------- body ----------
export function bodyPanel(app) {
  const b = app.look.body;
  const age = b.age ?? SLIDERS.age[2], g = groupOf(age);
  const out = h('div', {});
  const ages = chips({ items: AGE_GROUPS.map((x) => ({ id: x.id, name: x.name, title: `${x.range[0]}–${x.range[1]} years` })), value: g.id, onPick: (id) => {
    const gg = AGE_GROUPS.find((x) => x.id === id); app.edit((l) => { l.body.age = gg.age; }, { frame: 'full' }); app.renderPanel();
  } });
  const sex = chips({ items: [{ id: 0, name: 'Boy / man' }, { id: 1, name: 'Girl / woman' }], value: b.sex >= 0.5 ? 1 : 0, onPick: (id) => { app.edit((l) => { l.body.sex = id; }); app.renderPanel(); } });
  out.append(section('Who', [h('div', { class: 'label' }, 'Age group'), ages, h('div', { class: 'label' }, 'Body type'), sex],
    { actions: [h('button', { class: 'btn small ghost', title: 'A new body for this age group and sex (keeps everything else)', onclick: () => app.rollBody() }, icon('dice'), 'Reroll body')] }));
  for (const grp of sliderGroups()) {
    const sliders = [];
    for (const k of grp.keys) {
      const [min, max, def] = SLIDERS[k];
      const fmt = k === 'age' ? (v) => `${Math.round(v)} yrs` : k === 'sex' ? (v) => (v < 0.15 ? 'Boy' : v > 0.85 ? 'Girl' : `${Math.round(v * 100)}%`) : undefined;
      sliders.push(slider({
        label: sliderName(k), min, max, def, value: b[k] ?? def, step: k === 'age' ? 1 : 0.01, fmt,
        onInput: (v) => app.edit((l) => { l.body[k] = v; }, { commit: false, frame: grp.frame }),
        onChange: () => { app.commit(); if (k === 'age' || k === 'sex') app.renderCard(); },
      }));
    }
    const reset = h('button', { class: 'btn small ghost', title: `Reset ${grp.name.toLowerCase()}`, onclick: () => {
      app.edit((l) => { for (const k of grp.keys) { if (k === 'age' || k === 'sex') continue; delete l.body[k]; } }, { frame: grp.frame }); app.renderPanel();
    } }, icon('reset'), 'Reset');
    out.append(section(grp.name, sliders, { actions: grp.id === 'agesex' ? [] : [reset], fold: true, closed: !!(app.ui.folded || {})[grp.id], onFold: (open) => { (app.ui.folded || (app.ui.folded = {}))[grp.id] = !open; },
      onEnter: () => app.hoverFrame(grp.frame), onFocus: () => app.frame(grp.frame) }));
  }
  return out;
}

// one option control (face, marks): choice / range / color / toggle
function optionControl(app, o, get, set, paint) {
  const v = get(o.key) ?? o.def;
  if (o.kind === 'choice') return h('div', { class: 'opt' }, h('div', { class: 'label' }, o.name), chips({ items: o.options.map((x) => ({ id: x.id, name: x.name })), value: v, small: true, onPick: (id) => app.edit((l) => set(l, o.key, id), { paint, build: !paint }) }));
  if (o.kind === 'range') return slider({ label: o.name, min: o.min, max: o.max, step: o.step, def: o.def, value: v, onInput: (x) => app.edit((l) => set(l, o.key, x), { paint, build: !paint, commit: false }), onChange: () => app.commit() });
  if (o.kind === 'color') return h('div', { class: 'opt' }, h('div', { class: 'label' }, o.name), swatchRow({ items: o.options, value: v, onPick: (c) => app.edit((l) => set(l, o.key, c), { paint, build: !paint }), onCustomInput: (c) => app.edit((l) => set(l, o.key, c), { paint, build: !paint, commit: false }), onCustomChange: () => app.commit() }));
  if (o.kind === 'toggle') return h('div', { class: 'opt' }, toggle({ label: o.name, value: !!v, onChange: (x) => app.edit((l) => set(l, o.key, x), { paint, build: !paint }) }));
  return null;
}

// ---------- face ----------
export function facePanel(app) {
  const out = h('div', {});
  if (!has.face()) out.append(pending('Face options are still being built in skin.js. These choices are saved with the look and appear on the face once it supports them.'));
  const defs = faceDefaults(app.look);
  const get = (k) => (app.look.face || {})[k] ?? defs[k];
  const set = (l, k, v) => { l.face = { ...(l.face || {}), [k]: v }; };
  const groups = new Map();
  for (const o of faceOptions()) { const g = o.group || 'Face'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
  const exprs = expressions();
  const exprRow = chips({ items: exprs.map((e) => ({ id: e.id, name: e.name })), value: app.ui.expression || exprs[0]?.id, small: true, onPick: (id) => app.setExpression(id) });
  out.append(section('Expression', [exprRow, app.stage.canExpress() ? null : h('p', { class: 'hint' }, 'Preview only for now: the skin material has no expressions yet.')],
    { actions: [toggle({ label: 'Blink', value: app.ui.blink !== false, onChange: (v) => app.setBlink(v) })] }));
  for (const [g, opts] of groups) {
    out.append(section(g, opts.map((o) => optionControl(app, o, get, set, 'skin')), {
      actions: [h('button', { class: 'btn small ghost', onclick: () => { app.edit((l) => { const f = { ...(l.face || {}) }; for (const o of opts) delete f[o.key]; l.face = f; }, { paint: 'skin', build: false }); app.renderPanel(); } }, icon('reset'), 'Reset')],
    }));
  }
  return out;
}

// ---------- skin ----------
export function skinPanel(app) {
  const out = h('div', {});
  const tone = (app.look.skin || {}).tone;
  const tones = skinTones();
  if (!has.tones()) out.append(pending('Using the anime research\'s skin tones until skin.js lists its own.'));
  const row = swatchRow({ items: tones, value: tone, big: true,
    onPick: (c) => { app.edit((l) => { l.skin = { ...(l.skin || {}), tone: c }; }, { paint: 'skin', build: false }); name.textContent = (tones.find((t) => t.color === c) || { name: 'Custom' }).name; },
    onCustomInput: (c) => { app.edit((l) => { l.skin = { ...(l.skin || {}), tone: c }; }, { paint: 'skin', build: false, commit: false }); name.textContent = 'Custom'; },
    onCustomChange: () => app.commit() });
  const name = h('span', { class: 'swatch-name' }, (tones.find((t) => t.color === tone) || { name: tone ? 'Custom' : 'Default' }).name);
  out.append(section('Skin tone', [row], { actions: [name] }));
  const marks = markOptions();
  const defs = faceDefaults(app.look);
  const get = marks.where === 'face' ? (k) => (app.look.face || {})[k] ?? defs[k] : (k) => ((app.look.skin || {}).marks || {})[k];
  const set = marks.where === 'face' ? (l, k, v) => { l.face = { ...(l.face || {}), [k]: v }; } : (l, k, v) => { l.skin = { ...(l.skin || {}), marks: { ...((l.skin || {}).marks || {}), [k]: v } }; };
  out.append(section('Marks', [marks.fallback ? pending('Marks are saved with the look; skin.js will paint them once it has them.') : null, ...marks.list.map((o) => optionControl(app, o, get, set, 'skin'))]));
  return out;
}

// ---------- hair ----------
export function hairPanel(app) {
  const out = h('div', {});
  const hair = app.look.hair || {}, color = hair.color || '#4a3226', skin = (app.look.skin || {}).tone || '#f9dcb4';
  const styles = hairStyles();
  if (!has.hair()) out.append(pending('Hair styles are still being built in hair.js; the gallery fills in as they land. Colour and facial hair are saved with the look.'));
  const gal = h('div', { class: 'hair-grid' });
  const all = [{ id: 'none', name: 'None' }, ...styles];
  for (const s of all) {
    const on = (hair.style || 'none') === s.id;
    gal.append(h('button', { class: 'hair-card' + (on ? ' on' : ''), title: s.name, onclick: () => { app.edit((l) => { l.hair = { ...(l.hair || {}), style: s.id === 'none' ? undefined : s.id }; }, { frame: 'face' }); app.renderPanel(); } },
      hairGlyph(s, color, skin), h('span', {}, s.name)));
  }
  out.append(section('Style', [gal], { badge: styles.length ? String(styles.length) : 'soon', badgeClass: styles.length ? '' : 'soon' }));
  const cols = hairColors();
  out.append(section('Colour', [swatchRow({ items: cols, value: color,
    onPick: (c) => { app.edit((l) => { l.hair = { ...(l.hair || {}), color: c }; }, { paint: 'hair' }); gal.querySelectorAll('.hair-card path, .hair-card circle:not(:first-child)').forEach((p) => p.setAttribute('fill', c)); },
    onCustomInput: (c) => app.edit((l) => { l.hair = { ...(l.hair || {}), color: c }; }, { paint: 'hair', commit: false }), onCustomChange: () => app.commit() })]));
  const age = app.look.body.age ?? 11;
  const facial = facialStyles();
  out.append(section('Facial hair', [
    age < 16 ? h('p', { class: 'hint' }, 'For grown-ups (16 and over).') : chips({ items: facial, value: hair.facial || 'none', small: true, onPick: (id) => { app.edit((l) => { l.hair = { ...(l.hair || {}), facial: id }; }, { frame: 'face' }); } }),
    has.facial() ? null : h('p', { class: 'hint' }, 'Saved with the look; hair.js will grow it once it has facial hair.'),
  ]));
  return out;
}

// ---------- outfit ----------
export function outfitPanel(app) {
  const ui = app.ui, cat = app.cat, look = app.look;
  const tab = SLOT_TABS.find((t) => t.id === ui.slotTab) || SLOT_TABS[0];
  const age = look.body.age ?? 11, g = groupOf(age);
  const f = ui.itemFilter || (ui.itemFilter = { line: 'all', allAges: false });
  const out = h('div', { class: 'outfit' });
  // what is worn
  const worn = look.outfit || [];
  const wearing = h('div', { class: 'wearing' });
  if (!worn.length) wearing.append(h('span', { class: 'hint' }, 'Nothing on but underwear. Pick items below, or a preset.'));
  worn.forEach((w, i) => {
    const it = cat.byId[w.id]; if (!it) return;
    const sel = ui.sel === w.id;
    wearing.append(h('div', { class: 'worn' + (sel ? ' on' : '') + (built(it) ? '' : ' soon'), title: `${SLOT_NAME[it.slot]}: ${it.name}${built(it) ? '' : ' (coming soon)'}` },
      h('button', { class: 'worn-main', onclick: () => { ui.sel = w.id; ui.slotTab = (SLOT_TABS.find((t) => t.slots.includes(it.slot)) || tab).id; app.frame(SLOT_TABS.find((t) => t.id === ui.slotTab).frame); app.renderPanel(); } },
        slotGlyph(it.slot, colorsOfWorn(it, w)), h('span', {}, it.name)),
      h('button', { class: 'worn-x', title: 'Take off', 'aria-label': 'Take off ' + it.name, onclick: () => { app.edit((l) => { l.outfit.splice(i, 1); }); if (ui.sel === w.id) ui.sel = null; app.renderPanel(); } }, icon('x'))));
  });
  out.append(section('Wearing', [wearing], { badge: String(worn.length), actions: [
    h('button', { class: 'btn small ghost', title: 'A new outfit from the generator for this person', onclick: () => app.rollOutfit() }, icon('dice'), 'Reroll'),
    worn.length ? h('button', { class: 'btn small ghost', title: 'Take everything off', onclick: () => { app.edit((l) => { l.outfit = []; }); ui.sel = null; app.renderPanel(); } }, icon('trash'), 'Clear') : null] }));

  // slot tabs
  const slotRow = h('div', { class: 'slot-tabs', role: 'tablist' });
  for (const t of SLOT_TABS) {
    const n = worn.filter((w) => cat.byId[w.id] && t.slots.includes(cat.byId[w.id].slot)).length;
    slotRow.append(h('button', { class: 'slot-tab' + (t.id === tab.id ? ' on' : ''), role: 'tab', 'aria-selected': t.id === tab.id ? 'true' : 'false',
      onclick: () => { ui.slotTab = t.id; ui.sel = (worn.find((w) => cat.byId[w.id] && t.slots.includes(cat.byId[w.id].slot)) || {}).id || null; app.frame(t.frame); app.renderPanel(); } },
    slotGlyph(t.slots[0], { main: t.id === tab.id ? '#ffffff' : '#9aa0c0', second: t.id === tab.id ? '#ffd0cc' : '#d4d7e8', accent: '#e8463c' }), h('span', {}, t.name), n ? h('i', { class: 'n' }, n) : null));
  }
  out.append(slotRow);
  requestAnimationFrame(() => { const on = slotRow.querySelector('.on'); if (on && slotRow.scrollWidth > slotRow.clientWidth) slotRow.scrollLeft = on.offsetLeft - slotRow.clientWidth / 2 + on.clientWidth / 2; });

  // the editor for the selected worn item of this tab
  const selW = worn.find((w) => w.id === ui.sel && cat.byId[w.id] && tab.slots.includes(cat.byId[w.id].slot));
  if (selW) out.append(itemEditor(app, selW));

  // the items
  const items = cat.items.filter((i) => tab.slots.includes(i.slot) && (f.allAges || (i.ages || []).includes(CAT_AGE[g.id])) && (f.line === 'all' || i.gender_line === f.line));
  const filt = h('div', { class: 'filters row' },
    chips({ items: [{ id: 'all', name: 'All' }, { id: 'boy', name: 'Boy' }, { id: 'girl', name: 'Girl' }, { id: 'unisex', name: 'Unisex' }], value: f.line, small: true, onPick: (id) => { f.line = id; app.renderPanel(); } }),
    toggle({ label: 'All ages', value: f.allAges, title: `Show items for every age (now: ${g.name})`, onChange: (v) => { f.allAges = v; app.renderPanel(); } }));
  const grid = h('div', { class: 'item-grid' });
  for (const it of items) {
    const w = worn.find((x) => x.id === it.id), on = !!w, ok = built(it);
    const cols = colorsOfWorn(it, w || {});
    const cw = (it.colourways || []).map((c, ci) => h('button', { class: 'cw' + (w && (w.colourway === c.name || (w.colourway === undefined && ci === 0)) && !w.colors ? ' on' : ''), title: c.name, style: { '--c': c.colours.main, '--c2': c.colours.second || c.colours.main },
      onclick: (e) => { e.stopPropagation(); app.equip(it, { colourway: c.name }); } }));
    const ages = (it.ages || []).includes(CAT_AGE[g.id]) ? null : h('span', { class: 'ribbon age' }, 'other ages');
    grid.append(h('div', { class: 'item' + (on ? ' on' : '') + (ok ? '' : ' soon'), tabindex: 0, role: 'button', 'aria-pressed': on ? 'true' : 'false',
      title: `${it.name}${it.notes ? '\n' + it.notes : ''}\n${it.base} · ${it.gender_line}${ok ? '' : '\nComing soon: no builder for "' + it.base + '" yet'}`,
      onclick: () => (on ? app.unequip(it) : app.equip(it)), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on ? app.unequip(it) : app.equip(it); } } },
      h('div', { class: 'item-art' }, slotGlyph(it.slot, cols), on ? h('span', { class: 'check' }, '✓') : null),
      h('div', { class: 'item-name' }, it.name),
      h('div', { class: 'cws' }, cw),
      ok ? null : h('span', { class: 'ribbon' }, 'coming soon'), ages));
  }
  if (!items.length) grid.append(h('p', { class: 'hint' }, `No ${tab.name.toLowerCase()} for a ${g.name.toLowerCase()} with these filters.`));
  out.append(section(tab.name, [filt, grid], { badge: `${items.length}` }));
  return out;
}

// colourways, colours, pattern and shape of one worn item
function itemEditor(app, w) {
  const it = app.cat.byId[w.id], voc = app.cat.vocabulary;
  const cols = colorsOfWorn(it, w);
  const idx = () => app.look.outfit.findIndex((x) => x.id === w.id);
  const editW = (fn, o) => app.edit((l) => { const i = l.outfit.findIndex((x) => x.id === w.id); if (i >= 0) fn(l.outfit[i]); }, o);
  const cwRow = h('div', { class: 'cw-list' }, (it.colourways || []).map((c, ci) => {
    const on = !w.colors && (w.colourway === c.name || (w.colourway === undefined && ci === 0));
    return h('button', { class: 'cw-chip' + (on ? ' on' : ''), onclick: () => { editW((x) => { x.colourway = c.name; delete x.colors; }, { paint: 'item:' + w.id }); app.renderPanel(); } },
      h('span', { class: 'cw-dots' }, ['main', 'second', 'accent', 'trim'].map((k) => h('i', { style: { background: c.colours[k] || c.colours.main } }))), c.name);
  }));
  const pickers = h('div', { class: 'pickers' }, ['main', 'second', 'accent', 'trim'].map((k) => {
    const inp = h('input', { type: 'color', value: cols[k] || cols.main });
    inp.addEventListener('input', () => editW((x) => { x.colors = { ...(x.colors || {}), [k]: inp.value }; }, { paint: 'item:' + w.id, commit: false }));
    inp.addEventListener('change', () => { app.commit(); app.renderCard(); });
    return h('label', { class: 'picker', title: `${k[0].toUpperCase() + k.slice(1)} colour` }, h('span', { class: 'pick-sw', style: { background: cols[k] || cols.main } }, inp), h('span', {}, k));
  }));
  pickers.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { inp.parentElement.style.background = inp.value; }));
  // pattern
  const pat = { ...(it.pattern || { type: 'solid' }), ...(w.pattern || {}) };
  const types = (voc.pattern_type || ['solid']).map((t) => ({ id: t, name: t.replace(/_/g, ' ') }));
  const roles = ['main', 'second', 'accent', 'trim'].map((r) => ({ id: r, name: r }));
  const setPat = (k, v) => { editW((x) => { x.pattern = { ...(it.pattern || {}), ...(x.pattern || {}), [k]: v }; }); app.renderPanel(); };
  const patRow = h('div', { class: 'fields' },
    select({ label: 'Pattern', items: types, value: pat.type, onChange: (v) => setPat('type', v) }),
    pat.type !== 'solid' ? select({ label: 'Colour', items: roles, value: pat.colour || (pat.colours && pat.colours[0]) || 'second', onChange: (v) => setPat('colour', v) }) : null,
    pat.type !== 'solid' ? select({ label: 'Scale', items: ['small', 'medium', 'large'].map((s) => ({ id: s, name: s })), value: pat.scale || 'medium', onChange: (v) => setPat('scale', v) }) : null);
  // shape params from the vocabulary
  const params = { ...it.params, ...(w.params || {}) };
  const shape = h('div', { class: 'fields' });
  for (const k of ['fit', 'length', 'sleeve', 'neckline', 'collar', 'closure', 'hem', 'pockets', 'cuffs']) {
    if (!voc[k] || it.params[k] === 'n/a') continue;
    shape.append(select({ label: k, items: voc[k].filter((x) => x !== 'n/a').map((x) => ({ id: x, name: x.replace(/_/g, ' ') })), value: params[k], onChange: (v) => { editW((x) => { x.params = { ...(x.params || {}), [k]: v }; }); app.renderPanel(); } }));
  }
  const det = params.details || [];
  const detChips = chips({ items: det.map((d) => ({ id: d, name: d.replace(/_/g, ' ') })), value: det, small: true, multi: true,
    onPick: (d) => { editW((x) => { x.params = { ...(x.params || {}), details: det.filter((y) => y !== d) }; }); app.renderPanel(); } });
  const addDet = h('select', { class: 'add-detail', 'aria-label': 'Add a detail', onchange: (e) => { const v = e.target.value; if (!v) return; editW((x) => { x.params = { ...(x.params || {}), details: [...det, v] }; }); app.renderPanel(); } },
    h('option', { value: '' }, '+ add detail…'), (voc.details || []).filter((d) => !det.includes(d)).map((d) => h('option', { value: d }, d.replace(/_/g, ' '))));
  const changed = !!(w.colors || w.pattern || w.params);
  return section(`${it.name}`, [
    h('div', { class: 'item-head' }, slotGlyph(it.slot, cols), h('div', {}, h('div', { class: 'item-sub' }, `${SLOT_NAME[it.slot]} · ${it.base.replace(/_/g, ' ')} · ${it.gender_line}`), it.notes ? h('div', { class: 'hint' }, it.notes) : null,
      built(it) ? null : h('div', { class: 'note soon small' }, icon('sparkle'), `Coming soon: the "${it.base}" builder isn't in yet, so it doesn't show on the model.`))),
    h('div', { class: 'label' }, 'Colourways'), cwRow,
    h('div', { class: 'label' }, 'Custom colours'), pickers,
    h('div', { class: 'label' }, 'Pattern'), patRow,
    h('details', { class: 'shape' }, h('summary', {}, 'Shape & details'), shape, h('div', { class: 'label' }, 'Details (click to remove)'), detChips, addDet),
  ], { badge: 'editing', badgeClass: 'edit', actions: [
    changed ? h('button', { class: 'btn small ghost', title: 'Back to the catalogue colours and shape', onclick: () => { editW((x) => { delete x.colors; delete x.pattern; delete x.params; }); app.renderPanel(); } }, icon('reset'), 'Reset') : null,
    iconButton('x', 'Take off', () => { app.edit((l) => { l.outfit.splice(idx(), 1); }); app.ui.sel = null; app.renderPanel(); }, 'small'),
  ] });
}

// equip rules: one item per slot except accessories; dresses and bottoms push each other off
export function equipInto(look, item, o = {}, cat) {
  const out = (look.outfit || []).filter((w) => {
    const it = cat.byId[w.id]; if (!it) return true;
    if (w.id === item.id) return false;
    if (it.slot === item.slot && !MULTI.has(item.slot)) return false;
    if ((CONFLICTS[item.slot] || []).includes(it.slot)) return false;
    return true;
  });
  const w = { id: item.id };
  if (o.colourway) w.colourway = o.colourway;
  // children in a skirt without shorts underneath: the built-in shorts go on
  if (isMinor(look.body.age) && /skirt|dress|pinafore/.test(item.base + item.slot) && !/built_in_shorts/.test((item.params.details || []).join(' '))) {
    const covered = out.some((x) => { const it = cat.byId[x.id]; return it && it.slot === 'legwear' && /tights|leggings|knee/.test(`${it.base} ${it.params.length}`); });
    if (!covered && o.autoShorts !== false) w.params = { details: [...(item.params.details || []), 'built_in_shorts'] };
  }
  out.push(w);
  look.outfit = out;
  return w;
}

// ---------- underwear ----------
export function underwearPanel(app) {
  const u = app.look.underwear || {};
  const st = underwearStyles();
  const COLS = ['#f2f0ee', '#f4f2f4', '#cfdfee', '#eec4d1', '#f4e0a2', '#9bcbbd', '#a8aad2', '#c8c6c9', '#2b3554', '#4a4c4c'].map((c) => ({ color: c, name: c }));
  const TRIM = ['#9fb6d8', '#de626c', '#2b3554', '#86977f', '#e4b730', '#f4f2f4', '#4a4c4c'].map((c) => ({ color: c, name: c }));
  const set = (k, v, commit = true) => app.edit((l) => { l.underwear = { ...(l.underwear || {}), [k]: v }; }, { paint: 'skin', build: false, commit });
  return h('div', {},
    h('p', { class: 'hint pad' }, 'Painted on the body under everything, so no one is ever bare. Take the outfit off to see it.'),
    section('Style', [chips({ items: st, value: u.style || st[0]?.id, onPick: (id) => set('style', id) })],
      { actions: [h('button', { class: 'btn small ghost', onclick: () => app.peekUnderwear() }, icon('eye'), 'Peek')] }),
    section('Colour', [swatchRow({ items: COLS, value: u.color || '#f2f0ee', onPick: (c) => set('color', c), onCustomInput: (c) => set('color', c, false), onCustomChange: () => app.commit() })]),
    section('Trim', [swatchRow({ items: TRIM, value: u.trim || '#9fb6d8', onPick: (c) => set('trim', c), onCustomInput: (c) => set('trim', c, false), onCustomChange: () => app.commit() })]));
}

export const PANELS = [
  { id: 'presets', name: 'Presets', icon: 'presets', make: presetsPanel, frame: 'full', key: '1' },
  { id: 'body', name: 'Body', icon: 'body', make: bodyPanel, frame: 'full', key: '2' },
  { id: 'face', name: 'Face', icon: 'face', make: facePanel, frame: 'face', key: '3' },
  { id: 'skin', name: 'Skin', icon: 'skin', make: skinPanel, frame: 'full', key: '4' },
  { id: 'hair', name: 'Hair', icon: 'hair', make: hairPanel, frame: 'face', key: '5' },
  { id: 'outfit', name: 'Outfit', icon: 'outfit', make: outfitPanel, frame: null, key: '6' },
  { id: 'underwear', name: 'Underwear', icon: 'underwear', make: underwearPanel, frame: 'full', key: '7' },
];
