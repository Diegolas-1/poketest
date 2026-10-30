class_name ArenaRegions
extends RefCounted
# The Battle Arena's regions (arena/regions/*.gd): small showcase places round the
# hub (the training ground: the clay field, the meadow, its tall grass), each
# through a gate in the hub's fence, each its own palette of props, materials and
# ground, and its own encounters. A region is one file whose def() gives:
#   id, name, sign, sub, blurb, order
#   rect [x0, z0, x1, z1]     its ground (the hills stay out of it), local metres
#   walk [x0, z0, x1, z1]     where Ash may walk in it
#   gate {side n|e|w, u, half} the opening in the hub's fence it is reached by
#   spawn [x, z], yaw         where the menu's GO puts him
#   ground {tint, moss, dens, roll, dirt {d_mid...}}   its floor
#   paths [[a, b, half width]], tall [[x, z, hx, hz]], clear [[x, z, r]]
#   props {kind: n}           the palette's counts (arena/arena_region.gd builds them)
#   sources {source: [species]}, hunt {species, count, lv, temper}
#   life                      a script for its own mechanics (optional)
# Adding a cave, a beach or a night meadow later: drop its file in regions/.
#
#   ArenaRegions.all()            the defs, in their order
#   ArenaRegions.get_def(id)      one ({} if none)
#   ArenaRegions.at(x, z)         the region whose rect holds that local point ("" = the hub)

const DIR := "res://arena/regions/"

static var _all: Array = []

static func all() -> Array:
	if not _all.is_empty(): return _all
	var files := []
	var d := DirAccess.open(DIR)
	if d:
		for f in d.get_files():
			# (an export lists the scripts as .gd.remap / .gdc)
			var nm := f.trim_suffix(".remap").trim_suffix(".gdc")
			if nm.ends_with(".gd") and not files.has(nm): files.append(nm)
	for f in files:
		var s = load(DIR + f)
		if s == null or not (s as Script).can_instantiate(): continue
		var o = (s as Script).new()
		if not o.has_method("def"): continue
		var dd: Dictionary = o.def()
		if not dd.has("id") or not dd.has("rect"): continue
		_all.append(dd)
	_all.sort_custom(func(a, b): return int(a.get("order", 99)) < int(b.get("order", 99)))
	return _all

static func get_def(id: String) -> Dictionary:
	for r in all():
		if String(r.id) == id: return r
	return {}

static func rect(r: Dictionary) -> Rect2:
	var a: Array = r.rect
	return Rect2(a[0], a[1], float(a[2]) - float(a[0]), float(a[3]) - float(a[1]))

static func walk_rect(r: Dictionary) -> Rect2:
	var a: Array = r.get("walk", r.rect)
	return Rect2(a[0], a[1], float(a[2]) - float(a[0]), float(a[3]) - float(a[1]))

static func at(x: float, z: float) -> String:
	for r in all():
		if rect(r).has_point(Vector2(x, z)): return String(r.id)
	return ""

# signed distance (m) from a local point to a rect: < 0 inside
static func rect_sd(rc: Rect2, x: float, z: float) -> float:
	var c := rc.get_center()
	var q := Vector2(absf(x - c.x), absf(z - c.y)) - rc.size * 0.5
	return Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0)

# the gate's middle in the hub's fence (local), and the way out through it
static func gate_at(r: Dictionary, fence: float) -> Vector2:
	var g: Dictionary = r.get("gate", {})
	var u := float(g.get("u", 0.0))
	match String(g.get("side", "n")):
		"e": return Vector2(fence, u)
		"w": return Vector2(-fence, u)
		"s": return Vector2(u, fence)
	return Vector2(u, -fence)

static func gate_out(r: Dictionary) -> Vector2:
	return {"e": Vector2(1, 0), "w": Vector2(-1, 0), "s": Vector2(0, 1)}.get(String(r.get("gate", {}).get("side", "n")), Vector2(0, -1))
