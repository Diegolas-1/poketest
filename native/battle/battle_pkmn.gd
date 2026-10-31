class_name BattlePkmn
extends Node
# Mode "pkmn" of the battle (battle.gd): a Pokémon against a Pokémon, on the same
# in-world stage as Ash's prologue (the arena spread on the real ground, the
# camera, the effects). The rules are energy v2's PkmnBattle (battle/pkmn_battle.gd)
# and the HUD its PkmnHud (ui/pkmn_hud.gd: FIGHT, POKéMON, ITEMS, FLEE, the pools
# and focus bars); this file only hosts them: it builds the battle from the
# battle's opts, puts his partner in front of Ash (Ash stays back, its trainer),
# runs the turns through the HUD, and stages each event on the stage.
#
#   Battle.start(game, {"mode": "pkmn",            (or just a "partner": a has_starter save picks this mode too)
#       "partner": {"species": "pikachu", "level": 9, "known": [...], "equip": [...], "focus": 30.0},
#       "species": "pidgey", "level": 8, "ai": "wild", "state": "startled",   (the other side)
#       "kind": "wild" | "trainer" | ..., "trainer": "CAMPER" (a trainer's banner),
#       "auto": true (both sides by the AI: renders), "seed": n})
# Teams (the Battle Arena: arena/arena.gd): "party_a": [{species, level, known?, equip?}, ...],
#   "party_b": [...] (up to six each; battle/pkmn_party.gd), "first": "a" | "b" (the coin:
#   who moves first on turn 1), "log": true (the HUD's battle log), "on_event":
#   Callable(event) (the arena's trainers react: a throw for a switch, a fist pump...).
#   POKéMON opens the party list (a switch takes the turn); a faint with others left
#   stops the turn for the next one (Ash picks it; the trainer AI picks its own).
#   The result then carries "party": PkmnParty.results().
# Doubles ("doubles": true with teams; battle/pkmn_doubles.gd, a test option): two out a
#   side, side by side; Ash picks for each of his in turn (FIGHT, a move, then its
#   target: either foe or his other Pokémon), END TURN moves on to the next; the
#   second pair is sent out at the start. Events carry their "place" (0, 1): the
#   staging animates that one.
# Ambushes (wild/ambush.gd): "partner_node2" his second Pokémon already out steps into
#   place 1 (no throw); a wild side's next one comes in on its own (no ball); "waves":
#   the wild side's next two only once both of the pair are down.
# BALL (over the menu; battle/catch_rules.gd): the bag's balls (battle.store), one
#   thrown takes Ash's turn (the foe still moves); a trainer blocks it (the games'
#   line); a catch ends the battle (outcome caught). Staged by battle.throw_show.
# The result (battle.result): outcome ash_won | ash_down | ran | fled | caught (the
# contract's), and pkmn_outcome: PkmnBattle's own (won | lost | fled | wild_fled | blown_away | caught).
#
# Staging, by the move's anim key (life/moves.json):
#   contact      tackle, quick_attack (white afterimages), scratch, bite, iron_tail,
#                volt_tackle, wing_attack, rapid_spin, counter, ground_pound: a lunge, the impact
#   wind         gust, whirlwind: battle_fx's vortex carried across at the target
#   sand         sand_attack, smokescreen: a spray at its face
#   bolt         thunder_shock, thunderbolt, thunder (from the sky), thunder_wave: a jagged bolt, sparks
#   shot         every other attack: a stream of motes in the move type's colour
#   self         growl, tail_whip, double_team, protect, withdraw, focus, dodge...: rings off it, a hop
#   dig, fly...  "commit": under the ground (a mound of dirt) or up in the air; "strike" from there
#                (it comes back down first, a flyer's own flight landed); a move at one away is
#                staged as a miss (no lunge, no shot at the empty spot). The stage follows the
#                engine: one whose commit ended any other way (fainted, forced out, recalled,
#                the battle over) is back on its spot. Scripted runs: opts "script_pkmn"
#                {side ("a1": doubles place 1): {turn: [move ids]}} instead of the AI's plan.

const DEFAULT_PARTNER := {"species": "pikachu", "level": 9, "focus": 30.0,
	"known": ["thunder_shock", "growl", "tail_whip", "quick_attack", "dodge", "thunder_wave", "double_team"],
	"equip": ["thunder_shock", "quick_attack", "dodge", "thunder_wave", "growl"]}
const CONTACT := ["tackle", "quick_attack", "scratch", "bite", "iron_tail", "volt_tackle", "wing_attack", "rapid_spin", "counter", "ground_pound"]
const BOLT := ["thunder_shock", "thunderbolt", "thunder", "thunder_wave"]
const SELF := ["growl", "tail_whip", "double_team", "protect", "withdraw", "focus", "dodge", "hypnosis"]
const TYPE_COL := {"electric": Color("ffe14a"), "fire": Color("ff7a2a"), "water": Color("5ab8ff"), "grass": Color("7ad84a"),
	"psychic": Color("ff6ad0"), "dragon": Color("8a6aff"), "normal": Color("f4f0e0"), "flying": Color("cfe8ff"), "ground": Color("d8b070"), "bug": Color("b8d84a")}

var battle: Battle
var B: PkmnBattle
var hud: PkmnHud
var auto := false
var _busy := false
var _over := false
var _semi := {"a": "", "b": "", "a1": "", "b1": ""}
var _mound := {}
var _lift := {"a": 0.0, "b": 0.0, "a1": 0.0, "b1": 0.0}
const AIR := 2.4                     # how high one up in the air is (its own flight counted in)
var staged: Array = []               # every move staged: {side, id, to, tkey, tsemi, tnode, whiff} (dev/twophase_test)
# doubles
var D: PkmnDoubles
var _pl := {"a": 0, "b": 0}          # the place each side's staging is about now
var _x2 := {"a": null, "b": null}    # place 1's Pokémon (place 0's are the battle's partner / foe)
var _x2pos := {"a": Vector3.ZERO, "b": Vector3.ZERO}
var _x2k := {"a": 1.0, "b": 1.0}     # its grow-in
var _tg := {"side": "b", "place": 0} # the move being staged: its target
var _inp := 0                        # the place Ash is choosing for
var _aim_id := ""
var _aims: Array = []
var _fill_k := -1
const DX := 1.6                      # doubles: each place this far to the side
# for tests: each of Ash's turns as committed ({turn, a: [move ids in order]}), and
# each turn's start ({turn, pending, prompted}: whether the energy pick came up)
var turn_log: Array = []
var pick_log: Array = []

