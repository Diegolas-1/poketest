extends Control
# The Battle Arena's staging menu (arena/arena.gd opens it): stage any battle to
# test the gameplay, in the UI kit's look (ui/ui_theme.gd: white panels, slanted
# plates, accent bars, condensed italic type), for touch and pad alike.
#   WILD      the species (the 151, a searchable grid), the level, the temperament,
#             how it starts (hidden in tall grass, startled, in the open), and Ash
#             alone (the prologue's rules) or with his party
#   HUNT      the species to hide in the tall grass (the same grid, tap to pick
#             several), how many, their levels, their temperament (random, each
#             species' own, or one for all), refill, Ash alone or with his party
#             (WILD's switch, TRAINER's party); START HUNT closes the menu and the
#             hunt is on (arena/arena_hunt.gd), RESTART HUNT re-populates, END HUNT
#   AMBUSH    an ambush to try (arena/arena_ambush.gd): the species, how many (a swarm
#             of up to 4), the level, the cover, Ash alone or with 1 or 2 of his out
#   TRAINER   Ash's party and the opponent's, up to six each (a slot: species,
#             level, the moves equipped from what it knows); the opponent's name,
#             look (the cast's looks), AI personality, singles or doubles; presets
#             (Ash's anime team, Brock's, Misty's, Gary's, random)
#   SAVED     save the setup, load or delete saved ones (user://arena_setups.json)
#   REGIONS   the hub and the regions round it (arena/arena_menu_regions.gd): go
#             there, stage a region's hunt, its ambush
#   START     runs it on the real in-world stage (arena/arena_stage.gd); the end of
#             a staged battle comes back here with a results card: REMATCH or EDIT
# The layout is drawn each frame as a list of hot rects (widgets); a tap hits one,
# the pad moves between them by direction (the nearest in that direction), A
# presses, B goes back a page or closes. Fast to use: everything one tap away,
# the last setup kept.

var arena
var setup: Dictionary = ArenaSetups.default_setup()
var page := "trainer"            # wild | hunt | trainer | slot | saved | results
var _back_page := "trainer"
var slot_side := "ash"           # the slot being edited: ash | foe
var slot_i := 0
var results := {}
var t := 0.0
var k := 0.0                     # open 0..1
var _open := false
var W: Array = []                # this frame's widgets: {id, r, fn, kind}
var focus := ""
var _rows := {"grid": 0}         # the species grid's first row
var _grid := {}                  # {r, cols, n, cell}
var _drag := {}
var _toast := {}
var _tap_frame := -1
var _filter := ""
var search: LineEdit
var name_edit: LineEdit
var _moves_scroll := 0
var _scroll_to := ""

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	search = _line_edit("SEARCH THE 151...")
	search.text_changed.connect(func(s: String): _filter = s.strip_edges().to_lower(); _rows.grid = 0)
	name_edit = _line_edit("OPPONENT'S NAME")
	name_edit.text_changed.connect(func(s: String): setup.foe.name = s)
	name_edit.max_length = 14

func _line_edit(ph: String) -> LineEdit:
	var e := LineEdit.new()
	e.placeholder_text = ph
	e.add_theme_font_override("font", UITheme.font("heading"))
	e.add_theme_font_size_override("font_size", 24)
	e.add_theme_color_override("font_color", UITheme.INK)
	e.add_theme_color_override("font_placeholder_color", UITheme.INK_SOFT)
	e.add_theme_color_override("caret_color", UITheme.RED)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1, 1, 1, 0.0)
	sb.content_margin_left = 44; sb.content_margin_right = 10
	e.add_theme_stylebox_override("normal", sb)
	e.add_theme_stylebox_override("focus", sb)
	e.visible = false
	add_child(e)
	return e

# ---------- open / close ----------
func is_open() -> bool: return _open

func open(p := "") -> void:
	if p != "": page = p
	_open = true
	visible = true
	Battle.active = true   # (the world waits while staging)
	if arena: arena.world_hud(false)
	Sfx.ui("ui_menu_open")
	focus = ""
	name_edit.text = String(setup.foe.name)

func close() -> void:
	if not _open: return
	_open = false
	Battle.active = false
	if arena: arena.world_hud(true)
	Sfx.ui("ui_menu_close")
	search.release_focus(); name_edit.release_focus()

func close_now() -> void:
	_open = false
	Battle.active = false
	visible = false
	k = 0.0

func show_results(r: Dictionary, s: Dictionary) -> void:
	results = r
	setup = s.duplicate(true)
	open("results")

func toast(text: String, col := UITheme.GREEN) -> void:
	_toast = {"text": text, "col": col, "t": t}

# ---------- the frame ----------
func _process(dt: float) -> void:
	t += dt
	k = clampf(k + (dt / 0.22 if _open else -dt / 0.16), 0.0, 1.0)
	if k <= 0.0 and not _open: visible = false
	search.visible = _open and k > 0.9 and page in ["wild", "slot", "hunt", "ambush"]
	name_edit.visible = _open and k > 0.9 and page == "trainer"
	queue_redraw()

func S() -> Rect2:
	var s := UITheme.safe_rect(self)
	return s.grow(-18.0)

func panel_rect() -> Rect2:
	var s := S()
	return Rect2(s.position + Vector2(0, (1.0 - UITheme.ease_out(k)) * 40.0), s.size)

# ---------- widgets ----------
func _w(id: String, r: Rect2, fn: Callable, kind := "button") -> bool:
	W.append({"id": id, "r": r, "fn": fn, "kind": kind})
	return focus == id and UIInput.device != "touch"

func _button(id: String, r: Rect2, label: String, fn: Callable, accent := UITheme.RED, primary := false, on := false, sub := "") -> void:
	var f := _w(id, r, fn)
	var pts := UITheme.para_points(r)
	var a := k
	if primary:
		UITheme.shadow(self, pts, a, Vector2(0, 4))
		UITheme.fill_v(self, pts, Color(accent.lightened(0.08), a), Color(accent.darkened(0.12), a))
	elif on:
		UITheme.fill(self, pts, Color(UITheme.INK, a))
	else:
		UITheme.fill(self, pts, Color(UITheme.INK, 0.07 * a))
	if not primary: UITheme.accent_bar(self, r, Color(accent, a * (1.0 if on else 0.6)), a, UITheme.SKEW, 6.0 if on else 4.0)
	if f: UITheme.outline(self, UITheme._offset(pts, Vector2.ZERO), Color(UITheme.YELLOW, a), 3.0)
	var tc := UITheme.WHITE if primary or on else UITheme.INK
	var size := 22 if r.size.y < 50.0 else 28
	if sub == "":
		UITheme.text_mid(self, r.get_center() + Vector2(4, 0), label, "display" if primary else "heading", size, Color(tc, a), 1)
	else:
		UITheme.text_mid(self, r.get_center() + Vector2(4, -9), label, "heading", 22, Color(tc, a), 1)
		UITheme.text_mid(self, r.get_center() + Vector2(4, 13), sub, "label", 13, Color(tc, a * 0.7), 1)

