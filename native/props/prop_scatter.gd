class_name PropScatter
extends RefCounted
# Places copies of a prop (props/*: an ArrayMesh with its surfaces' materials) as
# MultiMeshes, binned in chunks so Godot culls what is out of view and drops
# what is past its range (Mobile: a draw call per chunk and surface, however
# many copies).
#
#   PropScatter.place(parent, mesh, [Transform3D...], {chunk: 24, shadow: true,
#       range: 90, ink: false, hide: 0})  -> the MultiMeshInstance3Ds
#   hide: m, a copy rooted that near a battle's middle goes as its arena opens (a long
#   log); a merged mesh (single) slides vertex by vertex instead (veg.gdshaderinc)

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
	if float(o.get("hide", 0.0)) > 0.0: mesh = _arena_mesh(mesh, {"arena_hide": float(o.hide)})
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
		if ink: _follow(ink.outline_mesh(mi, {"width": 1.0}), float(o.get("hide", 0.0)))
		out.append(mi)
	return out

# one merged mesh (a builder's), its own node: litter, the limbs of a grove
static func single(parent: Node3D, mesh: Mesh, at := Vector3.ZERO, o := {}) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _arena_mesh(mesh, {"push_each": true}) if o.get("each", true) else mesh
	mi.position = at
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if o.get("shadow", false) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if o.has("range"): mi.visibility_range_end = float(o.range)
	parent.add_child(mi)
	var ink = parent.get_node_or_null("/root/Ink") if o.get("ink", false) else null
	if ink: _follow(ink.outline_mesh(mi, {"width": 1.0}), 0.0)
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

# the ink hull slides (and goes) with its prop in a battle's arena (ink_hull.gdshader)
static func _follow(ink: ShaderMaterial, hide: float) -> void:
	if ink == null: return
	ink.set_shader_parameter("arena_follow", true)
	ink.set_shader_parameter("arena_hide", hide)
