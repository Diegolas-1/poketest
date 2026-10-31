class_name Battle
extends Node3D
# A battle with a wild Pokémon, where Ash meets it (Route 1's tall grass first;
# the trigger is generic: wild/wild.gd starts it, or anything else later):
#
#   var b := Battle.start(game, {"species": "pidgey", "creature": node, "at": Vector3,
#       "temper": "flighty" | "aggressive" | "curious" | "timid",
#       "state": "hidden" | "startled" | "fleeing" | "attacking",
#       "where": "tall_grass", "first_strike": "ash" | "wild"})
#   b.finished.connect(func(result): ...)   # {outcome: fled | disengaged | ash_won | ash_down | ran | caught, ...}
#   Battle.active                            # true while one is on (other systems pause)
#   Battle.current                           # the one on, or null
#   Battle.world_paused()                    # one with opts.pause_world is on: the world
#                                            # outside waits (the clock, the townspeople,
#                                            # the other wild Pokémon: cast.gd, wild.gd)
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
# Ash has no Pokémon (mode "prologue": no has_starter flag), so he can't fight
# it; all he can do (battle_ui.gd's menu) is RUN, HIDE in the grass, or THROW
# SOMETHING at it (a rock, or a handful of sand). The rules are battle_rules.gd's (data in
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
# Staged battles (the Battle Arena, arena/arena.gd) may also pass:
#   "gap": m           Ash to the foe (default GAP), "partner_ahead": m (PARTNER_AHEAD):
#                      a formal field, the trainers at its ends, the Pokémon between
#   "staged": true     the opening was already played (the formal bow, the coin, the
#                      balls thrown): no banner, the two Pokémon grow out of the
#                      release flash, the camera cranes up from where it is
#   "party_a" / "party_b": teams (battle_pkmn.gd, battle/pkmn_party.gd); "log": the HUD's log
# swap_creature(side, species) puts a new Pokémon on a side's spot (a switch).
# Ambushes (wild/ambush.gd) may also pass:
#   "pause_world": true   the world outside waits while it runs (world_paused)
#   "keep_partner": true  partner_node is his own Pokémon from the world: left there at the end
#   "partner_node2"       doubles: his second one already out, it steps in (battle_pkmn.gd)
#   "banner": text        the intro's name ("BEEDRILL SWARM": WILD BEEDRILL SWARM!)
#   "waves": true         doubles against a team: the next two only once both are down
#
# ---- Poké Balls (battle/catch_rules.gd, catch_show.gd, pkmn_store.gd) ----
# A wild one can be caught: BALL in either mode (the prologue's menu only once
# the bag has balls: the story gives him none before his first Pokémon), the
# throw takes his turn; a catch ends the battle with outcome "caught" (the
# result's "caught": {species, level, ball, to: party | box, store}). The bag,
# the party and the PC are PkmnStore.main()'s (the save), or opts:
#   "store": a PkmnStore      "catch_store": "arena" (PkmnStore.arena(): kept apart)
#   "balls": "unlimited"      (a staging option: no count kept)
#   "script_ball": {"ball", "turn", "caught", "wobbles"} or a list of them (scripted
#                  renders: that throw on that turn, its result forced)
#
# Dev: dev/battle_dev.tscn starts one in Route 1's tall grass (scripted for
# renders: --acts=, --moves=, --hit=1); dev/battle_test.tscn checks the rules.

signal finished(result: Dictionary)

const ARENA_R := 5.6           # the floor kept clear (m): a ~11 m circle (the 10 x 10 m arena)
const GAP := 4.4               # Ash to the Pokémon (m)
const PARTNER_AHEAD := 1.8     # mode "pkmn": his Pokémon this far ahead of him
const PK_GAP := 7.6            # mode "pkmn" (unless staged with its own "gap"): Ash to the foe, room for a real fight
const PK_AHEAD := 2.9          # and his Pokémon this far ahead of him: a trainer commanding from behind (4.7 m between the two)
const PARTNER_SIDE := 0.7      # and this far to his right (he stands behind and beside it)
const FOE_SCALE := 1.0        # the Pokémon's battle presence (the foe's, a partner's): 1 = the size it is in the world (Creature.SIZE), so nothing swells as the arena opens
const OPEN_T := 1.35           # the spread (s)
const CLOSE_T := 1.1

static var active := false
static var current: Battle = null

