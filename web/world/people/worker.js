// Builds people off the page's thread (build.js): { id, look } in, { id, data } out,
// the arrays transferred. The base body (shared base arrays are copied into each reply,
// as transferring them would take them from the worker) and the catalogue load once.
import { loadBase, base } from './gen.js';
import { buildData, transferables } from './build.js';

let ready = null, catalog = null, hair = null;
const init = () => ready || (ready = (async () => {
  await loadBase(new URL('./base.bin', import.meta.url));
  catalog = await (await fetch(new URL('./catalog.json', import.meta.url))).json();
  // a hair geometry builder free of three.js, when there is one
  try { const h = await import('./hairgen.js'); hair = h.hairPieces || null; } catch { hair = null; }
})());

self.onmessage = async (e) => {
  const { id, look } = e.data;
  try {
    await init();
    const d = buildData(look, { base: base(), catalog, hair });
    delete d._built; delete d._ctx;
    // the base's own arrays (skin, weights, paint coordinates) are shared by every body: copy them
    for (const k of ['skin', 'wts', 'canon', 'part', 'share', 'idx']) d.body[k] = d.body[k].slice();
    d.hairDone = !!hair;
    self.postMessage({ id, data: d }, transferables(d));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
