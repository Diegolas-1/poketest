extends Node3D
# The night's lights outdoors (daynight.gd makes it): the town's street, wall and
# porch lamps and its windows light up (their cel materials marked night_glow:
# toon.gdshaderinc's emission, no new meshes), a soft halo round every lamp and
# a pool of light on the ground under it (one mesh each, added on top), and
# fireflies over Route 1's tall grass and by the fresh water on warm nights (one
# mesh, moved in its vertex shader). No real lights: on Mobile every OmniLight
# costs each big merged town mesh it touches, so the glow is all paint. Three
# draws in all, none while it is day (hidden).
#
# The town's glass and lamp globes are found by their look (main.gd toon_for):
# glass by its picture (the web build's glassTex, the town's few window
# textures), a lamp's globe by its plain warm white. render.json can list
# others: "night_glass" (texture file names), "night_lamps" (colours).

const T := preload("res://tunables.gd")
const GLASS := ["c22689634c0b394c.png", "a68d746faa4921d1.png", "c2d6449cb01e9349.png"]
const LAMPS := ["fff1c4", "ffe7a6", "fffbea", "fff3c0"]
const HALO := preload("res://shaders/night_halo.gdshader")
const POOL := preload("res://shaders/night_pool.gdshader")
const FLIES := preload("res://shaders/night_flies.gdshader")
const FLY_N := 320

var main: Node3D
var lamps: Array = []         # [{pos: Vector3, kind: "street" | "wall"}]
var windows := 0              # glass materials marked
var halos: MeshInstance3D
var pools: MeshInstance3D
var flies: MeshInstance3D
var _on := false

func setup(m: Node3D) -> void:
	main = m
	var t0 := Time.get_ticks_usec()
	var glass: Array = T.file("render").get("night_glass", GLASS)
	var lamp_cols: Array = []
	for c in T.file("render").get("night_lamps", LAMPS): lamp_cols.append(Color(String(c)))
	var pts := []
	var seen := {}
	for root in [main.town_root, main.scenery]:
		if root == null: continue
		for gi in root.find_children("*", "GeometryInstance3D", true, false):
			var mesh: Mesh = null
			var xfs: Array = []
			if gi is MeshInstance3D:
				mesh = gi.mesh
				xfs = [gi.global_transform]
			elif gi is MultiMeshInstance3D and gi.multimesh:
				mesh = gi.multimesh.mesh
				for j in gi.multimesh.instance_count: xfs.append(gi.global_transform * gi.multimesh.get_instance_transform(j))
			if mesh == null: continue
			if gi is MeshInstance3D and not gi.visible and String(gi.name).begins_with("I_"): continue   # (drawn by scenery's copies)
			for s in mesh.get_surface_count():
				var mat: Material = gi.material_override if gi.material_override else (gi.get_surface_override_material(s) if gi is MeshInstance3D else null)
				if not mat is ShaderMaterial: continue
				var sm: ShaderMaterial = mat
				var kind := _kind(sm, glass, lamp_cols)
				if kind == 0: continue
				sm.set_shader_parameter("night_glow", float(kind))
				if kind == 1:
					if not seen.has(sm): windows += 1
					seen[sm] = true
					continue
				# a lamp: where its globes are (the surface's vertices, clustered)
				var arr := mesh.surface_get_arrays(s)
				var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
				for xf in xfs:
					for v in vs: pts.append(xf * v)
	lamps = _cluster(pts, 0.7)
	_build_halos()
	_build_flies()
	visible = false
	print("night: %d lamps, %d window materials, %d fireflies, %d ms" % [lamps.size(), windows, FLY_N, (Time.get_ticks_usec() - t0) / 1000])

# 1 window glass, 2 a lamp's globe, 0 neither
func _kind(sm: ShaderMaterial, glass: Array, lamp_cols: Array) -> int:
	var sh := sm.shader
	if sh == null or not String(sh.resource_path).contains("toon"): return 0
	var tex = sm.get_shader_parameter("albedo_tex")
	var use_tex = sm.get_shader_parameter("use_tex")
	if use_tex and tex is Texture2D:
		return 1 if glass.has(String((tex as Texture2D).resource_path).get_file()) else 0
	var c = sm.get_shader_parameter("albedo")
	if not c is Color: return 0
	for lc in lamp_cols:
		if absf(c.r - lc.r) + absf(c.g - lc.g) + absf(c.b - lc.b) < 0.02: return 2
	return 0

# points within r of each other become one lamp (its globe's middle)
func _cluster(pts: Array, r: float) -> Array:
	var cells := {}
	for p in pts:
		var k := Vector3i(floori(p.x / r), floori(p.y / r), floori(p.z / r))
		if not cells.has(k): cells[k] = [Vector3.ZERO, 0]
		cells[k][0] += p
		cells[k][1] += 1
	var out := []
	var used := {}
	for k in cells:
		if used.has(k): continue
		# gather the neighbouring cells into this lamp
		var sum := Vector3.ZERO
		var n := 0
		var stack := [k]
		while not stack.is_empty():
			var c: Vector3i = stack.pop_back()
			if used.has(c) or not cells.has(c): continue
			used[c] = true
			sum += cells[c][0]; n += cells[c][1]
			for dx in [-1, 0, 1]:
				for dy in [-1, 0, 1]:
					for dz in [-1, 0, 1]:
						var nb := c + Vector3i(dx, dy, dz)
						if cells.has(nb) and not used.has(nb): stack.append(nb)
		var p: Vector3 = sum / float(n)
		var g := _ground(p)
		out.append({"pos": p, "h": p.y - g, "g": g})
	return out

