class_name CreatureSquirtle
extends CreatureRig
# Squirtle, Wartortle and Blastoise, upright in their shells. Rig: Waist (the shell and
# body: Head, the arms and legs and Tail1 .. hang straight off it; Blastoise's Neck -
# Head) - Head (Jaw; Wartortle's L/REar1 - Ear2, the feathery ears) - L/RArm - ForeArm -
# Hand - Fingers, L/RThigh - Leg - Foot - Toe; Blastoise's cannons L/RFeelerA - B - C
# (their own mesh "cannons", slid back into the shell until it fires them).
# Withdraw is its signature: the head, arms, legs and tail drawn into the shell (each
# shrunk back to its socket), the shell dropping to the ground; it can spin in it
# (rapid_spin), or slide at the target. Wartortle's ears and tail sway like feathers.
# Moods (besides CreatureRig's): withdraw (in its shell a while), water_gun (cheeks
# puffed, a jet from the mouth: fx("water") each spurt), bubble / bubble_beam (a stream
# of bubbles: fx("bubble")), hydro_pump (Blastoise: the cannons slid out, braced, the
# jets: fx("hydro") at point("cannon_l") / ("cannon_r"); the others from the mouth),
# water_pulse (fx("water_pulse")), rapid_spin, skull_bash (head in, then a ram), bite,
# tackle, tail_whip, protect / iron_defense / shell_smash, rain_dance (a little dance,
# fx("rain")), aqua_tail (the tail swung round: fx("water")), headbutt.
# Points: "mouth", "head", "tail", "hand_l", "hand_r", "cannon_l", "cannon_r".

var shell_s := Vector2.ZERO
var tuck_bones := []              # [bone, rest local position] drawn in by withdraw
var cannons := []                 # Blastoise: per side [FeelerA, FeelerC (the muzzle), sg]
var cannon_s := Vector2.ZERO
var cannon_mesh: MeshInstance3D
var spin_a := 0.0

func _rig_ready() -> void:
	durs.merge({"withdraw": 2.4, "water_gun": 1.6, "bubble": 1.8, "bubble_beam": 2.0, "hydro_pump": 2.6, "water_pulse": 1.6,
		"rapid_spin": 1.8, "skull_bash": 2.0, "protect": 1.6, "iron_defense": 1.8, "shell_smash": 1.8, "rain_dance": 2.4,
		"aqua_tail": 1.4, "headbutt": 1.2, "aqua_jet": 1.2, "flash_cannon": 2.0}, true)
	for nm in ["Head", "LArm", "RArm", "LThigh", "RThigh", "Tail1"]:
		var bi := b(nm)
		if nm == "Head" and b("Neck") >= 0: bi = b("Neck")
		if bi >= 0: tuck_bones.append([bi, rest_l[bi].origin])
	for s in [["L", 1.0], ["R", -1.0]]:
		if b(s[0] + "FeelerA") >= 0 and b(s[0] + "FeelerC") >= 0:
			cannons.append([b(s[0] + "FeelerA"), b(s[0] + "FeelerC"), s[1]])
	for m3 in meshes:
		if String(m3.name).ends_with("_cannons"): cannon_mesh = m3

func point(n: String) -> Vector3:
	match n:
		"cannon_l", "cannon_r":
			for c in cannons:
				if (c[2] > 0.0) == (n == "cannon_l"):
					var g: Transform3D = G[c[1]]
					return to_world(g.origin + (G[c[1]].origin - G[c[0]].origin).normalized() * sz * 0.35)
	return super.point(n)

