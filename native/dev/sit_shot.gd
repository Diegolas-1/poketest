extends Node3D
# Dev only: Ash on open ground doing one idle action (sit or crouch), for render
# checks of the seat, the feet and the cloth against the ground, with numbers.
#   godot --path native res://dev/sit_shot.tscn -- [--act=sit|crouch|stretch|stand|walk|run|jump] [--len=14]
#       [--view=side|front|back|three|close|low|cfront|cthree|cside] [--slope=0.0] [--slopez=0.0]
#       [--measure] [--diag] [--at=frames] [--speed=m/s] [--dump=file] [--nothread]
# --diag: with --measure, where the jacket meets the legs (by rest height), the sim's
# particles against its leg tubes, and the body's own vertices inside the legs.
# --slope / --slopez: the ground tilts (rise per metre along x, his side / along z,
# the way he faces), with the actor's ground lookup following it. --measure prints per frame (the body skinned
# on the CPU): the seat's lowest point (the jeans above mid-thigh) minus the
# ground, each shoe's lowest point minus the ground and how far its toe slid since
# the action began, and the lowest point of the jacket, the sleeves, the jeans
# (cuffs), the hair and the cloth particles minus the ground, the frame's animate()
# time, and the jacket's vertices inside the jeans' legs (thigh and shin tubes of the
# jeans' own radius, from the body skinned at the first measured frame): how many and
# how deep; and a summary at the end. walk / run: on the spot at that speed (the ground
# moving under him, the camera following); jump: a running jump (--speed=, default
# a run) at --at.
var a: CastActor
var t := 0.0
var frame := 0
var act := "sit"
var ln := 14.0
var view := "side"
var slope := 0.0
var slopez := 0.0
var measure := false
var start_at := 12
var cam: Camera3D
var M: Array = []          # per mesh: {name, v, b, w, bb (bone per bind), bind}
var toe0 := {}
var worst := {}
var anim_us := 0
var speed := 0.0
var loco := false
var vy := 0.0
var air := false
var legs: Array = []       # per leg segment: [bone a, bone b, radii per bin]
const NB := 12
var pen_n := 0
var n_rigid := 0           # (of them, those riding rigidly with the chest: above the cloth bones' pins)
var rig_n := 0
var diag := false
var dump := ""             # --dump=path: the jacket's skinned vertices at frame start_at + 20, one per line
var pen_d := 0.0

func _ground(x: float, z: float) -> float: return slope * x + slopez * z

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		if x.begins_with("--act="): act = x.substr(6)
		elif x.begins_with("--len="): ln = float(x.substr(6))
		elif x.begins_with("--view="): view = x.substr(7)
		elif x.begins_with("--slope="): slope = float(x.substr(8))
		elif x.begins_with("--slopez="): slopez = float(x.substr(9))
		elif x == "--measure": measure = true
		elif x.begins_with("--at="): start_at = int(x.substr(5))
		elif x.begins_with("--speed="): speed = float(x.substr(8))
		elif x.begins_with("--dump="): dump = x.substr(7)
		elif x == "--diag": diag = true
		elif x == "--nothread": ClothSim.threaded = false
	loco = act in ["stand", "walk", "run", "jump"]
	if loco and not Array(OS.get_cmdline_user_args()).any(func(x): return x.begins_with("--at=")): start_at = 30
	if loco and speed == 0.0: speed = {"stand": 0.0, "walk": 3.0, "run": CastActor.RUN_V, "jump": CastActor.RUN_V}[act]
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(30, 30); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	fl.transform.basis = Basis(Vector3(1, slope, 0), Vector3(0, 1, 0), Vector3(0, slopez, 1))
	for i in 15:
		var s := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(30, 0.004, 0.02); s.mesh = bm; fl.add_child(s)
		s.position = Vector3(0, 0.002, -7 + i * 1.0)
		var sm := StandardMaterial3D.new(); sm.albedo_color = Color(0.45, 0.6, 0.38); s.material_override = sm
	a = CastActor.make("ash"); add_child(a)
	a.ground = _ground
	a.position = Vector3(0, _ground(0, -10.0 if loco else 0.0), -10.0 if loco else 0.0)
	cam = Camera3D.new(); add_child(cam); cam.fov = 32
	if measure: _prep()

func _prep() -> void:
	for mi in a.meshes:
		var arr := mi.mesh.surface_get_arrays(0)
		var sk: Skin = mi.skin
		var bb := PackedInt32Array()
		var bind: Array[Transform3D] = []
		for i in sk.get_bind_count():
			var bi := sk.get_bind_bone(i)
			if bi < 0: bi = a.skel.find_bone(sk.get_bind_name(i))
			bb.append(bi); bind.append(sk.get_bind_pose(i))
		M.append({"name": String(mi.name), "v": arr[Mesh.ARRAY_VERTEX], "b": arr[Mesh.ARRAY_BONES], "w": arr[Mesh.ARRAY_WEIGHTS], "bb": bb, "bind": bind})

