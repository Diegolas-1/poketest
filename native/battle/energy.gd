class_name BattleEnergy
extends RefCounted
# The energy system (design/energy_system.md), after the Pokemon Trading Card
# Game's energy cards, plus persistent focus. Pure logic: no nodes, headless-
# tested by dev/energy_test.gd and dev/pkmn_battle_test.gd. Species data:
# life/pokemon.json; moves: life/moves.json; every tunable number:
# life/battle_config.json (BattleConfig).
#
# Four things, kept in separate fields:
#   focus    0..100, persistent per Pokemon. +gain each undisturbed turn; the
#            engine that makes chips: chips = min(floor(focus / step), chip_cap)
#   pools    {kind: {ready, spent}}: one pool per energy type it has, plus
#            Colorless (the default). Spent chips dim and are ready again next turn
#   locks    chips set aside by a reaction move until it triggers or expires
#   slots    level-gated: how many moves it can have equipped (usable)
#
#   var e := BattleEnergy.make("pidgey", 3)      # knows every move up to Lv 3
#   e.begin_turn()                  # focus +gain, new chips into pools, spent chips back
#   e.chips                         # the ready chips (energy kinds), e.g. ["flying", "colorless"]
#   e.can_pay(cost) / e.pay(cost)   # TCG matching: typed costs first, Colorless from anything
#   e.lock(move_id)                 # a reaction: its chips locked until triggered or expired
#   e.disrupt(step)                 # focus down a step (never a reset); Locked In lost
#   e.pending / e.needs_pick() / e.pick_pool(kind)   # the player's one choice per turn
#   e.plan_turn(ids, style, ctx)    # the wild planner: an ordered list of move ids
#   e.usable() / e.equip(id) / e.locked(id)          # slots: equipped vs known
#   e.learnable_at(level) / e.learn(id) / e.teach(id) / e.set_level(lv)  # never forgotten
#   e.use_item(id) / e.restore(n, kind)              # energy restore items
#   e.elapse(minutes) / e.rest(kind) / e.center() / e.faint() / e.after_battle(result)
#
# Signals (EnergyBar listens and animates): turn_started(turn, lost, gained),
# spent(indices, types, move_id) (indices into chip_list()), restored(first, types),
# changed(), focus_changed(old, new, reason), pick_needed(n), lock_set(lock),
# lock_ended(lock, how), locked_in_changed(on).
# Costs are Arrays of energy kinds; a Dictionary {kind: n} works too.

signal turn_started(turn: int, lost: Array, gained: Array)
signal spent(indices: Array, types: Array, move_id: String)
signal restored(first_index: int, types: Array)
signal changed()
signal focus_changed(old: float, new: float, reason: String)
signal pick_needed(n: int)
signal lock_set(lock: Dictionary)
signal lock_ended(lock: Dictionary, how: String)
signal locked_in_changed(on: bool)

const POKEMON_PATH := "res://life/pokemon.json"
const MOVES_PATH := "res://life/moves.json"
const COLORLESS := "colorless"
const ANY := "any"                # a Locked In wild chip: counts as any kind
const STYLES := ["aggressive", "strategic", "evasive"]
const ROLES := ["offense", "reaction", "two_phase", "disruption", "utility"]

static var _pk := {}
static var _mv := {}
static var _lock_seq := 0

# ---- who it is ----
var species := ""
var types: Array = []           # its Pokemon types, e.g. ["normal", "flying"]
var level := 1
var known: Array = []           # learned move ids, in the order learned; never shrinks
var equipped: Array = []        # the moves in its slots (usable); a subset of known
var perks: Array = []           # perk ids (battle_config perks): start, gain, chip_cap, disrupt_resist
var params := {}                # its focus parameters (BattleConfig.focus_for + perks)
# ---- the energy, kept separate ----
var focus := 0.0                # 0..100
var pools := {}                 # kind -> {"ready": n, "spent": n}
var locks: Array = []           # [{id, move, kinds, trigger, effect, scope, mult, set_turn, expires_turn}]
var slots := 4                  # energy slots (level-gated)
var bonus := {"ready": 0, "spent": 0}   # Locked In wild chips (kind "any")
var pending := 0                # chips earned this turn still waiting for a pool (the player's pick)
var locked_in := false
var commit := {}                # a two-phase move in progress: {move, semi, turn}
# ---- the battle ----
var turn := 0                   # turns begun this battle
var pick_mode := "auto"         # auto (AI, wild: the planner's choice) | player (wait for pick_pool)
var asleep := false             # set by the battle: no focus gain
var disturbed := false          # disrupted since the last turn began (no gain this turn)
# ---- between battles ----
var idle_minutes := 0.0         # game minutes since its last battle
var in_gym := false
var gym_wins := 0

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
	BattleConfig.reload()

static func move(id: String) -> Dictionary:
	return moves_data().get(id, {})

static func role_of(id: String) -> String:
	return String(move(id).get("role", "offense"))

static func species_data(id: String) -> Dictionary:
	return data().get("species", {}).get(id, {})

# the most slots anything has
static func max_capacity() -> int:
	return int(BattleConfig.num("slots", "max", 12))

# the energy kind for a Pokemon type (normal -> colorless)
static func energy_of(t: String) -> String:
	t = t.to_lower()
	return String(data().get("type_energy", {}).get(t, t))

static func energy_name(kind: String) -> String:
	if kind == ANY: return "Any"
	return String(data().get("energy_names", {}).get(kind, kind.capitalize()))

