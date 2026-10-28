class_name CreaturePidgey
extends Creature
# Pidgey (Route 1's wild ones). Rig: Waist (the round body) - Hips - L/RThigh -
# Leg - Foot (toes A, B forward, C the hind toe) and Tail1 - Tail2; Spine1 -
# Spine2 (the chest; Feeler: the bib of chest feathers) - Spine3 (the neck) -
# Head (Hair: the crest, LowerBeak). Each wing is there twice: folded at the
# side (L/RFeeler1 - Feeler2, the mesh "fold_l/r") and spread (L/RShoulder -
# Arm - ForeArm - Hand, "wing_l/r", the bind pose fans it out along x); one of
# each pair shows at a time: a wing spreading out from the side swaps the
# folded mesh for the open one (posed folded) and opens that, and back.
# L is the bird's left (+x). Facing +z, about 0.36 m to the top of its head.
#
#   var p := Creature.make("pidgey") as CreaturePidgey
#   p.animate(dt, speed)          # speed: ground or air speed (m/s) the owner moves it at
#   p.mood("peck")                # one-off acts (busy() while one plays; act_done(name) after)
#   p.flying / p.fly_height       # in the air at that height over its position (set
#                                 # flying = true to put it there at once; takeoff / land move it)
#   p.glide = true                # in the air: wings held out instead of flapping
#   p.battle = true               # a fighting stance standing (no idle pecking)
#   p.look_at_pos = Vector3(...)  # watch something (Ash)
#
# Moods: idle (back to the plain idle: leaves hide / faint), peck, look, ruffle,
# startle, hop, walk / run (by speed; the moods only start it in place), takeoff,
# fly, glide, land, hide (pressed low in the grass until another mood), and the
# battle acts: gust, tackle, quick_attack, sand_attack, hurt, flinch, flee, faint
# (lies there until "idle" or reset()), taunt, wings_spread.
#
# For the battle's effects:
#   signal wing_beat(power)  each power stroke of the wings (gust, takeoff, flight), at
#                            the stroke's fastest point; power 0..1 (gust's are 1)
#   beat_phase               0..1 through the current wing beat (0 = wings up, 0.5 =
#                            the end of the downstroke / gust's push)
#   gusting                  true while gust's beats play (wind on)
#   signal impact(act)       tackle / quick_attack reach their target (act_reach ahead)
#   signal kick()            each scoop of sand_attack's wings (throw sand forward)
#   streak                   quick_attack's dash (speed lines)
#   act_reach                how far ahead tackle / quick_attack strike (m, default 1.0)
#   wing_tip(side)           a wing tip's world point (side 1 left, -1 right)
#   beak_point()             the beak's world point
#
# ---- how it moves ----
# On the ground it walks like a pigeon: quick short steps (feet planted, two-bone IK,
# the heel bending back), the head held still in the air while the body passes under
# it and then thrust forward, a step at a time; faster it scurries (the bob fades,
# wings held a little out). Standing it is never still: the head darts from look to
# look (snappy springs that overshoot a little, a tilt to look with one eye), the
# crest and tail flick, the folded wings twitch, it breathes, and now and then pecks,
# looks round, ruffles or hops (auto). Flying: the wings beat (a fast, fully spread
# downstroke, the upstroke folded at the wrist), the body bobs against them, legs
# tucked; gliding, the wings are held out with a little dihedral.

signal wing_beat(power: float)
signal impact(act: String)
signal kick()
signal act_done(act: String)

var flying := false
var fly_height := 1.4
var glide := false
var battle := false
var auto := true
var act_reach := 1.0
var height := 0.0                 # the body's height over the ground now (m)
var beat_phase := 0.0
var gusting := false
var streak := false
var hiding := false
var fainted := false
var gust_beats := 4
var debug_wing := Vector4(NAN, 0, 0, 0)   # (dev) both wings held at open, el, sw, tw
var debug_show_open := false              # (dev) the open wings shown however folded

# the act playing
var act := ""
var act_t := 0.0
var act_dur := 0.0
var _act_h0 := 0.0                # height when it began
var _events := {}                 # act events already fired (per act run)

# rig
var W := -1
var HIPS := -1
var SP2 := -1
var SP3 := -1
var HEAD := -1
var HAIR := -1
var BEAK := -1
var BIB := -1
var TAIL := PackedInt32Array()
var wings := []                   # per side: {sg, sh, arm, fore, hand, f1, f2, open (spring), mesh_open, mesh_fold}
var legs := []
var eye_mat: ShaderMaterial
var hip0 := 0.134
var L1 := 0.086
var L2 := 0.039
var ANKLE_H := 0.0245
var FOOT_W := 0.038

# state
var t := 0.0
var phase := 0.0                  # gait: two steps a cycle
var cyc := 0.14
var duty := 0.6
var run_w := 0.0
var _vel := Vector3.ZERO
var _last_pos := Vector3(NAN, NAN, NAN)
var _last_frame := 0
var _need_reset := true
var _yaw_last := NAN
var turn_v := 0.0
var air_w := 0.0                  # 0 feet on the ground .. 1 in the air (tucked)
var _was_air := false
var fly_w := 0.0                  # flight pose weight
var _hv := Vector2.ZERO           # height spring
var flap := 0.0                   # flap phase (cycles)
var _beat_n := 0
var hide_w := 0.0
var faint_w := 0.0
var battle_w := 0.0
var puff := 0.0
# head: yaw / pitch / tilt springs and their targets
var hy := Vector2.ZERO
var hp := Vector2.ZERO
var ht := Vector2.ZERO
var _hg := Vector3.ZERO
var _dart := 0.5
var _bob := Vector2.ZERO          # head bob (forward offset) spring
var crest := Vector2.ZERO
var tail_p := Vector2.ZERO
var tail_y := Vector2.ZERO
var _tail_kick := 0.0
var _flick := [0.0, 0.0]          # folded-wing twitch timers (s left)
var _next_flick := 2.0
var _next_tail := 1.5
var _next_auto := 3.0
var blink := 2.0
var _eye := ""
var body_s := Vector2.ZERO        # body lean spring
var _peek := 0.0

func _setup() -> void:
	t = rng.randf() * 10.0
	W = b("Waist"); HIPS = b("Hips"); SP2 = b("Spine2"); SP3 = b("Spine3"); HEAD = b("Head")
	HAIR = b("Hair"); BEAK = b("LowerBeak"); BIB = b("Feeler")
	TAIL = PackedInt32Array([b("Tail1"), b("Tail2")])
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
		for tn in ["A", "B", "C"]: toes.append([b(s[0] + "Toe" + tn + "1"), b(s[0] + "Toe" + tn + "2")])
		legs.append({"thigh": th, "leg": lg, "foot": ft, "toes": toes, "sg": s[1], "p": Vector3.ZERO, "yaw": 0.0, "u": -1.0,
			"from": Vector3.ZERO, "to": Vector3.ZERO, "toyaw": 0.0, "fromyaw": 0.0, "dur": 0.1, "h": 0.03, "scr": 0.0})
		var w := {"sg": s[1], "sh": b(s[0] + "Shoulder"), "arm": b(s[0] + "Arm"), "fore": b(s[0] + "ForeArm"), "hand": b(s[0] + "Hand"),
			"tip": b("End" + s[0] + "Hand"), "f1": b(s[0] + "Feeler1"), "f2": b(s[0] + "Feeler2"), "open": Vector2.ZERO,
			"mesh_open": null, "mesh_fold": null}
		var side: String = s[0].to_lower()
		for m3 in meshes:
			if String(m3.name).ends_with("wing_" + side): w.mesh_open = m3
			elif String(m3.name).ends_with("fold_" + side): w.mesh_fold = m3
		wings.append(w)
	eye_mat = mat_by.get("pidgey_eye1", null)
	_show_wings()

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
	height = fly_height if flying else 0.0
	_hv = Vector2(height, 0.0)
	fly_w = 1.0 if flying else 0.0
	air_w = 1.0 if flying else 0.0
	_was_air = flying
	if fainted and act == "": faint_w = 1.0

