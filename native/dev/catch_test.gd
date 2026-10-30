extends Node
# Dev test for Poké Balls, headless: the capture rules against Red and Blue's
# (battle/catch_rules.gd: the Master Ball, a full-HP Mewtwo, the status bonus,
# the Great Ball beating the Ultra Ball at full HP, the shakes), the dice seeded
# and the sampled rate matching the exact one; the battle engine's throw (a
# catch ends a wild battle, a trainer blocks it); the store (battle/pkmn_store.gd:
# the bag, a full party sending a catch to the PC, a full PC, the save round-trip).
#   godot --headless --path native res://dev/catch_test.tscn

var fails := 0
var checks := 0
const TMP := "user://catch_test.save"

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c:
		fails += 1
		printerr("FAIL: " + what)

func _ready() -> void:
	_run.call_deferred()

func _run() -> void:
	BattleConfig.reset()
	_rates()
	_formula()
	_wobbles()
	_dice()
	_engine()
	_store()
	_ui()
	print("catch_test: %d checks, %d failures" % [checks, fails])
	print("CATCH TEST GREEN" if fails == 0 else "CATCH TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

func _o(sp: String, hp: int, max_hp: int, ball := "poke_ball", status := "") -> Dictionary:
	return {"species": sp, "hp": hp, "max_hp": max_hp, "ball": ball, "status": status}

func _rates() -> void:
	var known := {"mewtwo": 3, "pidgey": 255, "caterpie": 255, "chansey": 30, "snorlax": 25, "bulbasaur": 45, "pikachu": 190, "articuno": 3, "mew": 45, "magikarp": 255}
	for sp in known: ok(CatchRules.catch_rate(sp) == int(known[sp]), "%s's catch rate is %d (%d)" % [sp, known[sp], CatchRules.catch_rate(sp)])
	var sp_all: Dictionary = BattleEnergy.data().get("species", {})
	var n := 0
	for id in sp_all:
		if sp_all[id].has("dex") and sp_all[id].has("catch_rate"): n += 1
	ok(n == 151, "all 151 carry a catch rate (%d)" % n)
	ok(CatchRules.catch_rate("no_such_thing") == 45, "an unknown species has the default rate")

func _formula() -> void:
	# the Master Ball always catches, whatever the HP
	ok(CatchRules.chance(_o("mewtwo", 200, 200, "master_ball")) == 1.0, "the Master Ball always catches")
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var all := true
	for i in 200: all = all and CatchRules.throw(_o("mewtwo", 200, 200, "master_ball"), rng).caught
	ok(all, "200 Master Balls, 200 catches")
	# a full-HP Mewtwo, a Poké Ball: (3 + 1) / 256 x (85 + 1) / 256
	var p := CatchRules.chance(_o("mewtwo", 200, 200))
	ok(absf(p - 4.0 / 256.0 * 86.0 / 256.0) < 1e-6, "full-HP Mewtwo, Poké Ball: %.5f (about 0.5%%)" % p)
	ok(p < 0.01, "a full-HP Mewtwo is very hard to catch")
	ok(CatchRules.w_value(_o("mewtwo", 200, 200)) == 85, "W at full HP with a Poké Ball is 85")
	# at 1 HP W is over 255: only Rand1 against the catch rate
	ok(absf(CatchRules.chance(_o("mewtwo", 1, 200)) - 4.0 / 256.0) < 1e-6, "1-HP Mewtwo, Poké Ball: 4 / 256")
	ok(absf(CatchRules.chance(_o("mewtwo", 1, 200, "ultra_ball")) - 4.0 / 151.0) < 1e-6, "1-HP Mewtwo, Ultra Ball: 4 / 151")
	# full-HP Pidgey: the Great Ball (hp_div 8) beats the Ultra Ball (12), the Gen 1 quirk
	var pg := CatchRules.chance(_o("pidgey", 32, 32, "great_ball"))
	var pu := CatchRules.chance(_o("pidgey", 32, 32, "ultra_ball"))
	var pp := CatchRules.chance(_o("pidgey", 32, 32))
	ok(absf(pp - 86.0 / 256.0) < 1e-6, "full-HP Pidgey, Poké Ball: 86 / 256 (%.3f)" % pp)
	ok(absf(pg - 128.0 / 256.0) < 1e-6, "full-HP Pidgey, Great Ball: 128 / 256 (%.3f)" % pg)
	ok(absf(pu - pp) < 1e-6 and pg > pu, "the Great Ball beats the Ultra Ball at full HP (%.3f > %.3f)" % [pg, pu])
	# lower HP helps
	ok(CatchRules.chance(_o("bulbasaur", 5, 40)) > CatchRules.chance(_o("bulbasaur", 40, 40)), "lower HP, a better chance")
	# status: sleep and freeze 25, the others 12, nothing else
	var base := CatchRules.chance(_o("mewtwo", 200, 200))
	var slp := CatchRules.chance(_o("mewtwo", 200, 200, "poke_ball", "sleep"))
	var frz := CatchRules.chance(_o("mewtwo", 200, 200, "poke_ball", "freeze"))
	var par := CatchRules.chance(_o("mewtwo", 200, 200, "poke_ball", "para"))
	var brn := CatchRules.chance(_o("mewtwo", 200, 200, "poke_ball", "burn"))
	var psn := CatchRules.chance(_o("mewtwo", 200, 200, "poke_ball", "poison"))
	ok(absf(slp - (25.0 / 256.0 + 4.0 / 256.0 * 86.0 / 256.0)) < 1e-6, "asleep: Rand1 under 25 catches (%.4f)" % slp)
	ok(slp == frz, "freeze counts as sleep")
	ok(par == brn and brn == psn, "paralysis, burn and poison count the same")
	ok(slp > par and par > base, "sleep > paralysis > none (%.4f > %.4f > %.4f)" % [slp, par, base])
	ok(absf(par - (12.0 / 256.0 + 4.0 / 256.0 * 86.0 / 256.0)) < 1e-6, "paralysed: Rand1 under 12 catches")

func _wobbles() -> void:
	# Z = X * Y / 255 + Status2: < 10: 0, < 30: 1, < 70: 2, else 3
	ok(CatchRules.wobbles(_o("mewtwo", 200, 200)) == 0, "full-HP Mewtwo breaks out at once (Z 0)")
	ok(CatchRules.wobbles(_o("mewtwo", 200, 200, "poke_ball", "sleep")) == 1, "asleep: +10, one shake")
	ok(CatchRules.wobbles(_o("mewtwo", 200, 200, "poke_ball", "para")) == 0, "paralysed: +5, still none")
	ok(CatchRules.wobbles(_o("pidgey", 32, 32)) == 2, "full-HP Pidgey, Poké Ball: Z 33, two shakes")
	ok(CatchRules.wobbles(_o("pidgey", 32, 32, "ultra_ball")) == 2, "full-HP Pidgey, Ultra Ball: Z 56, two shakes")
	ok(CatchRules.wobbles(_o("bulbasaur", 40, 40)) == 0, "full-HP Bulbasaur: Z 5, none")
	ok(CatchRules.wobbles(_o("bulbasaur", 20, 40)) == 1, "half-HP Bulbasaur: W 170, Z 11, one shake")
	ok(CatchRules.wobbles(_o("pidgey", 8, 30, "great_ball")) == 3, "a weak Pidgey in a Great Ball: three shakes")
	ok(CatchRules.break_line(3, "X") == "Shoot! It was so close too!", "three shakes: the games' line")
	ok(CatchRules.break_line(1, "X") == "Darn! The Pokémon broke free!", "one shake: the games' line")
	for k in ["blocked", "caught", "shake_0", "shake_2", "box", "party", "banner"]:
		ok(not CatchRules.line(k).contains("—"), "no em dash in the %s line" % k)

func _dice() -> void:
	# seeded: the same seed, the same throws
	var a := RandomNumberGenerator.new(); a.seed = 42
	var b := RandomNumberGenerator.new(); b.seed = 42
	var same := true
	for i in 300:
		var ra := CatchRules.throw(_o("pidgey", 20, 30), a)
		var rb := CatchRules.throw(_o("pidgey", 20, 30), b)
		same = same and ra.caught == rb.caught and ra.wobbles == rb.wobbles and ra.rand1 == rb.rand1
	ok(same, "a seeded throw is deterministic")
	# the sampled rate matches the exact chance
	for case in [_o("pidgey", 32, 32), _o("pidgey", 32, 32, "great_ball"), _o("bulbasaur", 12, 40, "ultra_ball", "sleep")]:
		var r := RandomNumberGenerator.new(); r.seed = 99
		var hit := 0
		var N := 20000
		var bad_shakes := false
		for i in N:
			var t := CatchRules.throw(case, r)
			if t.caught: hit += 1
			elif t.wobbles != CatchRules.wobbles(case): bad_shakes = true
		var want := CatchRules.chance(case)
		ok(absf(float(hit) / N - want) < 0.015, "%s %s: sampled %.3f against %.3f" % [case.species, case.ball, float(hit) / N, want])
		ok(not bad_shakes, "%s %s: a failure's shakes are the formula's" % [case.species, case.ball])

func _engine() -> void:
	# a wild battle: a Master Ball catches and ends it
	var B := PkmnBattle.new({"a": {"species": "pikachu", "level": 12}, "b": {"species": "pidgey", "level": 5, "ai": "wild"}, "kind": "wild", "seed": 3})
	B.start(); B.begin_turn()
	var ev := B.throw_ball("a", "master_ball")
	ok(ev.t == "ball" and ev.caught and ev.wobbles == 3, "the Master Ball: caught, three shakes")
	ok(B.over and B.outcome == "caught", "a catch ends the battle (caught)")
	ok(String(ev.text).contains("PIDGEY was caught"), "the line: %s" % ev.text)
	B.finish()
	# a miss keeps it going; the foe still has its turn
	var W := PkmnBattle.new({"a": {"species": "pikachu", "level": 12}, "b": {"species": "mewtwo", "level": 70, "ai": "wild"}, "kind": "wild", "seed": 4})
	W.start(); W.begin_turn()
	var e2 := W.throw_ball("a", "poke_ball", {"caught": false, "wobbles": 2})
	ok(not e2.caught and e2.wobbles == 2 and not W.over, "a forced break-out: two shakes, the battle goes on")
	ok(String(e2.text) == "Aww! It appeared to be caught!", "two shakes: the games' line")
	W.ai_queue("b")
	ok(not W.resolve().is_empty(), "the foe's turn still plays after the throw")
	# the status counts: an asleep foe's throw passes "sleep"
	var S := PkmnBattle.new({"a": {"species": "pikachu", "level": 12}, "b": {"species": "mewtwo", "level": 70, "ai": "wild"}, "kind": "wild", "seed": 5})
	S.start()
	S.fighter("b").status = "sleep"
	var hits := 0
	for i in 400:
		S.over = false; S.outcome = ""
		if S.throw_ball("a", "poke_ball").caught: hits += 1
	ok(hits > 20 and hits < 70, "an asleep Mewtwo: about 10%% of Poké Balls catch (%d / 400)" % hits)
	# a trainer's Pokémon: blocked, with the games' line
	var T := PkmnBattle.new({"a": {"species": "pikachu", "level": 12}, "b": {"species": "geodude", "level": 12, "ai": "balanced"}, "kind": "trainer", "seed": 3})
	T.start(); T.begin_turn()
	var e3 := T.throw_ball("a", "master_ball")
	ok(e3.t == "ball_blocked" and not T.over, "a trainer blocks even a Master Ball")
	ok(String(e3.text) == "The trainer blocked the ball! Don't be a thief!", "the trainer's line")
	ok(not String(e3.text).contains("—"), "no em dash in it")
	# the party layer's wild battle
	var P := PkmnParty.new({"a": [{"species": "pikachu", "level": 20}, {"species": "squirtle", "level": 18}], "b": [{"species": "rattata", "level": 5, "ai": "wild"}], "kind": "wild", "seed": 2})
	P.start(); P.begin_turn()
	ok(P.throw_ball("a", "master_ball").caught and P.outcome == "caught", "with a party: caught too")

func _store() -> void:
	if FileAccess.file_exists(TMP): DirAccess.remove_absolute(ProjectSettings.globalize_path(TMP))
	var s := PkmnStore.new(TMP)
	ok(s.balls().is_empty() and not s.has_balls(), "a new store: no balls")
	s.stock_once()
	var sb: Dictionary = BattleConfig.sect("catch").get("start_bag", {})
	ok(s.count("poke_ball") == int(sb.get("poke_ball", 0)), "the start bag: %d Poké Balls" % s.count("poke_ball"))
	s.stock_once()
	ok(s.count("poke_ball") == int(sb.get("poke_ball", 0)), "stocked once only")
	ok(s.use_ball("poke_ball") and s.count("poke_ball") == int(sb.get("poke_ball", 0)) - 1, "a ball spent")
	s.bag.erase("master_ball")
	ok(not s.use_ball("master_ball"), "none left: can't throw")
	ok(s.balls().all(func(b): return int(b.n) > 0), "the list shows only what it holds")
	# the party, then the PC
	s.ensure_party([{"species": "pikachu", "level": 9}])
	ok(s.party.size() == 1, "an empty party takes the battle's team")
	s.ensure_party([{"species": "bulbasaur", "level": 9}])
	ok(s.party.size() == 1 and s.party[0].species == "pikachu", "a party isn't overwritten")
	for i in 5: ok(s.add_caught({"species": "rattata", "level": 3 + i, "ball": "poke_ball"}) == "party", "catch %d joins the party" % (i + 2))
	ok(s.party.size() == 6, "a full party of six")
	ok(s.add_caught({"species": "pidgey", "level": 4, "ball": "great_ball"}) == "box", "the seventh goes to the PC")
	ok(s.box.size() == 1 and s.box[0].species == "pidgey" and s.last_box() == 1, "in box 1")
	ok(s.is_caught("pidgey") and s.is_seen("pidgey") and s.is_caught("rattata"), "the dex marks them caught")
	s.mark_seen("mewtwo")
	ok(s.is_seen("mewtwo") and not s.is_caught("mewtwo"), "seen, not caught")
	# the save round-trip
	var t := PkmnStore.new(TMP)
	ok(t.party.size() == 6 and t.box.size() == 1, "loaded: the party and the PC")
	ok(t.party[1].species == "rattata" and int(t.party[1].level) == 3, "loaded: the party in order")
	ok(String(t.box[0].ball) == "great_ball", "loaded: the ball it was caught in")
	ok(t.count("poke_ball") == s.count("poke_ball") and t.stocked, "loaded: the bag, stocked")
	ok(t.is_caught("pidgey") and t.is_seen("mewtwo") and not t.is_caught("mewtwo"), "loaded: the dex")
	# a full PC: no more room, can't take one
	var f := PkmnStore.new("")
	for i in 6: f.party.append({"species": "rattata", "level": 2})
	for i in f.box_cap(): f.box.append({"species": "rattata", "level": 2})
	ok(not f.can_take(), "a full PC can't take one")
	ok(f.add_caught({"species": "pidgey", "level": 3}) == "", "nor does it")
	# the arena's store is apart from the save, its balls unlimited
	PkmnStore.forget()
	var ar := PkmnStore.arena()
	ok(ar != PkmnStore.main() and ar.path != PkmnStore.main().path, "the arena keeps its own store")
	ok(ar.unlimited and ar.count("ultra_ball") == -1 and ar.use_ball("master_ball"), "unlimited balls in the arena")
	PkmnStore.forget()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(TMP))

func _ui() -> void:
	var ui := BattleUI.new()
	ui.set_balls([])
	ok(not ui.top_items.any(func(it): return String(it.id) == "ball"), "the prologue's menu: no ball without balls")
	ui.set_balls([{"id": "poke_ball", "name": "Poké Ball", "n": 3}])
	ok(ui.top_items.any(func(it): return String(it.id) == "ball"), "a ball in the bag: POKé BALL on the menu")
	ok(String(ui.subs.ball[0].id) == "ball:poke_ball", "its list: the bag's balls")
	ok(BattleUI.ITEMS.size() == 3, "the menu's own list is untouched")
	ui.free()
	var hud := PkmnHud.new()
	ok(PkmnHud.MENU.size() == 4 and PkmnHud.BALL == 4, "the HUD: four cells and BALL over them")
	hud.free()