# skinned positions (world) of one mesh's vertices that pass keep(rest vertex)
func _skin(m: Dictionary, keep: Callable) -> PackedVector3Array:
	var G := a.skel.global_transform
	var mats: Array[Transform3D] = []
	var bb: PackedInt32Array = m.bb
	for i in bb.size(): mats.append(G * a.skel.get_bone_global_pose(bb[i]) * (m.bind[i] as Transform3D))
	var out := PackedVector3Array()
	var V: PackedVector3Array = m.v
	var B = m.b
	var W = m.w
	for i in V.size():
		if not keep.call(V[i]): continue
		var p := Vector3.ZERO
		for j in 4:
			var w: float = W[i * 4 + j]
			if w > 0.0: p += (mats[B[i * 4 + j]] * V[i]) * w
		out.append(p)
	return out

func _low(pts: PackedVector3Array) -> float:
	var lo := INF
	for p in pts: lo = minf(lo, p.y - _ground(p.x, p.z))
	return lo

func _mesh(n: String) -> Dictionary:
	for m in M: if m.name == n: return m
	return {}

func _note(key: String, v: float, lo: bool) -> void:
	if not worst.has(key): worst[key] = v
	else: worst[key] = minf(worst[key], v) if lo else maxf(worst[key], v)

func _bpos(n: String) -> Vector3:
	return a.skel.global_transform * a.skel.get_bone_global_pose(a.bones[n]).origin

# the jeans' legs: per segment (hip joint to knee, knee to ankle) the median distance of
# the jeans' vertices nearest it from the bone line, per stretch along it
func _legs() -> void:
	var segs := [["LThigh", "LLeg"], ["LLeg", "LFoot"], ["RThigh", "RLeg"], ["RLeg", "RFoot"]]
	var bins: Array = []
	for sg in segs:
		var b := []
		for i in NB: b.append([])
		bins.append(b)
	for p in _skin(_mesh("ash_pants"), func(_v): return true):
		var best := INF; var bs := -1; var bu := 0.0
		for si in segs.size():
			var A := _bpos(segs[si][0]); var B := _bpos(segs[si][1])
			var u := clampf((p - A).dot(B - A) / (B - A).length_squared(), 0.0, 1.0)
			var d := p.distance_to(A.lerp(B, u))
			if d < best: best = d; bs = si; bu = u
		bins[bs][mini(NB - 1, int(bu * NB))].append(best)
	for si in segs.size():
		var r := PackedFloat32Array()
		for i in NB:
			var l: Array = bins[si][i]
			l.sort()
			r.append(l[l.size() / 2] if l.size() > 0 else (r[i - 1] if i > 0 else 0.07))
		legs.append([segs[si][0], segs[si][1], r])
		print("legs %s-%s r(cm): %s" % [segs[si][0], segs[si][1], " ".join(Array(r).map(func(v): return "%.1f" % (v * 100.0)))])

