class_name TownLife
extends Node3D
# Pallet Town's townspeople living their days (the "society sim"): the twelve
# people in life/people.json keep their schedules on the GameClock (clock.gd),
# walk the town's lanes between the places baked into life/places.json, go in
# and out of their front doors, stop and chat when they meet, greet each other,
# call out to Ash, play tag, and stop to talk when the player presses A.
#
# Owner: cast.gd. setup(game, cast, clock) then update(dt) once a frame.
#
# ---- schedules ----
# Each person has a day plan rebuilt every game day from people.json (the
# day type: 'sat', 'sun' or 'default'), with every block's start shifted by a
# few random minutes, chance blocks rolled and 'a|b' places picked, so no two
# days look the same. The current block gives a goal:
#   inside  a house (their own: sleep, breakfast, supper...; another: a visit)
#   spot    stand at one spot of a place (fishing at the pier, a market stall)
#   roam    potter between the spots of a place (yard work, the fields, play)
#   route   Ada's bread round: door to door, a knock at each, then home
# The goal of the moment is in person.goal; person.state is what they are doing
# about it: inside, door_out, walk, door_in, act, knock, chat, chase, talk.
#
# ---- navigation ----
# A walk grid of 0.5 m cells over the town (AStarGrid2D, octile, built at load
# from the baked walk flags: water, the no-walk hillsides, and every collider
# grown by a person's radius). Lanes, the square, the yards and the pier cost
# 1, open grass 2.4, so people keep to the paths. A path is simplified
# (straight runs merged, short corners cut where the grid sees through) and
# followed with a look-ahead; nearby people steer round each other and the
# player (separation + keep-right). A walker that makes no progress for 3 s
# re-plans from where it stands; after three tries it hops to its next
# waypoint (counted in stats.teleport; the logic test asserts it stays rare).
#
# ---- doors ----
# Every house has a door anchor (places.json houses.<id>.door: where you stand
# facing the door) and a doorway (the door itself). Going in: walk to the
# anchor, turn to the door, it opens (a dark doorway panel, the "open door"),
# step in, gone; coming out is the reverse. Inside, a person costs nothing: no
# actor, no animation; only the schedule runs. Gus's "door" is the boat steps
# on the pier: he rows out to the lighthouse (offmap).
# Interiors hook: `interiors` (cast.gd) has
#   has_room(house_id) -> bool, enter(person: Dictionary, house_id), exit(person, house_id)
# and life calls enter/exit as a person goes in and comes out (they are hidden
# outside either way); signals person_entered(id, house) and
# person_exited(id, house) fire either way. cast.gd shows the ones inside the
# interior the player is in (its blueprint's residents spots).
#
# ---- LOD / cost ----
# inside: nothing.  Outside, out of view or over 45 m from the camera: the walk
# runs at 4 Hz along the path without collision or steering, no animation, the
# actor hidden when out of view.  Near and in view: full steering, animation
# (every other frame beyond 25 m), cloth by distance. Path searches are queued,
# at most two a frame. stats.us_avg is the sim's own frame cost (debug overlay).
#
# Debug: F3 or O (or Settings > Time > Town debug overlay) lists everyone's
# activity, place and target; T / Shift+T skip an hour / six (clock.gd); F4
# fast-forwards x30. dev/life_test.tscn runs the headless day test.
#
# ---- a squad (people.json "follow") ----
# Gary's cheerleaders don't keep a day of their own: each copies the leader's plan a
# minute or so behind him (people.json "rank" orders them), so they go where he goes and
# in where he goes in. Wherever he stops they take a place in an arc behind him (their
# rank's), facing him, and move on when he does. They cheer (idles.gd "cheer": hops and
# pom-poms) whenever he gets anywhere, when Ash talks to him and when he says goodbye,
# and now and then just because; one of them chants (dialogue.json "cheer").
#
# Words: quests.gd (Quests) answers talk / chatter / overheard / wants / relation.
# Pokémon: companions.gd (Companions, life/companions.json) keeps Lily's Nibbles
# and Ben's Doduo with their owners; an owner a slow pet keeps to (pace_cap)
# walks no faster than it and doesn't break into a jog.

signal person_entered(id: String, house: String)
signal person_exited(id: String, house: String)

const X0 := -112.0
const Z0 := -110.0   # (Route 1's fields reach z -105)
const X1 := 166.0   # (PALLET HOUSE on its hill reaches x ~160)
const Z1 := 152.0   # (the harbour piers reach z 149)
const CS := 0.5
const R_PERSON := 0.5
const W_ROAD := 1.0
const W_YARD := 1.15
const W_GRASS := 2.4
const FAR := 45.0
const ROAM := ["yardwork", "garden", "play", "work:farm", "feed", "walk", "shop", "serve"]
const SOCIAL := ["chat", "walk", "shop", "yarn", "porch", "tea", "serve", "work:market", "work:sell", "work:stall", "play", "visit", "mend"]
const DOOR_ACTS := ["sleep", "home", "breakfast", "supper", "bake", "lighthouse", "visit", "inside", "cook"]

var game: Node3D
var cast: Node
var world: WorldData
var clock: GameClock
var quests: Node
var companions: Companions
var cyclists: Cyclists           # the townspeople's bicycles (bike/cyclists.gd)
var interiors = null
var headless := false            # logic test: no actors, everyone simulated in full
var nav := AStarGrid2D.new()
var nx := 0
var nz := 0
var solid := PackedByteArray()
var wgt := PackedFloat32Array()
var places := {}
var houses := {}
var people: Array = []
var by_id := {}
var claims := {}                 # "place:index" -> person id
var pair_cd := {}                # "a|b" -> game minute when they may chat again
var doors := {}                  # house id -> {mesh, t}
var stuck_log: Array = []      # [id, where, waypoint, place, try] (tests)
var stats := {"paths": 0, "path_us": 0, "path_max_us": 0, "repath": 0, "teleport": 0, "chats": 0, "greets": 0, "us_avg": 0.0, "us_max": 0.0, "anim_avg": 0.0}
var debug := false
var bubbles: Control
var debug_label: Label
var _queue: Array = []
var _rng := RandomNumberGenerator.new()
var _frame := 0
var _social_acc := 0.0
var _us_acc := 0.0
var _us_n := 0
var _anim_us := 0.0             # this frame's actor animation (cloth included), kept apart from the sim
var _anim_acc := 0.0
var _jumped := false
var _chase := {}                 # the kids' game of tag (see _chase_tick)
var _tag_cd := 30.0              # game seconds until they may start another
var _delia_cd := 30.0
var _talking = null
var squads := {}                 # leader id -> the people who follow them (people.json "follow")

# ======================================================================
# setup
# ======================================================================
func setup(g: Node3D, c: Node, clk: GameClock) -> void:
	game = g
	cast = c
	world = g.world
	clock = clk
	_rng.randomize()
	var t0 := Time.get_ticks_msec()
	var pd: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://life/places.json"))
	houses = pd.houses
	places = pd.places
	_build_nav(pd.roads)
	_snap_places()
	var t1 := Time.get_ticks_msec()
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://life/people.json"))
	var looks: Dictionary = CastActor.data().looks
	for e in data.people:
		var look: String = e.look if looks.has(e.look) else e.stand_in
		var p := {"id": e.id, "name": e.name, "home": e.home, "age": e.age, "data": e, "look": look,
			"walk_v": float(e.speed) * _rng.randf_range(0.96, 1.04), "jitter": float(e.get("jitter", 15)),
			"friends": e.get("friends", []), "pos": Vector3.ZERO, "yaw": 0.0, "v": 0.0, "state": "inside",
			"inside": e.home, "plan": [], "plan_day": -1, "blk": -1, "goal": {}, "path": PackedVector2Array(), "pi": 0,
			"after": "", "best_d": INF, "prog_t": 0.0, "repaths": 0, "beat_t": 0.0, "hop_t": 0.0, "claim": "",
			"route": [], "bubble": {}, "chat": {}, "face": NAN, "acc": 0.0, "lod_acc": 0.0, "wants": "", "seen": false,
			"bark_cd": _rng.randf_range(5, 30), "seek_t": _rng.randf_range(3, 8), "jog": false, "idx": people.size(),
			"actor": null, "req": 0, "last_place": "", "act": "", "place": "", "target_text": "", "stuck_total": 0.0}
		if not headless:
			var a := CastActor.make(look)
			# townspeople's gait: walks of 1-2 m/s at a natural step rate, a run from ~2 m/s
			# (tag, a kid's jog) rather than Ash's 4.5 m/s walk
			a.walk_v = 2.0; a.run_v = 3.6
			a.cad_walk = 0.8 if e.age == "elder" else (1.0 if e.age == "kid" else 0.9)
			a.cad_run = 1.45
			# how they stand and what they do idle (idles.gd): a stance held, only some of the actions
			a.idles.stance = String(e.get("stance", ""))
			if e.has("idles"): a.idles.limit(e.idles)
			a.visible = false
			add_child(a)
			p.actor = a
		people.append(p)
		by_id[p.id] = p
	for p in people:
		if p.data.has("follow"):
			if not squads.has(String(p.data.follow)): squads[String(p.data.follow)] = []
			squads[String(p.data.follow)].append(p)
	_make_doors()
	_quests()
	companions = Companions.new()
	companions.name = "Companions"
	add_child(companions)
	companions.setup(self)
	if not headless:
		cyclists = Cyclists.new()
		add_child(cyclists)
		cyclists.setup(self)
	if not headless:
		var layer := CanvasLayer.new()
		layer.layer = 1
		add_child(layer)
		bubbles = _Bubbles.new()
		bubbles.life = self
		layer.add_child(bubbles)
		debug_label = Label.new()
		debug_label.position = Vector2(16, 120)
		debug_label.add_theme_font_size_override("font_size", 13)
		debug_label.add_theme_color_override("font_color", Color.WHITE)
		debug_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
		debug_label.add_theme_constant_override("outline_size", 4)
		debug_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		debug_label.visible = false
		layer.add_child(debug_label)
		Settings.changed.connect(_on_setting)
		_set_debug(int(Settings.get_value("town_debug")) == 1 or OS.get_cmdline_user_args().has("--life-debug"))
	clock.jumped.connect(func(_m): _jumped = true)
	resync()
	print("life: nav %dx%d built in %d ms, setup %d ms" % [nx, nz, t1 - t0, Time.get_ticks_msec() - t0])

