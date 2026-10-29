extends Node
# The battle alpha tester: a text-only, headless simulator that plays many
# hypothetical battles on the real rules (battle/pkmn_battle.gd, energy.gd,
# pkmn_ai.gd: odds-based hits and misses, dodges, locks, two-phase moves, focus,
# disruption, Locked In, Speed interleaving) with the Kanto 151 dataset, and
# measures the meta against kanto151_balance.json sim_targets. A dev tool only:
# nothing in the game calls it.
#   godot --headless --path native res://dev/battle_sim.tscn -- [flags]
# Flags:
#   --suite=all | tiers | cross | evo | level | slots | starters | policies (comma list)
#   --n=12               battles per pairing (sides alternate)
#   --seed=1             the base seed (each battle seeds from it, so a run repeats)
#   --bands=6,14,22,32,45  the levels the tier round-robins and cross checks use
#   --tiers=common,uncommon,rare,very_rare,legendary   tiers for the round-robins
#   --ai=balanced        the personality both sides use (cautious | aggressive | balanced | tricky)
#   --policies=balanced,cautious,aggressive,tricky,greedy,combo,reaction   (the policies suite)
#   --max_turns=30       a battle still going after this is a draw (half a win each)
#   --species=a,b,...    limit the round-robins to these species
#   --report=res://dev/sim_report.json   where the results go (JSON)
#   --quiet              less printing
# The report: per suite, win rates with 95% intervals (Wilson), battle length,
# per-species performance against its tier peers and the flags against the
# targets, and the move-usage distribution (distinct moves in real use, the
# share of finishers, reactions, two-phase moves and every role and tier, the
# most-used move's share per species).

const RARITIES := ["common", "uncommon", "rare", "very_rare", "legendary"]
const ROLES := ["offense", "reaction", "two_phase", "disruption", "utility"]
const TIERS := ["opener", "mid", "finisher"]
const PERSONALITIES := ["cautious", "aggressive", "balanced", "tricky"]

var opt := {}
var S: Dictionary            # species data (the live dataset)
var T: Dictionary            # sim_targets
var seed_base := 1
var battles := 0
var usage := {}              # species -> {move: n}
var role_n := {}
var tier_n := {}
var actions := 0
var events_n := {}
var turns_all: Array = []
var t0 := 0

func _ready() -> void:
	_run.call_deferred()

func _args() -> void:
	opt = {"suite": "all", "n": "12", "seed": "1", "bands": "6,14,22,32,45", "tiers": ",".join(RARITIES), "ai": "balanced",
		"policies": "balanced,cautious,aggressive,tricky,greedy,combo,reaction", "max_turns": "30", "species": "", "opponents": "0", "overstay": "3", "cross_pairs": "70",
		"report": "res://dev/sim_report.json", "quiet": "false"}
	for a in OS.get_cmdline_user_args():
		var s := String(a).trim_prefix("--")
		var i := s.find("=")
		if i < 0: opt[s] = "true"
		else: opt[s.substr(0, i)] = s.substr(i + 1)
	seed_base = int(opt.seed)

func _list(k: String) -> Array:
	var out := []
	for x in String(opt.get(k, "")).split(",", false): out.append(x.strip_edges())
	return out

func say(s: String) -> void:
	if opt.get("quiet", "false") != "true": print(s)

func _run() -> void:
	_args()
	t0 = Time.get_ticks_msec()
	BattleConfig.reset()
	BattleEnergy.set_dataset("kanto")
	S = BattleEnergy.data().get("species", {})
	var bal = JSON.parse_string(FileAccess.get_file_as_string("res://life/kanto151_balance.json"))
	T = bal.get("sim_targets", {}) if bal is Dictionary else {}
	var suites := _list("suite")
	if "all" in suites: suites = ["tiers", "cross", "evo", "level", "slots", "starters", "policies"]
	var report := {"opts": opt, "suites": {}, "targets": T}
	for su in suites:
		var t1 := Time.get_ticks_msec()
		match su:
			"tiers": report.suites.tiers = _suite_tiers()
			"cross": report.suites.cross = _suite_cross()
			"evo": report.suites.evo = _suite_evo()
			"level": report.suites.level = _suite_level()
			"slots": report.suites.slots = _suite_slots()
			"starters": report.suites.starters = _suite_starters()
			"policies": report.suites.policies = _suite_policies()
			"one": report.suites.one = _suite_one()
		say("[%s] %.1fs" % [su, (Time.get_ticks_msec() - t1) / 1000.0])
	report["moves"] = _move_report()
	report["battles"] = battles
	report["turns"] = _stats(turns_all)
	report["events"] = events_n
	report["seconds"] = (Time.get_ticks_msec() - t0) / 1000.0
	report["checks"] = _checks(report)
	var path := String(opt.report)
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f: f.store_string(JSON.stringify(report, "  ", false)); f.close()
	print("battle_sim: %d battles in %.1fs, %d targets missed of %d; report %s" % [battles, report.seconds, report.checks.missed, report.checks.total, path])
	get_tree().quit(0)

