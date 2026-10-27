class_name Quests
extends Node
# Pallet Town's voices, gossip and quests: what each townsperson says when Ash
# talks to them (by time of day, what they're doing, where they are, who they
# are to each other), the Cinnabar rumours that travel round town, the little
# NPC-to-NPC exchanges, and a small data-driven quest system with a quest log.
# Data: res://life/dialogue.json, res://life/quests.json, res://life/lore.json.
# State: user://quests.save (JSON; quests, flags, items, rumours heard, who
# you've met today).
#
# ---------- integration (cast.gd / life.gd) ----------
#   quests = Quests.new(); add_child(quests); quests.setup(game, clock)
#       clock: anything with hour(), day(), period() (GameClock); may be null.
#       setup() also adds the quest log (QuestUI: a toggle button at the top
#       right, the log panel, and "New quest" toasts). make_ui = false skips it.
#   lines = quests.talk(id, {"hour":, "period":, "activity":, "place":, "day":})
#       -> Array of Strings for DialogBox.say(); advances quests. The first line
#       starts with the speaker's tag ("OLD TOM: ...") unless prefix_names = false.
#       Missing ctx keys are filled from the clock (or sane defaults).
#   quests.chatter(a, b, ctx) -> 2..4 lines "Name: ..." for two townspeople chatting
#   quests.overheard(id, ctx) -> a one-line bark for walking past ("" if none)
#   quests.wants(id) -> "" or a short reason: show the "!" marker when not empty
#   quests.relation(a, b) -> "family" | "friends" | "rivals" | "neighbours" | ""
#   quests.blocks_touch(pos) -> true when a touch belongs to the quest log (call it
#       from main.gd's _input next to Settings.blocks_touch, so the button doesn't
#       also move the camera)
#   signal quest_changed            any change: refresh "!" markers
#   signal quest_event(kind, quest_id, text)   kind: start, step, progress, complete, item, rumor
# Everything also works standalone (no setup, no clock, unknown ids): data loads
# lazily and unknown people get polite fallback lines.
#
# Delia (Ash's mom) has no test quests on purpose: her own story quests come
# later. quests.json holds a disabled "q_delia" placeholder as the hook; she
# already gives clue lines on other quests and plenty of ambient talk.

signal quest_changed
signal quest_event(kind: String, quest_id: String, text: String)

const DIALOGUE_PATH := "res://life/dialogue.json"
const QUESTS_PATH := "res://life/quests.json"
const LORE_PATH := "res://life/lore.json"
const PERIODS := ["dawn", "morning", "midday", "afternoon", "evening", "night"]
const RECENT := 10
# SIM's activity / place names may differ a little from the ones the writing uses
const ACT_ALIAS := {
	"yard": "yardwork", "yard_work": "yardwork", "gardening": "garden", "fishing": "fish", "baking": "bake",
	"knitting": "knit", "feeding": "feed", "eat": "supper", "dinner": "supper", "lunch": "supper",
	"social": "chat", "socialize": "chat", "talk": "chat", "wander": "walk", "stroll": "walk", "idle": "home",
	"rest": "home", "watch": "lighthouse", "keep": "lighthouse", "farming": "farm", "fields": "farm",
	"market": "shop", "sell": "shop", "selling": "shop", "mending": "mend", "delivering": "deliver", "round": "deliver",
	"sit": "porch", "nap": "home", "bed": "sleep", "asleep": "sleep",
}
const PLACE_ALIAS := {
	"square": "plaza", "lab": "plaza", "lab_gate": "plaza", "harbour": "pier", "harbor": "pier", "dock": "pier",
	"sea": "beach", "shore": "beach", "field": "fields", "farm": "fields", "route1": "route1_gate",
}

var game: Node = null
var clock: Object = null
var save_path := "user://quests.save"
var autosave := true
var prefix_names := true
var make_ui := true
var ui: Node = null
var rng := RandomNumberGenerator.new()

var D := {}            # dialogue.json
var QD := {}           # quests.json
var L := {}            # lore.json
var quest_list: Array = []      # quest dicts, file order (disabled ones left out)
var quest_by_id := {}
var rumor_list: Array = []
var rumor_by_id := {}
var st := {}           # saved state
var _recent := {}      # per speaker: keys of lines said lately (no immediate repeats)
var _last_ctx := {}
var _loaded := false
var _opts := {}        # this talk's options (conversation.gd): no_offer, no_clue, no_rumor

func _ready() -> void:
	_ensure()
	if make_ui and ui == null: _make_ui()

func setup(g: Node = null, clk: Object = null) -> void:
	game = g
	clock = clk
	_ensure()
	if clock != null and clock.has_signal("hour_changed") and not clock.is_connected("hour_changed", _on_hour):
		clock.connect("hour_changed", _on_hour)
	if make_ui and ui == null and is_inside_tree(): _make_ui()

func _make_ui() -> void:
	var s: GDScript = load("res://quest_ui.gd")
	if s == null: return
	ui = s.new()
	ui.set("quests", self)
	add_child(ui)

