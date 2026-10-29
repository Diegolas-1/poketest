extends Node
# Dev test for the Kanto 151 move design (energy v2): life/kanto151.json (species,
# the pokemon.json schema), life/moves_kanto.json (moves and skills, the moves.json
# schema), life/kanto151_balance.json (the design numbers). Headless; exits 0 when green:
#   godot --headless --path native res://dev/kanto151_test.tscn
# Checks: all 151 with valid fields and an opener, a mid and a finisher each (payable
# from their own pools); every move id exists and every cost is valid (finishers take
# all chips); every two-phase move has an answer someone in the dex can learn, and the
# counter table holds; energy classes exist; learn levels are 1 to 100 and evolutions
# inherit; move powers follow the balance formulas and the power per chip climbs with
# rarity; every effect tag is defined; no long dashes anywhere. Then it installs the
# dataset into the engine (Kanto151Data) and plays a few real battles in PkmnBattle.
# Prints summary stats.

const SPECIES_PATH := "res://life/kanto151.json"
const MOVES_PATH := "res://life/moves_kanto.json"
const BALANCE_PATH := "res://life/kanto151_balance.json"
const RARITIES := ["common", "uncommon", "rare", "very_rare", "legendary"]
const ROLES := ["offense", "reaction", "two_phase", "disruption", "utility"]
const TIERS := ["opener", "mid", "finisher"]
const CATEGORIES := ["physical", "special", "status"]
const AI_STYLES := ["aggressive", "strategic", "evasive"]
const SEMIS := ["underground", "airborne", "underwater", "charging"]
const UNREACHABLE := ["underground", "airborne", "underwater"]
const SPECIES_KEYS := ["dex", "name", "types", "energy", "rarity", "weakness", "resistance", "base", "wild_levels",
	"learnset", "tm", "tutor", "egg", "ai", "focus_profile", "tcg", "evolution", "start", "openers", "mids", "finishers",
	"signature", "skills", "off_pool"]
const MOVE_KEYS := ["name", "type", "energy", "category", "role", "tier", "cost", "power", "accuracy", "priority",
	"effects", "anim", "desc", "rarity", "signature", "disrupt", "power_mods", "source"]
# optional keys (left out when they have no value): chance, owner, fixed_damage, two_phase, counters, reaction, combo

var fails := 0
var checks := 0
var fail_lines := 0

var SP: Dictionary
var S: Dictionary
var M: Dictionary
var SK: Dictionary
var B: Dictionary
var learnable := {}     # move id -> true when some species can learn it

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c:
		fails += 1
		fail_lines += 1
		if fail_lines <= 60: printerr("FAIL: " + what)

func _ready() -> void:
	_run.call_deferred()

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var v = JSON.parse_string(FileAccess.get_file_as_string(path))
	return v if v is Dictionary else {}

func _run() -> void:
	SP = _load(SPECIES_PATH)
	var mv := _load(MOVES_PATH)
	B = _load(BALANCE_PATH)
	ok(not SP.is_empty() and not mv.is_empty() and not B.is_empty(), "the three files load")
	S = SP.get("species", {})
	M = mv.get("moves", {})
	SK = mv.get("skills", {})
	ok(SP.has("_schema") and mv.has("_schema") and B.has("_schema"), "each file has a _schema block")
	for k in ["energy_types", "type_energy", "energy_names", "type_chart"]:
		ok(SP.has(k), "kanto151.json carries pokemon.json's %s (a drop-in dataset)" % k)
	for id in S:
		for m in _all_moves(S[id]): learnable[m] = true
	_species()
	_moves()
	_two_phase()
	_evolutions()
	_curves()
	_dashes(SP, "kanto151.json")
	_dashes(mv, "moves_kanto.json")
	_dashes(B, "kanto151_balance.json")
	_summary()
	_engine()
	print("kanto151_test: %d checks, %d failures" % [checks, fails])
	print("KANTO151 TEST GREEN" if fails == 0 else "KANTO151 TEST RED")
	get_tree().quit(0 if fails == 0 else 1)

func _all_moves(r: Dictionary) -> Array:
	var seen := {}
	var out := []
	for row in r.get("learnset", []):
		var id := String(row.get("move", ""))
		if not seen.has(id): seen[id] = true; out.append(id)
	for k in ["tm", "egg"]:
		for m in r.get(k, []):
			if not seen.has(String(m)): seen[String(m)] = true; out.append(String(m))
	return out

func _n_chips(m: Dictionary) -> int:
	var c = m.get("cost")
	if c is Dictionary: return int(c.get("min", 0))
	return (c as Array).size() if c is Array else 0

func _payable(m: Dictionary, pools: Array) -> bool:
	var c = m.get("cost")
	if c is Dictionary: return String(c.get("type", "")) in pools
	for k in c:
		if not String(k) in pools: return false
	return true

