extends Node
# Dev only: plays battles headlessly on the real rules (PkmnBattle, the 151's data) and
# writes each one's turn-by-turn log, so the text of a battle can be read.
#   godot --headless --path native res://dev/battle_log.tscn -- [--out=dir] [--seed=n]
#     [--fight=a:lv:ai,b:lv:ai (one matchup)] (both sides play by their AI)
const SET := [
	["pikachu:9:aggressive", "pidgey:7:wild"],
	["bulbasaur:12:balanced", "charmander:12:aggressive"],
	["squirtle:12:cautious", "charmander:12:aggressive"],
	["geodude:14:balanced", "pikachu:14:aggressive"],
	["sandshrew:15:tricky", "ekans:15:balanced"],
	["gengar:40:tricky", "alakazam:40:cautious"],
	["machamp:42:aggressive", "snorlax:42:balanced"],
	["gyarados:45:aggressive", "dragonite:45:balanced"],
	["mewtwo:70:balanced", "mew:70:tricky"],
]

func _arg(k: String, d: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--" + k + "="): return a.substr(k.length() + 3)
	return d

func _ready() -> void:
	Kanto151Data.install()
	var out := _arg("out", "user://battle_logs")
	DirAccess.make_dir_recursive_absolute(out)
	var seed := int(_arg("seed", "7"))
	var set: Array = SET
	if _arg("fight", "") != "": set = [Array(_arg("fight", "").split(","))]
	var i := 0
	for m in set:
		i += 1
		var a: PackedStringArray = String(m[0]).split(":")
		var b: PackedStringArray = String(m[1]).split(":")
		var lines := _play(a, b, seed + i)
		var name := "%02d_%s_vs_%s.txt" % [i, a[0], b[0]]
		var f := FileAccess.open(out.path_join(name), FileAccess.WRITE)
		f.store_string("\n".join(lines) + "\n")
		f.close()
		print(name, ": ", lines[-1])
	get_tree().quit(0)

func _play(a: PackedStringArray, b: PackedStringArray, seed: int) -> Array:
	var wild := b[2] == "wild"
	var B := PkmnBattle.new({"a": {"species": a[0], "level": int(a[1]), "ai": a[2]},
		"b": {"species": b[0], "level": int(b[1]), "ai": b[2]}, "kind": "wild" if wild else "trainer", "seed": seed})
	var L := ["%s Lv%s (%s AI) vs %s %s Lv%s (%s AI)" % [B.fighter("a").name, a[1], a[2], "wild" if wild else "trainer's", B.fighter("b").name, b[1], b[2]], ""]
	_add(L, B.start())
	var n := 0
	while not B.over and n < 40:
		n += 1
		_add(L, B.begin_turn())
		for s in ["a", "b"]:
			if B.needs_pick(s): B.pick_pool(s)
		var qa: Array = B.ai_queue("a")
		var qb: Array = B.ai_queue("b")
		L.append("  plans: %s %s | %s %s" % [B.fighter("a").name, str(qa), B.fighter("b").name, str(qb)])
		_add(L, B.resolve())
		var fa = B.fighter("a"); var fb = B.fighter("b")
		L.append("  [%s %d/%d HP, focus %d%%] [%s %d/%d HP, focus %d%%]" % [fa.name, fa.hp, fa.max_hp, int(fa.e.focus), fb.name, fb.hp, fb.max_hp, int(fb.e.focus)])
		L.append("")
	B.finish()
	L.append("RESULT: %s after %d turns" % [B.outcome if B.over else "unfinished", n])
	return L

func _add(L: Array, evs) -> void:
	if not evs is Array: return
	for e in evs:
		if e is Dictionary and String(e.get("text", "")) != "":
			L.append(("== " if String(e.get("t", "")) == "turn" else "  ") + String(e.text))
