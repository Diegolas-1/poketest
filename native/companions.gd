class_name Companions
extends Node3D
# The townspeople's Pokémon living alongside them (life/companions.json):
# Lily's Caterpie Nibbles and Farmer Ben's Doduo. Each one is a Creature
# (creature.gd + its species rig) that keeps to its owner on the town's walk
# grid (TownLife.find_path; a straight line where the grid sees through),
# with what its owner is doing deciding what it does:
#   owner walking     follow: behind and to one side (Doduo runs alongside),
#                     quicker when it has fallen behind
#   owner standing    beside them, facing them (and the player when he is
#                     near); Lily now and then crouches to pat Nibbles or
#                     talks to him; Nibbles hops when she stops by; Doduo
#                     works the furrows next to Ben (pecking), trots off and
#                     comes back, runs a playful lap round him
#   owner at a door   Nibbles goes in with Lily (hidden, like the people) and
#                     comes out behind her; Doduo stays out and potters about
#                     the farmyard by the door, and runs over, happy, when
#                     Ben comes back out
#   night             Nibbles sleeps curled up in the Caterpie Corner by
#                     Lily's porch, Doduo in the farmyard; they wake when
#                     their owner comes out
# The player can talk to them (A): cast.gd asks nearest_talk() / begin_talk().
#
# Owner: life.gd. setup(life) after the people exist; update(sim_dt, dt, cam)
# once a frame; resync() after a time skip.
# LOD as the people: not drawn or animated out of view or past 60 m; animated
# every second frame past 18 m and every third past 35 m; out of view or far
# (or the player indoors) the walk runs along the path without steering.

const SPECIES := {
	"caterpie": {"r": 0.2, "talk_h": 0.55, "bub_h": 0.75, "turn": 4.0, "acc": 3.0, "talk_r": 1.7},
	"doduo": {"r": 0.32, "talk_h": 1.45, "bub_h": 1.6, "turn": 7.0, "acc": 5.0, "talk_r": 2.2},
}

var life: TownLife
var pets: Array = []
var by_id := {}
var _rng := RandomNumberGenerator.new()
var _frame := 0
var _searched := false
var stats := {"paths": 0, "blocked": 0, "hops": 0}
var force_pat := false   # (dev) the next moment is a pat
var log: Array = []   # hops (tests)

func setup(l: TownLife) -> void:
	life = l
	_rng.randomize()
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://life/companions.json"))
	for e in d["companions"]:
		var o = life.by_id.get(String(e.owner))
		if o == null: continue
		var sp: Dictionary = SPECIES.get(e.species, SPECIES.caterpie)
		var night = null
		if e.has("night"): night = life.snap(Vector2(e.night.place[0], e.night.place[1]))
		var yard := []
		for y in e.get("yard", []): yard.append(life.snap(Vector2(y[0], y[1])))
		var c := {"id": e.id, "name": e.name, "species": e.species, "data": e, "sp": sp, "owner": o, "idx": pets.size(),
			"pos": o.pos, "yaw": o.yaw, "v": 0.0, "mode": "", "inside": "", "sleep": false, "path": PackedVector2Array(), "pi": 0,
			"path_to": Vector2(INF, INF), "path_t": 0.0, "goal": Vector2.ZERO, "goal_v": 0.0, "face": NAN, "look": null,
			"seen": false, "cam_d": 1e9, "acc": 0.0, "bubble": {}, "wants": "", "age": "pet", "state": "pet", "bub_h": sp.bub_h,
			"night": night, "yard": yard, "side": 1.0, "still_t": 0.0, "pat_cd": _rng.randf_range(20, 40), "bark_cd": _rng.randf_range(15, 40),
			"extra": {}, "extra_cd": _rng.randf_range(25, 50), "stand_t": 0.0, "spot": null, "spot_t": 0.0, "talking": false,
			"owner_was": "", "call_cd": 30.0, "stuck": 0.0, "best": INF, "best_way": Vector2(INF, INF), "nudged": false, "force_path": 0.0, "creature": null, "peck_t": 2.0, "out_t": 0.0, "met": false}
		if e.has("pace_cap"): o.pace_cap = float(e.pace_cap)
		if not life.headless:
			var cr := Creature.make(e.species)
			cr.visible = false
			add_child(cr)
			c.creature = cr
		pets.append(c)
		by_id[c.id] = c
	resync()
	print("companions: %d (%s)" % [pets.size(), ", ".join(pets.map(func(c): return "%s with %s" % [c.id, c.owner.id]))])

