class_name Conditions
extends Node
# Ash's conditions (wet, fatigued, and whatever comes next): a small data-driven
# system. What a condition is lives in res://life/conditions.json; what is going
# on lives here, saved to user://conditions.save (JSON) like quests.save.
#
# A condition has a strength 0..1 (how wet, how tired) and a duration rule:
#   "decay"   the strength runs down with game time (GameClock minutes): a full
#             strength lasts full_minutes (wet: 60, one game hour), less lasts
#             proportionally less; paused while something holds it (hold(id):
#             Ash standing in the water)
#   "timer"   lasts minutes from its start whatever its strength
#   "manual"  stays until the code that started it removes it (fatigue: until the
#             stamina bar is full again)
# and effects (each a number at full strength, or a flag):
#   speed           run / walk speed multiplier (by_strength: 1 + (v - 1) * strength)
#   stamina_drain   multiplier on running's stamina cost
#   stamina_regen   multiplier on the refill
#   no_run          true: walking only
#   blocks_entry    a strength above which a place may refuse him (its own
#                   threshold in "entry" wins; see entry_refusal)
#   remark          {key, min, soaked_at, cooldown}: the townspeople comment once
#                   per episode (a new start of the condition) and person, with
#                   a cooldown in game minutes; the lines are theirs, in
#                   res://life/dialogue.json people.<id>.remarks.<key> (and
#                   fallback.remarks.<key>), picked by Quests.talk
#
#   Conditions.I                 the one in play (null in standalone tests)
#   apply(id, strength)          start or strengthen (the def's stack rule: max | add | replace)
#   remove(id)   has(id)   strength(id)   hold(id)   active_ids()
#   label(id)  description(id)  icon(id)  color(id)  time_text(id)  minutes_left(id)
#   mult(effect)  flag(effect)   entry_refusal(place) -> {} | {speaker, voice, lines, cond}
#   remarks_for(person) -> [{cond, keys}]   (marks them said)
#   body: Dictionary   other saved player state (body.gd: stamina)
#   signal started(id)   signal ended(id)   signal changed

signal started(id: String)
signal ended(id: String)
signal changed

const DATA_PATH := "res://life/conditions.json"
static var I: Conditions = null

var clock: Object = null
var save_path := "user://conditions.save"
var autosave := true
var D := {}              # conditions.json
var defs := {}           # id -> def
var active := {}         # id -> {s, ep, t (game minutes so far), left (timer), hold}
var remarked := {}       # person -> {cond: episode}
var remark_at := {}      # person -> {cond: clock minutes}
var ep_n := 0
var body := {}           # saved for body.gd (stamina)
var _last_min := NAN
var _dirty := false
var _save_acc := 0.0

func _init() -> void:
	name = "Conditions"
	D = _read(DATA_PATH)
	defs = D.get("conditions", {})

func _enter_tree() -> void:
	I = self

func _exit_tree() -> void:
	if I == self:
		if _dirty and autosave: save()
		I = null

func setup(clk: Object) -> void:
	clock = clk
	for a in OS.get_cmdline_user_args():
		if a == "--fresh-conditions": autosave = false   # tests: start dry and rested, leave the save alone
	if autosave: load_state()
	_last_min = _now_min()

static func _read(p: String) -> Dictionary:
	if not FileAccess.file_exists(p):
		push_warning("Conditions: missing " + p)
		return {}
	var v = JSON.parse_string(FileAccess.get_file_as_string(p))
	return v if v is Dictionary else {}

func _now_min() -> float:
	if clock != null and is_instance_valid(clock) and "minutes" in clock: return float(clock.minutes)
	return Time.get_ticks_msec() / 1000.0   # no clock: a game minute a real second

# ---------- save / load ----------
func save() -> void:
	_dirty = false
	var out := {}
	for id in active:
		var a: Dictionary = active[id]
		out[id] = {"s": a.s, "ep": a.ep, "t": a.t, "left": a.get("left", 0.0)}
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify({"v": 1, "active": out, "ep_n": ep_n, "remarked": remarked, "body": body}))