func _seg(id: String, r: Rect2, opts: Array, labels: Array, cur: String, fn: Callable, accent := UITheme.SKY) -> void:
	var n := opts.size()
	var wd := (r.size.x - (n - 1) * 8.0) / n
	for i in n:
		var rr := Rect2(r.position.x + i * (wd + 8.0), r.position.y, wd, r.size.y)
		var v: String = opts[i]
		_button("%s:%s" % [id, v], rr, String(labels[i]), func(): fn.call(v), accent, false, v == cur)

func _label(at: Vector2, s: String, col := UITheme.INK_SOFT, size := 15) -> void:
	UITheme.text(self, at, s, "label", size, Color(col, col.a * k))

# ---------- drawing ----------
func _draw() -> void:
	W.clear()
	if k <= 0.0: return
	var vs := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, vs), Color(UITheme.DIM, UITheme.DIM.a * k))
	var P := panel_rect()
	UITheme.panel(self, P, UITheme.RED, k)
	_header(P)
	var body := Rect2(P.position.x + 28.0, P.position.y + 92.0, P.size.x - 56.0, P.size.y - 92.0 - 86.0)
	match page:
		"wild": _wild(body)
		"hunt": _hunt(body)
		"ambush": _ambush(body)
		"trainer": _trainer(body)
		"slot": _slot(body)
		"saved": _saved(body)
		"regions": preload("res://arena/arena_menu_regions.gd").draw(self, body)
		"results": _results(body)
	_footer(P)
	if not _toast.is_empty() and t - float(_toast.t) < 2.2:
		var a := k * clampf((2.2 - (t - float(_toast.t))) / 0.3, 0.0, 1.0)
		var tw := UITheme.text_w(String(_toast.text), "heading", 22) + 50.0
		var r := Rect2(P.get_center().x - tw * 0.5, P.end.y - 140.0, tw, 44.0)
		UITheme.plate(self, r, a, UITheme.SKEW, UITheme.PLATE, 8)
		UITheme.accent_bar(self, r, Color(_toast.col, a), a, UITheme.SKEW, 6.0)
		UITheme.text_mid(self, r.get_center(), String(_toast.text), "heading", 22, Color(UITheme.TEXT, a), 1)
	_place_edits()
	if focus == "" or not W.any(func(x): return x.id == focus):
		if UIInput.device != "touch" and not W.is_empty(): focus = _default_focus()

func _default_focus() -> String:
	for want in ["start", "slot_done", "rematch", "save"]:
		for x in W:
			if String(x.id) == want: return want
	return String(W[0].id)

func _header(P: Rect2) -> void:
	var x := P.position.x + 30.0
	var y := P.position.y + 52.0
	x += UITheme.text(self, Vector2(x, y), "BATTLE ARENA", "display", 44, Color(UITheme.INK, k)) + 14.0
	UITheme.chevrons(self, Vector2(x, y - 30.0), 22.0, Color(UITheme.RED, k), 3)
	x += 60.0
	var tabs := [["wild", "WILD"], ["hunt", "HUNT"], ["ambush", "AMBUSH"], ["trainer", "TRAINER"], ["saved", "SAVED"], ["regions", "REGIONS"]]
	if page == "results": tabs = [["results", "RESULTS"]] + tabs
	var rx := P.end.x - 30.0
	# (the tabs share what is left between the title and LEAVE ARENA)
	var tw := minf(150.0, (rx - 270.0 - x - 10.0 * (tabs.size() - 1)) / tabs.size())
	for tb in tabs:
		var id: String = tb[0]
		var sel: bool = page == id or (page == "slot" and id == "trainer")
		_button("tab:" + id, Rect2(x, P.position.y + 22.0, tw, 46.0), String(tb[1]), func(): _go(id), UITheme.RED, false, sel)
		x += tw + 10.0
	_button("close", Rect2(rx - 60.0, P.position.y + 22.0, 56.0, 46.0), "✕", close, UITheme.INK)
	_button("leave", Rect2(rx - 260.0, P.position.y + 22.0, 190.0, 46.0), "LEAVE ARENA", func(): close(); arena.leave(), UITheme.ORANGE)
	draw_line(Vector2(P.position.x + 24.0, P.position.y + 82.0), Vector2(P.end.x - 24.0, P.position.y + 82.0), Color(UITheme.INK, 0.1 * k), 2.0)

func _go(p: String) -> void:
	if p == page: return
	Sfx.ui("ui_tab")
	if page != "slot": _back_page = page
	page = p
	focus = ""
	if p in ["wild", "slot", "hunt", "ambush"]: search.text = ""; _filter = ""

func _footer(P: Rect2) -> void:
	var y := P.end.y - 74.0
	var r := Rect2(P.end.x - 360.0, y, 330.0, 56.0)
	if page == "slot":
		_button("slot_done", r, "DONE", func(): _go(_back_page if _back_page != "slot" else "trainer"), UITheme.GREEN, true)
		_button("slot_remove", Rect2(r.position.x - 230.0, y, 210.0, 56.0), "REMOVE", _slot_remove, UITheme.RED)
	elif page == "results":
		_button("rematch", r, "REMATCH  ▶", func(): _start(), UITheme.RED, true)
		_button("edit", Rect2(r.position.x - 230.0, y, 210.0, 56.0), "EDIT", func(): _go(String(setup.type)), UITheme.SKY)
	elif page == "hunt":
		var hon := _hunt_on()
		_button("start", r, "RESTART HUNT  ▶" if hon else "START HUNT  ▶", func(): _start(), UITheme.GREEN, true)
		if hon: _button("hunt_end", Rect2(r.position.x - 230.0, y, 210.0, 56.0), "END HUNT", _end_hunt, UITheme.RED)
	elif page == "ambush":
		_button("start", r, "START AMBUSH  ▶", func(): _start(), UITheme.ORANGE, true)
	elif not page in ["saved", "regions"]:
		var lbl := "START BATTLE  ▶"
		_button("start", r, lbl, func(): _start(), UITheme.RED, true)
	# the summary at the left: what START will run
	var s := ArenaSetups.title({"type": page if page in ["wild", "trainer", "hunt", "ambush"] else setup.type, "wild": setup.wild, "hunt": setup.hunt, "ash": setup.ash, "foe": setup.foe, "ambush": setup.get("ambush", {})})
	_label(Vector2(P.position.x + 34.0, y + 22.0), "STAGED", UITheme.INK_SOFT, 14)
	UITheme.text(self, Vector2(P.position.x + 34.0, y + 48.0), s.to_upper(), "heading", 24, Color(UITheme.INK, k))
	var hint := "TAP TO PICK · DRAG TO SCROLL" if UIInput.device == "touch" else "D-PAD MOVE · A PICK · B BACK"
	_label(Vector2(P.position.x + 34.0 + UITheme.text_w(s.to_upper(), "heading", 24) + 30.0, y + 48.0), hint, UITheme.INK_SOFT, 13)

func _start() -> void:
	if page in ["wild", "trainer", "hunt", "ambush"]: setup.type = page
	if setup.type == "hunt":
		_start_hunt(); return
	if setup.type == "ambush":
		# (arena/arena_ambush.gd: Ash on the path, the ambusher in the cover ahead)
		Sfx.ui("ui_confirm")
		close()
		if _hunt_on(): arena.hunt.stop(false)
		arena.ambush.start(arena.ambush.cfg(setup), setup.ash.map(func(m): return ArenaSetups.mon(m)))
		return
	if setup.type == "trainer" and (setup.ash.is_empty() or setup.foe.party.is_empty()):
		toast("Both sides need a Pokémon", UITheme.RED); Sfx.ui("ui_error"); return
	if setup.type == "wild" and setup.wild.with_party and setup.ash.is_empty():
		toast("Ash's party is empty: add one on TRAINER", UITheme.RED); Sfx.ui("ui_error"); return
	Sfx.ui("ui_confirm")
	close()
	# (a staged battle ends a hunt: the stage takes Ash elsewhere in the arena)
	if _hunt_on(): arena.hunt.stop(false)
	arena.stage.run(setup.duplicate(true))