const DURS := {"peck": 1.3, "look": 1.7, "ruffle": 1.3, "startle": 0.9, "hop": 0.62, "takeoff": 1.3, "land": 1.5,
	"tackle": 1.25, "quick_attack": 1.1, "sand_attack": 1.5, "hurt": 0.9, "flinch": 0.5, "flee": 1.1, "faint": 2.0,
	"taunt": 1.7, "wings_spread": 2.1}

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
		"fly":
			glide = false
			if not flying: what = "takeoff"
			else: return
		"glide":
			glide = true
			if not flying: what = "takeoff"
			else: return
		"land":
			if not flying and height < 0.01: return
	if not DURS.has(what) and what != "gust": return
	if what != "faint": fainted = false
	if act != "": _end_act()
	hiding = false
	act = what
	act_t = 0.0
	_events.clear()
	_act_h0 = height
	act_dur = DURS.get(what, 0.0)
	if what == "gust": act_dur = 0.65 + 0.5 * gust_beats + 0.75
	match what:
		"takeoff", "flee": flying = true
		"hop": hops += 1
		"faint": fainted = true

func _end_act() -> void:
	var a := act
	act = ""
	gusting = false
	streak = false
	match a:
		"land": flying = false
		"gust", "tackle", "quick_attack": flying = flying and a != "gust"
	act_done.emit(a)

func busy() -> bool:
	return act != ""

func contacts() -> Array:
	var out := []
	for l in legs: out.append(to_world(G[l.foot].origin) if l.u < 0.0 and air_w < 0.01 else null)
	return out

func wing_tip(side: int) -> Vector3:
	return to_world(G[wings[0 if side > 0 else 1].tip].origin)

func beak_point() -> Vector3:
	return to_world(G[b("EndLowerBeak")].origin)

# where a foot stands under the body at rest
func _neutral(l: Dictionary, yaw: float, ahead: float) -> Vector3:
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var side := Vector3(cos(yaw), 0, -sin(yaw))
	var p: Vector3 = global_position + side * (FOOT_W * float(l.sg)) + f * (ahead + 0.004)
	p.y = global_position.y
	return p

# ---------- the frame ----------
# P: this frame's pose, built from the state (ground / hiding / flight) and then
# the act on top, and only then put on the bones
func _pose(dt: float, _speed: float) -> void:
	var now := Engine.get_process_frames()
	if now - _last_frame > 30: _need_reset = true
	_last_frame = now
	if not _need_reset and global_position.distance_to(_last_pos) > 2.5: _need_reset = true
	if _need_reset: _reset_now()
	t += dt
	if dt > 0.0:
		var vel := (global_position - _last_pos) / dt
		vel.y = 0.0
		_vel = _vel.lerp(vel, 1.0 - exp(-dt * 14.0))
		var yaw := global_rotation.y
		if not is_nan(_yaw_last): turn_v = damp(turn_v, wrapf(yaw - _yaw_last, -PI, PI) / dt, 10.0, dt)
		_yaw_last = yaw
	_last_pos = global_position
	var v := _vel.length()
	if act != "":
		act_t += dt
		if act_t >= act_dur: _end_act()
	hide_w = damp(hide_w, 1.0 if hiding and not flying else 0.0, 5.0, dt)
	faint_w = damp(faint_w, 1.0 if fainted and act == "" else 0.0, 4.0, dt) if act != "faint" else faint_w
	battle_w = damp(battle_w, 1.0 if battle and not hiding else 0.0, 4.0, dt)
	var P := _base(dt, v)
	if act != "": _act(P, dt, v)
	_height(P, dt)
	_auto(dt, v)
	_gait(dt, v, P)
	_body(P, dt)
	_legs_ik(P)
	_wings_pose(P, dt)
	_head(P, dt, v)
	_tail(P, dt, v)
	_eyes(P, dt)
	_show_wings()

# the plain pose for the state it is in
func _base(dt: float, v: float) -> Dictionary:
	var P := {"y": 0.0, "fwd": 0.0, "side": 0.0, "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "crouch": 0.0, "puff": 0.0,
		"hy": NAN, "hp": NAN, "ht": NAN, "hfwd": 0.0, "hup": 0.0, "hk": 1.0, "beak": 0.0, "crest": 0.0,
		"tp": 0.0, "ty": 0.0, "air": 0.0, "legs": "tuck", "eye": "open",
		"open": [0.0, 0.0], "el": [0.0, 0.0], "sw": [0.0, 0.0], "tw": [0.0, 0.0], "lift": [0.0, 0.0], "wk": 1.0,
		"flap": 0.0, "fly": 0.0, "hold": false}
	# breathing
	P.y += sin(t * 2.6) * 0.0018
	P.puff += 0.15 + sin(t * 2.6) * 0.1
	# fighting stance: low and forward, crest up, wings a touch out
	P.crouch += 0.25 * battle_w
	P.pitch += 0.22 * battle_w
	P.crest += 0.35 * battle_w
	P.tp += 0.15 * battle_w
	P.lift = [0.12 * battle_w, 0.12 * battle_w]
	# hiding: pressed into the grass, belly down, the head drawn in, watching
	if hide_w > 0.001:
		var k := hide_w
		_peek = maxf(0.0, _peek - dt)
		if _peek <= 0.0 and rng.randf() < dt * 0.25: _peek = 1.6
		var pk := sm(0.0, 0.3, _peek) * sm(1.6, 1.2, 1.6 - _peek) if _peek > 0.0 else 0.0
		P.crouch += k * (1.0 - 0.35 * pk)
		P.pitch += k * 0.3
		P.hup -= k * (0.035 - 0.025 * pk)
		P.hfwd += k * 0.012
		P.crest -= k * 0.45
		P.tp -= k * 0.25
		P.eye = "half" if pk < 0.5 else "open"
		P.hk = lerpf(1.0, 0.45, k)
	# flight (fly_w, eased in and out by takeoff / land)
	if flying or fly_w > 0.001:
		fly_w = damp(fly_w, 1.0 if flying else 0.0, 4.0, dt) if act == "" else fly_w
		var f := fly_w
		var cruise := sm(0.3, 2.5, v)
		P.fly = f
		P.air = f
		P.legs = "tuck" if cruise > 0.4 else "dangle"
		if glide and act == "":
			P.hold = true
			for i in 2:
				P.open[i] = f
				P.el[i] = 0.12 + sin(t * 1.7 + i) * 0.04
				P.sw[i] = 0.05
				P.tw[i] = -0.1
			P.pitch += f * (0.7 + 0.05 * sin(t * 1.3))
			P.roll += sin(t * 0.9) * 0.08 * f
			P.y += sin(t * 1.1) * 0.01
		else:
			P.flap = f
			P.pitch += f * lerpf(0.05, 0.85, cruise)
		P.tp += f * lerpf(-0.1, 0.12, cruise)
	return P

