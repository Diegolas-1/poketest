extends CanvasLayer
# The settings window, in the UI design system's look (ui/ui_theme.gd,
# ui/README.md): a cog icon button at the top left opens a layered dark
# panel (it slides in from the left) with six tabs (Display, World, Controls,
# Time, Audio, Updates) of stepped rows: the name, a hint, ‹ value › and a
# row of ticks for where the value sits among its steps (a changed value in
# yellow). The game pauses while it is open. Works by touch, mouse, keyboard
# and gamepad: up / down picks a row, left / right (or A) steps it, L / R
# (Q / E) switch tabs, B or Start closes.

const TABS := ["Display", "World", "Controls", "Time", "Audio", "Updates"]
const COG := Rect2(20, 16, 60, 56)
const PANEL_W := 840.0

var cog: UIIconButton
var root: Control
var dim: ColorRect
var panel: Control
var list: VBoxContainer
var scroll: ScrollContainer
var tabs: UITabs
var tab_btns: Array = []     # (kept for callers)
var tab := "Display"
var rows: Array = []        # [row control, key, values, value label, ticks]
var was_paused := false
var cog_rect := COG   # moved under the Dynamic Island by island.gd (place_cog)
var _left := 16.0

func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	cog = UIIconButton.new()
	cog.icon_id = "cog"
	cog.position = COG.position
	cog.size = COG.size
	cog.tooltip_text = "Settings"
	cog.glyph = "menu"
	cog.pressed.connect(func(): open() if not root.visible else close())
	add_child(cog)
	_build()

func blocks(pos: Vector2) -> bool:
	return root.visible or cog.visible and UITheme.touch_rect(cog, Rect2(cog_rect.position, cog_rect.size)).grow(8).has_point(pos)

# island.gd: the cog as one of the island's black satellites (r), or back at
# the top left (r empty); left = where the panel starts (clear of the island)
func place_cog(r: Rect2, left := 16.0) -> void:
	cog_rect = r if r.size != Vector2.ZERO else COG
	cog.position = cog_rect.position
	cog.size = cog_rect.size
	cog.pill = r.size != Vector2.ZERO
	_left = left
	panel.offset_left = left
	panel.offset_right = left + PANEL_W
	cog.queue_redraw()

# ---------- open / close ----------
func open(pad := false) -> void:
	if root.visible: return
	was_paused = get_tree().paused
	get_tree().paused = true
	root.visible = true
	Sfx.ui("ui_menu_open")
	_fill()
	if pad: _focus_first()
	# slide in from the left, the scrim fades up
	panel.offset_left = _left - 60.0
	panel.offset_right = _left - 60.0 + PANEL_W
	panel.modulate.a = 0.0
	dim.modulate.a = 0.0
	var tw := panel.create_tween().set_parallel(true)
	tw.tween_property(panel, "offset_left", _left, UITheme.BASE).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tw.tween_property(panel, "offset_right", _left + PANEL_W, UITheme.BASE).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tw.tween_property(panel, "modulate:a", 1.0, UITheme.FAST)
	tw.tween_property(dim, "modulate:a", 1.0, UITheme.BASE)

func close() -> void:
	if not root.visible: return
	root.visible = false
	Sfx.ui("ui_menu_close")
	get_tree().paused = was_paused
	var f := root.get_viewport().gui_get_focus_owner()
	if f: f.release_focus()

func _input(e: InputEvent) -> void:
	var pad := e is InputEventJoypadButton or e is InputEventJoypadMotion or e is InputEventKey
	if e.is_action_pressed("menu"):
		if root.visible: close()
		else: open(pad)
		get_viewport().set_input_as_handled()
		return
	if not root.visible: return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		close(); get_viewport().set_input_as_handled(); return
	var lr := 0
	if e is InputEventJoypadButton and e.pressed and e.button_index in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		lr = 1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1
	elif e is InputEventKey and e.pressed and not e.echo and e.physical_keycode in [KEY_Q, KEY_E]:
		lr = 1 if e.physical_keycode == KEY_E else -1
	if lr != 0:
		var i := (TABS.find(tab) + lr + TABS.size()) % TABS.size()
		_set_tab(TABS[i], true)
		get_viewport().set_input_as_handled()
		return
	# a pad or key press with nothing focused picks the first row
	if pad and e.is_pressed() and (e.is_action("ui_up") or e.is_action("ui_down")) and root.get_viewport().gui_get_focus_owner() == null:
		_focus_first(); get_viewport().set_input_as_handled()