func _deals_damage(m: Dictionary) -> bool:
	return m.category != "status" and m.role != "reaction"

# ---------------------------------------------------------------- species
func _species() -> void:
	ok(S.size() == 151, "151 species (%d)" % S.size())
	var pools: Dictionary = B.get("energy_names", {})
	var tmap: Dictionary = SP.get("type_energy", {})
	var dexes := {}
	for id in S:
		var r: Dictionary = S[id]
		for k in SPECIES_KEYS:
			ok(r.has(k), "%s has %s" % [id, k])
		dexes[int(r.get("dex", 0))] = id
		ok(String(r.get("name", "")) != "", "%s has a name" % id)
		var types: Array = r.get("types", [])
		ok(types.size() >= 1 and types.size() <= 2, "%s has 1 or 2 types" % id)
		ok(String(r.get("rarity", "")) in RARITIES, "%s rarity %s" % [id, r.get("rarity")])
		ok(String(r.get("ai", "")) in AI_STYLES, "%s ai %s" % [id, r.get("ai")])
		ok((r.get("base", []) as Array).size() == 6, "%s: base has six stats" % id)
		var wl: Array = r.get("wild_levels", [])
		ok(wl.size() == 2 and int(wl[0]) >= 1 and int(wl[1]) <= 100 and int(wl[0]) <= int(wl[1]), "%s: wild_levels %s" % [id, wl])
		# pools: its types' energy kinds then Colorless, as the engine builds them
		var en: Array = r.get("energy", [])
		var want := []
		for t in types:
			var k := String(tmap.get(String(t), String(t)))
			if k != "colorless" and not k in want: want.append(k)
		want.append("colorless")
		ok(en == want, "%s: energy %s is what the engine builds (%s)" % [id, en, want])
		for e in en:
			ok(pools.has(String(e)), "%s: energy class %s exists" % [id, e])
		ok(pools.has(String(r.tcg.type)), "%s: its card type %s is an energy class" % [id, r.tcg.type])
		ok(String(r.tcg.type) in en, "%s: its card type %s is one of its pools" % [id, r.tcg.type])
		var w: Array = r.get("weakness", [])
		if w.is_empty():
			ok(String(r.tcg.type) == "dragon", "%s: only the Dragon cards go without a Weakness" % id)
		for x in w + (r.get("resistance", []) as Array):
			ok(pools.has(String(x)), "%s: weakness / resistance kind %s" % [id, x])
		var f: Dictionary = r.get("focus_profile", {})
		ok(float(f.get("gain", 0)) > 0 and float(f.get("gain", 0)) <= 25, "%s: focus gain %s" % [id, f.get("gain")])
		ok(float(f.get("start", -1)) >= 0 and float(f.get("start", 0)) < 100, "%s: focus start" % id)
		ok(float(f.get("step", 0)) >= 10 and float(f.get("step", 0)) <= 50, "%s: focus step" % id)
		ok(int(f.get("chip_cap", 0)) >= 3 and int(f.get("chip_cap", 0)) <= 8, "%s: chip_cap" % id)
		ok(float(f.get("disrupt_resist", -1)) >= 0.0 and float(f.get("disrupt_resist", 1)) <= 0.6, "%s: disrupt_resist" % id)
		var rows: Array = r.get("learnset", [])
		ok(not rows.is_empty(), "%s has a learnset" % id)
		var prev := 0
		for row in rows:
			var lv := int(row.get("level", 0))
			ok(lv >= 1 and lv <= 100, "%s: %s learned at level %d (1 to 100)" % [id, row.get("move"), lv])
			ok(lv >= prev, "%s: learnset in level order" % id)
			prev = lv
		for m in r.get("tutor", []):
			ok(m in r.get("tm", []), "%s: tutor move %s is also in tm (the engine teaches from tm)" % [id, m])
		for m in _all_moves(r):
			ok(M.has(m), "%s: move %s exists" % [id, m])
		for key in ["start", "openers", "mids", "finishers", "signature", "off_pool"]:
			for m in r.get(key, []):
				ok(M.has(String(m)), "%s: %s move %s exists" % [id, key, m])
		for k in r.get("skills", []):
			ok(SK.has(String(k)), "%s: skill %s exists" % [id, k])
		ok(not (r.get("start", []) as Array).is_empty(), "%s knows a move at level 1" % id)
		for pair in [["openers", "opener"], ["mids", "mid"], ["finishers", "finisher"]]:
			var good := 0
			for m in r.get(pair[0], []):
				var mm: Dictionary = M.get(String(m), {})
				ok(String(mm.get("tier", "")) == pair[1], "%s: %s listed as %s is a %s" % [id, m, pair[1], mm.get("tier")])
				if mm.get("role", "") in ["offense", "two_phase", "disruption"] and _payable(mm, en) and _deals_damage(mm): good += 1
			ok(good >= 1, "%s has a damaging %s it can pay from its own pools (%d)" % [id, pair[1], good])
		for m in r.get("off_pool", []):
			ok(not _payable(M.get(String(m), {}), en), "%s: off_pool %s really needs a pool it lacks" % [id, m])
	for d in range(1, 152):
		ok(dexes.has(d), "Pokédex #%d present" % d)