# the wing beat (flight and the acts that flap): advances `flap` and poses both wings
# for a stroke of amplitude amp; power strokes emit wing_beat
func _flap_wings(P: Dictionary, dt: float, hz: float, amp: float, w: float, power := 0.6) -> void:
	var f0 := flap
	flap += hz * dt
	var ph := fposmod(flap, 1.0)
	beat_phase = ph
	if floor(flap - 0.3) > floor(f0 - 0.3):
		_beat_n += 1
		wing_beat.emit(power)
	# downstroke 0 .. 0.45 (fast, spread), upstroke 0.45 .. 1 (wrist folded)
	var el: float
	var open: float
	var sw: float
	var tw: float
	if ph < 0.45:
		var u := ph / 0.45
		var e := u * u * (3.0 - 2.0 * u)
		el = lerpf(1.15, -0.85, e)
		open = 1.0
		sw = lerpf(0.15, -0.25, e)
		tw = lerpf(0.2, -0.35, sin(u * PI))
	else:
		var u := (ph - 0.45) / 0.55
		var e := u * u * (3.0 - 2.0 * u)
		el = lerpf(-0.85, 1.15, e)
		open = 1.0 - 0.55 * sin(u * PI)
		sw = lerpf(-0.25, 0.15, e) + 0.35 * sin(u * PI)
		tw = 0.45 * sin(u * PI)
	for i in 2:
		P.open[i] = lerpf(P.open[i], open, w)
		P.el[i] = lerpf(P.el[i], el * amp + 0.15 * (1.0 - amp), w)
		P.sw[i] = lerpf(P.sw[i], sw, w)
		P.tw[i] = lerpf(P.tw[i], tw, w)
	# the body rises on the downstroke
	P.y += -cos(ph * TAU) * 0.012 * amp * w
	P.pitch += sin(ph * TAU) * 0.05 * amp * w

# ---------- the acts ----------
func _ev(k: String, at: float) -> bool:
	if act_t >= at and not _events.has(k):
		_events[k] = true
		return true
	return false

static func bump(u: float, a: float, b2: float) -> float:
	if u <= a or u >= b2: return 0.0
	return sin((u - a) / (b2 - a) * PI)