func _base_species(P: Dictionary, _dt: float, _v: float) -> void:
	P.merge({"shell": 0.0, "spin": 0.0, "cannon": 0.0, "puff": 0.0}, true)

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.3, u)
	match act:
		"withdraw", "protect", "iron_defense", "shell_smash":
			var k := sm(0.0, 0.25, u) * sm(d, d - 0.35, u)
			P.shell = k
			P.eye = "squeeze"
			if act != "withdraw" and _ev("g", 0.5): fx.emit("glow" if act != "protect" else "shield", point("chest"))
			if act == "shell_smash" and _ev("s", d - 0.4): fx.emit("shards", point("chest"))
		"rapid_spin":
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.shell = k
			P.spin = TAU * 4.0 * sm(0.2, d - 0.2, u)
			P.fwd += act_reach * 0.6 * sin(clampf(u / d, 0.0, 1.0) * PI)
			if _ev("hit", 0.9):
				impact.emit(act)
				fx.emit("hit", global_position + global_transform.basis.z * act_reach * 0.6)
			for n in 4:
				if _ev("d%d" % n, 0.3 + n * 0.3): fx.emit("dust", global_position)
		"skull_bash", "headbutt":
			# (skull bash) head drawn in a moment to gather, then the charge head first
			var gather := bump(u, 0.0, 0.9) if act == "skull_bash" else 0.0
			P.shell = 0.6 * gather
			var c0 := 0.9 if act == "skull_bash" else 0.3
			var e := clampf((u - c0) / (d - c0), 0.0, 1.0)
			var go := sm(0.0, 0.35, e) * (1.0 - sm(0.6, 1.0, e))
			P.fwd += act_reach * go
			P.lean += 0.5 * go
			P.hp = -0.4 * go
			P.eye = "angry"
			P.quad = go
			if _ev("hit", c0 + (d - c0) * 0.35):
				impact.emit(act)
				fx.emit("hit", point("head"))
		"water_gun", "bubble", "bubble_beam", "water_pulse":
			# the cheeks puffed (a breath in), then the jet or the bubbles from the mouth
			var load := bump(u, 0.0, 0.55)
			var blow := sm(0.45, 0.55, u) * sm(d, d - 0.3, u)
			P.puff = load
			P.lean += -0.2 * load + 0.2 * blow
			P.hp = 0.3 * load - 0.1 * blow
			P.hfwd += 0.1 * sz * blow
			P.jaw = 0.25 * blow if act == "water_gun" else 0.5 * blow
			P.mouth = "pout" if act == "water_gun" else "open"
			P.eye = "angry" if act != "bubble" else "open"
			var what: String = {"water_gun": "water", "bubble": "bubble", "bubble_beam": "bubble", "water_pulse": "water_pulse"}[act]
			var nb := 3 if act == "water_pulse" else 7
			for k in nb:
				if _ev("w%d" % k, 0.55 + k * (d - 0.85) / nb): fx.emit(what, point("mouth"))
			if _ev("hit", 0.7): impact.emit(act)
		"hydro_pump", "flash_cannon":
			if cannons.is_empty():
				act = "water_gun"
				var r := _act_species(P, dt, u, d)
				act = "hydro_pump"
				return r
			# the cannons slide out, it braces (crouched, a foot back), the jets, the recoil
			var out := sm(0.0, 0.4, u) * (1.0 - sm(d - 0.4, d - 0.05, u))
			var fire := sm(0.6, 0.7, u) * sm(d - 0.45, d - 0.6, u)
			P.cannon = out
			P.crouch += 0.45 * out
			P.lean += 0.25 * out - 0.1 * fire
			P.fwd -= 0.08 * sz * fire + sin(u * 50.0) * 0.01 * sz * fire
			P.eye = "angry"
			P.mouth = "frown"
			for i in 2: P.arm_up[i] += 0.3 * out; P.elbow[i] += 0.8 * out
			for k in 10:
				if _ev("h%d" % k, 0.65 + k * 0.13):
					fx.emit("hydro" if act == "hydro_pump" else "beam", point("cannon_l"))
					fx.emit("hydro" if act == "hydro_pump" else "beam", point("cannon_r"))
			if _ev("hit", 0.75): impact.emit(act)
		"aqua_tail":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
			var sw := bump(u, 0.2, 0.8)
			P.spin = TAU * sm(0.2, 0.8, u)
			P.tp += 0.8 * k
			P.ty += 1.5 * sw
			P.eye = "angry"
			if _ev("w", 0.4): fx.emit("water", point("tail"))
			if _ev("hit", 0.55):
				impact.emit(act)
				fx.emit("hit", point("tail"))
		"aqua_jet":
			_strike(P, dt, u, d, 0.5, true)
			P.lean += 0.4 * env
			if _ev("w", 0.3): fx.emit("water", point("chest"))
		"rain_dance":
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.4, u)
			var beat := u * 2.0
			P.roll += sin(beat * PI) * 0.2 * k
			P.y += absf(sin(beat * PI)) * 0.15 * sz * k
			P.air = 1.0 if absf(sin(beat * PI)) * k > 0.7 else 0.0
			P.legs = "tuck"
			P.eye = "happy"
			P.mouth = "smile"
			P.hp = 0.4 * k
			for i in 2: P.arm_up[i] += (2.2 + 0.4 * sin(beat * PI + i * PI)) * k
			if _ev("r", 0.6): fx.emit("rain", point("head"))
		_:
			return false
	return true

