extends Node
# Dev test for the conversation mode (conversation.gd) and its writing
# (life/conversations.json, life/topics.json, life/topics_people.json,
# life/growth.json). Headless:
#   godot --headless --path native res://dev/conversation_test.tscn
# exits 0 when green. Checks:
#   1. the data: every tree's nodes reachable from its start, none a dead end
#      (every node reaches an end), 2-4 choices with one always offered, valid
#      conditions / effects / speakers / tones / quest, item, rumour, thread and
#      flag references, quest trees on the right person and step, every line and
#      label fitting the panel; topics valid and fitting too
#   2. every path through every tree played through the engine (quest trees with
#      their quest at that step): it ends, offers start the quest, steps advance it
#   3. all seven quests played start to finish through conversations only
#   4. everyday talk over several game days: every topic reachable from every
#      person who answers it, every rumour reached through Ash's questions, no
#      question offered twice in one talk, menus of 2-4 plus the goodbye
#   5. interruptions, save / load, growth stages setting the heart_* flags

const IDS := ["delia", "lily", "rose", "bram", "ada", "timmy", "mae", "kai", "marina", "ben", "tom", "gus", "jenny", "gary"]
const OTHERS := ["oak", "tea_keeper", "mart_clerk"]
const PETS := ["nibbles", "doduo", "mrmime"]
const HOUR := {"dawn": 6.0, "morning": 9.0, "midday": 12.5, "afternoon": 15.0, "evening": 19.0, "night": 22.5}

class FakeClock:
	extends RefCounted
	signal hour_changed(h)
	var h := 9.0
	var d := 1
	func hour() -> float: return h
	func day() -> int: return d
	func minute_of_day() -> int: return int(h * 60.0)
	func period() -> String: return Quests.period_of(h)

var checks := 0
var fails := 0
var clock := FakeClock.new()
var q: Quests
var cv: Conversation
var flags_set := {}

func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		fails += 1
		if fails < 80: printerr("FAIL: " + msg)

func _ready() -> void:
	q = Quests.new()
	q.make_ui = false; q.autosave = false; q.save_path = "user://conversation_test_q.save"
	add_child(q)
	q.setup(null, clock)
	q.reset()
	cv = Conversation.new()
	cv.autosave = false; cv.save_path = "user://conversation_test.save"
	add_child(cv)
	cv.setup(q, clock)
	cv.reset()
	cv.test_mode = true
	_static()
	_walk_trees()
	_quest_flows()
	_everyday()
	_misc()
	_emotes()
	print("conversation_test: %d checks, %d failures" % [checks, fails])
	print("CONVERSATION TEST " + ("GREEN" if fails == 0 else "RED"))
	get_tree().quit(1 if fails > 0 else 0)

func _fresh() -> void:
	q.reset(); cv.reset()
	clock.h = 9.0; clock.d = 1

