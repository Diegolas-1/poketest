class_name Dishes
extends RefCounted
# Every dish on the menus (res://life/food.json "model"), built in code from
# FoodKit pieces: plated properly (plates, bowls, cups, a tray, cutlery), with
# the details that make anime food look good to eat: glossy sauces and syrup
# drips, steam off the hot ones, garnish, grains of rice, sesame, crumbs.
#
#   var d: Dish = Dishes.build("pancakes")   # origin at the plate's foot, front +z
#   d.set_eaten(0.5)                         # half gone
#   Dishes.utensil_mesh("fork") -> Node3D    # held in the hand (meal.gd)

const K := preload("res://food/food_kit.gd")

static func ids() -> Array:
	return ["pancakes", "breakfast_set", "cocoa", "onigiri", "curry", "hamburg", "cream_stew", "seafood_stew",
		"omurice", "pecha_tart", "lemonade", "green_tea", "matcha", "dango", "daifuku", "taiyaki"]

static func build(id: String) -> Dish:
	var d := Dish.new()
	d.id = id
	d.name = "Dish_" + id
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(id)
	match id:
		"pancakes": _pancakes(d, rng)
		"breakfast_set": _breakfast_set(d, rng)
		"cocoa": _cocoa(d, rng)
		"onigiri": _onigiri(d, rng)
		"curry": _curry(d, rng)
		"hamburg": _hamburg(d, rng)
		"cream_stew": _cream_stew(d, rng)
		"seafood_stew": _seafood_stew(d, rng)
		"omurice": _omurice(d, rng)
		"pecha_tart": _pecha_tart(d, rng)
		"lemonade": _lemonade(d, rng)
		"green_tea": _green_tea(d, rng)
		"matcha": _matcha(d, rng)
		"dango": _dango(d, rng)
		"daifuku": _daifuku(d, rng)
		"taiyaki": _taiyaki(d, rng)
		_: _onigiri(d, rng)
	return d

# ======================================================================
# tableware
# ======================================================================
static func _add(p: Node3D, mesh: Mesh, m: Material, at := Vector3.ZERO, rot := Vector3.ZERO, sc := Vector3.ONE) -> MeshInstance3D:
	var mi := K.node(mesh, m, at)
	mi.rotation = rot
	mi.scale = sc
	p.add_child(mi)
	return mi

static func _group(p: Node3D, at := Vector3.ZERO, name := "") -> Node3D:
	var g := Node3D.new()
	g.position = at
	if name != "": g.name = name
	p.add_child(g)
	return g

const CERAMIC := {"gloss": 0.55, "gloss_size": 0.975, "rim": Color(1, 1, 1, 0.12)}

# a round plate (radius r) with a coloured line round the rim; returns the height of its well
static func _plate(p: Node3D, r := 0.12, line := Color("3f7fd6"), base := Color("fbfaf6"), at := Vector3.ZERO) -> float:
	var prof := [Vector2(0, 0.004), Vector2(0.55 * r, 0.004), Vector2(0.57 * r, 0.0), Vector2(0.62 * r, 0.0), Vector2(0.66 * r, 0.006),
		Vector2(0.93 * r, 0.016), Vector2(r, 0.021), Vector2(0.99 * r, 0.0245), Vector2(0.92 * r, 0.0205), Vector2(0.7 * r, 0.0115),
		Vector2(0.63 * r, 0.0092), Vector2(0.3 * r, 0.009), Vector2(0, 0.009)]
	var col := func(_u: float, _v: float, q: Vector3) -> Color:
		var rr := Vector2(q.x, q.z).length()
		if q.y > 0.0175 and rr > 0.9 * r and rr < 0.965 * r: return line
		if q.y > 0.0175 and rr > 0.84 * r and rr < 0.86 * r: return base.lerp(line, 0.55)
		return base.lerp(Color(0.92, 0.93, 0.96), clampf(rr / r, 0.0, 1.0) * 0.35)
	_add(p, K.lathe(prof, col, 48), K.mat(Color.WHITE, CERAMIC), at)
	return 0.009 + at.y

# a bowl: radius r at the lip, height h; outer / inner colours (or callables); returns
# {y: the inside's bottom, inner: [(r, y)...] up the inside}
static func _bowl(p: Node3D, r: float, h: float, outer, inner, at := Vector3.ZERO, o := {}) -> Dictionary:
	var foot := float(o.get("foot", 0.45))
	var ins := [Vector2(0.95 * r, h * 0.985), Vector2(0.9 * r, h * 0.78), Vector2(0.78 * r, h * 0.5), Vector2(0.55 * r, h * 0.27), Vector2(0.25 * r, h * 0.16), Vector2(0, h * 0.15)]
	var prof := [Vector2(0, 0.005), Vector2(foot * r * 0.9, 0.005), Vector2(foot * r, 0.0), Vector2(foot * r * 1.08, 0.0), Vector2(foot * r * 1.12, 0.012),
		Vector2(0.72 * r, h * 0.3), Vector2(0.9 * r, h * 0.6), Vector2(0.985 * r, h * 0.9), Vector2(r, h), Vector2(0.98 * r, h * 1.012)]
	prof.append_array(ins)
	var oc: Callable = outer if outer is Callable else K._const(outer)
	var ic: Callable = inner if inner is Callable else K._const(inner)
	var n_out := 10
	var col := func(u: float, v: float, q: Vector3) -> Color:
		return oc.call(u, v, q) if v * (prof.size() - 1) < n_out - 0.5 else ic.call(u, v, q)
	_add(p, K.lathe(prof, col, 48), K.mat(Color.WHITE, o.get("mat", CERAMIC)), at)
	return {"y": h * 0.15 + at.y, "inner": ins, "h": h}

# the inside's radius at a height (up a bowl's inner profile)
static func _r_at(inner: Array, y: float) -> float:
	for i in inner.size() - 1:
		var a: Vector2 = inner[i]
		var b: Vector2 = inner[i + 1]
		if (y <= a.y and y >= b.y) or (y >= a.y and y <= b.y):
			return lerpf(a.x, b.x, (y - a.y) / (b.y - a.y) if absf(b.y - a.y) > 1e-6 else 0.0)
	return (inner[0] as Vector2).x

# a liquid's surface in a bowl / cup at height y (a slightly domed disc), with its colour
static func _surface(p: Node3D, bw: Dictionary, y: float, col, m: Material, at := Vector3.ZERO) -> MeshInstance3D:
	var r := _r_at(bw.inner, y - at.y) * 0.995
	var mi := _add(p, K.disc(r, col, 40, 6, 0.0015), m, Vector3(at.x, y, at.z))
	return mi

static func _metal() -> Material:
	return K.mat(Color("b9c2d2"), {"gloss": 0.9, "gloss_size": 0.9, "rim": Color(0.8, 0.9, 1.0, 0.4), "deep": Vector3(0.5, 0.52, 0.6), "shade": Vector3(0.72, 0.74, 0.82)})

static func utensil_mesh(kind: String) -> Node3D:
	var g := Node3D.new()
	g.name = "utensil_" + kind
	match kind:
		"fork": _fork(g, Vector3.ZERO, 0.0, true)
		"spoon": _spoon(g, Vector3.ZERO, 0.0, true)
		"chopsticks": _chopsticks(g, Vector3.ZERO, 0.0, true)
	return g

# cutlery lying on the table (or, held, pointing along +z from the hand)
static func _fork(p: Node3D, at: Vector3, yaw: float, held := false) -> Node3D:
	var g := _group(p, at, "fork")
	g.rotation.y = yaw
	var m := _metal()
	_add(g, K.tube([Vector3(0, 0.004, -0.09), Vector3(0, 0.006, -0.03), Vector3(0, 0.005, 0.02)], func(v): return lerpf(0.0055, 0.0032, v), Color.WHITE, 8, 4, 0.55), m)
	_add(g, K.rbox(Vector3(0.0085, 0.0018, 0.012), 0.5), m, Vector3(0, 0.0045, 0.032))
	for i in 4:
		var x := -0.0062 + i * 0.0041
		_add(g, K.tube([Vector3(x, 0.0045, 0.04), Vector3(x, 0.005, 0.06), Vector3(x, 0.0065, 0.07)], 0.0011, Color.WHITE, 6, 3), m)
	if held: g.rotation = Vector3(0, 0, 0)
	return g

static func _spoon(p: Node3D, at: Vector3, yaw: float, _held := false) -> Node3D:
	var g := _group(p, at, "spoon")
	g.rotation.y = yaw
	var m := _metal()
	_add(g, K.tube([Vector3(0, 0.004, -0.085), Vector3(0, 0.0065, -0.03), Vector3(0, 0.005, 0.02)], func(v): return lerpf(0.0055, 0.003, v), Color.WHITE, 8, 4, 0.55), m)
	var bowl := [Vector2(0, 0.0), Vector2(0.006, 0.0005), Vector2(0.011, 0.002), Vector2(0.0125, 0.0045), Vector2(0.0118, 0.005), Vector2(0.009, 0.0035), Vector2(0, 0.0025)]
	_add(g, K.lathe(bowl, Color.WHITE, 24), m, Vector3(0, 0.003, 0.036), Vector3.ZERO, Vector3(1.0, 1.0, 1.45))
	return g

static func _chopsticks(p: Node3D, at: Vector3, yaw: float, held := false) -> Node3D:
	var g := _group(p, at, "chopsticks")
	g.rotation.y = yaw
	var lac := K.mat(Color("b3332b"), {"gloss": 0.7, "gloss_size": 0.95})
	var tipc := K.mat(Color("e9d6b0"))
	for s in [-1.0, 1.0]:
		var x0: float = s * (0.006 if not held else 0.004)
		var x1: float = s * (0.0035 if not held else 0.0012)
		_add(g, K.tube([Vector3(x0, 0.006, -0.11), Vector3(lerpf(x0, x1, 0.6), 0.0055, 0.02)], func(v): return lerpf(0.0034, 0.0022, v), Color.WHITE, 8, 2), lac)
		_add(g, K.tube([Vector3(lerpf(x0, x1, 0.6), 0.0055, 0.02), Vector3(x1, 0.005, 0.07)], func(v): return lerpf(0.0022, 0.0012, v), Color.WHITE, 8, 2, 0.0, false), tipc)
	if not held:
		# the little rest under them
		_add(g, K.rbox(Vector3(0.012, 0.004, 0.006), 0.6), K.mat(Color("6f9fb8"), CERAMIC), Vector3(0, 0.003, -0.07))
	return g

