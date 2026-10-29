extends Node
# Dev only: the wild Pokémon hunt, headless (wild/wild.gd, wild/wild_brain.gd).
#   godot --headless --path native res://dev/wild_test.tscn
# Part 1, the rules (WildBrain, no world): spawning is likelier still or crouched than
# walking, never running or on the bike; crouching is quieter and less seen; alertness
# builds and fades; temperaments and reactions come from wild.json; a safe zone is
# 30-60 m off and away from Ash; the tutorial flag saves.
# Part 2, the game (main.tscn): crouch speed and no crouching on the bike; a Pidgey (the
# real model, Creature.make) settles in the grass; crouch-creeping in keeps it hidden,
# walking up upright startles it; a startled flighty one flies to a safe zone, hides
# again warier and the compass points there; the A-mash engages (the pounce, then
# Battle.start), a fleeing one can be grabbed in its window; the battle ends and hands
# control back. Prints PASS / FAIL lines and "WILD TEST GREEN".

var main: Node
var W: Wild
var fails := 0
var checks := 0
var phase := 0
var pt := 0.0
var e: Dictionary = {}
var log := {}
const START := Vector3(-13.0, 0, -84.5)   # the north edge of Route 1's first patch, facing south into it

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c: fails += 1
	print(("PASS " if c else "FAIL ") + what)

func _ready() -> void:
	# the hunt's side of the hand-off is tested here; the battle itself in dev/battle_test
	Wild.battle_override = Wild.STUB
	_rules()
	main = load("res://main.tscn").instantiate()
	add_child(main)

# ---------- part 1 ----------
func _rules() -> void:
	var b := WildBrain.new()
	b.save_path = "user://wild_test.save"
	ok(not b.D.species.is_empty() and b.sp("pidgey").has("temper"), "wild.json loads, pidgey has tempers")
	ok(b.species_for("tall_grass", "route1", 12.0).size() >= 1, "pidgey lives in Route 1's tall grass by day")
	ok(b.species_for("tall_grass", "route1", 23.5).is_empty(), "not at midnight")
	ok(b.species_for("tall_grass", "pallet", 12.0).is_empty(), "not in town")
	var still := b.hazard(1.0, b.lure(0.0, false, false))
	var crouch := b.hazard(1.0, b.lure(1.4, true, false))
	var walk := b.hazard(1.0, b.lure(4.5, false, false))
	ok(still > walk * 4.0 and crouch > walk * 4.0, "spawns: still %.3f/s, crouched %.3f/s >> walking %.3f/s" % [still, crouch, walk])
	ok(b.hazard(1.0, b.lure(8.5, false, false)) == 0.0 and b.hazard(1.0, b.lure(3.0, false, true)) == 0.0, "running or on the bike never lures one")
	ok(b.cover(0.0) == 1.0 and b.cover(10.0) == 0.0 and b.cover(4.0) > 0.0 and b.cover(4.0) < 1.0, "cover: 1 in the grass, fading to 0 by 7 m")
	ok(b.noise(1.4, true, false) < b.noise(1.4, false, false) * 0.6 and b.noise(8.5, false, false) > b.noise(4.5, false, false), "crouching is quieter, running louder")
	var s_cr := b.stim(b.noise(1.4, true, false), 3.0, true, true, 1.0)
	var s_up := b.stim(b.noise(4.5, false, false), 3.0, false, true, 1.0)
	var s_back := b.stim(b.noise(4.5, false, false), 3.0, false, true, -1.0)
	ok(s_cr < s_up * 0.5 and s_back < s_up, "noticed: crouched %.2f < upright %.2f; from behind %.2f" % [s_cr, s_up, s_back])
	# a crouched creep from 6 m to 2 m at 1.4 m/s stays under startled; walking up upright startles it
	var a := 0.0
	var d := 6.0
	while d > 2.0:
		a = b.step_alert(a, b.stim(b.noise(1.4, true, false), d, true, true, 1.0), 1.0 / 30.0)
		d -= 1.4 / 30.0
	var a_cr := a
	a = 0.0; d = 8.0
	var hit := false
	while d > 1.5:
		a = b.step_alert(a, b.stim(b.noise(4.5, false, false), d, false, true, 1.0), 1.0 / 30.0)
		d -= 4.5 / 30.0
		if a >= 1.0: hit = true
	ok(a_cr < 1.0 and hit, "a crouched creep to 2 m leaves it at %.2f; walking up startles it" % a_cr)
	var q := b.step_alert(0.5, 0.0, 1.0)
	ok(q < 0.5, "alertness falls in quiet")
	var n := {"flee": 0, "attack": 0, "curious": 0}
	for i in 400: n[b.pick_reaction("pidgey", "aggressive")] += 1
	ok(n.attack > n.flee, "an aggressive one mostly attacks %s" % str(n))
	n = {"flee": 0, "attack": 0, "curious": 0}
	for i in 400: n[b.pick_reaction("pidgey", "flighty")] += 1
	ok(n.flee > 250 and n.attack == 0, "a flighty one mostly flees %s" % str(n))
	var cands := [{"at": Vector3(0, 0, 45), "kind": "tall_grass"}, {"at": Vector3(0, 0, -45), "kind": "tall_grass"}, {"at": Vector3(5, 0, 10), "kind": "bush"}]
	var away := 0
	for i in 100:
		var z := b.pick_safe("pidgey", Vector3.ZERO, Vector3(0, 0, -3), cands)
		if (z.at as Vector3).z > 0: away += 1
	ok(away > 70, "a safe zone 30-60 m off, away from Ash (%d/100)" % away)
	ok(b.pick_safe("pidgey", Vector3.ZERO, Vector3(0, 0, -3), []).kind == "open", "nowhere to hide: off into the open")
	b.set_tutorial_done(true)
	ok(b.tutorial_done(), "the tutorial's done flag saves")
	b.set_tutorial_done(false)
	ok(not b.tutorial_done(), "and clears")
	var src := WildTallGrass.new([[-22.0, -104.0, -4.0, -86.0], [10.0, -150.0, 20.0, -140.0]])
	ok(src.region(START) == "route1" and src.patch_of(Vector3(-10, 0, -95)) == 0 and src.distance(Vector3(-10, 0, -80)) > 5.0, "the tall-grass source: region, patch, distance")
	ok(src.safe_spots(Vector3(-10, 0, -95), 80.0).size() == 1, "another patch is a safe spot")