# ---------- time skips: straight to where they should be ----------
func resync() -> void:
	for c in pets:
		var o: Dictionary = c.owner
		c.path = PackedVector2Array(); c.v = 0.0; c.extra = {}; c.talking = false
		c.sleep = false; c.inside = ""
		var m := _mode(c)
		c.mode = m
		match m:
			"in": c.inside = o.inside
			"bed", "yard":
				var at: Vector2 = c.night if m == "bed" and c.night != null else (c.yard[0] if not c.yard.is_empty() else _xz(o.pos))
				_put(c, at, _rng.randf() * TAU)
				c.sleep = m == "bed"
			_:
				var at2 := _xz(o.pos) + Vector2(sin(o.yaw + 2.2), cos(o.yaw + 2.2)) * float(c.data.follow)
				_put(c, life.snap(at2), o.yaw)
		c.owner_was = o.state
		if c.creature: c.creature.reset()

func _put(c: Dictionary, at: Vector2, yaw: float) -> void:
	c.pos = Vector3(at.x, life.world.height_at(at.x, at.y), at.y)
	c.yaw = yaw

static func _xz(v: Vector3) -> Vector2: return Vector2(v.x, v.z)

# what the owner's doing decides what the pet does
func _mode(c: Dictionary) -> String:
	var o: Dictionary = c.owner
	var goes_in: bool = c.data.get("inside", false)
	if o.state == "inside" or o.state == "door_in":
		var night: bool = o.act == "sleep" and c.night != null
		if o.state == "inside" and night: return "bed"
		if goes_in and o.inside != "lighthouse": return "door" if c.inside == "" else "in"
		return "yard" if o.inside == o.home or o.get("enter_house", o.home) == o.home else "wait"
	return "follow"

# ======================================================================
# the frame
# ======================================================================
func update(sim: float, dt: float, cam: Camera3D, planes: Array, cp: Vector3) -> void:
	_frame += 1
	_searched = false
	var n := clampi(ceili(sim / 0.1), 1, 8)
	var h := sim / n
	for c in pets:
		# view and distance (as the people)
		var full: bool = life.headless
		if life.away or c.inside != "": c.seen = false; c.cam_d = 1e9
		elif cam:
			var ctr: Vector3 = c.pos + Vector3(0, 0.4, 0)
			var seen := true
			for pl in planes:
				if pl.distance_to(ctr) > 1.5: seen = false; break
			c.seen = seen
			c.cam_d = cp.distance_to(ctr)
			full = seen and c.cam_d < TownLife.FAR
		for s in n: _tick(c, h, full)
		if c.creature: _show(c, dt)

func _tick(c: Dictionary, dt: float, full: bool) -> void:
	var o: Dictionary = c.owner
	if not c.bubble.is_empty() and not c.bubble.has("delay"):
		c.bubble.t -= dt
		if c.bubble.t <= 0.0: c.bubble = {}
	var m := _mode(c)
	var was: String = c.owner_was
	c.owner_was = o.state
	if c.talking:
		c.v = damp(c.v, 0.0, 8.0, dt)
		return
	# coming out behind the owner
	if c.inside != "" and m == "follow":
		if o.state == "door_out" and float(o.beat_t) < 0.5: return
		_out_of_door(c, c.inside)
	if m != c.mode:
		_mode_change(c, c.mode, m)
		c.mode = m
	match m:
		"in": c.v = 0.0
		"door": _to_door(c, dt, full)
		"bed": _bed(c, dt, full)
		"yard", "wait": _yard(c, dt, full)
		"follow": _follow(c, dt, full)
	if was != o.state and o.state == "door_out" and c.inside == "" and c.species == "doduo":
		# Ben's back out: the bird runs over, happy
		c.extra = {"kind": "greet", "t": 0.0}
		if c.creature and c.seen: c.creature.mood("happy")
		_say_pet(c, 2.0)