# a sprig of leaves (parsley, mint, shiso): n small leaves round a point
static func _leaves(p: Node3D, at: Vector3, n: int, size: float, col: Color, rng: RandomNumberGenerator) -> void:
	var m := K.mat(col, {"gloss": 0.35, "gloss_size": 0.96})
	for i in n:
		var a := TAU * i / n + rng.randf() * 0.5
		var lf := K.blob(size, Vector3(1.0, 0.18, 0.55), 0.15, col.lerp(Color.WHITE, rng.randf() * 0.15), i, 14, 8)
		_add(p, lf, m, at + Vector3(cos(a) * size * 0.8, size * 0.15 + rng.randf() * size * 0.2, sin(a) * size * 0.8), Vector3(rng.randf_range(-0.4, 0.4), -a, rng.randf_range(0.1, 0.5)))

# rice: a mound of radius r and height h, with grains over it
static func _rice(p: Node3D, at: Vector3, r: float, h: float, rng: RandomNumberGenerator, grains := 170) -> Node3D:
	var g := _group(p, at, "rice")
	var prof := []
	for k in 12:
		var t := float(k) / 11.0
		prof.append(Vector2(r * (1.0 - t * t * 0.98), h * sin(t * PI * 0.5) * (1.0 - 0.1 * t) if k > 0 else 0.0))
	prof.insert(0, Vector2(0, 0))
	prof.append(Vector2(0, h * 0.92))
	var wob := func(u: float, v: float) -> float: return 1.0 + 0.05 * sin(u * TAU * 5.0 + v * 3.0) + 0.03 * K.noise(Vector3(u * 9.0, v * 4.0, 1.0))
	_add(g, K.lathe(prof, K.vgrad(Color("c9c6bd"), Color("e4e1d8"), 0.0, h), 40, wob), K.mat(Color.WHITE, {"rim": Color(1, 1, 1, 0.1)}))
	# the grains: little glossy capsules over the mound
	grains = int(grains * 1.8)
	var gm := K.blob(0.0055, Vector3(1.0, 0.5, 0.5), 0.0, K.vgrad(Color("e6e3da"), Color("ffffff"), -0.002, 0.002), 0, 8, 6)
	var xf := []
	for i in grains:
		var a := rng.randf() * TAU
		var f := sqrt(rng.randf()) * 0.97
		var rr := r * f
		var tt := sqrt(maxf(0.0, (1.0 - f) / 0.98))
		var y := h * sin(tt * PI * 0.5) * (1.0 - 0.1 * tt)
		var n := Vector3(cos(a) * f * h / r * 2.0, 1.0, sin(a) * f * h / r * 2.0).normalized()
		var b := Basis(Vector3.UP, rng.randf() * TAU).rotated(n.cross(Vector3.UP).normalized() if n.cross(Vector3.UP).length() > 0.01 else Vector3.RIGHT, -acos(clampf(n.y, -1.0, 1.0)))
		xf.append(Transform3D(b, Vector3(cos(a) * rr, y, sin(a) * rr)))
	g.add_child(K.scatter(gm, K.mat(Color("fbfaf4"), {"gloss": 0.75, "gloss_size": 0.94, "rim": Color(1, 1, 1, 0.05)}), xf))
	return g

static func _seeds(p: Node3D, at: Vector3, n: int, r: float, y: float, col: Color, rng: RandomNumberGenerator, size := 0.0018) -> void:
	var gm := K.blob(size, Vector3(1.0, 0.45, 0.6), 0.0, Color.WHITE, 0, 6, 4)
	var xf := []
	for i in n:
		var a := rng.randf() * TAU
		var rr := sqrt(rng.randf()) * r
		xf.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU), at + Vector3(cos(a) * rr, y, sin(a) * rr)))
	p.add_child(K.scatter(gm, K.mat(col, {"vc": false, "gloss": 0.3}), xf))

# a berry: a glossy sphere with a little crown (blue oran, red, pink)
static func _berry(p: Node3D, at: Vector3, r: float, col: Color, rng: RandomNumberGenerator) -> MeshInstance3D:
	var b := _add(p, K.blob(r, Vector3(1, 0.92, 1), 0.04, K.vgrad(col.darkened(0.25), col.lightened(0.12), -r, r), rng.randi() % 50, 16, 10),
		K.mat(Color.WHITE, {"gloss": 0.85, "gloss_size": 0.955, "rim": Color(1, 0.9, 1, 0.3)}), at)
	_add(b, K.blob(r * 0.28, Vector3(1, 0.3, 1), 0.3, col.darkened(0.55), 3, 8, 5), K.mat(Color.WHITE), Vector3(0, r * 0.92, 0))
	return b

# a strawberry (seeds and all), pointing up
static func _strawberry(p: Node3D, at: Vector3, s: float, rng: RandomNumberGenerator) -> Node3D:
	var g := _group(p, at, "strawberry")
	var prof := []
	for k in 13:
		var t := float(k) / 12.0
		prof.append(Vector2(s * sin(t * PI) * (0.55 + 0.45 * (1.0 - t)) * (1.0 - 0.15 * t), s * 1.25 * t))
	prof[0] = Vector2(0, 0)
	prof[12] = Vector2(0, s * 1.25)
	var body := K.lathe(prof, K.vgrad(Color("e8323a"), Color("c0182a"), 0.0, s * 1.3), 24)
	var bm := _add(g, body, K.mat(Color.WHITE, {"gloss": 0.85, "gloss_size": 0.95}), Vector3.ZERO, Vector3(PI, 0, 0))
	bm.position.y = s * 1.25
	var xf := []
	for i in 40:
		var t := rng.randf_range(0.12, 0.9)
		var a := rng.randf() * TAU
		var rr: float = s * sin(t * PI) * (0.55 + 0.45 * (1.0 - t)) * (1.0 - 0.15 * t) * 1.01
		xf.append(Transform3D(Basis(Vector3.UP, a), Vector3(cos(a) * rr, s * 1.25 * (1.0 - t), sin(a) * rr)))
	g.add_child(K.scatter(K.blob(s * 0.05, Vector3(1, 1.4, 1), 0.0, Color.WHITE, 0, 6, 4), K.mat(Color("ffe27a"), {"vc": false}), xf))
	for i in 5:
		var a := TAU * i / 5.0
		_add(g, K.blob(s * 0.32, Vector3(1.0, 0.12, 0.38), 0.1, Color("3f9a3a"), i, 10, 6), K.mat(Color.WHITE, {"gloss": 0.3}),
			Vector3(cos(a) * s * 0.22, s * 1.24, sin(a) * s * 0.22), Vector3(0, -a, 0.35))
	return g

