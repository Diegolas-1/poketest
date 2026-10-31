class_name PkmnDoubles
extends PkmnParty
# Double battles, a testing option of the Battle Arena (the TRAINER page's
# SINGLES / DOUBLES): two out on each side, each move aimed at one foe, the other
# foe, or (an attack or a move on another) the ally. Pure logic, headless, tested
# by dev/party_test.gd. Additive: it drives the one-on-one engine (pkmn_battle.gd)
# by putting each action's user and target in its two places (F[side] and
# F[other]) just for that action, so every rule (damage, locks, two-phase moves,
# focus, chips) is the engine's own. Balance for doubles is not tuned.
#
#   var B := PkmnDoubles.new({"a": [...], "b": [...], "kind": "trainer", "first": "a"})
#   B.actives(side) -> [Fighter, Fighter] (null for an empty place)
#   B.select(side, k)          F[side] is place k's Pokémon (the HUD, queue, pick_pool act on it)
#   B.queue_at(side, k, id, target) -> bool   target: {"side": s, "k": n}; a self move needs none
#   B.targets(side, k, id) -> [{side, k}]     where it can aim (foe 0, foe 1, the ally)
#   B.ai_queue(side)           the trainer AI for both its places (each picks its target)
#   begin_turn / begin_resolve / step / resolve as the engine: all four act, by
#   priority then speed (turn 1: the coin's winner's side first)
#   B.pending_places(side) -> [k]   a place whose Pokémon fainted with others on the bench:
#   B.fill(side, k, i)         send team[i] there (B.ai_pick(side) picks for a trainer)
#   switch_place(side, k, i)   a switch by choice (that place's turn)
# A side with no one left on the field and on the bench loses.

var place := {"a": [0, 1], "b": [0, 1]}   # team indices out (-1: empty)
var pend := {"a": [], "b": []}
var _dummy := {}
var _sel := {"a": 0, "b": 0}

func _init(o := {}) -> void:
	super(o)
	for s in SIDES:
		if team[s].size() < 2: place[s] = [0, -1]
		var d := _make(s, {"species": "pidgey", "level": 1})
		d.hp = 0
		_dummy[s] = d
	order_fn = Callable(self, "_order4")

func start() -> Array:
	var out := super.start()
	for s in SIDES:
		var f2 = at(s, 1)
		if f2 != null and not _entered.has(f2):
			_entered[f2] = true
			f2.e.start_battle(kind)
	return out

func at(s: String, k: int) -> Fighter:
	var i: int = place[s][k]
	return team[s][i] if i >= 0 and i < team[s].size() else null

func actives(s: String) -> Array: return [at(s, 0), at(s, 1)]

func select(s: String, k: int) -> void:
	var f := at(s, k)
	if f == null: return
	F[s] = f
	active[s] = place[s][k]
	_sel[s] = k

func place_of(f: Fighter) -> int:
	for k in 2:
		if at(f.side, k) == f: return k
	return -1

func alive_out(s: String) -> Array:
	return actives(s).filter(func(f): return f != null and not f.fainted())

# ---------- the turn's start: every one out ----------
func begin_turn() -> Array:
	var out := []
	if over: return out
	for p in 2:
		var dummy_sides := []
		for s in SIDES:
			var f := at(s, p)
			if f == null or f.fainted():
				F[s] = _dummy[s]; dummy_sides.append(s)
			else: F[s] = f
		if p == 1: turn -= 1
		for e in super.begin_turn():
			if p == 1 and String(e.get("t", "")) == "turn": continue
			if String(e.get("side", "")) in dummy_sides: continue
			e["place"] = p
			out.append(e)
	for s in SIDES: _reselect(s)
	return out

func _reselect(s: String) -> void:
	for k in 2:
		var f := at(s, k)
		if f != null and not f.fainted(): select(s, k); return

func needs_pick_any(s: String) -> bool:
	for f in alive_out(s): if f.e.needs_pick(): return true
	return false

# ---------- aiming ----------
func targets(s: String, k: int, id: String) -> Array:
	if PkmnBattle.targets_self(id): return []
	var out := []
	for j in 2:
		var f := at(other(s), j)
		if f != null and not f.fainted(): out.append({"side": other(s), "k": j})
	var ally := at(s, 1 - k)
	if ally != null and not ally.fainted(): out.append({"side": s, "k": 1 - k})
	return out

