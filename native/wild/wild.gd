class_name Wild
extends Node
# Wild Pokémon in the tall grass (cast.gd makes one; the rules are in
# wild_brain.gd, the numbers in res://life/wild.json):
#   settling    while Ash stands still or crouch-walks in or near tall grass a
#               Pokémon may settle into the patch a few metres off (an
#               encounter source, wild_source.gd: tall grass for now); walking
#               hardly lures one, running never
#   tells       where it hides the grass twitches in bursts (a few clumps shaken
#               through grass.gd's push points), a rustle, now and then a
#               feather; with the setting wild_peek = "peek" the bird itself
#               shows: the grass is about Ash's height, so every few seconds it
#               flutters up over the tops, hovers looking round, and drops back
#               (the blades thrashed under its wings); hidden, only the grass
#               gives it away
#   approach    Ash's noise and how much it sees of him (speed, crouch,
#               distance, its facing) build its alertness; quiet lets it fall.
#               Alert, the grass goes still and its head comes up. Startled
#               (alertness 1), its temperament picks: flee, attack (into the
#               battle, it strikes first), or curious (pops out, looks at him,
#               hops about, won't battle, wanders off)
#   engaging    close enough (engage_d), pressing A again and again fills a
#               meter (the "A A A!" prompt) and Ash pounces: the battle
#               (Battle.start, native/battle/; wild_battle_stub.gd until it is
#               in). A fleeing one in reach can still be grabbed: A, A in time
#               (its take-off lifts it nearly in place for a moment first)
#   tracking    a fled one flies off to a safe zone 30-60 m away (another
#               patch, a bush, a tree), dropping feathers on the way; the
#               compass points there (island.gd: track_hint); it hides again,
#               warier, and forgets him after a while
#   tutorial    the first time Ash nears tall grass, Prof. Oak (over the
#               Pokégear) walks him through it with a Pidgey set there for him
#               (wild_tutorial.gd); done once, saved (WildBrain.set_tutorial_done)
#   on foot     a species that can't fly (WildBrain.flies) runs instead: low and
#               fast through the grass to another patch or under a bush, the
#               blades parting along its way (the trail to follow)
#   ambushes    opportunists lying in wait in cover that jump him (ambush.gd: its
#               own encounter kind, its own data, wild.json "ambush")
#   the hunt    the Battle Arena's (arena/arena_hunt.gd, hunt while one is on):
#               many hidden at once through its patches (wild_arena_grass.gd),
#               no luring, each with its level and the battle's mode; it hears
#               how each battle ends (on_result) and when one goes (on_removed)
#
# cast.gd calls update(dt) each frame, use_pressed() on A (true = taken),
# busy() / input() while the tutorial's dialog has the controls.

const STANDIN := preload("res://wild/wild_standin.gd")
const STUB := preload("res://wild/wild_battle_stub.gd")
static var battle_override: Script = null   # (tests: the stand-in battle, which ends at once)
const PUSH_W := 0.75       # a twitch's push radius (m)

var game: Node
var cast: Node
var brain: WildBrain
var sources: Array = []    # WildSource
var arena_src: WildArenaGrass
var hunt: Node = null      # the arena's hunt while one is on (arena/arena_hunt.gd)
var encs: Array = []       # the encounters going on (one at a time on Route 1, a field of them in a hunt)
var _prompt_d := INF       # (the nearest one's prompt wins)
var cooldown := 4.0
var hud: WildHud
var toaster: UIToaster
var tut: WildTutorial
var ambush: Ambush         # the ambushes (ambush.gd)
var feathers: Array = []   # {node, v, spin, t, life, rest}
var t := 0.0
var lunge := {}            # Ash's pounce: {t, from, to, e}
var battle_on := false
var _battle_src: Object = null
var _battle_e: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _last_lure := 0.0
var test_force := ""       # dev: "spawn", "react=flee" ... (wild_shot.gd)
var shot: WildShot = null  # dev: -- --wild-test=<case>
var debug := OS.get_cmdline_user_args().has("--wild-debug")

func setup(g: Node, c: Node, layer: CanvasLayer) -> void:
	game = g; cast = c
	_rng.randomize()
	brain = WildBrain.new()
	sources.append(WildTallGrass.new(c.tall))
	arena_src = WildArenaGrass.new()
	sources.append(arena_src)
	hud = WildHud.new()
	hud.wild = self
	layer.add_child(hud)
	toaster = UIToaster.new()
	toaster.anchor = "center"
	layer.add_child(toaster)
	tut = WildTutorial.new()
	tut.setup(self)
	ambush = Ambush.new()
	ambush.name = "Ambush"
	add_child(ambush)
	ambush.setup(self)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--wild-test="): shot = WildShot.new(self, a.substr(12))

func peek() -> bool: return String(Settings.get_value("wild_peek")) == "peek"

# ---------- what cast.gd asks ----------
func busy() -> bool:
	return tut.busy() or not lunge.is_empty() or (ambush != null and ambush.busy())

func input(a: bool, b: bool) -> void:
	tut.input(a, b)

# A pressed on foot: the pounce, the grab, a word to a curious one (true = taken)
func use_pressed() -> bool:
	if ambush != null and ambush.use_pressed(): return true
	var me: Vector3 = game.pos
	# (the nearest first: in a hunt there may be a few in reach)
	var near := encs.duplicate()
	near.sort_custom(func(a, b): return _d2(me, a.node.position if a.node else a.at) < _d2(me, b.node.position if b.node else b.at))
	for e in near:
		var d := _d2(me, e.node.position if e.node else e.at)
		match String(e.state):
			"hidden":
				if d <= float(brain.t("engage_d", 2.0)):
					e.mash = minf(1.0, float(e.mash) + brain.tv("mash", "press", 0.3))
					e.alert = minf(0.99, float(e.alert) + brain.tv("mash", "alert", 0.07))
					e.mash_pop = 1.0
					Sfx.play("scuff", null, {"vol": -12.0, "pitch": 1.0 + float(e.mash) * 0.4})
					if float(e.mash) >= 0.999: _pounce(e)
					return true
			"fleeing":
				if debug: print("wild: A on a fleeing one: %.1f m, window %.2f, grab %.2f" % [d, float(e.window), float(e.grab)])
				if float(e.window) > 0.0 and d <= brain.tv("grab", "d", 3.2):
					e.grab = minf(1.0, float(e.grab) + brain.tv("grab", "press", 0.55))
					e.mash_pop = 1.0
					if float(e.grab) >= 0.999: _grabbed(e)
					return true
			"curious":
				if d < 3.0:
					toaster.push("info", _name(e).to_upper(), "%s tilts its head at you. It doesn't want to battle." % _name(e), "ball", 2.4)
					e.node.mood("hop")
					return true
	return false

