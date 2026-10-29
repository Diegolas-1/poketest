class_name PkmnHud
extends Control
# The Pokemon-vs-Pokemon battle HUD for iPhone landscape (design/energy_system.md,
# "The look"), over any 3D arena. Everything sits inside the safe area (UITheme.
# safe_rect; safe_override pretends one for shots), so nothing is under the
# notch or the home indicator:
#   bottom left    the player's nameplate: name, level, status, HP bar and numbers,
#                  a committed move's badge (UNDERGROUND...), LOCKED IN
#   top right      the opponent's nameplate, its focus bar and pools under it
#                  (the same EnergyBar; its locks face down)
#   bottom right   the player's focus bar and pools; above it the menu
#                  (FIGHT, POKEMON, ITEMS, FLEE) or, after FIGHT, the move list with
#                  the chip costs, every known move (locked ones at the bottom) and
#                  END TURN; the moves queued this turn in a strip above it
#   top left       the battle's line (what just happened)
# A new chip with a choice of pools: the pools pulse; tap one (or 1-4 / arrows + A).
#
#   var hud := PkmnHud.new(); layer.add_child(hud); hud.bind(battle)
#   hud.show_menu() / hud.show_fight() / hud.show_pick() / hud.busy()
#   hud.say(text, colour)
#   signals: command(name), move_picked(id), end_turn(), pool_picked(kind), undo()
# With a party (battle/pkmn_party.gd, the Battle Arena's trainer battles):
#   each nameplate carries the side's six Poké Balls (healthy, fainted, empty);
#   hud.show_party(forced) lists Ash's team to send one out (B backs out unless
#   forced: after a faint); signals party_picked(index), party_cancel()
#   hud.log_on = true: the top left keeps the battle's last lines as a log (the
#   newest bright, older ones dimmer) instead of one line that fades
# Doubles (battle/pkmn_doubles.gd): the main plates show the one choosing / the
#   first foe, a smaller plate each the other one out; hud.choosing names whose
#   turn it is to choose; hud.show_targets(labels) asks where a move goes
#   ("WHO|NAME" each); signals target_picked(index), target_cancel()

signal command(name: String)
signal move_picked(id: String)
signal end_turn()
signal pool_picked(kind: String)
signal undo()
signal party_picked(index: int)
signal party_cancel()
signal target_picked(index: int)
signal target_cancel()

const MENU := [["fight", "FIGHT", "ee3b33"], ["pokemon", "POKéMON", "3fcf72"], ["items", "ITEMS", "ffcb05"], ["flee", "FLEE", "3fb6f5"]]
const PLATE_W := 400.0
const RIGHT_W := 440.0
const M := 16.0                  # margin inside the safe area

var battle: PkmnBattle
var safe_override := Rect2()
var bar_a: EnergyBar
var bar_b: EnergyBar
var moves: EnergyMoveList
var moves_clip: Control          # clips the move list to its rect (a long list scrolls; it never runs over the bar below)
var mode := "busy"               # busy | menu | fight | pick
var sel := 0                     # the menu's selection
var t := 0.0
var _line := {}
var _hp := {"a": 1.0, "b": 1.0}  # eased HP fractions
var _appear := {"menu": 0.0, "fight": 0.0}
var _tap_frame := -1
var party: PkmnParty             # the teams, when the battle has them
var log_on := false              # the log at the top left (the Battle Arena)
var log_lines: Array = []        # [{text, col, t}]
const LOG_N := 5
var party_sel := 0
var party_forced := false
var doubles: PkmnDoubles
var choosing := ""
var targets: Array = []
var target_sel := 0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar_b = EnergyBar.new()
	bar_b.side = "foe"
	bar_b.align_right = true
	bar_b.owner_view = false
	bar_b.input_enabled = false
	add_child(bar_b)
	bar_a = EnergyBar.new()
	bar_a.side = "ally"
	bar_a.align_right = true
	bar_a.owner_view = true
	add_child(bar_a)
	bar_a.pool_tapped.connect(func(k): if mode == "pick": pool_picked.emit(k))
	moves = EnergyMoveList.new()
	moves.bar_preview = bar_a
	moves.reach_fn = _reach
	moves.show_end = true
	moves.visible = false
	moves.input_enabled = false
	moves_clip = Control.new()
	moves_clip.clip_contents = true
	moves_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(moves_clip)
	moves_clip.add_child(moves)
	moves.picked.connect(func(id): move_picked.emit(id))
	moves.end_turn.connect(func(): end_turn.emit())

