extends Node
# Dev test for the two-phase moves (Fly, Dig, Dive, Bounce, Sky Attack, Solar Beam and
# every other role two_phase move in the 151's data), the engine and the staging:
#   godot --headless --path native res://dev/twophase_test.tscn
# The engine (battle/pkmn_battle.gd, pkmn_party.gd, pkmn_doubles.gd), headless: every
# one commits, then strikes the next turn and the commit clears; the strike comes first
# of its user's actions that turn; a commit ends cleanly when its user faints, is put to
# sleep, is forced out, or the battle ends; moves against one up in the air or under the
# ground miss with a clear line; the party's forced switch after a faint in the air; no
# switch by choice in the middle of one; doubles.
# The staging (battle/battle_pkmn.gd in the real world, main.tscn, scripted moves): Ash's
# Pidgeotto flies, the foe's flies, a flyer knocked out of the sky with the forced switch,
# a Dig, and doubles: at every turn's start every Pokémon out is back on its spot (no stage
# lift, its own flight landed, shown), the stage's state agrees with the engine's, and no
# move, strike or hit is staged at a Pokémon that is up in the air, under the ground or gone.
# Prints FAIL lines and "TWOPHASE TEST GREEN".

var fails := 0
var checks := 0
var main: Node
var frame := 0
var at := Vector2(-13.0, -95.0)
var ci := -1
var battle: Battle
var wait_t := 0.0
var case_t := 0.0
var seen := {}

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c:
		fails += 1
		printerr("FAIL: " + what)

