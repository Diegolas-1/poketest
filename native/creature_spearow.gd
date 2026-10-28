class_name CreatureSpearow
extends CreaturePidgey
# Spearow: Pidgey's rig (the X/Y Spearow is built the same way: each wing twice,
# spread and folded, the folded one shown at the side), with Spearow's bones and its
# temper. Rig: Waist - Hips - L/RThigh - Leg - Foot (toes B, C forward, D the hind toe)
# and Tail (one bone); Spine - Neck - Head (LowerBeak; L/RHairB the brown crest
# feathers, HairA the chin); L/RArm - ForeArm - Hand the spread wing (no shoulder
# bone), L/RFeeler1 - Feeler2 the folded one.
#
# It is never calm: standing it jerks its head about in hard little bobs, the crest
# flicks up, it glares (the eyes narrowed), and it screeches at what it watches. Its
# "peck" is the battle's (a lunge and a stab of the beak at act_reach); feeding at the
# ground is "forage" (Pidgey's peck).
# Moods: Pidgey's (with "peck" the attack and "forage" the feeding peck), and screech
# (head thrown forward, beak wide: fx("screech")), leer (a hard stare: fx("glare")),
# growl, fury_attack (a flurry of jabs, an impact each), aerial_ace (Pidgey's
# quick_attack, faster and higher), pursuit (a run at the target, then a peck).
# Points: point("beak") / beak_point(), wing_tip(side).

signal fx(what: String, at: Vector3)

const MORE := {"peck": 0.95, "forage": 1.3, "screech": 1.3, "leer": 1.2, "growl": 1.2, "fury_attack": 1.7, "aerial_ace": 1.1, "pursuit": 1.3}
var HAIR_R := -1
var _jerk := 0.0
var _jerk_t := 1.0
var _peck_n := 0

func _setup() -> void:
	t = rng.randf() * 10.0
	W = b("Waist"); HIPS = b("Hips"); SP2 = b("Spine"); SP3 = b("Neck"); HEAD = b("Head")
	HAIR = b("LHairB"); HAIR_R = b("RHairB"); BEAK = b("LowerBeak"); BIB = -1
	TAIL = PackedInt32Array([b("Tail"), -1])
	hip0 = rest_at(W).y
	for s in [["L", 1.0], ["R", -1.0]]:
		var th := b(s[0] + "Thigh")
		var lg := b(s[0] + "Leg")
		var ft := b(s[0] + "Foot")
		L1 = rest_at(th).distance_to(rest_at(lg))
		L2 = rest_at(lg).distance_to(rest_at(ft))
		ANKLE_H = rest_at(ft).y
		FOOT_W = absf(rest_at(ft).x)
		var toes := []
		for tn in ["B", "C", "D"]: toes.append([b(s[0] + "Toe" + tn + "1"), b(s[0] + "Toe" + tn + "2")])
		legs.append({"thigh": th, "leg": lg, "foot": ft, "toes": toes, "sg": s[1], "p": Vector3.ZERO, "yaw": 0.0, "u": -1.0,
			"from": Vector3.ZERO, "to": Vector3.ZERO, "toyaw": 0.0, "fromyaw": 0.0, "dur": 0.1, "h": 0.03, "scr": 0.0})
		var w := {"sg": s[1], "sh": -1, "arm": b(s[0] + "Arm"), "fore": b(s[0] + "ForeArm"), "hand": b(s[0] + "Hand"),
			"tip": b("End" + s[0] + "Hand"), "f1": b(s[0] + "Feeler1"), "f2": b(s[0] + "Feeler2"), "open": Vector2.ZERO,
			"mesh_open": null, "mesh_fold": null}
		var side: String = s[0].to_lower()
		for m3 in meshes:
			if String(m3.name).ends_with("wing_" + side): w.mesh_open = m3
			elif String(m3.name).ends_with("fold_" + side): w.mesh_fold = m3
		wings.append(w)
	eye_mat = mat_by.get("spearow_eye1", null)
	_show_wings()

func beak_point() -> Vector3:
	return to_world(G[b("EndLowerBeak")].origin)

func point(n: String) -> Vector3:
	match n:
		"beak", "mouth": return beak_point()
		"head": return to_world(G[HEAD].origin)
		"wing_l": return wing_tip(1)
		"wing_r": return wing_tip(-1)
		"tail": return to_world(G[TAIL[0]].origin)
	return global_position

func acts() -> Array:
	return CreatureRig.info("spearow").get("acts", [])

func mood(what: String) -> void:
	if what == "forage":
		super.mood("peck")
		return
	if not MORE.has(what) or what == "forage":
		super.mood(what)
		return
	fainted = false
	hiding = false
	if act != "": _end_act()
	act = what
	act_t = 0.0
	act_dur = MORE[what]
	_events.clear()
	_act_h0 = height
	_peck_n = 0