func _act(P: Dictionary, dt: float, v: float) -> void:
	var u := act_t
	var d := act_dur
	var env := sm(0.0, 0.12, u) * sm(d, d - 0.2, u)
	match act:
		"peck":
			var down := sm(0.05, 0.22, u) * sm(0.95, 0.75, u)
			P.pitch += 0.75 * down
			P.crouch += 0.3 * down
			var jab := 0.0
			for k in 3:
				var at := 0.28 + k * 0.17
				jab = maxf(jab, bump(u, at, at + 0.14))
				if _ev("p%d" % k, at + 0.07): pecks += 1
			P.hp = -0.75 * down - 0.35 * jab
			P.hy = 0.1 * sin(u * 3.0) * down
			P.ht = 0.0
			P.hfwd += 0.028 * down + 0.02 * jab
			P.hup -= 0.012 * jab
			P.beak = 0.35 * jab
			P.hk = 2.2
			# the swallow: a flick of the head up after
			var sw := bump(u, 0.95, 1.2)
			P.hp = lerpf(P.hp, 0.45, sw) if sw > 0.0 else P.hp
			P.tp += 0.2 * down
		"look":
			var L := [[0.95, 0.05, 0.4], [-0.85, 0.2, -0.45], [0.25, 0.5, 0.15], [-0.1, -0.05, 0.0]]
			var k := clampi(int(u / 0.4), 0, 3)
			P.hy = L[k][0]; P.hp = L[k][1]; P.ht = L[k][2]
			P.yaw += L[k][0] * 0.22 * env
			P.hk = 1.4
			P.crest += 0.25 * env
		"ruffle":
			var pf := sm(0.0, 0.18, u) * sm(1.15, 0.9, u)
			P.puff += 1.6 * pf
			var sh := sm(0.2, 0.3, u) * sm(0.9, 0.7, u)
			P.roll += sin(u * TAU * 7.0) * 0.26 * sh
			P.yaw += sin(u * TAU * 7.0 + 1.0) * 0.22 * sh
			P.y += absf(sin(u * TAU * 7.0)) * 0.006 * sh
			var hs := bump(u, 0.75, 1.05)
			P.hy = sin(u * TAU * 8.0) * 0.45 * hs
			P.hk = 3.0
			for i in 2: P.lift[i] += 0.35 * sh + 0.1 * pf
			P.crest += 0.6 * pf + sin(u * 40.0) * 0.2 * sh
			P.ty += sin(u * TAU * 6.0) * 0.35 * sh
			if _ev("tail", 1.05): _tail_kick = 1.0
			P.eye = "half" if sh > 0.5 else P.eye
		"startle":
			var j := bump(u, 0.0, 0.3)
			P.y += 0.025 * j
			P.air = maxf(P.air, sm(0.02, 0.06, u) * sm(0.26, 0.2, u))
			P.legs = "dangle"
			P.crouch -= 0.35 * sm(0.0, 0.08, u) * sm(0.9, 0.5, u)
			P.pitch -= 0.25 * sm(0.0, 0.06, u) * sm(0.9, 0.5, u)
			P.hp = 0.35 * sm(0.0, 0.05, u) * sm(0.9, 0.6, u)
			P.hfwd -= 0.015 * env
			P.hk = 3.0
			P.crest += 0.8 * env
			P.tp += 0.4 * env
			var fl := bump(u, 0.02, 0.4)
			for i in 2:
				P.open[i] = maxf(P.open[i], 0.55 * fl)
				P.el[i] = lerpf(P.el[i], 0.5, fl)
			P.eye = "open"
		"hop":
			var cr := bump(u, 0.0, 0.2) * 0.7 + bump(u, 0.42, 0.62) * 0.55
			P.crouch += cr
			var air := (u - 0.16) / 0.28
			if air > 0.0 and air < 1.0:
				P.y += 0.075 * sin(air * PI)
				P.air = 1.0
				P.legs = "hop"
			P.pitch += 0.1 * bump(u, 0.12, 0.5) - 0.08 * bump(u, 0.0, 0.18)
			for i in 2: P.lift[i] += 0.5 * bump(u, 0.12, 0.45)
			P.tp += 0.35 * bump(u, 0.4, 0.62)
			P.hfwd += 0.012 * bump(u, 0.15, 0.45)
		"takeoff", "flee":
			var fast := act == "flee"
			var cr := bump(u, 0.0, 0.26)
			P.crouch += cr * 0.9
			P.pitch += 0.3 * cr
			P.air = sm(0.18, 0.24, u)
			P.legs = "dangle" if u < 0.7 else "tuck"
			fly_w = sm(0.15, 0.6, u)
			var w := sm(0.05, 0.22, u)
			for i in 2: P.open[i] = maxf(P.open[i], sm(0.0, 0.18, u))
			_flap_wings(P, dt, 7.0 if fast else 5.5, 1.15, w, 0.8)
			P.pitch += (0.5 if fast else 0.2) * sm(0.3, 1.0, u)
			P.crest += 0.4 * env
			P.tp -= 0.3 * bump(u, 0.15, 0.7)
			if fast: P.eye = "open"; P.hp = 0.2
		"land":
			fly_w = 1.0 - sm(0.62, 0.8, u)
			P.air = 1.0 - sm(0.68, 0.72, u)
			P.legs = "dangle"
			var brake := bump(u, 0.25, 0.82)
			_flap_wings(P, dt, 5.0, 1.2, 1.0 - sm(0.78, 0.95, u), 0.5)
			for i in 2:
				P.sw[i] -= 0.45 * brake
				P.open[i] = P.open[i] * (1.0 - sm(0.8, 1.2, u))
			P.pitch -= 0.55 * brake
			var sq := bump(u, 0.68, 1.05)
			P.crouch += 0.7 * sq
			P.tp += 0.5 * bump(u, 0.62, 0.85) + 0.3 * bump(u, 0.7, 1.0)
			P.hp = 0.1 * brake
			if _ev("touch", 0.7): footfalls += 1
		"gust":
			_gust(P, dt, u)
		"tackle", "quick_attack":
			_strike(P, dt, u, act == "quick_attack")
		"sand_attack":
			var low := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.crouch += 0.55 * low
			P.pitch += 0.35 * low
			P.hp = -0.15 * low
			P.hfwd -= 0.01 * low
			P.crest += 0.5 * low
			P.tp += 0.3 * low
			var k := 0.0
			var ph := 0.0
			for s in 3:
				var at := 0.3 + s * 0.34
				var bb := bump(u, at - 0.12, at + 0.12)
				if bb > 0.0: ph = (u - at + 0.12) / 0.24
				k = maxf(k, bb)
				if _ev("k%d" % s, at): kick.emit()
			var wo := sm(0.1, 0.25, u) * sm(d, d - 0.3, u)
			for i in 2:
				P.open[i] = 0.85 * wo
				# low scoops along the ground, from back to forward
				P.el[i] = lerpf(-0.15, -0.55, wo) + 0.25 * k
				P.sw[i] = lerpf(0.8, -0.6, ph) * k + 0.6 * (1.0 - k) * wo
				P.tw[i] = -0.3 * k
			P.y += 0.01 * k
			for l in legs: l.scr = k
		"hurt":
			var hit := sm(0.0, 0.05, u) * sm(0.85, 0.3, u)
			P.fwd -= 0.07 * hit
			P.pitch -= 0.55 * hit
			P.roll += 0.12 * hit
			P.y += 0.02 * bump(u, 0.0, 0.25)
			P.air = maxf(P.air, sm(0.0, 0.04, u) * sm(0.3, 0.22, u))
			P.legs = "dangle"
			P.hp = 0.5 * hit
			P.hy = -0.3 * hit
			P.hk = 3.0
			P.crest -= 0.5 * hit
			P.beak = 0.6 * bump(u, 0.02, 0.5)
			P.eye = "squeeze" if u < 0.5 else "half"
			var fl := bump(u, 0.0, 0.5)
			for i in 2:
				P.open[i] = maxf(P.open[i], 0.7 * fl)
				P.el[i] = lerpf(P.el[i], 0.7, fl)
				P.sw[i] = lerpf(P.sw[i], -0.2, fl)
			P.puff += 0.8 * hit
			P.tp += 0.4 * hit
		"flinch":
			var j := sm(0.0, 0.04, u) * sm(0.5, 0.2, u)
			P.fwd -= 0.025 * j
			P.pitch -= 0.2 * j
			P.crouch += 0.35 * j
			P.hp = -0.35 * j
			P.hy = 0.45 * j
			P.hup -= 0.015 * j
			P.hk = 3.0
			P.eye = "closed" if u < 0.25 else "half"
			for i in 2: P.lift[i] += 0.4 * j
			P.crest -= 0.3 * j
		"faint":
			var wob := sm(0.0, 0.15, u) * sm(0.7, 0.5, u)
			P.roll += sin(u * 11.0) * 0.12 * wob
			P.hp = -0.4 * wob
			P.eye = "half" if u < 0.55 else "closed"
			faint_w = sm(0.5, 1.05, u)
			P.y += 0.02 * bump(u, 0.45, 0.65)
		"taunt":
			var tall := sm(0.0, 0.2, u) * sm(d, d - 0.25, u)
			P.puff += 1.2 * tall
			P.crouch -= 0.25 * tall
			P.pitch -= 0.15 * tall
			P.crest += 0.9 * tall
			P.tp += 0.5 * tall
			var bobs := 0.0
			for k in 3: bobs = maxf(bobs, bump(u, 0.3 + k * 0.28, 0.5 + k * 0.28))
			P.hfwd += 0.03 * bobs
			P.hp = -0.25 * bobs + 0.15 * tall
			P.beak = 0.7 * bobs
			P.hk = 3.0
			for i in 2:
				P.open[i] = 0.92 * tall
				P.el[i] = -0.25 + sin(u * 30.0) * 0.1 * tall
				P.sw[i] = 0.2
			var st := bump(u, 1.3, 1.55)
			P.y += 0.03 * st
			P.air = maxf(P.air, sm(1.33, 1.36, u) * sm(1.52, 1.49, u))
			P.legs = "hop"
		"wings_spread":
			var o := sm(0.05, 0.4, u) * sm(d, d - 0.45, u)
			for i in 2:
				P.open[i] = maxf(P.open[i], o)
				P.el[i] = lerpf(P.el[i], 0.22 + sin(u * 37.0 + i) * 0.03, o)
				P.sw[i] = lerpf(P.sw[i], -0.1, o)
				P.tw[i] = lerpf(P.tw[i], -0.15, o)
			P.pitch -= 0.2 * o
			P.crouch -= 0.2 * o
			P.puff += 0.8 * o
			P.crest += 0.9 * o
			P.tp += 0.4 * o
			P.hp = 0.3 * o
			P.beak = 0.75 * bump(u, 0.45, 0.95)
			P.hk = 2.0

