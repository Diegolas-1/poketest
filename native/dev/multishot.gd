extends Node
# Dev only: many comparison renders in one run (the world loads once).
#   godot --path native --write-movie <dir>/f.png --fixed-fps 30 res://dev/multishot.tscn -- --list=<file> [--hideui] [--stats]
# <file>: one shot per line "name x,z px,py,pz,tx,ty,tz" (camera optional: the
# game's own camera then). The first shot waits 34 frames for the world to
# settle, the rest 10 each; the frame kept for each is printed as
# "keep <frame> <name>" (frame numbers as --write-movie numbers them).
var main: Node
var shots: Array = []
var frame := 0
var idx := 0
var start := 34
var hold := 10
var stats := false

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--list="):
			for ln in FileAccess.get_file_as_string(a.substr(7)).split("\n"):
				var p := ln.strip_edges().split(" ", false)
				if p.size() >= 2: shots.append(p)
		elif a == "--stats": stats = true
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _f(s: String) -> PackedFloat64Array:
	return PackedFloat64Array(Array(s.split(",")).map(func(x): return float(x)))

func _process(_dt: float) -> void:
	frame += 1
	if frame == 3 and OS.get_cmdline_user_args().has("--hideui"):
		for c in main.find_children("*", "CanvasLayer", true, false): c.visible = false
	if idx >= shots.size():
		get_tree().quit(); return
	var s: Array = shots[idx]
	var p := _f(s[1])
	main.pos = Vector3(p[0], 0.0, p[1]); main.speed = 0.0
	if s.size() >= 3:
		var c := _f(s[2])
		main.cam.look_at_from_position(Vector3(c[0], c[1], c[2]), Vector3(c[3], c[4], c[5]))
	var end := start if idx == 0 else hold
	if frame == end - 1 and stats:
		var R := RenderingServer
		print("stats %s draws %d objects %d primitives %d" % [s[0], R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME), R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)])
	if frame == end:
		print("keep %d %s" % [Engine.get_frames_drawn(), s[0]])
		idx += 1; frame = 0
