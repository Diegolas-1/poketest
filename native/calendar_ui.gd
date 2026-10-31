extends CanvasLayer
# The calendar (clock.gd open_calendar: a tap on the clock, or the island menu's
# Calendar row), in the UI kit's look (ui/README.md): a white panel with the
# month as a grid of days (today in red, event days marked in their colour,
# Saturdays' market a small dot), the season and the moon's phase, and the
# chosen day's events at the side. The game pauses while it is open.
# Pad and keys: the d-pad or stick moves the day (held: repeats, UIInput.Nav),
# L / R (Q / E) the month, B / Esc closes. Touch: tap a day, the arrows, or
# outside the panel to close.
#
#   open()  close()  is_open()   view_y, view_m (the month shown), sel (its day picked)

var clock: GameClock
var root: Control
var dim: ColorRect
var frame: Control
var view_y := 1
var view_m := 4
var sel := 1                  # the date picked in the month shown
var nav := UIInput.Nav.new()
var was_paused := false
var safe_override := Rect2()
var _hits: Array = []         # [Rect2, kind, value] (frame space)
var _t := 0.0

const KIND_COL := {"market": UITheme.ORANGE, "holiday": UITheme.RED, "birthday": UITheme.PURPLE, "league": UITheme.BLUE}
const SEASON_COL := {"spring": Color("f08cb4"), "summer": UITheme.GREEN, "autumn": UITheme.ORANGE, "winter": UITheme.SKY}
const DOW := ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

func _ready() -> void:
	layer = 91
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	dim = UITheme.scrim()
	dim.gui_input.connect(func(e: InputEvent):
		if (e is InputEventMouseButton or e is InputEventScreenTouch) and e.pressed: close())
	root.add_child(dim)
	frame = Control.new()
	frame.mouse_filter = Control.MOUSE_FILTER_STOP
	frame.draw.connect(_draw_frame)
	frame.gui_input.connect(_frame_input)
	root.add_child(frame)

func is_open() -> bool: return root != null and root.visible

func open() -> void:
	if is_open(): return
	was_paused = get_tree().paused
	get_tree().paused = true
	view_y = clock.year(); view_m = clock.month(); sel = clock.date()
	nav.reset()
	root.visible = true
	Sfx.ui("ui_menu_open")
	_layout()
	var to := frame.position
	frame.position = to + Vector2(0, 40)
	frame.modulate.a = 0.0
	dim.modulate.a = 0.0
	var tw := frame.create_tween().set_parallel(true)
	tw.tween_property(frame, "position", to, UITheme.BASE).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(frame, "modulate:a", 1.0, UITheme.FAST)
	tw.tween_property(dim, "modulate:a", 1.0, UITheme.BASE)

func close() -> void:
	if not is_open(): return
	root.visible = false
	Sfx.ui("ui_menu_close")
	get_tree().paused = was_paused

func _layout() -> void:
	var sr := UITheme.safe_rect(root, safe_override)
	var w := minf(1000.0, sr.size.x - 32.0)
	var h := minf(sr.size.y - 32.0, 620.0)
	frame.size = Vector2(w, h)
	frame.position = Vector2(sr.position.x + (sr.size.x - w) * 0.5, sr.position.y + (sr.size.y - h) * 0.5)
	frame.queue_redraw()

func _process(dt: float) -> void:
	if not is_open(): return
	_t += dt
	var d := nav.tick(dt)
	if d != Vector2i.ZERO: _move(d)

# ---------- input ----------
func _input(e: InputEvent) -> void:
	if not is_open(): return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		close(); get_viewport().set_input_as_handled(); return
	var lr := 0
	if e is InputEventJoypadButton and e.pressed and e.button_index in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		lr = 1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1
	elif e is InputEventKey and e.pressed and not e.echo and e.physical_keycode in [KEY_Q, KEY_E]:
		lr = 1 if e.physical_keycode == KEY_E else -1
	if lr != 0:
		_month(lr); get_viewport().set_input_as_handled(); return
	var d := nav.event(e)
	if d != Vector2i.ZERO:
		_move(d); get_viewport().set_input_as_handled(); return
	if nav.swallow(e): get_viewport().set_input_as_handled(); return
	if (e is InputEventKey or e is InputEventJoypadButton) and e.is_action_pressed("use"):
		# A on today's month: back to today
		view_y = clock.year(); view_m = clock.month(); sel = clock.date()
		Sfx.ui("ui_select")
		frame.queue_redraw()
		get_viewport().set_input_as_handled()

