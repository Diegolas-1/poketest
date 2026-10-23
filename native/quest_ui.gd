class_name QuestUI
extends CanvasLayer
# The quest log and its toasts (created by Quests.setup; set `quests` first).
# A scroll button at the top right (inside the iPhone safe area) opens a cream
# panel in the dialog box's style with three tabs: Active (each quest's
# current step, progress, and what Ash is carrying), Done, and Rumors (the
# Cinnabar gossip heard so far). The game pauses while it's open. Toasts
# ("New quest", "Quest complete", "Received", "Rumor heard") slide in at the
# top. Touch, mouse, keyboard (J / Tab to toggle, Esc to close) and gamepad.
#
#   blocks(pos)  true when a touch at pos belongs to the button or the open log
#   open()  close()  toggle()  toast(kind, text)
#   safe_override: a Rect2 to pretend a safe area (screenshots, tests)

const INK := Color("23284f")
const RED := Color("e8463c")
const CREAM := Color("fffdf6")
const CREAM2 := Color("f2e9d6")
const MUTED := Color(0.137, 0.157, 0.31, 0.62)
const BTN := Vector2(56, 56)
const KIND_LABEL := {"start": "NEW QUEST", "complete": "QUEST COMPLETE", "step": "QUEST UPDATED",
	"progress": "PROGRESS", "item": "RECEIVED", "rumor": "RUMOR HEARD"}

var quests: Node = null
var safe_override := Rect2()
var unread := false
var tab := "active"
var was_paused := false

var font: FontVariation
var font_bold: FontVariation
var btn: Button
var root: Control
var frame: Control
var title_lbl: Label
var close_btn: Button
var tab_btns := {}
var scroll: ScrollContainer
var list: VBoxContainer
var toaster: Control
var _toasts: Array = []      # [kind, text]
var _toast_t := 0.0
var _last_size := Vector2.ZERO

func _ready() -> void:
	layer = 90
	process_mode = Node.PROCESS_MODE_ALWAYS
	var ff: FontFile = load("res://fonts/PixelifySans.woff2")
	font = FontVariation.new(); font.base_font = ff; font.variation_opentype = {"wght": 600}
	font_bold = FontVariation.new(); font_bold.base_font = ff; font_bold.variation_opentype = {"wght": 700}
	_action()
	_build()
	if quests != null:
		if quests.has_signal("quest_event"): quests.quest_event.connect(_on_event)
		if quests.has_signal("quest_changed"): quests.quest_changed.connect(_on_changed)
	_layout()

func _action() -> void:
	if InputMap.has_action("quests"): return
	InputMap.add_action("quests")
	for kc in [KEY_J, KEY_TAB]:
		var ev := InputEventKey.new(); ev.physical_keycode = kc
		InputMap.action_add_event("quests", ev)
	var jb := InputEventJoypadButton.new(); jb.button_index = JOY_BUTTON_MISC1
	InputMap.action_add_event("quests", jb)

# ---------- safe area ----------
func safe_rect() -> Rect2:
	var vs := root.get_viewport_rect().size if root and root.is_inside_tree() else Vector2(1280, 720)
	var full := Rect2(Vector2.ZERO, vs)
	if safe_override.size != Vector2.ZERO: return safe_override
	if not OS.has_feature("mobile"): return full
	var sa := DisplayServer.get_display_safe_area()
	var ws := DisplayServer.window_get_size()
	if sa.size.x <= 0 or ws.x <= 0: return full
	var k := vs / Vector2(ws)
	return Rect2(Vector2(sa.position) * k, Vector2(sa.size) * k).intersection(full)

func blocks(pos: Vector2) -> bool:
	if root != null and root.visible: return true
	return btn != null and btn.visible and Rect2(btn.position - Vector2(8, 8), btn.size + Vector2(16, 16)).has_point(pos)

# ---------- building ----------
func _sb(fill: Color, r: int, border := 0.0, bc := INK) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = fill
	s.set_corner_radius_all(r)
	s.corner_detail = 6
	s.anti_aliasing = true
	if border > 0.0:
		s.border_color = bc
		s.set_border_width_all(int(border))
	return s

