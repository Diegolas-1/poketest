extends Node
# Dev test for quests.gd and the life/*.json writing. Headless:
#   godot --headless --path native res://dev/quests_test.tscn
# exits 0 when green. Checks: data integrity, every townsperson has lines for
# every period, every line fits the dialog box (3 rows), no immediate repeats,
# chatter for every pair, barks, every quest played to completion through the
# public API on a fake clock (with save / load half way), rumours.
# Screenshots (xvfb, see dev/shot.gd):
#   godot --path native --rendering-driver opengl3 --resolution 1688x780 res://dev/quests_test.tscn -- --shot=/abs/dir

const IDS := ["delia", "lily", "rose", "bram", "ada", "timmy", "mae", "kai", "marina", "ben", "tom", "gus", "jenny"]
const PERIODS := ["dawn", "morning", "midday", "afternoon", "evening", "night"]
const HOUR := {"dawn": 6.0, "morning": 9.0, "midday": 12.5, "afternoon": 15.0, "evening": 19.0, "night": 22.5}
const ACTS := ["", "home", "breakfast", "commute", "work:farm", "work:bake", "shop", "chat", "walk", "yardwork", "fish",
	"garden", "bake", "deliver", "mend", "lighthouse", "porch", "play", "supper", "inside", "feed", "something_new"]
const PLACES := ["", "red", "lily", "hollis", "mae", "marina", "farmer", "oldman", "lighthouse", "pier", "beach",
	"boathouse", "plaza", "lab_gate", "route1_gate", "fields", "pond", "hill", "nowhere"]

class FakeClock:
	extends RefCounted
	signal hour_changed(h)
	var h := 8.0
	var d := 1
	func hour() -> float: return h
	func day() -> int: return d
	func minute_of_day() -> int: return int(h * 60.0)
	func period() -> String: return Quests.period_of(h)
	func time_text() -> String: return "%d:%02d" % [int(h), int(fmod(h, 1.0) * 60.0)]
	func set_period(p: String) -> void:
		h = HOUR[p]; hour_changed.emit(h)

var checks := 0
var fails := 0
var clock := FakeClock.new()
var events: Array = []
var changed := 0

func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		fails += 1
		printerr("FAIL: " + msg)

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			await _shots(a.substr(7))
			get_tree().quit(0)
			return
		if a == "--demo":
			_demo()
			get_tree().quit(0)
			return
	_run()
	print("quests_test: %d checks, %d failures" % [checks, fails])
	print("QUESTS TEST " + ("GREEN" if fails == 0 else "RED"))
	get_tree().quit(1 if fails > 0 else 0)

func _new_quests(path := "user://quests_test.save") -> Quests:
	var q := Quests.new()
	q.make_ui = false
	q.save_path = path
	add_child(q)
	q.setup(null, clock)
	return q

func _run() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://quests_test.save"))
	var q := _new_quests()
	q.reset()
	q.rng.seed = 7
	_data(q)
	_lengths(q)
	_ambient(q)
	_chatter(q)
	_barks(q)
	_quests(q)

