// Spaces in the web build: an interior (a map blueprint built by interior.js)
// shown on its own scene behind a door, as in the native game (main.gd
// enter_space): a fade to black, the outdoor scene is no longer drawn or
// updated, the player stands inside, walking uses the blueprint's walk grid
// per level (stairs join the levels), the camera stays inside the camera
// volumes, things inside can be looked at, and the door portal leads back.
//
//   const sp = createSpaces({ renderer, me, player, makeOak, dialog, banner })
//   sp.enter(id, spawn) / sp.leave(outside) / sp.active / sp.scene
//   sp.groundAt(x, z) / sp.step(obj, dx, dz) / sp.nearby(me) / sp.camera(dt, cam, camera) / sp.update(dt, t)
import * as THREE from 'three';
import { F, camInside } from './maps/format.js';
import { addEdgeLines } from './outline.js';
import { SUN_I } from './toon.js';

export function createSpaces({ me, player, makeOak, dialog, banner, onLeave }) {
  const S = { active: false, scene: null, busy: false, level: 0 };
  let I = null, sp = null, oak = null, raw = null;
  // the fade: a black sheet over the page
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9;transition:opacity .32s ease';
  document.body.appendChild(veil);
  const fade = (mid) => {
    S.busy = true; veil.style.opacity = '1';
    setTimeout(async () => { await mid(); setTimeout(() => { veil.style.opacity = '0'; S.busy = false; }, 80); }, 340);
  };

  const cell = (x, z) => { const g = sp.grid, i = Math.floor((x - g.x0) / g.res), j = Math.floor((z - g.z0) / g.res); return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i; };
  const flagAt = (x, z, L) => { const k = cell(x, z); return k < 0 ? 0 : raw.FL[L][k]; };
  const hAt = (x, z, L) => { const k = cell(x, z); return k < 0 || !(raw.FL[L][k] & F.OPEN) ? sp.levels[L].y : raw.H[L][k] / 100; };
  S.groundAt = (x, z) => hAt(x, z, S.level);
  const ok = (x, z, from) => { const f = flagAt(x, z, S.level); return (f & F.OPEN) && !(f & F.WALL) && Math.abs(hAt(x, z, S.level) - hAt(from.x, from.z, S.level)) < 0.45; };
  const collide = (p, r = 0.35) => {
    for (const c of sp.colliders) {
      if (c[0] !== S.level) continue;
      if (c[1] === 1) {
        const dx = p.x - c[2], dz = p.z - c[3], cs = Math.cos(c[6]), sn = Math.sin(c[6]);
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, ox = c[4] + r - Math.abs(lx), oz = c[5] + r - Math.abs(lz);
        if (ox > 0 && oz > 0) { let mx = 0, mz = 0; if (ox < oz) mx = Math.sign(lx) * ox; else mz = Math.sign(lz) * oz; p.x += mx * cs + mz * sn; p.z += -mx * sn + mz * cs; }
      } else {
        const dx = p.x - c[2], dz = p.z - c[3], d = Math.hypot(dx, dz), m = c[4] + r;
        if (d < m && d > 1e-4) { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); }
      }
    }
  };
  S.step = (obj, dx, dz) => {
    const from = obj.pos.clone(), nx = obj.pos.x + dx, nz = obj.pos.z + dz;
    if (!ok(nx, nz, from)) return false;
    const p = new THREE.Vector3(nx, obj.pos.y, nz); collide(p);
    if (!ok(p.x, p.z, from)) return false;
    obj.pos.x = p.x; obj.pos.z = p.z;
    if (flagAt(p.x, p.z, S.level) & F.STAIR) {
      const h = hAt(p.x, p.z, S.level); let best = S.level;
      sp.levels.forEach((l, L) => { if ((flagAt(p.x, p.z, L) & F.STAIR) && Math.abs(l.y - h) < Math.abs(sp.levels[best].y - h)) best = L; });
      S.level = best;
    }
    return true;
  };
  S.nearby = (me2) => {
    let best = null, bd = 1e9;
    for (const u of sp.uses) {
      if (u.level !== S.level) continue;
      const d = Math.hypot(u.x - me2.pos.x, u.z - me2.pos.z);
      if (d < u.r + 0.6 && d < bd) { best = { label: u.label, lines: u.lines, x: u.x, y: u.y, z: u.z }; bd = d; }
    }
    if (oak && oak.level === S.level) {
      const d = Math.hypot(oak.pos.x - me2.pos.x, oak.pos.z - me2.pos.z), fx = Math.sin(me2.yaw), fz = Math.cos(me2.yaw);
      if (d < 2.2 && ((oak.pos.x - me2.pos.x) * fx + (oak.pos.z - me2.pos.z) * fz) / (d || 1) > 0.2 && d < bd) best = { label: 'Talk', lines: oak.lines, npc: oak, x: oak.pos.x, y: oak.pos.y + 2.0, z: oak.pos.z };
    }
    return best;
  };
  S.portal = () => {
    for (const po of sp.portals) {
      const r = po.rect;
      if (po.level === S.level && me.pos.x >= r[0] && me.pos.x <= r[2] && me.pos.z >= r[1] && me.pos.z <= r[3]) return po;
    }
    return null;
  };

  // ---- camera: inside the volumes (and out of big props), closer and lower ----
  const inside = (p, m) => camInside(sp.camera, p.x, p.y, p.z, m) && !sp.camera.blocks.some((b) => {
    if (p.y < b[6] || p.y > b[7]) return false;
    const dx = p.x - b[1], dz = p.z - b[2];
    if (b[8]) return dx * dx + dz * dz < b[3] * b[3];
    const cs = Math.cos(b[5]), sn = Math.sin(b[5]);
    return Math.abs(dx * cs - dz * sn) < b[3] && Math.abs(dx * sn + dz * cs) < b[4];
  });
  const boom = (t, dir, want) => {
    let m = sp.camera.margin || 0.28;
    if (!inside(t, m)) m = 0;
    let d = 0; const p = new THREE.Vector3();
    while (d < want) { const nd = Math.min(want, d + 0.06); if (!inside(p.copy(t).addScaledVector(dir, nd), m)) return d; d = nd; }
    return want;
  };
  const volAt = (p) => sp.camera.volumes.find((v) => camInside({ volumes: [v] }, p.x, p.y, p.z, 0)) || {};
  let camBoom = 2, camLift = 0;
  S.camera = (dt, cam, camera) => {
    const def = sp.camera.default || {};
    if (cam.ty == null) cam.ty = me.pos.y;
    cam.ty += (me.pos.y - cam.ty) * (1 - Math.exp(-dt * 4));
    const k = 1 - Math.exp(-dt * 12);
    cam.target.x += (me.pos.x - cam.target.x) * k; cam.target.z += (me.pos.z - cam.target.z) * k; cam.target.y = cam.ty + (def.height || 1.4);
    const v = volAt(cam.target), want = v.dist || def.dist || 5;
    const dirOf = (p) => new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(p), Math.sin(p), Math.cos(cam.yaw) * Math.cos(p));
    let lift = 0, free = boom(cam.target, dirOf(cam.pitch), want);
    if (free < want * 0.7) {
      let best = free;
      for (let i = 1; i <= 6 && cam.pitch + 0.08 * i <= 0.7; i++) { const fd = boom(cam.target, dirOf(cam.pitch + 0.08 * i), want); if (fd > best + 0.25) { best = fd; lift = 0.08 * i; } if (fd >= want * 0.75) break; }
    }
    camLift += (lift - camLift) * (1 - Math.exp(-dt * 3));
    const dir = dirOf(cam.pitch + camLift);
    free = boom(cam.target, dir, want);
    camBoom = free < camBoom ? free : camBoom + (free - camBoom) * (1 - Math.exp(-dt * 2.5));
    camera.position.copy(cam.target).addScaledVector(dir, camBoom);
    player.root.visible = camBoom > 0.75;
    const lead = Math.max(0, Math.min(0.8, (want - camBoom) * 0.2));
    camera.lookAt(cam.target.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), -lead));
    cam.pos.copy(camera.position);
  };
  S.update = (dt, t) => {
    if (oak) {
      if (!dialog.open) oak.yaw += (oak.rot0 - oak.yaw) * (1 - Math.exp(-dt * 2));
      else if (oak.face != null) oak.yaw += Math.atan2(Math.sin(oak.face - oak.yaw), Math.cos(oak.face - oak.yaw)) * (1 - Math.exp(-dt * 8));
      oak.actor.root.rotation.y = oak.yaw;
      oak.actor.animate(dt, 0, false, t);
    }
  };

  S.enter = (id, spawnId) => fade(async () => {
    const bp = await (await fetch(new URL(`maps/${id}.json`, import.meta.url))).json();
    const { buildInterior } = await import('./interior.js');
    I = buildInterior(bp);
    sp = I.space; raw = sp._raw;
    addEdgeLines(I.group);
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(bp.lights.bg || '#222');
    sc.add(I.group);
    const kd = bp.lights.key.dir, [x0, z0, x1, z1] = bp.bounds, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const L = new THREE.DirectionalLight('#ffffff', SUN_I);
    L.position.set(cx + kd[0] * 40, kd[1] * 40, cz + kd[2] * 40); L.target.position.set(cx, 0, cz);
    L.castShadow = true; L.shadow.mapSize.set(2048, 2048); Object.assign(L.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
    L.shadow.bias = -0.0006; L.shadow.normalBias = 0.02;
    sc.add(L, L.target);
    const halo = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    for (const l of I.lamps) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 })); s.position.set(...l.pos); s.scale.setScalar(Math.min(1.6, l.r * 0.5)); s.userData.outline = false; sc.add(s); }
    sc.add(player.root);
    for (const a of sp.actors) {
      const act = makeOak(a.look);
      act.root.position.set(a.x, a.y, a.z); act.root.rotation.y = a.rot; sc.add(act.root);
      oak = { actor: act, pos: new THREE.Vector3(a.x, a.y, a.z), yaw: a.rot, rot0: a.rot, lines: a.lines, level: a.level, face: null };
    }
    S.scene = sc;
    const s = sp.spawns.find((q) => q.id === spawnId) || sp.spawns[0];
    S.level = s.level; me.pos.set(s.x, s.y, s.z); me.yaw = s.rot; me.speed = 0; me.vy = 0;
    S.active = true;
    banner(bp.name, 'Pallet Town');
  });
  S.leave = () => fade(async () => {
    S.active = false;
    I.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    I = null; sp = null; raw = null; oak = null; S.scene = null;
    player.root.visible = true;
    onLeave();
  });
  S.npcFace = (n) => { if (n === oak) oak.face = Math.atan2(me.pos.x - oak.pos.x, me.pos.z - oak.pos.z); };
  return S;
}
