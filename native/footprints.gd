class_name Footprints
extends Node3D
# Footprints: everyone who walks on soft ground leaves prints behind (main.gd
# makes one; Footprints.I is it). Sand, dirt paths, mud (dirt or sand by fresh
# water, the wet sand at the sea's edge) and the arena's clay take them; grass,
# wood, stone, water and the interiors do not (ground_at).
#   people     CastActor (actor.gd) as each foot comes down: under its own foot
#              bone, the shoe by look (creatures/prints.json "people": Ash's
#              sneakers, boots, the kids' small ones)
#   Pokémon    Creature.animate (creature.gd): a stride counter by distance
#              (Emitter), the print by species (prints.json "species": paw,
#              bird, hoof, claw, webbed, stub, foot, slither or slime trail,
#              or none), none while it is off the ground (flying, a jump)
#   anyone     Footprints.step(pos, yaw, kind, side, size) lays one;
#              Footprints.emitter(kind, foot, step, gauge) gives a mover its own
#              stride counter (e.move(pos, yaw) each frame)
# Prints fade over a minute and a half (tunables/footprints.json "life"), three
# times as long in mud. A wild Pokémon's (Creature.track_tag set: wild.gd) are
# fresh: a touch darker, and a faint glint on them near Ash while he crouches.
# trail_near(pos, r) gives the recent prints by owner, newest first (for
# following one that fled).
# Cheap on the phone: a fixed ring of POOL prints in one MultiMesh (a flat quad
# each, tilted to the slope), their fade done in the shader from a birth time in
# the instance's custom data, so a frame costs one uniform; a second, small one
# for the glints. Nothing per print but a few packed array slots.

const T := preload("res://tunables.gd")
const SHADER := preload("res://shaders/footprint.gdshader")
const GLINT := preload("res://shaders/footprint_glint.gdshader")
const ATLAS := preload("res://fx/footprints.png")
# atlas cells (tools/native/footprints/atlas.py)
const KINDS := ["sneaker", "boot", "foot", "paw", "bird", "hoof", "claw", "webbed", "stub", "slither", "slime"]
const TRAILS := ["slither", "slime"]
# the quad's size for a print `foot` m long: [across, along] (the cells' drawings
# fill about this much of them; a trail: foot is its width, along its step)
const QUAD := {"sneaker": [1.18, 1.18], "boot": [1.15, 1.15], "foot": [1.2, 1.2], "paw": [1.2, 1.2], "bird": [1.1, 1.1],
	"hoof": [1.3, 1.3], "claw": [1.05, 1.05], "webbed": [1.05, 1.05], "stub": [1.2, 1.2], "slither": [4.2, 0.0], "slime": [1.6, 0.0]}
# a kind's own darkness (the slime's smear is shallower in the atlas)
const KIND_DARK := {"slime": 1.35}
# the smallest print laid (m): smaller ones are lost at the game camera's distance
const MIN_FOOT := 0.085
# how dark a print is on each ground
const DEPTH := {"sand": 0.75, "dirt": 1.0, "mud": 0.9, "clay": 0.95}

static var I: Footprints = null
static var _db := {}

var POOL := int(T.num("footprints", "pool", 640))
var LIFE := T.num("footprints", "life", 90.0)          # s on sand, dirt, clay
var MUD_LIFE := T.num("footprints", "mud_life", 3.0)   # times as long in mud
var FRESH_DARK := T.num("footprints", "fresh_dark", 1.25)
var EMIT_D := T.num("footprints", "emit_d", 55.0)      # m from the camera past which nothing is laid
const GLINTS := 24
const GLINT_D := 7.0

