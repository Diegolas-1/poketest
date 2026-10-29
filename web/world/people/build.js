// A person's geometry and paint as plain data (no three.js), so it can be made on
// the page or in a worker (worker.js) and turned into three.js objects by person.js:
//   buildData(look, { base, catalog, hair }) -> { look, anat: { t, aq, L, H, waistY }, body: { mesh arrays,
//   hide }, worn: [{ mesh, paint, double, item, slot }], missing: [archetypes], hair: [{ mesh, paint }] | null, ms }
// hair: a pure hair geometry builder (hairPieces(ctx, hair, opts) -> [{ piece, paint }]) when there is one.
import { buildBody } from './gen.js';
import { context } from './wear.js';
import { dress } from './outfit.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export function lookOf(x = {}) { return x.body || x.outfit || x.skin || x.hair || x.face ? x : { body: x }; }

export function buildData(input, { base, catalog, hair = null }) {
  const look = lookOf(input), t0 = now();
  const b = buildBody(look.body || {});
  const A = b.anat, ms = { body: b.ms };
  const ctx = context(b, base);
  const hide = new Float32Array(b.mesh.pos.length / 3);
  let worn = [];
  if (look.outfit && look.outfit.length && catalog) {
    const t = now();
    worn = dress(ctx, look.outfit, catalog);
    ms.dress = Math.round(now() - t);
    for (const w of worn) if (w.piece) { const h = w.piece.hide; for (let v = 0; v < hide.length; v++) if (h[v]) hide[v] = 1; }
  }
  let hairOut = null;
  if (hair && look.hair) {
    const t = now(), hatOn = worn.some((w) => w.slot === 'hat' && w.piece);
    try { hairOut = (hair(ctx, look.hair, { hatOn, look }) || []).filter((h) => h && h.piece).map((h) => ({ mesh: h.piece.mesh, paint: h.paint })); }
    catch (e) { console.warn('hair', e); hairOut = []; }
    ms.hair = Math.round(now() - t);
  }
  const m = b.mesh;
  return {
    look,
    anat: { t: A.sk.t, aq: A.aq, L: A.L, H: A.H, waistY: A.sk.pos[1][1] },
    body: { pos: m.pos, nrm: m.nrm, idx: m.idx, skin: m.skin, wts: m.wts, canon: m.canon, part: m.part, share: m.share, hide },
    worn: worn.filter((w) => w.piece).map((w) => ({ mesh: w.piece.mesh, paint: w.paint, double: w.piece.double, slot: w.slot, item: { id: w.item.id, name: w.item.name, slot: w.item.slot, base: w.item.base } })),
    missing: worn.filter((w) => w.missing).map((w) => w.missing),
    hair: hairOut,
    ms: { ...ms, total: Math.round(now() - t0) },
    // (kept on the page only, not sent from a worker)
    _built: b, _ctx: ctx,
  };
}

// the typed arrays in the data (to transfer from a worker without copying)
export function transferables(d) {
  const out = new Set();
  const add = (o) => { for (const v of Object.values(o)) if (ArrayBuffer.isView(v)) out.add(v.buffer); };
  add(d.body); for (const w of d.worn) add(w.mesh); if (d.hair) for (const h of d.hair) add(h.mesh);
  return [...out];
}
