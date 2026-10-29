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
#   --shot=PATH --shot-at=s     one still at s seconds, then quit
#   --frames=DIR --every=n      the whole viewport every n-th frame (with --fixed-fps 15)
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
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("device"): UIInput.force(String(A.device))
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _once(key: String) -> bool:
	if _did.has(key): return false
	_did[key] = true
	return true

func _process(dt: float) -> void:
	frame += 1
	t += dt
	if A.has("frames") and frame % maxi(1, int(A.get("every", "1"))) == 0: _grab.call_deferred("%s/f%05d.png" % [A.frames, frame])
	if A.has("shot") and t >= float(A.get("shot-at", "3")) and _once("shot"):
		_grab.call_deferred(String(A.shot))
		get_tree().create_timer(0.3).timeout.connect(func(): get_tree().quit())
	if A.has("quit-at") and t >= float(A.get("quit-at")) and _once("quit"): get_tree().quit()
	if frame == 3:
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
	match c:
		"view":
			# --cams=a,b,c: each one held 1.2 s from 3 s, a still of each (view_<cam>.png in --out)
			var cams: Array = Array(String(A.get("cams", A.get("cam", "aerial"))).split(","))
			var i := int((t - 3.0) / 1.2)
			if t >= 3.0 and i < cams.size():
				A["cam"] = cams[i]
				_view(ar)
				if t - 3.0 - i * 1.2 > 0.8 and A.has("out") and _once("v%d" % i): _grab.call_deferred("%s/view_%s.png" % [A.out, cams[i]])
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
		"tall": [Vector3(C.x - 20, 1.8, C.y - 14), Vector3(C.x - 28, 0.5, C.y - 26), 52.0]}
	var v: Array = at.get(cv, at.aerial)
	# Ash where the camera looks (the grass field is drawn round him)
	var tp: Vector3 = v[1]
	main.pos = Vector3(tp.x, ar.data.height_at(tp.x, tp.z), tp.z)
	main.cast.land(main.pos.y)
	main.cam.global_position = v[0]
	main.cam.look_at(v[1], Vector3.UP)
	main.cam.fov = v[2]

func _grab(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