func bind(b: PkmnBattle) -> void:
	battle = b
	party = b as PkmnParty
	doubles = b as PkmnDoubles
	bar_a.bind(b.fighter("a").e)
	bar_b.bind(b.fighter("b").e)
	bar_a.title = b.fighter("a").name
	bar_b.title = b.fighter("b").name
	for s in ["a", "b"]: _hp[s] = float(b.fighter(s).hp) / b.fighter(s).max_hp
	_layout()

func sr() -> Rect2:
	return UITheme.safe_rect(self, safe_override)

# ---------- modes ----------
func show_menu() -> void:
	mode = "menu"
	moves.visible = false
	_appear.menu = 0.0

func show_fight() -> void:
	mode = "fight"
	var e: BattleEnergy = battle.fighter("a").e
	moves.bind(e, e.known)
	moves.visible = true
	moves.select(0)
	moves._preview()
	_appear.fight = 0.0

# a move that can't touch the foe where it is (underground, in the air, underwater)
func _reach(id: String) -> String:
	if battle == null: return ""
	var semi: String = battle.fighter("b").e.semi()
	if not semi in ["underground", "airborne", "underwater"]: return ""
	if PkmnBattle.targets_self(id) or BattleEnergy.role_of(id) == "reaction": return ""
	if PkmnBattle.interaction(id, semi).get("hits", false):
		var mult := float(PkmnBattle.interaction(id, semi).get("mult", 1.0))
		return "REACHES IT%s" % (": DOUBLE DAMAGE" if mult > 1.0 else "")
	return "CAN'T REACH IT: %s" % {"underground": "UNDERGROUND", "airborne": "IN THE AIR", "underwater": "UNDERWATER"}[semi]

func refresh_moves() -> void:
	if mode == "fight": moves.queue_redraw()

func show_pick() -> void:
	mode = "pick"
	moves.visible = false

func busy() -> void:
	mode = "busy"
	moves.visible = false
	bar_a.clear_preview()

func say(text: String, col := UITheme.YELLOW) -> void:
	if text == "": return
	_line = {"text": text, "col": col, "t": t}
	if log_lines.is_empty() or String(log_lines.back().text) != text:
		log_lines.append({"text": text, "col": col, "t": t})
		while log_lines.size() > LOG_N: log_lines.pop_front()

# the party list: send one out (forced after a faint: no backing out)
func show_party(forced := false) -> void:
	if party == null: return
	mode = "party"
	party_forced = forced
	moves.visible = false
	party_sel = 0
	for i in party.team.a.size():
		if party.can_switch("a", i): party_sel = i; break
	_appear["party"] = 0.0

func show_targets(labels: Array) -> void:
	mode = "target"
	targets = labels
	target_sel = 0
	moves.visible = false
	_appear["target"] = 0.0

func target_rect(i: int) -> Rect2:
	var S := sr()
	var wd := 300.0
	var n := targets.size()
	var x0 := S.get_center().x - (n * wd + (n - 1) * 20.0) * 0.5
	return Rect2(x0 + i * (wd + 20.0), S.get_center().y - 10.0, wd, 84.0)

func _in_battle(i: int) -> bool:
	if doubles: return i in doubles.place.a
	return i == int(party.active.a)

func party_rect() -> Rect2:
	var S := sr()
	var n: int = party.team.a.size() if party else 6
	var w := 520.0
	var h := 64.0 + n * 62.0
	return Rect2(S.end.x - M - w - 10.0, S.position.y + (S.size.y - h) * 0.5 - 20.0, w, h)

func party_row(i: int) -> Rect2:
	var r := party_rect()
	return Rect2(r.position.x + 18.0, r.position.y + 54.0 + i * 62.0, r.size.x - 36.0, 54.0)

