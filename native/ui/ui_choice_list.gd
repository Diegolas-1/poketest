class_name UIChoiceList
extends Control
# A list of choices (what Ash can say, a menu's options): skewed dark rows,
# the selected one white with a red accent bar and a little pop; each row
# shows its number (keyboard: the number key; pad: the A glyph on the
# selected row; touch: tap the row). Draws itself; redraws only on change
# or while a row animates.
#
#   set_choices(list)      Array of String or {text, tag?, disabled?} (tag: a small chip, e.g. "[QUEST]")
#   selected: int          the highlighted row (move(d) to step it)
#   pick(i)                emits picked(i, choice) for an enabled row
#   handle(event) -> bool  input routing for a parent (UIDialogPanel); with
#                          input_enabled it listens by itself
#   content_height() -> float
#
# signals: picked(index, choice), hovered(index)

signal picked(index: int, choice: Variant)
signal hovered(index: int)

const ROW_H := 50.0
const GAP := 6.0

var items: Array = []
var selected := 0
var input_enabled := true
var _anim := {}          # row -> 0..1 selection amount
var _appear := 1.0
var _flash := -1
var _flash_t := 0.0
var _tap_frame := -1

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)
	if UIInput.I: UIInput.I.device_changed.connect(func(_d): queue_redraw())

func count() -> int: return items.size()

func set_choices(list: Array) -> void:
	items = []
	for c in list:
		items.append(c if c is Dictionary else {"text": str(c)})
	selected = clampi(selected, 0, maxi(0, items.size() - 1))
	if items.size() > 0:
		selected = 0
		while selected < items.size() - 1 and _disabled(selected): selected += 1
	_anim.clear()
	_appear = 0.0
	_flash = -1
	set_process(true)
	queue_redraw()

func content_height() -> float:
	return items.size() * (ROW_H + GAP)

func move(d: int) -> void:
	if items.is_empty(): return
	var n := items.size()
	var s := selected
	for _i in n:
		s = (s + d + n) % n
		if not _disabled(s): break
	if s != selected:
		selected = s
		Sfx.ui("ui_cursor")
		hovered.emit(selected)
		set_process(true)

func pick(i: int) -> void:
	if i < 0 or i >= items.size() or _disabled(i):
		Sfx.ui("ui_error")
		return
	selected = i
	_flash = i; _flash_t = 0.0
	Sfx.ui("ui_confirm")
	set_process(true)
	picked.emit(i, items[i])

func _disabled(i: int) -> bool: return bool(items[i].get("disabled", false))

func row_rect(i: int) -> Rect2:
	return Rect2(0.0, i * (ROW_H + GAP), size.x, ROW_H)

func handle(e: InputEvent) -> bool:
	if items.is_empty() or not is_visible_in_tree(): return false
	if e.is_action_pressed("ui_up") or e.is_action_pressed("move_up"): move(-1); return true
	if e.is_action_pressed("ui_down") or e.is_action_pressed("move_down"): move(1); return true
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): pick(selected); return true
	if e is InputEventKey and e.pressed and not e.echo and e.keycode >= KEY_1 and e.keycode <= KEY_9:
		var i: int = e.keycode - KEY_1
		if i < items.size(): pick(i); return true
	var pos := Vector2.INF
	if e is InputEventScreenTouch and e.pressed: pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	elif e is InputEventMouseMotion:
		var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * e.position
		for i in items.size():
			if row_rect(i).has_point(lp) and i != selected and not _disabled(i):
				selected = i; hovered.emit(i); set_process(true)
		return false
	if pos != Vector2.INF:
		# a tap arrives twice (the touch and the mouse made from it, or the other way round)
		if Engine.get_process_frames() == _tap_frame: return true
		_tap_frame = Engine.get_process_frames()
		var lp2: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
		for i in items.size():
			if row_rect(i).grow_individual(0, GAP * 0.5, 0, GAP * 0.5).has_point(lp2):
				pick(i); return true
	return false

func _unhandled_input(e: InputEvent) -> void:
	if input_enabled and handle(e): get_viewport().set_input_as_handled()

func _process(dt: float) -> void:
	var busy := false
	_appear = minf(1.0, _appear + dt / UITheme.BASE)
	if _appear < 1.0: busy = true
	for i in items.size():
		var want := 1.0 if i == selected else 0.0
		var v: float = _anim.get(i, 0.0)
		var nv := move_toward(v, want, dt / UITheme.FAST)
		_anim[i] = nv
		if nv != want: busy = true
	if _flash >= 0:
		_flash_t += dt
		if _flash_t > 0.3: _flash = -1
		else: busy = true
	queue_redraw()
	if not busy: set_process(false)

func _draw() -> void:
	for i in items.size():
		var it: Dictionary = items[i]
		var k: float = _anim.get(i, 0.0)
		var ap := UITheme.ease_out(clampf(_appear * 1.6 - i * 0.18, 0.0, 1.0))
		if ap <= 0.0: continue
		var r := row_rect(i)
		r.position.x += (1.0 - ap) * 46.0 - k * 10.0
		var dis := _disabled(i)
		var a := ap * (0.45 if dis else 1.0)
		var fl := 0.0
		if _flash == i: fl = 1.0 - _flash_t / 0.3
		if k > 0.01:
			var pts := UITheme.para_points(r, UITheme.SKEW)
			UITheme.shadow(self, pts, a * k, Vector2(0, 4))
			UITheme.fill_v(self, pts, Color(UITheme.PLATE, UITheme.PLATE.a * a * (1.0 - k)).lerp(Color(UITheme.WHITE, a), k), Color(UITheme.PLATE, UITheme.PLATE.a * a * (1.0 - k)).lerp(Color(UITheme.PAPER, a), k))
			UITheme.accent_bar(self, r, UITheme.RED, a * k, UITheme.SKEW, 7.0)
		else:
			UITheme.plate(self, r, a)
		if fl > 0.0: UITheme.para(self, r, Color(UITheme.YELLOW, 0.6 * fl))
		var fg := Color(UITheme.TEXT, a).lerp(Color(UITheme.INK, a), k)
		# the index box / glyph
		var ix := Vector2(r.position.x + 30.0, r.get_center().y)
		if UIInput.device == "pad" and i == selected:
			UITheme.glyph(self, ix, "use", 28.0, a)
		else:
			var bx := Rect2(ix - Vector2(14, 14), Vector2(28, 28))
			UITheme.para(self, bx, Color(UITheme.RED, a) if k > 0.5 else Color(1, 1, 1, 0.12 * a), 0.2)
			UITheme.text_mid(self, ix, str(i + 1), "label", 18, Color.WHITE if k > 0.5 else Color(UITheme.TEXT, a), 1)
		var tx := r.position.x + 58.0
		var tag := String(it.get("tag", ""))
		if tag != "":
			tx += UITheme.chip(self, Vector2(tx, r.get_center().y - 11.0), tag.to_upper(), UITheme.YELLOW, UITheme.INK, 14, 22.0, a) + 10.0
		UITheme.text_mid(self, Vector2(tx, r.get_center().y), String(it.get("text", "")), "body_bold", 22, fg, 0)
		if k > 0.5: UITheme.chevrons(self, Vector2(r.end.x - 34.0, r.get_center().y), 18.0, Color(UITheme.RED, a * k), 2)
