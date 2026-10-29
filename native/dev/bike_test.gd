extends Node
# Dev only: Ash's bike in the real game, scripted (renders and a ride test).
#   godot --path native res://dev/bike_test.tscn -- --fresh-bike --case=<name> [--snap=f,f --snapdir=dir]
# cases:
#   parked     the camera on the parked bike by Ash's house
#   mount      Ash walks up, presses A, gets on and rides off down the lane
#   ride       on the bike at --at=x,z,yaw, the stick held (--stick=x,y, camera-relative), the game camera
#   turn       riding a circle (--at), a side camera to see the lean
#   ledge      Route 1: riding south off a ledge
#   test       the scripted ride test: town -> Route 1 -> the gate and back (faster than
#              running), ledges down, into the sea up to the wade limit, the lab's stairs ridden slowly, a door
#              (Oak's lab) dismounts, the turn radius, a u-turn, pinned against a wall, flow
#              draining in a hard turn, every bridge and the steepest paths never locking him in
#              place (--only=<label part>), stamina on the flat and climbing, worn out; prints
#              PASS / FAIL (--phase=N starts at that part, --trace prints the bike every frame in
#              the stairs, ledge and later parts)
#   cyclists   a townsperson's bike ride in view (--who=ben|ada|timmy)
#   paths      QA: the road assist's graph (bike/paths.json) against the walk grid: every
#              point of every edge rideable, the junctions joined; prints PASS / FAIL
#   call       the island menu's Bike: it rolls in from behind him fading in, he gets on;
#              off and left, it fades away (fade_after cut short); called again it comes
#              back to him; PASS / FAIL
#   water      riding into the water: the beach's shallows (stops at the wade limit, never
#              deeper), across the town stream and the tea house creek beside the stepping
#              stones, the speed falling with the depth, the splash pools busy in the water
#              and idle out of it, the bike wet and dripping after, the cost; PASS / FAIL
#              (rendered with --chase=d,h,side --snap=...: the bow wave, spray and wake)
#   measure    the riding numbers: 0 -> top on a flat stretch of Route 1's road (cruise and
#              sprint), up its steepest 40 m climb, and down it (holding forward, and coasting
#              with the stick let go); prints MEASURE lines
#   tricks     the 180 (a quick flick forward -> back spins him round, keeping speed; a slow
#              sweep round the side or a slow pull back does not) and the wheelie (engages,
#              holds, costs no speed, drops on release); PASS / FAIL (--snapdir: a shot mid-spin
#              and one mid-wheelie, best with --chase=d,h,side)
#   assist     the road assist and flow test: town -> the Route 1 gate holding forward only,
#              the forks (straight, a nudge each way, the goal), steering over and back,
#              cruise, the ford at the stepping stones, flow building and draining, the cost; PASS / FAIL
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

# (settings and Ash's stamina are saved between runs: every test starts from the defaults)
func _fresh_state() -> void:
	Settings.set_value("bike_assist", 1)
	Settings.set_value("bike_goal", 1)
	var bd = main.cast.body
	bd.stamina = 1.0
	bd.cond.remove("fatigue")

# put Ash on the bike at once, there
func _ride_at(x: float, z: float, y: float) -> void:
	var b := B()
	b.at = Vector3(x, main.world.ash_ground(x, z), z)
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
			B()._test_wheelie = OS.get_cmdline_user_args().has("--wheelie") and T > float(_arg("wheelie_at", "1.0"))
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
		"measure": _measure(dt)
		"tricks": _tricks(dt)
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
		"call": _call(dt)
		"water": _water_test(dt)
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