var game: Node = null
var on := true
var t := 0.0
var mm: MultiMesh
var mat: ShaderMaterial
var glints: MultiMesh
var gmat: ShaderMaterial
# the ring: one slot a print
var _pos := PackedVector3Array()
var _yaw := PackedFloat32Array()
var _born := PackedFloat32Array()
var _life := PackedFloat32Array()
var _kind := PackedInt32Array()
var _fresh := PackedByteArray()
var _owner: Array[String] = []
var _ground: Array[String] = []
var _next := 0
var used := 0              # slots ever filled (up to POOL)
var _tick := 0.0
var _gtick := 0.0
var _glint_on := false
var surface_fn: Callable   # (tests) the ground under a point instead of ground_at's

func _init() -> void:
	name = "Footprints"
	top_level = true

func setup(g: Node) -> void:
	game = g
	I = self
	_pos.resize(POOL); _yaw.resize(POOL); _born.resize(POOL); _life.resize(POOL)
	_kind.resize(POOL); _fresh.resize(POOL); _owner.resize(POOL); _ground.resize(POOL)
	var qm := PlaneMesh.new()
	qm.size = Vector2(1, 1)
	mat = ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("atlas", ATLAS)
	mat.render_priority = -1   # (before the other see-through things: the water, the drops)
	qm.material = mat
	mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = qm
	mm.instance_count = POOL
	mm.visible_instance_count = 0
	var mi := MultiMeshInstance3D.new()
	mi.name = "Prints"
	mi.multimesh = mm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-1e5, -1e3, -1e5), Vector3(2e5, 2e3, 2e5))
	add_child(mi)
	var gq := QuadMesh.new()
	gq.size = Vector2(1, 1)
	gmat = ShaderMaterial.new()
	gmat.shader = GLINT
	gmat.set_shader_parameter("atlas", ATLAS)
	gq.material = gmat
	glints = MultiMesh.new()
	glints.transform_format = MultiMesh.TRANSFORM_3D
	glints.use_custom_data = true
	glints.mesh = gq
	glints.instance_count = GLINTS
	glints.visible_instance_count = 0
	var gi := MultiMeshInstance3D.new()
	gi.name = "Glints"
	gi.multimesh = glints
	gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi.custom_aabb = mi.custom_aabb
	add_child(gi)
	on = int(Settings.get_value("footprints")) != 0
	visible = on
	if not Settings.changed.is_connected(_on_setting): Settings.changed.connect(_on_setting)

func _exit_tree() -> void:
	if I == self: I = null

func _on_setting(k: String, v) -> void:
	if k != "footprints": return
	on = int(v) != 0
	if not on: clear()
	visible = on and not _inside()

func _process(dt: float) -> void:
	advance(dt)

# the clock (the fade is the shader's), expiring old slots now and then, the glints
func advance(dt: float) -> void:
	t += dt
	if mat: mat.set_shader_parameter("now", fmod(t, 1024.0))
	visible = on and not _inside()
	_tick += dt
	if _tick >= 1.0:
		_tick = 0.0
		_expire()
	_gtick += dt
	if _gtick >= 0.25:
		_gtick = 0.0
		_glint()

func _inside() -> bool:
	return game != null and bool(game.get("indoors"))

# ---------- the ground ----------
# what takes a print here: "sand", "dirt", "mud", "clay", or "" (none)
func ground_at(p: Vector3) -> String:
	if surface_fn.is_valid(): return String(surface_fn.call(p))
	if game == null or _inside(): return ""
	var W = game.get("world")
	if W == null: return ""
	if W is ArenaData:
		# the arena: its clay battle field and the paths (arena_data.gd dirt_sd)
		var lx: float = p.x - ArenaData.C.x
		var lz: float = p.z - ArenaData.C.y
		if W.dirt_sd(lx, lz) >= 0.0: return ""
		return "clay" if absf(lx) < ArenaData.FIELD.x + 0.3 and absf(lz) < ArenaData.FIELD.y + 0.3 else "dirt"
	var sw = game.get("sfx_world")
	if sw == null or not sw.has_method("surface_at"): return ""
	var s: String = sw.surface_at(p)
	if s != "sand" and s != "dirt": return ""
	# mud: by fresh water; wet sand at the sea's edge
	var fr: Vector2 = sw.nearest_water(p, false)
	if Vector2(p.x, p.z).distance_squared_to(fr) < 3.2 * 3.2: return "mud"
	if s == "sand" and W.height_at(p.x, p.z) < W.sea_y + 0.3: return "mud"
	return s

