class_name BattleFx
extends Node3D
# The battle's effects (battle.gd calls them): a small CPU particle system drawn
# as camera-facing quads and tumbling blades, one MultiMesh per shape (a draw
# call each, whatever the count: Mobile-friendly, nothing on the GPU but the
# instance buffer), and the bigger set pieces built from it:
#   gust      a vortex of wind (nested funnels, shaders/battle_wind.gdshader)
#             that sucks up real-looking grass blades, leaves and dust from the
#             ground round the Pokémon, whirls them up and round, carries them
#             to Ash, then flings them past him like razor blades (slashes,
#             streaks), pulsing with the wing beats
#   impact    an anime star, a shock ring, sparks and a puff of dust
#   sand      a spray of sand grains (kicked by Ash, or Sand-Attack's)
#   trails    speed lines (Tackle) and white streak afterimages (Quick Attack)
#   rock      the stone Ash throws, its chips
#   shout     rings off Ash's shout (Startle)
#   flash     a hit's white flash on a character (its overlay chain, before the ink)
# Positions are world space. update(dt) once a frame (battle.gd, with its own
# time scale for the hit-stop).

const FX := preload("res://shaders/battle_fx.gdshader")
const FX_ADD := preload("res://shaders/battle_fx_add.gdshader")
const WIND := preload("res://shaders/battle_wind.gdshader")
const FLASH := preload("res://shaders/battle_flash.gdshader")

const SHAPES := {
	# shape: [shader shape id, additive, capacity, mesh]
	"soft": [0, false, 420, "quad"],
	"streak": [1, true, 360, "quad"],
	"star": [2, true, 12, "quad"],
	"ring": [3, true, 16, "quad"],
	"slash": [5, true, 32, "quad"],
	"blade": [4, false, 240, "blade"],
	"leaf": [4, false, 120, "leaf"],
	"chip": [4, false, 60, "chip"],
}

var cam: Camera3D
var ground: Callable          # (x, z) -> height
var pools := {}               # shape -> {mmi, mm, list: [particle]}
var rng := RandomNumberGenerator.new()
var flashes: Array = []
var gusts: Array = []
var time := 0.0

func setup(c: Camera3D, ground_fn: Callable) -> void:
	cam = c
	ground = ground_fn
	rng.randomize()
	for k in SHAPES:
		var d: Array = SHAPES[k]
		var mat := ShaderMaterial.new()
		mat.shader = FX_ADD if d[1] else FX
		mat.set_shader_parameter("shape", d[0])
		mat.render_priority = 2 if d[1] else 1
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = _mesh(d[3])
		mm.instance_count = d[2]
		mm.visible_instance_count = 0
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.custom_aabb = AABB(Vector3(-1e4, -1e3, -1e4), Vector3(2e4, 2e3, 2e4))   # (placed in world space: never culled)
		mi.top_level = true
		add_child(mi)
		pools[k] = {"mmi": mi, "mm": mm, "list": [], "cap": d[2], "mat": mat}

func _mesh(kind: String) -> Mesh:
	match kind:
		"blade":
			# a grass blade: a long thin taper, slightly bent
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			var pts := [Vector3(-0.022, -0.17, 0), Vector3(0.022, -0.17, 0), Vector3(-0.016, 0.0, 0.01), Vector3(0.016, 0.0, 0.01), Vector3(0.0, 0.19, 0.03)]
			for tri in [[0, 1, 2], [1, 3, 2], [2, 3, 4]]:
				for i in tri:
					st.set_uv(Vector2(0.5, 0.5)); st.set_normal(Vector3.BACK); st.add_vertex(pts[i])
			return st.commit()
		"leaf":
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			var pts := [Vector3(0, -0.07, 0), Vector3(0.045, -0.01, 0.01), Vector3(0, 0.075, 0), Vector3(-0.045, -0.01, 0.01), Vector3(0, -0.005, 0.015)]
			for tri in [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]:
				for i in tri:
					st.set_uv(Vector2(0.5, 0.5)); st.set_normal(Vector3.BACK); st.add_vertex(pts[i])
			return st.commit()
		"chip":
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			var pts := [Vector3(0, 0.04, 0), Vector3(0.04, -0.02, 0.02), Vector3(-0.035, -0.02, 0.025), Vector3(0.0, -0.015, -0.04)]
			for tri in [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]]:
				for i in tri:
					st.set_uv(Vector2(0.5, 0.5)); st.set_normal(Vector3.UP); st.add_vertex(pts[i])
			return st.commit()
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	return q

