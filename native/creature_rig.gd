class_name CreatureRig
extends Creature
# The shared rig of the Pokémon from #019 on (creatures/species.json): what Pidgey's
# hand-made rig (creature_pidgey.gd) does, made general so the species share it and
# are tuned with data. The X/Y rips name their bones alike (Waist - Hips - L/RThigh -
# Leg - Foot - Toe, Spine1 - Spine2 - Neck - Head - Jaw, L/REar1.., Tail1.., L/RArm -
# ForeArm - Hand), so the rig finds its limbs, neck, ears and tails by name. Each
# species names its family in species.json, and the family is how it moves:
#   legged   on its feet: "quad" (all fours: Rattata, the Nidoran, Nidorino, Vulpix,
#            Ninetales) or "biped" (upright: Raticate, Pikachu, Raichu, Sandshrew,
#            Sandslash, Nidorina, Nidoqueen, Nidoking, Clefairy, Clefable), "round"
#            (Jigglypuff: hops on its stubs). A biped can drop to all fours to run
#            (gait.quad_run: Pikachu, as in the anime).
#   serpent  Ekans, Arbok (creature_serpent.gd)
#   bird     Fearow (creature_bird.gd); Spearow is Pidgey's rig (creature_spearow.gd)
# A species with signature acts has its own subclass (creature_<species>.gd), the rest
# are this class (or the family's) with their data.
#
#   var c := Creature.make("rattata")            # or Creature.make("pikachu", "f")
#   c.animate(dt, speed)          # speed: ground speed (m/s) the owner moves it at
#   c.mood("tackle")              # an act (busy() while it plays; act_done(name) after)
#   c.battle = true               # its fighting stance (no idle fidgets, watches look_at_pos)
#   c.sleep = true                # lies down and dozes
#   c.look_at_pos = Vector3(...)  # watch something (Ash)
#   c.emote = "happy"             # a held expression ("" = its own); see EYES / MOUTHS
#   c.act_reach = 1.0             # how far ahead tackle and the like strike (m)
#
# Moods every species has: idle (back to plain: ends hide / faint), walk, run (by speed;
# the moods only start it in place), look, sniff, happy, angry, startle, hop, hide (low in
# the grass until another mood), sleep / wake, and the battle acts tackle, hurt, flinch,
# faint (stays down until "idle" or reset()), flee (bolts: the owner moves it off),
# taunt, plus each species' own (species.json "acts" lists them all; acts() returns them).
#
# For the battle's effects (all in world space):
#   signal impact(act)        an act's blow lands (act_reach ahead)
#   signal fx(what, at)       an effect's moment and where: "spark", "ember", "sting",
#                             "note", "dust", "burrow", "emerge", "bite", "kick", "puff",
#                             "glow", "bolt" (see each species)
#   signal act_done(act)      the act has finished
#   point(name)               a named point now: "mouth", "head", "tail", "horn", "nose",
#                             "cheek_l", "cheek_r", "hand_l", "hand_r", "foot_l", "foot_r",
#                             "chest", "spark" (where Thunder Shock leaves it) ..
#
# ---- how a frame is built ----
# P, a Dictionary of the frame's pose wishes (body height, lean, the head's aim, ears,
# tail, arms, face), comes from the state (standing, walking, asleep, fighting) and then
# the act on top; the gait then plants the feet, the body is put over them, the limbs
# reach with two-bone IK, and the neck, ears and tails follow on springs (the tails
# with a delay down their length, so they whip).

signal impact(act: String)
signal fx(what: String, at: Vector3)
signal act_done(act: String)

static func db() -> Dictionary:
	return Creature.species_db()

static func info(sp: String) -> Dictionary:
	return Creature.species_info(sp)

static func create(sp: String) -> Creature:
	match sp:
		"rattata", "raticate": return CreatureRattata.new()
		"spearow": return CreatureSpearow.new()
		"fearow": return CreatureBird.new()
		"ekans", "arbok": return CreatureSerpent.new()
		"pikachu", "raichu": return CreaturePikachu.new()
		"sandshrew", "sandslash": return CreatureSandshrew.new()
		"nidoranf", "nidorina", "nidoqueen", "nidoranm", "nidorino", "nidoking": return CreatureNido.new()
		"clefairy", "clefable": return CreatureClefairy.new()
		"vulpix", "ninetales": return CreatureVulpix.new()
		"jigglypuff": return CreatureJigglypuff.new()
	return CreatureRig.new() if not info(sp).is_empty() else Creature.new()

# ---------- data ----------
var I := {}                       # species.json's entry
var family := "legged"
var stance := "quad"              # quad / biped / round
var gait := {}                    # the gait's numbers (family defaults, then the species')
var battle := false
var auto := true
var emote := ""
var act_reach := 1.0
var fainted := false
var hiding := false
var burrowed := false             # gone under the ground (dig): until "emerge"
var streak := false               # quick_attack's dash (speed lines)
var sing_beat := 0.0              # sing: 0..1 through each sway (a note at 0)
var height := 0.0                 # the body's height off the ground now (m), for a jump or dig

# the act playing
var act := ""
var act_t := 0.0
var act_dur := 0.0
var _events := {}
var durs := {"look": 1.8, "sniff": 1.6, "happy": 1.4, "angry": 1.4, "startle": 0.9, "hop": 0.75, "wake": 1.2,
	"tackle": 1.2, "hurt": 0.9, "flinch": 0.55, "faint": 2.0, "flee": 0.8, "taunt": 1.6, "shake": 1.1,
	"scratch": 1.6, "yawn": 1.8, "stretch": 2.0, "growl": 1.4, "leer": 1.3, "tail_whip": 1.5,
	"quick_attack": 1.0, "bite": 1.0, "dig": 1.8, "emerge": 1.0, "double_kick": 1.4, "horn_attack": 1.2,
	"poison_sting": 1.0, "pound": 0.9, "double_slap": 1.5, "sing": 3.0, "defense_curl": 1.6, "ember": 1.1,
	"stomp": 1.2, "focus_energy": 1.6, "scratch_attack": 0.9, "groom": 2.0, "peck": 0.9, "fury_attack": 1.6}

# rig
var W := -1                       # Waist (the body's root)
var HIPS := -1
var HEAD := -1
var JAW := -1
var spine := PackedInt32Array()   # the torso, Waist's child up (not the neck)
var neck := PackedInt32Array()    # between the torso and the head
var legs: Array[Leg] = []         # all limbs on the ground (hind first, then front)
var arms: Array[Leg] = []         # free arms (a biped's), the same as its front legs
var ears: Array = []              # [{chain, sg}]
var tails: Array = []             # [{chain, name, buf}]
var eye_mat: ShaderMaterial
var mouth_mat: ShaderMaterial
var sz := 0.2                     # hip height at rest (m in skeleton space): the scale of everything
var leg_len := 0.15

# state
var t := 0.0
var phase := 0.0
var stride := 0.2
var duty := 0.6
var run_w := 0.0
var walk_w := 0.0
var quad_w := 0.0                 # a biped down on all fours (running)
var _vel := Vector3.ZERO
var _acc := Vector3.ZERO
var _last_pos := Vector3(NAN, NAN, NAN)
var _last_frame := 0
var _need_reset := true
var _yaw_last := NAN
var turn_v := 0.0
var air_w := 0.0
var _was_air := false
var sleep_w := 0.0
var hide_w := 0.0
var faint_w := 0.0
var battle_w := 0.0
var _hv := Vector2.ZERO
var body_p := Vector2.ZERO        # body pitch spring
var body_r := Vector2.ZERO        # roll
var body_y := Vector2.ZERO        # height spring (landings)
var lean_s := Vector2.ZERO
var hy := Vector2.ZERO
var hp := Vector2.ZERO
var ht := Vector2.ZERO
var _hg := Vector3.ZERO
var _look_t := 0.5
var _hfwd := Vector2.ZERO
var jaw_s := Vector2.ZERO
var ear_s := []                   # per ear: [fwd spring, out spring]
var _ear_kick := []               # per ear: impulse
var _next_ear := 1.0
var tail_p := Vector2.ZERO
var tail_y := Vector2.ZERO
var _tail_kick := 0.0
var _next_tail := 1.5
var _next_auto := 3.0
var blink := 2.0
var _eye := ""
var _mouth := ""
var sq := Vector2.ZERO            # squash spring (+ squashed)
var _Tw := Transform3D.IDENTITY   # the Waist's pose this frame (skeleton space)
var _fk := {}

class Leg:
	var up := -1                  # upper bone (thigh / arm)
	var lo := -1                  # lower bone (shin / forearm), -1 for a one-bone limb
	var end := -1                 # foot / hand (its origin the ankle / wrist)
	var toes := PackedInt32Array()
	var sg := 1.0                 # +1 its left
	var front := false
	var L1 := 0.1
	var L2 := 0.1
	var ank := 0.02               # the ankle's height off the ground when planted
	var nx := 0.0                 # where it stands under the body (skeleton space, rest)
	var nz := 0.0
	var n_rest := Vector3.RIGHT   # the rest bend plane's normal
	var bend := 1.0               # +1 the middle joint forward (a knee), -1 back (an elbow)
	var aim_end := false          # the end bone turned to point ahead (a T-posed hand put down)
	var end_dir := Vector3.FORWARD
	var hang := Vector3.ZERO      # a free arm's hand at rest, from its shoulder (skeleton space)
	var off := 0.0                # its phase in the gait
	var p := Vector3.ZERO         # planted (world)
	var yaw := 0.0
	var u := -1.0                 # swing 0..1, -1 planted
	var from := Vector3.ZERO
	var to := Vector3.ZERO
	var fromyaw := 0.0
	var toyaw := 0.0
	var dur := 0.1
	var h := 0.02
	var lift := 0.0               # (this frame) raised by an act, 0..1 of its reach
	var reach := Vector3(NAN, 0, 0)   # (this frame) an act's target for it (skeleton space)
	var reach_w := 0.0
	var free := false             # a biped's arm, a leg only when it drops to all fours
	var sh := -1                  # (a free arm) its shoulder, for where it stands on all fours

