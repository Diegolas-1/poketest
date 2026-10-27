extends CanvasLayer
# The Dynamic Island as part of the HUD (made by main.gd). Nothing can be drawn
# in the island itself (a hole in the OLED panel, its touches go to iOS), but
# pure black drawn right against it reads as the same shape, so the game makes
# the island seem to grow:
#   - a compass while Ash is on the move: a black halo hugging the island and
#     a marker orbiting it toward the active quest's next person (else north),
#     with an N tick and the distance; fades out when idle, talking, indoors
#   - the menu's expansion point: a tap just beside the island (or on its
#     halo) grows a black panel out of it (quest log, settings, and "coming
#     soon" Pokédex, bag, map); the game pauses while it is open
#   - its satellites: the quest log button above it, the settings cog below,
#     black pills hugging its ends (quest_ui.gd place_btn, settings_menu.gd place_cog)
# The island's place: from the safe-area inset (11 pt from the edge, 37 x 126
# pt, centred) plus the Settings rows island_dx / dy / w / h, and the side
# (island_side; iOS reports equal insets on both sides in landscape, so the
# side cannot be read from them). "Show island outline" draws where the game
# thinks it is, for lining it up on the phone.
#   blocks(pos)  true when a touch at pos belongs to the island's HUD
#   PALLET_ISLAND=left|right (environment): pretend an iPhone 17 inset and draw
#   a black island on top (renders on the desktop)

const RED := Color("e8463c")
const GOLD := Color("ffd27a")
const CREAM := Color("fffdf6")
const EDGE_PT := 11.0          # island's distance from the screen edge, points
const ENTRIES := [["quests", "Quest log", true], ["settings", "Settings", true],
	["dex", "Pokédex", false], ["bag", "Bag", false], ["map", "Map", false]]

# the menu's rows: with the setting "Call the bike" on, a Bike row (bike/bike.gd menu_toggle)
# brings his bike to him outdoors, or puts it away when he is on it
func _entries() -> Array:
	if int(Settings.get_value("bike_call")) != 1: return ENTRIES
	var e := ENTRIES.duplicate()
	var on: bool = main != null and not main.indoors and main.cast != null and main.cast.bike != null
	var riding: bool = on and main.cast.bike.riding()
	e.insert(1, ["bike", "Get off" if riding else "Bike", on])
	return e

var main: Node
var side := 0              # -1 island on the left, 1 on the right, 0 none
var isle := Rect2()        # the island in viewport units
var safe := Rect2()        # the safe area in viewport units
var fake := ""
var font: FontVariation
var font_bold: FontVariation
var hud: Control
var top: Control
var _key := ""
var _placed := false
# compass
var alpha := 0.0
var ang := 0.0             # marker angle on screen (0 = straight ahead = up, + = right)
var north := 0.0
var goal_ang := 0.0
var has_goal := false
var goal_name := ""
var goal_dist := 0.0
var _goal_t := 0.0
var _drawn := Vector4(-9, -9, -9, -9)
var assist_on := false     # the bike's road assist is steering (a small road mark by the name)
# menu
var open := false
var p := 0.0
var pv := 0.0
var was_paused := false
var _pick := ""

func _ready() -> void:
	layer = 95   # over the HUD and the fps counter, under the settings window
	process_mode = Node.PROCESS_MODE_ALWAYS
	fake = OS.get_environment("PALLET_ISLAND").to_lower()
	if fake == "1": fake = "left"
	var ff: FontFile = load("res://fonts/PixelifySans.woff2")
	font = FontVariation.new(); font.base_font = ff; font.variation_opentype = {"wght": 600}
	font_bold = FontVariation.new(); font_bold.base_font = ff; font_bold.variation_opentype = {"wght": 700}
	hud = Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.draw.connect(_draw_hud)
	add_child(hud)
	# the fake island and the calibration outline, over every menu
	var tl := CanvasLayer.new()
	tl.layer = 127
	add_child(tl)
	top = Control.new()
	top.set_anchors_preset(Control.PRESET_FULL_RECT)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.draw.connect(_draw_top)
	tl.add_child(top)
	Settings.changed.connect(func(k, _v): if String(k).begins_with("island"): _key = "")