func setup(b: Battle) -> void:
	battle = b
	var o: Dictionary = b.opts
	auto = bool(o.get("auto", false))
	var a: Dictionary = DEFAULT_PARTNER.duplicate(true)
	a.merge(o.get("partner", {}), true)
	a["ai"] = "balanced" if auto else "player"
	var foe := {"species": String(o.get("species", "pidgey")), "level": int(o.get("level", 5)),
		"ai": String(o.get("ai", "wild" if String(o.get("kind", "wild")) == "wild" else "balanced")), "state": String(o.get("state", "hidden"))}
	if o.has("foe_name"): foe["name"] = String(o.foe_name)
	if o.has("foe_focus"): foe["focus"] = float(o.foe_focus)
	var bo := {"a": a, "b": foe, "kind": String(o.get("kind", "wild"))}
	if o.has("seed"): bo["seed"] = int(o.seed)
	if o.get("script_pkmn", null) is Dictionary: bo["script"] = o.script_pkmn   # (scripted runs: {side: {turn: [moves]}})
	if o.has("party_a") or o.has("party_b"):
		# teams: the party layer (the leads from the lists, the rest on the bench)
		var pa: Array = []
		for d in o.get("party_a", [a]):
			var dd: Dictionary = d.duplicate(true)
			dd["ai"] = "balanced" if auto else "player"
			pa.append(dd)
		var pb: Array = []
		for d in o.get("party_b", [foe]):
			var dd: Dictionary = d.duplicate(true)
			if not dd.has("ai"): dd["ai"] = String(foe.ai)
			if String(o.get("kind", "wild")) == "wild": dd["state"] = String(foe.state)
			pb.append(dd)
		bo["a"] = pa
		bo["b"] = pb
		bo["first"] = String(o.get("first", ""))
		if bool(o.get("doubles", false)):
			B = PkmnDoubles.new(bo)
			D = B
		else:
			B = PkmnParty.new(bo)
		(B as PkmnParty).owner_name = {"a": "Ash", "b": String(o.get("trainer", "The foe"))}
	else:
		B = PkmnBattle.new(bo)

func party() -> PkmnParty: return B as PkmnParty

func intro_name() -> String:
	if battle.opts.has("trainer"): return "%s WANTS TO BATTLE!" % String(battle.opts.trainer).to_upper()
	return String(B.fighter("b").name).to_upper()

func intro_sub() -> String:
	return "LV. %d" % B.fighter("b").level

func make_partner() -> Node3D:
	var given = battle.opts.get("partner_node")
	if given is Node3D and is_instance_valid(given): return given   # (the staged opening's, already out)
	var sp := String(B.fighter("a").species)
	var n: Node3D = Creature.make(sp) if ResourceLoader.exists("res://creatures/%s.glb" % sp) else PkmnStandin.make(sp)
	battle.add_child(n)
	n.top_level = true
	return n

func lift(side: String) -> float: return float(_lift.get(side, 0.0))

# the side's Pokémon the staging is about (doubles: its place now, _pl)
func _key(side: String) -> String: return side if int(_pl[side]) == 0 else side + "1"
func _f(side: String) -> PkmnBattle.Fighter:
	if D and D.at(side, int(_pl[side])) != null: return D.at(side, int(_pl[side]))
	return B.fighter(side)
func _node(side: String) -> Node3D:
	if D and int(_pl[side]) == 1: return _x2[side]
	return battle.partner if side == "a" else battle.foe
func _pos(side: String) -> Vector3:
	if D and int(_pl[side]) == 1: return _x2pos[side]
	return battle.partner_pos if side == "a" else battle.foe_pos
func _set_pos(side: String, p: Vector3) -> void:
	if D and int(_pl[side]) == 1: _x2pos[side] = p
	elif side == "a": battle.partner_pos = p
	else: battle.foe_pos = p
func _home(side: String) -> Vector3:
	var h := battle.ash_spot + battle.fwd * battle.partner_ahead + battle.side * Battle.PARTNER_SIDE if side == "a" else battle.foe_spot
	if D: h += battle.side * DX * (1.0 if int(_pl[side]) == 1 else -1.0) - (battle.side * Battle.PARTNER_SIDE if side == "a" else Vector3.ZERO)
	h.y = battle._gy(h)
	return h
func _pos_at(side: String, place: int) -> Vector3:
	var was: int = _pl[side]
	_pl[side] = place
	var p := _pos(side)
	_pl[side] = was
	return p
func _set_appear(side: String, v: float) -> void:
	if D and int(_pl[side]) == 1: _x2k[side] = v
	elif side == "a": battle.partner_appear = v
	else: battle.foe_appear = v

# the act a creature plays for a move: creatures/species.json's "acts" (and its
# "alias": a move's id to the act that stands for it), tried as the move id, its
# alias, its anim key, then the fallback; a creature with its own script (Pidgey)
# says what it has with acts()
static var _species := {}

func _act(side: String, id: String, anim: String, fallback := "tackle") -> String:
	var n := _node(side)
	var acts: Array = []
	var alias := {}
	if _species.is_empty() and FileAccess.file_exists("res://creatures/species.json"):
		var v = JSON.parse_string(FileAccess.get_file_as_string("res://creatures/species.json"))
		_species = v.get("species", {}) if v is Dictionary else {}
	var d: Dictionary = _species.get(String(_f(side).species), {})
	acts = d.get("acts", [])
	alias = d.get("alias", {})
	if acts.is_empty() and n and n.has_method("acts"): acts = n.acts()
	if acts.is_empty(): return fallback
	for c in [id, String(alias.get(id, "")), anim, String(alias.get(anim, "")), fallback, "tackle", "taunt"]:
		if c != "" and c in acts: return c
	return fallback

func _mood(side: String, m: String) -> void:
	var n := _node(side)
	if n and is_instance_valid(n) and n.has_method("mood"): n.mood(m)

func _process(dt: float) -> void:
	if battle == null: return
	# where each one is: under the ground (hidden, a mound over it), in the air, here
	for key in ["a", "b", "a1", "b1"]:
		var s: String = key.substr(0, 1)
		var pl := 1 if key.length() > 1 else 0
		if pl == 1 and D == null: continue
		var keep: int = _pl[s]
		_pl[s] = pl
		var want := 0.0
		var n := _node(s)
		# (a bird's own flight already lifts it: the stage adds only the rest)
		if _semi[key] == "airborne": want = maxf(0.0, AIR - _own_air(n)) + sin(Time.get_ticks_msec() * 0.003) * 0.1
		_lift[key] = lerpf(float(_lift[key]), want, 1.0 - exp(-dt * 6.0))
		if n and is_instance_valid(n): n.visible = not _semi[key] in ["underground", "underwater"]
		if _mound.has(key) and is_instance_valid(_mound[key]):
			_mound[key].visible = _semi[key] in ["underground", "underwater"]
			_mound[key].global_position = _pos(s) + Vector3(0, 0.02, 0)
		_pl[s] = keep
	if battle.foe: battle.foe_lift = float(_lift.b)
	# doubles: place 1's Pokémon, as the battle places its partner and foe
	if D:
		for s in ["a", "b"]:
			var n: Node3D = _x2[s]
			if n == null or not is_instance_valid(n): continue
			var p: Vector3 = _x2pos[s]
			p.y = battle._gy(p)
			n.global_position = p + Vector3(0, float(_lift[s + "1"]), 0)
			n.rotation = Vector3(0, battle.partner_yaw if s == "a" else battle.foe_yaw, 0)
			n.scale = Vector3.ONE * lerpf(1.0, Battle.FOE_SCALE, clampf(battle.arena_k, 0.0, 1.0)) * maxf(float(_x2k[s]), 0.001)
			if n.has_method("animate"): n.animate(dt, 0.0)