# ---------------------------------------------------------------- one battle
# a ready Pokemon: every level-up move it knows by lv (a trainer personality's also its TM
# and tutor moves, battle_config trainer_moves), a balanced loadout in its slots
func make_energy(sp: String, lv: int, slot_delta := 0, policy := "") -> BattleEnergy:
	var e := BattleEnergy.make_trained(sp, lv) if policy in PERSONALITIES else BattleEnergy.make(sp, lv)
	var slots := maxi(1, e.slots + slot_delta)
	e.equipped = e.balanced_loadout(slots)
	e.set_focus(float(e.params.get("start", 20.0)), "start")
	return e

class Spec:
	var sp := ""
	var lv := 1
	var policy := "balanced"
	var slot_delta := 0

func spec(sp: String, lv: int, policy := "", slot_delta := 0) -> Spec:
	var s := Spec.new()
	s.sp = sp; s.lv = lv; s.policy = policy if policy != "" else String(opt.ai); s.slot_delta = slot_delta
	return s

# plays one battle; returns {winner: 0 (x) | 1 (y) | 0.5, turns, x_hp, y_hp}
func battle(x: Spec, y: Spec, k: int) -> Dictionary:
	var swap := k % 2 == 1
	var A := y if swap else x
	var Bs := x if swap else y
	var ea := make_energy(A.sp, A.lv, A.slot_delta, A.policy)
	var eb := make_energy(Bs.sp, Bs.lv, Bs.slot_delta, Bs.policy)
	var bt := PkmnBattle.new({"a": {"energy": ea, "ai": _ai_name(A.policy)}, "b": {"energy": eb, "ai": _ai_name(Bs.policy)},
		"kind": "trainer", "seed": seed_base * 7919 + battles * 31 + k})
	battles += 1
	bt.start()
	var maxt := int(opt.max_turns)
	var t := 0
	var pol := {"a": A.policy, "b": Bs.policy}
	while not bt.over and t < maxt:
		bt.begin_turn()
		for s in ["a", "b"]:
			if bt.needs_pick(s): bt.pick_pool(s)
			_queue(bt, s, String(pol[s]))
		for ev in bt.resolve(): _note(bt, ev)
		t += 1
	turns_all.append(t)
	var w := 0.5
	if bt.over:
		if bt.outcome == "won": w = 0.0      # side a won
		elif bt.outcome == "lost": w = 1.0
		else: w = 0.5
	else:
		# a draw at the cap: the healthier side gets the edge? no: a draw is a draw
		w = 0.5
	# w: 0 = side a won; turn it into x's result
	var x_won := 1.0 - w if not swap else w
	return {"x": x_won, "turns": t}

func _ai_name(policy: String) -> String:
	if policy in PERSONALITIES: return policy
	return "balanced"

