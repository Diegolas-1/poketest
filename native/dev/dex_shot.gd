extends Node3D
# Dev only: filmstrips of the Pokémon from #019 on (creature_rig.gd and its families),
# like pidgey_shot.gd: the creature on a checkered floor, stepped at a fixed 30 fps,
# frames grabbed at evenly spaced times and laid out in one picture per act, the
# camera framed to the species' size.
#   xvfb-run godot --path native --rendering-driver opengl3 --resolution 480x360 \
#     res://dev/dex_shot.tscn -- --id=rattata --acts=idle,walk,run,tackle --out=/tmp/strips
#     [--var=f] [--n=8] [--cols=8] [--dur=2.0] [--cam=dist,height,yaw_deg] (in its sizes)
#     [--v=0.4] [--battle] [--look] [--grass] [--noink] [--views=0,90,..] [--zoom=1]
# Each act is a mood() call at 0.1 s, except: walk / run (moving along +x at --v, or the
# species' walk / run speed), fly (flying), turn (on the spot), sleep (asleep from the
# start) and "a+b" (b 1 s after a). Strips: <out>/<id>_<act>.png.
var A := {}
var c: Creature
var cam: Camera3D
var acts: Array = []
var ai := 0
var t := 0.0
var shots: Array[Image] = []
var times: Array = []
var dur := 2.0
var x := 0.0
var yaw := PI / 2.0
var size := 0.3
const DT := 1.0 / 30.0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("noink"): Ink.set_enabled(false)
	acts = Array(String(A.get("acts", "idle")).split(","))
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.62, 0.78, 0.92)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 20.0
	add_child(sun)
	sun.look_at_from_position(Vector3(-0.5, 1.0, 0.8) * 10.0, Vector3.ZERO)
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	for j in 64:
		for i in 64:
			var on := ((i / 32) + (j / 32)) % 2 == 0
			img.set_pixel(i, j, Color(0.55, 0.7, 0.42) if on else Color(0.47, 0.62, 0.36))
	var fm := StandardMaterial3D.new()
	fm.albedo_texture = ImageTexture.create_from_image(img)
	fm.uv1_scale = Vector3(60, 60, 1)
	fm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	var fl := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(24, 24)
	fl.mesh = pm
	fl.material_override = fm
	add_child(fl)
	if A.has("grass"): _grass()
	cam = Camera3D.new()
	cam.fov = float(A.get("fov", "40"))
	add_child(cam)
	cam.current = true
	_start()

func _grass() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var blade := QuadMesh.new()
	blade.size = Vector2(0.035, 0.5)
	blade.center_offset = Vector3(0, 0.25, 0)
	mm.mesh = blade
	mm.instance_count = 1400
	var r := RandomNumberGenerator.new()
	r.seed = 7
	for i in mm.instance_count:
		var p := Vector3(r.randf_range(-1.2, 1.2), 0, r.randf_range(-1.2, 1.2))
		var b := Basis(Vector3.UP, r.randf() * TAU) * Basis(Vector3.RIGHT, r.randf_range(-0.25, 0.25))
		b = b.scaled(Vector3(1, r.randf_range(0.7, 1.1), 1))
		mm.set_instance_transform(i, Transform3D(b, p))
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.36, 0.62, 0.25)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = m
	add_child(mi)

func _start() -> void:
	if c: c.queue_free()
	var act: String = acts[ai]
	var id: String = A.get("id", "rattata")
	c = Creature.make(id, A.get("var", ""))
	add_child(c)
	var info := CreatureRig.info(id)
	size = float(info.get("height", 0.4))
	if id in ["ekans", "arbok"]: size *= 0.35
	x = 0.0
	yaw = PI / 2.0 if not A.has("yaw") else deg_to_rad(float(A.yaw))
	var g: Dictionary = c.get("gait") if c.get("gait") != null else {}
	if act in ["walk", "run", "fly", "glide"]:
		var v := _speed(act, g)
		x = -v * 0.8
	if act in ["fly", "glide", "hover"]: c.set("flying", true)
	if act == "glide": c.set("glide", true)
	if act == "sleep": c.sleep = true
	if A.has("auto"): c.set("auto", A.auto == "1")
	else: c.set("auto", false)
	if A.has("battle"): c.set("battle", true)
	if A.has("look"): c.look_at_pos = Vector3(1.6 * size + 1.0, 0.5, 1.2)
	if A.has("reach"): c.set("act_reach", float(A.reach))
	if A.has("wing"):
		var wv := Array(String(A.wing).split(",")).map(func(s): return float(s))
		c.set("debug_wing", Vector4(wv[0], wv[1], wv[2], wv[3]))
	c.position = Vector3(x, 0, 0)
	c.rotation.y = yaw
	c.reset()
	t = 0.0
	var d0 = c.get("durs")
	var dd := 2.0
	if d0 is Dictionary and (d0 as Dictionary).has(act.split("+")[0]): dd = float(d0[act.split("+")[0]]) + 0.3
	elif c.get("DURS") is Dictionary and (c.get("DURS") as Dictionary).has(act.split("+")[0]): dd = float(c.get("DURS")[act.split("+")[0]]) + 0.3
	match act.split("+")[0]:
		"idle": dd = 3.0
		"walk": dd = 1.6
		"run": dd = 1.0
		"sleep": dd = 3.0
		"turn": dd = 2.0
	dur = float(A.get("dur", str(dd)))
	if "+" in act: dur += 1.0
	var n := int(A.get("n", "8"))
	times.clear()
	shots.clear()
	var t0 := float(A.get("t0", "0.1"))
	for i in n: times.append(t0 + dur * float(i) / float(maxi(1, n - 1)))

