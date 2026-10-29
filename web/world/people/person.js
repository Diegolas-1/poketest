// A generated person as three.js objects: the body and everything they wear as
// skinned meshes on one skeleton (rig.js) in its A pose (the bind pose), cel
// shaded like the rest of the game (toon.js), outlined by the ink pass
// (outline.js); the game's clips (anims/ash.json) play on it.
//
// A look: { body: anatomy sliders (anatomy.js SLIDERS), skin: { tone, ... },
// underwear: { style, color, trim }, face: {...} (skin.js), hair: {...} (hair.js),
// outfit: [{ id, colourway, colors, params, pattern }] (outfit.js, catalog.json) }
import * as THREE from 'three';
import { buildBody, loadBase, base } from './gen.js';
import { anatomy, posed } from './anatomy.js';
import { compile } from './sdf.js';
import { buildData, lookOf } from './build.js';
import { BONE_NAMES, PARENT, NB } from './rig.js';
import { skinMaterial } from './skin.js';
import { clothMaterial } from './paint.js';
import { context } from './wear.js';
import * as HAIR from './hair.js';

// bones for a skeleton (local positions sk.t, rotations q)
export function makeBones(sk, q) {
  const bones = [];
  for (let i = 0; i < NB; i++) {
    const b = new THREE.Bone(); b.name = BONE_NAMES[i];
    b.position.fromArray(sk.t[i]); b.quaternion.fromArray(q[i]);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
    bones.push(b);
  }
  return bones;
}

export function geometryOf(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.nrm, 3));
  if (mesh.skin) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(mesh.skin instanceof Uint16Array ? mesh.skin : Uint16Array.from(mesh.skin), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(mesh.wts, 4));
  }
  for (const [k, w] of [['canon', 3], ['part', 4], ['share', 4], ['gco', 4]]) if (mesh[k]) g.setAttribute(k, new THREE.BufferAttribute(mesh[k], w));
  g.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  return g;
}

let CLIPS = null, CATALOG = null;
export async function loadClips() {
  if (CLIPS) return CLIPS;
  try {
    const j = await (await fetch(new URL('../anims/ash.json', import.meta.url))).json();
    CLIPS = { meta: j.meta, clips: j.clips.map((c) => THREE.AnimationClip.parse(c)) };
  } catch { CLIPS = { meta: {}, clips: [] }; }
  return CLIPS;
}
export async function loadCatalog() {
  if (!CATALOG) CATALOG = await (await fetch(new URL('./catalog.json', import.meta.url))).json();
  return CATALOG;
}
// the clips fitted to a person: the waist's bob and sway scaled to their leg length
const CLIP_WAIST = 0.712;
export function clipsFor(waistY) {
  if (!CLIPS) return [];
  const k = waistY / CLIP_WAIST;
  return CLIPS.clips.map((c) => {
    const cc = c.clone();
    for (const t of cc.tracks) if (t.name === 'Waist.position') { t.values = t.values.slice(); for (let i = 0; i < t.values.length; i++) t.values[i] *= k; }
    return cc;
  });
}

export { lookOf };

// ---------- building ----------
// the worker (worker.js) that builds people off the page's thread, made on first use
let WORKER = null, wid = 0;
const waiting = new Map();
function worker() {
  if (WORKER === null) {
    try {
      WORKER = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      WORKER.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); e.data.error ? w.reject(new Error(e.data.error)) : w.resolve(e.data.data); };
      WORKER.onerror = (e) => { for (const w of waiting.values()) w.reject(e); waiting.clear(); WORKER = false; };
    } catch { WORKER = false; }
  }
  return WORKER || null;
}
// a person's data (build.js), in the worker when o.worker (and there is one), else here
export async function personData(look, o = {}) {
  const w = o.worker ? worker() : null;
  if (w) {
    try { return await new Promise((resolve, reject) => { const id = ++wid; waiting.set(id, { resolve, reject }); w.postMessage({ id, look }); }); }
    catch (e) { console.warn('people worker failed, building on the page', e); }
  }
  await loadBase();
  const cat = look.outfit && look.outfit.length ? await loadCatalog() : null;
  return buildData(look, { base: base(), catalog: cat, hair: null });
}

// makePerson(look, { worker, anim }) -> { root, body, meshes, bones, skeleton, anat, H, look, missing, stats, mixer?, play?, dispose }
export async function makePerson(input = {}, o = {}) {
  const look = lookOf(input);
  if (o.direct) return makeDirect(look, o);
  const d = await personData(look, o);
  return assemble(d, look, o);
}

