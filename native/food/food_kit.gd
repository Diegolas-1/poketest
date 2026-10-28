class_name FoodKit
extends RefCounted
# The pieces the dishes (food/dishes.gd) are built from, all in code: smooth
# parametric surfaces (a grid of points, its normals from the grid itself),
# lathes (plates, bowls, cups, pancakes, tarts, rice mounds), puffs (a shape
# outline inflated: onigiri, daifuku, a hamburg steak), blobs (berries, dango,
# tofu, a dollop of cream), tubes along a curve (syrup drips, ketchup lines,
# chopsticks, a skewer, scallion), and scatters (rice grains, sesame, crumbs,
# sugar) as one MultiMesh. Colours ride on the vertices (browning, gradients);
# the materials are food.gdshader (cel bands, a glossy highlight, a warm rim).
#
#   var m := FoodKit.mat(Color("f2c46d"), {"gloss": 0.6})
#   var mi := FoodKit.node(FoodKit.lathe([Vector2(0.1, 0), Vector2(0.11, 0.01)], func(u, v): return col), m)

const SHADER := preload("res://food/food.gdshader")
const STEAM := preload("res://food/steam.gdshader")

static var _mats := {}

# a food material (cached by its settings): {gloss, gloss_size, sparkle, rim, glow, vc, deep, shade}
static func mat(c: Color, o: Dictionary = {}) -> ShaderMaterial:
	var key := "%s|%s" % [c.to_html(), str(o)]
	if _mats.has(key): return _mats[key]
	var m := ShaderMaterial.new()
	m.shader = SHADER
	m.set_shader_parameter("albedo", c)
	m.set_shader_parameter("use_vc", o.get("vc", true))
	m.set_shader_parameter("gloss", float(o.get("gloss", 0.0)))
	m.set_shader_parameter("gloss_size", float(o.get("gloss_size", 0.94)))
	m.set_shader_parameter("sparkle", float(o.get("sparkle", 0.0)))
	m.set_shader_parameter("glow", float(o.get("glow", 0.0)))
	if o.has("rim"): m.set_shader_parameter("rim", o.rim)
	if o.has("deep"): m.set_shader_parameter("deep", o.deep)
	if o.has("shade"): m.set_shader_parameter("shade", o.shade)
	_mats[key] = m
	return m

static func node(mesh: Mesh, m: Material, at := Vector3.ZERO, name := "") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.position = at
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	if name != "": mi.name = name
	return mi

# ---------- the core: a grid of points as a smooth surface ----------
# P: rows (v) of points (u); C: the same of colours (or empty: white); closed_u:
# the last column joins the first; flip: the other side out.
static func grid(P: Array, C: Array, closed_u := true, flip := false) -> ArrayMesh:
	var nv := P.size()
	var nu: int = (P[0] as PackedVector3Array).size()
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var bad := []
	for j in nv:
		var row: PackedVector3Array = P[j]
		for i in nu:
			var p: Vector3 = row[i]
			var ia := (i - 1 + nu) % nu if closed_u else maxi(0, i - 1)
			var ib := (i + 1) % nu if closed_u else mini(nu - 1, i + 1)
			var du: Vector3 = row[ib] - row[ia]
			var dv: Vector3 = (P[mini(nv - 1, j + 1)] as PackedVector3Array)[i] - (P[maxi(0, j - 1)] as PackedVector3Array)[i]
			var n := dv.cross(du)
			if n.length_squared() < 1e-16: bad.append(verts.size())
			n = n.normalized()
			if flip: n = -n
			verts.append(p); norms.append(n)
			cols.append((C[j] as PackedColorArray)[i] if not C.is_empty() else Color.WHITE)
	# a pole (a ring shrunk to a point): the mean of the next ring's normals
	for vi in bad:
		var j: int = vi / nu
		var jj := j + 1 if j < nv - 1 and not bad.has((j + 1) * nu) else j - 1
		if jj < 0 or jj >= nv: continue
		var s := Vector3.ZERO
		for i in nu: s += norms[jj * nu + i]
		if s.length_squared() > 1e-10: norms[vi] = s.normalized()
	var idx := PackedInt32Array()
	var ue := nu if closed_u else nu - 1
	for j in nv - 1:
		for i in ue:
			var a := j * nu + i
			var b := j * nu + (i + 1) % nu
			var c := (j + 1) * nu + i
			var d := (j + 1) * nu + (i + 1) % nu
			_tri(idx, verts, norms, a, b, d)
			_tri(idx, verts, norms, a, d, c)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_COLOR] = cols
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

