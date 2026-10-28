class_name WildShot
extends RefCounted
# Dev only: scripted render cases for the hunt (wild.gd makes one when the game
# runs with -- --wild-test=<case>):
#   tells      Ash at the edge of a Route 1 patch, a Pidgey settles a few metres in;
#              he stands and watches its tells (--wild-peek=hidden | peek)
#   flee       he walks at it upright and startles it: it flies off to a safe zone,
#              the camera following it (--wild-react=flee | attack | curious)
#   engage     crouched, he creeps in and mashes A: the pounce into the battle
#   grab       he startles it close up and grabs it as it takes off
#   tutorial   the walk-through from the start (a fresh save): Oak, the steps, the pounce
#   crouchrun  in the grass, crouched: walking, still, walking (for the camera and the steps)
# --wild-outcome=ran | fled | ... : what the stand-in battle reports.

var W
var case := ""
var t := 0.0
var ph := 0
var e: Dictionary = {}
var start := Vector3(-13.0, 0, -84.5)   # (the north edge of the first patch, facing into it; --wild-at=x,z,yaw)
var yaw := PI
var react := ""
var _pressed_at := {}
var cam_off := -0.5        # --wild-cam=<radians>: the camera's turn from behind him

func _init(w, c: String) -> void:
	W = w; case = c
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--wild-peek="): Settings.extra["wild_peek"] = a.substr(12)
		elif a.begins_with("--wild-react="): react = a.substr(13)
		elif a.begins_with("--wild-outcome="): W.STUB.outcome = a.substr(15)
		elif a.begins_with("--wild-cam="): cam_off = float(a.substr(11))
		elif a.begins_with("--wild-at="):
			var v := a.substr(10).split(",")
			start = Vector3(float(v[0]), 0, float(v[1])); yaw = float(v[2])
	if case == "tutorial":
		W.brain.save_path = "user://wild_shot.save"
		W.brain.set_tutorial_done(false)
		W.tut.done = false
	else:
		W.tut.done = true

# a point d m ahead of the start (and s to his right)
func _ahead(d: float, s: float) -> Vector3:
	return start + Vector3(sin(yaw), 0, cos(yaw)) * d + Vector3(-cos(yaw), 0, sin(yaw)) * s

func _place(p: Vector3, y: float) -> void:
	var g = W.game
	p.y = g.world.height_at(p.x, p.z)
	g.pos = p; g.yaw = y; g.speed = 0.0
	W.cast.land(p.y)
	g.cam_yaw = y + PI + cam_off; g.cam_pitch = 0.3
	g.cam_target = p + Vector3(0, 1.45, 0)
	g.cam.position = Vector3.ZERO

# the stick that walks him toward `to` (main.gd moves relative to the camera), at tilt k
func _walk(to: Vector3, k: float) -> void:
	var g = W.game
	var cy: float = g.cam_yaw
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	var dir := Vector2(to.x - g.pos.x, to.z - g.pos.z).normalized()
	g.stick_vec = Vector2(dir.dot(r), -dir.dot(f)) * k

func _press(what: String, every: float, key: String) -> void:
	if t - float(_pressed_at.get(key, -9.0)) >= every:
		_pressed_at[key] = t
		match what:
			"a": W.cast._btn_a = true
			"crouch": W.cast._btn_crouch = true

func _spawn(at: Vector3, temper := "flighty") -> void:
	e = W.spawn("pidgey", W.sources[0], at, temper)
	if react != "": W.test_force = "react=" + react

