extends Node
# Dev only: runs the game with a fixed camera for comparison renders.
#   godot --path native res://dev/shot.tscn -- --pos=x,z --cam=px,py,pz,tx,ty,tz [--noink] [--stats]
# Interiors: --interior=oak_lab (go straight in), --ipos=x,z[,level[,yaw]] (stand there
# inside), --camyaw=a --campitch=p (the game's own camera, radians, absolute),
# --stick=x,y[,from_frame] (hold the move stick), --enterlab (stand at the lab's
# outdoor door and press A: the real fade in).
# --stats prints draw calls, objects and primitives of a frame: ink on, off, and
# on without the leaf ink.
var main: Node
var cam_v := PackedFloat64Array()
var pos_v := PackedFloat64Array()
var stats := false
var frame := 0
var inter := ""
var ipos := PackedFloat64Array()
var camyaw := NAN
var campitch := NAN
var stick := PackedFloat64Array()
var enterlab := false

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--cam="): cam_v = PackedFloat64Array(Array(a.substr(6).split(",")).map(func(x): return float(x)))
		elif a.begins_with("--pos="): pos_v = PackedFloat64Array(Array(a.substr(6).split(",")).map(func(x): return float(x)))
		elif a == "--noink": Ink.set_enabled(false)
		elif a == "--stats": stats = true
		elif a.begins_with("--interior="): inter = a.substr(11)
		elif a.begins_with("--ipos="): ipos = PackedFloat64Array(Array(a.substr(7).split(",")).map(func(x): return float(x)))
		elif a.begins_with("--camyaw="): camyaw = float(a.substr(9))
		elif a.begins_with("--campitch="): campitch = float(a.substr(11))
		elif a.begins_with("--stick="): stick = PackedFloat64Array(Array(a.substr(8).split(",")).map(func(x): return float(x)))
		elif a == "--enterlab": enterlab = true
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _process(_dt: float) -> void:
	frame += 1
	if stats and frame in [18, 22, 26]:
		var R := RenderingServer
		print("stats ink=%s quality=%s draws %d objects %d primitives %d" % [Ink.is_enabled(), Ink.quality,
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)])
		if frame == 18: Ink.set_enabled(false)
		elif frame == 22: Ink.set_enabled(true); Ink.set_quality(0.5)
		else: Ink.set_quality(1.0)
	if pos_v.size() == 2:
		main.pos = Vector3(pos_v[0], 0.0, pos_v[1])
		main.speed = 0.0
	if inter != "" and frame == 2: main.enter_space(inter, "", true)
	if ipos.size() >= 2 and main.indoors:
		var D = main.interior.data
		if ipos.size() >= 3: D.level = int(ipos[2])
		main.pos = Vector3(ipos[0], D.height_at(ipos[0], ipos[1]), ipos[1])
		if ipos.size() >= 4: main.yaw = ipos[3]
		main.speed = 0.0
		main.cast.land(main.pos.y)
		if frame < 4: main.cam_ty = main.pos.y; main.cam_target = main.pos + Vector3(0, 1.4, 0)
	if enterlab and frame == 8:
		var d: Vector2 = main.cast.lab_door
		main.pos = Vector3(d.x + 1.0, main.world.height_at(d.x + 1.0, d.y), d.y); main.yaw = PI / 2.0
		main.cam_yaw = main.yaw + PI; main.cam_ty = main.pos.y
	if enterlab and frame == 12: main.cast._btn_a = true
	if not is_nan(camyaw): main.cam_yaw = camyaw; main.cam_idle = 0.0
	if not is_nan(campitch): main.cam_pitch = campitch
	if stick.size() >= 2 and frame >= (int(stick[2]) if stick.size() >= 3 else 0): main.stick_vec = Vector2(stick[0], stick[1])
	if OS.get_cmdline_user_args().has("--camdebug") and frame % 4 == 1:
		print("cam %s target %s boom %.2f lift %.2f pos %s level %s" % [main.cam.global_position, main.cam_target, main.cam_boom, main.cam_lift, main.pos, main.world.get("level")])
	if cam_v.size() == 6:
		main.cam.look_at_from_position(Vector3(cam_v[0], cam_v[1], cam_v[2]), Vector3(cam_v[3], cam_v[4], cam_v[5]))