# gust: up to hover before the target, big slow beats that drive the air forward
# (each stroke: the wings raised high and back, then swept down and forward
# together), then back down to the ground
func _gust(P: Dictionary, dt: float, u: float) -> void:
	var rise := 0.65
	var beat := 0.5
	var t1 := rise + beat * gust_beats
	var up := sm(0.05, rise, u)
	var down := sm(t1, t1 + 0.6, u)
	fly_w = maxf(fly_w, up * (1.0 - down))
	P.air = sm(0.1, 0.18, u) * (1.0 - sm(t1 + 0.55, t1 + 0.6, u))
	P.legs = "dangle"
	P.crouch += 0.7 * bump(u, 0.0, 0.2) + 0.6 * bump(u, t1 + 0.5, t1 + 0.75)
	var hov := up * (1.0 - down)
	if u < rise:
		for i in 2: P.open[i] = maxf(P.open[i], sm(0.02, 0.15, u))
		_flap_wings(P, dt, 5.5, 1.1, sm(0.05, 0.15, u), 0.6)
	elif u < t1:
		gusting = true
		var k := (u - rise) / beat
		var ph := fposmod(k, 1.0)
		beat_phase = ph
		if _ev("b%d" % int(k), rise + floor(k) * beat + 0.32 * beat): wing_beat.emit(1.0)
		# 0 .. 0.55 the wings go up and back (slow, gathering); 0.55 .. 0.8 the push
		# (down and forward, fast); 0.8 .. 1 they come round to go up again
		var el: float
		var sw: float
		var tw: float
		var op := 1.0
		if ph < 0.55:
			var e := sm(0.0, 0.55, ph)
			el = lerpf(-0.4, 1.35, e); sw = lerpf(-0.7, 0.75, e); tw = lerpf(-0.2, 0.55, e)
			op = 1.0 - 0.35 * sin(e * PI)
		elif ph < 0.8:
			var e := sm(0.55, 0.8, ph)
			el = lerpf(1.35, -0.45, e); sw = lerpf(0.75, -0.85, e); tw = lerpf(0.55, -0.6, e)
		else:
			var e := sm(0.8, 1.0, ph)
			el = lerpf(-0.45, -0.4, e); sw = lerpf(-0.85, -0.7, e); tw = lerpf(-0.6, -0.2, e)
		for i in 2:
			P.open[i] = op; P.el[i] = el; P.sw[i] = sw; P.tw[i] = tw
		var push := bump(ph, 0.55, 0.95)
		P.pitch += -0.45 + 0.25 * push
		P.fwd -= 0.04 * push
		P.y += -0.03 * push + 0.02 * bump(ph, 0.0, 0.55)
		P.tp -= 0.4
		P.hp = -0.3 - 0.15 * push
		P.hfwd += 0.02 * push
		P.crest += 0.8
		P.beak = 0.8 * bump(u, rise, rise + 0.35)
		P.hk = 2.5
		P.eye = "open"
	else:
		gusting = false
		var w2 := 1.0 - sm(t1 + 0.3, t1 + 0.7, u)
		for i in 2: P.open[i] = maxf(P.open[i], w2)
		_flap_wings(P, dt, 5.0, 1.0, w2, 0.4)
		P.pitch -= 0.4 * bump(u, t1, t1 + 0.6)
	P.fly = maxf(P.fly, hov)

# tackle: a crouch, a launch head first into the target act_reach ahead, the bounce
# back off it and a flapping hop home. quick_attack: the same far faster, a low
# streak with the wings swept back tight, then up and round, back to its place.
func _strike(P: Dictionary, dt: float, u: float, quick: bool) -> void:
	var R := act_reach
	var c0 := 0.3 if not quick else 0.14       # crouch ends, the launch
	var c1 := 0.5 if not quick else 0.26       # contact
	var c2 := 0.75 if not quick else 0.62      # bounced back / up
	var c3 := act_dur - 0.12
	var cr := sm(0.0, c0 * 0.8, u) * sm(c0 + 0.05, c0 - 0.02, u)
	P.crouch += 0.9 * cr
	P.fwd -= 0.03 * cr
	P.pitch += 0.4 * cr
	P.crest += 0.7 * sm(0.0, 0.2, u) * sm(act_dur, act_dur - 0.3, u)
	P.hk = 3.0
	P.eye = "open"
	var x := 0.0
	var y := 0.0
	if u >= c0 and u < c1:
		var e := (u - c0) / (c1 - c0)
		x = R * e * e * (3.0 - 2.0 * e) if not quick else R * (1.0 - pow(1.0 - e, 3.0))
		y = (0.09 if not quick else 0.04) * sin(e * PI) + 0.03 * e
		P.pitch += 1.0 if not quick else 1.25
		P.hp = -0.2
		P.hfwd += 0.025
		streak = quick
		for i in 2:
			P.open[i] = 0.45 if not quick else 0.3
			P.el[i] = 0.1
			P.sw[i] = 1.1
			P.tw[i] = 0.2
	elif u >= c1 and u < c2:
		streak = false
		var e := (u - c1) / (c2 - c1)
		if _ev("hit", c1): impact.emit(act)
		if not quick:
			x = R - 0.4 * R * sm(0.0, 1.0, e)
			y = 0.03 + 0.14 * sin(e * PI)
			P.pitch -= 0.5 * bump(e, 0.0, 0.8)
		else:
			x = R - 0.5 * R * sm(0.0, 1.0, e)
			y = 0.04 + 0.45 * sin(e * PI * 0.9)
			P.pitch -= 0.7 * bump(e, 0.0, 1.0)
		for i in 2: P.open[i] = maxf(P.open[i], sm(0.0, 0.2, e))
		_flap_wings(P, dt, 6.5, 1.15, sm(0.0, 0.25, e), 0.5)
		P.beak = 0.5 * bump(e, 0.0, 0.5)
	elif u >= c2 and u < c3:
		var e := (u - c2) / (c3 - c2)
		var x0 := R * (0.6 if not quick else 0.5)
		x = x0 * (1.0 - sm(0.0, 1.0, e))
		y = (0.03 + (0.0 if not quick else 0.02)) * (1.0 - e) + 0.1 * sin(e * PI) * (1.0 if not quick else 1.5)
		var wo := 1.0 - sm(0.45, 0.8, e)
		for i in 2: P.open[i] = maxf(P.open[i], wo)
		_flap_wings(P, dt, 6.0, 1.0, wo, 0.3)
		P.pitch -= 0.3 * bump(e, 0.5, 1.0)
	var landing := bump(u, c3 - 0.04, act_dur + 0.1)
	P.crouch += 0.6 * landing
	P.tp += 0.4 * landing
	if u >= c0 and u < c3:
		P.air = 1.0
		P.legs = "tuck" if u < c1 else "dangle"
	if _ev("touch", c3): footfalls += 1
	P.fwd += x
	P.y += y

# ---------- height over the ground ----------
func _height(P: Dictionary, dt: float) -> void:
	var want := fly_height if flying else 0.0
	match act:
		"takeoff", "flee":
			var e := sm(0.2, act_dur, act_t)
			var jump := 0.12 * sm(0.18, 0.35, act_t)
			_hv = Vector2(lerpf(_act_h0, fly_height, e * e * (3.0 - 2.0 * e)) + jump * (1.0 - e), 0.0)
		"land":
			var e := sm(0.0, 0.7, act_t)
			_hv = Vector2(_act_h0 * (1.0 - e) * (1.0 - e * 0.3) if act_t < 0.7 else 0.0, 0.0)
		"gust":
			var rise := 0.65
			var t1 := rise + 0.5 * gust_beats
			var gh := maxf(_act_h0, 0.5)
			var e := sm(0.1, rise, act_t) * (1.0 - sm(t1, t1 + 0.6, act_t))
			var back := _act_h0 if flying else 0.0
			_hv = Vector2(lerpf(back, gh, e) if act_t < t1 else lerpf(back, gh, e), 0.0)
		_:
			if act in ["tackle", "quick_attack"] and not flying: _hv = Vector2(0.0, 0.0)
			else: _hv = spring(_hv, want, 3.0, dt, 1.0)
	height = maxf(0.0, _hv.x)
	P.y += height
	if height > 0.02: P.air = maxf(P.air, 1.0)

