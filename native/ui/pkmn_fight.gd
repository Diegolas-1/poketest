class_name PkmnFightWindow
extends Control
# The FIGHT window of the Pokémon battle HUD (ui/pkmn_hud.gd): a popup over the
# battle where Ash plans his Pokémon's turn. Nothing here ends the turn but CONFIRM.
#   header     FIGHT, who is choosing, the energy (ready chips bright, the ones the
#              queue spends dim, locks purple), the foe in short (HP, where it is)
#   left       the moves, grouped OPENERS / MIDS / FINISHERS, then NOT EQUIPPED; each
#              row: type, name, role, what it does in short, power, its cost and its
#              state: READY, NEED n MORE (the chips it lacks ringed red), LOCKED, or
#              why it can't be used now (COMMITTED, TRAP LIMIT...)
#   right      THIS TURN: the queued moves in the order they go; remove one (its X,
#              or X on the pad), reorder (drag a card; on the pad A picks it up, up /
#              down carries it, A puts it down); CANCEL and CONFIRM under it
# Pad / keys: up / down moves (one step a press, held: after a pause, ~8 a second),
# left / right between the moves, the queue and the buttons; A adds the move (or
# picks up a card); X removes; START (+) confirms; B goes back (a card held: put
# back; else the window closes, the queue kept). Touch: tap a move to add it, drag
# the list to scroll, drag a card to reorder, tap X to remove, CANCEL, CONFIRM.
#
#   var w := PkmnFightWindow.new(); hud.add_child(w)
#   w.open(battle)                         # battle.fighter("a") is the one choosing
#   w.handle(event) -> bool; w.refresh()   # after the queue changed
#   signals add_move(id), remove_at(i), reorder(from, to), confirm(), cancel()

signal add_move(id: String)
signal remove_at(index: int)
signal reorder(from: int, to: int)
signal confirm()
signal cancel()

const ROW_H := 62.0
const ROW_GAP := 6.0
const HEAD_H := 30.0
const CARD_H := 56.0
const CARD_GAP := 8.0
const TIERS := [["opener", "OPENERS", "ABOUT 1 CHIP"], ["mid", "MIDS", "2 TO 4 CHIPS"], ["finisher", "FINISHERS", "EVERY CHIP"]]
const ROLE_TAG := {"reaction": "REACTION", "two_phase": "2 TURNS", "disruption": "DISRUPT", "utility": "UTILITY"}
const ROLE_COL := {"reaction": Color("9d6cf0"), "two_phase": Color("ff9a1f"), "disruption": Color("ee3b33"), "utility": Color("3fb6f5")}
const EFFECT_WORD := {"para": "MAY PARALYSE", "burn": "MAY BURN", "poison": "MAY POISON", "sleep": "SLEEP", "confuse": "MAY CONFUSE",
	"flinch": "MAY FLINCH", "recoil": "RECOIL", "atk_down": "ATK DOWN", "def_down": "DEF DOWN", "spe_down": "SPEED DOWN",
	"acc_down": "ACCURACY DOWN", "eva_up": "EVASION UP", "disrupt": "SHAKES FOCUS", "drain": "DRAINS HP", "recharge": "THEN RESTS"}

var battle: PkmnBattle
var safe_override := Rect2()
var choosing := ""                # doubles: whose moves (the window's subtitle)
var confirm_label := "CONFIRM"    # doubles: "NEXT" for the first of two
var reach_fn: Callable            # (id) -> "" or a warning (the foe out of reach)
var on := false
var rows: Array = []              # {head, sub} | {id}
var sel := 0                      # the selected row (a move)
var col := 0                      # the cursor: 0 the moves, 1 the queue, 2 the buttons
var qsel := 0
var bsel := 1                     # 0 CANCEL, 1 CONFIRM
var held := -1                    # a queue card picked up (pad) or dragged (touch)
var t := 0.0
var nav := UIInput.Nav.new()
var _ap := 0.0                    # opening
var _closing := false
var _scroll := 0.0
var _scroll_to := 0.0
var _anim := {}                   # row -> selection 0..1
var _flash := {}                  # "row:i" | "card:i" | "btn:i" -> t
var _shake := {}                  # "row:i" -> t
var _card_pop := {}               # queue index -> t (just added)
var _press := {}                  # a touch: {pos, where, i, scroll0, moved, frame}
var _drag_y := 0.0
var _ptr_frame := {}

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

func f() -> PkmnBattle.Fighter: return battle.fighter("a") if battle else null
func e() -> BattleEnergy: return f().e if f() else null

func open(b: PkmnBattle) -> void:
	battle = b
	on = true
	visible = true
	_closing = false
	_ap = 0.0
	held = -1
	_press = {}
	col = 0
	nav.reset()
	_build()
	# the cursor on the first move he can use now
	sel = _first_move()
	for i in rows.size():
		if rows[i].has("id") and state_of(String(rows[i].id)) == "ready": sel = i; break
	_scroll = _want_scroll()
	_scroll_to = _scroll
	_anim.clear()
	qsel = maxi(0, _q().size() - 1)

func close() -> void:
	on = false
	_closing = true
	held = -1
	_press = {}

func refresh() -> void:
	_build()
	sel = clampi(sel, 0, maxi(0, rows.size() - 1))
	if not rows.is_empty() and not rows[sel].has("id"): sel = _next_move(sel, 1)
	qsel = clampi(qsel, 0, maxi(0, _q().size() - 1))
	if col == 1 and _q().is_empty(): col = 0

func _q() -> Array: return f().queue if f() else []

# ---------- the moves ----------
func _build() -> void:
	rows = []
	var en := e()
	if en == null: return
	var groups := {}
	var off := []
	for id in en.known:
		if en.locked(id): off.append(id); continue
		var tr := BattleEnergy.tier_of(id)
		if not groups.has(tr): groups[tr] = []
		groups[tr].append(id)
	for T in TIERS:
		var g: Array = groups.get(T[0], [])
		if g.is_empty(): continue
		g.sort_custom(func(x, y): return BattleEnergy.cost_of(x).size() < BattleEnergy.cost_of(y).size() if BattleEnergy.cost_of(x).size() != BattleEnergy.cost_of(y).size() else en.known.find(x) < en.known.find(y))
		rows.append({"head": T[1], "sub": T[2]})
		for id in g: rows.append({"id": id})
	if not off.is_empty():
		rows.append({"head": "NOT EQUIPPED", "sub": "SLOTS FULL %d/%d" % [en.equipped.size(), en.slots]})
		for id in off: rows.append({"id": id})

