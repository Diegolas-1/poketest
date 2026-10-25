extends Node3D
# Route 1's moving life, which the baked town (town.glb, static) can't hold.
# Data: cast.json "route1" (tools/native/bake_cast.mjs, from web/world/route1.js):
#  - the windmill's sails turn and the meadow's rope swing sways (the town's
#    meshes named r1_sails* / r1_swing*, turned about their pivot)
#  - butterflies over the flower meadow, PIDGEY flocks circling over the
#    route, steam off the tea house kettle: one MultiMesh each, unshaded
#    cel-flat cards flapped in the vertex shader (one draw per kind, hidden
#    when Ash is far away)
# main.gd: add_child(route1); route1.setup(self, town_root); update(dt) each frame.

var game: Node3D
var data: Dictionary = {}
var t := 0.0
var spinners: Array = []   # {mi, base: Transform3D, p: Vector3, axis: Vector3, kind}
var flies: MultiMeshInstance3D
var birds: MultiMeshInstance3D
var steam: MultiMeshInstance3D
var fly_seed: Array = []
var bird_seed: Array = []

const FLAP := """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque;
uniform float rate = 14.0;
uniform float amp = 1.0;
varying vec4 vcol;
void vertex() {
	vcol = COLOR;
	float side = sign(VERTEX.x);
	float a = sin(TIME * rate + INSTANCE_CUSTOM.x * 40.0) * amp;
	float r = abs(VERTEX.x);
	VERTEX.y += sin(a) * r * side * side;
	VERTEX.x = side * cos(a) * r;
}
void fragment() {
	ALBEDO = vcol.rgb;
}
"""
const STEAM := """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;
void vertex() {
	float k = fract(TIME * 0.28 + INSTANCE_CUSTOM.x);
	vec3 c = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz + vec3(sin(k * 6.0 + INSTANCE_CUSTOM.x * 9.0) * 0.12, k * 1.3, 0.0);
	float s = 0.18 + k * 0.42;
	vec3 right = INV_VIEW_MATRIX[0].xyz, up = INV_VIEW_MATRIX[1].xyz;
	vec3 w = c + right * VERTEX.x * s + up * VERTEX.y * s;
	COLOR.a = (1.0 - k) * smoothstep(0.0, 0.15, k) * 0.55;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(w, 1.0);
}
void fragment() {
	float d = length(UV - 0.5) * 2.0;
	ALBEDO = vec3(1.0);
	ALPHA = COLOR.a * smoothstep(1.0, 0.55, d);
}
"""

func setup(g: Node3D, town_root: Node) -> void:
	game = g
	var d = CastActor.data().get("route1")
	if d == null: return
	data = d
	var an: Dictionary = data.get("anim", {})
	for mi in town_root.find_children("r1_*", "MeshInstance3D", true, false):
		var nm := String(mi.name)
		var kind := "sails" if nm.begins_with("r1_sails") else "swing" if nm.begins_with("r1_swing") else ""
		if kind == "" or not an.has(kind): continue
		var a: Dictionary = an[kind]
		spinners.append({"mi": mi, "base": mi.global_transform, "p": _v(a.p), "axis": _v(a.axis).normalized(), "kind": kind, "speed": float(a.get("speed", 0.35))})
	var amb: Dictionary = data.get("amb", {})
	if amb.has("meadow"): flies = _flies(amb.meadow)
	if amb.has("birds"): birds = _birds(amb.birds)
	if amb.has("steam"): steam = _steam(_v(amb.steam))

static func _v(a) -> Vector3: return Vector3(float(a[0]), float(a[1]), float(a[2]))

func _mat(code: String, params := {}) -> ShaderMaterial:
	var sh := Shader.new(); sh.code = code
	var m := ShaderMaterial.new(); m.shader = sh
	for k in params: m.set_shader_parameter(k, params[k])
	return m

