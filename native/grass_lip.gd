extends Node3D
# The grass lips (web grasslip.js): where turf rolls over an edge (a stream's
# cut bank, a retaining wall's or a cliff's top, a Route 1 ledge) fluffy
# rounded clusters of the field's own grass crowd the brim, fan out and droop
# over it, longer tufts hang down the face. The clusters are the grass
# field's clump (grass.gd make_blades / _clump: the same blades) drawn with
# shaders/grass_lip.gdshader (the field's colours, light and wind, bent over
# the edge). No ink: they are not in the town, so neither the hull nor the
# leaf ink sees them.
#
# Each region's lips.bin (tools/native/regions.mjs) holds float32 x 8 per
# cluster: x y z (root), ox oz (out over the edge), droop, scale, stretch. They
# are put in cells of CELL metres, one MultiMesh per cell drawn with the full,
# lighter or lightest clump by the camera's distance to the cell (RANGES),
# hidden past the last.

const SHADER := preload("res://shaders/grass_lip.gdshader")
const Grass := preload("res://grass.gd")
const CELL := 24.0
const RANGES := [14.0, 30.0, 60.0]
const MOVE := 0.5
const STRIDE := 8

var cells: Array = []   # {node, mm: [MultiMesh x3], box: AABB, lod}
var mat: ShaderMaterial
var _last := Vector3(INF, 0.0, INF)

func build(sun_dir: Vector3) -> void:
	var rng := [12345]
	var blades := Grass.make_blades(rng)
	# (the field's clump; up close without the hair-thin wisps and foot curls,
	# which hang lost over an edge, and in 4 segments: lips stand in long rows)
	var meshes := [Grass._clump(blades, 4, 1), Grass._clump(blades, 2, 0), Grass._clump(blades, 1, 0)]
	mat = ShaderMaterial.new()
	mat.shader = SHADER
	var ink_n = (Engine.get_main_loop() as SceneTree).root.get_node_or_null("Ink")
	if ink_n: ink_n.track(mat, 0.8)   # (the blades' sides: shaders/grass_ink.gdshaderinc)
	mat.set_shader_parameter("sun_dir", sun_dir)
	var by := {}
	for f in WorldRegions.files("lips.bin"):
		var d := FileAccess.get_file_as_bytes(f).to_float32_array()
		for i in range(0, d.size() - STRIDE + 1, STRIDE):
			var key := Vector2i(floori(d[i] / CELL), floori(d[i + 2] / CELL))
			if not by.has(key): by[key] = PackedFloat32Array()
			var b: PackedFloat32Array = by[key]
			b.append_array(d.slice(i, i + STRIDE))
			by[key] = b
	for key in by:
		var d: PackedFloat32Array = by[key]
		var n := d.size() / STRIDE
		var buf := PackedFloat32Array()
		buf.resize(n * 16)
		var lo := Vector3(INF, INF, INF); var hi := -lo
		for k in n:
			var o := k * STRIDE
			var p := Vector3(d[o], d[o + 1], d[o + 2])
			var ox: float = d[o + 3]; var oz: float = d[o + 4]
			var l := sqrt(ox * ox + oz * oz)
			if l < 1e-5: ox = 1.0; oz = 0.0; l = 1.0
			ox /= l; oz /= l
			var sc: float = d[o + 6]
			# local +x = out over the edge, +z = along it, y up; uniform scale
			var bx := Vector3(ox, 0, oz) * sc
			var by2 := Vector3(0, 1, 0) * sc
			var bz := Vector3(-oz, 0, ox) * sc
			var q := k * 16
			buf[q] = bx.x; buf[q + 1] = by2.x; buf[q + 2] = bz.x; buf[q + 3] = p.x
			buf[q + 4] = bx.y; buf[q + 5] = by2.y; buf[q + 6] = bz.y; buf[q + 7] = p.y
			buf[q + 8] = bx.z; buf[q + 9] = by2.z; buf[q + 10] = bz.z; buf[q + 11] = p.z
			buf[q + 12] = d[o + 5]; buf[q + 13] = d[o + 7]; buf[q + 14] = fposmod(sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453, 1.0); buf[q + 15] = 0.0
			lo = lo.min(p); hi = hi.max(p)
		var mms := []
		for m in meshes:
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_custom_data = true
			mm.mesh = m
			mm.instance_count = n
			mm.buffer = buf
			mms.append(mm)
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mms[0]
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var box := AABB(lo - Vector3(1.6, 2.4, 1.6), hi - lo + Vector3(3.2, 3.6, 3.2))
		mi.custom_aabb = box
		mi.visible = false
		add_child(mi)
		cells.append({"node": mi, "mm": mms, "box": box, "lod": 0})

func update(cam_pos: Vector3) -> void:
	if Vector2(cam_pos.x - _last.x, cam_pos.z - _last.z).length_squared() < MOVE * MOVE and absf(cam_pos.y - _last.y) < MOVE: return
	_last = cam_pos
	for c in cells:
		var b: AABB = c.box
		var q := cam_pos.clamp(b.position, b.end)
		var d := q.distance_to(cam_pos)
		var mi: MultiMeshInstance3D = c.node
		var show := d < RANGES[2]
		if mi.visible != show: mi.visible = show
		if not show: continue
		var li := 2 if d > RANGES[1] else (1 if d > RANGES[0] else 0)
		if c.lod != li or mi.multimesh != c.mm[li]:
			c.lod = li
			mi.multimesh = c.mm[li]
