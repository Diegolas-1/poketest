class_name CreatureFloat
extends CreatureRig
# The Pokémon that do not walk on their legs (species.json "family": "float", its "mode"):
#   hover   floating in the air (Koffing, Weezing, Magnemite, Magneton, Haunter, Porygon,
#           Mew, Staryu, Starmie, Tentacool, Tentacruel, Geodude low over the ground):
#           a slow bob and drift, leaning into where it goes, its loose parts trailing
#   flier   on wings (Zubat, Golbat, Butterfree, Venomoth, Beedrill): the wings beating
#           ("wings": the wing chains' first bones), the body bobbing against them
#   swim    a fish (Magikarp, Goldeen, Seaking, Horsea, Seadra, Shellder, Omanyte): the
#           body swims in the air at its height as if in water (the tail sweeping, the
#           fins sculling); "flop" on land (Magikarp: on its side, flopping)
#   still   a cocoon or a rock (Metapod, Kakuna, Cloyster): it sways, shivers, hardens
#   blob    a slime (Grimer, Muk, Ditto): it oozes, the body squashing and spreading
#   burrow  in the ground (Diglett, Dugtrio): bobbing up and down out of its hole
#   roll    a ball (Voltorb, Electrode): it rolls where it goes
# What moves of it: the whole body (the Waist, its root) set over its place, and its
# loose parts: every chain whose bone names begin with one of "wiggle"'s keys (Tail,
# Feeler, Hair, Tongue, Arm ..) swings on its own phase, delayed down its length.
# Acts: CreatureRig's (the body's part of them: the lunge, the hop, the lean, the face,
# the arms where it has them), and its moves as aliases of those (species.json "alias").

var mode := "hover"
var hover_h := 0.0                # how high it floats (m in its own size: sz units)
var wig := []                     # [{chain, k (amp), ph, sg}] the loose chains
var wing := []                    # [{chain, sg}] the wings (flier)
var flap := 0.0
var roll_a := 0.0
var _drift := Vector3.ZERO
var _drift_t := 0.0
var _flop := 0.0

func _rig_ready() -> void:
	mode = String(I.get("mode", "hover"))
	durs.merge({"harden": 1.6, "flop": 1.4, "splash": 1.4, "spin": 1.6, "pop": 1.4, "ooze": 2.0}, true)
	hover_h = float(I.get("hover", {"hover": 0.6, "flier": 1.2, "swim": 0.5, "still": 0.0, "blob": 0.0, "burrow": 0.0, "roll": 0.0}.get(mode, 0.0)))
	# no feet planted: its legs (if any) hang or kick free
	legs.clear()
	var wings_n: Array = I.get("wings", [])
	var used := {}
	for wn in wings_n:
		var bi := b(wn)
		if bi < 0: continue
		var ch := _chain(wn)
		wing.append({"chain": ch, "sg": 1.0 if String(wn).begins_with("L") else -1.0})
		for k in ch: used[k] = true
	var keys: Dictionary = I.get("wiggle", {"Tail": 0.5, "Feeler": 0.35, "Hair": 0.3, "Tongue": 0.4})
	for i in skel.get_bone_count():
		var nm := skel.get_bone_name(i)
		if nm.begins_with("End") or used.has(i): continue
		var pn := skel.get_bone_name(parent[i]) if parent[i] >= 0 else ""
		for k in keys:
			var base := nm.trim_prefix("L").trim_prefix("R")
			if not base.begins_with(String(k)): continue
			# a chain's root: its parent is not the same kind of bone
			var pb := pn.trim_prefix("L").trim_prefix("R")
			if pb.begins_with(String(k)) and pb.rstrip("0123456789") == base.rstrip("0123456789"): break
			var ch := _chain(nm)
			wig.append({"chain": ch, "k": float(keys[k]), "ph": rng.randf() * TAU, "sg": 1.0 if nm.begins_with("L") else (-1.0 if nm.begins_with("R") else 0.0)})
			for c in ch: used[c] = true
			break
	tails.clear()

func contacts() -> Array: return []