func _first_move() -> int:
	for i in rows.size():
		if rows[i].has("id"): return i
	return 0

func _next_move(i: int, d: int) -> int:
	var j := i + d
	while j >= 0 and j < rows.size():
		if rows[j].has("id"): return j
		j += d
	return i

func id_sel() -> String: return String(rows[sel].id) if sel < rows.size() and rows[sel].has("id") else ""

func move_rows() -> Array: return rows.filter(func(r): return r.has("id")).map(func(r): return String(r.id))

# ready | short | locked | blocked (a reason: why_not)
func state_of(id: String) -> String:
	var en := e()
	if en == null: return "short"
	if en.locked(id): return "locked"
	if battle.can_queue("a", id): return "ready"
	if why_not(id) != "": return "blocked"
	return "short"

func why_not(id: String) -> String:
	var fi := f()
	if fi.fainted(): return "FAINTED"
	if fi.status == "sleep": return "ASLEEP"
	if fi.recharge_turn == battle.turn: return "RECHARGING"
	if battle.committed_now("a"): return "COMMITTED"
	if BattleEnergy.role_of(id) == "two_phase" and not fi.e.commit.is_empty(): return "MID-MOVE"
	if BattleEnergy.role_of(id) == "reaction" and fi.e.can_pay(id): return "TRAP LIMIT"
	return ""

func short_line(id: String) -> String:
	var m := BattleEnergy.move(id)
	var bits := []
	var role := String(m.get("role", "offense"))
	if BattleEnergy.is_all(id):
		var ppc := float(m.get("power_per_chip", BattleConfig.num("finisher", "power_per_chip_default", 35.0)))
		bits.append("+%d POW A CHIP" % int(ppc))
		var n := e().available() if e() else 0
		if n >= int(BattleEnergy.all_spec(id).min): bits.append("NOW %d" % int(BattleEnergy.move_power(id, n)))
	elif role == "reaction":
		var r: Dictionary = m.get("reaction", {})
		bits.append({"any": "TRAP: ANY MOVE", "attack": "TRAP: ANY ATTACK", "physical": "TRAP: PHYSICAL", "special": "TRAP: SPECIAL"}.get(String(r.get("trigger", "any")), "TRAP"))
	elif role == "two_phase":
		bits.append("PAY NOW, STRIKE NEXT TURN")
	if int(m.get("priority", 0)) > 0 and role != "reaction": bits.append("GOES FIRST")
	var acc := int(m.get("accuracy", 100))
	if acc > 0 and acc < 100: bits.append("ACC %d" % acc)
	elif acc == 0 and int(m.get("power", 0)) > 0: bits.append("NEVER MISSES")
	for fx in m.get("effects", []):
		if EFFECT_WORD.has(fx) and bits.size() < 3: bits.append(EFFECT_WORD[fx])
	if bits.is_empty(): bits.append(String(m.get("desc", "")).trim_suffix(".").to_upper())
	return "  ·  ".join(bits)

# ---------- layout ----------
func sr() -> Rect2: return UITheme.safe_rect(self, safe_override)

func win_rect() -> Rect2:
	var S := sr()
	var w := minf(S.size.x - 32.0, 1320.0)
	var h := S.size.y - 28.0
	return Rect2(S.get_center().x - w * 0.5, S.position.y + 14.0, w, h)

func _head_r() -> Rect2:
	var W := win_rect()
	return Rect2(W.position + Vector2(24, 12), Vector2(W.size.x - 48, 70))

func list_rect() -> Rect2:
	var W := win_rect()
	var top := W.position.y + 96.0
	return Rect2(W.position.x + 30.0, top, W.size.x * 0.6 - 44.0, W.end.y - 44.0 - top)

func queue_rect() -> Rect2:
	var W := win_rect()
	var L := list_rect()
	var x := L.end.x + 36.0
	return Rect2(x, L.position.y, W.end.x - 28.0 - x, L.size.y)

func _row_y(i: int) -> float:
	var y := 0.0
	for j in i: y += (HEAD_H if not rows[j].has("id") else ROW_H + ROW_GAP)
	return y

func row_rect(i: int) -> Rect2:
	var L := list_rect()
	var h := HEAD_H if not rows[i].has("id") else ROW_H
	return Rect2(L.position.x, L.position.y + _row_y(i) - _scroll, L.size.x, h)

func _content_h() -> float: return _row_y(rows.size())

func _max_scroll() -> float: return maxf(0.0, _content_h() - list_rect().size.y)

func _want_scroll() -> float:
	if rows.is_empty(): return 0.0
	var L := list_rect()
	var y := _row_y(sel)
	var s := _scroll_to
	# keep the selected row (and the group head above it) in view, with a row's margin
	var top := y - (HEAD_H if sel > 0 and not rows[sel - 1].has("id") else 0.0) - 8.0
	if top < s: s = top
	if y + ROW_H + 24.0 > s + L.size.y: s = y + ROW_H + 24.0 - L.size.y
	return clampf(s, 0.0, _max_scroll())

func card_rect(i: int) -> Rect2:
	var Q := queue_rect()
	return Rect2(Q.position.x, Q.position.y + 46.0 + i * (CARD_H + CARD_GAP), Q.size.x, CARD_H)

func x_rect(i: int) -> Rect2:
	var r := card_rect(i)
	return Rect2(r.end.x - 52.0, r.position.y + 6.0, 44.0, r.size.y - 12.0)

func btn_rect(i: int) -> Rect2:
	var Q := queue_rect()
	var h := 66.0
	var gap := 14.0
	var wc := (Q.size.x - gap) * 0.38
	if i == 0: return Rect2(Q.position.x, Q.end.y - h, wc, h)
	return Rect2(Q.position.x + wc + gap, Q.end.y - h, Q.size.x - wc - gap, h)

