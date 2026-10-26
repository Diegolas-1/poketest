class_name ConditionsUI
extends CanvasLayer
# Ash's conditions on screen (made by cast.gd; set `conditions` and `body` first):
#   badges     a row under the settings cog, top left inside the iPhone safe area:
#              one cream pill per active condition (its icon on a coloured disc and
#              its short name, a thin bar under the name for the time left). Tap
#              (or hover with a mouse) for a card with its description and time.
#   new        a "NEW CONDITION" card that slides out beside the row when one
#              starts (the quest toast's look: cream, ink border, a coloured pill).
#   stamina    a bar under the badges, shown only while it isn't full (fades out a
#              moment after it fills): green, yellow, then red in the lowest part;
#              orange and pulsing while fatigued, with the fatigue mark at 10 %.
# The fonts and colours are the dialog box's and the quest log's.
#
#   blocks(pos)   true when a touch at pos belongs to the badges (main.gd _input)
#   safe_override  a Rect2 to pretend a safe area (screenshots)

const INK := Color("23284f")
const RED := Color("e8463c")
const CREAM := Color("fffdf6")
const MUTED := Color(0.137, 0.157, 0.31, 0.62)
const ROW_Y := 84.0          # under the cog (settings_menu.gd COG: 16, 16, 56 x 56)
const BADGE_H := 44.0
const POP_IN := 0.3
const POP_HOLD := 3.2

var conditions: Conditions
var body: AshBody
var safe_override := Rect2()
var font: FontVariation
var font_bold: FontVariation
var canvas: Control
var _rects := {}             # id -> Rect2 of its badge (this frame's layout)
var _open := ""              # the badge whose card is shown
var _hover := ""
var _pops: Array = []        # ids waiting for their "new" card
var _pop_t := 0.0
var _stam_a := 0.0
var _t := 0.0
var _icons := {}             # res:// pictures

func _ready() -> void:
	layer = 4
	process_mode = Node.PROCESS_MODE_ALWAYS
	var ff: FontFile = load("res://fonts/PixelifySans.woff2")
	font = FontVariation.new(); font.base_font = ff; font.variation_opentype = {"wght": 600}
	font_bold = FontVariation.new(); font_bold.base_font = ff; font_bold.variation_opentype = {"wght": 700}
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
	var vs := canvas.get_viewport_rect().size if canvas and canvas.is_inside_tree() else Vector2(1280, 720)
	var full := Rect2(Vector2.ZERO, vs)
	if safe_override.size != Vector2.ZERO: return safe_override
	if not OS.has_feature("mobile"): return full
	var sa := DisplayServer.get_display_safe_area()
	var ws := DisplayServer.window_get_size()
	if sa.size.x <= 0 or ws.x <= 0: return full
	var k := vs / Vector2(ws)
	return Rect2(Vector2(sa.position) * k, Vector2(sa.size) * k).intersection(full)

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
		_hover = h
		return
	if pos == Vector2.INF: return
	for id in _rects:
		if (_rects[id] as Rect2).grow(6).has_point(pos):
			_open = "" if _open == id else id
			Sfx.ui("ui_cursor")
			get_viewport().set_input_as_handled()
			return
	if _open != "":
		if _card_rect().has_point(pos): get_viewport().set_input_as_handled()
		_open = ""

func _process(dt: float) -> void:
	_t += dt
	if not _pops.is_empty():
		_pop_t += dt
		if _pop_t > POP_IN * 2.0 + POP_HOLD:
			_pops.pop_front(); _pop_t = 0.0
	if body:
		var show := body.stamina < 0.999 or conditions.has("fatigue")
		_stam_a = move_toward(_stam_a, 1.0 if show else 0.0, dt * (4.0 if show else 1.2))
	canvas.queue_redraw()

# ---------- drawing ----------
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

func _origin() -> Vector2:
	var sr := safe_rect()
	return Vector2(sr.position.x + 16.0, sr.position.y + ROW_Y)

