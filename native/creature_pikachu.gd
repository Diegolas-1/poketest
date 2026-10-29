class_name CreaturePikachu
extends CreatureRig
# Pikachu and Raichu (as the anime has them). Rig: Waist - Hips - L/RThigh - Leg -
# Foot - Toe, Tail1 .. (Pikachu's three, Raichu's nine: the long cord to the bolt);
# Spine1 - Spine2 - Head (L/REar1 - Ear2 - Ear3), L/RShoulder - Arm - ForeArm - Hand.
# The cheeks are their own meshes (Pikachu's "BodyB1", Raichu's "BodyBInc"): they
# light up when it sparks. It stands on its hind legs, the little arms held in front,
# and drops to all fours to run (gait.quad_run), ears laid back, the tail up.
#
# Never still: the ears flick and swivel on their own, the tail sways and wags, the
# head tilts at what it sees, the cheeks crackle now and then.
# Moods (besides CreatureRig's): ear_flick, head_tilt (a curious "pika?"), cheek_spark,
# tail_wag, and the battle acts thunder_shock / thundershock, thunderbolt, thunder (the
# charge, then the bolt: fx("charge") at the cheeks while it builds, fx("bolt") at
# spark_point() each crackle of the release, impact at the first), quick_attack (on all
# fours), iron_tail (a flip, the tail brought down: fx("glint") then impact), double_team
# (side to side too fast to follow: fx("afterimage") each dodge), agility (a zigzag
# dash), tail_whip, growl, tackle, hurt, flinch, faint, flee, taunt.
# Points: "cheek_l", "cheek_r", "spark" (spark_point(): between the cheeks, a little
# ahead), "tail" (the tip), "mouth", "head".

var cheek_mat: ShaderMaterial
var cheek := Vector3(0.07, 0.28, 0.08)   # rest (skeleton space), the left one
var glow_s := Vector2.ZERO
var _crackle := 6.0
var flip := 0.0

func _rig_ready() -> void:
	durs.merge({"ear_flick": 1.0, "head_tilt": 1.6, "cheek_spark": 1.2, "tail_wag": 1.6, "thunder_shock": 1.9,
		"thundershock": 1.9, "thunderbolt": 2.4, "thunder": 2.9, "iron_tail": 1.5, "double_team": 1.4, "agility": 1.4}, true)
	var c: Array = I.get("cheek", [])
	if c.size() == 3: cheek = Vector3(float(c[0]), float(c[1]), float(c[2]))
	for m in mat_by:
		if String(m).ends_with("_bodyb1") or String(m).ends_with("_bodybinc"): cheek_mat = mat_by[m]

func point(n: String) -> Vector3:
	match n:
		"cheek_l", "cheek_r":
			var p := cheek if n == "cheek_l" else Vector3(-cheek.x, cheek.y, cheek.z)
			return to_world(G[HEAD] * (rest_g[HEAD].affine_inverse() * p))
		"spark":
			return spark_point()
		"nose":
			return to_world(G[HEAD] * (rest_g[HEAD].affine_inverse() * Vector3(0, cheek.y, cheek.z * 1.35)))
	return super.point(n)

# where Thunder Shock leaves it: between the cheeks, a little in front of the face
func spark_point() -> Vector3:
	var l := point("cheek_l")
	var r := point("cheek_r")
	var f := (to_world(G[HEAD].origin + G[HEAD].basis.z.normalized() * 0.01) - to_world(G[HEAD].origin)).normalized()
	return (l + r) * 0.5 + f * sz * 0.3

