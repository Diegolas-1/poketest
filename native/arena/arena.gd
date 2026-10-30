class_name BattleArena
extends Node3D
# The Battle Arena: Prof. Oak's training ground, a dev and test place for staging
# any battle. Ash asks Oak in his talk ("Can I use the training arena?",
# conversation.gd's arena topic); the door wipe takes him there and, on leaving,
# back to where he spoke with him (into the lab again when that is where it was).
#
# A place of its own (ArenaData, arena/arena_data.gd: a WorldData made here, far
# past the sea): while Ash is here the town is hidden and paused as it is
# indoors (main.gd _outdoor_shown), the outdoor camera, his steps and the grass
# field run on the arena's ground. Built from the game's own assets: the
# terrain's shader with its painted grass and dirt (a path map of its own: the
# clay battle field, the paths), the grass field (meadow and the hunt's tall
# grass patches, grass.gdshader's rule), the baked trees and bushes (their
# meshes and materials, borrowed from scenery's plants), a wooden fence with a
# gate arch, chalk lines on the field, pennants at its corners, benches, and a
# referee at the side line. Cheap on Mobile: one ground mesh, a MultiMesh per
# plant part, the fence in two MultiMeshes, ink on the plants near the camera only.
#
#   BattleArena.enter(game)        the wipe there (from outdoors or from inside the lab)
#   BattleArena.I.leave()          and back
#   BattleArena.I                  the arena while Ash is in it, else null
# The staging menu (arena/arena_menu.gd) opens from the STAGE A BATTLE button, the
# pad's L3 / Tab, or A by the referee; arena/arena_stage.gd runs what it stages, and
# arena/arena_hunt.gd a hunt (wild Pokémon hidden through the tall grass, wild.gd's
# own tracking: crouch, tells, the pounce).
#
# The regions (arena/regions/*.gd, ArenaRegions): showcase places round the hub,
# each through a gate in the fence with its sign over it, each its own palette
# (arena/arena_region.gd builds it from its def) and its own life (a forest's
# trees, hive and nest: arena/regions/forest_life.gd). The ground is one grid,
# a mesh per region for its own floor and dirt.
#   arena.regions                  {id: ArenaRegion}
#   arena.life_of(id)              a region's mechanics node (or null)
#   arena.go_region(id, done)      the wipe there (the hub: "")
#   arena.region_now()             the region Ash is in ("" = the hub)

const SUN := Vector3(-0.55, 0.75, 0.45)

static var I: BattleArena = null
static var _data: ArenaData = null

var game: Node3D
var data: ArenaData
var back := {}                 # where Ash came from: {interior, pos, yaw}
var grass: Node3D
var layer: CanvasLayer
var menu: Control              # ArenaMenu
var stage: Node                # ArenaStage
var referee: ScenePerson
var btn: Control               # the STAGE A BATTLE button
var _ink_chunks: Array = []    # [{node, ink, c, d}]: d, the chunk's ink switched on nearer than this (m)
var hides: Array = []          # the bushes and trees inside the fence: {at, kind, r} (a fled Pokémon's cover, wild.gd)
var hunt: Node                 # ArenaHunt (arena/arena_hunt.gd)
var regions := {}              # id -> ArenaRegion (arena/arena_region.gd)
var _region := ""              # the region Ash is in ("" = the hub)
var ambush: Node               # the AMBUSH page's thickets and staged ambushes (arena/arena_ambush.gd)
var _ink_t := 0.0
const FADE_W := 2.5            # a plant hands over to its billboard over this many metres (veg.gd's)
var _saved := {}
var _built := false
var gone := false

static func data_now() -> ArenaData:
	if _data == null:
		_data = ArenaData.new()
		_data.build()
	return _data

# the wipe there: from outdoors, or from inside the lab (Oak's talk)
static func enter(g: Node3D, instant := false) -> void:
	if I != null or g == null: return
	var a := BattleArena.new()
	a.name = "BattleArena"
	a.game = g
	g.add_child(a)
	I = a
	a.back = {"interior": String(g.interior.data.id) if g.indoors and g.interior else "", "pos": g.pos, "yaw": g.yaw, "cam_yaw": g.cam_yaw}
	if g.sfx_world and not instant: g.sfx_world.door_lab(true)
	g._fade(a._enter_now, instant)

func leave(instant := false) -> void:
	if gone: return
	if stage and stage.has_method("busy") and stage.busy(): return
	if game.sfx_world and not instant: game.sfx_world.door_lab(false)
	game._fade(_leave_now, instant)

# ---------- in ----------
func _enter_now() -> void:
	var g := game
	var cast: Cast = g.cast
	if g.indoors and g.interior:
		# out of the lab without stepping outside: the interior goes, the outdoor
		# light and environment come back (the town stays hidden)
		cast.leave_space()
		g.interior.free_ink()
		g.interior.queue_free()
		g.interior = null
		g.indoors = false
		g.we.environment = g.outdoor_env
		g.cam.near = 0.25
		g._on_setting("fog", Settings.get_value("fog"))
		g.cam.position = Vector3.ZERO
		cast.player.visible = true
	g._outdoor_shown(false)
	g.sun.visible = true
	if g.grass:
		g.grass.queue_free()
		g.grass = null
	data = data_now()
	g.world = data
	# the town's people wait where they are, hidden (as indoors)
	_saved = {"npcs": cast.npcs, "uses": cast.uses}
	for n in cast.npcs: n.actor.visible = false
	cast.npcs = []
	cast.uses = []
	cast.life.away = true
	if not _built: _build()
	visible = true
	_grass()
	var sp: Array = data.meta.spawn
	g.pos = Vector3(sp[0], data.height_at(sp[0], sp[2]), sp[2])
	g.yaw = float(data.meta.yaw)
	g.speed = 0.0
	g.cam_yaw = g.yaw + PI
	g.cam_pitch = 0.3
	g.cam_ty = g.pos.y
	g.cam_target = g.pos + Vector3(0, 1.45, 0)
	g.cam_floor = g.pos.y
	cast.land(g.pos.y)
	cast.dialog.banner("Battle Arena", "Prof. Oak's training ground")
	Sfx.set_space(false)
	print("arena: in (from %s)" % (String(back.interior) if String(back.interior) != "" else "outdoors"))

