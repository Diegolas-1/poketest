class_name AshParty
extends RefCounted
# Where Ash's Pokémon come from, for the ones that walk with him (ash_companions.gd)
# and the ambushes' battles (ambush.gd). The main game has no party of its own yet
# (a catching worker will add one): the first source that answers wins.
#   AshParty.source       a Callable(game) -> Array set by whatever keeps the real
#                         party (the catching work hooks in here)
#   the arena             in the Battle Arena: the TRAINER page's party (arena_menu.gd)
#   --party=a:lv,b:lv     dev: a party on the command line
#   has_starter           a save with the starter flag: his Pikachu (battle_pkmn.gd's)
#   (none)                no party: the prologue's rules
#
#   AshParty.members(game) -> [{species, level, known?, equip?}]   (the engine's dicts)

static var source: Callable = Callable()

# the caught party (battle/pkmn_store.gd) is the source unless something else set one
static func _static_init() -> void:
	if not source.is_valid(): source = PkmnStore.party_source

static func members(game: Node) -> Array:
	if source.is_valid():
		var v = source.call(game)
		if v is Array and not (v as Array).is_empty(): return v
	var ar = BattleArena.I
	if ar != null and ar.menu != null:
		var s: Dictionary = ar.menu.setup
		return (s.get("ash", []) as Array).map(func(m): return ArenaSetups.mon(m))
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--party="):
			var out := []
			for x in a.substr(8).split(","):
				out.append({"species": x.get_slice(":", 0), "level": int(x.get_slice(":", 1)) if x.contains(":") else 10})
			return out
	var q = _quests(game)
	if q != null and q.flag("has_starter"):
		var p: Dictionary = BattlePkmn.DEFAULT_PARTNER.duplicate(true)
		return [p]
	return []

static func _quests(game: Node):
	if game == null: return null
	var c = game.get("cast")
	if c == null or c.life == null: return null
	return c.life.quests

static func name_of(m: Dictionary) -> String:
	return String(m.get("name", BattleEnergy.species_data(String(m.species)).get("name", String(m.species).capitalize())))
