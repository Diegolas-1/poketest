class_name BikeMesh
extends RefCounted
# The bicycle's geometry kit (bike_model.gd builds every part with it): surfaces
# collected per material and turned into one ArrayMesh per moving part. Smooth
# normals wherever a part is round (tubes, swept paths, lathes, lofts), so the
# characters' ink hull (ink.gd) draws clean lines round them; boxes and flat
# discs have flat normals and go in the part's no-ink mesh.
#
#   var m := BikeMesh.new()
#   m.tube(a, b, r0, r1, "frame")             a straight tube (no caps)
#   m.sweep(points, r, "metal")               a round tube along a polyline (parallel frames)
#   m.lathe(o, axis, profile, "rubber")       turned about an axis: profile = [Vector2(radius, along)]
#   m.loft(rings, "leather")                  rings of points joined in order (closed rings)
#   m.box(xf, size, "metal")                  flat-shaded box
#   m.patch(o, axis, r, a0, a1, t0, t1, ...)  a piece of a cylinder's surface (decals)
#   m.commit() -> ArrayMesh                   (surfaces named by material key)

const SIDES := 10

var surf := {}     # material key -> {v: PackedVector3Array, n, uv: PackedVector2Array, i: PackedInt32Array}
var q := 1.0       # detail: segments round are scaled by this (the townspeople's bikes: fewer)

func _n(k: int, lo := 4) -> int: return maxi(lo, int(round(k * q)))

func _s(mat: String) -> Dictionary:
	if not surf.has(mat): surf[mat] = {"v": PackedVector3Array(), "n": PackedVector3Array(), "uv": PackedVector2Array(), "i": PackedInt32Array()}
	return surf[mat]

func empty() -> bool:
	return surf.is_empty()

# ---------- helpers ----------
static func perp(d: Vector3) -> Vector3:
	var a := Vector3.UP if absf(d.normalized().y) < 0.9 else Vector3.RIGHT
	return d.cross(a).normalized()

# a grid of rows x cols vertices already pushed at base: quads between them
static func _grid(S: Dictionary, base: int, rows: int, cols: int, wrap: bool) -> void:
	var c2 := cols if wrap else cols - 1
	for r in rows - 1:
		for c in c2:
			var a := base + r * cols + c
			var b := base + r * cols + (c + 1) % cols
			var d := a + cols
			var e := b + cols
			S.i.append_array([a, d, b, b, d, e])

# ---------- tubes ----------
func tube(a: Vector3, b: Vector3, r0: float, r1: float, mat: String, sides := SIDES, u0 := 0.0, u1 := 1.0) -> void:
	sides = _n(sides)
	var d := b - a
	if d.length() < 1e-5: return
	var x := perp(d)
	var y := d.normalized().cross(x)
	var S := _s(mat)
	var base: int = S.v.size()
	var slope := (r0 - r1) / d.length()
	for k in 2:
		var o := a if k == 0 else b
		var r := r0 if k == 0 else r1
		for s in sides:
			var t := TAU * s / sides
			var n := x * cos(t) + y * sin(t)
			S.v.append(o + n * r)
			S.n.append((n + d.normalized() * slope).normalized())
			S.uv.append(Vector2(u0 if k == 0 else u1, float(s) / sides))
	_grid(S, base, 2, sides, true)

# a round tube along a polyline, frames carried along without twist; caps: 0 none, 1 start, 2 end, 3 both (domed)
func sweep(pts: Array, r, mat: String, sides := SIDES, caps := 0, closed := false) -> void:
	sides = _n(sides)
	var n := pts.size()
	if n < 2: return
	var S := _s(mat)
	var base: int = S.v.size()
	var tang: Array[Vector3] = []
	for i in n:
		var t: Vector3
		if closed: t = (pts[(i + 1) % n] - pts[(i - 1 + n) % n])
		elif i == 0: t = pts[1] - pts[0]
		elif i == n - 1: t = pts[n - 1] - pts[n - 2]
		else: t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
		tang.append(t.normalized())
	var x := perp(tang[0])
	var along := 0.0
	var rows := n + (1 if closed else 0)
	for k in rows:
		var i := k % n
		if k > 0:
			var tprev: Vector3 = tang[(k - 1) % n]
			var ti: Vector3 = tang[i]
			var ax := tprev.cross(ti)
			if ax.length() > 1e-6: x = x.rotated(ax.normalized(), tprev.angle_to(ti))
			along += (pts[i] as Vector3).distance_to(pts[(k - 1) % n])
		x = (x - tang[i] * x.dot(tang[i])).normalized()
		var y: Vector3 = tang[i].cross(x)
		var rr: float = r[i] if r is Array else float(r)
		for s in sides:
			var a := TAU * s / sides
			var nn := x * cos(a) + y * sin(a)
			S.v.append(pts[i] + nn * rr)
			S.n.append(nn)
			S.uv.append(Vector2(along, float(s) / sides))
	_grid(S, base, rows, sides, true)
	if caps & 1: _dome(pts[0], -tang[0], r[0] if r is Array else float(r), mat, sides)
	if caps & 2: _dome(pts[n - 1], tang[n - 1], r[n - 1] if r is Array else float(r), mat, sides)

