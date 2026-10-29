class_name Conversation
extends Node
# The conversation mode: talking to someone (A near a townsperson, an indoor
# person such as Prof. Oak, a Pokémon) becomes a little scene. The world keeps
# running; the controls move to the conversation. Ash and the other face each
# other at a comfortable distance (he steps into place), the camera leaves the
# gameplay boom for a two-shot and then drifts toward whoever speaks, and both
# of them look at each other, talk (the jaw moves while a line types out),
# blink, nod and gesture. Ash speaks for himself and, when it matters, the
# player chooses what he says.
#
# ---------- the engine (works headless: dev/conversation_test.gd) ----------
#   conv = Conversation.new(); add_child(conv); conv.setup(quests, clock)
#   conv.open(id, kind, ctx, opts)   kind "person" | "pet" | "npc"; opts:
#        {tree: id} run that tree, {lines: [...]} the opener lines (npcs, pets),
#        {topics: false} no questions, {cutscene: true}
#   item = conv.step()   the next thing to show: {t: "line", who, text} |
#        {t: "choices", list: [{label, tone, dim}]} | {t: "end"}
#   conv.next()          after a line;   conv.choose(i)   after choices
#   conv.interrupt()     the other has to go: a polite goodbye, then the end
# Data: res://life/conversations.json (trees, Ash's own lines, speakers, tones,
# goodbyes, interrupts), res://life/topics.json (the questions Ash can ask, by
# person: the town, the people, Pokémon, the road, the world beyond; rumours
# come out through them), res://life/growth.json (Ash's six growth threads).
# State: user://conversations.save (growth, relationships, what Ash has asked
# and learned, trees seen). Story flags live in Quests (quests.save), so the
# townspeople's `after` lines can read them (heart_<thread>_<stage> too).
#
# A tree: {id, with (who), on ("talk" | "offer:<quest>" | "step:<quest>:<n>" |
# "scene"), if (conditions), chance, once, daily, topics (questions after it,
# default true), start, nodes}. A node: {lines, do (effects), then one of:
# choices [{label, tone, ash (his line; "" = none), if, do, next}], branch
# [{if, next}...] (the last without "if"), next, end: true}. Lines: a plain
# string is the other person; "A: " Ash, "N: " narration, "<id>: " someone else.
# Conditions: flag, flags, not_flag, quest [id, state], quest_not, step [id, n],
# item, not_item, period [..], hour_min, hour_max, day_min, cond, not_cond,
# rel_min, rel_max, growth {thread: n}, first_today, heard, not_heard, known,
# not_known, act [..], later (quest), talks_min, seen, not_seen, chance, any [..].
# Effects: flag, flags, unflag, start_quest, advance, later, give, take,
# growth {thread: n}, rel, rumor, know, end_talk, mood.
#
# ---------- the scene (when attached to the game) ----------
#   conv.attach(game, cast, ui_layer)   cast.gd begin_*() / update(dt) / camera(dt)

signal started(who: String)
signal ended(who: String)

const DATA := "res://life/conversations.json"
const TOPICS := "res://life/topics.json"
const GROWTH := "res://life/growth.json"
const COND_KEYS := ["flag", "flags", "not_flag", "quest", "quest_not", "step", "item", "not_item", "period", "hour_min", "hour_max",
	"day_min", "cond", "not_cond", "rel_min", "rel_max", "growth", "first_today", "heard", "not_heard", "known", "not_known", "act",
	"later", "talks_min", "seen", "not_seen", "chance", "any", "_note"]
const DO_KEYS := ["flag", "flags", "unflag", "start_quest", "advance", "later", "give", "take", "growth", "rel", "rumor", "know",
	"end_talk", "mood", "_note"]
const MAX_ROUNDS := 4        # question menus in one talk before they wrap it up
const MENU := 3              # questions offered at once (plus "See you later!")

var save_path := "user://conversations.save"
var autosave := true
var C := {}
var T := {}
var G := {}
var trees := {}             # id -> tree
var topics := {}            # id -> topic
var st := {}
var quests: Quests
var clock: Object
var rng := RandomNumberGenerator.new()
var test_mode := false      # chance conditions pass, ambient trees always considered

# the talk in progress
var active := false
var who := ""               # the other: a person id, "oak", a pet id, an npc key
var kind := ""
var ctx := {}
var opts := {}
var queue: Array = []
var cur := {}
var tree := {}
var beat := {}
var asked: Array = []       # topic keys asked this talk
var rounds := 0
var _end_talk := false
var log: Array = []         # (tests) every item shown
var _tags := {}             # "OLD TOM" -> "tom"
var food_request := ""      # "Could I get something to eat?": the place whose menu cast.gd opens after the talk
var arena_request := false  # "Can I use the training arena?" (Prof. Oak): cast.gd takes Ash there after the talk (arena/arena.gd)

func _ready() -> void:
	_ensure()

func setup(q: Quests, clk: Object = null) -> void:
	quests = q
	clock = clk
	_ensure()

var _loaded := false
func _ensure() -> void:
	if _loaded: return
	_loaded = true
	rng.randomize()
	C = _read(DATA)
	T = _read(TOPICS)
	G = _read(GROWTH)
	trees = {}
	for t in C.get("trees", []): trees[String(t.id)] = t
	topics = {}
	for t in T.get("topics", []): topics[String(t.id)] = t
	for f in T.get("more", []):   # more topic files (the people's own questions)
		for t in _read(String(f)).get("topics", []): topics[String(t.id)] = t
	load_state()

static func _read(p: String) -> Dictionary:
	if not FileAccess.file_exists(p): return {}
	var v = JSON.parse_string(FileAccess.get_file_as_string(p))
	return v if v is Dictionary else {}

# ---------- state ----------
func _blank() -> Dictionary:
	return {"v": 1, "growth": {}, "rel": {}, "asked": {}, "known": {}, "seen": {}, "later": {}}

func save() -> void:
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f: f.store_string(JSON.stringify(st))

func load_state() -> void:
	st = _blank()
	if not FileAccess.file_exists(save_path): return
	var v = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if v is Dictionary:
		for k in st:
			if v.has(k) and v[k] is Dictionary: st[k] = v[k]

func reset() -> void:
	st = _blank()
	if autosave: save()

func _dirty() -> void:
	if autosave: save()

func day() -> int:
	return int(ctx.get("day", clock.call("day") if clock != null and clock.has_method("day") else 1))

func period() -> String:
	if ctx.has("period"): return String(ctx.period)
	if clock != null and clock.has_method("period"): return String(clock.call("period"))
	return "morning"

func growth(thread: String) -> int: return int(st.growth.get(thread, 0))

func stage(thread: String) -> int:
	var th: Dictionary = G.get("threads", {}).get(thread, {})
	var s := 0
	var steps: Array = th.get("stages", [0, 2, 5, 9, 14])
	for i in steps.size():
		if growth(thread) >= int(steps[i]): s = i
	return s

func rel(id: String) -> int: return int(st.rel.get(id, 0))

# what Ash has learned (journal-ready): [{id, note, day}]
func knowledge() -> Array:
	var out := []
	for k in st.known: out.append({"id": k, "note": String(st.known[k].get("note", "")), "day": int(st.known[k].get("day", 0))})
	return out