func _height(x: float, z: float) -> float:
	var W = game.get("world") if game else null
	return W.height_at(x, z) if W else 0.0

# ---------- laying prints ----------
# one print at pos (its ground point) facing yaw (+z = 0), kind (KINDS), side +1
# the left foot / -1 the right (mirrored), size its length (m; a trail's width).
# owner: whose (for trail_near); fresh: a wild one's, trackable. False = none laid.
static func step(pos: Vector3, yaw: float, kind: String, side := 1, size := 0.25, owner := "", fresh := false, along := 0.0) -> bool:
	if I == null: return false
	return I.lay(pos, yaw, kind, side, size, owner, fresh, along)

func lay(pos: Vector3, yaw: float, kind: String, side: int, size: float, owner: String, fresh: bool, along := 0.0) -> bool:
	if not on or game == null and not surface_fn.is_valid(): return false
	var ki := KINDS.find(kind)
	if ki < 0: return false
	var cam: Camera3D = game.get("cam") if game else null
	if cam and is_instance_valid(cam) and cam.global_position.distance_squared_to(pos) > EMIT_D * EMIT_D: return false
	var gr := ground_at(pos)
	if gr == "": return false
	var i := _next
	_next = (_next + 1) % POOL
	used = mini(used + 1, POOL)
	mm.visible_instance_count = used
	var life := LIFE * (MUD_LIFE if gr == "mud" else 1.0)
	_pos[i] = pos; _yaw[i] = yaw; _born[i] = t; _life[i] = life; _kind[i] = ki
	_fresh[i] = 1 if fresh else 0; _owner[i] = owner; _ground[i] = gr
	# the ground's slope under it
	var y := _height(pos.x, pos.z) if game else pos.y
	var e := maxf(0.2, size * 0.6)
	var hx := _height(pos.x + e, pos.z) - _height(pos.x - e, pos.z) if game else 0.0
	var hz := _height(pos.x, pos.z + e) - _height(pos.x, pos.z - e) if game else 0.0
	var n := Vector3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)).normalized()
	var f := Vector3(sin(yaw), 0.0, cos(yaw))
	var zf := (f - n * f.dot(n)).normalized()
	var xr := n.cross(zf)
	if not kind in TRAILS: size = maxf(size, MIN_FOOT)
	var q: Array = QUAD[kind]
	var w: float = size * float(q[0])
	var l: float = size * float(q[1]) if float(q[1]) > 0.0 else maxf(along, size)
	var b := Basis(xr * w, n, zf * l)
	mm.set_instance_transform(i, Transform3D(b, Vector3(pos.x, y + 0.025, pos.z)))
	var strength: float = DEPTH.get(gr, 0.45) * float(KIND_DARK.get(kind, 1.0)) * (FRESH_DARK if fresh else 1.0)
	var cell := ki + (16 if side < 0 and not kind in TRAILS else 0)
	mm.set_instance_custom_data(i, Color(cell, fmod(t, 1024.0), life, strength))
	return true

