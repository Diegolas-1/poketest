class_name PkmnHud
extends Control
# The Pokemon-vs-Pokemon battle HUD for iPhone landscape (design/energy_system.md,
# "The look"), over any 3D arena. Everything sits inside the safe area (UITheme.
# safe_rect; safe_override pretends one for shots), so nothing is under the
# notch or the home indicator:
#   top left       the opponent's nameplate: name and level, its energy on the
#                  name line's right (an icon and a count per pool: the same
#                  EnergyBar, compact; its locks face down), the HP bar with the
#                  focus as a thin strip along its bottom, status tags under it
#   bottom left    the player's pools (the EnergyBar's trays, to tap in the pick)
#   bottom right   the player's nameplate: name, level, status, the HP bar and its
#                  focus strip, the numbers; above it the menu (FIGHT, POKEMON,
#                  ITEMS, FLEE)
#   top right      the battle's ticker: the last line or two, fading; LOG (the L
#                  button, or a tap) opens the whole battle's log, by turn, to scroll
# FIGHT opens the FIGHT window (ui/pkmn_fight.gd): the moves, the energy, the
# turn's queue (reorder, remove), BACK and CONFIRM. Only CONFIRM ends the turn; B
# never does (in the window it goes back, in the menu it does nothing).
# A new chip with a choice of pools opens the energy pick at the start of the
# turn: a tile per pool, with what each one would make usable (left / right, A;
# a tap on a tile or on a tray of the bar).
# Every list steps once a press (UIInput.Nav: held, it repeats after a pause, ~8 a second).
#
#   var hud := PkmnHud.new(); layer.add_child(hud); hud.bind(battle)
#   hud.show_menu() / hud.show_fight() / hud.show_pick() / hud.busy()
#   hud.say(text, colour)
#   signals: command(name), move_picked(id), end_turn() (CONFIRM), pool_picked(kind),
#     undo(), fight_cancel(), queue_remove(index), queue_reorder(from, to)
# With a party (battle/pkmn_party.gd, the Battle Arena's trainer battles):
#   each nameplate carries the side's six Poké Balls (healthy, fainted, empty);
#   hud.show_party(forced) lists Ash's team to send one out (B backs out unless
#   forced: after a faint); signals party_picked(index), party_cancel()
#   hud.log_all: every line of the battle ({text, col, t, turn}); log_lines the last few
# Doubles (battle/pkmn_doubles.gd): the main plates show the one choosing / the
#   first foe, a smaller plate each the other one out; hud.choosing names whose
#   turn it is to choose; hud.show_targets(labels) asks where a move goes
#   ("WHO|NAME" each); signals target_picked(index), target_cancel()
# ITEMS (command "items"): hud.show_bag(pockets) opens the bag, a pocket a tab
#   ([{id, label, items: [{id, name, n, desc}], note, dim}], n -1: unlimited): Poké
#   Balls, medicine, battle items (left / right: the pocket, up / down, A; a tap
#   on a tab or a row; B or a tap outside: back); signals item_picked(pocket, id),
#   bag_cancel(). show_targets(labels, title) also asks which of his an item is for.

signal command(name: String)
signal move_picked(id: String)
signal end_turn()
signal pool_picked(kind: String)
signal undo()
signal fight_cancel()
signal queue_remove(index: int)
signal queue_reorder(from: int, to: int)
signal party_picked(index: int)
signal party_cancel()
signal target_picked(index: int)
signal target_cancel()
signal item_picked(pocket: String, id: String)
signal bag_cancel()

const MENU := [["fight", "FIGHT", "ee3b33"], ["pokemon", "POKéMON", "3fcf72"], ["items", "ITEMS", "ffcb05"], ["flee", "FLEE", "3fb6f5"]]
const PLATE_W := 430.0
const SMALL_W := 300.0           # doubles: the other one out's plate
const RIGHT_W := 440.0
const M := 16.0                  # margin inside the safe area

var battle: PkmnBattle
var safe_override := Rect2():
	set(v): safe_override = v; if fight: fight.safe_override = v
var bar_a: EnergyBar
var bar_b: EnergyBar
var fight: PkmnFightWindow
var mode := "busy"               # busy | menu | fight | pick | party | target | bag
var sel := 0                     # the menu's selection
var t := 0.0
var _line := {}
var _hp := {"a": 1.0, "b": 1.0}  # eased HP fractions
var _appear := {"menu": 0.0, "fight": 0.0}
var party: PkmnParty             # the teams, when the battle has them
var log_on := false              # (kept for callers: the ticker and its log are always there)
var log_lines: Array = []        # the last LOG_N lines [{text, col, t}]
var log_all: Array = []          # every line of the battle [{text, col, t, turn}]
var log_open := false            # the whole log, open over the battle
var log_scroll := 0.0
const LOG_N := 5
const TICK_T := 5.0              # a ticker line fades after this long
var party_sel := 0
var party_forced := false
var doubles: PkmnDoubles
var choosing := ""
var targets: Array = []
var target_sel := 0
var target_title := "WHERE DOES IT GO?"
var bag: Array = []              # show_bag: [{id, label, items: [{id, name, n, desc}], note, dim}]
var bag_tab := 0
var bag_sel := 0
var _bag_sels := {}              # the cursor kept per pocket
const BAG_ROWS := 4
var pick_opts: Array = []        # the energy pick's tiles: [{kind, room, unlocks, ready}]
var pick_sel := 0
var nav := UIInput.Nav.new()
var _tap_frame := -1
var _log_press := {}
var _bump := {}                  # "menu:i" | "pick:i" -> t (a press: a little pop)

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar_b = EnergyBar.new()
	bar_b.side = "foe"
	bar_b.align_right = true
	bar_b.compact = true
	bar_b.owner_view = false
	bar_b.input_enabled = false
	add_child(bar_b)
	bar_a = EnergyBar.new()
	bar_a.side = "ally"
	bar_a.align_right = false
	bar_a.focus_row = false
	bar_a.owner_view = true
	add_child(bar_a)
	bar_a.pool_tapped.connect(func(k): if mode == "pick": _pick(k))
	fight = PkmnFightWindow.new()
	fight.reach_fn = _reach
	fight.safe_override = safe_override
	add_child(fight)
	fight.add_move.connect(func(id): move_picked.emit(id))
	fight.remove_at.connect(func(i): queue_remove.emit(i))
	fight.reorder.connect(func(a, b): queue_reorder.emit(a, b))
	fight.confirm.connect(func(): end_turn.emit())
	fight.cancel.connect(func(): fight_cancel.emit())

func bind(b: PkmnBattle) -> void:
	battle = b
	party = b as PkmnParty
	doubles = b as PkmnDoubles
	bar_a.bind(b.fighter("a").e)
	bar_b.bind(b.fighter("b").e)
	bar_a.title = b.fighter("a").name
	bar_b.title = b.fighter("b").name
	for s in ["a", "b"]: _hp[s] = float(b.fighter(s).hp) / b.fighter(s).max_hp
	if mode == "fight": fight.open(b)
	_layout()

func sr() -> Rect2:
	return UITheme.safe_rect(self, safe_override)

# ---------- modes ----------
func show_menu() -> void:
	if mode != "menu": _appear.menu = 0.0
	mode = "menu"
	nav.reset()
	if fight.on:
		fight.close()
		Sfx.ui("ui_menu_close")

