class_name CreatureRattata
extends CreatureRig
# Rattata (on all fours) and Raticate (up on its big hind feet). Rig: Waist - Hips -
# L/RThigh - (Leg) - Foot - Toes, Tail1 .. Tail6 / Tail7; Spine - Head (Jaw, the big
# front teeth on the upper jaw; L/REar; L/RFeeler1 - Feeler2 the whiskers), L/RArm -
# (ForeArm) - Hand.
# A rat's nerves: the nose never stops (quick sniffs, the whiskers quivering with it),
# the tail flicks and curls, the ears swivel at every sound, it darts its head about.
# Moods (besides CreatureRig's): hyper_fang / super_fang (Raticate) (a leap and the
# fangs sunk in: fx("fang") at the mouth), bite, quick_attack, focus_energy, tail_whip,
# dig / emerge, groom, scratch, and the rest every species has.
# Points: "mouth" (the fangs), "nose", "tail".

var whiskers := []                # [Feeler1, Feeler2] per side
var _sniff := 0.0
var _sniff_t := 0.5
var _flick_t := 1.0

func _rig_ready() -> void:
	durs.merge({"hyper_fang": 1.2, "super_fang": 1.3}, true)
	for s in ["L", "R"]:
		whiskers.append([b(s + "Feeler1"), b(s + "Feeler2"), 1.0 if s == "L" else -1.0])

func point(n: String) -> Vector3:
	if n == "nose":
		var nb := b("Nose")
		if nb >= 0: return to_world(G[nb].origin)
	return super.point(n)

func _base_species(P: Dictionary, dt: float, v: float) -> void:
	# the nose: bursts of quick sniffs (the head bobbing a hair with each), then a pause
	_sniff_t -= dt
	if _sniff_t <= 0.0:
		_sniff_t = rng.randf_range(0.5, 2.2)
		_sniff = rng.randf_range(0.4, 0.9)
	_sniff = maxf(0.0, _sniff - dt)
	var sn := sin(t * 38.0) * (1.0 if _sniff > 0.0 else 0.15) * (1.0 - sleep_w)
	P.hup += sn * 0.006 * sz
	P.hfwd += absf(sn) * 0.01 * sz
	P["sniff"] = sn
	# the tail: a flick every so often, a little quiver along it
	_flick_t -= dt
	if _flick_t <= 0.0:
		_flick_t = rng.randf_range(0.6, 2.0)
		_tail_kick = rng.randf_range(0.5, 1.2) * (1.0 if rng.randf() < 0.5 else -1.0)
	P.ty += sin(t * 9.0) * 0.05
	P.tp += sin(t * 5.0) * 0.04

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	match act:
		"hyper_fang", "super_fang":
			# the bite, bigger: crouched low and wound up, a leap, the fangs sunk in and a shake
			var c0 := 0.4 * d
			var c1 := 0.55 * d
			var load := sm(0.0, c0, u) * (1.0 - sm(c0, c1, u))
			var lunge := sm(c0, c1, u) * (1.0 - sm(c1 + 0.25, d - 0.05, u))
			var shake := bump(u, c1, c1 + 0.25)
			P.crouch += 0.8 * load
			P.sq += 0.3 * load - 0.25 * bump(u, c0, c1)
			P.lean += -0.25 * load + 0.4 * lunge
			P.fwd += act_reach * 0.85 * lunge - 0.2 * sz * load
			P.y += 0.6 * sz * bump(u, c0, c1 + 0.05)
			P.air = 1.0 if u > c0 + 0.02 and u < c1 + 0.03 else P.air
			P.legs = "tuck"
			P.hp = 0.45 * load - 0.2 * lunge
			P.hy = sin(u * 45.0) * 0.25 * shake
			P.roll += sin(u * 45.0) * 0.12 * shake
			P.jaw = 1.2 * sm(0.0, c0, u) * (1.0 - sm(c1 - 0.03, c1 + 0.02, u)) + 0.1 * lunge
			P.mouth = "wide"
			P.eye = "angry"
			P.earf -= 1.0 * (load + lunge)
			P.tp += 0.6 * load
			P.hk = 3.0
			if _ev("hit", c1):
				impact.emit(act)
				fx.emit("fang", point("mouth"))
		_:
			return false
	return true

func _after(P: Dictionary, _dt: float) -> void:
	# the whiskers quiver with the nose, swept back when it runs or fights
	var sn := float(P.get("sniff", 0.0))
	var back := 0.3 * run_w + 0.3 * battle_w
	for w in whiskers:
		var sg: float = w[2]
		turn_rest(w[0], Vector3.UP, sg * (0.12 * sn - back))
		turn_rest(w[0], Vector3(0, 0, 1), sg * 0.08 * sn)
		turn_rest(w[1], Vector3.UP, sg * (0.1 * sn - back * 0.5))
