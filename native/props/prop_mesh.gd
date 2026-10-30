class_name PropMesh
extends RefCounted
# Mesh building for the props library (props/*): a prop is an ArrayMesh with a
# surface per material (bark, painted wood and fungus by vertex colour, leaf
# cards), built here once and drawn as MultiMeshes (props/prop_scatter.gd), in
# the plants' cel look (props/prop_mats.gd: the baked plants' own shaders).
#
#   var b := PropMesh.new()
#   b.tube("bark", pts, radii, 9, Color.WHITE, 1.4)     a bent tube along points
#   b.blob("vc", c, Vector3(r, r, r), col, seed)        a lumpy ball
#   b.disc("vc", c, n, r, col)                          a flat cap
#   b.card("leaf", c, n, up, size, tile)                a cut-out card (atlas tile: Rect2 in uv)
#   b.mesh({"bark": mat, "vc": mat, "leaf": mat})       the ArrayMesh, a surface per used kind

var S := {}    # kind -> {v, n, uv, c, i}

func _s(kind: String) -> Dictionary:
	if not S.has(kind): S[kind] = {"v": PackedVector3Array(), "n": PackedVector3Array(), "uv": PackedVector2Array(), "c": PackedColorArray(), "i": PackedInt32Array()}
	return S[kind]

func vert(kind: String, p: Vector3, n: Vector3, uv: Vector2, c: Color) -> int:
	var s := _s(kind)
	s.v.append(p); s.n.append(n); s.uv.append(uv); s.c.append(c)
	return s.v.size() - 1

func tri(kind: String, a: int, b: int, c: int) -> void:
	# (Godot's front faces are clockwise)
	_s(kind).i.append_array([a, c, b])

# a tube through pts (Vector3) with a radius at each, seg sides; u wraps the bark
# texture round it (wrap times), v runs along by length / v_len; cap: close the ends
func tube(kind: String, pts: Array, radii: Array, seg: int, col: Color, v_len := 1.5, wrap := 1.0, cap := [false, false], cap_col := Color(0.8, 0.66, 0.45), cols: Array = []) -> void:
	var n := pts.size()
	if n < 2: return
	var base: int = _s(kind).v.size()
	var acc := 0.0
	var up := Vector3.UP
	var prev_side := Vector3.ZERO
	for i in n:
		var p: Vector3 = pts[i]
		var d: Vector3 = ((pts[mini(i + 1, n - 1)] as Vector3) - (pts[maxi(i - 1, 0)] as Vector3)).normalized()
		if i > 0: acc += (p - (pts[i - 1] as Vector3)).length()
		var side := d.cross(up)
		if side.length() < 0.1: side = d.cross(Vector3.RIGHT)
		side = side.normalized()
		if i > 0 and side.dot(prev_side) < 0.0: side = -side
		prev_side = side
		var bi := side.cross(d).normalized()
		var r := float(radii[i])
		var c: Color = cols[i] if i < cols.size() else col
		for j in seg + 1:
			var a := TAU * j / seg
			var o := side * cos(a) + bi * sin(a)
			vert(kind, p + o * r, o, Vector2(float(j) / seg * wrap, acc / v_len), c)
	for i in n - 1:
		for j in seg:
			var a := base + i * (seg + 1) + j
			var b := a + seg + 1
			tri(kind, a, b, a + 1)
			tri(kind, a + 1, b, b + 1)
	for e in 2:
		if not cap[e]: continue
		var k := 0 if e == 0 else n - 1
		var p: Vector3 = pts[k]
		var d2: Vector3 = ((pts[1] as Vector3) - (pts[0] as Vector3)).normalized() if e == 0 else ((pts[n - 1] as Vector3) - (pts[n - 2] as Vector3)).normalized()
		if e == 0: d2 = -d2
		disc("vc", p, d2, float(radii[k]), cap_col, seg, true)

