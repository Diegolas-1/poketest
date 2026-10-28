class_name Interior
extends Node3D
# An interior as its own space (Oak's lab): the baked model
# (res://interiors/<id>.glb, tools/native/bake_interior.mjs), its vector ink,
# the lamp halos, its own key light and environment, and the compiled
# blueprint (InteriorData) for walking, the camera and interactions.
# main.gd hides the outdoor world while one is shown, and frees it on leaving.
#
#   var it := Interior.new(); main.add_child(it); it.build("oak_lab")
#   it.data (InteriorData), it.env (Environment), it.light (DirectionalLight3D)

const TOON := preload("res://shaders/toon.gdshader")
const TOON_DS := preload("res://shaders/toon_ds.gdshader")
const UNLIT := preload("res://shaders/interior_unlit.gdshader")
const GLOW := preload("res://shaders/interior_glow.gdshader")
const FLOOR := preload("res://shaders/interior_floor.gdshader")
const Veg := preload("res://veg.gd")
const DIR := "res://interiors/"

var data := InteriorData.new()
var env: Environment
var light: DirectionalLight3D
var ink_nodes: Array = []
var stats := {}

func build(id: String) -> bool:
	var t0 := Time.get_ticks_usec()
	if not data.load_space(DIR + id + ".json"): return false
	var L: Dictionary = data.meta.lights
	var pal: Dictionary = L.get("palette", {})
	var scene: PackedScene = load(DIR + id + ".glb")
	var root := scene.instantiate()
	add_child(root)
	var made := {}
	var tris := 0
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		var nm := String(mi.name)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if nm.ends_with("_ns") or nm.begins_with("glow") or nm.begins_with("unlit") else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		for s in mesh.get_surface_count():
			var src: Material = mesh.surface_get_material(s)
			if not made.has(src): made[src] = _material(src, pal)
			mi.set_surface_override_material(s, made[src])
			tris += mesh.surface_get_array_index_len(s) / 3 if mesh.surface_get_array_index_len(s) > 0 else mesh.surface_get_array_len(s) / 3
		if String(mi.get_surface_override_material(0).get_meta("kind", "")) == "leaf":
			Ink.outline_plant(mi)
	ink_nodes = Ink.add_world_lines(self, DIR + id + "_ink.bin")
	_lamps(data.meta.get("lamps", []))
	# the key light: from above the room (the cel bands read only its direction)
	var k: Dictionary = L.get("key", {"dir": [0.2, 0.95, 0.2]})
	light = DirectionalLight3D.new()
	var d := Vector3(k.dir[0], k.dir[1], k.dir[2]).normalized()
	add_child(light)
	light.look_at_from_position(d * 30.0, Vector3.ZERO, Vector3.FORWARD if absf(d.y) > 0.99 else Vector3.UP)
	light.shadow_enabled = bool(k.get("shadow", true)) and int(Settings.get_value("shadow")) > 0
	light.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	light.directional_shadow_max_distance = float(k.get("dist", 26.0))
	light.shadow_bias = 0.03
	light.shadow_normal_bias = 0.8
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(String(L.get("bg", "#2a2440")))
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.tonemap_exposure = float(Settings.get_value("exposure"))
	stats = {"materials": made.size(), "triangles": tris, "ms": (Time.get_ticks_usec() - t0) / 1000}
	print("interior %s: %d meshes, %d materials, %d triangles, %d ms" % [id, root.find_children("*", "MeshInstance3D", true, false).size(), made.size(), tris, stats.ms])
	return true

