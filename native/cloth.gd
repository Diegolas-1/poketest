class_name ClothSim
extends RefCounted
# The moving cloth and hair of a person: a port of the web build's cloth sim
# (web/world/garments.js clothSim, and dressAsh's in ashcloth.js, which is the
# same machine). The garments hang off "cloth bones" in panels (Ash's jacket,
# sleeve and trouser hems; the girl's dress; Oak's lab coat) and the hair off
# chains added by the bake (the girl's ponytail, Ash's spikes); the layout comes
# from cast.json (looks.<look>.sim, made by tools/native/bake_cast.mjs).
#
# Each chain is a few particles hanging from a pin on the body. A step: every
# particle is moved by gravity, the air (a gusty breeze plus the air it moves
# through, so the cloth trails when running and lifts in a jump), a spring back
# to where it hangs (its rest shape riding with the body, partly with the hips)
# with damping and a speed cap relative to that hang; then a few passes of
# constraints: each link keeps its length within a cone round its hang,
# neighbouring panels keep their spacing (+-8 %) and are smoothed towards each
# other so a hem stays one line, and every particle (and points along its link)
# is pushed out of the body at its current pose: tapered capsules on the arms,
# legs and head, rings of the body's girth round the chest, waist and hips, and
# the jacket's shell for Ash's sleeves. A leg is always under the cloth (a
# point caught between it and the trunk goes round its outside), so a dress or a
# coat never cuts a knee mid-stride. Then each cloth bone is turned to point at
# its particle.
#
# The sim runs at a fixed 60 steps a second (STEP_HZ) whatever the frame rate;
# in between, the particles are carried on by their own speed when the bones are
# aimed, so the cloth moves smoothly at 120 fps for the cost of 60.
#
#   var cs := ClothSim.make(actor)          # null when the look has no moving cloth
#   cs.update(dt, speed)                    # after the body's pose is set
#   cs.hold()                               # far off: the cloth hangs as it rests

const G := -9.8
const STEP_HZ := 60.0
const MAX_STEPS := 3
const SETTLE := 10
const ZC := 0.004
# along a link, the legs are checked between these (the web samples 0.4, 0.65 and 0.88)
const SEG_LO := 0.4
const SEG_HI := 0.9

static var _prep := {}

var skel: Skeleton3D
var actor: Node3D
var D: Dictionary
# bone frames this frame, per slot: rest model -> world, its inverse, scale, turn (skeleton space)
var W: Array[Transform3D] = []
var Wi: Array[Transform3D] = []
var sc := PackedFloat32Array()
var Pq: Array[Quaternion] = []
var Wa: Array[Transform3D] = []
var Wp: Array[Transform3D] = []
var _have_prev := false
# capsules in the world
var ca := PackedVector3Array()
var cab := PackedVector3Array()
var cc := PackedVector3Array()
var cl2 := PackedFloat32Array()
var cr0 := PackedFloat32Array()
var cr1 := PackedFloat32Array()
var cR2 := PackedFloat32Array()
var cR := PackedFloat32Array()
var hip := Vector3.ZERO
# particles
var x := PackedVector3Array()
var xp := PackedVector3Array()
var tg := PackedVector3Array()
var tp := PackedVector3Array()
var vt := PackedVector3Array()
var pin := PackedVector3Array()
var ph := PackedFloat32Array()
var ready := false
var held := false
var clock := 0.0
var acc := 0.0
var since := 0.0
var gap := 0.0          # since the bones' frames were last read
var _ahead0 := 0.0      # how far ahead the last steps were
var step_us := 0.0     # the last steps' time, and the time waited for them (dev)
var wait_us := 0.0
var _task := -1
static var threaded := true
var near := PackedInt64Array()
var root_prev := Vector3.ZERO
var v_root := Vector3.ZERO
var fwd := Vector3.BACK
var _offs: Array = []   # per group, per particle row: PackedVector3Array of offsets
var cap_out := PackedByteArray()
var cap_inn := PackedByteArray()
var rings: Array = []
var shells: Array = []

