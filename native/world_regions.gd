class_name WorldRegions
extends RefCounted
# The baked world in regions (tools/native/regions.mjs): each region of the
# map is its own folder res://world/r/<id>/ and its own over-the-air pack, so
# a change in one area downloads only that area. Here they are joined back
# into the same data the game used when the world was one set of files:
#   res://world/base/world.json   sizes of the grids, spawn, sea, mountains,
#                                 Cinnabar, and the region list (load order)
#   res://world/r/<id>/region.json colliders, repeated parts (inst), grid
#                                 tiles, ink mesh lists; plus town.glb,
#                                 terrain.glb, inst.bin, veg.json/.bin,
#                                 ink.bin and the grid tiles (<grid>.bin)
#   res://world/plants/           the plants' pictures and plants.json
# Every region is loaded at start (as the single files were). Regions could be
# streamed later: everything here is per region until it is joined.

const DIR := "res://world/"
const BASE := DIR + "base/"
const PLANTS := DIR + "plants/"

static var _meta: Dictionary = {}
static var _regions: Array = []

static func _json(path: String) -> Variant:
	if not FileAccess.file_exists(path): return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))

# base/world.json
static func meta() -> Dictionary:
	if _meta.is_empty():
		var m = _json(BASE + "world.json")
		_meta = m if m is Dictionary else {}
	return _meta

# the regions in load order: region.json plus "dir"
static func regions() -> Array:
	if _regions.is_empty():
		for id in meta().get("regions", []):
			var d := DIR + "r/" + String(id) + "/"
			var r = _json(d + "region.json")
			if not r is Dictionary:
				push_warning("world: region %s is missing" % id)
				continue
			r.dir = d
			_regions.append(r)
	return _regions

# a file every region may have, for those that have it
static func files(name: String) -> PackedStringArray:
	var out := PackedStringArray()
	for r in regions():
		if FileAccess.file_exists(r.dir + name): out.append(r.dir + name)
	return out

# a whole-world grid from the regions' tiles; planes = bytes per cell of each
# plane, stored one after the other (ground: 2 height bytes, then 1 flag byte)
static func grid(key: String, nx: int, nz: int, planes: Array) -> PackedByteArray:
	var tiles := []
	for r in regions():
		var t = r.get("tiles", {}).get(key)
		if t == null: continue
		tiles.append({"i0": int(t[0]), "j0": int(t[1]), "w": int(t[2]), "h": int(t[3]), "b": FileAccess.get_file_as_bytes(r.dir + key + ".bin")})
	tiles.sort_custom(func(a, b): return a.i0 < b.i0)
	var out := PackedByteArray()
	var cells := 0
	for t in tiles: cells += t.w * t.h
	var per := 0
	for b in planes: per += int(b)
	if cells != nx * nz:
		push_error("world: the %s tiles cover %d of %d cells" % [key, cells, nx * nz])
		out.resize(nx * nz * per)
		return out
	var poff := 0   # where this plane starts in a tile (in cells x bytes)
	for b in planes:
		var row := 0
		while row < nz:
			# the tiles of this band of rows, west to east
			var band := tiles.filter(func(t): return row >= t.j0 and row < t.j0 + t.h)
			var end := nz
			for t in band: end = mini(end, t.j0 + t.h)
			for t2 in tiles:
				if t2.j0 > row: end = mini(end, t2.j0)
			for j in range(row, end):
				for t in band:
					var o: int = poff * t.w * t.h + (j - t.j0) * t.w * int(b)
					out.append_array(t.b.slice(o, o + t.w * int(b)))
			row = end
		poff += int(b)
	if out.size() != nx * nz * per: push_error("world: %s is %d bytes, not %d" % [key, out.size(), nx * nz * per])
	return out

static func colliders() -> Array:
	var out := []
	for r in regions(): out.append_array(r.get("colliders", []))
	return out

# the town's repeated parts: [entries {node, off, n, color, shadow}, float32
# copies (15 floats each)], one entry per part over every region
static func inst() -> Array:
	var by := {}
	var order := []
	for r in regions():
		var list: Array = r.get("inst", [])
		if list.is_empty(): continue
		var xf := FileAccess.get_file_as_bytes(r.dir + "inst.bin")
		for e in list:
			var k := String(e.node)
			if not by.has(k):
				by[k] = {"node": k, "color": e.color, "shadow": e.get("shadow", true), "b": PackedByteArray()}
				order.append(k)
			var b: PackedByteArray = by[k].b
			b.append_array(xf.slice(int(e.off) * 60, (int(e.off) + int(e.n)) * 60))
			by[k].b = b
	var list2 := []
	var all := PackedByteArray()
	for k in order:
		var e: Dictionary = by[k]
		list2.append({"node": k, "off": all.size() / 60, "n": e.b.size() / 60, "color": e.color, "shadow": e.shadow})
		all.append_array(e.b)
	return [list2, all.to_float32_array()]

