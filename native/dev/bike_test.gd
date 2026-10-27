extends Node
# Dev only: Ash's bike in the real game, scripted (renders and a ride test).
#   godot --path native res://dev/bike_test.tscn -- --fresh-bike --case=<name> [--snap=f,f --snapdir=dir]
# cases:
#   parked     the camera on the parked bike by Ash's house
#   mount      Ash walks up, presses A, gets on and rides off down the lane
#   ride       on the bike at --at=x,z,yaw, the stick held (--stick=x,y, camera-relative), the game camera
#   turn       riding a circle (--at), a side camera to see the lean
#   ledge      Route 1: riding south off a ledge
#   test       the scripted ride test: town -> Route 1 -> the gate and back, ledges down,
#              the shoreline stop, stairs blocked, a door (Oak's lab) dismounts; prints PASS / FAIL
#   cyclists   a townsperson's bike ride in view (--who=ben|ada|timmy)
# --cam=px,py,pz,tx,ty,tz  a fixed camera   --side=d  a camera d m off the bike's left, following

var main: Node
var frame := 0
var case := ""
var snaps: Array = []
var snapdir := ""
var cam_v := PackedFloat64Array()
var side := 0.0
var at := PackedFloat64Array()
var stick := Vector2.ZERO
var log_t := 0.0
var T := 0.0
var res := {}
var phase := 0
var ph_t := 0.0
var waypoints: Array = []
var wi := 0
var trace: Array = []
var fails: Array = []
var notes: Array = []

