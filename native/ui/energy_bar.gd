class_name EnergyBar
extends Control
# A Pokemon's energy panel in battle (battle/energy.gd; design/energy_system.md):
# a dark skewed plate in the UI kit's style with two rows:
#   focus    a slim percentage bar with a tick at each chip threshold (so the bar
#            and the chip count agree at a glance); gold and pulsing when Locked In
#   pools    one tray per pool (its types', then Colorless), each with its chips:
#            ready (full colour), spent (dim, back next turn), locked (dim with a
#            small lock; face down on the opponent's panel: a trap is set, not
#            which). A committed two-phase move shows as a tag (UNDERGROUND...).
# It follows a BattleEnergy by its signals and animates by itself:
#   a new chip      charges up (a ring converging, sparks) and pops into its pool
#   spending        a copy of each chip flies along an arc to fly_target (the
#                   move's target on screen) and bursts there; the chip stays, dim
#   disruption      the focus bar shakes, the lost part flashes red, lost chips burst
#   a pool pick     the trays pulse with a "+" and the new chip waits above them:
#                   tap a tray (pool_at(point)) and call energy.pick_pool(kind)
#   preview         preview_cost(cost) lights the chips a move would use (they rise,
#                   a yellow ring pulses) and dims the rest; what's short shows as
#                   red ghosts in the pool it would need
#
#   var bar := EnergyBar.new(); layer.add_child(bar)
#   bar.bind(energy); bar.side = "foe" | "ally"; bar.title = "PIDGEY"
#   bar.owner_view = true             # false: its locks show face down (the opponent's panel)
#   bar.fit(rect)                     # its height sets the scale (H = 1); align_right for the foe's
#   bar.fly_target = screen_pos       # (viewport / canvas coordinates)
#   bar.preview_cost(cost); bar.clear_preview()
#   bar.show_bar(true)                # slides in (false: out)
#   bar.pool_at(global_point) -> kind ("" if none)

signal pool_tapped(kind: String)

const H := 66.0                  # the plate's height at scale 1
const SLOT_R := 11.5
const PITCH := 27.0
const LEFT := 18.0
const TRAY_PAD := 7.0
const TRAY_GAP := 10.0
const HEAD := 22.0               # the pool's glyph at the head of its tray
const CNT_W := 30.0              # the tray's count at its end ("2/3")
const FADE_T := 0.3
const CHARGE_T := 0.24
const POP_T := 0.22
const STAGGER := 0.13
const FLY_T := 0.46
const FOCUS_Y := 17.0
const POOLS_Y := 45.0
const TRAP := "_trap"            # the opponent's view: locked chips face down in a tray of their own (their pool hidden)
const TRAP_COL := Color("9d6cf0")

var energy: BattleEnergy
var side := "foe":
	set(v): side = v; queue_redraw()
var title := ""
var show_locked := 0             # (kept for callers; the pools have no locked sockets)
var owner_view := true
var fly_target := Vector2(-1, -1)   # canvas coordinates; (-1, -1): up and away
var align_right := false         # draw from the right edge of the rect (the foe's, under its plate)
var sounds := true
var scale_k := 1.0               # set from the rect's height by fit()
var input_enabled := true        # taps on the trays during a pool pick

var vis: Array = []              # the chips shown, in chip_list order: {kind, pool, state, lock, t, delay, st_t}
var flying: Array = []           # {kind, from, to, t, delay, spin}
var fading: Array = []           # {kind, at, t, red}
var bursts: Array = []           # {at, kind, t}
var hi: Array = []               # the previewed chips (indices into vis)
var ghosts: Array = []           # the kinds a previewed move lacks
var preview_on := false
var turn_no := 0
var t := 0.0
var k := 1.0                     # slid in (0..1)
var _k_to := 1.0
var _focus_shown := 0.0          # the focus bar's fill, eased
var _focus_hurt := 0.0           # the red part after a disruption, shrinking
var _shake := 0.0
var _turn_pop := 9.0
var _gain := {}                  # {n, t}: the "+n" that rises as new chips pop in
var _lock_pop := {}              # lock id -> t
var _li_t := 9.0                 # since Locked In changed

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if size == Vector2.ZERO: size = Vector2(width_for(5), H)

func bind(e: BattleEnergy) -> void:
	if energy and energy.turn_started.is_connected(_on_turn):
		energy.turn_started.disconnect(_on_turn)
		energy.spent.disconnect(_on_spent)
		energy.restored.disconnect(_on_restored)
		energy.changed.disconnect(_on_changed)
		energy.focus_changed.disconnect(_on_focus)
		energy.lock_set.disconnect(_on_lock)
		energy.locked_in_changed.disconnect(_on_locked_in)
	energy = e
	vis = []
	flying = []; fading = []; bursts = []
	if e == null: return
	e.turn_started.connect(_on_turn)
	e.spent.connect(_on_spent)
	e.restored.connect(_on_restored)
	e.changed.connect(_on_changed)
	e.focus_changed.connect(_on_focus)
	e.lock_set.connect(_on_lock)
	e.locked_in_changed.connect(_on_locked_in)
	turn_no = e.turn
	_focus_shown = e.focus
	for c in _shown_list(): vis.append(_v(c, 9.0))
	queue_redraw()