static func energy_types() -> Array:
	var v: Array = data().get("energy_types", [])
	return v if not v.is_empty() else [COLORLESS]

static func type_mult(atk: String, def_types: Array) -> float:
	var row: Dictionary = data().get("type_chart", {}).get(atk, {})
	var m := 1.0
	for t in def_types: m *= float(row.get(String(t), 1.0))
	return m

# ---------- slots (battle_config slots.table) ----------
static func slots_for(lv: int, _sp := "") -> int:
	var table: Dictionary = BattleConfig.sect("slots").get("table", {"1": 4})
	var best := 1
	var best_lv := -1
	for k in table:
		var kl := int(k)
		if kl <= lv and kl > best_lv:
			best_lv = kl; best = int(table[k])
	return clampi(best, 1, max_capacity())

# old name: slots by level
static func capacity_for(lv: int, sp := "") -> int:
	return slots_for(lv, sp)

static func _slot_levels() -> Array:
	var keys: Array = BattleConfig.sect("slots").get("table", {}).keys().map(func(k): return int(k))
	keys.sort()
	return keys

# the next level that adds a slot (-1 at the top)
static func next_slot_level(lv: int, sp := "") -> int:
	var cur := slots_for(lv, sp)
	for kl in _slot_levels():
		if kl > lv and slots_for(kl, sp) > cur: return kl
	return -1

# the level it gets its n-th slot (n from 1); -1 if never
static func level_for_slot(n: int, sp := "") -> int:
	if slots_for(1, sp) >= n: return 1
	for kl in _slot_levels():
		if slots_for(kl, sp) >= n: return kl
	return -1

# a cost as an Array of kinds (from an Array, a {kind: n} Dictionary, a move id or a move)
static func cost_of(c) -> Array:
	if c is String:
		var ov = BattleConfig.sect("costs").get("overrides", {}).get(c, null)
		if ov is Array and not ov.is_empty(): return cost_of(ov)
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
	level = maxi(1, lv)
	slots = slots_for(level, species)
	_refresh_params()
	focus = clampf(float(params.start), 0.0, fmax())
	for k in pool_kinds(): pools[k] = {"ready": 0, "spent": 0}
	_sync("init")

func _refresh_params() -> void:
	params = BattleConfig.focus_for(species, types)
	var P := BattleConfig.sect("perks")
	for p in perks:
		var d = P.get(String(p), {})
		if not d is Dictionary: continue
		params.start = float(params.start) + float(d.get("start", 0.0))
		params.gain = float(params.gain) + float(d.get("gain", 0.0))
		params.chip_cap = int(params.chip_cap) + int(d.get("chip_cap", 0))
		params.disrupt_resist = float(params.disrupt_resist) + float(d.get("disrupt_resist", 0.0))
	params.disrupt_resist = clampf(float(params.disrupt_resist), 0.0, 1.0)

func add_perk(id: String) -> void:
	if id in perks: return
	perks.append(id)
	_refresh_params()
	_sync("perk")

# a battle-ready one: knows every move it can at its level (a wild Pokemon, or a fresh one)
static func make(sp: String, lv := 1, learned = null) -> BattleEnergy:
	var e := BattleEnergy.new(sp, lv)
	if learned is Array:
		for id in learned:
			if not String(id) in e.known: e.known.append(String(id))
	else:
		for id in e.learnable_at(e.level): e.known.append(id)
	e.auto_equip(true)
	return e

# a wild one, its focus set by how the battle found it (battle_config focus.wild_start)
static func make_wild(sp: String, lv: int, state := "default") -> BattleEnergy:
	var e := make(sp, lv)
	var ws: Dictionary = BattleConfig.sect("focus").get("wild_start", {})
	var base := float(ws.get(state, ws.get("default", 20)))
	var shift := float(e.params.start) - BattleConfig.num("focus", "start", 20.0)
	e.set_focus(maxf(0.0, base + shift), "wild")
	return e

# ---------- focus ----------
func fmax() -> float: return BattleConfig.num("focus", "max", 100.0)
func step() -> float: return maxf(1.0, float(params.get("step", 20.0)))
func chip_cap() -> int: return maxi(1, int(params.get("chip_cap", 5)))
# old name: the most chips it can hold
var capacity: int:
	get: return chip_cap()

# chips its focus has earned (the bar's thresholds): never disagrees with the bar
func earned() -> int:
	return mini(int(floor(focus / step() + 0.0001)), chip_cap())

func earned_at(f: float) -> int:
	return mini(int(floor(f / step() + 0.0001)), chip_cap())

# the focus thresholds (the bar's ticks): [20, 40, 60, 80, 100]
func thresholds() -> Array:
	var out := []
	for i in range(1, chip_cap() + 1):
		var v := i * step()
		if v <= fmax() + 0.001: out.append(v)
	return out

func gain_per_turn() -> float: return float(params.get("gain", 10.0))

func set_focus(f: float, reason := "set") -> void:
	var old := focus
	focus = clampf(f, 0.0, fmax())
	if focus < fmax() - 0.001 and locked_in: _set_locked_in(false)
	if not is_equal_approx(old, focus): focus_changed.emit(old, focus, reason)
	_sync(reason)

func add_focus(d: float, reason := "gain") -> void:
	set_focus(focus + d, reason)
	if focus >= fmax() - 0.001 and not locked_in and reason != "rest": _set_locked_in(true)

