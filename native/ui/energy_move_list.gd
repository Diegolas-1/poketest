class_name EnergyMoveList
extends Control
# A Pokémon's moves for the energy system (battle/energy.gd): one skewed row
# per move with its type disc, its name, its role (a small tag: REACTION,
# 2 TURNS, DISRUPT...), a line of what it does, and its cost as energy icons on
# the right. No four-move cap: the list scrolls with the selection when there
# are more rows than fit; every known move is listed (never forgotten), the
# ones in its slots first. States:
#   ready    it can pay now
#   short    in a slot, but not enough chips this turn: dimmed, the chips it
#            lacks ringed red
#   locked   known but not in a slot (the slots are full, or the move is too
#            big): a lock, and the level the next slot opens
# The selected row turns white with a slide; a bar bound with bar_preview
# lights the chips it would use. Touch: tap a row to select it (the preview),
# tap it again to use it. Pad / keys: up / down, A (E / Enter), 1-9; B / Esc
# ends the turn (when show_end). Mouse: hover selects, click uses.
#
#   var ml := EnergyMoveList.new(); ml.size = Vector2(440, 360)
#   ml.bind(energy, energy.known); ml.bar_preview = bar
#   ml.picked.connect(func(id): ...)      # a ready move chosen
#   ml.hovered.connect(func(id): ...)     # the selection moved
#   ml.end_turn.connect(func(): ...)      # the END TURN row (show_end)

signal picked(id: String)
signal hovered(id: String)
signal end_turn()

const ROW_H := 60.0
const GAP := 7.0
const END_ID := "_end"

var energy: BattleEnergy
var ids: Array = []
var selected := 0
var input_enabled := true
var show_end := true
var bar_preview: EnergyBar
var _anim := {}
var _appear := 0.0
var _flash := -1
var _flash_t := 0.0
var _shake := -1
var _shake_t := 0.0
var _scroll := 0.0
var _tap_frame := -1
var _hold := false               # after a pick, the bar shows the spend, not a preview, until the selection moves
var t := 0.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if UIInput.I: UIInput.I.device_changed.connect(func(_d): queue_redraw())

func bind(e: BattleEnergy, moves = null) -> void:
	if energy and energy.changed.is_connected(_on_changed): energy.changed.disconnect(_on_changed)
	energy = e
	ids = (moves if moves is Array else (e.known if e else [])).duplicate()
	# the moves in its slots first, then the locked ones (same order otherwise)
	if e:
		var on := ids.filter(func(id): return not e.locked(id))
		var off := ids.filter(func(id): return e.locked(id))
		ids = on + off
	if e: e.changed.connect(_on_changed)
	selected = clampi(selected, 0, maxi(0, count() - 1))
	_appear = 0.0
	_anim.clear()
	_preview()
	queue_redraw()

func _on_changed() -> void:
	if not _hold: _preview()
	queue_redraw()

func count() -> int: return ids.size() + (1 if show_end else 0)

func id_at(i: int) -> String:
	if i < ids.size(): return String(ids[i])
	return END_ID

# ready | short | locked (END TURN is always ready)
func state_of(id: String) -> String:
	if id == END_ID: return "ready"
	if energy == null: return "short"
	if energy.locked(id): return "locked"
	return "ready" if energy.can_pay(id) else "short"

func move(d: int) -> void:
	if count() == 0: return
	var s := clampi(selected + d, 0, count() - 1)
	if s != selected:
		selected = s
		Sfx.ui("ui_cursor")
		hovered.emit(id_at(selected))
		_preview()

func select(i: int) -> void:
	i = clampi(i, 0, count() - 1)
	if i == selected: return
	selected = i
	hovered.emit(id_at(i))
	_preview()

func _preview() -> void:
	_hold = false
	if bar_preview == null or not is_instance_valid(bar_preview): return
	var id := id_at(selected)
	if id == END_ID or count() == 0 or not is_visible_in_tree(): bar_preview.clear_preview()
	else: bar_preview.preview_cost(BattleEnergy.cost_of(id))