# ---------------------------------------------------------------- 1. the data
func _static() -> void:
	var people := q.people_ids()
	var speakers: Dictionary = cv.C.get("speakers", {})
	var who_ok := func(id: String) -> bool: return people.has(id) or speakers.has(id)
	var tones: Dictionary = ConversationUI.TONES
	var threads: Dictionary = cv.G.get("threads", {})
	ok(threads.size() == 6, "six growth threads")
	# every flag something can set
	flags_set = {}
	for qq in q.quest_by_id.values():
		var rw: Dictionary = qq.get("reward", {})
		if rw.has("flag"): flags_set[String(rw.flag)] = true
		for s in qq.get("steps", []):
			if s.has("set"): flags_set[String(s.set)] = true
	for th in threads:
		for i in 5: flags_set["heart_%s_%d" % [th, i]] = true
	var know_set := {}
	for tid in cv.topics: know_set[tid] = true
	var all_do := []
	for t in cv.trees.values():
		for n in t.nodes.values():
			if n.has("do"): all_do.append(n.do)
			for c in n.get("choices", []):
				if c.has("do"): all_do.append(c.do)
	for tp in cv.topics.values():
		if tp.has("do"): all_do.append(tp.do)
		for p in tp.get("by", {}):
			if tp.by[p] is Dictionary and tp.by[p].has("do"): all_do.append(tp.by[p].do)
	for d in all_do:
		if d.has("flag"): flags_set[String(d.flag)] = true
		for f in d.get("flags", []): flags_set[String(f)] = true
		if d.has("know"): know_set[String(d.know)] = true
	var n_trees := 0
	var by_person := {}
	for id in cv.trees:
		var t: Dictionary = cv.trees[id]
		n_trees += 1
		var w := String(t.get("with", ""))
		by_person[w] = int(by_person.get(w, 0)) + 1
		ok(who_ok.call(w), "%s: with '%s' is a known speaker" % [id, w])
		var on := String(t.get("on", ""))
		var parts := on.split(":")
		if parts[0] == "offer":
			ok(q.quest_by_id.has(parts[1]) and String(q.quest(parts[1]).giver) == w, "%s: offer of a quest %s gives" % [id, w])
		elif parts[0] == "step":
			var qq: Dictionary = q.quest(parts[1])
			var si := int(parts[2])
			ok(not qq.is_empty() and si < qq.steps.size(), "%s: step exists" % id)
			if not qq.is_empty() and si < qq.steps.size():
				ok(q._who(qq, qq.steps[si]).has(w), "%s: %s is who step %d needs" % [id, w, si])
		else:
			ok(on == "talk" or on == "scene", "%s: on '%s'" % [id, on])
		_cond(t.get("if"), id, know_set)
		var nodes: Dictionary = t.get("nodes", {})
		ok(nodes.has(String(t.get("start", ""))), "%s: start node" % id)
		# reachability and dead ends
		var seen := {}
		var stack := [String(t.get("start", ""))]
		while not stack.is_empty():
			var nid: String = stack.pop_back()
			if seen.has(nid) or not nodes.has(nid): continue
			seen[nid] = true
			for nx in _nexts(nodes[nid]): stack.append(nx)
		for nid in nodes:
			ok(seen.has(nid), "%s: node %s reachable" % [id, nid])
			var n: Dictionary = nodes[nid]
			var outs := int(n.has("choices")) + int(n.has("branch")) + int(n.has("next")) + int(n.has("end"))
			ok(outs == 1, "%s.%s: exactly one of choices / branch / next / end" % [id, nid])
			for nx in _nexts(n): ok(nodes.has(nx), "%s.%s: next %s exists" % [id, nid, nx])
			for k in n: ok(k in ["lines", "do", "choices", "branch", "next", "end", "_note"], "%s.%s: key %s" % [id, nid, k])
			for l in n.get("lines", []): _line_ok(String(l), "%s.%s" % [id, nid], who_ok)
			if n.has("do"): _do(n.do, id, threads)
			if n.has("choices"):
				var ch: Array = n.choices
				ok(ch.size() >= 2 and ch.size() <= 4, "%s.%s: 2-4 choices (%d)" % [id, nid, ch.size()])
				var free := 0
				for c in ch:
					if not c.has("if"): free += 1
					ok(ConversationUI.label_fits(String(c.get("label", ""))), "%s.%s: label fits '%s'" % [id, nid, c.get("label", "")])
					ok(tones.has(String(c.get("tone", ""))), "%s.%s: tone %s" % [id, nid, c.get("tone", "")])
					ok(ConversationUI.rows(String(c.get("ash", ""))) <= ConversationUI.ROWS, "%s.%s: Ash's line fits" % [id, nid])
					_cond(c.get("if"), id, know_set)
					if c.has("do"): _do(c.do, id, threads)
				ok(free >= 1, "%s.%s: a choice always offered" % [id, nid])
			if n.has("branch"):
				ok(not n.branch[-1].has("if"), "%s.%s: branch ends with a default" % [id, nid])
				for b in n.branch: _cond(b.get("if"), id, know_set)
		# every node reaches an end (no loops without a way out)
		var ends := {}
		for _i in nodes.size() + 1:
			for nid in nodes:
				var n: Dictionary = nodes[nid]
				if n.has("end") or ends.has(nid): ends[nid] = true; continue
				var nx := _nexts(n)
				if n.has("choices"):
					for c in n.choices:
						if not c.has("next"): ends[nid] = true
				for x in nx:
					if ends.has(x): ends[nid] = true
		for nid in nodes: ok(ends.has(nid), "%s: node %s reaches an end" % [id, nid])
		# quest trees: every path does its job
		if parts[0] in ["offer", "step"]:
			var paths := _paths(nodes, String(t.start), [])
			var any_start := false
			for p in paths:
				var has_adv := false
				for d in p:
					if d.has("advance"): has_adv = true
					if d.has("start_quest"): any_start = true
				if parts[0] == "step": ok(has_adv, "%s: every path advances the quest" % id)
			if parts[0] == "offer": ok(any_start, "%s: a path starts the quest" % id)
	ok(n_trees >= 50, "plenty of trees (%d)" % n_trees)
	for p in IDS: ok(int(by_person.get(p, 0)) >= 2, "%s has trees (%d)" % [p, int(by_person.get(p, 0))])
	ok(int(by_person.get("delia", 0)) >= 6, "Delia has several trees")
	ok(int(by_person.get("oak", 0)) >= 3, "Oak has trees")
	for qid in q.quest_by_id:
		if q.quest(qid).get("disabled", false): continue
		ok(cv._has_on("offer:" + qid), "quest %s has an offer tree" % qid)
	# topics
	var count := {}
	for tid in cv.topics:
		var tp: Dictionary = cv.topics[tid]
		ok(ConversationUI.label_fits(String(tp.get("label", ""))), "topic %s: label fits" % tid)
		ok(tones.has(String(tp.get("tone", "curious"))), "topic %s: tone" % tid)
		ok(ConversationUI.rows(String(tp.get("ash", tp.label))) <= ConversationUI.ROWS, "topic %s: Ash's line fits" % tid)
		ok(not tp.get("by", {}).is_empty(), "topic %s: someone answers it" % tid)
		_cond(tp.get("if"), tid, know_set)
		if tp.has("do"): _do(tp.do, tid, threads)
		for p in tp.get("by", {}):
			ok(who_ok.call(p), "topic %s: %s is known" % [tid, p])
			count[p] = int(count.get(p, 0)) + 1
			var ans = tp.by[p]
			var lines: Array = ans if ans is Array else ans.get("lines", [])
			ok(not lines.is_empty(), "topic %s: %s answers" % [tid, p])
			for l in lines: _line_ok(String(l), "topic %s/%s" % [tid, p], who_ok)
			if ans is Dictionary:
				_cond(ans.get("if"), tid, know_set)
				if ans.has("do"): _do(ans.do, tid, threads)
	for p in IDS + ["oak"]: ok(int(count.get(p, 0)) >= 10, "%s answers plenty of questions (%d)" % [p, int(count.get(p, 0))])
	for rid in cv.T.get("rumor_asks", {}):
		ok(q.rumor_by_id.has(rid), "rumor_asks %s is a rumour" % rid)
		ok(ConversationUI.label_fits(String(cv.T.rumor_asks[rid].label)), "rumor ask %s fits" % rid)
	for rid in q.rumor_by_id:
		if String(q.rumor_by_id[rid].get("requires", "")) != "": ok(cv.T.get("rumor_asks", {}).has(rid), "follow-up rumour %s has a question" % rid)
	for k in ["farewell", "interrupts", "wrap_up"]:
		for p in cv.C.get(k, {}):
			for l in cv.C[k][p]: _line_ok(String(l), k + "/" + p, who_ok)
	var tot := 0
	for p in count: tot += count[p]
	print("  data: %d trees, %d topics, %d answers; per person: %s" % [n_trees, cv.topics.size(), tot, str(by_person)])

