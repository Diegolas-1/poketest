extends Node
# Dev test for the battle's maths and outcomes (battle/battle_rules.gd,
# battle/battle_defeat.gd, life/wild.json), headless. Exits 0 when green:
#   godot --headless --path native res://dev/battle_test.tscn
# What it checks: the data; Ash's stamina (no HP) worn down by three or four of
# a Pidgey's hits and by his own actions; each action's effect (Kick Sand's aim
# drop, Startle by temper, the rock's damage and anger, Back Away's chance);
# the wild side's reactions (flight when hurt or scared, losing interest when
# not threatened); whole battles to their end for every temper (a table of
# outcomes); the defeat's aftermath (the Scraped & Dirty condition, the flag);
# the turn hooks for the energy system.

var fails := 0

class FakeQuests extends Node:
	var flags := {}
	func flag(f: String) -> bool: return flags.has(f)
	func set_flag(f: String, on := true) -> void:
		if on: flags[f] = true
		else: flags.erase(f)

class FakeClock extends Object:
	var minutes := 1440.0 + 600.0

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)
	else:
		print("ok   ", what)

func _ready() -> void:
	_data()
	_hits_to_down()
	_costs()
	_kick()
	_startle()
	_rock()
	_back_away()
	_reactions()
	_whole_battles()
	_aftermath()
	print("battle_test: %s (%d failed)" % ["GREEN" if fails == 0 else "RED", fails])
	get_tree().quit(1 if fails > 0 else 0)

func _data() -> void:
	var R := BattleRules.new("pidgey", "flighty", "hidden", 1)
	check(R.foe_max == 16.0 and R.foe_hp == 16.0, "Pidgey has 16 HP")
	check(R.ash_sta_max == 100.0 and R.ash_sta == 100.0, "Ash starts with a full stamina bar (100 points), no HP")
	for id in ["gust", "tackle", "quick_attack", "sand_attack"]:
		var m := R.move_data(id)
		check(String(m.get("id", "")) == id and m.has("type"), "move %s has its id and a type (room for an energy cost)" % id)
	check(R.is_first("quick_attack") and not R.is_first("gust"), "Quick Attack goes first")
	for a in BattleRules.ACTIONS: check(R.action_cost(a) > 0.0, "%s costs Ash stamina" % a)
	check(R.display_name() == "PIDGEY" and R.level() == 3, "name and level")

# a Pidgey's hits (every one landing): three or four of them leave Ash down
func _hits_to_down() -> void:
	var counts := []
	for sd in 300:
		var R := BattleRules.new("pidgey", "aggressive", "attacking", sd)
		R.force = 1
		var n := 0
		while R.outcome == "" and n < 20:
			var m := R.pick_move()
			var e := R.foe_turn({"kind": "move", "move": m})
			if int(e.dmg) > 0: n += 1
			R.end_turn()
		counts.append(n)
	var mn: int = counts.min(); var mx: int = counts.max()
	var avg := 0.0
	for c in counts: avg += c
	avg /= counts.size()
	print("     hits to put Ash down: min %d max %d mean %.2f" % [mn, mx, avg])
	check(mn >= 3 and mx <= 5 and avg >= 3.0 and avg <= 4.5, "Ash goes down after about 3-4 hits (mean %.2f)" % avg)
	# one hit is a big chunk: a quarter to a third of the bar
	var R2 := BattleRules.new("pidgey", "flighty", "hidden", 5)
	R2.force = 1
	var e2 := R2.foe_turn({"kind": "move", "move": "tackle"})
	check(int(e2.dmg) >= 25 and int(e2.dmg) <= 31, "a Tackle takes 25-31 of his 100 (%d)" % int(e2.dmg))
	R2.enraged = true
	var e3 := R2.foe_turn({"kind": "move", "move": "tackle"})
	check(int(e3.dmg) >= 31, "enraged it hits harder (%d)" % int(e3.dmg))
	# a miss takes nothing
	var R3 := BattleRules.new("pidgey", "flighty", "hidden", 5)
	R3.force = 0
	var e4 := R3.foe_turn({"kind": "move", "move": "gust"})
	check(not e4.hit and R3.ash_sta == 100.0, "a miss costs him nothing")

