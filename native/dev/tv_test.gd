extends Node
# Dev only: the TV path end to end with the desktop stand-in for a TV (a second
# window; tv/tv_link.gd fake backend). Renders and checks:
#   VK_ICD_FILENAMES=... xvfb-run -a -s "-screen 0 2560x1440x24" godot --path native \
#     --rendering-driver vulkan --rendering-method mobile --resolution 1565x720 \
#     res://dev/tv_test.tscn -- --fake-tv=1920x1080 --fake-tv-later [--shots=dir]
#   (PALLET_ISLAND=left pretends the iPhone's Dynamic Island, as on the phone)
# Steps: the game on the "phone" (its viewport the window's size); the TV connects:
# the game's viewport takes the TV's size and 16:9 canvas, the HUD its safe margin,
# the camera the TV's aspect, the island moves to the phone, the phone shows the
# companion, the frame cap follows the TV; Start pauses and resumes; the bike's
# wider view on the TV; Settings' TV tab; the TV goes: everything back as it was.
# --shots=dir saves the TV frame, the phone frame (companion), the pause screen,
# the settings tab and the phone after the TV left. Prints PASS / FAIL; exits 1
# on a failure.

var screens: Screens
var frame := 0
var fails := 0
var shots := ""
var step := 0
var wait := 0
var before := {}

func check(ok: bool, what: String) -> void:
	print(("PASS " if ok else "FAIL ") + what)
	if not ok: fails += 1

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 2000
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shots="): shots = a.substr(8)
	if shots != "": DirAccess.make_dir_recursive_absolute(shots)
	screens = load("res://screens.tscn").instantiate()
	add_child(screens)

func _snap(vp: Viewport, name: String) -> void:
	if shots == "": return
	var img := vp.get_texture().get_image()
	img.save_png(shots.path_join(name + ".png"))
	print("shot %s %s" % [name, img.get_size()])

func _press(action: String) -> void:
	var e := InputEventAction.new()
	e.action = action
	e.pressed = true
	Input.parse_input_event(e)
	var u := InputEventAction.new()
	u.action = action
	u.pressed = false
	Input.parse_input_event.call_deferred(u)