# ---------- where the island is ----------
func _geometry() -> void:
	var vs := hud.get_viewport_rect().size
	var ws := Vector2(DisplayServer.window_get_size())
	var sa := Rect2(DisplayServer.get_display_safe_area())
	var sc := DisplayServer.screen_get_scale()
	if fake != "":
		sc = 3.0
		var inset := 62.0 * sc
		sa = Rect2(inset if fake == "left" else 0.0, 0.0, ws.x - inset, ws.y)
	var on := int(Settings.get_value("island")) == 1
	var li := sa.position.x
	var ri := ws.x - sa.end.x
	var inset_px := maxf(li, ri)
	var key := "%s|%s|%s|%s|%s|%s|%s|%s|%s" % [vs, ws, sa, sc, on, Settings.get_value("island_dx"), Settings.get_value("island_dy"), Settings.get_value("island_w"), Settings.get_value("island_h")]
	key += String(Settings.get_value("island_side")) + fake
	if key == _key: return
	_key = key
	side = 0
	if on and ws.x > ws.y and sa.size.x > 0.0 and inset_px > 20.0 and sc > 0.0:
		if li > ri + 8.0: side = -1
		elif ri > li + 8.0: side = 1
		else: side = 1 if String(Settings.get_value("island_side")) == "right" else -1
		if fake != "": side = -1 if fake == "left" else 1
	var k := vs / ws if ws.x > 0 else Vector2.ONE
	safe = Rect2(sa.position * k, sa.size * k)
	if side != 0:
		var w := float(Settings.get_value("island_w")) * sc
		var h := float(Settings.get_value("island_h")) * sc
		var edge := minf(EDGE_PT * sc, inset_px * 0.18) + float(Settings.get_value("island_dx")) * sc
		var x := edge if side < 0 else ws.x - edge - w
		var y := (ws.y - h) * 0.5 + float(Settings.get_value("island_dy")) * sc
		isle = Rect2(Vector2(x, y) * k, Vector2(w, h) * k)
	_place()
	hud.queue_redraw(); top.queue_redraw()

# the satellites (quest log above, cog below), the perf overlay out of the way
func _place() -> void:
	var qui = _quest_ui()
	var cog_r := Rect2()
	var q_r := Rect2()
	var left := 16.0
	if side != 0:
		var w := isle.size.x
		var h := maxf(48.0, w * 0.86)
		var gap := 30.0   # room for the compass ring between the island and them
		q_r = Rect2(isle.position.x, isle.position.y - gap - h, w, h)
		cog_r = Rect2(isle.position.x, isle.end.y + gap, w, h)
		if side < 0: left = isle.end.x + 12.0
	if Settings.menu and Settings.menu.has_method("place_cog"): Settings.menu.place_cog(cog_r, left)
	if qui:
		if fake != "": qui.safe_override = safe
		qui.place_btn(q_r)
		_placed = true
	if main and main.cast and main.cast.cond_ui and fake != "": main.cast.cond_ui.safe_override = safe
	var ov = Settings.overlay
	if ov and ov.panel:
		ov.panel.position = Vector2(isle.end.x + 70.0 if side < 0 else 16.0, 84.0)
		ov.fps_label.position = Vector2(84.0 if side >= 0 else maxf(16.0, safe.position.x), 24.0)

func _quest_ui():
	if main == null or main.cast == null or main.cast.life == null or main.cast.life.quests == null: return null
	var u = main.cast.life.quests.ui
	return u if u and u.has_method("place_btn") else null

func halo() -> Rect2:
	return isle.grow(4.0)

func _tap_zone() -> Rect2:
	var hr := halo()
	var w := 60.0
	return Rect2(hr.end.x if side < 0 else hr.position.x - w, hr.position.y, w, hr.size.y).merge(hr)

