class_name CreatureNido
extends CreatureRig
# The Nidoran line: Nidoran F and M and Nidorino on all fours, Nidorina, Nidoqueen and
# Nidoking up on their hind legs. Rig: Waist - Hips - (L/RHips) - L/RThigh - Leg - Foot
# - Toe, Tail1 ..; Spine1 - Spine2 (or Spine - Neck) - Head (Jaw; L/REar1 - Ear2, the
# big ears; the Nidoran's L/RFeelerA / B whiskers), L/RShoulder - Arm - ForeArm - Hand.
# The ears are its signature: each swivels on its own toward what it hears (one turned
# out and back, the other forward), flicks, and lies flat when it charges.
# Moods (besides CreatureRig's): ear_swivel, and the battle acts horn_attack, peck,
# fury_attack, double_kick, poison_sting (the horn's barb: fx("sting") at point("horn")),
# bite, scratch_attack, tail_whip, growl, leer, focus_energy; Nidoqueen / Nidoking:
# stomp (fx("quake")), body_slam (a leap and the belly dropped on the target), earth_power
# (a stomp, fx("earth") ahead), roar (fx("roar")), thrash (a rampage of swings),
# megahorn (a charge, the horn lowered).
# Points: "horn" (the horn's tip, or the forehead), "mouth", "head", "tail".

var horn := Vector3.ZERO          # rest (skeleton space)
var _swivel_t := 1.0
var _ear_want := [0.0, 0.0]

func _rig_ready() -> void:
	durs.merge({"ear_swivel": 2.2, "body_slam": 1.6, "earth_power": 1.6, "roar": 1.8, "thrash": 2.4, "megahorn": 1.6}, true)
	var h: Array = I.get("horn", [])
	if h.size() == 3: horn = Vector3(float(h[0]), float(h[1]), float(h[2]))
	else: horn = rest_at(HEAD) + Vector3(0, 0.35 * sz, 0.35 * sz)

func point(n: String) -> Vector3:
	if n == "horn": return to_world(G[HEAD] * (rest_g[HEAD].affine_inverse() * horn))
	return super.point(n)

func _base_species(P: Dictionary, dt: float, v: float) -> void:
	# each ear picks its own way to listen now and then
	_swivel_t -= dt
	if _swivel_t <= 0.0:
		_swivel_t = rng.randf_range(0.7, 2.5)
		var i := rng.randi() % 2
		_ear_want[i] = rng.randf_range(-0.6, 0.8)
		if rng.randf() < 0.3: _ear_want[1 - i] = rng.randf_range(-0.4, 0.7)
	P.ear_l += _ear_want[0] * (1.0 - sleep_w)
	P.ear_r += _ear_want[1] * (1.0 - sleep_w)

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
	match act:
		"ear_swivel":
			# one ear, then the other, swung round to a sound behind; the head follows
			var a := bump(u, 0.0, 1.1)
			var b2 := bump(u, 0.7, d)
			P.ear_l += -0.9 * a + 0.6 * b2
			P.ear_r += 0.6 * a - 0.9 * b2
			P.earo += 0.3 * (a + b2)
			P.hy = 0.5 * a - 0.5 * b2
			P.ht = 0.15 * (a - b2)
			P.hk = 0.8
			if _ev("a", 0.05): _ear_kick[0] = 0.8
			if _ev("b", 0.8): _ear_kick[1] = 0.8
		"body_slam":
			# up into the air and down belly first on the target
			var cr := bump(u, 0.0, 0.35)
			var air := sm(0.3, 0.38, u) * (1.0 - sm(0.95, 1.0, u))
			var e := sm(0.32, 0.98, u)
			P.crouch += 0.9 * cr
			P.sq += 0.3 * cr - 0.3 * bump(u, 0.95, 1.25)
			P.y += 1.0 * sz * sin(e * PI) * air
			P.fwd += act_reach * 0.8 * e * (1.0 - sm(1.2, d, u))
			P.lean += 0.9 * sm(0.5, 0.95, u) * (1.0 - sm(1.1, d, u))
			P.air = 1.0 if air > 0.5 else 0.0
			P.legs = "tuck"
			P.eye = "angry"
			P.mouth = "wide"
			for i in 2: P.arm_up[i] += 2.0 * air; P.arm_out[i] += 0.8 * air
			if _ev("hit", 0.98):
				impact.emit(act)
				fx.emit("quake", global_position + global_transform.basis.z * act_reach * 0.8)
		"earth_power":
			var lift := bump(u, 0.1, 0.6)
			for l in legs:
				if not l.front and l.sg < 0.0: l.lift = lift
			P.lean -= 0.2 * lift
			P.side += 0.1 * sz * lift
			P.sq += 0.3 * bump(u, 0.58, 0.85)
			P.eye = "angry"
			P.mouth = "wide"
			for i in 2: P.arm_up[i] += 1.2 * lift; P.arm_out[i] += 0.6 * lift
			if _ev("hit", 0.6):
				impact.emit(act)
				fx.emit("earth", global_position + global_transform.basis.z * act_reach)
		"roar":
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
			var cry := bump(u, 0.25, d - 0.15)
			P.lean -= 0.3 * cry
			P.hp = 0.55 * cry
			P.jaw = 1.0 * cry
			P.mouth = "wide"
			P.eye = "angry"
			P.y += sin(u * 70.0) * 0.006 * sz * cry
			P.earf -= 0.6 * k
			for i in 2: P.arm_up[i] += 1.0 * cry; P.arm_out[i] += 1.0 * cry; P.elbow[i] += 0.6 * cry
			P.tp += 0.4 * k
			if _ev("r", 0.3): fx.emit("roar", point("mouth"))
		"thrash":
			# a rampage: lurching forward, swinging the arms and tail side to side
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
			var sw := sin(u * TAU * 2.2)
			P.fwd += act_reach * 0.5 * sin(clampf(u / d, 0.0, 1.0) * PI)
			P.twist += 0.6 * sw * k
			P.roll += 0.15 * sw * k
			P.ty -= 1.2 * sw * k
			P.lean += 0.25 * k
			P.eye = "angry"
			P.mouth = "wide"
			P.jaw = 0.6 * k
			for i in 2:
				P.arm_up[i] += (1.2 + 0.8 * sw * (1.0 if i == 0 else -1.0)) * k
				P.arm_out[i] += 0.6 * k
			for n in 4:
				if _ev("h%d" % n, 0.45 + n * 0.45):
					impact.emit(act)
					fx.emit("hit", point("hand_l" if n % 2 == 0 else "hand_r"))
		"megahorn":
			var load := bump(u, 0.0, 0.55)
			var go := sm(0.5, 0.75, u) * (1.0 - sm(1.0, d - 0.05, u))
			P.crouch += 0.5 * load + 0.3 * go
			P.lean += 0.15 * load + 0.5 * go
			P.hp = -0.6 * (load + go)
			P.fwd += act_reach * 0.9 * go - 0.1 * sz * load
			P.earf -= 1.0 * (load + go)
			P.eye = "angry"
			P.quad = go
			if _ev("g", 0.3): fx.emit("glow", point("horn"))
			if _ev("hit", 0.75):
				impact.emit(act)
				fx.emit("horn", point("horn"))
		_:
			return false
	return true