func _frame(P: Dictionary, dt: float, v: float) -> void:
	_float_body(P, dt, v)
	_arms_pose(P, dt)
	_head(P, dt, v)
	_ears(P, dt)
	_wiggle(P, dt, v)
	_wings(P, dt, v)
	_face(P, dt)
	# a gas Pokémon's cloud (its flame meshes, as smoke): only while it attacks or is cross
	if bool(I.get("gas", false)):
		var g := 0.6 if act in ["blast", "power_up", "angry", "taunt"] or move_name in I.get("alias", {}) and act != "" else 0.0
		g += 0.25 * battle_w
		for m in flames: m.set_shader_parameter("power", g * (0.8 + 0.2 * sin(t * 5.0)))

func _base(dt: float, v: float) -> Dictionary:
	var P := super._base(dt, v)
	P.merge({"spin": 0.0, "flapk": 1.0, "shiver": 0.0, "pop": 0.0}, true)
	return P

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
	match act:
		"harden":
			P.shiver = 1.0 * env
			P.sq += 0.15 * env
			P.eye = "squeeze"
			if _ev("g", 0.4): fx.emit("glow", point("chest"))
		"flop", "splash":
			# Magikarp's splash: up off the ground in flops, getting nowhere
			for n in 3:
				var j := bump(u, 0.1 + n * 0.42, 0.45 + n * 0.42)
				P.y += 0.5 * sz * j
				P.roll += (0.8 if n % 2 == 0 else -0.8) * j
			P.eye = "open"
			P.mouth = "open"
			P.jaw = 0.5 + 0.4 * sin(u * 20.0)
			if _ev("s", 0.2): fx.emit("splash", global_position)
		"spin":
			P.spin = TAU * 2.0 * sm(0.1, d - 0.1, u)
			P.fwd += act_reach * 0.6 * sin(clampf(u / d, 0.0, 1.0) * PI)
			if _ev("hit", 0.8): impact.emit(move_name); fx.emit("hit", point("chest"))
		"pop":
			P.pop = bump(u, 0.0, d)
			if _ev("p", 0.1): fx.emit("dust", global_position)
		_:
			return false
	return true

# the body: where it floats this frame, from the acts' wishes (P.y, fwd, side, pitch,
# roll, yaw, lean) and its own drift
func _float_body(P: Dictionary, dt: float, v: float) -> void:
	var k := skel.global_transform.basis.get_scale().x
	_drift_t -= dt
	if _drift_t <= 0.0:
		_drift_t = rng.randf_range(1.5, 4.0)
		_drift = Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)) * sz * 0.08
	var drift := _drift * (1.0 if mode in ["hover", "flier", "swim"] else 0.0)
	var h := hover_h * (1.0 - faint_w) * (1.0 - sleep_w * 0.7) * (1.0 - hide_w * 0.8)
	var bob := 0.0
	var pitch := float(P.pitch)
	var roll := float(P.roll)
	var yaw := float(P.yaw)
	var sx := 1.0
	match mode:
		"hover":
			bob = sin(t * 1.7) * 0.07 * sz + sin(t * 0.9 + 1.0) * 0.04 * sz
			pitch += 0.25 * sm(0.0, 2.0, v) + sin(t * 1.1) * 0.05
			roll += sin(t * 0.8) * 0.06
		"flier":
			bob = -cos(flap * TAU) * 0.08 * sz
			pitch += 0.35 * sm(0.0, 2.0, v)
			roll += sin(t * 0.7) * 0.1
		"swim":
			bob = sin(t * 1.3) * 0.05 * sz
			pitch += sin(t * 1.3 + 0.5) * 0.05
			yaw += sin(t * 3.0) * 0.08 * (1.0 + sm(0.0, 1.0, v))
		"still":
			roll += sin(t * 0.9) * 0.03 + sin(t * 37.0) * 0.03 * float(P.shiver)
			pitch += sin(t * 0.7) * 0.03
		"blob":
			var w := sin(t * 2.0)
			P.sq += 0.08 * w + 0.15 * sm(0.0, 0.8, v) * sin(t * 6.0)
			roll += sin(t * 1.1) * 0.04
		"burrow":
			bob = (sin(t * 1.2) * 0.5 + 0.5) * 0.08 * sz - float(P.pop) * 0.0
			h -= (1.0 - float(P.pop)) * 0.0
		"roll":
			roll_a += v * dt / maxf(0.05, sz * 0.5 * k)
			pitch += roll_a
	if faint_w > 0.01: roll = lerpf(roll, float(I.get("faint_roll", 1.3)) if mode != "roll" else roll, faint_w)
	body_p = spring(body_p, pitch, 10.0, dt, 0.8)
	body_r = spring(body_r, roll, 10.0, dt, 0.8)
	body_y = spring(body_y, 0.0, 14.0, dt, 0.5)
	var B := Basis(Vector3.UP, yaw + float(P.spin)) * Basis(Vector3.RIGHT, body_p.x) * Basis(Vector3(0, 0, 1), -body_r.x)
	var lift := float(I.get("lift", 0.0)) * sz
	var wp := rest_at(W) + Vector3(float(P.side), h * sz + bob + float(P.y) + lift, float(P.fwd)) + drift
	wp.y -= float(P.crouch) * 0.12 * sz
	_Tw = Transform3D(B * rest_g[W].basis, wp)
	set_local_pos(W, rest_g[parent[W]].affine_inverse() * wp)
	set_global(W, B * rest_g[W].basis)
	sq = spring(sq, float(P.sq), 18.0, dt, 0.45)
	var q := clampf(sq.x, -0.4, 0.4)
	var sb := spine[0] if not spine.is_empty() else W
	skel.set_bone_pose_scale(sb, Vector3(1.0 + q * 0.5, 1.0 - q, 1.0 + q * 0.5))
	lean_s = spring(lean_s, float(P.lean), 12.0, dt, 0.7)
	for s in spine: turn_rest(s, Vector3.RIGHT, lean_s.x / maxi(1, spine.size()))

