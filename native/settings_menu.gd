extends CanvasLayer
# The settings window: a cog button at the top left opens a panel with three
# tabs (Display, World, Controls) of stepped rows (‹ value ›), like the web
# build's graphics window. The game pauses while it is open. Works by touch,
# mouse, keyboard and gamepad: up / down picks a row, left / right (or A)
# steps it, L / R switch tabs, B or Start closes.

const BG := Color(0.086, 0.118, 0.172, 0.97)
const ACCENT := Color("e8735a")
const GOLD := Color("ffd27a")
const TABS := ["Display", "World", "Controls", "Time", "Audio", "Updates"]
const COG := Rect2(16, 16, 56, 56)

var cog: Button
var root: Control
var panel: PanelContainer
var list: VBoxContainer
var scroll: ScrollContainer
var tab_btns: Array = []
var tab := "Display"
var rows: Array = []        # [row control, key, values, value label]
var was_paused := false
var cog_rect := COG   # moved under the Dynamic Island by island.gd (place_cog)

func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	cog = Button.new()
	cog.position = COG.position
	cog.size = COG.size
	cog.focus_mode = Control.FOCUS_NONE
	cog.tooltip_text = "Settings"
	_style_btn(cog, Color(0.08, 0.12, 0.16, 0.45), 14)
	cog.draw.connect(_draw_cog)
	cog.pressed.connect(func(): open() if not root.visible else close())
	add_child(cog)
	_build()

func blocks(pos: Vector2) -> bool:
	return root.visible or cog.visible and Rect2(cog_rect.position - Vector2(8, 8), cog_rect.size + Vector2(16, 16)).has_point(pos)

# island.gd: the cog as one of the island's black satellites (r), or back at
# the top left (r empty); left = where the panel starts (clear of the island)
func place_cog(r: Rect2, left := 16.0) -> void:
	cog_rect = r if r.size != Vector2.ZERO else COG
	cog.position = cog_rect.position
	cog.size = cog_rect.size
	if r.size != Vector2.ZERO: _style_btn(cog, Color.BLACK, int(minf(r.size.x, r.size.y) * 0.5))
	else: _style_btn(cog, Color(0.08, 0.12, 0.16, 0.45), 14)
	panel.offset_left = left
	panel.offset_right = left + 790
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
	if e is InputEventJoypadButton and e.pressed and e.button_index in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		var i := (TABS.find(tab) + (1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1) + TABS.size()) % TABS.size()
		_set_tab(TABS[i], true)
		get_viewport().set_input_as_handled()
		return
	# a pad or key press with nothing focused picks the first row
	if pad and e.is_pressed() and (e.is_action("ui_up") or e.is_action("ui_down")) and root.get_viewport().gui_get_focus_owner() == null:
		_focus_first(); get_viewport().set_input_as_handled()

# ---------- building ----------
func _build() -> void:
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.35)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed: close())
	root.add_child(dim)
	panel = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = BG
	sb.set_corner_radius_all(18)
	sb.shadow_color = Color(0, 0, 0, 0.35); sb.shadow_size = 18
	sb.content_margin_left = 18; sb.content_margin_right = 18; sb.content_margin_top = 12; sb.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", sb)
	panel.anchor_top = 0.0; panel.anchor_bottom = 1.0
	panel.offset_left = 16; panel.offset_top = 16; panel.offset_bottom = -16
	panel.offset_right = 16 + 790   # room for six tabs
	root.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)
	# header: title, tabs, close
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	col.add_child(head)
	var title := _text("Settings", 26)
	head.add_child(title)
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(sp)
	for t in TABS:
		var b := Button.new()
		b.text = t
		b.custom_minimum_size = Vector2(92, 46)
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 18)
		b.pressed.connect(_set_tab.bind(t, false))
		head.add_child(b)
		tab_btns.append(b)
	var x := Button.new()
	x.text = "×"
	x.custom_minimum_size = Vector2(46, 46)
	x.focus_mode = Control.FOCUS_NONE
	x.add_theme_font_size_override("font_size", 28)
	_style_btn(x, Color(1, 1, 1, 0.1), 10)
	x.pressed.connect(close)
	head.add_child(x)
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	_style_scrollbar(scroll)
	col.add_child(scroll)
	list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 2)
	scroll.add_child(list)
	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 10)
	col.add_child(foot)
	var reset := Button.new()
	reset.name = "Reset"
	reset.custom_minimum_size = Vector2(0, 50)
	reset.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset.focus_mode = Control.FOCUS_NONE
	reset.add_theme_font_size_override("font_size", 19)
	_style_btn(reset, Color(1, 1, 1, 0.14), 12)
	reset.pressed.connect(func(): Settings.reset_to_preset(); _fill())
	foot.add_child(reset)
	var done := Button.new()
	done.text = "Done"
	done.custom_minimum_size = Vector2(0, 50)
	done.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	done.focus_mode = Control.FOCUS_NONE
	done.add_theme_font_size_override("font_size", 19)
	_style_btn(done, ACCENT, 12)
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
	for i in TABS.size():
		var on: bool = TABS[i] == tab
		_style_btn(tab_btns[i], ACCENT if on else Color(1, 1, 1, 0.1), 10)
	for r in Settings.ROWS[tab]:
		_row(r[0], r[1], r[2], r[3])
	if tab == "Controls": _legend()
	if tab == "Updates": _updates()
	if tab == "Audio": _audio_credits()
	_refresh_values()
	scroll.scroll_vertical = 0