static func make(a: Node3D) -> ClothSim:
	var sim = CastActor.data().looks[a.look].get("sim")
	if not (sim is Dictionary) or sim.chains.is_empty(): return null
	var cs := ClothSim.new()
	cs._init_for(a, sim)
	return cs

# ---------- the layout, prepared once per look ----------
func _init_for(a: Node3D, sim: Dictionary) -> void:
	actor = a
	skel = a.skel
	if not _prep.has(a.look): _prep[a.look] = _prepare(skel, sim)
	D = _prep[a.look]
	cap_out = D.cap_out; cap_inn = D.cap_inn; rings = D.rings; shells = D.shells
	var ns: int = D.slot_bone.size()
	W.resize(ns); Wi.resize(ns); Wa.resize(ns); Wp.resize(ns); sc.resize(ns); Pq.resize(ns)
	var nc: int = D.cap_slot.size()
	ca.resize(nc); cab.resize(nc); cc.resize(nc); cl2.resize(nc); cr0.resize(nc); cr1.resize(nc); cR2.resize(nc); cR.resize(nc)
	var np: int = D.np
	for arr in [x, xp, tg, tp, vt]: arr.resize(np)
	pin.resize(D.c_p0.size())
	ph.resize(D.c_p0.size())
	for c in ph.size(): ph[c] = randf() * TAU
	clock = randf() * 100.0
	for g in D.groups:
		var rows := []
		for k in int(D.c_n[g[0]]): var o := PackedVector3Array(); o.resize(g[1]); rows.append(o)
		_offs.append(rows)

