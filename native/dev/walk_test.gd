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
	# Viridian City (web/world/viridian.js): from Route 1 through the open gate,
	# over the cutting to the plaza, and along every street; then walls that must
	# stop you (a tower's front, the lake from the promenade, the shut gates)
	var routes := [
		[Vector2(-2.3, -425), Vector2(-2.3, -436), Vector2(-1.5, -452), Vector2(-0.6, -470), Vector2(1.6, -497), Vector2(5, -530), Vector2(6, -562), Vector2(6, -588), Vector2(8, -606), Vector2(10, -640), Vector2(10, -650)],
		[Vector2(24, -624), Vector2(60, -624), Vector2(110, -625), Vector2(150, -624), Vector2(176, -624)],
		[Vector2(-6, -627), Vector2(-30, -629), Vector2(-60, -632), Vector2(-95, -638), Vector2(-128, -646), Vector2(-150, -654)],
		[Vector2(-150, -654), Vector2(-141, -670), Vector2(-132, -690), Vector2(-127, -712), Vector2(-126, -735), Vector2(-128, -758), Vector2(-135, -780), Vector2(-146, -800), Vector2(-158, -813)],
		[Vector2(-126, -735), Vector2(-162, -735)],
		[Vector2(48, -626), Vector2(48, -700), Vector2(48, -740), Vector2(50, -764), Vector2(62, -769), Vector2(75, -775)],
		[Vector2(-22, -632), Vector2(-22, -730), Vector2(-22, -790), Vector2(-22, -878)],
		[Vector2(-22, -727), Vector2(26, -728), Vector2(46, -729)],
	]
	for r in routes:
		var p := Vector3(r[0].x, W.height_at(r[0].x, r[0].y), r[0].y)
		var total := 0; var got := 0
		for k in range(1, r.size()):
			var t: Vector2 = r[k]
			var ns := int(Vector2(p.x, p.z).distance_to(t) / 0.1)
			for i in ns:
				var d := (t - Vector2(p.x, p.z)).normalized() * 0.1
				var p2: Vector3 = W.step(p, d.x, d.y, true)
				total += 1
				if p2.distance_to(p) > 0.05: got += 1
				p = p2
		var end_d := Vector2(p.x, p.z).distance_to(r[r.size() - 1])
		check(got > total * 0.93 and end_d < 2.0, "Viridian walk %s .. %s (%d of %d steps, ends %.1f m off)" % [r[0], r[r.size() - 1], got, total, end_d])
	var stops := [[Vector2(80, -624), Vector2(80, -650), "a tower's front on Evergreen Avenue"], [Vector2(-126, -720), Vector2(-160, -720), "the railing over the lake"],
		[Vector2(-22, -870), Vector2(-22, -900), "Route 2's gate"], [Vector2(-150, -805), Vector2(-185, -830), "Route 22's gate"], [Vector2(10, -646), Vector2(10, -672), "the Center's doors"],
		[Vector2(0, -485), Vector2(-25, -485), "the cutting's side"]]
	for st in stops:
		var a2: Vector2 = st[0]; var b2: Vector2 = st[1]
		var p := Vector3(a2.x, W.height_at(a2.x, a2.y), a2.y)
		var d := (b2 - a2).normalized() * 0.1
		for i in int(a2.distance_to(b2) / 0.1): p = W.step(p, d.x, d.y, true)
		check(Vector2(p.x, p.z).distance_to(b2) > 2.0, "stopped by %s (got to %.1f, %.1f)" % [st[2], p.x, p.z])
	print("walk test: %d failure(s)" % fails)
	quit(1 if fails > 0 else 0)