# ---------- layout ----------
func _rects() -> Dictionary:
	var S := sr()
	var plate_b := Rect2(S.end.x - M - PLATE_W, S.position.y + M + 4.0, PLATE_W, 100.0 if party else 78.0)
	var bar_b_r := Rect2(S.end.x - M - RIGHT_W - 60.0, plate_b.end.y + 18.0, RIGHT_W + 60.0, 72.0)
	var plate_a := Rect2(S.position.x + M, S.end.y - M - 98.0, PLATE_W, 98.0)
	var bar_a_r := Rect2(S.end.x - M - RIGHT_W - 60.0, S.end.y - M - 84.0, RIGHT_W + 60.0, 84.0)
	var menu := Rect2(S.end.x - M - RIGHT_W, bar_a_r.position.y - 20.0 - 122.0, RIGHT_W, 122.0)
	var mv_top := bar_b_r.end.y + 44.0
	var mlist := Rect2(S.end.x - M - RIGHT_W, mv_top, RIGHT_W, bar_a_r.position.y - 40.0 - mv_top)   # (clear of the bar's TURN tag above it)
	var line := Rect2(S.position.x + M, S.position.y + M + 4.0, minf(560.0, S.size.x - PLATE_W - 3 * M - 20.0), 46.0 if not log_on else 34.0 + LOG_N * 27.0)
	return {"plate_a": plate_a, "plate_b": plate_b, "bar_a": bar_a_r, "bar_b": bar_b_r, "menu": menu, "moves": mlist, "line": line, "safe": S}

func _layout() -> void:
	var R := _rects()
	bar_a.fit(R.bar_a)
	bar_b.fit(R.bar_b)
	# the clip: room at the sides for the selected row's nudge and the shadows,
	# next to none at the bottom (the player's bar and its tag start just below)
	moves_clip.position = R.moves.position - Vector2(48, 8)
	moves_clip.size = R.moves.size + Vector2(96, 8 + 4)
	moves.position = Vector2(48, 8)
	moves.size = R.moves.size

func menu_rect(i: int) -> Rect2:
	var r: Rect2 = _rects().menu
	var w := (r.size.x - 12.0) * 0.5
	var h := (r.size.y - 10.0) * 0.5
	return Rect2(r.position + Vector2((i % 2) * (w + 12.0) - (i / 2) * h * UITheme.SKEW, (i / 2) * (h + 10.0)), Vector2(w, h))

# ---------- input ----------
func _unhandled_input(e: InputEvent) -> void:
	if battle == null or battle.over: return
	if mode == "party":
		_party_input(e)
		return
	if mode == "target":
		_target_input(e)
		return
	if mode == "fight":
		if (e.is_action_pressed("back") or e.is_action_pressed("ui_cancel")) and not battle.queued("a").is_empty():
			undo.emit(); get_viewport().set_input_as_handled(); return
		if moves.handle(e): get_viewport().set_input_as_handled()
		return
	if mode == "pick":
		var pk: Array = battle.fighter("a").e.pool_kinds()
		if e is InputEventKey and e.pressed and not e.echo and e.keycode >= KEY_1 and e.keycode < KEY_1 + pk.size():
			pool_picked.emit(pk[e.keycode - KEY_1]); get_viewport().set_input_as_handled()
		return
	if mode != "menu": return
	if e.is_action_pressed("ui_left") or e.is_action_pressed("move_left"): _sel(sel - 1 if sel % 2 == 1 else sel)
	elif e.is_action_pressed("ui_right") or e.is_action_pressed("move_right"): _sel(sel + 1 if sel % 2 == 0 else sel)
	elif e.is_action_pressed("ui_up") or e.is_action_pressed("move_up"): _sel(sel - 2 if sel >= 2 else sel)
	elif e.is_action_pressed("ui_down") or e.is_action_pressed("move_down"): _sel(sel + 2 if sel < 2 else sel)
	elif e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): _cmd(sel)
	else:
		var pos := Vector2.INF
		if e is InputEventScreenTouch and e.pressed: pos = e.position
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
		if pos == Vector2.INF or Engine.get_process_frames() == _tap_frame: return
		_tap_frame = Engine.get_process_frames()
		var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
		for i in 4:
			if UITheme.touch_rect(self, menu_rect(i)).has_point(lp): _cmd(i); break
		return
	get_viewport().set_input_as_handled()

