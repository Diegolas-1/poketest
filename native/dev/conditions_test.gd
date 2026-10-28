extends SceneTree
# Dev test for conditions.gd (headless, no game): data, apply / stack rules,
# decay on a fake clock, effects, entry refusals, remarks once per episode,
# save and load; and hunger.gd: the calorie maths, the levels and what they do to
# his stamina, the badges they show, eating, save and load. Exits 0 when green:
#   godot --headless --path native -s res://dev/conditions_test.gd
#   godot --headless --path native res://dev/conditions_test.tscn   (the same, as a scene, with the hunger checks)

class FakeClock extends Object:
	var minutes := 1440.0 + 480.0

static var fails := 0

static func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func _init() -> void:
	quit(run(root, false))

# the checks, under any node (the scene version calls this, with the hunger checks:
# those need the game's autoloads, which a -s script doesn't have); returns the exit code
static func run(root: Node, hunger := true) -> int:
	fails = 0
	var clk := FakeClock.new()
	var C := Conditions.new()
	C.save_path = "user://conditions_test.save"
	C.autosave = false
	root.add_child(C)
	C.setup(clk)
	check(C.defs.has("wet") and C.defs.has("fatigue"), "defs load")
	C.apply("wet", 0.4)
	check(C.has("wet") and absf(C.strength("wet") - 0.4) < 1e-4, "apply")
	C.apply("wet", 0.2)
	check(absf(C.strength("wet") - 0.4) < 1e-4, "stack max keeps the higher")
	check(C.label("wet") == "Wet", "level name at 0.4: " + C.label("wet"))
	check(absf(C.minutes_left("wet") - 24.0) < 0.01, "0.4 of an hour left")
	# 12 game minutes pass
	clk.minutes += 12.0
	C._process(0.016)
	check(absf(C.strength("wet") - 0.2) < 1e-3, "decay by game time: %.3f" % C.strength("wet"))
	check(C.label("wet") == "Damp", "Damp at 0.2")
	# holding (in the water) stops the decay
	C.hold("wet"); clk.minutes += 5.0; C._process(0.016)
	check(absf(C.strength("wet") - 0.2) < 1e-3, "held: no decay")
	check(C.time_text("wet") == "Still in the water", "held text: " + C.time_text("wet"))
	# speed by strength: 1 + (0.97 - 1) * 0.2
	check(absf(C.mult("speed") - (1.0 - 0.03 * 0.2)) < 1e-4, "speed by strength")
	# the lab: above 0.5 refused
	check(C.entry_refusal("oak_lab").is_empty(), "lab open at 0.2")
	C.apply("wet", 0.8)
	var r := C.entry_refusal("oak_lab")
	check(not r.is_empty() and String(r.lines[0]).begins_with("LAB AIDE: "), "lab refuses soaked")
	check(not C.entry_refusal("some_house").is_empty(), "default refuses at 0.8 (above 0.65)")
	# remarks: once per episode, then a cooldown
	var rm := C.remarks_for("bram")
	check(rm.size() == 1 and rm[0].keys[0] == "soaked", "soaked remark first")
	check(C.remarks_for("bram").is_empty(), "once per episode")
	check(C.remarks_for("delia").size() == 1, "each person once")
	# fatigue: manual, flags
	C.apply("fatigue", 1.0)
	check(C.flag("no_run"), "fatigue: no run")
	clk.minutes += 600.0; C._process(0.016)
	check(C.has("fatigue") and not C.has("wet"), "fatigue stays (manual), wet dried after 10 h")
	C.remove("fatigue")
	check(not C.has("fatigue"), "remove")
	# save / load
	C.apply("wet", 0.6)
	C.body["stamina"] = 0.42
	C.save()
	var D := Conditions.new()
	D.save_path = C.save_path
	D.load_state()
	check(absf(D.strength("wet") - 0.6) < 1e-4 and absf(float(D.body.stamina) - 0.42) < 1e-4, "save / load")
	D.free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(C.save_path))
	C.reset()
	if hunger: load("res://dev/hunger_checks.gd").run(root, C, clk, check)
	else: print("(the hunger checks run in the scene: res://dev/conditions_test.tscn)")
	print("conditions_test: %d failures" % fails)
	print("CONDITIONS TEST GREEN" if fails == 0 else "CONDITIONS TEST RED")
	C.queue_free()
	clk.free()
	return 1 if fails else 0