# ---------- standing life: what it does on its own ----------
func _auto(dt: float, v: float) -> void:
	_next_flick -= dt
	_next_tail -= dt
	for i in 2: _flick[i] = maxf(0.0, _flick[i] - dt)
	if _next_flick <= 0.0:
		_next_flick = rng.randf_range(1.5, 5.0)
		var both := rng.randf() < 0.4
		var i := rng.randi() % 2
		_flick[i] = 0.3
		if both: _flick[1 - i] = 0.3
	if _next_tail <= 0.0:
		_next_tail = rng.randf_range(1.0, 3.5)
		_tail_kick = rng.randf_range(0.6, 1.0)
	if not auto or act != "" or hiding or fainted or flying or battle or v > 0.1: return
	_next_auto -= dt
	if _next_auto <= 0.0:
		_next_auto = rng.randf_range(2.0, 5.0)
		var x := rng.randf()
		if x < 0.38: mood("peck")
		elif x < 0.62: mood("look")
		elif x < 0.72: mood("ruffle")
		elif x < 0.8: mood("hop")

# ---------- the gait ----------
func _gait(dt: float, v: float, P: Dictionary) -> void:
	var yaw := global_rotation.y
	var air: bool = P.air > 0.5 or faint_w > 0.3
	if air:
		for l in legs: l.u = -1.0
		_was_air = true
		return
	if _was_air:
		# landed: the feet where it came down
		_was_air = false
		for l in legs:
			l.p = _neutral(l, yaw, 0.0); l.yaw = yaw; l.u = -1.0
		footfalls += 1
	run_w = damp(run_w, sm(0.6, 1.3, v), 6.0, dt)
	cyc = damp(cyc, clampf(0.08 + 0.17 * v, 0.1, 0.34), 6.0, dt)
	duty = lerpf(0.62, 0.4, run_w)
	var moving := v > 0.04 and hide_w < 0.9
	var rate := v / cyc
	var ph0 := phase
	if moving: phase += rate * dt
	var swing := (1.0 - duty) / maxf(rate, 2.0)
	for i in 2:
		var l: Dictionary = legs[i]
		var off := 0.5 * i
		var late := false
		if moving and l.u < 0.0:
			var nb := _neutral(l, yaw, 0.0)
			var behind := Vector2(l.p.x - nb.x, l.p.z - nb.z).length()
			if (legs[1 - i].u < 0.0 and behind > cyc * duty * 0.5 + 0.02) or behind > 0.12:
				late = true
				phase = off + floor(phase - off) + 1e-4
		if moving and l.u < 0.0 and (late or floor(phase - off) > floor(ph0 - off)):
			var lead := cyc * duty * 0.5
			l.from = l.p; l.fromyaw = l.yaw
			l.to = _neutral(l, yaw + turn_v * swing, lead) + _vel * swing
			l.toyaw = yaw + turn_v * swing
			l.dur = swing; l.u = 0.0
			l.h = lerpf(0.022, 0.04, run_w)
		elif not moving and l.u < 0.0 and legs[1 - i].u < 0.0:
			var want := _neutral(l, yaw, 0.0)
			var off2 := Vector2(l.p.x - want.x, l.p.z - want.z).length()
			if off2 > 0.035 or absf(wrapf(l.yaw - yaw, -PI, PI)) > 0.45:
				l.from = l.p; l.fromyaw = l.yaw; l.to = want; l.toyaw = yaw
				l.dur = 0.11; l.u = 0.0; l.h = 0.02
		if l.u >= 0.0:
			l.u = minf(1.0, l.u + dt / maxf(0.05, l.dur))
			if moving:
				var left: float = (1.0 - float(l.u)) * float(l.dur)
				var tgt: Vector3 = _neutral(l, yaw + turn_v * left, cyc * duty * 0.5) + _vel * left
				l.to = l.to.lerp(tgt, 1.0 - exp(-dt * 8.0))
				l.toyaw = yaw + turn_v * left
			if l.u >= 1.0:
				l.p = l.to; l.yaw = l.toyaw; l.u = -1.0
				footfalls += 1
	# the walk's head bob: the head still in the air while the body passes, then thrust
	var ph := fposmod(phase, 0.5) * 2.0
	var hold := 0.7
	var A := hold * cyc * 0.27
	var off3 := lerpf(A, -A, ph / hold) if ph < hold else lerpf(-A, A, sm(hold, 1.0, ph))
	var bw := sm(0.03, 0.15, v) * (1.0 - 0.75 * run_w) * (1.0 - hide_w)
	P.hfwd += off3 * bw
	# (the thrust dips the head a little, as a pigeon's does)
	P.hup -= 0.008 * bw * (sin(sm(hold, 1.0, ph) * PI) if ph >= hold else 0.0)
	P.y += -cos(ph * TAU) * 0.004 * sm(0.03, 0.2, v) + run_w * absf(sin(ph * PI)) * 0.008
	P.pitch += 0.1 * sm(0.05, 0.4, v) + 0.25 * run_w
	P.roll += clampf(-turn_v * v * 0.05, -0.15, 0.15)
	if run_w > 0.05:
		for i2 in 2: P.lift[i2] += 0.3 * run_w
		P.tp += 0.2 * run_w

func _foot(l: Dictionary) -> Array:
	if l.u < 0.0: return [l.p, 0.0, l.yaw]
	var u: float = l.u
	var e := u * u * (3.0 - 2.0 * u)
	var p2: Vector3 = (l.from as Vector3).lerp(l.to, e)
	var h: float = l.h * sin(PI * minf(1.0, u * 1.15))
	return [p2 + Vector3.UP * h, u, lerp_angle(float(l.fromyaw), float(l.toyaw), e)]

# ---------- the body ----------
var _Tw := Transform3D.IDENTITY   # the Waist's skeleton-space pose this frame