func _on_hour(_h: Variant = 0) -> void:
	quest_changed.emit()   # quests unlock by the hour: markers may change

func blocks_touch(pos: Vector2) -> bool:
	return ui != null and ui.has_method("blocks") and ui.blocks(pos)

# ---------- data ----------
func _ensure() -> void:
	if _loaded: return
	_loaded = true
	rng.randomize()
	D = _read_json(DIALOGUE_PATH)
	QD = _read_json(QUESTS_PATH)
	L = _read_json(LORE_PATH)
	quest_list = []
	quest_by_id = {}
	for q in QD.get("quests", []):
		if not (q is Dictionary) or not q.has("id"): continue
		quest_by_id[q.id] = q
		if not q.get("disabled", false): quest_list.append(q)
	rumor_list = []
	rumor_by_id = {}
	for r in L.get("rumors", []):
		if r is Dictionary and r.has("id"):
			rumor_list.append(r); rumor_by_id[r.id] = r
	st = _blank()
	load_state()

func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_warning("Quests: missing " + path)
		return {}
	var v: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if v is Dictionary: return v
	push_warning("Quests: could not parse " + path)
	return {}

func _blank() -> Dictionary:
	return {"v": 1, "quests": {}, "flags": {}, "items": {}, "heard": {}, "met": {}, "talks": {}, "clues": {}}

# ---------- save / load ----------
func save() -> void:
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify(st))

func load_state() -> void:
	st = _blank()
	if not FileAccess.file_exists(save_path): return
	var v: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if not (v is Dictionary): return
	for k in st:
		if v.has(k) and v[k] is Dictionary: st[k] = v[k]

func reset() -> void:
	_ensure()
	st = _blank()
	_recent = {}
	if autosave: save()
	quest_changed.emit()

func _changed() -> void:
	if autosave: save()
	quest_changed.emit()

# ---------- people ----------
func person(id: String) -> Dictionary:
	_ensure()
	var p: Variant = D.get("people", {}).get(id)
	return p if p is Dictionary else {}

func people_ids() -> Array:
	_ensure()
	return D.get("people", {}).keys()

func display_name(id: String) -> String:
	return String(person(id).get("name", id.capitalize()))

func short_name(id: String) -> String:
	return String(person(id).get("short", id.capitalize()))

func label(id: String) -> String:
	return String(person(id).get("label", short_name(id)))

func tag(id: String) -> String:
	return String(person(id).get("tag", short_name(id).to_upper()))

func relation(a: String, b: String) -> String:
	_ensure()
	var r: Dictionary = D.get("relations", {})
	return String(r.get(a + "|" + b, r.get(b + "|" + a, "")))

# ---------- context ----------
static func period_of(h: float) -> String:
	if h >= 5.0 and h < 7.0: return "dawn"
	if h >= 7.0 and h < 11.0: return "morning"
	if h >= 11.0 and h < 14.0: return "midday"
	if h >= 14.0 and h < 18.0: return "afternoon"
	if h >= 18.0 and h < 21.0: return "evening"
	return "night"

func _clock_call(m: String, def: Variant) -> Variant:
	if clock != null and is_instance_valid(clock) and clock.has_method(m): return clock.call(m)
	return def

func _ctx(ctx: Dictionary) -> Dictionary:
	var c := {}
	c.hour = float(ctx.get("hour", _clock_call("hour", _last_ctx.get("hour", 8.0))))
	c.day = int(ctx.get("day", _clock_call("day", _last_ctx.get("day", 1))))
	var p := String(ctx.get("period", ""))
	if p == "": p = String(_clock_call("period", period_of(c.hour)))
	if not PERIODS.has(p): p = period_of(c.hour)
	c.period = p
	c.activity = String(ctx.get("activity", ""))
	c.place = String(ctx.get("place", ""))
	return c

# "now": the clock when there is one, else the last talk's context
func _now() -> Dictionary:
	if clock != null and is_instance_valid(clock) and clock.has_method("hour"): return _ctx({})
	return _ctx(_last_ctx)

func _act_keys(a: String) -> Array:
	var keys := []
	if a == "": return keys
	keys.append(a)
	if a.contains(":"):
		var parts := a.split(":")
		keys.append(parts[1]); keys.append(parts[0])
	for k in keys.duplicate():
		if ACT_ALIAS.has(k) and not keys.has(ACT_ALIAS[k]): keys.append(ACT_ALIAS[k])
	return keys

func _place_keys(id: String, place: String) -> Array:
	var keys := []
	if place == "": return keys
	if place == String(person(id).get("home", "")): keys.append("home")
	keys.append(place)
	if PLACE_ALIAS.has(place): keys.append(PLACE_ALIAS[place])
	return keys

# ---------- lines ----------
static func _as_lines(e: Variant) -> Array:
	if e == null: return []
	if e is Array:
		var out := []
		for x in e: out.append(str(x))
		return out
	return [str(e)]

func _key(e: Variant) -> int:
	return str(e).hash()

