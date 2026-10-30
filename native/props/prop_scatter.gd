class_name PropScatter
extends RefCounted
# Places copies of a prop (props/*: an ArrayMesh with its surfaces' materials) as
# MultiMeshes, binned in chunks so Godot culls what is out of view and drops
# what is past its range (Mobile: a draw call per chunk and surface, however
# many copies).
#
#   PropScatter.place(parent, mesh, [Transform3D...], {chunk: 24, shadow: true,
#       range: 90, ink: false})  -> the MultiMeshInstance3Ds

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
		if o.has("range"): mi.visibility_range_end = float(o.range) + cs
		if o.has("material"): mi.material_override = o.material
		parent.add_child(mi)
		if ink: ink.outline_mesh(mi, {"width": 1.0})
		out.append(mi)
	return out

# one merged mesh (a builder's), its own node: litter, the limbs of a grove
static func single(parent: Node3D, mesh: Mesh, at := Vector3.ZERO, o := {}) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = at
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if o.get("shadow", false) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if o.has("range"): mi.visibility_range_end = float(o.range)
	parent.add_child(mi)
	var ink = parent.get_node_or_null("/root/Ink") if o.get("ink", false) else null
	if ink: ink.outline_mesh(mi, {"width": 1.0})
	return mi