func _quests() -> void:
	quests = Quests.new()
	quests.name = "Quests"
	if headless: quests.make_ui = false; quests.autosave = false
	add_child(quests)
	quests.setup(game, clock)
	for p in people: _names(p)

# every way a chatter line may name someone ("Old Tom:", "Tom:", "OLD TOM:")
func _names(p: Dictionary) -> void:
	p.names = [String(p.id), String(p.name).to_lower(), String(p.data.full).to_lower(),
		quests.display_name(p.id).to_lower(), quests.short_name(p.id).to_lower(), quests.tag(p.id).to_lower()]

func _on_setting(k: String, v) -> void:
	if k == "town_debug": _set_debug(int(v) == 1 or OS.get_cmdline_user_args().has("--life-debug"))

func _set_debug(on: bool) -> void:
	debug = on
	if debug_label: debug_label.visible = on

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and (e.physical_keycode == KEY_F3 or e.physical_keycode == KEY_O):
		_set_debug(not debug)
		get_viewport().set_input_as_handled()

# ======================================================================
# the walk grid
# ======================================================================
func _build_nav(roads: Array) -> void:
	nx = int((X1 - X0) / CS)
	nz = int((Z1 - Z0) / CS)
	solid.resize(nx * nz)
	wgt.resize(nx * nz)
	wgt.fill(W_GRASS)
	# walk flags: a cell is blocked when any of its four 0.25 m cells is
	var fl := world.flags
	var gnx := world.gnx
	var sub := int(round(CS / world.gres))
	var oi := int(round((X0 - world.gx0) / world.gres))
	var oj := int(round((Z0 - world.gz0) / world.gres))
	for j in nz:
		for i in nx:
			var bad := false
			var deck := false
			for b in sub:
				var gj := oj + j * sub + b
				if gj < 0 or gj >= world.gnz: bad = true; break
				var row := gj * gnx
				for a in sub:
					var gi := oi + i * sub + a
					if gi < 0 or gi >= gnx: bad = true; break
					var f: int = fl[row + gi]
					if f == 255 or (f & 2) or ((f & 1) and not (f & 4)): bad = true; break
					if f & 4: deck = true
				if bad: break
			if bad: solid[j * nx + i] = 1
			elif deck: wgt[j * nx + i] = W_ROAD
	# colliders, grown by a person's radius
	for c in world.colliders:
		var cx: float = c[1]
		var cz: float = c[2]
		var box: bool = c[0] == 1
		var rr: float = (sqrt(c[3] * c[3] + c[4] * c[4]) if box else float(c[3])) + R_PERSON
		var i0 := maxi(0, int((cx - rr - X0) / CS)); var i1 := mini(nx - 1, int((cx + rr - X0) / CS))
		var j0 := maxi(0, int((cz - rr - Z0) / CS)); var j1 := mini(nz - 1, int((cz + rr - Z0) / CS))
		var cs := cos(float(c[5])) if box else 1.0
		var sn := sin(float(c[5])) if box else 0.0
		for j in range(j0, j1 + 1):
			var z := Z0 + (j + 0.5) * CS - cz
			for i in range(i0, i1 + 1):
				var x := X0 + (i + 0.5) * CS - cx
				var hit := false
				if box:
					var lx := x * cs - z * sn
					var lz := x * sn + z * cs
					hit = absf(lx) < float(c[3]) + R_PERSON and absf(lz) < float(c[4]) + R_PERSON
				else:
					hit = x * x + z * z < rr * rr
				if hit: solid[j * nx + i] = 1
	# cheap ground: the lanes, the square, the plaza, the yards
	for r in roads:
		for k in r.size() - 1:
			_paint_seg(Vector2(r[k][0], r[k][1]), Vector2(r[k + 1][0], r[k + 1][1]), 1.5, W_ROAD)
	var sq: Dictionary = places.plaza
	_paint_disc(Vector2(sq.center[0], sq.center[1]), float(sq.r) + 0.5, W_ROAD)
	_paint_rect(Rect2(11.6, 7.0, 7.9, 18.0), W_ROAD)
	for h in houses:
		var hs: Dictionary = houses[h]
		var cx: float = hs.center[0]; var cz: float = hs.center[1]
		var rot: float = hs.rot
		var cs2 := cos(rot); var sn2 := sin(rot)
		for j in range(maxi(0, int((cz - 13 - Z0) / CS)), mini(nz, int((cz + 13 - Z0) / CS))):
			for i in range(maxi(0, int((cx - 13 - X0) / CS)), mini(nx, int((cx + 13 - X0) / CS))):
				var dx := X0 + (i + 0.5) * CS - cx
				var dz := Z0 + (j + 0.5) * CS - cz
				var lx := dx * cs2 - dz * sn2
				var lz := dx * sn2 + dz * cs2
				if lx > -8.4 and lx < 8.4 and lz > -5.2 and lz < 8.8:
					var k2 := j * nx + i
					wgt[k2] = minf(wgt[k2], W_YARD)
	# only the town's one connected walk area counts: pockets (behind a wing, in
	# a fenced corner) would strand anyone snapped into them
	var reach := PackedByteArray()
	reach.resize(nx * nz)
	var c0 := Vector2i(int((-3.0 - X0) / CS), int((-2.0 - Z0) / CS))
	var stack: Array[Vector2i] = [c0]
	reach[c0.y * nx + c0.x] = 1
	while not stack.is_empty():
		var c: Vector2i = stack.pop_back()
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var e: Vector2i = c + d
			if e.x < 0 or e.y < 0 or e.x >= nx or e.y >= nz: continue
			var k := e.y * nx + e.x
			if solid[k] == 0 and reach[k] == 0:
				reach[k] = 1; stack.append(e)
	for k in nx * nz:
		if solid[k] == 0 and reach[k] == 0: solid[k] = 2
	nav.region = Rect2i(0, 0, nx, nz)
	nav.cell_size = Vector2.ONE
	nav.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	nav.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	nav.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	nav.update()
	for j in nz:
		for i in nx:
			var k := j * nx + i
			if solid[k]: nav.set_point_solid(Vector2i(i, j), true)
			elif wgt[k] != 1.0: nav.set_point_weight_scale(Vector2i(i, j), wgt[k])

func _paint_seg(a: Vector2, b: Vector2, r: float, w: float) -> void:
	var n := maxi(1, int(a.distance_to(b) / (CS * 0.7)))
	for s in n + 1:
		_paint_disc(a.lerp(b, float(s) / n), r, w)

func _paint_disc(c: Vector2, r: float, w: float) -> void:
	for j in range(maxi(0, int((c.y - r - Z0) / CS)), mini(nz, int((c.y + r - Z0) / CS) + 1)):
		for i in range(maxi(0, int((c.x - r - X0) / CS)), mini(nx, int((c.x + r - X0) / CS) + 1)):
			if Vector2(X0 + (i + 0.5) * CS, Z0 + (j + 0.5) * CS).distance_squared_to(c) < r * r:
				wgt[j * nx + i] = minf(wgt[j * nx + i], w)

func _paint_rect(r: Rect2, w: float) -> void:
	for j in range(maxi(0, int((r.position.y - Z0) / CS)), mini(nz, int((r.end.y - Z0) / CS))):
		for i in range(maxi(0, int((r.position.x - X0) / CS)), mini(nx, int((r.end.x - X0) / CS))):
			wgt[j * nx + i] = minf(wgt[j * nx + i], w)

func cell(p: Vector2) -> Vector2i:
	return Vector2i(clampi(int((p.x - X0) / CS), 0, nx - 1), clampi(int((p.y - Z0) / CS), 0, nz - 1))

func centre(c: Vector2i) -> Vector2:
	return Vector2(X0 + (c.x + 0.5) * CS, Z0 + (c.y + 0.5) * CS)

