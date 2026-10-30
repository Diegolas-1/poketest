extends Node
# Dev only: the Battle Arena (arena/arena.gd) for renders and quick play.
#   godot --path native res://dev/arena_shot.tscn -- [options]
#   --case=play        straight into the arena, to play by hand (default)
#   --case=view        a still of the place from --cam=aerial|field|grass|gate|walk
#   --case=menu        the staging menu, --page=wild|trainer|slot|saved
#   --case=trainer     a staged trainer battle (the formal opening, then the battle),
#                      both sides by the AI (--manual: Ash's side by hand), --call /
#                      --coin heads|tails, --preset=brock|misty|gary, --n=3 a side
#                      --switch=turn,index: Ash switches by choice on that turn; --doubles
#   --case=wild        a staged wild battle (--start=hidden|startled|open, --alone)
#   --case=results     a results card (a quick 3v3 played out headless, then shown)
#   --case=hunt        a hunt (arena/arena_hunt.gd): --act=tells (Ash crouch-creeps into a
#                      patch, a few hiding round him twitching the grass), pounce (on in,
#                      the A-mash, into the battle), run (a Rattata startled runs off to
#                      another patch, the camera after it); --species=a,b --n=8
#   --case=forest      the forest region (arena/regions/forest_life.gd): --act=spot (Ash
#                      stops under a tree with a Kakuna on its thread, looks up, a pebble),
#                      shake (he shakes the trunk, it drops: the battle), hive (he walks up
#                      to the hive upright: the buzz, BEEDRILL ARE COMING!), nest (crouched
#                      by the Pidgey nest, then upright: the parent dives); --species=kakuna
#   --case=ambush      Ash's Pokémon out with him and the ambushes (wild/ash_companions.gd,
#                      wild/ambush.gd): --act=follow (Pikachu and Pidgeotto thrown out, they
#                      follow him up the path, wait by him, sneak when he crouches), bush (a
#                      Beedrill jumps him from a thicket: the standoff, POKéMON, Pikachu runs
#                      in), intercept (Pikachu and Bulbasaur out cut off two Beedrill),
#                      swarm (four Beedrill against his two, two at a time), run (RUN: away,
#                      it chases a little way); --region=forest: up the forest's trail, the
#                      bush by it (as the REGIONS page's AMBUSH)
#   --shot=PATH --shot-at=s     one still at s seconds, then quit
#   --frames=DIR --every=n      the whole viewport every n-th frame (with --fixed-fps 15)
#   --stats [--stats-every=n]   draw calls, triangles and objects every n frames (15)
#   --quit-at=s                 quit at s seconds
#   --skip-at=s                 press SKIP in the opening at s seconds
#   --seed=n --hour=h --device=touch|pad|keys

var A := {}
var main: Node
var frame := 0
var t := 0.0
var _did := {}

func _ready() -> void:
	process_priority = 100
	process_mode = Node.PROCESS_MODE_ALWAYS   # (a menu that pauses the game: the script still drives it)
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("device"): UIInput.force(String(A.device))
	main = load("res://main.tscn").instantiate()
	main.process_mode = Node.PROCESS_MODE_PAUSABLE   # (the game itself still pauses)
	add_child(main)

func _once(key: String) -> bool:
	if _did.has(key): return false
	_did[key] = true
	return true