func queue_at(s: String, k: int, id: String, target := {}) -> bool:
	select(s, k)
	var tg := _target_of(s, k, target)
	F[other(s)] = tg if tg != null else F[other(s)]
	var ok := queue(s, id)
	if ok:
		F[s].queue.back()["user"] = F[s]
		F[s].queue.back()["target"] = tg
	_reselect(other(s))
	return ok

func _target_of(s: String, k: int, target: Dictionary) -> Fighter:
	if target.has("side"): return at(String(target.side), int(target.k))
	var foes := alive_out(other(s))
	return foes[0] if not foes.is_empty() else null

# the trainer AI for both places: each aims at the foe it does best against (the
# one it hits hardest by type, the weaker by HP on a tie)
func ai_queue(s: String) -> Array:
	var out := []
	for k in 2:
		var me := at(s, k)
		if me == null or me.fainted(): continue
		var best: Fighter = null
		var bs := -INF
		for f in alive_out(other(s)):
			var sc := 0.0
			for t in me.types: sc = maxf(sc, BattleEnergy.type_mult(String(t), f.types))
			sc += (1.0 - float(f.hp) / maxf(1.0, f.max_hp)) * 0.6 + rng.randf() * 0.2
			if sc > bs: bs = sc; best = f
		if best == null: continue
		select(s, k)
		F[other(s)] = best
		var sc = scripted(s, k)
		for id in (sc if sc is Array else PkmnAI.plan(self, s)):
			if queue(s, id):
				me.queue.back()["user"] = me
				me.queue.back()["target"] = best
				out.append(id)
	_reselect(s)
	_reselect(other(s))
	return out

# ---------- the order: all four ----------
func _order4(_b: PkmnBattle, _queues: Dictionary) -> Array:
	var fs := []
	for s in SIDES:
		for f in alive_out(s):
			var rows := []
			var i := 0
			for q in f.queue:
				if not q.has("user"): q["user"] = f
				var pri := 1000 if q.get("free", false) else int(PkmnBattle.mv(q.move).get("priority", 0))   # (its strike first)
				rows.append([-pri, i, q]); i += 1
			rows.sort_custom(func(x, y): return x[0] < y[0] or (x[0] == y[0] and x[1] < y[1]))
			if not rows.is_empty(): fs.append({"f": f, "rows": rows.map(func(r): return r[2])})
	var out := []
	var coin := first_side if turn == 1 else ""
	while true:
		var heads := fs.filter(func(e): return not e.rows.is_empty())
		if heads.is_empty(): break
		# a round: each still to act acts once, by priority, then (turn 1) the coin's side, then speed
		heads.sort_custom(func(x, y):
			var px := 0 if x.rows[0].get("free", false) else int(PkmnBattle.mv(x.rows[0].move).get("priority", 0))
			var py := 0 if y.rows[0].get("free", false) else int(PkmnBattle.mv(y.rows[0].move).get("priority", 0))
			if px != py: return px > py
			if coin != "" and x.f.side != y.f.side: return x.f.side == coin
			return _spd(x.f) > _spd(y.f))
		for e in heads: out.append([e.f.side, e.rows.pop_front()])
	return out

func _spd(f: Fighter) -> float:
	var v := float(f.stats.spe) * PkmnBattle._stage_mult(int(f.stages.spe))
	if f.status == "para": v *= BattleConfig.num("damage", "para_speed", 0.5)
	return v

# each action with its own user and target in the engine's two places
func _act(s: String, q: Dictionary) -> Array:
	var u: Fighter = q.get("user", F[s])
	if u == null or u.fainted(): return []
	var tg: Fighter = q.get("target")
	if tg == null or tg.fainted() or place_of(tg) < 0:
		# its target went down: the other foe
		var foes := alive_out(other(s))
		if foes.is_empty(): return []
		tg = foes[0]
	F[s] = u
	F[other(s)] = tg
	var out := super._act(s, q)
	# each event says whose place it is about (the stage animates that one): the
	# user's, or the target's for what lands on the target
	var up := place_of(u)
	var tp := place_of(tg)
	for e in out:
		var es := String(e.get("side", ""))
		var on_target := es == tg.side and (tg.side != u.side or String(e.get("t", "")) in TARGET_EVENTS)
		e["place"] = tp if on_target else up
		e["tside"] = tg.side
		e["tp"] = tp
	# the target may be on the user's own side (an ally): the engine's places put back
	_reselect("a"); _reselect("b")
	return out

