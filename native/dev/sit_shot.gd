extends Node3D
# Dev only: Ash on open ground doing one idle action (sit or crouch), for render
# checks of the seat, the feet and the cloth against the ground, with numbers.
#   godot --path native res://dev/sit_shot.tscn -- [--act=sit|crouch] [--len=14]
#       [--view=side|front|back|three|close|low] [--slope=0.0] [--slopez=0.0] [--measure] [--at=frames]
# --slope / --slopez: the ground tilts (rise per metre along x, his side / along z,
# the way he faces), with the actor's ground lookup following it. --measure prints per frame (the body skinned
# on the CPU): the seat's lowest point (the jeans above mid-thigh) minus the
# ground, each shoe's lowest point minus the ground and how far its toe slid since
# the action began, and the lowest point of the jacket, the sleeves, the jeans
# (cuffs), the hair and the cloth particles minus the ground, the frame's animate()
# time; and a summary at the end.
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
	a.position = Vector3(0, _ground(0, 0), 0)
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

func _measure() -> void:
	var ph := ""
	var lt: float = a.idles.P.act.lt if a.idles.P.act else -1.0
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
	print("f%04d t=%5.2f %-6s seat %6.1f cm | feet L %5.1f R %5.1f cm slip L %4.1f R %4.1f cm | jacket %6.1f sleeves %6.1f cuffs %5.1f hair %6.1f particles %6.1f cm | holder %.4f animate %d us" % [
		frame, lt, ph, seat * 100, feet[0] * 100, feet[1] * 100, slip[0] * 100, slip[1] * 100, jk * 100, sl * 100, cuffs * 100, ex * 100, cl * 100, a.holder.position.y, anim_us])

func _process(dt: float) -> void:
	frame += 1
	t += dt
	if frame == start_at: a.idles.force(act, ln)
	var t0 := Time.get_ticks_usec()
	a.animate(dt, 0.0, false)
	anim_us = Time.get_ticks_usec() - t0
	if measure and frame > start_at - 3: _measure()
	if frame > start_at and a.idles.P.act == null and measure and not worst.has("_done"):
		worst["_done"] = 1.0
		var o := []
		for k in worst: if k != "_done": o.append("%s %.1f" % [k, worst[k] * 100.0])
		print("SUMMARY %s slope %.2f,%.2f (cm): %s" % [act, slope, slopez, ", ".join(o)])
	var c := a.position + Vector3(0, 0.55, 0)
	var off := Vector3(3.6, 0.35, 0)
	match view:
		"front": off = Vector3(0, 0.35, 3.6)
		"back": off = Vector3(0, 0.5, -3.6)
		"three": off = Vector3(2.5, 0.6, 2.5)
		"close": off = Vector3(2.2, 0.08, -0.25); c = a.position + Vector3(0, 0.35, -0.2)
		"low": off = Vector3(2.0, -0.25 + 0.4, -1.2); c = a.position + Vector3(0, 0.25, -0.25)
	cam.look_at_from_position(c + off, c)
