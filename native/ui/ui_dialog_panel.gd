class_name UIDialogPanel
extends Control
# The dialog panel: a speaker nameplate (name, role, colour) on a crisp light
# panel, the line typed out, an advance mark with the device's button glyph,
# and an optional choice list (UIChoiceList) above it. Self-contained: it
# handles its own input when input_enabled (A / Enter / tap to advance,
# up / down / number keys / tap for choices) and slides in and out.
# DialogBox (dialog.gd) draws its box with the same draw_box(), so the
# world's text box and a conversation look the same.
#
#   set_speaker(name, role := "", color := Color(0, 0, 0, 0))   colour 0 = from the name
#   show_line(text, speaker := "")    types it out (chars_per_sec); "NAME: text" also sets the speaker
#   skip()                            finishes the line at once
#   is_typing() -> bool
#   show_choices(choices)             Array of String or {text, tag?, disabled?}; picks emit choice_picked
#   clear_choices()
#   slide_in()  slide_out()           (slide_out emits closed when done)
#   press()                           the advance button: skip, else advanced (or pick the selected choice)
#   anchor_rect: Rect2                where it sits (default: bottom centre of the safe area)
#
# signals: advanced, line_finished, typed(index) (every letter typed, for voice blips),
#          choice_picked(index, choice), choice_hovered(index), closed

signal advanced
signal line_finished
signal typed(index: int)
signal choice_picked(index: int, choice: Variant)
signal choice_hovered(index: int)
signal closed

var speaker := ""
var role := ""
var accent := Color(0, 0, 0, 0)
var line := ""
var shown := 0.0
var chars_per_sec := 55.0
var input_enabled := true
var anchor_rect := Rect2()      # empty = automatic
var safe_override := Rect2()
var choices: UIChoiceList
var choices_left := false       # the choice list in the screen's left two thirds (Ash on the right third line), else the right two

var _t := 0.0
var _in := 0.0                  # 0 hidden .. 1 shown
var _target := 0.0
var _finished := true
var _last_typed := -1
var _tap_frame := -1

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	choices = UIChoiceList.new()
	choices.input_enabled = false   # the panel routes input to it
	choices.picked.connect(func(i, c): choice_picked.emit(i, c))
	choices.hovered.connect(func(i): choice_hovered.emit(i))
	add_child(choices)

# ---------- API ----------
func set_speaker(n: String, r := "", col := Color(0, 0, 0, 0)) -> void:
	speaker = n; role = r; accent = col
	queue_redraw()

func show_line(text: String, who := "") -> void:
	var sp := split_speaker(text)
	if who != "": speaker = who
	elif sp[0] != "": speaker = sp[0]
	line = sp[1]
	shown = 0.0
	_finished = line.is_empty()
	_last_typed = -1
	if _target < 1.0: slide_in()
	queue_redraw()

func skip() -> void:
	shown = line.length()

func is_typing() -> bool: return shown < line.length()

func show_choices(list: Array) -> void:
	choices.set_choices(list)
	_layout_choices()
	queue_redraw()

func clear_choices() -> void:
	choices.set_choices([])

func slide_in() -> void:
	_target = 1.0
	visible = true
	set_process(true)

func slide_out() -> void:
	_target = 0.0
	set_process(true)

func press() -> void:
	if is_typing(): skip(); return
	if choices.count() > 0:
		choices.pick(choices.selected)
		return
	advanced.emit()

# "OAK: Hello" -> ["OAK", "Hello"] (an uppercase tag before ": "); otherwise ["", line]
static func split_speaker(s: String) -> Array:
	var k := s.find(": ")
	if k > 0 and k <= 18:
		var n := s.substr(0, k)
		if n == n.to_upper() and n != n.to_lower() and not n.begins_with("("): return [n, s.substr(k + 2)]
	return ["", s]

# ---------- input ----------
func _unhandled_input(e: InputEvent) -> void:
	if not input_enabled or _target < 1.0 or not visible: return
	if choices.count() > 0 and not is_typing():
		if choices.handle(e):
			get_viewport().set_input_as_handled()
			return
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT)
	if tap and box_rect().grow(20).has_point(e.position) and (choices.count() == 0 or is_typing()):
		# a tap arrives twice (the touch and the mouse made from it, or the other way round)
		if Engine.get_process_frames() == _tap_frame: return
		_tap_frame = Engine.get_process_frames()
		press()
		get_viewport().set_input_as_handled()
	elif e.is_action_pressed("use") or e.is_action_pressed("ui_accept"):
		press()
		get_viewport().set_input_as_handled()

# ---------- every frame (only while typing or moving) ----------
func _process(dt: float) -> void:
	_t += dt
	var moving := absf(_in - _target) > 0.001
	if moving:
		_in = move_toward(_in, _target, dt / UITheme.BASE)
		if _in <= 0.0 and _target <= 0.0:
			visible = false
			closed.emit()
	if is_typing():
		shown = minf(float(line.length()), shown + dt * chars_per_sec)
		var k := int(shown) - 1
		if k != _last_typed and k >= 0:
			_last_typed = k
			typed.emit(k)
	if not _finished and not is_typing():
		_finished = true
		line_finished.emit()
	_layout_choices()
	queue_redraw()   # the advance mark bobs while it waits

func _layout_choices() -> void:
	var r := box_rect()
	var h := choices.content_height()
	# the two thirds of the screen Ash isn't on, clear of his shoulders on the third line
	var sr := UITheme.safe_rect(self, safe_override)
	var vw := get_viewport_rect().size.x
	var x0 := sr.position.x + 12.0 if choices_left else vw * 0.43
	var x1 := vw * 0.57 if choices_left else sr.end.x - 12.0
	choices.size = Vector2(x1 - x0, h)
	choices.position = Vector2(x0, r.position.y - h - 34.0)
	choices.modulate.a = UITheme.ease_out(_in)
	choices.visible = _in > 0.01 and not is_typing() and choices.count() > 0