# ---------- data ----------
func _data(q: Quests) -> void:
	for id in IDS:
		var P := q.person(id)
		ok(not P.is_empty(), "dialogue for " + id)
		if P.is_empty(): continue
		for p in PERIODS:
			ok(P.get("greet", {}).get(p, []).size() >= 1, "%s greet %s" % [id, p])
			ok(P.get("period", {}).get(p, []).size() >= 1, "%s period %s" % [id, p])
		ok(P.get("ash", []).size() >= 5, id + " has 5+ lines about Ash")
		ok(P.get("activity", {}).size() >= 3, id + " has 3+ activities")
		ok(P.get("bark", {}).get("any", []).size() >= 2, id + " barks")
		var ch: Dictionary = P.get("chat", {})
		for k in ["any", "ash"]:
			ok(ch.get("open", {}).get(k, []).size() >= 1, "%s chat open %s" % [id, k])
			ok(ch.get("reply", {}).get(k, []).size() >= 1, "%s chat reply %s" % [id, k])
		for f in P.get("after", {}):
			ok(_reward_flags(q).has(f), "%s after-flag %s is set by a quest" % [id, f])
	var item_ids: Dictionary = q.QD.get("items", {})
	for qq in q.quests():
		ok(IDS.has(qq.giver), qq.id + " giver exists")
		ok(qq.giver != "delia", qq.id + ": Delia's quests come later")
		for a in qq.get("unlock", {}).get("after", []): ok(not q.quest(a).is_empty(), qq.id + " after " + a)
		for s in qq.steps:
			var who: Variant = s.get("who", "giver")
			for w in (who if who is Array else [who]):
				ok(w == "giver" or IDS.has(w), qq.id + " step who " + str(w))
				if s.get("say") is Dictionary: ok(s.say.has(w if w != "giver" else qq.giver), "%s say for %s" % [qq.id, w])
			for c in s.get("clues", {}): ok(IDS.has(c), qq.id + " clue " + c)
			for k in ["give", "take", "needs"]:
				if s.has(k): ok(item_ids.has(s[k]), "%s item %s" % [qq.id, s[k]])
			ok(String(s.get("hint", "")) != "", qq.id + " step hint")
		if qq.get("reward", {}).has("rumor"): ok(q.rumor_by_id.has(qq.reward.rumor), qq.id + " reward rumor")
	ok(q.quests().size() >= 5, "5+ quests")
	ok(q.quest("q_delia").get("disabled", false), "Delia hook quest present and disabled")
	for r in q.rumor_list:
		var any_teller := false
		for t in r.get("tellers", {}):
			ok(IDS.has(t), r.id + " teller " + t)
			any_teller = true
		ok(any_teller, r.id + " has tellers")
		var req := String(r.get("requires", ""))
		if req.begins_with("rumor:"): ok(q.rumor_by_id.has(req.substr(6)), r.id + " requires " + req)
		elif req != "": ok(_reward_flags(q).has(req), r.id + " requires flag " + req)
	ok(q.rumor_list.size() >= 12, "12+ rumors")
	for k in q.D.get("pairs", {}):
		if k.begins_with("_"): continue
		var ab: PackedStringArray = k.split("|")
		ok(ab.size() == 2 and IDS.has(ab[0]) and IDS.has(ab[1]), "pair " + k)

func _reward_flags(q: Quests) -> Array:
	var out := []
	for qq in q.quests():
		if qq.get("reward", {}).has("flag"): out.append(qq.reward.flag)
		for s in qq.steps:
			if s.has("set"): out.append(s.set)
	return out

# ---------- every line fits the dialog box: 3 rows, same wrap as DialogBox ----------
var _font: FontVariation
func _rows(text: String) -> int:
	if _font == null:
		_font = FontVariation.new(); _font.base_font = load("res://fonts/PixelifySans.woff2"); _font.variation_opentype = {"wght": 600}
	var u := 4.5
	var fsz := int(round(9.0 * u))
	var w := 160.0 * u - 22.0 * u
	var rows := 0
	var row := ""
	for word in text.split(" "):
		var tt := word if row == "" else row + " " + word
		if _font.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x > w and row != "":
			rows += 1; row = word
		else: row = tt
	if row != "": rows += 1
	return rows

var _long := 0
var _split := 0
func _fit(speaker: String, q: Quests, entry: Variant, first_prefix := true) -> void:
	var lines := Quests._as_lines(entry)
	for i in lines.size():
		var s: String = lines[i]
		if i == 0 and first_prefix and not s.begins_with("("): s = q.tag(speaker) + ": " + s
		if _rows(s) > 3: _split += 1
		# talk() splits long lines; every piece must fit the box
		for piece in q.fit_lines([s]):
			var r := _rows(piece)
			if r > 3:
				_long += 1
				if _long < 40: printerr("  too long (%d rows): %s" % [r, piece])
			ok(r <= 3, "line fits the dialog box")
			# and the restyled box (ui/ui_dialog_panel.gd) at its narrowest, 1280 wide, at full size
			var sp: Array = UIDialogPanel.split_speaker(piece)
			var fsz := UIDialogPanel.fit_size(sp[1], 921.0)
			ok(fsz >= 26 and UITheme.wrap(sp[1], "body", fsz, 921.0 - 64.0).size() <= 3, "line fits the restyled dialog panel")
			ok(piece.length() >= 2, "split piece not empty: " + s)