const TARGET_EVENTS := ["hit", "counter", "dodged", "untargetable", "protected", "faint", "need_switch", "stat", "status", "flinch", "disrupt", "pulled_out", "forced_out", "no_effect"]

# ---------- the end of the turn: every one out ----------
func _end_turn() -> Array:
	var out := []
	for p in 2:
		for s in SIDES:
			var f := at(s, p)
			F[s] = f if f != null and not f.fainted() else _dummy[s]
		for e in super._end_turn():
			if not e.has("place"): e["place"] = p
			out.append(e)
		if over: break
	for s in SIDES: _reselect(s)
	return out

# ---------- faints and replacements ----------
func _faint(f: Fighter) -> Array:
	var bench_left := bench(f.side).size()
	var others_out := 0
	for x in actives(f.side): if x != null and x != f and not x.fainted(): others_out += 1
	if bench_left + others_out == 0 or over: return super._faint(f)
	var o: Fighter = F[other(f.side)]
	if o != f: kos[o] = int(kos.get(o, 0)) + 1
	f.e.faint()
	var out := [_ev({"t": "faint", "side": f.side, "place": place_of(f), "text": "%s fainted!" % _nm(f)})]
	var k := place_of(f)
	if bench_left > 0 and k >= 0 and not k in pend[f.side]:
		pend[f.side].append(k)
		out.append(_ev({"t": "need_switch", "side": f.side, "place": k, "left": bench_left, "text": "%s has %d left." % [_owner(f.side), bench_left]}))
	return out

func step() -> Array:
	var out := super.step()
	pending = {"a": false, "b": false}   # (a place to fill never stops the others' turn)
	return out

func bench(s: String) -> Array:
	var out := []
	for i in team[s].size():
		if i in place[s] or team[s][i].fainted(): continue
		out.append(i)
	return out

func pending_places(s: String) -> Array: return pend[s].duplicate()

func can_switch(s: String, i: int) -> bool:
	return not over and i >= 0 and i < team[s].size() and not i in place[s] and not team[s][i].fainted()

func fill(s: String, k: int, i: int) -> Array:
	if not can_switch(s, i): return []
	pend[s].erase(k)
	var out := _put(s, k, i)
	return out

func switch_place(s: String, k: int, i: int) -> Array:
	var f := at(s, k)
	if f == null or f.trapped or not f.e.commit.is_empty(): return []
	if not can_switch(s, i): return []
	select(s, k)
	while unqueue(s) != "": pass
	return _put(s, k, i)

func _put(s: String, k: int, i: int) -> Array:
	var out := []
	var old := at(s, k)
	if old != null:
		out.append(_ev({"t": "switch_out", "side": s, "place": k, "index": place[s][k], "fainted": old.fainted(),
			"text": ("%s, return!" % old.name.to_upper()) if s == "a" else "%s recalled %s." % [_owner(s), old.name.to_upper()]}))
		_leave(old)
	place[s][k] = i
	var nf: Fighter = team[s][i]
	nf.queue = []
	if not _entered.has(nf):
		_entered[nf] = true
		nf.e.start_battle(kind)
	out.append(_ev({"t": "switch_in", "side": s, "place": k, "index": i, "species": nf.species,
		"text": "Go! %s!" % nf.name.to_upper() if s == "a" else "%s sent out %s!" % [_owner(s), nf.name.to_upper()]}))
	select(s, k)
	return out

func ai_pick(s: String) -> int:
	var b := bench(s)
	if b.is_empty(): return -1
	var foes := alive_out(other(s))
	var best: int = b[0]
	var bs := -INF
	for i in b:
		var f: Fighter = team[s][i]
		var sc := float(f.hp) / maxf(1.0, f.max_hp) + f.level * 0.03 + rng.randf() * 0.1
		for foe in foes:
			for t in f.types: sc += BattleEnergy.type_mult(String(t), foe.types) * 0.4
		if sc > bs: bs = sc; best = i
	return best

# (each queued action holds its user: the queues go, so nothing holds on to itself)
func finish() -> void:
	super.finish()
	for s in SIDES:
		for f in team[s]: f.queue = []
		_dummy[s].queue = []
