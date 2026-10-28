extends Node3D
# Dev only: filmstrips of a Pokémon's acts (made for Pidgey, works for any Creature):
# the creature on a checkered floor, stepped at a fixed 30 fps, the frame grabbed at
# evenly spaced times and laid out in one picture per act.
#   xvfb-run godot --path native --rendering-driver opengl3 --resolution 480x360 \
#     res://dev/pidgey_shot.tscn -- --acts=idle,peck,gust --out=/tmp/strips [--id=pidgey]
#     [--n=8] [--cols=8] [--dur=2.0] [--cam=dist,height,yaw_deg] [--fy=0.15] [--v=0.4]
#     [--grass] (a tuft of tall grass round it) [--noink]
# Each act is a mood() call at 0.1 s, except: walk / run (moves along +x at --v, or 0.35 /
# 1.6 m/s), fly (flying at its height, moving), glide, hover (flying, standing still),
# turn (on the spot), and any "a+b" (b 1 s after a). Strips: <out>/<id>_<act>.png.
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
const DT := 1.0 / 30.0
const DURS := {"idle": 3.0, "walk": 1.2, "run": 0.8, "peck": 1.4, "look": 1.8, "ruffle": 1.4, "startle": 1.0, "hop": 0.9,
	"takeoff": 1.6, "fly": 0.6, "glide": 1.0, "land": 1.8, "hide": 2.0, "gust": 3.6, "tackle": 1.3, "quick_attack": 1.2,
	"sand_attack": 1.6, "hurt": 1.0, "flinch": 0.6, "flee": 1.4, "faint": 2.2, "taunt": 1.8, "wings_spread": 2.2, "hover": 0.6}

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
	sun.directional_shadow_max_distance = 12.0
	add_child(sun)
	sun.look_at_from_position(Vector3(-0.5, 1.0, 0.8) * 10.0, Vector3.ZERO)
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	for j in 64:
		for i in 64:
			var on := ((i / 32) + (j / 32)) % 2 == 0
			img.set_pixel(i, j, Color(0.55, 0.7, 0.42) if on else Color(0.47, 0.62, 0.36))
	var fm := StandardMaterial3D.new()
	fm.albedo_texture = ImageTexture.create_from_image(img)
	fm.uv1_scale = Vector3(40, 40, 1)
	fm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	var fl := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(8, 8)
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
	# a patch of tall blades (0.35 - 0.55 m) round the middle
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var blade := QuadMesh.new()
	blade.size = Vector2(0.035, 0.5)
	blade.center_offset = Vector3(0, 0.25, 0)
	mm.mesh = blade
	mm.instance_count = 900
	var r := RandomNumberGenerator.new()
	r.seed = 7
	for i in mm.instance_count:
		var p := Vector3(r.randf_range(-0.9, 0.9), 0, r.randf_range(-0.9, 0.9))
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
	c = Creature.make(A.get("id", "pidgey"))
	add_child(c)
	x = 0.0
	yaw = PI / 2.0 if not A.has("yaw") else deg_to_rad(float(A.yaw))
	if act in ["walk", "run", "fly", "glide"]: x = -float(A.get("from", "0.5"))
	if act in ["fly", "glide", "hover"]: c.set("flying", true)
	if act == "glide": c.set("glide", true)
	if A.has("wing"):
		var wv := Array(String(A.wing).split(",")).map(func(s): return float(s))
		c.set("debug_wing", Vector4(wv[0], wv[1], wv[2], wv[3]))
	if A.has("auto"): c.set("auto", A.auto == "1")
	if A.has("showopen"): c.set("debug_show_open", true)
	if A.has("battle"): c.set("battle", true)
	if A.has("look"): c.look_at_pos = Vector3(1.2, 0.5, 0.6)
	c.position = Vector3(x, 0, 0)
	c.rotation.y = yaw
	c.reset()
	t = 0.0
	dur = float(A.get("dur", str(DURS.get(act.split("+")[0], 2.0))))
	if "+" in act: dur += 1.0
	var n := int(A.get("n", "8"))
	times.clear()
	shots.clear()
	var t0 := float(A.get("t0", "0.1"))
	if A.has("t0"): dur = float(A.get("dur", "1.0"))
	for i in n: times.append(t0 + dur * float(i) / float(maxi(1, n - 1)))

func _process(_dt: float) -> void:
	if ai >= acts.size(): return
	var ov = Settings.get("overlay")
	if ov: ov.visible = false
	var act: String = acts[ai]
	var parts := act.split("+")
	var v := 0.0
	var t0 := t
	t += DT
	if t0 < 0.1 and t >= 0.1 and not parts[0] in ["idle", "walk", "run", "fly", "glide", "hover", "turn"]: c.mood(parts[0])
	if parts.size() > 1 and t0 < 1.1 and t >= 1.1: c.mood(parts[1])
	match parts[0]:
		"walk": v = float(A.get("v", "0.35")) * Creature.sm(0.0, 0.3, t)
		"run": v = float(A.get("v", "1.6")) * Creature.sm(0.0, 0.3, t)
		"fly", "glide": v = float(A.get("v", "2.0"))
		"turn": yaw += DT * 2.0
	x += v * DT
	c.position = Vector3(x, 0, 0)
	c.rotation.y = yaw
	c.animate(DT, v)
	var cv := Array(String(A.get("cam", "1.3,0.35,0")).split(",")).map(func(s): return float(s))
	var fy := float(A.get("fy", "0.16"))
	if c.get("height") != null: fy += float(c.get("height"))
	var focus := Vector3(x if A.has("track") or parts[0] in ["walk", "run", "fly", "glide"] else 0.0, fy, 0.0)
	var ang := deg_to_rad(cv[2])
	if A.has("views"):
		# --views=a,b,..: each grabbed frame from the next of these camera yaws (degrees)
		var vs := Array(String(A.views).split(","))
		ang = deg_to_rad(float(vs[shots.size() % vs.size()]))
	cam.look_at_from_position(focus + Vector3(sin(ang) * cv[0], cv[1], cos(ang) * cv[0]), focus)
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
	var f := "%s/%s_%s.png" % [dir, A.get("id", "pidgey"), act.replace("+", "-")]
	out.save_png(f)
	print("saved ", f)
	ai += 1
	if ai >= acts.size(): get_tree().quit()
	else: _start()
