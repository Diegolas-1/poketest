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
# turn rate. Slopes slow him going up and speed him going down; grass, tall grass and
# sand are slower than the paths. No riding into water (he stops at the edge), up or
# down stairs (blocked, with a word on screen), or indoors. The jump button hops; a
# ledge is ridden off with a hop and a landing on the springs. A wall bounces him back
# a little; people in the way make him brake (they step aside).
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
var toast: Label
var stats := {"us": 0.0}
var hud_layer: CanvasLayer

# tunables
var CRUISE := T.num("bike", "cruise_speed", 9.0)
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
var PIVOT := T.num("bike", "pivot_rate", 1.7)
var LEAN_GAIN := T.num("bike", "lean_gain", 0.85)
var LEAN_MAX := T.num("bike", "lean_max", 0.6)
var SLOPE := T.num("bike", "slope_gain", 0.75)
var SURF_MULT := T.dict("bike", "surface_mult", {"dirt": 1.0, "stone": 1.0, "wood": 1.0, "grass": 0.84, "tallgrass": 0.68, "sand": 0.55, "water": 0.4})
var SURF_DRAG := T.dict("bike", "surface_drag", {"dirt": 0.0, "stone": 0.0, "wood": 0.0, "grass": 0.35, "tallgrass": 0.8, "sand": 1.6, "water": 3.0})
var HOP_VY := T.num("bike", "hop_vy", 4.1)
var LEDGE_VY := T.num("bike", "ledge_vy", 3.4)
var STEP_MAX := T.num("bike", "step_max", 0.2)
var BUMP := T.num("bike", "bump_back", 0.28)
var NPC_BRAKE := T.num("bike", "npc_brake", 4.0)
var MOUNT_T := T.num("bike", "mount_time", 0.62)
var DISMOUNT_T := T.num("bike", "dismount_time", 0.66)
var CAM_PULL := T.num("bike", "cam_pull", 1.5)
var CAM_DROP := T.num("bike", "cam_drop", 0.05)
var CAM_FOLLOW := T.num("bike", "cam_follow", 1.6)
var CAM_LAG := T.num("bike", "cam_lag", 7.0)
var BELL_GAP := T.num("bike", "bell_gap", 0.35)
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
func cam_pull() -> float: return pull * CAM_PULL
func cam_drop() -> float: return pull * CAM_DROP

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

func _end_dismount() -> void:
	state = "parked"
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
	var brake_btn := Input.is_action_pressed("back") and not busy
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var ground: bool = cast.ground
	surface = _surface(at)
	var smul: float = float(SURF_MULT.get(surface, 1.0))
	var sdrag: float = float(SURF_DRAG.get(surface, 0.0))
	# where the stick points (heading error), how hard (throttle)
	var e := 0.0
	if m > 0.05: e = wrapf(atan2(dir.x, dir.y) - yaw, -PI, PI)
	var thr := m
	var pivot := false
	if absf(v) < 0.7 and m > 0.3 and absf(e) > (0.25 if _blocked_t > 0.0 else 0.4):
		pivot = true      # walking the bike round, stopped: no pedalling yet
		thr = 0.0
	elif absf(e) > 2.2 and v > 2.0:
		thr = 0.0         # pulling right back: coast and turn (no u-turn on the spot)
	var sprint := run and thr > 0.5
	var target := (SPRINT if sprint else CRUISE) * smul * thr
	# people ahead: brake for them
	target = minf(target, _people_limit(f))
	# water, stairs or a wall right ahead: ease off before it
	var look_d := 0.75 + absf(v) * 0.32
	var ahead: Vector3 = at + f * look_d
	var fl: int = W.flag(ahead.x, ahead.z)
	if fl != 255 and (fl & 1) and not (fl & 4):
		target = minf(target, maxf(0.0, (look_d - 0.85) * 2.0))
		if v > 0.5 and _toast_t <= 0.0: say("The bike stays out of the water")
	# the slope along the way (+ uphill)
	var hf: float = W.height_at(at.x + f.x * 0.5, at.z + f.z * 0.5)
	var hb: float = W.height_at(at.x - f.x * 0.5, at.z - f.z * 0.5)
	var slope := clampf((hf - hb) / 1.0, -0.6, 0.6) if ground else 0.0
	var a := 0.0
	var released := m < 0.08
	pedalling = false
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
	elif v > target + 0.4:
		a = -0.5 if thr < 0.5 else 0.0   # easing off: coast down to it (a downhill may still run him on)
	else:
		pedalling = target > 0.5
		a = (target - v) * 2.0
	# rolling resistance on soft ground, gravity on slopes (only on the ground)
	if ground:
		a -= (COAST * (0.0 if pedalling else 1.0) + sdrag + DRAG * v * v) * signf(v) if absf(v) > 0.05 else 0.0
		a -= 9.8 * sin(atan(slope)) * SLOPE
	if not ground: a = 0.0
	var v0 := v
	v += a * dt
	# braking never reverses (only a bump rolls him back), and stopped with the brakes on he stays
	if not _bumping:
		if v0 >= 0.0 and v < 0.0: v = 0.0
		if (released or brake_btn) and absf(v) < 0.3: v = 0.0
	if _bumping:
		v = move_toward(v, 0.0, dt * 4.0)
		if absf(v) < 0.05: _bumping = false; v = 0.0
	v = clampf(v, -2.0, VMAX)
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
		om_t = clampf(e * 2.6, -om_max, om_max) * signf(v)
		if skid_t > 0.0: om_t *= 0.4
	om += (om_t - om) * (1.0 - exp(-dt * (10.0 if pivot else 7.0)))
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
	var lt := -clampf(atan(v * om / 9.8) * LEAN_GAIN, -LEAN_MAX, LEAN_MAX)
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
		# a step up or down (stairs, a kerb) that is not a ledge going down
		var h0: float = W.height_at(p.x, p.z)
		var h1: float = W.height_at(np.x, np.z)
		var ledge: bool = (int(W.flag(np.x, np.z)) & 32) != 0 or (int(W.flag(p.x, p.z)) & 32) != 0
		var steep: bool = absf(h1 - h0) > STEP_MAX * maxf(moved / 0.1, 0.3) and not (ledge and h1 < h0)
		if tip_hit or steep or moved < full * 0.35:
			# a glancing touch: slide along it (turned a little away), else stop or bounce
			if v > 0.5 and _slide(stp, f): continue
			_blocked(steep)
			return
		# slid along a wall: lose the speed into it
		if moved < full * 0.9 and v > 0.0: v *= lerpf(0.6, 1.0, moved / full)
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
		if absf(W.height_at(np.x, np.z) - W.height_at(at.x, at.z)) > STEP_MAX * 0.6: continue
		at = Vector3(np.x, at.y, np.z)
		yaw = wrapf(yaw + ang * 0.18, -PI, PI)
		v *= 0.97 if absf(ang) < 0.6 else 0.9
		return true
	return false