# ---------- the species grid (WILD, a slot) ----------
func _species() -> Array:
	var all := ArenaSetups.species_list()
	if _filter == "": return all
	return all.filter(_matches)

func _matches(s: Dictionary) -> bool:
	if String(s.name).to_lower().contains(_filter) or String(s.id).contains(_filter) or str(s.dex) == _filter: return true
	for ty in s.types:
		if String(ty) == _filter: return true
	return false

# cur: the species picked (an Array: several, the HUNT page's)
func _grid_draw(r: Rect2, cur: Variant, fn: Callable) -> void:
	# the search box above it
	var sr := Rect2(r.position, Vector2(r.size.x, 46.0))
	UITheme.fill(self, UITheme.para_points(sr, UITheme.SKEW * 0.3), Color(UITheme.INK, 0.06 * k))
	_magnifier(sr.position + Vector2(24, 23), Color(UITheme.INK_SOFT, k))
	_w("search", sr, func(): search.grab_focus(), "edit")
	search.set_meta("rect", sr)
	var list := _species()
	var g := Rect2(r.position.x, r.position.y + 56.0, r.size.x, r.size.y - 56.0)
	var cw := 176.0
	var ch := 58.0
	var cols := maxi(1, int((g.size.x + 8.0) / (cw + 8.0)))
	cw = (g.size.x - (cols - 1) * 8.0) / cols
	var rows_vis := maxi(1, int((g.size.y + 8.0) / (ch + 8.0)))
	var n := list.size()
	var rows := ceili(float(n) / cols)
	if _scroll_to != "":
		# a page opened on a species: the grid starts at its row
		for i in n:
			if String(list[i].id) == _scroll_to: _rows.grid = maxi(0, i / cols - 1)
		_scroll_to = ""
	_rows.grid = clampi(int(_rows.grid), 0, maxi(0, rows - rows_vis))
	_grid = {"r": g, "cols": cols, "n": n, "rows_vis": rows_vis, "list": list, "cell": Vector2(cw, ch)}
	for row in range(int(_rows.grid), mini(rows, int(_rows.grid) + rows_vis)):
		for c in cols:
			var i := row * cols + c
			if i >= n: break
			var s: Dictionary = list[i]
			var cr := Rect2(g.position.x + c * (cw + 8.0), g.position.y + (row - int(_rows.grid)) * (ch + 8.0), cw, ch)
			var sel: bool = (cur as Array).has(String(s.id)) if cur is Array else String(s.id) == String(cur)
			var id := String(s.id)
			var f := _w("sp:" + id, cr, func(): fn.call(id), "cell")
			var pts := UITheme.para_points(cr, UITheme.SKEW * 0.5)
			UITheme.fill(self, pts, Color(UITheme.INK, k) if sel else Color(UITheme.INK, 0.05 * k))
			var tcol := EnergyIcon.color(BattleEnergy.energy_of(String(s.types[0])))
			UITheme.para(self, Rect2(cr.position.x + 4.0, cr.position.y + 6.0, 6.0, ch - 12.0), Color(tcol, k), UITheme.SKEW * 0.5)
			var tc := UITheme.WHITE if sel else UITheme.INK
			UITheme.text(self, cr.position + Vector2(20, 22), "#%03d" % int(s.dex), "label", 13, Color(tc, k * 0.6))
			UITheme.text(self, cr.position + Vector2(20, 46), String(s.name).to_upper(), "heading", 21, Color(tc, k), 0, cw - 26.0)
			if not s.model: UITheme.text(self, Vector2(cr.end.x - 10.0, cr.position.y + 22.0), "STAND-IN", "label", 11, Color(UITheme.ORANGE, k), 2)
			if sel and cur is Array: UITheme.icon(self, "check", Vector2(cr.end.x - 18.0, cr.end.y - 18.0), 9.0, Color(UITheme.GREEN, k))
			if f: UITheme.outline(self, pts, Color(UITheme.YELLOW, k), 3.0)
	# the scroll bar
	if rows > rows_vis:
		var sb := Rect2(g.end.x + 6.0, g.position.y, 5.0, g.size.y)
		draw_rect(sb, Color(UITheme.INK, 0.08 * k))
		var h := sb.size.y * float(rows_vis) / rows
		var y := sb.position.y + (sb.size.y - h) * float(_rows.grid) / maxf(1.0, rows - rows_vis)
		draw_rect(Rect2(sb.position.x, y, 5.0, h), Color(UITheme.RED, 0.8 * k))
	if n == 0: _label(g.position + Vector2(10, 30), "NOTHING MATCHES \"%s\"" % _filter.to_upper(), UITheme.INK_SOFT, 18)

func _place_edits() -> void:
	for e in [search, name_edit]:
		if e.visible and e.has_meta("rect"):
			var r: Rect2 = e.get_meta("rect")
			e.position = r.position
			e.size = r.size

# ---------- WILD ----------
func _wild(body: Rect2) -> void:
	var w: Dictionary = setup.wild
	var left := Rect2(body.position, Vector2(body.size.x * 0.58, body.size.y))
	_grid_draw(left, String(w.species), func(id: String): w.species = id; Sfx.ui("ui_cursor"))
	var R := Rect2(left.end.x + 36.0, body.position.y, body.end.x - left.end.x - 36.0, body.size.y)
	var sd := BattleEnergy.species_data(String(w.species))
	var y := R.position.y + 6.0
	_label(Vector2(R.position.x, y + 14.0), "WILD POKéMON #%03d" % int(sd.get("dex", 0)))
	var nw := UITheme.text(self, Vector2(R.position.x, y + 58.0), String(sd.get("name", w.species)).to_upper(), "display", 48, Color(UITheme.INK, k))
	var tx := R.position.x + nw + 16.0
	for ty in sd.get("types", []):
		tx += UITheme.chip(self, Vector2(tx, y + 30.0), String(ty).to_upper(), EnergyIcon.color(BattleEnergy.energy_of(String(ty))), UITheme.WHITE, 14, 24.0, k) + 6.0
	y += 84.0
	_label(Vector2(R.position.x, y + 14.0), "LEVEL")
	_stepper("wlv", Rect2(R.position.x, y + 22.0, R.size.x, 48.0), int(w.level), func(v: int): w.level = v)
	y += 84.0
	_label(Vector2(R.position.x, y + 14.0), "TEMPERAMENT")
	_seg("temper", Rect2(R.position.x, y + 22.0, R.size.x, 46.0), ArenaSetups.TEMPERS, ["FLIGHTY", "AGGRESSIVE", "CURIOUS", "TIMID"], String(w.temper), func(v): w.temper = v, UITheme.ORANGE)
	y += 82.0
	_label(Vector2(R.position.x, y + 14.0), "IT STARTS")
	_seg("start", Rect2(R.position.x, y + 22.0, R.size.x, 46.0), ArenaSetups.STARTS, ["IN TALL GRASS", "STARTLED", "IN THE OPEN"], String(w.start), func(v): w.start = v, UITheme.GREEN)
	y += 82.0
	_label(Vector2(R.position.x, y + 14.0), "ASH")
	var pn: int = setup.ash.size()
	_seg("withp", Rect2(R.position.x, y + 22.0, R.size.x, 56.0), ["alone", "party"], ["ALONE", "WITH HIS PARTY"], "party" if w.with_party else "alone", func(v): w.with_party = v == "party", UITheme.SKY)
	y += 92.0
	var note := "Prologue rules: no Pokémon of his own, he can only run, hide or throw something." if not w.with_party else "His party from TRAINER: %d Pokémon (%s first)." % [pn, ArenaSetups.species_name(String(setup.ash[0].species)) if pn > 0 else "none"]
	for i in UITheme.wrap(note, "body", 18, R.size.x).size():
		UITheme.text(self, Vector2(R.position.x, y + i * 24.0), UITheme.wrap(note, "body", 18, R.size.x)[i], "body", 18, Color(UITheme.INK_SOFT, k))