func _shown_list() -> Array:
	var L := energy.chip_list()
	if owner_view: return L
	var out := L.filter(func(c): return c.state != "locked")
	for c in L:
		if c.state == "locked":
			var x: Dictionary = c.duplicate()
			x.pool = TRAP
			out.append(x)
	return out

func _v(c: Dictionary, age: float, delay := 0.0) -> Dictionary:
	return {"kind": c.kind, "pool": c.pool, "state": c.state, "lock": c.lock, "t": age, "delay": delay, "st_t": 9.0, "snd": age > 1.0}

# (kept for callers) chips shown, at most
func slots_shown() -> int:
	if energy == null: return 5
	return energy.chip_cap()

static func width_for(n: int, s := 1.0) -> float:
	return (LEFT * 2.0 + 3 * (HEAD + TRAY_PAD * 2.0 + TRAY_GAP) + n * PITCH + 40.0) * s

# fits the bar to a rect (a HUD anchor): its height sets the scale
func fit(r: Rect2) -> void:
	position = r.position
	size = r.size
	scale_k = clampf(r.size.y / H, 0.5, 2.0) if r.size.y > 0.0 else 1.0
	queue_redraw()

func show_bar(on: bool, instant := false) -> void:
	_k_to = 1.0 if on else 0.0
	if instant: k = _k_to

# ---------- the engine's signals ----------
func _on_turn(turn: int, _lost: Array, gained: Array) -> void:
	turn_no = turn
	_turn_pop = 0.0
	hi = []; ghosts = []
	_resync(gained.size())
	if not gained.is_empty(): _gain = {"n": gained.size(), "t": -CHARGE_T}

# a chip_list index -> the index shown (the same unless the opponent's view moved locked chips)
func _shown_index(li: int) -> int:
	if owner_view or energy == null: return li
	var L := energy.chip_list()
	if li < 0 or li >= L.size(): return li
	var before := 0
	for i in li:
		if L[i].state == "locked": before += 1
	return li - before if L[li].state != "locked" else li

func _on_spent(indices: Array, kinds: Array, _move: String) -> void:
	var j := 0
	for i in indices.size():
		var at: int = _shown_index(int(indices[i]))
		var kd: String = kinds[i] if i < kinds.size() else "colorless"
		var from := _chip_c(at) if at >= 0 and at < vis.size() else _plate_rect().get_center()
		flying.append({"kind": kd, "from": from, "to": _target(), "t": 0.0, "delay": j * 0.07, "spin": 1.0 if j % 2 == 0 else -1.0})
		j += 1
	if sounds and j > 0: Sfx.play("whoosh", null, {"vol": -7.0, "pitch": 1.35})
	hi = []; ghosts = []
	preview_on = false

func _on_restored(_first: int, kinds: Array) -> void:
	_resync(kinds.size())
	_gain = {"n": kinds.size(), "t": -CHARGE_T}

func _on_changed() -> void:
	_resync(0)
	queue_redraw()

func _on_focus(old: float, new: float, reason: String) -> void:
	if new < old and reason in ["disrupt", "faint"]:
		_focus_hurt = maxf(_focus_hurt, old)
		_shake = 1.0
		if sounds: Sfx.play("ui_error", null, {"vol": -10.0, "pitch": 0.8})

func _on_lock(L: Dictionary) -> void:
	_lock_pop[int(L.id)] = 0.0
	if sounds: Sfx.play("ui_blip_high", null, {"vol": -10.0, "pitch": 0.7})

func _on_locked_in(_on: bool) -> void:
	_li_t = 0.0
	if _on and sounds: Sfx.play("sparkle", null, {"vol": -4.0, "pitch": 0.8})

# matches the shown chips to the engine's: by pool and place in the pool; new
# ones charge in (staggered), gone ones fade (red after a disruption), state changes ease
func _resync(_new_hint: int) -> void:
	if energy == null: return
	var L := _shown_list()
	var old := {}
	for v in vis:
		if not old.has(v.pool): old[v.pool] = []
		old[v.pool].append(v)
	var out := []
	var seen := {}
	var born := 0
	for c in L:
		var n := int(seen.get(c.pool, 0))
		seen[c.pool] = n + 1
		var prev: Array = old.get(c.pool, [])
		if n < prev.size():
			var v: Dictionary = prev[n]
			if v.state != c.state: v.st_t = 0.0
			v.state = c.state; v.kind = c.kind; v.lock = c.lock
			out.append(v)
		else:
			out.append(_v(c, 0.0, 0.05 + born * STAGGER))
			born += 1
	# gone: fade where they were
	for pool in old:
		var prev2: Array = old[pool]
		var keep := int(seen.get(pool, 0))
		for i in range(keep, prev2.size()):
			var idx := vis.find(prev2[i])
			fading.append({"kind": prev2[i].kind, "at": _chip_c(idx), "t": 0.0, "red": _focus_hurt > 0.0})
	vis = out

