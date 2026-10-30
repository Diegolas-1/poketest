class_name PkmnStore
extends RefCounted
# Ash's Pokémon and his Poké Balls between battles: the party (up to six), the
# PC box behind it, the Pokédex's seen and caught flags, and the bag's balls
# (counts per ball type). Saved as JSON like quests.save.
#   PkmnStore.main()     the game's: user://pkmn.save
#   PkmnStore.arena()    the Battle Arena's, kept apart: user://arena_pkmn.save
#                        (its balls unlimited unless a setup says otherwise)
#   PkmnStore.new(path)  any other ("" = in memory only: tests)
#
#   s.balls() -> [{id, name, n}]     what the bag holds (n -1: unlimited)
#   s.use_ball(id) -> bool           one spent
#   s.stock_once()                   the start bag (battle_config catch.start_bag), once
#   s.can_take() -> bool             room in the party or the PC
#   s.ensure_party(list)             an empty party takes these (the battle's team)
#   s.add_caught(mon) -> "party" | "box" | ""   and marks the dex
#   s.mark_seen(id) / s.is_seen(id) / s.is_caught(id)
#   s.save() / s.load_state()
# A mon: {species, level, hp, max_hp, status, ball, ot}

const MAIN_PATH := "user://pkmn.save"
const ARENA_PATH := "user://arena_pkmn.save"

static var _main: PkmnStore = null
static var _arena: PkmnStore = null

var path := ""
var party: Array = []
var box: Array = []
var dex := {"seen": {}, "caught": {}}
var bag := {}
var stocked := false
var unlimited := false            # (not saved: the arena's staging option)

static func main() -> PkmnStore:
	if _main == null: _main = PkmnStore.new(MAIN_PATH)
	return _main

static func arena() -> PkmnStore:
	if _arena == null:
		_arena = PkmnStore.new(ARENA_PATH)
		_arena.unlimited = true
	return _arena

# tests: forget the loaded ones (the next main() / arena() reads the files again)
static func forget() -> void:
	_main = null
	_arena = null

func _init(p := "") -> void:
	path = p
	load_state()

static func C() -> Dictionary: return BattleConfig.sect("catch")
func party_max() -> int: return int(C().get("party_max", 6))
func box_cap() -> int: return int(C().get("box_max", 20)) * int(C().get("boxes", 12))

# ---------- the bag ----------
func count(id: String) -> int:
	return -1 if unlimited else int(bag.get(id, 0))

func balls() -> Array:
	var out := []
	for id in CatchRules.ball_ids():
		var n := count(String(id))
		if n != 0: out.append({"id": String(id), "name": CatchRules.ball_name(String(id)), "n": n})
	return out

func has_balls() -> bool: return not balls().is_empty()

func use_ball(id: String) -> bool:
	if unlimited: return true
	var n := int(bag.get(id, 0))
	if n <= 0: return false
	if n == 1: bag.erase(id)
	else: bag[id] = n - 1
	save()
	return true

func give(id: String, n := 1) -> void:
	bag[id] = int(bag.get(id, 0)) + n
	save()

func stock_once() -> void:
	if stocked: return
	stocked = true
	var sb = C().get("start_bag", {})
	if sb is Dictionary:
		for id in sb: bag[String(id)] = int(bag.get(String(id), 0)) + int(sb[id])
	save()

# ---------- the party and the PC ----------
func can_take() -> bool:
	return party.size() < party_max() or box.size() < box_cap()

func ensure_party(list: Array) -> void:
	if not party.is_empty(): return
	for d in list.slice(0, party_max()):
		if d is Dictionary: party.append(_mon(d))
	save()

func _mon(d: Dictionary) -> Dictionary:
	var m := {"species": String(d.get("species", "")), "level": int(d.get("level", 5)), "ot": String(d.get("ot", "Ash"))}
	for k in ["hp", "max_hp", "status", "ball", "known", "equip"]:
		if d.has(k): m[k] = d[k]
	return m

func add_caught(d: Dictionary) -> String:
	if not can_take(): return ""
	var m := _mon(d)
	var to := "party"
	if party.size() < party_max(): party.append(m)
	else:
		box.append(m)
		to = "box"
	dex.seen[m.species] = true
	dex.caught[m.species] = true
	save()
	return to

# which PC box (1..) the last one sent there is in
func last_box() -> int:
	return maxi(0, box.size() - 1) / maxi(1, int(C().get("box_max", 20))) + 1

func mark_seen(id: String) -> void:
	if id == "" or dex.seen.has(id): return
	dex.seen[id] = true
	save()

func is_seen(id: String) -> bool: return dex.seen.has(id)
func is_caught(id: String) -> bool: return dex.caught.has(id)

# ---------- saving ----------
func to_dict() -> Dictionary:
	return {"v": 1, "party": party, "box": box, "dex": dex, "bag": bag, "stocked": stocked}

func from_dict(v: Dictionary) -> void:
	party = v.get("party", []) if v.get("party") is Array else []
	box = v.get("box", []) if v.get("box") is Array else []
	var dx = v.get("dex", {})
	dex = {"seen": dx.get("seen", {}) if dx is Dictionary and dx.get("seen") is Dictionary else {},
		"caught": dx.get("caught", {}) if dx is Dictionary and dx.get("caught") is Dictionary else {}}
	bag = {}
	var b = v.get("bag", {})
	if b is Dictionary:
		for k in b: bag[String(k)] = int(b[k])
	stocked = bool(v.get("stocked", false))
	for list in [party, box]:
		for m in list:
			if m is Dictionary and m.has("level"): m.level = int(m.level)

func save() -> void:
	if path == "": return
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify(to_dict()))
	f.close()

func load_state() -> void:
	from_dict({})
	if path == "" or not FileAccess.file_exists(path): return
	var v = JSON.parse_string(FileAccess.get_file_as_string(path))
	if v is Dictionary: from_dict(v)
