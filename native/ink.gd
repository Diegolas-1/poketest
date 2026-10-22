extends Node
# Ink: the anime outlines (the web build's outline.js), autoloaded as `Ink`.
#
# Three kinds of ink, all drawn as part of the normal frame (no extra
# full-screen passes, so it stays cheap on the phone):
#  1. Vector ink for buildings and props (add_world_lines): the edges the web
#     build computes (silhouettes, hard creases, open boundaries; overlapping
#     parts already cut against each other so a whole shape is outlined once),
#     baked by tools/native/bake_ink.mjs to world/ink.bin and drawn as thin
#     camera-facing quads by shaders/ink_lines.gdshader. A handful of draw
#     calls (one per 64 m cell), transparent pass, depth-tested against
#     everything already drawn, so grass and water never paint over a line.
#  2. Characters and solid props without baked edges (outline_mesh): an
#     inverted hull (shaders/ink_hull.gdshader) drawn as the instance's
#     material_overlay. Works with skinned meshes (Skeleton3D) because the
#     hull runs on the skinned vertices. Needs smooth normals: a mesh with
#     split (flat) normals gets cracks at its corners.
#  3. Tree canopies and bushes made of alpha cut-out leaf cards
#     (outline_plant): the cards are drawn once more in ink, grown outward in
#     screen space from the plant's centre and pushed back in depth
#     (shaders/ink_leaf.gdshader), so the real leaves cover the inside and
#     only one silhouette per plant shows; small holes stay clean.
# All widths are in pixels (about 1.1 px at 1080p, scaled to the screen) and
# thin from 1 to 0 with distance from the player (set_focus, 10-55 m), then
# fade 70-170 m from the camera, as on the web.
#
# API for other scripts:
#   Ink.set_enabled(on: bool) / Ink.is_enabled() / Ink.toggle()   (O key: Settings "outlines")
#   Ink.set_quality(q: float)   Outline quality setting (< 0.75: no leaf ink)
#   Ink.changed signal (bool)                                      (for a settings menu)
#   Characters: any node in the group "characters" with a .meshes array
#       (actor.gd) is outlined automatically; meta no_ink / ink_group on a
#       MeshInstance3D leaves it out.
#   Ink.set_focus(player_pos: Vector3)                             (call every frame)
#   Ink.add_world_lines(parent: Node3D) -> Array                   (vector ink from ink.bin)
#   Ink.outline_mesh(mi: GeometryInstance3D, opts := {})           (characters: inverted hull)
#       opts: width (pixels at 1080p, default 1.1), color (Color).
#       For an animated character call it on every MeshInstance3D of the
#       model (e.g. after instancing the .glb: for each mesh under it).
#   Ink.outline_plant(mi: GeometryInstance3D, center = null, opts := {})
#       Leaf cards grow outward along their normals (puff normals pointing
#       out of the plant, as in the web's foliage; default width 1.6); with center (the plant's
#       middle in the mesh's local space, or in each instance's space for a
#       MultiMesh of plants) they grow away from that point instead. opts: width, color,
#       push (metres the ink copy steps back, default 0.15), tex_param /
#       cut_param (names of the leaf material's texture and alpha cut-off
#       uniforms, default "albedo_tex" / "alpha_scissor"), tex (Texture2D),
#       cut (float), double_sided (default: as the leaf material). The leaf shader's wind sway must be copied into
#       ink_leaf.gdshader (marked WIND) if the leaves move.
#   Ink.outline_town(root)   the baked town's trunks and bushes (ink_meshes.json)
# Both outline_* return the ink ShaderMaterial (set its uniforms to tune it).

signal changed(on: bool)

const LINES := preload("res://shaders/ink_lines.gdshader")
const HULL := preload("res://shaders/ink_hull.gdshader")
const LEAF := preload("res://shaders/ink_leaf.gdshader")
const CELL := 64.0

var enabled := true
var quality := 1.0
var hull_mat: ShaderMaterial    # shared by the characters
var scan_t := 0.0
var line_mat: ShaderMaterial
var line_nodes: Array = []
var overlays: Array = []   # [GeometryInstance3D, ink material]

func _ready() -> void:
	line_mat = ShaderMaterial.new()
	line_mat.shader = LINES
	line_mat.render_priority = Material.RENDER_PRIORITY_MAX
	hull_mat = ShaderMaterial.new()
	hull_mat.shader = HULL
	_common(hull_mat, {})