# ---------- layout ----------
func box_rect() -> Rect2:
	if anchor_rect.size != Vector2.ZERO: return anchor_rect
	return default_rect(self, safe_override)

static func default_rect(ci: CanvasItem, override := Rect2()) -> Rect2:
	var sr := UITheme.safe_rect(ci, override)
	var w := minf(sr.size.x * 0.72, 1040.0)
	w = maxf(w, minf(sr.size.x - 32.0, 640.0))
	var h := 168.0
	return Rect2(sr.position.x + (sr.size.x - w) * 0.5, sr.end.y - h - 22.0, w, h)

func _draw() -> void:
	if _in <= 0.0: return
	var e := UITheme.ease_back(_in, 1.2)
	var r := box_rect()
	r.position.y += (1.0 - e) * 40.0
	var a := UITheme.ease_out(_in)
	draw_box(self, r, speaker, role, accent, line, int(shown), not is_typing() and choices.count() == 0, _t, a, 1.0 - e)

# ---------- the look (shared with DialogBox) ----------
const TEXT_SIZE := 30
const ROWS := 3

# the text size that fits text in 3 rows of the box's width (shrinks for a long line)
static var _fit := {}
static func fit_size(text: String, box_w: float) -> int:
	var key := "%d|%s" % [int(box_w), text]
	if _fit.has(key): return _fit[key]
	var sz := TEXT_SIZE
	while sz > 20 and UITheme.wrap(text, "body", sz, box_w - 64.0).size() > ROWS: sz -= 2
	if _fit.size() > 64: _fit.clear()
	_fit[key] = sz
	return sz

static var _rows := {}
static func rows_for(text: String, sz: int, w: float) -> PackedStringArray:
	var key := "%d|%d|%s" % [sz, int(w), text]
	if _rows.has(key): return _rows[key]
	var r := UITheme.wrap(text, "body", sz, w)
	if _rows.size() > 64: _rows.clear()
	_rows[key] = r
	return r

# r = the panel; text = the whole line, shown_chars of it typed so far (wrapped as
# the whole line, so words never jump rows); done = draw the advance mark
static func draw_box(ci: CanvasItem, r: Rect2, who: String, who_role: String, col: Color, text: String, shown_chars: int, done: bool, t: float, a := 1.0, skew_in := 0.0) -> void:
	var accent_c := col if col.a > 0.0 else UITheme.speaker_color(who)
	var skew := 0.0 + skew_in * 0.25
	# panel body
	UITheme.panel(ci, r, accent_c, a, skew, 20.0, 9.0)
	# a thin rule under the top edge
	ci.draw_line(Vector2(r.position.x + 24.0, r.position.y + 7.0), Vector2(r.end.x - 34.0, r.position.y + 7.0), Color(UITheme.INK, 0.08 * a), 1.0)
	# nameplate
	if who != "":
		var nsz := 26
		var nm := who.to_upper()
		var nw := UITheme.text_w(nm, "display", nsz) + 44.0
		var nh := 40.0
		var np := Rect2(r.position.x + 18.0, r.position.y - nh * 0.62, nw, nh)
		var pts := UITheme.para_points(np, UITheme.SKEW)
		UITheme.shadow(ci, pts, a, Vector2(0, 3))
		UITheme.fill(ci, pts, Color(UITheme.INK, a))
		UITheme.para(ci, Rect2(np.position.x - 2.0, np.position.y, 9.0, nh), Color(accent_c, a))
		UITheme.text_mid(ci, Vector2(np.position.x + 22.0, np.get_center().y), nm, "display", nsz, Color(UITheme.TEXT, a))
		if who_role != "":
			var rl := who_role.to_upper()
			UITheme.chip(ci, Vector2(np.end.x + 10.0, np.position.y + 9.0), rl, Color(accent_c, 1.0), UITheme.INK if accent_c == UITheme.YELLOW else Color.WHITE, 14, 22.0, a)
	# text
	var sz := fit_size(text, r.size.x)
	var rows := rows_for(text, sz, r.size.x - 64.0)
	var lh := sz * 1.28
	var ty := r.position.y + (r.size.y - lh * ROWS) * 0.5 + sz * 0.98 + (6.0 if who != "" else 0.0)
	var left := shown_chars
	for i in mini(ROWS + 1, rows.size()):
		if left <= 0: break
		var row: String = rows[i]
		UITheme.text(ci, Vector2(r.position.x + 34.0, ty + i * lh), row.substr(0, left), "body", sz, Color(UITheme.INK, a))
		left -= row.length() + 1
	# the advance mark: the button glyph and a bobbing red chevron
	if done:
		var bob := (sin(t * 6.0) * 0.5 + 0.5) * 4.0
		var c := Vector2(r.end.x - 40.0, r.end.y - 28.0)
		UITheme.chevron_down(ci, c + Vector2(0, bob - 2.0), 20.0, Color(UITheme.RED, a))
		UITheme.glyph(ci, c + Vector2(-34.0, 0), "use", 26.0, a)

static func _ball_mark(ci: CanvasItem, c: Vector2, r: float, col: Color) -> void:
	ci.draw_arc(c, r * 0.5 - r * 0.06, 0.0, TAU, 40, col, r * 0.12, true)
	ci.draw_line(c + Vector2(-r * 0.5, 0), c + Vector2(r * 0.5, 0), col, r * 0.12)
	ci.draw_circle(c, r * 0.16, col, true, -1.0, true)