# ---------- input ----------
func handle(ev: InputEvent) -> bool:
	if not on: return false
	var d := nav.event(ev)
	if d != Vector2i.ZERO:
		_nav(d)
		return true
	if nav.swallow(ev): return true
	if ev.is_action_pressed("use") or ev.is_action_pressed("ui_accept"): _press_a(); return true
	if ev.is_action_pressed("back") or ev.is_action_pressed("ui_cancel"): _press_b(); return true
	if ev.is_action_pressed("jump"): _press_x(); return true
	if ev.is_action_pressed("menu"): _do_confirm(); return true
	if ev is InputEventKey and ev.pressed and not ev.echo and ev.keycode >= KEY_1 and ev.keycode <= KEY_9:
		var ids := move_rows()
		var n: int = ev.keycode - KEY_1
		if n < ids.size():
			for i in rows.size():
				if rows[i].has("id") and String(rows[i].id) == String(ids[n]): sel = i; col = 0; _add(i)
		return true
	return _pointer(ev)

func _process(dt: float) -> void:
	t += dt
	if on:
		_ap = minf(1.0, _ap + dt / UITheme.BASE)
		var d := nav.tick(dt)
		if d != Vector2i.ZERO and d.y != 0: _nav(d)   # (held: only up / down repeat)
	elif _closing:
		_ap = maxf(0.0, _ap - dt / UITheme.FAST)
		if _ap <= 0.0: _closing = false; visible = false
	if _press.is_empty() or String(_press.get("where", "")) != "list" or not bool(_press.get("moved", false)):
		_scroll_to = _want_scroll() if _press.is_empty() else _scroll_to
		_scroll = lerpf(_scroll, _scroll_to, 1.0 - exp(-dt * 16.0))
	for i in rows.size():
		_anim[i] = move_toward(float(_anim.get(i, 0.0)), 1.0 if i == sel and col == 0 else 0.0, dt / UITheme.FAST)
	for D in [_flash, _shake, _card_pop]:
		for k in D.keys():
			D[k] += dt
			if D[k] > 0.5: D.erase(k)
	queue_redraw()

func _nav(d: Vector2i) -> void:
	var q := _q()
	match col:
		0:
			if d.y != 0:
				var s := _next_move(sel, d.y)
				if s != sel: sel = s; Sfx.ui("ui_cursor")
			elif d.x > 0:
				col = 1 if not q.is_empty() else 2
				if col == 2: bsel = 1
				qsel = clampi(qsel, 0, maxi(0, q.size() - 1))
				Sfx.ui("ui_cursor")
		1:
			if held >= 0 and d.y != 0:
				var to := clampi(held + d.y, _first_free(), q.size() - 1)
				if to != held:
					reorder.emit(held, to)
					held = to; qsel = to
					Sfx.ui("ui_cursor")
				return
			if d.y < 0 and qsel > 0: qsel -= 1; Sfx.ui("ui_cursor")
			elif d.y > 0:
				if qsel < q.size() - 1: qsel += 1
				else: col = 2; bsel = 1
				Sfx.ui("ui_cursor")
			elif d.x < 0 and held < 0: col = 0; Sfx.ui("ui_cursor")
		2:
			if d.x < 0:
				if bsel == 1: bsel = 0
				else: col = 0
				Sfx.ui("ui_cursor")
			elif d.x > 0 and bsel == 0: bsel = 1; Sfx.ui("ui_cursor")
			elif d.y < 0 and not q.is_empty(): col = 1; qsel = q.size() - 1; Sfx.ui("ui_cursor")

func _first_free() -> int:
	var q := _q()
	for i in q.size():
		if not bool(q[i].get("free", false)): return i
	return q.size()

func _press_a() -> void:
	match col:
		0: _add(sel)
		1:
			var q := _q()
			if qsel >= q.size(): return
			if held >= 0: held = -1; Sfx.ui("ui_confirm"); _flash["card:%d" % qsel] = 0.0; return
			if bool(q[qsel].get("free", false)): Sfx.ui("ui_error"); _shake["card:%d" % qsel] = 0.0; return
			held = qsel
			Sfx.ui("ui_toggle_on")
		2:
			if bsel == 0: _do_cancel()
			else: _do_confirm()

func _press_b() -> void:
	if held >= 0:
		held = -1
		Sfx.ui("ui_cancel")
		return
	_do_cancel()

func _press_x() -> void:
	var q := _q()
	if col == 1 and qsel < q.size(): _remove(qsel)
	else:
		for i in range(q.size() - 1, -1, -1):
			if not bool(q[i].get("free", false)): _remove(i); return
		Sfx.ui("ui_error")

func _add(i: int) -> void:
	if i < 0 or i >= rows.size() or not rows[i].has("id"): return
	var id := String(rows[i].id)
	if state_of(id) != "ready":
		_shake["row:%d" % i] = 0.0
		Sfx.ui("ui_error")
		return
	_flash["row:%d" % i] = 0.0
	Sfx.ui("ui_confirm")
	var n := _q().size()
	add_move.emit(id)
	if _q().size() > n: _card_pop[_q().size() - 1] = 0.0

func _remove(i: int) -> void:
	var q := _q()
	if i < 0 or i >= q.size() or bool(q[i].get("free", false)):
		Sfx.ui("ui_error")
		return
	Sfx.ui("ui_cancel")
	held = -1
	remove_at.emit(i)
	refresh()

func _do_cancel() -> void:
	Sfx.ui("ui_cancel")
	cancel.emit()

func _do_confirm() -> void:
	_flash["btn:1"] = 0.0
	Sfx.ui("ui_confirm")
	confirm.emit()

