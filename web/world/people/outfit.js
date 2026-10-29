// Dressing a person from the catalogue (catalog.json): each worn item is built by
// the builder for its archetype (item.base) from garments/*.js, in layer order,
// so what is worn over something stands off the body a little further.
//
// An outfit is a list of worn items: { id (catalogue item), colourway (name or
// index), colors ({ main, second, accent, trim } overrides), params (overrides of
// the item's params), pattern (override) }.
//
// dress(ctx, outfit, catalog) -> [{ piece (wear.js), paint: { glsl, params, colors }, item }]
import { BUILDERS } from './garments/index.js';
import { patternGLSL, detailsGLSL } from './garments/patterns.js';

// how far out each slot sits (layer 0 is on the skin): the offset is LAYER_OFF(layer)
export const SLOT_LAYER = { legwear: 0, gloves: 0.5, bottom: 1.2, onepiece: 1.2, shoes: 1, top: 2, dress: 2, apron: 3.2, belt: 3.5, outer: 4, neckwear: 5, bag: 6, wrist: 2.5, jewellery: 5, pin: 5.5, hat: 0, hair_acc: 0, eyewear: 0 };
export const layerOff = (layer) => 0.0025 + 0.0042 * layer;
// the order slots are put on (and drawn)
export const SLOT_ORDER = ['legwear', 'shoes', 'bottom', 'onepiece', 'top', 'dress', 'gloves', 'apron', 'belt', 'outer', 'neckwear', 'wrist', 'jewellery', 'pin', 'bag', 'eyewear', 'hat', 'hair_acc'];

export function colorsOf(item, worn = {}) {
  const cw = item.colourways || [];
  let c = cw[0] ? cw[0].colours : {};
  if (typeof worn.colourway === 'number' && cw[worn.colourway]) c = cw[worn.colourway].colours;
  else if (typeof worn.colourway === 'string') { const f = cw.find((x) => x.name === worn.colourway); if (f) c = f.colours; }
  return { main: '#888888', ...c, ...(worn.colors || {}) };
}

export function dress(ctx, outfit = [], catalog) {
  const byId = catalog.byId || (catalog.byId = Object.fromEntries(catalog.items.map((i) => [i.id, i])));
  const worn = outfit.map((w) => ({ w, item: byId[w.id] })).filter((x) => x.item);
  worn.sort((a, b) => SLOT_ORDER.indexOf(a.item.slot) - SLOT_ORDER.indexOf(b.item.slot));
  const has = (slot) => worn.some((x) => x.item.slot === slot);
  const out = [];
  for (const { w, item } of worn) {
    const build = BUILDERS[item.base];
    if (!build) { out.push({ missing: item.base, item }); continue; }
    const params = { ...item.params, ...(w.params || {}) };
    let layer = SLOT_LAYER[item.slot] ?? 2;
    if (item.slot === 'top' && params.tuck) layer = 0.8;
    if (item.slot === 'top' && has('dress')) layer = 2.6;
    const it = { item, params, colors: colorsOf(item, w), pattern: w.pattern || item.pattern || { type: 'solid' }, layer, off: layerOff(layer), has, worn: w };
    let pieces;
    try { pieces = build(ctx, it) || []; }
    catch (e) { console.warn('garment', item.id, e); pieces = []; }
    for (const pc of pieces) {
      if (!pc || !pc.piece) continue;
      const pat = pc.noPattern ? '' : patternGLSL(it.pattern), det = pc.noDetails ? '' : detailsGLSL(params.details || []);
      const glsl = pc.glsl ?? `vec2 P = vG.xy; vec3 col = uMain; ${pat} ${det} ${pc.extra || ''} return col;`;
      out.push({ piece: pc.piece, paint: { glsl, params: pc.uP || [[it.hemY ?? 0, it.topY ?? 1, 0, 0]], colors: { ...it.colors, ...(pc.colors || {}) }, inside: pc.inside }, item, slot: item.slot });
    }
  }
  return out;
}