func blocks(pos: Vector2) -> bool:
	if open or p > 0.02: return true
	return side != 0 and _tap_zone().has_point(pos)

# ---------- input ----------
func _input(e: InputEvent) -> void:
	if side == 0: return
	if open and (e.is_action_pressed("back") or e.is_action_pressed("ui_cancel") or e.is_action_pressed("menu")):
		close(); get_viewport().set_input_as_handled(); return
	if not (e is InputEventScreenTouch and e.pressed): return
	var pos: Vector2 = e.position
	if open:
		if p > 0.7:
			var r := _panel_rect()
			if not r.has_point(pos): close()
			else:
				for i in _entries().size():
					if _row_rect(i).has_point(pos): _choose(i)
		get_viewport().set_input_as_handled()
		return
	if p < 0.05 and not get_tree().paused and _tap_zone().has_point(pos) and not _busy():
		open_menu()
		get_viewport().set_input_as_handled()

func _busy() -> bool:
	return main == null or main.cast == null or main.cast.busy() or main.trans_busy

func open_menu() -> void:
	if open: return
	open = true
	was_paused = get_tree().paused
	get_tree().paused = true
	alpha = 0.0   # the compass gives way to the panel at once
	Sfx.ui("ui_menu_open")
	_satellites(false)

func close() -> void:
	if not open: return
	open = false
	get_tree().paused = was_paused
	Sfx.ui("ui_menu_close")

func _choose(i: int) -> void:
	var e: Array = _entries()[i]
	if not e[2]:
		Sfx.ui("ui_toggle_off")
		return
	close()
	_pick = e[0]   # opened as the panel shrinks back

func _satellites(on: bool) -> void:
	if Settings.menu and Settings.menu.cog: Settings.menu.cog.visible = on
	var q = _quest_ui()
	if q and q.btn: q.btn.visible = on

# ---------- every frame ----------
func _process(dt: float) -> void:
	dt = minf(dt, 0.05)
	_geometry()
	if not _placed and _quest_ui(): _place()
	if side == 0:
		if alpha > 0.0: alpha = 0.0; hud.queue_redraw()
		return
	# the menu's spring (about a quarter of a second, a little overshoot)
	var target := 1.0 if open else 0.0
	var moving := absf(target - p) > 0.001 or absf(pv) > 0.01
	if moving:
		var w := 2.0 * PI / 0.42
		var steps := 4
		for _i in steps:
			var h := dt / steps
			pv += (w * w * (target - p) - 2.0 * (0.62 if open else 0.95) * w * pv) * h
			p += pv * h
		if not open and p < 0.01:
			p = 0.0; pv = 0.0
			_satellites(true)
			if _pick == "quests":
				var q = _quest_ui()
				if q: q.open()
			elif _pick == "settings": Settings.open_menu()
			elif _pick == "bike" and main and main.cast and main.cast.bike: main.cast.bike.menu_toggle()
			_pick = ""
		hud.queue_redraw()
	# the compass
	_goal_t -= dt
	if _goal_t <= 0.0:
		_goal_t = 0.25
		_find_goal()
	var cy: float = main.cam_yaw if main else 0.0
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	north = atan2(Vector2(0, -1).dot(r), Vector2(0, -1).dot(f))
	var want := goal_ang
	# the bike's road assist with a fork coming up: the arrow points down the branch it takes
	var road = main.cast.bike.route_hint() if main and main.cast and main.cast.bike else null
	var road_on: bool = main != null and main.cast != null and main.cast.bike != null and main.cast.bike.assisting
	if road_on != assist_on: assist_on = road_on; _drawn.x = -9.0
	if road != null:
		var rp: Vector3 = road
		var rd := Vector2(rp.x - main.pos.x, rp.z - main.pos.z)
		want = atan2(rd.dot(r), rd.dot(f))
		if has_goal: goal_dist = Vector2(_goal_pos.x - main.pos.x, _goal_pos.z - main.pos.z).length()
	elif has_goal and main:
		var gp: Vector3 = _goal_pos
		var d := Vector2(gp.x - main.pos.x, gp.z - main.pos.z)
		goal_dist = d.length()
		want = atan2(d.dot(r), d.dot(f))
	else:
		want = north
	ang += wrapf(want - ang, -PI, PI) * (1.0 - exp(-dt * 10.0))
	var vis: bool = main != null and not main.indoors and main.speed > 0.6 and not _busy() and not open and p < 0.05 and not get_tree().paused
	alpha += ((1.0 if vis else 0.0) - alpha) * (1.0 - exp(-dt * (6.0 if vis else 3.5)))
	if alpha < 0.004: alpha = 0.0
	var now := Vector4(alpha, ang, north, roundf(goal_dist))
	if absf(now.x - _drawn.x) > 0.01 or absf(wrapf(now.y - _drawn.y, -PI, PI)) > 0.008 or absf(wrapf(now.z - _drawn.z, -PI, PI)) > 0.008 or (now.w != _drawn.w and alpha > 0.0):
		_drawn = now
		hud.queue_redraw()