static func world_paused() -> bool:
	return active and current != null and is_instance_valid(current) and bool(current.opts.get("pause_world", false))

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
var _foe_scale0 := Vector3.ONE

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
const MODE_PKMN := "pkmn"
var mode := BattleRules.MODE_PROLOGUE   # see _begin: "prologue" (no partner Pokémon) or "pkmn"
var pk: BattlePkmn                      # the Pokémon battle's host (mode "pkmn")
var partner: Node3D                     # his Pokémon, in front of him (mode "pkmn")
var partner_pos := Vector3.ZERO
var partner_yaw := 0.0
var script_moves: Array = []
var force_hit := -1             # 1 every attack lands, 0 every attack misses, -1 the dice
var auto_delay := 0.9
var _choice := ""
var _prev_stance := ""
var _prev_hold := false
var arena_r := ARENA_R          # the floor kept clear: ARENA_R, more for a wider field (mode "pkmn")
var _hidden: Array = []
var gap := GAP                  # Ash to the foe (opts.gap)
var ceiling := 0.0              # under a canopy: the camera kept this low over the ground (m, 0: no limit)
var partner_ahead := PARTNER_AHEAD
var appear := 1.0               # staged: the Pokémon grow out of the release flash (0 -> 1)
var store: PkmnStore            # the bag's balls, the party and the PC (a catch goes there)
var catch_off := Vector3.ZERO   # the foe drawn into a ball (catch_show.gd)
var caught_info := {}           # a catch: what the result's "caught" carries

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
	# THE MODE SWITCH. One stage (the arena, the camera, the effects), the rules by mode:
	#   "prologue"  Ash has no partner Pokémon (no has_starter flag): he can only
	#               run, hide or throw something (battle_rules.gd, BattleUI's menu)
	#   "pkmn"      Pokémon against Pokémon (battle/pkmn_battle.gd, ui/pkmn_hud.gd:
	#               FIGHT, POKéMON, ITEMS, FLEE), his partner in front of him, Ash
	#               behind it as its trainer (battle_pkmn.gd hosts it here)
	# opts.mode picks one; else a "partner" in opts, or the has_starter flag, means "pkmn".
	mode = String(o.get("mode", ""))
	if mode == "":
		var q := _quests()
		mode = MODE_PKMN if o.has("partner") or (q != null and q.flag("has_starter")) else BattleRules.MODE_PROLOGUE
	R.mode = BattleRules.MODE_PROLOGUE
	script_acts = Array(o.get("script_acts", []))
	script_moves = Array(o.get("script_moves", []))
	force_hit = int(o.get("force_hit", -1))
	R.force = force_hit
	R.force_run = int(o.get("force_run", -1))
	R.force_found = int(o.get("force_found", -1))
	auto_delay = float(o.get("auto_delay", 0.9))
	gap = float(o.get("gap", PK_GAP if mode == MODE_PKMN else GAP))
	partner_ahead = float(o.get("partner_ahead", PK_AHEAD if mode == MODE_PKMN else PARTNER_AHEAD))
	if R.S.get("name", "") == "PIDGEY" and species != "pidgey":
		# (an unknown species fights by Pidgey's rules: its own name on the banner)
		R.S = R.S.duplicate()
		R.S["name"] = String(BattleEnergy.species_data(species).get("name", species.capitalize())).to_upper()
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
	_store_setup()
	_place()
	ceiling = float(o.get("ceiling", _ceiling_at(c)))
	if mode == MODE_PKMN:
		pk = BattlePkmn.new()
		pk.name = "Pkmn"
		add_child(pk)
		pk.setup(self)
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
	foe_spot = ash_spot + fwd * gap
	c = ash_spot + fwd * gap * 0.5
	if opts.has("partner_ahead"): c = (ash_spot + fwd * partner_ahead).lerp(foe_spot, 0.5)   # (the middle between the two Pokémon)
	ash_spot.y = _gy(ash_spot); foe_spot.y = _gy(foe_spot); c.y = _gy(c)
	ash_yaw = game.yaw
	foe_yaw = atan2(-fwd.x, -fwd.z)
	# the clear floor reaches past Ash and the foe (a staged field keeps its own size)
	arena_r = maxf(ARENA_R, maxf(c.distance_to(ash_spot), c.distance_to(foe_spot)) + 1.9) if not bool(opts.get("staged", false)) else ARENA_R

func _gy(p: Vector3) -> float: return game.world.height_at(p.x, p.z)

# a Battle Arena region under trees (its def's "battle_ceiling", arena/regions/*.gd):
# the shots stay below the crowns, so they look across at the Pokémon, not down
# through the leaves
static func _ceiling_at(p: Vector3) -> float:
	if BattleArena.I == null: return 0.0
	var id := ArenaRegions.at(p.x - ArenaData.C.x, p.z - ArenaData.C.y)
	return float(ArenaRegions.get_def(id).get("battle_ceiling", 0.0)) if id != "" else 0.0

func _make_foe() -> void:
	var given = opts.get("creature")
	if given is Node3D and is_instance_valid(given):
		foe = given
	else:
		own_foe = true
		if ResourceLoader.exists("res://creatures/%s.glb" % species): foe = Creature.make(species)
		elif species == "pidgey": foe = PidgeyStandin.new()
		else: foe = PkmnStandin.make(species)
		add_child(foe)
	foe.set_meta("battle", true)
	_foe_scale0 = foe.scale
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
	_put_partner(dt)
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
	foe.global_position = foe_pos + Vector3(0, foe_lift, 0) + catch_off
	foe.rotation = Vector3(0, foe_yaw, 0)
	foe.scale = _foe_scale0 * lerpf(1.0, FOE_SCALE, clampf(arena_k, 0.0, 1.0)) * maxf(appear * foe_appear, 0.001)
	_foe_vel = (foe_pos - _foe_last) / maxf(dt, 1e-4)
	_foe_last = foe_pos
	if foe.has_method("animate"): foe.animate(dt, foe_speed)
	if "look_at_pos" in foe: foe.look_at_pos = ash_pos + Vector3(0, 1.3, 0)