# ---------- building ----------
func _build() -> void:
	root = Control.new()
	root.theme = UITheme.theme()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	dim = UITheme.scrim()
	dim.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed: close())
	root.add_child(dim)
	panel = Control.new()
	panel.anchor_top = 0.0; panel.anchor_bottom = 1.0
	panel.offset_left = 16; panel.offset_top = 14; panel.offset_bottom = -14
	panel.offset_right = 16 + PANEL_W
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.draw.connect(_draw_panel)
	panel.resized.connect(panel.queue_redraw)
	root.add_child(panel)
	var m := MarginContainer.new()
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	for k in [["margin_left", 30], ["margin_right", 22], ["margin_top", 12], ["margin_bottom", 16]]: m.add_theme_constant_override(k[0], k[1])
	panel.add_child(m)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	m.add_child(col)
	# header: title, close
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	col.add_child(head)
	var title := UITheme.label("SETTINGS", "display", UITheme.fs("title"), UITheme.TEXT)
	head.add_child(title)
	var chev := Control.new()
	chev.custom_minimum_size = Vector2(70, 50)
	chev.draw.connect(func(): UITheme.chevrons(chev, Vector2(10, 27), 22.0, UITheme.RED, 3))
	head.add_child(chev)
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(sp)
	var x := UIButton.new()
	x.icon_id = "close"
	x.glyph = "back"
	x.variant = "secondary"
	x.custom_minimum_size = Vector2(64, 50)
	x.focus_mode = Control.FOCUS_NONE
	x.pressed.connect(close)
	head.add_child(x)
	tabs = UITabs.new()
	tabs.tabs = TABS
	tabs.font_size = 19
	tabs.custom_minimum_size = Vector2(0, 50)
	tabs.tab_changed.connect(func(i): _set_tab(TABS[i], false))
	col.add_child(tabs)
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	col.add_child(scroll)
	list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 4)
	scroll.add_child(list)
	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 14)
	col.add_child(foot)
	var reset := UIButton.new()
	reset.name = "Reset"
	reset.variant = "secondary"
	reset.custom_minimum_size = Vector2(0, 54)
	reset.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset.focus_mode = Control.FOCUS_NONE
	reset.font_size = 21
	reset.pressed.connect(func(): Settings.reset_to_preset(); _fill())
	foot.add_child(reset)
	var done := UIButton.new()
	done.text = "Done"
	done.variant = "primary"
	done.glyph = "back"
	done.custom_minimum_size = Vector2(0, 54)
	done.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	done.focus_mode = Control.FOCUS_NONE
	done.font_size = 21
	done.pressed.connect(close)
	foot.add_child(done)
	Settings.changed.connect(func(_k, _v): if root.visible: _refresh_values())

func _set_tab(t: String, pad: bool) -> void:
	if t != tab: Sfx.ui("ui_tab")
	tab = t
	_fill()
	if pad: _focus_first()

func _fill() -> void:
	for c in list.get_children(): c.queue_free()
	rows.clear()
	tabs.selected = TABS.find(tab)
	tabs._kick()
	for r in Settings.ROWS[tab]:
		_row(r[0], r[1], r[2], r[3])
	if tab == "Controls": _legend()
	if tab == "Updates": _updates()
	if tab == "Audio": _audio_credits()
	_refresh_values()
	scroll.scroll_vertical = 0

var _row_normal: StyleBoxFlat
var _row_focus: StyleBoxFlat
func _row_styles() -> void:
	if _row_normal != null: return
	_row_normal = UITheme.sb(Color(1, 1, 1, 0.035), 0.0, 0.0, Color.TRANSPARENT, Vector4(16, 4, 8, 4))
	_row_focus = UITheme.sb(Color(1, 1, 1, 0.12), 0.0, 0.0, Color.TRANSPARENT, Vector4(16, 4, 8, 4))
	_row_focus.border_color = UITheme.YELLOW
	_row_focus.border_width_left = 6