func _body(P: Dictionary, dt: float) -> void:
	# crouch: down on the legs (hiding: the belly on the ground)
	var cr: float = P.crouch
	var base := hip0 - 0.028 * cr * (1.0 if cr > 0.0 else 0.6)
	if cr > 1.0: base = hip0 - 0.028 - 0.03 * (cr - 1.0)
	var y: float = base + P.y
	# faint: over on its side, on the ground
	var fw := faint_w
	y = lerpf(y, 0.072, fw)
	body_s = spring(body_s, float(P.pitch), 16.0, dt, 0.75)
	var pitch := lerpf(body_s.x, 0.15, fw)
	var roll: float = lerpf(float(P.roll), 1.3, fw)
	var basis := Basis(Vector3.UP, float(P.yaw)) * Basis(Vector3.RIGHT, pitch) * Basis(Vector3(0, 0, 1), -roll)
	var wp := Vector3(float(P.side) - 0.03 * fw, y, rest_at(W).z + float(P.fwd))
	# standing: no higher than the planted feet reach
	if P.air < 0.5 and fw < 0.3:
		for l in legs:
			if l.u >= 0.0: continue
			var pl := to_skel(l.p)
			var th := _thigh_rest(l)
			var hx := Vector2(pl.x - th.x, pl.z - th.z - float(P.fwd)).length()
			var r2 := (L1 + L2) * 0.99
			var dyh := th.y - hip0
			if hx < r2: wp.y = minf(wp.y, pl.y + ANKLE_H + sqrt(r2 * r2 - hx * hx) - dyh)
	_Tw = Transform3D(basis * rest_g[W].basis, wp)
	set_local_pos(W, rest_g[parent[W]].affine_inverse() * wp)
	set_global(W, basis * rest_g[W].basis)
	# puff: the chest (Spine2) swells, the head and wings scaled back
	puff = damp(puff, float(P.puff), 10.0, dt)
	var s := 1.0 + 0.075 * puff
	skel.set_bone_pose_scale(SP2, Vector3(s, s, s))
	skel.set_bone_pose_scale(SP3, Vector3.ONE / s)
	# the bib of chest feathers lifts with the puff
	turn_rest(BIB, Vector3.RIGHT, -0.15 * puff)

func _thigh_rest(l: Dictionary) -> Vector3:
	return rest_at(l.thigh)

# a bone's skeleton-space point under the Waist pose being built (rest below it)
func _under_waist(p_rest: Vector3) -> Vector3:
	return _Tw * (rest_g[W].affine_inverse() * p_rest)

func _legs_ik(P: Dictionary) -> void:
	var W2S := skel.global_transform.affine_inverse()
	var aw: float = P.air
	air_w = aw
	for l in legs:
		var fp := _foot(l)
		var A: Vector3 = W2S * ((fp[0] as Vector3) + Vector3.UP * ANKLE_H)
		var sg: float = l.sg
		var th0: Vector3 = rest_at(l.thigh)
		var ft0: Vector3 = rest_at(l.foot)
		if aw > 0.001 or faint_w > 0.01:
			var mode: String = P.legs
			var loc: Vector3
			match mode:
				"tuck": loc = Vector3(ft0.x * 0.9, th0.y - 0.055, th0.z - 0.07)
				"hop": loc = Vector3(ft0.x, ft0.y + 0.03, ft0.z + 0.0)
				_: loc = Vector3(ft0.x * 1.05, ft0.y - 0.002, ft0.z + 0.03)
			if faint_w > 0.01: loc = loc.lerp(Vector3(ft0.x * 1.4, ft0.y + 0.03, ft0.z + 0.05), faint_w)
			var air_A := _under_waist(loc)
			A = A.lerp(air_A, clampf(maxf(aw, faint_w), 0.0, 1.0))
		var H := _under_waist(th0)
		var d := A - H
		var dl := d.length()
		var reach := (L1 + L2) * 0.999
		if dl > reach:
			A = H + d / dl * reach; d = A - H; dl = reach
		dl = maxf(dl, absf(L1 - L2) + 0.005)
		var a1 := acos(clampf((L1 * L1 + dl * dl - L2 * L2) / (2.0 * L1 * dl), -1.0, 1.0))
		var axis := d.normalized()
		var bodyz := (_Tw.basis * rest_g[W].basis.inverse() * Vector3(0, 0, 1)).normalized()
		var pole := (-bodyz + Vector3(sg * 0.1, 0, 0)).normalized()
		pole = (pole - axis * pole.dot(axis)).normalized()
		var K := H + axis * (L1 * cos(a1)) + pole * (L1 * sin(a1))
		aim(l.thigh, K - H, bodyz, rest_dir(l.thigh, l.leg), Vector3(0, 0, 1))
		aim(l.leg, A - K, bodyz, rest_dir(l.leg, l.foot), Vector3(0, 0, 1))
		var fy: float = float(fp[2]) - global_rotation.y
		var u: float = fp[1]
		var pitch := 0.0
		if l.u >= 0.0: pitch = -0.6 * sin(PI * u) + 0.3 * sm(0.0, 0.25, u) * (1.0 - sm(0.25, 0.5, u))
		var curl := 0.0
		if l.u >= 0.0: curl = sin(PI * u) * 0.7
		var sc: float = l.scr
		if sc > 0.0:
			# sand_attack: the feet scratch back at the ground, one after the other
			var s2 := sin(t * 26.0 + (0.0 if sg > 0.0 else PI))
			pitch += 0.5 * sc * s2
			curl = maxf(curl, 0.4 * sc * maxf(0.0, s2))
			l.scr = 0.0
		if aw > 0.001 or faint_w > 0.01:
			var mode2: String = P.legs
			var ap := 0.9 if mode2 == "tuck" else (0.25 if mode2 == "hop" else -0.35)
			var ac := 1.1 if mode2 == "tuck" else (0.5 if mode2 == "hop" else 0.15)
			var k := clampf(maxf(aw, faint_w), 0.0, 1.0)
			pitch = lerpf(pitch, ap, k)
			curl = lerpf(curl, ac, k)
			fy = lerpf(fy, 0.0, k)
			set_global(l.foot, (_Tw.basis * rest_g[W].basis.inverse()) * Basis(Vector3.UP, fy) * Basis(Vector3.RIGHT, pitch) * rest_g[l.foot].basis)
		else:
			set_global(l.foot, Basis(Vector3.UP, fy) * Basis(Vector3.RIGHT, pitch) * rest_g[l.foot].basis)
		for tb in l.toes:
			turn_rest(tb[0], Vector3.RIGHT, curl * 0.5)
			turn_rest(tb[1], Vector3.RIGHT, curl * 0.7)

# ---------- the wings ----------
# open 0 folded at the side .. 1 spread; el: raised (+) / lowered at the shoulder;
# sw: swept back (+) / forward; tw: the wing's pitch (+ leading edge up)
const FOLD_SW := 1.35
const FOLD_EL := -0.35
const FOLD_E := 2.75
const FOLD_H := 2.85
const FOLD_TW := -1.5
const FOLD_MAX := 0.68

