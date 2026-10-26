class_name WorldData
extends RefCounted
# The baked world (tools/native/bake.mjs): walk grid with heights and flags,
# colliders, path map, sea floor, grass map. Mirrors the web build's
# groundAt / step / collide in main.js. The world comes in regions
# (world_regions.gd), joined here into whole-world grids.

# walk grid flags (tools/native/bake.mjs)
const WATER := 1; const NO_WALK := 2; const DECK := 4; const SEA := 8; const SAND := 16; const LEDGE := 32
var meta: Dictionary
var gx0: float; var gz0: float; var gres: float; var gnx: int; var gnz: int
var heights: PackedByteArray   # uint16 cm + 2000, little endian
var flags: PackedByteArray
var colliders: Array = []      # [box?, x, z, hw|r, hd, rot]
var inst_xf: PackedFloat32Array   # the town's repeated parts: 15 floats a copy (meta.inst says whose)
var grass_tex: ImageTexture
var grass_area: Vector4
var path_tex: ImageTexture
var seabed_tex: ImageTexture
var sea_y := -0.7
var seabed: PackedFloat32Array   # terrain height every metre (seabed.bin)
var bed_x0 := -210.0; var bed_z0 := -210.0; var bed_n := 420

func load_all() -> void:
	meta = WorldRegions.meta().duplicate()
	var ins: Array = WorldRegions.inst()
	meta.inst = ins[0]
	inst_xf = ins[1]
	sea_y = meta.sea
	var g: Dictionary = meta.ground
	gx0 = g.x0; gz0 = g.z0; gres = g.res; gnx = int(g.nx); gnz = int(g.nz)
	var gb := WorldRegions.grid("ground", gnx, gnz, [2, 1])
	heights = gb.slice(0, gnx * gnz * 2)
	flags = gb.slice(gnx * gnz * 2)
	colliders = WorldRegions.colliders()
	# grass map: float pairs [height, density]
	var gm: Dictionary = meta.grassmap
	var gimg := Image.create_from_data(int(gm.nx), int(gm.nz), false, Image.FORMAT_RGF, WorldRegions.grid("grassmap", int(gm.nx), int(gm.nz), [8]))
	grass_tex = ImageTexture.create_from_image(gimg)
	grass_area = Vector4(gm.x0, gm.z0, gm.w, gm.d)
	var pm: Dictionary = meta.pathmap
	var pimg := Image.create_from_data(int(pm.nx), int(pm.nz), false, Image.FORMAT_RGBA8, WorldRegions.grid("pathmap", int(pm.nx), int(pm.nz), [4]))
	pimg.generate_mipmaps()
	path_tex = ImageTexture.create_from_image(pimg)
	var sb: Dictionary = meta.seabed
	var sbytes := WorldRegions.grid("seabed", int(sb.n), int(sb.n), [4])
	seabed = sbytes.to_float32_array()
	bed_x0 = sb.x0; bed_z0 = sb.z0; bed_n = int(sb.n)
	var simg := Image.create_from_data(int(sb.n), int(sb.n), false, Image.FORMAT_RF, sbytes)
	seabed_tex = ImageTexture.create_from_image(simg)

func _cell(x: float, z: float) -> int:
	var i := int((x - gx0) / gres)
	var j := int((z - gz0) / gres)
	if i < 0 or j < 0 or i >= gnx or j >= gnz: return -1
	return j * gnx + i

# ground height (bilinear between cell centres, so slopes stay smooth)
func height_at(x: float, z: float) -> float:
	var fx := (x - gx0) / gres - 0.5
	var fz := (z - gz0) / gres - 0.5
	var i := clampi(floori(fx), 0, gnx - 2)
	var j := clampi(floori(fz), 0, gnz - 2)
	var tx := clampf(fx - i, 0.0, 1.0)
	var tz := clampf(fz - j, 0.0, 1.0)
	var h00 := _h(j * gnx + i); var h10 := _h(j * gnx + i + 1)
	var h01 := _h((j + 1) * gnx + i); var h11 := _h((j + 1) * gnx + i + 1)
	# a step (stairs, a deck edge): no blending across it
	if maxf(maxf(h00, h10), maxf(h01, h11)) - minf(minf(h00, h10), minf(h01, h11)) > 0.12:
		var c := _cell(x, z)
		if c >= 0: return _h(c)
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)

