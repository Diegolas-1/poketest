class_name ScenePerson
extends Node3D
# A person moved by a script (a cutscene, the battle's defeat event) rather than by
# life.gd: one of the cast's looks (CastActor, res://cast/<look>.glb: Nurse Joy
# "joy", Officer Jenny "jenny", anyone) with its clips, cloth, blinking and the
# idles' acting, driven by a few verbs. Joy was made a cast look (web/world/cast2.js
# BUILD.joy, after the X/Y field model's design) so she shares the cast's skeleton,
# clips, stances and conversation emotes instead of being a rip with its own rig.
#
#   var joy := ScenePerson.make("joy")
#   game.add_child(joy)
#   joy.ground = func(x, z): return terrain_height(x, z)   # (else level at its own y)
#   joy.place(Vector3(...), yaw)            # stands there (yaw: radians, 0 = facing +z)
#   joy.run_to(ash_pos, 4.2, 1.0)           # runs (speed m/s), stops 1 m short; signal arrived
#   joy.kneel_by(ash_pos)                   # goes to his side if needed, faces him and kneels
#                                           # (seiza), a hand reaching to him; signal knelt
#   joy.say("Oh my! Are you hurt?")         # the mouth moves for the line, with a gesture
#                                           # (the conversation's emote rules) and a nod
#   joy.emote("worry")                      # a gesture now (idles.gd's talk emotes; kneeling:
#                                           # explain / worry / nod / reach)
#   joy.stand_up()                          # back up from kneeling
#   joy.clasp(true)                         # stands with her hands clasped in front
#   joy.bow()                               # a polite bow (hands clasped); signal done("bow")
#   joy.look_at_point(p) / joy.look_at_node(n)   # where the head turns (NAN / null: ahead)
#   joy.busy()                              # moving, kneeling down, bowing
#
# Talking in Conversation (conversation.gd) works on .actor like anyone else's.

signal arrived
signal knelt
signal done(what: String)

var actor: CastActor
var ground: Callable
var speed := 0.0                 # this frame's ground speed (m/s)
var yaw := 0.0
var state := "stand"             # stand | move | kneel_down | kneel | stand_up
var _to := Vector3.INF
var _vmax := 0.0
var _stop := 0.0
var _then := ""                  # after arriving: "kneel"
var _face := NAN                 # a yaw to turn to while standing
var _look := Vector3(NAN, NAN, NAN)
var _look_node: Node3D
var _kneel_at := Vector3.INF     # what she kneels by (world)
var _kneel_key := ""
var _kt := 0.0
var _say_t := 0.0
var _nod_t := -1.0
var _rng := RandomNumberGenerator.new()

const KNEEL_DIST := 0.62         # from her feet to what she kneels by (m)
const KNEEL := {"dy": -0.5, "dz": 0.03, "wp": 0.08, "lean": 0.32, "ko": 0.05, "hp": 0.28}

static func make(look: String) -> ScenePerson:
	var p := ScenePerson.new()
	p.name = "Scene_" + look
	p.actor = CastActor.make(look)
	# a grown-up's gait (life.gd's townspeople): a walk to 2 m/s, a run beyond
	p.actor.walk_v = 2.0; p.actor.run_v = 3.6
	p.actor.cad_walk = 0.9; p.actor.cad_run = 1.45
	p.add_child(p.actor)
	p._rng.randomize()
	return p

func place(p: Vector3, y := 0.0) -> void:
	global_position = Vector3(p.x, _gy(p), p.z)
	yaw = y
	rotation.y = yaw
	_to = Vector3.INF
	state = "stand"

func run_to(p: Vector3, v := 4.2, stop := 0.0) -> void: _go(p, v, stop, "")
func walk_to(p: Vector3, v := 1.4, stop := 0.0) -> void: _go(p, v, stop, "")

func _go(p: Vector3, v: float, stop: float, then: String) -> void:
	if state in ["kneel", "kneel_down"]: stand_up()
	_to = p; _vmax = v; _stop = stop; _then = then
	state = "move"
	actor.idles.release()

func face(p: Vector3) -> void:
	_face = atan2(p.x - global_position.x, p.z - global_position.z)

func look_at_point(p: Vector3) -> void:
	_look = p; _look_node = null

func look_at_node(n: Node3D) -> void:
	_look_node = n

func clasp(on := true) -> void:
	actor.idles.stance = "hands_front" if on else ""

func busy() -> bool:
	return state != "stand" and state != "kneel" or (actor.idles.busy and actor.idles.acting() == "scene_bow")

