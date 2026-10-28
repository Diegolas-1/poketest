class_name BattleRules
extends RefCounted
# The battle's maths, apart from its show (battle.gd plays what these return):
# Ash's stamina and aim, the wild Pokémon's HP and its moods, what each of
# Ash's actions does, and the wild side's mind. Headless and seeded, so
# dev/battle_test.gd can check it. Data: res://life/wild.json (ash_battle and
# species.<id>.battle; see its _doc_battle).
#
# Ash has no HP. What he has is his stamina (body.gd's bar; in points here,
# 100 = a full bar). A battle wears a ten-year-old out: each of his own actions
# costs some (cost), a Pokémon's hit knocks a lot out of him (the move's dmg:
# three or four of them empty the bar), and none of it comes back while the
# battle lasts. At 0 he is exhausted, sore and overwhelmed, and goes down
# (outcome ash_down). The Pokémon keep real HP.
#
# Moods (0..1): anger, fear, threat (how dangerous Ash seems to it). They ease
# back a little at each turn's end. The wild side:
#   reaction()  after Ash's action: flees when hurt below flee_hp, or when
#               scared (chance fear^2 x its temper's flee_k; a hurt one adds
#               0.6); loses interest when it doesn't feel threatened (threat and
#               anger low: its temper's chance, more once it can't see, aim -2)
#   pick_move() otherwise a move by weight (w + w_anger x anger); a move with
#               "first" (Quick Attack) goes before Ash's action
# A turn may hold several actions of a side (battle.gd's loop; the energy
# system will say how many): foe_turn(plan) is one action, end_turn() ends the turn.
# Moves are keyed by id in wild.json (species.<id>.battle.moves.<move id>) and
# may carry a "type" and later a "cost" ({"<energy type>": n}) for the energy system.
#
#   var R := BattleRules.new("pidgey", "flighty", "hidden", seed)
#   R.ash_sta = 100.0
#   var e := R.ash_act("rock")        # {act, hit, dmg, cost, notes, flee, slip, outcome}
#   var f := R.foe_turn(R.decide())   # {kind: move | flee | disengage, move, name, hit, dmg, outcome}
#   R.end_turn()
#   R.outcome                         # "" while it goes on: fled | disengaged | ash_won | ash_down | ran

const PATH := "res://life/wild.json"
const ACTIONS := ["kick_sand", "startle", "rock", "back_away"]

static var _data := {}

var A: Dictionary            # ash_battle
var S: Dictionary            # species.<id>.battle
var species := ""
var temper := "flighty"
var rng := RandomNumberGenerator.new()
var ash_sta_max := 100.0     # his stamina in points
var ash_sta := 100.0
var ash_acc_stage := 0
var foe_max := 16.0
var foe_hp := 16.0
var foe_acc_stage := 0
var anger := 0.0
var fear := 0.0
var threat := 0.0
var enraged := false
var turn := 0
var uses := {}               # move -> times used
var outcome := ""
var force := -1              # renders: 1 every aimed hit lands, 0 every one misses, -1 the dice
var events: Array = []       # every event, in order (tests)

static func data() -> Dictionary:
	if _data.is_empty():
		var v = JSON.parse_string(FileAccess.get_file_as_string(PATH)) if FileAccess.file_exists(PATH) else null
		_data = v if v is Dictionary else {}
	return _data

func _init(sp := "pidgey", tmp := "flighty", state := "hidden", seed := -1) -> void:
	species = sp
	temper = tmp if tmp in ["flighty", "aggressive", "curious", "timid"] else "flighty"
	if seed >= 0: rng.seed = seed
	else: rng.randomize()
	var D := data()
	A = D.get("ash_battle", {})
	S = D.get("species", {}).get(sp, {}).get("battle", {})
	if S.is_empty(): S = D.get("species", {}).get("pidgey", {}).get("battle", {})   # (an unknown species fights as a Pidgey)
	ash_sta_max = float(A.get("stamina_points", 100.0))
	ash_sta = ash_sta_max
	foe_max = float(S.get("hp", 16.0))
	foe_hp = foe_max
	var st: Dictionary = S.get("start", {}).get(state, {})
	anger = float(st.get("anger", 0.1)); fear = float(st.get("fear", 0.1)); threat = float(st.get("threat", 0.3))
	if temper == "aggressive": anger = minf(1.0, anger + 0.15)
	if temper == "timid": fear = minf(1.0, fear + 0.1)

