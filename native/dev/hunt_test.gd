extends Node
# Dev only: the Battle Arena's hunt, headless (arena/arena_hunt.gd, wild/wild_arena_grass.gd,
# wild/wild.gd).
#   godot --headless --path native res://dev/hunt_test.tscn
# The arena's source fires only in the arena with a hunt on, Route 1's never there;
# START HUNT populates N hidden through the patches (all deep in tall grass, spread
# out, none by Ash, the species evenly), with no luring on top; several at once
# twitch the grass; who flies and who runs; a runner startled runs low to another
# patch; the battle gets the hunt's level and party (or the prologue alone); beaten
# by his party one leaves the field and the counter goes down; the tutorial never
# starts. Prints PASS / FAIL lines and "HUNT TEST GREEN".

var main: Node
var W: Wild
var H
var fails := 0
var checks := 0
var phase := 0
var pt := 0.0
var log := {}
var e: Dictionary = {}

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c: fails += 1
	print(("PASS " if c else "FAIL ") + what)

func _ready() -> void:
	Wild.battle_override = Wild.STUB
	_rules()
	main = load("res://main.tscn").instantiate()
	add_child(main)

# ---------- no world ----------
func _rules() -> void:
	var b := WildBrain.new()
	ok(WildBrain.flies("pidgey") and WildBrain.flies("zubat") and WildBrain.flies("haunter") and WildBrain.flies("koffing"), "Pidgey, Zubat, Haunter and Koffing fly or float")
	ok(not WildBrain.flies("rattata") and not WildBrain.flies("doduo") and not WildBrain.flies("caterpie") and not WildBrain.flies("gengar"), "Rattata, Doduo, Caterpie and Gengar run")
	var ri := b.info("rattata")
	ok(not bool(ri.flee.fly) and float(ri.flee.speed) >= 4.0 and not ri.flee.safe.has("tree"), "a runner's flee: on foot (%.1f m/s), no trees" % float(ri.flee.speed))
	ok(b.info("pidgey").flee == b.sp("pidgey").flee and b.info("pidgey").temper == b.sp("pidgey").temper, "Pidgey keeps its own data")
	ok(b.info("geodude").temper.aggressive > b.info("pidgey").temper.aggressive, "a rock type leans aggressive")
	ok(String(b.info("rattata").get("name", "")) == "Rattata", "names come from the dex")

func _place(p: Vector3, yaw: float) -> void:
	p.y = main.world.height_at(p.x, p.z)
	main.pos = p; main.yaw = yaw; main.speed = 0.0
	main.cast.land(p.y)
	main.cam_yaw = yaw + PI