# ---------- the preview ----------
func preview_cost(cost) -> void:
	if energy == null: return
	preview_on = true
	var ready := energy.chips
	var m = BattleEnergy.match_cost(ready, cost)
	var used: Array
	if m != null:
		used = m
		ghosts = []
	else:
		var pm := BattleEnergy.partial_match(ready, cost)
		used = pm.used
		ghosts = pm.missing
	hi = []
	for i in used: hi.append(_shown_index(energy._list_index(int(i))))
	hi.sort()

func clear_preview() -> void:
	preview_on = false
	hi = []; ghosts = []

# ---------- geometry ----------
# the scale: from the rect's height, and smaller when the fixed-width trays (a
# socket per chip each pool holds) wouldn't fit the rect's width
func _s() -> float:
	if size.x <= 0.0 or energy == null: return scale_k
	return minf(scale_k, size.x / maxf(_content_w(), 1.0))

func _pools() -> Array:
	if energy == null: return ["colorless"]
	var p := energy.pool_kinds()
	if int(energy.bonus.ready) + int(energy.bonus.spent) > 0 or (owner_view and energy.locks.any(func(l): return BattleEnergy.ANY in l.kinds)): p.append(BattleEnergy.ANY)
	if not owner_view and not energy.locks.is_empty(): p.append(TRAP)
	return p

func _pool_n(pool: String) -> int:
	return vis.filter(func(v): return v.pool == pool).size()

# each tray: {pool, x0, x1} in plate-local units (scale 1), from the plate's left
func _trays() -> Array:
	var out := []
	var x := LEFT
	for pool in _pools():
		var n := _pool_n(pool)
		var g := ghosts.count(pool) if preview_on else 0
		if picking() and pool != TRAP and pool != BattleEnergy.ANY and energy.pool_room(pool) > 0 and n > 0: g += 1
		if pool == "colorless" and preview_on:
			for gk in ghosts:
				if not gk in _pools(): g += 1
		# a fixed width: a socket for every chip the pool can hold (the opponent's
		# face-down trap tray: one per trap)
		var cap := _cap_of(pool)
		var slots := maxi(maxi(1, cap), n + g)
		var w := TRAY_PAD * 2.0 + HEAD + slots * PITCH + (CNT_W if pool != TRAP else 0.0)
		out.append({"pool": pool, "x0": x, "x1": x + w, "n": n, "slots": slots, "cap": cap})
		x += w + TRAY_GAP
	return out

func _cap_of(pool: String) -> int:
	if pool == TRAP or pool == BattleEnergy.ANY or energy == null: return 0
	return energy.pool_cap(pool)

func _content_w() -> float:
	var tr := _trays()
	var w: float = (float(tr.back().x1) if not tr.is_empty() else 100.0) + LEFT
	if energy and not energy.commit.is_empty(): w += UITheme.text_w(_commit_text(), "label", 13) + 30.0
	return maxf(w, 300.0)

func _commit_text() -> String:
	var names := {"underground": "UNDERGROUND", "airborne": "IN THE AIR", "underwater": "UNDERWATER", "charging": "CHARGING"}
	var mv := String(BattleEnergy.move(String(energy.commit.move)).get("name", energy.commit.move)).to_upper()
	return "%s: %s" % [mv, names.get(String(energy.commit.get("semi", "")), "COMMITTED")]

func _plate_w() -> float:
	return _content_w() * _s()

func _origin() -> Vector2:
	var w := _plate_w()
	var x := size.x - w if align_right and size.x > w else 0.0
	return Vector2(x, 0.0)

func _plate_rect() -> Rect2:
	var dir := 1.0 if side == "ally" else -1.0
	var o := _origin() + Vector2((1.0 - UITheme.ease_out_expo(k)) * 70.0 * -dir, 0.0)
	return Rect2(o, Vector2(_plate_w(), H * _s()))

func _tray(pool: String) -> Dictionary:
	for tr in _trays():
		if tr.pool == pool: return tr
	return {}

# the centre of the i-th shown chip
func _chip_c(i: int) -> Vector2:
	var r := _plate_rect()
	var s := _s()
	if i < 0 or i >= vis.size(): return r.get_center()
	var pool: String = vis[i].pool
	var nth := 0
	for j in i:
		if vis[j].pool == pool: nth += 1
	var tr := _tray(pool)
	if tr.is_empty(): return r.get_center()
	return r.position + Vector2((float(tr.x0) + TRAY_PAD + HEAD + PITCH * 0.5 + nth * PITCH) * s, POOLS_Y * s)