func _menu_input() -> void:
	if not ui.menu_on: return
	if Input.is_action_just_pressed("move_up") or Input.is_action_just_pressed("ui_up"): ui.move(-1)
	if Input.is_action_just_pressed("move_down") or Input.is_action_just_pressed("ui_down"): ui.move(1)
	if Input.is_action_just_pressed("use") or Input.is_action_just_pressed("ui_accept"): ui.confirm()
	if Input.is_action_just_pressed("back") or Input.is_action_just_pressed("ui_cancel"): ui.back()

func _unhandled_key_input(e: InputEvent) -> void:
	if not ui or not ui.menu_on: return
	if e is InputEventKey and e.pressed and not e.echo:
		var k: int = e.physical_keycode - KEY_1
		if k >= 0 and k < ui.items.size():
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
		# the parting ring: dust and torn blades thrown off the edge as it sweeps out (and in)
		if fx and u < 0.85: _ring_fx(clampf(arena_k, 0.05, 1.0) * arena_r, 1.0 - u, _arena_to > _arena_from)
	var v := (arena_k - _arena_last) / maxf(dt, 1e-4)
	_arena_last = arena_k
	RenderingServer.global_shader_parameter_set("battle_arena", Vector4(c.x, c.z, arena_r, arena_k))
	RenderingServer.global_shader_parameter_set("battle_arena_v", v + wind)

func _ring_fx(r: float, k: float, out: bool) -> void:
	for i in 3:
		var a := _rng.randf() * TAU
		var d := Vector3(cos(a), 0, sin(a))
		var p := c + d * r
		p.y = _gy(p)
		var v := d * _rng.randf_range(1.5, 3.5) * (1.0 if out else -0.6) + Vector3(0, _rng.randf_range(0.8, 2.0), 0)
		fx.spawn("soft", p + Vector3(0, 0.15, 0), v * 0.5, {"life": _rng.randf_range(0.6, 1.0), "size": 0.35, "size_end": 0.9, "col": Color(Color("cdb68a"), 0.4 * k), "drag": 2.5})
		if _rng.randf() < 0.8:
			fx.spawn("blade", p + Vector3(0, 0.3, 0), v, {"life": _rng.randf_range(0.7, 1.2), "size": _rng.randf_range(0.6, 1.0), "col": Color(Color("4f9a2c").lerp(Color("a6d860"), _rng.randf()), 1.0), "grav": 3.0, "drag": 1.5, "tumble_k": 6.0, "floor": true})
		if _rng.randf() < 0.25:
			fx.spawn("leaf", p + Vector3(0, 0.5, 0), v * 0.8, {"life": 1.2, "size": 1.0, "col": Color(Color("6aa83a").lerp(Color("c9b36a"), _rng.randf()), 1.0), "grav": 1.0, "drag": 2.0, "tumble_k": 5.0, "floor": true})

# the camera on a crane: from wherever it is up and round to a shot over secs,
# rising above the straight line on the way (then the shot holds it)
func _crane(n: String, secs: float, rise := 1.6) -> void:
	_shot = {}
	var p0 := cam_pos
	var l0 := cam_look
	var f0 := cam_fov
	var t := 0.0
	while t < secs:
		t += get_process_delta_time()
		var u := clampf(t / secs, 0.0, 1.0)
		var e := u * u * (3.0 - 2.0 * u)
		var to := _shot_xf(n)
		cam_pos = p0.lerp(to.pos, e) + Vector3(0, sin(e * PI) * rise, 0)
		cam_look = l0.lerp(to.look, e)
		cam_fov = lerpf(f0, float(to.fov), e)
		await get_tree().process_frame
	shot(n, 3.0)

