extends Node
# Debug probe (not part of the game): runs the main scene with the player and
# camera at a given spot and prints what the renderer drew. Run:
#   godot --path native res://debug/probe.tscn -- at=x,z yaw=0.3 pitch=0.3 off=sea,town
# keys: at=x,z  yaw  pitch  dist  warm (frames before measuring)  off=a,b,..
# (node names under main matched by prefix, or: sea fresh shadow grass town terrain)

var main: Node3D
var args := {}
var frame := 0
var acc := {"dc": 0.0, "pr": 0.0, "ob": 0.0, "cpu": 0.0, "gpu": 0.0, "n": 0}

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else ""
	for k in ["lod", "trees", "plants", "shadow_dist", "grass"]:
		if args.has(k): Settings.set_value(k, float(args[k]))
	main = load("res://main.tscn").instantiate()
	get_tree().root.add_child.call_deferred(main)
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	if args.has("overdraw"): get_viewport().debug_draw = Viewport.DEBUG_DRAW_OVERDRAW
	if args.has("wire"): get_viewport().debug_draw = Viewport.DEBUG_DRAW_WIREFRAME

func _place() -> void:
	if args.has("at"):
		var p: PackedStringArray = args.at.split(",")
		var x := float(p[0]); var z := float(p[1])
		main.pos = Vector3(x, main.world.height_at(x, z), z)
		main.cam_target = main.pos + Vector3(0, 1.45, 0)
		main.cam_ty = main.pos.y; main.cam_floor = main.pos.y
		main.cam.position = Vector3.ZERO
	if args.has("yaw"): main.cam_yaw = float(args.yaw)
	if args.has("pitch"): main.cam_pitch = float(args.pitch)
	if args.has("dist"): main.cam_dist = float(args.dist)

func _off(n: Node, what: String) -> void:
	for c in n.get_children():
		if what == "shadow" and c is DirectionalLight3D: c.shadow_enabled = false
		elif what == "sea" and c is MeshInstance3D and String(c.name).begins_with("sea"): c.visible = false
		elif what == "fresh" and c is MeshInstance3D and String(c.name).begins_with("fresh"): c.visible = false
		elif c is VisualInstance3D and String(c.name).begins_with(what): c.visible = false
		elif c.get_parent() == main and String(c.name).to_lower().contains(what) and c is Node3D: c.visible = false
		elif what == "grass" and c == main.grass: c.visible = false
		_off(c, what)

func _process(_dt: float) -> void:
	frame += 1
	if frame == 2:
		_place()
		if frame == 2 and args.has("names"):
			for c in main.get_children(): print("CHILD ", c.name, " ", c.get_class())
		if args.has("off"):
			for w in String(args.off).split(","):
				if w == "grass": main.grass.visible = false
				elif w == "town": main.town_root.visible = false
				elif w == "water": main.water_root.visible = false
				elif w == "terrain": main.get_child(2).visible = false
				elif w == "veg": main.scenery.veg.visible = false
				elif w == "bill":
					for c in main.scenery.veg.get_children(): if c is MultiMeshInstance3D: c.visible = false
				elif w == "mts": main.scenery.mts.visible = false
				elif w == "clouds": main.scenery.clouds.visible = false
				else: _off(main, w)
	if frame < 2: return
	if frame == 3 and main.scenery and main.scenery.veg: print("VEG ", main.scenery.veg.stats)
	_place_keep()
	if args.has("vegshadow") and main.scenery.veg: main.scenery.veg.shadow_far = float(args.vegshadow)
	var warm := int(args.get("warm", "20"))
	if frame > warm:
		var vp := get_viewport().get_viewport_rid()
		acc.dc += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		acc.pr += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
		acc.ob += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
		acc.cpu += RenderingServer.viewport_get_measured_render_time_cpu(vp)
		var g := RenderingServer.viewport_get_measured_render_time_gpu(vp)
		acc.gpu += g
		acc["min"] = minf(acc.get("min", 1e9), g)
		acc.n += 1
	if frame == warm and args.has("vegstat"): _vegstat()
	if frame == warm + int(args.get("n", "6")):
		var n: float = acc.n
		print("PROBE draw=%d prim=%d obj=%d cpu=%.2fms gpu=%.2fms min=%.1fms" % [acc.dc / n, acc.pr / n, acc.ob / n, acc.cpu / n, acc.gpu / n, acc.min])

func _place_keep() -> void:
	if args.has("yaw"): main.cam_yaw = float(args.yaw)
	if args.has("pitch"): main.cam_pitch = float(args.pitch)

# what the plants submit from here: per kind of chunk, copies in range and
# triangles sent (copies past their fade are sent too, collapsed)
func _vegstat() -> void:
	var cp: Vector3 = main.cam.global_position
	var tot := {"model_tris": 0, "live_tris": 0, "chunks": 0, "bill_chunks": 0, "bill_copies": 0}
	for c in main.scenery.veg.find_children("*", "MultiMeshInstance3D", true, false):
		var mi: MultiMeshInstance3D = c
		var mm := mi.multimesh
		var aabb := mi.global_transform * mi.get_aabb()
		var d := aabb.get_center().distance_to(cp)
		if d > mi.visibility_range_end or d < mi.visibility_range_begin: continue
		if not main.cam.is_position_in_frustum(aabb.get_center()) and aabb.get_center().distance_to(cp) > aabb.size.length() * 0.5: continue
		var tris: int = mm.mesh.get_faces().size() / 3
		if mi.material_override.shader.resource_path.contains("bill"):
			tot.bill_chunks += 1; tot.bill_copies += mm.instance_count
			continue
		tot.chunks += 1
		tot.model_tris += tris * mm.instance_count
		var fade: Vector2 = mi.material_override.get_shader_parameter("fade")
		for i in mm.instance_count:
			if (mi.global_transform * mm.get_instance_transform(i)).origin.distance_to(cp) < fade.y: tot.live_tris += tris
	print("VEGSTAT ", tot)
