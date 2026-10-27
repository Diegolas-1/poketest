class_name ConversationUI
extends Control
# The conversation panel (conversation.gd): a bar at the bottom with the
# speaker's nameplate and their line typed out, a list of Ash's choices above
# it (touch, mouse, D-pad / stick / arrows / W S, A / E / Enter, or 1-4), a
# soft vignette and thin letterbox bars while a conversation is on, and a small
# note when one of Ash's growth threads moves.
#
# Kept small so it can be swapped for the UI kit's DialogPanel / ChoiceList:
#   show_line(speaker, text, colour)    typewriter; typing() / finish()
#   show_choices(list)                  [{label, tone, dim}] -> signal picked(i)
#   hide_panel()                        (hide() hides the whole control)
#   signal advance                      a tap on the panel (next line)
#   cine = 0..1                         the vignette and bars (eased by the owner)
#   note(text)                          a fading note over the panel
#   voice, voice_pitch                  the typing blips (sfx ui_blip_<voice>)
#   static rows(text) / label_fits(text) the layout check (conversation_test.gd)

signal picked(i: int)
signal advance

const INK := Color("101425")
const PANEL := Color(0.06, 0.07, 0.13, 0.86)
const TEXT := Color("f4f1e8")
const CPS := 50.0                     # letters a second
const ROWS := 3
const TEXT_EM := 34.0                 # text width in font sizes
const CHOICE_EM := 22.0               # a choice label's room, in font sizes
const TONES := {
	"eager": Color("ffb03a"), "kind": Color("ff7aa8"), "cheeky": Color("8ad66b"), "curious": Color("62c0ff"),
	"quiet": Color("b7b0d6"), "firm": Color("ff6b5a"), "bye": Color("9aa3b5"),
}

var speaker := ""
var text := ""
var colour := Color.WHITE
var shown := 0.0
var choices: Array = []
var sel := 0
var cine := 0.0
var voice := "mid"
var voice_pitch := 1.0
var _blip := -1
var _note := ""
var _note_t := 99.0
var _t := 0.0
var _rects: Array = []        # the choice rows' rects (touch / mouse)
var _panel := Rect2()
var font: FontVariation
var font_b: FontVariation
var _vig: GradientTexture2D
var _on := false
static var _mfont: FontVariation

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = _font(600)
	font_b = _font(700)
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0)); g.set_color(1, Color(0.01, 0.01, 0.04, 0.55))
	g.set_offset(0, 0.55)
	_vig = GradientTexture2D.new()
	_vig.gradient = g
	_vig.fill = GradientTexture2D.FILL_RADIAL
	_vig.fill_from = Vector2(0.5, 0.5); _vig.fill_to = Vector2(1.05, 0.5)
	_vig.width = 128; _vig.height = 128

static func _font(wght: int) -> FontVariation:
	var f := FontVariation.new()
	f.base_font = load("res://fonts/PixelifySans.woff2")
	f.variation_opentype = {"wght": wght}
	return f

# ---------- the interface ----------
func show_line(who: String, t: String, c: Color) -> void:
	speaker = who; text = t; colour = c; shown = 0.0; _blip = -1
	choices = []; _rects = []; _on = true
	queue_redraw()

func show_choices(list: Array) -> void:
	choices = list; sel = 0; _on = true
	# start on the first one not read yet
	for i in list.size():
		if not list[i].get("dim", false): sel = i; break
	shown = text.length()
	queue_redraw()

func hide_panel() -> void:
	_on = false; choices = []; text = ""; speaker = ""; _rects = []
	queue_redraw()

func typing() -> bool: return _on and choices.is_empty() and shown < text.length()
func finish() -> void: shown = text.length()
func choosing() -> bool: return not choices.is_empty()

func move(d: int) -> void:
	if choices.is_empty(): return
	sel = posmod(sel + d, choices.size())
	Sfx.ui("ui_cursor")
	queue_redraw()

func confirm() -> void:
	if choices.is_empty(): return
	var i := sel
	choices = []; _rects = []
	Sfx.ui("ui_confirm")
	picked.emit(i)

func note(t: String) -> void:
	_note = t; _note_t = 0.0

# ---------- layout (also for the test) ----------
func _fs() -> int:
	var s := get_viewport_rect().size
	return clampi(int(round(minf(s.y * 0.033, s.x * 0.022))), 14, 30)

static func _measure_font() -> FontVariation:
	if _mfont == null: _mfont = _font(600)
	return _mfont

static func wrap_text(t: String, w: float, fs: int, f: Font = null) -> Array:
	if f == null: f = _measure_font()
	var out := []
	var row := ""
	for word in t.split(" "):
		var tt := word if row == "" else row + " " + word
		if f.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w and row != "":
			out.append(row); row = word
		else: row = tt
	if row != "": out.append(row)
	return out

# rows a line takes in the panel (the same at any screen size: the panel scales with the font)
static func rows(t: String) -> int:
	return wrap_text(t, TEXT_EM * 40.0, 40).size()

