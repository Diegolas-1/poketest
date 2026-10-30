class_name ForestProps
extends RefCounted
# The forest palette (props library): toon props for a wood, in the baked
# plants' look (props/prop_mats.gd: their bark and cel bands), each an ArrayMesh
# with a surface per material, to be drawn as MultiMeshes (props/prop_scatter.gd).
# The Battle Arena's forest region builds its grove from these
# (arena/arena_region.gd); the open world can place them the same way.
# Each stands on y = 0 at its origin, its long side along x.
#   fallen_log(seed)   a fallen trunk half sunk, its root plate torn up at one end,
#                      a splintered break at the other, moss, bracket fungi, ferns
#   stump(seed)        a cut stump with root flares, growth rings, moss, a toadstool
#   mushrooms(seed)    a cluster of toadstools: red caps with white spots, or tan ones
#   fern(seed)         a clump of arching fronds
#   limb(b, from, to)  a branch out of a trunk, a leafy tuft at its tip (cocoons hang from these)
#   hive()             a Beedrill hive: a banded paper teardrop on a stalk
#   nest(eggs)         a twig nest with eggs
#   litter(b, at, n)   fallen leaves and twigs lying on the ground (cards)

const BARK := "bark_5166fe7f0006b97d.png"      # a warm brown bark (the baked trees')
const BARK_OLD := "bark_850d9aeb282605e6.png"  # a darker, rougher one
const WOOD := Color(0.8, 0.62, 0.4)
const MOSS := Color(0.36, 0.55, 0.22)
const MOSS2 := Color(0.5, 0.68, 0.3)
const EARTH := Color(0.4, 0.29, 0.19)

static func mats() -> Dictionary:
	return {"bark": PropMats.bark(BARK), "bark2": PropMats.bark(BARK_OLD, false), "vc": PropMats.vc(),
		"leaf": PropMats.leaf(PropMats.LEAF_GREEN), "forest": PropMats.leaf(PropMats.ATLAS)}

static func _r(sd: int) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = sd * 7919 + 13
	return r

# ---------- a fallen log ----------
static func fallen_log(sd := 1, L := 5.5, rad := 0.42) -> ArrayMesh:
	var r := _r(sd)
	var b := PropMesh.new()
	var cy := rad * 0.62
	var pts := []; var radii := []
	for i in 8:
		var t := i / 7.0
		var x := (t - 0.5) * L
		pts.append(Vector3(x, cy + sin(t * 2.6 + sd) * 0.06, sin(t * 3.1 + sd) * 0.18))
		radii.append(rad * lerpf(1.0, 0.8, t) * (1.0 + 0.05 * sin(t * 11.0 + sd)))
	b.tube("bark", pts, radii, 12, Color.WHITE, 1.6, 2.0)
	# the broken top end: a torn face ringed with splinters
	var tip: Vector3 = pts.back()
	var tr: float = radii.back()
	b.disc("vc", tip + Vector3(0.02, 0, 0), Vector3.RIGHT, tr * 0.96, WOOD, 12, true)
	for k in 9:
		var a := TAU * k / 9.0 + r.randf() * 0.3
		var o := Vector3(0, sin(a), cos(a)) * tr * 0.72
		b.cone("vc", tip + o, Vector3(1.0, sin(a) * 0.25 + r.randf_range(-0.2, 0.2), cos(a) * 0.25 + r.randf_range(-0.2, 0.2)), r.randf_range(0.18, 0.5), r.randf_range(0.07, 0.12), WOOD.darkened(r.randf() * 0.15), 4)
	# the root plate at the foot: torn-up roots fanning out of the base, earth caught in them
	var foot: Vector3 = pts[0]
	b.blob("vc", foot + Vector3(-0.18, 0.12, 0), Vector3(0.3, rad * 2.0, rad * 2.3), EARTH, sd, 1, EARTH.lightened(0.12))
	for k in 9:
		var a := TAU * k / 9.0 + r.randf() * 0.4
		var dir := Vector3(-0.35, sin(a) * 0.9 - 0.1, cos(a)).normalized()
		var p0 := foot + Vector3(-0.1, sin(a) * rad * 0.7, cos(a) * rad * 0.7)
		var p1 := p0 + dir * 0.5 + Vector3(0, r.randf_range(-0.1, 0.1), 0)
		var p2 := p1 + (dir + Vector3(-0.2, r.randf_range(-0.4, 0.2), r.randf_range(-0.3, 0.3))).normalized() * r.randf_range(0.4, 0.8)
		p2.y = maxf(p2.y, 0.02)
		b.tube("bark2", [p0, p1, p2], [0.13, 0.08, 0.02], 6, Color(0.85, 0.8, 0.75), 1.0)
	# snapped branch stubs, pale at the break
	for k in 3:
		var x := r.randf_range(-0.3, 0.35) * L
		var a := (1.0 if k % 2 == 0 else -1.0) * r.randf_range(0.6, 1.2)
		var bp := Vector3(x, cy + cos(a) * rad * 0.8, sin(a) * rad * 0.8)
		var ep := bp + Vector3(r.randf_range(-0.2, 0.2), cos(a), sin(a)) * r.randf_range(0.3, 0.6)
		b.tube("bark", [bp, ep], [0.08, 0.05], 6, Color.WHITE, 1.0, 0.5, [false, true], WOOD)
	# moss over its top, bracket fungi on its sides
	for k in 5:
		var x := (k / 4.0 - 0.5) * L * 0.8 + r.randf_range(-0.3, 0.3)
		b.blob("vc", Vector3(x, cy + rad * 0.82, r.randf_range(-0.1, 0.1)), Vector3(r.randf_range(0.35, 0.6), 0.1, rad * 0.7), MOSS, sd + k, 1, MOSS2)
	for k in 6:
		var x := r.randf_range(-0.4, 0.4) * L
		var side := 1.0 if r.randf() < 0.5 else -1.0
		var s := r.randf_range(0.7, 1.3)
		var col := Color(0.9, 0.76, 0.52) if r.randf() < 0.5 else Color(0.84, 0.64, 0.4)
		b.blob("vc", Vector3(x, cy + r.randf_range(-0.1, 0.25) * rad, side * rad * 0.95), Vector3(0.14 * s, 0.035 * s, 0.11 * s), col, sd + 20 + k, 1, col.lightened(0.15))
	# a few ferns sprouting from the rot
	for k in 4:
		var x := r.randf_range(-0.35, 0.35) * L
		var c := Vector3(x, cy + rad * 0.75, r.randf_range(-0.15, 0.15))
		for f in 4:
			var a := TAU * f / 4.0 + r.randf()
			b.frond("leaf", c, Vector3(cos(a), 0, sin(a)), r.randf_range(0.45, 0.7), 0.26, PropMats.G_FROND, 0.6)
	return b.mesh(mats())

