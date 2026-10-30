extends Node
# Dev only: Ash's Pokémon out with him and the ambushes, headless (wild/ash_companions.gd,
# wild/ambush.gd, wild/party_menu.gd, arena/arena_ambush.gd).
#   godot --headless --path native res://dev/ambush_test.tscn
# Companions: two out at most, thrown out, they follow on Route 1 (close behind, never
# under his feet, beside him when he stops, sneaking when he crouches), and stay out
# through a door, a warp, the arena and a reload. Ambushes (in the arena's thickets):
# one jumps him from cover when he walks by upright (the beat: warn, strike, then the
# standoff); crouched and slow he spots it first and makes the first move; RUN gets him
# away (or it chases and catches him); his companions out intercept (the nearest of his
# to the nearest of them); a swarm never passes 4, fights two at a time and the next two
# come in only when both are down (a real battle, both sides by the AI); the world waits
# while it runs (the clock, the town's sim, the other wild Pokémon); the cooldown and the
# swarm's rarity hold. Prints PASS / FAIL lines and "AMBUSH TEST GREEN".

var main: Node
var W: Wild
var A: Ambush
var C: AshCompanions
var fails := 0
var checks := 0
var phase := 0
var pt := 0.0
var L := {}
const SAVE := "user://companions_test.save"

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c: fails += 1
	print(("PASS " if c else "FAIL ") + what)

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS   # (the party menu pauses the tree)
	Wild.battle_override = Wild.STUB
	AshParty.source = func(_g): return [{"species": "pikachu", "level": 25}, {"species": "pidgeotto", "level": 22}, {"species": "bulbasaur", "level": 22}]
	if FileAccess.file_exists(SAVE): DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	main = load("res://main.tscn").instantiate()
	main.process_mode = Node.PROCESS_MODE_PAUSABLE   # (the game itself still pauses)
	add_child(main)

func _place(p: Vector3, yaw: float) -> void:
	p.y = main.world.height_at(p.x, p.z)
	main.pos = p; main.yaw = yaw; main.speed = 0.0
	main.cast.land(p.y)
	main.cam_yaw = yaw + PI

# the stick toward a point (camera-relative, as a player's thumb), k of full tilt
func _walk(to: Vector3, k: float) -> void:
	var cy: float = main.cam_yaw
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	var dir := Vector2(to.x - main.pos.x, to.z - main.pos.z).normalized()
	main.stick_vec = Vector2(dir.dot(r), -dir.dot(f)) * k

func _stop() -> void: main.stick_vec = Vector2.ZERO

func _next() -> void:
	phase += 1; pt = 0.0
	_stop()

func _states() -> Array: return L.get("st", [])

