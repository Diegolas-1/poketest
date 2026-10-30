extends RefCounted
# The Battle Arena's forest (arena/arena_regions.gd loads every file here): a
# small Viridian Forest, through the hub's north gate. A showcase of the forest
# palette (props/forest/: logs, stumps, ferns, mushrooms, litter, sun shafts,
# the hive, the nest) and of its ecosystem (arena/regions/forest_life.gd):
#   tall grass   Weedle stalked in the clearings (the hub's tall-grass rules)
#   trees        Kakuna and Metapod hang as cocoons, Pidgey and Spearow perch up
#                high, Caterpie crawl along the branches (wild/wild_arena_trees.gd):
#                looked for, then flushed by a shake of the trunk or a pebble
#   the hive     a Beedrill hive hanging from a big tree: a danger zone
#   the nest     a Pidgey nest in a fork, its parent on guard
# Everything in metres from the arena's centre (ArenaData.C), x east, z south.
# A new region is a new file like this one (a cave, a beach, a night meadow):
# its bounds, gate, ground, paths, tall grass, props, sources and species.

static func def() -> Dictionary:
	return {
		"id": "forest",
		"name": "Viridian Forest",
		"sign": "VIRIDIAN FOREST",
		"sub": "Bug Pokémon hide in the trees",
		"blurb": "Kakuna and Metapod hang in the branches, birds perch up high, Weedle in the grass. Mind the hive.",
		"order": 1,
		# x0, z0, x1, z1: the region's ground (no hills inside), and where Ash may walk
		"rect": [-24.0, -124.0, 52.0, -47.0],
		"walk": [-21.0, -120.5, 49.0, -49.6],
		# the gate in the hub's fence: its side (n | e | w) and where along it
		"gate": {"side": "n", "u": 14.0, "half": 2.2},
		"board": Color(0.2, 0.36, 0.2),
		# the grove's trunks a warmer brown and its leaves a deeper green than the meadow's trees
		"tint": {"bark": Color(0.82, 0.7, 0.58), "leaf": Color(0.8, 0.9, 0.74)},
		# the way there from the hub's paths: points (local) to the gate
		"link": [[8.0, -13.8], [12.0, -30.0], [14.0, -46.5]],
		# where the menu's GO puts him (just inside, facing in)
		"spawn": [14.0, -53.5],
		"yaw": PI,
		# the ground: the grass's tint, how dense the short grass is under the trees,
		# the dirt's palette (the terrain shader's), how much the floor rolls
		"ground": {"tint": Color(0.25, 0.37, 0.17), "moss": Color(0.21, 0.31, 0.14), "dens": 0.07, "roll": 1.6,
			"dirt": {"d_mid": Color(0.55, 0.4, 0.27), "d_light": Color(0.64, 0.5, 0.34), "d_edge": Color(0.45, 0.34, 0.23),
				"d_dark": Color(0.3, 0.2, 0.13), "d_pale": Color(0.62, 0.52, 0.38)}},
		# the trail: [a, b, half width], from the gate winding north to the far clearing,
		# and a spur to the hive's tree (the brave way)
		"paths": [
			[Vector2(14.0, -44.0), Vector2(13.0, -58.0), 1.25], [Vector2(13.0, -58.0), Vector2(7.0, -70.0), 1.15],
			[Vector2(7.0, -70.0), Vector2(11.0, -84.0), 1.1], [Vector2(11.0, -84.0), Vector2(4.0, -97.0), 1.05],
			[Vector2(4.0, -97.0), Vector2(10.0, -110.0), 1.0], [Vector2(11.0, -84.0), Vector2(26.0, -90.0), 0.85],
			[Vector2(13.0, -58.0), Vector2(27.0, -66.0), 0.75]],
		# tall grass in the clearings: [x, z, half x, half z] (the Weedle's)
		"tall": [[-6.0, -76.0, 7.5, 6.0], [33.0, -95.0, 7.0, 6.5], [18.0, -112.0, 6.5, 4.5]],
		# the clearings kept open of trees (x, z, r): the tall grass, the hive's glade, the nest's
		"clear": [[-6.0, -76.0, 10.0], [33.0, -95.0, 9.5], [18.0, -112.0, 8.0], [34.0, -64.0, 6.5], [-9.0, -100.0, 4.5]],
		# the palette (props/forest/): how many of each, scattered off the trail
		"props": {"trees": 46, "border": 1, "palette": 5, "max_tris": 7000, "search": 14, "bushes": 70, "ferns": 150, "logs": 7, "stumps": 9,
			"mushrooms": 26, "litter": 1600, "shafts": 16, "rocks": 10, "flowers": 40},
		# the encounter sources and their species (the default hunt)
		"sources": {"tall_grass": ["weedle"], "tree": ["kakuna", "metapod", "pidgey", "spearow", "caterpie"]},
		"left": "IN THE FOREST",
		# the REGIONS page's AMBUSH: a Beedrill in a thicket by the trail (wild/ambush.gd)
		"ambush": {"species": "beedrill", "n": 2, "level": 10},
		"hunt_text": "%d Pokémon are hiding in %s. Look up into the trees, and stalk the grass.",
		"signs": [{"at": [22.5, -60.5], "yaw": -0.9, "text": "DANGER!\nBEEDRILL", "board": "f6d24a", "stripe": "1f2440"},
			{"at": [10.6, -52.5], "yaw": 0.4, "text": "VIRIDIAN\nFOREST", "board": "f3ead6", "stripe": "2f5d34"}],
		"hunt": {"species": ["weedle", "kakuna", "weedle", "metapod", "pidgey", "kakuna", "spearow", "caterpie"], "count": 10, "lv": [3, 8], "temper": "species"},
		# its features: the hive (x, z of its tree; the danger radii) and the nest
		"hive": {"at": [36.0, -63.0], "h": 5.4, "warn": 13.0, "provoke": 7.5, "patrol": 3},
		"nest": {"at": [-9.5, -101.0], "h": 3.4, "guard": "pidgeotto", "chicks": 2, "eggs": 2, "warn": 8.0, "disturb": 4.2},
		"life": "res://arena/regions/forest_life.gd",
		"ambience": {"bed": "amb_forest", "birds": 0.7},
	}