# ---------- names, colours, voices ----------
func speaker_name(id: String) -> String:
	if id == "": return ""
	var s: Dictionary = C.get("speakers", {}).get(id, {})
	if s.has("name"): return String(s.name)
	if quests and not quests.person(id).is_empty(): return quests.tag(id)
	return id.capitalize().to_upper()

func speaker_colour(id: String) -> Color:
	var s: Dictionary = C.get("speakers", {}).get(id, {})
	return Color(String(s.get("colour", "#5b6b8c")))

func speaker_voice(id: String) -> Array:
	var s: Dictionary = C.get("speakers", {}).get(id, {})
	return [String(s.get("voice", "mid")), float(s.get("pitch", 1.0))]

func _tag_map() -> Dictionary:
	if not _tags.is_empty(): return _tags
	if quests:
		for id in quests.people_ids():
			_tags[quests.tag(id).to_upper()] = id
			_tags[quests.label(id).to_upper()] = id
			_tags[quests.short_name(id).to_upper()] = id
	for id in C.get("speakers", {}):
		_tags[String(C.speakers[id].get("name", id)).to_upper()] = id
		_tags[String(id).to_upper()] = id
	return _tags

# the old "NAME: text" lines (Quests.talk, the cast's lines) as {who, text}
func parse_lines(lines: Array, default_who: String) -> Array:
	var out := []
	var cur_who := default_who
	var tags := _tag_map()
	for l in lines:
		var s := String(l)
		var c := s.find(": ")
		if c > 0 and c < 16:
			var tg := s.substr(0, c).to_upper()
			if tags.has(tg):
				cur_who = tags[tg]; s = s.substr(c + 2)
		if s.begins_with("("): out.append({"who": "", "text": s})
		else: out.append({"who": cur_who, "text": s})
	return out

# a tree line: plain = the other, "A: " Ash, "N: " narration, "<id>: " that speaker
func _line(raw: String) -> Dictionary:
	if raw.begins_with("A: "): return {"who": "ash", "text": raw.substr(3)}
	if raw.begins_with("N: "): return {"who": "", "text": raw.substr(3)}
	var c := raw.find(": ")
	if c > 0 and c < 10:
		var id := raw.substr(0, c)
		if id == id.to_lower() and (C.get("speakers", {}).has(id) or (quests and not quests.person(id).is_empty())):
			return {"who": id, "text": raw.substr(c + 2)}
	if raw.begins_with("("): return {"who": "", "text": raw}
	return {"who": who, "text": raw}

func _push_lines(lines: Array) -> void:
	for l in lines:
		var d: Dictionary = l if l is Dictionary else _line(String(l))
		d = d.duplicate()
		d.t = "line"
		d.text = String(d.text).replace("{ash}", "Ash")
		queue.append(d)

# ---------- conditions and effects ----------
func ok(c: Variant) -> bool:
	if c == null or not (c is Dictionary) or c.is_empty(): return true
	var q := quests
	for k in c:
		var v = c[k]
		match k:
			"_note": pass
			"flag": if not q.flag(String(v)): return false
			"flags":
				for f in v:
					if not q.flag(String(f)): return false
			"not_flag": if q.flag(String(v)): return false
			"quest": if q.state(String(v[0])) != String(v[1]): return false
			"quest_not": if q.state(String(v[0])) == String(v[1]): return false
			"step": if q.state(String(v[0])) != "active" or q.step_index(String(v[0])) != int(v[1]): return false
			"item": if not q.has_item(String(v)): return false
			"not_item": if q.has_item(String(v)): return false
			"period": if not (v as Array).has(period()): return false
			"hour_min": if _hour() < float(v): return false
			"hour_max": if _hour() >= float(v): return false
			"day_min": if day() < int(v): return false
			"cond": if Conditions.I == null or not Conditions.I.has(String(v)): return false
			"not_cond": if Conditions.I != null and Conditions.I.has(String(v)): return false
			"rel_min": if rel(who) < int(v): return false
			"rel_max": if rel(who) > int(v): return false
			"growth":
				for th in v:
					if growth(th) < int(v[th]): return false
			"first_today": if bool(v) != (not ctx.get("met_today", false)): return false
			"heard": if not q.heard(String(v)): return false
			"not_heard": if q.heard(String(v)): return false
			"known": if not st.known.has(String(v)): return false
			"not_known": if st.known.has(String(v)): return false
			"act":
				var a := String(ctx.get("activity", ""))
				var hit := false
				for x in v:
					if a == String(x) or a.begins_with(String(x) + ":") or a.ends_with(":" + String(x)): hit = true
				if not hit: return false
			"later": if int(st.later.get(String(v), -1)) != day(): return false
			"talks_min": if q.talks_with(who) < int(v): return false
			"seen": if not st.seen.has(String(v)): return false
			"not_seen": if st.seen.has(String(v)): return false
			"chance": if not test_mode and rng.randf() >= float(v): return false
			"any":
				var any := false
				for sub in v:
					if ok(sub): any = true; break
				if not any: return false
			_: push_warning("conversation: unknown condition " + str(k))
	return true

func _hour() -> float:
	if ctx.has("hour"): return float(ctx.hour)
	return float(clock.call("hour")) if clock != null and clock.has_method("hour") else 9.0

func apply(d: Variant) -> void:
	if d == null or not (d is Dictionary): return
	var q := quests
	for k in d:
		var v = d[k]
		match k:
			"_note": pass
			"flag": q.set_flag(String(v))
			"flags":
				for f in v: q.set_flag(String(f))
			"unflag": q.set_flag(String(v), false)
			"start_quest":
				if q.state(String(v)) == "available" or q.state(String(v)) == "locked": q.start(String(v))
				st.later.erase(String(v))
			"advance":
				if not beat.is_empty() and beat.kind == "step":
					var extra := q.advance_beat(String(beat.qid), who)
					_push_lines(parse_lines(extra, who))
			"later": st.later[String(v)] = day()
			"give": q.give_item(String(v))
			"take": q.take_item(String(v))
			"growth":
				for th in v: grow(String(th), int(v[th]))
			"rel": st.rel[who] = clampi(rel(who) + int(v), -5, 10)
			"rumor": q.hear(String(v))
			"know": _know(String(v), "")
			"end_talk": _end_talk = bool(v)
			"mood": _mood = String(v)
			_: push_warning("conversation: unknown effect " + str(k))
	_dirty()

var _mood := ""     # a pet's mood for the scene to play (creature.mood)
var notes: Array = []   # growth notes for the UI ("Patience grew")

func grow(thread: String, n: int) -> void:
	if not G.get("threads", {}).has(thread) or n == 0: return
	var before := stage(thread)
	st.growth[thread] = growth(thread) + n
	var after := stage(thread)
	var nm := String(G.threads[thread].get("name", thread.capitalize()))
	notes.append("Ash's " + nm + (" grew" if n > 0 else " was tested"))
	if after > before:
		for s in range(before + 1, after + 1): quests.set_flag("heart_%s_%d" % [thread, s])
		notes.append("%s: stage %d" % [nm, after])
	_dirty()

func _know(id: String, note: String) -> void:
	if st.known.has(id): return
	st.known[id] = {"day": day(), "note": note}