func _process(dt: float) -> void:
	if main == null or main.cast == null or main.cast.get("wild") == null: return
	W = main.cast.wild
	pt += dt
	match phase:
		0:
			if pt < 0.5: return
			W.tut.done = false   # (it must stay off in the arena anyway)
			W.tut.forced = false
			W.cooldown = 999.0
			main.cast.clock.real = false; main.cast.clock.set_time(11.0)
			var r1 := Vector3(-13.0, 0, -95.0)
			ok(W.arena_src.region(r1) == "", "the arena's source is silent on Route 1")
			BattleArena.enter(main, true)
			_next()
		1:
			if BattleArena.I == null or pt < 1.0: return
			H = BattleArena.I.hunt
			var me: Vector3 = main.pos
			ok(W.sources[0].region(me) == "", "Route 1's source is silent in the arena")
			ok(W.arena_src.region(me) == "", "and the arena's too with no hunt on")
			ok(W.tut.state == "off", "the tutorial did not start in the arena")
			# the touch A by the referee opens the staging menu (cast.gd routes it)
			if not log.has("ref"):
				log.ref = true
				_place(BattleArena.I.referee_spot() + Vector3(1.2, 0, 0), -PI / 2.0)
				main.cast._btn_a = true
				return
			ok(BattleArena.I.menu.is_open(), "A by the referee opens the staging menu")
			BattleArena.I.menu.close_now()
			_place(main.world.meta.spawn_v if main.world.meta.has("spawn_v") else Vector3(main.world.meta.spawn[0], 0, main.world.meta.spawn[2]), PI)
			var h := ArenaSetups.default_hunt()
			h.species = ["pidgey", "rattata", "caterpie"]
			h.count = 9
			h.lv = [5, 9]
			H.start(h, ArenaSetups.preset_party("ash").slice(0, 2), true)
			_next()
		2:
			var es: Array = W.encs.filter(func(x): return bool(x.hunt))
			ok(es.size() == 9 and H.left() == 9, "START HUNT hides 9 (%d)" % es.size())
			ok(W.arena_src.region(main.pos) == "arena", "the arena's source is on with the hunt")
			var deep := true
			var gap := INF
			var near_ash := INF
			var per := {}
			var lv_ok := true
			for a in es:
				var p: Vector3 = a.node.position
				if not W.arena_src.good(p) or not W.arena_src.contains(p): deep = false
				near_ash = minf(near_ash, Wild._d2(p, main.pos))
				per[a.species] = int(per.get(a.species, 0)) + 1
				if int(a.level) < 5 or int(a.level) > 9: lv_ok = false
				for b in es:
					if a != b: gap = minf(gap, Wild._d2(p, b.node.position))
			ok(deep, "every one is deep in visibly tall grass")
			ok(gap >= 3.0, "no two closer than 3 m (closest %.1f m)" % gap)
			ok(near_ash >= 9.0, "none by Ash's start (nearest %.1f m)" % near_ash)
			ok(per.values().all(func(n): return n == 3), "the species dealt evenly %s" % str(per))
			var patches := {}
			for a in es: patches[W.arena_src.patch_of(a.node.position)] = true
			ok(patches.size() >= 4, "spread over %d patches" % patches.size())
			ok(lv_ok, "levels within 5-9")
			# no luring on top of the field
			W.cooldown = 0.0
			W.test_force = "spawn"
			log.n0 = W.encs.size()
			_next()
		3:
			# stand still: several twitch the grass in turn; no lured extra
			for a in W.encs: if float(a.burst) > 0.0: log["tw_" + str(a.node.get_instance_id())] = true
			if pt > 6.0:
				ok(W.encs.size() == int(log.n0), "no lure spawning during a hunt")
				W.test_force = ""
				var tw := log.keys().filter(func(k): return String(k).begins_with("tw_")).size()
				ok(tw >= 2, "%d of them twitched the grass" % tw)
				_next()
		4:
			# a runner: Ash right by a rattata, startled, it runs to another patch
			var r = null
			for a in W.encs: if a.species == "rattata" and String(a.state) == "hidden": r = a; break
			e = r
			var np: Vector3 = (e.node as Node3D).position
			log.from_patch = W.arena_src.patch_of(np)
			_place(np + Vector3(2.4, 0, 0), -PI / 2.0)
			W.test_force = "react=flee"
			e.alert = 1.0
			log.maxh = 0.0
			_next()
		5:
			var nd: Node3D = e.node
			if String(e.state) in ["fleeing", "flying"]:
				log.ran = true
				log.maxh = maxf(float(log.maxh), nd.position.y - main.world.height_at(nd.position.x, nd.position.z))
			if log.has("ran") and String(e.state) == "hidden":
				W.test_force = ""
				ok(bool(e.path.get("run", false)), "a startled Rattata ran (no flight)")
				ok(float(log.maxh) < 0.05, "low on the ground all the way (%.2f m up at most)" % float(log.maxh))
				var to_patch := W.arena_src.patch_of(nd.position)
				ok(String(e.path.kind) != "tall_grass" or (to_patch >= 0 and to_patch != int(log.from_patch)), "it hid in another patch or a bush (%s, patch %d from %d)" % [String(e.path.kind), to_patch, int(log.from_patch)])
				ok(not W.track_hint().is_empty() and Wild._d2(W.track_hint().pos, e.at) < 0.1, "the compass points at it")
				_next()
			elif pt > 20.0: ok(false, "the runner never settled (%s)" % e.state); _next()
		6:
			# the battle hand-off: pounce on one, with his party
			var p = null
			for a in W.encs: if a.species == "pidgey" and String(a.state) == "hidden": p = a; break
			e = p
			var np2: Vector3 = (e.node as Node3D).position
			_place(np2 + Vector3(1.4, 0, 0), -PI / 2.0)
			e.alert = 0.0
			Wild.STUB.outcome = "ash_won"
			Wild.STUB.extra = {"pkmn_outcome": "won"}
			W._start_battle(e, "hidden", "ash")
			var o: Dictionary = Wild.STUB.last
			ok(int(o.get("level", 0)) == int(e.level) and String(o.get("mode", "")) == "pkmn" and (o.get("party_a", []) as Array).size() == 2 and String(o.party_b[0].species) == "pidgey", "the battle gets the hunt's level (%d) and his party" % int(o.get("level", 0)))
			H.cfg.with_party = false
			var alone: Dictionary = H.battle_opts(e)
			H.cfg.with_party = true
			ok(String(alone.mode) == "prologue" and int(alone.level) == int(e.level), "alone: the prologue's rules, at its level")
			log.left0 = H.left()
			_next()
		7:
			if not W.battle_on and pt > 1.2 and not log.has("won"):
				log.won = true
				ok(String(e.state) == "out", "beaten by his party it is out of the field")
				ok(H.left() == int(log.left0) - 1, "the counter: %d left" % H.left())
			if log.has("won") and pt > 3.5:
				ok(not W.encs.has(e) and H.n_out == 1, "and gone from the grass")
				Wild.STUB.outcome = "ran"; Wild.STUB.extra = {}
				# restart re-populates the full field
				H.populate()
				ok(H.left() == 9 and H.n_out == 0, "RESTART HUNT fills it again")
				H.stop(false)
				ok(W.encs.is_empty() and W.hunt == null and W.arena_src.region(main.pos) == "", "END HUNT clears it, the source off")
				ok(W.tut.state == "off", "still no tutorial")
				_finish()

func _next() -> void:
	phase += 1; pt = 0.0

func _finish() -> void:
	phase = 99
	print("hunt_test: %d checks, %d failures" % [checks, fails])
	print("HUNT TEST GREEN" if fails == 0 else "HUNT TEST RED")
	get_tree().quit(0 if fails == 0 else 1)