# a rounded end on a tube: a low dome (smooth normals, so the ink stays clean)
func _dome(o: Vector3, d: Vector3, r: float, mat: String, sides: int) -> void:
	var prof: Array = []
	for k in 4:
		var a := PI * 0.5 * k / 3.0
		prof.append(Vector2(r * cos(a), r * 0.6 * sin(a)))
	lathe(o, d, prof, mat, sides)

# a helix (coil springs): turns about the axis a -> b
func helix(a: Vector3, b: Vector3, R: float, r: float, turns: float, mat: String) -> void:
	var d := b - a
	var x := perp(d)
	var y := d.normalized().cross(x)
	var pts: Array = []
	var n := int(turns * 14) + 2
	for i in n:
		var u := float(i) / (n - 1)
		var t := u * turns * TAU
		pts.append(a + d * u + (x * cos(t) + y * sin(t)) * R)
	sweep(pts, r, mat, 6)

# ---------- turned shapes ----------
# profile: Vector2(radius, distance along the axis) from one end to the other;
# the normals follow the profile's slope (smooth). seg: segments round.
func lathe(o: Vector3, axis: Vector3, prof: Array, mat: String, seg := 24, a0 := 0.0, a1 := TAU, flat := false) -> void:
	seg = _n(seg, 6)
	var ax := axis.normalized()
	var x := perp(ax)
	var y := ax.cross(x)
	var S := _s(mat)
	var m := prof.size()
	var full := absf(a1 - a0 - TAU) < 1e-4
	var cols := seg if full else seg + 1
	var base: int = S.v.size()
	for k in m:
		var p: Vector2 = prof[k]
		var t: Vector2
		if k == 0: t = prof[1] - prof[0]
		elif k == m - 1: t = prof[m - 1] - prof[m - 2]
		else: t = (prof[k + 1] - prof[k - 1])
		# the profile's outward normal: its tangent turned (radius grows outward)
		var nr := Vector2(t.y, -t.x).normalized()
		if t.length() < 1e-9: nr = Vector2(1, 0)
		for s in cols:
			var a := a0 + (a1 - a0) * s / seg
			var rd := x * cos(a) + y * sin(a)
			S.v.append(o + rd * p.x + ax * p.y)
			S.n.append((rd * nr.x + ax * nr.y).normalized())
			S.uv.append(Vector2(float(k) / maxf(1, m - 1), float(s) / seg))
	_grid(S, base, m, cols, full)

# a torus (a tyre, a ring): major radius R in the plane normal to axis, tube radius r
func torus(o: Vector3, axis: Vector3, R: float, r: float, mat: String, seg := 48, sides := 10, from := 0.0, to := TAU) -> void:
	sides = _n(sides, 3)
	var prof: Array = []
	for k in sides + 1:
		var a := from + (to - from) * k / sides
		prof.append(Vector2(R + r * cos(a), r * sin(a)))
	lathe(o, axis, prof, mat, seg)