func _ready() -> void:
	Kanto151Data.install()
	BattleConfig.reset()
	_engine()
	if OS.get_cmdline_user_args().has("--engine-only"):
		_done()
		return
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _done() -> void:
	BattleConfig.reset()
	print("twophase_test: %d checks, %d failures" % [checks, fails])
	print("TWOPHASE TEST GREEN" if fails == 0 else "TWOPHASE TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

# ---------- the engine ----------
func _has(evs: Array, t: String, side := "") -> bool:
	return evs.any(func(e): return e.t == t and (side == "" or e.get("side", "") == side))

func _idx(evs: Array, t: String, side := "") -> int:
	for i in evs.size():
		if evs[i].t == t and (side == "" or evs[i].get("side", "") == side): return i
	return -1

func _b(a, b, kind := "trainer", seed := 1) -> PkmnBattle:
	var o := {"a": a, "b": b, "kind": kind, "seed": seed}
	var B: PkmnBattle = PkmnParty.new(o) if a is Array else PkmnBattle.new(o)
	B.start()
	return B

func _engine() -> void:
	BattleConfig.override({"damage": {"crit_base": 0.0, "crit_per_stage": 0.0, "random_min": 1.0}, "dodge": {"min": 0.0, "max": 0.0}})
	var two := []
	for id in BattleEnergy.moves_data():
		if BattleEnergy.role_of(String(id)) == "two_phase": two.append(String(id))
	two.sort()
	for id in ["fly", "dig", "dive", "bounce", "sky_attack", "solar_beam"]: ok(id in two, "%s is a two-phase move" % id)
	# every one: commit, then the strike, the commit cleared
	for id in two:
		var semi := String(BattleEnergy.move(id).get("two_phase", {}).get("semi", "charging"))
		var B := _b({"species": "mew", "level": 50, "focus": 100.0, "known": [id, "tackle"], "ai": "player"},
			{"species": "snorlax", "level": 50, "focus": 0.0, "hp": 999, "known": ["tackle"], "ai": "balanced"})
		var a := B.fighter("a")
		a.e.equipped = [id, "tackle"]
		B.begin_turn()
		ok(B.queue("a", id), "%s: queued" % id)
		var r := B.resolve()
		ok(_has(r, "commit", "a") and a.e.semi() == semi, "%s: committed (%s)" % [id, a.e.semi()])
		B.begin_turn()
		ok(a.queue.size() == 1 and a.queue[0].free, "%s: the strike queued, free" % id)
		r = B.resolve()
		ok(_has(r, "strike", "a") and a.e.commit.is_empty() and a.e.semi() == "", "%s: struck, the commit cleared" % id)
	# out of reach: a clear line, never a hit
	var lines := {"fly": "up in the air", "dig": "underground", "dive": "underwater", "bounce": "up in the air"}
	for id in lines:
		var B := _b({"species": "mew", "level": 50, "focus": 100.0, "known": [id, "tackle"]},
			{"species": "rattata", "level": 50, "focus": 100.0, "known": ["tackle", "quick_attack"], "ai": "balanced"})
		B.fighter("a").e.equipped = [id, "tackle"]
		B.fighter("b").e.equipped = ["tackle", "quick_attack"]
		B.begin_turn(); B.queue("a", id); B.resolve()
		B.begin_turn(); B.queue("b", "quick_attack")
		var r := B.resolve()
		var u := r.filter(func(e): return e.t == "untargetable")
		ok(u.size() == 1 and String(u[0].text).contains(lines[id]) and String(u[0].text).contains("missed"), "%s: Quick Attack can't reach it (%s)" % [id, u[0].text if not u.is_empty() else "none"])
		var hit_early := false
		for i in r.size():
			if r[i].t == "hit" and r[i].side == "a" and i < _idx(r, "strike", "a"): hit_early = true
		ok(not hit_early, "%s: no hit lands on it while it's away" % id)
	# the strike comes first of its own user's actions that turn
	var Bq := _b({"species": "pidgeotto", "level": 30, "focus": 100.0, "known": ["fly", "quick_attack"]},
		{"species": "snorlax", "level": 30, "focus": 0.0, "hp": 999, "known": ["tackle"], "ai": "balanced"})
	Bq.fighter("a").e.equipped = ["fly", "quick_attack"]
	Bq.begin_turn(); Bq.queue("a", "fly"); Bq.resolve()
	Bq.begin_turn()
	ok(Bq.queue("a", "quick_attack"), "the strike turn: Quick Attack queued beside it")
	var rq := Bq.resolve()
	var si := _idx(rq, "strike", "a")
	var mi := _idx(rq, "move", "a")
	ok(si >= 0 and mi > si, "the strike comes down first, then Quick Attack (strike %d, move %d)" % [si, mi])
	# a faint in the air: the commit cleared; a party's forced switch; the next one out on the ground
	var Bf := _b([{"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"], "ai": "player"}, {"species": "pikachu", "level": 20, "ai": "player"}],
		[{"species": "pidgeotto", "level": 40, "focus": 100.0, "known": ["gust", "tackle"], "ai": "balanced"}])
	var Pf := Bf as PkmnParty
	Bf.fighter("a").e.equipped = ["fly", "tackle"]
	Bf.fighter("b").e.equipped = ["gust"]
	Bf.begin_turn(); Bf.queue("a", "fly"); Bf.resolve()
	Bf.fighter("a").hp = 1
	Bf.begin_turn(); Bf.queue("b", "gust")
	var rf := Bf.resolve()
	var fl := Pf.team.a[0] as PkmnBattle.Fighter
	ok(_has(rf, "hit", "a") and fl.fainted(), "Gust reaches the flyer and knocks it out")
	ok(fl.e.commit.is_empty() and fl.e.semi() == "", "fainted in the air: the commit cleared")
	ok(Pf.pending.a and _has(rf, "need_switch", "a"), "the forced switch")
	var sw := Pf.switch_to("a", 1)
	ok(_has(sw, "switch_in", "a") and Bf.fighter("a").e.semi() == "" and not _has(rf, "strike", "a"), "the next one out, on the ground, no strike")
	# no switch by choice in the middle of one, with the reason
	var Bs := _b([{"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"], "ai": "player"}, {"species": "pikachu", "level": 20, "ai": "player"}],
		[{"species": "snorlax", "level": 20, "focus": 0.0, "known": ["tackle"], "ai": "balanced"}])
	Bs.fighter("a").e.equipped = ["fly", "tackle"]
	Bs.begin_turn(); Bs.queue("a", "fly"); Bs.resolve()
	var Ps := Bs as PkmnParty
	ok(not Ps.can_switch("a", 1) and Ps.switch_to("a", 1).is_empty(), "no recall while up in the air")
	ok(Ps.switch_block("a").contains("air"), "the reason (%s)" % Ps.switch_block("a"))
	Bs.begin_turn(); Bs.resolve()
	ok(Ps.can_switch("a", 1) and Ps.switch_block("a") == "", "after the strike it can be recalled")
	# asleep on the strike turn: it comes to nothing, cleanly
	var Bz := _b({"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"]},
		{"species": "snorlax", "level": 20, "focus": 0.0, "known": ["tackle"], "ai": "balanced"})
	Bz.fighter("a").e.equipped = ["fly", "tackle"]
	Bz.begin_turn(); Bz.queue("a", "fly"); Bz.resolve()
	Bz.fighter("a").status = "sleep"; Bz.fighter("a").sleep_turns = 3; Bz.fighter("a").sleep_from = 0
	Bz.begin_turn()
	var rz := Bz.resolve()
	ok(_has(rz, "forced_out", "a") and Bz.fighter("a").e.commit.is_empty(), "asleep on the strike turn: it comes to nothing, the commit cleared")
	# Whirlwind forces a flyer down
	# (Whirlwind goes last: on the commit turn, after it went up)
	var Bw := _b({"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"]},
		{"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["whirlwind", "tackle"], "ai": "balanced"})
	Bw.fighter("a").e.equipped = ["fly", "tackle"]
	Bw.fighter("b").e.equipped = ["whirlwind", "tackle"]
	Bw.begin_turn(); Bw.queue("a", "fly"); Bw.queue("b", "whirlwind")
	var rw := Bw.resolve()
	ok(_idx(rw, "commit", "a") >= 0 and _idx(rw, "forced_out", "a") > _idx(rw, "commit", "a") and Bw.fighter("a").e.commit.is_empty(), "Whirlwind forces it down, the commit cleared")
	Bw.begin_turn()
	ok(Bw.fighter("a").queue.is_empty(), "no strike the next turn")
	# the battle ends while it's up: the commit cleared at the end
	var Be := _b({"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"]},
		{"species": "rattata", "level": 5, "focus": 0.0, "known": ["tackle"], "ai": "wild"}, "wild")
	Be.fighter("a").e.equipped = ["fly", "tackle"]
	Be.fighter("b").hp = 1
	Be.fighter("b").status = "poison"
	Be.begin_turn(); Be.queue("a", "fly")
	Be.resolve()
	ok(Be.over and Be.fighter("a").e.semi() == "airborne", "the foe goes down while it's up")
	Be.finish()
	ok(Be.fighter("a").e.commit.is_empty(), "the battle over: the commit cleared")
	# the foe flies: the same, the other way round
	var Bb := _b({"species": "pikachu", "level": 20, "focus": 100.0, "known": ["thunder_shock", "quick_attack"]},
		{"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"], "ai": "balanced"})
	Bb.fighter("b").e.equipped = ["fly", "tackle"]
	Bb.begin_turn(); Bb.queue("b", "fly"); Bb.resolve()
	ok(Bb.fighter("b").e.semi() == "airborne", "the foe flew up")
	Bb.begin_turn(); Bb.queue("a", "quick_attack")
	var rb := Bb.resolve()
	ok(_has(rb, "untargetable", "b") and _has(rb, "strike", "b") and _has(rb, "hit", "a") and Bb.fighter("b").e.semi() == "", "the foe: Quick Attack misses it, it strikes, it's back")
	# doubles: one of a pair flies and strikes
	var D := PkmnDoubles.new({"a": [{"species": "pidgeotto", "level": 25, "focus": 100.0, "known": ["fly", "tackle"], "ai": "player"}, {"species": "pikachu", "level": 25, "ai": "player"}],
		"b": [{"species": "rattata", "level": 25, "focus": 0.0, "hp": 999, "known": ["tackle"], "ai": "balanced"}, {"species": "rattata", "level": 25, "focus": 0.0, "hp": 999, "known": ["tackle"], "ai": "balanced"}], "kind": "trainer", "seed": 3})
	D.start()
	D.at("a", 0).e.equipped = ["fly", "tackle"]
	D.begin_turn()
	ok(D.queue_at("a", 0, "fly", {"side": "b", "k": 1}), "doubles: Fly queued at the right foe")
	var rd := D.resolve()
	ok(_has(rd, "commit", "a") and D.at("a", 0).e.semi() == "airborne", "doubles: up")
	D.begin_turn()
	rd = D.resolve()
	var st := rd.filter(func(e): return e.t == "strike")
	ok(st.size() == 1 and int(st[0].place) == 0 and D.at("a", 0).e.semi() == "", "doubles: place 0 strikes, back down")
	BattleConfig.reset()