func _slot_in(pool: String, nth: int) -> Vector2:
	var r := _plate_rect()
	var s := _s()
	var tr := _tray(pool)
	if tr.is_empty(): tr = _trays().back()
	return r.position + Vector2((float(tr.x0) + TRAY_PAD + HEAD + PITCH * 0.5 + nth * PITCH) * s, POOLS_Y * s)

func _tray_rect(tr: Dictionary) -> Rect2:
	var r := _plate_rect()
	var s := _s()
	return Rect2(r.position + Vector2(float(tr.x0) * s, (POOLS_Y - 15.0) * s), Vector2((float(tr.x1) - float(tr.x0)) * s, 30.0 * s))

# the pool under a point (global canvas coordinates), "" if none
func pool_at(p: Vector2) -> String:
	var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * p
	for tr in _trays():
		if tr.pool == BattleEnergy.ANY: continue
		if _tray_rect(tr).grow(6.0 * _s()).has_point(lp): return tr.pool
	return ""

func pool_rect(pool: String) -> Rect2:
	var tr := _tray(pool)
	if tr.is_empty(): return Rect2()
	var lr := _tray_rect(tr)
	return Rect2(get_global_transform_with_canvas() * lr.position, lr.size)

func _target() -> Vector2:
	if fly_target.x < 0.0: return _plate_rect().get_center() + Vector2(60, -220) * _s()
	return get_global_transform_with_canvas().affine_inverse() * fly_target

func _accent() -> Color:
	return UITheme.SKY if side == "ally" else UITheme.YELLOW

func picking() -> bool:
	return energy != null and energy.needs_pick()

# ---------- input (the pool pick) ----------
func _unhandled_input(e: InputEvent) -> void:
	if not input_enabled or not picking() or not is_visible_in_tree(): return
	var pos := Vector2.INF
	if e is InputEventScreenTouch and e.pressed: pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	if pos == Vector2.INF: return
	var kd := pool_at(pos)
	if kd != "":
		pool_tapped.emit(kd)
		get_viewport().set_input_as_handled()

# ---------- animation ----------
func _process(dt: float) -> void:
	t += dt
	_turn_pop += dt
	_li_t += dt
	k = move_toward(k, _k_to, dt / UITheme.BASE)
	if energy:
		_focus_shown = lerpf(_focus_shown, energy.focus, 1.0 - exp(-dt * 9.0))
		if _focus_hurt > 0.0:
			_focus_hurt = move_toward(_focus_hurt, energy.focus, dt * 30.0)
			if _focus_hurt <= energy.focus + 0.05: _focus_hurt = 0.0
	_shake = maxf(0.0, _shake - dt * 2.5)
	if not _gain.is_empty():
		_gain.t += dt
		if _gain.t > 1.1: _gain = {}
	for i in vis.size():
		var v: Dictionary = vis[i]
		v.t += dt
		v.st_t += dt
		var lt: float = v.t - v.delay
		if sounds and lt >= 0.0 and not v.snd:
			v.snd = true
			Sfx.play("ui_blip_high", null, {"vol": -12.0, "pitch": 0.9 + i * 0.07})
			v.snd2 = false
		if sounds and lt >= CHARGE_T and v.has("snd2") and not v.snd2:
			v.snd2 = true
			Sfx.play("sparkle", null, {"vol": -5.0, "pitch": 1.0 + i * 0.08})
	for f in fading: f.t += dt
	fading = fading.filter(func(f): return f.t < FADE_T)
	for f in flying:
		f.t += dt
		if f.t - f.delay >= FLY_T and not f.get("done", false):
			f.done = true
			bursts.append({"at": f.to, "kind": f.kind, "t": 0.0})
	flying = flying.filter(func(f): return not f.get("done", false))
	for b in bursts: b.t += dt
	bursts = bursts.filter(func(b): return b.t < 0.35)
	for id in _lock_pop.keys():
		_lock_pop[id] += dt
		if _lock_pop[id] > 1.0: _lock_pop.erase(id)
	if energy and vis.size() != energy.chip_list().size(): _resync(0)
	queue_redraw()

# a rounded rect's points, safe for thin rects (the radius never exceeds half a side)
static func _rr(r: Rect2, rad: float, steps := 3) -> PackedVector2Array:
	var m := minf(r.size.x, r.size.y) * 0.5 - 0.6
	if m <= 0.5: return PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
	return UITheme.rounded_points(r, minf(rad, m), steps)