func _nexts(n: Dictionary) -> Array:
	var out := []
	if n.has("next"): out.append(String(n.next))
	for b in n.get("branch", []): out.append(String(b.next))
	for c in n.get("choices", []):
		if c.has("next"): out.append(String(c.next))
	return out

# every path's effects (lists of do dicts), branches and choices both ways
func _paths(nodes: Dictionary, nid: String, acc: Array, depth := 0) -> Array:
	if depth > 40 or not nodes.has(nid): return [acc]
	var n: Dictionary = nodes[nid]
	var a := acc.duplicate()
	if n.has("do"): a.append(n.do)
	var out := []
	if n.has("choices"):
		for c in n.choices:
			var b := a.duplicate()
			if c.has("do"): b.append(c.do)
			if c.has("next"): out += _paths(nodes, String(c.next), b, depth + 1)
			else: out.append(b)
	elif n.has("branch"):
		for br in n.branch: out += _paths(nodes, String(br.next), a, depth + 1)
	elif n.has("next"): out += _paths(nodes, String(n.next), a, depth + 1)
	else: out.append(a)
	return out

# what is said picks the emote (conversation.gd EMOTE_RULES), and every emote exists
func _emotes() -> void:
	var D := IdleActions._defs()
	for e in Conversation.EMOTES:
		ok(e == "nod" or D.has(e), "emote %s: no such action" % e)
	var want := {"Haha, you're funny!": "laugh", "Whoa, really?!": "gasp", "Good morning, Ash!": "wave", "Halt! Stop right there, young man!": "hips",
		"Oh dear, be careful.": "worry", "The lighthouse is over there.": "point", "I'm gonna be a Pokémon Master!": "fist", "Hmm. I wonder.": "think",
		"Sorry, I forgot.": "scratch", "This is it!": "", "Things are fine.": "", "That's the whole story.": ""}
	for t in want:
		var e := ""
		for r in Conversation._emote_rules():
			if r[1].search(String(t).to_lower()): e = r[0]; break
		ok(e == want[t], "emote for '%s': %s (want %s)" % [t, e, want[t]])

