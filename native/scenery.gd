extends Node3D
# The world's scenery and its performance work (worker: world rendering):
#  - the town's repeated parts (pickets, posts, stair treads) drawn as
#    MultiMesh chunks from town_inst.bin instead of expanded copies
#  - the plants (veg.gd)
#  - the sea split into the deep water (opaque: the GPU never shades the sea
#    floor under it) and the shallows (see-through), the sea under the land
#    left out
#  - the distant mountains (nature.js buildMountains + main.js's opening to
#    the south) and the anime clouds (clouds.js)
# main.gd makes it after the town and the water and calls update() each frame.

const Veg := preload("res://veg.gd")
const SEA_DEEP := preload("res://shaders/sea_deep.gdshader")
const MOUNTAINS := preload("res://shaders/mountains.gdshader")
const CLOUDS := preload("res://shaders/clouds.gdshader")
const CINNABAR := preload("res://shaders/cinnabar.gdshader")
const CINNABAR_SMOKE := preload("res://shaders/cinnabar_smoke.gdshader")
const DIR := "res://world/"

var main: Node3D
var veg: Node3D
var mts: MeshInstance3D
var clouds: MeshInstance3D

func setup(m: Node3D, town_root: Node, water_root: Node, terrain_mat: ShaderMaterial) -> void:
	main = m
	_town_parts(town_root)
	_sea(water_root, terrain_mat)
	_mountains()
	_cinnabar()
	_clouds()
	_plants()
	var S = get_node_or_null("/root/Settings")
	if S: S.changed.connect(_on_setting)

func _plants() -> void:
	if veg: veg.queue_free()
	veg = Veg.new()
	add_child(veg)
	var S = get_node_or_null("/root/Settings")
	var lod := float(S.get_value("lod")) if S else 1.0
	veg.build(lod, float(S.get_value("trees")) if S else 1.0, float(S.get_value("plants")) if S else 1.0)
	if S: veg.shadow_far = float(S.get_value("shadow_dist"))

var plants_dirty := false
func _on_setting(key: String, _v) -> void:
	if key in ["lod", "trees", "plants"]: plants_dirty = true
	if key == "shadow_dist" and veg:
		veg.shadow_far = float(_v)
		veg.last_pos = Vector3(INF, INF, INF)

func update(cam_pos: Vector3) -> void:
	if plants_dirty:
		plants_dirty = false
		_plants()
	if veg: veg.update(cam_pos)

# ---------- the town's repeated parts ----------
func _town_parts(root: Node) -> void:
	_town_leaves(root)
	var list: Array = main.world.meta.get("inst", [])
	if list.is_empty(): return
	var xf := FileAccess.get_file_as_bytes(DIR + "town_inst.bin").to_float32_array()
	var by_name := {}
	for n in root.find_children("I*", "MeshInstance3D", true, false): by_name[String(n.name)] = n
	const C := 48.0
	for e in list:
		var src: MeshInstance3D = by_name.get(e.node)
		if src == null: continue
		src.visible = false
		var mat: Material = src.get_surface_override_material(0)
		if e.color and mat is ShaderMaterial:
			# per copy brightness: the copy's colour reaches the shader as COLOR
			mat = mat.duplicate()
			mat.set_shader_parameter("use_vc", true)
		var bins := {}
		for i in int(e.n):
			var o := (int(e.off) + i) * 15
			var k := Vector2i(floori(xf[o + 3] / C), floori(xf[o + 11] / C))
			if not bins.has(k): bins[k] = []
			bins[k].append(o)
		for k in bins:
			var ids: Array = bins[k]
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_colors = bool(e.color)
			mm.mesh = src.mesh
			mm.instance_count = ids.size()
			for j in ids.size():
				var o: int = ids[j]
				mm.set_instance_transform(j, Transform3D(Basis(Vector3(xf[o], xf[o + 4], xf[o + 8]), Vector3(xf[o + 1], xf[o + 5], xf[o + 9]), Vector3(xf[o + 2], xf[o + 6], xf[o + 10])),
					Vector3(xf[o + 3], xf[o + 7], xf[o + 11])))
				if e.color: mm.set_instance_color(j, Color(xf[o + 12], xf[o + 13], xf[o + 14]))
			var mi := MultiMeshInstance3D.new()
			mi.multimesh = mm
			mi.material_override = mat
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if e.get("shadow", true) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mi)