# ---------- drawing ----------
func _draw() -> void:
	if k <= 0.001 or energy == null: return
	var s := _s()
	var a := clampf(k * 1.4, 0.0, 1.0)
	var r := _plate_rect()
	r.position.x += sin(t * 70.0) * 5.0 * s * _shake
	var pts := UITheme.plate(self, r, a, UITheme.SKEW, UITheme.PLATE, UITheme.CUT * s)
	UITheme.outline(self, pts, Color(1, 1, 1, 0.1 * a), 1.0)
	var acc := _accent()
	UITheme.para(self, Rect2(r.position + Vector2(16 * s, -5 * s), Vector2(86 * s, 5 * s)), Color(acc, a))
	# tags above the plate: the turn, Locked In, the pick
	var tx := r.end.x - 8 * s
	if turn_no > 0 and not picking():
		var pk := 1.0 + 0.3 * maxf(0.0, 1.0 - _turn_pop / 0.25)
		var tag := "TURN %d" % turn_no
		tx -= (UITheme.text_w(tag, "label", int(13 * s)) + 30.0) * s
		UITheme.chip(self, Vector2(tx, r.position.y - 12 * s * pk), tag, acc, UITheme.INK, int(13 * s * pk), 21.0 * s * pk, a)
	if energy.locked_in:
		var lp := 1.0 + 0.35 * maxf(0.0, 1.0 - _li_t / 0.3)
		var lt := "LOCKED IN"
		var lw := (UITheme.text_w(lt, "label", int(13 * s)) + 30.0) * s
		tx -= lw + 6 * s
		UITheme.glow(self, Vector2(tx + lw * 0.5, r.position.y - 2 * s), 26 * s, UITheme.YELLOW, a * (0.5 + 0.3 * sin(t * 5.0)))
		UITheme.chip(self, Vector2(tx, r.position.y - 12 * s * lp), lt, UITheme.YELLOW, UITheme.INK, int(13 * s * lp), 21.0 * s * lp, a)
	if not energy.locks.is_empty():
		var lt2 := "TRAP SET" if not owner_view else "%s SET" % String(BattleEnergy.move(String(energy.locks[0].move)).get("name", "")).to_upper()
		var lw2 := (UITheme.text_w(lt2, "label", int(13 * s)) + 30.0) * s
		tx -= lw2 + 6 * s
		UITheme.chip(self, Vector2(tx, r.position.y - 12 * s), lt2, TRAP_COL, UITheme.WHITE, int(13 * s), 21.0 * s, a * (0.85 + 0.15 * sin(t * 4.0)))
	if picking():
		var pw := UITheme.chip(self, Vector2(r.position.x + 14 * s, r.position.y - 14 * s), "NEW CHIP: TAP A POOL", UITheme.YELLOW, UITheme.INK, int(14 * s), 24.0 * s, a * (0.8 + 0.2 * sin(t * 6.0)))
		# the chips waiting, floating by the tag
		for i in energy.pending:
			var c := Vector2(r.position.x + 14 * s + pw + (18 + i * 26) * s, r.position.y - 2 * s + sin(t * 4.0 + i) * 2.0 * s)
			UITheme.glow(self, c, SLOT_R * s * 1.5, UITheme.YELLOW, a * 0.8)
			draw_circle(c, SLOT_R * 0.95 * s, Color(UITheme.WHITE, a), true, -1.0, true)
			draw_arc(c, SLOT_R * 0.95 * s, 0.0, TAU, 24, Color(UITheme.YELLOW, a), 2.0 * s, true)
			UITheme.text_mid(self, c + Vector2(0, 1), "+", "display", int(18 * s), Color(UITheme.INK, a), 1)
	_draw_focus(r, s, a)
	_draw_pools(r, s, a)
	_draw_commit(r, s, a)
	# chips fading (lost to a disruption, or gone)
	for f in fading:
		var fk: float = f.t / FADE_T
		var R := SLOT_R * s
		EnergyIcon.draw_icon(self, f.kind, f.at, R * (1.0 + 0.4 * fk), a * (1.0 - fk), {"dim": 0.3})
		if f.red: draw_circle(f.at, R * (1.0 + 1.2 * fk), Color(UITheme.RED, 0.7 * (1.0 - fk) * a), false, 3.0 * s, true)
	for f in flying: _fly(f, SLOT_R * s, a)
	for b in bursts:
		var bk: float = b.t / 0.35
		var bc := EnergyIcon.color(b.kind)
		var R2 := SLOT_R * s
		draw_circle(b.at, R2 * (0.6 + 1.6 * bk), Color(bc.lightened(0.4), 0.55 * (1.0 - bk) * a), false, 3.0 * s * (1.0 - bk) + 1.0, true)
		draw_circle(b.at, R2 * 0.7 * (1.0 - bk), Color(1, 1, 1, 0.8 * (1.0 - bk) * a), true, -1.0, true)