func _root_ready(root: Node3D) -> void:
	I = info(species)
	var s := float(I.get("scale", 1.0))
	if s != 1.0: root.scale = Vector3.ONE * s

func _setup() -> void:
	t = rng.randf() * 10.0
	family = String(I.get("family", "legged"))
	stance = String(I.get("stance", "quad"))
	for k in I.get("durs", {}): durs[k] = float(I.durs[k])
	gait = _gait_defaults()
	for k in I.get("gait", {}): gait[k] = I.gait[k]
	_find_rig()
	for m in mat_by:
		if String(m).ends_with("_eye1"): eye_mat = mat_by[m]
		elif String(m).ends_with("_mouth1"): mouth_mat = mat_by[m]
	_rig_ready()

# for the species: after the rig is found
func _rig_ready() -> void: pass

func _gait_defaults() -> Dictionary:
	var g := {"walk_v": 0.5, "run_v": 1.6, "stride": 1.0, "run_stride": 2.2, "duty": 0.62, "run_duty": 0.38,
		"run_gait": "trot", "bob": 0.04, "run_bob": 0.1, "sway": 0.0, "waddle": 0.0, "step_h": 0.18,
		"pitch_run": 0.15, "spine_flex": 0.0, "lie": 0.45, "quad_run": false, "hop": false, "look_k": 1.0,
		"darty": 0.3, "tail_lift": 0.0, "tail_sway": 0.15, "tail_lag": 0.06, "ear_flick": 0.5, "breath": 1.0,
		"arm_swing": 0.5, "head_bob": 0.3, "crouch_h": 0.25, "stance_w": 1.0}
	if stance == "biped": g.merge({"walk_v": 0.5, "run_v": 1.8, "stride": 1.1, "run_stride": 2.4, "duty": 0.6, "run_duty": 0.4, "bob": 0.05}, true)
	if stance == "round": g.merge({"hop": true, "stride": 1.2, "bob": 0.0, "waddle": 0.25}, true)
	return g

func acts() -> Array:
	return I.get("acts", [])

# ---------- the rig, found by the bones' names ----------
func _chain(n: String) -> PackedInt32Array:
	var out := PackedInt32Array()
	var i := b(n)
	while i >= 0:
		out.append(i)
		var next := -1
		for j in parent.size():
			if parent[j] == i and not skel.get_bone_name(j).begins_with("End"):
				next = j; break
		i = next
	return out

func _kids(i: int) -> PackedInt32Array:
	var out := PackedInt32Array()
	for j in parent.size():
		if parent[j] == i: out.append(j)
	return out

func _find_rig() -> void:
	W = b("Waist")
	HIPS = b("Hips")
	HEAD = b("Head")
	if HEAD < 0: HEAD = W   # (Jigglypuff: all ball)
	for jn in ["Jaw", "LowerJaw"]:
		if b(jn) >= 0: JAW = b(jn); break
	# the head's ancestors down to the waist: the neck (Neck*), the rest the torso
	var up := PackedInt32Array()
	var i := parent[HEAD] if HEAD >= 0 else -1
	while i >= 0 and i != W:
		up.insert(0, i)
		i = parent[i]
	for k in up:
		if skel.get_bone_name(k).begins_with("Neck"): neck.append(k)
		else: spine.append(k)
	if neck.is_empty() and spine.size() > 1 and bool(I.get("neck_from_spine", false)):
		neck.append(spine[spine.size() - 1])
		spine.remove_at(spine.size() - 1)
	sz = rest_at(HIPS if HIPS >= 0 else W).y
	# legs: hind (Thigh), front (Arm)
	for s in [["L", 1.0], ["R", -1.0]]:
		var th := b(s[0] + "Thigh")
		if th >= 0: legs.append(_limb(th, s[1], false))
	for s in [["L", 1.0], ["R", -1.0]]:
		var ar := b(s[0] + "Arm")
		if ar >= 0:
			var l := _limb(ar, s[1], true)
			if stance == "quad": legs.append(l)
			else:
				arms.append(l)
				if bool(gait.quad_run):
					l.free = true
					l.aim_end = true
					l.ank = 0.08 * (l.L1 + l.L2)
					legs.append(l)
	if not legs.is_empty(): leg_len = legs[0].L1 + legs[0].L2
	# ears and tails
	for s in [["L", 1.0], ["R", -1.0]]:
		for en in [s[0] + "Ear1", s[0] + "Ear"]:
			if b(en) >= 0:
				ears.append({"chain": _chain(en), "sg": s[1]})
				ear_s.append([Vector2.ZERO, Vector2.ZERO, Vector2.ZERO]); _ear_kick.append(0.0)
				break
	for tn in ["Tail1", "Tail"]:
		if b(tn) >= 0:
			tails.append({"chain": _chain(tn), "name": tn, "buf": [], "k": 0.0, "sg": 0.0})
			break

# a limb: upper - lower - end (the end the first bone below the lower one that leads on)
func _limb(top: int, sg: float, front: bool) -> Leg:
	var l := Leg.new()
	l.sg = sg
	l.front = front
	var ch := _chain(skel.get_bone_name(top))
	# a thigh with a "Hips" bone above it (LHips) is still the thigh; ch: thigh, leg, foot, toe..
	l.up = ch[0]
	var nm1 := skel.get_bone_name(ch[1]) if ch.size() > 1 else ""
	var two := ch.size() > 2 and (nm1.ends_with("Leg") or nm1.ends_with("ForeArm") or nm1.ends_with("Arm2"))
	if two:
		l.lo = ch[1]
		l.end = ch[2]
		for k in range(3, ch.size()): l.toes.append(ch[k])
	else:
		l.end = ch[1] if ch.size() > 1 else ch[0]
		for k in range(2, ch.size()): l.toes.append(ch[k])
	var A := rest_at(l.up)
	var E := rest_at(l.end)
	if l.lo >= 0:
		var K := rest_at(l.lo)
		l.L1 = A.distance_to(K)
		l.L2 = K.distance_to(E)
		var n := (K - A).cross(E - K)
		l.bend = -1.0 if front else 1.0
		if n.length() > 0.05 * l.L1 * l.L2 and E.y < A.y - 0.4 * (l.L1 + l.L2): l.n_rest = n.normalized()
		else:
			# straight at rest (a T-pose): the plane a natural bend would make
			var d := (E - A).normalized()
			l.n_rest = (Vector3(0, 0, l.bend) .cross(d)).normalized()
			if l.n_rest.length() < 0.5: l.n_rest = Vector3.RIGHT
	else:
		l.L1 = A.distance_to(E)
		l.L2 = 0.0
	l.ank = E.y
	l.nx = E.x
	l.nz = E.z
	var reach := l.L1 + l.L2
	if E.y > 0.35 * A.y or absf(E.x - A.x) > 0.6 * reach:
		# a hand held up (a T-pose): put down under the shoulder, turned to point ahead
		l.ank = 0.12 * reach
		l.nx = A.x * 1.05
		l.nz = A.z + 0.1 * reach
		l.aim_end = true
	var kid := _kids(l.end)
	if not kid.is_empty(): l.end_dir = (rest_at(kid[0]) - E).normalized()
	l.hang = Vector3(sg * 0.25, -0.75, 0.35).normalized() * reach * 0.92
	return l

# ---------- acts ----------
func mood(what: String) -> void:
	match what:
		"idle":
			hiding = false; fainted = false
			if act != "": _end_act()
			return
		"walk", "run": hiding = false; return
		"hide":
			hiding = true
			if act != "": _end_act()
			return
		"sleep": sleep = true; return
		"wake":
			if not sleep: return
			sleep = false
	if not durs.has(what): return
	if what != "faint": fainted = false
	if act != "": _end_act()
	hiding = false
	act = what
	act_t = 0.0
	act_dur = durs[what]
	_events.clear()
	if what == "faint": fainted = true
	if what == "hop": hops += 1
	_act_start(what)

func _act_start(_what: String) -> void: pass

# acts that leave it in a state (dug in); the rest end where they began
func _act_end_state(a: String) -> void:
	match a:
		"dig": burrowed = true
		"emerge": burrowed = false

func _end_act() -> void:
	var a := act
	act = ""
	streak = false
	_act_end_state(a)
	act_done.emit(a)

func busy() -> bool:
	return act != ""

func contacts() -> Array:
	var out := []
	for l in legs: out.append(to_world(G[l.end].origin) if l.u < 0.0 and air_w < 0.01 else null)
	return out

func _ev(k: String, at: float) -> bool:
	if act_t >= at and not _events.has(k):
		_events[k] = true
		return true
	return false

static func bump(u: float, a: float, b2: float) -> float:
	if u <= a or u >= b2: return 0.0
	return sin((u - a) / (b2 - a) * PI)

# a named point in the world (for the battle's effects)
func point(n: String) -> Vector3:
	match n:
		"head": return to_world(G[HEAD].origin) if HEAD >= 0 else global_position
		"mouth":
			if JAW >= 0:
				var k := _kids(JAW)
				return to_world(G[k[0]].origin.lerp(G[JAW].origin, 0.3) if not k.is_empty() else G[JAW].origin)
			return to_world(G[HEAD].origin + G[HEAD].basis.z.normalized() * sz * 0.5)
		"tail":
			if not tails.is_empty():
				var ch: PackedInt32Array = tails[0].chain
				var e := _kids(ch[ch.size() - 1])
				return to_world(G[e[0]].origin if not e.is_empty() else G[ch[ch.size() - 1]].origin)
		"chest":
			var c := spine[spine.size() - 1] if not spine.is_empty() else W
			return to_world(G[c].origin)
		"hand_l", "hand_r":
			var side := 1.0 if n == "hand_l" else -1.0
			for l in arms + legs:
				if l.front and l.sg == side: return to_world(G[l.end].origin)
		"foot_l", "foot_r":
			var side := 1.0 if n == "foot_l" else -1.0
			for l in legs:
				if not l.front and l.sg == side: return to_world(G[l.end].origin)
	var bi := b(n)
	if bi >= 0: return to_world(G[bi].origin)
	return to_world(G[HEAD].origin) if HEAD >= 0 else global_position