func is_free(c: Vector2i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < nx and c.y < nz and solid[c.y * nx + c.x] == 0

func walkable(p: Vector2) -> bool:
	return is_free(Vector2i(int(floor((p.x - X0) / CS)), int(floor((p.y - Z0) / CS))))

# the nearest free cell (rings outward), or the cell itself when none is near
func nearest_free(c: Vector2i, maxr := 12) -> Vector2i:
	if is_free(c): return c
	for r in range(1, maxr + 1):
		var best := Vector2i(-1, -1)
		var bd := 1e9
		for dj in range(-r, r + 1):
			for di in range(-r, r + 1):
				if absi(di) != r and absi(dj) != r: continue
				var q := c + Vector2i(di, dj)
				if is_free(q):
					var d := di * di + dj * dj
					if d < bd: bd = d; best = q
		if best.x >= 0: return best
	return c

func snap(p: Vector2) -> Vector2:
	var c := cell(p)
	if is_free(c): return p
	return centre(nearest_free(c, 40))

# straight line clear of blocked cells and of dearer ground than wmax
func _clear(a: Vector2, b: Vector2, wmax: float) -> bool:
	var n := int(a.distance_to(b) / 0.3) + 1
	for s in range(1, n):
		var q := a.lerp(b, float(s) / n)
		var i := int(floor((q.x - X0) / CS)); var j := int(floor((q.y - Z0) / CS))
		if i < 0 or j < 0 or i >= nx or j >= nz: return false
		var k := j * nx + i
		if solid[k] or wgt[k] > wmax + 0.01: return false
	return true

func _wat(p: Vector2) -> float:
	var c := cell(p)
	return wgt[c.y * nx + c.x]

func find_path(from: Vector2, to: Vector2) -> PackedVector2Array:
	var t0 := Time.get_ticks_usec()
	var a := nearest_free(cell(from))
	var b := nearest_free(cell(to))
	var ids: Array[Vector2i] = nav.get_id_path(a, b, true)
	var out := PackedVector2Array()
	if ids.is_empty():
		out.append(to)
	else:
		# keep the corners only
		var pts: Array[Vector2] = []
		for k in ids.size():
			if k == 0 or k == ids.size() - 1 or (ids[k] - ids[k - 1]) != (ids[k + 1] - ids[k]):
				pts.append(centre(ids[k]))
		pts[pts.size() - 1] = to if walkable(to) else pts[pts.size() - 1]
		# cut short corners where the grid sees through (on ground no dearer than the ends)
		var k2 := 0
		out.append(pts[0])
		while k2 < pts.size() - 1:
			var nxt := k2 + 1
			for jump in [4, 3, 2]:
				var m: int = k2 + jump
				if m < pts.size():
					var wm := maxf(_wat(pts[k2]), _wat(pts[m]))
					if pts[k2].distance_to(pts[m]) < 14.0 and _clear(pts[k2], pts[m], wm): nxt = m; break
			out.append(pts[nxt])
			k2 = nxt
		if out.size() > 1 and out[0].distance_to(from) < 0.8: out[0] = from
	var us := Time.get_ticks_usec() - t0
	stats.paths += 1
	stats.path_us += us
	stats.path_max_us = maxi(stats.path_max_us, us)
	return out

# ======================================================================
# places
# ======================================================================
func _v(a: Array) -> Vector3:
	var p := snap(Vector2(a[0], a[1]))
	return Vector3(p.x, p.y, float(a[2]) if a.size() > 2 else NAN)

func _snap_places() -> void:
	for h in houses:
		var hs: Dictionary = houses[h]
		for k in ["porch", "gate", "lane", "mailbox"]: hs[k] = _v(hs[k])
		hs.door_raw = Vector3(hs.door[0], hs.door[1], hs.door[2])
		hs.doorway = Vector3(hs.doorway[0], hs.doorway[1], hs.doorway[2])
		hs.door = _v(hs.door)
		hs.yard = hs.yard.map(func(a): return _v(a))
		hs.normal = Vector2(sin(float(hs.rot)), cos(float(hs.rot)))
	for k in places:
		var pl: Dictionary = places[k]
		if pl.get("offgrid", false):
			# off the walk grid (Viridian's gate): the spots as they are; whoever keeps
			# such a place stays at it (people.json "post")
			for key in pl.keys():
				var v0 = pl[key]
				if v0 is Array and v0.size() > 0 and v0[0] is Array:
					pl[key] = v0.map(func(a): return Vector3(a[0], a[1], float(a[2]) if a.size() > 2 else NAN))
			continue
		for key in pl.keys():
			var v = pl[key]
			if v is Array and v.size() > 0 and v[0] is Array: pl[key] = v.map(func(a): return _v(a))
			elif key in ["well", "boat_steps", "head", "foot", "door", "center"] and v is Array: pl[key] = _v(v)
	if places.has("pallet_house"): _pallet_house(places.pallet_house)

# PALLET HOUSE (Delia's restaurant on the hill; places.json pallet_house, its
# named spots from terrain.js): its single spots become points, and the lists
# the schedules use are made from them: terrace (where one stands to serve or
# wipe a table, facing it), seats (the chairs), garden, kitchen, porch, bench,
# fence. Its front door is a house of its own (life.houses.pallet_house), so
# Delia can go in to cook and come out to serve; it has no room yet.
func _pallet_house(pl: Dictionary) -> void:
	var raw := {}
	for key in pl.keys():
		var v = pl[key]
		if v is Array and v.size() >= 2 and (v[0] is float or v[0] is int) and key != "middle":
			raw[key] = Vector3(v[0], v[1], float(v[2]) if v.size() > 2 else NAN)
			pl[key] = _v(v)
	pl.raw = raw      # (unsnapped: the bench's seat, the basket bed; for Mr. Mime, who sits right on them)
	var mid := Vector2(pl.middle[0], pl.middle[1])
	var terrace := []
	var seats := []
	var tables := []
	for t in pl.get("tables", []):
		var tc := Vector2(t.table[0], t.table[1])
		tables.append(Vector3(tc.x, tc.y, NAN))
		# the serving side: toward the house, where nobody sits
		var d := (mid - tc).normalized()
		var at := tc + d * 1.45
		terrace.append(Vector3(at.x, at.y, atan2(-d.x, -d.y)))
		for ch in t.chairs: seats.append(_v(ch))
	pl.table_at = tables
	pl.terrace = terrace
	pl.spots = terrace
	pl.seats = seats
	var fd: Vector3 = pl.front_door
	var yaw: float = fd.z
	var n := Vector2(sin(yaw + PI), cos(yaw + PI))      # out of the front door
	var porch := Vector2(fd.x, fd.y) + n * 2.0
	pl.porch = [_v([porch.x, porch.y, yaw + PI])]
	pl.garden = [pl.herb_bed, pl.veg_patch, pl.water_butt]
	pl.roses = [pl.cottage_garden]
	pl.kitchen = [pl.kitchen_window]
	var vb: Vector3 = raw.get("view_bench", pl.view_bench)
	pl.bench = [Vector3(vb.x, vb.y, yaw + PI)]     # facing the sea, as the house does
	pl.fence = [pl.cliff_fence]
	if not houses.has("pallet_house"):
		var rd: Vector3 = raw.get("front_door", fd)
		var dr := Vector3(rd.x, rd.y, yaw)
		houses.pallet_house = {"center": [mid.x, mid.y], "rot": yaw - PI, "floor_y": float(pl.get("floor_y", world.height_at(dr.x, dr.y))),
			"door": fd, "door_raw": dr, "doorway": Vector3(dr.x - n.x * 1.0, dr.y - n.y * 1.0, yaw),
			"porch": pl.porch[0], "gate": pl.porch[0], "lane": pl.porch[0], "mailbox": pl.porch[0], "yard": pl.porch, "normal": n, "places": true}

func _make_doors() -> void:
	if headless: return
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.13, 0.09, 0.08)
	for h in houses:
		var hs: Dictionary = houses[h]
		var mi := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(1.34, 2.2)
		mi.mesh = q
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var n: Vector2 = hs.normal
		var dr: Vector3 = hs.door_raw
		var at := Vector2(dr.x, dr.y) - n * 0.9
		mi.position = Vector3(at.x, float(hs.get("floor_y", world.height_at(dr.x, dr.y))) + 1.12, at.y)
		mi.rotation.y = atan2(n.x, n.y)
		mi.visible = false
		add_child(mi)
		doors[h] = {"mesh": mi, "t": 0.0}

func _open_door(h: String, secs: float) -> void:
	if doors.has(h):
		if doors[h].t <= 0.0: _door_sound(h, true)
		doors[h].t = maxf(doors[h].t, secs)
		doors[h].mesh.visible = true

func _door_sound(h: String, opening: bool) -> void:
	var sw = game.get("sfx_world") if game != null else null
	if sw and doors.has(h): sw.house_door(doors[h].mesh.position, opening)

# where a person stands to go into a house (the boat steps for the lighthouse)
func door_of(h: String) -> Vector3:
	if h == "lighthouse": return places.pier.boat_steps
	return houses[h].door

# ======================================================================
# the day plans
# ======================================================================
func _hm(s: String) -> float:
	var p := s.split(":")
	return float(p[0]) * 60.0 + float(p[1])

func _plan(p: Dictionary, d: int) -> void:
	var L = by_id.get(String(p.data.get("follow", "")))
	if L != null:
		# the leader's day, a little behind him
		if L.plan_day != d: _plan(L, d)
		var lag := 0.6 + 0.35 * float(p.data.get("rank", 0))
		p.plan = L.plan.map(func(b): return {"t": b.t + (lag if b.t > 0.0 else 0.0), "act": b.act, "place": b.place, "seed": b.seed})
		p.plan_day = d
		return
	var sch: Dictionary = p.data.schedule
	var wd: String = GameClock.WEEK[(d - 1 + GameClock.FIRST_WEEKDAY) % 7]
	var key := "default"
	for k in sch:
		if k != "default" and wd in String(k).split(","): key = k
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("%s/%d" % [p.id, d])
	var out := []
	var last := -1.0
	for b in sch[key]:
		var t := _hm(b[0])
		var act: String = b[1]
		var place: String = b[2]
		var o: Dictionary = b[3] if b.size() > 3 else {}
		if o.has("p") and rng.randf() > float(o.p):
			if o.has("else"): act = o["else"][0]; place = o["else"][1]
			else: continue
		var jit: float = float(o.get("jitter", p.jitter))
		if t > 0.0: t += rng.randf_range(-jit, jit)
		t = maxf(t, last + 5.0)
		last = t
		var opts := place.split("|")
		place = opts[rng.randi() % opts.size()]
		out.append({"t": t, "act": act, "place": place, "seed": rng.randi()})
	p.plan = out
	p.plan_day = d

func _block_at(p: Dictionary, m: float) -> int:
	var k := 0
	for i in p.plan.size():
		if p.plan[i].t <= m: k = i
	return k

func _check(p: Dictionary, force := false) -> void:
	var d := clock.day()
	if p.plan_day != d: _plan(p, d); p.blk = -1
	var b := _block_at(p, float(clock.minute_of_day()))
	if b == p.blk and not force: return
	p.blk = b
	var blk: Dictionary = p.plan[b]
	p.act = blk.act
	p.place = blk.place
	p.goal = _goal(p, blk)
	if not _jumped: _pursue(p)

func _resolve(p: Dictionary, place: String) -> String:
	return p.home if place == "home" else place

func _goal(p: Dictionary, blk: Dictionary) -> Dictionary:
	var act: String = blk.act
	var place := _resolve(p, blk.place)
	var rng := RandomNumberGenerator.new()
	rng.seed = blk.seed
	if place == "lighthouse" or houses.has(place):
		return {"kind": "inside", "house": place}
	if p.data.has("follow"): return {"kind": "follow", "key": place}   # (round the leader, wherever he is)
	if place.begins_with("route:"):
		var hs := Array(place.substr(6).split(","))
		hs.erase(p.home)
		# a different round every day: four or five doors, nearest first from home
		for i in hs.size():
			var j := rng.randi() % hs.size()
			var t = hs[i]; hs[i] = hs[j]; hs[j] = t
		hs = hs.slice(0, 4 + rng.randi() % 2)
		var at := _xz(door_of(p.home))
		var ordered := []
		while not hs.is_empty():
			var bi := 0
			for i in hs.size():
				if _xz(door_of(hs[i])).distance_to(at) < _xz(door_of(hs[bi])).distance_to(at): bi = i
			ordered.append(hs[bi]); at = _xz(door_of(hs[bi])); hs.remove_at(bi)
		return {"kind": "route", "list": ordered, "i": 0}
	var parts := place.split(".")
	var spots: Array = []
	var key := place
	if parts.size() > 1 and places.has(parts[0]) and places[parts[0]].has(parts[1]):
		var pv = places[parts[0]][parts[1]]
		spots = pv if pv is Array else [pv]
	elif houses.has(parts[0]):
		var hs2: Dictionary = houses[parts[0]]
		var sub: String = parts[1] if parts.size() > 1 else "door"
		if sub == "yard": spots = hs2.yard
		else: spots = [hs2[sub]]
	elif places.has(parts[0]):
		var pl: Dictionary = places[parts[0]]
		spots = pl.get(parts[1] if parts.size() > 1 else "spots", pl.get("spots", []))
	if spots.is_empty():
		push_warning("life: no place '%s' for %s" % [place, p.id])
		return {"kind": "inside", "house": p.home}
	var kind := "roam" if act in ROAM and spots.size() > 1 else "spot"
	return {"kind": kind, "spots": spots, "key": key, "door": parts.size() > 1 and parts[1] == "door"}