func _process(dt: float) -> void:
	if main == null or main.cast == null or main.cast.get("companions") == null: return
	W = main.cast.wild; A = W.ambush; C = main.cast.companions
	pt += dt
	match phase:
		0:
			if pt < 0.8: return
			C.save_path = SAVE
			for k in range(C.out.size() - 1, -1, -1): C.recall(k, true)
			W.tut.done = true
			W.cooldown = 999.0
			A.cooldown = 999.0
			main.cast.clock.real = false; main.cast.clock.set_time(11.0)
			_rules()
			_place(Vector3(-13.0, 0, -95.0), PI)
			ok(C.send_out(0), "PIKACHU sent out")
			ok(C.send_out(1), "PIDGEOTTO sent out")
			ok(not C.send_out(2), "a third one is refused (two out at most)")
			ok(C.count() == 2, "two out")
			_next()
		1:
			if pt < 2.4: return
			ok(C.out.all(func(c): return String(c.state) == "out" and (c.node as Node3D).visible), "both thrown out and grown in (%s)" % str(C.out.map(func(c): return c.state)))
			L.maxd = 0.0; L.mind = INF
			L.goal = main.pos + Vector3(0, 0, -30.0)
			_next()
		2:
			# Ash walks up Route 1: they keep up behind him, clear of his feet
			_walk(L.goal, 0.75)
			main.cam_yaw = lerp_angle(main.cam_yaw, atan2(L.goal.x - main.pos.x, L.goal.z - main.pos.z) + PI, 0.1)
			if pt > 1.2:
				for c in C.out:
					var d := Wild._d2(c.pos, main.pos)
					L.maxd = maxf(float(L.maxd), d); L.mind = minf(float(L.mind), d)
			if pt > 5.5:
				ok(absf(float(main.speed)) > 2.0, "Ash walked (%.1f m/s)" % absf(float(main.speed)))
				ok(float(L.maxd) < 5.5, "they kept up (farthest %.1f m)" % float(L.maxd))
				ok(float(L.mind) > 0.4, "never under his feet (nearest %.2f m)" % float(L.mind))
				ok(C.log.filter(func(e): return String(e.t) == "teleport").is_empty(), "no teleport needed on an open walk")
				_next()
		3:
			if pt < 2.5: return
			# stopped: beside him, not in front
			var fwd := Vector3(sin(main.yaw), 0, cos(main.yaw))
			var good := true
			var txt := []
			for c in C.out:
				var v: Vector3 = c.pos - main.pos; v.y = 0.0
				txt.append("%.1f m, front %.2f" % [v.length(), v.normalized().dot(fwd)])
				if v.length() < 0.6 or v.length() > 2.4 or v.normalized().dot(fwd) > 0.55: good = false
			ok(good, "stopped: they come up beside him (%s)" % ", ".join(txt))
			ok(Wild._d2(C.out[0].pos, C.out[1].pos) > 0.6, "and not on top of each other")
			main.cast.set_crouch(true)
			_next()
		4:
			if pt < 0.3: return
			var pk: Node3D = C.of("pikachu").node
			ok(float(pk.get("sneak")) >= 0.99, "he crouches: Pikachu sneaks")
			main.cast.set_crouch(false)
			ok(C.saved().size() == 2, "who is out is saved")
			var c2 := AshCompanions.new()
			main.cast.add_child(c2)
			c2.setup(main, main.cast)
			c2.save_path = SAVE
			c2.autosave = false
			c2._load()
			ok(c2.out.size() == 2 and c2.out.all(func(c): return String(c.state) == "out"), "and they come back out on a reload")
			c2.queue_free()
			# a warp: put back by him
			_place(main.pos + Vector3(40.0, 0, 0), PI)
			_next()
		5:
			if pt < 0.4: return
			ok(C.out.all(func(c): return Wild._d2(c.pos, main.pos) < 3.0), "after a warp they are back by him")
			# a door: hidden inside, out again on the way out
			_place(Vector3(main.cast.lab_door.x, 0, main.cast.lab_door.y + 2.0), PI)
			_next()
		6:
			if pt < 0.4: return
			if not L.has("in"):
				L["in"] = true
				main.enter_space("oak_lab", "from_town", true)
				pt = 0.0
				return
			if not L.has("checked_in") and pt > 0.5:
				L.checked_in = true
				ok(main.indoors and C.out.all(func(c): return not (c.node as Node3D).visible), "indoors they are not drawn")
				ok(C.count() == 2, "but still out")
				main.leave_space(true)
				pt = 0.0
				return
			if L.has("checked_in") and pt > 0.6:
				ok(not main.indoors and C.out.all(func(c): return (c.node as Node3D).visible and Wild._d2(c.pos, main.pos) < 3.0), "out of the door, they are by him again")
				BattleArena.enter(main, true)
				_next()
		7:
			if BattleArena.I == null or pt < 1.5: return
			ok(C.count() == 2 and C.out.all(func(c): return (c.node as Node3D).visible and Wild._d2(c.pos, main.pos) < 3.5), "into the arena with him")
			for k in range(C.out.size() - 1, -1, -1): C.recall(k, true)
			ok(C.count() == 0, "recalled")
			var thk: Array = BattleArena.I.ambush.spots
			ok(thk.size() == 3 and BattleArena.I.hides.filter(func(h): return String(h.kind) == "thicket").size() == 3, "the arena has its thickets as cover")
			# an ambush in the first thicket; he walks by upright
			_arm({"species": "beedrill", "n": 1, "cover": thk[0], "level": 6, "temper": "aggressive"}, 12.0)
			_next()
		8:
			_track()
			if A.lurking(): _walk(L.target, 0.75)
			else: _stop()
			if String(A.cur.get("state", "")) == "standoff" and not L.has("so"):
				L.so = true
				var seq := _states()
				ok(seq.find("warn") >= 0 and seq.find("warn") < seq.find("strike") and seq.find("strike") < seq.find("standoff"), "walking by upright: the warning beat, the strike, the standoff (%s)" % str(seq))
				ok(not A.cur.spotted, "it was not spotted")
				var d := Wild._d2(A._lead().node.position, main.pos)
				ok(d < 3.2, "it landed in front of him (%.1f m)" % d)
				ok(main.cast.busy(), "the standoff has the controls")
				A.force_run = 1; A.force_chase = 0
				A.input(false, true)
				pt = 0.0
			if L.has("so") and A.cur.is_empty():
				ok(A.stats.escaped >= 1, "RUN: he got away")
				ok(_states().has("dash"), "with a dash")
				_next()
			elif pt > 20.0: ok(false, "no standoff (%s)" % str(_states())); _next()
		9:
			# ran, but it chases and catches him
			A.cooldown = 0.0
			_arm({"species": "mankey", "n": 1, "cover": BattleArena.I.ambush.spots[0], "level": 6, "temper": "aggressive"}, 11.0)
			Wild.STUB.last = {}
			_next()
		10:
			_track()
			if A.lurking(): _walk(L.target, 0.75)
			else: _stop()
			if String(A.cur.get("state", "")) == "standoff" and not L.has("so2"):
				L.so2 = true
				A.force_run = 1; A.force_chase = 1
				A.input(false, true)
			if String(A.cur.get("state", "")) == "chase": main.speed = 0.0   # (he stops: it catches him)
			if not Wild.STUB.last.is_empty() and not L.has("caught"):
				L.caught = true
				ok(_states().has("chase") and A.stats.caught >= 1, "it chased him and caught up")
				ok(String(Wild.STUB.last.get("first_strike", "")) == "wild" and String(Wild.STUB.last.get("mode", "")) == "pkmn", "caught: the battle, it strikes first (%s, %s)" % [Wild.STUB.last.get("first_strike"), Wild.STUB.last.get("mode")])
			if L.has("caught") and A.cur.is_empty() and not Battle.active and not Wild.STUB.active:
				A.force_run = -1; A.force_chase = -1
				_next()
			elif pt > 25.0: ok(false, "the chase never ended (%s)" % str(_states())); _next()
		11:
			# crouched and slow: he spots it first, then makes the first move
			A.cooldown = 0.0
			A.T["spot_p"] = 1.0
			_arm({"species": "ekans", "n": 1, "cover": BattleArena.I.ambush.spots[0], "level": 6, "temper": "aggressive"}, 11.0)
			main.cast.set_crouch(true)
			Wild.STUB.last = {}
			_next()
		12:
			_track()
			var d := A._d_lead() if not A.cur.is_empty() else INF
			if A.lurking() and d > 3.4: _walk(L.target, 0.6)
			else: _stop()
			if String(A.cur.get("state", "")) == "spotted" and d <= 3.5 and not L.has("sp"):
				L.sp = true
				ok(not _states().has("warn"), "crouched and slow: he spots it first (no warning, no strike: %s)" % str(_states()))
				ok((A._lead().node as Node3D).visible, "it shows as a tell")
				ok(W.use_pressed(), "A: the first move")
			if L.has("sp") and main.cast.party_menu.is_open() and not L.has("menu"):
				L.menu = true
				ok(main.cast.party_menu.ctx == "ambush", "his party menu opens to pick one")
				main.cast.party_menu.close(0)
			if not Wild.STUB.last.is_empty() and not L.has("first"):
				L.first = true
				ok(String(Wild.STUB.last.get("first_strike", "")) == "ash", "his move first (first strike: %s)" % Wild.STUB.last.get("first_strike"))
				ok(_states().has("intercept") and C.is_out("pikachu"), "Pikachu was thrown out and ran in")
			if L.has("first") and A.cur.is_empty() and not Wild.STUB.active:
				main.cast.set_crouch(false)
				A.T["spot_p"] = 0.85
				_next()
			elif pt > 25.0: ok(false, "no first move (%s)" % str(_states())); _next()
		13:
			# two out, a swarm of 3: they intercept, the nearest of his to the nearest of them
			if pt < 0.5: return
			for k in range(C.out.size() - 1, -1, -1): C.recall(k, true)
			C.send_out(0, true); C.send_out(1, true)
			A.cooldown = 0.0
			_arm({"species": "beedrill", "n": 3, "cover": BattleArena.I.ambush.spots[0], "level": 4, "temper": "aggressive"}, 12.0)
			Wild.STUB.last = {}
			_next()
		14:
			_track()
			if A.lurking(): _walk(L.target, 0.75)
			else: _stop()
			if String(A.cur.get("state", "")) == "intercept" and not L.has("ic"):
				L.ic = true
				ok(not _states().has("standoff"), "his Pokémon out: no standoff, they intercept at once")
				var pairs: Array = A.cur.pairs
				ok(pairs.size() == 2, "both of his go in")
				# the first pair: the closest of his to the closest of them, of all pairs
				var best := INF
				for c in C.out:
					for m in A.cur.members: best = minf(best, Wild._d2((c.icpt.from if c.has("icpt") else c.pos), (m.node as Node3D).position))
				var p0: Array = pairs[0]
				var d0 := Wild._d2(p0[0].icpt.from, (p0[1].node as Node3D).position)
				ok(absf(d0 - best) < 0.01, "the nearest of his took the nearest of them (%.2f m, best %.2f m)" % [d0, best])
				ok(pairs[0][1] != pairs[1][1], "each took a different one")
			if not Wild.STUB.last.is_empty() and not L.has("ob"):
				L.ob = true
				var o: Dictionary = Wild.STUB.last
				ok(bool(o.get("doubles", false)) and bool(o.get("waves", false)) and (o.party_b as Array).size() == 3, "a swarm: doubles, in waves, all 3 on their side")
				ok(o.get("partner_node") is Node3D and o.get("partner_node2") is Node3D and bool(o.get("keep_partner", false)), "his two out are the battle's, kept after")
				ok(bool(o.get("pause_world", false)), "the world waits during it")
				ok(String(o.get("banner", "")).ends_with("SWARM"), "the banner: WILD %s!" % o.get("banner"))
			if L.has("ob") and A.cur.is_empty() and not Wild.STUB.active:
				ok(C.count() == 2 and C.out.all(func(c): return String(c.state) == "out"), "after it, his two are back with him")
				_next()
			elif pt > 25.0: ok(false, "no intercept (%s)" % str(_states())); _next()
		15:
			# the cap: never more than 4 in a swarm
			A.cooldown = 0.0
			A.force = {"species": "beedrill", "n": 9, "cover": BattleArena.I.ambush.spots[1], "level": 3}
			_next()
		16:
			if A.cur.is_empty(): return
			ok(A.cur.members.size() == 4, "a swarm caps at 4 (asked 9, got %d)" % A.cur.members.size())
			A.clear()
			# the real battle: 4 of them against his two, two at a time
			Wild.battle_override = null
			_place(BattleArena.I.w(-5.0, 34.0), PI)
			for k in range(C.out.size() - 1, -1, -1): C.recall(k, true)
			C.send_out(0, true); C.send_out(1, true)
			L.ev = []
			A.battle_extra = {"auto": true, "seed": 4, "on_event": func(e): L.ev.append(e)}
			A.cooldown = 0.0
			_arm({"species": "beedrill", "n": 4, "cover": BattleArena.I.ambush.spots[0], "level": 2, "temper": "aggressive"}, 12.0)
			# a wild one elsewhere: it must wait too
			var wp = W.arena_src.random_spot(RandomNumberGenerator.new(), 2)
			L.we = W.spawn("pidgey", W.arena_src, wp if wp != null else BattleArena.I.w(-31.0, 24.0), "flighty")
			L.we.hunt = true   # (it stays put however far he is)
			_next()
		17:
			_track()
			if A.lurking(): _walk(L.target, 0.75)
			else: _stop()
			if Battle.active and Battle.current != null and not L.has("b0"):
				L.b0 = true
				L.clock0 = float(main.cast.clock.minutes)
				L.life0 = int(main.cast.life._frame)
				L.we_t = float(L.we.t)
				L.bt = 0.0
			if L.has("b0") and Battle.active:
				L.bt = float(L.bt) + dt
				if float(L.bt) > 3.0 and not L.has("paused"):
					L.paused = true
					ok(Battle.world_paused(), "the ambush's battle holds the world")
					ok(absf(float(main.cast.clock.minutes) - float(L.clock0)) < 1e-6, "the clock waits")
					ok(int(main.cast.life._frame) == int(L.life0), "the town's sim waits")
					ok(absf(float(L.we.t) - float(L.we_t)) < 1e-6 and not (L.we.node as Node3D).visible, "the other wild Pokémon wait, out of sight")
			if L.has("b0") and not Battle.active and not L.has("over"):
				L.over = true
				L.clock1 = float(main.cast.clock.minutes)
				var out := 2
				var max_out := 2
				var fill_ok := true
				var b_faints := 0
				var fills := 0
				for e in L.ev:
					var tt := String(e.get("t", ""))
					if String(e.get("side", "")) != "b": continue
					if tt == "faint": out -= 1; b_faints += 1
					elif tt == "switch_in":
						if out != 0 and fills % 2 == 0: fill_ok = false   # (a pair comes in only once both are down)
						out += 1; fills += 1
						max_out = maxi(max_out, out)
				ok(max_out <= 2, "never more than two of them out at once (%d)" % max_out)
				ok(fills == 2 and fill_ok, "the next two came in only once both were down (%d in)" % fills)
				ok(b_faints == 4, "all four beaten (%d)" % b_faints)
				ok(String(A.cur.get("state", "")) in ["out", ""], "the swarm is out of the field")
				ok(absf(A.cooldown - A.tn("cooldown_s")) < 1.0, "the cooldown set after it (%.0f s)" % A.cooldown)
			if L.has("over"):
				if pt > 0.0 and not L.has("after") and float(main.cast.clock.minutes) > float(L.clock1) + 1e-4:
					L.after = true
					ok(true, "the clock runs again after it")
					ok(C.count() == 2 and C.out.all(func(c): return (c.node as Node3D).visible), "his two are out with him again")
					_finish()
			if pt > 240.0: ok(false, "the swarm battle never ended (%s, %d events)" % [str(_states()), (L.get("ev", []) as Array).size()]); _finish()