func _fit_all(speaker: String, q: Quests, v: Variant) -> void:
	if v is Dictionary:
		for k in v: _fit_all(speaker, q, v[k])
	elif v is Array:
		for e in v: _fit(speaker, q, e)
	elif v is String: _fit(speaker, q, v)

func _lengths(q: Quests) -> void:
	for id in IDS:
		var P := q.person(id)
		for k in ["greet", "period", "activity", "place", "ash", "town", "about", "after", "sleep"]:
			_fit_all(id, q, P.get(k))
		for k in ["open", "reply"]:
			for t in P.get("chat", {}).get(k, {}):
				for e in P.chat[k][t]: ok(String(e).length() <= 90, "chat line short: " + String(e))
	for qq in q.quests():
		_fit(qq.giver, q, qq.get("offer", []))
		for e in qq.get("remind", []): _fit(qq.giver, q, e)
		for s in qq.steps:
			var who: Variant = s.get("who", "giver")
			var w0: String = qq.giver if (who is String and who == "giver") else (who if who is String else who[0])
			var say: Variant = s.get("say", [])
			if say is Dictionary:
				for k in say: _fit(k, q, say[k])
			else: _fit(w0, q, say)
			for k in ["not_now", "missing", "progress"]:
				for e in s.get(k, []): _fit(w0, q, e, k != "progress")
			for c in s.get("clues", {}): _fit(c, q, s.clues[c])
		_fit(qq.giver, q, qq.get("reward", {}).get("say", []), false)
	for r in q.rumor_list:
		for t in r.tellers:
			for e in r.tellers[t]: _fit(t, q, e)
	for ex in q.D.get("pairs", {}).values():
		if not (ex is Array): continue
		for x in ex:
			var lines: Array = x.lines if x is Dictionary else x
			for l in lines: ok(String(l[1]).length() <= 90, "pair line short: " + String(l[1]))
	print("  lines split to fit the box: %d" % _split)

# ---------- ambient talk ----------
func _ambient(q: Quests) -> void:
	q.autosave = false
	var repeats := 0
	for id in IDS:
		for p in PERIODS:
			for act in ACTS:
				var place: String = PLACES[(PERIODS.find(p) * 7 + ACTS.find(act)) % PLACES.size()]
				var lines := q.talk(id, {"hour": HOUR[p], "period": p, "activity": act, "place": place, "day": 0})
				ok(lines.size() >= 1, "%s says something at %s/%s" % [id, p, act])
				for l in lines: ok(l is String and l != "", "line is text")
				if act != "sleep": ok(String(lines[0]).begins_with(q.tag(id) + ": ") or String(lines[0]).begins_with("("), id + " line tagged")
		# first meeting of the day greets; repeats don't repeat
		q.st.met.erase(id)
		var first := q.talk(id, {"hour": 9.0, "period": "morning", "day": 0, "activity": "walk"})
		ok(first.size() >= 2, id + " first talk of the day greets")
		var prev := []
		for i in 30:
			var l := q.talk(id, {"hour": 9.0, "period": "morning", "day": 0, "activity": "walk"})
			if l == prev: repeats += 1
			prev = l
	ok(repeats == 0, "no immediate repeats (%d)" % repeats)
	var u := q.talk("someone_new", {})
	ok(u.size() >= 1, "unknown person still answers")
	ok(q.overheard("someone_new") == "", "unknown person: no bark")
	ok(q.wants("someone_new") == "", "unknown person: no quest")
	q.reset()
	q.autosave = true

func _chatter(q: Quests) -> void:
	var n := 0
	for a in IDS:
		for b in IDS:
			if a == b: continue
			for p in PERIODS:
				var lines := q.chatter(a, b, {"hour": HOUR[p], "period": p, "activity": "chat", "day": 1})
				n += 1
				ok(lines.size() >= 2 and lines.size() <= 4, "chatter %s/%s %s: %d lines" % [a, b, p, lines.size()])
				for l in lines:
					var s := String(l)
					ok(s.begins_with(q.label(a) + ": ") or s.begins_with(q.label(b) + ": "), "chatter speaker: " + s)
					ok(not s.contains("{"), "chatter filled: " + s)
	var odd := q.chatter("oak", "nobody", {})
	ok(odd.size() >= 2, "chatter with unknown ids")
	print("  chatter: %d exchanges ok" % n)