func _frame_input(e: InputEvent) -> void:
	var p := Vector2.INF
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: p = e.position
	elif e is InputEventScreenTouch and e.pressed: p = e.position
	if p == Vector2.INF: return
	for h in _hits:
		if (h[0] as Rect2).has_point(p):
			match h[1]:
				"day":
					sel = int(h[2]); Sfx.ui("ui_select")
				"month": _month(int(h[2]))
				"close": close()
			frame.queue_redraw()
			frame.accept_event()
			return

# the picked day steps by d (x: a day, y: a week), into the next or last month
func _move(d: Vector2i) -> void:
	var day := GameCalendar.to_day(view_y, view_m, sel) + d.x + d.y * 7
	var c := GameCalendar.from_day(day)
	view_y = int(c.year); view_m = int(c.month); sel = int(c.date)
	Sfx.ui("ui_hover")
	frame.queue_redraw()

func _month(d: int) -> void:
	view_m += d
	if view_m > 12: view_m = 1; view_y += 1
	elif view_m < 1: view_m = 12; view_y -= 1
	sel = mini(sel, GameCalendar.month_len(view_y, view_m))
	Sfx.ui("ui_tab")
	frame.queue_redraw()

# ---------- drawing ----------
func _weekday_of(day: int) -> int:
	return (day - 1 + GameClock.FIRST_WEEKDAY) % 7 if day >= 1 else ((day - 1 + GameClock.FIRST_WEEKDAY) % 7 + 7) % 7

