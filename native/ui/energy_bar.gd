class_name EnergyBar
extends Control
# A Pokémon's energy bar in battle (battle/energy.gd; design/energy_system.md):
# a dark skewed plate in the UI kit's style with the turn tag, the count
# ("2/3") and a row of sockets: filled (an EnergyIcon chip), empty (a recessed
# socket with a faint hint of the kind that comes there next) and locked (the
# next slots, with the level that opens them). It follows a BattleEnergy by
# its signals and animates by itself:
#   a new turn      last turn's leftovers fade; each new chip charges up (a ring
#                   converging, sparks), pops in (a flash, a burst, a sound)
#   spending        the chips lift, fly out along an arc to fly_target (the
#                   move's user or target on screen) with a trail, and burst there
#   restoring       an item's chips charge up like a new turn's
#   preview         preview_cost(cost) lights the chips a move would use (they
#                   rise, a yellow ring pulses) and dims the rest; what's short
#                   shows as red ghosts in the sockets it would need
#
#   var bar := EnergyBar.new(); layer.add_child(bar)
#   bar.bind(energy); bar.side = "foe" | "ally"; bar.title = "PIDGEY"
#   bar.fly_target = screen_pos            # (viewport / canvas coordinates)
#   bar.preview_cost(BattleEnergy.cost_of("gust")); bar.clear_preview()
#   bar.show_bar(true)                     # slides in (false: out)

const H := 58.0                  # the plate's height at scale 1
const SLOT_R := 15.0
const PITCH := 38.0
const LEFT := 104.0              # the label block
const FADE_T := 0.2
const CHARGE_T := 0.24
const POP_T := 0.22
const STAGGER := 0.13
const FLY_T := 0.46

var energy: BattleEnergy
var side := "foe":
	set(v): side = v; queue_redraw()
var title := ""
var show_locked := 2             # locked sockets shown after the capacity
var fly_target := Vector2(-1, -1)   # canvas coordinates; (-1, -1): up and away
var align_right := false         # draw from the right edge of the rect (the foe's, under its plate)
var sounds := true
var scale_k := 1.0               # set from the rect's height by fit()

var vis: Array = []              # the chips shown: {kind, x (slot, animated), delay, t}
var flying: Array = []           # {kind, from, to, t, delay, spin}
var fading: Array = []           # {kind, x, t}
var bursts: Array = []           # {at, kind, t}
var flashes := {}                # slot -> t (a socket flashes as a chip leaves)
var hi: Array = []               # the previewed chips (indices)
var ghosts: Array = []           # the kinds a previewed move lacks
var preview_on := false
var turn_no := 0
var t := 0.0
var k := 1.0                     # slid in (0..1)
var _k_to := 1.0
var _cap := 1
var _turn_pop := 9.0
var _gain := {}                  # {n, t}: the "+n" that rises off a new turn's gain

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if size == Vector2.ZERO: size = Vector2(width_for(_slots()), H)

func bind(e: BattleEnergy) -> void:
	if energy and energy.turn_started.is_connected(_on_turn):
		energy.turn_started.disconnect(_on_turn)
		energy.spent.disconnect(_on_spent)
		energy.restored.disconnect(_on_restored)
		energy.changed.disconnect(_on_changed)
	energy = e
	vis = []
	flying = []; fading = []; bursts = []
	if e == null: return
	e.turn_started.connect(_on_turn)
	e.spent.connect(_on_spent)
	e.restored.connect(_on_restored)
	e.changed.connect(_on_changed)
	_cap = e.capacity
	turn_no = e.turn
	for i in e.chips.size(): vis.append({"kind": e.chips[i], "x": float(i), "delay": 0.0, "t": 9.0})
	queue_redraw()

func _slots() -> int:
	if energy == null: return 3 + show_locked
	return mini(energy.capacity + show_locked, BattleEnergy.max_capacity())

func slots_shown() -> int: return _slots()