# ---------- the staging ----------
const INVUL := ["airborne", "underground", "underwater"]
const CASES := [
	{"name": "ash_fly", "o": {"party_a": [{"species": "pidgeotto", "level": 22, "focus": 100.0, "known": ["fly", "tackle", "gust"], "equip": ["fly", "tackle", "gust"]}],
		"party_b": [{"species": "rattata", "level": 18, "focus": 40.0, "known": ["tackle", "quick_attack"], "equip": ["tackle", "quick_attack"]}],
		"kind": "trainer", "trainer": "Youngster", "script_pkmn": {"a": {"1": ["fly"], "3": ["fly"]}, "b": {"1": ["quick_attack"], "2": ["tackle"]}}}},
	{"name": "foe_fly", "o": {"party_a": [{"species": "pikachu", "level": 20, "focus": 100.0, "known": ["thunder_shock", "quick_attack"], "equip": ["thunder_shock", "quick_attack"]}],
		"party_b": [{"species": "pidgeotto", "level": 20, "focus": 100.0, "known": ["fly", "tackle"], "equip": ["fly", "tackle"]}],
		"kind": "trainer", "trainer": "Bird Keeper", "script_pkmn": {"b": {"1": ["fly"], "3": ["fly"]}, "a": {"1": ["thunder_shock"], "2": ["quick_attack"]}}}},
	{"name": "fly_faint", "low_a": 2, "o": {"party_a": [{"species": "pidgeotto", "level": 16, "focus": 100.0, "known": ["fly", "tackle"], "equip": ["fly", "tackle"]}, {"species": "pikachu", "level": 20, "focus": 60.0}],
		"party_b": [{"species": "pidgeotto", "level": 30, "focus": 100.0, "known": ["gust", "tackle"], "equip": ["gust", "tackle"]}],
		"kind": "trainer", "trainer": "Bird Keeper", "script_pkmn": {"a": {"1": ["fly"]}, "b": {"1": ["tackle"], "2": ["gust"]}}}},
	{"name": "dig", "o": {"party_a": [{"species": "sandshrew", "level": 22, "focus": 100.0, "known": ["dig", "scratch"], "equip": ["dig", "scratch"]}],
		"party_b": [{"species": "rattata", "level": 18, "focus": 40.0, "known": ["tackle", "quick_attack"], "equip": ["tackle", "quick_attack"]}],
		"kind": "trainer", "trainer": "Youngster", "script_pkmn": {"a": {"1": ["dig"]}, "b": {"1": ["tackle"], "2": ["quick_attack"]}}}},
	{"name": "doubles_fly", "o": {"party_a": [{"species": "pidgeotto", "level": 22, "focus": 100.0, "known": ["fly", "tackle"], "equip": ["fly", "tackle"]}, {"species": "pikachu", "level": 22, "focus": 60.0}],
		"party_b": [{"species": "pidgeotto", "level": 18, "focus": 100.0, "known": ["fly", "tackle"], "equip": ["fly", "tackle"]}, {"species": "rattata", "level": 18, "focus": 40.0}],
		"kind": "trainer", "trainer": "Twins", "doubles": true, "script_pkmn": {"a": {"1": ["fly"]}, "b1": {"1": ["tackle"]}, "b": {"2": ["fly"]}}}},
	{"name": "swarm_fly", "o": {"party_a": [{"species": "pidgeotto", "level": 24, "focus": 100.0, "known": ["fly", "gust"], "equip": ["fly", "gust"]}, {"species": "pikachu", "level": 24, "focus": 60.0}],
		"party_b": [{"species": "beedrill", "level": 8}, {"species": "beedrill", "level": 8}, {"species": "beedrill", "level": 8}],
		"kind": "wild", "ai": "wild", "doubles": true, "waves": true, "script_pkmn": {"a": {"1": ["fly"]}}}},
]