func _draw_focus(r: Rect2, s: float, a: float) -> void:
	var fm := energy.fmax()
	var y := r.position.y + FOCUS_Y * s
	var x0 := r.position.x + LEFT * s + 52 * s
	var x1 := r.end.x - 62 * s
	var bh := 6.0 * s
	var li := energy.locked_in
	var lab := Color(UITheme.YELLOW, a) if li else Color(UITheme.TEXT_DIM, a)
	UITheme.text_mid(self, Vector2(r.position.x + LEFT * s + 2 * s, y), "FOCUS", "label", int(12 * s), lab)
	var bar := Rect2(Vector2(x0, y - bh * 0.5), Vector2(x1 - x0, bh))
	draw_colored_polygon(_rr(bar.grow(1.5 * s), 4.0 * s), Color(0, 0, 0, 0.45 * a))
	draw_colored_polygon(_rr(bar, 3.0 * s), Color(1, 1, 1, 0.1 * a))
	var fk := clampf(_focus_shown / fm, 0.0, 1.0)
	# the red part a disruption took
	if _focus_hurt > 0.0:
		var hk := clampf(_focus_hurt / fm, 0.0, 1.0)
		if (hk - fk) * bar.size.x > 2.0 * s: draw_colored_polygon(_rr(Rect2(bar.position + Vector2(bar.size.x * fk, 0), Vector2(bar.size.x * (hk - fk), bh)), 2.0 * s), Color(UITheme.RED, 0.85 * a))
	if fk > 0.003:
		var fr := Rect2(bar.position, Vector2(maxf(bh, bar.size.x * fk), bh))
		var c0 := Color("dfe8f5") if not li else UITheme.YELLOW
		var c1 := Color("ffffff") if not li else Color("fff3b0")
		var fp := _rr(fr, 3.0 * s)
		UITheme.fill_v(self, fp, Color(c1, a), Color(c0, a))
		if li:
			var sweep := fmod(t * 0.7, 1.4) - 0.2
			UITheme.glow(self, Vector2(fr.position.x + fr.size.x * clampf(sweep, 0, 1), y), 14 * s, Color.WHITE, a * 0.7)
			UITheme.glow(self, Vector2(fr.end.x, y), 12 * s, UITheme.YELLOW, a * (0.6 + 0.3 * sin(t * 6.0)))
	# a tick at each chip threshold: lit once reached
	for th in energy.thresholds():
		var tk := float(th) / fm
		var px := bar.position.x + bar.size.x * tk
		var on: bool = energy.focus >= float(th) - 0.001
		draw_line(Vector2(px, y - bh * 0.5 - 3 * s), Vector2(px, y + bh * 0.5 + 3 * s), Color(0, 0, 0, 0.7 * a), 2.6 * s, true)
		draw_line(Vector2(px, y - bh * 0.5 - 2 * s), Vector2(px, y + bh * 0.5 + 2 * s), Color(1, 1, 1, (0.9 if on else 0.3) * a), 1.2 * s, true)
	# the percentage
	var pc := "%d%%" % int(round(energy.focus / fm * 100.0))
	UITheme.text_mid(self, Vector2(r.end.x - 20 * s, y + 1 * s), pc, "number", int(17 * s), Color(UITheme.YELLOW if li else UITheme.TEXT, a), 2)

func _draw_pools(r: Rect2, s: float, a: float) -> void:
	var R := SLOT_R * s
	var pick := picking()
	var cy := r.position.y + POOLS_Y * s
	for tr in _trays():
		var pool: String = tr.pool
		var trr := _tray_rect(tr)
		var col := EnergyIcon.color(pool) if pool != TRAP else TRAP_COL
		var tp := _rr(trr, 13.0 * s, 4)
		draw_colored_polygon(tp, Color(0, 0, 0, 0.35 * a))
		draw_colored_polygon(_rr(trr.grow(-1.5 * s), 12.0 * s, 4), Color(col.darkened(0.55), 0.35 * a))
		var tl := tp.duplicate()
		tl.append(tp[0])
		var ring := Color(col.lightened(0.2), 0.45 * a)
		if pick and pool != BattleEnergy.ANY and energy.pool_room(pool) > 0:
			ring = Color(UITheme.YELLOW, a * (0.6 + 0.4 * sin(t * 6.0)))
		draw_polyline(tl, ring, (2.5 if pick else 1.2) * s, true)
		# the pool's glyph at its head (a bare glyph in the pool's colour: a label, not a chip)
		var hc := Vector2(trr.position.x + (TRAY_PAD + HEAD * 0.5) * s, cy)
		if pool == TRAP: _lock_badge(hc, 8.0 * s, a)
		else: EnergyIcon.draw_icon(self, pool, hc, 11.0 * s, a, {"glyph_only": true, "col": col.lightened(0.35)})
		# empty sockets: a faint chip of the pool's own type in each, so it reads what it holds
		if pool != TRAP:
			for i in range(int(tr.n), int(tr.cap)):
				var ec := _slot_in(pool, i)
				EnergyIcon.draw_icon(self, pool, ec, R * 0.92, 0.22 * a, {"flat": true, "dim": 0.55})
				draw_arc(ec, R, 0.0, TAU, 24, Color(1, 1, 1, 0.14 * a), 1.2 * s, true)
			# the count at the tray's end: chips in it over what it holds
			var cnt := "%d/%d" % [int(tr.n), int(tr.cap)]
			var full := int(tr.n) >= int(tr.cap)
			var cc := Vector2(trr.end.x - (TRAY_PAD + CNT_W * 0.5) * s, cy + 1.0 * s)
			UITheme.text_mid(self, cc, cnt, "label", int(13 * s), Color(UITheme.YELLOW if full else Color(1, 1, 1, 0.85), a), 1)
		if pick and energy.pool_room(pool) > 0:
			var nc := _slot_in(pool, int(tr.n))
			draw_arc(nc, R, 0.0, TAU, 24, Color(UITheme.YELLOW, a * (0.5 + 0.4 * sin(t * 6.0))), 2.0 * s, true)
			UITheme.text_mid(self, nc + Vector2(0, 1), "+", "display", int(18 * s), Color(UITheme.YELLOW, a), 1)
	for i in vis.size(): _chip(vis[i], i, R, a)
	# preview ghosts: what the move still needs, in the pool it would come from
	if preview_on and not ghosts.is_empty():
		var extra := {}
		for gk in ghosts:
			var pool2: String = gk if gk in _pools() else "colorless"
			var n := _pool_n(pool2) + int(extra.get(pool2, 0))
			extra[pool2] = int(extra.get(pool2, 0)) + 1
			var c2 := _slot_in(pool2, n)
			var pulse := 0.6 + 0.4 * sin(t * 7.0)
			EnergyIcon.draw_icon(self, gk, c2, R * 0.9, 0.32 * a, {"flat": true, "dim": 0.3})
			draw_arc(c2, R + 2.5 * s, 0.0, TAU, 28, Color(UITheme.RED, a * pulse), 2.5 * s, true)