static func width_for(n: int, s := 1.0) -> float:
	return (LEFT + n * PITCH + 22.0) * s

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
func _on_turn(turn: int, lost: Array, gained: Array) -> void:
	turn_no = turn
	_turn_pop = 0.0
	for v in vis: fading.append({"kind": v.kind, "x": v.x, "t": 0.0})
	vis = []
	var lead := FADE_T if not lost.is_empty() else 0.05
	for i in gained.size():
		vis.append({"kind": gained[i], "x": float(i), "delay": lead + i * STAGGER, "t": 0.0, "snd": false})
	if not gained.is_empty(): _gain = {"n": gained.size(), "t": -lead - CHARGE_T}
	hi = []; ghosts = []

func _on_spent(indices: Array, kinds: Array, _move: String) -> void:
	var idx := indices.duplicate()
	idx.sort()
	var j := 0
	for i in range(idx.size() - 1, -1, -1):
		var at: int = idx[i]
		if at < 0 or at >= vis.size(): continue
		var v: Dictionary = vis[at]
		vis.remove_at(at)
		flashes[int(round(v.x))] = 0.0
		flying.append({"kind": v.kind, "from": _slot_c(v.x), "to": _target(), "t": 0.0, "delay": j * 0.07, "spin": 1.0 if j % 2 == 0 else -1.0})
		j += 1
	if sounds and j > 0: Sfx.play("whoosh", null, {"vol": -7.0, "pitch": 1.35})
	hi = []; ghosts = []
	if preview_on: preview_on = false

func _on_restored(first: int, kinds: Array) -> void:
	for i in kinds.size():
		vis.append({"kind": kinds[i], "x": float(first + i), "delay": i * STAGGER, "t": 0.0, "snd": false})
	_gain = {"n": kinds.size(), "t": -CHARGE_T}

func _on_changed() -> void:
	if energy and energy.capacity != _cap:
		_cap = energy.capacity
	queue_redraw()

# ---------- the preview ----------
func preview_cost(cost) -> void:
	if energy == null: return
	preview_on = true
	var m = BattleEnergy.match_cost(energy.chips, cost)
	if m != null:
		hi = m.duplicate(); hi.sort()
		ghosts = []
	else:
		# light what it has toward the cost, ghost what it lacks
		var pm := BattleEnergy.partial_match(energy.chips, cost)
		hi = pm.used; hi.sort()
		ghosts = pm.missing

func clear_preview() -> void:
	preview_on = false
	hi = []; ghosts = []

# ---------- geometry ----------
func _s() -> float: return scale_k

func _origin() -> Vector2:
	var w := width_for(_slots(), _s())
	var x := size.x - w if align_right and size.x > w else 0.0
	return Vector2(x, 0.0)

func _plate_rect() -> Rect2:
	var dir := 1.0 if side == "ally" else -1.0
	var o := _origin() + Vector2((1.0 - UITheme.ease_out_expo(k)) * 70.0 * -dir, 0.0)
	return Rect2(o, Vector2(width_for(_slots(), _s()), H * _s()))

func _slot_c(x: float) -> Vector2:
	var r := _plate_rect()
	var s := _s()
	return r.position + Vector2(LEFT * s + PITCH * s * 0.5 + x * PITCH * s, r.size.y * 0.5)

func _target() -> Vector2:
	if fly_target.x < 0.0: return _slot_c(1.0) + Vector2(60, -220) * _s()
	return get_global_transform_with_canvas().affine_inverse() * fly_target

func _accent() -> Color:
	return UITheme.SKY if side == "ally" else UITheme.YELLOW