func pick(i: int) -> void:
	if i < 0 or i >= count(): return
	selected = i
	var id := id_at(i)
	if id == END_ID:
		_flash = i; _flash_t = 0.0
		Sfx.ui("ui_confirm")
		end_turn.emit()
		return
	if state_of(id) != "ready":
		_shake = i; _shake_t = 0.0
		Sfx.ui("ui_error")
		return
	_flash = i; _flash_t = 0.0
	Sfx.ui("ui_confirm")
	if bar_preview and is_instance_valid(bar_preview): bar_preview.clear_preview()
	_hold = true
	picked.emit(id)

func pick_id(id: String) -> void:
	var i := ids.find(id)
	if i >= 0: pick(i)

func row_rect(i: int) -> Rect2:
	return Rect2(0.0, i * (ROW_H + GAP) - _scroll, size.x, ROW_H)

func handle(e: InputEvent) -> bool:
	if count() == 0 or not is_visible_in_tree(): return false
	if e.is_action_pressed("ui_up") or e.is_action_pressed("move_up"): move(-1); return true
	if e.is_action_pressed("ui_down") or e.is_action_pressed("move_down"): move(1); return true
	if e.is_action_pressed("use") or e.is_action_pressed("ui_accept"): pick(selected); return true
	if show_end and (e.is_action_pressed("back") or e.is_action_pressed("ui_cancel")): pick(count() - 1); return true
	if e is InputEventKey and e.pressed and not e.echo and e.keycode >= KEY_1 and e.keycode <= KEY_9:
		var n: int = e.keycode - KEY_1
		if n < ids.size(): pick(n); return true
	var pos := Vector2.INF
	var touch := false
	if e is InputEventScreenTouch and e.pressed: pos = e.position; touch = true
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	elif e is InputEventMouseMotion:
		var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * e.position
		for i in count():
			if row_rect(i).has_point(lp) and i != selected: select(i)
		return false
	if pos != Vector2.INF:
		if Engine.get_process_frames() == _tap_frame: return true
		_tap_frame = Engine.get_process_frames()
		var lp2: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
		for i in count():
			if row_rect(i).grow_individual(0, GAP * 0.5, 0, GAP * 0.5).has_point(lp2):
				# touch: the first tap selects (and previews), the second uses it
				if (touch or UIInput.device == "touch") and i != selected and id_at(i) != END_ID:
					select(i); Sfx.ui("ui_cursor")
				else: pick(i)
				return true
	return false

func _unhandled_input(e: InputEvent) -> void:
	if input_enabled and handle(e): get_viewport().set_input_as_handled()

func _process(dt: float) -> void:
	t += dt
	_appear = minf(1.0, _appear + dt / UITheme.SLOW)
	for i in count():
		var want := 1.0 if i == selected else 0.0
		_anim[i] = move_toward(float(_anim.get(i, 0.0)), want, dt / UITheme.FAST)
	if _flash >= 0:
		_flash_t += dt
		if _flash_t > 0.3: _flash = -1
	if _shake >= 0:
		_shake_t += dt
		if _shake_t > 0.35: _shake = -1
	# keep the selection in view
	var want_s := clampf(selected * (ROW_H + GAP) + ROW_H * 0.5 - size.y * 0.5, 0.0, maxf(0.0, count() * (ROW_H + GAP) - GAP - size.y))
	_scroll = lerpf(_scroll, want_s, 1.0 - exp(-dt * 14.0))
	queue_redraw()