static func _prepare(sk: Skeleton3D, sim: Dictionary) -> Dictionary:
	# (built in locals: a packed array inside a Dictionary is copied when read)
	var slot_bone := PackedInt32Array()
	var slot_rinv: Array = []
	var slot_inv: Array = []
	var slot_rq: Array = []
	var slots := {}
	var slot := func(n: String) -> int:
		if slots.has(n): return slots[n]
		var bi := sk.find_bone(n)
		if bi < 0: push_warning("cloth: no bone " + n); bi = 0
		slots[n] = slot_bone.size()
		slot_bone.append(bi)
		var g := sk.get_bone_global_rest(bi)
		slot_rinv.append(g.affine_inverse())
		slot_inv.append(false)
		slot_rq.append(g.basis.get_rotation_quaternion().inverse())
		return slots[n]
	var hips: int = slot.call("Hips")
	var cap_slot := PackedInt32Array()
	var cap_a := PackedVector3Array()
	var cap_b := PackedVector3Array()
	var cap_r0 := PackedFloat32Array()
	var cap_r1 := PackedFloat32Array()
	var cap_out := PackedByteArray()
	var cap_inn := PackedByteArray()
	for c in sim.caps:
		cap_slot.append(slot.call(c.bone))
		cap_a.append(Vector3(c.a[0], c.a[1], c.a[2])); cap_b.append(Vector3(c.b[0], c.b[1], c.b[2]))
		cap_r0.append(float(c.r0)); cap_r1.append(float(c.r1))
		cap_out.append(1 if c.out else 0); cap_inn.append(1 if c.inn else 0)
	var rings: Array = []
	for r in sim.rings: rings.append(PackedFloat32Array(r))
	var shells: Array = []
	for s in sim.shells:
		var sl: int = slot.call(s.bone)
		slot_inv[sl] = true
		var rr: Array = []
		for r in s.rings: rr.append(PackedFloat32Array(r))
		shells.append({"slot": sl, "pad": float(s.pad), "ys": PackedFloat32Array(s.ys), "rings": rr})
	# chains, and their particles flattened
	var c_parent := PackedInt32Array()
	var c_hang := PackedInt32Array()
	var c_p0 := PackedInt32Array()
	var c_n := PackedInt32Array()
	var c_damp := PackedFloat32Array()
	var c_vmax := PackedFloat32Array()
	var c_flut := PackedFloat32Array()
	var c_quad := PackedByteArray()
	var c_rest: Array = []
	var c_hangw: Array = []
	var c_bones: Array = []
	var c_bq: Array = []
	var c_dir: Array = []
	var p_ks := PackedFloat32Array()
	var p_drag := PackedFloat32Array()
	var p_ccos := PackedFloat32Array()
	var p_csin := PackedFloat32Array()
	var p_len := PackedFloat32Array()
	var p_ops: Array = []
	var np := 0
	for c in sim.chains:
		c_parent.append(slot.call(c.parent))
		c_hang.append(slot.call(c.hangBone) if c.hangBone != "" else -1)
		var rest := PackedVector3Array()
		for r in c.rest: rest.append(Vector3(r[0], r[1], r[2]))
		c_rest.append(rest)
		var hw := PackedFloat32Array()
		for k in rest.size(): hw.append(float(c.hang[k]) if k < c.hang.size() else 0.0)
		c_hangw.append(hw)
		var bs := PackedInt32Array()
		var bq: Array = []
		var dirs := PackedVector3Array()
		for k in c.bones.size():
			var bi := sk.find_bone(c.bones[k])
			if bi < 0: push_warning("cloth: no bone " + c.bones[k])
			bs.append(bi)
			bq.append(sk.get_bone_global_rest(maxi(bi, 0)).basis.get_rotation_quaternion())
			dirs.append(rest[k + 1] - rest[k])
			if k == 0 and bi >= 0 and sk.get_bone_global_rest(bi).origin.distance_to(rest[0]) > 2e-3:
				push_warning("cloth: %s is not at its chain's pin" % c.bones[k])
		c_bones.append(bs); c_bq.append(bq); c_dir.append(dirs)
		c_p0.append(np); c_n.append(c.bones.size())
		c_damp.append(float(c.damp)); c_vmax.append(float(c.vmax)); c_flut.append(float(c.flut)); c_quad.append(1 if c.quad else 0)
		for k in c.bones.size():
			np += 1
			p_ks.append(float(c.ks[k])); p_drag.append(float(c.drag[k]))
			p_ccos.append(cos(float(c.cone[k]))); p_csin.append(sin(float(c.cone[k])))
			p_len.append(rest[k].distance_to(rest[k + 1]))
			# collision, in the web's order: the jacket's shell, caps (points, then along the
			# link), the ring of the body's girth, its middle, caps after
			var pts := PackedInt32Array()
			var segs := PackedInt32Array()
			var aft := PackedInt32Array()
			var sh := -1
			var shs := -1
			var rr := [-1, 0, 0.0]
			var mm := [-1, 0, 0.0]
			for o in c.coll[k]:
				match o[0]:
					"c": (aft if int(rr[0]) >= 0 else pts).append(int(o[1]))
					"s": segs.append(int(o[1]))
					"r", "m":
						var sl: int = slot.call(o[1])
						slot_inv[sl] = true
						var e := [sl, int(o[2]), float(o[3])]
						if o[0] == "r": rr = e
						else: mm = e
					"h": sh = int(o[1])
					"hs": shs = int(o[1])
			p_ops.append([sh, shs, pts, segs, rr[0], rr[1], rr[2], mm[0], mm[1], mm[2], aft])
	var parents := PackedInt32Array()
	for pr in c_parent: if not parents.has(pr): parents.append(pr)
	# every capsule a chain's particles test, and the chain's reach from its pin
	var c_caps: Array = []
	var c_len := PackedFloat32Array()
	for c in c_parent.size():
		var u := PackedInt32Array()
		var L := 0.0
		for k in int(c_n[c]):
			var o: Array = p_ops[c_p0[c] + k]
			for lst in [o[2], o[3], o[10]]:
				for ci in lst: if not u.has(ci): u.append(ci)
			L += p_len[c_p0[c] + k]
		c_caps.append(u); c_len.append(L)
	var links: Array = []
	for l in sim.links:
		links.append([c_p0[int(l[0])] + int(l[1]), c_p0[int(l[2])] + int(l[3]), float(l[4]), int(l[0])])
	var groups: Array = []
	for g in sim.groups: groups.append([int(g[0]), int(g[1]), bool(g[2])])
	return {"slot_bone": slot_bone, "slot_rinv": slot_rinv, "slot_inv": slot_inv, "slot_rq": slot_rq, "hips": hips, "hip0": sk.get_bone_global_rest(sk.find_bone("Hips")).origin,
		"cap_slot": cap_slot, "cap_a": cap_a, "cap_b": cap_b, "cap_r0": cap_r0, "cap_r1": cap_r1, "cap_out": cap_out, "cap_inn": cap_inn,
		"rings": rings, "shells": shells, "c_parent": c_parent, "c_hang": c_hang, "c_p0": c_p0, "c_n": c_n,
		"c_damp": c_damp, "c_vmax": c_vmax, "c_flut": c_flut, "c_quad": c_quad, "c_rest": c_rest, "c_hangw": c_hangw,
		"c_bones": c_bones, "c_bq": c_bq, "c_dir": c_dir, "np": np, "p_ks": p_ks, "p_drag": p_drag, "p_ccos": p_ccos,
		"p_csin": p_csin, "p_len": p_len, "p_ops": p_ops, "links": links, "parents": parents, "c_caps": c_caps, "c_len": c_len, "groups": groups, "iter": int(sim.get("iter", 3))}