func _build() -> void:
	var theme := Theme.new()
	theme.default_font = font
	theme.default_font_size = 18
	# the button
	btn = Button.new()
	btn.size = BTN
	btn.focus_mode = Control.FOCUS_NONE
	btn.tooltip_text = "Quest log"
	for st in ["normal", "hover", "pressed", "focus"]:
		btn.add_theme_stylebox_override(st, _sb(Color(0.08, 0.12, 0.16, 0.62 if st == "pressed" else 0.45), 14))
	btn.draw.connect(_draw_btn)
	btn.pressed.connect(toggle)
	add_child(btn)
	# the log
	root = Control.new()
	root.theme = theme
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	var dim := ColorRect.new()
	dim.color = Color(0.03, 0.04, 0.1, 0.45)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.gui_input.connect(func(e: InputEvent):
		if (e is InputEventMouseButton or e is InputEventScreenTouch) and e.pressed: close())
	root.add_child(dim)
	frame = Control.new()
	frame.draw.connect(_draw_frame)
	frame.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(frame)
	title_lbl = Label.new()
	title_lbl.text = "Quest Log"
	title_lbl.add_theme_font_override("font", font_bold)
	title_lbl.add_theme_font_size_override("font_size", 28)
	title_lbl.add_theme_color_override("font_color", INK)
	frame.add_child(title_lbl)
	close_btn = Button.new()
	close_btn.text = "X"
	close_btn.focus_mode = Control.FOCUS_ALL
	close_btn.add_theme_font_override("font", font_bold)
	close_btn.add_theme_font_size_override("font_size", 22)
	for st in ["normal", "hover", "pressed", "focus"]:
		close_btn.add_theme_stylebox_override(st, _sb(RED if st != "pressed" else RED.darkened(0.2), 24, 2.0 if st == "focus" else 0.0))
		close_btn.add_theme_color_override("font_color" if st == "normal" else "font_%s_color" % st, Color.WHITE)
	close_btn.pressed.connect(close)
	frame.add_child(close_btn)
	for t in [["active", "Active"], ["done", "Done"], ["rumors", "Rumors"]]:
		var b := Button.new()
		b.text = t[1]
		b.toggle_mode = true
		b.focus_mode = Control.FOCUS_ALL
		b.add_theme_font_size_override("font_size", 19)
		b.add_theme_stylebox_override("normal", _sb(Color(1, 1, 1, 0.0), 12, 2.0, Color(INK, 0.35)))
		b.add_theme_stylebox_override("hover", _sb(Color(INK, 0.06), 12, 2.0, Color(INK, 0.5)))
		b.add_theme_stylebox_override("pressed", _sb(INK, 12))
		b.add_theme_stylebox_override("hover_pressed", _sb(INK, 12))
		b.add_theme_stylebox_override("focus", _sb(Color(0, 0, 0, 0), 12, 3.0, RED))
		b.add_theme_color_override("font_color", INK)
		b.add_theme_color_override("font_hover_color", INK)
		b.add_theme_color_override("font_pressed_color", CREAM)
		b.add_theme_color_override("font_hover_pressed_color", CREAM)
		b.add_theme_color_override("font_focus_color", INK)
		var key: String = t[0]
		b.pressed.connect(func(): _set_tab(key))
		frame.add_child(b)
		tab_btns[key] = b
	scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.scroll_deadzone = 8
	frame.add_child(scroll)
	list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 12)
	scroll.add_child(list)
	toaster = Control.new()
	toaster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toaster.set_anchors_preset(Control.PRESET_FULL_RECT)
	toaster.draw.connect(_draw_toast)
	add_child(toaster)

func _layout() -> void:
	var vs := root.get_viewport_rect().size
	_last_size = vs
	var sr := safe_rect()
	btn.position = Vector2(sr.end.x - 16.0 - BTN.x, sr.position.y + 16.0)
	var w := minf(660.0, sr.size.x - 32.0)
	var h := minf(sr.size.y - 32.0, 720.0)
	frame.position = Vector2(sr.position.x + (sr.size.x - w) * 0.5, sr.position.y + (sr.size.y - h) * 0.5)
	frame.size = Vector2(w, h)
	var pad := 24.0
	title_lbl.position = Vector2(pad, 20)
	close_btn.size = Vector2(48, 48)
	close_btn.position = Vector2(w - pad - 48 + 6, 14)
	var tw := (w - pad * 2 - 16) / 3.0
	var i := 0
	for k in ["active", "done", "rumors"]:
		var b: Button = tab_btns[k]
		b.position = Vector2(pad + i * (tw + 8), 72)
		b.size = Vector2(tw, 48)
		i += 1
	scroll.position = Vector2(pad, 134)
	scroll.size = Vector2(w - pad * 2 + 8, h - 134 - 22)
	list.custom_minimum_size.x = scroll.size.x - 14
	frame.queue_redraw()
	btn.queue_redraw()

# ---------- open / close ----------
func toggle() -> void:
	if root.visible: close()
	else: open()

func open() -> void:
	if root.visible: return
	was_paused = get_tree().paused
	get_tree().paused = true
	unread = false
	btn.queue_redraw()
	root.visible = true
	Sfx.ui("ui_menu_open")
	_layout()
	_fill()

func close() -> void:
	if not root.visible: return
	root.visible = false
	Sfx.ui("ui_menu_close")
	get_tree().paused = was_paused
	var f := root.get_viewport().gui_get_focus_owner()
	if f: f.release_focus()