func _base_species(P: Dictionary, dt: float, v: float) -> void:
	P.merge({"glow": 0.0}, true)
	# the cheeks crackle now and then on their own
	_crackle -= dt
	if _crackle <= 0.0:
		_crackle = rng.randf_range(4.0, 11.0)
		if act == "" and not sleep and not fainted and v < 0.3:
			fx.emit("spark", point("cheek_l" if rng.randf() < 0.5 else "cheek_r"))
			glow_s.y += 8.0
	if battle_w > 0.3: P.glow += 0.25 * battle_w * (0.5 + 0.5 * sin(t * 9.0))

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.12, u) * sm(d, d - 0.2, u)
	match act:
		"ear_flick":
			var side := 1.0 if int(t * 7.0) % 2 == 0 else -1.0
			if _ev("a", 0.05): _ear_kick[0 if side > 0.0 else 1] = 1.0
			if _ev("b", 0.35): _ear_kick[0 if side > 0.0 else 1] = 0.8
			if _ev("c", 0.6): _ear_kick[1 if side > 0.0 else 0] = 0.9
			P.ht = 0.1 * env * side
			P.earf += 0.3 * env
		"head_tilt":
			var k := sm(0.0, 0.25, u) * sm(d, d - 0.35, u)
			var side := 1.0 if fposmod(t, 2.0) < 1.0 else -1.0
			P.ht = 0.45 * k * side
			P.hp = 0.12 * k
			P.ear_l += (0.5 if side > 0 else -0.2) * k
			P.ear_r += (-0.2 if side > 0 else 0.5) * k
			P.earo += 0.1 * k
			P.mouth = "open" if k > 0.5 and u < 0.9 else ""
			P.lean -= 0.05 * k
			for i in 2: P.arm_up[i] += 0.25 * k; P.elbow[i] += 0.5 * k
			if _ev("t", 0.3): fx.emit("voice", point("mouth"))
		"cheek_spark":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.3, u)
			P.eye = "squeeze" if fposmod(u * 5.0, 1.0) < 0.5 and k > 0.4 else "angry"
			P.mouth = "smile"
			P.earf += 0.5 * k
			P.glow += 0.8 * k * (0.6 + 0.4 * sin(u * 50.0))
			P.crouch += 0.15 * k
			P.y += sin(u * 70.0) * 0.006 * sz * k
			for n in 4:
				if _ev("s%d" % n, 0.15 + n * 0.22): fx.emit("spark", point("cheek_l" if n % 2 == 0 else "cheek_r"))
		"tail_wag":
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
			P.wag = 1.4 * k
			P.wagf = 11.0
			P.tp += 0.35 * k
			P.hy = 0.6 * k
			P.ht = 0.15 * k
			P.eye = "happy" if k > 0.6 else ""
			P.mouth = "smile"
			P.twist += sin(u * 11.0) * 0.08 * k
		"thunder_shock", "thundershock", "thunderbolt", "thunder":
			_thunder(P, dt, u, d)
		"iron_tail":
			# a hop and a front flip: the tail, shining, swung over and down on the target
			var cr := bump(u, 0.0, 0.3)
			P.crouch += 0.8 * cr
			P.sq += 0.3 * cr
			var air := sm(0.25, 0.3, u) * (1.0 - sm(1.15, 1.2, u))
			var e := sm(0.3, 1.1, u)
			P.y += 0.9 * sz * sin(clampf((u - 0.25) / 0.95, 0.0, 1.0) * PI)
			P.fwd += 0.5 * act_reach * e - 0.2 * act_reach * sm(1.15, d, u)
			flip = TAU * e
			P.air = 1.0 if air > 0.5 else 0.0
			P.legs = "tuck"
			P.tp += 1.2 * bump(u, 0.3, 0.8) - 0.8 * bump(u, 0.7, 1.1)
			P.eye = "angry"
			P.mouth = "frown"
			for i in 2: P.arm_up[i] += 1.0 * air; P.elbow[i] += 0.8 * air
			if _ev("g", 0.35): fx.emit("glint", point("tail"))
			if _ev("hit", 0.95):
				impact.emit(act)
				fx.emit("hit", point("tail"))
		"double_team", "agility":
			var k := sm(0.0, 0.1, u) * sm(d, d - 0.15, u)
			var zig := sin(u * TAU * (3.0 if act == "double_team" else 2.0))
			P.side += zig * (0.9 if act == "double_team" else 0.6) * sz * k
			P.fwd += (0.0 if act == "double_team" else 0.35 * act_reach * sin(u / d * PI))
			P.crouch += 0.4 * k
			P.lean += 0.25 * k
			P.quad = 1.0 if act == "agility" else 0.0
			P.roll += zig * 0.2 * k
			P.earf -= 0.6 * k
			P.eye = "angry"
			streak = k > 0.5
			for n in 6:
				if _ev("a%d" % n, 0.1 + n * d / 6.5): fx.emit("afterimage", global_position + global_transform.basis.x * zig * 0.9 * sz)
		_:
			return false
	return true