# ---------- the sea: deep part opaque, shallows see-through ----------
func _sea(root: Node, terrain_mat: ShaderMaterial) -> void:
	var w = main.world
	var sea_y: float = w.sea_y
	for mi in root.find_children("sea*", "MeshInstance3D", true, false):
		var shallow_mat: ShaderMaterial = mi.material_override
		var deep_mat := ShaderMaterial.new()
		deep_mat.shader = SEA_DEEP
		for p in ["seabed", "bed_box", "sea_y"]: deep_mat.set_shader_parameter(p, shallow_mat.get_shader_parameter(p))
		var arr: Array = mi.mesh.surface_get_arrays(0)
		var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
		if idx.is_empty():
			idx.resize(v.size())
			for i in v.size(): idx[i] = i
		var xf: Transform3D = mi.global_transform
		var depth := PackedFloat32Array()
		depth.resize(v.size())
		for i in v.size():
			var p: Vector3 = xf * v[i]
			depth[i] = sea_y - w.bed_at(p.x, p.z)
		var deep := PackedInt32Array(); var shal := PackedInt32Array()
		for t in range(0, idx.size(), 3):
			var a := depth[idx[t]]; var b := depth[idx[t + 1]]; var c := depth[idx[t + 2]]
			if maxf(a, maxf(b, c)) < -1.0: continue          # under the land
			if minf(a, minf(b, c)) > 2.4: deep.append_array([idx[t], idx[t + 1], idx[t + 2]])
			else: shal.append_array([idx[t], idx[t + 1], idx[t + 2]])
		var mk := func(ids: PackedInt32Array, mat: Material) -> void:
			if ids.is_empty(): return
			var a := arr.duplicate()
			a[Mesh.ARRAY_INDEX] = ids
			var m := ArrayMesh.new()
			m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
			var n := MeshInstance3D.new()
			n.mesh = m
			n.material_override = mat
			n.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			n.extra_cull_margin = 4.0
			n.transform = mi.transform
			n.name = String(mi.name) + ("_deep" if mat == deep_mat else "_shallow")
			mi.get_parent().add_child(n)
		mk.call(deep, deep_mat)
		mk.call(shal, shallow_mat)
		mi.visible = false
	# the sea floor under the deep water is never seen
	if terrain_mat: terrain_mat.set_shader_parameter("hidden_y", sea_y - 1.7)

# ---------- distant mountains ----------
func _mountains() -> void:
	var layers: Array = main.world.meta.get("mountains", [])
	if layers.is_empty(): return
	var f := FileAccess.get_file_as_bytes(DIR + "mountains.bin").to_float32_array()
	var m := ArrayMesh.new()
	var o := 0
	for L in layers:
		var nv := int(L.v); var ni := int(L.i)
		var pos := PackedVector3Array(); var nrm := PackedVector3Array(); var uv := PackedVector2Array()
		pos.resize(nv); nrm.resize(nv); uv.resize(nv)
		for i in nv:
			var q := o + i * 8
			pos[i] = Vector3(f[q], f[q + 1], f[q + 2]); nrm[i] = Vector3(f[q + 3], f[q + 4], f[q + 5]); uv[i] = Vector2(f[q + 6], f[q + 7])
		o += nv * 8
		var idx := PackedInt32Array(); idx.resize(ni)
		for i in ni: idx[i] = int(f[o + i])
		o += ni
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = pos; a[Mesh.ARRAY_NORMAL] = nrm; a[Mesh.ARRAY_TEX_UV] = uv; a[Mesh.ARRAY_INDEX] = idx
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
		var mat := ShaderMaterial.new()
		mat.shader = MOUNTAINS
		mat.set_shader_parameter("far", float(L.far))
		mat.set_shader_parameter("sun", main.SUN_DIR.normalized())
		m.surface_set_material(m.get_surface_count() - 1, mat)
	mts = MeshInstance3D.new()
	mts.mesh = m
	mts.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mts.custom_aabb = AABB(Vector3(-1450, -60, -1650), Vector3(2900, 520, 2900))
	add_child(mts)

# ---------- Cinnabar Island: far scenery on the southern horizon ----------
func _cinnabar() -> void:
	var d: Dictionary = main.world.meta.get("cinnabar", {})
	if d.is_empty() or not FileAccess.file_exists(DIR + "cinnabar.bin"): return
	var b := FileAccess.get_file_as_bytes(DIR + "cinnabar.bin")
	var nv := int(d.v); var ni := int(d.i)
	var f := b.slice(0, nv * 36).to_float32_array()
	var ix := b.slice(nv * 36).to_int32_array()
	var pos := PackedVector3Array(); var nrm := PackedVector3Array(); var col := PackedColorArray()
	pos.resize(nv); nrm.resize(nv); col.resize(nv)
	for i in nv:
		var q := i * 9
		pos[i] = Vector3(f[q], f[q + 1], f[q + 2]); nrm[i] = Vector3(f[q + 3], f[q + 4], f[q + 5]); col[i] = Color(f[q + 6], f[q + 7], f[q + 8])
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos; a[Mesh.ARRAY_NORMAL] = nrm; a[Mesh.ARRAY_COLOR] = col; a[Mesh.ARRAY_INDEX] = ix.slice(0, ni)
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var mat := ShaderMaterial.new()
	mat.shader = CINNABAR
	mat.set_shader_parameter("sun", main.SUN_DIR.normalized())
	mat.render_priority = -5
	var land := MeshInstance3D.new()
	land.mesh = m
	land.material_override = mat
	land.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(land)
	# the plume: puffs as quads at the vent, moved by the shader
	var vent := Vector3(d.vent[0], d.vent[1], d.vent[2])
	var n := int(d.get("puffs", 14))
	var pp := PackedVector3Array(); var uv := PackedVector2Array(); var uv2 := PackedVector2Array(); var idx := PackedInt32Array()
	for k in n:
		var b0 := pp.size()
		for c in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
			pp.append(vent); uv.append(c); uv2.append(Vector2(float(k) / n, 0.0))
		idx.append_array([b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3])
	var a2 := []
	a2.resize(Mesh.ARRAY_MAX)
	a2[Mesh.ARRAY_VERTEX] = pp; a2[Mesh.ARRAY_TEX_UV] = uv; a2[Mesh.ARRAY_TEX_UV2] = uv2; a2[Mesh.ARRAY_INDEX] = idx
	var pm := ArrayMesh.new()
	pm.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a2)
	var smat := ShaderMaterial.new()
	smat.shader = CINNABAR_SMOKE
	var plume := MeshInstance3D.new()
	plume.mesh = pm
	plume.material_override = smat
	plume.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	plume.custom_aabb = AABB(vent - Vector3(120, 20, 120), Vector3(400, 300, 300))
	add_child(plume)