func _set_locked_in(on: bool) -> void:
	if locked_in == on: return
	locked_in = on
	var mode := String(BattleConfig.val("locked_in", "mode", "acc_crit"))
	if on and mode in ["wild_chip", "both"]:
		bonus.ready = int(BattleConfig.num("locked_in", "wild_chip", 1))
		bonus.spent = 0
	elif not on:
		bonus.ready = 0; bonus.spent = 0
	locked_in_changed.emit(on)
	changed.emit()

func acc_bonus() -> float:
	if not locked_in or String(BattleConfig.val("locked_in", "mode", "acc_crit")) == "wild_chip": return 0.0
	return BattleConfig.num("locked_in", "acc_bonus", 10.0)

func crit_bonus() -> int:
	if not locked_in or String(BattleConfig.val("locked_in", "mode", "acc_crit")) == "wild_chip": return 0
	return int(BattleConfig.num("locked_in", "crit_stages", 1))

# disruption: focus down a step (never a full reset), Locked In lost, the extra
# chips gone. amount < 0: the config's step. Returns the chip kinds lost.
func disrupt(amount := -1.0, source := "") -> Array:
	var D := BattleConfig.sect("disruption")
	if amount < 0.0:
		amount = float(D.get("moves", {}).get(source, D.get("step", 15)))
	amount *= 1.0 - float(params.get("disrupt_resist", 0.0))
	disturbed = true
	if locked_in: _set_locked_in(false)
	var before := chip_list().map(func(c): return c.kind)
	set_focus(focus - amount, "disrupt")
	var after := chip_list().map(func(c): return c.kind)
	for k in after: before.erase(k)
	return before

# ---------- pools ----------
# its pools, typed first (its own types' kinds), Colorless last; up to four
func pool_kinds() -> Array:
	var out := []
	for t in types:
		var k := energy_of(String(t))
		if k != COLORLESS and not k in out: out.append(k)
	for k in pools:
		if k != COLORLESS and not k in out: out.append(k)
	out = out.slice(0, 3)
	out.append(COLORLESS)
	return out

func typed_pools() -> Array:
	return pool_kinds().filter(func(k): return k != COLORLESS)

func pool_cap(kind: String) -> int:
	if kind == COLORLESS: return chip_cap()
	return int(params.get("typed_pool_cap", 3))

func _pool(kind: String) -> Dictionary:
	if not pools.has(kind): pools[kind] = {"ready": 0, "spent": 0}
	return pools[kind]

func pool_count(kind: String) -> int:
	var p := _pool(kind)
	var n := int(p.ready) + int(p.spent)
	for l in locks:
		n += l.kinds.count(kind)
	return n

func pool_room(kind: String) -> int:
	return pool_cap(kind) - pool_count(kind)

# chips held: in pools (ready + spent) and locked (Locked In wild chips aside)
func held() -> int:
	var n := 0
	for k in pools: n += int(pools[k].ready) + int(pools[k].spent)
	for l in locks: n += l.kinds.filter(func(x): return x != ANY).size()
	return n

func locked_count() -> int:
	var n := 0
	for l in locks: n += l.kinds.size()
	return n

func total() -> int: return held() + int(bonus.ready) + int(bonus.spent)

# the ready chips, flat (kinds), in pool order; Locked In wild chips last
var chips: Array:
	get: return _ready_list()
	set(v): _set_ready(v)

func _ready_list() -> Array:
	var out := []
	for k in pool_kinds():
		for i in int(_pool(k).ready): out.append(k)
	for i in int(bonus.ready): out.append(ANY)
	return out

# (tests and old callers) these chips, all ready; focus follows so the bar agrees
func _set_ready(v: Array) -> void:
	for k in pools: pools[k] = {"ready": 0, "spent": 0}
	locks.clear()
	pending = 0
	var b := 0
	for k in v:
		k = String(k)
		if k == ANY: b += 1; continue
		_pool(k).ready += 1
	bonus = {"ready": b, "spent": 0}
	var n := held()
	if earned() != n:
		var old := focus
		focus = clampf(n * step(), 0.0, fmax())
		if n > chip_cap(): params.chip_cap = n
		focus_changed.emit(old, focus, "set")
	changed.emit()

# every chip as shown: {kind, state: ready | spent | locked, pool, lock}; pools in
# order (ready, spent, locked), then the wild chips
func chip_list() -> Array:
	var out := []
	for k in pool_kinds():
		var p := _pool(k)
		for i in int(p.ready): out.append({"kind": k, "state": "ready", "pool": k, "lock": -1})
		for i in int(p.spent): out.append({"kind": k, "state": "spent", "pool": k, "lock": -1})
		for l in locks:
			for x in l.kinds:
				if x == k: out.append({"kind": k, "state": "locked", "pool": k, "lock": int(l.id)})
	for i in int(bonus.ready): out.append({"kind": ANY, "state": "ready", "pool": ANY, "lock": -1})
	for i in int(bonus.spent): out.append({"kind": ANY, "state": "spent", "pool": ANY, "lock": -1})
	for l in locks:
		for x in l.kinds:
			if x == ANY: out.append({"kind": ANY, "state": "locked", "pool": ANY, "lock": int(l.id)})
	return out

func available() -> int:
	return _ready_list().size()

# keeps the chips in step with the focus: new ones wait for a pool (or go by the
# auto rule), extra ones are dropped (pending, spent, ready Colorless, ready typed, locked)
func _sync(reason := "") -> void:
	var want := earned()
	var have := held() + pending
	if want > have:
		pending += want - have
		_place_pending(reason)
	elif want < have:
		var drop := have - want
		while drop > 0 and pending > 0: pending -= 1; drop -= 1
		for state in ["spent", "ready"]:
			for k in [COLORLESS] + typed_pools():
				while drop > 0 and int(_pool(k)[state]) > 0:
					_pool(k)[state] -= 1; drop -= 1
		while drop > 0 and not locks.is_empty():
			var l: Dictionary = locks.back()
			l.kinds.pop_back(); drop -= 1
			if l.kinds.is_empty():
				locks.pop_back()
				lock_ended.emit(l, "lost")
	changed.emit()

