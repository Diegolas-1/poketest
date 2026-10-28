class_name AshBike
extends Node3D
# Ash's bicycle (made by cast.gd): where it stands, getting on and off, the riding
# itself, its sounds, the camera's share, and saving it. Numbers in
# res://tunables/bike.json; the look in res://bike/looks.json ("ash"), saved with
# the bike so a customised look stays.
#
# The bike starts on its kickstand beside the gate of Ash's house. A ("use") beside
# it: Ash steps to its left side, takes the bars, swings his right leg over the back
# and rides. A again, stopped: he gets off on the left and flicks the kickstand down;
# the bike stays there (saved). A moving: he brakes to a stop first. A door while
# riding: he parks it outside and goes in. The island menu's Bike entry (with the
# setting "Call the bike" on, off by default) brings it to him outdoors, or puts it
# away when he is on it.
#
# Riding (all numbers tunable): the stick's tilt is the pedalling (its direction
# where to go); pedalling pulls him up to cruise speed (sprint holding Run, standing
# on the pedals), easing off the stick coasts (the pedals still, the freewheel
# ticking), letting go of it brakes (a short skid stopping hard from speed; B brakes
# hard). He turns no tighter than his speed allows (no turning on the spot: stopped,
# he walks the bike round with a foot down) and leans into the turn by speed x
# turn rate. Wherever Ash can walk, the bike rides: climbs slow him (steep ones to a
# crawl, standing on the pedals), downhill runs him on up to max speed, stairs are taken
# slowly with a bump at each step; grass, tall grass and sand are slower than the paths.
# No riding into water (he stops at the edge), over the stepping stones, or indoors.
# Riding uses Ash's stamina bar (body.gd): pedalling a little, sprinting and climbing
# more, coasting gives some back; worn out, no sprint and a lower top speed, hunched
# over the bars. The jump button hops; a
# ledge is ridden off with a hop and a landing on the springs. A wall bounces him back
# a little; people in the way make him brake (they step aside).
#
# Flow: riding steady (mostly straight, pedalling on good ground, no braking, not
# climbing) builds a "flow" over flow.build seconds that raises his speed by up to
# flow.gain (eased in); sharp turns, braking, slow ground, a climb or a knock drain
# it, stopping resets it. It shows as a lower tuck, more wind, the camera pulled a
# little further back and, at full flow, faint speed lines at the screen's edges.
#
# Road assist (bike/assist.gd, the setting "Road assist"): on a road, lane or trail,
# holding the stick forward along it, the bike follows the path by itself (bends,
# forks, slowing for tight turns); steering past a small angle takes over, centring
# the stick re-engages. Cruise (the setting "Bike cruise"): a double tap forward
# keeps him riding at cruise speed with the stick let go; brake or pull back stops it.
# A faint glow under the front wheel shows the assist is steering; near a fork a
# chevron on the ground (and the island's compass) shows the branch it will take.
#
#   controls()       true while the bike has the player's controls (getting on, riding, off)
#   control(dt, dir, m, run)    main.gd: the move stick (world direction and tilt)
#   place(dt)        cast.gd: the bike and Ash posed for this frame
#   riding()         on it (getting on and off included)

const T := preload("res://tunables.gd")
const SAVE := "user://bike.save"

var game: Node3D
var cast: Node
var model: BikeModel
var rider: BikeRider
var audio: BikeAudio
var look := {}
var state := "parked"      # parked | approach | mount | ride | dismount
var st_t := 0.0
# where it is (the ground point midway between the tyres) and how it is
var at := Vector3.ZERO
var yaw := 0.0
var v := 0.0               # forward speed (m/s; a bump can make it a little negative)
var om := 0.0              # turn rate (rad/s, + = left)
var lean := 0.0            # roll (+ = to the right; the kickstand side, left, is negative)
var steer := 0.0
var pitch := 0.0
var wheel_f := 0.0
var wheel_r := 0.0
var crank := 0.9
var kick := 1.0            # 0 up .. 1 down
var parked_lean := -0.11
var parked_steer := 0.32
var pedalling := false
var coasting := false
var skid_t := 0.0
var stand_k := 0.0
var foot_k := 0.0
var pull := 0.0            # the camera's pull back, eased 0..1
var hop_vy := 0.0
var squash := 0.0
var bell_t := 9.0
var dismount_want := false
var after_dismount := Callable()
var _was_ground := true
var _land_vy := 0.0
var _toast_t := 0.0
var _plank := 0.0
var _free_t := 0.0
var _approach_from := Vector3.ZERO
var _block_said := 0.0
var _fresh := false
var toast: UIToaster
var stats := {"us": 0.0, "blocks": 0}
var hud_layer: CanvasLayer
var assist: BikeAssist
var flow := 0.0            # 0..1 eased (what the speed and the looks use)
var flow_raw := 0.0        # 0..1 linear (what builds and drains)
var flow_why := ""         # what drained it this frame (tests)
var cruise := false
var assisting := false
var goal_override := Vector3.INF   # (tests: a goal for the assist's routing)
var _test_brake := false
var _clock := 0.0
var _fwd_was := false
var _fwd_at := -9.0
var _cruise_said := false