# a random entry of pool that `who` hasn't said lately
func _pick(who: String, pool: Array) -> Variant:
	if pool.is_empty(): return null
	var rec: Array = _recent.get(who, [])
	var cands := []
	for e in pool:
		if not rec.has(_key(e)): cands.append(e)
	if cands.is_empty():
		for e in pool:
			if rec.is_empty() or _key(e) != rec[-1]: cands.append(e)
		if cands.is_empty(): cands = pool
	var e: Variant = cands[rng.randi() % cands.size()]
	rec.append(_key(e))
	while rec.size() > RECENT: rec.pop_front()
	_recent[who] = rec
	return e

func _fill(lines: Array, vars: Dictionary) -> Array:
	var out := []
	for l in lines:
		var s := String(l)
		for k in vars: s = s.replace("{" + k + "}", str(vars[k]))
		out.append(s)
	return out

func _prefix(id: String, lines: Array) -> Array:
	if not prefix_names or lines.is_empty(): return lines
	var first := String(lines[0])
	if first.begins_with("("): return lines
	lines[0] = tag(id) + ": " + first
	return lines

# ---------- fitting the dialog box ----------
# DialogBox shows 3 rows of Pixelify Sans in a box 138 x 9 font units; a line
# that needs more is split into several lines at sentence breaks (then commas,
# then words), so the writing can run a little long without being cut off.
const BOX_ROWS := 3
const BOX_W := 15.0     # box text width in font sizes (138 / 9, a little margin for rounding)
var _box_font: Font = null

func box_rows(text: String) -> int:
	if _box_font == null:
		var ff: Variant = load("res://fonts/PixelifySans.woff2") if ResourceLoader.exists("res://fonts/PixelifySans.woff2") else null
		if ff is Font:
			var fv := FontVariation.new(); fv.base_font = ff; fv.variation_opentype = {"wght": 600}
			_box_font = fv
	var fsz := 40
	var w := BOX_W * fsz
	var rows := 0
	var row := ""
	for word in text.split(" "):
		var tt := word if row == "" else row + " " + word
		var tw := _box_font.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x if _box_font else tt.length() * fsz * 0.55
		if tw > w and row != "":
			rows += 1; row = word
		else: row = tt
	if row != "": rows += 1
	return rows

func fit_lines(lines: Array) -> Array:
	var out := []
	for l in lines:
		var s := String(l)
		if box_rows(s) <= BOX_ROWS:
			out.append(s); continue
		var parts := _split_at(s, [". ", "! ", "? ", "... "])
		if parts.size() < 2: parts = _split_at(s, [", ", "; ", ": "])
		if parts.size() < 2: parts = Array(s.split(" "))
		var cur := ""
		for p in parts:
			var tt: String = p if cur == "" else cur + " " + p
			if cur != "" and box_rows(tt) > BOX_ROWS:
				out.append(cur); cur = p
			else: cur = tt
		if cur != "": out.append(cur)
	return out

# s cut after each separator (the separator's punctuation stays with its part)
func _split_at(s: String, seps: Array) -> Array:
	var parts := []
	var start := 0
	var i := 0
	while i < s.length():
		var hit := ""
		for sep in seps:
			if s.substr(i, sep.length()) == sep:
				hit = sep; break
		if hit != "":
			parts.append(s.substr(start, i + hit.length() - 1 - start))
			start = i + hit.length()
			i = start
		else: i += 1
	if start < s.length(): parts.append(s.substr(start))
	return parts

func _pool(d: Variant, keys: Array) -> Array:
	if not (d is Dictionary): return []
	for k in keys:
		if d.has(k) and d[k] is Array and not d[k].is_empty(): return d[k]
	return []

# ---------- talking to Ash ----------
func talk(id: String, ctx: Dictionary = {}) -> Array:
	_ensure()
	var c := _ctx(ctx)
	_last_ctx = c
	_opts = ctx
	var out := _quest_talk(id, c)
	if out.is_empty(): out = _ambient(id, c)
	_opts = {}
	if out.is_empty(): out = ["..."]
	out = (_condition_remarks(id, c) if not ctx.get("no_remarks", false) else []) + out
	st.met[id] = c.day
	st.talks[id] = int(st.talks.get(id, 0)) + 1
	if autosave: save()
	return fit_lines(_prefix(id, out))

# a comment on how Ash is (wet, worn out: conditions.gd decides when, once per
# episode and person; the words are the person's own, people.<id>.remarks.<key>,
# else fallback.remarks.<key>), said before their usual lines
func _condition_remarks(id: String, c: Dictionary) -> Array:
	var C: Conditions = Conditions.I
	if C == null or _act_keys(c.activity).has("sleep"): return []
	var out := []
	var own: Dictionary = person(id).get("remarks", {})
	var fb: Dictionary = D.get("fallback", {}).get("remarks", {})
	for r in C.remarks_for(id):
		for k in r.keys:
			var pool: Array = _pool(own, [k])
			if pool.is_empty(): pool = _pool(fb, [k])
			if pool.is_empty(): continue
			out += _as_lines(_pick(id, pool))
			break
	return out