# the loose parts: each chain on its own phase, the swing delayed down its length;
# fast when it moves or fights, limp when it sleeps or faints
func _wiggle(P: Dictionary, dt: float, v: float) -> void:
	var e := (1.0 + 1.2 * sm(0.0, 1.5, v) + 0.6 * battle_w) * (1.0 - 0.7 * sleep_w) * (1.0 - 0.8 * faint_w)
	var swim := mode == "swim"
	for c in wig:
		var ch: PackedInt32Array = c.chain
		var n := ch.size()
		var a: float = c.k * e
		var f := 2.0 + (4.0 if swim else 1.0) * sm(0.0, 1.5, v)
		for j in n:
			var ph: float = c.ph + t * f - j * 0.7
			var w := (0.6 + 0.4 * float(j) / maxf(1.0, n)) / sqrt(float(n))
			if swim:
				turn_rest(ch[j], Vector3.UP, sin(ph) * a * w * 1.4)
			else:
				turn_rest(ch[j], Vector3.RIGHT, sin(ph) * a * w + float(P.tp) * 0.2 / n)
				turn_rest(ch[j], Vector3(0, 0, 1), sin(ph * 0.7 + 1.3) * a * w * 0.6 * (c.sg if c.sg != 0.0 else 1.0))

func _wings(P: Dictionary, dt: float, v: float) -> void:
	if wing.is_empty(): return
	var hz := float(I.get("flap_hz", 6.0)) * float(P.flapk) * (1.0 - 0.8 * faint_w) * (1.0 - 0.6 * sleep_w)
	flap += hz * dt
	var ph := fposmod(flap, 1.0)
	var amp := float(I.get("flap_amp", 0.9))
	var a := (sin(ph * TAU) * amp + float(I.get("flap_mid", 0.0))) * (1.0 - 0.7 * faint_w)
	for w in wing:
		var ch: PackedInt32Array = w.chain
		var sg: float = w.sg
		turn_rest(ch[0], Vector3(0, 0, 1), sg * a)
		if ch.size() > 1: turn_rest(ch[1], Vector3(0, 0, 1), sg * a * 0.35)
