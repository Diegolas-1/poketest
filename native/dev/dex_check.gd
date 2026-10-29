extends Node3D
# Dev only: every baked Pokémon from four sides over a bright, flat background (no floor,
# no shadows, ink on), one picture each (<out>/<id>.png), for tools that look for what
# should not be there (dark flat sheets: an opaque card, an ink hull on a plane, a
# missing texture). Then it prints, per species, the share of its pixels in solid
# near-black patches (wider than an ink line) and FAILS ones over --max (default 0.02).
#   xvfb-run godot --path native --rendering-driver opengl3 --resolution 1024x256 \
#     res://dev/dex_check.tscn -- --out=/tmp/check [--ids=a,b] [--max=0.02]
var A := {}
var ids: Array = []
var i := 0
var c: Creature
var cam: Camera3D
var t := 0.0
var view := 0
var shots: Array[Image] = []
var bad: Array = []
const DT := 1.0 / 30.0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.95, 0.92, 0.85)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	add_child(sun)
	sun.look_at_from_position(Vector3(-0.5, 1.0, 0.8) * 10.0, Vector3.ZERO)
	cam = Camera3D.new()
	cam.fov = 40
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
		print("dex_check: %d species, %d over the limit: %s" % [ids.size(), bad.size(), ", ".join(bad)])
		print("DEX CHECK " + ("GREEN" if bad.is_empty() else "RED"))
		get_tree().quit()
		return
	c = Creature.make(ids[i])
	add_child(c)
	c.reset()
	t = 0.0
	view = 0
	shots.clear()

func _bounds() -> AABB:
	# the posed bones (the meshes' own boxes are the bind pose's, and skinned ones overstate)
	var box := AABB(c.to_world(c.G[0].origin), Vector3.ZERO)
	for g in c.G: box = box.expand(c.to_world(g.origin))
	return box.grow(box.size.length() * 0.08)

func _process(_dt: float) -> void:
	if c == null: return
	for k in ["overlay", "menu"]:
		var ov = Settings.get(k)
		if ov and "visible" in ov: ov.visible = false
	t += DT
	c.animate(DT, 0.0)
	var box := _bounds()
	var mid := box.get_center()
	var r := maxf(0.2, box.size.length() * 0.5)
	var ang := deg_to_rad(45.0 + 90.0 * view)
	cam.look_at_from_position(mid + Vector3(sin(ang), 0.45, cos(ang)).normalized() * r * 1.9, mid)
	Ink.set_focus(cam.global_position)
	if t >= 0.6 + view * 0.1:
		await RenderingServer.frame_post_draw
		if c == null: return
		shots.append(get_viewport().get_texture().get_image())
		view += 1
		if view >= 4: _save()

func _save() -> void:
	var w := shots[0].get_width()
	var h := shots[0].get_height()
	var out := Image.create(w * 4, h, false, shots[0].get_format())
	for k in 4: out.blit_rect(shots[k], Rect2i(0, 0, w, h), Vector2i(k * w, 0))
	var dir: String = A.get("out", "user://check")
	DirAccess.make_dir_recursive_absolute(dir)
	out.save_png("%s/%s.png" % [dir, ids[i]])
	var share := _dark(out)
	# (species.json "dark_ok": its own limit, where the art is truly black: Zapdos' feathers)
	var lim := float(Creature.species_info(ids[i]).get("dark_ok", A.get("max", "0.02")))
	print("%-12s dark %.3f%s" % [ids[i], share, "  <- OVER" if share > lim else ""])
	if share > lim: bad.append(ids[i])
	i += 1
	_next()

# the share of the creature's pixels (not background) in solid near-black patches: a dark
# pixel whose neighbours 3 px away all round are dark too (an ink line is thinner)
func _dark(img: Image) -> float:
	var w := img.get_width()
	var h := img.get_height()
	var bg := Color(0.95, 0.92, 0.85)
	var body := 0
	var dark := 0
	var step := 2
	for y in range(3, h - 3, step):
		for x in range(3, w - 3, step):
			var p := img.get_pixel(x, y)
			if absf(p.r - bg.r) + absf(p.g - bg.g) + absf(p.b - bg.b) < 0.06: continue
			body += 1
			if p.get_luminance() > 0.09: continue
			var solid := true
			for o in [Vector2i(3, 0), Vector2i(-3, 0), Vector2i(0, 3), Vector2i(0, -3), Vector2i(2, 2), Vector2i(-2, -2), Vector2i(2, -2), Vector2i(-2, 2)]:
				if img.get_pixel(x + o.x, y + o.y).get_luminance() > 0.09:
					solid = false
					break
			if solid: dark += 1
	return float(dark) / maxf(1.0, float(body))