func _mode_change(c: Dictionary, from: String, to: String) -> void:
	c.path = PackedVector2Array(); c.path_to = Vector2(INF, INF)
	c.extra = {}
	if from == "bed" and c.sleep:
		c.sleep = false
		if c.creature and c.seen: c.creature.mood("hop")

func _out_of_door(c: Dictionary, h: String) -> void:
	var o: Dictionary = c.owner
	c.inside = ""
	if life.houses.has(h):
		var hs: Dictionary = life.houses[h]
		var n: Vector2 = hs.normal
		var dr: Vector3 = hs.door_raw
		var at := Vector2(dr.x, dr.y) - n * 0.5 + Vector2(-n.y, n.x) * 0.25
		_put(c, at, atan2(n.x, n.y))
	else:
		_put(c, _xz(o.pos), o.yaw)
	c.v = 0.3
	c.sleep = false
	c.path = PackedVector2Array(); c.path_to = Vector2(INF, INF)
	if c.creature:
		c.creature.position = c.pos; c.creature.rotation.y = c.yaw
		c.creature.reset()

# ---------- what it does ----------
func _follow(c: Dictionary, dt: float, full: bool) -> void:
	var o: Dictionary = c.owner
	var op := _xz(o.pos)
	var of := Vector2(sin(o.yaw), cos(o.yaw))
	var right := Vector2(-of.y, of.x)
	var walking: bool = o.state in ["walk", "wait_path", "door_out", "chase"] and o.v > 0.2
	var here := _xz(c.pos)
	var dd := here.distance_to(op)
	var fol: float = c.data.follow
	c.look = null
	if c.sleep and (walking or dd > 2.5):
		c.sleep = false
		if c.creature and c.seen: c.creature.mood("hop")
	# far from Ben while he stands: he calls, and the bird comes running
	if c.species == "doduo" and not walking and dd > 9.0 and c.extra.is_empty():
		c.call_cd = float(c.get("call_cd", 0.0)) - dt
		if c.call_cd <= 0.0:
			c.call_cd = _rng.randf_range(40, 80)
			life.say(o, _pick(c.data.get("call", c.data.owner_barks)), 2.2)
			if c.creature and c.seen: c.creature.mood("call")
	# Doduo's own business while Ben stands and works
	if c.species == "doduo" and not walking and _doduo_extra(c, dt, full): return
	var tgt: Vector2
	var vmax: float = c.data.speed
	if walking:
		c.stand_t = 0.0
		c.still_t = 0.0
		c.met = false
		if c.species == "doduo":
			tgt = op + right * float(c.data.side) * c.side + of * 0.3      # alongside
		else:
			tgt = op - of * fol + right * float(c.data.side) * c.side    # behind, to one side
		vmax = c.data.hurry if dd > fol * 3.0 + 1.5 else minf(float(c.data.hurry), maxf(float(c.data.speed), o.v * 1.05))
	else:
		# beside them, a little in front, where they can see it
		if c.stand_t <= 0.0 or c.spot == null:
			c.side = 1.0 if (here - op).dot(right) >= 0.0 else -1.0
			c.spot = _beside(op, of, right, c.side, fol)
		c.stand_t += dt
		tgt = c.spot
		vmax = c.data.hurry if dd > 4.0 else c.data.speed
		if here.distance_to(tgt) < 0.35 or (dd < fol + 0.5 and here.distance_to(tgt) < 0.9):
			c.face = atan2(op.x - here.x, op.y - here.y)
			c.look = o.pos + Vector3(0, 1.2 if o.age == "kid" else 1.6, 0)
			c.still_t += dt
			_owner_moment(c, dt)
			# a nap in the evening while she stays put
			if c.species == "caterpie" and life.clock.hour() >= 19.0 and c.still_t > 25.0 and c.extra.is_empty(): c.sleep = true
	_go(c, tgt, vmax, dt, full)
	_barks(c, dt)