# ---------- animation ----------
func _process(dt: float) -> void:
	t += dt
	_turn_pop += dt
	k = move_toward(k, _k_to, dt / UITheme.BASE)
	if not _gain.is_empty():
		_gain.t += dt
		if _gain.t > 1.1: _gain = {}
	for i in vis.size():
		var v: Dictionary = vis[i]
		v.t += dt
		v.x = lerpf(v.x, float(i), 1.0 - exp(-dt * 16.0))
		if absf(v.x - i) < 0.002: v.x = float(i)
		var lt: float = v.t - v.delay
		if sounds and lt >= 0.0 and v.get("snd", true) == false:
			v.snd = true
			Sfx.play("ui_blip_high", null, {"vol": -12.0, "pitch": 0.9 + i * 0.07})
		if sounds and lt >= CHARGE_T and v.has("snd") and not v.has("snd2"):
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
	for s in flashes.keys():
		flashes[s] += dt
		if flashes[s] > 0.3: flashes.erase(s)
	# keep in step with the engine if it was changed behind our back
	if energy and fading.is_empty() and flying.is_empty() and vis.size() != energy.chips.size():
		vis = []
		for i in energy.chips.size(): vis.append({"kind": energy.chips[i], "x": float(i), "delay": 0.0, "t": 9.0})
	queue_redraw()

# ---------- drawing ----------
func _draw() -> void:
	if k <= 0.001: return
	var s := _s()
	var a := clampf(k * 1.4, 0.0, 1.0)
	var r := _plate_rect()
	var pts := UITheme.plate(self, r, a, UITheme.SKEW, UITheme.PLATE, UITheme.CUT * s)
	UITheme.outline(self, pts, Color(1, 1, 1, 0.1 * a), 1.0)
	var acc := _accent()
	# the accent strip on top, the turn tag
	UITheme.para(self, Rect2(r.position + Vector2(16 * s, -5 * s), Vector2(86 * s, 5 * s)), Color(acc, a))
	if turn_no > 0:
		var pk := 1.0 + 0.3 * maxf(0.0, 1.0 - _turn_pop / 0.25)
		var tag := "TURN %d" % turn_no
		UITheme.chip(self, r.position + Vector2(r.size.x - (UITheme.text_w(tag, "label", int(13 * s)) + 30.0) * s - 8 * s, -12 * s * pk), tag, acc, UITheme.INK, int(13 * s * pk), 21.0 * s * pk, a)
	# the label block: ENERGY, the count
	var lx := r.position.x + 22 * s
	UITheme.text(self, Vector2(lx, r.position.y + 20 * s), "ENERGY", "label", int(13 * s), Color(acc, a))
	var n := 0
	for v in vis:
		if v.t - v.delay >= CHARGE_T: n += 1
	var cap := energy.capacity if energy else 0
	var ns := str(n)
	var nw := UITheme.text(self, Vector2(lx - 2 * s, r.position.y + 49 * s), ns, "display", int(34 * s), Color(UITheme.TEXT, a))
	UITheme.text(self, Vector2(lx + nw, r.position.y + 49 * s), "/%d" % cap, "heading", int(19 * s), Color(UITheme.TEXT_DIM, a))
	# "+n" rising off the count as the chips pop in
	if not _gain.is_empty() and _gain.t >= 0.0:
		var gk: float = _gain.t / 1.1
		var ga := a * clampf(1.0 - (gk - 0.55) / 0.45, 0.0, 1.0) * clampf(_gain.t / 0.08, 0.0, 1.0)
		var gp := 1.0 + 0.35 * maxf(0.0, 1.0 - _gain.t / 0.18)
		UITheme.text(self, Vector2(lx + 52 * s, r.position.y + 48 * s - 20 * s * UITheme.ease_out(gk)), "+%d" % int(_gain.n), "display", int(26 * s * gp), Color(acc, ga), 0, -1.0, int(4 * s), Color(0, 0, 0, 0.5 * ga))
	# the sockets
	var R := SLOT_R * s
	var slots := _slots()
	var unlock := -1
	for i in slots:
		var c := _slot_c(float(i))
		if i < cap:
			_socket(c, R, a, i)
		else:
			if unlock < 0 and energy: unlock = i
			_locked(c, R, a, i, i == unlock)
		if flashes.has(i):
			var ft: float = flashes[i] / 0.3
			draw_circle(c, R * (1.0 + 0.5 * ft), Color(1, 1, 1, 0.5 * (1.0 - ft) * a), false, 2.0 * s, true)
	# leftovers fading out (a new turn)
	for f in fading:
		var fk: float = f.t / FADE_T
		EnergyIcon.draw_icon(self, f.kind, _slot_c(f.x), R * (1.0 - 0.35 * fk), a * (1.0 - fk), {"dim": 0.4 + 0.6 * fk})
	# the chips
	for i in vis.size():
		_chip(vis[i], i, R, a)
	# the preview's ghosts: what the move still needs
	if preview_on and not ghosts.is_empty():
		for j in ghosts.size():
			var gi := vis.size() + j
			var c2 := _slot_c(float(gi))
			var pulse := 0.6 + 0.4 * sin(t * 7.0)
			EnergyIcon.draw_icon(self, ghosts[j], c2, R * 0.9, 0.32 * a, {"flat": true, "dim": 0.3})
			draw_arc(c2, R + 2.5 * s, 0.0, TAU, 28, Color(UITheme.RED, a * pulse), 2.5 * s, true)
	# flying chips (on top of everything, out of the plate)
	for f in flying: _fly(f, R, a)
	for b in bursts:
		var bk: float = b.t / 0.35
		var bc := EnergyIcon.color(b.kind)
		draw_circle(b.at, R * (0.6 + 1.6 * bk), Color(bc.lightened(0.4), 0.55 * (1.0 - bk) * a), false, 3.0 * s * (1.0 - bk) + 1.0, true)
		draw_circle(b.at, R * 0.7 * (1.0 - bk), Color(1, 1, 1, 0.8 * (1.0 - bk) * a), true, -1.0, true)