var _goal_pos := Vector3.ZERO

func _find_goal() -> void:
	has_goal = false
	goal_name = ""
	if main == null or main.cast == null or main.cast.life == null: return
	var life = main.cast.life
	var g: Array = life.quests.goal_people() if life.quests and life.quests.has_method("goal_people") else []
	if g.is_empty(): return
	var best := INF
	for pp in life.people:
		if not (g[1] as Array).has(pp.id): continue
		var dd: float = Vector2(pp.pos.x - main.pos.x, pp.pos.z - main.pos.z).length()
		if pp.pos == Vector3.ZERO: continue
		if dd < best:
			best = dd; _goal_pos = pp.pos; goal_name = life.quests.short_name(pp.id)
	has_goal = best < INF

# ---------- drawing ----------
func _sb(c: Color, r: float) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(int(r))
	s.corner_detail = 12
	s.anti_aliasing = true
	return s

# the point at angle a (0 = up) on the island's outline grown by off
func _orbit(a: float, off: float) -> Vector2:
	var hr := halo()
	var c := hr.get_center()
	var rad := hr.size.x * 0.5 + off
	var half := maxf(0.0, hr.size.y * 0.5 - hr.size.x * 0.5)
	var d := Vector2(sin(a), -cos(a))
	var lo := 0.0
	var hi := hr.size.y + off * 2.0
	for _i in 18:
		var m := (lo + hi) * 0.5
		var q := d * m
		var dist := Vector2(q.x, q.y - clampf(q.y, -half, half)).length()
		if dist < rad: lo = m
		else: hi = m
	var q2 := c + d * lo
	# the edge of the screen squeezes the far side of the ring
	if side < 0: q2.x = maxf(q2.x, 9.0)
	elif side > 0: q2.x = minf(q2.x, hud.get_viewport_rect().size.x - 9.0)
	return q2