func _h(k: int) -> float:
	return (heights.decode_u16(k * 2) - 2000) / 100.0

func flag(x: float, z: float) -> int:
	var c := _cell(x, z)
	return 255 if c < 0 else flags[c]

# web main.js step(): try to move, false when blocked; wade = Ash, who can walk
# into shallow water (can_wade); the townspeople and the Pokémon keep to the bridges
func step(pos: Vector3, dx: float, dz: float, wade := false) -> Vector3:
	var nx := pos.x + dx
	var nz := pos.z + dz
	var f := flag(nx, nz)
	if f == 255: return pos
	if (f & 1) and not (f & 4) and not (wade and can_wade(nx, nz)): return pos
	var here := flag(pos.x, pos.z)
	# wading: a bridge's deck is overhead, not a step up out of the stream
	if wade and (f & DECK) and here != 255 and (here & WATER) and not (here & DECK) and height_at(nx, nz) - pos.y > 0.45: return pos
	# Route 1's ledges (32): hop down them going south (+z), never climb them
	if (f & LEDGE) and (dz < -1e-4 if (here != 255 and (here & LEDGE)) else dz <= 1e-4): return pos
	if (f & 2) and not (here & 2): return pos
	var p := Vector3(nx, pos.y, nz)
	p = collide(p, preload("res://tunables.gd").num("player", "collide_r", 0.35))   # (world editor tunables)
	if (flag(p.x, p.z) & 2) and not (here & 2): return pos
	return p

func collide(p: Vector3, r := 0.35) -> Vector3:
	for c in colliders:
		var cx: float = c[1]; var cz: float = c[2]
		if absf(p.x - cx) > 12.0 or absf(p.z - cz) > 12.0: continue
		if c[0] == 1:
			var dx := p.x - cx; var dz := p.z - cz
			var rot: float = c[5]
			var cs := cos(rot); var sn := sin(rot)
			var lx := dx * cs - dz * sn; var lz := dx * sn + dz * cs
			var ox: float = c[3] + r - absf(lx); var oz: float = c[4] + r - absf(lz)
			if ox > 0.0 and oz > 0.0:
				var mx := 0.0; var mz := 0.0
				if ox < oz: mx = signf(lx) * ox
				else: mz = signf(lz) * oz
				p.x += mx * cs + mz * sn; p.z += -mx * sn + mz * cs
		else:
			var dx2 := p.x - cx; var dz2 := p.z - cz
			var d := sqrt(dx2 * dx2 + dz2 * dz2)
			var m: float = c[3] + r
			if d < m and d > 1e-4:
				p.x += dx2 / d * (m - d); p.z += dz2 / d * (m - d)
	return p

# terrain height from the 1 m sea-floor grid (outside it: deep sea)
func bed_at(x: float, z: float) -> float:
	var i := int(floor(x - bed_x0)); var j := int(floor(z - bed_z0))
	if i < 0 or j < 0 or i >= bed_n or j >= bed_n: return sea_y - 30.0
	return seabed[j * bed_n + i]

# ---------- wading (Ash only): the streams, Route 1's creeks, the pond's edge, the shore ----------
# The walk grid marks water (flag 1) but not its surface: the fresh water's surface
# (the pond, the stream, the creeks and their pools) is read off water.glb's fresh
# meshes at start (build_surface: their triangles rasterised onto a 0.5 m grid, only
# the cells they cover); the sea's is sea_y. Water is wadeable while it is no deeper
# than wade_fresh (the streams' channels are 0.7..1.0 m, the creeks' 0.55..0.8, the
# pond 1.4 at its middle) or, at sea, wade_sea (the shallow strip along the beach).
# Ash stands on a raised bed in it (ash_ground): the channel's depth scaled by
# vis_fresh, so the water comes up from his ankles at the bank to his shins and
# knees mid-stream.
const SURF_RES := 0.5
var surf := {}          # 0.5 m cell -> the fresh water's surface height
var s_nx := 0
var WADE_FRESH := preload("res://tunables.gd").num("body", "wade_fresh", 1.15)
var WADE_SEA := preload("res://tunables.gd").num("body", "wade_sea", 0.5)
var VIS_FRESH := preload("res://tunables.gd").num("body", "vis_fresh", 0.48)
var VIS_MAX := preload("res://tunables.gd").num("body", "vis_max", 0.5)

