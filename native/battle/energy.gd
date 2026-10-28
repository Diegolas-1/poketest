class_name BattleEnergy
extends RefCounted
# The energy system (design/energy_system.md), after the Pokémon Trading Card
# Game's energy cards, used like mana. Pure logic: no nodes, headless-tested by
# dev/energy_test.gd. Data: life/pokemon.json (species: types, the focus order of
# its chips, the learnset; the level -> slots table) and life/moves.json (each
# move's cost in chips, power, accuracy, effects, animation key).
#
#   var e := BattleEnergy.make("pidgey", 3)      # knows every move up to Lv 3 (a wild one)
#   e.begin_turn()                  # turn n: min(n, capacity) fresh chips; last turn's unspent ones are gone
#   e.chips                         # this turn's chips, e.g. ["flying", "colorless"]
#   e.can_pay(["flying", "colorless"]) / e.pay(cost)   # TCG matching: typed costs first, Colorless from anything
#   e.affordable_moves(e.known)     # what it could use right now
#   e.plan_turn(e.known, "aggressive" | "strategic" | "evasive")  # an ordered list of move ids for the turn
#   e.use_move("gust")              # pays a move's cost (false if it can't)
#   e.learnable_at(level) / e.learn(id) / e.set_level(lv)  # moves are never forgotten
#   e.restore(n, type)              # an item's hook: n more chips this turn (up to capacity)
#
# Signals (EnergyBar listens and animates): turn_started(turn, lost, gained),
# spent(indices, types, move_id), restored(first_index, types), changed().
# Costs are Arrays of energy kinds; a Dictionary {kind: n} works too.

signal turn_started(turn: int, lost: Array, gained: Array)
signal spent(indices: Array, types: Array, move_id: String)
signal restored(first_index: int, types: Array)
signal changed()

const POKEMON_PATH := "res://life/pokemon.json"
const MOVES_PATH := "res://life/moves.json"
const COLORLESS := "colorless"
const STYLES := ["aggressive", "strategic", "evasive"]

static var _pk := {}
static var _mv := {}

var species := ""
var types: Array = []           # its Pokémon types, e.g. ["normal", "flying"]
var focus: Array = []           # the energy kinds its chips come in, in order (cycled)
var level := 1
var capacity := 1               # energy slots
var turn := 0                   # turns begun this battle
var chips: Array = []           # this turn's unspent chips (energy kinds), in the order gained
var known: Array = []           # learned move ids, in the order learned; never shrinks

# ---------- data ----------
static func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var v = JSON.parse_string(FileAccess.get_file_as_string(path))
	return v if v is Dictionary else {}

static func data() -> Dictionary:
	if _pk.is_empty(): _pk = _load(POKEMON_PATH)
	return _pk

static func moves_data() -> Dictionary:
	if _mv.is_empty(): _mv = _load(MOVES_PATH).get("moves", {})
	return _mv

static func reload() -> void:
	_pk = {}; _mv = {}

static func move(id: String) -> Dictionary:
	return moves_data().get(id, {})

static func species_data(id: String) -> Dictionary:
	return data().get("species", {}).get(id, {})

static func max_capacity() -> int:
	return int(data().get("max_capacity", 10))

# the energy kind for a Pokémon type (normal -> colorless)
static func energy_of(t: String) -> String:
	t = t.to_lower()
	return String(data().get("type_energy", {}).get(t, t))

static func energy_name(kind: String) -> String:
	return String(data().get("energy_names", {}).get(kind, kind.capitalize()))

static func energy_types() -> Array:
	var v: Array = data().get("energy_types", [])
	return v if not v.is_empty() else [COLORLESS]

# slots at a level: the highest table key at or below it (plus the species' shift)
static func capacity_for(lv: int, sp := "") -> int:
	var table: Dictionary = data().get("capacity", {"1": 1})
	var best := 1
	var best_lv := -1
	for k in table:
		var kl := int(k)
		if kl <= lv and kl > best_lv:
			best_lv = kl; best = int(table[k])
	if sp != "": best += int(species_data(sp).get("capacity_shift", 0))
	return clampi(best, 1, max_capacity())

# the next level that adds a slot (-1 at the top)
static func next_slot_level(lv: int, sp := "") -> int:
	var cur := capacity_for(lv, sp)
	var keys: Array = data().get("capacity", {}).keys().map(func(k): return int(k))
	keys.sort()
	for kl in keys:
		if kl > lv and capacity_for(kl, sp) > cur: return kl
	return -1

# the level the bar gets its n-th slot (n from 1); -1 if never
static func level_for_slot(n: int, sp := "") -> int:
	if capacity_for(1, sp) >= n: return 1
	var keys: Array = data().get("capacity", {}).keys().map(func(k): return int(k))
	keys.sort()
	for kl in keys:
		if capacity_for(kl, sp) >= n: return kl
	return -1