# ---------- each frame ----------
# the bones' frames: Wa now (for aiming), and for the sim W, the frames the steps work in:
# now, or (predict) where they will be when the steps are picked up, a call later, if
# they keep moving as since the last call (the steps run on a worker meanwhile, so the
# cloth meets the legs where they are when it is drawn, not a frame behind)
func _frames(sim: bool, predict: bool) -> void:
	var SG := skel.global_transform
	var sb: PackedInt32Array = D.slot_bone
	var rinv: Array = D.slot_rinv
	var inv: Array = D.slot_inv
	predict = predict and _have_prev
	for s in sb.size():
		var bp := skel.get_bone_global_pose(sb[s])
		var m := SG * bp * (rinv[s] as Transform3D)
		Wa[s] = m
		Pq[s] = bp.basis.get_rotation_quaternion()
		if sim:
			var w := (m * Wp[s].affine_inverse()) * m if predict else m
			W[s] = w
			if inv[s]: Wi[s] = w.affine_inverse()
			sc[s] = w.basis.x.length()
		Wp[s] = m
	_have_prev = true
	if not sim: return
	hip = W[D.hips] * (D.hip0 as Vector3)
	var cs: PackedInt32Array = D.cap_slot
	var A0: PackedVector3Array = D.cap_a
	var B0: PackedVector3Array = D.cap_b
	var R0: PackedFloat32Array = D.cap_r0
	var R1: PackedFloat32Array = D.cap_r1
	for i in cs.size():
		var m: Transform3D = W[cs[i]]
		var a := m * A0[i]
		var b := m * B0[i]
		var s: float = sc[cs[i]]
		ca[i] = a; cab[i] = b - a; cc[i] = (a + b) * 0.5
		cl2[i] = maxf(cab[i].length_squared(), 1e-9)
		cr0[i] = R0[i] * s; cr1[i] = R1[i] * s
		var rr := cab[i].length() * 0.5 + maxf(cr0[i], cr1[i])
		cR2[i] = rr * rr
		cR[i] = rr

func _follow() -> void:
	var cp: PackedInt32Array = D.c_parent
	var ch: PackedInt32Array = D.c_hang
	var p0: PackedInt32Array = D.c_p0
	for c in cp.size():
		var M: Transform3D = W[cp[c]]
		var rest: PackedVector3Array = D.c_rest[c]
		var hw: PackedFloat32Array = D.c_hangw[c]
		var hg := ch[c]
		pin[c] = M * rest[0]
		for k in range(1, rest.size()):
			var p := M * rest[k]
			if hg >= 0 and hw[k] > 0.0: p = p.lerp(W[hg] * rest[k], hw[k])
			tg[p0[c] + k - 1] = p

