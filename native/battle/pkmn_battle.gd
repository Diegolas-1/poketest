class_name PkmnBattle
extends RefCounted
# The Pokemon-vs-Pokemon rules engine (design/energy_system.md, "The battle"):
# headless, no nodes, no drawing, tested by dev/pkmn_battle_test.gd and played
# by dev/pkmn_battle.tscn. Two sides, "a" (the player's) and "b" (the
# opponent's), each one Pokemon with its BattleEnergy (focus, pools, locks,
# slots). Damage, accuracy, status, speed interleaving of several actions a
# turn, move roles, reaction locks, two-phase moves and the counter table
# (battle_config counters.rows). Every number is in life/battle_config.json.
#
# Hosting it (the presentation, e.g. the BATTLE worker's arena and camera, or
# dev/pkmn_battle.gd): the engine only returns events; the host animates them.
#   var B := PkmnBattle.new({"a": {"species": "pikachu", "level": 12, "energy": e (optional, its saved one),
#                                  "known": [...] (optional), "ai": "player"},
#                            "b": {"species": "pidgey", "level": 5, "ai": "wild" | "cautious" | "aggressive" | "balanced" | "tricky",
#                                  "state": "hidden" (a wild one's start)},
#                            "kind": "wild" | "trainer" | "gym_trainer" | "leader", "seed": 1})
#   B.start() -> events                 # the battle's opening (focus, chips)
#   loop:
#     B.begin_turn() -> events          # focus gain, new chips; a committed strike queued
#     B.needs_pick("a") / B.pick_pool("a", kind)   # the player's one pool choice a turn
#     B.queue("a", id) -> bool          # pays now; as many as the chips allow
#     B.unqueue("a") / B.queued("a")    # take the last one back (refunded)
#     B.ai_queue("b")                   # the opponent's plan (PkmnAI)
#     B.resolve() -> events             # actions interleaved by speed, then the end of the turn
#     until B.over                      # B.outcome: won | lost | fled | blown_away | wild_fled
#   B.finish()                          # each side's after_battle (persistence, warm-up, faint)
# Other: B.flee("a") -> bool, B.use_item("a", id), B.fighter(side), B.order_fn
# (the action ordering: a Callable(battle, queues) -> [[side, action]],
# default PkmnBattle.speed_interleave; swap it to change the turn order).
# Events are Dictionaries with t (the kind) and text (one line for the log):
#   turn, gain, pick, move, commit, strike, lock, trigger, wasted, expired, broken,
#   miss, untargetable, dodged, protected, hit, counter, pulled_out, forced_out,
#   no_effect, stat, status, disrupt, locked_in, flinch, asleep, woke, paralysed,
#   confused, hurt_self, tick, faint, fled, end

const SIDES := ["a", "b"]

var F := {}                      # side -> Fighter
var kind := "wild"
var turn := 0
var over := false
var outcome := ""
var rng := RandomNumberGenerator.new()
var order_fn: Callable = Callable(PkmnBattle, "speed_interleave")
var history: Array = []          # every event so far