export async function assemble(d, look, o = {}) {
  const A = d.anat, root = new THREE.Group();
  const person = { root, anat: A, H: A.H, look, meshes: [], missing: d.missing, data: d };
  const g = geometryOf(d.body);
  g.setAttribute('hide', new THREE.BufferAttribute(d.body.hide, 1));
  if (!base()) await loadBase();
  const bodyMat = skinMaterial(look, base().land);
  const bones = makeBones({ t: A.t }, A.aq);
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const add = (geo, mat, name) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    root.add(m); m.bind(skeleton);
    person.meshes.push(m);
    return m;
  };
  person.body = add(g, bodyMat, 'body');
  for (const w of d.worn) {
    const mat = clothMaterial({ colors: w.paint.colors, glsl: w.paint.glsl, params: w.paint.params, double: w.double, inside: w.paint.inside });
    const m = add(geometryOf(w.mesh), mat, w.item.id);
    m.userData.item = w.item; m.userData.slot = w.slot;
  }
  // hair: built with the rest when a pure hair builder exists (hairgen.js), else here
  let hairMs = 0;
  if (look.hair) {
    const t = performance.now();
    let hair = [];
    try {
      if (d.hair && HAIR.hairMaterial) hair = d.hair.map((h) => ({ piece: { mesh: h.mesh }, material: HAIR.hairMaterial(h.paint) }));
      else {
        // the field and fitting context are made again here (cheap) for the hair builder
        const ctx = d._ctx || contextFromData(d, look);
        const hatOn = d.worn.some((w) => w.slot === 'hat');
        hair = HAIR.buildHair(ctx, look.hair, { hatOn, look }) || [];
      }
    } catch (e) { console.warn('hair', e); }
    for (const h of hair) if (h && h.piece) { const m = add(geometryOf(h.piece.mesh), h.material, 'hair'); m.userData.slot = 'hair'; }
    hairMs = Math.round(performance.now() - t);
  }
  person.bones = bones; person.skeleton = skeleton;
  // the A pose with relaxed hands (fingers a little curled, the thumb in): what to show when no clip plays
  person.restPose = (curl = 1) => restPose(person, curl);
  restPose(person);
  person.stats = `${(A.H * 100).toFixed(0)}cm ${d.body.pos.length / 3}v body ${d.ms.body}ms` + (d.ms.dress !== undefined ? ` +${d.worn.length} pieces ${d.ms.dress}ms` : '') + (look.hair ? ` hair ${d.ms.hair ?? hairMs}ms` : '');
  if (o.anim) {
    await loadClips();
    const mixer = new THREE.AnimationMixer(root), clips = clipsFor(A.waistY);
    person.mixer = mixer; person.clips = clips;
    person.play = (name) => { mixer.stopAllAction(); const c = clips.find((x) => x.name === name); if (c) mixer.clipAction(c).play(); };
  }
  person.dispose = () => { for (const m of person.meshes) { m.geometry.dispose(); m.material.dispose(); } };
  return person;
}
// fingers curl about their own z axis (towards the palm: - on the left hand, + on the right)
const CURL = { 1: 0.22, 2: 0.32, 3: 0.24 }, FINGER = /^(L|R)Finger([A-D])([123])$/;
const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _y = new THREE.Vector3(0, 1, 0);
export function restPose(person, curl = 1) {
  const aq = person.anat.aq;
  person.bones.forEach((b, i) => {
    b.quaternion.fromArray(aq[i]);
    const m = FINGER.exec(b.name); if (!m || !curl) return;
    const s = m[1] === 'L' ? -1 : 1, seg = +m[3];
    if (m[2] === 'A') b.quaternion.multiply(_q.setFromAxisAngle(_y, s * -0.12 * curl * seg));
    else b.quaternion.multiply(_q.setFromAxisAngle(_z, s * CURL[seg] * curl * (m[2] === 'B' ? 0.8 : m[2] === 'D' ? 1.15 : 1)));
  });
}

function contextFromData(d, look) {
  const anat = anatomy(look.body || {}), field = compile(posed(anat.tree, anat.ad));
  const mesh = { ...d.body };
  return context({ anat, mesh, field }, base());
}

// meshed straight from the field (no base, nothing worn): for checking the base itself
async function makeDirect(look, o) {
  const b = buildBody(look.body || {}, o), A = b.anat, root = new THREE.Group();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.mesh.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(b.mesh.nrm, 3)); g.setIndex(new THREE.BufferAttribute(b.mesh.idx, 1));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#f6d2b8' })); m.castShadow = true; root.add(m);
  return { root, body: m, meshes: [m], anat: A, H: A.H, look, stats: `${(A.H * 100).toFixed(0)}cm ${b.mesh.pos.length / 3}v ${b.ms}ms (direct)`, dispose: () => { g.dispose(); m.material.dispose(); } };
}
