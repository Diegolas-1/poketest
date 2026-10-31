extends Node
# Runs what the Battle Arena's staging menu stages (arena/arena_menu.gd START), on
# the battle's real in-world stage (battle/battle.gd) in the arena, then brings
# the results card back up (REMATCH, EDIT).
#   trainer   the door wipe to the field, the opponent (a ScenePerson in the chosen
#             look) at the centre line, the formal opening (arena_opening.gd: the
#             bow, the ten paces, the stances, the coin, the throws), then the
#             Pokémon battle (mode "pkmn") with both parties (battle/pkmn_party.gd),
#             the coin's winner first on turn 1; the trainers act on its events
#   wild      the wipe to the tall grass (hidden, startled) or the meadow (in the
#             open), the species there, and the wild battle's own entry: Ash alone
#             (mode "prologue") or with his party (mode "pkmn")
# Scripted runs (dev/arena_shot.gd) pass "auto": true (both sides by the AI),
# "call" / "coin" (the opening's), "seed".

var arena
var game: Node3D
var setup := {}
var running := false
var opp: ScenePerson
var battle: Battle
var _extra := {}
var _nodes: Array = []

func setup_(a) -> void:
	arena = a
	game = a.game

func busy() -> bool: return running

func run(s: Dictionary, extra := {}) -> void:
	if running: return
	setup = s.duplicate(true)
	_extra = extra
	running = true
	if String(s.get("type", "trainer")) == "trainer": await _trainer()
	else: await _wild()

# a wipe: Ash (and the camera) somewhere else in the arena at full black
func _warp(pos: Vector3, yaw: float, also: Callable = Callable()) -> void:
	var mid := func():
		game.pos = pos
		game.yaw = yaw
		game.speed = 0.0
		game.cam_yaw = yaw + PI
		game.cam_ty = pos.y
		game.cam_target = pos + Vector3(0, 1.45, 0)
		game.cast.land(pos.y)
		if also.is_valid(): also.call()
	game._fade(mid, false)
	await get_tree().process_frame
	while game.trans_busy: await get_tree().process_frame

# ---------- trainer ----------
func _trainer() -> void:
	var foe: Dictionary = setup.foe
	var ash_party: Array = setup.ash.map(func(m): return ArenaSetups.mon(m))
	var foe_party: Array = foe.party.map(func(m): return ArenaSetups.mon(m))
	var ai := String(foe.get("ai", "balanced"))
	await _warp(arena.w(0.0, 0.72), PI, func():
		opp = ScenePerson.make(String(foe.get("look", "ben")))
		opp.name = "Opponent"
		arena.add_child(opp)
		opp.ground = func(x: float, z: float) -> float: return arena.data.height_at(x, z)
		opp.place(arena.w(0.0, -0.72), 0.0))
	var op := preload("res://arena/arena_opening.gd").new()
	op.name = "Opening"
	arena.add_child(op)
	var fmt := String(foe.get("format", "singles"))
	op.play(arena, {"opp": opp, "foe_name": String(foe.name), "ash_name": "Ash", "ai": ai,
		"ash_lead": String(ash_party[0].species), "foe_lead": String(foe_party[0].species),
		"sub": "%d on %d  ·  %s  ·  %s AI" % [ash_party.size(), foe_party.size(), fmt, ai],
		"call": String(_extra.get("call", "")), "coin": String(_extra.get("coin", ""))})
	var r: Dictionary = await op.done
	_nodes = [r.get("partner"), r.get("foe")]
	var ash_end: Vector3 = game.pos
	var foe_spot: Vector3 = arena.w(0.0, -op.MON_Z)
	var opts := {"mode": "pkmn", "kind": "trainer", "trainer": String(foe.name), "foe_name": String(foe_party[0].species).capitalize(),
		"party_a": ash_party, "party_b": _with_ai(foe_party, ai),
		"species": String(foe_party[0].species), "level": int(foe_party[0].level), "ai": ai,
		"partner": ash_party[0], "first": String(r.get("first", "a")), "staged": true, "log": true,
		"gap": ash_end.distance_to(foe_spot), "partner_ahead": ash_end.z - (arena.w(0.0, op.MON_Z)).z, "foe_trainer_back": ash_end.z - arena.w(0.0, op.MON_Z).z,
		"at": foe_spot, "creature": r.get("foe"), "partner_node": r.get("partner"), "on_event": _on_event,
		"auto": bool(_extra.get("auto", false)), "doubles": fmt == "doubles"}
	if _extra.has("seed"): opts["seed"] = int(_extra.seed)
	if _extra.has("script_switch"): opts["script_switch"] = _extra.script_switch
	if _extra.has("script_pkmn"): opts["script_pkmn"] = _extra.script_pkmn
	battle = Battle.start(game, opts)
	var res: Dictionary = await battle.finished
	await _done(res)