func _ambient(id: String, c: Dictionary) -> Array:
	var P := person(id)
	var fb: Dictionary = D.get("fallback", {})
	if P.is_empty():
		return _as_lines(_pick(id, fb.get("talk", ["Hello there!"])))
	var acts := _act_keys(c.activity)
	if acts.has("sleep"):
		return _as_lines(_pick(id, P.get("sleep", ["(They're fast asleep.)"])))
	var out := []
	if int(st.met.get(id, -999)) != int(c.day):
		out += _as_lines(_pick(id, _pool(P.get("greet", {}), [c.period, "any", "morning"])))
	var pools := []   # [weight, entries, kind]
	var a_pool := _pool(P.get("activity", {}), acts)
	if not a_pool.is_empty(): pools.append([3.0, a_pool, ""])
	var p_pool := _pool(P.get("place", {}), _place_keys(id, c.place))
	if not p_pool.is_empty(): pools.append([2.0, p_pool, ""])
	var t_pool := _pool(P.get("period", {}), [c.period, "any"])
	if not t_pool.is_empty(): pools.append([2.0, t_pool, ""])
	for k in ["ash", "town"]:
		if P.get(k, []) is Array and not P.get(k, []).is_empty(): pools.append([1.6 if k == "ash" else 1.2, P[k], ""])
	var rel := []
	for o in P.get("about", {}): rel += P.about[o]
	if not rel.is_empty(): pools.append([0.9, rel, ""])
	var aft := []
	for f in P.get("after", {}):
		if st.flags.has(f): aft += P.after[f]
	if not aft.is_empty(): pools.append([2.5, aft, ""])
	var fresh := _rumors_for(id, false) if not _opts.get("no_rumor", false) else []
	var told := _rumors_for(id, true) if not _opts.get("no_rumor", false) else []
	if not fresh.is_empty(): pools.append([2.4, fresh, "rumor"])
	elif not told.is_empty(): pools.append([0.6, told, "rumor"])
	if pools.is_empty():
		out += _as_lines(_pick(id, fb.get("talk", ["Hello there!"])))
		return out
	# leave out pools with nothing fresh to say (a one-line pool just used, say)
	var fresh_pools := pools.filter(func(p): return _has_fresh(id, _entries_of(id, p)))
	if not fresh_pools.is_empty(): pools = fresh_pools
	var total := 0.0
	for p in pools: total += p[0]
	var r := rng.randf() * total
	var chosen: Array = pools[-1]
	for p in pools:
		r -= p[0]
		if r <= 0.0:
			chosen = p; break
	if chosen[2] == "rumor":
		var rids: Array = chosen[1].filter(func(x): return _has_fresh(id, rumor_by_id[x].tellers[id]))
		if rids.is_empty(): rids = chosen[1]
		var rid: String = rids[rng.randi() % rids.size()]
		out += _as_lines(_pick(id, rumor_by_id[rid].tellers[id]))
		_hear(rid)
	else:
		out += _as_lines(_pick(id, chosen[1]))
	return out

func _entries_of(id: String, p: Array) -> Array:
	if p[2] != "rumor": return p[1]
	var out := []
	for rid in p[1]: out += rumor_by_id[rid].tellers[id]
	return out

# does `who` have something in pool they haven't said lately?
func _has_fresh(who: String, pool: Array) -> bool:
	var rec: Array = _recent.get(who, [])
	for e in pool:
		if not rec.has(_key(e)): return true
	return false

# ---------- rumours ----------
func rumor_unlocked(rid: String) -> bool:
	var r: Dictionary = rumor_by_id.get(rid, {})
	if r.is_empty(): return false
	var req := String(r.get("requires", ""))
	if req == "": return true
	if req.begins_with("rumor:"): return st.heard.has(req.substr(6))
	return st.flags.has(req)

func heard(rid: String) -> bool:
	return st.heard.has(rid)

# ids of rumours `id` can tell: not yet heard (told = false) or already heard
func _rumors_for(id: String, told: bool) -> Array:
	var out := []
	for r in rumor_list:
		if not r.get("tellers", {}).has(id) or not rumor_unlocked(r.id): continue
		if st.heard.has(r.id) == told: out.append(r.id)
	return out

func _hear(rid: String) -> void:
	if st.heard.has(rid) or not rumor_by_id.has(rid): return
	st.heard[rid] = int(_now().day)
	quest_event.emit("rumor", "", String(rumor_by_id[rid].get("title", rid)))
	_changed()

# ---------- quests ----------
func quest(qid: String) -> Dictionary:
	_ensure()
	return quest_by_id.get(qid, {})

func quests() -> Array:
	_ensure()
	return quest_list

func state(qid: String, ctx: Dictionary = {}) -> String:
	_ensure()
	var s: Dictionary = st.quests.get(qid, {})
	if s.has("state"): return String(s.state)
	var q := quest(qid)
	if q.is_empty() or q.get("disabled", false): return "locked"
	return "available" if _unlock_ok(q, ctx if not ctx.is_empty() else _now()) else "locked"

