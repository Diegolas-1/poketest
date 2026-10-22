extends CanvasLayer
# FPS counter and the performance overlay (Settings rows "fps" and "perf"):
# frame rate, frame time average / worst, CPU and GPU time, draw calls,
# primitives, objects, video memory and the render resolution, refreshed
# twice a second, so the numbers can be read off the phone and reported.

var fps_label: Label
var panel: PanelContainer
var text: Label
var acc := 0.0
var n := 0
var worst := 0.0
var cpu := 0.0
var gpu := 0.0

func _ready() -> void:
	layer = 90
	process_mode = Node.PROCESS_MODE_ALWAYS
	fps_label = _label(22)
	fps_label.position = Vector2(84, 24)
	add_child(fps_label)
	panel = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.086, 0.118, 0.172, 0.78)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 14; sb.content_margin_right = 14
	sb.content_margin_top = 10; sb.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", sb)
	panel.position = Vector2(16, 84)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text = _label(17)
	text.add_theme_constant_override("line_spacing", 2)
	text.text = "measuring…"
	panel.add_child(text)
	add_child(panel)
	refresh()

func _label(sz: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	l.add_theme_constant_override("outline_size", 5)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func refresh() -> void:
	if not is_inside_tree(): return
	fps_label.visible = int(Settings.get_value("fps")) == 1
	panel.visible = int(Settings.get_value("perf")) == 1

func _process(dt: float) -> void:
	if not fps_label.visible and not panel.visible: return
	var rid := get_viewport().get_viewport_rid()
	acc += dt; n += 1; worst = maxf(worst, dt)
	cpu += RenderingServer.viewport_get_measured_render_time_cpu(rid)
	gpu += RenderingServer.viewport_get_measured_render_time_gpu(rid)
	if acc < 0.5: return
	var fps := n / acc
	var avg := acc / n * 1000.0
	fps_label.text = "%d fps · %.1f ms" % [roundi(fps), avg]
	var target := Settings.target_fps()
	fps_label.add_theme_color_override("font_color", Color.WHITE if fps >= target * 0.95 else (Color("ffd27a") if fps >= target * 0.75 else Color("ff8a7a")))
	if panel.visible:
		var win := DisplayServer.window_get_size()
		var s := Settings.render_scale()
		var lines := [
			"%d fps  (target %d)" % [roundi(fps), roundi(target)],
			"frame  %.2f ms avg · %.1f worst" % [avg, worst * 1000.0],
			"cpu %.2f ms · gpu %.2f ms" % [cpu / n, gpu / n],
			"draw calls  %d" % RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			"primitives  %s" % _big(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)),
			"objects  %d" % RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
			"video mem  %d MB" % roundi(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED) / 1048576.0),
			"3D  %dx%d (%d%%%s)" % [roundi(win.x * s), roundi(win.y * s), roundi(s * 100.0), " auto" if int(Settings.get_value("auto_res")) == 1 and Settings.auto_scale < 1.0 else ""],
			"screen  %dx%d @ %d Hz" % [win.x, win.y, roundi(Settings.refresh_rate())],
		]
		text.text = "\n".join(lines)
	acc = 0.0; n = 0; worst = 0.0; cpu = 0.0; gpu = 0.0

func _big(v: int) -> String:
	if v >= 1000000: return "%.2fM" % (v / 1000000.0)
	if v >= 1000: return "%.1fk" % (v / 1000.0)
	return str(v)