func show_fight() -> void:
	var was := mode
	mode = "fight"
	fight.choosing = choosing
	if not fight.on:
		fight.open(battle)
		if was != "target": Sfx.ui("ui_menu_open")
	else: fight.refresh()
	_appear.fight = 0.0

# the FIGHT window's CONFIRM: "NEXT" when another of Ash's still has to choose (doubles)
func set_confirm_label(s: String) -> void: fight.confirm_label = s

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
	if fight.on: fight.refresh()

# the energy pick: a tile per pool (the ones with room first), what each would make
# usable now, the cursor on the one that makes most of his moves usable
func show_pick() -> void:
	mode = "pick"
	if fight.on: fight.close()
	nav.reset()
	_appear["pick"] = 0.0
	pick_opts = pick_options(battle.fighter("a").e)
	pick_sel = 0
	var best := -1.0
	for i in pick_opts.size():
		var o: Dictionary = pick_opts[i]
		var sc: float = -1.0 if int(o.room) <= 0 else (o.unlocks as Array).size() * 10.0 + float(o.ready) + (0.5 if String(o.kind) != BattleEnergy.COLORLESS else 0.0)
		if sc > best: best = sc; pick_sel = i
	Sfx.ui("ui_notify")

static func pick_options(e: BattleEnergy) -> Array:
	var out := []
	var have: Array = e.chips
	var ids: Array = e.usable()
	for k in e.pool_kinds():
		var sim := have.duplicate()
		var room := e.pool_room(k)
		var cr := e.pool_room(BattleEnergy.COLORLESS)
		for i in e.pending:
			if room > 0: sim.append(k); room -= 1
			elif cr > 0: sim.append(BattleEnergy.COLORLESS); cr -= 1
		var unl := []
		var ready := 0
		for id in ids:
			var now: bool = BattleEnergy.match_cost(have, e.cost_for(id)) != null
			var then: bool = BattleEnergy.match_cost(sim, e.cost_for(id)) != null
			if then: ready += 1
			if then and not now: unl.append(id)
		out.append({"kind": k, "room": e.pool_room(k), "cap": e.pool_cap(k), "n": e.pool_count(k), "unlocks": unl, "ready": ready})
	return out

func _pick(k: String) -> void:
	if mode != "pick": return
	for o in pick_opts:
		if String(o.kind) == k and int(o.room) <= 0:
			Sfx.ui("ui_error")
			return
	pool_picked.emit(k)

func busy() -> void:
	mode = "busy"
	if fight.on: fight.close()
	bar_a.clear_preview()

func say(text: String, col := UITheme.YELLOW) -> void:
	if text == "": return
	_line = {"text": text, "col": col, "t": t}
	if log_lines.is_empty() or String(log_lines.back().text) != text:
		log_lines.append({"text": text, "col": col, "t": t})
		while log_lines.size() > LOG_N: log_lines.pop_front()
		log_all.append({"text": text, "col": col, "t": t, "turn": battle.turn if battle else 0})

func toggle_log(open := not log_open) -> void:
	if open == log_open: return
	log_open = open
	_appear["log"] = 0.0
	log_scroll = _log_max()
	Sfx.ui("ui_menu_open" if open else "ui_menu_close")

# the party list: send one out (forced after a faint: no backing out)
func show_party(forced := false) -> void:
	if party == null: return
	mode = "party"
	if fight.on: fight.close()
	party_forced = forced
	nav.reset()
	party_sel = 0
	for i in party.team.a.size():
		if party.can_switch("a", i): party_sel = i; break
	_appear["party"] = 0.0

# the bag: a pocket a tab (B backs out); the cursor kept per pocket
func show_bag(pockets: Array) -> void:
	var was := mode
	mode = "bag"
	bag = pockets
	if was != "bag": _appear["bag"] = 0.0; nav.reset()
	bag_tab = clampi(bag_tab, 0, maxi(0, bag.size() - 1))
	bag_sel = clampi(int(_bag_sels.get(bag_tab, 0)), 0, maxi(0, bag_items().size() - 1))

func bag_items() -> Array:
	if bag_tab < 0 or bag_tab >= bag.size(): return []
	return bag[bag_tab].get("items", [])

func bag_pocket() -> String:
	return String(bag[bag_tab].id) if bag_tab >= 0 and bag_tab < bag.size() else ""

func set_bag_tab(i: int) -> void:
	if bag.is_empty(): return
	i = (i + bag.size()) % bag.size()
	if i == bag_tab: return
	_bag_sels[bag_tab] = bag_sel
	bag_tab = i
	bag_sel = clampi(int(_bag_sels.get(i, 0)), 0, maxi(0, bag_items().size() - 1))
	_appear["bag_tab"] = 0.0
	Sfx.ui("ui_tab")

func bag_rect() -> Rect2:
	var S := sr()
	var w := 560.0
	var h := 118.0 + BAG_ROWS * 60.0 + (32.0 if bag.any(func(pk): return String(pk.get("note", "")) != "") else 6.0)
	var bot: float = _rects().plate_a.position.y - 16.0
	return Rect2(S.end.x - M - w - 6.0, maxf(S.position.y + M, bot - h), w, h)

func bag_tab_rect(i: int) -> Rect2:
	var r := bag_rect()
	var n := maxi(1, bag.size())
	var tw := (r.size.x - 48.0 - 8.0 * (n - 1)) / n
	return Rect2(r.position.x + 26.0 + i * (tw + 8.0), r.position.y + 58.0, tw, 42.0)

func bag_row(i: int) -> Rect2:
	var r := bag_rect()
	return Rect2(r.position.x + 18.0, r.position.y + 112.0 + i * 60.0, r.size.x - 36.0, 54.0)

func show_targets(labels: Array, title := "WHERE DOES IT GO?") -> void:
	mode = "target"
	if fight.on: fight.close()
	target_title = title
	targets = labels
	target_sel = 0
	nav.reset()
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

# the energy pick's card and its tiles
func pick_rect() -> Rect2:
	var S := sr()
	var n := maxi(1, pick_opts.size())
	var w := minf(S.size.x - 2.0 * M, 120.0 + n * 250.0)
	var h := 300.0
	return Rect2(S.get_center().x - w * 0.5, S.position.y + (S.size.y - h) * 0.42, w, h)

func pick_tile(i: int) -> Rect2:
	var r := pick_rect()
	var n := maxi(1, pick_opts.size())
	var gap := 18.0
	var tw := (r.size.x - 60.0 - gap * (n - 1)) / n
	return Rect2(r.position.x + 30.0 + i * (tw + gap), r.position.y + 84.0, tw, r.size.y - 140.0)

# ---------- layout ----------
func _rects() -> Dictionary:
	var S := sr()
	var plate_b := Rect2(S.position.x + M, S.position.y + M + 4.0, PLATE_W, 100.0 if party else 78.0)
	var plate_a := Rect2(S.end.x - M - PLATE_W, S.end.y - M - 92.0, PLATE_W, 92.0)
	# the opponent's energy: its counters on the name line, right-aligned
	var bar_b_r := Rect2(plate_b.position.x + 150.0, plate_b.position.y + 11.0, plate_b.size.x - 150.0 - 24.0, 28.0)
	# his own pools: bottom left, as far as the plates on the right
	var right := plate_a.position.x - (22.0 + SMALL_W if doubles else 0.0) - 20.0
	var bar_a_r := Rect2(S.position.x + M, S.end.y - M - 58.0, right - S.position.x - M, 58.0)
	var menu := Rect2(S.end.x - M - RIGHT_W, plate_a.position.y - 26.0 - 118.0, RIGHT_W, 118.0)
	var logb := Rect2(S.end.x - M - 92.0, S.position.y + M + 4.0, 92.0, 34.0)
	var x0 := plate_b.end.x + 28.0 + (SMALL_W + 22.0 if doubles else 0.0)
	var line := Rect2(x0, logb.position.y, maxf(120.0, logb.position.x - 12.0 - x0), 34.0)
	var lw := minf(600.0, S.size.x * 0.48)
	var logp := Rect2(S.end.x - M - lw, logb.position.y, lw, plate_a.position.y - 18.0 - logb.position.y)
	return {"plate_a": plate_a, "plate_b": plate_b, "bar_a": bar_a_r, "bar_b": bar_b_r, "menu": menu, "line": line, "log": logp, "logb": logb, "safe": S}

