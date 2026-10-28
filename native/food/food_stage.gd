class_name FoodStage
extends RefCounted
# A little photo studio for the dishes: the light and the sky behind them for the
# menu's pictures (food_menu.gd) and the dev renders (dev/food_shot.gd).
#
#   FoodStage.lights(parent)                 a key light and a soft environment under parent
#   FoodStage.photo(host, id, px) -> Texture2D   rendered once, cached
#   FoodStage.stage(host, id, size, live) -> {vp, dish, cam, tex}   its own SubViewport

static var _cache := {}

static func lights(p: Node, warm := true) -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.94, 0.9, 0.84) if warm else Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(1.0, 0.95, 0.9)
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	p.add_child(we)
	var sun := DirectionalLight3D.new()
	p.add_child(sun)
	sun.look_at_from_position(Vector3(-0.45, 0.8, 0.55) * 10.0, Vector3.ZERO)
	sun.light_color = Color(1.0, 0.97, 0.92)
	sun.shadow_enabled = true
	sun.shadow_blur = 2.0
	sun.directional_shadow_max_distance = 6.0
	sun.shadow_bias = 0.02
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL

# a picture of a dish (cached): a SubViewport under `host` renders it once
static func photo(host: Node, id: String, px := 256) -> Texture2D:
	if _cache.has(id) and is_instance_valid(_cache[id].vp): return _cache[id].tex
	var st := stage(host, id, Vector2i(px, px), false)
	_cache[id] = st
	return st.tex

# a dish in its own little world under host: {vp, dish, cam, tex}; live = drawn
# every frame (the menu's big picture turns), else once
static func stage(host: Node, id: String, size: Vector2i, live: bool, view := Vector3(0, 0.62, 0.78)) -> Dictionary:
	var vp := SubViewport.new()
	vp.size = size
	vp.own_world_3d = true
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if live else SubViewport.UPDATE_ONCE
	vp.process_mode = Node.PROCESS_MODE_ALWAYS
	host.add_child(vp)
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(1.0, 0.95, 0.9)
	env.ambient_light_energy = 0.5
	var we := WorldEnvironment.new()
	we.environment = env
	vp.add_child(we)
	var sun := DirectionalLight3D.new()
	vp.add_child(sun)
	sun.look_at_from_position(Vector3(-0.45, 0.8, 0.55) * 10.0, Vector3.ZERO)
	sun.light_color = Color(1.0, 0.97, 0.92)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 3.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	var d := Dishes.build(id)
	vp.add_child(d)
	var cam := Camera3D.new()
	cam.fov = 28.0
	vp.add_child(cam)
	# frame the dish from its box
	var box := _box(d)
	var c := box.get_center()
	var r := maxf(box.size.x, box.size.z) * 0.5
	var asp := float(size.x) / float(size.y)
	var dist := r / tan(deg_to_rad(cam.fov * 0.5)) * (1.12 if asp <= 1.05 else 0.98)
	cam.look_at_from_position(c + view.normalized() * dist, c + Vector3(0, -box.size.y * 0.1, 0))
	return {"vp": vp, "dish": d, "cam": cam, "tex": vp.get_texture()}

static func _box(n: Node) -> AABB:
	var out := AABB()
	var first := true
	for c in n.find_children("*", "VisualInstance3D", true, false):
		if c.name == "steam" or c is MultiMeshInstance3D: continue
		var vi := c as VisualInstance3D
		var b := _xf(vi, n) * vi.get_aabb()
		if first: out = b; first = false
		else: out = out.merge(b)
	return out

static func _xf(c: Node3D, top: Node) -> Transform3D:
	var t := Transform3D.IDENTITY
	var n: Node = c
	while n != null and n != top:
		if n is Node3D: t = (n as Node3D).transform * t
		n = n.get_parent()
	return t