func needs_pick() -> bool:
	if pending <= 0 or pick_mode != "player": return false
	return _rule_pool() == ""

# where a new chip goes with no choice made: "" when it is the player's choice
func _rule_pool() -> String:
	var tp := typed_pools()
	if tp.is_empty(): return COLORLESS
	if tp.size() == 1 and bool(BattleConfig.val("focus", "auto_fill_single_type", true)):
		return tp[0] if pool_room(tp[0]) > 0 else COLORLESS
	var open := tp.filter(func(k): return pool_room(k) > 0)
	if open.is_empty(): return COLORLESS
	return ""

func _place_pending(_reason := "") -> void:
	if pending <= 0: return
	if pick_mode == "player" and _rule_pool() == "":
		pick_needed.emit(pending)
		return
	var gained := []
	while pending > 0:
		var k := _rule_pool()
		if k == "": k = auto_pool()
		gained.append(_add_chip(k))
		pending -= 1
	if not gained.is_empty(): _last_gained.append_array(gained)

var _last_gained: Array = []

func _add_chip(kind: String) -> String:
	if kind != COLORLESS and pool_room(kind) <= 0: kind = COLORLESS
	if kind == COLORLESS and pool_room(COLORLESS) <= 0:
		for k in typed_pools():
			if pool_room(k) > 0: kind = k; break
	_pool(kind).ready += 1
	return kind

# the pool the AI sends a new chip to: what its equipped moves' typed costs lack most
func auto_pool() -> String:
	var tp := typed_pools().filter(func(k): return pool_room(k) > 0)
	if tp.is_empty(): return COLORLESS
	var best := ""
	var best_s := -INF
	for k in tp:
		var need := 0
		for id in usable():
			need = maxi(need, cost_of(id).count(k))
		var s := float(need - pool_count(k)) + (0.01 if k == tp[0] else 0.0)
		if s > best_s: best_s = s; best = k
	return best

# the player's pick: every chip waiting this turn goes to that pool (one choice
# a turn); "" or a full pool: the default pool. Returns the kinds placed.
func pick_pool(kind := "") -> Array:
	var out := []
	if pending <= 0: return out
	if kind == "" or not kind in pool_kinds(): kind = String(BattleConfig.val("focus", "default_pool", COLORLESS))
	var first := chip_list().size()
	while pending > 0:
		var k := kind if pool_room(kind) > 0 else COLORLESS
		out.append(_add_chip(k))
		pending -= 1
	restored.emit(first, out)
	changed.emit()
	return out

# ---------- the turn ----------
# a new turn: spent chips come back, focus +gain (unless disrupted since the last
# turn or asleep), the chips it earned join the pools, Locked In at max
func begin_turn() -> Array:
	turn += 1
	for k in pools:
		pools[k].ready = int(pools[k].ready) + int(pools[k].spent)
		pools[k].spent = 0
	bonus.ready = int(bonus.ready) + int(bonus.spent)
	bonus.spent = 0
	# a lock set two turns back that nothing triggered (safety: end_turn does this)
	_expire(turn - 1)
	var D := BattleConfig.sect("disruption")
	var gain_ok := not (disturbed and bool(BattleConfig.val("focus", "disruption_skips_gain", true)))
	if asleep and bool(D.get("sleep_blocks_gain", true)): gain_ok = false
	if turn == 1 and not bool(BattleConfig.val("focus", "gain_on_first_turn", true)): gain_ok = false
	disturbed = false
	_last_gained = []
	if gain_ok: add_focus(gain_per_turn(), "gain")
	else: _sync("turn")
	if focus >= fmax() - 0.001 and not locked_in and gain_ok: _set_locked_in(true)
	turn_started.emit(turn, [], _last_gained.duplicate())
	changed.emit()
	return chips

# the end of a turn: locks past their expiry release
func end_turn() -> Array:
	return _expire(turn)

func _expire(at_turn: int) -> Array:
	var out := []
	for l in locks.duplicate():
		if int(l.expires_turn) <= at_turn:
			release_lock(int(l.id), "expired")
			out.append(l)
	return out

# a new battle (the focus stays: it is persistent)
func reset_battle() -> void:
	turn = 0
	for k in pools:
		pools[k].ready = int(pools[k].ready) + int(pools[k].spent)
		pools[k].spent = 0
	for l in locks.duplicate(): release_lock(int(l.id), "cancelled")
	commit = {}
	disturbed = false
	asleep = false
	_sync("battle")
	changed.emit()

# a battle begins: its stored focus (+ perks' start), chips re-dealt by the auto rule
func start_battle(_kind := "wild") -> void:
	reset_battle()
	var ps := 0.0
	var P := BattleConfig.sect("perks")
	for p in perks: ps += float(P.get(String(p), {}).get("start", 0.0))
	if ps > 0.0: add_focus(ps, "perk")
	var was := pick_mode
	pick_mode = "auto"
	_place_pending("battle")
	pick_mode = was

