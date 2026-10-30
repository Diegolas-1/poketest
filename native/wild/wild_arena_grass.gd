class_name WildArenaGrass
extends WildSource
# The Battle Arena's tall grass as an encounter source (arena/arena_hunt.gd's hunt):
# the patches are ArenaData's ragged blobs (TALL, tall_blob), and a spot is where
# the grass really stands tall (the grass map's own rule: tall_at > 0.35 off the
# dirt), a way in from the rim (DEEP there and still tall a metre round it) and
# clear of the plants' trunks. Region "arena" only while Ash is in the arena
# (BattleArena.I) and a hunt is on (on); the safe spots are the other patches and
# the arena's own bushes and trees (arena.gd hides).

const DEEP := 0.85         # tall_at a spot needs (1 = well inside the rim)
const ROUND := 0.9         # and the grass still tall this far round it (m)
var on := false
var zone := "hub"           # the hub's patches, or a region's (its id)
var data: ArenaData        # (null: the arena's, BattleArena.data_now())
var rng := RandomNumberGenerator.new()

func _init(d: ArenaData = null) -> void:
	id = "tall_grass"
	tells = "grass"
	data = d
	rng.randomize()

func _d() -> ArenaData:
	if data == null: data = BattleArena.data_now()
	return data

func active() -> bool: return on and BattleArena.I != null

# the patches it uses (indices into ArenaData.PATCHES)
var _ids := []
var _ids_zone := ""
func ids() -> Array:
	if _ids_zone != zone or _ids.is_empty():
		_ids = ArenaData.zone_patches(zone)
		if _ids.is_empty() and zone == "hub": _ids = range(ArenaData.TALL.size())
		_ids_zone = zone
	return _ids

static func patch(i: int) -> Array: return ArenaData.PATCHES[i] if i < ArenaData.PATCHES.size() else ArenaData.TALL[i]

static func local(p: Vector3) -> Vector2: return Vector2(p.x - ArenaData.C.x, p.z - ArenaData.C.y)
static func world(l: Vector2) -> Vector3: return Vector3(ArenaData.C.x + l.x, 0.0, ArenaData.C.y + l.y)

func region(p: Vector3) -> String:
	var l := local(p)
	return "arena" if active() and ArenaData.BOX.has_point(l) else ""

# how tall the grass draws at l (local): the blob where the dirt leaves it
func tall(l: Vector2) -> float:
	var v := ArenaData.tall_at(l.x, l.y)
	return v if v > 0.35 and _d().dirt_sd(l.x, l.y) > 0.5 else 0.0

func contains(p: Vector3) -> bool: return tall(local(p)) > 0.0

# metres to the nearest patch's rim (where the blob is 0.35), along the way to its middle
func distance(p: Vector3) -> float:
	var l := local(p)
	if tall(l) > 0.0: return 0.0
	var best := INF
	for i in ids():
		var t: Array = patch(i)
		var v := l - Vector2(t[0], t[1])
		var u := Vector2(v.x / t[2], v.y / t[3])
		var L := u.length()
		var rim := ArenaData.tall_rim(i, atan2(u.y, u.x)) - 0.117
		best = minf(best, 0.0 if L <= rim else v.length() * (1.0 - rim / L))
	return best

func patch_of(p: Vector3) -> int:
	var l := local(p)
	var bi := -1
	var bv := 0.35
	for i in ids():
		var v := ArenaData.tall_blob(i, l.x, l.y)
		if v > bv: bv = v; bi = i
	return bi

# a spot one can hide in: deep in tall grass all round, off the dirt, no trunk there
func good(p: Vector3) -> bool:
	var l := local(p)
	if ArenaData.tall_at(l.x, l.y) < DEEP or _d().dirt_sd(l.x, l.y) < 1.2: return false
	for k in 6:
		var a := TAU * k / 6.0
		if tall(l + Vector2(cos(a), sin(a)) * ROUND) < 0.5: return false
	var q := Vector3(p.x, 0.0, p.z)
	return (_d().collide(q, 0.75) - q).length() < 0.01

# somewhere hidden in patch i (-1: any, by size), or null
func random_spot(r: RandomNumberGenerator, patch_i := -1) -> Variant:
	for k in 60:
		var i := patch_i if patch_i >= 0 else _pick_patch(r)
		var t: Array = patch(i)
		var a := r.randf() * TAU
		var d := sqrt(r.randf()) * 0.95
		var p := world(Vector2(t[0], t[1]) + Vector2(cos(a) * t[2], sin(a) * t[3]) * d)
		if good(p): return p
	return null

func _pick_patch(r: RandomNumberGenerator) -> int:
	var tot := 0.0
	for i in ids(): tot += float(patch(i)[2]) * float(patch(i)[3])
	var x := r.randf() * tot
	for i in ids():
		x -= float(patch(i)[2]) * float(patch(i)[3])
		if x <= 0.0: return i
	return ids().back()

static func area(i: int) -> float: return PI * float(patch(i)[2]) * float(patch(i)[3])

func pick_spot(ash: Vector3, yaw: float, dmin: float, dmax: float, r: RandomNumberGenerator) -> Variant:
	var best = null
	var bs := -INF
	for k in 28:
		var spread := 1.2 if k < 16 else PI
		var a := yaw + r.randf_range(-spread, spread)
		var d := r.randf_range(dmin, dmax)
		var p := ash + Vector3(sin(a), 0.0, cos(a)) * d
		if not good(p): continue
		var s := cos(wrapf(a - yaw, -PI, PI)) - absf(d - (dmin + dmax) * 0.5) * 0.1 + r.randf() * 0.3
		if s > bs: bs = s; best = Vector3(p.x, 0.0, p.z)
	return best

func safe_spots(from: Vector3, r: float) -> Array:
	var out := []
	if not active(): return out
	var me := patch_of(from)
	var lf := local(from)
	for i in ids():
		if i == me: continue
		var t: Array = patch(i)
		# the side of that patch facing the one fleeing, a way in, else anywhere in it
		var c := Vector2(t[0], t[1])
		var dir := (lf - c).normalized()
		var p = null
		for f in [0.5, 0.3, 0.0]:
			var q := world(c + Vector2(dir.x * t[2], dir.y * t[3]) * f)
			if good(q): p = q; break
		if p == null: p = random_spot(rng, i)
		if p == null: continue
		if Vector2(p.x - from.x, p.z - from.z).length() <= r: out.append({"at": p, "kind": "tall_grass", "patch": i})
	var ar = BattleArena.I
	if ar:
		# (the hides of the zone it is in: one in the hub keeps to the hub's bushes and trees)
		var hz := ArenaData.region_at(lf.x, lf.y)
		for h in ar.hides:
			if String(h.get("zone", "")) != hz: continue
			var at: Vector3 = h.at
			if Vector2(at.x - from.x, at.z - from.z).length() <= r: out.append({"at": Vector3(at.x, 0.0, at.z), "kind": h.kind, "r": h.r})
	return out
