extends Node3D
# Dev only: Ash crouching on open ground, for render checks of the crouch layer
# (actor.gd _crouch): standing, down into the crouch, still a while, sneaking at
# --speed (1.4 m/s), stopping, still again, and back up to a walk.
#   godot --path native res://dev/crouch_shot.tscn -- [--view=side|three|front|back|close] [--speed=1.4]
#       [--seq=all|walk|idle] [--follow]   (walk: crouched from the start, sneaking on; idle: crouched, still)
var a: CastActor
var cam: Camera3D
var lbl: Label
var view := "side"
var seq := "all"
var speed := 1.4
var t := 0.0
var pos := Vector3.ZERO
var spd := 0.0
var marks: Array = []

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		if x.begins_with("--view="): view = x.substr(7)
		elif x.begins_with("--speed="): speed = float(x.substr(8))
		elif x.begins_with("--seq="): seq = x.substr(6)
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(40, 400); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	# lines every 0.5 m: a planted foot must not slide against them
	for i in 400:
		var s := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(40, 0.01, 0.03 if i % 2 else 0.06); s.mesh = bm; add_child(s)
		s.position = Vector3(0, 0.004, -100 + i * 0.5)
		var sm := StandardMaterial3D.new(); sm.albedo_color = Color(0.45, 0.6, 0.38); s.material_override = sm
	a = CastActor.make("ash"); add_child(a)
	a.ground = func(_x: float, _z: float) -> float: return 0.0
	if seq != "all": a.crouch = 1.0; a.crouch_w = 1.0
	cam = Camera3D.new(); add_child(cam); cam.fov = 38
	var cl := CanvasLayer.new(); add_child(cl)
	lbl = Label.new(); cl.add_child(lbl); lbl.position = Vector2(16, 12)
	lbl.add_theme_font_size_override("font_size", 26); lbl.add_theme_color_override("font_color", Color(0.1, 0.1, 0.2))

func _process(dt: float) -> void:
	t += dt
	var tgt := 0.0
	var cr := 0.0
	match seq:
		"walk": tgt = speed if t > 0.3 else 0.0; cr = 1.0
		"idle": cr = 1.0
		_:
			# 0-0.8 stand, crouch, still till 3.2, sneak till 7.5, still till 9.5, up and walk on
			cr = 1.0 if t > 0.8 and t < 9.5 else 0.0
			if t > 3.2 and t < 7.5: tgt = speed
			elif t > 10.0: tgt = 2.2
	a.crouch = cr
	spd = move_toward(spd, tgt, dt * 6.0)
	pos.z += spd * dt
	a.position = pos
	a.animate(dt, spd, false)
	if OS.get_cmdline_user_args().has("--probe") and fmod(t, 0.5) < dt:
		var hd := a.gxf(a.bones.Spine3).origin - a.gxf(a.bones.Hips).origin
		print("probe t %.1f v %.2f chest-hips %s holder %.3f" % [t, spd, str(hd), a.holder.position.y])
	lbl.text = "crouch %.2f  %.2f m/s  t %.2f" % [a.crouch_w, spd, t]
	var c := Vector3(pos.x, 0.75, pos.z)
	var off := Vector3(4.6, 0.25, 0)
	match view:
		"front": off = Vector3(0.6, 0.35, 4.2)
		"back": off = Vector3(0.6, 0.6, -4.2)
		"three": off = Vector3(3.0, 0.7, 2.8)
		"close": off = Vector3(2.4, 0.2, 0.6); c.y = 0.5
	cam.look_at_from_position(c + off, c)
