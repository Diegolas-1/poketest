extends Node3D
# The plants (web veg.js, foliage.js, assets.js Scatter / Impostor): trees,
# bushes, hedges, ferns, flowers and rocks, baked once each by
# tools/native/bake.mjs (each region's veg.json + veg.bin, joined by
# WorldRegions.veg()) with where every copy stands.
# Copies are drawn as MultiMesh chunks; each plant fades on its own as a
# screen-door dither by its distance from the camera (veg.gdshaderinc), and
# far trees and bushes turn into billboards baked from the model. Whole
# chunks past their range are culled by Godot (visibility range), and only
# chunks near the camera cast shadows.

const LEAF := preload("res://shaders/veg_leaf.gdshader")
const SOLID := preload("res://shaders/veg_solid.gdshader")
const STONE := preload("res://shaders/veg_stone.gdshader")   # stone.js rocks, walls, the islet
const BILL := preload("res://shaders/veg_bill.gdshader")
const DIR := "res://world/"
const CHUNK := 48.0        # model chunks (m); kinds may set their own ("chunk")
const BILL_CHUNK := 64.0   # billboard chunks (m)
const FADE_W := 2.5        # a plant hands over to its billboard over this many metres (a short band: nobody stands half dissolved)

var meshes: Array = []     # ArrayMesh per baked mesh
var mats: Array = []       # [ShaderMaterial] per baked material (one per set, see _set_mat)
var chunks: Array = []     # {node, c: Vector3, r, shadow: float (0 = never)}
var shadow_far := 60.0     # plants cast shadows nearer than this (to the chunk's edge): the sun's shadow distance
# Where each kind of plant hands over to its billboard (or fades out), at
# view distance 1.0, and how far it casts shadows (times shadow_far / 45).
# Every kind that casts does so out to the sun's whole shadow distance: a chunk
# switching its casters on nearer than that made its shadows pop in and out
# (on the ground and on other plants) as the camera walked; past the shadow
# distance Godot draws no shadow anyway, and it fades them out before it.
# Closer than the web's ranges: leaf cards pile up many layers of cut-out
# pixels, which a phone's GPU cannot sort away, while a billboard is one
# layer; at these distances a bush is ~50 px and a tree ~200 px tall on a
# phone, the billboards' own size. (web veg.js: trees 75, bushes 70,
# ferns 60, flowers 55 x its view distance; the town's bushes never faded)
const KINDS := {
	"tree": {"fade": Vector2(48, 50.5), "shadow": 45.0, "ink": 48.0, "chunk": 24.0},   # (billboarded kinds fade over FADE_W)
	"bush": {"fade": Vector2(25, 27.5), "shadow": 45.0, "ink": 24.0, "chunk": 24.0},
	# (ink: metres from the camera the plants' ink reaches; ink_w its width, thinner
	# on the small plants of the ground, which stand in their hundreds)
	"fern": {"fade": Vector2(38, 42), "shadow": 0.0, "ink": 18.0, "ink_w": 1.1, "chunk": 24.0},
	"flower": {"fade": Vector2(32, 36), "shadow": 0.0, "ink": 16.0, "ink_w": 1.0, "chunk": 24.0},
	"rock": {"fade": Vector2(-1, -1), "shadow": 45.0},   # (-1: keep the baked range)
}
var last_pos := Vector3(INF, INF, INF)
var last_ink := false
var _synced := false
# the chunks that cast shadows or carry leaf ink, in a coarse grid by where they
# stand, so a camera move looks only at the ones in reach (and those switched
# on last time) instead of walking every chunk; their numbers in packed arrays
# (x, z, radius, shadow factor, ink distance; state: 1 ink on, 2 shadow on)
const GRID := 32.0
var _grid := {}          # Vector2i -> PackedInt32Array of chunk indices
var _on := PackedInt32Array()   # chunks with shadows or ink switched on
var _px := PackedFloat32Array(); var _pz := PackedFloat32Array(); var _pr := PackedFloat32Array()
var _pk := PackedFloat32Array(); var _pi := PackedFloat32Array()
var _st := PackedByteArray()
var _mark := PackedInt32Array()
var _stamp := 0
var _reach_r := 0.0      # the largest chunk radius in the grid
var _reach_k := 0.0      # the largest shadow factor
var _reach_ink := 0.0    # the largest ink distance
var stats := {"chunks": 0, "bill": 0, "copies": 0}
# what others borrowing a set need for its billboard (the Battle Arena's trees):
# set index -> {imp, w, bottom, h}; bill_mat: the billboards' shared material
var set_bill := {}
var bill_mat: ShaderMaterial