func _process(dt: float) -> void:
	frame += 1
	t += dt
	if A.has("frames") and frame % maxi(1, int(A.get("every", "1"))) == 0: _grab.call_deferred("%s/f%05d.png" % [A.frames, frame])
	# --skip-draw: only the frames kept are drawn (the game runs every frame as ever; a render
	# on a busy machine goes several times faster)
	if A.has("frames") and A.has("skip-draw"): RenderingServer.render_loop_enabled = frame % maxi(1, int(A.get("every", "1"))) == 0 or frame < 3
	if A.has("shot") and t >= float(A.get("shot-at", "3")) and _once("shot"):
		_grab.call_deferred(String(A.shot))
		get_tree().create_timer(0.3).timeout.connect(func(): get_tree().quit())
	if A.has("quit-at") and t >= float(A.get("quit-at")) and _once("quit"): get_tree().quit()
	if A.has("stats") and frame % int(A.get("stats-every", "15")) == 0:
		print("stats: wall %d t %.1f draws %d prims %dk objects %d real %.0f ms" % [Time.get_ticks_msec(), t, Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME) / 1000.0), Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0])
	if frame == 3:
		# (his Pokémon out with him: a save of the shots' own, never the player's)
		main.cast.companions.save_path = "user://companions_shot.save"
		main.cast.companions.autosave = false
		main.cast.clock.real = false; main.cast.clock.ff = 1.0; main.cast.clock.set_time(float(A.get("hour", "10.5")))
	if frame == 8 and not String(A.get("case", "")) in ["town", "oak"] and _once("enter"): BattleArena.enter(main, true)
	# --case=oak (with -- --cast-test=convo --convo-who=oak --convo-picks=...): Oak's talk takes
	# Ash to the arena; 5 s there, then out again: back in the lab where he spoke with Oak
	if String(A.get("case", "")) == "oak":
		if BattleArena.I and not _did.has("in_t"): _did["in_t"] = t; _did["from"] = main.pos
		if _did.has("in_t") and t - float(_did.in_t) > 5.0 and _once("leave"):
			print("oak-case: leaving the arena")
			BattleArena.I.leave()
		if _did.has("leave") and not main.trans_busy and BattleArena.I == null and _once("back"):
			_did["back_t"] = t
		if _did.has("back_t") and t - float(_did.back_t) > 1.0 and _once("report"):
			print("oak-case: back indoors=%s interior=%s pos=%s" % [main.indoors, main.interior.data.id if main.interior else "-", str(main.pos)])
		return
	if String(A.get("case", "")) == "town" and frame < 30:
		main.pos = Vector3(-13.0, main.world.height_at(-13.0, -95.0), -95.0)
		main.cast.land(main.pos.y)
	var ar: BattleArena = BattleArena.I
	if ar == null or frame < 12: return
	var c := String(A.get("case", "play"))
	if A.has("nolife") and _once("nolife"):
		for id in ar.regions:
			var r = ar.regions[id]
			if r.life: r.life.set_process(false); r.life.hud.set_process(false)
			for n in r.find_children("*", "Node3D", true, false):
				if n is Creature: n.visible = false
	match c:
		"view":
			# (stills: the forest's hive and nest left be as the camera's Ash hops about)
			var fl = ar.life_of("forest")
			if fl and _once("calm"):
				fl.auto_hunt = A.has("hunt")
				if not fl.hive.is_empty(): fl.hive.cool = 1e9
				if not fl.nest.is_empty(): fl.nest.cool = 1e9
			# --cams=a,b,c: each one held 1.2 s (--hold=s) from 3 s, a still of each (view_<cam>.png in --out)
			var cams: Array = Array(String(A.get("cams", A.get("cam", "aerial"))).split(","))
			var hold := float(A.get("hold", "1.2"))
			var i := int((t - 3.0) / hold)
			if t >= 3.0 and i < cams.size():
				A["cam"] = cams[i]
				_view(ar)
				if t - 3.0 - i * hold > hold - 0.4 and A.has("out") and _once("v%d" % i): _grab.call_deferred("%s/view_%s.png" % [A.out, cams[i]])
			elif t >= 3.0 and A.has("out") and _once("vq"): get_tree().quit()
		"menu":
			if _once("menu"):
				var pg := String(A.get("page", "trainer"))
				if pg == "slot":
					ar.menu.open("trainer")
					ar.menu._edit_slot("foe", 1)
				else:
					ar.menu.open(pg)
				if pg == "wild": ar.menu.setup.wild.species = String(A.get("species", "pidgey"))
				if pg == "hunt" and A.has("species"): ar.menu.setup.hunt.species = Array(String(A.species).split(","))
				if A.has("search"): ar.menu.search.text = String(A.search); ar.menu._filter = String(A.search)
		"trainer":
			if _once("run"):
				var s := ArenaSetups.default_setup()
				var n := int(A.get("n", "3"))
				ArenaSetups.apply_preset(s, String(A.get("preset", "brock")), "foe")
				s.ash = ArenaSetups.preset_party("ash").slice(0, n)
				s.foe.party = s.foe.party.slice(0, n)
				if A.has("ash"): s.ash = Array(String(A.ash).split(",")).map(func(x): return {"species": x.get_slice(":", 0), "level": int(x.get_slice(":", 1)) if x.contains(":") else 22})
				if A.has("foe"): s.foe.party = Array(String(A.foe).split(",")).map(func(x): return {"species": x.get_slice(":", 0), "level": int(x.get_slice(":", 1)) if x.contains(":") else 22})
				s.type = "trainer"
				if A.has("doubles"): s.foe.format = "doubles"
				var ex := {"auto": not A.has("manual"), "call": String(A.get("call", "heads")), "coin": String(A.get("coin", "")), "seed": int(A.get("seed", "3"))}
				if A.has("switch"): ex["script_switch"] = [int(String(A["switch"]).get_slice(",", 0)), int(String(A["switch"]).get_slice(",", 1))]
				ar.stage.run(s, ex)
			if A.has("skip-at") and t >= float(A["skip-at"]) and ar.get_node_or_null("Opening") and _once("skip"):
				ar.get_node("Opening")._skip()
		"wild":
			if _once("run"):
				var s := ArenaSetups.default_setup()
				s.type = "wild"
				s.wild.species = String(A.get("species", "rattata"))
				s.wild.level = int(A.get("level", "8"))
				s.wild.start = String(A.get("start", "hidden"))
				s.wild.with_party = not A.has("alone")
				ar.stage.run(s, {"auto": true, "seed": int(A.get("seed", "3"))})
		"hunt": _hunt(ar)
		"forest": _forest(ar)
		"ambush": _ambush(ar)
		"results":
			if _once("res"):
				var s := ArenaSetups.default_setup()
				var pb := []
				for m in s.foe.party:
					var d: Dictionary = ArenaSetups.mon(m)
					d["ai"] = "cautious"
					pb.append(d)
				var B := PkmnParty.new({"a": s.ash.map(func(m): return ArenaSetups.mon(m)), "b": pb, "kind": "trainer", "seed": 5})
				for f in B.team.a: f.ai = "balanced"; f.e.pick_mode = "auto"
				B.start()
				var g := 0
				while not B.over and g < 200:
					g += 1
					B.begin_turn()
					B.ai_queue("a"); B.ai_queue("b"); B.resolve()
					for sd in ["a", "b"]: if B.pending[sd] and not B.over: B.switch_to(sd, B.ai_pick(sd))
				var pr := B.results()
				ar.menu.show_results({"outcome": "ash_won" if B.outcome == "won" else "ash_down", "turns": B.turn, "party": pr}, s)