# a player policy (or a trainer personality through PkmnAI)
func _queue(bt: PkmnBattle, s: String, policy: String) -> void:
	if policy in PERSONALITIES:
		bt.ai_queue(s)
		return
	var me = bt.fighter(s)
	var foe = bt.fighter(bt.other(s))
	var e: BattleEnergy = me.e
	if me.fainted() or me.status == "sleep": return
	var ids: Array = e.usable().filter(func(id): return bt.can_queue(s, id))
	if ids.is_empty(): return
	var stx := PkmnAI.state_ctx(bt, s)
	var ctx := {"uses": me.uses, "rng": bt.rng, "jitter": 0.1, "move_bonus": {}, "exclude": [], "foe": stx.foe, "me": stx.me}
	var style := "strategic"
	match policy:
		"greedy":
			# raw damage now: no reactions, no set-up
			style = "aggressive"
			ctx.reaction_value = 0.0
			for id in ids:
				var m := BattleEnergy.move(id)
				if float(m.get("power", 0)) <= 0.0: ctx.exclude.append(id)
		"combo":
			# sets up what its moves pay off: sleep before Dream Eater, sun before Solar Beam, rain before Thunder,
			# a matching type before Flare Combo; disruption on a high-focus foe
			for id in ids:
				var m := BattleEnergy.move(id)
				var c = m.get("combo", null)
				if c is Dictionary:
					var after: Array = c.get("after", [])
					if after.any(func(a): return int(me.uses.get(a, 0)) > 0) or (String(c.get("effect", "")) == "enables" and foe.status == "sleep"):
						ctx.move_bonus[id] = 45.0
					else:
						for a in after:
							if a in ids: ctx.move_bonus[a] = float(ctx.move_bonus.get(a, 0.0)) + 25.0
				if "sleep_only" in m.get("effects", []) and foe.status != "sleep": ctx.exclude.append(id)
				if String(m.get("role", "")) == "disruption" and foe.e.focus >= 60.0: ctx.move_bonus[id] = float(ctx.move_bonus.get(id, 0.0)) + 20.0
			ctx.reaction_value = 20.0
		"reaction":
			# reads the foe: a reaction whenever the foe can strike
			ctx.reaction_value = 75.0 if (foe.e.available() > 0 or not foe.e.commit.is_empty()) else 0.0
			style = "strategic"
	for id in e.plan_turn(ids, style, ctx):
		bt.queue(s, id)

func _note(bt: PkmnBattle, ev: Dictionary) -> void:
	var t := String(ev.get("t", ""))
	events_n[t] = int(events_n.get(t, 0)) + 1
	if t == "move":
		var f = bt.fighter(String(ev.side))
		var id := String(ev.move)
		var m := BattleEnergy.move(id)
		var u: Dictionary = usage.get(f.species, {})
		u[id] = int(u.get(id, 0)) + 1
		usage[f.species] = u
		var r := String(m.get("role", "offense"))
		role_n[r] = int(role_n.get(r, 0)) + 1
		var ti := BattleEnergy.tier_of(id)
		tier_n[ti] = int(tier_n.get(ti, 0)) + 1
		actions += 1

# ---------------------------------------------------------------- numbers
func wilson(w: float, n: int) -> Array:
	if n <= 0: return [0.0, 1.0]
	var p := w / n
	var z := 1.96
	var d := 1.0 + z * z / n
	var c := (p + z * z / (2.0 * n)) / d
	var h := z * sqrt(p * (1.0 - p) / n + z * z / (4.0 * n * n)) / d
	return [maxf(0.0, c - h), minf(1.0, c + h)]

func _stats(a: Array) -> Dictionary:
	if a.is_empty(): return {"n": 0}
	var s := 0.0
	for x in a: s += float(x)
	var srt := a.duplicate(); srt.sort()
	return {"n": a.size(), "mean": s / a.size(), "median": srt[srt.size() / 2], "p10": srt[int(srt.size() * 0.1)], "p90": srt[mini(srt.size() - 1, int(srt.size() * 0.9))]}

func pair(x: Spec, y: Spec, n: int) -> Dictionary:
	var w := 0.0
	var tt := 0.0
	for k in n:
		var r := battle(x, y, k)
		w += float(r.x); tt += float(r.turns)
	var ci := wilson(w, n)
	return {"x": x.sp, "y": y.sp, "x_lv": x.lv, "y_lv": y.lv, "n": n, "x_rate": w / n, "ci": ci, "turns": tt / n}

# species met around level lv: it has reached its stage and hasn't long outgrown it
func met_at(sp: String, lv: int) -> bool:
	var r: Dictionary = S[sp]
	var evo: Dictionary = r.get("evolution", {})
	var lo := int(evo.get("level", 0)) if evo.get("from", null) != null else int(r.get("wild_levels", [1, 5])[0])
	if lv < lo: return false
	var hi := 100
	for c in evo.get("into", []):
		hi = mini(hi, int(S[c].evolution.get("level", 100)) + int(opt.get("overstay", "3")))
	return lv <= hi

