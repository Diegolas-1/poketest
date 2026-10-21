// A stylized person built from smooth shapes with soft anime shading and an
// outline, animated by speed: idle breathing, walk, run and jump.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// three-step toon ramp for the soft anime look
const ramp = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const toon = (c) => new THREE.MeshToonMaterial({ color: new THREE.Color(c), gradientMap: ramp });
const LINE = new THREE.MeshBasicMaterial({ color: '#2a2230', side: THREE.BackSide });

function part(geo, color, parent, x = 0, y = 0, z = 0, outline = 0.025) {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(x, y, z); m.castShadow = true;
  parent.add(m);
  if (outline) {
    const o = new THREE.Mesh(geo, LINE);
    o.scale.setScalar(1 + outline / Math.max(0.05, geo.boundingSphere ? geo.boundingSphere.radius : 0.2));
    m.add(o);
  }
  return m;
}
const cap = (r, h) => { const g = new THREE.CapsuleGeometry(r, h, 6, 12); g.computeBoundingSphere(); return g; };
const ball = (r, s = 16) => { const g = new THREE.SphereGeometry(r, s, s * 0.75); g.computeBoundingSphere(); return g; };
const rb = (w, h, d, r) => { const g = new RoundedBoxGeometry(w, h, d, 3, r); g.computeBoundingSphere(); return g; };