static func _xz(v: Vector3) -> Vector2: return Vector2(v.x, v.y)

# a spot of the goal's place nobody else holds
func _claim(p: Dictionary, g: Dictionary) -> Vector3:
	_unclaim(p)
	var spots: Array = g.spots
	var start := _rng.randi() % spots.size()
	for k in spots.size():
		var i := (start + k) % spots.size()
		var ck := "%s:%d" % [g.key, i]
		if not claims.has(ck) or g.door:
			if not g.door: claims[ck] = p.id; p.claim = ck
			return spots[i]
	# all taken: stand near one of them
	var s: Vector3 = spots[start]
	var off := Vector2.from_angle(_rng.randf() * TAU) * _rng.randf_range(1.2, 2.0)
	var q := snap(Vector2(s.x, s.y) + off)
	return Vector3(q.x, q.y, s.z)

func _unclaim(p: Dictionary) -> void:
	if p.claim != "" and claims.get(p.claim) == p.id: claims.erase(p.claim)
	p.claim = ""

# act on the goal from wherever the person is
func _pursue(p: Dictionary) -> void:
	var g: Dictionary = p.goal
	if p.state in ["chat", "talk", "chase"]:
		if p.state == "chase": _end_chase()
		elif p.state == "chat": _end_chat(p)
		else: return   # the talk ends first; end_talk calls this again
	if p.state == "inside":
		if g.kind == "inside" and g.house == p.inside: return
		_leave(p)
		return
	if p.state in ["door_in", "door_out"]: return   # the beat finishes, then this runs again
	match g.kind:
		"inside": _walk(p, _xz(door_of(g.house)), "door_in")
		"spot", "roam":
			var s := _claim(p, g)
			p.target = s
			_walk(p, _xz(s), "act")
		"route":
			_walk(p, _xz(door_of(g.list[g.i])), "knock")
		"follow":
			var f := _squad_spot(p)
			p.target = f
			_walk(p, _xz(f), "act")

func _walk(p: Dictionary, to: Vector2, after: String) -> void:
	p.after = after
	p.dest = to
	p.req += 1
	var here := _xz3(p.pos)
	if here.distance_to(to) < 0.3:
		p.path = PackedVector2Array([to]); p.pi = 0
		_arrive(p)
		return
	p.state = "wait_path"
	if not _queue.has(p): _queue.append(p)
	p.jog = p.age == "kid" and _rng.randf() < 0.25 and not p.has("pace_cap")

static func _xz3(v: Vector3) -> Vector2: return Vector2(v.x, v.z)

func _leave(p: Dictionary) -> void:
	var h: String = p.inside
	var d := door_of(h)
	p.inside = ""
	_unclaim(p)
	var n: Vector2 = Vector2(sin(d.z + PI), cos(d.z + PI))   # out of the door
	p.pos = Vector3(d.x, world.height_at(d.x, d.y), d.y)
	p.yaw = d.z + PI
	if h != "lighthouse":
		var hs: Dictionary = houses[h]
		n = hs.normal
		var dr: Vector3 = hs.door_raw
		var start := Vector2(dr.x, dr.y) - n * 0.55
		p.pos = Vector3(start.x, world.height_at(dr.x, dr.y), start.y)
		p.yaw = atan2(n.x, n.y)
		if interiors != null and interiors.has_room(h): interiors.exit(p, h)
		_open_door(h, 1.4)
	p.state = "door_out"
	p.beat_t = 0.0
	p.v = 0.0
	if p.actor: p.actor.visible = p.seen
	person_exited.emit(p.id, h)

func _enter(p: Dictionary, h: String) -> void:
	p.state = "inside"
	p.inside = h
	p.v = 0.0
	p.path = PackedVector2Array()
	# while inside, their position is the door (for anyone asking where they are)
	var d: Vector3 = houses[h].door_raw if houses.has(h) else door_of(h)
	p.pos = Vector3(d.x, world.height_at(d.x, d.y), d.y)
	_unclaim(p)
	if p.actor: p.actor.visible = false
	p.bubble = {}
	if h != "lighthouse" and interiors != null and interiors.has_room(h): interiors.enter(p, h)
	person_entered.emit(p.id, h)

func _arrive(p: Dictionary) -> void:
	p.path = PackedVector2Array()
	p.v = 0.0
	p.repaths = 0
	match p.after:
		"door_in":
			var h: String = p.goal.house if p.goal.kind == "inside" else p.home
			p.enter_house = h
			p.state = "door_in"; p.beat_t = 0.0
		"act":
			p.state = "act"
			var t: Vector3 = p.target
			p.face = t.z if not is_nan(t.z) else NAN
			p.hop_t = _rng.randf_range(15, 45)
			if squads.has(p.id): hype(p)   # (he got somewhere: cheers)
		"knock":
			p.state = "knock"; p.beat_t = 0.0
			var d := door_of(p.goal.list[p.goal.i])
			p.face = d.z
		"chat_seek":
			p.state = "act"
			var o = by_id.get(p.seek_with)
			if o and _free_for_chat(o) and _xz3(o.pos).distance_to(_xz3(p.pos)) < 2.6: _start_chat(p, o)
		_:
			p.state = "act"

# put everyone straight where their schedule has them (start, time skips)
func resync() -> void:
	_jumped = false
	_queue.clear()
	_end_chase()
	for p in people:
		if p.state == "chat": _end_chat(p)
		if p.state == "talk": continue
		p.blk = -1
		_jumped = true
		_check(p)
		_jumped = false
		_place_now(p)
	if companions: companions.resync()
	if cyclists: cyclists.resync()

func _place_now(p: Dictionary) -> void:
	var g: Dictionary = p.goal
	_unclaim(p)
	p.path = PackedVector2Array()
	p.v = 0.0
	if g.kind == "inside":
		if p.state != "inside" or p.inside != g.house:
			if p.state == "inside" and p.inside != g.house: person_exited.emit(p.id, p.inside)
			_enter(p, g.house)
		return
	if p.state == "inside":
		if p.inside != "": person_exited.emit(p.id, p.inside)   # (someone with no home here starts out at their post)
		p.inside = ""
	var s: Vector3
	if g.kind == "route":
		var d := door_of(g.list[g.i])
		s = d
		p.after = "knock"
	elif g.kind == "follow":
		s = _squad_spot(p)
		p.target = s
		p.after = "act"
	else:
		s = _claim(p, g)
		p.target = s
		p.after = "act"
	p.pos = Vector3(s.x, world.height_at(s.x, s.y), s.y)
	p.yaw = s.z if not is_nan(s.z) else _rng.randf() * TAU
	p.path = PackedVector2Array([Vector2(s.x, s.y)]); p.pi = 0
	_arrive(p)

# ======================================================================
# the frame
# ======================================================================
# true while the player is inside a building (cast.gd enter_space): the town's day goes on
# at the low rate, nobody outside is drawn or can be talked to, bubbles are hidden
var away := false

func update(dt: float) -> void:
	var t0 := Time.get_ticks_usec()
	_frame += 1
	if _jumped: resync()
	var sim := dt * clock.ff
	var n := clampi(ceili(sim / 0.1), 1, 6)   # fast-forward: a few coarser steps, not dozens
	var sdt := sim / n
	_paths()
	var cam: Camera3D = game.cam if not headless else null
	var planes: Array = cam.get_frustum() if cam else []
	var cp: Vector3 = cam.global_position if cam else Vector3.ZERO
	for p in people:
		if (_frame + p.idx) % 20 == 0: _check(p)
		if p.state == "inside": continue
		# view and distance
		var full := headless
		if away: p.seen = false; p.cam_d = 1e9
		elif cam:
			var c: Vector3 = p.pos + Vector3(0, 1, 0)
			var seen := true
			for pl in planes:
				if pl.distance_to(c) > 2.5: seen = false; break
			p.seen = seen
			p.cam_d = cp.distance_to(c)
			full = seen and p.cam_d < FAR
		for s in n:
			if p.state == "inside": break
			if full: _tick(p, sdt, true)
			else:
				p.lod_acc += sdt
				if p.lod_acc >= 0.25 or n > 1:
					_tick(p, p.lod_acc, false); p.lod_acc = 0.0
		if not headless: _show(p, dt)
	companions.update(sim, dt, cam, planes, cp)
	if cyclists: cyclists.update(dt, cp)
	_doors(sim)
	if not squads.is_empty(): _squad(sim)
	_social_acc += sim
	if _social_acc >= 0.25:
		_social(_social_acc)
		_social_acc = 0.0
	if not _chase.is_empty(): _chase_tick(sim)
	if bubbles:
		bubbles.visible = not away
		if not away: bubbles.tick(dt)
	if debug and _frame % 10 == 0: _debug_text()
	var us := float(Time.get_ticks_usec() - t0) - _anim_us   # the sim's own cost
	_us_acc += us; _us_n += 1; _anim_acc += _anim_us; _anim_us = 0.0
	stats.us_max = maxf(stats.us_max * 0.995, us)
	if _us_n >= 60:
		stats.us_avg = _us_acc / _us_n; _us_acc = 0.0; _us_n = 0
		stats.anim_avg = _anim_acc / 60.0; _anim_acc = 0.0