func _line_ok(l: String, where: String, who_ok: Callable) -> void:
	var d := cv._line(l)
	var c := l.find(": ")
	if c > 0 and c < 10 and l.substr(0, c) == l.substr(0, c).to_lower() and l.substr(0, c) != "A" and l.substr(0, c) != "N":
		ok(who_ok.call(l.substr(0, c)), "%s: speaker %s" % [where, l.substr(0, c)])
	ok(String(d.text).strip_edges() != "", "%s: an empty line" % where)
	var tx := String(d.text)
	if tx.begins_with("[") and tx.find("]") > 1:
		ok(Conversation.EMOTES.has(tx.substr(1, tx.find("]") - 1)), "%s: an emote tag it doesn't know: %s" % [where, tx.left(20)])
	ok(ConversationUI.rows(String(d.text)) <= ConversationUI.ROWS, "%s: fits the panel: '%s'" % [where, String(d.text).left(50)])

func _cond(c: Variant, where: String, know_set: Dictionary) -> void:
	if c == null: return
	ok(c is Dictionary, where + ": condition is a dict")
	if not (c is Dictionary): return
	for k in c:
		ok(k in Conversation.COND_KEYS, "%s: condition key %s" % [where, k])
		var v = c[k]
		match k:
			"flag", "not_flag": ok(flags_set.has(String(v)), "%s: flag %s can be set" % [where, v])
			"flags":
				for f in v: ok(flags_set.has(String(f)), "%s: flag %s can be set" % [where, f])
			"quest", "quest_not", "step": ok(q.quest_by_id.has(String(v[0])), "%s: quest %s" % [where, v[0]])
			"later": ok(q.quest_by_id.has(String(v)), "%s: quest %s" % [where, v])
			"item", "not_item": ok(q.QD.get("items", {}).has(String(v)), "%s: item %s" % [where, v])
			"heard", "not_heard": ok(q.rumor_by_id.has(String(v)), "%s: rumour %s" % [where, v])
			"known", "not_known": ok(know_set.has(String(v)), "%s: known %s can be learned" % [where, v])
			"seen", "not_seen": ok(cv.trees.has(String(v)), "%s: tree %s" % [where, v])
			"growth":
				for th in v: ok(cv.G.threads.has(th), "%s: thread %s" % [where, th])
			"cond", "not_cond": ok(Conditions._read("res://life/conditions.json").get("conditions", {}).has(String(v)), "%s: condition %s" % [where, v])
			"any":
				for sub in v: _cond(sub, where, know_set)

