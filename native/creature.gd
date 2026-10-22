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
var mat_by := {}                     # material name -> ShaderMaterial
var look_at_pos := Vector3(NAN, NAN, NAN)
var sleep := false
var rng := RandomNumberGenerator.new()
var _tg := {}                        # bone -> global basis wanted this frame
var _tl := {}                        # bone -> local rotation this frame
var _tp := {}                        # bone -> local position this frame
var _touched := {}                   # bones written last frame (back to rest when left alone)

static func make(sp: String) -> Creature:
	var c: Creature
	match sp:
		"caterpie": c = CreatureCaterpie.new()
		_: c = Creature.new()
	c.name = "Creature_" + sp
	c._build(sp)
	return c

func _build(sp: String) -> void:
	species = sp
	rng.randomize()
	if not _scenes.has(sp): _scenes[sp] = load("res://creatures/%s.glb" % sp)
	var root: Node3D = _scenes[sp].instantiate()
	add_child(root)
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
		for s in m3.mesh.get_surface_count():
			var src := m3.mesh.surface_get_material(s)
			var m := ShaderMaterial.new()
			m.shader = SHADER
			if src is BaseMaterial3D and src.albedo_texture: m.set_shader_parameter("albedo_tex", src.albedo_texture)
			m3.set_surface_override_material(s, m)
			mats.append(m)
			mat_by[String(src.resource_name) if src else "m%d" % s] = m
	add_to_group("characters")
	_setup()

# ---------- for the species ----------
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