func _with_ai(list: Array, ai: String) -> Array:
	var out := []
	for m in list:
		var d: Dictionary = m.duplicate()
		d["ai"] = ai
		out.append(d)
	return out

# the trainers act on the battle's events
func _on_event(e: Dictionary) -> void:
	var t := String(e.get("t", ""))
	var s := String(e.get("side", ""))
	var ash: CastActor = game.cast.player
	match t:
		"switch_in":
			if s == "b" and opp: opp.actor.idles.force("duel_throw_npc")
			elif s == "a" and ash.idles: ash.idles.force("duel_throw")
		"switch_out":
			if s == "b" and opp: opp.emote("point")
		"faint":
			if s == "b" and opp: opp.emote("gasp")
			elif s == "a" and ash.idles: ash.idles.force("gasp")
		"end":
			var won := String(e.get("outcome", "")) == "won"
			if opp: opp.emote("worry" if won else "fist")
			if ash.idles: ash.idles.force("fist" if won else "worry")

# ---------- wild ----------
func _wild() -> void:
	var w: Dictionary = setup.wild
	var sp := String(w.species)
	var start := String(w.get("start", "hidden"))
	var ash_at: Vector3 = arena.w(-13.4, -3.0) if start != "open" else arena.w(-5.0, 30.0)
	var yaw := -PI / 2.0
	var foe_at: Vector3 = ash_at + Vector3(-4.4, 0, 0)
	foe_at.y = arena.data.height_at(foe_at.x, foe_at.z)
	var cr: Node3D
	var made := []   # (a lambda captures cr by value: the new one comes back through this)
	await _warp(ash_at, yaw, func():
		cr = Creature.make(sp) if ResourceLoader.exists("res://creatures/%s.glb" % sp) else (PidgeyStandin.new() if sp == "pidgey" else PkmnStandin.make(sp))
		made.append(cr)
		arena.add_child(cr)
		cr.top_level = true
		cr.global_position = foe_at
		cr.rotation.y = PI / 2.0
		if "auto" in cr: cr.auto = false
		if start == "hidden" and cr.has_method("mood"): cr.mood("hide"))
	cr = made[0] if not made.is_empty() else null
	_nodes = [cr]
	await get_tree().create_timer(0.9 if start == "hidden" else 0.4).timeout
	var state: String = {"hidden": "hidden", "startled": "startled", "open": "default"}.get(start, "hidden")
	var opts := {"species": sp, "creature": cr, "at": foe_at, "temper": String(w.temper), "state": state, "where": "tall_grass" if start != "open" else "meadow",
		"first_strike": "wild" if String(w.temper) == "aggressive" else "ash", "level": int(w.level), "log": true, "auto": bool(_extra.get("auto", false))}
	if bool(w.get("with_party", false)) and not setup.ash.is_empty():
		var party: Array = setup.ash.map(func(m): return ArenaSetups.mon(m))
		opts.merge({"mode": "pkmn", "kind": "wild", "partner": party[0], "party_a": party, "party_b": [{"species": sp, "level": int(w.level)}], "ai": "wild"})
	else:
		opts["mode"] = "prologue"
		if bool(_extra.get("auto", false)): opts["script_acts"] = ["sand", "rock", "sand", "rock", "rock", "run"]
	if _extra.has("seed"): opts["seed"] = int(_extra.seed)
	# Poké Balls: the arena's own store (its catches kept apart from the save), unlimited unless the setup says
	opts["catch_store"] = "arena"
	opts["balls"] = String(w.get("balls", "unlimited"))
	if _extra.has("script_ball"): opts["script_ball"] = _extra.script_ball
	if _extra.has("script_acts"): opts["script_acts"] = _extra.script_acts
	battle = Battle.start(game, opts)
	var res: Dictionary = await battle.finished
	await _done(res)

# ---------- the end: clean up, the results card ----------
func _done(res: Dictionary) -> void:
	await get_tree().create_timer(0.6).timeout
	for n in _nodes:
		if n is Node and is_instance_valid(n): n.queue_free()
	_nodes = []
	if opp and is_instance_valid(opp): opp.queue_free()
	opp = null
	battle = null
	running = false
	if game.cast.player.idles: game.cast.player.idles.release()
	arena.menu.show_results(res, setup)