func _party_input(e: InputEvent) -> void:
	var n: int = party.team.a.size()
	var handled := true
	if e.is_action_pressed("ui_up") or e.is_action_pressed("move_up"): party_sel = (party_sel - 1 + n) % n; Sfx.ui("ui_cursor")
	elif e.is_action_pressed("ui_down") or e.is_action_pressed("move_down"): party_sel = (party_sel + 1) % n; Sfx.ui("ui_cursor")
	elif e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): _party_pick(party_sel)
	elif (e.is_action_pressed("back") or e.is_action_pressed("ui_cancel")) and not party_forced:
		Sfx.ui("ui_back"); party_cancel.emit()
	else:
		handled = false
		var pos := Vector2.INF
		if e is InputEventScreenTouch and e.pressed: pos = e.position
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
		if pos != Vector2.INF and Engine.get_process_frames() != _tap_frame:
			_tap_frame = Engine.get_process_frames()
			var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
			handled = true
			var hit := false
			for i in n:
				if UITheme.touch_rect(self, party_row(i)).has_point(lp): hit = true; party_sel = i; _party_pick(i)
			if not hit and not party_forced and not party_rect().has_point(lp): party_cancel.emit()
	if handled: get_viewport().set_input_as_handled()

func _target_input(e: InputEvent) -> void:
	var n := targets.size()
	var handled := true
	if e.is_action_pressed("ui_left") or e.is_action_pressed("move_left"): target_sel = (target_sel - 1 + n) % n; Sfx.ui("ui_cursor")
	elif e.is_action_pressed("ui_right") or e.is_action_pressed("move_right"): target_sel = (target_sel + 1) % n; Sfx.ui("ui_cursor")
	elif e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): Sfx.ui("ui_confirm"); target_picked.emit(target_sel)
	elif e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"): Sfx.ui("ui_back"); target_cancel.emit()
	else:
		handled = false
		var pos := Vector2.INF
		if e is InputEventScreenTouch and e.pressed: pos = e.position
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
		if pos != Vector2.INF and Engine.get_process_frames() != _tap_frame:
			_tap_frame = Engine.get_process_frames()
			var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
			handled = true
			for i in n:
				if UITheme.touch_rect(self, target_rect(i)).has_point(lp): target_sel = i; Sfx.ui("ui_confirm"); target_picked.emit(i)
	if handled: get_viewport().set_input_as_handled()

func _party_pick(i: int) -> void:
	if not party.can_switch("a", i):
		Sfx.ui("ui_toggle_off")
		return
	Sfx.ui("ui_confirm")
	party_picked.emit(i)

func _sel(i: int) -> void:
	if i != sel: Sfx.ui("ui_cursor")
	sel = clampi(i, 0, 3)

func _cmd(i: int) -> void:
	sel = i
	Sfx.ui("ui_confirm")
	command.emit(String(MENU[i][0]))

# ---------- frame ----------
func _process(dt: float) -> void:
	t += dt
	for k in _appear: _appear[k] = minf(1.0, _appear[k] + dt / UITheme.BASE)
	if battle:
		for s in ["a", "b"]:
			var f = battle.fighter(s)
			_hp[s] = move_toward(_hp[s], float(f.hp) / f.max_hp, dt * 0.9)
	_layout()
	queue_redraw()