func _socket(c: Vector2, R: float, a: float, i: int) -> void:
	draw_circle(c, R + 1.5, Color(0, 0, 0, 0.42 * a), true, -1.0, true)
	draw_circle(c + Vector2(0, 1.2), R - 0.5, Color(1, 1, 1, 0.05 * a), true, -1.0, true)
	draw_arc(c, R + 1.0, 0.0, TAU, 28, Color(1, 1, 1, 0.16 * a), 1.2, true)
	# a faint hint of the kind due here
	if energy and i >= vis.size():
		EnergyIcon._glyph(self, energy.focus_kind(i), c, R * 0.55, Color(1, 1, 1, 0.1 * a), Color(0, 0, 0, 0))

func _locked(c: Vector2, R: float, a: float, i: int, first: bool) -> void:
	draw_circle(c, R + 1.5, Color(0, 0, 0, 0.28 * a), true, -1.0, true)
	# hatching inside
	for h in range(-3, 4):
		var o := h * R * 0.42
		var y := sqrt(maxf(0.0, R * R * 0.81 - o * o))
		draw_line(c + Vector2(o - y * 0.35, y), c + Vector2(o + y * 0.35, -y), Color(1, 1, 1, 0.05 * a), 1.5, true)
	draw_arc(c, R + 1.0, 0.0, TAU, 28, Color(1, 1, 1, 0.08 * a), 1.0, true)
	var s := _s()
	if first and energy:
		var lv := BattleEnergy.level_for_slot(i + 1, energy.species)
		if lv > 0:
			UITheme.text_mid(self, c + Vector2(0, -3.5 * s), "LV", "label", int(9 * s), Color(UITheme.TEXT_DIM, a * 0.8), 1)
			UITheme.text_mid(self, c + Vector2(0, 5.5 * s), str(lv), "number", int(14 * s), Color(UITheme.TEXT, a * 0.85), 1)
			return
	_lock_icon(c, R * 0.5, Color(1, 1, 1, 0.32 * a))