func _grass() -> void:
	grass = preload("res://grass.gd").new()
	grass.name = "ArenaGrass"
	game.add_child(grass)
	var n := int(Settings.get_value("grass"))
	if n > 0: grass.build(data, n, float(Settings.get_value("grass_size")), SUN.normalized())
	game.grass = grass

# ---------- out ----------
func _leave_now() -> void:
	var g := game
	var cast: Cast = g.cast
	gone = true
	if hunt: hunt.stop(false)
	if menu: menu.close_now()
	if grass and is_instance_valid(grass): grass.queue_free()
	g.grass = null
	cast.npcs = _saved.get("npcs", cast.npcs)
	cast.uses = _saved.get("uses", cast.uses)
	cast.life.away = false
	g.world = g.outdoor_world
	I = null
	var iid := String(back.get("interior", ""))
	print("arena: out (to %s)" % (iid if iid != "" else "outdoors"))
	if iid != "":
		# back into the lab, where he was talking to Oak
		g._enter_now(iid, "")
		g.pos = back.pos
		g.yaw = back.yaw
		g.cam_yaw = back.cam_yaw
		g.cam_ty = g.pos.y
		g.cam_target = g.pos + Vector3(0, 1.45, 0)
		cast.land(g.pos.y)
	else:
		g._outdoor_shown(true)
		g.grass_dirty = true
		g._rebuild_grass()
		g.pos = back.get("pos", g.pos)
		g.yaw = back.get("yaw", g.yaw)
		g.cam_yaw = back.get("cam_yaw", g.yaw + PI)
		g.cam_ty = g.pos.y
		g.cam_target = g.pos + Vector3(0, 1.45, 0)
		g.cam_floor = g.pos.y
		cast.land(g.pos.y)
		cast.dialog.banner("Pallet Town", "A quiet seaside village")
	queue_free()

func _exit_tree() -> void:
	if I == self: I = null

# ---------- the place ----------
func _build() -> void:
	_built = true
	position = Vector3.ZERO
	_ground()
	_chalk()
	_plants()
	_fence()
	_props()
	_people()
	_ui()
	for d in ArenaRegions.all():
		var r := ArenaRegion.new()
		add_child(r)
		r.build(self, d)
		regions[String(d.id)] = r
	stage = preload("res://arena/arena_stage.gd").new()
	stage.name = "Stage"
	add_child(stage)
	stage.setup_(self)
	hunt = preload("res://arena/arena_hunt.gd").new()
	hunt.name = "Hunt"
	add_child(hunt)
	hunt.setup_(self)
	ambush = preload("res://arena/arena_ambush.gd").new()
	ambush.name = "Ambush"
	add_child(ambush)
	ambush.setup_(self)

func w(x: float, z: float) -> Vector3:
	return Vector3(ArenaData.C.x + x, ArenaData.ground(x, z), ArenaData.C.y + z)

# the ground: a 1 m grid with the terrain's own shader, colours from the real terrain
func _ground() -> void:
	var base := Color(0.55, 0.72, 0.36)
	var tr: Node = game.terrain_root
	if tr:
		for mi in tr.find_children("*", "MeshInstance3D", true, false):
			var m: Mesh = (mi as MeshInstance3D).mesh
			if m == null or m.get_surface_count() == 0: continue
			var arr := m.surface_get_arrays(0)
			var cols = arr[Mesh.ARRAY_COLOR]
			if cols is PackedColorArray and cols.size() > 100:
				var acc := Color(0, 0, 0, 0)
				var n := 0
				for i in range(0, cols.size(), maxi(1, cols.size() / 4000)):
					var c: Color = cols[i]
					if c.g > c.r and c.g > c.b: acc += c; n += 1
				if n > 0: base = acc / n
				break
	var H := 170.0
	var STEP := 2.0
	var N := int(H * 2.0 / STEP)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var verts := PackedVector3Array()
	var cols2 := PackedColorArray()
	var nrms := PackedVector3Array()
	for j in N + 1:
		for i in N + 1:
			var x := -H + i * STEP
			var z := -H + j * STEP
			var y := ArenaData.ground(x, z)
			verts.append(Vector3(ArenaData.C.x + x, y, ArenaData.C.y + z))
			var nx := ArenaData.ground(x - 0.5, z) - ArenaData.ground(x + 0.5, z)
			var nz := ArenaData.ground(x, z - 0.5) - ArenaData.ground(x, z + 0.5)
			nrms.append(Vector3(nx, 1.0, nz).normalized())
			var v := 0.94 + 0.08 * sin(x * 0.17 + z * 0.09) * cos(z * 0.13 - x * 0.04) + 0.03 * sin(x * 0.7 + z * 0.5)
			var warm := clampf(0.5 + 0.5 * sin(x * 0.05 - z * 0.08), 0.0, 1.0) * 0.06
			cols2.append(Color(base.r * v + warm, base.g * v + warm * 0.4, base.b * v * 0.95))
	# a region's floor: its own tint, darker under the trees, with mossy patches
	for ri in ArenaData.RECTS.size():
		var G: Dictionary = ArenaData.REG[ri].get("ground", {})
		if not G.has("tint"): continue
		var tint: Color = G.tint
		var moss: Color = G.get("moss", tint)
		for j in N + 1:
			for i in N + 1:
				var x := -H + i * STEP
				var z := -H + j * STEP
				var wgt := clampf(ArenaData.region_in(ri, x, z) / 6.0, 0.0, 1.0)
				if wgt <= 0.0: continue
				var v := 0.9 + 0.1 * sin(x * 0.21 + z * 0.13) * cos(z * 0.17 - x * 0.06)
				var mk := clampf(0.5 + 0.9 * sin(x * 0.13 + 1.1) * sin(z * 0.11 - 0.6), 0.0, 1.0)
				var k := j * (N + 1) + i
				cols2[k] = cols2[k].lerp(tint.lerp(moss, mk) * v, wgt)
	# the triangles: each to the mesh of the region its middle is in (the hub's the rest)
	var idx_of := {"": PackedInt32Array()}
	for j in N:
		for i in N:
			var a := j * (N + 1) + i
			var rid := ArenaData.region_at(-H + (i + 0.5) * STEP, -H + (j + 0.5) * STEP)
			if not idx_of.has(rid): idx_of[rid] = PackedInt32Array()
			idx_of[rid].append_array([a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1])
	for rid in idx_of:
		var arrs := []
		arrs.resize(Mesh.ARRAY_MAX)
		arrs[Mesh.ARRAY_VERTEX] = verts
		arrs[Mesh.ARRAY_NORMAL] = nrms
		arrs[Mesh.ARRAY_COLOR] = cols2
		arrs[Mesh.ARRAY_INDEX] = idx_of[rid]
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrs)
		_ground_mesh(mesh, String(rid))