# ---------- lofts ----------
# rings: Array of PackedVector3Array (same size, closed); joined in order; smooth
# normals averaged from the faces; caps: close the first / last ring with a fan
func loft(rings: Array, mat: String, cap0 := false, cap1 := false) -> void:
	var S := _s(mat)
	var base: int = S.v.size()
	var rows := rings.size()
	var cols: int = (rings[0] as PackedVector3Array).size()
	var nrm := PackedVector3Array()
	nrm.resize(rows * cols)
	for r in rows:
		for c in cols:
			var R: PackedVector3Array = rings[r]
			var p := R[c]
			var along: Vector3 = (rings[mini(r + 1, rows - 1)] as PackedVector3Array)[c] - (rings[maxi(r - 1, 0)] as PackedVector3Array)[c]
			var round := R[(c + 1) % cols] - R[(c - 1 + cols) % cols]
			var nn := round.cross(along)
			nrm[r * cols + c] = nn.normalized() if nn.length() > 1e-9 else Vector3.UP
			S.v.append(p)
			S.uv.append(Vector2(float(r) / maxf(1, rows - 1), float(c) / cols))
	S.n.append_array(nrm)
	_grid(S, base, rows, cols, true)
	for k in 2:
		if (k == 0 and not cap0) or (k == 1 and not cap1): continue
		var R2: PackedVector3Array = rings[0 if k == 0 else rows - 1]
		var cen := Vector3.ZERO
		for p in R2: cen += p
		cen /= R2.size()
		var b2: int = S.v.size()
		S.v.append(cen); S.n.append(nrm[0 if k == 0 else (rows - 1) * cols] * 0.0 + ((R2[1] - R2[0]).cross(R2[2] - R2[0])).normalized() * (-1.0 if k == 0 else 1.0)); S.uv.append(Vector2(0.5, 0.5))
		for c in cols:
			S.v.append(R2[c]); S.n.append(S.n[b2]); S.uv.append(Vector2(0.5, 0.5))
		for c in cols:
			var i0 := b2 + 1 + c
			var i1 := b2 + 1 + (c + 1) % cols
			if k == 0: S.i.append_array([b2, i0, i1])
			else: S.i.append_array([b2, i1, i0])

# ---------- flat shapes ----------
func box(xf: Transform3D, size: Vector3, mat: String) -> void:
	var S := _s(mat)
	var h := size * 0.5
	var faces := [[Vector3.RIGHT, Vector3.UP, Vector3.BACK], [Vector3.LEFT, Vector3.UP, Vector3.FORWARD],
		[Vector3.UP, Vector3.BACK, Vector3.RIGHT], [Vector3.DOWN, Vector3.FORWARD, Vector3.RIGHT],
		[Vector3.BACK, Vector3.UP, Vector3.LEFT], [Vector3.FORWARD, Vector3.UP, Vector3.RIGHT]]
	for f in faces:
		var n: Vector3 = f[0]; var u: Vector3 = f[1]; var w: Vector3 = f[2]
		var base: int = S.v.size()
		var c := n * h
		var hu := u * h
		var hw := w * h
		var hu_l := absf(hu.x) + absf(hu.y) + absf(hu.z)
		var hw_l := absf(hw.x) + absf(hw.y) + absf(hw.z)
		for k in 4:
			var su := -1.0 if k < 2 else 1.0
			var sw := -1.0 if k % 3 == 0 else 1.0
			S.v.append(xf * (c + u * hu_l * su + w * hw_l * sw))
			S.n.append((xf.basis * n).normalized())
			S.uv.append(Vector2(0.5 + su * 0.5, 0.5 + sw * 0.5))
		# winding: outward
		var p0: Vector3 = S.v[base]; var p1: Vector3 = S.v[base + 1]; var p2: Vector3 = S.v[base + 2]
		if (p1 - p0).cross(p2 - p0).dot(xf.basis * n) > 0.0: S.i.append_array([base, base + 2, base + 1, base, base + 3, base + 2])
		else: S.i.append_array([base, base + 1, base + 2, base, base + 2, base + 3])