func _input(e: InputEvent) -> void:
	if e.is_action_pressed("quests"):
		toggle(); get_viewport().set_input_as_handled(); return
	if not root.visible: return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		close(); get_viewport().set_input_as_handled(); return
	if e is InputEventJoypadButton and e.pressed and e.button_index in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		var keys := ["active", "done", "rumors"]
		var i := (keys.find(tab) + (1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1) + 3) % 3
		_set_tab(keys[i])
		get_viewport().set_input_as_handled()
		return
	var pad := e is InputEventJoypadButton or e is InputEventJoypadMotion or e is InputEventKey
	if pad and e.is_pressed() and (e.is_action("ui_up") or e.is_action("ui_down")):
		var step := 60.0 * (1.0 if e.is_action("ui_down") else -1.0)
		scroll.scroll_vertical = int(scroll.scroll_vertical + step)
		get_viewport().set_input_as_handled()

func _set_tab(k: String) -> void:
	if k != tab: Sfx.ui("ui_tab")
	tab = k
	_fill()

# ---------- contents ----------
func _label(text: String, size: int, col: Color, bold := false) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	if bold: l.add_theme_font_override("font", font_bold)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

func _card(accent: Color) -> VBoxContainer:
	# a soft card with an accent stripe down its left edge
	var pc := PanelContainer.new()
	var s := _sb(Color(CREAM2, 0.75), 12)
	s.border_color = accent
	s.border_width_left = 7
	s.content_margin_left = 18; s.content_margin_right = 14; s.content_margin_top = 10; s.content_margin_bottom = 12
	pc.add_theme_stylebox_override("panel", s)
	pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_child(pc)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	pc.add_child(v)
	return v

func _fill() -> void:
	for k in tab_btns: tab_btns[k].button_pressed = (k == tab)
	for c in list.get_children(): c.queue_free()
	var data: Dictionary = quests.log_entries() if quests != null and quests.has_method("log_entries") else {"active": [], "done": [], "rumors": [], "items": []}
	tab_btns.active.text = "Active (%d)" % data.active.size()
	tab_btns.done.text = "Done (%d)" % data.done.size()
	tab_btns.rumors.text = "Rumors (%d)" % data.rumors.size()
	if tab == "active":
		if data.active.is_empty():
			list.add_child(_label("No quests right now. Talk to the townspeople. Folks with a ! over their heads have something to ask.", 18, MUTED))
		for e in data.active:
			var v := _card(RED)
			v.add_child(_label(e.title, 22, INK, true))
			v.add_child(_label("from " + e.giver + "   step %d of %d" % [e.step + 1, e.steps], 15, MUTED))
			v.add_child(_label("> " + e.hint, 19, INK))
			if e.progress != "": v.add_child(_label(e.progress, 16, RED))
			v.add_child(_label(e.summary, 15, MUTED))
		if not data.items.is_empty():
			list.add_child(_label("Carrying", 20, INK, true))
			for it in data.items:
				var v2 := _card(Color("e0a23a"))
				v2.add_child(_label(it.name + ("  x%d" % it.count if it.count > 1 else ""), 19, INK, true))
				if it.desc != "": v2.add_child(_label(it.desc, 15, MUTED))
	elif tab == "done":
		if data.done.is_empty():
			list.add_child(_label("Nothing finished yet. Pallet Town is full of people who could use a hand.", 18, MUTED))
		for e in data.done:
			var v := _card(Color("4c9a5b"))
			v.add_child(_label(e.title + "   - complete", 21, INK, true))
			v.add_child(_label("for " + e.giver, 15, MUTED))
			v.add_child(_label(e.summary, 16, MUTED))
	else:
		if data.rumors.is_empty():
			list.add_child(_label("No rumors yet. Listen to the old sailors... they say things about Cinnabar Island.", 18, MUTED))
		for e in data.rumors:
			var v := _card(Color("8a5cc2"))
			v.add_child(_label(e.title, 20, INK, true))
			v.add_child(_label(e.summary, 16, INK))
	scroll.scroll_vertical = 0

# ---------- events ----------
func _on_event(kind: String, _qid: String, text: String) -> void:
	toast(kind, text)
	Sfx.ui("ui_item_get" if kind in ["complete", "item"] else "ui_notify")
	if kind in ["start", "complete", "step", "rumor", "item"]: unread = true
	btn.queue_redraw()

func _on_changed() -> void:
	if root.visible: _fill()

func toast(kind: String, text: String) -> void:
	# a progress toast replaces a queued one for the same quest
	_toasts.append([kind, text])
	if _toasts.size() > 5: _toasts.pop_front()