func _layout() -> void:
	var R := _rects()
	bar_a.fit(R.bar_a)
	bar_b.fit(R.bar_b)

func menu_rect(i: int) -> Rect2:
	var r: Rect2 = _rects().menu
	var w := (r.size.x - 12.0) * 0.5
	var h := (r.size.y - 10.0) * 0.5
	return Rect2(r.position + Vector2((i % 2) * (w + 12.0) - (i / 2) * h * UITheme.SKEW, (i / 2) * (h + 10.0)), Vector2(w, h))

# the LOG button: at the top right, the ticker's lines to its left (open: the log's corner)
func log_btn_rect() -> Rect2:
	return _rects().logb

# ---------- input ----------
func _local(p: Vector2) -> Vector2: return get_global_transform_with_canvas().affine_inverse() * p

func _tap(e: InputEvent) -> Vector2:
	var p := UIInput.tap_pos(e)
	if p == Vector2.INF or Engine.get_process_frames() == _tap_frame: return Vector2.INF
	_tap_frame = Engine.get_process_frames()
	return _local(p)

func _handled() -> void: get_viewport().set_input_as_handled()

func _unhandled_input(e: InputEvent) -> void:
	if battle == null or battle.over: return
	var d := nav.event(e)   # (every event: the stick's edge is tracked even between menus)
	# the log: L opens and closes it anywhere; open, it takes the input (scroll, B closes)
	if e.is_action_pressed("recenter"):
		toggle_log(); _handled(); return
	if log_open:
		if d.y != 0: log_scroll = clampf(log_scroll + d.y * 27.0 * 3.0, 0.0, _log_max())
		elif e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"): toggle_log(false)
		else: _log_pointer(e)
		_handled()
		return
	if e is InputEventScreenTouch or e is InputEventMouseButton:
		var p := UIInput.tap_pos(e)
		if p != Vector2.INF and UITheme.touch_rect(self, log_btn_rect()).has_point(_local(p)) and not mode in ["fight", "pick"]:
			_tap_frame = Engine.get_process_frames()
			toggle_log(); _handled(); return
	match mode:
		"fight":
			if fight.handle(e): _handled()
			return
		"pick": _pick_input(e, d)
		"party": _party_input(e, d)
		"target": _target_input(e, d)
		"bag": _bag_input(e, d)
		"menu": _menu_input(e, d)

func _menu_input(e: InputEvent, d: Vector2i) -> void:
	if d != Vector2i.ZERO:
		if d.x < 0: _sel(sel - 1 if sel % 2 == 1 else sel)
		elif d.x > 0: _sel(sel + 1 if sel % 2 == 0 else sel)
		elif d.y < 0: _sel(sel - 2 if sel >= 2 else sel)
		elif d.y > 0: _sel(sel + 2 if sel < 2 else sel)
		_handled()
		return
	if nav.swallow(e): _handled(); return
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): _cmd(sel); _handled(); return
	# B in the menu: nothing (it never ends or skips the turn)
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"): _handled(); return
	var lp := _tap(e)
	if lp == Vector2.INF: return
	for i in 4:
		if UITheme.touch_rect(self, menu_rect(i)).has_point(lp): _cmd(i); _handled(); break

func _pick_input(e: InputEvent, d: Vector2i) -> void:
	var n := pick_opts.size()
	if n == 0: return
	if d.x != 0:
		var s := clampi(pick_sel + d.x, 0, n - 1)
		if s != pick_sel: pick_sel = s; Sfx.ui("ui_cursor")
		_handled(); return
	if d != Vector2i.ZERO or nav.swallow(e): _handled(); return
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"):
		_bump["pick:%d" % pick_sel] = 0.0
		_pick(String(pick_opts[pick_sel].kind)); _handled(); return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"): Sfx.ui("ui_error"); _handled(); return
	if e is InputEventKey and e.pressed and not e.echo and e.keycode >= KEY_1 and e.keycode < KEY_1 + n:
		_pick(String(pick_opts[e.keycode - KEY_1].kind)); _handled(); return
	var lp := _tap(e)
	if lp == Vector2.INF: return
	for i in n:
		if pick_tile(i).has_point(lp):
			pick_sel = i
			_bump["pick:%d" % i] = 0.0
			_pick(String(pick_opts[i].kind)); _handled(); return

func _party_input(e: InputEvent, d: Vector2i) -> void:
	var n: int = party.team.a.size()
	if d.y != 0:
		party_sel = clampi(party_sel + d.y, 0, n - 1); Sfx.ui("ui_cursor"); _handled(); return
	if d != Vector2i.ZERO or nav.swallow(e): _handled(); return
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): _party_pick(party_sel); _handled(); return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		if not party_forced: Sfx.ui("ui_cancel"); party_cancel.emit()
		_handled(); return
	var lp := _tap(e)
	if lp == Vector2.INF: return
	_handled()
	var hit := false
	for i in n:
		if party_row(i).grow_individual(0, 4, 0, 4).has_point(lp): hit = true; party_sel = i; _party_pick(i)
	if not hit and not party_forced and not party_rect().has_point(lp): Sfx.ui("ui_cancel"); party_cancel.emit()

func _target_input(e: InputEvent, d: Vector2i) -> void:
	var n := targets.size()
	if d.x != 0:
		target_sel = clampi(target_sel + d.x, 0, n - 1); Sfx.ui("ui_cursor"); _handled(); return
	if d != Vector2i.ZERO or nav.swallow(e): _handled(); return
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): Sfx.ui("ui_confirm"); target_picked.emit(target_sel); _handled(); return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"): Sfx.ui("ui_cancel"); target_cancel.emit(); _handled(); return
	var lp := _tap(e)
	if lp == Vector2.INF: return
	_handled()
	for i in n:
		if UITheme.touch_rect(self, target_rect(i)).has_point(lp): target_sel = i; Sfx.ui("ui_confirm"); target_picked.emit(i); return

func _bag_input(e: InputEvent, d: Vector2i) -> void:
	var n := bag_items().size()
	if d.x != 0:
		set_bag_tab(bag_tab + d.x); _handled(); return
	if d.y != 0:
		if n > 0:
			var s2 := clampi(bag_sel + d.y, 0, n - 1)
			if s2 != bag_sel: bag_sel = s2; Sfx.ui("ui_cursor")
		_handled(); return
	if d != Vector2i.ZERO or nav.swallow(e): _handled(); return
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"):
		if n > 0: _bag_pick(bag_sel)
		else: Sfx.ui("ui_error")
		_handled(); return
	# B: back to the menu (never the turn)
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"): Sfx.ui("ui_cancel"); bag_cancel.emit(); _handled(); return
	var lp := _tap(e)
	if lp == Vector2.INF: return
	_handled()
	for i in bag.size():
		if bag_tab_rect(i).grow_individual(0, 6, 0, 6).has_point(lp): set_bag_tab(i); return
	for i in mini(n, BAG_ROWS):
		if bag_row(i).grow_individual(0, 3, 0, 3).has_point(lp):
			bag_sel = i; _bag_pick(i); return
	if not bag_rect().has_point(lp): Sfx.ui("ui_cancel"); bag_cancel.emit()