# a print for a person's foot coming down (actor.gd): under its foot bone, the
# shoe by its look; left = the clip's lead foot (half 0)
static func person(a: CastActor, half: int) -> void:
	if I == null or not I.on or not a.is_inside_tree() or not a.is_visible_in_tree(): return
	var g = I.game
	var cam: Camera3D = g.get("cam") if g else null
	if cam and is_instance_valid(cam) and cam.global_position.distance_squared_to(a.global_position) > I.EMIT_D * I.EMIT_D: return
	var owner := "person:%d" % a.get_instance_id()
	if g and g.get("cast") and g.cast.get("player") == a:
		owner = "ash"
		if g.cast.get("bike") and g.cast.bike.riding(): return
	var lf := "L" if half == 0 else "R"
	var fb := a.skel.find_bone(lf + "Foot")
	var tb := a.skel.find_bone(lf + "Toe")
	var fwd := a.global_basis.z
	var at := a.global_position
	if fb >= 0:
		var fp := a.skel.global_transform * a.skel.get_bone_global_pose(fb).origin
		at = Vector3(fp.x, a.global_position.y, fp.z)
		if tb >= 0:
			var tp := a.skel.global_transform * a.skel.get_bone_global_pose(tb).origin
			var d := Vector3(tp.x - fp.x, 0.0, tp.z - fp.z)
			if d.length_squared() > 1e-4: fwd = fwd.lerp(d.normalized(), 0.5)
			at = at.lerp(Vector3(tp.x, at.y, tp.z), 0.45)   # (the sole's middle: between the ankle and the toe)
	var sh: Array = shoe(a.look)
	I.lay(at, atan2(fwd.x, fwd.z), String(sh[0]), 1 if half == 0 else -1, float(sh[1]), owner, false)

# ---------- the data (creatures/prints.json) ----------
static func data() -> Dictionary:
	if _db.is_empty():
		var d = JSON.parse_string(FileAccess.get_file_as_string("res://creatures/prints.json"))
		_db = d if d is Dictionary else {"people": {}, "species": {}}
	return _db

# a cast look's shoe: [kind, foot length]
static func shoe(look: String) -> Array:
	var p: Dictionary = data().get("people", {})
	return p.get(look, p.get("*", ["sneaker", 0.26]))

# a species' print: {kind, foot, step, gauge} (kind "none": it leaves none)
static func kind_of(species: String) -> Dictionary:
	var s: Dictionary = data().get("species", {})
	var k := species.replace("_", "")
	return s.get(k, {"kind": "none"})

# ---------- a mover's own stride counter ----------
class Emitter extends RefCounted:
	var kind := "paw"
	var foot := 0.1
	var stride := 0.3
	var gauge := 0.05
	var owner := ""
	var fresh := false
	var side := 1
	var acc := 0.0
	var last := Vector3(NAN, NAN, NAN)

	# each frame with its ground point and heading; air: off the ground (no print, the
	# count starts again when it lands)
	func move(p: Vector3, yaw: float, air := false) -> void:
		if is_nan(last.x) or air:
			last = p; acc = 0.0
			return
		var d := Vector2(p.x - last.x, p.z - last.z).length()
		last = p
		if d > 3.0: acc = 0.0; return   # (put somewhere: no trail across)
		acc += d
		if acc < stride: return
		acc -= stride
		if acc > stride: acc = 0.0
		var x := Vector3(cos(yaw), 0.0, -sin(yaw))   # its left (+x at yaw 0)
		var at := p + x * gauge * side
		if kind in Footprints.TRAILS:
			# a trail: segments end to end, each one stride long (a hair more, so no seam
			# shows), ending where the last one's stride ran out
			at = p - Vector3(sin(yaw), 0.0, cos(yaw)) * (acc + stride * 0.5)
		Footprints.step(at, yaw, kind, side, foot, owner, fresh, stride * 1.03)
		side = -side

static func emitter(kind: String, foot: float, stride: float, gauge := 0.0, owner := "", fresh := false) -> Emitter:
	var e := Emitter.new()
	e.kind = kind; e.foot = foot; e.stride = stride; e.gauge = gauge; e.owner = owner; e.fresh = fresh
	return e

# a Pokémon's, from its species (null for one that leaves none)
static func emitter_for(species: String, owner := "", fresh := false) -> Emitter:
	var k := kind_of(species)
	if String(k.get("kind", "none")) == "none": return null
	return emitter(String(k.kind), float(k.foot), float(k.step), float(k.get("gauge", 0.0)), owner, fresh)