# a flat ring with teeth (a chainring, a cog): in the plane normal to axis, both faces
# and the rim, thickness th; teeth = 0 for a plain ring
func sprocket(o: Vector3, axis: Vector3, r_in: float, r_out: float, teeth: int, th: float, mat: String) -> void:
	var ax := axis.normalized()
	var x := perp(ax)
	var y := ax.cross(x)
	var S := _s(mat)
	var seg := teeth * 4 if teeth > 0 else 48
	var outer := PackedFloat32Array()
	for s in seg:
		var ph := s % 4
		var rr := r_out
		if teeth > 0: rr = r_out if ph == 1 or ph == 2 else r_out - 0.0055
		outer.append(rr)
	for side in 2:
		var off := ax * (th * 0.5 * (1.0 if side == 0 else -1.0))
		var nn := ax * (1.0 if side == 0 else -1.0)
		var base: int = S.v.size()
		for s in seg:
			var a := TAU * s / seg
			var rd := x * cos(a) + y * sin(a)
			S.v.append(o + off + rd * r_in); S.n.append(nn); S.uv.append(Vector2(0, 0))
			S.v.append(o + off + rd * outer[s]); S.n.append(nn); S.uv.append(Vector2(1, 0))
		for s in seg:
			var a := base + s * 2
			var b := base + ((s + 1) % seg) * 2
			if side == 0: S.i.append_array([a, b, a + 1, b, b + 1, a + 1])
			else: S.i.append_array([a, a + 1, b, b, a + 1, b + 1])
	# the rim (outer edge) and the inner edge
	for edge in 2:
		var base2: int = S.v.size()
		for s in seg + 1:
			var ss := s % seg
			var a := TAU * ss / seg
			var rd := x * cos(a) + y * sin(a)
			var rr: float = outer[ss] if edge == 0 else r_in
			var nn := rd if edge == 0 else -rd
			S.v.append(o + ax * th * 0.5 + rd * rr); S.n.append(nn); S.uv.append(Vector2(0, 0))
			S.v.append(o - ax * th * 0.5 + rd * rr); S.n.append(nn); S.uv.append(Vector2(0, 1))
		for s in seg:
			var a := base2 + s * 2
			var b := a + 2
			if edge == 0: S.i.append_array([a, b, a + 1, b, b + 1, a + 1])
			else: S.i.append_array([a, a + 1, b, b, a + 1, b + 1])

# a piece of a cylinder's surface (a decal wrapped round a tube): angles a0..a1 round
# the axis from perp(axis), t0..t1 along a -> b; UVs 0..1 across it
func patch(a: Vector3, b: Vector3, r: float, a0: float, a1: float, t0: float, t1: float, mat: String, segs := 8, ref := Vector3.ZERO) -> void:
	var d := b - a
	var x := perp(d) if ref == Vector3.ZERO else (ref - d.normalized() * ref.dot(d.normalized())).normalized()
	var y := d.normalized().cross(x)
	var S := _s(mat)
	var base: int = S.v.size()
	for k in 2:
		var t := t0 if k == 0 else t1
		for s in segs + 1:
			var an := a0 + (a1 - a0) * s / segs
			var n := x * cos(an) + y * sin(an)
			S.v.append(a + d * t + n * r)
			S.n.append(n)
			S.uv.append(Vector2(float(s) / segs, 1.0 - k))
	for s in segs:
		var p := base + s
		var q := base + segs + 1 + s
		S.i.append_array([p, q, p + 1, p + 1, q, q + 1])

# a disc (a lens, a reflector face): flat, facing n
func disc(o: Vector3, n: Vector3, r: float, mat: String, seg := 20) -> void:
	var S := _s(mat)
	var x := perp(n)
	var y := n.normalized().cross(x)
	var base: int = S.v.size()
	S.v.append(o); S.n.append(n.normalized()); S.uv.append(Vector2(0.5, 0.5))
	for s in seg:
		var a := TAU * s / seg
		S.v.append(o + (x * cos(a) + y * sin(a)) * r); S.n.append(n.normalized()); S.uv.append(Vector2(0.5 + 0.5 * cos(a), 0.5 + 0.5 * sin(a)))
	for s in seg:
		S.i.append_array([base, base + 1 + (s + 1) % seg, base + 1 + s])

# ---------- out ----------
func commit(mats: Dictionary) -> ArrayMesh:
	var m := ArrayMesh.new()
	var keys := surf.keys()
	keys.sort()
	for k in keys:
		var S: Dictionary = surf[k]
		if S.i.is_empty(): continue
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = S.v
		arr[Mesh.ARRAY_NORMAL] = S.n
		arr[Mesh.ARRAY_TEX_UV] = S.uv
		arr[Mesh.ARRAY_INDEX] = S.i
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		var si := m.get_surface_count() - 1
		m.surface_set_name(si, k)
		if mats.has(k): m.surface_set_material(si, mats[k])
	return m

func tris() -> int:
	var n := 0
	for k in surf: n += (surf[k].i as PackedInt32Array).size() / 3
	return n
