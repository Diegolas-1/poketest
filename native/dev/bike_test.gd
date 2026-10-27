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
#              the shoreline stop, stairs blocked, a door (Oak's lab) dismounts, the turn radius,
#              a u-turn, pinned against a wall; prints PASS / FAIL (--phase=N starts at that part,
#              --trace prints the bike every frame in the ledge and turning parts)
#   cyclists   a townsperson's bike ride in view (--who=ben|ada|timmy)
#   paths      QA: the road assist's graph (bike/paths.json) against the walk grid: every
#              point of every edge rideable, the junctions joined; prints PASS / FAIL
#   assist     the road assist and flow test: town -> the Route 1 gate holding forward only,
#              the forks (straight, a nudge each way, the goal), steering over and back,
#              cruise, the stepping stones, flow building and draining, the cost; PASS / FAIL
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
var ph_f := 0   # frames in this phase (the first-frame actions run once, whatever dt does)
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
	b.v = 0.0; b.om = 0.0; b._away_t = 0.0; b._blocked_t = 0.0; b._bumping = false
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
	if frame == int(_arg("quit", "0")): get_tree().quit(0)
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
			if frame == 4: _ride_at(at[0], at[1], 0.0)
			if frame > 6: main.stick_vec = _toward(Vector3(at[0], 0, at[1] + 14.0), float(_arg("tilt", "0.8")))
			if OS.get_cmdline_user_args().has("--log") and frame > 6: print("f %d z %.2f y %.2f ground %s v %.2f" % [frame, B().at.z, B().at.y, main.cast.ground, B().v])
		"test": _test(dt)
		"paths": _paths()
		"assist": _assist_test(dt)
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
	ph_f += 1
	var W = main.world
	# --phase=N: start the test at that phase (dev: one part at a time)
	if frame == 4 and _arg("phase", "") != "": phase = int(_arg("phase", "0")); ph_t = 0.0; ph_f = 1
	if OS.get_cmdline_user_args().has("--trace") and (phase in [10, 11, 12] or phase >= 20 or (phase == 2 and frame % 10 == 0)):
		print("tr %d t %.2f at (%.2f %.2f %.2f) v %.2f yaw %.2f om %.2f fl %d stick %s bl %.2f" % [phase, ph_t, b.at.x, b.at.z, b.at.y, b.v, b.yaw, b.om, W.flag(b.at.x, b.at.z), str(main.stick_vec), b._blocked_t])
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
				phase = 10; ph_t = 0.0; ph_f = 0
		10:
			# a ledge: the nearest ledge cell to Route 1's road, ridden off going south
			if ph_f == 1:
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
				phase = 11; ph_t = 0.0; ph_f = 0
		11:
			# turned round (as tight as he can) and back at it: never up through a ledge
			# cell (round the ledge's open end, where the slope is gentle, is fine)
			if ph_f == 1:
				res.l_up = 0; res.l_prev = b.at
				# (the check itself: a step north across the ledge counts)
				if not _ledge_cross(res.ledge + Vector3(0, 0, 0.6), res.ledge - Vector3(0, 0, 0.6)): _check(false, "the ledge crossing check sees a step through the ledge")
			main.stick_vec = _toward(Vector3(res.ledge.x, 0, res.ledge.z - 8.0), 1.0)
			if _ledge_cross(res.l_prev, b.at): res.l_up += 1
			res.l_prev = b.at
			if ph_t > 4.0:
				_check(res.l_up == 0, "turned back: never rode north through a ledge cell (%d crossings; now at %.1f, %.1f; ledge %.1f, %.1f)" % [res.l_up, b.at.x, b.at.z, res.ledge.x, res.ledge.z])
				phase = 12; ph_t = 0.0; ph_f = 0
		12:
			# head on at full speed from just below it, weaving hard (every turn rate): stays below
			if ph_f == 1:
				_ride_at(res.ledge.x - 1.5, res.ledge.z + 3.5, PI)   # (its open end is to the east)
				b.v = 8.0
				res.l_up = 0; res.l_prev = b.at; res.l_near = 0
			var wv := Vector3(sin(1.1 * sin(ph_t * 7.0)), 0, -cos(1.1 * sin(ph_t * 7.0)))
			main.stick_vec = _toward(b.at + wv * 5.0, 1.0)
			if _ledge_cross(res.l_prev, b.at): res.l_up += 1
			res.l_prev = b.at
			if not (W.flag(b.at.x, b.at.z) & 32):
				for k in range(1, 6):
					var nf: int = W.flag(b.at.x, b.at.z - 0.25 * k)
					if nf != 255 and (nf & 32): res.l_near += 1; break
			if ph_t > 4.0:
				# (round the ledge's open end, where the slope is gentle, is fine)
				_check(res.l_up == 0 and res.l_near > 5, "head on at the ledge, weaving: never through a ledge cell (%d crossings; %d frames right below it; now at %.1f, %.1f)" % [res.l_up, res.l_near, b.at.x, b.at.z])
				phase = 3; ph_t = 0.0; ph_f = 0
		3:
			# the shoreline: from the beach, ride south into the sea
			if ph_f == 1: _ride_at(20.0, 98.0, 0.0)
			main.stick_vec = _toward(Vector3(20.0, 0, 140.0), 1.0)
			if ph_t > 6.0:
				var fl: int = W.flag(b.at.x, b.at.z)
				var front := b.at + Vector3(sin(b.yaw), 0, cos(b.yaw)) * 0.5
				var ff: int = W.flag(front.x, front.z)
				_check(fl != 255 and not (fl & 1 and not fl & 4) and absf(b.v) < 0.3, "stopped at the shoreline (z %.1f, flag %d, front flag %d, v %.2f)" % [b.at.z, fl, ff, b.v])
				_next()
		4:
			# stairs: Oak's lab stairs from the bottom
			if ph_f == 1:
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
			if ph_f == 1:
				var d: Vector2 = main.cast.lab_door
				_ride_at(d.x + 1.6, d.y, -PI * 0.5)
			main.stick_vec = Vector2.ZERO
			if absf(ph_t - 0.8) < dt * 0.6: main.cast._btn_a = true
			if ph_t > 2.5:
				_check(main.indoors and b.state == "parked" and not b.visible, "the door: parked outside, Ash inside (indoors %s, state %s)" % [main.indoors, b.state])
				_check(b.at.distance_to(Vector3(main.cast.lab_door.x + 1.6, b.at.y, main.cast.lab_door.y)) < 1.0, "the bike stayed at the door")
				_next()
		6:
			if ph_f == 1: main.leave_space(true)
			if ph_t > 1.0:
				_check(b.visible and b.state == "parked", "outside again, the bike there")
				_next()
		7:
			# dismount by A when stopped and persistence of the spot
			if ph_f == 1: _ride_at(-10.0, -6.0, 0.0)
			if absf(ph_t - 0.6) < dt * 0.6: main.cast._btn_a = true
			if ph_t > 2.0:
				_check(b.state == "parked" and b.at.distance_to(Vector3(-10.0, b.at.y, -6.0)) < 0.2, "got off: parked where he stopped (%s)" % str(b.at))
				var sv := b._load()
				phase = 20; ph_t = 0.0; ph_f = 0
		20:
			# the turn radius at 9 m/s, full lock (the stick held just past full lock, short of a carve)
			if ph_f == 1:
				res.open = _open_spot(9.0)
				_ride_at(res.open.x, res.open.z, 0.0)
				b.v = 9.0
				res.r_arc = 0.0; res.r_dy = 0.0; res.r_v = 0.0; res.r_n = 0; res.r_prev = b.at; res.r_yaw = b.yaw
			var lock: float = minf(b.CARVE_E - 0.05, b.OM_MAX / b.TURN_GAIN + 0.05)
			main.stick_vec = _toward(b.at + Vector3(sin(b.yaw + lock), 0, cos(b.yaw + lock)) * 5.0, 1.0)
			if ph_t > 0.6 and ph_t < 1.6:
				res.r_arc += Vector2(b.at.x - res.r_prev.x, b.at.z - res.r_prev.z).length()
				res.r_dy += absf(wrapf(b.yaw - res.r_yaw, -PI, PI))
				res.r_v += b.v; res.r_n += 1
			res.r_prev = b.at; res.r_yaw = b.yaw
			if ph_t > 1.7:
				var vv: float = res.r_v / maxf(1.0, res.r_n)
				var r: float = res.r_arc / maxf(1e-3, res.r_dy)
				var tgt := maxf(b.R_MIN + b.R_K * vv * vv, vv / b.OM_MAX)
				var old := 1.3 + 0.045 * vv * vv
				_check(vv > 8.3 and r <= tgt * 1.08 and r <= old * 0.55, "turn radius at %.1f m/s, full lock: %.2f m (target %.2f, was %.2f)" % [vv, r, tgt, old])
				phase = 21; ph_t = 0.0; ph_f = 0
		21:
			# a u-turn from 9 m/s, the stick pulled right back: the carve scrubs speed, the turn stays tight
			if ph_f == 1:
				_ride_at(res.open.x, res.open.z - 4.0, 0.0)
				b.v = 9.0
				res.u_side = 0.0; res.u_fwd = 0.0; res.u_dy = 0.0; res.u_yaw = b.yaw; res.u_p0 = b.at; res.u_vmin = 99.0; res.u_t = -1.0
			if res.u_dy < PI - 0.3:
				main.stick_vec = _toward(b.at + Vector3(sin(res.u_yaw + PI - 0.15), 0, cos(res.u_yaw + PI - 0.15)) * 5.0, 1.0)
				res.u_dy += absf(wrapf(b.yaw - res.get("u_last", b.yaw), -PI, PI))
				var d: Vector3 = b.at - res.u_p0
				res.u_side = maxf(res.u_side, absf(d.x))
				res.u_fwd = maxf(res.u_fwd, d.z)
				res.u_vmin = minf(res.u_vmin, b.v)
				if res.u_dy >= PI - 0.3: res.u_t = ph_t
			else:
				main.stick_vec = Vector2.ZERO
			res.u_last = b.yaw
			if ph_t > 3.0:
				_check(res.u_t > 0.0 and res.u_side < 4.5 and res.u_fwd < 3.5, "u-turn from 9 m/s: turned round in %.2f s, %.1f m wide, %.1f m on (slowed to %.1f m/s)" % [res.u_t, res.u_side, res.u_fwd, res.u_vmin])
				phase = 22; ph_t = 0.0; ph_f = 0
		22:
			# pinned against a wall, the stick still into it: he walks it round and rides off along it
			if ph_f == 1:
				res.wall = _wall_spot()
				_ride_at(res.wall.x, res.wall.z, res.wall.y)
				res.p_tgt = b.at + Vector3(sin(res.wall.y), 0, cos(res.wall.y)) * 6.0
				res.p0 = b.at; res.p_blk = 0
			main.stick_vec = _toward(res.p_tgt, 1.0)
			if b._blocked_t > 0.0: res.p_blk += 1
			if ph_t > 4.0:
				var gone := Vector2(b.at.x - res.p0.x, b.at.z - res.p0.z).length()
				_check(res.p_blk > 0 and gone > 1.5, "pinned against a wall, stick into it: got himself off it (blocked %d frames, %.1f m away)" % [res.p_blk, gone])
				phase = 23; ph_t = 0.0; ph_f = 0
		23:
			# up against the wall, stopped, then the stick turned away from it: he walks the
			# bike round on the spot at the full pivot rate
			if ph_f == 1:
				if not res.has("wall"): res.wall = _wall_spot()
				var tip: float = b.model.WB * 0.5 + b.model.R * 0.6
				_ride_at(res.wall.x + sin(res.wall.y) * (1.6 - tip - 0.12), res.wall.z + cos(res.wall.y) * (1.6 - tip - 0.12), res.wall.y)
				res.p_om = 0.0; res.p_y0 = b.yaw; res.p_dy = 0.0; res.p0 = b.at
			var ay: float = res.wall.y + PI - 0.5
			main.stick_vec = _toward(b.at + Vector3(sin(ay), 0, cos(ay)) * 6.0, 1.0)
			if ph_t < 1.2:
				res.p_om = maxf(res.p_om, absf(b.om))
				res.p_dy = maxf(res.p_dy, absf(wrapf(b.yaw - res.p_y0, -PI, PI)))
				res.p_mv = Vector2(b.at.x - res.p0.x, b.at.z - res.p0.z).length()
			if ph_t > 1.5:
				var front: Vector3 = res.p0 + Vector3(sin(res.wall.y), 0, cos(res.wall.y)) * (b.model.WB * 0.5 + b.model.R * 0.6 + 0.12)
				var fc: Vector3 = main.world.collide(front, 0.2)
				var touching := Vector2(fc.x - front.x, fc.z - front.z).length() > 0.01
				_check(touching and res.p_om > b.PIVOT * 0.9 and res.p_dy > 1.5 and res.p_mv < 0.3, "against a wall, stick turned away: %.2f rad/s (pivot %.1f), turned %.2f rad in 1.2 s, moved %.2f m" % [res.p_om, b.PIVOT, res.p_dy, res.p_mv])
				phase = 24; ph_t = 0.0; ph_f = 0
		24:
			# where the ride back once stuck for good (Route 1 by the gate, on a slope by the
			# roadside wall, the stick at the next road point past the wall): never stuck there
			if ph_f == 1:
				_ride_at(PIN.x, PIN.z, PIN_YAW)
				res.p_len = 0.0; res.p_prev = b.at
			main.stick_vec = _toward(PIN_GO, 1.0)
			res.p_len += Vector2(b.at.x - res.p_prev.x, b.at.z - res.p_prev.z).length()
			res.p_prev = b.at
			if ph_t > 5.0:
				_check(res.p_len > 4.0, "the old stuck spot by the gate: not stuck (rode %.1f m in 5 s)" % res.p_len)
				phase = 8; ph_t = 0.0; ph_f = 0
		8:
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for n in notes: print("  " + n)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99