func _barks(q: Quests) -> void:
	for id in IDS:
		for p in PERIODS:
			for act in ["", "walk", "fish", "yardwork", "sleep"]:
				ok(q.overheard(id, {"period": p, "activity": act, "hour": HOUR[p]}) != "", "%s bark %s %s" % [id, p, act])

# ---------- quests ----------
func _on_event(kind: String, qid: String, text: String) -> void:
	events.append([kind, qid, text])

func _on_changed() -> void:
	changed += 1

func _at(p: String, d := 1) -> void:
	clock.d = d
	clock.set_period(p)

func _talk(q: Quests, id: String) -> Array:
	return q.talk(id, {"activity": "walk"})

func _quests(q: Quests) -> void:
	q.reset()
	q.quest_event.connect(_on_event)
	q.quest_changed.connect(_on_changed)
	_at("morning")
	# locked before day 1 / before the prerequisite
	ok(q.state("q_fanclub") == "locked", "fan club locked until the twine is found")
	ok(q.wants("tom") != "", "Old Tom has a quest (! marker)")
	ok(q.wants("delia") == "", "Delia has no test quest")
	# Rumbles from the South, by hand
	var l := _talk(q, "tom")
	ok(q.state("q_rumbles") == "active", "talking to Tom starts Rumbles")
	ok(events.size() > 0 and events[-1][0] == "start", "start event")
	ok(q.wants("gus") != "", "Gus wanted for Rumbles")
	ok(q.wants("kai") == "", "Kai not yet (step 2)")
	l = _talk(q, "mae")   # a clue, not progress
	ok(q.step_index("q_rumbles") == 0, "a clue doesn't advance")
	_talk(q, "gus")
	ok(q.step_index("q_rumbles") == 1, "Gus advances Rumbles")
	ok(q.wants("kai") != "" and q.wants("marina") != "", "Kai and Marina wanted")
	_talk(q, "marina")
	ok(q.step_index("q_rumbles") == 2, "Marina advances Rumbles")
	ok(not q.heard("blaine_riddles"), "Blaine rumor still locked")
	l = _talk(q, "tom")
	ok(q.state("q_rumbles") == "done", "Rumbles complete")
	ok(q.flag("rumbles_heard"), "rumbles flag")
	ok(q.heard("blaine_riddles"), "Blaine's riddles unlocked by Rumbles")
	ok(q.rumor_unlocked("blaine_quiz"), "Blaine quiz rumor unlocked by hearing riddles")
	ok(_has(events, "complete", "q_rumbles"), "complete event")
	# Supper for the Keeper: time of day matters
	ok(q.state("q_lighthouse") == "available", "lighthouse quest unlocked after Rumbles")
	_talk(q, "gus")
	ok(q.state("q_lighthouse") == "active", "Gus gives the supper quest")
	_at("night")
	ok(q.wants("bram") == "", "no marker on Bram at night (ovens cold)")
	l = _talk(q, "bram")
	ok(q.step_index("q_lighthouse") == 0 and not q.has_item("fresh_bread"), "Bram can't bake at night")
	_at("morning", 2)
	ok(q.wants("bram") != "", "Bram wanted in the morning")
	_talk(q, "bram")
	ok(q.has_item("fresh_bread"), "got the bread")
	l = _talk(q, "gus")
	ok(q.step_index("q_lighthouse") == 1 and q.has_item("fresh_bread"), "Gus wants it after dark")
	_at("evening", 2)
	_talk(q, "gus")
	ok(q.state("q_lighthouse") == "done" and not q.has_item("fresh_bread"), "supper delivered")
	ok(q.heard("lapras_song"), "Lapras song rumor from Gus")
	# Bread Round: three households in any order
	_at("morning", 3)
	_talk(q, "ada")
	ok(q.state("q_bread") == "active", "Bread Round started")
	_talk(q, "ben")
	ok(q.step_progress("q_bread").begins_with("1/3"), "bread progress 1/3: " + q.step_progress("q_bread"))
	ok(q.wants("ben") == "", "Ben done, no marker")
	_talk(q, "ben")
	ok(q.step_progress("q_bread").begins_with("1/3"), "talking twice doesn't count twice")
	# save half way and carry on in a fresh instance
	q.save()
	var snapshot := _summary(q)
	var q2 := _new_quests()
	ok(_summary(q2) == snapshot, "save / load keeps quests, flags, items, rumors")
	ok(q2.step_progress("q_bread").begins_with("1/3"), "loaded progress")
	q2.quest_event.connect(_on_event)
	# the rest by a solver that only uses the public API
	_solve(q2)
	for qq in q2.quests():
		ok(q2.state(qq.id) == "done", qq.id + " completed")
		if qq.get("reward", {}).has("flag"): ok(q2.flag(qq.reward.flag), qq.id + " reward flag")
	var lg := q2.log_entries()
	ok(lg.done.size() == q2.quests().size() and lg.active.is_empty(), "log: all done")
	# the log lists every rumour heard, the quests' reward rumours among them (how many more
	# came up in passing while solving depends on the talk's dice)
	var lg_ids: Array = lg.rumors.map(func(r): return r.id)
	var rewards: Array = q2.quests().filter(func(qq): return qq.get("reward", {}).has("rumor")).map(func(qq): return qq.reward.rumor)
	ok(lg_ids.size() == q2.st.heard.size() and lg_ids.size() >= 2 and rewards.all(func(r): return lg_ids.has(r)), "log: rumors heard (%s)" % str(lg_ids))
	ok(lg.items.size() >= 2, "log: keepsakes carried (roll, card)")
	ok(not q2.has_item("net_twine"), "twine handed back")
	ok(changed > 5, "quest_changed fired")
	# rumours spread by talking
	for i in 40:
		for id in ["tom", "gus", "kai", "marina", "ada", "mae"]: _talk(q2, id)
	ok(q2.log_entries().rumors.size() >= 10, "rumors spread round town (%d)" % q2.log_entries().rumors.size())
	ok(q2.heard("strongest_pokemon") or q2.heard("mansion_journals"), "deeper rumors follow the first ones")
	q2.save()
	var q3 := _new_quests()
	ok(_summary(q3) == _summary(q2), "final state saved")
	for x in [q, q2, q3]: x.queue_free()
	print("  quests: events %d, rumors heard %d" % [events.size(), q2.log_entries().rumors.size()])