func _bag_pick(i: int) -> void:
	var L := bag_items()
	if i < 0 or i >= L.size(): return
	_bump["bag:%d" % i] = 0.0
	_bag_sels[bag_tab] = i
	Sfx.ui("ui_confirm")
	item_picked.emit(bag_pocket(), String(L[i].id))

# the open log: drag to scroll, a tap off it (or on LOG) closes it
func _log_pointer(e: InputEvent) -> void:
	var p := Vector2.INF
	var k := ""
	if e is InputEventScreenTouch: p = e.position; k = "down" if e.pressed else "up"
	elif e is InputEventScreenDrag: p = e.position; k = "move"
	elif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT: p = e.position; k = "down" if e.pressed else "up"
	elif e is InputEventMouseMotion and (e.button_mask & MOUSE_BUTTON_MASK_LEFT): p = e.position; k = "move"
	if k == "": return
	var lp := _local(p)
	match k:
		"down": _log_press = {"pos": lp, "s0": log_scroll, "moved": false}
		"move":
			if _log_press.is_empty(): return
			var dy: float = lp.y - Vector2(_log_press.pos).y
			if absf(dy) > 10.0: _log_press.moved = true
			if bool(_log_press.moved): log_scroll = clampf(float(_log_press.s0) - dy, 0.0, _log_max())
		"up":
			if _log_press.is_empty(): return
			var moved := bool(_log_press.moved)
			_log_press = {}
			if not moved and (log_btn_rect().has_point(lp) or not _rects().log.has_point(lp)): toggle_log(false)

func _party_pick(i: int) -> void:
	if not party.can_switch("a", i):
		Sfx.ui("ui_error")
		return
	Sfx.ui("ui_confirm")
	party_picked.emit(i)

func _sel(i: int) -> void:
	i = clampi(i, 0, 3)
	if i != sel: Sfx.ui("ui_cursor")
	sel = i

func _cmd(i: int) -> void:
	sel = i
	_bump["menu:%d" % i] = 0.0
	Sfx.ui("ui_confirm")
	command.emit(String(MENU[i][0]))

# ---------- frame ----------
func _process(dt: float) -> void:
	t += dt
	for k in _appear: _appear[k] = minf(1.0, _appear[k] + dt / UITheme.BASE)
	for k in _bump.keys():
		_bump[k] += dt
		if _bump[k] > 0.4: _bump.erase(k)
	# a held direction repeats (after a pause, ~8 a second) in the lists
	var d := nav.tick(dt)
	if d != Vector2i.ZERO and not log_open:
		match mode:
			"party": party_sel = clampi(party_sel + d.y, 0, party.team.a.size() - 1) if d.y != 0 else party_sel
			"bag": bag_sel = clampi(bag_sel + d.y, 0, maxi(0, bag_items().size() - 1)) if d.y != 0 else bag_sel
		if mode in ["party", "bag"] and d.y != 0: Sfx.ui("ui_cursor")
	elif d.y != 0 and log_open: log_scroll = clampf(log_scroll + d.y * 27.0, 0.0, _log_max())
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
	if doubles: _doubles_plates(R)
	_ticker(R.line)
	if mode == "menu": _menu()
	if mode == "pick": _pick_card()
	if mode == "party": _party_list()
	if mode == "target": _target_list()
	if mode == "bag": _bag_panel()
	if choosing != "" and mode in ["menu", "pick", "bag"]:
		var cw := UITheme.text_w("CHOOSING FOR " + choosing, "label", 15) + 30.0
		var at := Vector2(R.menu.end.x - cw, R.menu.position.y - 70.0)
		if mode == "pick": at = Vector2(R.bar_a.position.x + 10.0, R.bar_a.position.y - 62.0)
		if mode == "bag": at = Vector2(bag_rect().end.x - cw, bag_rect().position.y - 34.0)
		UITheme.chip(self, at, "CHOOSING FOR " + choosing, UITheme.SKY, UITheme.INK, 15, 26.0)
	if log_open: _log(R.log)

# ---------- the ticker and the log ----------
func _ticker(r: Rect2) -> void:
	if log_open: return
	# the LOG button
	var b := log_btn_rect()
	var bpts := UITheme.para_points(b)
	UITheme.shadow(self, bpts, 0.8, Vector2(0, 3))
	UITheme.fill_v(self, bpts, Color(UITheme.PLATE_HI, 0.95), Color(UITheme.PLATE, 0.95))
	var gx := b.position.x + 16.0
	if UIInput.device != "touch": gx += UITheme.glyph(self, Vector2(gx + 6.0, b.get_center().y), "recenter", 22.0, 1.0) * 0.5 + 12.0
	UITheme.text_mid(self, Vector2(gx, b.get_center().y), "LOG", "label", 14, UITheme.TEXT)
	if UIInput.device == "touch": UITheme.chevron_down(self, Vector2(b.end.x - 18.0, b.get_center().y + 1.0), 11.0, UITheme.TEXT_DIM)
	# the last two lines, the newest bright, fading after a while
	var n := log_lines.size()
	var shown := 0
	for i in range(n - 1, -1, -1):
		if shown >= 2: break
		var L: Dictionary = log_lines[i]
		var age := t - float(L.t)
		var fade := clampf((TICK_T - age) / 0.6, 0.0, 1.0) if shown == 0 else clampf((TICK_T * 0.6 - age) / 0.6, 0.0, 1.0) * 0.7
		if fade <= 0.0: break
		var ck := UITheme.ease_out_expo(age / 0.25)
		var y := r.position.y + (0.0 if shown == 0 else r.size.y + 4.0)
		var w := minf(r.size.x, UITheme.text_w(String(L.text), "body_bold" if shown == 0 else "body", 18 if shown == 0 else 15) + 46.0)
		var x := r.end.x - w + (1.0 - ck) * 30.0
		var lr := Rect2(x, y if shown == 0 else y, w, r.size.y if shown == 0 else 26.0)
		var a := fade * ck
		UITheme.plate(self, lr, a * (0.92 if shown == 0 else 0.7), UITheme.SKEW, UITheme.PLATE, 0.0)
		UITheme.para(self, Rect2(lr.position + Vector2(6, 6), Vector2(5, lr.size.y - 12)), Color(L.col, a), UITheme.SKEW)
		UITheme.text(self, Vector2(lr.position.x + 22.0, lr.get_center().y + (6.5 if shown == 0 else 5.0)), String(L.text), "body_bold" if shown == 0 else "body", 18 if shown == 0 else 15, Color(UITheme.TEXT, a), 0, lr.size.x - 30.0)
		shown += 1

func _log_rows() -> Array:
	var out := []
	var last := -1
	for L in log_all:
		if int(L.turn) != last:
			last = int(L.turn)
			out.append({"head": "TURN %d" % last if last > 0 else "THE START"})
		out.append(L)
	return out