# the camera minds props between it and Ash while a hunt is on, an ambush, or his Pokémon are out (main.gd _camera)
func camera_care() -> bool:
	return not encs.is_empty() or tut.running() or (ambush != null and not ambush.cur.is_empty()) or (cast.get("companions") != null and not cast.companions.shown().is_empty())

# the tutorial's steps keep its Pidgey's spot in view: {at} or {} (main.gd _wild_frame)
func camera_hint() -> Dictionary:
	if not tut.running() or not tut.state in ["intro", "watch", "crouch", "sneak", "engage", "track"]: return {}
	if tut.state == "intro" or tut.e.is_empty(): return {"at": tut.plan, "side": 0.3} if tut.plan is Vector3 else {}
	var n = tut.e.get("node")
	if n == null or not is_instance_valid(n): return {}
	return {"at": (n as Node3D).position, "side": 0.3}

# the compass's goal while tracking one that fled (island.gd): {pos, name} or {}
# (a few fled in a hunt: the latest)
func track_hint() -> Dictionary:
	var best = null
	for e in encs:
		if bool(e.tracked) and String(e.state) in ["fleeing", "hidden"]:
			if best == null or float(e.fled_t) > float(best.fled_t): best = e
	return {"pos": best.at, "name": _name(best)} if best != null else {}

# ---------- the frame ----------
func update(dt: float) -> void:
	t += dt
	if shot: shot.step(dt)
	var outside: bool = not game.indoors
	var held := Battle.world_paused()   # (an ambush's battle: the rest of the wild waits, out of its floor)
	for e in encs:
		# (in a battle only its own Pokémon shows: the others keep out of its round floor)
		if e.node: e.node.visible = outside and bool(e.shown) and (not battle_on or e == _battle_e) and not held
	if not outside:
		if game.grass: game.grass.extra = []
		return
	_feathers(dt)
	if ambush and not battle_on: ambush.update(dt)
	if battle_on or held:
		if battle_on: _battle_poll()
		if game.grass: game.grass.extra = []
		hud.prompt = {}
		return
	if not lunge.is_empty(): _lunge(dt)
	var me: Vector3 = game.pos
	var speed := absf(float(game.speed))
	var riding: bool = cast.bike != null and cast.bike.riding()
	var crouched: bool = cast.crouching
	cooldown -= dt
	tut.update(dt)
	# settling: one at a time, never during the tutorial's own, nor in a hunt (its field is set)
	if encs.is_empty() and cooldown <= 0.0 and not tut.running() and hunt == null and (ambush == null or ambush.cur.is_empty()):
		_try_spawn(dt, me, speed, crouched, riding)
	var extra: Array = []
	hud.prompt = {}
	_prompt_d = INF
	for e in encs.duplicate(): _step(e, dt, me, speed, crouched, riding, extra)
	# the grass has a few push points to spare (grass.gd PUSH_MAX): the nearest twitches get them
	if extra.size() > 4: extra.sort_custom(func(a, b): return Vector2(a.x - me.x, a.y - me.z).length_squared() < Vector2(b.x - me.x, b.y - me.z).length_squared())
	# hunting, the camera comes down with him (crouched) into grass taller than it: the
	# blades at the lens and between it and him lean aside, first in the list
	if camera_care() and game.cam:
		var cp: Vector3 = game.cam.global_position
		if cp.y - game.world.height_at(cp.x, cp.z) < 1.9:
			for f in [0.7, 0.45, 0.2, 0.0]:
				var q := cp.lerp(me, f)
				extra.push_front(Vector4(q.x, q.z, 1.1, 1.0))
	if game.grass: game.grass.extra = extra
	hud.queue_redraw()

func _try_spawn(dt: float, me: Vector3, speed: float, crouched: bool, riding: bool) -> void:
	var hour: float = cast.clock.hour() if cast.clock else 12.0
	for s in sources:
		var reg: String = s.region(me)
		if reg == "": continue
		var cov := brain.cover(s.distance(me))
		if cov <= 0.0: continue
		var list := brain.species_for(s.id, reg, hour)
		if list.is_empty(): continue
		var lu := brain.lure(speed, crouched, riding)
		_last_lure = cov * lu
		if test_force == "spawn" or brain.spawn_roll(dt, cov, lu):
			var dd: Array = brain.t("spawn_d", [3.5, 9.0])
			var spot = s.pick_spot(me, float(game.yaw), float(dd[0]), float(dd[1]), _rng)
			if spot == null: continue
			var id := brain.pick_species(list)
			spawn(id, s, spot, brain.pick_temper(id))
			test_force = ""
			return

# a Pokémon settles at spot (ground height filled in)
func spawn(id: String, src: WildSource, spot: Vector3, temper: String, tutorial := false) -> Dictionary:
	spot.y = game.world.height_at(spot.x, spot.z)
	var node := make_creature(id)
	cast.add_child(node)
	node.position = spot
	node.rotation.y = _rng.randf() * TAU
	var e := {"species": id, "temper": temper, "source": src, "kind": src.tells if src else "grass", "at": spot, "node": node,
		"state": "hidden", "alert": 0.0, "wary": false, "t": 0.0, "life": 0.0, "burst_t": 0.3, "burst": 0.0, "burst_len": 0.0,
		"pts": [], "mash": 0.0, "mash_pop": 0.0, "grab": 0.0, "window": 0.0, "tutorial": tutorial, "tracked": false,
		"fled_t": -1.0, "path": {}, "shown": false, "told": false, "trail_d": 0.0, "patch": src.patch_of(spot) if src else -1, "bob_t": 2.0,
		"hunt": false, "level": 0, "flies": bool(brain.info(id).get("flee", {}).get("fly", true)), "birdy": node.get("flying") != null}
	node.mood("hide")
	_burst(e, 1.0)   # (a rustle as it settles in)
	encs.append(e)
	print("wild: %s (%s) settled at %s, %.1f m from Ash%s" % [id, temper, str(spot), _d2(game.pos, spot), " (tutorial)" if tutorial else ""])
	return e

