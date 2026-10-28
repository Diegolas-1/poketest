class_name BattleConfig
extends RefCounted
# The one place the energy system and the Pokemon battle read their tunable
# numbers from: life/battle_config.json (design/energy_system.md, "Config").
# Logic never hardcodes a balance number; it asks here.
#
#   BattleConfig.num("focus", "gain", 10.0)        # a number, with a fallback
#   BattleConfig.sect("decay")                     # a whole section (Dictionary)
#   BattleConfig.focus_for(species, types)         # focus params with type and species overrides merged
#   BattleConfig.override(dict)                    # tests: patch values (deep merge); reset() undoes it

const PATH := "res://life/battle_config.json"

static var _c := {}
static var _patch := {}

static func data() -> Dictionary:
	if _c.is_empty():
		if FileAccess.file_exists(PATH):
			var v = JSON.parse_string(FileAccess.get_file_as_string(PATH))
			if v is Dictionary: _c = v
		if not _patch.is_empty(): _merge(_c, _patch)
	return _c

static func reload() -> void:
	_c = {}

# tests: deep-merge values over the file (kept across reloads until reset())
static func override(d: Dictionary) -> void:
	_merge(_patch, d.duplicate(true))
	_c = {}

static func reset() -> void:
	_patch = {}
	_c = {}

static func _merge(into: Dictionary, from: Dictionary) -> void:
	for k in from:
		if from[k] is Dictionary and into.get(k, null) is Dictionary: _merge(into[k], from[k])
		else: into[k] = from[k]

static func sect(name: String) -> Dictionary:
	var v = data().get(name, {})
	return v if v is Dictionary else {}

static func num(section: String, key: String, def := 0.0) -> float:
	var v = sect(section).get(key, def)
	return float(v) if (v is float or v is int) else def

static func val(section: String, key: String, def = null):
	return sect(section).get(key, def)

# the focus parameters for a species: the defaults, then its types', then its own
const FOCUS_KEYS := ["gain", "step", "chip_cap", "start", "typed_pool_cap", "disrupt_resist", "alert"]

static func focus_for(species: String, types: Array) -> Dictionary:
	var F := sect("focus")
	var out := {"gain": float(F.get("gain", 10)), "step": float(F.get("step", 20)), "chip_cap": int(F.get("chip_cap", 5)),
		"start": float(F.get("start", 20)), "typed_pool_cap": int(F.get("typed_pool_cap", 3)), "disrupt_resist": 0.0, "alert": true}
	var by_type: Dictionary = F.get("by_type", {})
	for t in types:
		var o = by_type.get(String(t), {})
		if o is Dictionary:
			for k in o: out[k] = o[k]
	var sp = F.get("species", {}).get(species, {})
	if sp is Dictionary:
		for k in sp: out[k] = sp[k]
	return out