# touch and mouse: tap a move to add it, drag the list, drag a card, X, the buttons
func _ptr(ev: InputEvent) -> Dictionary:
	var out := {}
	if ev is InputEventScreenTouch and ev.index == 0: out = {"k": "down" if ev.pressed else "up", "pos": ev.position}
	elif ev is InputEventScreenDrag and ev.index == 0: out = {"k": "move", "pos": ev.position}
	elif ev is InputEventMouseButton and ev.button_index == MOUSE_BUTTON_LEFT: out = {"k": "down" if ev.pressed else "up", "pos": ev.position}
	elif ev is InputEventMouseMotion and (ev.button_mask & MOUSE_BUTTON_MASK_LEFT): out = {"k": "move", "pos": ev.position}
	if out.is_empty(): return out
	# (a touch also arrives as a mouse event, and a click as a touch: one of each a frame)
	if out.k != "move":
		var fr := Engine.get_process_frames()
		if int(_ptr_frame.get(out.k, -1)) == fr: return {"k": "dup"}
		_ptr_frame[out.k] = fr
	out.pos = get_global_transform_with_canvas().affine_inverse() * Vector2(out.pos)
	return out

func _pointer(ev: InputEvent) -> bool:
	var p := _ptr(ev)
	if p.is_empty(): return false
	if p.k == "dup": return true
	var pos: Vector2 = p.pos
	match String(p.k):
		"down":
			_press = {"pos": pos, "where": "", "i": -1, "scroll0": _scroll, "moved": false}
			for i in 2:
				if btn_rect(i).has_point(pos): _press.where = "btn"; _press.i = i; return true
			var q := _q()
			for i in q.size():
				if not bool(q[i].get("free", false)) and x_rect(i).grow(8.0).has_point(pos): _press.where = "x"; _press.i = i; return true
				if card_rect(i).grow_individual(0, CARD_GAP * 0.5, 0, CARD_GAP * 0.5).has_point(pos): _press.where = "card"; _press.i = i; return true
			if list_rect().has_point(pos):
				_press.where = "list"
				for i in rows.size():
					if rows[i].has("id") and row_rect(i).grow_individual(0, ROW_GAP * 0.5, 0, ROW_GAP * 0.5).has_point(pos): _press.i = i
				return true
			return true   # (the window is modal: a tap off it does nothing)
		"move":
			if _press.is_empty(): return true
			var dv: Vector2 = pos - Vector2(_press.pos)
			if String(_press.where) == "list":
				if absf(dv.y) > 12.0: _press.moved = true
				if bool(_press.moved):
					_scroll = clampf(float(_press.scroll0) - dv.y, -40.0, _max_scroll() + 40.0)
					_scroll_to = clampf(_scroll, 0.0, _max_scroll())
			elif String(_press.where) == "card":
				var i := int(_press.i)
				if absf(dv.y) > 10.0 and not bool(_press.moved) and not bool(_q()[i].get("free", false)):
					_press.moved = true
					held = i; qsel = i; col = 1
					Sfx.ui("ui_toggle_on")
				if bool(_press.moved): _drag_y = dv.y
			return true
		"up":
			if _press.is_empty(): return true
			var pr := _press
			_press = {}
			var i := int(pr.i)
			match String(pr.where):
				"btn":
					if btn_rect(i).grow(10.0).has_point(pos):
						col = 2; bsel = i
						if i == 0: _do_cancel()
						else: _do_confirm()
				"x":
					if x_rect(i).grow(14.0).has_point(pos): _remove(i)
				"card":
					if bool(pr.moved) and held >= 0:
						var to := clampi(held + int(round(_drag_y / (CARD_H + CARD_GAP))), _first_free(), _q().size() - 1)
						if to != held: reorder.emit(held, to); Sfx.ui("ui_confirm")
						qsel = to
						held = -1
						_drag_y = 0.0
					else:
						col = 1; qsel = i
						Sfx.ui("ui_cursor")
				"list":
					_scroll_to = clampf(_scroll, 0.0, _max_scroll())
					if not bool(pr.moved) and i >= 0:
						sel = i; col = 0
						_add(i)
			return true
	return true

# ---------- drawing ----------
func _draw() -> void:
	if battle == null or _ap <= 0.0: return
	var ap := UITheme.ease_out(_ap)
	var S := get_viewport_rect()
	draw_rect(Rect2(Vector2(-40, -40), S.size + Vector2(80, 80)), Color(UITheme.DIM, UITheme.DIM.a * ap))
	var W := win_rect()
	W.position.y += (1.0 - ap) * 40.0
	var pts := UITheme.chamfer_points(W, 22.0)
	UITheme.shadow(self, pts, ap, Vector2(0, 8))
	UITheme.fill_v(self, pts, Color(Color("1a2236"), 0.97 * ap), Color(Color("10162a"), 0.97 * ap))
	UITheme.outline(self, pts, Color(1, 1, 1, 0.12 * ap), 1.5)
	UITheme.para(self, Rect2(W.position + Vector2(30, -5), Vector2(150, 7)), Color(UITheme.RED, ap))
	_header(ap)
	_list(ap)
	_queue(ap)
	_hints(ap)

