// Bakes the web build's characters and gameplay data for the native (Godot) game.
// Each person is made by the web build (actor.js: Ash's model from
// web/world/local/ash.glb with ashcloth.js; the villagers from cast.js) in a
// headless browser and saved finished, in the rest pose, to native/cast/:
//   <look>.glb    the skinned model (one skeleton, cloth bones included) with
//                 its idle / walk / run clips (anims/ash.json, scaled to its legs)
//   cast.json     per look: material cel bands, decals, double sided, eye atlas,
//                 clip metadata (stride, lead); the villagers (spawn, lines,
//                 wander), the things to read (town.use), Oak's lab door,
//                 Route 1's road and the tall grass
// Run: node tools/native/bake_cast.mjs   (serves web/ on :8790 if nothing is there)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// playwright: $PLAYWRIGHT (its index.mjs), else the first of the usual installs that is there
const PW = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.mjs', '/opt/node22/lib/node_modules/playwright/index.mjs'].find((f) => f && fs.existsSync(f));
if (!PW) throw new Error('playwright not found: set PLAYWRIGHT to its index.mjs');
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/cast');
fs.mkdirSync(OUT, { recursive: true });

const PORT = process.env.WEB_PORT || '8790';   // (another copy of the repo may already serve 8790)
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/`)).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text().slice(0, 200)); });
await p.goto(`http://localhost:${PORT}/world/?test&q=high&outline=0`);
await p.waitForFunction(() => window.worldReady, null, { timeout: 300000 });
console.log('world ready');

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const A = await import('/world/actor.js');
  const CA = await import('/world/cast.js');
  const T = await import('/world/terrain.js');
  const N = await import('/world/nature.js');
  const w = window.world;
  const ex = new GLTFExporter();
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ash = await (await fetch('/world/anims/ash.json')).json();
  const ashClips = Object.fromEntries(ash.clips.map((c) => [c.name, THREE.AnimationClip.parse(c)]));
  const STD = new Set(['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight']);
  // ---- the cloth sim's layout, in the model's rest frame (= the skeleton's in Godot) ----
  // chains: { parent, bones, rest [[x, y, z]], ks, drag, damp, vmax, flut, cone, hangBone, hang, quad, coll }
  // coll: per particle a list of steps, in the web's order:
  //   ['c', cap]  out of a capsule          ['s', cap]  the link's points against it (legs at 3 points)
  //   ['r', bone, ring, pad]  out to a ring of the body's girth   ['m', bone, ring, pad]  the link's middle too
  //   ['h', shell] outside the jacket's shell   ['hs', shell] the link's middle too
  const r5 = (x) => Math.round(x * 1e5) / 1e5;
  const v3 = (v) => [r5(v.x), r5(v.y), r5(v.z)];
  function simOf(kit, isAsh) {
    const S = { chains: [], links: [], groups: [], caps: [], rings: [], shells: [], zc: 0.004, iter: 3 };
    if (!kit) return S;
    const capIx = new Map(), ringIx = new Map(), shellIx = new Map();
    const cap = (key, c) => { if (typeof key === 'object' && !(key instanceof Array)) key = JSON.stringify(c); if (!capIx.has(key)) { capIx.set(key, S.caps.length); S.caps.push(c); } return capIx.get(key); };
    const ring = (r) => { if (!ringIx.has(r)) { ringIx.set(r, S.rings.length); S.rings.push(r.map(r5)); } return ringIx.get(r); };
    const ashCap = (cp) => cap(cp, { bone: cp.bone, a: v3(cp.seg[0]), b: v3(cp.seg[1]), r0: r5(cp.r ?? cp.r0), r1: r5(cp.r ?? cp.r1), out: false, inn: false });
    const shell = (sh) => { if (!shellIx.has(sh)) { shellIx.set(sh, S.shells.length); S.shells.push({ bone: sh.bone, pad: sh.pad, ys: sh.ys.map(r5), rings: sh.rings.map((r) => r.map(r5)) }); } return shellIx.get(sh); };
    if (!isAsh) for (const n in kit.caps) { const c = kit.caps[n]; cap(n, { bone: c.bone, a: v3(c.a), b: v3(c.b), r0: r5(c.r0), r1: r5(c.r1), out: !!c.out, inn: !!c.inn }); }
    for (const c of kit.chains) {
      const coll = c.coll.map((k) => {
        const ops = [];
        if (isAsh) {
          if (k.shell) { ops.push(['h', shell(k.shell)]); if (k.segShell) ops.push(['hs', shell(k.shell)]); }
          for (const cp of k.pre || []) ops.push(['c', ashCap(cp)]);
          for (const cp of k.segPre || []) ops.push(['s', ashCap(cp)]);
          if (k.ring) {
            ops.push(['r', k.bone, ring(k.ring), k.pad]);
            for (const cp of k.caps || []) ops.push(['c', ashCap(cp)]);
            if (k.mid) ops.push(['m', k.mid.bone, ring(k.mid.ring), k.mid.pad]);
          } else if (k.axis) ops.push(['c', cap(k, { bone: k.bone, a: v3(k.axis[0]), b: v3(k.axis[1]), r0: k.r, r1: k.r, out: false, inn: false })]);
        } else {
          for (const n of k.caps) ops.push(['c', capIx.get(n)]);
          for (const n of k.seg) ops.push(['s', capIx.get(n)]);
          if (k.ring) ops.push(['r', k.ring.bone, ring(k.ring.ring), k.ring.pad]);
          if (k.mid) ops.push(['m', k.mid.bone, ring(k.mid.ring), k.mid.pad]);
          for (const n of k.after || []) ops.push(['c', capIx.get(n)]);
        }
        return ops;
      });
      S.chains.push({ parent: c.parent, bones: c.bones, rest: c.rest.map(v3), ks: c.ks, drag: c.drag, damp: c.damp ?? 2, vmax: c.vmax ?? 3,
        flut: c.flut, cone: c.cone, hangBone: c.hangBone || '', hang: c.hang || [], quad: !!c.quad, coll });
    }
    // links between neighbouring panels (particle indices from 0) and the panel groups smoothed together
    if (isAsh) { for (const [a0, k0, b0, k1, L] of kit.links) S.links.push([a0, k0 - 1, b0, k1 - 1, r5(L)]); S.groups.push([0, kit.panels, false]); }
    else { for (const [a0, k0, b0, k1, L] of kit.links) S.links.push([a0, k0, b0, k1, r5(L)]); for (const g of kit.groups) S.groups.push([g.from, g.n, g.loop]); }
    return S;
  }
  // ---- hair: bone chains added to a hanging part of the hair, simulated like the cloth ----
  // (pts: the chain's joints in the rest frame, root first; sOf(p): where a vertex sits along
  // it, 0 at the root .. n at the tip, or null to leave it as it is)
  function addChain(mesh, tag, parent, pts, sOf, root = 0.5) {
    const sk = mesh.skeleton, pi = sk.bones.findIndex((b) => b.name === parent);
    const nb = [], ninv = [];
    let par = sk.bones[pi], parInv = sk.boneInverses[pi];
    for (let k = 0; k < pts.length - 1; k++) {
      const b = new THREE.Bone(); b.name = `hr${tag}${k}`;
      parInv.clone().multiply(new THREE.Matrix4().makeTranslation(pts[k].x, pts[k].y, pts[k].z)).decompose(b.position, b.quaternion, b.scale);
      par.add(b); nb.push(b);
      const inv = new THREE.Matrix4().makeTranslation(-pts[k].x, -pts[k].y, -pts[k].z);
      ninv.push(inv); par = b; parInv = inv;
    }
    const base = sk.bones.length, n = nb.length;
    mesh.skeleton = new THREE.Skeleton([...sk.bones, ...nb], [...sk.boneInverses, ...ninv]);
    const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, p = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      const s = sOf(p); if (s == null) continue;
      const hw = 1 - THREE.MathUtils.smoothstep(s, 0, root), f = Math.min(n - 1, Math.max(0, s - 0.5)), b0 = Math.floor(f), u = f - b0, b1 = Math.min(n - 1, b0 + 1);
      const m = {};
      for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > 0) m[SI.getComponent(i, c)] = (m[SI.getComponent(i, c)] || 0) + w * hw; }
      m[base + b0] = (m[base + b0] || 0) + (1 - hw) * (1 - u); m[base + b1] = (m[base + b1] || 0) + (1 - hw) * u;
      const e = Object.entries(m).filter(([, w]) => w > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4), tot = e.reduce((x, [, w]) => x + w, 0);
      for (let c = 0; c < 4; c++) { SI.setComponent(i, c, e[c] ? +e[c][0] : 0); SW.setComponent(i, c, e[c] ? e[c][1] / tot : 0); }
    }
    SI.needsUpdate = SW.needsUpdate = true;
    return nb.map((b) => b.name);
  }
  // where along a polyline a point is nearest: segment index + fraction
  const along = (pts, p) => {
    let best = 1e9, s = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], ab = pts[k + 1].clone().sub(a), u = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
      const d = p.distanceToSquared(a.clone().addScaledVector(ab, u)); if (d < best) { best = d; s = k + u; }
    }
    return s;
  };
  const boxOf = (m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.clone(); };
  function addHair(holder, look, S) {
    const meshes = {}; holder.traverse((o) => { if (o.isSkinnedMesh) meshes[o.name] = o; });
    const hair = meshes.hair01_on; if (!hair) return;
    // the head as a sphere (from the hair round it) and the neck and upper back, for the hair to clear
    const hb = boxOf(hair), hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3());
    const head = S.caps.length;
    S.caps.push({ bone: 'Head', a: v3(hc.clone().setY(hc.y + 0.02)), b: v3(hc.clone().setY(hc.y - 0.03)), r0: r5(Math.min(hs.x, hs.z) * 0.47), r1: r5(Math.min(hs.x, hs.z) * 0.4), out: false, inn: false });
    S.caps.push({ bone: 'Neck', a: [0, r5(hb.min.y + 0.03), -0.012], b: [0, r5(hb.min.y - 0.06), -0.015], r0: 0.045, r1: 0.05, out: false, inn: false });
    S.caps.push({ bone: 'Spine3', a: [-0.05, 1.0, -0.012], b: [0.05, 1.0, -0.012], r0: 0.075, r1: 0.075, out: false, inn: false });
    S.caps.push({ bone: 'Spine2', a: [0, 0.93, -0.004], b: [0, 0.84, 0.0], r0: 0.08, r1: 0.085, out: false, inn: false });
    const body = [['c', head], ['s', head], ['c', head + 1], ['c', head + 2], ['c', head + 3]];
    const chain = (o) => { const { pts, ...r } = o; S.chains.push({ hair: true, hangBone: '', hang: [], quad: false, damp: 3, vmax: 4, flut: 0.25, coll: pts.slice(1).map(() => body), ...r, rest: pts.map(v3) }); };
    if (meshes.ponytail) {
      // the girl's ponytail: four links down its middle (slices of its vertices by height)
      const m = meshes.ponytail, P = m.geometry.attributes.position, b = boxOf(m), N = 5, pts = [];
      const top = b.max.y - 0.03, bot = b.min.y + 0.004;
      for (let k = 0; k < N; k++) {
        const y = top + (bot - top) * k / (N - 1), c = new THREE.Vector3(); let w = 0;
        for (let i = 0; i < P.count; i++) { const py = P.getY(i), d = Math.abs(py - y); if (d < 0.02) { const ww = 1 - d / 0.02; c.x += P.getX(i) * ww; c.y += py * ww; c.z += P.getZ(i) * ww; w += ww; } }
        pts.push(c.divideScalar(w || 1));
      }
      pts[N - 1].y = bot;
      const bones = addChain(m, 'T', 'Head', pts, (p) => along(pts, p), 0.7);
      chain({ parent: 'Head', bones, pts, ks: [44, 36, 30, 26], drag: [0.45, 0.5, 0.55, 0.6], cone: [0.4, 0.45, 0.5, 0.55], flut: 0.3, damp: 4.5 });
    }
    // spiky hair (Ash's under the cap, Oak's swept back): a ring of short stiff chains round
    // the back half of the head; each spike goes with the chains either side of it by its
    // direction, more the further out it reaches, so the spikes bounce a little as one
    const spiky = { ash: ['ash_extra', 1.27, 70, 0.22], oak: ['parts', 9, 60, 0.26] }[look];
    if (spiky && meshes[spiky[0]]) {
      const m = meshes[spiky[0]], P = m.geometry.attributes.position, SI = m.geometry.attributes.skinIndex, SW = m.geometry.attributes.skinWeight;
      const cz = hc.z, cy = hc.y - 0.01, r0 = Math.min(hs.x, hs.z) * 0.42, NS = 7, A0 = Math.PI * 0.42, A1 = Math.PI * 1.58;
      const ang = (p) => { let a = Math.atan2(p.x, p.z - cz); if (a < 0) a += 2 * Math.PI; return a; };
      // each chain from the head's surface out along the spikes there (their mean reach)
      const sums = Array.from({ length: NS }, () => [new THREE.Vector3(), 0]), p = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i); if (p.y > spiky[1]) continue;
        const a = ang(p); if (a < A0 || a > A1) continue;
        const j = Math.round((a - A0) / (A1 - A0) * (NS - 1)), d = p.clone().sub(new THREE.Vector3(0, cy, cz));
        if (d.length() < r0) continue;
        sums[j][0].add(d); sums[j][1]++;
      }
      const base = m.skeleton.bones.length, newB = [], newI = [], hi = m.skeleton.bones.findIndex((b) => b.name === 'Head'), hInv = m.skeleton.boneInverses[hi];
      const chainsAt = [];
      for (let j = 0; j < NS; j++) {
        const a = A0 + (A1 - A0) * j / (NS - 1), dir = sums[j][1] ? sums[j][0].clone().normalize() : new THREE.Vector3(Math.sin(a), -0.3, Math.cos(a)).normalize();
        const root = new THREE.Vector3(0, cy, cz).addScaledVector(dir, r0), tip = root.clone().addScaledVector(dir, 0.07);
        const b = new THREE.Bone(); b.name = `hrS${j}`;
        hInv.clone().multiply(new THREE.Matrix4().makeTranslation(root.x, root.y, root.z)).decompose(b.position, b.quaternion, b.scale);
        m.skeleton.bones[hi].add(b); newB.push(b); newI.push(new THREE.Matrix4().makeTranslation(-root.x, -root.y, -root.z));
        chainsAt.push([root, tip]);
      }
      m.skeleton = new THREE.Skeleton([...m.skeleton.bones, ...newB], [...m.skeleton.boneInverses, ...newI]);
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i); if (p.y > spiky[1]) continue;
        const a = ang(p); if (a < A0 - 0.3 || a > A1 + 0.3) continue;
        const reach = p.distanceTo(new THREE.Vector3(0, cy, cz)) - r0;
        const k = THREE.MathUtils.smoothstep(reach, 0.005, 0.07) * THREE.MathUtils.smoothstep(a, A0 - 0.3, A0) * (1 - THREE.MathUtils.smoothstep(a, A1, A1 + 0.3));
        if (k <= 0) continue;
        const f = Math.min(NS - 1, Math.max(0, (a - A0) / (A1 - A0) * (NS - 1))), j0 = Math.min(NS - 2, Math.floor(f)), u = f - j0;
        const w = {};
        for (let c = 0; c < 4; c++) { const ww = SW.getComponent(i, c); if (ww > 0) w[SI.getComponent(i, c)] = (w[SI.getComponent(i, c)] || 0) + ww * (1 - k); }
        w[base + j0] = (w[base + j0] || 0) + k * (1 - u); w[base + j0 + 1] = (w[base + j0 + 1] || 0) + k * u;
        const e = Object.entries(w).filter(([, x]) => x > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4), tot = e.reduce((x, [, v]) => x + v, 0);
        for (let c = 0; c < 4; c++) { SI.setComponent(i, c, e[c] ? +e[c][0] : 0); SW.setComponent(i, c, e[c] ? e[c][1] / tot : 0); }
      }
      SI.needsUpdate = SW.needsUpdate = true;
      const from = S.chains.length;
      chainsAt.forEach(([root, tip], j) => chain({ parent: 'Head', bones: [`hrS${j}`], pts: [root, tip], ks: [spiky[2]], drag: [0.35], cone: [spiky[3]], damp: 7, vmax: 2, flut: 0.15, coll: [[['c', head]]] }));
      // the spikes keep together: neighbours linked, smoothed as one row
      for (let j = 0; j < NS - 1; j++) S.links.push([from + j, 0, from + j + 1, 0, r5(chainsAt[j][1].distanceTo(chainsAt[j + 1][1]))]);
      S.groups.push([from, NS, false]);
    }
    if (!S.chains.some((c) => c.hair)) S.caps.length = head;   // (no hair chains: no head capsules)
  }
  const out = { looks: {}, glb: {} };
  // every look made on the base model: Ash, Prof. Oak and the townspeople (actor.js TOWNSFOLK)
  for (const look of ['ash', 'oak', ...A.TOWNSFOLK]) {
    const a = A.makeActor(A.LOOKS[look]);
    for (let i = 0; i < 600 && !a.model; i++) await sleep(50);
    if (!a.model) throw new Error('no model for ' + look);
    const holder = a.model;
    // the moving cloth: the sim's layout (ashcloth.js / garments.js clothSim), and the hair
    // chains added here (the web keeps hair rigid on the head)
    const sim = simOf(a.cloth && a.cloth.kit, look === 'ash');
    addHair(holder, look, sim);
    const anims = look === 'ash' ? { clips: ashClips, meta: ash.meta } : (await CA.castReady(null, look)).anims;
    // plain materials: colour + texture; the cel profile and flags go to cast.json
    const mats = [], seen = new Map();
    holder.traverse((o) => {
      if (!o.isMesh) return;
      for (const k of Object.keys(o.geometry.attributes)) if (!STD.has(k)) { o.geometry = o.geometry.clone(); break; }
      for (const k of Object.keys(o.geometry.attributes)) if (!STD.has(k)) o.geometry.deleteAttribute(k);
      const m = o.material;
      if (!seen.has(m)) {
        const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
        const ci = key.lastIndexOf('cel{');
        let cel = null; try { cel = ci >= 0 ? JSON.parse(key.slice(ci + 3)) : null; } catch { cel = null; }
        const i = mats.length;
        const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors, side: m.side, alphaTest: m.alphaTest || 0, roughness: 1, metalness: 0 });
        if (n.map) { n.map = n.map.clone(); if (m.name === 'face_on_0') n.map.offset.x = 0; }   // the eye atlas: open eyes (blinking moves it by 0.5)
        n.name = 'c' + i;
        mats.push({ src: m.name || '', cel, ds: m.side === THREE.DoubleSide, alpha: m.alphaTest || 0, blend: !!m.transparent, decal: !!m.polygonOffset, vc: !!m.vertexColors, eyes: m.name === 'face_on_0', shadow: o.castShadow, ink: o.userData.outline !== false });
        seen.set(m, n);
      }
      o.material = seen.get(m);
    });
    const glb = await new Promise((ok, bad) => ex.parse(holder, (r) => ok(new Uint8Array(r)), bad, { binary: true, animations: Object.values(anims.clips), onlyVisible: false }));
    out.glb[look] = b64(glb);
    out.looks[look] = { mats, meta: anims.meta, scale: holder.scale.x, y0: holder.position.y, sim };
  }
  // villagers as main.js places them
  const LOOK_OF = { Girl: 'girl', Fisher: 'fisher', Kid: 'kid', 'Prof. Oak': 'oak' };
  out.npcs = w.npcs.map((n) => ({ look: LOOK_OF[n.name], name: n.name, x: n.home.x, z: n.home.z, yaw: n.yaw, wander: n.wander, lines: n.lines }));
  out.use = w.town.use.map((u) => ({ x: +u.x.toFixed(3), z: +u.z.toFixed(3), r: u.r, label: u.label, lines: u.lines }));
  out.labDoor = w.town.labDoor;
  out.road = T.ROADS[0].map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]);
  out.tallGrass = N.TALL_GRASS;
  return out;
});

for (const [k, v] of Object.entries(res.glb)) {
  fs.writeFileSync(path.join(OUT, k + '.glb'), Buffer.from(v, 'base64'));
  console.log(k + '.glb', (fs.statSync(path.join(OUT, k + '.glb')).size / 1048576).toFixed(2), 'MB');
}
delete res.glb;
fs.writeFileSync(path.join(OUT, 'cast.json'), JSON.stringify(res));
console.log('npcs', res.npcs.length, 'use', res.use.length);
await b.close();