# ---------- a stump ----------
static func stump(sd := 1, rad := 0.48, h := 0.65) -> ArrayMesh:
	var r := _r(sd + 100)
	var b := PropMesh.new()
	var top := h + r.randf_range(-0.1, 0.15)
	b.tube("bark", [Vector3(0, -0.05, 0), Vector3(0, top * 0.4, 0), Vector3(0, top, 0)], [rad * 1.3, rad * 1.05, rad], 12, Color.WHITE, 1.4, 2.0)
	# the cut, tilted a little, with its rings; a chipped rim
	b.disc("vc", Vector3(0, top + 0.01, 0), Vector3(r.randf_range(-0.08, 0.08), 1, r.randf_range(-0.08, 0.08)).normalized(), rad * 0.97, WOOD, 14, true)
	for k in 5:
		var a := TAU * k / 5.0 + r.randf() * 0.5
		b.cone("vc", Vector3(cos(a), 0, sin(a)) * rad * 0.85 + Vector3(0, top - 0.02, 0), Vector3(cos(a) * 0.2, 1, sin(a) * 0.2), r.randf_range(0.06, 0.16), 0.07, WOOD.darkened(0.1), 4)
	# root flares spreading into the ground
	for k in 6:
		var a := TAU * k / 6.0 + r.randf() * 0.4
		var o := Vector3(cos(a), 0, sin(a))
		b.tube("bark", [o * rad * 0.8 + Vector3(0, 0.28, 0), o * rad * 1.4 + Vector3(0, 0.08, 0), o * rad * (2.0 + r.randf() * 0.6) + Vector3(0, -0.06, 0)],
			[0.17, 0.11, 0.04], 6, Color.WHITE, 1.0)
	# moss up one side, a toadstool at its foot
	var ma := r.randf() * TAU
	b.blob("vc", Vector3(cos(ma), 0, sin(ma)) * rad * 0.95 + Vector3(0, top * 0.35, 0), Vector3(0.26, top * 0.42, 0.26), MOSS, sd, 1, MOSS2)
	_toadstool(b, Vector3(cos(ma + 1.6), 0, sin(ma + 1.6)) * rad * 1.45, 0.75, r, true)
	return b.mesh(mats())

