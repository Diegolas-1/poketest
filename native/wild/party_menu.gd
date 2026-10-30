class_name PartyMenu
extends Control
# The in-world POKéMON menu (cast.gd makes it, on the HUD's layer): Ash's party
# (AshParty) in the UI kit's look, to send one out to walk with him or call it back
# (ash_companions.gd: up to two out), and in an ambush to pick the one that goes in
# (ambush.gd: open("ambush", picked)). Opened from the Poké Ball button above A (touch,
# and shown with its glyph on a pad or keyboard), the pad's R3 or P on the keyboard,
# or the Dynamic Island's menu. The game waits while it is open.
#   open(ctx := "field", on_pick := Callable())   ctx "field" | "ambush"; on_pick(i) (-1: closed)
#   close()   is_open()   blocks(pos)

var cast: Node
var game: Node
var ctx := "field"
var on_pick: Callable = Callable()
var sel := 0
var k := 0.0
var _open := false
var _was_paused := false
var _rows: Array = []            # [Rect2] this frame's rows
var _toast := {}
var t := 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not InputMap.has_action("party"):
		InputMap.add_action("party")
		var ev := InputEventKey.new(); ev.physical_keycode = KEY_P
		InputMap.action_add_event("party", ev)
		var jb := InputEventJoypadButton.new(); jb.button_index = JOY_BUTTON_RIGHT_STICK
		InputMap.action_add_event("party", jb)

func comps() -> AshCompanions: return cast.get("companions")
func party() -> Array: return AshParty.members(game)
func is_open() -> bool: return _open

# the button is there: outside, on foot, nothing else holding the controls, a party to show
func button_on() -> bool:
	if cast == null or _open or Battle.active or bool(game.get("indoors")) or bool(game.get("trans_busy")): return false
	if cast.busy() and not (cast.wild and cast.wild.ambush and String(cast.wild.ambush.cur.get("state", "")) == "standoff"): return false
	if cast.bike and cast.bike.riding(): return false
	return not party().is_empty()

func button_rect() -> Rect2:
	var S := UITheme.safe_rect(self)
	return Rect2(S.end.x - 66.0 - 32.0, S.end.y - 138.0 - 104.0, 64.0, 64.0)

func blocks(pos: Vector2) -> bool:
	return _open or (button_on() and button_rect().grow(8).has_point(pos))

func open(c := "field", pick := Callable()) -> void:
	if _open: return
	ctx = c
	on_pick = pick
	_open = true
	sel = 0
	var P := party()
	var cm := comps()
	# (the ambush's: the first one still in its ball)
	if ctx == "ambush" and cm:
		for i in P.size():
			if not cm.is_out(String(P[i].species)): sel = i; break
	_was_paused = get_tree().paused
	get_tree().paused = true
	Sfx.ui("ui_menu_open")
	visible = true

func close(picked := -1) -> void:
	if not _open: return
	_open = false
	get_tree().paused = _was_paused
	Sfx.ui("ui_menu_close")
	var cb := on_pick
	on_pick = Callable()
	if cb.is_valid(): cb.call(picked)

func _process(dt: float) -> void:
	t += dt
	k = clampf(k + (dt / 0.18 if _open else -dt / 0.14), 0.0, 1.0)
	queue_redraw()

func _input(e: InputEvent) -> void:
	if not _open:
		var tap = null
		if e is InputEventScreenTouch and e.pressed: tap = e.position
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: tap = e.position
		var hit: bool = tap != null and button_on() and button_rect().grow(8).has_point(tap)
		if hit or (e.is_action_pressed("party") and button_on()):
			get_viewport().set_input_as_handled()
			_from_button()
		return
	get_viewport().set_input_as_handled()
	var n := party().size()
	if e.is_action_pressed("move_up") or e.is_action_pressed("ui_up"): sel = (sel - 1 + n) % maxi(1, n); Sfx.ui("ui_cursor")
	elif e.is_action_pressed("move_down") or e.is_action_pressed("ui_down"): sel = (sel + 1) % maxi(1, n); Sfx.ui("ui_cursor")
	elif e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): _pick(sel)
	elif e.is_action_pressed("back") or e.is_action_pressed("ui_cancel") or e.is_action_pressed("party"): close(-1)
	else:
		var tap2 = null
		if e is InputEventScreenTouch and e.pressed: tap2 = e.position
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: tap2 = e.position
		if tap2 != null:
			for i in _rows.size():
				if (_rows[i] as Rect2).has_point(tap2):
					if sel == i or UIInput.device == "touch": _pick(i)
					else: sel = i
					return
			if not _panel().has_point(tap2): close(-1)

# the button (or R3 / P): in an ambush's standoff it is the ambush's menu
func _from_button() -> void:
	var am = cast.wild.ambush if cast.wild else null
	if am and String(am.cur.get("state", "")) == "standoff":
		am._open_menu()
		return
	open("field")

func _pick(i: int) -> void:
	var P := party()
	if i < 0 or i >= P.size(): return
	var cm := comps()
	var sp := String(P[i].species)
	if ctx == "ambush":
		Sfx.ui("ui_confirm")
		close(i)
		return
	if cm == null: return
	if cm.is_out(sp):
		Sfx.ui("ui_confirm")
		close(-1)
		cm.recall_species(sp)
		return
	if cm.count() >= cm.cap():
		_toast = {"text": "Two are out already: call one back first", "t": t}
		Sfx.ui("ui_error")
		return
	Sfx.ui("ui_confirm")
	close(-1)
	cm.send_out(i)

func _panel() -> Rect2:
	var S := UITheme.safe_rect(self)
	var n := maxi(1, party().size())
	var w := minf(560.0, S.size.x - 40.0)
	var h := 84.0 + n * 66.0 + 64.0
	return Rect2(S.get_center().x - w * 0.5, S.get_center().y - h * 0.5 + (1.0 - UITheme.ease_out(k)) * 40.0, w, h)