# characters (actor.gd adds each to the group "characters"): every mesh in
# its .meshes gets the hull, except those with meta no_ink (the web leaves
# them out) or ink_group (drawn as part of another mesh, e.g. the eye patch on
# the face). Checked twice a second, so new villagers and meshes added later
# (hair, cloth) are picked up.
# Deforming meshes: skinning, blend shapes and CPU-updated meshes (cloth or
# hair written into the mesh or driven by bones) are followed by the hull as
# they are. A mesh that moves its vertices in its OWN vertex shader must give
# the ink the same motion: set meta "ink_material" on the MeshInstance3D to a
# ShaderMaterial made from shaders/ink_hull.gdshader with that vertex code
# added (marked DEFORM there); Ink uses it instead of the shared hull.
func _process(dt: float) -> void:
	scan_t -= dt
	if scan_t > 0.0: return
	scan_t = 0.5
	for a in get_tree().get_nodes_in_group("characters"):
		var list = a.get("meshes")
		if list == null: continue
		for m3 in list:
			if not is_instance_valid(m3) or m3.has_meta("ink_done") or m3.has_meta("no_ink") or m3.has_meta("ink_group"): continue
			m3.set_meta("ink_done", true)
			var mat = m3.get_meta("ink_material") if m3.has_meta("ink_material") else null
			if mat is ShaderMaterial: _common(mat, {})
			_attach(m3, mat if mat is ShaderMaterial else hull_mat)

func set_enabled(on: bool) -> void:
	if on == enabled: return
	enabled = on
	for n in line_nodes:
		if is_instance_valid(n): n.visible = on
	for p in overlays:
		if is_instance_valid(p[0]): _chain(p[0], p[1], on and (quality >= 0.75 or p[1].shader != LEAF))
	changed.emit(on)

func is_enabled() -> bool:
	return enabled

# the Outline quality setting: below 0.75 the leaf ink (a second draw of every
# leaf card, the costliest part) is left out; lines and hulls stay
func set_quality(q: float) -> void:
	quality = q
	var leaf_on := q >= 0.75
	for p in overlays:
		if is_instance_valid(p[0]) and p[1].shader == LEAF: _chain(p[0], p[1], enabled and leaf_on)

func toggle() -> void:
	set_enabled(not enabled)

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and e.physical_keycode == KEY_O:
		# through the settings when they exist, so the choice is saved and shown
		var st := get_node_or_null("/root/Settings")
		if st and st.has_method("set_value"): st.set_value("outlines", 0 if enabled else 1)
		else: toggle()

func set_focus(p: Vector3) -> void:
	RenderingServer.global_shader_parameter_set("ink_focus", p)

# ---------- 1. vector ink for the baked town ----------
# world/ink.bin holds ready-made vertex arrays per 64 m cell (see
# tools/native/bake_ink.mjs), so loading is only slicing.
func add_world_lines(parent: Node3D, file := "res://world/ink.bin") -> Array:
	var t0 := Time.get_ticks_usec()
	var raw := FileAccess.get_file_as_bytes(file)
	if raw.size() < 8 or raw.slice(0, 4).get_string_from_ascii() != "INK2":
		push_warning("ink: no edges in " + file)
		return []
	var cells := raw.decode_u32(4)
	var at := 8
	var edges := 0
	var out: Array = []
	var fmt := (Mesh.ARRAY_CUSTOM_RGBA_HALF << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) \
		| (Mesh.ARRAY_CUSTOM_RGBA8_SNORM << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT) \
		| (Mesh.ARRAY_CUSTOM_RGBA8_SNORM << Mesh.ARRAY_FORMAT_CUSTOM2_SHIFT)
	for c in cells:
		var cx := raw.decode_s32(at); var cz := raw.decode_s32(at + 4); var m := raw.decode_u32(at + 8)
		at += 12
		var nv := m * 4
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = raw.slice(at, at + nv * 12).to_vector3_array(); at += nv * 12
		arr[Mesh.ARRAY_CUSTOM0] = raw.slice(at, at + nv * 8); at += nv * 8
		arr[Mesh.ARRAY_CUSTOM1] = raw.slice(at, at + nv * 4); at += nv * 4
		arr[Mesh.ARRAY_CUSTOM2] = raw.slice(at, at + nv * 4); at += nv * 4
		arr[Mesh.ARRAY_INDEX] = raw.slice(at, at + m * 24).to_int32_array(); at += m * 24
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, fmt)
		var mi := MeshInstance3D.new()
		mi.name = "ink_%d_%d" % [cx, cz]
		mi.mesh = mesh
		mi.material_override = line_mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.extra_cull_margin = 0.5
		mi.visible = enabled
		parent.add_child(mi)
		line_nodes.append(mi)
		out.append(mi)
		edges += m
	print("ink: %d edges in %d cells, %d ms" % [edges, cells, (Time.get_ticks_usec() - t0) / 1000])
	return out

# ---------- 2. characters: inverted hull ----------
# The ink is the mesh's material_overlay (drawn once more over all its
# surfaces, per instance, so shared materials are left alone); an overlay the
# mesh already has keeps working, the ink goes at the end of its pass chain.
func outline_mesh(mi: GeometryInstance3D, opts := {}) -> ShaderMaterial:
	var ink := ShaderMaterial.new()
	ink.shader = HULL
	_common(ink, opts)
	_attach(mi, ink)
	return ink