# Creature.make(id) when that species' model is in the build, else the stand-in
# (Pidgey's own, or the battle's simple one for the rest)
static func make_creature(id: String) -> Node3D:
	if ResourceLoader.exists("res://creatures/%s.glb" % String(WildBrain.MODEL_ID.get(id, id))):
		return Creature.make(String(WildBrain.MODEL_ID.get(id, id)))
	return STANDIN.make() if id == "pidgey" else PkmnStandin.make(id)

func _name(e: Dictionary) -> String:
	return String(brain.info(String(e.species)).get("name", String(e.species).capitalize()))

static func _d2(a: Vector3, b: Vector3) -> float: return Vector2(a.x - b.x, a.z - b.z).length()

# ---------- one encounter, a frame ----------
func _step(e: Dictionary, dt: float, me: Vector3, speed: float, crouched: bool, riding: bool, extra: Array) -> void:
	e.t = float(e.t) + dt
	e.life = float(e.life) + dt
	e.mash_pop = maxf(0.0, float(e.mash_pop) - dt * 5.0)
	var node: Node3D = e.node
	var d := _d2(me, node.position)
	match String(e.state):
		"hidden": _hidden(e, dt, me, speed, crouched, riding, d, extra)
		"fleeing", "flying": _fly(e, dt, me, d, extra)
		"attacking":
			# a hop out at him, then into the battle (it strikes first)
			var to := me + (node.position - me).normalized() * 1.3
			node.position = node.position.lerp(Vector3(to.x, node.position.y, to.z), 1.0 - exp(-dt * 5.0))
			node.position.y = game.world.height_at(node.position.x, node.position.z)
			_face(node, me, dt, 14.0)
			if float(e.t) > 0.6: _start_battle(e, "attacking", "wild")
		"curious": _curious(e, dt, me, d)
		"out":
			if float(e.t) > 1.8: _remove(e); return
		"leaving":
			var dir: Vector3 = e.get("dir", Vector3.FORWARD)
			if float(e.t) < 1.6:
				node.position += dir * dt * 1.6
				node.position.y = game.world.height_at(node.position.x, node.position.z)
				node.rotation.y = atan2(dir.x, dir.z)
				if fmod(float(e.t), 0.45) < dt: node.mood("hop")
			else:
				# then off it flies, for good
				_fly_to(e, node.position + dir * 35.0 + Vector3(0, 0, 0), "open", false)
				e.state = "flying"; e.gone = true
	_animate(e, dt, d)

func _animate(e: Dictionary, dt: float, _d: float) -> void:
	var node: Node3D = e.node
	var sp := 0.0
	if e.has("last_pos"): sp = (node.position - (e.last_pos as Vector3)).length() / maxf(dt, 1e-4)
	e.last_pos = node.position
	node.call("animate", dt, sp)

func _face(node: Node3D, at: Vector3, dt: float, k := 6.0) -> void:
	var want := atan2(at.x - node.position.x, at.z - node.position.z)
	node.rotation.y += wrapf(want - node.rotation.y, -PI, PI) * (1.0 - exp(-dt * k))