# kneel by a point (someone lying there): beside it, KNEEL_DIST from it on her side, facing it
func kneel_by(p: Vector3, v := 3.0) -> void:
	_kneel_at = p
	look_at_point(p)
	var here := Vector3(global_position.x, 0, global_position.z)
	var d := here - Vector3(p.x, 0, p.z)
	if d.length() < 0.05: d = Vector3(0, 0, 1)
	var spot := p + d.normalized() * KNEEL_DIST
	spot.y = p.y
	if here.distance_to(Vector3(spot.x, 0, spot.z)) > 0.12:
		_go(spot, v, 0.0, "kneel")
	else:
		_kneel_now()

func _kneel_now() -> void:
	state = "kneel_down"
	_kt = 0.0
	face(_kneel_at)
	_force_kneel("reach", true)

func stand_up() -> void:
	if state in ["kneel", "kneel_down"]:
		actor.idles.release()
		state = "stand_up"
		_kt = 0.0

func bow() -> void:
	_defs()
	actor.idles.force("scene_bow")

# a gesture: standing, one of idles.gd's talk emotes (conversation.gd's EMOTES); kneeling,
# explain / worry / nod / reach
func emote(e: String) -> void:
	if e == "nod": _nod_t = 0.0; return
	if state in ["kneel", "kneel_down"]:
		_force_kneel(e if e in ["explain", "worry", "reach"] else "explain", false)
		return
	_defs()
	if IdleActions.ACTIONS.has(e): actor.idles.force(e)

# say a line: the mouth for as long as it takes to read (or dur), a gesture by the words
func say(text: String, dur := -1.0) -> void:
	_say_t = dur if dur > 0.0 else clampf(text.length() * 0.055, 0.8, 6.0)
	var e := ""
	var low := text.to_lower()
	for r in Conversation._emote_rules():
		if r[1].search(low): e = r[0]; break
	if e == "" and text.length() > 40: e = "explain"
	if e != "": emote(e)
	elif _rng.randf() < 0.5: _nod_t = 0.0

# ---------- the acting ----------
func _defs() -> void:
	var D := IdleActions._defs()
	if D.has("scene_bow"): return
	var CLR := {"at": ["Hips", -0.006, -0.14, 0.19], "pole": [-1, 0.0, 0.25], "wf": -0.2, "wd": 0.3, "wt": 0.5, "cu": 0.35}
	var CLL := {"at": ["Hips", 0.022, -0.16, 0.178], "pole": [1, 0.0, 0.25], "wf": -0.2, "wd": 0.3, "wt": 0.5, "cu": 0.45}
	var BOW := {"lean": 0.95, "hp": 0.45}
	D["scene_bow"] = {"dur": 2.6, "talk": true,
		"body": [[0, {}], [0.55, BOW], [1.55, BOW], [2.6, {}]],
		"armR": [[0, null], [0.4, CLR], [2.1, CLR], [2.6, null]],
		"armL": [[0, null], [0.4, CLL], [2.1, CLL], [2.6, null]],
		"gaze": [[0, {"y": 0, "p": 0}], [2.6, {"y": 0, "p": 0}]]}

# the kneel as one idles action (legs: the feet stay planted, the body comes down onto
# her knees), rebuilt for each gesture made while kneeling (the body already down, so
# only the arms change): the left hand on her thigh, the right per gesture
func _force_kneel(g: String, down: bool) -> void:
	_defs()
	var L := 9999.0
	var t0 := 1.1 if down else 0.0
	var body := [[0.0, {}], [0.35, {"dy": -0.1, "lean": 0.18, "hp": 0.15}], [1.1, KNEEL], [L, KNEEL]] if down else [[0.0, KNEEL], [L, KNEEL]]
	var THL := {"at": ["LLeg", -0.02, 0.1, 0.09], "pole": [0.6, -0.6, -0.5], "wf": 0.4, "cu": 0.1}
	var THR := {"at": ["RLeg", 0.02, 0.1, 0.09], "pole": [-0.6, -0.6, -0.5], "wf": 0.4, "cu": 0.1}
	var arm_l := [[0.0, null], [t0 + 0.4, THL], [L, THL]]
	var arm_r: Array
	var rel := to_local(_kneel_at) if _kneel_at != Vector3.INF else Vector3(0, 0.15, KNEEL_DIST)
	var REACH := {"at": ["root", -0.05, clampf(rel.y + 0.16, 0.08, 0.6), clampf(rel.z - 0.12, 0.3, 0.6)], "pole": [-1, -0.4, -0.3], "wf": 0.1, "wt": 0.5, "cu": 0.2}
	match g:
		"explain":
			var E1 := {"at": ["Spine3", -0.13, -0.14, 0.27], "pole": [-1, -0.6, -0.3], "wt": 1.1, "wf": -0.2, "cu": 0.05}
			var E2 := {"at": ["Spine3", -0.15, -0.1, 0.31], "pole": [-1, -0.6, -0.3], "wt": 1.2, "wf": -0.25, "cu": 0.0}
			arm_r = [[0.0, THR], [0.45, E1], [1.1, E2], [1.7, E1], [2.4, THR], [L, THR]]
		"worry":
			var W1 := {"at": ["Spine3", -0.03, -0.06, 0.2], "pole": [-1, -0.8, -0.2], "wt": 0.4, "cu": 0.6}
			var W2 := {"at": ["Spine3", 0.03, -0.07, 0.19], "pole": [1, -0.8, -0.2], "wt": 0.4, "cu": 0.6}
			arm_r = [[0.0, THR], [0.5, W1], [2.2, W1], [2.8, THR], [L, THR]]
			arm_l = [[0.0, THL], [0.5, W2], [2.2, W2], [2.8, THL], [L, THL]]
		_:
			# reach: a hand out to him (on his shoulder), resting there
			arm_r = [[0.0, null if down else THR], [t0 + 0.5, REACH], [L, REACH]]
	_kneel_key = "scene_kneel_%d" % get_instance_id()
	IdleActions._defs()[_kneel_key] = {"dur": L, "talk": true, "legs": true, "kup": 0.0, "body": body, "armL": arm_l, "armR": arm_r}
	actor.idles.force(_kneel_key, L)