func reset() -> void:
	_need_reset = true

func _reset_now() -> void:
	_need_reset = false
	var yaw := global_rotation.y
	for l in legs:
		l.p = _neutral(l, yaw, 0.0)
		l.yaw = yaw
		l.u = -1.0
	_last_pos = global_position
	_vel = Vector3.ZERO
	_yaw_last = yaw
	if fainted and act == "": faint_w = 1.0
	if sleep: sleep_w = 1.0
	for tl in tails: (tl.buf as Array).clear()

# where a foot stands under the body at rest (world)
func _neutral(l: Leg, yaw: float, ahead: float) -> Vector3:
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var side := Vector3(cos(yaw), 0, -sin(yaw))
	var k := skel.global_transform.basis.get_scale().x
	var sw := float(gait.stance_w)
	var nz := l.nz
	if l.free:
		# a biped down on all fours: under its shoulder as it is now
		nz = G[l.up].origin.z + 0.25 * (l.L1 + l.L2)
	var p: Vector3 = global_position + side * (l.nx * sw * k) + f * (nz * k + ahead)
	p.y = global_position.y
	return p

# ---------- the frame ----------
func _pose(dt: float, _speed: float) -> void:
	var now := Engine.get_process_frames()
	if now - _last_frame > 30: _need_reset = true
	_last_frame = now
	if not _need_reset and global_position.distance_to(_last_pos) > 2.5 + 3.0 * sz: _need_reset = true
	if _need_reset: _reset_now()
	_fk.clear()
	t += dt
	if dt > 0.0:
		var vel := (global_position - _last_pos) / dt
		vel.y = 0.0
		var v0 := _vel
		_vel = _vel.lerp(vel, 1.0 - exp(-dt * 14.0))
		_acc = _acc.lerp((_vel - v0) / dt, 1.0 - exp(-dt * 10.0))
		var yaw := global_rotation.y
		if not is_nan(_yaw_last): turn_v = damp(turn_v, wrapf(yaw - _yaw_last, -PI, PI) / dt, 10.0, dt)
		_yaw_last = yaw
	_last_pos = global_position
	var v := _vel.length()
	if act != "":
		act_t += dt
		if act_t >= act_dur: _end_act()
	hide_w = damp(hide_w, 1.0 if hiding else 0.0, 5.0, dt)
	sleep_w = damp(sleep_w, 1.0 if sleep and act == "" else 0.0, 2.0, dt)
	if act != "faint": faint_w = damp(faint_w, 1.0 if fainted and act == "" else 0.0, 4.0, dt)
	battle_w = damp(battle_w, 1.0 if battle and not hiding else 0.0, 4.0, dt)
	var P := _base(dt, v)
	if burrowed and act != "emerge":
		P.y -= sz * 3.0
		P.air = 1.0
		P.legs = "tuck"
	_base_species(P, dt, v)
	if act != "":
		var u := act_t
		if not _act_species(P, dt, u, act_dur): _act(P, dt, u, act_dur)
	_auto(dt, v)
	_frame(P, dt, v)
	_after(P, dt)

# the family's frame (legged; the serpent and bird override it)
func _frame(P: Dictionary, dt: float, v: float) -> void:
	_gait(dt, v, P)
	_body(P, dt)
	_legs_ik(P)
	_arms_pose(P, dt)
	_head(P, dt, v)
	_ears(P, dt)
	_tails(P, dt, v)
	_face(P, dt)

func _after(_P: Dictionary, _dt: float) -> void: pass
func _base_species(_P: Dictionary, _dt: float, _v: float) -> void: pass
func _act_species(_P: Dictionary, _dt: float, _u: float, _d: float) -> bool: return false

# the plain pose for the state it is in
func _base(dt: float, v: float) -> Dictionary:
	var P := {"y": 0.0, "fwd": 0.0, "side": 0.0, "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "crouch": 0.0,
		"lean": 0.0, "twist": 0.0, "bend": 0.0, "hy": NAN, "hp": NAN, "ht": NAN, "hk": 1.0, "hfwd": 0.0, "hup": 0.0,
		"jaw": 0.0, "earf": 0.0, "earo": 0.0, "ear_l": 0.0, "ear_r": 0.0, "tp": float(gait.tail_lift), "ty": 0.0,
		"wag": 0.0, "wagf": 6.0, "curl": 0.0, "arm_sw": [0.0, 0.0], "arm_up": [0.0, 0.0], "arm_out": [0.0, 0.0],
		"arm_in": [0.0, 0.0], "elbow": [0.0, 0.0], "air": 0.0, "legs": "plant", "eye": "", "mouth": "", "sq": 0.0,
		"quad": 0.0, "puff": 0.0, "lie": 0.0, "hold": false}
	# breathing
	var br := float(gait.breath)
	P.y += sin(t * 2.2) * 0.008 * sz * br
	P.sq += sin(t * 2.2) * 0.012 * br
	P.lean += sin(t * 2.2 + 0.6) * 0.012 * br
	# fighting stance: low, leaning in, ears forward, watching
	var bw := battle_w
	P.crouch += 0.3 * bw
	P.lean += 0.12 * bw
	P.earf += 0.4 * bw
	P.tp += 0.25 * bw
	P.eye = "angry" if bw > 0.5 else P.eye
	for i in 2:
		P.arm_up[i] += 0.35 * bw
		P.elbow[i] += 0.5 * bw
	# hiding: pressed low in the grass, ears flat, watching
	if hide_w > 0.001:
		var k := hide_w
		P.crouch += k * 0.9
		P.earf -= 0.6 * k
		P.tp -= 0.4 * k
		P.hk = lerpf(1.0, 0.5, k)
		P.eye = "half" if k > 0.5 else P.eye
	# asleep: lying down, curled, the head down, slow breaths
	if sleep_w > 0.001:
		var k := sleep_w
		P.lie = k
		P.y += sin(t * 1.3) * 0.012 * sz * k
		P.sq += sin(t * 1.3) * 0.03 * k
		P.hp = lerpf(0.0, -0.45, k)
		P.hy = 0.5 * k
		P.ht = 0.25 * k
		P.hk = 0.4
		P.earf -= 0.5 * k
		P.earo += 0.3 * k
		P.curl = k
		P.tp -= 0.3 * k
		P.eye = "closed" if k > 0.4 else "half"
		P.mouth = "closed"
	return P