# ---------- opening a talk ----------
func open(id: String, k: String, c: Dictionary = {}, o: Dictionary = {}) -> void:
	_ensure()
	who = id; kind = k; opts = o
	ctx = c.duplicate()
	if not ctx.has("day"): ctx.day = day()
	if not ctx.has("period"): ctx.period = period()
	ctx.met_today = quests.met_today(id, ctx) if kind == "person" else bool(st.seen.has("met:" + id) and int(st.seen["met:" + id]) == int(ctx.day))
	queue = []; cur = {}; tree = {}; beat = {}; asked = []; rounds = 0; _end_talk = false; _mood = ""; notes = []
	active = true
	var asleep := String(ctx.get("activity", "")) == "sleep" or bool(ctx.get("asleep", false))
	if o.has("tree"):
		if kind == "person": beat = quests.beat(who, ctx)
		_push_lines(parse_lines(o.get("lines", []), who))
		_run_tree(trees.get(String(o.tree), {}))
	elif kind == "person":
		_open_person(asleep)
	else:
		_open_other(asleep)
	st.seen["met:" + id] = int(ctx.day)
	started.emit(id)

func _open_person(asleep: bool) -> void:
	var b := quests.beat(who, ctx) if not asleep else {}
	if not b.is_empty() and b.kind == "offer" and int(st.later.get(String(b.qid), -1)) == day() and rng.randf() < 0.5 and not test_mode:
		b = {}   # he said "later" today: not asked again every time
	var t := {}
	if b.get("kind", "") == "offer": t = _find("offer:" + String(b.qid))
	elif b.get("kind", "") == "step": t = _find("step:%s:%d" % [b.qid, int(b.step)])
	if not t.is_empty():
		beat = b
		_push_lines(parse_lines(quests.condition_lines(who, ctx), who))
		_cond_reply()
		quests.note_talk(who, ctx)
		_run_tree(t)
		return
	if b.is_empty() and not asleep:
		var amb := _pick_ambient()
		if not amb.is_empty():
			_push_lines(parse_lines(quests.condition_lines(who, ctx), who))
			_cond_reply()
			quests.note_talk(who, ctx)
			_run_tree(amb)
			return
	# the person's own words (Quests.talk: the greeting, what they're up to, a
	# quest's reminder or a step without a tree); rumours and clues are asked for
	var c2 := ctx.duplicate()
	c2.no_rumor = true; c2.no_clue = true; c2.no_remarks = true
	if int(st.later.get(String(quests.beat(who, ctx).get("qid", "")), -1)) == day(): c2.no_offer = true
	var greet := []
	if not ctx.met_today and not asleep and rng.randf() < 0.6: greet = _ash_bit("greet")
	# a remark on how he is (wet, worn out) opens it, and Ash answers it
	var cl := parse_lines(quests.condition_lines(who, ctx), who) if not asleep else []
	var lines := parse_lines(quests.talk(who, c2), who)
	if not cl.is_empty():
		_push_lines(cl)
		_cond_reply()
	elif not greet.is_empty() and not lines.is_empty() and lines[0].who == who:
		_push_lines([{"who": "ash", "text": greet[0]}])
	_push_lines(lines)
	_pet_chime()
	if asleep: queue.append({"t": "end"})
	else: queue.append({"t": "topics"})

func _open_other(asleep: bool) -> void:
	var lines: Array = opts.get("lines", [])
	var amb := _pick_ambient() if not asleep else {}
	if not amb.is_empty() and (kind != "pet" or rng.randf() < 0.65 or test_mode):
		# a pet's own tree replaces its usual noises; Oak's first words lead into his
		if kind == "npc": _push_lines(parse_lines(lines, who))
		_run_tree(amb)
		return
	_push_lines(parse_lines(lines, who))
	if kind == "pet" and not asleep:
		var r := _ash_bit("pet")
		if not r.is_empty(): _push_lines([{"who": "ash", "text": r[0]}])
	if not asleep and _topics_for().size() > 0 and opts.get("topics", true): queue.append({"t": "topics"})
	else: queue.append({"t": "end"})

# their Pokémon close by (ctx.pet_near: Nibbles at Lily's feet, Ben's Doduo,
# Mr. Mime by Delia) now and then joins in
func _pet_chime() -> void:
	var pid := String(ctx.get("pet_near", ""))
	if pid == "" or (rng.randf() > 0.4 and not test_mode): return
	var pool: Array = C.get("pet_chimes", {}).get(pid, [])
	if pool.is_empty(): return
	var e = pool[rng.randi() % pool.size()]
	_push_lines(e if e is Array else [e])

# the place whose food the one Ash is talking to serves right now ("" none):
# Hana at her tea stop; Mom at Pallet House while it's open
func food_place() -> String:
	if Conditions.I == null and not test_mode: return ""
	for pid in ["inn", "tea_house"]:
		var P := FoodData.place(pid)
		if String(P.get("host_id", "")) != who: continue
		if pid == "tea_house": return pid
		var act := String(ctx.get("activity", ""))
		if act in ["open", "cook", "serve", "garden", "break"] and String(ctx.get("place", "pallet_house")).begins_with("pallet_house"): return pid
	return ""

func _cond_reply() -> void:
	if Conditions.I == null: return
	for k in ["wet", "fatigue", "hungry", "stuffed", "well_fed"]:
		if Conditions.I.has(k):
			var r := _ash_bit("cond_" + k)
			if not r.is_empty(): _push_lines([{"who": "ash", "text": r[0]}])
			return

func _ash_bit(key: String) -> Array:
	var b: Dictionary = C.get("ash", {})
	var per: Dictionary = b.get("by", {}).get(who, {})
	var pool: Array = per.get(key, b.get(key, []))
	if pool.is_empty(): return []
	return [String(pool[rng.randi() % pool.size()])]

func _find(on: String) -> Dictionary:
	for id in trees:
		var t: Dictionary = trees[id]
		if String(t.get("on", "")) != on: continue
		var w = t.get("with", "")
		if w is Array:
			if not (w as Array).has(who): continue
		elif String(w) != "" and String(w) != who: continue
		if not ok(t.get("if")): continue
		return t
	return {}

func _has_on(on: String) -> bool:
	for id in trees:
		if String(trees[id].get("on", "")) == on: return true
	return false

# an everyday tree for who (Delia, Oak, the kids' antics, first meetings of the
# day): eligible ones by condition, once / daily, each with its own chance
func _pick_ambient() -> Dictionary:
	var cands := []
	for id in trees:
		var t: Dictionary = trees[id]
		if String(t.get("on", "")) != "talk" or String(t.get("with", "")) != who: continue
		if t.get("once", true) and st.seen.has(id): continue
		if t.get("daily", false) and int(st.seen.get(id, -1)) == day(): continue
		if not ok(t.get("if")): continue
		cands.append(t)
	if cands.is_empty(): return {}
	cands.sort_custom(func(a, b): return float(a.get("priority", 0)) > float(b.get("priority", 0)))
	for t in cands:
		if test_mode or rng.randf() < float(t.get("chance", 0.45)): return t
	return {}

# ---------- running a tree ----------
func _run_tree(t: Dictionary) -> void:
	if t.is_empty():
		queue.append({"t": "topics"}); return
	tree = t
	st.seen[String(t.id)] = day()
	queue.append({"t": "goto", "node": String(t.get("start", "start"))})