func _draw_frame() -> void:
	_hits.clear()
	var w := frame.size.x
	var h := frame.size.y
	var f := frame
	UITheme.panel(f, Rect2(0, 0, w, h), UITheme.SKY, 1.0, 0.0, 26.0, 8.0)
	var pad := 30.0
	# the title: the month and the year, the season chip
	var title: String = GameCalendar.MONTHS[view_m - 1].to_upper()
	var tw := UITheme.text(f, Vector2(pad, 58), title, "display", UITheme.fs("title"), UITheme.INK)
	UITheme.text(f, Vector2(pad + tw + 14.0, 58), "YEAR %d" % view_y, "heading", 22, UITheme.INK_SOFT)
	var season := GameCalendar.season_of(view_m)
	var sx := pad + tw + 14.0 + UITheme.text_w("YEAR %d" % view_y, "heading", 22) + 16.0
	UITheme.chip(f, Vector2(sx, 39), GameCalendar.SEASON_LABEL[season].to_upper(), SEASON_COL[season], Color.WHITE, 15, 24.0)
	# the month arrows and the close button
	var ax := w - pad - 64.0 - 10.0
	for k in 2:
		var r := Rect2(ax - 140.0 + k * 70.0, 26, 60, 44)
		UITheme.para(f, r, Color(UITheme.INK, 0.08))
		var cc := r.get_center()
		var dir := -1.0 if k == 0 else 1.0
		f.draw_colored_polygon(PackedVector2Array([cc + Vector2(-7 * dir, -9), cc + Vector2(8 * dir, 0), cc + Vector2(-7 * dir, 9)]), UITheme.INK)
		_hits.append([UITheme.touch_rect(f, r), "month", -1 if k == 0 else 1])
		if UIInput.device != "touch": UITheme.glyph(f, cc + Vector2(0, 34), "tab_l" if k == 0 else "tab_r", 22.0)
	var cr := Rect2(w - pad - 60.0, 24, 60, 48)
	UITheme.para(f, cr, UITheme.RED)
	UITheme.icon(f, "close", cr.get_center(), 11.0, Color.WHITE)
	_hits.append([UITheme.touch_rect(f, cr), "close", 0])
	# the grid
	var gx := pad
	var gy := 112.0
	var gw := (w - pad * 2.0) * 0.6
	var cw := gw / 7.0
	var first := GameCalendar.to_day(view_y, view_m, 1)
	var lead := _weekday_of(first)   # Monday first
	var n := GameCalendar.month_len(view_y, view_m)
	var rows := int(ceil((lead + n) / 7.0))
	var ch := minf(cw * 0.9, (h - gy - 46.0) / rows)
	for i in 7:
		UITheme.text(f, Vector2(gx + cw * (i + 0.5), gy - 8.0), DOW[i], "label", 15, UITheme.ORANGE if i == 5 else (UITheme.RED if i == 6 else UITheme.INK_SOFT), 1)
	var today := clock.day()
	for dd in range(1, n + 1):
		var slot := lead + dd - 1
		var r := Rect2(gx + (slot % 7) * cw + 3.0, gy + (slot / 7) * ch + 3.0, cw - 6.0, ch - 6.0)
		var day := first + dd - 1
		var c := GameCalendar.from_day(day)
		var wd: String = GameClock.WEEK[_weekday_of(day)]
		var evs := GameCalendar.events_on(int(c.year), int(c.month), int(c.date), wd)
		var is_today := day == today
		var is_sel := dd == sel
		var past := day < today
		var bg := Color(UITheme.INK, 0.035 if not past else 0.02)
		if is_today: bg = UITheme.RED
		f.draw_colored_polygon(UITheme.chamfer_points(r, 7.0), bg)
		# an event day: a band of its colour along the cell's foot
		var big := evs.filter(func(e): return String(e.get("kind", "")) != "market")
		if not big.is_empty():
			var kc: Color = KIND_COL.get(String(big[0].get("kind", "")), UITheme.SKY)
			f.draw_rect(Rect2(r.position.x + 6.0, r.end.y - 9.0, r.size.x - 12.0, 5.0), kc if not is_today else Color.WHITE)
		elif not evs.is_empty():
			f.draw_circle(Vector2(r.end.x - 11.0, r.end.y - 11.0), 4.0, UITheme.ORANGE if not is_today else Color.WHITE, true, -1.0, true)
		var tc := Color.WHITE if is_today else (Color(UITheme.INK, 0.45) if past else UITheme.INK)
		UITheme.text(f, Vector2(r.position.x + 10.0, r.position.y + 28.0), str(dd), "number", 24, tc)
		# the moon on the days the full moon or the new moon falls
		var p0 := GameCalendar.moon_phase(float(day))
		var p1 := GameCalendar.moon_phase(float(day) + 1.0)
		if (p0 <= 0.5 and p1 > 0.5) or p1 < p0:
			_moon(f, Vector2(r.end.x - 14.0, r.position.y + 15.0), 7.0, 0.5 if p1 > 0.5 and p0 <= 0.5 else 0.0, Color.WHITE if is_today else UITheme.INK)
		if is_sel:
			var pts := UITheme.chamfer_points(r.grow(2.0), 8.0)
			pts.append(pts[0])
			f.draw_polyline(pts, UITheme.YELLOW, 4.0, true)
		_hits.append([r, "day", dd])
	# the side: the picked day, its moon and events, then the month's events
	var ix := gx + gw + 30.0
	var iw := w - ix - pad
	f.draw_line(Vector2(ix - 15.0, gy - 26.0), Vector2(ix - 15.0, h - 30.0), Color(UITheme.INK, 0.1), 1.5)
	var sday := GameCalendar.to_day(view_y, view_m, sel)
	var swd: String = GameClock.WEEK[_weekday_of(sday)]
	var label := "%s %d %s" % [GameClock.WEEK_LABEL[swd], sel, GameCalendar.MONTH_SHORT[view_m - 1]]
	var y := gy + 4.0
	UITheme.text(f, Vector2(ix, y + 20.0), label.to_upper(), "heading", 30, UITheme.INK)
	if sday == today:
		UITheme.chip(f, Vector2(ix + UITheme.text_w(label.to_upper(), "heading", 30) + 12.0, y), "TODAY", UITheme.RED, Color.WHITE, 14, 22.0)
	y += 46.0
	var ph2 := GameCalendar.moon_phase(float(sday) + 0.9)   # the night's moon
	_moon(f, Vector2(ix + 16.0, y + 4.0), 15.0, ph2, UITheme.INK)
	UITheme.text_mid(f, Vector2(ix + 42.0, y + 4.0), GameCalendar.moon_name(ph2), "body_bold", 20, UITheme.INK)
	y += 34.0
	var hrs := GameCalendar.sun_hours(GameCalendar.doy_of(view_y, view_m, sel))
	UITheme.icon(f, "sun", Vector2(ix + 16.0, y + 4.0), 11.0, UITheme.ORANGE)
	UITheme.text_mid(f, Vector2(ix + 42.0, y + 4.0), "Sunrise %s, sunset %s" % [_hm(hrs.x), _hm(hrs.y)], "body", 18, UITheme.INK_SOFT)
	y += 40.0
	var sevs := GameCalendar.events_on(view_y, view_m, sel, swd)
	if sevs.is_empty():
		UITheme.text(f, Vector2(ix, y + 18.0), "Nothing on. A day for the tall grass.", "body", 18, UITheme.INK_SOFT, 0, iw)
		y += 34.0
	for e in sevs:
		var kc2: Color = KIND_COL.get(String(e.get("kind", "")), UITheme.SKY)
		f.draw_rect(Rect2(ix, y + 2.0, 6.0, 26.0), kc2)
		UITheme.text(f, Vector2(ix + 16.0, y + 22.0), String(e.get("name", "")), "body_bold", 20, UITheme.INK, 0, iw - 16.0)
		y += 34.0
	# this month's events, in date order
	y = maxf(y + 10.0, gy + 230.0)
	if y < h - 70.0:
		UITheme.text(f, Vector2(ix, y + 16.0), "THIS MONTH", "label", 16, UITheme.INK_SOFT)
		y += 28.0
		var seen := {}
		for dd in range(1, n + 1):
			var c2 := GameCalendar.from_day(first + dd - 1)
			for e in GameCalendar.events_on(view_y, view_m, dd, GameClock.WEEK[_weekday_of(first + dd - 1)]):
				if e.has("weekly") or seen.has(e.id): continue
				seen[e.id] = true
				if y > h - 46.0: break
				var kc3: Color = KIND_COL.get(String(e.get("kind", "")), UITheme.SKY)
				UITheme.text(f, Vector2(ix, y + 18.0), "%d" % int(c2.date), "number", 20, kc3)
				UITheme.text(f, Vector2(ix + 40.0, y + 18.0), String(e.get("name", "")), "body", 18, UITheme.INK, 0, iw - 40.0)
				y += 28.0
		if seen.is_empty():
			UITheme.text(f, Vector2(ix, y + 16.0), "Market every Saturday in the square.", "body", 17, UITheme.INK_SOFT, 0, iw)
	# the hint along the foot
	var hint := "Tap a day" if UIInput.device == "touch" else "Move to pick a day.  A: today"
	UITheme.text(f, Vector2(pad, h - 18.0), hint, "body", 16, UITheme.INK_SOFT)