# ---------------------------------------------------------------- moves
func _moves() -> void:
	var pools: Dictionary = B.get("energy_names", {})
	var effects: Dictionary = B.get("effects", {})
	var tmap: Dictionary = SP.get("type_energy", {})
	for id in M:
		var m: Dictionary = M[id]
		for k in MOVE_KEYS:
			ok(m.has(k), "move %s has %s" % [id, k])
		ok(String(m.get("name", "")) != "" and String(m.get("desc", "")) != "", "move %s has a name and a line" % id)
		ok(String(m.get("category", "")) in CATEGORIES, "move %s category" % id)
		ok(String(m.get("role", "")) in ROLES, "move %s role %s" % [id, m.get("role")])
		ok(String(m.get("tier", "")) in TIERS, "move %s tier" % id)
		ok(String(m.get("rarity", "")) in RARITIES, "move %s rarity" % id)
		ok(tmap.has(String(m.get("type", ""))), "move %s type %s is a Pokemon type" % [id, m.get("type")])
		ok(String(m.get("energy", "")) == String(tmap.get(String(m.get("type", "")), "")) or m.get("source") == "tcg", "move %s energy is its type's kind" % id)
		ok(pools.has(String(m.get("energy", ""))), "move %s energy %s" % [id, m.get("energy")])
		ok(String(m.get("anim", "")) != "", "move %s has an anim key" % id)
		var acc := int(m.get("accuracy", -1))
		ok(acc >= 0 and acc <= 100, "move %s accuracy %d" % [id, acc])
		var pri := int(m.get("priority", 9))
		ok(pri >= -1 and pri <= 4, "move %s priority %d" % [id, pri])
		var ch = m.get("chance")
		ok(ch == null or (float(ch) > 0.0 and float(ch) <= 1.0), "move %s chance %s (0 to 1)" % [id, ch])
		for t in m.get("effects", []):
			ok(effects.has(String(t)), "move %s: effect tag %s is defined in the balance file" % [id, t])
		var c = m.get("cost")
		if m.tier == "finisher":
			ok(c is Dictionary and bool(c.get("all", false)) and int(c.get("min", 0)) >= 1 and pools.has(String(c.get("type", ""))),
				"move %s: a finisher takes all chips {all, min, type} (%s)" % [id, c])
			ok(m.has("power_per_chip"), "move %s: a finisher has power_per_chip" % id)
		else:
			ok(c is Array and (c as Array).size() >= 1 and (c as Array).size() <= 3, "move %s: a fixed cost of 1 to 3 chips (%s)" % [id, c])
			if c is Array:
				for k in c: ok(pools.has(String(k)), "move %s: cost kind %s" % [id, k])
				ok((m.tier == "opener") == ((c as Array).size() == 1), "move %s: tier %s matches %d chips" % [id, m.tier, (c as Array).size()])
		if m.role == "disruption":
			ok(int(m.get("disrupt", 0)) > 0 and "disrupt" in m.effects, "move %s: disruption lowers focus (disrupt > 0, the disrupt tag)" % id)
		else:
			ok(int(m.get("disrupt", 0)) == 0, "move %s: only disruption moves carry disrupt" % id)
		if m.role == "reaction":
			var rx = m.get("reaction")
			ok(rx is Dictionary and int(rx.get("lock", 0)) >= 1 and String(rx.get("trigger", "")) in ["any", "attack", "physical", "special"]
				and String(rx.get("effect", "")) != "" and String(rx.get("scope", "")) in ["next", "turn"], "move %s: a reaction {trigger, effect, scope, lock}" % id)
			ok(pri >= 3, "move %s: a reaction acts early (priority %d)" % [id, pri])
		else:
			ok(m.get("reaction") == null, "move %s: reaction data only on reactions" % id)
		if m.role == "two_phase":
			var tp = m.get("two_phase")
			ok(tp is Dictionary and String(tp.get("semi", "")) in SEMIS, "move %s: two-phase semi" % id)
			if tp is Dictionary:
				ok(bool(tp.get("invulnerable", false)) == (String(tp.semi) in UNREACHABLE), "move %s: unreachable only underground, airborne, underwater" % id)
		else:
			ok(m.get("two_phase") == null, "move %s: two-phase data only on two-phase moves" % id)
		if m.signature:
			ok(m.get("owner") != null and S.has(String(m.owner)), "move %s: a signature move has an owner species" % id)
	for id in SK:
		ok(S.has(String(SK[id].get("owner", ""))), "skill %s has an owner" % id)
		for t in SK[id].get("effects", []):
			ok(effects.has(String(t)), "skill %s: effect %s defined" % [id, t])
	ok(M.has("ground_pound"), "Ground Pound exists")
	if M.has("ground_pound"):
		var g: Dictionary = M.ground_pound
		ok(g.type == "ground" and g.category == "physical" and _n_chips(g) == 2, "Ground Pound: a Ground physical move, cost 2")
	for k in ["dodge", "protect", "detect", "counter", "mirror_coat"]:
		ok(M.has(k) and M[k].role == "reaction", "%s is a reaction" % k)
	for k in ["dig", "fly", "dive", "bounce", "solar_beam", "skull_bash", "sky_attack", "razor_wind"]:
		ok(M.has(k) and M[k].role == "two_phase", "%s is two-phase" % k)
	for k in ["dig", "fly", "dive", "bounce"]:
		ok(M.has(k) and M[k].two_phase.invulnerable, "%s makes the user unreachable" % k)
	for k in ["solar_beam", "skull_bash"]:
		ok(M.has(k) and M[k].two_phase.semi == "charging" and not M[k].two_phase.invulnerable, "%s charges but can be hit" % k)
	for k in ["leer", "growl", "screech", "hypnosis", "confusion", "roar", "mean_look"]:
		ok(M.has(k) and M[k].role == "disruption", "%s is disruption" % k)
	ok(M.has("swift") and M.swift.get("counters", {}).get("ignores_dodge", false) and int(M.swift.accuracy) == 0, "Swift ignores dodges and never misses")
	for k in ["mind_reader", "lock_on"]:
		ok(M.has(k) and M[k].get("counters") != null and M[k].counters.cancels_dodge and "sure_hit" in M[k].effects, "%s cancels a dodge" % k)
	ok(M.has("foresight") and M.foresight.get("counters", {}).get("foresight", false) and "identify" in M.foresight.effects, "Foresight lets Normal and Fighting hit Ghosts")
	ok(M.has("feint") and M.feint.get("counters", {}).get("breaks_protect", false), "Feint breaks Protect and Detect")
	for k in ["roar", "whirlwind"]:
		ok(M.has(k) and M[k].get("counters") != null and M[k].counters.forces_out_two_phase, "%s forces a two-phase move out" % k)