func step_index(qid: String) -> int:
	return int(st.quests.get(qid, {}).get("step", 0))

# ---------- money for Mom ----------
# Some trainers send part of their prize money home after a battle (a hook for
# the battles to come; no UI yet). st.mom = {"saved": total sent, "last": the
# last amount, "day": the game day it came, "n": how many times}. Delia's
# lines can read it later (mom_savings()).
func send_money_home(amount: int, day := -1) -> void:
	_ensure()
	if amount <= 0: return
	var m: Dictionary = st.get("mom", {"saved": 0, "last": 0, "day": -1, "n": 0})
	m.saved = int(m.saved) + amount
	m.last = amount
	m.day = day
	m.n = int(m.n) + 1
	st.mom = m
	if autosave: save()

func mom_savings() -> int:
	return int(st.get("mom", {}).get("saved", 0))

func flag(f: String) -> bool:
	return st.flags.has(f)

func set_flag(f: String, on := true) -> void:
	if on: st.flags[f] = true
	else: st.flags.erase(f)
	_changed()

func has_item(it: String) -> bool:
	return int(st.items.get(it, 0)) > 0

func item_name(it: String) -> String:
	return String(QD.get("items", {}).get(it, {}).get("name", it.capitalize()))

func _unlock_ok(q: Dictionary, c: Dictionary) -> bool:
	var u: Dictionary = q.get("unlock", {})
	if int(c.day) < int(u.get("day_min", 1)): return false
	if u.has("hour_min") and float(c.hour) < float(u.hour_min): return false
	if u.has("hour_max") and float(c.hour) >= float(u.hour_max): return false
	if u.has("periods") and not u.periods.has(c.period): return false
	for a in u.get("after", []):
		if String(st.quests.get(a, {}).get("state", "")) != "done": return false
	for f in u.get("flags", []):
		if not st.flags.has(f): return false
	return true

func _step(q: Dictionary) -> Dictionary:
	var s: Dictionary = st.quests.get(q.id, {})
	var steps: Array = q.get("steps", [])
	var i := int(s.get("step", 0))
	return steps[i] if i < steps.size() else {}

func _who(q: Dictionary, step: Dictionary) -> Array:
	var w: Variant = step.get("who", "giver")
	var out := []
	for x in (w if w is Array else [w]):
		out.append(String(q.get("giver", "")) if x == "giver" else String(x))
	return out

func _done_who(q: Dictionary) -> Array:
	return st.quests.get(q.id, {}).get("done", [])

func _targets(q: Dictionary, step: Dictionary, id: String) -> bool:
	if not _who(q, step).has(id): return false
	return step.get("mode", "any") != "all" or not _done_who(q).has(id)

func _when_ok(step: Dictionary, c: Dictionary) -> bool:
	var w: Dictionary = step.get("when", {})
	if w.has("periods") and not w.periods.has(c.period): return false
	if w.has("places"):
		var ok := false
		for k in [c.place] + _place_keys("", c.place):
			if w.places.has(k): ok = true
		if not ok: return false
	if w.has("activities"):
		var ok2 := false
		for k in _act_keys(c.activity):
			if w.activities.has(k): ok2 = true
		if not ok2: return false
	return true

func _say_for(v: Variant, id: String) -> Array:
	if v is Dictionary: return _as_lines(v.get(id, v.get("any", [])))
	return _as_lines(v)

func _alt(id: String, v: Variant, def: String) -> Array:
	var pool: Array = []
	if v is Dictionary: pool = _as_lines(v.get(id, v.get("any", [])))
	elif v is Array: pool = v
	elif v != null: pool = [v]
	if pool.is_empty(): return [def]
	return _as_lines(_pick(id, pool))

func _quest_talk(id: String, c: Dictionary) -> Array:
	# 1. a step that needs this person
	for q in quest_list:
		if state(q.id) != "active": continue
		var step := _step(q)
		if step.is_empty() or not _targets(q, step, id): continue
		if not _when_ok(step, c):
			return _alt(id, step.get("not_now"), "Not now, Ash. Come back a bit later.")
		if step.has("needs") and not has_item(step.needs):
			return _alt(id, step.get("missing"), "You don't have it yet, do you?")
		var lines := _fill(_say_for(step.get("say", []), id), {"name": short_name(id)})
		return lines + _advance(q, step, id)
	# 2. someone with a clue for a step
	for q in quest_list:
		if _opts.get("no_clue", false): break
		if state(q.id) != "active": continue
		var step := _step(q)
		var clues: Dictionary = step.get("clues", {})
		if not clues.has(id): continue
		var ck := "%s:%d:%s" % [q.id, step_index(q.id), id]
		if st.clues.has(ck): continue
		st.clues[ck] = true
		return _as_lines(clues[id])
	# 3. a quest to hand over
	for q in quest_list:
		if _opts.get("no_offer", false): break
		if String(q.get("giver", "")) == id and state(q.id, c) == "available":
			return start(q.id)
	# 4. a giver waiting on you (every other talk, so their own chat still comes through)
	for q in quest_list:
		if String(q.get("giver", "")) == id and state(q.id) == "active":
			if int(st.talks.get(id, 0)) % 2 == 0:
				return _alt(id, q.get("remind"), String(_step(q).get("hint", "")))
	return []