# ---------- a hunt, scripted ----------
var _h := {}
func _hunt(ar: BattleArena) -> void:
	var W: Wild = main.cast.wild
	var act := String(A.get("act", "tells"))
	if _once("hunt"):
		var h := ArenaSetups.default_hunt()
		h.species = Array(String(A.get("species", "pidgey,rattata,caterpie,oddish")).split(","))
		h.count = int(A.get("n", "8"))
		ar.hunt.start(h, ArenaSetups.preset_party("ash").slice(0, 3), true)
		# Ash at the north-east rim of the big patch (-28, -26), facing in; three of the field
		# moved in a few metres ahead of him, the rest left where they fell
		var C := ArenaData.C
		var at := Vector3(C.x - 20.5, 0, C.y - 18.5)
		var yaw := atan2(-7.5, -7.5)
		var fwd := Vector3(sin(yaw), 0, cos(yaw))
		var rt := Vector3(fwd.z, 0, -fwd.x)
		_put(at, yaw)
		var want: Array = {"tells": [[5.5, -1.6, "pidgey"], [7.5, 2.2, "caterpie"], [9.5, -0.4, "oddish"]], "pounce": [[5.0, 0.0, "pidgey"], [8.5, 2.6, "caterpie"]], "run": [[3.2, 0.0, "rattata"]]}[act]
		var es: Array = W.encs.duplicate()
		for i in want.size():
			var w: Array = want[i]
			var p := at + fwd * float(w[0]) + rt * float(w[1])
			var e: Dictionary = es[i]
			W._remove(e)
			W.hunt = null
			var ne: Dictionary = ar.hunt._settle(String(w[2]), p)
			W.hunt = ar.hunt
			ne.node.rotation.y = yaw + PI
			_h["e%d" % i] = ne
		_h.fwd = fwd
		if act == "run": W.test_force = "react=flee"
	var e0: Dictionary = _h.get("e0", {})
	if e0.is_empty() or t < 1.0: return
	var tt := t - 1.0
	match act:
		"tells":
			# crouched, a slow creep in: the grass ahead twitches here and there
			if _once("cr"): main.cast._btn_crouch = true
			for k in 3:
				var e: Dictionary = _h.get("e%d" % k, {})
				if not e.is_empty(): e.alert = minf(float(e.alert), 0.2)
			_walk(main.pos + _h.fwd * 5.0, 0.55 if tt > 1.0 and tt < 6.5 else 0.0)
			main.cam_yaw = lerp_angle(main.cam_yaw, atan2(_h.fwd.x, _h.fwd.z) + PI - 0.45, 0.05)
		"pounce":
			if _once("cr"): main.cast._btn_crouch = true
			var nd: Node3D = e0.node
			var d := Wild._d2(main.pos, nd.position)
			e0.alert = minf(float(e0.alert), 0.3)
			if String(e0.state) == "hidden":
				_walk(nd.position, 0.6 if d > 1.7 else 0.0)
				if d <= 1.9 and fmod(tt, 0.2) < 0.07: W.use_pressed()
			else: main.stick_vec = Vector2.ZERO
			main.cam_yaw = lerp_angle(main.cam_yaw, atan2(_h.fwd.x, _h.fwd.z) + PI - 0.5, 0.05)
		"run":
			# he walks at it upright: it bolts; the camera turns after it
			var nd2: Node3D = e0.node
			if String(e0.state) == "hidden": _walk(nd2.position, 0.45)
			else: main.stick_vec = Vector2.ZERO
			if String(e0.state) != "hidden":
				# up over his shoulder, looking down the way it runs
				if not _h.has("cam"): _h.cam = main.cam.global_position
				var look: Vector3 = nd2.position + Vector3(0, 0.3, 0)
				var want: Vector3 = main.pos + Vector3(0, 4.2, 0) + (main.pos - look).normalized() * 3.5
				_h.cam = (_h.cam as Vector3).lerp(want, 0.12)
				_h.look = (_h.get("look", look) as Vector3).lerp(look, 0.25)
				main.cam.global_position = _h.cam
				main.cam.look_at(_h.look, Vector3.UP)
			main.cam_idle = 0.0

