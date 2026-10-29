class_name Creature
extends Node3D
# A Pokémon: the model baked by tools/native/bake_creatures.mjs
# (res://creatures/<species>.glb: one skeleton, metres, Y up, facing +Z) with
# the people's cel shading (shaders/creature.gdshader) and ink hull (it joins
# the group "characters" with its .meshes, like actor.gd), animated entirely
# by hand on its bones: the rips have no clips. Each species is a subclass
# with its own rig, gait and moods (creature_caterpie.gd, creature_doduo.gd);
# companions.gd moves them about the town.
#
#   var c := Creature.make("caterpie")
#   c.position = ...; c.rotation.y = yaw   # where it is (ground) and its heading
#   c.animate(dt, speed)                   # once a frame, after placing it
#   c.look_at_pos = Vector3(...)           # something to look at (NAN = its own idle looks)
#   c.mood("happy") / c.mood("hop") / c.mood("talk")   # one-off acts
#   c.sleep = true                         # curls up / lies down and dozes
#   c.reset()                              # after a jump in place (doors, time skips)
#
# The pose of a frame is built in skeleton space: a species sets the global
# (skeleton-space) basis of the bones it aims (aim(), set_global()) or a local
# turn (turn_local()); apply() then walks the hierarchy once, turning global
# targets into local rotations, and writes only the bones touched.

const SHADER := preload("res://shaders/creature.gdshader")
const SHADER_CUT := preload("res://shaders/creature_cutout.gdshader")
const SHADER_FLAME := preload("res://shaders/creature_flame.gdshader")

static var _scenes := {}

var species := ""
var skel: Skeleton3D
var bones := {}                      # name -> index
var parent := PackedInt32Array()
var order := PackedInt32Array()      # parents before children
var rest_l: Array[Transform3D] = []  # local rest
var rest_g: Array[Transform3D] = []  # rest in skeleton space
var G: Array[Transform3D] = []       # this frame's pose in skeleton space (after apply)
var meshes: Array[MeshInstance3D] = []
var mats: Array[ShaderMaterial] = []
var mat_by := {}                     # material name -> ShaderMaterial (the last surface with it)
var mat_names: Array[String] = []    # each of mats' material name
var flames: Array[ShaderMaterial] = []   # materials drawn as flame (their "power" set by the species)
var look_at_pos := Vector3(NAN, NAN, NAN)
var sleep := false
# counters for sfx_world.gd (a sound each time one goes up): feet put down, pecks, hops
var footfalls := 0
var pecks := 0
var hops := 0
var rng := RandomNumberGenerator.new()
var _tg := {}                        # bone -> global basis wanted this frame
var _tl := {}                        # bone -> local rotation this frame
var _tp := {}                        # bone -> local position this frame
var _touched := {}                   # bones written last frame (back to rest when left alone)

# variant: "" (the default) or "f" / "m" for a species whose sexes differ (rattata,
# raticate, pikachu, raichu: the female's model is creatures/<species>_f.glb); a variant
# it has no model for is the default. The species of creatures/species.json (#019 on) are
# CreatureRig's families (creature_rig.gd), each with its own subclass where it has one.
static func make(sp: String, variant := "") -> Creature:
	# (the battle data's ids for the Nidoran: life/kanto151.json)
	sp = {"nidoran_f": "nidoranf", "nidoran_m": "nidoranm"}.get(sp, sp)
	var c: Creature
	match sp:
		"caterpie": c = CreatureCaterpie.new()
		"doduo": c = CreatureDoduo.new()
		"mrmime": c = CreatureMrMime.new()
		"pidgey": c = CreaturePidgey.new()
		_: c = CreatureRig.create(sp)
	c.name = "Creature_" + sp
	c.variant = variant
	c._build(sp)
	return c

var variant := ""

