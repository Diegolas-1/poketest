extends CanvasLayer
# The phone while the game is on a TV (made by screens.gd, in the phone's own
# viewport): a second-screen companion in the UI design system's look.
#   - the header: PALLET TOWN, and a "Playing on TV" pill with the TV's name and mode
#   - a live preview of the TV's picture, and Pause / Resume (the game keeps playing
#     on the TV while this is up; Pause stops it, as Start does on the controller)
#   - the start menu (the island menu's rows: Pokémon, Bike, Quest log, Settings,
#     and the ones still to come), by touch: Pokémon, Bike and the quest log open on
#     the TV, Settings opens here
#   - how to go back to the phone (stop mirroring, or unplug)
# The Dynamic Island's compass keeps going round the island (island.gd).

var screens: Node
var root: Control
var bg: Control
var preview_frame: Control
var preview: TextureRect
var pause_btn: UIButton
var rows_c: Control
var info: Control
var _rows: Array = []        # [rect, id, label, enabled]
var _down := -1
var _flash := {}             # row index -> time left of its press flash
var _note := ""              # a short line under the menu ("Opened on the TV")
var _note_t := 0.0
var _a := 0.0
var _shown := false
var _entries_key := ""
var _t := 0.0

const ROW_H := 78.0

func _ready() -> void:
	layer = 90
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	root = Control.new()
	root.name = "Companion"
	root.theme = UITheme.theme()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(root)
	bg = Control.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.draw.connect(_draw_bg)
	root.add_child(bg)
	preview_frame = Control.new()
	preview_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview_frame.draw.connect(_draw_preview_frame)
	root.add_child(preview_frame)
	preview = TextureRect.new()
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	preview_frame.add_child(preview)
	pause_btn = UIButton.new()
	pause_btn.name = "Pause"
	pause_btn.variant = "primary"
	pause_btn.font_size = 26
	pause_btn.focus_mode = Control.FOCUS_NONE
	pause_btn.pressed.connect(func(): if screens: screens.pause_tv(not screens.tv_paused))
	root.add_child(pause_btn)
	rows_c = Control.new()
	rows_c.mouse_filter = Control.MOUSE_FILTER_STOP
	rows_c.draw.connect(_draw_rows)
	rows_c.gui_input.connect(_rows_input)
	root.add_child(rows_c)
	info = Control.new()
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info.draw.connect(_draw_info)
	root.add_child(info)
	root.resized.connect(_layout)
	get_viewport().size_changed.connect(_layout)

func show_companion(on: bool) -> void:
	_shown = on
	if on:
		if not visible: _a = 0.0; root.modulate.a = 0.0
		visible = true
		preview.texture = screens.game.get_texture() if screens else null
		_layout()
		refresh()
	else:
		preview.texture = null
	_set_satellites(not on)

# the cog by the island: the menu here has Settings
func _set_satellites(on: bool) -> void:
	if Settings.menu and Settings.menu.cog: Settings.menu.cog.visible = on

func refresh() -> void:
	if screens == null: return
	var paused: bool = screens.tv_paused
	pause_btn.text = "Resume" if paused else "Pause"
	pause_btn.icon_id = "play" if paused else "pause"
	pause_btn.variant = "yellow" if paused else "primary"
	_layout()
	_redraw()

func _redraw() -> void:
	bg.queue_redraw(); rows_c.queue_redraw(); info.queue_redraw(); preview_frame.queue_redraw()

func _island():
	return screens.main.get("island") if screens and screens.main else null

# ---------- layout ----------
# the safe area, clear of the Dynamic Island and its compass ring
func _area() -> Rect2:
	var S := UITheme.safe_rect(root)
	var isl = _island()
	if isl and is_instance_valid(isl) and int(isl.side) != 0:
		var hr: Rect2 = isl.halo()
		if int(isl.side) < 0: S = Rect2(Vector2(maxf(S.position.x, hr.end.x + 54.0), S.position.y), Vector2(S.end.x - maxf(S.position.x, hr.end.x + 54.0), S.size.y))
		else: S.size.x = minf(S.size.x, hr.position.x - 54.0 - S.position.x)
	return S.grow_individual(-8.0, -16.0, -18.0, -14.0)

