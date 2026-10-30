extends Node
# Dev only: the Battle Arena's regions and its forest, headless (arena/arena_regions.gd,
# arena/arena_region.gd, arena/regions/forest.gd and forest_life.gd, wild/wild_arena_trees.gd).
#   godot --headless --path native res://dev/forest_test.tscn
# The regions load and the hub is as it was (its ground, its tall grass, its hunt's
# patches, its fence but for the new gate); the forest's hunt hides its tree species in
# the canopies (on their slots, up in the crowns) and Weedle in its own tall grass; a
# shake brings a cocoon down into a battle and flushes a perched bird; a pebble hardens
# a cocoon; the hive is provoked by Ash walking up upright (not crouched), the swarm
# catches him into a battle; the nest's parent lets a crouched Ash be and dives at him
# upright; a shaken Kakuna's tree can rouse the hive. Prints PASS / FAIL lines and
# "FOREST TEST GREEN".

var main: Node
var W: Wild
var A: BattleArena
var L                       # the forest's life
var fails := 0
var checks := 0
var phase := 0
var pt := 0.0
var e: Dictionary = {}
var tr: Dictionary = {}
var mem := {}

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c: fails += 1
	print(("PASS " if c else "FAIL ") + what)

func _ready() -> void:
	Wild.battle_override = Wild.STUB
	main = load("res://main.tscn").instantiate()
	add_child(main)

# the hub's ground as it was before the regions (the old ArenaData.ground)
static func old_ground(x: float, z: float) -> float:
	var d := maxf(absf(x) - 12.0, 0.0) + maxf(absf(z) - 16.0, 0.0)
	var roll := 0.22 * sin(x * 0.11 + z * 0.07) + 0.16 * sin(z * 0.13 - x * 0.05 + 1.3) + 0.08 * sin(x * 0.31 + 0.7) * cos(z * 0.27)
	var k := clampf(d / 10.0, 0.0, 1.0)
	k = k * k * (3.0 - 2.0 * k)
	return roll * k

func _place(p: Vector3, yaw := 0.0) -> void:
	p.y = main.world.height_at(p.x, p.z)
	main.pos = p; main.yaw = yaw; main.speed = 0.0
	main.cast.land(p.y)
	main.cam_yaw = yaw + PI

func _next() -> void:
	phase += 1; pt = 0.0

func _tree_with(role: String, species := "") -> Dictionary:
	for t in L.src.trees:
		for s in t.slots:
			var x = s.e
			if x is Dictionary and W.encs.has(x) and String(s.kind) == role and String(x.state) == "hidden" and (species == "" or String(x.species) == species):
				e = x
				return t
	return {}