func _draw() -> void:
	if battle == null: return
	var R := _rects()
	_plate(R.plate_b, battle.fighter("b"), false)
	_plate(R.plate_a, battle.fighter("a"), true)
	if log_on: _log(R.line)
	elif not _line.is_empty() and t - float(_line.t) < 2.4:
		var ck := UITheme.ease_out_expo((t - float(_line.t)) / 0.25)
		var fade := clampf((2.4 - (t - float(_line.t))) / 0.3, 0.0, 1.0)
		var r: Rect2 = R.line
		r.position.x += (1.0 - ck) * -40.0
		var a := ck * fade
		UITheme.plate(self, r, a, UITheme.SKEW, UITheme.PLATE_HI, 10)
		UITheme.para(self, Rect2(r.position, Vector2(8, r.size.y)), Color(_line.col, a), UITheme.SKEW)
		UITheme.text_mid(self, r.position + Vector2(24, r.size.y * 0.5), String(_line.text).to_upper(), "heading", 21, Color(UITheme.TEXT, a), 0)
	if mode == "menu": _menu()
	if mode == "fight": _queued(R)
	if mode == "party": _party_list()
	if mode == "target": _target_list()
	if doubles: _doubles_plates(R)
	if choosing != "" and mode in ["menu", "fight", "pick"]:
		var cw := UITheme.text_w("CHOOSING FOR " + choosing, "label", 15) + 30.0
		UITheme.chip(self, Vector2(R.bar_a.end.x - cw - 10.0, R.bar_a.position.y - 34.0 - (150.0 if mode == "menu" else 0.0)), "CHOOSING FOR " + choosing, UITheme.SKY, UITheme.INK, 15, 26.0)

# doubles: the other one out on each side, a smaller plate beside the main one
func _doubles_plates(R: Dictionary) -> void:
	for side in ["a", "b"]:
		for f in doubles.actives(side):
			if f == null or f == battle.fighter(side): continue
			var r: Rect2
			if side == "b": r = Rect2(R.plate_b.position.x - 300.0, R.plate_b.position.y, 280.0, 64.0)
			else: r = Rect2(R.plate_a.end.x + 22.0, R.plate_a.end.y - 64.0, 280.0, 64.0)
			var pts := UITheme.plate(self, r, 0.9, UITheme.SKEW, UITheme.PLATE, 8)
			UITheme.outline(self, pts, Color(1, 1, 1, 0.08), 1.0)
			UITheme.para(self, Rect2(r.position + Vector2(14, -4), Vector2(70, 5)), UITheme.SKY if side == "a" else UITheme.YELLOW)
			var a := 0.45 if f.fainted() else 1.0
			var nw := UITheme.text(self, r.position + Vector2(22, 28), String(f.name).to_upper(), "display", 22, Color(UITheme.TEXT, a))
			UITheme.text(self, r.position + Vector2(28 + nw, 28), "Lv%d" % int(f.level), "heading", 15, Color(UITheme.TEXT_DIM, a))
			var hk := float(f.hp) / maxf(1.0, f.max_hp)
			UITheme.bar(self, Rect2(r.position + Vector2(24, 40), Vector2(r.size.x - 60.0, 10)), hk, UITheme.GREEN if hk > 0.5 else (UITheme.YELLOW if hk > 0.2 else UITheme.RED), a, 0)
			if f.fainted(): UITheme.chip(self, Vector2(r.end.x - 90.0, r.position.y + 10.0), "FAINTED", UITheme.RED, UITheme.WHITE, 12, 20.0)

func _target_list() -> void:
	var ap := UITheme.ease_out(float(_appear.get("target", 1.0)))
	var S := sr()
	UITheme.text_mid(self, Vector2(S.get_center().x, target_rect(0).position.y - 34.0), "WHERE DOES IT GO?", "display", 34, Color(UITheme.YELLOW, ap), 1, 6)
	for i in targets.size():
		var r := target_rect(i)
		r.position.y += (1.0 - ap) * 50.0
		var on := i == target_sel
		var parts := String(targets[i]).split("|")
		var pts := UITheme.para_points(r)
		UITheme.shadow(self, pts, ap, Vector2(0, 5))
		if on: UITheme.fill_v(self, pts, Color(UITheme.WHITE, ap), Color(UITheme.PAPER, ap))
		else: UITheme.fill(self, pts, Color(UITheme.PLATE_HI, ap))
		var col := UITheme.SKY if parts[0] == "ALLY" else UITheme.RED
		UITheme.accent_bar(self, r, Color(col, ap), ap, UITheme.SKEW, 9.0 if on else 6.0)
		UITheme.text(self, r.position + Vector2(30, 30), parts[0], "label", 15, Color(col, ap))
		UITheme.text(self, r.position + Vector2(30, 66), parts[1] if parts.size() > 1 else "", "display", 32, Color(UITheme.INK if on else UITheme.TEXT, ap))