func _draw() -> void:
	_rects.clear()
	if conditions == null: return
	var o := _origin()
	var x := o.x
	var ids := conditions.active_ids()
	for id in ids:
		var w := _badge(id, Vector2(x, o.y))
		_rects[id] = Rect2(x, o.y, w, BADGE_H)
		x += w + 8.0
	var y := o.y + (BADGE_H + 10.0 if not ids.is_empty() else 0.0)
	if _stam_a > 0.001 and body: _stamina_bar(Vector2(o.x, y), _stam_a)
	var shown := _open if _open != "" else _hover
	if shown != "" and _rects.has(shown): _card(shown)
	elif not _pops.is_empty() and _rects.has(_pops[0]): _pop(_pops[0], Vector2(x + 4.0, o.y))

func _badge(id: String, at: Vector2) -> float:
	var name := conditions.label(id)
	var fs := 17
	var tw := font_bold.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var w := 44.0 + tw + 14.0
	var r := Rect2(at, Vector2(w, BADGE_H))
	canvas.draw_style_box(_sb(Color(0.04, 0.05, 0.16, 0.2), 22), Rect2(r.position + Vector2(0, 3), r.size))
	canvas.draw_style_box(_sb(Color(CREAM, 0.96), 22, 2.0 if _open != id else 3.0, INK if _open != id else conditions.color(id)), r)
	_icon(id, at + Vector2(22, BADGE_H * 0.5), 15.0)
	canvas.draw_string(font_bold, at + Vector2(42, 27), name, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, INK)
	# the time left: a thin bar under the name (a decaying condition runs it down)
	var dur: Dictionary = conditions.def(id).get("duration", {})
	if String(dur.get("kind", "")) == "decay":
		var f := conditions.strength(id)
		var bw := tw
		canvas.draw_rect(Rect2(at.x + 42, at.y + 33, bw, 3), Color(INK, 0.15))
		canvas.draw_rect(Rect2(at.x + 42, at.y + 33, bw * f, 3), conditions.color(id))
	elif id == "fatigue" and body:
		canvas.draw_rect(Rect2(at.x + 42, at.y + 33, tw, 3), Color(INK, 0.15))
		canvas.draw_rect(Rect2(at.x + 42, at.y + 33, tw * body.stamina, 3), conditions.color(id))
	return w

# a condition's icon on its disc: a drawn glyph or a res:// picture
func _icon(id: String, c: Vector2, r: float) -> void:
	var col := conditions.color(id)
	canvas.draw_circle(c, r, col, true, -1.0, true)
	canvas.draw_circle(c, r, Color(INK, 0.85), false, 1.5, true)
	var ic := conditions.icon(id)
	var wc := Color(1, 1, 1, 0.95)
	if ic.begins_with("res://"):
		if not _icons.has(ic): _icons[ic] = load(ic) if ResourceLoader.exists(ic) else null
		if _icons[ic]: canvas.draw_texture_rect(_icons[ic], Rect2(c - Vector2(r, r) * 0.75, Vector2(r, r) * 1.5), false)
		return
	match ic:
		"drop":
			_drop_shape(c + Vector2(0, 1.5), r * 0.62, wc)
			canvas.draw_circle(c + Vector2(-2.2, 2.0), 1.6, Color(col, 0.9), true, -1.0, true)
		"sweat":
			# a tired face's sweat drop and two shut eyes
			canvas.draw_line(c + Vector2(-7, -1), c + Vector2(-2.5, 0.5), wc, 2.0, true)
			canvas.draw_line(c + Vector2(1, 0.5), c + Vector2(5.5, -1), wc, 2.0, true)
			canvas.draw_arc(c + Vector2(-0.8, 6.5), 3.0, PI, TAU, 8, wc, 2.0, true)
			_drop_shape(c + Vector2(8.5, -4.5), 3.6, wc)
		"bolt":
			canvas.draw_colored_polygon(PackedVector2Array([c + Vector2(2, -10), c + Vector2(-5, 1), c + Vector2(0, 1), c + Vector2(-2, 10), c + Vector2(5, -2), c + Vector2(0, -2)]), wc)
		"heart":
			canvas.draw_circle(c + Vector2(-3.5, -2), 4.2, wc); canvas.draw_circle(c + Vector2(3.5, -2), 4.2, wc)
			canvas.draw_colored_polygon(PackedVector2Array([c + Vector2(-7.5, -0.5), c + Vector2(7.5, -0.5), c + Vector2(0, 8)]), wc)
		"sun":
			canvas.draw_circle(c, 5.0, wc)
			for k in 8:
				var a := k * TAU / 8.0
				canvas.draw_line(c + Vector2(cos(a), sin(a)) * 7.5, c + Vector2(cos(a), sin(a)) * 10.5, wc, 2.0, true)
		"snow":
			for k in 3:
				var a := k * PI / 3.0
				canvas.draw_line(c - Vector2(cos(a), sin(a)) * 9.0, c + Vector2(cos(a), sin(a)) * 9.0, wc, 2.0, true)
		_:
			canvas.draw_circle(c, 4.0, wc)