# ---------- particles ----------
# opts: life, size, size_end, col, col_end, drag, grav, spin (rad/s, billboards),
# len (streak: seconds of travel it spans), w (streak width), floor (bounce on
# the ground), fade_in (s), axis (a fixed streak direction)
func spawn(shape: String, p: Vector3, v: Vector3, o: Dictionary = {}) -> Dictionary:
	var pool: Dictionary = pools[shape]
	var list: Array = pool.list
	if list.size() >= pool.cap: list.pop_front()
	var c: Color = o.get("col", Color.WHITE)
	var e := {"p": p, "v": v, "age": 0.0, "life": float(o.get("life", 0.6)), "s0": float(o.get("size", 0.2)), "s1": float(o.get("size_end", o.get("size", 0.2))),
		"c0": c, "c1": o.get("col_end", Color(c.r, c.g, c.b, 0.0)), "drag": float(o.get("drag", 1.0)), "grav": float(o.get("grav", 0.0)),
		"rot": float(o.get("rot", rng.randf() * TAU)), "spin": float(o.get("spin", 0.0)), "len": float(o.get("len", 0.05)), "w": float(o.get("w", 0.05)),
		"floor": bool(o.get("floor", false)), "fin": float(o.get("fade_in", 0.0)), "r": rng.randf(), "orb": o.get("orb", null), "axis": o.get("axis", Vector3.ZERO),
		"b": Basis(Vector3(rng.randf() - 0.5, rng.randf() - 0.5, rng.randf() - 0.5).normalized(), rng.randf() * TAU) if shape in ["blade", "leaf", "chip"] else Basis(),
		"tumble": o.get("tumble", Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)) * float(o.get("tumble_k", 8.0))),
		"trail": float(o.get("trail", 0.0)), "tacc": 0.0, "last": p}
	list.append(e)
	return e

func count(shape: String) -> int: return pools[shape].list.size()

func clear() -> void:
	for k in pools: pools[k].list.clear(); pools[k].mm.visible_instance_count = 0
	for g in gusts:
		if is_instance_valid(g.node): g.node.queue_free()
		g.debris.clear()
	gusts.clear()
	for f in flashes: _unflash(f)
	flashes.clear()