func _header(a: float) -> void:
	var H := _head_r()
	var fi := f()
	var y := H.position.y + 30.0
	var x := H.position.x + 8.0
	x += UITheme.text(self, Vector2(x, y + 10.0), "FIGHT", "display", 40, Color(UITheme.TEXT, a)) + 18.0
	var who := choosing if choosing != "" else "%s  Lv%d" % [String(fi.name).to_upper(), int(fi.level)]
	UITheme.text(self, Vector2(x, y - 4.0), "PLAN THE TURN", "label", 13, Color(UITheme.YELLOW, a))
	UITheme.text(self, Vector2(x, y + 18.0), who, "heading", 20, Color(UITheme.TEXT, a))
	# the energy: every chip, ready, spent by the queue, locked
	var en := e()
	var L := en.chip_list()
	var ready := L.filter(func(c): return c.state == "ready").size()
	var r := 15.0
	var step := 34.0
	var cx := H.position.x + H.size.x * 0.43
	UITheme.text(self, Vector2(cx, y - 4.0), "ENERGY", "label", 13, Color(UITheme.TEXT_DIM, a))
	var spend := _preview_spend()
	var ri := 0
	for i in L.size():
		var c: Dictionary = L[i]
		var p := Vector2(cx + 12.0 + i * step, y + 18.0)
		var st := String(c.state)
		if st == "ready":
			var lit: bool = spend.has(ri)
			if lit:
				UITheme.glow(self, p, r * 1.3, UITheme.YELLOW, a * (0.6 + 0.3 * sin(t * 7.0)))
				p.y -= 3.0
			EnergyIcon.draw_icon(self, String(c.kind), p, r, a)
			if lit: draw_arc(p, r + 3.0, 0.0, TAU, 28, Color(UITheme.YELLOW, a), 2.5, true)
			ri += 1
		elif st == "spent":
			EnergyIcon.draw_icon(self, String(c.kind), p, r * 0.82, a * 0.5, {"dim": 0.85})
			draw_arc(p, r * 0.9, 0.0, TAU, 24, Color(1, 1, 1, 0.25 * a), 1.4, true)
		else:
			EnergyIcon.draw_icon(self, String(c.kind), p, r * 0.9, a * 0.8, {"dim": 0.6})
			draw_arc(p, r * 1.05, 0.0, TAU, 24, Color(EnergyBar.TRAP_COL, a), 2.0, true)
	var gx := cx + 12.0 + L.size() * step
	# what the selected move still lacks: red ghosts
	for k in range(_preview_miss().size()):
		var p2 := Vector2(gx + k * step, y + 18.0)
		EnergyIcon.draw_icon(self, String(_preview_miss()[k]), p2, r * 0.85, 0.35 * a, {"flat": true, "dim": 0.3})
		draw_arc(p2, r + 2.0, 0.0, TAU, 28, Color(UITheme.RED, a * (0.6 + 0.4 * sin(t * 7.0))), 2.5, true)
	if L.is_empty(): UITheme.text_mid(self, Vector2(cx, y + 18.0), "NO CHIPS YET", "label", 15, Color(UITheme.TEXT_DIM, a))
	var lt := "%d READY" % ready
	var spent_n := L.filter(func(c): return c.state == "spent").size()
	if spent_n > 0: lt += "  ·  %d IN THE QUEUE" % spent_n
	UITheme.text(self, Vector2(cx + 70.0, y - 4.0), lt, "label", 13, Color(UITheme.TEXT, a))
	# the foe, in short
	var fo := battle.fighter("b")
	var fr := Rect2(H.end.x - 300.0, H.position.y + 2.0, 300.0, 58.0)
	UITheme.plate(self, fr, 0.9 * a, UITheme.SKEW, UITheme.PLATE, 8.0)
	UITheme.para(self, Rect2(fr.position + Vector2(12, -3), Vector2(56, 4)), Color(UITheme.YELLOW, a))
	var nw := UITheme.text(self, fr.position + Vector2(20, 26), "VS " + String(fo.name).to_upper(), "heading", 19, Color(UITheme.TEXT, a))
	UITheme.text(self, fr.position + Vector2(26 + nw, 26), "Lv%d" % int(fo.level), "label", 13, Color(UITheme.TEXT_DIM, a))
	var hk := float(fo.hp) / maxf(1.0, fo.max_hp)
	UITheme.bar(self, Rect2(fr.position + Vector2(22, 38), Vector2(fr.size.x - 60.0, 9)), hk, UITheme.GREEN if hk > 0.5 else (UITheme.YELLOW if hk > 0.2 else UITheme.RED), a, 0)
	var semi := fo.e.semi()
	var tag: String = {"underground": "UNDERGROUND", "airborne": "IN THE AIR", "underwater": "UNDERWATER"}.get(semi, "")
	if tag == "" and not fo.e.locks.is_empty(): tag = "TRAP SET"
	if tag != "": UITheme.chip(self, Vector2(fr.end.x - UITheme.text_w(tag, "label", 12) - 32.0, fr.position.y + 6.0), tag, UITheme.ORANGE if tag != "TRAP SET" else EnergyBar.TRAP_COL, UITheme.INK if tag != "TRAP SET" else UITheme.WHITE, 12, 19.0, a)

# the ready chips (their index among the ready ones) the selected move would use
func _preview_spend() -> Array:
	var id := id_sel()
	if col != 0 or id == "" or state_of(id) != "ready": return []
	var m = BattleEnergy.match_cost(e().chips, e().cost_for(id))
	return m if m != null else []

func _preview_miss() -> Array:
	var id := id_sel()
	if col != 0 or id == "" or state_of(id) != "short": return []
	return e().missing(id)

func _list(a: float) -> void:
	var L := list_rect()
	var clip := L.grow_individual(30, 8, 30, 8)
	for i in rows.size():
		var r := row_rect(i)
		if r.end.y < clip.position.y or r.position.y > clip.end.y: continue
		# rows fade at the scrolled edges
		var edge := clampf(minf(r.end.y - L.position.y + 10.0, L.end.y + 10.0 - r.position.y) / 26.0, 0.0, 1.0)
		var stg := clampf(_ap * 2.2 - i * 0.06, 0.0, 1.0) if on else 1.0
		var ra := a * edge * UITheme.ease_out(stg)
		if ra <= 0.01: continue
		r.position.x += (1.0 - UITheme.ease_out(stg)) * 30.0
		if not rows[i].has("id"):
			var hy := r.position.y + r.size.y * 0.6
			var hw := UITheme.text(self, Vector2(r.position.x + 4.0, hy + 5.0), String(rows[i].head), "heading", 17, Color(UITheme.YELLOW, ra))
			UITheme.text(self, Vector2(r.position.x + 14.0 + hw, hy + 5.0), String(rows[i].sub), "label", 12, Color(UITheme.TEXT_DIM, ra))
			draw_line(Vector2(r.position.x + 24.0 + hw + UITheme.text_w(String(rows[i].sub), "label", 12), hy), Vector2(r.end.x, hy), Color(1, 1, 1, 0.12 * ra), 1.0)
			continue
		_row(r, i, ra)
	# the scrollbar, when the list runs on
	if _max_scroll() > 1.0:
		var k := L.size.y / _content_h()
		var by := L.position.y + (L.size.y - L.size.y * k) * clampf(_scroll / _max_scroll(), 0.0, 1.0)
		draw_rect(Rect2(L.end.x + 10.0, L.position.y, 4.0, L.size.y), Color(1, 1, 1, 0.08 * a))
		draw_rect(Rect2(L.end.x + 10.0, by, 4.0, L.size.y * k), Color(1, 1, 1, 0.45 * a))