func _show(p: Dictionary, dt: float) -> void:
	var a: CastActor = p.actor
	var vis: bool = p.seen and p.state != "inside"
	if a.visible != vis: a.visible = vis
	if not vis: return
	a.position = p.pos
	a.rotation.y = p.yaw
	if cyclists: cyclists.place(p, dt)   # on a bike: in its frame
	p.acc += dt
	var far: bool = p.cam_d > 25.0
	a.cloth_far = p.cam_d > 25.0
	a.cloth_rate = 60.0 if p.cam_d < 12.0 else 30.0
	if not far or (_frame + p.idx) % 2 == 0:
		var ta := Time.get_ticks_usec()
		a.animate(p.acc, p.v, false); p.acc = 0.0
		_anim_us += Time.get_ticks_usec() - ta

func _turn(p: Dictionary, to: float, dt: float, k := 7.0) -> void:
	p.yaw = wrapf(p.yaw + wrapf(to - p.yaw, -PI, PI) * (1.0 - exp(-dt * k)), -PI, PI)

func _tick(p: Dictionary, dt: float, full: bool) -> void:
	match p.state:
		"walk":
			_move(p, dt, full)
			if p.state == "walk" and p.goal.kind == "follow": _keep_up(p, dt, 4.0)
		"wait_path": p.v *= exp(-dt * 8.0)
		"act":
			p.v *= exp(-dt * 8.0)
			if p.goal.kind == "follow": _keep_up(p, dt, 2.5)
			if not is_nan(p.face): _turn(p, p.face, dt, 4.0)
			if p.goal.kind == "roam":
				p.hop_t -= dt
				if p.hop_t <= 0.0: _hop(p)
		"knock":
			var h: String = p.goal.list[p.goal.i]
			if full and p.beat_t == 0.0 and _approach_door(p, h, dt): return
			p.v *= exp(-dt * 8.0)
			_turn(p, p.face, dt, 6.0)
			var was: float = p.beat_t
			p.beat_t += dt
			if was < 2.0 and p.beat_t >= 2.0: _open_door(h, 3.0)
			if was < 2.4 and p.beat_t >= 2.4 and p.id == "ada" and full: say(p, ["Bread's here!", "Morning, love! Your loaf!", "Fresh from the oven!"][_rng.randi() % 3], 2.2)
			if p.beat_t > 5.5 + float(p.goal.i % 3):
				p.goal.i += 1
				if p.goal.i >= p.goal.list.size():
					p.goal = {"kind": "inside", "house": p.home}
					p.act = "home"
				_pursue(p)
		"door_in":
			_door_in(p, dt, full)
		"door_out":
			_door_out(p, dt, full)
		"chat":
			p.v *= exp(-dt * 8.0)
			if not is_nan(p.face): _turn(p, p.face, dt, 6.0)
			_chat_tick(p, dt)
		"talk":
			p.v = 0.0
			var me: Vector3 = game.pos
			_turn(p, atan2(me.x - p.pos.x, me.z - p.pos.z), dt, 8.0)

# ---------- the squad ----------
# a follower's place round the leader: in an arc behind him (by rank), facing him; round where
# he's going if he's on his way somewhere
func _squad_spot(p: Dictionary) -> Vector3:
	var L: Dictionary = by_id[String(p.data.follow)]
	var c := _xz3(L.pos)
	var f: float = L.yaw
	if L.state in ["walk", "wait_path"] and L.has("dest"): c = L.dest
	if L.has("target") and L.state in ["walk", "wait_path", "act"]:
		var t: Vector3 = L.target
		if Vector2(t.x, t.y).distance_to(c) < 0.5 and not is_nan(t.z): f = t.z
	var n: int = squads[L.id].size()
	var i := float(p.data.get("rank", 0)) - (n - 1) * 0.5
	var a := f + PI + i * 0.55
	var q := snap(c + Vector2(sin(a), cos(a)) * (2.1 + 0.35 * (int(p.data.get("rank", 0)) % 2)))
	return Vector3(q.x, q.y, atan2(c.x - q.x, c.y - q.y))

# keep with the leader: go again when where he is (or is going) has moved off from them
func _keep_up(p: Dictionary, dt: float, far: float) -> void:
	p.fol_t = float(p.get("fol_t", 0.0)) - dt
	if p.fol_t > 0.0: return
	p.fol_t = 0.8
	var L: Dictionary = by_id[String(p.data.follow)]
	if L.state in ["inside", "door_in", "door_out"]: return
	var want := _squad_spot(p)
	if Vector2(want.x, want.y).distance_to(_xz3v(p.target)) > far:
		_pursue(p)
	elif p.state == "act" and _xz3(L.pos).distance_to(_xz3(p.pos)) < 9.0:
		p.face = atan2(L.pos.x - p.pos.x, L.pos.z - p.pos.z)

# cheers: the squad near the leader hops and shakes the pom-poms, one of them chants (loud
# and often: talk, a goodbye and getting somewhere always; otherwise now and then)
func hype(L: Dictionary, chant := false) -> void:
	var near := []
	for p in squads.get(L.id, []):
		if p.state in ["act", "walk", "wait_path"] and p.inside == "" and _xz3(p.pos).distance_to(_xz3(L.pos)) < 12.0: near.append(p)
	if near.is_empty(): return
	var who: Dictionary = near[_rng.randi() % near.size()]
	for p in near:
		p.cheer_at = _rng.randf_range(0.0, 0.45)
		p.cheer_say = p == who and (chant or _rng.randf() < 0.7)

func _squad(dt: float) -> void:
	for L_id in squads:
		var L = by_id.get(L_id)
		if L == null: continue
		for p in squads[L_id]:
			if p.has("cheer_at"):
				p.cheer_at -= dt
				if p.cheer_at <= 0.0:
					if p.state == "act" and p.actor: p.actor.idles.force("cheer")
					if p.cheer_say: _chant(p)
					p.erase("cheer_at")
				continue
			if p.state != "act" or L.state == "inside" or _xz3(p.pos).distance_to(_xz3(L.pos)) > 10.0: continue
			p.cheer_cd = float(p.get("cheer_cd", _rng.randf_range(4.0, 14.0))) - dt
			if p.cheer_cd <= 0.0:
				p.cheer_cd = _rng.randf_range(10.0, 26.0)
				if p.actor: p.actor.idles.force("cheer")
				if _rng.randf() < 0.35: _chant(p)

func _chant(p: Dictionary) -> void:
	var lines: Array = quests.person(p.id).get("cheer", []) if quests else []
	if lines.is_empty(): lines = ["Gary, Gary, he's our man!", "Go, Gary!"]
	say(p, String(lines[_rng.randi() % lines.size()]), 2.6)

func _hop(p: Dictionary) -> void:
	# another spot of the place, or a short wander round this one
	var g: Dictionary = p.goal
	var s: Vector3
	if _rng.randf() < 0.65:
		s = _claim(p, g)
	else:
		var here := _xz3(p.pos)
		var q := snap(here + Vector2.from_angle(_rng.randf() * TAU) * _rng.randf_range(1.0, 2.5))
		s = Vector3(q.x, q.y, NAN)
	p.target = s
	_walk(p, Vector2(s.x, s.y), "act")

func _move(p: Dictionary, dt: float, full: bool) -> void:
	if cyclists and cyclists.move(p, dt, full): return   # on a bike (bike/cyclists.gd)
	var path: PackedVector2Array = p.path
	if p.pi >= path.size(): _arrive(p); return
	var here := _xz3(p.pos)
	var tgt := path[p.pi]
	var last: bool = p.pi == path.size() - 1
	var d := here.distance_to(tgt)
	var reach := 0.22 if last else (0.9 if full else 0.05)
	# a corner is rounded (left early) only where the way on is clear from here
	if d < reach and (last or not full or d < 0.25 or _clear(here, path[p.pi + 1], 99.0)) or (last and d < 1.1 and p.prog_t > 1.0):
		p.pi += 1
		p.best_d = INF; p.prog_t = 0.0
		if p.pi >= path.size():
			if last: p.pos = Vector3(tgt.x, p.pos.y, tgt.y)
			_arrive(p)
		return
	var vmax: float = p.walk_v * (1.75 if p.jog else 1.0)
	if p.has("pace_cap"): vmax = minf(vmax, p.pace_cap)
	if last: vmax = minf(vmax, 0.35 + d * 1.4)
	if not full:
		# far: along the path, no steering or collision (the path is clear)
		var step := vmax * dt
		while step > 0.0 and p.pi < path.size():
			tgt = path[p.pi]
			var seg := tgt - here
			var sl := seg.length()
			if sl <= step:
				here = tgt; step -= sl; p.pi += 1
			else:
				here += seg / sl * step; step = 0.0
			if sl > 1e-3: p.yaw = atan2(seg.x, seg.y)
		p.v = vmax
		p.pos = Vector3(here.x, world.height_at(here.x, here.y), here.y)
		if p.pi >= path.size(): _arrive(p)
		return
	p.v += (vmax - p.v) * (1.0 - exp(-dt * 4.0))
	var dir := (tgt - here) / d
	# steer round other people and the player: push apart, keep right of oncoming
	var push := Vector2.ZERO
	for o in people:
		if o == p or o.state == "inside": continue
		var dv: Vector2 = here - _xz3(o.pos)
		var dd := dv.length()
		if dd < 1.6 and dd > 1e-3:
			push += dv / dd * (1.6 - dd) * 1.2
			if dir.dot(-dv / dd) > 0.6 and o.state != "walk": push += Vector2(-dir.y, dir.x) * -0.8   # someone standing in the way: round them
			elif dir.dot(-dv / dd) > 0.6: push += Vector2(dir.y, -dir.x) * 0.5    # oncoming: keep right
	# and round the Pokémon (not their own: it keeps out of their way)
	for c in companions.pets:
		if c.inside != "" or c.owner == p: continue
		var dc: Vector2 = here - Vector2(c.pos.x, c.pos.z)
		var dcl := dc.length()
		var rc: float = 0.6 + float(c.sp.r)
		if dcl < rc and dcl > 1e-3: push += dc / dcl * (rc - dcl) * 1.5
	if not headless and not away:
		var me := Vector2(game.pos.x, game.pos.z)
		var dm := here.distance_to(me)
		# Ash on his bike: a wider berth, and out of his way sooner
		var ab = cast.get("bike") if cast != null else null
		var rr := 1.8
		if ab != null and ab.riding(): rr = 2.6 + minf(absf(ab.v), 9.0) * 0.12
		if dm < rr and dm > 1e-3: push += (here - me) / dm * (rr - dm) * 1.5
		# and round parked bikes (his and the townspeople's)
		if ab != null and ab.state == "parked" and ab.visible:
			var bc: Array = ab.capsule()
			var a3: Vector3 = bc[0]; var b3: Vector3 = bc[1]
			var ab2 := Vector2(b3.x - a3.x, b3.z - a3.z)
			var u := clampf((here - Vector2(a3.x, a3.z)).dot(ab2) / ab2.length_squared(), 0.0, 1.0)
			var q := Vector2(a3.x, a3.z) + ab2 * u
			var dq := here - q
			if dq.length() < 0.75 and dq.length() > 1e-3: push += dq / dq.length() * (0.75 - dq.length()) * 2.0
	if cyclists:
		for ob in cyclists.obstacles():
			if ob[2] == p.id: continue
			var dq2: Vector2 = here - (ob[0] as Vector2)
			var rr2: float = ob[1]
			if dq2.length() < rr2 and dq2.length() > 1e-3: push += dq2 / dq2.length() * (rr2 - dq2.length()) * 2.0
	var want := (dir + push * (clampf((d - 0.5) / 3.0, 0.15, 1.0) if last else 1.0)).normalized()
	_turn(p, atan2(want.x, want.y), dt, 8.0)
	var fwd := Vector2(sin(p.yaw), cos(p.yaw))
	# move along the facing, blended toward the wanted heading when turning hard
	var mv: Vector2 = (fwd * 0.7 + want * 0.3).normalized() * p.v * dt
	var np := world.step(p.pos, mv.x, mv.y)
	if Vector2(np.x - p.pos.x, np.z - p.pos.z).length() < mv.length() * 0.3:
		var mv2: Vector2 = dir * p.v * dt
		np = world.step(p.pos, mv2.x, mv2.y)
	np.y = world.height_at(np.x, np.z)
	p.pos = np
	# progress watch: no closer to the waypoint for 3 s -> re-plan; three times -> hop
	var nd := Vector2(np.x, np.z).distance_to(tgt)
	if nd < p.best_d - 0.25:
		p.best_d = nd; p.prog_t = 0.0
	else:
		p.prog_t += dt
		if p.prog_t > 3.0: _unstick(p)

