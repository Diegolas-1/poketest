extends Node
# Dev test for the battle's maths and outcomes (battle/battle_rules.gd,
# battle/battle_defeat.gd, life/wild.json), headless. Exits 0 when green:
#   godot --headless --path native res://dev/battle_test.tscn
# What it checks: the data; Ash's stamina (no HP) worn down by three or four of
# a Pidgey's hits and by his own actions (the first ones cost the most); each
# prologue action's effect (sand's aim drop, the rock's damage and anger, Hide's
# lost hits and lost interest, Run's chance);
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
	_sand()
	_hide()
	_rock()
	_run()
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

# a Pidgey's hits (every one landing), as the energy system paces them (1 chip
# on turn 1, 2 a turn after at Lv 3: a Gust, or two Tackles), with Ash spending
# a rock's worth of stamina on his own action each turn: a fight lasts 3-5 turns
# and three to five hits leave him down
func _hits_to_down() -> void:
	var counts := []
	var turns := []
	var known := ["tackle", "sand_attack", "gust", "quick_attack"]
	for sd in 300:
		var R := BattleRules.new("pidgey", "aggressive", "attacking", sd)
		R.force = 1
		var E := BattleEnergy.make("pidgey", R.level())
		E.apply_mode(R.mode)   # the prologue's own pace (battle_config prologue), as the EnergyHook sets it
		var rng := RandomNumberGenerator.new(); rng.seed = sd
		var n := 0
		var t := 0
		while R.outcome == "" and t < 20:
			t += 1
			E.begin_turn()
			R.ash_sta = maxf(0.0, R.ash_sta - R.action_cost("rock"))
			for m in E.plan_turn(known, "aggressive", {"rng": rng, "jitter": 0.3}):
				E.use_move(m)
				var e := R.foe_turn({"kind": "move", "move": m})
				if int(e.dmg) > 0: n += 1
				if R.outcome != "": break
			R.end_turn()
		counts.append(n); turns.append(t)
	var avg := 0.0
	for c in counts: avg += c
	avg /= counts.size()
	var tav := 0.0
	for c in turns: tav += c
	tav /= turns.size()
	print("     hits to put Ash down: min %d max %d mean %.2f; turns min %d max %d mean %.2f" % [counts.min(), counts.max(), avg, turns.min(), turns.max(), tav])
	check(avg >= 3.0 and avg <= 5.0 and int(counts.max()) <= 7, "Ash goes down after about 3-5 hits (mean %.2f)" % avg)
	check(tav >= 3.0 and tav <= 5.0 and int(turns.min()) >= 3, "a losing fight lasts 3-5 turns (mean %.2f)" % tav)
	# damage scales with the move's cost: about 13-16 points a chip
	var R2 := BattleRules.new("pidgey", "flighty", "hidden", 5)
	R2.force = 1
	var e2 := R2.foe_turn({"kind": "move", "move": "tackle"})
	check(int(e2.dmg) >= 12 and int(e2.dmg) <= 16, "a Tackle (1 chip) takes 12-16 of his 100 (%d)" % int(e2.dmg))
	var eg := R2.foe_turn({"kind": "move", "move": "gust"})
	check(int(eg.dmg) >= 27 and int(eg.dmg) <= 33, "a Gust (2 chips) takes 27-33 (%d)" % int(eg.dmg))
	var eq := R2.foe_turn({"kind": "move", "move": "quick_attack"})
	check(int(eq.dmg) >= 10 and int(eq.dmg) <= 14, "a Quick Attack takes 10-14 (%d)" % int(eq.dmg))
	R2.enraged = true
	var e3 := R2.foe_turn({"kind": "move", "move": "tackle"})
	check(int(e3.dmg) >= 15, "enraged it hits harder (%d)" % int(e3.dmg))
	# a miss takes nothing
	var R3 := BattleRules.new("pidgey", "flighty", "hidden", 5)
	R3.force = 0
	var e4 := R3.foe_turn({"kind": "move", "move": "gust"})
	check(not e4.hit and R3.ash_sta == 100.0, "a miss costs him nothing")