func _costs() -> void:
	var R := BattleRules.new("pidgey", "aggressive", "hidden", 3)
	R.force = 0
	var e := R.ash_act("startle")
	check(absf(R.ash_sta - (100.0 - R.action_cost("startle"))) < 1e-4 and float(e.cost) > 0.0, "Startle tires him (%.0f left)" % R.ash_sta)
	# worn out by his own effort alone
	var R2 := BattleRules.new("pidgey", "aggressive", "hidden", 3)
	R2.force = 0
	R2.ash_sta = 5.0
	var e2 := R2.ash_act("rock")
	check(R2.outcome == "ash_down" and "exhausted" in e2.notes, "throwing with nothing left: he collapses, exhausted")
	var R3 := BattleRules.new("pidgey", "flighty", "hidden", 3)
	R3.ash_sta = 2.0
	R3.rng.seed = 11
	R3.ash_act("back_away")
	check(R3.outcome == "ash_down", "no slipping away with an empty bar")

func _kick() -> void:
	var R := BattleRules.new("pidgey", "curious", "hidden", 2)
	R.force = 1
	var e := R.ash_act("kick_sand")
	check(e.hit and R.foe_acc_stage == -1 and "acc_down" in e.notes, "Kick Sand: its aim falls a stage")
	R.ash_act("kick_sand")
	check(R.foe_acc_stage == -2 and absf(BattleRules.stage_mult(-2) - 0.6) < 1e-4, "two kicks: aim x0.6")
	# a blinded one misses more
	var hits := 0
	for sd in 400:
		var Q := BattleRules.new("pidgey", "curious", "hidden", sd)
		Q.foe_acc_stage = -2
		if Q.foe_turn({"kind": "move", "move": "tackle"}).hit: hits += 1
	check(hits < 400 * 0.62, "with sand in its eyes it misses more (%d / 400 land)" % hits)
	# and gives up sooner (not the aggressive)
	var dis := [0, 0]
	for sd in 600:
		for k in 2:
			var Q := BattleRules.new("pidgey", "curious" if k == 0 else "aggressive", "hidden", sd)
			Q.turn = 2
			Q.foe_acc_stage = -2
			Q.anger = 0.5; Q.threat = 0.5   # (threatened: only the blindness counts)
			if Q.reaction().get("kind", "") == "disengage": dis[k] += 1
	check(dis[0] > dis[1] * 3, "blinded, a curious one gives up far more than an aggressive one (%d vs %d)" % dis)

func _startle() -> void:
	var fled := {"timid": 0, "flighty": 0, "curious": 0, "aggressive": 0}
	var enr := 0
	for sd in 400:
		for tp in fled:
			var R := BattleRules.new("pidgey", tp, "hidden", sd)
			var e := R.ash_act("startle")
			if e.flee or R.reaction().get("kind", "") == "flee": fled[tp] += 1
			if tp == "aggressive" and "enraged" in e.notes and R.anger > 0.6: enr += 1
	print("     startle -> it flees (of 400): %s" % str(fled))
	check(fled.timid > 400 * 0.3 and fled.flighty > 400 * 0.25, "Startle may make a timid or flighty one flee")
	check(fled.aggressive < 400 * 0.05, "an aggressive one hardly ever flees from a shout")
	check(enr == 400, "an aggressive one gets enraged and angrier")

func _rock() -> void:
	var R := BattleRules.new("pidgey", "flighty", "hidden", 8)
	R.force = 1
	var a0 := R.anger
	var e := R.ash_act("rock")
	check(int(e.dmg) >= 3 and int(e.dmg) <= 5 and R.foe_hp == 16.0 - int(e.dmg), "a rock: a little damage (%d)" % int(e.dmg))
	check(R.anger > a0 + 0.25, "and it's angry")
	var R2 := BattleRules.new("pidgey", "flighty", "hidden", 8)
	R2.force = 1
	R2.foe_hp = 3.0
	R2.ash_act("rock")
	check(R2.outcome == "ash_won", "a rock on a worn-out one drives it off (ash_won)")

func _back_away() -> void:
	var slips := 0
	for sd in 400:
		var R := BattleRules.new("pidgey", "flighty", "hidden", sd)
		var e := R.ash_act("back_away")
		if e.slip:
			slips += 1
			if R.outcome != "ran": check(false, "a slip is the outcome ran")
		if float(e.chance) < 0.12 or float(e.chance) > 0.9: check(false, "the chance stays in its bounds")
	check(slips > 80 and slips < 300, "Back Away gets him out some of the time (%d / 400)" % slips)
	# backing off makes it feel less threatened
	var R2 := BattleRules.new("pidgey", "curious", "startled", 4)
	var th := R2.threat
	R2.ash_act("back_away")
	check(R2.threat < th, "backing off lowers the threat")

