extends Node3D
# Dev only: Pokémon side by side, to check their sizes against each other (and Ash's
# height, a 1.4 m post at the left end), animated a moment, then one picture saved.
#   xvfb-run godot --path native --rendering-driver opengl3 --resolution 1600x600 \
#     res://dev/dex_lineup.tscn -- --out=/tmp/lineup.png [--ids=a,b,..] [--t=1.5]
#     [--side] (seen from the side, facing right) [--bind] (no animation: the rest pose)
#     [--gap=0.25] (metres between them) [--h=1.0] (camera height) [--mood=x] (on all)
const ALL := ["pidgey", "caterpie", "doduo", "mrmime", "rattata", "raticate", "spearow", "fearow", "ekans", "arbok",
	"pikachu", "raichu", "sandshrew", "sandslash", "nidoranf", "nidorina", "nidoqueen", "nidoranm", "nidorino",
	"nidoking", "clefairy", "clefable", "vulpix", "ninetales", "jigglypuff"]
var A := {}
var cs: Array[Creature] = []
var t := 0.0
var dur := 1.5
var cam: Camera3D
var _us := 0
var _frames := 0
const DT := 1.0 / 30.0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	dur = float(A.get("t", "1.5"))
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
	sun.directional_shadow_max_distance = 40.0
	add_child(sun)
	sun.look_at_from_position(Vector3(-0.5, 1.0, 0.8) * 10.0, Vector3.ZERO)
	var fl := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(60, 20)
	fl.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.5, 0.66, 0.4)
	fl.material_override = fm
	add_child(fl)
	var ids: Array = ALL if not A.has("ids") else Array(String(A.ids).split(","))
	var gap := float(A.get("gap", "0.25"))
	var x := 0.0
	# Ash's height: a post
	var post := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.06, 1.4, 0.06)
	post.mesh = bm
	post.position = Vector3(-0.3, 0.7, 0)
	add_child(post)
	for id in ids:
		var parts := String(id).split(":")
		var c := Creature.make(parts[0], parts[1] if parts.size() > 1 else "")
		add_child(c)
		var aabb := _width(c)
		x += aabb.x * 0.5
		c.position = Vector3(x, 0, -aabb.y)
		c.rotation.y = PI / 2.0 if A.has("side") else 0.0
		c.reset()
		if A.has("mood"): c.mood(A.mood)
		x += aabb.x * 0.5 + gap
		var lb := Label3D.new()
		lb.text = id
		lb.font_size = 48
		lb.pixel_size = 0.004
		lb.position = Vector3(c.position.x, -0.12, 0.3)
		lb.rotation.x = -0.5
		add_child(lb)
		cs.append(c)
	cam = Camera3D.new()
	cam.fov = 30
	add_child(cam)
	cam.current = true
	var h := float(A.get("h", "1.0"))
	var mid := x * 0.5 - 0.3
	var dist := maxf(3.0, (x + 0.6) * 0.5 / tan(deg_to_rad(cam.fov * 0.5)) / (get_viewport().get_visible_rect().size.x / get_viewport().get_visible_rect().size.y) * 1.05)
	cam.look_at_from_position(Vector3(mid, h, dist), Vector3(mid, h * 0.5, 0))

# the footprint (x wide, z behind its origin) at rest, for spacing them
func _width(c: Creature) -> Vector2:
	var lo := INF
	var hi := -INF
	var back := 0.0
	for i in c.rest_g.size():
		var p: Vector3 = c.rest_g[i].origin
		if absf(p.y) > 3.0: continue
		lo = minf(lo, p.x); hi = maxf(hi, p.x)
	if A.has("side"):
		lo = INF; hi = -INF
		for i in c.rest_g.size():
			var p: Vector3 = c.rest_g[i].origin
			lo = minf(lo, -p.z); hi = maxf(hi, -p.z)
	return Vector2(maxf(0.15, hi - lo), back)

func _process(_dt: float) -> void:
	for k in ["overlay", "menu"]:
		var ov = Settings.get(k)
		if ov and "visible" in ov: ov.visible = false
	t += DT
	if not A.has("bind"):
		var t0 := Time.get_ticks_usec()
		for c in cs: c.animate(DT, 0.0)
		_us += Time.get_ticks_usec() - t0
		_frames += 1
	Ink.set_focus(cam.global_position)
	if t >= dur:
		set_process(false)
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		var f: String = A.get("out", "user://lineup.png")
		img.save_png(f)
		print("saved ", f)
		if _frames > 0: print("animate: %d creatures, %.2f ms a frame (all), %.3f ms each" % [cs.size(), _us / 1000.0 / _frames, _us / 1000.0 / _frames / cs.size()])
		get_tree().quit()
