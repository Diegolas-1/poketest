extends Node3D
# Dev only: one look (a baked person, res://cast/<look>.glb) on open ground, in a row of
# copies turned different ways, for render checks of the model, its stance and its
# acting (idles.gd), without loading the world.
#   godot --path native --write-movie <dir>/f.png --fixed-fps 30 --quit-after N res://dev/look_shot.tscn --
#     [--look=jenny] [--yaws=0,0.7,1.57,3.14] [--stance=<idles.gd STANCES key>] [--act=<action>] [--at=frame]
#     [--len=s] [--view=full|half|head] [--speed=m/s] [--look-yaw=rad]
# --act starts that action on every copy at --at (default 40); --stance holds that stance.
var looks: Array[CastActor] = []
var look := "jenny"
var yaws: Array = [0.0, 0.7, 1.5708, 3.1416]
var stance := ""
var act := ""
var at := 40
var ln := 0.0
var view := "full"
var speed := 0.0
var lyaw := NAN
var frame := 0
var cam: Camera3D

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		var kv := x.trim_prefix("--").split("=", true, 1)
		var v: String = kv[1] if kv.size() > 1 else ""
		match kv[0]:
			"look": look = v
			"yaws": yaws = Array(v.split(",")).map(func(s): return float(s))
			"stance": stance = v
			"act": act = v
			"at": at = int(v)
			"len": ln = float(v)
			"view": view = v
			"speed": speed = float(v)
			"look-yaw": lyaw = float(v)
			"armL", "armR":
				# (tuning the stance) --armR=x,y,z/px,py,pz/wf,wd,wt,cu on the stance's bone (its "at" bone)
				var S: Dictionary = IdleActions._stances()[stance]
				var parts := v.split("/")
				var f := func(s: String) -> Array: return Array(s.split(",")).map(func(q): return float(q))
				var at: Array = f.call(parts[0]); var po: Array = f.call(parts[1]); var hd: Array = f.call(parts[2])
				S[kv[0]] = {"at": [S[kv[0]].at[0], at[0], at[1], at[2]], "pole": po, "wf": hd[0], "wd": hd[1], "wt": hd[2], "cu": hd[3]}
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(40, 40); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	var gap := 1.1 if view == "full" else 0.9
	for i in yaws.size():
		var a := CastActor.make(look)
		add_child(a)
		a.ground = func(_x: float, _z: float) -> float: return 0.0
		a.position = Vector3((i - (yaws.size() - 1) * 0.5) * gap, 0, 0)
		a.rotation.y = float(yaws[i])
		a.look_yaw = lyaw
		if stance != "": a.idles.stance = stance
		looks.append(a)
	cam = Camera3D.new(); add_child(cam); cam.fov = 30
	var w := yaws.size() * gap
	match view:
		"head": cam.look_at_from_position(Vector3(0, 1.62, 0.5 + w * 0.42), Vector3(0, 1.6, 0))
		"half": cam.look_at_from_position(Vector3(0, 1.3, 0.9 + w * 0.6), Vector3(0, 1.2, 0))
		_: cam.look_at_from_position(Vector3(0, 1.0, 1.6 + w * 0.95), Vector3(0, 0.92, 0))

func _process(dt: float) -> void:
	frame += 1
	for a in looks:
		if act != "" and frame == at: a.idles.force(act, ln)
		a.animate(dt, speed, false)
