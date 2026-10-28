class_name Battle
extends Node3D
# A battle with a wild Pokémon, where Ash meets it (Route 1's tall grass first;
# the trigger is generic: wild/wild.gd starts it, or anything else later):
#
#   var b := Battle.start(game, {"species": "pidgey", "creature": node, "at": Vector3,
#       "temper": "flighty" | "aggressive" | "curious" | "timid",
#       "state": "hidden" | "startled" | "fleeing" | "attacking",
#       "where": "tall_grass", "first_strike": "ash" | "wild"})
#   b.finished.connect(func(result): ...)   # {outcome: fled | disengaged | ash_won | ash_down | ran, ...}
#   Battle.active                            # true while one is on (other systems pause)
#   Battle.current                           # the one on, or null
# opts may also carry "on_finished": a Callable called with the result.
#
# ---- the show ----
# The intro: a white flash, ink bands sweeping across in the UI kit's style, the
# species' name slammed in on a red slash. Under the bands the two square up
# (Ash turned to face it, the Pokémon set down a few metres off); as the bands
# sweep on, the camera swoops up from the gameplay view to a diagonal, high,
# angled-down view over the spot, and the world round it spreads out of the
# way in every direction (the grass, the bushes, the trees slide out radially
# and settle with a little overshoot: shaders/arena.gdshaderinc, the vertex
# shaders of the grass and the plants, two global uniforms, nothing rebuilt)
# leaving a clear round floor about 10 m across, the real ground. At the end
# everything slides back and the gameplay camera glides home.
#
# ---- the battle ----
# Ash has no Pokémon, so he fights himself (battle_ui.gd's menu): Kick Sand,
# Startle, Throw a Rock, Back Away. The rules are battle_rules.gd's (data in
# life/wild.json): the wild one's moods drive it, it may lose interest when it
# feels no threat, it flees when hurt or scared. Ash has no HP: his stamina
# (body.gd's bar, shown in the battle HUD) is what wears down. Nothing refills
# it during a battle, each of his actions costs some (a ten-year-old doing this
# for the first time), and the Pokémon's hits knock a lot out of him: three or
# four of them leave him exhausted, sore and overwhelmed, and he goes down.
# The Pokémon keep real HP. Every beat is staged like a scene: camera cuts and
# pushes, a callout of the move, the acting (idles.gd's battle acts for Ash,
# the creature's moods for the Pokémon), the effects (battle_fx.gd), a hit-stop,
# flashes, a shake, numbers, the sounds.
#
# ---- turns, and the hooks for the energy system (battle/energy.gd, life/moves.json) ----
# The loop is a sequence of turns in which a side may act more than once:
#   _wild_pick(state) -> Array    the wild Pokémon's moves for this turn, in order:
#                                 plans {kind: "move", move, first, cost...}. With
#                                 the energy system attached (battle/energy_hook.gd,
#                                 EnergyHook.attach once the HUD is up) as many as
#                                 the turn's chips pay for (1, 2, 3... a turn, up
#                                 to its capacity: Pidgey may act twice); without
#                                 it, one a turn (R.pick_move)
#   energy_moves() -> Array       the moves this battle can stage (the hook plans with these)
#   energy_anchor(side) -> Rect2  where the energy bars go (ui.energy_slot)
#   _state() -> Dictionary        what it sees: turn, mood, HPs, Ash's stamina, its moves
#   _foe_act(id)                  stages one move by id (each move's data in
#                                 life/wild.json moves.<id>: id, type, and room for
#                                 "cost": {"<type>": n})
#   _wild_react()                 after Ash's action: flee / lose interest, or stay
#   R.end_turn()                  the turn's end (the energy system adds its chip here)
# Moves with "first" (Quick Attack) in a turn's picks go before Ash's action.
# HUD: ui.energy_slot("foe") and ui.energy_slot("ally") are the rects kept free
# for the energy bars (above the foe's plate, and above Ash's for an ally Pokémon).
#
# ---- outcomes ----
# fled / disengaged / ash_won / ran: the Pokémon goes (or Ash does), the
# outcome's banner, the arena closes, control comes back. ash_down: Ash
# crumples to the ground; on Route 1 with no starter (quest flag has_starter
# unset) the defeat event follows (battle_defeat.gd: Officer Jenny and Nurse
# Joy, the "Scraped & Dirty" condition, the flag route1_mauled).
#
# ---- the creature ----
# opts.creature (the one in the world) is used as it is; else one is made:
# Creature.make(species) once its model exists (res://creatures/<id>.glb),
# else battle/pidgey_standin.gd. Driven by animate(dt, speed) and mood(name)
# (gust, tackle, quick_attack, sand_attack, hurt, flinch, faint, flee, taunt,
# wings_spread...); Gust's wind pulses with its wing_phase when it has one.
# While the battle has it, it carries the meta "battle" (its owner should leave it be).
#
# Dev: dev/battle_dev.tscn starts one in Route 1's tall grass (scripted for
# renders: --acts=, --moves=, --hit=1); dev/battle_test.tscn checks the rules.

signal finished(result: Dictionary)

const ARENA_R := 5.6           # the floor kept clear (m): a ~11 m circle (the 10 x 10 m arena)
const GAP := 4.6               # Ash to the Pokémon (m)
const OPEN_T := 1.35           # the spread (s)
const CLOSE_T := 1.1

static var active := false
static var current: Battle = null

var game: Node3D
var cast: Node
var player: CastActor
var body: AshBody
var cam: Camera3D
var fx: BattleFx
var ui: BattleUI
var layer: CanvasLayer
var R: BattleRules
var foe: Node3D
var own_foe := false
var opts := {}
var species := "pidgey"
var result := {}
var done := false

# the arena
var c := Vector3.ZERO          # its centre (ground)
var fwd := Vector3.FORWARD     # Ash -> the Pokémon
var side := Vector3.RIGHT
var ash_spot := Vector3.ZERO
var foe_spot := Vector3.ZERO
var arena_k := 0.0
var _arena_from := 0.0
var _arena_to := 0.0
var _arena_t := -1.0
var _arena_dur := 1.0
var _arena_last := 0.0
var wind := 0.0                # gust: the wall of grass leans with it

# who is where
var ash_pos := Vector3.ZERO
var ash_yaw := 0.0
var ash_anim_speed := 0.0
var foe_pos := Vector3.ZERO
var foe_yaw := 0.0
var foe_lift := 0.0
var foe_speed := 0.0
var _foe_vel := Vector3.ZERO
var _foe_last := Vector3.ZERO

# the camera
var cam_on := false
var puppet := true              # the battle places Ash (off once the defeat carries him home)
var lie := 0.0                  # Ash down: 0 sitting slumped (b_crumple) .. 1 curled up on his side
var _lie_to := 0.0
var _lie_rate := 0.0
var cam_pos := Vector3.ZERO
var cam_look := Vector3.ZERO
var cam_fov := 52.0
var _shot := {}                 # {pos, look, fov, rate}
var shake := 0.0
var _hitstop := 0.0
var _slow := 1.0
var _slow_t := 0.0
var _t := 0.0
var _rng := RandomNumberGenerator.new()