# ---------- the acts every species has ----------
func _act(P: Dictionary, dt: float, u: float, d: float) -> void:
	var env := sm(0.0, 0.12, u) * sm(d, d - 0.2, u)
	match act:
		"look":
			var L := [[0.9, 0.05, 0.2], [-0.85, 0.15, -0.25], [0.2, 0.35, 0.1], [0.0, 0.0, 0.0]]
			var k := clampi(int(u / 0.45), 0, 3)
			P.hy = L[k][0]; P.hp = L[k][1]; P.ht = L[k][2]
			P.yaw += L[k][0] * 0.15 * env
			P.earf += 0.3 * env
			P.ear_l += 0.4 * bump(u, 0.0, 0.5)
			P.ear_r += 0.4 * bump(u, 0.45, 0.9)
			P.hk = 0.8
		"sniff":
			var down := sm(0.0, 0.35, u) * sm(d, d - 0.35, u)
			P.lean += 0.3 * down
			P.crouch += 0.2 * down
			P.hp = -0.5 * down + 0.06 * sin(u * 38.0) * down
			P.hy = 0.35 * sin(u * 2.5) * down
			P.hfwd += 0.08 * sz * down
			P.earf += 0.4 * down
			P.hk = 1.5
			if _ev("s", 0.5): fx.emit("sniff", point("nose"))
		"happy":
			var j := bump(u, 0.15, 0.55)
			P.y += 0.25 * sz * j
			P.air = 1.0 if j > 0.15 else 0.0
			P.legs = "tuck"
			P.crouch += 0.5 * bump(u, 0.0, 0.18) + 0.4 * bump(u, 0.5, 0.72)
			P.sq += 0.25 * bump(u, 0.0, 0.18) - 0.2 * j + 0.2 * bump(u, 0.5, 0.7)
			P.eye = "happy"
			P.mouth = "smile"
			P.jaw = 0.5 * env
			P.earf += 0.3 * env
			P.wag = 1.0 * env
			P.hp = 0.3 * env
			P.ht = 0.25 * sin(u * 7.0) * env
			for i in 2: P.arm_up[i] += 1.2 * j; P.elbow[i] += 0.4 * env
		"angry", "growl":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
			P.crouch += 0.45 * k
			P.lean += 0.25 * k
			P.hp = -0.2 * k
			P.earf -= 0.7 * k
			P.tp += 0.5 * k
			P.eye = "angry"
			P.mouth = "frown" if act == "angry" else "wide"
			P.jaw = (0.35 + 0.1 * sin(u * 40.0)) * k if act == "growl" else 0.15 * k
			P.y += sin(u * 45.0) * 0.006 * sz * k
			P.hk = 2.0
		"leer":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.2, u)
			P.lean += 0.2 * k
			P.hp = -0.15 * k
			P.ht = 0.2 * k
			P.eye = "angry"
			P.earf -= 0.3 * k
			P.hk = 1.5
			if _ev("l", 0.3): fx.emit("glare", point("head"))
		"startle":
			var j := bump(u, 0.0, 0.32)
			P.y += 0.3 * sz * j
			P.air = 1.0 if j > 0.2 else 0.0
			P.legs = "tuck"
			P.sq -= 0.2 * j
			P.crouch -= 0.2 * env
			P.hp = 0.3 * env
			P.earf += 0.8 * env
			P.tp += 0.6 * env
			P.eye = "open"
			P.mouth = "open"
			P.jaw = 0.3 * env
			P.hk = 3.0
			for i in 2: P.arm_up[i] += 1.0 * env
		"hop":
			var cr := bump(u, 0.0, 0.2) * 0.7 + bump(u, 0.5, 0.72) * 0.5
			P.crouch += cr
			P.sq += 0.3 * cr
			var air := (u - 0.16) / 0.36
			if air > 0.0 and air < 1.0:
				P.y += 0.35 * sz * sin(air * PI)
				P.air = 1.0
				P.legs = "tuck"
				P.sq -= 0.15 * sin(air * PI)
			P.pitch -= 0.15 * bump(u, 0.12, 0.5)
			P.tp += 0.4 * bump(u, 0.4, 0.75)
			P.earf += 0.3 * bump(u, 0.1, 0.6)
		"wake":
			# a stretch and a shake of the head on getting up
			var k := bump(u, 0.0, d)
			P.lean -= 0.2 * k
			P.hp = 0.4 * k
			P.jaw = 0.8 * bump(u, 0.1, 0.8)
			P.mouth = "wide" if bump(u, 0.1, 0.8) > 0.4 else "closed"
			P.eye = "closed" if u < 0.7 else "half"
			P.earf -= 0.3 * k
		"yawn":
			var k := bump(u, 0.1, d - 0.2)
			P.hp = 0.45 * k
			P.jaw = 1.0 * k
			P.mouth = "wide" if k > 0.3 else ""
			P.eye = "closed" if k > 0.3 else "half"
			P.earf -= 0.4 * k
			P.lean -= 0.1 * k
		"stretch":
			# front down, rear up (a bow), then the other way
			var a := bump(u, 0.05, 1.1)
			var c := bump(u, 1.0, d - 0.05)
			P.pitch += 0.35 * a - 0.15 * c
			P.crouch += 0.3 * a
			P.jaw = 0.8 * bump(u, 0.2, 0.9)
			P.eye = "closed" if a > 0.4 else ""
			P.tp += 0.6 * a
			P.hp = 0.3 * a
			P.earf -= 0.4 * a
		"shake":
			var k := sm(0.0, 0.1, u) * sm(d, d - 0.2, u)
			P.roll += sin(u * TAU * 7.0) * 0.18 * k
			P.hy = sin(u * TAU * 7.0 + 0.8) * 0.6 * k
			P.ht = sin(u * TAU * 7.0 + 0.3) * 0.4 * k
			P.hk = 4.0
			P.earo += 0.4 * k * absf(sin(u * TAU * 7.0))
			P.eye = "closed" if k > 0.5 else ""
			P.ty += sin(u * TAU * 7.0 + 1.5) * 0.6 * k
		"scratch":
			# a hind foot up to scratch behind the ear
			var k := sm(0.0, 0.25, u) * sm(d, d - 0.25, u)
			P.roll -= 0.12 * k
			P.ht = -0.35 * k
			P.hy = 0.3 * k
			P.eye = "happy" if k > 0.5 else ""
			for l in legs:
				if not l.front and l.sg > 0.0:
					l.lift = k
					l.reach = _under_waist(rest_at(HEAD) + Vector3(0.6 * l.L1, -0.4 * l.L1, -0.4 * l.L1)) if HEAD >= 0 else Vector3(NAN, 0, 0)
					l.reach += Vector3(0, sin(u * 40.0) * 0.08 * l.L1, 0) * k
					l.reach_w = k
		"tail_whip":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.2, u)
			P.yaw += 0.5 * k
			P.lean += 0.15 * k
			P.tp += 0.5 * k
			P.wag = 1.6 * k
			P.wagf = 9.0
			P.hy = -0.9 * k
			P.eye = "happy"
			P.mouth = "smile"
		"taunt":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
			P.crouch -= 0.15 * k
			P.lean -= 0.1 * k
			P.hp = 0.25 * k
			P.ht = 0.3 * sin(u * 6.0) * k
			P.eye = "angry"
			P.mouth = "smile"
			P.jaw = 0.2 * k
			P.tp += 0.5 * k
			P.wag = 0.8 * k
			for i in 2: P.arm_up[i] += 0.8 * k; P.elbow[i] += 0.6 * k
			var bb := bump(u, 0.9, 1.25)
			P.y += 0.15 * sz * bb
			P.air = 1.0 if bb > 0.3 else P.air
			P.legs = "tuck"
		"tackle":
			_strike(P, dt, u, d, 1.0, false)
		"hurt":
			var hit := sm(0.0, 0.05, u) * sm(0.85, 0.3, u)
			P.fwd -= 0.35 * sz * hit
			P.pitch -= 0.3 * hit
			P.lean -= 0.3 * hit
			P.roll += 0.12 * hit
			P.y += 0.1 * sz * bump(u, 0.0, 0.25)
			P.hp = 0.4 * hit
			P.hy = -0.35 * hit
			P.hk = 3.0
			P.earf -= 0.8 * hit
			P.earo += 0.4 * hit
			P.tp += 0.4 * hit
			P.jaw = 0.5 * bump(u, 0.02, 0.5)
			P.eye = "squeeze" if u < 0.45 else "sad"
			P.mouth = "wide" if u < 0.4 else "frown"
			P.sq += 0.15 * bump(u, 0.0, 0.2)
			for i in 2: P.arm_up[i] += 0.6 * hit; P.arm_out[i] += 0.4 * hit
		"flinch":
			var j := sm(0.0, 0.04, u) * sm(d, 0.2, u)
			P.fwd -= 0.1 * sz * j
			P.crouch += 0.4 * j
			P.lean -= 0.15 * j
			P.hp = -0.35 * j
			P.hy = 0.4 * j
			P.hk = 3.0
			P.earf -= 0.9 * j
			P.eye = "squeeze" if u < 0.3 else "sad"
			P.mouth = "frown"
			P.tp -= 0.3 * j
			for i in 2: P.arm_up[i] += 0.9 * j; P.arm_in[i] += 0.6 * j; P.elbow[i] += 1.0 * j
		"faint":
			var wob := sm(0.0, 0.15, u) * sm(0.8, 0.5, u)
			P.roll += sin(u * 11.0) * 0.12 * wob
			P.hp = -0.4 * wob
			P.eye = "sad" if u < 0.3 else ("half" if u < 0.6 else "closed")
			faint_w = sm(0.5, 1.1, u)
			P.y += 0.08 * sz * bump(u, 0.45, 0.65)
		"quick_attack":
			# a crouch and a blur forward, low: a streak to the target and a skid back round
			var c0 := 0.12
			var c1 := 0.3
			var go := sm(c0, c1, u)
			var back := sm(0.55, d - 0.08, u)
			streak = u > c0 and u < 0.5
			P.fwd += act_reach * (go - back * 1.0)
			P.crouch += 0.7 * bump(u, 0.0, c0 + 0.05) + 0.5 * (go - back)
			P.lean += 0.35 * go * (1.0 - back)
			P.quad = 1.0
			P.earf -= 0.9 * sm(0.0, 0.1, u)
			P.tp -= 0.3 * go * (1.0 - back)
			P.eye = "angry"
			P.y += 0.25 * sz * bump(u, c1 - 0.02, 0.5)
			P.air = 1.0 if u > c0 and u < 0.5 else 0.0
			P.legs = "tuck"
			if _ev("hit", c1):
				impact.emit(act)
				fx.emit("hit", point("head"))
		"bite", "hyper_fang", "super_fang":
			# reared back, the jaws wide, the lunge and the snap shut on the target
			var c0 := 0.35 * d
			var c1 := 0.5 * d
			var load := sm(0.0, c0, u) * (1.0 - sm(c0, c1, u))
			var lunge := sm(c0, c1, u) * (1.0 - sm(c1 + 0.12, d - 0.05, u))
			P.lean += -0.2 * load + 0.35 * lunge
			P.crouch += 0.5 * load
			P.fwd += act_reach * 0.8 * lunge - 0.15 * sz * load
			P.y += 0.25 * sz * bump(u, c0, c1 + 0.1)
			P.air = 1.0 if lunge > 0.3 and u < c1 + 0.05 else P.air
			P.legs = "tuck"
			P.hp = 0.35 * load - 0.15 * lunge
			P.jaw = 1.1 * sm(0.0, c0, u) * (1.0 - sm(c1 - 0.03, c1 + 0.02, u)) + 0.15 * lunge
			P.mouth = "wide" if u < c1 else "closed"
			P.eye = "angry"
			P.earf -= 0.8 * (load + lunge)
			P.hk = 3.0
			if _ev("hit", c1):
				impact.emit(act)
				fx.emit("bite", point("mouth"))
		"dig":
			# down on its front, the forepaws tearing at the ground, sinking into it
			var k := sm(0.0, 0.25, u)
			var sink := sm(0.6, d - 0.1, u)
			P.lean += 0.5 * k
			P.pitch += 0.35 * k
			P.crouch += 0.8 * k
			P.y -= sz * 3.0 * sink * sink
			P.earf -= 0.7 * k
			P.tp += 0.6 * k
			P.eye = "squeeze" if fposmod(u * 6.0, 1.0) < 0.5 else "angry"
			var scrab := sin(u * TAU * 7.0)
			for i in 2:
				P.arm_up[i] += (0.6 + 0.5 * scrab * (1.0 if i == 0 else -1.0)) * k
				P.elbow[i] += 0.6 * k
			for l in legs:
				if l.front:
					l.reach = _under_waist(rest_at(l.up)) + _body_basis() * Vector3(l.sg * 0.15, -0.9 + 0.2 * scrab * l.sg, 0.5 + 0.2 * scrab * l.sg) * (l.L1 + l.L2)
					l.reach_w = k
			P.air = 1.0 if sink > 0.05 else 0.0
			P.legs = "tuck"
			for i in 6:
				if _ev("d%d" % i, 0.2 + i * 0.22): fx.emit("dust", global_position)
			if _ev("b", d - 0.15): fx.emit("burrow", global_position)
		"emerge":
			# bursting up out of the ground, a hop, a shake of dirt
			var up := sm(0.0, 0.3, u)
			P.y -= sz * 3.0 * (1.0 - up)
			P.y += 0.6 * sz * bump(u, 0.2, 0.6)
			P.air = 1.0 if u < 0.6 else 0.0
			P.legs = "tuck"
			P.sq -= 0.2 * bump(u, 0.15, 0.5)
			P.sq += 0.3 * bump(u, 0.55, 0.75)
			P.eye = "angry"
			P.mouth = "open"
			P.roll += sin(u * 40.0) * 0.1 * bump(u, 0.6, d)
			if _ev("e", 0.1): fx.emit("emerge", global_position)
			if _ev("hit", 0.35): impact.emit(act)
		"double_kick":
			# all fours: the front planted, the hind legs bucked back, twice; on two feet: two quick
			# front kicks, one foot then the other
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.2, u)
			for n in 2:
				var at := 0.3 + n * 0.5
				var kk := bump(u, at - 0.2, at + 0.2)
				if _ev("hit%d" % n, at):
					impact.emit(act)
					fx.emit("kick", point("foot_l" if n == 0 else "foot_r"))
				for l in legs:
					if l.front: continue
					if stance == "quad":
						l.reach = _under_waist(rest_at(l.up)) + _body_basis() * Vector3(l.sg * 0.15, -0.3, -0.95) * (l.L1 + l.L2)
						l.reach_w = maxf(l.reach_w, kk)
					elif (n == 0) == (l.sg > 0.0):
						l.reach = _under_waist(rest_at(l.up)) + _body_basis() * Vector3(l.sg * 0.1, -0.55, 0.8) * (l.L1 + l.L2)
						l.reach_w = maxf(l.reach_w, kk)
				if stance == "quad":
					P.pitch += 0.45 * kk
					P.lean += 0.15 * kk
					P.y += 0.15 * sz * kk
				else:
					P.lean -= 0.25 * kk
					P.side += (0.15 if n == 0 else -0.15) * sz * kk
			P.eye = "angry"
			P.mouth = "frown"
			P.tp += 0.5 * k
			P.hp = 0.2 * k
		"horn_attack", "peck", "fury_attack":
			# head down, the horn (or the beak) driven at the target: once, or a flurry of jabs
			var n := 3 if act == "fury_attack" else 1
			var lean := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.lean += 0.25 * lean
			P.crouch += 0.3 * lean
			P.hp = -0.45 * lean
			P.earf -= 0.6 * lean
			P.eye = "angry"
			var jab := 0.0
			for k in n:
				var at := 0.4 + k * 0.3 if n > 1 else 0.5 * d
				jab = maxf(jab, bump(u, at - 0.15, at + 0.1))
				if _ev("j%d" % k, at):
					impact.emit(act)
					fx.emit("horn", point("horn"))
			P.fwd += (0.3 * sz + act_reach * (0.5 if n == 1 else 0.25)) * jab - 0.1 * sz * lean
			P.pitch += 0.2 * jab
			P.hp -= 0.2 * jab
			P.y += 0.1 * sz * jab
		"poison_sting":
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.2, u)
			var jab := bump(u, 0.35, 0.65)
			P.lean += 0.3 * k + 0.2 * jab
			P.crouch += 0.3 * k
			P.fwd += 0.3 * act_reach * jab
			P.hp = -0.3 * k
			P.eye = "angry"
			P.tp += 0.5 * k
			if _ev("hit", 0.5):
				impact.emit(act)
				fx.emit("sting", point("horn"))
		"pound", "double_slap", "scratch_attack":
			# a step in and an arm swung down at the target (twice for double slap, both sides)
			var n := 2 if act == "double_slap" else 1
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.2, u)
			P.fwd += 0.35 * act_reach * k
			P.lean += 0.15 * k
			P.eye = "angry"
			P.mouth = "frown"
			for m in n:
				var at := 0.45 * d / n + m * 0.55
				var wind := bump(u, at - 0.3, at - 0.02)
				var hit := bump(u, at - 0.05, at + 0.2)
				var j := m % 2 if act == "double_slap" else 0
				P.arm_up[j] += 2.2 * wind + 0.6 * hit
				P.arm_out[j] += 0.5 * wind
				P.arm_in[j] += 1.0 * hit
				P.twist += (0.35 * wind - 0.4 * hit) * (1.0 if j == 0 else -1.0)
				if _ev("h%d" % m, at):
					impact.emit(act)
					fx.emit("slash" if act == "scratch_attack" else "hit", point("hand_l" if j == 0 else "hand_r"))
		"sing":
			# a sway from side to side, the mouth open in a song, the eyes shut: a note each beat
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.4, u)
			var beat := u * 1.6
			sing_beat = fposmod(beat, 1.0)
			P.roll += sin(beat * TAU) * 0.2 * k
			P.side += sin(beat * TAU) * 0.08 * sz * k
			P.ht = sin(beat * TAU) * 0.3 * k
			P.hp = 0.2 * k
			P.eye = "closed" if k > 0.3 else ""
			P.mouth = "wide" if k > 0.3 else ""
			P.jaw = 0.4 * k
			for i in 2:
				P.arm_up[i] += (0.9 + 0.2 * sin(beat * TAU + i * PI)) * k
				P.arm_in[i] += 0.5 * k
			P.y += absf(sin(beat * TAU)) * 0.04 * sz * k
			for n in 6:
				if _ev("n%d" % n, 0.3 + n / 1.6 * 0.8): fx.emit("note", point("mouth"))
		"defense_curl":
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.3, u)
			P.crouch += 1.0 * k
			P.lean += 0.6 * k
			P.hp = -0.6 * k
			P.curl = k
			P.lie = 0.6 * k
			P.eye = "squeeze"
			for i in 2: P.arm_up[i] += 0.8 * k; P.arm_in[i] += 1.0 * k; P.elbow[i] += 1.0 * k
			if _ev("g", 0.4): fx.emit("glow", point("chest"))
		"ember":
			# reared up, a breath in, the head thrown forward and fire from the mouth
			var load := bump(u, 0.0, 0.45)
			var blow := bump(u, 0.4, d - 0.1)
			P.lean += -0.25 * load + 0.25 * blow
			P.hp = 0.35 * load - 0.2 * blow
			P.hfwd += 0.12 * sz * blow
			P.jaw = 0.9 * blow
			P.mouth = "wide" if blow > 0.2 else "closed"
			P.eye = "angry"
			P.tp += 0.4 * load
			for n in 3:
				if _ev("e%d" % n, 0.45 + n * 0.12): fx.emit("ember", point("mouth"))
			if _ev("hit", 0.6): impact.emit(act)
		"stomp":
			var lift := bump(u, 0.1, 0.55)
			var slam := sm(0.5, 0.58, u)
			for l in legs:
				if not l.front and l.sg > 0.0:
					l.lift = lift
			P.lean -= 0.15 * lift
			P.side -= 0.1 * sz * lift
			P.roll -= 0.1 * lift
			P.sq += 0.3 * bump(u, 0.55, 0.8)
			P.y -= 0.05 * sz * bump(u, 0.55, 0.8)
			P.eye = "angry"
			P.mouth = "wide" if lift > 0.3 else "frown"
			if _ev("hit", 0.56):
				impact.emit(act)
				fx.emit("quake", global_position)
		"focus_energy":
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.3, u)
			P.crouch += 0.4 * k
			P.lean += 0.1 * k
			P.y += sin(u * 60.0) * 0.006 * sz * k
			P.eye = "squeeze" if u < 0.9 else "angry"
			P.mouth = "frown"
			P.earf -= 0.5 * k
			P.tp += 0.6 * k
			for i in 2: P.arm_in[i] += 0.5 * k; P.elbow[i] += 0.8 * k
			if _ev("g", 0.5): fx.emit("glow", point("chest"))
		"groom":
			# a forepaw licked and drawn over the face, twice
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.3, u)
			P.hp = -0.25 * k
			P.ht = 0.3 * k
			P.hy = 0.35 * k
			P.eye = "happy" if k > 0.5 else ""
			P.crouch += 0.2 * k
			var rub := sin(u * TAU * 2.5)
			for l in legs + arms:
				if l.front and l.sg > 0.0 and HEAD >= 0:
					l.reach = pose_g(HEAD).origin + _body_basis() * Vector3(0.25 * sz, (-0.3 + 0.35 * rub) * sz, 0.35 * sz)
					l.reach_w = k
			P.jaw = 0.3 * k * maxf(0.0, -rub)
		"flee":
			var k := sm(0.0, 0.1, u)
			P.crouch += 0.6 * bump(u, 0.0, 0.25)
			P.lean += 0.25 * k
			P.earf -= 0.8 * k
			P.tp -= 0.2 * k
			P.eye = "open"
			P.mouth = "open"
			P.hp = 0.1 * k