# the battle log: the last lines, newest at the bottom and brightest
func _log(r: Rect2) -> void:
	if log_lines.is_empty(): return
	UITheme.plate(self, r, 0.92, UITheme.SKEW * 0.25, UITheme.PLATE, 10)
	UITheme.text(self, r.position + Vector2(20, 24), "BATTLE LOG", "label", 14, UITheme.TEXT_DIM)
	UITheme.text(self, Vector2(r.end.x - 18.0, r.position.y + 24.0), "TURN %d" % battle.turn, "label", 14, UITheme.YELLOW, 2)
	var n := log_lines.size()
	for i in n:
		var L: Dictionary = log_lines[i]
		var age := n - 1 - i
		var a := 1.0 if age == 0 else maxf(0.42, 0.85 - age * 0.12)
		var y := r.position.y + 50.0 + (LOG_N - n + i) * 27.0
		var ck := UITheme.ease_out_expo((t - float(L.t)) / 0.25) if age == 0 else 1.0
		var x := r.position.x + 22.0 + (1.0 - ck) * -24.0
		UITheme.para(self, Rect2(Vector2(x, y - 9.0), Vector2(5, 18)), Color(L.col, a * ck), UITheme.SKEW)
		UITheme.text_mid(self, Vector2(x + 14.0, y), String(L.text), "body_bold" if age == 0 else "body", 19 if age == 0 else 17, Color(UITheme.TEXT, a * ck), 0)

# six Poké Balls for a side: healthy, fainted (grey), empty (an outline)
func _balls(at: Vector2, side: String, r := 7.5) -> void:
	if party == null: return
	var sl: Array = party.slots(side)
	for i in sl.size():
		var c := at + Vector2(i * (r * 2.0 + 5.0), 0)
		draw_ball(self, c, r, String(sl[i]), i == int(party.active[side]))

static func draw_ball(ci: CanvasItem, c: Vector2, r: float, state: String, out := false) -> void:
	if state == "empty":
		ci.draw_arc(c, r - 1.0, 0.0, TAU, 20, Color(1, 1, 1, 0.28), 1.5, true)
		return
	var top := UITheme.RED if state == "ok" else Color(0.42, 0.42, 0.48)
	var bot := UITheme.WHITE if state == "ok" else Color(0.62, 0.62, 0.66)
	if out: ci.draw_arc(c, r + 3.0, 0.0, TAU, 24, Color(UITheme.YELLOW, 0.9), 2.0, true)
	ci.draw_circle(c, r, bot, true, -1.0, true)
	var pts := PackedVector2Array()
	for k in 17: pts.append(c + Vector2(cos(PI + PI * k / 16.0), sin(PI + PI * k / 16.0)) * r)
	ci.draw_colored_polygon(pts, top)
	ci.draw_line(c - Vector2(r, 0), c + Vector2(r, 0), UITheme.INK, maxf(1.5, r * 0.22), true)
	ci.draw_circle(c, r * 0.36, UITheme.INK, true, -1.0, true)
	ci.draw_circle(c, r * 0.22, bot, true, -1.0, true)
	if state == "fainted": ci.draw_line(c + Vector2(-r, -r) * 0.7, c + Vector2(r, r) * 0.7, Color(UITheme.RED, 0.9), 2.0, true)

