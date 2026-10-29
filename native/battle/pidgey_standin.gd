class_name PidgeyStandin
extends Node3D
# A stand-in Pidgey until the baked model lands (res://creatures/pidgey.glb and
# creature_pidgey.gd, the ASSETS worker's): simple rigid parts (round body and
# head, a crest, wings that beat, a tail fan, legs) with the people's cel
# shading, and the same calls as a Creature, so the battle and the tracking
# code are written against the real thing:
#   animate(dt, speed)   mood(name)   busy()   reset()   look_at_pos
#   flying / fly_height (m above the ground), wing_phase (0..1, 0 = wings at the
#   top of the beat; the gust's wind pulses on the down stroke)
# Moods: idle, peck, look, ruffle, startle, hop, walk, run, takeoff, fly, glide,
# land, hide; battle acts gust, tackle, quick_attack, sand_attack, hurt, flinch,
# faint, flee, taunt, wings_spread.
# Facing +Z, standing on y = 0 (its node), about 0.5 m tall.

const SHADER := preload("res://shaders/actor.gdshader")
const SHADER_DS := preload("res://shaders/actor_ds.gdshader")
const SIZE := 1.3

var species := "pidgey"
var meshes: Array[MeshInstance3D] = []
var look_at_pos := Vector3(NAN, NAN, NAN)
var sleep := false
var flying := false
var fly_height := 0.0          # now (m)
var fly_want := 0.0
var wing_phase := 0.0          # 0..1 a beat
var flap_rate := 0.0           # beats a second
var flap_amp := 0.0            # 0 folded .. 1 full beat
var spread := 0.0              # wings held open (0 folded .. 1 spread)
var footfalls := 0
var pecks := 0
var hops := 0
var rng := RandomNumberGenerator.new()

var body: Node3D
var head: Node3D
var wing_l: Node3D
var wing_r: Node3D
var tail: Node3D
var legs: Array[Node3D] = []
var eyes: Array[MeshInstance3D] = []
var _t := 0.0
var _act := ""
var _act_t := 0.0
var _act_len := 0.0
var _walk_ph := 0.0
var _pitch := 0.0              # body pitch (+ = nose down)
var _head_p := 0.0
var _head_y := 0.0
var _crouch := 0.0
var _hop_y := 0.0
var _squash := 0.0
var _next_idle := 2.0
var _roll := 0.0

func _init() -> void:
	name = "Creature_pidgey"
	rng.randomize()
	_build()
	add_to_group("characters")

static func _mat(c: Color, ds := false, vc := false) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = SHADER_DS if ds else SHADER
	m.set_shader_parameter("albedo", c)
	m.set_shader_parameter("use_vc", vc)
	return m

func _part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, scl := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.scale = scl
	mi.rotation = rot
	parent.add_child(mi)
	meshes.append(mi)
	return mi

static func _sphere(r := 0.5, seg := 18) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r; s.height = r * 2.0; s.radial_segments = seg; s.rings = seg / 2
	return s

static func _cone(r: float, h: float) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = 0.0; c.bottom_radius = r; c.height = h; c.radial_segments = 8; c.rings = 1
	return c