# ---------- the loop ----------
func run() -> void:
	hud = PkmnHud.new()
	battle.layer.add_child(hud)
	hud.bind(B)
	hud.command.connect(_on_command)
	hud.move_picked.connect(_on_move)
	hud.end_turn.connect(_on_confirm)
	hud.pool_picked.connect(_on_pool)
	hud.undo.connect(func(): B.unqueue("a"); hud.refresh_moves())
	hud.queue_remove.connect(_on_remove)
	hud.queue_reorder.connect(_on_reorder)
	hud.fight_cancel.connect(func(): if hud.mode == "fight": hud.show_menu())   # (BACK: the queue is kept for when FIGHT opens again)
	hud.party_picked.connect(_on_party)
	hud.party_cancel.connect(func(): if hud.mode == "party" and not hud.party_forced: hud.show_menu())
	hud.target_picked.connect(_on_target)
	hud.target_cancel.connect(func(): _aim_id = ""; hud.show_fight())
	hud.ball_picked.connect(_on_ball)
	hud.ball_cancel.connect(func(): if hud.mode == "balls": hud.show_menu())
	hud.ball_on = D == null
	hud.log_on = bool(battle.opts.get("log", false))
	for s in ["a", "b", "a1", "b1"]: _make_mound(s)
	await _play(B.start(), 0.2)
	if D: await _doubles_in()
	battle.shot("overview", 2.5)
	if battle.opts.has("hud_state"):
		# a frozen HUD for shots: it stays up for good
		_state(String(battle.opts.hud_state))
		while true: await get_tree().process_frame
	_next_turn()
	while not _over: await get_tree().process_frame
	await _end()

func _next_turn() -> void:
	if B.over: _over = true; return
	var had: int = B.fighter("a").e.total()
	await _play(B.begin_turn(), 0.3)
	if D and not auto:
		_inp = 0 if D.at("a", 0) != null and not D.at("a", 0).fainted() else 1
		_select_inp()
	var e: BattleEnergy = B.fighter("a").e
	pick_log.append({"turn": B.turn, "pending": e.pending, "prompted": B.needs_pick("a") and not auto})
	if B.needs_pick("a"):
		if auto: B.pick_pool("a", "")
		else:
			hud.show_pick()
			return
	elif not auto and e.pending == 0 and e.total() <= had and D == null:
		# no new chip this turn: say when the next one comes
		var nxt := e.thresholds().filter(func(th): return float(th) > e.focus + 0.001)
		if not nxt.is_empty() and e.held() < e.chip_cap():
			hud.say("No new chip this turn: focus %d%%, the next at %d%%." % [int(e.focus / e.fmax() * 100.0), int(float(nxt[0]) / e.fmax() * 100.0)], UITheme.TEXT_DIM)
	_open_menu()

func _open_menu() -> void:
	battle.shot("overview", 2.0)   # (the choosing frame: Ash's side near, the foe facing; held while he picks)
	if auto:
		await get_tree().create_timer(0.6).timeout
		# scripted runs: "script_ball": {ball, turn, caught, wobbles} throws that ball on that turn
		var sbl := battle.script_ball_for(B.turn)
		if not sbl.is_empty() and not _over:
			hud.show_menu()
			hud.sel = PkmnHud.BALL
			await get_tree().create_timer(0.7).timeout
			hud.show_balls(battle.store.balls())
			for i in hud.ball_list.size():
				if String(hud.ball_list[i].id) == String(sbl.get("ball", "poke_ball")): hud.ball_sel = i
			await get_tree().create_timer(0.8).timeout
			_on_ball(String(sbl.get("ball", "poke_ball")))
			return
		# scripted runs: "script_switch": [turn, team index] switches Ash's by choice on that turn
		var sw: Array = battle.opts.get("script_switch", [])
		if party() and D == null and sw.size() == 2 and B.turn == int(sw[0]) and party().can_switch("a", int(sw[1])):
			hud.show_party(false)
			await get_tree().create_timer(1.0).timeout
			hud.party_sel = int(sw[1])
			await get_tree().create_timer(0.6).timeout
			_on_party(int(sw[1]))
			return
		B.ai_queue("a")
		_on_end_turn()
		return
	hud.show_menu()

func _on_pool(k: String) -> void:
	if hud.mode != "pick": return
	var placed := B.pick_pool("a", k)
	Sfx.ui("ui_confirm")
	if not placed.is_empty():
		hud.say("%s: +%d %s chip%s." % [String(B.fighter("a").name).to_upper(), placed.size(), BattleEnergy.energy_name(String(placed[0])).to_upper(), "" if placed.size() == 1 else "s"], EnergyIcon.color(String(placed[0])).lightened(0.25))
	if B.needs_pick("a"): return
	_open_menu()

func _on_command(c: String) -> void:
	match c:
		"fight":
			hud.set_confirm_label(_confirm_label())
			hud.show_fight()
		"flee":
			while B.unqueue("a") != "": pass   # (running is the whole turn: the queue back)
			if B.flee("a"):
				hud.say("Got away safely!", UITheme.SKY); hud.busy()
				_over = true
			else:
				hud.say("Can't escape!", UITheme.RED); _on_end_turn()
		"items":
			if B.use_item("a", "energy_shard") > 0: hud.say("Used an Energy Shard: +1 chip.", UITheme.YELLOW)
			else: hud.say("No room for more chips.", UITheme.RED)
		"ball":
			var bl := battle.store.balls()
			if bl.is_empty(): hud.say(CatchRules.line("none"), UITheme.RED)
			else: hud.show_balls(bl)
		"pokemon":
			if party() and not party().bench("a").is_empty(): hud.show_party(false)
			elif party() and party().alive("a") > 1: hud.say("%s can't be switched out now!" % B.fighter("a").name, UITheme.RED)
			else: hud.say("%s is your only Pokémon." % B.fighter("a").name, UITheme.SKY)

# a pick from the party list: after a faint, the next one out (then the next turn);
# by choice, the switch is Ash's turn (the foe still moves)
func _on_party(i: int) -> void:
	if _busy or party() == null: return
	if D:
		hud.busy()
		_busy = true
		if _fill_k >= 0:
			var k := _fill_k
			_fill_k = -1
			await _play(D.fill("a", k, i), 0.2)
			_busy = false
			await _after_faints()
			return
		await _play(D.switch_place("a", _inp, i), 0.2)
		_busy = false
		_on_end_turn()
		return
	if party().pending.a:
		hud.busy()
		_busy = true
		await _play(party().switch_to("a", i), 0.2)
		_busy = false
		await _after_faints()
		return
	if party().switch_block("a") != "":
		hud.say(party().switch_block("a"), UITheme.RED)
		hud.show_menu()
		return
	hud.busy()
	_busy = true
	await _play(party().switch_to("a", i), 0.2)
	_busy = false
	_on_end_turn()

# a ball from the bag: thrown (Ash's turn), staged, then the foe's turn unless it's caught
func _on_ball(id: String) -> void:
	if _busy or B.over: return
	if B.kind == "wild" and not battle.store.can_take():
		hud.say(CatchRules.line("box_full"), UITheme.RED)
		hud.show_menu()
		return
	var T: Dictionary = BattleConfig.sect("catch").get("trainer", {})
	if B.kind == "wild" or bool(T.get("uses_ball", true)):
		if not battle.store.use_ball(id):
			hud.say(CatchRules.line("none"), UITheme.RED)
			hud.show_menu()
			return
	while B.unqueue("a") != "": pass
	_busy = true
	hud.busy()
	var sb := battle.script_ball_for(B.turn)
	var ev := B.throw_ball("a", id, sb if String(sb.get("ball", id)) == id else {})
	ev["name"] = String(B.fighter("b").name)
	hud.say(String(ev.get("throw", CatchRules.line("throw", {"BALL": CatchRules.ball_name(id).to_upper()}))), UITheme.SKY)
	var cb = battle.opts.get("on_event")
	if cb is Callable and cb.is_valid(): cb.call(ev)
	await battle.throw_show(id, ev)
	_busy = false
	if B.over:
		_over = true
		return
	if String(ev.t) == "ball_blocked" and not bool(T.get("takes_turn", true)):
		_open_menu()
		return
	_on_end_turn()