# ---------- clouds: every sprite a camera-facing quad of one mesh ----------
func _clouds() -> void:
	if not FileAccess.file_exists(DIR + "clouds.json"): return
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DIR + "clouds.json"))
	var AW := float(d.size[0]); var AH := float(d.size[1])
	var pos := PackedVector3Array(); var uv := PackedVector2Array(); var corner := PackedVector2Array(); var col := PackedColorArray(); var idx := PackedInt32Array()
	for s in d.sprites:
		var r: Array = d.rects[int(s.t)]
		var u0 := (float(r[0]) + 0.5) / AW; var u1 := (float(r[0]) + float(r[2]) - 0.5) / AW
		var v0 := (float(r[1]) + 0.5) / AH; var v1 := (float(r[1]) + float(r[3]) - 0.5) / AH
		if s.mirror: var t := u0; u0 = u1; u1 = t
		var c := Vector3(s.p[0], s.p[1], s.p[2])
		var w := float(s.w); var h := float(s.h); var cy := float(s.cy)
		var b := pos.size()
		# corners: bottom left, bottom right, top right, top left (atlas v runs down)
		for k in 4:
			var x := -0.5 if k == 0 or k == 3 else 0.5
			var y := -cy if k < 2 else 1.0 - cy
			pos.append(c)
			corner.append(Vector2(x * w, y * h))
			uv.append(Vector2(u0 if x < 0.0 else u1, v1 if k < 2 else v0))
			col.append(Color(1, 1, 1, float(s.o)))
		idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos; a[Mesh.ARRAY_TEX_UV] = uv; a[Mesh.ARRAY_TEX_UV2] = corner; a[Mesh.ARRAY_COLOR] = col; a[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var mat := ShaderMaterial.new()
	mat.shader = CLOUDS
	mat.set_shader_parameter("atlas", load(DIR + "clouds.png"))
	mat.set_shader_parameter("spin", float(d.get("spin", 0.003)))
	mat.render_priority = -10
	clouds = MeshInstance3D.new()
	clouds.mesh = m
	clouds.material_override = mat
	clouds.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	clouds.custom_aabb = AABB(Vector3(-1000, -100, -1000), Vector3(2000, 600, 2000))
	add_child(clouds)

# the town's own leaves (garden trees and bushes, ivy, vines, green roofs,
# merged into town.glb as materials named leaf_<variant>): the leaf shader
# with the web's leaf bands, without wind (the merged cards lost their tree)
func _town_leaves(root: Node) -> void:
	var made := {}
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		for s in mesh.get_surface_count():
			var src: Material = mesh.surface_get_material(s)
			if src == null or not String(src.resource_name).begins_with("leaf_"): continue
			if not made.has(src):
				var m := ShaderMaterial.new()
				m.shader = Veg.LEAF
				var autumn := String(src.resource_name).ends_with("autumn")
				m.set_shader_parameter("albedo_tex", src.albedo_texture)
				m.set_shader_parameter("tint", src.albedo_color)
				m.set_shader_parameter("bands", Vector3(0.24, 0.44, 0.57))
				m.set_shader_parameter("soft", 0.02)
				m.set_shader_parameter("detail", 0.55)
				m.set_shader_parameter("mid", 0.3 if autumn else 0.26)
				m.set_shader_parameter("deep", Vector3(0.32, 0.12, 0.26) if autumn else Vector3(0.13, 0.33, 0.6))
				m.set_shader_parameter("shade", Vector3(0.62, 0.36, 0.48) if autumn else Vector3(0.36, 0.66, 0.9))
				m.set_shader_parameter("lit", Vector3(1.2, 1.18, 0.75) if autumn else Vector3(1.45, 1.3, 0.62))
				m.set_shader_parameter("lit_add", Vector3(0.06, 0.04, 0.0) if autumn else Vector3(0.07, 0.08, 0.0))
				made[src] = m
			mi.set_surface_override_material(s, made[src])
