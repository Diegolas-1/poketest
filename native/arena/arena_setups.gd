class_name ArenaSetups
extends RefCounted
# The Battle Arena's staged setups (arena/arena_menu.gd builds them, arena_stage.gd
# runs them): the data, the presets, a random party, and saving them to
# user://arena_setups.json.
#
# A setup:
#   {"type": "wild" | "trainer",
#    "wild": {"species", "level", "temper": flighty|aggressive|curious|timid,
#             "start": hidden|startled|open, "with_party": bool},
#    "ash": [{"species", "level", "equip": [move ids] (optional)}, ...]   up to 6
#    "foe": {"name", "look" (a cast look), "ai": cautious|aggressive|balanced|tricky,
#            "format": "singles" | "doubles", "party": [...] up to 6}}

const PATH := "user://arena_setups.json"
const TEMPERS := ["flighty", "aggressive", "curious", "timid"]
const STARTS := ["hidden", "startled", "open"]
const AIS := ["cautious", "aggressive", "balanced", "tricky"]
const LOOKS := ["ben", "tom", "gus", "bram", "fisher", "kid", "girl", "marina", "mae", "rose", "ada", "delia", "jenny", "joy", "oak"]

# the Indigo League era's teams (levels for a fair test)
const PRESETS := {
	"ash": {"label": "ASH (ANIME)", "party": [["pikachu", 25], ["pidgeotto", 22], ["bulbasaur", 22], ["charmander", 22], ["squirtle", 22], ["butterfree", 22]]},
	"brock": {"label": "BROCK", "name": "Brock", "look": "fisher", "ai": "cautious", "party": [["geodude", 20], ["onix", 24], ["vulpix", 20], ["zubat", 18]]},
	"misty": {"label": "MISTY", "name": "Misty", "look": "marina", "ai": "aggressive", "party": [["staryu", 21], ["starmie", 23], ["goldeen", 19], ["horsea", 19], ["psyduck", 20]]},
	"gary": {"label": "GARY", "name": "Gary", "look": "kid", "ai": "tricky", "party": [["eevee", 22], ["krabby", 21], ["nidorino", 23], ["arcanine", 25], ["doduo", 21], ["magmar", 24]]},
}

static func default_setup() -> Dictionary:
	return {"type": "trainer",
		"wild": {"species": "pidgey", "level": 6, "temper": "flighty", "start": "hidden", "with_party": true},
		"ash": preset_party("ash").slice(0, 3),
		"foe": {"name": "Brock", "look": "fisher", "ai": "cautious", "format": "singles", "party": preset_party("brock").slice(0, 3)}}

static func preset_party(id: String) -> Array:
	var out := []
	for p in PRESETS[id].party: out.append({"species": String(p[0]), "level": int(p[1])})
	return out

static func apply_preset(setup: Dictionary, id: String, side: String) -> void:
	var P: Dictionary = PRESETS[id]
	if side == "ash":
		setup.ash = preset_party(id)
	else:
		setup.foe.party = preset_party(id)
		if P.has("name"): setup.foe.name = String(P.name)
		if P.has("look"): setup.foe.look = String(P.look)
		if P.has("ai"): setup.foe.ai = String(P.ai)

# the 151 in dex order: [{id, name, dex, types, model: has a model}]
static var _list: Array = []
static func species_list() -> Array:
	if not _list.is_empty(): return _list
	var sp: Dictionary = BattleEnergy.data().get("species", {})
	for id in sp:
		var d: Dictionary = sp[id]
		if not d.has("dex"): continue
		_list.append({"id": String(id), "name": String(d.get("name", String(id).capitalize())), "dex": int(d.dex), "types": d.get("types", ["normal"]),
			"model": ResourceLoader.exists("res://creatures/%s.glb" % id)})
	_list.sort_custom(func(a, b): return int(a.dex) < int(b.dex))
	return _list

static func species_name(id: String) -> String:
	return String(BattleEnergy.species_data(id).get("name", id.capitalize()))

static func random_party(n := 6, rng: RandomNumberGenerator = null) -> Array:
	if rng == null:
		rng = RandomNumberGenerator.new()
		rng.randomize()
	var pool := species_list().filter(func(s): return s.model)
	var out := []
	var used := {}
	while out.size() < n and used.size() < pool.size():
		var s: Dictionary = pool[rng.randi() % pool.size()]
		if used.has(s.id): continue
		used[s.id] = true
		out.append({"species": String(s.id), "level": rng.randi_range(16, 30)})
	return out

# what a Pokémon knows at its level, and how many it can have equipped
static func known_moves(sp: String, lv: int) -> Array:
	return BattleEnergy.make(sp, lv).known.duplicate()

static func slots(sp: String, lv: int) -> int:
	return BattleEnergy.slots_for(lv, sp)

# a setup's Pokémon as the engine's dicts
static func mon(d: Dictionary) -> Dictionary:
	var o := {"species": String(d.species), "level": int(d.level)}
	var eq: Array = d.get("equip", [])
	if not eq.is_empty():
		var kn := known_moves(o.species, o.level)
		for id in eq: if not id in kn: kn.append(id)
		o["known"] = kn
		o["equip"] = eq.duplicate()
	return o

static func title(s: Dictionary) -> String:
	if String(s.get("type", "")) == "wild":
		var w: Dictionary = s.wild
		return "Wild %s Lv%d" % [species_name(String(w.species)), int(w.level)]
	return "Ash vs %s %dv%d" % [String(s.foe.name), s.ash.size(), s.foe.party.size()]

# ---------- saving ----------
static func load_all() -> Array:
	if not FileAccess.file_exists(PATH): return []
	var v = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if v is Dictionary and v.get("setups") is Array: return v.setups
	return []

static func save_all(list: Array) -> bool:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null: return false
	f.store_string(JSON.stringify({"setups": list}, "  "))
	f.close()
	return true

static func save_one(s: Dictionary) -> String:
	var list := load_all()
	var nm := title(s)
	var n := 1
	var base := nm
	while list.any(func(e): return String(e.get("name", "")) == nm):
		n += 1
		nm = "%s (%d)" % [base, n]
	list.append({"name": nm, "setup": s.duplicate(true)})
	save_all(list)
	return nm

static func delete_one(i: int) -> void:
	var list := load_all()
	if i >= 0 and i < list.size(): list.remove_at(i)
	save_all(list)