func _hidden(e: Dictionary, dt: float, me: Vector3, speed: float, crouched: bool, riding: bool, d: float, extra: Array) -> void:
	var node: Node3D = e.node
	var pk := peek()
	var in_tree: bool = String(e.kind) == "tree"
	e.shown = pk
	# what it notices of him
	var fwd := Vector3(sin(node.rotation.y), 0, cos(node.rotation.y))
	var to_me := Vector3(me.x - node.position.x, 0, me.z - node.position.z).normalized()
	var n := brain.noise(speed, crouched, riding)
	var senses := brain.senses(String(e.species), String(e.temper)) * (0.6 if bool(e.tutorial) else 1.0)
	var s := brain.stim(n, d, crouched, speed > 0.3, fwd.dot(to_me), senses)
	var src: WildSource = e.source
	if speed > 5.5 and d < 12.0 and src and src.patch_of(me) == int(e.patch) and int(e.patch) >= 0: s += 0.6   # running through its patch
	e.alert = brain.step_alert(float(e.alert), s, dt, bool(e.wary))
	if debug and fmod(float(e.t), 0.5) < dt: print("wild: d %.1f speed %.1f crouch %s noise %.2f stim %.2f alert %.2f" % [d, speed, crouched, n, s, e.alert])
	var wary_at := float(brain.t("wary_at", 0.45))
	var alert := float(e.alert)
	# how it sits: hidden, pressed low in the grass; peeking, up and about on the ground
	# (its own pecks and looks) and now and then fluttering up over the grass tops to
	# look round; listening, still, low and watching him
	var pose := "listen" if alert >= wary_at else ("peek" if pk else "hide")
	var up := bool(e.get("up", false))
	if pose != String(e.get("pose", "")):
		e.pose = pose
		node.set("auto", pose == "peek")
		if not up:
			match pose:
				"hide", "listen": node.mood("hide")
				"peek": node.mood("idle")
		e.peek_t = _rng.randf_range(0.8, 2.0)
	if alert >= wary_at:
		# listening: the grass stills, it turns toward him; up over the grass it drops
		# straight back down into it
		_face(node, me, dt, 3.0)
		node.set("look_at_pos", me + Vector3(0, 1.2, 0))
		e.burst = 0.0
		if up: _peek_down(e)
	else:
		node.set("look_at_pos", Vector3(NAN, NAN, NAN))
		e.burst_t = float(e.burst_t) - dt
		if float(e.burst_t) <= 0.0 and not up:
			var gap: Array = brain.t("burst_gap_wary" if bool(e.wary) else "burst_gap", [2.0, 4.5])
			e.burst_t = _rng.randf_range(float(gap[0]), float(gap[1]))
			_burst(e, 0.6 + 0.4 * _rng.randf())
	# the twitch: a few clumps shaken back and forth, strongest mid-burst
	if float(e.burst) > 0.0:
		e.burst = float(e.burst) - dt
		var u := 1.0 - float(e.burst) / maxf(0.01, float(e.burst_len))
		var env := sin(clampf(u, 0.0, 1.0) * PI)
		if String(e.kind) == "grass" or String(e.kind) == "tall_grass":
			for i in (e.pts as Array).size():
				var p: Vector3 = e.pts[i]
				var f := 17.0 + i * 5.0
				extra.append(Vector4(node.position.x + p.x, node.position.z + p.z, PUSH_W * (0.8 + p.y), env * float(e.amp) * sin(t * f + i * 2.1)))
	if not in_tree:
		var gy: float = game.world.height_at(node.position.x, node.position.z)
		node.position.y = lerpf(node.position.y, gy, 1.0 - exp(-dt * 6.0))
	# peeking (the setting): the grass here is about Ash's height, far over a Pidgey's
	# head, so it shows itself by fluttering up over the tops (a few wingbeats to
	# hover there, looking round, then down again), the blades thrashed by its wings
	if pk and not in_tree and alert < wary_at and node.get("flying") != null:
		e.peek_t = float(e.peek_t) - dt
		if not up and float(e.peek_t) <= 0.0 and not (node.has_method("busy") and bool(node.call("busy"))):
			e.up = true; up = true
			e.up_t = 0.0
			e.up_for = _rng.randf_range(float(brain.tv("peek", "hover_min", 1.4)), float(brain.tv("peek", "hover_max", 2.6)))
			node.set("auto", false)
			node.set("fly_height", float(brain.tv("peek", "height", 1.5)))
			node.set("glide", false)
			node.mood("takeoff")
			Sfx.play("wing_flap_small", node.position + Vector3(0, 1.0, 0), {"vol": -10.0, "dist": 22.0})
		elif up:
			e.up_t = float(e.up_t) + dt
			# hovering it looks this way and that (now and then at him)
			if fmod(float(e.up_t), 0.9) < dt: node.set("look_at_pos", (me + Vector3(0, 1.2, 0)) if _rng.randf() < 0.4 else node.position + Vector3(_rng.randf_range(-5, 5), 1.4, _rng.randf_range(-5, 5)))
			if float(e.up_t) > 1.2 + float(e.up_for): _peek_down(e)
	if up:
		var h := float(node.get("height"))
		if h > 0.15: extra.append(Vector4(node.position.x, node.position.z, 0.7, clampf(h / 1.2, 0.0, 1.0) * (0.55 + 0.25 * sin(t * 26.0))))
		if bool(e.get("landing", false)) and not bool(node.get("flying")):
			e.up = false; e.landing = false
			node.set("fly_height", 1.4)
			node.mood("idle" if pose == "peek" else "hide")
			node.set("auto", pose == "peek")
			var g2: Array = brain.tv_arr("peek", "gap", [2.5, 5.5])
			e.peek_t = _rng.randf_range(float(g2[0]), float(g2[1]))
	# peeking on the ground, now and then a peck or a look about (a creature with its own
	# idle acting, "auto", does that itself)
	if pk and alert < wary_at and not up and node.get("auto") == null:
		e.bob_t = float(e.bob_t) - dt
		if float(e.bob_t) <= 0.0:
			e.bob_t = _rng.randf_range(1.2, 3.2)
			node.mood(["peck", "peck", "ruffle", "hide", "look"][_rng.randi() % 5])
	# close enough: the pounce prompt
	var ed := float(brain.t("engage_d", 2.0))
	e.mash = maxf(0.0, float(e.mash) - brain.tv("mash", "decay", 0.45) * dt)
	if d <= ed + 0.6 and lunge.is_empty() and d < _prompt_d:
		_prompt_d = d
		hud.prompt = {"at": node.position + Vector3(0, 0.9, 0), "kind": "mash", "fill": float(e.mash), "near": d <= ed, "pop": float(e.mash_pop)}
	if alert >= 0.999:
		_startle(e, d)
		return
	# it leaves when he goes away, or it has waited long enough (not the tutorial's, nor a
	# fled one, nor a hunt's: that field stays till the hunt ends)
	if not bool(e.tutorial) and not bool(e.tracked) and not bool(e.hunt):
		if d > float(brain.t("leave_d", 40.0)) or (float(e.life) > float(brain.t("life_s", 120.0)) and d > 12.0): _remove(e)
	# a fled one forgets him after a while (a hunt's just stops being tracked)
	if bool(e.tracked) and t - float(e.fled_t) > float(brain.info(String(e.species)).get("forget", 150.0)):
		print("wild: %s forgot about Ash" % e.species)
		if bool(e.hunt): e.tracked = false
		else: _remove(e)

# down from a peek over the grass (it lands where it was)
func _peek_down(e: Dictionary) -> void:
	if bool(e.get("landing", false)): return
	e.landing = true
	(e.node as Node3D).call("mood", "land")

# a burst of twitching: a few points round it, a rustle, sometimes a feather
func _burst(e: Dictionary, amp: float) -> void:
	var lr: Array = brain.t("burst_len", [0.5, 0.9])
	e.burst_len = _rng.randf_range(float(lr[0]), float(lr[1]))
	e.burst = float(e.burst_len)
	e.amp = float(brain.t("twitch_amp", 1.5)) * amp
	if debug: print("wild: burst at t %.2f" % t)
	var pts := []
	for i in 2 + _rng.randi() % 2:
		var a := _rng.randf() * TAU
		var r := _rng.randf_range(0.1, 0.45)
		pts.append(Vector3(cos(a) * r, _rng.randf() * 0.4, sin(a) * r))
	e.pts = pts
	var node: Node3D = e.node
	var at: Vector3 = node.position
	if String(e.kind) in ["bush", "tree"]:
		Sfx.play("bush_rustle", at + Vector3(0, 1.0, 0), {"vol": -9.0, "dist": 20.0})
		for i in 3: _feather(at + Vector3(_rng.randf_range(-0.6, 0.6), (2.5 if String(e.kind) == "tree" else 0.9), _rng.randf_range(-0.6, 0.6)), true)
	else:
		Sfx.play("creature_rustle", at, {"vol": -7.0 + amp * 3.0, "dist": 22.0})
	var tl: Dictionary = brain.info(String(e.species)).get("tells", {})
	if _rng.randf() < float(tl.get("feather", 0.3)): _feather(at + Vector3(0, 0.6, 0), not bool(e.get("birdy", true)))
	if _rng.randf() < 0.3: Sfx.play("critter_chirp", at, {"vol": -14.0, "pitch": 1.3, "dist": 16.0})