func _log_max() -> float:
	var R := _rects()
	return maxf(0.0, _log_rows().size() * 27.0 - (R.log.size.y - 70.0))

func _log(r: Rect2) -> void:
	var ap := UITheme.ease_out(float(_appear.get("log", 1.0)))
	r.position.x += (1.0 - ap) * 40.0
	draw_rect(Rect2(Vector2(-40, -40), get_viewport_rect().size + Vector2(80, 80)), Color(UITheme.DIM, UITheme.DIM.a * 0.6 * ap))
	var pts := UITheme.chamfer_points(r, 16.0)
	UITheme.shadow(self, pts, ap, Vector2(0, 6))
	UITheme.fill_v(self, pts, Color(Color("1a2236"), 0.96 * ap), Color(Color("10162a"), 0.96 * ap))
	UITheme.outline(self, pts, Color(1, 1, 1, 0.12 * ap), 1.5)
	var b := log_btn_rect()
	b.position.x += (1.0 - ap) * 40.0
	UITheme.para(self, b, Color(UITheme.YELLOW, ap))
	var gx := b.position.x + 16.0
	if UIInput.device != "touch": gx += UITheme.glyph(self, Vector2(gx + 6.0, b.get_center().y), "recenter", 22.0, ap) * 0.5 + 12.0
	UITheme.text_mid(self, Vector2(gx, b.get_center().y), "LOG", "label", 14, Color(UITheme.INK, ap))
	UITheme.text_mid(self, Vector2(r.position.x + 22.0, b.get_center().y), "BATTLE LOG  ·  TURN %d" % battle.turn, "heading", 18, Color(UITheme.TEXT, ap))
	var hint := "DRAG TO SCROLL  ·  TAP OUTSIDE TO CLOSE" if UIInput.device == "touch" else "UP / DOWN: SCROLL  ·  B: CLOSE"
	UITheme.text(self, Vector2(r.position.x + 22.0, r.end.y - 14.0), hint, "label", 12, Color(UITheme.TEXT_DIM, ap))
	var top := r.position.y + 50.0
	var bot := r.end.y - 34.0
	var rows := _log_rows()
	for i in rows.size():
		var y := top + i * 27.0 - log_scroll + 14.0
		if y < top - 4.0 or y > bot + 4.0: continue
		var ea := ap * clampf(minf(y - top + 10.0, bot - y + 10.0) / 20.0, 0.0, 1.0)
		var L: Dictionary = rows[i]
		if L.has("head"):
			UITheme.text_mid(self, Vector2(r.position.x + 22.0, y), String(L.head), "label", 13, Color(UITheme.YELLOW, ea))
			draw_line(Vector2(r.position.x + 100.0, y), Vector2(r.end.x - 22.0, y), Color(1, 1, 1, 0.1 * ea), 1.0)
			continue
		UITheme.para(self, Rect2(Vector2(r.position.x + 24.0, y - 8.0), Vector2(4, 16)), Color(L.col, ea), UITheme.SKEW)
		UITheme.text(self, Vector2(r.position.x + 38.0, y + 6.0), String(L.text), "body", 16, Color(UITheme.TEXT, ea), 0, r.size.x - 60.0)
	if _log_max() > 1.0:
		var k := (bot - top) / (rows.size() * 27.0)
		var by := top + (bot - top) * (1.0 - k) * clampf(log_scroll / _log_max(), 0.0, 1.0)
		draw_rect(Rect2(r.end.x - 12.0, top, 3.0, bot - top), Color(1, 1, 1, 0.08 * ap))
		draw_rect(Rect2(r.end.x - 12.0, by, 3.0, (bot - top) * k), Color(1, 1, 1, 0.45 * ap))

# ---------- the energy pick ----------
func _pick_card() -> void:
	var ap := UITheme.ease_out(float(_appear.get("pick", 1.0)))
	var r := pick_rect()
	r.position.y += (1.0 - ap) * 30.0
	var e: BattleEnergy = battle.fighter("a").e
	var pts := UITheme.chamfer_points(r, 18.0)
	UITheme.shadow(self, pts, ap, Vector2(0, 8))
	UITheme.fill_v(self, pts, Color(Color("1a2236"), 0.97 * ap), Color(Color("10162a"), 0.97 * ap))
	UITheme.outline(self, pts, Color(UITheme.YELLOW, 0.35 * ap), 1.5)
	UITheme.para(self, Rect2(r.position + Vector2(26, -5), Vector2(130, 7)), Color(UITheme.YELLOW, ap))
	var who := String(battle.fighter("a").name).to_upper()
	UITheme.text(self, r.position + Vector2(30, 46), "NEW ENERGY", "display", 34, Color(UITheme.TEXT, ap))
	var sub := "TURN %d  ·  %s EARNED %s  ·  CHOOSE ITS TYPE" % [battle.turn, who, "A CHIP" if e.pending == 1 else "%d CHIPS" % e.pending]
	UITheme.text(self, r.position + Vector2(32, 70), sub, "label", 14, Color(UITheme.YELLOW, ap))
	for i in pick_opts.size():
		var o: Dictionary = pick_opts[i]
		var tr := pick_tile(i)
		var stg := UITheme.ease_back(clampf(float(_appear.get("pick", 1.0)) * 1.6 - i * 0.18, 0.0, 1.0), 1.4)
		tr.position.y += (1.0 - stg) * 24.0
		var on := i == pick_sel
		var full := int(o.room) <= 0
		var bump := float(_bump.get("pick:%d" % i, 9.0))
		if bump < 0.25: tr = tr.grow(5.0 * (1.0 - bump / 0.25))
		var kc := EnergyIcon.color(String(o.kind))
		var a := ap * (0.45 if full else 1.0)
		var tp := UITheme.chamfer_points(tr, 12.0)
		UITheme.shadow(self, tp, a, Vector2(0, 5))
		if on and not full: UITheme.fill_v(self, tp, Color(UITheme.WHITE, a), Color(UITheme.PAPER, a))
		else: UITheme.fill_v(self, tp, Color(kc.darkened(0.45), 0.9 * a), Color(kc.darkened(0.65), 0.9 * a))
		if on and not full: UITheme.outline(self, tp, Color(kc, a), 4.0)
		var fg := UITheme.INK if on and not full else UITheme.TEXT
		var ic := Vector2(tr.position.x + 48.0, tr.position.y + 50.0)
		if on and not full: UITheme.glow(self, ic, 40.0, kc, a * (0.6 + 0.3 * sin(t * 5.0)))
		EnergyIcon.draw_icon(self, String(o.kind), ic, 30.0 + (3.0 * sin(t * 6.0) if on and not full else 0.0), a)
		UITheme.text(self, Vector2(tr.position.x + 90.0, tr.position.y + 46.0), BattleEnergy.energy_name(String(o.kind)).to_upper(), "display", 26, Color(fg, a), 0, tr.size.x - 100.0)
		var cnt := "FULL  %d/%d" % [int(o.n), int(o.cap)] if full else "%d/%d  +%d" % [int(o.n), int(o.cap), mini(e.pending, int(o.room))]
		UITheme.text(self, Vector2(tr.position.x + 92.0, tr.position.y + 70.0), cnt, "label", 14, Color(fg, a * 0.75))
		# what it would make usable
		var unl: Array = o.unlocks
		var ly := tr.position.y + 108.0
		if full:
			UITheme.text(self, Vector2(tr.position.x + 22.0, ly), "NO ROOM", "label", 14, Color(fg, a * 0.8))
		elif unl.is_empty():
			UITheme.text(self, Vector2(tr.position.x + 22.0, ly), "NOTHING NEW", "label", 15, Color(fg, a * 0.7))
			UITheme.text(self, Vector2(tr.position.x + 22.0, ly + 24.0), "%d MOVE%s READY" % [int(o.ready), "" if int(o.ready) == 1 else "S"], "label", 15, Color(fg, a * 0.7))
		else:
			UITheme.text(self, Vector2(tr.position.x + 22.0, ly), "UNLOCKS", "label", 15, Color(UITheme.GREEN.darkened(0.25 if on else 0.0), a))
			for j in mini(2, unl.size()):
				var nm := String(BattleEnergy.move(String(unl[j])).get("name", unl[j])).to_upper()
				UITheme.text(self, Vector2(tr.position.x + 22.0, ly + 22.0 + j * 21.0), nm + ("  +%d" % (unl.size() - 2) if j == 1 and unl.size() > 2 else ""), "heading", 17, Color(fg, a), 0, tr.size.x - 34.0)
		if on and not full and UIInput.device != "touch": UITheme.glyph(self, Vector2(tr.end.x - 24.0, tr.position.y + 24.0), "use", 26.0, a)
	var hint := "TAP A TYPE" if UIInput.device == "touch" else "LEFT / RIGHT  ·  A: CHOOSE"
	UITheme.text(self, Vector2(r.position.x + 32.0, r.end.y - 20.0), hint, "label", 13, Color(UITheme.TEXT_DIM, ap))
	UITheme.text(self, Vector2(r.end.x - 30.0, r.end.y - 20.0), "TYPED CHIPS PAY THEIR TYPE AND COLORLESS COSTS", "label", 12, Color(UITheme.TEXT_DIM, ap * 0.8), 2)