# scripted runs (dev/battle_dev.gd: renders)
var script_acts: Array = []
var script_moves: Array = []
var force_hit := -1             # 1 every attack lands, 0 every attack misses, -1 the dice
var auto_delay := 0.9
var _choice := ""
var _prev_stance := ""
var _hidden: Array = []

static func start(g: Node3D, o: Dictionary = {}) -> Battle:
	if active and current and is_instance_valid(current): return current
	var b := Battle.new()
	b.name = "Battle"
	g.add_child(b)
	b._begin(g, o)
	return b

func _begin(g: Node3D, o: Dictionary) -> void:
	game = g
	opts = o
	active = true
	current = self
	_rng.randomize()
	cast = g.get("cast")
	player = cast.player if cast else null
	body = cast.body if cast else null
	cam = g.get("cam")
	species = String(o.get("species", "pidgey"))
	var sd := int(o.get("seed", -1))
	R = BattleRules.new(species, String(o.get("temper", "flighty")), String(o.get("state", "hidden")), sd)
	if sd >= 0: _rng.seed = sd + 1
	if body: R.ash_sta = body.stamina * R.ash_sta_max   # (his stamina is what a battle wears down: no HP)
	script_acts = Array(o.get("script_acts", []))
	script_moves = Array(o.get("script_moves", []))
	force_hit = int(o.get("force_hit", -1))
	R.force = force_hit
	auto_delay = float(o.get("auto_delay", 0.9))
	fx = BattleFx.new()
	fx.name = "Fx"
	add_child(fx)
	fx.setup(cam, func(x: float, z: float) -> float: return game.world.height_at(x, z))
	layer = CanvasLayer.new()
	layer.layer = 4
	add_child(layer)
	ui = BattleUI.new()
	ui.cam = cam
	layer.add_child(ui)
	ui.picked.connect(func(id: String): _choice = id)
	ui.ash_max = R.ash_sta_max; ui.ash_sta = R.ash_sta; ui.ash_show = R.ash_sta
	ui.foe_name = R.display_name(); ui.foe_lv = R.level()
	ui.foe_max = R.foe_max; ui.foe_hp = R.foe_hp; ui.foe_show = R.foe_hp
	ui.set_mood(R.mood())
	_place()
	_make_foe()
	_run()

# ---------- setting up ----------
func _place() -> void:
	ash_pos = game.pos
	var at: Vector3 = opts.get("at", Vector3(NAN, 0, NAN))
	var d := Vector3(sin(game.yaw), 0, cos(game.yaw))
	if not is_nan(at.x):
		var v := Vector3(at.x - ash_pos.x, 0, at.z - ash_pos.z)
		if v.length() > 0.5: d = v.normalized()
	fwd = d
	side = fwd.cross(Vector3.UP).normalized()
	ash_spot = Vector3(ash_pos.x, 0, ash_pos.z)
	foe_spot = ash_spot + fwd * GAP
	c = ash_spot + fwd * GAP * 0.5
	ash_spot.y = _gy(ash_spot); foe_spot.y = _gy(foe_spot); c.y = _gy(c)
	ash_yaw = game.yaw
	foe_yaw = atan2(-fwd.x, -fwd.z)

func _gy(p: Vector3) -> float: return game.world.height_at(p.x, p.z)

func _make_foe() -> void:
	var given = opts.get("creature")
	if given is Node3D and is_instance_valid(given):
		foe = given
	else:
		own_foe = true
		if ResourceLoader.exists("res://creatures/%s.glb" % species): foe = Creature.make(species)
		else: foe = PidgeyStandin.new()
		add_child(foe)
	foe.set_meta("battle", true)
	if "battle" in foe: foe.battle = true          # (CreaturePidgey: a fighting stance, no idle pecks)
	if "auto" in foe: foe.auto = false
	if "act_reach" in foe: foe.act_reach = 0.0     # (the battle carries it to Ash itself)
	if "gust_beats" in foe: foe.gust_beats = 3
	var at: Vector3 = opts.get("at", foe_spot)
	foe_pos = Vector3(at.x, 0, at.z) if own_foe and not is_nan(at.x) else (foe.global_position if not own_foe else foe_spot)
	foe_pos.y = _gy(foe_pos)
	_foe_last = foe_pos
	_put_foe(0.016)

# ---------- the frame ----------
func _process(dt: float) -> void:
	var real := dt / maxf(Engine.time_scale, 1e-3)
	if _hitstop > 0.0:
		_hitstop -= real
		if _hitstop <= 0.0: Engine.time_scale = _slow
	elif _slow_t > 0.0:
		_slow_t -= real
		if _slow_t <= 0.0: _slow = 1.0; Engine.time_scale = 1.0
	_t += dt
	_arena(dt)
	if done: return
	if not puppet:
		fx.update(dt); ui.tick(real)
		return
	# Ash: where the battle puts him, facing it (cast.gd places and animates him from game.pos)
	ash_pos.y = _gy(ash_pos)
	game.pos.x = ash_pos.x
	game.pos.z = ash_pos.z
	game.yaw = ash_yaw
	game.speed = ash_anim_speed
	game.cam_yaw = ash_yaw + PI   # (his head looks ahead, not round at the camera)
	_put_foe(dt)
	_lie(dt)
	_menu_input()
	fx.update(dt)
	ui.tick(real)
	ui.ash_acc = R.ash_acc_stage; ui.foe_acc = R.foe_acc_stage
	ui.sand_k = maxf(0.0, ui.sand_k - dt * 0.5)
	ui.speed_k = maxf(0.0, ui.speed_k - dt * 3.0)
	if cam_on: _camera(dt, real)

# down: from the slumped sit (b_crumple: knees drawn up, a hand to his side) he
# tips over onto his left side and lies there curled up; the model's root (under
# the actor, which the acting and its ground checks keep upright) turns about his
# forward axis round the seat, lifted by half his width so his side rests on the ground
func lie_down(to: float, instant := false, secs := 0.9) -> void:
	_lie_to = to
	_lie_rate = 1.0 / maxf(secs, 0.05)
	if instant:
		lie = to
		_lie(0.0)

func _lie(dt: float) -> void:
	if player == null or player.get_child_count() == 0: return
	if absf(lie - _lie_to) > 1e-4: lie = move_toward(lie, _lie_to, dt * _lie_rate)
	var root := player.get_child(0) as Node3D
	if root == null: return
	if lie <= 1e-4:
		if root.has_meta("lie0"): root.transform = root.get_meta("lie0"); root.remove_meta("lie0")
		return
	if not root.has_meta("lie0"): root.set_meta("lie0", root.transform)
	var t0: Transform3D = root.get_meta("lie0")
	var e := lie * lie * (3.0 - 2.0 * lie)
	var ang := -1.38 * e                       # (about his forward axis, +z: negative tips him to his left)
	var pivot := Vector3(0.12, 0.0, -0.3)      # the seat's left edge
	var b := Basis(Vector3(0, 0, 1), ang)
	var lift := Vector3(0, 0.08 * sin(e * PI * 0.5), 0)
	root.transform = Transform3D(b, pivot - b * pivot + lift) * t0

