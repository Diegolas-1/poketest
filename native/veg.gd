extends Node3D
# The plants (web veg.js, foliage.js, assets.js Scatter / Impostor): trees,
# bushes, hedges, ferns, flowers and rocks, baked once each by
# tools/native/bake.mjs (veg.json + veg.bin) with where every copy stands.
# Copies are drawn as MultiMesh chunks; each plant fades on its own as a
# screen-door dither by its distance from the camera (veg.gdshaderinc), and
# far trees and bushes turn into billboards baked from the model. Whole
# chunks past their range are culled by Godot (visibility range), and only
# chunks near the camera cast shadows.

const LEAF := preload("res://shaders/veg_leaf.gdshader")
const SOLID := preload("res://shaders/veg_solid.gdshader")
const BILL := preload("res://shaders/veg_bill.gdshader")
const DIR := "res://world/"
const CHUNK := 48.0        # model chunks (m)
const BILL_CHUNK := 64.0   # billboard chunks (m)
const FADE_W := 5.0        # a plant hands over to its billboard over this many metres

var meshes: Array = []     # ArrayMesh per baked mesh
var mats: Array = []       # [ShaderMaterial] per baked material (one per set, see _set_mat)
var chunks: Array = []     # {node, c: Vector3, r, shadow: float (0 = never)}
var shadow_far := 45.0     # trees cast shadows nearer than this (to the chunk's edge)
# Where each kind of plant hands over to its billboard (or fades out), at
# view distance 1.0, and how far it casts shadows (times shadow_far / 45).
# Closer than the web's ranges: leaf cards pile up many layers of cut-out
# pixels, which a phone's GPU cannot sort away, while a billboard is one
# layer; at these distances a bush is ~50 px and a tree ~200 px tall on a
# phone, the billboards' own size. (web veg.js: trees 75, bushes 70,
# ferns 60, flowers 55 x its view distance; the town's bushes never faded)
const KINDS := {
	"tree": {"fade": Vector2(62, 67), "shadow": 45.0},   # (billboarded kinds fade over FADE_W)
	"bush": {"fade": Vector2(40, 45), "shadow": 25.0},
	"fern": {"fade": Vector2(38, 42), "shadow": 0.0},
	"flower": {"fade": Vector2(32, 36), "shadow": 0.0},
	"rock": {"fade": Vector2(-1, -1), "shadow": 25.0},   # (-1: keep the baked range)
}
var stats := {"chunks": 0, "bill": 0, "copies": 0}

static func _rgb(hex: String) -> Color:
	return Color(hex)