# hand quest qid to Ash (from its giver); returns the offer lines
func start(qid: String) -> Array:
	var q := quest(qid)
	if q.is_empty(): return []
	st.quests[qid] = {"state": "active", "step": 0, "done": [], "day": int(_now().day)}
	quest_event.emit("start", qid, String(q.get("title", qid)))
	_changed()
	return _as_lines(q.get("offer", []))

func _advance(q: Dictionary, step: Dictionary, id: String) -> Array:
	var s: Dictionary = st.quests[q.id]
	var extra := []
	if step.has("take"): _take(String(step.take))
	if step.has("give"): _give(String(step.give))
	if step.has("set"): st.flags[String(step.set)] = true
	if step.get("mode", "any") == "all":
		var done: Array = s.get("done", [])
		if not done.has(id): done.append(id)
		s.done = done
		var total := _who(q, step).size()
		if done.size() < total:
			var vars := {"done": done.size(), "total": total}
			if step.has("progress"): extra += _fill(_alt("progress", step.progress, ""), vars)
			quest_event.emit("progress", q.id, "%s  %d/%d" % [q.get("title", q.id), done.size(), total])
			_changed()
			return extra
	s.step = int(s.get("step", 0)) + 1
	s.done = []
	if s.step >= q.get("steps", []).size():
		extra += _complete(q)
	else:
		quest_event.emit("step", q.id, String(q.get("title", q.id)))
	_changed()
	return extra

func _complete(q: Dictionary) -> Array:
	var s: Dictionary = st.quests[q.id]
	s.state = "done"
	s.done_day = int(_now().day)
	var rw: Dictionary = q.get("reward", {})
	if rw.has("flag"): st.flags[String(rw.flag)] = true
	if rw.has("item"): _give(String(rw.item))
	quest_event.emit("complete", q.id, String(q.get("title", q.id)))
	if rw.has("rumor"): _hear(String(rw.rumor))
	return _as_lines(rw.get("say", []))

func _give(it: String) -> void:
	st.items[it] = int(st.items.get(it, 0)) + 1
	quest_event.emit("item", "", item_name(it))

func _take(it: String) -> void:
	var n := int(st.items.get(it, 0)) - 1
	if n > 0: st.items[it] = n
	else: st.items.erase(it)

# "" or a short reason for the "!" marker over a townsperson
func wants(id: String) -> String:
	_ensure()
	var c := _now()
	for q in quest_list:
		if state(q.id) != "active": continue
		var step := _step(q)
		if step.is_empty() or not _targets(q, step, id): continue
		if not _when_ok(step, c): continue
		if step.has("needs") and not has_item(step.needs): continue
		return String(q.get("title", q.id))
	for q in quest_list:
		if String(q.get("giver", "")) == id and state(q.id, c) == "available":
			return "New: " + String(q.get("title", q.id))
	return ""

# who the first active quest wants Ash to see next (island.gd's compass):
# [quest title, [person ids]] or [] when no quest is active
func goal_people() -> Array:
	_ensure()
	for q in quest_list:
		if state(q.id) != "active": continue
		var step := _step(q)
		if step.is_empty(): continue
		var left := []
		for w in _who(q, step):
			if step.get("mode", "any") != "all" or not _done_who(q).has(w): left.append(w)
		if not left.is_empty(): return [String(q.get("title", q.id)), left]
	return []

# what the quest log shows
func step_hint(qid: String) -> String:
	var q := quest(qid)
	if q.is_empty(): return ""
	var step := _step(q)
	return String(step.get("hint", ""))

func step_progress(qid: String) -> String:
	var q := quest(qid)
	var step := _step(q)
	if step.get("mode", "any") != "all": return ""
	var who := _who(q, step)
	var left := []
	for w in who:
		if not _done_who(q).has(w): left.append(short_name(w))
	return "%d/%d  (left: %s)" % [who.size() - left.size(), who.size(), ", ".join(left)]

func log_entries() -> Dictionary:
	_ensure()
	var out := {"active": [], "done": [], "rumors": [], "items": []}
	for q in quest_list:
		var s := state(q.id)
		if s != "active" and s != "done": continue
		var e := {"id": q.id, "title": String(q.get("title", q.id)), "giver": display_name(String(q.get("giver", ""))),
			"summary": String(q.get("summary", "")), "hint": step_hint(q.id) if s == "active" else "",
			"progress": step_progress(q.id) if s == "active" else "",
			"step": step_index(q.id), "steps": q.get("steps", []).size()}
		out[s].append(e)
	for r in rumor_list:
		if st.heard.has(r.id): out.rumors.append({"id": r.id, "title": String(r.get("title", r.id)), "summary": String(r.get("summary", ""))})
	for it in st.items:
		out.items.append({"id": it, "name": item_name(it), "count": int(st.items[it]),
			"desc": String(QD.get("items", {}).get(it, {}).get("desc", ""))})
	return out

