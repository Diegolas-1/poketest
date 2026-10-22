extends Node3D
# Dev only: a Pokémon on its own on a checkered floor (a planted foot shows
# against the squares), for close-ups and gait filmstrips.
#   xvfb-run godot --path native --rendering-driver opengl3 res://dev/creature_shot.tscn \
#     --write-movie /tmp/f.png --fixed-fps 30 --quit-after 90 -- --id=caterpie --act=crawl [--v=0.5]
#     [--cam=dist,height,yaw_deg] [--track] [--look] [--noink]
# acts: idle, crawl (along +x, side on), circle (round and round), stopgo (crawl, stop, crawl),
# happy, hop, sleep, talk, run (Doduo: --v=3.5), peck, call; Doduo heads: argue, glance
# (--heads prints how close the two heads come; --soft turns their collision off)
var A := {}
var c: Creature
var cam: Camera3D
var t := 0.0
var x := 0.0
var yaw := PI / 2.0
var target: Node3D
var _plant := {}
var _us := 0.0
var _n := 0
var _slip := 0.0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("noink"): Ink.set_enabled(false)
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
	# the floor: 10 cm squares
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	for j in 64:
		for i in 64:
			var on := ((i / 32) + (j / 32)) % 2 == 0
			img.set_pixel(i, j, Color(0.55, 0.7, 0.42) if on else Color(0.47, 0.62, 0.36))
	var tex := ImageTexture.create_from_image(img)
	var fm := StandardMaterial3D.new()
	fm.albedo_texture = tex
	fm.uv1_scale = Vector3(20, 20, 1)
	fm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	var fl := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(4, 4)
	fl.mesh = pm
	fl.material_override = fm
	add_child(fl)
	var id: String = A.get("id", "caterpie")
	c = Creature.make(id)
	add_child(c)
	cam = Camera3D.new()
	cam.fov = float(A.get("fov", "40"))
	add_child(cam)
	cam.current = true
	if A.has("look"):
		target = Node3D.new()
		add_child(target)
	var act: String = A.get("act", "idle")
	if act in ["crawl", "stopgo", "run"]: x = -float(A.get("from", "0.9"))
	c.position = Vector3(x, 0, 0)
	c.rotation.y = yaw
	if act == "sleep": c.sleep = true
	if A.has("soft") and "heads_solid" in c: c.heads_solid = false

var _gap := 1e9
var _pen := -1e9
func _process(dt: float) -> void:
	t += dt
	var ov = Settings.get("overlay")
	if ov: ov.visible = false
	var act: String = A.get("act", "idle")
	var v := 0.0
	var vmax := float(A.get("v", "0.5"))
	match act:
		"crawl", "run":
			v = vmax * Creature.sm(0.0, 0.6, t)
		"stopgo":
			v = vmax * (Creature.sm(0.0, 0.5, t) - Creature.sm(1.6, 1.9, t) + Creature.sm(3.2, 3.5, t))
		"circle":
			v = vmax
			yaw += v / 0.5 * dt
		"happy": if int(t * 30) == 15: c.mood("happy")
		"hop": if int(t * 30) == 15: c.mood("hop")
		"talk": if int(t * 30) % 30 == 10: c.mood("talk")
		"peck", "call": if int(t * 30) == 15: c.mood(act)
		"argue": if int(t * 30) % 90 == 15: c.mood("argue")
		"glance":
			for h in c.heads:
				if h.act != "glance": h.act = "glance"; h.at = 0.0; h.dur = 1e9
	if act in ["crawl", "stopgo", "run"]:
		x += v * dt
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	if act == "circle":
		c.position += fwd * v * dt
	else:
		c.position = Vector3(x, 0, 0)
	c.rotation.y = yaw
	if target:
		target.position = Vector3(sin(t * 0.8) * 1.2, 1.2 + sin(t * 0.5) * 0.4, 1.5)
		c.look_at_pos = target.position
	var t0 := Time.get_ticks_usec()
	c.animate(dt, v)
	_us += Time.get_ticks_usec() - t0; _n += 1
	if A.has("cost") and _n % 60 == 0: print("animate %.3f ms avg" % (_us / 1000.0 / _n))
	if A.has("slip"):
		var cs := c.contacts()
		for k in cs.size():
			var w = cs[k]
			if w != null:
				if _plant.has(k):
					var d := Vector2(w.x - _plant[k].x, w.z - _plant[k].z).length()
					if d > _slip + 0.005 and A.has("why"): print("t %.2f contact %d slipped %.3f %s" % [t, k, d, c.get("phase")])
					_slip = maxf(_slip, d)
				else: _plant[k] = w
			else: _plant.erase(k)
		if int(t * 30) % 30 == 0: print("slip max %.4f m  speed %.2f" % [_slip, v])
	if A.has("heads") and c.has_method("head_clearance"):
		var hc: Vector2 = c.head_clearance()
		_gap = minf(_gap, hc.x); _pen = maxf(_pen, hc.y)
		if int(t * 30) % 30 == 0: print("heads: crown gap min %.3f  beak overlap max %.3f" % [_gap, _pen])
	var cv := Array(String(A.get("cam", "1.4,0.35,0")).split(",")).map(func(s): return float(s))
	var focus := Vector3(c.position.x if A.has("track") else 0.0, float(A.get("fy", "0.18")), c.position.z if (A.has("track") or act == "circle") else 0.0)
	if act == "circle" and not A.has("track"): focus = Vector3(0, float(A.get("fy", "0.18")), 0)
	var ang := deg_to_rad(cv[2])
	cam.look_at_from_position(focus + Vector3(sin(ang) * cv[0], cv[1], cos(ang) * cv[0]), focus)
	Ink.set_focus(cam.global_position)
