extends Node3D
# The grass field (web assets.js grassField): clumps of layered tufts on a
# square of side SIZE that repeats around the player. The square is cut into
# tiles; each frame every tile moves to its copy nearest the player, tiles out
# of view are culled by Godot (custom AABB), tiles past the round edge are
# hidden, and farther tiles use lighter clumps.

const SHADER := preload("res://shaders/grass.gdshader")

var size := 64.0
var tiles: Array = []
var mat: ShaderMaterial
var world  # WorldData, for heights under each tile
var t_size := 8.0

func build(w, count: int, field_size: float, sun_dir: Vector3) -> void:
	world = w
	size = field_size
	var rng := [12345]
	var r := func() -> float:
		rng[0] = (rng[0] * 1664525 + 1013904223) & 0xFFFFFFFF
		return rng[0] / 4294967296.0
	# the clump: blade records first (same random order as the web build)
	var blades: Array = []
	var blade_at := func(rx: float, rz: float, ang: float, lean: float, ln: float, wid: float, notch: bool, layer: float, curl: float, role: int) -> void:
		blades.append([rx, rz, ang, lean, ln, wid, notch, layer, curl, role, (r.call() - 0.5) * 0.6])
	var tuft := func(cx: float, cz: float, sc: float) -> void:
		var R := func(k: float) -> float: return (r.call() - 0.5) * k
		for k in 6: blade_at.call(cx + R.call(0.08) * sc, cz + R.call(0.08) * sc, r.call() * 6.28, 0.12, (0.32 + r.call() * 0.15) * sc, 0.07 * sc, false, 0.55, 0.0, 1)
		for k in 7: blade_at.call(cx + R.call(0.12) * sc, cz + R.call(0.12) * sc, r.call() * 6.28, 0.22 + r.call() * 0.2, (0.65 + r.call() * 0.3) * sc, 0.09 * sc, r.call() < 0.3, 0.8, 0.0, 0)
		for k in 8: blade_at.call(cx + R.call(0.14) * sc, cz + R.call(0.14) * sc, (k / 8.0) * 6.28 + R.call(0.6), 0.45 + r.call() * 0.35, (0.85 + r.call() * 0.4) * sc, 0.1 * sc, r.call() < 0.4, 1.0, 0.0, 0)
		for k in 4: blade_at.call(cx + R.call(0.1) * sc, cz + R.call(0.1) * sc, r.call() * 6.28, 0.5 + r.call() * 0.6, (0.8 + r.call() * 0.4) * sc, 0.014 * sc, false, 0.9, 0.0, 2)
		for k in 2: blade_at.call(cx + R.call(0.2) * sc, cz + R.call(0.2) * sc, r.call() * 6.28, 1.6, 0.28 * sc, 0.045 * sc, false, 0.85, 1.0, 3)
	tuft.call(0.0, 0.0, 1.0)
	for k in 3:
		var a: float = k * 2.1 + r.call()
		var d: float = 0.3 + r.call() * 0.15
		tuft.call(cos(a) * d, sin(a) * d, 0.55 + r.call() * 0.3)
	var near := _clump(blades, 5, 3)
	var mid := _clump(blades, 4, 1)
	var far := _clump(blades, 3, 0)
	var n := int(round(count / 14.0))
	var offs := PackedFloat32Array()
	offs.resize(n * 4)
	for i in n:
		offs[i * 4] = r.call() * size; offs[i * 4 + 1] = r.call() * size; offs[i * 4 + 2] = r.call(); offs[i * 4 + 3] = r.call()
	mat = ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("height_map", world.grass_tex)
	mat.set_shader_parameter("area", world.grass_area)
	mat.set_shader_parameter("field_size", size)
	mat.set_shader_parameter("sun_dir", sun_dir)
	var g := maxi(4, roundi(size / 7.0))
	t_size = size / g
	var bins: Array = []
	bins.resize(g * g)
	for k in g * g: bins[k] = PackedInt32Array()
	for i in n:
		var bi := mini(g - 1, int(offs[i * 4] / t_size)) * g + mini(g - 1, int(offs[i * 4 + 1] / t_size))
		bins[bi].append(i)
	for gi in g:
		for gj in g:
			var ids: PackedInt32Array = bins[gi * g + gj]
			if ids.is_empty(): continue
			var t := {"cx": (gi + 0.5) * t_size, "cz": (gj + 0.5) * t_size, "kx": 99999, "kz": 99999, "mm": []}
			for mesh in [near, mid, far]:
				var mm := MultiMesh.new()
				mm.transform_format = MultiMesh.TRANSFORM_3D
				mm.use_custom_data = true
				mm.mesh = mesh
				mm.instance_count = ids.size()
				for k in ids.size():
					var id := ids[k]
					mm.set_instance_transform(k, Transform3D.IDENTITY)
					mm.set_instance_custom_data(k, Color(offs[id * 4], offs[id * 4 + 1], offs[id * 4 + 2], offs[id * 4 + 3]))
				t.mm.append(mm)
			var mi := MultiMeshInstance3D.new()
			mi.multimesh = t.mm[0]
			mi.material_override = mat
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mi)
			t.node = mi
			tiles.append(t)