# tackle (and the like): a crouch, a launch body first into the target act_reach ahead,
# the bounce back off it and a hop home. power: how far up it flies; low: a skim
func _strike(P: Dictionary, _dt: float, u: float, d: float, power: float, low: bool) -> void:
	var R := act_reach
	var c0 := 0.3 * d / 1.2
	var c1 := 0.5 * d / 1.2
	var c2 := 0.78 * d / 1.2
	var c3 := d - 0.12
	var cr := sm(0.0, c0 * 0.8, u) * sm(c0 + 0.05, c0 - 0.02, u)
	P.crouch += 0.8 * cr
	P.sq += 0.3 * cr
	P.fwd -= 0.15 * sz * cr
	P.lean += 0.3 * cr
	P.earf -= 0.6 * sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
	P.hk = 3.0
	P.eye = "angry"
	P.mouth = "frown"
	var x := 0.0
	var y := 0.0
	if u >= c0 and u < c1:
		var e := (u - c0) / (c1 - c0)
		x = R * e * e * (3.0 - 2.0 * e)
		y = (0.6 if not low else 0.15) * sz * sin(e * PI) * power
		P.pitch += 0.35
		P.lean += 0.2
		P.sq -= 0.2
		P.hp = -0.25
		P.air = 1.0
		P.legs = "tuck"
		P.tp -= 0.3
		for i in 2: P.arm_up[i] += 1.3; P.elbow[i] -= 0.4
	elif u >= c1 and u < c2:
		var e := (u - c1) / (c2 - c1)
		if _ev("hit", c1):
			impact.emit(act)
			fx.emit("hit", point("head"))
		x = R - 0.45 * R * sm(0.0, 1.0, e)
		y = 0.45 * sz * sin(e * PI) * power
		P.pitch -= 0.3 * bump(e, 0.0, 0.8)
		P.sq += 0.3 * bump(e, 0.0, 0.25)
		P.air = 1.0
		P.legs = "tuck"
		P.eye = "squeeze" if e < 0.3 else "angry"
	elif u >= c2 and u < c3:
		var e := (u - c2) / (c3 - c2)
		x = R * 0.55 * (1.0 - sm(0.0, 1.0, e))
		y = 0.25 * sz * sin(e * PI)
		P.air = 1.0 if e < 0.9 else 0.0
		P.legs = "tuck"
	var landing := bump(u, c3 - 0.04, d + 0.1)
	P.crouch += 0.5 * landing
	P.sq += 0.25 * landing
	if _ev("touch", c3): footfalls += 1
	P.fwd += x
	P.y += y