func _put_foe(dt: float) -> void:
	if foe == null or not is_instance_valid(foe): return
	foe_pos.y = _gy(foe_pos)
	foe.global_position = foe_pos + Vector3(0, foe_lift, 0)
	foe.rotation = Vector3(0, foe_yaw, 0)
	_foe_vel = (foe_pos - _foe_last) / maxf(dt, 1e-4)
	_foe_last = foe_pos
	if foe.has_method("animate"): foe.animate(dt, foe_speed)
	if "look_at_pos" in foe: foe.look_at_pos = ash_pos + Vector3(0, 1.3, 0)

func _menu_input() -> void:
	if not ui.menu_on: return
	if Input.is_action_just_pressed("move_up") or Input.is_action_just_pressed("ui_up"): ui.move(-1)
	if Input.is_action_just_pressed("move_down") or Input.is_action_just_pressed("ui_down"): ui.move(1)
	if Input.is_action_just_pressed("use") or Input.is_action_just_pressed("ui_accept"): ui.confirm()

func _unhandled_key_input(e: InputEvent) -> void:
	if not ui or not ui.menu_on: return
	if e is InputEventKey and e.pressed and not e.echo:
		var k: int = e.physical_keycode - KEY_1
		if k >= 0 and k < 4:
			ui.sel = k
			ui.confirm()

# ---------- the arena: open / close ----------
func _arena_go(to: float, dur: float) -> void:
	_arena_from = arena_k; _arena_to = to; _arena_t = 0.0; _arena_dur = dur

func _arena(dt: float) -> void:
	if _arena_t >= 0.0:
		_arena_t += dt
		var u := clampf(_arena_t / _arena_dur, 0.0, 1.0)
		# out: a quick start and an overshoot that settles (things sliding out and
		# rocking to a stop); back: eased in and out
		var e := UITheme.ease_back(u, 1.4) if _arena_to > _arena_from else u * u * (3.0 - 2.0 * u)
		arena_k = lerpf(_arena_from, _arena_to, e)
		if u >= 1.0: _arena_t = -1.0
	var v := (arena_k - _arena_last) / maxf(dt, 1e-4)
	_arena_last = arena_k
	RenderingServer.global_shader_parameter_set("battle_arena", Vector4(c.x, c.z, ARENA_R, arena_k))
	RenderingServer.global_shader_parameter_set("battle_arena_v", v + wind)

# ---------- the camera ----------
# the shots, in the arena's frame
func _shot_xf(n: String) -> Dictionary:
	var up := Vector3.UP
	var foe_p := foe_pos
	match n:
		"overview": return {"pos": c - fwd * 4.3 + side * 3.3 + up * 4.4, "look": c + fwd * 0.3 + up * 0.35, "fov": 50.0}
		"overview2": return {"pos": c - fwd * 3.6 - side * 4.8 + up * 6.0, "look": c + up * 0.4, "fov": 50.0}
		"gust_side": return {"pos": c + side * 6.0 - fwd * 2.2 + up * 2.6, "look": c + fwd * 0.2 + up * 0.9, "fov": 58.0}
		"ash_front": return {"pos": ash_pos + fwd * 3.0 + side * 1.4 + up * 1.35, "look": ash_pos + up * 1.15, "fov": 44.0}
		"ash_side": return {"pos": ash_pos + side * 3.1 - fwd * 0.6 + up * 1.7, "look": ash_pos + fwd * 1.7 + up * 0.7, "fov": 50.0}
		"foe_close": return {"pos": ash_pos - fwd * 0.9 + side * 2.0 + up * 1.9, "look": foe_p + up * 0.4 - side * 0.3, "fov": 38.0}
		"qa": return {"pos": c + side * 5.0 - fwd * 0.8 + up * 2.2, "look": c - fwd * 0.6 + up * 0.6, "fov": 52.0}
		"impact": return {"pos": ash_pos + fwd * 2.6 + side * 2.6 + up * 1.6, "look": ash_pos + up * 0.9, "fov": 50.0}
		"down": return {"pos": ash_pos - side * 2.0 + fwd * 1.4 + up * 1.1, "look": ash_pos + up * 0.3, "fov": 46.0}
		"flee": return {"pos": c - fwd * 5.5 + side * 3.0 + up * 3.2, "look": foe_p + up * 1.2, "fov": 52.0}
	return _shot_xf("overview")

func shot(n: String, rate := 4.0) -> void:
	_shot = _shot_xf(n)
	_shot.rate = rate
	_shot.name = n
	if rate <= 0.0:
		cam_pos = _shot.pos; cam_look = _shot.look; cam_fov = _shot.fov

func _camera(dt: float, real: float) -> void:
	if not _shot.is_empty():
		var live := _shot if String(_shot.name) == "_fixed" else _shot_xf(String(_shot.name))   # (the shots follow whoever moves)
		var k := 1.0 - exp(-dt * float(_shot.rate)) if float(_shot.rate) > 0.0 else 1.0
		cam_pos = cam_pos.lerp(live.pos, k)
		cam_look = cam_look.lerp(live.look, k)
		cam_fov = lerpf(cam_fov, live.fov, k)
	var p := cam_pos
	var gy := _gy(p) + 0.45
	if p.y < gy: p.y = gy
	shake = maxf(0.0, shake - real * 2.4)
	var sh := Vector3.ZERO
	if shake > 0.001:
		var tt := Time.get_ticks_msec() * 0.001
		sh = (side * sin(tt * 53.0) + Vector3.UP * sin(tt * 61.0 + 1.3) * 0.8 + fwd * sin(tt * 47.0 + 2.1) * 0.4) * shake * 0.12
	cam.global_position = p + sh
	cam.look_at(cam_look + sh * 0.5, Vector3.UP)
	cam.fov = cam_fov
	ui.shake = Vector2(sh.x, -sh.y) * 30.0

func hitstop(secs: float) -> void:
	_hitstop = secs
	Engine.time_scale = 0.03

func slowmo(scale: float, secs: float) -> void:
	_slow = scale; _slow_t = secs
	if _hitstop <= 0.0: Engine.time_scale = scale

# ---------- waits ----------
func _wait(secs: float) -> void:
	await get_tree().create_timer(secs).timeout

# ash moves (x, z) toward p over secs (animated as a walk at that pace)
func _ash_move(to: Vector3, secs: float, anim := true) -> void:
	var from := ash_pos
	var t := 0.0
	while t < secs:
		var dt := get_process_delta_time()
		t += dt
		var u := clampf(t / secs, 0.0, 1.0)
		var e := 1.0 - (1.0 - u) * (1.0 - u)
		ash_pos = from.lerp(to, e)
		ash_anim_speed = (from.distance_to(to) / secs) * (2.0 * (1.0 - u)) if anim else 0.0
		await get_tree().process_frame
	ash_anim_speed = 0.0