# ---------- startled ----------
func _startle(e: Dictionary, d: float) -> void:
	var node: Node3D = e.node
	var r := "flee" if bool(e.tutorial) else brain.pick_reaction(String(e.species), String(e.temper), d)
	if test_force.begins_with("react="): r = test_force.substr(6)
	print("wild: %s startled at %.1f m: %s (%s)" % [e.species, d, r, e.temper])
	e.shown = true
	node.visible = true
	e.t = 0.0
	var birdy := bool(e.get("birdy", true))
	if birdy:
		Sfx.play("wing_flap_small", node.position, {"vol": -2.0})
		Sfx.play("bird_call", node.position, {"vol": -6.0, "pitch": 1.25})
	else:
		# (no wings: a cry and the grass thrashed, bits of it flying)
		Sfx.play("creature_call", node.position, {"vol": -5.0, "pitch": _rng.randf_range(1.0, 1.3)})
		Sfx.play("creature_rustle", node.position, {"vol": -2.0})
	for i in 4: _feather(node.position + Vector3(0, 0.4, 0), not birdy)
	_burst(e, 1.6)
	match r:
		"attack":
			e.state = "attacking"
			node.mood("startle")
			toaster.push("warn", _name(e).to_upper() + " ATTACKS!", "It burst out of the grass at you!", "bang", 1.8)
		"curious":
			e.state = "curious"
			e.cur_t = _rng.randf_range(7.0, 10.0)
			e.orbit = atan2(node.position.x - game.pos.x, node.position.z - game.pos.z)
			node.mood("hop")
			toaster.push("info", "CURIOUS " + _name(e).to_upper(), "It hopped out to have a look at you. It won't battle.", "chat", 2.6)
		_:
			var zone := _safe_zone(e)
			_fly_to(e, zone.at, String(zone.kind), true)
			e.state = "fleeing"
			e.window = brain.tv("grab", "window", 1.3)
			e.grab = 0.0
			e.zone_kind = String(zone.kind)
			node.mood("takeoff" if bool(e.get("flies", true)) else "startle")

func _safe_zone(e: Dictionary) -> Dictionary:
	var node: Node3D = e.node
	var from: Vector3 = node.position
	var cands := []
	for s in sources: cands.append_array(s.safe_spots(from, 80.0))
	var sw = game.get("sfx_world") if BattleArena.I == null else null   # (the town's plants; the arena's come from its source)
	if sw:
		# bushes (the plant buckets) and trees round about
		var key := Vector2i(floori(from.x / 4.0), floori(from.z / 4.0))
		for dj in range(-16, 17, 2):
			for di in range(-16, 17, 2):
				var a = sw.plants.get(key + Vector2i(di, dj))
				if a == null: continue
				for k in range(0, (a as PackedFloat32Array).size(), 3):
					if a[k + 2] < 0.5: continue
					cands.append({"at": Vector3(a[k], 0, a[k + 1]), "kind": "bush", "r": a[k + 2]})
					break
		for tr: Vector3 in sw.trees:
			if absf(tr.x - from.x) < 70.0 and absf(tr.z - from.z) < 70.0: cands.append({"at": Vector3(tr.x, 0, tr.z), "kind": "tree", "r": tr.y})
	# on foot: no perching up a tree
	if not bool(e.get("flies", true)): cands = cands.filter(func(c): return String(c.kind) != "tree")
	var z := brain.pick_safe(String(e.species), from, game.pos, cands)
	var at: Vector3 = z.at
	# a bush: at its edge facing back the way it came; a tree: up in it
	if String(z.kind) == "bush":
		var back := Vector3(from.x - at.x, 0, from.z - at.z).normalized()
		at += back * float(z.get("r", 1.0)) * 0.7
	at.y = game.world.height_at(at.x, at.z)
	if String(z.kind) == "tree": at.y += clampf(float(z.get("r", 3.0)) * 0.9, 2.5, 5.0)
	print("wild: %s flees to a %s %.0f m off" % [e.species, z.kind, _d2(from, at)])
	return {"at": at, "kind": z.kind}

# off through the air to `to` (where it lands; a tree's perch is up in it); one that
# can't fly runs there instead (_run)
func _fly_to(e: Dictionary, to: Vector3, kind: String, track: bool) -> void:
	var node: Node3D = e.node
	var F: Dictionary = brain.info(String(e.species)).get("flee", {})
	var from := node.position
	var dist := _d2(from, to)
	var v := float(F.get("speed", 10.0))
	e.path = {"from": from, "to": to, "dur": maxf(1.2, dist / v + 0.9), "h": float(F.get("height", 4.5)) + dist * 0.04, "kind": kind}
	if not bool(e.get("flies", true)):
		# on foot: a curve to one side (it breaks away, not straight), a weave in it
		var side := 1.0 if _rng.randf() < 0.5 else -1.0
		e.path.merge({"run": true, "dur": maxf(1.0, dist / v * 1.12 + 0.35), "bend": side * clampf(dist * 0.12, 1.0, 4.5),
			"weave": _rng.randf_range(0.25, 0.5), "wn": float(_rng.randi_range(2, 4))}, true)
	if track:
		# (startled off the ground: the launch before it goes)
		e.path.launch = true
		e.path.dur = float(e.path.dur) + float(brain.tv("flee_launch", "s", 0.4))
	e.t = 0.0
	e.fph = ""
	e.up = false; e.landing = false
	e.tracked = track
	e.trail_d = 0.0
	e.at = to
	if track: e.fled_t = t

# (a creature that floats, with no fly_height of its own, rises on its node)
static func _fh(node: Node3D) -> float:
	var v = node.get("fly_height")
	return float(v) if v != null else 0.0