func _build(sp: String) -> void:
	species = sp
	rng.randomize()
	var key := sp
	if variant != "" and ResourceLoader.exists("res://creatures/%s_%s.glb" % [sp, variant]): key = sp + "_" + variant
	else: variant = ""
	if not _scenes.has(key): _scenes[key] = load("res://creatures/%s.glb" % key)
	var root: Node3D = _scenes[key].instantiate()
	add_child(root)
	_root_ready(root)
	skel = root.find_child("Skeleton3D", true, false)
	var n := skel.get_bone_count()
	parent.resize(n)
	for i in n:
		bones[skel.get_bone_name(i)] = i
		parent[i] = skel.get_bone_parent(i)
		rest_l.append(skel.get_bone_rest(i))
	rest_g.resize(n)
	G.resize(n)
	var done := {}
	while order.size() < n:
		for i in n:
			if done.has(i): continue
			if parent[i] < 0 or done.has(parent[i]):
				order.append(i); done[i] = true
				rest_g[i] = rest_l[i] if parent[i] < 0 else rest_g[parent[i]] * rest_l[i]
				G[i] = rest_g[i]
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		meshes.append(m3)
		m3.extra_cull_margin = 0.6
		var cards := String(m3.name).ends_with("_cards")
		if String(m3.name).ends_with("_flame") or cards:
			# a tail flame (bake_creatures.mjs): fire, so no ink outline and no shadow
			m3.set_meta("no_ink", true)
			m3.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		for s in m3.mesh.get_surface_count():
			var src := m3.mesh.surface_get_material(s)
			var m := ShaderMaterial.new()
			m.shader = SHADER
			if src is BaseMaterial3D and src.albedo_texture: m.set_shader_parameter("albedo_tex", src.albedo_texture)
			if String(m3.name).ends_with("_flame"):
				# a flame (or a gas puff) sheet: fire unless species.json says otherwise
				m.shader = SHADER_FLAME
				m.set_shader_parameter("seed", float(mats.size()) * 1.7)
				flames.append(m)
			if cards:
				# a card (bake_creatures.mjs): see-through by its texture's alpha, both sides
				var tex = m.get_shader_parameter("albedo_tex")
				m.shader = SHADER_CUT
				m.set_shader_parameter("albedo_tex", tex)
			m3.set_surface_override_material(s, m)
			mats.append(m)
			mat_names.append(String(src.resource_name) if src else "m%d" % s)
			mat_by[mat_names[mat_names.size() - 1]] = m
	_looks(species_info(sp).get("materials", {}))
	add_to_group("characters")
	_setup()

# ---------- the look of the materials (creatures/species.json "materials") ----------
static var _db := {}

static func species_db() -> Dictionary:
	if _db.is_empty():
		var f := FileAccess.open("res://creatures/species.json", FileAccess.READ)
		if f:
			var d = JSON.parse_string(f.get_as_text())
			if d is Dictionary: _db = d
	return _db

static func species_info(sp: String) -> Dictionary:
	return species_db().get("species", {}).get(sp, {})

# per material (by the texture's name: "bodya1", "eye1", "mouth1" .., or "*" for all; a
# material's own entry over "*"): tint, brightness, saturation, texture (another
# image, res:// path), blend ("opaque" / "cutout") with alpha_cut, masks
# ([{"rect": [u0, v0, u1, v1], "tint": [r, g, b]}], two at most), shader ("flame": drawn as
# fire, with its hot / warm / cool colours). See species.json's _schema.
func _looks(cfg: Dictionary) -> void:
	if cfg.is_empty(): return
	for i in mats.size():
		var nm := mat_names[i]
		var o: Dictionary = (cfg.get("*", {}) as Dictionary).duplicate()
		for k in cfg:
			if k != "*" and (nm == String(k) or nm.ends_with("_" + String(k))): o.merge(cfg[k], true)
		if o.is_empty(): continue
		var m := mats[i]
		if String(o.get("shader", "")) == "flame":
			# a flame (unlit, added on top: shaders/creature_flame.gdshader), not cel shaded
			var tex = m.get_shader_parameter("albedo_tex")
			m.shader = SHADER_FLAME
			m.set_shader_parameter("albedo_tex", tex)
			m.set_shader_parameter("seed", float(i) * 1.7)
			if not flames.has(m): flames.append(m)
			for k in ["hot", "warm", "cool"]:
				if o.has(k): m.set_shader_parameter(k, _v3(o[k]))
			# (power 0: not shown until a species turns it up: Koffing's gas cloud)
			if o.has("power"): m.set_shader_parameter("power", float(o.power))
			continue
		if String(o.get("blend", "opaque")) == "cutout":
			var tex = m.get_shader_parameter("albedo_tex")
			m.shader = SHADER_CUT
			m.set_shader_parameter("albedo_tex", tex)
			m.set_shader_parameter("alpha_cut", float(o.get("alpha_cut", 0.5)))
		if o.has("texture") and ResourceLoader.exists(String(o.texture)):
			m.set_shader_parameter("albedo_tex", load(String(o.texture)))
		if o.has("tint"): m.set_shader_parameter("tint", _v3(o.tint))
		if o.has("brightness"): m.set_shader_parameter("brightness", float(o.brightness))
		if o.has("saturation"): m.set_shader_parameter("saturation", float(o.saturation))
		var masks: Array = o.get("masks", [])
		for k in mini(2, masks.size()):
			var r: Array = masks[k].get("rect", [0, 0, 0, 0])
			m.set_shader_parameter("mask%d" % k, Vector4(float(r[0]), float(r[1]), float(r[2]), float(r[3])))
			m.set_shader_parameter("mask%d_tint" % k, _v3(masks[k].get("tint", [1, 1, 1])))

static func _v3(a) -> Vector3:
	if a is Array and a.size() >= 3: return Vector3(float(a[0]), float(a[1]), float(a[2]))
	if a is float or a is int: return Vector3.ONE * float(a)
	return Vector3.ONE

# ---------- for the species ----------
func _root_ready(_root: Node3D) -> void: pass   # the model is in, before the skeleton is read (its scale)
func _setup() -> void: pass
func _pose(_dt: float, _speed: float) -> void: pass
func reset() -> void: pass
func mood(_what: String) -> void: pass
func busy() -> bool: return false   # in the middle of an act (the owner waits before moving it)
# where its feet stand this frame (world; null for one in the air): for the dev slip check
func contacts() -> Array: return []