# Route 1 by the gate: where the bike was once pinned against the roadside wall
const PIN := Vector3(-11.34, 0, -415.4)
const PIN_YAW := 1.52
const PIN_GO := Vector3(-5.6, 0, -421.3)

# 1.2 m in front of a building's wall, facing it square on: [x, yaw, z]
func _wall_spot() -> Vector3:
	var W = main.world
	var best := Vector3(PIN.x, PIN_YAW, PIN.z)
	var bd := 1e9
	for c in W.colliders:
		if int(c[0]) != 1 or float(c[3]) < 2.5 or float(c[4]) < 2.5: continue
		var cs := cos(float(c[5])); var sn := sin(float(c[5]))
		for ax in [[Vector2(cs, -sn), float(c[3])], [Vector2(-cs, sn), float(c[3])], [Vector2(sn, cs), float(c[4])], [Vector2(-sn, -cs), float(c[4])]]:
			var n: Vector2 = ax[0]
			var p := Vector2(float(c[1]), float(c[2])) + n * (float(ax[1]) + 1.6)
			var d := p.length()
			if d > bd: continue
			var ok := true
			for k in range(0, 5):
				var q := p + n * (k * 0.8)
				var fl: int = W.flag(q.x, q.y)
				if fl == 255 or (fl & 3) or (fl & 32) or absf(W.height_at(q.x, q.y) - W.height_at(p.x, p.y)) > 0.15: ok = false; break
				var cp: Vector3 = W.collide(Vector3(q.x, 0, q.y), 0.5)
				if Vector2(cp.x - q.x, cp.z - q.y).length() > 0.01: ok = false; break
			if ok: bd = d; best = Vector3(p.x, atan2(-n.x, -n.y), p.y)
	return best