static func _rgb(hex: String) -> Color:
	return Color(hex)

func build(lod: float = 1.0, trees: float = 1.0, plants: float = 1.0) -> void:
	var vb: Array = WorldRegions.veg()
	var meta: Dictionary = vb[0]
	var bin: PackedByteArray = vb[1]
	if meta.is_empty(): return
	var f32 := func(r: Array) -> PackedByteArray: return bin.slice(int(r[0]), int(r[0]) + int(r[1]) * 4)
	# wood gets levels of detail (a tree's limbs are three quarters of its
	# triangles and mostly hidden in the crown); leaf cards never (the
	# simplifier would melt them)
	var lods_for := {}
	for st in meta.sets:
		for pp in st.parts:
			if meta.mats[int(pp.mat)].kind == "bark": lods_for[int(pp.mesh)] = true
	for e in meta.meshes:
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = f32.call(e.pos).to_vector3_array()
		a[Mesh.ARRAY_NORMAL] = f32.call(e.nrm).to_vector3_array()
		if e.has("uv"):
			var uv: PackedVector2Array = f32.call(e.uv).to_vector2_array()
			# bakes before uvDown kept three's v up (canvas textures are flipped there)
			if not meta.get("uvDown", false):
				for i in uv.size(): uv[i].y = 1.0 - uv[i].y
			a[Mesh.ARRAY_TEX_UV] = uv
		if e.has("col"): a[Mesh.ARRAY_COLOR] = f32.call(e.col).to_color_array()
		if e.has("flt"): a[Mesh.ARRAY_TEX_UV2] = f32.call(e.flt).to_vector2_array()
		# three.js fronts are counter-clockwise, Godot's clockwise: flip every
		# triangle (else culling keeps the far side and stones look hollow)
		var idx: PackedInt32Array = f32.call(e.idx).to_int32_array() if e.has("idx") else PackedInt32Array(range(int(e.v)))
		for t in range(0, idx.size() - 2, 3):
			var k: int = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k
		a[Mesh.ARRAY_INDEX] = idx
		meshes.append(_mesh(a, lods_for.has(meshes.size())))
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
			var p := Vector3(ip[i * 5], ip[i * 5 + 1], ip[i * 5 + 2])
			# (by where it stands: the same plants at any density, whatever the order of the sets)
			if dens < 1.0 and _hash(floori(p.x * 8.0) * 73856093 ^ floori(p.z * 8.0) * 19349663 ^ int(s.n)) >= dens: continue
			var csz: float = KINDS[kind].get("chunk", CHUNK)
			var k := Vector2i(floori(p.x / csz), floori(p.z / csz))
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
			holder.name = "%s_%d_%d_%d" % [kind, si, k.x, k.y]
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
				var ch := {"node": mi, "c": c, "r": r, "shadow": shadow_k, "ink": null, "ink_d": float(KINDS[kind].get("ink", 0.0)), "sh": null}
				chunks.append(ch)
				# leaves cast their shadow from a lighter copy: a third of the
				# cards, each grown to cover about as much (a shadow shows the
				# crown's shape, not its cards)
				if shadow_k > 0.0 and (part_mats[pi].shader == LEAF or shadow_meshes.has(int(s.parts[pi].mesh))):
					var smm := MultiMesh.new()
					smm.transform_format = MultiMesh.TRANSFORM_3D
					smm.mesh = _shadow_mesh(int(s.parts[pi].mesh))
					smm.instance_count = ids.size()
					for j in ids.size(): smm.set_instance_transform(j, mm.get_instance_transform(j))
					var sh := MultiMeshInstance3D.new()
					sh.multimesh = smm
					sh.material_override = part_mats[pi]
					sh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
					sh.visible = false
					sh.extra_cull_margin = 1.0
					holder.add_child(sh)
					ch.sh = sh
				# ink (ink.gd), swaying with the plant and gone with its model: leaf
				# cards get one silhouette per plant (trees, bushes, ferns and
				# flowers), wood (trunks and limbs) and solid crops an inverted hull
				var ink_d: float = float(KINDS[kind].get("ink", 0.0))
				if ink_d > 0.0 and ink:
					var im: ShaderMaterial = null
					if part_mats[pi].shader == LEAF:
						var lo := {"double_sided": true}
						if KINDS[kind].has("ink_w"): lo.width = KINDS[kind].ink_w
						im = ink.outline_plant(mi, mm.mesh.get_aabb().get_center(), lo)
						if im:
							im.set_shader_parameter("leaf_wind", part_mats[pi].get_shader_parameter("wind"))
							im.set_shader_parameter("leaf_fade", fade)
					elif part_mats[pi].shader == SOLID and (kind == "tree" or kind == "bush"):
						im = ink.outline_mesh(mi, {"width": 1.0})
						if im:
							im.set_shader_parameter("veg", true)
							im.set_shader_parameter("veg_wind", part_mats[pi].get_shader_parameter("wind"))
							im.set_shader_parameter("veg_fade", fade)
					if im:
						# each plant's ink thins to nothing before the chunk's ink is
						# switched off (update), so no chunk's lines pop; a tree's
						# just as its billboard (which carries its own ink line:
						# veg_bill.gdshader) takes over
						im.set_shader_parameter("ink_far", Vector2(ink_d - 3.0 if kind == "tree" else ink_d * 0.75, ink_d))
						ch.ink = im
				stats.chunks += 1
			stats.copies += ids.size()
		if s.impostor != null:
			var imp: Dictionary = meta.impostors[int(s.impostor)]
			# (a copy's billboard turns with the azimuth of its basis' z: Basis(UP, rot))
			set_bill[si] = {"imp": int(s.impostor), "w": float(imp.w) * 0.5, "bottom": float(imp.bottom), "h": float(imp.h)}
			for k in bbins:
				for i in bbins[k]:
					bills.append([Vector3(ip[i * 5], ip[i * 5 + 1], ip[i * 5 + 2]), ip[i * 5 + 3], ip[i * 5 + 4], int(s.impostor), fade.x,
						float(imp.w) * 0.5, float(imp.bottom), float(imp.h), float(s.far[1])])
	_billboards(meta, bills, tex.call("plants/bill.png"))
	_index()