func _beside(op: Vector2, of: Vector2, right: Vector2, side: float, fol: float) -> Vector2:
	for s in [side, -side]:
		for a in [0.9, 0.5, 1.4]:
			var d := of.rotated(-a * s)
			var p := op + d * fol
			if life.walkable(p) and life._clear(op, p, 99.0): return p
	return life.snap(op - of * fol)

# Lily and Nibbles; Ben and Doduo: small moments while they stand together
func _owner_moment(c: Dictionary, dt: float) -> void:
	var o: Dictionary = c.owner
	if c.still_t < 1.5: return
	if not c.met:
		c.met = true
		if c.creature and c.seen: c.creature.mood("hop" if c.species == "caterpie" else "happy")
	c.pat_cd -= dt
	if c.pat_cd > 0.0 or o.state != "act" or not o.bubble.is_empty(): return
	c.pat_cd = _rng.randf_range(35, 80)
	var here := _xz(c.pos)
	var op := _xz(o.pos)
	o.face = atan2(here.x - op.x, here.y - op.y)
	var a = o.get("actor")
	if c.species == "caterpie" and a != null and c.seen and o.cam_d < 30.0 and (_rng.randf() < 0.7 or force_pat) and not a.idles.busy:
		# crouch down to pat him: she turns to him; he wiggles when the hand comes down
		a.idles.force("crouch", 6.5)
		c.extra = {"kind": "patted", "t": 0.0}
		# into reach of her right hand
		var fy: float = o.face - 0.45
		c.spot = life.snap(op + Vector2(sin(fy), cos(fy)) * 0.42)
		life.say(o, _pick(c.data.get("owner_pat", c.data.owner_barks)), 2.6)
	else:
		life.say(o, _pick(c.data.owner_barks), 2.4)
		if c.creature and c.seen: c.creature.mood("happy" if _rng.randf() < 0.6 else "talk")
		if _rng.randf() < 0.5: _say_pet(c, 1.8, 0.9)