# a flat disc facing n; rings: the cut wood's growth rings by vertex colour
func disc(kind: String, c: Vector3, n: Vector3, r: float, col: Color, seg := 10, rings := false) -> void:
	var side := n.cross(Vector3.UP)
	if side.length() < 0.1: side = n.cross(Vector3.RIGHT)
	side = side.normalized()
	var bi := side.cross(n).normalized()
	var mid := vert(kind, c, n, Vector2(0.5, 0.5), col.lightened(0.08) if rings else col)
	var nr := 3 if rings else 1
	var last := []
	for k in nr:
		var rr := r * float(k + 1) / nr
		var cc := col if not rings else (col.darkened(0.16) if k % 2 == 0 else col.lightened(0.04))
		if rings and k == nr - 1: cc = col.darkened(0.3)
		var ring := []
		for j in seg:
			var a := TAU * j / seg
			var o := side * cos(a) + bi * sin(a)
			ring.append(vert(kind, c + o * rr * (1.0 + (0.05 * sin(a * 3.0 + k) if rings else 0.0)), n, Vector2(0.5 + cos(a) * 0.5, 0.5 + sin(a) * 0.5), cc))
		for j in seg:
			if k == 0: tri(kind, mid, ring[(j + 1) % seg], ring[j])
			else:
				tri(kind, last[j], ring[(j + 1) % seg], ring[j])
				tri(kind, last[j], last[(j + 1) % seg], ring[(j + 1) % seg])
		last = ring

