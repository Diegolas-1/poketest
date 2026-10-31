extends Node
# Dev only: the day and night in pictures (daynight.gd). Loads the game once,
# then for every hour and every place sets the clock, waits a few frames and
# saves the picture (no movie frames on disk).
#   godot --path native --resolution 1280x590 res://dev/daynight_shot.tscn -- --out=<dir>
#     [--hours=4,6,8] [--places=town,route1,street,pond] [--day=1] [--interior=oak_lab]
#     [--calendar] (the calendar screen) [--stats] (draw calls and frame times) [--off]
# Places: town (Ash's house, the square beyond), route1 (the tall grass),
# street (by a street lamp, houses behind), pond (the fresh water by Route 1),
# west and east (the sky toward the sunset and the sunrise); "place@k" orbits;
# with --interior the same hours inside it. Saved as <place>_<hhmm>.png.
var main: Node
var out := ""
var hours: Array = [4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0]
var places: Array = ["town", "route1"]
var day := 1
var interior := ""
var calendar := false
var stats := false
var off := false            # --off: the cycle switched off (the fixed midday look)
var frame := 0
var jobs: Array = []        # [place, hour]
var job := -1
var wait := 0
var spots := {}
var _times: Array = []

func _ready() -> void:
	process_priority = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
		elif a.begins_with("--hours="): hours = Array(a.substr(8).split(",")).map(func(x): return float(x))
		elif a.begins_with("--places="): places = Array(a.substr(9).split(","))
		elif a.begins_with("--day="): day = int(a.substr(6))
		elif a.begins_with("--interior="): interior = a.substr(11)
		elif a == "--calendar": calendar = true
		elif a == "--stats": stats = true
		elif a == "--off": off = true
	main = load("res://main.tscn").instantiate()
	add_child(main)
	if interior != "": places = ["in_" + interior]
	for p in places:
		for h in hours: jobs.append([p, h])
	if calendar: jobs.append(["calendar", 20.5])

func _spots() -> void:
	var sp: Array = main.world.meta.spawn
	spots["town"] = {"pos": Vector3(sp[0], 0, sp[2]), "yaw": 2.6, "pitch": 0.22, "dist": 9.0}
	# Route 1's tall grass: a patch near the middle of its south half
	var w = main.world
	var img: Image = w.grass_tex.get_image()
	var ga: Vector4 = w.grass_area
	var best := Vector2(0, -150)
	var bd := 1e9
	for j in range(0, img.get_height(), 3):
		for i in range(0, img.get_width(), 3):
			if img.get_pixel(i, j).g < 1.5: continue
			var p := Vector2(ga.x + (i + 0.5) * ga.z / img.get_width(), ga.y + (j + 0.5) * ga.w / img.get_height())
			var d := p.distance_to(Vector2(0, -150))
			if d < bd: bd = d; best = p
	spots["route1"] = {"pos": Vector3(best.x + 3.0, 0, best.y + 4.0), "yaw": 0.7, "pitch": 0.2, "dist": 8.0}
	# a street lamp: the one nearest the spawn, Ash a few metres off it
	var lamps: Array = main.daynight.fx.lamps if main.daynight and main.daynight.fx else []
	var lp := Vector3(sp[0], 0, sp[2])
	var ld := 1e9
	for l in lamps:
		if l.h < 2.4: continue
		var d2: float = Vector2(l.pos.x, l.pos.z).distance_to(Vector2(sp[0], sp[2]))
		if d2 < ld: ld = d2; lp = l.pos
	spots["street"] = {"pos": Vector3(lp.x + 3.0, 0, lp.z + 3.0), "yaw": 0.785, "pitch": 0.16, "dist": 8.5}
	var fresh: Array = main.water_root.find_children("fresh*", "MeshInstance3D", true, false) if main.water_root else []
	var fp := Vector3(0, 0, -120)
	if not fresh.is_empty(): fp = (fresh[0] as MeshInstance3D).global_transform * (fresh[0] as MeshInstance3D).mesh.get_aabb().get_center()
	spots["pond"] = {"pos": Vector3(fp.x + 6.0, 0, fp.z + 6.0), "yaw": 0.785, "pitch": 0.2, "dist": 9.0}
	# the sky: from the street, toward the sunset (west) and the sunrise (east)
	for k in ["west", "east"]:
		var hrs := GameCalendar.sun_hours(main.cast.clock.day_of_year())
		var sd := DayNight.sun_dir_at(hrs.y if k == "west" else hrs.x, main.cast.clock.day_of_year())
		var base: Vector3 = spots.street.pos
		base.y = main.world.height_at(base.x, base.z)
		var hz := Vector3(sd.x, 0.0, sd.z).normalized()
		spots[k] = {"pos": base, "yaw": 0.0, "pitch": 0.2, "eye": base + Vector3(0, 7.0, 0) - hz * 6.0, "look": base + hz * 30.0 + Vector3(0, 9.0, 0)}
	print("spots ", spots)