func _species_filter() -> Array:
	var only := _list("species")
	var out := []
	for id in S:
		if only.is_empty() or id in only: out.append(id)
	return out

# ---------------------------------------------------------------- suites
func _suite_tiers() -> Dictionary:
	var n := int(opt.n)
	var out := {"bands": {}, "species": {}}
	var per := {}     # species -> [wins, games, [band rates]]
	for band in _list("bands"):
		var lv := int(band)
		var bo := {}
		for tg in _tier_groups():
			var tier: String = tg[0]
			var grp: String = tg[1]
			var ids := _species_filter().filter(func(id): return String(S[id].rarity) == tier and String(S[id].get("stat_group", "")) in grp.split("+") and met_at(id, lv))
			if ids.size() < 2: continue
			var rows := []
			var score := {}
			for id in ids: score[id] = [0.0, 0]
			# every pair, or (--opponents=K) a circulant sample: each species meets K peers
			var plist := []
			var K := int(opt.get("opponents", "0"))
			if K <= 0 or K >= ids.size() - 1:
				for i in ids.size():
					for j in range(i + 1, ids.size()): plist.append([i, j])
			else:
				for i in ids.size():
					for d in range(1, K / 2 + 1): plist.append([i, (i + d) % ids.size()])
			for pj in plist:
				var i: int = pj[0]
				var j: int = pj[1]
				if true:
					var r := pair(spec(ids[i], lv), spec(ids[j], lv), n)
					rows.append(r)
					score[ids[i]][0] += r.x_rate * n; score[ids[i]][1] += n
					score[ids[j]][0] += (1.0 - r.x_rate) * n; score[ids[j]][1] += n
			var rates := {}
			var lo := 1.0
			var hi := 0.0
			for id in ids:
				var rr: float = score[id][0] / maxf(1.0, score[id][1])
				rates[id] = {"rate": rr, "ci": wilson(score[id][0], score[id][1]), "games": score[id][1]}
				if not id in T.get("exempt", []): lo = minf(lo, rr); hi = maxf(hi, rr)
				var p: Array = per.get(id, [0.0, 0, []])
				p[0] += score[id][0]; p[1] += score[id][1]; p[2].append({"band": lv, "rate": rr})
				per[id] = p
			# the spread: the 10th to the 90th percentile of the peers' rates (the extremes of
			# many noisy rates overstate it); the range is the full max - min
			var rl: Array = []
			for id in ids:
				if not id in T.get("exempt", []): rl.append(rates[id].rate)
			rl.sort()
			var spread := 0.0
			if rl.size() >= 2: spread = rl[mini(rl.size() - 1, int(round((rl.size() - 1) * 0.9)))] - rl[int(round((rl.size() - 1) * 0.1))]
			bo[tier + "/" + grp] = {"species": rates, "spread": spread, "range": hi - lo, "best": _argmax(rates, true), "worst": _argmax(rates, false), "pairs": rows.size()}
			var bk := tier + "/" + grp
			say("tiers Lv %d %s: %d species, spread %.2f (best %s %.2f, worst %s %.2f)" % [lv, bk, ids.size(), spread,
				bo[bk].best, rates[bo[bk].best].rate, bo[bk].worst, rates[bo[bk].worst].rate])
		out.bands[str(lv)] = bo
	for id in per:
		out.species[id] = {"rarity": S[id].rarity, "rate": per[id][0] / maxf(1.0, per[id][1]), "games": per[id][1], "bands": per[id][2]}
	return out

# peers: the same rarity and the same place in a line (a basic form meets basic forms;
# finals and single-stage species share a pool)
func _tier_groups() -> Array:
	var out := []
	for t in _list("tiers"):
		for g in ["basic", "middle", "final+single"]: out.append([t, g])
	return out

func _argmax(rates: Dictionary, best: bool) -> String:
	var k := ""
	var v := -1.0 if best else 2.0
	for id in rates:
		var r: float = rates[id].rate
		if (best and r > v) or (not best and r < v): v = r; k = id
	return k