func _on_move(id: String) -> void:
	if D:
		_aims = D.targets("a", _inp, id)
		if _aims.size() >= 2:
			_aim_id = id
			hud.show_targets(_aims.map(func(t): return _aim_label(t)))
			return
		_queue_aimed(id, _aims[0] if _aims.size() == 1 else {})
		return
	if B.queue("a", id):
		hud.refresh_moves()

# the FIGHT window's CONFIRM: the only thing that ends Ash's choosing (doubles: on to
# his other Pokémon first)
func _on_confirm() -> void:
	if _busy or not hud.mode == "fight": return
	if not B.queued("a").is_empty(): _ash("pk_command")
	_on_end_turn()

func _confirm_label() -> String:
	if D and not auto and _inp == 0 and D.at("a", 1) != null and not D.at("a", 1).fainted() and not _done_for(1):
		return "NEXT: %s" % String(D.at("a", 1).name).to_upper()
	return "CONFIRM"

# the queue in the window: one taken out, or one moved to another place in the order.
# The engine takes moves back only from the end (unqueue), so the rest come back
# and go in again in the new order (each paid again; the old order if one can't be)
func _on_remove(i: int) -> void:
	var q := _entries()
	var j := i - _n_free()
	if j < 0 or j >= q.size(): return
	var want := q.duplicate()
	want.remove_at(j)
	_requeue(want, q)
	hud.refresh_moves()

func _on_reorder(from: int, to: int) -> void:
	var q := _entries()
	var a := from - _n_free()
	var b := to - _n_free()
	if a < 0 or b < 0 or a >= q.size() or b >= q.size() or a == b: return
	var want := q.duplicate()
	var x = want[a]
	want.remove_at(a)
	want.insert(b, x)
	_requeue(want, q)
	hud.refresh_moves()

func _n_free() -> int: return B.fighter("a").queue.filter(func(q): return bool(q.get("free", false))).size()

func _entries() -> Array: return B.fighter("a").queue.filter(func(q): return not bool(q.get("free", false))).duplicate()

func _requeue(want: Array, was: Array) -> bool:
	while B.unqueue("a") != "": pass
	for q in want:
		if not _queue_entry(q):
			while B.unqueue("a") != "": pass
			for q2 in was: _queue_entry(q2)
			return false
	return true

func _queue_entry(q: Dictionary) -> bool:
	if D:
		var tg = q.get("target")
		var target := {}
		if tg is PkmnBattle.Fighter and D.place_of(tg) >= 0: target = {"side": tg.side, "k": D.place_of(tg)}
		return D.queue_at("a", _inp, String(q.move), target)
	return B.queue("a", String(q.move))

func _on_end_turn() -> void:
	if _busy: return
	# doubles: on to Ash's other Pokémon first
	if D and not auto and _inp == 0 and D.at("a", 1) != null and not D.at("a", 1).fainted() and not _done_for(1):
		_inp = 1
		_select_inp()
		if B.needs_pick("a"): hud.show_pick()
		else: _open_menu()
		return
	if D: D.select("a", 0 if D.at("a", 0) != null and not D.at("a", 0).fainted() else 1)
	_busy = true
	hud.busy()
	turn_log.append({"turn": B.turn, "a": B.queued("a").duplicate()})
	battle.shot("duel", 2.2)   # (a glide down from the choosing frame, same side)
	B.ai_queue("b")
	B.begin_resolve()
	while B.resolving():
		await _play(B.step(), 0.15)
	_busy = false
	if B.over: _over = true
	else: await _after_faints()

# after a turn: a side whose Pokémon fainted sends out the next (the trainer AI's
# pick; Ash's from the party list, or the AI's in an auto run), then the next turn
func _after_faints() -> void:
	var P := party()
	if D and not B.over:
		# waves (a swarm): its next pair only once both of this one are down
		var wait_b: bool = bool(battle.opts.get("waves", false)) and not D.alive_out("b").is_empty()
		if bool(battle.opts.get("waves", false)) and not wait_b and D.pending_places("b").size() >= 2:
			battle.ui.show_outcome("THE NEXT TWO!", "%d more coming in" % mini(2, D.bench("b").size()), UITheme.ORANGE)
			await _wait(0.9)
		for k in ([] if wait_b else D.pending_places("b")):
			var i := D.ai_pick("b")
			if i < 0: continue
			_busy = true
			await _wait(0.4)
			await _play(D.fill("b", k, i), 0.3)
			_busy = false
		for k in D.pending_places("a"):
			if auto:
				_busy = true
				await _wait(0.5)
				await _play(D.fill("a", k, D.ai_pick("a")), 0.3)
				_busy = false
			else:
				_fill_k = k
				hud.say("Choose your next Pokémon!", UITheme.SKY)
				hud.show_party(true)
				return
		P = null
	if P and not B.over:
		if P.pending.b:
			_busy = true
			await _wait(0.4)
			await _play(P.switch_to("b", P.ai_pick("b")), 0.3)
			_busy = false
		if P.pending.a:
			if auto:
				_busy = true
				await _wait(0.5)
				await _play(P.switch_to("a", P.ai_pick("a")), 0.3)
				_busy = false
			else:
				hud.say("Choose your next Pokémon!", UITheme.SKY)
				hud.show_party(true)
				return
	if B.over: _over = true
	else: _next_turn()

func _end() -> void:
	hud.busy()
	for k in ["a", "b"]: _land(k)
	_follow_engine()
	var oc := B.outcome
	if oc != "caught": hud.say({"won": "You won!", "lost": "%s fainted..." % B.fighter("a").name, "fled": "Got away safely!", "wild_fled": "The wild one fled!", "blown_away": "Blown away!"}.get(oc, "The battle is over."), UITheme.YELLOW)
	B.finish()
	var pr := party().results() if party() else {}
	battle.result = {"party": pr,"outcome": {"won": "ash_won", "lost": "ash_down", "fled": "ran", "wild_fled": "fled", "blown_away": "ran", "caught": "caught"}.get(oc, "ran"),
		"pkmn_outcome": oc, "species": String(B.fighter("b").species), "foe_hp": B.fighter("b").hp, "partner_hp": B.fighter("a").hp, "turns": B.turn,
		"creature": battle.foe if not battle.own_foe else null}
	if not battle.caught_info.is_empty(): battle.result["caught"] = battle.caught_info
	match oc:
		"won":
			battle.ui.show_outcome("YOU WON!", "%s did it!" % B.fighter("a").name, UITheme.GREEN)
			_mood("a", "taunt")
		"lost":
			battle.ui.show_outcome("%s FAINTED..." % String(B.fighter("a").name).to_upper(), "Ash runs to it", UITheme.RED)
		"wild_fled":
			battle.ui.show_outcome("%s FLED!" % String(B.fighter("b").name).to_upper(), "", UITheme.PURPLE)
			_mood("b", "flee")
			await _move("b", _pos("b") + battle.fwd * 9.0, 1.3, 2.5)
		"caught":
			_mood("a", "taunt")   # (the banner was the throw's)
		_:
			battle.ui.show_outcome("GOT AWAY SAFELY!", "", UITheme.GREEN)
	await _wait(1.8)
	hud.visible = false

