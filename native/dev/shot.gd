extends Node
# Dev only: runs the game with a fixed camera for comparison renders.
#   godot --path native res://dev/shot.tscn -- --pos=x,z --cam=px,py,pz,tx,ty,tz [--noink] [--stats]
# --stats prints draw calls, objects and primitives of a frame, ink on and off.
var main: Node
var cam_v := PackedFloat64Array()
var pos_v := PackedFloat64Array()
var stats := false
var frame := 0

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--cam="): cam_v = PackedFloat64Array(Array(a.substr(6).split(",")).map(func(x): return float(x)))
		elif a.begins_with("--pos="): pos_v = PackedFloat64Array(Array(a.substr(6).split(",")).map(func(x): return float(x)))
		elif a == "--noink": Ink.set_enabled(false)
		elif a == "--stats": stats = true
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _process(_dt: float) -> void:
	frame += 1
	if stats and frame in [20, 26]:
		var R := RenderingServer
		print("stats ink=%s draws %d objects %d primitives %d" % [Ink.is_enabled(),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)])
		Ink.toggle()
	if pos_v.size() == 2:
		main.pos = Vector3(pos_v[0], 0.0, pos_v[1])
		main.speed = 0.0
	if cam_v.size() == 6:
		main.cam.look_at_from_position(Vector3(cam_v[0], cam_v[1], cam_v[2]), Vector3(cam_v[3], cam_v[4], cam_v[5]))
