class_name ArenaRegion
extends Node3D
# One of the Battle Arena's regions, built (arena/arena.gd makes one per def,
# ArenaRegions): its grove or shore from the palette its def counts out
# (props {kind: n}): the baked trees, bushes, ferns and rocks borrowed from
# scenery (as the hub's), and the props library's own (props/forest/: logs,
# stumps, toadstools, ferns, limbs, litter, sun shafts), scattered off its trail
# and out of its clearings, every tree and bush a collider and a hiding place
# (arena.hides); signs; then its life (def.life: a script with its own
# mechanics, setup_(arena, region)). Cheap on Mobile: a MultiMesh per prop and
# chunk, the litter and the limbs one mesh each per chunk, nothing past range.
#
#   region.def            its def          region.life        its mechanics node (or null)
#   region.trees          every tree: {at (world), set, sc, h, cr, cy0, cy1, trunk}
#   region.search         the trees a forest's life may hide things in (a subset)
#   region.tree_at(id)    a named tree ("hive", "nest"): its entry

const RANGE := 95.0            # a region's props past this from the camera are dropped (m)

var arena                       # BattleArena
var def := {}
var life: Node = null
var trees: Array = []
var search: Array = []
var named := {}
var rng := RandomNumberGenerator.new()
var _rc: Rect2
var _walk: Rect2
var _clear: Array = []
var _taken: Array = []          # [x, z, r] (local) spots already used

func build(a, d: Dictionary) -> void:
	arena = a
	def = d
	name = "Region_" + String(d.id)
	_rc = ArenaRegions.rect(d)
	_walk = ArenaRegions.walk_rect(d)
	_clear = d.get("clear", [])
	rng.seed = hash(String(d.id)) & 0x7fffffff
	PropMats.setup(arena.game)
	var P: Dictionary = d.get("props", {})
	var sets: Dictionary = arena._veg_sets(["tree", "bush", "fern", "flower", "rock"])
	_features_first()
	_trees(sets, P)
	_undergrowth(sets, P)
	_forest_props(P)
	_signs()
	if d.has("life") and ResourceLoader.exists(String(d.life)):
		life = load(String(d.life)).new()
		life.name = "Life"
		add_child(life)
		life.setup_(arena, self)

func w(x: float, z: float) -> Vector3: return arena.w(x, z)

func tree_at(id: String) -> Dictionary: return named.get(id, {})

# ---------- where things may go ----------
func on_trail(x: float, z: float, m := 0.0) -> bool:
	return arena.data.dirt_sd(x, z) < m

func in_clear(x: float, z: float, m := 0.0) -> bool:
	for c in _clear:
		if Vector2(x - float(c[0]), z - float(c[1])).length() < float(c[2]) + m: return true
	return false

func free_at(x: float, z: float, r: float) -> bool:
	for t in _taken:
		if Vector2(x - float(t[0]), z - float(t[1])).length() < r + float(t[2]): return false
	return true

func take(x: float, z: float, r: float) -> void: _taken.append([x, z, r])

func _rand_in(rc: Rect2) -> Vector2:
	return Vector2(rng.randf_range(rc.position.x, rc.end.x), rng.randf_range(rc.position.y, rc.end.y))

# ---------- the trees ----------
# the hive's and the nest's trees first (the biggest), then the grove: well spread,
# off the trail and out of the clearings; then the border, two rows round the
# walk and more up the hills
func _features_first() -> void:
	for k in ["hive", "nest"]:
		if def.has(k):
			var at: Array = def[k].at
			take(float(at[0]), float(at[1]), 3.5)

func _tree_sets(sets: Dictionary) -> Array:
	var out := []
	for s in sets.get("tree", []):
		if s.h < 8.5 or s.h > 24.0 or s.w < 8.0: continue
		var autumn := false
		var birch := false
		for p in s.parts:
			var m = p.mat
			if not m is ShaderMaterial: continue
			var tx = (m as ShaderMaterial).get_shader_parameter("albedo_tex")
			if tx and String((tx as Texture2D).resource_path).contains("autumn"): autumn = true
			var bt = (m as ShaderMaterial).get_shader_parameter("bark_tex")
			if bt and String((bt as Texture2D).resource_path).contains("3da778"): birch = true
		if not autumn and not birch: out.append(s)
	return out