func update(dt: float) -> void:
	time += dt
	_gusts(dt)
	_flashes(dt)
	if cam == null: return
	var cb := cam.global_transform.basis
	var cpos := cam.global_position
	for k in pools:
		var pool: Dictionary = pools[k]
		var list: Array = pool.list
		var mm: MultiMesh = pool.mm
		var i := 0
		var keep: Array = []
		for e in list:
			e.age += dt
			if e.age >= e.life: continue
			keep.append(e)
		pool.list = keep
		list = keep
		var bill: bool = not (k in ["blade", "leaf", "chip"])
		for e in list:
			var prev: Vector3 = e.p
			if e.orb != null:
				var ob: Dictionary = e.orb
				ob.a += ob.w * dt
				ob.h += ob.rise * dt
				ob.r = maxf(0.05, ob.r + ob.rr * dt)
				var c: Vector3 = ob.g.c
				e.p = c + Vector3(cos(ob.a) * ob.r, ob.h, sin(ob.a) * ob.r)
				e.v = (e.p - prev) / maxf(dt, 1e-4)
			else:
				e.v += Vector3(0, -e.grav * dt, 0)
				e.v *= exp(-e.drag * dt)
				e.p += e.v * dt
				if e.floor and ground.is_valid():
					var gy: float = ground.call(e.p.x, e.p.z) + 0.02
					if e.p.y < gy:
						e.p.y = gy
						e.v = Vector3(e.v.x * 0.45, absf(e.v.y) * 0.25, e.v.z * 0.45)
						e.tumble *= 0.5
			# a streak trail behind fast blades
			if e.trail > 0.0 and k != "streak":
				e.tacc += dt
				if e.tacc > 0.03:
					e.tacc = 0.0
					var sp: float = (e.v as Vector3).length()
					if sp > 2.0: spawn("streak", e.p, e.v * 0.05, {"life": 0.16, "size": 0.0, "len": 0.04, "w": 0.018 * e.trail, "col": Color(1, 1, 1, 0.55 * e.trail), "drag": 6.0})
			var u: float = e.age / e.life
			var col: Color = (e.c0 as Color).lerp(e.c1, u)
			if e.fin > 0.0: col.a *= clampf(e.age / e.fin, 0.0, 1.0)
			var s: float = lerpf(e.s0, e.s1, 1.0 - (1.0 - u) * (1.0 - u))
			var xf: Transform3D
			if k == "streak":
				var ax: Vector3 = e.axis if e.axis != Vector3.ZERO else e.v
				var ln := maxf(s, ax.length() * e.len)
				ax = ax.normalized() if ax.length_squared() > 1e-8 else cb.x
				var to_cam: Vector3 = (cpos - e.p).normalized()
				var side := ax.cross(to_cam)
				side = side.normalized() if side.length_squared() > 1e-8 else cb.y
				xf = Transform3D(Basis(ax * ln, side * e.w, to_cam), e.p - ax * ln * 0.35)
			elif bill:
				e.rot += e.spin * dt
				var cr := cos(e.rot); var sr := sin(e.rot)
				var bx: Vector3 = (cb.x * cr + cb.y * sr) * s
				var by: Vector3 = (cb.y * cr - cb.x * sr) * s
				xf = Transform3D(Basis(bx, by, cb.z), e.p)
			else:
				var tb: Vector3 = e.tumble
				if tb.length_squared() > 1e-6: e.b = (e.b as Basis).rotated(tb.normalized(), tb.length() * dt).orthonormalized()
				xf = Transform3D((e.b as Basis).scaled(Vector3.ONE * s), e.p)
			mm.set_instance_transform(i, xf)
			mm.set_instance_color(i, col)
			mm.set_instance_custom_data(i, Color(e.r, 0, 0, 0))
			i += 1
		mm.visible_instance_count = i

# ---------- set pieces ----------
func dust(p: Vector3, n: int, col := Color("c8b48c"), spread := 0.6, up := 1.0, size := 0.45) -> void:
	for i in n:
		var d := Vector3(rng.randf_range(-1, 1), 0, rng.randf_range(-1, 1)).normalized()
		spawn("soft", p + d * rng.randf() * spread * 0.4 + Vector3(0, 0.1, 0), d * rng.randf_range(0.6, 2.2) * spread + Vector3(0, rng.randf_range(0.3, 1.2) * up, 0),
			{"life": rng.randf_range(0.6, 1.2), "size": size * rng.randf_range(0.5, 0.9), "size_end": size * rng.randf_range(1.4, 2.2), "col": Color(col, 0.55), "drag": 2.5, "grav": -0.15})

# sand grains in a cone along dir; mist of fine dust round them
func sand(from: Vector3, dir: Vector3, n: int, speed := 6.0, cone := 0.35, col := Color("e2c98f")) -> void:
	var d0 := dir.normalized()
	var s := d0.cross(Vector3.UP).normalized()
	var u := s.cross(d0)
	for i in n:
		var d := (d0 + s * rng.randf_range(-cone, cone) + u * rng.randf_range(-cone * 0.6, cone)).normalized()
		var sp := speed * rng.randf_range(0.55, 1.15)
		var c := col.lerp(Color("b89660"), rng.randf())
		spawn("soft", from + d * rng.randf() * 0.15, d * sp, {"life": rng.randf_range(0.5, 0.9), "size": rng.randf_range(0.03, 0.06), "size_end": 0.02, "col": Color(c, 1.0), "drag": 1.2, "grav": 7.0, "floor": true})
		if i % 3 == 0:
			spawn("streak", from, d * sp, {"life": 0.25, "size": 0.0, "len": 0.03, "w": 0.012, "col": Color(c.lightened(0.3), 0.7), "drag": 2.0, "grav": 5.0})
	for i in n / 6:
		var d2 := (d0 + s * rng.randf_range(-cone, cone)).normalized()
		spawn("soft", from + Vector3(0, 0.05, 0), d2 * speed * rng.randf_range(0.2, 0.5) + Vector3(0, 0.4, 0), {"life": rng.randf_range(0.8, 1.4), "size": 0.25, "size_end": 0.8, "col": Color(col, 0.35), "drag": 2.0})