static func ink_meshes() -> Dictionary:
	var out := {"hull": [], "leaf": []}
	for r in regions():
		var m: Dictionary = r.get("ink_meshes", {})
		for k in ["hull", "leaf"]: out[k].append_array(m.get(k, []))
	return out

# The plants of every region as one veg.json + veg.bin of the old layout
# (meshes, mats, sets with [byte offset, count] into the bin, impostors,
# billSize, uvDown): [meta, bin]. Sets that are the same plant in several
# regions become one set again. Without meshes, only the copies' places (ip)
# are read (for the sounds).
static func veg(with_meshes := true) -> Array:
	var plants = _json(PLANTS + "plants.json")
	if not plants is Dictionary: return [{}, PackedByteArray()]
	var meta := {"meshes": [], "mats": [], "sets": [], "impostors": plants.impostors, "billSize": plants.billSize, "uvDown": plants.get("uvDown", true)}
	var imp_of := {}
	for i in plants.impostors.size(): imp_of[String(plants.impostors[i].id)] = i
	var bin := PackedByteArray()
	var mesh_of := {}
	var mat_of := {}
	var sets := {}   # key -> {def, xf: PackedByteArray, ip: PackedByteArray, n}
	var keys := []
	for r in regions():
		var vj = _json(r.dir + "veg.json")
		if not vj is Dictionary: continue
		var rb := PackedByteArray()
		var f: FileAccess = null
		if with_meshes:
			rb = FileAccess.get_file_as_bytes(r.dir + "veg.bin")
			var at := bin.size()
			bin.append_array(rb)
			for e in vj.meshes:
				var m: Dictionary = e.duplicate()
				for k in ["pos", "nrm", "uv", "col", "flt", "idx"]:
					if m.has(k): m[k] = [int(m[k][0]) + at, m[k][1]]
				mesh_of[String(e.id)] = meta.meshes.size()
				meta.meshes.append(m)
		else:
			f = FileAccess.open(r.dir + "veg.bin", FileAccess.READ)
			if f == null: continue
		for s in vj.sets:
			var k := String(s.key)
			if not sets.has(k):
				sets[k] = {"def": s, "xf": PackedByteArray(), "ip": PackedByteArray(), "n": 0}
				keys.append(k)
			var e2: Dictionary = sets[k]
			var ip: PackedByteArray
			if f:
				f.seek(int(s.ip[0])); ip = f.get_buffer(int(s.ip[1]) * 4)
			else:
				ip = rb.slice(int(s.ip[0]), int(s.ip[0]) + int(s.ip[1]) * 4)
				var xb: PackedByteArray = e2.xf
				xb.append_array(rb.slice(int(s.xf[0]), int(s.xf[0]) + int(s.xf[1]) * 4))
				e2.xf = xb
			var ib: PackedByteArray = e2.ip
			ib.append_array(ip)
			e2.ip = ib
			e2.n = int(e2.n) + int(s.n)
	keys.sort()
	for k in keys:
		var e: Dictionary = sets[k]
		var s: Dictionary = e.def.duplicate()
		var parts := []
		var ok := true
		for p in s.parts:
			var mk := JSON.stringify(p.mat)
			if not mat_of.has(mk):
				var md: Dictionary = p.mat.duplicate()
				if md.get("tex") != null: md.tex = "plants/" + String(md.tex)
				mat_of[mk] = meta.mats.size()
				meta.mats.append(md)
			var mi = mesh_of.get(String(p.mesh), -1)
			if with_meshes and mi < 0: ok = false
			parts.append({"mesh": mi, "mat": mat_of[mk]})
		if not ok:
			push_warning("world: a plant set has a missing model (%s)" % k)
			continue
		s.parts = parts
		s.impostor = imp_of.get(String(s.impostor), null) if s.get("impostor") != null else null
		s.xf = [bin.size(), e.xf.size() / 4]
		bin.append_array(e.xf)
		s.ip = [bin.size(), e.ip.size() / 4]
		bin.append_array(e.ip)
		s.n = e.n
		s.erase("key")
		meta.sets.append(s)
	return [meta, bin]
