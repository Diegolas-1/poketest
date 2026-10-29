extends Control
# The formal opening's screen (arena/arena_opening.gd), in the UI kit's style:
# cinematic letterbox bars, the title card (OFFICIAL BATTLE, ASH vs BROCK), the
# referee's caption, the ten-pace count, the coin call (two big buttons: HEADS,
# TAILS), the coin's result, and SKIP.
#   signals: skip(), called(face)

signal skip
signal called(face: String)

var names := ["Ash", "Trainer"]
var sub := ""
var t := 0.0
var _bars := 0.0
var _bars_on := false
var _title := -1.0           # shown since (t), or -1
var _title_off := -1.0
var _cap := {}
var _count := {}
var _ask := -1.0
var _ask_sel := 0
var _ask_auto := ""
var _ask_done := ""
var _ask_done_t := -1.0
var _coin := {}
var _tap := -1

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func bars(on: bool) -> void: _bars_on = on
func title_card(on: bool) -> void:
	if on: _title = t; _title_off = -1.0
	else: _title_off = t
func caption(who: String, text: String) -> void: _cap = {"who": who, "text": text, "t": t}
func count(n: int) -> void: _count = {"n": n, "t": t}
func ask_call(auto := "") -> void:
	_ask = t; _ask_auto = auto; _ask_done = ""; _ask_sel = 0
func ask_call_done(face: String) -> void:
	_ask_done = face; _ask_done_t = t
func coin_result(face: String, winner: String) -> void: _coin = {"face": face, "who": winner, "t": t}
func coin_result_off() -> void: _coin = {}

func S() -> Rect2: return UITheme.safe_rect(self)

func _skip_rect() -> Rect2:
	var s := S()
	return Rect2(s.end.x - 170.0, s.position.y + _bar_h() + 14.0, 150.0, 44.0)

func _bar_h() -> float: return get_viewport_rect().size.y * 0.085 * UITheme.ease_out(_bars)

func _call_rect(i: int) -> Rect2:
	var s := S()
	var wd := 300.0
	var h := 92.0
	var cx := s.get_center().x
	return Rect2(cx - wd - 18.0 + i * (wd + 36.0), s.end.y - _bar_h() - h - 70.0, wd, h)

func _process(dt: float) -> void:
	t += dt
	_bars = clampf(_bars + (dt / 0.45 if _bars_on else -dt / 0.35), 0.0, 1.0)
	# a scripted call (renders): the cursor goes to it, then A
	if _ask >= 0.0 and _ask_done == "" and _ask_auto != "":
		if t - _ask > 0.7: _ask_sel = 0 if _ask_auto == "heads" else 1
		if t - _ask > 1.5: _pick(_ask_sel)
	queue_redraw()

func _input(e: InputEvent) -> void:
	var asking := _ask >= 0.0 and _ask_done == ""
	if asking:
		if e.is_action_pressed("ui_left") or e.is_action_pressed("move_left"): _ask_sel = 0; Sfx.ui("ui_cursor"); _h()
		elif e.is_action_pressed("ui_right") or e.is_action_pressed("move_right"): _ask_sel = 1; Sfx.ui("ui_cursor"); _h()
		elif e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): _pick(_ask_sel); _h()
		elif e is InputEventKey and e.pressed and e.physical_keycode == KEY_H: _pick(0); _h()
		elif e is InputEventKey and e.pressed and e.physical_keycode == KEY_T: _pick(1); _h()
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		skip.emit(); _h(); return
	var pos := Vector2.INF
	if e is InputEventScreenTouch and e.pressed: pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	if pos == Vector2.INF or Engine.get_process_frames() == _tap: return
	_tap = Engine.get_process_frames()
	var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
	if UITheme.touch_rect(self, _skip_rect()).has_point(lp): skip.emit(); _h(); return
	if asking:
		for i in 2:
			if UITheme.touch_rect(self, _call_rect(i)).has_point(lp): _pick(i); _h(); return

func _h() -> void: get_viewport().set_input_as_handled()

func _pick(i: int) -> void:
	if _ask_done != "": return
	_ask_sel = i
	called.emit("heads" if i == 0 else "tails")