# a step north (z down) into a ledge cell other than the one he started in: climbing a ledge
func _ledge_cross(p0: Vector3, p1: Vector3) -> bool:
	if p1.z >= p0.z - 1e-4: return false
	var W = main.world
	var c0: int = W._cell(p0.x, p0.z)
	for i in range(1, 9):
		var q := p0.lerp(p1, i / 8.0)
		var fl: int = W.flag(q.x, q.z)
		if fl != 255 and (fl & 32) and W._cell(q.x, q.z) != c0: return true
	return false

# flat open ground (nothing in the way within r m) near the town, for the turning checks
func _open_spot(r: float) -> Vector3:
	var W = main.world
	for ring in range(0, 30):
		for k in range(maxi(1, ring * 8)):
			var a := TAU * k / maxf(1.0, ring * 8.0)
			var c := Vector2(cos(a), sin(a)) * ring * 3.0 + Vector2(-5.0, 5.0)
			var h0: float = W.height_at(c.x, c.y)
			var ok := true
			for j in range(-6, 7):
				for i in range(-6, 7):
					var q := c + Vector2(i, j) * (r / 6.0)
					var fl: int = W.flag(q.x, q.y)
					if fl == 255 or (fl & 1) or (fl & 2) or (fl & 32) or absf(W.height_at(q.x, q.y) - h0) > 0.5:
						ok = false; break
					var cp: Vector3 = W.collide(Vector3(q.x, h0, q.y), 0.6)
					if Vector2(cp.x - q.x, cp.z - q.y).length() > 0.01: ok = false; break
				if not ok: break
			if ok: return Vector3(c.x, 0, c.y)
	return Vector3(-5.0, 0, 5.0)

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
	ph_f = 0
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
	# like a rider: ease off for a sharp turn at speed (a U-turn), then pedal again
	var tdir := Vector2(tgt.x - b.at.x, tgt.z - b.at.z)
	if b.v > 4.0 and tdir.length() > 0.01 and absf(wrapf(atan2(tdir.x, tdir.y) - b.yaw, -PI, PI)) > 1.2:
		main.stick_vec = main.stick_vec.normalized() * 0.35
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