# a compact one: - value +
func _mini(id: String, r: Rect2, v: int, fn: Callable, lo: int, hi: int, unit := "") -> void:
	var bw := 46.0
	_button(id + ":-1", Rect2(r.position.x, r.position.y, bw, r.size.y), "-", func(): fn.call(clampi(v - 1, lo, hi)), UITheme.INK)
	var mid := Rect2(r.position.x + bw + 6.0, r.position.y, r.size.x - 2.0 * (bw + 6.0), r.size.y)
	UITheme.fill(self, UITheme.para_points(mid), Color(UITheme.INK, 0.9 * k))
	var vw := UITheme.text_w(str(v), "display", 30)
	if unit != "": UITheme.text_mid(self, mid.get_center() + Vector2(-vw * 0.5 - 4.0, 1), unit, "label", 14, Color(UITheme.TEXT_DIM, k), 2)
	UITheme.text_mid(self, mid.get_center() + Vector2(-vw * 0.5, 0), str(v), "display", 30, Color(UITheme.TEXT, k), 0)
	_button(id + ":+1", Rect2(mid.end.x + 6.0, r.position.y, bw, r.size.y), "+", func(): fn.call(clampi(v + 1, lo, hi)), UITheme.INK)

func _stepper(id: String, r: Rect2, v: int, fn: Callable, lo := 2, hi := 100) -> void:
	var bw := 64.0
	_button(id + ":-5", Rect2(r.position.x, r.position.y, bw, r.size.y), "-5", func(): fn.call(clampi(v - 5, lo, hi)), UITheme.INK)
	_button(id + ":-1", Rect2(r.position.x + bw + 8.0, r.position.y, bw, r.size.y), "-", func(): fn.call(clampi(v - 1, lo, hi)), UITheme.INK)
	var mid := Rect2(r.position.x + 2.0 * (bw + 8.0), r.position.y, r.size.x - 4.0 * (bw + 8.0), r.size.y)
	UITheme.fill(self, UITheme.para_points(mid), Color(UITheme.INK, 0.9 * k))
	UITheme.text_mid(self, mid.get_center() + Vector2(-16, 0), "Lv", "label", 16, Color(UITheme.TEXT_DIM, k), 2)
	UITheme.text_mid(self, mid.get_center() + Vector2(-10, 0), str(v), "display", 34, Color(UITheme.TEXT, k), 0)
	_button(id + ":+1", Rect2(mid.end.x + 8.0, r.position.y, bw, r.size.y), "+", func(): fn.call(clampi(v + 1, lo, hi)), UITheme.INK)
	_button(id + ":+5", Rect2(mid.end.x + bw + 16.0, r.position.y, bw, r.size.y), "+5", func(): fn.call(clampi(v + 5, lo, hi)), UITheme.INK)

# ---------- HUNT ----------
func _hunt_on() -> bool: return arena != null and arena.hunt != null and arena.hunt.on

func _hunt(body: Rect2) -> void:
	var h: Dictionary = setup.hunt
	var sp: Array = h.species
	var left := Rect2(body.position, Vector2(body.size.x * 0.56, body.size.y))
	_grid_draw(left, sp, _toggle_hunt)
	var R := Rect2(left.end.x + 36.0, body.position.y, body.end.x - left.end.x - 36.0, body.size.y)
	var y := R.position.y
	# what hides: the count of species, their names, CLEAR and RANDOM
	_label(Vector2(R.position.x, y + 14.0), "HIDING IN THE TALL GRASS")
	UITheme.text(self, Vector2(R.position.x, y + 50.0), ("%d SPECIES" % sp.size()) if sp.size() != 1 else "1 SPECIES", "display", 36, Color(UITheme.INK, k))
	_button("hunt_clr", Rect2(R.end.x - 112.0, y + 8.0, 112.0, 40.0), "CLEAR", func(): sp.clear(), UITheme.INK)
	_button("hunt_rnd", Rect2(R.end.x - 238.0, y + 8.0, 118.0, 40.0), "RANDOM", _random_hunt, UITheme.PURPLE)
	var names := " · ".join(sp.map(func(id): return ArenaSetups.species_name(String(id)).to_upper())) if not sp.is_empty() else "TAP THE GRID TO PICK THEM"
	UITheme.text(self, Vector2(R.position.x, y + 76.0), names, "label", 14, Color(UITheme.INK_SOFT, k), 0, R.size.x)
	y += 92.0
	var lw := 112.0
	var cx := R.position.x + lw
	var cw := R.size.x - lw
	var rh := 46.0
	# how many, refill
	_label(Vector2(R.position.x, y + 29.0), "HOW MANY")
	_mini("hunt_n", Rect2(cx, y, 170.0, rh), int(h.count), func(v: int): h.count = v, ArenaSetups.HUNT_N[0], ArenaSetups.HUNT_N[1])
	_seg("refill", Rect2(cx + 186.0, y, cw - 186.0, rh), ["off", "on"], ["NO REFILL", "REFILL"], "on" if bool(h.get("refill", false)) else "off", func(v): h.refill = v == "on", UITheme.GREEN)
	y += rh + 12.0
	# the levels: lo to hi
	var lv: Array = h.lv
	_label(Vector2(R.position.x, y + 29.0), "LEVELS")
	var mw := (cw - 40.0) * 0.5
	_mini("hunt_lo", Rect2(cx, y, mw, rh), int(lv[0]), func(v: int): lv[0] = v; lv[1] = maxi(int(lv[1]), v), 2, 100, "Lv")
	UITheme.text_mid(self, Vector2(cx + mw + 20.0, y + rh * 0.5), "TO", "label", 15, Color(UITheme.INK_SOFT, k), 1)
	_mini("hunt_hi", Rect2(cx + mw + 40.0, y, mw, rh), int(lv[1]), func(v: int): lv[1] = v; lv[0] = mini(int(lv[0]), v), 2, 100, "Lv")
	y += rh + 12.0
	# temperament: random, each species' own odds, or one for all (FIXED again: the next)
	_label(Vector2(R.position.x, y + 29.0), "TEMPER")
	var fx := String(h.get("fixed", "flighty"))
	var tm := String(h.get("temper", "random"))
	var sw := (cw - 16.0) / 3.0
	_button("htemp:random", Rect2(cx, y, sw, rh), "RANDOM", func(): h.temper = "random", UITheme.ORANGE, false, tm == "random")
	_button("htemp:species", Rect2(cx + sw + 8.0, y, sw, rh), "BY SPECIES", func(): h.temper = "species", UITheme.ORANGE, false, tm == "species")
	_button("htemp:fixed", Rect2(cx + 2.0 * (sw + 8.0), y, sw, rh), "FIXED", _hunt_fixed, UITheme.ORANGE, false, tm == "fixed", fx.to_upper())
	y += rh + 12.0
	# Ash: alone, or with TRAINER's party (WILD's switch)
	_label(Vector2(R.position.x, y + 29.0), "ASH")
	var w: Dictionary = setup.wild
	_seg("hwithp", Rect2(cx, y, cw, rh), ["alone", "party"], ["ALONE", "WITH HIS PARTY"], "party" if w.with_party else "alone", func(v): w.with_party = v == "party", UITheme.SKY)
	y += rh + 14.0
	var pn: int = setup.ash.size()
	var note := ""
	if _hunt_on(): note = "Hunt on: %d of %d still in the grass. RESTART HUNT hides a fresh field." % [arena.hunt.left(), arena.hunt.total()]
	elif int(h.count) < sp.size(): note = "%d species for %d spots: not all of them will be out there." % [sp.size(), int(h.count)]
	elif w.with_party: note = "His party from TRAINER: %d Pokémon (%s first)." % [pn, ArenaSetups.species_name(String(setup.ash[0].species)) if pn > 0 else "none"]
	else: note = "Prologue rules: no Pokémon of his own, he can only run, hide or throw something."
	UITheme.text(self, Vector2(R.position.x, y + 14.0), note, "body", 17, Color(UITheme.INK_SOFT, k), 0, R.size.x)

