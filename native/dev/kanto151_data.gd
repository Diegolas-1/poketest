class_name Kanto151Data
extends RefCounted
# Puts the Kanto 151 dataset (life/kanto151.json, life/moves_kanto.json, built by
# tools/native/kanto151/gen.py) into the energy v2 engine without touching it:
# BattleEnergy's species data becomes kanto151.json (same schema as pokemon.json),
# its moves become moves.json with moves_kanto.json merged over it by id, and
# BattleConfig gets the dataset's per-species focus, per-move disruption steps
# and the extra counter rows (kanto151_balance.json counter_rows_extra) as an
# override. For tests and the battle simulator:
#   Kanto151Data.install()    # then PkmnBattle.new({...}) with any of the 151
#   Kanto151Data.uninstall()  # back to pokemon.json / moves.json and the plain config

const SPECIES_PATH := "res://life/kanto151.json"
const MOVES_PATH := "res://life/moves_kanto.json"
const BALANCE_PATH := "res://life/kanto151_balance.json"

static var installed := false

static func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var v = JSON.parse_string(FileAccess.get_file_as_string(path))
	return v if v is Dictionary else {}

static func install() -> bool:
	var sp := _load(SPECIES_PATH)
	var mv := _load(MOVES_PATH)
	var bal := _load(BALANCE_PATH)
	if sp.is_empty() or mv.is_empty(): return false
	uninstall()
	var moves: Dictionary = _load(BattleEnergy.MOVES_PATH).get("moves", {}).duplicate(true)
	moves.merge(mv.get("moves", {}), true)
	BattleEnergy._pk = sp
	BattleEnergy._mv = moves
	var focus := {}
	for id in sp.get("species", {}):
		var fp = sp.species[id].get("focus_profile", null)
		if fp is Dictionary: focus[id] = fp
	var disrupt := {}
	for id in mv.get("moves", {}):
		var d := int(mv.moves[id].get("disrupt", 0))
		if d > 0: disrupt[id] = d
	var rows: Array = BattleConfig.sect("counters").get("rows", []).duplicate(true)
	for r in bal.get("counter_rows_extra", []): rows.append(r)
	BattleConfig.override({"focus": {"species": focus}, "disruption": {"moves": disrupt}, "counters": {"rows": rows}})
	installed = true
	return true

static func uninstall() -> void:
	BattleConfig.reset()
	# (not BattleEnergy.reload(): on a class name that resolves to Script.reload())
	BattleEnergy._pk = {}
	BattleEnergy._mv = {}
	installed = false

static func species_ids() -> Array:
	return BattleEnergy.data().get("species", {}).keys()