func _call(dt: float) -> void:
	var b := B()
	ph_t += dt
	match phase:
		0:
			if frame == 4:
				_fresh_state()
				var o := _open_spot(5.0)
				main.pos = Vector3(o.x, main.world.height_at(o.x, o.z), o.z)
				main.yaw = 0.3
				main.cast.land(main.pos.y)
				main.cam_yaw = main.yaw + PI + float(_arg("cam_off", "0.5"))
				main.cam_pitch = 0.2
			if frame == 8:
				b.menu_toggle()
				_check(b.state == "arrive", "called: rolling in (state %s)" % b.state)
				_check(b.at.distance_to(main.pos) > 3.0, "it starts behind him (%.1f m)" % b.at.distance_to(main.pos))
				_check(b._fade < 0.05, "it starts faded out")
				ph_t = 0.0
			if frame > 8 and b.state == "ride":
				_check(ph_t < 4.0, "rolled in and he got on (%.1f s)" % ph_t)
				_check(b._fade >= 1.0, "solid once there")
				b.request_dismount()
				phase = 1; ph_t = 0.0
			elif frame > 8 and ph_t > 5.0: _check(false, "rolled in (state %s)" % b.state); phase = 9
		1:
			if b.state == "parked":
				b.FADE_AFTER = 1.0
				var f := Vector3(sin(main.yaw), 0, cos(main.yaw))
				var q: Vector3 = main.pos + f * 8.0
				main.pos = Vector3(q.x, main.world.height_at(q.x, q.z), q.z)
				main.cast.land(main.pos.y)
				phase = 2; ph_t = 0.0
			elif ph_t > 4.0: _check(false, "got off (state %s)" % b.state); phase = 9
		2:
			if b.away:
				_check(not b.visible and b.near_prompt(b.at).is_empty(), "faded away, gone from the world (%.1f s)" % ph_t)
				b.menu_toggle()
				phase = 3; ph_t = 0.0
			elif ph_t > 5.0: _check(false, "faded away (fade %.2f idle %.1f)" % [b._fade, b._idle_t]); phase = 9
		3:
			if b.state == "ride":
				_check(b.at.distance_to(main.pos) < 1.0, "called back to him")
				phase = 9
			elif ph_t > 5.0: _check(false, "called back (state %s)" % b.state); phase = 9
		9:
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			get_tree().quit(0 if fails.is_empty() else 1)

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
	if frame == 4 and _arg("phase", "") != "": phase = int(_arg("phase", "0")); ph_t = 0.0; ph_f = 1; _fresh_state()
	if OS.get_cmdline_user_args().has("--trace") and (phase in [4, 10, 11, 12] or phase >= 20 or (phase == 2 and frame % 10 == 0)):
		print("tr %d t %.2f at (%.2f %.2f %.2f) v %.2f yaw %.2f om %.2f fl %d stick %s bl %.2f" % [phase, ph_t, b.at.x, b.at.z, b.at.y, b.v, b.yaw, b.om, W.flag(b.at.x, b.at.z), str(main.stick_vec), b._blocked_t])
	match phase:
		0:
			# start: walk up to the parked bike and get on
			if frame == 4:
				_fresh_state()
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
				res.dist = 0.0; res.prev = b.at; res.road_d = 0.0; res.road_t = 0.0
			_follow(dt)
			var stp1 := Vector2(b.at.x - res.prev.x, b.at.z - res.prev.z).length()
			res.dist += stp1
			res.prev = b.at
			if b.at.z < -60.0: res.road_d += stp1; res.road_t += dt
			res.vmax = maxf(res.vmax, b.v)
			res.frames += 1
			if not main.cast.ground: res.air += 1
			_clip_check()
			if wi >= waypoints.size() or b.at.z < -425.0 or ph_t > 150.0:
				_check(b.at.z < -400.0, "rode the lanes and Route 1 to the gate (z %.0f in %.0f s, top speed %.1f m/s)" % [b.at.z, ph_t, res.vmax])
				_check(res.vmax > 13.0 and res.vmax <= b.FLOW_VMAX + 0.1, "speed in range (%.1f, the cap %.1f)" % [res.vmax, b.FLOW_VMAX])
				var run_v := T_RUN()
				_check(res.road_d / maxf(0.1, res.road_t) >= 1.4 * run_v and res.dist / maxf(0.1, ph_t) >= 1.2 * run_v, "faster than running: %.1f m/s on Route 1's road, %.1f m/s over the whole ride (%.0f m in %.1f s; running %.1f m/s)" % [res.road_d / maxf(0.1, res.road_t), res.dist / maxf(0.1, ph_t), res.dist, ph_t, run_v])
				_check(res.clip < res.frames * 0.02, "hands and feet stayed on the grips and pedals (%d of %d frames off)" % [res.clip, res.frames])
				_next()
		2:
			# and back south down Route 1's road to town (ledges only ever ridden down); first a
			# stop at the gate, as a player would (at full speed he would run on into the fence)
			if ph_t < 1.2:
				b._test_brake = true
				main.stick_vec = Vector2.ZERO
				return
			b._test_brake = false
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
				res.l_air = 0; res.l_air_t = 0.0
				res.l_y0 = b.at.y
			main.stick_vec = _toward(Vector3(res.ledge.x, 0, res.ledge.z + 8.0), 1.0)
			if not main.cast.ground: res.l_air += 1; res.l_air_t += dt
			if ph_t > 3.0:
				# (airborne time, not frames: the frame count follows the frame rate)
				_check(b.at.z > res.ledge.z + 0.5 and res.l_air >= 3 and res.l_air_t > 0.3, "rode off the ledge at (%.1f, %.1f) with a hop (airborne %.2f s, %d frames, dropped %.2f m)" % [res.ledge.x, res.ledge.z, res.l_air_t, res.l_air, res.l_y0 - b.at.y])
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
			# the shoreline: from the beach, ride south into the sea: into the shallows,
			# stopped at the wade limit, never deeper
			if ph_f == 1:
				_ride_at(20.0, 98.0, 0.0)
				_wt = {"deep": 0, "real": 0.0}
			main.stick_vec = _toward(Vector3(20.0, 0, 140.0), 1.0)
			_wt.real = maxf(_wt.real, _wd_max())
			if b._wd > 0.3 and absf(b.v) < 0.3 and not _wt.has("stop_z"): _wt.stop_z = b.at.z
			if ph_t > 6.0:
				_check(_wt.has("stop_z") and _wt.deep == 0 and _wt.real <= W.WADE_SEA + 0.005, "rode into the sea's shallows and stopped at the wade limit (stopped at z %.1f, %.2f m deep at most, the limit %.2f; %d frames a tyre deeper)" % [_wt.get("stop_z", 0.0), _wt.real, W.WADE_SEA, _wt.deep])
				_next()
		4:
			# stairs: Oak's lab stairs from the bottom
			if ph_f == 1:
				var s: Rect2 = main.sfx_world.STAIRS
				var c := s.get_center()
				Settings.set_value("bike_assist", 0)
				_ride_at(c.x - s.size.x * 0.5 - 8.0, c.y, PI * 0.5)
				b.v = 9.0
				res.st0 = b.at; res.st_v = 0.0; res.st_still = 0.0; res.st_stuck = 0.0
			main.stick_vec = _toward(Vector3(main.sfx_world.STAIRS.get_center().x + 6.0, 0, main.sfx_world.STAIRS.get_center().y), 0.8)
			var s3: Rect2 = main.sfx_world.STAIRS
			if s3.has_point(Vector2(b.at.x, b.at.z)): res.st_v = maxf(res.st_v, b.v)
			res.st_still = res.st_still + dt if absf(b.v) < 0.3 else 0.0
			res.st_stuck = maxf(res.st_stuck, res.st_still)
			if ph_t > 6.0:
				# (walkable, so rideable: slowly, bumping up each step)
				Settings.set_value("bike_assist", 1)
				_check(b.at.y - res.st0.y > 1.0 and res.st_v <= b.STAIR_V + 0.6 and res.st_stuck < 1.0, "stairs: rode up them slowly (up %.2f m, at most %.1f m/s on them, stairs speed %.1f; longest stop %.1f s)" % [b.at.y - res.st0.y, res.st_v, b.STAIR_V, res.st_stuck])
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
				# (nose to the wall, stopped: at today's speeds a run-up from 1.6 m glances off it)
				var tip0: float = b.model.WB * 0.5 + b.model.R * 0.6
				_ride_at(res.wall.x + sin(res.wall.y) * (1.6 - tip0 - 0.08), res.wall.z + cos(res.wall.y) * (1.6 - tip0 - 0.08), res.wall.y)
				b._blocked_t = 0.4   # (just knocked into it: pinned, as when a glance has nowhere to slide)
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
				phase = 25; ph_t = 0.0; ph_f = 0
		25:
			# flow at full, then a hard turn (the stick well past full lock): it drains
			if ph_f == 1:
				res.open = _open_spot(9.0) if not res.has("open") else res.open
				_ride_at(res.open.x, res.open.z - 6.0, 0.0)
				b.v = 13.0; b.flow_raw = 1.0; b.flow = 1.0
				res.f0 = 1.0
			var hy: float = b.yaw + 1.4
			main.stick_vec = _toward(b.at + Vector3(sin(hy), 0, cos(hy)) * 5.0, 1.0) if ph_t > 0.1 else _toward(b.at + Vector3(sin(b.yaw), 0, cos(b.yaw)) * 5.0, 1.0)
			if ph_t > 1.1:
				_check(res.f0 - b.flow > 0.3, "flow drained in a hard turn (from %.2f to %.2f in 1 s)" % [res.f0, b.flow])
				phase = 26; ph_t = 0.0; ph_f = 0
		26:
			# never locked in place: across every bridge and deck on the paths (both ways) and up
			# the steepest stretches of path, the stick held, the assist off
			if ph_f == 1:
				Settings.set_value("bike_assist", 0)
				res.courses = _courses()
				if _arg("only", "") != "": res.courses = res.courses.filter(func(c): return String(c[1]).contains(_arg("only", "")))
				res.ci = -1; res.c_bad = []; res.c_still = 0.0; res.c_worst = 0.0; res.c_t = 99.0
				res.flat_n = 0.0; res.flat_s = 0.0; res.climb_n = 0.0; res.climb_s = 0.0; res.st_prev = main.cast.body.stamina
				main.cast.body.stamina = 0.95
				main.cast.body.cond.remove("fatigue")
			var cs: Array = res.courses
			if res.c_t > float(cs[res.ci][2]) if res.ci >= 0 else true:
				if res.ci >= 0:
					if res.c_worst >= 1.0 or wi < waypoints.size() - 1: res.c_bad.append("%s (stopped %.1f s, %d of %d points)" % [cs[res.ci][1], res.c_worst, wi, waypoints.size()])
				res.ci += 1
				if res.ci >= cs.size():
					Settings.set_value("bike_assist", 1)
					_check(res.c_bad.is_empty() and (cs.size() >= 4 or _arg("only", "") != ""), "never locked in place: %d rides over the bridges and up the steepest paths (stuck: %s)" % [cs.size(), ", ".join(res.c_bad)])
					res.flat_n = 0.0; res.flat_s = 0.0
					phase = 27; ph_t = 0.0; ph_f = 0
					return
				var pts: Array = cs[res.ci][0]
				var p0: Vector3 = pts[0]; var p1: Vector3 = pts[1]
				_ride_at(p0.x, p0.z, atan2(p1.x - p0.x, p1.z - p0.z))
				b.v = 5.0
				waypoints = pts.slice(1); wi = 0
				res.c_t = 0.0; res.c_still = 0.0; res.c_worst = 0.0
				main.cast.body.stamina = maxf(main.cast.body.stamina, 0.5)
				res.st_prev = main.cast.body.stamina
				return
			res.c_t += dt
			_follow(dt)
			main.stick_vec *= 0.9   # (pedalling, not sprinting)
			if wi >= waypoints.size(): res.c_t = 1e9
			res.c_still = res.c_still + dt if absf(b.v) < 0.3 and res.c_t > 0.3 else 0.0
			res.c_worst = maxf(res.c_worst, res.c_still)
			# the stamina it costs (body.gd's own bar), pedalling on the flat and climbing
			var bs: float = main.cast.body.stamina
			if OS.get_cmdline_user_args().has("--log") and ph_f % 20 == 0: print("st ped %s rate %.4f run_t %.2f slope %.3f stam %.4f v %.2f fat %s" % [b.pedalling, main.cast.body.ride_rate, main.cast.body._run_t, b._slope_s, bs, b.v, main.cast.body.cond.has("fatigue")])
			var ds: float = res.st_prev - bs
			res.st_prev = bs
			if b.pedalling and not main.cast.body.cond.has("fatigue") and res.c_t > 1.0 and main.cast.body._run_t <= 0.0:
				if b._slope_s > 0.15: res.climb_n += dt; res.climb_s += ds
		27, 28:
			# the same stretch of road, the stick right out (sprint): fresh, then worn out
			var tired := phase == 28
			if ph_f == 1:
				Settings.set_value("bike_assist", 1)
				var rd2 := _straight_road()
				_ride_at(rd2.x, rd2.z, rd2.y)
				main.cast.body.stamina = 0.05 if tired else 1.0
				if tired: main.cast.body.cond.apply("fatigue", 1.0)
				else: main.cast.body.cond.remove("fatigue")
				res.fv = 0.0
				res.st_prev = main.cast.body.stamina
			if tired: main.cast.body.stamina = minf(main.cast.body.stamina, 0.05)
			# (straight ahead, the assist keeping him on the road: fresh at a normal push, worn
			# out with the stick right out, which would be a sprint)
			main.stick_vec = Vector2(0, -1.0) if tired else Vector2(0, -0.9)
			res.fv = maxf(res.fv, b.v)
			if not tired:
				var bs2: float = main.cast.body.stamina
				if b.pedalling and absf(b._slope_s) < 0.03 and ph_t > 1.0 and main.cast.body._run_t <= 0.0: res.flat_n += dt; res.flat_s += res.st_prev - bs2
				res.st_prev = bs2
			if ph_t > 4.0:
				if not tired:
					res.fresh_v = res.fv
					var fr: float = res.flat_s / maxf(0.01, res.flat_n)
					var cr: float = res.climb_s / maxf(0.01, res.climb_n)
					var rd: float = main.cast.body.RUN_DRAIN
					_check(res.flat_n > 1.0 and res.climb_n > 0.5 and fr > 0.0 and fr < rd * 0.45 and cr > fr * 2.0, "stamina: pedalling on the flat %.4f a second (running %.4f), climbing %.4f (%.1f s flat, %.1f s climbing)" % [fr, rd, cr, res.flat_n, res.climb_n])
					phase = 28; ph_t = 0.0; ph_f = 0
				else:
					_check(main.cast.body.cond.has("fatigue") and res.fv < res.fresh_v * 0.82 and res.fv > 4.0, "worn out: top speed %.1f m/s against %.1f fresh on the same stretch (no sprint, x %.2f)" % [res.fv, res.fresh_v, b.FAT_SPEED])
					main.cast.body.stamina = 1.0
					main.cast.body.cond.remove("fatigue")
					phase = 8; ph_t = 0.0; ph_f = 0
		8:
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for n in notes: print("  " + n)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99