# FIXED: one temperament for all of them; pressed again, the next one
func _hunt_fixed() -> void:
	var h: Dictionary = setup.hunt
	var T: Array = ArenaSetups.TEMPERS
	if String(h.get("temper", "")) == "fixed": h.fixed = T[(T.find(String(h.get("fixed", "flighty"))) + 1) % T.size()]
	h.temper = "fixed"

func _toggle_hunt(id: String) -> void:
	var sp: Array = setup.hunt.species
	if sp.has(id): sp.erase(id); Sfx.ui("ui_toggle_off"); return
	if sp.size() >= 12:
		toast("Twelve species at most", UITheme.ORANGE); Sfx.ui("ui_error"); return
	sp.append(id)
	Sfx.ui("ui_toggle_on")

func _random_hunt() -> void:
	var pool := ArenaSetups.species_list().filter(func(s): return s.model)
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var sp: Array = setup.hunt.species
	sp.clear()
	while sp.size() < 5 and sp.size() < pool.size():
		var id := String(pool[rng.randi() % pool.size()].id)
		if not sp.has(id): sp.append(id)
	toast("Five at random")

func _start_hunt() -> void:
	var h: Dictionary = setup.hunt
	if (h.species as Array).is_empty():
		toast("Pick a species or more to hide", UITheme.RED); Sfx.ui("ui_error"); return
	if setup.wild.with_party and setup.ash.is_empty():
		toast("Ash's party is empty: add one on TRAINER", UITheme.RED); Sfx.ui("ui_error"); return
	Sfx.ui("ui_confirm")
	close()
	if _hunt_on(): arena.hunt.stop(false)
	arena.hunt.start(h, setup.ash.duplicate(true), bool(setup.wild.with_party))

func _end_hunt() -> void:
	arena.hunt.stop(false)
	toast("Hunt over: the grass is empty", UITheme.SKY)

# ---------- AMBUSH (arena/arena_ambush.gd draws it with these widgets) ----------
func _ambush(body: Rect2) -> void:
	if arena and arena.ambush: arena.ambush.page(self, body)

# ---------- TRAINER ----------
func _trainer(body: Rect2) -> void:
	var half := (body.size.x - 40.0) * 0.5
	var L := Rect2(body.position, Vector2(half, body.size.y))
	var R := Rect2(body.position.x + half + 40.0, body.position.y, half, body.size.y)
	# Ash
	UITheme.text(self, L.position + Vector2(0, 26), "ASH'S PARTY", "display", 30, Color(UITheme.INK, k))
	_label(L.position + Vector2(220, 24), "%d / 6" % setup.ash.size())
	_party_rows("ash", Rect2(L.position.x, L.position.y + 40.0, L.size.x, L.size.y - 100.0), setup.ash)
	var py := L.end.y - 50.0
	var bw := (L.size.x - 16.0) / 3.0
	_button("pre:ash", Rect2(L.position.x, py, bw, 46.0), "ANIME TEAM", func(): ArenaSetups.apply_preset(setup, "ash", "ash"); toast("Ash's Indigo League team"), UITheme.YELLOW)
	_button("rnd:ash", Rect2(L.position.x + bw + 8.0, py, bw, 46.0), "RANDOM", func(): setup.ash = ArenaSetups.random_party(); toast("A random party for Ash"), UITheme.PURPLE)
	_button("clr:ash", Rect2(L.position.x + 2.0 * (bw + 8.0), py, bw, 46.0), "CLEAR", func(): setup.ash = [], UITheme.INK)
	# the opponent
	var foe: Dictionary = setup.foe
	UITheme.text(self, R.position + Vector2(0, 26), "OPPONENT", "display", 30, Color(UITheme.INK, k))
	var nr := Rect2(R.position.x + 190.0, R.position.y, R.size.x - 190.0, 40.0)
	UITheme.fill(self, UITheme.para_points(nr, UITheme.SKEW * 0.3), Color(UITheme.INK, 0.06 * k))
	UITheme.icon(self, "chat", nr.position + Vector2(22, 20), 9.0, Color(UITheme.INK_SOFT, k))
	_w("name", nr, func(): name_edit.grab_focus(), "edit")
	name_edit.set_meta("rect", nr)
	var y := R.position.y + 50.0
	# the look, the AI, the format
	var looks: Array = ArenaSetups.LOOKS
	var li := maxi(0, looks.find(String(foe.look)))
	_label(Vector2(R.position.x, y + 30.0), "LOOK")
	_button("look:-", Rect2(R.position.x + 60.0, y + 4.0, 46.0, 42.0), "◀", func(): foe.look = looks[(li - 1 + looks.size()) % looks.size()], UITheme.INK)
	var lr := Rect2(R.position.x + 114.0, y + 4.0, 150.0, 42.0)
	UITheme.fill(self, UITheme.para_points(lr), Color(UITheme.INK, 0.9 * k))
	UITheme.text_mid(self, lr.get_center(), String(foe.look).to_upper(), "heading", 22, Color(UITheme.TEXT, k), 1)
	_button("look:+", Rect2(R.position.x + 272.0, y + 4.0, 46.0, 42.0), "▶", func(): foe.look = looks[(li + 1) % looks.size()], UITheme.INK)
	_seg("format", Rect2(R.position.x + 340.0, y + 4.0, R.size.x - 340.0, 42.0), ["singles", "doubles"], ["SINGLES", "DOUBLES"], String(foe.get("format", "singles")), _set_format, UITheme.GREEN)
	y += 54.0
	_seg("ai", Rect2(R.position.x, y, R.size.x, 42.0), ArenaSetups.AIS, ["CAUTIOUS", "AGGRESSIVE", "BALANCED", "TRICKY"], String(foe.ai), func(v): foe.ai = v, UITheme.ORANGE)
	y += 52.0
	_party_rows("foe", Rect2(R.position.x, y, R.size.x, R.end.y - 60.0 - y), foe.party)
	var bw2 := (R.size.x - 24.0) / 4.0
	var x := R.position.x
	for pid in ["brock", "misty", "gary"]:
		var id: String = pid
		_button("pre:" + id, Rect2(x, py, bw2, 46.0), String(ArenaSetups.PRESETS[id].label), func(): ArenaSetups.apply_preset(setup, id, "foe"); name_edit.text = String(setup.foe.name); toast("%s's team" % String(setup.foe.name)), UITheme.YELLOW)
		x += bw2 + 8.0
	_button("rnd:foe", Rect2(x, py, bw2, 46.0), "RANDOM", func(): foe.party = ArenaSetups.random_party(); toast("A random party"), UITheme.PURPLE)

