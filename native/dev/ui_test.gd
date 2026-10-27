extends Node
# Dev test for the UI components' logic (headless): UIDialogPanel's typing,
# advance, choices and slide out; UIChoiceList's navigation and picks;
# UITabs stepping; UIToaster's queue; the speaker tag split; touch targets.
# Exits 0 when green:
#   godot --headless --path native res://dev/ui_test.tscn

var fails := 0
var checks := 0

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c:
		fails += 1
		printerr("FAIL: " + what)

func _key(action: String) -> InputEventAction:
	var e := InputEventAction.new()
	e.action = action
	e.pressed = true
	return e

func _ready() -> void:
	var root_ctl := Control.new()
	root_ctl.size = Vector2(1280, 720)
	add_child(root_ctl)
	_run.call_deferred(root_ctl)

func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout
	await get_tree().process_frame

func _run(host: Control) -> void:
	# ---- the speaker tag ----
	ok(UIDialogPanel.split_speaker("OAK: Hey! Wait!") == ["OAK", "Hey! Wait!"], "split OAK")
	ok(UIDialogPanel.split_speaker("MR. MIME: Mime!") == ["MR. MIME", "Mime!"], "split MR. MIME")
	ok(UIDialogPanel.split_speaker("Look: a sign.")[0] == "", "no split for sentence case")
	ok(UIDialogPanel.split_speaker("(He reads: hello)")[0] == "", "no split for narration")
	ok(UIDialogPanel.fit_size("Short.", 900.0) == UIDialogPanel.TEXT_SIZE, "short line at full size")
	# ---- the dialog panel ----
	var dp := UIDialogPanel.new()
	host.add_child(dp)
	var got := {"advanced": 0, "finished": 0, "typed": 0, "picked": -1, "closed": 0}
	dp.advanced.connect(func(): got.advanced += 1)
	dp.line_finished.connect(func(): got.finished += 1)
	dp.typed.connect(func(_i): got.typed += 1)
	dp.choice_picked.connect(func(i, _c): got.picked = i)
	dp.closed.connect(func(): got.closed += 1)
	dp.show_line("DELIA: Don't forget your hat!")
	ok(dp.speaker == "DELIA" and dp.line == "Don't forget your hat!", "speaker from the tag")
	ok(dp.is_typing(), "typing after show_line")
	dp.press()
	ok(not dp.is_typing() and got.advanced == 0, "first press finishes the line")
	await _wait(0.05)
	ok(got.finished == 1, "line_finished once")
	dp.press()
	ok(got.advanced == 1, "second press advances")
	dp.show_line("A longer line that types out over a few frames.", "Oak")
	ok(dp.speaker == "Oak", "speaker given")
	await _wait(1.5)
	ok(not dp.is_typing() and got.typed > 10, "typed it out (%d letters)" % got.typed)
	dp.show_choices(["Sure!", {"text": "No way", "disabled": true}, "Maybe"])
	ok(dp.choices.count() == 3 and dp.choices.selected == 0, "three choices, first selected")
	dp.choices.move(1)
	ok(dp.choices.selected == 2, "move skips the disabled choice")
	dp.press()
	ok(got.picked == 2, "press picks the selected choice")
	dp.choices.pick(1)
	ok(got.picked == 2, "a disabled choice is not picked")
	var ev := InputEventKey.new(); ev.keycode = KEY_1; ev.pressed = true
	ok(dp.choices.handle(ev) and got.picked == 0, "number key picks")
	dp.clear_choices()
	dp.slide_out()
	await _wait(0.5)
	ok(got.closed == 1 and not dp.visible, "slid out and closed")
	# ---- tabs ----
	var tabs := UITabs.new()
	tabs.tabs = ["A", "B", "C"]
	host.add_child(tabs)
	var changed := [-1]
	tabs.tab_changed.connect(func(i): changed[0] = i)
	tabs.step(-1)
	ok(tabs.selected == 2 and changed[0] == 2, "tabs wrap backwards")
	tabs.step(1)
	ok(tabs.selected == 0, "tabs wrap forwards")
	# ---- toaster ----
	var t := UIToaster.new()
	host.add_child(t)
	t.push("start", "New quest", "One", "", 0.1)
	t.push("complete", "Done", "Two", "", 0.1)
	ok(t.showing() and t.queue.size() == 2, "two toasts queued")
	await _wait(1.8)
	ok(not t.showing(), "the queue drains")
	# ---- touch targets ----
	ok(UITheme.touch_min(host) >= 56.0, "touch target at least 56 units")
	ok(UITheme.touch_rect(host, Rect2(0, 0, 20, 20)).size.x >= 56.0, "touch rect grows")
	# ---- glyphs ----
	ok(UITheme.glyph_label("use", "pad") == "A" and UITheme.glyph_label("use", "keys") == "E", "glyph labels")
	print("ui_test: %d checks, %d failures" % [checks, fails])
	print("UI TEST GREEN" if fails == 0 else "UI TEST RED")
	get_tree().quit(0 if fails == 0 else 1)