static func label_fits(t: String) -> bool:
	return _measure_font().get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 40).x <= CHOICE_EM * 40.0

# ---------- input: taps and clicks ----------
func _input(e: InputEvent) -> void:
	if not _on or not visible: return
	var p := Vector2(-1, -1)
	if e is InputEventKey and e.pressed and not e.echo and not choices.is_empty():
		var k: int = e.physical_keycode - KEY_1
		if k >= 0 and k < choices.size():
			sel = k; get_viewport().set_input_as_handled(); confirm()
		return
	if e is InputEventScreenTouch and e.pressed: p = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: p = e.position
	elif e is InputEventMouseMotion and not choices.is_empty():
		for i in _rects.size():
			if _rects[i].has_point(e.position) and sel != i: sel = i; queue_redraw()
		return
	if p.x < 0: return
	for i in _rects.size():
		if _rects[i].has_point(p):
			sel = i
			get_viewport().set_input_as_handled()
			confirm(); return
	if choices.is_empty() and _panel.grow(20).has_point(p):
		get_viewport().set_input_as_handled()
		advance.emit()

# ---------- the frame ----------
func _process(dt: float) -> void:
	_t += dt
	_note_t += dt
	if size != get_viewport_rect().size: size = get_viewport_rect().size
	if _on and choices.is_empty() and shown < text.length():
		shown = minf(float(text.length()), shown + dt * CPS)
		var k := int(shown) - 1
		if k >= 0 and floori(k / 3.0) != _blip and k < text.length() - 1:
			_blip = floori(k / 3.0)
			if text[k] != " " and Sfx.I != null and Sfx.I.ui_on: Sfx.play("ui_blip_" + voice, null, {"pitch": voice_pitch})
	if cine > 0.001 or _on or _note_t < 3.0: queue_redraw()

func _sb(fill: Color, rad: int, border := 0, bc := Color.WHITE) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	sb.set_corner_radius_all(rad)
	sb.corner_detail = 5
	sb.anti_aliasing = true
	if border > 0:
		sb.border_color = bc; sb.set_border_width_all(border)
	return sb