# the cloth hangs as it rests (far off): the bones back to their rest turn, the sim reset
func hold() -> void:
	if held: return
	finish()
	held = true
	ready = false
	for c in D.c_bones.size():
		var bs: PackedInt32Array = D.c_bones[c]
		for bi in bs:
			if bi >= 0: skel.set_bone_pose_rotation(bi, skel.get_bone_rest(bi).basis.get_rotation_quaternion())

# rate: sim steps a second (a villager further off can take fewer). With threaded on,
# the steps run on a worker thread while the frame is drawn and are picked up by the
# next update (a frame later, carried on by their speed meanwhile). smooth: the bones
# are aimed every frame (else only on frames with steps; between them the cloth rides
# with the body).
func update(dt: float, speed: float, rate := STEP_HZ, smooth := true) -> void:
	if dt <= 0.0: return
	finish()
	held = false
	var H := 1.0 / rate
	var root := actor.global_position
	var reset := not ready or root.distance_to(root_prev) > 3.0 or dt > 0.25
	since += dt
	gap += dt
	var n := 0
	if reset:
		n = SETTLE; acc = 0.0; H = 1.0 / STEP_HZ
	else:
		acc += dt
		n = int(acc / H)
		acc -= n * H
		if n > MAX_STEPS: n = MAX_STEPS; acc = 0.0
	if n == 0 and not smooth: return
	if reset: _have_prev = false
	var predict := threaded and not reset
	_frames(n > 0, predict and n > 0)
	if predict and n > 0: _ahead0 = gap
	gap = 0.0
	if n > 0:
		fwd = actor.global_basis.z.normalized()
		if reset:
			_follow()
			for i in x.size(): x[i] = tg[i]; xp[i] = tg[i]; vt[i] = Vector3.ZERO
			v_root = Vector3.ZERO
		else:
			v_root = (root - root_prev) / since
		root_prev = root
		for i in tg.size(): tp[i] = tg[i]
		_follow()
		if not reset:
			var iv := 1.0 / since
			for i in tg.size(): vt[i] = (tg[i] - tp[i]) * iv
	if n > 0 and (reset or not threaded):
		_run(n, H, speed)
		since = 0.0
		_ahead0 = 0.0
		ready = true
		_aim(0.0)
		return
	# aim at what the last steps made (carried on by the particles' speed since their targets were taken)
	if ready: _aim(maxf(-1.0, (since - _ahead0) * rate))
	if n > 0:
		since = 0.0
		_task = WorkerThreadPool.add_task(_run.bind(n, H, speed), false, "cloth")

# the steps (on a worker thread: only the particles are written)
func _run(n: int, H: float, speed: float) -> void:
	var t0 := Time.get_ticks_usec()
	for i in n:
		clock += H
		_step(H, speed, clock)
	step_us = Time.get_ticks_usec() - t0

# wait for the steps on the worker thread, if any
func finish() -> void:
	if _task >= 0:
		var t0 := Time.get_ticks_usec()
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		wait_us = Time.get_ticks_usec() - t0