func _process(_dt: float) -> void:
	frame += 1
	if wait > 0:
		wait -= 1
		return
	var g := screens.game
	var root := get_tree().root
	var main = screens.main
	match step:
		0:
			# the game on the phone, after the world has loaded
			if frame < 30 or main.cast == null: return
			before = {"size": g.size, "canvas": g.size_2d_override, "fps": Engine.max_fps, "keep": DisplayServer.screen_is_kept_on()}
			check(g.size == root.size, "phone: the game renders at the window's size %s (got %s)" % [root.size, g.size])
			check(Vector2(g.size_2d_override) == root.get_visible_rect().size, "phone: the game's canvas is the window's (%s)" % [g.size_2d_override])
			check(screens.view.visible and screens.view.texture != null, "phone: the game's picture fills the phone")
			check(root.disable_3d, "phone: the window itself draws no 3D")
			check(main.cam.get_viewport() == g, "the camera renders in the game's viewport")
			check(main.island.get_parent() == main, "phone: the Dynamic Island HUD is in the game")
			step = 1
		1:
			screens.tv.fake_connect(Vector2i(1920, 1080), "Living Room TV")
			step = 2; wait = 4
		2:
			check(screens.tv_on, "TV: connected (fake 1920 x 1080)")
			check(g.size == Vector2i(1920, 1080), "TV: the game renders at the TV's 1920 x 1080 (got %s)" % [g.size])
			check(g.size_2d_override == Vector2i(1280, 720), "TV: the HUD's canvas is 16:9, 1280 x 720 (got %s)" % [g.size_2d_override])
			var sr := UITheme.safe_rect(main.hud)
			check(absf(sr.position.x - 1280 * 0.03) < 0.6 and absf(sr.size.x - 1280 * 0.94) < 1.2 and absf(sr.position.y - 720 * 0.03) < 0.6, "TV: the HUD's safe area is the TV's 3%% margin (got %s)" % [sr])
			var asp: float = main.cam.get_viewport().get_visible_rect().size.aspect()
			check(absf(asp - 16.0 / 9.0) < 0.01, "TV: the camera's aspect is the TV's 16:9 (%.3f)" % asp)
			check(main.island.get_parent() == screens and main.island.on_tv, "TV: the Dynamic Island HUD moved to the phone")
			check(not screens.view.visible, "TV: the phone stops drawing the game's picture")
			check(screens.companion.visible, "TV: the phone shows the companion menu")
			check(Engine.max_fps == mini(60, int(Settings.get_value("fps_cap")) if int(Settings.get_value("fps_cap")) > 0 else 60), "TV: the frame cap follows the TV (%d)" % Engine.max_fps)
			check(DisplayServer.screen_is_kept_on(), "TV: the phone stays awake")
			check(screens.tv.fake_window() != null and (screens.tv.fake_window().get_child(0) as TextureRect).texture == g.get_texture(), "TV: the TV window shows the game's picture")
			var rows: Array = screens.companion._rows
			check(rows.size() >= 4, "TV: the companion lists the start menu's rows (%d)" % rows.size())
			step = 3; wait = 50
		3:
			_snap(screens.game, "tv_frame")
			_snap(root, "phone_frame")
			if screens.tv.fake_window(): _snap(screens.tv.fake_window(), "tv_window")
			# Start pauses on the TV
			_press("menu")
			step = 4; wait = 3
		4:
			check(screens.tv_paused and get_tree().paused, "TV: Start pauses the game")
			check(not Settings.menu.root.visible, "TV: Start does not open the settings")
			step = 5; wait = 25
		5:
			_snap(screens.game, "tv_paused")
			_snap(root, "phone_paused")
			_press("menu")
			step = 6; wait = 3
		6:
			check(not screens.tv_paused and not get_tree().paused, "TV: Start again resumes")
			# the phone's menu: the settings open on the phone, the game keeps going
			var si := -1
			for i in screens.companion._rows.size():
				if screens.companion._rows[i][1] == "settings": si = i
			check(si >= 0, "TV: the companion has Settings")
			if si >= 0: screens.companion._choose(si)
			step = 7; wait = 3
		7:
			check(Settings.menu.root.visible, "TV: Settings opens on the phone")
			check(not get_tree().paused, "TV: the game plays on while the phone shows the settings")
			Settings.menu._set_tab("TV", false)
			step = 8; wait = 20
		8:
			var b: Node = Settings.menu.list.find_child("ConnectTV", true, false)
			var st: Label = Settings.menu.list.find_child("TVStatus", true, false) as Label
			check(b != null, "Settings: the TV tab has Connect to TV")
			check(st != null and st.text.contains("LIVING ROOM TV") and st.text.contains("1920"), "Settings: the status names the TV and its mode (%s)" % [st.text if st else "-"])
			_snap(root, "settings_tv")
			Settings.menu.close()
			# the bike's wider view on the TV: the camera's field of view is the game's own
			step = 9; wait = 2
		9:
			var fov: float = main.cam.fov
			check(fov > 30.0 and fov < 90.0, "TV: the camera keeps the game's field of view (%.1f)" % fov)
			screens.tv.fake_disconnect()
			step = 10; wait = 4
		10:
			check(not screens.tv_on, "disconnect: back on the phone")
			check(g.size == root.size and g.size == before.size, "disconnect: the game renders at the phone's size again (%s)" % [g.size])
			check(g.size_2d_override == before.canvas, "disconnect: the phone's canvas again (%s)" % [g.size_2d_override])
			check(not g.has_meta("tv") and not g.has_meta("tv_safe"), "disconnect: no TV safe area left")
			check(main.island.get_parent() == main and not main.island.on_tv, "disconnect: the Dynamic Island HUD back in the game")
			check(screens.view.visible and screens.view.texture == g.get_texture(), "disconnect: the phone shows the game again")
			check(Engine.max_fps == before.fps, "disconnect: the frame cap is the phone's again (%d)" % Engine.max_fps)
			check(DisplayServer.screen_is_kept_on() == before.keep, "disconnect: the screen's keep-awake as before")
			check(main.cast != null and is_instance_valid(main.cast.player), "disconnect: the game goes on (nothing rebuilt)")
			step = 11; wait = 30
		11:
			_snap(root, "phone_after")
			print("tv_test: %s" % ("PASS" if fails == 0 else "%d FAIL" % fails))
			get_tree().quit(1 if fails > 0 else 0)
			step = 12