# a cost as an Array of kinds (from an Array, a {kind: n} Dictionary, a move id or a move)
static func cost_of(c) -> Array:
	if c is String:
		return cost_of(move(c).get("cost", []))
	if c is Dictionary:
		if c.has("cost"): return cost_of(c.cost)
		var out := []
		for k in c:
			for i in int(c[k]): out.append(String(k))
		return out
	if c is Array:
		var out2 := []
		for k in c: out2.append(String(k).to_lower())
		return out2
	return []

# ---------- making one ----------
func _init(sp := "pidgey", lv := 1) -> void:
	species = sp
	var S := species_data(sp)
	types = S.get("types", ["normal"]).duplicate()
	focus = S.get("focus", []).duplicate()
	if focus.is_empty():
		# the default order: its first type, its second (or first again), Colorless
		var a := energy_of(String(types[0])) if not types.is_empty() else COLORLESS
		var b := energy_of(String(types[1])) if types.size() > 1 else a
		focus = [a, b, COLORLESS]
	level = maxi(1, lv)
	capacity = capacity_for(level, species)

# a battle-ready one: knows every move it can at its level (a wild Pokémon, or a fresh one)
static func make(sp: String, lv := 1, learned = null) -> BattleEnergy:
	var e := BattleEnergy.new(sp, lv)
	if learned is Array:
		for id in learned: e.known.append(String(id))
	else:
		for id in e.learnable_at(e.level): e.known.append(id)
	return e

# ---------- learning (never forgotten) ----------
func learnset() -> Array:
	return species_data(species).get("learnset", [])

# moves it can learn at lv that it doesn't know yet: reached the level, and the
# bar (at lv) can pay the cost
func learnable_at(lv: int) -> Array:
	var cap := capacity_for(lv, species)
	var out := []
	for row in learnset():
		var id := String(row.get("move", ""))
		if id == "" or id in known or id in out: continue
		if int(row.get("level", 1)) > lv: continue
		if cost_of(id).size() > cap: continue
		out.append(id)
	return out

func learn(id: String) -> bool:
	if id in known: return false
	if not id in learnable_at(level): return false
	known.append(id)
	changed.emit()
	return true

# changes the level (it can't go down): returns {slots (gained), learnable (new)}
func set_level(lv: int) -> Dictionary:
	lv = maxi(lv, level)
	var before := capacity
	level = lv
	capacity = capacity_for(level, species)
	changed.emit()
	return {"slots": capacity - before, "learnable": learnable_at(level)}

# a move known but too big for the bar yet (the move list shows it locked)
func locked(id: String) -> bool:
	return cost_of(id).size() > capacity

# ---------- the turn ----------
# the kind of the i-th chip of a turn
func focus_kind(i: int) -> String:
	if focus.is_empty(): return COLORLESS
	return String(focus[i % focus.size()])

func chips_for_turn(n: int) -> int:
	return clampi(n, 0, capacity)

# a new turn: min(turn, capacity) fresh chips; whatever was left is gone
func begin_turn() -> Array:
	turn += 1
	var lost := chips.duplicate()
	chips = []
	for i in chips_for_turn(turn): chips.append(focus_kind(i))
	turn_started.emit(turn, lost, chips.duplicate())
	changed.emit()
	return chips.duplicate()

# a new battle
func reset_battle() -> void:
	turn = 0
	chips = []
	changed.emit()

func available() -> int:
	return chips.size()

# ---------- paying (TCG matching) ----------
# which chips (indices into chips) would pay cost, or null. Every typed cost is
# matched first, by its own kind only; then every Colorless cost from what is
# left, real Colorless chips first, then the kind it has most of (the rarer
# kinds stay for the typed costs).
static func match_cost(have: Array, cost) -> Variant:
	var need := cost_of(cost)
	var free := []
	for i in have.size(): free.append(i)
	var used := []
	var colorless := 0
	for k in need:
		if k == COLORLESS:
			colorless += 1
			continue
		var at := -1
		for j in range(free.size() - 1, -1, -1):
			if String(have[free[j]]) == k: at = j; break
		if at < 0: return null
		used.append(free[at])
		free.remove_at(at)
	for n in colorless:
		if free.is_empty(): return null
		var best := -1
		var best_score := -INF
		var counts := {}
		for i in free: counts[have[i]] = int(counts.get(have[i], 0)) + 1
		for j in free.size():
			var kind := String(have[free[j]])
			var s := float(counts[kind]) + (100.0 if kind == COLORLESS else 0.0) + j * 0.001
			if s > best_score: best_score = s; best = j
		used.append(free[best])
		free.remove_at(best)
	return used

func can_pay(cost) -> bool:
	return match_cost(chips, cost) != null