func _suite_cross() -> Dictionary:
	var n := int(opt.n)
	var out := {}
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_base
	for band in _list("bands"):
		var lv := int(band)
		var bo := {}
		for i in RARITIES.size() - 1:
			var lo_ids := _species_filter().filter(func(id): return String(S[id].rarity) == RARITIES[i] and met_at(id, lv))
			var hi_ids := _species_filter().filter(func(id): return String(S[id].rarity) == RARITIES[i + 1] and met_at(id, lv))
			if lo_ids.is_empty() or hi_ids.is_empty(): continue
			var w := 0.0
			var g := 0
			# like against like: the same place in a line (basic, middle, final, single)
			var pairs_ok := []
			for a0 in hi_ids:
				for b0 in lo_ids:
					if String(S[a0].get("stat_group", "")) == String(S[b0].get("stat_group", "")): pairs_ok.append([a0, b0])
			if pairs_ok.is_empty(): continue
			# every like-for-like pair, or a seeded sample of cross_pairs of them
			var k := mini(int(opt.cross_pairs), pairs_ok.size())
			var prs := []
			for j in range(pairs_ok.size() - 1, 0, -1):
				var x := rng.randi() % (j + 1)
				var tmp: Array = pairs_ok[j]; pairs_ok[j] = pairs_ok[x]; pairs_ok[x] = tmp
			for j in k:
				var pp: Array = pairs_ok[j]
				var a: String = pp[0]
				var b: String = pp[1]
				var r := pair(spec(a, lv), spec(b, lv), maxi(2, n / 2))
				w += r.x_rate * r.n; g += r.n
				prs.append([a, b, r.x_rate])
			bo["%s>%s" % [RARITIES[i + 1], RARITIES[i]]] = {"rate": w / g, "ci": wilson(w, g), "games": g, "pairs": prs}
			say("cross Lv %d %s vs %s: %.2f" % [lv, RARITIES[i + 1], RARITIES[i], w / g])
		out[str(lv)] = bo
	return out

func _suite_evo() -> Dictionary:
	var n := int(opt.n)
	var rows := []
	var w := 0.0
	var g := 0
	for id in _species_filter():
		var e: Dictionary = S[id].evolution
		if e.get("from", null) == null: continue
		var lv := clampi(int(e.get("level", 20)), 5, 70)
		var r := pair(spec(id, lv), spec(String(e.from), lv), n)
		rows.append(r)
		w += r.x_rate * n; g += n
	say("evo: evolved forms win %.2f over their previous stage (%d pairs)" % [w / maxf(1, g), rows.size()])
	return {"rate": w / maxf(1, g), "ci": wilson(w, g), "pairs": rows}

func _suite_level() -> Dictionary:
	var n := int(opt.n)
	var rows := []
	var w := 0.0
	var g := 0
	var step := int(T.get("level_step_winrate", {}).get("per_levels", 10))
	for id in _species_filter():
		var r0: Dictionary = S[id]
		for lv in [15, 30, 45]:
			if not met_at(id, lv) or not met_at(id, lv - step): continue
			var r := pair(spec(id, lv), spec(id, lv - step), maxi(2, n / 2))
			rows.append(r)
			w += r.x_rate * r.n; g += r.n
	say("level: +%d levels wins %.2f (%d pairs)" % [step, w / maxf(1, g), rows.size()])
	return {"rate": w / maxf(1, g), "ci": wilson(w, g), "pairs": rows}

func _suite_slots() -> Dictionary:
	var n := int(opt.n)
	var rows := []
	var w := 0.0
	var g := 0
	for id in _species_filter():
		for lv in [10, 25, 40]:
			if not met_at(id, lv): continue
			var r := pair(spec(id, lv, "", 0), spec(id, lv, "", -1), maxi(2, n / 2))
			rows.append(r)
			w += r.x_rate * r.n; g += r.n
	say("slots: one more slot wins %.2f (%d pairs)" % [w / maxf(1, g), rows.size()])
	return {"rate": w / maxf(1, g), "ci": wilson(w, g), "pairs": rows}