# ======================================================================
# breakfast
# ======================================================================
static func _pancakes(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "fork"
	d.morsel = Color("e9b866")
	d.hot = true
	var y := _plate(d, 0.125)
	_fork(d, Vector3(-0.15, 0.0, 0.01), 0.05)
	var knife := _group(d, Vector3(0.15, 0, 0.0), "knife")
	_add(knife, K.tube([Vector3(0, 0.004, -0.09), Vector3(0, 0.006, -0.02)], 0.005, Color.WHITE, 8, 2, 0.5), _metal())
	_add(knife, K.rbox(Vector3(0.008, 0.0012, 0.05), 0.6), _metal(), Vector3(0.001, 0.0045, 0.03))
	# a syrup pool round the stack
	var syr := K.mat(Color("c46a12"), {"gloss": 1.0, "gloss_size": 0.9, "rim": Color(1, 0.7, 0.3, 0.4)})
	var pool := func(a: float) -> float: return 0.088 + 0.012 * sin(a * 3.0 + 1.0) + 0.008 * sin(a * 7.0)
	d.part(_add(d, K.disc(pool, Color.WHITE, 48, 4, 0.001), syr, Vector3(0.004, y + 0.0008, 0.0)), 0.75, 1.0)
	# three pancakes, golden brown faces and a pale fluffy edge
	var cake := func(_u: float, _v: float, q: Vector3) -> Color:
		var edge := clampf((Vector2(q.x, q.z).length() - 0.058) / 0.012, 0.0, 1.0)
		var face := Color("c8772c").lerp(Color("e3a04f"), 0.5 + 0.5 * K.noise(q * 90.0))
		var side := Color("f6deaa").lerp(Color("eec98a"), absf(q.y - 0.008) / 0.008)
		var top := q.y > 0.0145 or q.y < 0.0015
		return face if top and edge < 0.8 else face.lerp(side, edge)
	var wob := func(u: float, _v: float) -> float: return 1.0 + 0.025 * sin(u * TAU * 3.0 + 0.7) + 0.015 * sin(u * TAU * 7.0)
	var cm := K.mat(Color.WHITE, {"gloss": 0.18, "gloss_size": 0.97})
	var hy := y
	for i in 3:
		var pc := _group(d, Vector3(rng.randf_range(-0.004, 0.004), hy, rng.randf_range(-0.004, 0.004)), "cake%d" % i)
		pc.rotation.y = rng.randf() * TAU
		_add(pc, K.lathe(K.puck(0.07 - i * 0.002, 0.016, 0.006), cake, 48, wob), cm)
		hy += 0.0158
		d.part(pc, [0.62, 0.38, 0.12][i], [1.0, 0.68, 0.42][i])
	# syrup on top, dripping over the edge
	var top := _group(d, Vector3(0, hy, 0), "syrup")
	_add(top, K.disc(func(a): return 0.052 + 0.01 * sin(a * 4.0) + 0.006 * sin(a * 9.0 + 1.0), Color.WHITE, 48, 5, 0.0015), syr, Vector3(0, 0.0006, 0))
	for k in 6:
		var a := TAU * k / 6.0 + rng.randf() * 0.4
		var r0 := 0.066
		var len := rng.randf_range(0.012, 0.03)
		_add(top, K.tube([Vector3(cos(a) * 0.055, 0.0012, sin(a) * 0.055), Vector3(cos(a) * r0, 0.0, sin(a) * r0), Vector3(cos(a) * (r0 + 0.004), -0.006, sin(a) * (r0 + 0.004)), Vector3(cos(a) * (r0 + 0.004), -len, sin(a) * (r0 + 0.004))],
			func(v): return 0.0032 * (1.0 + 0.6 * v * v), Color.WHITE, 8, 4, 0.0, true), syr)
	d.part(top, 0.0, 0.4)
	# butter melting on top
	var bt := _group(d, Vector3(0.006, hy + 0.0015, -0.004), "butter")
	_add(bt, K.disc(0.022, Color("ffe9a0"), 24, 3, 0.0005), K.mat(Color.WHITE, {"gloss": 0.9, "gloss_size": 0.93}), Vector3(0, 0.0004, 0))
	_add(bt, K.rbox(Vector3(0.014, 0.0055, 0.012), 0.3, K.vgrad(Color("f7d877"), Color("fff2c2"), -0.005, 0.005)), K.mat(Color.WHITE, {"gloss": 0.7, "gloss_size": 0.95}), Vector3(0, 0.005, 0), Vector3(0.06, 0.4, 0.05))
	d.part(bt, 0.0, 0.25)
	# berries and a mint leaf
	var br := _group(d, Vector3.ZERO, "berries")
	_berry(br, Vector3(-0.03, hy + 0.007, 0.02), 0.0085, Color("3d5fd6"), rng)
	_berry(br, Vector3(0.028, hy + 0.007, 0.024), 0.008, Color("3d5fd6"), rng)
	_berry(br, Vector3(-0.004, hy + 0.007, 0.038), 0.0075, Color("4a6ee0"), rng)
	_strawberry(br, Vector3(0.07, y, 0.06), 0.014, rng).rotation.z = 1.2
	_strawberry(br, Vector3(-0.075, y, 0.055), 0.013, rng).rotation.z = -1.25
	_leaves(br, Vector3(0.016, hy + 0.009, 0.03), 3, 0.009, Color("4fb34a"), rng)
	d.part(br, 0.0, 0.2)
	d.add_child(_steam_at(Vector3(0, hy, 0), 4, 0.12))

static func _steam_at(at: Vector3, n := 5, h := 0.16, spread := 0.03) -> MeshInstance3D:
	var s := K.steam(n, h, spread)
	s.position = at
	return s

static func _breakfast_set(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "chopsticks"
	d.morsel = Color("fffbef")
	d.hot = true
	# a wooden tray
	var wood := func(_u: float, _v: float, q: Vector3) -> Color:
		return Color("b77c46").lerp(Color("9a6235"), 0.5 + 0.5 * sin(q.x * 160.0 + 3.0 * K.noise(q * 30.0)))
	_add(d, K.rbox(Vector3(0.2, 0.008, 0.14), 0.18, wood, 32, 12), K.mat(Color.WHITE, {"gloss": 0.4, "gloss_size": 0.97}), Vector3(0, 0.008, 0))
	_add(d, K.rbox(Vector3(0.19, 0.003, 0.13), 0.12, Color("c58a52")), K.mat(Color.WHITE, {"gloss": 0.3}), Vector3(0, 0.0165, 0))
	var ty := 0.018
	# rice in a white bowl with a blue band (front left)
	var rb := Vector3(-0.08, ty, 0.05)
	var band := func(_u: float, _v: float, q: Vector3) -> Color:
		return Color("2f5fa8") if q.y > 0.03 and q.y < 0.036 else Color("f8f6ef")
	var b1 := _bowl(d, 0.056, 0.05, band, Color("fbfaf5"), rb)
	d.part(_rice(d, Vector3(rb.x, ty + 0.03, rb.z), 0.05, 0.03, rng, 130), 0.2, 0.75)
	# miso soup in a red lacquer bowl (front right)
	var mb := Vector3(0.08, ty, 0.05)
	var lacq := {"gloss": 0.85, "gloss_size": 0.94, "rim": Color(1, 0.6, 0.5, 0.25)}
	var b2 := _bowl(d, 0.055, 0.05, Color("8e1c1c"), Color("1e0d0b"), mb, {"mat": lacq, "foot": 0.5})
	var soup := _group(d, Vector3(mb.x, 0, mb.z), "miso")
	var sy := ty + 0.04
	var cloud := func(u: float, v: float, q: Vector3) -> Color:
		return Color("c58a3c").lerp(Color("e2b675"), clampf(0.5 + 0.6 * K.noise(q * 70.0) - v * 0.3, 0.0, 1.0))
	_surface(soup, b2, 0.0, cloud, K.mat(Color.WHITE, {"gloss": 0.7, "gloss_size": 0.95, "glow": 0.06}))
	soup.get_child(0).position.y = 0.0
	soup.position.y = sy
	for i in 4:
		var a := TAU * i / 4.0 + 0.4
		_add(soup, K.rbox(Vector3(0.007, 0.006, 0.007), 0.35, Color("fbf7ec")), K.mat(Color.WHITE, {"gloss": 0.3}), Vector3(cos(a) * 0.022, 0.002, sin(a) * 0.022), Vector3(0, a, 0))
	for i in 7:
		var a := rng.randf() * TAU
		var rr := rng.randf_range(0.004, 0.035)
		_add(soup, K.tube([Vector3(-0.003, 0, 0), Vector3(0, 0.0025, 0), Vector3(0.003, 0, 0)], 0.0013, Color("5fbf3a"), 6, 2, 0.0, false), K.mat(Color.WHITE, {"gloss": 0.4}),
			Vector3(cos(a) * rr, 0.0015, sin(a) * rr), Vector3(PI * 0.5, rng.randf() * TAU, 0), Vector3(1.2, 1.2, 1.2))
	for i in 3:
		var a := rng.randf() * TAU
		_add(soup, K.blob(0.01, Vector3(1.0, 0.1, 0.6), 0.3, Color("1f3a22"), i, 10, 6), K.mat(Color.WHITE, {"gloss": 0.7}), Vector3(cos(a) * 0.02, 0.0005, sin(a) * 0.02), Vector3(0, a, 0))
	d.level(soup, sy, ty + 0.014, 0.0, 0.6, 0.72)
	d.add_child(_steam_at(Vector3(mb.x, sy, mb.z), 5, 0.14, 0.02))
	# tamagoyaki: three rolled-omelette slices on a little plate, with grated daikon
	var tp := Vector3(0.0, ty, -0.06)
	var ry := _plate(d, 0.06, Color("6aa7c9"), Color("f7f5ee"), tp)
	var tam := _group(d, Vector3(tp.x, ry, tp.z), "tamagoyaki")
	var roll := func(_u: float, _v: float, q: Vector3) -> Color:
		# the rolled layers, a little browning between them
		var rr := Vector2(q.x, q.y - 0.011).length()
		var ring := 0.5 + 0.5 * sin(rr * 900.0)
		return Color("f4c533").lerp(Color("e8a62a"), ring * 0.45).lerp(Color("d9902a"), 0.2 if absf(q.z) > 0.009 else 0.0)
	for i in 3:
		var sl := _add(tam, K.rbox(Vector3(0.016, 0.011, 0.0085), 0.3, roll), K.mat(Color.WHITE, {"gloss": 0.35, "gloss_size": 0.965}), Vector3(-0.022 + i * 0.019, 0.011, 0.002), Vector3(0.0, 0.0, -0.18))
		d.part(sl, 0.0 + i * 0.07, 0.12 + i * 0.07)
	var dk := _add(tam, K.blob(0.009, Vector3(1, 0.7, 1), 0.25, Color("f3f1ea"), 2, 12, 8), K.mat(Color.WHITE, {"gloss": 0.4}), Vector3(0.036, 0.006, 0.012))
	_leaves(tam, Vector3(0.03, 0.003, 0.016), 1, 0.014, Color("3d8f3f"), rng)
	d.part(dk, 0.2, 0.3)
	_chopsticks(d, Vector3(0.0, ty, 0.11), PI * 0.5)

static func _cocoa(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "cup"
	d.morsel = Color("6b3a22")
	d.hot = true
	# a saucer, a red mug with a white band and a handle
	_plate(d, 0.075, Color("d94a3a"), Color("fbf8f2"))
	var mug := _group(d, Vector3(0, 0.009, 0), "mug")
	var red := func(_u: float, _v: float, q: Vector3) -> Color: return Color("f4efe6") if q.y > 0.05 and q.y < 0.062 else Color("d7372e").lerp(Color("b02520"), clampf(0.5 - q.y * 5.0, 0.0, 1.0))
	var prof := [Vector2(0, 0.003), Vector2(0.03, 0.003), Vector2(0.033, 0.0), Vector2(0.037, 0.004), Vector2(0.039, 0.04), Vector2(0.04, 0.08), Vector2(0.041, 0.086), Vector2(0.037, 0.087),
		Vector2(0.036, 0.08), Vector2(0.035, 0.03), Vector2(0.03, 0.012), Vector2(0, 0.01)]
	_add(mug, K.lathe(prof, func(u, v, q): return red.call(u, v, q) if v < 0.6 else Color("efe2cf"), 40), K.mat(Color.WHITE, CERAMIC))
	var hp := []
	for k in 9:
		var a := -PI * 0.5 + PI * k / 8.0
		hp.append(Vector3(0.039 + cos(a) * 0.02, 0.045 + sin(a) * 0.022, 0))
	_add(mug, K.tube(hp, 0.0055, Color("cf322a"), 10, 4, 0.25, false), K.mat(Color.WHITE, CERAMIC))
	# the cocoa, glossy, with marshmallows bobbing and a dust of cocoa powder
	var top := _group(mug, Vector3(0, 0.074, 0), "cocoa")
	_add(top, K.disc(0.0355, func(_u, v, q): return Color("5a2d18").lerp(Color("8a4e2c"), clampf(0.5 + 0.5 * K.noise(q * 80.0) - v * 0.3, 0.0, 1.0)), 40, 5, 0.001),
		K.mat(Color.WHITE, {"gloss": 0.9, "gloss_size": 0.93, "glow": 0.03}))
	for i in 5:
		var a := TAU * i / 5.0 + rng.randf() * 0.5
		var rr := rng.randf_range(0.008, 0.022)
		var c := Color("fff8f4") if i % 2 == 0 else Color("ffd9e4")
		_add(top, K.rbox(Vector3(0.0075, 0.006, 0.0075), 0.45, K.vgrad(c.darkened(0.08), c, -0.006, 0.006)), K.mat(Color.WHITE, {"gloss": 0.2}),
			Vector3(cos(a) * rr, 0.003, sin(a) * rr), Vector3(rng.randf_range(-0.3, 0.3), rng.randf() * TAU, rng.randf_range(-0.3, 0.3)))
	_seeds(top, Vector3(0, 0.0016, 0), 30, 0.03, 0.0, Color("3b1c0e"), rng, 0.0012)
	d.level(top, 0.074, 0.03, 0.0, 1.0, 0.95)
	d.add_child(_steam_at(Vector3(0, 0.09, 0), 5, 0.14, 0.018))
	d.set_held(mug, Transform3D(Basis.IDENTITY, Vector3(-0.045, -0.04, 0.0)))
	# a cookie on the saucer
	var ck := _add(d, K.lathe(K.puck(0.017, 0.006, 0.0025), func(_u, _v, q): return Color("d9a05a").lerp(Color("b97835"), 0.5 + 0.5 * K.noise(q * 120.0)), 24), K.mat(Color.WHITE, {"gloss": 0.1}), Vector3(0.0, 0.009, 0.056))
	_seeds(ck, Vector3(0, 0.0062, 0), 6, 0.012, 0.0, Color("3a1d10"), rng, 0.0022)
	d.part(ck, 0.6, 0.9)

# ======================================================================
# rice and rice dishes
# ======================================================================
# an onigiri standing up: a rounded triangle of rice, a band of nori round its foot
static func _onigiri_one(p: Node3D, at: Vector3, yaw: float, s: float, rng: RandomNumberGenerator, topping := "") -> Node3D:
	var g := _group(p, at, "onigiri")
	g.rotation.y = yaw
	var tri := func(a: float) -> float:
		# a rounded triangle, a corner up (the outline in the puff's xz plane, before standing it up)
		var k := cos(3.0 * (a - PI * 0.5))
		return s * (0.8 + 0.2 * k)
	var body := _group(g, Vector3(0, s * 0.82, 0), "rice")
	body.rotation.x = -PI * 0.5
	_add(body, K.puff(tri, s * 0.42, 0.5, K.vgrad(Color("cfccc2"), Color("e8e5dc"), -s, s), 40, 12, 0.015, rng.randi() % 40), K.mat(Color.WHITE, {"gloss": 0.15, "gloss_size": 0.97, "rim": Color(1, 1, 1, 0.1)}))
	# grains on the faces
	var gm := K.blob(s * 0.07, Vector3(1.0, 0.55, 0.55), 0.0, Color.WHITE, 0, 8, 6)
	var xf := []
	for i in 300:
		var a := rng.randf() * TAU
		var rr: float = tri.call(a) * sqrt(rng.randf()) * 0.95
		var side := 1.0 if rng.randf() < 0.5 else -1.0
		var z := side * s * 0.42 * pow(maxf(0.0, 1.0 - pow(rr / tri.call(a), 2.0)), 0.35)
		xf.append(Transform3D(Basis(Vector3.FORWARD, rng.randf() * TAU), Vector3(cos(a) * rr, z, sin(a) * rr)))
	body.add_child(K.scatter(gm, K.mat(Color("fbfaf4"), {"gloss": 0.75, "gloss_size": 0.94, "vc": false}), xf))
	# nori: a dark, slightly glossy sheet wrapped round the bottom
	var nori := func(_u: float, _v: float, q: Vector3) -> Color: return Color("1d2b1f").lerp(Color("2c3f2a"), 0.5 + 0.5 * K.noise(q * 200.0))
	_add(g, K.rbox(Vector3(s * 0.42, s * 0.36, s * 0.45), 0.25, nori), K.mat(Color.WHITE, {"gloss": 0.45, "gloss_size": 0.96, "rim": Color(0.6, 0.9, 0.6, 0.2)}), Vector3(0, s * 0.3, 0))
	if topping == "ume":
		_add(g, K.blob(s * 0.13, Vector3(1, 0.85, 1), 0.12, Color("c4242f"), 4, 14, 8), K.mat(Color.WHITE, {"gloss": 0.85, "gloss_size": 0.95}), Vector3(0, s * 1.2, s * 0.36))
	elif topping == "sesame":
		var xf2 := []
		for i in 26:
			var a2 := rng.randf() * TAU
			var r2 := rng.randf() * s * 0.5
			xf2.append(Transform3D(Basis(Vector3.RIGHT, PI * 0.5).rotated(Vector3.FORWARD, rng.randf() * TAU), Vector3(cos(a2) * r2, s * 0.95 + sin(a2) * r2 * 0.8, s * 0.42)))
		g.add_child(K.scatter(K.blob(0.0016, Vector3(1.0, 0.45, 0.6), 0.0, Color.WHITE, 0, 6, 4), K.mat(Color("2a2420"), {"vc": false}), xf2))
	return g

static func _onigiri(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "hand"
	d.morsel = Color("fbf8ee")
	# a long ceramic plate on a bamboo leaf
	_add(d, K.rbox(Vector3(0.12, 0.007, 0.075), 0.2, Color("f4efe4")), K.mat(Color.WHITE, CERAMIC), Vector3(0, 0.007, 0))
	var leaf := func(_u: float, v: float, q: Vector3) -> Color: return Color("3f8f3a").lerp(Color("6cbf4a"), clampf(1.0 - v, 0, 1)).lerp(Color("2f6f2a"), 0.3 if absf(q.z) < 0.0015 else 0.0)
	_add(d, K.disc(func(a): return 0.1 * pow(absf(cos(a)), 0.6) + 0.004, leaf, 40, 4, 0.002), K.mat(Color.WHITE, {"gloss": 0.5, "gloss_size": 0.96}), Vector3(0, 0.0145, 0), Vector3(0, 0.15, 0), Vector3(1.0, 1.0, 0.38))
	var a := _onigiri_one(d, Vector3(-0.042, 0.015, 0.0), 0.12, 0.045, rng, "ume")
	var b := _onigiri_one(d, Vector3(0.036, 0.015, -0.006), -0.18, 0.043, rng, "sesame")
	d.part(b, 0.5, 1.0)
	d.part(a, 0.0, 0.5)
	# pickles: half-moons of yellow takuan and a little pile of pink ginger
	for i in 3:
		var tk := _add(d, K.lathe(K.puck(0.011, 0.003, 0.001), func(_u, _v, q): return Color("f2d23a").lerp(Color("e8b820"), Vector2(q.x, q.z).length() / 0.011), 20),
			K.mat(Color.WHITE, {"gloss": 0.7, "gloss_size": 0.95}), Vector3(0.09 + i * 0.004, 0.018 + i * 0.002, 0.03 - i * 0.008), Vector3(0.9, 0.3 * i, 0.2))
		d.part(tk, 0.85, 1.0)
	for i in 5:
		var gg := _add(d, K.blob(0.006, Vector3(1.0, 0.2, 0.6), 0.2, Color("f29bb0"), i, 10, 6), K.mat(Color.WHITE, {"gloss": 0.8}), Vector3(0.088 + rng.randf() * 0.01, 0.018 + i * 0.0015, -0.03 + rng.randf() * 0.01), Vector3(rng.randf(), rng.randf() * 3, rng.randf()))
		d.part(gg, 0.85, 1.0)
	d.set_held(a, Transform3D(Basis(Vector3.RIGHT, -0.4), Vector3(0, -0.02, 0.03)))

static func _curry(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "spoon"
	d.morsel = Color("b4641c")
	d.hot = true
	var y := _plate(d, 0.13, Color("d0a238"), Color("fbf8f0"))
	# the rice on one side
	var rice := _rice(d, Vector3(-0.035, y, -0.01), 0.065, 0.034, rng, 180)
	d.part(rice, 0.3, 1.0)
	# the curry: a glossy pool with chunks of potato, carrot and meat
	var cur := _group(d, Vector3(0.03, y, 0.012), "curry")
	var sauce := K.mat(Color.WHITE, {"gloss": 1.0, "gloss_size": 0.92, "rim": Color(1, 0.7, 0.3, 0.35)})
	_add(cur, K.disc(func(a): return 0.07 + 0.008 * sin(a * 3.0) + 0.005 * sin(a * 8.0 + 2.0),
		func(_u, v, q): return Color("a9560f").lerp(Color("cf7a1d"), clampf(0.5 + 0.5 * K.noise(q * 60.0), 0, 1)).lerp(Color("8d4310"), v * v * 0.5), 48, 6, 0.008), sauce)
	var chunks := [["potato", Color("f2cf6a"), 0.012], ["carrot", Color("f07a22"), 0.01], ["meat", Color("7a3e22"), 0.011], ["potato", Color("f4d77a"), 0.011],
		["carrot", Color("ee6f1a"), 0.009], ["meat", Color("6e3520"), 0.012], ["potato", Color("efcb63"), 0.01]]
	for i in chunks.size():
		var c: Array = chunks[i]
		var a := TAU * i / chunks.size() + rng.randf() * 0.4
		var rr := rng.randf_range(0.015, 0.05)
		var mesh: Mesh = K.rbox(Vector3(c[2], c[2] * 0.75, c[2] * 0.85), 0.45, K.vgrad(c[1].darkened(0.2), c[1], -0.01, 0.01)) if c[0] != "meat" else K.blob(c[2], Vector3(1.1, 0.7, 0.9), 0.25, K.vgrad(c[1].darkened(0.2), c[1].lightened(0.1), -0.01, 0.01), i, 14, 8)
		var ch := _add(cur, mesh, K.mat(Color.WHITE, {"gloss": 0.75, "gloss_size": 0.95}), Vector3(cos(a) * rr, 0.007, sin(a) * rr), Vector3(rng.randf_range(-0.3, 0.3), rng.randf() * TAU, rng.randf_range(-0.3, 0.3)))
		d.part(ch, 0.02 + i * 0.06, 0.1 + i * 0.06)
	d.part(cur, 0.55, 1.0)
	# fukujinzuke: the little red pickles
	for i in 6:
		_add(d, K.rbox(Vector3(0.004, 0.0025, 0.003), 0.4, Color("d43a3a")), K.mat(Color.WHITE, {"gloss": 0.8}), Vector3(-0.09 + rng.randf() * 0.012, y + 0.003 + i * 0.001, 0.05 + rng.randf() * 0.012), Vector3(rng.randf(), rng.randf() * 3, rng.randf()))
	_leaves(d, Vector3(-0.02, y + 0.036, -0.02), 3, 0.007, Color("3f9f3a"), rng)
	_spoon(d, Vector3(0.155, 0.0, 0.0), 0.0)
	d.add_child(_steam_at(Vector3(0.02, y + 0.02, 0.0), 6, 0.16, 0.035))

static func _omurice(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "spoon"
	d.morsel = Color("f2c037")
	d.hot = true
	var y := _plate(d, 0.13, Color("e05a4a"), Color("fdfbf6"))
	var om := _group(d, Vector3(-0.01, y, 0.0), "omelette")
	om.rotation.y = 0.15
	var egg := func(_u: float, v: float, q: Vector3) -> Color:
		return Color("f9cf3c").lerp(Color("f3b42a"), clampf(0.5 + 0.6 * K.noise(q * 70.0), 0.0, 1.0)).lerp(Color("e89a2a"), clampf(1.0 - v * 2.0, 0.0, 1.0) * 0.4)
	_add(om, K.puff(func(a): return 0.085 * (1.0 - 0.42 * pow(absf(sin(a)), 1.4)), 0.034, 0.35, egg, 48, 14), K.mat(Color.WHITE, {"gloss": 0.35, "gloss_size": 0.988, "rim": Color(1, 0.85, 0.5, 0.35)}), Vector3(0, 0.03, 0), Vector3.ZERO, Vector3(1, 1, 1))
	# ketchup: a glossy zigzag down its back
	var kp := []
	for k in 9:
		var t := float(k) / 8.0
		var x := lerpf(-0.06, 0.06, t)
		var w := 0.05 * (1.0 - pow(absf(x) / 0.085, 2.0))
		var z := (w * 0.55) * (1.0 if k % 2 == 0 else -1.0)
		var h := 0.034 * pow(maxf(0.0, 1.0 - pow(x / 0.085, 2.0) - pow(z / 0.049, 2.0)), 0.3)
		kp.append(Vector3(x, 0.03 + h + 0.0035, z))
	_add(om, K.tube(kp, 0.0042, Color("d81f1f"), 10, 6, 0.45), K.mat(Color.WHITE, {"gloss": 1.0, "gloss_size": 0.9}))
	d.part(om, 0.0, 1.0)
	# a little salad: lettuce, a cherry tomato, cucumber
	var sal := _group(d, Vector3(0.075, y, 0.055), "salad")
	for i in 4:
		_add(sal, K.blob(0.02, Vector3(1.0, 0.25, 0.7), 0.35, K.vgrad(Color("4fa63a"), Color("a7dd6a"), -0.004, 0.004), i, 14, 8), K.mat(Color.WHITE, {"gloss": 0.45}), Vector3(rng.randf_range(-0.01, 0.01), 0.004 + i * 0.002, rng.randf_range(-0.01, 0.01)), Vector3(rng.randf_range(-0.4, 0.4), rng.randf() * TAU, rng.randf_range(-0.4, 0.4)))
	var tom := _berry(sal, Vector3(0.004, 0.02, 0.004), 0.011, Color("e8282a"), rng)
	tom.rotation.z = 0.3
	for i in 2:
		_add(sal, K.lathe(K.puck(0.009, 0.003, 0.001), func(_u, _v, q): return Color("2f7a2a") if Vector2(q.x, q.z).length() > 0.0078 else Color("d7ecb0").lerp(Color("a8d07a"), Vector2(q.x, q.z).length() / 0.008), 20),
			K.mat(Color.WHITE, {"gloss": 0.6}), Vector3(-0.016 + i * 0.008, 0.012 + i * 0.002, 0.01), Vector3(0.5, 0, 0.3))
	d.part(sal, 0.85, 1.0)
	_leaves(om, Vector3(0.05, 0.066, 0.0), 3, 0.006, Color("3f9f3a"), rng)
	_spoon(d, Vector3(0.155, 0.0, -0.01), 0.0)
	d.add_child(_steam_at(Vector3(-0.01, y + 0.06, 0.0), 4, 0.12, 0.03))

# ======================================================================
# hearty suppers
# ======================================================================
static func _hamburg(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "fork"
	d.morsel = Color("6b3218")
	d.hot = true
	var y := _plate(d, 0.13, Color("7a4a2a"), Color("fbf8f1"))
	var sauce := K.mat(Color.WHITE, {"gloss": 1.0, "gloss_size": 0.91, "rim": Color(1, 0.6, 0.3, 0.3)})
	# a pool of demi-glace
	_add(d, K.disc(func(a): return 0.062 + 0.006 * sin(a * 5.0), func(_u, v, q): return Color("4a1f0e").lerp(Color("6b2e14"), 0.5 + 0.5 * K.noise(q * 70.0)), 40, 4, 0.0015), sauce, Vector3(-0.01, y + 0.0006, 0.0))
	var hb := _group(d, Vector3(-0.012, y + 0.002, 0.0), "steak")
	var meat := func(_u: float, v: float, q: Vector3) -> Color:
		return Color("6a3218").lerp(Color("8e4a24"), 0.5 + 0.5 * K.noise(q * 90.0)).lerp(Color("4a200e"), clampf(v - 0.6, 0.0, 1.0))
	_add(hb, K.puff(func(a): return 0.052 + 0.004 * sin(a * 3.0 + 1.0), 0.018, 0.55, meat, 40, 12, 0.03, 7), K.mat(Color.WHITE, {"gloss": 0.35, "gloss_size": 0.96}), Vector3(0, 0.016, 0), Vector3.ZERO, Vector3(1, 1, 0.82))
	# the sauce over the top, running down the sides
	_add(hb, K.disc(func(a): return 0.044 + 0.006 * sin(a * 4.0 + 0.5), Color("5a250f"), 40, 5, 0.0035), sauce, Vector3(0, 0.0325, 0), Vector3.ZERO, Vector3(1, 1, 0.82))
	for k in 7:
		var a := TAU * k / 7.0 + rng.randf() * 0.3
		var ex := Vector3(cos(a) * 0.046, 0.03, sin(a) * 0.046 * 0.82)
		var ou := Vector3(cos(a) * 0.054, 0.012, sin(a) * 0.054 * 0.82)
		_add(hb, K.tube([ex, ex.lerp(ou, 0.5) + Vector3(cos(a), 0.6, sin(a)) * 0.004, ou, ou + Vector3(0, -0.01, 0)], 0.0045, Color("55230e"), 8, 3), sauce)
	d.part(hb, 0.0, 0.9)
	# sides: buttery carrots, broccoli, a scoop of mashed potato
	var side := _group(d, Vector3(0.06, y, 0.04), "sides")
	for i in 3:
		_add(side, K.lathe([Vector2(0, 0), Vector2(0.008, 0.0005), Vector2(0.0075, 0.011), Vector2(0.004, 0.018), Vector2(0, 0.02)], K.vgrad(Color("e8641a"), Color("f79a3a"), 0, 0.02), 16, func(u, v): return 1.0 + 0.08 * sin(u * TAU * 6.0)),
			K.mat(Color.WHITE, {"gloss": 0.9, "gloss_size": 0.94}), Vector3(-0.012 + i * 0.011, 0.007, 0.02 + (i % 2) * 0.006), Vector3(PI * 0.5, 0.4 * i, 0))
	for i in 3:
		var bp := Vector3(0.022 + i * 0.012, 0.0, -0.012 + (i % 2) * 0.012)
		_add(side, K.tube([bp, bp + Vector3(0, 0.012, 0)], 0.004, Color("8fcf5a"), 8, 2), K.mat(Color.WHITE, {"gloss": 0.3}))
		for j in 5:
			var a := TAU * j / 5.0
			_add(side, K.blob(0.0075, Vector3.ONE, 0.35, K.vgrad(Color("2f7f2a"), Color("5fb43a"), -0.007, 0.007), i * 5 + j, 12, 8), K.mat(Color.WHITE, {"gloss": 0.25}), bp + Vector3(cos(a) * 0.006, 0.017 + (0.004 if j == 0 else 0.0), sin(a) * 0.006))
	var mash := _add(side, K.lathe([Vector2(0, 0), Vector2(0.026, 0.0), Vector2(0.022, 0.012), Vector2(0.012, 0.022), Vector2(0.003, 0.027), Vector2(0, 0.028)], K.vgrad(Color("eedfb0"), Color("fff6d8"), 0.0, 0.028), 32, func(u, v): return 1.0 + 0.12 * sin(u * TAU * 7.0) * v),
		K.mat(Color.WHITE, {"gloss": 0.3}), Vector3(-0.02, 0.003, -0.03))
	_add(mash, K.rbox(Vector3(0.006, 0.003, 0.006), 0.3, Color("ffe68a")), K.mat(Color.WHITE, {"gloss": 0.9}), Vector3(0, 0.028, 0), Vector3(0.1, 0.5, 0))
	d.part(side, 0.85, 1.0)
	_leaves(hb, Vector3(0.0, 0.036, 0.0), 2, 0.006, Color("3f9f3a"), rng)
	_fork(d, Vector3(-0.155, 0.0, 0.0), 0.0)
	d.add_child(_steam_at(Vector3(-0.012, y + 0.035, 0.0), 5, 0.15, 0.03))

static func _cream_stew(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "spoon"
	d.morsel = Color("f6ead2")
	d.hot = true
	_plate(d, 0.11, Color("4f8fcf"), Color("fbf9f4"))
	var band := func(_u: float, _v: float, q: Vector3) -> Color:
		return Color("3f78c2") if q.y > 0.045 and q.y < 0.052 else Color("f9f7f0").lerp(Color("e4e9f2"), clampf(0.05 - q.y * 0.8, 0.0, 1.0))
	var bw := _bowl(d, 0.075, 0.062, band, Color("fbfaf6"), Vector3(0, 0.009, 0))
	var sy := 0.009 + 0.05
	var st := _group(d, Vector3(0, sy, 0), "stew")
	_add(st, K.disc(_r_at(bw.inner, 0.05) * 0.99, func(_u, v, q): return Color("f6ecd6").lerp(Color("efdcb6"), clampf(0.5 + 0.5 * K.noise(q * 60.0) + v * 0.2, 0, 1)), 40, 6, 0.002),
		K.mat(Color.WHITE, {"gloss": 0.8, "gloss_size": 0.94, "glow": 0.04}))
	var bits := [Color("f07a22"), Color("f2d27a"), Color("4f9f3a"), Color("f3e4c8"), Color("ee6f1a"), Color("f4d983"), Color("e9dcc0")]
	for i in bits.size():
		var a := TAU * i / bits.size() + rng.randf() * 0.3
		var rr := rng.randf_range(0.01, 0.045)
		var c: Color = bits[i]
		var mesh: Mesh = K.rbox(Vector3(0.01, 0.007, 0.009), 0.45, K.vgrad(c.darkened(0.15), c, -0.007, 0.007)) if i != 2 else K.blob(0.009, Vector3.ONE, 0.4, K.vgrad(Color("2f7f2a"), Color("6fbf4a"), -0.008, 0.008), i, 12, 8)
		_add(st, mesh, K.mat(Color.WHITE, {"gloss": 0.7, "gloss_size": 0.95}), Vector3(cos(a) * rr, 0.002, sin(a) * rr), Vector3(rng.randf_range(-0.4, 0.4), rng.randf() * TAU, rng.randf_range(-0.4, 0.4)))
	_seeds(st, Vector3(0, 0.0025, 0), 40, 0.05, 0.0, Color("3f8f2a"), rng, 0.0013)
	d.level(st, sy, 0.009 + 0.013, 0.0, 0.95, 0.6)
	# a crusty roll on the side
	var roll := _add(d, K.blob(0.026, Vector3(1.2, 0.75, 0.9), 0.04, func(_u, v, q): return Color("c27a32").lerp(Color("e3a45a"), clampf(v * 1.4 - 0.4, 0.0, 1.0)).lerp(Color("f2d49a"), 0.6 if absf(q.x - 0.004 * sin(q.z * 200.0)) < 0.002 and q.y > 0.01 else 0.0), 3, 24, 14),
		K.mat(Color.WHITE, {"gloss": 0.2, "gloss_size": 0.985}), Vector3(0.085, 0.028, 0.06), Vector3(0, 0.6, 0))
	d.part(roll, 0.7, 1.0)
	_spoon(d, Vector3(0.0, 0.009, 0.1), PI * 0.5 + 0.2)
	d.add_child(_steam_at(Vector3(0, sy, 0), 6, 0.16, 0.03))

static func _seafood_stew(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "spoon"
	d.morsel = Color("d8502a")
	d.hot = true
	_plate(d, 0.11, Color("c46a3a"), Color("f6efe2"))
	var clay := func(_u: float, _v: float, q: Vector3) -> Color: return Color("b5582f").lerp(Color("8f3f22"), clampf(0.5 + 0.4 * K.noise(q * 40.0) - q.y * 6.0, 0.0, 1.0))
	var bw := _bowl(d, 0.08, 0.058, clay, Color("f2e8d8"), Vector3(0, 0.009, 0), {"mat": {"gloss": 0.45, "gloss_size": 0.96}, "foot": 0.5})
	var sy := 0.009 + 0.046
	var st := _group(d, Vector3(0, sy, 0), "stew")
	_add(st, K.disc(_r_at(bw.inner, 0.046) * 0.99, func(_u, v, q): return Color("c9361c").lerp(Color("e8602c"), clampf(0.5 + 0.6 * K.noise(q * 55.0), 0, 1)), 40, 6, 0.0015),
		K.mat(Color.WHITE, {"gloss": 1.0, "gloss_size": 0.92, "glow": 0.05}))
	# shrimp: curled, striped
	for i in 3:
		var a := TAU * i / 3.0 + 0.3
		var c := Vector3(cos(a) * 0.03, 0.004, sin(a) * 0.03)
		var pts := []
		for k in 7:
			var t := float(k) / 6.0
			var aa := a + PI * 0.5 + t * 2.6
			pts.append(c + Vector3(cos(aa) * 0.012 * (1.0 - t * 0.4), 0.003 * sin(t * PI), sin(aa) * 0.012 * (1.0 - t * 0.4)))
		_add(st, K.tube(pts, func(v): return 0.0055 * (1.0 - v * 0.6), func(_u, v, _q): return Color("f26a3a").lerp(Color("fbd0b0"), 0.5 + 0.5 * sin(v * 40.0)), 12, 4),
			K.mat(Color.WHITE, {"gloss": 0.8, "gloss_size": 0.95}))
	# clams, half open, and two dark mussels
	for i in 2:
		var a := TAU * i / 2.0 + 1.3
		var at := Vector3(cos(a) * 0.04, 0.002, sin(a) * 0.04)
		var shell := K.blob(0.012, Vector3(1.0, 0.3, 0.85), 0.05, func(_u, v, q): return Color("e8dcc6").lerp(Color("b89c7a"), 0.5 + 0.5 * sin(Vector2(q.x, q.z).length() * 900.0)), i, 16, 8)
		_add(st, shell, K.mat(Color.WHITE, {"gloss": 0.5}), at, Vector3(0.5, a, 0))
		_add(st, shell, K.mat(Color.WHITE, {"gloss": 0.5}), at + Vector3(0, 0.004, 0), Vector3(-0.6, a, 0))
		_add(st, K.blob(0.006, Vector3(1, 0.6, 0.8), 0.2, Color("f2b37a"), i, 10, 6), K.mat(Color.WHITE, {"gloss": 0.7}), at + Vector3(0, 0.003, 0))
	for i in 2:
		var a := TAU * i / 2.0 + 2.4
		_add(st, K.blob(0.015, Vector3(1.0, 0.35, 0.5), 0.05, K.vgrad(Color("10141e"), Color("2a3550"), -0.004, 0.004), i + 4, 16, 8), K.mat(Color.WHITE, {"gloss": 0.95, "gloss_size": 0.93, "rim": Color(0.6, 0.7, 1.0, 0.4)}), Vector3(cos(a) * 0.022, 0.003, sin(a) * 0.022), Vector3(0.2, a, 0.1))
	_leaves(st, Vector3(0, 0.006, 0), 4, 0.007, Color("3f9f3a"), rng)
	_seeds(st, Vector3(0, 0.0022, 0), 30, 0.055, 0.0, Color("4f9f2a"), rng, 0.0012)
	d.level(st, sy, 0.009 + 0.013, 0.0, 0.95, 0.6)
	# a lemon wedge on the plate
	var lem := _add(d, K.lathe([Vector2(0, 0), Vector2(0.016, 0.001), Vector2(0.017, 0.004), Vector2(0.0, 0.005)], func(u, _v, q): return Color("f5d82a") if Vector2(q.x, q.z).length() > 0.014 else Color("fff3a0").lerp(Color("f8e060"), 0.5 + 0.5 * sin(u * TAU * 8.0)), 24),
		K.mat(Color.WHITE, {"gloss": 0.8}), Vector3(0.08, 0.016, 0.07), Vector3(PI * 0.5, 0.8, 0), Vector3(1, 1, 1))
	d.part(lem, 0.95, 1.0)
	_spoon(d, Vector3(0.0, 0.009, 0.1), PI * 0.5 - 0.2)
	d.add_child(_steam_at(Vector3(0, sy, 0), 6, 0.16, 0.035))

# ======================================================================
# sweets
# ======================================================================
static func _pecha_tart(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "fork"
	d.morsel = Color("f7a8bf")
	var y := _plate(d, 0.095, Color("e86f9a"), Color("fdfafb"))
	var tart := _group(d, Vector3(0, y, 0), "tart")
	var crust := func(_u: float, v: float, q: Vector3) -> Color: return Color("d99a4a").lerp(Color("f2c07a"), clampf(0.5 + 0.5 * K.noise(q * 120.0) + v * 0.2, 0, 1))
	var fl := func(u: float, _v: float) -> float: return 1.0 + 0.045 * absf(sin(u * TAU * 12.0))
	_add(tart, K.lathe([Vector2(0, 0), Vector2(0.05, 0), Vector2(0.056, 0.004), Vector2(0.058, 0.02), Vector2(0.055, 0.024), Vector2(0.05, 0.022), Vector2(0.049, 0.016), Vector2(0, 0.016)], crust, 48, fl), K.mat(Color.WHITE, {"gloss": 0.2}))
	# pecha cream, then a ring of glossy pecha slices and berries
	_add(tart, K.disc(0.049, func(_u, v, q): return Color("f7a8c4").lerp(Color("fbd0de"), v * 0.5), 40, 5, 0.004), K.mat(Color.WHITE, {"gloss": 0.5, "gloss_size": 0.96}), Vector3(0, 0.0175, 0))
	var glaze := K.mat(Color.WHITE, {"gloss": 1.0, "gloss_size": 0.92, "sparkle": 0.6})
	for i in 9:
		var a := TAU * i / 9.0
		var sl := K.lathe([Vector2(0, 0), Vector2(0.012, 0.0), Vector2(0.013, 0.003), Vector2(0.01, 0.006), Vector2(0, 0.0065)], func(_u, _v, q): return Color("ff8fb0").lerp(Color("ffd2a8"), clampf(q.y / 0.006, 0, 1)), 20)
		_add(tart, sl, glaze, Vector3(cos(a) * 0.034, 0.02, sin(a) * 0.034), Vector3(0.4, -a, 0), Vector3(1.3, 1.0, 0.6))
	for i in 5:
		var a := TAU * i / 5.0 + 0.3
		_berry(tart, Vector3(cos(a) * 0.017, 0.026, sin(a) * 0.017), 0.0065, Color("d9234a") if i % 2 == 0 else Color("3d5fd6"), rng)
	# a swirl of cream and mint on top, a dust of sugar
	_add(tart, K.lathe([Vector2(0, 0), Vector2(0.012, 0.0), Vector2(0.011, 0.006), Vector2(0.007, 0.012), Vector2(0.002, 0.017), Vector2(0, 0.018)], Color("fffaf3"), 32, func(u, v): return 1.0 + 0.2 * absf(sin(u * TAU * 4.0 + v * 6.0))),
		K.mat(Color.WHITE, {"gloss": 0.35}), Vector3(0, 0.027, 0))
	_leaves(tart, Vector3(0.002, 0.044, 0.002), 2, 0.006, Color("4fb34a"), rng)
	d.part(tart, 0.0, 1.0)
	_seeds(d, Vector3(0.04, y + 0.0005, 0.04), 30, 0.03, 0.0, Color("fffdf8"), rng, 0.0012)
	_fork(d, Vector3(0.12, 0.0, 0.0), 0.15)

static func _dango(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "hand"
	d.morsel = Color("f5b6c8")
	# a long black lacquer plate
	_add(d, K.rbox(Vector3(0.11, 0.006, 0.05), 0.2, Color("1b1716")), K.mat(Color.WHITE, {"gloss": 0.9, "gloss_size": 0.94, "rim": Color(1, 0.8, 0.7, 0.2)}), Vector3(0, 0.006, 0))
	var sk_held: Node3D = null
	for s in 2:
		var g := _group(d, Vector3(0, 0.012 + 0.015, -0.014 + s * 0.03), "skewer%d" % s)
		g.rotation.y = 0.12 - s * 0.2
		_add(g, K.tube([Vector3(-0.1, 0, 0), Vector3(0.07, 0, 0)], 0.0018, Color("e6cf9c"), 6, 2), K.mat(Color.WHITE))
		var cols := [Color("f7a8c0"), Color("fbf8f1"), Color("8fc86a")]
		for i in 3:
			var c: Color = cols[i]
			var ball := _add(g, K.blob(0.0145, Vector3(1.0, 0.96, 1.0), 0.02, K.vgrad(c.darkened(0.1), c.lightened(0.08), -0.015, 0.015), i, 20, 12), K.mat(Color.WHITE, {"gloss": 0.4, "gloss_size": 0.965}), Vector3(-0.045 + i * 0.03, 0, 0))
			d.part(ball, s * 0.5 + i * 0.16, s * 0.5 + i * 0.16 + 0.16)
		if s == 0: sk_held = g
	_leaves(d, Vector3(0.085, 0.012, 0.03), 1, 0.016, Color("5f9f3a"), rng)
	# sakura petals
	for i in 3:
		_add(d, K.blob(0.004, Vector3(1.0, 0.15, 0.7), 0.1, Color("ffc6d8"), i, 10, 6), K.mat(Color.WHITE, {"gloss": 0.3}), Vector3(0.06 + rng.randf() * 0.03, 0.0125, -0.03 + rng.randf() * 0.02), Vector3(0, rng.randf() * 3, 0))
	d.set_held(sk_held, Transform3D(Basis(Vector3.UP, PI * 0.5) * Basis(Vector3.FORWARD, 0.5), Vector3(0.0, 0.0, 0.07)))

static func _daifuku(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "hand"
	d.morsel = Color("fbf6f0")
	_add(d, K.lathe(K.puck(0.085, 0.008, 0.003), func(_u, _v, q): return Color("2a1c18").lerp(Color("4a2a22"), 0.5 + 0.5 * K.noise(q * 50.0)), 48), K.mat(Color.WHITE, {"gloss": 0.9, "gloss_size": 0.94, "rim": Color(1, 0.8, 0.7, 0.25)}))
	_leaves(d, Vector3(0.045, 0.009, -0.04), 1, 0.02, Color("4f8f3a"), rng)
	var mochi := K.mat(Color.WHITE, {"gloss": 0.15, "gloss_size": 0.975, "sparkle": 0.5, "rim": Color(1, 1, 1, 0.35)})
	var first: Node3D = null
	for i in 2:
		var g := _group(d, Vector3(-0.026 + i * 0.05, 0.008, -0.004 + i * 0.012), "daifuku%d" % i)
		var col := Color("fbf6ef") if i == 0 else Color("a8cf7a")
		_add(g, K.puff(func(a): return 0.024, 0.016, 0.3, K.vgrad(col.darkened(0.05), col, 0.0, 0.03), 32, 12), mochi, Vector3(0, 0.016, 0))
		if i == 0:
			# an ichigo daifuku: the strawberry peeks out of the top
			_strawberry(g, Vector3(0, 0.022, 0), 0.012, rng)
		_seeds(g, Vector3(0, 0.033, 0), 25, 0.016, 0.0, Color("ffffff"), rng, 0.0011)
		d.part(g, i * 0.5, i * 0.5 + 0.5)
		if i == 0: first = g
	# a sweet pick
	_add(d, K.tube([Vector3(-0.07, 0.012, 0.045), Vector3(0.0, 0.013, 0.062)], 0.0016, Color("c89a5a"), 6, 2), K.mat(Color.WHITE))
	d.set_held(first, Transform3D(Basis.IDENTITY, Vector3(0, -0.01, 0.035)))

static func _taiyaki(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "hand"
	d.morsel = Color("d99a4a")
	d.hot = true
	# on a square of paper on a wooden board
	_add(d, K.rbox(Vector3(0.1, 0.008, 0.07), 0.15, func(_u, _v, q): return Color("c48a52").lerp(Color("a86e3a"), 0.5 + 0.5 * sin(q.x * 140.0 + 2.0 * K.noise(q * 25.0)))), K.mat(Color.WHITE, {"gloss": 0.3}), Vector3(0, 0.008, 0))
	_add(d, K.rbox(Vector3(0.07, 0.0008, 0.07), 0.1, Color("f8f3e8")), K.mat(Color.WHITE), Vector3(0.0, 0.0165, 0.0), Vector3(0, 0.3, 0))
	var fish := func(a: float) -> float:
		# a fish outline: the body an egg, the tail a fan at -x
		var c := cos(a)
		var body := 0.042 * (1.0 - 0.45 * pow(absf(sin(a)), 1.2)) * (1.05 if c > 0.0 else 0.9)
		var tail := 0.058 * smoothstep(0.82, 1.0, -c) * (1.0 + 0.25 * cos(sin(a) * 9.0))
		return maxf(body, tail)
	var first: Node3D = null
	for i in 2:
		var g := _group(d, Vector3(0.0, 0.017 + i * 0.016, -0.014 + i * 0.022), "taiyaki%d" % i)
		g.rotation = Vector3(0, -0.2 + i * 0.35, 0.0)
		var crust := func(_u: float, _v: float, q: Vector3) -> Color:
			var scale_p := 0.5 + 0.5 * sin(q.x * 380.0 + absf(q.z) * 260.0) * sin(q.z * 380.0)
			var edge := clampf(absf(q.y) / 0.008, 0.0, 1.0)
			return Color("a4521a").lerp(Color("d98a35"), edge * 0.5 + scale_p * 0.35).lerp(Color("eab060"), 0.35 * (1.0 - edge))
		_add(g, K.puff(fish, 0.012, 0.6, crust, 64, 12, 0.0, i), K.mat(Color.WHITE, {"gloss": 0.5, "gloss_size": 0.95, "rim": Color(1, 0.8, 0.4, 0.3)}), Vector3(0, 0.012, 0))
		# its eye and a seam of red bean peeking from the mouth
		_add(g, K.blob(0.0035, Vector3(1, 0.4, 1), 0.0, Color("6a3412"), 0, 10, 6), K.mat(Color.WHITE, {"gloss": 0.6}), Vector3(0.026, 0.0235, 0.008))
		_add(g, K.blob(0.005, Vector3(0.6, 0.5, 1.4), 0.3, Color("4a1a18"), i, 10, 6), K.mat(Color.WHITE, {"gloss": 0.8}), Vector3(0.044, 0.012, 0.0))
		d.part(g, (1 - i) * 0.5, (1 - i) * 0.5 + 0.5)
		if i == 1: first = g
	d.set_held(first, Transform3D(Basis(Vector3.RIGHT, -PI * 0.5), Vector3(0, -0.01, 0.04)))
	d.add_child(_steam_at(Vector3(0, 0.05, 0.0), 3, 0.1, 0.03))

# ======================================================================
# drinks
# ======================================================================
static func _glass_mat() -> Material:
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(0.85, 0.95, 1.0, 0.22)
	m.roughness = 0.05
	m.metallic_specular = 0.9
	m.rim_enabled = true
	m.rim = 0.6
	m.cull_mode = BaseMaterial3D.CULL_BACK
	return m

static func _lemonade(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "cup"
	d.morsel = Color("f8e66a")
	_add(d, K.lathe(K.puck(0.045, 0.004, 0.0015), Color("e9e2d2"), 32), K.mat(Color.WHITE, {"gloss": 0.2}))
	var gl := _group(d, Vector3(0, 0.004, 0), "glass")
	var juice := StandardMaterial3D.new()
	juice.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	juice.albedo_color = Color(1.0, 0.9, 0.35, 0.72)
	juice.roughness = 0.2
	juice.emission_enabled = true
	juice.emission = Color(0.45, 0.38, 0.08)
	var lv := _group(gl, Vector3(0, 0, 0), "juice")
	_add(lv, K.lathe([Vector2(0, 0.006), Vector2(0.026, 0.006), Vector2(0.03, 0.1), Vector2(0, 0.1)], Color.WHITE, 32), juice)
	for i in 4:
		_add(lv, K.rbox(Vector3(0.009, 0.009, 0.009), 0.25, Color.WHITE), _glass_mat(), Vector3(rng.randf_range(-0.012, 0.012), 0.08 + i * 0.004, rng.randf_range(-0.012, 0.012)), Vector3(rng.randf(), rng.randf() * 3, rng.randf()))
	d.level(lv, 0.0, -0.05, 0.0, 1.0, 1.0)
	_add(gl, K.lathe([Vector2(0, 0.0), Vector2(0.03, 0.0), Vector2(0.034, 0.11), Vector2(0.0315, 0.11), Vector2(0.028, 0.006), Vector2(0, 0.006)], Color.WHITE, 40), _glass_mat())
	# a slice of lemon on the rim and a striped straw
	var sl := _add(gl, K.lathe(K.puck(0.02, 0.004, 0.0015), func(u, _v, q): return Color("f2cf1f") if Vector2(q.x, q.z).length() > 0.017 else (Color("fffbe0") if Vector2(q.x, q.z).length() < 0.003 or absf(sin(u * TAU * 5.0)) < 0.08 else Color("fbe46a")), 40),
		K.mat(Color.WHITE, {"gloss": 0.8}), Vector3(0.03, 0.106, 0.0), Vector3(0, 0, PI * 0.5))
	sl.name = "lemon"
	_add(gl, K.tube([Vector3(-0.008, 0.02, 0.0), Vector3(-0.004, 0.13, 0.0), Vector3(0.012, 0.15, 0.0)], 0.0028, func(_u, v, _q): return Color("e8342e") if fmod(v * 12.0, 1.0) < 0.5 else Color("fdfdfd"), 10, 3), K.mat(Color.WHITE, {"gloss": 0.6}))
	_leaves(gl, Vector3(0.006, 0.104, 0.006), 2, 0.007, Color("4fb34a"), rng)
	d.set_held(gl, Transform3D(Basis.IDENTITY, Vector3(-0.03, -0.06, 0.0)))

static func _green_tea(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "cup"
	d.morsel = Color("b7cf5a")
	d.hot = true
	# a wooden saucer and a celadon yunomi
	_add(d, K.lathe(K.puck(0.04, 0.007, 0.003), func(_u, _v, q): return Color("9a6238").lerp(Color("7e4c2a"), 0.5 + 0.5 * sin(Vector2(q.x, q.z).length() * 600.0)), 32), K.mat(Color.WHITE, {"gloss": 0.5}))
	var cup := _group(d, Vector3(0, 0.007, 0), "yunomi")
	var cel := func(_u: float, v: float, q: Vector3) -> Color:
		if q.y < 0.008 and v < 0.4: return Color("c9a77a")
		return Color("a9c8b0").lerp(Color("cfe2cf"), clampf(q.y / 0.07, 0, 1)).lerp(Color("8fb59a"), 0.3 * (0.5 + 0.5 * K.noise(q * 90.0)))
	var prof := [Vector2(0, 0.003), Vector2(0.022, 0.003), Vector2(0.024, 0.0), Vector2(0.028, 0.005), Vector2(0.031, 0.04), Vector2(0.033, 0.07), Vector2(0.032, 0.074), Vector2(0.029, 0.072),
		Vector2(0.028, 0.04), Vector2(0.025, 0.012), Vector2(0, 0.01)]
	_add(cup, K.lathe(prof, cel, 40, func(u, v): return 1.0 + 0.012 * sin(u * TAU * 9.0) * v), K.mat(Color.WHITE, {"gloss": 0.7, "gloss_size": 0.96}))
	var tea := _group(cup, Vector3(0, 0.062, 0), "tea")
	_add(tea, K.disc(0.0283, func(_u, v, _q): return Color("c9d45a").lerp(Color("9fb83a"), v * 0.6), 40, 5, 0.0006), K.mat(Color.WHITE, {"gloss": 0.95, "gloss_size": 0.93, "glow": 0.18}))
	# a tea stalk standing up in the cup: good luck
	_add(tea, K.tube([Vector3(0.006, -0.004, 0.004), Vector3(0.006, 0.0015, 0.004)], 0.0009, Color("6f8f2a"), 6, 2), K.mat(Color.WHITE))
	d.level(tea, 0.062, 0.02, 0.0, 1.0, 0.9)
	d.add_child(_steam_at(Vector3(0, 0.075, 0), 5, 0.13, 0.015))
	d.set_held(cup, Transform3D(Basis.IDENTITY, Vector3(-0.02, -0.035, 0.02)))

static func _matcha(d: Dish, rng: RandomNumberGenerator) -> void:
	d.utensil = "cup"
	d.morsel = Color("7fbf3a")
	d.hot = true
	# a tray mat, the chawan, the bamboo whisk on its stand, a little sweet
	_add(d, K.rbox(Vector3(0.12, 0.003, 0.08), 0.15, func(_u, _v, q): return Color("d9c79a").lerp(Color("c4b07f"), 0.5 + 0.5 * sin(q.z * 500.0))), K.mat(Color.WHITE), Vector3(0, 0.003, 0))
	var bowl := _group(d, Vector3(-0.025, 0.006, 0.0), "chawan")
	var glaze := func(u: float, v: float, q: Vector3) -> Color:
		var drip := smoothstep(0.03, 0.045, q.y + 0.008 * sin(u * TAU * 7.0))
		var base := Color("3a2a24").lerp(Color("5a4034"), 0.5 + 0.5 * K.noise(q * 60.0))
		return base.lerp(Color("c7b89a").lerp(Color("9c8a70"), K.noise(q * 120.0) * 0.5 + 0.5), drip) if v < 0.55 else Color("e8dcc4")
	var bw := _bowl(bowl, 0.052, 0.05, glaze, Color("e6d8bf"), Vector3.ZERO, {"mat": {"gloss": 0.75, "gloss_size": 0.95}, "foot": 0.4})
	var top := _group(bowl, Vector3(0, 0.038, 0), "matcha")
	var foam := func(u: float, v: float, q: Vector3) -> Color:
		var sw := 0.5 + 0.5 * sin(atan2(q.z, q.x) * 1.0 + Vector2(q.x, q.z).length() * 420.0)
		return Color("7cbf2e").lerp(Color("b9e06a"), sw * 0.55 * (1.0 - v * 0.6)).lerp(Color("5f9f22"), v * v * 0.5)
	_add(top, K.disc(_r_at(bw.inner, 0.038) * 0.99, foam, 48, 8, 0.002), K.mat(Color.WHITE, {"gloss": 0.35, "gloss_size": 0.97, "glow": 0.06}))
	# fine bubbles in the foam
	var xf := []
	for i in 60:
		var a := rng.randf() * TAU
		var rr := sqrt(rng.randf()) * 0.035
		xf.append(Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * rng.randf_range(0.5, 1.2)), Vector3(cos(a) * rr, 0.0018, sin(a) * rr)))
	top.add_child(K.scatter(K.blob(0.0012, Vector3(1, 0.6, 1), 0.0, Color.WHITE, 0, 6, 4), K.mat(Color("d8efa0"), {"vc": false, "gloss": 0.8}), xf))
	d.level(top, 0.038, 0.012, 0.0, 1.0, 0.7)
	var wh := _group(d, Vector3(0.07, 0.006, -0.03), "chasen")
	_add(wh, K.lathe([Vector2(0, 0), Vector2(0.01, 0.0), Vector2(0.012, 0.012), Vector2(0.0085, 0.022), Vector2(0.005, 0.028), Vector2(0, 0.028)], Color("4a8fae"), 20), K.mat(Color.WHITE, CERAMIC))
	_add(wh, K.lathe([Vector2(0, 0.025), Vector2(0.008, 0.028), Vector2(0.016, 0.045), Vector2(0.011, 0.058), Vector2(0.006, 0.06), Vector2(0.005, 0.1), Vector2(0, 0.1)], func(_u, v, _q): return Color("e2cc8f").lerp(Color("cfb070"), v), 24, func(u, v): return 1.0 + (0.25 * absf(sin(u * TAU * 16.0)) if v < 0.5 else 0.0)), K.mat(Color.WHITE, {"gloss": 0.3}))
	# a sweet: a little pink nerikiri flower on a white dish
	var sw := _group(d, Vector3(0.065, 0.006, 0.04), "sweet")
	_add(sw, K.lathe(K.puck(0.022, 0.004, 0.0015), Color("faf7f0"), 24), K.mat(Color.WHITE, CERAMIC))
	_add(sw, K.puff(func(a): return 0.014 * (0.85 + 0.15 * absf(cos(a * 2.5))), 0.008, 0.4, K.vgrad(Color("f59ab8"), Color("ffd6e4"), 0.0, 0.016), 40, 10), K.mat(Color.WHITE, {"gloss": 0.2}), Vector3(0, 0.012, 0))
	_add(sw, K.blob(0.0025, Vector3.ONE, 0.0, Color("ffe36a"), 0, 8, 6), K.mat(Color.WHITE, {"gloss": 0.5}), Vector3(0, 0.02, 0))
	d.part(sw, 0.6, 1.0)
	d.add_child(_steam_at(Vector3(-0.025, 0.05, 0), 4, 0.11, 0.02))
	d.set_held(bowl, Transform3D(Basis.IDENTITY, Vector3(-0.05, -0.03, 0.02)))