func _process(dt: float) -> void:
	if main == null: return
	frame += 1
	if frame == 3:
		main.cast.clock.real = false; main.cast.clock.ff = 1.0; main.cast.clock.set_time(10.5)
	if frame < 20:
		main.pos = Vector3(at.x, main.world.height_at(at.x, at.y), at.y)
		main.speed = 0.0
		main.cast.land(main.pos.y)
		return
	case_t += dt
	if battle == null or not is_instance_valid(battle) or not Battle.active:
		wait_t += dt
		if wait_t < 1.0: return
		wait_t = 0.0
		_next_case()
		return
	if case_t > 150.0:
		ok(false, "%s: the battle ran too long" % CASES[ci].name)
		battle.pk.B.over = true
		battle.pk._over = true
		case_t = -1000.0

func _next_case() -> void:
	ci += 1
	if ci >= CASES.size():
		ok(seen.get("strike", 0) >= 5 and seen.get("untargetable", 0) >= 2 and seen.get("commit", 0) >= 5, "the staged cases flew, dug, struck and missed (%s)" % [seen])
		_done()
		return
	var C: Dictionary = CASES[ci]
	var d := Vector3(sin(main.yaw), 0, cos(main.yaw))
	var o: Dictionary = C.o.duplicate(true)
	o.merge({"mode": "pkmn", "at": main.pos + d * 4.4, "where": "tall_grass", "seed": 5 + ci, "auto": true, "first": "a"}, true)
	o["on_event"] = func(e: Dictionary): _on_event(C, e)
	case_t = 0.0
	battle = Battle.start(main, o)
	print("twophase_test: case %s" % C.name)