func _suite_starters() -> Dictionary:
	var n := maxi(20, int(opt.n) * 2)
	var out := {}
	for set in [[["bulbasaur", 8], ["charmander", 8], ["squirtle", 8]], [["ivysaur", 22], ["charmeleon", 22], ["wartortle", 22]], [["venusaur", 40], ["charizard", 40], ["blastoise", 40]]]:
		var a: Array = set
		var r1 := pair(spec(a[1][0], a[1][1]), spec(a[0][0], a[0][1]), n)    # fire vs grass
		var r2 := pair(spec(a[2][0], a[2][1]), spec(a[1][0], a[1][1]), n)    # water vs fire
		var r3 := pair(spec(a[0][0], a[0][1]), spec(a[2][0], a[2][1]), n)    # grass vs water
		out[str(a[0][1])] = {"fire_beats_grass": r1, "water_beats_fire": r2, "grass_beats_water": r3}
		say("starters Lv %d: fire>grass %.2f, water>fire %.2f, grass>water %.2f" % [a[0][1], r1.x_rate, r2.x_rate, r3.x_rate])
	return out

# every policy against the balanced personality, over a spread of matchups; move diversity per policy
func _suite_policies() -> Dictionary:
	var n := maxi(2, int(opt.n) / 2)
	var out := {}
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_base + 99
	var pool := _species_filter().filter(func(id): return String(S[id].rarity) in ["common", "uncommon", "rare"] and met_at(id, 22))
	var pairs := []
	for i in 30: pairs.append([pool[rng.randi() % pool.size()], pool[rng.randi() % pool.size()]])
	for pol in _list("policies"):
		var w := 0.0
		var g := 0
		var before_u := usage.duplicate(true)
		var before_r := role_n.duplicate()
		var mine := {}
		for p in pairs:
			var r := pair(spec(p[0], 22, pol), spec(p[1], 22, "balanced"), n)
			w += r.x_rate * n; g += n
		out[pol] = {"rate_vs_balanced": w / g, "ci": wilson(w, g), "games": g}
		say("policy %s vs balanced: %.2f" % [pol, w / g])
	return out

# one matchup, logged turn by turn (--a=, --b=, --lv=): for reading what the AI does
func _suite_one() -> Dictionary:
	var lv := int(opt.get("lv", "10"))
	var ea := make_energy(String(opt.get("a", "charmander")), lv, 0, String(opt.ai))
	var eb := make_energy(String(opt.get("b", "bulbasaur")), lv, 0, String(opt.ai))
	print("A %s equips %s; B %s equips %s" % [ea.species, ea.equipped, eb.species, eb.equipped])
	var bt := PkmnBattle.new({"a": {"energy": ea, "ai": String(opt.ai)}, "b": {"energy": eb, "ai": String(opt.ai)}, "kind": "trainer", "seed": seed_base})
	bt.start()
	var t := 0
	while not bt.over and t < int(opt.max_turns):
		var t1 := Time.get_ticks_usec()
		bt.begin_turn()
		for s in ["a", "b"]:
			if bt.needs_pick(s): bt.pick_pool(s)
			_queue(bt, s, String(opt.ai))
		var t2 := Time.get_ticks_usec()
		for ev in bt.resolve(): print("   ", ev.get("text", ""))
		print("turn %d: plan %.1f ms, resolve %.1f ms" % [t + 1, (t2 - t1) / 1000.0, (Time.get_ticks_usec() - t2) / 1000.0])
		t += 1
	return {"outcome": bt.outcome, "turns": t}

# ---------------------------------------------------------------- moves
func _move_report() -> Dictionary:
	var total := {}
	for sp in usage:
		for id in usage[sp]: total[id] = int(total.get(id, 0)) + int(usage[sp][id])
	var used := total.keys().size()
	var real := 0
	for id in total:
		if float(total[id]) / maxf(1.0, actions) >= 0.002: real += 1
	var top := total.keys()
	top.sort_custom(func(a, b): return total[a] > total[b])
	var top_rows := []
	for id in top.slice(0, 15): top_rows.append({"move": id, "share": float(total[id]) / maxf(1.0, actions)})
	# per species: distinct moves used, the top move's share
	var per := {}
	var dom := []
	for sp in usage:
		var u: Dictionary = usage[sp]
		var n := 0
		var best := ""
		var bv := 0
		for id in u:
			n += int(u[id])
			if int(u[id]) > bv: bv = int(u[id]); best = id
		per[sp] = {"actions": n, "distinct": u.size(), "top": best, "top_share": float(bv) / maxf(1.0, n)}
		if n >= 30 and float(bv) / n > float(T.get("move_pick_share_max", 0.35)): dom.append({"species": sp, "move": best, "share": float(bv) / n})
	dom.sort_custom(func(a, b): return a.share > b.share)
	var roles := {}
	for r in ROLES: roles[r] = float(role_n.get(r, 0)) / maxf(1.0, actions)
	var tiers := {}
	for t in TIERS: tiers[t] = float(tier_n.get(t, 0)) / maxf(1.0, actions)
	var sh: Array = per.values().map(func(x): return x.top_share)
	return {"actions": actions, "distinct_used": used, "distinct_real_use": real, "role_share": roles, "tier_share": tiers,
		"top": top_rows, "dominant": dom.slice(0, 25), "species_top_share": _stats(sh), "per_species": per}