func _process(dt: float) -> void:
	if main == null or main.cast == null or main.cast.get("wild") == null: return
	W = main.cast.wild
	pt += dt
	match phase:
		0:
			if pt < 0.5: return
			W.tut.done = true
			W.cooldown = 999.0
			main.cast.clock.real = false; main.cast.clock.set_time(11.0)
			BattleArena.enter(main, true)
			_next()
		1:
			if BattleArena.I == null or pt < 1.0: return
			A = BattleArena.I
			var defs := ArenaRegions.all()
			ok(defs.any(func(d): return String(d.id) == "forest"), "the regions load (%s)" % ", ".join(defs.map(func(d): return String(d.id))))
			ok(A.regions.has("forest") and A.life_of("forest") != null, "the forest is built, with its life")
			L = A.life_of("forest")
			L.auto_hunt = false
			var R = A.regions.forest
			ok(R.trees.size() > 60 and R.search.size() >= 8, "a grove of %d trees, %d to search" % [R.trees.size(), R.search.size()])
			ok(W.sources.has(L.src), "the tree source is one of wild.gd's")
			# the hub as it was
			ok(ArenaData.TALL.size() == 7 and ArenaData.zone_patches("hub") == [0, 1, 2, 3, 4, 5, 6], "the hub's tall grass is its own seven patches")
			ok(W.arena_src.ids() == [0, 1, 2, 3, 4, 5, 6], "the hub's hunt uses them")
			var same := true
			var r := RandomNumberGenerator.new(); r.seed = 7
			for i in 400:
				var x := r.randf_range(-47.0, 47.0); var z := r.randf_range(-47.0, 47.0)
				if absf(ArenaData.ground(x, z) - old_ground(x, z)) > 1e-5: same = false
			ok(same, "the hub's ground is unchanged inside its fence")
			ok(ArenaData.walkable(0, 0) and ArenaData.walkable(40, 40) and not ArenaData.walkable(0, -46.2) and not ArenaData.walkable(30, -46.2), "the hub's fence still holds")
			ok(ArenaData.walkable(14, -46.2) and ArenaData.walkable(14, -80), "the forest's gate and grove are walkable")
			ok(ArenaData.region_at(0, 0) == "" and ArenaData.region_at(14, -80) == "forest", "regions by place")
			ok(A.data.dirt_sd(14, -47) < 0.0 and A.data.dirt_sd(12.5, -30) < 0.0, "a path runs from the hub to the gate")
			# the forest's hunt
			A.go_region("forest", Callable(), true)
			_next()
		2:
			if pt < 0.6: return
			ok(A.region_now() == "forest" and L.inside, "in the forest (%s)" % A.region_now())
			var h := ArenaSetups.default_hunt()
			var fd := ArenaRegions.get_def("forest")
			h.species = ["weedle", "kakuna", "metapod", "pidgey", "spearow", "caterpie", "kakuna", "metapod"]
			h.count = 12
			h.lv = [3, 7]
			h.region = "forest"
			A.hunt.start(h, ArenaSetups.preset_party("ash").slice(0, 2), true)
			var es: Array = W.encs.filter(func(x): return bool(x.hunt))
			var up := 0; var canopy := true; var grass := 0; var grass_ok := true
			for x in es:
				var n: Node3D = x.node
				if String(x.species) == "weedle":
					grass += 1
					if not W.arena_src.contains(n.position) or W.arena_src.zone != "forest": grass_ok = false
					continue
				if not bool(x.get("aloft", false)): canopy = false; continue
				up += 1
				var t: Dictionary = L.src.trees[int(x.tree)]
				var hgt: float = n.position.y - main.world.height_at(n.position.x, n.position.z)
				var hd: float = Vector2(n.position.x - t.at.x, n.position.z - t.at.z).length()
				if hgt < 1.6 or hgt > 9.0 or hd > float(t.cr) + 0.5: canopy = false
				if WildArenaTrees.role_of(String(x.species)) != String(x.role): canopy = false
			ok(es.size() >= 10, "the forest's hunt hides %d" % es.size())
			ok(up >= 7 and canopy, "the tree species sit in the canopies, on their own slots (%d up)" % up)
			ok(grass >= 1 and grass_ok, "Weedle in the forest's own tall grass (%d)" % grass)
			ok(WildArenaTrees.role_of("kakuna") == "hang" and WildArenaTrees.role_of("pidgey") == "perch" and WildArenaTrees.role_of("caterpie") == "crawl", "cocoons hang, birds perch, caterpillars crawl")
			ok(fd.get("sources", {}).get("tall_grass", []).has("weedle"), "the forest's def names its species")
			# the search: standing still under a tree with a cocoon, he looks up
			tr = _tree_with("hang")
			L.test_odds = 0.0
			var to_trunk := ((e.node as Node3D).position - (tr.at as Vector3)); to_trunk.y = 0
			_place((tr.at as Vector3) + to_trunk.normalized() * (float(tr.trunk) + 1.0), 0.0)
			e.alert = 0.0
			_next()
		3:
			e.alert = 0.0
			if pt < 1.2: return
			ok(not L.look.is_empty() and L.look.e == e, "still under its tree, he looks up at the %s" % e.species)
			ok(float(main.cast.player.look_pitch) > 0.2, "his head tilts up (%.2f)" % float(main.cast.player.look_pitch))
			ok(not L.prompt.is_empty() and String(L.prompt.kind) == "shake", "by the trunk: SHAKE THE TREE")
			# a pebble first: it hardens, it stays
			mem.loose = float(e.get("loosened", 0.0))
			L.throw_pebble(tr, e)
			_next()
		4:
			e.alert = 0.0
			if pt < 1.6: return
			ok(L.log.has("pebble") and float(e.get("loosened", 0.0)) >= float(mem.loose) + 0.3 and bool(e.get("aloft", false)), "a pebble hardens the %s, which hangs on" % e.species)
			# the shake brings it down
			e.loosened = 1.0
			Wild.STUB.outcome = "ran"; Wild.STUB.extra = {}
			mem.sp = String(e.species)
			W.use_pressed()
			_next()
		5:
			if L.log.has("battle " + String(mem.sp)) or pt > 4.0:
				ok(L.log.has("shake") and L.log.has("drop " + String(mem.sp)), "A by the trunk shakes it, the %s drops" % mem.sp)
				ok(L.log.has("battle " + String(mem.sp)) and String(Wild.STUB.last.get("species", "")) == String(mem.sp), "it lands and the battle starts")
				ok(not bool(e.get("aloft", false)) and e.get("slot") == null, "off its thread for good")
				_next()
		6:
			if W.battle_on or pt < 0.8: return
			# a perched bird: the shake flushes it
			tr = _tree_with("perch")
			if tr.is_empty(): ok(false, "a perched bird to flush"); _next(); _next(); return
			_place((tr.at as Vector3) + Vector3(float(tr.trunk) + 1.0, 0, 0), -PI / 2.0)
			mem.bird = e
			L.shake(tr)
			_next()
		7:
			var b: Dictionary = mem.bird
			if String(b.state) in ["fleeing", "flying"] or pt > 3.0:
				ok(String(b.state) in ["fleeing", "flying"] and not bool(b.get("aloft", false)), "a shake flushes the perched %s (%s)" % [b.species, b.state])
				_next()
		8:
			if pt < 0.3: return
			# the hive: walking up upright provokes it
			var hv: Dictionary = L.hive
			ok(not hv.is_empty() and hv.bees.size() >= 3, "a hive with %d Beedrill on patrol" % hv.bees.size())
			main.cast.set_crouch(true)
			_place((hv.base as Vector3) + Vector3(-5.0, 0, -2.5), 0.0)
			L.provoked.connect(func(why, _at): mem.sig = why, CONNECT_ONE_SHOT)
			hv.k = 0.0
			_next()
		9:
			if pt < 3.0: return
			ok(L.swarm.is_empty() and float(L.hive.k) < 0.6, "crouched by it, the hive stays calm (%.2f)" % float(L.hive.k))
			main.cast.set_crouch(false)
			_next()
		10:
			if L.log.any(func(s): return String(s).begins_with("provoked: came too close")) or pt > 6.0:
				ok(L.log.any(func(s): return String(s).begins_with("provoked: came too close")) and not L.swarm.is_empty(), "upright by it, the hive is provoked")
				ok(String(mem.get("sig", "")) != "", "the provoked hook fires (%s)" % mem.get("sig", ""))
				Wild.STUB.outcome = "ran"
				_next()
		11:
			if L.log.has("swarm ambush") or L.log.has("swarm battle") or pt > 14.0:
				var am = W.get("ambush")
				ok(L.log.has("swarm ambush") and am != null and String(am.cur.get("species", "")) == "beedrill" and (am.cur.members as Array).size() == 3 and am.log.any(func(x): return String(x.what) == "strike"),
					"standing his ground, the swarm catches him: the ambush system's three Beedrill strike")
				if am: am.clear()
				_next()
		12:
			if W.battle_on or Battle.active or not L.swarm.is_empty() and String(L.swarm.phase) != "home" or pt < 1.0: return
			# the nest: crouched he may watch it, upright too close the parent dives
			var ns: Dictionary = L.nest
			ok(not ns.is_empty() and ns.chicks.size() >= 1, "a nest with %d chicks and a %s" % [ns.chicks.size(), ns.species])
			main.cast.set_crouch(true)
			_place((ns.base as Vector3) + (ns.dir as Vector3) * 3.4, 0.0)
			_next()
		13:
			if pt < 2.5: return
			ok(String(L.nest.state) == "watch", "crouched nearby: the parent watches (%s)" % L.nest.state)
			main.cast.set_crouch(false)
			_next()
		14:
			if L.log.has("nest battle") or pt > 5.0:
				ok(L.log.any(func(s): return String(s).begins_with("nest disturbed")) and L.log.has("nest battle"), "upright too close, the parent dives at him")
				ok(String(Wild.STUB.last.get("species", "")) == String(L.nest.species), "and the battle is with it (%s)" % Wild.STUB.last.get("species", ""))
				_next()
		15:
			if W.battle_on or pt < 1.2: return
			ok(String(L.nest.state) in ["calm", "watch"] and (L.nest.parent as Node3D).visible and (L.nest.parent as Node3D).position.distance_to(L.nest.rim) < 0.1, "then it flies home to its nest")
			# a shaken Kakuna's tree rouses the hive (forced odds)
			L.hive.cool = 0.0
			L.swarm = {}
			tr = _tree_with("hang", "kakuna")
			if tr.is_empty():
				# (one more Kakuna settled for it)
				var p = L.src.random_spot(RandomNumberGenerator.new(), [], Vector3(INF, 0, INF), 0.0, "kakuna")
				if p != null:
					var x := W.spawn("kakuna", L.src, p, "timid")
					L.src.settle(x, p)
				tr = _tree_with("hang", "kakuna")
			L.test_odds = 1.0
			if not tr.is_empty(): L.shake(tr)
			_next()
		16:
			if pt < 0.5: return
			ok(L.log.any(func(s): return String(s).begins_with("provoked: a Kakuna's tree shaken")), "a shaken Kakuna's tree can rouse the hive")
			A.hunt.stop(false)
			ok(W.arena_src.zone == "hub" and not L.src.on, "the hunt over, the sources back to the hub's")
			_finish()

func _finish() -> void:
	phase = 99
	print("forest_test: %d checks, %d failures" % [checks, fails])
	print("FOREST TEST GREEN" if fails == 0 else "FOREST TEST RED")
	get_tree().quit(0 if fails == 0 else 1)
