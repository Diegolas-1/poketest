class_name ConditionsUI
extends CanvasLayer
# Ash's conditions on screen (made by cast.gd; set `conditions` and `body` first),
# in the UI design system's look (ui/ui_widgets.gd):
#   badges     a row under the settings cog, top left inside the iPhone safe area:
#              one skewed dark badge per active condition (its icon on a coloured
#              disc, its name, a thin bar for the time left). Tap (or hover with a
#              mouse) for a card with its description and time.
#   new        a "NEW CONDITION" call-out that slides out beside the row when one
#              starts (an accent chip, the name in big italic, a sheen).
#   stamina    a segmented meter under the badges, shown only while it isn't full
#              (fades out a moment after it fills): green, yellow, then red in the
#              lowest part; orange and pulsing while fatigued, with the fatigue mark
#              at 10 %.
# Redraws only when something it shows changes (or while it animates).
#
#   blocks(pos)   true when a touch at pos belongs to the badges (main.gd _input)
#   safe_override  a Rect2 to pretend a safe area (screenshots)

const ROW_Y := 92.0          # under the cog (settings_menu.gd COG)
const BADGE_H := 44.0
const POP_IN := 0.3
const POP_HOLD := 3.2
const STAM_W := 190.0

var conditions: Conditions
var body: AshBody
var safe_override := Rect2()
var canvas: Control
var _rects := {}             # id -> Rect2 of its badge (this frame's layout)
var _open := ""              # the badge whose card is shown
var _hover := ""
var _pops: Array = []        # ids waiting for their "new" card
var _pop_t := 0.0
var _stam_a := 0.0
var _t := 0.0
var _icons := {}             # res:// pictures
var _sig := -1.0             # what was drawn last (redraw on change)
var _card_t := 9.0

func _ready() -> void:
	layer = 4
	process_mode = Node.PROCESS_MODE_ALWAYS
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw)
	add_child(canvas)
	if conditions:
		conditions.started.connect(func(id):
			if not _pops.has(id): _pops.append(id)
			Sfx.ui("ui_notify"))
		conditions.ended.connect(func(id):
			_pops.erase(id)
			if _open == id: _open = "")

func safe_rect() -> Rect2:
	return UITheme.safe_rect(canvas, safe_override)

func blocks(pos: Vector2) -> bool:
	for id in _rects:
		if (_rects[id] as Rect2).grow(6).has_point(pos): return true
	if _open != "" and _card_rect().has_point(pos): return true
	return false

func _input(e: InputEvent) -> void:
	var pos := Vector2.INF
	if e is InputEventScreenTouch and e.pressed: pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	elif e is InputEventMouseMotion:
		var h := ""
		for id in _rects:
			if (_rects[id] as Rect2).has_point(e.position): h = id
		if h != _hover:
			_hover = h
			_card_t = 0.0
		return
	if pos == Vector2.INF: return
	for id in _rects:
		if (_rects[id] as Rect2).grow(6).has_point(pos):
			_open = "" if _open == id else id
			_card_t = 0.0
			Sfx.ui("ui_cursor")
			get_viewport().set_input_as_handled()
			return
	if _open != "":
		if _card_rect().has_point(pos): get_viewport().set_input_as_handled()
		_open = ""

func _process(dt: float) -> void:
	_t += dt
	_card_t += dt
	var anim := false
	if not _pops.is_empty():
		_pop_t += dt
		anim = true
		if _pop_t > POP_IN * 2.0 + POP_HOLD:
			_pops.pop_front(); _pop_t = 0.0
	if body:
		var show := body.stamina < 0.999 or conditions.has("fatigue")
		var was := _stam_a
		_stam_a = move_toward(_stam_a, 1.0 if show else 0.0, dt * (4.0 if show else 1.2))
		if _stam_a != was: anim = true
		if conditions.has("fatigue") and _stam_a > 0.0: anim = true   # the pulse
	if _card_t < UITheme.BASE: anim = true
	# what the badges show: redraw when it changes
	var sig := 0.0
	if conditions:
		sig += conditions.active.size() * 1000.0
		for id in conditions.active: sig += roundf(conditions.strength(id) * 200.0) + id.length() * 7.0
	if body: sig += roundf(body.stamina * 300.0) * 0.001
	sig += (17.0 if _open != "" else 0.0) + (31.0 if _hover != "" else 0.0) + _open.length() * 0.37 + _hover.length() * 0.53
	var vs := canvas.get_viewport_rect().size
	sig += vs.x * 0.0001 + vs.y * 0.00001
	if anim or sig != _sig:
		_sig = sig
		canvas.queue_redraw()

# ---------- drawing ----------
func _origin() -> Vector2:
	var sr := safe_rect()
	return Vector2(sr.position.x + 20.0, sr.position.y + ROW_Y)

func _tex(ic: String) -> Texture2D:
	if not ic.begins_with("res://"): return null
	if not _icons.has(ic): _icons[ic] = load(ic) if ResourceLoader.exists(ic) else null
	return _icons[ic]