func _draw_hud() -> void:
	if side == 0: return
	if p > 0.002: _draw_menu()
	if alpha <= 0.0: return
	var a := alpha
	var hr := halo()
	hud.draw_style_box(_sb(Color(0, 0, 0, a), hr.size.x * 0.5), hr)
	# the ring hugging it
	var ring := PackedVector2Array()
	for i in 73: ring.append(_orbit(i * TAU / 72.0, 15.0))
	hud.draw_polyline(ring, Color(0, 0, 0, 0.45 * a), 7.0, true)
	hud.draw_polyline(ring, Color(1, 1, 1, 0.55 * a), 2.0, true)
	# ticks every 45 degrees from north, N in gold
	for i in 8:
		var t := north + i * TAU / 8.0
		var p0 := _orbit(t, 11.0)
		var p1 := _orbit(t, 19.0 if i == 0 else 17.0)
		hud.draw_line(p0, p1, Color(1, 1, 1, (0.9 if i == 0 else 0.5) * a), 3.0 if i == 0 else 2.0, true)
	var np := _orbit(north, 32.0)
	np.x = clampf(np.x, 14.0, hud.get_viewport_rect().size.x - 14.0)
	_text_c("N", np, 18, Color(GOLD, a), true)
	# the marker: a red arrowhead outside the ring, pointing the way
	var m := _orbit(ang, 15.0)
	if side < 0: m.x = maxf(m.x, 22.0)
	else: m.x = minf(m.x, hud.get_viewport_rect().size.x - 22.0)
	var d := Vector2(sin(ang), -cos(ang))
	var n := Vector2(-d.y, d.x)
	var tip := m + d * 17.0
	var tri := PackedVector2Array([tip, m - d * 7.0 + n * 11.0, m - d * 2.0, m - d * 7.0 - n * 11.0])
	var out := PackedVector2Array([tip + d * 3.0, m - d * 9.5 + n * 14.5, m - d * 3.5, m - d * 9.5 - n * 14.5])
	hud.draw_colored_polygon(out, Color(0, 0, 0, 0.8 * a))
	hud.draw_colored_polygon(tri, Color(RED if has_goal else CREAM, a))
	hud.draw_circle(m, 5.0, Color(1, 1, 1, a), true, -1.0, true)
	# who and how far, beside the island on the screen side
	var c := hr.get_center()
	var tx := hr.end.x + 42.0 if side < 0 else hr.position.x - 42.0
	var al := HORIZONTAL_ALIGNMENT_LEFT if side < 0 else HORIZONTAL_ALIGNMENT_RIGHT
	var l1 := goal_name if has_goal else "North"
	var l2 := ("%d m" % roundi(goal_dist)) if has_goal else ""
	_text_at(l1, Vector2(tx, c.y - 4.0), 20, Color(1, 1, 1, a), true, al)
	if assist_on:
		# a little road (two edges closing toward the horizon, a dashed middle) under the name
		var rc := Vector2(tx + (9.0 if side < 0 else -9.0), c.y + 46.0)
		var col := Color(GOLD, 0.9 * a)
		hud.draw_line(rc + Vector2(-8, 9), rc + Vector2(-2.5, -9), col, 2.5, true)
		hud.draw_line(rc + Vector2(8, 9), rc + Vector2(2.5, -9), col, 2.5, true)
		hud.draw_line(rc + Vector2(0, 7), rc + Vector2(0, 2), col, 2.0, true)
		hud.draw_line(rc + Vector2(0, -2), rc + Vector2(0, -6), col, 1.5, true)
	if l2 != "": _text_at(l2, Vector2(tx, c.y + 20.0), 17, Color(GOLD, a), false, al)

func _text_at(s: String, at: Vector2, size: int, col: Color, bold: bool, al: int) -> void:
	var f: Font = font_bold if bold else font
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var x := at.x if al == HORIZONTAL_ALIGNMENT_LEFT else at.x - w
	hud.draw_string_outline(f, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 6, Color(0, 0, 0, col.a * 0.75))
	hud.draw_string(f, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)

func _text_c(s: String, at: Vector2, size: int, col: Color, bold: bool) -> void:
	var f: Font = font_bold if bold else font
	var sz := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size)
	var o := at + Vector2(-sz.x * 0.5, sz.y * 0.32)
	hud.draw_string_outline(f, o, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 6, Color(0, 0, 0, col.a * 0.8))
	hud.draw_string(f, o, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)

# the panel at full size, and at the spring's p
func _panel_full() -> Rect2:
	var hr := halo()
	var vs := hud.get_viewport_rect().size
	var w := 440.0
	var h := minf(vs.y - 48.0, 640.0)
	var y := (vs.y - h) * 0.5
	return Rect2(hr.position.x, y, w, h) if side < 0 else Rect2(hr.end.x - w, y, w, h)

