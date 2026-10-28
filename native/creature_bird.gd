class_name CreatureBird
extends CreatureRig
# Fearow (the big bird; Spearow is Pidgey's rig, creature_spearow.gd). Rig: Waist -
# Hips (Tail1 - 2, FeelerA the tail fan) - L/RThigh - Leg - Foot (toes A, B, C and
# the hind D); Spine - Neck1 .. Neck5 (FeelerB the ruff) - Head (Hair the crest, Jaw -
# Tongue1 - 2: the long beak's lower half); each wing L/RShoulder - Arm - Arm2 -
# ForeArm - ForeArm2 - Hand (FingerA .. D the primaries, FeelerA .. E the coverts).
# The rip has the wings spread (and swept forward a little); standing they are folded
# back along the body (the arm swept back, the forearm folded in, the hand back again),
# never quite shut: a big bird's wings rest loose at its sides. Its long neck holds
# the head up in an S and bobs it as it walks; it struts.
#
#   f.flying / f.fly_height / f.glide   as Pidgey: takeoff / land move it up and down
#   signal wing_beat(power), beat_phase, wing_tip(side)
# Moods: CreatureRig's, plus forage (a peck at the ground), ruffle, takeoff, fly, glide,
# land, screech (fx("screech")), leer, peck (a stab at act_reach), fury_attack (a flurry),
# drill_peck (it spins in, beak first: fx("drill") each turn), aerial_ace (a swoop),
# wings_spread (a display).

signal wing_beat(power: float)

var flying := false
var fly_height := 2.2
var glide := false
var fly_w := 0.0
var beat_phase := 0.0
var flap := 0.0
var _act_h0 := 0.0
var wings := []                   # per side: {sg, sh, arm, arm2, fore, fore2, hand, open}
var debug_wing := Vector4(NAN, 0, 0, 0)

func _rig_ready() -> void:
	durs.merge({"forage": 1.4, "ruffle": 1.4, "takeoff": 1.6, "land": 1.6, "screech": 1.4, "peck": 1.0,
		"fury_attack": 1.8, "drill_peck": 1.8, "aerial_ace": 1.3, "wings_spread": 2.2, "leer": 1.2}, true)
	arms.clear()
	for s in [["L", 1.0], ["R", -1.0]]:
		wings.append({"sg": s[1], "sh": b(s[0] + "Shoulder"), "arm": b(s[0] + "Arm"), "arm2": b(s[0] + "Arm2"),
			"fore": b(s[0] + "ForeArm"), "fore2": b(s[0] + "ForeArm2"), "hand": b(s[0] + "Hand"), "open": Vector2.ZERO,
			"tip": b(s[0] + "FingerA")})
	JAW = b("Jaw")
	for k in I.get("fold", {}): FOLD[k] = float(I.fold[k])

func wing_tip(side: int) -> Vector3:
	return to_world(G[wings[0 if side > 0 else 1].tip].origin)

func point(n: String) -> Vector3:
	match n:
		"beak", "mouth":
			var k := _kids(b("Jaw"))
			return to_world(G[b("Hair")].origin.lerp(G[JAW].origin, 0.5) + (G[HEAD].basis.z.normalized() * sz * 0.8))
		"wing_l": return wing_tip(1)
		"wing_r": return wing_tip(-1)
	return super.point(n)

func mood(what: String) -> void:
	match what:
		"fly":
			glide = false
			if flying: return
			what = "takeoff"
		"glide":
			glide = true
			if flying: return
			what = "takeoff"
		"land":
			if not flying and height < 0.01: return
	super.mood(what)

func _act_start(what: String) -> void:
	_act_h0 = height
	if what in ["takeoff", "flee"]: flying = true

func _end_act() -> void:
	if act == "land": flying = false
	super._end_act()

func _reset_now() -> void:
	super._reset_now()
	height = fly_height if flying else 0.0
	_hv = Vector2(height, 0.0)
	fly_w = 1.0 if flying else 0.0

