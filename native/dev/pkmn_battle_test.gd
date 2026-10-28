extends Node
# Dev test for the Pokemon-vs-Pokemon engine (battle/pkmn_battle.gd,
# battle/pkmn_ai.gd), headless: the turn flow and several actions a turn,
# speed interleaving (and a swapped order), damage, reactions (Dodge, Protect,
# Detect, Counter, Mirror Coat) with face-down locks and expiry, two-phase
# moves and the counter table (Dig, Fly, Dive, Earthquake, Ground Pound,
# Swift, Feint, Mind Reader, Foresight, Roar), disruption, flinch, confusion,
# sleep, Locked In, persistence across battles and fainting, the gym warm-up,
# the AI personalities, whole battles to the end, and EnergyHook's old calls.
#   godot --headless --path native res://dev/pkmn_battle_test.tscn

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
	BattleEnergy.reload()
	# deterministic numbers for the rule checks (no crits, no damage roll)
	BattleConfig.override({"damage": {"crit_base": 0.0, "crit_per_stage": 0.0, "random_min": 1.0}})
	_flow()
	_order()
	_damage()
	_reactions()
	_two_phase()
	_counters()
	_disruption()
	_locked_in()
	_persistence()
	BattleConfig.reset()
	_ai()
	_whole()
	await _hook()
	BattleConfig.reset()
	print("pkmn_battle_test: %d checks, %d failures" % [checks, fails])
	print("PKMN BATTLE TEST GREEN" if fails == 0 else "PKMN BATTLE TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

# a battle with set focus and moves; a and b default to the player and a trainer
func _b(a: Dictionary, b: Dictionary, kind := "trainer", seed := 1) -> PkmnBattle:
	var B := PkmnBattle.new({"a": a, "b": b, "kind": kind, "seed": seed})
	B.start()
	return B

func _has(evs: Array, t: String, side := "") -> bool:
	return evs.any(func(e): return e.t == t and (side == "" or e.get("side", "") == side))

func _find(evs: Array, t: String, side := "") -> Dictionary:
	for e in evs:
		if e.t == t and (side == "" or e.get("side", "") == side): return e
	return {}

# ---- the turn: focus, chips, several actions, spent chips back ----
func _flow() -> void:
	var B := _b({"species": "pikachu", "level": 12, "focus": 50.0, "known": ["thunder_shock", "quick_attack", "growl", "tail_whip"]},
		{"species": "pidgey", "level": 6, "ai": "wild", "state": "hidden"}, "wild")
	var a := B.fighter("a")
	var b := B.fighter("b")
	ok(a.max_hp > 20 and b.max_hp > 15 and a.stats.spe > b.stats.spe, "stats: Pikachu %d HP, Pidgey %d HP, Pikachu faster" % [a.max_hp, b.max_hp])
	ok(b.e.focus == 20.0 and a.e.pick_mode == "player" and b.e.pick_mode == "auto", "the wild one starts at 20 (hidden); the player picks pools")
	var ev := B.begin_turn()
	ok(_has(ev, "turn") and _has(ev, "gain", "a") and _has(ev, "gain", "b"), "begin_turn: focus for both")
	ok(a.e.total() == 3 and b.e.total() == 1, "chips by focus (a %d, b %d)" % [a.e.total(), b.e.total()])
	ok(B.queue("a", "quick_attack") and B.queue("a", "growl") and B.queue("a", "thunder_shock"), "three cheap moves queued")
	ok(not B.queue("a", "tail_whip"), "no chips left for a fourth")
	ok(B.unqueue("a") == "thunder_shock" and a.e.available() == 1, "take one back: refunded")
	B.queue("a", "thunder_shock")
	B.ai_queue("b")
	var r := B.resolve()
	var moves := r.filter(func(e): return e.t == "move")
	ok(moves.size() >= 3, "every queued action played (%d)" % moves.size())
	ok(a.e.chip_list().filter(func(c): return c.state == "spent").size() == 3, "spent chips dim")
	B.begin_turn()
	ok(a.e.available() == a.e.total(), "next turn: back in full colour")
	ok(B.queue("a", "quick_attack") and not B.can_queue("a", "fly"), "only its usable moves")

# ---- the order: interleaved by speed, one clean swappable function ----
func _order() -> void:
	var B := _b({"species": "pikachu", "level": 12, "focus": 60.0, "known": ["scratch", "quick_attack", "tail_whip"]},
		{"species": "sandshrew", "level": 12, "focus": 60.0, "known": ["scratch", "defense_curl", "sand_attack"], "ai": "balanced"})
	B.begin_turn()
	B.queue("a", "tail_whip"); B.queue("a", "scratch"); B.queue("a", "quick_attack")
	B.queue("b", "scratch"); B.queue("b", "sand_attack"); B.queue("b", "defense_curl")
	var o := PkmnBattle.speed_interleave(B, {"a": B.fighter("a").queue, "b": B.fighter("b").queue})
	var seq := o.map(func(p): return "%s:%s" % [p[0], p[1].move])
	ok(seq[0] == "a:quick_attack", "priority first (%s)" % [seq])
	ok(seq.slice(1) == ["b:scratch", "a:tail_whip", "b:sand_attack", "a:scratch", "b:defense_curl"], "then interleaved, not all at once (%s)" % [seq])
	var slow := _b({"species": "sandshrew", "level": 12, "focus": 60.0, "known": ["scratch", "defense_curl"]},
		{"species": "diglett", "level": 12, "focus": 60.0, "known": ["scratch", "growl"], "ai": "balanced"})
	slow.begin_turn()
	slow.queue("a", "scratch"); slow.queue("a", "defense_curl")
	slow.queue("b", "scratch"); slow.queue("b", "growl")
	var o2 := PkmnBattle.speed_interleave(slow, {"a": slow.fighter("a").queue, "b": slow.fighter("b").queue})
	ok(o2[0][0] == "b" and o2[1][0] == "a" and o2[2][0] == "b", "the faster side (Diglett) starts the interleave")
	# swap the function: all of a's first
	B.order_fn = func(_bt, q): return q.a.map(func(x): return ["a", x]) + q.b.map(func(x): return ["b", x])
	var r := B.resolve()
	var who := r.filter(func(e): return e.t == "move").map(func(e): return e.side)
	ok(who.slice(0, 3) == ["a", "a", "a"], "a swapped order_fn changes the order (%s)" % [who])

# ---- damage ----
func _damage() -> void:
	var B := _b({"species": "pikachu", "level": 12, "focus": 60.0, "known": ["thunder_shock", "scratch", "quick_attack"]},
		{"species": "pidgey", "level": 10, "focus": 0.0, "known": ["tackle"], "ai": "balanced"})
	B.begin_turn()
	B.queue("a", "thunder_shock")
	var r := B.resolve()
	var h := _find(r, "hit", "b")
	ok(not h.is_empty() and h.dmg > 0 and h.eff == 2.0, "Thunder Shock on Pidgey: super effective (%s)" % [h])
	var B2 := _b({"species": "pikachu", "level": 12, "focus": 60.0, "known": ["thunder_shock"]},
		{"species": "sandshrew", "level": 10, "focus": 0.0, "known": ["scratch"], "ai": "balanced"})
	B2.begin_turn(); B2.queue("a", "thunder_shock")
	ok(_has(B2.resolve(), "no_effect"), "Electric on Ground: no effect")
	var hp0 := B.fighter("b").hp
	var B3 := _b({"species": "pikachu", "level": 30, "focus": 100.0, "known": ["thunderbolt", "thunder_shock"]},
		{"species": "pidgey", "level": 10, "focus": 0.0, "known": ["tackle"], "ai": "balanced"})
	B3.begin_turn(); B3.queue("a", "thunderbolt")
	var d3: int = _find(B3.resolve(), "hit", "b").get("dmg", 0)
	var B4 := _b({"species": "pikachu", "level": 30, "focus": 100.0, "known": ["thunderbolt", "thunder_shock"]},
		{"species": "pidgey", "level": 10, "focus": 0.0, "known": ["tackle"], "ai": "balanced"})
	B4.begin_turn(); B4.queue("a", "thunder_shock")
	var d4: int = _find(B4.resolve(), "hit", "b").get("dmg", 0)
	ok(d3 > d4 * 2.5, "a 3-chip move hits more than three times a 1-chip one (%d vs %d)" % [d3, d4])
	ok(hp0 < B.fighter("b").max_hp, "HP went down")

# ---- reactions: locks, face down, triggers, wrong guesses, expiry ----
func _reactions() -> void:
	# Dodge: works on anything
	var B := _b({"species": "pikachu", "level": 12, "focus": 60.0, "known": ["dodge", "thunder_shock"]},
		{"species": "sandshrew", "level": 12, "focus": 60.0, "known": ["scratch", "swift", "mind_reader", "sand_attack"], "ai": "balanced"})
	B.begin_turn()
	B.queue("a", "dodge")
	B.queue("b", "scratch")
	var r := B.resolve()
	var lk := _find(r, "lock", "a")
	ok(not lk.is_empty() and lk.face_down, "Dodge set: a face-down lock for the opponent (%s)" % [lk.get("text", "")])
	ok(lk.get("text_owner", "").contains("DODGE") and not lk.text.contains("DODGE"), "only the owner's line names it")
	ok(_has(r, "dodged", "a") and B.fighter("a").hp == B.fighter("a").max_hp, "the scratch is dodged")
	ok(B.fighter("a").e.locks.is_empty(), "the lock is used up")
	# Swift ignores a dodge
	B.begin_turn()
	B.queue("a", "dodge"); B.queue("b", "swift")
	r = B.resolve()
	ok(_has(r, "hit", "a") and not _has(r, "dodged"), "Swift can't be dodged")
	ok(B.fighter("a").e.locks.size() == 1, "the dodge is still set after Swift")
	# Mind Reader cancels the dodge for the next attack
	B.begin_turn()
	B.queue("b", "mind_reader"); B.queue("b", "scratch")
	r = B.resolve()
	ok(_has(r, "wasted", "a") and _has(r, "hit", "a"), "Mind Reader: the dodge is read and the scratch lands")
	# Counter: physical only, double back; a wrong guess wastes it
	var C := _b({"species": "charmander", "level": 14, "focus": 60.0, "known": ["counter", "ember"]},
		{"species": "sandshrew", "level": 12, "focus": 60.0, "known": ["scratch", "swift"], "ai": "balanced"})
	C.begin_turn()
	C.queue("a", "counter"); C.queue("b", "scratch")
	r = C.resolve()
	var ch := _find(r, "hit", "a")
	var cb := _find(r, "counter", "b")
	ok(not cb.is_empty() and cb.dmg == ch.dmg * 2, "Counter hits a physical attack back double (%s / %s)" % [ch.get("dmg"), cb.get("dmg")])
	C.begin_turn()
	C.queue("a", "counter"); C.queue("b", "swift")
	r = C.resolve()
	ok(_has(r, "wasted", "a") and not _has(r, "counter"), "Counter on a special attack: a wrong guess, wasted")
	# Mirror Coat: special only
	var M := _b({"species": "squirtle", "level": 22, "focus": 60.0, "known": ["mirror_coat", "bubble"]},
		{"species": "pikachu", "level": 12, "focus": 60.0, "known": ["thunder_shock"], "ai": "balanced"})
	M.begin_turn(); M.queue("a", "mirror_coat"); M.queue("b", "thunder_shock")
	r = M.resolve()
	ok(_has(r, "counter", "b"), "Mirror Coat sends a special hit back")
	# Protect, Detect and Feint
	var P := _b({"species": "squirtle", "level": 20, "focus": 60.0, "known": ["protect", "bubble"]},
		{"species": "pikachu", "level": 14, "focus": 80.0, "known": ["quick_attack", "thunder_shock", "feint"], "ai": "balanced"})
	P.begin_turn(); P.queue("a", "protect"); P.queue("b", "thunder_shock"); P.queue("b", "quick_attack")
	r = P.resolve()
	ok(r.filter(func(e): return e.t == "protected").size() == 2 and P.fighter("a").hp == P.fighter("a").max_hp, "Protect blocks every attack for the turn")
	P.begin_turn(); P.queue("a", "protect"); P.queue("b", "feint")
	r = P.resolve()
	ok(_has(r, "broken", "a") and _has(r, "hit", "a"), "Feint breaks Protect and hits")
	var Dt := _b({"species": "bulbasaur", "level": 10, "focus": 40.0, "known": ["detect", "vine_whip"]},
		{"species": "pikachu", "level": 14, "focus": 80.0, "known": ["feint", "thunder_shock"], "ai": "balanced"})
	Dt.begin_turn(); Dt.queue("a", "detect"); Dt.queue("b", "feint")
	r = Dt.resolve()
	ok(_has(r, "broken", "a"), "Feint breaks Detect")
	# a lock nobody triggers: released at the end of the following turn
	var X := _b({"species": "pikachu", "level": 12, "focus": 60.0, "known": ["dodge", "growl"]},
		{"species": "sandshrew", "level": 12, "focus": 0.0, "known": ["scratch"], "ai": "balanced"})
	X.begin_turn(); X.queue("a", "dodge")
	X.resolve()
	ok(X.fighter("a").e.locks.size() == 1, "set, nothing attacked: still locked")
	X.begin_turn()
	ok(X.fighter("a").e.locked_count() == 1 and X.fighter("a").e.available() == X.fighter("a").e.total() - 1, "the locked chip counts against the total")
	r = X.resolve()
	ok(_has(r, "expired", "a") and X.fighter("a").e.locks.is_empty(), "released at the end of the following turn")
	ok(not _find(r, "expired", "a").text.contains("DODGE"), "the opponent's line doesn't name it")

# ---- two-phase moves: commit, untargetable, strike ----
func _two_phase() -> void:
	var B := _b({"species": "sandshrew", "level": 12, "focus": 60.0, "known": ["dig", "scratch", "dodge"]},
		{"species": "pikachu", "level": 12, "focus": 60.0, "known": ["quick_attack", "thunder_shock", "tail_whip"], "ai": "balanced"})
	var a := B.fighter("a")
	ok(float(BattleEnergy.move("dig").power) / BattleEnergy.cost_of("dig").size() > float(BattleEnergy.move("slash").power) / BattleEnergy.cost_of("slash").size(), "two-phase moves pay more per chip")
	B.begin_turn()
	B.queue("a", "dodge")
	ok(B.queue("a", "dig"), "Dig queued (paid on the commit turn)")
	ok(not B.queue("a", "scratch"), "nothing after a commitment")
	var spent_before := a.e.chip_list().filter(func(c): return c.state == "spent").size()
	var r := B.resolve()
	ok(_has(r, "commit", "a") and a.e.semi() == "underground", "Dig: underground")
	ok(_has(r, "wasted", "a"), "the dodge set before digging is wasted")
	ok(spent_before == 3, "Dig's chips (and the dodge's) paid on turn one")
	B.begin_turn()
	ok(B.fighter("a").queue.size() == 1 and B.fighter("a").queue[0].free, "turn two: the strike is queued, free")
	var free_chips := a.e.available()
	ok(free_chips == a.e.total(), "the strike costs nothing")
	B.queue("b", "quick_attack")
	r = B.resolve()
	ok(_has(r, "untargetable", "a") or _has(r, "no_effect", "a") or _find(r, "move", "b").is_empty() == false, "Quick Attack first: it can't reach underground")
	ok(_has(r, "untargetable", "a"), "untargetable while committed")
	ok(_has(r, "strike", "a") and _has(r, "hit", "b"), "Dig strikes on turn two")
	ok(a.e.semi() == "", "back above ground")

# ---- the counter table ----
func _counters() -> void:
	var dig_vs := func(mid: String, lv := 33) -> Array:
		var B := _b({"species": "diglett", "level": 14, "focus": 60.0, "known": ["dig", "scratch"]},
			{"species": "sandshrew", "level": lv, "focus": 100.0, "known": [mid, "swift"] if mid != "swift" else ["swift"], "ai": "balanced"}, "trainer", 1)
		# Diglett is faster: it goes under first, then the slower one's move comes
		B.begin_turn(); B.queue("a", "dig"); B.queue("b", mid)
		return [B, B.resolve()]
	# Earthquake: double on a digger
	var eq: Array = dig_vs.call("earthquake")
	var he := _find(eq[1], "hit", "a")
	ok(not he.is_empty() and he.mult == 2.0, "Earthquake hits a digger for double (%s)" % [he])
	var mg: Array = dig_vs.call("magnitude")
	ok(_find(mg[1], "hit", "a").get("mult", 0.0) == 2.0, "Magnitude too")
	var sw: Array = dig_vs.call("swift")
	ok(_has(sw[1], "hit", "a") and _find(sw[1], "hit", "a").mult == 1.0, "Swift reaches underground")
	var sc: Array = dig_vs.call("scratch")
	ok(_has(sc[1], "untargetable", "a"), "Scratch doesn't")
	# Ground Pound: double, and a chance to pull it out
	BattleConfig.override({"counters": {"rows": BattleConfig.sect("counters").rows.map(func(r):
		var x: Dictionary = r.duplicate()
		if x.move == "ground_pound": x.pull_out = 1.0
		return x)}})
	var gp: Array = dig_vs.call("ground_pound", 6)
	ok(_find(gp[1], "hit", "a").get("mult", 0.0) == 2.0, "Ground Pound: double on a digger")
	ok(_has(gp[1], "pulled_out", "a"), "Ground Pound pulled it out")
	var Bgp: PkmnBattle = gp[0]
	Bgp.begin_turn()
	ok(Bgp.fighter("a").e.semi() == "" and Bgp.fighter("a").queue.is_empty(), "no strike next turn")
	BattleConfig.reset()
	BattleConfig.override({"damage": {"crit_base": 0.0, "crit_per_stage": 0.0, "random_min": 1.0}})
	# Roar: forces it out of the dig, and shakes its focus
	var ro: Array = dig_vs.call("roar")
	var Bro: PkmnBattle = ro[0]
	ok(_has(ro[1], "forced_out", "a") and _has(ro[1], "disrupt", "a"), "Roar drags it out and disrupts its focus")
	ok(Bro.fighter("a").e.semi() == "", "no longer underground")
	# Fly: Gust double, Thunder reaches, Tackle doesn't
	var fly_vs := func(mid: String, attacker: String, known: Array) -> Array:
		var B := _b({"species": "pidgey", "level": 14, "focus": 60.0, "known": ["fly", "tackle"]},
			{"species": attacker, "level": 30, "focus": 100.0, "known": known, "ai": "balanced"})
		B.begin_turn(); B.queue("a", "fly")
		B.resolve()
		B.begin_turn(); B.queue("b", mid)
		return B.resolve()
	ok(_find(fly_vs.call("gust", "pidgey", ["gust", "tackle"]), "hit", "a").get("mult", 0.0) == 2.0, "Gust hits a flyer for double")
	ok(_has(fly_vs.call("thunder", "pikachu", ["thunder", "quick_attack"]), "hit", "a"), "Thunder reaches the sky")
	ok(_has(fly_vs.call("tackle", "pidgey", ["gust", "tackle"]), "untargetable", "a"), "Tackle doesn't")
	ok(_find(fly_vs.call("twister", "pidgey", ["twister", "tackle"]), "hit", "a").get("mult", 0.0) == 2.0, "Twister: double on a flyer")
	# Dive: Surf
	var Dv := _b({"species": "squirtle", "level": 28, "focus": 60.0, "known": ["dive", "tackle"]},
		{"species": "squirtle", "level": 30, "focus": 100.0, "known": ["surf", "tackle", "whirlpool"], "ai": "balanced"})
	Dv.begin_turn(); Dv.queue("a", "dive"); Dv.resolve()
	Dv.begin_turn(); Dv.queue("b", "surf")
	var rd := Dv.resolve()
	ok(_find(rd, "hit", "a").get("mult", 0.0) == 2.0, "Surf hits a diver for double")
	# Foresight: Normal hits a Ghost
	var Fg := _b({"species": "pikachu", "level": 14, "focus": 60.0, "known": ["quick_attack", "foresight", "headbutt"]},
		{"species": "gastly", "level": 14, "focus": 0.0, "known": ["lick"], "ai": "balanced"})
	Fg.begin_turn(); Fg.queue("a", "quick_attack")
	ok(_has(Fg.resolve(), "no_effect", "b"), "Quick Attack can't touch a Ghost")
	Fg.begin_turn(); Fg.queue("a", "foresight"); Fg.queue("a", "headbutt")
	var rf := Fg.resolve()
	ok(_has(rf, "hit", "b"), "after Foresight it can")
	# the table is data: a new row works with no code
	BattleConfig.override({"counters": {"rows": BattleConfig.sect("counters").rows + [{"move": "scratch", "vs": "underground", "hits": true, "mult": 3.0}]}})
	var sc2: Array = dig_vs.call("scratch")
	ok(_find(sc2[1], "hit", "a").get("mult", 0.0) == 3.0, "a row added to the table takes effect (data-driven)")
	BattleConfig.reset()
	BattleConfig.override({"damage": {"crit_base": 0.0, "crit_per_stage": 0.0, "random_min": 1.0}})

# ---- disruption, flinch, confusion, sleep ----
func _disruption() -> void:
	var B := _b({"species": "pikachu", "level": 12, "focus": 70.0, "known": ["thunder_shock", "quick_attack", "growl"]},
		{"species": "charmander", "level": 12, "focus": 60.0, "known": ["growl", "leer", "scratch"], "ai": "balanced"})
	var a := B.fighter("a")
	B.begin_turn()
	var f0 := a.e.focus
	B.queue("b", "growl")
	var r := B.resolve()
	ok(_has(r, "disrupt", "a") and a.e.focus == f0 - 10.0, "Growl shakes its focus a step (%s -> %s)" % [f0, a.e.focus])
	B.begin_turn()
	ok(a.e.focus == f0 - 10.0, "and it gains nothing next turn")
	# flinch: cancels the next action and disrupts
	var Fl := _b({"species": "squirtle", "level": 14, "focus": 60.0, "known": ["bite", "tackle"]},
		{"species": "pidgey", "level": 10, "focus": 60.0, "known": ["tackle", "sand_attack"], "ai": "balanced"})
	BattleConfig.override({"damage": {"status_effect_chance": 1.0}})
	var bm: Dictionary = BattleEnergy.move("bite")
	var was_ch = bm.get("chance")
	bm.chance = 1.0
	Fl.begin_turn()
	Fl.queue("a", "bite"); Fl.queue("b", "tackle"); Fl.queue("b", "sand_attack")
	Fl.order_fn = func(_bt, q): return [["a", q.a[0]], ["b", q.b[0]], ["b", q.b[1]]]
	r = Fl.resolve()
	ok(_has(r, "flinch", "b") and _has(r, "disrupt", "b"), "Bite: a flinch cancels its next action and disrupts")
	ok(r.filter(func(e): return e.t == "move" and e.side == "b").size() == 1, "one of its two actions was lost")
	bm.chance = was_ch
	# confusion disrupts
	var Cf := _b({"species": "drowzee", "level": 12, "focus": 60.0, "known": ["confusion", "pound"]},
		{"species": "pikachu", "level": 12, "focus": 60.0, "known": ["quick_attack"], "ai": "balanced"})
	var cm: Dictionary = BattleEnergy.move("confusion")
	cm.chance = 1.0
	Cf.begin_turn(); Cf.queue("a", "confusion")
	r = Cf.resolve()
	ok(_find(r, "status", "b").get("status", "") == "confused" and r.filter(func(e): return e.t == "disrupt").size() >= 2, "Confusion: disrupts on hit, and the confusion disrupts again")
	cm.chance = 0.1
	BattleConfig.reset()
	BattleConfig.override({"damage": {"crit_base": 0.0, "crit_per_stage": 0.0, "random_min": 1.0}})
	# sleep: no focus gain, no actions
	var S := _b({"species": "bulbasaur", "level": 12, "focus": 60.0, "known": ["sleep_powder", "tackle"]},
		{"species": "pikachu", "level": 12, "focus": 40.0, "known": ["quick_attack", "thunder_shock"], "ai": "balanced"})
	var hy: Dictionary = BattleEnergy.move("sleep_powder")
	hy.accuracy = 100
	S.begin_turn(); S.queue("a", "sleep_powder")
	var rs := S.resolve()
	if S.fighter("b").status != "sleep": print(rs.map(func(e): return e.text), S.fighter("a").e.chips)
	var p := S.fighter("b")
	ok(p.status == "sleep", "Sleep Powder: asleep")
	var pf := p.e.focus
	p.sleep_turns = 3
	S.begin_turn()
	ok(p.e.focus == pf, "asleep: no focus gain")
	ok(not S.can_queue("b", "quick_attack") and S.ai_queue("b").is_empty(), "asleep: no actions")
	hy.accuracy = 75

# ---- Locked In ----
func _locked_in() -> void:
	var B := _b({"species": "pikachu", "level": 14, "focus": 90.0, "known": ["thunder_shock", "quick_attack"]},
		{"species": "charmander", "level": 12, "focus": 60.0, "known": ["growl", "scratch"], "ai": "balanced"})
	var r := B.begin_turn()
	var a := B.fighter("a")
	ok(a.e.locked_in and _has(r, "locked_in", "a"), "100%: LOCKED IN")
	ok(a.e.acc_bonus() > 0.0, "with its accuracy bonus")
	B.queue("b", "growl")
	r = B.resolve()
	ok(not a.e.locked_in and _find(r, "locked_in", "a").get("on", true) == false, "a disrupting hit removes it")

# ---- persistence across battles, fainting, the gym warm-up ----
func _persistence() -> void:
	var e := BattleEnergy.make("pikachu", 14, ["thunder_shock", "quick_attack", "thunderbolt", "growl"])
	e.set_focus(30.0, "test")
	var B := PkmnBattle.new({"a": {"energy": e, "ai": "player"}, "b": {"species": "pidgey", "level": 5, "ai": "wild"}, "kind": "wild", "seed": 3})
	B.start()
	for t in 3:
		B.begin_turn(); B.resolve()
	var after := e.focus
	B.over = true; B.outcome = "won"
	B.finish()
	ok(e.focus == after and after > 30.0, "focus carries out of the battle (%s)" % after)
	var d := e.to_dict()
	var e2 := BattleEnergy.from_dict(d)
	var B2 := PkmnBattle.new({"a": {"energy": e2, "ai": "player"}, "b": {"species": "pidgey", "level": 5, "ai": "wild"}, "kind": "wild", "seed": 4})
	B2.start()
	ok(e2.focus == after, "and into the next one, saved and loaded")
	# a faint drops it to zero
	var w := BattleEnergy.make("pidgey", 4)
	w.set_focus(60.0, "test")
	var B3 := _b({"energy": w, "ai": "player"}, {"species": "pikachu", "level": 30, "focus": 100.0, "known": ["thunderbolt"], "ai": "aggressive"})
	for t in 6:
		if B3.over: break
		B3.begin_turn(); B3.ai_queue("b"); B3.resolve()
	ok(B3.over and B3.outcome == "lost" and w.focus == 0.0, "fainted: its focus is zero (%s, %s)" % [B3.outcome, w.focus])
	B3.finish()
	ok(w.focus == 0.0, "still zero after the battle")
	# the gym: trainers warm it up for the leader
	var g := BattleEnergy.make("pikachu", 16)
	g.set_focus(20.0, "test")
	for i in 3:
		var Bg := PkmnBattle.new({"a": {"energy": g, "ai": "player"}, "b": {"species": "sandshrew", "level": 8, "focus": 20.0, "ai": "balanced"}, "kind": "gym_trainer", "seed": 10 + i})
		Bg.start()
		for t in 3:
			Bg.begin_turn(); Bg.resolve()
		Bg.over = true; Bg.outcome = "won"
		Bg.finish()
	var lead := PkmnBattle.new({"a": {"energy": g, "ai": "player"}, "b": {"species": "sandshrew", "level": 14, "focus": BattleConfig.num("gym_warmup", "leader_start", 30.0), "ai": "cautious"}, "kind": "leader", "seed": 20})
	lead.start()
	lead.begin_turn()
	var mine := lead.fighter("a").e.total()
	var theirs := lead.fighter("b").e.total()
	ok(mine >= theirs + 2, "after three gym trainers: %d chips on the leader's turn 1 vs %d" % [mine, theirs])

# ---- AI personalities ----
func _ai() -> void:
	var count := func(pers: String, what: Callable, n := 60) -> int:
		var hits := 0
		for i in n:
			var B := PkmnBattle.new({"a": {"species": "pikachu", "level": 16, "focus": 60.0, "known": ["thunder_shock", "quick_attack", "thunderbolt", "growl"]},
				"b": {"species": "sandshrew", "level": 16, "focus": 60.0, "known": ["scratch", "dodge", "dig", "ground_pound", "swift", "detect"], "ai": pers}, "kind": "trainer", "seed": 100 + i})
			B.start(); B.begin_turn()
			if what.call(B, PkmnAI.plan(B, "b")): hits += 1
		return hits
	var react := func(_B, plan): return plan.any(func(id): return BattleEnergy.role_of(id) == "reaction")
	var c_cau: int = count.call("cautious", react)
	var c_agg: int = count.call("aggressive", react)
	var c_bal: int = count.call("balanced", react)
	ok(c_cau > c_bal and c_bal > c_agg, "cautious sets reactions most, aggressive least (%d / %d / %d of 60)" % [c_cau, c_bal, c_agg])
	var tp := func(_B, plan): return plan.any(func(id): return BattleEnergy.role_of(id) == "two_phase")
	ok(int(count.call("aggressive", tp)) > int(count.call("cautious", tp)), "aggressive commits to two-phase moves more than cautious")
	# a foe underground: the trainer answers with what reaches it
	var reach := 0
	var wasted := 0
	for i in 30:
		var B := PkmnBattle.new({"a": {"species": "diglett", "level": 14, "focus": 60.0, "known": ["dig", "scratch"]},
			"b": {"species": "sandshrew", "level": 16, "focus": 60.0, "known": ["scratch", "swift", "ground_pound", "dodge"], "ai": "cautious"}, "kind": "trainer", "seed": 300 + i})
		B.start(); B.begin_turn(); B.queue("a", "dig"); B.resolve()
		B.begin_turn()
		var plan := PkmnAI.plan(B, "b")
		if plan.any(func(id): return id in ["ground_pound", "swift"]) or plan.has("dodge"): reach += 1
		if plan.has("scratch"): wasted += 1
	ok(reach >= 25 and wasted == 0, "vs a digger: Ground Pound, Swift or a dodge, never Scratch (%d, %d)" % [reach, wasted])
	# a wild one: the simple planner
	var Bw := PkmnBattle.new({"a": {"species": "pikachu", "level": 8}, "b": {"species": "pidgey", "level": 5, "ai": "wild", "state": "attacking"}, "kind": "wild", "seed": 5})
	Bw.start(); Bw.begin_turn()
	var wp := PkmnAI.plan(Bw, "b")
	ok(not wp.is_empty() and wp.all(func(id): return id in Bw.fighter("b").e.usable()), "a wild one plans from its own moves (%s)" % [wp])

# ---- whole battles, to the end ----
func _whole() -> void:
	var outcomes := {}
	var turns := []
	for i in 12:
		var B := PkmnBattle.new({"a": {"species": "pikachu", "level": 8, "ai": "balanced"},
			"b": {"species": "pidgey", "level": 5, "ai": "wild", "state": "hidden"}, "kind": "wild", "seed": 1000 + i})
		B.start()
		var t := 0
		while not B.over and t < 40:
			B.begin_turn()
			if B.needs_pick("a"): B.pick_pool("a", "")
			B.ai_queue("a"); B.ai_queue("b")
			B.resolve()
			t += 1
		outcomes[B.outcome] = int(outcomes.get(B.outcome, 0)) + 1
		turns.append(t)
	ok(not outcomes.has(""), "every battle ended (%s)" % [outcomes])
	var avg := 0.0
	for t in turns: avg += t
	avg /= turns.size()
	ok(avg >= 2.5 and avg <= 14.0, "Pikachu Lv 8 vs Pidgey Lv 5 lasts a few turns (avg %.1f)" % avg)
	var tr := PkmnBattle.new({"a": {"species": "pikachu", "level": 14, "ai": "balanced", "known": ["thunder_shock", "quick_attack", "dodge", "swift", "feint", "tail_whip"]},
		"b": {"species": "sandshrew", "level": 12, "ai": "cautious"}, "kind": "trainer", "seed": 77})
	tr.start()
	var n := 0
	while not tr.over and n < 60:
		tr.begin_turn(); tr.ai_queue("a"); tr.ai_queue("b"); tr.resolve(); n += 1
	ok(tr.over, "the trainer fight ends (%s in %d turns)" % [tr.outcome, n])
	ok(tr.history.any(func(e): return e.t in ["lock", "commit"]), "and it used reactions or two-phase moves")

# ---- EnergyHook: the old calls still work ----
func _hook() -> void:
	var fake := Node.new()
	fake.set_script(load("res://dev/energy_fake_battle.gd"))
	add_child(fake)
	var h := EnergyHook.attach(fake, {"species": "pidgey", "level": 3, "temper": "flighty"})
	var p1: Array = h.wild_pick({"turn": 1})
	ok(p1.size() == 1 and p1[0].has("cost") and p1[0].has("first"), "wild_pick(state) -> move dicts")
	ok(h.on_move(p1[0].move, Vector2(200, 300)), "on_move(move_id, screen_pos)")
	ok(not h.on_move("gust", Vector2(200, 300), "foe"), "on_move(move_id, screen_pos, side)")
	fake.turn = h.foe.turn
	ok(fake.foe_turn().size() >= 1, "the fake battle's turn loop")
	h.detach()
	await get_tree().create_timer(0.5).timeout
	ok(not is_instance_valid(h), "detach()")
	fake.queue_free()
	await get_tree().process_frame
