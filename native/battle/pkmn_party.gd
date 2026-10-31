class_name PkmnParty
extends PkmnBattle
# The party layer over PkmnBattle (battle/pkmn_battle.gd): each side a team of up
# to six with one active, the way trainer battles go in the games. Pure logic,
# headless, tested by dev/party_test.gd. It only wraps the engine: the active
# Pokémon is the engine's fighter F[side]; a switch puts another of the team's
# Fighters there (each keeps its own BattleEnergy, so focus, pools and HP are
# kept per Pokémon while it sits on the bench).
#
#   var B := PkmnParty.new({"a": [{species, level, known?, equip?, focus?}, ...],
#                           "b": [{species, level, ai: "balanced", ...}, ...],
#                           "kind": "trainer", "seed": 1, "first": "a" | "b" | ""})
#   (a side may also be one Dictionary: a team of one)
#   B.team[side]               every Fighter of the side, in party order
#   B.active[side]             the index of the one out
#   B.first_side               the coin's winner: its actions go first on turn 1
#   B.can_switch(side, i) / B.switch_to(side, i) -> events
#       a switch by choice takes the side's turn: call it before ai_queue / resolve,
#       queue nothing more for that side
#   B.pending[side]            true after the active fainted with others left:
#       the turn stops there; the host asks for the next one (B.ai_pick(side)
#       for a trainer) and calls switch_to; then the next turn
#   B.alive(side) / B.slots(side) -> ["ok" | "fainted" | "empty"] x 6 (the
#       nameplate's Poké Balls)
#   B.results() -> per Pokémon: species, name, level, hp, max_hp, fainted, kos
# The battle is won or lost when a side has none left (the engine's own end).
# Events added: switch_out, switch_in, need_switch, dragged_out.

const TEAM_MAX := 6

var team := {"a": [], "b": []}
var active := {"a": 0, "b": 0}
var pending := {"a": false, "b": false}
var first_side := ""
var kos := {}                    # Fighter -> knockouts it scored
var _entered := {}               # Fighter -> it has been out this battle (start_battle done)

func _init(o := {}) -> void:
	super(PkmnParty._lead(o))
	first_side = String(o.get("first", ""))
	order_fn = Callable(PkmnParty, "coin_order")
	for s in SIDES:
		var list: Array = PkmnParty._list(o.get(s, []))
		team[s] = [F[s]]
		for i in range(1, mini(list.size(), TEAM_MAX)):
			var d: Dictionary = list[i].duplicate()
			if not d.has("ai") and list[0].has("ai"): d["ai"] = list[0].ai
			team[s].append(_make(s, d))

static func _list(v) -> Array:
	if v is Array: return v
	if v is Dictionary: return [v]
	return [{"species": "pidgey", "level": 5}]

static func _lead(o: Dictionary) -> Dictionary:
	var b := o.duplicate()
	for s in SIDES: b[s] = PkmnParty._list(o.get(s, []))[0]
	return b

func start() -> Array:
	for s in SIDES: _entered[F[s]] = true
	return super.start()

# ---------- the team ----------
func alive(s: String) -> int:
	var n := 0
	for f in team[s]: if not f.fainted(): n += 1
	return n

func bench(s: String) -> Array:
	var out := []
	for i in team[s].size():
		if i != int(active[s]) and not team[s][i].fainted(): out.append(i)
	return out

func slots(s: String) -> Array:
	var out := []
	for i in TEAM_MAX:
		if i >= team[s].size(): out.append("empty")
		else: out.append("fainted" if team[s][i].fainted() else "ok")
	return out

func can_switch(s: String, i: int) -> bool:
	if over or i < 0 or i >= team[s].size() or i == int(active[s]): return false
	if team[s][i].fainted(): return false
	var f: Fighter = F[s]
	if not pending[s] and (f.trapped or not f.e.commit.is_empty()): return false   # (held in place, or under the ground: no switching out)
	return true

# why the one out can't be switched out by choice now ("" when it can)
func switch_block(s: String) -> String:
	var f: Fighter = F[s]
	if pending[s] or f.fainted(): return ""
	if f.trapped: return "%s can't escape!" % f.name.to_upper()
	if not f.e.commit.is_empty():
		var w := {"airborne": "is up in the air", "underground": "is underground", "underwater": "is underwater"}
		return "%s %s! It can't be recalled now." % [f.name.to_upper(), String(w.get(f.e.semi(), "is in the middle of its move"))]
	return ""

func switch_to(s: String, i: int) -> Array:
	var out := []
	if not can_switch(s, i): return out
	var old: Fighter = F[s]
	# its queue back (a switch by choice is the side's whole turn)
	while unqueue(s) != "": pass
	old.queue = []
	var txt := ("%s, come back!" % old.name.to_upper() if s == "a" else "%s withdrew %s." % [_owner(s), old.name.to_upper()]) if not old.fainted() \
		else ("%s, return! You did well." % old.name.to_upper() if s == "a" else "%s recalled %s." % [_owner(s), old.name.to_upper()])
	out.append(_ev({"t": "switch_out", "side": s, "index": int(active[s]), "fainted": old.fainted(), "text": txt}))
	_leave(old)
	var nf: Fighter = team[s][i]
	F[s] = nf
	active[s] = i
	pending[s] = false
	nf.queue = []
	if not _entered.has(nf):
		_entered[nf] = true
		nf.e.start_battle(kind)
	out.append(_ev({"t": "switch_in", "side": s, "index": i, "species": nf.species,
		"text": "Go! %s!" % nf.name.to_upper() if s == "a" else "%s sent out %s!" % [_owner(s), nf.name.to_upper()]}))
	return out

