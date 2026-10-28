extends Node
# Dev only: a Pokémon-vs-Pokémon battle (battle/pkmn_battle.gd, energy v2's rules,
# its HUD ui/pkmn_hud.gd) played in the real world, on the battle's own in-world
# stage (battle/battle.gd, mode "pkmn", hosted by battle/battle_pkmn.gd): Route 1's
# tall grass, the arena spread on the real ground, Ash behind his partner.
#   godot --path native res://dev/pkmn_battle.tscn -- [--fight=wild|trainer] [--auto]
#     [--state=pools|locks|moves|lockedin] (a frozen HUD state for shots)
#     [--seed=n] [--device=touch|pad|keys] [--at=x,z] [--start=frame]
#     [--shot=/path.png --shot-at=seconds] (saves the whole viewport, then quits)
#     [--frames=DIR --every=n] (the whole viewport every n-th frame; with --fixed-fps 15)
# wild:    Pikachu (Lv 9) vs a wild Pidgey (Lv 8, startled)
# trainer: Pikachu (Lv 14) vs Camper's Sandshrew (Lv 11, a cautious trainer)
# Controls: the HUD's (FIGHT, POKéMON, ITEMS, FLEE; the move list, END TURN; B
# takes the last one back; a tap on a pool when a new chip needs one).

var A := {}
var main: Node
var frame := 0
var at := Vector2(-13.0, -95.0)
var start_f := 20
var t := 0.0
var battle: Battle

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("device"): UIInput.force(String(A.device))
	if A.has("at"): at = Vector2(float(String(A.at).get_slice(",", 0)), float(String(A.at).get_slice(",", 1)))
	start_f = int(A.get("start", "20"))
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _process(dt: float) -> void:
	frame += 1
	# --frames=DIR [--every=n]: the whole viewport saved every n-th frame (with
	# --fixed-fps 15 and no --write-movie, which crops a wide viewport to 16:9)
	if Array(OS.get_cmdline_user_args()).any(func(a): return String(a).begins_with("--frames=")) and frame % _every() == 0:
		_grab.call_deferred(frame)
	t += dt
	if frame == 3:
		main.cast.clock.real = false; main.cast.clock.ff = 1.0; main.cast.clock.set_time(float(A.get("hour", "10.5")))
	if frame < start_f:
		main.pos = Vector3(at.x, main.world.height_at(at.x, at.y), at.y)
		main.speed = 0.0
		main.cast.land(main.pos.y)
		main.cam_yaw = main.yaw + PI
		main.cam_ty = main.pos.y
		main.cam_target = main.pos + Vector3(0, 1.45, 0)
	if frame == start_f:
		var d := Vector3(sin(main.yaw), 0, cos(main.yaw))
		var o := {"mode": "pkmn", "at": main.pos + d * 4.4, "where": "tall_grass", "seed": int(A.get("seed", "7")), "auto": A.has("auto")}
		if String(A.get("fight", "wild")) == "trainer":
			o.merge({"partner": {"species": "pikachu", "level": 14, "focus": 40.0,
					"known": ["thunder_shock", "quick_attack", "dodge", "swift", "feint", "tail_whip", "growl", "thunder_wave", "double_team"],
					"equip": ["thunder_shock", "quick_attack", "dodge", "swift", "feint"]},
				"species": "sandshrew", "level": 11, "ai": "cautious", "foe_name": "Sandshrew", "foe_focus": 30.0, "kind": "trainer", "trainer": "Camper"})
		else:
			o.merge({"partner": {"species": "pikachu", "level": 9, "focus": 30.0,
					"known": ["thunder_shock", "growl", "tail_whip", "quick_attack", "dodge", "thunder_wave", "double_team"],
					"equip": ["thunder_shock", "quick_attack", "dodge", "thunder_wave", "growl"]},
				"species": "pidgey", "level": 8, "ai": "wild", "state": "startled", "kind": "wild"})
		if A.has("state"): o["hud_state"] = String(A.state)
		battle = Battle.start(main, o)
		battle.finished.connect(func(r: Dictionary): print("PKMN BATTLE finished f%d: " % frame, {"outcome": r.get("outcome"), "pkmn": r.get("pkmn_outcome"), "turns": r.get("turns")}))
	if battle and is_instance_valid(battle) and A.has("beats"):
		var cl := String(battle.ui.callout.get("text", "")) if battle.ui else ""
		if cl != String(A.get("_cl", "")):
			A["_cl"] = cl
			if cl != "": print("beat f%d %s" % [frame, cl])
	if A.has("shot") and t >= float(A.get("shot-at", "6.0")) and not A.has("_shot_done"):
		A["_shot_done"] = "1"
		_save_shot.call_deferred()

func _save_shot() -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(String(A.shot))
	get_tree().quit()

func _every() -> int:
	for a in OS.get_cmdline_user_args(): if a.begins_with("--every="): return maxi(1, int(a.get_slice("=", 1)))
	return 1

func _grab(f: int) -> void:
	await RenderingServer.frame_post_draw
	var dir := ""
	for a in OS.get_cmdline_user_args(): if a.begins_with("--frames="): dir = a.get_slice("=", 1)
	get_viewport().get_texture().get_image().save_png("%s/f%05d.png" % [dir, f])