# ---------- the road assist's graph against the walk grid ----------
func _paths() -> void:
	if frame != 5: return
	var A: BikeAssist = B().assist
	var W = main.world
	var bad := 0
	var n := 0
	var worst := []
	for k in A.E.size():
		var ed: Dictionary = A.E[k]
		var L: float = ed.len
		var t := 0.0
		var eb := 0
		var hp := NAN
		while t <= L:
			var q := A.at(k, t)
			n += 1
			var why := ""
			if A.walk_only(q, 0.8): t += 0.5; hp = NAN; continue
			var fl: int = W.flag(q.x, q.y)
			if fl == 255: why = "off the grid"
			elif (fl & 1) and not (fl & 4): why = "water"
			elif fl & 2: why = "no-walk"
			else:
				var c: Vector3 = W.collide(Vector3(q.x, 0, q.y), 0.2)
				if Vector2(c.x - q.x, c.z - q.y).length() > 0.02: why = "collider"
				var h: float = W.height_at(q.x, q.y)
				# (the bike's own limit: step_max in each 0.1 m it moves)
				if not is_nan(hp) and absf(h - hp) > B().STEP_MAX * 5.0 and not (fl & 32): why = "step %.2f" % absf(h - hp)
				hp = h
			if why != "":
				bad += 1; eb += 1
				if worst.size() < 400: worst.append("edge %d (%d-%d) at (%.1f, %.1f): %s" % [k, ed.a, ed.b, q.x, q.y, why])
			t += 0.5
	# the junctions: one connected graph from the square (every node reachable)
	var seen := {0: true}
	var sq := 0
	for i in A.nodes.size():
		if A.nodes[i].distance_to(Vector2(-3, -2)) < A.nodes[sq].distance_to(Vector2(-3, -2)): sq = i
	seen = {sq: true}
	var todo := [sq]
	while not todo.is_empty():
		var nd: int = todo.pop_back()
		for o in A.adj[nd]:
			var m: int = A._end_node(o[0], o[1])
			if not seen.has(m): seen[m] = true; todo.append(m)
	var lone := []
	for i in A.nodes.size(): if not seen.has(i): lone.append("%d (%.0f, %.0f)" % [i, A.nodes[i].x, A.nodes[i].y])
	# a missed junction: a dead end with another edge within 3 m that it does not join
	var missed := []
	for i in A.nodes.size():
		if A.adj[i].size() != 1: continue
		var own: int = A.adj[i][0][0]
		for k in A.E.size():
			if k == own: continue
			var q := A._proj(k, A.nodes[i], 0, A.E[k].p.size())
			if q[0] < 3.0: missed.append("node %d (%.1f, %.1f) by edge %d (%.1f m)" % [i, A.nodes[i].x, A.nodes[i].y, k, q[0]])
	_check(missed.is_empty(), "every junction is joined (dead ends near another edge: %s)" % ", ".join(missed))
	for w in worst: print("  " + w)
	print("paths: %d nodes, %d edges, %d points checked, %d not rideable; %d nodes not joined to the square: %s" % [A.nodes.size(), A.E.size(), n, bad, lone.size(), ", ".join(lone)])
	_check(bad == 0, "every point of the path graph is rideable (%d of %d not)" % [bad, n])
	# (the rest area's and the far headland's trails do not touch the roads: their own networks)
	print("paths: separate from the square's network: %s" % ", ".join(lone))
	print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
	get_tree().quit(0 if fails.is_empty() else 1)