func _enter(nid: String) -> void:
	var nodes: Dictionary = tree.get("nodes", {})
	if not nodes.has(nid):
		push_warning("conversation: no node %s in %s" % [nid, tree.get("id", "?")])
		_tree_end(); return
	var n: Dictionary = nodes[nid]
	_push_lines(n.get("lines", []))
	if n.has("do"): queue.append({"t": "do", "do": n.do})
	if n.has("choices"):
		var list := []
		for ch in n.choices:
			if ok(ch.get("if")): list.append(ch)
		queue.append({"t": "choices", "list": list, "src": "tree"})
	elif n.has("branch"):
		for br in n.branch:
			if ok(br.get("if")):
				queue.append({"t": "goto", "node": String(br.next)}); return
		_tree_end()
	elif n.has("next"):
		queue.append({"t": "goto", "node": String(n.next)})
	else:
		_tree_end()

func _tree_end() -> void:
	var more: bool = tree.get("topics", true) and kind != "pet" and not opts.get("cutscene", false)
	queue.append({"t": "end_tree", "more": more})

# ---------- the questions ----------
# the menu: a quest clue, a rumour (the generic "Heard anything?" for a fresh
# one, a named follow-up when Ash knows the rumour it follows), the person's
# own topics and the shared ones they have an answer for, "What are you up
# to?"; topics not asked yet first, older ones again (dimmed) after a day
func _topics_for() -> Array:
	var out := []
	if kind == "person" and quests:
		var cl := quests.clue_for(who)
		if not cl.is_empty() and not asked.has("clue"):
			out.append({"key": "clue", "kind": "clue", "label": _clue_label(cl.qid), "tone": "curious", "clue": cl, "pri": 3})
	var fresh: Array = quests.fresh_rumors(who) if quests else []
	var asks: Dictionary = T.get("rumor_asks", {})
	var generic := ""
	for rid in fresh:
		var req := String(quests.rumor_by_id[rid].get("requires", ""))
		if asks.has(rid) and req != "" and not asked.has("rumor:" + rid):
			out.append({"key": "rumor:" + rid, "kind": "rumor", "rid": rid, "label": String(asks[rid].label), "ash": String(asks[rid].get("ash", "")), "tone": "curious", "pri": 2})
		elif generic == "": generic = rid
	if generic != "" and not asked.has("gossip"):
		var g: Array = T.get("gossip", [{"label": "Heard anything interesting?", "ash": "Heard anything interesting lately?"}])
		var gi: Dictionary = g[rng.randi() % g.size()]
		out.append({"key": "gossip", "kind": "rumor", "rid": generic, "label": String(gi.label), "ash": String(gi.get("ash", "")), "tone": "curious", "pri": 2})
	var own := []
	for tid in topics:
		var tp: Dictionary = topics[tid]
		var by: Dictionary = tp.get("by", {})
		if not by.has(who) or asked.has(tid): continue
		var ans = by[who]
		if not ok(tp.get("if")) or (ans is Dictionary and not ok(ans.get("if"))): continue
		var last := int(st.asked.get(tid + "@" + who, -999))
		if last == day() and not test_mode: continue
		own.append({"key": tid, "kind": "topic", "topic": tp, "label": String(tp.label), "tone": String(tp.get("tone", "curious")),
			"dim": last > -999, "pri": 1 if last == -999 else 0})
	out += own
	# Prof. Oak: the Battle Arena, always on offer (conversations.json arena)
	var ar: Dictionary = C.get("arena", {}).get(who, {})
	if not ar.is_empty() and not asked.has("arena"):
		out.append({"key": "arena", "kind": "arena", "label": String(ar.get("ask", "Can I use the training arena?")), "tone": "eager", "pri": 4.0})
	# someone who serves food, at work (life/food.json host_id): Ash can ask for the menu
	var fp := food_place()
	if fp != "" and not asked.has("food"):
		var hungry: bool = Conditions.I != null and Conditions.I.has("hungry")
		out.append({"key": "food", "kind": "food", "place": fp, "label": "Could I get something to eat?" if fp != "home" else "What's to eat, Mom?", "tone": "kind", "pri": 3.5 if hungry else 1.5})
	if kind == "person" and not asked.has("doing") and quests and not quests.activity_lines(who, ctx).is_empty():
		var lab := "Where are you off to?" if String(ctx.get("state", "")) in ["walk", "wait_path"] else "What are you up to?"
		out.append({"key": "doing", "kind": "doing", "label": lab, "tone": "curious", "pri": 0.5, "dim": asked.has("doing")})
	return out

func _clue_label(qid: String) -> String:
	var l: Dictionary = T.get("clue_labels", {})
	return String(l.get(qid, "About " + quests.quest_title(qid) + "...")) if quests else "About that..."

func _menu() -> Dictionary:
	var all := _topics_for()
	if all.is_empty() or rounds >= MAX_ROUNDS: return {}
	# the best few: by priority, shuffled within a priority
	for e in all: e.r = float(e.pri) + rng.randf() * 0.9
	all.sort_custom(func(a, b): return a.r > b.r)
	var pick := []
	var fresh_n := 0
	for e in all:
		if pick.size() >= MENU: break
		if e.get("dim", false) and fresh_n >= 2: continue
		pick.append(e)
		if not e.get("dim", false): fresh_n += 1
	var bye := {"key": "bye", "kind": "bye", "label": _bye_label(), "tone": "bye"}
	pick.append(bye)
	return {"t": "choices", "list": pick, "src": "topics"}

func _bye_label() -> String:
	var b: Dictionary = C.get("ash", {})
	var l: Array = b.get("by", {}).get(who, {}).get("bye_labels", b.get("bye_labels", ["See you later!"]))
	return String(l[(day() + rounds) % l.size()])

func _answer(e: Dictionary) -> void:
	asked.append(String(e.key))
	rounds += 1
	match String(e.kind):
		"bye":
			_goodbye(String(e.label)); return
		"clue":
			var al := _ash_bit("ask_clue")
			_push_lines([{"who": "ash", "text": al[0] if not al.is_empty() else "Do you know anything about it?"}])
			_push_lines(parse_lines(e.clue.lines, who))
			quests.claim_clue(String(e.clue.key))
		"rumor":
			if String(e.get("ash", "")) != "": _push_lines([{"who": "ash", "text": String(e.ash)}])
			_push_lines(parse_lines(quests.tell_rumor(who, String(e.rid)), who))
			_know("rumor:" + String(e.rid), quests.rumor_title(String(e.rid)))
		"food":
			var fa := _ash_bit("ask_food")
			_push_lines([{"who": "ash", "text": fa[0] if not fa.is_empty() else "Could I get something to eat?"}])
			var ml: Array = FoodData.place(String(e.place)).get("lines", {}).get("menu", ["Of course! Here's the menu."])
			_push_lines(parse_lines([String(ml[rng.randi() % ml.size()])], who))
			food_request = String(e.place)
			queue.append({"t": "end"})
			_dirty()
			return
		"arena":
			var ar: Dictionary = C.get("arena", {}).get(who, {})
			_push_lines([{"who": "ash", "text": String(ar.get("ash", e.label))}])
			_push_lines(parse_lines(ar.get("lines", ["Of course, Ash."]), who))
			arena_request = true
			queue.append({"t": "end"})
			_dirty()
			return
		"doing":
			var askl := "Where are you headed?" if String(e.label).begins_with("Where") else "What are you up to?"
			_push_lines([{"who": "ash", "text": askl}])
			_push_lines(parse_lines(quests.activity_lines(who, ctx), who))
		_:
			var tp: Dictionary = e.topic
			var ans = tp.by[who]
			var lines: Array = ans if ans is Array else ans.get("lines", [])
			var ash := String(tp.get("ash", tp.label))
			if ans is Dictionary and ans.has("ash"): ash = String(ans.ash)
			if ash != "": _push_lines([{"who": "ash", "text": ash}])
			_push_lines(lines)
			var first: bool = not st.asked.has(String(tp.id) + "@" + who)
			st.asked[String(tp.id) + "@" + who] = day()
			_know(String(tp.id), String(tp.get("note", "")))
			if first:
				if tp.has("do"): queue.append({"t": "do", "do": tp.do})
				if ans is Dictionary and ans.has("do"): queue.append({"t": "do", "do": ans.do})
				# asking grows his openness a little (every few new questions)
				var n := int(st.seen.get("asks_n", 0)) + 1
				st.seen["asks_n"] = n
				if n % 6 == 0: queue.append({"t": "do", "do": {"growth": {"openness": 1}}})
			if ans is Dictionary and ans.has("tree") and trees.has(String(ans.tree)):
				_run_tree(trees[String(ans.tree)]); _dirty(); return
	_dirty()
	queue.append({"t": "topics"})

