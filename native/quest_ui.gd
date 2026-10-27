class_name QuestUI
extends CanvasLayer
# The quest log and its toasts (created by Quests.setup; set `quests` first),
# in the UI design system's look (ui/ui_theme.gd, ui/README.md).
# A log icon button at the top right (inside the iPhone safe area; a red dot
# when there is news) opens a crisp white panel with three tabs: Active (each
# quest's current step, progress, and what Ash is carrying), Done, and Rumors
# (the Cinnabar gossip heard so far). The game pauses while it's open; the
# panel slides in. Toasts ("New quest", "Quest complete", "Received", "Rumor
# heard") slide in at the top (UIToaster.draw_toast). Touch, mouse, keyboard
# (J / Tab to toggle, Esc to close, Q / E or L / R tabs) and gamepad.
#
#   blocks(pos)  true when a touch at pos belongs to the button or the open log
#   open()  close()  toggle()  toast(kind, text)
#   safe_override: a Rect2 to pretend a safe area (screenshots, tests)

const BTN := Vector2(60, 56)
const KIND_LABEL := {"start": "NEW QUEST", "complete": "QUEST COMPLETE", "step": "QUEST UPDATED",
	"progress": "PROGRESS", "item": "RECEIVED", "rumor": "RUMOR HEARD"}
const TAB_KEYS := ["active", "done", "rumors"]

var quests: Node = null
var safe_override := Rect2()
var unread := false:
	set(v):
		unread = v
		if btn: btn.badge = v
var tab := "active"
var was_paused := false

var btn: UIIconButton
var root: Control
var dim: ColorRect
var frame: Control
var title_lbl: Label
var close_btn: UIButton
var tabs: UITabs
var tab_btns := {}           # (kept for callers: key -> index in tabs)
var scroll: ScrollContainer
var list: VBoxContainer
var toaster: Control
var _toasts: Array = []      # [kind, text]
var _toast_t := 0.0
var _last_size := Vector2.ZERO
var btn_rect := Rect2()   # island.gd: the button as a satellite above the Dynamic Island
var _open_t := 9.0

# island.gd puts the button above the island (black pill), or back (empty rect)
func place_btn(r: Rect2) -> void:
	btn_rect = r
	if btn == null: return
	btn.pill = r.size != Vector2.ZERO
	if root: _layout()

func _ready() -> void:
	layer = 90
	process_mode = Node.PROCESS_MODE_ALWAYS
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
	return UITheme.safe_rect(root, safe_override)

func blocks(pos: Vector2) -> bool:
	if root != null and root.visible: return true
	return btn != null and btn.visible and UITheme.touch_rect(btn, Rect2(btn.position, btn.size)).grow(6).has_point(pos)

# ---------- building ----------
func _build() -> void:
	# the button
	btn = UIIconButton.new()
	btn.icon_id = "log"
	btn.size = BTN
	btn.tooltip_text = "Quest log"
	btn.glyph = "quests"
	btn.pressed.connect(toggle)
	add_child(btn)
	# the log
	root = Control.new()
	root.theme = UITheme.theme()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	dim = UITheme.scrim()
	dim.gui_input.connect(func(e: InputEvent):
		if (e is InputEventMouseButton or e is InputEventScreenTouch) and e.pressed: close())
	root.add_child(dim)
	frame = Control.new()
	frame.draw.connect(_draw_frame)
	frame.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(frame)
	title_lbl = UITheme.label("QUEST LOG", "display", UITheme.fs("title"), UITheme.INK)
	frame.add_child(title_lbl)
	close_btn = UIButton.new()
	close_btn.variant = "primary"
	close_btn.icon_id = "close"
	close_btn.glyph = "back"
	close_btn.focus_mode = Control.FOCUS_NONE
	close_btn.pressed.connect(close)
	frame.add_child(close_btn)
	tabs = UITabs.new()
	tabs.light = true
	tabs.tabs = ["Active", "Done", "Rumors"]
	tabs.tab_changed.connect(func(i): _set_tab(TAB_KEYS[i]))
	frame.add_child(tabs)
	for i in TAB_KEYS.size(): tab_btns[TAB_KEYS[i]] = i
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
	btn.size = btn_rect.size if btn_rect.size != Vector2.ZERO else BTN
	btn.position = btn_rect.position if btn_rect.size != Vector2.ZERO else Vector2(sr.end.x - 20.0 - BTN.x, sr.position.y + 16.0)
	var w := minf(700.0, sr.size.x - 32.0)
	var h := minf(sr.size.y - 32.0, 720.0)
	frame.position = Vector2(sr.position.x + (sr.size.x - w) * 0.5, sr.position.y + (sr.size.y - h) * 0.5)
	frame.size = Vector2(w, h)
	var pad := 30.0
	title_lbl.position = Vector2(pad, 14)
	close_btn.size = Vector2(110 if UIInput.device != "touch" else 64, 52)
	close_btn.position = Vector2(w - pad - close_btn.size.x + 4.0, 16)
	tabs.position = Vector2(pad, 80)
	tabs.size = Vector2(w - pad * 2, 50)
	scroll.position = Vector2(pad, 146)
	scroll.size = Vector2(w - pad * 2 + 8, h - 146 - 22)
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
	_open_t = 0.0
	_animate_in()