# ---------------------------------------------------------------- two-phase answers
func _two_phase() -> void:
	var need := {"dig": ["earthquake", "magnitude", "ground_pound", "swift"],
		"fly": ["thunder", "gust", "twister", "sky_uppercut", "swift"],
		"bounce": ["thunder", "gust", "twister", "sky_uppercut", "swift"],
		"dive": ["surf", "whirlpool", "swift"]}
	for k in need:
		if not M.has(k): continue
		var hb: Array = M[k].two_phase.hit_by
		for c in need[k]:
			ok(c in hb, "%s is hit by %s" % [k, c])
	for id in M:
		var m: Dictionary = M[id]
		if m.role != "two_phase": continue
		var tp: Dictionary = m.two_phase
		var answers := 0
		for c in tp.get("hit_by", []) + tp.get("forced_out_by", []):
			ok(M.has(String(c)), "%s: answer %s exists" % [id, c])
			if learnable.has(String(c)): answers += 1
		ok(answers >= 1, "%s has an answer some species can learn (%d)" % [id, answers])
		if String(tp.semi) in UNREACHABLE:
			for c in tp.get("hit_by", []):
				var cm: Dictionary = M.get(String(c), {})
				ok(cm.get("counters") != null and String(tp.semi) in cm.counters.hits_states, "%s: %s really hits the %s state" % [id, c, tp.semi])

# ---------------------------------------------------------------- evolutions
func _evolutions() -> void:
	for id in S:
		var e: Dictionary = S[id].evolution
		ok(id in e.get("line", []), "%s is in its own line" % id)
		var from = e.get("from")
		if from == null: continue
		ok(S.has(String(from)), "%s evolves from %s, a species" % [id, from])
		if not S.has(String(from)): continue
		ok(id in S[from].evolution.into, "%s lists %s as an evolution" % [from, id])
		ok(String(e.get("method", "")) in ["level", "stone", "trade", "friendship"], "%s: evolution method %s" % [id, e.get("method")])
		var lv := int(e.get("level", 0))
		ok(lv >= 1 and lv <= 100, "%s: evolution level %d" % [id, lv])
		var mine := {}
		for m in _all_moves(S[id]): mine[m] = true
		var missing := []
		for m in _all_moves(S[from]):
			if not mine.has(m): missing.append(m)
		ok(missing.is_empty(), "%s inherits every move of %s (missing %s)" % [id, from, missing])
		var bp := 0
		var bc := 0
		for x in S[from].base: bp += int(x)
		for x in S[id].base: bc += int(x)
		ok(bc > bp, "%s is stronger than %s (base total %d > %d)" % [id, from, bc, bp])