func _layout() -> void:
	if root == null or not is_inside_tree(): return
	var A := _area()
	var col_w := minf(A.size.x * 0.48, 640.0)
	var top := A.position.y + 104.0
	# the preview: 16:9 (the TV's shape when known), as wide as the column
	var asp := 16.0 / 9.0
	if screens and screens.tv and int(screens.tv.status.height) > 0: asp = float(screens.tv.status.width) / float(screens.tv.status.height)
	var bottom_room := 64.0 + 18.0 + 70.0
	var pw := col_w
	var ph := pw / asp
	if top + ph + bottom_room > A.end.y:
		ph = maxf(120.0, A.end.y - bottom_room - top)
		pw = ph * asp
	preview_frame.position = Vector2(A.position.x, top)
	preview_frame.size = Vector2(pw, ph)
	preview.position = Vector2(6, 6)
	preview.size = preview_frame.size - Vector2(12, 12)
	pause_btn.position = Vector2(A.position.x, top + ph + 18.0)
	pause_btn.size = Vector2(pw, 64.0)
	pause_btn.custom_minimum_size = pause_btn.size
	# the menu: the right column
	var rx := A.position.x + col_w + 48.0
	rows_c.position = Vector2(rx, top - 4.0)
	rows_c.size = Vector2(maxf(240.0, A.end.x - rx), A.end.y - top + 4.0 - 40.0)
	info.position = Vector2.ZERO
	info.size = root.size
	_rows.clear()
	var ents: Array = _entries()
	var rh := minf(ROW_H, (rows_c.size.y - 40.0) / maxf(1.0, ents.size()))
	for i in ents.size():
		var e: Array = ents[i]
		_rows.append([Rect2(0.0, 40.0 + i * rh, rows_c.size.x - 12.0, rh - 8.0), e[0], e[1], e[2]])
	_redraw()

func _entries() -> Array:
	var isl = _island()
	if isl and is_instance_valid(isl) and isl.has_method("entries"): return isl.entries()
	return []

# ---------- input: the menu's rows by touch (or the mouse) ----------
func _rows_input(e: InputEvent) -> void:
	if not (e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT): return
	var i := _row_at(e.position)
	if e.pressed:
		_down = i
		rows_c.queue_redraw()
	else:
		if i != -1 and i == _down: _choose(i)
		_down = -1
		rows_c.queue_redraw()
	rows_c.accept_event()

func _row_at(p: Vector2) -> int:
	for i in _rows.size():
		if (_rows[i][0] as Rect2).grow(4.0).has_point(p): return i
	return -1

func _choose(i: int) -> void:
	var r: Array = _rows[i]
	if not r[3]:
		Sfx.ui("ui_toggle_off")
		_say("Coming soon")
		return
	Sfx.ui("ui_confirm")
	_flash[i] = 0.35
	var id: String = r[1]
	var isl = _island()
	if id in ["quests", "party"] and screens.tv_paused: screens.pause_tv(false)   # (their own screens pause the game)
	if isl: isl.run_entry(id)
	match id:
		"settings": _say("")
		"quests": _say("Quest log open on the TV")
		"party": _say("Your Pokémon are on the TV")
		"bike": _say("On the TV: %s" % ("riding" if screens.main.cast and screens.main.cast.bike and screens.main.cast.bike.riding() else "off the bike"))
	_layout()

func _say(t: String) -> void:
	_note = t
	_note_t = 2.6 if t != "" else 0.0
	info.queue_redraw()

func _process(dt: float) -> void:
	if not visible: return
	_t += dt
	var want := 1.0 if _shown else 0.0
	if _a != want:
		_a = move_toward(_a, want, dt / UITheme.BASE)
		root.modulate.a = UITheme.ease_out(_a)
		if _a <= 0.0 and not _shown: visible = false
	if not _flash.is_empty():
		for k in _flash.keys():
			_flash[k] -= dt
			if _flash[k] <= 0.0: _flash.erase(k)
		rows_c.queue_redraw()
	if _note_t > 0.0:
		_note_t -= dt
		info.queue_redraw()
	# the rows follow the game (the bike's row says Get off while riding)
	var key := str(_entries())
	if key != _entries_key:
		_entries_key = key
		_layout()
	# the live dot pulses
	info.queue_redraw()
	if screens and pause_btn.text != ("Resume" if screens.tv_paused else "Pause"): refresh()