# ---------- 3. plants: one silhouette per plant from the leaf cards ----------
func outline_plant(mi: GeometryInstance3D, center = null, opts := {}) -> ShaderMaterial:
	var ink := ShaderMaterial.new()
	ink.shader = LEAF
	# a cut-out edge needs a little more than the line width to read as a line
	_common(ink, opts, 1.6)
	if center != null:
		ink.set_shader_parameter("center", center)
		ink.set_shader_parameter("use_center", true)
	ink.set_shader_parameter("push", opts.get("push", 0.15))
	var tex = opts.get("tex", null)
	var cut = opts.get("cut", null)
	var m: Material = _first_material(mi)
	if m is ShaderMaterial:
		if tex == null: tex = m.get_shader_parameter(opts.get("tex_param", "albedo_tex"))
		if cut == null: cut = m.get_shader_parameter(opts.get("cut_param", "alpha_scissor"))
	elif m is BaseMaterial3D:
		if tex == null: tex = m.albedo_texture
		if cut == null: cut = m.alpha_scissor_threshold
	var ds = opts.get("double_sided", null)
	if ds == null:
		if m is ShaderMaterial: ds = m.shader != null and m.shader.code.contains("cull_disabled")
		elif m is BaseMaterial3D: ds = m.cull_mode == BaseMaterial3D.CULL_DISABLED
		else: ds = false
	ink.set_shader_parameter("double_sided", ds)
	if tex: ink.set_shader_parameter("leaf_tex", tex)
	ink.set_shader_parameter("use_tex", tex != null)
	ink.set_shader_parameter("cut", float(cut) if cut != null and float(cut) > 0.0 else 0.5)
	_attach(mi, ink)
	return ink

# The baked town's trunks (hull) and bushes / hedges (leaf ink): the meshes of
# town.glb whose box centres the bake listed in world/ink_meshes.json.
func outline_town(root: Node, file := "res://world/ink_meshes.json") -> void:
	if not FileAccess.file_exists(file): return
	var lists: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(file))
	var keys := {}
	for kind in ["hull", "leaf"]:
		for c in lists.get(kind, []):
			keys[Vector3i(roundi(c[0] * 20.0), roundi(c[1] * 20.0), roundi(c[2] * 20.0))] = kind
	var found := {"hull": 0, "leaf": 0}
	for mi in _meshes(root, []):
		var c: Vector3 = (mi.global_transform * mi.get_aabb()).get_center()
		var kind = null
		for dx in [0, -1, 1]:
			for dy in [0, -1, 1]:
				for dz in [0, -1, 1]:
					var k := Vector3i(roundi(c.x * 20.0) + dx, roundi(c.y * 20.0) + dy, roundi(c.z * 20.0) + dz)
					if kind == null and keys.has(k): kind = keys[k]
		if kind == "hull": outline_mesh(mi)
		elif kind == "leaf":
			# one plant: grow away from its middle; merged plants (many in one
			# mesh): along the cards' puff normals
			var box: AABB = mi.get_aabb()
			outline_plant(mi, box.get_center() if box.size.length() < 8.0 else null)
		if kind != null: found[kind] += 1
	print("ink: town hull %d, leaf %d" % [found.hull, found.leaf])

func _meshes(n: Node, out: Array) -> Array:
	if n is MeshInstance3D: out.append(n)
	for c in n.get_children(): _meshes(c, out)
	return out

func _common(ink: ShaderMaterial, opts: Dictionary, width := 1.1) -> void:
	ink.set_shader_parameter("width_1080", opts.get("width", width))
	if opts.has("color"): ink.set_shader_parameter("ink_color", opts.color)
	ink.render_priority = Material.RENDER_PRIORITY_MAX - 1

func _first_material(mi: GeometryInstance3D) -> Material:
	if mi.material_override: return mi.material_override
	var mesh: Mesh = null
	if mi is MeshInstance3D: mesh = mi.mesh
	elif mi is MultiMeshInstance3D and mi.multimesh: mesh = mi.multimesh.mesh
	if mesh == null: return null
	for s in mesh.get_surface_count():
		var m: Material = mi.get_surface_override_material(s) if mi is MeshInstance3D else null
		if m == null: m = mesh.surface_get_material(s)
		if m: return m
	return null

func _attach(mi: GeometryInstance3D, ink: ShaderMaterial) -> void:
	if overlays.size() > 64 and overlays.size() % 64 == 0:
		overlays = overlays.filter(func(p): return is_instance_valid(p[0]))   # freed villagers
	for p in overlays:
		if p[0] == mi and p[1] == ink: return
	overlays.append([mi, ink])
	if enabled and (quality >= 0.75 or ink.shader != LEAF): _chain(mi, ink, true)

# put the ink at the end of the instance's overlay chain, or take it out
func _chain(mi: GeometryInstance3D, ink: Material, on: bool) -> void:
	if mi.material_overlay == null or mi.material_overlay == ink:
		mi.material_overlay = ink if on else null
		return
	var q: Material = mi.material_overlay
	while q.next_pass and q.next_pass != ink: q = q.next_pass
	if on: q.next_pass = ink
	elif q.next_pass == ink: q.next_pass = null