# ---------- the forest, scripted ----------
var _f := {}
func _forest(ar: BattleArena) -> void:
	var L = ar.life_of("forest")
	if L == null: return
	var W: Wild = main.cast.wild
	var act := String(A.get("act", "spot"))
	if _once("forest"):
		L.auto_hunt = false
		L.test_odds = 0.0
		W.cooldown = 999.0
		var R = ar.regions.forest
		if act in ["spot", "shake"]:
			# the search tree nearest the trail's first bend whose cocoon limb faces the trail
			var best = null
			var bd := INF
			for t in L.src.trees:
				var s: Dictionary = t.slots[0]
				var d := Vector2(t.at.x - (ArenaData.C.x + 10.0), t.at.z - (ArenaData.C.y - 64.0)).length()
				if d < bd: bd = d; best = t
			var s: Dictionary = best.slots[0]
			var sp := String(A.get("species", "kakuna"))
			L.src._pending.append(s)
			var e := W.spawn(sp, L.src, s.at, "timid")
			L.src.settle(e, s.at)
			e.hunt = false
			e.life = -999.0
			_f.e = e
			_f.t = best
			var dir: Vector3 = s.dir
			# Ash on the trail side of it, a few metres out, facing it
			var stand: Vector3 = (best.at as Vector3) + dir * (3.2 if act == "spot" else 4.2) + Vector3(dir.z, 0, -dir.x) * 0.8
			_put(stand, atan2(-dir.x, -dir.z))
			_f.dir = dir
		elif act == "hive":
			var hv: Dictionary = L.hive
			var to: Vector3 = (hv.base as Vector3)
			var from: Vector3 = to + ((ar.w(27.0, -66.5)) - to).normalized() * 15.0
			_put(from, atan2(to.x - from.x, to.z - from.z))
			_f.to = to
		elif act == "nest":
			var ns: Dictionary = L.nest
			var at: Vector3 = (ns.base as Vector3) + (ns.dir as Vector3) * 7.5
			_put(at, atan2(-ns.dir.x, -ns.dir.z))
			_f.to = ns.base
	var tt := t - 1.0
	if tt < 0.0: return
	if Battle.active and act != "hive": return   # (the battle frames its own shots)
	var cam: Camera3D = main.cam
	match act:
		"spot", "shake":
			var e: Dictionary = _f.e
			var tr: Dictionary = _f.t
			var dir: Vector3 = _f.dir
			var side := Vector3(dir.z, 0, -dir.x)
			if act == "spot":
				# still: he looks up; a pebble at 4.5 s
				main.stick_vec = Vector2.ZERO
				if tt > 4.5 and _once("pebble") and not L.prompt.is_empty(): L.throw_pebble(tr, e)
			else:
				# up to the trunk, then A: the shake
				var to: Vector3 = (tr.at as Vector3) + dir * (float(tr.trunk) + 0.9)
				if Wild._d2(main.pos, to) > 0.4 and tt < 4.0 and not _did.has("shook"): _walk(to, 0.5)
				else: main.stick_vec = Vector2.ZERO
				e.loosened = 1.0
				if tt > 2.5 and not L.prompt.is_empty() and String(L.prompt.kind) == "shake" and _once("shook"): W.use_pressed()
			# over his shoulder, low, looking up into the crown at it
			var np: Vector3 = (e.node as Node3D).position if is_instance_valid(e.node) else (tr.at as Vector3) + Vector3.UP * 3.0
			var look: Vector3 = main.pos.lerp(np, 0.62) + Vector3.UP * 0.4
			var want: Vector3 = main.pos + dir * 3.4 + side * 1.6 + Vector3.UP * 1.1
			if act == "shake":
				# wide: the trunk, Ash at it and the crown over him, the fall in frame
				var base: Vector3 = tr.at
				look = base + Vector3.UP * 2.3 + dir * 1.0
				want = base + dir * 7.0 + side * 2.8 + Vector3.UP * 1.9
			_f.cam = (_f.get("cam", want) as Vector3).lerp(want, 0.1)
			_f.look = (_f.get("look", look) as Vector3).lerp(look, 0.15)
			cam.global_position = _f.cam
			cam.look_at(_f.look, Vector3.UP)
			cam.fov = 62.0
			main.cam_idle = 0.0
		"hive":
			var hv: Dictionary = L.hive
			var to: Vector3 = _f.to
			# upright up to it (the agitation fills), then he stands his ground: the swarm
			# catches him (--run: he runs for it, out of their reach)
			if L.swarm.is_empty() and Wild._d2(main.pos, to) > 4.0: _walk(to, 0.45)
			elif A.has("run") and not L.swarm.is_empty() and String(L.swarm.phase) == "chase": _walk(main.pos + (main.pos - to).normalized() * 5.0, 1.0)
			else: main.stick_vec = Vector2.ZERO
			var hp: Vector3 = hv.at
			var away: Vector3 = main.pos - hp
			away.y = 0.0
			away = away.normalized()
			var want: Vector3 = main.pos + away * 4.8 + away.cross(Vector3.UP) * 1.8 + Vector3.UP * 2.0
			want.y = maxf(want.y, main.world.height_at(want.x, want.z) + 1.4)
			var look: Vector3 = main.pos.lerp(hp, 0.5) + Vector3.UP * 0.4
			_f.cam = (_f.get("cam", want) as Vector3).lerp(want, 0.08)
			_f.look = (_f.get("look", look) as Vector3).lerp(look, 0.12)
			cam.global_position = _f.cam
			cam.look_at(_f.look, Vector3.UP)
			cam.fov = 60.0
			main.cam_idle = 0.0
		"nest":
			var ns: Dictionary = L.nest
			var to: Vector3 = _f.to
			# crouched up to 3.8 m, a pause, then up he stands
			if tt < 0.5 and _once("cr"): main.cast._btn_crouch = true
			var d: float = Wild._d2(main.pos, to)
			if tt < 5.0 and d > 4.6: _walk(to, 0.6)
			elif tt > 5.5 and tt < 6.0 and main.cast.crouching: main.cast.set_crouch(false)
			elif tt > 6.0 and d > 3.6 and String(ns.state) in ["calm", "watch"]: _walk(to, 0.3)
			else: main.stick_vec = Vector2.ZERO
			var np: Vector3 = ns.at
			var away: Vector3 = main.pos - np
			away.y = 0.0
			away = away.normalized()
			var side: Vector3 = away.cross(Vector3.UP)
			var want: Vector3 = main.pos + away * 4.2 + side * 1.8 + Vector3.UP * 1.5
			want.y = maxf(want.y, main.world.height_at(want.x, want.z) + 1.3)
			var look: Vector3 = main.pos.lerp(np, 0.6) + Vector3.UP * 0.2
			if tt < 2.4:
				# first a close look at the nest: the chicks, the eggs, the parent on its rim
				var nd: Vector3 = ns.dir
				var ns_side: Vector3 = nd.cross(Vector3.UP)
				want = np + nd * 2.3 + ns_side * 0.9 + Vector3.UP * 0.55
				look = np + Vector3.UP * 0.1
				_f.cam = want; _f.look = look
			_f.cam = (_f.get("cam", want) as Vector3).lerp(want, 0.08)
			_f.look = (_f.get("look", look) as Vector3).lerp(look, 0.12)
			cam.global_position = _f.cam
			cam.look_at(_f.look, Vector3.UP)
			cam.fov = 60.0
			main.cam_idle = 0.0