func _gy(p: Vector3) -> float:
	return float(ground.call(p.x, p.z)) if ground.is_valid() else p.y

func _process(dt: float) -> void:
	if not is_instance_valid(actor): return
	var pos := global_position
	speed = 0.0
	match state:
		"move":
			var d := Vector3(_to.x - pos.x, 0, _to.z - pos.z)
			var left := d.length() - _stop
			if left <= 0.03:
				_to = Vector3.INF
				state = "stand"
				arrived.emit()
				if _then == "kneel": _kneel_now()
			else:
				# up to speed and eased into the stop (no skid), turning as it goes
				var v := minf(_vmax, sqrt(2.0 * 5.0 * left) + 0.2)
				var want := atan2(d.x, d.z)
				var turn := wrapf(want - yaw, -PI, PI)
				yaw = wrapf(yaw + turn * (1.0 - exp(-dt * 9.0)), -PI, PI)
				v *= clampf(1.2 - absf(turn) / PI * 1.5, 0.2, 1.0)
				var step := minf(v * dt, left)
				var fwd := Vector3(sin(yaw), 0, cos(yaw))
				pos += fwd * step
				speed = step / maxf(dt, 1e-4)
		"kneel_down":
			_kt += dt
			if _kt > 1.15: state = "kneel"; knelt.emit()
		"stand_up":
			_kt += dt
			if _kt > 0.55: state = "stand"; done.emit("stand_up")
	if state != "move" and not is_nan(_face):
		var turn2 := wrapf(_face - yaw, -PI, PI)
		yaw = wrapf(yaw + turn2 * (1.0 - exp(-dt * 6.0)), -PI, PI)
		if absf(turn2) < 0.01: _face = NAN
	pos.y = _gy(pos)
	global_position = pos
	rotation.y = yaw
	actor.ground = ground
	# the head toward what she looks at
	var lp := _look_node.global_position + Vector3(0, 1.0, 0) if is_instance_valid(_look_node) else _look
	if not is_nan(lp.x):
		var hp := global_position + Vector3(0, 1.55 if state == "stand" or state == "move" else 0.95, 0)
		var to := lp - hp
		actor.look_yaw = clampf(wrapf(atan2(to.x, to.z) - yaw, -PI, PI), -1.1, 1.1)
		actor.look_pitch = clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.6, 0.5)
	else:
		actor.look_yaw = NAN; actor.look_pitch = 0.0
	# talking: the jaw while the line lasts, a nod now and then
	if _say_t > 0.0:
		_say_t -= dt
		var tt := Time.get_ticks_msec() * 0.001
		actor.mouth = 0.35 + 0.65 * absf(sin(tt * 17.0 + sin(tt * 5.3) * 2.0)) if _say_t > 0.0 else 0.0
	else:
		actor.mouth = 0.0
	if _nod_t >= 0.0:
		_nod_t += dt
		actor.nod = sin(clampf(_nod_t / 0.9, 0.0, 1.0) * TAU) * 0.09 * (1.0 - _nod_t / 0.9) if _nod_t < 0.9 else 0.0
		if _nod_t >= 0.9: _nod_t = -1.0
	var was_bow := actor.idles.busy and actor.idles.acting() == "scene_bow"
	actor.animate(dt, speed, false)
	if was_bow and not (actor.idles.busy and actor.idles.acting() == "scene_bow"): done.emit("bow")