func step(dt: float) -> void:
	t += dt
	var g = W.game
	g.cam_idle = 0.0
	if t < 0.25: return
	if ph == 0:
		_place(start, yaw)
		ph = 1
		print("wild-shot: %s at %s" % [case, str(g.pos)])
		if case == "tutorial":
			_place(_ahead(-6.0, 0.0), yaw)
		return
	match case:
		"tells":
			if ph == 1 and t > 0.6:
				_spawn(_ahead(4.2, 1.8)); ph = 2
				W.cast._btn_crouch = true
			g.stick_vec = Vector2.ZERO
			g.cam_dist = 4.2
			g.cam_pitch = 0.26
			g.cam_yaw = yaw + PI + cam_off
		"flee":
			if ph == 1 and t > 0.6:
				_spawn(_ahead(6.0, 0.5)); ph = 2
			if ph == 2:
				_walk((e.node as Node3D).position, 0.75)
				g.cam_dist = 6.0
				if String(e.state) != "hidden": ph = 3; e.t0 = t
			elif ph == 3:
				g.stick_vec = Vector2.ZERO
				# the camera turns to keep the bird in view as it goes
				var n: Node3D = e.node
				var want := atan2(g.pos.x - n.position.x, g.pos.z - n.position.z)
				g.cam_yaw += wrapf(want - float(g.cam_yaw), -PI, PI) * (1.0 - exp(-dt * 3.0))
				g.cam_dist = lerpf(float(g.cam_dist), 11.0, 1.0 - exp(-dt * 1.5))
				g.cam_pitch = lerpf(float(g.cam_pitch), 0.22, 1.0 - exp(-dt * 1.5))
				if String(e.state) == "hidden" and t - float(e.t0) > 2.0:
					ph = 4; e.t1 = t
					print("wild-shot: landed %.1f m away, compass: %s" % [W._d2(g.pos, n.position), str(W.track_hint())])
			elif ph == 4:
				# then he follows the trail toward it
				var n2: Node3D = e.node
				if t - float(e.t1) > 1.0: _walk(n2.position, 0.7)
				var want2 := atan2(g.pos.x - n2.position.x, g.pos.z - n2.position.z)
				g.cam_yaw += wrapf(want2 - float(g.cam_yaw), -PI, PI) * (1.0 - exp(-dt * 2.0))
				g.cam_dist = lerpf(float(g.cam_dist), 7.0, 1.0 - exp(-dt * 1.0))
		"engage", "grab":
			if ph == 1 and t > 0.6:
				_spawn(_ahead(5.5, 0.4)); ph = 2
				W.cast._btn_crouch = case == "engage"
			var n3: Node3D = e.node if not e.is_empty() else null
			g.cam_dist = 4.6
			g.cam_yaw = yaw + PI + cam_off
			if ph == 2 and n3:
				var d: float = W._d2(g.pos, n3.position)
				if case == "engage":
					if t > 1.6 and d > 1.7: _walk(n3.position, 0.5)
					else: g.stick_vec = Vector2.ZERO
					if d <= 1.75: ph = 3; e.t0 = t
				else:
					if t > 1.2: _walk(n3.position, 0.75)
					if String(e.state) == "fleeing": ph = 3; e.t0 = t; g.stick_vec = Vector2.ZERO
			elif ph == 3:
				g.stick_vec = Vector2.ZERO
				if t - float(e.t0) > (0.5 if case == "engage" else 0.15): _press("a", 0.22, "mash")
				if String(e.state) in ["battle", "pounced"]: ph = 4
		"tutorial":
			_tutorial(dt)
		"crouchrun":
			if ph == 1:
				W.cast._btn_crouch = true; ph = 2
			g.cam_dist = 6.0
			var tt := t - 0.5
			if tt < 3.0 or (tt > 5.0 and tt < 8.0): _walk(_ahead(12.0, 0.0), 1.0)
			else: g.stick_vec = Vector2.ZERO

func _tutorial(dt: float) -> void:
	var g = W.game
	var tut = W.tut
	g.cam_dist = 5.5
	if ph == 1:
		# he walks up to the grass: the call comes
		if tut.state == "off": _walk(start, 0.55)
		else: g.stick_vec = Vector2.ZERO; ph = 2; e.t0 = t
	elif ph == 2:
		# Oak's lines go by; "Sure, show me!"
		if tut.dp.visible:
			if not tut.dp.is_typing(): _press("a", 1.4, "talk")
		if tut.state == "watch": ph = 3
	elif ph == 3:
		if tut.state == "crouch" and t - float(_pressed_at.get("cr", -9.0)) > 1.5:
			_pressed_at["cr"] = t
			W.cast._btn_crouch = not W.cast.crouching
		if tut.state in ["sneak", "engage"]:
			var n: Node3D = tut.e.node
			var d: float = W._d2(g.pos, n.position)
			if tut.state == "sneak": _walk(n.position, 0.5)
			else:
				g.stick_vec = Vector2.ZERO
				if d < 1.9: _press("a", 0.25, "mash")
		if tut.state in ["battle", "outro"]: ph = 4
	elif ph == 4:
		g.stick_vec = Vector2.ZERO
		if tut.dp.visible and not tut.dp.is_typing(): _press("a", 1.4, "talk")