func _bp() -> BattlePkmn: return battle.pk

# the engine's fighter at a side's place (doubles: its place)
func _fighter(s: String, pl: int) -> PkmnBattle.Fighter:
	var bp := _bp()
	if bp.D: return bp.D.at(s, pl)
	return bp.B.fighter(s) if pl == 0 else null

func _node_at(s: String, pl: int) -> Node3D:
	var bp := _bp()
	if bp.D and pl == 1: return bp._x2[s]
	return battle.partner if s == "a" else battle.foe

func _stage_pos(s: String, pl: int) -> Vector3:
	var bp := _bp()
	if bp.D and pl == 1: return bp._x2pos[s]
	return battle.partner_pos if s == "a" else battle.foe_pos

func _on_event(C: Dictionary, e: Dictionary) -> void:
	var t := String(e.get("t", ""))
	seen[t] = int(seen.get(t, 0)) + 1
	var bp := _bp()
	if bp == null: return
	var nm := String(C.name)
	if t == "turn":
		var n := int(e.get("n", 0))
		if n >= 2: _check_rest(nm, n)
		if n == int(C.get("low_a", -1)):
			var fa := _fighter("a", 0)
			if fa: fa.hp = 1
		# no long battles: the foe weak after the checks
		if n >= 5:
			for pl in 2:
				var fb := _fighter("b", pl)
				if fb and not fb.fainted(): fb.hp = mini(fb.hp, 1)
		return
	var s := String(e.get("side", ""))
	if not s in ["a", "b"]: return
	var pl := int(e.get("place", 0)) if bp.D else 0
	if t in ["move", "strike", "hit", "commit", "untargetable", "forced_out", "pulled_out"]:
		var n := _node_at(s, pl)
		ok(n != null and is_instance_valid(n), "%s: the %s event's Pokémon is on the stage (%s %d)" % [nm, t, s, pl])
	if t == "hit":
		var f := _fighter(s, pl)
		var n2 := _node_at(s, pl)
		var semi := f.e.semi() if f else ""
		ok(not semi in INVUL or float(e.get("mult", 1.0)) > 0.0 and PkmnBattle.interaction(String(e.get("move", "")), semi).get("hits", false),
			"%s: a hit lands only on one in reach (%s, %s)" % [nm, e.get("move", ""), semi])
		ok(n2 != null and is_instance_valid(n2) and (n2.visible or semi in ["underground", "underwater"]), "%s: a hit on a shown Pokémon" % nm)