func _drop_shape(c: Vector2, r: float, col: Color) -> void:
	# a teardrop: the tip 1.8 r above the middle of its round bottom
	var pts := PackedVector2Array([c + Vector2(0, -r * 1.8)])
	for k in 13:
		var f := deg_to_rad(56.3 + (360.0 - 112.6) * float(k) / 12.0)
		pts.append(c + Vector2(sin(f), -cos(f)) * r)
	canvas.draw_colored_polygon(pts, col)

func _card_rect() -> Rect2:
	if not _rects.has(_open): return Rect2()
	var b: Rect2 = _rects[_open]
	var sr := safe_rect()
	var w := minf(330.0, sr.end.x - b.position.x - 16.0)
	return Rect2(b.position.x, b.end.y + 8.0, w, 96.0)

func _card(id: String) -> void:
	var b: Rect2 = _rects[id]
	var sr := safe_rect()
	var w := minf(330.0, sr.end.x - b.position.x - 16.0)
	var desc := conditions.description(id)
	var lines := _wrap(desc, w - 32.0, 16)
	var h := 64.0 + lines.size() * 20.0
	var r := Rect2(b.position.x, b.end.y + 8.0, w, h)
	canvas.draw_style_box(_sb(Color(0.04, 0.05, 0.16, 0.2), 16), Rect2(r.position + Vector2(0, 4), r.size))
	canvas.draw_style_box(_sb(Color(CREAM, 0.98), 14, 3.0, INK), r)
	# the little pointer up to its badge
	var px := b.position.x + 22.0
	canvas.draw_colored_polygon(PackedVector2Array([Vector2(px - 8, r.position.y + 1.5), Vector2(px + 8, r.position.y + 1.5), Vector2(px, r.position.y - 8)]), INK)
	canvas.draw_colored_polygon(PackedVector2Array([Vector2(px - 5, r.position.y + 3.5), Vector2(px + 5, r.position.y + 3.5), Vector2(px, r.position.y - 3.5)]), CREAM)
	canvas.draw_string(font_bold, r.position + Vector2(16, 28), conditions.label(id), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, conditions.color(id).darkened(0.2))
	for i in lines.size():
		canvas.draw_string(font, r.position + Vector2(16, 50 + i * 20), lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, INK)
	var tt := conditions.time_text(id)
	if tt != "":
		canvas.draw_string(font, r.position + Vector2(16, h - 12), tt, HORIZONTAL_ALIGNMENT_LEFT, w - 32.0, 15, MUTED)

func _wrap(text: String, w: float, fs: int) -> Array:
	var out := []
	var row := ""
	for word in text.split(" "):
		var t := word if row == "" else row + " " + word
		if font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w and row != "":
			out.append(row); row = word
		else: row = t
	if row != "": out.append(row)
	return out

