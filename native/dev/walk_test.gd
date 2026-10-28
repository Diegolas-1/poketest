extends SceneTree
# Dev only: walking test on the baked walk grid (world_data.gd step), no render.
#   godot --headless --path native --script res://dev/walk_test.gd
# - Route 1's ledges: at points along every ledge (found by its flag, 32), a
#   walker coming from the south is stopped at the ledge (never climbs it), one
#   from the north walks off it and lands a drop lower; the drop is a clear one
#   (0.6 m or more) and the flagged band is narrow (the face's own width);
# - the town: walks along a few lines (the square, the lanes, the lab's foot,
#   Route 1's road) are never stopped where nothing stands.
# Prints PASS / FAIL and exits 1 on a failure.

var fails := 0

func check(ok: bool, what: String) -> void:
	print(("PASS " if ok else "FAIL ") + what)
	if not ok: fails += 1

func _init() -> void:
	var W = load("res://world_data.gd").new()
	W.load_all()
	# the ledges, by their flag: scan Route 1 for the flagged bands
	var bands := {}   # x (whole metres) -> [z of the band's middle ...]
	for xi in range(-60, 52, 3):
		var x := float(xi) + 0.37
		var z := -95.0
		var in_band := false
		var z0 := 0.0
		while z > -380.0:
			var f: int = W.flag(x, z)
			var on: bool = f != 255 and (f & 32) != 0
			if on and not in_band: in_band = true; z0 = z
			if not on and in_band:
				in_band = false
				if not bands.has(x): bands[x] = []
				bands[x].append([z0, z])
			z -= 0.05
	var n := 0; var climbed := 0; var stuck := 0; var low := 0; var wide := 0
	for x in bands:
		for b in bands[x]:
			var zs: float = b[0]; var zn: float = b[1]   # south and north edges of the band
			if zs - zn > 1.3: wide += 1
			n += 1
			# from the south, walking north
			var p := Vector3(x, W.height_at(x, zs + 1.5), zs + 1.5)
			for i in 60: p = W.step(p, 0.0, -0.1, true)
			if p.z < zn - 0.05: climbed += 1
			# from the north, walking south
			var q := Vector3(x, W.height_at(x, zn - 1.5), zn - 1.5)
			var hi: float = W.height_at(x, zn - 1.0)
			for i in 60: q = W.step(q, 0.0, 0.1, true)
			if q.z < zs + 0.5: stuck += 1
			var lo: float = W.height_at(x, zs + 1.0)
			if hi - lo < 0.6: low += 1
	check(n > 80, "found %d ledge crossings" % n)
	check(climbed == 0, "no ledge climbed from the south (%d of %d)" % [climbed, n])
	check(stuck == 0, "every ledge walked off going south (%d stuck of %d)" % [stuck, n])
	check(low <= n / 10, "a clear drop at the ledges (%d of %d under 0.6 m)" % [low, n])
	check(wide == 0, "the flagged bands are the face's width (%d over 1.3 m)" % wide)
	# the town and the road: straight walks that nothing should stop
	var walks := [[Vector2(-6, -3), Vector2(6, -3)], [Vector2(0, -8), Vector2(0, 8)], [Vector2(-20, -42), Vector2(-4, -47)],
		[Vector2(4, -60), Vector2(4, -88)], [Vector2(18, 0), Vector2(18, 12)]]
	for w in walks:
		var a: Vector2 = w[0]; var bb: Vector2 = w[1]
		var p := Vector3(a.x, W.height_at(a.x, a.y), a.y)
		var d := (bb - a).normalized() * 0.1
		var steps := int(a.distance_to(bb) / 0.1)
		var got := 0
		for i in steps:
			var p2: Vector3 = W.step(p, d.x, d.y, true)
			if p2.distance_to(p) > 0.05: got += 1
			p = p2
		check(got > steps * 0.9, "walk %s -> %s (%d of %d steps)" % [a, bb, got, steps])
	print("walk test: %d failure(s)" % fails)
	quit(1 if fails > 0 else 0)