# ---------- drawing ----------
func _draw_bg() -> void:
	var vs := bg.size
	var r := Rect2(Vector2.ZERO, vs)
	UITheme.fill_v(bg, PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]), Color("101830"), Color("070b17"))
	# a slanted band of lighter ink behind the menu, and the ball's mark
	var A := _area()
	var x0 := A.position.x + minf(A.size.x * 0.48, 640.0) + 16.0
	UITheme.fill(bg, PackedVector2Array([Vector2(x0 + 60.0, 0), Vector2(vs.x, 0), Vector2(vs.x, vs.y), Vector2(x0 - 60.0, vs.y)]), Color(1, 1, 1, 0.03))
	UIDialogPanel._ball_mark(bg, Vector2(vs.x - 150.0, vs.y - 130.0), 360.0, Color(1, 1, 1, 0.025))
	# the header
	var y := A.position.y + 46.0
	UITheme.text(bg, Vector2(A.position.x, y), "PALLET TOWN", "display", UITheme.fs("title"), UITheme.TEXT)
	var tw := UITheme.text_w("PALLET TOWN", "display", UITheme.fs("title"))
	UITheme.chevrons(bg, Vector2(A.position.x + tw + 14.0, y - 26.0), 24.0, UITheme.RED, 3)
	UITheme.text(bg, Vector2(A.position.x, y + 30.0), "SECOND SCREEN", "label", 17, UITheme.TEXT_DIM)

func _draw_info() -> void:
	if screens == null: return
	var A := _area()
	# the "Playing on TV" pill, top right
	var tv: TVLink = screens.tv
	var name := tv.display_name().to_upper() if tv else "TV"
	var mode := "%d × %d · %d HZ" % [int(tv.status.width), int(tv.status.height), int(tv.status.hz)] if tv else ""
	var lab := "PLAYING ON " + name
	var w1 := UITheme.text_w(lab, "label", 20)
	var w2 := UITheme.text_w(mode, "label_semi", 16)
	var pw := maxf(w1, w2) + 90.0
	var pr := Rect2(A.end.x - pw, A.position.y + 6.0, pw, 62.0)
	var pts := UITheme.plate(info, pr, 1.0, UITheme.SKEW, UITheme.PLATE, 0.0)
	UITheme.outline(info, pts, Color(1, 1, 1, 0.14), 1.0)
	UITheme.accent_bar(info, pr, UITheme.GREEN, 1.0, UITheme.SKEW, 4.0)
	var pulse := 0.5 + 0.5 * sin(_t * 3.2)
	var dc := Vector2(pr.position.x + 30.0, pr.get_center().y)
	UITheme.glow(info, dc, 12.0 + pulse * 4.0, UITheme.GREEN, 0.6)
	info.draw_circle(dc, 7.0, UITheme.GREEN, true, -1.0, true)
	UITheme.text(info, Vector2(pr.position.x + 52.0, pr.position.y + 28.0), lab, "label", 20, UITheme.TEXT)
	UITheme.text(info, Vector2(pr.position.x + 52.0, pr.position.y + 50.0), mode, "label_semi", 16, UITheme.TEXT_DIM)
	# under the preview's button: how to go back to the phone
	var y := pause_btn.position.y + pause_btn.size.y + 34.0
	var lines := UITheme.wrap("Your controller plays on the TV, Start pauses. To play on the phone again, stop Screen Mirroring in Control Centre (or unplug).", "body", 17, preview_frame.size.x)
	for i in mini(lines.size(), 3):
		UITheme.text(info, Vector2(A.position.x, y + i * 22.0), lines[i], "body", 17, UITheme.TEXT_DIM)
	# a note after a choice, under the menu
	if _note_t > 0.0 and _note != "":
		var k := clampf(_note_t / 0.3, 0.0, 1.0)
		UITheme.chip(info, Vector2(rows_c.position.x, A.end.y - 26.0), _note.to_upper(), Color(UITheme.YELLOW, k), UITheme.INK, 15, 26.0, k)