func _reactions() -> void:
	var flee := 0
	for sd in 400:
		var R := BattleRules.new("pidgey", "flighty", "hidden", sd)
		R.foe_hp = 4.0
		if R.reaction().get("kind", "") == "flee": flee += 1
	check(flee > 400 * 0.6, "hurt, it flees (%d / 400)" % flee)
	var dis := 0
	for sd in 400:
		var R := BattleRules.new("pidgey", "curious", "hidden", sd)
		R.turn = 3; R.threat = 0.05; R.anger = 0.05; R.fear = 0.0
		if R.reaction().get("kind", "") == "disengage": dis += 1
	check(dis > 400 * 0.2, "not threatened, it may lose interest (%d / 400)" % dis)
	var R2 := BattleRules.new("pidgey", "curious", "hidden", 1)
	R2.turn = 0; R2.threat = 0.0; R2.anger = 0.0
	var first_dis := 0
	for i in 400: if R2.reaction().get("kind", "") == "disengage": first_dis += 1
	check(first_dis < dis, "less so on the first turn")

# whole battles, as battle.gd's loop runs them (lead moves, Ash, the reaction, the rest, end_turn)
func _whole_battles() -> void:
	for tp in ["flighty", "timid", "curious", "aggressive"]:
		var out := {}
		var turns := 0
		var max_t := 0
		for sd in 300:
			var R := BattleRules.new("pidgey", tp, "hidden", sd)
			var pol := RandomNumberGenerator.new(); pol.seed = sd * 7 + 1
			var guard := 0
			while R.outcome == "" and guard < 40:
				guard += 1
				var picks := [R.pick_move()]   # (battle.gd _wild_pick: one a turn for now)
				var lead := []
				while not picks.is_empty() and R.is_first(String(picks[0])): lead.append(picks.pop_front())
				for id in lead:
					R.foe_turn({"kind": "move", "move": id})
					if R.outcome != "": break
				if R.outcome != "": break
				R.ash_act(BattleRules.ACTIONS[pol.randi() % 4])
				if R.outcome != "": break
				var re := R.reaction()
				if not re.is_empty(): R.foe_turn(re); break
				for id in picks:
					R.foe_turn({"kind": "move", "move": id})
					if R.outcome != "": break
				R.end_turn()
			out[R.outcome] = int(out.get(R.outcome, 0)) + 1
			turns += R.turn
			max_t = maxi(max_t, R.turn)
		print("     %-10s outcomes of 300: %s   mean turns %.1f, longest %d" % [tp, str(out), turns / 300.0, max_t])
		check(not out.has(""), "%s: every battle ends" % tp)
		check(out.size() >= 3, "%s: more than one way it ends" % tp)
		if tp == "aggressive": check(int(out.get("ash_down", 0)) > int(out.get("fled", 0)), "an aggressive one puts him down more often than it flees")
		if tp == "timid": check(int(out.get("fled", 0)) > int(out.get("ash_down", 0)), "a timid one flees more often than it wins")

func _aftermath() -> void:
	var clk := FakeClock.new()
	var C := Conditions.new()
	C.save_path = "user://battle_test_conditions.save"
	C.autosave = false
	add_child(C)
	C.setup(clk)
	var Q := FakeQuests.new()
	add_child(Q)
	check(C.defs.has("scraped"), "the Scraped & Dirty condition exists")
	BattleDefeat.aftermath(Q, C, null, true)
	check(C.has("scraped") and absf(C.strength("scraped") - 1.0) < 1e-4, "knocked down: Scraped & Dirty")
	check(C.label("scraped") == "Scraped & Dirty", "its name: " + C.label("scraped"))
	check(Q.flag("route1_mauled"), "the flag route1_mauled")
	check(absf(C.mult("speed") - 0.9) < 1e-4 and C.mult("run_speed") < 1.0 and C.mult("stamina_max") < 1.0, "slower, running slower, tiring sooner")
	clk.minutes += 240.0
	C._process(0.016)
	check(C.strength("scraped") < 0.6 and C.has("scraped"), "it wears off with time (%.2f after 4 hours)" % C.strength("scraped"))
	BattleDefeat.joy_heals(C, null)
	check(not C.has("scraped"), "Nurse Joy patches him up")
	var Q2 := FakeQuests.new()
	add_child(Q2)
	BattleDefeat.aftermath(Q2, C, null, false)
	check(not Q2.flag("route1_mauled") and C.has("scraped"), "down elsewhere: sore, but not the Route 1 event")
	clk.free()