func _draw() -> void:
	var vs := get_viewport_rect().size
	var s := S()
	var bh := _bar_h()
	if bh > 0.5:
		draw_rect(Rect2(0, 0, vs.x, bh), Color(0.02, 0.025, 0.05, 1.0))
		draw_rect(Rect2(0, vs.y - bh, vs.x, bh), Color(0.02, 0.025, 0.05, 1.0))
		draw_rect(Rect2(0, bh - 3.0, vs.x * UITheme.ease_out(_bars), 3.0), Color(UITheme.RED, 0.9))
	# SKIP
	var sr := _skip_rect()
	var sa := clampf(_bars * 1.5, 0.0, 1.0)
	UITheme.plate(self, sr, sa * 0.9, UITheme.SKEW, UITheme.PLATE, 8)
	var gw := 0.0
	if UIInput.device != "touch": gw = UITheme.glyph(self, Vector2(sr.position.x + 26.0, sr.get_center().y), "back", 24.0, sa) + 4.0
	UITheme.text_mid(self, Vector2(sr.position.x + 18.0 + gw, sr.get_center().y), "SKIP", "display", 24, Color(UITheme.TEXT, sa))
	UITheme.chevrons(self, Vector2(sr.end.x - 34.0, sr.get_center().y - 9.0), 18.0, Color(UITheme.YELLOW, sa), 2)
	# the title card: OFFICIAL BATTLE, the two names
	if _title >= 0.0:
		var k := UITheme.ease_out_expo((t - _title) / 0.5)
		if _title_off >= 0.0: k *= 1.0 - UITheme.ease_in(clampf((t - _title_off) / 0.3, 0.0, 1.0))
		if k > 0.01:
			var r := Rect2(s.position.x + 40.0 - (1.0 - k) * 300.0, s.position.y + bh + 40.0, 620.0, 150.0)
			UITheme.panel(self, r, UITheme.RED, k)
			UITheme.text(self, r.position + Vector2(26, 40), "OFFICIAL BATTLE", "label", 20, Color(UITheme.RED, k))
			var x := r.position.x + 26.0
			x += UITheme.text(self, Vector2(x, r.position.y + 100), String(names[0]).to_upper(), "display", 56, Color(UITheme.INK, k)) + 18.0
			x += UITheme.text(self, Vector2(x, r.position.y + 96), "VS", "heading", 32, Color(UITheme.RED, k)) + 18.0
			UITheme.text(self, Vector2(x, r.position.y + 100), String(names[1]).to_upper(), "display", 56, Color(UITheme.INK, k))
			if sub != "": UITheme.text(self, r.position + Vector2(26, 132), sub.to_upper(), "label", 17, Color(UITheme.INK_SOFT, k))
	# the caption: who speaks, the line (above the lower bar)
	if not _cap.is_empty():
		var age := t - float(_cap.t)
		var a := UITheme.ease_out(age / 0.2) * (1.0 - clampf((age - 3.4) / 0.4, 0.0, 1.0))
		if a > 0.01:
			var txt := String(_cap.text)
			var tw := UITheme.text_w(txt, "body_bold", 26)
			var wd := minf(tw + 60.0, s.size.x - 80.0)
			var r := Rect2(s.get_center().x - wd * 0.5, vs.y - bh - 86.0, wd, 56.0)
			if _ask >= 0.0 and _ask_done == "": r.position.y -= 170.0
			UITheme.plate(self, r, 0.9 * a, UITheme.SKEW * 0.3, UITheme.PLATE, 10)
			UITheme.chip(self, r.position + Vector2(18, -12), String(_cap.who), Color(UITheme.YELLOW, a), UITheme.INK, 13, 22.0, a)
			UITheme.text_mid(self, Vector2(r.get_center().x, r.get_center().y + 2.0), txt, "body_bold", 26, Color(UITheme.TEXT, a), 1)
	# the count: a big number slammed in, a ring
	if not _count.is_empty():
		var age := t - float(_count.t)
		var n := int(_count.n)
		var a := clampf(1.0 - (age - 0.35) / 0.25, 0.0, 1.0)
		if a > 0.01:
			var sc := 1.0 + 0.6 * (1.0 - UITheme.ease_out_expo(age / 0.18))
			var c := Vector2(s.get_center().x, s.position.y + bh + 120.0)
			draw_arc(c, 54.0 + age * 90.0, 0.0, TAU, 48, Color(UITheme.YELLOW, 0.6 * a), 4.0, true)
			var col := UITheme.RED if n == 10 else UITheme.WHITE
			draw_set_transform(c, 0.0, Vector2.ONE * sc)
			UITheme.text_mid(self, Vector2.ZERO, str(n), "display", 120, Color(col, a), 1, 8, Color(0, 0, 0, 0.5 * a))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			UITheme.text_mid(self, c + Vector2(0, 80), "PACES" if n == 10 else "", "label", 22, Color(UITheme.TEXT, a), 1, 4)
	# the call
	if _ask >= 0.0:
		var age := t - _ask
		var k := UITheme.ease_out_expo(age / 0.35)
		if _ask_done != "": k *= 1.0 - clampf((t - _ask_done_t - 0.5) / 0.3, 0.0, 1.0)
		if k > 0.01:
			UITheme.text_mid(self, Vector2(s.get_center().x, _call_rect(0).position.y - 30.0), "CALL IT!", "display", 40, Color(UITheme.YELLOW, k), 1, 6)
			for i in 2:
				var r := _call_rect(i)
				r.position.y += (1.0 - k) * 80.0
				var on := i == _ask_sel
				var chosen := _ask_done == ("heads" if i == 0 else "tails")
				var a := k * (0.45 if _ask_done != "" and not chosen else 1.0)
				var pts := UITheme.para_points(r)
				UITheme.shadow(self, pts, a, Vector2(0, 6))
				if on or chosen: UITheme.fill_v(self, pts, Color(UITheme.WHITE, a), Color(UITheme.PAPER, a))
				else: UITheme.fill(self, pts, Color(UITheme.PLATE_HI, a))
				UITheme.accent_bar(self, r, Color(UITheme.YELLOW if i == 0 else UITheme.SKY, a), a, UITheme.SKEW, 10.0 if on else 6.0)
				var ic := Vector2(r.position.x + 58.0, r.get_center().y)
				_coin_icon(ic, 26.0, i == 0, a)
				UITheme.text_mid(self, Vector2(r.position.x + 100.0, r.get_center().y), "HEADS" if i == 0 else "TAILS", "display", 48, Color(UITheme.INK if on or chosen else UITheme.TEXT, a))
				if on and UIInput.device != "touch" and _ask_done == "": UITheme.glyph(self, Vector2(r.end.x - 34.0, r.get_center().y), "use", 30.0, a)
	# the result
	if not _coin.is_empty():
		var age := t - float(_coin.t)
		var k := UITheme.ease_back(clampf(age / 0.4, 0.0, 1.0), 1.6)
		var c := Vector2(s.get_center().x, s.position.y + bh + 110.0)
		draw_set_transform(c, 0.0, Vector2.ONE * k)
		UITheme.text_mid(self, Vector2.ZERO, String(_coin.face).to_upper() + "!", "display", 96, UITheme.YELLOW, 1, 8, Color(0, 0, 0, 0.5))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var a := clampf((age - 0.35) / 0.3, 0.0, 1.0)
		var line := "%s GOES FIRST" % String(_coin.who).to_upper()
		var tw := UITheme.text_w(line, "display", 36) + 60.0
		var r := Rect2(c.x - tw * 0.5, c.y + 56.0, tw, 52.0)
		UITheme.panel(self, r, UITheme.RED, a)
		UITheme.text_mid(self, Vector2(r.get_center().x, r.get_center().y + 2.0), line, "display", 36, Color(UITheme.INK, a), 1)

func _coin_icon(c: Vector2, r: float, heads: bool, a: float) -> void:
	draw_circle(c, r, Color(Color("e8b93a"), a), true, -1.0, true)
	draw_arc(c, r - 3.0, 0.0, TAU, 32, Color(Color("b8862a"), a), 2.5, true)
	if heads:
		PkmnHud.draw_ball(self, c, r * 0.58, "ok")
	else:
		var pts := PackedVector2Array()
		for k in 10:
			var an := -PI / 2.0 + TAU * k / 10.0
			pts.append(c + Vector2(cos(an), sin(an)) * r * (0.6 if k % 2 == 0 else 0.26))
		draw_colored_polygon(pts, Color(Color("fff1b0"), a))