# at a turn's start: everyone out back on its spot, the stage agreeing with the engine
func _check_rest(nm: String, n: int) -> void:
	var bp := _bp()
	for s in ["a", "b"]:
		for pl in (2 if bp.D else 1):
			var f := _fighter(s, pl)
			if f == null or f.fainted(): continue
			var key: String = s if pl == 0 else s + "1"
			var semi := f.e.semi()
			var vis := semi if semi in INVUL else ""
			var staged := String(bp._semi[key]) if String(bp._semi[key]) in INVUL else ""
			ok(staged == vis, "%s T%d %s: the stage's state (%s) is the engine's (%s)" % [nm, n, key, staged, vis])
			var nd := _node_at(s, pl)
			if nd == null or not is_instance_valid(nd): continue
			var sp := _stage_pos(s, pl)
			var flat := Vector2(nd.global_position.x - sp.x, nd.global_position.z - sp.z).length()
			var lift := nd.global_position.y - battle._gy(sp)
			var own := float(nd.get("height")) if "height" in nd else 0.0
			if vis == "":
				ok(lift < 0.3 and own < 0.15 and not ("flying" in nd and nd.flying), "%s T%d %s: on the ground (stage lift %.2f, its own %.2f)" % [nm, n, key, lift, own])
				ok(nd.visible, "%s T%d %s: shown" % [nm, n, key])
				var home := bp._home_at(s, pl)
				ok(Vector2(sp.x - home.x, sp.z - home.z).length() < 0.8, "%s T%d %s: on its spot" % [nm, n, key])
			elif vis == "airborne":
				ok(lift + own > 1.5 and lift + own < 3.4, "%s T%d %s: up in the air, once (%.2f + %.2f)" % [nm, n, key, lift, own])
			else:
				ok(not nd.visible, "%s T%d %s: out of sight under" % [nm, n, key])
			ok(flat < 0.3, "%s T%d %s: the node where the stage has it (%.2f)" % [nm, n, key, flat])
	# no staged move aimed at empty space: each one at a Pokémon away was a whiff
	for r in bp.staged:
		if r.get("_checked", false): continue
		r["_checked"] = true
		ok(not String(r.tsemi) in INVUL or bool(r.whiff) or PkmnBattle.interaction(String(r.id), String(r.tsemi)).get("hits", false),"%s: %s at %s (%s) is staged as a miss, not at empty space" % [nm, r.id, r.tkey, r.tsemi])
		ok(r.whiff or Vector3(r.to).distance_to(Vector3(r.tnode)) < 0.6, "%s: %s aimed at the real node (%.2f off)" % [nm, r.id, Vector3(r.to).distance_to(Vector3(r.tnode))])
