class_name PkmnAI
extends RefCounted
# Opponents' choices for PkmnBattle (design/energy_system.md, "AI"). They play
# by the same rules (focus, chips, pools, locks, two-phase moves). Weights are
# in life/battle_config.json ai.
#   wild         the simple planner (BattleEnergy.plan_turn by the species'
#                style): no reading of the foe, reactions only now and then
#   personalities (trainers): cautious (sets reactions often), aggressive
#                (rarely; spends big, commits to two-phase moves), balanced,
#                tricky (disruption and two-phase moves). They read the foe:
#                a foe out of reach gets the moves that reach it (Swift, Gust,
#                Earthquake...) or a reaction for its strike; a face-down trap
#                gets Swift, Feint or Mind Reader rather than a big attack.
#
#   PkmnAI.plan(battle, side) -> Array of move ids (in order)

static func personality(name: String) -> Dictionary:
	var P: Dictionary = BattleConfig.sect("ai").get("personalities", {})
	return P.get(name, P.get("balanced", {}))

# what the planner knows of the battle's state (BattleEnergy._state_worth reads it)
static func state_ctx(b: PkmnBattle, side: String) -> Dictionary:
	var me = b.fighter(side)
	var foe = b.fighter(b.other(side))
	return {"foe": {"status": foe.status, "confused": foe.confused > 0, "seeded": foe.seeded, "identified": foe.identified,
			"trapped": foe.trapped, "drowsy": foe.drowsy, "stages": foe.stages.duplicate()},
		"me": {"sure_hit": me.sure_hit, "status": me.status, "confused": me.confused > 0, "stages": me.stages.duplicate(),
			"hp_ratio": float(me.hp) / maxf(1.0, float(me.max_hp))}}

# what a reaction is worth by its odds of working now: a Dodge its dodge chance against
# this foe, Protect or Detect after one last turn its lowered chance
static func reaction_odds(b: PkmnBattle, side: String, ids: Array) -> Dictionary:
	var me = b.fighter(side)
	var foe = b.fighter(b.other(side))
	var out := {}
	for id in ids:
		var kind := String(BattleEnergy.move(id).get("reaction", {}).get("kind", ""))
		if kind == "dodge": out[id] = b.dodge_chance(me, foe)
		elif kind in ["protect", "protect_priority"]: out[id] = b.guard_chance(me)
	return out

static func plan(b: PkmnBattle, side: String) -> Array:
	var me = b.fighter(side)
	var foe = b.fighter(b.other(side))
	var e: BattleEnergy = me.e
	if me.fainted() or me.status == "sleep": return []
	var ids: Array = e.usable().filter(func(id): return b.can_queue(side, id) or BattleEnergy.cost_of(id).size() <= e.available())
	if ids.is_empty(): return []
	var A := BattleConfig.sect("ai")
	var jitter := float(A.get("jitter", 0.1))
	var state := state_ctx(b, side)
	if String(me.ai) == "wild":
		var st := String(BattleEnergy.species_data(e.species).get("ai", "strategic"))
		return e.plan_turn(ids, st, {"uses": me.uses, "rng": b.rng, "jitter": jitter, "foe": state.foe, "me": state.me, "reaction_mult": reaction_odds(b, side, ids)})
	var P := personality(String(me.ai))
	var ctx := {"uses": me.uses, "rng": b.rng, "jitter": jitter, "move_bonus": {}, "exclude": [], "foe": state.foe, "me": state.me,
		"role_w": {"offense": float(P.get("offense", 1.0)), "disruption": float(P.get("disruption", 1.0))},
		"reaction_mult": reaction_odds(b, side, ids)}
	var rv := float(A.get("reaction_value", 30.0))
	var foe_threat: bool = foe.e.available() > 0 or not foe.e.commit.is_empty()
	# reactions: set one when the foe can attack, by temperament
	if foe_threat and b.rng.randf() < float(P.get("reaction_rate", 0.3)) * float(A.get("reaction_rate_scale", 1.0)):
		ctx.reaction_value = rv * 1.6
		# a known physical strike coming (Dig, Fly...): Counter is a sure read
		if not foe.e.commit.is_empty() and String(BattleEnergy.move(String(foe.e.commit.move)).get("category", "")) == "physical":
			ctx.move_bonus["counter"] = float(A.get("counter_bonus", 40.0))
		if not foe.e.commit.is_empty() and String(BattleEnergy.move(String(foe.e.commit.move)).get("category", "")) == "special":
			ctx.move_bonus["mirror_coat"] = float(A.get("counter_bonus", 40.0))
	else:
		ctx.reaction_value = 0.0
		for id in ids:
			if BattleEnergy.role_of(id) == "reaction": ctx.exclude.append(id)
	# two-phase moves, by temperament
	if b.rng.randf() >= float(P.get("two_phase_rate", 0.4)):
		for id in ids:
			if BattleEnergy.role_of(id) == "two_phase": ctx.exclude.append(id)
	# the foe out of reach: only what reaches it, or a reaction for its strike
	var semi: String = foe.e.semi()
	if semi in ["underground", "airborne", "underwater"]:
		for id in ids:
			if not PkmnBattle.is_attack(id) and not "force_out" in BattleEnergy.move(id).get("effects", []): continue
			var row := PkmnBattle.interaction(id, semi)
			if row.get("hits", false):
				if b.rng.randf() < float(P.get("counter_rate", 0.7)):
					ctx.move_bonus[id] = float(ctx.move_bonus.get(id, 0.0)) + float(A.get("counter_bonus", 40.0)) * float(row.get("mult", 1.0))
			else:
				ctx.exclude.append(id)
	# a face-down trap set: moves that can't be dodged or break a shield, or a read
	if not foe.e.locks.is_empty() and String(me.ai) != "aggressive":
		for id in ids:
			if PkmnBattle.interaction(id, "dodge").get("hits", false) or PkmnBattle.interaction(id, "protect").get("breaks", false):
				ctx.move_bonus[id] = float(ctx.move_bonus.get(id, 0.0)) + 25.0
			if "sure_hit" in BattleEnergy.move(id).get("effects", []): ctx.move_bonus[id] = float(ctx.move_bonus.get(id, 0.0)) + 30.0
	# Foresight is only worth it on a Ghost or an evasive foe
	for id in ids:
		if "identify" in BattleEnergy.move(id).get("effects", []) and not ("ghost" in foe.types or int(foe.stages.eva) > 0): ctx.exclude.append(id)
		if "sure_hit" in BattleEnergy.move(id).get("effects", []) and foe.e.locks.is_empty() and int(foe.stages.eva) <= 0: ctx.exclude.append(id)
	return e.plan_turn(ids, String(P.get("style", "strategic")), ctx)