func _do(d: Dictionary, where: String, threads: Dictionary) -> void:
	for k in d:
		ok(k in Conversation.DO_KEYS, "%s: effect key %s" % [where, k])
		var v = d[k]
		match k:
			"start_quest", "later": ok(q.quest_by_id.has(String(v)), "%s: quest %s" % [where, v])
			"give", "take": ok(q.QD.get("items", {}).has(String(v)), "%s: item %s" % [where, v])
			"rumor": ok(q.rumor_by_id.has(String(v)), "%s: rumour %s" % [where, v])
			"growth":
				for th in v: ok(threads.has(th), "%s: thread %s" % [where, th])

# ---------------------------------------------------------------- driving the engine
# play a talk to its end; pick(item) -> index for choices. Returns the items shown.
func _drive(pick: Callable, limit := 300) -> Array:
	var shown := []
	var it := cv.step()
	var n := 0
	while it.get("t", "") != "end" and n < limit:
		n += 1
		shown.append(it)
		if it.t == "line":
			ok(String(it.text).strip_edges() != "", "an empty line shown")
			ok(ConversationUI.rows(String(it.text)) <= ConversationUI.ROWS, "a shown line fits: '%s'" % String(it.text).left(60))
			it = cv.next()
		else:
			var list: Array = it.list
			ok(not list.is_empty(), "empty choices")
			if it.get("src", "") == "topics":
				ok(list.size() >= 2 and list.size() <= Conversation.MENU + 1, "a menu of 2-4 (%d)" % list.size())
				ok(String(list[-1].kind) == "bye", "the menu ends with the goodbye")
			it = cv.choose(int(pick.call(it)))
	ok(n < limit, "a talk ended (%s)" % cv.who)
	ok(not cv.active, "inactive after the end")
	return shown

func _ctx(per: String) -> Dictionary:
	clock.h = HOUR[per]
	return {"hour": HOUR[per], "period": per, "day": clock.d, "activity": "chat", "place": "plaza"}

# ---------------------------------------------------------------- 2. every tree, every path
func _walk_trees() -> void:
	var total := 0
	for id in cv.trees:
		var t: Dictionary = cv.trees[id]
		var w := String(t.with)
		var on := String(t.on).split(":")
		var todo := [[]]
		var done_paths := 0
		while not todo.is_empty() and done_paths < 40:
			var path: Array = todo.pop_front()
			_fresh()
			var kind := "person" if q.people_ids().has(w) else ("pet" if PETS.has(w) else "npc")
			if on[0] == "offer": pass
			elif on[0] == "step":
				var qid := on[1]
				var si := int(on[2])
				q.start(qid)
				q.st.quests[qid].step = si
				var step: Dictionary = q.quest(qid).steps[si]
				if step.has("needs"): q.st.items[String(step.needs)] = 1
			var per := "morning"
			if on[0] == "step" and q.quest(on[1]).steps[int(on[2])].get("when", {}).has("periods"):
				per = String(q.quest(on[1]).steps[int(on[2])].when.periods[0])
			var c := _ctx(per)
			# satisfy the tree's own condition where it asks for a time
			var tif: Dictionary = t.get("if", {}) if t.get("if") is Dictionary else {}
			if tif.has("period"): c = _ctx(String(tif.period[0]))
			cv.open(w, kind, c, {"tree": id, "cutscene": t.on == "scene"})
			var step_before := q.step_index(on[1]) if on[0] == "step" else 0
			var depth := [0]
			var branch_counts := []
			var shown := _drive(func(it):
				if it.get("src", "") == "topics":
					for i in it.list.size():
						if String(it.list[i].kind) == "bye": return i
					return 0
				var d: int = depth[0]
				depth[0] += 1
				branch_counts.append(it.list.size())
				return path[d] if d < path.size() else 0)
			done_paths += 1
			total += 1
			ok(not shown.is_empty(), "%s: shows something" % id)
			# the siblings of this path's choices still to try
			for d in range(path.size(), branch_counts.size()):
				for alt in range(1, branch_counts[d]):
					var np := path.duplicate()
					while np.size() < d: np.append(0)
					np.append(alt)
					todo.append(np)
			if on[0] == "step":
				var adv: bool = q.state(on[1]) == "done" or q.step_index(on[1]) > step_before or not q.st.quests[on[1]].get("done", []).is_empty()
				ok(adv, "%s path %s: the quest moved on" % [id, str(path)])
	print("  trees walked: %d paths" % total)