func _set_format(v: String) -> void:
	setup.foe.format = v
	if v == "doubles": toast("Doubles: two out a side (a test option)", UITheme.SKY)

func _magnifier(c: Vector2, col: Color) -> void:
	draw_arc(c + Vector2(-2, -2), 7.0, 0.0, TAU, 20, col, 2.5, true)
	draw_line(c + Vector2(3, 3), c + Vector2(9, 9), col, 3.0, true)

func _party_rows(side: String, r: Rect2, party: Array) -> void:
	var rh := minf(52.0, (r.size.y - 5.0 * 6.0) / 6.0)
	for i in 6:
		var rr := Rect2(r.position.x, r.position.y + i * (rh + 6.0), r.size.x, rh)
		var idx := i
		if i < party.size():
			var m: Dictionary = party[i]
			var f := _w("%s:%d" % [side, i], rr, func(): _edit_slot(side, idx), "row")
			var pts := UITheme.para_points(rr, UITheme.SKEW * 0.5)
			UITheme.fill(self, pts, Color(UITheme.INK, 0.07 * k))
			PkmnHud.draw_ball(self, rr.position + Vector2(26, rh * 0.5), 11.0, "ok", i == 0)
			var nm := ArenaSetups.species_name(String(m.species)).to_upper()
			var nw := UITheme.text_mid(self, rr.position + Vector2(48, rh * 0.5), nm, "heading", 24, Color(UITheme.INK, k))
			UITheme.text_mid(self, rr.position + Vector2(56 + nw, rh * 0.5 + 2.0), "Lv%d" % int(m.level), "label", 16, Color(UITheme.INK_SOFT, k))
			var eq: Array = m.get("equip", [])
			var tag := "%d MOVES SET" % eq.size() if not eq.is_empty() else "AUTO MOVES"
			UITheme.text_mid(self, Vector2(rr.end.x - 20.0, rr.position.y + rh * 0.5), tag, "label", 13, Color(UITheme.INK_SOFT, k), 2)
			if i == 0: UITheme.chip(self, Vector2(rr.end.x - 190.0, rr.position.y + rh * 0.5 - 10.0), "LEAD", UITheme.RED, UITheme.WHITE, 12, 20.0, k)
			if f: UITheme.outline(self, pts, Color(UITheme.YELLOW, k), 3.0)
		elif i == party.size():
			_w("%s:add" % side, rr, func(): _add_slot(side), "row")
			var pts := UITheme.para_points(rr, UITheme.SKEW * 0.5)
			UITheme.outline(self, pts, Color(UITheme.INK, 0.25 * k), 2.0)
			if focus == "%s:add" % side and UIInput.device != "touch": UITheme.outline(self, pts, Color(UITheme.YELLOW, k), 3.0)
			UITheme.text_mid(self, rr.position + Vector2(48, rh * 0.5), "+  ADD POKéMON", "heading", 22, Color(UITheme.INK_SOFT, k))
		else:
			UITheme.outline(self, UITheme.para_points(rr, UITheme.SKEW * 0.5), Color(UITheme.INK, 0.08 * k), 1.5)
			PkmnHud.draw_ball(self, rr.position + Vector2(26, rh * 0.5), 11.0, "empty")

func _party(side: String) -> Array: return setup.ash if side == "ash" else setup.foe.party

func _add_slot(side: String) -> void:
	var p := _party(side)
	if p.size() >= 6: return
	var lv: int = int(p.back().level) if not p.is_empty() else 20
	p.append({"species": "pikachu" if side == "ash" else "rattata", "level": lv})
	_edit_slot(side, p.size() - 1)

func _edit_slot(side: String, i: int) -> void:
	slot_side = side
	slot_i = i
	_moves_scroll = 0
	_scroll_to = String(_party(side)[i].species)
	_go("slot")
	_back_page = "trainer"

func _slot_remove() -> void:
	var p := _party(slot_side)
	if slot_i < p.size(): p.remove_at(slot_i)
	Sfx.ui("ui_cancel")
	_go("trainer")

# ---------- a slot: species, level, moves ----------
func _slot(body: Rect2) -> void:
	var p := _party(slot_side)
	if slot_i >= p.size(): _go("trainer"); return
	var m: Dictionary = p[slot_i]
	var left := Rect2(body.position, Vector2(body.size.x * 0.56, body.size.y))
	_grid_draw(left, String(m.species), func(id: String): m.species = id; m.erase("equip"); Sfx.ui("ui_cursor"))
	var R := Rect2(left.end.x + 36.0, body.position.y, body.end.x - left.end.x - 36.0, body.size.y)
	var sd := BattleEnergy.species_data(String(m.species))
	_label(Vector2(R.position.x, R.position.y + 18.0), ("ASH'S" if slot_side == "ash" else String(setup.foe.name).to_upper() + "'S") + " POKéMON %d" % (slot_i + 1))
	UITheme.text(self, Vector2(R.position.x, R.position.y + 62.0), String(sd.get("name", m.species)).to_upper(), "display", 46, Color(UITheme.INK, k))
	var y := R.position.y + 80.0
	_stepper("slv", Rect2(R.position.x, y, R.size.x, 46.0), int(m.level), func(v: int): m.level = v; _trim_equip(m))
	y += 62.0
	var known := ArenaSetups.known_moves(String(m.species), int(m.level))
	var cap := ArenaSetups.slots(String(m.species), int(m.level))
	var eq: Array = m.get("equip", [])
	_label(Vector2(R.position.x, y + 14.0), "MOVES  ·  %s" % ("AUTO (THE GAME'S PICK)" if eq.is_empty() else "%d / %d EQUIPPED" % [eq.size(), cap]))
	_button("auto", Rect2(R.end.x - 120.0, y - 4.0, 120.0, 34.0), "AUTO", func(): m.erase("equip"), UITheme.SKY, false, eq.is_empty())
	y += 36.0
	var rh := 40.0
	var n_vis := int((R.end.y - y) / (rh + 6.0)) * 2
	_moves_scroll = clampi(_moves_scroll, 0, maxi(0, known.size() - n_vis))
	var cw := (R.size.x - 8.0) * 0.5
	for j in range(_moves_scroll, mini(known.size(), _moves_scroll + n_vis)):
		var id: String = known[j]
		var q := j - _moves_scroll
		var rr := Rect2(R.position.x + (q % 2) * (cw + 8.0), y + (q / 2) * (rh + 6.0), cw, rh)
		var mv := BattleEnergy.move(id)
		var on := id in eq
		var col := EnergyIcon.color(BattleEnergy.energy_of(String(mv.get("type", "normal"))))
		_button("mv:" + id, rr, String(mv.get("name", id)).to_upper(), func(): _toggle_move(m, id, cap), col, false, on)
	if known.size() > n_vis:
		_button("mv:more", Rect2(R.end.x - 262.0, y - 40.0, 130.0, 34.0), "MORE ▼" if _moves_scroll + n_vis < known.size() else "TOP ▲", func(): _moves_scroll = _moves_scroll + n_vis if _moves_scroll + n_vis < known.size() else 0, UITheme.INK)