func _row(r: Rect2, i: int, a: float) -> void:
	var id := String(rows[i].id)
	var m := BattleEnergy.move(id)
	var st := state_of(id)
	var k: float = _anim.get(i, 0.0)
	var kind := BattleEnergy.energy_of(String(m.get("type", "normal")))
	var tc := EnergyIcon.color(kind)
	var dim := 1.0 if st == "ready" else (0.6 if st == "short" else 0.48)
	if _shake.has("row:%d" % i): r.position.x += sin(float(_shake["row:%d" % i]) * 60.0) * 8.0 * maxf(0.0, 1.0 - float(_shake["row:%d" % i]) / 0.35)
	r.position.x -= k * 8.0
	var pts := UITheme.para_points(r, UITheme.SKEW * 0.5)
	if k > 0.01:
		UITheme.shadow(self, pts, a * k, Vector2(0, 4))
		UITheme.fill_v(self, pts, Color(UITheme.PLATE_HI, a * (1.0 - k)).lerp(Color(UITheme.WHITE, a), k), Color(UITheme.PLATE, a * (1.0 - k)).lerp(Color(UITheme.PAPER, a), k))
	else:
		UITheme.fill_v(self, pts, Color(UITheme.PLATE_HI, a * 0.9), Color(UITheme.PLATE, a * 0.9))
	UITheme.accent_bar(self, r, Color(tc, a * dim), a, UITheme.SKEW * 0.5, 6.0 + 3.0 * k)
	if _flash.has("row:%d" % i): UITheme.fill(self, pts, Color(UITheme.YELLOW, 0.5 * maxf(0.0, 1.0 - float(_flash["row:%d" % i]) / 0.3) * a))
	var fg := Color(UITheme.TEXT, a * dim).lerp(Color(UITheme.INK, a * dim), k)
	var sub := Color(UITheme.TEXT_DIM, a * dim).lerp(Color(UITheme.INK_SOFT, a * dim), k)
	var cy := r.get_center().y
	EnergyIcon.draw_icon(self, kind, Vector2(r.position.x + 32.0, cy), 17.0, a * maxf(dim, 0.6))
	var nx := r.position.x + 60.0
	var nw := UITheme.text(self, Vector2(nx, cy + 1.0), String(m.get("name", id)).to_upper(), "display", 25, fg)
	var rt: String = ROLE_TAG.get(String(m.get("role", "")), "")
	if rt != "": UITheme.chip(self, Vector2(nx + nw + 10.0, cy - 17.0), rt, Color(ROLE_COL.get(String(m.get("role", "")), UITheme.SKY), a * dim), UITheme.INK, 11, 17.0)
	# right: the state, the cost, the power
	var cost := BattleEnergy.cost_of(id)
	var shown := cost.filter(func(c): return c != BattleEnergy.COLORLESS) + cost.filter(func(c): return c == BattleEnergy.COLORLESS)
	var miss: Array = e().missing(id) if st == "short" else []
	var cr := 12.0
	var step := 27.0
	var cost_x := r.end.x - 28.0
	var mm := miss.duplicate()
	for j in range(shown.size() - 1, -1, -1):
		var c := Vector2(cost_x - (shown.size() - 1 - j) * step, cy - 9.0)
		var kd: String = shown[j]
		var lacking := mm.has(kd)
		if lacking: mm.erase(kd)
		EnergyIcon.draw_icon(self, kd, c, cr, a * (0.45 if lacking or st == "locked" else 1.0), {"dim": 0.5 if lacking or st == "locked" else 0.0})
		if lacking: draw_arc(c, cr + 2.5, 0.0, TAU, 24, Color(UITheme.RED, a * (0.7 + 0.3 * sin(t * 7.0))), 2.2, true)
	var cleft := cost_x - (shown.size() - 1) * step - cr
	if BattleEnergy.is_all(id):
		UITheme.chip(self, Vector2(cleft - 50.0, cy - 20.0), "ALL", Color(UITheme.YELLOW, a * dim), UITheme.INK, 13, 21.0)
		cleft -= 56.0
	var pw := int(m.get("power", 0))
	if pw > 0:
		UITheme.text(self, Vector2(cleft - 14.0, cy - 2.0), str(pw), "number", 22, fg, 2)
		UITheme.text(self, Vector2(cleft - 14.0, cy + 16.0), "POW", "label", 10, sub, 2)
	# the state, under the cost
	var badge := ""
	var bc := UITheme.GREEN
	var btc := UITheme.INK
	match st:
		"ready": badge = "READY"
		"short":
			badge = "NEED %d MORE" % miss.size() if miss.size() > 0 else "SHORT"
			bc = UITheme.RED; btc = UITheme.WHITE
		"locked":
			var nl := BattleEnergy.next_slot_level(e().level, e().species)
			badge = "LOCKED" + (" · SLOT AT LV %d" % nl if nl > 0 else "")
			bc = UITheme.ORANGE
		"blocked":
			badge = why_not(id)
			bc = Color(0.6, 0.63, 0.7); btc = UITheme.INK
	var bw := UITheme.text_w(badge, "label", 11) + 18.0
	UITheme.chip(self, Vector2(r.end.x - 24.0 - bw, cy + 7.0), badge, Color(bc, a * (1.0 if st == "ready" else 0.9)), btc, 11, 17.0)
	# what it does, in short (or why it won't reach)
	var line := short_line(id)
	var lc := sub
	var warn := String(reach_fn.call(id)) if reach_fn.is_valid() and st != "locked" else ""
	if warn != "": line = warn; lc = Color(UITheme.GREEN, a).lerp(Color("1d7a40", a), k) if warn.begins_with("REACHES") else Color(UITheme.ORANGE, a).lerp(Color("b4560b", a), k)
	UITheme.text(self, Vector2(nx + 1.0, cy + 21.0), line, "label", 13, lc, 0, maxf(60.0, r.end.x - 24.0 - bw - 16.0 - nx))
	if k > 0.5 and UIInput.device != "touch" and st == "ready":
		UITheme.glyph(self, Vector2(r.position.x - 22.0, cy), "use", 26.0, a)