# ---------------------------------------------------------------- the numbers
func _round_to(x: float, to: float) -> float:
	return maxf(to, roundf(x / to) * to)

func _expected_mods(m: Dictionary) -> Dictionary:
	var out := {}
	var acc := float(m.accuracy)
	if acc <= 0.0: acc = 100.0
	out.accuracy = 1.0 + (100.0 - acc) * float(B.accuracy_k) if acc < 100.0 else 1.0
	out.priority = float(B.priority_mult.get(str(int(m.priority)), 1.0))
	var e := 1.0
	var ch = m.get("chance")
	var scaled: Array = B.get("chance_scaled_tags", [])
	for t in m.effects:
		var w := float(B.effects[t].power_mult) if B.effects.has(t) else 1.0
		if ch != null and float(ch) > 0 and String(t) in scaled:
			w = 1.0 - (1.0 - w) * float(ch)
		e *= w
	out.effects = e
	out.two_phase = float(B.two_phase_mult) if m.get("two_phase") != null else 1.0
	var hs := 0
	if m.get("counters") != null: hs = (m.counters.hits_states as Array).size()
	out.hits_states = pow(float(B.hits_state_mult), hs)
	out.role = float(B.role_power_mult[m.role]) if m.role != "offense" else 1.0
	return out

func _curves() -> void:
	var tol: Dictionary = B.tolerance
	var ppc: Dictionary = B.power_per_chip
	var norm := {}
	for r in RARITIES: norm[r] = {"opener": [], "mid": [], "finisher": []}
	for id in M:
		var m: Dictionary = M[id]
		var mods: Dictionary = m.power_mods
		var dmg := _deals_damage(m)
		if dmg:
			var em := _expected_mods(m)
			for k in em:
				ok(absf(float(mods.get(k, -1)) - float(em[k])) < 0.003, "move %s: power_mods.%s %s, the balance gives %.4f" % [id, k, mods.get(k), em[k]])
		var tot := 1.0
		for k in mods: tot *= float(mods[k])
		var rar := String(m.rarity)
		var n := _n_chips(m)
		if not dmg:
			ok(int(m.power) == 0 and int(m.get("power_per_chip", 0)) == 0, "move %s: no damage, no power" % id)
			continue
		if m.tier == "finisher":
			var eb := _round_to(float(B.finisher_base[rar]) * tot, float(B.round_power_to))
			var ep := maxf(1.0, roundf(float(ppc.finisher[rar]) * tot))
			ok(absf(float(m.power) - eb) <= maxf(float(tol.abs), float(tol.pct) * eb), "move %s: base power %s, the balance gives %s" % [id, m.power, eb])
			ok(absf(float(m.power_per_chip) - ep) <= maxf(2.0, float(tol.pct) * ep), "move %s: power_per_chip %s, the balance gives %s" % [id, m.power_per_chip, ep])
			norm[rar].finisher.append(float(m.power_per_chip) / tot)
		else:
			ok(int(m.power) > 0, "move %s deals damage" % id)
			var scale := float(B.chip_scaling[str(mini(3, n))])
			var e := _round_to(n * float(ppc[m.tier][rar]) * scale * tot, float(B.round_power_to))
			ok(absf(float(m.power) - e) <= maxf(float(tol.abs), float(tol.pct) * e), "move %s: power %s, the balance gives %s" % [id, m.power, e])
			norm[rar][m.tier].append(float(m.power) / (n * scale * tot))
	print("power per chip by rarity (normalised by each move's mods; balance value in brackets):")
	for t in TIERS:
		var line := "  %-8s" % t
		for r in RARITIES:
			var a: Array = norm[r][t]
			if a.is_empty():
				line += "  %s -" % r
				continue
			var s := 0.0
			for x in a: s += x
			var mean := s / a.size()
			var want := float(ppc[t][r])
			ok(absf(mean - want) <= float(tol.pct) * want, "%s %s: mean power per chip %.1f vs balance %.1f" % [t, r, mean, want])
			line += "  %s %.1f [%.1f] n=%d" % [r, mean, want, a.size()]
		print(line)
	for t in TIERS:
		for i in RARITIES.size() - 1:
			ok(float(ppc[t][RARITIES[i + 1]]) > float(ppc[t][RARITIES[i]]), "balance: %s power per chip climbs %s -> %s" % [t, RARITIES[i], RARITIES[i + 1]])
	var spc := {}
	for r in RARITIES: spc[r] = []
	for id in S:
		var r: Dictionary = S[id]
		var mult := float(B.shared_power_mult[r.rarity])
		var sum := 0.0
		var cnt := 0
		for m in _all_moves(r):
			var mm: Dictionary = M[m]
			if mm.tier == "finisher" or not _deals_damage(mm) or not _payable(mm, r.energy): continue
			sum += float(mm.power) / _n_chips(mm) * (1.0 if mm.signature else mult)
			cnt += 1
		if cnt > 0: spc[r.rarity].append(sum / cnt)
	var prev := 0.0
	var line2 := "species power per chip (in-pool, after shared_power_mult):"
	for r in RARITIES:
		var s := 0.0
		for x in spc[r]: s += x
		var mean := s / maxi(1, spc[r].size())
		line2 += "  %s %.1f" % [r, mean]
		ok(mean > prev, "species of %s rarity get more per chip than the tier below (%.1f > %.1f)" % [r, mean, prev])
		prev = mean
	print(line2)