func _draw_commit(r: Rect2, s: float, a: float) -> void:
	if energy.commit.is_empty(): return
	var semi := String(energy.commit.get("semi", "charging"))
	var cols := {"underground": Color("c08a4a"), "airborne": UITheme.SKY, "underwater": UITheme.BLUE, "charging": UITheme.YELLOW}
	var txt := _commit_text()
	var col: Color = cols.get(semi, UITheme.ORANGE)
	var tr := _trays()
	var at := Vector2(r.position.x + (float(tr.back().x1) + 12.0) * s, r.position.y + (POOLS_Y - 10.5) * s)
	var pulse := 0.8 + 0.2 * sin(t * 5.0)
	UITheme.chip(self, at, txt, col, UITheme.INK, int(13 * s), 21.0 * s, a * pulse)

func _chip(v: Dictionary, i: int, R: float, a: float) -> void:
	var lt: float = v.t - v.delay
	if lt < 0.0: return
	var c := _chip_c(i)
	var col := EnergyIcon.color(v.kind)
	var s := _s()
	if lt < CHARGE_T:
		var ck := lt / CHARGE_T
		var e := UITheme.ease_in(ck)
		UITheme.glow(self, c, R * (0.6 + 0.5 * e), col.lightened(0.3), a * ck)
		draw_arc(c, R * (2.4 - 1.4 * e), 0.0, TAU, 32, Color(col.lightened(0.45), a * ck), 2.5 * s, true)
		for j in 5:
			var ang := j * TAU / 5.0 + t * 4.0
			var d := Vector2(cos(ang), sin(ang))
			var r0 := R * (2.6 - 1.6 * e)
			draw_line(c + d * r0, c + d * (r0 - R * 0.55), Color(1, 1, 1, 0.85 * a * ck), 2.0 * s, true)
		return
	var pt := lt - CHARGE_T
	var sc := 1.0
	if pt < POP_T: sc = 0.35 + 0.65 * UITheme.ease_back(pt / POP_T, 2.6)
	var st: String = v.state
	var stk := clampf(v.st_t / 0.25, 0.0, 1.0)
	var lift := 0.0
	var dim := 0.0
	var on := hi.has(i) and st == "ready"
	if st == "spent": dim = 0.85 * stk
	elif st == "locked": dim = 0.7
	var fade := 1.0
	if preview_on and st == "ready":
		if on: lift = -4.0 * s
		else: fade = 0.6                 # not part of the preview: a little faded, still in colour
	if st == "spent": fade = 0.55
	var cc := c + Vector2(0, lift)
	if st == "locked":
		var face_down := not owner_view
		var pop := float(_lock_pop.get(int(v.lock), 9.0))
		var ps := 1.0 + 0.3 * maxf(0.0, 1.0 - pop / 0.25)
		if face_down:
			draw_circle(cc, R * 1.12 * ps, Color(TRAP_COL, 0.55 * a * (0.7 + 0.3 * sin(t * 4.0))), false, 2.0 * s, true)
			EnergyIcon.draw_icon(self, "hidden", cc, R * sc * ps, a)
		else:
			EnergyIcon.draw_icon(self, v.kind, cc, R * sc * 0.92 * ps, a, {"dim": dim})
			draw_circle(cc, R * 1.08 * ps, Color(TRAP_COL, 0.8 * a), false, 2.0 * s, true)
		_lock_badge(cc + Vector2(R * 0.62, R * 0.55), R * 0.7 * ps, a)
		return
	if on:
		var pulse := 0.5 + 0.5 * sin(t * 8.0)
		UITheme.glow(self, cc, R * 1.15, UITheme.YELLOW, a * (0.6 + 0.4 * pulse))
	elif st == "ready" and not preview_on:
		UITheme.glow(self, cc, R * 0.95, col, a * 0.45)
	if v.kind == BattleEnergy.ANY and st == "ready":
		UITheme.glow(self, cc, R * 1.5, UITheme.YELLOW, a * (0.5 + 0.3 * sin(t * 5.0)))
	# spent: grey, smaller, a hollow ring where the chip was (back next turn)
	if st == "spent": draw_arc(cc, R * 0.98, 0.0, TAU, 24, Color(1, 1, 1, 0.22 * a), 1.4 * s, true)
	EnergyIcon.draw_icon(self, v.kind, cc, R * sc * (1.0 - 0.22 * (dim if st == "spent" else 0.0)), a * fade, {"dim": dim})
	if on: draw_arc(cc, R + 3.0 * s, 0.0, TAU, 30, Color(UITheme.YELLOW, a), 2.5 * s, true)
	# just spent: a white flash ring
	if st == "spent" and v.st_t < 0.3:
		draw_circle(cc, R * (1.0 + 0.5 * v.st_t / 0.3), Color(1, 1, 1, 0.5 * (1.0 - v.st_t / 0.3) * a), false, 2.0 * s, true)
	if pt < 0.35:
		var bk := pt / 0.35
		draw_circle(cc, R * (1.0 + 1.3 * bk), Color(col.lightened(0.5), 0.7 * (1.0 - bk) * a), false, 3.0 * s * (1.0 - bk) + 0.5, true)
		if pt < 0.16: draw_circle(cc, R * 1.05, Color(1, 1, 1, (1.0 - pt / 0.16) * 0.85 * a), true, -1.0, true)

