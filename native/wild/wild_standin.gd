class_name WildStandin
extends Node3D
# A stand-in Pidgey made of simple shapes, used until the real model
# (Creature.make("pidgey"), creatures/pidgey.glb) is in the build. It answers
# the Creature calls wild.gd makes, so the hunt never needs to know which it has:
#   animate(dt, speed)   mood(name)   busy()   look_at_pos   fly_height / flying   wing_phase
# Moods: idle, peck, look, ruffle, startle, hop, walk, run, takeoff, fly, glide,
# land, hide (crouched low in the grass).
# Origin on the ground under it, facing +Z, about 0.35 m tall.

var species := "pidgey"
var look_at_pos := Vector3(NAN, NAN, NAN)
var fly_height := 0.0
var flying := false
var wing_phase := 0.0
var footfalls := 0
var pecks := 0
var hops := 0
var act := "idle"
var act_t := 0.0
var t := 0.0
var rng := RandomNumberGenerator.new()
var body: Node3D
var head: Node3D
var wl: Node3D
var wr: Node3D
var tail: Node3D
var legs: Array = []
var _hy := 0.0           # head yaw (spring)
var _hyv := 0.0
var _hgoal := 0.0
var _hnext := 1.0
var _low := 0.0          # how far it is crouched down (hide)
var _wing := 0.0         # wings open 0..1
var _hop := 0.0

const BROWN := Color("a8743e")
const DARK := Color("6e4422")
const CREAM := Color("f2ddb0")
const BEAK := Color("8b8378")
const PINK := Color("e0a090")

static func make() -> WildStandin:
	var s := WildStandin.new()
	s.name = "Standin_pidgey"
	s._build()
	return s

func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	return m