# ---------------------------------------------------------------- dashes
func _dashes(v, where: String) -> void:
	var bad := []
	_scan(v, where, bad)
	ok(bad.is_empty(), "%s: no long dashes (%s)" % [where, bad.slice(0, 5)])

func _scan(v, path: String, bad: Array) -> void:
	if v is String:
		if v.find("—") >= 0 or v.find("–") >= 0: bad.append(path)
	elif v is Dictionary:
		for k in v:
			_scan(String(k), path + "/key", bad)
			_scan(v[k], path + "/" + String(k), bad)
	elif v is Array:
		for i in v.size(): _scan(v[i], "%s[%d]" % [path, i], bad)

# ---------------------------------------------------------------- the engine
func _engine() -> void:
	ok(Kanto151Data.install(), "the dataset installs into the engine")
	ok(BattleEnergy.species_data("mewtwo").get("name", "") == "Mewtwo", "the engine sees the 151 (Mewtwo)")
	ok(not BattleEnergy.move("psystrike").is_empty() and not BattleEnergy.move("ground_pound").is_empty(), "the engine sees the moves")
	ok(BattleEnergy.move("dig").get("cost", []) == M.dig.cost, "the Kanto Dig wins the merge over moves.json")
	var e := BattleEnergy.make("bulbasaur", 20)
	ok(e.pool_kinds() == ["grass", "dark", "colorless"], "Bulbasaur's engine pools: Grass, Darkness, Colorless (%s)" % [e.pool_kinds()])
	ok(not e.usable().is_empty(), "Bulbasaur Lv 20 has moves equipped (%d of %d slots)" % [e.usable().size(), e.slots])
	ok(e.slots == BattleEnergy.slots_for(20), "slots come from battle_config")
	var mt := BattleEnergy.make("mewtwo", 70)
	ok(absf(float(mt.params.gain) - float(S.mewtwo.focus_profile.gain)) < 0.01, "Mewtwo's focus gain reaches the engine (%s)" % mt.params.gain)
	var pairs := [["pikachu", 12, "pidgey", 6], ["charmander", 14, "bulbasaur", 14], ["squirtle", 14, "geodude", 14],
		["mewtwo", 70, "snorlax", 60], ["dratini", 20, "magikarp", 20], ["gengar", 40, "alakazam", 40],
		["diglett", 18, "pidgeotto", 22], ["caterpie", 5, "ditto", 10]]
	var seed := 7
	var finished := 0
	for p in pairs:
		seed += 1
		var bt := PkmnBattle.new({"a": {"species": p[0], "level": p[1], "ai": "balanced"},
			"b": {"species": p[2], "level": p[3], "ai": "wild"}, "kind": "wild", "seed": seed})
		bt.start()
		var hits := 0
		var moves_used := 0
		var errors := 0
		var turns := 0
		for t in 25:
			if bt.over: break
			bt.begin_turn()
			for s in ["a", "b"]:
				if bt.needs_pick(s): bt.pick_pool(s)
			bt.ai_queue("a")
			bt.ai_queue("b")
			var ev: Array = bt.resolve()
			turns += 1
			for x in ev:
				if String(x.get("t", "")) == "hit": hits += 1
				if String(x.get("t", "")) == "move": moves_used += 1
				if not BattleEnergy.move(String(x.get("move", "tackle"))).is_empty() or not x.has("move"): pass
				else:
					if not String(x.get("move", "")) in ["recoil", "protect", ""]: errors += 1
		if bt.over: finished += 1
		ok(moves_used > 0, "%s Lv %d vs %s Lv %d: moves were used (%d in %d turns)" % [p[0], p[1], p[2], p[3], moves_used, turns])
		ok(hits > 0, "%s vs %s: something hit (%d hits)" % [p[0], p[2], hits])
		ok(errors == 0, "%s vs %s: every event's move is a real move" % [p[0], p[2]])
		print("  battle %s Lv %d vs %s Lv %d: %d turns, %d moves, %d hits, %s (HP %d/%d vs %d/%d)" % [p[0], p[1], p[2], p[3], turns, moves_used, hits,
			bt.outcome if bt.over else "still going", bt.fighter("a").hp, bt.fighter("a").max_hp, bt.fighter("b").hp, bt.fighter("b").max_hp])
	ok(finished >= pairs.size() / 2, "most test battles finish inside 25 turns (%d of %d)" % [finished, pairs.size()])
	_rules()
	Kanto151Data.uninstall()
	ok(BattleEnergy.species_data("mewtwo").is_empty() or BattleEnergy.species_data("pidgey").has("wild_levels"), "uninstall puts pokemon.json back")