# "NEW CONDITION": slides out from behind the badges
func _pop(id: String, at: Vector2) -> void:
	var t := _pop_t
	var a := clampf(minf(t / POP_IN, (POP_IN * 2.0 + POP_HOLD - t) / POP_IN), 0.0, 1.0)
	var e := 1.0 - pow(1.0 - a, 3.0)
	var head := "NEW CONDITION"
	var name := conditions.label(id)
	var sr := safe_rect()
	var hw := font_bold.get_string_size(head, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	var nw := font_bold.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
	var w := minf(maxf(hw + 30.0, nw + 30.0) + 64.0, sr.end.x - at.x - 90.0)
	var x := at.x - (1.0 - e) * 40.0
	var r := Rect2(x, at.y - 10.0, w, 64.0)
	canvas.draw_style_box(_sb(Color(0.04, 0.05, 0.16, 0.18 * a), 16), Rect2(r.position + Vector2(-1, 4), r.size + Vector2(2, 1)))
	canvas.draw_style_box(_sb(Color(CREAM, 0.97 * a), 14, 3.0, Color(INK, a)), r)
	var pill := Rect2(x + 54, r.position.y + 9, hw + 18, 19)
	canvas.draw_style_box(_sb(Color(conditions.color(id), a), 9), pill)
	canvas.draw_string(font_bold, Vector2(pill.position.x + 9, pill.position.y + 14), head, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, a))
	canvas.draw_string(font_bold, Vector2(x + 54, r.position.y + 52), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(INK, a))
	if a > 0.5: _icon(id, Vector2(x + 30, r.position.y + 32), 18.0)

func _stamina_bar(at: Vector2, alpha: float) -> void:
	var w := 168.0
	var h := 16.0
	var s := body.stamina
	var tired := conditions.has("fatigue")
	var r := Rect2(at + Vector2(30, 0), Vector2(w, h))
	# a little running shoe's sole: a bolt on a disc
	var c := at + Vector2(12, h * 0.5)
	canvas.draw_circle(c, 11.0, Color(CREAM, 0.95 * alpha), true, -1.0, true)
	canvas.draw_circle(c, 11.0, Color(INK, 0.85 * alpha), false, 1.5, true)
	var bc := Color("d0702a") if tired else Color("4c9a5b")
	canvas.draw_colored_polygon(PackedVector2Array([c + Vector2(1.5, -7), c + Vector2(-4, 1), c + Vector2(0, 1), c + Vector2(-1.5, 7), c + Vector2(4, -1.5), c + Vector2(0, -1.5)]), Color(bc, alpha))
	canvas.draw_style_box(_sb(Color(0.04, 0.05, 0.16, 0.22 * alpha), 8), Rect2(r.position + Vector2(0, 2), r.size))
	canvas.draw_style_box(_sb(Color(CREAM, 0.9 * alpha), 8, 2.0, Color(INK, alpha)), r)
	var col: Color
	if tired:
		col = Color("e07a2c").lerp(Color("e8463c"), 0.5 + 0.5 * sin(_t * 6.0))
	elif s > 0.5: col = Color("4c9a5b")
	elif s > 0.25: col = Color("4c9a5b").lerp(Color("e0b030"), (0.5 - s) / 0.25)
	else: col = Color("e0b030").lerp(Color("e8463c"), clampf((0.25 - s) / 0.15, 0.0, 1.0))
	var fw := maxf(0.0, (w - 6.0) * s)
	if fw > 1.0: canvas.draw_style_box(_sb(Color(col, alpha), 5), Rect2(r.position + Vector2(3, 3), Vector2(fw, h - 6.0)))
	# the fatigue mark at 10 %
	var mx := r.position.x + 3.0 + (w - 6.0) * 0.1
	canvas.draw_line(Vector2(mx, r.position.y + 2), Vector2(mx, r.end.y - 2), Color(INK, 0.5 * alpha), 1.5)
	if tired:
		var tp := Vector2(r.end.x + 8, r.position.y + 14)
		canvas.draw_string_outline(font_bold, tp, "Out of breath", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, 5, Color(0.08, 0.1, 0.2, 0.6 * alpha))
		canvas.draw_string(font_bold, tp, "Out of breath", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(CREAM, alpha))