func _arg(k: String, d: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--" + k + "="): return a.substr(k.length() + 3)
	return d

func _nums(k: String) -> PackedFloat64Array:
	var v := _arg(k, "")
	if v == "": return PackedFloat64Array()
	return PackedFloat64Array(Array(v.split(",")).map(func(x): return float(x)))

func _ready() -> void:
	process_priority = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	case = _arg("case", "parked")
	snaps = Array(_arg("snap", "").split(",")).filter(func(x): return x != "").map(func(x): return int(x))
	snapdir = _arg("snapdir", "")
	cam_v = _nums("cam")
	side = float(_arg("side", "0"))
	at = _nums("at")
	var sv := _nums("stick")
	if sv.size() == 2: stick = Vector2(sv[0], sv[1])
	main = load("res://main.tscn").instantiate()
	main.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(main)

func B() -> AshBike: return main.cast.bike

# put Ash on the bike at once, there
func _ride_at(x: float, z: float, y: float) -> void:
	var b := B()
	b.at = Vector3(x, main.world.height_at(x, z), z)
	b.yaw = y
	b._pose_parked()
	b.state = "ride"
	b.rider.on = 1.0
	b.rider.mount = 1.0
	b.rider.mounting = true
	main.cast.player.rider = b.rider
	b.kick = 0.0
	main.pos = b.at
	main.yaw = y
	main.cast.land(b.at.y)
	main.cam_yaw = y + PI
	main.cam_ty = b.at.y
	main.cam_target = b.at + Vector3(0, 1.45, 0)
	main.cam.position = Vector3.ZERO

func _process(dt: float) -> void:
	frame += 1
	T += dt
	if frame < 3: return
	if OS.get_cmdline_user_args().has("--nobanner"): main.cast.dialog._ban_t = 9.0
	match case:
		"parked": pass
		"mount": _mount(dt)
		"ride", "turn", "coast":
			if frame == 4 and at.size() == 3: _ride_at(at[0], at[1], at[2])
			if frame > 6:
				main.stick_vec = stick
				var b := B()
				var f := Vector3(sin(b.yaw), 0, cos(b.yaw))
				# turn: the stick held at an angle to the way he goes (once up to speed)
				if case == "turn" and T > float(_arg("turn_at", "2.0")): main.stick_vec = _toward(b.at + f.rotated(Vector3.UP, float(_arg("ang", "0.8"))) * 5.0, stick.length())
				# coast: up to speed, then a light touch on the stick (the pedals still)
				if case == "coast" and T > float(_arg("turn_at", "2.5")): main.stick_vec = _toward(b.at + f * 5.0, 0.2)
		"ledge":
			if frame == 4: _ride_at(at[0] if at.size() >= 2 else -14.0, at[1] if at.size() >= 2 else -150.0, 0.0)
			if frame > 6: main.stick_vec = Vector2(0, 1) * 0.0 + _toward(Vector3(main.pos.x, 0, main.pos.z + 10.0))
		"test": _test(dt)
		"stats": _stats(dt)
		"road":
			# Route 1's road north from --at (its nearest point), the stick at --tilt
			if frame == 4 and at.size() == 3: _ride_at(at[0], at[1], at[2])
			if frame == 5:
				var road: Array = main.cast.road
				var bi := 0
				for i in road.size():
					if Vector2(road[i][0], road[i][1]).distance_to(Vector2(at[0], at[1])) < Vector2(road[bi][0], road[bi][1]).distance_to(Vector2(at[0], at[1])): bi = i
				var i2 := bi - 3
				while i2 >= 0:
					waypoints.append(Vector3(road[i2][0], 0, road[i2][1])); i2 -= 3
			if frame > 6:
				_follow(dt)
				main.stick_vec *= float(_arg("tilt", "0.85"))
		"cyclists": _cyclists()
	if cam_v.size() == 6:
		main.cam.look_at_from_position(Vector3(cam_v[0], cam_v[1], cam_v[2]), Vector3(cam_v[3], cam_v[4], cam_v[5]))
	elif _arg("chase", "") != "" and B().riding():
		# behind and a little to the side, low: a chase camera
		var cv := _nums("chase")
		var b := B()
		var f := Vector3(sin(b.yaw), 0, cos(b.yaw))
		var l := Vector3(cos(b.yaw), 0, -sin(b.yaw))
		var p := b.at - f * cv[0] + l * (cv[2] if cv.size() > 2 else 1.0) + Vector3(0, cv[1], 0)
		main.cam.look_at_from_position(p, b.at + Vector3(0, 0.95, 0) + f * 1.0)
	elif side != 0.0 and B().riding():
		var b := B()
		var l := Vector3(cos(b.yaw), 0, -sin(b.yaw))
		var f := Vector3(sin(b.yaw), 0, cos(b.yaw))
		var p := b.at + l * side + f * 0.6 + Vector3(0, 1.0, 0)
		main.cam.look_at_from_position(p, b.at + Vector3(0, 0.8, 0) + f * 0.25)
	if frame in snaps and snapdir != "":
		var fr := frame
		RenderingServer.frame_post_draw.connect(func(): get_viewport().get_texture().get_image().save_png("%s/s%04d.png" % [snapdir, fr]), CONNECT_ONE_SHOT)
	log_t += dt
	if log_t > 0.5 and OS.get_cmdline_user_args().has("--log"):
		log_t = 0.0
		var b := B()
		print("t %.1f state %s pos (%.2f %.2f %.2f) v %.2f yaw %.2f lean %.2f steer %.2f surf %s ground %s us %d busy %s stick %s lim %.1f" % [T, b.state, b.at.x, b.at.y, b.at.z, b.v, b.yaw, b.lean, b.steer, b.surface, main.cast.ground, int(b.stats.us), main.cast.busy(), str(main.stick_vec), b._people_limit(Vector3(sin(b.yaw), 0, cos(b.yaw)))])

# the stick that points the bike toward a world point (camera-relative, as main.gd reads it)
func _toward(p: Vector3, tilt := 1.0) -> Vector2:
	var d := Vector2(p.x - main.pos.x, p.z - main.pos.z).normalized()
	var cy: float = main.cam_yaw
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	# main: dir = r * mv.x - f * mv.y
	return Vector2(d.dot(r), -d.dot(f)) * tilt

func _mount(_dt: float) -> void:
	var b := B()
	if frame == 4:
		var s := b._side_world() + Vector3(sin(b.yaw + 0.8) * 1.2, 0, cos(b.yaw + 0.8) * 1.2)
		main.pos = Vector3(s.x, main.world.height_at(s.x, s.z), s.z)
		main.yaw = atan2(b.at.x - s.x, b.at.z - s.z)
		main.cast.land(main.pos.y)
		main.cam_yaw = b.yaw + PI * 0.5 + 0.4
		main.cam_pitch = 0.25
	if frame == 10: main.cast._btn_a = true
	if b.state == "ride" and ph_t < 99.0:
		ph_t += _dt
		if ph_t > 0.4:
			var go := _toward(Vector3(-21.0, 0, -12.0), 0.7) if main.pos.z < -15.0 else _toward(Vector3(-25.0, 0, 0.0), 0.9)
			main.stick_vec = go

func _cyclists() -> void:
	var life = main.cast.life
	if life == null or life.cyclists == null: return
	var who := _arg("who", "ben")
	if frame == 5: life.cyclists.debug_start(who)
	var p: Dictionary = life.by_id.get(who, {})
	if p.is_empty(): return
	if OS.get_cmdline_user_args().has("--log") and frame % 15 == 0:
		var e: Dictionary = life.cyclists.bikes[who]
		print("cyc t %.1f state %s cyc %s pos %s v %.2f bike %s kick %.1f lean %.2f" % [T, p.state, str(p.get("cyc", {}).get("phase", "-")), str(p.pos), float(p.v), str(e.at), e.kick, e.lean])
	var c := Vector3(p.pos)
	var f := Vector3(sin(p.yaw), 0, cos(p.yaw))
	var l := Vector3(cos(p.yaw), 0, -sin(p.yaw))
	main.cast.player.visible = false
	var cv := _nums("chase")
	if cv.size() >= 2:
		var cp := c - f * cv[0] + l * (cv[2] if cv.size() > 2 else 1.0) + Vector3(0, cv[1], 0)
		if not has_meta("ncam"): set_meta("ncam", cp)
		var sm: Vector3 = get_meta("ncam")
		sm = sm.lerp(cp, 0.12)
		set_meta("ncam", sm)
		main.cam.look_at_from_position(sm, c + Vector3(0, 0.85, 0) + f * 0.8)
		main.pos = c + l * 30.0
	else:
		main.pos = c + l * 6.0
		main.cam.look_at_from_position(c + l * 4.2 + f * 2.5 + Vector3(0, 1.6, 0), c + Vector3(0, 0.9, 0))

# ---------- --stats: the cost with Ash's bike and three townspeople riding near ----------
var _st := {"n": 0, "proc": 0.0, "bike": 0.0, "life": 0.0, "anim": 0.0, "cloth": 0.0}
func _stats(dt: float) -> void:
	var life = main.cast.life
	var C = life.cyclists
	if frame == 4:
		_ride_at(-8.0, 10.0, PI * 0.5)
		var spots := [Vector3(-14.0, 0, 6.0), Vector3(-12.0, 0, 12.0), Vector3(4.0, 0, 8.0)]
		var i := 0
		for id in C.bikes:
			var e: Dictionary = C.bikes[id]
			var sp: Vector3 = spots[i % spots.size()]
			e.at = Vector3(sp.x, main.world.height_at(sp.x, sp.z), sp.z)
			e.yaw = 0.0
			C._pose(e, 0.0)
			C.debug_start(id)
			i += 1
	if frame > 6:
		main.stick_vec = _toward(Vector3(-8.0 + 30.0 * sin(T * 0.25), 0, 10.0 + 20.0 * cos(T * 0.25)), 0.45)
	if frame > 60 and frame <= 300:
		_st.n += 1
		_st.proc += Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
		_st.bike += B().stats.us
		_st.life += life.stats.us_avg
		_st.anim += life.stats.anim_avg
		var ccost := 0.0
		for id in C.bikes:
			var p: Dictionary = life.by_id[id]
			if p.actor and p.actor.cloth: ccost += p.actor.sim_cost_us
		_st.cloth += ccost
	var R := RenderingServer
	if frame in [302, 304]:
		var riding := 0
		for id in C.bikes: if C.riding(life.by_id[id]): riding += 1
		print("stats frame %d bikes %s: draws %d objects %d primitives %d (townspeople riding now %d)" % [frame, "shown" if frame == 302 else "hidden", R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			R.get_rendering_info(R.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME), R.get_rendering_info(R.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME), riding])
	if frame == 302:
		for id in C.bikes: C.bikes[id].model.visible = false
		B().model.visible = false
	if frame == 303:
		var n: float = maxf(1.0, _st.n)
		print("stats per frame (avg of %d): process %.2f ms, Ash's bike control %.0f us, town life sim %.0f us, townspeople animation %.0f us (riders' IK and cloth included), their cloth %.0f us; bike model %d triangles" % [_st.n, _st.proc / n, _st.bike / n, _st.life / n, _st.anim / n, _st.cloth / n, B().model.tris])
		var cs := ""
		for id in C.bikes: cs += "%s %s; " % [id, str(life.by_id[id].get("cyc", {}).get("phase", "-"))]
		print("stats cyclists: " + cs)

# ---------- the ride test ----------
func _check(ok: bool, what: String) -> void:
	if ok: notes.append("PASS " + what)
	else: fails.append("FAIL " + what); notes.append("FAIL " + what)
	print(("PASS " if ok else "FAIL ") + what)

func _test(dt: float) -> void:
	var b := B()
	ph_t += dt
	var W = main.world
	match phase:
		0:
			# start: walk up to the parked bike and get on
			if frame == 4:
				var s := b._side_world()
				main.pos = s + Vector3(0.8, 0, 0.6)
				main.pos.y = W.height_at(main.pos.x, main.pos.z)
				main.cast.land(main.pos.y)
			if frame == 8: main.cast._btn_a = true
			if b.state == "ride": _check(true, "got on the parked bike (%.1f s)" % ph_t); _next()
			elif ph_t > 4.0: _check(false, "got on the parked bike (state %s)" % b.state); _next()
		1:
			# ride to the square (the town's walk grid), then up Route 1's road to the gate
			if waypoints.is_empty():
				var road: Array = main.cast.road
				var path: PackedVector2Array = main.cast.life.find_path(Vector2(b.at.x, b.at.z), Vector2(road[road.size() - 20][0], road[road.size() - 20][1]))
				for q in path: waypoints.append(Vector3(q.x, 0, q.y))
				var i2 := road.size() - 25
				while i2 >= 0:
					waypoints.append(Vector3(road[i2][0], 0, road[i2][1]))
					i2 -= 3
				res.vmax = 0.0
				res.air = 0
				res.clip = 0
				res.frames = 0
			_follow(dt)
			res.vmax = maxf(res.vmax, b.v)
			res.frames += 1
			if not main.cast.ground: res.air += 1
			_clip_check()
			if wi >= waypoints.size() or b.at.z < -425.0 or ph_t > 150.0:
				_check(b.at.z < -400.0, "rode the lanes and Route 1 to the gate (z %.0f in %.0f s, top speed %.1f m/s)" % [b.at.z, ph_t, res.vmax])
				_check(res.vmax > 8.0 and res.vmax <= 12.5, "speed in range (%.1f)" % res.vmax)
				_check(res.clip < res.frames * 0.02, "hands and feet stayed on the grips and pedals (%d of %d frames off)" % [res.clip, res.frames])
				_next()
		2:
			# and back south down Route 1's road to town (ledges only ever ridden down)
			if waypoints.is_empty():
				var road: Array = main.cast.road
				var bi := 0
				for i in road.size():
					if Vector2(road[i][0], road[i][1]).distance_to(Vector2(b.at.x, b.at.z)) < Vector2(road[bi][0], road[bi][1]).distance_to(Vector2(b.at.x, b.at.z)): bi = i
				var i2 := bi + 4
				while i2 < road.size():
					waypoints.append(Vector3(road[i2][0], 0, road[i2][1]))
					i2 += 3
				res.air = 0
			_follow(dt)
			if not main.cast.ground: res.air += 1
			_clip_check()
			if wi >= waypoints.size() or b.at.z > -10.0 or ph_t > 150.0:
				_check(b.at.z > -40.0, "rode back down to town (z %.0f in %.0f s, airborne frames %d)" % [b.at.z, ph_t, res.air])
				phase = 10; ph_t = 0.0
		10:
			# a ledge: the nearest ledge cell to Route 1's road, ridden off going south
			if ph_t < dt * 1.5:
				var L := _find_ledge()
				res.ledge = L
				if L == Vector3.ZERO:
					_check(false, "found a ledge to ride off"); _next(); return
				_ride_at(L.x, L.z - 3.0, 0.0)
				res.l_air = 0
				res.l_y0 = b.at.y
			main.stick_vec = _toward(Vector3(res.ledge.x, 0, res.ledge.z + 8.0), 1.0)
			if not main.cast.ground: res.l_air += 1
			if ph_t > 3.0:
				_check(b.at.z > res.ledge.z + 0.5 and res.l_air > 6, "rode off the ledge at (%.1f, %.1f) with a hop (airborne %d frames, dropped %.2f m)" % [res.ledge.x, res.ledge.z, res.l_air, res.l_y0 - b.at.y])
				# and can't ride back up it
				res.l_back = b.at
				phase = 11; ph_t = 0.0
		11:
			main.stick_vec = _toward(Vector3(res.ledge.x, 0, res.ledge.z - 8.0), 1.0)
			# straight back up through the ledge (round its end is fine)
			if b.at.z < res.ledge.z - 0.3 and absf(b.at.x - res.ledge.x) < 1.2: res.l_up = true
			if ph_t > 4.0:
				_check(not res.get("l_up", false), "could not ride back up through the ledge (now at %.1f, %.1f; ledge %.1f, %.1f)" % [b.at.x, b.at.z, res.ledge.x, res.ledge.z])
				phase = 3; ph_t = 0.0
		3:
			# the shoreline: from the beach, ride south into the sea
			if ph_t < dt * 1.5: _ride_at(20.0, 98.0, 0.0)
			main.stick_vec = _toward(Vector3(20.0, 0, 140.0), 1.0)
			if ph_t > 6.0:
				var fl: int = W.flag(b.at.x, b.at.z)
				var front := b.at + Vector3(sin(b.yaw), 0, cos(b.yaw)) * 0.5
				var ff: int = W.flag(front.x, front.z)
				_check(fl != 255 and not (fl & 1 and not fl & 4) and absf(b.v) < 0.3, "stopped at the shoreline (z %.1f, flag %d, front flag %d, v %.2f)" % [b.at.z, fl, ff, b.v])
				_next()
		4:
			# stairs: Oak's lab stairs from the bottom
			if ph_t < dt * 1.5:
				var s: Rect2 = main.sfx_world.STAIRS
				var c := s.get_center()
				_ride_at(c.x - s.size.x * 0.5 - 2.5, c.y, PI * 0.5)
				res.st0 = b.at
			main.stick_vec = _toward(Vector3(main.sfx_world.STAIRS.get_center().x + 6.0, 0, main.sfx_world.STAIRS.get_center().y), 0.8)
			if ph_t > 4.0:
				var s2: Rect2 = main.sfx_world.STAIRS
				_check(b.at.x < s2.position.x + 1.2 and b.at.y - res.st0.y < 0.4, "stairs blocked: stopped at the bottom step (at %.1f, %.1f, up %.2f m; stairs from x %.1f)" % [b.at.x, b.at.z, b.at.y - res.st0.y, s2.position.x])
				_next()
		5:
			# a door: ride to Oak's lab door, press A: parked outside, Ash goes in
			if ph_t < dt * 1.5:
				var d: Vector2 = main.cast.lab_door
				_ride_at(d.x + 1.6, d.y, -PI * 0.5)
			main.stick_vec = Vector2.ZERO
			if absf(ph_t - 0.8) < dt * 0.6: main.cast._btn_a = true
			if ph_t > 2.5:
				_check(main.indoors and b.state == "parked" and not b.visible, "the door: parked outside, Ash inside (indoors %s, state %s)" % [main.indoors, b.state])
				_check(b.at.distance_to(Vector3(main.cast.lab_door.x + 1.6, b.at.y, main.cast.lab_door.y)) < 1.0, "the bike stayed at the door")
				_next()
		6:
			if ph_t < dt * 1.5: main.leave_space(true)
			if ph_t > 1.0:
				_check(b.visible and b.state == "parked", "outside again, the bike there")
				_next()
		7:
			# dismount by A when stopped and persistence of the spot
			if ph_t < dt * 1.5: _ride_at(-10.0, -6.0, 0.0)
			if absf(ph_t - 0.6) < dt * 0.6: main.cast._btn_a = true
			if ph_t > 2.0:
				_check(b.state == "parked" and b.at.distance_to(Vector3(-10.0, b.at.y, -6.0)) < 0.2, "got off: parked where he stopped (%s)" % str(b.at))
				var sv := b._load()
				_next()
		8:
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for n in notes: print("  " + n)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99

# a ledge cell (flag 32) near Route 1's road with open ground 3 m north of it
func _find_ledge() -> Vector3:
	var W = main.world
	var road: Array = main.cast.road
	var best := Vector3.ZERO
	var bd := 1e9
	for i in range(0, road.size(), 3):
		var rp := Vector2(road[i][0], road[i][1])
		for dz in range(-12, 13):
			for dx in range(-12, 13):
				var x: float = rp.x + dx * 0.5
				var z: float = rp.y + dz * 0.5
				var f: int = W.flag(x, z)
				if f == 255 or not (f & 32): continue
				var n: int = W.flag(x, z - 3.0)
				var s: int = W.flag(x, z + 2.5)
				if n == 255 or s == 255 or (n & 35) or (s & 35): continue
				var d := Vector2(dx, dz).length()
				if d < bd: bd = d; best = Vector3(x, 0, z)
		if best != Vector3.ZERO and i > 60: break
	return best

func _next() -> void:
	phase += 1
	ph_t = 0.0
	waypoints = []
	wi = 0

var _stuck := 0.0
var _dodge := 0.0
func _follow(dt: float) -> void:
	var b := B()
	while wi < waypoints.size() and Vector2(waypoints[wi].x - b.at.x, waypoints[wi].z - b.at.z).length() < 2.2: wi += 1
	if wi >= waypoints.size(): return
	var tgt: Vector3 = waypoints[wi]
	main.stick_vec = _toward(tgt, 1.0)
	# someone standing in the way (the player would steer round them): swerve a moment
	_stuck = _stuck + dt if absf(b.v) < 0.3 and absf(b.om) < 0.2 else 0.0
	if _stuck > 1.2: _dodge = 1.0; _stuck = 0.0
	if _dodge > 0.0:
		_dodge -= dt
		main.stick_vec = main.stick_vec.rotated(1.1)

# Ash's feet near the pedals and his hands near the grips (no flying off)
func _clip_check() -> void:
	var a: CastActor = main.cast.player
	var b := B()
	for s in ["L", "R"]:
		var foot: Vector3 = a.skel.global_transform * a.skel.get_bone_global_pose(a.bones[s + "Foot"]).origin
		var hand: Vector3 = a.skel.global_transform * a.skel.get_bone_global_pose(a.bones[s + "Hand"]).origin
		var pd: Vector3 = b.model.global_transform * b.model.pedal(1.0 if s == "L" else -1.0)
		var gp: Vector3 = b.model.global_transform * b.model.grip(1.0 if s == "L" else -1.0)
		if foot.distance_to(pd) > 0.3 or hand.distance_to(gp) > 0.2: res.clip += 1