func _doduo_extra(c: Dictionary, dt: float, full: bool) -> bool:
	var o: Dictionary = c.owner
	var e: Dictionary = c.extra
	var op := _xz(o.pos)
	var here := _xz(c.pos)
	if e.is_empty():
		c.extra_cd -= dt
		var working: bool = String(o.act).begins_with("work") and o.state == "act"
		if c.extra_cd <= 0.0 and working and here.distance_to(op) < 6.0:
			c.extra_cd = _rng.randf_range(40, 100)
			var x := _rng.randf()
			if x < 0.35:
				# a playful lap round Ben
				var r := _rng.randf_range(3.5, 5.0)
				var a0 := atan2(here.x - op.x, here.y - op.y)
				c.extra = {"kind": "lap", "a": a0, "left": TAU, "r": r, "dir": -1.0 if _rng.randf() < 0.5 else 1.0}
				_say_pet(c, 1.8)
			else:
				# trots off to see about something, then comes back
				for k in 8:
					var p := op + Vector2.from_angle(_rng.randf() * TAU) * _rng.randf_range(4.0, 8.0)
					if life.walkable(p) and life._wat(p) > 1.0:
						c.extra = {"kind": "trot", "to": p, "t": 0.0, "stay": _rng.randf_range(4.0, 9.0)}
						break
		elif working:
			# works the furrow beside him: a few steps along now and then, pecking
			c.spot_t -= dt
			if c.spot == null or c.spot_t <= 0.0 or op.distance_to(c.spot) > 3.5:
				c.spot_t = _rng.randf_range(5.0, 11.0)
				var p := op + Vector2.from_angle(_rng.randf() * TAU) * _rng.randf_range(1.3, 2.6)
				c.spot = p if life.walkable(p) else life.snap(op + Vector2(1.5, 0))
			var near: bool = here.distance_to(c.spot) < 0.4
			_go(c, c.spot, 1.1, dt, full)
			if near:
				c.peck_t -= dt
				if c.peck_t <= 0.0:
					c.peck_t = _rng.randf_range(1.5, 4.0)
					if c.creature and c.seen: c.creature.mood("peck")
				c.look = o.pos + Vector3(0, 1.5, 0) if _rng.randf() < 0.01 else c.look
			_barks(c, dt)
			return true
		return false
	match e.kind:
		"lap":
			var step: float = c.v / float(e.r) * dt
			e.a = float(e.a) + step * float(e.dir)
			e.left = float(e.left) - step
			var p := op + Vector2(sin(e.a), cos(e.a)) * float(e.r)
			var ahead := op + Vector2(sin(e.a + 0.5 * e.dir), cos(e.a + 0.5 * e.dir)) * float(e.r)
			if not life.walkable(ahead) or not life.walkable(p) or e.left <= 0.0:
				c.extra = {}
				return false
			_go(c, ahead, 3.2, dt, full)
			return true
		"trot":
			e.t = float(e.t) + dt
			var to: Vector2 = e.to
			if here.distance_to(to) > 0.5 and e.t < 20.0:
				_go(c, to, 2.0, dt, full)
			else:
				e.stay = float(e.stay) - dt
				c.v = damp(c.v, 0.0, 6.0, dt)
				c.peck_t -= dt
				if c.peck_t <= 0.0:
					c.peck_t = _rng.randf_range(1.2, 2.5)
					if c.creature and c.seen: c.creature.mood("peck")
				if e.stay <= 0.0:
					c.extra = {}
					if _rng.randf() < 0.5:
						life.say(o, _pick(c.data.get("call", c.data.owner_barks)), 2.2)
						if c.creature and c.seen: c.creature.mood("call")
			return true
		"greet":
			e.t = float(e.t) + dt
			if e.t > 4.0: c.extra = {}
			return false
	return false

func _to_door(c: Dictionary, dt: float, full: bool) -> void:
	var o: Dictionary = c.owner
	var h: String = o.inside if o.inside != "" else String(o.get("enter_house", o.home))
	var d := life.door_of(h)
	var at := Vector2(d.x, d.y)
	c.look = null
	_go(c, at, c.data.hurry, dt, full)
	if o.state == "inside" and _xz(c.pos).distance_to(at) < 1.2:
		c.inside = h
		c.v = 0.0
		c.path = PackedVector2Array()

func _bed(c: Dictionary, dt: float, full: bool) -> void:
	if c.inside != "":
		# out of the house to its own bed for the night
		_out_of_door(c, c.inside)
	var at: Vector2 = c.night
	if _xz(c.pos).distance_to(at) > 0.4 and not c.sleep:
		_go(c, at, c.data.speed, dt, full)
	else:
		c.v = damp(c.v, 0.0, 6.0, dt)
		c.sleep = true
	c.look = null

func _yard(c: Dictionary, dt: float, full: bool) -> void:
	# pottering about by the door while the owner is in
	c.look = null
	if c.yard.is_empty():
		var o: Dictionary = c.owner
		var d := life.door_of(o.inside if o.inside != "" else o.home)
		c.yard = [life.snap(Vector2(d.x, d.y) + Vector2(1.5, 1.5))]
	c.spot_t -= dt
	if c.spot == null or c.spot_t <= 0.0:
		c.spot_t = _rng.randf_range(10.0, 30.0)
		var base: Vector2 = c.yard[_rng.randi() % c.yard.size()]
		var p := base + Vector2.from_angle(_rng.randf() * TAU) * _rng.randf_range(0.0, 1.5)
		c.spot = p if life.walkable(p) else base
	if _xz(c.pos).distance_to(c.spot) > 0.4:
		_go(c, c.spot, 1.0, dt, full)
	else:
		c.v = damp(c.v, 0.0, 6.0, dt)
		c.peck_t -= dt
		if c.peck_t <= 0.0:
			c.peck_t = _rng.randf_range(2.0, 6.0)
			if c.creature and c.seen: c.creature.mood("peck" if _rng.randf() < 0.75 else "stamp")
	_barks(c, dt)