func _fly(e: Dictionary, dt: float, me: Vector3, d: float, extra: Array) -> void:
	var node: Node3D = e.node
	var P: Dictionary = e.path
	if P.has("run"):
		_run(e, dt, me, d, extra); return
	var lifts := node.get("fly_height") != null
	var u := clampf(float(e.t) / float(P.dur), 0.0, 1.0)
	var from: Vector3 = P.from
	var to: Vector3 = P.to
	# up first (the take-off's first wingbeats lift it nearly in place, a short drift
	# away: the moment he can still grab it), then fast off, easing down onto its new spot
	var launch := float(brain.tv("flee_launch", "s", 0.4)) if P.has("launch") else 0.0
	var ul := clampf((float(e.t) - launch) / maxf(0.1, float(P.dur) - launch), 0.0, 1.0)
	var k := WildBrain.sm(0.0, 1.0, ul) * 0.35 + ul * 0.65
	k = 1.0 - pow(1.0 - k, 1.6)
	if launch > 0.0: k = maxf(k, float(brain.tv("flee_launch", "drift", 0.7)) / maxf(1.0, _d2(from, to)) * WildBrain.sm(0.0, launch, float(e.t)))
	var flat := Vector3(lerpf(from.x, to.x, k), 0, lerpf(from.z, to.z, k))
	var g: float = game.world.height_at(flat.x, flat.z)
	var base := maxf(g, lerpf(from.y, to.y, WildBrain.sm(0.6, 1.0, u)))
	var h := float(P.h) * WildBrain.sm(0.0, 0.22, u) * (1.0 - WildBrain.sm(0.7, 1.0, u))
	var prev := node.position
	var prev_air := prev.y + _fh(node) * (1.0 if node.get("flying") == true else 0.0)
	# the node stays on what is under it (the ground, or the branch it perches on at the
	# end); the bird's height over that is its fly_height
	node.position = Vector3(flat.x, base + (0.0 if lifts else maxf(0.0, h)), flat.z)
	if lifts: node.set("fly_height", maxf(0.0, h))
	var mv := node.position - prev
	if Vector2(mv.x, mv.z).length() > 1e-4: node.rotation.y = atan2(mv.x, mv.z)
	node.rotation.x = 0.0
	var ph := "takeoff" if u < 0.1 else ("fly" if u < 0.72 else ("glide" if u < 0.93 else "land"))
	if ph != String(e.get("fph", "")):
		e.fph = ph
		node.set("auto", false)
		if ph == "takeoff": node.set("flying", false)   # (from the ground: the take-off act lifts it)
		node.mood(ph)
	var air := node.position.y + _fh(node)
	mv.y = air - prev_air
	# the take-off blasts the grass flat round it
	if float(e.t) < 0.5:
		extra.append(Vector4(from.x, from.z, 1.1, 1.0 - float(e.t) / 0.5))
	# a feather every few metres along the way (the trail he can follow)
	e.trail_d = float(e.trail_d) + Vector2(mv.x, mv.z).length()
	if bool(e.tracked) and float(e.trail_d) > 5.5:
		e.trail_d = 0.0
		_feather(node.position + Vector3(0, _fh(node), 0), not bool(e.get("birdy", true)))
	if fmod(float(e.t), 0.3) < dt and u < 0.8: Sfx.play("wing_flap_small", node.position, {"vol": -8.0, "dist": 26.0})
	_grab_window(e, dt, d, _fh(node), "It flew off toward %s. Follow the feathers and your compass." % _kind_text(String(P.kind)))
	if u >= 1.0: _landed(e)

# grabbed in time? (the window right after it bolts), and the toast once it is away
func _grab_window(e: Dictionary, dt: float, d: float, up: float, told: String) -> void:
	if String(e.state) != "fleeing": return
	var node: Node3D = e.node
	e.window = maxf(0.0, float(e.window) - dt)
	e.grab = maxf(0.0, float(e.grab) - brain.tv("grab", "decay", 0.8) * dt)
	if float(e.window) > 0.0 and d <= brain.tv("grab", "d", 3.2) and d < _prompt_d:
		_prompt_d = d
		hud.prompt = {"at": node.position + Vector3(0, 0.5 + up, 0), "kind": "grab", "fill": float(e.grab), "near": true, "left": float(e.window) / brain.tv("grab", "window", 1.3), "pop": float(e.mash_pop)}
	if float(e.window) <= 0.0 and not bool(e.told) and bool(e.tracked):
		e.told = true
		toaster.push("step", _name(e).to_upper() + " FLED!", told, "bang", 3.2)

# there: hiding again, warier now (or gone, leaving for good)
func _landed(e: Dictionary) -> void:
	var node: Node3D = e.node
	var P: Dictionary = e.path
	if bool(e.get("gone", false)):
		_remove(e); return
	e.state = "hidden"
	e.kind = "grass" if String(P.kind) in ["tall_grass", "open"] else String(P.kind)
	e.wary = true
	e.alert = 0.3
	e.t = 0.0
	e.burst_t = 0.8
	e.mash = 0.0
	e.patch = (e.source as WildSource).patch_of(node.position) if e.source else -1
	e.fph = ""
	e.pose = ""
	if node.get("fly_height") != null: node.set("fly_height", 0.0)
	print("wild: %s hides again in a %s at %s" % [e.species, P.kind, str(node.position)])