# ---------- toadstools ----------
static func _toadstool(b: PropMesh, at: Vector3, s: float, r: RandomNumberGenerator, red: bool) -> void:
	var sh := r.randf_range(0.12, 0.24) * s
	b.tube("vc", [at, at + Vector3(r.randf_range(-0.02, 0.02), sh, r.randf_range(-0.02, 0.02))], [0.045 * s, 0.035 * s], 6, Color(0.96, 0.93, 0.84))
	var cr := r.randf_range(0.1, 0.16) * s
	var cap := red
	var col := Color(0.86, 0.2, 0.15) if cap else Color(0.78, 0.58, 0.36)
	var top := at + Vector3(0, sh - 0.02 * s, 0)
	b.lathe("vc", top, [[cr * 0.3, -0.01], [cr, 0.0], [cr * 0.95, cr * 0.35], [cr * 0.7, cr * 0.7], [cr * 0.3, cr * 0.9], [0.0, cr * 0.95]], 10,
		[Color(0.95, 0.9, 0.78), col.darkened(0.12), col, col, col.lightened(0.08), col.lightened(0.1)])
	if cap:
		# the white spots
		for k in 5:
			var a := TAU * k / 5.0 + r.randf() * 0.6
			var e := r.randf_range(0.35, 0.75)
			var p := Vector3(cos(a) * cr * 0.8 * cos(e), cr * 0.9 * sin(e) + 0.01, sin(a) * cr * 0.8 * cos(e))
			b.blob("vc", top + p, Vector3(0.024, 0.012, 0.024) * s * 1.4, Color(1, 0.98, 0.93), k, 0)
	else:
		b.blob("vc", top + Vector3(0, cr * 0.85, 0), Vector3(cr * 0.4, 0.02, cr * 0.4), col.lightened(0.18), 3, 0)

static func mushrooms(sd := 1, red := true) -> ArrayMesh:
	var r := _r(sd + 300)
	var b := PropMesh.new()
	var n := r.randi_range(3, 6)
	for k in n:
		var a := r.randf() * TAU
		var d := r.randf_range(0.0, 0.32) if k > 0 else 0.0
		_toadstool(b, Vector3(cos(a) * d, 0, sin(a) * d), r.randf_range(0.6, 1.25) if k > 0 else 1.35, r, red)
	# a little moss and litter round them
	b.blob("vc", Vector3(0, -0.02, 0), Vector3(0.38, 0.04, 0.32), MOSS, sd, 1, MOSS2, true)
	return b.mesh(mats())

# ---------- a fern clump ----------
static func fern(sd := 1, s := 1.0) -> ArrayMesh:
	var r := _r(sd + 500)
	var b := PropMesh.new()
	var n := r.randi_range(7, 10)
	for k in n:
		var a := TAU * k / n + r.randf_range(-0.25, 0.25)
		var ln := r.randf_range(0.65, 1.05) * s
		b.frond("leaf", Vector3(cos(a), 0, sin(a)) * 0.06, Vector3(cos(a), 0, sin(a)), ln, ln * 0.42, PropMats.G_FROND if k % 3 != 2 else PropMats.G_FAN, r.randf_range(0.35, 0.8))
	# a couple standing up in the middle
	for k in 2:
		var a := r.randf() * TAU
		b.frond("leaf", Vector3.ZERO, Vector3(cos(a), 0, sin(a)) * 0.35, 0.8 * s, 0.3 * s, PropMats.G_FROND, 0.05)
	return b.mesh(mats())

# ---------- a branch out of a trunk (into a shared builder) ----------
# from: on the trunk, to: its tip; a droop in the middle, a leafy tuft at the tip
static func limb(b: PropMesh, from: Vector3, to: Vector3, r0 := 0.11, tuft := true, sd := 0) -> void:
	var mid := from.lerp(to, 0.55) + Vector3(0, 0.12 + 0.05 * sin(sd), 0)
	var m2 := from.lerp(to, 0.82) + Vector3(0, 0.05, 0)
	b.tube("bark", [from, from.lerp(mid, 0.5), mid, m2, to], [r0, r0 * 0.85, r0 * 0.62, r0 * 0.45, r0 * 0.25], 7, Color.WHITE, 1.2, 1.0)
	# a twig off it
	var d := (to - from).normalized()
	var side := d.cross(Vector3.UP).normalized()
	var tb := from.lerp(to, 0.6)
	b.tube("bark", [tb, tb + (d * 0.5 + side * 0.45 + Vector3(0, 0.3, 0))], [r0 * 0.35, r0 * 0.12], 5, Color.WHITE, 1.0)
	if tuft:
		for k in 5:
			var a := TAU * k / 5.0 + sd
			var c := to + Vector3(cos(a) * 0.25, 0.05 + 0.12 * sin(a * 2.0), sin(a) * 0.25)
			b.card("leaf", c, Vector3(cos(a), 0.7, sin(a)).normalized(), Vector3.UP, Vector2(0.9, 0.75), PropMats.G_PUFF, Vector2(0.55, 1.0))
		b.card("leaf", tb + side * 0.5 + Vector3(0, 0.3, 0), Vector3(side.x, 0.6, side.z).normalized(), Vector3.UP, Vector2(0.7, 0.6), PropMats.G_PUFF, Vector2(0.55, 1.0))

