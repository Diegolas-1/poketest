extends Node
# Dev only: the game's real HUD and menus, one screenshot each (the UI pass's
# before / after shots).
#   godot --path native --rendering-driver opengl3 --resolution 1280x590 res://dev/ui_shots.tscn -- --out=<dir> [--touch] [--fresh-conditions]
# Shots: hud (prompt, banner, touch controls, clock, fps, badges, stamina),
# newcond (the new-condition card), card (a badge's card), bubble, dialog,
# toast, settings, settings_controls, log, log_rumors, menu (the island's,
# with PALLET_ISLAND=left).
var main: Node
var out := ""
var frame := 0
var steps: Array = []
var _step := 0
var _wait := 0
var _person = null

func _ready() -> void:
	process_priority = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
	if out == "": out = OS.get_user_data_dir().path_join("ui_shots")
	DirAccess.make_dir_recursive_absolute(out)
	Settings.set_value("fps", 1)
	Settings.set_value("clock_hud", 1)
	main = load("res://main.tscn").instantiate()
	main.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(main)
	steps = [
		[40, "hud", _hud],
		[5, "banner", _banner],
		[30, "newcond", _newcond],
		[12, "card", _card],
		[12, "bubble", _bubble],
		[14, "dialog", _dialog],
		[10, "toast", _toast],
		[14, "settings", _settings],
		[10, "settings_controls", _settings_controls],
		[12, "log", _log],
		[10, "log_rumors", _log_rumors],
		[30, "menu", _menu],
	]

func _cast() -> Node: return main.get("cast")

# Ash a step in front of the townsperson nearest the spawn, facing them (a "Talk" prompt)
func _place_at_npc() -> void:
	var c := _cast()
	var best = null
	var bd := INF
	for n in c.npcs:
		if n.hidden or n.has("level"): continue
		var d: float = (n.pos as Vector3).distance_to(main.pos)
		if d < bd: bd = d; best = n
	if best == null: return
	var np: Vector3 = best.pos
	var f := Vector3(sin(best.yaw), 0, cos(best.yaw))
	var at := np + f * 1.7
	main.pos = Vector3(at.x, main.world.height_at(at.x, at.z), at.z)
	main.yaw = atan2(np.x - at.x, np.z - at.z)
	main.cam_yaw = main.yaw + PI + 0.6

func _process(_dt: float) -> void:
	frame += 1
	if _person != null:
		_person.pos = main.pos + Vector3(2.2, 0, -1.4)
		_person.bubble = {"text": "Lovely morning for a walk, isn't it?", "t": 30.0}
	if _step >= steps.size():
		if frame > 4: get_tree().quit()
		return
	if frame == 3: _place_at_npc()
	if frame < 3: return
	var s: Array = steps[_step]
	_wait += 1
	if _wait == 1 and _step > 0: (s[2] as Callable).call()
	if _step == 0 and _wait == 2:
		(s[2] as Callable).call()
	if _wait >= int(s[0]):
		_snap(String(s[1]))
		_wait = 0
		_step += 1

func _snap(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(out.path_join(name + ".png"))
	print("shot " + out.path_join(name + ".png"))

func _hud() -> void:
	var c := _cast()
	c.dialog._ban_t = 99.0
	c.conditions.apply("wet", 0.7)
	c.cond_ui._pops.clear()
	c.body.stamina = 0.46

func _banner() -> void:
	_cast().dialog.banner("Pallet Town", "A quiet seaside village")

func _newcond() -> void:
	var c := _cast()
	c.conditions.apply("fatigue", 1.0)

func _card() -> void:
	var c := _cast()
	c.cond_ui._pops.clear()
	c.cond_ui._open = "wet"

func _bubble() -> void:
	var c := _cast()
	c.cond_ui._open = ""
	for p in c.life.people:
		if p.state != "inside":
			_person = p
			break

func _dialog() -> void:
	var c := _cast()
	c.dialog.voice = "mid"
	c.dialog.say(["DELIA: Ash! Don't forget your hat, the sun's out over Route 1 today and Professor Oak wants to see you."])
	c.dialog.shown = 9999.0

func _toast() -> void:
	var c := _cast()
	c.dialog.lines = []
	_person = null
	var q = c.life.quests.ui
	q._toasts.clear(); q._toast_t = 0.0
	q.toast("start", "The Butterfree Question")

func _settings() -> void:
	var q = _cast().life.quests.ui
	q._toast_t = 0.5
	Settings.menu.open(true)

func _settings_controls() -> void:
	Settings.menu._set_tab("Controls", true)

func _log() -> void:
	Settings.menu.close()
	_cast().life.quests.ui.open()

func _log_rumors() -> void:
	_cast().life.quests.ui._set_tab("rumors")

func _menu() -> void:
	_cast().life.quests.ui.close()
	if main.island: main.island.open_menu()
