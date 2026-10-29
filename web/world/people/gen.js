// The generator's entry points (no three.js: runs on the page, in a worker and in node).
//   loadBase(url)            the base body (base.bin, tools/people/build_base.mjs)
//   buildBody(params, o)     a person's body: anatomy (skeleton, landmarks), its field,
//                            and the base fitted to it (or, with o.direct, meshed straight
//                            from the field: slow, for checking the base)
import { anatomy, posed } from './anatomy.js';
import { compile } from './sdf.js';
import { surfaceNets, project, relax, dropSpecks, normals, neighbours } from './mesh.js';
import { fit } from './fit.js';
import { unpackBase } from './base.js';
import { BONE_NAMES } from './rig.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let BASE = null;

export async function loadBase(url = new URL('./base.bin', import.meta.url)) {
  if (BASE) return BASE;
  const ab = typeof fetch !== 'undefined' && !String(url).startsWith('file:')
    ? await (await fetch(url)).arrayBuffer()
    : (await import('node:fs')).readFileSync(new URL(url)).buffer;
  return setBase(unpackBase(ab instanceof ArrayBuffer ? ab : ab.slice(0)));
}
export function setBase(b) {
  b.nb = neighbours({ pos: b.pos, idx: b.idx });
  BASE = b;
  return b;
}
export const base = () => BASE;

export function buildBody(params, o = {}) {
  const t0 = now();
  const anat = anatomy(params);
  const field = compile(posed(anat.tree, anat.ad));
  let mesh;
  if (o.direct || !BASE) {
    mesh = surfaceNets(field.f, field.box, o.cell || 0.005);
    mesh = dropSpecks(mesh, 30);
    project(mesh, field.f, 3);
    relax(mesh, 2, 0.5, field.f);
    mesh.nrm = normals(mesh);
  } else {
    mesh = fit(BASE, anat, field, { names: BONE_NAMES, relax: o.relax, steps: o.steps });
    mesh.skin = BASE.skin; mesh.wts = BASE.wts; mesh.part = BASE.part; mesh.share = BASE.share; mesh.canon = BASE.pos;
  }
  return { anat, mesh, field, ms: Math.round(now() - t0) };
}