func _draw() -> void:
	_rects.clear()
	if conditions == null: return
	var o := _origin()
	var x := o.x
	var ids := conditions.active_ids()
	for id in ids:
		var f := -1.0
		var dur: Dictionary = conditions.def(id).get("duration", {})
		if String(dur.get("kind", "")) == "decay": f = conditions.strength(id)
		elif id == "fatigue" and body: f = body.stamina
		var ic := conditions.icon(id)
		var r := UIWidgets.badge(canvas, Vector2(x, o.y), ic, conditions.label(id), _accent(id), f, _open == id or _hover == id, 1.0, _tex(ic), BADGE_H)
		_rects[id] = r
		x += r.size.x + 12.0
	var y := o.y + (BADGE_H + 14.0 if not ids.is_empty() else 0.0)
	if _stam_a > 0.001 and body: _stamina_bar(Vector2(o.x, y), _stam_a)
	var shown := _open if _open != "" else _hover
	if shown != "" and _rects.has(shown): _card(shown)
	elif not _pops.is_empty() and _rects.has(_pops[0]): _pop(_pops[0], Vector2(x + 6.0, o.y))

# the condition's own colour, brightened to sit on a dark plate
func _accent(id: String) -> Color:
	var c := conditions.color(id)
	return c.lightened(0.18) if c.get_luminance() < 0.45 else c

func _card_rect() -> Rect2:
	if not _rects.has(_open): return Rect2()
	var b: Rect2 = _rects[_open]
	var sr := safe_rect()
	var w := minf(360.0, sr.end.x - b.position.x - 16.0)
	var rows := UITheme.wrap(conditions.description(_open), "body", 19, w - 44.0)
	return Rect2(b.position.x, b.end.y + 14.0, w, UIWidgets.card_height(rows.size(), conditions.time_text(_open) != ""))

func _card(id: String) -> void:
	var b: Rect2 = _rects[id]
	var sr := safe_rect()
	var w := minf(360.0, sr.end.x - b.position.x - 16.0)
	var rows := UITheme.wrap(conditions.description(id), "body", 19, w - 44.0)
	var tt := conditions.time_text(id)
	var k := UITheme.ease_out(clampf(_card_t / UITheme.BASE, 0.0, 1.0))
	var r := Rect2(b.position.x, b.end.y + 14.0 - (1.0 - k) * 10.0, w, UIWidgets.card_height(rows.size(), tt != ""))
	UIWidgets.card(canvas, r, conditions.label(id), rows, tt, conditions.color(id), b.position.x + 26.0, k)

# "NEW CONDITION": slides out from behind the badges
func _pop(id: String, at: Vector2) -> void:
	var t := _pop_t
	var a := clampf(minf(t / POP_IN, (POP_IN * 2.0 + POP_HOLD - t) / POP_IN), 0.0, 1.0)
	var e := UITheme.ease_back(clampf(t / POP_IN, 0.0, 1.0), 1.6)
	var head := "NEW CONDITION"
	var name := conditions.label(id).to_upper()
	var col := _accent(id)
	var sr := safe_rect()
	var nw := UITheme.text_w(name, "display", 30)
	var w := minf(maxf(nw, UITheme.text_w(head, "label", 14) + 30.0) + 96.0, sr.end.x - at.x - 90.0)
	var x := at.x - (1.0 - e) * 50.0
	var r := Rect2(x, at.y - 12.0, w, 68.0)
	var pts := UITheme.plate(canvas, r, a)
	UITheme.outline(canvas, pts, Color(col, 0.7 * a), 1.5)
	var ib := Rect2(x - 4.0, r.position.y, 64.0, r.size.y)
	UITheme.fill_v(canvas, UITheme.para_points(ib), Color(col.lightened(0.1), a), Color(col.darkened(0.1), a))
	var ic := conditions.icon(id)
	var tex := _tex(ic)
	if tex: canvas.draw_texture_rect(tex, Rect2(ib.get_center() - Vector2(15, 15), Vector2(30, 30)), false, Color(1, 1, 1, a))
	else: UITheme.icon(canvas, ic, ib.get_center(), 15.0, Color(1, 1, 1, a))
	UITheme.chip(canvas, Vector2(ib.end.x + 14.0, r.position.y + 9.0), head, col, UITheme.INK if col.get_luminance() > 0.6 else Color.WHITE, 14, 20.0, a)
	UITheme.text(canvas, Vector2(ib.end.x + 14.0, r.end.y - 11.0), name, "display", 30, Color(UITheme.TEXT, a))
	# the sheen
	var sh := clampf((t - POP_IN * 0.7) / 0.45, 0.0, 1.0)
	if sh > 0.0 and sh < 1.0: UITheme.para(canvas, Rect2(lerpf(r.position.x, r.end.x, sh), r.position.y, 24.0, r.size.y), Color(1, 1, 1, 0.18 * a), 0.8)

func _stamina_bar(at: Vector2, alpha: float) -> void:
	var s := body.stamina
	var tired := conditions.has("fatigue")
	var col: Color
	if tired:
		col = UITheme.ORANGE.lerp(UITheme.RED, 0.5 + 0.5 * sin(_t * 6.0))
	elif s > 0.5: col = UITheme.GREEN
	elif s > 0.25: col = UITheme.GREEN.lerp(UITheme.YELLOW, (0.5 - s) / 0.25)
	else: col = UITheme.YELLOW.lerp(UITheme.RED, clampf((0.25 - s) / 0.15, 0.0, 1.0))
	UIWidgets.meter(canvas, at, STAM_W, s, col, "bolt", "Out of breath" if tired else "", alpha, 0.1)