// look: { skin, hair, top, top2, pants, shoes, hat, hat2, bag, hairStyle, coat }
export function makeActor(look) {
  const L = { skin: '#f6d2b0', hair: '#2a2028', top: '#e2443c', top2: '#f4f1ea', pants: '#3b5aa0', shoes: '#e9ecef', hat: null, hat2: '#ffffff', bag: null, hairStyle: 'short', coat: false, ...look };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.82; body.add(hips);
  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.11, 0, 0); hips.add(hip);
    part(cap(0.075, 0.36), L.pants, hip, 0, -0.22, 0);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    part(cap(0.07, 0.3), L.pants, knee, 0, -0.18, 0);
    part(rb(0.15, 0.1, 0.26, 0.04), L.shoes, knee, 0, -0.38, 0.04);
    legs.push({ hip, knee });
  }
  // torso
  const chest = new THREE.Group(); chest.position.y = 0.05; hips.add(chest);
  part(rb(0.4, 0.5, 0.25, 0.1), L.top, chest, 0, 0.25, 0);
  part(rb(0.3, 0.12, 0.27, 0.05), L.top2, chest, 0, 0.45, 0.005, 0);   // collar
  if (L.coat) part(rb(0.46, 0.62, 0.3, 0.1), L.coat, chest, 0, 0.18, -0.01);
  // backpack
  if (L.bag) {
    part(rb(0.32, 0.36, 0.16, 0.06), L.bag, chest, 0, 0.26, -0.2);
    part(rb(0.24, 0.12, 0.05, 0.02), '#f4f1ea', chest, 0, 0.2, -0.29, 0);
  }
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.44, 0); chest.add(sh);
    part(cap(0.06, 0.24), L.coat || L.top, sh, 0, -0.16, 0);
    const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
    part(cap(0.055, 0.2), L.coat ? L.coat : L.skin, el, 0, -0.12, 0);
    part(ball(0.06, 10), L.skin, el, 0, -0.27, 0);
    arms.push({ sh, el, s });
  }
  // head
  const neck = new THREE.Group(); neck.position.y = 0.55; chest.add(neck);
  const head = new THREE.Group(); head.position.y = 0.22; neck.add(head);
  part(ball(0.2, 24), L.skin, head, 0, 0, 0, 0.012);
  // hair
  const hair = part(ball(0.215, 20), L.hair, head, 0, 0.04, -0.03, 0.012);
  hair.scale.set(1, 0.92, 1);
  if (L.hairStyle === 'long') { part(cap(0.12, 0.3), L.hair, head, 0, -0.18, -0.12); }
  if (L.hairStyle === 'pony') { const p = part(cap(0.07, 0.22), L.hair, head, 0, -0.08, -0.24); p.rotation.x = 0.5; }
  if (L.hairStyle === 'grey') hair.scale.set(1.02, 0.85, 1.02);
  // face: eyes with a highlight, a little blush
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.035, 4, 8), new THREE.MeshBasicMaterial({ color: '#2a2230' }));
    eye.position.set(s * 0.075, 0.0, 0.185); head.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    hl.position.set(s * 0.075 + 0.008, 0.018, 0.205); head.add(hl);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshBasicMaterial({ color: '#f29a9a', transparent: true, opacity: 0.45 }));
    blush.position.set(s * 0.12, -0.06, 0.17); blush.rotation.y = s * 0.5; head.add(blush);
  }
  // hat (a cap with a brim)
  if (L.hat) {
    const crown = part(new THREE.SphereGeometry(0.225, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), L.hat, head, 0, 0.06, -0.01, 0.012);
    crown.geometry.computeBoundingSphere();
    part(rb(0.2, 0.09, 0.03, 0.01), L.hat2, head, 0, 0.17, 0.19, 0);
    const brim = part(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), L.hat, head, 0, 0.075, 0.15, 0.01);
    brim.geometry.computeBoundingSphere();
  }
  // shadow blob
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
  blob.position.y = 0.02; root.add(blob);

  let phase = 0;
  const actor = {
    root, head, blob,
    // speed in m/s, air = true while jumping
    animate(dt, speed, air, t) {
      const run = Math.min(1, speed / 7);
      phase += dt * (speed > 0.1 ? 2.2 + speed * 1.15 : 0);
      const sw = speed > 0.1 ? Math.min(1, speed / 3) : 0;
      const a = Math.sin(phase) * (0.55 + run * 0.35) * sw;
      legs[0].hip.rotation.x = air ? -0.6 : a;
      legs[1].hip.rotation.x = air ? 0.3 : -a;
      legs[0].knee.rotation.x = air ? 0.9 : Math.max(0, -Math.sin(phase + 0.6)) * (0.7 + run * 0.5) * sw;
      legs[1].knee.rotation.x = air ? 0.4 : Math.max(0, Math.sin(phase + 0.6)) * (0.7 + run * 0.5) * sw;
      for (const arm of arms) {
        arm.sh.rotation.x = air ? -1.2 : -a * arm.s * -1 * (arm.s > 0 ? 1 : -1) * 0.9;
        arm.sh.rotation.z = arm.s * (air ? 0.5 : 0.08 + run * 0.05);
        arm.el.rotation.x = -0.25 - run * 0.9 * sw;
      }
      arms[0].sh.rotation.x = air ? -1.2 : -a * 0.9;
      arms[1].sh.rotation.x = air ? -1.2 : a * 0.9;
      const bob = speed > 0.1 ? Math.abs(Math.sin(phase)) * 0.05 * sw : Math.sin(t * 2) * 0.008;
      hips.position.y = 0.82 + bob;
      chest.rotation.x = run * 0.22 * sw;
      head.rotation.x = -run * 0.12 * sw;
      chest.rotation.y = Math.sin(phase) * 0.12 * sw;
    },
  };
  return actor;
}

export const LOOKS = {
  red: { top: '#e2443c', top2: '#f4f1ea', pants: '#34508f', shoes: '#f0f2f4', hat: '#e2443c', hat2: '#ffffff', bag: '#f2c14e', hair: '#2a2028' },
  girl: { top: '#f39ab8', top2: '#ffffff', pants: '#f3e3c8', shoes: '#c45a7a', hair: '#7a3e2a', hairStyle: 'pony', bag: null },
  fisher: { top: '#3f7f9f', top2: '#f4e7c8', pants: '#5a5a4f', shoes: '#3a3030', hat: '#e9d9a8', hat2: '#e9d9a8', hair: '#4a3a30' },
  oak: { top: '#8a6a4f', top2: '#e9e2d6', pants: '#7a6a5a', shoes: '#4a3428', hair: '#c9c4bc', hairStyle: 'grey', coat: '#f4f4f0' },
  kid: { top: '#7fc97f', top2: '#ffffff', pants: '#4f6fa0', shoes: '#ffd23f', hair: '#3a2a20', bag: '#5fa8d3' },
};
