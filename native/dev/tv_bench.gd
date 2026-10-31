extends Node
# Dev only: what the game's frame costs on a TV (the fake TV, 1920 x 1080), in a
# heavy view: Pallet Town's pier looking north over the houses and the grass.
#   xvfb-run ... godot --path native --rendering-driver vulkan --rendering-method mobile \
#     --resolution 1565x720 res://dev/tv_bench.tscn -- --fake-tv=1920x1080 --fake-tv-later [--shot=dir]
# For each configuration: the engine's frame time, the game viewport's CPU and GPU
# render time (RenderingServer's measurements) and the phone's own render time,
# averaged over 40 frames after 20 to settle. Prints BENCH lines.
# (lavapipe renders on the CPU: compare the lines with each other, not with a phone)

var screens: Screens
var frame := 0
var phase := -1
var wait := 0
var acc := {}
var configs: Array = []
var shot := ""

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 3000
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="): shot = a.substr(7)
	screens = load("res://screens.tscn").instantiate()
	add_child(screens)
	Settings.set_value("tv_res", 1080)
	configs = [
		["tv 1080, as the game sets it", {}],
		["no phone preview", {"tv_preview": 0}],
		["no ink outlines", {"outlines": 0}],
		["no shadows", {"shadow": 0}],
		["no grass", {"grass": 0}],
		["no MSAA", {"aa": "off"}],
		["3D scale 0.85", {"scale": 0.85}],
	]

func _place() -> void:
	var m = screens.main
	m.pos = Vector3(-4.0, 0.0, 58.0)
	m.pos.y = m.world.height_at(m.pos.x, m.pos.z)
	m.yaw = PI
	m.cam_yaw = 0.0
	m.speed = 0.0

func _process(dt: float) -> void:
	frame += 1
	var m = screens.main
	if m == null or m.cast == null: return
	if phase == -1:
		if frame < 20: return
		screens.tv.fake_connect(Vector2i(1920, 1080), "Bench TV")
		phase = 0; wait = 40
		_apply_cfg(0)
		return
	_place()
	if wait > 0:
		wait -= 1
		if wait < 40 - 20 and wait >= 0:
			pass
		return
	if acc.is_empty(): acc = {"n": 0, "dt": 0.0, "cpu": 0.0, "gpu": 0.0, "pcpu": 0.0, "pgpu": 0.0}
	acc.n += 1
	acc.dt += dt * 1000.0
	var g := screens.game.get_viewport_rid()
	var r := get_tree().root.get_viewport_rid()
	acc.cpu += RenderingServer.viewport_get_measured_render_time_cpu(g)
	acc.gpu += RenderingServer.viewport_get_measured_render_time_gpu(g)
	acc.pcpu += RenderingServer.viewport_get_measured_render_time_cpu(r)
	acc.pgpu += RenderingServer.viewport_get_measured_render_time_gpu(r)
	if acc.n < 40: return
	var n := float(acc.n)
	print("BENCH %-30s frame %6.1f ms   game cpu %5.1f gpu %6.1f   phone cpu %4.1f gpu %5.1f   render %s scale %.2f" % [configs[phase][0], acc.dt / n, acc.cpu / n, acc.gpu / n, acc.pcpu / n, acc.pgpu / n, screens.game.size, screens.game.scaling_3d_scale])
	if shot != "" and phase == 0:
		DirAccess.make_dir_recursive_absolute(shot)
		screens.game.get_texture().get_image().save_png(shot.path_join("bench_dock.png"))
	acc = {}
	_unset(phase)
	phase += 1
	if phase >= configs.size():
		get_tree().quit()
		return
	_apply_cfg(phase)
	wait = 40

var _saved := {}
func _apply_cfg(i: int) -> void:
	_saved = {}
	for k in configs[i][1]:
		if not Settings.EXTRA.has(k) and not Settings.PRESETS[Settings.preset].has(k): continue
		_saved[k] = Settings.get_value(k)
		Settings.set_value(k, configs[i][1][k])

func _unset(_i: int) -> void:
	for k in _saved: Settings.set_value(k, _saved[k])
