extends Node
# Dev only: the town life's logic test, headless. Simulates whole game days of
# life.gd (everyone in full steering, as if the camera saw them all) on the
# real walk grid and checks that
#   - nobody stays stuck (re-plans and hops counted; no walker without progress for long),
#   - everyone is at home (Gus at the lighthouse) in the small hours,
#   - the schedule blocks reach their places (hit rate per person),
# and prints the sim's cost. Run:
#   godot --headless --path native res://dev/life_test.tscn -- --days=3 [--dt=0.1] [--verbose]

class FakeGame extends Node3D:
	var world: WorldData
	var cam = null
	var pos := Vector3(9999, 0, 9999)

var days := 3
var dt := 0.1
var verbose := false

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--days="): days = int(a.substr(7))
		elif a.begins_with("--dt="): dt = float(a.substr(5))
		elif a == "--verbose": verbose = true
	var g := FakeGame.new()
	g.world = WorldData.new()
	g.world.load_all()
	add_child(g)
	var clock := GameClock.new()
	add_child(clock)
	clock.set_process(false)
	var life := TownLife.new()
	life.headless = true
	add_child(life)
	life.setup(g, null, clock)
	if OS.get_cmdline_user_args().has("--conn"): connectivity(life)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--probe="):
			var v := Array(a.substr(8).split(",")).map(func(x): return float(x))
			probe(g.world, Vector2(v[0], v[1]), Vector2(v[2], v[3]))
			print('  path ', life.find_path(Vector2(v[0], v[1]), Vector2(v[2], v[3])))
			var c0 := life.cell(Vector2(v[0], v[1]))
			print('  cell ', c0, ' solid ', life.solid[c0.y * life.nx + c0.x], ' below ', life.solid[(c0.y + 1) * life.nx + c0.x])
	var fails: Array = []
	var hits := {}
	var seen_blk := {}
	var hit_now := {}
	var max_noprog := {}
	var walk_t := {}
	var night_ok := 0
	var night_checks := 0
	var t_us := 0
	var steps := 0
	var end_min := clock.minutes + days * 1440.0
	var last_check_day := -1
	var noprog := {}
	for p in life.people:
		hits[p.id] = [0, 0]; seen_blk[p.id] = -1; hit_now[p.id] = false; max_noprog[p.id] = 0.0; walk_t[p.id] = 0.0; noprog[p.id] = 0.0
	var t_start := Time.get_ticks_msec()
	while clock.minutes < end_min:
		clock.advance(dt)
		var t0 := Time.get_ticks_usec()
		life.update(dt)
		t_us += Time.get_ticks_usec() - t0
		steps += 1
		for p in life.people:
			var id: String = p.id
			# block bookkeeping
			var key: int = p.blk + p.plan_day * 100
			if key != seen_blk[id]:
				if seen_blk[id] >= 0:
					hits[id][1] += 1
					if hit_now[id]: hits[id][0] += 1
					elif verbose: print("  miss %s day %d block '%s' %s at %s (%s)" % [id, p.plan_day, p.get("last_act", "?"), p.get("last_place", "?"), clock.time_text(), life.describe(p)])
				seen_blk[id] = key
				hit_now[id] = false
				p.last_act = p.act; p.last_place = p.place
			var g2: Dictionary = p.goal
			if g2.is_empty(): continue
			if g2.kind == "inside":
				if p.state == "inside" and p.inside == g2.house: hit_now[id] = true
			elif p.state in ["act", "knock", "chat", "chase"]: hit_now[id] = true
			if g2.kind == "route" and p.state == "knock": hit_now[id] = true
			# progress while walking
			if p.state == "walk":
				walk_t[id] += dt
				noprog[id] = p.prog_t + 0.0
				max_noprog[id] = maxf(max_noprog[id], p.stuck_total)
		# the small hours: everyone home
		var h := clock.hour()
		if h > 3.0 and h < 3.2 and clock.day() != last_check_day:
			last_check_day = clock.day()
			for p in life.people:
				night_checks += 1
				var want: String = p.home
				if p.state == "inside" and p.inside == want: night_ok += 1
				else: fails.append("day %d 03:00: %s not home (%s)" % [clock.day(), p.id, life.describe(p)])
	var wall := Time.get_ticks_msec() - t_start
	print("\n==== town life: %d game days, %d steps of %.2f s, %.1f s wall ====" % [days, steps, dt, wall / 1000.0])
	print("sim cost per update (12 people, all in full steering): %.3f ms avg" % (t_us / 1000.0 / steps))
	print("paths %d, avg %.2f ms, max %.2f ms; re-plans %d; hops (teleports) %d; chats %d; greets %d" % [life.stats.paths,
		life.stats.path_us / 1000.0 / maxf(1, life.stats.paths), life.stats.path_max_us / 1000.0, life.stats.repath, life.stats.teleport, life.stats.chats, life.stats.greets])
	print("home at 03:00: %d / %d" % [night_ok, night_checks])
	var total_hit := 0
	var total := 0
	for p in life.people:
		var hh: Array = hits[p.id]
		total_hit += hh[0]; total += hh[1]
		print("  %-6s blocks reached %3d / %3d   walking %5.0f s   stuck time (re-plan windows) %4.0f s" % [p.id, hh[0], hh[1], walk_t[p.id], max_noprog[p.id]])
	print("blocks reached overall: %d / %d (%.0f%%)" % [total_hit, total, 100.0 * total_hit / maxf(1, total)])
	for f in fails: print("FAIL ", f)
	if verbose:
		var dumped := {}
		for s in life.stuck_log:
			print("  stuck %s at (%.1f, %.1f) waypoint (%.1f, %.1f) to %s try %d" % [s[0], s[1].x, s[1].y, s[2].x, s[2].y, s[3], s[4]])
			var k := "%d,%d" % [int(s[1].x / 4), int(s[1].y / 4)]
			if not dumped.has(k) and dumped.size() < 6:
				dumped[k] = true
				_dump(life, s[1], s[2])
	var ok: bool = fails.is_empty() and life.stats.teleport <= days * 3 and total_hit >= total * 0.9
	print("RESULT ", "PASS" if ok else "FAIL")
	get_tree().quit(0 if ok else 1)