# ---------- paying (TCG matching) ----------
# which chips (indices into have) would pay cost, or null. Every typed cost is
# matched first, by its own kind (a wild "any" chip if none); then every
# Colorless cost from what is left, real Colorless chips first, then the kind it
# has most of (the rarer kinds stay for the typed costs), wild chips last.
static func match_cost(have: Array, cost) -> Variant:
	var need := cost_of(cost)
	var free := []
	for i in have.size(): free.append(i)
	var used := []
	var colorless := 0
	var typed_need := []
	for k in need:
		if k == COLORLESS: colorless += 1
		else: typed_need.append(k)
	for k in typed_need:
		var at := -1
		for j in range(free.size() - 1, -1, -1):
			if String(have[free[j]]) == k: at = j; break
		if at < 0:
			for j in range(free.size() - 1, -1, -1):
				if String(have[free[j]]) == ANY: at = j; break
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
			var s := float(counts[kind]) + (100.0 if kind == COLORLESS else 0.0) - (1000.0 if kind == ANY else 0.0) + j * 0.001
			if s > best_score: best_score = s; best = j
		used.append(free[best])
		free.remove_at(best)
	return used

func can_pay(cost) -> bool:
	return match_cost(chips, cost) != null

# the chips a cost would use (for the bar's preview): the indices into chips, [] if it can't
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
		if at < 0:
			for j in range(free.size() - 1, -1, -1):
				if String(have[free[j]]) == ANY: at = j; break
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

# ready-list index -> chip_list index
func _list_index(ready_i: int) -> int:
	var ready := _ready_list()
	var kind: String = ready[ready_i]
	var nth := 0
	for j in ready_i:
		if ready[j] == kind: nth += 1
	var L := chip_list()
	var seen := 0
	for i in L.size():
		if L[i].kind == kind and L[i].state == "ready":
			if seen == nth: return i
			seen += 1
	return -1

# takes the chips a cost needs out of ready: {idx (ready indices, ascending), list_idx, kinds} or {}
func _take(cost) -> Dictionary:
	var have := chips
	var m = match_cost(have, cost)
	if m == null: return {}
	var idx: Array = m.duplicate()
	idx.sort()
	var li := []
	var kinds := []
	for i in idx:
		li.append(_list_index(i))
		kinds.append(have[i])
	return {"idx": idx, "list_idx": li, "kinds": kinds}

# pays cost: the chips used (indices into chips before paying, ascending), or [] if it can't.
# The chips stay in their pools, spent (dim) until the next turn.
func pay(cost, move_id := "") -> Array:
	var t := _take(cost)
	if t.is_empty(): return []
	for k in t.kinds:
		if k == ANY: bonus.ready -= 1; bonus.spent += 1
		else: _pool(k).ready -= 1; _pool(k).spent += 1
	spent.emit(t.list_idx, t.kinds, move_id)
	changed.emit()
	return t.idx

# gives back chips paid this turn (a queued move taken back)
func refund(kinds: Array) -> void:
	for k in kinds:
		if k == ANY:
			if int(bonus.spent) > 0: bonus.spent -= 1; bonus.ready += 1
		elif int(_pool(k).spent) > 0: _pool(k).spent -= 1; _pool(k).ready += 1
	changed.emit()

func use_move(id: String) -> bool:
	if not id in known or locked(id): return false
	return not pay(cost_of(id), id).is_empty()

# ---------- locks (reaction moves) ----------
# pays a reaction's cost with locked chips: they wait, out of play, for the
# opponent's next attack, and release at the end of the next turn if none comes.
# Returns the lock ({} if it can't pay or has too many locks).
func lock(move_id: String) -> Dictionary:
	var m := move(move_id)
	var r: Dictionary = m.get("reaction", {})
	if locks.size() >= int(BattleConfig.num("locks", "max_locks", 2)): return {}
	var t := _take(cost_of(move_id))
	if t.is_empty(): return {}
	for k in t.kinds:
		if k == ANY: bonus.ready -= 1
		else: _pool(k).ready -= 1
	_lock_seq += 1
	var L := {"id": _lock_seq, "move": move_id, "kinds": t.kinds.duplicate(), "trigger": String(r.get("trigger", "any")),
		"effect": String(r.get("effect", "evade")), "scope": String(r.get("scope", "next")), "mult": float(r.get("mult", 1.0)),
		"set_turn": turn, "expires_turn": turn + int(BattleConfig.num("locks", "expiry_turns", 1))}
	locks.append(L)
	lock_set.emit(L)
	changed.emit()
	return L

# how a lock ends: triggered (it worked), wasted (a wrong guess), expired, broken
# (Feint), cancelled. Its chips go back to their pool as spent (ready next turn).
func release_lock(id: int, how := "expired") -> Dictionary:
	for i in locks.size():
		if int(locks[i].id) == id:
			var L: Dictionary = locks[i]
			locks.remove_at(i)
			for k in L.kinds:
				if k == ANY: bonus.spent += 1
				else: _pool(k).spent += 1
			lock_ended.emit(L, how)
			changed.emit()
			return L
	return {}

func has_lock(effect := "") -> bool:
	for l in locks:
		if effect == "" or l.effect == effect: return true
	return false

# the locks as a viewer sees them: the owner sees which move, the opponent a face-down card
func lock_view(owner: bool) -> Array:
	var out := []
	for l in locks:
		if owner: out.append({"id": l.id, "move": l.move, "kinds": l.kinds.duplicate(), "trigger": l.trigger, "face_down": false, "n": l.kinds.size()})
		else: out.append({"id": l.id, "face_down": true, "n": l.kinds.size()})
	return out

