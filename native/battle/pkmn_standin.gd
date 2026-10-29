class_name PkmnStandin
extends Node3D
# A simple stand-in for a Pokémon with no baked model yet (Pikachu, Sandshrew,
# Diglett, the starters...): a round body and head, eyes, and the one or two
# shapes that say which it is (Pikachu's ears, cheeks and tail; Sandshrew's
# shell), with the same calls as a Creature so the battle stage treats both
# alike:
#   var n := PkmnStandin.make("pikachu")
#   n.animate(dt, speed)    a breathing bob, hops, the acts below
#   n.mood(name)            hurt, flinch, faint (stays down till reset or idle), tackle,
#                           quick_attack, taunt, wings_spread, startle, thunder (a crouch and a
#                           spark-up), any other: a little hop
#   n.reset()
# Facing +Z, standing on y = 0 (its node), about 0.6 m tall (SIZE).

const SIZE := 0.62
const COLS := {"pikachu": Color("f6d03b"), "sandshrew": Color("d9b45e"), "diglett": Color("8b5a3c"),
	"charmander": Color("f08a3a"), "squirtle": Color("6db8e6"), "bulbasaur": Color("6cc08b")}

var species := ""
var meshes: Array[MeshInstance3D] = []
var look_at_pos := Vector3(NAN, NAN, NAN)
var body: Node3D
var _act := ""
var _t := 0.0
var _at := 9.0
var _down := false

static func make(sp: String) -> PkmnStandin:
	var n := PkmnStandin.new()
	n.species = sp
	n._build()
	return n

func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.8
	return m

func _part(mesh: Mesh, c: Color, p: Vector3, rz := 0.0, rx := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = _mat(c)
	mi.position = p
	mi.rotation = Vector3(rx, 0, rz)
	body.add_child(mi)
	meshes.append(mi)
	return mi

func _build() -> void:
	body = Node3D.new()
	add_child(body)
	body.scale = Vector3.ONE * (SIZE / 1.2)
	var c: Color = COLS.get(species, Color(0.7, 0.7, 0.7))
	var bm := SphereMesh.new(); bm.radius = 0.32; bm.height = 0.7
	_part(bm, c, Vector3(0, 0.36, 0))
	var hm := SphereMesh.new(); hm.radius = 0.27; hm.height = 0.52
	_part(hm, c, Vector3(0, 0.82, 0.05))
	for sx in [-1.0, 1.0]:
		var em := SphereMesh.new(); em.radius = 0.045; em.height = 0.09
		_part(em, Color.BLACK, Vector3(0.11 * sx, 0.88, 0.27))
		if species == "pikachu":
			var cm := CylinderMesh.new(); cm.top_radius = 0.0; cm.bottom_radius = 0.07; cm.height = 0.42
			_part(cm, c, Vector3(0.16 * sx, 1.18, 0.0), -0.35 * sx)
			var tm := CylinderMesh.new(); tm.top_radius = 0.0; tm.bottom_radius = 0.045; tm.height = 0.14
			_part(tm, Color(0.12, 0.1, 0.08), Vector3(0.22 * sx, 1.35, 0.0), -0.35 * sx)
			var chm := SphereMesh.new(); chm.radius = 0.06; chm.height = 0.12
			_part(chm, Color("e8483a"), Vector3(0.19 * sx, 0.78, 0.2))
	if species == "pikachu":
		var tb := BoxMesh.new(); tb.size = Vector3(0.08, 0.5, 0.2)
		_part(tb, c, Vector3(0, 0.6, -0.38), 0.0, -0.6)
	if species == "sandshrew":
		var sm := SphereMesh.new(); sm.radius = 0.34; sm.height = 0.55
		_part(sm, Color("b88a3e"), Vector3(0, 0.45, -0.1))

func reset() -> void:
	_act = ""; _at = 9.0; _down = false

func busy() -> bool: return _at < 0.8

func mood(m: String) -> void:
	if m == "idle": reset(); return
	_act = m
	_at = 0.0
	if m == "faint": _down = true

func animate(dt: float, _speed: float) -> void:
	_t += dt
	_at += dt
	var y := absf(sin(_t * 4.0)) * 0.03
	var lean := 0.0
	var roll := 0.0
	var sq := 1.0
	match _act:
		"hurt", "flinch":
			var k := maxf(0.0, 1.0 - _at / 0.45)
			body.position.x = sin(_at * 60.0) * 0.04 * k
			lean = -0.35 * k
		"tackle", "quick_attack", "thunder":
			var k := sin(clampf(_at / 0.5, 0.0, 1.0) * PI)
			lean = 0.4 * k
			sq = 1.0 - 0.15 * k
			if _act == "thunder": y += 0.15 * k
		"taunt", "wings_spread", "startle":
			y += absf(sin(clampf(_at / 0.6, 0.0, 1.0) * PI * 2.0)) * 0.18
		"faint":
			pass
		_:
			y += sin(clampf(_at / 0.4, 0.0, 1.0) * PI) * 0.15
	if _down:
		roll = lerpf(body.rotation.z, 1.45, 1.0 - exp(-dt * 6.0))
		y = 0.0
	body.position.y = y
	body.rotation = Vector3(lean, 0, roll)
	body.scale = Vector3(1.0 / sqrt(sq), sq, 1.0 / sqrt(sq)) * (SIZE / 1.2)