func _ground_mesh(mesh: ArrayMesh, rid: String) -> void:
	var mat: ShaderMaterial = game.terrain_mat.duplicate()
	mat.set_shader_parameter("path_map", data.path_tex)
	mat.set_shader_parameter("pm_origin", data.pm_origin)
	mat.set_shader_parameter("pm_size", data.pm_size)
	# a warmer, deeper clay than the town's sandy paths (a trainer's battle field)
	mat.set_shader_parameter("d_mid", Color(0.78, 0.58, 0.39))
	mat.set_shader_parameter("d_light", Color(0.86, 0.69, 0.5))
	mat.set_shader_parameter("d_edge", Color(0.7, 0.52, 0.36))
	mat.set_shader_parameter("d_pale", Color(0.86, 0.75, 0.58))
	if rid != "":
		# a region's dirt: its own palette (a forest's dark soil)
		var dd: Dictionary = ArenaRegions.get_def(rid).get("ground", {}).get("dirt", {})
		for k in dd: mat.set_shader_parameter(k, dd[k])
	var gm := MeshInstance3D.new()
	gm.name = "Ground" if rid == "" else "Ground_" + rid
	gm.mesh = mesh
	gm.material_override = mat
	gm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(gm)

# ---------- the field's chalk ----------
func _chalk() -> void:
	var F := ArenaData.FIELD - Vector2(0.55, 0.55)
	var lines := []   # [a, b] local
	var rect := func(cx: float, cz: float, hx: float, hz: float) -> void:
		lines.append([Vector2(cx - hx, cz - hz), Vector2(cx + hx, cz - hz)]); lines.append([Vector2(cx + hx, cz - hz), Vector2(cx + hx, cz + hz)])
		lines.append([Vector2(cx + hx, cz + hz), Vector2(cx - hx, cz + hz)]); lines.append([Vector2(cx - hx, cz + hz), Vector2(cx - hx, cz - hz)])
	rect.call(0.0, 0.0, F.x, F.y)
	lines.append([Vector2(-F.x, 0), Vector2(-2.3, 0)]); lines.append([Vector2(2.3, 0), Vector2(F.x, 0)])
	# the trainers' boxes at each end
	for sz in [-1.0, 1.0]:
		rect.call(0.0, sz * ArenaData.TRAINER_Z, 1.1, 0.75)
		lines.append([Vector2(-F.x, sz * 4.6), Vector2(F.x, sz * 4.6)])
	var circ := func(r: float, n: int) -> void:
		for k in n:
			var a0 := TAU * k / n; var a1 := TAU * (k + 1) / n
			lines.append([Vector2(cos(a0), sin(a0)) * r, Vector2(cos(a1), sin(a1)) * r])
	circ.call(2.3, 56)
	circ.call(0.62, 24)
	lines.append([Vector2(-2.3, 0), Vector2(-0.62, 0)]); lines.append([Vector2(0.62, 0), Vector2(2.3, 0)])
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var wd := 0.075
	for L in lines:
		var a: Vector2 = L[0]; var b: Vector2 = L[1]
		var d := (b - a).normalized()
		var nrm := Vector2(-d.y, d.x) * wd
		a -= d * wd * 0.5; b += d * wd * 0.5
		var q := [a + nrm, b + nrm, b - nrm, a - nrm]
		var uvs := [Vector2(0, 0), Vector2((b - a).length(), 0), Vector2((b - a).length(), 1), Vector2(0, 1)]
		for k in [0, 1, 2, 0, 2, 3]:
			var p: Vector2 = q[k]
			st.set_uv(uvs[k])
			st.add_vertex(Vector3(ArenaData.C.x + p.x, ArenaData.ground(p.x, p.y) + 0.012, ArenaData.C.y + p.y))
	var mi := MeshInstance3D.new()
	mi.name = "Chalk"
	mi.mesh = st.commit()
	var m := ShaderMaterial.new()
	m.shader = preload("res://arena/chalk.gdshader")
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