# doubles: the other one out on each side, a smaller plate in the same look beside
# the main one (the foe's right of it, his left of his): name and level, the energy
# counters on the name line, the HP bar and its focus strip
func _doubles_plates(R: Dictionary) -> void:
	for side in ["a", "b"]:
		for f in doubles.actives(side):
			if f == null or f == battle.fighter(side): continue
			var r: Rect2
			if side == "b": r = Rect2(R.plate_b.end.x + 22.0, R.plate_b.position.y, SMALL_W, 66.0)
			else: r = Rect2(R.plate_a.position.x - 22.0 - SMALL_W, R.plate_a.end.y - 66.0, SMALL_W, 66.0)
			var pts := UITheme.plate(self, r, 0.9, UITheme.SKEW, UITheme.PLATE, 8)
			UITheme.outline(self, pts, Color(1, 1, 1, 0.08), 1.0)
			UITheme.para(self, Rect2(r.position + Vector2(14, -4), Vector2(70, 5)), UITheme.SKY if side == "a" else UITheme.YELLOW)
			var a := 0.45 if f.fainted() else 1.0
			var cw := 0.0
			if not f.fainted(): cw = EnergyBar.draw_counters(self, f.e, Vector2(r.end.x - 14.0, r.position.y + 20.0), 19.0, side == "a", a)
			var lv := "Lv%d" % int(f.level)
			var nw := UITheme.text(self, r.position + Vector2(22, 29), String(f.name).to_upper(), "display", 21, Color(UITheme.TEXT, a), 0, r.size.x - cw - UITheme.text_w(lv, "heading", 14) - 44.0)
			UITheme.text(self, r.position + Vector2(27 + nw, 29), lv, "heading", 14, Color(UITheme.TEXT_DIM, a))
			var hk := float(f.hp) / maxf(1.0, f.max_hp)
			_hp_bar(Rect2(r.position + Vector2(24, 39), Vector2(r.size.x - 64.0, 14)), hk, f.e, null, a, 9.0)
			if f.fainted(): UITheme.chip(self, Vector2(r.end.x - 96.0, r.position.y + 9.0), "FAINTED", UITheme.RED, UITheme.WHITE, 12, 20.0)

func _target_list() -> void:
	var ap := UITheme.ease_out(float(_appear.get("target", 1.0)))
	var S := sr()
	UITheme.text_mid(self, Vector2(S.get_center().x, target_rect(0).position.y - 34.0), target_title, "display", 34, Color(UITheme.YELLOW, ap), 1, 6)
	for i in targets.size():
		var r := target_rect(i)
		r.position.y += (1.0 - ap) * 50.0
		var on := i == target_sel
		var parts := String(targets[i]).split("|")
		var pts := UITheme.para_points(r)
		UITheme.shadow(self, pts, ap, Vector2(0, 5))
		if on: UITheme.fill_v(self, pts, Color(UITheme.WHITE, ap), Color(UITheme.PAPER, ap))
		else: UITheme.fill(self, pts, Color(UITheme.PLATE_HI, ap))
		var col := UITheme.SKY if parts[0] in ["ALLY", "LEFT", "RIGHT"] else UITheme.RED
		UITheme.accent_bar(self, r, Color(col, ap), ap, UITheme.SKEW, 9.0 if on else 6.0)
		UITheme.text(self, r.position + Vector2(30, 30), parts[0], "label", 15, Color(col, ap))
		UITheme.text(self, r.position + Vector2(30, 66), parts[1] if parts.size() > 1 else "", "display", 32, Color(UITheme.INK if on else UITheme.TEXT, ap))

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

# a ball of a type (battle_config catch.balls: its top colour and marks)
static func draw_ball_kind(ci: CanvasItem, c: Vector2, r: float, id: String) -> void:
	var B := CatchRules.ball(id)
	var top := Color(String(B.get("col", "e8352e")))
	var bot := UITheme.WHITE
	ci.draw_circle(c, r, bot, true, -1.0, true)
	var pts := PackedVector2Array()
	for k in 17: pts.append(c + Vector2(cos(PI + PI * k / 16.0), sin(PI + PI * k / 16.0)) * r)
	ci.draw_colored_polygon(pts, top)
	if B.has("band"):
		var bc := Color(String(B.band))
		match id:
			"ultra_ball":
				for sx in [-1.0, 1.0]: ci.draw_line(c + Vector2(sx * r * 0.5, -r * 0.82), c + Vector2(sx * r * 0.5, -r * 0.18), bc, maxf(1.5, r * 0.26), true)
			"master_ball":
				for sx in [-1.0, 1.0]: ci.draw_circle(c + Vector2(sx * r * 0.52, -r * 0.5), r * 0.2, bc, true, -1.0, true)
				ci.draw_polyline(PackedVector2Array([c + Vector2(-r * 0.2, -r * 0.2), c + Vector2(-r * 0.2, -r * 0.62), c + Vector2(0, -r * 0.4), c + Vector2(r * 0.2, -r * 0.62), c + Vector2(r * 0.2, -r * 0.2)]), UITheme.WHITE, maxf(1.0, r * 0.1), true)
			_:
				for sx in [-1.0, 1.0]: ci.draw_line(c + Vector2(sx * r * 0.28, -r * 0.62), c + Vector2(sx * r * 0.7, -r * 0.3), bc, maxf(1.5, r * 0.24), true)
	ci.draw_line(c - Vector2(r, 0), c + Vector2(r, 0), UITheme.INK, maxf(1.5, r * 0.22), true)
	ci.draw_circle(c, r * 0.36, UITheme.INK, true, -1.0, true)
	ci.draw_circle(c, r * 0.22, bot, true, -1.0, true)