# ---------- two-phase moves ----------
func commit_to(move_id: String) -> void:
	commit = {"move": move_id, "semi": String(move(move_id).get("two_phase", {}).get("semi", "charging")), "turn": turn}
	# a dodge set before going under or up is wasted: it's out of reach anyway
	if commit.semi in ["underground", "airborne", "underwater"]:
		for l in locks.duplicate():
			if l.effect == "evade": release_lock(int(l.id), "wasted")
	changed.emit()

func clear_commit() -> void:
	if commit.is_empty(): return
	commit = {}
	changed.emit()

func semi() -> String:
	return String(commit.get("semi", ""))

# ---------- slots, learning (never forgotten) ----------
func learnset() -> Array:
	return species_data(species).get("learnset", [])

func tm_moves() -> Array:
	return species_data(species).get("tm", [])

# moves it can learn by level at lv that it doesn't know yet
func learnable_at(lv: int) -> Array:
	var out := []
	for row in learnset():
		var id := String(row.get("move", ""))
		if id == "" or id in known or id in out: continue
		if int(row.get("level", 1)) > lv: continue
		if move(id).is_empty(): continue
		out.append(id)
	return out

func learn(id: String) -> bool:
	if id in known: return false
	if not id in learnable_at(level): return false
	known.append(id)
	if equipped.size() < slots: equipped.append(id)
	changed.emit()
	return true

# by TM or a tutor (any listed in its tm, or force)
func teach(id: String, force := false) -> bool:
	if id in known or move(id).is_empty(): return false
	if not force and not id in tm_moves(): return false
	known.append(id)
	if equipped.size() < slots: equipped.append(id)
	changed.emit()
	return true

# changes the level (it can't go down): returns {slots (gained), learnable (new)}
func set_level(lv: int) -> Dictionary:
	lv = maxi(lv, level)
	var before := slots
	level = lv
	slots = slots_for(level, species)
	auto_equip(false)
	changed.emit()
	return {"slots": slots - before, "learnable": learnable_at(level)}

# fills free slots from known moves: latest: the last learned first (a wild one,
# as in the games); else in the order learned
func auto_equip(latest := false) -> void:
	equipped = equipped.filter(func(id): return id in known)
	if latest and equipped.is_empty():
		var n := mini(slots, known.size())
		equipped = known.slice(known.size() - n)
		return
	for id in known:
		if equipped.size() >= slots: break
		if not id in equipped: equipped.append(id)

func equip(id: String) -> bool:
	if not id in known or id in equipped or equipped.size() >= slots: return false
	equipped.append(id)
	changed.emit()
	return true

func unequip(id: String) -> bool:
	if not id in equipped: return false
	equipped.erase(id)
	changed.emit()
	return true

func swap(out_id: String, in_id: String) -> bool:
	if not out_id in equipped or not in_id in known or in_id in equipped: return false
	equipped[equipped.find(out_id)] = in_id
	changed.emit()
	return true

# the moves it can use now (equipped, and payable by a full bar)
func usable() -> Array:
	return equipped.filter(func(id): return id in known and cost_of(id).size() <= chip_cap() + int(BattleConfig.num("locked_in", "wild_chip", 1)))

# known but not in a slot (or too big for any bar): the move list shows it locked
func locked(id: String) -> bool:
	if not id in equipped and id in known: return true
	return cost_of(id).size() > chip_cap() + int(BattleConfig.num("locked_in", "wild_chip", 1))

# ---------- items (battle_config items) ----------
# n more chips now (focus rises to match), into kind's pool ("" = the auto rule). Returns how many.
func restore(n: int, kind := "") -> int:
	var first := chip_list().size()
	var added := []
	for i in n:
		if held() + pending >= chip_cap(): break
		var old := focus
		focus = minf(fmax(), maxf(focus, (earned() + 1) * step()))
		focus_changed.emit(old, focus, "item")
		var k := kind
		if k == "" or k == "own": k = _rule_pool() if _rule_pool() != "" else auto_pool()
		added.append(_add_chip(k))
	if focus >= fmax() - 0.001: _set_locked_in(true)
	if not added.is_empty():
		restored.emit(first, added)
		changed.emit()
	return added.size()

static func items() -> Dictionary:
	return BattleConfig.sect("items")

# an energy item by id or as a Dictionary: the chips it added (a focus burst: the chips that came of it)
func use_item(item) -> int:
	var it: Dictionary = item if item is Dictionary else items().get(String(item), {})
	if it.is_empty() or not (it.has("chips") or it.has("focus") or it.has("focus_to") or it.has("restore")): return 0
	if it.has("chips") or it.has("restore"):
		var pool := String(it.get("pool", it.get("type", "")))
		if pool == "own": pool = typed_pools()[0] if not typed_pools().is_empty() else COLORLESS
		return restore(int(it.get("chips", it.get("restore", 1))), pool)
	var before := held() + pending
	var was := pick_mode
	pick_mode = "auto"
	if it.has("focus_to"): add_focus(maxf(0.0, float(it.focus_to) - focus), "item")
	else: add_focus(float(it.get("focus", 0.0)), "item")
	pick_mode = was
	return held() + pending - before

# ---------- between battles (game time only) ----------
func is_alert() -> bool: return bool(params.get("alert", true))