func _lock_icon(c: Vector2, r: float, col: Color) -> void:
	draw_arc(c + Vector2(0, -r * 0.25), r * 0.5, PI, TAU, 10, col, maxf(1.2, r * 0.22), true)
	draw_line(c + Vector2(-r * 0.5, -r * 0.25), c + Vector2(-r * 0.5, r * 0.1), col, maxf(1.2, r * 0.22), true)
	draw_line(c + Vector2(r * 0.5, -r * 0.25), c + Vector2(r * 0.5, r * 0.1), col, maxf(1.2, r * 0.22), true)
	draw_colored_polygon(UITheme.rounded_points(Rect2(c + Vector2(-r * 0.75, 0.0), Vector2(r * 1.5, r * 1.05)), r * 0.2, 3), col)

func _chip(v: Dictionary, i: int, R: float, a: float) -> void:
	var lt: float = v.t - v.delay
	if lt < 0.0: return
	var c := _slot_c(v.x)
	var col := EnergyIcon.color(v.kind)
	var s := _s()
	# charging up: a ring converging on the socket, sparks drawn in, the socket glowing
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
	# the pop
	var pt := lt - CHARGE_T
	var sc := 1.0
	if pt < POP_T: sc = 0.35 + 0.65 * UITheme.ease_back(pt / POP_T, 2.6)
	var lift := 0.0
	var dim := 0.0
	var on := hi.has(i)
	if preview_on:
		if on: lift = -4.0 * s
		else: dim = 0.55
	var cc := c + Vector2(0, lift)
	if on:
		var pulse := 0.5 + 0.5 * sin(t * 8.0)
		UITheme.glow(self, cc, R * 1.15, UITheme.YELLOW, a * (0.6 + 0.4 * pulse))
	elif not preview_on:
		UITheme.glow(self, cc, R * 0.95, col, a * 0.45)
	EnergyIcon.draw_icon(self, v.kind, cc, R * sc, a, {"dim": dim})
	if on:
		draw_arc(cc, R + 3.0 * s, 0.0, TAU, 30, Color(UITheme.YELLOW, a), 2.5 * s, true)
	if pt < 0.35:
		var bk := pt / 0.35
		draw_circle(cc, R * (1.0 + 1.3 * bk), Color(col.lightened(0.5), 0.7 * (1.0 - bk) * a), false, 3.0 * s * (1.0 - bk) + 0.5, true)
		if pt < 0.16: draw_circle(cc, R * 1.05, Color(1, 1, 1, (1.0 - pt / 0.16) * 0.85 * a), true, -1.0, true)
		for j in 6:
			var ang2 := j * TAU / 6.0 + 0.4
			var d2 := Vector2(cos(ang2), sin(ang2))
			draw_line(cc + d2 * R * (1.1 + 0.9 * bk), cc + d2 * R * (1.4 + 1.3 * bk), Color(1, 1, 1, (1.0 - bk) * a), 2.0 * s, true)

func _fly_pos(f: Dictionary, u: float) -> Vector2:
	var p0: Vector2 = f.from
	var p2: Vector2 = f.to
	var p1 := (p0 + p2) * 0.5 + Vector2(f.spin * 40.0, -110.0) * _s()
	var w := 1.0 - u
	return p0 * w * w + p1 * 2.0 * w * u + p2 * u * u

func _fly(f: Dictionary, R: float, a: float) -> void:
	var lt: float = f.t - f.delay
	if lt < 0.0:
		# waiting its turn: it hovers lifted out of its socket
		EnergyIcon.draw_icon(self, f.kind, f.from + Vector2(0, -3.0 * _s()), R, a)
		return
	var u := clampf(lt / FLY_T, 0.0, 1.0)
	var e := UITheme.ease_in(u) * 0.75 + u * 0.25
	var col := EnergyIcon.color(f.kind)
	# the trail
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