func _row(key: String, label: String, values: Array, hint: String) -> void:
	_row_styles()
	var row := PanelContainer.new()
	row.focus_mode = Control.FOCUS_ALL
	row.mouse_filter = Control.MOUSE_FILTER_PASS
	row.custom_minimum_size = Vector2(0, 64)
	row.add_theme_stylebox_override("panel", _row_normal)
	row.focus_entered.connect(func():
		row.add_theme_stylebox_override("panel", _row_focus)
		Sfx.ui("ui_cursor"))
	row.focus_exited.connect(func(): row.add_theme_stylebox_override("panel", _row_normal))
	var h := HBoxContainer.new()
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_theme_constant_override("separation", 8)
	row.add_child(h)
	var lv := VBoxContainer.new()
	lv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lv.alignment = BoxContainer.ALIGNMENT_CENTER
	lv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lv.add_theme_constant_override("separation", -3)
	var ll := UITheme.label(label.to_upper(), "label", 22, UITheme.TEXT)
	ll.clip_text = true
	lv.add_child(ll)
	if hint != "":
		var hl := UITheme.label(hint, "body", 16, UITheme.TEXT_DIM)
		hl.clip_text = true
		lv.add_child(hl)
	h.add_child(lv)
	var lt := _arrow(-1)
	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", 3)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var val := UITheme.label("", "label_semi", 21, UITheme.TEXT)
	val.custom_minimum_size = Vector2(200, 0)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	val.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(val)
	var ticks := Control.new()
	ticks.custom_minimum_size = Vector2(200, 6)
	ticks.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ticks.set_meta("i", 0)
	ticks.draw.connect(_draw_ticks.bind(ticks, values.size()))
	vb.add_child(ticks)
	var rt := _arrow(1)
	lt.pressed.connect(func(): _step(key, values, -1))
	rt.pressed.connect(func(): _step(key, values, 1))
	h.add_child(lt); h.add_child(vb); h.add_child(rt)
	row.gui_input.connect(func(e: InputEvent):
		var d := 0
		if e.is_action_pressed("ui_left", true): d = -1
		elif e.is_action_pressed("ui_right", true) or e.is_action_pressed("ui_accept"): d = 1
		if d != 0:
			_step(key, values, d)
			row.accept_event())
	list.add_child(row)
	rows.append([row, key, values, val, ticks])

# where the value sits among its steps: a row of small skewed ticks (the
# current one red; a long list shows as a bar)
func _draw_ticks(c: Control, n: int) -> void:
	var i: int = c.get_meta("i", 0)
	var w := c.size.x
	if n > 12:
		UITheme.bar(c, Rect2(10, 1, w - 20, 4), float(i) / float(maxi(1, n - 1)), UITheme.RED, 1.0, 0, Color(1, 1, 1, 0.14))
		return
	var gap := 4.0
	var tw := minf(26.0, (w - 20.0 - gap * (n - 1)) / n)
	var x0 := (w - (tw * n + gap * (n - 1))) * 0.5
	for k in n:
		UITheme.para(c, Rect2(x0 + k * (tw + gap), 1, tw, 4), UITheme.RED if k == i else Color(1, 1, 1, 0.18), 0.5)

# a value changes: a switch clicks on or off, anything else ticks (after the
# change, so turning UI sounds back on is heard and turning them off is not)
func _step(key: String, values: Array, d: int) -> void:
	Settings.step(key, values, d)
	var v = Settings.get_value(key)
	if values.size() == 2 and values.has(0) and values.has(1): Sfx.ui("ui_toggle_on" if int(v) == 1 else "ui_toggle_off")
	else: Sfx.ui("ui_slider_tick")

# the Controls tab: what each button does, with the device's glyphs
func _legend() -> void:
	var pads := Input.get_connected_joypads()
	var names := []
	for id in pads: names.append(Input.get_joy_name(id))
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 14)
	m.add_theme_constant_override("margin_left", 16)
	m.add_child(box)
	list.add_child(m)
	box.add_child(UITheme.label("CONTROLLER", "heading", 22, UITheme.YELLOW))
	var cl := UITheme.label(", ".join(names) if names.size() > 0 else "None connected (pair it in Bluetooth settings)", "body", 17, UITheme.TEXT_DIM)
	cl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(cl)
	var grid := Control.new()
	var items := [["pad", "use", "Talk, confirm"], ["pad", "back", "Back, cancel"], ["pad", "jump", "Jump (X or Y)"],
		["pad", "run", "Run (hold R / ZR)"], ["pad", "recenter", "Camera behind you (L / ZL)"], ["pad", "menu", "This menu (Start / +)"],
		["keys", "use", "Talk"], ["keys", "jump", "Jump"], ["keys", "run", "Run (hold)"],
		["keys", "recenter", "Recenter camera"], ["keys", "menu", "This menu"], ["keys", "quests", "Quest log"]]
	grid.custom_minimum_size = Vector2(0, 6 * 40 + 40)
	grid.draw.connect(func():
		for i in items.size():
			var it: Array = items[i]
			var colx := 0.0 if it[0] == "pad" else grid.size.x * 0.5
			var y := 30.0 + (i % 6) * 40.0
			if i % 6 == 0: UITheme.text(grid, Vector2(colx, 12), "GAMEPAD" if it[0] == "pad" else "KEYBOARD", "label", 16, UITheme.TEXT_DIM)
			var gw := UITheme.glyph(grid, Vector2(colx + 30.0, y + 14.0), it[1], 28.0, 1.0, it[0])
			UITheme.text_mid(grid, Vector2(colx + 30.0 + maxf(gw, 28.0) * 0.5 + 14.0, y + 14.0), it[2], "body", 18, UITheme.TEXT))
	box.add_child(grid)
	var kl := UITheme.label("Keyboard: WASD move, arrows camera, Shift run, Space jump, E talk, C recenter, M menu, J quest log", "body", 16, UITheme.TEXT_DIM)
	kl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(kl)