# off on foot: a spring out of the grass (the startle: the moment he can grab it),
# then a dash low and fast on a bending line, weaving a little, the blades parting
# round it as it goes (its trail through the grass), easing into its new cover
func _run(e: Dictionary, dt: float, _me: Vector3, d: float, extra: Array) -> void:
	var node: Node3D = e.node
	var P: Dictionary = e.path
	var u := clampf(float(e.t) / float(P.dur), 0.0, 1.0)
	var from: Vector3 = P.from
	var to: Vector3 = P.to
	var launch := float(brain.tv("flee_launch", "s", 0.4)) if P.has("launch") else 0.0
	var ul := clampf((float(e.t) - launch) / maxf(0.1, float(P.dur) - launch), 0.0, 1.0)
	# quick to full speed, a short slowing at the end
	var k := ul * ul * (1.6 - 0.6 * ul) if ul < 0.25 else ul
	k = lerpf(k, 1.0 - pow(1.0 - ul, 2.0), WildBrain.sm(0.75, 1.0, ul))
	var dir := Vector3(to.x - from.x, 0, to.z - from.z)
	var L := maxf(0.01, dir.length())
	dir /= L
	var side := Vector3(dir.z, 0, -dir.x)
	var off := float(P.bend) * sin(k * PI) + float(P.weave) * sin(k * PI * float(P.wn)) * sin(k * PI)
	var flat := from + dir * L * k + side * off
	flat = game.world.collide(Vector3(flat.x, 0, flat.z), 0.3)
	var prev := node.position
	node.position = Vector3(flat.x, game.world.height_at(flat.x, flat.z), flat.z)
	var mv := node.position - prev
	if Vector2(mv.x, mv.z).length() > 1e-4: node.rotation.y = lerp_angle(node.rotation.y, atan2(mv.x, mv.z), 1.0 - exp(-dt * 16.0))
	node.rotation.x = 0.0
	var ph := "spring" if float(e.t) < launch else ("dash" if ul < 0.9 else "settle")
	if ph != String(e.get("fph", "")):
		e.fph = ph
		node.set("auto", false)
		match ph:
			"spring": node.mood("startle")
			"dash": node.mood("flee")
			"settle": node.mood("hide")
	var in_grass: bool = e.source != null and (e.source as WildSource).contains(node.position)
	# the burst out of the grass, then the blades parting along its way (a short trail)
	if float(e.t) < 0.4: extra.append(Vector4(from.x, from.z, 0.9, 1.0 - float(e.t) / 0.4))
	if in_grass and ul < 0.97:
		extra.append(Vector4(node.position.x, node.position.z, 0.65, 1.0))
		var tr: Array = e.get("trail", [])
		tr.push_front([node.position, 0.0])
		for q in tr: q[1] = float(q[1]) + dt
		e.trail = tr.filter(func(q): return float(q[1]) < 0.5).slice(0, 6)
		for i in range(1, (e.trail as Array).size(), 2):
			var q: Array = e.trail[i]
			extra.append(Vector4(q[0].x, q[0].z, 0.55, 0.8 * (1.0 - float(q[1]) / 0.5)))
	# its feet: a patter, louder in the grass
	e.trail_d = float(e.trail_d) + Vector2(mv.x, mv.z).length()
	if float(e.trail_d) > 0.9 and ul < 0.95:
		e.trail_d = 0.0
		Sfx.play("step_tallgrass_run" if in_grass else "patter_small", node.position, {"vol": -10.0, "dist": 24.0})
		if in_grass and _rng.randf() < 0.25: _feather(node.position + Vector3(0, 0.5, 0), true)
	_grab_window(e, dt, d, 0.0, "It ran off toward %s. Follow the rustling and your compass." % _kind_text(String(P.kind)))
	if u >= 1.0:
		e.trail = []
		_landed(e)

func _kind_text(k: String) -> String:
	return {"tall_grass": "another patch of tall grass", "bush": "a bush", "tree": "a tree"}.get(k, "the open")

func _curious(e: Dictionary, dt: float, me: Vector3, _d: float) -> void:
	var node: Node3D = e.node
	e.cur_t = float(e.cur_t) - dt
	node.set("look_at_pos", me + Vector3(0, 1.2, 0))
	# round him in little hops, a couple of metres off, looking at him
	e.orbit = float(e.orbit) + dt * 0.45
	var want := me + Vector3(sin(float(e.orbit)), 0, cos(float(e.orbit))) * 1.9
	var to := want - node.position
	to.y = 0
	if to.length() > 0.15:
		node.position += to.normalized() * minf(to.length(), dt * 1.8)
	node.position.y = game.world.height_at(node.position.x, node.position.z)
	_face(node, me, dt, 5.0)
	if fmod(float(e.t), 0.6) < dt: node.mood("hop" if _rng.randf() < 0.7 else "look")
	if float(e.cur_t) <= 0.0:
		e.state = "leaving"; e.t = 0.0
		var away := Vector3(node.position.x - me.x, 0, node.position.z - me.z).normalized()
		e.dir = away if away.length() > 0.1 else Vector3.FORWARD

# ---------- the pounce and the grab ----------
func _pounce(e: Dictionary) -> void:
	var node: Node3D = e.node
	cast.set_crouch(false)
	var me: Vector3 = game.pos
	var dir := Vector3(node.position.x - me.x, 0, node.position.z - me.z).normalized()
	var stop := node.position - dir * 0.7
	lunge = {"t": 0.0, "from": me, "to": Vector3(stop.x, me.y, stop.z), "e": e, "kind": "pounce"}
	game.yaw = atan2(dir.x, dir.z)
	cast.vy = 3.6; cast.ground = false
	e.state = "pounced"
	e.shown = true
	node.visible = true
	node.mood("startle")
	Sfx.play("whoosh", null, {"vol": -6.0})
	Sfx.play("encounter", null, {"vol": -4.0})
	print("wild: Ash pounces on the %s" % e.species)

func _grabbed(e: Dictionary) -> void:
	var node: Node3D = e.node
	e.state = "pounced"
	e.tracked = false
	node.mood("land")
	var me: Vector3 = game.pos
	var dir := Vector3(node.position.x - me.x, 0, node.position.z - me.z).normalized()
	var at := me + dir * 1.2
	node.position = Vector3(at.x, game.world.height_at(at.x, at.z), at.z)
	lunge = {"t": 0.0, "from": me, "to": me + dir * 0.4, "e": e, "kind": "grab", "state": "fleeing"}
	game.yaw = atan2(dir.x, dir.z)
	cast.set_crouch(false)
	cast.vy = 3.0; cast.ground = false
	Sfx.play("whoosh", null, {"vol": -6.0})
	Sfx.play("encounter", null, {"vol": -4.0})
	print("wild: Ash grabbed the fleeing %s" % e.species)

func _lunge(dt: float) -> void:
	lunge.t = float(lunge.t) + dt
	var u := clampf(float(lunge.t) / 0.42, 0.0, 1.0)
	var to: Vector3 = lunge.to
	var want := Vector3(lerpf(lunge.from.x, to.x, UITheme.ease_out(u)), 0, lerpf(lunge.from.z, to.z, UITheme.ease_out(u)))
	var np: Vector3 = game.world.step(game.pos, want.x - game.pos.x, want.z - game.pos.z)
	game.pos.x = np.x; game.pos.z = np.z
	game.speed = 4.0 * (1.0 - u)
	if u >= 1.0:
		game.speed = 0.0
		var e: Dictionary = lunge.e
		var st: String = lunge.get("state", "hidden")
		lunge = {}
		_start_battle(e, st, "ash")

# ---------- the battle (native/battle/ Battle, or the stand-in) ----------
static func _battle_script() -> Script:
	if battle_override: return battle_override
	for c in ProjectSettings.get_global_class_list():
		if String(c.get("class", "")) == "Battle": return load(String(c.path))
	return STUB