const TOAST_IN := 0.28
const TOAST_HOLD := 2.6

func _process(dt: float) -> void:
	if root.get_viewport_rect().size != _last_size: _layout()
	toaster.visible = not root.visible   # toasts wait while the log is open
	if _toasts.is_empty() or root.visible: return
	_toast_t += dt
	if _toast_t > TOAST_IN * 2.0 + TOAST_HOLD:
		_toasts.pop_front()
		_toast_t = 0.0
	toaster.queue_redraw()

# ---------- drawing ----------
func _draw_btn() -> void:
	# a little scroll with writing on it
	var c := BTN * 0.5
	var w := 26.0
	var h := 30.0
	var r := Rect2(c.x - w * 0.5, c.y - h * 0.5, w, h)
	btn.draw_style_box(_sb(CREAM, 4, 2.0, INK), r)
	btn.draw_rect(Rect2(r.position.x - 3, r.position.y - 3, w + 6, 6), CREAM2)
	btn.draw_rect(Rect2(r.position.x - 3, r.position.y - 3, w + 6, 6), INK, false, 2.0)
	btn.draw_rect(Rect2(r.position.x - 3, r.end.y - 3, w + 6, 6), CREAM2)
	btn.draw_rect(Rect2(r.position.x - 3, r.end.y - 3, w + 6, 6), INK, false, 2.0)
	for k in 3:
		var y := r.position.y + 9 + k * 6
		btn.draw_line(Vector2(r.position.x + 6, y), Vector2(r.end.x - (6 if k < 2 else 11), y), Color(INK, 0.75), 2.0)
	if unread:
		btn.draw_circle(Vector2(BTN.x - 9, 9), 7.0, RED, true, -1.0, true)
		btn.draw_circle(Vector2(BTN.x - 9, 9), 7.0, Color.WHITE, false, 2.0, true)

func _draw_frame() -> void:
	var w := frame.size.x
	var h := frame.size.y
	for k in 3:
		var g := (3 - k) * 3.0
		frame.draw_style_box(_sb(Color(0.04, 0.05, 0.16, 0.1), int(18 + g)), Rect2(-g * 0.5, 5 - g * 0.3, w + g, h + g))
	frame.draw_style_box(_sb(CREAM, 18), Rect2(0, 0, w, h))
	frame.draw_style_box(_sb(Color(0, 0, 0, 0), 15, 3.0, INK), Rect2(4, 4, w - 8, h - 8))
	frame.draw_style_box(_sb(Color(0, 0, 0, 0), 11, 1.5, Color(INK, 0.5)), Rect2(9, 9, w - 18, h - 18))
	frame.draw_line(Vector2(24, 128), Vector2(w - 24, 128), Color(INK, 0.18), 2.0)

func _draw_toast() -> void:
	if _toasts.is_empty(): return
	var kind: String = _toasts[0][0]
	var text: String = _toasts[0][1]
	var t := _toast_t
	var a := clampf(minf(t / TOAST_IN, (TOAST_IN * 2.0 + TOAST_HOLD - t) / TOAST_IN), 0.0, 1.0)
	var e := 1.0 - pow(1.0 - a, 3.0)
	var sr := safe_rect()
	var head: String = KIND_LABEL.get(kind, kind.to_upper())
	var hs := 15
	var ts := 22
	var hw := font_bold.get_string_size(head, HORIZONTAL_ALIGNMENT_LEFT, -1, hs).x
	var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, ts).x
	var w := minf(maxf(hw + 40.0, tw) + 48.0, sr.size.x - 120.0 - BTN.x * 2.0)
	var h := 76.0
	var x := sr.position.x + (sr.size.x - w) * 0.5
	var y := sr.position.y + 14.0 - (1.0 - e) * (h + 30.0)
	var accent: Color = {"complete": Color("4c9a5b"), "rumor": Color("8a5cc2"), "item": Color("d08a1f")}.get(kind, RED)
	toaster.draw_style_box(_sb(Color(0.04, 0.05, 0.16, 0.18 * a), 18), Rect2(x - 2, y + 4, w + 4, h + 2))
	toaster.draw_style_box(_sb(Color(CREAM, 0.97 * a), 16, 3.0, Color(INK, a)), Rect2(x, y, w, h))
	var pill := Rect2(x + 22, y + 11, hw + 22, 22)
	toaster.draw_style_box(_sb(Color(accent, a), 11), pill)
	toaster.draw_string(font_bold, Vector2(pill.position.x + 11, pill.position.y + 16), head, HORIZONTAL_ALIGNMENT_LEFT, -1, hs, Color(1, 1, 1, a))
	toaster.draw_string(font, Vector2(x + 24, y + 62), text, HORIZONTAL_ALIGNMENT_LEFT, w - 48.0, ts, Color(INK, a))
