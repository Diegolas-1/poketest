class_name CreatureSandshrew
extends CreatureRig
# Sandshrew and Sandslash, up on their hind legs, the clawed arms ready. Rig: Waist -
# Hips - L/RThigh - Leg - Foot - Toe, Tail1 ..; Spine(1 - 2) - Head (L/REar), L/R(Shoulder
# -) Arm - ForeArm - Hand - FingerA .. C (the claws); Sandslash's spines are Feeler
# bones on its back. Sandshrew's rolled-up shape is its own mesh (bakes as "roll", on
# the Feeler bone at its middle): curling up, the body tucks and then the ball takes
# its place, rolling over the ground (turned about its middle as it goes, no slip).
# Sandslash has no ball: it curls tight and the curled body itself rolls.
# Moods (besides CreatureRig's): dig_idle (a scratch at the ground), defense_curl
# (curled up a while), roll (a roll out and back), rollout (rolls at the target:
# impact, fx("dust") as it goes), dig / emerge, and the battle acts scratch_attack,
# slash (fx("slash")), fury_swipes (a flurry, an impact each), sand_attack (sand
# flung with the claws: fx("sand")), poison_sting (Sandslash's spines), tackle.
# Points: "hand_l", "hand_r" (the claws), "mouth", "head".

var roll_mesh: MeshInstance3D
var body_meshes: Array[MeshInstance3D] = []
var BALL := -1
var ball_r := 0.2
var roll_a := 0.0
var rolled := false
var spines := []                  # Sandslash: [bone, axis] each spike on its back
var bristle_s := Vector2.ZERO

func _rig_ready() -> void:
	durs.merge({"dig_idle": 1.6, "defense_curl": 2.0, "roll": 2.2, "rollout": 2.6, "slash": 1.0, "fury_swipes": 1.8, "sand_attack": 1.5}, true)
	for m3 in meshes:
		if String(m3.name).ends_with("_roll"): roll_mesh = m3
		else: body_meshes.append(m3)
	BALL = b("Feeler") if roll_mesh else -1
	ball_r = float(I.get("ball_r", sz * 0.78))
	_show_ball(false)
	if roll_mesh == null:
		# each spike stands up (out from the body's middle, about its own side axis)
		var mid := rest_at(W) + Vector3(0, sz * 0.25, 0)
		for i in skel.get_bone_count():
			var nm := skel.get_bone_name(i)
			if nm.contains("Feeler") and not nm.begins_with("End"):
				var out := (rest_at(i) - mid)
				var k := _kids(i)
				var d := (rest_at(k[0]) - rest_at(i)).normalized() if not k.is_empty() else out.normalized()
				var ax := d.cross(out.normalized())
				if ax.length() < 0.1: ax = d.cross(Vector3.UP)
				spines.append([i, ax.normalized(), rng.randf() * TAU])

func _show_ball(on: bool) -> void:
	rolled = on
	if roll_mesh: roll_mesh.visible = on
	for m3 in body_meshes: m3.visible = not on or roll_mesh == null