func _index() -> void:
	_grid = {}
	var n := chunks.size()
	for a in [_px, _pz, _pr, _pk, _pi]: a.resize(n)
	_st.resize(n); _st.fill(0)
	_mark.resize(n); _mark.fill(0)
	for i in n:
		var ch: Dictionary = chunks[i]
		var c: Vector3 = ch.c
		_px[i] = c.x; _pz[i] = c.z; _pr[i] = float(ch.r); _pk[i] = float(ch.shadow)
		_pi[i] = float(ch.ink_d) if ch.ink != null else -1.0
		if ch.shadow <= 0.0 and ch.ink == null: continue
		var k := Vector2i(floori(c.x / GRID), floori(c.z / GRID))
		if not _grid.has(k): _grid[k] = PackedInt32Array()
		_grid[k].append(i)
		_reach_r = maxf(_reach_r, float(ch.r))
		_reach_k = maxf(_reach_k, float(ch.shadow))
		if ch.ink != null: _reach_ink = maxf(_reach_ink, float(ch.ink_d))

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
	bill_mat = bm
	bm.shader = BILL
	bm.set_shader_parameter("map", atlas)
	bm.set_shader_parameter("imp_rect", rects)
	bm.set_shader_parameter("imp_geo", geos)
	bm.set_shader_parameter("fade_w", FADE_W)
	var ink_n = get_node_or_null("/root/Ink")
	if ink_n: ink_n.track(bm, 1.1)   # (a line inside each billboard's edge: veg_bill.gdshader)
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
	elif d.kind == "stone":
		m.shader = STONE
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

# shadow stand-ins: for leaves every third card (4 vertices, 6 indices each),
# grown 1.6x about its middle; for wood a coarse level of detail (_mesh)
var shadow_meshes := {}
func _shadow_mesh(id: int) -> ArrayMesh:
	if shadow_meshes.has(id): return shadow_meshes[id]
	var src: ArrayMesh = meshes[id]
	var a: Array = src.surface_get_arrays(0)
	var v: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
	var keep := PackedInt32Array()
	var n := v.size() / 4
	for q in n:
		if q % 3 != 0: continue
		var c := (v[q * 4] + v[q * 4 + 1] + v[q * 4 + 2] + v[q * 4 + 3]) * 0.25
		for k in 4: v[q * 4 + k] = c + (v[q * 4 + k] - c) * 1.6
		keep.append_array([q * 4, q * 4 + 2, q * 4 + 1, q * 4, q * 4 + 3, q * 4 + 2])   # (Godot's winding)
	a[Mesh.ARRAY_VERTEX] = v
	a[Mesh.ARRAY_INDEX] = keep
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	shadow_meshes[id] = m
	return m