# ---------- the staging ----------
func _play(evs: Array, gap: float) -> void:
	for ei in evs.size():
		var e: Dictionary = evs[ei]
		var cb = battle.opts.get("on_event")
		if cb is Callable and cb.is_valid(): cb.call(e)
		var t := String(e.get("t", ""))
		var s := String(e.get("side", ""))
		if D and s in ["a", "b"]:
			_pl[s] = int(e.get("place", 0))
			if t in ["move", "strike"]:
				_tg = {"side": String(e.get("tside", B.other(s))), "place": int(e.get("tp", 0))}
		var txt := String(e.get("text_owner", e.get("text", ""))) if s == "a" else String(e.get("text", ""))
		# (a wild side's team, a swarm: no trainer recalls or sends them, they come on their own)
		if s == "b" and t in ["switch_out", "switch_in", "need_switch"] and String(battle.opts.get("kind", "wild")) == "wild" and battle.opts.has("party_b"):
			txt = ("Another wild %s joins in!" % String(e.get("species", "")).to_upper()) if t == "switch_in" else ""
		if txt != "" and not t in ["turn", "gain"]:
			hud.say(txt, UITheme.SKY if s == "a" else UITheme.YELLOW)
		_ash_react(t, s, e)
		match t:
			"move", "strike":
				await _stage_move(s, String(e.move), t == "strike", _whiff(evs, ei))
			"hit", "counter", "tick", "hurt_self":
				_hit(s, e)
				await _wait(0.5)
			"commit":
				await _commit(s, String(e.get("semi", "")))
			"pulled_out", "forced_out":
				_semi[_key(s)] = ""
				battle.fx.dust(_pos(s), 8, Color("cdb68a"), 0.8, 0.6, 0.45)
				await _wait(0.5)
			"miss", "dodged", "untargetable":
				if D and t == "miss":
					_pl[String(_tg.side)] = int(_tg.place)
					await _dodge(String(_tg.side))
				else:
					await _dodge(s if t != "miss" else B.other(s))
			"protected":
				battle.fx.spawn("ring", _pos(s) + Vector3(0, 0.4, 0), Vector3.ZERO, {"life": 0.5, "size": 0.6, "size_end": 1.6, "col": Color(0.6, 0.9, 1.0, 0.9)})
				await _wait(0.5)
			"faint":
				_land(s)
				_cam_faint(s)
				_mood(s, "faint")
				battle.fx.dust(_pos(s), 8, Color("cdb68a"), 0.7, 0.3, 0.45)
				Sfx.play("land_dirt", _pos(s), {"vol": 0.0})
				await _wait(1.0)
			"status", "stat", "lock", "disrupt", "locked_in", "wasted", "broken", "flinch", "asleep", "paralysed", "confused", "woke", "expired":
				if t == "stat" and int(e.get("d", 0)) != 0:
					battle.ui.pop(("%s UP" if int(e.d) > 0 else "%s DOWN") % String(e.get("stat", "")).to_upper(), _pos(s) + Vector3(0, 1.0, 0), UITheme.ORANGE, 22, "word")
				await _wait(0.55)
			"switch_out":
				_land(s)
				await _recall(s)
			"switch_in":
				await _send_out(s, String(e.get("species", B.fighter(s).species)))
			"need_switch", "dragged_out":
				await _wait(0.5)
			"turn", "gain", "pick", "picked":
				pass
			_:
				await _wait(0.3)
	_follow_engine()
	if gap > 0.0: await _wait(gap)

# this move's events: a miss for being out of reach (up in the air, under the ground)
func _whiff(evs: Array, i: int) -> bool:
	for j in range(i + 1, evs.size()):
		var t := String(evs[j].get("t", ""))
		if t in ["move", "strike"]: return false
		if t == "untargetable": return true
	return false

# the stage after the engine: one whose commit ended without a strike (fainted, forced
# out, recalled, the battle over) comes back down, its own flight landed
func _follow_engine() -> void:
	for key in ["a", "b", "a1", "b1"]:
		if String(_semi[key]) == "": continue
		var s: String = key.substr(0, 1)
		var pl := 1 if key.length() > 1 else 0
		if pl == 1 and D == null: continue
		var f: PkmnBattle.Fighter = D.at(s, pl) if D else B.fighter(s)
		if f == null or f.fainted() or f.e.semi() == "" or B.over:
			var was: int = _pl[s]
			_pl[s] = pl
			_land(s)
			_pl[s] = was

# a creature's own flight height (a bird's takeoff), else 0
static func _own_air(n: Node) -> float:
	if n == null or not is_instance_valid(n) or not "flying" in n or not n.flying: return 0.0
	return float(n.get("fly_height")) if "fly_height" in n else 0.0

# back down (or up from under): the stage's state cleared, a bird's own flight landed
func _land(s: String) -> void:
	_semi[_key(s)] = ""
	var n := _node(s)
	if n and is_instance_valid(n) and "flying" in n and n.flying:
		if n.has_method("mood"): n.mood("land")
		n.flying = false

# singles: the over-the-shoulder shot kept on the real one when either is up in the air
func _aim_shot(s: String, tside: String) -> void:
	var up_s := lift(s) + _own_air(_node(s))
	var up_t := lift(tside) + _own_air(_node(tside))
	if up_s < 0.2 and up_t < 0.2: return
	var sh: Dictionary = battle._shot_xf("pk_" + s).duplicate()
	sh.pos = sh.pos + Vector3(0, up_s * 0.6, 0)
	sh.look = sh.look + Vector3(0, up_t * 0.85, 0)
	sh["rate"] = 4.0
	sh["name"] = "_fixed"
	battle._shot = sh

# its spot at a place (doubles), the stage's _home
func _home_at(s: String, pl: int) -> Vector3:
	var was: int = _pl[s]
	_pl[s] = pl
	var h := _home(s)
	_pl[s] = was
	return h

# where a Pokémon really is (the stage's spot, its lift and its own flight)
func _real_at(s: String, pl: int) -> Vector3:
	var was: int = _pl[s]
	_pl[s] = pl
	var n := _node(s)
	var p := n.global_position if n and is_instance_valid(n) else _pos(s)
	_pl[s] = was
	return p