func display_name() -> String: return String(S.get("name", species.to_upper()))
func level() -> int: return int(S.get("level", 3))
func move_name(id: String) -> String: return String(move_data(id).get("name", id.to_upper()))
func move_data(id: String) -> Dictionary: return S.get("moves", {}).get(id, {})
func is_first(id: String) -> bool: return bool(move_data(id).get("first", false))
func action_cost(act: String) -> float: return float(A.get("actions", {}).get(act, {}).get("cost", 0.0))

# accuracy stages as the games have them: below 0, 3 / (3 - s)
static func stage_mult(s: int) -> float:
	return 3.0 / (3.0 - s) if s < 0 else (3.0 + s) / 3.0

func _mood(d: Dictionary) -> void:
	anger = clampf(anger + float(d.get("anger", 0.0)), 0.0, 1.0)
	fear = clampf(fear + float(d.get("fear", 0.0)), 0.0, 1.0)
	threat = clampf(threat + float(d.get("threat", 0.0)), 0.0, 1.0)

func _roll(p: float) -> bool: return rng.randf() < p
func _hit(p: float) -> bool: return _roll(p) if force < 0 else force == 1

func _range(r) -> float:
	if r is Array and r.size() >= 2: return rng.randf_range(float(r[0]), float(r[1]))
	return float(r) if r != null else 0.0

# what the wild one seems to feel (the HUD's mood chip)
func mood() -> String:
	if fear >= 0.6 and fear >= anger: return "scared"
	if anger >= 0.6: return "angry"
	if threat >= 0.45 or anger >= 0.35: return "wary"
	return "calm"

# ---------- Ash's turn ----------
func ash_act(act: String) -> Dictionary:
	var e := {"who": "ash", "act": act, "hit": false, "dmg": 0, "cost": 0.0, "notes": [], "flee": false, "slip": false, "outcome": ""}
	var d: Dictionary = A.get("actions", {}).get(act, {})
	var aim := float(A.get("acc", 0.92)) * stage_mult(ash_acc_stage)
	# what it takes out of him
	e.cost = float(d.get("cost", 0.0))
	ash_sta = maxf(0.0, ash_sta - e.cost)
	match act:
		"kick_sand":
			e.hit = _hit(float(d.get("acc", 0.86)) * aim)
			if e.hit:
				foe_acc_stage = maxi(-6, foe_acc_stage + int(d.get("foe_acc_stage", -1)))
				_mood(d)
				e.notes.append("acc_down")
			else:
				_mood({"threat": 0.05})
		"startle":
			var bt: Dictionary = d.get("by_temper", {}).get(temper, {})
			e.hit = true
			_mood({"threat": float(d.get("threat", 0.2)), "fear": float(bt.get("fear", 0.2)), "anger": float(bt.get("anger", 0.0))})
			if bt.get("enrage", false) and not enraged:
				enraged = true
				e.notes.append("enraged")
			elif float(bt.get("anger", 0.0)) > float(bt.get("fear", 0.0)):
				e.notes.append("angrier")
			else:
				e.notes.append("scared")
			# a timid or flighty one may bolt there and then
			if _roll(float(bt.get("flee_now", 0.0)) * (0.5 + fear)):
				e.flee = true
				outcome = "fled"
		"rock":
			e.hit = _hit(float(d.get("acc", 0.78)) * aim)
			if e.hit:
				e.dmg = roundi(_range(d.get("dmg", [3, 5])))
				foe_hp = maxf(0.0, foe_hp - e.dmg)
				_mood(d)
				if foe_hp <= 0.0:
					outcome = "ash_won"
					e.notes.append("down")
				else:
					e.notes.append("angrier")
			else:
				_mood({"anger": 0.08, "threat": 0.08})
		"back_away":
			_mood({"threat": float(d.get("threat", -0.35)), "anger": float(d.get("anger", -0.12))})
			var p := float(d.get("base", 0.38)) - float(d.get("per_acc_stage", 0.12)) * foe_acc_stage + float(d.get("fear_k", 0.3)) * fear + float(d.get("anger_k", -0.3)) * anger
			p = clampf(p, float(d.get("min", 0.12)), float(d.get("max", 0.9)))
			e.chance = p
			e.slip = _roll(p)
			e.hit = e.slip
			if e.slip: outcome = "ran"
	# worn out by his own effort (even backing off: he has nothing left to run with)
	if ash_sta <= 0.0 and outcome in ["", "ran"]:
		outcome = "ash_down"
		e.notes.append("exhausted")
	e.outcome = outcome
	events.append(e)
	return e