func _part(parent: Node3D, mesh: Mesh, c: Color, at: Vector3, sc := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = _mat(c)
	mi.position = at
	mi.scale = sc
	mi.rotation = rot
	parent.add_child(mi)
	return mi

func _sphere(r: float) -> SphereMesh:
	var s := SphereMesh.new(); s.radius = r; s.height = r * 2.0; s.radial_segments = 16; s.rings = 8
	return s

func _build() -> void:
	rng.randomize()
	body = Node3D.new(); body.position = Vector3(0, 0.15, 0); add_child(body)
	_part(body, _sphere(0.13), BROWN, Vector3.ZERO, Vector3(1.0, 0.95, 1.3))
	_part(body, _sphere(0.11), CREAM, Vector3(0, -0.02, 0.05), Vector3(0.95, 0.9, 1.15))
	head = Node3D.new(); head.position = Vector3(0, 0.12, 0.11); body.add_child(head)
	_part(head, _sphere(0.085), BROWN, Vector3(0, 0.03, 0))
	_part(head, _sphere(0.062), CREAM, Vector3(0, 0.0, 0.035), Vector3(1.1, 0.9, 1.0))
	var beak := CylinderMesh.new(); beak.top_radius = 0.0; beak.bottom_radius = 0.022; beak.height = 0.06
	_part(head, beak, BEAK, Vector3(0, 0.02, 0.1), Vector3.ONE, Vector3(PI / 2.0, 0, 0))
	for sx in [-1.0, 1.0]:
		_part(head, _sphere(0.014), Color("1a1a1a"), Vector3(sx * 0.045, 0.045, 0.06))
		# the black stripe behind the eye
		_part(head, BoxMesh.new(), Color("1a1a1a"), Vector3(sx * 0.07, 0.04, 0.03), Vector3(0.01, 0.014, 0.05), Vector3(0, sx * 0.5, 0))
	# the crest: three tan feathers swept back
	for i in 3:
		_part(head, BoxMesh.new(), CREAM if i == 1 else BROWN, Vector3((i - 1) * 0.018, 0.11, -0.02), Vector3(0.012, 0.07, 0.03), Vector3(-0.6 - 0.15 * absf(i - 1), 0, (i - 1) * 0.2))
	wl = Node3D.new(); wl.position = Vector3(0.11, 0.04, -0.01); body.add_child(wl)
	wr = Node3D.new(); wr.position = Vector3(-0.11, 0.04, -0.01); body.add_child(wr)
	for w in [[wl, 1.0], [wr, -1.0]]:
		_part(w[0], BoxMesh.new(), DARK, Vector3(w[1] * 0.012, -0.02, -0.03), Vector3(0.02, 0.1, 0.2))
		_part(w[0], BoxMesh.new(), BROWN, Vector3(w[1] * 0.02, -0.01, -0.02), Vector3(0.015, 0.07, 0.16))
	tail = Node3D.new(); tail.position = Vector3(0, -0.01, -0.15); body.add_child(tail)
	for i in 3:
		_part(tail, BoxMesh.new(), DARK if i != 1 else BROWN, Vector3((i - 1) * 0.03, 0, -0.06), Vector3(0.035, 0.012, 0.13), Vector3(0.35, (i - 1) * 0.35, 0))
	for sx in [-1.0, 1.0]:
		var lg := Node3D.new(); lg.position = Vector3(sx * 0.045, 0.06, 0.0); add_child(lg)
		var cy := CylinderMesh.new(); cy.top_radius = 0.008; cy.bottom_radius = 0.008; cy.height = 0.07
		_part(lg, cy, PINK, Vector3(0, -0.03, 0))
		_part(lg, BoxMesh.new(), PINK, Vector3(0, -0.062, 0.02), Vector3(0.03, 0.006, 0.05))
		legs.append(lg)

func busy() -> bool:
	return act in ["peck", "startle", "takeoff", "land", "ruffle"] and act_t < 0.6

func mood(what: String) -> void:
	if what == act and what in ["fly", "glide", "walk", "run", "hide", "idle", "look"]: return
	act = what; act_t = 0.0
	match what:
		"peck": pecks += 1
		"hop", "takeoff": hops += 1
	flying = what in ["takeoff", "fly", "glide"]

func animate(dt: float, speed: float) -> void:
	t += dt; act_t += dt
	# the head's looks: at something, or about
	_hnext -= dt
	if _hnext <= 0.0:
		_hnext = rng.randf_range(0.4, 1.6)
		_hgoal = rng.randf_range(-1.0, 1.0)
	var goal := _hgoal
	if not is_nan(look_at_pos.x) and act in ["look", "startle", "idle", "hop"]:
		var l := global_transform.affine_inverse() * look_at_pos
		goal = clampf(atan2(l.x, l.z), -1.4, 1.4)
	var w := 14.0
	_hyv += ((goal - _hy) * w * w - 2.0 * w * _hyv) * dt
	_hy += _hyv * dt
	var low_want := 1.0 if act == "hide" else 0.0
	_low += (low_want - _low) * (1.0 - exp(-dt * 6.0))
	var wing_want := 1.0 if act in ["takeoff", "fly", "glide", "startle"] else (0.4 if act == "ruffle" else 0.0)
	_wing += (wing_want - _wing) * (1.0 - exp(-dt * 12.0))
	var br := sin(t * 3.0) * 0.01
	var hp := 0.0       # head pitch (+ down)
	var hh := 0.0       # head height
	var bp := 0.0       # body pitch
	var by := 0.0
	match act:
		"peck":
			var u := clampf(act_t / 0.35, 0.0, 1.0)
			hp = sin(u * PI) * 1.0; hh = -sin(u * PI) * 0.05; bp = sin(u * PI) * 0.35
			if act_t > 0.45: act = "idle"
		"look":
			hh = 0.04; hp = -0.25
		"startle":
			hh = 0.06; hp = -0.4; bp = -0.3; by = sin(clampf(act_t / 0.25, 0, 1) * PI) * 0.12
		"hop":
			by = absf(sin(act_t * PI / 0.32)) * 0.12
			if act_t > 0.32: act = "idle"
		"walk", "run":
			by = absf(sin(t * (14.0 if act == "run" else 9.0))) * 0.025
			bp = 0.15 if act == "run" else 0.05
		"ruffle":
			body.scale = Vector3.ONE * (1.0 + sin(act_t * 40.0) * 0.06 * (1.0 - clampf(act_t / 0.6, 0, 1)))
			if act_t > 0.6: act = "idle"; body.scale = Vector3.ONE
		"takeoff", "fly":
			bp = -0.15
		"glide", "land":
			bp = 0.05
			if act == "land" and act_t > 0.3: act = "idle"; flying = false
	# hiding: tucked down, head low
	by -= _low * 0.07; hp += _low * 0.25
	body.position = Vector3(0, 0.15 + by + br, 0)
	body.rotation = Vector3(bp, 0, 0)
	head.position = Vector3(0, 0.12 + hh, 0.11)
	head.rotation = Vector3(hp, _hy, 0)
	# wings: folded, or beating (fast in flight, a big beat at take-off; held out gliding)
	var rate := 0.0
	if act in ["takeoff", "fly"]: rate = 9.0 if act == "fly" else 12.0
	elif act == "startle": rate = 8.0
	wing_phase = fmod(wing_phase + dt * rate, 1.0)
	var beat := sin(wing_phase * TAU) if rate > 0.0 else 0.0
	var spread := _wing * (1.25 + 0.9 * beat if rate > 0.0 else 1.3)
	wl.rotation = Vector3(0, 0, -spread)
	wr.rotation = Vector3(0, 0, spread)
	tail.rotation = Vector3(-0.1 + _wing * 0.3, 0, 0)
	# the legs tucked up in the air
	for lg in legs:
		lg.visible = not flying or act == "land"
	if speed > 0.2 and not flying and int(t * 9.0) % 2 == 0 and fmod(t * 9.0, 1.0) < dt * 9.0: footfalls += 1
