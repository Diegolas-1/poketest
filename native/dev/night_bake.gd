extends SceneTree
# Dev only: finds the town's lamp globes painted in vertex colours (the merged
# town meshes carry most colours in their vertices, so a lamp's warm white is
# not a material night_fx.gd could spot) and writes their places to
# res://world/base/night_lamps.json, which night_fx.gd reads for its halos and
# pools. Run again after a re-bake of the town:
#   godot --headless --path native -s res://dev/night_bake.gd
const LAMPS := ["fff1c4", "ffe7a6", "fffbea", "fff3c0"]

func _init() -> void:
	var cols := []
	for c in LAMPS: cols.append(Color(c))
	var pts := []
	var verts := 0
	for f in WorldRegions.files("town.glb"):
		var n: Node = load(f).instantiate()
		for mi in n.find_children("*", "MeshInstance3D", true, false):
			var xf: Transform3D = Transform3D.IDENTITY
			var p: Node = mi
			while p and p is Node3D:
				xf = (p as Node3D).transform * xf
				p = p.get_parent()
			for s in mi.mesh.get_surface_count():
				var m: Material = mi.mesh.surface_get_material(s)
				if not (m and String(m.resource_name).contains("_vc")): continue
				var arr: Array = mi.mesh.surface_get_arrays(s)
				var vc = arr[Mesh.ARRAY_COLOR]
				if not vc is PackedColorArray: continue
				var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
				var base: Color = (m as BaseMaterial3D).albedo_color
				verts += vs.size()
				for i in vs.size():
					var c: Color = vc[i] * base
					for lc in cols:
						# the vertex colours may be stored linear or as sRGB
						if _near(c, lc) or _near(c.linear_to_srgb(), lc):
							pts.append(xf * vs[i])
							break
		n.free()
	var lamps := _cluster(pts, 0.6)
	var out := []
	for l in lamps: out.append([snappedf(l.x, 0.01), snappedf(l.y, 0.01), snappedf(l.z, 0.01)])
	var fa := FileAccess.open("res://world/base/night_lamps.json", FileAccess.WRITE)
	fa.store_string(JSON.stringify({"_doc": "The town's lamp globes painted in vertex colours (dev/night_bake.gd): x, y, z of each, for night_fx.gd.", "lamps": out}))
	print("night_bake: %d vertices scanned, %d lamp vertices, %d lamps, %d bigger patches left out" % [verts, pts.size(), out.size(), big])
	quit()

var big := 0

func _near(a: Color, b: Color) -> bool:
	return absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b) < 0.025

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
		var sum := Vector3.ZERO
		var n := 0
		var lo := Vector3i(k)
		var hi := Vector3i(k)
		var stack := [k]
		while not stack.is_empty():
			var c: Vector3i = stack.pop_back()
			if used.has(c) or not cells.has(c): continue
			used[c] = true
			sum += cells[c][0]; n += cells[c][1]
			lo = lo.min(c); hi = hi.max(c)
			for dx in [-1, 0, 1]:
				for dy in [-1, 0, 1]:
					for dz in [-1, 0, 1]:
						var nb := c + Vector3i(dx, dy, dz)
						if cells.has(nb) and not used.has(nb): stack.append(nb)
		# a lamp's globe is small: a bigger patch of that colour is a wall or a sign
		var ext := Vector3(hi - lo + Vector3i.ONE) * r
		if maxf(ext.x, maxf(ext.y, ext.z)) <= 1.5: out.append(sum / float(n))
		else: big += 1
	return out
