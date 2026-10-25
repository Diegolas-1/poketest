// In-page half of tools/qa/scan.mjs: walks the unmerged town (?qa) and returns
// findings. window.__qaRun({only}) -> {findings, stats}; window.__qaMap(list)
// -> a PNG data URL of the map from above with the findings on it.
// Every finding: {check, sev: high|med|low, at: [x, y, z], object, src: [file:line...], msg, fix, owner}
(function () {
  const SEV = { high: 3, med: 2, low: 1 };
  // generators worker 14 is rebuilding (its detail pass): their findings go to it
  // (matched against the builder functions and frames that made the object)
  const W14 = [/\b(fallenLog|teaHouse|picnicTable|fallenLog|scarecrow|cottage|palletHouse|vendingMachine|footbridge|shed|haybale|benchSeat|coinTelescope|kettleStove|shogiBench|parasol|menuBoard)\b/, /teahouse/, /route1\.js:(8[3-9]|9\d|12\d|13\d|18\d|19\d|2[0-3]\d)\b/];
  const ownerOf = (txt) => (W14.some((r) => r.test(txt)) ? 'worker14' : 'worker15');

  window.__qaRun = async function ({ only } = {}) {
    const THREE = await import('three');
    const T = await import('/world/terrain.js');
    const Wd = window.world, root = Wd.town.group, scene = Wd.scene;
    scene.updateMatrixWorld(true);
    const on = (k) => !only || only.includes(k);
    const findings = [], stats = {};
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const fmt = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    const srcOf = (o) => { for (let q = o; q; q = q.parent) if (q.userData.__src && q.userData.__src.length) return q.userData.__src; return []; };
    // the frame that placed it: skip the little helpers (add, box, put, place...)
    const HELP = /^(town\.js:(14[1-9]|15\d|16\d|25[0-9]|26[0-4])|props\/outdoor\.js:1(4[89]|[5-9]\d)|props\/kit\.js|route1\.js:5[2-9])$/;
    const topOf = (o) => { let q = o; while (q.parent && q.parent !== root) q = q.parent; return q; };
    const nameOf = (o) => {
      const parts = [];
      for (let q = o; q && q !== root; q = q.parent) { if (q.name) parts.push(q.name); if (q.userData.eid) parts.push(q.userData.eid); }
      const s = srcOf(o).filter((f) => !HELP.test(f));
      let fn = '';
      for (let q = o; q && !fn; q = q.parent) for (const f of q.userData.__fn || []) if (f && !/^(add|box|cyl|ball|put|place|plant|sign|instanced|ivy|mossTop|vines|beam|rope|Object\.|Array\.|route1Fill|buildTown|Group\.|forEach)/.test(f) && !fn) fn = f;
      return (parts.reverse().join('/') || o.type) + (fn ? ' ' + fn + '()' : '') + (s.length ? ' @' + s[0] : '');
    };
    const add = (check, sev, at, o, msg, fix, extra = {}) => {
      const src = o ? srcOf(o) : [];
      const object = extra.object || (o ? nameOf(o) : '');
      const fns = []; for (let q = o; q; q = q.parent) if (q.userData && q.userData.__fn) fns.push(...q.userData.__fn);
      findings.push({ check, sev, at: Array.isArray(at) ? at : fmt(at), object, src, fns: [...new Set(fns.filter(Boolean))].slice(0, 8), msg, fix, owner: extra.owner || ownerOf(object + ' ' + src.join(' ') + ' ' + fns.join(' ')), ...extra.more });
    };
    const leafy = (m) => { const mm = Array.isArray(m) ? m[0] : m; return !mm || mm.alphaTest > 0 || mm.transparent || mm.isMeshBasicMaterial && mm.depthWrite === false || !mm.visible; };

    // ---------- the ray set: town meshes + terrain, in an 8 m grid ----------
    const solids = [];
    root.traverse((o) => { if (o.isMesh && o.visible !== false && !leafy(o.material) && (!o.isInstancedMesh || o.count <= 64)) solids.push(o); });
    const terrain = scene.getObjectByName('terrain');
    const ground = [];
    if (terrain) terrain.traverse((o) => { if (o.isMesh) ground.push(o); });
    const CELL = 8, grid = new Map(), boxOf = new Map();
    const bbox = (o) => {
      if (!boxOf.has(o)) {
        let b;
        if (o.isInstancedMesh) { o.computeBoundingBox(); b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); }
        else { b = new THREE.Box3(); o.traverse((m) => { if (m.isInstancedMesh) { m.computeBoundingBox(); b.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); } else if (m.isMesh) b.expandByObject(m, true); }); }
        boxOf.set(o, b);
      }
      return boxOf.get(o);
    };
    for (const o of solids) {
      const b = bbox(o);
      if (b.isEmpty()) continue;
      if ((b.max.x - b.min.x) * (b.max.z - b.min.z) > 1e4) { (grid.get('big') || grid.set('big', []).get('big')).push(o); continue; }
      for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++) for (let j = Math.floor(b.min.z / CELL); j <= Math.floor(b.max.z / CELL); j++) {
        const k = i + ',' + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
      }
    }
    const rc = new THREE.Raycaster();
    rc.firstHitOnly = false;
    const cand = (p, d, far) => {
      const set = new Set(grid.get('big') || []);
      const n = Math.ceil(far / (CELL / 2)) + 1;
      for (let s = 0; s <= n; s++) {
        const q = p.clone().addScaledVector(d, Math.min(far, s * CELL / 2));
        const k = Math.floor(q.x / CELL) + ',' + Math.floor(q.z / CELL);
        for (const o of grid.get(k) || []) set.add(o);
      }
      return [...set];
    };
    // all hits along a ray (sorted), objects filtered by keep(o)
    const cast = (p, d, far, keep = () => true, withGround = true) => {
      rc.set(p, d); rc.far = far;
      const list = cand(p, d, far).filter(keep);
      if (withGround) list.push(...ground);
      return rc.intersectObjects(list, false);
    };
    const faceN = (h) => { const n = h.face.normal.clone(); const m = h.object.matrixWorld.clone(); if (h.instanceId != null) { const im = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, im); m.multiply(im); } return n.transformDirection(m); };
    const sideOf = (o) => (Array.isArray(o.material) ? o.material[0] : o.material).side;

    // pieces: the top-level groups and meshes the generators placed
    const SKIP_PIECE = (o) => o.isInstancedMesh || /^r1_(gravel|cobble|city)$/.test(o.name);
    const pieces = root.children.filter((o) => !SKIP_PIECE(o));
    // world-space vertices of an object's meshes (sampled)
    const vertsOf = (o, max = 6000) => {
      const out = [];
      o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh || m.isInstancedMesh || leafy(m.material) || m.visible === false) return;
        const a = m.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / max));
        for (let i = 0; i < a.count; i += step) out.push(V(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(m.matrixWorld));
      });
      return out;
    };
    const inside = (o, q) => { for (let x = q; x; x = x.parent) if (x === o) return true; return false; };
    // exceptions marked in the generators: userData.qa = {k: 'hung' (held up
    // by something else: wires, ropes, a bough) | 'open' (open by design), why}
    const tag = (o, k) => { for (let q = o; q && q !== root; q = q.parent) if (q.userData.qa && q.userData.qa.k === k) return q.userData.qa; return null; };
    const allowed = [];
    const skip = (o, k, check) => { const t = tag(o, k); if (t) { allowed.push({ check, object: nameOf(o), why: t.why }); return true; } return false; };

    // ===== 1. up: things that stand should stand straight =====
    if (on('up')) {
      let n = 0;
      const tilt = (m) => { const y = V().setFromMatrixColumn(m, 1).normalize(); return Math.acos(Math.min(1, y.dot(UP))) * 180 / Math.PI; };
      for (const p of pieces) {
        n++;
        const a = tilt(p.matrixWorld);
        if (a > 10) add('up', a > 30 ? 'high' : 'med', V().setFromMatrixPosition(p.matrixWorld), p, `the piece leans ${a.toFixed(0)}° off vertical`, 'place it upright (rotation only about y) unless it is meant to lean');
      }
      // instanced things that stand (posts, pickets, crops): every instance
      root.traverse((o) => {
        if (!o.isInstancedMesh) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        const s = V(); g.boundingBox.getSize(s);
        if (s.y < 0.3 || s.y < 1.5 * Math.max(s.x, s.z)) return;
        const im = new THREE.Matrix4(), m = new THREE.Matrix4();
        let worst = 0, at = null;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, im); m.multiplyMatrices(o.matrixWorld, im); const a = tilt(m); n++; if (a > worst) { worst = a; at = V().setFromMatrixPosition(m); } }
        if (worst > 10) add('up', worst > 30 ? 'high' : 'med', at, o, `instances lean up to ${worst.toFixed(0)}° off vertical`, 'keep instance rotations about y only');
      });
      // post-like parts inside pieces (legs, posts, trunks): tilted ones must
      // splay outward (feet further from the piece's middle than the tops)
      for (const p of pieces) {
        const pb = bbox(p), pc = V(); pb.getCenter(pc);
        p.traverse((m) => {
          if (!m.isMesh || m.isInstancedMesh || leafy(m.material)) return;
          const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
          const s = V(); g.boundingBox.getSize(s);
          if (!(s.y > 0.35 && s.y > 4 * Math.max(s.x, s.z))) return;
          const a = tilt(m.matrixWorld);
          if (a < 6 || a > 60) return;
          const c = V(); g.boundingBox.getCenter(c);
          const top = V(c.x, g.boundingBox.max.y, c.z).applyMatrix4(m.matrixWorld), bot = V(c.x, g.boundingBox.min.y, c.z).applyMatrix4(m.matrixWorld);
          const dt = Math.hypot(top.x - pc.x, top.z - pc.z), db = Math.hypot(bot.x - pc.x, bot.z - pc.z);
          if (db < dt - 0.04 && bot.y < top.y) add('splay', 'med', bot, m, `a leg/post leans ${a.toFixed(0)}° with its foot ${(dt - db).toFixed(2)} m nearer the middle than its top (legs angled inward)`, 'mirror the lean so feet splay outward (A-frame legs)');
        });
      }
      stats.up = n;
    }

    // ===== 2. ground: each piece stands on something, not in the air or buried =====
    if (on('ground')) {
      let n = 0;
      const NO_GROUND = /\b(r1_swing)\b/;
      for (const p of pieces) {
        if (NO_GROUND.test(p.name) || skip(p, 'hung', 'ground')) continue;
        const vs = vertsOf(p); if (vs.length < 3) continue;
        let minY = Infinity, maxY = -Infinity; for (const v of vs) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
        const H = maxY - minY;
        // the feet: lowest vertices, one per 0.3 m cell
        const feet = new Map();
        for (const v of vs) if (v.y < minY + Math.min(0.06, H * 0.2)) { const k = Math.round(v.x / 0.3) + ',' + Math.round(v.z / 0.3); if (!feet.has(k) || feet.get(k).y > v.y) feet.set(k, v); }
        const fl = [...feet.values()].slice(0, 24);
        n++;
        let minGap = Infinity, maxGap = -Infinity, sunk = 0, at = null, airFeet = 0;
        for (const f of fl) {
          const hits = cast(V(f.x, f.y + 3, f.z), V(0, -1, 0), 40, (o) => !inside(p, o));
          let surf = null;
          for (const h of hits) if (h.point.y <= f.y + 0.3) { surf = h.point.y; break; }
          if (surf == null) { if (hits.length) { sunk = Math.max(sunk, hits[hits.length - 1].point.y - f.y); } continue; }
          const gap = f.y - surf;
          if (gap < minGap) { minGap = gap; at = f; }
          maxGap = Math.max(maxGap, gap);
          if (gap > 0.12) airFeet++;
        }
        const c = V(); bbox(p).getCenter(c);
        const gy = T.height(c.x, c.z);
        if (maxY < gy + 0.05) add('ground', 'high', c, p, `buried: its top is ${(gy - maxY).toFixed(2)} m under the ground`, 'raise it to the ground (height(x, z))');
        else if (minGap !== Infinity && minGap > 0.05) add('ground', minGap > 0.25 ? 'high' : 'med', at, p, `floats ${minGap.toFixed(2)} m above whatever is under it`, 'set its y from the ground under its footprint (lowest point, or sink it a little)');
        else if (fl.length >= 3 && airFeet && airFeet >= fl.length / 3 && maxGap > 0.15 && H < 6) add('ground', 'low', at || c, p, `${airFeet} of ${fl.length} feet are up to ${maxGap.toFixed(2)} m off the ground (on a slope)`, 'level it on the lowest point of its footprint, or tilt its legs to the slope');
      }
      // instances: crops, posts, pickets, rocks
      const im = new THREE.Matrix4(), m = new THREE.Matrix4();
      root.traverse((o) => {
        if (!o.isInstancedMesh || leafy(o.material) || o.userData.stone || skip(o, 'hung', 'ground')) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        let worst = 0, at = null, cnt = 0;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im); m.multiplyMatrices(o.matrixWorld, im);
          const b = g.boundingBox.clone().applyMatrix4(m);
          { const s = V(); b.getSize(s); if (s.y < 0.5 * Math.max(s.x, s.z)) continue; }   // rails, planks, slabs: held up by posts
          const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
          const hits = cast(V(x, b.min.y + 3, z), V(0, -1, 0), 40, (q) => q !== o);
          let surf = null; for (const h of hits) if (h.point.y <= b.min.y + 0.3) { surf = h.point.y; break; }
          n++;
          if (surf == null) continue;
          const gap = b.min.y - surf;
          if (gap > 0.08) { cnt++; if (gap > worst) { worst = gap; at = V(x, b.min.y, z); } }
        }
        if (cnt) add('ground', worst > 0.25 ? 'med' : 'low', at, o, `${cnt} of ${o.count} instances float, up to ${worst.toFixed(2)} m`, 'set each instance on the ground under its own footprint');
      });
      stats.ground = n;
    }

    // ===== 3. wall-mounted overgrowth (ivy on faces, moss/flower mats on tops) =====
    if (on('wall')) {
      let n = 0;
      root.traverse((o) => {
        const q = o.userData.qa; if (!q || !o.isMesh) return;
        n++;
        const M = o.matrixWorld, nrm = V(0, 0, 1).transformDirection(M), bad = [], pts = [];
        if (q.k === 'face') {
          for (const fx of [-0.35, 0, 0.35]) for (const fy of [0.15, 0.5]) pts.push(V(fx * q.w, fy * q.h, 0).applyMatrix4(M));
          for (const p of pts) {
            // behind the ivy within 0.3 m: a face looking the same way
            const hits = cast(p.clone().addScaledVector(nrm, 0.6), nrm.clone().negate(), 1.2, (x) => x !== o);
            const h = hits.find((h) => faceN(h).dot(nrm) > 0.5);
            const back = h ? h.distance - 0.6 : null;
            const front = hits.find((h) => h.distance < 0.55 && faceN(h).dot(nrm) > 0.5);
            if (back == null || back > 0.3) bad.push(['floating', p]);
            else if (front && 0.6 - front.distance > 0.06) bad.push(['inside', p]);
          }
        } else if (q.k === 'top') {
          for (const fx of [-0.35, 0, 0.35]) for (const fz of [-0.35, 0, 0.35]) pts.push(V(fx * q.w, 0, fz * q.d).applyMatrix4(M));
          for (const p of pts) {
            const hits = cast(p.clone().add(V(0, 0.6, 0)), V(0, -1, 0), 1.5, (x) => x !== o);
            const h = hits[0];
            if (!h || h.distance - 0.6 > 0.25) bad.push(['floating', p]);
          }
        }
        if (pts.length && bad.length >= pts.length / 3) {
          const kind = bad.filter((b) => b[0] === 'inside').length > bad.length / 2 ? 'inside' : 'floating';
          const what = q.k === 'face' ? 'ivy on a face' : 'moss/flower mat on a top';
          add('wall', 'high', bad[0][1], o, `${what}: ${bad.length} of ${pts.length} sample points ${kind === 'inside' ? 'are buried in the wall' : 'have no wall behind/under them'}`, q.k === 'face' ? 'compute the position and facing from the wall\'s outer face (outward normal)' : 'lay the mat along the wall\'s top: width across, length along the wall');
        }
      });
      stats.wall = n;
    }

    // ===== 4. shell: buildings closed on every side; no back faces showing =====
    // rays toward each piece from round it (horizontal and from above): the
    // first face hit must face the ray (a back face = culled = a hole there)
    if (on('shell')) {
      let n = 0;
      for (const p of pieces) {
        const b = bbox(p), c = V(), s = V(); b.getCenter(c); b.getSize(s);
        const R = Math.hypot(s.x, s.z) / 2 + 1;
        const big = s.x > 2.5 && s.z > 2.5 && s.y > 2.5;
        if (skip(p, 'open', 'shell') || skip(p, 'hung', 'shell')) continue;
        const own = []; p.traverse((m) => { if (m.isMesh && !leafy(m.material)) own.push(m); });
        if (!own.length) continue;
        const gy = Math.max(b.min.y, T.height(c.x, c.z));
        const heights = big ? [0.7, 1.5, 2.3] : [s.y * 0.5];
        const holes = new Map(), backs = [];
        const dirs = big ? 24 : 8;
        for (const hy of heights) for (let k = 0; k < dirs; k++) {
          const a = k / dirs * Math.PI * 2, d = V(-Math.sin(a), 0, -Math.cos(a));
          const tgt = big ? V(c.x, gy + hy, c.z) : V(c.x, b.min.y + hy, c.z);
          const o = tgt.clone().addScaledVector(d, -R);
          rc.set(o, d); rc.far = R * 2;
          const hits = rc.intersectObjects(own, false);
          n++;
          if (!hits.length) { if (big) { const side = Math.round(((a - p.rotation.y) / (Math.PI / 2) % 4 + 4) % 4) % 4; holes.set(side + ':' + hy, o.clone().addScaledVector(d, R - 0.5)); } continue; }
          const h = hits[0], fn = faceN(h);
          if (fn.dot(d) > 0.2 && sideOf(h.object) === THREE.FrontSide) backs.push(h);
          // z-fighting: two faces within 3 mm, facing the same way, different looks
          const h2 = hits.find((x) => x !== h && x.distance - h.distance < 0.003 && (x.object !== h.object || x.faceIndex !== h.faceIndex));
          if (h2 && faceN(h2).dot(fn) > 0.995 && (h2.object.material !== h.object.material || h2.object !== h.object) && !h.object.material.polygonOffset && !h2.object.material.polygonOffset) {
            const m1 = h.object.material, m2 = h2.object.material;
            if (!(m1.color && m2.color && m1.color.equals(m2.color) && m1.map === m2.map)) add('zfight', 'low', h.point, h.object, `coplanar with ${nameOf(h2.object)} (z-fighting)`, 'move one face a few mm out or drop the hidden one');
          }
        }
        // from above too (what the camera sees)
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2, d = V(-Math.sin(a) * 0.7, -0.7, -Math.cos(a) * 0.7).normalize();
          const tgt = V(c.x, b.min.y + s.y * 0.4, c.z), o = tgt.clone().addScaledVector(d, -R * 1.5);
          rc.set(o, d); rc.far = R * 3;
          const hits = rc.intersectObjects(own, false); n++;
          if (hits.length && faceN(hits[0]).dot(d) > 0.2 && sideOf(hits[0].object) === THREE.FrontSide) backs.push(hits[0]);
        }
        if (holes.size) {
          const sides = [...new Set([...holes.keys()].map((k) => ['front (+z)', 'right (+x)', 'back (-z)', 'left (-x)'][+k.split(':')[0]]))];
          add('shell', holes.size > 3 ? 'high' : 'med', [...holes.values()][0], p, `open side(s): rays straight through at ${holes.size} spots (${sides.join(', ')})`, 'close the wall (or whitelist it if the structure is open by design)');
        }
        const seen = new Set();
        for (const h of backs) {
          if (seen.has(h.object)) continue; seen.add(h.object);
          add('backface', 'med', h.point, h.object, 'the face seen from outside is a back face (culled: a hole, or inverted winding / mirrored scale)', 'flip the winding (or the negative scale), or make the material DoubleSide');
        }
      }
      stats.shell = n;
    }

    // ===== 5. text: labels must not be mirrored or upside down =====
    if (on('text')) {
      let n = 0;
      root.traverse((m) => {
        if (!m.isMesh || m.isInstancedMesh || leafy(m.material)) return;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        const t = mat && mat.map;
        if (!t || !t.isCanvasTexture || t.wrapS !== THREE.ClampToEdgeWrapping) return;
        const g = m.geometry, pa = g.attributes.position, ua = g.attributes.uv; if (!ua) return;
        const idx = g.index ? g.index.array : null, tri = (idx ? idx.length : pa.count) / 3;
        let mir = 0, ups = 0, tot = 0;
        const P = [V(), V(), V()], U = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
        for (let f = 0; f < tri; f++) {
          for (let k = 0; k < 3; k++) { const i = idx ? idx[f * 3 + k] : f * 3 + k; P[k].fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); U[k].fromBufferAttribute(ua, i); }
          const e1 = P[1].clone().sub(P[0]), e2 = P[2].clone().sub(P[0]);
          const du1 = U[1].x - U[0].x, dv1 = U[1].y - U[0].y, du2 = U[2].x - U[0].x, dv2 = U[2].y - U[0].y;
          const det = du1 * dv2 - du2 * dv1; if (Math.abs(det) < 1e-9) continue;
          const N = e1.clone().cross(e2); const area = N.length(); if (area < 1e-6) continue; N.normalize();
          const Tu = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
          const Bv = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
          if (Math.abs(N.y) > 0.7) continue;   // tops and bottoms: not text faces
          // a face showing a good part of the label (not edge strips)
          if (Math.abs(det) < 0.02) continue;
          tot++;
          const flip = t.flipY ? 1 : -1;
          if (Tu.clone().cross(Bv).dot(N) * flip < 0 && mat.side !== THREE.DoubleSide) mir++;
          if (Bv.y * flip < -0.3 * Bv.length()) ups++;
        }
        n++;
        if (tot && mir > tot / 2) add('text', 'high', V().setFromMatrixPosition(m.matrixWorld), m, `label texture is mirrored on ${mir} of ${tot} faces`, 'flip the u coordinates (or turn the plane round instead of scaling it by -1)');
        if (tot && ups > tot / 2) add('text', 'high', V().setFromMatrixPosition(m.matrixWorld), m, `label texture is upside down on ${ups} of ${tot} faces`, 'flip the v coordinates');
      });
      stats.text = n;
    }

    // ===== 6. overlap: pieces inside each other / inside buildings, trees in houses =====
    if (on('overlap')) {
      // each piece's footprint as an oriented box in its own frame (y turn only)
      const fps = [];
      for (const p of pieces) {
        if (tag(p, 'hung')) continue;   // wires, ropes, wall-mounted things
        const vs = vertsOf(p, 3000); if (vs.length < 3) continue;
        const ry = new THREE.Euler().setFromRotationMatrix(p.matrixWorld, 'YXZ').y, c = Math.cos(ry), s = Math.sin(ry);
        const px = p.matrixWorld.elements[12], pz = p.matrixWorld.elements[14];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const v of vs) { const dx = v.x - px, dz = v.z - pz, lx = dx * c - dz * s, lz = dx * s + dz * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
        fps.push({ p, px, pz, c, s, x0, x1, z0, z1, y0, y1, area: (x1 - x0) * (z1 - z0) });
      }
      const local = (f, x, z) => { const dx = x - f.px, dz = z - f.pz; return [dx * f.c - dz * f.s, dx * f.s + dz * f.c]; };
      const inFp = (f, x, z, m = 0) => { const [lx, lz] = local(f, x, z); return lx > f.x0 + m && lx < f.x1 - m && lz > f.z0 + m && lz < f.z1 - m; };
      // share of b's footprint inside a (sampled)
      const share = (a, b) => { let k = 0, t = 0; for (let i = 0.1; i < 1; i += 0.2) for (let j = 0.1; j < 1; j += 0.2) { const lx = b.x0 + (b.x1 - b.x0) * i, lz = b.z0 + (b.z1 - b.z0) * j; const x = b.px + lx * b.c + lz * b.s, z = b.pz - lx * b.s + lz * b.c; t++; if (inFp(a, x, z, 0.1)) k++; } return k / t; };
      const BIG = 12;
      for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
        const a = fps[i], b = fps[j];
        if (Math.hypot(a.px - b.px, a.pz - b.pz) > 60) continue;
        if (a.y1 < b.y0 || b.y1 < a.y0) continue;
        const [s, l] = a.area < b.area ? [a, b] : [b, a];
        if (l.area > 2500 || s.area < 0.05) continue;
        const sh = share(l, s);
        if (sh > 0.5 && (s.y1 - s.y0) > 0.3) add('overlap', l.area > BIG ? 'med' : 'low', [s.px, s.y0, s.pz], s.p, `${(sh * 100).toFixed(0)}% of its footprint is inside ${nameOf(l.p)}`, 'move one of them clear (check the colliders before placing)', { more: { other: nameOf(l.p) } });
      }
      // trees and bushes (veg.js instances) inside buildings
      const builds = fps.filter((f) => f.area > BIG && (f.y1 - f.y0) > 3);
      const im = new THREE.Matrix4(), m = new THREE.Matrix4(), hitB = new Map();
      for (const o of scene.children) {
        if (!o.isInstancedMesh || !o.geometry.boundingSphere) continue;
        const src = (o.userData.__src || []).join(' ');
        if (!/veg\.js/.test(src)) continue;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im); m.multiplyMatrices(o.matrixWorld, im);
          const x = m.elements[12], z = m.elements[14];
          for (const f of builds) if (inFp(f, x, z, 0.6) && !hitB.has(f.p.uuid + Math.round(x) + ',' + Math.round(z))) {
            hitB.set(f.p.uuid + Math.round(x) + ',' + Math.round(z), 1);
            add('overlap', 'high', [x, m.elements[13], z], f.p, `a plant (veg.js) grows inside this building's footprint`, 'keep veg.js scatter out of the building (blocked()/colliders)', { object: 'veg.js plant in ' + nameOf(f.p) });
          }
        }
      }
      // fence rails (instanced boxes, long and low) running through a piece
      const rails = [];
      root.traverse((o) => {
        if (!o.isInstancedMesh || o.userData.stone) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im); m.multiplyMatrices(o.matrixWorld, im);
          const b = g.boundingBox.clone().applyMatrix4(m), sz = V(); b.getSize(sz);
          const L = Math.hypot(sz.x, sz.z);
          if (sz.y > 0.35 || L < 1.2) continue;
          // the long axis of the box, through its middle
          const c = V(), ax = V(1, 0, 0); b.getCenter(c);
          const g0 = g.boundingBox, gs = V(); g0.getSize(gs);
          const loc = gs.x >= gs.z ? V(1, 0, 0) : V(0, 0, 1);
          ax.copy(loc).transformDirection(m); ax.y = 0; ax.normalize();
          const half = (gs.x >= gs.z ? gs.x : gs.z) * V().setFromMatrixColumn(m, gs.x >= gs.z ? 0 : 2).length() / 2;
          rails.push({ o, c, ax, half, y0: b.min.y, y1: b.max.y });
        }
      });
      const railHit = new Set();
      for (const f of fps) {
        if (f.area > 30 || f.area < 0.02 || /fence|picket/i.test(nameOf(f.p))) continue;
        for (const r of rails) {
          if (Math.hypot(r.c.x - f.px, r.c.z - f.pz) > r.half + 6 || r.y1 < f.y0 || r.y0 > f.y1 || inside(f.p, r.o)) continue;
          let hit = false;
          for (let t = -1; t <= 1 && !hit; t += 0.05) { const x = r.c.x + r.ax.x * r.half * t, z = r.c.z + r.ax.z * r.half * t; if (inFp(f, x, z, 0.02)) hit = true; }
          if (hit && !railHit.has(f.p)) { railHit.add(f.p); add('overlap', 'med', [f.px, f.y0, f.pz], f.p, `a fence rail (${nameOf(r.o)}) runs through it`, 'move it clear of the fence line, or leave a gap in the fence'); }
        }
      }
      stats.overlap = fps.length;
    }

    // ===== 7. water and paths =====
    if (on('water')) {
      let n = 0;
      const WET = /dock|boat|buoy|bridge|pier|lighthouse|harbour|stepping|rowboat|fishingBoat/i;
      for (const p of pieces) {
        const b = bbox(p), c = V(); b.getCenter(c);
        const src = srcOf(p).join(' ');
        n++;
        if (T.isWater(c.x, c.z) && !WET.test(nameOf(p) + ' ' + (p.userData.__fn || []).join(' ')) && b.min.y < T.SEA_Y + 3) {
          add('water', 'med', c, p, 'stands in water', 'move it onto land, or whitelist it if it belongs in the water');
        }
      }
      // fence posts, pickets, crops on a path
      const im = new THREE.Matrix4(), m = new THREE.Matrix4();
      root.traverse((o) => {
        if (!o.isInstancedMesh || o.userData.stone || o.count > 2000) return;
        let k = 0, at = null;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, im); m.multiplyMatrices(o.matrixWorld, im); const x = m.elements[12], z = m.elements[14]; if (T.onPath(x, z, 0) && T.pathSD(x, z) < -0.35) { k++; at = at || V(x, m.elements[13], z); } }
        if (k) add('path', 'med', at, o, `${k} of ${o.count} instances stand on a path`, 'leave a gap where the path crosses (onPath)');
      });
      for (const p of pieces) {
        const x = p.matrixWorld.elements[12], z = p.matrixWorld.elements[14];
        const b = bbox(p);
        if ((b.max.x - b.min.x) * (b.max.z - b.min.z) > 40) continue;
        if (T.onPath(x, z, 0) && T.pathSD(x, z) < -0.5 && !/sign|lamp|well|bridge/i.test(nameOf(p)) && !tag(p, 'hung')) add('path', 'low', V(x, b.min.y, z), p, 'stands in the middle of a path', 'step it off the path (offPath)');
      }
      stats.water = n;
    }

    // ===== 8. facing: signs read from the path =====
    if (on('facing')) {
      let n = 0;
      for (const p of pieces) {
        const src = srcOf(p).join(' ');
        if (!/town\.js:108\d|route1\.js:6[2-9]/.test(src)) continue;   // sign() helpers
        n++;
        const x = p.position.x, z = p.position.z, f = V(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
        // the nearest path point
        let best = null;
        for (let r = 0.5; r < 25 && !best; r += 0.5) for (let a = 0; a < 32; a++) { const qx = x + Math.cos(a / 32 * 6.283) * r, qz = z + Math.sin(a / 32 * 6.283) * r; if (T.onPath(qx, qz, 0)) { best = [qx, qz]; break; } }
        if (!best) continue;
        const d = V(best[0] - x, 0, best[1] - z).normalize();
        const dot = f.dot(d);
        if (dot < -0.2) add('facing', dot < -0.6 ? 'high' : 'med', p.position, p, `faces away from the path ${(Math.acos(dot) * 180 / Math.PI).toFixed(0)}° off`, 'turn it to face the path (yaw = atan2(dx, dz) toward the path)');
      }
      stats.facing = n;
    }
    findings.sort((a, b) => SEV[b.sev] - SEV[a.sev]);
    return { findings, stats, tagged: allowed };
  };

  // the map from above: an orthographic render of the world with the findings
  window.__qaMap = async function (list) {
    const THREE = await import('three');
    const Wd = window.world;
    const r = Wd.renderer, S = 2048;
    const cam = new THREE.OrthographicCamera(-200, 200, 425, -425, 1, 2000);
    cam.position.set(20, 800, -215); cam.up.set(0, 0, -1); cam.lookAt(20, 0, -215);
    const old = r.getSize(new THREE.Vector2());
    r.setSize(Math.round(S * 400 / 850), S, false);
    const fog = Wd.scene.fog; Wd.scene.fog = null;
    r.render(Wd.scene, cam);
    Wd.scene.fog = fog;
    const c = document.createElement('canvas'); c.width = r.domElement.width; c.height = r.domElement.height;
    const x = c.getContext('2d'); x.drawImage(r.domElement, 0, 0);
    r.setSize(old.x, old.y, false);
    const col = { high: '#ff2a2a', med: '#ffb000', low: '#30a0ff' };
    x.font = 'bold 16px sans-serif'; x.textBaseline = 'middle';
    for (const f of list) {
      const v = new THREE.Vector3(...f.at).project(cam);
      const px = (v.x + 1) / 2 * c.width, py = (1 - v.y) / 2 * c.height;
      x.fillStyle = col[f.sev]; x.strokeStyle = '#000'; x.lineWidth = 2;
      x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.strokeText(f.id.slice(2), px + 9, py); x.fillText(f.id.slice(2), px + 9, py);
    }
    return c.toDataURL('image/png');
  };
})();