# Creature.animate: its stride counter, made the first time (track_tag set = a
# wild one's fresh, trackable trail)
static func creature(c: Node3D) -> void:
	if I == null or not I.on or not c.is_inside_tree(): return
	var e = c.get_meta("_fp") if c.has_meta("_fp") else null
	if e == null:
		e = emitter_for(String(c.get("species")))
		if e == null: e = false
		c.set_meta("_fp", e)
	if not e is Emitter: return
	var tag := String(c.get("track_tag"))
	e.owner = tag if tag != "" else "pkmn:%d" % c.get_instance_id()
	e.fresh = tag != ""
	var h = c.get("height")
	var fl = c.get("flying")
	var air: bool = (h != null and float(h) > 0.12) or (fl != null and bool(fl))
	var gb := c.global_basis.z
	e.move(c.global_position, atan2(gb.x, gb.z), air or not c.is_visible_in_tree())

# ---------- the old ones ----------
func _expire() -> void:
	for i in used:
		if _life[i] > 0.0 and t - _born[i] > _life[i]:
			_life[i] = 0.0
			mm.set_instance_custom_data(i, Color(0, 0, 0, 0))

func clear() -> void:
	for i in POOL: _life[i] = 0.0
	used = 0; _next = 0
	if mm: mm.visible_instance_count = 0
	if glints: glints.visible_instance_count = 0

func live() -> int:
	var n := 0
	for i in used: if _life[i] > 0.0 and t - _born[i] <= _life[i]: n += 1
	return n

# how much is left of a print (1 new .. 0 gone), as the shader fades it
func fade_of(i: int) -> float:
	if _life[i] <= 0.0: return 0.0
	var age := t - _born[i]
	if age > _life[i]: return 0.0
	return 1.0 - smoothstep(_life[i] * 0.33, _life[i], age)

# ---------- tracking ----------
# the prints within r of pos still showing, by owner, each newest first:
# {owner: [{pos, yaw, age, kind, ground, fresh}]}
static func trail_near(pos: Vector3, r: float) -> Dictionary:
	if I == null: return {}
	return I.near(pos, r)

func near(pos: Vector3, r: float) -> Dictionary:
	var out := {}
	var r2 := r * r
	for i in used:
		if _life[i] <= 0.0: continue
		var age := t - _born[i]
		if age > _life[i]: continue
		var p := _pos[i]
		if Vector2(p.x - pos.x, p.z - pos.z).length_squared() > r2: continue
		var o := _owner[i]
		if not out.has(o): out[o] = []
		out[o].append({"pos": p, "yaw": _yaw[i], "age": age, "kind": KINDS[_kind[i]], "ground": _ground[i], "fresh": _fresh[i] == 1})
	for o in out: out[o].sort_custom(func(a, b): return a.age < b.age)
	return out

# the glints: the fresh prints near Ash while he crouches
func _glint() -> void:
	var cast = game.get("cast") if game else null
	var crouch: bool = cast != null and bool(cast.get("crouching"))
	if not crouch or not visible:
		if _glint_on: glints.visible_instance_count = 0; _glint_on = false
		return
	var me: Vector3 = game.get("pos")
	var n := 0
	for i in used:
		if n >= GLINTS: break
		if _fresh[i] == 0 or _life[i] <= 0.0: continue
		var p := _pos[i]
		var d := Vector2(p.x - me.x, p.z - me.z).length()
		if d > GLINT_D: continue
		var k := fade_of(i) * (1.0 - smoothstep(GLINT_D * 0.6, GLINT_D, d))
		if k <= 0.02: continue
		var s := 0.22
		glints.set_instance_transform(n, Transform3D(Basis.from_scale(Vector3(s, s, s)), Vector3(p.x, _height(p.x, p.z) + 0.07, p.z)))
		glints.set_instance_custom_data(n, Color(fmod(float(i) * 0.618, 1.0), k * 1.2, 0, 0))
		n += 1
	glints.visible_instance_count = n
	_glint_on = n > 0