func build(lod: float = 1.0, trees: float = 1.0, plants: float = 1.0) -> void:
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DIR + "veg.json"))
	var bin := FileAccess.get_file_as_bytes(DIR + "veg.bin")
	var f32 := func(r: Array) -> PackedByteArray: return bin.slice(int(r[0]), int(r[0]) + int(r[1]) * 4)
	for e in meta.meshes:
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = f32.call(e.pos).to_vector3_array()
		a[Mesh.ARRAY_NORMAL] = f32.call(e.nrm).to_vector3_array()
		if e.has("uv"): a[Mesh.ARRAY_TEX_UV] = f32.call(e.uv).to_vector2_array()
		if e.has("col"): a[Mesh.ARRAY_COLOR] = f32.call(e.col).to_color_array()
		if e.has("flt"): a[Mesh.ARRAY_TEX_UV2] = f32.call(e.flt).to_vector2_array()
		# three.js fronts are counter-clockwise, Godot's clockwise: flip every
		# triangle (else culling keeps the far side and stones look hollow)
		var idx: PackedInt32Array = f32.call(e.idx).to_int32_array() if e.has("idx") else PackedInt32Array(range(int(e.v)))
		for t in range(0, idx.size() - 2, 3):
			var k: int = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k
		a[Mesh.ARRAY_INDEX] = idx
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
		meshes.append(m)
	var texs := {}
	var tex := func(n) -> Texture2D:
		if n == null: return null
		if not texs.has(n): texs[n] = load(DIR + n)
		return texs[n]
	var bills := []
	var ink = get_node_or_null("/root/Ink")
	for si in meta.sets.size():
		var s: Dictionary = meta.sets[si]
		# trees thin out with the Trees setting, everything else with Plants
		var kind := _kind(s, meta)
		var dens := trees if kind == "tree" else plants
		var fade := Vector2(s.fade[0], s.fade[1]) * lod
		if KINDS[kind].fade.x > 0.0: fade = KINDS[kind].fade * lod
		if s.impostor != null: fade.y = fade.x + FADE_W   # the billboards' shader uses the same band
		var shadow_k: float = KINDS[kind].shadow / 45.0 if s.shadows else 0.0
		var xf := bin.slice(int(s.xf[0]), int(s.xf[0]) + int(s.xf[1]) * 4).to_float32_array()
		var ip := bin.slice(int(s.ip[0]), int(s.ip[0]) + int(s.ip[1]) * 4).to_float32_array()
		var n := int(s.n)
		# chunks of copies (a fixed hash keeps the same plants at any density)
		var bins := {}
		var bbins := {}
		for i in n:
			if dens < 1.0 and _hash(si * 7919 + i) >= dens: continue
			var p := Vector3(ip[i * 5], ip[i * 5 + 1], ip[i * 5 + 2])
			var k := Vector2i(floori(p.x / CHUNK), floori(p.z / CHUNK))
			if not bins.has(k): bins[k] = []
			bins[k].append(i)
			var kb := Vector2i(floori(p.x / BILL_CHUNK), floori(p.z / BILL_CHUNK))
			if not bbins.has(kb): bbins[kb] = []
			bbins[kb].append(i)
		var part_mats := []
		for pp in s.parts: part_mats.append(_set_mat(meta.mats[int(pp.mat)], fade, float(s.shrink), tex))
		var rad := float(s.radius)
		for k in bins:
			var ids: Array = bins[k]
			var c := Vector3.ZERO
			for i in ids: c += Vector3(ip[i * 5], ip[i * 5 + 1], ip[i * 5 + 2])
			c /= ids.size()
			var r := 0.0
			for i in ids: r = maxf(r, Vector2(ip[i * 5] - c.x, ip[i * 5 + 2] - c.z).length() + rad * ip[i * 5 + 4])
			var holder := Node3D.new()
			holder.position = c
			add_child(holder)
			for pi in s.parts.size():
				var mm := MultiMesh.new()
				mm.transform_format = MultiMesh.TRANSFORM_3D
				mm.mesh = meshes[int(s.parts[pi].mesh)]
				mm.instance_count = ids.size()
				for j in ids.size():
					var o: int = ids[j] * 12
					mm.set_instance_transform(j, Transform3D(Basis(Vector3(xf[o], xf[o + 4], xf[o + 8]), Vector3(xf[o + 1], xf[o + 5], xf[o + 9]), Vector3(xf[o + 2], xf[o + 6], xf[o + 10])),
						Vector3(xf[o + 3], xf[o + 7], xf[o + 11]) - c))
				var mi := MultiMeshInstance3D.new()
				mi.multimesh = mm
				mi.material_override = part_mats[pi]
				mi.visibility_range_end = fade.y + r + 2.0
				mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				mi.extra_cull_margin = 1.0
				holder.add_child(mi)
				chunks.append({"node": mi, "c": c, "r": r, "shadow": shadow_k})
				# leaf ink (ink.gd): one silhouette per tree or bush, swaying
				# with it and gone with its model
				if (kind == "tree" or kind == "bush") and part_mats[pi].shader == LEAF and ink:
					var im: ShaderMaterial = ink.outline_plant(mi, mm.mesh.get_aabb().get_center(), {"double_sided": true})
					if im:
						im.set_shader_parameter("leaf_wind", part_mats[pi].get_shader_parameter("wind"))
						im.set_shader_parameter("leaf_fade", fade)
				stats.chunks += 1
			stats.copies += ids.size()
		if s.impostor != null:
			var imp: Dictionary = meta.impostors[int(s.impostor)]
			for k in bbins:
				for i in bbins[k]:
					bills.append([Vector3(ip[i * 5], ip[i * 5 + 1], ip[i * 5 + 2]), ip[i * 5 + 3], ip[i * 5 + 4], int(s.impostor), fade.x,
						float(imp.w) * 0.5, float(imp.bottom), float(imp.h), float(s.far[1])])
	_billboards(meta, bills, tex.call("veg_bill.png"))

