extends Node
# Dev only: a screenshot of the town life. Runs the game, fast-forwards until
# someone is doing what's asked, frames them and saves a PNG.
#   godot --path native --rendering-driver opengl3 res://dev/life_shot.tscn -- --out=/tmp/a.png
#     [--clock=HH:MM[,day]] [--follow=<id> | --follow=chat] [--until=act|walk|door_in|door_out|chat|knock]
#     [--view=dist,height,side] [--cam=px,py,pz,tx,ty,tz] [--player=x,z | --player=near] [--ff=30] [--max=600] [--debug]
var main: Node
var A := {}
var frame := 0
var phase := 0        # 0 waiting, 1 settling, 2 saved
var settle := 0
var target = null
var waited := 0.0

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("debug"): Settings.set_value("town_debug", 1)
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _life() -> TownLife: return main.cast.life

func _find() -> Variant:
	var life := _life()
	var f: String = A.get("follow", "")
	var until: String = A.get("until", "act")
	var cands: Array = life.people if f == "chat" or f == "" else [life.by_id[f]]
	for p in cands:
		if f == "chat":
			if p.state == "chat" and not p.bubble.is_empty() and not p.bubble.has("delay"): return p
			continue
		if until == "door_in" and p.state == "door_in" and p.beat_t > 0.55: return p
		if until == "door_out" and p.state == "door_out" and p.beat_t > 0.35: return p
		if until == p.state and until != "door_in" and until != "door_out": return p
		if until == "chat" and p.state == "chat" and not p.bubble.is_empty(): return p
	return null

func _process(dt: float) -> void:
	frame += 1
	if frame < 3 or phase == 2: return
	var life := _life()
	var ff := float(A.get("ff", "30"))
	if phase == 0:
		target = _find() if A.has("follow") else null
		var door := A.get("until", "") in ["door_in", "door_out"]
		if target != null or not A.has("follow"):
			phase = 1
			life.clock.ff = 1.0
			settle = 0 if door else int(A.get("settle", "40"))
		else:
			life.clock.ff = ff
			waited += dt
			if waited > float(A.get("max", "900")): print("life_shot: gave up waiting"); get_tree().quit(1); return
	# frame the target (or a fixed camera)
	var tp: Vector3
	if target != null: tp = target.pos
	if A.has("player") and target != null and A.player == "near":
		var off := Vector3(sin(target.yaw), 0, cos(target.yaw)) * 3.2
		main.pos = Vector3(tp.x + off.x + 1.2, 0, tp.z + off.z)
		main.pos.y = main.world.height_at(main.pos.x, main.pos.z)
		main.speed = 0.0
	elif A.has("player"):
		var pp := String(A.player).split(",")
		main.pos = Vector3(float(pp[0]), 0, float(pp[1])); main.pos.y = main.world.height_at(main.pos.x, main.pos.z); main.speed = 0.0
	if A.has("cam"):
		var c := Array(String(A.cam).split(",")).map(func(x): return float(x))
		main.cam.look_at_from_position(Vector3(c[0], c[1], c[2]), Vector3(c[3], c[4], c[5]))
	elif target != null:
		var v := Array(String(A.get("view", "6,2.2,0.6")).split(",")).map(func(x): return float(x))
		var ang: float = target.yaw + float(v[2])
		var eye := tp + Vector3(sin(ang) * v[0], v[1], cos(ang) * v[0])
		eye.y = maxf(eye.y, main.world.height_at(eye.x, eye.z) + 0.6)
		main.cam.look_at_from_position(eye, tp + Vector3(0, 1.1, 0))
	if phase == 1:
		settle -= 1
		if settle <= 0:
			phase = 2
			await RenderingServer.frame_post_draw
			var img := get_viewport().get_texture().get_image()
			img.save_png(A.get("out", "/tmp/life_shot.png"))
			print("life_shot: saved %s at %s %s %s" % [A.get("out"), life.clock.day_text(), life.clock.time_text(), life.describe(target) if target != null else ""])
			for p in life.people: print("  ", life.describe(p))
			get_tree().quit(0)