# the crown of a set: the leaf cards' box (scaled by the set's own scale)
static func crown(s: Dictionary) -> Dictionary:
	var box := AABB()
	var first := true
	for p in s.parts:
		if not (p.mat is ShaderMaterial and (p.mat as ShaderMaterial).shader == preload("res://veg.gd").LEAF): continue
		var bb: AABB = Transform3D(Basis.from_scale(s.scale), Vector3.ZERO) * (p.mesh as Mesh).get_aabb()
		box = bb if first else box.merge(bb)
		first = false
	if first: return {"cy0": s.h * 0.45, "cy1": s.h, "cr": s.w * 0.5}
	return {"cy0": box.position.y, "cy1": box.end.y, "cr": maxf(box.size.x, box.size.z) * 0.5}

func _trees(sets: Dictionary, P: Dictionary) -> void:
	var list := _tree_sets(sets)
	if list.is_empty(): list = sets.get("tree", [])
	if list.is_empty(): return
	# a palette of a few sets only (a draw call per set and chunk), the lighter ones (leaf
	# cards cost the most on a phone), spread over their heights
	for s in list: s.tris = _tris(s)
	if A_DEBUG: for s in list: print("  set %s h %.1f w %.1f tris %d" % [s.name, s.h, s.w, s.tris])
	var light := list.filter(func(s): return int(s.tris) <= int(P.get("max_tris", 9000)))
	if light.size() >= 3: list = light
	list.sort_custom(func(a, b): return a.h < b.h)
	var np := int(P.get("palette", 5))
	if list.size() > np:
		var pick := []
		for i in np: pick.append(list[int(round(float(i) * (list.size() - 1) / maxf(1, np - 1)))])
		list = pick
	var big := list.duplicate()
	big.sort_custom(func(a, b): return a.h * a.w > b.h * b.w)
	var place := {}
	var add := func(s: Dictionary, x: float, z: float, sc: float, collide: bool, tag := "") -> Dictionary:
		var key := String(s.name)
		if not place.has(key): place[key] = {"set": s, "xf": []}
		var yaw := rng.randf() * TAU
		var b := Basis(Vector3.UP, yaw) * Basis.from_scale(s.scale * sc)
		var at := w(x, z)
		place[key].xf.append(Transform3D(b, at - Vector3(0, 0.08, 0)))
		var cw := crown(s)
		var e := {"at": at, "set": s, "sc": sc, "yaw": yaw, "h": s.h * sc, "cr": float(cw.cr) * sc, "cy0": float(cw.cy0) * sc, "cy1": float(cw.cy1) * sc,
			"trunk": clampf(0.28 * sc * s.w / 8.0, 0.25, 0.6), "tag": tag, "local": Vector2(x, z)}
		if collide:
			arena.data.add_circle(x, z, float(e.trunk) + 0.2)
			arena.hides.append({"at": at, "kind": "tree", "r": e.h, "zone": String(def.id)})
		trees.append(e)
		return e
	# the named trees: the biggest sets, a little bigger still
	for k in ["hive", "nest"]:
		if not def.has(k): continue
		var at: Array = def[k].at
		named[k] = add.call(big[0] if k == "hive" else big[mini(1, big.size() - 1)], float(at[0]), float(at[1]), 1.15 if k == "hive" else 1.0, true, k)
	# the grove
	var inner := _walk.grow(-1.0)
	var want := int(P.get("trees", 50))
	var tries := 0
	var n := 0
	while n < want and tries < want * 40:
		tries += 1
		var p := _rand_in(inner)
		var sc := rng.randf_range(0.85, 1.25)
		if on_trail(p.x, p.y, 2.6) or in_clear(p.x, p.y, 1.5): continue
		if not free_at(p.x, p.y, 3.0 * sc): continue
		take(p.x, p.y, 2.2 * sc)
		add.call(list[rng.randi() % list.size()], p.x, p.y, sc, true)
		n += 1
	# the border: rows just past the walk's edge (a wall of trunks), then up the hills
	var rows := int(P.get("border", 2))
	for row in rows + 1:
		var off := 1.6 + row * 4.6
		var step := 4.4 + row * 0.9
		var rr := _walk.grow(off)
		var per := 2.0 * (rr.size.x + rr.size.y)
		var m := int(per / step)
		for k in m:
			var u := (k + rng.randf_range(-0.3, 0.3)) / m * per
			var p := _perimeter(rr, u)
			p += Vector2(rng.randf_range(-1.2, 1.2), rng.randf_range(-1.2, 1.2))
			# (the hub's side stays open at the gate; nothing over the hub's fence)
			if absf(p.x) < ArenaData.FENCE + 3.0 and absf(p.y) < ArenaData.FENCE + 3.0: continue
			if on_trail(p.x, p.y, 2.4): continue
			if row >= rows and rng.randf() < 0.5: continue
			var sc := rng.randf_range(0.95, 1.35) * (1.0 + row * 0.06)
			add.call(list[rng.randi() % list.size()], p.x, p.y, sc, row < rows)
	var tris := 0
	for key in place: tris += _tris(place[key].set) * (place[key].xf as Array).size()
	print("region %s: %d trees of %d sets, %dk triangles" % [def.id, trees.size(), place.size(), tris / 1000])
	var hd: Dictionary = arena._plant_chunks(place, Vector2(150.0, 160.0), 32.0, 190.0, def.get("tint", {}))
	for e in trees:
		var o: Vector3 = (e.at as Vector3) - Vector3(0, 0.08, 0)
		e.mm = hd.get(Vector3i(roundi(o.x * 20.0), roundi(o.y * 20.0), roundi(o.z * 20.0)), [])
	# the trees a life may hide things in: by the trail (seen from it), well apart
	var cands := trees.filter(func(e): return String(e.tag) == "" and _walk.has_point(e.local))
	cands.sort_custom(func(a, b): return arena.data.dirt_sd(a.local.x, a.local.y) < arena.data.dirt_sd(b.local.x, b.local.y))
	var ns := int(P.get("search", 10))
	for e in cands:
		if search.size() >= ns: break
		var sd: float = arena.data.dirt_sd(e.local.x, e.local.y)
		if sd < 2.4 or sd > 10.0: continue
		if search.any(func(o): return (o.local as Vector2).distance_to(e.local) < 7.5): continue
		search.append(e)