func _bag_panel() -> void:
	var ap := UITheme.ease_out(float(_appear.get("bag", 1.0)))
	var tk := UITheme.ease_out(float(_appear.get("bag_tab", 1.0)))
	var r := bag_rect()
	var dx := (1.0 - ap) * 60.0
	r.position.x += dx
	UITheme.panel(self, r, UITheme.YELLOW, ap)
	UITheme.text(self, r.position + Vector2(24, 40), "ITEMS", "display", 30, Color(UITheme.INK, ap))
	var hint := "TAP OUTSIDE: BACK" if UIInput.device == "touch" else "LEFT / RIGHT: POCKET  ·  B: BACK"
	UITheme.text(self, Vector2(r.end.x - 22.0, r.position.y + 37.0), hint, "label", 13, Color(UITheme.INK_SOFT, ap), 2)
	# the pockets: a skewed tab each, the open one ink with a red foot
	for i in bag.size():
		var tr := bag_tab_rect(i)
		tr.position.x += dx
		var on := i == bag_tab
		var tp := UITheme.para_points(tr)
		if on:
			UITheme.shadow(self, tp, ap * 0.8, Vector2(0, 3))
			UITheme.fill_v(self, tp, Color(UITheme.INK.lightened(0.12), ap), Color(UITheme.INK, ap))
			UITheme.para(self, Rect2(tr.position.x, tr.end.y - 4.0, tr.size.x, 4.0), Color(UITheme.RED, ap))
		else:
			UITheme.fill(self, tp, Color(UITheme.INK, 0.07 * ap))
		var lab := String(bag[i].get("label", bag[i].id))
		var n := (bag[i].get("items", []) as Array).size()
		var tw := UITheme.text_w(lab, "label", 16)
		var x := tr.get_center().x - (tw + 26.0) * 0.5
		UITheme.text_mid(self, Vector2(x, tr.get_center().y - 1.0), lab, "label", 16, Color(UITheme.WHITE if on else UITheme.INK, ap))
		var cr := Rect2(x + tw + 8.0, tr.get_center().y - 9.0, 20.0, 18.0)
		UITheme.para(self, cr, Color(UITheme.RED, ap) if on else Color(UITheme.INK, 0.18 * ap))
		UITheme.text_mid(self, Vector2(cr.get_center().x, cr.get_center().y), str(n), "number", 14, Color(UITheme.WHITE, ap), 1)
	if bag.is_empty(): return
	var pk: Dictionary = bag[bag_tab]
	var L := bag_items()
	var dim := bool(pk.get("dim", false))
	if L.is_empty():
		UITheme.text(self, Vector2(r.get_center().x, bag_row(1).get_center().y + 6.0), "NOTHING IN THIS POCKET", "heading", 22, Color(UITheme.INK_SOFT, ap), 1)
	for i in mini(L.size(), BAG_ROWS):
		var it: Dictionary = L[i]
		var rr := bag_row(i)
		rr.position.x += dx + (1.0 - tk) * (16.0 + i * 8.0)
		var bump := float(_bump.get("bag:%d" % i, 9.0))
		if bump < 0.2: rr = rr.grow(3.0 * (1.0 - bump / 0.2))
		var on: bool = i == bag_sel
		var a := ap * tk * (0.5 if dim else 1.0)
		if on:
			UITheme.shadow(self, UITheme.para_points(rr), a, Vector2(0, 3))
			UITheme.fill(self, UITheme.para_points(rr), Color(UITheme.INK, a))
		else:
			UITheme.fill(self, UITheme.para_points(rr), Color(UITheme.INK, 0.06 * a))
		var tc := UITheme.TEXT if on else UITheme.INK
		draw_item(self, rr.position + Vector2(36, 27), 18.0, String(it.id))
		UITheme.text(self, rr.position + Vector2(68, 26), String(it.name).to_upper(), "heading", 23, Color(tc, a))
		UITheme.text(self, rr.position + Vector2(66, 45), String(it.get("desc", "")), "label", 14, Color(tc, a * 0.7), 0, rr.size.x - 170.0)
		var n := int(it.get("n", 0))
		UITheme.text_mid(self, Vector2(rr.end.x - 20.0, rr.position.y + 27.0), "x%d" % n if n >= 0 else "UNLIMITED", "number" if n >= 0 else "label", 22 if n >= 0 else 13, Color(tc, a), 2)
		if on and UIInput.device != "touch": UITheme.glyph(self, Vector2(rr.end.x - (82.0 if n >= 0 else 122.0), rr.get_center().y), "use", 24.0, a)
	var note := String(pk.get("note", ""))
	if note != "":
		var nw := UITheme.text_w(note, "label", 13) + 18.0
		UITheme.chip(self, Vector2(r.end.x - 24.0 - nw, r.end.y - 30.0), note, Color(UITheme.RED, ap), UITheme.WHITE, 13, 20.0)

# an item's icon: a ball of its kind, a spray bottle for medicine, the energy items
static func draw_item(ci: CanvasItem, c: Vector2, r: float, id: String) -> void:
	if id in CatchRules.ball_ids():
		draw_ball_kind(ci, c, r * 0.9, id)
		return
	match id:
		"energy_shard":
			EnergyIcon.draw_icon(ci, BattleEnergy.COLORLESS, c, r * 0.9)
			return
		"full_charge":
			UITheme.glow(ci, c, r * 1.2, UITheme.YELLOW, 0.8)
			ci.draw_circle(c, r * 0.9, UITheme.YELLOW, true, -1.0, true)
			ci.draw_arc(c, r * 0.9, 0.0, TAU, 24, UITheme.WHITE, maxf(1.5, r * 0.12), true)
			var bolt := PackedVector2Array([c + Vector2(0.12, -0.62) * r, c + Vector2(-0.34, 0.08) * r, c + Vector2(-0.02, 0.08) * r,
				c + Vector2(-0.14, 0.62) * r, c + Vector2(0.34, -0.1) * r, c + Vector2(0.02, -0.1) * r])
			ci.draw_colored_polygon(bolt, UITheme.INK)
			return
	var cols := {"potion": Color("9a5be0"), "super_potion": Color("f08a24"), "antidote": Color("3fbf66"), "paralyze_heal": Color("f2c230"), "focus_tonic": Color("3fb6f5")}
	var col: Color = cols.get(id, UITheme.SKY)
	# a spray bottle: the body, a white band, the neck and the nozzle
	var body := Rect2(c + Vector2(-0.52, -0.3) * r, Vector2(1.04, 1.18) * r)
	ci.draw_colored_polygon(UITheme.rounded_points(body.grow(1.5), r * 0.3, 3), UITheme.INK)
	ci.draw_colored_polygon(UITheme.rounded_points(body, r * 0.26, 3), col)
	ci.draw_rect(Rect2(body.position + Vector2(0, body.size.y * 0.32), Vector2(body.size.x, body.size.y * 0.3)), Color(UITheme.WHITE, 0.92))
	var neck := Rect2(c + Vector2(-0.22, -0.62) * r, Vector2(0.44, 0.34) * r)
	ci.draw_rect(neck.grow(1.0), UITheme.INK)
	ci.draw_rect(neck, Color("d9dee8"))
	ci.draw_rect(Rect2(c + Vector2(0.22, -0.58) * r, Vector2(0.3, 0.14) * r), Color("d9dee8"))
	ci.draw_line(body.position + Vector2(r * 0.18, r * 0.1), body.position + Vector2(r * 0.18, r * 0.3), Color(1, 1, 1, 0.6), maxf(1.0, r * 0.12), true)
	if id == "focus_tonic": UITheme.text_mid(ci, body.get_center() + Vector2(0, 1), "+", "display", int(r * 0.9), col.darkened(0.35), 1)

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