func build_surface(root: Node) -> void:
	surf.clear()
	s_nx = int(ceil(gnx * gres / SURF_RES)) + 1
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		if not String(mi.name).begins_with("fresh"): continue
		var xf: Transform3D = (mi as MeshInstance3D).global_transform if (mi as Node).is_inside_tree() else (mi as Node3D).transform
		var mesh: Mesh = (mi as MeshInstance3D).mesh
		for si in mesh.get_surface_count():
			var arr := mesh.surface_get_arrays(si)
			var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var ix: PackedInt32Array = arr[Mesh.ARRAY_INDEX] if arr[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
			if ix.is_empty():
				for i in vs.size(): ix.append(i)
			var w := PackedVector3Array()
			w.resize(vs.size())
			for i in vs.size(): w[i] = xf * vs[i]
			for t in range(0, ix.size() - 2, 3): _raster(w[ix[t]], w[ix[t + 1]], w[ix[t + 2]])

func _raster(a: Vector3, b: Vector3, c: Vector3) -> void:
	var i0 := floori((minf(a.x, minf(b.x, c.x)) - gx0) / SURF_RES)
	var i1 := floori((maxf(a.x, maxf(b.x, c.x)) - gx0) / SURF_RES)
	var j0 := floori((minf(a.z, minf(b.z, c.z)) - gz0) / SURF_RES)
	var j1 := floori((maxf(a.z, maxf(b.z, c.z)) - gz0) / SURF_RES)
	var den := (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
	if absf(den) < 1e-9: return
	for j in range(maxi(j0, 0), j1 + 1):
		for i in range(maxi(i0, 0), i1 + 1):
			var x := gx0 + (i + 0.5) * SURF_RES
			var z := gz0 + (j + 0.5) * SURF_RES
			var l1 := ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den
			var l2 := ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den
			var l3 := 1.0 - l1 - l2
			if l1 < -0.05 or l2 < -0.05 or l3 < -0.05: continue
			var k := j * s_nx + i
			var y := a.y * l1 + b.y * l2 + c.y * l3
			if not surf.has(k) or y > surf[k]: surf[k] = y

# the water's surface at (x, z), or NAN where there is no water (or a deck over it)
func water_surface(x: float, z: float) -> float:
	var f := flag(x, z)
	if f == 255 or not (f & WATER) or (f & DECK): return NAN
	if f & SEA: return sea_y
	var i := floori((x - gx0) / SURF_RES)
	var j := floori((z - gz0) / SURF_RES)
	var k := j * s_nx + i
	if surf.has(k): return surf[k]
	# the edge of a ribbon: the nearest covered cell within 1.5 m
	for r in [1, 2, 3]:
		for dj in range(-r, r + 1):
			for di in range(-r, r + 1):
				if maxi(absi(di), absi(dj)) != r: continue
				var k2 := (j + dj) * s_nx + i + di
				if surf.has(k2): return surf[k2]
	return NAN

# how deep the water really is here (surface minus bed; 0 on land)
func water_depth(x: float, z: float) -> float:
	var s := water_surface(x, z)
	if is_nan(s): return 0.0
	return maxf(0.0, s - height_at(x, z))

func can_wade(x: float, z: float) -> bool:
	var s := water_surface(x, z)
	if is_nan(s): return false
	var f := flag(x, z)
	return s - height_at(x, z) <= (WADE_SEA if (f & SEA) else WADE_FRESH)

# where Ash's feet are: the ground, or in wadeable water a raised bed that puts
# the surface at his ankles .. knees (the real depth scaled, at sea as it is)
func ash_ground(x: float, z: float) -> float:
	var h := height_at(x, z)
	var s := water_surface(x, z)
	if is_nan(s) or s <= h: return h
	var f := flag(x, z)
	var k := 1.0 if (f & SEA) else VIS_FRESH
	return s - minf((s - h) * k, VIS_MAX)