# the chips a cost would use (for the bar's preview): the indices, [] if it can't
func preview(cost) -> Array:
	var m = match_cost(chips, cost)
	return m if m != null else []

# as far as these chips go toward a cost: {used: chip indices, missing: the kinds it lacks}
static func partial_match(have: Array, cost) -> Dictionary:
	var need := cost_of(cost)
	var free := []
	for i in have.size(): free.append(i)
	var used := []
	var miss := []
	var cl := 0
	for k in need:
		if k == COLORLESS: cl += 1; continue
		var at := -1
		for j in range(free.size() - 1, -1, -1):
			if String(have[free[j]]) == k: at = j; break
		if at < 0: miss.append(k)
		else: used.append(free[at]); free.remove_at(at)
	for n in cl:
		if free.is_empty(): miss.append(COLORLESS); continue
		var pick := free.size() - 1
		for j in free.size():
			if String(have[free[j]]) == COLORLESS: pick = j; break
		used.append(free[pick]); free.remove_at(pick)
	return {"used": used, "missing": miss}

# what a cost still lacks with these chips: the unmatched kinds (the bar shows them as ghosts)
func missing(cost) -> Array:
	return partial_match(chips, cost).missing

# pays cost: the chips used (indices before removal, ascending), or [] if it can't
func pay(cost, move_id := "") -> Array:
	var m = match_cost(chips, cost)
	if m == null: return []
	var idx: Array = m.duplicate()
	idx.sort()
	var kinds := []
	for i in idx: kinds.append(chips[i])
	for j in range(idx.size() - 1, -1, -1): chips.remove_at(idx[j])
	spent.emit(idx, kinds, move_id)
	changed.emit()
	return idx

func use_move(id: String) -> bool:
	if not id in known or locked(id): return false
	return not pay(cost_of(id), id).is_empty()

# ---------- items (the hook) ----------
# n more chips this turn, up to capacity: kind "" = its next focus kinds. Returns how many.
func restore(n: int, kind := "") -> int:
	var first := chips.size()
	var added := []
	for i in n:
		if chips.size() >= capacity: break
		var k := kind if kind != "" else focus_kind(chips.size())
		chips.append(k)
		added.append(k)
	if not added.is_empty():
		restored.emit(first, added)
		changed.emit()
	return added.size()

# an energy item (life/pokemon.json energy_items) by id or as a Dictionary
func use_item(item) -> int:
	var it: Dictionary = item if item is Dictionary else data().get("energy_items", {}).get(String(item), {})
	if it.is_empty(): return 0
	return restore(int(it.get("restore", 1)), String(it.get("type", "")))

# ---------- what it can do ----------
func affordable_moves(known_moves = null) -> Array:
	var ids: Array = known if known_moves == null else known_moves
	var out := []
	for id in ids:
		var c := cost_of(id)
		if c.is_empty() or c.size() > capacity: continue
		if can_pay(c): out.append(id)
	return out

# ---------- the planner ----------
# What a value-minded Pokémon does with this turn's chips: the best ordered list
# of moves (repeats allowed) by style:
#   aggressive  spends big: raw damage, a bias toward the costliest move
#   strategic   spends several cheap: effects and number of actions count
#   evasive     sand in the eyes, wind, getting away; damage counts little
# ctx (all optional): uses {move: times already used this battle} (status
# moves are worth less each time), max_actions (6), rng (a RandomNumberGenerator)
# and jitter (0..1: a little randomness in the scores, for variety).
const STATUS_VALUE := {"acc_down": 30.0, "atk_down": 20.0, "def_down": 20.0, "speed_down": 14.0, "def_up": 18.0,
	"evasion_up": 26.0, "para": 34.0, "sleep": 40.0, "poison": 28.0, "drain": 26.0, "burn": 12.0,
	"flinch": 8.0, "trap": 10.0, "high_crit": 6.0, "force_out": 12.0, "clear_field": 4.0, "fixed_40": 40.0}
const STYLE_K := {
	"aggressive": {"dmg": 1.0, "status": 0.3, "per_action": -4.0, "big": 12.0, "force_out": 0.0, "repeat": 0.92},
	"strategic": {"dmg": 0.9, "status": 1.3, "per_action": 8.0, "big": 0.0, "force_out": 0.5, "repeat": REPEAT_TURN},
	"evasive": {"dmg": 0.55, "status": 1.6, "per_action": 6.0, "big": 0.0, "force_out": 5.0, "repeat": REPEAT_TURN},
}
const WASTE := 20.0                 # a chip left unspent
const REPEAT_TURN := 0.75           # an attack's value for each time it's already in this turn's plan
const REPEAT_BATTLE := 0.94         # ...and for each earlier use this battle (up to 4)