func close() -> void:
	if not root.visible: return
	root.visible = false
	Sfx.ui("ui_menu_close")
	get_tree().paused = was_paused
	var f := root.get_viewport().gui_get_focus_owner()
	if f: f.release_focus()

# the panel slides in from below with a little lean, the scrim fades in
func _animate_in() -> void:
	var to := frame.position
	frame.position = to + Vector2(0, 40)
	frame.modulate.a = 0.0
	dim.modulate.a = 0.0
	var tw := frame.create_tween().set_parallel(true)
	tw.tween_property(frame, "position", to, UITheme.BASE).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(frame, "modulate:a", 1.0, UITheme.FAST)
	tw.tween_property(dim, "modulate:a", 1.0, UITheme.BASE)

func _input(e: InputEvent) -> void:
	if e.is_action_pressed("quests"):
		toggle(); get_viewport().set_input_as_handled(); return
	if not root.visible: return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		close(); get_viewport().set_input_as_handled(); return
	var lr := 0
	if e is InputEventJoypadButton and e.pressed and e.button_index in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		lr = 1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1
	elif e is InputEventKey and e.pressed and not e.echo and e.physical_keycode in [KEY_Q, KEY_E]:
		lr = 1 if e.physical_keycode == KEY_E else -1
	if lr != 0:
		var i := (TAB_KEYS.find(tab) + lr + 3) % 3
		_set_tab(TAB_KEYS[i])
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
	tabs.selected = TAB_KEYS.find(k)
	tabs._kick()
	_fill()

# ---------- contents ----------
func _label(text: String, size: int, col: Color, bold := false, role := "") -> Label:
	var l := UITheme.label(text, role if role != "" else ("body_bold" if bold else "body"), size, col)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

func _card(accent: Color) -> VBoxContainer:
	# a card: faint ink fill, an accent bar down its left edge, a cut corner
	var pc := PanelContainer.new()
	var s := UITheme.sb(Color(UITheme.INK, 0.045), 0.0, 0.0, Color.TRANSPARENT, Vector4(22, 12, 18, 14))
	s.border_color = accent
	s.border_width_left = 6
	pc.add_theme_stylebox_override("panel", s)
	pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_child(pc)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 3)
	pc.add_child(v)
	return v

func _meta(v: VBoxContainer, chips: Array) -> void:
	# a row of small label chips: [text, colour]
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	for c in chips:
		var l := UITheme.label(String(c[0]).to_upper(), "label", 15, Color.WHITE if c[1] != UITheme.YELLOW else UITheme.INK)
		var p := PanelContainer.new()
		p.add_theme_stylebox_override("panel", UITheme.sb(c[1], UITheme.SKEW, 0.0, Color.TRANSPARENT, Vector4(9, 1, 9, 1)))
		p.add_child(l)
		h.add_child(p)
	v.add_child(h)