# the walk grid round a spot: # blocked, . grass, - lane/yard, P the walker, W its waypoint
func _dump(life: TownLife, at: Vector2, wp: Vector2) -> void:
	var c := life.cell(at)
	var w := life.cell(wp)
	for j in range(c.y - 10, c.y + 11):
		var row := ""
		for i in range(c.x - 16, c.x + 17):
			var q := Vector2i(i, j)
			if q == c: row += "P"
			elif q == w: row += "W"
			elif not life.is_free(q): row += "#"
			elif life.wgt[j * life.nx + i] < 2.0: row += "-"
			else: row += "."
		print("    ", row)

# which spots are cut off from the square (prints them; --conn)
static func connectivity(life: TownLife) -> void:
	var comp := PackedInt32Array(); comp.resize(life.nx * life.nz); comp.fill(-1)
	var start := life.nearest_free(life.cell(Vector2(-3, -2)))
	var q: Array[Vector2i] = [start]
	comp[start.y * life.nx + start.x] = 0
	var n := 0
	while not q.is_empty():
		var c: Vector2i = q.pop_back(); n += 1
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var e: Vector2i = c + d
			if life.is_free(e) and comp[e.y * life.nx + e.x] < 0:
				comp[e.y * life.nx + e.x] = 0; q.append(e)
	print("main area: %d cells" % n)
	var chk := func(label: String, v: Vector3):
		var c := life.cell(Vector2(v.x, v.y))
		if comp[c.y * life.nx + c.x] != 0: print("  CUT OFF: %s (%.1f, %.1f)" % [label, v.x, v.y])
	for h in life.houses:
		var hs: Dictionary = life.houses[h]
		for k in ["door", "porch", "gate", "lane", "mailbox"]: chk.call(h + "." + k, hs[k])
		for i in hs.yard.size(): chk.call(h + ".yard%d" % i, hs.yard[i])
	for k in life.places:
		var pl: Dictionary = life.places[k]
		for key in pl:
			if pl[key] is Array:
				for i in pl[key].size():
					if pl[key][i] is Vector3: chk.call("%s.%s%d" % [k, key, i], pl[key][i])
			elif pl[key] is Vector3: chk.call("%s.%s" % [k, key], pl[key])

static func probe(w: WorldData, a: Vector2, b: Vector2) -> void:
	var p := Vector3(a.x, 0, a.y)
	for k in 12:
		var d := (b - Vector2(p.x, p.z)).normalized() * 0.15
		var np := w.step(p, d.x, d.y)
		print("  probe (%.2f, %.2f) flag %d -> (%.2f, %.2f) flag-at-target %d collide %s" % [p.x, p.z, w.flag(p.x, p.z), np.x, np.z, w.flag(p.x + d.x, p.z + d.y), w.collide(Vector3(p.x + d.x, 0, p.z + d.y))])
		p = np