# how far into the curl it is now (0 standing .. 1 a ball), and the rolling it does
func _curl_amount(u: float, d: float) -> float:
	match act:
		"defense_curl": return sm(0.0, 0.35, u) * (1.0 - sm(d - 0.4, d - 0.05, u))
		"roll", "rollout": return sm(0.0, 0.3, u) * (1.0 - sm(d - 0.35, d - 0.05, u))
	return 0.0

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
	match act:
		"defense_curl", "roll", "rollout":
			var c := _curl_amount(u, d)
			P.crouch += 1.0 * c
			P.lean += 0.9 * c
			P.hp = -0.8 * c
			P.curl = c
			P.lie = 0.4 * c
			P.eye = "squeeze"
			P.earf -= 0.8 * c
			for i in 2: P.arm_up[i] += 0.8 * c; P.arm_in[i] += 1.2 * c; P.elbow[i] += 1.2 * c
			P.ball = c
			if act != "defense_curl":
				var go := sm(0.35, 0.8, u) * (1.0 - sm(d - 0.8, d - 0.35, u))
				var R := act_reach * (1.0 if act == "rollout" else 0.6)
				P.fwd += R * go
				P.ballroll = R * go
				if _ev("hit", 0.8) and act == "rollout":
					impact.emit(act)
					fx.emit("hit", global_position + global_transform.basis.z * R)
				for n in 6:
					if _ev("d%d" % n, 0.35 + n * 0.2): fx.emit("dust", to_world(_Tw.origin))
			elif _ev("g", 0.4):
				fx.emit("glow", point("chest"))
		"dig_idle":
			# a few scratches at the ground in front, a look at what turned up
			var k := sm(0.0, 0.25, u) * sm(d, d - 0.35, u)
			P.lean += 0.45 * k
			P.crouch += 0.35 * k
			P.hp = -0.35 * k
			var s := sin(u * TAU * 4.0)
			for i in 2:
				P.arm_up[i] += (0.1 + 0.4 * s * (1.0 if i == 0 else -1.0)) * k
				P.elbow[i] += 0.4 * k
			if _ev("d", 0.6): fx.emit("dust", point("hand_l"))
		"slash", "fury_swipes":
			# claws up and raked down across, one arm then the other
			var n := 1 if act == "slash" else 4
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.2, u)
			P.fwd += 0.35 * act_reach * k
			P.lean += 0.2 * k
			P.eye = "angry"
			P.mouth = "frown"
			for m in n:
				var at := 0.4 if n == 1 else 0.35 + m * 0.3
				var wind := bump(u, at - 0.25, at)
				var hit := bump(u, at - 0.04, at + 0.18)
				var j := m % 2
				P.arm_up[j] += 2.2 * wind + 0.3 * hit
				P.arm_out[j] += 0.7 * wind
				P.arm_in[j] += 1.2 * hit
				P.twist += (0.4 * wind - 0.5 * hit) * (1.0 if j == 0 else -1.0)
				if _ev("h%d" % m, at):
					impact.emit(act)
					fx.emit("slash", point("hand_l" if j == 0 else "hand_r"))
		"sand_attack":
			# down on its front, the claws flinging sand back between its legs at the target
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.lean += 0.6 * k
			P.crouch += 0.5 * k
			P.hp = -0.2 * k
			P.eye = "angry"
			var s := sin(u * TAU * 3.5)
			for i in 2:
				P.arm_up[i] += (0.2 + 0.7 * s * (1.0 if i == 0 else -1.0)) * k
				P.arm_out[i] += 0.3 * k
			for n in 5:
				if _ev("s%d" % n, 0.3 + n * 0.2): fx.emit("sand", point("hand_l" if n % 2 == 0 else "hand_r"))
			if _ev("hit", 0.5): impact.emit(act)
		_:
			return false
	return true

func _base_species(P: Dictionary, _dt: float, _v: float) -> void:
	P.merge({"ball": 0.0, "ballroll": 0.0}, true)

func _after(P: Dictionary, dt: float) -> void:
	# Sandslash's spikes: a little raised always, bristling when it fights or curls up,
	# shivering when it is hit
	if not spines.is_empty():
		var br := 0.12 + 0.5 * battle_w + 0.6 * float(P.ball) + (0.7 if act in ["angry", "hurt", "flinch", "poison_sting", "startle"] else 0.0) * sm(0.0, 0.15, act_t)
		bristle_s = spring(bristle_s, br, 18.0, dt, 0.5)
		for sp in spines:
			var j := sin(t * 40.0 + float(sp[2])) * 0.04 * (1.0 if act in ["hurt", "flinch"] else 0.0)
			turn_rest(sp[0], sp[1], -(bristle_s.x * 0.45 + j))
	var c := float(P.ball)
	var want := c > 0.85
	if want != rolled: _show_ball(want and roll_mesh != null)
	var dist := float(P.ballroll)
	roll_a = dist / maxf(0.05, ball_r)
	if rolled and BALL >= 0:
		# the ball on the ground under where the body is, turned as it has rolled
		# (the ball's middle sits a little above the bone: ball_y lifts the bone so it touches)
		var at := Vector3(_Tw.origin.x, float(I.get("ball_y", ball_r)), _Tw.origin.z)
		_tg[BALL] = (Basis(Vector3.RIGHT, roll_a) * rest_g[BALL].basis).orthonormalized()
		set_local_pos(BALL, _Tw.affine_inverse() * at)
	elif roll_mesh == null and c > 0.5 and absf(roll_a) > 0.001:
		# Sandslash: the curled body itself rolls about its middle
		var B: Basis = _tg[W]
		var cen := _Tw.origin + Vector3(0, sz * 0.2, 0)
		var R := Basis(Vector3.RIGHT, roll_a)
		set_global(W, R * B)
		set_local_pos(W, rest_g[parent[W]].affine_inverse() * (cen + R * (_Tw.origin - cen)))