# ---------------------------------------------------------------- the rules the 151 brought to the engine
# a two-Pokemon trainer battle with set moves and full focus; b acts with `react`, a with `attack`
func _duel(a_sp: String, a_lv: int, a_moves: Array, b_sp: String, b_lv: int, b_moves: Array) -> PkmnBattle:
	var ea := BattleEnergy.make(a_sp, a_lv, a_moves)
	ea.equipped = a_moves.duplicate()
	var eb := BattleEnergy.make(b_sp, b_lv, b_moves)
	eb.equipped = b_moves.duplicate()
	var bt := PkmnBattle.new({"a": {"energy": ea, "ai": "balanced"}, "b": {"energy": eb, "ai": "balanced"}, "kind": "trainer", "seed": 3})
	bt.start()
	ea.set_focus(100.0, "test"); eb.set_focus(100.0, "test")
	bt.begin_turn()
	return bt

func _texts(ev: Array) -> String:
	return " | ".join(ev.map(func(x): return String(x.get("text", ""))))

func _rules() -> void:
	BattleConfig.override({"damage": {"crit_base": 0.0, "crit_per_stage": 0.0, "random_min": 1.0}})
	# off-pool: Pikachu (Lightning) paying a Fighting move: Colorless, one chip more
	var p := BattleEnergy.make("pikachu", 30)
	ok(p.cost_for("double_kick") == ["colorless", "colorless"], "off-pool: Double Kick costs Pikachu two Colorless (%s)" % [p.cost_for("double_kick")])
	ok(p.off_pool("double_kick") and not p.off_pool("thunder_shock"), "off_pool() tells them apart")
	p.chips = ["colorless", "colorless"]
	ok(p.can_pay("double_kick"), "Pikachu can pay Double Kick off-pool")
	# endure: a sure knockout leaves it at 1 HP
	var bt := _duel("machamp", 60, ["karate_chop"], "rattata", 5, ["endure"])
	bt.fighter("b").hp = 3      # sure to be a knockout blow
	ok(bt.queue("b", "endure") and bt.queue("a", "karate_chop"), "endure vs Karate Chop queued")
	var ev := bt.resolve()
	ok(bt.fighter("b").hp == 1, "Endure: Rattata hangs on at 1 HP (%s)" % _texts(ev))
	# destiny bond: the attacker goes down too
	bt = _duel("machamp", 60, ["bite"], "gastly", 5, ["destiny_bond"])
	bt.fighter("b").hp = 3
	bt.queue("b", "destiny_bond"); bt.queue("a", "bite")
	ev = bt.resolve()
	ok(bt.fighter("b").fainted() and bt.fighter("a").fainted(), "Destiny Bond takes Machamp down with Gastly (%s)" % _texts(ev))
	# counter-any: Metal Burst returns a special hit
	bt = _duel("pikachu", 30, ["thunderbolt"], "magneton", 40, ["metal_burst"])
	var hp0 := bt.fighter("a").hp
	bt.queue("b", "metal_burst"); bt.queue("a", "thunderbolt")
	ev = bt.resolve()
	ok(bt.fighter("a").hp < hp0, "Metal Burst hits back a special attack (%s)" % _texts(ev))
	# guard: Stiffen takes a share off the next hit
	bt = _duel("geodude", 20, ["tackle"], "geodude", 20, ["stiffen"])
	bt.queue("a", "tackle")
	var plain := bt.resolve().filter(func(x): return x.get("t", "") == "hit")
	bt = _duel("geodude", 20, ["tackle"], "geodude", 20, ["stiffen"])
	bt.queue("b", "stiffen"); bt.queue("a", "tackle")
	var guarded := bt.resolve().filter(func(x): return x.get("t", "") == "hit")
	ok(not plain.is_empty() and not guarded.is_empty() and int(guarded[0].dmg) < int(plain[0].dmg), "Stiffen: less damage (%s vs %s)" % [guarded, plain])
	# bounce: Magic Coat sends Growl back
	bt = _duel("pidgey", 20, ["growl"], "alakazam", 40, ["magic_coat"])
	bt.queue("b", "magic_coat"); bt.queue("a", "growl")
	ev = bt.resolve()
	ok(int(bt.fighter("a").stages.atk) < 0 and int(bt.fighter("b").stages.atk) == 0, "Magic Coat bounces Growl (%s)" % _texts(ev))
	# steal: Snatch takes Swords Dance
	bt = _duel("scyther", 30, ["swords_dance"], "persian", 30, ["snatch"])
	bt.queue("b", "snatch"); bt.queue("a", "swords_dance")
	ev = bt.resolve()
	ok(int(bt.fighter("b").stages.atk) > 0 and int(bt.fighter("a").stages.atk) == 0, "Snatch steals Swords Dance (%s)" % _texts(ev))
	# self buffs reach the user; heals heal; recharge skips a turn
	bt = _duel("scyther", 30, ["swords_dance"], "rattata", 30, ["tackle"])
	bt.queue("a", "swords_dance"); bt.resolve()
	ok(int(bt.fighter("a").stages.atk) == 2, "Swords Dance: attack +2")
	bt = _duel("snorlax", 50, ["hyper_beam"], "chansey", 50, ["soft_boiled"])
	bt.fighter("b").hp = 10
	bt.queue("b", "soft_boiled"); bt.queue("a", "hyper_beam")
	ev = bt.resolve()
	ok(bt.fighter("a").recharge_turn == bt.turn + 1, "Hyper Beam: Snorlax must recharge next turn")
	bt.begin_turn()
	ok(not bt.can_queue("a", "hyper_beam"), "and can't act while recharging")
	# a status move on a foe that already has a condition: it says so, and the planner skips it
	bt = _duel("pikachu", 20, ["thunder_wave", "thunder_shock"], "pidgey", 20, ["tackle"])
	bt.fighter("b").status = "para"
	bt.queue("a", "thunder_wave")
	ev = bt.resolve()
	ok(ev.any(func(x): return x.get("t", "") == "no_effect"), "Thunder Wave on a paralysed foe: 'already paralysed' (%s)" % _texts(ev))
	bt = _duel("pikachu", 20, ["thunder_wave", "tail_whip", "thunder_shock"], "pidgey", 20, ["tackle"])
	bt.fighter("b").status = "para"
	bt.fighter("a").ai = "aggressive"
	var plan := PkmnAI.plan(bt, "a")
	ok(not "thunder_wave" in plan and "thunder_shock" in plan and plan.count("tail_whip") <= 1, "the planner attacks a paralysed foe instead of Thunder Wave (%s)" % [plan])
	# paralysis is rolled once a turn: every action that turn goes the same way
	BattleConfig.override({"damage": {"para_skip": 0.5, "para_scope": "turn"}})
	var mixed := 0
	for k in 12:
		bt = _duel("pikachu", 20, ["thunder_shock"], "pidgey", 20, ["tackle"])
		bt.fighter("a").status = "para"
		bt.rng.seed = 100 + k
		bt.queue("a", "thunder_shock"); bt.queue("a", "thunder_shock")
		var acted := bt.resolve().filter(func(x): return x.get("t", "") == "move" and x.side == "a").size()
		if acted == 1: mixed += 1
	ok(mixed == 0, "paralysis: all or none of a turn's actions (mixed turns %d)" % mixed)
	BattleConfig.override({"damage": {"para_skip": 0.25}})
	# rarity: a legendary's shared move hits harder than a common's
	ok(absf(PkmnBattle.rarity_mult(_duel("mewtwo", 50, ["swift"], "rattata", 50, ["tackle"]).fighter("a"), "swift") - 1.16) < 0.001, "Mewtwo's Swift carries the legendary bonus")
	BattleConfig.reset()