func _stage_move(s: String, id: String, strike: bool, whiff := false) -> void:
	var m := BattleEnergy.move(id)
	var anim := String(m.get("anim", id))
	var col: Color = TYPE_COL.get(String(m.get("type", "normal")), Color.WHITE)
	var o := B.other(s)
	battle.ui.say(String(_f(s).name).to_upper(), String(m.get("name", id)).to_upper() + "!", col if col != TYPE_COL.normal else UITheme.ORANGE)
	var tside := String(_tg.side) if D else o
	var tpl := int(_tg.place) if D else 0
	var tkey := tside if tpl == 0 else tside + "1"
	# a committed strike comes out of wherever it went (up, under): back down first
	var was := String(_semi[_key(s)])
	if strike:
		_land(s)
		battle.fx.dust(_pos(s), 10, Color("cdb68a"), 1.0, 0.8, 0.5)
		battle.shake = 0.4
		if was == "airborne": anim = "tackle"   # (Fly, Bounce: a dive at it)
		elif was in ["underground", "underwater"]: anim = "tackle"   # (Dig, Dive: up under it)
	_cam_move(s, id, strike)
	if D == null and String(battle._shot.get("name", "")) == "pk_" + s: _aim_shot(s, tside)   # (one up in the air: the lens follows it up)
	var from := _pos(s)
	var to := _real_at(tside, tpl)
	to.y = maxf(to.y, battle._gy(to))
	staged.append({"side": s, "id": id, "to": to, "tkey": tkey, "tsemi": String(_semi[tkey]), "tnode": _real_at(tside, tpl), "whiff": whiff})
	var d := (to - from); d.y = 0.0; d = d.normalized()
	if whiff:
		# at one up in the air or under the ground: it looks for it and holds back (the line says it missed)
		_mood(s, _act(s, "look_up" if String(_semi[tkey]) == "airborne" else "sniff", "look", "taunt"))
		await _wait(0.5)
		return
	if anim in CONTACT:
		var quick := anim == "quick_attack"
		_mood(s, _act(s, id, anim, "quick_attack" if quick else "tackle"))
		Sfx.play("whoosh", from, {"vol": 0.0, "pitch": 1.4 if quick else 1.0})
		await _wait(0.12 if quick else 0.3)
		var hit_at := to - d * 0.45
		await _move(s, hit_at, 0.12 if quick else 0.24, 0.0, func(): battle.fx.afterimage(_pos(s), d * 12.0, 0.4) if quick else battle.fx.speed_lines(_pos(s), d * 10.0, 3))
		await _move(s, from, 0.45, 0.4)
	elif anim in ["gust", "whirlwind"]:
		_mood(s, _act(s, id, anim, "gust"))
		await _wait(0.35)
		var g := battle.fx.gust_begin(from)
		Sfx.play("gust_vortex", from, {"vol": 2.0})
		var t := 0.0
		while t < 1.3:
			t += get_process_delta_time()
			var u := clampf(t / 1.3, 0.0, 1.0)
			var at := from.lerp(to, UITheme.ease_in(clampf((u - 0.3) / 0.7, 0.0, 1.0)))
			at.y = battle._gy(at)
			battle.fx.gust_move(g, at, clampf(u * 2.5, 0.0, 1.0), clampf(sin(t * 18.0), 0.0, 1.0), d)
			battle.shake = maxf(battle.shake, 0.1 + 0.2 * u)
			await get_tree().process_frame
		battle.fx.gust_hit(g, to)
		battle.fx.gust_end(g)
	elif anim in ["sand_attack", "smokescreen"]:
		_mood(s, _act(s, id, anim, "sand_attack"))
		Sfx.play("sand_spray", from, {"vol": 0.0})
		for i in 8:
			battle.fx.sand_blast(from + Vector3(0, 0.1, 0), to + Vector3(0, 0.35, 0), 18, 0.25, Color("e2c98f") if anim == "sand_attack" else Color("6a6a70"))
			await _wait(0.08)
	elif anim in BOLT:
		_mood(s, _act(s, id, anim, "thunder"))
		Sfx.play("whoosh", from, {"vol": -4.0, "pitch": 1.8})
		await _wait(0.3)
		var top := to + Vector3(0, 7.0, 0) if anim == "thunder" else from + Vector3(0, 0.55, 0) + d * 0.2
		for k in 3:
			_bolt(top, to + Vector3(0, 0.3, 0), col)
			battle.shake = 0.35
			await _wait(0.07)
	elif anim in SELF:
		_mood(s, _act(s, id, anim, "taunt"))
		for k in 3:
			battle.fx.spawn("ring", from + Vector3(0, 0.5, 0), Vector3.ZERO, {"life": 0.45, "size": 0.3, "size_end": 1.4 + k * 0.3, "col": Color(col, 0.8)})
			await _wait(0.12)
	else:
		# a stream of motes at it in the move's colour
		_mood(s, _act(s, id, anim, "tackle"))
		for k in 14:
			var p := from + Vector3(0, 0.45, 0)
			var v := ((to + Vector3(0, 0.35, 0)) - p) / 0.35 + Vector3(randf_range(-0.6, 0.6), randf_range(-0.3, 0.6), randf_range(-0.6, 0.6))
			battle.fx.spawn("star", p, v, {"life": 0.35, "size": 0.22, "size_end": 0.1, "col": Color(col, 1.0), "rot": randf() * TAU})
			await _wait(0.03)
	await _wait(0.1)

# ---------- switching: the red recall beam, and the next one thrown out ----------
func _recall(s: String) -> void:
	var n := _node(s)
	var p := _pos(s) + Vector3(0, 0.4, 0)
	var trainer: Vector3 = battle.ash_pos + Vector3(0, 1.1, 0) if s == "a" else battle.foe_spot + battle.fwd * float(battle.opts.get("foe_trainer_back", 4.6)) + Vector3(0, 1.1, 0)
	Sfx.play("whoosh", p, {"vol": -4.0, "pitch": 1.6})
	var t := 0.0
	while t < 0.55:
		t += get_process_delta_time()
		var u := clampf(t / 0.55, 0.0, 1.0)
		if int(t * 60.0) % 2 == 0:
			var q := trainer.lerp(p, randf())
			battle.fx.spawn("star", q, Vector3.ZERO, {"life": 0.18, "size": 0.25, "size_end": 0.05, "col": Color(1.0, 0.25, 0.2, 1.0), "rot": randf() * TAU})
		_set_appear(s, 1.0 - u)
		if n and is_instance_valid(n): battle.fx.flash(n, Color(1.0, 0.3, 0.25), 0.1)
		await get_tree().process_frame
	battle.fx.spawn("ring", p, Vector3.ZERO, {"life": 0.3, "size": 0.2, "size_end": 1.2, "col": Color(1.0, 0.3, 0.25, 0.9)})
	await _wait(0.25)

func _send_out(s: String, sp: String) -> void:
	if s == "b" and String(battle.opts.get("kind", "wild")) == "wild" and battle.opts.has("party_b"):
		await _come_in(s, sp)
		return
	var to := _home(s)
	var from: Vector3 = battle.ash_pos + Vector3(0, 1.4, 0) if s == "a" else battle.foe_spot + battle.fwd * float(battle.opts.get("foe_trainer_back", 4.6)) + Vector3(0, 1.4, 0)
	_set_appear(s, 0.0)
	# the ball's arc
	var ball := PkmnBall.make()
	battle.add_child(ball)
	Sfx.play("throw", from, {"vol": -2.0})
	var t := 0.0
	while t < 0.6:
		t += get_process_delta_time()
		var u := clampf(t / 0.6, 0.0, 1.0)
		ball.global_position = from.lerp(to + Vector3(0, 0.5, 0), u) + Vector3(0, sin(u * PI) * 1.6, 0)
		ball.rotation.x = -u * 12.0
		await get_tree().process_frame
	ball.queue_free()
	PkmnBall.burst(battle.fx, to + Vector3(0, 0.5, 0))
	Sfx.play("whoosh", to, {"vol": 0.0, "pitch": 0.8})
	_set_pos(s, to)
	_semi[_key(s)] = ""
	if D and int(_pl[s]) == 1: _make_x2(s, sp)
	else: battle.swap_creature(s, sp)
	t = 0.0
	while t < 0.4:
		t += get_process_delta_time()
		var k := UITheme.ease_back(clampf(t / 0.4, 0.0, 1.0), 1.6)
		_set_appear(s, k)
		await get_tree().process_frame
	_set_appear(s, 1.0)
	hud.bind(B)
	_mood(s, _act(s, "taunt", "taunt", "taunt"))
	await _wait(0.4)