# ---------------------------------------------------------------- 3. the quests, through talk only
func _quest_flows() -> void:
	_fresh()
	var order := ["q_rumbles", "q_bread", "q_twine", "q_pidgey", "q_butterfree", "q_fanclub", "q_lighthouse"]
	var accept := func(it):
		if it.get("src", "") == "topics":
			for i in it.list.size():
				if String(it.list[i].kind) == "bye": return i
		for i in it.list.size():
			if it.list[i].get("do", {}).has("start_quest"): return i
		for i in it.list.size():
			if not it.list[i].get("do", {}).has("later"): return i
		return 0
	for qid in order:
		var qq := q.quest(qid)
		var giver := String(qq.giver)
		var started := false
		for per in ["morning", "midday", "afternoon"]:
			cv.open(giver, "person", _ctx(per))
			_drive(accept)
			if q.state(qid) == "active": started = true; break
		ok(started, "%s: started by talking to %s" % [qid, giver])
		var guard := 0
		while q.state(qid) == "active" and guard < 40:
			guard += 1
			var gp := q.goal_people()
			var who := String(gp[1][0]) if gp.size() > 1 and not gp[1].is_empty() else giver
			for per in ["morning", "afternoon", "evening", "night"]:
				var c := _ctx(per)
				if q.beat(who, c).get("kind", "") != "step": continue
				cv.open(who, "person", c)
				_drive(accept)
				break
		ok(q.state(qid) == "done", "%s: done through conversations (%s)" % [qid, q.state(qid)])
	for f in ["rumbles_heard", "bread_round_done", "twine_found", "pidgey_found", "butterfree_tips", "fanclub_card", "gus_supper"]:
		ok(q.flag(f), "flag %s after the quests" % f)
	ok(cv.growth("responsibility") >= 5, "quests grew responsibility (%d)" % cv.growth("responsibility"))
	ok(q.flag("heart_responsibility_1") and q.flag("heart_responsibility_2"), "responsibility stages flagged")

# ---------------------------------------------------------------- 4. everyday talk
func _everyday() -> void:
	_fresh()
	cv.rng.seed = 7
	var covered := {}
	var wanted := {}
	for tid in cv.topics:
		for p in cv.topics[tid].by: wanted[tid + "@" + p] = true
	var cnt := {"menus": 0, "asked": 0}
	for day in range(1, 9):
		clock.d = day
		if day == 2:   # a quest under way (Timmy's hiding places come up then)
			q.start("q_twine"); q.st.quests.q_twine.step = 1
		if day == 3:
			for f in ["rumbles_heard", "gus_supper"]: q.set_flag(f)
		if day == 8: q.st.quests.erase("q_twine")
		for per in ["morning", "afternoon", "evening", "night"]:
			for p in IDS + OTHERS:
				var c := _ctx(per)
				if day >= 2 and day < 8 and p != "timmy": q.st.quests["q_twine"] = {"state": "active", "step": 1, "done": [], "day": 2}
				var kind := "person" if IDS.has(p) else "npc"
				cv.open(p, kind, c, {"lines": ["Hello there."]} if kind == "npc" else {})
				var session := {}
				_drive(func(it):
					if it.get("src", "") != "topics":
						return cv.rng.randi() % it.list.size()
					cnt.menus += 1
					var best := -1
					for i in it.list.size():
						var e: Dictionary = it.list[i]
						var k := String(e.key)
						ok(not session.has(k), "%s: '%s' offered again after Ash asked it this talk" % [p, k])
						if e.kind == "topic" and not covered.has(k + "@" + p) and best < 0: best = i
						if e.kind in ["rumor", "clue"] and best < 0: best = i
					if best < 0:
						for i in it.list.size():
							if String(it.list[i].kind) == "doing": best = i
					if best < 0: best = it.list.size() - 1
					var e2: Dictionary = it.list[best]
					session[String(e2.key)] = true
					if e2.kind == "topic": covered[String(e2.key) + "@" + p] = true; cnt.asked += 1
					return best)
	var missing := []
	for k in wanted:
		if not covered.has(k): missing.append(k)
	ok(missing.is_empty(), "every topic reached from everyone who answers it; missing: %s" % str(missing.slice(0, 12)))
	var unheard := []
	for rid in q.rumor_by_id:
		if not q.heard(rid): unheard.append(rid)
	ok(unheard.is_empty(), "every rumour heard through questions; unheard: %s" % str(unheard))
	ok(cv.knowledge().size() > 60, "Ash learned plenty (%d notes)" % cv.knowledge().size())
	ok(cv.growth("openness") >= 2, "asking grew openness (%d)" % cv.growth("openness"))
	print("  everyday: %d menus, %d questions asked, %d/%d topic answers reached, %d rumours heard, %d notes" % [cnt.menus, cnt.asked, covered.size(), wanted.size(), q.rumor_by_id.size() - unheard.size(), cv.knowledge().size()])