func _put(p: Vector3, yaw: float) -> void:
	p.y = main.world.height_at(p.x, p.z)
	main.pos = p; main.yaw = yaw; main.speed = 0.0
	main.cast.land(p.y)
	main.cam_yaw = yaw + PI - 0.45
	main.cam_target = p + Vector3(0, 1.45, 0)

func _walk(to: Vector3, kk: float) -> void:
	var cy: float = main.cam_yaw
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	var dir := Vector2(to.x - main.pos.x, to.z - main.pos.z).normalized()
	main.stick_vec = Vector2(dir.dot(r), -dir.dot(f)) * kk

# fixed cameras over the arena (the main camera is put there after main.gd's)
func _view(ar: BattleArena) -> void:
	var cv := String(A.get("cam", "aerial"))
	var C := ArenaData.C
	var at := {"aerial": [Vector3(C.x + 46, 44, C.y + 62), Vector3(C.x, 0, C.y - 4), 50.0],
		"field": [Vector3(C.x + 15, 6.5, C.y + 19), Vector3(C.x, 0.5, C.y - 2), 50.0],
		"grass": [Vector3(C.x - 12, 2.4, C.y - 12), Vector3(C.x - 28, 0.4, C.y - 26), 55.0],
		"gate": [Vector3(C.x - 5.5, 1.9, C.y + 33), Vector3(C.x, 2.1, C.y + 46), 50.0],
		"walk": [Vector3(C.x - 4, 1.7, C.y + 30), Vector3(C.x, 1.0, C.y + 5), 55.0],
		"low": [Vector3(C.x + 2.5, 0.9, C.y + 13.5), Vector3(C.x, 0.6, C.y), 50.0],
		"side": [Vector3(C.x + 16, 3.0, C.y + 2), Vector3(C.x, 0.5, C.y), 48.0],
		"tall": [Vector3(C.x - 20, 1.8, C.y - 14), Vector3(C.x - 28, 0.5, C.y - 26), 52.0],
		# the forest region (arena/regions/forest.gd): the whole arena from high in the south
		# east, the gate from the hub, the trail at eye level, the hive's glade, the nest
		"aerial2": [Vector3(C.x + 58, 64, C.y - 2), Vector3(C.x + 4, 0, C.y - 62), 58.0],
		"fgate": [Vector3(C.x + 10.5, 1.8, C.y - 33), Vector3(C.x + 14, 2.2, C.y - 47), 55.0],
		"ftrail": [Vector3(C.x + 13.2, 1.65, C.y - 55), Vector3(C.x + 8.5, 1.4, C.y - 69), 58.0],
		"fdeep": [Vector3(C.x + 10.5, 1.7, C.y - 82), Vector3(C.x + 4.5, 1.5, C.y - 97), 58.0],
		"fclear": [Vector3(C.x + 6, 2.2, C.y - 70), Vector3(C.x - 6, 0.6, C.y - 77), 58.0],
		"fhive": [Vector3(C.x + 26, 2.0, C.y - 69), Vector3(C.x + 36, 4.4, C.y - 63), 55.0],
		"fnest": [Vector3(C.x - 4.5, 2.2, C.y - 97), Vector3(C.x - 9.5, 3.2, C.y - 101), 55.0],
		"fup": [Vector3(C.x + 12, 1.5, C.y - 64), Vector3(C.x + 12, 6.0, C.y - 72), 60.0]}
	var v: Array = at.get(cv, at.aerial)
	# Ash where the camera looks (the grass field is drawn round him)
	var tp: Vector3 = v[1]
	main.pos = Vector3(tp.x, ar.data.height_at(tp.x, tp.z), tp.z)
	main.cast.land(main.pos.y)
	main.cam.global_position = v[0]
	main.cam.look_at(v[1], Vector3.UP)
	main.cam.fov = v[2]
	# (the overview: the plants fade from the middle of it, not from up here)
	if cv == "aerial2": RenderingServer.global_shader_parameter_set("veg_cam", Vector3(C.x + 10, 0, C.y - 45))