# ---------- standing life ----------
func _auto(dt: float, v: float) -> void:
	_next_ear -= dt
	_next_tail -= dt
	if _next_ear <= 0.0:
		_next_ear = rng.randf_range(0.8, 3.5) / maxf(0.2, float(gait.ear_flick))
		if not ears.is_empty():
			var i := rng.randi() % ears.size()
			_ear_kick[i] = rng.randf_range(0.6, 1.0)
			if rng.randf() < 0.3: _ear_kick[1 - i if ears.size() == 2 else i] = rng.randf_range(0.4, 0.8)
	if _next_tail <= 0.0:
		_next_tail = rng.randf_range(1.2, 4.0)
		_tail_kick = rng.randf_range(0.5, 1.0) * (1.0 if rng.randf() < 0.5 else -1.0)
	if not auto or act != "" or hiding or fainted or sleep or battle or v > 0.08: return
	_next_auto -= dt
	if _next_auto <= 0.0:
		_next_auto = rng.randf_range(2.5, 6.0)
		var idle: Dictionary = I.get("idle", {"look": 1.0, "sniff": 1.0})
		var tot := 0.0
		for k in idle: tot += float(idle[k])
		var x := rng.randf() * tot * 1.25
		for k in idle:
			x -= float(idle[k])
			if x <= 0.0:
				mood(k)
				break

# ---------- the gait ----------
func _offsets() -> PackedFloat32Array:
	# hind L, hind R, front L, front R
	if legs.size() < 4: return PackedFloat32Array([0.0, 0.5])
	var walk := PackedFloat32Array([0.0, 0.5, 0.25, 0.75])
	var run: PackedFloat32Array
	match String(gait.run_gait):
		"bound": run = PackedFloat32Array([0.0, 0.06, 0.5, 0.56])
		"gallop": run = PackedFloat32Array([0.0, 0.12, 0.45, 0.6])
		_: run = PackedFloat32Array([0.0, 0.5, 0.5, 0.0])
	var o := PackedFloat32Array()
	for i in 4: o.append(lerpf(walk[i], run[i], run_w))
	return o

func _gait(dt: float, v: float, P: Dictionary) -> void:
	var yaw := global_rotation.y
	var k := skel.global_transform.basis.get_scale().x
	var air: bool = P.air > 0.5 or faint_w > 0.3 or P.lie > 0.5
	if air:
		for l in legs: l.u = -1.0
		_was_air = true
		return
	if _was_air:
		_was_air = false
		for l in legs:
			l.p = _neutral(l, yaw, 0.0); l.yaw = yaw; l.u = -1.0
		footfalls += 1
		body_y.y -= 0.6 * sz
	var wv := float(gait.walk_v)
	var rv := float(gait.run_v)
	run_w = damp(run_w, sm(lerpf(wv, rv, 0.45), rv, v), 6.0, dt)
	walk_w = sm(0.02, 0.15, v)
	var L := leg_len * k
	stride = damp(stride, L * lerpf(float(gait.stride), float(gait.run_stride), run_w) * clampf(0.55 + 0.45 * v / maxf(0.05, wv), 0.55, 1.6), 6.0, dt)
	duty = lerpf(float(gait.duty), float(gait.run_duty), run_w)
	var moving := v > 0.03 and hide_w < 0.95
	var rate := v / maxf(0.02, stride)
	var ph0 := phase
	if moving: phase += rate * dt
	var swing := (1.0 - duty) / maxf(rate, 1.6)
	var offs := _offsets()
	var n := legs.size()
	# a biped that runs on all fours: down onto its hands as it speeds up
	if bool(gait.quad_run):
		quad_w = damp(quad_w, maxf(1.0 if run_w > 0.55 else 0.0, float(P.quad)), 7.0, dt)
	for i in n:
		var l: Leg = legs[i]
		if l.free:
			if quad_w < 0.5:
				l.u = -1.0
				l.p = to_world(G[l.end].origin)
				l.p.y = global_position.y
				l.yaw = yaw
				continue
			elif l.u < 0.0 and l.p.distance_to(_neutral(l, yaw, 0.0)) > 0.6 * L and not moving:
				pass
		var off: float = offs[i] if i < offs.size() else 0.0
		var late := false
		if moving and l.u < 0.0:
			var nb := _neutral(l, yaw, 0.0)
			var behind := Vector2(l.p.x - nb.x, l.p.z - nb.z).length()
			if behind > stride * duty * 0.5 + 0.35 * L:
				late = true
				phase = off + floor(phase - off) + 1e-4
		if moving and l.u < 0.0 and (late or floor(phase - off) > floor(ph0 - off)):
			var lead := stride * duty * 0.5
			l.from = l.p; l.fromyaw = l.yaw
			l.to = _neutral(l, yaw + turn_v * swing, lead) + _vel * swing
			l.toyaw = yaw + turn_v * swing
			l.dur = swing; l.u = 0.0
			l.h = L * float(gait.step_h) * lerpf(1.0, 1.6, run_w)
		elif not moving and l.u < 0.0:
			var others := true
			for j in n:
				if j != i and legs[j].u >= 0.0: others = false
			if others:
				var want := _neutral(l, yaw, 0.0)
				var off2 := Vector2(l.p.x - want.x, l.p.z - want.z).length()
				if off2 > 0.22 * L or absf(wrapf(l.yaw - yaw, -PI, PI)) > 0.4:
					l.from = l.p; l.fromyaw = l.yaw; l.to = want; l.toyaw = yaw
					l.dur = 0.16 + 0.1 * L; l.u = 0.0; l.h = 0.12 * L
		if l.u >= 0.0:
			l.u = minf(1.0, l.u + dt / maxf(0.05, l.dur))
			if moving:
				var left: float = (1.0 - l.u) * l.dur
				var tgt: Vector3 = _neutral(l, yaw + turn_v * left, stride * duty * 0.5) + _vel * left
				l.to = l.to.lerp(tgt, 1.0 - exp(-dt * 8.0))
				l.toyaw = yaw + turn_v * left
			if l.u >= 1.0:
				l.p = l.to; l.yaw = l.toyaw; l.u = -1.0
				footfalls += 1
	# the body over its steps
	var ph := fposmod(phase, 1.0)
	var mw := walk_w
	if quad_w > 0.01:
		P.pitch += float(gait.get("quad_pitch", 1.3)) * quad_w
		P.crouch += float(gait.get("quad_crouch", 0.6)) * quad_w
		P.earf -= 0.4 * quad_w
		P.tp -= float(gait.get("quad_pitch", 1.3)) * quad_w * float(gait.get("quad_tail", 0.85))
	if stance == "quad" or quad_w > 0.5:
		# all fours: a bob each footfall walking; running, the back flexes and stretches
		P.y += -cos(ph * TAU * 2.0) * float(gait.bob) * sz * mw * (1.0 - run_w)
		var fl := sin((ph - 0.25) * TAU)
		P.y += absf(sin(ph * TAU)) * float(gait.run_bob) * sz * run_w
		P.pitch += fl * float(gait.spine_flex) * 0.5 * run_w
		P.bend += fl * float(gait.spine_flex) * run_w
		P.lean += float(gait.pitch_run) * run_w * 0.5
	else:
		# two feet: down at each footfall, up passing; the weight from foot to foot
		var b2 := -cos(ph * TAU * 2.0)
		P.y += b2 * float(gait.bob) * sz * mw * (1.0 - 0.3 * run_w) + absf(sin(ph * TAU)) * float(gait.run_bob) * sz * run_w
		P.side += sin(ph * TAU) * float(gait.sway) * sz * mw
		P.roll += sin(ph * TAU) * (float(gait.waddle) + 0.04) * mw
		P.twist += sin(ph * TAU) * 0.12 * mw
		P.lean += float(gait.pitch_run) * run_w + 0.05 * mw
		var sw := float(gait.arm_swing) * mw * (1.0 + run_w)
		P.arm_sw[0] += sin(ph * TAU) * sw
		P.arm_sw[1] -= sin(ph * TAU) * sw
		for i in 2: P.elbow[i] += 0.6 * run_w + 0.15 * mw
	P.hup += -cos(ph * TAU * 2.0) * float(gait.head_bob) * 0.02 * sz * mw
	P.roll += clampf(-turn_v * v * 0.06, -0.2, 0.2)
	P.tp += 0.15 * run_w
	P.earf -= 0.35 * run_w
	P.ty -= turn_v * 0.15

