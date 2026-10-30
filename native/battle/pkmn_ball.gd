class_name PkmnBall
extends RefCounted
# A Poké Ball for the stage (a throw, a recall, the formal opening's ball in hand)
# and its release: the ball pops open in a white flash, rings and sparks.
#   var b := PkmnBall.make(0.07)        # a Node3D (radius m), cel-shaded like the cast
#   PkmnBall.make(0.07, "great_ball")   # another type (battle_config catch.balls: its top, its marks)
#   PkmnBall.set_open(b, k)             # the lid (0 shut .. 1 wide open), hinged at the back
#   PkmnBall.burst(fx, at)              # the release flash at a point (BattleFx)
# The button faces +z; the lid opens upward from the front.

static func _mat(c) -> ShaderMaterial:
	var m := ShaderMaterial.new(); m.shader = CastActor.SHADER
	m.set_shader_parameter("albedo", Color(c)); return m

static func make(r := 0.075, kind := "poke_ball") -> Node3D:
	var ball := Node3D.new()
	ball.name = "PokeBall"
	var B := CatchRules.ball(kind)
	var s1 := SphereMesh.new(); s1.radius = r; s1.height = r; s1.is_hemisphere = true; s1.radial_segments = 20; s1.rings = 6
	# the lid: the top half on a hinge at the back
	var lid := Node3D.new(); lid.name = "Lid"; lid.position.z = -r; ball.add_child(lid)
	var top := MeshInstance3D.new(); top.mesh = s1; top.material_override = _mat(String(B.get("col", "e8352e"))); top.position.z = r; lid.add_child(top)
	if B.has("band"): _marks(top, r, kind, String(B.band))
	var inner := MeshInstance3D.new(); var di := CylinderMesh.new(); di.top_radius = r * 0.96; di.bottom_radius = r * 0.96; di.height = r * 0.02; di.radial_segments = 20
	inner.mesh = di; inner.material_override = _mat("3a3440"); inner.position = Vector3(0, r * 0.02, r); lid.add_child(inner)
	var bot := MeshInstance3D.new(); bot.mesh = s1; bot.material_override = _mat("f4f2ee"); bot.rotation.x = PI; ball.add_child(bot)
	var floor_ := MeshInstance3D.new(); floor_.mesh = di; floor_.material_override = _mat("3a3440"); floor_.position.y = -r * 0.02; ball.add_child(floor_)
	var band := MeshInstance3D.new(); var cy := CylinderMesh.new(); cy.top_radius = r * 1.01; cy.bottom_radius = r * 1.01; cy.height = r * 0.16; cy.radial_segments = 20
	band.mesh = cy; band.material_override = _mat("2f2b36"); ball.add_child(band)
	var btn := MeshInstance3D.new(); var cb := CylinderMesh.new(); cb.top_radius = r * 0.34; cb.bottom_radius = r * 0.34; cb.height = r * 0.2; cb.radial_segments = 16
	btn.mesh = cb; btn.material_override = _mat("2f2b36"); btn.rotation.x = PI / 2; btn.position.z = r * 0.95; ball.add_child(btn)
	var b2 := MeshInstance3D.new(); var cb2 := CylinderMesh.new(); cb2.top_radius = r * 0.22; cb2.bottom_radius = r * 0.22; cb2.height = r * 0.24; cb2.radial_segments = 16
	b2.name = "Button"
	b2.mesh = cb2; b2.material_override = _mat("f4f2ee"); b2.rotation.x = PI / 2; b2.position.z = r * 1.0; ball.add_child(b2)
	ball.top_level = true
	return ball

# a type's marks on the lid: the Great Ball's red flashes, the Ultra Ball's yellow
# H, the Master Ball's pink bumps (flattened spheres on the dome)
static func _marks(top: Node3D, r: float, kind: String, col: String) -> void:
	var m := _mat(col)
	for sx in [-1.0, 1.0]:
		var sp := SphereMesh.new(); sp.radius = r * 0.5; sp.height = r; sp.radial_segments = 12; sp.rings = 6
		var mi := MeshInstance3D.new(); mi.mesh = sp; mi.material_override = m
		var a := 0.85
		var d := Vector3(sx * sin(a), cos(a), 0.0)
		match kind:
			"ultra_ball":
				d = Vector3(sx * sin(0.62), cos(0.62), 0.0)
				mi.scale = Vector3(0.26, 0.16, 1.5)
			"master_ball":
				d = Vector3(sx * sin(0.7), cos(0.7) * 0.9, 0.42).normalized()
				mi.scale = Vector3(0.5, 0.3, 0.5)
			_:
				d = Vector3(sx * sin(0.95), cos(0.95), 0.25).normalized()
				mi.scale = Vector3(0.62, 0.2, 0.42)
		mi.position = d * r * 0.93
		mi.basis = Basis(Quaternion(Vector3.UP, d)) * Basis.from_scale(mi.scale)
		top.add_child(mi)

static func set_open(ball: Node3D, k: float) -> void:
	var lid := ball.get_node_or_null("Lid") as Node3D
	if lid: lid.rotation.x = -1.9 * k

# the release: a white burst with a ring on the ground and sparks flung out
static func burst(fx: BattleFx, at: Vector3, col := Color(1.0, 0.97, 0.88)) -> void:
	if fx == null: return
	fx.spawn("star", at, Vector3.ZERO, {"life": 0.28, "size": 1.3, "size_end": 2.6, "col": Color(col, 1.0)})
	fx.spawn("ring", at, Vector3.ZERO, {"life": 0.4, "size": 0.3, "size_end": 2.4, "col": Color(col, 0.95)})
	fx.spawn("ring", at - Vector3(0, 0.45, 0), Vector3.ZERO, {"life": 0.55, "size": 0.4, "size_end": 3.0, "col": Color(0.6, 0.85, 1.0, 0.8)})
	for i in 14:
		var d := Vector3(randf_range(-1, 1), randf_range(0.2, 1.3), randf_range(-1, 1)).normalized()
		fx.spawn("star", at, d * randf_range(2.5, 5.0), {"life": randf_range(0.3, 0.55), "size": 0.22, "size_end": 0.04, "col": Color(col, 1.0), "rot": randf() * TAU, "drag": 3.0})