func _step(h: float, speed: float, t: float) -> void:
	var gust := 0.55 + 0.3 * sin(t * 0.63) + 0.2 * sin(t * 1.71 + 1.3) + 0.12 * sin(t * 3.9)
	var wind := Vector3(0.8, 0.05, 0.45).normalized() * gust - fwd * maxf(0.0, speed - maxf(0.0, v_root.dot(fwd)))
	var p0: PackedInt32Array = D.c_p0
	var cn: PackedInt32Array = D.c_n
	var damps: PackedFloat32Array = D.c_damp
	var vmaxs: PackedFloat32Array = D.c_vmax
	var fluts: PackedFloat32Array = D.c_flut
	var quads: PackedByteArray = D.c_quad
	var ks: PackedFloat32Array = D.p_ks
	var drag: PackedFloat32Array = D.p_drag
	var ih := 1.0 / h
	var hh := h * h
	var fl0 := 0.25 + speed * 0.22
	for c in p0.size():
		var damp := damps[c]
		var vmax := vmaxs[c]
		var vm2 := vmax * vmax
		var fl := fluts[c] * fl0
		var quad := quads[c] == 1
		var phc := ph[c]
		for k in cn[c]:
			var i := p0[c] + k
			var xi := x[i]
			var v := (xi - xp[i]) * ih
			var vti := vt[i]
			var rv := v - vti
			if rv.length_squared() > vm2: rv = rv.normalized() * vmax
			var w := t * (7.0 + k * 2.3) + phc
			var va := wind - vti - rv + Vector3(fl * sin(w), fl * 0.6 * sin(w * 1.37 + 1.0), fl * sin(w * 0.83 + 2.0))
			var a := va * (drag[i] * ((0.4 + va.length() * 0.125) if quad else 1.0))
			a.y += G
			a += (tg[i] - xi) * ks[i] - rv * damp
			xp[i] = xi
			x[i] = xi + vti * h + rv * (h * 0.995) + a * hh
	var ccos: PackedFloat32Array = D.p_ccos
	var csin: PackedFloat32Array = D.p_csin
	var plen: PackedFloat32Array = D.p_len
	var cpar: PackedInt32Array = D.c_parent
	var ops: Array = D.p_ops
	for it in int(D.iter):
		for c in p0.size():
			var prev := pin[c]
			var prev_t := prev
			var s: float = sc[cpar[c]]
			for k in cn[c]:
				var i := p0[c] + k
				var tv := (x[i] - prev).normalized()
				var ts := (tg[i] - prev_t).normalized()
				var cs := tv.dot(ts)
				if cs < ccos[i]:
					tv -= ts * cs
					if tv.length_squared() < 1e-10: tv = Vector3.RIGHT.cross(ts)
					tv = tv.normalized() * csin[i] + ts * ccos[i]
				x[i] = prev + tv * (plen[i] * s)
				prev = x[i]; prev_t = tg[i]
		for l in D.links:
			var ia: int = l[0]
			var ib: int = l[1]
			var L: float = l[2] * sc[cpar[l[3]]]
			var d := x[ib] - x[ia]
			var dl := maxf(d.length(), 1e-6)
			var lim := clampf(dl, L * 0.92, L * 1.08)
			if lim != dl:
				var e := (dl - lim) / dl * 0.5
				x[ia] += d * e; x[ib] -= d * e
		_smooth(0.6)
		if it < int(D.iter) - 1: continue   # (the body has the last word: pushed out once, after the last pass)
		var ccaps: Array = D.c_caps
		var clen: PackedFloat32Array = D.c_len
		for c in p0.size():
			var prev := pin[c]
			# the capsules anywhere near the chain (from its pin, as far as it reaches)
			var m := 0
			var reach: float = clen[c] * sc[cpar[c]] + 0.02
			for ci in (ccaps[c] as PackedInt32Array):
				var r := reach + cR[ci]
				if prev.distance_squared_to(cc[ci]) < r * r: m |= 1 << ci
			for k in cn[c]:
				var i := p0[c] + k
				x[i] = _collide(x[i], ops[i], prev, m)
				prev = x[i]

# panels bend together: each one's offset from its hang eased towards its neighbours'
func _smooth(wgt: float) -> void:
	var p0: PackedInt32Array = D.c_p0
	for gi in D.groups.size():
		var g: Array = D.groups[gi]
		var from: int = g[0]
		var n: int = g[1]
		var loop: bool = g[2]
		var rows: Array = _offs[gi]
		for k in rows.size():
			var o: PackedVector3Array = rows[k]
			for s in n:
				var i := p0[from + s] + k
				o[s] = x[i] - tg[i]
			for s in n:
				var l := o[(s - 1 + n) % n] if loop else o[maxi(0, s - 1)]
				var r := o[(s + 1) % n] if loop else o[mini(n - 1, s + 1)]
				var i := p0[from + s] + k
				x[i] = tg[i] + o[s] * (1.0 - wgt) + (l + r) * (wgt * 0.5)

