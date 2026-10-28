extends Node
# Dev test for the energy system (battle/energy.gd, design/energy_system.md),
# headless: chip growth per turn and the capacity cap, TCG payment (typed costs
# first, Colorless last), multi-action plans by style, learnsets that never
# forget, slot unlocks by level, item restores, the data's sanity, and the
# widgets' logic (EnergyBar follows the engine, EnergyMoveList's states and
# picks, EnergyHook with and without a battle). Exits 0 when green:
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
	BattleEnergy.reload()
	_data()
	_growth()
	_payment()
	_plans()
	_learning()
	_slots()
	_items()
	await _widgets()
	await _hook()
	print("energy_test: %d checks, %d failures" % [checks, fails])
	print("ENERGY TEST GREEN" if fails == 0 else "ENERGY TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

# ---- the data: every learnset move exists, and is payable by a full bar at its level ----
func _data() -> void:
	var D := BattleEnergy.data()
	ok(not D.is_empty() and not BattleEnergy.moves_data().is_empty(), "pokemon.json and moves.json load")
	ok(BattleEnergy.energy_types().size() == 18, "18 energy kinds (Normal folds into Colorless)")
	for sp in ["pidgey", "pikachu", "bulbasaur", "charmander", "squirtle"]:
		var S := BattleEnergy.species_data(sp)
		ok(not S.is_empty(), "%s exists" % sp)
		for row in S.get("learnset", []):
			var id := String(row.move)
			var m := BattleEnergy.move(id)
			ok(not m.is_empty(), "%s: move %s exists" % [sp, id])
			for k in BattleEnergy.cost_of(id):
				ok(k in BattleEnergy.energy_types(), "%s: %s cost kind %s is an energy kind" % [sp, id, k])
			var e := BattleEnergy.new(sp, int(row.level))
			e.turn = 99
			e.chips = []
			for i in e.capacity: e.chips.append(e.focus_kind(i))
			ok(e.can_pay(id), "%s: %s (Lv %d) payable by a full bar of %d" % [sp, id, int(row.level), e.capacity])
		var e1 := BattleEnergy.make(sp, 1)
		e1.begin_turn()
		ok(not e1.affordable_moves().is_empty(), "%s: something to do on turn 1" % sp)
	for id in BattleEnergy.moves_data():
		var m: Dictionary = BattleEnergy.move(id)
		for key in ["name", "type", "cost", "power", "accuracy", "effects", "anim"]:
			ok(m.has(key), "move %s has %s" % [id, key])

# ---- chips: turn n has min(n, capacity); last turn's unspent ones are gone ----
func _growth() -> void:
	var e := BattleEnergy.make("pikachu", 10)   # 3 slots
	ok(e.capacity == 3, "Pikachu Lv 10 has 3 slots (%d)" % e.capacity)
	var got := []
	for t in 6:
		got.append(e.begin_turn().size())
	ok(got == [1, 2, 3, 3, 3, 3], "chips per turn 1,2,3,3,3,3 (%s)" % [got])
	ok(e.turn == 6, "six turns counted")
	e.reset_battle()
	var c1 := e.begin_turn()
	ok(c1 == ["electric"], "turn 1: one chip, its own type (%s)" % [c1])
	var c2 := e.begin_turn()
	ok(c2 == ["electric", "electric"], "turn 2: two (%s)" % [c2])
	var c3 := e.begin_turn()
	ok(c3 == ["electric", "electric", "colorless"], "turn 3: its focus adds Colorless (%s)" % [c3])
	e.pay(["electric"])
	ok(e.available() == 2, "spent one, two left")
	var lost := []
	e.turn_started.connect(func(_t, l, _g): lost.assign(l))
	e.begin_turn()
	ok(lost.size() == 2 and e.available() == 3, "unspent chips don't carry over (lost %d, now %d)" % [lost.size(), e.available()])
	var big := BattleEnergy.make("pidgey", 80)
	ok(big.capacity == 10, "the cap is 10 slots")
	for t in 14: big.begin_turn()
	ok(big.available() == 10, "turn 14 still 10 chips")

# ---- payment: typed first, Colorless from anything, real Colorless chips spent first ----
func _payment() -> void:
	var e := BattleEnergy.make("pidgey", 3)
	e.chips = ["flying", "colorless"]
	ok(e.can_pay(["colorless", "flying"]), "Gust's cost in any order")
	var m = BattleEnergy.match_cost(["colorless", "flying"], ["colorless", "flying"])
	ok(m != null and m.size() == 2 and m[0] == 1, "the typed cost takes the flying chip, the Colorless cost the colorless chip (%s)" % [m])
	ok(not e.can_pay(["flying", "flying"]), "two flying from one flying chip: no")
	var m2 = BattleEnergy.match_cost(["flying", "flying", "colorless"], ["colorless"])
	ok(m2 == [2], "a Colorless cost uses a real Colorless chip first (%s)" % [m2])
	var m3 = BattleEnergy.match_cost(["fire", "water", "water"], ["colorless"])
	ok(m3 != null and m3[0] != 0, "a Colorless cost keeps the rarer kind (%s)" % [m3])
	ok(BattleEnergy.match_cost(["colorless"], ["fire"]) == null, "a Colorless chip doesn't pay a typed cost")
	ok(BattleEnergy.match_cost(["fire", "colorless"], ["colorless", "fire"]) == [0, 1], "typed matched before Colorless whatever the order")
	ok(BattleEnergy.match_cost(["fire"], {"fire": 1}) == [0], "a {kind: n} cost works")
	var spent := []
	e.spent.connect(func(idx, kinds, mv): spent.assign([idx, kinds, mv]))
	var paid := e.pay(BattleEnergy.cost_of("gust"), "gust")
	ok(paid == [0, 1] and e.available() == 0, "paid Gust with both chips")
	ok(spent.size() == 3 and spent[2] == "gust" and spent[1].size() == 2, "spent signal carries the chips and the move")
	ok(e.pay(["colorless"]).is_empty(), "can't pay with nothing")
	e.chips = ["electric", "colorless"]
	ok(e.missing(["electric", "electric", "colorless"]) == ["electric"], "missing: one Lightning short (%s)" % [e.missing(["electric", "electric", "colorless"])])
	ok(e.preview(["electric"]) == [0], "preview names the chip")
	ok(e.preview(["fire"]).is_empty(), "preview of an unaffordable cost is empty")
	ok(not e.use_move("thunderbolt"), "use_move refuses a move it doesn't know")

# ---- plans: several actions a turn, by style ----
func _plans() -> void:
	var e := BattleEnergy.make("pidgey", 3)
	ok(e.known == ["tackle", "sand_attack", "gust", "quick_attack"], "a wild Pidgey Lv 3 knows its four (%s)" % [e.known])
	e.begin_turn()
	var p1 := e.plan_turn(e.known, "aggressive")
	ok(p1.size() == 1, "turn 1: one chip, one move (%s)" % [p1])
	e.begin_turn()
	var agg := e.plan_turn(e.known, "aggressive")
	ok(agg == ["gust"], "aggressive spends both chips on Gust (%s)" % [agg])
	var strat := e.plan_turn(e.known, "strategic")
	ok(strat.size() == 2 and "sand_attack" in strat, "strategic: two cheap moves with Sand-Attack (%s)" % [strat])
	ok(strat[0] == "quick_attack", "Quick Attack (priority) goes first (%s)" % [strat])
	var used := e.plan_turn(e.known, "strategic", {"uses": {"sand_attack": 3}})
	ok(used.size() == 2 and not "sand_attack" in used, "once its foe is blinded it stops throwing sand (%s)" % [used])
	ok(e.available() == 2, "planning spends nothing")
	# a bigger bar: several actions
	var p := BattleEnergy.make("pikachu", 30)
	for t in 6: p.begin_turn()
	ok(p.available() == 6, "Pikachu Lv 30 has 6 chips on turn 6")
	var pa := p.plan_turn(p.known, "aggressive")
	var cost := 0
	for id in pa: cost += BattleEnergy.cost_of(id).size()
	ok(pa.size() >= 2 and cost == 6, "aggressive at 6 chips: big moves, every chip used (%s)" % [pa])
	ok(pa.any(func(id): return BattleEnergy.cost_of(id).size() >= 3), "aggressive spends on a big one (%s)" % [pa])
	var ps := p.plan_turn(p.known, "strategic")
	ok(ps.size() > pa.size(), "strategic takes more actions than aggressive (%d vs %d)" % [ps.size(), pa.size()])
	# the plan can be paid in order, all of it
	var sim := BattleEnergy.make("pikachu", 30)
	sim.chips = p.chips.duplicate()
	var all_paid := true
	for id in ps: all_paid = all_paid and sim.use_move(id)
	ok(all_paid, "the strategic plan pays out in order")
	var ev := BattleEnergy.make("pidgey", 9)
	ev.begin_turn(); ev.begin_turn()
	ok(ev.plan_turn(ev.known, "evasive") == ["whirlwind"], "evasive Pidgey blows it away (%s)" % [ev.plan_turn(ev.known, "evasive")])
	var none := BattleEnergy.make("pidgey", 3)
	ok(none.plan_turn(none.known, "aggressive").is_empty(), "no chips, no plan")
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var j := e.plan_turn(e.known, "strategic", {"rng": rng, "jitter": 0.3})
	ok(not j.is_empty(), "a jittered plan is still a plan")

# ---- learning: moves are never forgotten, and there's no four-move cap ----
func _learning() -> void:
	var e := BattleEnergy.make("pikachu", 1, [])
	ok(e.known.is_empty(), "a fresh one knows nothing")
	ok(e.learnable_at(1) == ["thunder_shock", "growl"], "Lv 1: Thunder Shock, Growl (%s)" % [e.learnable_at(1)])
	ok(e.learn("thunder_shock") and e.learn("growl"), "learned both")
	ok(not e.learn("thunder_shock"), "can't learn twice")
	ok(not e.learn("thunderbolt"), "can't learn above its level")
	var before := e.known.size()
	var lv := e.set_level(16)
	ok(e.known.size() == before, "levelling doesn't change what it knows")
	ok("thunderbolt" in lv.learnable and "quick_attack" in lv.learnable, "Lv 16 offers Thunderbolt and Quick Attack")
	for id in lv.learnable: e.learn(id)
	ok(e.known.size() == 7, "seven moves known: no four-move cap (%d)" % e.known.size())
	e.set_level(5)
	ok(e.level == 16, "the level never goes down")
	e.set_level(40)
	for id in e.learnable_at(40): e.learn(id)
	ok(e.known.size() == 9 and e.known.slice(0, 7) == ["thunder_shock", "growl", "tail_whip", "quick_attack", "thunder_wave", "double_team", "thunderbolt"], "old moves stay, in learned order")
	var d := BattleEnergy.from_dict(e.to_dict())
	ok(d.known == e.known and d.level == 40, "saved and loaded")

# ---- slots: the bar grows with the level and gates the moves ----
func _slots() -> void:
	var expect := {1: 1, 2: 1, 3: 2, 7: 2, 8: 3, 13: 3, 14: 4, 21: 5, 29: 6, 38: 7, 48: 8, 60: 9, 75: 10, 100: 10}
	for lv in expect:
		ok(BattleEnergy.capacity_for(lv) == expect[lv], "Lv %d: %d slots (%d)" % [lv, expect[lv], BattleEnergy.capacity_for(lv)])
	ok(BattleEnergy.next_slot_level(3) == 8 and BattleEnergy.next_slot_level(80) == -1, "the next slot comes at Lv 8; none past 75")
	ok(BattleEnergy.level_for_slot(3) == 8 and BattleEnergy.level_for_slot(1) == 1, "slot 3 opens at Lv 8")
	var e := BattleEnergy.make("pidgey", 2)
	ok(e.capacity == 1 and not "gust" in e.known, "Lv 2 Pidgey: 1 slot, no Gust")
	var up := e.set_level(3)
	ok(up.slots == 1 and e.capacity == 2, "Lv 3 unlocks a second slot")
	ok("gust" in up.learnable, "...and with it Gust")
	var lk := BattleEnergy.make("pikachu", 7, ["thunder_shock", "thunderbolt"])
	ok(lk.locked("thunderbolt") and not lk.locked("thunder_shock"), "a known move too big for the bar is locked")
	for t in 5: lk.begin_turn()
	ok(lk.affordable_moves() == ["thunder_shock"], "a locked move is never affordable")
	ok(BattleEnergy.new("bulbasaur", 30).learnable_at(30).has("solar_beam"), "Solar Beam at Lv 30 with 6 slots")
	ok(not BattleEnergy.new("bulbasaur", 5).learnable_at(5).has("razor_leaf"), "no Razor Leaf at Lv 5")

# ---- items: the restore hook ----
func _items() -> void:
	var e := BattleEnergy.make("charmander", 10)   # 3 slots
	e.begin_turn()
	ok(e.available() == 1, "turn 1: one chip")
	var r := []
	e.restored.connect(func(first, kinds): r.assign([first, kinds]))
	ok(e.restore(1, "fire") == 1 and e.chips == ["fire", "fire"], "restore one Fire")
	ok(r.size() == 2 and r[0] == 1 and r[1] == ["fire"], "the restored signal")
	ok(e.restore(5) == 1 and e.available() == 3, "restore stops at capacity")
	ok(e.chips[2] == "colorless", "an untyped restore follows its focus (%s)" % [e.chips])
	ok(e.restore(1) == 0, "nothing past a full bar")
	e.pay(["colorless", "colorless"])
	ok(e.use_item("energy_shard") == 1 and e.chips.back() == "colorless", "Energy Shard: one Colorless")
	ok(e.use_item("full_charge") == 1, "Full Charge fills the rest")
	ok(e.use_item("nonsense") == 0, "an unknown item does nothing")

# ---- the widgets' logic (headless) ----
func _widgets() -> void:
	var host := Control.new()
	host.size = Vector2(1280, 720)
	add_child(host)
	var e := BattleEnergy.make("pidgey", 9)   # 3 slots
	var bar := EnergyBar.new()
	host.add_child(bar)
	bar.bind(e)
	ok(bar.slots_shown() == 3 + bar.show_locked, "the bar shows its slots plus the locked ones")
	e.begin_turn(); e.begin_turn()
	ok(bar.vis.size() == 2, "the bar follows the gain (%d)" % bar.vis.size())
	bar.preview_cost(BattleEnergy.cost_of("gust"))
	ok(bar.hi == [0, 1], "preview lights the chips Gust would use (%s)" % [bar.hi])
	bar.preview_cost(BattleEnergy.cost_of("wing_attack"))
	ok(bar.ghosts.size() >= 1, "an unaffordable preview shows what's missing")
	bar.clear_preview()
	e.use_move("tackle")
	ok(bar.vis.size() == 1 and bar.flying.size() == 1, "a spent chip flies out")
	await _wait(1.2)
	ok(bar.flying.is_empty(), "the flight ends")
	var ml := EnergyMoveList.new()
	ml.size = Vector2(420, 300)
	host.add_child(ml)
	ml.bind(e, e.known)
	var picked := [""]
	ml.picked.connect(func(id): picked[0] = id)
	ok(ml.state_of("tackle") == "ready" and ml.state_of("gust") == "short", "move states: ready, short of energy (%s %s)" % [ml.state_of("tackle"), ml.state_of("gust")])
	ml.pick_id("gust")
	ok(picked[0] == "", "an unaffordable move isn't picked")
	ml.pick_id("tackle")
	ok(picked[0] == "tackle", "an affordable one is")
	var lk := BattleEnergy.make("pikachu", 7, ["thunder_shock", "thunderbolt"])
	ml.bind(lk, lk.known)
	ok(ml.state_of("thunderbolt") == "locked", "a move too big for the bar shows locked")
	host.queue_free()

# ---- the hook: a fake battle, and none at all ----
func _hook() -> void:
	var fake := Node.new()
	fake.set_script(load("res://dev/energy_fake_battle.gd"))
	add_child(fake)
	var h := EnergyHook.attach(fake, {"species": "pidgey", "level": 3})
	ok(h != null and h.foe != null, "attached to the fake battle")
	ok(h.bar != null and h.bar.get_parent() != null, "the foe's bar is in the HUD")
	ok(h.bar.position.is_equal_approx(fake.energy_anchor("foe").position), "the bar sits in the battle's anchor")
	var picks: Array = fake._wild_pick({"turn": 1, "temper": "aggressive"})
	ok(picks.size() == 1 and picks[0].get("kind") == "move", "turn 1: one move dict (%s)" % [picks])
	var picks2: Array = fake._wild_pick({"turn": 2, "temper": "aggressive"})
	ok(picks2.size() == 1 and picks2[0].move == "gust" and picks2[0].cost == ["flying", "colorless"], "turn 2 aggressive: Gust with its cost (%s)" % [picks2])
	ok(h.on_move("gust") and h.foe.available() == 0, "on_move pays the chips")
	ok(not h.on_move("gust"), "and can't pay twice")
	var picks3: Array = fake._wild_pick({"turn": 3, "temper": "flighty"})
	ok(picks3.size() == 2, "flighty (strategic) does two things (%s)" % [picks3])
	ok(EnergyHook.temper_style("aggressive") == "aggressive" and EnergyHook.temper_style("timid") == "evasive", "temper -> style")
	h.detach()
	await _wait(0.6)
	ok(not is_instance_valid(h), "detached and gone")
	fake.queue_free()
	# no battle: it still works, on its own layer
	var lone := EnergyHook.attach(null, {"species": "pidgey", "level": 3})
	add_child(lone)
	ok(lone.wild_pick({}).size() == 1, "no battle: still picks (turn 1)")
	ok(lone.wild_pick({}).size() >= 1, "and counts its own turns")
	lone.queue_free()
	await get_tree().process_frame