# ---------- trees and bushes: the baked plants' meshes, placed here ----------
func _veg_sets(kinds := ["tree", "bush"]) -> Dictionary:
	var out := {}
	for k in kinds: out[k] = []
	var veg: Node = game.scenery.veg if game.scenery else null
	if veg == null: return out
	var bills: Dictionary = veg.get("set_bill") if veg.get("set_bill") != null else {}
	var seen := {}
	for h in veg.get_children():
		var nm := String(h.name)
		var kind := nm.get_slice("_", 0)
		var si := nm.get_slice("_", 1)
		if not kind in kinds or seen.has(kind + si): continue
		seen[kind + si] = true
		var parts := []
		var b0 := Basis()
		var box := AABB()
		var first := true
		for c in h.get_children():
			if not c is MultiMeshInstance3D: continue
			var mmi := c as MultiMeshInstance3D
			if mmi.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
				if not parts.is_empty(): parts.back().shadow = mmi.multimesh.mesh
				continue
			if mmi.multimesh.instance_count == 0: continue
			b0 = mmi.multimesh.get_instance_transform(0).basis
			var bb: AABB = Transform3D(Basis.from_scale(b0.get_scale()), Vector3.ZERO) * mmi.multimesh.mesh.get_aabb()
			box = bb if first else box.merge(bb)
			first = false
			parts.append({"mesh": mmi.multimesh.mesh, "mat": mmi.material_override, "shadow": null})
		if parts.is_empty(): continue
		if kind in ["tree", "bush"] and not parts.any(func(pp): return pp.mat is ShaderMaterial and (pp.mat as ShaderMaterial).shader == preload("res://veg.gd").LEAF): continue   # (no bare winter trees)
		out[kind].append({"parts": parts, "scale": b0.get_scale(), "h": box.size.y, "w": maxf(box.size.x, box.size.z), "name": nm, "bill": bills.get(int(si), {})})
	return out

func _plants() -> void:
	var sets := _veg_sets()
	var trees: Array = sets.tree.filter(func(s): return s.h > 7.0 and s.h < 17.0 and s.w > 4.0)
	var small_trees: Array = sets.tree.filter(func(s): return s.h > 3.5 and s.h <= 7.0)
	var bushes: Array = sets.bush.filter(func(s): return s.h > 0.9 and s.h < 2.8 and s.w > 1.2 and s.w < 3.8)
	if trees.is_empty(): trees = sets.tree
	if bushes.is_empty(): bushes = sets.bush
	var rng := RandomNumberGenerator.new()
	rng.seed = 151
	var place := {}   # set index key -> [Transform3D]
	var add := func(list: Array, x: float, z: float, sc: float, r: float) -> void:
		if list.is_empty(): return
		var k := rng.randi() % list.size()
		var key := "%s" % list[k].name
		if not place.has(key): place[key] = {"set": list[k], "xf": []}
		var s: Dictionary = list[k]
		var b := Basis(Vector3.UP, rng.randf() * TAU) * Basis.from_scale(s.scale * sc)
		if _blocked(x, z): return
		place[key].xf.append(Transform3D(b, w(x, z) - Vector3(0, 0.05, 0)))
		if r > 0.0:
			data.add_circle(x, z, r)
			# (bush: r its radius; tree: r its height, the perch)
			hides.append({"at": w(x, z), "kind": "bush" if list == bushes else "tree", "r": s.w * sc * 0.5 if list == bushes else s.h * sc})
	# a ring of big trees past the fence, in clumps, closing off the horizon
	for k in 64:
		var a := TAU * k / 64.0 + rng.randf_range(-0.03, 0.03)
		var d := rng.randf_range(52.0, 60.0)
		var p := Vector2(cos(a), sin(a))
		p = p / maxf(absf(p.x), absf(p.y)) * d   # (squarish: the fence is square)
		if absf(p.x) < 9.0 and p.y > 0.0: continue   # (the view out of the gate stays open)
		add.call(trees, p.x, p.y, rng.randf_range(0.85, 1.25), 0.0)
		if rng.randf() < 0.6: add.call(bushes, p.x * 0.93 + rng.randf_range(-2, 2), p.y * 0.93 + rng.randf_range(-2, 2), rng.randf_range(0.9, 1.4), 0.0)
	# and further out, bigger, up the hills
	for k in 44:
		var a := TAU * k / 44.0 + rng.randf_range(-0.05, 0.05)
		var d := rng.randf_range(68.0, 96.0)
		var p := Vector2(cos(a), sin(a))
		p = p / maxf(absf(p.x), absf(p.y)) * d
		if absf(p.x) < 12.0 and p.y > 0.0: continue
		add.call(trees, p.x, p.y, rng.randf_range(1.15, 1.6), 0.0)
	# inside: a few shade trees and bushes by the tall grass, the paths and the fence
	var inside := [[-38, -38], [37, -39], [-39, 35], [39, 37], [-22, -40], [15, 38], [-41, 4], [41, -6], [24, -36], [-12, 39]]
	for t in inside: add.call(trees, float(t[0]), float(t[1]), rng.randf_range(0.7, 1.0), 0.6)
	var smalls := [[-33, -15], [33, -14], [-36, 14], [21, 28], [-24, 33], [10, -33], [-14, -38]]
	for t in smalls: add.call(small_trees if not small_trees.is_empty() else trees, float(t[0]), float(t[1]), rng.randf_range(0.8, 1.1), 0.4)
	for t in ArenaData.TALL:
		for k in 3:
			var a := rng.randf() * TAU
			add.call(bushes, float(t[0]) + cos(a) * (float(t[2]) + 1.6), float(t[1]) + sin(a) * (float(t[3]) + 1.6), rng.randf_range(0.8, 1.2), 0.7)
	for k in 26:
		var side := k % 4
		var u := rng.randf_range(-40.0, 40.0)
		var e := 44.0
		var p: Vector2 = [Vector2(u, -e), Vector2(e, u), Vector2(u, e), Vector2(-e, u)][side]
		if side == 2 and absf(u) < 5.0: continue
		add.call(bushes, p.x, p.y, rng.randf_range(0.9, 1.3), 0.7)
	_plant_chunks(place, Vector2(150.0, 160.0), 32.0, 0.0, {}, 46.0)

