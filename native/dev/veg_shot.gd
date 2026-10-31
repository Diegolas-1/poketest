extends Node
# Dev only: the plants' ink (canopies, trunks, grass and flowers) on the TV
# (the fake TV, 1920 x 1080, at the highest quality) or on the phone (the
# window's size, the default preset), for before / after comparisons.
#   xvfb-run ... godot --path native --rendering-driver vulkan --rendering-method mobile \
#     --resolution 1565x720 res://dev/veg_shot.tscn -- --fake-tv=1920x1080 --fake-tv-later \
#     --out=dir [--tag=name] [--tv] [--preset=ultra] [--set=key:value,...] [--only=view,view]
#     [--view=name:cx:cy:cz:tx:ty:tz:px:pz] [--wait=frames]
# A view: the camera at (cx, cz), cy metres over the ground there, looking at
# (tx, tz), ty over the ground; Ash stands at (px, pz) (the grass and the ink's
# focus follow him).
# Phone frames: leave out --tv and the --fake-tv flags, and give --resolution the
# phone's size (e.g. 2556x1179). Saves <out>/<tag>_<view>.png with the HUD hidden.
# The wind is stopped (TIME still runs, but the frames are taken at the same
# moment after the same number of frames), so before / after frames line up.

var screens: Screens
var frame := 0
var idx := -1
var wait := 0
var out := ""
var tag := "shot"
var preset := ""
var tv := false
var sets := {}
var only := []
var gpu := 0.0
var n := 0
var settle := 30
# name, camera x, height, z, target x, height, z, Ash x, z
var views := [
	["overview", 0.0, 140.0, 20.0, 0.0, 0.0, 19.0, 0.0, 10.0],
]

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 3000
	var custom := []
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
		elif a.begins_with("--tag="): tag = a.substr(6)
		elif a.begins_with("--preset="): preset = a.substr(9)
		elif a == "--tv": tv = true
		elif a.begins_with("--only="): only = Array(a.substr(7).split(",", false))
		elif a.begins_with("--view="):
			var p := a.substr(7).split(":")
			custom.append([p[0], float(p[1]), float(p[2]), float(p[3]), float(p[4]), float(p[5]), float(p[6]), float(p[7]), float(p[8])])
		elif a.begins_with("--wait="): settle = int(a.substr(7))
		elif a.begins_with("--set="):
			for kv in a.substr(6).split(",", false):
				var q := kv.split(":")
				sets[q[0]] = q[1]
	if not custom.is_empty(): views = custom
	if not only.is_empty(): views = views.filter(func(v): return only.has(v[0]))
	if tv and preset == "": preset = "ultra"
	if out != "": DirAccess.make_dir_recursive_absolute(out)
	screens = load("res://screens.tscn").instantiate()
	add_child(screens)

func _place(v: Array) -> void:
	var m = screens.main
	m.pos = Vector3(v[7], 0.0, v[8])
	m.pos.y = m.world.height_at(m.pos.x, m.pos.z)
	m.speed = 0.0

# after Main's own frame (process_priority): the camera where the view wants it,
# and the plants' fades and ink switched for it
func _aim(v: Array) -> void:
	var m = screens.main
	var c := Vector3(v[1], 0.0, v[3]); c.y = m.world.height_at(c.x, c.z) + v[2]
	var t := Vector3(v[4], 0.0, v[6]); t.y = m.world.height_at(t.x, t.z) + v[5]
	m.cam.global_position = c
	m.cam.look_at(t, Vector3.UP if absf((t - c).normalized().y) < 0.99 else Vector3.FORWARD)
	if m.scenery: m.scenery.update(c)

func _process(_dt: float) -> void:
	frame += 1
	var m = screens.main
	if m == null or m.cast == null: return
	if idx == -1:
		if frame < 20: return
		if preset != "" and Settings.has_method("set_preset"): Settings.set_preset(preset)
		Settings.set_value("auto_res", 0)
		if tv: Settings.set_value("tv_res", 1080)
		# (settings persist between runs: start each from the defaults that matter)
		for k in ["outlines", "tv_aa", "ink_px", "tv_ink_px"]:
			if not sets.has(k): Settings.set_value(k, Settings.EXTRA0.get(k, 1) if Settings.EXTRA0.has(k) else 1)
		for k in sets:
			var cur = Settings.get_value(k)
			var v = sets[k]
			if cur is float: v = float(v)
			elif cur is int: v = int(v)
			Settings.set_value(k, v)
		if tv: screens.tv.fake_connect(Vector2i(1920, 1080), "Veg TV")
		idx = 0; wait = settle * 2
		return
	for c in screens.main.find_children("*", "CanvasLayer", true, false): c.visible = false
	if screens.card: screens.card.visible = false
	if screens.companion: screens.companion.visible = false
	_place(views[idx])
	_aim(views[idx])
	if wait > 0:
		wait -= 1
		if wait < 15:
			gpu += RenderingServer.viewport_get_measured_render_time_gpu(screens.game.get_viewport_rid()); n += 1
		return
	var g := screens.game
	var img := g.get_texture().get_image()
	if out != "": img.save_png(out.path_join("%s_%s.png" % [tag, views[idx][0]]))
	print("VEGSHOT %s %s size %s scale %.2f msaa %d gpu %.1f ms" % [tag, views[idx][0], img.get_size(), g.scaling_3d_scale, g.msaa_3d, gpu / maxf(1.0, n)])
	gpu = 0.0; n = 0
	idx += 1
	if idx >= views.size():
		get_tree().quit()
		return
	wait = settle