func _wings_pose(P: Dictionary, dt: float) -> void:
	if P.flap > 0.001 and not P.hold and act == "":
		var hz := lerpf(5.0, 3.8, sm(0.5, 2.5, _vel.length()))
		for i in 2: P.open[i] = maxf(P.open[i], P.flap)
		_flap_wings(P, dt, hz, 1.0, P.flap, 0.45)
	if faint_w > 0.01:
		# fainted: the upper (right) wing half open and limp
		P.open[1] = maxf(P.open[1], 0.55 * faint_w)
		P.el[1] = lerpf(P.el[1], -0.2, faint_w)
		P.sw[1] = lerpf(P.sw[1], 0.4, faint_w)
	if not is_nan(debug_wing.x):
		for i in 2:
			P.open[i] = debug_wing.x; P.el[i] = debug_wing.y; P.sw[i] = debug_wing.z; P.tw[i] = debug_wing.w
	for i in 2:
		var w: Dictionary = wings[i]
		var sg: float = w.sg
		w.open = spring(w.open, float(P.open[i]), 30.0, dt, 0.9)
		var o := clampf(w.open.x, 0.0, 1.05)
		# (the open mesh folded all the way would turn its feathers up: it only goes to
		# FOLD_MAX, a wing hanging at the side, and below open 0.14 the folded mesh shows)
		var f := (1.0 - minf(o, 1.0)) * FOLD_MAX
		var el: float = P.el[i] * sm(0.0, 0.35, o) + FOLD_EL * f
		var sw: float = P.sw[i] * sm(0.0, 0.5, o) + FOLD_SW * f
		var tw: float = P.tw[i] * sm(0.0, 0.5, o) + FOLD_TW * f
		turn_rest(w.sh, Vector3(0, 0, 1), sg * el * 0.25)
		turn_rest(w.arm, Vector3(0, 0, 1), sg * el * 0.75)
		turn_rest(w.arm, Vector3.UP, sg * sw)
		turn_rest(w.arm, Vector3.RIGHT, -tw)
		turn_rest(w.fore, Vector3.UP, -sg * FOLD_E * f)
		turn_rest(w.hand, Vector3.UP, sg * FOLD_H * f)
		turn_rest(w.hand, Vector3(0, 0, 1), sg * el * 0.15)
		# the folded wing: a twitch now and then, held out a little in a run or a fight
		var fl: float = _flick[i]
		var twitch := sin(clampf(1.0 - fl / 0.3, 0.0, 1.0) * PI) if fl > 0.0 else 0.0
		var lift: float = P.lift[i] + 0.35 * twitch + 3.0 * clampf(o, 0.0, 0.15)
		turn_rest(w.f1, Vector3(0, 0, 1), sg * lift * 0.5)
		turn_rest(w.f1, Vector3.RIGHT, -lift * 0.2)
		turn_rest(w.f2, Vector3(0, 0, 1), sg * lift * 0.3)

func _show_wings() -> void:
	for w in wings:
		var o: bool = (w.open as Vector2).x > 0.14 or debug_show_open
		if w.mesh_open: (w.mesh_open as MeshInstance3D).visible = o
		if w.mesh_fold: (w.mesh_fold as MeshInstance3D).visible = not o

# ---------- the head ----------
func _head(P: Dictionary, dt: float, v: float) -> void:
	# darts: a new look every so often, snapped to (or Ash, when it watches him)
	_dart -= dt
	if _dart <= 0.0:
		var calm := hide_w > 0.5 or fly_w > 0.5
		_dart = rng.randf_range(0.25, 1.1) * (2.0 if calm else 1.0)
		var watch := not is_nan(look_at_pos.x) and rng.randf() < (0.8 if battle else 0.55)
		if watch:
			var hp3 := to_world(G[HEAD].origin)
			var to := look_at_pos - hp3
			var yy := wrapf(atan2(to.x, to.z) - global_rotation.y, -PI, PI)
			_hg = Vector3(clampf(yy, -1.5, 1.5) + rng.randf_range(-0.12, 0.12), clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.5, 0.6), 0.0)
			# one eye on it: a bird looks side on
			if rng.randf() < 0.4: _hg.z = rng.randf_range(0.25, 0.45) * signf(rng.randf() - 0.5)
		else:
			var span := 0.5 if calm else (0.35 if v > 0.3 else 1.1)
			_hg = Vector3(rng.randf_range(-span, span), rng.randf_range(-0.2, 0.35), rng.randf_range(-0.35, 0.35) if rng.randf() < 0.45 else 0.0)
	var gy: float = _hg.x if is_nan(float(P.hy)) else float(P.hy)
	var gp: float = _hg.y if is_nan(float(P.hp)) else float(P.hp)
	var gt: float = _hg.z if is_nan(float(P.ht)) else float(P.ht)
	if fly_w > 0.3 and is_nan(float(P.hy)): gy *= 0.4
	# flight: the head level against the body's lean
	var lean := body_s.x
	gp += lean * 0.85
	var om: float = 26.0 * float(P.hk)
	hy = spring(hy, gy, om, dt, 0.68)
	hp = spring(hp, gp, om, dt, 0.7)
	ht = spring(ht, gt, om * 0.8, dt, 0.7)
	if faint_w > 0.01:
		hy.x = lerpf(hy.x, 0.25, faint_w); hp.x = lerpf(hp.x, -0.2, faint_w); ht.x = lerpf(ht.x, 0.3, faint_w)
	turn_rest(SP3, Vector3.UP, hy.x * 0.3)
	turn_rest(SP3, Vector3.RIGHT, -hp.x * 0.3)
	turn_rest(HEAD, Vector3.UP, hy.x * 0.7)
	turn_rest(HEAD, Vector3.RIGHT, -hp.x * 0.7)
	turn_rest(HEAD, Vector3(0, 0, 1), ht.x)
	# the bob (forward) and the head drawn in or up, as a move of the head on its neck
	_bob = spring(_bob, float(P.hfwd), 60.0, dt, 0.9)
	var off := Vector3(0, float(P.hup) - 0.008 * faint_w, _bob.x)
	set_local_pos(HEAD, rest_l[HEAD].origin + rest_g[SP3].basis.inverse() * off)
	# the beak
	turn_rest(BEAK, Vector3.RIGHT, float(P.beak) * 0.55)
	# the crest: up or flat, and flicked by the head's own moves
	crest = spring(crest, float(P.crest) - hp.y * 0.012 + absf(hy.y) * 0.006, 22.0, dt, 0.45)
	turn_rest(HAIR, Vector3.RIGHT, clampf(crest.x, -0.6, 1.0) * 0.6)

func _tail(P: Dictionary, dt: float, v: float) -> void:
	if _tail_kick > 0.0:
		tail_p.y += _tail_kick * 9.0
		_tail_kick = 0.0
	tail_p = spring(tail_p, float(P.tp), 20.0, dt, 0.35)
	tail_y = spring(tail_y, float(P.ty) - turn_v * 0.08, 14.0, dt, 0.5)
	turn_rest(TAIL[0], Vector3.RIGHT, tail_p.x * 0.6)
	turn_rest(TAIL[1], Vector3.RIGHT, tail_p.x * 0.4)
	turn_rest(TAIL[0], Vector3.UP, tail_y.x * 0.6)
	turn_rest(TAIL[1], Vector3.UP, tail_y.x * 0.4)

# ---------- the eyes (pidgey_eye1: 2 x 4 cells; the left column used, top down:
# open, half shut, shut, screwed shut) ----------
const EYES := {"open": Vector2(0, 0), "half": Vector2(0, 0.25), "closed": Vector2(0, 0.5), "squeeze": Vector2(0, 0.75)}

func _eyes(P: Dictionary, dt: float) -> void:
	blink -= dt
	var e: String = P.eye
	if fainted and faint_w > 0.5: e = "closed"
	if e in ["open", "half"] and blink < 0.0:
		# a blink: half, shut, half
		e = "half" if blink > -0.035 or blink < -0.1 else "closed"
		if blink < -0.135: blink = rng.randf_range(1.2, 4.5)
	if e != _eye and eye_mat:
		_eye = e
		eye_mat.set_shader_parameter("uv_off", EYES.get(e, Vector2.ZERO))