func _toggle_move(m: Dictionary, id: String, cap: int) -> void:
	var eq: Array = m.get("equip", [])
	if id in eq: eq.erase(id)
	elif eq.size() < cap: eq.append(id)
	else:
		toast("%d move slots at this level" % cap, UITheme.ORANGE); Sfx.ui("ui_error"); return
	m["equip"] = eq
	if eq.is_empty(): m.erase("equip")

func _trim_equip(m: Dictionary) -> void:
	if not m.has("equip"): return
	var kn := ArenaSetups.known_moves(String(m.species), int(m.level))
	var cap := ArenaSetups.slots(String(m.species), int(m.level))
	var eq: Array = (m.equip as Array).filter(func(x): return x in kn)
	if eq.size() > cap: eq = eq.slice(0, cap)
	m["equip"] = eq
	if eq.is_empty(): m.erase("equip")

# ---------- SAVED ----------
func _saved(body: Rect2) -> void:
	var list := ArenaSetups.load_all()
	_button("save", Rect2(body.position.x, body.position.y, 420.0, 52.0), "SAVE THIS SETUP", func(): toast("Saved: " + ArenaSetups.save_one(setup)), UITheme.GREEN, true)
	_label(Vector2(body.position.x + 440.0, body.position.y + 32.0), ArenaSetups.title(setup).to_upper() + "  ·  USER://ARENA_SETUPS.JSON", UITheme.INK_SOFT, 14)
	var y := body.position.y + 70.0
	if list.is_empty():
		_label(Vector2(body.position.x, y + 30.0), "NO SAVED SETUPS YET", UITheme.INK_SOFT, 18)
	for i in mini(list.size(), int((body.end.y - y) / 58.0)):
		var e: Dictionary = list[i]
		var rr := Rect2(body.position.x, y + i * 58.0, body.size.x - 360.0, 50.0)
		var idx := i
		UITheme.fill(self, UITheme.para_points(rr, UITheme.SKEW * 0.5), Color(UITheme.INK, 0.07 * k))
		UITheme.text_mid(self, rr.position + Vector2(24, 25), String(e.get("name", "?")).to_upper(), "heading", 24, Color(UITheme.INK, k))
		var s: Dictionary = e.get("setup", {})
		var detail := ""
		if String(s.get("type", "")) == "trainer":
			detail = " · ".join((s.get("ash", []) as Array).map(func(m): return ArenaSetups.species_name(String(m.species)))) + "  VS  " + " · ".join((s.get("foe", {}).get("party", []) as Array).map(func(m): return ArenaSetups.species_name(String(m.species))))
		elif String(s.get("type", "")) == "hunt":
			detail = " · ".join((s.get("hunt", {}).get("species", []) as Array).map(func(id): return ArenaSetups.species_name(String(id))))
		UITheme.text_mid(self, Vector2(rr.end.x - 16.0, rr.position.y + 25.0), detail.to_upper(), "label", 13, Color(UITheme.INK_SOFT, k), 2)
		_button("load:%d" % i, Rect2(rr.end.x + 14.0, rr.position.y, 170.0, 50.0), "LOAD", func(): _load(idx), UITheme.SKY)
		_button("del:%d" % i, Rect2(rr.end.x + 194.0, rr.position.y, 150.0, 50.0), "DELETE", func(): ArenaSetups.delete_one(idx); toast("Deleted", UITheme.RED), UITheme.RED)

func _load(i: int) -> void:
	var list := ArenaSetups.load_all()
	if i >= list.size(): return
	var s: Dictionary = list[i].get("setup", {})
	var d := ArenaSetups.default_setup()
	for key in d: if not s.has(key): s[key] = d[key]
	setup = s.duplicate(true)
	name_edit.text = String(setup.foe.name)
	toast("Loaded: " + String(list[i].get("name", "")))
	_go(String(setup.get("type", "trainer")))

# ---------- RESULTS ----------
func _results(body: Rect2) -> void:
	var r: Dictionary = results
	var won := String(r.get("outcome", "")) == "ash_won"
	var oc := String(r.get("outcome", ""))
	var head: String = {"ash_won": "ASH WINS!", "ash_down": "ASH LOST", "ran": "GOT AWAY", "fled": "IT FLED", "disengaged": "IT LOST INTEREST"}.get(oc, oc.to_upper())
	if String(setup.type) == "trainer" and oc == "ash_down": head = "%s WINS" % String(setup.foe.name).to_upper()
	var col := UITheme.GREEN if won else (UITheme.RED if oc == "ash_down" else UITheme.SKY)
	var hr := Rect2(body.position.x, body.position.y, body.size.x, 76.0)
	UITheme.fill(self, UITheme.para_points(hr), Color(UITheme.INK, k))
	UITheme.accent_bar(self, hr, Color(col, k), k, UITheme.SKEW, 10.0)
	UITheme.text_mid(self, hr.position + Vector2(36, 38), head, "display", 50, Color(col, k))
	var sub := "%s  ·  %d TURNS" % [ArenaSetups.title(setup).to_upper(), int(r.get("turns", 0))]
	UITheme.text_mid(self, Vector2(hr.end.x - 30.0, hr.position.y + 38.0), sub, "heading", 22, Color(UITheme.TEXT, k), 2)
	var pr: Dictionary = r.get("party", {})
	var y := hr.end.y + 24.0
	if pr.is_empty():
		# the prologue: Ash's stamina, its HP
		_label(Vector2(body.position.x, y + 20.0), "ASH'S STAMINA LEFT", UITheme.INK_SOFT, 16)
		UITheme.bar(self, Rect2(body.position.x, y + 34.0, 420.0, 16.0), float(r.get("stamina", 0.0)), UITheme.GREEN, k)
		_label(Vector2(body.position.x + 520.0, y + 20.0), "%s'S HP LEFT" % ArenaSetups.species_name(String(r.get("species", ""))).to_upper(), UITheme.INK_SOFT, 16)
		UITheme.text(self, Vector2(body.position.x + 520.0, y + 60.0), str(int(r.get("foe_hp", 0))), "display", 36, Color(UITheme.INK, k))
		return
	var half := (body.size.x - 40.0) * 0.5
	for side in ["a", "b"]:
		var x := body.position.x + (0.0 if side == "a" else half + 40.0)
		UITheme.text(self, Vector2(x, y + 22.0), "ASH" if side == "a" else (String(setup.foe.name).to_upper() if String(setup.type) == "trainer" else "WILD"), "display", 28, Color(UITheme.INK, k))
		var list: Array = pr.get(side, [])
		for i in list.size():
			var m: Dictionary = list[i]
			var rr := Rect2(x, y + 38.0 + i * 50.0, half, 44.0)
			UITheme.fill(self, UITheme.para_points(rr, UITheme.SKEW * 0.5), Color(UITheme.INK, 0.07 * k))
			PkmnHud.draw_ball(self, rr.position + Vector2(24, 22), 10.0, "fainted" if m.fainted else "ok")
			var nw := UITheme.text_mid(self, rr.position + Vector2(44, 22), String(m.name).to_upper(), "heading", 22, Color(UITheme.INK, k))
			UITheme.text_mid(self, rr.position + Vector2(50 + nw, 24), "Lv%d" % int(m.level), "label", 14, Color(UITheme.INK_SOFT, k))
			var hk := float(m.hp) / maxf(1.0, float(m.max_hp))
			UITheme.bar(self, Rect2(rr.end.x - 300.0, rr.position.y + 17.0, 120.0, 10.0), hk, UITheme.GREEN if hk > 0.5 else (UITheme.YELLOW if hk > 0.2 else UITheme.RED), k)
			var st := "FAINTED" if m.fainted else ("NOT USED" if not m.get("used", true) else "%d / %d HP" % [int(m.hp), int(m.max_hp)])
			UITheme.text_mid(self, Vector2(rr.end.x - 172.0, rr.position.y + 22.0), st, "label", 14, Color(UITheme.RED if m.fainted else UITheme.INK, k))
			if int(m.get("kos", 0)) > 0: UITheme.chip(self, Vector2(rr.end.x - 64.0, rr.position.y + 12.0), "%d KO" % int(m.kos), UITheme.YELLOW, UITheme.INK, 12, 20.0, k)