func _foe_move(to: Vector3, secs: float, lift := 0.0, each: Callable = Callable(), ease_k := 0) -> void:
	var from := foe_pos
	var t := 0.0
	while t < secs:
		var dt := get_process_delta_time()
		t += dt
		var u := clampf(t / secs, 0.0, 1.0)
		var e := u if ease_k == 0 else (1.0 - (1.0 - u) * (1.0 - u) if ease_k == 1 else u * u)
		foe_pos = from.lerp(to, e)
		foe_lift = lift * sin(u * PI)
		if each.is_valid(): each.call(u)
		await get_tree().process_frame
	foe_lift = 0.0

func _bone(n: String, fallback_h := 1.2) -> Vector3:
	if player == null: return ash_pos + Vector3(0, fallback_h, 0)
	var bi: int = player.bones.get(n, -1)
	if bi < 0: return player.global_position + Vector3(0, fallback_h, 0)
	return player.skel.global_transform * player.skel.get_bone_global_pose(bi).origin

func _act(n: String, ln := 0.0) -> void:
	if player and player.idles: player.idles.force(n, ln)

func _mood(n: String) -> void:
	if foe and foe.has_method("mood"): foe.mood(n)

func _cry(pitch := 1.0) -> void:
	Sfx.play("critter_chirp", foe_pos + Vector3(0, 0.4, 0), {"pitch": 0.85 * pitch, "vol": 2.0})
	Sfx.play("bird_call", foe_pos + Vector3(0, 0.4, 0), {"pitch": 1.15 * pitch, "vol": -2.0})

func _hits(roll: bool) -> bool:
	return roll if force_hit < 0 else force_hit == 1

# ---------- the run ----------
func _run() -> void:
	# the controls go to the battle
	if cast:
		if cast.btn_ui: _hide(cast.btn_ui)
		if cast.cond_ui: _hide(cast.cond_ui)
		if cast.dialog: cast.dialog.prompt = {}; cast.dialog._ban_t = 99.0   # (the area's banner gives way to the intro)
	game.speed = 0.0
	if player and player.idles:
		_prev_stance = player.idles.stance
	cam_pos = cam.global_position
	cam_look = cam.global_position - cam.global_transform.basis.z * 6.0
	cam_fov = cam.fov
	cam_on = true
	_shot = {}
	# ---- the intro ----
	Sfx.play("encounter", null, {"vol": -1.0})
	ui.intro(R.display_name(), "LV. %d  ·  %s" % [R.level(), String(opts.get("temper", "flighty")).to_upper()])
	await _wait(0.45)
	# under the ink: the two square up
	ash_yaw = atan2(fwd.x, fwd.z)
	if player and player.idles: player.idles.stance = "battle"
	foe_pos = foe_spot
	foe_yaw = atan2(-fwd.x, -fwd.z)
	await _wait(1.05)
	# the bands sweep on: the swoop and the spread
	shot("overview", 2.2)
	await _wait(0.15)
	_arena_go(1.0, OPEN_T)
	Sfx.play("wind_gust", c, {"vol": -4.0})
	Sfx.play("whoosh", null, {"vol": -6.0, "pitch": 0.7})
	await _wait(0.6)
	_mood("wings_spread")
	_cry()
	await _wait(0.9)
	ui.show_hud(true)
	Sfx.ui("ui_banner")
	# the energy system (battle/energy_hook.gd): the foe's bar, and its turn plans
	EnergyHook.attach(self, {"species": species, "level": R.level(), "temper": String(opts.get("temper", "flighty"))})
	await _wait(0.5)
	# ---- the turns ----
	# A turn: the wild side's picks for it (_wild_pick: one move now; the energy
	# system will give it as many as its energy pays for), those that go first
	# (Quick Attack) before Ash, then Ash's action, then whether it bolts or loses
	# interest, then the rest of its picks; then the turn ends (the moods ease).
	var first: String = String(opts.get("first_strike", "ash"))
	if String(opts.get("state", "")) == "attacking": first = "wild"
	if first == "wild":
		for p in _wild_pick(_state()):
			await _foe_act(p)
			if R.outcome != "": break
		R.end_turn()
	while R.outcome == "":
		var picks := _wild_pick(_state())
		var lead: Array = []
		while not picks.is_empty() and bool(picks[0].get("first", false)):
			lead.append(picks.pop_front())
		var act := await _choose()
		shot("overview", 3.0)
		for p in lead:
			await _foe_act(p)
			if R.outcome != "": break
			await _wait(0.3)
		if R.outcome != "": break
		await _ash_turn(act)
		if R.outcome != "": break
		await _wait(0.35)
		var re := _wild_react()
		if not re.is_empty():
			R.foe_turn(re)
			break
		for p in picks:
			await _foe_act(p)
			if R.outcome != "": break
		R.end_turn()
	await _outcome()

# ---------- the wild side's mind: the hooks for the energy system ----------
# what the battle looks like to the wild side when it picks its moves
func _state() -> Dictionary:
	return {"turn": R.turn + 1, "species": species, "temper": R.temper, "mood": R.mood(), "foe_hp": R.foe_hp, "foe_max": R.foe_max,
		"ash_stamina": R.ash_sta / maxf(1.0, R.ash_sta_max), "anger": R.anger, "fear": R.fear, "threat": R.threat, "moves": R.S.get("moves", {}).keys()}

# the wild Pokémon's moves for this turn, in order (move ids from life/wild.json).
# One a turn for now: the energy system (battle/energy.gd) replaces this with as
# many as the turn's energy pays for (each move's "cost").
func _wild_pick(st: Dictionary) -> Array:
	var h := get_node_or_null("EnergyHook")
	if not script_moves.is_empty():
		var m := String(script_moves[0])
		if m in ["flee", "disengage"]: return []   # (scripted: it leaves after Ash's action, _wild_react)
		script_moves.pop_front()
		# scripted renders: "a+b" plays both in one turn; the energy bar still turns over
		if h and h.has_method("wild_pick"): h.wild_pick(st)
		var out := []
		for id in m.split("+"): out.append({"kind": "move", "move": id, "first": R.is_first(id)})
		return out
	if h and h.has_method("wild_pick"): return h.wild_pick(st)
	var id := R.pick_move()
	return [{"kind": "move", "move": id, "first": R.is_first(id)}]

# the moves this battle knows how to stage (the energy system plans only with these)
func energy_moves() -> Array:
	return ["tackle", "sand_attack", "gust", "quick_attack", "whirlwind", "wing_attack"]

# where the energy bars sit: above the foe's plate, and above Ash's for an ally later
func energy_anchor(side: String) -> Rect2:
	return ui.energy_slot(side) if ui else Rect2()