func _panel_rect() -> Rect2:
	var a := halo()
	var b := _panel_full()
	# it stretches along the edge first, like the island growing, then widens
	var ph := minf(p * 1.5, maxf(p, 1.0))
	var pw := (p - 0.2) / 0.8
	var w := maxf(a.size.x, lerpf(a.size.x, b.size.x, pw))
	var h := maxf(a.size.y * 0.6, lerpf(a.size.y, b.size.y, ph))
	var cy := lerpf(a.get_center().y, b.get_center().y, ph)
	var x := a.position.x if side < 0 else a.end.x - w
	return Rect2(x, cy - h * 0.5, w, h)

func _content_x() -> Vector2:
	var r := _panel_full()
	var hr := halo()
	return Vector2(hr.end.x + 18.0, r.end.x - 22.0) if side < 0 else Vector2(r.position.x + 22.0, hr.position.x - 18.0)

func _row_rect(i: int) -> Rect2:
	var r := _panel_full()
	var cx := _content_x()
	var row_h := minf(86.0, (r.size.y - 100.0) / _entries().size())
	return Rect2(cx.x, r.position.y + 76.0 + i * row_h, cx.y - cx.x, row_h - 8.0)

func _draw_menu() -> void:
	var r := _panel_rect()
	var rad := lerpf(halo().size.x * 0.5, 34.0, clampf(p, 0.0, 1.0))
	rad = minf(rad, minf(r.size.x, r.size.y) * 0.5)
	var dim := clampf(p, 0.0, 1.0)
	hud.draw_rect(Rect2(Vector2.ZERO, hud.get_viewport_rect().size), Color(0.02, 0.03, 0.08, 0.35 * dim))
	var sh := _sb(Color(0, 0, 0, 0), rad)
	sh.shadow_color = Color(0, 0, 0, 0.45 * dim); sh.shadow_size = 22
	hud.draw_style_box(sh, r)
	hud.draw_style_box(_sb(Color.BLACK, rad), r)
	var ca := clampf((p - 0.72) / 0.25, 0.0, 1.0)
	if ca <= 0.0: return
	var cx := _content_x()
	var full := _panel_full()
	_text_at("MENU", Vector2(cx.x + 4.0, full.position.y + 50.0), 18, Color(1, 1, 1, 0.5 * ca), true, HORIZONTAL_ALIGNMENT_LEFT)
	hud.draw_line(Vector2(cx.x, full.position.y + 64.0), Vector2(cx.y, full.position.y + 64.0), Color(1, 1, 1, 0.12 * ca), 2.0)
	var ents := _entries()
	for i in ents.size():
		var e: Array = ents[i]
		var rr := _row_rect(i)
		rr.position.x += (1.0 - ca) * (-24.0 if side < 0 else 24.0) * (1.0 + i * 0.4)
		var on: bool = e[2]
		var k := ca * (1.0 if on else 0.42)
		hud.draw_style_box(_sb(Color(1, 1, 1, (0.08 if on else 0.04) * ca), 18), rr)
		var ic := Vector2(rr.position.x + 38.0, rr.get_center().y)
		hud.draw_circle(ic, 25.0, Color(_icon_col(e[0]), k), true, -1.0, true)
		_icon(e[0], ic, k)
		var ty := rr.get_center().y + (8.0 if on else -2.0)
		_text_at(e[1], Vector2(rr.position.x + 80.0, ty), 26, Color(1, 1, 1, k), true, HORIZONTAL_ALIGNMENT_LEFT)
		if not on: _text_at("coming soon", Vector2(rr.position.x + 80.0, ty + 24.0), 16, Color(GOLD, 0.8 * ca), false, HORIZONTAL_ALIGNMENT_LEFT)
		elif e[0] == "quests":
			var q = _quest_ui()
			if q and q.unread: hud.draw_circle(Vector2(rr.end.x - 26.0, rr.get_center().y), 8.0, Color(RED, ca), true, -1.0, true)

func _icon_col(id: String) -> Color:
	return {"quests": Color("f2e9d6"), "settings": Color("3a4a63"), "dex": RED, "bag": Color("d08a1f"), "map": Color("4c9a5b"), "bike": Color("d83a31")}.get(id, Color.GRAY)