func T_RUN() -> float: return preload("res://tunables.gd").num("player", "run_speed", 8.5)

# a straight stretch of Route 1's road for the fatigue ride: [x, yaw, z]
func _straight_road() -> Vector3:
	var road: Array = main.cast.road
	var i := road.size() / 2
	var a := Vector2(road[i][0], road[i][1]); var c := Vector2(road[i - 6][0], road[i - 6][1])
	return Vector3(a.x, atan2(c.x - a.x, c.y - a.y), a.y)

# the rides for the lock-in check: [points, label, seconds]; every deck crossing of the path
# graph both ways (8 m on and off; bridges, not a deck the path ends on), and the 4 steepest 6 m climbs (stepping stones left out)
func _courses() -> Array:
	var A: BikeAssist = B().assist
	var W = main.world
	var out := []
	var climbs := []
	for k in A.E.size():
		var L: float = A.E[k].len
		var t := 0.0
		var run0 := -1.0
		while t <= L + 0.01:
			var q := A.at(k, t)
			var fl: int = W.flag(q.x, q.y)
			var deck := fl != 255 and (fl & 4) != 0
			if deck and run0 < 0.0: run0 = t
			if (not deck or t + 0.5 > L) and run0 >= 0.0:
				var a0 := maxf(0.0, run0 - 8.0); var a1 := minf(L, t + 8.0)
				var near_stones := false
				for u in range(0, 9): if A.walk_only(A.at(k, lerpf(a0, a1, u / 8.0)), 2.0): near_stones = true
				# (a bridge: ground on both sides of the deck along the path; a deck the path ends
				# on, a lookout's floor, is not crossed)
				var crossing: bool = run0 > 0.6 and t + 0.5 <= L and not deck
				if not near_stones and crossing and a1 - a0 > 6.0:
					for dd in [1, -1]:
						var pts := []
						var u2 := a0 if dd > 0 else a1
						while (u2 <= a1 + 0.01) if dd > 0 else (u2 >= a0 - 0.01):
							var p := A.at(k, u2); pts.append(Vector3(p.x, 0, p.y)); u2 += 1.0 * dd
						out.append([pts, "deck on edge %d at (%.0f, %.0f) %s" % [k, q.x, q.y, "a->b" if dd > 0 else "b->a"], (a1 - a0) / 2.0 + 4.0])
				run0 = -1.0
			t += 0.5
		# climbs: rise over 6 m (either way along the edge)
		t = 0.0
		while t + 6.0 <= L:
			var pa := A.at(k, t); var pb := A.at(k, t + 6.0)
			var rise: float = W.height_at(pb.x, pb.y) - W.height_at(pa.x, pa.y)
			var ok := true
			for u in range(0, 7): if A.walk_only(A.at(k, t + u), 2.0): ok = false
			if ok: climbs.append([absf(rise) / 6.0, k, t, signf(rise)])
			t += 3.0
	climbs.sort_custom(func(a, b2): return a[0] > b2[0])
	var used := {}
	for c in climbs:
		if used.size() >= 4: break
		if used.has(c[1]): continue
		used[c[1]] = true
		var k2: int = c[1]
		var L2: float = A.E[k2].len
		var lo: float = c[2] - 8.0 if c[3] > 0 else c[2] + 14.0
		var hi: float = c[2] + 12.0 if c[3] > 0 else c[2] - 6.0
		lo = clampf(lo, 0.0, L2); hi = clampf(hi, 0.0, L2)
		var pts2 := []
		var stp := 1.0 if hi > lo else -1.0
		var u3 := lo
		while (u3 <= hi + 0.01) if stp > 0 else (u3 >= hi - 0.01):
			var p2 := A.at(k2, u3); pts2.append(Vector3(p2.x, 0, p2.y)); u3 += stp
		if pts2.size() > 3: out.append([pts2, "climb %.2f on edge %d" % [c[0], k2], absf(hi - lo) / 1.5 + 4.0])
	return out

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
	if b.v > 4.0 and tdir.length() > 0.01 and absf(wrapf(atan2(tdir.x, tdir.y) - b.yaw, -PI, PI)) > 1.9:
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
	if frame == 5 and _arg("phase", "") != "": phase = int(_arg("phase", "0")); _fresh_state()
	ph_t += dt
	ph_f += 1
	var p2 := Vector2(b.at.x, b.at.z)
	match phase:
		0:
			# town -> the Route 1 gate: Red's lane by Ash's house, the stick held forward only
			if ph_f == 1:
				_fresh_state()
				_start_on(-12.0, -15.5, Vector2(-5.6, -18.0))
				b.goal_override = Vector3(-2.0, 0.0, -446.0)
				_as = {"dev": 0.0, "over": -99.0, "flow_pk": 0.0, "drop": 0.0, "lost": 0, "fr": 0, "us": 0.0, "us_max": 0.0, "vmax": 0.0, "fmax": 0.0, "drain": false, "hi_t": -1.0, "onf": 0, "turn_max": 0.0, "hold": 0.0, "c_min": 99.0, "c_sum": 0.0, "c_n": 0, "c_at": Vector2.ZERO}
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
			# flow through the road's bends: held in the gentle ones (from its peak on the straight before)
			if absf(b.om) < b.FLOW_YAW: _as.flow_pk = b.flow
			elif absf(b.om) < b.FLOW_YAW_DRAIN:
				# (only the bend's own share: a climb, a brake or slow ground drain it anyway)
				if b.flow_why == "": _as.hold = maxf(_as.hold, _as.flow_pk - b.flow)
				else: _as.flow_pk = b.flow
			else: _as.drop = maxf(_as.drop, _as.flow_pk - b.flow)
			# corner speeds on Route 1's road (turning at more than 0.45 rad/s)
			if b.at.z < -60.0 and absf(b.om) > 0.45 and ph_t > 3.0:
				_as.c_n += 1; _as.c_sum += b.v
				if b.v < _as.c_min: _as.c_min = b.v; _as.c_at = Vector2(b.at.x, b.at.z)
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
				_check(_as.hold < 0.25, "flow held through the road's gentle bends (fell by %.2f at most; %.2f in sharper ones)" % [_as.hold, _as.drop])
				_check(_as.c_n > 60 and _as.c_min >= b.CRUISE * 0.7, "kept speed round Route 1's corners: %.1f m/s at the slowest (at %s), %.1f on average; cruise %.1f (%d frames turning)" % [_as.c_min, str(_as.c_at), _as.c_sum / maxf(1.0, _as.c_n), b.CRUISE, _as.c_n])
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
		1, 2, 3, 4, 9:
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
			# (a pick: half the stick toward the branch, once the fork is near, as a player would)
			if phase in [2, 3] and p2.distance_to(A.nodes[fork]) < 16.0 and p2.x < A.nodes[fork].x + 1.0:
				var ein0 := -1
				for o in A.adj[fork]: if o[0] != e1 and o[0] != e2: ein0 = o[0]
				var tin0 := -A._out_dir(fork, ein0, 1 if A.E[ein0].a == fork else -1)
				var lf0 := Vector2(tin0.y, -tin0.x)
				var q1 := A._out_dir(fork, e1, 1 if A.E[e1].a == fork else -1)
				var q2 := A._out_dir(fork, e2, 1 if A.E[e2].a == fork else -1)
				var left_e := e1 if q1.dot(lf0) > q2.dot(lf0) else e2
				var tgt_e := left_e if phase == 2 else (e2 if left_e == e1 else e1)
				var od := A._out_dir(fork, tgt_e, 1 if A.E[tgt_e].a == fork else -1)
				var tp := A.nodes[fork] + od * 14.0
				sv = _toward(Vector3(tp.x, 0, tp.y), 0.25)
			if phase == 9: sv = Vector2(-0.85 * tan(deg_to_rad(10.0)), -0.85)   # (a slight drift toward the left: 10 degrees)
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
				var label: String = ["", "straight on", "a quarter of the stick toward the left branch", "a quarter of the stick toward the right branch", "toward the goal", "", "", "", "", "a slight drift of the stick (10 degrees)"][phase]
				var straight := e1 if o1.dot(tin) > o2.dot(tin) else e2
				match phase:
					1, 9: want = straight
					2: want = e1 if o1.dot(left) > o2.dot(left) else e2
					3: want = e1 if o1.dot(left) < o2.dot(left) else e2
					# (the goal picks only where no branch runs on straight)
					4: want = e2 if maxf(o1.dot(tin), o2.dot(tin)) < cos(A.STRAIGHT_ANG) else straight
				_check(on == want and (_as.picked == want or phase == 9 and _as.picked < 0), "at the fork, %s: took edge %d (picked %d by %s, expected %d; branches %d toward the tree, %d toward the lookout)" % [label, on, _as.picked, _as.why, want, e1, e2])
				if phase == 9: phase = 10; ph_t = 0.0; ph_f = 0
				else: _next()
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
				# (near a fork a push toward a branch picks it instead: the lazy fork rule)
				if ph_t > _as.t_on + 1.05 and b.assisting and A.why == "stick" and not A.choice.is_empty(): _as.off = true; _as.fork = true
			if _as.t_on > 0.0 and ph_t > _as.t_on + 1.3 and _as.back < 0.0 and b.assisting: _as.back = ph_t - (_as.t_on + 1.3)
			if ph_t > 8.0:
				_check(_as.off, "steering the stick over took the steering back at once" + (" (here near a fork: it picked the branch the stick points at)" if _as.get("fork", false) else ""))
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
			# the ford at the stepping stones on the tea house trail: the assist rides on
			# over them, slowly from stone to stone (or through the creek beside them),
			# and out the other side
			if ph_f == 1:
				_start_on(-38.0, -233.0, Vector2(-48.0, -242.0))
				_as = {"min": 99.0, "vdry": 0.0, "vwet": 99.0, "wet": 0, "on": 0}
			main.stick_vec = Vector2(0, -0.85)
			for q in A.walk_pts: _as.min = minf(_as.min, q.distance_to(p2))
			var on_ford: bool = b.water.in_water or A.walk_only(p2, 0.5)
			if on_ford:
				_as.wet += 1
				_as.vwet = minf(_as.vwet, b.v)
				if b.assisting: _as.on += 1
			elif _as.wet == 0: _as.vdry = maxf(_as.vdry, b.v)
			var last: Vector2 = A.walk_pts[A.walk_pts.size() - 1]
			var dd: Vector2 = (last - A.walk_pts[0]).normalized()
			var past: float = (p2 - last).dot(dd)
			if ph_t > 10.0 or past > 5.0:
				_check(past > 3.0 and _as.wet > 5, "the ford at the stepping stones: the assist rode on across (%.1f m past the last stone, %d frames on the stones or in the water, steering %d of them)" % [past, _as.wet, _as.on])
				_check(_as.vwet < _as.vdry * 0.75, "slower over the ford: %.1f m/s on the trail, %.1f at the slowest on it" % [_as.vdry, _as.vwet])
				phase = 9; ph_t = 0.0; ph_f = 0
		11:
			# a quick turn on a path: the stick pushed 45 degrees over at speed, the assist on;
			# the bike answers within a few frames (it does not fight the stick)
			if ph_f == 1:
				Settings.set_value("bike_assist", 1)
				var rd := _straight_road()
				_ride_at(rd.x, rd.z, rd.y)
				b.v = 12.0
				_as = {"t0": -1.0, "f0": 0, "fr": -1, "on": false}
			if ph_t < 1.5:
				main.stick_vec = Vector2(0, -0.85)
				_as.on = b.assisting
			else:
				if _as.t0 < 0.0: _as.t0 = ph_t; _as.f0 = ph_f
				main.stick_vec = Vector2(0.62, -0.62)
				if _as.fr < 0 and b.om < -0.6: _as.fr = ph_f - _as.f0
			if ph_t > 2.3:
				_check(_as.on and _as.fr >= 0 and _as.fr <= 6, "a quick turn on a path (assist on): the bike turned within %d frames of the stick going over" % _as.fr)
				phase = 8; ph_t = 0.0; ph_f = 0
		10:
			# lazy at junctions: through real junctions of the graph (a branch running on
			# straight), the stick held forward, the goal off: straight on every time
			if ph_f == 1:
				Settings.set_value("bike_goal", 0)
				b.goal_override = Vector3.INF
				_as = {"list": _junctions(4), "i": -1, "bad": [], "n": 0, "t": 99.0}
			if _as.t > 12.0 or (_as.i >= 0 and p2.distance_to(_as.list[_as.i][3]) > 12.0 and (p2 - _as.list[_as.i][3]).dot(_as.list[_as.i][4]) > 8.0):
				if _as.i >= 0:
					var J: Array = _as.list[_as.i]
					_as.n += 1
					if A.e != J[2]: _as.bad.append("node %d at %s: on edge %d, straight on is %d (%.1f s)" % [J[0], str(J[3]), A.e, J[2], _as.t])
				_as.i += 1
				if _as.i >= _as.list.size():
					Settings.set_value("bike_goal", 1)
					_check(_as.n >= 3 and _as.bad.is_empty(), "lazy at junctions: %d junctions ridden straight through with the stick forward (wrong: %s)" % [_as.n, ", ".join(_as.bad)])
					phase = 11; ph_t = 0.0; ph_f = 0
					return
				var J2: Array = _as.list[_as.i]
				var st: Vector2 = J2[5]
				_start_on(st.x, st.y, J2[3])
				b.v = 8.0
				_as.t = 0.0
			_as.t += dt
			main.stick_vec = Vector2(0, -0.85)
		8:
			Settings.set_value("bike_goal", 1)
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for nn in notes: print("  " + nn)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99