func _start_battle(e: Dictionary, state: String, first: String) -> void:
	if battle_on: return
	e.state = "battle"
	hud.prompt = {}
	battle_on = true
	_battle_e = e
	var node: Node3D = e.node
	var opts := {"species": String(e.species), "creature": node, "at": node.position, "temper": String(e.temper),
		"state": state, "where": "tall_grass" if String(e.kind) in ["grass", "tall_grass"] else String(e.kind), "first_strike": first}
	# a hunt's: its level, and Ash alone or with his party (arena_hunt.gd battle_opts)
	if bool(e.get("hunt", false)) and hunt: opts.merge(hunt.battle_opts(e), true)
	var B := _battle_script()
	var r = B.call("start", game, opts)
	_battle_src = null
	if r is Object and (r as Object).has_signal("finished"): _battle_src = r
	elif B.has_script_signal("finished"):
		# the battle node in the scene: an instance of the class
		for n in game.get_children():
			if n.get_script() == B: _battle_src = n
	if _battle_src: _battle_src.connect("finished", _on_battle_finished, CONNECT_ONE_SHOT)
	tut.on_battle_start(e)

func _battle_poll() -> void:
	if _battle_src != null and is_instance_valid(_battle_src): return
	# nothing to wait on: done when the class says it is no longer active
	var B := _battle_script()
	if _battle_src == null and not bool(B.get("active") if B.get("active") != null else false):
		_on_battle_finished({"outcome": "ran"})

func _on_battle_finished(result: Dictionary) -> void:
	if not battle_on: return
	battle_on = false
	_battle_src = null
	var e := _battle_e
	_battle_e = {}
	var out := String(result.get("outcome", "ran"))
	print("wild: battle over: ", out)
	cooldown = float(brain.t("cooldown_s", 15.0))
	if not encs.has(e): return
	var node: Node3D = e.node
	if not is_instance_valid(node): encs.erase(e); return
	if node.get_parent() != cast:
		# (the battle may have taken it into its arena)
		var gp := node.global_position
		node.get_parent().remove_child(node); cast.add_child(node); node.global_position = gp
	node.position.y = game.world.height_at(node.position.x, node.position.z)
	# a hunt's: beaten by his Pokémon it is out of the field (the rest as on Route 1)
	if bool(e.get("hunt", false)) and out == "ash_won" and String(result.get("pkmn_outcome", "")) == "won":
		out = "defeated"
	if bool(e.get("hunt", false)) and hunt: hunt.on_result(e, out)
	match out:
		"defeated":
			# (it lies a moment where it fell, then it's gone)
			e.state = "out"; e.t = 0.0; e.shown = true
			node.mood("faint")
		"fled", "ash_won":
			var zone := _safe_zone(e)
			_fly_to(e, zone.at, String(zone.kind), true)
			e.state = "flying"; e.told = false
			node.mood("takeoff")
			toaster.push("step", _name(e).to_upper() + " FLED!", "It %s off toward %s. You can track it." % ["flew" if bool(e.get("flies", true)) else "ran", _kind_text(String(zone.kind))], "bang", 3.0)
		"disengaged":
			e.state = "leaving"; e.t = 0.0
			e.dir = Vector3(node.position.x - game.pos.x, 0, node.position.z - game.pos.z).normalized()
		"ash_down":
			_remove(e)
		_:
			# he ran: it stays hidden where it is, on edge
			e.state = "hidden"; e.alert = 0.6; e.wary = true; e.mash = 0.0
			node.mood("hide")
	tut.on_battle_end(e, out)

func _remove(e: Dictionary) -> void:
	if is_instance_valid(e.node): (e.node as Node).queue_free()
	var had := encs.has(e)
	encs.erase(e)
	cooldown = maxf(cooldown, float(brain.t("cooldown_s", 15.0)) * 0.5)
	if had and bool(e.get("hunt", false)) and hunt: hunt.on_removed(e)

func clear() -> void:
	for e in encs.duplicate(): _remove(e)

# ---------- feathers (and leaves): little cards that flutter down and lie a while ----------
static var _fmats := {}
func _feather(at: Vector3, leaf: bool) -> void:
	if feathers.size() > 48:
		var old: Dictionary = feathers.pop_front()
		(old.node as Node).queue_free()
	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.05, 0.13) if not leaf else Vector2(0.07, 0.07)
	mi.mesh = qm
	var key := "leaf" if leaf else ("f%d" % (_rng.randi() % 2))
	if not _fmats.has(key):
		var m := StandardMaterial3D.new()
		m.albedo_color = Color("5f8a2e") if leaf else (Color("f0dcb0") if key == "f0" else Color("9a6a3a"))
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_fmats[key] = m
	mi.material_override = _fmats[key]
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	cast.add_child(mi)
	mi.position = at
	var f := {"node": mi, "v": Vector3(_rng.randf_range(-0.8, 0.8), _rng.randf_range(0.3, 1.2), _rng.randf_range(-0.8, 0.8)),
		"spin": _rng.randf_range(2.0, 5.0), "ph": _rng.randf() * TAU, "t": 0.0, "life": 40.0 if not leaf else 6.0, "rest": false}
	feathers.append(f)

func _feathers(dt: float) -> void:
	for f in feathers.duplicate():
		f.t = float(f.t) + dt
		var mi: MeshInstance3D = f.node
		if not is_instance_valid(mi): feathers.erase(f); continue
		if not bool(f.rest):
			var v: Vector3 = f.v
			v.y = maxf(v.y - 4.0 * dt, -0.55)          # drag: a feather sinks slowly
			v.x *= exp(-dt * 1.5); v.z *= exp(-dt * 1.5)
			var sway := sin(float(f.t) * float(f.spin) + float(f.ph))
			mi.position += (v + Vector3(sway * 0.35, 0, cos(float(f.t) * float(f.spin)) * 0.2)) * dt
			mi.rotation = Vector3(sway * 0.8, float(f.t) * float(f.spin), cos(float(f.t) * 2.0) * 0.6)
			f.v = v
			var g: float = game.world.height_at(mi.position.x, mi.position.z) + 0.02
			if mi.position.y <= g:
				mi.position.y = g; f.rest = true
				mi.rotation = Vector3(-PI / 2.0 + 0.1, _rng.randf() * TAU, 0)
		if float(f.t) > float(f.life):
			mi.queue_free(); feathers.erase(f)

# ---------- dev: render cases: main.tscn -- --wild-test=<case> (wild_shot.gd) ----------