# "place@k": an orbit view round the place (k * 45 degrees, 22 m out, 11 up)
func _orbit(p: String) -> void:
	var base := p.get_slice("@", 0)
	if spots.has(p) or not spots.has(base): return
	var s: Dictionary = spots[base].duplicate()
	var a := int(p.get_slice("@", 1)) * PI / 4.0
	var c: Vector3 = s.pos
	c.y = main.world.height_at(c.x, c.z)
	s["eye"] = c + Vector3(sin(a) * 22.0, 11.0, cos(a) * 22.0)
	s["look"] = c + Vector3(0, 1.0, 0)
	spots[p] = s

func _place(p: String) -> void:
	if p.contains("@"): _orbit(p)
	if p == "moon" and spots.has("street"):
		# toward the moon, wherever it is at this hour
		var c: GameClock = main.cast.clock
		var md := DayNight.moon_dir_at(c.hour(), c.day_of_year(), c.moon_phase())
		var base: Vector3 = spots.street.pos
		base.y = main.world.height_at(base.x, base.z)
		var e := base + Vector3(0, 2.0, 0)
		spots["moon"] = {"pos": base, "yaw": 0.0, "pitch": 0.2, "eye": e, "look": e + Vector3(md.x, maxf(md.y, 0.05) * 0.8, md.z) * 30.0}
	if p.begins_with("in_"):
		if not main.indoors: main.enter_space(p.substr(3), "", true)
		return
	if not spots.has(p): return
	var s: Dictionary = spots[p]
	var pos: Vector3 = s.pos
	pos.y = main.world.height_at(pos.x, pos.z)
	main.pos = pos
	main.speed = 0.0
	main.cam_yaw = s.yaw
	main.cam_pitch = s.pitch
	main.cam_idle = 0.0
	main.cam_ty = pos.y
	main.cam_target = pos + Vector3(0, 1.45, 0)
	main.cast.land(pos.y)
	if s.has("eye"): _eye = [s.eye, s.look]
	else: _eye = []

var _eye: Array = []

func _process(dt: float) -> void:
	frame += 1
	if frame < 40: return
	if spots.is_empty(): _spots()
	if stats and job >= 0: _times.append(dt)
	if not _eye.is_empty(): main.cam.look_at_from_position(_eye[0], _eye[1])
	if main.cast and main.cast.dialog: main.cast.dialog.visible = false   # (the banners)
	if wait > 0:
		for n in get_tree().root.find_children("*", "UIDialogPanel", true, false): n.visible = false   # (Oak's call at Route 1)
	if wait > 0:
		wait -= 1
		var j: Array = jobs[job]
		if j[0] != "calendar" and not String(j[0]).begins_with("in_"): _place(j[0])
		if wait == 0: _snap(j)
		return
	job += 1
	if job >= jobs.size():
		get_tree().quit()
		return
	var jj: Array = jobs[job]
	var c: GameClock = main.cast.clock
	c.real = false; c.ff = 1.0
	c.set_time(fmod(float(jj[1]), 24.0) if float(jj[1]) < 24.0 else 23.99, day)
	_place(jj[0])
	if jj[0] == "calendar": c.open_calendar()
	if off: main.daynight.enabled = false
	main.daynight.force_update()
	wait = 14
	_times.clear()

func _snap(j: Array) -> void:
	var hh := float(j[1])
	var nm := "%s_%02d%02d" % [j[0], int(hh), int(round(fmod(hh, 1.0) * 60.0))]
	if stats:
		var R := RenderingServer
		var avg := 0.0
		for t in _times: avg += t
		print("stats %s draws %d objects %d prims %d cpu_ms %.2f gpu_ms %.2f" % [nm,
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME), R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME),
			R.viewport_get_measured_render_time_cpu(get_viewport().get_viewport_rid()), R.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())])
	if out == "": return
	RenderingServer.frame_post_draw.connect(func(): get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out, nm]), CONNECT_ONE_SHOT)