func _queue(a: float) -> void:
	var Q := queue_rect()
	var q := _q()
	var y := Q.position.y + 22.0
	var tw := UITheme.text(self, Vector2(Q.position.x + 2.0, y + 6.0), "THIS TURN", "heading", 20, Color(UITheme.TEXT, a))
	UITheme.text(self, Vector2(Q.position.x + 14.0 + tw, y + 6.0), "IN ORDER" if q.size() > 1 else "", "label", 12, Color(UITheme.TEXT_DIM, a))
	UITheme.text(self, Vector2(Q.end.x, y + 6.0), "%d MOVE%s" % [q.size(), "" if q.size() == 1 else "S"], "label", 13, Color(UITheme.YELLOW if q.size() > 0 else UITheme.TEXT_DIM, a), 2)
	draw_line(Vector2(Q.position.x, y + 16.0), Vector2(Q.end.x, y + 16.0), Color(1, 1, 1, 0.12 * a), 1.0)
	# where a dragged card would land
	var land := -1
	if held >= 0 and not _press.is_empty() and bool(_press.get("moved", false)):
		land = clampi(held + int(round(_drag_y / (CARD_H + CARD_GAP))), _first_free(), q.size() - 1)
	var order := range(q.size())
	if land >= 0 and land != held:
		order.erase(held)
		order.insert(land, held)
	for slot in order.size():
		var i: int = order[slot]
		var r := card_rect(slot)
		if i == held and land >= 0: r = card_rect(held); r.position.y += _drag_y
		_card(r, i, slot, a, q[i])
	if q.is_empty():
		var r0 := card_rect(0)
		_dashed(r0, a * (0.6 + 0.2 * sin(t * 3.0)))
		UITheme.text_mid(self, r0.get_center(), "TAP A MOVE TO ADD IT" if UIInput.device == "touch" else "PICK A MOVE TO ADD IT", "label", 15, Color(UITheme.TEXT_DIM, a), 1)
	elif _q_room():
		var rn := card_rect(q.size())
		if rn.end.y < btn_rect(0).position.y - 40.0:
			_dashed(rn, a * 0.35)
			UITheme.text_mid(self, rn.get_center(), "+", "display", 26, Color(UITheme.TEXT_DIM, a * 0.7), 1)
	# the note on the order
	var ny := btn_rect(0).position.y - 18.0
	var note := "NO MOVES: %s RESTS AND FOCUSES" % String(f().name).to_upper() if q.is_empty() else "TAKES TURNS WITH THE FOE BY SPEED"
	UITheme.text(self, Vector2(Q.position.x + 2.0, ny), note, "label", 12, Color(UITheme.TEXT_DIM, a))
	_buttons(a)

func _q_room() -> bool:
	for id in move_rows():
		if state_of(String(id)) == "ready": return true
	return false

func _dashed(r: Rect2, a: float) -> void:
	var pts := UITheme.para_points(r, UITheme.SKEW * 0.5)
	pts.append(pts[0])
	for j in 4:
		var p0: Vector2 = pts[j]
		var p1: Vector2 = pts[j + 1]
		var n := int(p0.distance_to(p1) / 14.0)
		for s in n:
			if s % 2 == 0: draw_line(p0.lerp(p1, float(s) / n), p0.lerp(p1, float(s + 1) / n), Color(1, 1, 1, 0.35 * a), 1.5, true)

func _card(r: Rect2, i: int, slot: int, a: float, q: Dictionary) -> void:
	var id := String(q.move)
	var m := BattleEnergy.move(id)
	var kind := BattleEnergy.energy_of(String(m.get("type", "normal")))
	var free := bool(q.get("free", false))
	var on_it := col == 1 and qsel == i
	var lifted := held == i
	var pop := float(_card_pop.get(i, 9.0))
	if pop < 0.3: r = r.grow(6.0 * (1.0 - UITheme.ease_back(pop / 0.3, 2.0)))
	if _shake.has("card:%d" % i): r.position.x += sin(float(_shake["card:%d" % i]) * 60.0) * 7.0 * maxf(0.0, 1.0 - float(_shake["card:%d" % i]) / 0.35)
	if lifted: r.position.x -= 10.0
	var pts := UITheme.para_points(r, UITheme.SKEW * 0.5)
	UITheme.shadow(self, pts, a * (1.6 if lifted else 0.8), Vector2(0, 8 if lifted else 3))
	if on_it or lifted: UITheme.fill_v(self, pts, Color(UITheme.WHITE, a), Color(UITheme.PAPER, a))
	else: UITheme.fill_v(self, pts, Color(Color("2a3450"), a), Color(Color("1e2740"), a))
	UITheme.accent_bar(self, r, Color(EnergyIcon.color(kind), a), a, UITheme.SKEW * 0.5, 7.0)
	if lifted: UITheme.outline(self, pts, Color(UITheme.YELLOW, a), 3.0)
	if _flash.has("card:%d" % i): UITheme.fill(self, pts, Color(UITheme.YELLOW, 0.5 * maxf(0.0, 1.0 - float(_flash["card:%d" % i]) / 0.3) * a))
	var fg := UITheme.INK if on_it or lifted else UITheme.TEXT
	var cy := r.get_center().y
	# its place in the order
	var nc := Vector2(r.position.x + 30.0, cy)
	draw_circle(nc, 14.0, Color(UITheme.YELLOW if not free else UITheme.ORANGE, a), true, -1.0, true)
	UITheme.text_mid(self, nc + Vector2(0, -1), str(slot + 1), "number", 17, Color(UITheme.INK, a), 1)
	EnergyIcon.draw_icon(self, kind, Vector2(r.position.x + 64.0, cy), 13.0, a)
	var nw := UITheme.text_mid(self, Vector2(r.position.x + 86.0, cy - 6.0), String(m.get("name", id)).to_upper(), "heading", 21, Color(fg, a))
	var sub := "STRIKES (FREE)" if free else ""
	if not free:
		var ks: Array = q.get("kinds", [])
		var x := r.position.x + 88.0
		for kd in ks:
			EnergyIcon.draw_icon(self, String(kd), Vector2(x + 6.0, cy + 14.0), 7.0, a)
			x += 17.0
		if ks.is_empty(): sub = "NO CHIPS"
	if sub != "": UITheme.text_mid(self, Vector2(r.position.x + 88.0, cy + 14.0), sub, "label", 11, Color(fg, a * 0.7))
	if lifted:
		UITheme.chevron_up(self, Vector2(r.end.x - 90.0, cy - 9.0), 14.0, Color(UITheme.INK, a * 0.8))
		UITheme.chevron_down(self, Vector2(r.end.x - 90.0, cy + 10.0), 14.0, Color(UITheme.INK, a * 0.8))
	# remove
	if not free:
		var xr := x_rect(i)
		xr.position.y = r.position.y + 6.0
		xr.position.x = r.end.x - 52.0
		var xc := xr.get_center()
		draw_circle(xc, 15.0, Color(UITheme.RED if on_it else Color(1, 1, 1, 0.12), a), true, -1.0, true)
		var xs := 5.5
		var xcol := Color(UITheme.WHITE, a)
		draw_line(xc + Vector2(-xs, -xs), xc + Vector2(xs, xs), xcol, 2.5, true)
		draw_line(xc + Vector2(xs, -xs), xc + Vector2(-xs, xs), xcol, 2.5, true)
		if on_it and UIInput.device == "pad" and not lifted: UITheme.glyph(self, Vector2(xc.x - 34.0, cy), "jump", 22.0, a)
	else:
		_lock(Vector2(r.end.x - 30.0, cy), 9.0, Color(UITheme.ORANGE, a))
	if nw > 0.0 and on_it and not lifted and not free and UIInput.device != "touch":
		UITheme.text_mid(self, Vector2(r.end.x - 70.0 - (34.0 if UIInput.device == "pad" else 0.0), cy), "A: MOVE" if UIInput.device == "pad" else "E: MOVE", "label", 11, Color(UITheme.INK_SOFT, a), 2)

