extends Node
# Dev only: Viridian City in pictures, for the people building it. Loads the
# game once, then for every view and hour sets the clock, places Ash (and a
# fixed camera for the wide views), waits a few frames and saves the picture.
#   godot --path native --resolution 1600x740 res://dev/viridian_shot.tscn -- --out=<dir>
#     [--views=reveal,plaza,...] [--hours=12,19.5,22] [--stats] [--tv]
# Views: reveal (the crest of the cutting: the valley opens), cutting (the
# slide, looking up the road), plaza (the Center's plaza), avenue (Evergreen
# Avenue, east), lakeside (the promenade and the pier), oldtown (Old Street to
# Route 2's gate), gym (the GYM on its rise), aerial (the whole bowl from above
# the south rim), gate (Route 1's open gate). Saved as <view>_<hhmm>.png;
# --stats prints the draw calls, objects, primitives and the GPU time per view.
var main: Node
var out := ""
var hours: Array = [12.0]
var views: Array = ["reveal", "cutting", "plaza", "avenue", "lakeside", "oldtown", "gym", "aerial", "gate"]
var stats := false
var frame := 0
var jobs: Array = []
var job := -1
var wait := 0
var _times: Array = []
var _eye: Array = []
# view: Ash at (x, z), camera yaw, pitch, distance; or eye + look (a fixed camera)
const V := {
	"reveal": {"pos": Vector2(1.6, -500.0), "yaw": 0.0, "pitch": 0.1, "dist": 6.5},
	"reveal_wide": {"pos": Vector2(1.6, -498.0), "eye": Vector3(1.0, 31.5, -494.0), "look": Vector3(-20.0, 18.0, -680.0)},
	"cutting": {"pos": Vector2(0.0, -478.0), "yaw": 0.08, "pitch": 0.18, "dist": 7.5},
	"plaza": {"pos": Vector2(9.0, -612.0), "yaw": 0.25, "pitch": 0.2, "dist": 9.0},
	"avenue": {"pos": Vector2(40.0, -624.0), "yaw": -PI / 2 + 0.2, "pitch": 0.18, "dist": 8.0},
	"lakeside": {"pos": Vector2(-128.0, -716.0), "yaw": 0.9, "pitch": 0.16, "dist": 8.0},
	"oldtown": {"pos": Vector2(-22.0, -760.0), "yaw": 0.1, "pitch": 0.18, "dist": 8.0},
	"gym": {"pos": Vector2(70.0, -762.0), "yaw": 0.15, "pitch": 0.15, "dist": 10.0},
	"aerial": {"pos": Vector2(6.0, -590.0), "eye": Vector3(60.0, 150.0, -420.0), "look": Vector3(-20.0, 10.0, -740.0)},
	"aerial_w": {"pos": Vector2(-128.0, -716.0), "eye": Vector3(-60.0, 110.0, -560.0), "look": Vector3(-200.0, 10.0, -760.0)},
	"gate": {"pos": Vector2(-2.3, -425.0), "yaw": 0.0, "pitch": 0.2, "dist": 7.5},
	# references for the cost: Route 1 (the tall grass, the tea house) and Pallet's square
	"route1": {"pos": Vector2(-10.0, -240.0), "yaw": 0.0, "pitch": 0.2, "dist": 7.5},
	"pallet": {"pos": Vector2(-3.0, -2.0), "yaw": 2.6, "pitch": 0.22, "dist": 9.0},
}

func _ready() -> void:
	process_priority = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
		elif a.begins_with("--hours="): hours = Array(a.substr(8).split(",")).map(func(x): return float(x))
		elif a.begins_with("--views="): views = Array(a.substr(8).split(","))
		elif a == "--stats": stats = true
	if out != "": DirAccess.make_dir_recursive_absolute(out)
	main = load("res://main.tscn").instantiate()
	add_child(main)
	for p in views:
		for h in hours: jobs.append([p, h])

func _place(p: String) -> void:
	if not V.has(p): return
	var s: Dictionary = V[p]
	var pos := Vector3(s.pos.x, 0.0, s.pos.y)
	pos.y = main.world.height_at(pos.x, pos.z)
	main.pos = pos
	main.speed = 0.0
	main.cam_yaw = s.get("yaw", 0.0)
	main.cam_pitch = s.get("pitch", 0.2)
	if s.has("dist"): main.cam_dist = s.dist
	main.cam_idle = 0.0
	main.cam_ty = pos.y
	main.cam_target = pos + Vector3(0, 1.45, 0)
	main.cast.land(pos.y)
	_eye = [s.eye, s.look] if s.has("eye") else []

func _process(dt: float) -> void:
	frame += 1
	if frame < 40: return
	if stats and job >= 0: _times.append(dt)
	if not _eye.is_empty():
		main.cam.far = 4000.0
		main.cam.look_at_from_position(_eye[0], _eye[1])
	if main.cast and main.cast.dialog: main.cast.dialog.visible = false
	for n in get_tree().root.find_children("*", "UIDialogPanel", true, false): n.visible = false
	if wait > 0:
		wait -= 1
		var j: Array = jobs[job]
		_place(j[0])
		if wait == 0: _snap(j)
		return
	job += 1
	if job >= jobs.size():
		get_tree().quit()
		return
	var jj: Array = jobs[job]
	var c: GameClock = main.cast.clock
	c.real = false; c.ff = 1.0
	c.set_time(fmod(float(jj[1]), 24.0), 1)
	_place(jj[0])
	main.daynight.force_update()
	wait = 24
	_times.clear()

func _snap(j: Array) -> void:
	var hh := float(j[1])
	var nm := "%s_%02d%02d" % [j[0], int(hh), int(round(fmod(hh, 1.0) * 60.0))]
	if stats:
		var R := RenderingServer
		print("stats %s draws %d objects %d prims %d cpu_ms %.2f gpu_ms %.2f" % [nm,
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME), R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME),
			R.viewport_get_measured_render_time_cpu(get_viewport().get_viewport_rid()), R.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())])
	if out == "": return
	RenderingServer.frame_post_draw.connect(func(): get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out, nm]), CONNECT_ONE_SHOT)