# ---------- the frame ----------
func _frame(P: Dictionary, dt: float, v: float) -> void:
	_height(P, dt)
	super._frame(P, dt, v)
	_wings(P, dt, v)

func _base(dt: float, v: float) -> Dictionary:
	var P := super._base(dt, v)
	P.merge({"open": [0.0, 0.0], "el": [0.0, 0.0], "sw": [0.0, 0.0], "tw": [0.0, 0.0], "droop": 0.12, "flapw": 0.0, "crest": 0.0, "spin": 0.0}, true)
	P.crest += 0.25 * battle_w
	for i in 2: P.open[i] = 0.1 * battle_w
	if flying or fly_w > 0.001:
		if act == "": fly_w = damp(fly_w, 1.0 if flying else 0.0, 3.0, dt)
		P.air = fly_w
		P.legs = "tuck"
		var cruise := sm(0.3, 3.0, v)
		P.pitch += fly_w * lerpf(0.05, 0.3, cruise)
		P.hp = -0.1 * fly_w if is_nan(float(P.hp)) else P.hp
		P.lean -= fly_w * 0.15
		P.tp += fly_w * 0.2
		if glide and act == "":
			for i in 2:
				P.open[i] = fly_w; P.el[i] = 0.1 + sin(t * 1.4 + i) * 0.04; P.sw[i] = 0.05; P.tw[i] = -0.05
			P.roll += sin(t * 0.8) * 0.12 * fly_w
		else:
			P.flapw = fly_w
	return P

func _height(P: Dictionary, dt: float) -> void:
	var want := fly_height if flying else 0.0
	match act:
		"takeoff", "flee":
			var e := sm(0.25, act_dur, act_t)
			_hv = Vector2(lerpf(_act_h0, fly_height, e * e * (3.0 - 2.0 * e)) + 0.25 * sz * sm(0.22, 0.4, act_t) * (1.0 - e), 0.0)
		"land":
			var e := sm(0.0, 0.9, act_t)
			_hv = Vector2(_act_h0 * (1.0 - e) * (1.0 - e * 0.3) if act_t < 0.9 else 0.0, 0.0)
		_:
			_hv = spring(_hv, want, 2.5, dt, 1.0)
	height = maxf(0.0, _hv.x)
	if height > 0.03: P.air = 1.0; P.legs = "tuck"

# the wing beat: a big slow downstroke, the upstroke with the wrist folded
func _flap_wings(P: Dictionary, dt: float, hz: float, amp: float, w: float, power := 0.6) -> void:
	var f0 := flap
	flap += hz * dt
	var ph := fposmod(flap, 1.0)
	beat_phase = ph
	if floor(flap - 0.3) > floor(f0 - 0.3): wing_beat.emit(power)
	var el: float
	var op := 1.0
	var sw: float
	var tw: float
	if ph < 0.5:
		var e := sm(0.0, 0.5, ph)
		el = lerpf(1.0, -0.7, e); sw = lerpf(0.1, -0.15, e); tw = lerpf(0.15, -0.3, sin(e * PI))
	else:
		var e := sm(0.5, 1.0, ph)
		el = lerpf(-0.7, 1.0, e); op = 1.0 - 0.45 * sin(e * PI); sw = lerpf(-0.15, 0.1, e) + 0.3 * sin(e * PI); tw = 0.4 * sin(e * PI)
	for i in 2:
		P.open[i] = lerpf(P.open[i], op, w)
		P.el[i] = lerpf(P.el[i], el * amp, w)
		P.sw[i] = lerpf(P.sw[i], sw, w)
		P.tw[i] = lerpf(P.tw[i], tw, w)
	P.y += -cos(ph * TAU) * 0.05 * sz * amp * w
	P.pitch += sin(ph * TAU) * 0.04 * amp * w