# a wing: a flat feathered outline in the x-z plane (x out along the span),
# brown at the root to dark tips (vertex colours), scalloped trailing edge
static func _wing_mesh(side: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var root_c := Color("a86a3c")
	var tip_c := Color("5a3420")
	var pts: Array[Vector2] = [Vector2(0.0, 0.07), Vector2(0.12, 0.085), Vector2(0.24, 0.07), Vector2(0.33, 0.035), Vector2(0.38, -0.01)]
	# primaries: scallops along the trailing edge, from the tip back to the body
	var n := 7
	for i in n:
		var u := float(i) / (n - 1)
		var x := lerpf(0.37, 0.03, u)
		var z := lerpf(-0.05, -0.12, u) - 0.05 * sin(u * PI)
		pts.append(Vector2(x, z))
		if i < n - 1: pts.append(Vector2(lerpf(x, lerpf(0.37, 0.03, float(i + 1) / (n - 1)), 0.5), z + 0.035))
	pts.append(Vector2(0.0, -0.06))
	var c := Vector2(0.08, 0.0)
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		for p in [c, a, b]:
			var k := clampf((p as Vector2).x / 0.38, 0.0, 1.0)
			st.set_color(root_c.lerp(tip_c, k * k))
			st.set_normal(Vector3.UP)
			st.add_vertex(Vector3((p as Vector2).x * side, 0.0, (p as Vector2).y))
	return st.commit()

static func _tail_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in 5:
		var a := lerpf(-0.5, 0.5, i / 4.0)
		var d := Vector2(sin(a), -cos(a))
		var s := Vector2(d.y, -d.x) * 0.035
		var tip := d * 0.2
		for p in [Vector2.ZERO + s * 0.5, tip + s, tip - s, Vector2.ZERO + s * 0.5, tip - s, Vector2.ZERO - s * 0.5]:
			var k := (p as Vector2).length() / 0.2
			st.set_color(Color("a86a3c").lerp(Color("4a2c1c"), k))
			st.set_normal(Vector3.UP)
			st.add_vertex(Vector3((p as Vector2).x, 0.0, (p as Vector2).y))
	return st.commit()

func _build() -> void:
	var brown := _mat(Color("a8703f"))
	var cream := _mat(Color("f2dcae"))
	var dark := _mat(Color("2a1e1c"))
	var beak_m := _mat(Color("6d6266"))
	var pink := _mat(Color("e59a8a"))
	var white := _mat(Color("ffffff"))
	var wing_m := _mat(Color.WHITE, true, true)
	var root := Node3D.new()
	root.scale = Vector3.ONE * SIZE
	add_child(root)
	body = Node3D.new()
	body.position = Vector3(0, 0.2, 0)
	root.add_child(body)
	_part(body, _sphere(), brown, Vector3(0, 0, 0), Vector3(0.27, 0.25, 0.32))
	_part(body, _sphere(), cream, Vector3(0, -0.02, 0.055), Vector3(0.22, 0.21, 0.24))
	head = Node3D.new()
	head.position = Vector3(0, 0.13, 0.1)
	body.add_child(head)
	_part(head, _sphere(), brown, Vector3(0, 0.05, 0), Vector3(0.2, 0.19, 0.2))
	_part(head, _sphere(), cream, Vector3(0, 0.03, 0.045), Vector3(0.16, 0.13, 0.13))
	# the beak: grey, short and hooked a little down
	_part(head, _cone(0.03, 0.08), beak_m, Vector3(0, 0.04, 0.125), Vector3.ONE, Vector3(PI * 0.5 + 0.25, 0, 0))
	# eyes with the black stripe behind them, a white glint
	for s in [1.0, -1.0]:
		_part(head, _sphere(), dark, Vector3(0.06 * s, 0.075, 0.06), Vector3(0.11, 0.03, 0.06), Vector3(0, -0.5 * s, 0))
		var e := _part(head, _sphere(), dark, Vector3(0.062 * s, 0.072, 0.075), Vector3(0.032, 0.04, 0.028))
		eyes.append(e)
		_part(head, _sphere(), white, Vector3(0.07 * s, 0.083, 0.085), Vector3(0.011, 0.011, 0.008))
	# the crest: tan tufts sweeping back over the head, the longest in the middle
	for i in 3:
		var x := (i - 1) * 0.022
		var ln := 0.1 if i == 1 else 0.075
		_part(head, _cone(0.018, ln), cream if i == 1 else brown, Vector3(x, 0.145, 0.03 - i % 2 * 0.01), Vector3.ONE, Vector3(-1.0 - 0.15 * (1 - absf(i - 1)), 0, (i - 1) * -0.25))
	_part(head, _cone(0.02, 0.07), _mat(Color("e9a07e")), Vector3(0, 0.15, 0.0), Vector3.ONE, Vector3(-0.7, 0, 0))
	# wings at the shoulders, folded along the sides at rest
	wing_l = Node3D.new(); wing_l.position = Vector3(0.11, 0.06, 0.03); body.add_child(wing_l)
	wing_r = Node3D.new(); wing_r.position = Vector3(-0.11, 0.06, 0.03); body.add_child(wing_r)
	_part(wing_l, _wing_mesh(1.0), wing_m, Vector3.ZERO)
	_part(wing_r, _wing_mesh(-1.0), wing_m, Vector3.ZERO)
	tail = Node3D.new(); tail.position = Vector3(0, 0.02, -0.14); body.add_child(tail)
	_part(tail, _tail_mesh(), wing_m, Vector3.ZERO)
	for s in [1.0, -1.0]:
		var lg := Node3D.new()
		lg.position = Vector3(0.05 * s, 0.1, 0.0)
		root.add_child(lg)
		var cy := CylinderMesh.new(); cy.top_radius = 0.012; cy.bottom_radius = 0.01; cy.height = 0.1; cy.radial_segments = 6
		_part(lg, cy, pink, Vector3(0, -0.05, 0))
		for k in 3:
			_part(lg, _cone(0.008, 0.05), pink, Vector3(0, -0.1, 0.015), Vector3.ONE, Vector3(PI * 0.5, (k - 1) * 0.5, 0))
		legs.append(lg)
	for m in meshes: m.extra_cull_margin = 0.5

# ---------- the calls ----------
func mood(what: String) -> void:
	_act = what
	_act_t = 0.0
	_act_len = {"peck": 0.6, "look": 1.2, "ruffle": 0.9, "startle": 0.5, "hop": 0.45, "takeoff": 0.6, "land": 0.5,
		"gust": 2.6, "tackle": 0.9, "quick_attack": 0.7, "sand_attack": 1.2, "hurt": 0.55, "flinch": 0.35,
		"faint": 1.4, "flee": 0.8, "taunt": 1.2, "wings_spread": 1.4, "hide": 1e9, "fly": 1e9, "glide": 1e9}.get(what, 0.8)
	match what:
		"takeoff", "fly", "glide", "flee", "gust": flying = true
		"land", "hide", "faint": flying = false
	if what == "peck": pecks += 1
	if what == "hop": hops += 1

func busy() -> bool: return _act != "" and _act_t < _act_len and _act_len < 1e8
func contacts() -> Array: return []

func reset() -> void:
	_act = ""; _act_t = 0.0; flying = false; fly_height = 0.0; fly_want = 0.0

func act() -> String: return _act if _act_t < _act_len else ""

# ---------- the frame ----------
static func _sm(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

static func _d(v: float, to: float, k: float, dt: float) -> float: return v + (to - v) * (1.0 - exp(-dt * k))

func animate(dt: float, speed: float) -> void:
	_t += dt
	_act_t += dt
	var a := _act if _act_t < _act_len else ""
	if a == "" and _act != "" and _act_len < 1e8: _act = ""
	var u := _act_t / maxf(_act_len, 1e-3)
	# targets for this frame
	var pitch := 0.0; var hp := 0.0; var hy := 0.0; var crouch := 0.0
	var want_spread := 0.0; var rate := 0.0; var amp := 0.0
	var hop := 0.0; var roll := 0.0
	fly_want = 0.0
	match a:
		"peck":
			pitch = 0.5 * sin(u * PI); hp = 0.9 * sin(u * PI)
		"look":
			hy = sin(u * TAU) * 0.8
		"ruffle":
			_squash = sin(u * PI * 6.0) * 0.08 * (1.0 - u)
			want_spread = 0.25 * sin(u * PI)
		"startle", "flinch":
			pitch = -0.35 * sin(u * PI); hp = -0.4 * sin(u * PI); want_spread = 0.5 * sin(u * PI)
		"hop":
			hop = 0.12 * sin(u * PI); want_spread = 0.3 * sin(u * PI)
		"takeoff":
			fly_want = 0.8 * u; rate = 6.0; amp = 1.0; pitch = -0.2
		"fly", "glide":
			fly_want = 0.9; rate = 5.0 if a == "fly" else 0.0; amp = 1.0 if a == "fly" else 0.0; want_spread = 1.0 if a == "glide" else 0.0
		"land":
			fly_want = 0.8 * (1.0 - u); rate = 5.0; amp = 1.0 - u
		"hide":
			crouch = 1.0; hp = 0.3
		"gust":
			# up off the ground, big slow beats: the wind comes off the down strokes
			fly_want = 0.95 * _sm(0.0, 0.25, u) * (1.0 - _sm(0.88, 1.0, u)); rate = 3.2; amp = 1.0; pitch = -0.35; hp = -0.15
		"tackle":
			# a crouch, then the lunge (battle.gd carries it forward), wings swept back
			crouch = 0.6 * (1.0 - _sm(0.25, 0.35, u)); pitch = 0.55 * _sm(0.25, 0.4, u) * (1.0 - _sm(0.8, 1.0, u))
			want_spread = 0.45 * _sm(0.25, 0.4, u); hp = -0.3 * _sm(0.25, 0.4, u)
			fly_want = 0.25 * sin(clampf((u - 0.3) / 0.6, 0.0, 1.0) * PI)
		"quick_attack":
			pitch = 0.7 * _sm(0.0, 0.15, u) * (1.0 - _sm(0.8, 1.0, u)); want_spread = 0.2; hp = -0.4
			fly_want = 0.18 * sin(clampf(u / 0.85, 0.0, 1.0) * PI)
		"sand_attack":
			# turned half away, wings low and beating, kicking the sand up behind
			pitch = 0.45 * sin(u * PI); hp = -0.2; rate = 7.0; amp = 0.55 * sin(u * PI); roll = 0.25 * sin(u * TAU * 3.0)
		"hurt":
			pitch = -0.5 * sin(u * PI); hp = -0.6 * sin(u * PI); want_spread = 0.7 * sin(u * PI); roll = 0.3 * sin(u * PI * 3.0) * (1.0 - u)
		"faint":
			roll = 1.4 * _sm(0.2, 0.7, u); crouch = 0.5; hp = 0.6 * u
		"flee":
			fly_want = 1.6 * u; rate = 8.0; amp = 1.0; pitch = 0.25
		"taunt":
			pitch = -0.25; hp = -0.35 + 0.15 * sin(u * TAU * 2.0); want_spread = 0.9 * sin(u * PI); _squash = -0.06 * sin(u * PI)
		"wings_spread":
			want_spread = 1.0 * _sm(0.0, 0.2, u) * (1.0 - _sm(0.85, 1.0, u)); pitch = -0.2; hp = -0.25
	if flying and a in ["", "fly"]:
		fly_want = maxf(fly_want, 0.9); rate = maxf(rate, 5.0); amp = maxf(amp, 1.0)
	if a == "" and not flying:
		# idle: a breath, now and then a look round or a peck
		_next_idle -= dt
		if _next_idle <= 0.0 and speed < 0.1:
			_next_idle = rng.randf_range(1.8, 4.0)
			mood(["look", "peck", "ruffle", "look"][rng.randi() % 4])
	# walking: little quick steps and a nodding head
	if speed > 0.05 and fly_height < 0.05:
		var was := _walk_ph
		_walk_ph = fmod(_walk_ph + dt * (3.0 + speed * 4.0), 1.0)
		if fmod(_walk_ph * 2.0, 1.0) < fmod(was * 2.0, 1.0): footfalls += 1
		hop = maxf(hop, absf(sin(_walk_ph * TAU)) * 0.02)
		hp += sin(_walk_ph * TAU * 2.0) * 0.12
	# the look-at target turns the head
	if not is_nan(look_at_pos.x) and a in ["", "look", "hide"]:
		var l := global_transform.affine_inverse() * look_at_pos
		hy = clampf(atan2(l.x, l.z), -1.2, 1.2)
	_pitch = _d(_pitch, pitch, 14.0, dt)
	_head_p = _d(_head_p, hp, 16.0, dt)
	_head_y = _d(_head_y, hy, 10.0, dt)
	_crouch = _d(_crouch, crouch, 10.0, dt)
	_roll = _d(_roll, roll, 12.0, dt)
	_hop_y = hop
	spread = _d(spread, want_spread, 12.0, dt)
	flap_rate = _d(flap_rate, rate, 6.0, dt)
	flap_amp = _d(flap_amp, amp, 8.0, dt)
	fly_height = _d(fly_height, fly_want, 4.0, dt)
	if fly_height < 0.02 and fly_want == 0.0: flying = flying and a in ["takeoff", "fly", "glide", "flee", "gust"]
	wing_phase = fmod(wing_phase + dt * flap_rate, 1.0)
	_squash = _d(_squash, 0.0, 6.0, dt)
	_pose()

func _pose() -> void:
	var breathe := sin(_t * 3.2) * 0.008
	body.position = Vector3(0, (0.2 - 0.08 * _crouch + fly_height / SIZE + _hop_y + breathe), 0)
	body.rotation = Vector3(_pitch, 0, _roll)
	body.scale = Vector3(1.0 + _squash, 1.0 - _squash, 1.0 + _squash)
	head.rotation = Vector3(_head_p - _pitch * 0.6, _head_y, 0)
	head.position = Vector3(0, 0.13 - 0.05 * _crouch, 0.1 + 0.02 * _crouch)
	# the wings: folded along the sides (tipped down and back), spread out flat, or
	# beating (up past level, down well below), the down stroke quicker
	var ph := wing_phase * TAU
	var beat := cos(ph)   # 1 at the top (phase 0), -1 at the bottom
	var flap := (beat * 0.95 + 0.15) * flap_amp
	var open := maxf(spread, flap_amp)
	for w in [[wing_l, 1.0], [wing_r, -1.0]]:
		var n: Node3D = w[0]
		var s: float = w[1]
		var fold_y := lerpf(1.25, 0.0, open)       # swept back along the body when folded
		var fold_z := lerpf(-1.25, 0.0, open)      # tipped down along the side
		n.rotation = Vector3(0.12 * open, -s * fold_y, s * (fold_z + flap))
	tail.rotation = Vector3(-0.15 + 0.3 * _crouch - _pitch * 0.4 + sin(_t * 2.0) * 0.03, 0, 0)
	tail.scale = Vector3(1.0 + 0.3 * spread, 1, 1)
	var tuck := clampf(fly_height / 0.3, 0.0, 1.0)
	for lg in legs:
		lg.visible = tuck < 0.9
		lg.position.y = 0.1 + fly_height / SIZE + _hop_y - 0.05 * _crouch
		lg.rotation.x = 1.1 * tuck
