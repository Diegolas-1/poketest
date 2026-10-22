extends Node
# Stand-in for the Quests node (res://quests.gd, class_name Quests) until the
# story worker's version lands: the same calls, answered from people.json's
# fallback lines. life.gd uses res://quests.gd instead as soon as it exists.

signal quest_changed

var people := {}     # id -> people.json entry
var chat := {}
var _rng := RandomNumberGenerator.new()

func setup(_game, _clock) -> void:
	_rng.randomize()
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://life/people.json"))
	for p in d.people: people[p.id] = p
	chat = d.chatter

func _name(id: String) -> String:
	return String(people[id].name) if people.has(id) else id.capitalize()

func talk(id: String, ctx: Dictionary) -> Array:
	if not people.has(id): return ["..."]
	var L: Dictionary = people[id].lines
	var act := String(ctx.get("activity", ""))
	var out: Array = []
	if L.has(act): out.append_array(L[act])
	elif act.begins_with("work:") and L.has("work"): out.append_array(L.work)
	else: out.append_array(L.default)
	return out.map(func(s): return "%s: %s" % [_name(id).to_upper(), s])

func chatter(a: String, b: String, ctx: Dictionary) -> Array:
	var per := String(ctx.get("period", "morning"))
	var g: Array = chat.greet.get(per, chat.greet.morning)
	var out := ["%s: %s" % [_name(a), String(g[_rng.randi() % g.size()]).format({"b": _name(b)})]]
	out.append("%s: %s" % [_name(b), chat.topics[_rng.randi() % chat.topics.size()]])
	out.append("%s: %s" % [_name(a), chat.replies[_rng.randi() % chat.replies.size()]])
	if _rng.randf() < 0.5: out.append("%s: %s" % [_name(b), chat.bye[_rng.randi() % chat.bye.size()]])
	return out

func overheard(id: String, _ctx: Dictionary) -> String:
	if not people.has(id) or not people[id].has("barks"): return ""
	var b: Array = people[id].barks
	return b[_rng.randi() % b.size()]

func wants(_id: String) -> String:
	return ""