class Fighter:
	var side := "a"
	var e: BattleEnergy
	var species := ""
	var name := ""
	var level := 1
	var types: Array = []
	var stats := {}               # hp, atk, def, spa, spd, spe
	var hp := 1
	var max_hp := 1
	var stages := {"atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0, "acc": 0, "eva": 0}
	var status := ""             # "" | para | sleep | poison | burn
	var sleep_turns := 0
	var sleep_from := -1          # the turn it fell asleep (its sleep counts from the next)
	var confused := 0
	var flinch := false
	var sure_hit := false        # Mind Reader / Lock-On: the next attack cancels a dodge
	var identified := false      # Foresight
	var trapped := false
	var seeded := false
	var protect_turn := -1       # Protect holds for the rest of this turn
	var ai := "player"
	var queue: Array = []        # [{move, kinds, free}]
	var uses := {}

	func fainted() -> bool: return hp <= 0
	func semi() -> String: return e.semi()

func _init(o := {}) -> void:
	kind = String(o.get("kind", "wild"))
	if o.has("seed"): rng.seed = int(o.seed)
	else: rng.randomize()
	for s in SIDES:
		F[s] = _make(s, o.get(s, {"species": "pidgey", "level": 5}))

func _make(s: String, d: Dictionary) -> Fighter:
	var f := Fighter.new()
	f.side = s
	var sp := String(d.get("species", "pidgey"))
	var lv := int(d.get("level", 5))
	var known = d.get("known", null)
	if d.get("energy", null) is BattleEnergy:
		f.e = d.energy
		sp = f.e.species; lv = f.e.level
	elif s == "b" and String(d.get("ai", "wild")) == "wild":
		f.e = BattleEnergy.make_wild(sp, lv, String(d.get("state", "default")))
		if known is Array:
			var fo := f.e.focus
			f.e = BattleEnergy.make(sp, lv, known)
			f.e.set_focus(fo, "start")
	else:
		f.e = BattleEnergy.make(sp, lv, known)
		if s == "b" or d.has("focus"):
			f.e.set_focus(float(d.get("focus", BattleConfig.num("focus", "trainer_start", 30.0))), "start")
	if d.get("equip", null) is Array:
		f.e.equipped = []
		for id in d.equip: f.e.equip(String(id))
	f.species = sp
	f.level = lv
	var S := BattleEnergy.species_data(sp)
	f.name = String(d.get("name", S.get("name", sp.capitalize())))
	f.types = S.get("types", ["normal"]).duplicate()
	var base: Array = S.get("base", [50, 50, 50, 50, 50, 50])
	f.max_hp = int(floor(2.0 * float(base[0]) * lv / 100.0)) + lv + 10
	var keys := ["atk", "def", "spa", "spd", "spe"]
	for i in 5: f.stats[keys[i]] = int(floor(2.0 * float(base[i + 1]) * lv / 100.0)) + 5
	f.hp = int(d.get("hp", f.max_hp))
	f.ai = String(d.get("ai", "player" if s == "a" else "wild"))
	f.e.pick_mode = "player" if f.ai == "player" else "auto"
	return f

func fighter(s: String) -> Fighter: return F[s]
func other(s: String) -> String: return "b" if s == "a" else "a"

func _ev(d: Dictionary) -> Dictionary:
	d["turn"] = turn
	history.append(d)
	return d

func _nm(f: Fighter) -> String:
	return (("The wild " if kind == "wild" and f.side == "b" else ("The foe's " if f.side == "b" else "")) + f.name.to_upper())

static func mv(id: String) -> Dictionary: return BattleEnergy.move(id)

# ---------- the battle ----------
func start() -> Array:
	var out := []
	for s in SIDES:
		var f: Fighter = F[s]
		f.e.start_battle(kind)
		out.append(_ev({"t": "gain", "side": s, "focus": f.e.focus, "chips": f.e.total(), "text": "%s focuses: %d%%." % [_nm(f), int(f.e.focus)]}))
	return out

func begin_turn() -> Array:
	var out := []
	if over: return out
	turn += 1
	out.append(_ev({"t": "turn", "n": turn, "text": "Turn %d." % turn}))
	for s in SIDES:
		var f: Fighter = F[s]
		f.queue = []
		f.flinch = false
		f.e.asleep = f.status == "sleep"
		var was_li := f.e.locked_in
		var before := f.e.focus
		f.e.begin_turn()
		out.append(_ev({"t": "gain", "side": s, "focus": f.e.focus, "gained": f.e.focus - before, "chips": f.e.total(),
			"text": "%s focus %d%%%s." % [_nm(f), int(f.e.focus), " (asleep: no gain)" if f.status == "sleep" else ""]}))
		if f.e.locked_in and not was_li: out.append(_ev({"t": "locked_in", "side": s, "on": true, "text": "%s is LOCKED IN!" % _nm(f)}))
		if f.e.needs_pick(): out.append(_ev({"t": "pick", "side": s, "n": f.e.pending, "text": "A new chip: pick a pool."}))
		# a committed two-phase move strikes this turn, free
		if not f.e.commit.is_empty() and int(f.e.commit.turn) < turn:
			f.queue.append({"move": String(f.e.commit.move), "kinds": [], "free": true})
	return out

func needs_pick(s: String) -> bool: return F[s].e.needs_pick()

func pick_pool(s: String, k := "") -> Array:
	var placed: Array = F[s].e.pick_pool(k)
	if not placed.is_empty(): _ev({"t": "picked", "side": s, "kinds": placed, "text": "%s chip into the %s pool." % [str(placed.size()), BattleEnergy.energy_name(placed[0])]})
	return placed

# ---------- queueing (paid at once; as many as the chips allow) ----------
func committed_now(s: String) -> bool:
	var f: Fighter = F[s]
	for q in f.queue:
		if not q.free and BattleEnergy.role_of(q.move) == "two_phase": return true
	return false

func can_queue(s: String, id: String) -> bool:
	var f: Fighter = F[s]
	if over or f.fainted() or f.status == "sleep": return false
	if not id in f.e.usable(): return false
	if committed_now(s): return false                     # gone under / up: nothing more this turn
	if BattleEnergy.role_of(id) == "two_phase" and not f.e.commit.is_empty(): return false
	if BattleEnergy.role_of(id) == "reaction":
		var n := f.e.locks.size() + f.queue.filter(func(q): return BattleEnergy.role_of(q.move) == "reaction").size()
		if n >= int(BattleConfig.num("locks", "max_locks", 2)): return false
	return f.e.can_pay(BattleEnergy.cost_of(id))

func queue(s: String, id: String) -> bool:
	if not can_queue(s, id): return false
	var f: Fighter = F[s]
	var have := f.e.chips
	var m = BattleEnergy.match_cost(have, BattleEnergy.cost_of(id))
	var kinds := []
	for i in m: kinds.append(have[i])
	f.e.pay(BattleEnergy.cost_of(id), id)
	f.queue.append({"move": id, "kinds": kinds, "free": false})
	return true

func unqueue(s: String) -> String:
	var f: Fighter = F[s]
	for i in range(f.queue.size() - 1, -1, -1):
		if not f.queue[i].free:
			var q: Dictionary = f.queue[i]
			f.queue.remove_at(i)
			f.e.refund(q.kinds)
			return q.move
	return ""

func queued(s: String) -> Array:
	return F[s].queue.map(func(q): return q.move)

func ai_queue(s: String) -> Array:
	var plan := PkmnAI.plan(self, s)
	var out := []
	for id in plan:
		if queue(s, id): out.append(id)
	return out

# ---------- the order: actions interleaved by speed ----------
func speed(s: String) -> float:
	var f: Fighter = F[s]
	var v := float(f.stats.spe) * _stage_mult(int(f.stages.spe))
	if f.status == "para": v *= BattleConfig.num("damage", "para_speed", 0.5)
	return v

# The default order (swappable: order_fn). Each side's queue keeps its own order
# (priority first, stable); the two interleave one action at a time, the higher
# priority head first, ties to the side whose turn it is, starting with the faster
# (a speed tie: a coin). Returns [[side, action], ...].
static func speed_interleave(b: PkmnBattle, queues: Dictionary) -> Array:
	var Q := {}
	for s in queues:
		var rows := []
		var i := 0
		for q in queues[s]:
			var pri := 0 if q.get("free", false) else int(mv(q.move).get("priority", 0))
			rows.append([-pri, i, q]); i += 1
		rows.sort_custom(func(x, y): return x[0] < y[0] or (x[0] == y[0] and x[1] < y[1]))
		Q[s] = rows.map(func(r): return r[2])
	var sa := b.speed("a")
	var sb := b.speed("b")
	var nxt := "a" if sa > sb else ("b" if sb > sa else ("a" if b.rng.randf() < 0.5 else "b"))
	var out := []
	while not Q.get("a", []).is_empty() or not Q.get("b", []).is_empty():
		var pick := ""
		if Q.get("a", []).is_empty(): pick = "b"
		elif Q.get("b", []).is_empty(): pick = "a"
		else:
			var pa := 0 if Q.a[0].get("free", false) else int(mv(Q.a[0].move).get("priority", 0))
			var pb := 0 if Q.b[0].get("free", false) else int(mv(Q.b[0].move).get("priority", 0))
			if pa != pb: pick = "a" if pa > pb else "b"
			else: pick = nxt
		out.append([pick, Q[pick].pop_front()])
		nxt = "b" if pick == "a" else "a"
	return out

# ---------- resolving the turn ----------
func resolve() -> Array:
	var out := []
	if over: return out
	var order: Array = order_fn.call(self, {"a": F.a.queue.duplicate(), "b": F.b.queue.duplicate()})
	for pair in order:
		if over: break
		out.append_array(_act(String(pair[0]), pair[1]))
	if not over: out.append_array(_end_turn())
	return out

func _act(s: String, q: Dictionary) -> Array:
	var out := []
	var u: Fighter = F[s]
	var tg: Fighter = F[other(s)]
	var id := String(q.move)
	var m := mv(id)
	if u.fainted(): return out
	# a commit already made this turn: nothing more after it
	if not q.free and not u.e.commit.is_empty() and int(u.e.commit.turn) == turn and BattleEnergy.role_of(id) != "two_phase":
		return out
	# can it act at all?
	if u.flinch:
		u.flinch = false
		out.append(_ev({"t": "flinch", "side": s, "move": id, "text": "%s flinched!" % _nm(u)}))
		_lose_commit(u, out)
		return out
	if u.status == "sleep":
		out.append(_ev({"t": "asleep", "side": s, "move": id, "text": "%s is fast asleep." % _nm(u)}))
		_lose_commit(u, out)
		return out
	if u.status == "para" and rng.randf() < BattleConfig.num("damage", "para_skip", 0.25):
		out.append(_ev({"t": "paralysed", "side": s, "move": id, "text": "%s is paralysed! It can't move!" % _nm(u)}))
		_lose_commit(u, out)
		return out
	if u.confused > 0:
		out.append(_ev({"t": "confused", "side": s, "text": "%s is confused!" % _nm(u)}))
		if rng.randf() < BattleConfig.num("damage", "confuse_self_hit", 0.33):
			var d := _damage_raw(u, u, 40.0, "physical", 1.0, false)
			_hurt(u, d)
			out.append(_ev({"t": "hurt_self", "side": s, "dmg": d, "hp": u.hp, "text": "It hurt itself in its confusion!"}))
			if u.fainted(): out.append_array(_faint(u))
			_lose_commit(u, out)
			return out
	u.uses[id] = int(u.uses.get(id, 0)) + 1
	var role := BattleEnergy.role_of(id)
	# the second turn of a two-phase move: the strike
	if q.get("free", false):
		u.e.clear_commit()
		out.append(_ev({"t": "strike", "side": s, "move": id, "text": "%s strikes with %s!" % [_nm(u), String(m.name).to_upper()]}))
		out.append_array(_use_on(u, tg, id))
		return out
	out.append(_ev({"t": "move", "side": s, "move": id, "role": role, "text": "%s used %s!" % [_nm(u), String(m.name).to_upper()]}))
	if role == "two_phase":
		var dodges := u.e.locks.filter(func(l): return l.effect == "evade").map(func(l): return l.move)
		u.e.commit_to(id)
		var semi := u.e.semi()
		if semi != "charging":
			for dm in dodges:
				out.append(_ev({"t": "wasted", "side": s, "move": dm, "why": "semi", "text": "Out of reach anyway: the %s chip is wasted." % String(mv(dm).name).to_upper()}))
		for tag in m.get("two_phase", {}).get("on_commit", []): out.append_array(_effect(u, u, String(tag), id, true))
		var txt := {"underground": "%s burrowed underground!", "airborne": "%s flew up high!", "underwater": "%s dived under the water!", "charging": "%s is gathering power!"}
		out.append(_ev({"t": "commit", "side": s, "move": id, "semi": semi, "text": String(txt.get(semi, "%s is committed!")) % _nm(u)}))
		return out
	if role == "reaction":
		u.e.refund(q.kinds)
		var L := u.e.lock(id)
		if not L.is_empty() and String(L.effect) == "evade" and u.semi() in ["underground", "airborne", "underwater"]:
			u.e.release_lock(int(L.id), "wasted")
			out.append(_ev({"t": "wasted", "side": s, "move": id, "why": "semi", "text": "%s is out of reach already: the dodge is wasted." % _nm(u)}))
			return out
		if L.is_empty():
			out.append(_ev({"t": "miss", "side": s, "move": id, "why": "no_room", "text": "But it couldn't set it!"}))
		else:
			out.append(_ev({"t": "lock", "side": s, "move": id, "lock": L.id, "face_down": true,
				"text": "%s is ready for something..." % _nm(u), "text_owner": "%s set %s (%d locked)." % [_nm(u), String(m.name).to_upper(), L.kinds.size()]}))
		return out
	out.append_array(_use_on(u, tg, id))
	return out

func _lose_commit(u: Fighter, out: Array) -> void:
	if not u.e.commit.is_empty() and int(u.e.commit.turn) < turn:
		u.e.clear_commit()
		out.append(_ev({"t": "forced_out", "side": u.side, "text": "%s's move came to nothing." % _nm(u)}))

# ---------- the counter table ----------
static func interaction(id: String, vs: String) -> Dictionary:
	for r in BattleConfig.sect("counters").get("rows", []):
		if String(r.get("move", "")) == id and String(r.get("vs", "")) == vs: return r
	return {}

static func is_attack(id: String) -> bool:
	var m := mv(id)
	return float(m.get("power", 0)) > 0.0 or "fixed_40" in m.get("effects", [])

const SELF_TAGS := ["def_up", "evasion_up", "speed_up"]

static func targets_self(id: String) -> bool:
	var m := mv(id)
	if is_attack(id): return false
	var fx: Array = m.get("effects", [])
	return not fx.is_empty() and fx.all(func(x): return x in SELF_TAGS)

func _use_on(u: Fighter, tg: Fighter, id: String) -> Array:
	var out := []
	var m := mv(id)
	if targets_self(id):
		for tag in m.get("effects", []): out.append_array(_effect(u, u, String(tag), id, true))
		return out
	var C := BattleConfig.sect("counters")
	var row := {}
	# 1. out of reach (underground, in the air, underwater): only the counter table reaches it
	var semi := tg.semi()
	if semi != "":
		row = interaction(id, semi)
		if semi != "charging" and not row.get("hits", false):
			out.append(_ev({"t": "untargetable", "side": tg.side, "move": id, "semi": semi, "text": "%s is out of reach!" % _nm(tg)}))
			return out
	var attack := is_attack(id)
	# 2. the target's set traps
	for L in tg.e.locks.duplicate():
		var eff := String(L.effect)
		var trig := String(L.trigger)
		if eff == "evade":
			if interaction(id, "dodge").get("hits", false): continue      # Swift: it can't be dodged
			if id in C.get("cancel_dodge", []): continue                  # Mind Reader reads it, it doesn't dodge it
			if u.sure_hit and attack:
				tg.e.release_lock(int(L.id), "cancelled")
				out.append(_ev({"t": "wasted", "side": tg.side, "move": L.move, "why": "read", "text": "%s read the dodge!" % _nm(u)}))
				continue
			tg.e.release_lock(int(L.id), "triggered")
			out.append(_ev({"t": "dodged", "side": tg.side, "move": id, "lock": L.move, "text": "%s dodged it!" % _nm(tg)}))
			return out
		if eff == "block" and attack:
			var br := interaction(id, "protect")
			if br.get("breaks", false):
				tg.e.release_lock(int(L.id), "broken")
				out.append(_ev({"t": "broken", "side": tg.side, "move": L.move, "text": "%s broke through %s!" % [String(m.name).to_upper(), String(mv(L.move).name).to_upper()]}))
				continue
			tg.e.release_lock(int(L.id), "triggered")
			if String(L.scope) == "turn": tg.protect_turn = turn
			out.append(_ev({"t": "protected", "side": tg.side, "move": id, "lock": L.move, "text": "%s protected itself!" % _nm(tg)}))
			return out
	if tg.protect_turn == turn and attack:
		if interaction(id, "protect").get("breaks", false):
			tg.protect_turn = -1
			out.append(_ev({"t": "broken", "side": tg.side, "move": "protect", "text": "The shield broke!"}))
		else:
			out.append(_ev({"t": "protected", "side": tg.side, "move": id, "text": "%s is shielded!" % _nm(tg)}))
			return out
	# 3. accuracy (0 = never misses); the table's hits skip it
	var acc := float(m.get("accuracy", 100))
	var sure: bool = acc <= 0.0 or (semi != "" and row.get("hits", false) and semi != "charging")
	if not sure:
		var ignore_eva: bool = tg.identified or u.sure_hit or interaction(id, "evasion").get("hits", false)
		var st := int(u.stages.acc) - (0 if ignore_eva else int(tg.stages.eva))
		var a := acc * _acc_mult(st) + u.e.acc_bonus()
		if rng.randf() * 100.0 >= a:
			if attack: u.sure_hit = false
			out.append(_ev({"t": "miss", "side": u.side, "move": id, "text": "%s's attack missed!" % _nm(u) if attack else "But it failed!"}))
			return out
	# 4. type immunity (Foresight lets Normal and Fighting hit a Ghost)
	var mt := String(m.get("type", "normal"))
	var tm := BattleEnergy.type_mult(mt, tg.types)
	if tm == 0.0 and tg.identified and mt in C.get("identify_hits_ghost", []) and "ghost" in tg.types:
		tm = BattleEnergy.type_mult(mt, tg.types.filter(func(x): return x != "ghost"))
	if (attack or id == "thunder_wave") and tm == 0.0:
		out.append(_ev({"t": "no_effect", "side": tg.side, "move": id, "text": "It doesn't affect %s..." % _nm(tg)}))
		if attack: u.sure_hit = false
		return out
	# 5. damage
	var dealt := 0
	if attack:
		var mult := float(row.get("mult", 1.0)) if row.get("hits", false) else 1.0
		var crit := _crit(u, id)
		if "fixed_40" in m.get("effects", []): dealt = 40
		else: dealt = _damage_raw(u, tg, float(m.power), String(m.category), tm * mult, crit, mt)
		_hurt(tg, dealt)
		u.sure_hit = false
		out.append(_ev({"t": "hit", "side": tg.side, "move": id, "dmg": dealt, "hp": tg.hp, "max_hp": tg.max_hp, "eff": tm, "crit": crit, "mult": mult,
			"text": _hit_text(tm, crit, mult)}))
		if "recoil" in m.get("effects", []):
			var rc := maxi(1, int(dealt * BattleConfig.num("damage", "recoil", 0.25)))
			_hurt(u, rc)
			out.append(_ev({"t": "hit", "side": u.side, "move": "recoil", "dmg": rc, "hp": u.hp, "max_hp": u.max_hp, "text": "%s is hit with recoil!" % _nm(u)}))
		# Counter / Mirror Coat set by the target
		for L in tg.e.locks.duplicate():
			if String(L.effect) != "counter": continue
			if String(L.trigger) == String(m.category):
				tg.e.release_lock(int(L.id), "triggered")
				if not tg.fainted():
					var back := maxi(1, int(dealt * float(L.mult)))
					_hurt(u, back)
					out.append(_ev({"t": "counter", "side": u.side, "move": L.move, "dmg": back, "hp": u.hp, "max_hp": u.max_hp,
						"text": "%s hit back with %s!" % [_nm(tg), String(mv(L.move).name).to_upper()]}))
			else:
				tg.e.release_lock(int(L.id), "wasted")
				out.append(_ev({"t": "wasted", "side": tg.side, "move": L.move, "why": "wrong", "text": "%s guessed wrong: %s wasted." % [_nm(tg), String(mv(L.move).name).to_upper()]}))
			break
		# Ground Pound: a chance to pull a digger out
		if row.has("pull_out") and not tg.fainted() and rng.randf() < float(row.pull_out):
			tg.e.clear_commit()
			tg.queue = tg.queue.filter(func(q): return not q.free)
			out.append(_ev({"t": "pulled_out", "side": tg.side, "move": id, "text": "%s was dragged out of the ground!" % _nm(tg)}))
		if tg.fainted(): out.append_array(_faint(tg))
		if u.fainted(): out.append_array(_faint(u))
		if over: return out
	# 6. effects
	if row.get("force_out", false) or ("force_out" in m.get("effects", []) and tg.semi() != ""):
		if not tg.e.commit.is_empty():
			var cm := String(mv(String(tg.e.commit.move)).get("name", "move")).to_upper()
			tg.e.clear_commit()
			tg.queue = tg.queue.filter(func(q): return not q.free)
			out.append(_ev({"t": "forced_out", "side": tg.side, "move": id, "text": "%s was forced out of its %s!" % [_nm(tg), cm]}))
	for tag in m.get("effects", []):
		if tag == "force_out" and row.get("force_out", false): continue
		out.append_array(_effect(u, tg, String(tag), id, not attack))
		if over: break
	return out

func _hit_text(tm: float, crit: bool, mult: float) -> String:
	var bits := []
	if crit: bits.append("A critical hit!")
	if mult > 1.0: bits.append("It caught it out of hiding!")
	if tm > 1.0: bits.append("It's super effective!")
	elif tm < 1.0: bits.append("It's not very effective...")
	return " ".join(bits)

# an effect tag; sure: a status move's own effect (else a damaging move's side chance)
func _effect(u: Fighter, tg: Fighter, tag: String, id: String, sure: bool) -> Array:
	var out := []
	var m := mv(id)
	var D := BattleConfig.sect("damage")
	var chance := 1.0 if sure else float(m.get("chance", D.get("status_effect_chance", 0.3)))
	if tg.fainted(): return out
	match tag:
		"atk_down": out.append_array(_stage(tg, "atk", -1, chance))
		"def_down": out.append_array(_stage(tg, "def", -1, chance))
		"def_down2": out.append_array(_stage(tg, "def", -2, chance))
		"speed_down": out.append_array(_stage(tg, "spe", -1, chance))
		"acc_down": out.append_array(_stage(tg, "acc", -1, chance))
		"def_up": out.append_array(_stage(u, "def", 1, 1.0))
		"evasion_up": out.append_array(_stage(u, "eva", 1, 1.0))
		"speed_up": out.append_array(_stage(u, "spe", 2, 1.0))
		"para", "sleep", "poison", "burn":
			if tg.status == "" and rng.randf() < chance:
				if tag == "para" and "electric" in tg.types: return out
				if tag == "poison" and ("poison" in tg.types or "steel" in tg.types): return out
				if tag == "burn" and "fire" in tg.types: return out
				tg.status = tag
				if tag == "sleep":
					var st: Array = D.get("sleep_turns", [1, 3])
					tg.sleep_turns = rng.randi_range(int(st[0]), int(st[1]))
					tg.sleep_from = turn
					tg.e.asleep = true
				var names := {"para": "is paralysed", "sleep": "fell asleep", "poison": "was poisoned", "burn": "was burned"}
				out.append(_ev({"t": "status", "side": tg.side, "status": tag, "text": "%s %s!" % [_nm(tg), names[tag]]}))
		"confuse":
			if tg.confused <= 0 and rng.randf() < chance:
				var ct: Array = D.get("confuse_turns", [1, 3])
				tg.confused = rng.randi_range(int(ct[0]), int(ct[1]))
				out.append(_ev({"t": "status", "side": tg.side, "status": "confused", "text": "%s became confused!" % _nm(tg)}))
				out.append_array(_disrupt(tg, BattleConfig.num("disruption", "confusion", 15.0), "confusion"))
		"flinch":
			if rng.randf() < (chance if not sure else 1.0):
				tg.flinch = true
				out.append_array(_disrupt(tg, BattleConfig.num("disruption", "flinch", 12.0), "flinch"))
		"disrupt":
			out.append_array(_disrupt(tg, -1.0, id))
		"force_out":
			if tg.e.commit.is_empty() and kind == "wild":
				over = true
				outcome = "wild_fled" if tg.side == "b" else "blown_away"
				out.append(_ev({"t": "end", "outcome": outcome, "text": "%s was blown away!" % _nm(tg)}))
		"sure_hit":
			u.sure_hit = true
			out.append(_ev({"t": "stat", "side": u.side, "stat": "sure_hit", "text": "%s took aim at %s!" % [_nm(u), _nm(tg)]}))
		"identify":
			tg.identified = true
			if int(tg.stages.eva) > 0: tg.stages.eva = 0
			out.append(_ev({"t": "stat", "side": tg.side, "stat": "identified", "text": "%s was identified!" % _nm(tg)}))
		"trap":
			tg.trapped = true
		"drain":
			if not tg.seeded:
				tg.seeded = true
				out.append(_ev({"t": "status", "side": tg.side, "status": "seeded", "text": "%s was seeded!" % _nm(tg)}))
		"clear_field":
			u.seeded = false; u.trapped = false
		"high_crit", "recoil", "fixed_40", "wind", "hits_airborne", "break_protect": pass
	return out

func _stage(f: Fighter, st: String, d: int, chance: float) -> Array:
	if rng.randf() >= chance: return []
	var before := int(f.stages[st])
	f.stages[st] = clampi(before + d, -6, 6)
	if int(f.stages[st]) == before: return [_ev({"t": "stat", "side": f.side, "stat": st, "d": 0, "text": "Nothing happened."})]
	var names := {"atk": "attack", "def": "defense", "spa": "special attack", "spd": "special defense", "spe": "speed", "acc": "accuracy", "eva": "evasiveness"}
	var how := ("rose" if d > 0 else "fell") if absi(d) == 1 else ("sharply rose" if d > 0 else "harshly fell")
	return [_ev({"t": "stat", "side": f.side, "stat": st, "d": d, "text": "%s's %s %s!" % [_nm(f), names[st], how]})]

func _disrupt(f: Fighter, amount: float, source: String) -> Array:
	var before := f.e.focus
	var was_li := f.e.locked_in
	var lost := f.e.disrupt(amount, source)
	var out := [_ev({"t": "disrupt", "side": f.side, "from": before, "focus": f.e.focus, "lost": lost, "source": source,
		"text": "%s's focus slipped (%d%% -> %d%%)." % [_nm(f), int(before), int(f.e.focus)]})]
	if was_li and not f.e.locked_in: out.append(_ev({"t": "locked_in", "side": f.side, "on": false, "text": "%s is no longer Locked In." % _nm(f)}))
	return out

# ---------- numbers ----------
static func _stage_mult(st: int) -> float:
	var k := BattleConfig.num("damage", "stage_step", 0.5)
	return (1.0 + k * st) if st >= 0 else 1.0 / (1.0 - k * st)

static func _acc_mult(st: int) -> float:
	var k := BattleConfig.num("damage", "acc_stage_step", 0.34)
	return (1.0 + k * st) if st >= 0 else 1.0 / (1.0 - k * st)

func _crit(u: Fighter, id: String) -> bool:
	var D := BattleConfig.sect("damage")
	var st := u.e.crit_bonus() + (1 if "high_crit" in mv(id).get("effects", []) else 0)
	var p := float(D.get("crit_base", 0.0625)) + float(D.get("crit_per_stage", 0.0625)) * st
	return rng.randf() < p

func _damage_raw(u: Fighter, tg: Fighter, power: float, cat: String, mult: float, crit: bool, mtype := "") -> int:
	var D := BattleConfig.sect("damage")
	var phys := cat == "physical"
	var A := float(u.stats.atk if phys else u.stats.spa) * _stage_mult(int(u.stages.atk if phys else u.stages.spa))
	var Df := float(tg.stats.def if phys else tg.stats.spd) * _stage_mult(int(tg.stages.def if phys else tg.stages.spd))
	if crit:
		A = maxf(A, float(u.stats.atk if phys else u.stats.spa))
		Df = minf(Df, float(tg.stats.def if phys else tg.stats.spd))
	if phys and u.status == "burn": A *= float(D.get("burn_atk", 0.5))
	var base := ((2.0 * u.level / 5.0 + 2.0) * power * A / maxf(1.0, Df)) / 50.0 + 2.0
	var stab := float(D.get("stab", 1.5)) if mtype != "" and mtype in u.types else 1.0
	var r := rng.randf_range(float(D.get("random_min", 0.85)), 1.0)
	var d := base * stab * mult * (float(D.get("crit", 1.5)) if crit else 1.0) * r * float(D.get("scale", 0.55))
	return maxi(1, int(round(d))) if mult > 0.0 else 0

func _hurt(f: Fighter, d: int) -> void:
	f.hp = clampi(f.hp - d, 0, f.max_hp)

func _faint(f: Fighter) -> Array:
	f.e.faint()
	var out := [_ev({"t": "faint", "side": f.side, "text": "%s fainted!" % _nm(f)})]
	if not over:
		over = true
		outcome = "won" if f.side == "b" else "lost"
		out.append(_ev({"t": "end", "outcome": outcome, "text": "You won!" if outcome == "won" else "You lost..."}))
	return out

# ---------- the end of a turn ----------
func _end_turn() -> Array:
	var out := []
	var D := BattleConfig.sect("damage")
	for s in SIDES:
		var f: Fighter = F[s]
		if f.fainted(): continue
		if f.status == "poison" or f.status == "burn":
			var d := maxi(1, int(f.max_hp * float(D.get("poison_tick" if f.status == "poison" else "burn_tick", 0.0625))))
			_hurt(f, d)
			out.append(_ev({"t": "tick", "side": s, "dmg": d, "hp": f.hp, "max_hp": f.max_hp, "text": "%s is hurt by its %s." % [_nm(f), "poison" if f.status == "poison" else "burn"]}))
		if f.seeded:
			var o: Fighter = F[other(s)]
			var dd := maxi(1, int(f.max_hp * float(D.get("drain_tick", 0.0625))))
			_hurt(f, dd)
			if not o.fainted(): o.hp = mini(o.max_hp, o.hp + dd)
			out.append(_ev({"t": "tick", "side": s, "dmg": dd, "hp": f.hp, "max_hp": f.max_hp, "text": "Leech Seed saps %s." % _nm(f)}))
		if f.fainted():
			out.append_array(_faint(f))
			if over: return out
			continue
		if f.status == "sleep" and turn > f.sleep_from:
			f.sleep_turns -= 1
			if f.sleep_turns <= 0:
				f.status = ""
				f.e.asleep = false
				out.append(_ev({"t": "woke", "side": s, "text": "%s woke up!" % _nm(f)}))
		if f.confused > 0:
			f.confused -= 1
			if f.confused == 0: out.append(_ev({"t": "status", "side": s, "status": "", "text": "%s snapped out of confusion." % _nm(f)}))
		for L in f.e.end_turn():
			out.append(_ev({"t": "expired", "side": s, "move": L.move, "text": "%s's guard dropped." % _nm(f), "text_owner": "%s's %s ran out." % [_nm(f), String(mv(L.move).name).to_upper()]}))
		f.protect_turn = -1
		f.flinch = false
	return out

# ---------- other actions ----------
func flee(s: String) -> bool:
	if kind != "wild" or over: return false
	var f: Fighter = F[s]
	if f.trapped: return false
	var ok := speed(s) >= speed(other(s)) or rng.randf() < 0.5
	if ok:
		over = true
		outcome = "fled"
		_ev({"t": "fled", "side": s, "text": "Got away safely!"})
	return ok

func use_item(s: String, id: String) -> int:
	var n: int = F[s].e.use_item(id)
	if n > 0: _ev({"t": "item", "side": s, "item": id, "n": n, "text": "%s used a %s." % [_nm(F[s]), String(BattleEnergy.items().get(id, {}).get("name", id))]})
	return n

# persistence: each side's after_battle (the player's warm-up, a faint to zero)
func finish() -> void:
	for s in SIDES:
		var f: Fighter = F[s]
		f.e.after_battle({"kind": kind, "won": (outcome == "won") == (s == "a"), "fainted": f.fainted()})