func _has(evs: Array, kind: String, qid: String) -> bool:
	for e in evs:
		if e[0] == kind and e[1] == qid: return true
	return false

func _summary(q: Quests) -> String:
	var s := []
	for qq in q.quests(): s.append("%s=%s/%d/%s" % [qq.id, q.state(qq.id), q.step_index(qq.id), q.step_progress(qq.id)])
	var f: Array = q.st.flags.keys(); f.sort()
	var it: Array = q.st.items.keys(); it.sort()
	var r: Array = q.st.heard.keys(); r.sort()
	return "|".join(s) + " flags " + str(f) + " items " + str(it) + " heard " + str(r)

func _who_left(q: Quests, qq: Dictionary) -> Array:
	var step: Dictionary = qq.steps[q.step_index(qq.id)]
	var who: Variant = step.get("who", "giver")
	var out := []
	for w in (who if who is Array else [who]):
		var id: String = qq.giver if w == "giver" else w
		if step.get("mode", "any") == "all" and q.st.quests[qq.id].get("done", []).has(id): continue
		out.append(id)
	return out

func _solve(q: Quests) -> void:
	var day := 3
	for it in 200:
		var pending := []
		for qq in q.quests():
			if q.state(qq.id) != "done": pending.append(qq)
		if pending.is_empty(): return
		var moved := false
		for qq in pending:
			var before := _summary(q)
			if q.state(qq.id) != "active":
				# find a time it unlocks, then ask its giver
				for p in PERIODS:
					_at(p, day)
					if q.state(qq.id) == "available": break
				if q.state(qq.id) != "available": continue
				ok(q.wants(qq.giver) != "", qq.id + ": giver marked")
				for k in 3:   # a step or a clue with the giver may come first
					if q.state(qq.id) == "active": break
					_talk(q, qq.giver)
				ok(q.state(qq.id) == "active", qq.id + " started by its giver")
			else:
				var targets := _who_left(q, qq)
				for p in PERIODS:
					_at(p, day)
					if q.wants(targets[0]) != "": break
				_talk(q, targets[0])
			if _summary(q) != before: moved = true
		if not moved:
			day += 1
			if day > 10:
				ok(false, "solver stuck: " + _summary(q))
				return

