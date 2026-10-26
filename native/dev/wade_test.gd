extends Node
# Dev only: wading, wetness, stamina and the conditions, in the real game.
#   godot --path native res://dev/wade_test.tscn -- --case=<case> [--log]
# (always starts dry and rested: --fresh-conditions, nothing saved)
#   pallet    run across Pallet Town's stream, west to east (side view)
#   creek     walk then run through Route 1's tea creek, north to south
#   feet      close on his legs running up Pallet's stream
#   tired     fatigued: walking, then standing hunched and panting
#   pond      wade into the pond's shallow edge (the middle stays out of reach)
#   dry       soaked, then a game hour fast-forwarded (clock x10): the wet line comes down
#   stamina   run until fatigued, the walking-only rule, the full-refill rule;
#             then a short stop at 30 % and running on (no fatigue)
#   wstamina  the same running through the stream (faster drain)
#   ui        the badge row, the new-condition card, a badge's card opened
#   talk      a wet episode: what each townsperson says first (printed), once per
#             episode; Bram's line shown in the box
#   lab       soaked at the lab door: refused; dried: let in
# Prints a line of numbers every half second (t, x, z, depth, speed, stamina, wet,
# conditions).
var main: Node
var frame := 0
var t := 0.0
var case := "pallet"
var _log_t := 0.0
var _phase := 0
var _ph_t := 0.0
var _said := {}

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--case="): case = a.substr(7)
	if not OS.get_cmdline_user_args().has("--fresh-conditions"):
		push_warning("wade_test: pass --fresh-conditions to keep the save out of it")
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _place(x: float, z: float, yaw: float) -> void:
	main.pos = Vector3(x, main.world.ash_ground(x, z), z)
	main.yaw = yaw
	main.speed = 0.0
	main.cast.land(main.pos.y)
	main.cam_ty = main.pos.y
	main.cam_target = main.pos + Vector3(0, 1.45, 0)

func _cam(yaw_off: float, dist: float, pitch: float) -> void:
	main.cam_yaw = main.yaw + yaw_off
	main.cam_dist = dist
	main.cam_pitch = pitch
	main.cam_idle = 0.0

func _log() -> void:
	var b: AshBody = main.cast.body
	var C: Conditions = main.cast.conditions
	var cs := []
	for id in C.active_ids(): cs.append("%s %.2f (%s)" % [id, C.strength(id), C.time_text(id)])
	print("t %5.1f  x %7.2f z %7.2f  depth %.2f  speed %.2f  stamina %.2f  wet line %.2f m  run %s  game %s  %s" % [t, main.pos.x, main.pos.z,
		b.depth, main.speed, b.stamina, b.wet_line, b.running, main.cast.clock.time_text(), ", ".join(cs)])