# one clump mesh: segs per blade; roles kept: 3 = all, 1 = no wisps or curls, 0 = main blades
func _clump(blades: Array, segs: int, max_role: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var base := 0
	for b in blades:
		if b[9] > max_role: continue
		var rx: float = b[0]; var rz: float = b[1]; var ang: float = b[2]; var lean: float = b[3]
		var ln: float = b[4]; var wid: float = b[5]; var notch: bool = b[6]; var layer: float = b[7]
		var curl: float = b[8]; var twist: float = b[10]
		var dx := cos(ang); var dz := sin(ang); var sx := -dz; var sz := dx
		for i in segs + 1:
			var t := i / float(segs)
			var w := wid * minf(1.0, t * 5.0 + 0.35) * pow(1.0 - t, 0.85)
			var out := lean * t * t * ln * 0.8 + curl * t * 0.2
			var y := ln * t * (1.0 - lean * 0.25 * t) * (1.0 - curl * t * 0.6)
			var cx := rx + dx * out; var cz := rz + dz * out
			var tw := twist * t
			var ux := sx * cos(tw) - dx * sin(tw); var uz := sz * cos(tw) - dz * sin(tw)
			var wl := w * (2.4 if notch and absf(t - 0.4) < 0.11 else 1.0)
			st.set_uv(Vector2(ang, t)); st.set_uv2(Vector2(layer, 0)); st.add_vertex(Vector3(cx - ux * wl, y, cz - uz * wl))
			st.set_uv(Vector2(ang, t)); st.set_uv2(Vector2(layer, 0)); st.add_vertex(Vector3(cx + ux * w, y, cz + uz * w))
			if i < segs:
				var q := base + i * 2
				st.add_index(q); st.add_index(q + 1); st.add_index(q + 2)
				st.add_index(q + 1); st.add_index(q + 3); st.add_index(q + 2)
		base += (segs + 1) * 2
	return st.commit()

func update(cam_pos: Vector3) -> void:
	mat.set_shader_parameter("cam", cam_pos)
	var mid_d := size * 0.15
	var far_d := size * 0.3
	var edge := size * 0.5
	for t in tiles:
		var kx := floori((cam_pos.x - t.cx) / size + 0.5)
		var kz := floori((cam_pos.z - t.cz) / size + 0.5)
		var x: float = t.cx + kx * size
		var z: float = t.cz + kz * size
		if kx != t.kx or kz != t.kz:
			t.kx = kx; t.kz = kz
			t.node.position = Vector3(kx * size, 0.0, kz * size)
			var lo := INF; var hi := -INF
			for o in [Vector2(0, 0), Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
				var h: float = world.height_at(x + o.x * t_size * 0.5, z + o.y * t_size * 0.5)
				lo = minf(lo, h); hi = maxf(hi, h)
			t.node.custom_aabb = AABB(Vector3(t.cx - t_size * 0.5 - 1.5, lo - 0.5, t.cz - t_size * 0.5 - 1.5), Vector3(t_size + 3.0, hi - lo + 2.5, t_size + 3.0))
		var dx := maxf(0.0, absf(cam_pos.x - x) - t_size * 0.5)
		var dz := maxf(0.0, absf(cam_pos.z - z) - t_size * 0.5)
		var d := sqrt(dx * dx + dz * dz)
		t.node.visible = d < edge
		var mm: MultiMesh = t.mm[2] if d > far_d else (t.mm[1] if d > mid_d else t.mm[0])
		if t.node.multimesh != mm: t.node.multimesh = mm