func _collide(p: Vector3, o: Array, prev: Vector3, m: int) -> Vector3:
	var sh: int = o[0]
	if sh >= 0: p = _shell_out(p, sh)
	sh = o[1]
	if sh >= 0:
		var mp := (p + prev) * 0.5
		var m2 := _shell_out(mp, sh)
		if m2 != mp: p += (m2 - mp) * 2.0
	if m != 0:
		for ci in (o[2] as PackedInt32Array):
			if (m >> ci) & 1 and p.distance_squared_to(cc[ci]) < cR2[ci]: p = _capsule(p, ci)
	var segs: PackedInt32Array = o[3]
	if m != 0 and not segs.is_empty():
		# the link's points too, when the link comes near the capsule at all: an arm at the
		# link's middle, a leg (which long cloth wraps) at the link's point nearest it
		var lm := (p + prev) * 0.5
		var hl := (p - prev).length() * 0.5
		for ci in segs:
			if not (m >> ci) & 1: continue
			var rr := hl + cR[ci]
			if lm.distance_squared_to(cc[ci]) > rr * rr: continue
			var f := 0.5
			if cap_out[ci] == 1:
				var d1 := p - prev
				var d2 := cab[ci]
				var w0 := prev - ca[ci]
				var a11 := d1.length_squared()
				var bb := d1.dot(d2)
				var cq := d1.dot(w0)
				var e := cl2[ci]
				var fq := d2.dot(w0)
				var den := a11 * e - bb * bb
				f = clampf((bb * fq - cq * e) / den, SEG_LO, SEG_HI) if den > 1e-12 else SEG_HI
				var u := (bb * f + fq) / e
				if u < 0.0: f = clampf(-cq / maxf(a11, 1e-12), SEG_LO, SEG_HI)
				elif u > 1.0: f = clampf((bb - cq) / maxf(a11, 1e-12), SEG_LO, SEG_HI)
			var mp := prev.lerp(p, f)
			if mp.distance_squared_to(cc[ci]) > cR2[ci]: continue
			var m2 := _capsule(mp, ci)
			if m2 != mp:
				p += (m2 - mp) / f
				lm = (p + prev) * 0.5; hl = (p - prev).length() * 0.5
	var sl: int = o[4]
	if sl >= 0:
		var q: Vector3 = Wi[sl] * p
		var q2 := _ring_out(q, rings[o[5]], o[6], 1.0)
		if q2 != q: p = W[sl] * q2
	sl = o[7]
	if sl >= 0:
		var mi: Transform3D = Wi[sl]
		var b: Vector3 = mi * ((p + prev) * 0.5)
		var b2 := _ring_out(b, rings[o[8]], o[9], 2.0)
		if b2 != b: p = W[sl] * (mi * p + (b2 - b))
	if m != 0:
		for ci in (o[10] as PackedInt32Array):
			if (m >> ci) & 1 and p.distance_squared_to(cc[ci]) < cR2[ci]: p = _capsule(p, ci)
	return p

# out of a tapered capsule; a leg (out) is always under the cloth, an arm worn outside it (inn) over it
func _capsule(p: Vector3, ci: int) -> Vector3:
	var a := ca[ci]
	var ab := cab[ci]
	var u := clampf((p - a).dot(ab) / cl2[ci], 0.0, 1.0)
	var o := a + ab * u
	var b := p - o
	var d := b.length()
	var r := lerpf(cr0[ci], cr1[ci], u)
	if d >= r or d < 1e-7: return p
	var out: bool = cap_out[ci] == 1
	var inn: bool = cap_inn[ci] == 1
	if out or inn:
		var ro := Vector3(o.x - hip.x, 0.0, o.z - hip.z)
		var l := ro.length()
		if l > 1e-6:
			ro /= l
			var kk := b.dot(ro)
			if (kk < 0.0) if out else (kk > 0.0):
				b -= ro * (2.0 * kk); d = b.length()
	return o + b * (r / d)

