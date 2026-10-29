class_name Kanto151Data
extends RefCounted
# The Kanto 151 dataset (life/kanto151.json, life/moves_kanto.json, built by
# tools/native/kanto151/gen.py) is the engine's default now: BattleEnergy merges it
# over pokemon.json and moves.json, reads each species' focus_profile and each move's
# disrupt, and battle_config carries its counter rows. This helper stays for tests
# and the battle simulator, to make sure that dataset is the live one:
#   Kanto151Data.install()    # BattleEnergy.set_dataset("kanto")
#   Kanto151Data.uninstall()  # back to the v1 fixtures (pokemon.json, moves.json alone)

static var installed := false

static func install() -> bool:
	BattleEnergy.set_dataset("kanto")
	installed = not BattleEnergy.species_data("mewtwo").is_empty()
	return installed

static func uninstall() -> void:
	BattleEnergy.set_dataset("v1")
	installed = false

static func species_ids() -> Array:
	return BattleEnergy.data().get("species", {}).keys()