func _draw_preview_frame() -> void:
	var r := Rect2(Vector2.ZERO, preview_frame.size)
	UITheme.shadow(preview_frame, UITheme.chamfer_points(r, UITheme.CUT), 1.0, Vector2(0, 8))
	preview_frame.draw_colored_polygon(UITheme.chamfer_points(r, UITheme.CUT), Color("05070d"))
	UITheme.outline(preview_frame, UITheme.chamfer_points(r, UITheme.CUT), Color(1, 1, 1, 0.22), 1.5)
	UITheme.accent_bar(preview_frame, Rect2(r.position.x, r.end.y - 4.0, r.size.x, 4.0), UITheme.RED, 1.0, 0.0, 4.0)
	# on top of the picture: drawn by a child after it
	if not preview_frame.has_node("Over"):
		var ov := Control.new()
		ov.name = "Over"
		ov.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ov.set_anchors_preset(Control.PRESET_FULL_RECT)
		ov.draw.connect(_draw_preview_over.bind(ov))
		preview_frame.add_child(ov)
	preview_frame.get_node("Over").queue_redraw()

func _draw_preview_over(ov: Control) -> void:
	var paused: bool = screens != null and screens.tv_paused
	UITheme.chip(ov, Vector2(18.0, 18.0), "PAUSED" if paused else "LIVE", UITheme.YELLOW if paused else UITheme.RED, UITheme.INK if paused else Color.WHITE, 15, 26.0)
	if paused: ov.draw_rect(Rect2(Vector2(6, 6), ov.size - Vector2(12, 12)), Color(0.02, 0.03, 0.08, 0.45))

func _draw_rows() -> void:
	UITheme.text(rows_c, Vector2(4.0, 26.0), "MENU", "display", 30, UITheme.TEXT)
	var mw := UITheme.text_w("MENU", "display", 30)
	UITheme.chevrons(rows_c, Vector2(mw + 18.0, 6.0), 20.0, UITheme.RED, 3)
	for i in _rows.size():
		var r: Array = _rows[i]
		var rr: Rect2 = r[0]
		var on: bool = r[3]
		var hot := i == _down or _flash.has(i)
		var k := 1.0 if on else 0.42
		var pts := UITheme.para_points(rr)
		UITheme.fill(rows_c, pts, Color(1, 1, 1, (0.16 if hot else 0.08) if on else 0.035))
		if on: UITheme.accent_bar(rows_c, rr, _col(r[1]), 1.0, UITheme.SKEW, 5.0 if hot else 4.0)
		var ic := Vector2(rr.position.x + 44.0, rr.get_center().y)
		UIWidgets.icon_disc(rows_c, ic, 25.0, _col(r[1]), "", k)
		UITheme.icon(rows_c, _icon(r[1]), ic, 13.5, Color(1, 1, 1, k))
		var ty := rr.get_center().y + (10.0 if on else -2.0)
		UITheme.text(rows_c, Vector2(rr.position.x + 86.0, ty), String(r[2]).to_upper(), "label", 30, Color(1, 1, 1, k))
		if not on:
			UITheme.chip(rows_c, Vector2(rr.position.x + 86.0, ty + 10.0), "COMING SOON", Color(UITheme.YELLOW, 0.9), UITheme.INK, 13, 20.0)
		else:
			var where := "ON THIS PHONE" if r[1] == "settings" else "ON THE TV"
			UITheme.text(rows_c, Vector2(rr.end.x - 28.0, rr.get_center().y + 7.0), where, "label_semi", 15, UITheme.TEXT_DIM, 2)

func _col(id: String) -> Color:
	return {"quests": UITheme.YELLOW, "settings": UITheme.BLUE, "dex": UITheme.RED, "bag": UITheme.ORANGE, "map": UITheme.GREEN, "bike": UITheme.SKY, "party": UITheme.RED}.get(id, Color.GRAY)

func _icon(id: String) -> String:
	return {"quests": "log", "settings": "cog", "dex": "ball", "bag": "bag", "map": "map", "bike": "bike", "party": "ball"}.get(id, id)