func _ground(p: Vector3) -> float:
	return main.world.height_at(p.x, p.z) if main.world else p.y - 3.0

func _build_halos() -> void:
	if lamps.is_empty(): return
	var hp := PackedVector3Array(); var huv := PackedVector2Array(); var hc := PackedVector2Array(); var hi := PackedInt32Array()
	var pp := PackedVector3Array(); var puv := PackedVector2Array(); var pi := PackedInt32Array()
	for l in lamps:
		var c: Vector3 = l.pos
		var high: bool = l.h > 2.4   # a street lamp; else a wall or porch lamp
		var s := 1.5 if high else 0.9
		var b := hp.size()
		for k in 4:
			var x := -1.0 if k == 0 or k == 3 else 1.0
			var y := -1.0 if k < 2 else 1.0
			hp.append(c); hc.append(Vector2(x, y) * s); huv.append(Vector2(x, y))
		hi.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
		# the pool on the ground: wider under a tall lamp
		var r := 4.2 if high else 2.4
		var g: float = l.g
		b = pp.size()
		for k in 4:
			var x2 := -1.0 if k == 0 or k == 3 else 1.0
			var z2 := -1.0 if k < 2 else 1.0
			var q := Vector3(c.x + x2 * r, 0.0, c.z + z2 * r)
			q.y = _ground(q) + 0.06
			q.y = maxf(q.y, g + 0.06)
			pp.append(q); puv.append(Vector2(x2, z2))
		pi.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	halos = _mesh("lamp_halos", HALO, {Mesh.ARRAY_VERTEX: hp, Mesh.ARRAY_TEX_UV: huv, Mesh.ARRAY_TEX_UV2: hc, Mesh.ARRAY_INDEX: hi}, 2)
	pools = _mesh("lamp_pools", POOL, {Mesh.ARRAY_VERTEX: pp, Mesh.ARRAY_TEX_UV: puv, Mesh.ARRAY_INDEX: pi}, 1)

# fireflies: anchors in Route 1's tall grass and along the fresh water
func _build_flies() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 151
	var anchors := []
	var w = main.world
	if w and w.grass_tex:
		var img: Image = w.grass_tex.get_image()
		var ga: Vector4 = w.grass_area
		var tall := []
		for j in range(0, img.get_height(), 2):
			for i in range(0, img.get_width(), 2):
				if img.get_pixel(i, j).g >= 1.5: tall.append(Vector2(ga.x + (i + 0.5) * ga.z / img.get_width(), ga.y + (j + 0.5) * ga.w / img.get_height()))
		for k in mini(int(FLY_N * 0.7), tall.size()):
			var p: Vector2 = tall[rng.randi() % tall.size()]
			anchors.append(Vector3(p.x, w.height_at(p.x, p.y), p.y))
	if main.water_root:
		var wv := []
		for mi in main.water_root.find_children("fresh*", "MeshInstance3D", true, false):
			var vs: PackedVector3Array = mi.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
			for v in vs: wv.append(mi.global_transform * v)
		while anchors.size() < FLY_N and not wv.is_empty():
			anchors.append(wv[rng.randi() % wv.size()] + Vector3(rng.randf_range(-2, 2), 0.0, rng.randf_range(-2, 2)))
	if anchors.is_empty(): return
	var vp := PackedVector3Array(); var uv := PackedVector2Array(); var col := PackedColorArray(); var idx := PackedInt32Array()
	for a in anchors:
		var c := Color(rng.randf(), rng.randf(), rng.randf(), rng.randf())
		var b := vp.size()
		for k in 4:
			vp.append(a); col.append(c)
			uv.append(Vector2(-1.0 if k == 0 or k == 3 else 1.0, -1.0 if k < 2 else 1.0))
		idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	flies = _mesh("fireflies", FLIES, {Mesh.ARRAY_VERTEX: vp, Mesh.ARRAY_TEX_UV: uv, Mesh.ARRAY_COLOR: col, Mesh.ARRAY_INDEX: idx}, 3)

func _mesh(nm: String, sh: Shader, arrays: Dictionary, prio: int) -> MeshInstance3D:
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	for k in arrays: a[k] = arrays[k]
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var mat := ShaderMaterial.new()
	mat.shader = sh
	mat.render_priority = prio
	var mi := MeshInstance3D.new()
	mi.name = nm
	mi.mesh = m
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-600, -50, -800), Vector3(1200, 200, 1600))
	add_child(mi)
	return mi

# daynight.gd, a few times a second: shown only while something glows outdoors
func apply(s: Dictionary, indoors: bool) -> void:
	var lit: float = s.get("lamps", 0.0)
	var ff: float = s.get("fireflies", 0.0)
	var on := not indoors and BattleArena.I == null and (lit > 0.001 or ff > 0.001)
	if on != _on:
		_on = on
		visible = on
	if flies: flies.visible = ff > 0.001