# a nameplate: the name and level (the opponent's: its energy counters on the
# line's right), the HP bar with the focus strip and its percentage, status tags
# (his: on the top row's right; the opponent's: under the plate), the party's
# balls, his HP numbers
func _plate(r: Rect2, f, own: bool) -> void:
	var pts := UITheme.plate(self, r, 1.0, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
	UITheme.outline(self, pts, Color(1, 1, 1, 0.1), 1.0)
	UITheme.para(self, Rect2(r.position + Vector2(18, -5), Vector2(120, 6)), UITheme.SKY if own else UITheme.YELLOW)
	var e: BattleEnergy = f.e
	var nx := r.position.x + 28.0
	var ny := r.position.y + 36.0
	# the room the name has: up to the counters (the opponent's) or the tags (his)
	var room := r.size.x - 60.0
	if not own: room = bar_b.position.x + bar_b.size.x - bar_b.shown_w() - nx - UITheme.text_w("Lv%d" % int(f.level), "heading", 19) - 22.0
	var nw := UITheme.text(self, Vector2(nx, ny), String(f.name).to_upper(), "display", 32, UITheme.TEXT, 0, maxf(80.0, room))
	UITheme.text(self, Vector2(nx + nw + 8.0, ny), "Lv%d" % int(f.level), "heading", 19, UITheme.TEXT_DIM)
	# status and states
	var tags := []
	var st := {"para": ["PAR", "f2b91a"], "sleep": ["SLP", "8a8fa3"], "poison": ["PSN", "ad3c9c"], "burn": ["BRN", "e5432c"]}
	if st.has(f.status): tags.append(st[f.status])
	if int(f.confused) > 0: tags.append(["CNF", "e37cbd"])
	var semi := e.semi()
	var semi_t := {"underground": ["UNDERGROUND", "c08a4a"], "airborne": ["IN THE AIR", "3fb6f5"], "underwater": ["UNDERWATER", "2f6fd6"], "charging": ["CHARGING", "ffcb05"]}
	if semi_t.has(semi): tags.append(semi_t[semi])
	if e.locked_in: tags.append(["LOCKED IN", "ffcb05"])
	var tx := r.end.x - 18.0
	var ux := r.position.x + 22.0
	for tg in tags:
		var w := UITheme.text_w(tg[0], "label", 13) + 18.0
		var pulse := 0.85 + 0.15 * sin(t * 5.0) if tg[0] in ["UNDERGROUND", "IN THE AIR", "UNDERWATER", "LOCKED IN", "CHARGING"] else 1.0
		if own:
			tx -= w + 6.0
			UITheme.chip(self, Vector2(tx, r.position.y + 12.0), tg[0], Color(Color(tg[1]), pulse), UITheme.INK, 13, 21.0)
		else:
			UITheme.chip(self, Vector2(ux, r.end.y + 6.0), tg[0], Color(Color(tg[1]), pulse), UITheme.INK, 13, 21.0)
			ux += w + 6.0
	# HP, the focus strip along its bottom
	var hk: float = _hp[f.side]
	var bar := hp_bar_rect(r)
	UITheme.text_mid(self, Vector2(bar.position.x - 30.0, bar.position.y + 7.0), "HP", "label", 16, UITheme.YELLOW)
	_hp_bar(bar, hk, e, bar_a if own else bar_b, 1.0)
	# the focus as a number by the strip's end
	var fpc := "%d%%" % int(round(e.focus / e.fmax() * 100.0))
	var fx := bar.end.x + 18.0
	UITheme.text(self, Vector2(fx, bar.position.y + 7.0), "FOCUS", "label", 11, UITheme.YELLOW if e.locked_in else UITheme.TEXT_DIM)
	UITheme.text(self, Vector2(fx, bar.end.y + 1.0), fpc, "number", 17, UITheme.YELLOW if e.locked_in else UITheme.TEXT)
	if party:
		_balls(Vector2(r.position.x + 40.0, r.position.y + (80.0 if own else 86.0)), f.side)
	if own:
		var hp_now := int(round(hk * f.max_hp))
		UITheme.text(self, Vector2(bar.end.x, bar.end.y + 21.0), "%d / %d" % [hp_now, int(f.max_hp)], "number", 21, UITheme.TEXT, 2)

# a nameplate's HP bar (a side's, or a plate rect's); its focus strip along the bottom
func hp_bar_rect(of) -> Rect2:
	var r: Rect2 = of if of is Rect2 else _rects()["plate_a" if String(of) == "a" else "plate_b"]
	return Rect2(r.position + Vector2(58, 48), Vector2(r.size.x - 58.0 - 96.0, 20))

func strip_rect(of, hp_h := 13.0) -> Rect2:
	var b := hp_bar_rect(of)
	return Rect2(b.position.x, b.position.y + hp_h + 2.0, b.size.x, b.size.y - hp_h - 2.0)

# the HP bar with the focus as a thin strip along its bottom (bar: its EnergyBar,
# for the eased fill and a disruption's red; null: drawn straight from the energy)
func _hp_bar(r: Rect2, hk: float, e: BattleEnergy, bar: EnergyBar, a := 1.0, hp_h := 13.0) -> void:
	var col := UITheme.GREEN if hk > 0.5 else (UITheme.YELLOW if hk > 0.2 else UITheme.RED)
	UITheme.para(self, r.grow(2.0), Color(0, 0, 0, 0.5 * a))
	var hr := Rect2(r.position + Vector2((r.size.y - hp_h) * UITheme.SKEW, 0), Vector2(r.size.x, hp_h))
	UITheme.bar(self, hr, hk, col, a, 0)
	var fs := Rect2(r.position.x, r.position.y + hp_h + 2.0, r.size.x, r.size.y - hp_h - 2.0)
	if bar != null and bar.energy == e: bar.draw_strip(self, fs, a)
	elif e != null: EnergyBar.strip(self, fs, e, e.focus, 0.0, t, a)

func _menu() -> void:
	var ap := UITheme.ease_out(float(_appear.menu))
	for i in 4:
		var r := menu_rect(i)
		r.position.x += (1.0 - ap) * (40.0 + i * 10.0)
		var bump := float(_bump.get("menu:%d" % i, 9.0))
		if bump < 0.2: r = r.grow(4.0 * (1.0 - bump / 0.2))
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
		# FIGHT: the moves already queued this turn (the window kept them)
		if i == 0 and battle and not battle.queued("a").is_empty():
			var qn := battle.queued("a").size()
			var qt := "%d QUEUED" % qn
			UITheme.chip(self, Vector2(r.position.x + 14.0, r.position.y - 12.0), qt, UITheme.YELLOW, UITheme.INK, 12, 20.0, ap)
	# the turn's prompt over the menu
	var mr := menu_rect(0)
	var who := String(battle.fighter("a").name).to_upper()
	UITheme.text(self, Vector2(mr.position.x + 6.0, mr.position.y - 12.0), "WHAT WILL %s DO?" % who, "heading", 18, Color(UITheme.TEXT, ap), 0, -1.0, 4)