# ---------- --case=water: riding into the water ----------
var _wt := {}
func _wd_max() -> float:
	# the real water depth at the deeper tyre, and whether either tyre is deeper than Ash may wade
	var b := B()
	var W = main.world
	var f := Vector3(sin(b.yaw), 0, cos(b.yaw))
	var d := 0.0
	for p in [b.at + f * b.model.WB * 0.5, b.at - f * b.model.WB * 0.5]:
		var fl: int = W.flag(p.x, p.z)
		if fl != 255 and (fl & 1) and not (fl & 4):
			d = maxf(d, W.water_depth(p.x, p.z))
			if not W.can_wade(p.x, p.z): _wt.deep += 1
	return d

func _wt_sample(dt: float) -> void:
	var b := B()
	var rd := _wd_max()
	_wt.real = maxf(_wt.real, rd)
	_wt.vis = maxf(_wt.vis, b._wd)
	var bw = b.water
	if bw.in_water:
		_wt.wet_frames += 1
		_wt.live_in = maxf(_wt.live_in, bw.pools_live())
		_wt.us += bw.stats.us; _wt.usn += 1
		_wt.us_max = maxf(_wt.us_max, bw.stats.us)
		_wt.bus += b.stats.us
		_wt.drops = maxi(_wt.drops, bw.fx._live_d)
		_wt.foam = maxi(_wt.foam, bw._flive)
		if bw.bow.visible: _wt.bow += 1
		if bw._part_set: _wt.part += 1
		var nd: int = (1 if bw.fx._live_d > 0 else 0) + (1 if bw.fx._live_r > 0 else 0) + (1 if bw._flive > 0 else 0) + (1 if bw.bow.visible else 0)
		_wt.fxd = maxi(_wt.get("fxd", 0), nd)
		var bd = main.cast.body
		if b.pedalling and b._wd > 0.3: _wt.rr = maxf(_wt.get("rr", 0.0), bd.ride_rate)
		_wt.legs = maxf(_wt.get("legs", 0.0), bd.wet_line)
	# the speed by depth (pedalling flat out, no braking)
	if b.pedalling and main.stick_vec.length() > 0.9 and ph_t > 0.3:
		var k := clampi(int(b._wd / 0.1), 0, 5)
		_wt.vb[k] = maxf(_wt.vb[k], b.v) if _wt.vb[k] >= 0.0 else b.v
	var R := RenderingServer
	if bw.in_water and b.v > 4.0 and not _wt.has("draws_in"):
		_wt.draws_in = R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)