func _goodbye(said := "") -> void:
	var a := [said] if said != "" else _ash_bit("bye")
	if not a.is_empty(): _push_lines([{"who": "ash", "text": a[0]}])
	var fb: Dictionary = C.get("farewell", {})
	var pool: Array = fb.get(who, fb.get("_any", []))
	if not pool.is_empty(): _push_lines([String(pool[rng.randi() % pool.size()])])
	queue.append({"t": "end"})

func _wrap_up() -> void:
	var fb: Dictionary = C.get("wrap_up", {})
	var pool: Array = fb.get(who, fb.get("_any", ["Well, I'd best get on. Come and find me later, Ash."]))
	_push_lines([String(pool[rng.randi() % pool.size()])])
	var a := _ash_bit("bye")
	if not a.is_empty(): _push_lines([{"who": "ash", "text": a[0]}])
	queue.append({"t": "end"})

# ---------- stepping ----------
# the next thing to show (resolving gotos, effects and menus on the way)
func step() -> Dictionary:
	var guard := 0
	while guard < 500:
		guard += 1
		if queue.is_empty():
			cur = {"t": "end"}; _finish(); return cur
		var it: Dictionary = queue.pop_front()
		match String(it.t):
			"line":
				if String(it.text).strip_edges() == "": continue
				cur = it; log.append(it); return cur
			"choices":
				if it.list.is_empty(): continue
				cur = it; log.append(it); return cur
			"goto": _enter(String(it.node))
			"do": apply(it.do)
			"end_tree":
				if _end_talk or not it.more: queue.append({"t": "end"})
				else: queue.append({"t": "topics"})
				tree = {}
			"topics":
				if _end_talk or opts.get("cutscene", false) or kind == "pet":
					queue.append({"t": "end"}); continue
				var m := _menu()
				if m.is_empty():
					if rounds >= MAX_ROUNDS: _wrap_up()
					else: _goodbye()
				else: queue.push_front(m)
			"end":
				cur = {"t": "end"}; _finish(); return cur
	cur = {"t": "end"}; _finish(); return cur

func next() -> Dictionary:
	return step()

func choose(i: int) -> Dictionary:
	if cur.get("t", "") != "choices": return step()
	var list: Array = cur.list
	if i < 0 or i >= list.size(): i = 0
	var ch: Dictionary = list[i]
	if cur.get("src", "") == "topics":
		_answer(ch)
	else:
		var a := String(ch.get("ash", ch.get("label", "")))
		if a != "": _push_lines([{"who": "ash", "text": a}])
		if ch.has("do"): queue.append({"t": "do", "do": ch.do})
		if ch.has("next"): queue.append({"t": "goto", "node": String(ch.next)})
		else: _tree_end()
	return step()

# the other has somewhere to be: a polite goodbye from them, a short one from Ash
func interrupt() -> void:
	if not active: return
	queue = []
	tree = {}
	var ip: Dictionary = C.get("interrupts", {})
	var pool: Array = ip.get(who, ip.get("_any", ["Oh! Is that the time? I have to run, Ash. Talk later!"]))
	_push_lines([String(pool[rng.randi() % pool.size()])])
	var a := _ash_bit("interrupted")
	if not a.is_empty(): _push_lines([{"who": "ash", "text": a[0]}])
	queue.append({"t": "end"})

func _finish() -> void:
	if not active: return
	active = false
	_dirty()
	ended.emit(who)

# ==========================================================================
# the scene: placing the two, the camera, the faces, the panel
# ==========================================================================
var game: Node3D
var cast: Node
var ui: ConversationUI
var partner := {}            # the life.gd person / companions pet / cast npc dict
var on_done: Callable
var cam_on := false          # main.gd lets camera() frame the shot
var _cam_pos := Vector3.ZERO
var _cam_look := Vector3.ZERO
var _side := 1.0
var _t := 0.0
var _line_t := 0.0
var _shot_who := ""
var _cine := 0.0
var _place_t := 0.0
var _place_to := Vector3.INF
var _amp: AudioEffectAmplify
var _amp_db := 0.0
var _nod := {}               # actor -> nod impulse time
var _gest_cd := 0.0
var _int_t := 0.0
var _blk0 := -1

func attach(g: Node3D, c: Node, layer: CanvasLayer) -> void:
	game = g; cast = c
	ui = ConversationUI.new()
	ui.visible = true
	layer.add_child(ui)
	ui.picked.connect(func(i): _present(choose(i)))
	ui.advance.connect(func(): press())
	var bi := AudioServer.get_bus_index("Ambience")
	if bi >= 0:
		_amp = AudioEffectAmplify.new()
		AudioServer.add_bus_effect(bi, _amp)

func _ctx_now() -> Dictionary:
	return {}

# --- entry points from cast.gd ---
func begin_person(p: Dictionary, life: TownLife) -> void:
	var c := life.begin_talk_quiet(p)
	for pc in life.companions.pets:
		if pc.owner == p and pc.inside == "" and not pc.sleep and Vector2(pc.pos.x - p.pos.x, pc.pos.z - p.pos.z).length() < 5.0:
			c.pet_near = String(pc.id)
			pc.face = atan2(game.pos.x - pc.pos.x, game.pos.z - pc.pos.z)
	partner = {"kind": "person", "d": p}
	life.greet(p)   # (someone on duty salutes, unless they just did)
	_blk0 = int(p.blk)
	open(String(p.id), "person", c, _forced())
	_start_scene()

func begin_pet(pc: Dictionary, comp: Companions) -> void:
	var lines := comp.begin_talk(pc)
	partner = {"kind": "pet", "d": pc}
	var c := {"activity": "asleep" if pc.sleep else ""}
	open(String(pc.id), "pet", c, {"lines": lines})
	_start_scene()