# a wild side's next one: no trainer, no ball; it comes in on its own from behind its side
func _come_in(s: String, sp: String) -> void:
	var to := _home(s)
	_set_pos(s, to + battle.fwd * 4.5)
	_semi[_key(s)] = ""
	if D and int(_pl[s]) == 1: _make_x2(s, sp)
	else: battle.swap_creature(s, sp)
	_set_appear(s, 1.0)
	var flies := WildBrain.flies(sp)
	_mood(s, "fly" if flies else "run")
	Sfx.play("whoosh", to, {"vol": -4.0, "pitch": 1.2})
	await _move(s, to, 0.6, 1.2 if flies else 0.5)
	battle.fx.dust(to, 6, Color("cdb68a"), 0.6, 0.3, 0.35)
	_mood(s, "land" if flies else "taunt")
	hud.bind(B)
	await _wait(0.35)

func _bolt(a: Vector3, b: Vector3, col: Color) -> void:
	var n := 9
	var prev := a
	for i in range(1, n + 1):
		var u := float(i) / n
		var p := a.lerp(b, u)
		if i < n: p += Vector3(randf_range(-0.35, 0.35), randf_range(-0.15, 0.15), randf_range(-0.35, 0.35)) * (1.0 - absf(u - 0.5))
		var seg := p - prev
		# (a streak's length is its speed x len: crawling, with a long len, it stays put)
		var mid := prev.lerp(p, 0.5)
		battle.fx.spawn("streak", mid, seg.normalized() * 0.01, {"life": 0.22, "size": 0.0, "len": seg.length() / 0.01, "w": 0.09, "col": Color(1, 1, 0.95, 1.0)})
		battle.fx.spawn("streak", mid, seg.normalized() * 0.01, {"life": 0.26, "size": 0.0, "len": seg.length() / 0.01, "w": 0.36, "col": Color(col, 0.6)})
		prev = p
	battle.fx.spawn("star", a, Vector3.ZERO, {"life": 0.18, "size": 0.5, "size_end": 0.9, "col": Color(col.lightened(0.3), 1.0)})
	battle.fx.spawn("star", b, Vector3.ZERO, {"life": 0.22, "size": 0.9, "size_end": 1.6, "col": Color(col.lightened(0.3), 1.0)})
	battle.fx.spawn("ring", b, Vector3.ZERO, {"life": 0.3, "size": 0.4, "size_end": 1.8, "col": Color(col, 0.9)})
	for i in 8:
		battle.fx.spawn("star", b, Vector3(randf_range(-3, 3), randf_range(0.5, 4), randf_range(-3, 3)), {"life": 0.25, "size": 0.25, "size_end": 0.05, "col": Color(col, 1.0), "rot": randf() * TAU})

func _hit(s: String, e: Dictionary) -> void:
	var n := _node(s)
	var at := _pos(s) + Vector3(0, 0.4, 0)
	battle.fx.flash(n, Color.WHITE, 0.2)
	battle.fx.impact(at, -battle.fwd if s == "b" else battle.fwd, 0.8)
	battle.hitstop(0.08)
	battle.shake = maxf(battle.shake, 0.45)
	Sfx.play("hit_heavy", at, {"vol": 0.0})
	if int(e.get("dmg", 0)) > 0:
		battle.ui.pop("-%d" % int(e.dmg), at + Vector3(0, 0.5, 0), Color("ff5a4a") if s == "a" else UITheme.YELLOW, 60)
	var eff := float(e.get("eff", 1.0))
	if eff > 1.0: battle.ui.pop("SUPER EFFECTIVE!", at + Vector3(0, 1.0, 0), UITheme.ORANGE, 22, "word")
	elif eff < 1.0 and eff > 0.0: battle.ui.pop("NOT VERY EFFECTIVE", at + Vector3(0, 1.0, 0), Color(0.85, 0.88, 0.95), 20, "word")
	if bool(e.get("crit", false)): battle.ui.pop("CRITICAL!", at + Vector3(0, 1.3, 0), UITheme.RED, 22, "word")
	_mood(s, "hurt")

func _dodge(s: String) -> void:
	var p := _pos(s)
	await _move(s, p + battle.side * 0.7, 0.18, 0.2)
	await _move(s, p, 0.3)

func _commit(s: String, semi: String) -> void:
	_semi[_key(s)] = semi
	if semi in ["underground", "underwater"]:
		battle.fx.dust(_pos(s), 14, Color("8a6a44") if semi == "underground" else Color("8ac8ff"), 1.0, 0.8, 0.5)
		Sfx.play("dig", _pos(s), {"vol": 0.0})
	elif semi == "airborne":
		_mood(s, "takeoff")
		battle.fx.dust(_pos(s), 8, Color("cdb68a"), 0.8, 0.4, 0.4)
		Sfx.play("wing_flap_large", _pos(s), {"vol": 0.0})
	await _wait(0.8)

func _move(s: String, to: Vector3, secs: float, hop := 0.0, each: Callable = Callable()) -> void:
	var from := _pos(s)
	var t := 0.0
	while t < secs:
		t += get_process_delta_time()
		var u := clampf(t / secs, 0.0, 1.0)
		var p := from.lerp(to, u)
		p.y = battle._gy(p) + hop * sin(u * PI)
		_set_pos(s, p)
		if each.is_valid(): each.call()
		await get_tree().process_frame

# ---------- doubles ----------
# the second pair out at the start: each side's first steps aside, the next is thrown out beside it
func _doubles_in() -> void:
	for s in ["a", "b"]:
		_pl[s] = 0
		var h := _home(s)
		_move(s, h, 0.5, 0.3)
	await _wait(0.55)
	for s in ["a", "b"]:
		if D.at(s, 1) == null: continue
		_pl[s] = 1
		_x2pos[s] = _home(s)
		var own = battle.opts.get("partner_node2") if s == "a" else null
		if own is Node3D and is_instance_valid(own):
			# his second one is already out: it steps into its place
			_x2[s] = own
			_x2k[s] = 1.0
			if "auto" in own: own.auto = false
			_x2pos[s] = (own as Node3D).global_position
			await _move(s, _home(s), 0.5, 0.25)
		else:
			await _send_out(s, String(D.at(s, 1).species))
		_pl[s] = 0
	if hud: hud.bind(B)

# the camera for a move: the duel's frame holds for most; a big one (a finisher, a
# strike from under the ground or out of the air, power 70 or more) glides in over the
# user's shoulder. Every shot is on the same side of the line (battle.gd _shot_xf).
func _cam_move(s: String, id: String, strike: bool) -> void:
	var m := BattleEnergy.move(id)
	var big := strike or BattleEnergy.tier_of(id) == "finisher" or int(m.get("power", 0)) >= 70
	if not big:
		if String(battle._shot.get("name", "")) != "duel": battle.shot("duel", 2.5)
		return
	if D: _cut_doubles(s)
	else: battle.shot("pk_" + s, 3.2)

# a faint: in on the one going down (the same side of the line)
func _cam_faint(s: String) -> void:
	var p := _pos(s)
	var f: Vector3 = battle.fwd
	var sh := {"pos": p + battle.side * 2.6 - f * (0.5 if s == "a" else 0.9) + Vector3.UP * 1.3, "look": p + Vector3.UP * 0.3, "fov": 42.0, "rate": 2.8, "name": "_fixed"}
	battle._shot = sh