# a triangle wound so its front faces the way its vertices' normals point (Godot: clockwise)
static func _tri(idx: PackedInt32Array, V: PackedVector3Array, N: PackedVector3Array, a: int, b: int, c: int) -> void:
	var fn := (V[b] - V[a]).cross(V[c] - V[a])
	if fn.length_squared() < 1e-16: return
	if fn.dot(N[a] + N[b] + N[c]) > 0.0:
		idx.append(a); idx.append(c); idx.append(b)
	else:
		idx.append(a); idx.append(b); idx.append(c)

static func _const(c: Color) -> Callable:
	return func(_u: float, _v: float, _p: Vector3) -> Color: return c

# ---------- shapes ----------
# a lathe: profile points (radius, height) bottom to top, turned round y.
# col(u, v, p) -> Color (u round 0..1, v along the profile 0..1); wob(u, v) ->
# a radius factor (ripples, a rough crust)
static func lathe(prof: Array, col = null, segs := 40, wob = null) -> ArrayMesh:
	if col is Color: col = _const(col)
	prof = dense(prof, 0.004)
	var P := []
	var C := []
	var n := prof.size()
	for j in n:
		var row := PackedVector3Array()
		var crow := PackedColorArray()
		var v := float(j) / maxf(1.0, n - 1)
		for i in segs:
			var u := float(i) / segs
			var a := u * TAU
			var r: float = prof[j].x
			if wob is Callable: r *= float(wob.call(u, v))
			var p := Vector3(cos(a) * r, prof[j].y, sin(a) * r)
			row.append(p)
			crow.append(col.call(u, v, p) if col is Callable else Color.WHITE)
		P.append(row); C.append(crow)
	return grid(P, C)

# a profile with no step longer than `step` (so vertex colours stay where they belong)
static func dense(prof: Array, step: float) -> Array:
	var out := [prof[0]]
	for i in range(1, prof.size()):
		var a: Vector2 = prof[i - 1]
		var b: Vector2 = prof[i]
		var n := maxi(1, ceili(a.distance_to(b) / step))
		for k in range(1, n + 1): out.append(a.lerp(b, float(k) / n))
	return out

# a profile with a rounded edge: a disc of radius r, height h, the edge rounded by e
# (pancakes, tofu-ish cakes, butter): bottom centre to top centre
static func puck(r: float, h: float, e: float, steps := 5, bottom := true) -> Array:
	var out := []
	if bottom:
		out.append(Vector2(0.0, 0.0))
		for k in steps + 1:
			var a := -PI * 0.5 + PI * 0.5 * k / steps
			out.append(Vector2(r - e + cos(a) * e, e + sin(a) * e))
	else:
		out.append(Vector2(r, 0.0))
	for k in steps + 1:
		var a := PI * 0.5 * k / steps
		out.append(Vector2(r - e + cos(a) * e, h - e + sin(a) * e))
	out.append(Vector2(0.0, h))
	return out

# a blob: a sphere of radius r scaled by s, its surface pushed by smooth noise
# (rough: the amount, freq: its size). col(u, v, p)
static func blob(r: float, s := Vector3.ONE, rough := 0.0, col = Color.WHITE, seed := 0, nu := 24, nv := 14, freq := 3.0) -> ArrayMesh:
	if col is Color: col = _const(col)
	var P := []
	var C := []
	for j in nv + 1:
		var v := float(j) / nv
		var ph := -PI * 0.5 + PI * v
		var row := PackedVector3Array()
		var crow := PackedColorArray()
		for i in nu:
			var u := float(i) / nu
			var a := u * TAU
			var d := Vector3(cos(ph) * cos(a), sin(ph), cos(ph) * sin(a))
			var k := 1.0 + rough * _noise3(d * freq + Vector3(seed * 1.7, seed * 0.3, -seed))
			var p := d * r * k * s
			row.append(p)
			crow.append(col.call(u, v, p))
		P.append(row); C.append(crow)
	return grid(P, C)