# the hub's trees and bushes keep off the regions and the ways to their gates
func _blocked(x: float, z: float) -> bool:
	for rc in ArenaData.RECTS:
		if (rc as Rect2).grow(1.5).has_point(Vector2(x, z)): return true
	for r in ArenaData.REG:
		var lk: Array = r.get("link", [])
		for i in range(lk.size() - 1):
			var a := Vector2(lk[i][0], lk[i][1]); var b := Vector2(lk[i + 1][0], lk[i + 1][1])
			var ab := b - a
			var h := clampf((Vector2(x, z) - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
			if (Vector2(x, z) - (a + ab * h)).length() < 3.2: return true
	return false

# the multimeshes of baked plants placed ({key: {set, xf}}), in chunks (ink switched on
# only near the camera); fade: where each plant dithers out; vis: a chunk's range (0: none).
# Gives each copy's instances by where it stands ({Vector3i(origin * 20): [[multimesh, i]...]}:
# a region's life shakes a tree by its instances)
# tint: {"bark": Color, "leaf": Color} (a region's own: a forest's darker trunks and leaves)
# bill > 0: a set with a billboard (veg.gd's) hands its model over to it at bill metres
# (as the open world's: one draw a chunk for every far plant), out to fade.y or vis
# o: {shadow: m (a chunk's shadow casters only nearer than this, its edge included),
#     ink: Vector2 (where each plant's leaf ink thins out; the chunk's is off past it)}
func _plant_chunks(place: Dictionary, fade: Vector2, cs := 32.0, vis := 0.0, tint := {}, bill := 0.0, o := {}) -> Dictionary:
	var handles := {}
	var ink = get_node_or_null("/root/Ink")
	var veg: Node = game.scenery.veg if game.scenery else null
	var bm: ShaderMaterial = veg.get("bill_mat") if veg else null
	var far_bills := []
	for key in place:
		var s: Dictionary = place[key].set
		var all: Array = place[key].xf
		var bd: Dictionary = s.get("bill", {})
		var fd := fade
		var by_bill := bill > 0.0 and not bd.is_empty() and bm != null
		if by_bill:
			fd = Vector2(bill, bill + FADE_W)
			for xf: Transform3D in all:
				var sc: float = xf.basis.get_scale().x
				far_bills.append([xf.origin, atan2(xf.basis.z.x, xf.basis.z.z), sc, int(bd.imp), bill, float(bd.w) * sc, float(bd.bottom) * sc, float(bd.h) * sc])
		var bins := {}
		for xf in all:
			var ck := Vector2i(floori(xf.origin.x / cs), floori(xf.origin.z / cs))
			if not bins.has(ck): bins[ck] = []
			bins[ck].append(xf)
		for ck in bins:
			var xs: Array = bins[ck]
			var c := Vector3.ZERO
			for xf in xs: c += xf.origin
			c /= xs.size()
			var cv := vis
			var cr := 0.0
			for xf in xs: cr = maxf(cr, Vector2(xf.origin.x - c.x, xf.origin.z - c.z).length() + float(s.w) * xf.basis.get_scale().x / maxf(s.scale.x, 1e-3) * 0.5)
			# (the chunk's models gone past the handover, its edge included)
			if by_bill: cv = fd.y + cr + 2.0
			var sv := minf(cv if cv > 0.0 else INF, float(o.get("shadow", INF)) + cr)
			for part in s.parts:
				var mat: ShaderMaterial = (part.mat as ShaderMaterial).duplicate()
				mat.set_shader_parameter("fade", fd)
				if not tint.is_empty():
					if mat.shader == preload("res://veg.gd").LEAF and tint.has("leaf"): mat.set_shader_parameter("tint", (mat.get_shader_parameter("tint") as Color) * (tint.leaf as Color))
					elif mat.shader == preload("res://veg.gd").SOLID and tint.has("bark") and bool(mat.get_shader_parameter("use_tex")): mat.set_shader_parameter("color", (mat.get_shader_parameter("color") as Color) * (tint.bark as Color))
				var mm := MultiMesh.new()
				mm.transform_format = MultiMesh.TRANSFORM_3D
				mm.mesh = part.mesh
				mm.instance_count = xs.size()
				for j in xs.size():
					mm.set_instance_transform(j, Transform3D(xs[j].basis, xs[j].origin - c))
					var hk := Vector3i(roundi(xs[j].origin.x * 20.0), roundi(xs[j].origin.y * 20.0), roundi(xs[j].origin.z * 20.0))
					if not handles.has(hk): handles[hk] = []
					handles[hk].append([mm, j])
				var mi := MultiMeshInstance3D.new()
				mi.multimesh = mm
				mi.material_override = mat
				mi.position = c
				# (no stand-in: the model casts; a region's flowers not at all, their shadow a few pixels)
				var bare := part.shadow == null and not (o.has("shadow") and float(s.h) < 1.5 and mat.shader == preload("res://veg.gd").LEAF)
				mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if bare else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				if cv > 0.0: mi.visibility_range_end = cv
				add_child(mi)
				if part.shadow != null:
					var smm := MultiMesh.new()
					smm.transform_format = MultiMesh.TRANSFORM_3D
					smm.mesh = part.shadow
					smm.instance_count = xs.size()
					for j in xs.size():
						smm.set_instance_transform(j, mm.get_instance_transform(j))
						handles[Vector3i(roundi(xs[j].origin.x * 20.0), roundi(xs[j].origin.y * 20.0), roundi(xs[j].origin.z * 20.0))].append([smm, j])
					var sh := MultiMeshInstance3D.new()
					sh.multimesh = smm
					sh.material_override = mat
					sh.position = c
					sh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
					if sv < INF: sh.visibility_range_end = sv
					add_child(sh)
				if ink and mat.shader == preload("res://veg.gd").LEAF:
					var im: ShaderMaterial = ink.outline_plant(mi, mm.mesh.get_aabb().get_center(), {"double_sided": true})
					if im:
						im.set_shader_parameter("leaf_wind", mat.get_shader_parameter("wind"))
						im.set_shader_parameter("leaf_fade", fd)
						var ik: Vector2 = o.get("ink", Vector2(28.0, 36.0))
						im.set_shader_parameter("ink_far", ik)
						_ink_chunks.append({"node": mi, "ink": im, "c": c, "d": ik.y + cr if o.has("ink") else 44.0})
						mi.material_overlay = null
	if not far_bills.is_empty(): _bill_chunks(far_bills, bm, vis if vis > 0.0 else fade.y, tint)
	return handles

# far plants as billboards (veg.gd's atlas and shader): [origin, yaw, scale, impostor,
# hand over at, half width, bottom, height] each, a MultiMesh a 128 m chunk (a draw
# each: a far plant's quad costs next to nothing, the near ones fold away in the shader)
func _bill_chunks(bills: Array, bm: ShaderMaterial, far: float, tint := {}) -> void:
	var mat := bm
	if tint.has("bill") or tint.has("leaf"):
		mat = bm.duplicate()
		mat.set_shader_parameter("tint", tint.get("bill", tint.get("leaf")))
	var quad: Mesh = null
	var bins := {}
	for b in bills:
		var k := Vector2i(floori(b[0].x / 128.0), floori(b[0].z / 128.0))
		if not bins.has(k): bins[k] = []
		bins[k].append(b)
	for k in bins:
		var list: Array = bins[k]
		var c := Vector3.ZERO
		for b in list: c += b[0]
		c /= list.size()
		var lo := Vector3(INF, INF, INF); var hi := -lo
		var r := 0.0
		var near := INF
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = true
		if quad == null: quad = game.scenery.veg._quad()
		mm.mesh = quad
		mm.instance_count = list.size()
		for j in list.size():
			var b: Array = list[j]
			var p: Vector3 = b[0] - c
			mm.set_instance_transform(j, Transform3D(Basis(), p))
			mm.set_instance_custom_data(j, Color(b[1], b[2], b[3], b[4]))
			var hw: float = b[5]
			lo = lo.min(p + Vector3(-hw, b[6], -hw))
			hi = hi.max(p + Vector3(hw, b[6] + b[7], hw))
			r = maxf(r, Vector2(p.x, p.z).length() + hw)
			near = minf(near, b[4])
		var mi := MultiMeshInstance3D.new()
		mi.name = "Bills"
		mi.multimesh = mm
		mi.material_override = mat
		mi.position = c
		mi.custom_aabb = AABB(lo, hi - lo).grow(6.5)   # (and a battle's push)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visibility_range_begin = maxf(0.0, near - r - 2.0)
		mi.visibility_range_end = far + r
		add_child(mi)

# ---------- the fence, the gate, benches, pennants ----------
func _toon(col: Color, two_sided := false) -> ShaderMaterial:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.resource_name = "arena_%s%s" % [col.to_html(), "_ds" if two_sided else ""]
	if two_sided: m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return game.toon_for(m)

# a pennant: a long triangle off the pole, with a little sag and ripple
func _pennant() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := 6
	for i in n:
		var u0 := float(i) / n; var u1 := float(i + 1) / n
		var p := func(u: float, v: float) -> Vector3:
			var hh := 0.36 * (1.0 - u)
			return Vector3(u * 0.78, -0.18 * u - hh * 0.5 + hh * v, sin(u * 7.0) * 0.05 * u)
		var a0: Vector3 = p.call(u0, 0.0); var b0: Vector3 = p.call(u0, 1.0)
		var a1: Vector3 = p.call(u1, 0.0); var b1: Vector3 = p.call(u1, 1.0)
		for q in [a0, b0, b1, a0, b1, a1]:
			st.set_normal(Vector3(0, 0, 1))
			st.add_vertex(q)
	return st.commit()

func _fence() -> void:
	var posts: Array = []
	var rails: Array = []
	var E := ArenaData.FENCE
	var step := 2.6
	# the openings: the gate (south), and each region's (sides: 0 n, 1 e, 2 s, 3 w)
	var gaps := [[2, 0.0, 2.4]]
	for r in ArenaData.REG:
		var g: Dictionary = r.get("gate", {})
		gaps.append([{"n": 0, "e": 1, "s": 2, "w": 3}.get(String(g.get("side", "n")), 0), float(g.get("u", 0.0)), float(g.get("half", 2.2)) + 0.2])
	var gap := func(sd: int, u: float) -> bool:
		for gg in gaps:
			if int(gg[0]) == sd and absf(u - float(gg[1])) < float(gg[2]): return true
		return false
	for side in 4:
		var n := int(E * 2.0 / step)
		for k in n + 1:
			var u := -E + k * step
			var p: Vector2 = [Vector2(u, -E), Vector2(E, u), Vector2(u, E), Vector2(-E, u)][side]
			if gap.call(side, u): continue   # a gate
			posts.append(p)
			if k < n:
				var u2 := u + step
				if gap.call(side, u2) or gap.call(side, u): continue
				var q: Vector2 = [Vector2(u2, -E), Vector2(E, u2), Vector2(u2, E), Vector2(-E, u2)][side]
				rails.append([p, q])
	var post := BoxMesh.new(); post.size = Vector3(0.14, 1.15, 0.14)
	var rail := BoxMesh.new(); rail.size = Vector3(0.07, 0.11, 1.0)
	var wood := _toon(Color("8a6340"))
	var wood2 := _toon(Color("a47a52"))
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = post; mm.instance_count = posts.size()
	for i in posts.size():
		var p: Vector2 = posts[i]
		mm.set_instance_transform(i, Transform3D(Basis(Vector3.UP, sin(p.x * 3.1 + p.y) * 0.08), w(p.x, p.y) + Vector3(0, 0.5, 0)))
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = wood; add_child(mi)
	var mr := MultiMesh.new(); mr.transform_format = MultiMesh.TRANSFORM_3D; mr.mesh = rail; mr.instance_count = rails.size() * 2
	for i in rails.size():
		var a: Vector2 = rails[i][0]; var b: Vector2 = rails[i][1]
		var A := w(a.x, a.y); var B := w(b.x, b.y)
		for k in 2:
			var y := 0.42 if k == 0 else 0.86
			var mid := (A + B) * 0.5 + Vector3(0, y, 0)
			var d := B - A
			var bs := Basis.looking_at(d.normalized(), Vector3.UP).scaled(Vector3(1, 1, d.length()))
			mr.set_instance_transform(i * 2 + k, Transform3D(bs, mid))
	var mri := MultiMeshInstance3D.new(); mri.multimesh = mr; mri.material_override = wood2; add_child(mri)
	# the gate: two tall posts, a crossbeam and the board
	for sx in [-2.5, 2.5]:
		_box(Vector3(0.26, 3.4, 0.26), w(sx, E) + Vector3(0, 1.6, 0), wood)
		data.add_circle(sx, E, 0.3)
	_box(Vector3(5.8, 0.26, 0.3), w(0, E) + Vector3(0, 3.25, 0), wood)
	_box(Vector3(3.6, 0.7, 0.08), w(0, E) + Vector3(0, 2.62, 0.02), _toon(Color("f3ead6")))
	_box(Vector3(3.7, 0.08, 0.1), w(0, E) + Vector3(0, 2.25, 0.02), _toon(Color("d23a2e")))
	for f in [1.0, -1.0]:
		var lb := Label3D.new()
		lb.text = "BATTLE ARENA"
		lb.font = UITheme.font("display")
		lb.font_size = 96
		lb.pixel_size = 0.0042
		lb.modulate = Color("1f2440")
		lb.outline_size = 0
		lb.position = w(0, E) + Vector3(0, 2.64, 0.07 * f)
		lb.rotation.y = 0.0 if f > 0 else PI
		lb.shaded = false
		lb.double_sided = false
		add_child(lb)
	for r in ArenaData.REG: _region_gate(r, wood)

# a region's gate in the fence: two posts, a beam, a board with its sign (both faces)
func _region_gate(r: Dictionary, wood: Material) -> void:
	var g := ArenaRegions.gate_at(r, ArenaData.FENCE)
	var o := ArenaRegions.gate_out(r)
	var hw := float(r.get("gate", {}).get("half", 2.2)) + 0.3
	var yaw := atan2(o.x, o.y) + PI
	var side := Vector2(o.y, -o.x)
	for sx in [-hw, hw]:
		var p: Vector2 = g + side * float(sx)
		_box(Vector3(0.24, 3.2, 0.24), w(p.x, p.y) + Vector3(0, 1.5, 0), wood, yaw)
		data.add_circle(p.x, p.y, 0.3)
	var top := w(g.x, g.y)
	_box(Vector3(hw * 2.0 + 0.7, 0.24, 0.28), top + Vector3(0, 3.05, 0), wood, yaw)
	var col: Color = r.get("board", Color("2f5d34"))
	_box(Vector3(hw * 2.0 - 0.4, 0.62, 0.08), top + Vector3(0, 2.45, 0), _toon(col), yaw)
	_box(Vector3(hw * 2.0 - 0.3, 0.07, 0.1), top + Vector3(0, 2.1, 0), _toon(Color("e8c25a")), yaw)
	for f in [1.0, -1.0]:
		var lb := Label3D.new()
		lb.text = String(r.get("sign", String(r.name).to_upper()))
		lb.font = UITheme.font("display")
		lb.font_size = 88
		lb.pixel_size = 0.0038
		lb.modulate = Color("f6efd8")
		lb.outline_size = 0
		lb.position = top + Vector3(0, 2.47, 0) + Basis(Vector3.UP, yaw) * Vector3(0, 0, 0.06 * f)
		lb.rotation.y = yaw + (0.0 if f > 0 else PI)
		lb.shaded = false
		lb.double_sided = false
		add_child(lb)

func _box(size: Vector3, at: Vector3, mat: Material, yaw := 0.0) -> MeshInstance3D:
	var b := BoxMesh.new(); b.size = size
	var mi := MeshInstance3D.new(); mi.mesh = b; mi.material_override = mat
	mi.position = at; mi.rotation.y = yaw
	add_child(mi)
	return mi

func _props() -> void:
	var wood := _toon(Color("9a6e45"))
	var dark := _toon(Color("5e4a3a"))
	# benches along the east side line, for whoever is watching
	for z in [-3.2, 3.2]:
		var at := w(9.6, z)
		_box(Vector3(0.5, 0.07, 2.4), at + Vector3(0, 0.46, 0), wood)
		_box(Vector3(0.08, 0.42, 2.4), at + Vector3(0.24, 0.72, 0), wood)
		for dz in [-1.0, 1.0]: _box(Vector3(0.42, 0.44, 0.08), at + Vector3(0, 0.22, dz), dark)
		data.add_box(9.6, z, 0.35, 1.3)
	# pennants on poles at the field's corners
	var red := _toon(Color("e2392f"))
	var white := _toon(Color("f4f1e8"))
	var pole := _toon(Color("d9d4c8"))
	var red_ds := _toon(Color("e2392f"), true)
	var white_ds := _toon(Color("f4f1e8"), true)
	var F := ArenaData.FIELD + Vector2(0.4, 0.4)
	var k := 0
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var at := w(sx * F.x, sz * F.y)
			_box(Vector3(0.06, 1.7, 0.06), at + Vector3(0, 0.85, 0), pole)
			var flag := MeshInstance3D.new()
			flag.mesh = _pennant()
			flag.material_override = red_ds if k % 2 == 0 else white_ds
			flag.position = at + Vector3(0, 1.66, 0)
			flag.rotation.y = 0.5 * sx * sz   # (all streaming the same way: the breeze)
			add_child(flag)
			data.add_circle(sx * F.x, sz * F.y, 0.15)
			k += 1
	# a little stand for the referee, with the scoreboard of the balls
	_box(Vector3(1.3, 0.16, 1.0), w(-8.9, 0) + Vector3(0, 0.08, 0), wood)

func _people() -> void:
	referee = ScenePerson.make("tom")
	referee.name = "Referee"
	add_child(referee)
	referee.ground = func(x: float, z: float) -> float: return data.height_at(x, z)
	referee.place(w(-8.9, 0.0) + Vector3(0, 0.16, 0), PI / 2)
	referee.actor.idles.stance = "hands_front"
	data.add_circle(-8.9, 0.0, 0.6)

func referee_spot() -> Vector3: return w(-8.9, 0.0)

# ---------- the regions ----------
func life_of(id: String) -> Node:
	var r = regions.get(id)
	return r.life if r else null

func region_now() -> String: return _region

# the wipe to a region's spawn (or the hub's: ""), then done (a staged hunt)
func go_region(id: String, done := Callable(), instant := false) -> void:
	var at: Vector2
	var yaw: float
	if id == "":
		var sp: Array = data.meta.spawn
		at = Vector2(sp[0] - ArenaData.C.x, sp[2] - ArenaData.C.y); yaw = float(data.meta.yaw)
	else:
		var d := ArenaRegions.get_def(id)
		if d.is_empty(): return
		at = Vector2(d.spawn[0], d.spawn[1]); yaw = float(d.get("yaw", 0.0))
	var put := func() -> void:
		var g := game
		g.pos = w(at.x, at.y)
		g.yaw = yaw
		g.speed = 0.0
		g.cam_yaw = yaw + PI
		g.cam_ty = g.pos.y
		g.cam_target = g.pos + Vector3(0, 1.45, 0)
		g.cam_floor = g.pos.y
		g.cast.land(g.pos.y)
		if grass: grass.update(g.pos)
		if done.is_valid(): done.call()
	if instant: put.call()
	else: game._fade(put, false)

func _region_watch() -> void:
	var l := Vector2(game.pos.x - ArenaData.C.x, game.pos.z - ArenaData.C.y)
	var r := ArenaData.region_at(l.x, l.y)
	if r == _region: return
	_region = r
	var cast: Cast = game.cast
	if r == "": cast.dialog.banner("Battle Arena", "Prof. Oak's training ground")
	else:
		var d := ArenaRegions.get_def(r)
		cast.dialog.banner(String(d.get("name", r)), String(d.get("sub", "")))
	for id in regions:
		var lf = life_of(id)
		if lf and lf.has_method("on_region"): lf.on_region(r == id)

# ---------- the HUD: the STAGE A BATTLE button ----------
func _ui() -> void:
	layer = CanvasLayer.new()
	layer.layer = 6
	add_child(layer)
	btn = preload("res://arena/arena_button.gd").new()
	btn.pressed.connect(open_menu)
	layer.add_child(btn)
	menu = preload("res://arena/arena_menu.gd").new()
	menu.arena = self
	layer.add_child(menu)

# the world HUD's corners (the cog, the clock, the quest log, the touch buttons) give way to
# the arena's screens (the staging menu, the formal opening)
func world_hud(on: bool) -> void:
	var cast = game.cast
	if cast.btn_ui: cast.btn_ui.visible = on
	if cast.cond_ui: cast.cond_ui.visible = on
	if cast.clock and cast.clock.hud: cast.clock.hud.visible = on
	if Settings.menu and Settings.menu.get("cog"): Settings.menu.cog.visible = on
	if cast.life and cast.life.quests and cast.life.quests.ui and cast.life.quests.ui.get("btn"): cast.life.quests.ui.btn.visible = on

func open_menu() -> void:
	if menu == null or menu.is_open() or Battle.active or game.trans_busy: return
	if stage and stage.busy(): return
	menu.open()

func _unhandled_input(e: InputEvent) -> void:
	if gone or menu == null or menu.is_open() or Battle.active: return
	if (e is InputEventKey and e.pressed and not e.echo and e.physical_keycode == KEY_TAB) \
		or (e is InputEventJoypadButton and e.pressed and e.button_index == JOY_BUTTON_LEFT_STICK):
		open_menu()
		get_viewport().set_input_as_handled()

# A by the referee (cast.gd asks, so the touch A button counts too): true = taken
func use_pressed() -> bool:
	if gone or menu == null or menu.is_open() or Battle.active or not near_referee(): return false
	open_menu()
	return true

func near_referee() -> bool:
	return referee != null and Vector2(game.pos.x - referee.global_position.x, game.pos.z - referee.global_position.z).length() < 2.4

func _process(dt: float) -> void:
	if gone: return
	if not Battle.active and not game.trans_busy: _region_watch()
	if btn: btn.visible = not Battle.active and not menu.is_open() and not game.trans_busy and not (stage and stage.busy())
	# the referee's prompt
	var near_ref := near_referee()
	if btn: btn.ref_prompt = near_ref and not Battle.active and not menu.is_open()
	if btn and near_ref: btn.ref_at = game.cam.unproject_position(referee.global_position + Vector3(0, 2.1, 0))
	# keep the referee watching Ash while he roams
	if referee and not Battle.active and not (stage and stage.busy()): referee.look_at_node(game.cast.player)
	# plant ink only near the camera
	_ink_t -= dt
	if _ink_t <= 0.0:
		_ink_t = 0.3
		var cp: Vector3 = game.cam.global_position
		var on := Ink.is_enabled() and Ink.quality >= 0.75 if get_node_or_null("/root/Ink") else false
		for ch in _ink_chunks:
			var want: Material = ch.ink if on and Vector2(ch.c.x - cp.x, ch.c.z - cp.z).length() < float(ch.d) else null
			if ch.node.material_overlay != want: ch.node.material_overlay = want