# ---------- the wild side ----------
# what it means to do now: leave (reaction), or a move; foe_turn(plan) then does it
func decide() -> Dictionary:
	var r := reaction()
	if not r.is_empty(): return r
	var m := pick_move()
	return {"kind": "move", "move": m, "first": is_first(m)}

# does it bolt, or lose interest? {} if it stays to fight
func reaction() -> Dictionary:
	var hpk := foe_hp / maxf(1.0, foe_max)
	var fk := float(S.get("flee_k", {}).get(temper, 1.0))
	var p_flee := fear * fear * fk + (0.6 if hpk < float(S.get("flee_hp", 0.35)) else 0.0) * fk
	if _roll(clampf(p_flee, 0.0, 0.95)): return {"kind": "flee"}
	var dg: Dictionary = S.get("disengage", {})
	var p_dis := 0.0
	if threat < float(dg.get("threat_below", 0.3)) and anger < float(dg.get("anger_below", 0.35)):
		p_dis = float(dg.get(temper, 0.25)) * (1.0 - threat)
	if foe_acc_stage <= -2 and temper != "aggressive": p_dis += float(dg.get("blind_bonus", 0.22))
	if turn == 0: p_dis *= 0.3   # (it came to fight: not on the first turn)
	if _roll(clampf(p_dis, 0.0, 0.9)): return {"kind": "disengage"}
	return {}

# a move by weight (the moods tilt it)
func pick_move() -> String:
	var moves: Dictionary = S.get("moves", {})
	var ids := []
	var ws := []
	var tot := 0.0
	for id in moves:
		var m: Dictionary = moves[id]
		if m.has("max_uses") and int(uses.get(id, 0)) >= int(m.max_uses): continue
		if int(m.get("learned", 0)) > level(): continue   # (not at its level yet)
		if m.has("ash_acc_stage") and ash_acc_stage <= -2: continue
		var w := maxf(0.05, float(m.get("w", 1.0)) + float(m.get("w_anger", 0.0)) * anger)
		ids.append(id); ws.append(w); tot += w
	var x := rng.randf() * tot
	var pick: String = ids[0] if not ids.is_empty() else "tackle"
	for i in ids.size():
		x -= ws[i]
		if x <= 0.0: pick = ids[i]; break
	return pick

# one action of the wild side: a move (plan {kind: move, move}), fleeing or losing interest
func foe_turn(plan := {}) -> Dictionary:
	if plan.is_empty(): plan = decide()
	var e := {"who": "foe", "kind": plan.kind, "move": plan.get("move", ""), "name": "", "hit": false, "dmg": 0, "notes": [], "outcome": ""}
	match String(plan.kind):
		"flee": outcome = "fled"
		"disengage": outcome = "disengaged"
		"move":
			var m := move_data(plan.move)
			e.name = move_name(plan.move)
			uses[plan.move] = int(uses.get(plan.move, 0)) + 1
			e.hit = _hit(float(m.get("acc", 0.9)) * stage_mult(foe_acc_stage))
			if e.hit:
				var dmg := _range(m.get("dmg", [20, 25]))
				if enraged and dmg > 0.0: dmg *= float(S.get("enrage_mult", 1.25))
				e.dmg = roundi(dmg)
				ash_sta = maxf(0.0, ash_sta - e.dmg)
				if m.has("ash_acc_stage"):
					ash_acc_stage = maxi(-6, ash_acc_stage + int(m.ash_acc_stage))
					e.notes.append("ash_acc_down")
				if ash_sta <= 0.0:
					outcome = "ash_down"
				# a hit lands: it feels braver
				_mood({"fear": -0.06, "threat": -0.04})
	e.outcome = outcome
	events.append(e)
	return e

# the turn is over: the moods ease back a little
func end_turn() -> void:
	turn += 1
	var dc: Dictionary = S.get("decay", {})
	anger = maxf(0.0, anger - float(dc.get("anger", 0.08)))
	fear = maxf(0.0, fear - float(dc.get("fear", 0.12)))
	threat = maxf(0.0, threat - float(dc.get("threat", 0.15)))