# a superellipsoid box (tofu, butter, tamagoyaki, a fish fillet): half sizes hs,
# corners rounded by e (0 sharp .. 1 round)
static func rbox(hs: Vector3, e := 0.35, col = Color.WHITE, nu := 28, nv := 14) -> ArrayMesh:
	if col is Color: col = _const(col)
	var P := []
	var C := []
	var ex := clampf(e, 0.05, 1.0)
	for j in nv + 1:
		var v := float(j) / nv
		var ph := -PI * 0.5 + PI * v
		var row := PackedVector3Array()
		var crow := PackedColorArray()
		for i in nu:
			var u := float(i) / nu
			var a := u * TAU
			var cp := _sp(cos(ph), ex); var sp := _sp(sin(ph), ex)
			var p := Vector3(cp * _sp(cos(a), ex) * hs.x, sp * hs.y, cp * _sp(sin(a), ex) * hs.z)
			row.append(p)
			crow.append(col.call(u, v, p))
		P.append(row); C.append(crow)
	return grid(P, C)

static func _sp(x: float, e: float) -> float: return signf(x) * pow(absf(x), e)

# a puff: an outline round y (radius rad(angle)) inflated to a half-thickness t
# (onigiri on its side, daifuku, a hamburg steak). flat: how flat the top is (0
# round .. 1 a slab)
static func puff(rad: Callable, t: float, flat := 0.4, col = Color.WHITE, nu := 40, nv := 14, rough := 0.0, seed := 0) -> ArrayMesh:
	if col is Color: col = _const(col)
	var P := []
	var C := []
	var ex := lerpf(1.0, 0.3, flat)
	for j in nv + 1:
		var v := float(j) / nv
		var ph := -PI * 0.5 + PI * v
		var row := PackedVector3Array()
		var crow := PackedColorArray()
		for i in nu:
			var u := float(i) / nu
			var a := u * TAU
			var r: float = rad.call(a)
			var cp := _sp(cos(ph), ex)
			var p := Vector3(cos(a) * r * cp, _sp(sin(ph), ex) * t, sin(a) * r * cp)
			if rough > 0.0: p *= 1.0 + rough * _noise3(p * 40.0 + Vector3(seed, seed * 0.5, 0))
			row.append(p)
			crow.append(col.call(u, v, p))
		P.append(row); C.append(crow)
	return grid(P, C)

# a tube along points (smoothed through them), radius r(v) (or a float), flattened
# by squash (0 round .. 0.8 a ribbon lying on what's under it, its flat side down)
static func tube(pts: Array, r, col = Color.WHITE, nu := 12, per := 6, squash := 0.0, caps := true) -> ArrayMesh:
	if col is Color: col = _const(col)
	var path := _spline(pts, per)
	var n := path.size()
	var P := []
	var C := []
	var up := Vector3.UP
	for j in n:
		var v := float(j) / maxf(1.0, n - 1)
		var tg: Vector3 = (path[mini(n - 1, j + 1)] - path[maxi(0, j - 1)]).normalized()
		var side := tg.cross(up)
		if side.length_squared() < 1e-6: side = tg.cross(Vector3.RIGHT)
		side = side.normalized()
		var nrm := side.cross(tg).normalized()
		var rr: float = r.call(v) if r is Callable else float(r)
		if caps and (j == 0 or j == n - 1): rr *= 0.35
		var row := PackedVector3Array()
		var crow := PackedColorArray()
		for i in nu:
			var u := float(i) / nu
			var a := u * TAU
			var p: Vector3 = path[j] + (side * cos(a) + nrm * sin(a) * (1.0 - squash)) * rr
			row.append(p)
			crow.append(col.call(u, v, p))
		P.append(row); C.append(crow)
	return grid(P, C)