# tunables
var CRUISE := T.num("bike", "cruise_speed", 9.0)
var THR_FULL := T.num("bike", "throttle_full", 0.65)
var SPRINT := T.num("bike", "sprint_speed", 10.6)
var VMAX := T.num("bike", "max_speed", 12.0)
var ACCEL := T.num("bike", "accel", 4.2)
var SPRINT_ACCEL := T.num("bike", "sprint_accel", 5.6)
var COAST := T.num("bike", "coast_decel", 0.32)
var DRAG := T.num("bike", "drag", 0.006)
var BRAKE := T.num("bike", "brake_decel", 6.0)
var BRAKE_HARD := T.num("bike", "brake_hard", 9.5)
var SKID_V := T.num("bike", "skid_speed", 5.5)
var SKID_T := T.num("bike", "skid_time", 0.38)
var R_MIN := T.num("bike", "turn_r_min", 1.3)
var R_K := T.num("bike", "turn_r_k", 0.045)
var OM_MAX := T.num("bike", "turn_rate_max", 2.6)
var TURN_GAIN := T.num("bike", "turn_gain", 2.6)
var TURN_RESP := T.num("bike", "turn_resp", 7.0)
var PIVOT := T.num("bike", "pivot_rate", 1.7)
var CARVE := T.num("bike", "carve_decel", 0.0)
var CARVE_V := T.num("bike", "carve_from", 5.0)
var CARVE_E := T.num("bike", "carve_angle", 1.2)
var LEAN_GAIN := T.num("bike", "lean_gain", 0.85)
var LEAN_MAX := T.num("bike", "lean_max", 0.6)
var SLOPE := T.num("bike", "slope_gain", 0.75)
var SURF_MULT := T.dict("bike", "surface_mult", {"dirt": 1.0, "stone": 1.0, "wood": 1.0, "grass": 0.84, "tallgrass": 0.68, "sand": 0.55, "water": 0.4})
var SURF_DRAG := T.dict("bike", "surface_drag", {"dirt": 0.0, "stone": 0.0, "wood": 0.0, "grass": 0.35, "tallgrass": 0.8, "sand": 1.6, "water": 3.0})
var HOP_VY := T.num("bike", "hop_vy", 4.1)
var LEDGE_VY := T.num("bike", "ledge_vy", 3.4)
var STEP_MAX := T.num("bike", "step_max", 0.2)
var STAIR_V := T.num("bike", "stairs_speed", 2.6)
var SLOPE_FREE := T.num("bike", "slope_free", 0.04)
var SLOPE_SLOW := T.num("bike", "slope_slow", 2.2)
var SLOPE_MIN := T.num("bike", "slope_min_speed", 0.18)
var ST := T.dict("bike", "stamina", {})
var ST_FLAT := float(ST.get("drain_flat", 0.008))
var ST_SPRINT := float(ST.get("drain_sprint", 0.016))
var ST_CLIMB := float(ST.get("drain_climb", 0.1))
var ST_CLIMB_MAX := float(ST.get("climb_max", 0.35))
var ST_REGEN := float(ST.get("regen_coast", 0.04))
var ST_REGEN_STOP := float(ST.get("regen_stop", 0.12))
var FAT_SPEED := float(ST.get("fatigued_speed", 0.72))
var FAT_CLIMB := float(ST.get("fatigued_climb", 1.5))
var FAT_HUNCH := float(ST.get("fatigued_hunch", 0.16))
var BUMP := T.num("bike", "bump_back", 0.28)
var NPC_BRAKE := T.num("bike", "npc_brake", 4.0)
var MOUNT_T := T.num("bike", "mount_time", 0.62)
var DISMOUNT_T := T.num("bike", "dismount_time", 0.66)
var CAM_PULL := T.num("bike", "cam_pull", 1.5)
var CAM_DROP := T.num("bike", "cam_drop", 0.05)
var CAM_FOLLOW := T.num("bike", "cam_follow", 1.6)
var CAM_LAG := T.num("bike", "cam_lag", 7.0)
var CAM_SWING := T.num("bike", "cam_swing_max", 99.0)
var CAM_FOV := T.num("bike", "cam_fov", 0.0)
var CAM_FOV_FROM := T.num("bike", "cam_fov_from", 8.5)
var LINES_V: Array = T.file("bike").get("speed_lines", [99.0, 100.0])
var BELL_GAP := T.num("bike", "bell_gap", 0.35)
var FL := T.dict("bike", "flow", {})
var FLOW_GAIN := float(FL.get("gain", 0.18))
var FLOW_VMAX := float(FL.get("max_speed", 13.0))
var FLOW_BUILD := float(FL.get("build", 5.5))
var FLOW_YAW := float(FL.get("yaw_ok", 0.22))
var FLOW_YAW_DRAIN := float(FL.get("yaw_drain", 0.55))
var FLOW_SLOPE := float(FL.get("slope_max", 0.06))
var FLOW_SURF := float(FL.get("surface_min", 0.97))
var FLOW_D_TURN := float(FL.get("drain_turn", 0.9))
var FLOW_D_BRAKE := float(FL.get("drain_brake", 1.6))
var FLOW_D_SURF := float(FL.get("drain_surface", 0.7))
var FLOW_D_UP := float(FL.get("drain_uphill", 0.5))
var FLOW_D_EASE := float(FL.get("drain_ease", 0.15))
var FLOW_RESET_V := float(FL.get("reset_speed", 2.0))
var FLOW_TUCK := float(FL.get("tuck", 0.08))
var FLOW_CAM := float(FL.get("cam_pull", 0.6))
var FLOW_LINES := float(FL.get("lines_from", 0.85))
var AS := T.dict("bike", "assist", {})
var CRUISE_TILT := float(AS.get("cruise_tilt", 0.9))
var DBL_TAP := float(AS.get("double_tap", 0.4))
var ASSIST_BRAKE := float(AS.get("brake", 4.5))
var surface := "dirt"

func setup(g: Node3D, c: Node) -> void:
	name = "AshBike"
	game = g
	cast = c
	_fresh = OS.get_cmdline_user_args().has("--fresh-bike")
	var sv := _load()
	look = BikeModel.look(sv.get("look", "ash"))
	model = BikeModel.new()
	model.name = "Model"
	add_child(model)
	model.build(look)
	var gear = T.file("bike").get("gear")
	if gear is Array and gear.size() == 2: model.teeth = [int(gear[0]), int(gear[1])]
	rider = BikeRider.new(cast.player, model)
	rider.fit_bike()
	audio = BikeAudio.new()
	add_child(audio)
	var home: Array = T.file("bike").get("parked", [-18.0, -18.45, -1.69])
	var pk: Array = sv.get("at", home)
	# the game ended with him riding: he rode it home (he starts the day at home)
	if bool(sv.get("riding", false)): pk = home
	at = Vector3(float(pk[0]), 0.0, float(pk[1]))
	yaw = float(pk[2])
	crank = float(sv.get("crank", 0.9))
	parked_steer = float(sv.get("steer", 0.32))
	at.y = _ground(at)
	assist = BikeAssist.new()
	assist.set_turn(R_MIN, R_K, OM_MAX)
	_hud()
	_pose_parked()

# ---------- saving ----------
func _load() -> Dictionary:
	if _fresh or not FileAccess.file_exists(SAVE): return {}
	var j = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	return j if j is Dictionary else {}

func save() -> void:
	if _fresh: return
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	if f == null: return
	var lk := look.duplicate()
	f.store_string(JSON.stringify({"v": 1, "at": [snappedf(at.x, 0.01), snappedf(at.z, 0.01), snappedf(yaw, 0.001)],
		"crank": snappedf(crank, 0.01), "steer": snappedf(parked_steer, 0.01), "riding": riding(), "look": lk}))

# ---------- what others ask ----------
func riding() -> bool: return state in ["mount", "ride", "dismount"]
func controls() -> bool: return state != "parked"
func places_player() -> bool: return riding()
func can_ride() -> bool: return state == "ride"

# the camera's share (main.gd): how far back it pulls and how it follows
func cam_pull() -> float: return pull * CAM_PULL + flow * FLOW_CAM
func cam_drop() -> float: return pull * CAM_DROP
# the field of view widens a little with speed (degrees added; eased, so no pumping)
var _fov_k := 0.0
func cam_fov() -> float: return CAM_FOV * _fov_k * _fov_k * (3.0 - 2.0 * _fov_k)

# the parked bike's capsule, for walkers (main.gd: Ash; life.gd: the townspeople)
func capsule() -> Array:
	var f := Vector3(sin(yaw), 0, cos(yaw))
	return [at + f * model.WB * 0.5, at - f * model.WB * 0.5, 0.2]

func push_out(p: Vector3, r := 0.32) -> Vector3:
	if state != "parked" or not visible: return p
	var c := capsule()
	var a: Vector3 = c[0]; var b: Vector3 = c[1]
	var ab := Vector2(b.x - a.x, b.z - a.z)
	var ap := Vector2(p.x - a.x, p.z - a.z)
	var u := clampf(ap.dot(ab) / ab.length_squared(), 0.0, 1.0)
	var q := Vector2(a.x, a.z) + ab * u
	var d := Vector2(p.x, p.z) - q
	var m: float = float(c[2]) + r
	if d.length() < m and d.length() > 1e-4:
		var n := q + d.normalized() * m
		return Vector3(n.x, p.y, n.y)
	return p