# ---------------------------------------------------------------- summary
func _summary() -> void:
	var by_r := {}
	var sp_r := {}
	var moves_r := {}
	var sig_r := {}
	var sk_r := {}
	for r in RARITIES:
		by_r[r] = 0; sp_r[r] = 0; moves_r[r] = 0; sig_r[r] = 0; sk_r[r] = 0
	for id in M: by_r[M[id].rarity] += 1
	var total := 0
	for id in S:
		var r: Dictionary = S[id]
		var n := _all_moves(r).size()
		total += n
		sp_r[r.rarity] += 1
		moves_r[r.rarity] += n
		sig_r[r.rarity] += (r.signature as Array).size()
		sk_r[r.rarity] += (r.skills as Array).size()
	var roles := {}
	var tiers := {}
	for id in M:
		roles[M[id].role] = int(roles.get(M[id].role, 0)) + 1
		tiers[M[id].tier] = int(tiers.get(M[id].tier, 0)) + 1
	print("moves: %d (%s), skills: %d" % [M.size(), roles, SK.size()])
	print("moves by tier: %s" % [tiers])
	print("moves by rarity (tuning class): %s" % [by_r])
	print("species by rarity: %s" % [sp_r])
	var line := "average moves per species: %.1f;" % (float(total) / maxi(1, S.size()))
	for r in RARITIES:
		var k := maxi(1, sp_r[r])
		line += "  %s %.1f (signature %.1f, skills %.1f)" % [r, float(moves_r[r]) / k, float(sig_r[r]) / k, float(sk_r[r]) / k]
	print(line)