func _act(P: Dictionary, dt: float, v: float) -> void:
	var u := act_t
	var d := act_dur
	var env := sm(0.0, 0.12, u) * sm(d, d - 0.2, u)
	match act:
		"peck":
			# drawn back, then the stab: the head and body thrown forward at the target
			var back := bump(u, 0.0, 0.35)
			var stab := sm(0.3, 0.42, u) * (1.0 - sm(0.5, 0.85, u))
			P.pitch += -0.25 * back + 0.55 * stab
			P.fwd += 0.08 * stab * act_reach
			P.crouch += 0.3 * back
			P.hp = 0.35 * back - 0.5 * stab
			P.hfwd += -0.02 * back + 0.05 * stab
			P.beak = 0.6 * bump(u, 0.25, 0.45)
			P.crest += 0.9 * env
			P.tp += 0.3 * env
			P.hk = 3.0
			for i in 2: P.lift[i] += 0.4 * stab
			if _ev("hit", 0.42):
				impact.emit(act)
				fx.emit("peck", beak_point())
		"fury_attack":
			# a flurry: four quick jabs, the body bobbing in behind each
			var lean := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.pitch += 0.35 * lean
			P.crouch += 0.2 * lean
			P.fwd += 0.06 * lean * act_reach
			P.crest += 1.0 * lean
			P.tp += 0.4 * lean
			var jab := 0.0
			for k in 4:
				var at := 0.25 + k * 0.28
				jab = maxf(jab, bump(u, at - 0.09, at + 0.07))
				if _ev("j%d" % k, at):
					impact.emit(act)
					fx.emit("peck", beak_point())
			P.hp = -0.25 * lean - 0.4 * jab
			P.hy = 0.25 * sin(u * 11.0) * lean
			P.hfwd += 0.045 * jab
			P.beak = 0.6 * jab
			P.hk = 3.5
			for i in 2:
				P.open[i] = 0.55 * lean
				P.el[i] = 0.3 + 0.2 * jab
				P.sw[i] = 0.3
		"screech", "growl":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
			var cry := bump(u, 0.2, d - 0.15)
			P.pitch += 0.3 * cry
			P.hp = 0.2 * k - 0.15 * cry + sin(u * 50.0) * 0.04 * cry
			P.hfwd += 0.035 * cry
			P.beak = 0.95 * cry if act == "screech" else 0.4 * cry
			P.crest += 1.0 * k
			P.puff += 0.8 * k
			P.tp += 0.5 * k
			P.hk = 3.0
			for i in 2:
				P.open[i] = 0.7 * cry
				P.el[i] = 0.5 + sin(u * 34.0) * 0.12 * cry
				P.sw[i] = 0.1
			if _ev("s", 0.25): fx.emit("screech" if act == "screech" else "growl", beak_point())
		"leer":
			var k := sm(0.0, 0.12, u) * sm(d, d - 0.2, u)
			P.pitch += 0.2 * k
			P.hp = -0.15 * k
			P.ht = 0.35 * k
			P.crest += 1.0 * k
			P.hk = 2.0
			P.eye = "half"
			if _ev("g", 0.3): fx.emit("glare", to_world(G[HEAD].origin))
		"aerial_ace":
			_strike(P, dt, u, true)
			P.y += 0.08 * bump(u, 0.1, 0.4)
		"pursuit":
			# a run at it (the owner need not move it: the body goes out and back), then a stab
			var go := sm(0.0, 0.5, u)
			var back2 := sm(0.85, d - 0.05, u)
			P.fwd += act_reach * (0.85 * go - 0.85 * back2)
			P.pitch += 0.5 * go * (1.0 - back2)
			P.crouch += 0.2
			var stab := bump(u, 0.5, 0.75)
			P.hp = -0.5 * stab
			P.hfwd += 0.05 * stab
			P.beak = 0.6 * stab
			P.crest += 0.9
			for i in 2: P.lift[i] += 0.4
			if _ev("hit", 0.6):
				impact.emit(act)
				fx.emit("peck", beak_point())
			for k in 5:
				if _ev("f%d" % k, 0.08 + k * 0.08): footfalls += 1
		_:
			super._act(P, dt, v)

# ever restless: the head jerks in hard little bobs, the crest twitching up
func _head(P: Dictionary, dt: float, v: float) -> void:
	_jerk_t -= dt
	if _jerk_t <= 0.0:
		_jerk_t = rng.randf_range(0.35, 1.4)
		_jerk = 1.0
	if act == "" and not hiding and not flying:
		_jerk = maxf(0.0, _jerk - dt * 7.0)
		var j := sin((1.0 - _jerk) * PI) if _jerk > 0.0 else 0.0
		P.hfwd += 0.018 * j
		P.crest += 0.5 * j + 0.25
		P.hk = maxf(float(P.hk), 1.6)
		if battle: P.eye = "half" if fposmod(t, 3.0) < 1.2 else P.eye
	super._head(P, dt, v)
	turn_rest(HAIR_R, Vector3.RIGHT, clampf(crest.x, -0.6, 1.0) * 0.6)

func _auto(dt: float, v: float) -> void:
	if not auto or act != "" or hiding or fainted or flying or battle or v > 0.1:
		super._auto(dt, v)
		return
	_next_auto -= dt
	if _next_auto <= 0.0:
		_next_auto = rng.randf_range(1.6, 4.0)
		var x := rng.randf()
		if x < 0.3: mood("forage")
		elif x < 0.55: mood("look")
		elif x < 0.65: mood("ruffle")
		elif x < 0.75: mood("hop")
		elif x < 0.85: mood("screech")
		elif x < 0.92: mood("leer")
	# the twitches of the folded wings and tail (Pidgey's), without its own picks
	var keep := _next_auto
	_next_auto = 1e9
	super._auto(dt, v)
	_next_auto = keep