# ---------------------------------------------------------------- 5. the rest
func _misc() -> void:
	# an interruption: a polite goodbye, then the end
	_fresh()
	cv.open("ada", "person", _ctx("morning"))
	var it := cv.step()
	cv.interrupt()
	var n := 0
	it = cv.step()
	while it.get("t", "") != "end" and n < 10:
		n += 1
		it = cv.next() if it.t == "line" else cv.choose(0)
	ok(n >= 1 and n <= 3 and not cv.active, "an interruption ends the talk politely (%d lines)" % n)
	# pets: their own trees and noises, no question menus
	for p in PETS:
		_fresh()
		cv.open(p, "pet", {}, {"lines": ["N: (It looks at you.)"]})
		var shown := _drive(func(it2): return 0)
		var menu := false
		for s in shown:
			if s.t == "choices" and s.get("src", "") == "topics": menu = true
		ok(not menu and not shown.is_empty(), "%s: a pet talk without a question menu" % p)
	# the cutscene: no questions after it
	_fresh()
	cv.open("oak", "npc", {}, {"tree": "oak_tall_grass", "cutscene": true, "lines": []})
	var sh := _drive(func(it3): return 0)
	var any_menu := false
	for s in sh:
		if s.t == "choices" and s.get("src", "") == "topics": any_menu = true
	ok(not any_menu and sh.size() >= 5, "Oak's tall-grass scene plays as a cutscene")
	# a sleeping person: no questions
	_fresh()
	var c := _ctx("night"); c.activity = "sleep"
	cv.open("tom", "person", c)
	var sl := _drive(func(it4): return 0)
	ok(sl.size() >= 1 and sl.filter(func(s): return s.t == "choices").is_empty(), "asleep: a line, no questions")
	# growth stages flag heart_*, save and load keep growth, relationships, knowledge
	_fresh()
	cv.who = "ben"
	cv.grow("patience", 2)
	ok(cv.stage("patience") == 1 and q.flag("heart_patience_1"), "a growth stage sets its flag")
	cv.apply({"rel": 2, "know": "viridian"})
	cv.save()
	var cv2 := Conversation.new()
	cv2.autosave = false; cv2.save_path = cv.save_path
	add_child(cv2)
	cv2.setup(q, clock)
	ok(cv2.growth("patience") == 2 and cv2.rel("ben") == 2 and cv2.st.known.has("viridian"), "save / load keeps growth, relationship, knowledge")
	cv2.queue_free()
	# a wet Ash: the remark opens the talk and Ash answers it
	_fresh()
	var C := Conditions.new()
	add_child(C)
	C.setup(clock)
	C.reset()
	C.apply("wet", 0.8)
	cv.open("marina", "person", _ctx("morning"))
	var w := _drive(func(it5): return it5.list.size() - 1)
	var ash_after := false
	for i in mini(4, w.size()):
		if w[i].t == "line" and w[i].who == "ash": ash_after = true
	ok(ash_after, "a wet remark opens the talk and Ash answers")
	C.reset()
	C.queue_free()
