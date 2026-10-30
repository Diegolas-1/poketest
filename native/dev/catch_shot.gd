extends Node
# Dev only: Poké Ball throws staged in the Battle Arena's wild field, for renders.
#   godot --path native res://dev/catch_shot.tscn -- [options]
#   --species=pidgey --level=8 --start=hidden|startled|open
#   --alone              the prologue (Ash alone; the arena's balls are unlimited)
#   --throws=great_ball:2,ultra_ball:c
#                        one throw a turn from turn 1: the ball, then its result
#                        (c a catch, 0..3 a break-out after that many shakes)
#   --frames=DIR --every=n      the viewport every n-th frame (with --fixed-fps 15)
#   --trainer            a trainer battle on Route 1 instead (the ball is blocked)
#   --from=s --to=s             frames only in that window
#   --quit-at=s --seed=n --hour=h

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
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _once(key: String) -> bool:
	if _did.has(key): return false
	_did[key] = true
	return true

func _process(dt: float) -> void:
	frame += 1
	t += dt
	if A.has("frames") and frame % maxi(1, int(A.get("every", "8"))) == 0 and t >= float(A.get("from", "0")) and t <= float(A.get("to", "1e9")): _grab.call_deferred("%s/f%05d.png" % [A.frames, frame])
	if A.has("quit-at") and t >= float(A.get("quit-at")) and _once("quit"): get_tree().quit()
	if frame == 3:
		main.cast.clock.real = false; main.cast.clock.ff = 1.0; main.cast.clock.set_time(float(A.get("hour", "10.5")))
	if A.has("trainer"):
		# Route 1's first patch of grass (dev/battle_dev.gd's spot)
		if frame < 20:
			main.pos = Vector3(-13.0, main.world.height_at(-13.0, -95.0), -95.0)
			main.cast.land(main.pos.y)
		if frame == 20 and _once("run"):
			var st := PkmnStore.new("")
			st.unlimited = true
			var d := Vector3(sin(main.yaw), 0, cos(main.yaw))
			Battle.start(main, {"mode": "pkmn", "kind": "trainer", "trainer": "Camper", "species": "rattata", "level": 6, "ai": "balanced",
				"partner": {"species": "pikachu", "level": 12}, "auto": true, "store": st, "at": main.pos + d * 4.6, "seed": 3,
				"script_ball": {"turn": 1, "ball": "poke_ball"}})
		_watch()
		return
	if frame == 8 and _once("enter"): BattleArena.enter(main, true)
	var ar: BattleArena = BattleArena.I
	if ar == null or frame < 12: return
	if _once("run"):
		var s := ArenaSetups.default_setup()
		s.type = "wild"
		s.wild.species = String(A.get("species", "pidgey"))
		s.wild.level = int(A.get("level", "8"))
		s.wild.start = String(A.get("start", "open"))
		s.wild.with_party = not A.has("alone")
		s.ash = [{"species": "pikachu", "level": 25}]
		var sb := []
		var acts := []
		var turn := 1
		for th in String(A.get("throws", "poke_ball:c")).split(","):
			var b := th.get_slice(":", 0)
			var r := th.get_slice(":", 1) if th.contains(":") else "c"
			sb.append({"turn": turn, "ball": b, "caught": r == "c", "wobbles": 0 if r == "c" else int(r)})
			acts.append("ball:" + b)
			turn += 1
		acts.append("run")
		var ex := {"auto": true, "seed": int(A.get("seed", "3")), "script_ball": sb}
		if A.has("alone"): ex["script_acts"] = acts
		ar.stage.run(s, ex)
	_watch()

func _watch() -> void:
	var b: Battle = Battle.current
	# the HUD's lines as they come (mode pkmn)
	if b and b.pk and b.pk.hud and not b.pk.hud.log_lines.is_empty():
		var ln := String(b.pk.hud.log_lines.back().text)
		if ln != String(_did.get("line", "")): _did["line"] = ln; print("catch_shot: %.1f s  %s" % [t, ln])
	if b and _once("on"): print("catch_shot: battle on (mode %s) at %.1f s" % [b.mode, t])
	if b == null and _did.has("on") and _once("over"):
		print("catch_shot: battle over at %.1f s" % t)
		if not A.has("quit-at"): get_tree().create_timer(2.0).timeout.connect(func(): get_tree().quit())

func _grab(path: String) -> void:
	get_viewport().get_texture().get_image().save_png(path)