func _draw() -> void:
	var clip := Rect2(Vector2(-40, -6), size + Vector2(80, 12))
	for i in count():
		var r := row_rect(i)
		if r.end.y < clip.position.y or r.position.y > clip.end.y: continue
		var ap := UITheme.ease_out(clampf(_appear * 1.8 - i * 0.12, 0.0, 1.0))
		if ap <= 0.0: continue
		var id := id_at(i)
		var st := state_of(id)
		var k: float = _anim.get(i, 0.0)
		# fade rows at the scrolled edges
		var edge := clampf(minf(r.end.y + 6.0, size.y + 6.0 - r.position.y) / 28.0, 0.0, 1.0)
		var a := ap * edge
		r.position.x += (1.0 - ap) * 50.0 - k * 12.0
		if _shake == i: r.position.x += sin(_shake_t * 60.0) * 7.0 * (1.0 - _shake_t / 0.35)
		_row(r, id, st, k, a, i)

func _row(r: Rect2, id: String, st: String, k: float, a: float, i: int) -> void:
	var m := BattleEnergy.move(id) if id != END_ID else {}
	var kind := BattleEnergy.energy_of(String(m.get("type", "normal"))) if id != END_ID else ""
	var tc := EnergyIcon.color(kind) if id != END_ID else UITheme.RED
	var ra := a * (1.0 if st == "ready" else (0.62 if st == "short" else 0.5))
	var pts := UITheme.para_points(r, UITheme.SKEW)
	if k > 0.01:
		UITheme.shadow(self, pts, a * k, Vector2(0, 4))
		var top := Color(UITheme.PLATE, UITheme.PLATE.a * a * (1.0 - k)).lerp(Color(UITheme.WHITE, a), k)
		var bot := Color(UITheme.PLATE, UITheme.PLATE.a * a * (1.0 - k)).lerp(Color(UITheme.PAPER, a), k)
		UITheme.fill_v(self, pts, top, bot)
	else:
		UITheme.plate(self, r, a)
	UITheme.accent_bar(self, r, tc, a, UITheme.SKEW, 7.0 + 3.0 * k)
	if _flash == i: UITheme.para(self, r, Color(UITheme.YELLOW, 0.55 * (1.0 - _flash_t / 0.3)))
	var fg := Color(UITheme.TEXT, ra).lerp(Color(UITheme.INK, ra), k)
	var sub := Color(UITheme.TEXT_DIM, ra * 0.9).lerp(Color(UITheme.INK_SOFT, ra), k)
	var cy := r.get_center().y
	if id == END_ID:
		UITheme.text_mid(self, Vector2(r.position.x + 30.0, cy), "END TURN", "display", 26, fg)
		var gx := r.end.x - 40.0
		if UIInput.device != "touch": UITheme.glyph(self, Vector2(gx, cy), "back", 28.0, a)
		else: UITheme.chevrons(self, Vector2(gx - 8.0, cy), 18.0, Color(UITheme.RED, a), 2)
		return
	# the type disc
	EnergyIcon.draw_icon(self, kind, Vector2(r.position.x + 34.0, cy), 15.0, ra)
	# the name and what it does
	var nx := r.position.x + 60.0
	var nw := UITheme.text(self, Vector2(nx, cy + 2.0), String(m.get("name", id)).to_upper(), "display", 25, fg)
	var rt: String = ROLE_TAG.get(String(m.get("role", "offense")), "")
	if rt != "":
		var rc: Color = ROLE_COL.get(String(m.get("role", "")), UITheme.SKY)
		UITheme.chip(self, Vector2(nx + nw + 8.0, cy - 17.0), rt, Color(rc, ra), UITheme.INK, 11, 17.0, 1.0)
	var line := _subline(m, st)
	UITheme.text(self, Vector2(nx + 1.0, cy + 21.0), line, "label", 13, sub if st != "locked" else Color(UITheme.ORANGE, ra))
	# the cost: icons from the right
	var cost := BattleEnergy.cost_of(id)
	var miss: Array = energy.missing(cost) if energy and st == "short" else []
	var cr := 12.0
	var step := 27.0
	var gw := 40.0 if (UIInput.device == "pad" and k > 0.5) else 10.0
	var x := r.end.x - gw - cr - 4.0
	# as on the cards: the typed costs first, then Colorless
	var shown := cost.filter(func(c): return c != BattleEnergy.COLORLESS) + cost.filter(func(c): return c == BattleEnergy.COLORLESS)
	var mm := miss.duplicate()
	for j in range(shown.size() - 1, -1, -1):
		var c := Vector2(x - (shown.size() - 1 - j) * step, cy - 2.0)
		var kd: String = shown[j]
		var lacking := mm.has(kd)
		if lacking: mm.erase(kd)
		EnergyIcon.draw_icon(self, kd, c, cr, a * (0.45 if lacking or st == "locked" else 1.0), {"dim": 0.5 if lacking or st == "locked" else 0.0})
		if lacking: draw_arc(c, cr + 2.5, 0.0, TAU, 24, Color(UITheme.RED, a * (0.7 + 0.3 * sin(t * 7.0))), 2.2, true)
	if st == "locked":
		var lx := x - (shown.size() - 1) * step - cr - 22.0
		_lock(Vector2(lx, cy - 2.0), 9.0, Color(UITheme.ORANGE, a))
	if UIInput.device == "pad" and k > 0.5:
		UITheme.glyph(self, Vector2(r.end.x - 24.0, cy), "use", 26.0, a * (1.0 if st == "ready" else 0.4))
	elif UIInput.device == "keys" and i < 9:
		UITheme.text_mid(self, Vector2(r.position.x + 48.0, r.position.y + 12.0), str(i + 1), "label", 12, Color(fg, ra * 0.6), 1)