# ---------- the camera ----------
# the shots, in the arena's frame
func _shot_xf(n: String) -> Dictionary:
	var up := Vector3.UP
	var foe_p := foe_pos
	match n:
		# the high diagonal: up behind Ash's right shoulder, looking down across the arena at it
		"overview":
			if pk:
				# mode "pkmn", the choosing frame: high behind Ash's right, the whole field in
				# it (Ash back by the near edge, his Pokémon, the foe facing); scaled to the field
				var fr := _pk_frame()
				var k: float = fr.k
				return {"pos": fr.c - fwd * 5.2 * k + side * 5.4 * k + up * 4.4 * k, "look": fr.c + up * 0.35 - side * 0.3 * k, "fov": 42.0}
			return {"pos": c - fwd * 3.9 + side * 2.9 + up * 5.0, "look": c + fwd * 0.45 + up * 0.2, "fov": 46.0}
		"overview2": return {"pos": c - fwd * 3.6 - side * 4.8 + up * 6.0, "look": c + up * 0.4, "fov": 50.0}
		"gust_side": return {"pos": c + side * 6.0 - fwd * 2.2 + up * 2.6, "look": c + fwd * 0.2 + up * 0.9, "fov": 58.0}
		"ash_front": return {"pos": ash_pos + fwd * 3.0 + side * 1.4 + up * 1.35, "look": ash_pos + up * 1.15, "fov": 44.0}
		"ash_side": return {"pos": ash_pos + side * 3.1 - fwd * 0.6 + up * 1.7, "look": ash_pos + fwd * 1.7 + up * 0.7, "fov": 50.0}
		"foe_close": return {"pos": ash_pos - fwd * 0.9 + side * 2.0 + up * 1.9, "look": foe_p + up * 0.4 - side * 0.3, "fov": 38.0}
		"qa": return {"pos": c + side * 5.0 - fwd * 0.8 + up * 2.2, "look": c - fwd * 0.6 + up * 0.6, "fov": 52.0}
		"impact": return {"pos": ash_pos + fwd * 2.6 + side * 2.6 + up * 1.6, "look": ash_pos + up * 0.9, "fov": 50.0}
		"run": return {"pos": ash_spot - fwd * 4.6 + side * 3.4 + up * 2.4, "look": ash_pos - fwd * 0.4 + up * 0.7, "fov": 50.0}
		# mode "pkmn". Every shot keeps to one side of the line between the two sides
		# (the +side half, Ash's right: the 180 degree rule), so his side stays near
		# the lens and screen left / right never swap between cuts.
		# the turn playing out: lower and nearer than the overview, both sides in it
		"duel":
			var fd := _pk_frame()
			var kd: float = fd.k
			var md: Vector3 = (fd.c as Vector3).lerp(partner_pos.lerp(foe_p, 0.5), 0.25)
			return {"pos": md - fwd * 4.4 * kd + side * 5.4 * kd + up * 3.0 * kd, "look": md + up * 0.45, "fov": 44.0}
		# a big move: over his partner's shoulder at the foe, and over the foe's at his partner
		"pk_a": return {"pos": partner_pos - fwd * 1.1 + side * 2.3 + up * 1.6, "look": foe_p + up * 0.3 - fwd * 0.9, "fov": 46.0}
		"pk_b":
			# (a big foe, a Beedrill's wings at its battle size: the lens further off it)
			var kb := clampf(float(Creature.species_info(species).get("height", 0.5)) / 0.75, 1.0, 1.5)
			return {"pos": foe_p + fwd * 1.8 * kb + side * 2.4 * kb + up * 1.8 * sqrt(kb), "look": partner_pos + up * 0.3 + fwd * 0.6, "fov": 48.0}
		# a faint: in on the one going down, from the same side
		"pk_down_a": return {"pos": partner_pos + side * 2.4 - fwd * 0.5 + up * 1.2, "look": partner_pos + up * 0.25, "fov": 42.0}
		"pk_down_b": return {"pos": foe_p + side * 2.6 - fwd * 0.9 + up * 1.3, "look": foe_p + up * 0.3, "fov": 42.0}
		"hide": return {"pos": ash_pos + fwd * 2.3 + side * 1.3 + up * 1.0, "look": ash_pos + up * 0.45, "fov": 44.0}
		"down": return {"pos": ash_pos - side * 2.0 + fwd * 1.4 + up * 1.1, "look": ash_pos + up * 0.3, "fov": 46.0}
		"flee": return {"pos": c - fwd * 5.5 + side * 3.0 + up * 3.2, "look": foe_p + up * 1.2, "fov": 52.0}
	return _shot_xf("overview")