# ---------- moving ----------
func _go(c: Dictionary, tgt: Vector2, vmax: float, dt: float, full: bool) -> void:
	var here := _xz(c.pos)
	var d := here.distance_to(tgt)
	c.face = NAN
	var acc: float = c.sp.acc
	var want_v := clampf((d - 0.12) * 1.8, 0.0, vmax)
	if c.creature and c.creature.busy(): want_v = 0.0
	c.v = damp(c.v, want_v, acc, dt)
	if d < 0.12 or c.v < 0.01: return
	# the way: straight when the grid sees through, else a path (searched when the grid is free)
	var way := tgt
	c.force_path = maxf(0.0, float(c.get("force_path", 0.0)) - dt)
	if c.force_path > 0.0 or not _clear(here, tgt):
		var stale: bool = c.path.is_empty() or (c.path_to as Vector2).distance_to(tgt) > 1.2
		c.path_t -= dt
		if stale and c.path_t <= 0.0 and _can_search():
			c.path = life.find_path(here, tgt)
			c.path_to = tgt
			c.pi = 0
			c.path_t = 0.8
			stats.paths += 1
		if not c.path.is_empty():
			while c.pi < c.path.size() - 1 and (here.distance_to(c.path[c.pi]) < 0.3 or _clear(here, c.path[mini(c.pi + 1, c.path.size() - 1)])):
				c.pi += 1
			way = c.path[mini(c.pi, c.path.size() - 1)]
		else:
			way = here   # waiting for a path
	else:
		c.path = PackedVector2Array()
	var dir := way - here
	if dir.length() < 1e-4: return
	dir = dir.normalized()
	if not full:
		# far or out of view: along the way points, no steering
		var step: float = c.v * dt
		var at := here
		while step > 1e-4:
			var seg := way - at
			var sl := seg.length()
			if sl < 1e-4: break
			if sl <= step:
				at = way; step -= sl
				if not c.path.is_empty() and c.pi < c.path.size() - 1:
					c.pi += 1; way = c.path[c.pi]
				else: break
			else:
				at += seg / sl * step; step = 0.0
			c.yaw = atan2(seg.x, seg.y)
		if life.walkable(at): c.pos = Vector3(at.x, life.world.height_at(at.x, at.y), at.y)
		return
	# keep clear of people and the player (a pet gives way)
	var push := Vector2.ZERO
	for p in life.people:
		if p.state == "inside" or p == c.owner and d > 1.0: continue
		var dv: Vector2 = here - _xz(p.pos)
		var dl := dv.length()
		var rr: float = float(c.sp.r) + 0.4
		if dl < rr and dl > 1e-3: push += dv / dl * (rr - dl) * 2.0
	if not life.headless and not life.away:
		var me := Vector2(life.game.pos.x, life.game.pos.z)
		var dm := here.distance_to(me)
		var rr2: float = float(c.sp.r) + 0.45
		if dm < rr2 and dm > 1e-3: push += (here - me) / dm * (rr2 - dm) * 2.0
	var want := (dir + push).normalized()
	c.yaw = wrapf(c.yaw + wrapf(atan2(want.x, want.y) - c.yaw, -PI, PI) * (1.0 - exp(-dt * float(c.sp.turn))), -PI, PI)
	var fwd := Vector2(sin(c.yaw), cos(c.yaw))
	var mv: Vector2 = (fwd * 0.75 + want * 0.25).normalized() * c.v * dt
	# along its heading; where that is blocked, straight for the way point, then a little to either side
	var np2: Vector3 = c.pos
	var ln := mv.length()
	for cand in [mv, dir * ln, dir.rotated(0.6) * ln, dir.rotated(-0.6) * ln]:
		var q: Vector3 = life.world.step(c.pos, cand.x, cand.y)
		if life.walkable(Vector2(q.x, q.z)) and Vector2(q.x - c.pos.x, q.z - c.pos.z).length() > ln * 0.3:
			np2 = q
			break
	if np2 == c.pos: stats.blocked += 1
	np2.y = life.world.height_at(np2.x, np2.z)
	c.pos = np2
	# no progress toward the way point for a while: by the grid's path, then onto the middle
	# of its cell (clear of everything), then a hop onto the way point
	var nd := Vector2(np2.x, np2.z).distance_to(way)
	if (c.get("best_way", Vector2(INF, INF)) as Vector2).distance_to(way) > 0.3:
		c.best_way = way; c.best = nd
	if nd < c.best - 0.15:
		c.best = nd; c.stuck = 0.0; c.nudged = false
	elif c.v > 0.1:
		c.stuck += dt
	if c.stuck > 2.0 and c.force_path <= 0.0 and c.stuck < 2.5:
		c.path = PackedVector2Array(); c.path_t = 0.0; c.force_path = 5.0
	if c.stuck > 3.5 and not c.get("nudged", false):
		c.nudged = true
		_put(c, life.centre(life.nearest_free(life.cell(here))), c.yaw)
		c.path = PackedVector2Array(); c.path_t = 0.0; c.force_path = 5.0
		stats.nudges = int(stats.get("nudges", 0)) + 1
	if c.stuck > 7.0:
		_put(c, life.snap(way), c.yaw)
		stats.hops += 1
		if log.size() < 40: log.append("%s hop at (%.1f, %.1f) mode %s to (%.1f, %.1f) way (%.1f, %.1f) path %d %s" % [c.id, here.x, here.y, c.mode, tgt.x, tgt.y, way.x, way.y, c.path.size(), life.clock.time_text()])
		c.stuck = 0.0; c.nudged = false; c.best = INF

