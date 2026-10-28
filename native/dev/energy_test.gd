extends Node
# Dev test for the energy system (battle/energy.gd, design/energy_system.md),
# headless: the data's sanity; focus and its chip thresholds (the bar and the
# chip count agree); pools and the per-turn pool pick; spent chips back next
# turn; TCG payment; locks (face down to the opponent, expiry); disruption,
# sleep and Locked In; slots by level and moves never forgotten; persistence,
# decay by game time, the Center's partial relax, fainting, the gym warm-up;
# items; the wild planner; the SVG symbols; the widgets' logic; and EnergyHook
# with the old calls, with and without a battle. Exits 0 when green:
#   godot --headless --path native res://dev/energy_test.tscn

var fails := 0
var checks := 0

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c:
		fails += 1
		printerr("FAIL: " + what)

func _ready() -> void:
	_run.call_deferred()

func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout
	await get_tree().process_frame

func _run() -> void:
	BattleConfig.reset()
	BattleEnergy.reload()
	_data()
	_focus()
	_pools()
	_turns()
	_payment()
	_locks()
	_disruption()
	_locked_in()
	_slots()
	_persistence()
	_items()
	_finishers()
	_plans()
	_icons()
	await _widgets()
	await _hook()
	BattleConfig.reset()
	print("energy_test: %d checks, %d failures" % [checks, fails])
	print("ENERGY TEST GREEN" if fails == 0 else "ENERGY TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

func _fresh(sp: String, lv: int, f := 0.0, learned = null) -> BattleEnergy:
	var e := BattleEnergy.make(sp, lv, learned)
	e.set_focus(f, "test")
	return e

# ---- the data: every learnset move exists, and is payable by a full bar ----
func _data() -> void:
	var D := BattleEnergy.data()
	ok(not D.is_empty() and not BattleEnergy.moves_data().is_empty(), "pokemon.json and moves.json load")
	ok(not BattleConfig.data().is_empty(), "battle_config.json loads")
	ok(BattleEnergy.energy_types().size() == 18, "18 energy kinds (Normal folds into Colorless)")
	for sp in BattleEnergy.data().get("species", {}):
		var S := BattleEnergy.species_data(sp)
		ok(S.get("base", []).size() == 6, "%s has base stats" % sp)
		for row in S.get("learnset", []) + S.get("tm", []).map(func(id): return {"move": id, "level": 100}):
			var id := String(row.move)
			var m := BattleEnergy.move(id)
			ok(not m.is_empty(), "%s: move %s exists" % [sp, id])
			for k in BattleEnergy.cost_of(id):
				ok(k in BattleEnergy.energy_types(), "%s: %s cost kind %s is an energy kind" % [sp, id, k])
			# a full bar (max focus) of its own kinds pays it, if the move's typed kinds are its own
			var e := _fresh(sp, maxi(1, int(row.level)), 100.0)
			var own := e.pool_kinds()
			var typed_ok := BattleEnergy.cost_of(id).all(func(k): return k == "colorless" or k in own)
			if typed_ok:
				var full := []
				for k in e.typed_pools():
					for i in e.pool_cap(k): full.append(k)
				for i in e.chip_cap(): full.append("colorless")
				ok(BattleEnergy.match_cost(full, id) != null, "%s: %s payable from its pools" % [sp, id])
		var e1 := BattleEnergy.make(sp, 5)
		e1.begin_turn()
		if e1.focus >= e1.step(): ok(not e1.affordable_moves().is_empty(), "%s: something to do on turn 1 at the starting focus" % sp)
	for id in BattleEnergy.moves_data():
		var m: Dictionary = BattleEnergy.move(id)
		for key in ["name", "type", "category", "role", "cost", "power", "accuracy", "effects", "anim", "desc"]:
			ok(m.has(key), "move %s has %s" % [id, key])
		ok(String(m.get("role", "")) in BattleEnergy.ROLES, "move %s has a known role" % id)
		if m.get("role") == "reaction": ok(m.has("reaction"), "%s: a reaction says how it triggers" % id)
		if m.get("role") == "two_phase": ok(m.has("two_phase"), "%s: a two-phase move says its state" % id)
		ok(not String(m.get("desc", "")).contains("—") and not String(m.get("name", "")).contains("—"), "%s: no em dashes" % id)
	var gp := BattleEnergy.move("ground_pound")
	ok(gp.type == "ground" and gp.category == "physical" and BattleEnergy.cost_of("ground_pound").size() == 2, "Ground Pound: Ground, physical, 2 chips")
	for id in ["leer", "growl", "screech", "hypnosis", "confusion", "roar", "mean_look"]:
		ok(BattleEnergy.role_of(id) == "disruption" and "disrupt" in BattleEnergy.move(id).effects, "%s is a disruption move" % id)
	for id in ["dodge", "protect", "detect", "counter", "mirror_coat"]:
		ok(BattleEnergy.role_of(id) == "reaction", "%s is a reaction" % id)
	for id in ["dig", "fly", "dive", "bounce", "solar_beam", "skull_bash"]:
		ok(BattleEnergy.role_of(id) == "two_phase", "%s is two-phase" % id)
	# every tunable is in the config
	for sec in ["focus", "disruption", "locked_in", "locks", "slots", "damage", "counters", "decay", "gym_warmup", "perks", "items", "ai"]:
		ok(not BattleConfig.sect(sec).is_empty(), "battle_config has %s" % sec)

# ---- focus: thresholds give chips; the bar and the count never disagree ----
func _focus() -> void:
	var e := _fresh("pidgey", 5, 0.0)
	ok(e.step() == 20.0 and e.chip_cap() == 5 and e.gain_per_turn() == 10.0, "Pidgey: step 20, 5 chips max, +10 a turn")
	ok(e.thresholds() == [20.0, 40.0, 60.0, 80.0, 100.0], "thresholds every 20%% (%s)" % [e.thresholds()])
	var agree := true
	for f in range(0, 101, 5):
		e.set_focus(float(f), "test")
		agree = agree and e.total() == mini(int(f / 20), 5)
	ok(agree, "at every focus the chips held match floor(focus / step)")
	e.set_focus(0.0, "test")
	var counts := []
	for t in 10:
		e.begin_turn()
		counts.append(e.total())
	ok(counts == [0, 1, 1, 2, 2, 3, 3, 4, 4, 5], "from zero: a chip every two turns (%s)" % [counts])
	ok(e.focus == 100.0, "focus caps at 100")
	e.begin_turn()
	ok(e.total() == 5 and e.focus == 100.0, "no chips past the cap")
	# species personality, from the config
	var snor := BattleEnergy.make("snorlax", 30)
	ok(snor.focus == 0.0 and snor.gain_per_turn() == 5.0 and snor.chip_cap() == 8, "Snorlax starts slow (0, +5) with a high cap (8)")
	var psy := BattleEnergy.make("drowzee", 12)
	ok(psy.gain_per_turn() > 10.0 and float(psy.params.disrupt_resist) > 0.0, "a Psychic type focuses faster and resists disruption")
	# perks raise the start and the gain, not only the cap
	var pk := _fresh("pikachu", 10, 20.0)
	var g0 := pk.gain_per_turn()
	pk.add_perk("zen_charm")
	ok(pk.gain_per_turn() == g0 + 3.0, "a perk raises the gain rate")
	pk.add_perk("focus_band")
	var f0 := pk.focus
	pk.start_battle()
	ok(pk.focus == f0 + 10.0, "a perk raises the starting focus (%s -> %s)" % [f0, pk.focus])

# ---- pools: its types' and Colorless; the per-turn pick ----
func _pools() -> void:
	var p := _fresh("pikachu", 10, 0.0)
	ok(p.pool_kinds() == ["electric", "colorless"], "Pikachu: Lightning and Colorless pools (%s)" % [p.pool_kinds()])
	ok(_fresh("pidgey", 5).pool_kinds() == ["flying", "colorless"], "Pidgey: Normal folds into Colorless")
	ok(_fresh("bulbasaur", 5).pool_kinds() == ["grass", "poison", "colorless"], "Bulbasaur: three pools")
	ok(_fresh("snorlax", 30).pool_kinds() == ["colorless"], "Snorlax: Colorless only")
	# one typed pool: zero taps (it fills its typed pool, then Colorless)
	p.pick_mode = "player"
	for i in 4: p.begin_turn()
	ok(not p.needs_pick() and p.pending == 0, "single-type: no pick needed")
	p.set_focus(100.0, "test")
	ok(int(p.pools.electric.ready) == 3 and int(p.pools.colorless.ready) == 2, "typed pool fills to its cap, the rest Colorless (%s)" % [p.pools])
	# Colorless only: zero taps, always Colorless
	var s := _fresh("snorlax", 30, 50.0)
	s.pick_mode = "player"
	for i in 3: s.begin_turn()
	ok(not s.needs_pick() and int(s.pools.colorless.ready) == s.total(), "Colorless-only: into Colorless, no pick")
	# two typed pools: the player picks, one choice a turn
	var b := _fresh("bulbasaur", 10, 30.0)
	b.pick_mode = "player"
	var asked := [0]
	b.pick_needed.connect(func(n): asked[0] = n)
	b.begin_turn()
	ok(b.needs_pick() and b.pending == 1 and asked[0] == 1, "dual-type: a new chip waits for the player's pick")
	ok(b.total() == 1 and b.chips.size() == 1, "a pending chip can't be spent yet")
	var placed := b.pick_pool("poison")
	ok(placed == ["poison"] and int(b.pools.poison.ready) == 1 and not b.needs_pick(), "picked: into Poison")
	b.set_focus(80.0, "test")
	ok(b.pending == 2, "two chips earned at once wait together")
	b.pick_pool("grass")
	ok(int(b.pools.grass.ready) == 3 and b.pending == 0, "one pick places every chip of the turn (%s)" % [b.pools])
	b.set_focus(100.0, "test")
	b.pick_pool("")
	ok(b.pending == 0 and int(b.pools.colorless.ready) >= 1, "no choice: the default pool, Colorless")
	# the AI's pick goes where its moves' typed costs need it
	var ai := _fresh("bulbasaur", 30, 0.0)
	ai.set_focus(40.0, "test")
	ok(int(ai.pools.grass.ready) == 2, "the AI fills Grass first for Razor Leaf / Solar Beam (%s)" % [ai.pools])

# ---- the turn: spent chips dim and come back; several actions a turn ----
func _turns() -> void:
	var e := _fresh("pikachu", 16, 60.0)
	ok(e.total() == 3 and e.available() == 3, "60%: three chips")
	BattleConfig.override({"focus": {"by_type": {"electric": {"gain": 10}}}})
	e._refresh_params()
	e.begin_turn()
	ok(e.focus == 70.0 and e.total() == 3, "turn: +10 focus")
	ok(not e.pay(["electric"], "thunder_shock").is_empty(), "paid Thunder Shock")
	ok(e.available() == 2 and e.total() == 3, "a spent chip stays in its pool, dim")
	var st := e.chip_list().filter(func(c): return c.state == "spent")
	ok(st.size() == 1 and st[0].kind == "electric", "chip_list shows it spent")
	ok(not e.pay(["colorless"]).is_empty() and not e.pay(["colorless"]).is_empty(), "cheap moves chain")
	ok(e.available() == 0 and e.pay(["colorless"]).is_empty(), "until the chips run out")
	e.begin_turn()
	ok(e.available() == 4 and e.total() == 4, "next turn: all back, plus the new one at 80%")
	BattleConfig.reset()
	var tb := e.pay(BattleEnergy.cost_of("thunderbolt"), "thunderbolt")
	ok(tb.size() == 3 and e.available() == 1, "an expensive move takes most of the chips")
	e.refund(["electric", "electric", "colorless"])
	ok(e.available() == 4, "a queued move taken back refunds its chips")

# ---- payment: typed first, Colorless from anything, real Colorless chips spent first ----
func _payment() -> void:
	var e := BattleEnergy.make("pidgey", 3)
	e.chips = ["flying", "colorless"]
	ok(e.total() == 2 and e.earned() == 2, "setting chips moves the focus to match (%s)" % e.focus)
	ok(e.can_pay(["colorless", "flying"]), "Gust's cost in any order")
	var m = BattleEnergy.match_cost(["colorless", "flying"], ["colorless", "flying"])
	ok(m != null and m.size() == 2 and m[0] == 1, "the typed cost takes the flying chip, Colorless the colorless one (%s)" % [m])
	ok(not e.can_pay(["flying", "flying"]), "two flying from one flying chip: no")
	ok(BattleEnergy.match_cost(["flying", "flying", "colorless"], ["colorless"]) == [2], "a Colorless cost uses a real Colorless chip first")
	var m3 = BattleEnergy.match_cost(["fire", "water", "water"], ["colorless"])
	ok(m3 != null and m3[0] != 0, "a Colorless cost keeps the rarer kind (%s)" % [m3])
	ok(BattleEnergy.match_cost(["colorless"], ["fire"]) == null, "a Colorless chip doesn't pay a typed cost")
	ok(BattleEnergy.match_cost(["fire", "colorless"], ["colorless", "fire"]) == [0, 1], "typed matched before Colorless whatever the order")
	ok(BattleEnergy.match_cost(["fire"], {"fire": 1}) == [0], "a {kind: n} cost works")
	ok(BattleEnergy.match_cost(["any"], ["fire"]) == [0], "a wild chip pays a typed cost")
	ok(BattleEnergy.match_cost(["any", "colorless"], ["colorless"]) == [1], "a wild chip is spent last")
	var spent := []
	e.spent.connect(func(idx, kinds, mv): spent.assign([idx, kinds, mv]))
	var paid := e.pay(BattleEnergy.cost_of("gust"), "gust")
	ok(paid == [0, 1] and e.available() == 0, "paid Gust with both chips")
	ok(spent.size() == 3 and spent[2] == "gust" and spent[1].size() == 2, "spent signal carries the chips and the move")
	ok(e.pay(["colorless"]).is_empty(), "can't pay with nothing")
	e.chips = ["electric", "colorless"]
	ok(e.missing(["electric", "electric", "colorless"]) == ["electric"], "missing: one Lightning short")
	ok(e.preview(["electric"]) == [0], "preview names the chip")
	ok(e.preview(["fire"]).is_empty(), "preview of an unaffordable cost is empty")
	ok(not e.use_move("thunderbolt"), "use_move refuses a move it doesn't know")

# ---- locks: reaction chips set aside; face down to the opponent; expiry ----
func _locks() -> void:
	var e := _fresh("pikachu", 10, 60.0, ["thunder_shock", "dodge", "counter", "quick_attack"])
	e.begin_turn()
	var L := e.lock("dodge")
	ok(not L.is_empty() and e.locks.size() == 1, "Dodge locks a chip")
	ok(e.available() == 2 and e.total() == 3 and e.locked_count() == 1, "a locked chip counts against the total, not usable")
	var own := e.lock_view(true)
	var foe := e.lock_view(false)
	ok(own[0].move == "dodge" and not own[0].face_down, "the owner sees which trap")
	ok(foe[0].face_down and not foe[0].has("move"), "the opponent sees a face-down chip, not which")
	ok(e.chip_list().filter(func(c): return c.state == "locked").size() == 1, "chip_list shows the lock")
	e.end_turn()
	ok(e.locks.size() == 1, "still set at the end of its own turn")
	e.begin_turn()
	ok(e.locks.size() == 1 and e.available() == 3, "carried into the next turn (still locked)")
	var ended := [""]
	e.lock_ended.connect(func(_l, how): ended[0] = how)
	e.end_turn()
	ok(e.locks.is_empty() and ended[0] == "expired", "untriggered: released at the end of the following turn")
	e.begin_turn()
	ok(e.available() == 4, "the released chip is back in play")
	BattleConfig.override({"locks": {"expiry_turns": 2}})
	var e2 := _fresh("pikachu", 10, 60.0, ["dodge"])
	e2.begin_turn()
	e2.lock("dodge")
	e2.end_turn(); e2.begin_turn(); e2.end_turn()
	ok(e2.locks.size() == 1, "expiry is configurable (2 turns)")
	BattleConfig.reset()
	var e3 := _fresh("pikachu", 10, 60.0, ["counter"])
	var L3 := e3.lock("counter")
	ok(L3.trigger == "physical" and L3.effect == "counter", "Counter: physical only")
	e3.release_lock(int(L3.id), "wasted")
	ok(e3.locks.is_empty() and e3.available() == 1, "a wrong guess: the chips spent for nothing")

# ---- disruption and sleep ----
func _disruption() -> void:
	var e := _fresh("pidgey", 10, 70.0)
	var lost := e.disrupt()
	ok(e.focus == 55.0, "disruption: down the config's step (70 -> %s)" % e.focus)
	ok(e.total() == 2 and lost.size() == 1, "the chip over the threshold is lost (%s)" % [lost])
	ok(e.disturbed, "and the turn is disturbed")
	e.begin_turn()
	ok(e.focus == 55.0, "no gain on the turn after a disruption")
	e.begin_turn()
	ok(e.focus == 65.0, "gain resumes when undisturbed")
	e.disrupt(-1.0, "screech")
	ok(e.focus == 45.0, "Screech's own step (20)")
	e.set_focus(10.0, "test")
	e.disrupt(15.0)
	ok(e.focus == 0.0, "never below zero")
	var d := _fresh("drowzee", 12, 60.0)
	d.disrupt(20.0)
	ok(d.focus == 50.0, "a Psychic type resists half (60 -> %s)" % d.focus)
	var s := _fresh("pidgey", 10, 40.0)
	s.asleep = true
	s.begin_turn()
	ok(s.focus == 40.0, "asleep: no focus gain")
	s.asleep = false
	s.begin_turn()
	ok(s.focus == 50.0, "awake: it gains again")
	var lk2 := _fresh("pikachu", 10, 20.0, ["dodge"])
	lk2.lock("dodge")
	lk2.disrupt(10.0)
	ok(lk2.locks.is_empty() and lk2.total() == 0, "a disruption past the last chip takes the lock too")

# ---- Locked In ----
func _locked_in() -> void:
	var e := _fresh("pikachu", 10, 90.0)
	var seen := []
	e.locked_in_changed.connect(func(on): seen.append(on))
	e.begin_turn()
	ok(e.focus == 100.0 and e.locked_in and seen == [true], "at 100%: Locked In")
	ok(e.acc_bonus() == 10.0 and e.crit_bonus() == 1, "the buff: accuracy +10, crit +1 stage")
	e.disrupt(10.0)
	ok(not e.locked_in and seen == [true, false], "a disrupting hit removes it")
	ok(e.acc_bonus() == 0.0, "the buff is gone")
	e.begin_turn()
	ok(not e.locked_in, "no gain on the disturbed turn, no Locked In")
	e.begin_turn()
	ok(e.locked_in, "back at 100: Locked In again")
	BattleConfig.override({"locked_in": {"mode": "wild_chip"}})
	var w := _fresh("pikachu", 10, 90.0)
	w.begin_turn()
	ok(w.locked_in and w.chips.has("any") and w.available() == 6, "wild-chip mode: one extra chip that counts as any type (%s)" % [w.chips])
	ok(w.acc_bonus() == 0.0, "wild-chip mode has no accuracy bonus")
	ok(w.can_pay(["electric", "electric", "electric", "electric"]), "the wild chip pays a typed cost")
	w.disrupt(5.0)
	ok(not w.chips.has("any") and w.available() == 4, "a disruption takes the wild chip away")
	BattleConfig.reset()

# ---- slots by level; never forgotten ----
func _slots() -> void:
	var table: Dictionary = BattleConfig.sect("slots").table
	for k in table:
		ok(BattleEnergy.slots_for(int(k)) == int(table[k]), "Lv %s: %s slots" % [k, table[k]])
	ok(BattleEnergy.slots_for(8) == 4 and BattleEnergy.slots_for(9) == 5 and BattleEnergy.slots_for(17) == 5, "about one slot every 8 to 10 levels")
	ok(BattleEnergy.next_slot_level(5) == 9 and BattleEnergy.next_slot_level(99) == -1, "the next slot at Lv 9; none at the top")
	ok(BattleEnergy.level_for_slot(6) == 18, "slot 6 opens at Lv 18")
	var e := BattleEnergy.make("pikachu", 1, [])
	ok(e.learnable_at(1) == ["thunder_shock", "growl"], "Lv 1: Thunder Shock, Growl (%s)" % [e.learnable_at(1)])
	ok(e.learn("thunder_shock") and e.learn("growl"), "learned both")
	ok(not e.learn("thunder_shock"), "can't learn twice")
	ok(not e.learn("thunderbolt"), "can't learn above its level")
	var lv := e.set_level(16)
	ok("thunderbolt" in lv.learnable and "quick_attack" in lv.learnable, "Lv 16 offers Thunderbolt and Quick Attack")
	for id in lv.learnable: e.learn(id)
	ok(e.known.size() == 9, "nine moves known: no four-move cap (%d)" % e.known.size())
	ok(e.slots == 5 and e.equipped.size() == 5, "Lv 16: five slots, five equipped")
	var locked_ids := e.known.filter(func(id): return e.locked(id))
	ok(locked_ids.size() == 4, "the rest are known but locked (%s)" % [locked_ids])
	ok(e.swap("growl", "thunderbolt") and "thunderbolt" in e.usable() and not "growl" in e.usable() and "growl" in e.known, "swapping a slot: Growl stays known")
	e.set_level(5)
	ok(e.level == 16, "the level never goes down")
	var up := e.set_level(18)
	ok(up.slots == 1 and e.equipped.size() == 6, "Lv 18: a sixth slot, filled from known moves")
	e.set_level(40)
	for id in e.learnable_at(40): e.learn(id)
	ok(e.known.size() == 13 and e.known.slice(0, 2) == ["thunder_shock", "growl"], "old moves stay, in learned order")
	ok(e.teach("swift") and "swift" in e.known, "a TM teaches Swift")
	ok(not e.teach("surf"), "not a move it can be taught")
	ok(e.teach("surf", true), "a tutor can force it")
	var d := BattleEnergy.from_dict(e.to_dict())
	ok(d.known == e.known and d.level == 40 and d.equipped == e.equipped, "saved and loaded: known and equipped")
	var wild := BattleEnergy.make("pidgey", 9)
	ok(wild.equipped == wild.known.slice(wild.known.size() - wild.slots), "a wild one has its latest moves in its slots (%s)" % [wild.equipped])
	ok(BattleEnergy.make("pidgey", 3).usable() == ["tackle", "sand_attack", "gust", "quick_attack"], "a Route 1 Pidgey Lv 3 uses its four")

# ---- persistent focus, decay by game time, the Center, fainting, warm-up ----
func _persistence() -> void:
	var e := _fresh("pikachu", 10, 70.0)
	e.pools.electric = {"ready": 2, "spent": 1}
	e.pools.colorless = {"ready": 0, "spent": 0}
	var d := e.to_dict()
	ok(d.focus == 70.0 and d.pools.electric == 3, "saved: focus and chips per pool")
	var e2 := BattleEnergy.from_dict(d)
	ok(e2.focus == 70.0 and int(e2.pools.electric.ready) == 3 and e2.total() == 3, "loaded: the same focus and pools")
	# decay: game minutes only (an alert Pokemon keeps it for the grace period)
	var a := _fresh("pikachu", 10, 80.0)
	a.elapse(30.0)
	ok(a.focus == 80.0, "alert: 30 game minutes, focus kept")
	a.elapse(90.0)
	ok(is_equal_approx(a.focus, 76.0), "after the grace: 4 an hour (%s)" % a.focus)
	var r := _fresh("sandshrew", 10, 80.0)
	r.elapse(60.0)
	ok(is_equal_approx(r.focus, 68.0), "relaxed: 12 an hour from the start (%s)" % r.focus)
	r.rest("rest_stop")
	ok(r.focus <= 10.0, "relaxed after a rest: starts low and must ramp (%s)" % r.focus)
	var al := _fresh("pikachu", 10, 80.0)
	al.rest("rest_stop")
	ok(is_equal_approx(al.focus, 48.0), "alert after a rest stop: keeps 60%% (%s)" % al.focus)
	# Locked In fades faster than focus
	var li := _fresh("pikachu", 10, 100.0)
	li.add_focus(1.0)
	ok(li.locked_in, "Locked In")
	li.elapse(20.0)
	ok(not li.locked_in and li.focus == 100.0, "20 minutes: the buff gone, the focus still 100")
	# the Center: a partial relax
	var c := _fresh("pikachu", 10, 80.0)
	c.center()
	ok(is_equal_approx(c.focus, 32.0) and c.focus > 0.0, "a Center keeps 40%% (80 -> %s)" % c.focus)
	# fainting: zero
	var f := _fresh("pikachu", 10, 80.0, ["dodge"])
	f.lock("dodge")
	f.faint()
	ok(f.focus == 0.0 and f.total() == 0 and f.locks.is_empty(), "fainted: focus zero, no chips")
	# the gym warm-up: trainers before the leader
	var g := _fresh("pikachu", 14, 20.0)
	var start := g.focus
	for i in 2:
		g.set_focus(g.focus + 30.0, "test")   # what it built up in the fight
		g.after_battle({"kind": "gym_trainer", "won": true})
	ok(g.in_gym and g.gym_wins == 2, "two gym trainers beaten")
	g.elapse(60.0)
	ok(g.focus == 80.0, "warm: carried focus, capped at max_carry 80 (%s), no decay inside" % g.focus)
	var lead := BattleConfig.num("gym_warmup", "leader_start", 30.0)
	ok(g.earned() - int(lead / g.step()) >= 2, "about two more chips than the leader's Pokemon on turn 1 (%d vs %d)" % [g.earned(), int(lead / g.step())])
	ok(g.focus > start, "the warm-up beats walking in cold")
	g.after_battle({"kind": "leader", "won": true})
	ok(not g.in_gym, "the leader ends the warm-up")
	var w := BattleEnergy.make_wild("pidgey", 3, "startled")
	ok(w.focus == 30.0, "a startled wild Pidgey starts at 30 (%s)" % w.focus)
	ok(BattleEnergy.make_wild("snorlax", 30, "hidden").focus == 0.0, "a wild Snorlax starts at zero")

# ---- items: the energy restore category ----
func _items() -> void:
	var I := BattleEnergy.items()
	for id in I:
		if String(id).begins_with("_"): continue
		ok(I[id].has("price") and I[id].has("rarity") and int(I[id].price) >= 1500, "%s: a rare, expensive item with a price" % id)
	var e := _fresh("charmander", 10, 20.0)
	ok(e.total() == 1, "20%: one chip")
	var r := []
	e.restored.connect(func(first, kinds): r.assign([first, kinds]))
	ok(e.use_item("energy_shard") == 1 and int(e.pools.colorless.ready) == 1, "Energy Shard: one Colorless chip")
	ok(e.focus == 40.0 and e.total() == 2, "the focus rises to match (the bar agrees)")
	ok(r.size() == 2 and r[1] == ["colorless"], "the restored signal")
	ok(e.use_item("focus_crystal") == 2 and int(e.pools.fire.ready) == 3, "Focus Crystal: two of its own type")
	ok(e.restore(9) == 1 and e.total() == 5, "restore stops at the chip cap")
	ok(e.restore(1) == 0, "nothing past a full bar")
	var t := _fresh("charmander", 10, 10.0)
	ok(t.use_item("focus_tonic") == 2 and t.focus == 40.0, "Focus Tonic: a burst of 30 focus")
	var fc := _fresh("charmander", 10, 10.0)
	fc.use_item("full_charge")
	ok(fc.focus == 100.0 and fc.locked_in, "Full Charge: straight to max, Locked In")
	ok(e.use_item("nonsense") == 0, "an unknown item does nothing")

# ---- finishers (every chip), tiers ----
func _finishers() -> void:
	var sp := BattleEnergy.all_spec("volt_tackle")
	ok(sp.all and int(sp.min) == 3 and sp.type == "electric", "Volt Tackle: all chips, min 3 Lightning (%s)" % [sp])
	ok(BattleEnergy.cost_of("volt_tackle") == ["electric", "electric", "electric"], "cost_of: its minimum, for display")
	ok(BattleEnergy.tier_of("volt_tackle") == "finisher" and BattleEnergy.tier_of("thunder_shock") == "opener" and BattleEnergy.tier_of("thunderbolt") == "mid", "tiers")
	for id in BattleEnergy.moves_data():
		ok(String(BattleEnergy.move(id).get("tier", "")) in ["opener", "mid", "finisher"], "%s has a tier" % id)
		if BattleEnergy.is_all(id): ok(BattleEnergy.move(id).has("power_per_chip"), "%s: a finisher has power_per_chip" % id)
	var e := _fresh("pikachu", 30, 40.0, ["volt_tackle", "thunder_shock", "quick_attack"])
	ok(not e.can_pay("volt_tackle"), "2 chips: under the minimum")
	e.set_focus(100.0, "test")
	ok(e.chips.count("electric") == 3 and e.can_pay("volt_tackle"), "5 chips with 3 Lightning: payable")
	ok(e.preview("volt_tackle").size() == 5, "the preview lights every chip")
	ok(BattleEnergy.move_power("volt_tackle", 5) == 5.0 + 39.0 * 5, "power: base + per chip (%s)" % BattleEnergy.move_power("volt_tackle", 5))
	ok(BattleEnergy.move_power("volt_tackle", 3) < BattleEnergy.move_power("volt_tackle", 5), "more chips, more power")
	var paid := e.pay("volt_tackle", "volt_tackle")
	ok(paid.size() == 5 and e.available() == 0, "it consumes every unlocked chip")
	var e2 := _fresh("pikachu", 30, 100.0, ["volt_tackle", "dodge"])
	e2.lock("dodge")
	e2.pay(BattleEnergy.cost_of("volt_tackle"), "volt_tackle")
	ok(e2.locks.size() == 1 and e2.available() == 0 and e2.chip_list().filter(func(c): return c.state == "spent").size() == 4, "a locked chip is left alone")
	var e3 := _fresh("pikachu", 30, 100.0)
	e3.pools.electric = {"ready": 1, "spent": 0}
	e3.pools.colorless = {"ready": 4, "spent": 0}
	ok(not e3.can_pay("volt_tackle") and e3.missing("volt_tackle") == ["electric", "electric"], "too few Lightning: two missing (%s)" % [e3.missing("volt_tackle")])
	ok(BattleEnergy.match_cost(["fire", "water", "grass", "colorless"], {"all": true, "min": 4, "type": "any"}) == [0, 1, 2, 3], "an any-type finisher takes any chips")
	ok(BattleEnergy.match_cost(["fire", "water"], {"all": true, "min": 3, "type": "any"}) == null, "but needs its minimum")
	# the planner keeps a finisher last, one a plan, and values it by the chips it gets
	var p := _fresh("pikachu", 30, 100.0, ["volt_tackle", "quick_attack", "thunder_shock"])
	var plan := p.plan_turn(p.usable(), "aggressive")
	ok(plan.filter(func(id): return BattleEnergy.is_all(id)).size() <= 1 and (not "volt_tackle" in plan or plan.back() == "volt_tackle"), "a finisher closes the plan (%s)" % [plan])
	ok(plan == ["volt_tackle"], "aggressive at five chips: all in (%s)" % [plan])
	var low := _fresh("pikachu", 30, 60.0, ["volt_tackle", "quick_attack", "thunder_shock"])
	ok(not "volt_tackle" in low.plan_turn(low.usable(), "strategic"), "at three chips the strategic one keeps them for cheap moves")

# ---- the wild planner: several actions a turn, by style ----
func _plans() -> void:
	var e := BattleEnergy.make_wild("pidgey", 3)
	ok(e.known == ["tackle", "sand_attack", "gust", "quick_attack"], "a wild Pidgey Lv 3 knows its four (%s)" % [e.known])
	e.begin_turn()
	ok(e.total() == 1 and e.plan_turn(e.known, "aggressive").size() == 1, "turn 1: one chip, one move")
	e.begin_turn()
	ok(e.total() == 2, "turn 2: two chips")
	ok(e.plan_turn(e.known, "aggressive") == ["gust"], "aggressive spends both chips on Gust (%s)" % [e.plan_turn(e.known, "aggressive")])
	var strat := e.plan_turn(e.known, "strategic")
	ok(strat.size() == 2 and "sand_attack" in strat and strat[0] == "quick_attack", "strategic: Quick Attack first, then Sand-Attack (%s)" % [strat])
	var used := e.plan_turn(e.known, "strategic", {"uses": {"sand_attack": 3}})
	ok(used.size() == 2 and not "sand_attack" in used, "once blinded it stops throwing sand (%s)" % [used])
	ok(e.available() == 2, "planning spends nothing")
	var p := _fresh("pikachu", 30, 100.0)
	p.begin_turn()
	var pa := p.plan_turn(p.usable(), "aggressive")
	var cost := 0
	for id in pa: cost += p.available() if BattleEnergy.is_all(id) else BattleEnergy.cost_of(id).size()
	ok(cost == p.available() and pa.any(func(id): return BattleEnergy.cost_of(id).size() >= 3), "aggressive at full: a big one, every chip used (%s)" % [pa])
	var ps := p.plan_turn(p.usable(), "strategic")
	ok(ps.size() >= pa.size(), "strategic takes as many actions or more (%d vs %d)" % [ps.size(), pa.size()])
	var sim := _fresh("pikachu", 30, 100.0)
	var all_paid := true
	for id in ps: all_paid = all_paid and not sim.pay(BattleEnergy.cost_of(id), id).is_empty()
	ok(all_paid, "the strategic plan pays out in order")
	var ev := BattleEnergy.make_wild("pidgey", 9)
	ev.begin_turn(); ev.begin_turn()
	ok("whirlwind" in ev.plan_turn(ev.usable(), "evasive"), "evasive Pidgey blows it away (%s)" % [ev.plan_turn(ev.usable(), "evasive")])
	var none := _fresh("pidgey", 3, 0.0)
	ok(none.plan_turn(none.known, "aggressive").is_empty(), "no chips, no plan")
	var dg := _fresh("diglett", 14, 60.0)
	var plan := dg.plan_turn(dg.usable(), "aggressive")
	ok(not plan.is_empty() and plan.filter(func(id): return BattleEnergy.role_of(id) == "two_phase").size() <= 1, "at most one two-phase commitment a plan (%s)" % [plan])
	if "dig" in plan: ok(plan.back() == "dig", "the commitment goes last (%s)" % [plan])

# ---- the SVG symbols ----
func _icons() -> void:
	var n0 := EnergyIcon.cache_size()
	for k in EnergyIcon.KINDS + ["any", "hidden"]:
		var svg := EnergyIcon.svg(k)
		ok(svg.begins_with("<svg") and not svg.contains("%G%") and not svg.contains("%F%"), "%s: a whole SVG string" % k)
		var tex := EnergyIcon.texture(k, 48.0)
		ok(tex != null and tex.get_width() == 48, "%s: rasterised at 48 px" % k)
		ok(EnergyIcon.texture(k, 40.0) == tex, "%s: cached per size bucket" % k)
		ok(EnergyIcon.texture(k, 48.0, "flat") != null and EnergyIcon.texture(k, 48.0, "glyph") != null and EnergyIcon.texture(k, 48.0, "disc", true) != null, "%s: flat, glyph and spent variants" % k)
	ok(EnergyIcon.cache_size() > n0, "the cache grew")
	ok(EnergyIcon.texture("fire", 200.0).get_width() == 256, "a big size rasterises big (crisp)")

# ---- the widgets' logic (headless) ----
func _widgets() -> void:
	var host := Control.new()
	host.size = Vector2(1280, 720)
	add_child(host)
	var e := BattleEnergy.make_wild("pidgey", 9)
	var bar := EnergyBar.new()
	host.add_child(bar)
	bar.bind(e)
	ok(bar.slots_shown() == 5, "the bar knows its chip cap")
	e.begin_turn(); e.begin_turn()
	await get_tree().process_frame
	ok(bar.vis.size() == 2, "the bar follows the chips (%d)" % bar.vis.size())
	bar.preview_cost(BattleEnergy.cost_of("gust"))
	ok(bar.hi.size() == 2, "preview lights the chips Gust would use (%s)" % [bar.hi])
	bar.preview_cost(BattleEnergy.cost_of("wing_attack"))
	ok(bar.ghosts.size() >= 1, "an unaffordable preview shows what's missing")
	bar.clear_preview()
	e.pay(["colorless"], "tackle")
	await get_tree().process_frame
	ok(bar.vis.size() == 2 and bar.flying.size() == 1, "a spent chip flies out and stays, dim")
	ok(bar.vis.filter(func(v): return v.state == "spent").size() == 1, "the shown chip is spent")
	await _wait(1.0)
	ok(bar.flying.is_empty(), "the flight ends")
	e.disrupt(15.0)
	await get_tree().process_frame
	ok(bar.vis.size() == 1 and not bar.fading.is_empty(), "a lost chip fades out")
	# the pool pick: a tap on a tray
	var b := _fresh("bulbasaur", 10, 30.0)
	b.pick_mode = "player"
	var bb := EnergyBar.new()
	host.add_child(bb)
	bb.bind(b)
	b.begin_turn()
	ok(bb.picking(), "the bar shows the pick")
	await get_tree().process_frame
	var pr := bb.pool_rect("poison")
	ok(pr.size.x > 0 and bb.pool_at(pr.get_center()) == "poison", "pool_at finds the Poison tray")
	var tapped := [""]
	bb.pool_tapped.connect(func(kd): tapped[0] = kd; b.pick_pool(kd))
	var ev := InputEventMouseButton.new()
	ev.pressed = true; ev.button_index = MOUSE_BUTTON_LEFT; ev.position = pr.get_center()
	bb._unhandled_input(ev)
	ok(tapped[0] == "poison" and int(b.pools.poison.ready) == 1, "a tap on a tray picks that pool")
	# locks: face down on the opponent's panel
	var lk := _fresh("pikachu", 10, 60.0, ["dodge", "thunder_shock"])
	var lb := EnergyBar.new()
	lb.owner_view = false
	host.add_child(lb)
	lb.bind(lk)
	lk.lock("dodge")
	await get_tree().process_frame
	ok(lb.vis.filter(func(v): return v.state == "locked").size() == 1, "the bar shows the lock")
	# the move list
	var ml := EnergyMoveList.new()
	ml.size = Vector2(420, 300)
	host.add_child(ml)
	var me := _fresh("pidgey", 9, 20.0)
	me.begin_turn()
	ml.bind(me, me.known)
	var picked := [""]
	ml.picked.connect(func(id): picked[0] = id)
	ok(ml.state_of("tackle") == "locked", "a known move out of the slots shows locked")
	ok(ml.ids.back() == "tackle", "locked moves sort to the bottom (%s)" % [ml.ids])
	ok(ml.state_of("quick_attack") == "ready" and ml.state_of("gust") == "short", "ready, short of energy")
	ml.pick_id("gust")
	ok(picked[0] == "", "an unaffordable move isn't picked")
	ml.pick_id("quick_attack")
	ok(picked[0] == "quick_attack", "an affordable one is")
	host.queue_free()

# ---- the hook: the old calls, a fake battle and none at all ----
func _hook() -> void:
	var fake := Node.new()
	fake.set_script(load("res://dev/energy_fake_battle.gd"))
	add_child(fake)
	var h := EnergyHook.attach(fake, {"species": "pidgey", "level": 3})
	ok(h != null and h.foe != null, "attached to the fake battle")
	ok(h.ally == null and h.ally_bar == null, "Ash has no energy: no ally side")
	ok(h.bar != null and h.bar.get_parent() != null, "the foe's bar is in the HUD")
	ok(not h.bar.owner_view, "the foe's locks would show face down")
	ok(h.bar.position.is_equal_approx(fake.energy_anchor("foe").position), "the bar sits in the battle's anchor")
	ok(h.foe.focus == 20.0, "a wild one's starting focus (%s)" % h.foe.focus)
	var picks: Array = fake._wild_pick({"turn": 1, "temper": "aggressive"})
	ok(picks.size() == 1 and picks[0].get("kind") == "move", "turn 1: one move dict (%s)" % [picks])
	for key in ["kind", "move", "first", "cost", "name", "anim", "power", "accuracy", "effects"]:
		ok(picks[0].has(key), "the move dict has %s" % key)
	var picks2: Array = fake._wild_pick({"turn": 2, "temper": "aggressive"})
	ok(picks2.size() == 1 and picks2[0].move == "gust" and picks2[0].cost == ["flying", "colorless"], "turn 2 aggressive: Gust with its cost (%s)" % [picks2])
	ok(h.on_move("gust") and h.foe.available() == 0, "on_move pays the chips")
	ok(not h.on_move("gust"), "and can't pay twice")
	ok(h.on_move("gust", Vector2(300, 300), "foe") == false, "the three-argument form works")
	var picks3: Array = fake._wild_pick({"turn": 3, "temper": "flighty"})
	ok(picks3.size() >= 1 and h.foe.available() == 2, "turn 3: the spent chips are back (%s)" % [picks3])
	ok(EnergyHook.temper_style("aggressive") == "aggressive" and EnergyHook.temper_style("timid") == "evasive", "temper -> style")
	ok(h.disrupt("foe", 20.0).size() >= 0 and h.foe.focus < 40.0, "the optional disrupt (Ash startles it)")
	h.end_turn()
	ok(h.use_item("energy_shard") == 1, "an item on the wild side")
	# the moves the battle can't stage are never planned
	var fake2 := Node.new()
	fake2.set_script(load("res://dev/energy_fake_battle.gd"))
	add_child(fake2)
	var h2 := EnergyHook.attach(fake2, {"species": "pidgey", "level": 9, "moves": ["tackle", "gust"], "state": "attacking"})
	ok(h2.foe.focus == 40.0, "an attacking wild one starts higher (%s)" % h2.foe.focus)
	var all_ok := true
	for t in range(1, 6):
		for p in fake2._wild_pick({"turn": t}): all_ok = all_ok and p.move in ["tackle", "gust"]
	ok(all_ok, "only the moves the battle stages")
	h.detach()
	h2.detach()
	await _wait(0.6)
	ok(not is_instance_valid(h), "detached and gone")
	fake.queue_free(); fake2.queue_free()
	var lone := EnergyHook.attach(null, {"species": "pidgey", "level": 3})
	add_child(lone)
	ok(lone.wild_pick({}).size() == 1, "no battle: still picks (turn 1)")
	ok(lone.wild_pick({}).size() >= 1, "and counts its own turns")
	lone.queue_free()
	await get_tree().process_frame