# a hit: the star, the ring, sparks out along dir, dust at the feet
func impact(p: Vector3, dir: Vector3, power := 1.0, col := Color(1.0, 0.95, 0.7)) -> void:
	spawn("star", p, Vector3.ZERO, {"life": 0.2, "size": 0.7 * power, "size_end": 1.5 * power, "col": Color(col, 1.0), "col_end": Color(col, 0.0), "rot": rng.randf() * TAU})
	spawn("star", p, Vector3.ZERO, {"life": 0.12, "size": 1.2 * power, "size_end": 0.6 * power, "col": Color(1, 1, 1, 1), "rot": rng.randf() * TAU})
	spawn("ring", p, Vector3.ZERO, {"life": 0.3, "size": 0.3, "size_end": 2.4 * power, "col": Color(1, 1, 1, 0.9)})
	var d0 := dir.normalized() if dir.length_squared() > 1e-6 else Vector3.FORWARD
	for i in int(14 * power):
		var d := (d0 * 0.6 + Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.6, 1), rng.randf_range(-1, 1)).normalized()).normalized()
		spawn("streak", p, d * rng.randf_range(5.0, 11.0) * power, {"life": rng.randf_range(0.15, 0.3), "size": 0.0, "len": 0.05, "w": 0.035, "col": Color(col.lightened(0.4), 1.0), "drag": 7.0})

# Gust: begin at the Pokémon (from), aimed at Ash (to); battle.gd moves it with
# gust_move and ends it with gust_hit (the release past Ash) and gust_end
func gust_begin(from: Vector3) -> Dictionary:
	var node := Node3D.new()
	node.top_level = true
	add_child(node)
	node.global_position = from
	var layers := []
	# [foot radius, lip radius, height, spin, bands, twist, strength]
	for L in [[0.22, 0.95, 2.3, 2.2, 5.0, 1.4, 1.0], [0.14, 0.62, 2.7, 3.3, 4.0, 2.2, 0.8], [0.35, 1.35, 1.7, 1.5, 7.0, 0.9, 0.55], [0.1, 0.3, 3.0, 4.5, 3.0, 3.0, 0.5]]:
		var mi := MeshInstance3D.new()
		mi.mesh = _funnel(L[0], L[1], L[2])
		var m := ShaderMaterial.new()
		m.shader = WIND
		m.set_shader_parameter("spin", L[3]); m.set_shader_parameter("bands", L[4]); m.set_shader_parameter("twist", L[5])
		m.set_shader_parameter("seed", rng.randf() * 10.0)
		m.set_shader_parameter("strength", 0.0)
		m.render_priority = 3
		mi.material_override = m
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(mi)
		layers.append([mi, m, float(L[6])])
	var g := {"node": node, "layers": layers, "c": from, "k": 0.0, "pulse": 0.0, "debris": [], "t": 0.0, "suck": 1.0, "dir": Vector3.FORWARD}
	gusts.append(g)
	# the ground round it gives up its grass and leaves: blades torn up from a ring
	# round the bird, drawn in and up into the funnel
	for i in 120: _debris(g, from, true)
	return g

func _debris(g: Dictionary, at: Vector3, from_ground: bool) -> void:
	var a := rng.randf() * TAU
	var r := rng.randf_range(0.4, 2.2) if from_ground else rng.randf_range(0.3, 0.9)
	var gy: float = (ground.call(at.x + cos(a) * r, at.z + sin(a) * r) if ground.is_valid() else at.y) - g.c.y
	var kind := "blade" if rng.randf() < 0.55 else ("leaf" if rng.randf() < 0.6 else "soft")
	var ob := {"g": g, "a": a, "r": r, "h": maxf(gy, -0.3) + 0.05, "w": rng.randf_range(5.5, 9.5) * (1.0 if rng.randf() < 0.85 else -0.6), "rise": rng.randf_range(0.5, 1.6), "rr": -rng.randf_range(0.2, 0.9)}
	var col: Color
	if kind == "blade": col = Color("4f9a2c").lerp(Color("a9d64a"), rng.randf())
	elif kind == "leaf": col = Color("6bb33a").lerp(Color("d8c24a"), rng.randf() * rng.randf())
	else: col = Color("cdb68a") if rng.randf() < 0.6 else Color("e9f3e6")
	var e := spawn(kind, g.c + Vector3(cos(a) * r, ob.h, sin(a) * r), Vector3.ZERO, {"life": 6.0, "size": rng.randf_range(1.5, 2.5) if kind != "soft" else rng.randf_range(0.35, 0.6),
		"size_end": rng.randf_range(1.5, 2.5) if kind != "soft" else 1.0, "col": Color(col, 1.0), "col_end": Color(col, 1.0) if kind != "soft" else Color(col, 0.0), "orb": ob, "tumble_k": 14.0,
		"fade_in": 0.08, "trail": 1.0 if kind == "blade" and rng.randf() < 0.5 else 0.0})
	g.debris.append(e)

