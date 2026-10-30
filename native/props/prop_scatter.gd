class_name PropScatter
extends RefCounted
# Places copies of a prop (props/*: an ArrayMesh with its surfaces' materials) as
# MultiMeshes, binned in chunks so Godot culls what is out of view and drops
# what is past its range (Mobile: a draw call per chunk and surface, however
# many copies).
#
#   PropScatter.place(parent, mesh, [Transform3D...], {chunk: 24, shadow: true,
#       range: 90, ink: false})  -> the MultiMeshInstance3Ds
#   PropScatter.merged(parent, [[mesh, [Transform3D...]]...], {chunk: 40, ...})
#       every copy of several props baked into one mesh a chunk (a draw call per
#       material and chunk, whatever the props): logs and stumps, ferns and toadstools
#   PropScatter.single(parent, mesh, at, {...})   one mesh as it is
# A merged mesh slides vertex by vertex when a battle's arena opens (veg.gdshaderinc
# push_each), so a long log ends up out on the ring, none of it across the floor.

static func place(parent: Node3D, mesh: Mesh, xfs: Array, o := {}) -> Array:
	var out := []
	if mesh == null or xfs.is_empty(): return out
	var cs := float(o.get("chunk", 24.0))
	var bins := {}
	for xf: Transform3D in xfs:
		var k := Vector2i(floori(xf.origin.x / cs), floori(xf.origin.z / cs))
		if not bins.has(k): bins[k] = []
		bins[k].append(xf)
	var ink = parent.get_node_or_null("/root/Ink") if o.get("ink", false) else null
	for k in bins:
		var list: Array = bins[k]
		var c := Vector3.ZERO
		for xf: Transform3D in list: c += xf.origin
		c /= list.size()
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = mesh
		mm.instance_count = list.size()
		for j in list.size():
			var xf: Transform3D = list[j]
			mm.set_instance_transform(j, Transform3D(xf.basis, xf.origin - c))
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.position = c
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if o.get("shadow", false) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if o.has("range"): mi.visibility_range_end = float(o.range) + cs * 0.5
		if o.has("material"): mi.material_override = o.material
		parent.add_child(mi)
		if ink: _follow(ink.outline_mesh(mi, {"width": 1.0}), false)
		out.append(mi)
	return out

static func merged(parent: Node3D, items: Array, o := {}) -> Array:
	var out := []
	var cs := float(o.get("chunk", 40.0))
	var bins := {}
	for it in items:
		var m: Mesh = it[0]
		if m == null: continue
		for xf: Transform3D in it[1]:
			var k := Vector2i(floori(xf.origin.x / cs), floori(xf.origin.z / cs))
			if not bins.has(k): bins[k] = []
			bins[k].append([m, xf])
	for k in bins:
		var list: Array = bins[k]
		var c := Vector3.ZERO
		for e in list: c += (e[1] as Transform3D).origin
		c /= list.size()
		# a SurfaceTool per material, every copy's surfaces of it appended
		var tools := {}
		var mats := {}
		for e in list:
			var m: Mesh = e[0]
			var xf: Transform3D = e[1]
			var lx := Transform3D(xf.basis, xf.origin - c)
			for si in m.get_surface_count():
				var mt: Material = m.surface_get_material(si)
				var key := mt.get_instance_id() if mt else 0
				if not tools.has(key):
					var st := SurfaceTool.new()
					st.begin(Mesh.PRIMITIVE_TRIANGLES)
					tools[key] = st
					mats[key] = mt
				(tools[key] as SurfaceTool).append_from(m, si, lx)
		var am := ArrayMesh.new()
		for key in tools:
			(tools[key] as SurfaceTool).commit(am)
			am.surface_set_material(am.get_surface_count() - 1, mats[key])
		var oo := o.duplicate()
		oo["range"] = float(o.get("range", 90.0)) + cs * 0.5
		out.append(single(parent, am, c, oo))
	return out

# one merged mesh (a builder's), its own node: litter, the limbs of a grove (o.each
# false: it slides whole in a battle's arena, as one thing; else vertex by vertex)
static func single(parent: Node3D, mesh: Mesh, at := Vector3.ZERO, o := {}) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _arena_mesh(mesh, {"push_each": true}) if o.get("each", true) else mesh
	mi.position = at
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if o.get("shadow", false) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if o.has("range"): mi.visibility_range_end = float(o.range)
	parent.add_child(mi)
	var ink = parent.get_node_or_null("/root/Ink") if o.get("ink", false) else null
	if ink: _follow(ink.outline_mesh(mi, {"width": 1.0}), o.get("each", true))
	return mi

# the mesh's plant materials (veg.gd's shaders) swapped for copies with these
# parameters (the mesh is the caller's own: a builder's, made for this place)
static var _dups := {}
static func _arena_mesh(mesh: Mesh, params: Dictionary) -> Mesh:
	if not mesh is ArrayMesh: return mesh
	var out: ArrayMesh = mesh
	for si in out.get_surface_count():
		var m = out.surface_get_material(si)
		if not m is ShaderMaterial or not (m as ShaderMaterial).shader in [preload("res://veg.gd").LEAF, preload("res://veg.gd").SOLID]: continue
		var key := "%d|%s" % [m.get_instance_id(), str(params)]
		if not _dups.has(key):
			var d: ShaderMaterial = m.duplicate()
			for p in params: d.set_shader_parameter(p, params[p])
			_dups[key] = d
		out.surface_set_material(si, _dups[key])
	return out

# the ink hull slides with its prop in a battle's arena (ink_hull.gdshader)
static func _follow(ink: ShaderMaterial, each: bool) -> void:
	if ink == null: return
	ink.set_shader_parameter("arena_follow", true)
	ink.set_shader_parameter("arena_each", each)