func _speed(act: String, g: Dictionary) -> float:
	if A.has("v"): return float(A.v)
	if act == "walk": return float(g.get("walk_v", 0.4))
	if act == "run": return float(g.get("run_v", 1.6)) * 1.15
	return 2.0

func _process(_dt: float) -> void:
	if ai >= acts.size(): return
	for k in ["overlay", "menu"]:
		var ov = Settings.get(k)
		if ov and "visible" in ov: ov.visible = false
	var act: String = acts[ai]
	var parts := act.split("+")
	var v := 0.0
	var t0 := t
	t += DT
	if t0 < 0.1 and t >= 0.1 and not parts[0] in ["idle", "walk", "run", "fly", "glide", "hover", "turn", "sleep"]: c.mood(parts[0])
	if parts.size() > 1 and t0 < 1.1 and t >= 1.1: c.mood(parts[1])
	var g: Dictionary = c.get("gait") if c.get("gait") != null else {}
	match parts[0]:
		"walk", "run": v = _speed(parts[0], g) * Creature.sm(0.0, 0.3, t)
		"fly", "glide": v = _speed(parts[0], g)
		"turn": yaw += DT * 2.0
	x += v * DT
	c.position = Vector3(x, 0, 0)
	c.rotation.y = yaw
	c.animate(DT, v)
	for k in ["eyeoff", "mouthoff"]:
		# (dev) a face sheet's cell forced (uv offset), to find a rip's layout
		if A.has(k) and c.get("eye_mat" if k == "eyeoff" else "mouth_mat"):
			var o := Array(String(A[k]).split(",")).map(func(s): return float(s))
			(c.get("eye_mat" if k == "eyeoff" else "mouth_mat") as ShaderMaterial).set_shader_parameter("uv_off", Vector2(o[0], o[1]))
	if A.has("debug") and Engine.get_process_frames() % 6 == 0:
		var out := "t=%.2f" % t
		for k in String(A.debug).split(";"):
			out += " %s=%s" % [k, str(c.get(k))]
		print(out)
	var cv := Array(String(A.get("cam", "3.2,0.9,0")).split(",")).map(func(s): return float(s))
	var z := float(A.get("zoom", "1"))
	var fy := float(A.get("fy", "0.45")) * size
	if c.get("height") != null: fy += float(c.get("height"))
	var focus := Vector3(x if A.has("track") or parts[0] in ["walk", "run", "fly", "glide"] else 0.0, fy, 0.0)
	if A.has("headcam") and c.has_method("point"):
		# (dev) the face close up: the head at the middle, a third of its size away
		focus = c.call("point", "head")
	var ang := deg_to_rad(cv[2])
	if A.has("views"):
		var vs := Array(String(A.views).split(","))
		ang = deg_to_rad(float(vs[shots.size() % vs.size()]))
	var dist: float = cv[0] * size / z
	cam.look_at_from_position(focus + Vector3(sin(ang) * dist, cv[1] * size / z, cos(ang) * dist), focus)
	Ink.set_focus(cam.global_position)
	if not times.is_empty() and t >= times[0] - 1e-4:
		times.pop_front()
		await RenderingServer.frame_post_draw
		shots.append(get_viewport().get_texture().get_image())
		if times.is_empty(): _save(act)

func _save(act: String) -> void:
	var cols := mini(int(A.get("cols", "8")), shots.size())
	var w := shots[0].get_width()
	var h := shots[0].get_height()
	var rows := (shots.size() + cols - 1) / cols
	var out := Image.create(w * cols, h * rows, false, shots[0].get_format())
	for i in shots.size():
		out.blit_rect(shots[i], Rect2i(0, 0, w, h), Vector2i((i % cols) * w, (i / cols) * h))
	var dir: String = A.get("out", "user://strips")
	DirAccess.make_dir_recursive_absolute(dir)
	var id: String = A.get("id", "rattata") + ("_" + String(A.get("var")) if A.has("var") else "")
	var f := "%s/%s_%s.png" % [dir, id, act.replace("+", "-")]
	out.save_png(f)
	print("saved ", f)
	ai += 1
	if ai >= acts.size(): get_tree().quit()
	else: _start()