# ---------- screenshots ----------
func _snap(dir: String, name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(dir.path_join(name))
	print("shot " + dir.path_join(name))

func _frames(n: int) -> void:
	for i in n: await get_tree().process_frame

func _shots(dir: String) -> void:
	DirAccess.make_dir_recursive_absolute(dir)
	var main: Node = load("res://main.tscn").instantiate()
	add_child(main)
	await _frames(12)
	var q := Quests.new()
	q.save_path = "user://quests_shot.save"
	add_child(q)
	q.setup(main, clock)
	q.reset()
	var vs := get_viewport().get_visible_rect().size
	# pretend an iPhone in landscape: notch / home bar insets
	q.ui.safe_override = Rect2(87, 0, vs.x - 174, vs.y - 39)
	q.ui._layout()
	_at("morning")
	_talk(q, "tom"); _talk(q, "gus"); _talk(q, "kai")
	_talk(q, "ada"); _talk(q, "mae")
	_talk(q, "mae")
	_talk(q, "lily")
	_talk(q, "lily"); _talk(q, "ben")
	_talk(q, "marina"); _talk(q, "tom")   # Rumbles done: Blaine's riddles
	_talk(q, "rose"); _talk(q, "ada"); _talk(q, "ada")   # Bread Round done
	for i in 6:
		_talk(q, "gus"); _talk(q, "kai"); _talk(q, "mae")   # some gossip
	_talk(q, "ben"); _talk(q, "gus")
	await _frames(2)
	q.ui._toasts.clear()
	# a quest line in the dialog box
	var cast: Node = main.get("cast")
	if cast != null:
		cast.dialog.say(q.talk("rose", {"activity": "garden"}))
		cast.dialog.shown = 9999.0
		await _frames(4)
		await _snap(dir, "quest_dialog.png")
		cast.dialog.lines = []
	q.ui._toasts.clear(); q.ui._toast_t = 0.0
	q.ui.toast("start", "The Butterfree Question")
	await _frames(4)
	await _snap(dir, "toast.png")
	q.ui._toasts.clear()
	q.ui.open()
	await _frames(6)
	await _snap(dir, "log_active.png")
	q.ui._set_tab("rumors")
	await _frames(6)
	await _snap(dir, "log_rumors.png")
	q.ui._set_tab("done")
	await _frames(6)
	await _snap(dir, "log_done.png")
	q.ui.close()
	q.ui.safe_override = Rect2()
	q.reset()

# ---------- -- --demo: print a sample day in town ----------
func _demo() -> void:
	var q := _new_quests("user://quests_demo.save")
	q.reset()
	q.quest_event.connect(func(k, _id, t): print("    [%s] %s" % [k, t]))
	_at("morning")
	for id in ["delia", "tom", "gus", "kai", "tom", "marina", "lily", "ada"]: _demo_say(q, id, "walk", "")
	_demo_say(q, "delia", "yardwork", "red")
	_demo_say(q, "delia", "yardwork", "red")
	_at("night")
	_demo_say(q, "bram", "home", "hollis")
	for pr in [["tom", "gus"], ["delia", "rose"], ["kai", "marina"], ["ben", "lily"], ["timmy", "mae"], ["ada", "gus"]]:
		print("> chatter %s / %s" % pr)
		for l in q.chatter(pr[0], pr[1], {}): print("    " + l)
	for id in IDS: print("> bark %s: %s" % [id, q.overheard(id, {"activity": "walk"})])
	q.reset()

func _demo_say(q: Quests, id: String, act: String, place: String) -> void:
	print("> talk to %s (%s, %s)" % [id, clock.period(), act])
	for l in q.talk(id, {"activity": act, "place": place}): print("    " + l)