func begin_npc(n: Dictionary, o: Dictionary = {}) -> void:
	partner = {"kind": "npc", "d": n}
	var id := npc_id(n)
	var oo := o.duplicate()
	oo.merge(_forced())
	if not oo.has("lines"): oo.lines = n.get("lines", [])
	open(id, "npc", {}, oo)
	_start_scene()

# (render checks) the next talk runs this tree
var force_tree := ""
func _forced() -> Dictionary:
	if force_tree == "" or not trees.has(force_tree): return {}
	var o := {"tree": force_tree}
	force_tree = ""
	return o

static func npc_id(n: Dictionary) -> String:
	var nm := String(n.get("name", "someone"))
	if nm == "Prof. Oak": return "oak"
	if nm.contains("Clerk"): return "mart_clerk"
	if nm.begins_with("Tea keeper"): return "tea_keeper"
	return nm.to_lower().replace(".", "").replace(" ", "_")

func _start_scene() -> void:
	_t = 0.0; _line_t = 0.0; _int_t = 0.0
	cam_on = true
	# no idle acting while they talk: only the emotes the lines call for
	for a in [_ash_actor(), _actor_of(partner)]:
		if a and a.idles: a.idles.hold = true
	# someone small (a kid, a Pokémon): Ash leans down to their level, hands on his thighs
	_lean = _ash_head().y - _other_head().y > LEAN_FROM
	var cam: Camera3D = game.cam
	_cam_pos = cam.global_position
	_cam_look = _ash_head().lerp(_other_head(), 0.5)
	# keep the camera on the side of the line between them it is already on
	var A := _ash_head(); var B := _other_head()
	var d := _flat(B - A)
	var perp := Vector3(d.z, 0, -d.x)
	_side = 1.0 if (_cam_pos - (A + B) * 0.5).dot(perp) >= 0.0 else -1.0
	if _blocked_side(_side) > _blocked_side(-_side) + 0.5: _side = -_side
	_place_to = _place_target()
	_place_t = 0.0
	game.speed = 0.0
	_present(step())

func busy() -> bool: return active or cam_on

# A (or a tap): finish the line, or the next one
func press() -> void:
	if not active: return
	if ui.choosing(): ui.confirm(); return
	if ui.typing(): ui.finish(); return
	_present(next())

func back() -> void:
	if ui.choosing():
		# B picks the goodbye when there is one
		var l: Array = cur.get("list", [])
		for i in l.size():
			if String(l[i].get("kind", "")) == "bye": ui.sel = i; ui.confirm(); return
		return
	press()

var _log_lines := OS.get_cmdline_user_args().has("--cast-test=convo") or OS.get_cmdline_user_args().has("--convo-log")
func _present(it: Dictionary) -> void:
	if _log_lines:
		print("convo: ", it.get("who", ""), ": ", it.get("text", "")) if it.get("t", "") == "line" else print("convo: [", it.get("t", ""), "] ", str(it.get("list", []).map(func(c): return c.get("label", ""))))
	match String(it.get("t", "")):
		"line":
			var w := String(it.who)
			var v := speaker_voice(w)
			var tx := String(it.text)
			var tag := ""
			# "[emote] text": the line names its emote
			if tx.begins_with("[") and tx.find("]") > 1:
				tag = tx.substr(1, tx.find("]") - 1)
				tx = tx.substr(tx.find("]") + 1).strip_edges()
			ui.voice = String(v[0]); ui.voice_pitch = float(v[1])
			ui.show_line(speaker_name(w), tx, speaker_colour(w))
			_shot_who = w
			_line_t = 0.0
			_emote(w, tx, tag)
			_listener_nod(w)
		"choices":
			_shot_who = "ash_choice"
			ui.show_choices(it.list)
			Sfx.ui("ui_prompt")
		_:
			_end_scene()
	for n in notes: ui.note(n)
	notes = []
	if _mood != "" and partner.get("kind", "") == "pet":
		var cr = partner.d.get("creature")
		if cr: cr.mood(_mood)
		_mood = ""

func _end_scene() -> void:
	ui.hide_panel()
	var p: Dictionary = partner
	partner = {}
	if p.get("kind", "") == "person" and cast and cast.life: cast.life.end_talk(p.d)
	elif p.get("kind", "") == "pet" and cast and cast.life: cast.life.companions.end_talk(p.d)
	elif p.get("kind", "") == "npc": p.d.wait = 2.0
	for a in [_ash_actor(), _actor_of(p)]:
		if a: a.mouth = 0.0; a.nod = 0.0; a.look_pitch = 0.0
		if a and a.idles: a.idles.hold = false
	var ash := _ash_actor()
	if _lean and ash and ash.idles and ash.idles.acting() == "lean_down": ash.idles.release()
	_lean = false
	# back to the gameplay camera from where this one is: its yaw and pitch, eased in
	var cam: Camera3D = game.cam
	var off: Vector3 = cam.global_position - (game.pos + Vector3(0, 1.45, 0))
	game.cam_yaw = atan2(off.x, off.z)
	game.cam_pitch = clampf(asin(clampf(off.y / maxf(off.length(), 0.01), -1.0, 1.0)), 0.05, 0.6)
	game.cam_idle = 0.0
	game.set("cam_ease", 1.0)
	if game.get("indoors"): game.set("cam_boom", maxf(1.2, off.length()))
	cam_on = false
	var f := on_done
	on_done = Callable()
	if f.is_valid(): f.call()

# --- the frame (cast.gd, before Ash is animated) ---
func update(dt: float) -> void:
	_t += dt; _line_t += dt
	_cine += ((1.0 if active else 0.0) - _cine) * (1.0 - exp(-dt * 4.0))
	if ui: ui.cine = _cine
	if cast and cast.life and cast.life.bubbles:
		cast.life.bubbles.modulate.a = lerpf(1.0, 0.35, _cine)
	if _amp:
		var want := -9.0 * _cine
		if absf(want - _amp_db) > 0.2: _amp_db = want; _amp.volume_db = want
	if not active: return
	_place(dt)
	_lean_down()
	_faces(dt)
	_check_interrupt(dt)

func _place(dt: float) -> void:
	_place_t += dt
	var me: Vector3 = game.pos
	var B := _other_pos()
	if _place_to != Vector3.INF and not cast.bike.places_player():
		var to := _place_to
		var d := Vector2(to.x - me.x, to.z - me.z)
		if d.length() > 0.05 and _place_t < 2.0:
			var v := minf(d.length(), dt * 1.6)
			game.pos = game.world.step(game.pos, d.x / d.length() * v, d.y / d.length() * v)
			game.speed = 1.6 if d.length() > 0.12 else 0.0
		else:
			_place_to = Vector3.INF; game.speed = 0.0
	else:
		game.speed = 0.0
	var face := atan2(B.x - game.pos.x, B.z - game.pos.z)
	if not cast.bike.places_player():
		game.yaw += wrapf(face - game.yaw, -PI, PI) * (1.0 - exp(-dt * 8.0))
	# npcs and pets face Ash (life.gd's "talk" state turns its people)
	var pk := String(partner.get("kind", ""))
	if pk == "npc" or pk == "pet":
		var n: Dictionary = partner.d
		n.face = atan2(game.pos.x - n.pos.x, game.pos.z - n.pos.z)
		if pk == "npc": n.speed = 0.0; n.target = null; n.wait = 3.0