# after Ash's action: does it bolt or lose interest? ({} = it stays)
func _wild_react() -> Dictionary:
	if not script_moves.is_empty():
		var m := String(script_moves[0])
		if m in ["flee", "disengage"]:
			script_moves.pop_front()
			return {"kind": m}
		return {}
	if force_hit >= 0: return {}   # (a scripted render keeps it fighting)
	return R.reaction()

func _choose() -> String:
	shot("overview", 2.5)
	ui.set_mood(R.mood())
	_choice = ""
	if not script_acts.is_empty():
		ui.open_menu()
		var want := String(script_acts.pop_front())
		var idx := 0
		for i in BattleUI.ITEMS.size():
			if BattleUI.ITEMS[i].id == want: idx = i
		await _wait(auto_delay * 0.5)
		ui.sel = idx
		await _wait(auto_delay * 0.5)
		ui._pick(idx)
		return want
	ui.open_menu()
	while _choice == "":
		await get_tree().process_frame
		if done: return "back_away"
	return _choice

# ---------- Ash's actions ----------
func _ash_turn(act: String) -> void:
	var e: Dictionary
	# (each action takes it out of him: the bar drops as he acts)
	get_tree().create_timer(0.5).timeout.connect(_show_sta)
	match act:
		"kick_sand": e = await _do_kick()
		"startle": e = await _do_startle()
		"rock": e = await _do_rock()
		_: e = await _do_back_away()
	ui.set_mood(R.mood())
	await _wait(0.4)

func _do_kick() -> Dictionary:
	ui.say("ASH", "KICK SAND!", Color("e0a84a"))
	shot("ash_side", 5.0)
	await _wait(0.25)
	var e := R.ash_act("kick_sand")
	_act("b_kick")
	Sfx.play("cloth_rustle", ash_pos, {"vol": -6.0})
	await _wait(0.42)
	# the foot through the dirt: a fan of sand at it
	var foot := _bone("RToe", 0.1)
	var to := foe_pos + Vector3(0, 0.35, 0)
	var d := (to - foot).normalized()
	fx.sand(foot + Vector3(0, 0.05, 0), d + Vector3(0, 0.22, 0), 220, 8.5 if e.hit else 5.0, 0.3)
	fx.sand(foot + Vector3(0, 0.05, 0), d + Vector3(0, 0.4, 0), 80, 6.0 if e.hit else 3.5, 0.45)
	fx.dust(foot, 10, Color("cdb68a"), 1.0, 0.6, 0.5)
	Sfx.play("scuff", ash_pos, {"vol": 2.0})
	Sfx.play("dig", ash_pos, {"vol": -2.0, "pitch": 1.2})
	Sfx.play("sand_spray", ash_pos, {"vol": -2.0})
	shake = 0.25
	await _wait(0.35)
	shot("foe_close", 6.0)
	if e.hit:
		_mood("flinch")
		fx.sand(foe_pos + Vector3(0, 0.4, 0), -fwd + Vector3(0, 0.4, 0), 24, 2.0, 0.8)
		Sfx.play("hit_soft", foe_pos, {"vol": -6.0})
		await _wait(0.2)
		_cry(1.25)
		ui.pop("ACCURACY FELL!", foe_pos + Vector3(0, 0.9, 0), UITheme.ORANGE, 22, "word")
	else:
		ui.pop("MISSED!", foe_pos + Vector3(0, 0.9, 0), Color(0.85, 0.88, 0.95), 22, "word")
		_mood("hop")
	await _wait(0.8)
	return e

func _do_startle() -> Dictionary:
	ui.say("ASH", "STARTLE!", UITheme.YELLOW)
	shot("ash_front", 6.0)
	await _wait(0.2)
	var e := R.ash_act("startle")
	_act("b_startle")
	ui.speak(["HYAAAH! Get outta here!", "RAAAH! Shoo! SHOO!", "HEY!! Back off!"][_rng.randi() % 3], _bone("Head", 1.6) + Vector3(0, 0.35, 0), 1.6)
	Sfx.play("cloth_rustle", ash_pos, {"vol": -2.0})
	Sfx.play("whoosh", ash_pos, {"vol": -4.0, "pitch": 0.6})
	for i in 3:
		fx.shout(_bone("Head", 1.5) + fwd * 0.12, fwd)
		shake = 0.3
		ui.speed_k = 0.6
		ui.speed_focus = cam.unproject_position(_bone("Head", 1.5))
		await _wait(0.36)
	shot("foe_close", 6.0)
	await _wait(0.15)
	if e.flee:
		_mood("startle")
		_cry(1.4)
		ui.pop("IT PANICKED!", foe_pos + Vector3(0, 0.9, 0), UITheme.PURPLE, 22, "word")
	elif "enraged" in e.notes:
		_mood("taunt")
		_cry(0.8)
		shake = 0.2
		ui.pop("IT'S ENRAGED!", foe_pos + Vector3(0, 0.9, 0), UITheme.RED, 22, "word")
	elif "angrier" in e.notes:
		_mood("wings_spread")
		_cry(0.9)
		ui.pop("IT'S GETTING ANGRY!", foe_pos + Vector3(0, 0.9, 0), UITheme.RED, 22, "word")
	else:
		_mood("startle")
		await _foe_move(foe_pos + fwd * 0.6, 0.25, 0.15)
		_cry(1.3)
		ui.pop("IT'S SCARED!", foe_pos + Vector3(0, 0.9, 0), UITheme.PURPLE, 22, "word")
	await _wait(0.9)
	return e