func _party_list() -> void:
	var ap := UITheme.ease_out(float(_appear.get("party", 1.0)))
	var r := party_rect()
	r.position.x += (1.0 - ap) * 60.0
	UITheme.panel(self, r, UITheme.GREEN, ap)
	UITheme.text(self, r.position + Vector2(22, 38), "CHOOSE A POKéMON" if party_forced else "SWITCH POKéMON", "display", 30, Color(UITheme.INK, ap))
	if not party_forced:
		UITheme.text(self, Vector2(r.end.x - 22.0, r.position.y + 36.0), "B: BACK" if UIInput.device != "touch" else "TAP OUTSIDE: BACK", "label", 14, Color(UITheme.INK_SOFT, ap), 2)
	for i in party.team.a.size():
		var f = party.team.a[i]
		var rr := party_row(i)
		rr.position.x += (1.0 - ap) * (30.0 + i * 12.0)
		var on: bool = i == party_sel
		var can: bool = party.can_switch("a", i)
		var a := ap * (1.0 if can or _in_battle(i) else 0.55)
		if on:
			UITheme.shadow(self, UITheme.para_points(rr), a, Vector2(0, 3))
			UITheme.fill(self, UITheme.para_points(rr), Color(UITheme.INK, a))
		else:
			UITheme.fill(self, UITheme.para_points(rr), Color(UITheme.INK, 0.08 * a))
		var tc := UITheme.TEXT if on else UITheme.INK
		draw_ball(self, rr.position + Vector2(30, 27), 11.0, "fainted" if f.fainted() else "ok", false)
		var nw := UITheme.text(self, rr.position + Vector2(52, 34), String(f.name).to_upper(), "heading", 26, Color(tc, a))
		UITheme.text(self, rr.position + Vector2(60 + nw, 34), "Lv%d" % int(f.level), "label", 16, Color(tc, a * 0.7))
		var hk := float(f.hp) / maxf(1.0, f.max_hp)
		var hb := Rect2(rr.position + Vector2(rr.size.x - 214.0, 14), Vector2(190, 10))
		UITheme.bar(self, hb, hk, UITheme.GREEN if hk > 0.5 else (UITheme.YELLOW if hk > 0.2 else UITheme.RED), a, 0)
		UITheme.text(self, Vector2(hb.end.x, hb.end.y + 21.0), "%d / %d HP" % [int(f.hp), int(f.max_hp)], "number", 15, Color(tc, a), 2)
		var tag := ""
		if _in_battle(i): tag = "IN BATTLE"
		elif f.fainted(): tag = "FAINTED"
		elif f.status != "": tag = String(f.status).to_upper()
		if tag != "": UITheme.chip(self, Vector2(hb.position.x, hb.end.y + 6.0), tag, Color(UITheme.SKY if tag == "IN BATTLE" else UITheme.RED, a), UITheme.WHITE, 12, 18.0)
		UITheme.text(self, rr.position + Vector2(54, 50), "FOCUS %d%%" % int(f.e.focus), "label", 12, Color(tc, a * 0.7))