# where Ash should stand: a comfortable distance (people 1.45 m, kids a
# little closer, Nibbles closer still), stepping in or back along the line
func _place_target() -> Vector3:
	var me: Vector3 = game.pos
	var B := _other_pos()
	var d := Vector2(me.x - B.x, me.z - B.z)
	var dist := d.length()
	var lo := 1.25; var hi := 1.85; var want := 1.5
	if partner.get("kind", "") == "pet":
		var sp: Dictionary = partner.d.sp
		lo = float(sp.r) + 0.8; want = lo + 0.25; hi = lo + 0.7
	elif partner.get("kind", "") == "person" and String(partner.d.get("age", "")) == "kid":
		lo = 1.1; want = 1.3; hi = 1.7
	if dist >= lo and dist <= hi: return Vector3.INF
	if dist < 1e-3: d = Vector2(sin(game.yaw + PI), cos(game.yaw + PI)); dist = 1.0
	var p := Vector2(B.x, B.z) + d / dist * want
	return Vector3(p.x, game.world.height_at(p.x, p.y), p.y)

# heads turn to each other, the speaker's jaw moves while their line types out
func _faces(dt: float) -> void:
	var ash := _ash_actor()
	var oth := _actor_of(partner)
	var A := _ash_head(); var B := _other_head()
	var typing := ui != null and ui.typing()
	for pair in [[ash, A, B, "ash", game.yaw], [oth, B, A, who, _other_yaw()]]:
		var a: CastActor = pair[0]
		if a == null: continue
		var from: Vector3 = pair[1]; var to: Vector3 = pair[2]
		var rel := wrapf(atan2(to.x - from.x, to.z - from.z) - float(pair[4]), -PI, PI)
		a.look_yaw = clampf(rel, -1.0, 1.0)
		a.look_pitch = clampf(atan2(to.y - from.y, Vector2(to.x - from.x, to.z - from.z).length()), -0.5, 0.5)
		var talking: bool = typing and _shot_who == pair[3]
		a.mouth = (0.35 + 0.65 * absf(sin(_t * 17.0 + sin(_t * 5.3) * 2.0))) if talking else 0.0
		var nt: float = _nod.get(a, -1.0)
		if nt >= 0.0:
			nt += dt
			_nod[a] = nt if nt < 0.9 else -1.0
			a.nod = sin(clampf(nt / 0.9, 0.0, 1.0) * TAU) * 0.09 * (1.0 - nt / 0.9) if nt < 0.9 else 0.0
	if cast and cast.player: cast.player.visible = true

# Ash leans down once he has stepped into place (and again if a step let go of it)
const LEAN_FROM := 0.22      # m: the other's head this much lower than his
var _lean := false
func _lean_down() -> void:
	var a := _ash_actor()
	if not _lean or a == null or a.idles == null or _place_to != Vector3.INF or absf(game.speed) > 0.05: return
	if cast.bike and cast.bike.places_player(): return
	if a.idles.acting() != "lean_down": a.idles.force("lean_down", 9999.0)

# an emote for what is said: the line's own tag, else read from the words (first
# rule that matches); none twice running for the same person, and not on every line
const EMOTES := ["wave", "think", "point", "laugh", "fist", "hips", "gasp", "worry", "explain", "shrug", "scratch", "salute", "cap", "nod"]
const EMOTE_RULES := [
	["laugh", ["haha", "hehe", "ha!", "ha,", "ha ha", "heh"]],
	["gasp", ["?!", "!?", "whoa", "no way", "wow!", "what?!", "really?!", "eek"]],
	["wave", ["hello", "hi!", "hi,", "hey there", "good morning", "good evening", "see you", "bye", "later!", "take care", "goodnight", "good night"]],
	["hips", ["young man", "ash ketchum!", "mister", "you'd better", "don't you", "halt", "stop right", "no running", "behave", "rules are rules"]],
	["worry", ["oh dear", "careful", "worried", "worry", "be safe", "scared", "afraid", "i hope", "poor thing", "dangerous"]],
	["point", ["over there", "that way", "this way", "up the road", "down the road", "across the", "beyond", "north", "south", "the lighthouse", "the pier", "the lab", "cinnabar", "route 1", "viridian", "up on the hill"]],
	["fist", ["gonna", "i'll be", "i'm going to", "pokémon master", "you bet", "let's go", "can do it", "watch me", "the best", "i'll show"]],
	["think", ["hmm", "let me think", "i wonder", "maybe", "perhaps", "...", "i suppose", "come to think"]],
	["scratch", ["sorry", "oops", "um,", "uh,", "er,", "well, i", "i guess"]],
]
var _last_emote := {}
static var _emote_re: Array = []
static func _emote_rules() -> Array:
	if _emote_re.is_empty():
		for r in EMOTE_RULES:
			var alts := []
			for k in r[1]:
				var k2 := String(k)
				var esc := ""
				for ch in k2: esc += ("\\" + ch) if "\\^$.|?*+()[]{}".contains(ch) else ch
				# a word's start (not inside another word)
				alts.append(("(?<![a-zé])" if k2.unicode_at(0) >= 97 and k2.unicode_at(0) <= 122 else "") + esc)
			var re := RegEx.new()
			re.compile("|".join(alts))
			_emote_re.append([r[0], re])
	return _emote_re

func _emote(w: String, text: String, tag := "") -> void:
	var a: CastActor = _ash_actor() if w == "ash" else (_actor_of(partner) if w == who else null)
	if a == null or a.idles == null: return
	if a == _ash_actor() and _lean: return   # (leaning down, his hands stay on his thighs; he nods)
	var e := tag if EMOTES.has(tag) else ""
	if e == "":
		var low := text.to_lower()
		for r in _emote_rules():
			if r[1].search(low): e = r[0]; break
		if e == "":
			_gest_cd -= 1.0
			if text.length() > 55 and _gest_cd <= 0.0 and rng.randf() < 0.5: e = "explain"; _gest_cd = 2.0
			elif text.ends_with("?") and rng.randf() < 0.3: e = "shrug"
		if e == _last_emote.get(a, "") and rng.randf() < 0.75: e = ""
		elif e != "" and rng.randf() < 0.15: e = ""
	if e == "": return
	_last_emote[a] = e
	if e == "nod": _nod[a] = 0.0; return
	if a.idles.busy and a.idles.acting() == "salute": return
	a.idles.force(e)

func _listener_nod(speaker: String) -> void:
	var l: CastActor = _actor_of(partner) if speaker == "ash" else _ash_actor()
	if l and rng.randf() < 0.4: _nod[l] = 0.0

# their day needs them (the schedule's next block): they politely end it
func _check_interrupt(dt: float) -> void:
	_int_t += dt
	if _int_t < 5.0 or not ui or ui.typing() or tree.size() > 0: return
	var pk := String(partner.get("kind", ""))
	var need := false
	if pk == "person":
		var p: Dictionary = partner.d
		var life: TownLife = cast.life
		need = int(life._block_at(p, float(life.clock.minute_of_day()))) != _blk0 and _blk0 >= 0
	elif pk == "pet":
		var o: Dictionary = partner.d.owner
		need = o.state != "inside" and Vector2(o.pos.x - partner.d.pos.x, o.pos.z - partner.d.pos.z).length() > 9.0
	if need:
		_int_t = -999.0
		interrupt()
		_present(step())