# who made the sound effects (all CC0: credit is a courtesy), from the catalog
func _audio_credits() -> void:
	var path := "res://audio/sfx/catalog.json"
	if not FileAccess.file_exists(path): return
	var cat = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(cat) != TYPE_DICTIONARY: return
	var who := []
	for s in cat.get("sources", []):
		var a := String(s.get("author", ""))
		if a != "" and not a.begins_with("Kenney") and not who.has(a): who.append(a)
	var t := UITheme.label("Sound effects: original sounds made for this game, Kenney's audio packs and recordings shared on OpenGameArt.org by %s. All CC0 (public domain)." % ", ".join(who), "body", 15, UITheme.TEXT_DIM)
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 12)
	m.add_theme_constant_override("margin_left", 16)
	m.add_theme_constant_override("margin_right", 8)
	m.add_child(t)
	list.add_child(m)

# the Updates tab: version in use, the updater's status, Check for updates
# (updater.gd at /root/Updater; absent in a dev run from the project folder)
func _updates() -> void:
	var up := get_node_or_null("/root/Updater")
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 12)
	m.add_theme_constant_override("margin_left", 16)
	m.add_child(box)
	list.add_child(m)
	var ver := UITheme.label("Version: %s" % (up.version_text() if up else "dev build (no updates)"), "label", 22, UITheme.TEXT)
	box.add_child(ver)
	var st := UITheme.label(up.status if up else "", "body", 17, UITheme.TEXT_DIM)
	st.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(st)
	var b := UIButton.new()
	b.text = "Check for updates"
	b.icon_id = "update"
	b.variant = "secondary"
	b.custom_minimum_size = Vector2(320, 54)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.disabled = up == null
	b.pressed.connect(func(): if up: up.check(true))
	box.add_child(b)
	if up:
		var on_status := func(t):
			st.text = t
			ver.text = "Version: %s" % up.version_text()
		up.status_changed.connect(on_status)
		box.tree_exiting.connect(func(): up.status_changed.disconnect(on_status))
		var notes = up.boot.applied.get("notes", []) if up.boot else []
		if notes is Array and notes.size() > 0:
			var nl := UITheme.label("What's new:\n" + "\n".join(notes.slice(0, 6).map(func(n): return "· " + str(n))), "body", 16, UITheme.TEXT_DIM)
			nl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			box.add_child(nl)

func _refresh_values() -> void:
	for r in rows:
		if not is_instance_valid(r[3]): continue
		var key: String = r[1]
		var v = Settings.get_value(key)
		r[3].text = Settings.fmt(key, v).to_upper()
		r[3].add_theme_color_override("font_color", UITheme.YELLOW if Settings.is_changed(key) else UITheme.TEXT)
		var vals: Array = r[2]
		var idx := vals.find(v)
		if idx == -1 and typeof(v) in [TYPE_INT, TYPE_FLOAT]:
			idx = 0
			for k in vals.size():
				if absf(float(vals[k]) - float(v)) < absf(float(vals[idx]) - float(v)): idx = k
		(r[4] as Control).set_meta("i", maxi(0, idx))
		(r[4] as Control).queue_redraw()
	var reset := panel.find_child("Reset", true, false)
	if reset: reset.text = "Reset to %s" % Settings.fmt("preset", Settings.preset)

func _focus_first() -> void:
	if rows.size() > 0: (rows[0][0] as Control).grab_focus.call_deferred()

# ---------- looks ----------
func _arrow(d: int) -> UIButton:
	var b := UIButton.new()
	b.text = "‹" if d < 0 else "›"
	b.font_size = 30
	b.variant = "secondary"
	b.custom_minimum_size = Vector2(56, 50)
	b.focus_mode = Control.FOCUS_NONE
	return b

func _draw_panel() -> void:
	var r := Rect2(Vector2.ZERO, panel.size)
	var pts := UITheme.plate(panel, r, 1.0, 0.0, Color(UITheme.PLATE, 0.94), 28.0)
	UITheme.outline(panel, pts, UITheme.PLATE_LINE, 1.0)
	UITheme.accent_bar(panel, r, UITheme.RED, 1.0, 0.0, 6.0)
	# a second, offset plate behind the first: the layered look
	UIDialogPanel._ball_mark(panel, Vector2(r.end.x - 90.0, r.end.y - 110.0), 150.0, Color(1, 1, 1, 0.025))