# a straight line over free cells only (finer than the grid's own check: no corner cut)
func _clear(a: Vector2, b: Vector2) -> bool:
	var n := int(a.distance_to(b) / 0.12) + 1
	for k in range(1, n + 1):
		if not life.walkable(a.lerp(b, float(k) / n)): return false
	return true

func _can_search() -> bool:
	if _searched: return false
	if not life.headless and life._job >= 0: return false   # the grid's search state is the worker's just now
	_searched = true
	return true

static func damp(v: float, to: float, k: float, dt: float) -> float:
	return v + (to - v) * (1.0 - exp(-dt * k))

# ---------- the creature ----------
func _show(c: Dictionary, dt: float) -> void:
	var cr: Creature = c.creature
	var vis: bool = c.seen and c.inside == "" and c.cam_d < 60.0
	if cr.visible != vis:
		cr.visible = vis
		if vis: cr.reset()
	if not vis: return
	# turning to face its owner / the player while standing
	if not is_nan(c.face) and c.v < 0.1:
		c.yaw = wrapf(c.yaw + wrapf(c.face - c.yaw, -PI, PI) * (1.0 - exp(-dt * 2.5)), -PI, PI)
	cr.position = c.pos
	cr.rotation.y = c.yaw
	cr.sleep = c.sleep
	var me: Vector3 = life.game.pos
	var look = c.look
	if c.talking or (me.distance_to(c.pos) < 3.0 and not c.sleep and c.v < 0.3):
		look = me + Vector3(0, 1.45, 0)
	cr.look_at_pos = look if look != null else Vector3(NAN, NAN, NAN)
	if c.extra.get("kind", "") == "patted":
		c.extra.t = float(c.extra.t) + dt
		if c.extra.t > 2.6 and not c.extra.get("done", false):
			c.extra.done = true
			cr.mood("happy")
			_say_pet(c, 1.6)
		if c.extra.t > 6.5: c.extra = {}
	c.acc += dt
	var every := 1 if c.cam_d < 18.0 else (2 if c.cam_d < 35.0 else 3)
	if (_frame + c.idx) % every == 0:
		var t0 := Time.get_ticks_usec()
		cr.animate(c.acc, c.v)
		c.acc = 0.0
		life._anim_us += Time.get_ticks_usec() - t0

