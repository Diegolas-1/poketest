class_name CreatureJigglypuff
extends CreatureRig
# Jigglypuff: a ball. Rig: Waist (all of it) - L/RThigh - Foot - Toe (the stubs),
# L/RArm - Hand, L/REar, Hair1 - Hair2 (the curl). It gets about in little bounces (both
# stubs together, the ball squashing as it lands and stretching as it leaves the
# ground), sways as it sings, and puffs itself up big when it is cross (the "puffed"
# face: the eyes narrowed under a frown, the cheeks out, the mouth in a pout).
# Moods (besides CreatureRig's): puff_up (blown up big, a moment), pout (the cross face,
# puffed), and the battle acts sing (fx("note") each beat), pound, double_slap, rollout
# (it rolls at the target, spinning), defense_curl, body_slam, rest (straight to sleep),
# tackle. The "angry" face is the puffed one.
# Points: "mouth", "hand_l", "hand_r", "curl".

var puff_s := Vector2(1.0, 0.0)
var roll_a := 0.0
var HAIR := PackedInt32Array()
var hair_s := Vector2.ZERO
var _hop := 0.0

func _rig_ready() -> void:
	durs.merge({"puff_up": 1.8, "pout": 2.2, "rollout": 2.2, "body_slam": 1.5, "rest": 1.0}, true)
	HAIR = _chain("Hair1")

func point(n: String) -> Vector3:
	if n == "curl" and not HAIR.is_empty(): return to_world(G[HAIR[HAIR.size() - 1]].origin)
	if n == "mouth": return to_world(G[W] * (rest_g[W].affine_inverse() * Vector3(0, sz * 0.75, sz * 1.0)))
	if n == "head": return to_world(G[W].origin + Vector3(0, sz * 0.3, 0))
	return super.point(n)

func mood(what: String) -> void:
	if what == "rest":
		super.mood("rest")
		sleep = true
		return
	super.mood(what)

func _base_species(P: Dictionary, dt: float, v: float) -> void:
	P.merge({"puff": 0.0, "roll": 0.0}, true)
	if emote == "angry" or battle_w > 0.5: P.eye = "extra" if emote == "angry" else P.eye

# about in bounces: the hop's height from the gait phase (two hops a cycle)
func _gait(dt: float, v: float, P: Dictionary) -> void:
	super._gait(dt, v, P)
	var ph := fposmod(phase * 2.0, 1.0)
	var w := walk_w
	var air := sm(0.0, 0.12, ph) * (1.0 - sm(0.75, 0.9, ph))
	P.y += 0.35 * sz * sin(clampf(ph / 0.9, 0.0, 1.0) * PI) * w
	P.sq += (0.25 * (1.0 - air) - 0.12 * air) * w
	P.pitch += 0.1 * w
	P.roll += sin(phase * PI) * 0.08 * w
	for i in 2: P.arm_up[i] += 0.8 * air * w

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
	match act:
		"puff_up", "pout", "angry":
			var k := sm(0.0, 0.25, u) * sm(d, d - 0.35, u)
			P.puff = (0.45 if act != "pout" else 0.3) * k * (1.0 + 0.06 * sin(u * 20.0))
			P.eye = "extra" if k > 0.3 else ""
			P.mouth = "pout" if k > 0.3 else ""
			P.y += 0.12 * sz * bump(u, 0.0, 0.35)
			P.air = 1.0 if bump(u, 0.0, 0.35) > 0.4 else 0.0
			P.legs = "tuck"
			for i in 2: P.arm_up[i] += 0.9 * k; P.arm_out[i] += 0.5 * k
			P.ht = 0.15 * sin(u * 4.0) * k
			if act == "pout": P.hy = 0.6 * k
			if _ev("p", 0.2): fx.emit("puff", point("head"))
		"rollout":
			# curled into a ball and rolling at the target, then back
			var go := sm(0.1, 0.5, u) * (1.0 - sm(1.2, d - 0.1, u))
			P.fwd += act_reach * go
			P.roll = TAU * 2.0 * sm(0.1, d - 0.1, u)
			P.crouch += 0.5 * env
			P.air = 1.0 if env > 0.3 else 0.0
			P.legs = "tuck"
			P.eye = "squeeze"
			for i in 2: P.arm_in[i] += 1.2 * env; P.elbow[i] += 1.0 * env
			if _ev("hit", 0.5):
				impact.emit(act)
				fx.emit("hit", point("head"))
			for n in 5:
				if _ev("d%d" % n, 0.2 + n * 0.35): fx.emit("dust", global_position)
		"body_slam":
			var air := sm(0.25, 0.3, u) * (1.0 - sm(0.9, 0.95, u))
			var e := sm(0.25, 0.92, u)
			P.crouch += 0.8 * bump(u, 0.0, 0.3)
			P.y += 1.4 * sz * sin(e * PI) * air
			P.fwd += act_reach * 0.8 * e * (1.0 - sm(1.1, d, u))
			P.sq += -0.25 * air * sin(e * PI) + 0.5 * bump(u, 0.92, 1.25)
			P.air = 1.0 if air > 0.5 else 0.0
			P.legs = "tuck"
			P.puff = 0.25 * air
			P.eye = "extra"
			for i in 2: P.arm_up[i] += 2.0 * air
			if _ev("hit", 0.93):
				impact.emit(act)
				fx.emit("quake", global_position)
		"rest":
			P.eye = "closed"
		_:
			return false
	return true

func _body(P: Dictionary, dt: float) -> void:
	super._body(P, dt)
	# the puff: the whole ball blown up (its waist is all of it); the roll about its middle
	puff_s = spring(puff_s, 1.0 + float(P.puff), 14.0, dt, 0.45)
	var s := puff_s.x
	var q := clampf(sq.x, -0.4, 0.4)
	skel.set_bone_pose_scale(W, Vector3(s * (1.0 + q * 0.5), s * (1.0 - q), s * (1.0 + q * 0.5)))
	var r := float(P.roll)
	if absf(r) > 0.001:
		var B: Basis = _tg[W]
		var c := _Tw.origin + Vector3(0, sz * 0.4, 0)
		var R := Basis(Vector3.RIGHT, r)
		set_global(W, R * B)
		var wp := c + R * (_Tw.origin - c)
		set_local_pos(W, rest_g[parent[W]].affine_inverse() * wp)

func _after(P: Dictionary, dt: float) -> void:
	# the curl on its head springs with every bounce
	hair_s = spring(hair_s, -body_y.y * 0.02 - sq.y * 0.05, 12.0, dt, 0.35)
	for k in HAIR.size(): turn_rest(HAIR[k], Vector3.RIGHT, hair_s.x * (0.6 + 0.4 * k))