# every far plant as a billboard: one MultiMesh per chunk for all kinds
func _billboards(meta: Dictionary, bills: Array, atlas: Texture2D) -> void:
	if bills.is_empty(): return
	var AW := float(meta.billSize[0]); var AH := float(meta.billSize[1])
	var rects := PackedVector4Array(); var geos := PackedVector4Array()
	for imp in meta.impostors:
		var r: Array = imp.rect
		rects.append(Vector4(r[0] / AW, r[1] / AH, r[2] / AW, r[3] / AH))
		geos.append(Vector4(imp.w, imp.h, imp.bottom, imp.sunAz))
	var bm := ShaderMaterial.new()
	bm.shader = BILL
	bm.set_shader_parameter("map", atlas)
	bm.set_shader_parameter("imp_rect", rects)
	bm.set_shader_parameter("imp_geo", geos)
	bm.set_shader_parameter("fade_w", FADE_W)
	var bins := {}
	for b in bills:
		var k := Vector2i(floori(b[0].x / BILL_CHUNK), floori(b[0].z / BILL_CHUNK))
		if not bins.has(k): bins[k] = []
		bins[k].append(b)
	var quad := _quad()
	for k in bins:
		var list: Array = bins[k]
		var c := Vector3.ZERO
		for b in list: c += b[0]
		c /= list.size()
		var lo := Vector3(INF, INF, INF); var hi := -lo
		var r := 0.0; var near := INF; var far := 0.0
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = true
		mm.mesh = quad
		mm.instance_count = list.size()
		for j in list.size():
			var b: Array = list[j]
			var p: Vector3 = b[0] - c
			var sc: float = b[2]
			mm.set_instance_transform(j, Transform3D(Basis(), p))
			mm.set_instance_custom_data(j, Color(b[1], sc, b[3], b[4]))
			var hw: float = b[5] * sc
			lo = lo.min(p + Vector3(-hw, b[6] * sc, -hw))
			hi = hi.max(p + Vector3(hw, (b[6] + b[7]) * sc, hw))
			r = maxf(r, Vector2(p.x, p.z).length() + hw)
			near = minf(near, b[4]); far = maxf(far, b[8])
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = bm
		mi.position = c
		mi.custom_aabb = AABB(lo, hi - lo)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visibility_range_begin = maxf(0.0, near - r - 2.0)
		mi.visibility_range_end = far + r
		add_child(mi)
		stats.bill += 1

# a material per set and part: the baked look plus this set's fade
func _set_mat(d: Dictionary, fade: Vector2, shrink: float, tex: Callable) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	var cel: Dictionary = d.get("cel", {})
	if d.kind == "leaf":
		m.shader = LEAF
		m.set_shader_parameter("albedo_tex", tex.call(d.tex))
		m.set_shader_parameter("tint", _rgb(d.tint))
	else:
		m.shader = SOLID
		m.set_shader_parameter("use_tex", d.kind == "bark")
		m.set_shader_parameter("use_vc", d.kind == "rock")
		m.set_shader_parameter("mossy", bool(d.get("mossy", false)))
		if d.kind == "bark": m.set_shader_parameter("bark_tex", tex.call(d.tex))
		m.set_shader_parameter("color", _rgb(d.get("color", "#ffffff")) if d.kind == "rock" else Color.WHITE)
	m.set_shader_parameter("wind", float(d.get("wind", 0.0)))
	m.set_shader_parameter("fade", fade)
	m.set_shader_parameter("shrink", shrink)
	# celify's options, with its defaults
	var b: Array = cel.get("bands", [0.18, 0.4, 0.72])
	m.set_shader_parameter("bands", Vector3(b[0], b[1], b[2]))
	m.set_shader_parameter("soft", float(cel.get("soft", 0.025)))
	var v3 := func(k: String, dv: Array) -> Vector3:
		var x: Array = cel.get(k, dv)
		return Vector3(x[0], x[1], x[2])
	m.set_shader_parameter("deep", v3.call("deep", [0.26, 0.4, 0.62]))
	m.set_shader_parameter("shade", v3.call("shade", [0.5, 0.68, 0.88]))
	m.set_shader_parameter("lit", v3.call("lit", [1.1, 1.08, 0.92]))
	m.set_shader_parameter("lit_add", v3.call("litAdd", [0.05, 0.05, 0.0]))
	m.set_shader_parameter("detail", float(cel.get("detail", 0.0)))
	m.set_shader_parameter("mid", float(cel.get("mid", 0.3)))
	m.set_shader_parameter("gain", float(cel.get("gain", 1.0)))
	return m

# a quad whose corners carry only their UV (the billboard shader places them)
func _quad() -> ArrayMesh:
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-1, 0, 0), Vector3(1, 0, 0), Vector3(1, 2, 0), Vector3(-1, 2, 0)])
	a[Mesh.ARRAY_TEX_UV] = PackedVector2Array([Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)])
	a[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 0, 2, 3])
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	return m

# which kind of plant a baked set is
static func _kind(s: Dictionary, meta: Dictionary) -> String:
	var m: Dictionary = meta.mats[int(s.parts[0].mat)]
	if m.kind == "rock" and s.parts.size() == 1: return "rock"
	if s.impostor != null: return "tree" if float(s.radius) > 2.5 else "bush"
	return "fern" if float(s.fade[1]) > 58.0 else "flower"

static func _hash(i: int) -> float:
	var h := (i * 374761393 + 668265263) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	return float((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0

# every frame: where the camera is (fades), which chunks cast shadows
func update(cam_pos: Vector3) -> void:
	RenderingServer.global_shader_parameter_set("veg_cam", cam_pos)
	for ch in chunks:
		if ch.shadow <= 0.0: continue
		var c: Vector3 = ch.c
		var d: float = Vector2(c.x - cam_pos.x, c.z - cam_pos.z).length() - float(ch.r)
		var on: bool = d < shadow_far * float(ch.shadow)
		var want := GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if ch.node.cast_shadow != want: ch.node.cast_shadow = want