# arm an ambush at a cover, Ash `back` m short of it and a little to its side, walking at it
func _arm(f: Dictionary, back: float) -> void:
	var at: Vector3 = f.cover.at
	var from := at + Vector3(1.2, 0, back)
	_place(from, PI)
	L.target = at + Vector3(1.4, 0, -6.0)
	L.st = []
	A.force = f
	A.log.clear()

func _track() -> void:
	var s := String(A.cur.get("state", ""))
	var st: Array = L.get("st", [])
	if s != "" and (st.is_empty() or st[-1] != s): st.append(s)
	L.st = st

# ---------- no world ----------
func _rules() -> void:
	var S: Dictionary = A.A.species
	for id in ["beedrill", "ekans", "rattata", "mankey", "spearow", "arbok"]:
		ok(S.has(id) and not (S[id].temper as Dictionary).is_empty() and not (S[id].strike as Dictionary).is_empty(), "%s ambushes by its own data (tempers, strike odds)" % id)
	ok(S.beedrill.has("swarm") and S.spearow.has("swarm") and not S.ekans.has("swarm"), "Beedrill and Spearow swarm, Ekans doesn't")
	ok(int(A.swarm_cfg().max) == 4 and int(A.swarm_cfg().at_once) == 2, "a swarm: 4 at most, 2 at a time")
	ok(A.tn("spot_p") >= 0.7, "crouched and slow he usually spots it first (spot_p %.2f)" % A.tn("spot_p"))
	# rarity: the swarm's own gates
	A.swarm_cd = 0.0
	A.last_swarm = -1e9
	var n := 0
	var sizes_ok := true
	for i in 3000:
		var k := A.swarm_size("beedrill", "route1")
		if k > 1: n += 1
		if k > 4 or k < 1: sizes_ok = false
	var frac := n / 3000.0
	ok(frac > 0.08 and frac < 0.3, "a swarm is rare even with its gates open (%.1f%% of ambushes)" % (frac * 100.0))
	ok(sizes_ok, "sizes within 1..4")
	A.last_swarm = A.t
	ok(range(500).all(func(_i): return A.swarm_size("beedrill", "route1") == 1), "never two swarms within the minimum gap")
	A.last_swarm = -1e9
	A.swarm_cd = 100.0
	ok(range(500).all(func(_i): return A.swarm_size("beedrill", "route1") == 1), "nor within its cooldown")
	A.swarm_cd = 0.0
	ok(range(500).all(func(_i): return A.swarm_size("ekans", "route1") == 1), "a species that doesn't swarm never does")
	ok(A.tn("rate_s") >= 60.0 and A.tn("cooldown_s") >= 30.0, "ambushes are spaced out (one per %.0f s of walking near cover, %.0f s cooldown)" % [A.tn("rate_s"), A.tn("cooldown_s")])
	# the run's odds
	A.cur = {"species": "beedrill", "members": [{}, {}, {}, {}], "temper": "aggressive"}
	var p4 := A.run_chance()
	A.cur.members = [{}]
	var p1 := A.run_chance()
	A.cur = {}
	ok(p1 > p4 and p4 >= 0.25 and p1 <= 0.92, "running from a swarm is harder (%.2f alone, %.2f from 4)" % [p1, p4])
	ok(not AshCompanions.can_water(C.info("pikachu")) and AshCompanions.can_water(C.info("squirtle")), "Pikachu stays out of the water, Squirtle may go in")
	ok(String(C.info("pidgeotto").gait) == "fly" and String(C.info("jigglypuff").gait) == "hop", "gaits by species: Pidgeotto flies, Jigglypuff hops")

func _finish() -> void:
	phase = 99
	Wild.battle_override = null
	AshParty.source = Callable()
	if FileAccess.file_exists(SAVE): DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	print("ambush_test: %d checks, %d failures" % [checks, fails])
	print("AMBUSH TEST GREEN" if fails == 0 else "AMBUSH TEST RED")
	get_tree().quit(0 if fails == 0 else 1)