# a funnel mesh: open both ends, UV.x round it, UV.y up it
static func _funnel(r0: float, r1: float, h: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var na := 28; var nh := 10
	for j in nh:
		for i in na:
			var quad := [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]
			for q in quad:
				var u: float = float(q[0]) / na
				var v: float = float(q[1]) / nh
				var r := lerpf(r0, r1, pow(v, 1.4))
				var a := u * TAU
				var p := Vector3(cos(a) * r, v * h, sin(a) * r)
				st.set_uv(Vector2(u, v))
				st.set_normal(Vector3(cos(a), 0.35, sin(a)).normalized())
				st.add_vertex(p)
	return st.commit()

# each frame: where the funnel's foot is, how strong (0..1), the wing beat's push (0..1)
func gust_move(g: Dictionary, at: Vector3, k: float, pulse: float, dir: Vector3) -> void:
	g.c = at
	g.k = k
	g.pulse = pulse
	g.dir = dir
	if is_instance_valid(g.node):
		g.node.global_position = at
		g.node.scale = Vector3(0.7 + 0.6 * k, 0.6 + 0.55 * k, 0.7 + 0.6 * k)
		g.node.rotation.y += 0.0
		for L in g.layers:
			(L[1] as ShaderMaterial).set_shader_parameter("strength", k * float(L[2]))
			(L[1] as ShaderMaterial).set_shader_parameter("pulse", pulse)
	# dust kicked up where the foot passes, more grass torn up on the beats
	if k > 0.2 and rng.randf() < 0.5:
		spawn("soft", at + Vector3(rng.randf_range(-0.6, 0.6), 0.05, rng.randf_range(-0.6, 0.6)), Vector3(rng.randf_range(-1, 1), rng.randf_range(0.2, 1.0), rng.randf_range(-1, 1)) * 1.5,
			{"life": 0.9, "size": 0.35, "size_end": 1.1, "col": Color(0.82, 0.74, 0.58, 0.32 * k), "drag": 2.0})
	if pulse > 0.5:
		for i in 3: _debris(g, at, true)
	# streaks of wind wound round it (white arcs)
	if k > 0.15:
		for i in 4:
			var ob := {"g": g, "a": rng.randf() * TAU, "r": rng.randf_range(0.5, 1.5), "h": rng.randf_range(0.1, 2.4), "w": rng.randf_range(7.0, 11.0), "rise": rng.randf_range(0.4, 1.2), "rr": 0.2}
			spawn("streak", at, Vector3.ZERO, {"life": rng.randf_range(0.25, 0.45), "size": 0.0, "len": 0.07, "w": rng.randf_range(0.035, 0.07), "col": Color(0.95, 1.0, 0.97, 0.9 * k), "orb": ob})

# the gust reaches Ash: everything it carries flies on past him, slashing
func gust_hit(g: Dictionary, target: Vector3) -> void:
	var d: Vector3 = g.dir
	d.y = 0.0
	d = d.normalized() if d.length_squared() > 1e-6 else Vector3.FORWARD
	for e in g.debris:
		if e.age >= e.life: continue
		var ob = e.orb
		e.orb = null
		var tang: Vector3 = Vector3(-sin(ob.a), 0, cos(ob.a)) * ob.w * ob.r * 0.6 if ob != null else Vector3.ZERO
		e.v = d * rng.randf_range(9.0, 16.0) + tang + Vector3(rng.randf_range(-1.5, 1.5), rng.randf_range(0.5, 3.0), rng.randf_range(-1.5, 1.5))
		e.drag = 0.6
		e.grav = 2.5
		e.life = e.age + rng.randf_range(0.6, 1.1)
		e.trail = 1.0
		e.tumble = (e.tumble as Vector3) * 2.0
	g.debris.clear()
	# the slashes: white crescents flicking across him, a burst of wind lines
	for i in 7:
		var p := target + Vector3(rng.randf_range(-0.35, 0.35), rng.randf_range(0.5, 1.6), rng.randf_range(-0.35, 0.35))
		spawn("slash", p, d * 2.0, {"life": rng.randf_range(0.12, 0.22), "size": rng.randf_range(0.5, 0.8), "size_end": rng.randf_range(0.9, 1.3), "col": Color(1, 1, 1, 1.0), "rot": rng.randf() * TAU, "spin": rng.randf_range(-6, 6)})
	for i in 26:
		var dd := (d + Vector3(rng.randf_range(-0.5, 0.5), rng.randf_range(-0.2, 0.5), rng.randf_range(-0.5, 0.5))).normalized()
		spawn("streak", target + Vector3(rng.randf_range(-0.6, 0.6), rng.randf_range(0.2, 1.8), rng.randf_range(-0.6, 0.6)) - d * 1.2, dd * rng.randf_range(12.0, 20.0),
			{"life": rng.randf_range(0.2, 0.35), "size": 0.0, "len": 0.05, "w": rng.randf_range(0.02, 0.045), "col": Color(0.95, 1, 0.97, 0.9), "drag": 2.0})
	dust(target, 10, Color("cdb68a"), 1.2, 0.6, 0.5)

func gust_end(g: Dictionary) -> void:
	g.fading = true

func _gusts(dt: float) -> void:
	for g in gusts.duplicate():
		g.t += dt
		if g.get("fading", false):
			g.k = maxf(0.0, g.k - dt * 3.0)
			for L in g.layers: (L[1] as ShaderMaterial).set_shader_parameter("strength", g.k * float(L[2]))
			if g.k <= 0.0:
				if is_instance_valid(g.node): g.node.queue_free()
				for e in g.debris: e.life = minf(e.life, e.age + 0.2); e.orb = null
				g.debris.clear()
				gusts.erase(g)

# the shout: rings off his mouth, a burst of lines
func shout(p: Vector3, dir: Vector3) -> void:
	for i in 3:
		spawn("ring", p + dir * 0.2, dir * (2.5 + i), {"life": 0.5 + i * 0.12, "size": 0.25, "size_end": 2.2 + i * 0.6, "col": Color(1, 0.95, 0.6, 0.8), "drag": 2.0, "fade_in": i * 0.08})
	for i in 12:
		var a := TAU * i / 12.0
		var d := (dir * 0.6 + Vector3(cos(a), sin(a) * 0.8 + 0.3, sin(a)) * 0.8).normalized()
		spawn("streak", p + d * 0.3, d * 6.0, {"life": 0.25, "size": 0.0, "len": 0.06, "w": 0.04, "col": Color(1, 0.95, 0.5, 0.9), "drag": 6.0})

# speed lines along a dash (Tackle): long white streaks streaming back from it
func speed_lines(p: Vector3, v: Vector3, n := 3) -> void:
	var d := v.normalized()
	var s := d.cross(Vector3.UP).normalized()
	for i in n:
		var off := s * rng.randf_range(-0.5, 0.5) + Vector3(0, rng.randf_range(0.05, 0.7), 0)
		spawn("streak", p + off - d * rng.randf_range(0.0, 0.4), -d * rng.randf_range(4.0, 8.0), {"life": rng.randf_range(0.14, 0.24), "size": 0.0, "len": 0.09, "w": rng.randf_range(0.015, 0.035), "col": Color(1, 1, 1, 0.8), "drag": 3.0, "axis": d})

# Quick Attack's white streak: a bright smear left where it was, fading behind it
func afterimage(p: Vector3, v: Vector3, size := 0.45) -> void:
	var d := v.normalized() if v.length_squared() > 1e-6 else Vector3.FORWARD
	spawn("streak", p + Vector3(0, 0.3, 0), Vector3.ZERO, {"life": 0.45, "size": maxf(1.2, v.length() * 0.09), "len": 0.0, "w": size * 0.9, "col": Color(1, 1, 1, 0.85), "axis": d})
	spawn("streak", p + Vector3(0, 0.3, 0), Vector3.ZERO, {"life": 0.6, "size": maxf(1.6, v.length() * 0.12), "len": 0.0, "w": size * 0.3, "col": Color(1, 1, 1, 1.0), "axis": d})
	spawn("soft", p + Vector3(0, 0.32, 0), Vector3.ZERO, {"life": 0.35, "size": size * 1.6, "size_end": size * 0.8, "col": Color(1, 1, 1, 0.7)})

# rock chips and grit off a hit
func chips(p: Vector3, n := 8, col := Color("8d8a86")) -> void:
	for i in n:
		var d := Vector3(rng.randf_range(-1, 1), rng.randf_range(0.2, 1.4), rng.randf_range(-1, 1)).normalized()
		spawn("chip", p, d * rng.randf_range(2.0, 4.5), {"life": rng.randf_range(0.6, 1.0), "size": rng.randf_range(0.5, 1.0), "col": Color(col.lerp(Color("5f5c59"), rng.randf()), 1.0), "col_end": Color(col, 1.0), "grav": 9.8, "drag": 0.5, "floor": true, "tumble_k": 16.0})

# feathers knocked loose off a hit bird
func feathers(p: Vector3, n := 5) -> void:
	for i in n:
		var d := Vector3(rng.randf_range(-1, 1), rng.randf_range(0.3, 1.2), rng.randf_range(-1, 1)).normalized()
		spawn("leaf", p, d * rng.randf_range(1.0, 2.5), {"life": rng.randf_range(1.2, 1.8), "size": rng.randf_range(0.9, 1.3), "col": Color(Color("b5824f").lerp(Color("f2dcae"), rng.randf()), 1.0), "grav": 1.2, "drag": 2.5, "tumble_k": 5.0, "floor": true})

# a white flash on a character (its .meshes), easing out over dur
func flash(who: Node, col := Color.WHITE, dur := 0.18, amount := 0.95) -> void:
	if who == null or not is_instance_valid(who): return
	var list = who.get("meshes")
	if list == null: return
	var m := ShaderMaterial.new()
	m.shader = FLASH
	m.set_shader_parameter("color", col)
	m.set_shader_parameter("amount", amount)
	m.render_priority = 1
	var f := {"meshes": [], "mat": m, "t": 0.0, "dur": dur, "amount": amount}
	for mi in list:
		if not is_instance_valid(mi): continue
		m.next_pass = null
		var gi: GeometryInstance3D = mi
		var prev: Material = gi.material_overlay
		var mine := m.duplicate() as ShaderMaterial
		mine.next_pass = prev
		gi.material_overlay = mine
		f.meshes.append([gi, mine])
	flashes.append(f)

func _flashes(dt: float) -> void:
	for f in flashes.duplicate():
		f.t += dt
		var a: float = f.amount * (1.0 - clampf(f.t / f.dur, 0.0, 1.0))
		for pair in f.meshes: (pair[1] as ShaderMaterial).set_shader_parameter("amount", a)
		if f.t >= f.dur:
			_unflash(f)
			flashes.erase(f)

func _unflash(f: Dictionary) -> void:
	for pair in f.meshes:
		var gi: GeometryInstance3D = pair[0]
		if not is_instance_valid(gi): continue
		var mine: Material = pair[1]
		if gi.material_overlay == mine: gi.material_overlay = mine.next_pass
		else:
			var q: Material = gi.material_overlay
			while q and q.next_pass != mine: q = q.next_pass
			if q: q.next_pass = mine.next_pass
		mine.next_pass = null

# the stone Ash throws (a lumpy grey pebble)
static func rock_node() -> MeshInstance3D:
	var s := SphereMesh.new()
	s.radius = 0.085; s.height = 0.15; s.radial_segments = 7; s.rings = 4
	var mi := MeshInstance3D.new()
	mi.mesh = s
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/actor.gdshader")
	m.set_shader_parameter("albedo", Color("8f8a84"))
	mi.material_override = m
	mi.scale = Vector3(1.2, 0.85, 1.0)
	return mi