# ---------- the camera (main.gd calls it while cam_on) ----------
func camera(dt: float) -> void:
	var cam: Camera3D = game.cam
	if partner.is_empty():
		cam_on = false; return
	var A := _ash_head(); var B := _other_head()
	var d := _flat(B - A)
	var perp := Vector3(d.z, 0, -d.x) * _side
	var mid := (A + B) * 0.5
	var sep := Vector2(B.x - A.x, B.z - A.z).length()
	# the two-shot: from the side, a little back toward Ash, both in frame
	var two_pos := mid + perp * (sep * 0.85 + 1.9) - d * 0.55 + Vector3(0, 0.3, 0)
	# aimed below the heads, so the faces sit in the upper part of the frame (above the panel)
	var two_look := mid + Vector3(0, -0.45, 0)
	var pos := two_pos
	var look := two_look
	var focus := ""
	if _shot_who == "ash" or _shot_who == "ash_choice": focus = "ash"
	elif _shot_who != "" and _shot_who != "__": focus = "other"
	if _t < 0.9: focus = ""          # the opening two-shot holds a moment
	if focus != "":
		var S := A if focus == "ash" else B           # the speaker
		var Lh := B if focus == "ash" else A          # over the listener's shoulder
		var away := _flat(Lh - S)
		var ots := Lh + away * 0.85 + perp * 0.75 + Vector3(0, 0.12, 0)
		var k := 0.42 if _shot_who == "ash_choice" else 0.62
		pos = two_pos.lerp(ots, k)
		look = two_look.lerp(S + Vector3(0, -0.4, 0), 0.7)
		# a slow push-in while they speak
		pos = pos.lerp(look, minf(_line_t * 0.025, 0.1))
	pos = _clear_pos(look, pos)
	# the rule of thirds: Ash's body on the third line on his side of the frame (the
	# camera keeps to one side of the pair, so he stays on that side); the choices take
	# the other two thirds. Turned about the vertical only.
	var fwd := _flat(look - pos)
	var right := fwd.cross(Vector3.UP)
	var toA := _flat(A - pos)
	var ash_left := toA.dot(right) < _flat(B - pos).dot(right)
	var vp := cam.get_viewport().get_visible_rect().size
	var tan_h := tan(deg_to_rad(cam.fov) * 0.5) * vp.x / maxf(vp.y, 1.0)
	var want := atan((-1.0 if ash_left else 1.0) / 3.0 * tan_h)
	var now := atan2(toA.dot(right), toA.dot(fwd))
	look = pos + (look - pos).rotated(Vector3.UP, want - now)
	var kp := 1.0 - exp(-dt * 2.0)
	var kl := 1.0 - exp(-dt * 2.6)
	_cam_pos = _cam_pos.lerp(pos, kp)
	_cam_look = _cam_look.lerp(look, kl)
	cam.global_position = _cam_pos
	if _cam_pos.distance_to(_cam_look) > 0.05: cam.look_at(_cam_look)
	# Ash's choices: the two thirds he isn't on
	if ui and ui.dp:
		var left := not ash_left
		if left != ui.dp.choices_left:
			ui.dp.choices_left = left
			ui.dp.queue_redraw()
	if game.get("indoors"):
		cam.fov += (50.0 - cam.fov) * (1.0 - exp(-dt * 2.0))

static func _flat(v: Vector3) -> Vector3:
	var f := Vector3(v.x, 0, v.z)
	return f.normalized() if f.length() > 1e-4 else Vector3(0, 0, 1)

# no camera inside a wall, a tree or the ground: pulled in along the line to it
func _clear_pos(look: Vector3, pos: Vector3) -> Vector3:
	var dir := pos - look
	var len := dir.length()
	if len < 0.01: return pos
	dir /= len
	var free := _free(look, dir, len)
	return look + dir * maxf(free, 0.6)

func _free(look: Vector3, dir: Vector3, len: float) -> float:
	if game.get("indoors") and game.interior:
		return game.interior.data.boom(look, dir, len)
	var W = game.world
	var n := 10
	for i in range(1, n + 1):
		var t := len * i / n
		var p := look + dir * t
		if p.y < W.height_at(p.x, p.z) + 0.35: return maxf(0.0, t - len / n)
		var q: Vector3 = W.collide(Vector3(p.x, p.y, p.z), 0.2)
		if Vector2(q.x - p.x, q.z - p.z).length() > 0.01 and p.y - W.height_at(p.x, p.z) < 4.0: return maxf(0.0, t - len / n)
	return len

# how much of a side's shots is blocked (at the start: pick the clearer side)
func _blocked_side(s: float) -> float:
	var A := _ash_head(); var B := _other_head()
	var d := _flat(B - A)
	var perp := Vector3(d.z, 0, -d.x) * s
	var mid := (A + B) * 0.5
	var bad := 0.0
	for p in [mid + perp * 3.0 - d * 0.55, A - d * 0.85 + perp * 0.75, B + d * 0.85 + perp * 0.75]:
		var look := mid
		var dir: Vector3 = p - look
		var l := dir.length()
		bad += l - _free(look, dir / l, l)
		bad += 2.5 * _bodies_between(p, look)
	return bad

# other people and Pokémon standing between a camera spot and what it looks at
func _bodies_between(a: Vector3, b: Vector3) -> int:
	if cast == null or cast.life == null or game.get("indoors"): return 0
	var n := 0
	var others: Array = cast.life.people + cast.life.companions.pets
	for o in others:
		if o == partner.get("d") or o.get("state", "") == "inside" or String(o.get("inside", "")) != "": continue
		var p := Vector2(o.pos.x, o.pos.z)
		var s := Vector2(a.x, a.z); var e := Vector2(b.x, b.z)
		var se := e - s
		var u := clampf((p - s).dot(se) / maxf(se.length_squared(), 1e-4), 0.0, 1.0)
		if u > 0.02 and u < 0.98 and (s + se * u).distance_to(p) < 0.6: n += 1
	return n

# ---------- where they are ----------
func _ash_actor() -> CastActor:
	return cast.player if cast else null

func _actor_of(p: Dictionary) -> CastActor:
	if p.is_empty(): return null
	var a = p.d.get("actor")
	return a if a is CastActor else null

func _other_pos() -> Vector3:
	if partner.is_empty(): return game.pos
	return partner.d.pos

func _other_yaw() -> float:
	if partner.is_empty(): return 0.0
	return float(partner.d.get("yaw", 0.0))

static func _head(a: CastActor, fallback: Vector3) -> Vector3:
	if a == null or a.skel == null: return fallback
	var bi: int = a.bones.get("Head", -1)
	if bi < 0: return fallback
	return a.skel.global_transform * a.skel.get_bone_global_pose(bi).origin + Vector3(0, 0.08, 0)

func _ash_head() -> Vector3:
	return _head(_ash_actor(), game.pos + Vector3(0, 1.35, 0))

func _other_head() -> Vector3:
	if partner.is_empty(): return game.pos + Vector3(0, 1.4, 0)
	var p: Dictionary = partner.d
	if partner.kind == "pet":
		return p.pos + Vector3(0, float(p.sp.talk_h) * 0.85, 0)
	var h := 1.25 if String(p.get("age", "")) == "kid" else 1.6
	return _head(_actor_of(partner), p.pos + Vector3(0, h, 0))
