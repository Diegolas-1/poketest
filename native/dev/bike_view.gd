extends Node3D
# Dev only: the bicycle on its own (a turnaround, close-ups) under the game's sun.
#   godot --path native res://dev/bike_view.tscn -- [--look=ash] [--turn] [--yaw=a] [--dist=d] [--h=y] [--fov=f]
#     [--kick=0..1] [--steer=a] [--crank=a] [--grid=1] (all four looks side by side) [--rider=ash] (seated)

var bike: BikeModel
var cam: Camera3D
var t := 0.0
var turn := false
var yaw := 0.6
var dist := 2.6
var h := 0.8
var aim := Vector3(0, 0.6, 0)
var bikes: Array = []
var rider: CastActor
var R: BikeRider

func _arg(k: String, d: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--" + k + "="): return a.substr(k.length() + 3)
	return d

func _ready() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("c4e2f0")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = true
	add_child(sun)
	sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45).normalized() * 50.0, Vector3.ZERO)
	# a ground to stand on
	var g := MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(30, 30)
	g.mesh = pm
	var gm := ShaderMaterial.new(); gm.shader = preload("res://shaders/actor.gdshader")
	gm.set_shader_parameter("albedo", Color("9cc56a"))
	g.material_override = gm
	add_child(g)
	cam = Camera3D.new(); cam.fov = float(_arg("fov", "40")); add_child(cam)
	turn = OS.get_cmdline_user_args().has("--turn")
	yaw = float(_arg("yaw", "0.6")); dist = float(_arg("dist", "2.6")); h = float(_arg("h", "0.8"))
	if _arg("grid", "") != "":
		var ids := ["ash", "ada", "ben", "timmy"]
		for i in ids.size():
			var b := BikeModel.new(); add_child(b); b.build(BikeModel.look(ids[i]))
			b.position = Vector3((i - 1.5) * 0.9, 0, 0)
			b.rotation.y = PI / 2.0
			bikes.append(b)
		aim = Vector3(0, 0.55, 0)
	else:
		bike = BikeModel.new()
		add_child(bike)
		bike.build(BikeModel.look(_arg("look", "ash")))
		print("bike tris %d" % bike.tris)
		bike.pose(float(_arg("steer", "0")), 0, 0, float(_arg("crank", "0.3")), float(_arg("kick", "1")))
		if _arg("rider", "") != "":
			rider = CastActor.make(_arg("rider", "ash"))
			add_child(rider)
			R = BikeRider.new(rider, bike)
			rider.rider = R
			R.on = 1.0
			R.mount = float(_arg("mount", "1"))
			R.foot_down = float(_arg("down", "0"))
			R.stand = float(_arg("stand", "0"))
			bike.pose(float(_arg("steer", "0")), 0, 0, float(_arg("crank", "0.3")), 0.0)
			aim = Vector3(0, 0.85, 0)

func _process(dt: float) -> void:
	t += dt
	var a := yaw + (t * 0.9 if turn else 0.0)
	cam.look_at_from_position(aim + Vector3(sin(a) * dist, h - aim.y + aim.y, cos(a) * dist), aim)
	if rider:
		rider.transform = bike.transform
		var cr := float(_arg("crank", "0.3")) + (t * float(_arg("cad", "0")))
		R.set_pitch(BikeRider.foot_pitch(cr, 1.0), BikeRider.foot_pitch(cr, -1.0))
		bike.pose(float(_arg("steer", "0")), t, t, cr, 0.0, R._pitch[0], R._pitch[1])
		R.speed = float(_arg("speed", "0"))
		rider.animate(dt, R.speed, false)