var owner_name := {"a": "Ash", "b": "The foe"}
func _owner(s: String) -> String: return String(owner_name.get(s, "The foe"))

# out of the battle for now: the stat stages and the passing states go (as in the
# games); its focus, pools, HP and status stay with it
func _leave(f: Fighter) -> void:
	for k in f.stages: f.stages[k] = 0
	f.confused = 0; f.flinch = false; f.sure_hit = false; f.trapped = false; f.seeded = false
	f.protect_turn = -1; f.drowsy = 0; f.crit_stage = 0; f.barrier = {}; f.identified = false
	if not f.fainted(): f.e.reset_battle()

# the trainer's next one: the best of the bench against the foe out now (its types
# against the foe's, the foe's against it, how much HP it has left, its level)
func ai_pick(s: String) -> int:
	var foe: Fighter = F[other(s)]
	var best := -1
	var bs := -INF
	for i in bench(s):
		var f: Fighter = team[s][i]
		var att := 0.0
		for t in f.types: att = maxf(att, BattleEnergy.type_mult(String(t), foe.types))
		var def := 0.0
		for t in foe.types: def = maxf(def, BattleEnergy.type_mult(String(t), f.types))
		var sc := att * 1.2 - def + float(f.hp) / maxf(1.0, f.max_hp) * 0.8 + f.level * 0.03 + rng.randf() * 0.15
		if sc > bs: bs = sc; best = i
	return best

# ---------- a faint with others left: not the end ----------
func _faint(f: Fighter) -> Array:
	var o: Fighter = F[other(f.side)]
	if o != f: kos[o] = int(kos.get(o, 0)) + 1
	var left := 0
	for x in team[f.side]: if x != f and not x.fainted(): left += 1
	if left == 0 or over: return super._faint(f)
	f.e.faint()
	var out := [_ev({"t": "faint", "side": f.side, "text": "%s fainted!" % _nm(f)})]
	pending[f.side] = true
	out.append(_ev({"t": "need_switch", "side": f.side, "left": left, "text": "%s has %d left." % [_owner(f.side), left]}))
	return out

# a step, then: a side waiting for its next Pokémon stops the turn (the rest of
# this turn's actions are dropped, the chips of the ones that never played given
# back); Roar and Whirlwind against a team drag the next one out instead of ending it
func step() -> Array:
	var out := super.step()
	if over and kind != "wild" and outcome in ["blown_away", "wild_fled"]:
		var s := "a" if outcome == "blown_away" else "b"
		if not bench(s).is_empty():
			over = false
			outcome = ""
			var b := bench(s)
			var i: int = b[rng.randi() % b.size()]
			out.append(_ev({"t": "dragged_out", "side": s, "text": "%s was dragged out!" % team[s][i].name.to_upper()}))
			out.append_array(switch_to(s, i))
			_drop_rest()
	if (pending.a or pending.b) and _resolving and not over: _drop_rest()
	return out

func _drop_rest() -> void:
	for p in _order:
		var q: Dictionary = p[1]
		var f: Fighter = F[String(p[0])]
		if not q.get("free", false) and not f.fainted(): f.e.refund(q.get("kinds", []))
	_order = []

# turn 1's order: the coin's winner first, then the sides take turns (each side's
# own order kept); every other turn the engine's speed order
static func coin_order(b: PkmnBattle, queues: Dictionary) -> Array:
	var base: Array = PkmnBattle.speed_interleave(b, queues)
	var fs: String = (b as PkmnParty).first_side if b is PkmnParty else ""
	if b.turn != 1 or fs == "": return base
	var per := {"a": [], "b": []}
	for p in base: per[String(p[0])].append(p)
	var out := []
	var nxt := fs
	while not per.a.is_empty() or not per.b.is_empty():
		if per[nxt].is_empty(): nxt = "b" if nxt == "a" else "a"
		out.append(per[nxt].pop_front())
		nxt = "b" if nxt == "a" else "a"
	return out

# ---------- the end ----------
func finish() -> void:
	for s in SIDES:
		for f in team[s]:
			f.e.after_battle({"kind": kind, "won": (outcome == "won") == (s == "a"), "fainted": f.fainted()})

func results() -> Dictionary:
	var out := {"outcome": outcome, "turns": turn, "a": [], "b": []}
	for s in SIDES:
		for f in team[s]:
			out[s].append({"species": f.species, "name": f.name, "level": f.level, "hp": f.hp, "max_hp": f.max_hp,
				"fainted": f.fainted(), "kos": int(kos.get(f, 0)), "focus": f.e.focus, "used": _entered.has(f)})
	return out