# two wings (quads either side of x = 0), coloured by the instance
func _wings(span: float, chord: float, sweep: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for s in [-1.0, 1.0]:
		var a := Vector3(0.0, 0.0, -chord * 0.5); var b := Vector3(0.0, 0.0, chord * 0.5)
		var c := Vector3(s * span, 0.0, chord * 0.5 + sweep); var e := Vector3(s * span, 0.0, -chord * 0.5 + sweep * 0.4)
		for v in [a, b, c, a, c, e]:
			st.set_color(Color.WHITE)
			st.add_vertex(v)
	return st.commit()

func _mm(mesh: Mesh, n: int, mat: Material) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = n
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi

func _flies(m: Dictionary) -> MultiMeshInstance3D:
	var n := 26
	var mi := _mm(_wings(0.14, 0.12, -0.04), n, _mat(FLAP, {"rate": 16.0, "amp": 1.1}))
	var cols := [Color("f2c94a"), Color("f6f2e8"), Color("e86a8a"), Color("8fb8f2"), Color("f28a3a")]
	var r := RandomNumberGenerator.new(); r.seed = 77
	for i in n:
		fly_seed.append([r.randf() * TAU, r.randf_range(0.3, 1.0) * float(m.r), r.randf_range(0.15, 0.4), r.randf() * 100.0])
		mi.multimesh.set_instance_color(i, cols[i % cols.size()])
		mi.multimesh.set_instance_custom_data(i, Color(r.randf(), 0, 0, 0))
	mi.set_meta("c", Vector2(float(m.x), float(m.z)))
	mi.custom_aabb = AABB(Vector3(float(m.x) - float(m.r), -50, float(m.z) - float(m.r)), Vector3(float(m.r) * 2.0, 200, float(m.r) * 2.0))
	return mi

func _birds(list: Array) -> MultiMeshInstance3D:
	var per := 6
	var mi := _mm(_wings(0.55, 0.3, 0.18), per * list.size(), _mat(FLAP, {"rate": 7.0, "amp": 0.55}))
	var r := RandomNumberGenerator.new(); r.seed = 16
	var k := 0
	for f in list:
		for i in per:
			bird_seed.append([float(f[0]), float(f[1]), float(f[2]) * r.randf_range(0.8, 1.15), r.randf() * TAU, r.randf_range(0.12, 0.2) * (1.0 if r.randf() < 0.75 else -1.0), r.randf_range(17.0, 26.0)])
			mi.multimesh.set_instance_color(k, Color("8a5a3a").lerp(Color("c9a272"), r.randf() * 0.5))
			mi.multimesh.set_instance_custom_data(k, Color(r.randf(), 0, 0, 0))
			k += 1
	mi.custom_aabb = AABB(Vector3(-120, -10, -470), Vector3(240, 120, 440))
	return mi

func _steam(p: Vector3) -> MultiMeshInstance3D:
	var q := QuadMesh.new(); q.size = Vector2(1, 1)
	var mi := _mm(q, 5, _mat(STEAM))
	for i in 5:
		mi.multimesh.set_instance_transform(i, Transform3D(Basis(), p))
		mi.multimesh.set_instance_color(i, Color.WHITE)
		mi.multimesh.set_instance_custom_data(i, Color(i / 5.0, 0, 0, 0))
	mi.custom_aabb = AABB(p - Vector3(2, 1, 2), Vector3(4, 4, 4))
	return mi

func update(dt: float) -> void:
	if data.is_empty(): return
	t += dt
	var me: Vector3 = game.pos
	for s in spinners:
		if me.distance_to(s.p) > 160.0: continue
		var ang: float = t * float(s.speed) if s.kind == "sails" else sin(t * 1.3) * 0.12
		var rot := Transform3D(Basis(s.axis, ang), Vector3.ZERO)
		s.mi.global_transform = Transform3D(Basis(), s.p) * rot * Transform3D(Basis(), -s.p) * s.base
	var W = game.world
	if flies:
		var c: Vector2 = flies.get_meta("c")
		var near := Vector2(me.x, me.z).distance_to(c) < 130.0
		flies.visible = near
		if near:
			for i in fly_seed.size():
				var f: Array = fly_seed[i]
				var a: float = f[0] + t * f[2] + sin(t * 0.7 + f[3]) * 0.6
				var rr: float = f[1] * (0.85 + 0.15 * sin(t * 0.31 + f[3]))
				var x := c.x + cos(a) * rr + sin(t * 1.7 + f[3]) * 1.2
				var z := c.y + sin(a) * rr + cos(t * 1.3 + f[3]) * 1.2
				var y: float = W.height_at(x, z) + 0.7 + 0.5 * sin(t * 2.3 + f[3]) + 0.3 * sin(t * 5.1 + f[3])
				var yaw := a + PI * 0.5 + sin(t * 3.0 + f[3]) * 0.5
				flies.multimesh.set_instance_transform(i, Transform3D(Basis(Vector3.UP, yaw), Vector3(x, y, z)))
	if birds:
		var on := me.z < -40.0
		birds.visible = on
		if on:
			for i in bird_seed.size():
				var b: Array = bird_seed[i]
				var a: float = b[3] + t * b[4]
				var x: float = b[0] + cos(a) * b[2]
				var z: float = b[1] + sin(a) * b[2]
				var y: float = W.height_at(x, z) + b[5] + sin(t * 0.5 + b[3]) * 1.5
				var yaw: float = a + (PI * 0.5 if b[4] > 0.0 else -PI * 0.5)
				var bank := Basis(Vector3.UP, yaw) * Basis(Vector3.FORWARD, -0.25 * signf(b[4]))
				birds.multimesh.set_instance_transform(i, Transform3D(bank, Vector3(x, y, z)))
	if steam:
		steam.visible = me.distance_to(steam.custom_aabb.get_center()) < 60.0
