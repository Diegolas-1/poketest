// Performance log: while on, one line a second of frame timing, where the time
// goes (game update and each draw pass, as measured by the CPU), what was
// drawn, memory and where the player is. Kept in localStorage, so a reload or
// a crash does not lose it; Share / Copy hand it over as text.
const KEY = 'pallet-perflog';

export function createPerfLog({ renderer, scene, me, cam, outline, quality, preset }) {
  const ri = renderer.info;
  let on = false, rows = [], head = null, t0 = 0, last = 0, saveAt = 0, objsAt = 0, objs = 0;
  // the current second
  let n = 0, nf = 0, sumI = 0, ints = [], cpu = 0, cpuMax = 0, upd = 0, sec = {}, calls = 0, tris = 0, prev = 0;
  let mark = 0, fStart = 0;

  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) { head = s.head; rows = s.rows || []; } } catch {}

  const rec = document.createElement('div');
  rec.style.cssText = 'position:fixed;top:var(--st,10px);left:calc(var(--sl,10px) + 330px);z-index:6;height:28px;padding:0 9px;border-radius:8px;background:rgba(200,40,40,.75);color:#fff;font:600 13px/28px ui-monospace,Menlo,monospace;pointer-events:none;display:none';
  document.body.appendChild(rec);

  function start() {
    on = true; rows = []; t0 = performance.now(); last = t0; prev = 0;
    head = {
      started: new Date().toISOString(), ua: navigator.userAgent, preset, quality: { ...quality },
      screen: [screen.width, screen.height], dpr: devicePixelRatio, standalone: !!navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches,
      cores: navigator.hardwareConcurrency || null, gl: glInfo(),
    };
    ri.autoReset = false;
    rec.style.display = '';
    reset();
  }
  function stop() { on = false; ri.autoReset = true; rec.style.display = 'none'; save(); }
  function reset() { n = 0; nf = 0; sumI = 0; ints = []; cpu = 0; cpuMax = 0; upd = 0; sec = {}; calls = 0; tris = 0; }
  function glInfo() {
    try {
      const gl = renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
    } catch { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ head, rows })); } catch {} }

  const api = {
    get on() { return on; },
    set(v) { v ? start() : stop(); },
    // frame timing: call at the start of the frame, after the update, and at the end
    begin() {
      if (!on) return;
      fStart = performance.now();
      if (prev) { const i = fStart - prev; sumI += i; ints.push(i); n++; }
      prev = fStart;
      ri.reset();
    },
    updated() { if (on) { const t = performance.now(); upd += t - fStart; mark = t; } },
    // a draw pass just finished
    pass(name) { if (on) { const t = performance.now(); sec[name] = (sec[name] || 0) + t - mark; mark = t; } },
    end() {
      if (!on) return;
      const now = performance.now(), c = now - fStart;
      cpu += c; cpuMax = Math.max(cpuMax, c); nf++;
      calls += ri.render.calls; tris += ri.render.triangles;
      if (now - last < 1000 || !n) return;
      ints.sort((a, b) => a - b);
      if (now - objsAt > 5000) { objsAt = now; objs = 0; scene.traverse(() => objs++); }
      const r = (x) => Math.round(x * 10) / 10;
      const parts = {}; for (const k in sec) parts[k] = r(sec[k] / nf);
      rows.push({
        t: Math.round((now - t0) / 1000), fps: r(n * 1000 / sumI),
        ms: r(sumI / n), p95: r(ints[Math.floor(ints.length * 0.95)] || 0), worst: r(ints[ints.length - 1] || 0),
        cpu: r(cpu / nf), cpuMax: r(cpuMax), upd: r(upd / nf), parts,
        calls: Math.round(calls / nf), tris: Math.round(tris / nf / 1000) + 'k',
        geo: ri.memory.geometries, tex: ri.memory.textures, prog: ri.programs?.length, objs,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : undefined,
        pos: [Math.round(me.pos.x), Math.round(me.pos.y), Math.round(me.pos.z)], spd: r(Math.abs(me.speed)), cam: r(cam.dist),
        px: renderer.getPixelRatio(), ink: outline.enabled ? outline.scale : 0, hidden: document.hidden || undefined,
      });
      last = now; reset();
      const s = rows.length;
      rec.textContent = `REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (now - saveAt > 5000) { saveAt = now; save(); }
    },
    has() { return rows.length > 0; },
    text() {
      const lines = [`PALLET TOWN PERF LOG`, JSON.stringify(head), 'one row a second: t s, fps, ms frame interval avg/p95/worst, cpu ms per frame (avg/max), upd = game update ms, parts = ms per draw pass'];
      for (const x of rows) lines.push(JSON.stringify(x));
      return lines.join('\n');
    },
    async share() {
      const txt = api.text();
      const file = new File([txt], `pallet-perf-${Date.now()}.txt`, { type: 'text/plain' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Pallet Town perf log' }); return 'shared'; }
        if (navigator.share) { await navigator.share({ text: txt, title: 'Pallet Town perf log' }); return 'shared'; }
      } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
      return api.copy();
    },
    async copy() {
      try { await navigator.clipboard.writeText(api.text()); return 'copied'; }
      catch {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([api.text()], { type: 'text/plain' }));
        a.download = 'pallet-perf.txt'; a.click(); return 'downloaded';
      }
    },
  };
  return api;
}
