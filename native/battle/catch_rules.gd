class_name CatchRules
extends RefCounted
# Throwing a Poké Ball: Red and Blue's capture rules (pret/pokered,
# engine/items/item_effects.asm ItemUseBall), pure and static, every number in
# life/battle_config.json "catch" (BattleConfig.sect("catch")).
#
#   var r := CatchRules.throw({"species": "pidgey", "hp": 9, "max_hp": 20,
#       "status": "" | "sleep" | "freeze" | "para" | "burn" | "poison", "ball": "great_ball"}, rng)
#   r -> {caught, wobbles (0..3, a break-out's shakes; 3 on a catch), ball, rate, rand1, w, z}
#   CatchRules.chance(o)        the exact chance of a catch (every Rand1, Rand2 summed)
#   CatchRules.wobbles(o)       the shakes a failed throw gives (they don't depend on the dice)
#   CatchRules.line(key, name)  a line of the games' text (lines.<key>, {NAME} filled in)
#
# The rules, in order (a Master Ball skips them all):
#   Rand1 in 0..rand_max (255 Poké, 200 Great, 150 Ultra)
#   Status (sleep, freeze 25; paralysis, burn, poison 12): Rand1 < Status catches;
#     else Rand1 -= Status
#   W = floor(floor(MaxHP * 255 / hp_div) / max(floor(HP / 4), 1)) (hp_div 8 Great, 12 the rest)
#   Rand1 > CatchRate fails; else W > 255 catches; else Rand2 in 0..255 <= W catches
# A failure's shakes: Y = floor(CatchRate * 100 / shake_div) (255, 200, 150),
#   Z = floor(min(W, 255) * Y / 255) + Status2 (sleep, freeze 10; the others 5);
#   Z < 10: 0, < 30: 1, < 70: 2, else 3 (shakes in config "shakes")

const BALLS := ["poke_ball", "great_ball", "ultra_ball", "master_ball"]

static func C() -> Dictionary: return BattleConfig.sect("catch")

static func ball(id: String) -> Dictionary:
	var v = C().get("balls", {}).get(id, {})
	return v if v is Dictionary else {}

static func ball_name(id: String) -> String:
	return String(ball(id).get("name", id.capitalize()))

static func ball_ids() -> Array:
	var o = C().get("order", BALLS)
	return o if o is Array else BALLS

# the species' catch rate (life/kanto151.json catch_rate), else the config's default
static func catch_rate(species: String) -> int:
	var v = BattleEnergy.species_data(species).get("catch_rate", null)
	if v == null: return int(C().get("default_rate", 45))
	return clampi(int(v), 1, 255)

# [Status, Status2] for a status ("" none)
static func status_bonus(status: String) -> Array:
	var v = C().get("status", {}).get(status, [0, 0])
	return [int(v[0]), int(v[1])] if v is Array and v.size() >= 2 else [0, 0]

static func _rate(o: Dictionary) -> int:
	return clampi(int(o.get("rate", catch_rate(String(o.get("species", ""))))), 1, 255)

static func w_value(o: Dictionary) -> int:
	var B := ball(String(o.get("ball", "poke_ball")))
	var max_hp := maxi(1, int(o.get("max_hp", 1)))
	var hp := clampi(int(o.get("hp", max_hp)), 0, max_hp)
	var a := (max_hp * 255) / maxi(1, int(B.get("hp_div", 12)))
	return a / maxi(1, hp / 4)

static func wobbles(o: Dictionary) -> int:
	var B := ball(String(o.get("ball", "poke_ball")))
	var x := mini(w_value(o), 255)
	var y := (_rate(o) * 100) / maxi(1, int(B.get("shake_div", 255)))
	if y > 255: return 3
	var z := (x * y) / 255 + int(status_bonus(String(o.get("status", "")))[1])
	var steps: Array = C().get("shakes", [10, 30, 70])
	var n := 0
	for s in steps:
		if z >= int(s): n += 1
	return n

static func throw(o: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var id := String(o.get("ball", "poke_ball"))
	var B := ball(id)
	var rate := _rate(o)
	var out := {"caught": false, "wobbles": 3, "ball": id, "rate": rate, "rand1": -1, "w": 0, "z": 0}
	if bool(B.get("always", false)):
		out.caught = true
		return out
	var r1 := rng.randi_range(0, int(B.get("rand_max", 255)))
	out.rand1 = r1
	var sb := status_bonus(String(o.get("status", "")))
	if r1 < int(sb[0]):
		out.caught = true
		return out
	r1 -= int(sb[0])
	var w := w_value(o)
	out.w = w
	if r1 <= rate:
		if w > 255:
			out.caught = true
			return out
		if rng.randi_range(0, 255) <= w:
			out.caught = true
			return out
	out.wobbles = wobbles(o)
	return out

# the exact chance a throw catches (the same steps over every Rand1 and Rand2)
static func chance(o: Dictionary) -> float:
	var B := ball(String(o.get("ball", "poke_ball")))
	if bool(B.get("always", false)): return 1.0
	var n := int(B.get("rand_max", 255)) + 1
	var rate := _rate(o)
	var st := int(status_bonus(String(o.get("status", "")))[0])
	var w := w_value(o)
	var p2 := 1.0 if w > 255 else float(w + 1) / 256.0
	var hit := 0.0
	for r1 in n:
		if r1 < st: hit += 1.0
		elif r1 - st <= rate: hit += p2
	return hit / n

static func line(key: String, fill := {}) -> String:
	var s := String(C().get("lines", {}).get(key, key))
	for k in fill: s = s.replace("{%s}" % k, str(fill[k]))
	return s

# the line for a throw that didn't catch, by its shakes
static func break_line(n: int, nm := "") -> String:
	return line("shake_%d" % clampi(n, 0, 3), {"NAME": nm})