func _unstick(p: Dictionary) -> void:
	p.prog_t = 0.0
	p.best_d = INF
	p.repaths += 1
	p.stuck_total += 3.0
	if stuck_log.size() < 200: stuck_log.append([p.id, _xz3(p.pos), p.path[mini(p.pi, p.path.size() - 1)], p.place, p.repaths])
	if p.repaths <= 3:
		stats.repath += 1
		var here := _xz3(p.pos)
		# step back onto a free cell first if pushed into a blocked one
		# (from the second try: onto the middle of its cell, which is clear of everything)
		var c := cell(here)
		if not is_free(c) or p.repaths >= 2:
			var q := centre(nearest_free(c))
			p.pos = Vector3(q.x, world.height_at(q.x, q.y), q.y)
		p.req += 1
		p.state = "wait_path"
		if not _queue.has(p): _queue.append(p)
	else:
		stats.teleport += 1
		p.repaths = 0
		var t: Vector2 = p.path[mini(p.pi, p.path.size() - 1)]
		p.pos = Vector3(t.x, world.height_at(t.x, t.y), t.y)
		push_warning("life: %s hopped to (%.1f, %.1f) going to %s" % [p.id, t.x, t.y, p.place])

# ---------- path searches ----------
# On a worker thread, one at a time (the grid's search state is not shared);
# headless (the logic test) they run in line.
var _job := -1
var _job_mx := Mutex.new()
var _job_out: Array = []

func _paths() -> void:
	if headless:
		for _k in 8:
			if _queue.is_empty(): break
			var p: Dictionary = _queue.pop_front()
			if p.state == "wait_path": _got_path(p, p.req, find_path(_xz3(p.pos), p.dest))
		return
	if _job >= 0 and WorkerThreadPool.is_task_completed(_job):
		WorkerThreadPool.wait_for_task_completion(_job)
		_job = -1
		_job_mx.lock()
		var out := _job_out.duplicate()
		_job_out.clear()
		_job_mx.unlock()
		for r in out: _got_path(r[0], r[1], r[2])
	if _job < 0:
		while not _queue.is_empty():
			var p: Dictionary = _queue.pop_front()
			if p.state != "wait_path": continue
			_job = WorkerThreadPool.add_task(_search.bind(p, p.req, _xz3(p.pos), p.dest), false, "town path")
			break

func _search(p: Dictionary, req: int, from: Vector2, to: Vector2) -> void:
	var path := find_path(from, to)
	_job_mx.lock()
	_job_out.append([p, req, path])
	_job_mx.unlock()

func _got_path(p: Dictionary, req: int, path: PackedVector2Array) -> void:
	if p.state != "wait_path" or req != p.req: return
	p.path = path
	p.pi = 0
	if path.size() > 1 and _xz3(p.pos).distance_to(path[0]) < 0.6: p.pi = 1
	p.best_d = INF; p.prog_t = 0.0
	p.state = "walk"
	if cyclists: cyclists.plan(p)   # a long leg on the lanes: by bike

func _exit_tree() -> void:
	if _job >= 0: WorkerThreadPool.wait_for_task_completion(_job); _job = -1

func _door_in(p: Dictionary, dt: float, full: bool) -> void:
	var h: String = p.enter_house
	if not full or h == "lighthouse":
		_enter(p, h); _pursue_after_enter(p); return
	var d := door_of(h)
	# the walk grid keeps paths clear of the porch rails, so the path may end a
	# little off the door: the last steps up to it are walked straight
	if p.beat_t == 0.0 and _approach_door(p, h, dt): return
	var was: float = p.beat_t
	p.beat_t += dt
	p.v *= exp(-dt * 8.0)
	_turn(p, d.z, dt, 9.0)
	if was < 0.3 and p.beat_t >= 0.3: _open_door(h, 1.7)
	if p.beat_t > 0.45:
		p.v = 0.7
		var n: Vector2 = houses[h].normal
		p.pos.x -= n.x * 0.7 * dt; p.pos.z -= n.y * 0.7 * dt
	if p.beat_t > 1.25:
		_enter(p, h); _pursue_after_enter(p)

# the last steps up to the door, straight (true while still walking)
func _approach_door(p: Dictionary, h: String, dt: float) -> bool:
	if not houses.has(h): return false
	var dr: Vector3 = houses[h].door_raw
	var to := Vector2(dr.x, dr.y) - _xz3(p.pos)
	if to.length() < 0.15 or p.get("door_walk", 0.0) > 2.5:
		p.door_walk = 0.0
		return false
	p.door_walk = p.get("door_walk", 0.0) + dt
	p.v = 1.0
	_turn(p, atan2(to.x, to.y), dt, 10.0)
	var st := to.normalized() * minf(to.length(), 1.0 * dt)
	p.pos.x += st.x; p.pos.z += st.y
	p.pos.y = world.height_at(p.pos.x, p.pos.z)
	return true

func _pursue_after_enter(p: Dictionary) -> void:
	# the schedule may have moved on during the walk here
	if p.goal.kind != "inside" or p.goal.house != p.inside: _pursue(p)

func _door_out(p: Dictionary, dt: float, full: bool) -> void:
	p.beat_t += dt
	if full and p.beat_t < 0.9:
		p.v = 0.75
		var f := Vector2(sin(p.yaw), cos(p.yaw))
		p.pos.x += f.x * 0.75 * dt; p.pos.z += f.y * 0.75 * dt
		return
	p.state = "act"
	_pursue(p)

func _doors(dt: float) -> void:
	for h in doors:
		var dd: Dictionary = doors[h]
		if dd.t > 0.0:
			dd.t -= dt
			if dd.t <= 0.0:
				dd.mesh.visible = false
				_door_sound(h, false)

# ======================================================================
# social life
# ======================================================================
func ctx_of(p: Dictionary) -> Dictionary:
	var act: String = p.act
	if p.state in ["walk", "wait_path"]: act = "commute"
	elif p.state == "inside" and not (act in DOOR_ACTS): act = "inside"
	return {"hour": clock.hour(), "period": clock.period(), "activity": act, "place": place_of(p), "spot": _resolve(p, p.place),
		"day": clock.day(), "weekday": clock.weekday(), "next": p.act, "state": p.state}

# the place a person is at or bound for, as the dialogue names them: a house id
# ("hollis") or a place ("pier"); Ada's round is "town"
func place_of(p: Dictionary) -> String:
	var pl := _resolve(p, p.place)
	if pl.begins_with("route:"): return "town"
	return pl.split(".")[0]

func say(p: Dictionary, text: String, secs := 3.0, delay := 0.0) -> void:
	if text == "": return
	p.bubble = {"text": text, "t": secs}
	if delay > 0.0: p.bubble.delay = delay

func _free_for_chat(p: Dictionary) -> bool:
	if p.data.has("follow"): return false   # (with the leader, not chatting)
	return p.state in ["walk", "act", "wait_path"] and p.inside == "" and _talking != p and not (cyclists and cyclists.riding(p))

func _pair(a: String, b: String) -> String:
	return a + "|" + b if a < b else b + "|" + a