func _draw() -> void:
	var W := size.x
	var H := size.y
	if cine > 0.001:
		draw_texture_rect(_vig, Rect2(-W * 0.1, -H * 0.15, W * 1.2, H * 1.3), false, Color(1, 1, 1, cine))
		var bar := H * 0.055 * cine
		draw_rect(Rect2(0, 0, W, bar), Color(0, 0, 0, 0.92 * cine))
		draw_rect(Rect2(0, H - bar, W, bar), Color(0, 0, 0, 0.92 * cine))
	var fs := _fs()
	var pw := minf(W - 32.0, fs * (TEXT_EM + 2.5))
	var ph := fs * 1.45 * ROWS + fs * 1.3
	var px := (W - pw) * 0.5
	var py := H - ph - maxf(H * 0.055 * cine, 10.0) - 8.0
	_panel = Rect2(px, py, pw, ph)
	if _note_t < 3.0:
		var a := minf(1.0, _note_t * 3.0) * minf(1.0, (3.0 - _note_t) * 1.5)
		var nw := font.get_string_size(_note, HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 3).x
		var ny := (py if _on else H - 60.0) - fs * 1.2
		draw_string(font, Vector2(W * 0.5 - nw * 0.5, ny), _note, HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 3, Color(1, 0.93, 0.7, a * 0.9))
	if not _on: return
	draw_style_box(_sb(PANEL, 10, 2, Color(1, 1, 1, 0.12)), _panel)
	# the nameplate
	if speaker != "":
		var nw2 := font_b.get_string_size(speaker, HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 2).x + fs * 1.4
		var nr := Rect2(px + fs * 0.7, py - fs * 0.85, nw2, fs * 1.45)
		draw_style_box(_sb(colour.darkened(0.15), 6), nr)
		draw_rect(Rect2(nr.position.x, nr.end.y - 3, nr.size.x, 3), Color(0, 0, 0, 0.25))
		draw_string(font_b, Vector2(nr.position.x + fs * 0.7, nr.position.y + fs * 1.05), speaker, HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 2, Color.WHITE)
	# the line
	var tc := TEXT if speaker != "" else Color(0.8, 0.82, 0.9)
	var rr := wrap_text(text.substr(0, int(shown)), pw - fs * 2.0, fs, font)
	for r in mini(ROWS, rr.size()):
		draw_string(font, Vector2(px + fs, py + fs * 1.55 + r * fs * 1.45), rr[r], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, tc)
	if choices.is_empty() and shown >= text.length():
		var bob := sin(_t * 6.0) * 2.0
		var tx := px + pw - fs * 1.3
		var ty := py + ph - fs * 0.9 + bob
		draw_colored_polygon(PackedVector2Array([Vector2(tx, ty), Vector2(tx + fs * 0.6, ty), Vector2(tx + fs * 0.3, ty + fs * 0.35)]), Color("e8463c"))
	if choices.is_empty(): return
	# Ash's choices, above the panel on the right
	_rects = []
	var rh := fs * 1.75
	var cw := minf(pw * 0.62, fs * (CHOICE_EM + 5.5))
	var cx := px + pw - cw
	var cy := py - fs * 1.1 - rh * choices.size()
	draw_style_box(_sb(Color(0.05, 0.06, 0.11, 0.8), 10, 2, Color(1, 1, 1, 0.1)), Rect2(cx - 6, cy - 8, cw + 12, rh * choices.size() + 16))
	var pad := Input.get_connected_joypads().size() > 0
	for i in choices.size():
		var c: Dictionary = choices[i]
		var r := Rect2(cx, cy + i * rh, cw, rh - 4)
		_rects.append(r)
		var on := i == sel
		var dim: bool = c.get("dim", false)
		var tone := String(c.get("tone", "curious"))
		var tcol: Color = TONES.get(tone, TONES.curious)
		if on:
			draw_style_box(_sb(Color(1, 1, 1, 0.13), 7, 2, tcol), r)
		var a := 0.5 if dim and not on else 1.0
		# the key number, the tone glyph, the label
		draw_string(font, Vector2(r.position.x + fs * 0.35, r.position.y + rh * 0.62), str(i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 6, Color(1, 1, 1, 0.35 * a))
		_glyph(tone, Vector2(r.position.x + fs * 1.55, r.position.y + rh * 0.45), fs * 0.42, Color(tcol, a))
		var lc := Color(TEXT, a)
		draw_string(font, Vector2(r.position.x + fs * 2.4, r.position.y + rh * 0.62), String(c.get("label", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 1, lc)
		if dim:
			var lw := font.get_string_size(String(c.get("label", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 1).x
			_check(Vector2(r.position.x + fs * 2.4 + lw + fs * 0.5, r.position.y + rh * 0.42), fs * 0.3, Color(1, 1, 1, 0.45))
		if on:
			# the confirm glyph: A on a pad, else the key
			var bc := Vector2(r.end.x - fs * 0.9, r.position.y + rh * 0.45)
			draw_circle(bc, fs * 0.5, Color("e8463c"), true, -1.0, true)
			var g := "A" if pad else "E"
			var gw := font_b.get_string_size(g, HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 6).x
			draw_string(font_b, bc + Vector2(-gw * 0.5, fs * 0.28), g, HORIZONTAL_ALIGNMENT_LEFT, -1, fs - 6, Color.WHITE)

func _check(c: Vector2, s: float, col: Color) -> void:
	draw_polyline(PackedVector2Array([c + Vector2(-s, 0), c + Vector2(-s * 0.3, s * 0.7), c + Vector2(s, -s * 0.8)]), col, 2.0, true)

# the tone glyphs (drawn, so they need no icon font)
func _glyph(tone: String, c: Vector2, s: float, col: Color) -> void:
	draw_circle(c, s * 1.25, Color(col, col.a * 0.22), true, -1.0, true)
	match tone:
		"eager":   # a spark
			var pts := PackedVector2Array()
			for k in 8:
				var ang := -PI / 2.0 + k * PI / 4.0
				pts.append(c + Vector2(cos(ang), sin(ang)) * (s * 0.95 if k % 2 == 0 else s * 0.38))
			draw_colored_polygon(pts, col)
		"kind":    # a heart
			draw_circle(c + Vector2(-s * 0.36, -s * 0.18), s * 0.42, col, true, -1.0, true)
			draw_circle(c + Vector2(s * 0.36, -s * 0.18), s * 0.42, col, true, -1.0, true)
			draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.78, -s * 0.05), c + Vector2(s * 0.78, -s * 0.05), c + Vector2(0, s * 0.8)]), col)
		"cheeky":  # a grin and a wink
			draw_arc(c + Vector2(0, s * 0.05), s * 0.6, 0.25, PI - 0.25, 10, col, 2.5, true)
			draw_line(c + Vector2(-s * 0.5, -s * 0.38), c + Vector2(-s * 0.15, -s * 0.38), col, 2.5, true)
			draw_circle(c + Vector2(s * 0.32, -s * 0.38), s * 0.15, col, true, -1.0, true)
		"quiet":   # three dots
			for k in 3: draw_circle(c + Vector2((k - 1) * s * 0.55, 0), s * 0.17, col, true, -1.0, true)
		"firm":    # a fist-like block
			draw_rect(Rect2(c - Vector2(s * 0.5, s * 0.45), Vector2(s, s * 0.9)), col)
		"bye":     # an arrow out
			draw_line(c + Vector2(-s * 0.6, 0), c + Vector2(s * 0.5, 0), col, 2.5, true)
			draw_colored_polygon(PackedVector2Array([c + Vector2(s * 0.75, 0), c + Vector2(s * 0.2, -s * 0.45), c + Vector2(s * 0.2, s * 0.45)]), col)
		_:         # curious: a question mark
			var fz := int(s * 2.1)
			var w := font_b.get_string_size("?", HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x
			draw_string(font_b, c + Vector2(-w * 0.5, s * 0.75), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, fz, col)