func _draw() -> void:
	_rows = []
	if button_on() and k <= 0.0: _button()
	if k <= 0.0: return
	var vs := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, vs), Color(UITheme.DIM, UITheme.DIM.a * k))
	var P := party()
	var cm := comps()
	var R := _panel()
	UITheme.panel(self, R, UITheme.RED, k)
	var x := R.position.x + 30.0
	var title := "SEND ONE OUT!" if ctx == "ambush" else "POKéMON"
	UITheme.text(self, Vector2(x, R.position.y + 54.0), title, "display", 42, Color(UITheme.INK, k))
	var outn := cm.count() if cm else 0
	UITheme.text(self, Vector2(R.end.x - 30.0, R.position.y + 50.0), "%d / %d OUT WITH ASH" % [outn, cm.cap() if cm else 2], "label", 15, Color(UITheme.INK_SOFT, k), 2)
	var y := R.position.y + 84.0
	for i in P.size():
		var m: Dictionary = P[i]
		var sp := String(m.species)
		var rr := Rect2(x, y, R.size.x - 60.0, 56.0)
		_rows.append(rr)
		var pts := UITheme.para_points(rr, UITheme.SKEW * 0.4)
		var on := i == sel
		UITheme.fill(self, pts, Color(UITheme.INK, k) if on else Color(UITheme.INK, 0.06 * k))
		var ty: Array = BattleEnergy.species_data(sp).get("types", ["normal"])
		var tc := EnergyIcon.color(BattleEnergy.energy_of(String(ty[0])))
		UITheme.para(self, Rect2(rr.position.x + 6.0, rr.position.y + 7.0, 7.0, rr.size.y - 14.0), Color(tc, k), UITheme.SKEW * 0.4)
		var col := UITheme.WHITE if on else UITheme.INK
		UITheme.icon(self, "ball", Vector2(rr.position.x + 36.0, rr.get_center().y), 11.0, Color(UITheme.RED if not (cm and cm.is_out(sp)) else UITheme.GREEN, k))
		UITheme.text_mid(self, Vector2(rr.position.x + 60.0, rr.get_center().y), AshParty.name_of(m).to_upper(), "heading", 26, Color(col, k))
		UITheme.text_mid(self, Vector2(rr.position.x + 280.0, rr.get_center().y), "Lv %d" % int(m.get("level", 5)), "label", 16, Color(col, 0.75 * k))
		var out: bool = cm != null and cm.is_out(sp)
		var tag := "OUT" if out else "IN BALL"
		if on: tag = ("GO!" if not out else "IN BATTLE") if ctx == "ambush" else ("RECALL" if out else "SEND OUT")
		var cw := UITheme.text_w(tag, "label", 14) + 22.0
		UITheme.chip(self, Vector2(rr.end.x - cw - 12.0, rr.get_center().y - 12.0), tag, UITheme.GREEN if out else (UITheme.RED if on else UITheme.INK_SOFT), UITheme.WHITE, 14, 24.0, k)
		if on and UIInput.device != "touch": UITheme.outline(self, pts, Color(UITheme.YELLOW, k), 3.0)
		y += 66.0
	var hint_y := R.end.y - 30.0
	var hx := x
	hx += UITheme.glyph(self, Vector2(hx + 14.0, hint_y), "use", 26.0, k) + 12.0
	hx += UITheme.text_mid(self, Vector2(hx, hint_y), "GO!" if ctx == "ambush" else "SEND OUT / RECALL", "label", 15, Color(UITheme.INK, k)) + 26.0
	hx += UITheme.glyph(self, Vector2(hx + 14.0, hint_y), "back", 26.0, k) + 12.0
	UITheme.text_mid(self, Vector2(hx, hint_y), "CLOSE", "label", 15, Color(UITheme.INK, k))
	if not _toast.is_empty() and t - float(_toast.t) < 2.0:
		var tw := UITheme.text_w(String(_toast.text), "heading", 20) + 44.0
		var tr := Rect2(R.get_center().x - tw * 0.5, R.end.y + 12.0, tw, 40.0)
		UITheme.plate(self, tr, k)
		UITheme.accent_bar(self, tr, Color(UITheme.ORANGE, k), k, UITheme.SKEW, 6.0)
		UITheme.text_mid(self, tr.get_center(), String(_toast.text), "heading", 20, Color(UITheme.TEXT, k), 1)

# the Poké Ball button above A: a ball on a dark disc, the ones out as pips
func _button() -> void:
	var r := button_rect()
	var c := r.get_center()
	var rad := 27.0
	draw_circle(c + Vector2(0, 3), rad + 1.0, Color(0, 0, 0, 0.28), true, -1.0, true)
	draw_circle(c, rad, Color(UITheme.PLATE, 0.62), true, -1.0, true)
	draw_arc(c, rad - 1.0, 0.0, TAU, 36, Color(1, 1, 1, 0.6), 2.0, true)
	UITheme.icon(self, "ball", c + Vector2(0, -5), 10.0, Color.WHITE)
	UITheme.text_mid(self, c + Vector2(0, 12), "POKéMON", "label", 10, Color(1, 1, 1, 0.9), 1)
	var cm := comps()
	var n := cm.count() if cm else 0
	for i in n: draw_circle(c + Vector2(-5.0 + i * 10.0, -rad - 6.0), 3.6, Color(UITheme.GREEN, 1.0), true, -1.0, true)
	if UIInput.device != "touch": UITheme.glyph(self, c + Vector2(rad - 2.0, rad - 4.0), "party", 20.0)