var _blocked_t := 0.0
func _blocked(steep: bool) -> void:
	_blocked_t = 0.4
	if steep:
		if _block_said <= 0.0: say("Too steep for the bike: get off and walk"); _block_said = 3.0
	if absf(v) > 2.0 and not steep:
		Sfx.play("hit_soft", at + Vector3(0, 0.5, 0), {"vol": -6.0 - (6.0 - minf(absf(v), 6.0)), "pitch": 1.2})
		v = -absf(v) * BUMP * signf(v)
		_bumping = true
		game.cam_shake = 0.18
	else:
		v = 0.0
	om *= 0.3

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
	rider.lean_fwd = 0.04 + 0.14 * clampf(v / CRUISE, 0.0, 1.2)
	rider.stand = stand_k
	rider.foot_down = foot_k * (1.0 if state == "ride" else 0.0)
	rider.bell = clampf(1.0 - bell_t / 0.3, 0.0, 1.0) if bell_t < 0.3 else 0.0
	rider.look = clampf(om * 0.32 + steer * 0.4, -0.7, 0.7)
	rider.squash = squash
	# the camera eases back with speed
	pull += (clampf(v / CRUISE, 0.0, 1.2) - pull) * (1.0 - exp(-dt * 2.0))
	# sounds
	audio.active = state == "ride" and ground
	audio.speed = absf(v)
	audio.surface = surface
	audio.cadence = (absf(v) / model.R / TAU) / (float(model.teeth[0]) / float(model.teeth[1])) if pedalling else 0.0
	audio.coasting = coasting
	audio.skid = clampf(skid_t / SKID_T, 0.0, 1.0) if skid_t > 0.0 else 0.0
	audio.wheel_rps = absf(v) / model.R / TAU
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
	toast = Label.new()
	toast.add_theme_font_size_override("font_size", 22)
	var fv := FontVariation.new()
	fv.base_font = load("res://fonts/PixelifySans.woff2")
	fv.variation_opentype = {"wght": 600}
	toast.add_theme_font_override("font", fv)
	toast.add_theme_color_override("font_color", Color.WHITE)
	toast.add_theme_color_override("font_outline_color", Color(0.1, 0.1, 0.18, 0.85))
	toast.add_theme_constant_override("outline_size", 8)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast.modulate.a = 0.0
	hud_layer.add_child(toast)

func say(text: String) -> void:
	toast.text = text
	_toast_t = 2.2
	toast.modulate.a = 1.0
	var vs := get_viewport().get_visible_rect().size
	toast.size = Vector2(vs.x, 40)
	toast.position = Vector2(0, vs.y * 0.2)

func _toast_fade(dt: float) -> void:
	if toast.modulate.a <= 0.0: return
	if _toast_t <= 0.4: toast.modulate.a = maxf(0.0, toast.modulate.a - dt / 0.4)

# indoors: the bike waits outside, unseen
func set_shown(on: bool) -> void:
	visible = on
	model.visible = on
	if not on: audio.stop_all()