# ---------------------------------------------------------------- targets
func _checks(rep: Dictionary) -> Dictionary:
	var out := {"total": 0, "missed": 0, "items": []}
	var add := func(name: String, val: float, lo: float, hi: float):
		out.total += 1
		var okk: bool = val >= lo and val <= hi
		if not okk: out.missed += 1
		out.items.append({"check": name, "value": val, "min": lo, "max": hi, "ok": okk})
	var su: Dictionary = rep.suites
	if su.has("tiers"):
		var wt: Dictionary = T.get("within_tier_winrate", {})
		for band in su.tiers.bands:
			for tier in su.tiers.bands[band]:
				var b: Dictionary = su.tiers.bands[band][tier]
				if tier.split("/")[0] in wt.get("applies_to", []):
					if b.species.size() >= 4: add.call("spread Lv %s %s" % [band, tier], b.spread, 0.0, float(T.get("within_tier_spread_max", 0.2)))
					for id in b.species:
						var r: float = b.species[id].rate
						var ci: Array = b.species[id].ci
						# out of band only when the interval clears the band
						if not id in T.get("exempt", []) and (ci[0] > float(wt.get("max", 0.6)) or ci[1] < float(wt.get("min", 0.4))):
							add.call("peer rate Lv %s %s %s" % [band, tier, id], r, float(wt.get("min", 0.4)), float(wt.get("max", 0.6)))
	if su.has("cross"):
		var rs: Dictionary = T.get("rarity_step_winrate", {})
		for band in su.cross:
			for k in su.cross[band]: add.call("rarity step Lv %s %s" % [band, k], su.cross[band][k].rate, float(rs.get("min", 0.55)), float(rs.get("max", 0.68)))
	if su.has("evo"):
		var es: Dictionary = T.get("evolution_step_winrate", {})
		add.call("evolution step", su.evo.rate, float(es.get("min", 0.62)), float(es.get("max", 0.8)))
	if su.has("level"):
		var ls: Dictionary = T.get("level_step_winrate", {})
		add.call("level step", su.level.rate, float(ls.get("min", 0.6)), float(ls.get("max", 0.78)))
	if su.has("slots"):
		add.call("slot unlock", su.slots.rate, float(T.get("slot_unlock_winrate", {}).get("min", 0.6)), 1.0)
	if su.has("starters"):
		var st: Dictionary = T.get("starter_triangle", {"min": 0.55, "max": 0.85})
		for lv in su.starters:
			for k in su.starters[lv]: add.call("starters Lv %s %s" % [lv, k], float(su.starters[lv][k].x_rate), float(st.min), float(st.max))
	var bt: Dictionary = T.get("battle_turns", {})
	if rep.turns.has("mean"): add.call("battle turns (mean)", rep.turns.mean, float(bt.get("min", 3)), float(bt.get("max", 8)))
	add.call("top move share (median species)", float(rep.moves.species_top_share.get("median", 0.0)), 0.0, float(T.get("move_pick_share_max", 0.35)))
	var RT: Dictionary = T.get("role_share", {})
	var TT: Dictionary = T.get("tier_share", {})
	for r in ROLES: add.call("role share %s" % r, float(rep.moves.role_share[r]), float(RT.get(r, {}).get("min", T.get("role_share_min", 0.03))), float(RT.get(r, {}).get("max", 1.0)))
	for t in TIERS: add.call("tier share %s" % t, float(rep.moves.tier_share[t]), float(TT.get(t, {}).get("min", T.get("tier_share_min", 0.08))), float(TT.get(t, {}).get("max", 1.0)))
	return out