func load_state() -> void:
	if not FileAccess.file_exists(save_path): return
	var v = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if not v is Dictionary: return
	ep_n = int(v.get("ep_n", 0))
	if v.get("remarked") is Dictionary: remarked = v.remarked
	if v.get("body") is Dictionary: body = v.body
	var a = v.get("active", {})
	if a is Dictionary:
		for id in a:
			if not defs.has(id) or not a[id] is Dictionary: continue
			active[id] = {"s": clampf(float(a[id].get("s", 0.0)), 0.0, 1.0), "ep": int(a[id].get("ep", 0)), "t": float(a[id].get("t", 0.0)),
				"left": float(a[id].get("left", 0.0)), "hold": false}

func reset() -> void:
	for id in active.keys(): ended.emit(id)
	active.clear(); remarked.clear(); remark_at.clear(); body.clear()
	_dirty = true
	changed.emit()

# ---------- reading ----------
func def(id: String) -> Dictionary:
	var d = defs.get(id)
	return d if d is Dictionary else {}

func has(id: String) -> bool: return active.has(id)
func strength(id: String) -> float: return float(active[id].s) if active.has(id) else 0.0
func active_ids() -> Array:
	var ids := active.keys()
	ids.sort_custom(func(a, b): return int(def(a).get("order", 50)) < int(def(b).get("order", 50)))
	return ids

# the name by strength (levels: [[from, name, description?], ...])
func _level(id: String) -> Array:
	var d := def(id)
	var best := []
	for L in d.get("levels", []):
		if L is Array and L.size() >= 2 and strength(id) >= float(L[0]) - 1e-4: best = L
	return best

func label(id: String) -> String:
	var L := _level(id)
	return String(L[1]) if L.size() >= 2 else String(def(id).get("name", id.capitalize()))

func description(id: String) -> String:
	var L := _level(id)
	return String(L[2]) if L.size() >= 3 else String(def(id).get("desc", ""))

func icon(id: String) -> String: return String(def(id).get("icon", "dot"))
func color(id: String) -> Color:
	var c := String(def(id).get("color", "#e8463c"))
	return Color(c) if Color.html_is_valid(c) else Color("e8463c")

# game minutes left, or -1 when it has no clock of its own
func minutes_left(id: String) -> float:
	if not active.has(id): return 0.0
	var dur: Dictionary = def(id).get("duration", {})
	match String(dur.get("kind", "manual")):
		"decay": return float(active[id].s) * float(dur.get("full_minutes", 60.0))
		"timer": return float(active[id].get("left", 0.0))
	return -1.0

func time_text(id: String) -> String:
	var dur: Dictionary = def(id).get("duration", {})
	var m := minutes_left(id)
	if m < 0.0: return String(dur.get("until", ""))
	if active.has(id) and active[id].get("held", false) and dur.has("held"): return String(dur.held)
	var t := "under a minute" if m < 1.0 else ("about 1 minute" if m < 1.5 else ("about %d minutes" % roundi(m) if m < 90.0 else "about %.1f hours" % (m / 60.0)))
	return String(dur.get("left", "%s left")) % t

# ---------- changing ----------
func apply(id: String, s: float) -> void:
	var d := def(id)
	if d.is_empty():
		push_warning("Conditions: unknown " + id); return
	s = clampf(s, 0.0, 1.0)
	if not active.has(id):
		if s <= 0.0: return
		ep_n += 1
		var dur: Dictionary = d.get("duration", {})
		active[id] = {"s": s, "ep": ep_n, "t": 0.0, "left": float(dur.get("minutes", 0.0)), "hold": false}
		_dirty = true
		started.emit(id)
		changed.emit()
		if autosave: save()
		return
	var a: Dictionary = active[id]
	var was: float = a.s
	match String(d.get("stack", "max")):
		"add": a.s = minf(1.0, a.s + s)
		"replace": a.s = s
		_: a.s = maxf(a.s, s)
	if String(d.get("stack", "max")) == "add" or absf(a.s - was) > 0.0:
		var dur2: Dictionary = d.get("duration", {})
		if String(dur2.get("kind", "")) == "timer" and dur2.get("refresh", true): a.left = float(dur2.get("minutes", 0.0))
	if absf(a.s - was) > 1e-4: _dirty = true

