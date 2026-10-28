extends Node3D
# Dev only: Ash jumping on open ground, for render checks of the jump variants and the
# landings, with the game's own jump physics (cast.gd: take-off 5.2 m/s, gravity 16,
# the ledge hop 3.2 m/s, the 0.3 m snap down).
#   godot --path native res://dev/jump_shot.tscn -- [--seq=stand|walk|run|hop|drop|all]
#       [--n=5] [--h=2.0] [--speed=m/s] [--variant=tuck|knee|...] [--land=soft|land|...]
#       [--view=side|three|front|back] [--quiet]
# stand / walk / run: --n jumps in a row (standing, walking, at a run); hop: off a ledge
# --h high with the ledge hop; drop: walking (or --speed) off a ledge --h high; all:
# two standing jumps, two at a jog, then off a 3 m and a 1.2 m ledge. --variant / --land force those
# (CastActor.JV / LAND). Prints each jump's variant and landing.
var a: CastActor
var cam: Camera3D
var lbl: Label
var seq := "all"
var n := 5
var h := 2.0
var speed := -1.0
var view := "side"
var quiet := false
var t := 0.0
var pos := Vector3.ZERO
var vy := 0.0
var ground := true
var spd := 0.0
var plan: Array = []        # [until t, speed, action ("jump" | "")]
var done := {}
var ledges: Array = []      # [z, height]: steps down, the ground that much higher for z below it
var cam_y := 0.0
var was_air := false

func _ground(_x: float, z: float) -> float:
	var g := 0.0
	for L in ledges: if z < L[0]: g += L[1]
	return g

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		if x.begins_with("--seq="): seq = x.substr(6)
		elif x.begins_with("--n="): n = int(x.substr(4))
		elif x.begins_with("--h="): h = float(x.substr(4))
		elif x.begins_with("--speed="): speed = float(x.substr(8))
		elif x.begins_with("--view="): view = x.substr(7)
		elif x == "--quiet": quiet = true
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(40, 400); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	for i in 200:
		var s := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(40, 0.01, 0.05); s.mesh = bm; add_child(s)
		s.position = Vector3(0, 0.004, -100 + i * 1.0)
		var sm := StandardMaterial3D.new(); sm.albedo_color = Color(0.45, 0.6, 0.38); s.material_override = sm
	match seq:
		"stand":
			for i in n: plan.append([0.6 + i * 1.25, 0.0, "jump"])
			plan.append([0.6 + n * 1.25 + 0.6, 0.0, ""])
		"walk", "run":
			var v := speed if speed >= 0.0 else (3.2 if seq == "walk" else CastActor.RUN_V)
			plan.append([0.8, v, ""])
			for i in n: plan.append([0.8 + (i + 1) * 1.3, v, "jump"])
			plan.append([0.8 + (n + 1) * 1.3 + 0.6, v, ""])
			plan.append([0.8 + (n + 1) * 1.3 + 1.6, 0.0, ""])
		"hop", "drop":
			ledges.append([0.0, h])
			pos.z = -4.0 if seq == "drop" else -2.0
			var v2 := speed if speed >= 0.0 else (2.6 if seq == "drop" else CastActor.RUN_V * 0.6)
			plan = [[0.4, 0.0, ""], [0.4 + absf(pos.z) / maxf(v2, 0.1) + 1.2, v2, ""], [3.4 + absf(pos.z) / maxf(v2, 0.1), 0.0, ""]]
		_:
			# standing, at a run, then off a 1.2 m and a 3 m ledge at a run
			ledges = [[30.0, 3.0], [16.0, 1.2]]
			plan = [[0.6, 0.0, "jump"], [1.85, 0.0, "jump"], [3.0, 0.0, ""], [3.6, CastActor.RUN_V * 0.6, "jump"], [4.9, CastActor.RUN_V * 0.6, "jump"],
				[9.8, CastActor.RUN_V * 0.6, ""], [11.0, 0.0, ""]]
	pos.y = _ground(pos.x, pos.z)
	a = CastActor.make("ash"); add_child(a)
	a.ground = func(x: float, z: float) -> float: return _ground(x, z)
	for x in OS.get_cmdline_user_args():
		if x.begins_with("--variant="): a.jump_pick = x.substr(10)
		elif x.begins_with("--land="): a.land_pick = x.substr(7)
	for L in ledges:
		var top := _ground(0.0, L[0] - 0.01)
		var b := MeshInstance3D.new(); var bx := BoxMesh.new(); bx.size = Vector3(6, top, 200); b.mesh = bx; add_child(b)
		b.position = Vector3(0, top / 2.0, L[0] - 100.0)
		var bmat := StandardMaterial3D.new(); bmat.albedo_color = Color(0.7, 0.62, 0.48); b.material_override = bmat
	cam = Camera3D.new(); add_child(cam); cam.fov = 40
	cam_y = pos.y
	var cl := CanvasLayer.new(); add_child(cl)
	lbl = Label.new(); cl.add_child(lbl); lbl.position = Vector2(16, 12)
	lbl.add_theme_font_size_override("font_size", 26); lbl.add_theme_color_override("font_color", Color(0.1, 0.1, 0.2))

func _process(dt: float) -> void:
	t += dt
	var tgt := 0.0
	for i in plan.size():
		var p: Array = plan[i]
		if t < p[0]:
			tgt = p[1]
			if p[2] == "jump" and not done.has(i) and ground and t > p[0] - 0.05:
				done[i] = true; vy = 5.2; ground = false
			break
	spd = move_toward(spd, tgt, dt * (14.0 if tgt > spd else 22.0))
	pos.z += spd * dt
	# cast.gd's gravity, the ledge hop and the snap down
	var g := _ground(pos.x, pos.z)
	if seq == "hop" and ground and pos.z > -0.3 and pos.z < 0.0 and not done.has("hop"):
		done["hop"] = true; vy = 3.2; ground = false
	vy -= 16.0 * dt
	pos.y += vy * dt
	if pos.y <= g: pos.y = g; vy = 0.0; ground = true
	if ground and pos.y - g < 0.3: pos.y = g
	var air := not ground or pos.y - g > 0.3
	a.position = pos
	a.animate(dt, spd, air)
	if air and not was_air and not quiet: print("t %.2f jump: %s %s (vy0 %.2f, speed %.1f)" % [t, a.jump.kind, a.jump.var, a.jump.vy0, spd])
	if was_air and not air and not quiet: print("t %.2f land: %s (drop %.2f m)" % [t, a.jump.ld, a.jump.top - pos.y])
	was_air = air
	lbl.text = "%s  %s%s" % [a.jump.var, ("-> " + String(a.jump.ld)) if a.jump.land < 1.0 else "", "  t %.2f" % t]
	cam_y += (g - cam_y) * (1.0 - exp(-dt * 2.5))
	var c := Vector3(pos.x, cam_y + 1.1, pos.z)
	var off := Vector3(5.0, 0.3, 0)
	match view:
		"front": off = Vector3(0.4, 0.3, 4.0)
		"back": off = Vector3(0.4, 0.5, -4.0)
		"three": off = Vector3(3.0, 0.6, 2.6)
	cam.look_at_from_position(c + off, c)