func _foot(l: Leg) -> Array:
	if l.u < 0.0: return [l.p, 0.0, l.yaw]
	var u: float = l.u
	var e := u * u * (3.0 - 2.0 * u)
	var p2: Vector3 = l.from.lerp(l.to, e)
	var h: float = l.h * sin(PI * minf(1.0, u * 1.1))
	return [p2 + Vector3.UP * h, u, lerp_angle(l.fromyaw, l.toyaw, e)]

# ---------- the body ----------
func _body(P: Dictionary, dt: float) -> void:
	var k := skel.global_transform.basis.get_scale().x
	var cr: float = P.crouch
	var base := sz * (1.0 - float(gait.crouch_h) * clampf(cr, -0.5, 1.5))
	# lying down (asleep, fainted): the belly on the ground
	var lie := maxf(float(P.lie), faint_w)
	base = lerpf(base, sz * float(gait.lie), lie)
	body_y = spring(body_y, 0.0, 14.0, dt, 0.5)
	var y: float = base + float(P.y) + body_y.x + height
	body_p = spring(body_p, float(P.pitch) + 0.1 * lie, 18.0, dt, 0.8)
	body_r = spring(body_r, float(P.roll), 16.0, dt, 0.75)
	var roll := body_r.x
	if faint_w > 0.01: roll = lerpf(roll, float(I.get("faint_roll", 1.25)), faint_w)
	var basis := Basis(Vector3.UP, float(P.yaw)) * Basis(Vector3.RIGHT, body_p.x) * Basis(Vector3(0, 0, 1), -roll)
	var wp := Vector3(rest_at(W).x + float(P.side), y, rest_at(W).z + float(P.fwd))
	# standing: no higher than the planted feet reach
	if P.air < 0.5 and lie < 0.3:
		for l in legs:
			if l.u >= 0.0 or l.free: continue
			var pl := to_skel(l.p)
			var hip := rest_at(l.up)
			var hx := Vector2(pl.x - hip.x, pl.z - hip.z - float(P.fwd)).length()
			var r2 := (l.L1 + l.L2) * 0.985
			var dyh := hip.y - rest_at(W).y
			if hx < r2: wp.y = minf(wp.y, pl.y + l.ank + sqrt(r2 * r2 - hx * hx) - dyh)
	_Tw = Transform3D(basis * rest_g[W].basis, wp)
	set_local_pos(W, rest_g[parent[W]].affine_inverse() * wp)
	set_global(W, basis * rest_g[W].basis)
	# the torso: lean (forward), bend (the back arched / flexed), twist and side bend
	lean_s = spring(lean_s, float(P.lean), 14.0, dt, 0.7)
	var ns := maxi(1, spine.size())
	for s in spine:
		turn_rest(s, Vector3.RIGHT, (lean_s.x + float(P.bend)) / ns)
		turn_rest(s, Vector3.UP, float(P.twist) / ns)
	if HIPS >= 0:
		turn_rest(HIPS, Vector3.RIGHT, -float(P.bend) * 0.5)
		turn_rest(HIPS, Vector3.UP, -float(P.twist) * 0.6)
	# squash and stretch (the torso only, the legs keep their length)
	sq = spring(sq, float(P.sq), 22.0, dt, 0.45)
	var q := clampf(sq.x, -0.4, 0.4)
	if not spine.is_empty():
		skel.set_bone_pose_scale(spine[0], Vector3(1.0 + q * 0.5, 1.0 - q, 1.0 + q * 0.5))

func _under_waist(p_rest: Vector3) -> Vector3:
	return _Tw * (rest_g[W].affine_inverse() * p_rest)

# this frame's skeleton-space pose of a bone, from the targets set so far
func pose_g(i: int) -> Transform3D:
	if _fk.has(i): return _fk[i]
	var pi := parent[i]
	var pg: Transform3D = pose_g(pi) if pi >= 0 else Transform3D.IDENTITY
	var lp: Vector3 = _tp.get(i, rest_l[i].origin)
	var lr: Quaternion
	if _tg.has(i): lr = (pg.basis.inverse() * (_tg[i] as Basis)).get_rotation_quaternion()
	elif _tl.has(i): lr = _tl[i]
	else: lr = rest_l[i].basis.get_rotation_quaternion()
	var g := pg * Transform3D(Basis(lr), lp)
	_fk[i] = g
	return g

func _body_basis() -> Basis:
	return _Tw.basis * rest_g[W].basis.inverse()

# two-bone IK: the limb's end to A (skeleton space), the middle joint bent toward pole
func ik(l: Leg, A: Vector3, pole: Vector3) -> void:
	var H := pose_g(parent[l.up]) * rest_l[l.up].origin
	if l.lo < 0:
		aim(l.up, A - H, pole, rest_dir(l.up, l.end), Vector3(0, 0, 1) if absf(rest_dir(l.up, l.end).z) < 0.8 else Vector3.UP)
		return
	var d := A - H
	var dl := d.length()
	var reach := (l.L1 + l.L2) * 0.999
	if dl > reach:
		A = H + d / dl * reach; d = A - H; dl = reach
	dl = maxf(dl, absf(l.L1 - l.L2) + 0.002)
	var a1 := acos(clampf((l.L1 * l.L1 + dl * dl - l.L2 * l.L2) / (2.0 * l.L1 * dl), -1.0, 1.0))
	var axis := d.normalized()
	var pp := (pole - axis * pole.dot(axis))
	if pp.length() < 1e-4: pp = Vector3(0, 0, l.bend) - axis * axis.z * l.bend
	pp = pp.normalized()
	var K := H + axis * (l.L1 * cos(a1)) + pp * (l.L1 * sin(a1))
	var n := (K - H).cross(A - K)
	if n.length() < 1e-6: n = _body_basis() * l.n_rest
	n = n.normalized()
	aim(l.up, K - H, n, rest_dir(l.up, l.lo), l.n_rest)
	aim(l.lo, A - K, n, rest_dir(l.lo, l.end), l.n_rest)

func _legs_ik(P: Dictionary) -> void:
	var W2S := skel.global_transform.affine_inverse()
	var aw: float = P.air
	air_w = aw
	var B := _body_basis()
	var bodyz := (B * Vector3(0, 0, 1)).normalized()
	var lie := maxf(float(P.lie), faint_w)
	for l in legs:
		if l.free and quad_w < 0.01: continue
		var fp := _foot(l)
		var A: Vector3 = W2S * ((fp[0] as Vector3)) + Vector3.UP * l.ank
		if l.free and quad_w < 0.999: A = _arm_target(l, P).lerp(A, quad_w)
		var hip := pose_g(parent[l.up]) * rest_l[l.up].origin
		var reach := l.L1 + l.L2
		var tuck := maxf(aw, lie)
		if tuck > 0.001:
			# in the air: drawn up under the body; lying: folded under it
			var loc: Vector3
			if P.legs == "tuck" or lie > 0.5:
				loc = hip + B * Vector3(l.sg * 0.15 * reach, -0.55 * reach, (0.35 if l.front else 0.25) * reach)
				if lie > 0.5 and l.front: loc = hip + B * Vector3(l.sg * 0.05 * reach, -0.55 * reach, 0.55 * reach)
				if lie > 0.5 and not l.front: loc = hip + B * Vector3(l.sg * 0.2 * reach, -0.5 * reach, 0.45 * reach)
			else:
				loc = hip + B * Vector3(l.sg * 0.1 * reach, -0.85 * reach, 0.1 * reach)
			A = A.lerp(loc, clampf(tuck, 0.0, 1.0))
		if l.lift > 0.0:
			A = A.lerp(hip + B * Vector3(l.sg * 0.15 * reach, -0.5 * reach, 0.45 * reach), l.lift)
		if not is_nan(l.reach.x): A = A.lerp(l.reach, l.reach_w)
		l.lift = 0.0; l.reach = Vector3(NAN, 0, 0); l.reach_w = 0.0
		var pole := (bodyz * l.bend + B * Vector3(l.sg * 0.15, 0, 0)).normalized()
		ik(l, A, pole)
		# the foot: flat on the ground, heading its own way; peeling off as it lifts
		var fy: float = float(fp[2]) - global_rotation.y
		var u: float = fp[1]
		var pitch := 0.0
		if l.u >= 0.0: pitch = 0.5 * sin(PI * u) - 0.25 * sm(0.0, 0.3, u) * (1.0 - sm(0.3, 0.6, u))
		var Bf := Basis(Vector3.UP, fy)
		if tuck > 0.01: Bf = Bf.slerp(B, clampf(tuck, 0.0, 1.0))
		if l.aim_end:
			var fwd := Bf * Vector3(0, -0.35, 1).normalized()
			aim(l.end, fwd, Bf * Vector3.UP, l.end_dir, Vector3.UP if absf(l.end_dir.y) < 0.8 else Vector3(0, 0, 1))
		else:
			set_global(l.end, Bf * Basis(Vector3.RIGHT, pitch) * rest_g[l.end].basis)
		for tb in l.toes: turn_rest(tb, Vector3.RIGHT, -pitch * 0.6)

# ---------- free arms (a biped's) ----------
# where a free arm's hand goes this frame (skeleton space): its hang from the shoulder,
# swung (about the side axis), raised forward and up, out to the side or in across,
# drawn in by the elbow; or an act's reach
func _arm_target(l: Leg, P: Dictionary) -> Vector3:
	var B := _body_basis()
	var j := 0 if l.sg > 0.0 else 1
	var S := pose_g(parent[l.up]) * rest_l[l.up].origin
	var reach := l.L1 + l.L2
	var h := l.hang
	h = Basis(Vector3.RIGHT, -float(P.arm_sw[j]) - float(P.arm_up[j])) * h
	h += Vector3(l.sg * (0.5 * float(P.arm_out[j]) - 0.35 * float(P.arm_in[j])), 0, 0) * reach
	h = h.normalized() * reach * clampf(0.95 - 0.35 * float(P.elbow[j]), 0.4, 0.98)
	var A := S + B * h
	if not is_nan(l.reach.x): A = A.lerp(l.reach, l.reach_w)
	return A