func _do_rock() -> Dictionary:
	ui.say("ASH", "THROW A ROCK!", UITheme.RED)
	shot("ash_side", 5.0)
	await _wait(0.2)
	var e := R.ash_act("rock")
	_act("b_throw")
	var rock := BattleFx.rock_node()
	rock.top_level = true
	add_child(rock)
	rock.visible = false
	# in his hand from the pick-up to the release
	var t := 0.0
	while t < 1.0:
		t += get_process_delta_time()
		if t > 0.42:
			rock.visible = true
			rock.global_position = _bone("RHand", 1.0) + Vector3(0, -0.02, 0)
		if t > 0.42 and t - get_process_delta_time() <= 0.42:
			Sfx.play("scuff", ash_pos, {"vol": -8.0})
			fx.dust(_bone("RHand", 0.1), 3, Color("cdb68a"), 0.3, 0.3, 0.25)
		await get_tree().process_frame
	Sfx.play("throw", ash_pos, {"vol": 0.0})
	Sfx.play("whoosh", ash_pos, {"vol": -8.0, "pitch": 1.3})
	# the arc: onto it, or past it
	var from := rock.global_position
	var to := foe_pos + Vector3(0, 0.35, 0)
	if not e.hit: to = foe_pos + side * (0.9 if _rng.randf() < 0.5 else -0.9) + fwd * 0.8
	var fly := 0.42
	t = 0.0
	shot("overview", 3.5)
	while t < fly:
		var dt := get_process_delta_time()
		t += dt
		var u := clampf(t / fly, 0.0, 1.0)
		var p := from.lerp(to, u) + Vector3(0, 0.9 * sin(u * PI), 0)
		rock.global_position = p
		rock.rotate_object_local(Vector3(1, 0.3, 0).normalized(), dt * 22.0)
		if _rng.randf() < 0.7: fx.spawn("streak", p, (to - from) / fly, {"life": 0.12, "size": 0.0, "len": 0.03, "w": 0.03, "col": Color(1, 1, 1, 0.5), "drag": 4.0})
		await get_tree().process_frame
	if e.hit:
		fx.impact(to, fwd, 0.7)
		fx.chips(to, 7)
		fx.feathers(to, 4)
		fx.flash(foe, Color.WHITE, 0.16)
		hitstop(0.07)
		shake = 0.35
		_mood("hurt")
		Sfx.play("hit_soft", to, {"vol": 2.0})
		Sfx.play("hit_heavy", to, {"vol": -6.0, "pitch": 1.4})
		ui.pop("-%d" % int(e.dmg), to + Vector3(0, 0.5, 0), UITheme.YELLOW, 60)
		ui.foe_hp = R.foe_hp
		rock.queue_free()
		await _foe_move(foe_pos + fwd * 0.45, 0.25, 0.12)
		await _wait(0.2)
		_cry(1.2)
		if R.outcome == "":
			ui.pop("IT'S GETTING ANGRY!", foe_pos + Vector3(0, 1.0, 0), UITheme.RED, 22, "word")
	else:
		# it lands and bounces in the dirt
		fx.dust(to, 6, Color("cdb68a"), 0.6, 0.6, 0.35)
		fx.chips(to, 3)
		Sfx.play("scuff", to, {"vol": -2.0})
		ui.pop("MISSED!", foe_pos + Vector3(0, 0.9, 0), Color(0.85, 0.88, 0.95), 22, "word")
		_mood("hop")
		var land := to
		var bounce := land + fwd * 0.8
		bounce.y = _gy(bounce) + 0.05
		t = 0.0
		while t < 0.3:
			t += get_process_delta_time()
			var u := clampf(t / 0.3, 0.0, 1.0)
			rock.global_position = land.lerp(bounce, u) + Vector3(0, 0.25 * sin(u * PI), 0)
			await get_tree().process_frame
		get_tree().create_timer(1.5).timeout.connect(func(): if is_instance_valid(rock): rock.queue_free())
	await _wait(0.7)
	return e

func _do_back_away() -> Dictionary:
	ui.say("ASH", "BACK AWAY…", UITheme.SKY)
	shot("overview", 3.0)
	var e := R.ash_act("back_away")
	ui.speak(["Easy… easy now…", "Nice Pidgey… I'm going…", "Okay, okay, I'm leaving…"][_rng.randi() % 3], _bone("Head", 1.6) + Vector3(0, 0.35, 0), 1.6)
	await _ash_move(ash_pos - fwd * 1.1, 1.3)
	if R.outcome == "ran":
		# away he goes: turn and run for it, out of the clearing
		ash_yaw = atan2(-fwd.x, -fwd.z)
		await _wait(0.15)
		var out := ash_pos - fwd * 5.5
		var from := ash_pos
		var t := 0.0
		while t < 1.1:
			t += get_process_delta_time()
			ash_pos = from.lerp(out, clampf(t / 1.1, 0.0, 1.0))
			ash_anim_speed = 6.0
			await get_tree().process_frame
		ash_anim_speed = 0.0
	elif R.outcome == "":
		_mood("taunt")
		_cry(0.9)
		ui.pop("IT WON'T LET YOU GO!", foe_pos + Vector3(0, 0.9, 0), UITheme.ORANGE, 22, "word")
		await _wait(0.6)
	return e

# ---------- the wild side's turn ----------
# one action of the wild side's turn: a plan {kind, move} (or a bare move id)
func _foe_act(p) -> void:
	var id: String = String(p.get("move", "")) if p is Dictionary else String(p)
	var kind: String = String(p.get("kind", "move")) if p is Dictionary else ("move" if not id in ["flee", "disengage"] else id)
	if kind != "move":
		R.foe_turn({"kind": kind})
		return
	# its energy is spent: the chips fly from its bar to Ash
	var h := get_node_or_null("EnergyHook")
	if h and h.has_method("on_move") and cam: h.on_move(id, cam.unproject_position(ash_pos + Vector3(0, 1.0, 0)))
	var e := R.foe_turn({"kind": "move", "move": id})
	ui.set_mood(R.mood())
	match id:
		"gust", "whirlwind": await _gust(e)
		"tackle", "wing_attack": await _tackle(e, false)
		"quick_attack": await _tackle(e, true)
		"sand_attack": await _sand_attack(e)
		_: await _tackle(e, false)   # (a move with no staging of its own yet)
	ui.set_mood(R.mood())
	await _wait(0.3)

# the stamina bar shows what the battle has taken (at the hit, not when it's decided)
func _show_sta() -> void:
	ui.ash_sta = R.ash_sta
	if body: body.set_stamina(R.ash_sta / maxf(1.0, R.ash_sta_max))

func _ash_hit(e: Dictionary, at: Vector3, power: float, react: String) -> void:
	fx.flash(player, Color.WHITE, 0.2)
	fx.impact(at, fwd * -1.0, power)
	hitstop(0.06 + 0.05 * power)
	shake = 0.5 + 0.5 * power
	ui.red_k = 1.0
	Sfx.play("hit_heavy", at, {"vol": 1.0})
	ui.pop("-%d" % int(e.dmg), at + Vector3(0, 0.6, 0), Color("ff5a4a"), 72)
	_show_sta()
	if R.outcome == "ash_down": return
	_act(react)
	Sfx.play("cloth_rustle", ash_pos, {"vol": -4.0})

func _miss_word(at: Vector3) -> void:
	ui.pop("MISSED!", at + Vector3(0, 1.0, 0), Color(0.85, 0.88, 0.95), 24, "word")

