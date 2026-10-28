class_name Hunger
extends Node
# Ash's tummy: a fullness meter 0..100 % that empties with game time (faster
# walking, running, on his bike and wading: the activity comes from body.gd)
# and fills with what he eats (kcal, res://life/food.json; meal.gd). Its level
# shows as a condition (conditions.gd, life/conditions.json):
#   92+ Stuffed (stuffed: a little heavy on his feet for a while)
#   70+ Full (well_fed: a small bonus to stamina, running and jumping)
#   45+ Satisfied (nothing)
#   28+ Peckish, 12+ Hungry, under 12 Starving (hungry, its three levels: a little
#       less stamina regen, at worst 0.75x and a slightly smaller bar; it never
#       stops him running)
# While hungry his stomach growls now and then (tummy_growl) and, standing
# still, a hand goes to his tummy (idles "tummy"). Numbers: res://tunables/hunger.json.
# Saved with the conditions (Conditions.body.fullness).
#
#   Hunger.I            the one in play
#   fullness            0..100
#   level() -> "stuffed" | "full" | "satisfied" | "peckish" | "hungry" | "starving"
#   eat(kcal) -> float  the % it filled;   preview(kcal) -> fullness after
#   static level_of(f), pct(kcal), drain(minutes, activity)   (the maths, for tests)

signal changed

const T := preload("res://tunables.gd")
const LEVELS := ["stuffed", "full", "satisfied", "peckish", "hungry", "starving"]
const LABEL := {"stuffed": "Stuffed", "full": "Full", "satisfied": "Satisfied", "peckish": "Peckish", "hungry": "Hungry", "starving": "Starving"}
const HUNGRY_S := {"peckish": 0.34, "hungry": 0.67, "starving": 1.0}

static var I: Hunger = null

var cond: Conditions
var body: Node = null        # AshBody (its activity); null in tests
var fullness := 62.0
var paused := false          # (meal.gd: while he eats)
var activity_now := "rest"
var _last := NAN
var _lv := ""
var _growl_t := 45.0
var rng := RandomNumberGenerator.new()

func _init() -> void:
	name = "Hunger"

func _enter_tree() -> void:
	I = self

func _exit_tree() -> void:
	if I == self: I = null

func setup(c: Conditions, b: Node = null) -> void:
	cond = c; body = b
	rng.randomize()
	fullness = clampf(float(c.body.get("fullness", T.num("hunger", "start", 62.0))), 0.0, 100.0)
	_last = c._now_min()
	_sync()

# ---------- the maths ----------
static func level_of(f: float) -> String:
	var L := T.dict("hunger", "levels", {"stuffed": 92, "full": 70, "satisfied": 45, "peckish": 28, "hungry": 12})
	if f >= float(L.stuffed): return "stuffed"
	if f >= float(L.full): return "full"
	if f >= float(L.satisfied): return "satisfied"
	if f >= float(L.peckish): return "peckish"
	if f >= float(L.hungry): return "hungry"
	return "starving"

# the % a number of calories fills
static func pct(kcal: float) -> float:
	return kcal / maxf(1.0, T.num("hunger", "kcal_per_pct", 16.0))

# how much empties over game minutes doing something (rest, walk, run, bike, wade)
static func drain(minutes: float, activity := "rest") -> float:
	var A := T.dict("hunger", "activity", {"rest": 1.0, "walk": 1.15, "run": 1.8, "bike": 1.5, "wade": 1.6})
	return minutes / 60.0 * T.num("hunger", "drain_per_hour", 7.5) * float(A.get(activity, 1.0))

func level() -> String: return level_of(fullness)
func label() -> String: return LABEL[level()]
func frac() -> float: return fullness / 100.0
func preview(kcal: float) -> float: return minf(100.0, fullness + pct(kcal))

func eat(kcal: float) -> float:
	var was := fullness
	fullness = preview(kcal)
	_sync()
	_store()
	if cond and cond.autosave: cond.save()
	return fullness - was

# set it outright (tests, dev)
func set_fullness(f: float) -> void:
	fullness = clampf(f, 0.0, 100.0)
	if cond: _last = cond._now_min()
	_sync()
	_store()

# ---------- the clock ----------
func _process(dt: float) -> void:
	if cond == null: return
	var now: float = cond._now_min()
	var dm := clampf(now - _last, 0.0, 24.0 * 60.0) if not is_nan(_last) else 0.0
	_last = now
	activity_now = _activity()
	if dm > 0.0 and not paused:
		fullness = maxf(0.0, fullness - drain(dm, activity_now))
		_sync()
		_store()   # (written to disk with the conditions' own saves)
	_growl(dt)

func _activity() -> String:
	if body == null: return "rest"
	var g = body.get("game")
	var spd: float = absf(float(g.speed)) if g != null and "speed" in g else 0.0
	var rr = body.get("ride_rate")
	if rr != null and not is_nan(float(rr)): return "bike" if float(rr) > 0.0 else "rest"
	if bool(body.get("in_water")) and spd > 0.3: return "wade"
	if bool(body.get("running")) and spd > 1.0: return "run"
	return "walk" if spd > 0.3 else "rest"

func _store() -> void:
	if cond == null: return
	var v := snappedf(fullness, 0.01)
	if float(cond.body.get("fullness", -1.0)) != v:
		cond.body["fullness"] = v
		cond._dirty = true   # (conditions.gd writes it with its next save)

# the level as conditions: hungry (its strength picks Peckish / Hungry / Starving), well_fed, stuffed
func _sync() -> void:
	var lv := level()
	if lv == _lv or cond == null: return
	_lv = lv
	if HUNGRY_S.has(lv): cond.apply("hungry", HUNGRY_S[lv])
	elif cond.has("hungry"): cond.remove("hungry")
	if lv == "full" and not cond.has("well_fed"): cond.apply("well_fed", 1.0)
	elif lv != "full" and cond.has("well_fed"): cond.remove("well_fed")
	if lv == "stuffed" and not cond.has("stuffed"): cond.apply("stuffed", 1.0)
	elif lv != "stuffed" and cond.has("stuffed"): cond.remove("stuffed")
	_growl_t = minf(_growl_t, 6.0) if lv in ["hungry", "starving"] else _growl_t
	changed.emit()

# a rumble now and then while hungry, a hand on his tummy if he's standing about
func _growl(dt: float) -> void:
	var lv := level()
	if not lv in ["hungry", "starving"] or paused: return
	_growl_t -= dt
	if _growl_t > 0.0: return
	var G := T.dict("hunger", "growl", {"hungry": [70, 130], "starving": [38, 70]})
	var span: Array = G.get(lv, [70, 130])
	_growl_t = rng.randf_range(float(span[0]), float(span[1]))
	var actor = body.get("actor") if body != null else null
	var at = null
	if actor is Node3D and actor.is_inside_tree(): at = actor.global_position + Vector3(0, 0.9, 0)
	Sfx.play("tummy_growl", at, {"vol": -4.0 if lv == "starving" else -8.0})
	if actor is CastActor and activity_now == "rest" and rng.randf() < T.num("hunger", "tummy_hand", 0.6):
		var cast = body.get("cast")
		if cast == null or not cast.has_method("busy") or not cast.busy():
			actor.idles.force("tummy")