# the A prompt beside the parked bike (cast.gd nearby)
func near_prompt(me: Vector3) -> Dictionary:
	if state != "parked" or game.indoors or not visible: return {}
	var c := capsule()
	var a: Vector3 = c[0]; var b: Vector3 = c[1]
	var ab := b - a
	var u := clampf((me - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
	var d := Vector2(me.x - (a.x + ab.x * u), me.z - (a.z + ab.z * u)).length()
	if d > 1.5: return {}
	return {"label": "Ride", "bike": true, "at": at + Vector3(0, 1.35 * model.s, 0), "d": d}

# ---------- getting on ----------
func start_mount() -> void:
	if state != "parked": return
	state = "approach"
	st_t = 0.0
	v = 0.0
	_approach_from = game.pos
	game.speed = 0.0

func _side_world() -> Vector3:
	return Transform3D(Basis(Vector3.UP, yaw), at) * rider.side_spot

func _step_approach(dt: float) -> void:
	st_t += dt
	var to := _side_world()
	var d := Vector2(to.x - game.pos.x, to.z - game.pos.z)
	if d.length() > 0.06 and st_t < 2.5:
		var want := atan2(d.x, d.y)
		game.yaw += wrapf(want - game.yaw, -PI, PI) * (1.0 - exp(-dt * 14.0))
		var stp := minf(d.length(), dt * 3.2)
		var np: Vector3 = game.pos + Vector3(d.x, 0, d.y).normalized() * stp
		game.pos = Vector3(np.x, game.pos.y, np.z)
		game.speed = 3.0
		return
	# there: face the way the bike faces, then on
	game.speed = 0.0
	game.pos = Vector3(to.x, game.pos.y, to.z)
	var e := wrapf(yaw - game.yaw, -PI, PI)
	game.yaw += e * (1.0 - exp(-dt * 16.0))
	if absf(e) < 0.12 or st_t > 3.0:
		game.yaw = yaw
		state = "mount"
		st_t = 0.0
		rider.mounting = true
		rider.mount = 0.0
		rider.on = 1.0
		cast.player.rider = rider
		# the right pedal up and forward, ready to push off
		crank = 0.95
		Sfx.play("cloth_rustle", game.pos, {"vol": -10.0})

# ---------- getting off ----------
func request_dismount() -> void:
	if state != "ride": return
	if absf(v) < 0.8: _start_dismount()
	else: dismount_want = true

func _start_dismount() -> void:
	state = "dismount"
	st_t = 0.0
	dismount_want = false
	rider.mounting = false
	v = 0.0
	_calm()

func _end_dismount() -> void:
	state = "parked"
	if cast.body: cast.body.ride_rate = NAN
	rider.on = 0.0
	rider.mount = 0.0
	rider.kick_foot = 0.0
	cast.player.rider = null
	if cast.player.cloth: cast.player.cloth.obstacles = []
	var s := _side_world()
	game.pos = Vector3(s.x, game.world.ash_ground(s.x, s.z), s.z)
	game.yaw = yaw
	game.speed = 0.0
	cast.land(game.pos.y)
	parked_steer = steer
	audio.stop_all()
	_pose_parked()
	save()
	if after_dismount.is_valid():
		var f := after_dismount
		after_dismount = Callable()
		f.call()

# put away at once (a door, the menu): he stands beside it, it stays here on its stand
func park_now() -> void:
	if not riding(): return
	_calm()
	v = 0.0
	kick = 1.0
	lean = parked_lean
	_end_dismount()
	_pose_parked()

# ---------- the island menu's Bike button ----------
func menu_toggle() -> void:
	if game.indoors: return
	if riding():
		request_dismount()
		return
	if state != "parked": return
	if int(Settings.get_value("bike_call")) != 1: return
	var me: Vector3 = game.pos
	# put the bike where his mounting spot is right here, facing the way he faces
	for k in [0.0, 0.6, -0.6, 1.2, -1.2, PI]:
		var y: float = game.yaw + k
		var root := me - Basis(Vector3.UP, y) * rider.side_spot
		if _room_for(root, y):
			at = root
			at.y = _ground(at)
			yaw = y
			kick = 1.0
			_pose_parked()
			Sfx.play("whoosh", null, {"vol": -12.0, "pitch": 1.3})
			Sfx.play("bike_bell", at, {"vol": -6.0})
			start_mount()
			return
	say("No room for the bike here")

func _room_for(root: Vector3, y: float) -> bool:
	var W = game.world
	var f := Vector3(sin(y), 0, cos(y))
	for p in [root, root + f * model.WB * 0.5, root - f * model.WB * 0.5]:
		var fl: int = W.flag(p.x, p.z)
		if fl == 255 or (fl & 1 and not fl & 4) or (fl & 2): return false
		var c: Vector3 = W.collide(p, 0.22)
		if Vector2(c.x - p.x, c.z - p.z).length() > 0.01: return false
	return absf(W.height_at(root.x + f.x * 0.5, root.z + f.z * 0.5) - W.height_at(root.x - f.x * 0.5, root.z - f.z * 0.5)) < 0.3

# ---------- the bell, the hop ----------
func ring() -> void:
	if not riding() or bell_t < BELL_GAP: return
	bell_t = 0.0
	Sfx.play("bike_bell", model.global_transform * model.grip(1.0), {"vol": -3.0})

func hop() -> void:
	if state != "ride" or not cast.ground: return
	cast.vy = HOP_VY
	cast.ground = false
	Sfx.play("whoosh", null, {"vol": -18.0, "pitch": 1.6})

# ---------- riding: the controls (main.gd, before cast.update) ----------
func control(dt: float, dir: Vector2, m: float, run: bool) -> void:
	var t0 := Time.get_ticks_usec()
	bell_t += dt
	if cast and cast.body: cast.body.ride_rate = NAN if state != "ride" else 0.0
	match state:
		"approach": _step_approach(dt)
		"mount":
			st_t += dt
			game.speed = 0.0
			game.pos = Vector3(at.x, game.pos.y, at.z)
			game.yaw = yaw
			if st_t >= MOUNT_T:
				state = "ride"
				rider.mount = 1.0
		"dismount":
			st_t += dt
			game.speed = 0.0
			game.pos = Vector3(at.x, game.pos.y, at.z)
			if st_t >= DISMOUNT_T: _end_dismount()
		"ride": _ride(dt, dir, m, run)
	stats.us = Time.get_ticks_usec() - t0

var _save_t := 0.0
func _ride(dt: float, dir: Vector2, m: float, run: bool) -> void:
	var W = game.world
	_save_t += dt
	if _save_t > 10.0:
		_save_t = 0.0
		save()   # (riding: if the game ends now, the bike goes home with him)
	var busy: bool = cast.busy()
	if busy: m = 0.0
	var brake_btn := (Input.is_action_pressed("back") or _test_brake) and not busy
	var f := Vector3(sin(yaw), 0, cos(yaw))
	_clock += dt
	# the stick relative to the camera: 0 straight ahead, + to the left
	var cy: float = game.cam_yaw
	var stick_rel := wrapf(atan2(dir.x, dir.y) - (cy + PI), -PI, PI) if m > 0.05 else 0.0
	# cruise: a double tap forward rides on at cruise with the stick let go
	var fwd := m > 0.6 and absf(stick_rel) < 0.6
	if fwd and not _fwd_was:
		if _clock - _fwd_at < DBL_TAP and int(Settings.get_value("bike_cruise")) == 1 and not busy:
			cruise = true
			if not _cruise_said: _cruise_said = true; say("Cruising: brake or pull back to stop", "info")
		_fwd_at = _clock
	_fwd_was = fwd
	if cruise and (brake_btn or busy or dismount_want or (m > 0.5 and absf(stick_rel) > 2.2)): cruise = false
	var stick_held := m > 0.08
	if cruise and not stick_held:
		dir = Vector2(f.x, f.z)
		m = CRUISE_TILT
	var ground: bool = cast.ground
	surface = _surface(at)
	var smul: float = float(SURF_MULT.get(surface, 1.0))
	var sdrag: float = float(SURF_DRAG.get(surface, 0.0))
	# where the stick points (heading error), how hard (throttle)
	var e := 0.0
	if m > 0.05: e = wrapf(atan2(dir.x, dir.y) - yaw, -PI, PI)
	var thr := minf(1.0, m / maxf(THR_FULL, 0.05))
	var pivot := false
	# pinned against something with the stick into it: walk the bike round toward the
	# nearest way out (the side the stick leans to first), whatever the stick's angle
	if _away_t > 0.0:
		_away_t -= dt
		var ea := wrapf(_away_yaw - yaw, -PI, PI)
		# (turned that way: ride on along it for the rest of the time, so the stick's pull
		# back into the wall does not turn him straight back into it)
		if m < 0.3: _away_t = 0.0
		else: e = ea
	elif _blocked_t > 0.0 and absf(v) < 0.7 and m > 0.3 and absf(e) <= 0.25 and not busy:
		var ang := _way_out(e)
		if ang != 0.0:
			_away_yaw = wrapf(yaw + ang, -PI, PI)
			_away_t = 1.2
			e = ang
	# (walking it round to a way out: right round to it, so the front wheel clears what pinned him)
	if absf(v) < 0.7 and m > 0.3 and absf(e) > (0.08 if _away_t > 0.0 else (0.25 if _blocked_t > 0.0 else 0.4)):
		pivot = true      # walking the bike round, stopped: no pedalling yet
		thr = 0.0
	elif absf(e) > 2.2 and v > 2.0:
		thr = 0.0         # pulling right back: coast and turn (no u-turn on the spot)
	# worn out (body.gd's fatigue): no sprint, a lower top speed, slow climbing
	var tired := _tired()
	# the slope along the way (+ uphill), eased so a deck's steps read as a ramp
	var hf: float = W.height_at(at.x + f.x * 0.5, at.z + f.z * 0.5)
	var hb: float = W.height_at(at.x - f.x * 0.5, at.z - f.z * 0.5)
	var slope_now := clampf((hf - hb) / 1.0, -0.6, 0.6) if ground else 0.0
	_slope_s += (slope_now - _slope_s) * (1.0 - exp(-dt * 8.0))
	var slope := _slope_s if ground else 0.0
	var sprint := run and thr > 0.5 and not tired
	var target := (SPRINT if sprint else CRUISE) * smul * thr
	if tired: target *= FAT_SPEED
	# uphill slows him (steep: a crawl), smoothly; downhill only the speed cap holds him
	var climb := maxf(0.0, slope - SLOPE_FREE)
	if climb > 0.0: target *= maxf(SLOPE_MIN, 1.0 - SLOPE_SLOW * (FAT_CLIMB if tired else 1.0) * climb)
	# flow: riding steady lifts the speed a little (eased in over seconds)
	target *= 1.0 + FLOW_GAIN * flow
	# the road assist: following the path he is on (bike/assist.gd)
	assisting = false
	if int(Settings.get_value("bike_assist")) == 1 and assist.ok() and ground and not pivot:
		var gp: Vector3 = Vector3.INF
		var isl = game.get("island")
		if isl and isl.has_goal: gp = isl._goal_pos
		if goal_override != Vector3.INF: gp = goal_override
		assist.set_goal(gp, int(Settings.get_value("bike_goal")) == 1)
		var sw := Vector2(dir.x, dir.y).normalized() if m > 0.05 else Vector2.ZERO
		assisting = assist.update(dt, at, yaw, v, sw, 0.0 if (cruise and not stick_held) else stick_rel, m if stick_held else 0.0, cruise)
	elif assist.active:
		assist.active = false
	if assisting:
		target = minf(target, assist.v_limit)
	# a carve: a very sharp turn at speed scrubs speed (no pedalling) so the turn stays tight
	var carve := 0.0
	if not assisting and v > CARVE_V and absf(e) > CARVE_E and not pivot:
		carve = clampf((absf(e) - CARVE_E) / 0.5, 0.0, 1.0) * clampf((v - CARVE_V) / 2.0, 0.0, 1.0)
		target = minf(target, v * (1.0 - 0.5 * carve))
	# people ahead: brake for them
	target = minf(target, _people_limit(f))
	# the stepping stones are for walking: brake to a stop before them
	var stones_lim := 1e9
	var sd := 0.9
	var s_reach := 0.9 + maxf(v, 0.0) * maxf(v, 0.0) / (1.6 * BRAKE) + 1.0
	while sd <= s_reach:
		var probe := at + f * sd
		if assist.walk_only(Vector2(probe.x, probe.z), 1.1):
			stones_lim = sqrt(1.6 * BRAKE * maxf(0.0, sd - 0.9))
			target = minf(target, stones_lim)
			if sd < 0.9 + absf(v) * 0.32:
				target = 0.0
				cruise = false
				if v > 0.3 and _toast_t <= 0.0: say("The bike stays out of the water")
			break
		sd += 0.5
	# water, stairs or a wall right ahead: ease off before it
	var look_d := 0.75 + absf(v) * 0.32
	var ahead: Vector3 = at + f * look_d
	var fl: int = W.flag(ahead.x, ahead.z)
	if fl != 255 and (fl & 1) and not (fl & 4):
		target = minf(target, maxf(0.0, (look_d - 0.85) * 2.0))
		if v > 0.5 and _toast_t <= 0.0: say("The bike stays out of the water")
	# stairs (a step higher than step_max) ahead or under him: slow and bumpy over them
	var st_d := _stairs_ahead(f)
	var slow_lim := 1e9
	var slow_dec := ASSIST_BRAKE
	if st_d < 1e8 or _rough_t > 0.0:
		slow_lim = STAIR_V if _rough_t > 0.0 else sqrt(STAIR_V * STAIR_V + 1.6 * BRAKE * maxf(0.0, st_d - 0.6))
		target = minf(target, slow_lim)
		slow_dec = BRAKE
	if stones_lim < slow_lim: slow_lim = stones_lim; slow_dec = BRAKE
	if assisting and assist.v_limit < slow_lim: slow_lim = assist.v_limit; slow_dec = ASSIST_BRAKE
	var a := 0.0
	var released := m < 0.08
	pedalling = false
	var bend_brake := v > slow_lim + 0.3 and not brake_btn
	if brake_btn:
		a = -BRAKE_HARD * signf(v)
		if v > SKID_V * 0.75 and skid_t <= 0.0: _skid()
	elif released or busy or dismount_want:
		a = -BRAKE * signf(v)
		if v > SKID_V and skid_t <= 0.0 and (released or dismount_want): _skid()
	elif v < target - 0.15:
		pedalling = true
		var acc := SPRINT_ACCEL if sprint else ACCEL
		a = acc * clampf((target - v) / 2.5 + 0.25, 0.25, 1.0)
	elif bend_brake:
		a = -slow_dec * (1.0 if slow_dec == BRAKE else clampf((v - slow_lim) / 1.5, 0.3, 1.0))   # the assist slowing for a bend, or for stairs
	elif v > target + 0.4:
		a = -0.5 if thr < 0.5 else 0.0   # easing off: coast down to it (a downhill may still run him on)
	else:
		pedalling = target > 0.5
		a = (target - v) * 2.0
	# rolling resistance on soft ground, gravity on slopes (only on the ground)
	if ground:
		a -= (COAST * (0.0 if pedalling else 1.0) + sdrag + DRAG * v * v) * signf(v) if absf(v) > 0.05 else 0.0
		if not pivot: a -= 9.8 * sin(atan(slope)) * SLOPE   # (walking it round, he holds it)
		a -= CARVE * carve
	if not ground: a = 0.0
	var v0 := v
	v += a * dt
	# braking never reverses (only a bump rolls him back), and stopped with the brakes on he stays
	if not _bumping:
		if v0 >= 0.0 and v < 0.0: v = 0.0
		if (released or brake_btn or pivot or target < 0.05) and absf(v) < 0.3: v = 0.0
	if _bumping:
		v = move_toward(v, 0.0, dt * 4.0)
		if absf(v) < 0.05: _bumping = false; v = 0.0
	v = clampf(v, -2.0, lerpf(VMAX, FLOW_VMAX, flow))
	# (the assist's light braking for a gentle bend keeps the flow; a hard slow-down drains it)
	_flow_step(dt, ground, thr, brake_btn or (released and not cruise) or (bend_brake and v > slow_lim + 2.5), smul, slope)
	_stamina(dt, sprint, slope, tired)
	if _rough_t > 0.0: _rough_t -= dt
	coasting = not pedalling and v > 0.5 and not brake_btn
	if skid_t > 0.0: skid_t -= dt
	if _blocked_t > 0.0: _blocked_t -= dt
	# turning: no tighter than the speed allows; stopped, walk it round
	var om_t := 0.0
	if pivot:
		om_t = signf(e) * PIVOT
	elif absf(v) > 0.3:
		var rmin := R_MIN + R_K * v * v
		var om_max := minf(absf(v) / rmin, OM_MAX)
		om_t = clampf(e * TURN_GAIN, -om_max, om_max) * signf(v)
		if assisting and v > 0.0: om_t = clampf(assist.om_target, -om_max, om_max)
		if skid_t > 0.0: om_t *= 0.4
	om += (om_t - om) * (1.0 - exp(-dt * (10.0 if pivot else TURN_RESP)))
	yaw = wrapf(yaw + om * dt, -PI, PI)
	f = Vector3(sin(yaw), 0, cos(yaw))
	# a ledge under the front wheel, going down it: the hop off (cast.gd lands him)
	var ff: Vector3 = at + f * (model.WB * 0.5)
	var lf: int = W.flag(ff.x, ff.z)
	if ground and v > 0.6 and lf != 255 and (lf & 32) and f.z > 0.2 and not _ledged:
		_ledged = true
		cast.vy = LEDGE_VY
		cast.ground = false
		Sfx.play("whoosh", null, {"vol": -16.0, "pitch": 1.4})
	if ground and not (lf != 255 and (lf & 32)) and not (W.flag(at.x, at.z) & 32): _ledged = false
	# move, blocked by the world (flags, colliders, ledges, no water)
	var want := f * v * dt
	if want.length() > 1e-5: _move(want, f)
	# lean into the turn (speed x turn rate), the pedals' rocking standing, a foot down stopped
	var lt := -LEAN_MAX * tanh(atan(v * om / 9.8) * LEAN_GAIN / LEAN_MAX)   # (eases into its cap)
	var stopped := absf(v) < 0.45 and (released or pivot or busy)
	foot_k = move_toward(foot_k, 1.0 if stopped else 0.0, dt * (3.5 if stopped else 6.0))
	var stand_want := 1.0 if (pedalling and (sprint and v < SPRINT - 1.0 or slope > 0.09 and v < CRUISE * 0.8)) else 0.0
	stand_k += (stand_want - stand_k) * (1.0 - exp(-dt * 4.0))
	lt += sin(crank) * 0.07 * stand_k
	lt = lerpf(lt, -0.1, foot_k)
	lean += (lt - lean) * (1.0 - exp(-dt * 6.0))
	var st_want := atan(model.WB * om / maxf(absf(v), 1.2)) if not pivot else signf(e) * 0.45
	st_want = clampf(st_want, -0.55, 0.55)
	steer += (st_want - steer) * (1.0 - exp(-dt * 10.0))
	# the wheels and the cranks
	var wv := v / model.R
	wheel_f += wv * dt
	if skid_t <= 0.0: wheel_r += wv * dt
	var ratio := float(model.teeth[0]) / float(model.teeth[1])
	if pedalling and (v > 0.05 or not _blocked_t > 0.0): crank += maxf(wv, 0.9 if v < 0.05 else 0.0) / ratio * dt
	elif coasting or stopped:
		# coasting: the pedals level, the left one forward
		var lvl := PI * 0.5 + PI * roundf((crank - PI * 0.5) / PI)
		crank = move_toward(crank, lvl, dt * 1.5)
	game.speed = maxf(v, 0.0)
	game.pos = Vector3(at.x, game.pos.y, at.z)
	game.yaw = yaw
	if dismount_want and absf(v) < 0.8: _start_dismount()
	_surface_fx(dt)

var _bumping := false
var _ledged := false

# off the bike (or put away): no flow, no cruise, no assist
func _calm() -> void:
	cruise = false
	flow = 0.0
	flow_raw = 0.0
	assisting = false
	if assist: assist.active = false

# flow: builds while riding steady, drains on bends, brakes, slow ground and climbs
func _flow_step(dt: float, ground: bool, thr: float, braking: bool, smul: float, slope: float) -> void:
	if v < FLOW_RESET_V or _bumping or skid_t > 0.0:
		flow_raw = 0.0 if v < FLOW_RESET_V or _bumping else maxf(0.0, flow_raw - FLOW_D_BRAKE * dt)
	elif not ground:
		pass   # (a hop keeps it)
	else:
		var drain := 0.0
		flow_why = ""
		if braking: drain = FLOW_D_BRAKE; flow_why = "brake"
		if absf(om) > FLOW_YAW_DRAIN: drain = maxf(drain, FLOW_D_TURN * minf(2.0, absf(om) / FLOW_YAW_DRAIN)); flow_why += " turn"
		if smul < FLOW_SURF: drain = maxf(drain, FLOW_D_SURF); flow_why += " ground"
		if slope > FLOW_SLOPE: drain = maxf(drain, FLOW_D_UP); flow_why += " climb"
		if thr < 0.5: drain = maxf(drain, FLOW_D_EASE); flow_why += " ease"
		if drain > 0.0: flow_raw = maxf(0.0, flow_raw - drain * dt)
		elif absf(om) < FLOW_YAW and pedalling or (absf(om) < FLOW_YAW and v > CRUISE * 0.9): flow_raw = minf(1.0, flow_raw + dt / FLOW_BUILD)
		# (a gentle bend between yaw_ok and yaw_drain holds it)
	flow = flow_raw * flow_raw * (3.0 - 2.0 * flow_raw)

# where the island's compass should point while the assist has a fork coming up
func route_hint() -> Variant:
	if not assisting or state != "ride": return null
	return assist.hint()

func _move(want: Vector3, f: Vector3) -> void:
	var W = game.world
	var n := maxi(1, ceili(want.length() / 0.1))
	var stp := want / n
	for i in n:
		var p := at
		var np: Vector3 = W.step(p, stp.x, stp.z, false)
		var moved := Vector2(np.x - p.x, np.z - p.z).length()
		var full := Vector2(stp.x, stp.z).length()
		# the front wheel (going forward) or the back one (rolling back) into something
		var tip := np + f * (model.WB * 0.5 + model.R * 0.6) * signf(v)
		var tipc: Vector3 = W.collide(tip, 0.1)
		var tip_hit := Vector2(tipc.x - tip.x, tipc.z - tip.z).length() > 0.02
		var tfl: int = W.flag(tip.x, tip.z)
		if tfl == 255 or (tfl & 2 and not W.flag(p.x, p.z) & 2): tip_hit = true
		# a townsperson's parked bike
		var cy = cast.life.cyclists if cast.life else null
		if cy and (cy.blocks(tip) or cy.blocks(np)): tip_hit = true
		if assist.walk_only(Vector2(tip.x, tip.z), 0.6): tip_hit = true
		# (no steepness lock: anywhere Ash can walk, the bike rides; a step higher than
		# step_max (stairs) is ridden slowly with a bump, see _stairs_ahead)
		var h0: float = W.height_at(p.x, p.z)
		var h1: float = W.height_at(np.x, np.z)
		var ledge: bool = (int(W.flag(np.x, np.z)) & 32) != 0 or (int(W.flag(p.x, p.z)) & 32) != 0
		if absf(h1 - h0) > STEP_MAX and not (ledge and h1 < h0) and moved > 0.0:
			_rough_t = 0.35
			squash = maxf(squash, 0.3)
			Sfx.play("land_metal", null, {"vol": -20.0, "pitch": 1.7})
		# (at a crawl the world's push-out of a body just touching something is bigger than
		# the step itself: that is not a wall in the way, the tip check says so)
		if tip_hit or moved < full * 0.35 - 0.006:
			# a glancing touch: slide along it (turned a little away), else stop or bounce
			if v > 0.05 and _slide(stp, f):
				# (nosing along something at a walk counts as pinned: he picks a way out
				# and keeps to it, instead of turning back into it after every scrape)
				if absf(v) < 0.7: _blocked_t = maxf(_blocked_t, 0.4)
				continue
			_blocked()
			return
		# slid along a wall: lose the speed into it
		if moved < full * 0.9 - 0.006 and v > 0.0: v *= lerpf(0.6, 1.0, moved / full)
		at = Vector3(np.x, at.y, np.z)

# try the step turned a little either way: the side that goes takes the bike along the
# edge (it scrapes: some speed lost, the heading eased that way)
func _slide(stp: Vector3, f: Vector3) -> bool:
	var W = game.world
	for ang in [0.45, -0.45, 0.9, -0.9]:
		var d := stp.rotated(Vector3.UP, ang)
		var np: Vector3 = W.step(at, d.x, d.z, false)
		var moved := Vector2(np.x - at.x, np.z - at.z).length()
		if moved < d.length() * 0.6: continue
		var fd := Vector3(d.x, 0, d.z).normalized()
		var tip := np + fd * (model.WB * 0.5 + model.R * 0.6)
		var tc: Vector3 = W.collide(tip, 0.1)
		if Vector2(tc.x - tip.x, tc.z - tip.z).length() > 0.02: continue
		var tf: int = W.flag(tip.x, tip.z)
		if tf == 255 or (tf & 1 and not tf & 4): continue
		at = Vector3(np.x, at.y, np.z)
		yaw = wrapf(yaw + ang * 0.18, -PI, PI)
		v *= 0.97 if absf(ang) < 0.6 else 0.9
		return true
	return false

var _blocked_t := 0.0
func _blocked() -> void:
	var hit := absf(v)
	_blocked_t = 0.4
	stats.blocks += 1
	cruise = false
	flow_raw = 0.0
	if absf(v) > 2.0:
		Sfx.play("hit_soft", at + Vector3(0, 0.5, 0), {"vol": -6.0 - (6.0 - minf(absf(v), 6.0)), "pitch": 1.2})
		v = -absf(v) * BUMP * signf(v)
		_bumping = true
		game.cam_shake = 0.18
	else:
		v = 0.0
	if hit > 2.0: om *= 0.3   # (a real knock; a nudge at walking pace keeps the turn going)

# worn out: body.gd's fatigue condition
func _tired() -> bool:
	var bd = cast.body if cast else null
	return bd != null and bd.cond != null and bd.cond.has("fatigue")

# stamina on the bike (body.gd reads ride_rate: + drains, - refills): pedalling costs a
# fraction of running, sprinting more, climbing more by the slope (steep: more than
# running); coasting and downhill give some back, stopped more
func _stamina(_dt: float, sprint: bool, slope: float, _tired_now: bool) -> void:
	var bd = cast.body if cast else null
	if bd == null: return
	var r := 0.0
	if pedalling:
		r = ST_SPRINT if sprint else ST_FLAT
		r += ST_CLIMB * clampf(slope - SLOPE_FREE, 0.0, ST_CLIMB_MAX)
	elif absf(v) < 0.3: r = -ST_REGEN_STOP
	else: r = -ST_REGEN
	bd.ride_rate = r

# metres to the first stairs step (a height jump over step_max) ahead, else INF
var _rough_t := 0.0
var _slope_s := 0.0
func _stairs_ahead(f: Vector3) -> float:
	var W = game.world
	var reach := minf(24.0, 0.6 + maxf(v, 0.0) * maxf(v, 0.0) / (2.0 * BRAKE) + 0.5)
	var hp: float = W.height_at(at.x, at.z)
	var lp: int = W.flag(at.x, at.z)
	var d := 0.25
	while d <= reach:
		var q := at + f * d
		var h: float = W.height_at(q.x, q.z)
		var lf: int = W.flag(q.x, q.z)
		if absf(h - hp) > STEP_MAX:
			var ledge := (lf != 255 and (lf & 32) != 0) or (lp != 255 and (lp & 32) != 0)
			if not (ledge and h < hp): return d   # (a ledge going down is a hop)
		hp = h
		lp = lf
		d += 0.25 if d < 3.0 else 0.5   # (a riser is a jump either way; further out, coarser)
	return INF

# pinned: the free direction nearest the stick (relative to the heading), 0 if none
var _away_t := 0.0
var _away_yaw := 0.0
func _way_out(e: float) -> float:
	var angs: Array = []
	for k in range(1, 11):
		angs.append(0.3 * k); angs.append(-0.3 * k)
	angs.sort_custom(func(a, b): return absf(a - e) < absf(b - e))
	for ang in angs:
		if _dir_free(yaw + ang): return ang
	return 0.0

func _dir_free(y: float) -> bool:
	# (a way out is clear for a bike length and a half, not just the first step: between
	# posts a first step may be free and the next one not)
	var W = game.world
	var d := Vector3(sin(y), 0, cos(y))
	var p := at
	for i in 5:
		var np: Vector3 = W.step(p, d.x * 0.3, d.z * 0.3, false)
		if Vector2(np.x - p.x, np.z - p.z).dot(Vector2(d.x, d.z)) < 0.22: return false   # (pushed aside: too narrow)
		p = np
		var tip := p + d * (model.WB * 0.5 + model.R * 0.6)
		var tc: Vector3 = W.collide(tip, 0.1)
		if Vector2(tc.x - tip.x, tc.z - tip.z).length() > 0.02: return false
		var tf: int = W.flag(tip.x, tip.z)
		if tf == 255 or (tf & 1 and not tf & 4) or (tf & 2 and not W.flag(at.x, at.z) & 2): return false
		if tf & 32 and d.z < 0.0: return false
	return true

func _skid() -> void:
	skid_t = SKID_T
	Sfx.play("scuff", null, {"vol": -6.0, "pitch": 0.8})

# the townspeople (and Prof. Oak) ahead: brake to keep clear of them
func _people_limit(f: Vector3) -> float:
	var lim := 1e9
	var life = cast.life
	var who: Array = []
	if life:
		for p in life.people:
			if p.state == "inside": continue
			who.append(p.pos)
		if life.companions:
			for c in life.companions.pets:
				if c.inside == "": who.append(c.pos)
	for n in cast.npcs:
		if not n.hidden: who.append(n.pos)
	if life and life.get("cyclists"):
		for b in life.cyclists.positions(): who.append(b)
	for p in who:
		var d := Vector2(p.x - at.x, p.z - at.z)
		var ahead := d.dot(Vector2(f.x, f.z))
		var side := absf(d.cross(Vector2(f.x, f.z)))
		if ahead > -0.2 and ahead < NPC_BRAKE + absf(v) * 0.4 and side < 1.1:
			lim = minf(lim, maxf(0.0, (ahead - 1.3) * 1.6))
		# right up against someone: never through them
		if d.length() < 0.75 and d.length() > 1e-3:
			var push := -d.normalized() * (0.75 - d.length())
			var np: Vector3 = game.world.step(at, push.x, push.y, false)
			at = Vector3(np.x, at.y, np.z)
	return lim

func _surface(p: Vector3) -> String:
	var sw = game.get("sfx_world")
	if sw and sw.has_method("surface_at"): return String(sw.surface_at(p))
	return "dirt"

# skid marks: the locked back tyre's streak on the ground (a few kept, fading out)
var _marks: Array = []        # [[Vector3 points], age]
var _mark_mesh: MeshInstance3D
var _mark_im: ImmediateMesh
var _mark_last := Vector3.INF
func _skid_marks(dt: float) -> void:
	if _mark_mesh == null:
		_mark_im = ImmediateMesh.new()
		_mark_mesh = MeshInstance3D.new()
		_mark_mesh.mesh = _mark_im
		_mark_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.vertex_color_use_as_albedo = true
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		_mark_mesh.material_override = m
		add_child(_mark_mesh)
		_mark_mesh.top_level = true
	var W = game.world
	var on: bool = skid_t > 0.0 and cast.ground and v > 0.4 and state == "ride" and surface != "water"
	if on:
		var f := Vector3(sin(yaw), 0, cos(yaw))
		var rp := at - f * model.WB * 0.5
		rp.y = W.height_at(rp.x, rp.z) + 0.012
		if _mark_last == Vector3.INF or _marks.is_empty() or _marks[-1][1] > 0.0:
			_marks.append([[rp], 0.0])
			if _marks.size() > 4: _marks.pop_front()
		elif rp.distance_to(_mark_last) > 0.08:
			_marks[-1][0].append(rp)
		_mark_last = rp
	else:
		_mark_last = Vector3.INF
	var any := false
	for mk in _marks:
		if not (on and mk == _marks[-1]): mk[1] += dt
		any = any or mk[1] < 9.0
	if not any:
		if not _marks.is_empty(): _marks.clear(); _mark_im.clear_surfaces()
		return
	_mark_im.clear_surfaces()
	var col := Color(0.16, 0.12, 0.1) if surface != "sand" else Color(0.45, 0.36, 0.25)
	for mk in _marks:
		var pts: Array = mk[0]
		if pts.size() < 2: continue
		var a: float = clampf(1.0 - (mk[1] - 5.0) / 4.0, 0.0, 1.0) * 0.55
		if a <= 0.0: continue
		_mark_im.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
		for i in pts.size():
			var p: Vector3 = pts[i]
			var d: Vector3 = (pts[mini(i + 1, pts.size() - 1)] - pts[maxi(i - 1, 0)])
			var side := Vector3(d.z, 0, -d.x).normalized() * 0.022
			var e := a * minf(1.0, float(i) / 2.0) * minf(1.0, float(pts.size() - 1 - i) / 2.0 + 0.4)
			_mark_im.surface_set_color(Color(col, e)); _mark_im.surface_add_vertex(p + side)
			_mark_im.surface_set_color(Color(col, e)); _mark_im.surface_add_vertex(p - side)
		_mark_im.surface_end()

func _process(dt: float) -> void:
	if state != "ride" and not _marks.is_empty(): _skid_marks(dt)   # (they fade while he is off)
	if state != "ride" and (_glow_a > 0.0 or _chev_a > 0.0 or _lines_a > 0.0): _assist_fx(dt)

# the assist's marks: a faint glow under the front wheel while it steers, a chevron on
# the ground at a fork showing the branch it will take; at full flow, speed lines
var _glow: MeshInstance3D
var _chev: MeshInstance3D
var _glow_a := 0.0
var _chev_a := 0.0
var _lines: Control
var _lines_a := 0.0
const PATH_COL := Color(1.0, 0.78, 0.3)
func _fx_make() -> void:
	# the glow: a soft oval, bright in the middle and fading to nothing at its rim
	var gm := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = "shader_type spatial;\nrender_mode unshaded, blend_mix, cull_disabled, depth_draw_never, shadows_disabled;\nuniform vec4 col : source_color;\nvoid fragment() { float r = length(UV * 2.0 - 1.0); ALBEDO = col.rgb; ALPHA = col.a * (1.0 - smoothstep(0.05, 1.0, r)); }\n"
	gm.shader = sh
	var pm := PlaneMesh.new()
	pm.size = Vector2(1.25, 1.9)
	_glow = MeshInstance3D.new()
	_glow.mesh = pm
	_glow.material_override = gm
	_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_glow.top_level = true
	_glow.visible = false
	add_child(_glow)
	# the chevron: two strokes pointing along +z, on the ground
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for sd in [-1.0, 1.0]:
		var a := Vector3(0, 0, 0.8); var b := Vector3(sd * 1.05, 0, -0.3)
		var nrm := Vector3(-(b - a).z, 0, (b - a).x).normalized() * 0.2
		for q in [a + nrm, a - nrm, b + nrm, a - nrm, b - nrm, b + nrm]: st.add_vertex(q)
	var cm := StandardMaterial3D.new()
	cm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cm.cull_mode = BaseMaterial3D.CULL_DISABLED
	cm.albedo_color = Color(PATH_COL, 0.0)
	_chev = MeshInstance3D.new()
	_chev.mesh = st.commit()
	_chev.material_override = cm
	_chev.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_chev.top_level = true
	_chev.visible = false
	add_child(_chev)
	_lines = Control.new()
	_lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lines.set_anchors_preset(Control.PRESET_FULL_RECT)
	_lines.draw.connect(_draw_lines)
	hud_layer.add_child(_lines)

func _assist_fx(dt: float) -> void:
	if _glow == null: _fx_make()
	var W = game.world
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var on := assisting and state == "ride" and visible
	_glow_a = move_toward(_glow_a, 1.0 if on else 0.0, dt * (3.0 if on else 2.0))
	if _glow_a > 0.0:
		var fp := at + f * (model.WB * 0.5 + 0.15)
		fp.y = W.height_at(fp.x, fp.z) + 0.12
		_glow.global_transform = Transform3D(Basis(Vector3.UP, yaw), fp)
		(_glow.material_override as ShaderMaterial).set_shader_parameter("col", Color(PATH_COL, 0.8 * _glow_a * (0.85 + 0.15 * sin(_clock * 4.0))))
	_glow.visible = _glow_a > 0.0
	var h = route_hint() if on else null
	var nd := Vector2.INF
	if h != null and not assist.choice.is_empty():
		nd = assist.nodes[assist.choice[0]]
	var show := h != null and Vector2(at.x, at.z).distance_to(nd) < 30.0
	_chev_a = move_toward(_chev_a, 1.0 if show else 0.0, dt * (2.5 if show else 3.0))
	if show:
		var hv: Vector3 = h
		var d2 := Vector2(hv.x - nd.x, hv.z - nd.y).normalized()
		var cp := Vector2(nd.x, nd.y) + d2 * 3.2
		var y: float = W.height_at(cp.x, cp.y) + 0.12
		_chev.global_transform = Transform3D(Basis(Vector3.UP, atan2(d2.x, d2.y)), Vector3(cp.x, y, cp.y))
	if _chev_a > 0.0:
		(_chev.material_override as StandardMaterial3D).albedo_color = Color(PATH_COL, 0.7 * _chev_a)
	_chev.visible = _chev_a > 0.0
	# speed lines: at full flow, or fast enough (speed_lines: from .. full, m/s)
	var la := clampf((flow - FLOW_LINES) / maxf(0.01, 1.0 - FLOW_LINES), 0.0, 1.0)
	la = maxf(la, clampf((v - float(LINES_V[0])) / maxf(0.5, float(LINES_V[1]) - float(LINES_V[0])), 0.0, 1.0))
	if state != "ride" or not ground_ok(): la = 0.0
	var was := _lines_a
	_lines_a = move_toward(_lines_a, la, dt * 1.5)
	if _lines_a > 0.0 or was > 0.0: _lines.queue_redraw()

func ground_ok() -> bool: return cast != null and cast.ground

func _draw_lines() -> void:
	if _lines_a <= 0.0: return
	var vs := _lines.get_viewport_rect().size
	var c := vs * 0.5
	var t := _clock
	for i in 14:
		var ang := float(i) / 14.0 * TAU + 0.2 * sin(i * 7.3)
		var d := Vector2(cos(ang), sin(ang))
		var ph := fposmod(t * 1.7 + i * 0.37, 1.0)
		var r0 := vs.length() * (0.36 + 0.1 * ph)
		var r1 := r0 + vs.length() * 0.07
		var a := _lines_a * 0.14 * sin(ph * PI)
		_lines.draw_line(c + d * Vector2(r0, r0 * 0.75), c + d * Vector2(r1, r1 * 0.75), Color(1, 1, 1, a), 2.0, true)

# dust and gravel kicked up, plank thumps, the recorded freewheel now and then
func _surface_fx(dt: float) -> void:
	_skid_marks(dt)
	if surface == "wood" and cast.ground:
		_plank += absf(v) * dt
		if _plank > 0.42:
			_plank = 0.0
			Sfx.play("step_wood", null, {"vol": -17.0 + minf(v, 8.0), "pitch": 1.35})
	if coasting and v > 3.0:
		_free_t -= dt
		if _free_t <= 0.0:
			_free_t = randf_range(2.5, 5.0)
			Sfx.play("bike_freewheel", null, {"vol": -16.0, "pitch": clampf(v / 7.0, 0.8, 1.3)})

func _ground(p: Vector3) -> float:
	return game.world.height_at(p.x, p.z)

# ---------- the frame's placing (cast.gd, after gravity) ----------
func place(dt: float) -> void:
	var W = game.world
	at.y = game.pos.y
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var ground: bool = cast.ground
	# landings: the springs squash, the rider soaks it
	if ground and not _was_ground:
		squash = clampf(-_land_vy / 5.5, 0.25, 1.0)
		Sfx.play("land_metal", null, {"vol": -14.0 + squash * 6.0, "pitch": 1.4})
		Sfx.play("land_" + ("dirt" if surface in ["dirt", "sand"] else ("grass" if surface in ["grass", "tallgrass"] else "stone")), null, {"vol": -8.0 + squash * 4.0})
	_was_ground = ground
	_land_vy = cast.vy
	squash = move_toward(squash, 0.0, dt * 3.2)
	# pitch with the ground under both tyres
	var hf: float = W.height_at(at.x + f.x * model.WB * 0.5, at.z + f.z * model.WB * 0.5)
	var hb: float = W.height_at(at.x - f.x * model.WB * 0.5, at.z - f.z * model.WB * 0.5)
	var pt := atan2(hf - hb, model.WB) if ground else pitch * 0.98
	pitch += (pt - pitch) * (1.0 - exp(-dt * 12.0))
	# getting on: the bike stands up off its stand as he takes the bars, the stand flicks up
	var m := 1.0
	if state == "mount":
		m = clampf(st_t / MOUNT_T, 0.0, 1.0)
		var up := clampf(m / 0.35, 0.0, 1.0)
		lean = lerpf(parked_lean, 0.0, up)
		steer = lerpf(parked_steer, 0.0, up)
		kick = 1.0 - clampf((m - 0.3) / 0.25, 0.0, 1.0)
		rider.kick_foot = 0.0
		if m > 0.3 and m - dt / MOUNT_T <= 0.3: Sfx.play("switch", null, {"vol": -10.0, "pitch": 0.7})
	elif state == "dismount":
		m = 1.0 - clampf(st_t / DISMOUNT_T, 0.0, 1.0)
		var dn := clampf((0.32 - m) / 0.2, 0.0, 1.0)
		kick = dn
		rider.kick_foot = sin(clampf((0.45 - m) / 0.35, 0.0, 1.0) * PI)
		lean = lerpf(lean, parked_lean, clampf((0.2 - m) / 0.2, 0.0, 1.0))
		if m < 0.25 and m + dt / DISMOUNT_T >= 0.25: Sfx.play("switch", null, {"vol": -9.0, "pitch": 0.75})
	else:
		kick = 0.0
	rider.mount = m
	var sq := squash * 0.035 * model.s
	var bx := Transform3D(Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, -pitch) * Basis(Vector3.BACK, lean), at + Vector3(0, -sq, 0))
	model.global_transform = bx
	var pl := BikeRider.foot_pitch(crank, 1.0)
	var pr := BikeRider.foot_pitch(crank, -1.0)
	rider.set_pitch(pl, pr)
	model.pose(steer, wheel_f, wheel_r, crank, kick, pl, pr)
	# Ash: in the bike's frame (his own lean comes from it), the riding fields
	var a: CastActor = cast.player
	var me := m * m * (3.0 - 2.0 * m)
	var ax := Transform3D(Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, -pitch * me) * Basis(Vector3.BACK, lean * me), at + Vector3(0, -sq, 0))
	a.global_transform = ax
	rider.rel = ax.affine_inverse() * bx
	rider.speed = absf(v)
	rider.lean_fwd = 0.04 + 0.14 * clampf(v / CRUISE, 0.0, 1.2) + FLOW_TUCK * flow
	# worn out: hunched over the bars, panting
	var tk: float = cast.player.tired if cast.player else 0.0
	if tk > 0.001: rider.lean_fwd += tk * (FAT_HUNCH + 0.03 * sin(_clock * 9.0))
	rider.stand = stand_k
	rider.foot_down = foot_k * (1.0 if state == "ride" else 0.0)
	rider.bell = clampf(1.0 - bell_t / 0.3, 0.0, 1.0) if bell_t < 0.3 else 0.0
	rider.look = clampf(om * 0.32 + steer * 0.4, -0.7, 0.7)
	rider.squash = squash
	# the camera eases back with speed
	pull += (clampf(v / CRUISE, 0.0, 1.2) - pull) * (1.0 - exp(-dt * 2.0))
	var fk := clampf((v - CAM_FOV_FROM) / maxf(0.5, FLOW_VMAX - CAM_FOV_FROM), 0.0, 1.0) if state == "ride" else 0.0
	_fov_k += (fk - _fov_k) * (1.0 - exp(-dt * 1.6))
	# sounds
	audio.active = state == "ride" and ground
	audio.speed = absf(v)
	audio.surface = surface
	audio.cadence = (absf(v) / model.R / TAU) / (float(model.teeth[0]) / float(model.teeth[1])) if pedalling else 0.0
	audio.coasting = coasting
	audio.skid = clampf(skid_t / SKID_T, 0.0, 1.0) if skid_t > 0.0 else 0.0
	audio.wheel_rps = absf(v) / model.R / TAU
	audio.flow = flow
	_assist_fx(dt)
	if _toast_t > 0.0: _toast_t -= dt
	if _block_said > 0.0: _block_said -= dt
	_toast_fade(dt)