func remove(id: String) -> void:
	if not active.has(id): return
	active.erase(id)
	_dirty = true
	ended.emit(id)
	changed.emit()
	if autosave: save()

# keeps a decaying condition from running down this frame (Ash still in the water)
func hold(id: String) -> void:
	if active.has(id): active[id].hold = true

# ---------- effects ----------
func mult(effect: String) -> float:
	var m := 1.0
	for id in active:
		var e: Dictionary = def(id).get("effects", {})
		if not e.has(effect) or not (e[effect] is float or e[effect] is int): continue
		var v := float(e[effect])
		if def(id).get("by_strength", false): v = 1.0 + (v - 1.0) * float(active[id].s)
		m *= v
	return m

func flag(effect: String) -> bool:
	for id in active:
		if def(id).get("effects", {}).get(effect, false) == true: return true
	return false

# a place (an interior's id, or a house) that won't let him in like this: the first
# active condition over its threshold there, with what the one at the door says
func entry_refusal(place: String) -> Dictionary:
	var E: Dictionary = D.get("entry", {})
	var P: Dictionary = E.get(place, E.get("default", {}))
	if P.get("open", false): return {}
	for id in active_ids():
		var e: Dictionary = def(id).get("effects", {})
		var r: Dictionary = P.get("refuse", {}).get(id, {})
		var th = r.get("above", e.get("blocks_entry", null))
		if th == null or r.get("never", false): continue
		if strength(id) <= float(th): continue
		var lines = r.get("lines", P.get("lines", []))
		if not lines is Array or lines.is_empty(): lines = E.get("default", {}).get("refuse", {}).get(id, {}).get("lines", ["You can't come in like that!"])
		var spk := String(r.get("speaker", P.get("speaker", "")))
		var out := []
		for i in lines.size():
			out.append((spk + ": " if i == 0 and spk != "" else "") + String(lines[i]))
		return {"cond": id, "speaker": spk, "voice": String(P.get("voice", "mid")), "lines": out}
	return {}

# what the townspeople notice, once per episode (and cooldown): [{cond, keys}]
func remarks_for(person: String) -> Array:
	var out := []
	var now := _now_min()
	for id in active_ids():
		var r = def(id).get("remark")
		if not r is Dictionary: continue
		var s := strength(id)
		if s < float(r.get("min", 0.1)): continue
		var said: Dictionary = remarked.get(person, {})
		if int(said.get(id, -1)) == int(active[id].ep): continue
		var at: Dictionary = remark_at.get(person, {})
		if at.has(id) and now - float(at[id]) < float(r.get("cooldown", 0.0)): continue
		var keys := []
		if r.has("strong_key") and s >= float(r.get("strong_at", 0.6)): keys.append(String(r.strong_key))
		keys.append(String(r.get("key", id)))
		said[id] = int(active[id].ep); remarked[person] = said
		at[id] = now; remark_at[person] = at
		_dirty = true
		out.append({"cond": id, "keys": keys})
		if out.size() >= int(D.get("remarks_per_talk", 1)): break
	return out

# ---------- the clock ----------
func _process(dt: float) -> void:
	var now := _now_min()
	var dm := clampf(now - _last_min, 0.0, 24.0 * 60.0) if not is_nan(_last_min) else 0.0
	_last_min = now
	var gone := []
	for id in active:
		var a: Dictionary = active[id]
		a.t += dm
		var dur: Dictionary = def(id).get("duration", {})
		match String(dur.get("kind", "manual")):
			"decay":
				if not a.hold and dm > 0.0:
					a.s -= dm / maxf(0.01, float(dur.get("full_minutes", 60.0)))
					_dirty = true
					if a.s <= 0.0: gone.append(id)
			"timer":
				a.left -= dm
				if a.left <= 0.0: gone.append(id)
		a.held = a.hold   # (for the badge: "still in the water")
		a.hold = false
	for id in gone: remove(id)
	_save_acc += dt
	if _dirty and autosave and _save_acc > 5.0:
		_save_acc = 0.0
		save()