# ---------- overheard ----------
func overheard(id: String, ctx: Dictionary = {}) -> String:
	_ensure()
	var c := _ctx(ctx)
	var P := person(id)
	if P.is_empty(): return ""
	var b: Dictionary = P.get("bark", {})
	var acts := _act_keys(c.activity)
	if acts.has("sleep"): return "Zzz..."
	var pools := []
	var ap := _pool(b, acts)
	if not ap.is_empty(): pools.append(ap); pools.append(ap)
	var pp := _pool(b, [c.period])
	if not pp.is_empty(): pools.append(pp)
	if b.get("any", []) is Array and not b.get("any", []).is_empty(): pools.append(b.any)
	if pools.is_empty(): return ""
	var e: Variant = _pick("bark:" + id, pools[rng.randi() % pools.size()])
	var l := _as_lines(e)
	return String(l[0]) if not l.is_empty() else ""

# ---------- townspeople chatting ----------
func chatter(a: String, b: String, ctx: Dictionary = {}) -> Array:
	_ensure()
	var c := _ctx(ctx)
	var acts := _act_keys(c.activity)
	var pk := a + "|" + b if D.get("pairs", {}).has(a + "|" + b) else b + "|" + a
	var pair_opts := []
	for ex in D.get("pairs", {}).get(pk, []):
		var lines: Variant = ex
		if ex is Dictionary:
			var w: Array = ex.get("when", [])
			if not w.is_empty() and not w.has(c.period) and not _overlap(w, acts): continue
			lines = ex.get("lines", [])
		if lines is Array and lines.size() >= 2: pair_opts.append(lines)
	var lore_opts := []
	for ex in L.get("chatter", {}).get("list", []):
		if not (ex is Dictionary): continue
		if _fits(ex.get("a", []), a) and _fits(ex.get("b", []), b): lore_opts.append(_cast_roles(ex.lines, a, b))
		elif _fits(ex.get("a", []), b) and _fits(ex.get("b", []), a): lore_opts.append(_cast_roles(ex.lines, b, a))
	var r := rng.randf()
	var ex2: Variant = null
	if not pair_opts.is_empty() and r < 0.55: ex2 = _pick("chat:" + pk, pair_opts)
	elif not lore_opts.is_empty() and r < 0.75: ex2 = _pick("chat:" + pk, lore_opts)
	if ex2 == null: return _generic_chat(a, b, c, acts)
	var out := []
	for pair in ex2:
		if pair is Array and pair.size() >= 2:
			var sp := String(pair[0])
			var other := b if sp == a else a
			out.append(label(sp) + ": " + String(pair[1]).replace("{b}", short_name(other)))
	return out.slice(0, 4)

func _overlap(x: Array, y: Array) -> bool:
	for v in x:
		if y.has(v): return true
	return false

func _fits(roles: Array, id: String) -> bool:
	return roles.has(id) or roles.has("any")

func _cast_roles(lines: Array, a: String, b: String) -> Array:
	var out := []
	for l in lines:
		if l is Array and l.size() >= 2: out.append([a if l[0] == "A" else b, l[1]])
	return out

func _generic_chat(a: String, b: String, c: Dictionary, acts: Array) -> Array:
	if rng.randf() < 0.5:
		var t := a; a = b; b = t
	var A: Dictionary = person(a).get("chat", {})
	var B: Dictionary = person(b).get("chat", {})
	var fb: Dictionary = D.get("fallback", {})
	var opens: Dictionary = A.get("open", {})
	var topics := []   # [topic, weight]
	for k in ["any", c.period, "ash", "sea", "weather", "cinnabar"] + acts:
		if opens.has(k) and opens[k] is Array and not opens[k].is_empty():
			var wt := 1.0
			if k == "ash": wt = 1.6
			elif k == c.period: wt = 1.4
			elif k == "cinnabar": wt = 1.3 if st.flags.has("rumbles_heard") or st.heard.size() > 0 else 0.6
			topics.append([k, wt])
	var topic := "any"
	var opener: Variant = null
	if topics.is_empty():
		opener = _pick("chat:" + a, fb.get("chat_open", ["Lovely day!"]))
	else:
		var total := 0.0
		for t in topics: total += t[1]
		var r := rng.randf() * total
		for t in topics:
			r -= t[1]
			if r <= 0.0:
				topic = t[0]; break
		if r > 0.0: topic = topics[-1][0]
		opener = _pick("chat:" + a, opens[topic])
	var replies: Dictionary = B.get("reply", {})
	var rp := _pool(replies, [topic, "any"])
	if rp.is_empty(): rp = fb.get("chat_reply", ["Isn't it just."])
	var reply: Variant = _pick("chat:" + b, rp)
	var out := []
	out.append(label(a) + ": " + String(_as_lines(opener)[0]).replace("{b}", short_name(b)))
	out.append(label(b) + ": " + String(_as_lines(reply)[0]).replace("{b}", short_name(a)))
	var closes: Array = A.get("close", [])
	if not closes.is_empty() and rng.randf() < 0.45:
		out.append(label(a) + ": " + String(_as_lines(_pick("chat:" + a, closes))[0]).replace("{b}", short_name(b)))
	return out