func _icon(id: String, c: Vector2, a: float) -> void:
	var ink := Color(0.137, 0.157, 0.31, a)
	var w := Color(1, 1, 1, a)
	match id:
		"quests":
			hud.draw_rect(Rect2(c.x - 10, c.y - 12, 20, 24), Color(CREAM, a))
			hud.draw_rect(Rect2(c.x - 10, c.y - 12, 20, 24), ink, false, 2.0)
			for k in 3: hud.draw_line(Vector2(c.x - 6, c.y - 6 + k * 6), Vector2(c.x + 6 - (4 if k == 2 else 0), c.y - 6 + k * 6), ink, 2.0)
		"settings":
			for i in 8:
				var t := i * TAU / 8.0
				var d := Vector2(cos(t), sin(t))
				var n := Vector2(-d.y, d.x)
				hud.draw_colored_polygon(PackedVector2Array([c + d * 9 + n * 4, c + d * 15 + n * 3, c + d * 15 - n * 3, c + d * 9 - n * 4]), w)
			hud.draw_circle(c, 11.0, w, true, -1.0, true)
			hud.draw_circle(c, 4.5, Color(0.23, 0.29, 0.39, a), true, -1.0, true)
		"dex":
			hud.draw_rect(Rect2(c.x - 11, c.y - 15, 22, 30), Color(1, 1, 1, 0.0))
			hud.draw_circle(c, 13.0, w, true, -1.0, true)
			hud.draw_line(c + Vector2(-13, 0), c + Vector2(13, 0), Color(0, 0, 0, a), 3.0)
			hud.draw_circle(c, 4.5, Color(0, 0, 0, a), true, -1.0, true)
			hud.draw_circle(c, 2.5, w, true, -1.0, true)
		"bag":
			hud.draw_style_box(_sb(Color(1, 1, 1, a), 5), Rect2(c.x - 12, c.y - 6, 24, 18))
			hud.draw_arc(c + Vector2(0, -6), 6.0, PI, TAU, 10, w, 3.0, true)
		"bike":
			# two wheels, the frame between, the bars
			hud.draw_arc(c + Vector2(-8, 5), 7.0, 0.0, TAU, 18, w, 2.5, true)
			hud.draw_arc(c + Vector2(8, 5), 7.0, 0.0, TAU, 18, w, 2.5, true)
			hud.draw_polyline(PackedVector2Array([c + Vector2(-8, 5), c + Vector2(-2, -4), c + Vector2(6, -4), c + Vector2(8, 5)]), w, 2.5, true)
			hud.draw_line(c + Vector2(-2, -4), c + Vector2(0, 5), w, 2.5, true)
			hud.draw_line(c + Vector2(5, -8), c + Vector2(9, -8), w, 2.5, true)
			hud.draw_line(c + Vector2(-5, -7), c + Vector2(0, -7), w, 3.0, true)
		"map":
			hud.draw_colored_polygon(PackedVector2Array([c + Vector2(-13, -9), c + Vector2(-4, -12), c + Vector2(4, -9), c + Vector2(13, -12),
				c + Vector2(13, 9), c + Vector2(4, 12), c + Vector2(-4, 9), c + Vector2(-13, 12)]), w)
			hud.draw_circle(c + Vector2(3, -1), 3.5, Color(RED, a), true, -1.0, true)

func _draw_top() -> void:
	if side == 0: return
	if fake != "": top.draw_style_box(_sb(Color.BLACK, isle.size.x * 0.5), isle)
	if int(Settings.get_value("island_outline")) == 1:
		var s := _sb(Color(0, 0, 0, 0), isle.size.x * 0.5)
		s.border_color = RED
		s.set_border_width_all(2)
		s.draw_center = false
		top.draw_style_box(s, isle)
		var zs := _sb(Color(0, 0, 0, 0), 10)
		zs.border_color = Color(GOLD, 0.6)
		zs.set_border_width_all(1)
		zs.draw_center = false
		top.draw_style_box(zs, _tap_zone())