# ---------- input ----------
func _input(e: InputEvent) -> void:
	if not _open or k < 0.6: return
	var typing := search.has_focus() or name_edit.has_focus()
	if typing:
		if e.is_action_pressed("ui_cancel") or (e is InputEventKey and e.pressed and e.keycode in [KEY_ENTER, KEY_ESCAPE]):
			search.release_focus(); name_edit.release_focus(); _h()
		elif e is InputEventScreenTouch and e.pressed:
			var lp0: Vector2 = get_global_transform_with_canvas().affine_inverse() * e.position
			var on_edit := false
			for le in [search, name_edit]:
				if le.visible and Rect2(le.position, le.size).has_point(lp0): on_edit = true
			if not on_edit: search.release_focus(); name_edit.release_focus()
		if typing and not (e is InputEventScreenTouch or e is InputEventMouseButton): return
	# touch / mouse: a tap on a widget; a drag on the grid scrolls it
	var pos := Vector2.INF
	if e is InputEventScreenTouch: pos = e.position
	elif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	if e is InputEventMouseButton and e.pressed and e.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		_rows.grid = int(_rows.grid) + (1 if e.button_index == MOUSE_BUTTON_WHEEL_DOWN else -1); _h(); return
	if pos != Vector2.INF:
		var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
		if e.pressed:
			_drag = {"at": lp, "row": int(_rows.grid), "moved": false, "grid": not _grid.is_empty() and Rect2(_grid.r).has_point(lp)}
		else:
			if not _drag.is_empty() and not _drag.moved and Engine.get_process_frames() != _tap_frame:
				_tap_frame = Engine.get_process_frames()
				_tap(_drag.at)
			_drag = {}
		_h(); return
	if (e is InputEventScreenDrag or e is InputEventMouseMotion) and not _drag.is_empty():
		var lp2: Vector2 = get_global_transform_with_canvas().affine_inverse() * e.position
		var dy: float = lp2.y - _drag.at.y
		if absf(dy) > 14.0 or absf(lp2.x - _drag.at.x) > 14.0: _drag.moved = true
		if _drag.grid and _drag.moved:
			_rows.grid = int(_drag.row) - int(round(dy / (Vector2(_grid.cell).y + 8.0)))
		_h(); return
	# pad / keys
	var dir := Vector2.ZERO
	if e.is_action_pressed("ui_left") or e.is_action_pressed("move_left"): dir = Vector2.LEFT
	elif e.is_action_pressed("ui_right") or e.is_action_pressed("move_right"): dir = Vector2.RIGHT
	elif e.is_action_pressed("ui_up") or e.is_action_pressed("move_up"): dir = Vector2.UP
	elif e.is_action_pressed("ui_down") or e.is_action_pressed("move_down"): dir = Vector2.DOWN
	if dir != Vector2.ZERO:
		_nav(dir); _h(); return
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"):
		for x in W:
			if x.id == focus: _press(x); break
		_h(); return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		if page == "slot": _go("trainer")
		else: close()
		_h(); return
	if e.is_action_pressed("menu"): close(); _h()

func _h() -> void: get_viewport().set_input_as_handled()

func _tap(p: Vector2) -> void:
	for i in range(W.size() - 1, -1, -1):
		var x: Dictionary = W[i]
		if UITheme.touch_rect(self, x.r).has_point(p):
			focus = x.id
			_press(x)
			return
	if not panel_rect().has_point(p): close()

func _press(x: Dictionary) -> void:
	if x.kind != "edit" and x.kind != "cell": Sfx.ui("ui_confirm")
	var fn: Callable = x.fn
	if fn.is_valid(): fn.call()

# the pad: the nearest widget in that direction (the grid moves by cells, scrolling)
func _nav(dir: Vector2) -> void:
	var cur = null
	for x in W:
		if x.id == focus: cur = x
	if cur == null:
		focus = _default_focus(); return
	if String(cur.id).begins_with("sp:") and not _grid.is_empty():
		var list: Array = _grid.list
		var ids := list.map(func(s): return "sp:" + String(s.id))
		var i := ids.find(cur.id)
		var cols: int = _grid.cols
		var j := i
		if dir == Vector2.DOWN: j = i + cols
		elif dir == Vector2.UP: j = i - cols
		elif dir == Vector2.LEFT and i % cols > 0: j = i - 1
		elif dir == Vector2.RIGHT and i % cols < cols - 1 and i + 1 < list.size(): j = i + 1
		if j != i and j >= 0 and j < list.size():
			var row := j / cols
			if row < int(_rows.grid): _rows.grid = row
			elif row >= int(_rows.grid) + int(_grid.rows_vis): _rows.grid = row - int(_grid.rows_vis) + 1
			focus = ids[j]
			Sfx.ui("ui_cursor")
			return
	var c: Vector2 = Rect2(cur.r).get_center()
	var best := ""
	var bs := INF
	for x in W:
		if x.id == cur.id: continue
		var d: Vector2 = Rect2(x.r).get_center() - c
		var along := d.dot(dir)
		if along <= 4.0: continue
		var across := absf(d.dot(Vector2(-dir.y, dir.x)))
		var sc := along + across * 2.2
		if sc < bs: bs = sc; best = x.id
	if best != "":
		focus = best
		Sfx.ui("ui_cursor")
