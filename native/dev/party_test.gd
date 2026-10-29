extends Node
# Dev test for the party layer (battle/pkmn_party.gd), headless: teams of up to
# six with one out, a switch by choice (it takes the turn), a faint with others
# left (the turn stops, the next one is picked: the trainer AI's pick), win and
# loss when a side has none left, focus kept per Pokémon on the bench, the coin
# deciding who moves first on turn 1, the nameplate's slots, the results; and
# doubles (battle/pkmn_doubles.gd): two out a side, aimed moves, the ally, the
# places filled after a faint, whole doubles battles to the end.
#   godot --headless --path native res://dev/party_test.tscn

var fails := 0
var checks := 0

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c:
		fails += 1
		printerr("FAIL: " + what)

func _ready() -> void:
	_run.call_deferred()

func _run() -> void:
	BattleConfig.reset()
	_switching()
	_faint_and_forced()
	_win_and_loss()
	_focus_kept()
	_coin()
	_slots_and_results()
	_whole()
	_doubles()
	print("party_test: %d checks, %d failures" % [checks, fails])
	print("PARTY TEST GREEN" if fails == 0 else "PARTY TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

func _b(seed := 1, first := "") -> PkmnParty:
	var B := PkmnParty.new({"a": [{"species": "pikachu", "level": 20}, {"species": "squirtle", "level": 18}, {"species": "bulbasaur", "level": 18}],
		"b": [{"species": "geodude", "level": 18, "ai": "balanced"}, {"species": "onix", "level": 20}, {"species": "vulpix", "level": 16}],
		"kind": "trainer", "seed": seed, "first": first})
	B.start()
	return B

func _switching() -> void:
	var B := _b()
	ok(B.team.a.size() == 3 and B.team.b.size() == 3, "three a side")
	ok(B.fighter("a") == B.team.a[0] and B.active.a == 0, "the lead is out")
	ok(B.team.b[1].ai == "balanced", "the bench gets the lead's AI")
	B.begin_turn()
	ok(not B.can_switch("a", 0), "no switching to the one out")
	var evs := B.switch_to("a", 1)
	ok(evs.size() == 2 and evs[0].t == "switch_out" and evs[1].t == "switch_in", "a switch: out, in")
	ok(B.fighter("a") == B.team.a[1] and B.active.a == 1, "squirtle is out")
	ok(B.fighter("a").species == "squirtle", "the engine fights with it")
	ok(B.queued("a").is_empty(), "a switch is the whole turn")
	var hp_before: int = B.team.a[1].hp
	B.ai_queue("b")
	var out := B.resolve()
	ok(not out.is_empty(), "the foe's moves play on the new one")
	ok(B.team.a[1].hp <= hp_before, "the new one takes the hits")
	ok(B.team.a[0].hp == B.team.a[0].max_hp, "the benched one is untouched")
	# a switch back
	B.begin_turn()
	B.switch_to("a", 0)
	ok(B.fighter("a").species == "pikachu", "back to Pikachu")

func _faint_and_forced() -> void:
	var B := _b(3)
	B.begin_turn()
	# Geodude on its last legs: Squirtle out... Pikachu's attack finishes it
	B.team.b[0].hp = 1
	var played := false
	for t in 6:
		for id in B.fighter("a").e.usable():
			if PkmnBattle.is_attack(id) and B.queue("a", id): break
		B.ai_queue("b")
		var out := B.resolve()
		if B.pending.b:
			played = true
			ok(out.any(func(e): return e.t == "faint" and e.side == "b"), "Geodude fainted")
			ok(out.any(func(e): return e.t == "need_switch" and e.side == "b"), "need_switch event")
			break
		B.begin_turn()
	ok(played, "Geodude went down within a few turns")
	ok(not B.over, "one fainted, two left: not over")
	ok(B.alive("b") == 2, "two left")
	ok(not B.can_switch("b", 0), "no sending out a fainted one")
	var pick := B.ai_pick("b")
	ok(pick in [1, 2], "the AI picks from the bench (%d)" % pick)
	B.switch_to("b", pick)
	ok(not B.pending.b and B.active.b == pick, "the forced switch is made")
	ok(B.fighter("b") == B.team.b[pick], "the engine fights with the new one")
	# the AI's pick is sensible: against a Water type out, Onix (rock / ground) is not it when Vulpix is bad too... it
	# never picks the worst matchup when a clearly better one is there
	var C := PkmnParty.new({"a": {"species": "squirtle", "level": 20},
		"b": [{"species": "rattata", "level": 15, "ai": "balanced"}, {"species": "charmander", "level": 15}, {"species": "oddish", "level": 15}], "kind": "trainer", "seed": 1})
	C.start()
	ok(C.ai_pick("b") == 2, "against Squirtle the AI sends Oddish, not Charmander")

func _win_and_loss() -> void:
	var B := _b(5)
	B.begin_turn()
	for f in B.team.b: if f != B.fighter("b"): f.hp = 0
	B.fighter("b").hp = 1
	var done := false
	for t in 8:
		for id in B.fighter("a").e.usable():
			if PkmnBattle.is_attack(id) and B.queue("a", id): break
		B.ai_queue("b")
		B.resolve()
		if B.over: done = true; break
		B.begin_turn()
	ok(done and B.outcome == "won", "the last one down: won (%s)" % B.outcome)
	var L := _b(6)
	L.begin_turn()
	for f in L.team.a: if f != L.fighter("a"): f.hp = 0
	L.fighter("a").hp = 1
	var lost := false
	for t in 8:
		L.ai_queue("b")
		L.resolve()
		if L.over: lost = true; break
		L.begin_turn()
	ok(lost and L.outcome == "lost", "Ash's last one down: lost (%s)" % L.outcome)

func _focus_kept() -> void:
	var B := _b(7)
	B.team.a[0].e.set_focus(70.0, "test")
	B.team.a[1].e.set_focus(20.0, "test")
	B.begin_turn()
	var f0: float = B.team.a[0].e.focus
	B.switch_to("a", 1)
	ok(is_equal_approx(B.team.a[0].e.focus, f0), "Pikachu's focus waits on the bench")
	ok(B.fighter("a").e.focus < 40.0, "Squirtle brings its own focus (%.0f)" % B.fighter("a").e.focus)
	B.ai_queue("b"); B.resolve()
	B.begin_turn()
	var sq: float = B.team.a[1].e.focus
	B.switch_to("a", 0)
	ok(is_equal_approx(B.fighter("a").e.focus, f0), "back out with the focus it had")
	ok(is_equal_approx(B.team.a[1].e.focus, sq), "Squirtle's stays its own")
	ok(B.team.a[0].e != B.team.a[1].e, "an energy each")

func _coin() -> void:
	# Pikachu is faster than Geodude: the coin still puts the foe first on turn 1
	for first in ["a", "b"]:
		var B := _b(11, first)
		B.begin_turn()
		for id in B.fighter("a").e.usable():
			if PkmnBattle.is_attack(id) and int(BattleEnergy.move(id).get("priority", 0)) == 0 and B.queue("a", id): break
		B.ai_queue("b")
		if B.queued("b").is_empty() or B.queued("a").is_empty(): ok(false, "both sides queued (coin %s)" % first); continue
		B.begin_resolve()
		var up := B.upcoming()
		ok(String(up[0][0]) == first, "coin %s: %s moves first on turn 1" % [first, first])
		while B.resolving(): B.step()
	var S := _b(11, "b")
	ok(S.speed("a") > S.speed("b"), "(Pikachu is the faster)")
	S.begin_turn(); S.ai_queue("b"); S.resolve()
	S.begin_turn()
	for id in S.fighter("a").e.usable():
		if PkmnBattle.is_attack(id) and int(BattleEnergy.move(id).get("priority", 0)) == 0 and S.queue("a", id): break
	S.ai_queue("b")
	if not S.queued("a").is_empty() and not S.queued("b").is_empty() and S.pending.b == false:
		S.begin_resolve()
		ok(String(S.upcoming()[0][0]) == "a", "turn 2: speed decides again")

func _slots_and_results() -> void:
	var B := _b(13)
	ok(B.slots("a") == ["ok", "ok", "ok", "empty", "empty", "empty"], "six slots: three healthy, three empty")
	B.team.a[2].hp = 0
	ok(B.slots("a")[2] == "fainted", "a fainted slot")
	var r := B.results()
	ok(r.a.size() == 3 and r.b.size() == 3, "results for every Pokémon")
	ok(r.a[2].fainted and not r.a[0].fainted, "results show who fainted")
	var six := PkmnParty.new({"a": [{"species": "pikachu", "level": 5}, {"species": "pikachu", "level": 5}, {"species": "pikachu", "level": 5}, {"species": "pikachu", "level": 5},
		{"species": "pikachu", "level": 5}, {"species": "pikachu", "level": 5}, {"species": "pikachu", "level": 5}], "b": {"species": "pidgey", "level": 5}, "kind": "trainer"})
	ok(six.team.a.size() == 6, "never more than six")

# whole 3v3 battles to the end by both AIs, through the forced switches
func _whole() -> void:
	var ends := {}
	for sd in 8:
		var B := _b(100 + sd)
		B.fighter("a").ai = "balanced"
		for f in B.team.a: f.ai = "balanced"; f.e.pick_mode = "auto"
		var switches := 0
		var guard := 0
		while not B.over and guard < 300:
			guard += 1
			B.begin_turn()
			for s in ["a", "b"]: if B.needs_pick(s): B.pick_pool(s, "")
			B.ai_queue("a"); B.ai_queue("b")
			B.resolve()
			for s in ["a", "b"]:
				if B.pending[s] and not B.over:
					B.switch_to(s, B.ai_pick(s)); switches += 1
		ok(B.over, "seed %d: the battle ends (%d turns)" % [sd, B.turn])
		ok(B.outcome in ["won", "lost"], "seed %d: won or lost (%s)" % [sd, B.outcome])
		var loser := "b" if B.outcome == "won" else "a"
		ok(B.alive(loser) == 0, "seed %d: the losing side has none left" % sd)
		ok(switches >= 2, "seed %d: forced switches happened (%d)" % [sd, switches])
		ends[B.outcome] = int(ends.get(B.outcome, 0)) + 1
		B.finish()
	print("party_test: whole battles ", ends)

func _d(seed := 1) -> PkmnDoubles:
	var B := PkmnDoubles.new({"a": [{"species": "pikachu", "level": 20}, {"species": "squirtle", "level": 18}, {"species": "bulbasaur", "level": 18}],
		"b": [{"species": "geodude", "level": 18, "ai": "balanced"}, {"species": "rattata", "level": 18}, {"species": "vulpix", "level": 16}],
		"kind": "trainer", "seed": seed})
	B.start()
	return B

func _an_attack(B: PkmnDoubles, s: String, k: int) -> String:
	for id in B.at(s, k).e.usable():
		if PkmnBattle.is_attack(id) and BattleEnergy.role_of(id) == "offense" and B.at(s, k).e.can_pay(id): return id
	return ""

func _doubles() -> void:
	var B := _d(2)
	ok(B.at("a", 0).species == "pikachu" and B.at("a", 1).species == "squirtle", "doubles: two of Ash's out")
	ok(B.at("b", 0).species == "geodude" and B.at("b", 1).species == "rattata", "doubles: two of the foe's out")
	ok(B.bench("a") == [2] and B.bench("b") == [2], "doubles: one each on the bench")
	B.begin_turn()
	ok(B.targets("a", 0, "growl").size() == 3, "doubles: a move on another aims at either foe or the ally")
	# aimed: Squirtle's attack at the second foe only (nobody else acts)
	var hit_b1 := false
	var touched_b0 := false
	for sd in 12:
		var C := _d(40 + sd)
		C.begin_turn()
		var id := _an_attack(C, "a", 1)
		if id == "": continue
		var hp0: int = C.at("b", 0).hp
		var hp1: int = C.at("b", 1).hp
		C.queue_at("a", 1, id, {"side": "b", "k": 1})
		C.resolve()
		if C.at("b", 1).hp < hp1: hit_b1 = true
		if C.at("b", 0).hp < hp0: touched_b0 = true
	ok(hit_b1, "doubles: the aimed attack hits the second foe")
	ok(not touched_b0, "doubles: and never the first")
	# all four act in a turn
	var D := _d(5)
	D.begin_turn()
	for k in 2:
		var id := _an_attack(D, "a", k)
		if id != "": D.queue_at("a", k, id, {"side": "b", "k": k})
	D.ai_queue("b")
	var evs := D.resolve()
	var movers := 0
	for e in evs: if String(e.t) in ["move", "strike"]: movers += 1
	ok(movers >= 3, "doubles: the four act in one turn (%d moves)" % movers)
	# a faint with the bench: that place waits to be filled, the other fights on
	var E := _d(7)
	E.begin_turn()
	E.at("b", 0).hp = 1
	var down := false
	for t in 6:
		for k in 2:
			var id := _an_attack(E, "a", k)
			if id != "": E.queue_at("a", k, id, {"side": "b", "k": 0})
		E.resolve()
		if E.at("b", 0).fainted(): down = true; break
		E.begin_turn()
	ok(down, "doubles: the first foe went down")
	ok(E.pending_places("b") == [0], "doubles: its place waits for the next one")
	ok(not E.over, "doubles: not over")
	var pick := E.ai_pick("b")
	ok(pick == 2, "doubles: the AI sends the one on the bench (%d)" % pick)
	E.fill("b", 0, pick)
	ok(E.at("b", 0).species == "vulpix" and E.pending_places("b").is_empty(), "doubles: Vulpix fills the place")
	# whole doubles battles
	var ends := {}
	for sd in 6:
		var W := _d(200 + sd)
		for f in W.team.a: f.ai = "balanced"; f.e.pick_mode = "auto"
		var guard := 0
		while not W.over and guard < 300:
			guard += 1
			W.begin_turn()
			for s in ["a", "b"]:
				for f in W.alive_out(s): if f.e.needs_pick(): f.e.pick_pool("")
			W.ai_queue("a"); W.ai_queue("b")
			W.resolve()
			for s in ["a", "b"]:
				for k in W.pending_places(s):
					if not W.over and W.ai_pick(s) >= 0: W.fill(s, k, W.ai_pick(s))
		ok(W.over and W.outcome in ["won", "lost"], "doubles seed %d: ends won or lost (%s, %d turns)" % [sd, W.outcome, W.turn])
		var loser := "b" if W.outcome == "won" else "a"
		ok(W.alive(loser) == 0, "doubles seed %d: the loser has none left" % sd)
		ends[W.outcome] = int(ends.get(W.outcome, 0)) + 1
	print("party_test: whole doubles battles ", ends)
