extends Node3D
# Dev only: Nurse Joy (ScenePerson, native/joy/scene_person.gd) through her verbs on open
# ground, beside Officer Jenny, for render checks without the world:
#   godot --path native --write-movie <dir>/f.png --fixed-fps 15 --quit-after N res://dev/joy_shot.tscn --
#     [--act=rescue|bow|clasp|talk|kneel|run] [--cam=x,y,z,tx,ty,tz] [--jenny]
# rescue: she runs in from 8 m off to Ash lying on the ground (a stand-in: Ash's look, laid
# down), kneels by him, talks with gestures, gets up, clasps her hands and bows.
var act := "rescue"
var joy: ScenePerson
var jenny: ScenePerson
var ash: CastActor
var cam: Camera3D
var t := 0.0
var _said := {}
var camv := PackedFloat64Array()

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		var kv := x.trim_prefix("--").split("=", true, 1)
		var v: String = kv[1] if kv.size() > 1 else ""
		match kv[0]:
			"act": act = v
			"cam": camv = PackedFloat64Array(Array(v.split(",")).map(func(s): return float(s)))
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(60, 60); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	var flat := func(_x: float, _z: float) -> float: return 0.0
	joy = ScenePerson.make("joy")
	add_child(joy)
	joy.ground = flat
	if act in ["rescue", "run"]:
		joy.place(Vector3(-6.0, 0, 5.0), 2.3)
		# Ash, down on the ground (his look laid on his back: a stand-in for the battle's own)
		ash = CastActor.make("ash")
		add_child(ash)
		ash.position = Vector3(0, 0.12, 0)
		ash.rotation = Vector3(-PI / 2, 0.4, 0)
	else:
		joy.place(Vector3(-0.45, 0, 0), 0.0)
	if act in ["clasp", "bow", "talk"] or OS.get_cmdline_user_args().has("--jenny"):
		jenny = ScenePerson.make("jenny")
		add_child(jenny)
		jenny.ground = flat
		jenny.place(Vector3(0.5, 0, 0), -0.15)
		jenny.actor.idles.stance = "hands_front"
	cam = Camera3D.new(); add_child(cam); cam.fov = 32
	if camv.size() == 6: cam.look_at_from_position(Vector3(camv[0], camv[1], camv[2]), Vector3(camv[3], camv[4], camv[5]))
	elif act in ["rescue", "run"]: cam.look_at_from_position(Vector3(3.2, 1.7, 4.2), Vector3(-0.6, 0.6, 0.5))
	else: cam.look_at_from_position(Vector3(0, 1.1, 4.6), Vector3(0, 0.95, 0))

func _once(k: String, at: float) -> bool:
	if t >= at and not _said.has(k):
		_said[k] = true
		return true
	return false

func _process(dt: float) -> void:
	t += dt
	var ov = Settings.get("overlay")
	if ov: ov.visible = false
	if ash: ash.animate(dt, 0.0, false)
	match act:
		"rescue":
			if _once("go", 0.3): joy.kneel_by(Vector3(0, 0, 0), 4.2)
			if joy.state == "kneel" and _once("s1", 0.0): _said["s1t"] = t
			if _said.has("s1t"):
				var k: float = _said.s1t
				if _once("l1", k + 0.4): joy.say("Oh my goodness... Ash? Can you hear me?")
				if _once("l2", k + 3.2): joy.emote("worry"); joy.say("You poor thing, you're all scraped up.")
				if _once("l3", k + 6.4): joy.emote("explain"); joy.say("Wild Pokémon are dangerous when you have none of your own to protect you.")
				if _once("up", k + 9.8): joy.stand_up()
				if _once("cl", k + 10.6): joy.clasp(true)
				if _once("bw", k + 11.6): joy.bow()
		"run":
			if _once("go", 0.3): joy.run_to(Vector3(0, 0, 0), 4.2, 1.0)
		"kneel":
			if _once("k", 0.3): joy.kneel_by(Vector3(-0.45, 0, 0.62))
		"clasp":
			if _once("c", 0.2): joy.clasp(true)
		"bow":
			if _once("c", 0.2): joy.clasp(true)
			if _once("b", 1.0): joy.bow()
			if _once("j", 1.6): jenny.actor.idles.force("salute")
		"talk":
			if _once("a", 0.5): joy.look_at_node(jenny); joy.say("Officer Jenny! Thank goodness you're here.")
			if _once("b", 3.0): joy.emote("worry"); joy.say("I'm so worried about the people on the road.")
			if _once("c", 6.0): joy.emote("explain")
			if _once("d", 6.0): jenny.look_at_node(joy)
	Ink.set_focus(cam.global_position)