func animate(dt: float, speed: float) -> void:
	_tg.clear(); _tl.clear(); _tp.clear()
	_pose(dt, speed)
	apply()

func b(n: String) -> int: return bones.get(n, -1)

# world point / direction -> skeleton space
func to_skel(p: Vector3) -> Vector3: return skel.global_transform.affine_inverse() * p
func dir_to_skel(d: Vector3) -> Vector3: return (skel.global_transform.basis.inverse() * d)
func to_world(p: Vector3) -> Vector3: return skel.global_transform * p

# a right-handed frame with y along d and z as near to u as it can be
static func frame(d: Vector3, u: Vector3) -> Basis:
	var y := d.normalized()
	var x := y.cross(u).normalized()
	if x.length_squared() < 1e-6: x = y.cross(Vector3(0.3, 0.1, 1.0)).normalized()
	var z := x.cross(y)
	return Basis(x, y, z)

# the bone's skeleton-space basis that turns its rest direction (toward bone
# `toward`, or rest_dir) and rest "up" (rest_up) onto dir and up
func aim(bi: int, dir: Vector3, up: Vector3, rest_dir: Vector3, rest_up: Vector3) -> void:
	if bi < 0: return
	# (a zero-length bone or aim: nothing to turn it by)
	if dir.length_squared() < 1e-12 or rest_dir.length_squared() < 1e-12: return
	var q := frame(dir, up) * frame(rest_dir, rest_up).inverse()
	_tg[bi] = (q * rest_g[bi].basis).orthonormalized()

func set_global(bi: int, basis: Basis) -> void:
	if bi >= 0: _tg[bi] = basis.orthonormalized()

# a turn about an axis given in skeleton space, on top of the bone's rest (local)
func turn_rest(bi: int, axis: Vector3, a: float) -> void:
	if bi < 0 or a == 0.0: return
	var pl := rest_g[bi].basis.inverse() * axis
	var base: Quaternion = _tl.get(bi, rest_l[bi].basis.get_rotation_quaternion())
	_tl[bi] = base * Quaternion(pl.normalized(), a)

func set_local_pos(bi: int, p: Vector3) -> void:
	if bi >= 0: _tp[bi] = p

# the rest direction of a bone toward one of its descendants, and the rest position of a bone
func rest_dir(bi: int, child: int) -> Vector3: return (rest_g[child].origin - rest_g[bi].origin).normalized()
func rest_at(bi: int) -> Vector3: return rest_g[bi].origin

func apply() -> void:
	var now := {}
	for i in order:
		var pi := parent[i]
		var pg: Transform3D = G[pi] if pi >= 0 else Transform3D.IDENTITY
		var lp: Vector3 = _tp.get(i, rest_l[i].origin)
		var lr: Quaternion
		if _tg.has(i):
			lr = (pg.basis.inverse() * (_tg[i] as Basis)).get_rotation_quaternion()
		elif _tl.has(i):
			lr = _tl[i]
		else:
			lr = rest_l[i].basis.get_rotation_quaternion()
		G[i] = pg * Transform3D(Basis(lr), lp)
		if _tg.has(i) or _tl.has(i) or _tp.has(i):
			now[i] = true
			skel.set_bone_pose_rotation(i, lr)
			skel.set_bone_pose_position(i, lp)
		elif _touched.has(i):
			skel.set_bone_pose_rotation(i, rest_l[i].basis.get_rotation_quaternion())
			skel.set_bone_pose_position(i, rest_l[i].origin)
	_touched = now

# ---------- small helpers ----------
static func sm(a: float, b2: float, x: float) -> float:
	var t := clampf((x - a) / (b2 - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

static func damp(v: float, to: float, k: float, dt: float) -> float:
	return v + (to - v) * (1.0 - exp(-dt * k))

# a critically damped spring step: [x, v] toward `to`
static func spring(s: Vector2, to: float, om: float, dt: float, zeta := 1.0) -> Vector2:
	var n := maxi(1, ceili(dt / 0.016))
	var h := dt / n
	for i in n:
		s.y += ((to - s.x) * om * om - 2.0 * zeta * om * s.y) * h
		s.x += s.y * h
	return s

# the depth of the mesh below a bone segment (a -> b, rest positions), along `side`
# (for resting a body on the ground): the furthest skinned vertex past the line
func mesh_depth(a: Vector3, b2: Vector3, side: Vector3) -> float:
	var best := 0.0
	var ab := b2 - a
	var l2 := ab.length_squared()
	for m3 in meshes:
		for s in m3.mesh.get_surface_count():
			var arr := m3.mesh.surface_get_arrays(s)
			for v: Vector3 in arr[Mesh.ARRAY_VERTEX]:
				var t := (v - a).dot(ab) / l2
				if t < 0.0 or t > 1.0: continue
				var off := v - (a + ab * t)
				best = maxf(best, off.dot(side))
	return best