# a point in a bone's rest frame out to a ring of the body's girth (+pad)
static func _ring_out(v: Vector3, ring: PackedFloat32Array, pad: float, push: float) -> Vector3:
	var dx := v.x
	var dz := v.z - ZC
	var d := maxf(sqrt(dx * dx + dz * dz), 1e-6)
	var ang := atan2(dx, dz)
	if ang < 0.0: ang += TAU
	var n := ring.size()
	var f := ang / TAU * n
	var i0 := int(f) % n
	var rmin := lerpf(ring[i0], ring[(i0 + 1) % n], f - floorf(f)) + pad
	if d >= rmin: return v
	var e := (rmin - d) / d * push
	return Vector3(v.x + dx * e, v.y, v.z + dz * e)

# outside the jacket's shell (rings of its radius round the chest, top row down)
func _shell_out(p: Vector3, si: int) -> Vector3:
	var sh: Dictionary = shells[si]
	var sl: int = sh.slot
	var q: Vector3 = Wi[sl] * p
	var Y: PackedFloat32Array = sh.ys
	var n := Y.size()
	if q.y > Y[0] or q.y < Y[n - 1]: return p
	var i := 0
	while i < n - 2 and q.y < Y[i + 1]: i += 1
	var v := (Y[i] - q.y) / (Y[i] - Y[i + 1])
	var R0: PackedFloat32Array = sh.rings[i]
	var R1: PackedFloat32Array = sh.rings[i + 1]
	var dx := q.x
	var dz := q.z - ZC
	var d := maxf(sqrt(dx * dx + dz * dz), 1e-6)
	var ang := atan2(dx, dz)
	if ang < 0.0: ang += TAU
	var m := R0.size()
	var f := ang / TAU * m
	var i0 := int(f) % m
	var i1 := (i0 + 1) % m
	var w := f - floorf(f)
	var rmin := lerpf(lerpf(R0[i0], R0[i1], w), lerpf(R1[i0], R1[i1], w), v) + float(sh.pad)
	if d >= rmin: return p
	q.x += dx / d * (rmin - d); q.z += dz / d * (rmin - d)
	return W[sl] * q

# turn the cloth bones so each points from its pin at its particle (carried on by
# its speed for the part of a step since the last one)
func _aim(ahead: float) -> void:
	var SGi := skel.global_transform.affine_inverse()
	var cp: PackedInt32Array = D.c_parent
	var p0: PackedInt32Array = D.c_p0
	var rq: Array = D.slot_rq
	for c in cp.size():
		var pr: int = cp[c]
		var qr: Quaternion = Pq[pr] * (rq[pr] as Quaternion)
		var parent_g: Quaternion = Pq[pr]
		var from := SGi * (Wa[pr] * (D.c_rest[c] as PackedVector3Array)[0])
		var bs: PackedInt32Array = D.c_bones[c]
		var bq: Array = D.c_bq[c]
		var dirs: PackedVector3Array = D.c_dir[c]
		for k in bs.size():
			var i := p0[c] + k
			var xd := x[i] + (x[i] - xp[i]) * ahead
			var to := SGi * xd
			var tv := (qr * dirs[k]).normalized()
			var ts := (to - from).normalized()
			var qd := Quaternion(tv, ts) if tv.dot(ts) > -0.999 else Quaternion.IDENTITY
			var want: Quaternion = qd * qr * (bq[k] as Quaternion)
			if bs[k] >= 0: skel.set_bone_pose_rotation(bs[k], parent_g.inverse() * want)
			parent_g = want
			qr = qd * qr
			from = to