# a small padlock on a dark disc
func _lock_badge(c: Vector2, r: float, a: float) -> void:
	draw_circle(c, r * 1.05, Color(UITheme.INK, 0.92 * a), true, -1.0, true)
	draw_arc(c, r * 1.05, 0.0, TAU, 18, Color(1, 1, 1, 0.55 * a), maxf(1.0, r * 0.12), true)
	var col := Color(1, 1, 1, 0.95 * a)
	var lw := maxf(1.2, r * 0.18)
	draw_arc(c + Vector2(0, -r * 0.12), r * 0.32, PI, TAU, 10, col, lw, true)
	draw_line(c + Vector2(-r * 0.32, -r * 0.12), c + Vector2(-r * 0.32, r * 0.08), col, lw, true)
	draw_line(c + Vector2(r * 0.32, -r * 0.12), c + Vector2(r * 0.32, r * 0.08), col, lw, true)
	draw_colored_polygon(UITheme.rounded_points(Rect2(c + Vector2(-r * 0.48, 0.0), Vector2(r * 0.96, r * 0.62)), r * 0.12, 3), col)

func _fly_pos(f: Dictionary, u: float) -> Vector2:
	var p0: Vector2 = f.from
	var p2: Vector2 = f.to
	var p1 := (p0 + p2) * 0.5 + Vector2(f.spin * 40.0, -110.0) * _s()
	var w := 1.0 - u
	return p0 * w * w + p1 * 2.0 * w * u + p2 * u * u

func _fly(f: Dictionary, R: float, a: float) -> void:
	var lt: float = f.t - f.delay
	if lt < 0.0:
		EnergyIcon.draw_icon(self, f.kind, f.from + Vector2(0, -3.0 * _s()), R, a)
		return
	var u := clampf(lt / FLY_T, 0.0, 1.0)
	var e := UITheme.ease_in(u) * 0.75 + u * 0.25
	var col := EnergyIcon.color(f.kind)
	for j in 6:
		var ue := maxf(0.0, e - (j + 1) * 0.045)
		var tp := _fly_pos(f, ue)
		draw_circle(tp, R * (0.75 - j * 0.09) * (1.0 - 0.4 * ue), Color(col.lightened(0.35), (0.42 - j * 0.06) * a), true, -1.0, true)
	var p := _fly_pos(f, e)
	var sc := 1.0 - 0.45 * e
	UITheme.glow(self, p, R * sc * 1.2, col.lightened(0.3), a)
	draw_set_transform(p, f.spin * e * TAU * 0.75, Vector2.ONE)
	EnergyIcon.draw_icon(self, f.kind, Vector2.ZERO, R * sc, a, {"flat": true})
	draw_set_transform(Vector2.ZERO)