func _arms_pose(P: Dictionary, _dt: float) -> void:
	if arms.is_empty(): return
	var B := _body_basis()
	var bodyz := (B * Vector3(0, 0, 1)).normalized()
	for l in arms:
		if l.free and quad_w >= 0.01: continue
		var A := _arm_target(l, P)
		l.reach = Vector3(NAN, 0, 0); l.reach_w = 0.0
		var pole := (-bodyz * 0.8 + B * Vector3(l.sg * 0.6, -0.2, 0)).normalized()
		ik(l, A, pole)

# ---------- the head ----------
func _head(P: Dictionary, dt: float, v: float) -> void:
	_look_t -= dt
	if _look_t <= 0.0:
		var calm := hide_w > 0.5 or sleep_w > 0.3
		_look_t = rng.randf_range(0.6, 2.4) * (2.0 if calm else 1.0) * (1.0 - 0.6 * float(gait.darty))
		var watch := not is_nan(look_at_pos.x) and rng.randf() < (0.85 if battle else 0.5)
		if watch:
			var hp3 := to_world(G[HEAD].origin)
			var to := look_at_pos - hp3
			var yy := wrapf(atan2(to.x, to.z) - global_rotation.y, -PI, PI)
			_hg = Vector3(clampf(yy, -1.3, 1.3) + rng.randf_range(-0.08, 0.08), clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.5, 0.6), 0.0)
			if rng.randf() < 0.35: _hg.z = rng.randf_range(0.15, 0.35) * signf(rng.randf() - 0.5)
		else:
			var span := 0.4 if calm else (0.3 if v > 0.3 else 0.9)
			_hg = Vector3(rng.randf_range(-span, span), rng.randf_range(-0.15, 0.25), rng.randf_range(-0.25, 0.25) if rng.randf() < 0.4 else 0.0)
	var gy: float = _hg.x if is_nan(float(P.hy)) else float(P.hy)
	var gp: float = _hg.y if is_nan(float(P.hp)) else float(P.hp)
	var gt: float = _hg.z if is_nan(float(P.ht)) else float(P.ht)
	# (a head that is the whole body, Clefairy's: it turns a little, not all the way round)
	var la := float(I.get("look_amp", 1.0))
	gy *= la; gp *= la; gt *= la
	# the head kept level against the body's pitch and lean (a little)
	gp += (body_p.x * lerpf(0.6, 0.9, quad_w) + lean_s.x * 0.5) * float(I.get("head_level", 1.0))
	var om: float = 14.0 * float(P.hk) * float(gait.look_k)
	hy = spring(hy, gy, om, dt, 0.75)
	hp = spring(hp, gp, om, dt, 0.75)
	ht = spring(ht, gt, om * 0.8, dt, 0.7)
	if faint_w > 0.01:
		hy.x = lerpf(hy.x, 0.3, faint_w); hp.x = lerpf(hp.x, -0.1, faint_w); ht.x = lerpf(ht.x, 0.3, faint_w)
	var nn := neck.size()
	var share := 0.4 if nn > 0 else 0.0
	for nb in neck:
		turn_rest(nb, Vector3.UP, hy.x * share / nn)
		turn_rest(nb, Vector3.RIGHT, -hp.x * share / nn)
	turn_rest(HEAD, Vector3.UP, hy.x * (1.0 - share))
	turn_rest(HEAD, Vector3.RIGHT, -hp.x * (1.0 - share))
	turn_rest(HEAD, Vector3(0, 0, 1), ht.x)
	_hfwd = spring(_hfwd, float(P.hfwd), 30.0, dt, 0.8)
	if absf(_hfwd.x) > 1e-5 or absf(float(P.hup)) > 1e-5:
		var off := Vector3(0, float(P.hup), _hfwd.x)
		set_local_pos(HEAD, rest_l[HEAD].origin + rest_g[parent[HEAD]].basis.inverse() * off)
	jaw_s = spring(jaw_s, float(P.jaw), 30.0, dt, 0.7)
	if JAW >= 0: turn_rest(JAW, Vector3.RIGHT, float(I.get("jaw_rest", 0.0)) + clampf(jaw_s.x, -0.1, 1.2) * float(I.get("jaw_open", 0.5)))

# ---------- ears: forward / back (flat), out (drooping), flicks ----------
func _ears(P: Dictionary, dt: float) -> void:
	for i in ears.size():
		var e: Dictionary = ears[i]
		var sg: float = e.sg
		var s: Array = ear_s[i]
		var want := float(P.earf) + float(P.ear_l if sg > 0.0 else P.ear_r)
		if _ear_kick[i] != 0.0:
			s[2] = Vector2(s[2].x, s[2].y + float(_ear_kick[i]) * 30.0)
			_ear_kick[i] = 0.0
		s[0] = spring(s[0], want, 18.0, dt, 0.55)
		s[1] = spring(s[1], float(P.earo), 14.0, dt, 0.6)
		s[2] = spring(s[2], 0.0, 40.0, dt, 0.35)   # the flick
		var ch: PackedInt32Array = e.chain
		var amp := float(I.get("ear_amp", 0.5))
		for k in ch.size():
			var w := 1.0 if k == 0 else 0.5
			turn_rest(ch[k], Vector3.RIGHT, (s[0] as Vector2).x * amp * w)
			turn_rest(ch[k], Vector3(0, 0, 1), -sg * ((s[1] as Vector2).x * amp + (s[2] as Vector2).x * 0.25) * w)
			turn_rest(ch[k], Vector3.UP, sg * (s[2] as Vector2).x * 0.3 * w)

# ---------- tails: lift and sway, delayed down their length (so they whip) ----------
func _tails(P: Dictionary, dt: float, v: float) -> void:
	if _tail_kick != 0.0:
		tail_y.y += _tail_kick * 6.0
		_tail_kick = 0.0
	tail_p = spring(tail_p, float(P.tp) - _acc.length() * 0.02, 10.0, dt, 0.5)
	tail_y = spring(tail_y, float(P.ty), 9.0, dt, 0.45)
	var wag := float(P.wag) * sin(t * float(P.wagf))
	for tl in tails:
		_tail_chain(tl, P, dt, tail_p.x, tail_y.x + wag * 0.5, float(P.curl))

func _tail_chain(tl: Dictionary, P: Dictionary, dt: float, lift: float, sway: float, curl: float) -> void:
	var buf: Array = tl.buf
	buf.push_front(Vector2(lift, sway))
	var lag := float(gait.tail_lag)
	var ch: PackedInt32Array = tl.chain
	var maxn := int(ceil(lag * ch.size() / maxf(dt, 0.008))) + 2
	while buf.size() > maxn: buf.pop_back()
	var shape: Array = I.get("tail_shape", [])
	var bend: Array = I.get("tail_curve", [])
	var amp := float(gait.tail_sway)
	for k in ch.size():
		var d := mini(buf.size() - 1, int(round(k * lag / maxf(dt, 0.008))))
		var s: Vector2 = buf[d]
		var w := (1.0 + 0.6 * float(k) / ch.size()) / (ch.size() * 1.3)
		var base := float(shape[k]) if k < shape.size() else 0.0
		var side := float(bend[k]) if k < bend.size() else 0.0
		turn_rest(ch[k], Vector3.UP, side + s.y * w * (1.0 + amp * 4.0) + curl * 0.35)
		turn_rest(ch[k], Vector3.RIGHT, base + s.x * w + curl * 0.25)

# ---------- the face: eyes and mouth from their sheets ----------
# every X/Y sheet is the same 2 x 4 atlas (offsets from the first cell)
const EYES := {"open": Vector2(0, 0), "angry": Vector2(0.5, 0), "half": Vector2(0, 0.25), "happy": Vector2(0.5, 0.25),
	"closed": Vector2(0, 0.5), "sad": Vector2(0.5, 0.5), "squeeze": Vector2(0, 0.75), "extra": Vector2(0.5, 0.75)}
const MOUTHS := {"closed": Vector2(0, 0), "open": Vector2(0.5, 0), "smile": Vector2(0, 0.25), "frown": Vector2(0.5, 0.25),
	"wide": Vector2(0, 0.5), "pout": Vector2(0.5, 0.5), "flat": Vector2(0, 0.75)}

func _cell(table: Dictionary, own: String, n: String) -> Vector2:
	var o: Dictionary = I.get(own, {})
	if o.has(n): return Vector2(float(o[n][0]), float(o[n][1]))
	return table.get(n, Vector2.ZERO)

func _face(P: Dictionary, dt: float) -> void:
	blink -= dt
	var e: String = P.eye
	if e == "": e = emote if emote in EYES or I.get("eyes", {}).has(emote) else "open"
	if fainted and faint_w > 0.5: e = "closed"
	if e in ["open", "angry", "half", "sad"] and blink < 0.0:
		e = "half" if blink > -0.04 or blink < -0.11 else "closed"
		if blink < -0.15: blink = rng.randf_range(1.5, 5.0) * (0.6 if battle else 1.0)
	if e != _eye and eye_mat:
		_eye = e
		eye_mat.set_shader_parameter("uv_off", _cell(EYES, "eyes", e))
	var m: String = P.mouth
	if m == "": m = "smile" if emote == "happy" else ("frown" if emote in ["angry", "sad"] else "closed")
	if m != _mouth and mouth_mat:
		_mouth = m
		mouth_mat.set_shader_parameter("uv_off", _cell(MOUTHS, "mouths", m))
