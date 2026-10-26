extends Node
# Dev only: runs the game with a fixed camera for comparison renders.
#   godot --path native res://dev/shot.tscn -- --pos=x,z --cam=px,py,pz,tx,ty,tz [--noink] [--stats]
# Interiors: --interior=oak_lab (go straight in), --ipos=x,z[,level[,yaw]] (stand there
# inside), --camyaw=a --campitch=p (the game's own camera, radians, absolute),
# --press=f,f (press A), --ipos0=... (place once, then walk), --stick=x,y[,from_frame] (hold the move stick), --enterlab (stand at the lab's
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
var press: Array = []     # --press=f1,f2: press A on these frames
var ipos_once := false   # --ipos0: place once, then let the player walk
var quest := ""          # --quest=q_bread: start that quest (the island compass then points the way)
var snaps: Array = []     # --snap=f,f --snapdir=dir: save the window's picture on those frames (full size)
var snapdir := ""
var island_open := -1
var island_pick := PackedInt32Array()   # --islandpick=f,row: tap that menu row on frame f    # --islandopen=f: tap beside the Dynamic Island on that frame (PALLET_ISLAND=left)

func _ready() -> void:
	process_priority = 100
	process_mode = Node.PROCESS_MODE_ALWAYS   # (keeps counting frames and taking snaps while a menu pauses the game)
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
		elif a.begins_with("--press="): press = Array(a.substr(8).split(",")).map(func(x): return int(x))
		elif a.begins_with("--quest="): quest = a.substr(8)
		elif a.begins_with("--snap="): snaps = Array(a.substr(7).split(",")).map(func(x): return int(x))
		elif a.begins_with("--snapdir="): snapdir = a.substr(10)
		elif a.begins_with("--set="):   # --set=key=value: a Settings value for this run (numbers as numbers)
			var kv := a.substr(6).split("=")
			Settings.set_value(kv[0], int(kv[1]) if kv[1].is_valid_int() else kv[1])
		elif a.begins_with("--islandopen="): island_open = int(a.substr(13))
		elif a.begins_with("--islandpick="): island_pick = PackedInt32Array(Array(a.substr(13).split(",")).map(func(x): return int(x)))
		elif a.begins_with("--ipos0="): ipos = PackedFloat64Array(Array(a.substr(8).split(",")).map(func(x): return float(x))); ipos_once = true
	main = load("res://main.tscn").instantiate()
	main.process_mode = Node.PROCESS_MODE_PAUSABLE
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
	if ipos.size() >= 2 and main.indoors and (not ipos_once or frame < 5):
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
	if frame in press: main.cast._btn_a = true
	if frame in snaps and snapdir != "":
		var at := frame
		RenderingServer.frame_post_draw.connect(func(): get_viewport().get_texture().get_image().save_png("%s/s%03d.png" % [snapdir, at]), CONNECT_ONE_SHOT)
	if quest != "" and frame == 4: main.cast.life.quests.start(quest)
	if island_pick.size() == 2 and frame == island_pick[0] and main.island:
		var ev2 := InputEventScreenTouch.new()
		ev2.pressed = true
		ev2.position = main.island._row_rect(island_pick[1]).get_center() * Vector2(DisplayServer.window_get_size()) / get_viewport().get_visible_rect().size
		Input.parse_input_event(ev2)
	if frame == island_open and main.island:
		var ev := InputEventScreenTouch.new()
		ev.pressed = true
		var vp := get_viewport()
		ev.position = (main.island._tap_zone().get_center() + Vector2(20, 0)) * Vector2(DisplayServer.window_get_size()) / vp.get_visible_rect().size
		Input.parse_input_event(ev)
	if not is_nan(camyaw): main.cam_yaw = camyaw; main.cam_idle = 0.0
	if not is_nan(campitch): main.cam_pitch = campitch
	if stick.size() >= 2 and frame >= (int(stick[2]) if stick.size() >= 3 else 0): main.stick_vec = Vector2(stick[0], stick[1])
	if OS.get_cmdline_user_args().has("--camdebug") and frame % 4 == 1:
		print("cam %s target %s boom %.2f lift %.2f pos %s level %s" % [main.cam.global_position, main.cam_target, main.cam_boom, main.cam_lift, main.pos, main.world.get("level")])
	if cam_v.size() == 6:
		main.cam.look_at_from_position(Vector3(cam_v[0], cam_v[1], cam_v[2]), Vector3(cam_v[3], cam_v[4], cam_v[5]))
