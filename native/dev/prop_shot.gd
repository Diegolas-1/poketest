extends Node
# Dev only: one prop baked on its own (tools/native/bake_prop.mjs: prop.glb +
# ink.bin) on a flat pad out at sea, in the game's own light, materials,
# levels of detail (main.gd lods) and ink, at the hours asked.
#   xvfb-run ... godot --path native --rendering-driver vulkan --rendering-method mobile \
#     --resolution 1600x900 res://dev/prop_shot.tscn -- --dir=<bake_prop out> --out=<dir> \
#     [--views=name:ex,ey,ez:lx,ly,lz;...] [--hours=12,21] [--tag=name] [--stats]
# Views are eye and look points relative to the prop's origin (its front +z).
# Saved as <out>/<tag>_<view>_<hhmm>.png.
var main: Node
var dir := ""
var out := ""
var tag := "prop"
var stats := false
var hours: Array = [12.0]
var views: Array = []
var frame := 0
var jobs: Array = []
var job := -1
var wait := 0
var P0 := Vector3(330, 0.6, 170)   # a pad out in the sea, south east of the town
var prop: Node3D

func _ready() -> void:
	process_priority = 3000
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--dir="): dir = a.substr(6)
		elif a.begins_with("--out="): out = a.substr(6)
		elif a.begins_with("--tag="): tag = a.substr(6)
		elif a.begins_with("--hours="): hours = Array(a.substr(8).split(",")).map(func(x): return float(x))
		elif a == "--stats": stats = true
		elif a.begins_with("--views="):
			for v in a.substr(8).split(";", false):
				var p := v.split(":")
				var e := p[1].split(","); var l := p[2].split(",")
				views.append([p[0], Vector3(float(e[0]), float(e[1]), float(e[2])), Vector3(float(l[0]), float(l[1]), float(l[2]))])
	if views.is_empty(): views = [["front", Vector3(0, 12, 48), Vector3(0, 4, 0)]]
	if out != "": DirAccess.make_dir_recursive_absolute(out)
	main = load("res://main.tscn").instantiate()
	add_child(main)
	for h in hours:
		for v in views: jobs.append([v, h])

func _build() -> void:
	# the pad: a flat paved square on a low block, in the town's cel material
	var pad := MeshInstance3D.new()
	var bm := BoxMesh.new(); bm.size = Vector3(90, 3.0, 90)
	pad.mesh = bm
	var std := StandardMaterial3D.new(); std.albedo_color = Color("9fc96a")
	pad.material_override = main.toon_for(std)
	pad.position = P0 + Vector3(0, -1.5, 0)
	main.add_child(pad)
	# the prop
	var doc := GLTFDocument.new(); var st := GLTFState.new()
	if doc.append_from_file(dir.path_join("prop.glb"), st) != OK: push_error("prop.glb"); return
	prop = doc.generate_scene(st)
	prop.position = P0
	main.town_root.add_child(prop)
	var leaf := {}
	for mi in prop.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		for s in mesh.get_surface_count():
			var src: Material = mesh.surface_get_material(s)
			if src and String(src.resource_name).begins_with("leaf_"):
				if not leaf.has(src):
					var m := ShaderMaterial.new()
					m.shader = preload("res://shaders/veg_leaf.gdshader")
					m.set_shader_parameter("albedo_tex", src.albedo_texture)
					m.set_shader_parameter("tint", src.albedo_color)
					m.set_shader_parameter("bands", Vector3(0.24, 0.44, 0.57)); m.set_shader_parameter("soft", 0.02)
					m.set_shader_parameter("detail", 0.55); m.set_shader_parameter("mid", 0.26)
					m.set_shader_parameter("deep", Vector3(0.13, 0.33, 0.6)); m.set_shader_parameter("shade", Vector3(0.36, 0.66, 0.9))
					m.set_shader_parameter("lit", Vector3(1.45, 1.3, 0.62)); m.set_shader_parameter("lit_add", Vector3(0.07, 0.08, 0.0))
					leaf[src] = m
					Ink.outline_plant(mi)
				mi.set_surface_override_material(s, leaf[src])
				continue
			var tm: ShaderMaterial = main.toon_for(src)
			# the night's glow, as night_fx marks the town's: glass by its picture, lamps by their colour
			if src is BaseMaterial3D and (src as BaseMaterial3D).albedo_texture:
				var img: Image = (src as BaseMaterial3D).albedo_texture.get_image()
				if img and img.get_width() == 128 and img.get_height() == 128:
					if img.is_compressed(): img.decompress()
					# (the picture's top row is the sky blue #6a9ac0, its bottom the room's #1e3048; either way up)
					for y in [2, 125]:
						var c := img.get_pixel(20, y)
						if absf(c.r - 0.42) < 0.08 and absf(c.b - 0.75) < 0.08: tm.set_shader_parameter("night_glow", 1.0)
			elif src is BaseMaterial3D:
				var c2: Color = (src as BaseMaterial3D).albedo_color
				for lc in [Color("fff1c4"), Color("ffe7a6"), Color("fffbea"), Color("fff3c0")]:
					if absf(c2.r - lc.r) + absf(c2.g - lc.g) + absf(c2.b - lc.b) < 0.02: tm.set_shader_parameter("night_glow", 2.0)
			mi.set_surface_override_material(s, tm)
	main.lods(prop)
	var ink := Node3D.new(); ink.position = P0; main.add_child(ink)
	Ink.add_world_lines(ink, dir.path_join("ink.bin"))
	var tris := 0
	for mi in prop.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		for s in mesh.get_surface_count(): tris += mesh.surface_get_array_index_len(s) / 3 if mesh.surface_get_array_index_len(s) > 0 else mesh.surface_get_array_len(s) / 3
		print("PROPMESH %s surfaces %d vis %.0f-%.0f" % [mi.name, mesh.get_surface_count(), mi.visibility_range_begin, mi.visibility_range_end])
	print("PROP tris ", tris)

func _process(_dt: float) -> void:
	frame += 1
	if frame < 40: return
	if prop == null: _build()
	if main.cast and main.cast.dialog: main.cast.dialog.visible = false
	for c in main.find_children("*", "CanvasLayer", true, false): c.visible = false
	Ink.set_focus(P0 + Vector3(0, 0, 12))
	if wait > 0:
		var j: Array = jobs[job]
		main.cam.look_at_from_position(P0 + j[0][1], P0 + j[0][2])
		wait -= 1
		if wait == 0: _snap(j)
		return
	job += 1
	if job >= jobs.size():
		get_tree().quit()
		return
	var jj: Array = jobs[job]
	var c: GameClock = main.cast.clock
	c.real = false; c.ff = 1.0
	c.set_time(fmod(float(jj[1]), 24.0), 160)
	main.daynight.enabled = true   # (whatever the Settings say: the hour asked)
	main.daynight.force_update()
	main.cam.look_at_from_position(P0 + jj[0][1], P0 + jj[0][2])
	wait = 16

func _snap(j: Array) -> void:
	var hh := float(j[1])
	var nm := "%s_%s_%02d%02d" % [tag, j[0][0], int(hh), int(round(fmod(hh, 1.0) * 60.0))]
	if stats:
		var R := RenderingServer
		print("stats %s draws %d objects %d prims %d" % [nm, R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME), R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME), R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)])
	if out == "": return
	RenderingServer.frame_post_draw.connect(func(): get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out, nm]), CONNECT_ONE_SHOT)