# ---------- part 2 ----------
func _place(p: Vector3, yaw: float) -> void:
	p.y = main.world.height_at(p.x, p.z)
	main.pos = p; main.yaw = yaw; main.speed = 0.0
	main.cast.land(p.y)
	main.cam_yaw = yaw + PI
	main.cam_target = p + Vector3(0, 1.45, 0)

# hold the stick toward a point (main.gd moves relative to the camera), at tilt k
func _walk(to: Vector3, k: float) -> void:
	var cy: float = main.cam_yaw
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	var dir := Vector2(to.x - main.pos.x, to.z - main.pos.z).normalized()
	main.stick_vec = Vector2(dir.dot(r), -dir.dot(f)) * k

func _next() -> void:
	phase += 1; pt = 0.0; _last_a = -9.0

var _last_a := -9.0
func _every(s: float) -> bool:
	if pt - _last_a < s: return false
	_last_a = pt
	return true

func _ahead(dd: float, s := 0.0) -> Vector3:
	return START + Vector3(0, 0, -dd) + Vector3(s, 0, 0)

func _process(dt: float) -> void:
	if main == null or main.cast == null or main.cast.get("wild") == null: return
	W = main.cast.wild
	pt += dt
	main.cam_idle = 0.0
	match phase:
		0:
			if pt < 0.5: return
			W.brain.save_path = "user://wild_test.save"
			W.tut.done = true
			W.cooldown = 999.0
			main.cast.clock.real = false; main.cast.clock.set_time(11.0)
			_place(START, PI)
			_next()
		1:
			# crouch on, the creep speed
			if not log.has("cr"): log.cr = true; main.cast._btn_crouch = true; return
			_walk(_ahead(12.0), 1.0)
			if pt > 2.0:
				ok(main.cast.crouching, "B / the touch button crouches him")
				ok(absf(float(main.speed) - 1.4) < 0.15, "crouch-walking at %.2f m/s" % float(main.speed))
				ok(main.cast.player.crouch_w > 0.9, "the crouch pose is in (crouch_w %.2f)" % main.cast.player.crouch_w)
				main.stick_vec = Vector2.ZERO
				main.cast._btn_crouch = true
				_next()
		2:
			if pt < 0.6: return
			ok(not main.cast.crouching and main.cast.player.crouch_w < 0.5, "pressed again he stands (crouch_w %.2f, easing out)" % main.cast.player.crouch_w)
			# on the bike: no crouch
			if main.cast.bike and main.cast.bike.has_method("riding"):
				var was: bool = main.cast.bike.riding()
				if was: main.cast.set_crouch(true); ok(not main.cast.crouching, "no crouching on the bike")
			_place(START, PI)
			# a Pidgey settles 5 m in
			e = W.spawn("pidgey", W.sources[0], _ahead(5.0), "flighty")
			ok(e.node is CreaturePidgey, "the real Pidgey (Creature.make) settles, not the stand-in")
			ok(String(e.state) == "hidden", "it is hidden")
			main.cast.set_crouch(true)
			_next()
		3:
			# creep crouched to 2 m: it stays hidden; the A prompt shows
			var nd: Node3D = e.node
			var d := Wild._d2(main.pos, nd.position)
			if d > 1.85: _walk(nd.position, 0.75)
			else: main.stick_vec = Vector2.ZERO
			if d <= 1.85 or pt > 8.0:
				ok(String(e.state) == "hidden" and float(e.alert) < 1.0, "crouch-creeping in to %.1f m it stays hidden (alert %.2f)" % [d, float(e.alert)])
				ok(not W.hud.prompt.is_empty() and String(W.hud.prompt.kind) == "mash", "the A A A! prompt shows")
				_next()
		4:
			# mash A: about 3-4 presses engage
			if _every(0.22) and String(e.state) == "hidden":
				log.presses = int(log.get("presses", 0)) + 1
				W.use_pressed()
			if String(e.state) == "pounced" or String(e.state) == "battle" or pt > 4.0:
				ok(String(e.state) in ["pounced", "battle"], "the A-mash engaged after %d presses" % int(log.get("presses", 0)))
				ok(int(log.get("presses", 0)) >= 3 and int(log.get("presses", 0)) <= 5, "3-4 presses (%d)" % int(log.get("presses", 0)))
				_next()
		5:
			if W.battle_on and not log.has("b"):
				log.b = true
				ok(W._battle_e == e and String(e.state) == "battle", "the pounce went into Battle.start (Ash strikes first)")
			if log.has("b") and not W.battle_on:
				ok(true, "the battle finished and gave control back")
				ok(not main.cast.busy(), "Ash is free to move")
				W.clear()
				_place(START, PI)
				e = W.spawn("pidgey", W.sources[0], _ahead(7.0), "flighty")
				W.test_force = "react=flee"
				_next()
			elif pt > 30.0:
				ok(false, "the battle never finished"); _next()
		6:
			# walk at it upright: it startles and flees to a safe zone
			var nd2: Node3D = e.node
			if String(e.state) == "hidden": _walk(nd2.position, 0.7)
			else: main.stick_vec = Vector2.ZERO
			if String(e.state) == "fleeing" and not log.has("fled"):
				log.fled = true
				log.from = nd2.position
				log.to = e.at
				ok(true, "walking up upright startled it (%.1f m off)" % Wild._d2(main.pos, nd2.position))
				var fd := Wild._d2(log.from, log.to)
				ok(fd > 25.0 and fd < 75.0, "it flies to a %s %.0f m away" % [String(e.path.kind), fd])
				ok(not W.track_hint().is_empty(), "the compass points to it")
			if log.has("fled"):
				if bool(nd2.get("flying")) and float(nd2.get("height")) > 1.0: log.air = true
				if String(e.state) == "hidden" and pt > 1.0:
					ok(bool(log.get("air", false)), "it was up in the air on the way")
					ok(Wild._d2(nd2.position, log.to) < 0.5, "it landed at the safe zone")
					ok(bool(e.wary), "and hides again, warier")
					ok(not W.track_hint().is_empty(), "the compass still points there")
					_next()
			if pt > 25.0: ok(false, "the flee never finished (state %s)" % e.state); _next()
		7:
			# the grab: startle it close, A, A in the window
			W.clear()
			_place(START, PI)
			e = W.spawn("pidgey", W.sources[0], _ahead(1.6), "flighty")
			W.test_force = "react=flee"
			e.alert = 1.0
			_next()
		8:
			if String(e.state) == "fleeing" and _every(0.15):
				W.use_pressed()
			if String(e.state) in ["pounced", "battle"] or pt > 3.0:
				ok(String(e.state) in ["pounced", "battle"], "a fleeing one grabbed in its window")
				_next()
		9:
			if not W.battle_on and pt > 1.0:
				W.clear()
				# the setting "Pokémon in the grass": peeking, it flutters up over the grass tops
				log.peek0 = Settings.extra.get("wild_peek", "hidden")
				Settings.extra["wild_peek"] = "peek"
				_place(START, PI)
				e = W.spawn("pidgey", W.sources[0], _ahead(8.0), "flighty")
				_next()
			elif pt > 30.0: ok(false, "the grab's battle never finished"); _finish()
		10:
			var hn := float((e.node as Node3D).get("height"))
			log.hmax = maxf(float(log.get("hmax", 0.0)), hn)
			if String(e.state) != "hidden": ok(false, "a peeking one stays put (%s)" % e.state); _next()
			elif bool(log.get("went_up", false)) and not bool(e.get("up", false)) and hn < 0.05:
				ok(true, "peeking, it fluttered up over the grass (%.2f m) and back down" % float(log.hmax))
				_next()
			elif float(log.hmax) > 1.4: log.went_up = true
			if pt > 20.0: ok(false, "peeking, it never came up over the grass (max %.2f m)" % float(log.hmax)); _next()
		11:
			Settings.extra["wild_peek"] = log.peek0
			W.clear()
			_finish()

func _finish() -> void:
	phase = 99
	print("wild_test: %d checks, %d failures" % [checks, fails])
	print("WILD TEST GREEN" if fails == 0 else "WILD TEST RED")
	get_tree().quit(0 if fails == 0 else 1)