func _hm(hh: float) -> String:
	var m := int(round(hh * 60.0))
	var h24 := (m / 60) % 24
	var h12 := h24 % 12
	if h12 == 0: h12 = 12
	return "%d:%02d %s" % [h12, m % 60, "AM" if h24 < 12 else "PM"]

# a little moon: its lit part (pale gold) by the phase (0 new .. 0.5 full), col its rim
func _moon(ci: CanvasItem, c: Vector2, r: float, ph: float, col: Color) -> void:
	ci.draw_circle(c, r, Color(UITheme.INK, 0.55), true, -1.0, true)
	var k := cos(ph * TAU)    # 1 new .. -1 full
	var pts := PackedVector2Array()
	var side := 1.0 if ph < 0.5 else -1.0
	for i in 17:
		var t := -PI * 0.5 + PI * i / 16.0
		pts.append(c + Vector2(cos(t) * r * side, sin(t) * r))
	for i in 17:
		var t2 := PI * 0.5 - PI * i / 16.0
		pts.append(c + Vector2(cos(t2) * r * side * k, sin(t2) * r))
	if k < 0.97:   # (a new moon draws only its dark disc)
		ci.draw_colored_polygon(pts, Color("ffe7a0"))
	ci.draw_arc(c, r, 0.0, TAU, 24, Color(col, 0.6), 1.5, true)