func _row(key: String, label: String, values: Array, hint: String) -> void:
	var row := PanelContainer.new()
	row.focus_mode = Control.FOCUS_ALL
	row.mouse_filter = Control.MOUSE_FILTER_PASS
	row.custom_minimum_size = Vector2(0, 58)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 0.0)
	normal.border_color = Color(1, 1, 1, 0.08)
	normal.border_width_top = 1
	normal.content_margin_left = 8; normal.content_margin_right = 6
	row.add_theme_stylebox_override("panel", normal)
	var focus := normal.duplicate()
	focus.bg_color = Color(1, 1, 1, 0.07)
	focus.border_color = ACCENT
	focus.set_border_width_all(2)
	focus.set_corner_radius_all(10)
	row.focus_entered.connect(func(): row.add_theme_stylebox_override("panel", focus))
	row.focus_exited.connect(func(): row.add_theme_stylebox_override("panel", normal))
	var h := HBoxContainer.new()
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_theme_constant_override("separation", 6)
	row.add_child(h)
	var lv := VBoxContainer.new()
	lv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lv.alignment = BoxContainer.ALIGNMENT_CENTER
	lv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lv.add_theme_constant_override("separation", -2)
	var ll := _text(label, 20)
	ll.clip_text = true
	lv.add_child(ll)
	if hint != "":
		var hl := _text(hint, 14)
		hl.clip_text = true
		hl.modulate.a = 0.55
		lv.add_child(hl)
	h.add_child(lv)
	var lt := _arrow("‹")
	var val := _text("", 19)
	val.custom_minimum_size = Vector2(196, 0)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	val.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var rt := _arrow("›")
	lt.pressed.connect(func(): _step(key, values, -1))
	rt.pressed.connect(func(): _step(key, values, 1))
	h.add_child(lt); h.add_child(val); h.add_child(rt)
	row.gui_input.connect(func(e: InputEvent):
		var d := 0
		if e.is_action_pressed("ui_left", true): d = -1
		elif e.is_action_pressed("ui_right", true) or e.is_action_pressed("ui_accept"): d = 1
		if d != 0:
			_step(key, values, d)
			row.accept_event())
	list.add_child(row)
	rows.append([row, key, values, val])

# a value changes: a switch clicks on or off, anything else ticks (after the
# change, so turning UI sounds back on is heard and turning them off is not)
func _step(key: String, values: Array, d: int) -> void:
	Settings.step(key, values, d)
	var v = Settings.get_value(key)
	if values.size() == 2 and values.has(0) and values.has(1): Sfx.ui("ui_toggle_on" if int(v) == 1 else "ui_toggle_off")
	else: Sfx.ui("ui_slider_tick")

func _legend() -> void:
	var pads := Input.get_connected_joypads()
	var names := []
	for id in pads: names.append(Input.get_joy_name(id))
	var lines := [
		"Controller: %s" % (", ".join(names) if names.size() > 0 else "none connected (pair it in Bluetooth settings)"),
		"Left stick  move (push it all the way to run)",
		"Right stick / C-stick  camera",
		"A  talk, confirm      B  back, cancel",
		"X or Y  jump      R / ZR  run (hold)",
		"L / ZL  camera behind you      Start / +  this menu",
		"Keyboard: WASD move, arrows camera, Shift run, Space jump, E talk, C recenter, M menu",
	]
	var l := _text("\n".join(lines), 16)
	l.modulate.a = 0.8
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 10)
	m.add_theme_constant_override("margin_left", 8)
	m.add_child(l)
	list.add_child(m)