func _pose_parked() -> void:
	at.y = _ground(at)
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var hf: float = game.world.height_at(at.x + f.x * model.WB * 0.5, at.z + f.z * model.WB * 0.5)
	var hb: float = game.world.height_at(at.x - f.x * model.WB * 0.5, at.z - f.z * model.WB * 0.5)
	pitch = atan2(hf - hb, model.WB)
	lean = parked_lean
	steer = parked_steer
	kick = 1.0
	model.global_transform = Transform3D(Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, -pitch) * Basis(Vector3.BACK, lean), at)
	model.pose(steer, wheel_f, wheel_r, crank, 1.0, 0.0, 0.0)

# ---------- a word on screen (blocked, no room...) ----------
func _hud() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.layer = 3
	add_child(hud_layer)
	toast = UIToaster.new()   # ui/ui_toast.gd: a short notice a third of the way down
	toast.anchor = "center"
	hud_layer.add_child(toast)

func say(text: String, kind := "warn") -> void:
	_toast_t = 2.2
	toast.clear()
	toast.push(kind, "Bike", text, "bike", 1.5)

func _toast_fade(_dt: float) -> void:
	pass

# indoors: the bike waits outside, unseen
func set_shown(on: bool) -> void:
	visible = on
	model.visible = on
	if not on: audio.stop_all()