# ---------- words ----------
func _pick(a: Array) -> String:
	return String(a[_rng.randi() % a.size()]) if not a.is_empty() else ""

func _say_pet(c: Dictionary, secs: float, delay := 0.0) -> void:
	var b: Array = c.data.get("barks", [])
	if b.is_empty(): return
	c.bubble = {"text": _pick(b), "t": secs}
	if delay > 0.0: c.bubble.delay = delay

func _barks(c: Dictionary, dt: float) -> void:
	c.bark_cd -= dt
	if c.bark_cd > 0.0 or c.sleep: return
	c.bark_cd = _rng.randf_range(25, 70)
	if c.seen and c.cam_d < 20.0: _say_pet(c, 1.6)

# ---------- the player ----------
func nearest_talk(me: Vector3, fx: float, fz: float, maxd := 2.2) -> Dictionary:
	var best := {}
	var bd := maxd
	for c in pets:
		if c.inside != "" or not c.seen: continue
		var dx: float = c.pos.x - me.x
		var dz: float = c.pos.z - me.z
		var dd := sqrt(dx * dx + dz * dz)
		if dd < minf(bd, float(c.sp.talk_r)) and (dx * fx + dz * fz) / maxf(dd, 1e-4) > 0.2:
			best = c; bd = dd
	return best

func talk_at(c: Dictionary) -> Vector3:
	return c.pos + Vector3(0, float(c.sp.talk_h), 0)

func begin_talk(c: Dictionary) -> Array:
	c.talking = true
	c.v = 0.0
	c.bubble = {}
	var me: Vector3 = life.game.pos
	c.face = atan2(me.x - c.pos.x, me.z - c.pos.z)
	if not c.sleep: c.yaw = wrapf(c.yaw + wrapf(c.face - c.yaw, -PI, PI) * 0.5, -PI, PI)
	if c.creature and not c.sleep:
		var mo := "happy" if _rng.randf() < 0.5 else "talk"
		if c.species == "doduo" and _rng.randf() < 0.4: mo = "argue"
		c.creature.mood(mo)
	var e: Dictionary = c.data
	var q: Quests = life.quests
	var per := life.clock.period()
	var key := "asleep" if c.sleep else ""
	var lines := []
	var qk := ""
	if not c.sleep:
		if q.flag("butterfree_tips") and e.get("quest", {}).has("butterfree_tips"): qk = "butterfree_tips"
		else:
			for k in e.get("quest", {}):
				var parts := String(k).split(":")
				if parts.size() == 2 and q.state(parts[0]) == parts[1]: qk = k
	if qk != "" and _rng.randf() < 0.7: lines = _as_lines(_pick_any(e.quest[qk]))
	else: lines = _as_lines(_pick_any(_pool(e.talk, key, per)))
	# the owner chimes in when near
	var o: Dictionary = c.owner
	if o.state != "inside" and _xz(o.pos).distance_to(_xz(c.pos)) < 7.0 and o.state != "talk":
		var ol := []
		if qk != "" and e.get("quest_owner", {}).has(qk) and _rng.randf() < 0.7: ol = _as_lines(_pick_any(e.quest_owner[qk]))
		else: ol = _as_lines(_pick_any(_pool(e.owner_talk, key, per)))
		lines.append_array(ol)
		o.face = atan2(c.pos.x - o.pos.x, c.pos.z - o.pos.z)
	return lines

func end_talk(c: Dictionary) -> void:
	c.talking = false
	c.face = NAN

func _pool(d: Dictionary, key: String, per: String) -> Array:
	if key != "" and d.has(key): return d[key]
	var out: Array = d.get("any", []).duplicate()
	if d.has(per) and _rng.randf() < 0.5: return d[per]
	return out

func _pick_any(a: Array) -> Variant:
	return a[_rng.randi() % a.size()] if not a.is_empty() else "..."

static func _as_lines(v: Variant) -> Array:
	if v is Array: return (v as Array).map(func(x): return String(x))
	return [String(v)]