# the jacket's vertices inside the jeans' legs (past the top fifth of the thigh, where
# the leg runs into the hips): count, and the deepest (m)
func _pen() -> Vector2:
	var n := 0
	var dmax := 0.0
	var S := []
	for L in legs: S.append([_bpos(L[0]), _bpos(L[1]), L[2], L[0].ends_with("Thigh")])
	var JM := _mesh("ash_jacket")
	var JV: PackedVector3Array = JM.v
	var hist := {}
	var vi := -1
	n_rigid = 0
	for p in _skin(JM, func(_v): return true):
		vi += 1
		var deep := 0.0
		for sg in S:
			var A: Vector3 = sg[0]; var B: Vector3 = sg[1]
			var u := (p - A).dot(B - A) / (B - A).length_squared()
			if u < (0.2 if sg[3] else 0.0) or u > 1.0: continue
			var r: float = sg[2][mini(NB - 1, int(u * NB))]
			var d := p.distance_to(A.lerp(B, u))
			if d < r - 0.003: deep = maxf(deep, r - d)
		if deep > 0.0:
			if JV[vi].y < 0.9: n += 1; dmax = maxf(dmax, deep)
			else: n_rigid += 1
			var key := "y%.2f %s" % [snappedf(JV[vi].y, 0.02), "front" if JV[vi].z > 0.03 else ("side" if JV[vi].z > -0.04 else "back")]
			hist[key] = hist.get(key, 0) + 1
	if diag and n > 0:
		print("   where (rest height, part): ", hist)
		for mm in M:
			if mm.name in ["ash_jacket", "ash_pants", "shoessboots"]: continue
			var cnt := 0
			for p in _skin(mm, func(v: Vector3): return v.y > 0.75 and v.y < 1.1):
				for sg in S:
					var A: Vector3 = sg[0]; var B: Vector3 = sg[1]
					var u := (p - A).dot(B - A) / (B - A).length_squared()
					if u < (0.2 if sg[3] else 0.0) or u > 1.0: continue
					if p.distance_to(A.lerp(B, u)) < sg[2][mini(NB - 1, int(u * NB))] - 0.003: cnt += 1; break
			print("   %s: %d vertices (rest 0.75-1.1 m) inside the legs" % [mm.name, cnt])
		var cs = a.cloth
		var lc: PackedInt32Array = cs.D.leg_caps
		var o := "   lift %.2f caps r " % cs.lift
		for ci in lc: o += "%.3f/%.3f " % [cs.cr0[ci], cs.cr1[ci]]
		print(o)
		var SK := _skin(JM, func(_v): return true)
		for c in [0, 1, 7, 14]:
			var rest: Array = CastActor.data().looks.ash.sim.chains[c].rest
			for k in [1, 2]:
				var R := Vector3(rest[k][0], rest[k][1], rest[k][2])
				var bi := 0; var bd := INF
				for v in JV.size():
					if JV[v].distance_to(R) < bd: bd = JV[v].distance_to(R); bi = v
				print("   panel %d particle %d: mesh %s particle %s (rest gap %.1f mm)" % [c, k - 1, SK[bi], cs.x[cs.D.c_p0[c] + k - 1], bd * 1000])
		for c in [0, 1, 2, 3, 11, 12, 13, 14]:
			var q := "   panel %2d fw %.2f:" % [c, cs.D.c_fw[c]]
			for k in 2:
				var i: int = cs.D.c_p0[c] + k
				var P: Vector3 = cs.x[i]
				var worst := 1.0
				for ci in lc:
					var u := clampf((P - cs.ca[ci]).dot(cs.cab[ci]) / cs.cl2[ci], 0.0, 1.0)
					worst = minf(worst, P.distance_to(cs.ca[ci] + cs.cab[ci] * u) - lerpf(cs.cr0[ci], cs.cr1[ci], u))
				q += " p%d out %.1f cm (tg %.1f)" % [k, worst * 100.0, (cs.tg[i] - P).length() * 100.0]
			print(q)
	return Vector2(n, dmax)

func _measure() -> void:
	var ph := ""
	var lt: float = a.idles.P.act.lt if a.idles.P.act else -1.0
	var pn := _pen()
	pen_n = maxi(pen_n, int(pn.x)); pen_d = maxf(pen_d, pn.y); rig_n = maxi(rig_n, n_rigid)
	if loco and diag:
		var cs = a.cloth
		var lc: PackedInt32Array = cs.D.leg_caps
		var clr := INF
		for c in 15:
			for k in 2:
				var P: Vector3 = cs.x[cs.D.c_p0[c] + k]
				for ci in lc:
					var u := clampf((P - cs.ca[ci]).dot(cs.cab[ci]) / cs.cl2[ci], 0.0, 1.0)
					clr = minf(clr, P.distance_to(cs.ca[ci] + cs.cab[ci] * u) - lerpf(cs.cr0[ci], cs.cr1[ci], u))
		var old := INF
		for c in 15:
			var P: Vector3 = cs.x[cs.D.c_p0[c] + 1]
			for ci in [6, 7]:
				var u := clampf((P - cs.ca[ci]).dot(cs.cab[ci]) / cs.cl2[ci], 0.0, 1.0)
				old = minf(old, P.distance_to(cs.ca[ci] + cs.cab[ci] * u) - lerpf(cs.cr0[ci], cs.cr1[ci], u))
		print("   lift %.2f, the jacket's particles clear of the legs' tubes by %.1f cm (of the old thigh capsules %.1f cm)" % [cs.lift, clr * 100.0, old * 100.0])
	if loco:
		print("f%04d %-5s y %5.2f air %d | legs in jacket %4d deepest %5.1f cm (+%d on the chest) | animate %d us" % [frame, act, a.position.y, 1 if air else 0, int(pn.x), pn.y * 100, n_rigid, anim_us])
		return
	var seat := _low(_skin(_mesh("ash_pants"), func(v: Vector3): return v.y > 0.5))
	var cuffs := _low(_skin(_mesh("ash_pants"), func(v: Vector3): return v.y < 0.3))
	var feet := []
	var slip := []
	for s in [1.0, -1.0]:
		var sh := _skin(_mesh("shoessboots"), func(v: Vector3): return v.x * s > 0.0)
		feet.append(_low(sh))
		var toe := a.skel.global_transform * a.skel.get_bone_global_pose(a.bones["LToe" if s > 0 else "RToe"]).origin
		var key := "L" if s > 0 else "R"
		if a.idles.P.act and not toe0.has(key): toe0[key] = toe
		slip.append(Vector2(toe.x - toe0[key].x, toe.z - toe0[key].z).length() if toe0.has(key) else 0.0)
	var jk := _low(_skin(_mesh("ash_jacket"), func(_v): return true))
	var sl := _low(_skin(_mesh("ash_sleeves"), func(_v): return true))
	var ex := _low(_skin(_mesh("ash_extra"), func(_v): return true))
	var cl := INF
	if a.cloth:
		for p in a.cloth.x: cl = minf(cl, p.y - _ground(p.x, p.z))
	if a.idles.P.act:
		var name: String = a.idles.P.act.name
		var seated := (lt > 3.6 and lt < 11.8) if name == "sit" else (lt > 2.0 and lt < 5.4)
		ph = "seated" if seated else "moving"
		if seated: _note("seat_lo", seat, true); _note("seat_hi", seat, false)
		for i in 2: _note("foot_lo", feet[i], true); _note("foot_hi_" + ph, feet[i], false); _note("slip", slip[i], false)
		_note("jacket", jk, true); _note("sleeves", sl, true); _note("cuffs", cuffs, true); _note("hair", ex, true); _note("particles", cl, true)
	print("f%04d t=%5.2f %-6s seat %6.1f cm | feet L %5.1f R %5.1f cm slip L %4.1f R %4.1f cm | jacket %6.1f sleeves %6.1f cuffs %5.1f hair %6.1f particles %6.1f cm | legs in jacket %4d deepest %5.1f cm (+%d on the chest) | holder %.4f animate %d us" % [
		frame, lt, ph, seat * 100, feet[0] * 100, feet[1] * 100, slip[0] * 100, slip[1] * 100, jk * 100, sl * 100, cuffs * 100, ex * 100, cl * 100, int(pn.x), pn.y * 100, n_rigid, a.holder.position.y, anim_us])