# the Updates tab: version in use, the updater's status, Check for updates
# (updater.gd at /root/Updater; absent in a dev run from the project folder)
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
	var t := _text("Sound effects: original sounds made for this game, Kenney's audio packs and recordings shared on OpenGameArt.org by %s. All CC0 (public domain)." % ", ".join(who), 14)
	t.modulate.a = 0.55
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 12)
	m.add_theme_constant_override("margin_left", 8)
	m.add_theme_constant_override("margin_right", 8)
	m.add_child(t)
	list.add_child(m)

func _updates() -> void:
	var up := get_node_or_null("/root/Updater")
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 10)
	m.add_theme_constant_override("margin_left", 8)
	m.add_child(box)
	list.add_child(m)
	var ver := _text("Version: %s" % (up.version_text() if up else "dev build (no updates)"), 19)
	box.add_child(ver)
	var st := _text(up.status if up else "", 16)
	st.modulate.a = 0.8
	st.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(st)
	var b := Button.new()
	b.text = "Check for updates"
	b.custom_minimum_size = Vector2(0, 50)
	b.add_theme_font_size_override("font_size", 19)
	_style_btn(b, Color(1, 1, 1, 0.14), 12)
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
			var nl := _text("What's new:\n" + "\n".join(notes.slice(0, 6).map(func(n): return "· " + str(n))), 15)
			nl.modulate.a = 0.7
			nl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			box.add_child(nl)

func _refresh_values() -> void:
	for r in rows:
		if not is_instance_valid(r[3]): continue
		var key: String = r[1]
		r[3].text = Settings.fmt(key, Settings.get_value(key))
		r[3].add_theme_color_override("font_color", GOLD if Settings.is_changed(key) else Color.WHITE)
	var reset := panel.find_child("Reset", true, false)
	if reset: reset.text = "Reset to %s" % Settings.fmt("preset", Settings.preset)

func _focus_first() -> void:
	if rows.size() > 0: (rows[0][0] as Control).grab_focus.call_deferred()

# ---------- looks ----------
func _text(s: String, sz: int) -> Label:
	var l := Label.new()
	l.text = s
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", Color("f3f4f0"))
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func _arrow(s: String) -> Button:
	var b := Button.new()
	b.text = s
	b.custom_minimum_size = Vector2(54, 46)
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 26)
	_style_btn(b, Color(1, 1, 1, 0.12), 10)
	return b

func _style_btn(b: Button, c: Color, r: int) -> void:
	for st in ["normal", "hover", "pressed", "focus", "disabled"]:
		var s := StyleBoxFlat.new()
		s.bg_color = c
		if st == "pressed": s.bg_color = c.lightened(0.25)
		elif st == "hover": s.bg_color = c.lightened(0.08)
		elif st == "focus": s.draw_center = false
		s.set_corner_radius_all(r)
		b.add_theme_stylebox_override(st, s)
	b.add_theme_color_override("font_color", Color.WHITE)
	b.add_theme_color_override("font_pressed_color", Color.WHITE)
	b.add_theme_color_override("font_hover_color", Color.WHITE)

func _style_scrollbar(s: ScrollContainer) -> void:
	var bar := s.get_v_scroll_bar()
	var g := StyleBoxFlat.new()
	g.bg_color = Color(1, 1, 1, 0.3)
	g.set_corner_radius_all(3)
	g.content_margin_left = 3; g.content_margin_right = 3
	var e := StyleBoxEmpty.new()
	e.content_margin_left = 3; e.content_margin_right = 3
	for st in ["grabber", "grabber_highlight", "grabber_pressed"]: bar.add_theme_stylebox_override(st, g)
	bar.add_theme_stylebox_override("scroll", e)
	bar.add_theme_stylebox_override("scroll_focus", e)

# the cog, drawn (the default font has no ⚙)
func _draw_cog() -> void:
	var c := cog.size * 0.5
	var col := Color(1, 1, 1, 0.95)
	for i in 8:
		var a := i * TAU / 8.0
		var d := Vector2(cos(a), sin(a))
		var p := Vector2(-d.y, d.x)
		cog.draw_colored_polygon(PackedVector2Array([c + d * 12 + p * 5, c + d * 19 + p * 3.6, c + d * 19 - p * 3.6, c + d * 12 - p * 5]), col)
	cog.draw_circle(c, 14.0, col)
	cog.draw_circle(c, 6.0, Color(0.16, 0.2, 0.26))