func _costs() -> void:
	var R := BattleRules.new("pidgey", "aggressive", "hidden", 3)
	R.force = 0
	check(R.mode == BattleRules.MODE_PROLOGUE, "no partner Pokémon: the prologue's rules")
	var c1 := R.action_cost("hide")
	var e := R.ash_act("hide")
	check(absf(R.ash_sta - (100.0 - c1)) < 1e-4 and float(e.cost) > 0.0, "Hide tires him a little (%.1f left)" % R.ash_sta)
	var c2 := R.action_cost("hide")
	R.ash_act("hide")
	var c3 := R.action_cost("hide")
	var base := float(BattleRules.data().ash_battle.actions.hide.cost)
	check(c1 > c2 and c2 > c3 and absf(c3 - base) < 1e-4, "his first actions cost the most (%.1f, %.1f, then %.1f)" % [c1, c2, c3])
	# worn out by his own effort alone
	var R2 := BattleRules.new("pidgey", "aggressive", "hidden", 3)
	R2.force = 0
	R2.ash_sta = 5.0
	var e2 := R2.ash_act("rock")
	check(R2.outcome == "ash_down" and "exhausted" in e2.notes, "throwing with nothing left: he collapses, exhausted")
	var R3 := BattleRules.new("pidgey", "flighty", "hidden", 3)
	R3.ash_sta = 2.0
	R3.rng.seed = 11
	R3.ash_act("run")
	check(R3.outcome == "ash_down", "no running away with an empty bar")

func _sand() -> void:
	var R := BattleRules.new("pidgey", "curious", "hidden", 2)
	R.force = 1
	var e := R.ash_act("sand")
	check(e.hit and R.foe_acc_stage == -1 and "acc_down" in e.notes, "a handful of sand: its aim falls a stage")
	R.ash_act("sand")
	check(R.foe_acc_stage == -2 and absf(BattleRules.stage_mult(-2) - 0.6) < 1e-4, "two handfuls: aim x0.6")
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

func _hide() -> void:
	# hidden in the grass: it often can't find him
	var found := [0, 0]
	for sd in 400:
		for k in 2:
			var R := BattleRules.new("pidgey", "flighty", "hidden", sd)
			R.foe_acc_stage = 0
			if k == 1: R.ash_act("hide")
			if R.foe_turn({"kind": "move", "move": "tackle"}).hit: found[k] += 1
	check(found[1] < found[0] * 0.6, "hiding, it lands far fewer hits (%d vs %d of 400)" % [found[1], found[0]])
	# and loses interest more
	var dis := [0, 0]
	for sd in 600:
		for k in 2:
			var R := BattleRules.new("pidgey", "flighty", "hidden", sd)
			R.turn = 1
			R.anger = 0.5; R.threat = 0.5
			if k == 1: R.hiding = true
			if R.reaction().get("kind", "") == "disengage": dis[k] += 1
	check(dis[1] > dis[0] + 100, "hiding, it loses interest more often (%d vs %d of 600)" % [dis[1], dis[0]])
	var R2 := BattleRules.new("pidgey", "flighty", "hidden", 5)
	R2.ash_act("hide")
	R2.end_turn()
	check(not R2.hiding, "he comes out of hiding when the turn ends")

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

func _run() -> void:
	var slips := 0
	for sd in 400:
		var R := BattleRules.new("pidgey", "flighty", "hidden", sd)
		var e := R.ash_act("run")
		if e.slip:
			slips += 1
			if R.outcome != "ran": check(false, "a slip is the outcome ran")
		if float(e.chance) < 0.12 or float(e.chance) > 0.9: check(false, "the chance stays in its bounds")
	check(slips > 80 and slips < 300, "Run gets him away some of the time, not always (%d / 400)" % slips)
	# running makes it feel less threatened
	var R2 := BattleRules.new("pidgey", "curious", "startled", 4)
	var th := R2.threat
	R2.ash_act("run")
	check(R2.threat < th, "running lowers the threat")

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