func _gust(e: Dictionary) -> void:
	ui.say(R.display_name(), "GUST!", UITheme.SKY)
	shot("gust_side", 3.5)
	_mood("gust")
	_cry(0.9)
	await _wait(0.35)
	var g := fx.gust_begin(foe_pos)
	Sfx.play("gust_vortex", foe_pos, {"vol": 2.0})
	Sfx.play("wind_gust", foe_pos, {"vol": 0.0})
	var start := foe_pos + fwd * -0.3
	var target := ash_pos + fwd * 0.15
	if not e.hit: target = ash_pos + side * (1.6 if _rng.randf() < 0.5 else -1.6) - fwd * 0.6
	var dur := 1.55
	var t := 0.0
	var beat_last := 0.0
	var shielded := false
	while t < dur:
		var dt := get_process_delta_time()
		t += dt
		var u := clampf(t / dur, 0.0, 1.0)
		# it builds where it is, then races at him
		var travel := UITheme.ease_in(clampf((u - 0.3) / 0.7, 0.0, 1.0))
		var at := start.lerp(target, travel)
		at.y = _gy(at)
		var ph: float = fmod(t * 3.2, 1.0)
		var pulse := clampf(sin(ph * TAU), 0.0, 1.0)
		if "beat_phase" in foe:
			# CreaturePidgey: the push is its downstroke (beat_phase 0 .. 0.5)
			ph = float(foe.beat_phase)
			pulse = sin(clampf(ph / 0.5, 0.0, 1.0) * PI) if bool(foe.get("gusting")) else 0.0
		elif "wing_phase" in foe:
			ph = float(foe.wing_phase)
			pulse = clampf(sin(ph * TAU), 0.0, 1.0)
		if ph < beat_last: Sfx.play("wing_flap_large", foe_pos + Vector3(0, 0.8, 0), {"vol": 0.0})
		beat_last = ph
		fx.gust_move(g, at, clampf(u * 2.5, 0.0, 1.0), pulse, (target - start).normalized())
		wind = sin(_t * 9.0) * 1.2 * clampf(u * 2.0, 0.0, 1.0) + pulse * 1.5
		shake = maxf(shake, 0.08 + 0.25 * travel)
		if not shielded and u > 0.35:
			shielded = true
			_act("b_shield", 2.4)
			shot("impact", 2.2)
		await get_tree().process_frame
	if e.hit:
		fx.gust_hit(g, ash_pos)
		_ash_hit(e, ash_pos + Vector3(0, 1.0, 0), 1.0, "b_knock")
		Sfx.play("whoosh", ash_pos, {"vol": 2.0, "pitch": 0.8})
		# shoved back across the dirt, shielding his face
		var back := ash_pos - fwd * 1.3
		fx.dust(ash_pos, 8, Color("cdb68a"), 0.8, 0.4, 0.4)
		await _ash_move(back, 0.55, false)
		fx.dust(ash_pos, 5, Color("cdb68a"), 0.6, 0.3, 0.35)
	else:
		fx.gust_hit(g, target)
		_miss_word(ash_pos)
	# the funnel blows on past and comes apart
	var past := target - fwd * 2.0
	t = 0.0
	while t < 0.45:
		var dt := get_process_delta_time()
		t += dt
		var at2 := target.lerp(past, t / 0.45)
		at2.y = _gy(at2)
		fx.gust_move(g, at2, 1.0 - t / 0.45, 0.0, -fwd)
		wind = lerpf(wind, 0.0, 1.0 - exp(-dt * 6.0))
		await get_tree().process_frame
	fx.gust_end(g)
	wind = 0.0
	_mood("land")
	await _wait(0.6)
	await _recover()

func _tackle(e: Dictionary, quick: bool) -> void:
	ui.say(R.display_name(), "QUICK ATTACK!" if quick else "TACKLE!", Color.WHITE if quick else UITheme.ORANGE)
	shot("foe_close", 5.0)
	_mood("quick_attack" if quick else "tackle")
	if not quick:
		_cry(0.85)
		Sfx.play("scuff", foe_pos, {"vol": -4.0})
		fx.dust(foe_pos, 4, Color("cdb68a"), 0.5, 0.3, 0.3)
		await _wait(0.32)
	else:
		await _wait(0.12)
	var home := foe_pos
	var hit_at := ash_pos + fwd * 0.45
	if not e.hit: hit_at = ash_pos + side * 0.4 - fwd * 1.4   # (he ducks aside: it shoots past)
	Sfx.play("whoosh", foe_pos, {"vol": 0.0, "pitch": 1.4 if quick else 1.0})
	shot("qa" if quick else "impact", 5.0)
	if quick:
		# zig, zag, in: white streaks left where it was
		var pts := [home, home.lerp(hit_at, 0.35) + side * 1.1, home.lerp(hit_at, 0.7) - side * 1.0, hit_at]
		for i in 3:
			var a: Vector3 = pts[i]
			var b: Vector3 = pts[i + 1]
			foe_yaw = atan2(b.x - a.x, b.z - a.z)
			await _foe_move(b, 0.09, 0.12, _qa_trail)
	else:
		foe_yaw = atan2(hit_at.x - home.x, hit_at.z - home.z)
		await _foe_move(hit_at, 0.24, 0.25, _dash_trail, 2)
	if e.hit:
		_ash_hit(e, ash_pos + Vector3(0, 0.95, 0) + fwd * 0.2, 0.8 if quick else 1.0, "b_flinch" if quick else "b_knock")
		fx.feathers(foe_pos + Vector3(0, 0.4, 0), 3)
		fx.dust(ash_pos, 5, Color("cdb68a"), 0.6, 0.3, 0.35)
		if not quick and R.outcome != "ash_down":
			await _ash_move(ash_pos - fwd * 0.7, 0.35, false)
		# it springs back off him
		foe_yaw = atan2(-fwd.x, -fwd.z)
		await _foe_move(home, 0.5, 0.6, Callable(), 1)
	else:
		_act("b_flinch")
		_miss_word(ash_pos)
		await _wait(0.2)
		foe_yaw = atan2(home.x - foe_pos.x, home.z - foe_pos.z)
		await _foe_move(home, 0.55, 0.4, Callable(), 1)
		foe_yaw = atan2(-fwd.x, -fwd.z)
	await _wait(0.3)
	await _recover()

func _qa_trail(_u: float) -> void:
	fx.afterimage(foe_pos, _foe_vel, 0.5)
	fx.speed_lines(foe_pos, _foe_vel, 2)

func _dash_trail(_u: float) -> void:
	fx.speed_lines(foe_pos, _foe_vel, 4)
	ui.speed_k = 0.85
	ui.speed_focus = cam.unproject_position(ash_pos + Vector3(0, 1.0, 0))

func _sand_attack(e: Dictionary) -> void:
	ui.say(R.display_name(), "SAND-ATTACK!", Color("e0a84a"))
	shot("foe_close", 5.0)
	# turned half away, it beats its wings low and kicks the sand up at him
	var yaw0 := foe_yaw
	var t := 0.0
	while t < 0.25:
		t += get_process_delta_time()
		foe_yaw = lerp_angle(yaw0, yaw0 + 2.4, t / 0.25)
		await get_tree().process_frame
	_mood("sand_attack")
	Sfx.play("wing_flap_small", foe_pos, {"vol": 0.0})
	Sfx.play("sand_spray", foe_pos, {"vol": 0.0})
	t = 0.0
	var acc := 0.0
	shot("impact", 3.0)
	while t < 0.8:
		var dt := get_process_delta_time()
		t += dt
		acc += dt
		if acc > 0.08:
			acc = 0.0
			var face := ash_pos + Vector3(0, 1.45 if e.hit else 0.6, 0) + (side * 1.2 if not e.hit else Vector3.ZERO)
			var from := foe_pos + Vector3(0, 0.12, 0) - fwd * 0.1
			fx.sand(from, (face - from).normalized(), 30, 9.0, 0.22)
			Sfx.play("dig", foe_pos, {"vol": -8.0, "pitch": 1.3})
		if t > 0.55 and e.hit and ui.sand_k < 0.9:
			ui.sand_k = 1.0
			_act("b_rub")
			ui.speak(["Agh! My eyes!", "Ow! I can't see!", "Pfft! Sand!"][_rng.randi() % 3], _bone("Head", 1.6) + Vector3(0, 0.35, 0), 1.6)
		await get_tree().process_frame
	t = 0.0
	while t < 0.25:
		t += get_process_delta_time()
		foe_yaw = lerp_angle(yaw0 + 2.4, yaw0, t / 0.25)
		await get_tree().process_frame
	foe_yaw = yaw0
	if e.hit:
		ui.pop("AIM FELL!", ash_pos + Vector3(0, 2.0, 0), UITheme.ORANGE, 22, "word")
		Sfx.play("hit_soft", ash_pos, {"vol": -8.0})
	else:
		_act("b_flinch")
		_miss_word(ash_pos)
	await _wait(1.0)