func _social(dt: float) -> void:
	var m := clock.minutes
	var outside := people.filter(func(p): return p.state != "inside")
	for p in outside:
		if not p.bubble.is_empty():
			p.bubble.t -= dt
			if p.bubble.t <= 0.0: p.bubble = {}
		p.bark_cd -= dt
		if (_frame / 7 + p.idx) % 8 == 0: p.wants = String(quests.wants(p.id))
	for i in outside.size():
		var a: Dictionary = outside[i]
		if not _free_for_chat(a): continue
		for j in range(i + 1, outside.size()):
			var b: Dictionary = outside[j]
			if not _free_for_chat(b): continue
			var d := _xz3(a.pos).distance_to(_xz3(b.pos))
			if d > 2.2: continue
			var key := _pair(a.id, b.id)
			if pair_cd.get(key, -1e9) > m: continue
			pair_cd[key] = m + 45.0 + _rng.randf() * 60.0
			var rel := String(quests.relation(a.id, b.id))
			var friends: bool = b.id in a.friends or a.id in b.friends or rel in ["family", "friends"]
			var chance := 0.7 if friends else (0.15 if rel == "rivals" else 0.35)
			if a.state == "walk" and b.state == "walk": chance *= 0.6
			if a.act.begins_with("work") or a.act in ["fish", "bake", "deliver"]: chance *= 0.5
			if _rng.randf() < chance:
				_start_chat(a, b)
			else:
				_greet(a, b)
			break
	# people standing about at a social place go over to someone they know
	for p in outside:
		if p.state != "act" or not (p.act in SOCIAL) or p.act == "play": continue
		p.seek_t -= dt
		if p.seek_t > 0.0: continue
		p.seek_t = _rng.randf_range(20, 50)
		for o in outside:
			if o == p or o.state != "act" or not (o.act in SOCIAL): continue
			var d2 := _xz3(o.pos).distance_to(_xz3(p.pos))
			if d2 > 2.2 and d2 < 9.0 and pair_cd.get(_pair(p.id, o.id), -1e9) < m:
				var side := _xz3(o.pos) + (_xz3(p.pos) - _xz3(o.pos)).normalized() * 1.3
				p.seek_with = o.id
				p.target = Vector3(side.x, side.y, NAN)
				_walk(p, snap(side), "chat_seek")
				break
	# the kids play tag: one starts only when it can sneak up on the other from behind
	_tag_cd -= dt
	if _chase.is_empty() and _tag_cd <= 0.0:
		var l = by_id.get("lily"); var t = by_id.get("timmy")
		if l and t and _playing(l) and _playing(t) and _xz3(l.pos).distance_to(_xz3(t.pos)) < 14.0 \
				and _rng.randf() < 0.3 * dt:
			for pr in [[l, t], [t, l]]:
				if _behind(pr[0], pr[1]) < -0.35:
					_start_chase(pr[0], pr[1]); break
	# Delia keeps an eye out for Ash; others mutter as he passes
	if not headless and not away:
		var me := Vector2(game.pos.x, game.pos.z)
		_delia_cd -= dt
		var dl = by_id.get("delia")
		if dl and dl.state == "act" and _delia_cd <= 0.0 and _xz3(dl.pos).distance_to(me) < 16.0:
			_delia_cd = _rng.randf_range(50, 90)
			say(dl, quests.overheard("delia", ctx_of(dl)), 3.5)
			dl.face = atan2(me.x - dl.pos.x, me.y - dl.pos.z)
		_duty()
		for p in outside:
			if p.id == "delia" or p.bark_cd > 0.0 or not p.bubble.is_empty() or not (p.state in ["act", "walk"]): continue
			if _xz3(p.pos).distance_to(me) < 3.5:
				p.bark_cd = _rng.randf_range(60, 120)
				if _rng.randf() < 0.45: say(p, quests.overheard(p.id, ctx_of(p)), 2.6)

# someone on duty at a post (people.json "greet_act": a salute) greets Ash as he comes up,
# keeps an eye on him while he's near, and faces back down the road once he's gone
func _duty() -> void:
	var me := Vector2(game.pos.x, game.pos.z)
	for p in people:
		if String(p.data.get("greet_act", "")) == "" or p.state != "act": continue
		var d := _xz3(p.pos).distance_to(me)
		if d < 6.5:
			p.face = atan2(me.x - p.pos.x, me.y - p.pos.z)
			if not p.get("greeted", false):
				p.greeted = true
				greet(p)
		elif d > 12.0 and p.get("greeted", false):
			p.greeted = false
			var t: Vector3 = p.target
			p.face = t.z if not is_nan(t.z) else NAN

# their greeting (the salute), at most once in a while: as Ash comes up, or as a talk begins
func greet(p: Dictionary) -> void:
	var act := String(p.data.get("greet_act", ""))
	if act == "" or p.actor == null: return
	var now := Time.get_ticks_msec() / 1000.0
	if now - float(p.get("greet_t", -100.0)) < 20.0: return
	p.greet_t = now
	p.actor.idles.force(act)

func _greet(a: Dictionary, b: Dictionary) -> void:
	stats.greets += 1
	var per := clock.period()
	var hi := {"dawn": "Morning!", "morning": "Morning!", "midday": "Hello!", "afternoon": "Afternoon!", "evening": "Evening!", "night": "'Night!"}
	say(a, "%s, %s!" % [hi.get(per, "Hello").trim_suffix("!"), b.name] if _rng.randf() < 0.6 else hi.get(per, "Hello!"), 2.0)
	if _rng.randf() < 0.6: b.bubble = {"text": ["Hi!", "Hello!", "Oh, hello!", "Morning!" if per in ["dawn", "morning"] else "Hiya!"][_rng.randi() % 4], "t": 3.0, "delay": 1.0}
	if a.actor: a.actor.look_yaw = clampf(wrapf(atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z) - a.yaw, -PI, PI), -1.0, 1.0)

func _start_chat(a: Dictionary, b: Dictionary) -> void:
	var ctx := ctx_of(a)
	ctx["with"] = b.id
	var lines: Array = quests.chatter(a.id, b.id, ctx)
	if lines.is_empty(): return
	stats.chats += 1
	pair_cd[_pair(a.id, b.id)] = clock.minutes + 120.0 + _rng.randf() * 120.0
	var c := {"a": a.id, "b": b.id, "lines": lines, "i": -1, "t": 0.6}
	for p in [a, b]:
		p.resume = {"state": p.state, "after": p.get("after", "act")}
		p.state = "chat"
		p.chat = c
		p.v = 0.0
	a.face = atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z)
	b.face = atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z)

func _chat_tick(p: Dictionary, dt: float) -> void:
	var c: Dictionary = p.chat
	if c.is_empty() or c.a != p.id: return   # the first of the pair runs it
	c.t -= dt
	if c.t > 0.0: return
	c.i += 1
	if c.i >= c.lines.size():
		var b = by_id[c.b]
		_end_chat(p)
		if b.state == "chat": _end_chat(b)
		return
	var line := String(c.lines[c.i])
	var who := p
	var text := line
	var colon := line.find(": ")
	if colon > 0:
		var nm := line.substr(0, colon).to_lower()
		text = line.substr(colon + 2)
		var b2 = by_id[c.b]
		if nm in b2.names and not (nm in p.names): who = b2
	elif c.i % 2 == 1: who = by_id[c.b]
	var secs := clampf(1.4 + text.length() * 0.055, 2.2, 5.5)
	say(who, text, secs)
	c.t = secs + 0.25

func _end_chat(p: Dictionary) -> void:
	p.chat = {}
	var r: Dictionary = p.get("resume", {"state": "act", "after": "act"})
	p.face = NAN
	if r.state == "walk" or r.state == "wait_path":
		p.state = "walk"
		if p.path.is_empty(): _pursue(p)
	else:
		p.state = "act"
		p.hop_t = _rng.randf_range(5, 20)
	# the schedule may have moved on meanwhile
	if p.blk != _block_at(p, float(clock.minute_of_day())): _check(p, true)

# ---------- tag ----------
# sneak: the sneaker creeps up behind the other (who goes on playing); if the
#   other turns and sees it coming (within 6 m, the sneaker in front of them) the
#   game is off ("I see you!")
# tag: within reach and still unseen: "Tag, you're it!" - the tagger runs off at
#   once, the tagged one is startled for a moment, then gives chase
# chase: 15 s; whether the chaser catches up is decided at the start (its speed
#   a little over or under the runner's): "Gotcha!" / "Oh man, you caught me!",
#   or at the end "Man, you're too fast!"
# after a catch, sometimes one more round the other way (a pause, then the new
# runner gets a head start before it can be caught): at most two tags a game,
# then a rest of a few minutes before the next
const TAG_REACH := 0.85
# the tap on the back (a soft clap where the tagger stands)
func _tag_sound(p: Dictionary) -> void:
	if not away and not headless and game != null and game.get("sfx_world") != null: Sfx.play("tag_tap", p.pos + Vector3(0, 1.1, 0), {"vol": -2.0})

func _playing(p: Dictionary) -> bool:
	return p.state == "act" and p.act == "play"

# how far a is behind b: -1 straight behind b's back, 1 in front of b's face
func _behind(a: Dictionary, b: Dictionary) -> float:
	var to := _xz3(a.pos) - _xz3(b.pos)
	if to.length() < 1e-3: return 0.0
	return Vector2(sin(b.yaw), cos(b.yaw)).dot(to.normalized())

func _start_chase(a: Dictionary, b: Dictionary) -> void:
	_chase = {"phase": "sneak", "a": a, "b": b, "t": 25.0, "tags": 0, "catch": false}
	a.state = "chase"

func _end_chase() -> void:
	if _chase.is_empty(): return
	for p in [_chase.a, _chase.b]:
		if p.state == "chase":
			p.state = "act"; p.hop_t = _rng.randf_range(4, 12); p.v = 0.0
	_chase = {}
	_tag_cd = _rng.randf_range(90, 180)

# from here a runs and b is "it" (chases)
func _round(runner: Dictionary, chaser: Dictionary, head_start: float) -> void:
	_chase.a = runner; _chase.b = chaser
	_chase.phase = "flee"; _chase.t = head_start
	_chase.chase_t = 15.0
	_chase.catch = _rng.randf() < 0.5
	chaser.state = "chase"; runner.state = "chase"