# the baked plain materials become the game's: cel shaded with the space's
# palette, unshaded (screens, views out, fluids), added glow, or leaves
func _material(src: Material, pal: Dictionary) -> Material:
	var nm := String(src.resource_name) if src else ""
	var b := src as BaseMaterial3D
	var m := ShaderMaterial.new()
	if nm.begins_with("leaf_"):
		m.shader = Veg.LEAF
		m.set_shader_parameter("albedo_tex", b.albedo_texture)
		m.set_shader_parameter("tint", b.albedo_color)
		m.set_shader_parameter("bands", Vector3(0.24, 0.44, 0.57))
		m.set_shader_parameter("soft", 0.02)
		m.set_shader_parameter("detail", 0.55)
		m.set_shader_parameter("mid", 0.26)
		m.set_shader_parameter("deep", Vector3(0.34, 0.4, 0.62))
		m.set_shader_parameter("shade", Vector3(0.5, 0.66, 0.86))
		m.set_shader_parameter("lit", Vector3(1.2, 1.15, 0.8))
		m.set_shader_parameter("lit_add", Vector3(0.05, 0.05, 0.0))
		m.set_meta("kind", "leaf")
		return m
	if nm.begins_with("glow") or nm.begins_with("unlit"):
		m.shader = GLOW if nm.begins_with("glow") else UNLIT
		if b:
			m.set_shader_parameter("albedo", b.albedo_color)
			if b.albedo_texture:
				m.set_shader_parameter("albedo_tex", b.albedo_texture)
				m.set_shader_parameter("use_tex", true)
		m.set_shader_parameter("use_vc", nm.contains("_vc"))
		if nm.begins_with("glow"): m.render_priority = 1
		return m
	m.shader = FLOOR if nm.begins_with("floor") else TOON
	# 'floor_g<k>': a floor with its own gloss (k / 100: waxed boards shine less than tiles)
	if nm.begins_with("floor_g"):
		var k := nm.substr(7).get_slice("_", 0)
		if k.is_valid_int(): m.set_shader_parameter("gloss", int(k) / 100.0)
	m.set_shader_parameter("uw_sea_y", -1.0e6)   # (indoors nothing is under the sea)
	if b:
		m.set_shader_parameter("albedo", b.albedo_color)
		if b.albedo_texture:
			m.set_shader_parameter("albedo_tex", b.albedo_texture)
			m.set_shader_parameter("use_tex", true)
		if b.cull_mode == BaseMaterial3D.CULL_DISABLED and m.shader == TOON: m.shader = TOON_DS
	m.set_shader_parameter("use_vc", nm.contains("_vc"))
	var v3 := func(k: String, d: Vector3) -> Vector3:
		var a = pal.get(k, null)
		return Vector3(a[0], a[1], a[2]) if a is Array else d
	m.set_shader_parameter("bands", v3.call("bands", Vector3(0.02, 0.12, 0.6)))
	m.set_shader_parameter("deep", v3.call("deep", Vector3(0.78, 0.76, 0.92)))
	m.set_shader_parameter("shade", v3.call("shade", Vector3(0.87, 0.86, 0.97)))
	m.set_shader_parameter("lit", v3.call("lit", Vector3(1.05, 1.03, 0.97)))
	m.set_shader_parameter("lit_add", v3.call("litAdd", Vector3(0.03, 0.025, 0.0)))
	return m

# lamp halos: camera-facing soft discs, added on top (one mesh)
func _lamps(list: Array) -> void:
	if list.is_empty(): return
	var pos := PackedVector3Array(); var uv := PackedVector2Array(); var corner := PackedVector2Array(); var col := PackedColorArray(); var idx := PackedInt32Array()
	for l in list:
		var c := Vector3(l.pos[0], l.pos[1], l.pos[2])
		var s: float = minf(1.6, float(l.r) * 0.5) * (1.4 if l.kind == "pendant" else 1.0)
		var cc := Color(String(l.color))
		var b := pos.size()
		for k in 4:
			var x := -1.0 if k == 0 or k == 3 else 1.0
			var y := -1.0 if k < 2 else 1.0
			pos.append(c); corner.append(Vector2(x, y) * s); uv.append(Vector2(x, y)); col.append(cc)
		idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos; a[Mesh.ARRAY_TEX_UV] = uv; a[Mesh.ARRAY_TEX_UV2] = corner; a[Mesh.ARRAY_COLOR] = col; a[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/interior_halo.gdshader")
	mat.render_priority = 2
	var mi := MeshInstance3D.new()
	mi.name = "lamp_halos"
	mi.mesh = m
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-50, -10, -50), Vector3(100, 40, 100))
	add_child(mi)

func free_ink() -> void:
	for n in ink_nodes:
		if is_instance_valid(n):
			Ink.line_nodes.erase(n)