# back on his spot after being pushed, facing it
func _recover() -> void:
	if R.outcome == "ash_down": return
	var spot := ash_spot
	if ash_pos.distance_to(Vector3(spot.x, ash_pos.y, spot.z)) > 0.3:
		await _ash_move(Vector3(spot.x, ash_pos.y, spot.z), 0.7)

# ---------- the end ----------
func _outcome() -> void:
	ui.close_menu()
	var oc := R.outcome
	_show_sta()
	result = {"outcome": oc, "species": species, "stamina": R.ash_sta / maxf(1.0, R.ash_sta_max), "foe_hp": R.foe_hp, "turns": R.turn, "creature": foe if not own_foe else null}
	match oc:
		"fled":
			shot("flee", 3.0)
			_mood("flee")
			_cry(1.3)
			Sfx.play("wing_flap_large", foe_pos, {"vol": 2.0})
			fx.dust(foe_pos, 8, Color("cdb68a"), 0.8, 0.5, 0.4)
			ui.show_outcome(R.display_name() + " FLED!", "It flew off in a panic", UITheme.PURPLE)
			var away := foe_pos + fwd * 9.0 + side * 2.0
			await _foe_move(away, 1.3, 2.5, Callable(), 2)
		"disengaged":
			ui.show_outcome(R.display_name() + " LOST INTEREST", "It doesn't see you as a threat", UITheme.SKY)
			_mood("look")
			await _wait(0.6)
			foe_yaw = atan2(fwd.x, fwd.z)
			foe_speed = 0.8
			await _foe_move(foe_pos + fwd * 3.5 + side * 1.0, 2.2)
			foe_speed = 0.0
		"ash_won":
			ui.show_outcome(R.display_name() + " WAS DRIVEN OFF!", "Dazed, it flutters away", UITheme.GREEN)
			_mood("faint")
			await _wait(1.4)
			_mood("flee")
			await _foe_move(foe_pos + fwd * 8.0, 1.4, 2.0, Callable(), 2)
		"ran":
			ui.show_outcome("GOT AWAY SAFELY!", "", UITheme.GREEN)
			await _wait(1.2)
		"ash_down":
			await _ash_down()
			return
	await _wait(1.0)
	await _close()

func _ash_down() -> void:
	ui.close_menu()
	slowmo(0.35, 0.9)
	_act("b_crumple", 1e6)
	shot("down", 2.0)
	get_tree().create_timer(2.2).timeout.connect(func(): lie_down(1.0, false, 1.1); Sfx.play("land_dirt", ash_pos, {"vol": -4.0}))
	Sfx.play("scuff", ash_pos, {"vol": 2.0})
	await _wait(0.5)
	fx.dust(ash_pos, 10, Color("cdb68a"), 1.0, 0.3, 0.5)
	Sfx.play("land_dirt", ash_pos, {"vol": 0.0})
	ui.show_hud(false)
	await _wait(0.6)
	ui.show_outcome("ASH IS WORN OUT!", "Too exhausted and sore to go on…", UITheme.RED)
	_mood("taunt")
	_cry(0.8)
	await _wait(1.6)
	# the bird has made its point: off it goes
	shot("flee", 2.0)
	_mood("flee")
	Sfx.play("wing_flap_large", foe_pos, {"vol": 0.0})
	await _foe_move(foe_pos + fwd * 9.0, 1.5, 3.0, Callable(), 2)
	if own_foe and foe: foe.visible = false
	if BattleDefeat.applies(game):
		var d := BattleDefeat.new()
		d.name = "Defeat"
		add_child(d)
		await d.run(self)
	else:
		# somewhere else, or he has a Pokémon: he picks himself up, sore
		await _wait(1.5)
		BattleDefeat.aftermath(_quests(), cast.conditions if cast else null, body, false)
		if player and player.idles: player.idles.release()
		await _wait(1.0)
		await _close()
		return
	await _close(true)

func _quests() -> Node:
	return cast.life.quests if cast and cast.life else null

# the arena slides back, the camera goes home, the controls come back
func _close(instant := false) -> void:
	ui.show_hud(false)
	ui.close_menu()
	if instant:
		arena_k = 0.0; _arena_t = -1.0
	else:
		_arena_go(0.0, CLOSE_T)
		Sfx.play("whoosh", null, {"vol": -8.0, "pitch": 0.6})
		await _wait(CLOSE_T + 0.1)
	_finish()

func _finish() -> void:
	if done: return
	done = true
	arena_k = 0.0
	RenderingServer.global_shader_parameter_set("battle_arena", Vector4(0, 0, 0, 0))
	RenderingServer.global_shader_parameter_set("battle_arena_v", 0.0)
	Engine.time_scale = 1.0
	cam_on = false
	game.cam_ease = 1.0
	game.cam_yaw = ash_yaw + PI
	game.speed = 0.0
	if player:
		player.rotation = Vector3(0, player.rotation.y, 0)
		lie_down(0.0, true)
		if player.idles:
			player.idles.stance = _prev_stance
			if player.idles.acting().begins_with("b_"): player.idles.release()
	for n in _hidden: if is_instance_valid(n): n.visible = true
	_hidden.clear()
	fx.clear()
	var h := get_node_or_null("EnergyHook")
	if h: h.detach()
	if foe and is_instance_valid(foe):
		foe.remove_meta("battle")
		if own_foe: foe.queue_free()
	active = false
	if current == self: current = null
	finished.emit(result)
	var cb = opts.get("on_finished")
	if cb is Callable and cb.is_valid(): cb.call(result)
	queue_free()

func _hide(n: Node) -> void:
	if n and "visible" in n and n.visible:
		n.visible = false
		_hidden.append(n)

func _exit_tree() -> void:
	if current == self:
		active = false; current = null
		Engine.time_scale = 1.0
		RenderingServer.global_shader_parameter_set("battle_arena", Vector4(0, 0, 0, 0))