func _mesh(a: Array, lods: bool) -> ArrayMesh:
	if not lods:
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
		return m
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, a)
	im.generate_lods(25.0, 60.0, [])
	# the wood's shadow: about an eighth of its triangles (a shadow shows the
	# limbs' shape, not their roundness)
	var nl := im.get_surface_lod_count(0)
	if nl > 0:
		var sa := a.duplicate()
		sa[Mesh.ARRAY_INDEX] = im.get_surface_lod_indices(0, mini(2, nl - 1))
		var sm := ArrayMesh.new()
		sm.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, sa)
		shadow_meshes[meshes.size()] = sm
	return im.get_mesh()

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
	if (m.kind == "rock" or m.kind == "stone") and s.parts.size() == 1 and s.impostor == null: return "rock"   # (crops: solid but billboarded, as bushes)
	if s.impostor != null: return "tree" if float(s.radius) > 2.5 else "bush"
	return "fern" if float(s.fade[1]) > 58.0 else "flower"

static func _hash(i: int) -> float:
	var h := (i * 374761393 + 668265263) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	return float((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0

# every frame: where the camera is (fades), which chunks cast shadows
func update(cam_pos: Vector3) -> void:
	RenderingServer.global_shader_parameter_set("veg_cam", cam_pos)
	var ink = get_node_or_null("/root/Ink")
	var ink_on: bool = ink != null and ink.enabled and ink.quality >= 0.75
	# the chunk switches only change every metre or so: skip the walk otherwise
	if cam_pos.distance_squared_to(last_pos) < 0.25 and ink_on == last_ink: return
	if ink_on != last_ink or not _synced: _resync(); _synced = true
	last_pos = cam_pos; last_ink = ink_on
	# the chunks that may need a switch: those in reach now, and those on before
	var reach := maxf(shadow_far * _reach_k, _reach_ink) + _reach_r + GRID
	var lo := Vector2i(floori((cam_pos.x - reach) / GRID), floori((cam_pos.z - reach) / GRID))
	var hi := Vector2i(floori((cam_pos.x + reach) / GRID), floori((cam_pos.z + reach) / GRID))
	_stamp += 1
	_next = PackedInt32Array()
	_switch(_on, cam_pos, ink_on)
	for gx in range(lo.x, hi.x + 1):
		for gz in range(lo.y, hi.y + 1):
			var cell = _grid.get(Vector2i(gx, gz))
			if cell != null: _switch(cell, cam_pos, ink_on)
	_on = _next

# what each chunk has switched on, read back from the nodes (at the start, and
# when the Ink setting changes: Ink switches every plant's ink itself then)
func _resync() -> void:
	_on = PackedInt32Array()
	for i in chunks.size():
		var ch: Dictionary = chunks[i]
		var st := 0
		if ch.ink != null and ch.node.material_overlay != null: st = 1
		if ch.sh != null: st |= 2 if ch.sh.visible else 0
		elif ch.node.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_OFF: st |= 2
		_st[i] = st
		if st != 0: _on.append(i)

var _next := PackedInt32Array()
func _switch(list: PackedInt32Array, cam_pos: Vector3, ink_on: bool) -> void:
	var sf := shadow_far
	for idx in list:
		if _mark[idx] == _stamp: continue
		_mark[idx] = _stamp
		var dx := _px[idx] - cam_pos.x; var dz := _pz[idx] - cam_pos.z
		var d := sqrt(dx * dx + dz * dz) - _pr[idx]
		# leaf ink only on chunks near the camera (the ink pass draws every
		# card again, and far off it has thinned to nothing anyway)
		var want := 0
		if _pi[idx] >= 0.0 and ink_on and d < _pi[idx]: want = 1
		if _pk[idx] > 0.0 and d < sf * _pk[idx]: want |= 2
		if want != 0: _next.append(idx)
		var was := _st[idx]
		if want == was: continue
		_st[idx] = want
		var ch: Dictionary = chunks[idx]
		if (want & 1) != (was & 1): ch.node.material_overlay = ch.ink if want & 1 else null
		if (want & 2) != (was & 2):
			if ch.sh != null: ch.sh.visible = want & 2 != 0
			else: ch.node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if want & 2 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