# doubles: the battle's over-the-shoulder shots, from whichever place acts at its target
func _cut_doubles(s: String) -> void:
	var from := _pos(s)
	var to := _real_at(String(_tg.side), int(_tg.place))   # (the real one: up in the air too)
	var f: Vector3 = battle.fwd
	var sd: Vector3 = battle.side
	var up := Vector3.UP
	# over its right shoulder (the battle's side of the line, whichever place acts: the
	# 180 degree rule); pushed clear of whoever stands near the lens below
	var out := 1.0
	var sh := {"pos": from - f * 1.6 + sd * out * 2.4 + up * 2.0, "look": to + up * 0.3 - f * 0.9, "fov": 50.0}
	if s == "b": sh = {"pos": from + f * 2.2 + sd * out * 2.4 + up * 2.2, "look": to + up * 0.3 + f * 0.6, "fov": 52.0}
	# and clear of every one out (a wing, a bulb): pushed off and up from any too near the lens
	var p: Vector3 = sh.pos
	var near := [[battle.ash_pos, 2.4]]   # (Ash too: his head is not the shot)
	for k in [["a", 0], ["a", 1], ["b", 0], ["b", 1]]:
		var fk := D.at(String(k[0]), int(k[1]))
		if fk == null or (String(k[0]) == s and int(k[1]) == int(_pl[s])): continue
		near.append([_pos_at(String(k[0]), int(k[1])), 2.0 + 0.9 * clampf(float(Creature.species_info(String(fk.species)).get("height", 0.5)), 0.3, 1.5)])
	for nq in near:
		var q: Vector3 = nq[0]
		var r: float = nq[1]
		var fl := Vector3(p.x - q.x, 0, p.z - q.z)
		var d := fl.length()
		if d < r and d > 1e-3:
			p += fl / d * (r - d) + up * (r - d) * 0.5
	sh.pos = p
	sh["rate"] = 3.2   # (a glide, never a jump: it stays on the same side)
	sh["name"] = "_fixed"
	battle._shot = sh

func _make_x2(s: String, sp: String) -> void:
	if _x2[s] != null and is_instance_valid(_x2[s]): _x2[s].queue_free()
	var n: Node3D = Creature.make(sp) if ResourceLoader.exists("res://creatures/%s.glb" % sp) else (PidgeyStandin.new() if sp == "pidgey" else PkmnStandin.make(sp))
	battle.add_child(n)
	n.top_level = true
	if "auto" in n: n.auto = false
	if "battle" in n: n.battle = true
	_x2[s] = n
	_x2k[s] = 0.0

# whose turn to choose: the HUD shows that one (its plate, its pools)
func _select_inp() -> void:
	D.select("a", _inp)
	hud.bind(B)
	var f := D.at("a", _inp)
	hud.choosing = "%s  ·  %d OF %d" % [String(f.name).to_upper(), _inp + 1, D.alive_out("a").size()] if f else ""

func _done_for(k: int) -> bool:
	var f := D.at("a", k)
	return f == null or f.fainted() or not f.queue.is_empty()

func _aim_label(t: Dictionary) -> String:
	var f := D.at(String(t.side), int(t.k))
	var who := "ALLY" if String(t.side) == "a" else ("LEFT FOE" if int(t.k) == 0 else "RIGHT FOE")
	return "%s|%s" % [who, String(f.name).to_upper() if f else "?"]

func _on_target(i: int) -> void:
	if _aim_id == "" or i < 0 or i >= _aims.size(): return
	var id := _aim_id
	_aim_id = ""
	hud.show_fight()
	_queue_aimed(id, _aims[i])

func _queue_aimed(id: String, target: Dictionary) -> void:
	if D.queue_at("a", _inp, id, target):
		hud.bind(B)
		hud.show_fight()
		hud.refresh_moves()
	else: hud.show_fight()

# ---------- Ash, the trainer (battle/pkmn_acts.gd) ----------
# his acting to what happens: a command for each of his moves, a wince at a big hit on
# his Pokémon, a fist pump at a KO or a super-effective hit, worry when it faints, a
# shout for a switch; the worried stance while his Pokémon is low on HP
func _ash(n: String) -> void:
	var p = battle.player
	if p == null or p.idles == null: return
	# (a command never cuts off a worry or a cheer still playing)
	var cur: String = p.idles.acting()
	if n == "pk_command" and cur in ["pk_worry", "pk_cheer"]: return
	battle._act(n)

func _ash_react(t: String, s: String, e: Dictionary) -> void:
	match t:
		"move":
			if s == "a": _ash("pk_command")
		"hit", "counter":
			var f := _f(s)
			var dmg := int(e.get("dmg", 0))
			if s == "a" and (dmg >= f.max_hp * 0.22 or bool(e.get("crit", false)) or float(e.get("eff", 1.0)) > 1.0): _ash("pk_wince")
			elif s == "b" and (float(e.get("eff", 1.0)) > 1.0 or bool(e.get("crit", false))): _ash("pk_cheer")
		"faint":
			_ash("pk_worry" if s == "a" else "pk_cheer")
		"switch_out", "switch_in":
			if s == "a": _ash("pk_call")
	_ash_stance()

func _ash_stance() -> void:
	var p = battle.player
	if p == null or p.idles == null: return
	var f := B.fighter("a")
	var low := not f.fainted() and float(f.hp) / maxf(1.0, f.max_hp) <= 0.25
	p.idles.stance = "pk_worried" if low else "pk_ready"

func _make_mound(s: String) -> void:
	var mound := MeshInstance3D.new()
	var mm := SphereMesh.new(); mm.radius = 0.5; mm.height = 0.3
	mound.mesh = mm
	var mat := StandardMaterial3D.new(); mat.albedo_color = Color("7a5a36")
	mound.material_override = mat
	mound.scale = Vector3(1, 0.6, 1)
	mound.top_level = true
	mound.visible = false
	add_child(mound)
	_mound[s] = mound

func _wait(secs: float) -> void:
	await get_tree().create_timer(secs).timeout

# ---------- frozen HUD states (shots of the HUD: dev/pkmn_battle --state=...) ----------
func _state(st: String) -> void:
	var a := B.fighter("a")
	var b := B.fighter("b")
	match st:
		"pools":
			B.begin_turn()
			a.e.set_focus(70.0, "shot"); b.e.set_focus(60.0, "shot")
			B.queue("a", "thunder_shock")
			hud.say("Pikachu used THUNDER SHOCK!", UITheme.SKY)
			hud.show_menu()
		"locks":
			B.begin_turn()
			a.e.set_focus(80.0, "shot"); b.e.set_focus(80.0, "shot")
			a.e.teach("dodge", true); a.e.equip("dodge"); a.e.lock("dodge")
			b.e.teach("dodge", true); b.e.equip("dodge"); b.e.lock("dodge")
			hud.say("The wild PIDGEY is ready for something...", UITheme.YELLOW)
			hud.show_menu()
		"dig":
			B.begin_turn()
			a.e.set_focus(60.0, "shot"); b.e.set_focus(70.0, "shot")
			if not B.queue("b", "dig"): b.e.commit_to("dig")
			B.begin_resolve()
			while B.resolving(): B.step()
			_semi["b"] = "underground"
			hud.say("Camper's SANDSHREW burrowed underground!", UITheme.YELLOW)
			hud.show_fight()
		"moves":
			B.begin_turn()
			a.e.set_focus(60.0, "shot")
			for id in ["swift", "dig", "counter", "protect"]: a.e.teach(id, true)
			B.queue("a", "quick_attack")
			hud.show_fight()
			hud.fight.sel = hud.fight._next_move(hud.fight.rows.size() - 1, -1)
		"lockedin":
			a.e.set_focus(90.0, "shot")
			B.begin_turn()
			b.e.set_focus(50.0, "shot")
			hud.say("PIKACHU is LOCKED IN!", UITheme.YELLOW)
			hud.show_fight()
			pass
		_:
			B.begin_turn()
			hud.show_menu()
