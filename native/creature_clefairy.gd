class_name CreatureClefairy
extends CreatureRig
# Clefairy and Clefable. Rig: Waist - Hips - L/RThigh - Leg - Foot - Toe; Clefairy's
# Head is its whole round body (Waist - Head, with the arms, ears, the Curl on top, the
# little wings L/RFeeler and the Tail1 - 2 curl on it), Clefable's sits on Spine1 (its
# wings L/RFeeler1 - 2). Their walk is a bounce (a high step, the body springing up off
# each foot, the arms out for balance, the little wings fluttering with it).
# Moods (besides CreatureRig's): skip (a skipping hop-step), moon_dance (the anime's
# moonlit dance: arms up, turning on the spot in little hops, swaying: fx("sparkle")),
# metronome (a finger waved side to side: fx("metronome") at the hand), minimize (it
# shrinks small and back), moonlight (arms raised to the sky: fx("moonlight")), and the
# battle acts sing (a note each beat: fx("note")), pound, double_slap, defense_curl,
# growl, tackle.
# Points: "hand_l", "hand_r", "mouth", "head", "curl" (its forehead curl).

var wings := []                   # per side: [bones..], sg
var flutter := Vector2.ZERO
var shrink := Vector2(1.0, 0.0)
var _root: Node3D
var _base_scale := 1.0

func _rig_ready() -> void:
	durs.merge({"skip": 1.2, "moon_dance": 4.0, "metronome": 2.4, "minimize": 1.8, "moonlight": 2.4}, true)
	for s in [["L", 1.0], ["R", -1.0]]:
		var w := PackedInt32Array()
		for nm in [s[0] + "Feeler", s[0] + "Feeler1", s[0] + "Feeler2"]:
			if b(nm) >= 0: w.append(b(nm))
		wings.append([w, s[1]])
	_root = skel.get_parent() if skel.get_parent() != self else skel
	_base_scale = _root.scale.x

func point(n: String) -> Vector3:
	if n == "curl" and b("Curl") >= 0: return to_world(G[b("Curl")].origin)
	return super.point(n)

func _base_species(P: Dictionary, dt: float, v: float) -> void:
	P.merge({"flutter": 0.15 + 0.6 * walk_w, "spin": 0.0, "shrink": 1.0}, true)

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
	match act:
		"skip":
			# two little hop-steps, one foot then the other, the arms swinging up
			for n in 2:
				var at := 0.1 + n * 0.5
				var j := bump(u, at, at + 0.42)
				P.y += 0.35 * sz * j
				P.side += (0.12 if n == 0 else -0.12) * sz * j
				P.roll += (0.15 if n == 0 else -0.15) * j
				P.arm_up[n] += 1.6 * j
				P.arm_up[1 - n] += 0.6 * j
				P.sq -= 0.15 * j
				if j > 0.2: P.air = 1.0
				P.crouch += 0.4 * bump(u, at - 0.1, at + 0.05)
				for l in legs:
					if (n == 0) == (l.sg < 0.0): l.lift = 0.6 * j
			P.legs = "tuck"
			P.flutter = 1.0
			P.eye = "happy"
			P.mouth = "smile"
		"moon_dance":
			# arms up to the moon, turning round on the spot in little hops, swaying
			var k := sm(0.0, 0.4, u) * sm(d, d - 0.5, u)
			var beat := u * 2.0
			var hop := absf(sin(beat * PI))
			P.spin = TAU * sm(0.3, d - 0.3, u)
			P.y += 0.18 * sz * hop * k
			P.air = 1.0 if hop * k > 0.5 else 0.0
			P.legs = "tuck"
			P.roll += sin(beat * PI * 0.5) * 0.2 * k
			P.ht = sin(beat * PI * 0.5) * 0.3 * k
			P.hp = 0.35 * k
			P.sq += 0.2 * (1.0 - hop) * k
			P.eye = "happy" if k > 0.3 else ""
			P.mouth = "smile"
			P.flutter = 1.2 * k
			for i in 2:
				P.arm_up[i] += (2.4 + 0.3 * sin(beat * PI + i * PI)) * k
				P.arm_out[i] += 0.3 * k
			for n in 6:
				if _ev("s%d" % n, 0.5 + n * 0.55): fx.emit("sparkle", point("hand_l" if n % 2 == 0 else "hand_r"))
		"metronome":
			# the finger up and waved to and fro, the body swaying with it, ever faster
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.3, u)
			var f := 3.0 + 4.0 * sm(0.0, d, u)
			var w := sin(u * f)
			P.arm_up[0] += 2.4 * k
			P.arm_out[0] += (0.2 + 0.9 * w) * k
			P.elbow[0] += 0.3 * k
			P.roll += 0.12 * w * k
			P.ht = 0.25 * w * k
			P.hy = 0.3 * w * k
			P.eye = "happy"
			P.mouth = "smile"
			P.flutter = 0.5 * k
			if _ev("m", d - 0.35): fx.emit("metronome", point("hand_l"))
		"minimize":
			var k := sm(0.1, 0.5, u) * (1.0 - sm(d - 0.5, d - 0.1, u))
			P.shrink = lerpf(1.0, 0.35, k)
			P.crouch += 0.3 * bump(u, 0.0, 0.3)
			P.eye = "happy"
			if _ev("m", 0.15): fx.emit("minimize", global_position)
		"moonlight":
			var k := sm(0.0, 0.5, u) * sm(d, d - 0.4, u)
			P.lean -= 0.3 * k
			P.hp = 0.6 * k
			P.eye = "closed" if k > 0.5 else ""
			P.mouth = "smile"
			P.flutter = 0.8 * k
			for i in 2: P.arm_up[i] += 2.6 * k; P.arm_out[i] += 0.7 * k
			P.y += 0.05 * sz * sin(u * 3.0) * k
			if _ev("g", 0.6): fx.emit("moonlight", point("head"))
		_:
			return false
	return true

func _body(P: Dictionary, dt: float) -> void:
	super._body(P, dt)
	var sp := float(P.get("spin", 0.0))
	if absf(sp) > 0.001:
		var B: Basis = _tg[W]
		set_global(W, Basis(Vector3.UP, sp) * B)
		_Tw = Transform3D(Basis(Vector3.UP, sp) * B, _Tw.origin)

func _after(P: Dictionary, dt: float) -> void:
	# the little wings flutter (fast when it is happy or hopping)
	flutter = spring(flutter, float(P.get("flutter", 0.15)), 8.0, dt, 0.8)
	var f := clampf(flutter.x, 0.0, 1.5)
	for w in wings:
		var sg: float = w[1]
		var a := sin(t * 22.0) * 0.35 * f + 0.1 * f
		for bi in (w[0] as PackedInt32Array): turn_rest(bi, Vector3.UP, -sg * a)
	shrink = spring(shrink, float(P.get("shrink", 1.0)), 16.0, dt, 0.6)
	if _root: _root.scale = Vector3.ONE * _base_scale * shrink.x