# mode "pkmn": the field the wide shots frame, from Ash to the foe (its centre a little
# toward the Pokémon), and its scale (1 for the default wild spacing; doubles wider)
func _pk_frame() -> Dictionary:
	var a := Vector3(ash_pos.x, partner_pos.y, ash_pos.z)
	var m := partner_pos.lerp(foe_pos, 0.5)
	var span := a.distance_to(foe_pos)
	var k := clampf(span / (PK_GAP - 0.4), 0.75, 1.5)
	if pk and pk.D != null: k *= 1.2
	return {"c": m.lerp(a, 0.28), "k": k}

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
	if ceiling > 0.0: p.y = minf(p.y, maxf(gy, _gy(p) + ceiling))
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
		# the world HUD's corners (the clock, the quest log button, the settings cog) give way to the battle's
		if Settings.menu and Settings.menu.get("cog"): _hide(Settings.menu.cog)
		if cast.clock and cast.clock.hud: _hide(cast.clock.hud)
		if cast.life and cast.life.quests and cast.life.quests.ui and cast.life.quests.ui.get("btn"): _hide(cast.life.quests.ui.btn)
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
	# a flash and the banner over the live scene; under the flash the two square up
	# (staged: the opening has been played, the Pokémon grow out of their release flashes)
	var staged := bool(opts.get("staged", false))
	if staged:
		if not opts.has("creature"):
			appear = 0.0
			var tw := create_tween()
			tw.tween_property(self, "appear", 1.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		Sfx.play("encounter", null, {"vol": -1.0})
		ui.intro_wild = not opts.has("trainer")
		ui.intro(_intro_name(), _intro_sub())
	ash_yaw = atan2(fwd.x, fwd.z)
	if player and player.idles:
		# mode "pkmn": the trainer's stance, and his acting (battle/pkmn_acts.gd) instead of idles
		if pk: PkmnActs.register()
		player.idles.stance = "pk_ready" if pk else "battle"
		_prev_hold = player.idles.hold
		player.idles.hold = true   # (no random idle acting in a battle: only the battle's own)
	foe_pos = foe_spot
	foe_yaw = atan2(-fwd.x, -fwd.z)
	_stage_partner()
	await _wait(0.3)
	# the rise: the camera cranes up and round to the high diagonal while the
	# world parts round them in a ring (grass, bushes, trees sliding outward)
	_crane("overview", 1.5)
	_arena_go(1.0, OPEN_T)
	Sfx.play("wind_gust", c, {"vol": -4.0})
	Sfx.play("whoosh", null, {"vol": -6.0, "pitch": 0.7})
	await _wait(0.85)
	# revealed in the middle of it: wings thrown wide
	_mood("wings_spread")
	_cry()
	await _wait(0.85)
	if pk:
		# the Pokémon battle plays out on this stage, then the arena closes
		Sfx.ui("ui_banner")
		await pk.run()
		await _close()
		return
	ui.show_hud(true)
	Sfx.ui("ui_banner")
	# the energy system (battle/energy_hook.gd): the foe's bar, and its turn plans
	EnergyHook.attach(self, {"species": species, "level": R.level(), "temper": String(opts.get("temper", "flighty"))})
	await _wait(0.5)
	# ---- the turns ----
	# A turn: the wild side's picks for it (_wild_pick: as many as its energy
	# pays for, through the EnergyHook; one a turn without it), those that go first
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
		if R.hiding and R.outcome == "": await _unhide()
		R.end_turn()
	await _outcome()

# the banner: "WILD PIDGEY!" (or a trainer's name), and a line under it
func _intro_name() -> String:
	if opts.has("banner"): return String(opts.banner)
	if pk: return pk.intro_name()
	return R.display_name()

func _intro_sub() -> String:
	if pk: return pk.intro_sub()
	return "LV. %d  ·  %s" % [R.level(), String(opts.get("temper", "flighty")).to_upper()]

# mode "pkmn": his Pokémon steps out in front of him (Ash stays back, its trainer)
func _stage_partner() -> void:
	if pk == null: return
	partner = pk.make_partner()
	if partner == null: return
	partner_pos = ash_spot + fwd * partner_ahead + side * PARTNER_SIDE
	partner_pos.y = _gy(partner_pos)
	partner_yaw = atan2(fwd.x, fwd.z)
	partner.global_position = partner_pos
	partner.rotation = Vector3(0, partner_yaw, 0)
	fx.dust(partner_pos, 6, Color("cdb68a"), 0.6, 0.4, 0.35)

# a switch: a new Pokémon on a side's spot (the old one goes); it grows in with k (partner_appear / foe_appear)
var partner_appear := 1.0
var foe_appear := 1.0
func swap_creature(s: String, sp: String) -> Node3D:
	var n: Node3D = Creature.make(sp) if ResourceLoader.exists("res://creatures/%s.glb" % sp) else (PidgeyStandin.new() if sp == "pidgey" else PkmnStandin.make(sp))
	add_child(n)
	if s == "a":
		if partner and is_instance_valid(partner): partner.queue_free()
		partner = n
		n.top_level = true
		n.global_position = partner_pos
		n.rotation = Vector3(0, partner_yaw, 0)
		n.scale = Vector3.ONE * 0.001
	else:
		if foe and is_instance_valid(foe):
			if own_foe: foe.queue_free()
			else: foe.remove_meta("battle"); foe.visible = false
		foe = n
		own_foe = true
		species = sp
		foe.set_meta("battle", true)
		_foe_scale0 = Vector3.ONE
		if "battle" in foe: foe.battle = true
		if "auto" in foe: foe.auto = false
		if "act_reach" in foe: foe.act_reach = 0.0
		if "gust_beats" in foe: foe.gust_beats = 3
		foe.scale = Vector3.ONE * 0.001
	return n

func _put_partner(dt: float) -> void:
	if partner == null or not is_instance_valid(partner): return
	partner.global_position = partner_pos + Vector3(0, pk.lift("a") if pk else 0.0, 0)
	partner.rotation = Vector3(0, partner_yaw, 0)
	partner.scale = Vector3.ONE * lerpf(1.0, FOE_SCALE, clampf(arena_k, 0.0, 1.0)) * maxf(appear * partner_appear, 0.001)   # (the same battle presence as the foe's)
	if partner.has_method("animate"): partner.animate(dt, 0.0)

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
		# (a throw goes through THROW SOMETHING's list, as a player would)
		var path: Array = [want]
		for i in ui.top_items.size():
			var sub_id := String(ui.top_items[i].get("sub", ""))
			if sub_id != "":
				for it in ui.subs.get(sub_id, []):
					if String(it.id) == want: path = [String(ui.top_items[i].id), want]
		for step in path:
			var idx := 0
			for i in ui.items.size():
				if String(ui.items[i].id) == step: idx = i
			await _wait(auto_delay * 0.5)
			ui.sel = idx
			await _wait(auto_delay * 0.5)
			ui._pick(idx)
		return want
	ui.open_menu()
	while _choice == "":
		await get_tree().process_frame
		if done: return "run"
	return _choice

# ---------- Ash's actions ----------
func _ash_turn(act: String) -> void:
	var e: Dictionary
	# (each action takes it out of him: the bar drops as he acts)
	get_tree().create_timer(0.5).timeout.connect(_show_sta)
	if act.begins_with("ball:"):
		await _do_ball(act.substr(5))
		ui.set_mood(R.mood())
		await _wait(0.4)
		return
	match act:
		"sand": e = await _do_sand()
		"hide": e = await _do_hide()
		"rock": e = await _do_rock()
		_: e = await _do_run()
	ui.set_mood(R.mood())
	await _wait(0.4)

# Throw something: a handful of sand. Down for a fistful of dirt, the arm back,
# and the lot flung at its face
func _do_sand() -> Dictionary:
	ui.say("ASH", "THROW SAND!", Color("e0a84a"))
	shot("ash_side", 5.0)
	await _wait(0.2)
	var e := R.ash_act("sand")
	_act("b_throw")
	Sfx.play("cloth_rustle", ash_pos, {"vol": -6.0})
	var t := 0.0
	var scooped := false
	while t < 0.98:
		t += get_process_delta_time()
		if t > 0.42 and not scooped:
			# the scoop: his fingers through the dirt
			scooped = true
			var g := _bone("RHand", 0.1)
			fx.dust(g, 5, Color("cdb68a"), 0.4, 0.3, 0.28)
			fx.sand(g + Vector3(0, 0.05, 0), Vector3(0, 1, 0) + fwd * 0.3, 14, 1.4, 0.6)
			Sfx.play("dig", ash_pos, {"vol": -2.0, "pitch": 1.2})
		await get_tree().process_frame
	# the fling: a fan of sand off his hand at its face
	var hand := _bone("RHand", 1.2)
	var to := foe_pos + Vector3(0, 0.3, 0)
	if not e.hit: to += side * (0.9 if _rng.randf() < 0.5 else -0.9) + Vector3(0, 0.4, 0)
	fx.sand_blast(hand, to, 90, 0.3 if e.hit else 0.55)
	fx.sand(hand, (to - hand).normalized() + Vector3(0, 0.15, 0), 60, 6.5, 0.32)
	fx.dust(hand, 4, Color("d8bf88"), 0.5, 0.2, 0.35)
	Sfx.play("throw", ash_pos, {"vol": -2.0})
	Sfx.play("sand_spray", ash_pos, {"vol": 0.0})
	shake = 0.2
	await _wait(0.3)
	shot("foe_close", 6.0)
	await _wait(0.1)
	if e.hit:
		_mood("flinch")
		fx.sand(foe_pos + Vector3(0, 0.35, 0), -fwd + Vector3(0, 0.5, 0), 30, 2.0, 0.8)
		fx.dust(foe_pos + Vector3(0, 0.3, 0), 5, Color("d8bf88"), 0.5, 0.3, 0.3)
		Sfx.play("hit_soft", foe_pos, {"vol": -6.0})
		await _wait(0.2)
		_cry(1.25)
		ui.pop("ACCURACY FELL!", foe_pos + Vector3(0, 0.9, 0), UITheme.ORANGE, 22, "word")
	else:
		ui.pop("MISSED!", foe_pos + Vector3(0, 0.9, 0), Color(0.85, 0.88, 0.95), 22, "word")
		_mood("hop")
	await _wait(0.8)
	return e

# Hide: he scrambles back into the tall grass at the clearing's edge and gets as
# small as he can, arms over his head. For this turn it may not find him, and it
# may lose interest. He comes out once its turn is over (_unhide).
func _do_hide() -> Dictionary:
	ui.say("ASH", "HIDE!", UITheme.GREEN)
	shot("overview", 3.0)
	var e := R.ash_act("hide")
	ui.speak(["Gotta hide, gotta hide…", "Don't see me, don't see me…", "Please go away…"][_rng.randi() % 3], _bone("Head", 1.6) + Vector3(0, 0.35, 0), 1.6)
	# turned away and scrambling for the grass
	ash_yaw = atan2(-fwd.x, -fwd.z)
	var spot := c - fwd * (arena_r + 0.35)
	spot.y = _gy(spot)
	await _ash_move(spot, 0.75)
	# into it: the blades thrash round him and he drops, facing it again
	ash_yaw = atan2(fwd.x, fwd.z)
	_act("b_hide", 1e6)
	Sfx.play("step_grass_run", ash_pos, {"vol": 0.0})
	Sfx.play("cloth_rustle", ash_pos, {"vol": -2.0})
	for i in 7:
		var d := Vector3(_rng.randf_range(-1, 1), _rng.randf_range(0.6, 1.4), _rng.randf_range(-1, 1)).normalized()
		fx.spawn("blade", ash_pos + Vector3(0, 0.3, 0), d * _rng.randf_range(1.0, 2.2), {"life": _rng.randf_range(0.8, 1.3), "size": _rng.randf_range(0.6, 1.0), "col": Color(Color("4f9a2c").lerp(Color("9fd45a"), _rng.randf()), 1.0), "grav": 1.5, "drag": 2.5, "tumble_k": 4.0, "floor": true})
	fx.dust(ash_pos, 4, Color("cdb68a"), 0.5, 0.2, 0.3)
	shot("hide", 2.5)
	await _wait(0.9)
	ui.pop("HIDING…", ash_pos + Vector3(0, 1.4, 0), UITheme.GREEN, 22, "word")
	_mood("look")   # (where did he go?)
	await _wait(0.9)
	return e

# out of the grass again once its turn is over, back to his spot
func _unhide() -> void:
	if player and player.idles and player.idles.acting() == "b_hide": player.idles.release()
	await _wait(0.35)
	if R.outcome != "": return
	await _ash_move(Vector3(ash_spot.x, _gy(ash_spot), ash_spot.z), 0.8)
	ash_yaw = atan2(fwd.x, fwd.z)

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

# Run: he turns and bolts for the way he came. It may let him go, or come over
# his head and land in his path, and he skids and backs up to where he was.
func _do_run() -> Dictionary:
	ui.say("ASH", "RUN!", UITheme.SKY)
	shot("run", 2.5)
	var e := R.ash_act("run")
	ui.speak(["I gotta get outta here!", "Nope, nope, nope!", "Run, run, RUN!"][_rng.randi() % 3], _bone("Head", 1.6) + Vector3(0, 0.35, 0), 1.4)
	ash_yaw = atan2(-fwd.x, -fwd.z)
	await _wait(0.12)
	Sfx.play("step_grass_run", ash_pos, {"vol": -2.0})
	var from := ash_pos
	var out := ash_pos - fwd * (5.5 if R.outcome == "ran" else 2.0)
	var dur := 1.1 if R.outcome == "ran" else 0.5
	var t := 0.0
	while t < dur:
		t += get_process_delta_time()
		ash_pos = from.lerp(out, clampf(t / dur, 0.0, 1.0))
		ash_pos.y = _gy(ash_pos)
		ash_anim_speed = 6.0
		await get_tree().process_frame
	ash_anim_speed = 0.0
	if R.outcome == "":
		# cut off: it comes in low over him and drops into his path
		var block := ash_pos - fwd * 1.3
		block.y = _gy(block)
		_mood("fly")
		_cry(1.0)
		Sfx.play("wing_flap_large", foe_pos, {"vol": 0.0})
		foe_yaw = atan2(-fwd.x, -fwd.z)
		await _foe_move(block, 0.55, 1.6, _qa_trail, 1)
		_mood("land")
		fx.dust(block, 6, Color("cdb68a"), 0.6, 0.3, 0.35)
		foe_yaw = atan2(fwd.x, fwd.z)
		ash_yaw = atan2(fwd.x, fwd.z) + PI
		_act("b_flinch")
		Sfx.play("scuff", ash_pos, {"vol": 0.0})
		shake = 0.3
		await _wait(0.15)
		_mood("wings_spread")
		ui.pop("IT CUT YOU OFF!", block + Vector3(0, 0.9, 0), UITheme.ORANGE, 22, "word")
		await _wait(0.6)
		# he backs off it, it hops back to its spot
		await _ash_move(Vector3(ash_spot.x, _gy(ash_spot), ash_spot.z), 0.8)
		ash_yaw = atan2(fwd.x, fwd.z)
		_mood("fly")
		await _foe_move(Vector3(foe_spot.x, _gy(foe_spot), foe_spot.z), 0.6, 1.0, Callable(), 1)
		_mood("land")
		foe_yaw = atan2(-fwd.x, -fwd.z)
		await _wait(0.3)
	return e

# ---------- Poké Balls ----------
# where the balls and a catch go (opts store / catch_store / balls), the BALL choice
func _store_setup() -> void:
	var st = opts.get("store")
	if st is PkmnStore: store = st
	elif String(opts.get("catch_store", "")) == "arena": store = PkmnStore.arena()
	else: store = PkmnStore.main()
	if String(opts.get("balls", "")) == "unlimited": store.unlimited = true
	elif opts.has("balls") and store != PkmnStore.main():
		# "bag": counted, a stocked bag when it's run dry (the arena's staging)
		store.unlimited = false
		if store.balls().is_empty():
			var sb = BattleConfig.sect("catch").get("start_bag", {})
			for id in sb: store.give(String(id), int(sb[id]))
	# his first Pokémon comes with the start bag (the story's: none before it)
	var q := _quests()
	if store == PkmnStore.main() and q != null and q.flag("has_starter"): store.stock_once()
	store.mark_seen(species)
	if mode != MODE_PKMN: ui.set_balls(store.balls() if wild() else [])

func wild() -> bool:
	if opts.has("trainer"): return false
	return String(opts.get("kind", "wild")) == "wild"

func foe_name() -> String:
	if pk: return String(pk.B.fighter("b").name)
	return R.display_name()

# a line for the battle's text (the HUD's log in mode "pkmn", a word under the banner else)
func say_line(text: String, col := UITheme.YELLOW) -> void:
	if text == "": return
	if pk and pk.hud: pk.hud.say(text, col)
	else:
		var vs := get_viewport().get_visible_rect().size
		ui.pop(text.to_upper(), Vector2(vs.x * 0.5, vs.y * 0.68), col, 20, "word")

# scripted renders: opts.script_ball (one {ball, turn, caught, wobbles} or a list) for a turn
func script_ball_for(turn: int) -> Dictionary:
	var v = opts.get("script_ball", {})
	var list: Array = v if v is Array else [v]
	for d in list:
		if d is Dictionary and not d.is_empty() and int(d.get("turn", turn)) == turn: return d
	return {}

# a throw on the stage (catch_show.gd), the same in both modes
func throw_show(ball: String, ev: Dictionary) -> void:
	var cs := CatchShow.new()
	cs.name = "Catch"
	add_child(cs)
	await cs.play(ball, ev)
	cs.queue_free()

# a catch into the store: the party, else the PC; the line that says where
func record_catch(ev: Dictionary) -> String:
	var sp := String(ev.get("species", species))
	var nm := String(ev.get("name", foe_name())).to_upper()
	if pk: store.ensure_party(pk.party().team.a.map(func(f): return {"species": f.species, "level": f.level}) if pk.party() else [{"species": pk.B.fighter("a").species, "level": pk.B.fighter("a").level}])
	var first := not store.is_caught(sp)
	var to := store.add_caught({"species": sp, "level": int(ev.get("level", R.level())), "hp": int(ev.get("hp", R.foe_hp)), "max_hp": int(ev.get("max_hp", R.foe_max)),
		"status": String(ev.get("status", "")), "ball": String(ev.get("ball", "poke_ball"))})
	caught_info = {"species": sp, "level": int(ev.get("level", R.level())), "ball": String(ev.get("ball", "poke_ball")), "to": to,
		"store": "main" if store == PkmnStore.main() else ("arena" if store == PkmnStore.arena() else "other"), "new_dex": first}
	var line := CatchRules.line("party" if to == "party" else "box", {"NAME": nm})
	if first and pk: pk.hud.say(CatchRules.line("dex", {"NAME": nm}), UITheme.SKY)
	return line

# the prologue's throw: the rules on its HP (no status in the prologue), then the show
func _do_ball(id: String) -> void:
	if not store.can_take():
		ui.pop(CatchRules.line("box_full").to_upper(), ash_pos + Vector3(0, 2.0, 0), UITheme.RED, 20, "word")
		await _wait(1.2)
		return
	store.use_ball(id)
	var r := CatchRules.throw({"species": species, "hp": int(ceil(R.foe_hp)), "max_hp": int(ceil(R.foe_max)), "status": "", "ball": id}, _rng)
	var sb := script_ball_for(R.turn + 1)
	if sb.has("caught"):
		r.caught = bool(sb.caught)
		r.wobbles = 3 if r.caught else int(sb.get("wobbles", r.wobbles))
	var ev := {"t": "ball", "ball": id, "caught": r.caught, "wobbles": int(r.wobbles), "species": species, "level": R.level(),
		"hp": int(ceil(R.foe_hp)), "max_hp": int(ceil(R.foe_max)), "status": "", "name": R.display_name()}
	await throw_show(id, ev)
	if r.caught: R.outcome = "caught"
	ui.set_balls(store.balls())

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
	if "lost_him" in e.notes:
		ui.pop("IT CAN'T FIND YOU!", ash_pos + Vector3(0, 1.5, 0), UITheme.GREEN, 22, "word")
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
		if not shielded and u > 0.35 and (e.hit or not R.hiding):
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
		if not R.hiding: _act("b_flinch")
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
			fx.sand_blast(from, face, 22, 0.22 if e.hit else 0.6)
			fx.sand(from, (face - from).normalized(), 8, 5.0, 0.5)
			Sfx.play("dig", foe_pos, {"vol": -8.0, "pitch": 1.3})
		if t > 0.55 and e.hit and ui.sand_k < 0.9:
			ui.sand_k = 1.0
			fx.dust(_bone("Head", 1.5), 6, Color("d8bf88"), 0.5, 0.3, 0.3)   # (it bursts on his face)
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
		if not R.hiding: _act("b_flinch")
		_miss_word(ash_pos)
	await _wait(1.0)

# back on his spot after being pushed, facing it
func _recover() -> void:
	if R.outcome == "ash_down": return
	if R.hiding: return   # (he stays down in the grass till its turn is over: _unhide)
	var spot := ash_spot
	if ash_pos.distance_to(Vector3(spot.x, ash_pos.y, spot.z)) > 0.3:
		await _ash_move(Vector3(spot.x, ash_pos.y, spot.z), 0.7)

# ---------- the end ----------
func _outcome() -> void:
	ui.close_menu()
	var oc := R.outcome
	_show_sta()
	result = {"outcome": oc, "species": species, "stamina": R.ash_sta / maxf(1.0, R.ash_sta_max), "foe_hp": R.foe_hp, "turns": R.turn, "creature": foe if not own_foe else null}
	if not caught_info.is_empty(): result["caught"] = caught_info
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
			shot("overview", 2.0)
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
		"caught":
			await _wait(0.4)
		"ash_down":
			await _ash_down()
			return
	await _wait(1.0)
	await _close()

func _ash_down() -> void:
	ui.close_menu()
	slowmo(0.35, 0.9)
	_act("b_crumple", 1e6)
	shot("down", 0.0)   # (a cut: a glide from the hit's shot would pass through him)
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
	# the bird has made its point: off it goes, over him (the camera stays on him)
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
			player.idles.hold = _prev_hold
			if player.idles.acting().begins_with("b_"): player.idles.release()
	for n in _hidden: if is_instance_valid(n): n.visible = true
	_hidden.clear()
	fx.clear()
	var h := get_node_or_null("EnergyHook")
	if h: h.detach()
	if partner and is_instance_valid(partner):
		if bool(opts.get("keep_partner", false)) and partner == opts.get("partner_node"): partner.scale = Vector3.ONE
		else: partner.queue_free()
	if foe and is_instance_valid(foe):
		foe.scale = _foe_scale0
		foe.remove_meta("battle")
		if String(result.get("outcome", "")) == "caught": foe.visible = false   # (in the ball: its owner removes it)
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