func _plate(r: Rect2, f, own: bool) -> void:
	var pts := UITheme.plate(self, r, 1.0, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
	UITheme.outline(self, pts, Color(1, 1, 1, 0.1), 1.0)
	UITheme.para(self, Rect2(r.position + Vector2(18, -5), Vector2(120, 6)), UITheme.SKY if own else UITheme.YELLOW)
	var e: BattleEnergy = f.e
	var nx := r.position.x + 28.0
	var ny := r.position.y + 36.0
	var nw := UITheme.text(self, Vector2(nx, ny), String(f.name).to_upper(), "display", 32, UITheme.TEXT)
	UITheme.text(self, Vector2(nx + nw + 8.0, ny), "Lv%d" % int(f.level), "heading", 19, UITheme.TEXT_DIM)
	# status and states, right-aligned on the top row
	var tags := []
	var st := {"para": ["PAR", "f2b91a"], "sleep": ["SLP", "8a8fa3"], "poison": ["PSN", "ad3c9c"], "burn": ["BRN", "e5432c"]}
	if st.has(f.status): tags.append(st[f.status])
	if int(f.confused) > 0: tags.append(["CNF", "e37cbd"])
	var semi := e.semi()
	var semi_t := {"underground": ["UNDERGROUND", "c08a4a"], "airborne": ["IN THE AIR", "3fb6f5"], "underwater": ["UNDERWATER", "2f6fd6"], "charging": ["CHARGING", "ffcb05"]}
	if semi_t.has(semi): tags.append(semi_t[semi])
	if e.locked_in: tags.append(["LOCKED IN", "ffcb05"])
	var tx := r.end.x - 18.0
	for tg in tags:
		var w := UITheme.text_w(tg[0], "label", 13) + 18.0
		tx -= w + 6.0
		var pulse := 0.85 + 0.15 * sin(t * 5.0) if tg[0] in ["UNDERGROUND", "IN THE AIR", "UNDERWATER", "LOCKED IN", "CHARGING"] else 1.0
		UITheme.chip(self, Vector2(tx, r.position.y + 12.0), tg[0], Color(Color(tg[1]), pulse), UITheme.INK, 13, 21.0)
	# HP
	var hk: float = _hp[f.side]
	var col := UITheme.GREEN if hk > 0.5 else (UITheme.YELLOW if hk > 0.2 else UITheme.RED)
	var bar := Rect2(r.position + Vector2(58, 52), Vector2(r.size.x - 104.0, 15))
	UITheme.text_mid(self, bar.position + Vector2(-30, 7.5), "HP", "label", 16, UITheme.YELLOW)
	UITheme.bar(self, bar, hk, col, 1.0, 0)
	if party:
		_balls(Vector2(r.position.x + 40.0, r.position.y + 86.0), f.side)
	if own:
		var hp_now := int(round(hk * f.max_hp))
		UITheme.text(self, Vector2(r.end.x - 34.0, r.position.y + 90.0), "%d / %d" % [hp_now, int(f.max_hp)], "number", 22, UITheme.TEXT, 2)

func _menu() -> void:
	var ap := UITheme.ease_out(float(_appear.menu))
	for i in 4:
		var r := menu_rect(i)
		r.position.x += (1.0 - ap) * 40.0
		var on := i == sel
		var col := Color(String(MENU[i][2]))
		if on:
			UITheme.shadow(self, UITheme.para_points(r), ap, Vector2(0, 4))
			UITheme.fill_v(self, UITheme.para_points(r), Color(UITheme.WHITE, ap), Color(UITheme.PAPER, ap))
		else:
			UITheme.plate(self, r, ap)
		UITheme.accent_bar(self, r, Color(col, ap), ap, UITheme.SKEW, 8.0 if on else 6.0)
		UITheme.text_mid(self, r.position + Vector2(28, r.size.y * 0.5), String(MENU[i][1]), "display", 30, Color(UITheme.INK if on else UITheme.TEXT, ap))
		if on and UIInput.device != "touch": UITheme.glyph(self, Vector2(r.end.x - 30, r.get_center().y), "use", 26.0, ap)

func _queued(R: Dictionary) -> void:
	var q: Array = battle.queued("a")
	var r: Rect2 = R.moves
	var strip := Rect2(r.position + Vector2(0, -38), Vector2(r.size.x, 30))
	UITheme.plate(self, strip, 0.9, UITheme.SKEW, UITheme.PLATE, 8)
	var x := strip.position.x + 18.0
	var cy := strip.get_center().y
	x += UITheme.text_mid(self, Vector2(x, cy), "THIS TURN", "label", 13, UITheme.TEXT_DIM) + 10.0
	if q.is_empty():
		UITheme.text_mid(self, Vector2(x, cy), "PICK MOVES, THEN END TURN", "label", 13, Color(UITheme.TEXT, 0.7))
		return
	for i in q.size():
		var nm := String(BattleEnergy.move(q[i]).get("name", q[i])).to_upper()
		if i > 0: x += UITheme.text_mid(self, Vector2(x, cy), "›", "heading", 16, UITheme.TEXT_DIM) + 6.0
		x += UITheme.chip(self, Vector2(x, cy - 10.0), nm, EnergyIcon.color(BattleEnergy.energy_of(String(BattleEnergy.move(q[i]).get("type", "normal")))), UITheme.WHITE, 12, 20.0) + 6.0
	var g := "B: UNDO" if UIInput.device != "touch" else ""
	if g != "": UITheme.text_mid(self, Vector2(strip.end.x - 16.0, cy), g, "label", 12, UITheme.TEXT_DIM, 2)