# ---------- the road assist and flow ----------
var _as := {}
func _graph_dev(p: Vector3) -> Array:
	var A: BikeAssist = B().assist
	var nr := A.nearest(Vector2(p.x, p.z), 12.0)
	if nr.is_empty(): return [99.0, 0.0]
	return [nr[1], A.E[nr[0]].w]

func _start_on(x: float, z: float, toward: Vector2) -> void:
	# on the graph's centre line nearest (x, z), facing along it toward `toward`
	var A: BikeAssist = B().assist
	var nr := A.nearest(Vector2(x, z), 20.0)
	if not nr.is_empty():
		var q := A.at(nr[0], nr[2])
		var tg := A.tangent(nr[0], nr[2], 1)
		if tg.dot(toward - q) < 0.0: tg = -tg
		x = q.x; z = q.y
		toward = q + tg * 5.0
	var y := atan2(toward.x - x, toward.y - z)
	_ride_at(x, z, y)
	B().v = 0.0
	B().flow_raw = 0.0
	B().cruise = false
	B().stats.blocks = 0

# the edge leaving node n toward point q
func _edge_toward(n: int, q: Vector2) -> int:
	var A: BikeAssist = B().assist
	var best := -1; var bd := 1e9
	for o in A.adj[n]:
		var far := A.nodes[A._end_node(o[0], o[1])]
		var d := far.distance_to(q)
		if d < bd: bd = d; best = o[0]
	return best

