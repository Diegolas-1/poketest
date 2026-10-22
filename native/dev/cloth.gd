extends Node3D
# Dev only: one character on a floor running a fixed motion script, for cloth and
# hair render checks and timing.
#   godot --path native res://dev/cloth.tscn -- --look=girl --seq=walk|run|stop|turn|jump|all
#       [--view=side|front|back|three|head] [--bench=N]
# --bench=N: N copies running in place, prints the cloth/hair sim's cost per character.
var a: CastActor
var t := 0.0
var seq := "all"
var view := "side"
var pos := Vector3.ZERO
var yaw := 0.0
var speed := 0.0
var vy := 0.0
var air := false
var cam: Camera3D
var bench: Array = []
var frames := 0
var sim_us := 0.0
var tot_us := 0.0
var work_us := 0.0
var wt_us := 0.0

func _ready() -> void:
	var look := "ash"
	for x in OS.get_cmdline_user_args():
		if x.begins_with("--look="): look = x.substr(7)
		elif x.begins_with("--seq="): seq = x.substr(6)
		elif x.begins_with("--view="): view = x.substr(7)
		elif x == "--nothread": ClothSim.threaded = false
		elif x.begins_with("--bench="):
			for i in int(x.substr(8)):
				var b := CastActor.make(look); add_child(b); b.position = Vector3((i % 10) * 1.2 - 6.0, 0, -3.0 - (i / 10) * 1.2); bench.append(b)
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(60, 60); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	# a grid of stripes so motion reads
	for i in 30:
		var s := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(60, 0.01, 0.05); s.mesh = bm; add_child(s)
		s.position = Vector3(0, 0.004, -30 + i * 2.0)
		var sm := StandardMaterial3D.new(); sm.albedo_color = Color(0.45, 0.6, 0.38); s.material_override = sm
	a = CastActor.make(look); add_child(a)
	cam = Camera3D.new(); add_child(cam); cam.fov = 40

# the script: [until t, target speed, turn rate, jump at start]
func _plan() -> Array:
	match seq:
		"walk": return [[0.6, 0.0, 0.0], [4.0, 2.6, 0.0], [5.5, 0.0, 0.0]]
		"run": return [[0.6, 0.0, 0.0], [4.0, 7.5, 0.0], [5.5, 0.0, 0.0]]
		"stop": return [[0.4, 0.0, 0.0], [2.2, 7.5, 0.0], [4.0, 0.0, 0.0]]
		"turn": return [[0.4, 0.0, 0.0], [1.6, 6.0, 0.0], [2.6, 6.0, 3.1], [4.0, 6.0, 0.0], [5.0, 0.0, 0.0]]
		"jump": return [[0.4, 0.0, 0.0], [1.2, 5.0, 0.0, 1], [2.6, 5.0, 0.0], [2.7, 5.0, 0.0, 1], [4.5, 0.0, 0.0], [4.6, 0.0, 0.0, 1], [6.0, 0.0, 0.0]]
		"idle": return [[6.0, 0.0, 0.0]]
	return [[0.5, 0.0, 0.0], [2.5, 2.6, 0.0], [4.5, 7.5, 0.0], [5.5, 0.0, 0.0], [6.5, 6.0, 3.1], [7.5, 0.0, 0.0], [7.6, 0.0, 0.0, 1], [9.0, 0.0, 0.0]]

var _jumped := {}
func _process(dt: float) -> void:
	t += dt
	var tgt := 0.0
	var turn := 0.0
	var plan := _plan()
	for i in plan.size():
		var p: Array = plan[i]
		if t < p[0]:
			tgt = p[1]; turn = p[2]
			if p.size() > 3 and not _jumped.has(i) and not air:
				_jumped[i] = true; vy = 5.2; air = true
			break
	speed = move_toward(speed, tgt, dt * (14.0 if tgt > speed else 22.0))
	yaw += turn * dt
	pos += Vector3(sin(yaw), 0, cos(yaw)) * speed * dt
	if air:
		vy -= 15.0 * dt; pos.y += vy * dt
		if pos.y <= 0.0: pos.y = 0.0; air = false; vy = 0.0
	a.position = pos; a.rotation.y = yaw
	var t0 := Time.get_ticks_usec()
	a.animate(dt, speed, air)
	for b in bench: b.animate(dt, 6.0 + sin(t) * 2.0, false); b.rotation.y += dt * 0.7
	var el := Time.get_ticks_usec() - t0
	frames += 1
	if bench.size() > 0 and frames > 30:
		var tot: float = a.sim_cost_us
		var wk := 0.0
		for bb in bench + [a]:
			if bb != a: tot += bb.sim_cost_us
			if bb.cloth:
				wk += bb.cloth.step_us; bb.cloth.step_us = 0.0
				tot -= bb.cloth.wait_us; wt_us += bb.cloth.wait_us; bb.cloth.wait_us = 0.0
		sim_us += tot
		work_us += wk
		tot_us += el
		if frames % 120 == 0:
			var nf := float(frames - 30)
			print("%d characters: animate %.0f us per character on the main thread, of which cloth/hair %.0f us; steps %.0f us per character-frame (threaded %s; waited %.0f)" % [bench.size() + 1, tot_us / nf / (bench.size() + 1), sim_us / nf / (bench.size() + 1), work_us / nf / (bench.size() + 1), ClothSim.threaded, wt_us / nf / (bench.size() + 1)])
	var c := pos + Vector3(0, 0.9, 0)
	var off := Vector3(3.2, 0.4, 0)
	match view:
		"front": off = Vector3(sin(yaw), 0.15, cos(yaw)) * 3.0
		"back": off = -Vector3(sin(yaw), -0.15, cos(yaw)) * 3.0
		"three": off = Vector3(sin(yaw + 1.0), 0.2, cos(yaw + 1.0)) * 3.0
		"head": off = -Vector3(sin(yaw + 0.6), -0.1, cos(yaw + 0.6)) * 1.1; c.y += 0.6
		"side": off = Vector3(sin(yaw + PI / 2.0), 0.12, cos(yaw + PI / 2.0)) * 3.0
	cam.look_at_from_position(c + off, c)