static func _spline(pts: Array, per: int) -> Array:
	if pts.size() < 3: return pts
	var out := []
	for i in pts.size() - 1:
		var p0: Vector3 = pts[maxi(0, i - 1)]
		var p1: Vector3 = pts[i]
		var p2: Vector3 = pts[i + 1]
		var p3: Vector3 = pts[mini(pts.size() - 1, i + 2)]
		for k in per:
			var t := float(k) / per
			out.append(0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t))
	out.append(pts[pts.size() - 1])
	return out

# a flat disc (a sauce pool, a liquid's surface, a slice's face): radius r(angle),
# colour by distance from the middle (0..1)
static func disc(rad, col = Color.WHITE, nu := 40, rings := 5, dome := 0.0) -> ArrayMesh:
	var P := []
	var C := []
	for j in rings + 1:
		var v := float(j) / rings
		var row := PackedVector3Array()
		var crow := PackedColorArray()
		for i in nu:
			var a := float(i) / nu * TAU
			var r: float = rad.call(a) if rad is Callable else float(rad)
			var p := Vector3(cos(a) * r * v, dome * (1.0 - v * v), sin(a) * r * v)
			row.append(p)
			crow.append(col.call(float(i) / nu, v, p) if col is Callable else col)
		P.append(row); C.append(crow)
	return grid(P, C, true, true)

# many copies of a small mesh (grains, seeds, crumbs) as one MultiMesh: xf an
# Array of Transform3D, cols one Color each (or empty)
static func scatter(mesh: Mesh, m: Material, xf: Array, cols: Array = []) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = not cols.is_empty()
	mm.mesh = mesh
	mm.instance_count = xf.size()
	for i in xf.size():
		mm.set_instance_transform(i, xf[i])
		if mm.use_colors: mm.set_instance_color(i, cols[i])
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

# a few wisps of steam rising from p (a hot dish)
static func steam(n := 5, height := 0.16, spread := 0.03, strength := 0.1) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in n:
		var ph := float(k) / n + 0.07 * k
		var c := Color(fmod(ph, 1.0), 0, 0)
		var q := [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 0), Vector2(1, 1), Vector2(0, 1)]
		for uv in q:
			st.set_color(c); st.set_uv(uv); st.add_vertex(Vector3.ZERO)
	var mesh := st.commit()
	var m := ShaderMaterial.new()
	m.shader = STEAM
	m.set_shader_parameter("height", height)
	m.set_shader_parameter("spread", spread)
	m.set_shader_parameter("strength", strength)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-0.15, -0.05, -0.15), Vector3(0.3, height + 0.2, 0.3))
	mi.name = "steam"
	return mi

# ---------- colour helpers ----------
# a vertical gradient over a range of heights
static func vgrad(lo: Color, hi: Color, y0: float, y1: float) -> Callable:
	return func(_u: float, _v: float, p: Vector3) -> Color: return lo.lerp(hi, clampf((p.y - y0) / maxf(1e-5, y1 - y0), 0.0, 1.0))

# smooth value noise in -1..1
static func _noise3(p: Vector3) -> float:
	var i := p.floor()
	var f := p - i
	f = f * f * (Vector3(3, 3, 3) - 2.0 * f)
	var n := 0.0
	var a := _h(i); var b := _h(i + Vector3(1, 0, 0)); var c := _h(i + Vector3(0, 1, 0)); var d := _h(i + Vector3(1, 1, 0))
	var e := _h(i + Vector3(0, 0, 1)); var g := _h(i + Vector3(1, 0, 1)); var h := _h(i + Vector3(0, 1, 1)); var k := _h(i + Vector3(1, 1, 1))
	n = lerpf(lerpf(lerpf(a, b, f.x), lerpf(c, d, f.x), f.y), lerpf(lerpf(e, g, f.x), lerpf(h, k, f.x), f.y), f.z)
	return n * 2.0 - 1.0

static func _h(p: Vector3) -> float:
	var x := sin(p.x * 127.1 + p.y * 311.7 + p.z * 74.7) * 43758.5453
	return x - floor(x)

static func noise(p: Vector3) -> float: return _noise3(p)