func _process(dt: float) -> void:
	frame += 1
	t += dt
	if frame == start_at and not loco: a.idles.force(act, ln)
	if loco:
		# along +z at the speed (he faces +z), a jump at start_at
		var v := speed if frame > 4 else 0.0
		a.position.z += v * dt
		var gy := _ground(a.position.x, a.position.z)
		if act == "jump" and frame == start_at: vy = 4.2; air = true
		if air:
			vy -= 9.8 * dt
			a.position.y += vy * dt
			if a.position.y <= gy and vy < 0.0: a.position.y = gy; air = false
		else: a.position.y = gy
	var t0 := Time.get_ticks_usec()
	a.animate(dt, speed if frame > 4 or not loco else 0.0, air)
	anim_us = Time.get_ticks_usec() - t0
	if measure and frame == 3: _legs()
	if dump != "" and measure and frame == start_at + 20:
		var f := FileAccess.open(dump, FileAccess.WRITE)
		for p in _skin(_mesh("ash_jacket"), func(_v): return true): f.store_line("%.5f %.5f %.5f" % [p.x, p.y, p.z])
		f.close()
	if measure and frame > start_at - 3: _measure()
	var over := (frame > start_at and a.idles.P.act == null) if not loco else frame > start_at + 40
	if over and measure and not worst.has("_done"):
		worst["_done"] = 1.0
		var o := []
		for k in worst: if k != "_done": o.append("%s %.1f" % [k, worst[k] * 100.0])
		print("SUMMARY %s slope %.2f,%.2f (cm): %s" % [act, slope, slopez, ", ".join(o)])
		print("PEN %s: most jacket vertices (of the moving part) inside the legs %d, deepest %.1f cm; on the chest (rigid) %d" % [act, pen_n, pen_d * 100.0, rig_n])
	var c := a.position + Vector3(0, 0.55, 0)
	var off := Vector3(3.6, 0.35, 0)
	match view:
		"front": off = Vector3(0, 0.35, 3.6)
		"back": off = Vector3(0, 0.5, -3.6)
		"three": off = Vector3(2.5, 0.6, 2.5)
		"cfront": off = Vector3(0, 0.3, 1.9); c = a.position + Vector3(0, 0.4, 0)
		"cthree": off = Vector3(1.35, 0.45, 1.35); c = a.position + Vector3(0, 0.4, 0)
		"cside": off = Vector3(1.9, 0.2, 0.2); c = a.position + Vector3(0, 0.4, 0)
		"close": off = Vector3(2.2, 0.08, -0.25); c = a.position + Vector3(0, 0.35, -0.2)
		"low": off = Vector3(2.0, -0.25 + 0.4, -1.2); c = a.position + Vector3(0, 0.25, -0.25)
	cam.look_at_from_position(c + off, c)