func _node_near(q: Vector2) -> int:
	var A: BikeAssist = B().assist
	var bi := 0
	for i in A.nodes.size(): if A.nodes[i].distance_to(q) < A.nodes[bi].distance_to(q): bi = i
	return bi

func _assist_test(dt: float) -> void:
	var b := B()
	var A: BikeAssist = b.assist
	if frame < 5: return
	ph_t += dt
	ph_f += 1
	var p2 := Vector2(b.at.x, b.at.z)
	match phase:
		0:
			# town -> the Route 1 gate: Red's lane by Ash's house, the stick held forward only
			if ph_f == 1:
				Settings.set_value("bike_goal", 1)
				_start_on(-12.0, -15.5, Vector2(-5.6, -18.0))
				b.goal_override = Vector3(-2.0, 0.0, -446.0)
				_as = {"dev": 0.0, "over": -99.0, "flow_pk": 0.0, "drop": 0.0, "lost": 0, "fr": 0, "us": 0.0, "us_max": 0.0, "vmax": 0.0, "fmax": 0.0, "drain": false, "hi_t": -1.0, "onf": 0, "turn_max": 0.0}
			main.stick_vec = Vector2(0, -0.85)
			if b.v > 2.0:
				var dv := _graph_dev(b.at)
				_as.fr += 1
				_as.dev = maxf(_as.dev, dv[0])
				_as.over = maxf(_as.over, dv[0] - dv[1])
				if b.assisting: _as.onf += 1
				else: _as.lost += 1
				_as.us += A.stats.us
				_as.us_max = maxf(_as.us_max, A.stats.us)
			_as.vmax = maxf(_as.vmax, b.v)
			_as.fmax = maxf(_as.fmax, b.flow)
			if b.flow > 0.9 and _as.hi_t < 0.0: _as.hi_t = ph_t
			# a drop in flow through a bend (from the peak since the last straight)
			if absf(b.om) < b.FLOW_YAW: _as.flow_pk = b.flow
			elif absf(b.om) > b.FLOW_YAW_DRAIN: _as.drop = maxf(_as.drop, _as.flow_pk - b.flow)
			if _as.drop > 0.3: _as.drain = true
			if OS.get_cmdline_user_args().has("--log") and ph_f % 30 == 0:
				print("t %.1f at (%.1f %.1f) v %.2f flow %.2f om %.2f assist %s e %d lat %.2f lim %.1f why %s" % [ph_t, b.at.x, b.at.z, b.v, b.flow, b.om, b.assisting, A.e, A.lat, A.v_limit, A.why])
			if b.at.z < -425.0 or ph_t > 150.0:
				var n: float = maxf(1.0, _as.fr)
				_check(b.at.z < -425.0, "held forward only: rode Red's lane, the lanes and Route 1 to the gate (z %.0f in %.0f s)" % [b.at.z, ph_t])
				_check(_as.over < 0.0, "stayed on the path: at most %.2f m from the centre line, %.2f m inside the edge" % [_as.dev, -_as.over])
				_check(_as.lost < n * 0.02, "the assist steered all the way (%d of %d frames off)" % [_as.lost, _as.fr])
				_check(b.stats.blocks == 0, "hit nothing (%d knocks)" % b.stats.blocks)
				var base_v: float = b.CRUISE * 0.85   # (the stick at 0.85)
				_check(_as.fmax > 0.9 and _as.vmax > base_v * 1.12, "flow built on the straights (flow %.2f, top speed %.1f m/s against %.1f without it)" % [_as.fmax, _as.vmax, base_v])
				_check(_as.drain, "flow drained in a bend (fell by %.2f)" % _as.drop)
				print("cost: assist %.1f us a frame on average, %.0f us at most" % [_as.us / n, _as.us_max])
				# and in a tight loop at a few points of the ride (no frame noise): the median
				var samp := []
				for k in 7:
					var q := A.at(2, A.E[2].len * (k + 0.5) / 7.0)
					var tg := A.tangent(2, A.E[2].len * (k + 0.5) / 7.0, -1)
					var y := atan2(tg.x, tg.y)
					A.active = false; A.e = -1
					A.update(dt, Vector3(q.x, 0, q.y), y, 9.0, tg, 0.0, 0.85, false)
					for i in 300:
						var t0 := Time.get_ticks_usec()
						A.update(dt, Vector3(q.x, 0, q.y), y, 9.0, tg, 0.0, 0.85, false)
						samp.append(Time.get_ticks_usec() - t0)
				samp.sort()
				print("cost in a loop: median %d us, 90th %d us (%d calls)" % [samp[samp.size() / 2], samp[int(samp.size() * 0.9)], samp.size()])
				_next()
		1, 2, 3, 4:
			# the meadow fork on Route 1's trail to the lookout: straight / nudge left / nudge right / the goal
			var fork := _node_near(Vector2(74, -136))
			var e1 := _edge_toward(fork, Vector2(89, -149))
			var e2 := _edge_toward(fork, Vector2(96, -116))
			if ph_f == 1:
				_start_on(40.0, -126.5, Vector2(52.0, -130.5))
				b.goal_override = Vector3.INF
				Settings.set_value("bike_goal", 1 if phase == 4 else 0)
				if phase == 4: b.goal_override = Vector3(96.0, 0.0, -116.0)
				_as = {"picked": -1, "why": ""}
			var sv := Vector2(0, -0.85)
			if phase == 2: sv = Vector2(-0.22, -0.85)
			if phase == 3: sv = Vector2(0.22, -0.85)
			main.stick_vec = sv
			if not A.choice.is_empty() and A.nodes[A.choice[0]].distance_to(A.nodes[fork]) < 4.0: _as.picked = A.choice[1]; _as.why = A.why
			if OS.get_cmdline_user_args().has("--log") and ph_f % 30 == 0: print("fork %d t %.1f at %s e %d dir %d choice %s why %s active %s fork %d end %.1f" % [phase, ph_t, str(p2), A.e, A.dir, str(A.choice), A.why, A.active, fork, A.to_end() if A.e >= 0 else -1.0])
			if ph_f > 5 and (p2.distance_to(A.nodes[fork]) > 9.0 and p2.x > A.nodes[fork].x + 4.0 or ph_t > 20.0):
				var on: int = A.e
				var ein := -1
				for o in A.adj[fork]: if o[0] != e1 and o[0] != e2: ein = o[0]
				var tin := -A._out_dir(fork, ein, 1 if A.E[ein].a == fork else -1)
				var left := Vector2(tin.y, -tin.x)
				var o1 := A._out_dir(fork, e1, 1 if A.E[e1].a == fork else -1)
				var o2 := A._out_dir(fork, e2, 1 if A.E[e2].a == fork else -1)
				var want := -1
				var label: String = ["", "straight on", "a nudge left", "a nudge right", "toward the goal"][phase]
				match phase:
					1: want = e1 if o1.dot(tin) > o2.dot(tin) else e2
					2: want = e1 if o1.dot(left) > o2.dot(left) else e2
					3: want = e1 if o1.dot(left) < o2.dot(left) else e2
					4: want = e2
				_check(on == want and _as.picked == want, "at the fork, %s: took edge %d (picked %d by %s, expected %d; branches %d toward the tree, %d toward the lookout)" % [label, on, _as.picked, _as.why, want, e1, e2])
				_next()
		5:
			# steering over: off the assist at once; centred again: back on it
			if ph_f == 1:
				Settings.set_value("bike_goal", 1)
				b.goal_override = Vector3(-2.0, 0.0, -446.0)
				_start_on(-5.0, -58.0, Vector2(-4.0, -46.0))
				_as = {"t_on": -1.0, "off": false, "back": -1.0}
			main.stick_vec = Vector2(0, -0.85)
			if b.assisting and _as.t_on < 0.0 and b.v > 5.0: _as.t_on = ph_t
			if _as.t_on > 0.0 and ph_t > _as.t_on + 1.0 and ph_t < _as.t_on + 1.3:
				main.stick_vec = Vector2(0.75, -0.6)    # a firm push right (about 50 degrees)
				if ph_t > _as.t_on + 1.05 and not b.assisting: _as.off = true
			if _as.t_on > 0.0 and ph_t > _as.t_on + 1.3 and _as.back < 0.0 and b.assisting: _as.back = ph_t - (_as.t_on + 1.3)
			if ph_t > 8.0:
				_check(_as.off, "steering the stick over took the steering back at once")
				_check(_as.back >= 0.0 and _as.back < 1.5, "centring the stick re-engaged the assist (after %.2f s)" % _as.back)
				_next()
		6:
			# cruise: a double tap forward, then the stick let go; pulling back stops it
			if ph_f == 1:
				Settings.set_value("bike_cruise", 1)
				_start_on(-5.0, -58.0, Vector2(-4.0, -46.0))
				_as = {"v": 0.0, "on": 0, "n": 0}
			var tt := ph_t
			main.stick_vec = Vector2(0, -0.9) if (tt > 0.2 and tt < 0.35) or (tt > 0.5 and tt < 0.65) else Vector2.ZERO
			if tt > 4.0 and tt < 7.0:
				_as.n += 1
				if b.assisting: _as.on += 1
				_as.v = maxf(_as.v, b.v)
			if tt > 7.0 and tt < 7.4: main.stick_vec = Vector2(0, 0.9)   # pulled back
			if tt > 9.5:
				_check(_as.v > 7.0 and _as.on > _as.n * 0.9, "cruise: rode on at %.1f m/s with the stick let go, the assist steering (%d of %d frames)" % [_as.v, _as.on, _as.n])
				_check(not b.cruise and b.v < 0.5, "pulling back ended cruise and stopped (v %.2f)" % b.v)
				_next()
		7:
			# the stepping stones on the tea house trail: the bike stops before them
			if ph_f == 1:
				_start_on(-38.0, -233.0, Vector2(-48.0, -242.0))
				_as = {"min": 99.0}
			main.stick_vec = Vector2(0, -0.85)
			for q in A.walk_pts: _as.min = minf(_as.min, q.distance_to(p2))
			if ph_t > 8.0:
				_check(_as.min > 0.4 and b.v < 0.5, "stopped before the stepping stones (%.2f m from the nearest, v %.2f)" % [_as.min, b.v])
				_next()
		8:
			Settings.set_value("bike_goal", 1)
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for nn in notes: print("  " + nn)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99