func _grab(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)

# ---------- ambushes, scripted (the arena's thickets) ----------
var _a := {}
func _ambush(ar: BattleArena) -> void:
	var act := String(A.get("act", "follow"))
	var Am: Ambush = main.cast.wild.ambush
	var Cm: AshCompanions = main.cast.companions
	var tt := t - 1.0
	if tt < 0.0: return
	if _once("amb"):
		Am.cooldown = 1e9
		Am.battle_extra = {"auto": true, "seed": int(A.get("seed", "5")), "auto_delay": 0.5}
		for k in range(Cm.out.size() - 1, -1, -1): Cm.recall(k, true)
		var thk: Dictionary = ar.ambush.spots[0]
		var at: Vector3 = thk.at
		if A.has("region") and act != "follow":
			# --region=forest: up the region's trail from its gate, the bush by it ahead
			# (as the REGIONS page's AMBUSH, arena/arena_menu_regions.gd)
			var id := String(A.region)
			var d := ArenaRegions.get_def(id)
			var rl = ar.life_of(id)
			if rl: rl.auto_hunt = false   # (no hunt: an ambush waits for none)
			var sp: Array = d.spawn
			_put(ar.w(float(sp[0]), float(sp[1])), float(d.get("yaw", PI)))
			var ahead: Vector3 = main.pos + Vector3(sin(main.yaw), 0, cos(main.yaw)) * 11.0
			var bd := INF
			for h in ar.hides:
				if String(h.get("zone", "")) != id or String(h.kind) != "bush": continue
				var dd := Vector2(h.at.x - ahead.x, h.at.z - ahead.z).length()
				if dd < bd: bd = dd; thk = {"at": Vector3(h.at.x, 0, h.at.z), "kind": "bush", "r": float(h.r)}
			var bat: Vector3 = thk.at
			var to_me := Vector3(main.pos.x - bat.x, 0, main.pos.z - bat.z).normalized()
			_a.path = [bat + to_me * 2.2 + Vector3(to_me.z, 0, -to_me.x) * 1.2]
			var n: int = {"bush": 1, "intercept": 2, "swarm": 4, "run": 1}.get(act, 1)
			if act in ["intercept", "swarm"]:
				Cm.send_out(0, true, main.pos + Vector3(0.9, 0, 1.4))
				Cm.send_out(2 if act == "intercept" else 1, true, main.pos + Vector3(-0.9, 0, 1.6))
			Am.force = {"species": String(A.get("species", "beedrill")), "n": n, "cover": thk, "level": int(A.get("level", "3" if act == "swarm" else "6")), "temper": "aggressive"}
			if act == "run": Am.force_run = 1; Am.force_chase = 1
		elif act == "follow":
			_put(ar.w(0.5, 37.0), PI)
			_a.path = [ar.w(0.0, 33.0), ar.w(-4.0, 27.5), ar.w(-11.0, 24.0), ar.w(-16.0, 21.5)]
		else:
			# (the run: he comes down from the field, so he has room to bolt back up it)
			var sgn := -1.0 if act == "run" else 1.0
			_put(at + Vector3(-2.6, 0, 9.5 * sgn), 0.0 if act == "run" else PI)
			_a.path = [at + Vector3(-2.6, 0, -8.0 * sgn)]
			var n: int = {"bush": 1, "intercept": 2, "swarm": 4, "run": 1}.get(act, 1)
			if act in ["intercept", "swarm"]:
				Cm.send_out(0, true, main.pos + Vector3(0.9, 0, 1.4))
				Cm.send_out(2 if act == "intercept" else 1, true, main.pos + Vector3(-0.9, 0, 1.6))
			Am.force = {"species": String(A.get("species", "beedrill")), "n": n, "cover": thk, "level": int(A.get("level", "3" if act == "swarm" else "6")), "temper": "aggressive"}
			if act == "run": Am.force_run = 1; Am.force_chase = 1
		_a.i = 0
	var st := String(Am.cur.get("state", ""))
	# walking his path (upright, at a walk); the follow case stops, then crouches on the way
	var walking := true
	if act == "follow":
		if tt > 0.4 and _once("f_t0"): Cm.send_out(0)
		if tt > 2.0 and _once("f_t1"): Cm.send_out(1)
		if tt < 3.8 or (tt > 10.5 and tt < 13.5): walking = false
		if tt > 13.5 and _once("crouch"): main.cast.set_crouch(true)
		if tt > 19.0 and _once("stand"): main.cast.set_crouch(false)
	else:
		walking = Am.lurking() or (Am.cur.is_empty() and tt < 1.0)
	if walking and int(_a.i) < (_a.path as Array).size():
		var to: Vector3 = _a.path[int(_a.i)]
		if Wild._d2(main.pos, to) < 1.2: _a.i = int(_a.i) + 1
		else: _walk(to, 0.42 if main.cast.crouching else 0.72)
	elif act == "run" and st in ["chase", "leave"] and Wild._d2(main.pos, ar.w(3.0, -2.0)) > 2.0:
		# he keeps running (up the open field, clear of the referee's stand): it gives up a little way on
		_walk(ar.w(3.0, -2.0), 1.0)
	else: main.stick_vec = Vector2.ZERO
	# the standoff: a beat, then his pick (POKéMON: the first of his party), or RUN
	if st == "standoff":
		if not _a.has("so_t"): _a.so_t = tt
		if tt - float(_a.so_t) > 1.6 and _once("pick"):
			if act == "run": Am.input(false, true)
			else: Am.input(true, false)
	var pm: PartyMenu = main.cast.party_menu
	if pm.is_open():
		if not _a.has("pm_t"): _a.pm_t = tt
		if tt - float(_a.pm_t) > 1.3 and _once("pm_go"): pm._pick(0)
	# the camera: over his shoulder, a little to the side, so his Pokémon and the cover show
	if not Battle.active and not main.trans_busy:
		var want_yaw: float = main.yaw + PI + (-0.8 if act == "follow" else 0.7)
		if st in ["strike", "standoff", "intercept", "throw", "menu", "chase", "dash"] and not Am.cur.is_empty():
			var lp: Vector3 = (Am._lead().node as Node3D).position
			want_yaw = atan2(main.pos.x - lp.x, main.pos.z - lp.z) + 0.65
		main.cam_yaw = lerp_angle(main.cam_yaw, want_yaw, 0.06)
		main.cam_idle = 0.0
		main.cam_pitch = lerpf(main.cam_pitch, 0.38, 0.05)