func _chase_tick(dt: float) -> void:
	var c: Dictionary = _chase
	var a: Dictionary = c.a
	var b: Dictionary = c.b
	c.t -= dt
	var pa := _xz3(a.pos); var pb := _xz3(b.pos)
	var d := pa.distance_to(pb)
	var nm := func(p): return String(p.name).split(" ")[0]
	match c.phase:
		"sneak":
			if a.state != "chase" or not _playing(b) or c.t <= 0.0: _end_chase(); return
			# spotted: the other is facing the sneaker
			if d < 6.0 and _behind(a, b) > 0.45:
				b.face = atan2(pa.x - pb.x, pa.y - pb.y)
				say(b, ["I see you, %s!", "Nice try, %s!", "Ha! I can see you, %s!"][_rng.randi() % 3] % nm.call(a), 2.2)
				a.v = 0.0
				_end_chase(); return
			if d < TAG_REACH:
				_tag_sound(a)
				say(a, ["Tag, you're it!", "Tag! You're it!", "Gotcha! You're it!"][_rng.randi() % 3], 2.0)
				say(b, ["Hey!", "Whoa!", "No fair!"][_rng.randi() % 3], 1.4, 0.5)
				c.tags = 1
				_round(a, b, 0.8)       # b is it now; a runs off at once
				return
			# creep up to just behind the other's back
			var back := pb - Vector2(sin(b.yaw), cos(b.yaw)) * 0.5
			_run(a, (back - pa).normalized(), 1.3 if d > 3.0 else 0.9, dt)
		"flee":
			# the runner gets away while the chaser is startled / pausing
			b.v = 0.0
			_turn(b, atan2(pa.x - pb.x, pa.y - pb.y), dt, 8.0)
			_run(a, _away(a, b), 3.0, dt)
			if c.t <= 0.0: c.phase = "chase"
		"chase":
			c.chase_t -= dt
			# a.runs, b.chases (b is "it")
			if d < TAG_REACH and c.catch:
				_tag_sound(b)
				say(b, ["Gotcha!", "Caught you!", "Got you!"][_rng.randi() % 3], 1.8)
				say(a, ["Oh man, you caught me!", "Aww, no fair!", "Okay, okay, you got me!"][_rng.randi() % 3], 2.2, 0.6)
				c.tags += 1
				if c.tags < 3 and _rng.randf() < 0.4:
					c.phase = "pause"; c.t = 2.5    # laugh, then one more round the other way
					a.v = 0.0; b.v = 0.0
				else:
					_end_chase()
				return
			if c.chase_t <= 0.0:
				say(b, ["Man, you're too fast!", "Phew... you're too fast, %s!" % nm.call(a), "No fair, you're too quick!"][_rng.randi() % 3], 2.4)
				say(a, ["Ha! Can't catch me!", "Too slow!", "Hehe!"][_rng.randi() % 3], 1.8, 0.6)
				_end_chase(); return
			var vr := 2.8
			var vc := vr * (1.12 if c.catch else 0.9)
			# a caught-in-the-end chase closes in the last seconds, not straight away
			if c.catch and c.chase_t > 6.0: vc = vr * 0.97
			_run(b, (pa - pb).normalized(), vc, dt)
			_run(a, _away(a, b), vr, dt)
		"pause":
			a.v = 0.0; b.v = 0.0
			_turn(a, atan2(pb.x - pa.x, pb.y - pa.y), dt, 6.0); _turn(b, atan2(pa.x - pb.x, pa.y - pb.y), dt, 6.0)
			if c.t <= 0.0:
				# the one just caught is it; the other runs with a head start
				say(b, ["Your turn!", "Now you're it!", "Catch me if you can!"][_rng.randi() % 3], 1.8)
				_round(b, a, 1.2)       # the one just caught (a) is it; b runs

# away from the chaser, weaving a little
func _away(runner: Dictionary, chaser: Dictionary) -> Vector2:
	var d := _xz3(runner.pos) - _xz3(chaser.pos)
	if d.length() < 1e-3: d = Vector2(sin(runner.yaw), cos(runner.yaw))
	return d.normalized().rotated(sin(Time.get_ticks_msec() * 0.0013 + runner.idx) * 0.7)

func _run(p: Dictionary, dir: Vector2, v: float, dt: float) -> void:
	p.v += (v - p.v) * (1.0 - exp(-dt * 5.0))
	_turn(p, atan2(dir.x, dir.y), dt, 9.0)
	var f: Vector2 = Vector2(sin(p.yaw), cos(p.yaw)) * p.v * dt
	var np := world.step(p.pos, f.x, f.y)
	if not walkable(Vector2(np.x, np.z)) or Vector2(np.x - p.pos.x, np.z - p.pos.z).length() < f.length() * 0.3:
		# a fence or the water: turn back
		p.yaw += PI * 0.6
		return
	np.y = world.height_at(np.x, np.z)
	p.pos = np

# ======================================================================
# the player
# ======================================================================
# the closest townsperson in reach, facing-wise like cast.gd's nearby()
func nearest_talk(me: Vector3, fx: float, fz: float, maxd := 2.2) -> Dictionary:
	var best := {}
	var bd := maxd
	for p in people:
		if p.state in ["inside", "door_in", "door_out"]: continue
		var dx: float = p.pos.x - me.x
		var dz: float = p.pos.z - me.z
		var dd := sqrt(dx * dx + dz * dz)
		if dd < bd and (dx * fx + dz * fz) / maxf(dd, 1e-4) > 0.2:
			best = p; bd = dd
	return best

func begin_talk(p: Dictionary) -> Array:
	var ctx := begin_talk_quiet(p)
	var lines: Array = quests.talk(p.id, ctx)
	if lines.is_empty(): lines = ["..."]
	return lines.map(func(l): return String(l) if not (l is Dictionary) else String(l.get("text", "...")))

# stop them for a talk (the conversation mode asks Quests itself): their state
# becomes "talk" until end_talk; returns their context (ctx_of) from before
func begin_talk_quiet(p: Dictionary) -> Dictionary:
	if p.state == "chase": _end_chase()
	if p.state == "chat":
		var c: Dictionary = p.chat
		for id in [c.a, c.b]:
			if by_id[id].state == "chat": _end_chat(by_id[id])
	var ctx := ctx_of(p)
	p.talk_resume = {"state": p.state}
	if squads.has(p.id): hype(p, true)   # (Ash came to talk to him)
	p.state = "talk"
	p.v = 0.0
	p.bubble = {}
	_talking = p
	return ctx

func end_talk(p: Dictionary) -> void:
	_talking = null
	if squads.has(p.id): hype(p, true)
	# (someone talked to inside a house, cast.gd _talk_proxy: their record stays inside)
	if p.has("indoor_of"): return
	var r: Dictionary = p.get("talk_resume", {"state": "act"})
	if r.state in ["walk", "wait_path"] and not p.path.is_empty():
		p.state = "walk"; p.best_d = INF; p.prog_t = 0.0
	else:
		p.state = "act"
		p.face = NAN
		p.hop_t = _rng.randf_range(4, 10)
	if p.blk != _block_at(p, float(clock.minute_of_day())): _check(p, true)
	if p.state == "act" and p.goal.kind != "roam" and p.has("target") and _xz3(p.pos).distance_to(_xz3v(p.target)) > 1.0:
		_pursue(p)

static func _xz3v(v: Vector3) -> Vector2: return Vector2(v.x, v.y)

# ======================================================================
# debug
# ======================================================================
func describe(p: Dictionary) -> String:
	var where := ""
	match p.state:
		"inside": where = "in " + String(p.inside)
		"walk", "wait_path":
			var left := 0.0
			var here := _xz3(p.pos)
			for k in range(p.pi, p.path.size()):
				left += here.distance_to(p.path[k]); here = p.path[k]
			where = "-> %s %dm" % [_resolve(p, p.place), int(left)]
		_: where = "@ " + _resolve(p, p.place)
	return "%-6s %-11s %-10s %s%s" % [p.id, p.act, p.state, where, "  !" if p.wants != "" else ""]

func _debug_text() -> void:
	var s := "%s %s  life %.2f ms (max %.2f) + actors %.2f ms  paths %d (avg %.1f ms, max %.1f)  re-plans %d  hops %d  chats %d\n" % [
		clock.day_text(), clock.time_text(), stats.us_avg / 1000.0, stats.us_max / 1000.0, stats.anim_avg / 1000.0, stats.paths,
		(stats.path_us / maxf(1, stats.paths)) / 1000.0, stats.path_max_us / 1000.0, stats.repath, stats.teleport, stats.chats]
	for p in people: s += describe(p) + "\n"
	debug_label.text = s

# ======================================================================
# speech bubbles and "!" markers over heads
# ======================================================================
class _Bubbles extends Control:
	# speech bubbles and quest marks over the townspeople, in the UI design
	# system's look (ui/ui_widgets.gd bubble, quest_mark); redrawn only while any shows
	var life
	var _had := false
	var _wrapped := {}       # text|size -> its rows (a bubble's text is wrapped once)
	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
	func tick(dt: float) -> void:
		var any := false
		for p in life.people + life.companions.pets:
			if not p.bubble.is_empty() and p.bubble.has("delay"):
				p.bubble.delay -= dt
				if p.bubble.delay <= 0.0: p.bubble.erase("delay")
			if p.seen and p.state != "inside" and (not p.bubble.is_empty() or p.wants != ""): any = true
		if size != get_viewport_rect().size: size = get_viewport_rect().size
		if any or _had: queue_redraw()
		_had = any
	func _draw() -> void:
		var cam: Camera3D = life.game.cam
		var me: Vector3 = life.game.pos
		var t := Time.get_ticks_msec() / 1000.0
		for p in life.people + life.companions.pets:
			if not p.seen or p.state == "inside": continue
			var hh: float = p.get("bub_h", 1.55 if p.age == "kid" else 2.05)
			var head: Vector3 = p.pos + Vector3(0, hh, 0)
			if cam.is_position_behind(head): continue
			var d := cam.global_position.distance_to(head)
			if d > 42.0: continue
			var sp := cam.unproject_position(head)
			var near := d < 14.0 or me.distance_to(p.pos) < 9.0
			var y := sp.y
			if p.wants != "" and (p.bubble.is_empty() or p.bubble.has("delay")):
				var s := clampf(300.0 / d, 18.0, 38.0)
				UIWidgets.quest_mark(self, Vector2(sp.x, y - 4.0), s, sin(t * 3.0 + float(p.pos.x)) * 2.5)
				y -= s + 6.0
			if p.bubble.is_empty() or p.bubble.has("delay"): continue
			var text: String = p.bubble.text if near else "..."
			var fs := 18
			var rows := _rows(text, fs)
			UIWidgets.bubble(self, Vector2(sp.x, y), rows, fs, near, size.x)
	func _rows(text: String, fs: int) -> PackedStringArray:
		var key := "%d|%s" % [fs, text]
		if _wrapped.has(key): return _wrapped[key]
		var rows := UITheme.wrap(text, "body_bold", fs, 240.0)
		if rows.size() > 4: rows = rows.slice(0, 4)
		if _wrapped.size() > 96: _wrapped.clear()
		_wrapped[key] = rows
		return rows