const ROLE_TAG := {"reaction": "REACTION", "two_phase": "2 TURNS", "disruption": "DISRUPT", "utility": "UTILITY"}
const ROLE_COL := {"reaction": Color("9d6cf0"), "two_phase": Color("ff9a1f"), "disruption": Color("ee3b33"), "utility": Color("3fb6f5")}

func _subline(m: Dictionary, st: String) -> String:
	if st == "locked":
		if energy == null: return "LOCKED"
		var nl := BattleEnergy.next_slot_level(energy.level, energy.species)
		var used := "SLOTS FULL %d/%d" % [energy.equipped.size(), energy.slots]
		return "LOCKED  ·  %s  ·  NEXT SLOT LV %d" % [used, nl] if nl > 0 else "LOCKED  ·  %s" % used
	var bits := []
	if String(m.get("role", "")) == "reaction":
		var r: Dictionary = m.get("reaction", {})
		var trig := {"any": "ANY MOVE", "attack": "ANY ATTACK", "physical": "PHYSICAL ONLY", "special": "SPECIAL ONLY"}
		bits.append("LOCKS ITS CHIPS: %s" % trig.get(String(r.get("trigger", "any")), "ANY"))
	if String(m.get("role", "")) == "two_phase":
		bits.append("PAY NOW, STRIKE NEXT TURN")
	if int(m.get("power", 0)) > 0: bits.append("POW %d" % int(m.power))
	if int(m.get("priority", 0)) > 0: bits.append("FIRST")
	if int(m.get("accuracy", 100)) < 100 and int(m.get("accuracy", 100)) > 0: bits.append("ACC %d" % int(m.accuracy))
	if bits.is_empty() or int(m.get("power", 0)) <= 0:
		bits.append(String(m.get("desc", "")).trim_suffix(".").to_upper())
	return "  ·  ".join(bits)

func _lock(c: Vector2, r: float, col: Color) -> void:
	draw_arc(c + Vector2(0, -r * 0.2), r * 0.52, PI, TAU, 10, col, 2.0, true)
	draw_line(c + Vector2(-r * 0.52, -r * 0.2), c + Vector2(-r * 0.52, r * 0.15), col, 2.0, true)
	draw_line(c + Vector2(r * 0.52, -r * 0.2), c + Vector2(r * 0.52, r * 0.15), col, 2.0, true)
	draw_colored_polygon(UITheme.rounded_points(Rect2(c + Vector2(-r * 0.8, 0.05 * r), Vector2(r * 1.6, r * 1.1)), r * 0.22, 3), col)