func _lock(c: Vector2, r: float, cl: Color) -> void:
	draw_arc(c + Vector2(0, -r * 0.2), r * 0.52, PI, TAU, 10, cl, 2.0, true)
	draw_line(c + Vector2(-r * 0.52, -r * 0.2), c + Vector2(-r * 0.52, r * 0.15), cl, 2.0, true)
	draw_line(c + Vector2(r * 0.52, -r * 0.2), c + Vector2(r * 0.52, r * 0.15), cl, 2.0, true)
	draw_colored_polygon(UITheme.rounded_points(Rect2(c + Vector2(-r * 0.8, 0.05 * r), Vector2(r * 1.6, r * 1.1)), r * 0.22, 3), cl)

func _buttons(a: float) -> void:
	for i in 2:
		var r := btn_rect(i)
		var on_it := col == 2 and bsel == i
		var fl := float(_flash.get("btn:%d" % i, 9.0))
		if fl < 0.25: r = r.grow(4.0 * (1.0 - fl / 0.25))
		var pts := UITheme.para_points(r)
		UITheme.shadow(self, pts, a, Vector2(0, 5))
		var cy := r.get_center().y
		if i == 1:
			var c0 := UITheme.RED.lightened(0.12 if on_it else 0.0)
			UITheme.fill_v(self, pts, Color(c0, a), Color(UITheme.RED_DEEP, a))
			if on_it: UITheme.outline(self, pts, Color(UITheme.WHITE, a), 3.0)
			var lbl := confirm_label
			var gx := r.position.x + 34.0
			if UIInput.device != "touch": gx += UITheme.glyph(self, Vector2(gx, cy), "menu" if not on_it else "use", 28.0, a) * 0.5 + 12.0
			else: gx -= 8.0
			UITheme.text_mid(self, Vector2(gx, cy - (7.0 if _q().is_empty() else 0.0)), lbl, "display", 28, Color(UITheme.WHITE, a))
			if _q().is_empty(): UITheme.text_mid(self, Vector2(gx + 1.0, cy + 17.0), "PASS: NO MOVES", "label", 11, Color(1, 1, 1, 0.8 * a))
			UITheme.chevrons(self, Vector2(r.end.x - 40.0, cy), 18.0, Color(UITheme.WHITE, a * (0.7 + 0.3 * sin(t * 5.0))), 2)
		else:
			if on_it: UITheme.fill_v(self, pts, Color(UITheme.WHITE, a), Color(UITheme.PAPER, a))
			else: UITheme.fill_v(self, pts, Color(UITheme.PLATE_HI, a), Color(UITheme.PLATE, a))
			var gx2 := r.position.x + 26.0
			if UIInput.device != "touch": gx2 += UITheme.glyph(self, Vector2(gx2, cy), "back", 26.0, a) * 0.5 + 10.0
			UITheme.text_mid(self, Vector2(gx2, cy), "BACK", "display", 24, Color(UITheme.INK if on_it else UITheme.TEXT, a))

func _hints(a: float) -> void:
	var W := win_rect()
	var y := W.end.y - 20.0
	var x := W.position.x + 34.0
	var dev := UIInput.device
	var items: Array
	if dev == "touch": items = [["", "TAP A MOVE: ADD"], ["", "DRAG A CARD: REORDER"], ["", "X: REMOVE"]]
	else: items = [["use", "ADD" if col == 0 else ("PUT DOWN" if held >= 0 else ("PICK UP" if col == 1 else "PRESS"))], ["jump", "REMOVE"], ["menu", "CONFIRM"], ["back", "BACK" if held < 0 else "PUT BACK"]]
	for it in items:
		if String(it[0]) != "": x += UITheme.glyph(self, Vector2(x + 10.0, y), String(it[0]), 22.0, a) + 8.0
		x += UITheme.text_mid(self, Vector2(x, y), String(it[1]), "label", 13, Color(UITheme.TEXT_DIM, a)) + 26.0