func _water_test(dt: float) -> void:
	var b := B()
	var W = main.world
	ph_t += dt
	ph_f += 1
	if frame == 4:
		_fresh_state()
		Settings.set_value("bike_assist", 0)
		ph_f = 1; ph_t = 0.0
		if _arg("phase", "") != "": phase = int(_arg("phase", "0"))   # (renders: one part)
		_wt = {"deep": 0, "real": 0.0, "vis": 0.0, "wet_frames": 0, "live_in": 0, "us": 0.0, "usn": 0, "us_max": 0.0, "bus": 0.0, "drops": 0, "foam": 0, "bow": 0, "part": 0, "vb": [-1.0, -1.0, -1.0, -1.0, -1.0, -1.0]}
	if frame < 4: return
	if phase in [0, 2, 3]: _wt_sample(dt)
	if OS.get_cmdline_user_args().has("--trace") and frame % 6 == 0:
		var RS := RenderingServer
		print("wt %d t %.2f at (%.2f %.2f %.2f) v %.2f wd %.2f in %s live %d draws %d fx %.0f us" % [phase, ph_t, b.at.x, b.at.z, b.at.y, b.v, b._wd, b.water.in_water, b.water.pools_live(), RS.get_rendering_info(RS.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME), b.water.stats.us])
	match phase:
		0:
			# the beach: ride south into the sea, flat out
			if ph_f == 1:
				_ride_at(20.0, 98.0, 0.0)
				_wt.vb = [-1.0, -1.0, -1.0, -1.0, -1.0, -1.0]
			main.stick_vec = _toward(Vector3(20.0, 0, 140.0), 1.0)
			if b._wd > 0.3 and absf(b.v) < 0.3 and not _wt.has("stop_z"): _wt.stop_z = b.at.z
			if ph_t > 8.0:
				_check(_wt.vis > 0.35 and _wt.get("stop_z", 0.0) > 0.0, "into the sea: rode into the shallows and stopped at the wade limit (water %.2f m at the tyres as the bike sits, %.2f m real; stopped at z %.1f, then nosed along it to z %.1f)" % [_wt.vis, _wt.real, _wt.get("stop_z", 0.0), b.at.z])
				_check(_wt.deep == 0 and _wt.real <= W.WADE_SEA + 0.02, "never deeper than Ash may wade (%.2f m real, sea limit %.2f; %d frames a tyre past it)" % [_wt.real, W.WADE_SEA, _wt.deep])
				var vb: Array = _wt.vb
				var mono := true
				var last := 99.0
				var txt := ""
				for k in vb.size():
					if vb[k] < 0.0: continue
					txt += "%.1f-%.1f m: %.1f m/s; " % [k * 0.1, k * 0.1 + 0.1, vb[k]]
					if vb[k] > last + 0.6: mono = false
					last = vb[k]
				_check(mono and vb[0] > 0.0 and last < vb[0] * 0.6, "the speed falls with the depth (" + txt + ")")
				_check(_wt.live_in > 20 and _wt.bow > 10 and _wt.part > 10, "splashing in the water: up to %d drops, %d foam patches live (%d in all), the bow wave %d frames, the water parted %d frames" % [_wt.drops, _wt.foam, _wt.live_in, _wt.bow, _wt.part])
				_check(_wt.get("rr", 0.0) > b.ST_FLAT + 0.5 * b.W_STAMINA, "pedalling deep in the water costs more stamina: %.4f a second (on the flat %.4f)" % [_wt.get("rr", 0.0), b.ST_FLAT])
				_check(_wt.get("legs", 0.0) > 0.3, "Ash's legs and shoes got wet (the wet line %.2f m up)" % _wt.get("legs", 0.0))
				_wt.wet0 = b.water.wet
				_next()
		1:
			# back out and on up the beach: wet, dripping, then everything idle
			if ph_f == 1: _wt.drip_seen = 0; _wt.out_at = -1.0
			main.stick_vec = _toward(Vector3(20.0, 0, 60.0), 0.8)
			if not b.water.in_water and b.water.drip_t > 0.0 and b.water.fx._live_d > 0: _wt.drip_seen += 1
			if ph_t > 14.0:
				_check(_wt.wet0 > 0.2 and _wt.drip_seen > 10, "out of the water the bike is wet (line %.2f m) and dripped (%d frames of drops)" % [_wt.wet0, _wt.drip_seen])
				var R := RenderingServer
				_check(not b.water.in_water and b.water.pools_live() == 0 and not b.water._part_set and b.water.stats.us < 100.0, "dry land: the splash pools idle (%d live, parting %s, %.0f us a frame while the wet line dries)" % [b.water.pools_live(), b.water._part_set, b.water.stats.us])
				_wt.draws_out = R.get_rendering_info(R.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
				_next()
		2:
			# the town stream: across it, west to east, at z 0
			if ph_f == 1:
				var x0 := 99.0; var x1 := -99.0
				for xi in range(-30, 50):
					var x := float(xi) * 0.5
					var fl: int = W.flag(x, 0.0)
					if fl != 255 and (fl & 1) and not (fl & 4): x0 = minf(x0, x); x1 = maxf(x1, x)
				_wt.sx = [x0, x1]
				_ride_at(x0 - 16.0, 0.0, PI * 0.5)
				_wt.vin = 99.0; _wt.ventry = 0.0; _wt.real = 0.0; _wt.vis = 0.0; _wt.deep = 0
			main.stick_vec = _toward(Vector3(_wt.sx[1] + 20.0, 0, 0.0), 1.0)
			var fl2: int = W.flag(b.at.x, b.at.z)
			if fl2 != 255 and (fl2 & 1) and not (fl2 & 4):
				_wt.inside = true
				_wt.vin = minf(_wt.vin, b.v)
			elif not _wt.get("inside", false): _wt.ventry = maxf(_wt.ventry, b.v)
			if ph_t > 7.0 or b.at.x > _wt.sx[1] + 8.0:
				_check(b.at.x > _wt.sx[1] + 2.0 and _wt.deep == 0, "the town stream (x %.1f .. %.1f at z 0): rode across it (x %.1f), never deeper than Ash may wade (%.2f m real at the tyres, %.2f as it sits)" % [_wt.sx[0], _wt.sx[1], b.at.x, _wt.real, _wt.vis])
				_check(_wt.vin < _wt.ventry * 0.7, "slowed in the stream: %.1f m/s riding up to it, %.1f at the slowest in it" % [_wt.ventry, _wt.vin])
				_next()
		3:
			# the tea house creek, beside the stepping stones (1.6 m off them), along the trail
			if ph_f == 1:
				var A: BikeAssist = b.assist
				var a: Vector2 = A.walk_pts[0]
				var c: Vector2 = A.walk_pts[A.walk_pts.size() - 1]
				var dd := (c - a).normalized()
				var pp := Vector2(dd.y, -dd.x)
				_wt.ford = [a, c, dd]
				var st := a - dd * 7.0 + pp * 1.6
				_ride_at(st.x, st.y, atan2(dd.x, dd.y))
				_wt.real = 0.0; _wt.vis = 0.0; _wt.deep = 0; _wt.wet_frames = 0
			var fd: Array = _wt.ford
			var fdd: Vector2 = fd[2]
			var tgt: Vector2 = (fd[1] as Vector2) + fdd * 12.0 + Vector2(fdd.y, -fdd.x) * 1.6
			main.stick_vec = _toward(Vector3(tgt.x, 0, tgt.y), 1.0)
			var along: float = (Vector2(b.at.x, b.at.z) - (fd[1] as Vector2)).dot(fd[2] as Vector2)
			if ph_t > 8.0 or along > 4.0:
				_check(along > 2.0 and _wt.wet_frames > 5 and _wt.deep == 0, "the tea house creek beside the stepping stones: rode through it (%.1f m past the last stone, %d frames in the water, %.2f m deep at most)" % [along, _wt.wet_frames, _wt.real])
				_next()
		4:
			var n: float = maxf(1.0, _wt.usn)
			print("cost in the water (avg of %d frames): splash fx %.0f us a frame (max %.0f), the bike's control %.0f us; the effects' draw calls at most %d (frame draws %s in the water, %s on the beach)" % [_wt.usn, _wt.us / n, _wt.us_max, _wt.bus / n, _wt.get("fxd", 0), str(_wt.get("draws_in", "-")), str(_wt.get("draws_out", "-"))])
			Settings.set_value("bike_assist", 1)
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for nn in notes: print("  " + nn)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99

# ---------- measure: the riding numbers ----------
var _ms := {}
func _road_h(i: int) -> float:
	var road: Array = main.cast.road
	return main.world.ash_ground(road[i][0], road[i][1])
func _road_len(i0: int, i1: int) -> float:
	var road: Array = main.cast.road
	var d := 0.0
	var st := 1 if i1 > i0 else -1
	var i := i0
	while i != i1:
		d += Vector2(road[i + st][0] - road[i][0], road[i + st][1] - road[i][1]).length()
		i += st
	return d
# [i0, i1] of road points: the flattest straight 50 m and the steepest 40 m climb (going i0 -> i1)
func _ms_find() -> void:
	var road: Array = main.cast.road
	var n := road.size()
	var best_flat := 1e9; var best_climb := -1e9
	for i in range(10, n - 10, 2):
		for dir in [1, -1]:
			var j: int = i
			var L := 0.0
			var rough := 0.0
			while j + dir >= 0 and j + dir < n and L < 50.0:
				L += Vector2(road[j + dir][0] - road[j][0], road[j + dir][1] - road[j][1]).length()
				rough = maxf(rough, absf(_road_h(j + dir) - _road_h(i)))
				j += dir
			if L >= 50.0 and Vector2(road[j][0] - road[i][0], road[j][1] - road[i][1]).length() > 44.0 and rough < best_flat:
				best_flat = rough; _ms.flat = [i, j]
			var k: int = i; var L2 := 0.0
			while k + dir >= 0 and k + dir < n and L2 < 40.0:
				L2 += Vector2(road[k + dir][0] - road[k][0], road[k + dir][1] - road[k][1]).length(); k += dir
			if L2 >= 40.0:
				var g := (_road_h(k) - _road_h(i)) / L2
				if g > best_climb: best_climb = g; _ms.climb = [i, k]; _ms.grade = g
	print("MEASURE spots: road %d points; flat road %s (height range %.2f m over 50 m), steepest 40 m climb %s grade %.3f" % [n, str(_ms.get("flat")), best_flat, str(_ms.get("climb")), _ms.get("grade", 0.0)])

func _ms_ride(i0: int, i1: int, v0: float) -> void:
	var road: Array = main.cast.road
	var st := 1 if i1 > i0 else -1
	_ride_at(road[i0][0], road[i0][1], atan2(road[i0 + st][0] - road[i0][0], road[i0 + st][1] - road[i0][1]))
	B().v = v0
	waypoints = []
	var i := i0 + st
	while i != i1 + st and i >= 0 and i < road.size():
		waypoints.append(Vector3(road[i][0], 0, road[i][1])); i += st
	wi = 0

func _measure(dt: float) -> void:
	var b := B()
	if frame == 4: _fresh_state(); _ms_find()
	if frame < 5: return
	ph_t += dt
	ph_f += 1
	var steps := ["flat cruise", "flat sprint", "grass cruise", "climb cruise", "climb sprint", "down pedal", "down coast"]
	if phase >= steps.size():
		print("MEASURE done"); get_tree().quit(0); phase = 99; return
	var nm: String = steps[phase]
	var fl: Array = _ms.flat; var cl: Array = _ms.climb
	if ph_f == 1:
		main.cast.body.stamina = 1.0
		main.cast.body.cond.remove("fatigue")
		res = {"vmax": 0.0, "t12": -1.0, "tops": [], "sum": 0.0, "n": 0, "vmin": 99.0}
		match nm:
			"flat cruise", "flat sprint": _ms_ride(fl[0], fl[1], 0.0)
			"grass cruise":
				var o := _open_spot(9.0)
				_ride_at(o.x, o.z - 8.0, 0.0)
				waypoints = [Vector3(o.x, 0, o.z + 40.0)]; wi = 0
				Settings.set_value("bike_assist", 0)
			"climb cruise", "climb sprint": _ms_ride(cl[0], cl[1], b.CRUISE)
			"down pedal", "down coast": _ms_ride(cl[1], cl[0], 8.0)
		res.v0 = b.v
		return
	_follow(dt)
	var tilt := 1.0 if nm in ["flat sprint", "climb sprint"] else 0.9
	if nm == "down coast": tilt = 0.07   # (released: steers toward the road, no pedalling)
	main.stick_vec *= tilt
	res.vmax = maxf(res.vmax, b.v)
	res.sum += b.v; res.n += 1
	if ph_t > 1.0: res.vmin = minf(res.vmin, b.v)
	if res.t12 < 0.0 and b.v >= 12.0: res.t12 = ph_t
	res.tops.append([ph_t, b.v])
	var done := wi >= waypoints.size() or ph_t > 12.0
	if done:
		var t95 := -1.0
		for e in res.tops:
			if e[1] >= res.vmax * 0.95: t95 = e[0]; break
		match nm:
			"flat cruise", "flat sprint", "grass cruise":
				print("MEASURE %s: top %.1f m/s, 0->12 m/s %.2f s, 0->95%% of top %.2f s (surface %s)" % [nm, res.vmax, res.t12, t95, b.surface])
			"climb cruise", "climb sprint":
				print("MEASURE %s (grade %.3f, 40 m): from %.1f m/s, slowest %.1f, average %.1f, at the top %.1f" % [nm, _ms.grade, res.v0, res.vmin, res.sum / maxf(1, res.n), b.v])
			_:
				print("MEASURE %s (grade -%.3f, 40 m): from %.1f m/s to %.1f at the bottom (+%.1f), top %.1f" % [nm, _ms.grade, res.v0, b.v, b.v - res.v0, res.vmax])
		Settings.set_value("bike_assist", 1)
		phase += 1; ph_t = 0.0; ph_f = 0

# junctions for the lazy-assist check: [node, edge in, the straight edge out, node point,
# the way out, a start 16 m back along the edge in]; nodes of 3+ edges where one branch
# runs on within 0.4 rad of straight and the edge in is at least 20 m long
func _junctions(n: int) -> Array:
	var A: BikeAssist = B().assist
	var out := []
	for nd in A.nodes.size():
		if A.adj[nd].size() < 3: continue
		for o in A.adj[nd]:
			var k: int = o[0]
			if A.E[k].len < 20.0: continue
			var d_in := -1 if o[1] > 0 else 1   # (arriving at nd along k)
			var br := A.branches(nd, k, d_in)
			if br.size() < 2: continue
			var tin := A.tangent(k, A.E[k].len if d_in > 0 else 0.0, d_in)
			var best := []; var bd := -9.0; var second := -9.0
			for b2 in br:
				var dd := A._out_dir(nd, b2[0], b2[1]).dot(tin)
				if dd > bd: second = bd; bd = dd; best = b2
				elif dd > second: second = dd
			if bd < cos(0.4) or second > cos(0.9): continue
			var sp := A.at(k, (A.E[k].len - 16.0) if d_in > 0 else 16.0)
			var od := A._out_dir(nd, best[0], best[1])
			# (rideable: the start and the node on open ground)
			out.append([nd, k, best[0], A.nodes[nd], od, sp])
			break
		if out.size() >= n: break
	return out

# ---------- tricks: the 180 and the wheelie ----------
var _tk := {}
func _shot(name: String) -> void:
	if snapdir == "": return
	RenderingServer.frame_post_draw.connect(func(): get_viewport().get_texture().get_image().save_png("%s/%s.png" % [snapdir, name]), CONNECT_ONE_SHOT)

func _tricks(dt: float) -> void:
	var b := B()
	if frame == 4: _fresh_state(); _ms_find()
	if frame < 5: return
	ph_t += dt
	ph_f += 1
	var f := Vector3(sin(b.yaw), 0, cos(b.yaw))
	var fl: Array = _ms.flat
	match phase:
		0, 1, 2:
			# ride up to speed on the flat road, then: 0 a flick, 1 a slow sweep round the
			# side, 2 a slow pull back through the centre
			if ph_f == 1:
				_ms_ride(fl[0], fl[1], 0.0)
				_tk = {"n0": b.spins, "y0": 0.0, "v0": 0.0, "t0": -1.0, "shot": false, "vmin": 99.0}
			if ph_t < 2.6:
				_follow(dt)
				main.stick_vec *= 0.95
				return
			if _tk.t0 < 0.0: _tk.t0 = ph_t; _tk.y0 = b.yaw; _tk.v0 = b.v; _tk.f0 = f
			var tt: float = ph_t - _tk.t0
			var f0: Vector3 = _tk.f0
			var bk := Vector3(-f0.x, 0, -f0.z)
			match phase:
				0:
					# forward 0.15 s, then straight back 0.25 s, then along the new way
					# (the back stick then held just as it was, as a player would: the camera swings
					# round with him, and the held stick must still mean straight on)
					if tt < 0.15: main.stick_vec = _toward(b.at + f0 * 6.0, 1.0)
					else:
						if not _tk.has("sv"): _tk.sv = _toward(b.at + bk * 6.0, 1.0)
						main.stick_vec = _tk.sv if tt < 0.4 else _tk.sv * 0.9
					if b.spins > _tk.n0 and b.spin_t < 0.0 and not _tk.has("cam"):
						_tk.cam = absf(wrapf(main.cam_yaw - (b.yaw + PI), -PI, PI))
				1:
					# swept round the left side over 0.9 s, held right out
					var a := clampf(tt / 0.9, 0.0, 1.0) * PI * 0.97
					var d := f0.rotated(Vector3.UP, a)
					main.stick_vec = _toward(b.at + d * 6.0, 1.0)
				2:
					# forward, let go for 0.45 s, then back softly-to-full: braking, no spin
					if tt < 0.15: main.stick_vec = _toward(b.at + f0 * 6.0, 1.0)
					elif tt < 0.6: main.stick_vec = Vector2.ZERO
					else: main.stick_vec = _toward(b.at + bk * 6.0, 1.0)
			if b.spin_t > 0.18 and not _tk.shot: _tk.shot = true; _shot("spin")
			if b.spin_t >= 0.0: _tk.vmin = minf(_tk.vmin, absf(b.v))
			if tt > 1.6:
				var turned := absf(wrapf(b.yaw - (_tk.y0 + PI), -PI, PI))
				match phase:
					0:
						_check(b.spins == _tk.n0 + 1 and turned < 0.35 and b.v >= _tk.v0 * 0.55, "the 180: a quick flick forward -> back spun him round (%d spin), and with the stick still held back he rode straight on the new way (facing %.2f rad off the reverse, no second spin or u-turn) at %.1f m/s (from %.1f)" % [b.spins - _tk.n0, turned, b.v, _tk.v0])
						_check(_tk.get("cam", 9.0) < deg_to_rad(15.0), "the camera swung round with the spin: %.1f degrees off behind him as he landed" % rad_to_deg(_tk.get("cam", 9.0)))
					1: _check(b.spins == _tk.n0, "a slow sweep of the stick round the side: no spin (%d)" % [b.spins - _tk.n0])
					2: _check(b.spins == _tk.n0, "letting go, then pulling back: no spin (%d)" % [b.spins - _tk.n0])
				phase += 1; ph_t = 0.0; ph_f = 0
		3, 4:
			# the same stretch without and with the wheelie: the same speed
			var on := phase == 4
			if ph_f == 1:
				_ms_ride(fl[0], fl[1], 0.0)
				_tk.vs = 0.0; _tk.vn = 0; _tk.whmin = 9.0; _tk.wshot = false
			_follow(dt)
			main.stick_vec *= 0.9
			b._test_wheelie = on and ph_t > 0.3 and ph_t < 4.0
			if ph_t > 1.0 and ph_t < 4.0:
				_tk.vs += b.v; _tk.vn += 1
				if on: _tk.whmin = minf(_tk.whmin, b.wheelie)
				if on and ph_t > 2.0 and not _tk.wshot: _tk.wshot = true; _shot("wheelie")
			if ph_t > 4.6:
				var va: float = _tk.vs / maxf(1.0, _tk.vn)
				if not on:
					_tk.vbase = va
				else:
					_check(_tk.whmin > 0.95, "the wheelie: up and held for 3 s (lowest %.2f of up)" % _tk.whmin)
					_check(absf(va - _tk.vbase) < _tk.vbase * 0.03, "the wheelie costs no speed: %.2f m/s on average against %.2f without" % [va, _tk.vbase])
					_check(b.wheelie < 0.05, "let go: the front wheel down again (%.2f)" % b.wheelie)
				phase += 1; ph_t = 0.0; ph_f = 0
		5:
			print("RESULT %s (%d failed)" % ["PASS" if fails.is_empty() else "FAIL", fails.size()])
			for n in notes: print("  " + n)
			get_tree().quit(0 if fails.is_empty() else 1)
			phase = 99
