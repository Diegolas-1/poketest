extends Node3D
# Dev only: every Pokémon's face close up (from the front and three-quarters), saved as
# <out>/<id>.png, and a check of its eyes: the eye meshes (the *_eye1 / *_iris1 materials)
# are found by drawing them flat magenta once, then the eye region of the real frame is
# measured. It FAILS a species whose eyes are all black (the region's mean brightness
# under --dark, default 0.12) or blank (no pupil: the region nearly one colour, its
# brightness spread under --flat, default 0.05).
#   xvfb-run godot --path native --rendering-driver opengl3 --resolution 512x256 \
#     res://dev/dex_eyes.tscn -- --out=/tmp/eyes [--ids=a,b]
var A := {}
var ids: Array = []
var i := 0
var c: Creature
var cam: Camera3D
var t := 0.0
var step := 0
var shots: Array[Image] = []
var masks: Array[Image] = []
var bad: Array = []
var _mag := StandardMaterial3D.new()
var _saved := []
var _busy := false
var _eyec := Vector3.INF
const DT := 1.0 / 30.0
const VIEWS := [0.0, 40.0]

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	_mag.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mag.albedo_color = Color(1, 0, 1)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.62, 0.78, 0.92)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	add_child(sun)
	sun.look_at_from_position(Vector3(-0.3, 0.8, 1.0) * 10.0, Vector3.ZERO)
	cam = Camera3D.new()
	cam.fov = 30
	cam.near = 0.01
	add_child(cam)
	cam.current = true
	if A.has("ids"): ids = Array(String(A.ids).split(","))
	else:
		ids = ["caterpie", "pidgey", "doduo", "mrmime"]
		for k in Creature.species_db().get("species", {}): ids.append(k)
	_next()

func _next() -> void:
	if c: c.queue_free()
	c = null
	if i >= ids.size():
		print("dex_eyes: %d species, %d failing: %s" % [ids.size(), bad.size(), ", ".join(bad)])
		print("DEX EYES " + ("GREEN" if bad.is_empty() else "RED"))
		get_tree().quit()
		return
	c = Creature.make(ids[i])
	add_child(c)
	c.set("auto", false)
	c.reset()
	t = 0.0
	step = 0
	_eyec = Vector3.INF
	shots.clear()
	masks.clear()

func _eye_surfaces() -> Array:
	var out := []
	for m3 in c.meshes:
		for s in m3.mesh.get_surface_count():
			var src := m3.mesh.surface_get_material(s)
			var nm := String(src.resource_name).to_lower() if src else ""
			if nm.contains("eye") or nm.contains("iris"): out.append([m3, s])
	return out

func _process(_dt: float) -> void:
	if c == null: return
	for k in ["overlay", "menu"]:
		var ov = Settings.get(k)
		if ov and "visible" in ov: ov.visible = false
	t += DT
	c.animate(DT, 0.0)
	# the face: the head bone, the camera ahead of it (the creature faces +z)
	var hb := c.b("Head")
	if hb < 0: hb = c.b("Waist")
	# (aimed at the eyes themselves: their meshes' middle, carried by the head bone)
	if _eyec == Vector3.INF:
		var sum := Vector3.ZERO
		var n := 0
		for es in _eye_surfaces():
			for v: Vector3 in es[0].mesh.surface_get_arrays(es[1])[Mesh.ARRAY_VERTEX]:
				sum += v; n += 1
		_eyec = sum / n if n > 0 else c.rest_g[hb].origin
	var hp := c.to_world(c.G[hb] * (c.rest_g[hb].affine_inverse() * _eyec))
	var info := Creature.species_info(ids[i])
	var h := float(info.get("height", 0.5))
	if String(info.get("family", "")) == "serpent": h *= 0.3
	var d := clampf(h * 0.6, 0.3, 2.5) * float(info.get("face_dist", 1.0))
	var ang := deg_to_rad(VIEWS[mini(step / 2, VIEWS.size() - 1)])
	var at := hp
	cam.look_at_from_position(at + Vector3(sin(ang), 0.12, cos(ang)).normalized() * d, at)
	Ink.set_focus(cam.global_position)
	if t < 0.5 or step >= VIEWS.size() * 2 or _busy: return
	_busy = true
	# each view twice: the eyes in magenta (the mask), then as they are
	var mask_pass := step % 2 == 0
	if mask_pass:
		_saved.clear()
		for es in _eye_surfaces():
			_saved.append([es[0], es[1], es[0].get_surface_override_material(es[1])])
			es[0].set_surface_override_material(es[1], _mag)
	await RenderingServer.frame_post_draw
	if c == null:
		_busy = false
		return
	var img := get_viewport().get_texture().get_image()
	if mask_pass:
		masks.append(img)
		for sv in _saved: sv[0].set_surface_override_material(sv[1], sv[2])
	else:
		shots.append(img)
	step += 1
	_busy = false
	if step >= VIEWS.size() * 2: _save()

func _save() -> void:
	var w := shots[0].get_width()
	var hh := shots[0].get_height()
	var out := Image.create(w * shots.size(), hh, false, shots[0].get_format())
	for k in shots.size(): out.blit_rect(shots[k], Rect2i(0, 0, w, hh), Vector2i(k * w, 0))
	var dir: String = A.get("out", "user://eyes")
	DirAccess.make_dir_recursive_absolute(dir)
	out.save_png("%s/%s.png" % [dir, ids[i]])
	# the eye region (front view): where the mask was magenta
	var m := masks[0]
	var s := shots[0]
	var n := 0
	var sum := 0.0
	var sum2 := 0.0
	for y in range(0, hh, 2):
		for x in range(0, w, 2):
			var p := m.get_pixel(x, y)
			if p.r > 0.8 and p.b > 0.8 and p.g < 0.25:
				var l := s.get_pixel(x, y).get_luminance()
				n += 1; sum += l; sum2 += l * l
	var note := ""
	if n < 6: note = "no eyes seen"
	else:
		var mean := sum / n
		var sd := sqrt(maxf(0.0, sum2 / n - mean * mean))
		note = "mean %.2f spread %.2f" % [mean, sd]
		var why := ""
		if mean < float(A.get("dark", "0.12")): why = "ALL BLACK"
		elif sd < float(A.get("flat", "0.05")): why = "BLANK"
		if why != "" and not bool(Creature.species_info(ids[i]).get("eyes_ok", false)):
			bad.append(ids[i])
			note += "  <- " + why
	print("%-12s %s" % [ids[i], note])
	i += 1
	_next()