# game minutes pass (travel, waiting): focus decays; Locked In fades sooner
func elapse(minutes: float, ctx := {}) -> void:
	if minutes <= 0.0: return
	var D := BattleConfig.sect("decay")
	var before := idle_minutes
	idle_minutes += minutes
	if locked_in and idle_minutes >= float(D.get("locked_in_grace_minutes", 15)): _set_locked_in(false)
	var per_h: float
	var mins: float
	if in_gym or ctx.get("in_gym", false):
		per_h = float(D.get("in_gym_per_hour", 0)); mins = minutes
	elif is_alert():
		var grace := float(D.get("grace_minutes", 60))
		mins = maxf(0.0, idle_minutes - maxf(grace, before))
		per_h = float(D.get("per_hour", 4))
	else:
		per_h = float(D.get("relaxed_per_hour", 12)); mins = minutes
	if per_h > 0.0 and mins > 0.0: set_focus(focus - per_h * mins / 60.0, "decay")

# a story rest (battle_config decay.rests): rest_stop, camp_night, home_night, travel_hour
func rest(kind := "rest_stop") -> void:
	var D := BattleConfig.sect("decay")
	var k := float(D.get("rests", {}).get(kind, 0.5))
	var f := focus * k
	if not is_alert(): f = minf(f, float(D.get("relaxed_floor_cap", 10)))
	_set_locked_in(false)
	in_gym = false
	set_focus(f, "rest")

# a Pokemon Center: healed, and relaxed part of the way (not fully)
func center() -> void:
	_set_locked_in(false)
	in_gym = false
	set_focus(focus * BattleConfig.num("decay", "center_keep", 0.4), "center")

func faint() -> void:
	_set_locked_in(false)
	for l in locks.duplicate(): release_lock(int(l.id), "cancelled")
	commit = {}
	if bool(BattleConfig.val("disruption", "faint_to_zero", true)): set_focus(0.0, "faint")

# after a battle: result {kind: wild | trainer | gym_trainer | leader, won, fainted}.
# Gym trainers before the leader warm it up (battle_config gym_warmup).
func after_battle(result := {}) -> void:
	reset_battle()
	idle_minutes = 0.0
	if result.get("fainted", false): faint(); return
	var kind := String(result.get("kind", "wild"))
	var G := BattleConfig.sect("gym_warmup")
	if kind == "gym_trainer" and result.get("won", true):
		in_gym = true
		gym_wins += 1
		var f := minf(float(G.get("max_carry", 80)), focus * float(G.get("keep", 1.0)) + float(G.get("bonus_per_trainer", 10)))
		set_focus(f, "warmup")
	elif kind == "leader":
		in_gym = false
		gym_wins = 0

# ---------- what it can do ----------
func affordable_moves(known_moves = null) -> Array:
	var ids: Array = usable() if known_moves == null else known_moves
	var out := []
	for id in ids:
		var c := cost_of(id)
		if c.is_empty() or locked(id): continue
		if can_pay(c): out.append(id)
	return out

# (old callers) the kind its i-th new chip goes to by the auto rule
func focus_kind(_i := 0) -> String:
	var k := _rule_pool()
	return k if k != "" else auto_pool()

# ---------- the wild planner ----------
# What a value-minded Pokemon does with this turn's chips: the best ordered list
# of moves (repeats allowed) by style (battle_config ai.wild_styles):
#   aggressive  spends big: raw damage, a bias toward the costliest move
#   strategic   spends several cheap: effects and number of actions count
#   evasive     sand in the eyes, wind, getting away; damage counts little
# ctx (all optional): uses {move: times used this battle}, max_actions, rng,
# jitter (0..1), role_w {role: weight}, move_bonus {move: value}, exclude [ids],
# reaction_value (what setting a reaction is worth; default half the config's).
# A two-phase move ends the plan (it's committed); reactions at most max_locks.
func _AI() -> Dictionary: return BattleConfig.sect("ai")

func _style_k(style: String) -> Dictionary:
	var S: Dictionary = _AI().get("wild_styles", {})
	return S.get(style, S.get("strategic", {"dmg": 0.9, "status": 1.3, "per_action": 8.0, "big": 0.0, "force_out": 0.5, "repeat": 0.75}))

func _move_value(id: String, style: String, times: int, in_turn := 0, ctx := {}) -> float:
	var m := move(id)
	var K := _style_k(style)
	var A := _AI()
	var SV: Dictionary = A.get("status_value", {})
	var role := role_of(id)
	var acc := float(m.get("accuracy", 100)) / 100.0
	if acc <= 0.0: acc = 1.0
	var pw := float(m.get("power", 0))
	if role == "two_phase": pw *= float(A.get("two_phase_value", 1.15))
	var v := pw * acc * float(K.get("dmg", 1.0))
	v *= pow(float(K.get("repeat", 0.75)), in_turn) * pow(float(A.get("repeat_battle", 0.94)), mini(times - in_turn, 4))
	var st := 0.0
	for tag in m.get("effects", []):
		var tv := float(SV.get(tag, 0.0))
		if tag == "force_out": tv *= float(K.get("force_out", 0.5))
		if pw > 0.0 and tag != "fixed_40" and tag != "disrupt": tv *= float(m.get("chance", 0.3))
		st += tv
	if pw <= 0.0 or "fixed_40" in m.get("effects", []):
		st *= acc
		st *= pow(0.5, times)
	v += st * float(K.get("status", 1.0))
	if role == "reaction":
		v = float(ctx.get("reaction_value", float(A.get("reaction_value", 30.0)) * 0.5)) * pow(0.4, in_turn)
	if int(m.get("priority", 0)) > 0 and in_turn == 0 and role != "reaction": v += 6.0
	v *= float(ctx.get("role_w", {}).get(role, 1.0))
	v += float(ctx.get("move_bonus", {}).get(id, 0.0))
	return v