# a lumpy ball (an icosphere pushed about by a few waves), radii r per axis
func blob(kind: String, c: Vector3, r: Vector3, col: Color, sd := 0, sub := 1, col2 = null, flat_bottom := false) -> void:
	var t := (1.0 + sqrt(5.0)) / 2.0
	var vs := [Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0), Vector3(0, -1, t), Vector3(0, 1, t),
		Vector3(0, -1, -t), Vector3(0, 1, -t), Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1)]
	var fs := [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
		[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
	for i in vs.size(): vs[i] = (vs[i] as Vector3).normalized()
	for s2 in sub:
		var mids := {}
		var nf := []
		var mid := func(a: int, b: int) -> int:
			var key := Vector2i(mini(a, b), maxi(a, b))
			if mids.has(key): return mids[key]
			vs.append(((vs[a] as Vector3) + (vs[b] as Vector3)).normalized())
			mids[key] = vs.size() - 1
			return vs.size() - 1
		for f in fs:
			var ab: int = mid.call(f[0], f[1]); var bc: int = mid.call(f[1], f[2]); var ca: int = mid.call(f[2], f[0])
			nf.append_array([[f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]])
		fs = nf
	var ph := float(sd) * 1.7
	var base: int = _s(kind).v.size()
	for u: Vector3 in vs:
		var k := 0.86 + 0.14 * sin(u.x * 4.1 + ph) * cos(u.z * 3.7 + u.y * 2.3 + ph) + 0.06 * sin(u.y * 9.0 + u.x * 7.0 + ph)
		var p := Vector3(u.x * r.x, u.y * r.y, u.z * r.z) * k
		if flat_bottom and p.y < -r.y * 0.2: p.y = -r.y * 0.2 + (p.y + r.y * 0.2) * 0.15
		var cc := col
		if col2 != null: cc = col.lerp(col2, clampf(u.y * 0.5 + 0.5 + 0.2 * sin(u.x * 6.0 + ph), 0.0, 1.0))
		vert(kind, c + p, Vector3(u.x / r.x, u.y / r.y, u.z / r.z).normalized(), Vector2(u.x * 0.5 + 0.5, u.y * 0.5 + 0.5), cc)
	for f in fs: tri(kind, base + f[0], base + f[1], base + f[2])

# a quad card (cut out from an atlas tile, uv Rect2), its face n, its up; ao: the
# leaf shader's occlusion in the vertex colour's red (bottom, top)
func card(kind: String, c: Vector3, n: Vector3, up: Vector3, size: Vector2, tile: Rect2, ao := Vector2(0.6, 1.0), bend := 0.0) -> void:
	var side := up.cross(n).normalized()
	var u2 := n.cross(side).normalized()
	var hw := size.x * 0.5
	var p := [c - side * hw, c + side * hw, c + side * hw + u2 * size.y + n * bend, c - side * hw + u2 * size.y + n * bend]
	var uv := [Vector2(tile.position.x, tile.end.y), Vector2(tile.end.x, tile.end.y), Vector2(tile.end.x, tile.position.y), tile.position]
	var nn := (n + u2 * 0.35).normalized()
	var ids := []
	for k in 4: ids.append(vert(kind, p[k], nn, uv[k], Color(ao.x if k < 2 else ao.y, 0, 0)))
	tri(kind, ids[0], ids[1], ids[2]); tri(kind, ids[0], ids[2], ids[3])

# a frond: a card bent in two (base and tip), arching out from c along dir
func frond(kind: String, c: Vector3, dir: Vector3, length: float, width: float, tile: Rect2, droop := 0.5) -> void:
	var side := dir.cross(Vector3.UP).normalized()
	if side.length() < 0.1: side = Vector3.RIGHT
	var up := Vector3.UP
	var mid := c + dir * length * 0.55 + up * length * 0.42
	var tip := c + dir * length + up * length * (0.42 - droop * 0.55)
	var n := side.cross(dir).normalized()
	if n.y < 0.0: n = -n
	var hw := width * 0.5
	var P := [c - side * hw * 0.4, c + side * hw * 0.4, mid + side * hw, mid - side * hw, tip + side * hw * 0.3, tip - side * hw * 0.3]
	var vm := lerpf(tile.end.y, tile.position.y, 0.55)
	var UV := [Vector2(tile.position.x, tile.end.y), Vector2(tile.end.x, tile.end.y), Vector2(tile.end.x, vm), Vector2(tile.position.x, vm),
		Vector2(tile.end.x, tile.position.y), tile.position]
	var ao := [0.45, 0.45, 0.85, 0.85, 1.0, 1.0]
	var ids := []
	for k in 6: ids.append(vert(kind, P[k], n, UV[k], Color(ao[k], 0, 0)))
	tri(kind, ids[0], ids[1], ids[2]); tri(kind, ids[0], ids[2], ids[3])
	tri(kind, ids[3], ids[2], ids[4]); tri(kind, ids[3], ids[4], ids[5])

# a lathe: a profile of [radius, height] (bottom to top) turned round the y axis
# at c; cols: a colour per profile point (bands); wob: the rim's scallops
func lathe(kind: String, c: Vector3, prof: Array, seg: int, cols: Array, wob := 0.0, sd := 0) -> void:
	var base: int = _s(kind).v.size()
	var n := prof.size()
	for i in n:
		var r := float(prof[i][0]); var y := float(prof[i][1])
		var pa: Array = prof[maxi(i - 1, 0)]; var pb: Array = prof[mini(i + 1, n - 1)]
		var dr := float(pb[0]) - float(pa[0]); var dy := float(pb[1]) - float(pa[1])
		for j in seg + 1:
			var a := TAU * j / seg
			var rr := r * (1.0 + wob * sin(a * 7.0 + i * 1.3 + sd) * sin(a * 3.0 + sd * 0.7))
			var o := Vector3(cos(a), 0.0, sin(a))
			var nn := (o * dy - Vector3.UP * dr).normalized()
			if nn.length() < 0.5: nn = Vector3.UP if i == n - 1 else Vector3.DOWN
			vert(kind, c + o * rr + Vector3.UP * y, nn, Vector2(float(j) / seg, float(i) / maxf(1.0, n - 1)), cols[i] if i < cols.size() else cols.back())
	for i in n - 1:
		for j in seg:
			var a := base + i * (seg + 1) + j
			var b := a + seg + 1
			tri(kind, a, b, a + 1)
			tri(kind, a + 1, b, b + 1)

# a cone (a splinter, a spike): from base c along d
func cone(kind: String, c: Vector3, d: Vector3, length: float, r: float, col: Color, seg := 5) -> void:
	var dn := d.normalized()
	var side := dn.cross(Vector3.UP)
	if side.length() < 0.1: side = dn.cross(Vector3.RIGHT)
	side = side.normalized()
	var bi := side.cross(dn).normalized()
	var tip := vert(kind, c + dn * length, dn, Vector2(0.5, 1.0), col.lightened(0.1))
	var ring := []
	for j in seg:
		var a := TAU * j / seg
		var o := side * cos(a) + bi * sin(a)
		ring.append(vert(kind, c + o * r, o, Vector2(float(j) / seg, 0.0), col))
	for j in seg: tri(kind, ring[j], tip, ring[(j + 1) % seg])

# the mesh: a surface per kind used, each with its material (MultiMeshes draw
# the surfaces' own materials; no material_override then)
func mesh(mats: Dictionary) -> ArrayMesh:
	var m := ArrayMesh.new()
	for kind in S:
		var s: Dictionary = S[kind]
		if (s.i as PackedInt32Array).is_empty(): continue
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = s.v
		a[Mesh.ARRAY_NORMAL] = s.n
		a[Mesh.ARRAY_TEX_UV] = s.uv
		a[Mesh.ARRAY_COLOR] = s.c
		a[Mesh.ARRAY_INDEX] = s.i
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
		if mats.has(kind): m.surface_set_material(m.get_surface_count() - 1, mats[kind])
	return m
