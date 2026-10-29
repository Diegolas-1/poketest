class_name PkmnBall
extends RefCounted
# A Poké Ball for the stage (a throw, a recall, the formal opening's ball in hand)
# and its release: the ball pops open in a white flash, rings and sparks.
#   var b := PkmnBall.make(0.07)        # a Node3D (radius m), cel-shaded like the cast
#   PkmnBall.burst(fx, at)              # the release flash at a point (BattleFx)

static func make(r := 0.075) -> Node3D:
	var ball := Node3D.new()
	ball.name = "PokeBall"
	var mat := func(c: String) -> ShaderMaterial:
		var m := ShaderMaterial.new(); m.shader = CastActor.SHADER
		m.set_shader_parameter("albedo", Color(c)); return m
	var s1 := SphereMesh.new(); s1.radius = r; s1.height = r; s1.is_hemisphere = true; s1.radial_segments = 20; s1.rings = 6
	var top := MeshInstance3D.new(); top.mesh = s1; top.material_override = mat.call("e8352e"); ball.add_child(top)
	var bot := MeshInstance3D.new(); bot.mesh = s1; bot.material_override = mat.call("f4f2ee"); bot.rotation.x = PI; ball.add_child(bot)
	var band := MeshInstance3D.new(); var cy := CylinderMesh.new(); cy.top_radius = r * 1.01; cy.bottom_radius = r * 1.01; cy.height = r * 0.16; cy.radial_segments = 20
	band.mesh = cy; band.material_override = mat.call("2f2b36"); ball.add_child(band)
	var btn := MeshInstance3D.new(); var cb := CylinderMesh.new(); cb.top_radius = r * 0.34; cb.bottom_radius = r * 0.34; cb.height = r * 0.2; cb.radial_segments = 16
	btn.mesh = cb; btn.material_override = mat.call("2f2b36"); btn.rotation.x = PI / 2; btn.position.z = r * 0.95; ball.add_child(btn)
	var b2 := MeshInstance3D.new(); var cb2 := CylinderMesh.new(); cb2.top_radius = r * 0.22; cb2.bottom_radius = r * 0.22; cb2.height = r * 0.24; cb2.radial_segments = 16
	b2.mesh = cb2; b2.material_override = mat.call("f4f2ee"); b2.rotation.x = PI / 2; b2.position.z = r * 1.0; ball.add_child(b2)
	ball.top_level = true
	return ball

# the release: a white burst with a ring on the ground and sparks flung out
static func burst(fx: BattleFx, at: Vector3, col := Color(1.0, 0.97, 0.88)) -> void:
	if fx == null: return
	fx.spawn("star", at, Vector3.ZERO, {"life": 0.28, "size": 1.3, "size_end": 2.6, "col": Color(col, 1.0)})
	fx.spawn("ring", at, Vector3.ZERO, {"life": 0.4, "size": 0.3, "size_end": 2.4, "col": Color(col, 0.95)})
	fx.spawn("ring", at - Vector3(0, 0.45, 0), Vector3.ZERO, {"life": 0.55, "size": 0.4, "size_end": 3.0, "col": Color(0.6, 0.85, 1.0, 0.8)})
	for i in 14:
		var d := Vector3(randf_range(-1, 1), randf_range(0.2, 1.3), randf_range(-1, 1)).normalized()
		fx.spawn("star", at, d * randf_range(2.5, 5.0), {"life": randf_range(0.3, 0.55), "size": 0.22, "size_end": 0.04, "col": Color(col, 1.0), "rot": randf() * TAU, "drag": 3.0})