# ---------- the acts ----------
func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.12, u) * sm(d, d - 0.2, u)
	match act:
		"forage":
			var down := sm(0.05, 0.3, u) * sm(d, d - 0.3, u)
			P.lean += 0.6 * down
			P.hp = -0.9 * down
			var jab := 0.0
			for k in 2: jab = maxf(jab, bump(u, 0.45 + k * 0.3, 0.62 + k * 0.3))
			P.hfwd += 0.1 * sz * jab
			P.jaw = 0.3 * jab
			if _ev("p", 0.55): pecks += 1
		"ruffle":
			var sh := sm(0.15, 0.25, u) * sm(1.1, 0.8, u)
			P.roll += sin(u * TAU * 6.0) * 0.15 * sh
			P.hy = sin(u * TAU * 7.0) * 0.4 * sh
			P.hk = 3.0
			for i in 2: P.open[i] = 0.35 * sh + 0.2 * bump(u, 0.0, 0.3); P.el[i] = 0.3 * sh
			P.crest += 0.6 * sh
			P.ty += sin(u * TAU * 6.0) * 0.4 * sh
		"takeoff", "flee":
			var cr := bump(u, 0.0, 0.3)
			P.crouch += 0.8 * cr
			P.lean += 0.3 * cr
			fly_w = sm(0.2, 0.8, u)
			P.air = sm(0.22, 0.28, u)
			P.legs = "tuck"
			for i in 2: P.open[i] = maxf(P.open[i], sm(0.0, 0.2, u))
			_flap_wings(P, dt, 3.0 if act == "takeoff" else 3.8, 1.2, sm(0.08, 0.25, u), 0.8)
			P.crest += 0.5 * env
		"land":
			fly_w = 1.0 - sm(0.8, 1.0, u)
			P.air = 1.0 - sm(0.85, 0.9, u)
			P.legs = "plant" if u > 0.6 else "tuck"
			var brake := bump(u, 0.3, 1.05)
			_flap_wings(P, dt, 2.8, 1.2, 1.0 - sm(0.95, 1.2, u), 0.5)
			for i in 2: P.sw[i] -= 0.4 * brake
			P.pitch -= 0.5 * brake
			P.crouch += 0.6 * bump(u, 0.85, 1.3)
			if _ev("touch", 0.88): footfalls += 1
		"screech":
			var cry := bump(u, 0.2, d - 0.15)
			P.lean += 0.25 * cry
			P.hp = 0.35 * cry
			P.hfwd += 0.15 * sz * cry
			P.jaw = 1.0 * cry
			P.crest += 1.0 * env
			for i in 2: P.open[i] = 0.75 * cry; P.el[i] = 0.4 + sin(u * 30.0) * 0.1 * cry
			if _ev("s", 0.25): fx.emit("screech", point("beak"))
		"peck", "fury_attack":
			var n := 1 if act == "peck" else 4
			var lean := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.lean += 0.35 * lean
			P.fwd += 0.15 * act_reach * lean
			P.crest += 0.9 * lean
			var jab := 0.0
			for k in n:
				var at := 0.35 + k * 0.3
				jab = maxf(jab, bump(u, at - 0.12, at + 0.08))
				if _ev("j%d" % k, at):
					impact.emit(act)
					fx.emit("peck", point("beak"))
			P.hp = -0.3 * lean - 0.35 * jab
			P.hfwd += 0.35 * sz * jab
			P.jaw = 0.5 * jab
			P.hk = 3.0
			for i in 2: P.open[i] = 0.4 * lean; P.el[i] = 0.3
		"drill_peck", "aerial_ace":
			# up, then in at the target, beak first (spinning for drill peck), and back
			var R := act_reach
			var rise := sm(0.0, 0.35, u) * (1.0 - sm(0.45, 0.6, u))
			var go := sm(0.4, 0.75, u) * (1.0 - sm(0.95, d - 0.05, u))
			_hv = Vector2(height, 0.0)
			P.y += sz * (0.9 * rise + 0.2 * go)
			P.fwd += R * go
			P.pitch += 0.15 * rise + 0.3 * go
			P.air = 1.0
			P.legs = "tuck"
			P.hp = -0.6 * go
			P.crest -= 0.5 * go
			for i in 2:
				P.open[i] = maxf(1.0 - go * 0.8, 0.15); P.sw[i] = 1.0 * go; P.el[i] = 0.2
			if act == "drill_peck":
				P.spin = go * 3.0 * (u - 0.4) * TAU
				for k in 4:
					if _ev("d%d" % k, 0.45 + k * 0.08): fx.emit("drill", point("beak"))
			if go < 0.5: _flap_wings(P, dt, 3.5, 1.0, 1.0 - go * 2.0, 0.6)
			if _ev("hit", 0.72):
				impact.emit(act)
				fx.emit("hit", point("beak"))
		"wings_spread":
			var o := sm(0.05, 0.45, u) * sm(d, d - 0.45, u)
			for i in 2: P.open[i] = o; P.el[i] = 0.35 + sin(u * 30.0 + i) * 0.03; P.sw[i] = -0.1
			P.lean -= 0.2 * o
			P.crest += 1.0 * o
			P.hp = 0.35 * o
			P.jaw = 0.8 * bump(u, 0.5, 1.1)
			P.tp += 0.4 * o
		_:
			return false
	return true