# ---------- for the conversation mode (conversation.gd) ----------
# talk(id, ctx) also takes ctx options: no_offer (don't hand a quest over),
# no_clue (clues are asked for as questions instead), no_rumor (rumours are
# asked for too). What _quest_talk would do with `id` now, without doing it:
#   {"kind": "step", "qid", "step"} a step that needs them (and can be done now),
#   {"kind": "offer", "qid"} a quest they'd hand over, or {} (nothing, or only a
#   not-now / missing / clue / reminder, which talk() still says as before)
func beat(id: String, ctx: Dictionary = {}) -> Dictionary:
	_ensure()
	var c := _ctx(ctx)
	for q in quest_list:
		if state(q.id) != "active": continue
		var step := _step(q)
		if step.is_empty() or not _targets(q, step, id): continue
		if not _when_ok(step, c) or (step.has("needs") and not has_item(step.needs)): return {}
		return {"kind": "step", "qid": q.id, "step": step_index(q.id)}
	for q in quest_list:
		if String(q.get("giver", "")) == id and state(q.id, c) == "available":
			return {"kind": "offer", "qid": q.id}
	return {}

# carry out the step beat() found (take / give / set, the next step, the reward):
# returns the extra lines (progress, reward say) for the speaker
func advance_beat(qid: String, id: String) -> Array:
	var q := quest(qid)
	if q.is_empty() or state(qid) != "active": return []
	var step := _step(q)
	if step.is_empty() or not _targets(q, step, id): return []
	return _fill(_advance(q, step, id), {"name": short_name(id)})

# a clue `id` could give for an active quest (not given yet): {qid, key, lines, title} or {}
func clue_for(id: String) -> Dictionary:
	_ensure()
	for q in quest_list:
		if state(q.id) != "active": continue
		var step := _step(q)
		var clues: Dictionary = step.get("clues", {})
		if not clues.has(id): continue
		var ck := "%s:%d:%s" % [q.id, step_index(q.id), id]
		if st.clues.has(ck): continue
		return {"qid": q.id, "key": ck, "lines": _as_lines(clues[id]), "title": String(q.get("title", q.id))}
	return {}

func claim_clue(key: String) -> void:
	st.clues[key] = true
	if autosave: save()

# rumour ids `id` can tell that Ash hasn't heard yet (unlocked ones)
func fresh_rumors(id: String) -> Array:
	_ensure()
	return _rumors_for(id, false)

# one of `id`'s tellings of rumour rid (marks it heard)
func tell_rumor(id: String, rid: String) -> Array:
	_ensure()
	var r: Dictionary = rumor_by_id.get(rid, {})
	var pool: Array = r.get("tellers", {}).get(id, [])
	if pool.is_empty(): return []
	var out := _as_lines(_pick(id, pool))
	_hear(rid)
	return out

func hear(rid: String) -> void:
	_ensure()
	_hear(rid)

# what `id` says about what they're doing now (their activity, place or time pool)
func activity_lines(id: String, ctx: Dictionary = {}) -> Array:
	_ensure()
	var c := _ctx(ctx)
	var P := person(id)
	if P.is_empty(): return []
	var pool := _pool(P.get("activity", {}), _act_keys(c.activity))
	if pool.is_empty(): pool = _pool(P.get("place", {}), _place_keys(id, c.place))
	if pool.is_empty(): pool = _pool(P.get("period", {}), [c.period, "any"])
	return _as_lines(_pick(id, pool)) if not pool.is_empty() else []

# the condition remarks (wet, worn out) `id` would open with, as plain lines
func condition_lines(id: String, ctx: Dictionary = {}) -> Array:
	_ensure()
	return _condition_remarks(id, _ctx(ctx))

# a talk that didn't go through talk(): who Ash has met today, and how often
func note_talk(id: String, ctx: Dictionary = {}) -> void:
	_ensure()
	var c := _ctx(ctx)
	_last_ctx = c
	st.met[id] = c.day
	st.talks[id] = int(st.talks.get(id, 0)) + 1
	if autosave: save()

func met_today(id: String, ctx: Dictionary = {}) -> bool:
	_ensure()
	return int(st.met.get(id, -999)) == int(_ctx(ctx).day)

func talks_with(id: String) -> int:
	return int(st.talks.get(id, 0))

func give_item(it: String) -> void:
	_give(it); _changed()

func take_item(it: String) -> void:
	_take(it); _changed()

func quest_title(qid: String) -> String:
	return String(quest(qid).get("title", qid))

func rumor_title(rid: String) -> String:
	return String(rumor_by_id.get(rid, {}).get("title", rid))

func rumor_ids() -> Array:
	_ensure()
	return rumor_by_id.keys()

func tellers_of(rid: String) -> Array:
	_ensure()
	return rumor_by_id.get(rid, {}).get("tellers", {}).keys()