const A_DEBUG := false

# a baked set's triangles (all its parts, the first level of detail)
static func _tris(s: Dictionary) -> int:
	var n := 0
	for p in s.parts:
		var m: Mesh = p.mesh
		for si in m.get_surface_count(): n += m.surface_get_array_index_len(si) / 3
	return n

static func _perimeter(rc: Rect2, u: float) -> Vector2:
	var W := rc.size.x; var H := rc.size.y
	u = fposmod(u, 2.0 * (W + H))
	if u < W: return Vector2(rc.position.x + u, rc.position.y)
	u -= W
	if u < H: return Vector2(rc.end.x, rc.position.y + u)
	u -= H
	if u < W: return Vector2(rc.end.x - u, rc.end.y)
	u -= W
	return Vector2(rc.position.x, rc.end.y - u)

# ---------- bushes, thickets, baked ferns, flowers and rocks ----------
func _undergrowth(sets: Dictionary, P: Dictionary) -> void:
	var bushes: Array = sets.get("bush", []).filter(func(s): return s.h > 0.8 and s.h < 2.6 and s.w < 3.6)
	var flowers: Array = sets.get("flower", [])
	var rocks: Array = sets.get("rock", []).filter(func(s): return s.h < 1.4 and s.w < 2.2)
	var place := {}
	var put := func(list: Array, x: float, z: float, sc: float, hide: float) -> void:
		if list.is_empty(): return
		var s: Dictionary = list[rng.randi() % list.size()]
		var key := String(s.name)
		if not place.has(key): place[key] = {"set": s, "xf": []}
		place[key].xf.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU) * Basis.from_scale(s.scale * sc), w(x, z) - Vector3(0, 0.05, 0)))
		if hide > 0.0:
			arena.data.add_circle(x, z, hide)
			arena.hides.append({"at": w(x, z), "kind": "bush", "r": s.w * sc * 0.5, "zone": String(def.id)})
	var inner := _walk.grow(-0.5)
	# thickets: clumps of bushes round some trunks and in the gaps
	var nb := int(P.get("bushes", 50))
	var k := 0
	var tries := 0
	while k < nb and tries < nb * 30:
		tries += 1
		var c := _rand_in(inner)
		if on_trail(c.x, c.y, 1.6) or in_clear(c.x, c.y, -1.5): continue
		var n := rng.randi_range(1, 3)
		for j in n:
			var p := c + Vector2(rng.randf_range(-1.6, 1.6), rng.randf_range(-1.6, 1.6))
			if on_trail(p.x, p.y, 1.3) or not free_at(p.x, p.y, 0.6): continue
			take(p.x, p.y, 0.7)
			put.call(bushes, p.x, p.y, rng.randf_range(0.8, 1.3), 0.6)
			k += 1
	# along the walk's edge, a dense hedge of them under the border trees
	var rr := _walk.grow(0.8)
	var per := 2.0 * (rr.size.x + rr.size.y)
	for j in int(per / 2.6):
		var p := _perimeter(rr, j * 2.6 + rng.randf())
		if absf(p.x) < ArenaData.FENCE + 3.0 and absf(p.y) < ArenaData.FENCE + 3.0: continue
		if on_trail(p.x, p.y, 2.0): continue
		put.call(bushes, p.x, p.y, rng.randf_range(1.0, 1.5), 0.0)
	for j in int(P.get("flowers", 20)):
		var p := _rand_in(inner)
		if on_trail(p.x, p.y, 0.8) or not free_at(p.x, p.y, 0.3): continue
		# (mostly at the trail's edges and in the clearings: where the light gets in)
		if not on_trail(p.x, p.y, 3.0) and not in_clear(p.x, p.y, 2.0) and rng.randf() < 0.7: continue
		put.call(flowers, p.x, p.y, rng.randf_range(0.8, 1.2), 0.0)
	for j in int(P.get("rocks", 8)):
		var p := _rand_in(inner)
		if on_trail(p.x, p.y, 1.2) or in_clear(p.x, p.y) or not free_at(p.x, p.y, 1.0): continue
		take(p.x, p.y, 0.9)
		put.call(rocks, p.x, p.y, rng.randf_range(0.9, 1.6), 0.5)
	arena._plant_chunks(place, Vector2(55.0, 62.0), 48.0, 90.0, def.get("tint", {}))

