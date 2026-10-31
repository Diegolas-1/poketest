extends Node
# Dev only: the ink outlines on the TV (the fake TV, 1920 x 1080) at the
# highest quality, for comparing line quality before and after a change.
#   xvfb-run ... godot --path native --rendering-driver vulkan --rendering-method mobile \
#     --resolution 1565x720 res://dev/ink_shot.tscn -- --fake-tv=1920x1080 --fake-tv-later \
#     --out=dir [--tag=name] [--preset=ultra] [--set=key:value,...]
# Saves <out>/<tag>_<view>.png (the TV frame, HUD hidden) for a few views: the
# player close up, a house, a fence and a tree canopy. Auto resolution is off so
# the slow software renderer does not lower the scale. Also prints the TV
# viewport's 3D scale, MSAA and the GPU time per view.

var screens: Screens
var frame := 0
var idx := -1
var wait := 0
var out := ""
var tag := "shot"
var preset := "ultra"
var sets := {}
var gpu := 0.0
var n := 0
# name, player x, z, player yaw, camera yaw, camera pitch, camera distance
const VIEWS := [
	["ash", -4.0, 58.0, PI * 0.8, 0.5, 0.18, 3.6],
	["dock", -4.0, 58.0, PI, 0.0, 0.32, 7.5],
	["house", -10.0, 30.0, PI, 0.3, 0.25, 7.5],
	["town", 0.0, 10.0, PI, 2.6, 0.3, 9.0],
]

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 3000
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
		elif a.begins_with("--tag="): tag = a.substr(6)
		elif a.begins_with("--preset="): preset = a.substr(9)
		elif a.begins_with("--set="):
			for kv in a.substr(6).split(",", false):
				var p := kv.split(":")
				sets[p[0]] = p[1]
	if out != "": DirAccess.make_dir_recursive_absolute(out)
	screens = load("res://screens.tscn").instantiate()
	add_child(screens)

func _place(v: Array) -> void:
	var m = screens.main
	m.pos = Vector3(v[1], 0.0, v[2])
	m.pos.y = m.world.height_at(m.pos.x, m.pos.z)
	m.yaw = v[3]
	m.cam_yaw = v[4]
	m.cam_pitch = v[5]
	m.cam_dist = v[6]
	m.speed = 0.0

func _process(_dt: float) -> void:
	frame += 1
	var m = screens.main
	if m == null or m.cast == null: return
	if idx == -1:
		if frame < 20: return
		if Settings.has_method("set_preset"): Settings.set_preset(preset)
		Settings.set_value("auto_res", 0)
		Settings.set_value("tv_res", 1080)
		for k in sets:
			var cur = Settings.get_value(k)
			var v = sets[k]
			if cur is float: v = float(v)
			elif cur is int: v = int(v)
			Settings.set_value(k, v)
		screens.tv.fake_connect(Vector2i(1920, 1080), "Ink TV")
		idx = 0; wait = 50
		return
	if frame == 25:
		pass
	for c in screens.main.find_children("*", "CanvasLayer", true, false): c.visible = false
	if screens.card: screens.card.visible = false
	_place(VIEWS[idx])
	if wait > 0:
		wait -= 1
		if wait < 15:
			gpu += RenderingServer.viewport_get_measured_render_time_gpu(screens.game.get_viewport_rid()); n += 1
		return
	var g := screens.game
	var img := g.get_texture().get_image()
	if out != "": img.save_png(out.path_join("%s_%s.png" % [tag, VIEWS[idx][0]]))
	print("INKSHOT %s %s size %s scale %.2f msaa %d ssaa %d gpu %.1f ms" % [tag, VIEWS[idx][0], img.get_size(), g.scaling_3d_scale, g.msaa_3d, g.screen_space_aa, gpu / maxf(1.0, n)])
	gpu = 0.0; n = 0
	idx += 1
	if idx >= VIEWS.size():
		get_tree().quit()
		return
	wait = 30
