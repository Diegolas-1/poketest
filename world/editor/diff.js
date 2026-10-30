// What changed between two bundles (a saved version and the draft, or two
// versions): pieces, added things, plants, ground tiles, roads, places, and
// every game file key by key. Used by the Versions window.
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function keysDiff(a = {}, b = {}) {
  const add = [], del = [], chg = [];
  for (const k of Object.keys(b)) if (!(k in a)) add.push(k); else if (!eq(a[k], b[k])) chg.push(k);
  for (const k of Object.keys(a)) if (!(k in b)) del.push(k);
  return { add, del, chg };
}
// where two JSON values differ: paths like people[delia]/schedule/sat/3
export function paths(a, b, at = '', out = [], max = 60) {
  if (out.length >= max || eq(a, b)) return out;
  const obj = (v) => v && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => obj(x) && x.id !== undefined) && b.every((x) => obj(x) && x.id !== undefined)) {
    const A = new Map(a.map((x) => [x.id, x])), B = new Map(b.map((x) => [x.id, x]));
    for (const [id, x] of B) if (!A.has(id)) out.push(`${at}[${id}] added`); else paths(A.get(id), x, `${at}[${id}]`, out, max);
    for (const id of A.keys()) if (!B.has(id)) out.push(`${at}[${id}] removed`);
    return out;
  }
  if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${at}/${k} added`); else if (!(k in b)) out.push(`${at}/${k} removed`); else paths(a[k], b[k], `${at}/${k}`, out, max);
    }
    return out;
  }
  out.push(`${at}: ${short(a)} → ${short(b)}`);
  return out;
}
const short = (v) => { const s = JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : s; };
export function diffBundles(A, B) {
  const a = A.doc || {}, b = B.doc || {}, out = [];
  const o = keysDiff(a.objects, b.objects);
  if (o.add.length + o.del.length + o.chg.length) out.push(['Pieces edited', [...o.add.map((k) => '+ ' + k), ...o.del.map((k) => '− ' + k + ' (back to generated)'), ...o.chg.map((k) => '~ ' + k)]]);
  const ad = keysDiff(Object.fromEntries((a.added || []).map((x) => [x.id, x])), Object.fromEntries((b.added || []).map((x) => [x.id, x])));
  if (ad.add.length + ad.del.length + ad.chg.length) out.push(['Pieces added by you', [...ad.add.map((k) => '+ ' + k), ...ad.del.map((k) => '− ' + k), ...ad.chg.map((k) => '~ ' + k)]]);
  const v = keysDiff(a.veg, b.veg), va = (b.vegAdd || []).length - (a.vegAdd || []).length;
  if (v.add.length + v.del.length + v.chg.length || va) out.push(['Plants', [`${v.add.length} moved or deleted, ${v.del.length} back to generated, ${v.chg.length} changed`, `${va >= 0 ? '+' : ''}${va} planted`]]);
  const t = keysDiff(A.tiles, B.tiles);
  if (t.add.length + t.del.length + t.chg.length) out.push(['Ground (64 m tiles)', [...t.add.map((k) => '+ ' + k), ...t.del.map((k) => '− ' + k), ...t.chg.map((k) => '~ ' + k)]]);
  const r = paths(a.roads, b.roads, 'roads');
  if (r.length) out.push(['Roads', r]);
  const p = keysDiff(a.places, b.places);
  if (p.add.length + p.del.length + p.chg.length) out.push(['Places', [...p.add, ...p.chg].map((k) => '~ ' + k)]);
  const files = new Set([...Object.keys(A.life || {}), ...Object.keys(B.life || {})]);
  for (const f of files) {
    const x = (A.life || {})[f], y = (B.life || {})[f];
    const pa = x ? x.data : y.base, pb = y ? y.data : x.base;
    const d = paths(pa, pb, '');
    if (d.length) out.push([f.includes('/') ? f : 'native/life/' + f, d]);
  }
  return out;
}