# ---------- the props library's own: logs, stumps, toadstools, ferns, limbs, litter, shafts ----------
func _forest_props(P: Dictionary) -> void:
	var inner := _walk.grow(-1.0)
	var ground := func(x: float, z: float) -> float: return arena.data.height_at(x, z)
	# fallen logs: lying across the forest floor, some by the trail (a seat for him)
	var logs := [ForestProps.fallen_log(1, 5.5, 0.42), ForestProps.fallen_log(2, 4.2, 0.36), ForestProps.fallen_log(3, 6.5, 0.5)]
	var lx := [[], [], []]
	var n := 0
	var tries := 0
	while n < int(P.get("logs", 5)) and tries < 400:
		tries += 1
		var p := _rand_in(inner)
		var near := on_trail(p.x, p.y, 4.5)
		if on_trail(p.x, p.y, 3.6) or in_clear(p.x, p.y, 0.5) or not free_at(p.x, p.y, 3.2): continue
		if not near and n < 3: continue
		var yaw := rng.randf() * TAU
		var v := n % 3
		var L: float = [5.5, 4.2, 6.5][v]
		# (both ends clear of trunks and the trail)
		var d := Vector2(cos(yaw), -sin(yaw)) * L * 0.5
		if on_trail(p.x + d.x, p.y + d.y, 1.4) or on_trail(p.x - d.x, p.y - d.y, 1.4): continue
		if not free_at(p.x + d.x, p.y + d.y, 1.0) or not free_at(p.x - d.x, p.y - d.y, 1.0): continue
		take(p.x, p.y, 2.6)
		var at := w(p.x, p.y)
		lx[v].append(Transform3D(Basis(Vector3.UP, yaw), at - Vector3(0, 0.08, 0)))
		arena.data.add_box(p.x, p.y, L * 0.5, 0.45, -yaw)
		arena.hides.append({"at": at, "kind": "bush", "r": 1.0, "zone": String(def.id)})
		n += 1
	for v in 3: PropScatter.place(self, logs[v], lx[v], {"shadow": true, "range": RANGE, "ink": true})
	# stumps
	var stumps := [ForestProps.stump(1), ForestProps.stump(2, 0.36, 0.5), ForestProps.stump(3, 0.6, 0.9)]
	var sx := [[], [], []]
	for j in int(P.get("stumps", 6)):
		for t2 in 30:
			var p := _rand_in(inner)
			if on_trail(p.x, p.y, 1.4) or in_clear(p.x, p.y, -2.0) or not free_at(p.x, p.y, 1.2): continue
			take(p.x, p.y, 0.9)
			sx[j % 3].append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU), w(p.x, p.y) - Vector3(0, 0.04, 0)))
			arena.data.add_circle(p.x, p.y, 0.55)
			break
	for v in 3: PropScatter.place(self, stumps[v], sx[v], {"shadow": true, "range": RANGE, "ink": true})
	# toadstools at the trees' feet and by the logs
	var shrooms := [ForestProps.mushrooms(1, true), ForestProps.mushrooms(2, true), ForestProps.mushrooms(3, false), ForestProps.mushrooms(4, false)]
	var mx := [[], [], [], []]
	for j in int(P.get("mushrooms", 20)):
		var t: Dictionary = trees[rng.randi() % trees.size()] if not trees.is_empty() else {}
		if t.is_empty() or not _walk.has_point(t.local): continue
		var a := rng.randf() * TAU
		var p: Vector2 = t.local + Vector2(cos(a), sin(a)) * (float(t.trunk) + rng.randf_range(0.5, 1.2))
		if on_trail(p.x, p.y, 0.4): continue
		mx[j % 4].append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU) * Basis.from_scale(Vector3.ONE * rng.randf_range(0.8, 1.3)), w(p.x, p.y)))
	for v in 4: PropScatter.place(self, shrooms[v], mx[v], {"range": 45.0})
	# ferns: thick at the trees' feet, along the trail's edges, under the thickets
	var ferns := [ForestProps.fern(1), ForestProps.fern(2, 1.25), ForestProps.fern(3, 0.8)]
	var fx := [[], [], []]
	for j in int(P.get("ferns", 100)):
		var p: Vector2
		if j % 3 == 0 and not trees.is_empty():
			var t: Dictionary = trees[rng.randi() % trees.size()]
			var a := rng.randf() * TAU
			p = t.local + Vector2(cos(a), sin(a)) * (float(t.trunk) + rng.randf_range(0.6, 2.4))
		else:
			p = _rand_in(inner)
		if on_trail(p.x, p.y, 0.5) or in_clear(p.x, p.y, -2.5) or not _walk.has_point(p): continue
		fx[j % 3].append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU) * Basis.from_scale(Vector3.ONE * rng.randf_range(0.8, 1.4)), w(p.x, p.y) - Vector3(0, 0.03, 0)))
	for v in 3: PropScatter.place(self, ferns[v], fx[v], {"range": 50.0})
	# the litter: fallen leaves and twigs, thick on the trail and under the trees, one mesh a chunk
	var lit := {}
	var nl := int(P.get("litter", 1000))
	for j in nl:
		var p := _rand_in(_walk.grow(2.0))
		var sd: float = arena.data.dirt_sd(p.x, p.y)
		if in_clear(p.x, p.y, -3.0): continue
		if sd > 1.5 and rng.randf() < 0.45: continue
		var key := Vector2i(floori(p.x / 24.0), floori(p.y / 24.0))
		if not lit.has(key): lit[key] = []
		lit[key].append(p)
	for key in lit:
		var b := PropMesh.new()
		var c := Vector3.ZERO
		for p: Vector2 in lit[key]: c += w(p.x, p.y)
		c /= (lit[key] as Array).size()
		var gl := func(x: float, z: float) -> float: return arena.data.height_at(x + c.x, z + c.z) - c.y
		for p: Vector2 in lit[key]:
			var at := w(p.x, p.y) - c
			ForestProps.litter(b, gl, at, 1, 0.01, rng)
		var mi := PropScatter.single(self, b.mesh({"forest": PropMats.leaf(PropMats.ATLAS, Color(0.95, 0.92, 0.85), Vector2(40.0, 46.0))}), c, {"range": 55.0})
		mi.name = "Litter"
	# moss cushions round the trunks
	var mb := PropMesh.new()
	var mo := Vector3.ZERO
	var ml := []
	for t in trees:
		if not _walk.has_point(t.local) or rng.randf() < 0.4: continue
		ml.append(t)
	if not ml.is_empty():
		mo = (ml[0] as Dictionary).at
		for t in ml:
			for j in 2:
				var a := rng.randf() * TAU
				var at: Vector3 = (t.at as Vector3) + Vector3(cos(a), 0, sin(a)) * (float(t.trunk) + 0.4) - mo
				var s := rng.randf_range(0.8, 1.5)
				var yaw := rng.randf() * TAU
				var fx2 := Vector3(cos(yaw), 0, sin(yaw)) * s * 0.5
				var fz2 := Vector3(-sin(yaw), 0, cos(yaw)) * s * 0.5
				var Pq := [at - fx2 - fz2, at + fx2 - fz2, at + fx2 + fz2, at - fx2 + fz2]
				var T := PropMats.T_MOSS
				var uv := [Vector2(T.position.x, T.end.y), T.end, Vector2(T.end.x, T.position.y), T.position]
				var ids := []
				for q in 4:
					var pp: Vector3 = Pq[q]
					pp.y = arena.data.height_at(pp.x + mo.x, pp.z + mo.z) - mo.y + 0.03
					ids.append(mb.vert("forest", pp, Vector3.UP, uv[q], Color(0.85, 0, 0)))
				mb.tri("forest", ids[0], ids[2], ids[1]); mb.tri("forest", ids[0], ids[3], ids[2])
		PropScatter.single(self, mb.mesh({"forest": PropMats.leaf(PropMats.ATLAS, Color.WHITE, Vector2(40.0, 46.0))}), mo, {"range": 55.0}).name = "Moss"
	# sun shafts: slanting down the sun's way into the trail and the clearings
	var sh := PropMesh.new()
	var sun: Vector3 = arena.SUN.normalized()
	var spots := []
	for c in _clear: spots.append(Vector2(c[0], c[1]))
	for s in def.get("paths", []): spots.append((s[0] as Vector2).lerp(s[1], 0.5))
	var so := w(_rc.get_center().x, _rc.get_center().y)
	for j in int(P.get("shafts", 10)):
		var p: Vector2 = spots[j % spots.size()] + Vector2(rng.randf_range(-4.0, 4.0), rng.randf_range(-4.0, 4.0))
		var foot := w(p.x, p.y) - so
		var L := rng.randf_range(15.0, 20.0)
		var top := foot + sun * L
		var wd := rng.randf_range(1.6, 3.4)
		for q in 2:
			var face := Vector3(cos(q * PI * 0.5 + 0.4), 0, sin(q * PI * 0.5 + 0.4))
			var up := (top - foot).normalized()
			var side := up.cross(face).normalized()
			var ids := []
			var Pq := [foot - side * wd * 0.35, foot + side * wd * 0.35, top + side * wd * 0.6, top - side * wd * 0.6]
			var uv := [Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)]
			for k2 in 4: ids.append(sh.vert("shaft", Pq[k2], face, uv[k2], Color.WHITE))
			sh.tri("shaft", ids[0], ids[1], ids[2]); sh.tri("shaft", ids[0], ids[2], ids[3])
	var smi := PropScatter.single(self, sh.mesh({"shaft": PropMats.shaft()}), so, {"range": 120.0})
	smi.name = "Shafts"
	# dappled light on the floor: pools where the shafts land, and where the canopy thins
	var pb := PropMesh.new()
	var pools := []
	for j in int(P.get("pools", 24)):
		var p: Vector2
		if j < spots.size(): p = spots[j] + Vector2(rng.randf_range(-3.0, 3.0), rng.randf_range(-3.0, 3.0))
		else: p = _rand_in(_walk)
		pools.append(p)
	for p: Vector2 in pools:
		var s := rng.randf_range(3.0, 6.5)
		var seed := Color(rng.randf(), rng.randf(), 0.0)
		var ids := []
		var Q := [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
		for q: Vector2 in Q:
			var x := p.x + q.x * s * 0.5
			var z := p.y + q.y * s * 0.5
			var v := w(x, z) - so + Vector3(0, 0.05, 0)
			ids.append(pb.vert("pool", v, Vector3.UP, (q + Vector2.ONE) * 0.5, seed))
		pb.tri("pool", ids[0], ids[2], ids[1]); pb.tri("pool", ids[0], ids[3], ids[2])
	PropScatter.single(self, pb.mesh({"pool": PropMats.pool()}), so, {"range": 70.0}).name = "Pools"

# ---------- signs ----------
func _signs() -> void:
	for s in def.get("signs", []):
		var at: Array = s.at
		var p := w(float(at[0]), float(at[1]))
		var yaw := float(s.get("yaw", 0.0))
		var wood: Material = arena._toon(Color("8a6340"))
		var board: Material = arena._toon(Color(s.get("board", "f3ead6")))
		for sx in [-0.55, 0.55]:
			var mi: MeshInstance3D = arena._box(Vector3(0.1, 1.5, 0.1), p + Basis(Vector3.UP, yaw) * Vector3(sx, 0.72, 0), wood, yaw)
			mi.reparent(self)
		var bd: MeshInstance3D = arena._box(Vector3(1.4, 0.62, 0.06), p + Vector3(0, 1.25, 0), board, yaw)
		bd.reparent(self)
		var stripe: MeshInstance3D = arena._box(Vector3(1.44, 0.07, 0.07), p + Vector3(0, 0.92, 0), arena._toon(Color(s.get("stripe", "d23a2e"))), yaw)
		stripe.reparent(self)
		arena.data.add_circle(float(at[0]), float(at[1]), 0.4)
		for f in [1.0, -1.0]:
			var lb := Label3D.new()
			lb.text = String(s.text)
			lb.font = UITheme.font("display")
			lb.font_size = 64
			lb.pixel_size = 0.0036
			lb.modulate = Color(s.get("ink", "1f2440"))
			lb.outline_size = 0
			lb.position = p + Vector3(0, 1.25, 0) + Basis(Vector3.UP, yaw) * Vector3(0, 0, 0.045 * f)
			lb.rotation.y = yaw + (0.0 if f > 0 else PI)
			lb.shaded = false
			lb.double_sided = false
			add_child(lb)