# the electric attacks: a charge (crouched, the cheeks crackling and lit, the eyes
# screwed shut, the ears up), then the release: thrown up and back, arms out, the
# mouth wide in a cry, bolts flying from the spark point. thunder: a leap first, the
# bolt from the sky (fx("thunder") at its spot)
func _thunder(P: Dictionary, _dt: float, u: float, d: float) -> void:
	var big := 2.0 if act == "thunder" else (1.4 if act == "thunderbolt" else 1.0)
	var c1 := 0.55 * d / 1.9 * (1.0 if big < 1.5 else 1.15)
	var charge := sm(0.0, 0.25, u) * (1.0 - sm(c1, c1 + 0.08, u))
	var rel := sm(c1, c1 + 0.08, u) * sm(d, d - 0.35, u)
	P.crouch += 0.55 * charge - 0.25 * rel
	P.sq += 0.2 * charge - 0.15 * rel
	P.lean += 0.2 * charge - 0.45 * rel
	P.hp = -0.2 * charge + 0.4 * rel
	P.earf += 0.6 * charge + 0.3 * rel
	P.tp += 0.15 * charge + 0.3 * rel
	P.wag = 0.6 * rel
	P.wagf = 25.0
	P.eye = "squeeze" if charge > 0.3 or rel > 0.3 else "angry"
	P.mouth = "wide" if rel > 0.3 else "frown"
	P.glow += charge * (0.5 + 0.5 * sin(u * 45.0)) + rel * (0.8 + 0.2 * sin(u * 60.0))
	P.y += sin(u * 80.0) * 0.008 * sz * (charge + rel)
	for i in 2:
		P.arm_up[i] += 0.5 * charge + 1.6 * rel
		P.arm_out[i] += 0.9 * rel
		P.elbow[i] += 0.9 * charge - 0.5 * rel
	if act == "thunder":
		var j := bump(u, c1 - 0.05, c1 + 0.7)
		P.y += 0.6 * sz * j
		P.air = 1.0 if j > 0.2 else P.air
		P.legs = "tuck"
	for n in 4:
		if _ev("c%d" % n, 0.12 + n * c1 / 4.5): fx.emit("charge", point("cheek_l" if n % 2 == 0 else "cheek_r"))
	var nb := int(3 * big)
	for n in nb:
		var at := c1 + 0.05 + n * (d - c1 - 0.4) / nb
		if _ev("b%d" % n, at):
			fx.emit("bolt", spark_point())
			if n == 0:
				impact.emit(act)
				if act == "thunder": fx.emit("thunder", global_position + global_transform.basis.z * act_reach)

func _body(P: Dictionary, dt: float) -> void:
	super._body(P, dt)
	if act == "iron_tail" and absf(flip) > 0.001:
		# the flip, about the hips' side axis (on top of the body's pose)
		var B: Basis = _tg[W]
		var piv := _Tw.origin + Vector3(0, sz * 0.3, 0)
		var R := Basis(Vector3.RIGHT, flip)
		set_global(W, R * B)
		var wp := piv + R * (_Tw.origin - piv)
		set_local_pos(W, rest_g[parent[W]].affine_inverse() * wp)
		_Tw = Transform3D(R * B, wp)
	elif act != "iron_tail":
		flip = 0.0

func _after(P: Dictionary, dt: float) -> void:
	glow_s = spring(glow_s, clampf(float(P.glow), 0.0, 1.2), 30.0, dt, 0.5)
	if cheek_mat:
		var g := clampf(glow_s.x, 0.0, 1.5)
		cheek_mat.set_shader_parameter("lit_add", Vector3(0.02, 0.02, 0.01) + Vector3(0.55, 0.45, 0.05) * g)
		cheek_mat.set_shader_parameter("lit", Vector3(1.05, 1.04, 1.0) + Vector3(0.4, 0.35, 0.0) * g)