func plan_turn(known_moves = null, style := "strategic", ctx := {}) -> Array:
	if not style in STYLES: style = "strategic"
	var ids := []
	var excl: Array = ctx.get("exclude", [])
	for id in (usable() if known_moves == null else known_moves):
		var c := cost_of(id)
		if c.is_empty() or move(id).is_empty() or id in ids or id in excl: continue
		if locked(id) and known_moves == null: continue
		ids.append(String(id))
	if ids.is_empty() or chips.is_empty(): return []
	var best := {"score": -INF, "seq": []}
	var uses: Dictionary = ctx.get("uses", {})
	var rng: RandomNumberGenerator = ctx.get("rng", null)
	var jitter := float(ctx.get("jitter", 0.0))
	var noise := {}
	for id in ids: noise[id] = (rng.randf_range(-1.0, 1.0) * jitter * 25.0) if rng != null else 0.0
	var room := int(ctx.get("max_actions", int(_AI().get("max_actions", 6))))
	_search(chips.duplicate(), ids, 0, [], style, uses, noise, room, best, ctx)
	return _order(best.seq, style)

func _search(have: Array, ids: Array, from: int, seq: Array, style: String, uses: Dictionary, noise: Dictionary, room: int, best: Dictionary, ctx: Dictionary) -> void:
	var s := _score(seq, have.size(), style, uses, noise, ctx)
	if s > best.score or (is_equal_approx(s, best.score) and seq.size() < best.seq.size()):
		best.score = s; best.seq = seq.duplicate()
	if room <= 0 or have.is_empty(): return
	var phased := seq.any(func(x): return role_of(x) == "two_phase")   # one commitment a plan (it goes last)
	var reacts := seq.filter(func(x): return role_of(x) == "reaction").size() + locks.size()
	for i in range(from, ids.size()):
		var id: String = ids[i]
		if role_of(id) == "reaction" and (reacts >= int(BattleConfig.num("locks", "max_locks", 2)) or id in seq): continue
		if role_of(id) == "two_phase" and (phased or not commit.is_empty()): continue
		var m = match_cost(have, id)
		if m == null: continue
		var rest := have.duplicate()
		var idx: Array = m.duplicate()
		idx.sort()
		for j in range(idx.size() - 1, -1, -1): rest.remove_at(idx[j])
		seq.append(id)
		_search(rest, ids, i, seq, style, uses, noise, room - 1, best, ctx)
		seq.pop_back()

func _score(seq: Array, left: int, style: String, uses: Dictionary, noise: Dictionary, ctx := {}) -> float:
	var K := _style_k(style)
	var s := -float(_AI().get("waste", 20.0)) * left
	var count := {}
	var big := 0
	for id in seq:
		var n := int(count.get(id, 0)) + int(uses.get(id, 0))
		s += _move_value(id, style, n, int(count.get(id, 0)), ctx) + float(K.get("per_action", 0.0)) + float(noise.get(id, 0.0))
		count[id] = int(count.get(id, 0)) + 1
		big = maxi(big, cost_of(id).size())
	return s + float(K.get("big", 0.0)) * big

# the order to act in: reactions and priority moves first; then status before
# attacks (strategic, evasive) or the biggest first (aggressive); a two-phase
# move last; ties keep the plan's order
func _order(seq: Array, style: String) -> Array:
	var rows := []
	for i in seq.size():
		var m := move(seq[i])
		var pri := int(m.get("priority", 0))
		var status := 1 if float(m.get("power", 0)) <= 0.0 else 0
		var k: float
		if style == "aggressive": k = -pri * 100.0 - cost_of(seq[i]).size() * 10.0
		else: k = -pri * 100.0 - status * 10.0 + cost_of(seq[i]).size()
		if role_of(seq[i]) == "two_phase": k += 10000.0
		rows.append([k, i, seq[i]])
	rows.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	return rows.map(func(r): return r[2])

# ---------- saving ----------
func to_dict() -> Dictionary:
	var p := {}
	for k in pools: p[k] = int(pools[k].ready) + int(pools[k].spent)
	return {"species": species, "level": level, "known": known.duplicate(), "equipped": equipped.duplicate(),
		"focus": focus, "pools": p, "locked_in": locked_in, "idle_minutes": idle_minutes, "in_gym": in_gym,
		"gym_wins": gym_wins, "perks": perks.duplicate()}

static func from_dict(d: Dictionary) -> BattleEnergy:
	var e := make(String(d.get("species", "pidgey")), int(d.get("level", 1)), d.get("known", []))
	if d.get("equipped", null) is Array:
		e.equipped = d.equipped.filter(func(id): return id in e.known).slice(0, e.slots)
	for p in d.get("perks", []): e.perks.append(String(p))
	e._refresh_params()
	e.idle_minutes = float(d.get("idle_minutes", 0.0))
	e.in_gym = bool(d.get("in_gym", false))
	e.gym_wins = int(d.get("gym_wins", 0))
	for k in e.pools: e.pools[k] = {"ready": 0, "spent": 0}
	var saved: Dictionary = d.get("pools", {})
	e.focus = clampf(float(d.get("focus", e.focus)), 0.0, e.fmax())
	var room := e.earned()
	for k in saved:
		var n := mini(int(saved[k]), room)
		if n <= 0: continue
		e._pool(String(k)).ready = n
		room -= n
	e._sync("load")
	if bool(d.get("locked_in", false)) and e.focus >= e.fmax() - 0.001: e._set_locked_in(true)
	return e