# ---------- the Beedrill hive ----------
static func hive() -> ArrayMesh:
	var b := PropMesh.new()
	# a banded teardrop of chewed paper, hanging from its stalk (origin: the stalk's top)
	var prof := []
	var cols := []
	var H := 1.45
	var R := 0.62
	var n := 15
	for i in n + 1:
		var t := float(i) / n   # 0 bottom .. 1 top
		var rr := R * pow(sin(clampf(t, 0.0, 1.0) * PI), 0.8) * (1.0 - 0.35 * t) + 0.02
		rr *= 1.0 + 0.05 * (1.0 if i % 2 == 0 else -1.0)
		prof.append([rr, -H - 0.12 + t * H])
		var band := i % 3
		cols.append([Color(0.86, 0.68, 0.36), Color(0.74, 0.55, 0.3), Color(0.92, 0.78, 0.48)][band])
	prof[0][0] = 0.0
	b.lathe("vc", Vector3.ZERO, prof, 16, cols, 0.03, 5)
	# the entrance: a dark hole low on one side, a lip round it
	var ey := -H * 0.72
	var er := R * 0.83
	b.disc("vc", Vector3(0, ey, er), Vector3(0, -0.15, 1).normalized(), 0.13, Color(0.16, 0.1, 0.06), 10)
	b.tube("vc", [Vector3(0, ey, er - 0.02), Vector3(0, ey - 0.01, er + 0.06)], [0.16, 0.15], 10, Color(0.8, 0.6, 0.32))
	# the stalk up to the branch
	b.tube("bark", [Vector3(0, -0.16, 0), Vector3(0.02, 0.0, 0), Vector3(0, 0.25, 0)], [0.09, 0.07, 0.06], 6, Color.WHITE, 1.0)
	return b.mesh(mats())

# ---------- a nest ----------
static func nest(eggs := 2) -> ArrayMesh:
	var r := _r(77)
	var b := PropMesh.new()
	b.blob("vc", Vector3(0, 0.05, 0), Vector3(0.36, 0.1, 0.36), Color(0.36, 0.25, 0.15), 1, 1, Color(0.46, 0.33, 0.2))
	for k in 46:
		var a := r.randf() * TAU
		var rr := r.randf_range(0.3, 0.46)
		var y := r.randf_range(0.03, 0.2)
		var d := Vector3(-sin(a), r.randf_range(-0.3, 0.3), cos(a)).normalized()
		var c := Vector3(cos(a) * rr, y, sin(a) * rr)
		var ln := r.randf_range(0.25, 0.45)
		var col: Color = [Color(0.55, 0.4, 0.25), Color(0.68, 0.52, 0.32), Color(0.45, 0.32, 0.2)][k % 3]
		b.tube("vc", [c - d * ln * 0.5, c + d * ln * 0.5], [0.018, 0.012], 4, col)
	for k in eggs:
		var a := TAU * k / maxf(1, eggs) + 0.4
		b.blob("vc", Vector3(cos(a) * 0.1, 0.17, sin(a) * 0.1), Vector3(0.06, 0.075, 0.06), Color(0.96, 0.93, 0.82), k, 1, Color(0.9, 0.86, 0.72))
	return b.mesh(mats())

# ---------- fallen leaves on the ground (cards into a shared builder) ----------
# ground: Callable(x, z) -> height (world), at: world centre, n cards in radius rad
static func litter(b: PropMesh, ground: Callable, at: Vector3, n: int, rad: float, r: RandomNumberGenerator) -> void:
	for k in n:
		var a := r.randf() * TAU
		var d := sqrt(r.randf()) * rad
		var c := at + Vector3(cos(a) * d, 0, sin(a) * d)
		var s := r.randf_range(0.35, 0.7)
		var yaw := r.randf() * TAU
		var tile := PropMats.T_LITTER if r.randf() < 0.75 else PropMats.T_TWIGS
		var fx := Vector3(cos(yaw), 0, sin(yaw)) * s * 0.5
		var fz := Vector3(-sin(yaw), 0, cos(yaw)) * s * 0.5
		var P := [c - fx - fz, c + fx - fz, c + fx + fz, c - fx + fz]
		var uv := [Vector2(tile.position.x, tile.end.y), tile.end, Vector2(tile.end.x, tile.position.y), tile.position]
		var ids := []
		for q in 4:
			var p: Vector3 = P[q]
			p.y = float(ground.call(p.x, p.z)) + 0.025 + q * 0.001
			ids.append(b.vert("forest", p, Vector3.UP, uv[q], Color(0.8, 0, 0)))
		b.tri("forest", ids[0], ids[2], ids[1]); b.tri("forest", ids[0], ids[3], ids[2])
