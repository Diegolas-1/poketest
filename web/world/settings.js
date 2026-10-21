// The graphics settings window (the cog button): a preset plus step controls
// for each setting, saved on this device. Live settings apply at once; the
// rest (counts and distances baked when the world is built) need a reload.
const KEY = 'pallet-gfx';

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

// rows: [{ key, label, values, fmt?, live? }], presets: { name: {key: value} }
export function createSettings({ rows, presets, preset, values, ink, onLive, onInk, toggles = [] }) {
  const saved = loadSettings();
  const state = { preset, o: { ...(saved.o || {}) } };
  let dirty = false;

  const css = document.createElement('style');
  css.textContent = `
    #cogBtn { position: fixed; top: var(--st, 10px); left: calc(var(--sl, 10px) + 140px); z-index: 6; width: 30px; height: 28px; border: 0; border-radius: 8px; cursor: pointer;
      background: rgba(20, 30, 40, .4); color: #fff; font: 17px/28px system-ui, sans-serif; padding: 0; }
    #gfx { position: fixed; z-index: 30; top: calc(var(--st, 10px) + 38px); left: var(--sl, 10px); width: min(360px, calc(100vw - 20px)); max-height: calc(100dvh - var(--st, 10px) - var(--sb, 10px) - 48px); overflow-y: auto;
      background: rgba(22, 30, 44, .92); color: #f3f4f0; border-radius: 14px; padding: 12px 14px 14px; font: 14px/1.3 system-ui, sans-serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .35); display: none; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.3) transparent; }
    #gfx.open { display: block; }
    #gfx h3 { margin: 2px 0 10px; font: 600 16px system-ui, sans-serif; display: flex; justify-content: space-between; align-items: center; }
    #gfx h3 button { background: none; border: 0; color: #fff; font-size: 20px; cursor: pointer; }
    #gfx .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,.08); }
    #gfx .row span.l { flex: 1; } #gfx .row small { display: block; opacity: .55; font-size: 11px; }
    #gfx .step { display: flex; align-items: center; gap: 4px; }
    #gfx .step b { min-width: 74px; text-align: center; font-weight: 600; }
    #gfx button.s { width: 32px; height: 30px; border-radius: 8px; border: 0; background: rgba(255,255,255,.12); color: #fff; font-size: 16px; cursor: pointer; touch-action: manipulation; }
    #gfx button.s:active { background: rgba(255,255,255,.25); }
    #gfx .acts { display: flex; gap: 8px; margin-top: 12px; }
    #gfx .acts button { flex: 1; padding: 9px; border-radius: 9px; border: 0; cursor: pointer; font: 600 13px system-ui, sans-serif; }
    #gfx .reset { background: rgba(255,255,255,.14); color: #fff; }
    #gfx .apply { background: #e8735a; color: #fff; }
    #gfx .apply[disabled] { opacity: .35; cursor: default; }
    #gfx .changed b { color: #ffd27a; }`;
  document.head.appendChild(css);

  const cog = document.createElement('button');
  cog.id = 'cogBtn'; cog.title = 'Graphics settings'; cog.textContent = '⚙';
  const box = document.createElement('div'); box.id = 'gfx';
  document.body.append(cog, box);
  cog.addEventListener('click', () => box.classList.toggle('open'));
  for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel']) box.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  const cur = (k) => (k in state.o ? state.o[k] : presets[state.preset][k]);
  const persist = () => save({ preset: state.preset, o: state.o });
  const fmtOf = (r, v) => (r.fmt ? r.fmt(v) : String(v));

  function draw() {
    const pnames = Object.keys(presets);
    box.innerHTML = `<h3>Graphics<button data-close>×</button></h3>
      <div class="row"><span class="l">Outlines<small>O key</small></span><div class="step"><button class="s" data-ink>${ink() ? 'On' : 'Off'}</button></div></div>
      ${toggles.map((t, i) => `<div class="row"><span class="l">${t.label}<small>${t.hint || ''}</small></span><div class="step"><button class="s" data-t="${i}">${t.get() ? 'On' : 'Off'}</button></div></div>`).join('')}
      <div class="row"><span class="l">Preset<small>sets everything below</small></span><div class="step">
        <button class="s" data-p="-1">‹</button><b>${state.preset}</b><button class="s" data-p="1">›</button></div></div>
      ${rows.map((r, i) => {
        const v = cur(r.key), changed = r.key in state.o && state.o[r.key] !== presets[state.preset][r.key];
        return `<div class="row${changed ? ' changed' : ''}"><span class="l">${r.label}<small>${r.live ? 'instant' : 'needs reload'}</small></span>
          <div class="step"><button class="s" data-r="${i}" data-d="-1">‹</button><b>${fmtOf(r, v)}</b><button class="s" data-r="${i}" data-d="1">›</button></div></div>`;
      }).join('')}
      <div class="acts"><button class="reset" data-reset>Reset to ${state.preset}</button><button class="apply" data-apply ${dirty ? '' : 'disabled'}>Reload to apply</button></div>`;
    box.querySelector('[data-close]').onclick = () => box.classList.remove('open');
    box.querySelector('[data-ink]').onclick = () => { onInk(!ink()); draw(); };
    box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { const t = toggles[+b.dataset.t]; t.set(!t.get()); draw(); }));
    box.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
      const i = (pnames.indexOf(state.preset) + +b.dataset.p + pnames.length) % pnames.length;
      state.preset = pnames[i]; state.o = {}; persist(); dirty = true;
      for (const r of rows) if (r.live) onLive(r.key, cur(r.key));
      draw();
    }));
    box.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
      const r = rows[+b.dataset.r], vs = r.values, v = cur(r.key);
      // nearest step to the current value, then one up or down
      let i = vs.reduce((bi, x, k) => (Math.abs(x - v) < Math.abs(vs[bi] - v) ? k : bi), 0);
      i = Math.max(0, Math.min(vs.length - 1, i + +b.dataset.d));
      state.o[r.key] = vs[i]; persist();
      if (r.live) onLive(r.key, vs[i]); else dirty = true;
      draw();
    }));
    box.querySelector('[data-reset]').onclick = () => {
      const before = rows.filter((r) => !r.live && r.key in state.o).length;
      state.o = {}; persist();
      for (const r of rows) if (r.live) onLive(r.key, cur(r.key));
      if (before) dirty = true;
      draw();
    };
    box.querySelector('[data-apply]').onclick = () => location.reload();
  }
  draw();
  return { redraw: draw, values };
}