func _body(P: Dictionary, dt: float) -> void:
	# in the shell: it sits down on it (the body lower, level)
	shell_s = spring(shell_s, float(P.shell), 16.0, dt, 0.7)
	var sh := clampf(shell_s.x, 0.0, 1.0)
	if sh > 0.001:
		P.crouch = lerpf(float(P.crouch), float(I.get("shell_crouch", 1.6)), sh)
		P.lean = lerpf(float(P.lean), 0.0, sh)
		P.air = maxf(float(P.air), sh)
		P.legs = "tuck"
	super._body(P, dt)
	var sp := float(P.spin)
	if absf(sp) > 0.001:
		var B: Basis = _tg[W]
		set_global(W, Basis(Vector3.UP, sp) * B)
		_Tw = Transform3D(Basis(Vector3.UP, sp) * B, _Tw.origin)

func _after(P: Dictionary, dt: float) -> void:
	# withdraw: each limb shrunk to nothing and drawn in toward the shell's middle
	var sh := clampf(shell_s.x, 0.0, 1.0)
	var mid := rest_at(W) + Vector3(0, sz * 0.3, 0)
	for tb in tuck_bones:
		var bi: int = tb[0]
		var k := sh * (0.85 if bi == HEAD or bi == b("Neck") else 1.0)
		skel.set_bone_pose_scale(bi, Vector3.ONE * maxf(0.02, 1.0 - 0.97 * k))
		if k > 0.001:
			var pr := rest_g[parent[bi]]
			var mid_l := pr.affine_inverse() * mid
			set_local_pos(bi, (tb[1] as Vector3).lerp(mid_l, 0.45 * k))
	# the cheeks puffed (water gun's breath in): the head a touch rounder
	if HEAD >= 0 and sh < 0.01:
		var pf := float(P.puff)
		skel.set_bone_pose_scale(HEAD, Vector3(1.0 + 0.08 * pf, 1.0 + 0.03 * pf, 1.0 + 0.05 * pf))
	# Blastoise's cannons: slid back into the shell, out to fire
	cannon_s = spring(cannon_s, float(P.cannon), 12.0, dt, 0.7)
	var c := clampf(cannon_s.x, 0.0, 1.0)
	if cannon_mesh: cannon_mesh.visible = c > 0.03
	var back := float(I.get("cannon_in", 0.6))
	for cn in cannons:
		var bi: int = cn[0]
		var dir := (rest_at(cn[1]) - rest_at(bi)).normalized()
		set_local_pos(bi, rest_l[bi].origin - rest_g[parent[bi]].basis.inverse() * dir * back * sz * (1.0 - c))
