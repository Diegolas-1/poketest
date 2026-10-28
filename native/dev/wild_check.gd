extends Node
# Dev only: the new models in the real world, for render checks: the game (main.tscn) with
#   --at=grass  Pidgeys in Route 1's first tall-grass patch (one pressed low in it, hiding,
#               one at its edge looking round, one hopping about on the path)
#   --at=gate   Nurse Joy (ScenePerson) standing beside Officer Jenny at the Viridian gate,
#               her hands clasped, then a bow and a few words to Jenny
#   godot --path native --write-movie <dir>/f.png --fixed-fps 15 --quit-after 90 res://dev/wild_check.tscn --
#     --at=grass [--cam=px,py,pz,tx,ty,tz] [--hour=h]
var main: Node
var at := "grass"
var frame := 0
var cam_v := PackedFloat64Array()
var hour := 11.0
var birds: Array = []
var joy: ScenePerson
var _t := 0.0
const GRASS := Vector2(-5.0, -95.0)     # the first patch's east edge (cast.json tallGrass [-22, -104, -4, -86])
const GATE := Vector2(-1.78, -436.3)

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		match kv[0]:
			"at": at = kv[1]
			"cam": cam_v = PackedFloat64Array(Array(kv[1].split(",")).map(func(x): return float(x)))
			"hour": hour = float(kv[1])
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _h(x: float, z: float) -> float: return float(main.world.height_at(x, z))

func _process(dt: float) -> void:
	frame += 1
	_t += dt
	var ov = Settings.get("overlay")
	if ov: ov.visible = false
	if frame == 3:
		main.cast.clock.real = false; main.cast.clock.ff = 1.0; main.cast.clock.set_time(hour)
	# Ash out of the way, near enough for the region (and the grass) to be there
	var ash_at := GRASS + Vector2(9.0, 9.0) if at == "grass" else GATE + Vector2(4.0, 9.0)
	main.pos = Vector3(ash_at.x, _h(ash_at.x, ash_at.y), ash_at.y)
	main.speed = 0.0
	if frame == 20:
		if at == "grass":
			var spots := [[GRASS + Vector2(-0.6, -0.4), "hide", 1.2], [GRASS + Vector2(0.75, 0.9), "look", 2.0], [GRASS + Vector2(2.6, 0.2), "idle", -2.0]]
			for s in spots:
				var c := Creature.make("pidgey")
				main.add_child(c)
				var p: Vector2 = s[0]
				c.position = Vector3(p.x, _h(p.x, p.y), p.y)
				c.rotation.y = s[2]
				c.look_at_pos = main.pos + Vector3(0, 1.2, 0)
				c.reset()
				if s[1] == "hide": c.mood("hide")
				birds.append([c, s[1]])
		else:
			joy = ScenePerson.make("joy")
			main.add_child(joy)
			joy.ground = func(x: float, z: float) -> float: return _h(x, z)
			var jp := GATE + Vector2(-1.0, 0.25)
			joy.place(Vector3(jp.x, 0, jp.y), -0.15)
			joy.clasp(true)
	for b in birds:
		var c: Creature = b[0]
		if b[1] == "look" and frame % 40 == 30: c.mood("look")
		if b[1] == "idle" and frame % 45 == 40: c.mood(["peck", "hop", "ruffle"][(frame / 45) % 3])
		c.animate(dt, 0.0)
	if joy:
		var jen = main.cast.life.by_id.get("jenny")
		if frame == 50: joy.bow()
		if frame == 95 and jen and jen.actor: joy.look_at_node(jen.actor); joy.say("Officer Jenny! Thank goodness. Is the road to Viridian still closed?")
	if cam_v.size() == 6:
		main.cam.look_at_from_position(Vector3(cam_v[0], cam_v[1], cam_v[2]), Vector3(cam_v[3], cam_v[4], cam_v[5]))
	else:
		var f := GRASS + Vector2(1.0, 0.2) if at == "grass" else GATE + Vector2(-0.5, 0.1)
		var fy := _h(f.x, f.y)
		if at == "grass" and OS.get_cmdline_user_args().has("--hider"):
			# down into the grass over the one hiding there
			var hp := GRASS + Vector2(-0.6, -0.4)
			main.cam.look_at_from_position(Vector3(hp.x + 0.7, _h(hp.x, hp.y) + 1.5, hp.y + 0.9), Vector3(hp.x, _h(hp.x, hp.y) + 0.1, hp.y))
		elif at == "grass": main.cam.look_at_from_position(Vector3(f.x + 3.2, fy + 1.9, f.y + 2.6), Vector3(f.x - 0.4, fy + 0.2, f.y - 0.2))
		else: main.cam.look_at_from_position(Vector3(f.x + 0.6, fy + 1.5, f.y + 4.4), Vector3(f.x, fy + 1.0, f.y))