# ---------- the wings ----------
# open 0 folded back at the side .. 1 spread; el raised (+) at the shoulder; sw swept
# back (+); tw the wing's pitch (+ leading edge up)
var FOLD := {"sw": 1.25, "el": -0.25, "e": 1.9, "e2": 0.0, "h": 1.7, "tw": -0.2}

func _wings(P: Dictionary, dt: float, v: float) -> void:
	if P.flapw > 0.001 and act == "":
		for i in 2: P.open[i] = maxf(P.open[i], P.flapw)
		_flap_wings(P, dt, lerpf(2.6, 2.0, sm(0.5, 3.0, v)), 1.0, P.flapw, 0.45)
	if faint_w > 0.01:
		P.open[1] = maxf(P.open[1], 0.5 * faint_w)
	if not is_nan(debug_wing.x):
		for i in 2:
			P.open[i] = debug_wing.x; P.el[i] = debug_wing.y; P.sw[i] = debug_wing.z; P.tw[i] = debug_wing.w
	for i in 2:
		var w: Dictionary = wings[i]
		var sg: float = w.sg
		w.open = spring(w.open, float(P.open[i]), 22.0, dt, 0.85)
		var o := clampf(w.open.x, 0.0, 1.05)
		var f := 1.0 - minf(o, 1.0)
		var el: float = P.el[i] * sm(0.0, 0.4, o) + float(FOLD.el) * f - float(P.droop) * f
		var sw: float = P.sw[i] * sm(0.0, 0.5, o) + float(FOLD.sw) * f
		var tw: float = P.tw[i] * sm(0.0, 0.5, o) + float(FOLD.tw) * f
		turn_rest(w.sh, Vector3(0, 0, 1), sg * el * 0.2)
		turn_rest(w.arm, Vector3(0, 0, 1), sg * el * 0.8)
		turn_rest(w.arm, Vector3.UP, sg * sw)
		turn_rest(w.arm, Vector3.RIGHT, -tw)
		turn_rest(w.fore, Vector3.UP, sg * float(FOLD.e) * f)
		turn_rest(w.fore2, Vector3.UP, -sg * float(FOLD.e2) * f)
		turn_rest(w.hand, Vector3.UP, -sg * float(FOLD.h) * f)
		turn_rest(w.fore2, Vector3(0, 0, 1), sg * el * 0.15)
	# the crest and a drill peck's spin
	turn_rest(b("Hair"), Vector3.RIGHT, -clampf(float(P.crest), -0.6, 1.2) * 0.4)
	if absf(float(P.spin)) > 0.001:
		var bw: Basis = _tg[W]
		var fwd := (bw * rest_g[W].basis.inverse() * Vector3(0, 0, 1)).normalized()
		set_global(W, Basis(fwd, float(P.spin)) * bw)