# times: how often it was used before (this battle and earlier in this plan);
# in_turn: how often earlier in this plan
func _move_value(id: String, style: String, times: int, in_turn := 0) -> float:
	var m := move(id)
	var K: Dictionary = STYLE_K.get(style, STYLE_K.strategic)
	var acc := float(m.get("accuracy", 100)) / 100.0
	var v := float(m.get("power", 0)) * acc * float(K.dmg)
	# the same attack again loses a little (it mixes its moves up, as in the show)
	v *= pow(float(K.get("repeat", REPEAT_TURN)), in_turn) * pow(REPEAT_BATTLE, mini(times - in_turn, 4))
	var st := 0.0
	for tag in m.get("effects", []):
		var tv := float(STATUS_VALUE.get(tag, 0.0))
		if tag == "force_out": tv *= float(K.force_out)   # only the evasive really want it gone
		# a damaging move's side effect is a chance, not a sure thing
		if float(m.get("power", 0)) > 0.0 and tag != "fixed_40": tv *= 0.3
		st += tv
	if float(m.get("power", 0)) <= 0.0 or "fixed_40" in m.get("effects", []):
		st *= acc
		st *= pow(0.5, times)        # the second Sand-Attack is worth half the first
	v += st * float(K.status)
	if int(m.get("priority", 0)) > 0 and in_turn == 0: v += 6.0   # only one can go first
	return v

func plan_turn(known_moves = null, style := "strategic", ctx := {}) -> Array:
	if not style in STYLES: style = "strategic"
	var ids := []
	for id in (known if known_moves == null else known_moves):
		var c := cost_of(id)
		if not c.is_empty() and c.size() <= capacity and not move(id).is_empty() and not id in ids: ids.append(String(id))
	if ids.is_empty() or chips.is_empty(): return []
	var best := {"score": -INF, "seq": []}
	var uses: Dictionary = ctx.get("uses", {})
	var rng: RandomNumberGenerator = ctx.get("rng", null)
	var jitter := float(ctx.get("jitter", 0.0))
	var noise := {}
	for id in ids: noise[id] = (rng.randf_range(-1.0, 1.0) * jitter * 25.0) if rng != null else 0.0
	_search(chips.duplicate(), ids, 0, [], {}, style, uses, noise, int(ctx.get("max_actions", 6)), best)
	return _order(best.seq, style)

func _search(have: Array, ids: Array, from: int, seq: Array, times: Dictionary, style: String, uses: Dictionary, noise: Dictionary, room: int, best: Dictionary) -> void:
	# score this sequence (the empty one too: nothing affordable)
	var s := _score(seq, have.size(), style, uses, noise)
	if s > best.score or (is_equal_approx(s, best.score) and seq.size() < best.seq.size()):
		best.score = s; best.seq = seq.duplicate()
	if room <= 0 or have.is_empty(): return
	for i in range(from, ids.size()):
		var id: String = ids[i]
		var m = match_cost(have, id)
		if m == null: continue
		var rest := have.duplicate()
		var idx: Array = m.duplicate()
		idx.sort()
		for j in range(idx.size() - 1, -1, -1): rest.remove_at(idx[j])
		seq.append(id)
		_search(rest, ids, i, seq, times, style, uses, noise, room - 1, best)
		seq.pop_back()

func _score(seq: Array, left: int, style: String, uses: Dictionary, noise: Dictionary) -> float:
	var K: Dictionary = STYLE_K[style]
	var s := -WASTE * left
	var count := {}
	var big := 0
	for id in seq:
		var n := int(count.get(id, 0)) + int(uses.get(id, 0))
		s += _move_value(id, style, n, int(count.get(id, 0))) + float(K.per_action) + float(noise.get(id, 0.0))
		count[id] = int(count.get(id, 0)) + 1
		big = maxi(big, cost_of(id).size())
	return s + float(K.big) * big

# the order to act in: priority moves first; then status before attacks (strategic,
# evasive) or the biggest first (aggressive); ties keep the plan's order
func _order(seq: Array, style: String) -> Array:
	var rows := []
	for i in seq.size():
		var m := move(seq[i])
		var pri := int(m.get("priority", 0))
		var status := 1 if float(m.get("power", 0)) <= 0.0 else 0
		var k: float
		if style == "aggressive": k = -pri * 100.0 - cost_of(seq[i]).size() * 10.0
		else: k = -pri * 100.0 - status * 10.0 + cost_of(seq[i]).size()
		rows.append([k, i, seq[i]])
	rows.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	return rows.map(func(r): return r[2])

# ---------- saving ----------
func to_dict() -> Dictionary:
	return {"species": species, "level": level, "known": known.duplicate()}

static func from_dict(d: Dictionary) -> BattleEnergy:
	return make(String(d.get("species", "pidgey")), int(d.get("level", 1)), d.get("known", []))