func _process(dt: float) -> void:
	frame += 1
	if frame < 3: return
	t += dt
	_ph_t += dt
	var c: Node = main.cast
	var b: AshBody = c.body
	var C: Conditions = c.conditions
	_log_t += dt
	if _log_t >= 0.5:
		_log_t = 0.0
		_log()
	match case:
		"pallet":
			# east into the stream, up it (north) for a few seconds, then out east
			if frame == 3: _place(1.5, 4.0, PI / 2.0)
			if _phase == 0 and main.pos.x > 9.0: _phase = 1; _ph_t = 0.0; main.yaw = PI
			if _phase == 1:
				main.yaw = PI
				if _ph_t > 3.0: _phase = 2; main.yaw = PI / 2.0
			if _phase == 2: main.yaw = PI / 2.0
			_drive(0.95 if t > 0.4 and main.pos.x < 17.5 else 0.0)
			_view(Vector3(4.5, 1.4, 2.5) if _phase == 1 else Vector3(0.0, 1.6, 5.2), Vector3(0, 0.6, 0))
		"creek":
			if frame == 3: _place(-80.0, -237.0, PI)
			# north: walk in, run out
			_drive((0.55 if main.pos.z > -244.0 else 0.95) if t > 0.4 and main.pos.z > -252.0 else 0.0)
			_view(Vector3(-5.2, 1.6, 0.0), Vector3(0, 0.6, 0))
		"feet":   # close on his legs running up the stream: spray, rings, the surface at his shins
			if frame == 3: _place(9.2, 10.0, PI)
			_drive(0.95 if t > 0.4 and t < 4.0 else 0.0)
			_view(Vector3(2.6, 0.9, -0.6), Vector3(0, 0.45, 0))
		"tired":   # worn out: walking only, hunched; then standing, panting
			if frame == 3:
				_place(-21.4, -40.0, PI)
				b.stamina = 0.05
			_drive(0.95 if t > 0.4 and t < 2.5 else 0.0)
			_view(Vector3(3.2, 1.3, 0.0), Vector3(0, 0.9, 0))
		"pond":
			if frame == 3: _place(-50.0, 50.5, PI)
			_drive(0.55 if t > 0.4 and t < 7.0 else 0.0)
			_view(Vector3(-5.5, 2.0, 0.5), Vector3(0, 0.6, 0))
		"dry":
			if frame == 3:
				_place(-21.4, -16.0, 0.0)
				C.apply("wet", 1.0)
			if t > 1.0 and c.clock.ff == 1.0: c.clock.ff = 10.0   # a game hour in 12 s
			_cam(0.25, 3.6, 0.1)
		"stamina", "wstamina":
			if frame == 3:
				if case == "stamina": _place(-21.4, -40.0, PI)
				else: _place(9.2, 0.0, 0.0)
			# run back and forth on a stretch (land: the lane north of Ash's house; water: along the stream)
			var lo := -60.0 if case == "stamina" else -6.0
			var hi := -20.0 if case == "stamina" else 14.0
			if main.pos.z < lo + 1.0: main.yaw = 0.0
			elif main.pos.z > hi - 1.0: main.yaw = PI
			var dirz := 1.0 if absf(wrapf(main.yaw, -PI, PI)) < PI / 2.0 else -1.0
			match _phase:
				0:   # run until fatigued
					_stick(dirz, 0.95)
					if C.has("fatigue"): _phase = 1; _ph_t = 0.0; print("FATIGUED at t %.1f stamina %.3f" % [t, b.stamina])
				1:   # hold run: he can't, he walks; then stand
					_stick(dirz, 0.95 if _ph_t < 3.0 else 0.0)
					if _ph_t > 2.0 and _ph_t < 2.2: print("  holding run while fatigued: speed %.2f (walk 4.5 x 0.88 = %.2f), can_run %s" % [main.speed, 4.5 * 0.88, b.can_run()])
					if not C.has("fatigue"): _phase = 2; _ph_t = 0.0; print("RECOVERED at t %.1f stamina %.3f" % [t, b.stamina])
				2:   # run down to ~30 %, stop briefly, run again
					_stick(dirz, 0.95)
					if b.stamina < 0.3: _phase = 3; _ph_t = 0.0; print("stop at stamina %.3f" % b.stamina)
				3:
					_stick(dirz, 0.0)
					if _ph_t > 2.5: _phase = 4; _ph_t = 0.0; print("run again at stamina %.3f, fatigue %s" % [b.stamina, C.has("fatigue")])
				4:
					_stick(dirz, 0.95)
					if _ph_t > 2.0: _phase = 5; print("after 2 s more running: stamina %.3f, fatigue %s, speed %.2f" % [b.stamina, C.has("fatigue"), main.speed])
				_:
					_stick(dirz, 0.0)
			_view(Vector3(4.5, 1.5, 0.0), Vector3(0, 0.8, 0))
		"ui":
			if frame == 3:
				_place(-21.4, -16.0, 0.0)
			if frame == 10: C.apply("wet", 0.55)
			if frame == 60: b.stamina = 0.12
			if frame == 64: b.stamina = 0.05
			if frame == 100: _tap(c.cond_ui, "wet")
			if frame == 130: _tap(c.cond_ui, "wet"); _tap(c.cond_ui, "fatigue")
			_cam(0.5, 5.0, 0.15)
		"talk":
			if frame == 3:
				_place(-21.4, -16.0, 0.0)
				C.apply("wet", 0.7)
			if frame == 6:
				var Q = c.life.quests
				for id in ["delia", "bram", "mae", "timmy", "lily", "tom", "kai", "gus", "rose", "ada", "ben", "marina"]:
					print("%s: %s" % [id, " / ".join(Q.talk(id, {}))])
				print("-- again (same episode: no remark) --")
				print("bram: %s" % " / ".join(Q.talk("bram", {})))
				C.remove("wet"); C.apply("wet", 0.25)
				print("-- a new episode, damp --")
				print("bram: %s" % " / ".join(Q.talk("bram", {})))
				print("delia: %s" % " / ".join(Q.talk("delia", {})))
				C.remove("wet"); C.apply("wet", 0.7)
				C.remarked.clear(); C.remark_at.clear()   # (for the picture: a fresh episode for everyone)
				var ln: Array = Q.talk("bram", {})
				c.dialog.voice = "mid"
				c.dialog.say(ln)
			_cam(0.5, 4.5, 0.15)
		"lab":
			var d: Vector2 = c.lab_door
			if frame == 3:
				_place(d.x + 1.0, d.y, PI / 2.0)
				main.yaw = -PI / 2.0
				C.apply("wet", 0.8)
			if frame == 5: main.yaw = -PI / 2.0 + PI
			if frame == 8:
				main.pos = Vector3(d.x + 1.0, main.world.height_at(d.x + 1.0, d.y), d.y); main.yaw = -PI / 2.0
			if frame == 10: c._btn_a = true
			if frame == 12: print("refused: dialog open %s, indoors %s, line: %s" % [c.dialog.open, main.indoors, c.dialog.lines[0] if c.dialog.open else ""])
			if frame in [30, 38, 46, 54, 62]: c._btn_a = true
			if frame == 78: print("dialog closed: %s" % (not c.dialog.open))
			if frame == 80:
				C.remove("wet")
				print("dried off; pressing A again")
				main.pos = Vector3(d.x + 1.0, main.world.height_at(d.x + 1.0, d.y), d.y); main.yaw = -PI / 2.0
			if frame == 82: c._btn_a = true
			if frame == 100: print("after drying: indoors %s" % main.indoors)
			if frame < 80: _view(Vector3(-4.2, 1.9, 2.2), Vector3(0.8, 1.2, 0))

func _stick(_dirz: float, amt: float) -> void: _drive(amt)

# push the stick straight ahead (the stick is camera-relative: the game's camera
# kept behind him; _view then moves the picture's camera)
func _drive(amt: float) -> void:
	main.cam_yaw = main.yaw + PI
	main.cam_idle = 0.0
	main.stick_vec = Vector2(0, -amt) if amt > 0.0 else Vector2.ZERO

# the picture's camera at an offset from him in world axes, looking at him + look
func _view(off: Vector3, look: Vector3) -> void:
	var p: Vector3 = main.pos
	main.cam.look_at_from_position(p + off, p + look)

func _tap(ui: ConditionsUI, id: String) -> void:
	if not ui._rects.has(id): return
	var ev := InputEventScreenTouch.new()
	ev.pressed = true
	ev.position = (ui._rects[id] as Rect2).get_center()
	ui._input(ev)