func _fill() -> void:
	for c in list.get_children(): c.queue_free()
	var data: Dictionary = quests.log_entries() if quests != null and quests.has_method("log_entries") else {"active": [], "done": [], "rumors": [], "items": []}
	tabs.counts = [data.active.size(), data.done.size(), data.rumors.size()]
	tabs.selected = TAB_KEYS.find(tab)
	tabs._kick()
	if tab == "active":
		if data.active.is_empty():
			list.add_child(_label("No quests right now. Talk to the townspeople. Folks with a ! over their heads have something to ask.", 20, UITheme.INK_SOFT))
		for e in data.active:
			var v := _card(UITheme.RED)
			v.add_child(_label(String(e.title).to_upper(), 26, UITheme.INK, false, "heading"))
			_meta(v, [["Step %d / %d" % [e.step + 1, e.steps], UITheme.RED], ["From " + String(e.giver), Color(UITheme.INK, 0.55)]])
			v.add_child(_label("» " + String(e.hint), 21, UITheme.INK, true))
			if e.progress != "": v.add_child(_label(String(e.progress), 18, UITheme.RED_DEEP, true))
			v.add_child(_label(String(e.summary), 17, UITheme.INK_SOFT))
		if not data.items.is_empty():
			list.add_child(_label("CARRYING", 22, UITheme.INK, false, "heading"))
			for it in data.items:
				var v2 := _card(UITheme.ORANGE)
				v2.add_child(_label(String(it.name) + ("  ×%d" % it.count if it.count > 1 else ""), 21, UITheme.INK, true))
				if it.desc != "": v2.add_child(_label(String(it.desc), 17, UITheme.INK_SOFT))
	elif tab == "done":
		if data.done.is_empty():
			list.add_child(_label("Nothing finished yet. Pallet Town is full of people who could use a hand.", 20, UITheme.INK_SOFT))
		for e in data.done:
			var v := _card(UITheme.GREEN)
			v.add_child(_label(String(e.title).to_upper(), 24, UITheme.INK, false, "heading"))
			_meta(v, [["Complete", UITheme.GREEN.darkened(0.15)], ["For " + String(e.giver), Color(UITheme.INK, 0.55)]])
			v.add_child(_label(String(e.summary), 17, UITheme.INK_SOFT))
	else:
		if data.rumors.is_empty():
			list.add_child(_label("No rumors yet. Listen to the old sailors... they say things about Cinnabar Island.", 20, UITheme.INK_SOFT))
		for e in data.rumors:
			var v := _card(UITheme.PURPLE)
			v.add_child(_label(String(e.title).to_upper(), 22, UITheme.INK, false, "heading"))
			v.add_child(_label(String(e.summary), 18, UITheme.INK))
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

const TOAST_IN := UIToaster.T_IN
const TOAST_HOLD := UIToaster.HOLD

func _process(dt: float) -> void:
	if root.get_viewport_rect().size != _last_size: _layout()
	toaster.visible = not root.visible   # toasts wait while the log is open
	if _toasts.is_empty() or root.visible: return
	_toast_t += dt
	if _toast_t > UIToaster.T_IN + UIToaster.HOLD + UIToaster.T_OUT:
		_toasts.pop_front()
		_toast_t = 0.0
	toaster.queue_redraw()

# ---------- drawing ----------
func _draw_frame() -> void:
	var w := frame.size.x
	var h := frame.size.y
	var r := Rect2(0, 0, w, h)
	UITheme.panel(frame, r, UITheme.RED, 1.0, 0.0, 26.0, 8.0)
	# the header: chevrons after the title, a rule under the tabs, the ball watermark
	var tw := UITheme.text_w("QUEST LOG", "display", UITheme.fs("title"))
	UITheme.chevrons(frame, Vector2(30.0 + tw + 18.0, 42.0), 22.0, UITheme.RED, 3)
	frame.draw_line(Vector2(30, 138), Vector2(w - 30, 138), Color(UITheme.INK, 0.12), 1.5)
	UIDialogPanel._ball_mark(frame, Vector2(w - 150.0, 46.0), 64.0, Color(UITheme.INK, 0.06))

func _draw_toast() -> void:
	if _toasts.is_empty(): return
	var kind: String = _toasts[0][0]
	var text: String = _toasts[0][1]
	UIToaster.draw_toast(toaster, {"kind": kind, "head": KIND_LABEL.get(kind, kind.to_upper()), "text": text}, _toast_t, safe_rect(), "top", BTN.x + 40.0)
